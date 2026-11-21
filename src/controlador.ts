// Responsabilidad: el estado de la extensión (guías, progreso, visor) y las acciones que los comandos y las vistas piden.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MotorBloques } from './core/motorBloques';
import { parsearGuia } from './core/parserGuia';
import { Bloque } from './core/tipos';
import { AyudanteLike, Dependencias } from './dependencias';
import { lenguajeDe } from './lenguajes';
import { MSG } from './mensajesExt';
import { Ayudante, AvisoAyudante, ErrorAyudante } from './platform/ayudante';
import { Evento, ModoVisor } from './platform/protocolo';
import { MENSAJES } from './typing/mensajes';
import { ResultadoAccion, SesionLive } from './typing/sesionLive';

export type ResultadoComando = ResultadoAccion | 'es-la-guia';
export type ResultadoFantasma = 'fantasma' | 'sin-editor' | 'sin-guia' | 'sin-visor';

export interface Guia {
  /** Ruta en minúsculas y normalizada: identifica la guía (en Windows no distingue mayúsculas). */
  id: string;
  ruta: string;
  nombre: string;
  lenguaje: string;
  bloques: Bloque[];
  motor: MotorBloques;
  sesion: SesionLive;
}

/** Lo que las vistas necesitan saber, en una sola foto. */
export interface VistaEstado {
  visorVisible: boolean;
  tecleando: boolean;
  sinProteccion: boolean;
  progreso: string | undefined;
  escudo: boolean;
  mostrarBarra: boolean;
  discreto: boolean;
}

const CLAVE_GUIAS = 'ghostCode.guias';
const CLAVE_ACTIVA = 'ghostCode.guiaActiva';
const MAX_BYTES = 2 * 1024 * 1024;

export const claveDeRuta = (ruta: string): string => path.normalize(ruta).toLowerCase();

export class Controlador implements vscode.Disposable {
  readonly guias = new Map<string, Guia>();
  private readonly cambio = new vscode.EventEmitter<void>();
  readonly alCambiar = this.cambio.event;

  private activaId: string | undefined;
  private ayudante: AyudanteLike | undefined;
  private iniciandoVisor: Promise<AyudanteLike | undefined> | undefined;
  private visorVisible = false;
  private escudo = false;
  private modoVisor: ModoVisor = 'normal';
  private alFrente: boolean;
  private tecleos = 0;
  private proteccionAvisada = false;
  private readonly esperas = new Set<() => void>();
  private readonly esperandoVisible = new Set<(visto: boolean) => void>();
  private readonly suscripciones: vscode.Disposable[] = [];

  constructor(
    private readonly contexto: vscode.ExtensionContext,
    private readonly deps: Dependencias,
    readonly log: vscode.OutputChannel,
  ) {
    this.alFrente = this.ajuste('visor.siempreAlFrente', true);
  }

  // ---------------------------------------------------------------------------------------------
  // Ciclo de vida

  /** Pone los contextos en su estado inicial, escucha los ajustes y el tema, y restaura las guías guardadas. */
  async iniciar(): Promise<void> {
    this.actualizarContextos();
    this.suscripciones.push(
      vscode.workspace.onDidChangeConfiguration((e) => this.alCambiarAjustes(e)),
      vscode.window.onDidChangeActiveColorTheme(() => {
        if (this.ajuste<string>('visor.tema', 'auto') === 'auto') this.enviarTema();
      }),
    );
    await this.restaurar();
  }

  /** Cierra el visor (si hay) y cancela cualquier tecleo. Se puede llamar varias veces. */
  async detener(): Promise<void> {
    this.cancelarTecleo();
    for (const r of [...this.esperandoVisible]) r(false);
    const a = this.ayudante;
    this.ayudante = undefined;
    this.visorVisible = false;
    if (a) await a.detener();
  }

  dispose(): void {
    this.suscripciones.forEach((s) => s.dispose());
    this.suscripciones.length = 0;
    this.cambio.dispose();
  }

  // ---------------------------------------------------------------------------------------------
  // Guías

  vista(): VistaEstado {
    const g = this.guiaActiva();
    let progreso: string | undefined;
    if (g) {
      const e = g.motor.estado();
      progreso = `${e.insertados}/${e.total}`;
    }
    return {
      visorVisible: this.visorVisible,
      tecleando: this.tecleos > 0,
      sinProteccion: this.ayudante ? !this.ayudante.proteccionActiva : false,
      progreso,
      escudo: this.escudo,
      mostrarBarra: this.ajuste('mostrarBarraDeEstado', true),
      discreto: this.ajuste('arbolDiscreto', false),
    };
  }

