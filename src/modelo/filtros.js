/**
 * Filtros digitales IIR (biquads) del electrocardiógrafo simulado.
 *
 * Como en un equipo real, son CAUSALES (procesan muestra a muestra en tiempo real).
 * Diseño por transformación bilineal (fórmulas de R. Bristow-Johnson, "Audio EQ Cookbook").
 */

/** Sección de segundo orden en forma directa II transpuesta. */
export class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
    this.s1 = 0;
    this.s2 = 0;
  }

  procesar(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = this.b1 * x - this.a1 * y + this.s2;
    this.s2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reiniciar() {
    this.s1 = 0;
    this.s2 = 0;
  }

  /** Ganancia en continua H(1). */
  gananciaDC() {
    return (this.b0 + this.b1 + this.b2) / (1 + this.a1 + this.a2);
  }

  /** Estado estacionario para una entrada constante x0 (salida = H(1)·x0, sin transitorio). Devuelve la salida. */
  estacionario(x0) {
    const y0 = this.gananciaDC() * x0;
    this.s2 = this.b2 * x0 - this.a2 * y0;
    this.s1 = this.b1 * x0 - this.a1 * y0 + this.s2;
    return y0;
  }

  /** Módulo de la respuesta en frecuencia |H(e^{jω})| a la frecuencia f. */
  respuesta(f, fs) {
    const w = (2 * Math.PI * f) / fs;
    const re = (c0, c1, c2) => c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w);
    const im = (c1, c2) => -(c1 * Math.sin(w) + c2 * Math.sin(2 * w));
    const nr = re(this.b0, this.b1, this.b2);
    const ni = im(this.b1, this.b2);
    const dr = re(1, this.a1, this.a2);
    const di = im(this.a1, this.a2);
    return Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
}

/** Paso alto de 1.er orden (el clásico filtro de "constante de tiempo" de los electrocardiógrafos). */
export function pasoAlto1(fc, fs) {
  const k = Math.tan((Math.PI * fc) / fs);
  const b0 = 1 / (1 + k);
  return new Biquad(b0, -b0, 0, (k - 1) / (k + 1), 0);
}

function coeficientes(fc, fs, q) {
  const w0 = (2 * Math.PI * fc) / fs;
  return { c: Math.cos(w0), alfa: Math.sin(w0) / (2 * q) };
}

/** Paso bajo Butterworth de 2.º orden. */
export function pasoBajo2(fc, fs, q = Math.SQRT1_2) {
  const { c, alfa } = coeficientes(fc, fs, q);
  const a0 = 1 + alfa;
  return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - alfa) / a0);
}

/** Paso alto Butterworth de 2.º orden. */
export function pasoAlto2(fc, fs, q = Math.SQRT1_2) {
  const { c, alfa } = coeficientes(fc, fs, q);
  const a0 = 1 + alfa;
  return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alfa) / a0);
}

/** Filtro de ranura (notch) centrado en f0. */
export function ranura(f0, fs, q = 30) {
  const { c, alfa } = coeficientes(f0, fs, q);
  const a0 = 1 + alfa;
  return new Biquad(1 / a0, (-2 * c) / a0, 1 / a0, (-2 * c) / a0, (1 - alfa) / a0);
}

/**
 * Cadena de filtros de una derivación (filtros fijos del equipo, config/equipo.js):
 * paso alto (deriva) → ranura de red → paso bajo.
 */
export class CadenaFiltros {
  /**
   * @param {{pasoAlto:number, pasoBajo:number, ranura?:number, ranuraQ?:number}} f  Hz (ranura = 0 la omite)
   * @param {number} fs
   */
  constructor(f, fs) {
    this.etapas = [pasoAlto1(f.pasoAlto, fs)];
    if (f.ranura) this.etapas.push(ranura(f.ranura, fs, f.ranuraQ ?? 30));
    this.etapas.push(pasoBajo2(Math.min(f.pasoBajo, 0.45 * fs), fs));
  }

  procesar(x) {
    let y = x;
    for (const e of this.etapas) y = e.procesar(y);
    return y;
  }

  reiniciar() {
    for (const e of this.etapas) e.reiniciar();
  }

  /** Lleva todas las etapas al estado estacionario para una entrada constante (restablecer la línea de base). */
  estacionario(x0) {
    let x = x0;
    for (const e of this.etapas) x = e.estacionario(x);
  }

  respuesta(f, fs) {
    return this.etapas.reduce((g, e) => g * e.respuesta(f, fs), 1);
  }
}
