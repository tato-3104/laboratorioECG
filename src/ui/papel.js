/**
 * Papel milimetrado en SVG (todas las medidas en milímetros).
 * Lo usan el registro impreso, la herramienta de cursores y la comparación de registros.
 *
 * Se usan colores literales (no variables CSS) para que el papel se vea igual en el tema claro y en el
 * oscuro, y para que la imagen exportada (PNG) sea idéntica a la que se ve en pantalla.
 */
import { svgEl } from './dom.js';

/** Colores del papel térmico (editables). */
export const COLORES_PAPEL = Object.freeze({
  fondo: '#fff9f7',
  menor: '#f3cdc8',
  mayor: '#e49a92',
  trazo: '#1b2320',
  tinta: '#5c2a24',
  tenue: '#8a5a52',
  comparacion: '#b4520a',
});

export const LETRA_PAPEL = "'IBM Plex Mono', Consolas, 'Liberation Mono', monospace";

const f2 = (v) => (Math.round(v * 100) / 100).toString();

/**
 * Cuadrícula de 1 mm (líneas finas) y 5 mm (líneas gruesas) sobre un rectángulo.
 * @param {number} x0  mm
 * @param {number} y0  mm
 * @param {number} ancho  mm
 * @param {number} alto  mm
 */
export function cuadricula(x0, y0, ancho, alto) {
  const g = svgEl('g', { class: 'papel-cuadricula' });
  g.append(svgEl('rect', { x: f2(x0), y: f2(y0), width: f2(ancho), height: f2(alto), fill: COLORES_PAPEL.fondo }));
  let menor = '';
  let mayor = '';
  const nx = Math.floor(ancho + 1e-6);
  const ny = Math.floor(alto + 1e-6);
  for (let i = 0; i <= nx; i++) {
    const s = `M${f2(x0 + i)} ${f2(y0)}V${f2(y0 + alto)}`;
    if (i % 5 === 0) mayor += s;
    else menor += s;
  }
  for (let j = 0; j <= ny; j++) {
    const s = `M${f2(x0)} ${f2(y0 + j)}H${f2(x0 + ancho)}`;
    if (j % 5 === 0) mayor += s;
    else menor += s;
  }
  g.append(
    svgEl('path', { d: menor, stroke: COLORES_PAPEL.menor, 'stroke-width': 0.1, fill: 'none' }),
    svgEl('path', { d: mayor, stroke: COLORES_PAPEL.mayor, 'stroke-width': 0.22, fill: 'none' }),
  );
  return g;
}

/**
 * Trazo de una señal como atributo «d» de un path SVG.
 * Para no perder los picos, cuando a una columna de `paso` mm le corresponden varias muestras se dibujan
 * su mínimo y su máximo en el orden en que ocurren.
 * @param {ArrayLike<number>} x  señal en mV (NaN = sin señal)
 * @param {number} i0  primera muestra (puede ser negativa: se trata como «sin señal»)
 * @param {number} i1  muestra final (exclusiva)
 * @param {number} fs  Hz
 * @param {{x0: number, yBase: number, mmPorS: number, mmPorMV: number, paso?: number}} g
 * @returns {string}
 */
export function trazo(x, i0, i1, fs, g) {
  const mmPorMuestra = g.mmPorS / fs;
  const paso = g.paso ?? 0.25;
  const porColumna = Math.max(1, Math.floor(paso / mmPorMuestra));
  const X = (i) => g.x0 + (i - i0) * mmPorMuestra;
  const Y = (v) => g.yBase - v * g.mmPorMV;
  const valor = (i) => (i >= 0 && i < x.length ? x[i] : NaN);
  let d = '';
  let abierto = false;
  const punto = (i, v) => {
    d += `${abierto ? 'L' : 'M'}${f2(X(i))} ${f2(Y(v))}`;
    abierto = true;
  };
  if (porColumna <= 2) {
    for (let i = i0; i < i1; i++) {
      const v = valor(i);
      if (Number.isFinite(v)) punto(i, v);
      else abierto = false;
    }
    return d;
  }
  for (let k = i0; k < i1; k += porColumna) {
    const fin = Math.min(i1, k + porColumna);
    let iMin = -1;
    let iMax = -1;
    for (let i = k; i < fin; i++) {
      const v = valor(i);
      if (!Number.isFinite(v)) continue;
      if (iMin < 0 || v < valor(iMin)) iMin = i;
      if (iMax < 0 || v > valor(iMax)) iMax = i;
    }
    if (iMin < 0) {
      abierto = false;
      continue;
    }
    if (iMin === iMax) punto(iMin, valor(iMin));
    else if (iMin < iMax) {
      punto(iMin, valor(iMin));
      punto(iMax, valor(iMax));
    } else {
      punto(iMax, valor(iMax));
      punto(iMin, valor(iMin));
    }
  }
  return d;
}

/**
 * Pulso de calibración de 1 mV y 200 ms, como el que imprime el equipo al inicio de cada fila.
 * @returns {SVGPathElement}
 */
export function pulsoCalibracion(x, yBase, mmPorS, mmPorMV, color = COLORES_PAPEL.trazo) {
  const ancho = 0.2 * mmPorS;
  const alto = mmPorMV;
  const d = `M${f2(x)} ${f2(yBase)}H${f2(x + 1)}V${f2(yBase - alto)}H${f2(x + 1 + ancho)}V${f2(yBase)}H${f2(x + 2 + ancho)}`;
  return svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 0.3, 'stroke-linejoin': 'miter' });
}

/** Texto sobre el papel (tamaño en mm). */
export function texto(x, y, contenido, op = {}) {
  return svgEl(
    'text',
    {
      x: f2(x),
      y: f2(y),
      'font-family': LETRA_PAPEL,
      'font-size': op.tamano ?? 3,
      'font-weight': op.peso ?? 500,
      fill: op.color ?? COLORES_PAPEL.tinta,
      'text-anchor': op.ancla ?? 'start',
    },
    contenido,
  );
}

/** Marcas de segundo bajo una tira (cada 1 s), con su número. */
export function marcasDeTiempo(x0, y, segundos, mmPorS, tInicial = 0) {
  const g = svgEl('g', {});
  let d = '';
  for (let s = 0; s <= segundos + 1e-9; s++) {
    const x = x0 + s * mmPorS;
    d += `M${f2(x)} ${f2(y)}v1.6`;
    g.append(texto(x + 0.6, y + 3.6, `${Math.round(tInicial + s)} s`, { tamano: 2.2, color: COLORES_PAPEL.tenue, peso: 400 }));
  }
  g.prepend(svgEl('path', { d, stroke: COLORES_PAPEL.tenue, 'stroke-width': 0.25, fill: 'none' }));
  return g;
}

/** Píxeles CSS por milímetro (96 ppp de referencia). */
export const PX_POR_MM = 96 / 25.4;
