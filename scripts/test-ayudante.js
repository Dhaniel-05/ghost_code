// Responsabilidad: pruebas del gestor del ayudante (arranque, comandos, eventos, cierre limpio, recuperación) con un ayudante falso.
// Requiere: npm run compile        Uso: node scripts/test-ayudante.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { caso, fin } = require('./_caso');
const { Ayudante, ErrorAyudante, validarRutaBinario } = require('../out/platform/ayudante');

const FALSO = path.join(__dirname, 'ayudante-falso.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-ayudante-'));
const creados = [];
let n = 0;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 4000, que = 'la condición') {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (cond()) return;
    await dormir(20);
  }
  throw new Error(`no se cumplió a tiempo: ${que}`);
}
const procesoMuerto = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return e.code === 'ESRCH';
  }
};
const leer = (ruta) => (fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '');
const tipos = (lineas) => lineas.map((l) => JSON.parse(l).tipo);

/** Ayudante apuntando al ayudante falso; devuelve también lo que se recibió y lo que el falso anotó. */
function crear(modo, extra = {}) {
  const id = ++n;
  const f = (nombre) => path.join(tmp, `${nombre}-${id}.txt`);
  const rutas = { registro: f('reg'), pid: f('pid'), contador: f('cont'), limpia: f('limpia') };
  const eventos = [];
  const avisos = [];
  const a = new Ayudante({
    ruta: process.execPath,
    argumentos: [FALSO, `--modo=${modo}`, `--registro=${rutas.registro}`, `--pid=${rutas.pid}`, `--contador=${rutas.contador}`, `--salida-limpia=${rutas.limpia}`],
    tiempoListoMs: 3000,
    tiempoCierreMs: 800,
    reintentos: 0,
    esperaReinicioMs: 20,
    alEvento: (e) => eventos.push(e),
    alAviso: (x) => avisos.push(x),
    ...extra,
  });
  creados.push({ a, rutas });
  return {
    a,
    eventos,
    avisos,
    rutas,
    pid: () => Number(leer(rutas.pid)),
    // lo anotado por el falso, separado por ejecución: [[líneas de la 1.ª], [líneas de la 2.ª], …]
    ejecuciones: () => {
      const res = [];
      for (const l of leer(rutas.registro).split('\n')) {
        if (l === '#inicio') res.push([]);
        else if (l.trim()) res[res.length - 1].push(l);
      }
      return res;
    },
  };
}

