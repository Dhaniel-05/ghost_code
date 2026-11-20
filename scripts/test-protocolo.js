// Responsabilidad: pruebas del protocolo NDJSON (codificar, decodificar con validación estricta y lector de líneas por trozos).
// Requiere: npm run compile        Uso: node scripts/test-protocolo.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { codificar, decodificarComando, decodificarEvento, LectorLineas, VERSION_PROTOCOLO, LIMITE_LINEA_BYTES } = require('../out/platform/protocolo');

const guia = {
  tipo: 'cargarGuia',
  titulo: 'Guía',
  lenguaje: 'typescript',
  bloques: [
    { indice: 0, titulo: 'Uno', texto: 'a\nb\n' },
    { indice: 1, titulo: 'Dos', texto: 'x y "comillas" \\ ñ 😀' },
  ],
};
const comandos = [
  { tipo: 'mostrar' },
  { tipo: 'ocultar' },
  guia,
  { tipo: 'seleccionarBloque', indice: 3 },
  { tipo: 'siempreAlFrente', valor: true },
  { tipo: 'tema', valor: 'oscuro' },
  { tipo: 'cerrar' },
];
const eventos = [
  { tipo: 'listo', protocolo: 1, afinidad: true },
  { tipo: 'bloqueSeleccionado', indice: 2 },
  { tipo: 'visibilidadCambiada', visible: false },
  { tipo: 'error', mensaje: 'falló', codigo: 'x' },
  { tipo: 'error', mensaje: 'falló' },
];

console.log('Protocolo');

caso('constantes acordadas', () => {
  assert.strictEqual(VERSION_PROTOCOLO, 1);
  assert.strictEqual(LIMITE_LINEA_BYTES, 4 * 1024 * 1024);
});

// --- codificar ---
caso('codificar: una sola línea terminada en \\n, aunque el texto tenga saltos y separadores Unicode', () => {
  for (const c of comandos) {
    const s = codificar(c);
    assert.ok(s.endsWith('\n'));
    assert.strictEqual(s.indexOf('\n'), s.length - 1, 'hay un \\n dentro de la línea');
    assert.ok(!s.includes(' ') && !s.includes(' '));
  }
});
caso('codificar → decodificar devuelve lo mismo (comandos y eventos)', () => {
  for (const c of comandos) assert.deepStrictEqual(decodificarComando(codificar(c)), { ok: true, mensaje: c });
  for (const e of eventos) assert.deepStrictEqual(decodificarEvento(codificar(e)), { ok: true, mensaje: e });
});
caso('codificar descarta campos desconocidos', () => {
  const s = codificar({ tipo: 'mostrar', extra: 1 });
  assert.deepStrictEqual(JSON.parse(s), { tipo: 'mostrar' });
});
caso('codificar lanza Error si el mensaje no es válido (y no lanza con uno válido)', () => {
  assert.doesNotThrow(() => codificar({ tipo: 'mostrar' }));
  for (const malo of [
    { tipo: 'seleccionarBloque', indice: -1 },
    { tipo: 'seleccionarBloque', indice: 1.5 },
    { tipo: 'seleccionarBloque', indice: NaN },
    { tipo: 'tema', valor: 'rojo' },
    { tipo: 'siempreAlFrente', valor: 'si' },
    { tipo: 'cargarGuia', titulo: 'x', lenguaje: 'js', bloques: 'no' },
    { tipo: 'explotar' },
    {},
    null,
  ]) {
    assert.throws(() => codificar(malo), Error, JSON.stringify(malo));
  }
});

// --- decodificar ---
caso('decodificar: tolera espacios alrededor y \\r final', () => {
  assert.deepStrictEqual(decodificarComando('  {"tipo":"mostrar"}\r'), { ok: true, mensaje: { tipo: 'mostrar' } });
  assert.deepStrictEqual(decodificarEvento('{"tipo":"bloqueSeleccionado","indice":0}\r\n'), { ok: true, mensaje: { tipo: 'bloqueSeleccionado', indice: 0 } });
});
caso('decodificar: los campos desconocidos se ignoran y no pasan al resultado', () => {
  assert.deepStrictEqual(decodificarComando('{"tipo":"mostrar","futuro":1}'), { ok: true, mensaje: { tipo: 'mostrar' } });
  assert.deepStrictEqual(decodificarEvento('{"tipo":"visibilidadCambiada","visible":true,"x":[1]}'), { ok: true, mensaje: { tipo: 'visibilidadCambiada', visible: true } });
});
caso('decodificar: entradas absurdas devuelven ok:false con un motivo y nunca lanzan', () => {
  const raras = ['', '   ', '{', '}', 'null', 'true', '5', '"mostrar"', '[]', '{}', '\u0000', '{"tipo":null}', 'x'.repeat(100000), '{"tipo":"mostrar"}{"tipo":"mostrar"}'];
  for (const r of raras) {
    for (const f of [decodificarComando, decodificarEvento]) {
      const res = f(r);
      assert.strictEqual(res.ok, false, JSON.stringify(r.slice(0, 30)));
      assert.ok(typeof res.error === 'string' && res.error.length > 0);
    }
  }
});
caso('un evento no se acepta como comando y viceversa', () => {
  assert.strictEqual(decodificarComando('{"tipo":"listo","protocolo":1,"afinidad":true}').ok, false);
  assert.strictEqual(decodificarEvento('{"tipo":"mostrar"}').ok, false);
});
caso('cargarGuia: acepta una guía vacía y rechaza bloques mal formados', () => {
  assert.strictEqual(decodificarComando('{"tipo":"cargarGuia","titulo":"","lenguaje":"","bloques":[]}').ok, true);
  assert.strictEqual(decodificarComando('{"tipo":"cargarGuia","titulo":"x","lenguaje":"js","bloques":[null]}').ok, false);
  assert.strictEqual(decodificarComando('{"tipo":"cargarGuia","titulo":"x","lenguaje":"js","bloques":[{"indice":-1,"titulo":"a","texto":"b"}]}').ok, false);
});
caso('los índices deben ser enteros seguros', () => {
  assert.strictEqual(decodificarComando('{"tipo":"seleccionarBloque","indice":1e21}').ok, false);
  assert.strictEqual(decodificarEvento('{"tipo":"bloqueSeleccionado","indice":9007199254740993}').ok, false);
});
caso('listo: el protocolo es un entero y afinidad un booleano', () => {
  assert.strictEqual(decodificarEvento('{"tipo":"listo","protocolo":"1","afinidad":true}').ok, false);
  assert.strictEqual(decodificarEvento('{"tipo":"listo","protocolo":1,"afinidad":1}').ok, false);
});

