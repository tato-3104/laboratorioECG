/**
 * Pantalla del electrocardiógrafo: trazos con barrido (como un monitor) sobre cuadrícula milimetrada.
 *
 * Escala: la pantalla representa «papel virtual» en milímetros. La velocidad (mm/s) y la ganancia (mm/mV)
 * fijan cuántos segundos y milivoltios caben, exactamente como en el papel. Cada píxel muestra el mínimo y
 * el máximo de las muestras que le corresponden, de modo que no se pierden los picos del QRS.
 */
import { GRUPO_EXTREMIDADES, GRUPO_PRECORDIALES } from '../modelo/derivaciones.js';

const MM_COLUMNA = 100; // ancho útil de cada columna en milímetros (4 s a 25 mm/s)
const MM_MARGEN = 8; // margen izquierdo de cada columna (pulso de calibración y nombre)
const MM_FILA = 17.5; // alto de cada fila
const MM_FILA_UNICA = 60; // una sola derivación: más alto, para ganancias de 20 mm/mV

/** Derivaciones por columna según el formato. */
export function columnasDelFormato(formato, derivacionUnica = 'II') {
  if (formato === '6x2') return [GRUPO_EXTREMIDADES, GRUPO_PRECORDIALES];
  if (formato === 'precordiales') return [GRUPO_PRECORDIALES];
  if (formato === 'una') return [[derivacionUnica]];
  return [GRUPO_EXTREMIDADES];
}

function leerColores() {
  const s = getComputedStyle(document.documentElement);
  const c = (n, d) => s.getPropertyValue(n).trim() || d;
  return {
    fondo: c('--pantalla', '#071113'),
    menor: c('--rejilla-menor', '#0f2729'),
    mayor: c('--rejilla-mayor', '#1b4143'),
    trazo: c('--trazo', '#63e6a0'),
    tenue: c('--pantalla-tenue', '#9fbdb5'),
    aviso: c('--pantalla-aviso', '#ffd58a'),
  };
}

/**
 * @param {{lienzo: HTMLCanvasElement, motor: import('../equipo/adquisicion.js').MotorAdquisicion}} op
 */
