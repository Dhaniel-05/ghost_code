// Responsabilidad: pruebas del tecleo letra por letra: resultado exacto, un solo deshacer y cancelación segura.
// Requiere: npm run compile        Uso: node scripts/test-live-tecleo.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { instalar, crearEscenario, tick, esperaManual, esperaInstantanea } = require('./vscode-simulado');
const vscode = instalar();
const { MotorBloques } = require('../out/core/motorBloques');
const { SesionLive } = require('../out/typing/sesionLive');
const { MENSAJES } = require('../out/typing/mensajes');
const { prepararTexto, sangriaDeLinea } = require('../out/typing/formato');

const motorCon = (...textos) => new MotorBloques(textos.map((texto, i) => ({ indice: i, titulo: `P${i + 1}`, texto })));
const rapida = (motor, cps = 30) => {
  const espera = esperaInstantanea();
  return { espera, s: new SesionLive(motor, { cps: () => cps, esperar: espera.esperar }) };
};
const manual = (motor, cps = 30) => {
  const espera = esperaManual();
  return { espera, s: new SesionLive(motor, { cps: () => cps, esperar: espera.esperar }) };
};

(async () => {
  console.log('Modo Live Coding: tecleo');

  // --- Resultado ---
  await caso('teclea el bloque completo y devuelve «tecleado»', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('const a = 1;');
    const { s } = rapida(motor);
    assert.strictEqual(await s.teclearSiguiente(), 'tecleado');
    assert.strictEqual(documento.texto, 'const a = 1;');
    assert.strictEqual(motor.estado().insertados, 1);
    assert.strictEqual(s.tecleando, false);
  });

  await caso('espera 1000 / cps antes de cada letra (una espera por carácter del bloque)', async () => {
    crearEscenario({ texto: '' });
    const { s, espera } = rapida(motorCon('abcd'), 50);
    await s.teclearSiguiente();
    assert.deepStrictEqual(espera.llamadas, [20, 20, 20, 20]);
  });

  await caso('con sangría y CRLF el resultado es idéntico al de la inserción completa', async () => {
    const bloque = 'if (a) {\n  b();\n\n}';
    const base = '    ';
    const { documento } = crearEscenario({ texto: base, cursor: 4, eol: 'CRLF' });
    await rapida(motorCon(bloque)).s.teclearSiguiente();
    const esperado = base + prepararTexto(bloque, sangriaDeLinea(base, 4), 'CRLF');
    assert.strictEqual(documento.texto, esperado);
    assert.ok(!/(^|[^\r])\n/.test(documento.texto));
  });

  await caso('$ y llaves salen literales y no se usan snippets', async () => {
    const bloque = 'x = `${a} $1 ${1:y}`;';
    const { documento, editor } = crearEscenario({ texto: '' });
    await rapida(motorCon(bloque)).s.teclearSiguiente();
    assert.strictEqual(documento.texto, bloque);
    assert.strictEqual(editor.snippetsUsados, 0);
  });

  await caso('un emoji se escribe completo, no partido', async () => {
    const { documento } = crearEscenario({ texto: '' });
    await rapida(motorCon('a😀b')).s.teclearSiguiente();
    assert.strictEqual(documento.texto, 'a😀b');
  });

  // --- Un solo deshacer ---
  await caso('todo el tecleo es un solo paso de deshacer y no deja el grupo abierto', async () => {
    const { editor } = crearEscenario({ texto: '' });
    await rapida(motorCon('abcdef')).s.teclearSiguiente();
    assert.strictEqual(editor.gruposDeUndo, 1);
    assert.strictEqual(editor.grupoAbierto, false);
  });

  // --- Cancelación ---
  await caso('cancelar() a la mitad: conserva lo escrito, cierra el deshacer y devuelve «cancelado»', async () => {
    const { documento, editor } = crearEscenario({ texto: '' });
    const motor = motorCon('abcdef');
    const { s, espera } = manual(motor);
    const p = s.teclearSiguiente();
    await espera.liberar(3); // escribe a, b, c
    assert.strictEqual(s.tecleando, true);
    s.cancelar();
    await espera.liberarTodo();
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, 'abc');
    assert.strictEqual(editor.grupoAbierto, false);
    assert.strictEqual(editor.gruposDeUndo, 1);
    assert.strictEqual(s.tecleando, false);
    assert.strictEqual(motor.estado().insertados, 1);
  });

  await caso('cancelar antes de la primera letra: no escribe nada y el motor no avanza', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('abc');
    const { s, espera } = manual(motor);
    const p = s.teclearSiguiente();
    await tick();
    s.cancelar();
    await espera.liberarTodo();
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, '');
    assert.strictEqual(motor.estado().insertados, 0);
  });

  await caso('cancelar() sin tecleo en curso no hace nada ni falla', async () => {
    crearEscenario({ texto: '' });
    const { s } = rapida(motorCon('a'));
    s.cancelar();
    assert.strictEqual(s.tecleando, false);
  });

  await caso('otra acción durante el tecleo lo cancela y NO se ejecuta (insertar)', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('abcdef', 'ZZ');
    const { s, espera } = manual(motor);
    const p = s.teclearSiguiente();
    await espera.liberar(2);
    const segunda = s.insertarSiguiente();
    await espera.liberarTodo();
    assert.strictEqual(await segunda, 'cancelado');
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, 'ab');
    assert.strictEqual(motor.estado().insertados, 1);
  });

  await caso('pulsar otra vez el atajo de tecleo durante el tecleo también cancela', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const { s, espera } = manual(motorCon('abcdef', 'ZZ'));
    const p = s.teclearSiguiente();
    await espera.liberar(1);
    const segunda = s.teclearSiguiente();
    await espera.liberarTodo();
    assert.strictEqual(await segunda, 'cancelado');
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, 'a');
  });

  await caso('retroceder después de un tecleo cancelado quita lo que alcanzó a escribir', async () => {
    const { documento } = crearEscenario({ texto: 'x', cursor: 1 });
    const motor = motorCon('abcdef');
    const { s, espera } = manual(motor);
    const p = s.teclearSiguiente();
    await espera.liberar(3);
    s.cancelar();
    await espera.liberarTodo();
    await p;
    assert.strictEqual(documento.texto, 'xabc');
    assert.strictEqual(await s.retroceder(), 'retrocedido');
    assert.strictEqual(documento.texto, 'x');
    assert.strictEqual(motor.estado().insertados, 0);
  });

  await caso('si cambia el editor activo: se detiene, no escribe en el nuevo y cierra el deshacer del primero', async () => {
    const primero = crearEscenario({ texto: '' });
    const { s, espera } = manual(motorCon('abcdef'));
    const p = s.teclearSiguiente();
    await espera.liberar(2);
    const segundo = crearEscenario({ texto: 'otro' }); // ahora el activo es otro archivo
    await espera.liberarTodo();
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(primero.documento.texto, 'ab');
    assert.strictEqual(segundo.documento.texto, 'otro');
    assert.strictEqual(segundo.editor.llamadas.length, 0);
    assert.strictEqual(primero.editor.grupoAbierto, false);
  });

  await caso('si el editor activo desaparece: se detiene sin lanzar error', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const { s, espera } = manual(motorCon('abcdef'));
    const p = s.teclearSiguiente();
    await espera.liberar(2);
    vscode.window.activeTextEditor = undefined;
    await espera.liberarTodo();
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, 'ab');
  });

  await caso('si la persona escribe en el documento durante el tecleo: se detiene y respeta lo suyo', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const { s, espera } = manual(motorCon('abcdef'));
    const p = s.teclearSiguiente();
    await espera.liberar(2);
    documento.escribirComoUsuario(0, 'Q');
    await espera.liberarTodo();
    assert.strictEqual(await p, 'cancelado');
    assert.strictEqual(documento.texto, 'Qab');
  });

  // --- Casos borde ---
  await caso('sin editor activo: avisa, no lanza error y no avanza el motor', async () => {
    crearEscenario({ texto: '' });
    vscode.window.activeTextEditor = undefined;
    const motor = motorCon('a');
    assert.strictEqual(await rapida(motor).s.teclearSiguiente(), 'sin-editor');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.sinEditor]);
    assert.strictEqual(motor.estado().insertados, 0);
  });

  await caso('si el editor rechaza la primera letra: «fallo», avisa y el motor no avanza', async () => {
    const { documento, editor } = crearEscenario({ texto: '' });
    editor.rechazarEdiciones = true;
    const motor = motorCon('abc');
    assert.strictEqual(await rapida(motor).s.teclearSiguiente(), 'fallo');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.noSePudoEditar]);
    assert.strictEqual(motor.estado().insertados, 0);
    assert.strictEqual(documento.texto, '');
  });

  await caso('ya no quedan bloques: aviso informativo', async () => {
    crearEscenario({ texto: '' });
    const { s } = rapida(motorCon('a'));
    await s.teclearSiguiente();
    assert.strictEqual(await s.teclearSiguiente(), 'terminado');
    assert.deepStrictEqual(vscode.avisos.informativos, [MENSAJES.terminado]);
  });

  fin('Live Coding (tecleo)');
})();
