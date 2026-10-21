/**
 * Vector cardíaco H(t): la fuente eléctrica del corazón como un dipolo equivalente.
 *
 * - construirSujeto(): aplica a un sujeto base las variaciones individuales (rotación del eje,
 *   escala de amplitudes, FC, PR, QTc...).
 * - sujetoDeVoluntario(): el sujeto virtual del laboratorio (config/voluntarios.js).
 * - GeneradorCardiaco: produce el ritmo (latidos con variabilidad R–R) y H(t) por bloques de muestras.
 *
 * Coordenadas de Frank: X+ izquierda, Y+ pies, Z+ espalda (mV).
 */
import { crearGenerador } from './aleatorio.js';
import { sumarPulso } from './pulsos.js';
import { SUJETO_REFERENCIA } from '../config/sujetos.js';
import { buscarVoluntario } from '../config/voluntarios.js';

const RAD = Math.PI / 180;

/**
 * Rota un vector en el plano frontal (alrededor del eje anteroposterior Z).
 * Ángulos positivos giran de X (0°, izquierda) hacia Y (+90°, abajo): aumentan el eje eléctrico.
 * @param {number[]} v [x, y, z]
 * @param {number} grados
 */
export function rotarFrontal(v, grados) {
  const c = Math.cos(grados * RAD);
  const s = Math.sin(grados * RAD);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

const escalar = (v, k) => [v[0] * k, v[1] * k, v[2] * k];

/**
 * Construye un sujeto a partir de uno base, aplicando variaciones individuales.
 * @param {object} base  p. ej. SUJETO_REFERENCIA
 * @param {object} [v]   { rotacionQRS, rotacionT, rotacionP, escalaQRS, escalaT, escalaP, fc, pr, qtc, sexo, edad, ... }
 */
export function construirSujeto(base = SUJETO_REFERENCIA, v = {}) {
  const rotQRS = v.rotacionQRS ?? 0;
  const rotT = v.rotacionT ?? 0;
  const rotP = v.rotacionP ?? 0;
  const kQRS = v.escalaQRS ?? 1;
  const kT = v.escalaT ?? 1;
  const kP = v.escalaP ?? 1;
  return {
    ...base,
    sexo: v.sexo ?? base.sexo,
    edad: v.edad ?? base.edad,
    fc: v.fc ?? base.fc,
    pr: v.pr ?? base.pr,
    qtc: v.qtc ?? base.qtc,
    variabilidadRR: v.variabilidadRR ?? base.variabilidadRR,
    frecuenciaRespiratoria: v.frecuenciaRespiratoria ?? base.frecuenciaRespiratoria,
    ondaP: base.ondaP.map((c) => ({ ...c, vector: escalar(rotarFrontal(c.vector, rotP), kP) })),
    complejoQRS: base.complejoQRS.map((c) => ({ ...c, vector: escalar(rotarFrontal(c.vector, rotQRS), kQRS) })),
    ondaT: { ...base.ondaT, vector: escalar(rotarFrontal(base.ondaT.vector, rotT), kT) },
    variacion: { rotacionQRS: rotQRS, rotacionT: rotT, rotacionP: rotP, escalaQRS: kQRS, escalaT: kT, escalaP: kP },
  };
}

/**
 * Sujeto de un voluntario del laboratorio (config/voluntarios.js).
 * @param {number|object} voluntario  número del sujeto (hoy solo existe el 1) o su objeto
 */
export function sujetoDeVoluntario(voluntario, base = SUJETO_REFERENCIA) {
  const v = typeof voluntario === 'object' ? voluntario : buscarVoluntario(voluntario);
  return { ...construirSujeto(base, v), voluntario: v.id };
}

/** Duración del QT para un R–R dado, con la fórmula de Bazett usada en el laboratorio: QT = QTc·√RR. */
export function qtDeBazett(qtc, rr) {
  return qtc * Math.sqrt(rr);
}

/**
 * Genera el ritmo y el vector cardíaco de un sujeto, por bloques de muestras y sin límite de tiempo.
 */
export class GeneradorCardiaco {
  /**
   * @param {object} sujeto  resultado de construirSujeto() o sujetoDeVoluntario()
   * @param {number} semilla  para la variabilidad del ritmo
   * @param {number} [primerInicio]  instante (s) del inicio del primer QRS
   */
  constructor(sujeto, semilla = 1, primerInicio = 0.35) {
    this.sujeto = sujeto;
    this.rng = crearGenerador(semilla);
    this.rr0 = 60 / sujeto.fc;
    this.faseMayer = this.rng.entre(0, 2 * Math.PI);
    this.faseRespiratoria = this.rng.entre(0, 2 * Math.PI);
    this.rrSuavizado = this.rr0; // el QT se adapta lentamente a la FC (media móvil)
    /** @type {{indice:number, inicio:number, rr:number, qt:number, pr:number}[]} */
    this.latidos = [];
    this.siguienteInicio = primerInicio;
    this.siguienteIndice = 0;
  }

  /** Señal respiratoria normalizada (−1…1) en el instante t; la usan también las fuentes de ruido. */
  respiracion(t) {
    return Math.sin(2 * Math.PI * this.sujeto.frecuenciaRespiratoria * t + this.faseRespiratoria);
  }

  _agregarLatido() {
    const s = this.sujeto;
    const t = this.siguienteInicio;
    const sd = s.variabilidadRR;
    let rr =
      this.rr0 +
      0.6 * sd * Math.sin(2 * Math.PI * s.frecuenciaRespiratoria * t + this.faseRespiratoria) + // arritmia sinusal respiratoria
      0.5 * sd * Math.sin(2 * Math.PI * 0.1 * t + this.faseMayer) + // ondas de Mayer (~0,1 Hz)
      0.3 * sd * this.rng.normal();
    rr = Math.max(rr, 0.35);
    this.rrSuavizado += 0.05 * (rr - this.rrSuavizado);
    const latido = {
      indice: this.siguienteIndice++,
      inicio: t, // inicio del QRS (s)
      rr, // tiempo hasta el inicio del siguiente QRS (s)
      qt: qtDeBazett(s.qtc, this.rrSuavizado),
      pr: s.pr,
    };
    this.latidos.push(latido);
    this.siguienteInicio = t + rr;
    return latido;
  }

  /** Garantiza que existan latidos generados hasta el instante t (más un margen). */
  asegurarHasta(t) {
    while (this.siguienteInicio - this.sujeto.pr < t + 1.0) this._agregarLatido();
  }

  /** Descarta latidos anteriores a t (para no acumular memoria en sesiones largas). */
  olvidarAntesDe(t) {
    let k = 0;
    while (k < this.latidos.length && this.latidos[k].inicio + this.latidos[k].qt < t) k++;
    if (k > 0) this.latidos.splice(0, k);
  }

  /** Latidos cuyo intervalo [inicio de P, fin de T] se superpone con [t0, t1]. */
  latidosEn(t0, t1) {
    this.asegurarHasta(t1);
    return this.latidos.filter((l) => l.inicio - l.pr < t1 && l.inicio + l.qt > t0);
  }

  /**
   * Genera H(t) para n muestras desde t0.
   * @returns {[Float64Array, Float64Array, Float64Array]} [hx, hy, hz] en mV
   */
  generarBloque(t0, n, fs) {
    const hx = new Float64Array(n);
    const hy = new Float64Array(n);
    const hz = new Float64Array(n);
    const destino = [hx, hy, hz];
    const t1 = t0 + n / fs;
    const s = this.sujeto;
    for (const l of this.latidosEn(t0, t1)) {
      const inicioP = l.inicio - l.pr;
      for (const c of s.ondaP) sumarPulso(destino, t0, fs, inicioP + c.inicio, c.duracion, c.a, c.b, c.vector);
      for (const c of s.complejoQRS) sumarPulso(destino, t0, fs, l.inicio + c.inicio, c.duracion, c.a, c.b, c.vector);
      const durT = s.fraccionT * l.qt;
      sumarPulso(destino, t0, fs, l.inicio + l.qt - durT, durT, s.ondaT.a, s.ondaT.b, s.ondaT.vector);
    }
    // Modulación respiratoria: pequeña rotación frontal y cambio de amplitud.
    const mod = s.modulacionRespiratoria;
    if (mod && (mod.rotacionGrados || mod.amplitudRelativa)) {
      for (let i = 0; i < n; i++) {
        const r = this.respiracion(t0 + i / fs);
        const ang = mod.rotacionGrados * RAD * r;
        const k = 1 + mod.amplitudRelativa * r;
        const c = Math.cos(ang) * k;
        const sn = Math.sin(ang) * k;
        const x = hx[i];
        const y = hy[i];
        hx[i] = x * c - y * sn;
        hy[i] = x * sn + y * c;
        hz[i] *= k;
      }
    }
    return destino;
  }
}

/**
 * Vector cardíaco de UN latido aislado (sin modulación ni variabilidad), útil para referencias y la vista vectorial.
 * @param {object} sujeto
 * @param {number} rr  R–R (s) para calcular el QT
 * @param {number} fs
 * @returns {{t: Float64Array, h: Float64Array[], qt: number}}  t relativo al inicio del QRS
 */
export function latidoAislado(sujeto, rr, fs) {
  const qt = qtDeBazett(sujeto.qtc, rr);
  const t0 = -sujeto.pr - 0.04;
  const n = Math.ceil((qt + sujeto.pr + 0.12) * fs);
  const h = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const inicioP = -sujeto.pr;
  for (const c of sujeto.ondaP) sumarPulso(h, t0, fs, inicioP + c.inicio, c.duracion, c.a, c.b, c.vector);
  for (const c of sujeto.complejoQRS) sumarPulso(h, t0, fs, c.inicio, c.duracion, c.a, c.b, c.vector);
  const durT = sujeto.fraccionT * qt;
  sumarPulso(h, t0, fs, qt - durT, durT, sujeto.ondaT.a, sujeto.ondaT.b, sujeto.ondaT.vector);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = t0 + i / fs;
  return { t, h, qt };
}

/** Duraciones exactas por construcción (s): útiles para pruebas y valores de referencia. */
export function duracionesPorConstruccion(sujeto, rr) {
  const finP = Math.max(...sujeto.ondaP.map((c) => c.inicio + c.duracion));
  const inicioQRS = Math.min(...sujeto.complejoQRS.map((c) => c.inicio));
  const finQRS = Math.max(...sujeto.complejoQRS.map((c) => c.inicio + c.duracion));
  return { p: finP, pr: sujeto.pr, qrs: finQRS - inicioQRS, qt: qtDeBazett(sujeto.qtc, rr) };
}
