/**
 * Componentes no cardíacas de la señal (docs/04, §7): deriva de la línea de base, potencial de media
 * celda, interferencia de la red eléctrica y ruido del amplificador.
 *
 * Son aproximaciones ILUSTRATIVAS: reproducen las tendencias reales (sin el electrodo RL la interferencia
 * aumenta; el filtro de ranura la reduce, pero no la elimina del todo), no sus valores exactos.
 * En la versión 2 el sujeto está relajado y la piel preparada: no hay actividad muscular simulada.
 */
import { crearGenerador } from './aleatorio.js';
import { RUIDO } from '../config/simulacion.js';

/**
 * Fuente de ruido de un ELECTRODO (lo que ocurre en la interfaz electrodo–piel).
 */
export class RuidoElectrodo {
  /**
   * @param {number} semilla
   * @param {'torso'|'extremidad'} tipoZona
   * @param {number} fs
   * @param {typeof RUIDO} [cfg]
   */
  constructor(semilla, tipoZona, fs, cfg = RUIDO) {
    const rng = crearGenerador(semilla);
    this.rng = rng;
    this.fs = fs;
    this.cfg = cfg;
    this.tipoZona = tipoZona;
    this.offset = rng.signo() * rng.entre(...cfg.offsetElectrodoMV);
    this.amplitudRespiratoria = cfg.derivaRespiratoriaMV[tipoZona] * rng.entre(0.6, 1.4);
    this.deriva = 0;
    const [media, desviacion] = cfg.impedanciaKOhm;
    this.impedanciaKOhm = Math.max(2, media + desviacion * rng.normal());
  }

  /** Impedancia electrodo–piel (kΩ), piel preparada. */
  impedanciaK() {
    return this.impedanciaKOhm;
  }

  /**
   * Suma al arreglo `x` el ruido del electrodo para n muestras desde t0.
   * @param {Float64Array} x
   * @param {number} t0
   * @param {(t:number)=>number} respiracion  señal respiratoria del sujeto (−1…1)
   */
  sumar(x, t0, respiracion) {
    const n = x.length;
    const fs = this.fs;
    const alfa = 1 / (this.cfg.derivaLentaTauS * fs);
    const sdDeriva = this.cfg.derivaLentaMV * Math.sqrt(2 * alfa);
    for (let i = 0; i < n; i++) {
      const t = t0 + i / fs;
      // deriva lenta (proceso de Ornstein–Uhlenbeck)
      this.deriva += -alfa * this.deriva + sdDeriva * this.rng.normal();
      x[i] += this.offset + this.deriva + this.amplitudRespiratoria * respiracion(t);
    }
  }
}

/**
 * Interferencia de red en cada ENTRADA (cable): corriente de desplazamiento en el cable × impedancia del
 * electrodo, más la tensión de modo común convertida en diferencial por el desbalance de impedancias.
 */
export class InterferenciaRed {
  /**
   * @param {number} semilla
   * @param {string[]} entradas
   * @param {number} fs
   * @param {number} frecuencia  Hz (nominal)
   * @param {typeof RUIDO} [cfg]
   */
  constructor(semilla, entradas, fs, frecuencia, cfg = RUIDO) {
    const rng = crearGenerador(semilla);
    this.fs = fs;
    this.f = frecuencia;
    this.cfg = cfg;
    this.factorCable = {};
    for (const e of entradas) this.factorCable[e] = 1 + cfg.red.variacionCable * (2 * rng.uniforme() - 1);
    this.fase = rng.entre(0, 2 * Math.PI);
    this.faseDesviacion = rng.entre(0, 2 * Math.PI);
  }

  /**
   * Amplitud de la interferencia (mV, en el fundamental) que aparece en una entrada.
   * @param {string} entrada
   * @param {number} impedanciaK  impedancia del electrodo al que va el cable (kΩ)
   * @param {boolean} hayRL
   */
  amplitudEntrada(entrada, impedanciaK, hayRL) {
    const r = this.cfg.red;
    const zOhm = impedanciaK * 1e3;
    const desplazamiento = r.corrienteCableNA * 1e-9 * this.factorCable[entrada] * zOhm * 1e3; // mV
    const vcm = hayRL ? r.tensionModoComunConRLmV : r.tensionModoComunSinRLmV;
    const modoComun = (vcm * zOhm) / (r.impedanciaModoComunMOhm * 1e6);
    return desplazamiento + modoComun;
  }

  /** Término de modo común que se cuela por el CMRR finito en cada derivación (mV). */
  amplitudCMRR(hayRL) {
    const r = this.cfg.red;
    const vcm = hayRL ? r.tensionModoComunConRLmV : r.tensionModoComunSinRLmV;
    return vcm / Math.pow(10, r.cmrrDb / 20);
  }

  /**
   * Forma de onda normalizada de la red (fundamental + armónicos) en el instante t.
   * La frecuencia instantánea es f + m + v·sen(2πt/T + ψ); la fase es su integral (forma cerrada).
   */
  onda(t) {
    const { media, variacion, periodoS } = this.cfg.red.desviacionHz;
    const w =
      2 * Math.PI * (this.f + media) * t -
      variacion * periodoS * Math.cos((2 * Math.PI * t) / periodoS + this.faseDesviacion) +
      this.fase;
    const r = this.cfg.red;
    return Math.sin(w) + r.tercerArmonico * Math.sin(3 * w + 0.7) + r.quintoArmonico * Math.sin(5 * w + 1.3);
  }
}
