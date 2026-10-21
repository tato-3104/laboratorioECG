/**
 * Las inversiones de cables deben producir exactamente las transformaciones documentadas
 * (Batchvarov, Malik y Camm, Europace 2007; resumen de LITFL). No hay reglas especiales en el código:
 * el efecto sale de calcular las derivaciones con lo que llega a cada entrada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorCardiaco, construirSujeto } from '../../src/modelo/vectorCardiaco.js';
import { SUJETO_REFERENCIA } from '../../src/config/sujetos.js';
import { montajeCorrecto, intercambiarCables } from '../../src/conexiones/montajes.js';
import { torax, vectoresDeMontaje, derivacionesDesdeH, maxDif, maxAbs, negar, escalar } from './ayudas.js';

const gen = new GeneradorCardiaco(construirSujeto(SUJETO_REFERENCIA), 3);
const H = gen.generarBloque(0, 4000, 500);
const correcto = montajeCorrecto(torax);
const R = derivacionesDesdeH(H, vectoresDeMontaje(correcto));
const con = (...pares) => {
  let m = correcto;
  for (const [a, b] of pares) m = intercambiarCables(m, a, b);
  return derivacionesDesdeH(H, vectoresDeMontaje(m));
};
const igual = (a, b) => assert.ok(maxDif(a, b) < 1e-9, `diferencia ${maxDif(a, b)}`);
const plana = (a) => assert.ok(maxAbs(a) < 1e-9, `amplitud ${maxAbs(a)}`);
const PREC = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

test('RA/LA: I se invierte, II↔III, aVR↔aVL; aVF y precordiales sin cambio', () => {
  const L = con(['RA', 'LA']);
  igual(L.I, negar(R.I));
  igual(L.II, R.III);
  igual(L.III, R.II);
  igual(L.aVR, R.aVL);
  igual(L.aVL, R.aVR);
  igual(L.aVF, R.aVF);
  for (const v of PREC) igual(L[v], R[v]);
});

test('RA/LL: I→−III, II→−II, III→−I, aVR↔aVF; aVL sin cambio', () => {
  const L = con(['RA', 'LL']);
  igual(L.I, negar(R.III));
  igual(L.II, negar(R.II));
  igual(L.III, negar(R.I));
  igual(L.aVR, R.aVF);
  igual(L.aVF, R.aVR);
  igual(L.aVL, R.aVL);
  for (const v of PREC) igual(L[v], R[v]);
});

test('LA/LL: I↔II, III se invierte, aVL↔aVF; aVR sin cambio', () => {
  const L = con(['LA', 'LL']);
  igual(L.I, R.II);
  igual(L.II, R.I);
  igual(L.III, negar(R.III));
  igual(L.aVL, R.aVF);
  igual(L.aVF, R.aVL);
  igual(L.aVR, R.aVR);
});

test('RA/RL: II plana, I = −III, aVR = aVF = III/2, aVL = −III; cambian las precordiales', () => {
  const L = con(['RA', 'RL']);
  plana(L.II);
  igual(L.I, negar(R.III));
  igual(L.III, R.III);
  igual(L.aVR, L.aVF);
  igual(L.aVF, escalar(R.III, 0.5));
  igual(L.aVL, negar(R.III));
  assert.ok(maxDif(L.V1, R.V1) > 1e-3, 'el TCW cambia y las precordiales deben distorsionarse');
});

test('LA/RL: III plana, I = II, aVR = −II, aVL = aVF = II/2', () => {
  const L = con(['LA', 'RL']);
  plana(L.III);
  igual(L.I, R.II);
  igual(L.II, R.II);
  igual(L.aVR, negar(R.II));
  igual(L.aVL, L.aVF);
  igual(L.aVL, escalar(R.II, 0.5));
});

test('Bilateral brazo–pierna (LA↔LL y RA↔RL): I plana, II = III = −III, aVR = aVL, aVF = −III', () => {
  const L = con(['LA', 'LL'], ['RA', 'RL']);
  plana(L.I);
  igual(L.II, negar(R.III));
  igual(L.III, negar(R.III));
  igual(L.aVR, L.aVL);
  igual(L.aVF, negar(R.III));
});

test('LL/RL: ningún cambio (indetectable en el trazado)', () => {
  const L = con(['LL', 'RL']);
  for (const d of Object.keys(R)) igual(L[d], R[d]);
});

test('V1/V2: se intercambian y el resto queda igual', () => {
  const L = con(['V1', 'V2']);
  igual(L.V1, R.V2);
  igual(L.V2, R.V1);
  for (const d of ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V3', 'V4', 'V5', 'V6']) igual(L[d], R[d]);
});
