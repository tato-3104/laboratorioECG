/**
 * Diagnóstico del montaje:
 *  - validezDerivaciones(): qué derivaciones puede calcular el equipo (detección de electrodo suelto).
 *  - mensajesEquipo(): lo que el equipo muestra en su pantalla.
 *  - diagnosticarMontaje(): errores que el equipo NO detecta (inversiones, malas ubicaciones). Lo usa el
 *    botón «Revisar montaje» (a pedido, como cuando el docente revisa la colocación) y la clasificación
 *    de la condición de cada registro (src/procedimiento/condiciones.js).
 */
import { DERIVACIONES, DEPENDENCIAS, ENTRADAS } from '../modelo/derivaciones.js';
import { ZONA_ESPERADA, NOMBRE_ZONA, ENTRADAS_EXTREMIDADES, ENTRADAS_PRECORDIALES, etiquetaCable } from '../config/electrodos.js';
import { EQUIPO } from '../config/equipo.js';
import { describirSitio } from './sitios.js';

/** Comportamiento del equipo cuando falta RL (config/equipo.js). */
export const PERFIL_EQUIPO = Object.freeze({ rlSuelto: EQUIPO.perfilRL });

/**
 * @param {Record<string, {estado: string}>} entradas  resultado de resolverEntradas()
 * @param {{rlSuelto?: 'interferencia'|'invalidar'}} [perfil]  comportamiento del equipo sin RL
 * @returns {Record<string, {valida: boolean, faltan: string[]}>}
 */
export function validezDerivaciones(entradas, perfil = PERFIL_EQUIPO) {
  const sinRL = entradas.RL.estado !== 'conectada';
  const res = {};
  for (const d of DERIVACIONES) {
    const faltan = DEPENDENCIAS[d].filter((e) => entradas[e].estado !== 'conectada');
    if (sinRL && perfil.rlSuelto === 'invalidar') faltan.push('RL');
    res[d] = { valida: faltan.length === 0, faltan };
  }
  return res;
}

