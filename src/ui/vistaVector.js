/**
 * Herramienta «Vector cardíaco» (información de apoyo, estática).
 *
 * Muestra el sistema de referencia de las derivaciones: en el plano frontal, el círculo hexaxial con el eje y
 * el hemicampo positivo de la derivación elegida y su ángulo; en el plano horizontal, la dirección de cada
 * precordial. El estudiante puede escribir el ángulo de un «vector de prueba» (por ejemplo, el eje que calculó)
 * para ver cómo se proyecta sobre cada derivación y compararlo con lo que midió en su registro.
 *
 * No usa la señal del sujeto: no revela el eje del registro ni se anima con el latido.
 */
import { el, svgEl, vaciar, $, num } from './dom.js';
import { DERIVACIONES, GRUPO_EXTREMIDADES } from '../modelo/derivaciones.js';
import { vectoresPrecordialesEstandar } from '../modelo/vectoresDerivacion.js';

/** Ángulo (grados) del polo positivo de cada derivación frontal, convención hexaxial (+ hacia abajo). */
export const ANGULO_DERIVACION = Object.freeze({ I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 });

/** Polos de cada derivación frontal (para describirla en palabras). */
const POLOS = Object.freeze({
  I: 'de RA (−) a LA (+)',
  II: 'de RA (−) a LL (+)',
  III: 'de LA (−) a LL (+)',
  aVR: 'del promedio de LA y LL (−) a RA (+)',
  aVL: 'del promedio de RA y LL (−) a LA (+)',
  aVF: 'del promedio de RA y LA (−) a LL (+)',
});

/**
 * Dirección de cada precordial en el plano horizontal según el modelo (vectores de Dower proyectados en X–Z):
 * 0° = izquierda del paciente, ángulos positivos hacia adelante. Valores redondeados a 5°.
 */
export const ANGULO_PRECORDIAL = Object.freeze(
  Object.fromEntries(
    Object.entries(vectoresPrecordialesEstandar()).map(([d, v]) => [d, Math.round(Math.atan2(-v[2], v[0]) * (180 / Math.PI) / 5) * 5]),
  ),
);

const R = 140;
const RAD = Math.PI / 180;
const FACTOR_AUMENTADA = Math.sqrt(3) / 2;
const fmtAngulo = (a) => `${a > 0 ? '+' : ''}${num(a, 0)}°`;
/** Diferencia angular en (−180°, 180°]. */
const diferencia = (a, b) => {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
};

