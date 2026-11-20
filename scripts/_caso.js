// Responsabilidad: mini ejecutor de casos de prueba (muestra todos los fallos y sale con código 1 si hay alguno).
// Acepta funciones normales o async: con async hay que esperar el resultado (`await caso(...)`).
let fallos = 0;
let total = 0;

function caso(nombre, fn) {
  total++;
  const bien = () => console.log(`  ok   ${nombre}`);
  const mal = (e) => {
    fallos++;
    console.log(`  FALLA ${nombre}\n        ${String((e && e.message) || e).split('\n')[0]}`);
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(bien, mal);
    bien();
  } catch (e) {
    mal(e);
  }
}

function fin(titulo) {
  console.log(`\n${titulo}: ${total - fallos}/${total} casos en verde`);
  if (fallos) process.exit(1);
}

module.exports = { caso, fin };