/** Lista de derivaciones en forma compacta: «I, III, aVR, aVL, aVF y V1–V6». */
export function listaDerivaciones(nombres) {
  const orden = DERIVACIONES.filter((d) => nombres.includes(d));
  const partes = [];
  const prec = orden.filter((d) => d.startsWith('V'));
  const ext = orden.filter((d) => !d.startsWith('V'));
  partes.push(...ext);
  if (prec.length === 6) partes.push('V1–V6');
  else partes.push(...prec);
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Une nombres en español: «RA», «RA y LA», «RA, LA y V4». */
function unir(lista) {
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

/**
 * Mensajes de la pantalla del equipo.
 * @param {object} entradas  resultado de resolverEntradas()
 * @param {{etiqueta?: (e:string)=>string, perfil?: object}} [op]
 * @returns {{nivel: 'ok'|'aviso'|'info', texto: string}[]}
 */
export function mensajesEquipo(entradas, op = {}) {
  const etq = op.etiqueta ?? etiquetaCable;
  const perfil = op.perfil ?? PERFIL_EQUIPO;
  const estados = ENTRADAS.map((e) => entradas[e].estado);
  if (estados.every((s) => s === 'apagado')) return [];
  if (estados.every((s) => s === 'sin-troncal')) {
    return [{ nivel: 'aviso', texto: 'Conecte el cable de paciente al equipo' }];
  }
  const sueltas = ENTRADAS.filter((e) => entradas[e].estado !== 'conectada');
  if (sueltas.length === ENTRADAS.length) {
    return [{ nivel: 'aviso', texto: 'Sin electrodos: coloque los electrodos y enganche los cables' }];
  }
  const msgs = [];
  const sueltasSinRL = sueltas.filter((e) => e !== 'RL');
  if (sueltasSinRL.length) {
    const val = validezDerivaciones(entradas, {});
    const perdidas = DERIVACIONES.filter((d) => !val[d].valida);
    const verbo = sueltasSinRL.length === 1 ? 'desconectado' : 'desconectados';
    let texto = `${unir(sueltasSinRL.map(etq))} ${verbo}`;
    if (perdidas.length === DERIVACIONES.length) texto += ' · ninguna derivación disponible';
    else if (perdidas.length) texto += ` · sin señal en ${listaDerivaciones(perdidas)}`;
    msgs.push({ nivel: 'aviso', texto });
  }
  if (sueltas.includes('RL')) {
    msgs.push({
      nivel: 'aviso',
      texto:
        perfil.rlSuelto === 'invalidar'
          ? `${etq('RL')} (referencia) desconectado · sin registro`
          : `${etq('RL')} (referencia) desconectado · interferencia de red elevada`,
    });
  }
  if (!msgs.length) msgs.push({ nivel: 'ok', texto: 'Conexión completa · 10 de 10 electrodos con señal' });
  return msgs;
}

/**
 * Errores de conexión y ubicación que el equipo no detecta (o que explica de forma incompleta).
 * @param {object} montaje
 * @param {object} torax  resultado de crearTorax()
 * @param {(e:string)=>string} [etiqueta]
 * @returns {{correcto: boolean, errores: {tipo: string, entradas: string[], texto: string}[]}}
 */
export function diagnosticarMontaje(montaje, torax, etiqueta = etiquetaCable) {
  const etq = etiqueta;
  const errores = [];
  if (!montaje.cableTroncal) {
    errores.push({ tipo: 'troncal', entradas: [], texto: 'El cable de paciente no está conectado al equipo.' });
  }
  const sitioDe = (entrada) => {
    const id = montaje.cables[entrada];
    return id ? montaje.electrodos[id]?.sitio ?? null : null;
  };

  // Cables sin electrodo
  for (const e of ENTRADAS) {
    if (!montaje.cables[e]) {
      errores.push({ tipo: 'sin-cable', entradas: [e], texto: `El cable ${etq(e)} no está enganchado a ningún electrodo.` });
    }
  }

  // Varios cables en un mismo electrodo
  const porElectrodo = {};
  for (const e of ENTRADAS) {
    const id = montaje.cables[e];
    if (id) (porElectrodo[id] ??= []).push(e);
  }
  for (const [id, lista] of Object.entries(porElectrodo)) {
    if (lista.length > 1) {
      const sitio = montaje.electrodos[id]?.sitio;
      errores.push({
        tipo: 'compartido',
        entradas: lista,
        texto: `Los cables ${unir(lista.map(etq))} están enganchados al mismo electrodo (${describirSitio(sitio, torax)}).`,
      });
    }
  }

  // Extremidades
  const malExt = {};
  for (const e of ENTRADAS_EXTREMIDADES) {
    const s = sitioDe(e);
    if (s && s.zona !== ZONA_ESPERADA[e]) malExt[e] = s.zona;
  }
  const tratadas = new Set();
  const lista = Object.keys(malExt);
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i];
      const b = lista[j];
      if (tratadas.has(a) || tratadas.has(b)) continue;
      if (malExt[a] === ZONA_ESPERADA[b] && malExt[b] === ZONA_ESPERADA[a]) {
        const pierna = (a === 'LL' && b === 'RL') || (a === 'RL' && b === 'LL');
        errores.push({
          tipo: 'intercambio',
          entradas: [a, b],
          texto:
            `Los cables ${etq(a)} y ${etq(b)} están intercambiados.` +
            (pierna ? ' Como ambas piernas tienen casi el mismo potencial, esta inversión no cambia el trazado.' : ''),
        });
        tratadas.add(a);
        tratadas.add(b);
      }
    }
  }
  for (const e of lista) {
    if (tratadas.has(e)) continue;
    const zona = malExt[e];
    const tipo = zona === 'torso' ? 'extremidad-en-torax' : 'extremidad-equivocada';
    errores.push({
      tipo,
      entradas: [e],
      texto: `El cable ${etq(e)} está en ${zona === 'torso' ? 'un electrodo del tórax' : `el ${NOMBRE_ZONA[zona]}`}; debe ir en el ${NOMBRE_ZONA[ZONA_ESPERADA[e]]}.`,
    });
  }

  // Precordiales
  const tol = torax.g.toleranciaPrecordialCm;
  const pos = torax.posicionesEstandar;
  const dist = (s, v) => Math.hypot(s.x - pos[v].x, s.y - pos[v].y);
  const prec = {};
  for (const e of ENTRADAS_PRECORDIALES) {
    const s = sitioDe(e);
    if (!s) continue;
    if (s.zona !== 'torso') {
      errores.push({
        tipo: 'precordial-en-extremidad',
        entradas: [e],
        texto: `El cable ${etq(e)} está en un electrodo del ${NOMBRE_ZONA[s.zona]}; debe ir en el tórax.`,
      });
      continue;
    }
    if (dist(s, e) > tol) prec[e] = s;
  }
  const tratadasV = new Set();
  const listaV = Object.keys(prec);
  for (const a of listaV) {
    if (tratadasV.has(a)) continue;
    const otro = ENTRADAS_PRECORDIALES.find((b) => b !== a && dist(prec[a], b) <= tol);
    if (otro && prec[otro] && dist(prec[otro], a) <= tol) {
      errores.push({ tipo: 'precordial-intercambio', entradas: [a, otro], texto: `Los cables ${etq(a)} y ${etq(otro)} están intercambiados.` });
      tratadasV.add(a);
      tratadasV.add(otro);
    }
  }
  for (const a of listaV) {
    if (tratadasV.has(a)) continue;
    const s = prec[a];
    const otro = ENTRADAS_PRECORDIALES.find((b) => b !== a && dist(s, b) <= tol);
    if (otro) {
      errores.push({ tipo: 'precordial-en-otra-posicion', entradas: [a], texto: `${etq(a)} está en la posición que corresponde a ${etq(otro)}.` });
      continue;
    }
    const dEIC = torax.numeroEIC(s.x, s.y) - torax.numeroEIC(pos[a].x, pos[a].y);
    const partes = [];
    if (Math.abs(dEIC) >= 0.4) {
      const n = Math.abs(dEIC);
      const nTxt = n >= 0.75 ? `${Math.round(n)} espacio${Math.round(n) === 1 ? '' : 's'} intercostal${Math.round(n) === 1 ? '' : 'es'}` : 'medio espacio intercostal';
      partes.push(`${nTxt} más ${dEIC < 0 ? 'arriba' : 'abajo'}`);
    }
    const dx = s.x - pos[a].x;
    if (Math.abs(dx) >= 1) partes.push(`${Math.abs(dx).toFixed(1).replace('.', ',')} cm más hacia la ${dx > 0 ? 'izquierda' : 'derecha'} del paciente`);
    errores.push({
      tipo: 'precordial-desplazada',
      entradas: [a],
      texto: `${etq(a)} está fuera de su posición (${partes.join(' y ') || 'desplazado'}). Está en ${describirSitio(s, torax).replace('tórax: ', '')}.`,
    });
  }
  return { correcto: errores.length === 0, errores };
}
