// Responsabilidad: llevar la cuenta de qué bloque sigue (avanzar, retroceder, vista previa, reinicio).
import { Bloque, EstadoMotor } from './tipos';

export class MotorBloques {
  private bloques: Bloque[] = [];
  private insertados = 0;

  constructor(bloques: Bloque[]) {
    this.cargar(bloques);
  }

  /** Reemplaza la guía y vuelve al inicio. Se copia el arreglo para no depender de quien lo pasó. */
  cargar(bloques: Bloque[]): void {
    this.bloques = bloques.slice();
    this.insertados = 0;
  }

  /** Devuelve el bloque a insertar y avanza; undefined si ya no quedan. */
  siguiente(): Bloque | undefined {
    const bloque = this.bloques[this.insertados];
    if (bloque) this.insertados++;
    return bloque;
  }

  /** Devuelve el último bloque insertado (para deshacerlo) y retrocede; undefined si no hay ninguno. */
  retroceder(): Bloque | undefined {
    if (this.insertados === 0) return undefined;
    this.insertados--;
    return this.bloques[this.insertados];
  }

  /** El próximo bloque sin avanzar. */
  vistaPrevia(): Bloque | undefined {
    return this.bloques[this.insertados];
  }

  reiniciar(): void {
    this.insertados = 0;
  }

  estado(): EstadoMotor {
    const total = this.bloques.length;
    return { insertados: this.insertados, total, terminado: this.insertados >= total };
  }
}
