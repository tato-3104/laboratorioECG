/**
 * Montaje, resolución de entradas, validez de derivaciones, mensajes del equipo y diagnóstico.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { montajeVacio, colocarElectrodo, conectarCable, retirarElectrodo, disponibles, conectarTroncal, deserializarMontaje, serializarMontaje } from '../../src/conexiones/montaje.js';
import { resolverEntradas } from '../../src/conexiones/entradas.js';
import { validezDerivaciones, mensajesEquipo, diagnosticarMontaje, listaDerivaciones } from '../../src/conexiones/diagnostico.js';
import { montajeCorrecto, MONTAJES, montajeConNombre, intercambiarCables } from '../../src/conexiones/montajes.js';
import { zonaEnCuerpo, describirSitio, sitioDesdeVista, sitioPinzaHabitual } from '../../src/conexiones/sitios.js';
import { DERIVACIONES } from '../../src/modelo/derivaciones.js';
import { torax } from './ayudas.js';

const etq = (e) => e;
const validas = (m, perfil) => {
  const v = validezDerivaciones(resolverEntradas(m), perfil);
  return DERIVACIONES.filter((d) => v[d].valida);
};

test('Montaje correcto: sin errores y 12 derivaciones', () => {
  const m = montajeCorrecto(torax);
  assert.deepEqual(validas(m), DERIVACIONES);
  assert.equal(diagnosticarMontaje(m, torax, etq).correcto, true);
  assert.deepEqual(mensajesEquipo(resolverEntradas(m), { etiqueta: etq }), [
    { nivel: 'ok', texto: 'Conexión completa · 10 de 10 electrodos con señal' },
  ]);
});

test('Electrodo suelto: solo quedan las derivaciones que no lo usan', () => {
  const sin = (e) => {
    const m = montajeCorrecto(torax);
    return { ...m, cables: { ...m.cables, [e]: null } };
  };
  assert.deepEqual(validas(sin('LA')), ['II']);
  assert.deepEqual(validas(sin('RA')), ['III']);
  assert.deepEqual(validas(sin('LL')), ['I']);
  assert.deepEqual(validas(sin('V4')), DERIVACIONES.filter((d) => d !== 'V4'));
  assert.deepEqual(validas(sin('RL')), DERIVACIONES, 'perfil por defecto: RL suelto solo añade interferencia');
  assert.deepEqual(validas(sin('RL'), { rlSuelto: 'invalidar' }), []);
});

test('Mensaje del equipo para LA suelto', () => {
  const m = montajeConNombre('la-suelto', torax);
  const msg = mensajesEquipo(resolverEntradas(m), { etiqueta: etq });
  assert.equal(msg[0].nivel, 'aviso');
  assert.equal(msg[0].texto, 'LA desconectado · sin señal en I, III, aVR, aVL, aVF y V1–V6');
});

test('Sin cable de paciente y equipo apagado', () => {
  const m = conectarTroncal(montajeCorrecto(torax), false);
  assert.deepEqual(mensajesEquipo(resolverEntradas(m), { etiqueta: etq }), [{ nivel: 'aviso', texto: 'Conecte el cable de paciente al equipo' }]);
  assert.deepEqual(validas(m), []);
  assert.deepEqual(mensajesEquipo(resolverEntradas(montajeCorrecto(torax), { encendido: false }), { etiqueta: etq }), []);
});

test('Diagnóstico de inversiones y errores ocultos', () => {
  const tipos = (id) => diagnosticarMontaje(montajeConNombre(id, torax), torax, etq).errores.map((e) => e.tipo);
  assert.deepEqual(tipos('ra-la'), ['intercambio']);
  assert.deepEqual(tipos('ll-rl'), ['intercambio']);
  assert.deepEqual(tipos('bilateral'), ['intercambio', 'intercambio']);
  assert.deepEqual(tipos('v1-v2'), ['precordial-intercambio']);
  assert.deepEqual(tipos('v1v2-altos'), ['precordial-desplazada', 'precordial-desplazada']);
  assert.deepEqual(tipos('v5v6-eic'), ['precordial-desplazada', 'precordial-desplazada']);
  assert.deepEqual(tipos('ra-la-compartido'), ['compartido', 'extremidad-equivocada']);
  assert.deepEqual(tipos('sin-rl'), ['sin-cable']);
  const altos = diagnosticarMontaje(montajeConNombre('v1v2-altos', torax), torax, etq).errores[0].texto;
  assert.match(altos, /2 espacios intercostales más arriba/);
  const ll = diagnosticarMontaje(montajeConNombre('ll-rl', torax), torax, etq).errores[0].texto;
  assert.match(ll, /no cambia el trazado/);
});

test('Todos los montajes de referencia se construyen sin errores', () => {
  for (const e of MONTAJES) {
    const m = e.crear(torax);
    assert.ok(m && m.cables, e.id);
    const d = disponibles(m);
    assert.ok(d.pinza >= 0 && d.adhesivo >= 0, e.id);
  }
});

test('Colocación: las pinzas no van al tórax y la bandeja se agota', () => {
  let m = montajeVacio();
  const r1 = colocarElectrodo(m, 'pinza', { zona: 'torso', x: 0, y: 0 });
  assert.match(r1.error, /Las pinzas solo se sujetan/);
  for (let i = 0; i < 4; i++) m = colocarElectrodo(m, 'pinza', sitioPinzaHabitual('brazo_der')).montaje;
  assert.match(colocarElectrodo(m, 'pinza', sitioPinzaHabitual('brazo_izq')).error, /No quedan pinzas/);
  assert.equal(disponibles(m).adhesivo, 6);
});

test('Retirar un electrodo suelta sus cables', () => {
  let m = montajeVacio();
  const r = colocarElectrodo(m, 'adhesivo', { zona: 'torso', x: 2.2, y: 0.26 });
  m = conectarCable(conectarCable(r.montaje, 'V2', r.id), 'V3', r.id);
  m = retirarElectrodo(m, r.id);
  assert.equal(m.cables.V2, null);
  assert.equal(m.cables.V3, null);
  assert.equal(Object.keys(m.electrodos).length, 0);
});

test('Zonas del cuerpo y descripción de sitios', () => {
  assert.equal(zonaEnCuerpo(64, 314), 'brazo_der');
  assert.equal(zonaEnCuerpo(236, 314), 'brazo_izq');
  assert.equal(zonaEnCuerpo(127, 540), 'pierna_der');
  assert.equal(zonaEnCuerpo(173, 540), 'pierna_izq');
  assert.equal(zonaEnCuerpo(150, 160), 'torso');
  assert.equal(zonaEnCuerpo(150, 50), 'cabeza');
  assert.equal(zonaEnCuerpo(10, 10), null);
  assert.equal(describirSitio(sitioPinzaHabitual('brazo_der'), torax), 'muñeca derecha');
  assert.equal(describirSitio(sitioPinzaHabitual('pierna_izq'), torax), 'tobillo izquierdo');
  assert.equal(describirSitio({ zona: 'brazo_izq', u: 220, v: 200 }, torax), 'brazo izquierdo');
  assert.match(sitioDesdeVista('cuerpo', 150, 50, torax).error, /cabeza/);
  assert.match(sitioDesdeVista('cuerpo', 150, 330, torax).error, /pared torácica/);
});

test('El montaje sobrevive a guardarse y leerse', () => {
  const m = intercambiarCables(montajeCorrecto(torax), 'RA', 'LA');
  assert.deepEqual(deserializarMontaje(serializarMontaje(m)), m);
  assert.equal(deserializarMontaje({ basura: true }), null);
});

test('Lista compacta de derivaciones', () => {
  assert.equal(listaDerivaciones(['I', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']), 'I, III, aVR, aVL, aVF y V1–V6');
  assert.equal(listaDerivaciones(['V4']), 'V4');
  assert.equal(listaDerivaciones(['II', 'V4']), 'II y V4');
});
