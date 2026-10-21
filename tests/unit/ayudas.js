/**
 * Utilidades comunes de las pruebas.
 */
import { crearTorax, crearCampoToracico } from '../../src/modelo/torax.js';
import { vectoresExtremidades } from '../../src/modelo/vectoresDerivacion.js';
import { resolverEntradas, vectoresPorEntrada } from '../../src/conexiones/entradas.js';
import { vectoresDeDerivacion, DERIVACIONES } from '../../src/modelo/derivaciones.js';

export const torax = crearTorax();
export const campo = crearCampoToracico(torax);
export const extremidades = vectoresExtremidades();

/** Vectores por entrada para un montaje (null en las entradas flotantes). */
export function vectoresDeMontaje(montaje) {
  return vectoresPorEntrada(resolverEntradas(montaje), campo, extremidades);
}

/** Derivaciones (arreglos) a partir de H(t) y los vectores por entrada; null si la derivación no es calculable. */
export function derivacionesDesdeH(h, vectoresEntrada) {
  const L = vectoresDeDerivacion(vectoresEntrada);
  const n = h[0].length;
  const out = {};
  for (const d of DERIVACIONES) {
    if (!L[d]) {
      out[d] = null;
      continue;
    }
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = L[d][0] * h[0][i] + L[d][1] * h[1][i] + L[d][2] * h[2][i];
    out[d] = x;
  }
  return out;
}

/** Máxima diferencia absoluta entre dos arreglos. */
export function maxDif(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

export function maxAbs(a) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  return m;
}

export const negar = (a) => Float64Array.from(a, (v) => -v);
export const escalar = (a, k) => Float64Array.from(a, (v) => v * k);
