/**
 * Números pseudoaleatorios reproducibles.
 *
 * El laboratorio necesita aleatoriedad repetible: el mismo código de estudiante debe producir
 * siempre el mismo sujeto virtual, y las pruebas automáticas deben dar siempre el mismo resultado.
 * Por eso no se usa Math.random(), sino un generador con semilla (mulberry32).
 */

/**
 * Convierte un texto (p. ej., el código de un estudiante) en una semilla entera de 32 bits.
 * Función hash FNV-1a: sencilla, rápida y suficiente para este propósito (no criptográfica).
 * @param {string} texto
 * @returns {number} entero sin signo de 32 bits
 */
export function semillaDesdeTexto(texto) {
  let h = 0x811c9dc5;
  const s = String(texto).trim().toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Crea un generador pseudoaleatorio con semilla.
 * @param {number} semilla entero
 */
export function crearGenerador(semilla) {
  let a = (semilla >>> 0) || 0x9e3779b9;
  let normalGuardada = null;

  /** Uniforme en [0, 1). Algoritmo mulberry32. */
  function uniforme() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Normal estándar (media 0, desviación 1) por el método de Box-Muller. */
  function normal() {
    if (normalGuardada !== null) {
      const v = normalGuardada;
      normalGuardada = null;
      return v;
    }
    let u = 0;
    while (u <= Number.EPSILON) u = uniforme();
    const v = uniforme();
    const r = Math.sqrt(-2 * Math.log(u));
    normalGuardada = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /** Uniforme en [min, max). */
  function entre(min, max) {
    return min + (max - min) * uniforme();
  }

  /** Elige un elemento de una lista. */
  function elegir(lista) {
    return lista[Math.floor(uniforme() * lista.length)];
  }

  /** Signo aleatorio: +1 o −1. */
  function signo() {
    return uniforme() < 0.5 ? -1 : 1;
  }

  return { uniforme, normal, entre, elegir, signo };
}
