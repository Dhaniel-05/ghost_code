// Responsabilidad: ejecutar el modo Live Coding en el editor activo (insertar, teclear, retroceder y cancelar bloques).
import * as vscode from 'vscode';
import { MotorBloques } from '../core/motorBloques';
import { Bloque } from '../core/tipos';
import { planTecleo } from '../core/tecleo';
import { FinDeLinea, prepararTexto, sangriaDeLinea } from './formato';
import { MENSAJES } from './mensajes';

export type ResultadoAccion =
  | 'insertado'
  | 'tecleado'
  | 'retrocedido'
  | 'cancelado'
  | 'sin-editor'
  | 'sin-bloques'
  | 'terminado'
  | 'inicio'
  | 'bloque-modificado'
  | 'fallo';

export interface OpcionesSesion {
  /** Velocidad del tecleo, leída al empezar cada bloque. */
  cps: () => number;
  /** Espera entre letras (se inyecta para poder probar sin esperar de verdad). */
  esperar: (ms: number) => Promise<void>;
}

/** Lo que se escribió de un bloque y dónde: sirve para retroceder sin borrar trabajo ajeno. */
interface Registro {
  documento: vscode.TextDocument;
  inicio: number;
  texto: string;
}

interface Tecleo {
  cancelado: boolean;
}

interface Contexto {
  editor: vscode.TextEditor;
  bloque: Bloque;
}

export class SesionLive {
  private historial: Registro[] = [];
  private tecleo: Tecleo | undefined;

  constructor(
    private readonly motor: MotorBloques,
    private readonly opciones: OpcionesSesion,
  ) {}

  /** Verdadero mientras hay un tecleo en curso. */
  get tecleando(): boolean {
    return this.tecleo !== undefined;
  }

  /** Detiene el tecleo en curso (lo ya escrito se conserva). No hace nada si no hay tecleo. */
  cancelar(): void {
    if (this.tecleo) this.tecleo.cancelado = true;
  }

  async insertarSiguiente(): Promise<ResultadoAccion> {
    if (this.alCancelarTecleo()) return 'cancelado';
    const ctx = this.contexto();
    if (typeof ctx === 'string') return ctx;
    const { editor, bloque } = ctx;
    const doc = editor.document;
    const seleccion = editor.selection;
    const texto = prepararTexto(bloque.texto, this.sangriaEn(editor), finDeLinea(doc));
    const inicio = doc.offsetAt(seleccion.start);

    const ok = await editor.edit((b) => b.replace(seleccion, texto), { undoStopBefore: true, undoStopAfter: true });
    if (!ok) return this.noSePudoEditar();

    this.motor.siguiente();
    this.historial.push({ documento: doc, inicio, texto });
    ponerCursor(editor, inicio + texto.length);
    return 'insertado';
  }

  async teclearSiguiente(): Promise<ResultadoAccion> {
    if (this.alCancelarTecleo()) return 'cancelado';
    const ctx = this.contexto();
    if (typeof ctx === 'string') return ctx;
    const token: Tecleo = { cancelado: false };
    this.tecleo = token;
    try {
      return await this.teclear(ctx, token);
    } finally {
      this.tecleo = undefined;
    }
  }

  async retroceder(): Promise<ResultadoAccion> {
    if (this.alCancelarTecleo()) return 'cancelado';
    const registro = this.historial[this.historial.length - 1];
    if (!registro) {
      void vscode.window.showInformationMessage(MENSAJES.inicio);
      return 'inicio';
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(MENSAJES.sinEditor);
      return 'sin-editor';
    }
    const doc = editor.document;
    const fin = registro.inicio + registro.texto.length;
    const rango = new vscode.Range(doc.positionAt(registro.inicio), doc.positionAt(fin));
    // Solo se borra si el bloque sigue intacto y en el mismo archivo: nunca el trabajo de la persona
    if (doc.uri.toString() !== registro.documento.uri.toString() || doc.getText(rango) !== registro.texto) {
      void vscode.window.showWarningMessage(MENSAJES.bloqueModificado);
      return 'bloque-modificado';
    }
    const ok = await editor.edit((b) => b.delete(rango), { undoStopBefore: true, undoStopAfter: true });
    if (!ok) return this.noSePudoEditar();

    this.historial.pop();
    this.motor.retroceder();
    ponerCursor(editor, registro.inicio);
    return 'retrocedido';
  }

  // ---------------------------------------------------------------------------------------------

