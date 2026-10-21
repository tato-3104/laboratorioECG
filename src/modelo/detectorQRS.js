/**
 * Detector de complejos QRS en tiempo real para la frecuencia cardíaca automática del equipo.
 *
 * Versión simplificada del algoritmo de Pan y Tompkins (IEEE Trans Biomed Eng, 1985), aplicada a varias
 * derivaciones a la vez, como hacen los electrocardiógrafos de 12 derivaciones: en cada derivación,
 * filtro pasa banda 5–15 Hz → derivada; luego se suman los cuadrados de todas → integración en ventana de 150 ms →
 * umbral adaptativo con periodo refractario de 200 ms, discriminación de la onda T (< 360 ms) y una
 * «búsqueda hacia atrás» simplificada:
 * si pasa más de 1,66 R–R sin detectar nada (por ejemplo, porque al cambiar un cable el QRS se hizo
 * mucho más pequeño), el umbral se recalcula con el mayor pico reciente.
 * El equipo real usa un algoritmo propio; este cumple la misma función y se documenta como tal.
 */
import { pasoAlto2, pasoBajo2 } from './filtros.js';

export class DetectorQRS {
  /**
   * @param {number} fs
   * @param {number} [latidosPromedio]  R–R que se promedian para la FC mostrada
   */
  constructor(fs, latidosPromedio = 4) {
    this.fs = fs;
    this.latidosPromedio = latidosPromedio;
    this.reiniciar();
  }

  /** @param {number} [canales]  número de derivaciones que se combinan */
  reiniciar(canales = 1) {
    this.canales = canales;
    this.pa = Array.from({ length: canales }, () => pasoAlto2(5, this.fs));
    this.pb = Array.from({ length: canales }, () => pasoBajo2(15, this.fs));
    this.hist = Array.from({ length: canales }, () => [0, 0, 0, 0]);
    const v = Math.round(0.15 * this.fs);
    this.ventana = new Float64Array(v);
    this.iv = 0;
    this.suma = 0;
    this.n = 0; // muestras procesadas
    this.spk = 0;
    this.npk = 0;
    this.aprendizaje = Math.round(2 * this.fs);
    this.maxAprendizaje = 0;
    this.ultimoPico = -Infinity;
    this.valorUltimoPico = 0;
    this.ultimaAdaptacion = 0;
    this.maxReciente = 0; // mayor pico no aceptado desde la última detección
    this.prev2 = 0;
    this.prev1 = 0;
    this.detecciones = []; // instantes (s) de los QRS detectados
  }

  /** Tiempo (s) sin detecciones tras el cual se baja el umbral: 1,66 veces el R–R medio (Pan y Tompkins). */
  limiteBusqueda() {
    const d = this.detecciones;
    if (d.length < 3) return 2;
    const k = Math.min(4, d.length - 1);
    const rr = (d[d.length - 1] - d[d.length - 1 - k]) / k;
    return Math.min(3, Math.max(1.2, 1.66 * rr));
  }

  /**
   * Procesa un bloque de muestras de una sola derivación.
   * @param {ArrayLike<number>} x  señal de la derivación (mV); NaN = sin señal
   * @param {number} t0  instante (s) de la primera muestra
   * @returns {number[]} instantes de los QRS detectados en este bloque
   */
  procesar(x, t0) {
    return this.procesarCanales([x], t0);
  }

