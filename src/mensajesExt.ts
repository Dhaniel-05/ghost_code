// Responsabilidad: textos que la extensión muestra a la persona (avisos y errores), en un solo lugar.
export const MSG = {
  sinArchivoActivo: 'Ghost Code: abre el archivo que quieres usar como guía.',
  guardaPrimero: 'Ghost Code: guarda el archivo en disco antes de usarlo como guía.',
  esLaGuia: 'Ghost Code: el archivo activo es la propia guía; pasa al archivo donde vas a escribir.',
  sinProteccion:
    'Ghost Code: este Windows no permite ocultar la ventana de las capturas, así que el visor no se mostrará (hace falta Windows 10 versión 2004 o posterior).',
  webview2Ausente: 'Ghost Code: falta WebView2 en este equipo. Instala «WebView2 Runtime» de Microsoft y vuelve a intentarlo.',
  visorAgotado: 'Ghost Code: el visor se cerró varias veces seguidas y no se pudo recuperar. Revisa el canal «Ghost Code» y vuelve a mostrarlo.',
  visorNoMostro: 'Ghost Code: el visor no llegó a mostrarse, así que la pestaña no se cerró.',
  noSeGuardo: (nombre: string) => `Ghost Code: no se pudo guardar «${nombre}», así que su pestaña no se cerró.`,
  visorNoArranca: (detalle: string) => `Ghost Code: no se pudo abrir el visor. ${detalle}`,
  guiaVacia: (nombre: string) =>
    `Ghost Code: «${nombre}» no tiene bloques. Usa marcadores como «// @@paso: título» o separa los bloques con dos líneas en blanco.`,
  guiaGrande: (nombre: string) => `Ghost Code: «${nombre}» es demasiado grande para ser una guía (máximo 2 MB).`,
  noSeLeyo: (nombre: string, detalle: string) => `Ghost Code: no se pudo leer «${nombre}»: ${detalle}`,
} as const;