export function crearPantalla({ lienzo, motor }) {
  const ctx = lienzo.getContext('2d');
  const fondo = document.createElement('canvas');
  const fctx = fondo.getContext('2d');
  let ajustes = null;
  let validez = {};
  let disp = null; // disposición calculada
  let colores = leerColores();
  let anchoCSS = 0;
  let dpr = 1;

  function calcularDisposicion() {
    const cols = columnasDelFormato(ajustes.formato, ajustes.derivacionUnica);
    const nCols = cols.length;
    const filas = Math.max(...cols.map((c) => c.length));
    const mmFila = ajustes.formato === 'una' ? MM_FILA_UNICA : MM_FILA;
    const mmColumna = nCols === 1 ? 2 * MM_COLUMNA + MM_MARGEN : MM_COLUMNA;
    const mmTotal = nCols * (mmColumna + MM_MARGEN);
    const k = Math.min(6, Math.max(2.2, anchoCSS / mmTotal)); // px por mm
    const anchoCol = anchoCSS / nCols;
    const celdas = [];
    cols.forEach((lista, c) => {
      lista.forEach((d, f) => {
        const x0 = c * anchoCol + MM_MARGEN * k;
        const ancho = anchoCol - MM_MARGEN * k - 4;
        const fraccionBase = ajustes.formato === 'una' ? 0.55 : 0.6; // posición de la línea de base en la fila
        celdas.push({ d, x0, ancho, y0: 4 + f * mmFila * k, alto: mmFila * k, base: 4 + f * mmFila * k + mmFila * k * fraccionBase, xCol: c * anchoCol });
      });
    });
    const altoCSS = Math.round(8 + filas * mmFila * k);
    return { k, celdas, altoCSS, segundos: (Math.min(...celdas.map((c) => c.ancho)) / k) / ajustes.velocidad };
  }

  function prepararFondo() {
    colores = leerColores();
    const w = anchoCSS;
    const h = disp.altoCSS;
    fondo.width = Math.round(w * dpr);
    fondo.height = Math.round(h * dpr);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.fillStyle = colores.fondo;
    fctx.fillRect(0, 0, w, h);
    const k = disp.k;
    // Cuadrícula: 1 mm (menor) y 5 mm (mayor)
    fctx.lineWidth = 1 / dpr;
    for (const [paso, color] of [[k, colores.menor], [5 * k, colores.mayor]]) {
      fctx.strokeStyle = color;
      fctx.beginPath();
      for (let x = 0; x <= w; x += paso) {
        const xr = Math.round(x * dpr) / dpr + 0.5 / dpr;
        fctx.moveTo(xr, 0);
        fctx.lineTo(xr, h);
      }
      for (let y = 4; y <= h; y += paso) {
        const yr = Math.round(y * dpr) / dpr + 0.5 / dpr;
        fctx.moveTo(0, yr);
        fctx.lineTo(w, yr);
      }
      fctx.stroke();
    }
    // Pulso de calibración (1 mV, 200 ms) y nombre de cada derivación
    const altoPulso = ajustes.ganancia * k;
    const anchoPulso = 0.2 * ajustes.velocidad * k;
    fctx.strokeStyle = colores.trazo;
    fctx.lineWidth = 1.3;
    fctx.font = `600 ${Math.max(11, Math.min(14, 3 * k))}px "IBM Plex Mono", ui-monospace, monospace`;
    fctx.textBaseline = 'top';
    for (const c of disp.celdas) {
      const xp = c.xCol + 2 * k;
      fctx.beginPath();
      fctx.moveTo(c.xCol + 0.6 * k, c.base);
      fctx.lineTo(xp, c.base);
      fctx.lineTo(xp, c.base - altoPulso);
      fctx.lineTo(xp + anchoPulso, c.base - altoPulso);
      fctx.lineTo(xp + anchoPulso, c.base);
      fctx.lineTo(xp + anchoPulso + 0.6 * k, c.base);
      fctx.stroke();
      fctx.fillStyle = colores.tenue;
      fctx.fillText(c.d, c.x0 + 4, c.y0 + 3);
    }
  }

  function redimensionar() {
    const ancho = Math.floor(lienzo.parentElement.getBoundingClientRect().width);
    if (!ancho || !ajustes) return;
    anchoCSS = ancho;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    disp = calcularDisposicion();
    lienzo.style.height = `${disp.altoCSS}px`;
    lienzo.width = Math.round(anchoCSS * dpr);
    lienzo.height = Math.round(disp.altoCSS * dpr);
    prepararFondo();
    dibujar();
  }

  /**
   * Dibuja toda la pantalla a partir del búfer del motor.
   * Barrido: la muestra más reciente está en la "cabeza"; a su derecha queda una franja borrada y,
   * más allá, lo que se dibujó en la pasada anterior.
   */
  function dibujar() {
    if (!disp) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fondo, 0, 0);
    if (!ajustes.encendido) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs = motor.fs;
    const total = motor.total;
    const primera = motor.primeraDisponible();
    const k = disp.k;
    const pxPorMV = ajustes.ganancia * k;
    ctx.lineJoin = 'round';
    for (const c of disp.celdas) {
      const ancho = Math.floor(c.ancho);
      const muestrasVentana = (c.ancho / k / ajustes.velocidad) * fs;
      const spp = muestrasVentana / ancho; // muestras por píxel
      const cabeza = Math.floor((total % muestrasVentana) / spp);
      const borrado = Math.max(6, Math.round(3 * k));
      const valida = validez[c.d]?.valida;
      if (!valida) {
        ctx.save();
        ctx.strokeStyle = colores.aviso;
        ctx.globalAlpha = 0.75;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(c.x0, c.base);
        ctx.lineTo(c.x0 + ancho, c.base);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = colores.aviso;
        ctx.font = `500 ${Math.max(11, Math.min(13, 2.8 * k))}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.textBaseline = 'bottom';
        const faltan = validez[c.d]?.faltan ?? [];
        ctx.fillText(`sin señal · ${faltan.map((e) => ajustes.etiqueta(e)).join(', ')}`, c.x0 + Math.min(60, ancho * 0.25), c.base - 6);
        continue;
      }
      const buf = motor.buffer[c.d];
      const cap = motor.capacidad;
      ctx.strokeStyle = colores.trazo;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      let enTrazo = false;
      for (let x = 0; x < ancho; x++) {
        if (x > cabeza && x <= cabeza + borrado) {
          enTrazo = false;
          continue;
        }
        const desplazamiento = x <= cabeza ? cabeza - x : cabeza - x + ancho;
        const hasta = Math.floor(total - desplazamiento * spp);
        const desde = Math.floor(hasta - spp);
        if (desde < primera || hasta <= desde) {
          enTrazo = false;
          continue;
        }
        let min = Infinity, max = -Infinity, primeraV = NaN, ultimaV = NaN;
        for (let i = desde; i < hasta; i++) {
          const v = buf[i % cap];
          if (!Number.isFinite(v)) continue;
          if (Number.isNaN(primeraV)) primeraV = v;
          ultimaV = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min === Infinity) {
          enTrazo = false;
          continue;
        }
        const X = c.x0 + x + 0.5;
        const y = (v) => c.base - v * pxPorMV;
        if (!enTrazo) ctx.moveTo(X, y(primeraV));
        else ctx.lineTo(X, y(primeraV));
        ctx.lineTo(X, y(min));
        ctx.lineTo(X, y(max));
        ctx.lineTo(X, y(ultimaV));
        enTrazo = true;
      }
      ctx.stroke();
    }
  }

  const observador = new ResizeObserver(() => redimensionar());
  observador.observe(lienzo.parentElement);

  return {
    /** Nuevos ajustes del equipo o validez de las derivaciones. */
    configurar(nuevosAjustes, nuevaValidez) {
      const cambiaGeometria =
        !ajustes ||
        ajustes.formato !== nuevosAjustes.formato ||
        ajustes.derivacionUnica !== nuevosAjustes.derivacionUnica ||
        ajustes.velocidad !== nuevosAjustes.velocidad ||
        ajustes.ganancia !== nuevosAjustes.ganancia;
      ajustes = nuevosAjustes;
      validez = nuevaValidez;
      if (cambiaGeometria) redimensionar();
      else dibujar();
    },
    dibujar,
    redimensionar,
    /** Segundos que cabe en cada columna con los ajustes actuales. */
    segundosVisibles: () => disp?.segundos ?? 0,
    recolorear() {
      if (disp) {
        prepararFondo();
        dibujar();
      }
    },
  };
}
