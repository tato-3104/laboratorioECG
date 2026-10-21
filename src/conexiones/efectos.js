/**
 * Efecto de una conexión sobre cada derivación, deducido de los vectores de derivación del modelo.
 *
 * Con el montaje correcto cada derivación tiene un vector de derivación «estándar». Con la conexión actual
 * el equipo calcula la misma fórmula, pero cada entrada puede leer otro sitio; el vector resultante se compara
 * con los estándar para decir si la derivación quedó igual, invertida, equivalente a otra, casi plana o distinta.
 * No hay una tabla de casos: cualquier combinación de errores se explica igual que en el equipo real.
 */
import { DERIVACIONES } from '../modelo/derivaciones.js';

const norma = (v) => Math.hypot(v[0], v[1], v[2]);
const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = (v) => [-v[0], -v[1], -v[2]];

export const coseno = (a, b) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norma(a) * norma(b) || 1);

/** Diferencia relativa por debajo de la cual dos vectores de derivación se consideran iguales. */
export const TOLERANCIA_EFECTO = 0.08;

/**
 * @param {string} d  derivación
 * @param {number[]} Lef  vector de derivación con la conexión actual
 * @param {Record<string, number[]>} Lstd  vectores de derivación con el montaje correcto
 * @returns {{tipo: 'igual'|'invertida'|'equivale'|'plana'|'distinta', a?: string, signo?: number, similitud?: number}}
 */
export function efectoSobreDerivacion(d, Lef, Lstd) {
  const ref = Lstd[d];
  const n = norma(ref);
  if (norma(Lef) < 0.12 * n) return { tipo: 'plana' };
  if (norma(resta(Lef, ref)) / n < TOLERANCIA_EFECTO) return { tipo: 'igual' };
  if (norma(resta(Lef, neg(ref))) / n < TOLERANCIA_EFECTO) return { tipo: 'invertida' };
  for (const s of DERIVACIONES) {
    if (s === d || !Lstd[s]) continue;
    const ns = norma(Lstd[s]);
    if (norma(resta(Lef, Lstd[s])) / ns < TOLERANCIA_EFECTO) return { tipo: 'equivale', a: s, signo: 1 };
    if (norma(resta(Lef, neg(Lstd[s]))) / ns < TOLERANCIA_EFECTO) return { tipo: 'equivale', a: s, signo: -1 };
  }
  return { tipo: 'distinta', similitud: coseno(Lef, ref) };
}

/** Efecto sobre las 12 derivaciones ('sin-senal' si falta alguna entrada). */
export function efectosDeConexion(Lef, Lstd) {
  const out = {};
  for (const d of DERIVACIONES) out[d] = Lef[d] ? efectoSobreDerivacion(d, Lef[d], Lstd) : { tipo: 'sin-senal' };
  return out;
}
