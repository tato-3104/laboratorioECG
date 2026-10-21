import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDerivaciones, derivacionesInstantaneas, DEPENDENCIAS, COEFICIENTES, DERIVACIONES, ENTRADAS } from '../../src/modelo/derivaciones.js';
import { crearGenerador } from '../../src/modelo/aleatorio.js';

function potencialesAleatorios(n, semilla = 7) {
  const rng = crearGenerador(semilla);
  const phi = {};
  for (const e of ENTRADAS) phi[e] = Float64Array.from({ length: n }, () => rng.normal() * 2);
  return phi;
}

test('Ley de Einthoven: II = I + III', () => {
  const d = calcularDerivaciones(potencialesAleatorios(500), 500);
  for (let i = 0; i < 500; i++) assert.ok(Math.abs(d.II[i] - (d.I[i] + d.III[i])) < 1e-12);
});

test('Goldberger: aVR + aVL + aVF = 0 y relaciones con I, II y III', () => {
  const d = calcularDerivaciones(potencialesAleatorios(300, 11), 300);
  for (let i = 0; i < 300; i++) {
    assert.ok(Math.abs(d.aVR[i] + d.aVL[i] + d.aVF[i]) < 1e-12);
    assert.ok(Math.abs(d.aVR[i] + (d.I[i] + d.II[i]) / 2) < 1e-12);
    assert.ok(Math.abs(d.aVL[i] - (d.I[i] - d.III[i]) / 2) < 1e-12);
    assert.ok(Math.abs(d.aVF[i] - (d.II[i] + d.III[i]) / 2) < 1e-12);
  }
});

test('aVR = 3/2 · (Φ_RA − TCW): el aumento del 50 % de Goldberger', () => {
  const phi = { RA: 1.3, LA: -0.4, LL: 0.7, RL: 9, V1: 0, V2: 0, V3: 0, V4: 0, V5: 0, V6: 0 };
  const d = derivacionesInstantaneas(phi);
  const tcw = (1.3 - 0.4 + 0.7) / 3;
  assert.ok(Math.abs(d.aVR - 1.5 * (1.3 - tcw)) < 1e-12);
});

test('Las precordiales se miden respecto al terminal central de Wilson', () => {
  const phi = { RA: 0.3, LA: 0.6, LL: 1.2, RL: 5, V1: 2, V2: 1, V3: 0, V4: -1, V5: 0.5, V6: 0.1 };
  const d = derivacionesInstantaneas(phi);
  const tcw = (0.3 + 0.6 + 1.2) / 3;
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) assert.ok(Math.abs(d[v] - (phi[v] - tcw)) < 1e-12);
});

test('RL no interviene en ninguna derivación', () => {
  const base = { RA: 0.2, LA: 0.5, LL: 0.9, RL: 0, V1: 1, V2: 1, V3: 1, V4: 1, V5: 1, V6: 1 };
  const a = derivacionesInstantaneas(base);
  const b = derivacionesInstantaneas({ ...base, RL: 37 });
  for (const d of DERIVACIONES) assert.equal(a[d], b[d]);
});

test('La tabla de dependencias coincide con los coeficientes', () => {
  for (const d of DERIVACIONES) {
    assert.deepEqual([...DEPENDENCIAS[d]].sort(), Object.keys(COEFICIENTES[d]).sort());
  }
});
