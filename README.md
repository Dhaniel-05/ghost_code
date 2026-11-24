# Ghost Code

Ten tu **código guía abierto mientras explicas en vivo, sin que la audiencia lo vea**. Ghost Code muestra tu guía en una ventana aparte que Windows **excluye de las capturas de pantalla**, grabaciones y videollamadas, y te deja escribir esa guía en tu editor **bloque a bloque** con un atajo.

> Tú ves la ventana; el video, la grabación o la pantalla compartida **no**.

## Requisitos

- **Windows 10 (versión 2004 o posterior) o Windows 11**, de 64 bits. En versiones anteriores Windows no puede ocultar la ventana de las capturas, y Ghost Code se niega a mostrarla.
- **WebView2 Runtime**: viene con Windows 11 y con Windows 10 actualizado. Si falta, Ghost Code te avisa.
- VS Code 1.85 o posterior.
- No hace falta instalar .NET: el visor viene autocontenido.

## Instalación

1. Descarga el archivo `ghost-code-win32-x64-<versión>.vsix` desde la página de **Releases** del repositorio.
2. Instálalo:

```powershell
code --install-extension ghost-code-win32-x64-0.1.1.vsix
```

   O desde VS Code: **Extensiones** (`Ctrl+Shift+X`) → menú `···` → **Instalar desde VSIX…**

Las extensiones instaladas desde un `.vsix` no se actualizan solas: para actualizar, instala el `.vsix` nuevo.

## Empezar en 3 pasos

1. **Escribe tu guía** en un archivo, con un marcador antes de cada bloque:

   ```ts
   // @@paso: Importar Express
   import express from 'express';

   // @@paso: Crear la aplicación
   const app = express();
   ```

2. **Cárgala**: clic derecho sobre el archivo en el Explorador → **Cargar guía…** (o la vista **Guías** del fantasma en la barra de actividad).
3. **Muéstrala y escribe**: `Ctrl+Alt+H` abre el visor; en el archivo donde vas a escribir, `Ctrl+Alt+→` inserta el siguiente bloque.

## Modo Fantasma

El botón del **fantasma** en la barra de pestañas (y la entrada **Modo Fantasma** del clic derecho en el Explorador) hace todo de una vez:

1. Toma ese archivo como guía.
2. Abre el visor protegido.
3. **Cuando el visor ya se ve**, cierra la pestaña del archivo para que no aparezca en la pantalla compartida.

Cuidados que ya tiene:

- Si el archivo tiene cambios sin guardar, los **guarda antes** de cerrar (así no sale el aviso de «¿guardar?» en pantalla).
- Si el visor **no se puede mostrar** (no arranca o Windows no puede ocultarlo de las capturas), **no cierra la pestaña**: tu código nunca se queda sin un sitio donde verse.

## Atajos

| Atajo | Qué hace |
|---|---|
| `Ctrl+Alt+H` | Mostrar u ocultar el visor al instante |
| `Ctrl+Alt+E` | **Escudo**: cubrir o mostrar el código del visor |
| `Ctrl+Alt+→` | Insertar el siguiente bloque en el cursor |
| `Ctrl+Alt+Shift+→` | Teclear el siguiente bloque **letra por letra** |
| `Ctrl+Alt+←` | Retroceder el último bloque |
| `Esc` | Cancelar el tecleo en curso |

Todos se pueden cambiar en **Preferencias → Atajos de teclado** (busca «Ghost Code»). Ten en cuenta que `Ctrl+Alt+←` y `Ctrl+Alt+→` coinciden con atajos de VS Code para mover el editor entre grupos: los de Ghost Code tienen prioridad mientras la extensión está instalada.

## Cómo se escribe una guía

Una guía es un archivo de texto cualquiera dividido en **bloques**. Se separan con una línea de marcador (al inicio de la línea):

| Lenguaje | Marcador |
|---|---|
| JavaScript, TypeScript, C#, Java… | `// @@paso: título` |
| Python, Bash, YAML… | `# @@paso: título` |
| SQL, Lua | `-- @@paso: título` |
| CSS, otros | `/* @@paso: título */` |

- Si el archivo **no tiene marcadores**, los bloques se separan por **dos o más líneas en blanco**.
- Lo que haya **antes del primer marcador** se convierte en el primer bloque («Paso 1»).
- El título es opcional; sin él se usa «Paso N».

## El visor: ojo, barra compacta y maximizar

El visor tiene una sola fila arriba, con el título «Ghost Code» y cuatro botones. Se arrastra desde esa fila (el doble clic maximiza o restaura) y se redimensiona por los bordes:

| Botón | Qué hace |
|---|---|
| **Ojo** | **Escudo**: cubre el código con un panel opaco («Contenido oculto») por si alguien se asoma a tu pantalla. Otro clic lo descubre. También con `Ctrl+Alt+E` desde VS Code. |
| **Reducir** | Pasa a una **barra compacta flotante**, siempre visible (y oculta de las capturas), que no se puede perder. Un clic la expande. |
| **Maximizar / restaurar** | Ocupa toda el área de trabajo, sin tapar la barra de tareas. |
| **Cerrar (X)** | Oculta el visor (la extensión lo vuelve a mostrar con `Ctrl+Alt+H`). |

La barra de estado muestra un **candado** mientras el escudo está puesto.

> El atajo `Ctrl+Alt+E` solo funciona con VS Code enfocado. Si estás en otra aplicación (por ejemplo, la llamada), usa el botón del ojo del visor con el ratón.

## Si el visor se pierde

