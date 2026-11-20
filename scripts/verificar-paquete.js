// Responsabilidad: comprobar que lo que se va a empaquetar (o el .vsix ya hecho) lleva el visor autocontenido y no lleva sobrantes.
// Sin argumentos revisa la carpeta bin/ (se ejecuta antes de empaquetar). Con --vsix [ruta] revisa el .vsix (por defecto, el más reciente de release/).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.resolve(__dirname, '..');
const problemas = [];
const MIN_EXE_MB = 20; // un ejecutable que necesita el runtime instalado pesa muy poco: aquí debe ser autocontenido

function revisarCarpeta() {
  const dir = path.join(raiz, 'bin', 'win32-x64');
  const exe = path.join(dir, 'ghost-viewer.exe');
  if (!fs.existsSync(exe)) {
    problemas.push('Falta bin/win32-x64/ghost-viewer.exe: ejecuta «npm run compilar:visor» (necesita el SDK de .NET 8).');
  } else {
    const mb = fs.statSync(exe).size / 1048576;
    if (mb < MIN_EXE_MB) problemas.push(`ghost-viewer.exe pesa solo ${mb.toFixed(1)} MB: no parece autocontenido (¿se compiló sin --self-contained?).`);
    const sobrantes = fs.readdirSync(dir).filter((f) => f !== 'ghost-viewer.exe');
    if (sobrantes.length) problemas.push(`Sobran archivos junto al ejecutable: ${sobrantes.join(', ')}.`);
  }
  if (!fs.existsSync(path.join(raiz, 'out', 'extension.js'))) problemas.push('Falta out/extension.js: ejecuta «npm run compile».');
}

function ultimoVsix() {
  const dir = path.join(raiz, 'release');
  const lista = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.vsix')) : [];
  if (!lista.length) return undefined;
  return path.join(dir, lista.map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f);
}

function revisarVsix(ruta) {
  if (!ruta || !fs.existsSync(ruta)) {
    problemas.push(`No se encontró el .vsix (${ruta ?? 'release/*.vsix'}): ejecuta «npm run package».`);
    return;
  }
  // `tar` de Windows (bsdtar) y de macOS lee .zip; en Linux hace falta bsdtar, por eso esta revisión se usa en Windows
  let entradas;
  try {
    entradas = execFileSync('tar', ['-tf', ruta], { encoding: 'utf8', maxBuffer: 1 << 26 }).split(/\r?\n/).filter(Boolean);
  } catch (e) {
    problemas.push(`No se pudo listar el .vsix con «tar»: ${e.message}`);
    return;
  }
  const hay = (e) => entradas.includes(e);
  for (const e of ['extension/package.json', 'extension/out/extension.js', 'extension/bin/win32-x64/ghost-viewer.exe', 'extension/media/ghost.svg', 'extension/readme.md']) {
    if (!hay(e)) problemas.push(`El .vsix no lleva ${e}.`);
  }
  const prohibidas = entradas.filter((e) => /^extension\/(src|scripts|helper|ejemplo|node_modules|\.vscode|\.github)\//.test(e) || /\.map$/.test(e) || /^extension\/bin\/.*\.(xml|pdb)$/.test(e));
  if (prohibidas.length) problemas.push(`El .vsix lleva archivos que sobran: ${prohibidas.slice(0, 8).join(', ')}${prohibidas.length > 8 ? '…' : ''}`);
  const otrosEnBin = entradas.filter((e) => e.startsWith('extension/bin/') && !e.endsWith('/') && e !== 'extension/bin/win32-x64/ghost-viewer.exe');
  if (otrosEnBin.length) problemas.push(`Hay otros archivos en bin/: ${otrosEnBin.join(', ')}`);
  console.log(`  ${path.basename(ruta)}: ${entradas.filter((e) => !e.endsWith('/')).length} archivos, ${(fs.statSync(ruta).size / 1048576).toFixed(1)} MB`);
}

const i = process.argv.indexOf('--vsix');
if (i === -1) revisarCarpeta();
else revisarVsix(process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? path.resolve(process.argv[i + 1]) : ultimoVsix());

if (problemas.length) {
  console.error('Verificación del paquete: FALLÓ\n' + problemas.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(i === -1 ? 'Verificación de bin/ y out/: correcta.' : 'Verificación del .vsix: correcta.');
