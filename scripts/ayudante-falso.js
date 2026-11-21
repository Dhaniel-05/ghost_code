// Responsabilidad: ayudante de mentira que habla el protocolo de ghost-viewer, para probar el gestor sin el .exe real.
// Uso: node ayudante-falso.js --modo=<modo> [--registro=ruta] [--pid=ruta] [--contador=ruta] [--salida-limpia=ruta]
// Modos: normal, sale-ya, sin-listo, protocolo-viejo, sin-afinidad, cae-la-primera, cae-siempre, no-cierra, solo-stdin, ruidoso, con-error, con-stderr.
const fs = require('fs');
const readline = require('readline');

const arg = (nombre) => {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : undefined;
};
const modo = arg('modo') || 'normal';
const registro = arg('registro');
const salidaLimpia = arg('salida-limpia');
const contador = arg('contador');
if (arg('pid')) fs.writeFileSync(arg('pid'), String(process.pid));

const reg = (texto) => registro && fs.appendFileSync(registro, texto + '\n');
const enviar = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const salir = (codigo) => {
  if (salidaLimpia) fs.writeFileSync(salidaLimpia, 'ok');
  process.exit(codigo);
};
const LISTO = { tipo: 'listo', protocolo: 1, afinidad: true };
const mantenerVivo = () => setInterval(() => {}, 1000);

reg('#inicio');
let ejecucion = 1;
if (contador) {
  ejecucion = (fs.existsSync(contador) ? Number(fs.readFileSync(contador, 'utf8')) : 0) + 1;
  fs.writeFileSync(contador, String(ejecucion));
}

// Lee los comandos de stdin, los anota tal cual y responde como lo haría el visor real
function escuchar({ ignorarCerrar = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (linea) => {
    if (!linea.trim()) return;
    reg(linea);
    let m;
    try {
      m = JSON.parse(linea);
    } catch {
      return;
    }
    if (m.tipo === 'seleccionarBloque') enviar({ tipo: 'bloqueSeleccionado', indice: m.indice });
    else if (m.tipo === 'mostrar') enviar({ tipo: 'visibilidadCambiada', visible: true });
    else if (m.tipo === 'ocultar') enviar({ tipo: 'visibilidadCambiada', visible: false });
    else if (m.tipo === 'traer') enviar({ tipo: 'visibilidadCambiada', visible: true });
    else if (m.tipo === 'escudo') enviar({ tipo: 'escudoCambiado', activo: m.valor });
    else if (m.tipo === 'modo') enviar({ tipo: 'modoCambiado', valor: m.valor });
    else if (m.tipo === 'cerrar' && !ignorarCerrar) salir(0);
  });
  rl.on('close', () => salir(0)); // fin de stdin: lo que debe hacer el visor real para no quedar huérfano
}

switch (modo) {
  case 'sale-ya':
    process.exit(3);
    break;
  case 'sin-listo':
    mantenerVivo();
    break;
  case 'protocolo-viejo':
    enviar({ ...LISTO, protocolo: 0 });
    mantenerVivo();
    break;
  case 'sin-afinidad':
    enviar({ ...LISTO, afinidad: false });
    escuchar();
    break;
  case 'cae-la-primera':
    enviar(LISTO);
    if (ejecucion === 1) setTimeout(() => process.exit(1), 150);
    escuchar();
    break;
  case 'cae-siempre':
    enviar(LISTO);
    setTimeout(() => process.exit(1), 150);
    mantenerVivo();
    break;
  case 'no-cierra':
    enviar(LISTO);
    process.stdin.resume(); // ignora todo, incluido el fin de stdin
    mantenerVivo();
    break;
  case 'solo-stdin':
    enviar(LISTO);
    escuchar({ ignorarCerrar: true }); // ignora `cerrar`; solo sale al cerrarse stdin
    break;
  case 'ruidoso':
    enviar(LISTO);
    process.stdout.write('\n\n   \n');
    process.stdout.write('esto no es json\n');
    process.stdout.write('{"tipo":"visibilidadCambiada","visi'); // línea partida en dos escrituras
    setTimeout(() => {
      process.stdout.write('ble":true}\n');
      process.stdout.write('{"tipo":"desconocido"}\n');
      process.stdout.write('[1,2]\n');
      enviar({ tipo: 'bloqueSeleccionado', indice: 4 });
    }, 40);
    escuchar();
    break;
  case 'con-error':
    enviar(LISTO);
    enviar({ tipo: 'error', mensaje: 'boom', codigo: 'E1' });
    escuchar();
    break;
  case 'con-stderr':
    enviar(LISTO);
    process.stderr.write('hola desde stderr\n');
    escuchar();
    break;
  default:
    enviar(LISTO);
    escuchar();
}