async function limpiar() {
  for (const { a, rutas } of creados) {
    try {
      await a.detener();
    } catch {}
    const pid = Number(leer(rutas.pid));
    if (pid && !procesoMuerto(pid)) {
      try {
        process.kill(pid);
      } catch {}
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  console.log('Gestor del ayudante');

  // --- Ruta del ejecutable ---
  await caso('ruta relativa → ruta-no-absoluta y no se lanza nada', async () => {
    const t = crear('normal', { ruta: 'ghost-viewer.exe' });
    await assert.rejects(t.a.iniciar(), (e) => e instanceof ErrorAyudante && e.codigo === 'ruta-no-absoluta');
    assert.strictEqual(t.a.estado, 'fallido');
    assert.strictEqual(t.ejecuciones().length, 0);
  });
  await caso('el .exe aún no compilado → no-existe, con un mensaje que lo explica', async () => {
    const t = crear('normal', { ruta: path.join(tmp, 'bin', 'win32-x64', 'ghost-viewer.exe') });
    await assert.rejects(t.a.iniciar(), (e) => e.codigo === 'no-existe' && /ghost-viewer/.test(e.message));
    assert.strictEqual(t.a.estado, 'fallido');
  });
  await caso('una carpeta en lugar del ejecutable → no-es-archivo', async () => {
    const t = crear('normal', { ruta: tmp });
    await assert.rejects(t.a.iniciar(), (e) => e.codigo === 'no-es-archivo');
  });
  await caso('validarRutaBinario acepta un archivo real y no lanza', () => {
    validarRutaBinario(process.execPath);
  });
  await caso('validarRutaBinario con ruta vacía o con carácter nulo → error tipado', () => {
    for (const mala of ['', 'a\u0000b']) assert.throws(() => validarRutaBinario(mala), (e) => e instanceof ErrorAyudante);
  });

  // --- Arranque ---
  await caso('arranca, espera «listo» y lo entrega', async () => {
    const t = crear('normal');
    assert.strictEqual(t.a.estado, 'detenido');
    const listo = await t.a.iniciar();
    assert.deepStrictEqual(listo, { tipo: 'listo', protocolo: 1, afinidad: true });
    assert.strictEqual(t.a.estado, 'listo');
    assert.strictEqual(t.a.proteccionActiva, true);
    assert.deepStrictEqual(tipos(t.eventos.map((e) => JSON.stringify(e))), ['listo']);
  });
  await caso('iniciar dos veces (incluso a la vez) no crea un segundo proceso', async () => {
    const t = crear('normal');
    const [x, y] = await Promise.all([t.a.iniciar(), t.a.iniciar()]);
    assert.deepStrictEqual(x, y);
    assert.deepStrictEqual(await t.a.iniciar(), x);
    assert.strictEqual(t.ejecuciones().length, 1);
  });
  await caso('si nunca llega «listo» → tiempo-agotado y el proceso muere', async () => {
    const t = crear('sin-listo', { tiempoListoMs: 300 });
    await assert.rejects(t.a.iniciar(), (e) => e.codigo === 'tiempo-agotado');
    assert.strictEqual(t.a.estado, 'fallido');
    await hasta(() => procesoMuerto(t.pid()), 3000, 'proceso muerto');
  });
  await caso('si el proceso sale antes de «listo» → salio-antes-de-listo', async () => {
    const t = crear('sale-ya');
    await assert.rejects(t.a.iniciar(), (e) => e.codigo === 'salio-antes-de-listo');
    assert.strictEqual(t.a.estado, 'fallido');
  });
  await caso('versión de protocolo distinta → protocolo-incompatible y el proceso muere', async () => {
    const t = crear('protocolo-viejo');
    await assert.rejects(t.a.iniciar(), (e) => e.codigo === 'protocolo-incompatible');
    await hasta(() => procesoMuerto(t.pid()), 3000, 'proceso muerto');
  });
  await caso('sin protección de captura: avisa y nunca se le envía «mostrar»', async () => {
    const t = crear('sin-afinidad');
    await t.a.iniciar();
    assert.strictEqual(t.a.proteccionActiva, false);
    assert.ok(t.avisos.some((x) => x.tipo === 'sin-proteccion'));
    assert.strictEqual(t.a.enviar({ tipo: 'mostrar' }), false);
    assert.strictEqual(t.a.enviar({ tipo: 'tema', valor: 'claro' }), true); // lo demás sí funciona
    await hasta(() => t.ejecuciones()[0].length >= 1, 3000, 'el tema llegó');
    assert.deepStrictEqual(tipos(t.ejecuciones()[0]), ['tema']);
  });

  // --- Comandos y eventos ---
  await caso('enviar escribe una línea JSON por comando, en orden', async () => {
    const t = crear('normal');
    await t.a.iniciar();
    const cmds = [
      { tipo: 'tema', valor: 'oscuro' },
      { tipo: 'cargarGuia', titulo: 'G', lenguaje: 'js', bloques: [{ indice: 0, titulo: 'a', texto: 'x\ny' }] },
      { tipo: 'seleccionarBloque', indice: 0 },
      { tipo: 'siempreAlFrente', valor: true },
    ];
    for (const c of cmds) assert.strictEqual(t.a.enviar(c), true);
    await hasta(() => t.ejecuciones()[0].length === 4, 3000, 'cuatro comandos');
    assert.deepStrictEqual(t.ejecuciones()[0].map((l) => JSON.parse(l)), cmds);
  });
  await caso('los eventos del visor llegan a alEvento, en orden', async () => {
    const t = crear('normal');
    await t.a.iniciar();
    t.a.enviar({ tipo: 'mostrar' });
    t.a.enviar({ tipo: 'seleccionarBloque', indice: 3 });
    t.a.enviar({ tipo: 'ocultar' });
    await hasta(() => t.eventos.length === 4, 3000, 'cuatro eventos');
    assert.deepStrictEqual(t.eventos.slice(1), [
      { tipo: 'visibilidadCambiada', visible: true },
      { tipo: 'bloqueSeleccionado', indice: 3 },
      { tipo: 'visibilidadCambiada', visible: false },
    ]);
  });
  await caso('una guía grande (cientos de KB en una línea) llega completa', async () => {
    const t = crear('normal');
    await t.a.iniciar();
    const bloques = Array.from({ length: 2000 }, (_, i) => ({ indice: i, titulo: `P${i}`, texto: 'x'.repeat(200) }));
    assert.strictEqual(t.a.enviar({ tipo: 'cargarGuia', titulo: 'Grande', lenguaje: 'js', bloques }), true);
    await hasta(() => t.ejecuciones()[0].length === 1, 5000, 'línea grande');
    const m = JSON.parse(t.ejecuciones()[0][0]);
    assert.strictEqual(m.bloques.length, 2000);
    assert.strictEqual(m.bloques[1999].texto.length, 200);
  });
  await caso('líneas basura, vacías y partidas: solo llegan los eventos válidos y el ayudante sigue listo', async () => {
    const t = crear('ruidoso');
    await t.a.iniciar();
    await hasta(() => t.eventos.length === 3, 3000, 'eventos válidos');
    assert.deepStrictEqual(t.eventos.map((e) => e.tipo), ['listo', 'visibilidadCambiada', 'bloqueSeleccionado']);
    assert.strictEqual(t.eventos[1].visible, true);
    assert.strictEqual(t.avisos.filter((x) => x.tipo === 'linea-invalida').length, 3);
    assert.strictEqual(t.a.estado, 'listo');
  });
  await caso('un evento «error» del visor se entrega y no tumba al ayudante', async () => {
    const t = crear('con-error');
    await t.a.iniciar();
    await hasta(() => t.eventos.some((e) => e.tipo === 'error'), 3000, 'evento error');
    assert.deepStrictEqual(t.eventos.find((e) => e.tipo === 'error'), { tipo: 'error', mensaje: 'boom', codigo: 'E1' });
    assert.strictEqual(t.a.estado, 'listo');
  });
  await caso('lo que escribe en stderr llega como aviso', async () => {
    const t = crear('con-stderr');
    await t.a.iniciar();
    await hasta(() => t.avisos.some((x) => x.tipo === 'stderr'), 3000, 'aviso stderr');
    assert.ok(t.avisos.find((x) => x.tipo === 'stderr').texto.includes('hola desde stderr'));
  });
  await caso('si alEvento lanza un error, los eventos siguientes igual llegan', async () => {
    const vistos = [];
    const t = crear('normal', {
      alEvento: (e) => {
        vistos.push(e);
        if (e.tipo === 'bloqueSeleccionado' && e.indice === 1) throw new Error('boom del manejador');
      },
    });
    await t.a.iniciar();
    t.a.enviar({ tipo: 'seleccionarBloque', indice: 1 });
    t.a.enviar({ tipo: 'seleccionarBloque', indice: 2 });
    await hasta(() => vistos.some((e) => e.indice === 2), 3000, 'segundo evento');
    assert.ok(t.avisos.some((x) => x.tipo === 'error-en-manejador' && /boom del manejador/.test(x.mensaje)));
    assert.strictEqual(t.a.estado, 'listo');
  });
  await caso('enviar antes de iniciar devuelve false y no lanza', () => {
    const t = crear('normal');
    assert.strictEqual(t.a.enviar({ tipo: 'mostrar' }), false);
  });
  await caso('un comando inválido lanza comando-invalido y no se escribe nada', async () => {
    const t = crear('normal');
    await t.a.iniciar();
    assert.throws(() => t.a.enviar({ tipo: 'seleccionarBloque', indice: -1 }), (e) => e instanceof ErrorAyudante && e.codigo === 'comando-invalido');
    assert.throws(() => t.a.enviar({ tipo: 'explotar' }), (e) => e.codigo === 'comando-invalido');
    await dormir(150);
    assert.deepStrictEqual(t.ejecuciones()[0], []);
  });

  // --- Cierre limpio ---
  await caso('detener: manda cerrar, el proceso sale solo, queda detenido y no se reinicia', async () => {
    const t = crear('normal', { reintentos: 2 });
    await t.a.iniciar();
    await t.a.detener();
    assert.strictEqual(t.a.estado, 'detenido');
    assert.ok(procesoMuerto(t.pid()) || (await hasta(() => procesoMuerto(t.pid()), 2000, 'muerto'), true));
    assert.strictEqual(leer(t.rutas.limpia), 'ok');
    await dormir(200);
    assert.strictEqual(t.ejecuciones().length, 1);
    assert.ok(!t.avisos.some((x) => x.tipo === 'salida-inesperada'));
    assert.strictEqual(t.a.enviar({ tipo: 'mostrar' }), false);
  });
  await caso('detener cierra stdin: un ayudante que ignora «cerrar» sale solo, sin esperar al plazo ni ser matado', async () => {
    const t = crear('solo-stdin', { tiempoCierreMs: 3000 });
    await t.a.iniciar();
    const ini = Date.now();
    await t.a.detener();
    assert.ok(Date.now() - ini < 1800, 'tardó demasiado: esperó el plazo completo');
    assert.strictEqual(leer(t.rutas.limpia), 'ok'); // salió por el fin de stdin, no por la fuerza
    assert.ok(procesoMuerto(t.pid()));
  });
  await caso('detener mata al ayudante que no obedece nada, pasado el plazo', async () => {
    const t = crear('no-cierra', { tiempoCierreMs: 400 });
    await t.a.iniciar();
    const pid = t.pid();
    assert.strictEqual(procesoMuerto(pid), false);
    await t.a.detener();
    await hasta(() => procesoMuerto(pid), 3000, 'proceso muerto');
    assert.strictEqual(t.a.estado, 'detenido');
  });
  await caso('detener se puede repetir y funciona sin haber iniciado', async () => {
    const t = crear('normal');
    await t.a.detener();
    await t.a.iniciar();
    await Promise.all([t.a.detener(), t.a.detener()]);
    await t.a.detener();
    assert.strictEqual(t.a.estado, 'detenido');
  });
  await caso('después de detener se puede iniciar de nuevo', async () => {
    const t = crear('normal');
    await t.a.iniciar();
    await t.a.detener();
    assert.deepStrictEqual(await t.a.iniciar(), { tipo: 'listo', protocolo: 1, afinidad: true });
    assert.strictEqual(t.ejecuciones().length, 2);
  });

  // --- Recuperación ---
  await caso('sin reintentos: una salida inesperada deja el estado en fallido, avisa y enviar devuelve false', async () => {
    const t = crear('cae-siempre', { reintentos: 0 });
    await t.a.iniciar();
    await hasta(() => t.avisos.some((x) => x.tipo === 'salida-inesperada'), 3000, 'salida inesperada');
    assert.strictEqual(t.avisos.find((x) => x.tipo === 'salida-inesperada').codigo, 1);
    assert.strictEqual(t.a.estado, 'fallido');
    assert.strictEqual(t.a.enviar({ tipo: 'mostrar' }), false);
    await dormir(150);
    assert.strictEqual(t.ejecuciones().length, 1);
  });
  await caso('con reintentos: se reinicia solo, vuelve a «listo» y reenvía el estado recordado', async () => {
    const t = crear('cae-la-primera', { reintentos: 2 });
    await t.a.iniciar();
    const guia = { tipo: 'cargarGuia', titulo: 'G', lenguaje: 'js', bloques: [{ indice: 0, titulo: 'a', texto: 'x' }, { indice: 1, titulo: 'b', texto: 'y' }] };
    t.a.enviar({ tipo: 'tema', valor: 'claro' });
    t.a.enviar({ tipo: 'tema', valor: 'oscuro' });
    t.a.enviar(guia);
    t.a.enviar({ tipo: 'seleccionarBloque', indice: 0 });
    t.a.enviar({ tipo: 'seleccionarBloque', indice: 1 });
    t.a.enviar({ tipo: 'siempreAlFrente', valor: true });
    t.a.enviar({ tipo: 'mostrar' });
    await hasta(() => t.avisos.some((x) => x.tipo === 'reiniciando' && x.intento === 1), 4000, 'reinicio');
    await hasta(() => t.ejecuciones().length === 2 && t.ejecuciones()[1].length >= 5, 4000, 'estado reenviado');
    assert.strictEqual(t.a.estado, 'listo');
    // solo lo último de cada tipo, con la visibilidad al final
    assert.deepStrictEqual(tipos(t.ejecuciones()[1]), ['tema', 'cargarGuia', 'seleccionarBloque', 'siempreAlFrente', 'mostrar']);
    assert.deepStrictEqual(JSON.parse(t.ejecuciones()[1][0]), { tipo: 'tema', valor: 'oscuro' });
    assert.deepStrictEqual(JSON.parse(t.ejecuciones()[1][2]), { tipo: 'seleccionarBloque', indice: 1 });
  });
  await caso('mientras se reinicia, enviar devuelve true y el comando se reenvía al volver', async () => {
    const t = crear('cae-la-primera', { reintentos: 1, esperaReinicioMs: 400 });
    await t.a.iniciar();
    t.a.enviar({ tipo: 'mostrar' });
    await hasta(() => t.avisos.some((x) => x.tipo === 'salida-inesperada'), 4000, 'salida inesperada');
    assert.strictEqual(t.a.estado, 'reiniciando');
    assert.strictEqual(t.a.enviar({ tipo: 'ocultar' }), true);
    await hasta(() => t.a.estado === 'listo' && t.ejecuciones().length === 2, 4000, 'de vuelta');
    await hasta(() => t.ejecuciones()[1].length >= 1, 3000, 'reenvío');
    assert.deepStrictEqual(tipos(t.ejecuciones()[1]), ['ocultar']);
  });
  await caso('agota los reintentos: pasa a fallido, avisa «agotado» y deja de intentar', async () => {
    const t = crear('cae-siempre', { reintentos: 1 });
    await t.a.iniciar();
    await hasta(() => t.a.estado === 'fallido', 5000, 'fallido');
    assert.deepStrictEqual(t.avisos.find((x) => x.tipo === 'agotado'), { tipo: 'agotado', intentos: 1 });
    assert.strictEqual(t.ejecuciones().length, 2);
    assert.strictEqual(t.a.enviar({ tipo: 'mostrar' }), false);
    await dormir(250);
    assert.strictEqual(t.ejecuciones().length, 2);
  });
  await caso('detener durante la espera del reinicio lo cancela', async () => {
    const t = crear('cae-la-primera', { reintentos: 2, esperaReinicioMs: 400 });
    await t.a.iniciar();
    await hasta(() => t.avisos.some((x) => x.tipo === 'salida-inesperada'), 4000, 'salida inesperada');
    await t.a.detener();
    await dormir(700);
    assert.strictEqual(t.ejecuciones().length, 1);
    assert.strictEqual(t.a.estado, 'detenido');
  });

  await limpiar();
  fin('Gestor del ayudante');
})();
