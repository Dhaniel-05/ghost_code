// Responsabilidad: pruebas de la capa de extensión (manifiesto, activación, comandos, barra de estado, árbol y visor) con VS Code simulado.
// El ayudante se reemplaza por uno en memoria. Requiere: npm run compile        Uso: node scripts/test-extension.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { caso, fin } = require('./_caso');
const { vscode, raiz, manifiesto, uriDe } = require('./vscode-extension-simulado');
const { crearEscenario, tick } = require('./vscode-simulado');
const { ErrorAyudante } = require('../out/platform/ayudante');
const { arrancar, desactivar } = require('../out/arranque');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const GUIA = '// @@paso: Uno\nconst a = 1;\n// @@paso: Dos\nconst b = 2;\n';
const RUTA_EXE = path.join(raiz, 'bin', 'win32-x64', 'ghost-viewer.exe');

// --- Ayudante en memoria ---
class AyudanteFalso {
  constructor(opciones, fabrica) {
    this.opciones = opciones;
    this.fabrica = fabrica;
    this.comandos = [];
    this.estado = 'detenido';
    this.proteccionActiva = fabrica.proteccion;
    this.iniciados = 0;
    this.detenciones = 0;
  }
  async iniciar() {
    this.iniciados++;
    if (this.fabrica.error) {
      this.estado = 'fallido';
      throw this.fabrica.error;
    }
    this.estado = 'listo';
    const listo = { tipo: 'listo', protocolo: 1, afinidad: this.proteccionActiva };
    this.opciones.alEvento && this.opciones.alEvento(listo);
    return listo;
  }
  enviar(c) {
    if (this.estado !== 'listo') return false;
    this.comandos.push(c);
    const responde = !this.fabrica.silencioso; // un visor «silencioso» no contesta (ventana perdida)
    if ((c.tipo === 'mostrar' || c.tipo === 'traer') && this.proteccionActiva && responde) setImmediate(() => this.emitir({ tipo: 'visibilidadCambiada', visible: true }));
    if (c.tipo === 'ocultar') setImmediate(() => this.emitir({ tipo: 'visibilidadCambiada', visible: false }));
    if (c.tipo === 'escudo' && responde) setImmediate(() => this.emitir({ tipo: 'escudoCambiado', activo: c.valor }));
    if (c.tipo === 'modo' && responde) setImmediate(() => this.emitir({ tipo: 'modoCambiado', valor: c.valor }));
    return true;
  }
  async detener() {
    this.detenciones++;
    this.estado = 'detenido';
  }
  emitir(e) {
    if (e.tipo === 'visibilidadCambiada' && e.visible) vscode.__bitacora.push('visible');
    this.opciones.alEvento && this.opciones.alEvento(e);
  }
  avisar(a) {
    this.opciones.alAviso && this.opciones.alAviso(a);
  }
  tipos() {
    return this.comandos.map((c) => c.tipo);
  }
}

async function montar({ estado, config = {} } = {}) {
  await tick(); // deja que terminen los eventos pendientes de la prueba anterior antes de vaciar la bitácora
  await tick();
  vscode.__reiniciar();
  Object.assign(vscode.__config, config);
  const fabrica = { fakes: [], error: undefined, proteccion: true };
  fabrica.crear = (opciones) => {
    const f = new AyudanteFalso(opciones, fabrica);
    fabrica.fakes.push(f);
    return f;
  };
  const contexto = vscode.__crearContexto(estado);
  await arrancar(contexto, { crearAyudante: fabrica.crear, esperaVisorMs: 80 });
  return { fabrica, contexto, ejecutar: (id, ...a) => vscode.commands.executeCommand(id, ...a), ayudante: () => fabrica.fakes[0] };
}
async function apagar(h) {
  await desactivar();
  h.contexto.subscriptions.forEach((d) => d.dispose());
}
/** Monta, ejecuta y apaga siempre (aunque la prueba falle). */
const prueba = (nombre, opciones, fn) =>
  caso(nombre, async () => {
    const h = await montar(opciones);
    try {
      await fn(h);
    } finally {
      await apagar(h);
    }
  });

const barra = () => vscode.__barras.find((b) => b.command === 'ghostCode.toggleVisor');
const proveedor = () => vscode.__arboles.get('ghostCode.guias').options.treeDataProvider;
const cargar = async (h, texto = GUIA, nombre = 'guia.ts') => {
  const ruta = vscode.__archivoTemporal(nombre, texto);
  await h.ejecutar('ghostCode.loadGuide', uriDe(ruta));
  return ruta;
};
const raices = () => proveedor().getChildren();
const item = (nodo) => proveedor().getTreeItem(nodo);

