/**
 * Medidas de referencia sobre derivaciones "limpias" (sin ruido ni filtros), calculadas desde el modelo.
 * Sirven para las pruebas automáticas y, en la fase de actividades, como valores verdaderos para calificar.
 */
import { latidoAislado } from './vectorCardiaco.js';
import { vectoresDeDerivacion, DERIVACIONES } from './derivaciones.js';

const GRADOS = 180 / Math.PI;

/**
 * Derivaciones de un latido aislado para una conexión dada.
 * @param {object} sujeto
 * @param {Record<string, number[]>} vectorPorEntrada  vector (respecto al TCW) que ve cada entrada
 * @param {number} rr
 * @param {number} fs
 */
export function latidoEnDerivaciones(sujeto, vectorPorEntrada, rr, fs) {
  const { t, h, qt } = latidoAislado(sujeto, rr, fs);
  const L = vectoresDeDerivacion(vectorPorEntrada);
  const derivaciones = {};
  for (const d of DERIVACIONES) {
    if (!L[d]) continue;
    const v = L[d];
    const x = new Float64Array(t.length);
    for (let i = 0; i < t.length; i++) x[i] = v[0] * h[0][i] + v[1] * h[1][i] + v[2] * h[2][i];
    derivaciones[d] = x;
  }
  return { t, derivaciones, qt };
}

/**
 * Amplitudes de las ondas de un latido en cada derivación (mV).
 * Ventanas (t relativo al inicio del QRS): P en [−PR, −PR + duraciónP], QRS en [0, duraciónQRS], T en [duraciónQRS + 0,05, QT].
 */
export function amplitudesOndas(latido, sujeto, duracionP = 0.1, duracionQRS = 0.09) {
  const { t, derivaciones, qt } = latido;
  const res = {};
  for (const d in derivaciones) {
    const x = derivaciones[d];
    let pMax = 0, pMin = 0, rMax = 0, iR = -1, tMax = 0, tMin = 0, area = 0;
    const qrsIdx = [];
    for (let i = 0; i < t.length; i++) {
      const ti = t[i];
      if (ti >= -sujeto.pr && ti <= -sujeto.pr + duracionP) {
        pMax = Math.max(pMax, x[i]);
        pMin = Math.min(pMin, x[i]);
      } else if (ti >= 0 && ti <= duracionQRS) {
        qrsIdx.push(i);
        if (x[i] > rMax) {
          rMax = x[i];
          iR = i;
        }
      } else if (ti > duracionQRS + 0.05 && ti <= qt) {
        tMax = Math.max(tMax, x[i]);
        tMin = Math.min(tMin, x[i]);
      }
    }
    let q = 0, s = 0;
    for (const i of qrsIdx) {
      area += x[i];
      if (iR < 0 || i < iR) q = Math.min(q, x[i]);
      else s = Math.min(s, x[i]);
    }
    const dt = t[1] - t[0];
    res[d] = { pMax, pMin, q, r: rMax, s, tMax, tMin, areaQRS: area * dt };
  }
  return res;
}

/**
 * Eje en el plano frontal con la convención del círculo hexaxial: θ = atan2(2·aVF/√3, I).
 * @param {number} valorI   área o amplitud neta en I
 * @param {number} valorAVF área o amplitud neta en aVF
 */
export function ejeFrontal(valorI, valorAVF) {
  return Math.atan2((2 * valorAVF) / Math.sqrt(3), valorI) * GRADOS;
}

/** Eje de una onda a partir de las áreas netas en I y aVF dentro de una ventana [t0, t1] (s, relativos al QRS). */
export function ejeDeOnda(latido, t0, t1) {
  const { t, derivaciones } = latido;
  let aI = 0, aF = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] >= t0 && t[i] <= t1) {
      aI += derivaciones.I[i];
      aF += derivaciones.aVF[i];
    }
  }
  return ejeFrontal(aI, aF);
}
