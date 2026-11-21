// Responsabilidad: protocolo NDJSON entre la extensión y ghost-viewer (tipos, codificar, decodificar y leer líneas de un flujo).
import { StringDecoder } from 'string_decoder';

export const VERSION_PROTOCOLO = 1;
/** Línea más larga que se acepta (una guía grande cabe de sobra). */
export const LIMITE_LINEA_BYTES = 4 * 1024 * 1024;

export interface BloqueGuia {
  indice: number;
  titulo: string;
  texto: string;
}

/** Extensión → visor. */
export type Comando =
  | { tipo: 'mostrar' }
  | { tipo: 'ocultar' }
  | { tipo: 'cargarGuia'; titulo: string; lenguaje: string; bloques: BloqueGuia[] }
  | { tipo: 'seleccionarBloque'; indice: number }
  | { tipo: 'siempreAlFrente'; valor: boolean }
  | { tipo: 'tema'; valor: 'claro' | 'oscuro' }
  /** Escudo: cubre el código del visor con un panel opaco (o lo descubre). */
  | { tipo: 'escudo'; valor: boolean }
  /** Tamaño del visor: ventana normal, barra compacta flotante o área de trabajo completa. */
  | { tipo: 'modo'; valor: ModoVisor }
  /** Recuperar un visor perdido: restaura, lo pone en una pantalla visible, lo muestra y lo trae al frente. */
  | { tipo: 'traer' }
  | { tipo: 'cerrar' };

export type ModoVisor = 'normal' | 'compacto' | 'maximizado';
const MODOS: readonly string[] = ['normal', 'compacto', 'maximizado'];

/** Visor → extensión. */
export type Evento =
  | { tipo: 'listo'; protocolo: number; afinidad: boolean }
  | { tipo: 'bloqueSeleccionado'; indice: number }
  | { tipo: 'visibilidadCambiada'; visible: boolean }
  | { tipo: 'escudoCambiado'; activo: boolean }
  | { tipo: 'modoCambiado'; valor: ModoVisor }
  | { tipo: 'error'; mensaje: string; codigo?: string };

