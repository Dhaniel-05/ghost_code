# Changelog

## 0.1.2
- **Visor con una sola fila arriba.** Se quitó la barra de título de Windows (con su X roja) y se eliminaron los nombres repetidos: ahora la cabecera dice solo **«Ghost Code»** y, a la derecha, cuatro íconos blancos en la misma fila: **ojo** (escudo), **reducir**, **maximizar / restaurar** y **cerrar**. Tampoco se muestra ya el nombre del archivo de la guía.
- La cabecera hace de barra: se **arrastra** con el ratón y el doble clic maximiza o restaura. Se **redimensiona** por los bordes de la ventana. Cerrar oculta el visor, igual que antes la X.
- **Clic derecho en la vista «Guías»:** ahora el menú contextual ofrece **Activar guía**, **Quitar guía** y **Ver bloque en el visor** (antes solo había botones al pasar el ratón).
- Borde fino del color del tema para distinguir la ventana del fondo; la barra compacta queda más baja (una sola fila).

## 0.1.1
- **El visor ya no se pierde.** Corregido: «siempre al frente» no se aplicaba si se pedía con el visor oculto y se quedaba detrás de otras ventanas. Nuevo comando **Traer el visor aquí (si se perdió)** (y botón en la vista Guías): lo restaura, lo mueve a una pantalla visible, lo muestra y lo sube al frente; si hace falta, arranca el visor de nuevo. El visor se recoloca solo al cambiar la disposición de pantallas (por ejemplo, al compartir pantalla) y nunca se queda minimizado.
- **Aviso cuando no responde:** si pides mostrar el visor y no contesta, sale un mensaje con el botón «Traer el visor» (y, si sigue sin responder, «Reiniciar el visor»).
- **Escudo:** cubre el código del visor con un panel opaco. Botón del **ojo** en el visor, atajo `Ctrl+Alt+E` y comando; la barra de estado muestra un candado mientras está puesto. Se recuerda aunque el visor se reinicie.
- **Botones propios en el visor:** ojo (escudo), **reducir a barra compacta** flotante (siempre visible, no se puede perder; un clic la expande) y **maximizar / restaurar**.
- Más detalle en el canal de salida «Ghost Code» para entender qué pasó si algo falla.

## 0.1.0
- Primera versión de **Ghost Code**: tener el código guía abierto mientras explicas en vivo, sin que lo vea la audiencia de una grabación, videollamada o pantalla compartida.
- **Visor protegido** (`ghost-viewer.exe`, autocontenido: no hace falta instalar .NET): ventana propia con protección de captura de Windows (`WDA_EXCLUDEFROMCAPTURE`), siempre al frente, sin botón en la barra de tareas, solo lectura, resaltado de sintaxis sin red, tema claro/oscuro y barra de título oscura.
- **Modo Fantasma**: un botón en la pestaña (y en el Explorador) que pasa el archivo al visor y cierra su pestaña, pero solo cuando el visor ya se ve.
- **Live Coding**: guías divididas en bloques con marcadores `// @@paso:`, `# @@paso:`, `-- @@paso:` o `/* @@paso: */` (o por dos líneas en blanco); inserción de bloque completo, tecleo letra por letra con velocidad configurable, retroceso seguro y cancelación con `Esc`.
- Vista **Guías** en la barra de actividad, indicador en la barra de estado y modo discreto (sin nombres ni títulos en pantalla).
- Solo Windows 10 (versión 2004 o posterior) y Windows 11, de 64 bits.
