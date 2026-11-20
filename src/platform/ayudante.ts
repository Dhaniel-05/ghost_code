// Responsabilidad: gestionar el proceso ghost-viewer (arranque, comandos, eventos, cierre limpio y recuperación).
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Comando, Evento, LectorLineas, VERSION_PROTOCOLO, codificar, decodificarComando, decodificarEvento } from './protocolo';

export type CodigoError =
  | 'ruta-no-absoluta'
  | 'no-existe'
  | 'no-es-archivo'
  | 'no-arranca'
  | 'salio-antes-de-listo'
  | 'tiempo-agotado'
  | 'protocolo-incompatible'
  | 'comando-invalido'
  | 'cerrado';

export class ErrorAyudante extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAyudante';
  }
}

export type EstadoAyudante = 'detenido' | 'iniciando' | 'listo' | 'reiniciando' | 'fallido';

/** Cosas que pasan y no son eventos del visor: para el canal de salida o para avisar a la persona. */
export type AvisoAyudante =
  | { tipo: 'linea-invalida'; motivo: string; linea: string }
  | { tipo: 'linea-descartada'; motivo: string }
  | { tipo: 'stderr'; texto: string }
  | { tipo: 'salida-inesperada'; codigo: number | null; senal: string | null }
  | { tipo: 'reiniciando'; intento: number }
  | { tipo: 'agotado'; intentos: number }
  | { tipo: 'sin-proteccion' }
  | { tipo: 'error-en-manejador'; mensaje: string };

export interface OpcionesAyudante {
  /** Ruta absoluta del ejecutable. */
  ruta: string;
  argumentos?: string[];
  /** Espera máxima por el evento `listo` (por defecto 10 000). */
  tiempoListoMs?: number;
  /** Espera máxima a que salga solo después de `cerrar` y de cerrar stdin; luego se mata (por defecto 2000). */
  tiempoCierreMs?: number;
  /** Reinicios automáticos tras una salida inesperada (por defecto 2). */
  reintentos?: number;
  /** Espera antes de cada reinicio (por defecto 500). */
  esperaReinicioMs?: number;
  alEvento?: (evento: Evento) => void;
  alAviso?: (aviso: AvisoAyudante) => void;
}

type EventoListo = Extract<Evento, { tipo: 'listo' }>;

/** Un proceso lanzado: lo que se sabe de él mientras vive. */
interface Proceso {
  hijo: ChildProcess;
  listo: boolean;
  /** Ya salió y se cerraron sus flujos. */
  terminado: boolean;
  /** Lo matamos nosotros (plazo vencido o protocolo incompatible). */
  matado: boolean;
  /** Se le pidió cerrar con el comando `cerrar`. */
  cierreSolicitado: boolean;
  alTerminar: Array<() => void>;
}

/** Lo último que se mandó de cada cosa: se reenvía si el ayudante se reinicia. */
interface Memoria {
  tema?: Comando & { tipo: 'tema' };
  guia?: Comando & { tipo: 'cargarGuia' };
  seleccion?: Comando & { tipo: 'seleccionarBloque' };
  alFrente?: Comando & { tipo: 'siempreAlFrente' };
  visible?: boolean;
}

/** Comprueba la ruta del ejecutable sin lanzarlo. Lanza ErrorAyudante (`ruta-no-absoluta`, `no-existe`, `no-es-archivo`). */
export function validarRutaBinario(ruta: string): void {
  if (typeof ruta !== 'string' || ruta === '' || ruta.includes('\u0000') || !path.isAbsolute(ruta)) {
    throw new ErrorAyudante('ruta-no-absoluta', 'La ruta de ghost-viewer debe ser una ruta absoluta válida.');
  }
  let info: fs.Stats;
  try {
    info = fs.statSync(ruta);
  } catch {
    throw new ErrorAyudante(
      'no-existe',
      `No se encontró ghost-viewer en «${ruta}». ¿Ya compilaste el ayudante (helper/ghost-viewer) y lo copiaste a bin/win32-x64?`,
    );
  }
  if (!info.isFile()) throw new ErrorAyudante('no-es-archivo', `«${ruta}» no es un archivo: se esperaba el ejecutable ghost-viewer.`);
}

