/**
 * El sujeto de referencia y los seis voluntarios deben producir un ECG normal y reproducible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUJETO_REFERENCIA } from '../../src/config/sujetos.js';
import { VOLUNTARIOS, buscarVoluntario } from '../../src/config/voluntarios.js';
import { construirSujeto, sujetoDeVoluntario, latidoAislado, GeneradorCardiaco, duracionesPorConstruccion } from '../../src/modelo/vectorCardiaco.js';
import { latidoEnDerivaciones, amplitudesOndas, ejeDeOnda } from '../../src/modelo/medidas.js';
import { extremidades, campo, torax } from './ayudas.js';

const entradasEstandar = (() => {
  const v = { RA: extremidades.brazo_der, LA: extremidades.brazo_izq, LL: extremidades.pierna_izq, RL: extremidades.pierna_der };
  for (const p of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
    const pos = torax.posicionesEstandar[p];
    v[p] = campo.vectorEn(pos.x, pos.y);
  }
  return v;
})();

function analizar(sujeto) {
  const lat = latidoEnDerivaciones(sujeto, entradasEstandar, 60 / sujeto.fc, 500);
  return {
    lat,
    a: amplitudesOndas(lat, sujeto),
    ejeQRS: ejeDeOnda(lat, 0, 0.09),
    ejeP: ejeDeOnda(lat, -sujeto.pr, -sujeto.pr + 0.1),
    ejeT: ejeDeOnda(lat, 0.15, lat.qt),
  };
}

const FRONTALES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];

test('Sujeto de referencia: ejes normales', () => {
  const { ejeQRS, ejeP, ejeT } = analizar(construirSujeto(SUJETO_REFERENCIA));
  assert.ok(ejeQRS > 50 && ejeQRS < 66, `eje QRS ${ejeQRS}`);
  assert.ok(ejeP > 45 && ejeP < 70, `eje P ${ejeP}`);
  assert.ok(ejeT > 30 && ejeT < 55, `eje T ${ejeT}`);
});

test('Sujeto de referencia: morfología normal de las 12 derivaciones', () => {
  const { a } = analizar(construirSujeto(SUJETO_REFERENCIA));
  // aVR negativa en P, QRS y T (actividad 9 del laboratorio)
  assert.ok(a.aVR.pMin < -0.05 && a.aVR.pMax < 0.02);
  assert.ok(a.aVR.q < -0.5 && a.aVR.r < 0.3);
  assert.ok(a.aVR.tMin < -0.15);
  // la R más alta del plano frontal está en II (actividad 2) y aVL es casi isoeléctrica (actividad 3)
  const r = (d) => a[d].r + a[d].q + a[d].s;
  for (const d of ['I', 'III', 'aVL', 'aVF']) assert.ok(a.II.r > a[d].r, `R de II frente a ${d}`);
  assert.ok(Math.abs(r('aVL')) < 0.15, 'aVL casi isoeléctrica');
  // T pequeña en III (actividad 10)
  assert.ok(a.III.tMax < 0.12);
  // V1 rS con P bifásica; V6 qR; progresión de R
  assert.ok(a.V1.r < Math.abs(a.V1.s));
  assert.ok(a.V1.pMax > 0.02 && a.V1.pMin < -0.04, 'P bifásica en V1');
  assert.ok(a.V6.r > 4 * Math.abs(a.V6.s));
  assert.ok(a.V1.r < a.V2.r && a.V2.r < a.V3.r && a.V3.r < a.V4.r);
  // límites de voltaje normales
  assert.ok(a.V5.r < 2.6);
  assert.ok(Math.abs(a.V1.s) + a.V5.r < 3.5, 'Sokolow-Lyon < 3,5 mV');
  assert.ok(a.II.pMax > 0.08 && a.II.pMax < 0.25, 'P en II entre 0,08 y 0,25 mV');
});

test('Intervalos exactos por construcción (P, PR, QRS y QT)', () => {
  const s = construirSujeto(SUJETO_REFERENCIA);
  const rr = 60 / s.fc;
  const fs = 2000;
  const { t, h, qt } = latidoAislado(s, rr, fs);
  const mag = t.map((_, i) => Math.hypot(h[0][i], h[1][i], h[2][i]));
  const primero = t[mag.findIndex((v) => v > 0)];
  let ultimo = 0;
  for (let i = mag.length - 1; i >= 0; i--) if (mag[i] > 0) { ultimo = t[i]; break; }
  assert.ok(Math.abs(primero - -s.pr) < 2 / fs, `inicio de P ${primero}`);
  assert.ok(Math.abs(ultimo - qt) < 2 / fs, `fin de T ${ultimo} vs QT ${qt}`);
  const dur = duracionesPorConstruccion(s, rr);
  assert.ok(Math.abs(dur.p - 0.1) < 1e-9);
  assert.ok(Math.abs(dur.qrs - 0.09) < 1e-9);
  assert.ok(Math.abs(qt / Math.sqrt(rr) - s.qtc) < 1e-12, 'QTc de Bazett');
});

test('Sujeto del laboratorio: un solo sujeto, adulto joven con valores normales', () => {
  assert.equal(VOLUNTARIOS.length, 1, 'todos los estudiantes registran al mismo sujeto');
  for (const v of VOLUNTARIOS) {
    assert.ok(v.edad >= 18 && v.edad <= 28);
    assert.ok(v.fc >= 55 && v.fc <= 95, `voluntario ${v.id}: FC`);
    assert.ok(v.pr >= 0.12 && v.pr < 0.2, `voluntario ${v.id}: PR`);
    assert.ok(v.qtc < (v.sexo === 'hombre' ? 0.44 : 0.46), `voluntario ${v.id}: QTc`);
  }
  assert.equal(buscarVoluntario(99).id, 1, 'un número inexistente devuelve el sujeto del laboratorio');
});

test('Sujeto del laboratorio: ECG normal y respuestas claras a las actividades de la guía', () => {
  // [eje QRS mínimo, máximo] · derivación con mayor R · derivación casi isoeléctrica
  const esperado = { 1: [50, 66, 'II', 'aVL'] };
  for (const v of VOLUNTARIOS) {
    const s = sujetoDeVoluntario(v);
    const { a, ejeQRS, ejeP } = analizar(s);
    const [min, max, mayorR, iso] = esperado[v.id];
    assert.ok(ejeQRS >= min && ejeQRS <= max, `voluntario ${v.id}: eje QRS ${ejeQRS.toFixed(1)}`);
    assert.ok(ejeQRS >= -30 && ejeQRS <= 90, `voluntario ${v.id}: eje normal`);
    assert.ok(ejeP >= 30 && ejeP <= 75, `voluntario ${v.id}: eje P ${ejeP}`);
    const r = FRONTALES.map((d) => [d, a[d].r]).sort((x, y) => y[1] - x[1]);
    assert.equal(r[0][0], mayorR, `voluntario ${v.id}: mayor R en ${r[0][0]}`);
    const neta = (d) => Math.abs(a[d].r + a[d].q + a[d].s) / (a[d].r - Math.min(a[d].q, a[d].s));
    const isoMedida = FRONTALES.map((d) => [d, neta(d)]).sort((x, y) => x[1] - y[1]);
    assert.equal(isoMedida[0][0], iso, `voluntario ${v.id}: isoeléctrica ${isoMedida[0][0]}`);
    assert.ok(isoMedida[0][1] < 0.3 && isoMedida[1][1] - isoMedida[0][1] > 0.15, `voluntario ${v.id}: isoeléctrica inequívoca`);
    // mayor onda P en II (actividad 4)
    const p = FRONTALES.map((d) => [d, a[d].pMax]).sort((x, y) => y[1] - x[1]);
    assert.equal(p[0][0], 'II', `voluntario ${v.id}: mayor P en ${p[0][0]}`);
    assert.ok(a.II.pMax < 0.25 && a.II.pMax > 0.08, `voluntario ${v.id}: P en II ${a.II.pMax}`);
    assert.ok(Math.abs(a.V1.s) + Math.max(a.V5.r, a.V6.r) < 3.5, `voluntario ${v.id}: Sokolow`);
    assert.ok(a.aVR.q + a.aVR.r + a.aVR.s < 0, `voluntario ${v.id}: QRS de aVR negativo`);
    assert.ok(a.aVR.pMin < -0.03 && a.aVR.tMin < -0.1, `voluntario ${v.id}: P y T negativas en aVR`);
  }
});

test('El sujeto del laboratorio es siempre el mismo', () => {
  assert.deepEqual(sujetoDeVoluntario(1), sujetoDeVoluntario(1));
  assert.notDeepEqual(sujetoDeVoluntario(1), construirSujeto(SUJETO_REFERENCIA, { rotacionQRS: 20 }));
});

test('Ritmo: variabilidad R–R fisiológica y FC media correcta', () => {
  for (const v of VOLUNTARIOS) {
    const s = sujetoDeVoluntario(v);
    const g = new GeneradorCardiaco(s, v.semilla);
    g.asegurarHasta(180);
    const rr = g.latidos.map((l) => l.rr);
    const media = rr.reduce((x, y) => x + y, 0) / rr.length;
    const sd = Math.sqrt(rr.reduce((x, y) => x + (y - media) ** 2, 0) / rr.length);
    assert.ok(Math.abs(60 / media - s.fc) < 2, `voluntario ${v.id}: FC media ${60 / media}`);
    assert.ok(sd > 0.01 && sd < 0.06, `voluntario ${v.id}: desviación R–R ${sd}`);
    const unicos = new Set(rr.slice(0, 10).map((x) => x.toFixed(3)));
    assert.ok(unicos.size >= 8, 'los 10 primeros R–R no deben ser todos iguales (actividad 5)');
  }
});

test('Generación por bloques: el resultado no depende del tamaño de bloque', () => {
  const s = construirSujeto(SUJETO_REFERENCIA);
  const a = new GeneradorCardiaco(s, 5).generarBloque(0, 3000, 500);
  const g = new GeneradorCardiaco(s, 5);
  const partes = [];
  for (let i = 0; i < 3000; i += 137) partes.push(g.generarBloque(i / 500, Math.min(137, 3000 - i), 500));
  for (let k = 0; k < 3; k++) {
    const unido = Float64Array.from(partes.flatMap((p) => Array.from(p[k])));
    for (let i = 0; i < 3000; i++) assert.ok(Math.abs(unido[i] - a[k][i]) < 1e-12);
  }
});