  /**
   * Procesa un bloque de muestras de varias derivaciones (mismo número de muestras en todas).
   * Si una derivación queda casi plana (por ejemplo, II con los cables RA y RL intercambiados), las demás
   * mantienen la detección.
   * @param {ArrayLike<number>[]} canales
   * @param {number} t0
   */
  procesarCanales(canales, t0) {
    if (canales.length !== this.canales) this.reiniciar(canales.length);
    const nuevos = [];
    const refractario = Math.round(0.2 * this.fs);
    const n = canales[0]?.length ?? 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let k = 0; k < canales.length; k++) {
        const v = canales[k][i];
        const xi = Number.isFinite(v) ? v : 0;
        const f = this.pb[k].procesar(this.pa[k].procesar(xi));
        const h = this.hist[k];
        const d = (2 * f + h[0] - h[2] - 2 * h[3]) / 8; // derivada de 5 puntos
        h.unshift(f);
        h.pop();
        c += d * d;
      }
      this.suma += c - this.ventana[this.iv];
      this.ventana[this.iv] = c;
      this.iv = (this.iv + 1) % this.ventana.length;
      const mwi = this.suma / this.ventana.length;
      this.n++;
      if (this.n <= this.aprendizaje) {
        this.maxAprendizaje = Math.max(this.maxAprendizaje, mwi);
        if (this.n === this.aprendizaje) {
          this.spk = this.maxAprendizaje * 0.5;
          this.npk = this.maxAprendizaje * 0.05;
          // El final del aprendizaje se trata como un latido: evita contar la cola del QRS anterior o su onda T.
          this.ultimoPico = this.n;
          this.valorUltimoPico = this.spk;
        }
      } else {
        // pico local en la señal integrada (máximo en la muestra anterior)
        if (this.prev1 > this.prev2 && this.prev1 >= mwi) {
          const pico = this.prev1;
          const umbral = this.npk + 0.25 * (this.spk - this.npk);
          const desdeUltimo = this.n - 1 - this.ultimoPico;
          // Discriminación de la onda T (Pan y Tompkins): un candidato a menos de 360 ms del QRS anterior
          // solo se acepta si su energía es al menos la mitad de la de ese QRS.
          const posibleT = desdeUltimo < Math.round(0.36 * this.fs) && pico < 0.5 * this.valorUltimoPico;
          if (pico > umbral && desdeUltimo > refractario && !posibleT) {
            this.spk = 0.125 * pico + 0.875 * this.spk;
            this.ultimoPico = this.n - 1;
            this.valorUltimoPico = pico;
            this.maxReciente = 0;
            const t = t0 + (i - 1) / this.fs;
            this.detecciones.push(t);
            nuevos.push(t);
          } else {
            this.npk = 0.125 * pico + 0.875 * this.npk;
            if (this.n - 1 - this.ultimoPico > refractario) this.maxReciente = Math.max(this.maxReciente, pico);
          }
        }
        // Búsqueda hacia atrás simplificada: demasiado tiempo sin QRS → umbral a partir del mayor pico reciente.
        const sinDetectar = (this.n - Math.max(this.ultimoPico, this.ultimaAdaptacion)) / this.fs;
        if (sinDetectar > this.limiteBusqueda() && this.maxReciente > 0) {
          this.spk = this.maxReciente;
          this.npk = 0.1 * this.maxReciente;
          this.maxReciente = 0;
          this.ultimaAdaptacion = this.n;
        }
      }
      this.prev2 = this.prev1;
      this.prev1 = mwi;
    }
    if (this.detecciones.length > 40) this.detecciones.splice(0, this.detecciones.length - 40);
    return nuevos;
  }

  /**
   * Frecuencia cardíaca (lpm) con los últimos R–R, o null si no hay latidos recientes.
   * Con 4 o más R–R se descartan el mayor y el menor antes de promediar (así un latido no detectado
   * o una detección espuria no alteran la cifra).
   * @param {number} tActual
   */
  frecuencia(tActual) {
    const d = this.detecciones;
    // Como los monitores reales, espera a tener al menos 3 R–R antes de mostrar un valor.
    if (d.length < 4 || tActual - d[d.length - 1] > 3) return null;
    const k = Math.min(this.latidosPromedio, d.length - 1);
    let rrs = [];
    for (let j = d.length - k; j < d.length; j++) rrs.push(d[j] - d[j - 1]);
    if (rrs.length >= 4) rrs = rrs.sort((a, b) => a - b).slice(1, -1);
    const rr = rrs.reduce((s, v) => s + v, 0) / rrs.length;
    if (rr <= 0.2 || rr > 2.5) return null;
    return 60 / rr;
  }
}
