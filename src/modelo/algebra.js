/**
 * Utilidades de álgebra lineal pequeñas (sin dependencias).
 */

/**
 * Resuelve A·X = B por eliminación gaussiana con pivoteo parcial.
 * @param {number[][]} A  matriz n×n (no se modifica)
 * @param {number[][]} B  matriz n×m (una o varias columnas de términos independientes)
 * @returns {number[][]} X  n×m
 */
export function resolverSistema(A, B) {
  const n = A.length;
  const m = B[0].length;
  const M = A.map((fila, i) => [...fila, ...B[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let f = col + 1; f < n; f++) if (Math.abs(M[f][col]) > Math.abs(M[piv][col])) piv = f;
    if (Math.abs(M[piv][col]) < 1e-14) throw new Error('Sistema singular');
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let f = 0; f < n; f++) {
      if (f === col) continue;
      const k = M[f][col] / M[col][col];
      if (k === 0) continue;
      for (let c = col; c < n + m; c++) M[f][c] -= k * M[col][c];
    }
  }
  return M.map((fila, i) => fila.slice(n).map((v) => v / M[i][i]));
}

/** Producto escalar de dos vectores. */
export function punto(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Norma euclídea. */
export function norma(a) {
  return Math.sqrt(punto(a, a));
}

/** Similitud coseno entre dos vectores. */
export function coseno(a, b) {
  return punto(a, b) / (norma(a) * norma(b));
}

/**
 * Mínimos cuadrados no lineales por Levenberg–Marquardt (jacobiano numérico).
 * @param {(p: number[]) => number[]} residuos
 * @param {number[]} p0  parámetros iniciales
 * @param {{maxIter?: number, limites?: (p:number[]) => number[]}} [op]
 * @returns {{p: number[], costo: number, iteraciones: number}}
 */
export function levenbergMarquardt(residuos, p0, op = {}) {
  const maxIter = op.maxIter ?? 200;
  const limitar = op.limites ?? ((p) => p);
  let p = limitar([...p0]);
  let r = residuos(p);
  let costo = punto(r, r);
  let lambda = 1e-3;
  let it = 0;
  for (; it < maxIter; it++) {
    // Jacobiano por diferencias centrales
    const J = r.map(() => new Array(p.length).fill(0));
    for (let j = 0; j < p.length; j++) {
      const h = 1e-5 * Math.max(1, Math.abs(p[j]));
      const pMas = [...p];
      const pMenos = [...p];
      pMas[j] += h;
      pMenos[j] -= h;
      const rMas = residuos(pMas);
      const rMenos = residuos(pMenos);
      for (let i = 0; i < r.length; i++) J[i][j] = (rMas[i] - rMenos[i]) / (2 * h);
    }
    const JtJ = p.map((_, a) => p.map((__, b) => J.reduce((s, fila) => s + fila[a] * fila[b], 0)));
    const Jtr = p.map((_, a) => J.reduce((s, fila, i) => s + fila[a] * r[i], 0));
    let mejoro = false;
    for (let intento = 0; intento < 20; intento++) {
      const A = JtJ.map((fila, a) => fila.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      let delta;
      try {
        delta = resolverSistema(A, Jtr.map((v) => [-v])).map((f) => f[0]);
      } catch {
        lambda *= 10;
        continue;
      }
      const pNuevo = limitar(p.map((v, k) => v + delta[k]));
      const rNuevo = residuos(pNuevo);
      const costoNuevo = punto(rNuevo, rNuevo);
      if (costoNuevo < costo) {
        const mejora = (costo - costoNuevo) / Math.max(costo, 1e-30);
        p = pNuevo;
        r = rNuevo;
        costo = costoNuevo;
        lambda = Math.max(lambda / 3, 1e-12);
        mejoro = true;
        if (mejora < 1e-12) return { p, costo, iteraciones: it + 1 };
        break;
      }
      lambda *= 2;
    }
    if (!mejoro) break;
  }
  return { p, costo, iteraciones: it };
}
