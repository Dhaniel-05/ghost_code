// Responsabilidad: tipos de lo que la extensión necesita de afuera (el ayudante), para poder cambiarlo en las pruebas.
import { Comando, Evento } from './platform/protocolo';
import { EstadoAyudante, OpcionesAyudante } from './platform/ayudante';

/** Lo que la extensión usa del ayudante; `Ayudante` lo cumple. */
export interface AyudanteLike {
  readonly estado: EstadoAyudante;
  readonly proteccionActiva: boolean;
  iniciar(): Promise<Extract<Evento, { tipo: 'listo' }>>;
  enviar(comando: Comando): boolean;
  detener(): Promise<void>;
}

export interface Dependencias {
  /** Crea el ayudante. Por defecto, un `Ayudante` real. */
  crearAyudante?: (opciones: OpcionesAyudante) => AyudanteLike;
  /** Cuánto se espera a que el visor confirme que se ve, en milisegundos (por defecto 3500). */
  esperaVisorMs?: number;
}
