/**
 * Motor de adquisición del electrocardiógrafo virtual.
 *
 * En cada paso genera N muestras nuevas siguiendo la cadena del modelo (docs/04, §2):
 *   H(t) del sujeto → potencial de cada electrodo (L·H + ruido del electrodo)
 *   → potencial en cada ENTRADA (según el cable) + interferencia de red + ruido del amplificador
 *   → derivaciones (Einthoven, Goldberger, Wilson) → filtros fijos del equipo → recorte de rango → búfer.
 *
 * No depende del navegador: se prueba en Node (tests/unit/equipo.test.js).
 */
import { EQUIPO } from '../config/equipo.js';
import { RUIDO } from '../config/simulacion.js';
import { GeneradorCardiaco } from '../modelo/vectorCardiaco.js';
import { vectoresExtremidades } from '../modelo/vectoresDerivacion.js';
import { ENTRADAS, DERIVACIONES, COEFICIENTES } from '../modelo/derivaciones.js';
import { CadenaFiltros } from '../modelo/filtros.js';
import { RuidoElectrodo, InterferenciaRed } from '../modelo/ruido.js';
import { DetectorQRS } from '../modelo/detectorQRS.js';
import { crearGenerador, semillaDesdeTexto } from '../modelo/aleatorio.js';
import { resolverEntradas, vectorDeSitio } from '../conexiones/entradas.js';
import { validezDerivaciones } from '../conexiones/diagnostico.js';
import { latidoEnDerivaciones } from '../modelo/medidas.js';

/** Firma de lo que lee cada entrada (electrodo y sitio): si cambia, cambió la señal registrada. */
function firmaEntradas(entradas) {
  return ENTRADAS.map((e) => {
    const r = entradas[e];
    if (r.estado !== 'conectada') return `${e}:-`;
    const s = r.sitio;
    const pos = s.zona === 'torso' ? `${s.x.toFixed(2)},${s.y.toFixed(2)}` : s.zona;
    return `${e}:${r.electrodo}@${pos}`;
  }).join('|');
}

export class MotorAdquisicion {
  /**
   * @param {{sujeto: object, semilla: number, campo: object, equipo?: typeof EQUIPO, ruido?: typeof RUIDO}} op
   */
  constructor({ sujeto, semilla, campo, equipo = EQUIPO, ruido = RUIDO }) {
    this.equipo = equipo;
    this.ruido = ruido;
    this.fs = equipo.frecuenciaMuestreo;
    this.capacidad = Math.round(equipo.duracionBufferS * this.fs);
    this.buffer = {};
    for (const d of DERIVACIONES) this.buffer[d] = new Float32Array(this.capacidad).fill(NaN);
    this.total = 0; // muestras escritas desde el inicio
    this.t = 0; // tiempo de simulación (s) de la próxima muestra
    this.acumulado = 0;
    this.campo = campo;
    this.extremidades = vectoresExtremidades();
    this.ruidos = new Map();
    this.filtros = {};
    this.ultimaEntrada = {};
    this.validas = {};
    for (const d of DERIVACIONES) {
      this.ultimaEntrada[d] = 0;
      this.validas[d] = false;
    }
    this.detector = new DetectorQRS(this.fs, equipo.detector.latidosPromedio);
    this.derivacionesDetector = [];
    this.pulsoRestante = 0;
    this.config = null;
    this.firma = '';
    this.ultimoCambio = 0; // instante (s) del último cambio en lo que registran las entradas
    this.cambiarSujeto(sujeto, semilla);
  }

  /**
   * Cambia el sujeto (posible ampliación a varios sujetos). La semilla fija el ritmo, el ruido de los electrodos y la interferencia.
   * Limpia el registro.
   */
  cambiarSujeto(sujeto, semilla = this.semilla) {
    this.sujeto = sujeto;
    this.semilla = semilla >>> 0;
    this.rngAmp = crearGenerador(this.semilla ^ 0xa5a5a5a5);
    this.red = new InterferenciaRed(this.semilla ^ 0x1234567, ENTRADAS, this.fs, this.equipo.filtros.ranura || 60, this.ruido);
    this.ruidos.clear();
    this.generador = new GeneradorCardiaco(sujeto, (this.semilla ^ 0x2545f491) >>> 0, this.t + 0.35);
    if (this.config) this.configurar(this.config, { asentar: true });
    this.limpiarBuffer();
    this.ultimoCambio = this.t;
  }

  limpiarBuffer() {
    for (const d of DERIVACIONES) this.buffer[d].fill(NaN);
    this.inicioValido = this.total; // nada antes de esta muestra es legible
    this.detector.reiniciar();
  }

