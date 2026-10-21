/**
 * Cálculo de las 12 derivaciones a partir de los potenciales que llegan a las ENTRADAS del equipo.
 *
 * El equipo no sabe dónde están los electrodos: solo combina lo que recibe en cada entrada.
 * Por eso, si los cables están intercambiados, las derivaciones cambian exactamente como en la realidad.
 *
 *   I   = Φ_LA − Φ_RA          aVR = Φ_RA − (Φ_LA + Φ_LL)/2
 *   II  = Φ_LL − Φ_RA          aVL = Φ_LA − (Φ_RA + Φ_LL)/2
 *   III = Φ_LL − Φ_LA          aVF = Φ_LL − (Φ_RA + Φ_LA)/2
 *   TCW = (Φ_RA + Φ_LA + Φ_LL)/3      Vi = Φ_Vi − TCW
 *
 * RL (pierna derecha) es el electrodo de referencia del amplificador: no aparece en ninguna ecuación.
 */

/** Entradas del equipo (nombres internos AHA; la etiqueta visible depende del estándar de colores). */
export const ENTRADAS = Object.freeze(['RA', 'LA', 'LL', 'RL', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

/** Las 12 derivaciones, en el orden habitual. */
export const DERIVACIONES = Object.freeze(['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

export const GRUPO_EXTREMIDADES = Object.freeze(['I', 'II', 'III', 'aVR', 'aVL', 'aVF']);
export const GRUPO_PRECORDIALES = Object.freeze(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

/** Entradas de las que depende cada derivación. */
export const DEPENDENCIAS = Object.freeze({
  I: ['LA', 'RA'],
  II: ['LL', 'RA'],
  III: ['LL', 'LA'],
  aVR: ['RA', 'LA', 'LL'],
  aVL: ['LA', 'RA', 'LL'],
  aVF: ['LL', 'RA', 'LA'],
  V1: ['V1', 'RA', 'LA', 'LL'],
  V2: ['V2', 'RA', 'LA', 'LL'],
  V3: ['V3', 'RA', 'LA', 'LL'],
  V4: ['V4', 'RA', 'LA', 'LL'],
  V5: ['V5', 'RA', 'LA', 'LL'],
  V6: ['V6', 'RA', 'LA', 'LL'],
});

/** Fórmulas en texto, para el panel de ecuaciones. */
export const FORMULAS = Object.freeze({
  I: 'I = Φ(LA) − Φ(RA)',
  II: 'II = Φ(LL) − Φ(RA)',
  III: 'III = Φ(LL) − Φ(LA)',
  aVR: 'aVR = Φ(RA) − [Φ(LA) + Φ(LL)] / 2',
  aVL: 'aVL = Φ(LA) − [Φ(RA) + Φ(LL)] / 2',
  aVF: 'aVF = Φ(LL) − [Φ(RA) + Φ(LA)] / 2',
  V1: 'V1 = Φ(V1) − TCW',
  V2: 'V2 = Φ(V2) − TCW',
  V3: 'V3 = Φ(V3) − TCW',
  V4: 'V4 = Φ(V4) − TCW',
  V5: 'V5 = Φ(V5) − TCW',
  V6: 'V6 = Φ(V6) − TCW',
});

/** Coeficientes de cada derivación sobre las entradas (combinación lineal). */
export const COEFICIENTES = Object.freeze({
  I: { LA: 1, RA: -1 },
  II: { LL: 1, RA: -1 },
  III: { LL: 1, LA: -1 },
  aVR: { RA: 1, LA: -0.5, LL: -0.5 },
  aVL: { LA: 1, RA: -0.5, LL: -0.5 },
  aVF: { LL: 1, RA: -0.5, LA: -0.5 },
  V1: { V1: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
  V2: { V2: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
  V3: { V3: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
  V4: { V4: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
  V5: { V5: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
  V6: { V6: 1, RA: -1 / 3, LA: -1 / 3, LL: -1 / 3 },
});

/**
 * Calcula las derivaciones para un bloque de muestras.
 * @param {Record<string, ArrayLike<number>>} phi  potencial (mV) por entrada
 * @param {number} n  número de muestras
 * @param {string[]} [nombres]  derivaciones a calcular
 * @returns {Record<string, Float64Array>}
 */
export function calcularDerivaciones(phi, n, nombres = DERIVACIONES) {
  const out = {};
  for (const d of nombres) {
    const c = COEFICIENTES[d];
    const r = new Float64Array(n);
    for (const entrada in c) {
      const k = c[entrada];
      const x = phi[entrada];
      for (let i = 0; i < n; i++) r[i] += k * x[i];
    }
    out[d] = r;
  }
  return out;
}

/** Versión para un solo instante (números en lugar de arreglos). */
export function derivacionesInstantaneas(phi) {
  const out = {};
  for (const d of DERIVACIONES) {
    let s = 0;
    const c = COEFICIENTES[d];
    for (const entrada in c) s += c[entrada] * phi[entrada];
    out[d] = s;
  }
  return out;
}

/**
 * Vector de derivación efectivo de cada derivación dado el vector (respecto al TCW) que ve cada entrada.
 * Útil para calcular derivaciones "limpias" directamente desde H(t).
 * @param {Record<string, number[]>} vectorPorEntrada
 */
export function vectoresDeDerivacion(vectorPorEntrada) {
  const out = {};
  for (const d of DERIVACIONES) {
    const v = [0, 0, 0];
    const c = COEFICIENTES[d];
    let ok = true;
    for (const entrada in c) {
      const L = vectorPorEntrada[entrada];
      if (!L) {
        ok = false;
        break;
      }
      v[0] += c[entrada] * L[0];
      v[1] += c[entrada] * L[1];
      v[2] += c[entrada] * L[2];
    }
    out[d] = ok ? v : null;
  }
  return out;
}
