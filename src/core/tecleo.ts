// Responsabilidad: convertir un bloque en la lista de pasos del tecleo letra por letra.
import { OpcionesTecleo, PasoTecleo } from './tipos';

export const CPS_MIN = 1;
export const CPS_MAX = 200;
export const CPS_POR_DEFECTO = 30;

/** Velocidad válida: no finita → por defecto; fuera de rango → se limita a [CPS_MIN, CPS_MAX]. */
function velocidadSegura(cps: number): number {
  if (!Number.isFinite(cps)) return CPS_POR_DEFECTO;
  return Math.min(CPS_MAX, Math.max(CPS_MIN, cps));
}

export function planTecleo(texto: string, opciones: OpcionesTecleo): PasoTecleo[] {
  const retardoMs = 1000 / velocidadSegura(opciones.caracteresPorSegundo);
  // Array.from separa por caracteres completos: un emoji no se parte en dos
  return Array.from(texto, (caracter) => ({ texto: caracter, retardoMs }));
}
