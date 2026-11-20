// Responsabilidad: pruebas del formato de inserción (sangría de la línea y fin de línea del documento).
// Requiere: npm run compile        Uso: node scripts/test-formato.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { sangriaDeLinea, prepararTexto } = require('../out/typing/formato');

console.log('Formato de inserción');

// --- sangriaDeLinea ---
caso('sangría: espacios hasta la columna del cursor', () => {
  assert.strictEqual(sangriaDeLinea('    foo', 8), '    ');
  assert.strictEqual(sangriaDeLinea('    foo', 2), '  ');
});
caso('sangría: tabulaciones', () => {
  assert.strictEqual(sangriaDeLinea('\t\tx', 5), '\t\t');
});
caso('sangría: línea sin sangría, vacía o solo de espacios', () => {
  assert.strictEqual(sangriaDeLinea('foo', 3), '');
  assert.strictEqual(sangriaDeLinea('', 0), '');
  assert.strictEqual(sangriaDeLinea('  ', 2), '  ');
});
caso('sangría: cursor en la columna 0 → sin sangría', () => {
  assert.strictEqual(sangriaDeLinea('    foo', 0), '');
});

// --- prepararTexto ---
caso('sin saltos de línea el texto no cambia', () => {
  assert.strictEqual(prepararTexto('const a = 1;', '    ', 'LF'), 'const a = 1;');
  assert.strictEqual(prepararTexto('const a = 1;', '    ', 'CRLF'), 'const a = 1;');
});
caso('LF: sin sangría queda igual', () => {
  assert.strictEqual(prepararTexto('a\nb', '', 'LF'), 'a\nb');
});
caso('CRLF: cada salto pasa a \\r\\n', () => {
  assert.strictEqual(prepararTexto('a\nb\nc', '', 'CRLF'), 'a\r\nb\r\nc');
});
caso('la sangría va en las líneas 2 en adelante, no en la primera', () => {
  assert.strictEqual(prepararTexto('a\n  b\nc', '    ', 'LF'), 'a\n      b\n    c');
});
caso('las líneas en blanco no llevan sangría', () => {
  assert.strictEqual(prepararTexto('a\n\nb', '  ', 'LF'), 'a\n\n  b');
});
caso('las líneas de solo espacios dentro del bloque se dejan como están', () => {
  assert.strictEqual(prepararTexto('a\n  \nb', '\t', 'LF'), 'a\n  \n\tb');
});
caso('sangría y CRLF juntos', () => {
  assert.strictEqual(prepararTexto('a\n\nb', '  ', 'CRLF'), 'a\r\n\r\n  b');
});
caso('si el texto ya trae \\r\\n se normaliza al fin de línea pedido', () => {
  assert.strictEqual(prepararTexto('a\r\nb', '', 'LF'), 'a\nb');
  assert.strictEqual(prepararTexto('a\r\nb', '', 'CRLF'), 'a\r\nb');
});
caso('$, llaves y barras invertidas no se tocan', () => {
  const t = 'const s = `${a} $1 $0 ${1:x} \\n`;\nfin }';
  assert.strictEqual(prepararTexto(t, '', 'LF'), t);
});

fin('Formato');
