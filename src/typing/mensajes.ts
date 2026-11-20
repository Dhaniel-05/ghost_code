// Responsabilidad: textos que se muestran al presentador (avisos del modo Live Coding), en un solo lugar.
export const MENSAJES = {
  sinEditor: 'Ghost Code: abre un archivo de texto y pon el cursor donde quieres insertar el bloque.',
  sinBloques: 'Ghost Code: no hay una guía cargada o no tiene bloques.',
  terminado: 'Ghost Code: ya no quedan bloques; era el último.',
  inicio: 'Ghost Code: no hay bloques insertados para retroceder.',
  noSePudoEditar: 'Ghost Code: no se pudo escribir en este archivo (¿es de solo lectura?).',
  bloqueModificado:
    'Ghost Code: el bloque cambió o está en otro archivo; no se retrocedió para no borrar tu trabajo. Deshaz con Ctrl+Z.',
} as const;
