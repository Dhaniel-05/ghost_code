// Responsabilidad: tipos del núcleo (sin depender de VS Code): bloques de la guía y planes de tecleo.

export interface Bloque {
  /** Posición del bloque en la guía, desde 0. */
  indice: number;
  /** Texto del marcador (`// @@paso: título`) o «Paso N» si no tiene. */
  titulo: string;
  /** Código del bloque con saltos `\n`, sin líneas en blanco al inicio ni al final. */
  texto: string;
}

export type ModoDivision = 'marcadores' | 'lineas-en-blanco';

export interface ResultadoParseo {
  modo: ModoDivision;
  bloques: Bloque[];
}

export interface EstadoMotor {
  /** Cuántos bloques ya se insertaron. */
  insertados: number;
  total: number;
  /** Verdadero cuando ya se insertaron todos (o la guía está vacía). */
  terminado: boolean;
}

export interface PasoTecleo {
  /** Carácter completo (un emoji cuenta como uno). */
  texto: string;
  /** Espera antes de escribirlo, en milisegundos. */
  retardoMs: number;
}

export interface OpcionesTecleo {
  caracteresPorSegundo: number;
}
