/**
 * Montaje: qué electrodos hay sobre el paciente, dónde están y qué cable va a cada uno.
 *
 * Todas las funciones son puras: reciben un montaje y devuelven uno NUEVO (no modifican el original).
 * Así la interfaz puede detectar cambios y las pruebas son sencillas.
 *
 * Estructura:
 * {
 *   cableTroncal: boolean,                     // cable de paciente conectado al equipo
 *   electrodos: { [id]: { id, tipo: 'pinza'|'adhesivo', sitio } },
 *   cables: { RA: idElectrodo|null, LA: …, …, V6: … },
 *   contador: number                           // para generar identificadores
 * }
 */
import { ENTRADAS } from '../modelo/derivaciones.js';
import { ELECTRODOS_EN_BANDEJA } from '../config/electrodos.js';
import { validarSitioParaTipo, normalizarSitio } from './sitios.js';

export function montajeVacio() {
  return {
    cableTroncal: false,
    electrodos: {},
    cables: Object.fromEntries(ENTRADAS.map((e) => [e, null])),
    contador: 0,
  };
}

/** Electrodos que quedan en la bandeja. */
export function disponibles(m) {
  const usados = { pinza: 0, adhesivo: 0 };
  for (const e of Object.values(m.electrodos)) usados[e.tipo]++;
  return {
    pinza: ELECTRODOS_EN_BANDEJA.pinza - usados.pinza,
    adhesivo: ELECTRODOS_EN_BANDEJA.adhesivo - usados.adhesivo,
  };
}

/**
 * Coloca un electrodo de la bandeja en un sitio.
 * @returns {{montaje?: object, id?: string, error?: string}}
 */
export function colocarElectrodo(m, tipo, sitio) {
  if (disponibles(m)[tipo] <= 0) {
    return { error: tipo === 'pinza' ? 'No quedan pinzas en la bandeja.' : 'No quedan electrodos adhesivos en la bandeja.' };
  }
  const val = validarSitioParaTipo(tipo, sitio);
  if (!val.ok) return { error: val.motivo };
  const id = `e${m.contador + 1}`;
  return {
    id,
    montaje: {
      ...m,
      contador: m.contador + 1,
      electrodos: { ...m.electrodos, [id]: { id, tipo, sitio: normalizarSitio(tipo, sitio) } },
    },
  };
}

/** Mueve un electrodo ya colocado (sus cables lo acompañan). */
export function moverElectrodo(m, id, sitio) {
  const e = m.electrodos[id];
  if (!e) return { error: 'Ese electrodo no está colocado.' };
  const val = validarSitioParaTipo(e.tipo, sitio);
  if (!val.ok) return { error: val.motivo };
  return { montaje: { ...m, electrodos: { ...m.electrodos, [id]: { ...e, sitio: normalizarSitio(e.tipo, sitio) } } } };
}

/** Retira un electrodo del paciente (vuelve a la bandeja) y suelta los cables enganchados a él. */
export function retirarElectrodo(m, id) {
  if (!m.electrodos[id]) return m;
  const electrodos = { ...m.electrodos };
  delete electrodos[id];
  const cables = { ...m.cables };
  for (const entrada of ENTRADAS) if (cables[entrada] === id) cables[entrada] = null;
  return { ...m, electrodos, cables };
}

/** Engancha el terminal de un cable a un electrodo (un electrodo puede recibir más de un cable, como en la realidad). */
export function conectarCable(m, entrada, id) {
  if (!m.electrodos[id]) return m;
  return { ...m, cables: { ...m.cables, [entrada]: id } };
}

export function desconectarCable(m, entrada) {
  return { ...m, cables: { ...m.cables, [entrada]: null } };
}

export function conectarTroncal(m, conectado = true) {
  return { ...m, cableTroncal: conectado };
}

/** Entradas cuyos cables están enganchados a un electrodo. */
export function entradasDeElectrodo(m, id) {
  return ENTRADAS.filter((e) => m.cables[e] === id);
}

/** Primer electrodo colocado en un sitio de cierto tipo de zona sin cable (útil para el teclado). */
export function electrodosSinCable(m) {
  const conCable = new Set(Object.values(m.cables).filter(Boolean));
  return Object.values(m.electrodos).filter((e) => !conCable.has(e.id));
}

/** Copia profunda segura para guardar en almacenamiento local. */
export function serializarMontaje(m) {
  return JSON.parse(JSON.stringify(m));
}

/** Valida un montaje leído del almacenamiento (devuelve null si no es válido). */
export function deserializarMontaje(obj) {
  try {
    if (!obj || typeof obj !== 'object' || !obj.electrodos || !obj.cables) return null;
    const m = montajeVacio();
    m.cableTroncal = Boolean(obj.cableTroncal);
    m.contador = Number(obj.contador) || 0;
    for (const [id, e] of Object.entries(obj.electrodos)) {
      if (!e || !['pinza', 'adhesivo'].includes(e.tipo) || !e.sitio || !e.sitio.zona) continue;
      m.electrodos[id] = { id, tipo: e.tipo, sitio: { ...e.sitio } };
    }
    for (const entrada of ENTRADAS) {
      const id = obj.cables[entrada];
      m.cables[entrada] = id && m.electrodos[id] ? id : null;
    }
    const d = disponibles(m);
    if (d.pinza < 0 || d.adhesivo < 0) return null;
    return m;
  } catch {
    return null;
  }
}
