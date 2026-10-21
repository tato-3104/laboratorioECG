/**
 * Registros «impresos» del electrocardiógrafo: copias de las últimas señales con sus metadatos,
 * para verlos en papel, medirlos con cursores y compararlos entre sí.
 */
import { EQUIPO } from '../config/equipo.js';

/**
 * Crea un registro a partir del motor de adquisición.
 * @param {import('./adquisicion.js').MotorAdquisicion} motor
 * @param {{ajustes: object, voluntario?: number, estudiante?: string, etiqueta?: string, montajeResumen?: string,
 *          condicion?: string|null, numero?: number|null}} meta
 * @param {number} [duracion]  s (por defecto, 20 s: la tira de ritmo)
 * @returns {object}  numero = null para la instantánea de «Congelar» (no es un registro impreso)
 */
export function crearRegistro(motor, meta, duracion = EQUIPO.duracionRitmoS) {
  const inst = motor.instantanea(duracion);
  const ahora = new Date();
  const numero = meta.numero ?? null;
  const duracionReal = inst.n / inst.fs;
  // Uniforme: los 20 s del registro corresponden a una misma conexión (no hubo cambios durante la ventana).
  const uniforme = duracionReal >= duracion - 1 / inst.fs && inst.tInicio >= motor.ultimoCambio - 1e-9;
  return {
    id: `${numero ? 'r' : 'c'}${ahora.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    numero,
    fecha: ahora.toISOString(),
    hora: ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    fs: inst.fs,
    n: inst.n,
    duracion: duracionReal,
    tInicio: inst.tInicio,
    derivaciones: inst.derivaciones,
    latidos: inst.latidos,
    detecciones: inst.detecciones,
    fc: motor.frecuencia(),
    ajustes: JSON.parse(JSON.stringify(meta.ajustes)),
    voluntario: meta.voluntario ?? null,
    estudiante: meta.estudiante ?? '',
    condicion: meta.condicion ?? null,
    uniforme,
    segundosSinCambios: motor.segundosSinCambios(),
    etiqueta: meta.etiqueta ?? (numero ? `Registro ${numero}` : 'Pantalla congelada'),
    montajeResumen: meta.montajeResumen ?? '',
  };
}

/** Recorta un registro a los últimos `segundos` (p. ej., 10 s para la página 6×2). */
export function ventanaFinal(registro, segundos) {
  const n = Math.min(registro.n, Math.round(segundos * registro.fs));
  const desde = registro.n - n;
  const derivaciones = {};
  for (const d in registro.derivaciones) derivaciones[d] = registro.derivaciones[d].subarray(desde);
  return { ...registro, n, duracion: n / registro.fs, tInicio: registro.tInicio + desde / registro.fs, derivaciones };
}

/** ¿El registro tiene señal (no NaN) en la derivación? */
export function tieneSenal(registro, d) {
  const x = registro.derivaciones[d];
  for (let i = 0; i < x.length; i += 25) if (Number.isFinite(x[i])) return true;
  return false;
}