// --- LectorLineas ---
const lector = (opc) => {
  const lineas = [];
  const descartes = [];
  const l = new LectorLineas((x) => lineas.push(x), { ...opc, alDescartar: (m) => descartes.push(m) });
  return { l, lineas, descartes };
};

caso('lector: entrega las líneas completas en orden, varias en un mismo trozo', () => {
  const { l, lineas } = lector();
  l.agregar('uno\ndos\ntres\n');
  assert.deepStrictEqual(lineas, ['uno', 'dos', 'tres']);
});
caso('lector: junta una línea partida en trozos', () => {
  const { l, lineas } = lector();
  l.agregar('{"tipo":"vis');
  assert.deepStrictEqual(lineas, []);
  l.agregar('ible"}');
  l.agregar('\nsiguiente\n');
  assert.deepStrictEqual(lineas, ['{"tipo":"visible"}', 'siguiente']);
});
caso('lector: ignora líneas vacías o de solo espacios y quita el \\r', () => {
  const { l, lineas } = lector();
  l.agregar('\n\n  \t \nhola\r\n\r\nchau\n');
  assert.deepStrictEqual(lineas, ['hola', 'chau']);
});
caso('lector: reconstruye caracteres de varios bytes partidos entre trozos', () => {
  const { l, lineas } = lector();
  const bytes = Buffer.from('ñandú 😀 fin\n', 'utf8');
  for (let i = 0; i < bytes.length; i++) l.agregar(bytes.subarray(i, i + 1)); // byte por byte
  assert.deepStrictEqual(lineas, ['ñandú 😀 fin']);
});
caso('lector: terminar() entrega lo que quedó sin salto de línea', () => {
  const { l, lineas } = lector();
  l.agregar('completa\nparcial');
  assert.deepStrictEqual(lineas, ['completa']);
  l.terminar();
  assert.deepStrictEqual(lineas, ['completa', 'parcial']);
});
caso('lector: terminar() sin nada pendiente (o solo espacios) no entrega nada', () => {
  const { l, lineas } = lector();
  l.agregar('x\n   ');
  l.terminar();
  assert.deepStrictEqual(lineas, ['x']);
});
caso('lector: una línea más larga que el máximo se descarta entera y las siguientes siguen llegando', () => {
  const { l, lineas, descartes } = lector({ maxBytes: 20 });
  l.agregar('corta\n');
  l.agregar('x'.repeat(15));
  l.agregar('y'.repeat(15)); // ya pasó de 20 sin salto de línea
  l.agregar('zzz\nsiguiente\n');
  assert.deepStrictEqual(lineas, ['corta', 'siguiente']);
  assert.strictEqual(descartes.length, 1);
  assert.ok(descartes[0].length > 0);
});
caso('lector: el límite cuenta bytes, no caracteres', () => {
  const { l, lineas, descartes } = lector({ maxBytes: 10 });
  l.agregar('ñññññññ\n'); // 7 caracteres pero 14 bytes
  assert.deepStrictEqual(lineas, []);
  assert.strictEqual(descartes.length, 1);
});
caso('lector: una línea justo en el límite sí se acepta', () => {
  const { l, lineas } = lector({ maxBytes: 10 });
  l.agregar('0123456789\n');
  assert.deepStrictEqual(lineas, ['0123456789']);
});
caso('lector: un millón de líneas pequeñas en menos de 2 s', () => {
  const { l, lineas } = lector();
  const t = Date.now();
  l.agregar('a\n'.repeat(1000000));
  assert.strictEqual(lineas.length, 1000000);
  assert.ok(Date.now() - t < 2000);
});

fin('Protocolo');
