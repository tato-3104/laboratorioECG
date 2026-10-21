/**
 * Dibujos anatómicos (SVG): cuerpo completo y tórax ampliado.
 * La geometría sale de config/anatomia.js y de src/modelo/torax.js, de modo que lo que se ve
 * (costillas, espacios intercostales, líneas) coincide con lo que usa el modelo para calcular las señales.
 */
import { svgEl } from './dom.js';
import { VISTA_CUERPO, VISTA_TORAX } from '../config/anatomia.js';
import { toraxACuerpo, toraxAVistaTorax } from '../conexiones/sitios.js';

/** Silueta del corazón en coordenadas locales (cm): base en −6, ápex en +6. */
const CORAZON = 'M -6 0 C -6 -4.6 0 -5 3 -3.1 C 5 -1.8 6.6 -0.5 6.6 0 C 6.6 0.5 5 1.8 3 3.1 C 0 5 -6 4.6 -6 0 Z';
const CENTRO_CORAZON_CM = { x: 2.2, y: 1.6 };

function corazonEn(convertir, escala) {
  const c = convertir(CENTRO_CORAZON_CM.x, CENTRO_CORAZON_CM.y);
  // El eje largo va de la base (arriba, a la derecha del paciente) al ápex (abajo, a su izquierda).
  return svgEl('path', {
    d: CORAZON,
    class: 'corazon',
    transform: `translate(${c.u.toFixed(1)} ${c.v.toFixed(1)}) rotate(38) scale(${escala})`,
    'vector-effect': 'non-scaling-stroke',
  });
}

const fmt = (v) => v.toFixed(1);

/**
 * Cuerpo completo en vista anterior.
 * @param {{referencias: boolean, corazon: boolean}} op
 */
export function dibujarCuerpo(op) {
  const C = VISTA_CUERPO;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${C.ancho} ${C.alto}`,
    role: 'img',
    'aria-label': 'Paciente en vista anterior. Su derecha queda a la izquierda de la pantalla.',
    tabindex: '-1',
    'data-vista': 'cuerpo',
  });
  const tramos = Object.values(C.extremidades).flatMap((e) => e.tramos);
  const contorno = svgEl('g', { class: 'cuerpo-contorno' });
  const relleno = svgEl('g', { class: 'cuerpo-relleno' });
  for (const [a, b, r] of tramos) {
    const d = `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
    contorno.append(svgEl('path', { d, 'stroke-width': 2 * r + 3 }));
    relleno.append(svgEl('path', { d, 'stroke-width': 2 * r }));
  }
  svg.append(contorno, relleno);
  for (const e of Object.values(C.extremidades)) {
    const f = e.mano ?? e.pie;
    svg.append(svgEl('ellipse', { cx: f.cx, cy: f.cy, rx: f.rx, ry: f.ry, class: 'cuerpo-piel' }));
  }
  svg.append(
    svgEl('rect', { x: C.cuello.x, y: C.cuello.y, width: C.cuello.ancho, height: C.cuello.alto, rx: 9, class: 'cuerpo-piel' }),
    svgEl('circle', { cx: C.cabeza.cx, cy: C.cabeza.cy, r: C.cabeza.r, class: 'cuerpo-piel' }),
    svgEl('path', { d: C.tronco, class: 'cuerpo-piel' }),
  );
  // Reparos palpables: clavículas, esternón y ángulo esternal
  const g = svgEl('g', { 'aria-hidden': 'true' });
  g.append(
    svgEl('path', { d: 'M112 117 Q130 111 146 119', class: 'reparo' }),
    svgEl('path', { d: 'M154 119 Q170 111 188 117', class: 'reparo' }),
    svgEl('path', { d: 'M150 121 L150 198', class: 'reparo' }),
    svgEl('path', { d: 'M144 127 H156', class: 'reparo' }),
  );
  svg.append(g);
  if (op.corazon) svg.append(corazonEn(toraxACuerpo, VISTA_CUERPO.escalaTorax));
  svg.append(
    svgEl('text', { x: 10, y: 628, class: 'texto-lado' }, 'Derecha del paciente'),
    svgEl('text', { x: 310, y: 628, class: 'texto-lado', 'text-anchor': 'end' }, 'Izquierda del paciente'),
  );
  agregarCapasDinamicas(svg);
  return svg;
}

/**
 * Tórax ampliado con costillas, espacios intercostales y líneas de referencia.
 * @param {object} torax  resultado de crearTorax()
 * @param {{referencias: boolean, corazon: boolean}} op
 */
