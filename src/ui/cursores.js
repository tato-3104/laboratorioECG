/**
 * Herramienta «Cursores»: medición sobre papel milimetrado de la pantalla congelada o de un registro impreso.
 *
 *  - Cursores verticales A y B: tiempos (Δt, frecuencia equivalente) y el valor de cada derivación en ese instante.
 *    Abarcan todas las tiras visibles, de modo que con «I, II y III» se puede comprobar la ley de Einthoven.
 *  - Cursores horizontales C y D (con una sola derivación): diferencias de voltaje.
 * Se mueven arrastrando, tocando el papel (mueve el cursor vertical más cercano) o con el teclado.
 */
import { el, svgEl, vaciar, $, num, puntoSVG } from './dom.js';
import { cuadricula, trazo, pulsoCalibracion, texto, marcasDeTiempo, COLORES_PAPEL, PX_POR_MM } from './papel.js';
import { DERIVACIONES } from '../modelo/derivaciones.js';
import { TEXTOS } from '../textos/es.js';

export const GRUPOS_CURSORES = Object.freeze([
  ...DERIVACIONES.map((d) => ({ id: d, nombre: d, derivaciones: [d] })),
  { id: 'einthoven', nombre: 'I, II y III', derivaciones: ['I', 'II', 'III'] },
  { id: 'aumentadas', nombre: 'aVR, aVL y aVF', derivaciones: ['aVR', 'aVL', 'aVF'] },
]);
const MARGEN_IZQ = 15; // mm: pulso de calibración, nombre y asas de los cursores horizontales
const ALTO_UNA = 46; // mm
const ALTO_GRUPO = 30; // mm por tira
const ALTO_MARCAS = 6; // mm
const COLOR = { A: '#0e6b6b', B: '#a84e06', C: '#1f5fc2', D: '#7a3fa6' };