(async () => {
  console.log('Extensión: manifiesto');
  const m = manifiesto();
  const comandosManifiesto = (m.contributes?.commands ?? []).map((c) => c.command);
  const IDS = ['ghostMode', 'toggleShield', 'recoverViewer', 'toggleVisor', 'toggleSiempreAlFrente', 'loadGuide', 'useActiveFileAsGuide', 'nextBlock', 'typeNextBlock', 'prevBlock', 'cancelTyping', 'selectBlock', 'activateGuide', 'removeGuide', 'resetGuide', 'showOutput'].map((x) => 'ghostCode.' + x);

  caso('declara los 16 comandos, con título y categoría «Ghost Code»', () => {
    assert.deepStrictEqual([...comandosManifiesto].sort(), [...IDS].sort());
    for (const c of m.contributes.commands) {
      assert.ok(c.title && c.title.length > 3, c.command);
      assert.strictEqual(c.category, 'Ghost Code');
    }
  });
  caso('atajos por defecto acordados', () => {
    const k = (cmd) => (m.contributes.keybindings ?? []).find((x) => x.command === cmd);
    assert.strictEqual(k('ghostCode.toggleVisor').key, 'ctrl+alt+h');
    assert.strictEqual(k('ghostCode.nextBlock').key, 'ctrl+alt+right');
    assert.strictEqual(k('ghostCode.prevBlock').key, 'ctrl+alt+left');
    assert.strictEqual(k('ghostCode.typeNextBlock').key, 'ctrl+alt+shift+right');
    assert.strictEqual(k('ghostCode.cancelTyping').key, 'escape');
    assert.strictEqual(k('ghostCode.cancelTyping').when, 'ghostCode.tecleando');
    assert.strictEqual(k('ghostCode.toggleShield').key, 'ctrl+alt+e');
    assert.ok(m.contributes.commands.some((c) => c.command === 'ghostCode.recoverViewer' && /Traer el visor/.test(c.title)));
  });
  caso('botón «Modo Fantasma» en la barra de pestañas (editor/title), con icono claro y oscuro que existen', () => {
    const cmd = m.contributes.commands.find((c) => c.command === 'ghostCode.ghostMode');
    assert.ok(cmd, 'falta el comando ghostCode.ghostMode');
    for (const tema of ['light', 'dark']) assert.ok(cmd.icon && fs.existsSync(path.join(raiz, cmd.icon[tema])), `falta el icono ${tema}`);
    const entrada = (m.contributes.menus['editor/title'] ?? []).find((x) => x.command === 'ghostCode.ghostMode');
    assert.ok(entrada, 'falta en editor/title');
    assert.ok(entrada.group.startsWith('navigation'));
    assert.ok(entrada.when.includes('resourceScheme == file'));
  });
  caso('menú contextual del Explorador: «Cargar guía» y «Modo Fantasma», solo en archivos y arriba del menú', () => {
    const menu = m.contributes.menus['explorer/context'] ?? [];
    for (const c of ['ghostCode.loadGuide', 'ghostCode.ghostMode']) {
      const e = menu.find((x) => x.command === c);
      assert.ok(e, `falta ${c} en explorer/context`);
      assert.ok(e.group.startsWith('navigation'), `${c}: debe ir en el grupo navigation (arriba)`);
      assert.ok(e.when.includes('resourceScheme == file') && e.when.includes('!explorerResourceIsFolder'), `${c}: when`);
    }
  });
  caso('visor oscuro: barra de título con DwmSetWindowAttribute (claro/oscuro según el tema) y scroll del tema', () => {
    const cs = (n) => fs.readFileSync(path.join(raiz, 'helper', 'ghost-viewer', n), 'utf8');
    const nativos = cs('Nativos.cs');
    assert.ok(/DwmSetWindowAttribute/.test(nativos) && /\b20\b/.test(nativos), 'falta DWMWA_USE_IMMERSIVE_DARK_MODE (20)');
    assert.ok(/\b35\b/.test(nativos) && /\b36\b/.test(nativos), 'falta el color de la barra (35) y del texto (36)');
    const form = cs('VisorForm.cs');
    assert.ok(/OnHandleCreated[\s\S]*BarraTitulo\.Aplicar/.test(form), 'la barra de título no se aplica al crear la ventana');
    assert.ok(/AplicarTema[\s\S]*BarraTitulo\.Aplicar/.test(form), 'la barra de título no sigue al tema');
    assert.ok(/::-webkit-scrollbar/.test(cs('web/visor.html')), 'falta el scroll oscuro de la página');
  });
  caso('cabecera única del visor: «Ghost Code» una sola vez; ojo, reducir, maximizar y cerrar en la misma fila; sin barra nativa ni título de la guía', () => {
    const leer = (n) => fs.readFileSync(path.join(raiz, 'helper', 'ghost-viewer', n), 'utf8');
    const html = leer('web/visor.html');
    const barra = /<header id="barra">([\s\S]*?)<\/header>/.exec(html);
    assert.ok(barra, 'falta la cabecera');
    for (const id of ['b-ojo', 'b-min', 'b-max', 'b-cerrar']) assert.ok(barra[1].includes(`id="${id}"`), `falta el botón ${id} en la cabecera`);
    assert.ok(/<span id="marca">Ghost Code<\/span>/.test(barra[1]), 'el título debe ser «Ghost Code»');
    assert.ok(!/>\s*GHOST\s*</.test(html), 'sobra el «GHOST» repetido');
    assert.ok(!/id="titulo"/.test(html), 'sobra el título del archivo de la guía');
    const form = leer('VisorForm.cs');
    assert.ok(/FormBorderStyle = FormBorderStyle\.None/.test(form), 'la ventana no debe tener la barra de título nativa (la X roja)');
    assert.ok(/WS_EX_TOOLWINDOW|0x80/.test(form), 'sigue sin botón en la barra de tareas');
    assert.ok(/case "arrastrar"/.test(form) && /case "cerrar"/.test(form), 'la página debe poder arrastrar la ventana y cerrarla');
    assert.ok(/OnMouseMove/.test(form) && /OnMouseDown/.test(form), 'sin barra nativa hay que poder redimensionar por los bordes');
  });
  caso('clic derecho en la vista «Guías»: activar y quitar una guía, y ver un bloque, además de los botones en línea', () => {
    const menu = m.contributes.menus['view/item/context'];
    const alClicDerecho = (cmd) => menu.filter((x) => x.command === cmd && !x.group.startsWith('inline'));
    assert.ok(alClicDerecho('ghostCode.activateGuide').length, 'falta «Activar guía» en el clic derecho');
    assert.ok(alClicDerecho('ghostCode.removeGuide').length, 'falta «Quitar guía» en el clic derecho');
    assert.ok(alClicDerecho('ghostCode.selectBlock').some((x) => /viewItem == bloque/.test(x.when)), 'falta «Ver bloque» en el clic derecho de un bloque');
  });
  caso('ajustes con sus valores por defecto y límites', () => {
    const p = m.contributes.configuration.properties;
    assert.strictEqual(p['ghostCode.tecleo.caracteresPorSegundo'].default, 30);
    assert.strictEqual(p['ghostCode.tecleo.caracteresPorSegundo'].minimum, 1);
    assert.strictEqual(p['ghostCode.tecleo.caracteresPorSegundo'].maximum, 200);
    assert.strictEqual(p['ghostCode.visor.siempreAlFrente'].default, true);
    assert.deepStrictEqual(p['ghostCode.visor.tema'].enum, ['auto', 'claro', 'oscuro']);
    assert.strictEqual(p['ghostCode.visor.tema'].default, 'auto');
    assert.strictEqual(p['ghostCode.arbolDiscreto'].default, false);
    assert.strictEqual(p['ghostCode.mostrarBarraDeEstado'].default, true);
    // la ruta de un ejecutable solo puede venir de la configuración de la máquina, nunca de un proyecto abierto
    assert.strictEqual(p['ghostCode.visor.rutaEjecutable'].scope, 'machine');
    assert.strictEqual(p['ghostCode.visor.rutaEjecutable'].default, '');
  });
  caso('vista «Guías» en su propio contenedor de la barra de actividad, con bienvenida e icono existente', () => {
    const cont = m.contributes.viewsContainers.activitybar.find((c) => c.id === 'ghostCode');
    assert.ok(cont, 'falta el contenedor');
    assert.ok(fs.existsSync(path.join(raiz, cont.icon)), `no existe el icono ${cont.icon}`);
    assert.ok(m.contributes.views.ghostCode.some((v) => v.id === 'ghostCode.guias' && v.name === 'Guías'));
    assert.ok(m.contributes.viewsWelcome.some((v) => v.view === 'ghostCode.guias' && v.contents.includes('command:ghostCode.loadGuide')));
  });
  caso('solo Windows x64 y en el lado local (UI); entrada y versiones correctas', () => {
    // Sin «os»/«cpu»: npm los exige también al proyecto raíz y rompía «npm ci» en Linux (el CI). VS Code no los lee;
    // la restricción a Windows x64 va en el paquete (vsce --target win32-x64, comprobado más abajo).
    assert.ok(!('os' in m) && !('cpu' in m), 'os/cpu en package.json rompen npm ci en Linux');
    assert.ok(/--target win32-x64/.test(m.scripts.package));
    assert.deepStrictEqual(m.extensionKind, ['ui']);
    assert.strictEqual(m.main, './out/extension.js');
    assert.strictEqual(m.name, 'ghost-code');
    assert.strictEqual(m.publisher, 'ramcrack');
    assert.ok(/^\^1\.\d+\.\d+$/.test(m.engines.vscode));
    assert.ok(!(m.activationEvents ?? []).includes('*'));
  });
  caso('metadatos del Marketplace: MIT, icono PNG de 256×256, repositorio, palabras clave y archivos de documentación', () => {
    assert.strictEqual(m.license, 'MIT');
    assert.deepStrictEqual(m.categories, ['Other']);
    // el repositorio de GitHub se llama ghost_code (con guion bajo); la extensión, ghost-code
    assert.strictEqual(m.repository.url, 'https://github.com/Dhaniel-05/ghost_code.git');
    assert.strictEqual(m.bugs.url, 'https://github.com/Dhaniel-05/ghost_code/issues');
    assert.strictEqual(m.homepage, 'https://github.com/Dhaniel-05/ghost_code#readme');
    for (const k of ['live coding', 'presentation', 'teleprompter', 'screen share', 'ghost']) assert.ok(m.keywords.includes(k), `falta la palabra clave «${k}»`);
    assert.strictEqual(m.icon, 'media/ghost.png');
    const png = fs.readFileSync(path.join(raiz, m.icon));
    assert.strictEqual(png.subarray(1, 4).toString(), 'PNG', 'no es un PNG');
    assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [256, 256]);
    const licencia = fs.readFileSync(path.join(raiz, 'LICENSE'), 'utf8');
    assert.ok(licencia.startsWith('MIT License') && /Copyright \(c\) 2026 Daniel Alfonso Martínez Payán/.test(licencia));
    const cambios = fs.readFileSync(path.join(raiz, 'CHANGELOG.md'), 'utf8');
    // (en Windows, Git deja los archivos con \r\n: por eso se compara por líneas y no con «\n» exacto)
    assert.ok(cambios.split(/\r?\n/).includes(`## ${m.version}`), 'CHANGELOG.md necesita una sección con la versión actual (el Release la usa como notas)');
    assert.ok(fs.existsSync(path.join(raiz, 'README.md')));
  });
  caso('empaquetado: .vsix para win32-x64, revisión previa del visor y compilación antes de empaquetar', () => {
    assert.ok(/vsce package .*--target win32-x64/.test(m.scripts.package));
    assert.ok(/--out release\//.test(m.scripts.package));
    assert.ok(/npm run compile/.test(m.scripts['vscode:prepublish']) && /verificar-paquete/.test(m.scripts['vscode:prepublish']));
    assert.ok(m.scripts['verificar:vsix'] && m.devDependencies['@vscode/vsce']);
  });
  caso('flujos de GitHub: ci.yml (pruebas en Linux y Windows + exe real) y release.yml (etiqueta vX.Y.Z)', () => {
    const wf = (n) => fs.readFileSync(path.join(raiz, '.github', 'workflows', n), 'utf8');
    const ci = wf('ci.yml');
    assert.ok(/ubuntu-latest/.test(ci) && /windows-latest/.test(ci), 'ci.yml debe probar en Linux y Windows');
    assert.ok(/npm test/.test(ci) && /compilar:visor/.test(ci) && /test:exe/.test(ci));
    const rel = wf('release.yml');
    assert.ok(/tags:\s*\n\s*-\s*"?v\*\.\*\.\*"?/.test(rel), 'release.yml se activa con etiquetas v*.*.*');
    assert.ok(/windows-latest/.test(rel) && /compilar:visor/.test(rel) && /npm run package/.test(rel) && /verificar:vsix/.test(rel));
    assert.ok(/contents:\s*write/.test(rel), 'release.yml necesita permiso para crear el Release');
    assert.ok(/github\.ref_name/.test(rel) && /package\.json/.test(rel), 'debe comprobar que la etiqueta coincide con la versión');
    assert.ok(/gh release (create|upload)/.test(rel));
    // en el runner de Windows el CHANGELOG llega con \r\n: sin quitarlos, awk no encuentra la sección y las notas salen vacías
    assert.ok(/tr -d '\\r' < CHANGELOG\.md \| awk/.test(rel), 'release.yml debe quitar los \\r antes de buscar la sección del CHANGELOG');
  });
  caso('publish-marketplace.yml: a mano, sin tokens (OIDC), solo desde la etiqueta de la versión y con el .vsix win32-x64', () => {
    const mk = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'publish-marketplace.yml'), 'utf8');
    assert.ok(/on:\s*\n\s*workflow_dispatch:/.test(mk), 'debe ejecutarse solo a mano');
    assert.ok(!/\n\s*(push|pull_request|schedule):/.test(mk), 'no debe activarse solo');
    assert.ok(/id-token:\s*write/.test(mk) && /contents:\s*read/.test(mk));
    assert.ok(/vsce(@latest)? publish .*--packagePath .*ghost-code-win32-x64-.*\.vsix.* --oidc/.test(mk), 'publica con --oidc');
    assert.ok(!/secrets\.|VSCE_PAT|\bpat\b/i.test(mk.replace(/#.*$/gm, '')), 'no debe usar tokens ni secretos');
    assert.ok(/github\.ref_type/.test(mk) && /compilar:visor/.test(mk) && /windows-latest/.test(mk));
    assert.ok(/name: Publicar en el Marketplace/.test(mk));
  });
  caso('todo comando usado en atajos, menús y bienvenida está declarado', () => {
    const usados = new Set();
    (m.contributes.keybindings ?? []).forEach((k) => usados.add(k.command));
    Object.values(m.contributes.menus ?? {}).flat().forEach((x) => usados.add(x.command));
    for (const w of m.contributes.viewsWelcome ?? []) for (const f of w.contents.matchAll(/\(command:([\w.]+)/g)) usados.add(f[1]);
    for (const c of usados) assert.ok(comandosManifiesto.includes(c), `no declarado: ${c}`);
    const ocultos = ['ghostCode.selectBlock'];
    const enPaleta = (m.contributes.menus?.commandPalette ?? []).filter((x) => x.when === 'false').map((x) => x.command);
    for (const o of ocultos) assert.ok(enPaleta.includes(o), `${o} no debe salir en la paleta`);
  });
  caso('.gitignore y .vscodeignore con lo acordado', () => {
    const lineas = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').split(/\r?\n/).map((l) => l.trim());
    const gi = lineas('.gitignore');
    for (const x of ['bin/', 'out/', 'helper/ghost-viewer/bin/', 'helper/ghost-viewer/obj/', 'release/', 'node_modules/']) assert.ok(gi.includes(x), `.gitignore: falta ${x}`);
    const vi = lineas('.vscodeignore');
    for (const x of ['src/**', 'scripts/**', 'helper/**', 'node_modules/**', 'release/**', '*.vsix', '**/*.map']) assert.ok(vi.includes(x), `.vscodeignore: falta ${x}`);
    assert.ok(!vi.some((x) => /^bin\/?(\*\*)?$/.test(x)), '.vscodeignore no debe excluir bin/ (ahí va el visor)');
  });
  caso('.vscode/launch.json (F5) y tasks.json de compilación', () => {
    const lanzar = JSON.parse(fs.readFileSync(path.join(raiz, '.vscode', 'launch.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    const c = lanzar.configurations.find((x) => x.type === 'extensionHost');
    assert.ok(c, 'falta la configuración extensionHost');
    assert.ok(c.args.some((a) => a.includes('--extensionDevelopmentPath=${workspaceFolder}')));
    assert.ok(c.outFiles.some((o) => o.includes('out/**/*.js')));
    const tareas = JSON.parse(fs.readFileSync(path.join(raiz, '.vscode', 'tasks.json'), 'utf8'));
    assert.ok(tareas.tasks.some((t) => t.label === c.preLaunchTask), 'la tarea previa no existe');
  });
  caso('el ejecutable se publica sin los .xml sobrantes de WebView2', () => {
    const csproj = fs.readFileSync(path.join(raiz, 'helper', 'ghost-viewer', 'GhostViewer.csproj'), 'utf8');
    assert.ok(/AfterTargets="Publish"/.test(csproj) && /\*\.xml/.test(csproj) && /<Delete /.test(csproj), 'el .csproj no borra los .xml al publicar');
    const dir = path.join(raiz, 'bin', 'win32-x64');
    if (fs.existsSync(dir)) assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.xml')), []);
  });

  console.log('Extensión: activación y cierre');
  await prueba('activar registra los comandos, el canal «Ghost Code», la barra y el árbol; los contextos empiezan en falso', {}, async (h) => {
    const registrados = await vscode.commands.getCommands();
    for (const id of IDS) assert.ok(registrados.includes(id), `sin registrar: ${id}`);
    assert.ok(vscode.__canales.some((c) => c.name === 'Ghost Code'));
    assert.ok(barra(), 'falta la barra de estado');
    assert.strictEqual(barra().visible, true);
    assert.ok(vscode.__arboles.has('ghostCode.guias'));
    assert.deepStrictEqual([vscode.__contextos['ghostCode.tecleando'], vscode.__contextos['ghostCode.visorVisible'], vscode.__contextos['ghostCode.guiaCargada']], [false, false, false]);
    assert.strictEqual(h.fabrica.fakes.length, 0, 'no debe arrancar el visor hasta que se pida');
  });
  await caso('se puede activar, apagar y volver a activar (nada queda registrado)', async () => {
    const h1 = await montar();
    await apagar(h1);
    const h2 = await montar();
    await apagar(h2);
  });
  await caso('desactivar sin haber activado no falla', async () => {
    await desactivar();
  });
  await prueba('desactivar cierra el ayudante una sola vez y se puede repetir', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    await desactivar();
    await desactivar();
    assert.strictEqual(h.ayudante().detenciones, 1);
  });
  await prueba('mostrarBarraDeEstado en falso la oculta; al activarlo de nuevo reaparece', { config: { 'ghostCode.mostrarBarraDeEstado': false } }, async () => {
    assert.strictEqual(barra().visible, false);
    vscode.__cambiarConfig('ghostCode.mostrarBarraDeEstado', true);
    assert.strictEqual(barra().visible, true);
  });

  console.log('Extensión: guías (carga, árbol y progreso)');
  await prueba('cargar una guía por ruta: árbol, progreso, contexto y estado guardado', {}, async (h) => {
    const ruta = await cargar(h);
    const r = await raices();
    assert.strictEqual(r.length, 1);
    const it = item(r[0]);
    assert.strictEqual(it.label, 'guia.ts');
    assert.strictEqual(it.description, '0/2');
    const hijos = await proveedor().getChildren(r[0]);
    assert.strictEqual(hijos.length, 2);
    assert.ok(String(item(hijos[0]).label).includes('Uno') && String(item(hijos[1]).label).includes('Dos'));
    assert.strictEqual(item(hijos[0]).iconPath.id, 'arrow-right');
    assert.strictEqual(item(hijos[1]).iconPath.id, 'circle-outline');
    assert.strictEqual(vscode.__contextos['ghostCode.guiaCargada'], true);
    assert.ok(barra().text.includes('0/2'));
    assert.ok(JSON.stringify(h.contexto.globalState._datos).includes(JSON.stringify(ruta).slice(1, -1)));
  });
  await prueba('usar el archivo activo como guía toma el texto del editor (aunque no esté guardado)', {}, async (h) => {
    const ruta = vscode.__archivoTemporal('activa.ts', 'viejo');
    const { documento } = crearEscenario({ texto: GUIA });
    documento.uri = uriDe(ruta);
    await h.ejecutar('ghostCode.useActiveFileAsGuide');
    const r = await raices();
    assert.strictEqual(item(r[0]).description, '0/2');
  });
  await prueba('usar el archivo activo sin editor o sin guardar (no es un archivo) avisa', {}, async (h) => {
    vscode.window.activeTextEditor = undefined;
    await h.ejecutar('ghostCode.useActiveFileAsGuide');
    assert.strictEqual(vscode.avisos.advertencias.length, 1);
    const { documento } = crearEscenario({ texto: GUIA });
    documento.uri = { scheme: 'untitled', fsPath: 'Sin título-1', toString: () => 'untitled:Sin título-1' };
    await h.ejecutar('ghostCode.useActiveFileAsGuide');
    assert.strictEqual(vscode.avisos.advertencias.length, 1);
    assert.ok(/guarda/i.test(vscode.avisos.advertencias[0]));
    assert.strictEqual((await raices()).length, 0);
  });
  await prueba('cargar sin argumento abre el selector de archivos; cancelarlo no hace nada', {}, async (h) => {
    vscode.__dialogos.abrir = undefined;
    await h.ejecutar('ghostCode.loadGuide');
    assert.strictEqual((await raices()).length, 0);
    vscode.__dialogos.abrir = [uriDe(vscode.__archivoTemporal('elegida.ts', GUIA))];
    await h.ejecutar('ghostCode.loadGuide');
    assert.strictEqual((await raices()).length, 1);
  });
  await prueba('archivo inexistente, demasiado grande o sin bloques: avisa y no agrega nada', {}, async (h) => {
    await h.ejecutar('ghostCode.loadGuide', uriDe(path.join(raiz, 'no-existe', 'x.ts')));
    assert.strictEqual(vscode.avisos.errores.length, 1);
    await cargar(h, 'x'.repeat(2 * 1024 * 1024 + 1), 'grande.ts');
    assert.strictEqual(vscode.avisos.errores.length, 2);
    await cargar(h, '   \n\n  ', 'vacia.ts');
    assert.strictEqual(vscode.avisos.advertencias.length, 1);
    assert.ok(/bloques/i.test(vscode.avisos.advertencias[0]));
    assert.strictEqual((await raices()).length, 0);
  });
  await prueba('cargar dos veces el mismo archivo no duplica: reemplaza el contenido y reinicia el progreso', {}, async (h) => {
    const ruta = await cargar(h);
    fs.writeFileSync(ruta, '// @@paso: Solo\nx();\n');
    await h.ejecutar('ghostCode.loadGuide', uriDe(ruta));
    const r = await raices();
    assert.strictEqual(r.length, 1);
    assert.strictEqual(item(r[0]).description, '0/1');
  });
  await prueba('varias guías: la última cargada queda activa y se puede activar otra', {}, async (h) => {
    await cargar(h, GUIA, 'a.ts');
    await cargar(h, '// @@paso: X\nx();\n', 'b.ts');
    let r = await raices();
    assert.strictEqual(r.length, 2);
    assert.ok(barra().text.includes('0/1'));
    await h.ejecutar('ghostCode.activateGuide', r[0]);
    assert.ok(barra().text.includes('0/2'));
  });
  await prueba('quitar la guía activa vacía el árbol, el contexto y el estado guardado', {}, async (h) => {
    await cargar(h);
    const r = await raices();
    await h.ejecutar('ghostCode.removeGuide', r[0]);
    assert.strictEqual((await raices()).length, 0);
    assert.strictEqual(vscode.__contextos['ghostCode.guiaCargada'], false);
    assert.ok(!JSON.stringify(h.contexto.globalState._datos).includes('guia.ts'));
  });
  await prueba('al arrancar se restauran las guías guardadas que sigan existiendo', {}, async (h) => {
    const ruta = await cargar(h);
    const guardado = JSON.parse(JSON.stringify(h.contexto.globalState._datos));
    await apagar(h);
    const h2 = await montar({ estado: guardado });
    try {
      assert.strictEqual((await raices()).length, 1);
      fs.unlinkSync(ruta);
      await apagar(h2);
      const h3 = await montar({ estado: guardado });
      try {
        assert.strictEqual((await raices()).length, 0, 'una guía borrada no debe aparecer');
      } finally {
        await apagar(h3);
      }
      return;
    } finally {
      // h2 ya se apagó dentro del bloque; no se repite
    }
  });

  console.log('Extensión: Live Coding desde los comandos');
  await prueba('«siguiente bloque» escribe en el editor activo, avanza el progreso y NO arranca el visor', {}, async (h) => {
    await cargar(h);
    const { documento } = crearEscenario({ texto: '' });
    assert.strictEqual(await h.ejecutar('ghostCode.nextBlock'), 'insertado');
    assert.strictEqual(documento.texto, 'const a = 1;');
    const r = await raices();
    assert.strictEqual(item(r[0]).description, '1/2');
    const hijos = await proveedor().getChildren(r[0]);
    assert.strictEqual(item(hijos[0]).iconPath.id, 'pass');
    assert.strictEqual(item(hijos[1]).iconPath.id, 'arrow-right');
    assert.ok(barra().text.includes('1/2'));
    assert.strictEqual(h.fabrica.fakes.length, 0);
  });
  await prueba('«retroceder» quita el último bloque y el progreso baja', {}, async (h) => {
    await cargar(h);
    const { documento } = crearEscenario({ texto: '' });
    await h.ejecutar('ghostCode.nextBlock');
    assert.strictEqual(await h.ejecutar('ghostCode.prevBlock'), 'retrocedido');
    assert.strictEqual(documento.texto, '');
    assert.strictEqual(item((await raices())[0]).description, '0/2');
  });
  await prueba('si el archivo activo es la propia guía no escribe en ella: avisa', {}, async (h) => {
    const ruta = await cargar(h);
    const { documento } = crearEscenario({ texto: GUIA });
    documento.uri = uriDe(ruta);
    assert.strictEqual(await h.ejecutar('ghostCode.nextBlock'), 'es-la-guia');
    assert.strictEqual(documento.texto, GUIA);
    assert.ok(/gu[ií]a/i.test(vscode.avisos.advertencias[0]));
    assert.strictEqual(item((await raices())[0]).description, '0/2');
  });
  await prueba('sin guía cargada: avisa con un mensaje claro', {}, async (h) => {
    crearEscenario({ texto: '' });
    assert.strictEqual(await h.ejecutar('ghostCode.nextBlock'), 'sin-bloques');
    assert.strictEqual(vscode.avisos.advertencias.length, 1);
    assert.strictEqual(await h.ejecutar('ghostCode.typeNextBlock'), 'sin-bloques');
    assert.strictEqual(await h.ejecutar('ghostCode.prevBlock'), 'sin-bloques');
  });
  await prueba('tecleo: escribe el bloque con la velocidad de los ajustes', { config: { 'ghostCode.tecleo.caracteresPorSegundo': 200 } }, async (h) => {
    await cargar(h);
    const { documento } = crearEscenario({ texto: '' });
    assert.strictEqual(await h.ejecutar('ghostCode.typeNextBlock'), 'tecleado');
    assert.strictEqual(documento.texto, 'const a = 1;');
    assert.strictEqual(vscode.__contextos['ghostCode.tecleando'], false);
  });
  await prueba('tecleo: el contexto «tecleando» vale verdadero mientras escribe y «cancelar» lo detiene', { config: { 'ghostCode.tecleo.caracteresPorSegundo': 1 } }, async (h) => {
    await cargar(h);
    const { documento } = crearEscenario({ texto: '' });
    const p = h.ejecutar('ghostCode.typeNextBlock');
    await dormir(60);
    assert.strictEqual(vscode.__contextos['ghostCode.tecleando'], true);
    assert.ok(barra().text.includes('sync~spin'));
    await h.ejecutar('ghostCode.cancelTyping');
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, '');
    assert.strictEqual(vscode.__contextos['ghostCode.tecleando'], false);
    assert.ok(!barra().text.includes('sync~spin'));
  });
  await prueba('reiniciar la guía vuelve el progreso a 0', {}, async (h) => {
    await cargar(h);
    crearEscenario({ texto: '' });
    await h.ejecutar('ghostCode.nextBlock');
    await h.ejecutar('ghostCode.resetGuide');
    assert.strictEqual(item((await raices())[0]).description, '0/2');
  });

  console.log('Extensión: visor flotante');
  await prueba('mostrar el visor la primera vez: crea el ayudante con la ruta por defecto y le manda todo en orden', {}, async (h) => {
    await cargar(h);
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    assert.strictEqual(h.fabrica.fakes.length, 1);
    const f = h.ayudante();
    assert.strictEqual(f.opciones.ruta, RUTA_EXE);
    assert.deepStrictEqual(f.tipos(), ['tema', 'siempreAlFrente', 'cargarGuia', 'seleccionarBloque', 'mostrar']);
    assert.deepStrictEqual(f.comandos[0], { tipo: 'tema', valor: 'oscuro' });
    assert.deepStrictEqual(f.comandos[1], { tipo: 'siempreAlFrente', valor: true });
    assert.strictEqual(f.comandos[2].lenguaje, 'typescript');
    assert.strictEqual(f.comandos[2].bloques.length, 2);
    assert.deepStrictEqual(f.comandos[3], { tipo: 'seleccionarBloque', indice: 0 });
    assert.ok(barra().text.includes('$(eye)') && !barra().text.includes('eye-closed'));
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], true);
  });
  await prueba('el segundo toggle oculta y vuelve a mostrar sin crear otro ayudante', {}, async (h) => {
    await cargar(h);
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    assert.strictEqual(h.fabrica.fakes.length, 1);
    assert.strictEqual(h.ayudante().comandos.at(-1).tipo, 'ocultar');
    assert.ok(barra().text.includes('eye-closed'));
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], false);
    await h.ejecutar('ghostCode.toggleVisor');
    assert.strictEqual(h.ayudante().comandos.at(-1).tipo, 'mostrar');
  });
  await prueba('la ruta del ejecutable de los ajustes (máquina) tiene prioridad', { config: { 'ghostCode.visor.rutaEjecutable': 'C:\\herramientas\\gv.exe' } }, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    assert.strictEqual(h.ayudante().opciones.ruta, 'C:\\herramientas\\gv.exe');
  });
  await prueba('si el ayudante no arranca: muestra el motivo, no lanza error y el siguiente intento vuelve a probar', {}, async (h) => {
    h.fabrica.error = new ErrorAyudante('no-existe', 'No se encontró ghost-viewer en «X».');
    await h.ejecutar('ghostCode.toggleVisor');
    assert.strictEqual(vscode.avisos.errores.length, 1);
    assert.ok(vscode.avisos.errores[0].includes('ghost-viewer'));
    assert.ok(barra().text.includes('eye-closed'));
    h.fabrica.error = undefined;
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    assert.strictEqual(h.fabrica.fakes.length, 2);
    assert.strictEqual(h.fabrica.fakes[1].comandos.at(-1).tipo, 'mostrar');
  });
  await prueba('sin protección de captura: no se muestra, avisa y la barra lo advierte', {}, async (h) => {
    h.fabrica.proteccion = false;
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    assert.ok(!h.ayudante().tipos().includes('mostrar'));
    assert.ok(vscode.avisos.advertencias.some((a) => /captura|protecci/i.test(a)));
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], false);
    assert.ok(barra().backgroundColor && /warning/i.test(barra().backgroundColor.id));
  });
  await prueba('con el visor activo, cada bloque insertado deja el siguiente seleccionado (y el último al terminar)', {}, async (h) => {
    await cargar(h);
    await h.ejecutar('ghostCode.toggleVisor');
    crearEscenario({ texto: '' });
    await h.ejecutar('ghostCode.nextBlock');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 1 });
    await h.ejecutar('ghostCode.nextBlock');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 1 });
    await h.ejecutar('ghostCode.prevBlock');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 1 });
    await h.ejecutar('ghostCode.prevBlock');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 0 });
  });
  await prueba('cargar o quitar una guía con el visor activo lo actualiza', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    const antes = h.ayudante().comandos.length;
    await cargar(h);
    assert.deepStrictEqual(h.ayudante().tipos().slice(antes), ['cargarGuia', 'seleccionarBloque']);
    await h.ejecutar('ghostCode.removeGuide', (await raices())[0]);
    const ultimo = h.ayudante().comandos.at(-1);
    assert.strictEqual(ultimo.tipo, 'cargarGuia');
    assert.deepStrictEqual(ultimo.bloques, []);
  });
  await prueba('«seleccionar bloque» del árbol se ve en el visor sin mover el progreso y sin arrancarlo', {}, async (h) => {
    await cargar(h);
    const hijos = await proveedor().getChildren((await raices())[0]);
    const cmd = item(hijos[1]).command;
    assert.strictEqual(cmd.command, 'ghostCode.selectBlock');
    await h.ejecutar(cmd.command, ...cmd.arguments);
    assert.strictEqual(h.fabrica.fakes.length, 0);
    await h.ejecutar('ghostCode.toggleVisor');
    await h.ejecutar(cmd.command, ...cmd.arguments);
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 1 });
    assert.strictEqual(item((await raices())[0]).description, '0/2');
  });
  await prueba('«Ver bloque» desde el clic derecho (llega el nodo del árbol, no los argumentos del clic): también lo muestra en el visor', {}, async (h) => {
    await cargar(h);
    await h.ejecutar('ghostCode.toggleVisor');
    const nodoBloque = (await proveedor().getChildren((await raices())[0]))[1];
    await h.ejecutar('ghostCode.selectBlock', nodoBloque);
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'seleccionarBloque', indice: 1 });
  });
  await prueba('ajustes en vivo: el tema (claro/oscuro/auto) y «siempre al frente» llegan al visor', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    vscode.__cambiarConfig('ghostCode.visor.tema', 'claro');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'tema', valor: 'claro' });
    vscode.__cambiarConfig('ghostCode.visor.tema', 'auto');
    vscode.__cambiarTema(vscode.ColorThemeKind.Light);
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'tema', valor: 'claro' });
    vscode.__cambiarTema(vscode.ColorThemeKind.HighContrast);
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'tema', valor: 'oscuro' });
    vscode.__cambiarConfig('ghostCode.visor.siempreAlFrente', false);
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'siempreAlFrente', valor: false });
  });
  await prueba('alternar «siempre al frente» invierte el estado actual', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    await h.ejecutar('ghostCode.toggleSiempreAlFrente');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'siempreAlFrente', valor: false });
    await h.ejecutar('ghostCode.toggleSiempreAlFrente');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'siempreAlFrente', valor: true });
  });
  await prueba('eventos del ayudante: errores del visor y avisos llegan a la persona y al canal de salida', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    const f = h.ayudante();
    f.emitir({ tipo: 'error', mensaje: 'sin WebView2', codigo: 'webview2-ausente' });
    assert.ok(vscode.avisos.errores.some((e) => /WebView2/i.test(e)));
    f.avisar({ tipo: 'agotado', intentos: 2 });
    assert.ok(vscode.avisos.errores.length >= 2);
    f.avisar({ tipo: 'stderr', texto: 'hola desde el visor' });
    f.avisar({ tipo: 'reiniciando', intento: 1 });
    const canal = vscode.__canales.find((c) => c.name === 'Ghost Code');
    assert.ok(canal.lineas.some((l) => l.includes('hola desde el visor')));
    assert.ok(canal.lineas.some((l) => /reinici/i.test(l)));
  });
  await prueba('«mostrar salida» abre el canal de salida', {}, async (h) => {
    await h.ejecutar('ghostCode.showOutput');
    assert.strictEqual(vscode.__canales.find((c) => c.name === 'Ghost Code').mostrado, 1);
  });

  console.log('Extensión: escudo y recuperación del visor');
  await prueba('escudo con el visor abierto: lo manda, lo recuerda y la barra muestra el candado; al quitarlo vuelve el ojo', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    await h.ejecutar('ghostCode.toggleShield');
    await tick();
    await tick();
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'escudo', valor: true });
    assert.strictEqual(vscode.__contextos['ghostCode.escudo'], true);
    assert.ok(barra().text.includes('$(lock)'), barra().text);
    await h.ejecutar('ghostCode.toggleShield');
    await tick();
    await tick();
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'escudo', valor: false });
    assert.strictEqual(vscode.__contextos['ghostCode.escudo'], false);
    assert.ok(barra().text.includes('$(eye)') && !barra().text.includes('lock'));
  });
  await prueba('escudo antes de abrir el visor: se recuerda y se aplica al arrancar (después de tema y siempre al frente)', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleShield');
    assert.strictEqual(h.fabrica.fakes.length, 0, 'no debe arrancar el visor solo por activar el escudo');
    assert.strictEqual(vscode.__contextos['ghostCode.escudo'], true);
    await cargar(h);
    await h.ejecutar('ghostCode.toggleVisor');
    assert.deepStrictEqual(h.ayudante().tipos(), ['tema', 'siempreAlFrente', 'escudo', 'cargarGuia', 'seleccionarBloque', 'mostrar']);
  });
  await prueba('si la persona pulsa el ojo dentro del visor, la extensión se entera (contexto y barra)', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    h.ayudante().emitir({ tipo: 'escudoCambiado', activo: true });
    assert.strictEqual(vscode.__contextos['ghostCode.escudo'], true);
    assert.ok(barra().text.includes('$(lock)'));
    // y el siguiente toggle del atajo lo quita (parte del estado real, no del último atajo)
    await h.ejecutar('ghostCode.toggleShield');
    assert.deepStrictEqual(h.ayudante().comandos.at(-1), { tipo: 'escudo', valor: false });
  });
  await prueba('«Traer el visor aquí» con el visor abierto: manda «traer» y lo deja visible', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    await tick();
    await tick();
    await h.ejecutar('ghostCode.recoverViewer');
    assert.strictEqual(h.ayudante().comandos.at(-1).tipo, 'traer');
    assert.strictEqual(vscode.avisos.advertencias.length, 0);
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], true);
  });
  await prueba('«Traer el visor aquí» con el visor cerrado o caído: lo arranca de nuevo y lo trae', {}, async (h) => {
    await cargar(h);
    await h.ejecutar('ghostCode.recoverViewer');
    assert.strictEqual(h.fabrica.fakes.length, 1);
    assert.deepStrictEqual(h.ayudante().tipos(), ['tema', 'siempreAlFrente', 'cargarGuia', 'seleccionarBloque', 'traer']);
    h.ayudante().estado = 'fallido'; // el proceso murió
    await h.ejecutar('ghostCode.recoverViewer');
    assert.strictEqual(h.fabrica.fakes.length, 2, 'debe crear otro ayudante');
    assert.strictEqual(h.fabrica.fakes[1].comandos.at(-1).tipo, 'traer');
  });
  await prueba('«Traer el visor aquí» sin protección de captura o con el visor roto: avisa y no envía nada', {}, async (h) => {
    h.fabrica.proteccion = false;
    await h.ejecutar('ghostCode.recoverViewer');
    assert.ok(!h.ayudante().tipos().includes('traer'));
    assert.ok(vscode.avisos.advertencias.some((a) => /captura|protecci/i.test(a)));
    const h2 = await montar();
    try {
      h2.fabrica.error = new ErrorAyudante('no-existe', 'No se encontró ghost-viewer en «X».');
      await h2.ejecutar('ghostCode.recoverViewer');
      assert.strictEqual(vscode.avisos.errores.length, 1);
    } finally {
      await apagar(h2);
    }
  });
  await prueba('si pides mostrar y el visor no responde: avisa («puede estar perdido») y el botón «Traer el visor» lo trae', {}, async (h) => {
    h.fabrica.silencioso = true;
    vscode.__eleccion = 'Traer el visor';
    await h.ejecutar('ghostCode.toggleVisor');
    assert.ok(vscode.avisos.advertencias.some((a) => /no respondi/i.test(a)), JSON.stringify(vscode.avisos.advertencias));
    assert.deepStrictEqual(h.ayudante().tipos().slice(-2), ['mostrar', 'traer']);
  });
  await prueba('si responde a tiempo no hay ningún aviso', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    assert.deepStrictEqual(vscode.avisos.advertencias, []);
  });
  await prueba('los cambios de modo del visor (compacto/maximizado) quedan en el canal de salida', {}, async (h) => {
    await h.ejecutar('ghostCode.toggleVisor');
    h.ayudante().emitir({ tipo: 'modoCambiado', valor: 'compacto' });
    const canal = vscode.__canales.find((c) => c.name === 'Ghost Code');
    assert.ok(canal.lineas.some((l) => /compacto/.test(l)));
  });

  console.log('Extensión: Modo Fantasma');
  /** Un archivo abierto en el editor activo, con su pestaña. El texto del editor es la guía; el de disco es otro a propósito. */
  const abrirArchivo = ({ texto = GUIA, nombre = 'fantasma.ts', dirty = false } = {}) => {
    const ruta = vscode.__archivoTemporal(nombre, 'contenido en disco');
    const { documento } = crearEscenario({ texto });
    documento.uri = uriDe(ruta);
    documento.languageId = 'typescript';
    documento.isDirty = dirty;
    const tab = vscode.__abrirPestana(documento.uri, { dirty });
    return { ruta, documento, tab };
  };

  await prueba('Modo Fantasma: carga el archivo como guía, abre el visor y SOLO DESPUÉS cierra la pestaña', {}, async (h) => {
    const { ruta, documento, tab } = abrirArchivo();
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'fantasma');
    const r = await raices();
    assert.strictEqual(r.length, 1);
    assert.strictEqual(item(r[0]).description, '0/2'); // la guía sale del texto del editor, no del disco
    const f = h.ayudante();
    assert.deepStrictEqual(f.tipos(), ['tema', 'siempreAlFrente', 'cargarGuia', 'seleccionarBloque', 'mostrar']);
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, [tab]);
    assert.deepStrictEqual(vscode.__bitacora, ['visible', 'cerrar:' + ruta], 'la pestaña debe cerrarse cuando el visor ya se ve');
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], true);
    assert.strictEqual(documento.guardados, 0);
  });
  await prueba('Modo Fantasma con cambios sin guardar: guarda antes de cerrar (así no sale el aviso de «¿guardar?» en pantalla)', {}, async (h) => {
    const { documento, tab } = abrirArchivo({ dirty: true });
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'fantasma');
    assert.strictEqual(documento.guardados, 1);
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, [tab]);
  });
  await prueba('Modo Fantasma sin protección de captura: NO cierra la pestaña (el código no puede desaparecer sin visor) y avisa', {}, async (h) => {
    h.fabrica.proteccion = false;
    abrirArchivo();
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'sin-visor');
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, []);
    assert.ok(vscode.avisos.advertencias.some((a) => /captura|protecci/i.test(a)));
    assert.strictEqual((await raices()).length, 1, 'la guía sí queda cargada');
  });
  await prueba('Modo Fantasma con el visor roto: NO cierra la pestaña y muestra el motivo', {}, async (h) => {
    h.fabrica.error = new ErrorAyudante('no-existe', 'No se encontró ghost-viewer en «X».');
    abrirArchivo();
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'sin-visor');
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, []);
    assert.strictEqual(vscode.avisos.errores.length, 1);
  });
  await prueba('Modo Fantasma sin editor, o con un archivo sin guardar en disco: avisa y no toca nada', {}, async (h) => {
    vscode.window.activeTextEditor = undefined;
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'sin-editor');
    assert.strictEqual(vscode.avisos.advertencias.length, 1);
    const { documento } = crearEscenario({ texto: GUIA });
    documento.uri = { scheme: 'untitled', fsPath: 'Sin título-1', toString: () => 'untitled:Sin título-1' };
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'sin-editor');
    assert.ok(/guarda/i.test(vscode.avisos.advertencias[0]));
    assert.strictEqual(h.fabrica.fakes.length, 0);
  });
  await prueba('Modo Fantasma con un archivo sin bloques: avisa, no abre el visor ni cierra la pestaña', {}, async (h) => {
    abrirArchivo({ texto: '   \n  ' });
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'sin-guia');
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, []);
    assert.strictEqual(h.fabrica.fakes.length, 0);
    assert.ok(/bloques/i.test(vscode.avisos.advertencias[0]));
  });
  await prueba('Modo Fantasma desde el Explorador (archivo sin abrir): lo lee del disco, abre el visor y no cierra nada', {}, async (h) => {
    const ruta = vscode.__archivoTemporal('del-explorador.ts', GUIA);
    vscode.window.activeTextEditor = undefined;
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode', uriDe(ruta)), 'fantasma');
    assert.strictEqual(item((await raices())[0]).description, '0/2');
    assert.strictEqual(h.ayudante().comandos.at(-1).tipo, 'mostrar');
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, []);
  });
  await prueba('Modo Fantasma con otro archivo mientras el visor ya se ve: no lo oculta, cambia la guía y cierra esa pestaña', {}, async (h) => {
    const a = abrirArchivo({ nombre: 'a.ts' });
    await h.ejecutar('ghostCode.ghostMode');
    const b = abrirArchivo({ nombre: 'b.ts', texto: '// @@paso: Solo\nx();\n' });
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode'), 'fantasma');
    assert.ok(!h.ayudante().tipos().includes('ocultar'));
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, [a.tab, b.tab]);
    assert.strictEqual(item((await raices()).at(-1)).description, '0/1');
    assert.strictEqual(vscode.__contextos['ghostCode.visorVisible'], true);
  });
  await prueba('Modo Fantasma con la ruta de un archivo abierto que NO es el activo: cierra esa pestaña y deja la otra', {}, async (h) => {
    const a = abrirArchivo({ nombre: 'objetivo.ts' });
    vscode.workspace.textDocuments.push(a.documento);
    const b = abrirArchivo({ nombre: 'activo.ts', texto: 'otra cosa' });
    assert.strictEqual(await h.ejecutar('ghostCode.ghostMode', a.documento.uri), 'fantasma');
    assert.deepStrictEqual(vscode.window.tabGroups.cerradas, [a.tab]);
    assert.ok(!vscode.window.tabGroups.cerradas.includes(b.tab));
  });

  console.log('Extensión: modo discreto');
  await prueba('árbol discreto: sin nombres de archivo, sin títulos de bloque y sin textos de ayuda', { config: { 'ghostCode.arbolDiscreto': true } }, async (h) => {
    await cargar(h, GUIA, 'secreto.ts');
    const r = await raices();
    const it = item(r[0]);
    assert.strictEqual(it.label, 'Guía 1');
    assert.ok(!JSON.stringify(it).includes('secreto'));
    const hijos = await proveedor().getChildren(r[0]);
    assert.strictEqual(item(hijos[0]).label, 'Paso 1');
    assert.ok(!JSON.stringify(hijos.map(item)).includes('Uno'));
    assert.ok(!JSON.stringify(hijos.map(item)).includes('const'));
    assert.ok(!barra().text.includes('secreto'));
  });
  await prueba('el árbol normal nunca muestra el código de los bloques', {}, async (h) => {
    await cargar(h);
    const hijos = await proveedor().getChildren((await raices())[0]);
    assert.ok(!JSON.stringify(hijos.map(item)).includes('const a'));
    assert.ok(!(barra().tooltip + '').includes('const a'));
  });

  fin('Extensión');
})();
