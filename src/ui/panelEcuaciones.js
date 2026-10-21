/**
 * Herramienta «Ecuaciones»: cómo calcula el equipo la derivación elegida con la conexión ACTUAL.
 *
 * Muestra la fórmula del equipo, la misma fórmula con el sitio del cuerpo que lee cada entrada y una tabla con
 * esas entradas. No dice si la derivación quedó «bien» o «mal»: deducir el efecto de una conexión incorrecta a
 * partir de la ecuación y comprobarlo en el trazado es parte de las actividades de la guía.
 */
import { el, vaciar, $ } from './dom.js';
import { DERIVACIONES, DEPENDENCIAS } from '../modelo/derivaciones.js';
import { resolverEntradas } from '../conexiones/entradas.js';
import { validezDerivaciones } from '../conexiones/diagnostico.js';
import { describirSitio } from '../conexiones/sitios.js';
import { CABLES } from '../config/electrodos.js';

/** Plantilla de cada fórmula; f(entrada) devuelve el texto de cada término. */
function plantilla(d, f) {
  switch (d) {
    case 'I': return `${f('LA')} − ${f('RA')}`;
    case 'II': return `${f('LL')} − ${f('RA')}`;
    case 'III': return `${f('LL')} − ${f('LA')}`;
    case 'aVR': return `${f('RA')} − [${f('LA')} + ${f('LL')}] / 2`;
    case 'aVL': return `${f('LA')} − [${f('RA')} + ${f('LL')}] / 2`;
    case 'aVF': return `${f('LL')} − [${f('RA')} + ${f('LA')}] / 2`;
    default: return `${f(d)} − TCW`;
  }
}
const plantillaTCW = (f) => `[${f('RA')} + ${f('LA')} + ${f('LL')}] / 3`;
const etq = (e) => CABLES.etiqueta[e];

/**
 * @param {{almacen: object, torax: object}} op
 */
export function crearPanelEcuaciones({ almacen, torax }) {
  const panel = $('herr-ecuaciones');
  const selector = el('div', { class: 'selector-derivaciones', role: 'group', 'aria-label': 'Derivación' });
  const cuerpo = el('div', { class: 'ecuaciones-cuerpo' });
  for (const d of DERIVACIONES) {
    selector.append(el('button', { type: 'button', 'data-derivacion': d, 'aria-pressed': 'false', onclick: () => almacen.actualizar({ derivacionSeleccionada: d }) }, d));
  }
  panel.append(
    el('p', { class: 'ayuda' }, 'Elija una derivación para ver cómo la calcula el equipo con los cables tal como están enganchados ahora. Φ(…) es el potencial del sitio del cuerpo que lee cada entrada.'),
    selector,
    cuerpo,
  );
  let activo = false;

  const corto = (sitio) => describirSitio(sitio, torax).replace('tórax: ', '').replace('espacio intercostal', 'EIC');

  function render() {
    const e = almacen.obtener();
    const d = e.derivacionSeleccionada;
    for (const b of selector.children) b.setAttribute('aria-pressed', String(b.dataset.derivacion === d));
    const entradas = resolverEntradas(e.montaje, { encendido: e.ajustes.encendido });
    const validez = validezDerivaciones(entradas);
    const deps = DEPENDENCIAS[d];
    const precordial = d.startsWith('V');

    const formula = [`${d} = ${plantilla(d, (x) => `Φ(${etq(x)})`)}`];
    if (precordial) formula.push(`TCW = ${plantillaTCW((x) => `Φ(${etq(x)})`)}`);

    const sustituir = (x) => (entradas[x].sitio ? `Φ(${corto(entradas[x].sitio)})` : `Φ(${etq(x)}: sin electrodo)`);
    const conexion = [`${d} = ${plantilla(d, sustituir)}`];
    if (precordial) conexion.push(`TCW = ${plantillaTCW(sustituir)}`);

    // Tabla: qué lee cada entrada que interviene
    const filas = deps.map((x) => {
      const r = entradas[x];
      return el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'punto-color', style: `background:${CABLES.color[x]}`, 'aria-hidden': 'true' }), el('span', { class: 'mono' }, etq(x))),
        el('td', {}, r.sitio ? describirSitio(r.sitio, torax) : 'sin electrodo enganchado'),
      );
    });

    const bloques = [
      el('h3', { class: 'subtitulo' }, 'Fórmula del equipo'),
      el('pre', { class: 'ecuacion' }, formula.join('\n')),
      el('h3', { class: 'subtitulo' }, 'Con la conexión actual'),
      el('p', { class: 'ecuacion ecuacion-flexible' }, conexion.join('\n')),
      el('div', { class: 'contenedor-tabla' },
        el('table', { class: 'tabla-entradas' },
          el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Entrada'), el('th', { scope: 'col' }, 'Electrodo enganchado en'))),
          el('tbody', {}, filas))),
    ];
    if (!validez[d].valida) {
      let motivo;
      if (!e.ajustes.encendido) motivo = 'el equipo está apagado.';
      else if (!e.montaje.cableTroncal) motivo = 'el cable de paciente no está conectado al equipo.';
      else motivo = `falta la señal de ${validez[d].faltan.filter((x) => x !== 'RL').map(etq).join(', ')}.`;
      bloques.push(el('p', { class: 'conclusion aviso' }, `El equipo no puede calcular ${d}: ${motivo}`));
    }
    bloques.push(
      el('p', { class: 'ayuda' }, precordial
        ? 'La terminal central de Wilson (TCW) es el promedio de RA, LA y LL. RL no aparece en ninguna fórmula: es la referencia del amplificador.'
        : `${etq('RL')} no aparece en ninguna fórmula: es la referencia del amplificador.`),
    );
    vaciar(cuerpo).append(...bloques);
  }

  almacen.suscribir((e, a) => {
    if (!activo) return;
    if (e.montaje !== a.montaje || e.derivacionSeleccionada !== a.derivacionSeleccionada || e.ajustes.encendido !== a.ajustes.encendido) render();
  });

  return {
    activar() {
      activo = true;
      render();
    },
    desactivar() {
      activo = false;
    },
  };
}