export function crearCursores({ almacen }) {
  const panel = $('herr-cursores');
  const selFuente = el('select', { id: 'sel-fuente-cursores' });
  const selGrupo = el('select', { id: 'sel-derivacion-cursores' });
  for (const g of GRUPOS_CURSORES) selGrupo.append(el('option', { value: g.id }, g.nombre));
  selGrupo.value = 'II';
  const selZoom = el('select', { id: 'sel-zoom-cursores' });
  for (const z of [1, 2, 3]) selZoom.append(el('option', { value: String(z) }, `${z}×`));
  selZoom.value = '2';
  const contenedor = el('div', { class: 'papel-contenedor' });
  const lectura = el('div', { class: 'lectura' });
  const tabla = el('div', { class: 'contenedor-tabla' });
  const resumenVivo = el('p', { class: 'solo-lector', 'aria-live': 'polite' });
  const vacio = el('p', { class: 'vacio' }, TEXTOS.registros.sinFuente);
  const cuerpo = el('div', { class: 'cursores-cuerpo' },
    el('div', { class: 'controles-cursores' },
      el('label', { class: 'campo' }, 'Registro', selFuente),
      el('label', { class: 'campo' }, 'Derivación', selGrupo),
      el('label', { class: 'campo' }, 'Escala', selZoom)),
    contenedor,
    lectura,
    tabla,
    resumenVivo,
    el('p', { class: 'ayuda' }, 'Arrastre las asas de los cursores o toque el papel para llevar allí el cursor vertical más cercano. Con el teclado: Tab hasta un asa y flechas (Mayús para pasos de 10). A y B miden tiempos; C y D, voltajes.'),
  );
  panel.append(el('p', { class: 'ayuda' }, 'Mida intervalos y amplitudes sobre el papel, como con la regla y el compás en el laboratorio.'), vacio, cuerpo);

  let activo = false;
  let fuente = null;
  let grupo = GRUPOS_CURSORES.find((g) => g.id === 'II');
  let zoom = 2;
  let geo = null;
  let svg = null;
  let capaCursores = null;
  const pos = { A: 0, B: 0, C: 0, D: 1 };

  // ------------------------------------------------------------------ fuentes
  function fuentes() {
    const e = almacen.obtener();
    const lista = [];
    if (e.congelada) lista.push(e.congelada);
    for (const r of [...e.registros].reverse()) lista.push(r);
    return lista;
  }

  function nombreFuente(r) {
    return r.numero ? `${r.etiqueta} · ${r.hora}` : `Pantalla congelada · ${r.hora}`;
  }

  /** Rehace la lista de registros; si cambia el registro elegido, reinicia los cursores. */
  function actualizarFuentes(forzarDibujo = false) {
    const lista = fuentes();
    const id = almacen.obtener().fuenteCursores;
    vaciar(selFuente);
    for (const r of lista) selFuente.append(el('option', { value: r.id }, nombreFuente(r)));
    const elegida = lista.find((r) => r.id === id) ?? lista[0] ?? null;
    if (elegida) selFuente.value = elegida.id;
    vacio.hidden = Boolean(elegida);
    cuerpo.hidden = !elegida;
    if (elegida !== fuente) {
      fuente = elegida;
      if (fuente) reiniciarCursores();
      dibujar();
    } else if (forzarDibujo) dibujar();
  }

  /** Coloca A y B dentro de la parte visible del papel (al 30 % y al 60 % del ancho visible). */
  function reiniciarCursores() {
    const visibleMm = (contenedor.clientWidth || 640) / (PX_POR_MM * zoom) - MARGEN_IZQ;
    const visibleS = Math.max(0.5, visibleMm / fuente.ajustes.velocidad);
    pos.A = Math.min(fuente.n - 1, Math.round(0.3 * visibleS * fuente.fs));
    pos.B = Math.min(fuente.n - 1, Math.round(0.6 * visibleS * fuente.fs));
    pos.C = 0;
    pos.D = 1;
  }

  // ------------------------------------------------------------------ dibujo
  function dibujar() {
    vaciar(contenedor);
    if (!fuente || !activo) return;
    const r = fuente;
    const a = r.ajustes;
    const derivs = grupo.derivaciones;
    const una = derivs.length === 1;
    const altoTira = una ? ALTO_UNA : ALTO_GRUPO;
    const largo = (r.n / r.fs) * a.velocidad;
    const ancho = MARGEN_IZQ + largo + 4;
    const alto = derivs.length * altoTira + ALTO_MARCAS;
    geo = { x0: MARGEN_IZQ, mmPorS: a.velocidad, mmPorMV: a.ganancia, ancho, alto, altoTrazos: derivs.length * altoTira, tiras: [], una };
    svg = svgEl('svg', {
      viewBox: `0 0 ${ancho.toFixed(2)} ${alto}`,
      width: (ancho * PX_POR_MM * zoom).toFixed(0),
      height: (alto * PX_POR_MM * zoom).toFixed(0),
      role: 'group',
      'aria-label': `Papel milimetrado: ${grupo.nombre}, ${num(r.duracion, 1)} s a ${num(a.velocidad, a.velocidad % 1 ? 1 : 0)} mm/s y ${a.ganancia} mm/mV`,
    });
    svg.append(cuadricula(0, 0, ancho, alto));
    derivs.forEach((d, k) => {
      const top = k * altoTira;
      const base = top + (una ? 29 : 19);
      geo.tiras.push({ d, top, base });
      svg.append(pulsoCalibracion(1.5, base, a.velocidad, a.ganancia), texto(1.5, top + 4.2, d, { tamano: 3.4, peso: 600, color: COLORES_PAPEL.trazo }));
      const x = r.derivaciones[d];
      svg.append(svgEl('path', { d: trazo(x, 0, r.n, r.fs, { x0: MARGEN_IZQ, yBase: base, mmPorS: a.velocidad, mmPorMV: a.ganancia, paso: 0.2 }), fill: 'none', stroke: COLORES_PAPEL.trazo, 'stroke-width': 0.3, 'stroke-linejoin': 'round' }));
    });
    svg.append(marcasDeTiempo(MARGEN_IZQ, geo.altoTrazos, r.duracion, a.velocidad));
    capaCursores = svgEl('g', {});
    svg.append(capaCursores);
    svg.addEventListener('click', alTocarPapel);
    contenedor.append(svg);
    dibujarCursores();
  }

  const xDe = (i) => geo.x0 + (i / fuente.fs) * geo.mmPorS;
  const yDe = (mv) => geo.tiras[0].base - mv * geo.mmPorMV;

  function asa(nombre, atributos, hijos, alMover) {
    const g = svgEl('g', { class: 'cursor-asa-g', tabindex: '0', role: 'slider', 'data-cursor': nombre, ...atributos }, ...hijos);
    g.addEventListener('keydown', (ev) => {
      const paso = ev.shiftKey ? 10 : 1;
      const d = { ArrowLeft: -paso, ArrowRight: paso, ArrowDown: -paso, ArrowUp: paso }[ev.key];
      if (d === undefined) return;
      ev.preventDefault();
      alMover(d, ev.key.startsWith('Arrow') && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown'));
    });
    g.addEventListener('pointerdown', (ev) => iniciarArrastre(ev, nombre));
    return g;
  }

  function dibujarCursores() {
    if (!svg) return;
    const enfocado = document.activeElement?.dataset?.cursor;
    vaciar(capaCursores);
    const r = fuente;
    const altoT = geo.altoTrazos;
    for (const k of ['A', 'B']) {
      const x = xDe(pos[k]);
      const t = pos[k] / r.fs;
      capaCursores.append(
        svgEl('line', { x1: x, y1: 0, x2: x, y2: altoT, stroke: COLOR[k], 'stroke-width': 0.35, class: 'cursor-linea' }),
        asa(k, { 'aria-label': `Cursor ${k}`, 'aria-valuemin': 0, 'aria-valuemax': num(r.duracion, 3), 'aria-valuenow': t.toFixed(3), 'aria-valuetext': `${k} en ${num(t, 3)} s` },
          [
            svgEl('rect', { x: x - 3, y: 0, width: 6, height: altoT, fill: 'transparent', class: 'cursor-zona' }),
            svgEl('rect', { x: x - 2.6, y: 0.4, width: 5.2, height: 5, rx: 1, fill: COLOR[k], class: 'cursor-asa' }),
            svgEl('text', { x, y: 4, 'text-anchor': 'middle', 'font-size': 3.4, 'font-weight': 600, fill: '#ffffff', 'font-family': 'IBM Plex Sans, sans-serif', 'pointer-events': 'none' }, k),
          ],
          (d) => moverVertical(k, pos[k] + d)),
      );
      for (const tira of geo.tiras) {
        const v = r.derivaciones[tira.d][pos[k]];
        if (Number.isFinite(v)) capaCursores.append(svgEl('circle', { cx: x, cy: tira.base - v * geo.mmPorMV, r: 0.7, fill: COLOR[k], 'pointer-events': 'none' }));
      }
    }
    if (geo.una) {
      for (const k of ['C', 'D']) {
        const y = yDe(pos[k]);
        capaCursores.append(
          svgEl('line', { x1: MARGEN_IZQ - 4, y1: y, x2: geo.ancho, y2: y, stroke: COLOR[k], 'stroke-width': 0.3, 'stroke-dasharray': '1.6 0.8', class: 'cursor-linea' }),
          asa(k, { 'aria-label': `Cursor ${k}`, 'aria-valuemin': -5, 'aria-valuemax': 5, 'aria-valuenow': pos[k].toFixed(2), 'aria-valuetext': `${k} en ${num(pos[k], 2)} mV` },
            [
              svgEl('rect', { x: MARGEN_IZQ - 5, y: y - 2.5, width: geo.ancho - MARGEN_IZQ + 5, height: 5, fill: 'transparent', class: 'cursor-zona cursor-zona-h' }),
              svgEl('rect', { x: MARGEN_IZQ - 5, y: y - 2.2, width: 4.6, height: 4.4, rx: 1, fill: COLOR[k], class: 'cursor-asa-h' }),
              svgEl('text', { x: MARGEN_IZQ - 2.7, y: y + 1.2, 'text-anchor': 'middle', 'font-size': 3.2, 'font-weight': 600, fill: '#ffffff', 'font-family': 'IBM Plex Sans, sans-serif', 'pointer-events': 'none' }, k),
            ],
            (d) => moverHorizontal(k, pos[k] + d * 0.01)),
        );
      }
    }
    if (enfocado) capaCursores.querySelector(`[data-cursor="${enfocado}"]`)?.focus({ preventScroll: true });
    actualizarLectura();
  }

  function moverVertical(k, i) {
    pos[k] = Math.max(0, Math.min(fuente.n - 1, Math.round(i)));
    dibujarCursores();
    asegurarVisible(xDe(pos[k]));
  }
  function moverHorizontal(k, v) {
    pos[k] = Math.max(-5, Math.min(5, Math.round(v * 100) / 100));
    dibujarCursores();
  }

  function asegurarVisible(xmm) {
    const px = xmm * PX_POR_MM * zoom;
    const margen = 40;
    if (px < contenedor.scrollLeft + margen) contenedor.scrollLeft = Math.max(0, px - margen);
    else if (px > contenedor.scrollLeft + contenedor.clientWidth - margen) contenedor.scrollLeft = px - contenedor.clientWidth + margen;
  }

  // ------------------------------------------------------------------ puntero
  function alTocarPapel(ev) {
    if (ev.target.closest?.('.cursor-asa-g')) return;
    const p = puntoSVG(svg, ev.clientX, ev.clientY);
    if (!p || p.u < MARGEN_IZQ - 2) return;
    const i = ((p.u - geo.x0) / geo.mmPorS) * fuente.fs;
    const k = Math.abs(i - pos.A) <= Math.abs(i - pos.B) ? 'A' : 'B';
    moverVertical(k, i);
  }

  function iniciarArrastre(ev, k) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const objetivo = ev.currentTarget;
    objetivo.focus({ preventScroll: true });
    const mover = (e) => {
      const p = puntoSVG(svg, e.clientX, e.clientY);
      if (!p) return;
      if (k === 'A' || k === 'B') moverVertical(k, ((p.u - geo.x0) / geo.mmPorS) * fuente.fs);
      else moverHorizontal(k, (geo.tiras[0].base - p.v) / geo.mmPorMV);
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  // ------------------------------------------------------------------ lectura
  let temporizador = null;
  function actualizarLectura() {
    const r = fuente;
    const tA = pos.A / r.fs;
    const tB = pos.B / r.fs;
    const dt = Math.abs(tB - tA);
    const fc = dt >= 0.25 ? 60 / dt : null;
    vaciar(lectura).append(
      el('div', {}, el('span', { class: 'chip-cursor', style: `background:${COLOR.A}` }, 'A'), ` ${num(tA, 3)} s`),
      el('div', {}, el('span', { class: 'chip-cursor', style: `background:${COLOR.B}` }, 'B'), ` ${num(tB, 3)} s`),
      el('div', {}, 'Δt = ', el('strong', {}, `${num(dt * 1000, 0)} ms`)),
      el('div', {}, 'FC equivalente = ', el('strong', {}, fc ? `${num(fc, 1)} lpm` : '—')),
    );
    if (geo.una) {
      lectura.append(
        el('div', {}, el('span', { class: 'chip-cursor', style: `background:${COLOR.C}` }, 'C'), ` ${num(pos.C, 2)} mV`),
        el('div', {}, el('span', { class: 'chip-cursor', style: `background:${COLOR.D}` }, 'D'), ` ${num(pos.D, 2)} mV`),
        el('div', {}, 'ΔV (D − C) = ', el('strong', {}, `${num(pos.D - pos.C, 2)} mV`)),
      );
    }
    const filas = geo.tiras.map(({ d }) => {
      const vA = r.derivaciones[d][pos.A];
      const vB = r.derivaciones[d][pos.B];
      return el('tr', {}, el('td', { class: 'mono' }, d), el('td', {}, `${num(vA, 3)} mV`), el('td', {}, `${num(vB, 3)} mV`), el('td', {}, `${num(vB - vA, 3)} mV`));
    });
    vaciar(tabla).append(
      el('table', { class: 'tabla-entradas tabla-cursores' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Derivación'), el('th', { scope: 'col' }, 'Valor en A'), el('th', { scope: 'col' }, 'Valor en B'), el('th', { scope: 'col' }, 'B − A'))),
        el('tbody', {}, filas)),
    );
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      resumenVivo.textContent = `Δt ${num(dt * 1000, 0)} milisegundos${fc ? `, frecuencia equivalente ${num(fc, 0)} latidos por minuto` : ''}${geo.una ? `, diferencia de voltaje ${num(pos.D - pos.C, 2)} milivoltios` : ''}.`;
    }, 500);
  }

  // ------------------------------------------------------------------ controles
  selFuente.addEventListener('change', () => almacen.actualizar({ fuenteCursores: selFuente.value }));
  selGrupo.addEventListener('change', () => {
    grupo = GRUPOS_CURSORES.find((g) => g.id === selGrupo.value);
    dibujar();
  });
  selZoom.addEventListener('change', () => {
    zoom = Number(selZoom.value);
    dibujar();
  });

  almacen.suscribir((e, a) => {
    if (e.registros !== a.registros || e.congelada !== a.congelada || e.fuenteCursores !== a.fuenteCursores) {
      if (activo) actualizarFuentes();
    }
  });

  return {
    activar() {
      activo = true;
      actualizarFuentes(true);
    },
    desactivar() {
      activo = false;
    },
    /** Elige la derivación que se mide (p. ej., desde otra herramienta). */
    elegirDerivacion(id) {
      if (!GRUPOS_CURSORES.some((g) => g.id === id)) return;
      selGrupo.value = id;
      grupo = GRUPOS_CURSORES.find((g) => g.id === id);
      dibujar();
    },
    /** Posiciones actuales (pruebas). */
    posiciones: () => ({ ...pos }),
  };
}
