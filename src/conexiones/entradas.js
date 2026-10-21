/**
 * Resolución de entradas: para cada entrada del equipo (RA, LA, …, V6), qué sitio del cuerpo "lee"
 * o si está flotante (sin contacto con el paciente).
 */
import { ENTRADAS } from '../modelo/derivaciones.js';

/**
 * @param {object} montaje
 * @param {{encendido?: boolean}} [equipo]
 * @returns {Record<string, {estado: 'conectada'|'sin-troncal'|'sin-cable'|'apagado', electrodo: string|null, sitio: object|null}>}
 */
export function resolverEntradas(montaje, equipo = {}) {
  const encendido = equipo.encendido ?? true;
  const res = {};
  for (const entrada of ENTRADAS) {
    const id = montaje.cables[entrada];
    const e = id ? montaje.electrodos[id] : null;
    let estado = 'conectada';
    if (!encendido) estado = 'apagado';
    else if (!montaje.cableTroncal) estado = 'sin-troncal';
    else if (!e) estado = 'sin-cable';
    res[entrada] = { estado, electrodo: e ? e.id : null, sitio: e ? e.sitio : null };
  }
  return res;
}

/**
 * Vector de derivación (respecto al TCW) que corresponde a un sitio.
 * @param {object} sitio
 * @param {{vectorEn: (x:number, y:number) => number[]}} campo  campo torácico
 * @param {Record<string, number[]>} extremidades  resultado de vectoresExtremidades()
 */
export function vectorDeSitio(sitio, campo, extremidades) {
  if (!sitio) return null;
  if (sitio.zona === 'torso') return campo.vectorEn(sitio.x, sitio.y);
  return extremidades[sitio.zona] ?? null;
}

/** Vector que "ve" cada entrada conectada (null si está flotante). */
export function vectoresPorEntrada(entradas, campo, extremidades) {
  const out = {};
  for (const entrada of ENTRADAS) {
    const r = entradas[entrada];
    out[entrada] = r.estado === 'conectada' ? vectorDeSitio(r.sitio, campo, extremidades) : null;
  }
  return out;
}
