// Responsabilidad: comprobar los archivos de ejemplo de helper/ghost-viewer/contrato/ contra el protocolo de la extensión.
// Los mismos archivos los debe pasar el ejecutable real. Requiere: npm run compile        Uso: node scripts/test-contrato.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { caso, fin } = require('./_caso');
const { codificar, decodificarComando, decodificarEvento } = require('../out/platform/protocolo');

const dir = path.join(__dirname, '..', 'helper', 'ghost-viewer', 'contrato');
const leer = (nombre) => fs.readFileSync(path.join(dir, nombre), 'utf8').split('\n').filter((l) => l.trim() !== '');
const invalidas = (nombre) =>
  leer(nombre).map((l) => {
    const i = l.indexOf('\t');
    assert.ok(i > 0, `falta la razón (separada por tabulación) en: ${l}`);
    return { razon: l.slice(0, i), linea: l.slice(i + 1) };
  });

console.log('Contrato con ghost-viewer');

caso('hay ejemplos en los cuatro archivos', () => {
  for (const n of ['comandos-validos', 'comandos-invalidos', 'eventos-validos', 'eventos-invalidos']) {
    assert.ok(leer(`${n}.ndjson`).length >= 7, n);
  }
});

caso('comandos válidos: todos se aceptan y sobreviven a codificar → decodificar', () => {
  for (const linea of leer('comandos-validos.ndjson')) {
    const r = decodificarComando(linea);
    assert.strictEqual(r.ok, true, linea.slice(0, 60));
    assert.deepStrictEqual(decodificarComando(codificar(r.mensaje)), r);
  }
});

caso('eventos válidos: todos se aceptan y sobreviven a codificar → decodificar', () => {
  for (const linea of leer('eventos-validos.ndjson')) {
    const r = decodificarEvento(linea);
    assert.strictEqual(r.ok, true, linea.slice(0, 60));
    assert.deepStrictEqual(decodificarEvento(codificar(r.mensaje)), r);
  }
});

caso('comandos inválidos: todos se rechazan con un motivo', () => {
  for (const { razon, linea } of invalidas('comandos-invalidos.ndjson')) {
    const r = decodificarComando(linea);
    assert.strictEqual(r.ok, false, `se aceptó: ${razon}`);
    assert.ok(r.error.length > 0);
  }
});

caso('eventos inválidos: todos se rechazan con un motivo', () => {
  for (const { razon, linea } of invalidas('eventos-invalidos.ndjson')) {
    const r = decodificarEvento(linea);
    assert.strictEqual(r.ok, false, `se aceptó: ${razon}`);
    assert.ok(r.error.length > 0);
  }
});

caso('el ejemplo con campo futuro llega sin ese campo', () => {
  const l = leer('comandos-validos.ndjson').find((x) => x.includes('campoDeUnaVersionFutura'));
  assert.deepStrictEqual(decodificarComando(l), { ok: true, mensaje: { tipo: 'mostrar' } });
});

fin('Contrato');