export class Ayudante {
  private estadoActual: EstadoAyudante = 'detenido';
  private proceso: Proceso | undefined;
  private promesaInicio: Promise<EventoListo> | undefined;
  private detencion: Promise<void> | undefined;
  private deteniendo = false;
  private temporizadorReinicio: NodeJS.Timeout | undefined;
  private reintentosUsados = 0;
  private ultimoListo: EventoListo | undefined;
  private proteccion = true;
  private memoria: Memoria = {};
  private esperando: Array<{ resolver: (l: EventoListo) => void; rechazar: (e: Error) => void }> = [];

  private readonly tiempoListoMs: number;
  private readonly tiempoCierreMs: number;
  private readonly reintentos: number;
  private readonly esperaReinicioMs: number;

  constructor(private readonly opciones: OpcionesAyudante) {
    this.tiempoListoMs = opciones.tiempoListoMs ?? 10000;
    this.tiempoCierreMs = opciones.tiempoCierreMs ?? 2000;
    this.reintentos = opciones.reintentos ?? 2;
    this.esperaReinicioMs = opciones.esperaReinicioMs ?? 500;
  }

  get estado(): EstadoAyudante {
    return this.estadoActual;
  }

  /** Falso si el último `listo` dijo `afinidad: false`: entonces nunca se le envía `mostrar`. */
  get proteccionActiva(): boolean {
    return this.proteccion;
  }

  /** Lanza el proceso y espera `listo`. Si ya está listo o iniciando, devuelve lo mismo sin crear otro proceso. */
  iniciar(): Promise<EventoListo> {
    if (this.detencion) return this.detencion.then(() => this.iniciar());
    if (this.estadoActual === 'listo' && this.ultimoListo) return Promise.resolve(this.ultimoListo);
    if (this.promesaInicio) return this.promesaInicio;
    if (this.estadoActual === 'reiniciando') return this.esperarListo();

    this.reintentosUsados = 0;
    this.estadoActual = 'iniciando';
    this.promesaInicio = this.lanzar().then(
      (listo) => {
        this.promesaInicio = undefined;
        return listo;
      },
      (error) => {
        this.promesaInicio = undefined;
        this.estadoActual = 'fallido';
        throw error;
      },
    );
    return this.promesaInicio;
  }

  /**
   * Envía un comando. Falso si no hay ayudante vivo (detenido, fallido). Lanza ErrorAyudante `comando-invalido` si el comando no es válido.
   * Mientras se reinicia devuelve verdadero: el estado se recuerda y se reenvía al volver.
   */
  enviar(comando: Comando): boolean {
    let linea: string;
    try {
      linea = codificar(comando);
    } catch (e) {
      throw new ErrorAyudante('comando-invalido', (e as Error).message);
    }
    const limpio = (decodificarComando(linea) as { ok: true; mensaje: Comando }).mensaje;
    const estado = this.estadoActual;
    if (estado !== 'listo' && estado !== 'reiniciando') return false;
    // Sin protección de captura no se muestra nada: ni siquiera se recuerda para después
    if (limpio.tipo === 'mostrar' && !this.proteccion) return false;

    this.recordar(limpio);
    if (estado === 'reiniciando') return true;
    const p = this.proceso;
    if (!p) return false;
    if (limpio.tipo === 'cerrar') p.cierreSolicitado = true;
    return this.escribir(p, linea);
  }

  /** Cierre limpio: `cerrar`, cierra stdin, espera y, si no sale, lo mata. Se puede llamar varias veces y sin haber iniciado. */
  detener(): Promise<void> {
    if (this.detencion) return this.detencion;
    this.deteniendo = true;
    if (this.temporizadorReinicio) {
      clearTimeout(this.temporizadorReinicio);
      this.temporizadorReinicio = undefined;
    }
    const p = this.proceso;
    this.detencion = (async () => {
      if (p && !p.terminado) await this.cerrar(p);
      this.proceso = undefined;
      this.estadoActual = 'detenido';
      this.ultimoListo = undefined;
      this.memoria = {};
      this.rechazarEsperas(new ErrorAyudante('cerrado', 'El ayudante se detuvo.'));
    })().finally(() => {
      this.detencion = undefined;
      this.deteniendo = false;
    });
    return this.detencion;
  }

