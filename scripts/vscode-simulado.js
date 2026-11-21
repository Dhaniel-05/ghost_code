// Responsabilidad: simular lo mínimo de la API de VS Code (documento, editor, ventana, mensajes) para probar el modo Live Coding.
// Se instala antes de cargar el código compilado: require('vscode') devuelve este simulado.
const Module = require('module');

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
const comparar = (a, b) => (a.line - b.line) || (a.character - b.character);

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  get isEmpty() {
    return comparar(this.start, this.end) === 0;
  }
}

class Selection {
  constructor(anchor, active) {
    this.anchor = anchor;
    this.active = active;
    const antes = comparar(anchor, active) <= 0;
    this.start = antes ? anchor : active;
    this.end = antes ? active : anchor;
  }
  get isEmpty() {
    return comparar(this.anchor, this.active) === 0;
  }
}

const EndOfLine = { LF: 1, CRLF: 2 };

let contadorDocs = 0;

class DocumentoSimulado {
  constructor(texto = '', eol = 'LF') {
    this.texto = texto;
    this.eol = EndOfLine[eol];
    this.version = 1;
    this.isDirty = false;
    this.guardados = 0;
    this.languageId = 'plaintext';
    const id = `file:///simulado/doc-${++contadorDocs}`;
    this.uri = { toString: () => id, fsPath: id };
  }
  inicios() {
    const r = [0];
    for (let i = 0; i < this.texto.length; i++) if (this.texto[i] === '\n') r.push(i + 1);
    return r;
  }
  get lineCount() {
    return this.inicios().length;
  }
  lineAt(n) {
    const ini = this.inicios();
    const fin = n + 1 < ini.length ? ini[n + 1] - 1 : this.texto.length;
    return { text: this.texto.slice(ini[n], fin).replace(/\r$/, '') };
  }
  offsetAt(pos) {
    return this.inicios()[pos.line] + pos.character;
  }
  positionAt(offset) {
    const ini = this.inicios();
    let linea = 0;
    for (let i = 0; i < ini.length; i++) if (ini[i] <= offset) linea = i;
    return new Position(linea, offset - ini[linea]);
  }
  getText(rango) {
    return rango ? this.texto.slice(this.offsetAt(rango.start), this.offsetAt(rango.end)) : this.texto;
  }
  async save() {
    this.guardados++;
    this.isDirty = false;
    return true;
  }
  /** Simula que la persona escribe algo ella misma (cambia la versión del documento). */
  escribirComoUsuario(offset, texto) {
    this.texto = this.texto.slice(0, offset) + texto + this.texto.slice(offset);
    this.version++;
  }
}

class EditorSimulado {
  constructor(documento, cursor = 0) {
    this.document = documento;
    const [a, b] = Array.isArray(cursor) ? cursor : [cursor, cursor];
    this.selection = new Selection(documento.positionAt(a), documento.positionAt(b));
    this.llamadas = []; // cada editor.edit: { opciones, ops }
    this.gruposDeUndo = 0;
    this.grupoAbierto = false;
    this.snippetsUsados = 0;
    this.rechazarEdiciones = false;
  }
  async insertSnippet() {
    this.snippetsUsados++;
    return true;
  }
  async edit(cb, opciones = {}) {
    if (this.rechazarEdiciones) return false;
    const doc = this.document;
    const ops = [];
    const constructor = {
      insert: (pos, texto) => ops.push({ tipo: 'insert', ini: doc.offsetAt(pos), fin: doc.offsetAt(pos), texto }),
      delete: (r) => ops.push({ tipo: 'delete', ini: doc.offsetAt(r.start), fin: doc.offsetAt(r.end), texto: '' }),
      replace: (r, texto) => ops.push({ tipo: 'replace', ini: doc.offsetAt(r.start), fin: doc.offsetAt(r.end), texto }),
    };
    cb(constructor);
    const antes = opciones.undoStopBefore ?? true;
    const despues = opciones.undoStopAfter ?? true;
    this.llamadas.push({ opciones, ops: ops.map((o) => ({ ...o })) });
    if (ops.length === 0) {
      this.grupoAbierto = !despues; // una edición vacía solo sirve para cerrar el grupo de deshacer
      return true;
    }
    if (antes || !this.grupoAbierto) this.gruposDeUndo++;
    this.grupoAbierto = !despues;
    for (const o of [...ops].sort((x, y) => y.ini - x.ini)) {
      doc.texto = doc.texto.slice(0, o.ini) + o.texto + doc.texto.slice(o.fin);
    }
    doc.version++;
    if (ops.length === 1) {
      const p = doc.positionAt(ops[0].ini + ops[0].texto.length);
      this.selection = new Selection(p, p);
    }
    return true;
  }
}

const vscode = {
  Position,
  Range,
  Selection,
  EndOfLine,
  window: { activeTextEditor: undefined },
  avisos: { advertencias: [], informativos: [], errores: [] },
};
// Si la prueba deja en __eleccion el texto de un botón, el aviso «lo pulsa» (devuelve ese texto)
vscode.window.showWarningMessage = async (m, ...botones) => {
  vscode.avisos.advertencias.push(m);
  const e = vscode.__eleccion;
  vscode.__eleccion = undefined;
  return botones.includes(e) ? e : undefined;
};
vscode.window.showInformationMessage = async (m) => void vscode.avisos.informativos.push(m);
vscode.window.showErrorMessage = async (m) => void vscode.avisos.errores.push(m);

let instalado = false;
function instalar() {
  if (instalado) return vscode;
  const original = Module._load;
  Module._load = function (request, ...resto) {
    return request === 'vscode' ? vscode : original.call(this, request, ...resto);
  };
  instalado = true;
  return vscode;
}

/** Documento + editor activo + mensajes vacíos. `cursor`: offset o [inicio, fin] de la selección. */
function crearEscenario({ texto = '', eol = 'LF', cursor = texto.length } = {}) {
  const documento = new DocumentoSimulado(texto, eol);
  const editor = new EditorSimulado(documento, cursor);
  vscode.window.activeTextEditor = editor;
  vscode.avisos.advertencias.length = 0;
  vscode.avisos.informativos.length = 0;
  vscode.avisos.errores.length = 0;
  return { documento, editor, vscode };
}

const tick = () => new Promise((r) => setImmediate(r));

/** Espera inyectable que no avanza sola: la prueba decide cuándo se libera cada espera. */
function esperaManual() {
  const cola = [];
  const llamadas = [];
  return {
    llamadas,
    esperar: (ms) =>
      new Promise((resolver) => {
        llamadas.push(ms);
        cola.push(resolver);
      }),
    async liberar(n = 1) {
      for (let i = 0; i < n; i++) {
        await tick();
        const r = cola.shift();
        if (!r) throw new Error('no había una espera pendiente para liberar');
        r();
        await tick();
      }
    },
    async liberarTodo() {
      await tick();
      while (cola.length) cola.shift()();
      await tick();
    },
  };
}

/** Espera instantánea: para las pruebas que no necesitan controlar el tiempo. */
function esperaInstantanea() {
  const llamadas = [];
  return { llamadas, esperar: async (ms) => void llamadas.push(ms) };
}

module.exports = { instalar, crearEscenario, tick, esperaManual, esperaInstantanea };