  /** Si hay un tecleo en curso, la acción nueva solo lo cancela y no se ejecuta. */
  private alCancelarTecleo(): boolean {
    if (!this.tecleo) return false;
    this.tecleo.cancelado = true;
    return true;
  }

  /** Comprueba que se pueda actuar: hay bloques, hay editor y falta algún bloque por insertar. */
  private contexto(): Contexto | ResultadoAccion {
    const estado = this.motor.estado();
    if (estado.total === 0) {
      void vscode.window.showWarningMessage(MENSAJES.sinBloques);
      return 'sin-bloques';
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(MENSAJES.sinEditor);
      return 'sin-editor';
    }
    const bloque = this.motor.vistaPrevia();
    if (!bloque) {
      void vscode.window.showInformationMessage(MENSAJES.terminado);
      return 'terminado';
    }
    return { editor, bloque };
  }

  private sangriaEn(editor: vscode.TextEditor): string {
    const inicio = editor.selection.start;
    return sangriaDeLinea(editor.document.lineAt(inicio.line).text, inicio.character);
  }

  private noSePudoEditar(): ResultadoAccion {
    void vscode.window.showWarningMessage(MENSAJES.noSePudoEditar);
    return 'fallo';
  }

  /**
   * Escribe el bloque letra por letra. Todo el bloque es un solo paso de deshacer.
   * Se detiene si se cancela, si cambia el editor activo o si la persona escribe en el documento.
   * La sangría se escribe al llegar al primer carácter de cada línea (las líneas en blanco no la llevan),
   * así el resultado es idéntico al de la inserción completa.
   */
  private async teclear({ editor, bloque }: Contexto, token: Tecleo): Promise<ResultadoAccion> {
    const doc = editor.document;
    const sangria = this.sangriaEn(editor);
    const salto = finDeLinea(doc) === 'CRLF' ? '\r\n' : '\n';
    const texto = bloque.texto.replace(/\r\n?/g, '\n');
    const lineas = texto.split('\n');
    const pasos = planTecleo(texto, { caracteresPorSegundo: this.opciones.cps() });
    const inicio = doc.offsetAt(editor.selection.start);

    let version = doc.version;
    let linea = 0;
    let lineaNueva = false; // falta escribir la sangría de la línea que acaba de empezar
    let registro: Registro | undefined;

    for (let i = 0; i < pasos.length; i++) {
      await this.opciones.esperar(pasos[i].retardoMs);
      const activo = vscode.window.activeTextEditor;
      if (token.cancelado || !activo || activo.document !== doc || doc.version !== version) {
        await cerrarDeshacer(editor, registro !== undefined);
        return 'cancelado';
      }

      let escribir: string;
      if (pasos[i].texto === '\n') {
        escribir = salto;
        linea++;
        lineaNueva = true;
      } else {
        escribir = (lineaNueva && lineas[linea].trim() !== '' ? sangria : '') + pasos[i].texto;
        lineaNueva = false;
      }

      const primero = i === 0;
      const ultimo = i === pasos.length - 1;
      const donde = inicio + (registro?.texto.length ?? 0);
      const seleccion = editor.selection;
      const ok = await editor.edit(
        (b) => (primero ? b.replace(seleccion, escribir) : b.insert(doc.positionAt(donde), escribir)),
        { undoStopBefore: primero, undoStopAfter: ultimo },
      );
      if (!ok) {
        await cerrarDeshacer(editor, registro !== undefined);
        return this.noSePudoEditar();
      }

      if (!registro) {
        // El bloque cuenta como insertado desde la primera letra: así se puede retroceder aunque se cancele
        registro = { documento: doc, inicio, texto: '' };
        this.historial.push(registro);
        this.motor.siguiente();
      }
      registro.texto += escribir;
      ponerCursor(editor, inicio + registro.texto.length);
      version = doc.version;
    }
    return 'tecleado';
  }
}

function finDeLinea(doc: vscode.TextDocument): FinDeLinea {
  return doc.eol === vscode.EndOfLine.CRLF ? 'CRLF' : 'LF';
}

function ponerCursor(editor: vscode.TextEditor, offset: number): void {
  const pos = editor.document.positionAt(offset);
  editor.selection = new vscode.Selection(pos, pos);
}

/** Si ya se escribió algo, cierra el grupo de deshacer para que lo siguiente no se mezcle con el tecleo. */
async function cerrarDeshacer(editor: vscode.TextEditor, hayEscrito: boolean): Promise<void> {
  if (hayEscrito) await editor.edit(() => undefined, { undoStopBefore: false, undoStopAfter: true });
}