export type Decodificado<T> = { ok: true; mensaje: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------------------------
// Validación: cada función devuelve el mensaje limpio (solo los campos conocidos) o el motivo del rechazo.

const ok = <T>(mensaje: T): Decodificado<T> => ({ ok: true, mensaje });
const mal = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const esIndice = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const esTexto = (v: unknown): v is string => typeof v === 'string';
const esBool = (v: unknown): v is boolean => typeof v === 'boolean';

function bloqueValido(v: unknown): BloqueGuia | undefined {
  if (!esObjeto(v) || !esIndice(v.indice) || !esTexto(v.titulo) || !esTexto(v.texto)) return undefined;
  return { indice: v.indice, titulo: v.titulo, texto: v.texto };
}

function normalizarComando(o: Objeto): Decodificado<Comando> {
  switch (o.tipo) {
    case 'mostrar':
      return ok({ tipo: 'mostrar' });
    case 'ocultar':
      return ok({ tipo: 'ocultar' });
    case 'cerrar':
      return ok({ tipo: 'cerrar' });
    case 'traer':
      return ok({ tipo: 'traer' });
    case 'escudo':
      return esBool(o.valor) ? ok({ tipo: 'escudo', valor: o.valor }) : mal('escudo: «valor» debe ser verdadero o falso');
    case 'modo':
      return typeof o.valor === 'string' && MODOS.includes(o.valor)
        ? ok({ tipo: 'modo', valor: o.valor as ModoVisor })
        : mal('modo: «valor» debe ser «normal», «compacto» o «maximizado»');
    case 'seleccionarBloque':
      return esIndice(o.indice) ? ok({ tipo: 'seleccionarBloque', indice: o.indice }) : mal('seleccionarBloque: «indice» debe ser un entero mayor o igual que 0');
    case 'siempreAlFrente':
      return esBool(o.valor) ? ok({ tipo: 'siempreAlFrente', valor: o.valor }) : mal('siempreAlFrente: «valor» debe ser verdadero o falso');
    case 'tema':
      return o.valor === 'claro' || o.valor === 'oscuro' ? ok({ tipo: 'tema', valor: o.valor }) : mal('tema: «valor» debe ser «claro» u «oscuro»');
    case 'cargarGuia': {
      if (!esTexto(o.titulo)) return mal('cargarGuia: «titulo» debe ser texto');
      if (!esTexto(o.lenguaje)) return mal('cargarGuia: «lenguaje» debe ser texto');
      if (!Array.isArray(o.bloques)) return mal('cargarGuia: «bloques» debe ser un arreglo');
      const bloques: BloqueGuia[] = [];
      for (const b of o.bloques) {
        const limpio = bloqueValido(b);
        if (!limpio) return mal('cargarGuia: cada bloque necesita «indice» entero, «titulo» y «texto»');
        bloques.push(limpio);
      }
      return ok({ tipo: 'cargarGuia', titulo: o.titulo, lenguaje: o.lenguaje, bloques });
    }
    default:
      return mal(`comando desconocido: ${String(o.tipo).slice(0, 40)}`);
  }
}

function normalizarEvento(o: Objeto): Decodificado<Evento> {
  switch (o.tipo) {
    case 'listo':
      if (!esIndice(o.protocolo)) return mal('listo: «protocolo» debe ser un entero');
      if (!esBool(o.afinidad)) return mal('listo: «afinidad» debe ser verdadero o falso');
      return ok({ tipo: 'listo', protocolo: o.protocolo, afinidad: o.afinidad });
    case 'bloqueSeleccionado':
      return esIndice(o.indice) ? ok({ tipo: 'bloqueSeleccionado', indice: o.indice }) : mal('bloqueSeleccionado: «indice» debe ser un entero mayor o igual que 0');
    case 'visibilidadCambiada':
      return esBool(o.visible) ? ok({ tipo: 'visibilidadCambiada', visible: o.visible }) : mal('visibilidadCambiada: «visible» debe ser verdadero o falso');
    case 'escudoCambiado':
      return esBool(o.activo) ? ok({ tipo: 'escudoCambiado', activo: o.activo }) : mal('escudoCambiado: «activo» debe ser verdadero o falso');
    case 'modoCambiado':
      return typeof o.valor === 'string' && MODOS.includes(o.valor)
        ? ok({ tipo: 'modoCambiado', valor: o.valor as ModoVisor })
        : mal('modoCambiado: «valor» debe ser «normal», «compacto» o «maximizado»');
    case 'error':
      if (!esTexto(o.mensaje)) return mal('error: «mensaje» debe ser texto');
      if (o.codigo !== undefined && !esTexto(o.codigo)) return mal('error: «codigo» debe ser texto');
      return ok(o.codigo === undefined ? { tipo: 'error', mensaje: o.mensaje } : { tipo: 'error', mensaje: o.mensaje, codigo: o.codigo });
    default:
      return mal(`evento desconocido: ${String(o.tipo).slice(0, 40)}`);
  }
}

function leerObjeto(linea: string): Decodificado<Objeto> {
  const texto = typeof linea === 'string' ? linea.trim() : '';
  if (texto === '') return mal('línea vacía');
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return mal('no es JSON válido');
  }
  return esObjeto(valor) ? ok(valor) : mal('la línea debe ser un objeto JSON');
}

/** Lee una línea con un comando. Nunca lanza: devuelve `ok: false` con el motivo. Ignora campos desconocidos. */
export function decodificarComando(linea: string): Decodificado<Comando> {
  const o = leerObjeto(linea);
  return o.ok ? normalizarComando(o.mensaje) : o;
}

