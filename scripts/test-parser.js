// Responsabilidad: pruebas del parser de guías (marcadores multi-lenguaje y respaldo por líneas en blanco dobles).
// Requiere: npm run compile        Uso: node scripts/test-parser.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { parsearGuia } = require('../out/core/parserGuia');

const textos = (r) => r.bloques.map((b) => b.texto);
const titulos = (r) => r.bloques.map((b) => b.titulo);

console.log('Parser de guías');

// --- Marcadores ---
caso('marcador // con título', () => {
  const r = parsearGuia('// @@paso: Imports\nimport a from "a";\n// @@paso: Función\nfunction f() {}\n');
  assert.strictEqual(r.modo, 'marcadores');
  assert.deepStrictEqual(titulos(r), ['Imports', 'Función']);
  assert.deepStrictEqual(textos(r), ['import a from "a";', 'function f() {}']);
});

caso('marcador # (Python)', () => {
  const r = parsearGuia('# @@paso: Uno\nx = 1\n# @@paso: Dos\ny = 2');
  assert.deepStrictEqual(titulos(r), ['Uno', 'Dos']);
  assert.deepStrictEqual(textos(r), ['x = 1', 'y = 2']);
});

caso('marcador -- (SQL/Lua)', () => {
  const r = parsearGuia('-- @@paso: Tabla\nCREATE TABLE t (id INT);\n-- @@paso: Dato\nINSERT INTO t VALUES (1);');
  assert.deepStrictEqual(titulos(r), ['Tabla', 'Dato']);
  assert.strictEqual(r.bloques[1].texto, 'INSERT INTO t VALUES (1);');
});

caso('marcador /* */ en una sola línea', () => {
  const r = parsearGuia('/* @@paso: Estilos */\nbody { margin: 0; }\n/* @@paso: Título */\nh1 { color: red; }');
  assert.deepStrictEqual(titulos(r), ['Estilos', 'Título']);
  assert.deepStrictEqual(textos(r), ['body { margin: 0; }', 'h1 { color: red; }']);
});

caso('marcador con sangría y sin dos puntos', () => {
  const r = parsearGuia('    // @@paso Solo\ncodigo();');
  assert.deepStrictEqual(titulos(r), ['Solo']);
});

caso('la línea del marcador no entra en el texto del bloque', () => {
  const r = parsearGuia('// @@paso: A\nlinea1\nlinea2');
  assert.ok(!r.bloques[0].texto.includes('@@paso'));
  assert.strictEqual(r.bloques[0].texto, 'linea1\nlinea2');
});

caso('sin título usa «Paso N»', () => {
  const r = parsearGuia('// @@paso:\na\n// @@paso:\nb');
  assert.deepStrictEqual(titulos(r), ['Paso 1', 'Paso 2']);
});

caso('los índices van de 0 en 0', () => {
  const r = parsearGuia('// @@paso: A\na\n// @@paso: B\nb\n// @@paso: C\nc');
  assert.deepStrictEqual(r.bloques.map((b) => b.indice), [0, 1, 2]);
});

caso('mezclar estilos de marcador en una misma guía', () => {
  const r = parsearGuia('// @@paso: A\na\n# @@paso: B\nb\n-- @@paso: C\nc\n/* @@paso: D */\nd');
  assert.deepStrictEqual(textos(r), ['a', 'b', 'c', 'd']);
});

// --- Contenido del bloque ---
caso('quita líneas en blanco al inicio y al final del bloque, conserva las internas', () => {
  const r = parsearGuia('// @@paso: A\n\n\nuno\n\ndos\n\n\n// @@paso: B\ntres');
  assert.strictEqual(r.bloques[0].texto, 'uno\n\ndos');
});

caso('conserva la sangría y las tabulaciones', () => {
  const r = parsearGuia('// @@paso: A\nfunction f() {\n\treturn 1;\n    }\n');
  assert.strictEqual(r.bloques[0].texto, 'function f() {\n\treturn 1;\n    }');
});

caso('CRLF se normaliza a LF', () => {
  const r = parsearGuia('// @@paso: A\r\nuno\r\ndos\r\n// @@paso: B\r\ntres\r\n');
  assert.deepStrictEqual(textos(r), ['uno\ndos', 'tres']);
  assert.ok(!r.bloques[0].texto.includes('\r'));
});

