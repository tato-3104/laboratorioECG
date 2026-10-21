/**
 * Vectores de derivación: cómo "ve" cada sitio del cuerpo al vector cardíaco.
 *
 * El potencial de un sitio s (respecto al terminal central de Wilson, TCW) es  φ_s(t) = L_s · H(t).
 *
 * Para las posiciones normalizadas se usa la matriz de Dower (Dower, Machado y Osborne, 1980), que
 * relaciona las derivaciones de Frank (X, Y, Z) con el ECG de 12 derivaciones. Su pseudoinversa coincide
 * (diferencia < 0,001) con la «matriz inversa de Dower» publicada por Edenbrandt y Pahlm (1988).
 */

/** Matriz de Dower: filas = derivaciones independientes; columnas = coeficientes de X, Y, Z. */
export const MATRIZ_DOWER = Object.freeze({
  V1: [-0.515, 0.157, -0.917],
  V2: [0.044, 0.164, -1.387],
  V3: [0.882, 0.098, -1.277],
  V4: [1.213, 0.127, -0.601],
  V5: [1.125, 0.127, -0.086],
  V6: [0.831, 0.076, 0.23],
  I: [0.632, -0.235, 0.059],
  II: [0.235, 1.066, -0.132],
});

export const PRECORDIALES = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Vectores de los electrodos de extremidades respecto al TCW, deducidos de I y II:
 *   φ_RA − TCW = −(I + II)/3,  φ_LA − TCW = (2I − II)/3,  φ_LL − TCW = (2II − I)/3.
 *
 * Principio del miembro como conductor: cualquier punto de un miembro tiene el potencial de su unión con
 * el tronco; por eso no importa si la pinza está en la muñeca o en el antebrazo.
 *
 * Supuesto: la pierna derecha tiene (casi) el mismo potencial que la izquierda (factorRL = 1).
 * @param {number} [factorRL]
 */
export function vectoresExtremidades(factorRL = 1) {
  const I = MATRIZ_DOWER.I;
  const II = MATRIZ_DOWER.II;
  const ra = I.map((v, k) => -(v + II[k]) / 3);
  const la = I.map((v, k) => (2 * v - II[k]) / 3);
  const ll = I.map((v, k) => (2 * II[k] - v) / 3);
  return {
    brazo_der: ra,
    brazo_izq: la,
    pierna_izq: ll,
    pierna_der: ll.map((v) => v * factorRL),
  };
}

/** Vectores de las precordiales en su posición normalizada (respecto al TCW). */
export function vectoresPrecordialesEstandar() {
  const r = {};
  for (const v of PRECORDIALES) r[v] = [...MATRIZ_DOWER[v]];
  return r;
}
