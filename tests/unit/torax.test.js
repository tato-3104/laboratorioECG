/**
 * Geometría del tórax y campo de vectores de derivación (precordiales mal ubicadas).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATRIZ_DOWER } from '../../src/modelo/vectoresDerivacion.js';
import { construirSujeto, latidoAislado } from '../../src/modelo/vectorCardiaco.js';
import { SUJETO_REFERENCIA } from '../../src/config/sujetos.js';
import { torax, campo } from './ayudas.js';

test('El campo torácico es exacto en las seis posiciones normalizadas', () => {
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
    const p = torax.posicionesEstandar[v];
    const L = campo.vectorEn(p.x, p.y);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(L[k] - MATRIZ_DOWER[v][k]) < 1e-9, `${v}[${k}]`);
  }
});

test('El dipolo equivalente explica la dirección de los vectores de Dower (coseno > 0,96)', () => {
  for (const [v, c] of Object.entries(campo.similitudDipoloDower)) assert.ok(c > 0.96, `${v}: ${c}`);
  const [x, y, z] = campo.parametros.centro;
  assert.ok(x > 0 && x < 4, 'centro algo a la izquierda de la línea media');
  assert.ok(y > -2 && y < 3, 'centro cerca del 4.º–5.º espacio intercostal');
  assert.ok(z > -7 && z < -2, 'centro por detrás de la pared anterior');
});

test('V5 y V6 en el plano horizontal de V4; el 5.º espacio sube hacia la axila', () => {
  const p = torax.posicionesEstandar;
  assert.equal(p.V5.y, p.V4.y);
  assert.equal(p.V6.y, p.V4.y);
  assert.ok(torax.yEIC(5, torax.g.xAxilarMedia) < p.V4.y - 1.5, 'seguir el 5.º EIC deja V6 más de 1,5 cm alto');
});

test('Descripción de posiciones en palabras', () => {
  const p = torax.posicionesEstandar;
  assert.match(torax.describir(p.V1.x, p.V1.y).texto, /4\.º espacio intercostal, borde esternal derecho/);
  assert.match(torax.describir(p.V2.x, p.V2.y).texto, /borde esternal izquierdo/);
  assert.match(torax.describir(p.V4.x, p.V4.y).texto, /5\.º espacio intercostal, línea medioclavicular izquierda/);
  assert.match(torax.describir(p.V6.x, p.V6.y).texto, /línea axilar media izquierda/);
});

test('V1 y V2 altos (2.º espacio): P negativa, menor r y T más negativa (efecto documentado, cualitativo)', () => {
  const s = construirSujeto(SUJETO_REFERENCIA);
  const { t, h } = latidoAislado(s, 60 / s.fc, 500);
  const medir = (L) => {
    let pMax = 0, pMin = 0, r = 0, tMin = 0, tMax = 0;
    for (let i = 0; i < t.length; i++) {
      const x = L[0] * h[0][i] + L[1] * h[1][i] + L[2] * h[2][i];
      if (t[i] < -0.05) { pMax = Math.max(pMax, x); pMin = Math.min(pMin, x); }
      else if (t[i] >= 0 && t[i] < 0.09) r = Math.max(r, x);
      else if (t[i] > 0.15) { tMin = Math.min(tMin, x); tMax = Math.max(tMax, x); }
    }
    return { pMax, pMin, r, tMin, tMax };
  };
  const g = torax.g;
  for (const [v, signo] of [['V1', -1], ['V2', 1]]) {
    const x = signo * g.xParaesternal;
    const normal = medir(campo.vectorEn(x, torax.yEIC(4, x)));
    const alto = medir(campo.vectorEn(x, torax.yEIC(2, x)));
    assert.ok(alto.pMin < normal.pMin, `${v}: componente negativa de P mayor`);
    assert.ok(alto.pMax < normal.pMax, `${v}: componente positiva de P menor`);
    assert.ok(alto.r < 0.75 * normal.r, `${v}: onda r menor`);
    assert.ok(alto.tMax - Math.abs(alto.tMin) < normal.tMax - Math.abs(normal.tMin), `${v}: T aplanada o invertida`);
  }
  const x1 = -g.xParaesternal;
  assert.ok(medir(campo.vectorEn(x1, torax.yEIC(2, g.xParaesternal))).pMax < 0.01, 'V1 alto: P totalmente negativa');
});
