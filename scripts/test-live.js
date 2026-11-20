// Responsabilidad: pruebas del modo Live Coding en el editor: inserción de bloque completo, deshacer en un paso y retroceso.
// Requiere: npm run compile        Uso: node scripts/test-live.js
const assert = require('assert');
const { caso, fin } = require('./_caso');
const { instalar, crearEscenario, esperaInstantanea } = require('./vscode-simulado');
const vscode = instalar();
const { MotorBloques } = require('../out/core/motorBloques');
const { SesionLive } = require('../out/typing/sesionLive');
const { MENSAJES } = require('../out/typing/mensajes');

const motorCon = (...textos) => new MotorBloques(textos.map((texto, i) => ({ indice: i, titulo: `P${i + 1}`, texto })));
function sesion(motor) {
  const espera = esperaInstantanea();
  return new SesionLive(motor, { cps: () => 30, esperar: espera.esperar });
}
const offsetDe = (doc, pos) => doc.offsetAt(pos);

(async () => {
  console.log('Modo Live Coding: inserción');

  // --- Inserción en el cursor ---
  await caso('inserta el bloque en un documento vacío y deja el cursor al final', async () => {
    const { documento, editor } = crearEscenario({ texto: '' });
    const motor = motorCon('const a = 1;');
    assert.strictEqual(await sesion(motor).insertarSiguiente(), 'insertado');
    assert.strictEqual(documento.texto, 'const a = 1;');
    assert.strictEqual(offsetDe(documento, editor.selection.active), 12);
    assert.strictEqual(motor.estado().insertados, 1);
  });

  await caso('respeta la sangría de la línea actual en las líneas siguientes', async () => {
    const { documento } = crearEscenario({ texto: '    ', cursor: 4 });
    await sesion(motorCon('if (a) {\n  b();\n}')).insertarSiguiente();
    assert.strictEqual(documento.texto, '    if (a) {\n      b();\n    }');
  });

  await caso('sangría con tabulaciones', async () => {
    const { documento } = crearEscenario({ texto: '\t\t', cursor: 2 });
    await sesion(motorCon('a\nb')).insertarSiguiente();
    assert.strictEqual(documento.texto, '\t\ta\n\t\tb');
  });

  await caso('las líneas en blanco del bloque no quedan con espacios sobrantes', async () => {
    const { documento } = crearEscenario({ texto: '  ', cursor: 2 });
    await sesion(motorCon('a\n\nb')).insertarSiguiente();
    assert.strictEqual(documento.texto, '  a\n\n  b');
  });

  await caso('cursor en medio de una línea: lo de después del cursor queda al final del bloque', async () => {
    const { documento } = crearEscenario({ texto: '  foo()', cursor: 6 });
    await sesion(motorCon('x\ny')).insertarSiguiente();
    assert.strictEqual(documento.texto, '  foo(x\n  y)');
  });

  await caso('cursor en la columna 0 de una línea con sangría: no se aplica sangría', async () => {
    const { documento } = crearEscenario({ texto: '    foo', cursor: 0 });
    await sesion(motorCon('a\nb')).insertarSiguiente();
    assert.strictEqual(documento.texto, 'a\nb    foo');
  });

  await caso('con una selección, la reemplaza', async () => {
    const { documento } = crearEscenario({ texto: 'abcXYZdef', cursor: [3, 6] });
    await sesion(motorCon('-')).insertarSiguiente();
    assert.strictEqual(documento.texto, 'abc-def');
  });

  await caso('dos bloques seguidos: el segundo entra donde terminó el primero', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const s = sesion(motorCon('a', 'b'));
    await s.insertarSiguiente();
    await s.insertarSiguiente();
    assert.strictEqual(documento.texto, 'ab');
  });

  // --- Fin de línea ---
  await caso('documento CRLF: el texto enviado y el resultado usan solo \\r\\n', async () => {
    const { documento, editor } = crearEscenario({ texto: '', eol: 'CRLF' });
    await sesion(motorCon('a\nb\nc')).insertarSiguiente();
    assert.strictEqual(documento.texto, 'a\r\nb\r\nc');
    const enviado = editor.llamadas[0].ops[0].texto;
    assert.ok(!/(^|[^\r])\n/.test(enviado), 'quedó un \\n suelto');
  });

  await caso('documento LF: no aparece ningún \\r', async () => {
    const { documento } = crearEscenario({ texto: '', eol: 'LF' });
    await sesion(motorCon('a\nb')).insertarSiguiente();
    assert.ok(!documento.texto.includes('\r'));
  });

  // --- Literal, sin snippets ---
  await caso('$ y llaves se insertan literales y no se usa insertSnippet', async () => {
    const { documento, editor } = crearEscenario({ texto: '' });
    const bloque = 'const s = `${a} $1 $0 ${1:x}`;\nif (a) { b(); } \\n';
    await sesion(motorCon(bloque)).insertarSiguiente();
    assert.strictEqual(documento.texto, bloque);
    assert.strictEqual(editor.snippetsUsados, 0);
  });

  // --- Un solo deshacer ---
  await caso('todo el bloque entra en una sola edición y un solo paso de deshacer', async () => {
    const { editor } = crearEscenario({ texto: '' });
    await sesion(motorCon('a\nb\nc')).insertarSiguiente();
    assert.strictEqual(editor.llamadas.length, 1);
    assert.strictEqual(editor.llamadas[0].opciones.undoStopBefore, true);
    assert.strictEqual(editor.llamadas[0].opciones.undoStopAfter, true);
    assert.strictEqual(editor.gruposDeUndo, 1);
  });

  await caso('dos bloques → dos pasos de deshacer', async () => {
    const { editor } = crearEscenario({ texto: '' });
    const s = sesion(motorCon('a', 'b'));
    await s.insertarSiguiente();
    await s.insertarSiguiente();
    assert.strictEqual(editor.gruposDeUndo, 2);
  });

  // --- Sin editor y otros casos borde ---
  await caso('sin editor activo: avisa, no lanza error y no avanza el motor', async () => {
    crearEscenario({ texto: '' });
    vscode.window.activeTextEditor = undefined;
    const motor = motorCon('a');
    assert.strictEqual(await sesion(motor).insertarSiguiente(), 'sin-editor');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.sinEditor]);
    assert.strictEqual(motor.estado().insertados, 0);
  });

  await caso('ya no quedan bloques: aviso informativo y el documento no cambia', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const s = sesion(motorCon('a'));
    await s.insertarSiguiente();
    assert.strictEqual(await s.insertarSiguiente(), 'terminado');
    assert.deepStrictEqual(vscode.avisos.informativos, [MENSAJES.terminado]);
    assert.strictEqual(documento.texto, 'a');
  });

  await caso('guía sin bloques: avisa con mensaje claro', async () => {
    crearEscenario({ texto: '' });
    assert.strictEqual(await sesion(motorCon()).insertarSiguiente(), 'sin-bloques');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.sinBloques]);
  });

  await caso('si el editor rechaza la edición (solo lectura): avisa y el motor no avanza', async () => {
    const { documento, editor } = crearEscenario({ texto: '' });
    editor.rechazarEdiciones = true;
    const motor = motorCon('a');
    assert.strictEqual(await sesion(motor).insertarSiguiente(), 'fallo');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.noSePudoEditar]);
    assert.strictEqual(motor.estado().insertados, 0);
    assert.strictEqual(documento.texto, '');
  });

  // --- Retroceso ---
  console.log('Modo Live Coding: retroceso');

  await caso('retroceder quita solo el último bloque y el motor vuelve atrás', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('uno\n', 'dos');
    const s = sesion(motor);
    await s.insertarSiguiente();
    await s.insertarSiguiente();
    assert.strictEqual(await s.retroceder(), 'retrocedido');
    assert.strictEqual(documento.texto, 'uno\n');
    assert.strictEqual(motor.estado().insertados, 1);
  });

  await caso('retroceder es una sola edición y un solo paso de deshacer', async () => {
    const { editor } = crearEscenario({ texto: '' });
    const s = sesion(motorCon('a\nb'));
    await s.insertarSiguiente();
    const antes = editor.llamadas.length;
    await s.retroceder();
    assert.strictEqual(editor.llamadas.length, antes + 1);
    const o = editor.llamadas[antes].opciones;
    assert.strictEqual(o.undoStopBefore, true);
    assert.strictEqual(o.undoStopAfter, true);
  });

  await caso('retroceder deja el cursor donde empezaba el bloque', async () => {
    const { documento, editor } = crearEscenario({ texto: 'ab', cursor: 1 });
    const s = sesion(motorCon('XYZ'));
    await s.insertarSiguiente();
    await s.retroceder();
    assert.strictEqual(documento.texto, 'ab');
    assert.strictEqual(offsetDe(documento, editor.selection.active), 1);
  });

  await caso('después de retroceder, siguiente vuelve a insertar el mismo bloque', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const s = sesion(motorCon('a', 'b'));
    await s.insertarSiguiente();
    await s.retroceder();
    await s.insertarSiguiente();
    assert.strictEqual(documento.texto, 'a');
  });

  await caso('retroceder sin nada insertado: aviso informativo', async () => {
    const { documento } = crearEscenario({ texto: 'x' });
    assert.strictEqual(await sesion(motorCon('a')).retroceder(), 'inicio');
    assert.deepStrictEqual(vscode.avisos.informativos, [MENSAJES.inicio]);
    assert.strictEqual(documento.texto, 'x');
  });

  await caso('retroceder sin editor activo: avisa y conserva el historial', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('a');
    const s = sesion(motor);
    await s.insertarSiguiente();
    const editor = vscode.window.activeTextEditor;
    vscode.window.activeTextEditor = undefined;
    assert.strictEqual(await s.retroceder(), 'sin-editor');
    assert.deepStrictEqual(vscode.avisos.advertencias.at(-1), MENSAJES.sinEditor);
    assert.strictEqual(motor.estado().insertados, 1);
    vscode.window.activeTextEditor = editor;
    assert.strictEqual(await s.retroceder(), 'retrocedido');
    assert.strictEqual(documento.texto, '');
  });

  await caso('si la persona editó dentro del bloque: no borra, avisa y el motor no se mueve', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('abc');
    const s = sesion(motor);
    await s.insertarSiguiente();
    documento.escribirComoUsuario(1, 'ZZ');
    assert.strictEqual(await s.retroceder(), 'bloque-modificado');
    assert.deepStrictEqual(vscode.avisos.advertencias, [MENSAJES.bloqueModificado]);
    assert.strictEqual(documento.texto, 'aZZbc');
    assert.strictEqual(motor.estado().insertados, 1);
  });

  await caso('si el editor activo es otro archivo: no toca nada y avisa', async () => {
    const { documento } = crearEscenario({ texto: '' });
    const motor = motorCon('abc');
    const s = sesion(motor);
    await s.insertarSiguiente();
    const otro = crearEscenario({ texto: 'abc' }); // pasa a ser el editor activo, con el mismo texto
    assert.strictEqual(await s.retroceder(), 'bloque-modificado');
    assert.strictEqual(otro.documento.texto, 'abc');
    assert.strictEqual(documento.texto, 'abc');
    assert.strictEqual(motor.estado().insertados, 1);
  });

  fin('Live Coding (inserción y retroceso)');
})();
