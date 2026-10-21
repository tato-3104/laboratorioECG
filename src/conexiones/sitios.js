/**
 * Sitios anatómicos: dónde puede estar un electrodo y cómo se describe en palabras.
 *
 * Un sitio es un objeto:
 *   { zona: 'brazo_der' | 'brazo_izq' | 'pierna_der' | 'pierna_izq', u, v }   (extremidades; u, v en la vista de cuerpo)
 *   { zona: 'torso', x, y }                                                   (tórax; x, y en cm, ver config/anatomia.js)
 */
import { VISTA_CUERPO, VISTA_TORAX } from '../config/anatomia.js';

const EXTREMIDADES = ['brazo_der', 'brazo_izq', 'pierna_der', 'pierna_izq'];

/** Distancia de un punto a un segmento y parámetro de la proyección (0…1). */
export function proyeccionSegmento(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { distancia: Math.hypot(p[0] - q[0], p[1] - q[1]), t, punto: q };
}

/** Prueba de pertenencia de un punto a un polígono (regla par-impar). */
export function puntoEnPoligono(p, pol) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i];
    const [xj, yj] = pol[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Busca la extremidad bajo un punto de la vista de cuerpo (incluye manos y pies). */
function extremidadEn(u, v, margen = 2) {
  for (const zona of EXTREMIDADES) {
    const ext = VISTA_CUERPO.extremidades[zona];
    for (const [a, b, r] of ext.tramos) {
      if (proyeccionSegmento([u, v], a, b).distancia <= r + margen) return zona;
    }
    const e = ext.mano ?? ext.pie;
    if (((u - e.cx) / e.rx) ** 2 + ((v - e.cy) / e.ry) ** 2 <= 1) return zona;
  }
  return null;
}

/** Zona del cuerpo bajo un punto de la vista de cuerpo completo. */
export function zonaEnCuerpo(u, v) {
  const { cabeza, cuello } = VISTA_CUERPO;
  if (Math.hypot(u - cabeza.cx, v - cabeza.cy) <= cabeza.r) return 'cabeza';
  if (u >= cuello.x && u <= cuello.x + cuello.ancho && v >= cuello.y && v < 104) return 'cabeza';
  if (puntoEnPoligono([u, v], VISTA_CUERPO.troncoPoligono)) return 'torso';
  return extremidadEn(u, v);
}

/** Conversión entre la vista de cuerpo (px del SVG) y el tórax (cm). */
export function cuerpoATorax(u, v) {
  const [u0, v0] = VISTA_CUERPO.origenTorax;
  const k = VISTA_CUERPO.escalaTorax;
  return { x: (u - u0) / k, y: (v - v0) / k };
}
export function toraxACuerpo(x, y) {
  const [u0, v0] = VISTA_CUERPO.origenTorax;
  const k = VISTA_CUERPO.escalaTorax;
  return { u: u0 + k * x, v: v0 + k * y };
}

/** Conversión entre la vista ampliada del tórax (px del SVG) y el tórax (cm). */
export function vistaToraxATorax(u, v) {
  const [u0, v0] = VISTA_TORAX.origen;
  return { x: (u - u0) / VISTA_TORAX.escala, y: (v - v0) / VISTA_TORAX.escala };
}
export function toraxAVistaTorax(x, y) {
  const [u0, v0] = VISTA_TORAX.origen;
  return { u: u0 + VISTA_TORAX.escala * x, v: v0 + VISTA_TORAX.escala * y };
}

/** Lleva un punto de una extremidad a su eje (las pinzas abrazan el miembro). */
export function ajustarAEje(zona, u, v) {
  const ext = VISTA_CUERPO.extremidades[zona];
  let mejor = null;
  for (const [a, b] of ext.tramos) {
    const p = proyeccionSegmento([u, v], a, b);
    if (!mejor || p.distancia < mejor.distancia) mejor = p;
  }
  return { u: mejor.punto[0], v: mejor.punto[1] };
}

/**
 * Convierte un punto de una vista en un sitio, o explica por qué no se acepta.
 * @param {'cuerpo'|'torax'} vista
 * @param {number} u
 * @param {number} v
 * @param {object} torax  resultado de crearTorax()
 * @returns {{sitio?: object, error?: string}}
 */
export function sitioDesdeVista(vista, u, v, torax) {
  if (vista === 'torax') {
    const { x, y } = vistaToraxATorax(u, v);
    if (!torax.dentroRegion(x, y)) return { error: 'Ese punto queda fuera de la pared torácica.' };
    return { sitio: { zona: 'torso', x, y } };
  }
  const zona = zonaEnCuerpo(u, v);
  if (!zona) return { error: 'Suelte el electrodo sobre la piel del paciente.' };
  if (zona === 'cabeza') return { error: 'En este laboratorio no se colocan electrodos en la cabeza ni en el cuello.' };
  if (zona === 'torso') {
    const { x, y } = cuerpoATorax(u, v);
    if (!torax.dentroRegion(x, y)) {
      return { error: 'Los electrodos de tórax van sobre la pared torácica, entre las clavículas y el reborde costal.' };
    }
    return { sitio: { zona: 'torso', x, y } };
  }
  return { sitio: { zona, u, v } };
}

/** ¿Puede ir este tipo de electrodo en este sitio? Las pinzas solo abrazan extremidades. */
export function validarSitioParaTipo(tipo, sitio) {
  if (tipo === 'pinza' && sitio.zona === 'torso') {
    return { ok: false, motivo: 'Las pinzas solo se sujetan a brazos y piernas. Para el tórax use un electrodo adhesivo.' };
  }
  return { ok: true };
}

/** Normaliza un sitio de extremidad para una pinza (la coloca sobre el eje del miembro). */
export function normalizarSitio(tipo, sitio) {
  if (sitio.zona !== 'torso' && tipo === 'pinza') {
    const p = ajustarAEje(sitio.zona, sitio.u, sitio.v);
    return { ...sitio, u: p.u, v: p.v };
  }
  return sitio;
}

/** Nombre de la parte del miembro (muñeca, antebrazo, brazo, tobillo, pierna, muslo). */
function parteDeExtremidad(sitio) {
  const ext = VISTA_CUERPO.extremidades[sitio.zona];
  const brazo = sitio.zona.startsWith('brazo');
  const [proximal, distal] = ext.tramos;
  const pP = proyeccionSegmento([sitio.u, sitio.v], proximal[0], proximal[1]);
  const pD = proyeccionSegmento([sitio.u, sitio.v], distal[0], distal[1]);
  const e = ext.mano ?? ext.pie;
  if (((sitio.u - e.cx) / e.rx) ** 2 + ((sitio.v - e.cy) / e.ry) ** 2 <= 1 && pD.distancia > distal[2]) {
    return brazo ? 'mano' : 'pie';
  }
  if (pP.distancia <= pD.distancia) return brazo ? 'brazo' : 'muslo';
  if (pD.t > 0.72) return brazo ? 'muñeca' : 'tobillo';
  return brazo ? 'antebrazo' : 'pierna';
}

/**
 * Describe un sitio en palabras (lado = lado del paciente).
 * @param {object} sitio
 * @param {object} torax
 */
export function describirSitio(sitio, torax) {
  if (!sitio) return 'sin ubicar';
  if (sitio.zona === 'torso') return `tórax: ${torax.describir(sitio.x, sitio.y).texto}`;
  const lado = sitio.zona.endsWith('_der') ? 'derecho' : 'izquierdo';
  const ladoF = sitio.zona.endsWith('_der') ? 'derecha' : 'izquierda';
  const parte = parteDeExtremidad(sitio);
  const femenino = ['muñeca', 'pierna', 'mano'].includes(parte);
  return `${parte} ${femenino ? ladoF : lado}`;
}

/** Posición de un sitio en la vista de cuerpo (para dibujarlo). */
export function posicionEnCuerpo(sitio) {
  if (sitio.zona === 'torso') return toraxACuerpo(sitio.x, sitio.y);
  return { u: sitio.u, v: sitio.v };
}

/** Posición en la vista de tórax (null si el sitio está en una extremidad). */
export function posicionEnVistaTorax(sitio) {
  if (sitio.zona !== 'torso') return null;
  return toraxAVistaTorax(sitio.x, sitio.y);
}

/** Sitio de una pinza en su lugar habitual (muñeca o tobillo). */
export function sitioPinzaHabitual(zona) {
  const [u, v] = VISTA_CUERPO.sitiosPinza[zona];
  return { zona, u, v };
}