export function dibujarTorax(torax, op) {
  const T = VISTA_TORAX;
  const g = torax.g;
  const P = (x, y) => toraxAVistaTorax(x, y);
  const linea = (puntos) => puntos.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.u)} ${fmt(p.v)}`).join(' ');
  const R = T.recorte;
  const esq0 = P(R.x, R.y);
  const esq1 = P(R.x + R.ancho, R.y + R.alto);
  const svg = svgEl('svg', {
    viewBox: `${fmt(esq0.u)} ${fmt(esq0.v)} ${fmt(esq1.u - esq0.u)} ${fmt(esq1.v - esq0.v)}`,
    role: 'img',
    'aria-label': 'Tórax en vista anterior ampliada con clavículas, esternón, costillas y espacios intercostales.',
    tabindex: '-1',
    'data-vista': 'torax',
  });
  svg.append(svgEl('path', { d: T.contorno, class: 'cuerpo-piel' }));

  // Costillas 1 a 7 (verdaderas), dibujadas con la misma función que usa el modelo
  const costillas = svgEl('g', { 'aria-hidden': 'true' });
  for (let k = 1; k <= 7; k++) {
    const xMax = k === 1 ? 8 : g.semiancho - 0.4;
    for (const lado of [-1, 1]) {
      const pts = [];
      for (let ax = g.xBordeEsternal + 0.2; ax <= xMax + 1e-9; ax += 0.4) pts.push(P(lado * ax, torax.yCostilla(k, ax)));
      costillas.append(svgEl('path', { d: linea(pts), class: 'costilla', 'stroke-width': 15 }));
    }
  }
  // Reborde costal (cartílagos de las costillas falsas)
  for (const lado of [-1, 1]) {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const x = lado * (1.4 + 12 * t);
      const y = torax.yCostilla(7, 1.6) + 1.6 + 8.5 * Math.pow(t, 0.8);
      pts.push(P(x, y));
    }
    costillas.append(svgEl('path', { d: linea(pts), class: 'costilla', 'stroke-width': 9 }));
  }
  svg.append(costillas);

  // Esternón (manubrio, cuerpo y apéndice xifoides) y ángulo esternal
  const ySA = torax.yCostilla(2, g.xBordeEsternal);
  const yX = torax.yCostilla(7, g.xBordeEsternal) + 0.6;
  const manubrio = [P(-2.7, -10.6), P(2.7, -10.6), P(1.9, ySA), P(-1.9, ySA)];
  const cuerpo = [P(-1.9, ySA), P(1.9, ySA), P(1.4, yX), P(-1.4, yX)];
  const xifoides = [P(-0.7, yX + 0.2), P(0.7, yX + 0.2), P(0, yX + 2.6)];
  for (const pol of [manubrio, cuerpo, xifoides]) svg.append(svgEl('path', { d: `${linea(pol)} Z`, class: 'hueso' }));
  for (const lado of [-1, 1]) {
    const a = P(lado * 2.0, -10.2);
    const c1 = P(lado * 6, -11.2);
    const c2 = P(lado * 9.5, -9.2);
    const b = P(lado * 15.2, -9.6);
    svg.append(svgEl('path', { d: `M${fmt(a.u)} ${fmt(a.v)} C${fmt(c1.u)} ${fmt(c1.v)} ${fmt(c2.u)} ${fmt(c2.v)} ${fmt(b.u)} ${fmt(b.v)}`, class: 'clavicula' }));
  }
  const sa1 = P(-2.4, ySA);
  const sa2 = P(2.4, ySA);
  svg.append(svgEl('path', { d: `M${fmt(sa1.u)} ${fmt(sa1.v)} H${fmt(sa2.u)}`, class: 'angulo-esternal' }));

  if (op.referencias) {
    // Líneas verticales de referencia con abreviaturas (la leyenda está bajo el dibujo):
    // LME medioesternal, LMC medioclavicular, LAA axilar anterior, LAM axilar media.
    const ref = svgEl('g', { 'aria-hidden': 'true' });
    const yTexto = R.y + R.alto - 1.2;
    const lineasV = [
      [0, 'LME', 'start'],
      [-g.xMedioclavicular, 'LMC der.', 'start'],
      [g.xMedioclavicular, 'LMC izq.', 'end'],
      [g.xAxilarAnterior, 'LAA', 'end'],
      [g.xAxilarMedia, 'LAM', 'start'],
    ];
    for (const [x, nombre, ancla] of lineasV) {
      const a = P(x, R.y);
      const b = P(x, R.y + R.alto);
      ref.append(svgEl('path', { d: `M${fmt(a.u)} ${fmt(a.v)} V${fmt(b.v)}`, class: 'linea-guia' }));
      const p = P(x, yTexto);
      ref.append(svgEl('text', { x: fmt(p.u + (ancla === 'start' ? 5 : -5)), y: fmt(p.v), class: 'texto-guia', 'text-anchor': ancla }, nombre));
    }
    for (let n = 2; n <= 6; n++) {
      const p = P(-4.7, torax.yEIC(n, 4.7));
      ref.append(svgEl('text', { x: fmt(p.u), y: fmt(p.v + 5), class: 'texto-eic', 'text-anchor': 'end' }, `${n}.º`));
    }
    const pa = P(4.4, ySA - 1.5);
    ref.append(
      svgEl('text', { x: fmt(pa.u), y: fmt(pa.v), class: 'texto-guia' }, 'Ángulo esternal'),
      svgEl('path', { d: `M${fmt(pa.u - 3)} ${fmt(pa.v - 4)} L${fmt(sa2.u + 2)} ${fmt(sa2.v)}`, class: 'linea-guia', 'stroke-dasharray': 'none' }),
    );
    svg.append(ref);
  }
  if (op.corazon) svg.append(corazonEn(toraxAVistaTorax, VISTA_TORAX.escala));
  svg.append(
    svgEl('text', { x: fmt(esq0.u + 8), y: fmt(esq0.v + 20), class: 'texto-lado' }, 'Derecha del paciente'),
    svgEl('text', { x: fmt(esq1.u - 8), y: fmt(esq0.v + 20), class: 'texto-lado', 'text-anchor': 'end' }, 'Izquierda del paciente'),
  );
  agregarCapasDinamicas(svg);
  return svg;
}

/** Capas que la vista del paciente rellena: cables, electrodos y ayudas de arrastre. */
function agregarCapasDinamicas(svg) {
  svg.append(
    svgEl('g', { class: 'capa-cables', 'aria-hidden': 'true' }),
    svgEl('g', { class: 'capa-electrodos' }),
    svgEl('g', { class: 'capa-ayudas', 'aria-hidden': 'true' }),
  );
}
