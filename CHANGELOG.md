# Changelog

## 0.1.0
- Primera versión de **Ghost Code**: tener el código guía abierto mientras explicas en vivo, sin que lo vea la audiencia de una grabación, videollamada o pantalla compartida.
- **Visor protegido** (`ghost-viewer.exe`, autocontenido: no hace falta instalar .NET): ventana propia con protección de captura de Windows (`WDA_EXCLUDEFROMCAPTURE`), siempre al frente, sin botón en la barra de tareas, solo lectura, resaltado de sintaxis sin red, tema claro/oscuro y barra de título oscura.
- **Modo Fantasma**: un botón en la pestaña (y en el Explorador) que pasa el archivo al visor y cierra su pestaña, pero solo cuando el visor ya se ve.
- **Live Coding**: guías divididas en bloques con marcadores `// @@paso:`, `# @@paso:`, `-- @@paso:` o `/* @@paso: */` (o por dos líneas en blanco); inserción de bloque completo, tecleo letra por letra con velocidad configurable, retroceso seguro y cancelación con `Esc`.
- Vista **Guías** en la barra de actividad, indicador en la barra de estado y modo discreto (sin nombres ni títulos en pantalla).
- Solo Windows 10 (versión 2004 o posterior) y Windows 11, de 64 bits.
