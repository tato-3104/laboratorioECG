/**
 * Pulsos de soporte compacto para construir las ondas del vector cardíaco.
 *
 * pulso(t) = C · u^a · (1 − u)^b,   con u = (t − inicio) / duración ∈ [0, 1]   y 0 fuera de ese intervalo.
 *
 * C normaliza el pico a 1. Con a = b el pulso es simétrico; con a > b sube despacio y baja rápido
 * (forma de la onda T). Con a, b ≥ 2 la derivada es continua en los extremos, de modo que la onda
 * empieza y termina suavemente, como una onda real.
 *
 * Ventaja frente a las gaussianas: el inicio y el fin de cada onda quedan definidos exactamente,
 * y por eso PR, QRS y QT de referencia son exactos (documento 04, §3.1).
 */

/**
 * Constante de normalización para que el pico valga 1.
 * El máximo de u^a (1−u)^b está en u* = a / (a + b).
 */
export function constanteNormalizacion(a, b) {
  const u = a / (a + b);
  return 1 / (Math.pow(u, a) * Math.pow(1 - u, b));
}

/**
 * Crea un pulso con parámetros fijos (precalcula la constante).
 * @param {number} duracion  en segundos (> 0)
 * @param {number} a  exponente de subida
 * @param {number} b  exponente de bajada
 * @returns {(tRelativo: number) => number} función del tiempo medido desde el inicio del pulso
 */
export function crearPulso(duracion, a = 2, b = 2) {
  const c = constanteNormalizacion(a, b);
  return (tRel) => {
    const u = tRel / duracion;
    if (u <= 0 || u >= 1) return 0;
    return c * Math.pow(u, a) * Math.pow(1 - u, b);
  };
}

/**
 * Suma A·pulso(t − inicio) sobre un bloque de muestras, solo donde el pulso no es cero.
 * Es la operación central del generador: muy eficiente porque recorre solo las muestras del soporte.
 *
 * @param {Float64Array[]} destino  [hx, hy, hz], arreglos del bloque
 * @param {number} t0  tiempo (s) de la primera muestra del bloque
 * @param {number} fs  frecuencia de muestreo (Hz)
 * @param {number} inicio  tiempo absoluto (s) en que empieza el pulso
 * @param {number} duracion  (s)
 * @param {number} a
 * @param {number} b
 * @param {number[]} vector  amplitud [x, y, z] en mV
 */
export function sumarPulso(destino, t0, fs, inicio, duracion, a, b, vector) {
  const n = destino[0].length;
  const iIni = Math.max(0, Math.ceil((inicio - t0) * fs));
  const iFin = Math.min(n - 1, Math.floor((inicio + duracion - t0) * fs));
  if (iFin < iIni) return;
  const c = constanteNormalizacion(a, b);
  const [vx, vy, vz] = vector;
  const [hx, hy, hz] = destino;
  for (let i = iIni; i <= iFin; i++) {
    const u = (t0 + i / fs - inicio) / duracion;
    if (u <= 0 || u >= 1) continue;
    const p = c * Math.pow(u, a) * Math.pow(1 - u, b);
    hx[i] += vx * p;
    hy[i] += vy * p;
    hz[i] += vz * p;
  }
}
