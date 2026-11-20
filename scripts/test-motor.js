// Responsabilidad: pruebas del motor de bloques (avanzar, retroceder, vista previa, reinicio, recarga).
// Requiere: npm run compile        Uso: node scripts/test-motor.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { MotorBloques } = require('../out/core/motorBloques');

const bl = (n) => Array.from({ length: n }, (_, i) => ({ indice: i, titulo: `P${i + 1}`, texto: `t${i}` }));

console.log('Motor de bloques');

caso('empieza en 0 insertados', () => {
  const m = new MotorBloques(bl(3));
  assert.deepStrictEqual(m.estado(), { insertados: 0, total: 3, terminado: false });
});

caso('siguiente entrega los bloques en orden y avanza', () => {
  const m = new MotorBloques(bl(3));
  assert.strictEqual(m.siguiente().texto, 't0');
  assert.strictEqual(m.siguiente().texto, 't1');
  assert.strictEqual(m.estado().insertados, 2);
});

caso('al terminar, siguiente devuelve undefined y no avanza más', () => {
  const m = new MotorBloques(bl(2));
  m.siguiente();
  m.siguiente();
  assert.strictEqual(m.siguiente(), undefined);
  assert.deepStrictEqual(m.estado(), { insertados: 2, total: 2, terminado: true });
});

caso('retroceder devuelve el último insertado (para deshacerlo)', () => {
  const m = new MotorBloques(bl(3));
  m.siguiente();
  m.siguiente();
  assert.strictEqual(m.retroceder().texto, 't1');
  assert.strictEqual(m.estado().insertados, 1);
  assert.strictEqual(m.siguiente().texto, 't1'); // vuelve a salir el mismo
});

caso('retroceder en 0 devuelve undefined y no baja de 0', () => {
  const m = new MotorBloques(bl(2));
  assert.strictEqual(m.retroceder(), undefined);
  assert.strictEqual(m.estado().insertados, 0);
});

caso('retroceder desde el final', () => {
  const m = new MotorBloques(bl(2));
  m.siguiente();
  m.siguiente();
  assert.strictEqual(m.retroceder().texto, 't1');
  assert.strictEqual(m.estado().terminado, false);
});

caso('vistaPrevia muestra el siguiente sin avanzar', () => {
  const m = new MotorBloques(bl(2));
  assert.strictEqual(m.vistaPrevia().texto, 't0');
  assert.strictEqual(m.vistaPrevia().texto, 't0');
  assert.strictEqual(m.estado().insertados, 0);
  m.siguiente();
  m.siguiente();
  assert.strictEqual(m.vistaPrevia(), undefined);
});

caso('reiniciar vuelve a 0', () => {
  const m = new MotorBloques(bl(3));
  m.siguiente();
  m.siguiente();
  m.reiniciar();
  assert.strictEqual(m.estado().insertados, 0);
  assert.strictEqual(m.siguiente().texto, 't0');
});

caso('cargar reemplaza la guía y reinicia', () => {
  const m = new MotorBloques(bl(3));
  m.siguiente();
  m.cargar([{ indice: 0, titulo: 'X', texto: 'nuevo' }]);
  assert.deepStrictEqual(m.estado(), { insertados: 0, total: 1, terminado: false });
  assert.strictEqual(m.siguiente().texto, 'nuevo');
});

caso('guía vacía: terminado desde el inicio y sin errores', () => {
  const m = new MotorBloques([]);
  assert.deepStrictEqual(m.estado(), { insertados: 0, total: 0, terminado: true });
  assert.strictEqual(m.siguiente(), undefined);
  assert.strictEqual(m.retroceder(), undefined);
  assert.strictEqual(m.vistaPrevia(), undefined);
});

caso('el motor no se altera si se modifica el arreglo original', () => {
  const origen = bl(2);
  const m = new MotorBloques(origen);
  origen.pop();
  assert.strictEqual(m.estado().total, 2);
});

caso('ir y volver muchas veces mantiene la consistencia', () => {
  const m = new MotorBloques(bl(5));
  for (let i = 0; i < 100; i++) {
    m.siguiente();
    m.siguiente();
    m.retroceder();
  }
  const e = m.estado();
  assert.ok(e.insertados >= 0 && e.insertados <= 5);
  assert.strictEqual(e.terminado, e.insertados === 5);
});

fin('Motor');
