// Responsabilidad: preparar el texto de un bloque para el editor (sangría de la línea actual y fin de línea del documento). Sin VS Code.

export type FinDeLinea = 'LF' | 'CRLF';

/** Espacios y tabulaciones con los que empieza la línea, hasta la columna del cursor. */
export function sangriaDeLinea(textoLinea: string, columna: number): string {
  const inicial = /^[ \t]*/.exec(textoLinea)![0];
  return inicial.slice(0, Math.max(0, columna));
}

/**
 * Devuelve el bloque listo para insertar en el cursor: la primera línea tal cual (ya está en el cursor),
 * las siguientes con `sangria` por delante (las líneas en blanco no la llevan) y los saltos con el fin de línea pedido.
 */
export function prepararTexto(texto: string, sangria: string, eol: FinDeLinea): string {
  const salto = eol === 'CRLF' ? '\r\n' : '\n';
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((linea, i) => (i > 0 && linea.trim() !== '' ? sangria + linea : linea))
    .join(salto);
}