  /**
   * Aplica el estado actual del laboratorio: montaje y ajustes del equipo (encendido).
   * Los filtros son fijos (config/equipo.js).
   * @param {{montaje: object, ajustes: {encendido: boolean}}} c
   * @param {{asentar?: boolean}} [op]  asentar = sin transitorio de línea de base (al reanudar una sesión guardada)
   */
  configurar(c, op = {}) {
    const anterior = this.config;
    const encendido = c.ajustes.encendido;
    const entradas = resolverEntradas(c.montaje, { encendido });
    const validez = validezDerivaciones(entradas, { rlSuelto: this.equipo.perfilRL });

    // Fuentes de ruido por electrodo (se crean al colocarlo y se descartan al retirarlo).
    const presentes = new Set(Object.keys(c.montaje.electrodos));
    for (const id of [...this.ruidos.keys()]) if (!presentes.has(id)) this.ruidos.delete(id);
    for (const [id, e] of Object.entries(c.montaje.electrodos)) {
      if (!this.ruidos.has(id)) {
        const zona = e.sitio.zona === 'torso' ? 'torso' : 'extremidad';
        this.ruidos.set(id, new RuidoElectrodo(semillaDesdeTexto(`${this.semilla}-${id}`), zona, this.fs, this.ruido));
      }
    }

    // Qué ve cada entrada
    this.entradas = {};
    for (const e of ENTRADAS) {
      const r = entradas[e];
      const conectada = r.estado === 'conectada';
      const el = conectada ? c.montaje.electrodos[r.electrodo] : null;
      this.entradas[e] = {
        conectada,
        electrodo: conectada ? r.electrodo : null,
        vector: conectada ? vectorDeSitio(el.sitio, this.campo, this.extremidades) : null,
      };
    }
    this.hayRL = this.entradas.RL.conectada;
    const firma = firmaEntradas(entradas);
    if (firma !== this.firma) {
      this.firma = firma;
      this.ultimoCambio = this.t;
    }

    // Filtros fijos: uno por derivación. Al aparecer la señal parten de cero (transitorio real de línea de base).
    for (const d of DERIVACIONES) {
      const eraValida = this.validas[d];
      const valida = validez[d].valida;
      if (!this.filtros[d]) this.filtros[d] = new CadenaFiltros(this.equipo.filtros, this.fs);
      if (valida && !eraValida) {
        this.filtros[d].reiniciar();
        if (op.asentar) (this.pendienteAsentar ??= new Set()).add(d);
      }
      this.validas[d] = valida;
    }
    if (op.asentar) for (const d of DERIVACIONES) if (this.validas[d]) (this.pendienteAsentar ??= new Set()).add(d);

    // Derivaciones que combina el detector de QRS para la FC automática
    let det = this.equipo.detector.derivaciones.filter((d) => this.validas[d]);
    if (!det.length) det = DERIVACIONES.filter((d) => this.validas[d]).slice(0, 3);
    if (det.join() !== this.derivacionesDetector.join()) {
      this.derivacionesDetector = det;
      this.detector.reiniciar(det.length || 1);
    }

    if (anterior && !anterior.ajustes.encendido && encendido) {
      this.limpiarBuffer();
      this.ultimoCambio = this.t;
    }
    this.config = c;
  }

  /** Avanza el tiempo real dt (s): genera las muestras correspondientes. Devuelve cuántas generó. */
  avanzar(dt) {
    if (!this.config || !this.config.ajustes.encendido) return 0;
    this.acumulado += Math.max(0, dt) * this.fs;
    let n = Math.floor(this.acumulado);
    this.acumulado -= n;
    // Si la pestaña estuvo inactiva, no se intenta recuperar todo el tiempo perdido.
    n = Math.min(n, Math.round(0.25 * this.fs));
    if (n > 0) this.generar(n);
    return n;
  }

