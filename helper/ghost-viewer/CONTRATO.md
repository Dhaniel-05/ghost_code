# Contrato de `ghost-viewer.exe`

Qué debe cumplir el ejecutable nativo (C# / .NET + WebView2) para que la extensión lo use. La extensión ya lo prueba contra un ayudante falso
(`scripts/ayudante-falso.js`) y contra los archivos de `contrato/`; el ejecutable real debe pasar esos mismos archivos.

## 1. Procesos y canales
- Lo lanza la extensión como proceso hijo directo, sin ventana de consola. Ningún argumento obligatorio.
- **stdin**: comandos, una línea JSON por comando (NDJSON), UTF-8 sin BOM. **stdout**: SOLO eventos, una línea JSON cada uno, con vaciado (`Flush`) tras cada línea.
  **stderr**: diagnóstico libre en texto (la extensión lo muestra en su canal de salida). Nunca escribir texto suelto en stdout.
- Línea máxima aceptada: 4 MiB. Líneas vacías o con solo espacios se ignoran. Un fin de línea `\r\n` es válido.
- Línea inválida (JSON malo, `tipo` desconocido, campos con tipo equivocado): se ignora y se escribe un aviso en stderr. **Nunca cerrar ni lanzar excepción por eso.**
- Campos desconocidos dentro de un comando válido se ignoran (compatibilidad hacia adelante).

## 2. Ciclo de vida (sin procesos huérfanos)
1. Al arrancar, crear la ventana y, cuando esté lista, escribir `{"tipo":"listo","protocolo":1,"afinidad":<bool>}` en un máximo de 10 s.
2. Comando `cerrar` → salir con código 0.
3. **Fin de stdin (EOF) → salir con código 0 en menos de 1 s.** Es lo que evita huérfanos si VS Code muere sin avisar.
4. Si falta WebView2 u ocurre un error fatal al arrancar: escribir `{"tipo":"error","mensaje":"…","codigo":"webview2-ausente"}` y salir con código 2. No quedarse colgado.
5. Una sola instancia por proceso de VS Code (no hace falta bloqueo global).

## 3. Ventana
- **Protección de captura:** en cuanto exista el `HWND` y ANTES de mostrarla, `SetWindowDisplayAffinity(hwnd, 0x11)` (`WDA_EXCLUDEFROMCAPTURE`) y verificar con
  `GetWindowDisplayAffinity` que quedó en `0x11`. El resultado va en `listo.afinidad`.
- **Si `afinidad` es `false` (Windows anterior a 10 versión 2004, o falla la llamada) el visor NO debe mostrar código jamás:** ignora `mostrar`
  y responde `{"tipo":"error","codigo":"sin-proteccion",…}`. La extensión además no le envía `mostrar`.
- Si la ventana se vuelve a crear (por ejemplo, un cambio de pantalla), se reaplica la protección antes de mostrarla.
- **Siempre al frente:** `SetWindowPos(hwnd, HWND_TOPMOST | HWND_NOTOPMOST, 0,0,0,0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)` según `siempreAlFrente`.
- **Sin rastro en lo que sí se captura:** estilo `WS_EX_TOOLWINDOW` (sin botón en la barra de tareas ni en Alt+Tab) y título neutro fijo, `Ghost Code`;
  nunca el nombre del archivo guía en el título.
- `mostrar` / `ocultar` son inmediatos (`ShowWindow` con `SW_SHOWNOACTIVATE` / `SW_HIDE`, sin robar el foco) y cada cambio emite `visibilidadCambiada`.
- Se puede mover y cambiar de tamaño; la posición y el tamaño se recuerdan entre sesiones (carpeta de datos del usuario, nunca junto a la guía).

## 3b. Escudo, modos y recuperación (versión 0.1.1)
- **`escudo` {valor}**: cubre (`true`) o descubre (`false`) el código con un panel opaco (no desenfoque). Responde `escudoCambiado {activo}`. También se puede cambiar con el botón del ojo de la página; el estado vive en el programa y cada cambio emite `escudoCambiado`.
- **`modo` {valor: normal | compacto | maximizado}**: compacto = barra flotante de ~300×44 (cliente) anclada a su esquina superior derecha; maximizado = área de trabajo de la pantalla actual (sin tapar la barra de tareas). Responde `modoCambiado {valor}`. Solo se recuerda la posición de la ventana normal. Los botones de la página piden el cambio y el programa lo aplica.
- **`traer`**: restaura si estuviera minimizada, la lleva a una pantalla visible, la muestra, la sube por encima de todo y emite `visibilidadCambiada true` aunque ya se viera (la extensión espera esa respuesta). Con protección de captura caída hace lo mismo que `mostrar`: error `sin-proteccion` y no se muestra.
- `mostrar` también confirma con `visibilidadCambiada true` si ya estaba visible, y recoloca la ventana si quedó fuera de las pantallas.
- **Nunca minimizada:** al no tener botón en la barra de tareas, una ventana minimizada no se recuperaría; si algo la minimiza, vuelve a normal.
- **Siempre al frente** se reaplica cada vez que la ventana pasa a verse (pedirlo con la ventana oculta no se conserva).
- Al cambiar la disposición de pantallas (monitores, resolución, compartir pantalla) la ventana se recoloca en lo visible; si estaba maximizada, se reajusta.

## 4. Contenido (solo lectura)
- WebView2 con una página propia incluida en el ejecutable. **Sin red:** el resaltador de sintaxis va empaquetado (nada de CDN) y se bloquean las navegaciones externas.
- Sin edición posible (nada `contenteditable`), menú contextual del navegador desactivado, texto seleccionable para poder leerlo.
- `cargarGuia`: muestra todos los bloques en orden con su título; resalta la sintaxis según `lenguaje` (si no lo conoce, texto plano).
- `seleccionarBloque`: marca el bloque, lo desplaza a la vista y emite `bloqueSeleccionado`. Un clic del presentador sobre un bloque también emite `bloqueSeleccionado`.
- `tema`: `claro` u `oscuro`, aplicado de inmediato.

## 5. Archivos de ejemplo (`contrato/`)
- `comandos-validos.ndjson`, `eventos-validos.ndjson`: cada línea debe aceptarse.
- `comandos-invalidos.ndjson`, `eventos-invalidos.ndjson`: formato `razón<TAB>línea`; cada línea debe rechazarse sin tumbar el proceso.

## 6. Decisión tomada: C# / .NET 8 autocontenido
- Se publica con `--self-contained true` + `PublishSingleFile` (win-x64), para que cualquiera lo use sin instalar .NET. Pesa decenas de MB y eso se acepta.
- Falta WebView2 solo en equipos muy viejos (viene con Windows 11 y con Windows 10 actualizado): el visor responde el error `webview2-ausente` y sale con código 2.
- Compilar: `npm run compilar:visor` (necesita el SDK de .NET 8; en GitHub Actions `windows-latest` ya viene). Probar el .exe real: `npm run test:exe`.
- Sin verificar todavía en un Windows real: que WebView2 cargue la página con la ventana oculta, y que el contenido de WebView2 quede de verdad fuera de las capturas.