Como no tiene botón en la barra de tareas (para no dejar rastro en una pantalla compartida), usa **Ghost Code: Traer el visor aquí (si se perdió)** desde la paleta de comandos (`Ctrl+Shift+P`) o con el botón de la vista **Guías**. Lo restaura, lo mueve a una pantalla visible, lo muestra y lo sube al frente (y lo arranca de nuevo si se había cerrado). Si pides mostrarlo y no responde, Ghost Code te avisa con ese mismo botón.

## Escribir en vivo (Live Coding)

- **Insertar un bloque** respeta la sangría de la línea donde está el cursor y el fin de línea del archivo (LF o CRLF). Si hay una selección, la reemplaza. Un bloque es **un solo paso de «deshacer»**.
- **Teclear letra por letra** simula que escribes: la velocidad se cambia con `ghostCode.tecleo.caracteresPorSegundo` (1 a 200, por defecto 30). Se cancela con `Esc`, si cambias de archivo o si escribes tú en el documento; lo ya escrito se conserva.
- **Retroceder** quita el último bloque solo si sigue intacto: si lo editaste, avisa y no borra tu trabajo.
- Ghost Code **nunca escribe en el archivo que es la guía**.
- Con el visor abierto, siempre queda marcado el **bloque que toca escribir**.

## Ajustes

| Ajuste | Por defecto | Para qué sirve |
|---|---|---|
| `ghostCode.tecleo.caracteresPorSegundo` | `30` | Velocidad del tecleo letra por letra |
| `ghostCode.visor.siempreAlFrente` | `true` | El visor queda por encima de las demás ventanas |
| `ghostCode.visor.tema` | `auto` | `auto` sigue el tema de VS Code; o `claro` / `oscuro` |
| `ghostCode.arbolDiscreto` | `false` | La vista «Guías» no muestra nombres de archivo ni títulos de bloque |
| `ghostCode.mostrarBarraDeEstado` | `true` | Indicador en la barra de estado |
| `ghostCode.visor.rutaEjecutable` | vacío | Ruta de otro `ghost-viewer.exe` (solo desde la configuración de usuario) |

## Qué se oculta y qué no (léelo antes de una presentación)

El escudo cubre el visor, pero no la ventana principal de VS Code.

Ghost Code usa la protección de captura de Windows (`SetWindowDisplayAffinity` con `WDA_EXCLUDEFROMCAPTURE`). Eso funciona con las **capturas por software**: grabadores de pantalla, Teams, Zoom, Meet, OBS y la herramienta de recortes. Se verificó con la captura de pantalla de Windows; **prueba tu programa de grabación o videollamada antes** de una sesión importante.

No protege contra:

- **Un proyector en modo «duplicar»**: la imagen sale por el cable y el visor se ve. Usa el modo **«extender»** y deja el visor en la pantalla de tu portátil.
- **Capturadoras por hardware** o una **cámara apuntando a tu pantalla**.
- **Lo que está en la ventana principal de VS Code**: la barra lateral, la barra de estado y las pestañas sí se ven. Por eso existe el **Modo Fantasma** (cierra la pestaña) y el ajuste `ghostCode.arbolDiscreto`. Si no quieres ni siquiera el indicador de la barra de estado, desactiva `ghostCode.mostrarBarraDeEstado`.

## Privacidad

- El visor **no usa la red**: el resaltador de sintaxis va incluido y se bloquean las navegaciones externas.
- Ghost Code guarda en VS Code **solo las rutas** de las guías cargadas (para recargarlas al abrir) y, en `%LOCALAPPDATA%\GhostCode`, la posición de la ventana del visor y los datos de WebView2.
- No envía telemetría.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| «falta WebView2 en este equipo» | Instala **WebView2 Runtime** desde Microsoft y vuelve a intentarlo. |
| «este Windows no permite ocultar la ventana de las capturas» | Hace falta Windows 10 versión 2004 o posterior; el visor no se mostrará. |
| «no se encontró ghost-viewer» | La instalación quedó incompleta: reinstala el `.vsix`. |
| No veo el visor | Comando **Traer el visor aquí (si se perdió)**. |
| El visor se cerró varias veces seguidas | Abre el canal de salida **Ghost Code** (comando *Mostrar la salida*) y revisa el motivo. |

## Desarrollo

```powershell
npm ci                    # dependencias
npm test                  # compila y corre todas las pruebas (no necesita el .exe)
npm run compilar:visor    # compila ghost-viewer.exe autocontenido (necesita el SDK de .NET 8)
npm run test:exe          # prueba el .exe real contra el contrato (solo Windows)
npm run package           # genera el .vsix en release/ (win32-x64)
npm run verificar:vsix    # comprueba el contenido del .vsix
```

Para probarla: abre esta carpeta en VS Code y pulsa **F5** (se abre una ventana con la carpeta `ejemplo/` y una guía de muestra).

Estructura: `src/core` (guías y bloques, sin depender de VS Code), `src/typing` (escribir en el editor), `src/platform` (protocolo y proceso del visor), `src/commands` y `src/views` (comandos, barra de estado y árbol), `helper/ghost-viewer` (el visor en C# / WebView2; su contrato está en `helper/ghost-viewer/CONTRATO.md`).

Para publicar una versión: sube el número en `package.json`, anótalo en `CHANGELOG.md` y sube la etiqueta `vX.Y.Z`; GitHub compila el visor, empaqueta el `.vsix` y crea el Release.

## Licencia

MIT

## Patrocinio / Support

Ghost Code es libre y gratuito. Con tu apoyo ayudas a que [**RAMCRACK**](https://ramcrack.com/) siga desarrollando herramientas de código abierto bajo licencia MIT: puedes patrocinar en [GitHub Sponsors](https://github.com/sponsors/Dhaniel-05).

También ayuda reportar errores y proponer mejoras en [Issues](https://github.com/Dhaniel-05/ghost_code/issues).
