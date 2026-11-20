// Responsabilidad: pruebas del plan de tecleo letra por letra (pasos, retardos, límites de velocidad).
// Requiere: npm run compile        Uso: node scripts/test-tecleo.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { planTecleo, CPS_MIN, CPS_MAX, CPS_POR_DEFECTO } = require('../out/core/tecleo');

const unir = (plan) => plan.map((p) => p.texto).join('');

console.log('Plan de tecleo');

caso('un paso por carácter y el texto se reconstruye exacto', () => {
  const plan = planTecleo('abc', { caracteresPorSegundo: 10 });
  assert.strictEqual(plan.length, 3);
  assert.strictEqual(unir(plan), 'abc');
});

caso('el retardo es 1000 / cps', () => {
  const plan = planTecleo('ab', { caracteresPorSegundo: 20 });
  assert.ok(plan.every((p) => p.retardoMs === 50));
});

caso('los saltos de línea y tabulaciones también son pasos', () => {
  const plan = planTecleo('a\n\tb', { caracteresPorSegundo: 10 });
  assert.deepStrictEqual(plan.map((p) => p.texto), ['a', '\n', '\t', 'b']);
});

caso('un emoji (par sustituto) es un solo paso', () => {
  const plan = planTecleo('a😀b', { caracteresPorSegundo: 10 });
  assert.deepStrictEqual(plan.map((p) => p.texto), ['a', '😀', 'b']);
});

caso('texto vacío → sin pasos', () => {
  assert.deepStrictEqual(planTecleo('', { caracteresPorSegundo: 10 }), []);
});

caso('la velocidad se limita al máximo', () => {
  const plan = planTecleo('a', { caracteresPorSegundo: 99999 });
  assert.strictEqual(plan[0].retardoMs, 1000 / CPS_MAX);
});

caso('la velocidad se limita al mínimo (0 y negativos)', () => {
  assert.strictEqual(planTecleo('a', { caracteresPorSegundo: 0 })[0].retardoMs, 1000 / CPS_MIN);
  assert.strictEqual(planTecleo('a', { caracteresPorSegundo: -5 })[0].retardoMs, 1000 / CPS_MIN);
});

caso('velocidad inválida (NaN, Infinity) usa la de por defecto', () => {
  assert.strictEqual(planTecleo('a', { caracteresPorSegundo: NaN })[0].retardoMs, 1000 / CPS_POR_DEFECTO);
  assert.strictEqual(planTecleo('a', { caracteresPorSegundo: Infinity })[0].retardoMs, 1000 / CPS_POR_DEFECTO);
});

caso('los límites son los acordados (1 a 200, por defecto 30)', () => {
  assert.strictEqual(CPS_MIN, 1);
  assert.strictEqual(CPS_MAX, 200);
  assert.strictEqual(CPS_POR_DEFECTO, 30);
});

caso('un bloque de 5000 caracteres se planea rápido', () => {
  const t = Date.now();
  const plan = planTecleo('x'.repeat(5000), { caracteresPorSegundo: 30 });
  assert.strictEqual(plan.length, 5000);
  assert.ok(Date.now() - t < 200);
});

fin('Tecleo');
