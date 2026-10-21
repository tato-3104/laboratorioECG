/**
 * Montajes de referencia: el montaje correcto y montajes con un error concreto.
 *
 * La interfaz NO los usa (en la versión 2 el estudiante coloca todo a mano). Sirven para las pruebas
 * automáticas, para calcular los valores de referencia de la guía del docente (tools/valores-referencia.mjs)
 * y para generar las figuras de las guías.
 */
import { montajeVacio, colocarElectrodo, conectarCable, conectarTroncal, desconectarCable, retirarElectrodo } from './montaje.js';
import { sitioPinzaHabitual } from './sitios.js';

const PINZAS = { RA: 'brazo_der', LA: 'brazo_izq', LL: 'pierna_izq', RL: 'pierna_der' };
const PRECORDIALES = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Montaje correcto: pinzas en muñecas y tobillos, precordiales en sus posiciones normalizadas.
 * @param {object} torax  resultado de crearTorax()
 * @param {Record<string, {x:number, y:number}>} [posPrecordiales]  posiciones alternativas
 */
export function montajeCorrecto(torax, posPrecordiales = {}) {
  let m = conectarTroncal(montajeVacio(), true);
  for (const [entrada, zona] of Object.entries(PINZAS)) {
    const r = colocarElectrodo(m, 'pinza', sitioPinzaHabitual(zona));
    m = conectarCable(r.montaje, entrada, r.id);
  }
  for (const v of PRECORDIALES) {
    const p = posPrecordiales[v] ?? torax.posicionesEstandar[v];
    const r = colocarElectrodo(m, 'adhesivo', { zona: 'torso', x: p.x, y: p.y });
    m = conectarCable(r.montaje, v, r.id);
  }
  return m;
}

/** Intercambia los electrodos a los que van dos cables. */
export function intercambiarCables(m, a, b) {
  return { ...m, cables: { ...m.cables, [a]: m.cables[b], [b]: m.cables[a] } };
}

/** Posiciones de V1 y V2 dos espacios intercostales más arriba (2.º EIC). */
export function posicionesV1V2Altas(torax) {
  const g = torax.g;
  return {
    V1: { x: -g.xParaesternal, y: torax.yEIC(2, g.xParaesternal) },
    V2: { x: g.xParaesternal, y: torax.yEIC(2, g.xParaesternal) },
  };
}

/** Montajes con nombre: { id, nombre, crear(torax) → montaje }. */
export const MONTAJES = [
  { id: 'correcto', nombre: 'Montaje correcto', crear: (t) => montajeCorrecto(t) },
  { id: 'sin-troncal', nombre: 'Cable de paciente sin conectar', crear: (t) => conectarTroncal(montajeCorrecto(t), false) },
  { id: 'ra-la', nombre: 'Cables RA y LA intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'RA', 'LA') },
  { id: 'ra-ll', nombre: 'Cables RA y LL intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'RA', 'LL') },
  { id: 'la-ll', nombre: 'Cables LA y LL intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'LA', 'LL') },
  { id: 'ra-rl', nombre: 'Cables RA y RL intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'RA', 'RL') },
  { id: 'la-rl', nombre: 'Cables LA y RL intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'LA', 'RL') },
  { id: 'll-rl', nombre: 'Cables LL y RL intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'LL', 'RL') },
  {
    id: 'bilateral',
    nombre: 'Inversión brazo–pierna bilateral (LA↔LL y RA↔RL)',
    crear: (t) => intercambiarCables(intercambiarCables(montajeCorrecto(t), 'LA', 'LL'), 'RA', 'RL'),
  },
  { id: 'v1-v2', nombre: 'Cables V1 y V2 intercambiados', crear: (t) => intercambiarCables(montajeCorrecto(t), 'V1', 'V2') },
  { id: 'la-suelto', nombre: 'Cable LA desenganchado', crear: (t) => desconectarCable(montajeCorrecto(t), 'LA') },
  {
    id: 'v4-suelto',
    nombre: 'Sin electrodo V4',
    crear: (t) => {
      const m = montajeCorrecto(t);
      return retirarElectrodo(m, m.cables.V4);
    },
  },
  {
    id: 'sin-rl',
    nombre: 'Sin electrodo RL',
    crear: (t) => {
      const m = montajeCorrecto(t);
      return retirarElectrodo(m, m.cables.RL);
    },
  },
  { id: 'v1v2-altos', nombre: 'V1 y V2 en el 2.º espacio intercostal', crear: (t) => montajeCorrecto(t, posicionesV1V2Altas(t)) },
  {
    id: 'v5v6-eic',
    nombre: 'V5 y V6 siguiendo el 5.º espacio intercostal',
    crear: (t) => {
      const g = t.g;
      return montajeCorrecto(t, {
        V5: { x: g.xAxilarAnterior, y: t.yEIC(5, g.xAxilarAnterior) },
        V6: { x: g.xAxilarMedia, y: t.yEIC(5, g.xAxilarMedia) },
      });
    },
  },
  {
    id: 'ra-la-compartido',
    nombre: 'RA y LA en el mismo electrodo',
    crear: (t) => {
      let m = montajeCorrecto(t);
      const idLA = m.cables.LA;
      m = conectarCable(m, 'LA', m.cables.RA);
      return retirarElectrodo(m, idLA);
    },
  },
];

export function montajeConNombre(id, torax) {
  const m = MONTAJES.find((x) => x.id === id);
  if (!m) throw new Error(`Montaje desconocido: ${id}`);
  return m.crear(torax);
}