  guiaActiva(): Guia | undefined {
    return this.activaId ? this.guias.get(this.activaId) : undefined;
  }

  /** Carga una guía desde un archivo (el que se pasa, o el que se elija en el selector). */
  async cargarDesdeUri(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
      const elegido = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Cargar como guía' });
      if (!elegido || elegido.length === 0) return;
      uri = elegido[0];
    }
    const ruta = uri.fsPath;
    const texto = await this.leerArchivo(ruta);
    if (texto !== undefined) await this.agregar(ruta, texto);
  }

  /** Usa el archivo activo del editor (con lo que haya escrito, aunque no esté guardado) como guía. */
  async usarArchivoActual(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(MSG.sinArchivoActivo);
      return;
    }
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      void vscode.window.showWarningMessage(MSG.guardaPrimero);
      return;
    }
    const texto = doc.getText();
    if (Buffer.byteLength(texto) > MAX_BYTES) {
      void vscode.window.showErrorMessage(MSG.guiaGrande(path.basename(doc.uri.fsPath)));
      return;
    }
    await this.agregar(doc.uri.fsPath, texto, doc.languageId);
  }

  activar(id: string | undefined): void {
    const g = id ? this.guias.get(id) : this.guiaActiva();
    if (!g) return;
    this.activaId = g.id;
    this.guardar();
    this.cambiaLaGuiaActiva();
  }

  quitar(id: string | undefined): void {
    const g = id ? this.guias.get(id) : this.guiaActiva();
    if (!g) return;
    this.cancelarTecleo();
    this.guias.delete(g.id);
    if (this.activaId === g.id) this.activaId = [...this.guias.keys()].pop();
    this.guardar();
    this.cambiaLaGuiaActiva();
  }

  reiniciar(): void {
    const g = this.guiaActiva();
    if (!g) return;
    this.cancelarTecleo();
    g.motor.reiniciar();
    g.sesion = this.nuevaSesion(g.motor); // el historial de lo escrito ya no corresponde
    this.trasAccion();
  }

  // ---------------------------------------------------------------------------------------------
  // Live Coding

  async siguiente(): Promise<ResultadoComando> {
    const g = this.guiaParaEscribir();
    if (typeof g === 'string') return g;
    const r = await g.sesion.insertarSiguiente();
    this.trasAccion();
    return r;
  }

  async teclear(): Promise<ResultadoComando> {
    const g = this.guiaParaEscribir();
    if (typeof g === 'string') return g;
    this.marcarTecleo(+1);
    try {
      return await g.sesion.teclearSiguiente();
    } finally {
      this.marcarTecleo(-1);
      this.trasAccion();
    }
  }

  async retroceder(): Promise<ResultadoComando> {
    const g = this.guiaParaEscribir(false);
    if (typeof g === 'string') return g;
    const r = await g.sesion.retroceder();
    this.trasAccion();
    return r;
  }

  /** Detiene el tecleo en curso; las esperas pendientes se resuelven ya para que el Esc responda al instante. */
  cancelarTecleo(): void {
    for (const g of this.guias.values()) g.sesion.cancelar();
    for (const fin of [...this.esperas]) fin();
  }

  // ---------------------------------------------------------------------------------------------
  // Visor

  async alternarVisor(): Promise<void> {
    const a = await this.asegurarVisor();
    if (!a) return;
    if (!a.proteccionActiva) {
      this.avisarSinProteccion();
      return;
    }
    if (this.visorVisible) {
      a.enviar({ tipo: 'ocultar' });
      return;
    }
    this.log.appendLine('Mostrando el visor…');
    const visto = this.esperarVisible();
    a.enviar({ tipo: 'mostrar' });
    if (await visto) return;
    this.log.appendLine('El visor no respondió a «mostrar».');
    if ((await vscode.window.showWarningMessage(MSG.visorNoResponde, MSG.botonTraer)) === MSG.botonTraer) await this.recuperarVisor();
  }

  /** Escudo: cubre u descubre el código del visor. Se recuerda aunque el visor aún no esté abierto. */
  alternarEscudo(): void {
    this.escudo = !this.escudo;
    this.ayudante?.enviar({ tipo: 'escudo', valor: this.escudo });
    this.actualizarContextos();
    this.cambio.fire();
  }

  /** «Traer el visor aquí»: lo arranca si hace falta y lo restaura, lo pone en una pantalla visible y al frente. */
  async recuperarVisor(): Promise<void> {
    this.log.appendLine('Trayendo el visor…');
    const a = await this.asegurarVisor();
    if (!a) return;
    if (!a.proteccionActiva) {
      this.avisarSinProteccion();
      return;
    }
    const visto = this.esperarVisible();
    a.enviar({ tipo: 'traer' });
    if (await visto) return;
    this.log.appendLine('El visor no respondió a «traer».');
    if ((await vscode.window.showWarningMessage(MSG.visorNoRecupera, MSG.botonReiniciar)) === MSG.botonReiniciar) await this.reiniciarVisor();
  }

  /** Cierra el visor y lo arranca de cero (para cuando no responde). */
  private async reiniciarVisor(): Promise<void> {
    this.log.appendLine('Reiniciando el visor desde cero…');
    const a = this.ayudante;
    this.ayudante = undefined;
    this.visorVisible = false;
    if (a) await a.detener();
    await this.recuperarVisor();
  }

  /**
   * «Modo Fantasma»: el archivo pasa a ser la guía activa, se abre el visor y, solo cuando ya se ve, se cierra la pestaña.
   * Si el visor no se puede mostrar (sin protección de captura, no arranca…) la pestaña NO se cierra: el código no puede quedar sin ningún sitio donde verse.
   * Con `uri` (Explorador o botón de la pestaña) se usa ese archivo; sin `uri`, el del editor activo.
   */
  async modoFantasma(uri?: vscode.Uri): Promise<ResultadoFantasma> {
    const origen = await this.origenDeFantasma(uri);
    if (typeof origen === 'string') return origen;
    if (!(await this.agregar(origen.ruta, origen.texto, origen.idDeLenguaje))) return 'sin-guia';
    if (!(await this.mostrarVisor())) return 'sin-visor';
    await this.cerrarPestanas(origen.ruta, origen.doc);
    return 'fantasma';
  }

  alternarSiempreAlFrente(): void {
    this.alFrente = !this.alFrente;
    this.ayudante?.enviar({ tipo: 'siempreAlFrente', valor: this.alFrente });
  }

  /** Un clic en un bloque del árbol: se ve en el visor (si está abierto) sin mover el progreso. */
  seleccionarBloque(guiaId: string, indice: number): void {
    if (guiaId !== this.activaId && this.guias.has(guiaId)) this.activar(guiaId);
    this.ayudante?.enviar({ tipo: 'seleccionarBloque', indice });
  }

  // ---------------------------------------------------------------------------------------------
  // Internos: guías

  private async leerArchivo(ruta: string): Promise<string | undefined> {
    const nombre = path.basename(ruta);
    try {
      const info = await fs.promises.stat(ruta);
      if (info.size > MAX_BYTES) {
        void vscode.window.showErrorMessage(MSG.guiaGrande(nombre));
        return undefined;
      }
      return await fs.promises.readFile(ruta, 'utf8');
    } catch (e) {
      void vscode.window.showErrorMessage(MSG.noSeLeyo(nombre, (e as Error).message));
      return undefined;
    }
  }

  /** Convierte el archivo en guía y la deja activa. Falso (con su aviso) si no tiene bloques. */
  private async agregar(ruta: string, texto: string, idDelEditor?: string): Promise<boolean> {
    const nombre = path.basename(ruta);
    const { bloques } = parsearGuia(texto);
    if (bloques.length === 0) {
      void vscode.window.showWarningMessage(MSG.guiaVacia(nombre));
      return false;
    }
    this.cancelarTecleo();
    const id = claveDeRuta(ruta);
    const motor = new MotorBloques(bloques);
    this.guias.set(id, { id, ruta, nombre, lenguaje: lenguajeDe(ruta, idDelEditor), bloques, motor, sesion: this.nuevaSesion(motor) });
    this.activaId = id;
    this.guardar();
    this.cambiaLaGuiaActiva();
    return true;
  }

  /** De dónde sale el texto del Modo Fantasma: el documento abierto (con lo que haya escrito) o, si no está abierto, el disco. */
  private async origenDeFantasma(uri?: vscode.Uri): Promise<{ ruta: string; texto: string; idDeLenguaje?: string; doc?: vscode.TextDocument } | 'sin-editor'> {
    let doc: vscode.TextDocument | undefined;
    if (!uri) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage(MSG.sinArchivoActivo);
        return 'sin-editor';
      }
      doc = editor.document;
    } else {
      const clave = claveDeRuta(uri.fsPath);
      const activo = vscode.window.activeTextEditor?.document;
      doc = activo && activo.uri.scheme === 'file' && claveDeRuta(activo.uri.fsPath) === clave ? activo : undefined;
      doc ??= vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && claveDeRuta(d.uri.fsPath) === clave);
    }

    if (!doc) {
      const texto = await this.leerArchivo(uri!.fsPath);
      return texto === undefined ? 'sin-editor' : { ruta: uri!.fsPath, texto };
    }
    if (doc.uri.scheme !== 'file') {
      void vscode.window.showWarningMessage(MSG.guardaPrimero);
      return 'sin-editor';
    }
    const texto = doc.getText();
    if (Buffer.byteLength(texto) > MAX_BYTES) {
      void vscode.window.showErrorMessage(MSG.guiaGrande(path.basename(doc.uri.fsPath)));
      return 'sin-editor';
    }
    return { ruta: doc.uri.fsPath, texto, idDeLenguaje: doc.languageId, doc };
  }

  /** Cierra las pestañas del archivo. Si tiene cambios sin guardar, los guarda antes (así no sale el aviso de «¿guardar?» en pantalla). */
  private async cerrarPestanas(ruta: string, doc?: vscode.TextDocument): Promise<void> {
    if (doc?.isDirty && !(await doc.save())) {
      void vscode.window.showWarningMessage(MSG.noSeGuardo(path.basename(ruta)));
      return;
    }
    const clave = claveDeRuta(ruta);
    const pestanas = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter((t) => {
        const u = (t.input as { uri?: vscode.Uri } | undefined)?.uri;
        return !!u && u.scheme === 'file' && claveDeRuta(u.fsPath) === clave;
      });
    if (pestanas.length > 0) await vscode.window.tabGroups.close(pestanas);
  }

  private nuevaSesion(motor: MotorBloques): SesionLive {
    return new SesionLive(motor, {
      cps: () => this.ajuste('tecleo.caracteresPorSegundo', 30),
      esperar: (ms) => this.esperar(ms),
    });
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
      const fin = () => {
        clearTimeout(temporizador);
        this.esperas.delete(fin);
        resolver();
      };
      const temporizador = setTimeout(fin, ms);
      this.esperas.add(fin);
    });
  }

  /** La guía activa lista para escribir, o el resultado a devolver si no se puede (con su aviso). */
  private guiaParaEscribir(comprobarArchivo = true): Guia | ResultadoComando {
    const g = this.guiaActiva();
    if (!g) {
      void vscode.window.showWarningMessage(MENSAJES.sinBloques);
      return 'sin-bloques';
    }
    const editor = vscode.window.activeTextEditor;
    if (comprobarArchivo && editor && editor.document.uri.scheme === 'file' && claveDeRuta(editor.document.uri.fsPath) === g.id) {
      void vscode.window.showWarningMessage(MSG.esLaGuia);
      return 'es-la-guia';
    }
    return g;
  }

  private async restaurar(): Promise<void> {
    const rutas = this.contexto.globalState.get<string[]>(CLAVE_GUIAS, []);
    const activa = this.contexto.globalState.get<string>(CLAVE_ACTIVA);
    for (const ruta of rutas) {
      try {
        const { bloques } = parsearGuia(await fs.promises.readFile(ruta, 'utf8'));
        if (bloques.length === 0) continue;
        const id = claveDeRuta(ruta);
        const motor = new MotorBloques(bloques);
        this.guias.set(id, { id, ruta, nombre: path.basename(ruta), lenguaje: lenguajeDe(ruta), bloques, motor, sesion: this.nuevaSesion(motor) });
      } catch {
        this.log.appendLine(`No se pudo restaurar la guía «${path.basename(ruta)}» (¿se movió o se borró?).`);
      }
    }
    this.activaId = activa && this.guias.has(claveDeRuta(activa)) ? claveDeRuta(activa) : [...this.guias.keys()].pop();
    this.guardar();
    this.actualizarContextos();
    this.cambio.fire();
  }

  private guardar(): void {
    const g = this.guiaActiva();
    void this.contexto.globalState.update(CLAVE_GUIAS, this.guias.size ? [...this.guias.values()].map((x) => x.ruta) : undefined);
    void this.contexto.globalState.update(CLAVE_ACTIVA, g?.ruta);
  }

  private cambiaLaGuiaActiva(): void {
    this.actualizarContextos();
    this.enviarGuia(true);
    this.cambio.fire();
  }

  private trasAccion(): void {
    this.enviarSeleccion();
    this.actualizarContextos();
    this.cambio.fire();
  }

  private marcarTecleo(delta: number): void {
    this.tecleos = Math.max(0, this.tecleos + delta);
    this.actualizarContextos();
    this.cambio.fire();
  }

  private actualizarContextos(): void {
    const poner = (clave: string, valor: boolean) => void vscode.commands.executeCommand('setContext', clave, valor);
    poner('ghostCode.tecleando', this.tecleos > 0);
    poner('ghostCode.visorVisible', this.visorVisible);
    poner('ghostCode.guiaCargada', this.guias.size > 0);
    poner('ghostCode.escudo', this.escudo);
  }

  // ---------------------------------------------------------------------------------------------
  // Internos: visor

  private async asegurarVisor(): Promise<AyudanteLike | undefined> {
    const actual = this.ayudante;
    if (actual && (actual.estado === 'listo' || actual.estado === 'reiniciando')) return actual;
    if (this.iniciandoVisor) return this.iniciandoVisor;
    this.iniciandoVisor = this.arrancarVisor().finally(() => (this.iniciandoVisor = undefined));
    return this.iniciandoVisor;
  }

  private async arrancarVisor(): Promise<AyudanteLike | undefined> {
    const configurada = this.ajuste<string>('visor.rutaEjecutable', '').trim();
    const ruta = configurada || path.join(this.contexto.extensionPath, 'bin', 'win32-x64', 'ghost-viewer.exe');
    const crear = this.deps.crearAyudante ?? ((o) => new Ayudante(o));
    this.proteccionAvisada = false;
    const a = crear({ ruta, alEvento: (e) => this.alEvento(e), alAviso: (x) => this.alAviso(x) });
    this.ayudante = a;
    try {
      await a.iniciar();
    } catch (e) {
      this.ayudante = undefined;
      const detalle = e instanceof ErrorAyudante ? e.message : String((e as Error)?.message ?? e);
      this.log.appendLine(`No se pudo iniciar el visor: ${detalle}`);
      void vscode.window.showErrorMessage(MSG.visorNoArranca(detalle));
      this.cambio.fire();
      return undefined;
    }
    this.enviarTema();
    a.enviar({ tipo: 'siempreAlFrente', valor: this.alFrente });
    if (this.escudo) a.enviar({ tipo: 'escudo', valor: true });
    if (this.modoVisor !== 'normal') a.enviar({ tipo: 'modo', valor: this.modoVisor });
    this.enviarGuia(false);
    this.cambio.fire();
    return a;
  }

  /** Muestra el visor y espera a que de verdad se vea (hasta 4 s). Falso, con su aviso, si no se puede. */
  private async mostrarVisor(): Promise<boolean> {
    const a = await this.asegurarVisor();
    if (!a) return false;
    if (!a.proteccionActiva) {
      this.avisarSinProteccion();
      return false;
    }
    if (this.visorVisible) return true;
    const visto = this.esperarVisible();
    a.enviar({ tipo: 'mostrar' });
    const seVe = await visto;
    if (!seVe) void vscode.window.showWarningMessage(MSG.visorNoMostro);
    return seVe;
  }

  /** Promesa que se cumple cuando el visor avisa que se ve (verdadero) o pasa el plazo (falso). Se crea ANTES de enviar el comando. */
  private esperarVisible(): Promise<boolean> {
    return new Promise<boolean>((resolver) => {
      const fin = (v: boolean) => {
        clearTimeout(plazo);
        this.esperandoVisible.delete(fin);
        resolver(v);
      };
      const plazo = setTimeout(() => fin(false), this.deps.esperaVisorMs ?? 3500);
      this.esperandoVisible.add(fin);
    });
  }

  private temaEfectivo(): 'claro' | 'oscuro' {
    const ajuste = this.ajuste<string>('visor.tema', 'auto');
    if (ajuste === 'claro' || ajuste === 'oscuro') return ajuste;
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? 'claro' : 'oscuro';
  }

  private enviarTema(): void {
    this.ayudante?.enviar({ tipo: 'tema', valor: this.temaEfectivo() });
  }

  /** Manda la guía activa al visor. Sin guía: solo si `vaciarSiNoHay` (para limpiar lo que mostraba). */
  private enviarGuia(vaciarSiNoHay: boolean): void {
    const a = this.ayudante;
    if (!a) return;
    const g = this.guiaActiva();
    if (!g) {
      if (vaciarSiNoHay) a.enviar({ tipo: 'cargarGuia', titulo: '', lenguaje: '', bloques: [] });
      return;
    }
    a.enviar({ tipo: 'cargarGuia', titulo: g.nombre, lenguaje: g.lenguaje, bloques: g.bloques });
    this.enviarSeleccion();
  }

  /** Deja marcado en el visor el bloque que toca escribir (o el último, al terminar). */
  private enviarSeleccion(): void {
    const g = this.guiaActiva();
    if (!this.ayudante || !g) return;
    const e = g.motor.estado();
    this.ayudante.enviar({ tipo: 'seleccionarBloque', indice: e.terminado ? e.total - 1 : e.insertados });
  }

  private alEvento(e: Evento): void {
    switch (e.tipo) {
      case 'listo':
        this.log.appendLine(`Visor listo (protocolo ${e.protocolo}, protección de captura: ${e.afinidad ? 'sí' : 'NO'}).`);
        if (!e.afinidad) this.avisarSinProteccion();
        break;
      case 'visibilidadCambiada':
        this.visorVisible = e.visible;
        if (e.visible) for (const r of [...this.esperandoVisible]) r(true);
        this.actualizarContextos();
        this.cambio.fire();
        break;
      case 'error':
        this.log.appendLine(`Error del visor${e.codigo ? ` (${e.codigo})` : ''}: ${e.mensaje}`);
        if (e.codigo === 'webview2-ausente') void vscode.window.showErrorMessage(MSG.webview2Ausente);
        else if (e.codigo === 'sin-proteccion') this.avisarSinProteccion();
        break;
      case 'bloqueSeleccionado':
        this.log.appendLine(`Bloque ${e.indice} elegido en el visor.`);
        break;
      case 'escudoCambiado':
        this.escudo = e.activo;
        this.log.appendLine(`Escudo ${e.activo ? 'activado' : 'quitado'}.`);
        this.actualizarContextos();
        this.cambio.fire();
        break;
      case 'modoCambiado':
        this.modoVisor = e.valor;
        this.log.appendLine(`El visor pasó al modo ${e.valor}.`);
        this.cambio.fire();
        break;
    }
  }

  private alAviso(a: AvisoAyudante): void {
    switch (a.tipo) {
      case 'stderr':
        this.log.appendLine(`[visor] ${a.texto.trimEnd()}`);
        break;
      case 'salida-inesperada':
        this.log.appendLine(`El visor terminó de forma inesperada (código ${a.codigo ?? a.senal}).`);
        this.visorVisible = false;
        this.actualizarContextos();
        this.cambio.fire();
        break;
      case 'reiniciando':
        this.log.appendLine(`Reiniciando el visor (intento ${a.intento}).`);
        break;
      case 'agotado':
        this.log.appendLine('El visor no se pudo recuperar.');
        void vscode.window.showErrorMessage(MSG.visorAgotado);
        this.cambio.fire();
        break;
      case 'sin-proteccion':
        this.avisarSinProteccion();
        break;
      case 'linea-invalida':
        this.log.appendLine(`Línea inválida del visor (${a.motivo}): ${a.linea}`);
        break;
      case 'linea-descartada':
        this.log.appendLine(`Línea descartada del visor: ${a.motivo}`);
        break;
      case 'error-en-manejador':
        this.log.appendLine(`Error al manejar un evento del visor: ${a.mensaje}`);
        break;
    }
  }

  private avisarSinProteccion(): void {
    this.cambio.fire(); // la barra de estado lo marca en amarillo
    if (this.proteccionAvisada) return;
    this.proteccionAvisada = true;
    void vscode.window.showWarningMessage(MSG.sinProteccion);
  }

  // ---------------------------------------------------------------------------------------------
  // Ajustes

  private ajuste<T>(clave: string, predeterminado: T): T {
    return vscode.workspace.getConfiguration('ghostCode').get<T>(clave, predeterminado);
  }

  private alCambiarAjustes(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration('ghostCode.visor.tema')) this.enviarTema();
    if (e.affectsConfiguration('ghostCode.visor.siempreAlFrente')) {
      this.alFrente = this.ajuste('visor.siempreAlFrente', true);
      this.ayudante?.enviar({ tipo: 'siempreAlFrente', valor: this.alFrente });
    }
    if (e.affectsConfiguration('ghostCode.mostrarBarraDeEstado') || e.affectsConfiguration('ghostCode.arbolDiscreto')) this.cambio.fire();
  }
}