caso('BOM al inicio no estorba', () => {
  const r = parsearGuia('﻿// @@paso: A\nuno');
  assert.strictEqual(r.modo, 'marcadores');
  assert.strictEqual(r.bloques[0].texto, 'uno');
});

caso('el signo $ y las llaves no se tocan', () => {
  const r = parsearGuia('// @@paso: A\nconst s = `${a} $1 ${b:c}`;');
  assert.strictEqual(r.bloques[0].texto, 'const s = `${a} $1 ${b:c}`;');
});

// --- Casos borde de marcadores ---
caso('un @@paso dentro de un texto NO es marcador', () => {
  const r = parsearGuia('// @@paso: A\nconst m = "// @@paso: falso";\nfin');
  assert.strictEqual(r.bloques.length, 1);
  assert.strictEqual(r.bloques[0].texto, 'const m = "// @@paso: falso";\nfin');
});

caso('marcadores sin contenido en medio no crean bloques vacíos', () => {
  const r = parsearGuia('// @@paso: A\na\n// @@paso: Vacío\n\n// @@paso: C\nc');
  assert.deepStrictEqual(textos(r), ['a', 'c']);
  assert.deepStrictEqual(r.bloques.map((b) => b.indice), [0, 1]);
});

caso('texto antes del primer marcador se conserva como primer bloque', () => {
  const r = parsearGuia('preambulo();\n// @@paso: A\na');
  assert.deepStrictEqual(textos(r), ['preambulo();', 'a']);
  assert.strictEqual(r.bloques[0].titulo, 'Paso 1');
});

caso('espacios antes del primer marcador no crean bloque', () => {
  const r = parsearGuia('\n\n   \n// @@paso: A\na');
  assert.deepStrictEqual(textos(r), ['a']);
});

// --- Respaldo por líneas en blanco dobles ---
caso('sin marcadores: divide en 2 o más líneas en blanco', () => {
  const r = parsearGuia('uno\nuno-b\n\n\ndos\n\n\n\ntres');
  assert.strictEqual(r.modo, 'lineas-en-blanco');
  assert.deepStrictEqual(textos(r), ['uno\nuno-b', 'dos', 'tres']);
});

caso('sin marcadores: UNA sola línea en blanco no divide', () => {
  const r = parsearGuia('uno\n\ndos');
  assert.deepStrictEqual(textos(r), ['uno\n\ndos']);
});

caso('sin marcadores: las líneas con solo espacios cuentan como en blanco', () => {
  const r = parsearGuia('uno\n  \n\t\ndos');
  assert.deepStrictEqual(textos(r), ['uno', 'dos']);
});

caso('sin marcadores: títulos «Paso N»', () => {
  const r = parsearGuia('a\n\n\nb');
  assert.deepStrictEqual(titulos(r), ['Paso 1', 'Paso 2']);
});

caso('sin marcadores: CRLF también divide', () => {
  const r = parsearGuia('uno\r\n\r\n\r\ndos');
  assert.deepStrictEqual(textos(r), ['uno', 'dos']);
});

// --- Vacíos y tamaño ---
caso('texto vacío o solo espacios → sin bloques', () => {
  assert.deepStrictEqual(parsearGuia('').bloques, []);
  assert.deepStrictEqual(parsearGuia('  \n\n \t\n').bloques, []);
});

caso('solo marcadores, sin código → sin bloques', () => {
  assert.deepStrictEqual(parsearGuia('// @@paso: A\n// @@paso: B').bloques, []);
});

caso('guía de 10 000 líneas en menos de 500 ms', () => {
  const partes = [];
  for (let i = 0; i < 1000; i++) {
    partes.push(`// @@paso: P${i}`);
    for (let j = 0; j < 9; j++) partes.push(`const v${i}_${j} = ${j};`);
  }
  const t = Date.now();
  const r = parsearGuia(partes.join('\n'));
  assert.strictEqual(r.bloques.length, 1000);
  assert.ok(Date.now() - t < 500, 'tardó demasiado');
});

fin('Parser');
