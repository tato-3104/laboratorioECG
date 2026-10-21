/**
 * Utilidades pequeñas para construir la interfaz sin bibliotecas.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Crea un elemento HTML.
 * @param {string} etiqueta
 * @param {Record<string, any>} [atributos]  'class', 'texto', 'html', 'on<Evento>' y atributos normales
 * @param {...(Node|string|null|undefined|false)} hijos
 */
export function el(etiqueta, atributos = {}, ...hijos) {
  return construir(document.createElement(etiqueta), atributos, hijos);
}

/** Crea un elemento SVG. */
export function svgEl(etiqueta, atributos = {}, ...hijos) {
  return construir(document.createElementNS(SVG_NS, etiqueta), atributos, hijos);
}

function construir(nodo, atributos, hijos) {
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'texto') nodo.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else nodo.setAttribute(k === 'className' ? 'class' : k, v === true ? '' : String(v));
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return nodo;
}

/** Vacía un nodo. */
export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  return nodo;
}

/** Atajo para document.getElementById. */
export const $ = (id) => document.getElementById(id);

/** Número con coma decimal, como se escribe en Colombia. */
export function num(v, decimales = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(decimales).replace('.', ',').replace('-', '−');
}

let temporizadorAnuncio = null;
/** Anuncia un texto a los lectores de pantalla (región aria-live). */
export function anunciar(texto) {
  const nodo = $('anuncios');
  if (!nodo) return;
  clearTimeout(temporizadorAnuncio);
  nodo.textContent = '';
  temporizadorAnuncio = setTimeout(() => {
    nodo.textContent = texto;
  }, 60);
}

let temporizadorAviso = null;
/** Aviso flotante breve. */
export function avisar(texto, ms = 3200) {
  const nodo = $('aviso-flotante');
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    nodo.hidden = true;
  }, ms);
}

/** Convierte coordenadas de pantalla a coordenadas del SVG. */
export function puntoSVG(svg, clienteX, clienteY) {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clienteX, clienteY).matrixTransform(m.inverse());
  return { u: p.x, v: p.y };
}

/** Pone aria-pressed en un grupo de botones según una función. */
export function marcarPresionados(botones, esPresionado) {
  for (const b of botones) b.setAttribute('aria-pressed', String(Boolean(esPresionado(b))));
}
