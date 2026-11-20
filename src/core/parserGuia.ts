// Responsabilidad: dividir el texto de una guía en bloques (marcadores @@paso o líneas en blanco dobles).
import { Bloque, ResultadoParseo } from './tipos';

// Marcador de línea (// # --) y de bloque en una sola línea (/* ... */). Solo cuenta si va al inicio de la línea.
const MARCADOR_LINEA = /^[ \t]*(?:\/\/|#|--)[ \t]*@@paso(?:[ \t]*:[ \t]*|[ \t]+|$)(.*)$/;
const MARCADOR_BLOQUE = /^[ \t]*\/\*[ \t]*@@paso(?:[ \t]*:[ \t]*|[ \t]+|$)(.*?)[ \t]*\*\/[ \t]*$/;
const SEPARADOR_BLANCOS = /\n(?:[ \t]*\n){2,}/;

const esBlanca = (linea: string) => linea.trim() === '';

/** Quita las líneas en blanco del inicio y del final; conserva la sangría de las demás. Devuelve '' si no queda nada. */
function recortarBlancas(lineas: string[]): string {
  let ini = 0;
  let fin = lineas.length;
  while (ini < fin && esBlanca(lineas[ini])) ini++;
  while (fin > ini && esBlanca(lineas[fin - 1])) fin--;
  return lineas.slice(ini, fin).join('\n');
}

function leerMarcador(linea: string): string | undefined {
  const m = MARCADOR_LINEA.exec(linea) ?? MARCADOR_BLOQUE.exec(linea);
  return m ? m[1].trim() : undefined;
}

export function parsearGuia(contenido: string): ResultadoParseo {
  const texto = contenido.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lineas = texto.split('\n');
  const bloques: Bloque[] = [];

  const agregar = (cuerpo: string, titulo: string) => {
    if (cuerpo === '') return;
    const indice = bloques.length;
    bloques.push({ indice, titulo: titulo || `Paso ${indice + 1}`, texto: cuerpo });
  };

  const hayMarcadores = lineas.some((l) => leerMarcador(l) !== undefined);

  if (!hayMarcadores) {
    for (const parte of texto.split(SEPARADOR_BLANCOS)) agregar(recortarBlancas(parte.split('\n')), '');
    return { modo: 'lineas-en-blanco', bloques };
  }

  let titulo = '';
  let actual: string[] = [];
  for (const linea of lineas) {
    const marcador = leerMarcador(linea);
    if (marcador === undefined) {
      actual.push(linea);
      continue;
    }
    agregar(recortarBlancas(actual), titulo);
    titulo = marcador;
    actual = [];
  }
  agregar(recortarBlancas(actual), titulo);
  return { modo: 'marcadores', bloques };
}
