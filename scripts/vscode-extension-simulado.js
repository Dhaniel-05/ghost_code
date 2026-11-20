// Responsabilidad: ampliar el vscode simulado con lo que usa la capa de extensión (comandos, barra de estado, árbol, ajustes, contexto).
// Se apoya en scripts/vscode-simulado.js (documento y editor). Los ajustes toman por defecto lo declarado en package.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { instalar } = require('./vscode-simulado');

const raiz = path.resolve(__dirname, '..');
const manifiesto = () => JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const vscode = instalar();

class EventEmitter {
  constructor() {
    this.oyentes = [];
    this.event = (f) => {
      this.oyentes.push(f);
      return { dispose: () => (this.oyentes = this.oyentes.filter((x) => x !== f)) };
    };
  }
  fire(v) {
    [...this.oyentes].forEach((f) => f(v));
  }
  dispose() {
    this.oyentes = [];
  }
}

const uriDe = (p) => ({ scheme: 'file', fsPath: p, path: p.replace(/\\/g, '/'), toString: () => 'file:///' + p.replace(/\\/g, '/') });

Object.assign(vscode, {
  EventEmitter,
  Disposable: class {
    constructor(f) {
      this.f = f;
    }
    dispose() {
      if (this.f) this.f();
    }
  },
  Uri: { file: uriDe, joinPath: (base, ...partes) => uriDe(path.join(base.fsPath, ...partes)) },
  ThemeIcon: class {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  TreeItem: class {
    constructor(label, estado = 0) {
      this.label = label;
      this.collapsibleState = estado;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  version: '1.147.0-simulado',
  env: { appName: 'Simulador' },
});

// --- estado del simulador (se vacía con __reiniciar) ---
const comandos = new Map();
const contextos = {};
vscode.__contextos = contextos;
vscode.__canales = [];
vscode.__barras = [];
vscode.__arboles = new Map();
vscode.__config = {};
vscode.__dialogos = { abrir: undefined };
const eCambioConfig = new EventEmitter();
const eCambioTema = new EventEmitter();

vscode.commands = {
  registerCommand(id, fn) {
    if (comandos.has(id)) throw new Error(`command '${id}' already exists`);
    comandos.set(id, fn);
    return { dispose: () => comandos.delete(id) };
  },
  async executeCommand(id, ...args) {
    if (id === 'setContext') {
      contextos[args[0]] = args[1];
      return undefined;
    }
    const fn = comandos.get(id);
    if (!fn) throw new Error(`command '${id}' not found`);
    return fn(...args);
  },
  async getCommands() {
    return [...comandos.keys()];
  },
};

vscode.window.createOutputChannel = (name) => {
  const canal = {
    name,
    lineas: [],
    mostrado: 0,
    appendLine(t) {
      this.lineas.push(String(t));
    },
    append(t) {
      this.lineas.push(String(t));
    },
    show() {
      this.mostrado++;
    },
    clear() {
      this.lineas.length = 0;
    },
    dispose() {
      this.eliminado = true;
    },
  };
  vscode.__canales.push(canal);
  return canal;
};
vscode.window.createStatusBarItem = (alineacion, prioridad) => {
  const item = {
    alineacion,
    prioridad,
    text: '',
    tooltip: undefined,
    command: undefined,
    backgroundColor: undefined,
    visible: false,
    show() {
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    dispose() {
      this.eliminado = true;
      this.visible = false;
    },
  };
  vscode.__barras.push(item);
  return item;
};
vscode.window.createTreeView = (id, opciones) => {
  const vista = { id, options: opciones, eliminada: false, dispose() { this.eliminada = true; }, reveal: async () => undefined };
  vscode.__arboles.set(id, vista);
  return vista;
};
vscode.window.showOpenDialog = async () => vscode.__dialogos.abrir;
vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.Dark };
vscode.window.onDidChangeActiveColorTheme = eCambioTema.event;

// Pestañas abiertas: cada una { input: { uri }, isDirty }. close() las quita y anota qué se cerró y en qué orden.
const grupoPestanas = { tabs: [] };
vscode.window.tabGroups = {
  all: [grupoPestanas],
  cerradas: [],
  async close(que) {
    const lista = Array.isArray(que) ? que : [que];
    for (const t of lista) {
      grupoPestanas.tabs = grupoPestanas.tabs.filter((x) => x !== t);
      this.cerradas.push(t);
      vscode.__bitacora.push('cerrar:' + t.input.uri.fsPath);
    }
    return true;
  },
};
vscode.__bitacora = [];
/** Abre una pestaña simulada para un archivo. */
vscode.__abrirPestana = (uri, { dirty = false } = {}) => {
  const tab = { input: { uri }, isDirty: dirty };
  grupoPestanas.tabs.push(tab);
  return tab;
};

vscode.workspace = {
  textDocuments: [],
  getConfiguration(seccion) {
    const props = manifiesto().contributes?.configuration?.properties ?? {};
    return {
      get(clave, predeterminado) {
        const completa = `${seccion}.${clave}`;
        if (completa in vscode.__config) return vscode.__config[completa];
        if (props[completa] && 'default' in props[completa]) return props[completa].default;
        return predeterminado;
      },
    };
  },
  onDidChangeConfiguration: eCambioConfig.event,
};

/** Cambia un ajuste y avisa como lo hace VS Code. */
vscode.__cambiarConfig = (clave, valor) => {
  vscode.__config[clave] = valor;
  eCambioConfig.fire({ affectsConfiguration: (s) => clave === s || clave.startsWith(s + '.') });
};
vscode.__cambiarTema = (kind) => {
  vscode.window.activeColorTheme = { kind };
  eCambioTema.fire(vscode.window.activeColorTheme);
};

/** Deja el simulador como nuevo (comandos, contextos, canales, barras, árboles, ajustes, avisos). */
vscode.__reiniciar = () => {
  comandos.clear();
  for (const k of Object.keys(contextos)) delete contextos[k];
  vscode.__canales.length = 0;
  vscode.__barras.length = 0;
  vscode.__arboles.clear();
  vscode.__config = {};
  vscode.__dialogos.abrir = undefined;
  eCambioConfig.dispose();
  eCambioTema.dispose();
  vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.Dark };
  vscode.window.activeTextEditor = undefined;
  grupoPestanas.tabs = [];
  vscode.window.tabGroups.cerradas.length = 0;
  vscode.__bitacora.length = 0;
  vscode.workspace.textDocuments.length = 0;
  for (const k of ['advertencias', 'informativos', 'errores']) vscode.avisos[k].length = 0;
};

/** Contexto de la extensión con globalState en memoria. `estado` = valores guardados de una sesión anterior. */
vscode.__crearContexto = (estado = {}) => {
  const datos = { ...estado };
  return {
    subscriptions: [],
    extensionPath: raiz,
    extensionUri: uriDe(raiz),
    extension: { packageJSON: manifiesto() },
    globalState: {
      _datos: datos,
      get: (k, d) => (k in datos ? datos[k] : d),
      keys: () => Object.keys(datos),
      update: async (k, v) => {
        if (v === undefined) delete datos[k];
        else datos[k] = v;
      },
    },
  };
};

/** Archivo temporal con el texto dado; devuelve su ruta. */
vscode.__archivoTemporal = (nombre, texto) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-ext-'));
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, texto);
  return ruta;
};

module.exports = { vscode, raiz, manifiesto, uriDe };