  /** Genera n muestras (también usado por las pruebas). */
  generar(n) {
    const fs = this.fs;
    const t0 = this.t;
    const H = this.generador.generarBloque(t0, n, fs);
    const resp = (t) => this.generador.respiracion(t);

    // Potencial de cada electrodo conectado a alguna entrada
    const potElectrodo = new Map();
    for (const e of ENTRADAS) {
      const ent = this.entradas[e];
      if (!ent.conectada || potElectrodo.has(ent.electrodo)) continue;
      const L = ent.vector;
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = L[0] * H[0][i] + L[1] * H[1][i] + L[2] * H[2][i];
      this.ruidos.get(ent.electrodo).sumar(x, t0, resp);
      potElectrodo.set(ent.electrodo, x);
    }

    // Potencial en cada entrada: electrodo + interferencia de red + ruido del amplificador
    const onda = new Float64Array(n);
    for (let i = 0; i < n; i++) onda[i] = this.red.onda(t0 + i / fs);
    const phi = {};
    const sigma = this.ruido.amplificadorMV;
    for (const e of ENTRADAS) {
      const ent = this.entradas[e];
      if (!ent.conectada) continue;
      const base = potElectrodo.get(ent.electrodo);
      const z = this.ruidos.get(ent.electrodo).impedanciaK();
      const amp = this.red.amplitudEntrada(e, z, this.hayRL);
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = base[i] + amp * onda[i] + sigma * this.rngAmp.normal();
      phi[e] = x;
    }

    // Derivaciones, filtros y búfer
    const cmrr = this.red.amplitudCMRR(this.hayRL);
    const rango = this.equipo.rangoEntradaMV;
    const pulsoN = this.pulsoRestante;
    const salidasDet = new Map(this.derivacionesDetector.map((d) => [d, new Float64Array(n)]));
    for (const d of DERIVACIONES) {
      const buf = this.buffer[d];
      if (!this.validas[d]) {
        for (let i = 0; i < n; i++) buf[(this.total + i) % this.capacidad] = NaN;
        continue;
      }
      const coef = COEFICIENTES[d];
      const f = this.filtros[d];
      const x = new Float64Array(n);
      for (const e in coef) {
        const k = coef[e];
        const p = phi[e];
        for (let i = 0; i < n; i++) x[i] += k * p[i];
      }
      if (this.pendienteAsentar?.has(d)) {
        // Se asienta con el valor medio del bloque: así la interferencia instantánea no deja un desplazamiento.
        let media = 0;
        for (let i = 0; i < n; i++) media += x[i];
        f.estacionario(media / n);
        this.pendienteAsentar.delete(d);
      }
      for (let i = 0; i < n; i++) {
        let v = x[i] + cmrr * onda[i];
        if (i < pulsoN) v += 1; // pulso de calibración de 1 mV (antes de los filtros, como en el equipo)
        this.ultimaEntrada[d] = v;
        let y = f.procesar(v);
        if (y > rango) y = rango;
        else if (y < -rango) y = -rango;
        buf[(this.total + i) % this.capacidad] = y;
        const sd = salidasDet.get(d);
        if (sd) sd[i] = y;
      }
    }
    if (salidasDet.size) this.detector.procesarCanales([...salidasDet.values()], t0);
    this.pulsoRestante = Math.max(0, pulsoN - n);
    this.total += n;
    this.t = t0 + n / fs;
    this.generador.olvidarAntesDe(this.t - 60);
    return n;
  }

  /** Inserta un pulso de calibración de 1 mV y 200 ms en todas las derivaciones. */
  pulso1mV() {
    this.pulsoRestante = Math.round(0.2 * this.fs);
  }

  /** Restablece la línea de base (lleva los filtros al estado estacionario: elimina la deriva al instante). */
  restablecerLineaBase() {
    for (const d of DERIVACIONES) if (this.validas[d]) this.filtros[d].estacionario(this.ultimaEntrada[d]);
  }

  /** Frecuencia cardíaca automática (lpm) o null. */
  frecuencia() {
    return this.derivacionesDetector.length ? this.detector.frecuencia(this.t) : null;
  }

  /** Segundos transcurridos desde el último cambio de conexión (o desde el encendido). */
  segundosSinCambios() {
    return this.t - this.ultimoCambio;
  }

  /** Índice absoluto de la muestra más antigua todavía disponible. */
  primeraDisponible() {
    return Math.max(this.inicioValido ?? 0, this.total - this.capacidad);
  }

  /** Copia de una derivación entre dos índices absolutos [desde, hasta). */
  leer(d, desde, hasta) {
    const ini = Math.max(desde, this.primeraDisponible());
    const n = Math.max(0, hasta - ini);
    const out = new Float32Array(Math.max(0, hasta - desde)).fill(NaN);
    const buf = this.buffer[d];
    for (let i = 0; i < n; i++) out[ini - desde + i] = buf[(ini + i) % this.capacidad];
    return out;
  }

  /** Instantánea de las últimas `duracion` s (o menos, si no hay tantas) para congelar, imprimir o medir. */
  instantanea(duracion) {
    const n = Math.min(Math.round(duracion * this.fs), this.total - this.primeraDisponible());
    const hasta = this.total;
    const desde = hasta - n;
    const derivaciones = {};
    for (const d of DERIVACIONES) derivaciones[d] = this.leer(d, desde, hasta);
    return {
      fs: this.fs,
      n,
      tInicio: desde / this.fs,
      derivaciones,
      latidos: this.generador.latidos
        .filter((l) => l.inicio >= desde / this.fs - 1 && l.inicio <= hasta / this.fs)
        .map((l) => ({ ...l })),
      detecciones: this.detector.detecciones.filter((t) => t >= desde / this.fs),
    };
  }

  /** Vector que ve cada entrada (null si está flotante). */
  vectoresPorEntrada() {
    const out = {};
    for (const e of ENTRADAS) out[e] = this.entradas?.[e]?.vector ?? null;
    return out;
  }

  /** Un latido sin ruido con la conexión actual (valores de referencia). */
  latidoLimpio() {
    const rr = 60 / this.sujeto.fc;
    return latidoEnDerivaciones(this.sujeto, this.vectoresPorEntrada(), rr, this.fs);
  }
}