export function crearVistaVector({ almacen }) {
  const panel = $('herr-vector');
  const selector = el('div', { class: 'selector-derivaciones', role: 'group', 'aria-label': 'Derivación' });
  for (const d of DERIVACIONES) {
    selector.append(el('button', { type: 'button', 'data-derivacion': d, 'aria-pressed': 'false', onclick: () => almacen.actualizar({ derivacionSeleccionada: d }) }, d));
  }
  const svg = svgEl('svg', { role: 'img' });
  const texto = el('div', { class: 'vector-texto' });
  const debajo = el('div', { class: 'vector-debajo' });
  const entradaAngulo = el('input', { type: 'number', id: 'in-vector-prueba', min: -180, max: 180, step: 1, inputmode: 'numeric', placeholder: 'grados' });
  const deslizador = el('input', { type: 'range', id: 'rango-vector-prueba', min: -180, max: 180, step: 1, value: 0, 'aria-label': 'Ángulo del vector de prueba' });
  const quitar = el('button', { type: 'button', class: 'boton boton-sec boton-pequeno', id: 'btn-quitar-vector' }, 'Quitar');
  const controles = el('div', { class: 'vector-prueba' },
    el('label', { class: 'campo' }, 'Vector de prueba (°)', entradaAngulo),
    deslizador,
    quitar);
  panel.append(
    el('p', { class: 'ayuda' }, 'Información de apoyo: el ángulo desde el que «mira» cada derivación. La amplitud neta de una onda en una derivación es proporcional a la proyección del vector cardíaco medio sobre el eje de esa derivación.'),
    selector,
    el('div', { class: 'vector-disposicion' }, svg, texto),
    debajo,
  );
  let prueba = null; // ángulo del vector de prueba (grados) o null
  let activo = false;

  // ------------------------------------------------------------------ dibujo
  function flecha(angulo, largo, clase, sentidoY = 1) {
    const c = Math.cos(angulo * RAD);
    const s = Math.sin(angulo * RAD) * sentidoY;
    const x = largo * c;
    const y = largo * s;
    const base = Math.atan2(s, c);
    const a1 = base + 152 * RAD;
    const a2 = base - 152 * RAD;
    return svgEl('path', {
      d: `M0 0L${x.toFixed(1)} ${y.toFixed(1)}M${(x + 12 * Math.cos(a1)).toFixed(1)} ${(y + 12 * Math.sin(a1)).toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}L${(x + 12 * Math.cos(a2)).toFixed(1)} ${(y + 12 * Math.sin(a2)).toFixed(1)}`,
      class: clase,
      fill: 'none',
    });
  }

  /** Arco de radio r entre dos ángulos (grados, convención de la pantalla: + hacia abajo). */
  function arco(desde, hasta, r, clase) {
    const p = (a) => [r * Math.cos(a * RAD), r * Math.sin(a * RAD)];
    const [x0, y0] = p(desde);
    const [x1, y1] = p(hasta);
    const d = hasta - desde;
    return svgEl('path', {
      d: `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${Math.abs(d) > 180 ? 1 : 0} ${d > 0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      class: clase,
      fill: 'none',
    });
  }

  /** Semicírculo del hemicampo positivo de un eje (ángulo en convención de la pantalla). */
  function hemicampo(angulo) {
    const p = (a) => [R * Math.cos(a * RAD), R * Math.sin(a * RAD)];
    const [x0, y0] = p(angulo - 90);
    const [x1, y1] = p(angulo + 90);
    return svgEl('path', { d: `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`, class: 'hemicampo' });
  }

  function dibujarFrontal(sel) {
    svg.setAttribute('viewBox', `${-R - 48} ${-R - 34} ${2 * R + 96} ${2 * R + 68}`);
    vaciar(svg);
    const alfa = ANGULO_DERIVACION[sel];
    svg.append(svgEl('circle', { r: R, class: 'hexaxial-circulo' }), hemicampo(alfa));
    for (const [d, ang] of Object.entries(ANGULO_DERIVACION)) {
      const c = Math.cos(ang * RAD);
      const s = Math.sin(ang * RAD);
      const activo = d === sel;
      if (activo) {
        svg.append(
          svgEl('line', { x1: 0, y1: 0, x2: (-R * c).toFixed(1), y2: (-R * s).toFixed(1), class: 'hexaxial-eje activo negativo' }),
          svgEl('line', { x1: 0, y1: 0, x2: (R * c).toFixed(1), y2: (R * s).toFixed(1), class: 'hexaxial-eje activo' }),
        );
      } else {
        svg.append(svgEl('line', { x1: (-R * c).toFixed(1), y1: (-R * s).toFixed(1), x2: (R * c).toFixed(1), y2: (R * s).toFixed(1), class: 'hexaxial-eje' }));
      }
      const xl = (R + 10) * c;
      const yl = (R + 10) * s + 4;
      svg.append(
        svgEl('text', { x: xl.toFixed(1), y: yl.toFixed(1), 'text-anchor': Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end', class: `hexaxial-texto${activo ? ' activo' : ''}` },
          svgEl('tspan', {}, d), svgEl('tspan', { class: 'hexaxial-angulo', dx: 4 }, fmtAngulo(ang))),
      );
    }
    // Ángulo de la derivación elegida medido desde el eje de I (0°)
    if (alfa !== 0) {
      svg.append(arco(0, alfa, 30, 'arco-angulo'));
      const m = (alfa / 2) * RAD;
      svg.append(svgEl('text', { x: (44 * Math.cos(m)).toFixed(1), y: (44 * Math.sin(m) + 4).toFixed(1), 'text-anchor': 'middle', class: 'texto-arco' }, fmtAngulo(alfa)));
    }
    svg.append(svgEl('circle', { r: 2.4, class: 'punto-centro' }));
    if (prueba !== null) {
      const largo = 0.8 * R;
      const delta = diferencia(prueba, alfa);
      const proy = largo * Math.cos(delta * RAD);
      const tx = largo * Math.cos(prueba * RAD);
      const ty = largo * Math.sin(prueba * RAD);
      const px = proy * Math.cos(alfa * RAD);
      const py = proy * Math.sin(alfa * RAD);
      svg.append(
        svgEl('line', { x1: 0, y1: 0, x2: px.toFixed(1), y2: py.toFixed(1), class: `proyeccion-segmento${proy < 0 ? ' negativa' : ''}` }),
        svgEl('line', { x1: tx.toFixed(1), y1: ty.toFixed(1), x2: px.toFixed(1), y2: py.toFixed(1), class: 'proyeccion' }),
        flecha(prueba, largo, 'flecha-prueba'),
        svgEl('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 3.6, class: 'punto-proyeccion' }),
      );
      if (Math.abs(delta) >= 1) svg.append(arco(alfa, alfa + delta, 56, 'arco-delta'));
    }
    svg.setAttribute(
      'aria-label',
      `Círculo hexaxial. Derivación ${sel}: eje a ${fmtAngulo(alfa)}.${prueba !== null ? ` Vector de prueba a ${fmtAngulo(prueba)}.` : ''}`,
    );
  }

  function dibujarHorizontal(sel) {
    const A = R; // semiejes de la sección del tórax
    const B = R * 0.72;
    svg.setAttribute('viewBox', `${-A - 56} ${-B - 46} ${2 * A + 112} ${2 * B + 92}`);
    vaciar(svg);
    const alfa = ANGULO_PRECORDIAL[sel];
    // Sección del tórax vista desde los pies: adelante arriba, izquierda del paciente a la derecha.
    svg.append(
      svgEl('ellipse', { rx: A, ry: B, class: 'hexaxial-circulo' }),
      svgEl('text', { x: -A - 40, y: -B - 26, 'text-anchor': 'start', class: 'hexaxial-grados' }, '↑ adelante (esternón)'),
      svgEl('text', { x: -A - 40, y: B + 38, 'text-anchor': 'start', class: 'hexaxial-grados' }, '↓ atrás (columna)'),
      svgEl('text', { x: A + 8, y: B + 18, 'text-anchor': 'start', class: 'hexaxial-grados' }, 'izq.'),
      svgEl('text', { x: -A - 8, y: B + 18, 'text-anchor': 'end', class: 'hexaxial-grados' }, 'der.'),
    );
    // Hemicampo positivo de la precordial elegida (en esta vista el ángulo positivo va hacia arriba).
    const pt = (a, r = A) => [r * Math.cos(a * RAD), -r * Math.sin(a * RAD)];
    // Distancia del centro al borde de la elipse en la dirección a
    const borde = (a) => 1 / Math.sqrt((Math.cos(a * RAD) / A) ** 2 + (Math.sin(a * RAD) / B) ** 2);
    const [x0, y0] = pt(alfa + 90);
    const [x1, y1] = pt(alfa - 90);
    svg.append(svgEl('path', { d: `M${x0.toFixed(1)} ${y0.toFixed(1)}A${A} ${A} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`, class: 'hemicampo', 'clip-path': 'url(#recorte-torax)' }));
    svg.prepend(svgEl('defs', {}, svgEl('clipPath', { id: 'recorte-torax' }, svgEl('ellipse', { rx: A, ry: B }))));
    for (const [d, ang] of Object.entries(ANGULO_PRECORDIAL)) {
      const activo = d === sel;
      const [x, y] = pt(ang, borde(ang));
      if (activo) {
        const [xn, yn] = pt(ang + 180, borde(ang + 180) * 0.85);
        svg.append(svgEl('line', { x1: 0, y1: 0, x2: xn.toFixed(1), y2: yn.toFixed(1), class: 'hexaxial-eje activo negativo' }));
      }
      svg.append(svgEl('line', { x1: 0, y1: 0, x2: x.toFixed(1), y2: y.toFixed(1), class: `hexaxial-eje${activo ? ' activo' : ''}` }));
      const [xl, yl] = pt(ang, borde(ang) + 12);
      const c = Math.cos(ang * RAD);
      svg.append(
        svgEl('text', { x: xl.toFixed(1), y: (yl + 4).toFixed(1), 'text-anchor': Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end', class: `hexaxial-texto${activo ? ' activo' : ''}` },
          svgEl('tspan', {}, d), svgEl('tspan', { class: 'hexaxial-angulo', dx: 4 }, fmtAngulo(ang))),
      );
    }
    svg.append(svgEl('circle', { r: 2.4, class: 'punto-centro' }));
    svg.setAttribute('aria-label', `Plano horizontal visto desde los pies. ${sel}: dirección ${fmtAngulo(alfa)} respecto a la izquierda del paciente.`);
  }

  // ------------------------------------------------------------------ texto
  function tablaProyecciones() {
    const filas = GRUPO_EXTREMIDADES.map((d) => {
      const delta = diferencia(prueba, ANGULO_DERIVACION[d]);
      const factor = d.startsWith('a') ? FACTOR_AUMENTADA : 1;
      const p = Math.cos(delta * RAD) * factor;
      const signo = Math.abs(p) < 0.15 ? '≈ 0 (casi isoeléctrica)' : p > 0 ? 'positiva' : 'negativa';
      return el('tr', { class: d === almacen.obtener().derivacionSeleccionada ? 'fila-activa' : '' },
        el('td', { class: 'mono' }, d),
        el('td', {}, fmtAngulo(ANGULO_DERIVACION[d])),
        el('td', {}, fmtAngulo(delta)),
        el('td', {}, num(p, 2)),
        el('td', {}, signo));
    });
    return el('div', { class: 'contenedor-tabla' },
      el('table', { class: 'tabla-entradas tabla-proyecciones' },
        el('caption', { class: 'ayuda' }, `Proyección del vector de prueba (${fmtAngulo(prueba)}) en las seis derivaciones del plano frontal. Δ es el ángulo entre el vector y el eje de cada derivación.`),
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'Derivación'), el('th', { scope: 'col' }, 'Eje'), el('th', { scope: 'col' }, 'Δ'),
          el('th', { scope: 'col' }, 'Proyección relativa'), el('th', { scope: 'col' }, 'Deflexión esperada'))),
        el('tbody', {}, filas)));
  }

  function render() {
    const sel = almacen.obtener().derivacionSeleccionada;
    for (const b of selector.children) b.setAttribute('aria-pressed', String(b.dataset.derivacion === sel));
    const frontal = sel in ANGULO_DERIVACION;
    vaciar(texto);
    vaciar(debajo);
    if (frontal) {
      dibujarFrontal(sel);
      const alfa = ANGULO_DERIVACION[sel];
      texto.append(
        el('div', { class: 'lectura lectura-vector' },
          el('div', {}, `Derivación ${sel} · eje `, el('strong', {}, fmtAngulo(alfa)))),
        el('p', {}, `El eje de ${sel} va ${POLOS[sel]}. Su hemicampo positivo (zona sombreada) es la mitad del círculo centrada en ese eje: un vector que apunte hacia esa mitad produce una deflexión positiva en ${sel}; uno perpendicular al eje (a ${fmtAngulo(diferencia(alfa + 90, 0))} o ${fmtAngulo(diferencia(alfa - 90, 0))}) no produce deflexión neta.`),
        controles,
      );
      controles.hidden = false;
      if (prueba !== null) {
        const delta = diferencia(prueba, alfa);
        const cos = Math.cos(delta * RAD);
        const factor = sel.startsWith('a') ? FACTOR_AUMENTADA : 1;
        texto.append(
          el('p', {}, `Ángulo entre el vector de prueba y el eje de ${sel}: Δ = ${fmtAngulo(delta)}; cos Δ = ${num(cos, 2)}. `,
            Math.abs(cos) < 0.15 ? `El vector es casi perpendicular al eje: ${sel} sería casi isoeléctrica.` : `La proyección es ${cos > 0 ? 'positiva' : 'negativa'}: ${sel} registraría una deflexión ${cos > 0 ? 'positiva' : 'negativa'}${factor < 1 ? ' (en las aumentadas, √3/2 de la proyección)' : ''}.`),
        );
        debajo.append(tablaProyecciones());
      } else {
        texto.append(el('p', { class: 'ayuda' }, 'Escriba un ángulo (por ejemplo, el eje del QRS que calculó con sus mediciones) para ver cómo se proyecta en cada derivación y compararlo con su registro.'));
      }
      debajo.append(el('p', { class: 'ayuda' }, 'Convención hexaxial: 0° hacia la izquierda del paciente y ángulos positivos hacia los pies. En el sistema ideal, la amplitud en I, II y III es la proyección completa; en aVR, aVL y aVF es √3/2 (≈ 0,87) de la proyección.'));
    } else {
      dibujarHorizontal(sel);
      const alfa = ANGULO_PRECORDIAL[sel];
      controles.hidden = true;
      texto.append(
        el('div', { class: 'lectura lectura-vector' }, el('div', {}, `Derivación ${sel} · dirección `, el('strong', {}, fmtAngulo(alfa)))),
        el('p', {}, `${sel} = Φ(${sel}) − TCW: el polo positivo es el electrodo explorador del tórax y el negativo, la terminal central de Wilson. Un vector que apunte hacia el electrodo produce una deflexión positiva; uno que se aleje, negativa.`),
        el('p', {}, 'De V1 a V6 la dirección gira desde adelante y a la derecha hasta la izquierda del paciente; por eso la onda R crece y la S disminuye a lo largo de las precordiales.'),
        el('p', { class: 'ayuda' }, 'Plano horizontal visto desde los pies (adelante arriba). Ángulos aproximados del modelo (matriz de Dower): 0° hacia la izquierda del paciente y positivos hacia adelante. Muchos textos usan un esquema parecido con V6 en 0°. El vector de prueba se usa en el plano frontal.'),
      );
    }
  }

  function fijarPrueba(valor) {
    const n = Number(valor);
    if (valor === '' || valor === null || !Number.isFinite(n)) prueba = null;
    else prueba = Math.max(-180, Math.min(180, Math.round(n)));
    if (prueba !== null) {
      deslizador.value = String(prueba);
      if (document.activeElement !== entradaAngulo) entradaAngulo.value = String(prueba);
    } else {
      entradaAngulo.value = '';
    }
    quitar.disabled = prueba === null;
    render();
  }
  entradaAngulo.addEventListener('input', () => fijarPrueba(entradaAngulo.value));
  entradaAngulo.addEventListener('change', () => fijarPrueba(entradaAngulo.value));
  deslizador.addEventListener('input', () => {
    entradaAngulo.value = deslizador.value;
    fijarPrueba(deslizador.value);
  });
  quitar.addEventListener('click', () => fijarPrueba(''));
  quitar.disabled = true;

  almacen.suscribir((e, a) => {
    if (activo && e.derivacionSeleccionada !== a.derivacionSeleccionada) render();
  });

  return {
    activar() {
      activo = true;
      render();
    },
    desactivar() {
      activo = false;
    },
    /** Fija el vector de prueba (pruebas automáticas). */
    fijarPrueba,
  };
}
