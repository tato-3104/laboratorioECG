/**
 * La herramienta «Ecuaciones» explica el efecto de cada conexión comparando vectores de derivación.
 * Estas pruebas comprueban que esas explicaciones coinciden con lo documentado para las inversiones
 * (Batchvarov, Malik y Camm, Europace 2007) y con los casos de electrodo compartido y mal ubicado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { montajeCorrecto, intercambiarCables, montajeConNombre } from '../../src/conexiones/montajes.js';
import { conectarCable } from '../../src/conexiones/montaje.js';
import { vectoresDeDerivacion } from '../../src/modelo/derivaciones.js';
import { efectosDeConexion } from '../../src/conexiones/efectos.js';
import { torax, vectoresDeMontaje } from './ayudas.js';

const correcto = montajeCorrecto(torax);
const Lstd = vectoresDeDerivacion(vectoresDeMontaje(correcto));
const efectos = (m) => efectosDeConexion(vectoresDeDerivacion(vectoresDeMontaje(m)), Lstd);
const resumen = (ef) => Object.fromEntries(Object.entries(ef).map(([d, e]) => [d, e.tipo === 'equivale' ? `${e.signo < 0 ? '−' : ''}${e.a}` : e.tipo]));
const PREC_IGUALES = { V1: 'igual', V2: 'igual', V3: 'igual', V4: 'igual', V5: 'igual', V6: 'igual' };

test('montaje correcto: las 12 derivaciones «igual»', () => {
  const r = resumen(efectos(correcto));
  for (const d in r) assert.equal(r[d], 'igual', d);
});

test('RA/LA: I invertida, II↔III, aVR↔aVL, aVF igual', () => {
  assert.deepEqual(resumen(efectos(intercambiarCables(correcto, 'RA', 'LA'))), {
    I: 'invertida', II: 'III', III: 'II', aVR: 'aVL', aVL: 'aVR', aVF: 'igual', ...PREC_IGUALES,
  });
});

test('RA/LL: I→−III, II invertida, III→−I, aVR↔aVF, aVL igual', () => {
  assert.deepEqual(resumen(efectos(intercambiarCables(correcto, 'RA', 'LL'))), {
    I: '−III', II: 'invertida', III: '−I', aVR: 'aVF', aVL: 'igual', aVF: 'aVR', ...PREC_IGUALES,
  });
});

test('LA/LL: I↔II, III invertida, aVL↔aVF, aVR igual', () => {
  assert.deepEqual(resumen(efectos(intercambiarCables(correcto, 'LA', 'LL'))), {
    I: 'II', II: 'I', III: 'invertida', aVR: 'igual', aVL: 'aVF', aVF: 'aVL', ...PREC_IGUALES,
  });
});

test('LL/RL: ningún cambio (las piernas tienen casi el mismo potencial)', () => {
  const r = resumen(efectos(intercambiarCables(correcto, 'LL', 'RL')));
  for (const d in r) assert.equal(r[d], 'igual', d);
});

test('RA/RL: II plana, I = −III; las precordiales cambian (la TCW ya no es la misma)', () => {
  const r = resumen(efectos(intercambiarCables(correcto, 'RA', 'RL')));
  assert.equal(r.II, 'plana');
  assert.equal(r.I, '−III');
  assert.equal(r.III, 'igual');
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) assert.equal(r[v], 'distinta', v);
});

test('LA/RL: III plana, I = II', () => {
  const r = resumen(efectos(intercambiarCables(correcto, 'LA', 'RL')));
  assert.equal(r.III, 'plana');
  assert.equal(r.I, 'II');
  assert.equal(r.II, 'igual');
});

test('RA y LA en el mismo electrodo: I plana', () => {
  const m = montajeConNombre('ra-la-compartido', torax);
  assert.equal(resumen(efectos(m)).I, 'plana');
});

test('V1 y V2 intercambiados: V1↔V2, el resto igual', () => {
  const r = resumen(efectos(intercambiarCables(correcto, 'V1', 'V2')));
  assert.equal(r.V1, 'V2');
  assert.equal(r.V2, 'V1');
  for (const d of ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V3', 'V4', 'V5', 'V6']) assert.equal(r[d], 'igual', d);
});

test('V1 y V2 dos espacios más arriba: «distinta» (no equivale a ninguna otra)', () => {
  const r = resumen(efectos(montajeConNombre('v1v2-altos', torax)));
  assert.equal(r.V1, 'distinta');
  assert.equal(r.V2, 'distinta');
});

test('cable LA en un electrodo del tórax: las derivaciones con LA cambian, II no', () => {
  const m = conectarCable(correcto, 'LA', correcto.cables.V4);
  const r = resumen(efectos(m));
  assert.equal(r.II, 'igual');
  assert.notEqual(r.I, 'igual');
  assert.notEqual(r.III, 'igual');
});
