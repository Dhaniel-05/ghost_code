// Responsabilidad: probar el ghost-viewer.exe REAL (compilado) contra el contrato. No va en `npm test`: necesita Windows y el .exe.
// Compilar antes con: npm run compilar:visor        Uso: node scripts/test-exe.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { caso, fin } = require('./_caso');
const { Ayudante } = require('../out/platform/ayudante');
const { decodificarComando } = require('../out/platform/protocolo');

const exe = path.join(__dirname, '..', 'bin', 'win32-x64', 'ghost-viewer.exe');
if (process.platform !== 'win32' || !fs.existsSync(exe)) {
  console.log(`Prueba del .exe omitida: falta ${exe} (se genera con «npm run compilar:visor» en Windows).`);
  process.exit(0);
}

const contrato = path.join(__dirname, '..', 'helper', 'ghost-viewer', 'contrato');
const lineas = (n) => fs.readFileSync(path.join(contrato, n), 'utf8').split('\n').filter((l) => l.trim() !== '');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (cond, ms, que) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (cond()) return;
    await dormir(25);
  }
  throw new Error(`no se cumplió a tiempo: ${que}`);
};

(async () => {
  console.log('ghost-viewer.exe real');

  await caso('arranca, avisa «listo» con la protección de captura activa y sale al detener', async () => {
    const eventos = [];
    const a = new Ayudante({ ruta: exe, alEvento: (e) => eventos.push(e), reintentos: 0 });
    const listo = await a.iniciar();
    assert.strictEqual(listo.protocolo, 1);
    assert.strictEqual(listo.afinidad, true, 'SetWindowDisplayAffinity(0x11) no quedó aplicado');
    const ini = Date.now();
    await a.detener();
    assert.ok(Date.now() - ini < 1500, 'tardó demasiado en cerrar');
  });

  await caso('acepta los comandos del contrato (sin «mostrar» ni «cerrar», para no abrir la ventana) y responde a seleccionarBloque', async () => {
    const eventos = [];
    const a = new Ayudante({ ruta: exe, alEvento: (e) => eventos.push(e), reintentos: 0 });
    await a.iniciar();
    for (const l of lineas('comandos-validos.ndjson')) {
      const c = decodificarComando(l).mensaje;
      if (c.tipo === 'mostrar' || c.tipo === 'cerrar' || c.tipo === 'traer') continue; // estos muestran la ventana o cierran
      assert.strictEqual(a.enviar(c), true);
    }
    a.enviar({ tipo: 'cargarGuia', titulo: 'G', lenguaje: 'typescript', bloques: [{ indice: 0, titulo: 'a', texto: 'x' }, { indice: 1, titulo: 'b', texto: 'y' }] });
    a.enviar({ tipo: 'seleccionarBloque', indice: 1 });
    await hasta(() => eventos.some((e) => e.tipo === 'bloqueSeleccionado' && e.indice === 1), 3000, 'bloqueSeleccionado');
    assert.strictEqual(a.estado, 'listo');
    await a.detener();
  });

  await caso('escudo y modos (compacto, maximizado, normal): responde con escudoCambiado y modoCambiado, en orden y sin mostrar la ventana', async () => {
    const eventos = [];
    const a = new Ayudante({ ruta: exe, alEvento: (e) => eventos.push(e), reintentos: 0 });
    await a.iniciar();
    for (const c of [{ tipo: 'escudo', valor: true }, { tipo: 'modo', valor: 'compacto' }, { tipo: 'modo', valor: 'maximizado' }, { tipo: 'modo', valor: 'normal' }, { tipo: 'escudo', valor: false }]) assert.strictEqual(a.enviar(c), true);
    await hasta(() => eventos.length >= 6, 3000, 'cinco respuestas');
    assert.deepStrictEqual(eventos.slice(1), [
      { tipo: 'escudoCambiado', activo: true },
      { tipo: 'modoCambiado', valor: 'compacto' },
      { tipo: 'modoCambiado', valor: 'maximizado' },
      { tipo: 'modoCambiado', valor: 'normal' },
      { tipo: 'escudoCambiado', activo: false },
    ]);
    assert.ok(!eventos.some((e) => e.tipo === 'visibilidadCambiada'), 'no debía mostrarse la ventana');
    await a.detener();
  });

  await caso('las líneas inválidas no lo tumban y el fin de stdin lo hace salir en menos de 1 s con código 0', async () => {
    const hijo = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let salida = '';
    hijo.stdout.on('data', (d) => (salida += d));
    const termino = new Promise((r) => hijo.on('close', (codigo) => r(codigo)));
    await hasta(() => salida.includes('"listo"'), 10000, 'listo');
    for (const l of lineas('comandos-invalidos.ndjson')) hijo.stdin.write(l.slice(l.indexOf('\t') + 1) + '\n');
    hijo.stdin.write('\n\n   \n');
    await dormir(600);
    assert.strictEqual(hijo.exitCode, null, 'se cayó por una línea inválida');
    const ini = Date.now();
    hijo.stdin.end();
    assert.strictEqual(await termino, 0);
    assert.ok(Date.now() - ini < 1000, 'tardó más de 1 s en salir tras el fin de stdin');
  });

  fin('ghost-viewer.exe real');
})();