  // ---------------------------------------------------------------------------------------------
  // Arranque y salida

  private lanzar(): Promise<EventoListo> {
    return new Promise<EventoListo>((resolver, rechazar) => {
      validarRutaBinario(this.opciones.ruta);
      let hijo: ChildProcess;
      try {
        hijo = spawn(this.opciones.ruta, this.opciones.argumentos ?? [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch (e) {
        throw new ErrorAyudante('no-arranca', `No se pudo lanzar ghost-viewer: ${(e as Error).message}`);
      }
      const p: Proceso = { hijo, listo: false, terminado: false, matado: false, cierreSolicitado: false, alTerminar: [] };
      this.proceso = p;

      let resuelto = false;
      const fallar = (error: Error) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(plazo);
        rechazar(error);
      };
      const acertar = (listo: EventoListo) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(plazo);
        resolver(listo);
      };
      const plazo = setTimeout(() => {
        if (p.listo) return;
        this.matar(p);
        fallar(new ErrorAyudante('tiempo-agotado', `ghost-viewer no avisó que estaba listo en ${this.tiempoListoMs} ms.`));
      }, this.tiempoListoMs);

      const lector = new LectorLineas((linea) => this.alRecibirLinea(p, linea, acertar, fallar), {
        alDescartar: (motivo) => this.avisar({ tipo: 'linea-descartada', motivo }),
      });
      hijo.stdout?.on('data', (trozo: Buffer) => lector.agregar(trozo));
      hijo.stdout?.on('end', () => lector.terminar());
      hijo.stderr?.on('data', (trozo: Buffer) => this.avisar({ tipo: 'stderr', texto: trozo.toString('utf8') }));
      hijo.stdin?.on('error', () => undefined); // escribir a un proceso que ya murió (EPIPE) no debe tumbar nada
      hijo.on('error', (e) => fallar(new ErrorAyudante('no-arranca', `No se pudo lanzar ghost-viewer: ${e.message}`)));
      hijo.on('close', (codigo, senal) => this.alSalir(p, codigo, senal, fallar));
    });
  }

  private alRecibirLinea(p: Proceso, linea: string, acertar: (l: EventoListo) => void, fallar: (e: Error) => void): void {
    const r = decodificarEvento(linea);
    if (!r.ok) {
      this.avisar({ tipo: 'linea-invalida', motivo: r.error, linea: linea.slice(0, 200) });
      return;
    }
    const evento = r.mensaje;
    if (evento.tipo === 'listo' && !p.listo) {
      if (evento.protocolo !== VERSION_PROTOCOLO) {
        this.matar(p);
        fallar(new ErrorAyudante('protocolo-incompatible', `ghost-viewer habla el protocolo ${evento.protocolo} y la extensión el ${VERSION_PROTOCOLO}.`));
        return;
      }
      p.listo = true;
      this.ultimoListo = evento;
      this.proteccion = evento.afinidad;
      this.estadoActual = 'listo';
      if (!evento.afinidad) this.avisar({ tipo: 'sin-proteccion' });
      this.reenviarMemoria(p);
      acertar(evento);
      this.entregarEsperas(evento);
    }
    this.entregar(evento);
  }

  private alSalir(p: Proceso, codigo: number | null, senal: NodeJS.Signals | null, fallar: (e: Error) => void): void {
    p.terminado = true;
    if (this.proceso === p) this.proceso = undefined;
    if (!p.listo) {
      fallar(
        this.deteniendo
          ? new ErrorAyudante('cerrado', 'El ayudante se detuvo antes de estar listo.')
          : new ErrorAyudante('salio-antes-de-listo', `ghost-viewer terminó antes de avisar que estaba listo (código ${codigo ?? senal}).`),
      );
    } else if (p.cierreSolicitado && !this.deteniendo) {
      this.estadoActual = 'detenido'; // lo cerró quien lo mandó: no es una caída
      this.ultimoListo = undefined;
    } else if (!this.deteniendo && !p.matado) {
      this.estadoActual = 'fallido';
      this.avisar({ tipo: 'salida-inesperada', codigo, senal });
      this.trasFallo();
    }
    for (const f of p.alTerminar.splice(0)) f();
  }

  /** Decide entre reiniciar (con espera) o darse por vencido. */
  private trasFallo(): void {
    if (this.deteniendo) return;
    if (this.reintentosUsados < this.reintentos) {
      this.reintentosUsados++;
      this.estadoActual = 'reiniciando';
      this.avisar({ tipo: 'reiniciando', intento: this.reintentosUsados });
      this.temporizadorReinicio = setTimeout(() => void this.relanzar(), this.esperaReinicioMs);
      return;
    }
    this.estadoActual = 'fallido';
    if (this.reintentos > 0) this.avisar({ tipo: 'agotado', intentos: this.reintentos });
    this.rechazarEsperas(new ErrorAyudante('salio-antes-de-listo', 'ghost-viewer no se pudo recuperar.'));
  }

  private async relanzar(): Promise<void> {
    this.temporizadorReinicio = undefined;
    if (this.deteniendo) return;
    try {
      await this.lanzar();
    } catch {
      this.trasFallo();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Cierre

  private async cerrar(p: Proceso): Promise<void> {
    const salio = new Promise<void>((resolver) => p.alTerminar.push(resolver));
    if (p.listo) this.escribir(p, codificar({ tipo: 'cerrar' }));
    try {
      p.hijo.stdin?.end(); // el fin de stdin también le dice al visor que debe salir
    } catch {
      /* ya estaba cerrado */
    }
    const plazo = setTimeout(() => this.matar(p), this.tiempoCierreMs);
    await salio;
    clearTimeout(plazo);
  }

  private matar(p: Proceso): void {
    if (p.terminado) return;
    p.matado = true;
    try {
      p.hijo.kill();
    } catch {
      /* ya no existe */
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Estado recordado y utilidades

  private escribir(p: Proceso, linea: string): boolean {
    const stdin = p.hijo.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) return false;
    stdin.write(linea);
    return true;
  }

  private recordar(c: Comando): void {
    const m = this.memoria;
    if (c.tipo === 'tema') m.tema = c;
    else if (c.tipo === 'cargarGuia') {
      m.guia = c;
      m.seleccion = undefined; // el índice de una guía anterior ya no vale
    } else if (c.tipo === 'seleccionarBloque') m.seleccion = c;
    else if (c.tipo === 'siempreAlFrente') m.alFrente = c;
    else if (c.tipo === 'mostrar') m.visible = true;
    else if (c.tipo === 'ocultar') m.visible = false;
  }

  /** Tras (re)arrancar: tema, guía, bloque, siempre-al-frente y, al final, la visibilidad. */
  private reenviarMemoria(p: Proceso): void {
    const m = this.memoria;
    const lista: Comando[] = [];
    if (m.tema) lista.push(m.tema);
    if (m.guia) lista.push(m.guia);
    if (m.seleccion) lista.push(m.seleccion);
    if (m.alFrente) lista.push(m.alFrente);
    if (m.visible === true && this.proteccion) lista.push({ tipo: 'mostrar' });
    else if (m.visible === false) lista.push({ tipo: 'ocultar' });
    for (const c of lista) this.escribir(p, codificar(c));
  }

  private esperarListo(): Promise<EventoListo> {
    return new Promise((resolver, rechazar) => this.esperando.push({ resolver, rechazar }));
  }

  private entregarEsperas(listo: EventoListo): void {
    for (const e of this.esperando.splice(0)) e.resolver(listo);
  }

  private rechazarEsperas(error: Error): void {
    for (const e of this.esperando.splice(0)) e.rechazar(error);
  }

  private entregar(evento: Evento): void {
    try {
      this.opciones.alEvento?.(evento);
    } catch (e) {
      this.avisar({ tipo: 'error-en-manejador', mensaje: (e as Error)?.message ?? String(e) });
    }
  }

  private avisar(aviso: AvisoAyudante): void {
    try {
      this.opciones.alAviso?.(aviso);
    } catch {
      /* un aviso mal manejado no debe afectar al ayudante */
    }
  }
}