/** Lee una línea con un evento. Nunca lanza: devuelve `ok: false` con el motivo. Ignora campos desconocidos. */
export function decodificarEvento(linea: string): Decodificado<Evento> {
  const o = leerObjeto(linea);
  return o.ok ? normalizarEvento(o.mensaje) : o;
}

/**
 * Convierte un comando o evento en UNA línea JSON terminada en `\n`.
 * Lanza Error si el mensaje no es válido (error de programación); descarta los campos desconocidos.
 */
export function codificar(mensaje: Comando | Evento): string {
  if (!esObjeto(mensaje)) throw new Error('el mensaje debe ser un objeto');
  const comando = normalizarComando(mensaje);
  const limpio = comando.ok ? comando : normalizarEvento(mensaje);
  if (!limpio.ok) throw new Error(`mensaje inválido: ${limpio.error}`);
  // U+2028 y U+2029 son válidos en JSON, pero algunos lectores de líneas los toman por saltos: se escapan
  return JSON.stringify(limpio.mensaje).split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029') + '\n';
}

// ---------------------------------------------------------------------------------------------

export interface OpcionesLector {
  /** Bytes máximos por línea (por defecto LIMITE_LINEA_BYTES). Una línea más larga se descarta entera. */
  maxBytes?: number;
  alDescartar?: (motivo: string) => void;
}

/** Junta los trozos de un flujo (texto o Buffer) y entrega cada línea completa. */
export class LectorLineas {
  private readonly decodificador = new StringDecoder('utf8');
  private readonly maxBytes: number;
  private pendiente = '';
  private bytesPendientes = 0;
  private descartando = false;

  constructor(
    private readonly alLinea: (linea: string) => void,
    private readonly opciones: OpcionesLector = {},
  ) {
    this.maxBytes = opciones.maxBytes ?? LIMITE_LINEA_BYTES;
  }

  agregar(fragmento: string | Buffer): void {
    const texto = typeof fragmento === 'string' ? fragmento : this.decodificador.write(fragmento);
    let desde = 0;
    while (desde < texto.length) {
      const salto = texto.indexOf('\n', desde);
      if (salto === -1) {
        this.acumular(texto.slice(desde));
        return;
      }
      this.cerrarLinea(texto.slice(desde, salto));
      desde = salto + 1;
    }
  }

  /** Entrega lo que haya quedado sin salto de línea al final. */
  terminar(): void {
    this.acumular(this.decodificador.end());
    if (!this.descartando) this.cerrarLinea('');
    this.pendiente = '';
    this.bytesPendientes = 0;
    this.descartando = false;
  }

  /** Suma un trozo sin salto de línea; si ya pasó del máximo, descarta toda la línea. */
  private acumular(trozo: string): void {
    if (this.descartando || trozo === '') return;
    this.bytesPendientes += Buffer.byteLength(trozo);
    if (this.bytesPendientes > this.maxBytes) {
      this.descartar();
      return;
    }
    this.pendiente += trozo;
  }

  /** Cierra la línea en curso con su último trozo y la entrega si vale. */
  private cerrarLinea(ultimoTrozo: string): void {
    if (this.descartando) {
      this.descartando = false; // el salto de línea termina la línea descartada
      return;
    }
    const bytes = this.bytesPendientes + (ultimoTrozo === '' ? 0 : Buffer.byteLength(ultimoTrozo));
    const linea = this.pendiente + ultimoTrozo;
    this.pendiente = '';
    this.bytesPendientes = 0;
    if (bytes > this.maxBytes) {
      this.opciones.alDescartar?.(`línea de más de ${this.maxBytes} bytes`);
      return;
    }
    if (linea.trim() === '') return;
    this.alLinea(linea.endsWith('\r') ? linea.slice(0, -1) : linea);
  }

  private descartar(): void {
    this.descartando = true;
    this.pendiente = '';
    this.bytesPendientes = 0;
    this.opciones.alDescartar?.(`línea de más de ${this.maxBytes} bytes`);
  }
}
