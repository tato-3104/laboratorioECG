/**
 * Calcula los valores de referencia del sujeto del laboratorio y los escribe en la guía del docente
 * (entre las marcas <!-- referencias:inicio --> y <!-- referencias:fin -->).
 *
 *   node tools/valores-referencia.mjs        (o npm run referencias)
 *
 * Todos los estudiantes registran al mismo sujeto, así que hay un solo valor esperado por magnitud.
 * Amplitudes: latido sin ruido ni filtros. Intervalos: se miden en DII con umbrales de visibilidad de 0,05,
 * 0,025 y 0,01 mV (lo que un lector distingue en el papel); se da el rango y el valor central (0,025 mV).
 * Ritmo: 600 s simulados; FC con 10 R–R consecutivos (percentiles 2,5–97,5) y FC que muestra el equipo.
 * Conexiones incorrectas: los efectos se comprueban contra las identidades exactas del modelo (si alguna
 * dejara de cumplirse, el script se detiene en lugar de escribir valores equivocados).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crearTorax, crearCampoToracico } from '../src/modelo/torax.js';
import { sujetoDeVoluntario, GeneradorCardiaco, qtDeBazett, duracionesPorConstruccion } from '../src/modelo/vectorCardiaco.js';
import { latidoEnDerivaciones, amplitudesOndas, ejeFrontal, ejeDeOnda } from '../src/modelo/medidas.js';
import { vectoresDeDerivacion, DERIVACIONES } from '../src/modelo/derivaciones.js';
import { resolverEntradas, vectoresPorEntrada } from '../src/conexiones/entradas.js';
import { efectosDeConexion } from '../src/conexiones/efectos.js';
import { montajeConNombre } from '../src/conexiones/montajes.js';
import { vectoresExtremidades } from '../src/modelo/vectoresDerivacion.js';
import { MotorAdquisicion } from '../src/equipo/adquisicion.js';
import { VOLUNTARIOS, VOLUNTARIO_POR_DEFECTO, buscarVoluntario } from '../src/config/voluntarios.js';

const torax = crearTorax();
const campo = crearCampoToracico(torax);
const ext = vectoresExtremidades();
const FS = 1000;
const FRONTALES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
const HEXAXIAL = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',').replace('-', '−').replace(/^−0,00$/, '0,00');
const n3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3).replace('.', ',').replace('-', '−').replace(/^−0,000$/, '0,000');
const n0 = (v) => String(Math.round(v)).replace('-', '−');
const g0 = (v) => `${v > 0.5 ? '+' : ''}${n0(v)}°`;
const vec = (id) => vectoresPorEntrada(resolverEntradas(montajeConNombre(id, torax)), campo, ext);

function percentil(lista, p) {
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.round((p / 100) * (o.length - 1))))];
}

function intervalosII(lat, s, umbral) {
  const x = lat.derivaciones.II;
  const t = lat.t;
  let iP = 0;
  while (iP < x.length && Math.abs(x[iP]) <= umbral) iP++;
  let i = 0;
  while (t[i] < -s.pr + 0.1) i++;
  let iQ = i;
  while (iQ < x.length && Math.abs(x[iQ]) <= umbral) iQ++;
  let iJ = iQ;
  for (let k = iQ; k < x.length && t[k] <= 0.12; k++) if (Math.abs(x[k]) > umbral) iJ = k;
  let iT = x.length - 1;
  while (iT > 0 && Math.abs(x[iT]) <= umbral) iT--;
  return { pr: (t[iQ] - t[iP]) * 1000, qrs: (t[iJ] - t[iQ]) * 1000, qt: (t[iT] - t[iQ]) * 1000 };
}

/** Comprueba una identidad exacta del modelo (diferencia máxima entre dos trazados). */
function exigir(nombre, a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  if (!(d < 1e-6)) throw new Error(`No se cumple «${nombre}» (diferencia ${d}); revise el modelo antes de escribir la guía`);
}

const escalar = (x, k) => x.map((y) => k * y);

/** Registro de 20 s del equipo completo (filtros, ruido, respiración) con un montaje de referencia. */
function registroReal(s, v, id, segundos = 45) {
  const m = new MotorAdquisicion({ sujeto: s, semilla: v.semilla, campo });
  m.configurar({ montaje: montajeConNombre(id, torax), ajustes: { encendido: true } }, { asentar: true });
  for (let k = 0; k < segundos * 4; k++) m.generar(125);
  return m.instantanea(20);
}

/** Amplitud de la onda R de cada latido completo del registro, medida desde el segmento PR (como con los cursores). */
function rPorLatido(inst, d) {
  const x = inst.derivaciones[d];
  const idx = (t) => Math.round((t - inst.tInicio) * inst.fs);
  const out = [];
  for (const l of inst.latidos) {
    if (idx(l.inicio - l.pr) < 0 || idx(l.inicio + l.qt) >= x.length) continue;
    let base = 0;
    let n = 0;
    for (let i = idx(l.inicio - 0.05); i <= idx(l.inicio - 0.01); i++, n++) base += x[i];
    base /= n;
    let r = 0;
    for (let i = idx(l.inicio); i <= idx(l.inicio + 0.09); i++) r = Math.max(r, x[i] - base);
    out.push(r);
  }
  return out;
}

/** Grosor del trazo de DII en los segmentos T–P: pico a pico de lo que queda al quitar la componente lenta (mV). */
function grosorTP(inst) {
  const x = inst.derivaciones.II;
  const w = Math.round(0.02 * inst.fs);
  const valores = [];
  for (const l of inst.latidos) {
    const a = Math.round((l.inicio + l.qt + 0.05 - inst.tInicio) * inst.fs);
    const b = Math.round((l.inicio + l.rr - l.pr - 0.03 - inst.tInicio) * inst.fs);
    if (a < w || b >= x.length - w || b - a < 20) continue;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = a; i < b; i++) {
      let suma = 0;
      for (let k = -w; k <= w; k++) suma += x[i + k];
      const y = x[i] - suma / (2 * w + 1);
      mn = Math.min(mn, y);
      mx = Math.max(mx, y);
    }
    valores.push(mx - mn);
  }
  return valores.reduce((p, q) => p + q, 0) / valores.length;
}

function analizar(v) {
  const s = sujetoDeVoluntario(v);
  const rr = 60 / s.fc;
  const lat = latidoEnDerivaciones(s, vec('correcto'), rr, FS);
  const D = lat.derivaciones;
  const t = lat.t;
  const a = amplitudesOndas(lat, s);
  const neto = (d) => a[d].r + a[d].q + a[d].s;
  const netoT = (d) => (Math.abs(a[d].tMax) > Math.abs(a[d].tMin) ? a[d].tMax : a[d].tMin);
  const ondaP = (d) => (Math.abs(a[d].pMax) >= Math.abs(a[d].pMin) ? a[d].pMax : a[d].pMin);
  const m = [0.05, 0.025, 0.01].map((u) => intervalosII(lat, s, u));

  // Picos de R y de T en DII (leyes de Einthoven y Goldberger en un mismo instante)
  let iR = t.findIndex((x) => x >= 0);
  for (let i = iR; i < t.length && t[i] <= 0.09; i++) if (D.II[i] > D.II[iR]) iR = i;
  let iT = t.findIndex((x) => x > 0.14);
  for (let i = iT; i < t.length; i++) if (D.II[i] > D.II[iT]) iT = i;
  const instante = (i) => Object.fromEntries(FRONTALES.map((d) => [d, D[d][i]]));

  // Vector instantáneo de las fuerzas terminales del QRS: instante de la onda S de DIII
  let iS = t.findIndex((x) => x >= 0);
  for (let i = iS; i < t.length && t[i] <= 0.09; i++) if (D.III[i] < D.III[iS]) iS = i;
  const terminal = { angulo: ejeFrontal(D.I[iS], D.aVF[iS]), magnitud: Math.hypot(D.I[iS], (2 * D.aVF[iS]) / Math.sqrt(3)), t: t[iS] * 1000 };

  // Ramas de la onda T en DII (umbral 0,025 mV)
  let iniT = iT;
  let finT = iT;
  while (iniT > iR && D.II[iniT] > 0.025) iniT--;
  while (finT < t.length - 1 && D.II[finT] > 0.025) finT++;
  const ramas = { asc: (t[iT] - t[iniT]) * 1000, desc: (t[finT] - t[iT]) * 1000 };

  // Ritmo
  const g = new GeneradorCardiaco(s, (v.semilla ^ 0x2545f491) >>> 0);
  g.asegurarHasta(600);
  const rrs = g.latidos.slice(5, -5).map((l) => l.rr);
  const fc10 = [];
  const sd10 = [];
  for (let k = 0; k + 10 <= rrs.length; k++) {
    const ventana = rrs.slice(k, k + 10);
    const media = ventana.reduce((p, q) => p + q, 0) / 10;
    fc10.push(60 / media);
    sd10.push(Math.sqrt(ventana.reduce((p, q) => p + (q - media) ** 2, 0) / 9));
  }
  // FC del equipo e interferencia sin RL (motor completo)
  const motor = new MotorAdquisicion({ sujeto: s, semilla: v.semilla, campo });
  motor.configurar({ montaje: montajeConNombre('correcto', torax), ajustes: { encendido: true } }, { asentar: true });
  const fcEq = [];
  for (let k = 0; k < 240; k++) {
    motor.generar(500);
    if (k > 20 && motor.frecuencia()) fcEq.push(motor.frecuencia());
  }
  const sinRL = new MotorAdquisicion({ sujeto: s, semilla: v.semilla, campo });
  sinRL.configurar({ montaje: montajeConNombre('sin-rl', torax), ajustes: { encendido: true } }, { asentar: true });
  sinRL.generar(500 * 8);
  const x = sinRL.leer('II', sinRL.total - 2000, sinRL.total);
  const amp = (f) => {
    let re = 0, im = 0;
    x.forEach((y, i) => { re += y * Math.cos((2 * Math.PI * f * i) / 500); im += y * Math.sin((2 * Math.PI * f * i) / 500); });
    return (2 * Math.hypot(re, im)) / x.length;
  };

  // Conexiones incorrectas: se verifican las identidades exactas que usa la guía
  const latCon = (id) => latidoEnDerivaciones(s, vec(id), rr, FS);
  const raLa = latCon('ra-la').derivaciones;
  exigir('RA↔LA: I = −I', raLa.I, escalar(D.I, -1));
  exigir('RA↔LA: II = III', raLa.II, D.III);
  exigir('RA↔LA: III = II', raLa.III, D.II);
  exigir('RA↔LA: aVR = aVL', raLa.aVR, D.aVL);
  exigir('RA↔LA: aVF igual', raLa.aVF, D.aVF);
  for (const d of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) exigir(`RA↔LA: ${d} igual`, raLa[d], D[d]);
  const raRl = latCon('ra-rl');
  const R = raRl.derivaciones;
  exigir('RA↔RL: II = 0', R.II, escalar(D.II, 0));
  exigir('RA↔RL: I = −III', R.I, escalar(D.III, -1));
  exigir('RA↔RL: aVR = III/2', R.aVR, escalar(D.III, 0.5));
  exigir('RA↔RL: aVF = III/2', R.aVF, escalar(D.III, 0.5));
  exigir('RA↔RL: aVL = −III', R.aVL, escalar(D.III, -1));
  for (const d of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']) exigir(`RA↔RL: ${d} = ${d} − II/3`, R[d], D[d].map((y, i) => y - D.II[i] / 3));
  const laSuelto = latCon('la-suelto').derivaciones;
  if (Object.keys(laSuelto).join() !== 'II') throw new Error('LA desenganchado debería dejar solo DII');
  exigir('LA desenganchado: II igual', laSuelto.II, D.II);
  const aRaRl = amplitudesOndas(raRl, s);

  // Registros reales: variación de la R entre latidos y grosor del trazo con y sin RL
  const regRef = registroReal(s, v, 'correcto');
  const rangoR = Object.fromEntries(DERIVACIONES.map((d) => { const r = rPorLatido(regRef, d); return [d, [Math.min(...r), Math.max(...r)]]; }));
  const grosor = { ref: grosorTP(regRef), sinRL: grosorTP(registroReal(s, v, 'sin-rl')) };

  const iso = FRONTALES.map((d) => [d, Math.abs(neto(d)) / (a[d].r - Math.min(a[d].q, a[d].s))]).sort((p, q) => p[1] - q[1]);
  const ejeHex = ejeFrontal(neto('I'), neto('aVF'));
  const candidatos = [HEXAXIAL[iso[0][0]] + 90, HEXAXIAL[iso[0][0]] - 90].map((x) => ((x + 540) % 360) - 180);
  const ejeIso = candidatos.sort((p, q) => Math.abs(p - ejeHex) - Math.abs(q - ejeHex))[0];
  return {
    v, s, rr, a, neto, netoT, ondaP, m, ramas, terminal,
    ejeP: ejeDeOnda(lat, -s.pr, -s.pr + 0.1),
    dur: duracionesPorConstruccion(s, rr),
    qtConstr: qtDeBazett(s.qtc, rr) * 1000,
    picoR: { t: t[iR] * 1000, valores: instante(iR) },
    picoT: { t: t[iT] * 1000, valores: instante(iT) },
    rrMin: Math.min(...rrs), rrMax: Math.max(...rrs),
    fc10: [percentil(fc10, 2.5), percentil(fc10, 97.5)],
    sd10: [percentil(sd10, 2.5), percentil(sd10, 97.5)],
    fcEq: [percentil(fcEq, 2.5), percentil(fcEq, 97.5)],
    mayorR: FRONTALES.map((d) => [d, a[d].r]).sort((p, q) => q[1] - p[1]),
    mayorP: FRONTALES.map((d) => [d, a[d].pMax]).sort((p, q) => q[1] - p[1]),
    iso, ejeHex, ejeIso,
    ejeSimple: (Math.atan2(neto('aVF'), neto('I')) * 180) / Math.PI,
    ejeT: ejeFrontal(netoT('I'), netoT('aVF')),
    aRaRl, rangoR, grosor,
    ppII: Math.max(...D.II) - Math.min(...D.II),
    interferencia: { a60: amp(60), a180: amp(180), grosorMM: 10 * 2 * (amp(60) + amp(180)) },
  };
}

export async function generarReferencias() {
  if (VOLUNTARIOS.length !== 1) throw new Error('La guía del docente está escrita para un único sujeto: adapte este script si agrega más');
  const r = analizar(buscarVoluntario(VOLUNTARIO_POR_DEFECTO));
  const { a, v } = r;
  const L = [];
  const qtc = (q) => q / Math.sqrt(r.rr);
  const [m05, m025, m01] = r.m;

  L.push(`Sujeto del laboratorio: **${v.sexo}, ${v.edad} años**, FC media ${v.fc} lpm, PR ${n0(v.pr * 1000)} ms y QTc ${n0(v.qtc * 1000)} ms por construcción.`, '');

  L.push('### Tabla R1. Amplitudes del registro de referencia (mV) · actividades 2, 3, 7 y 8', '');
  L.push('Latido sin ruido. P = pico (con signo) · Q y S = deflexiones negativas antes y después de R · R = deflexión positiva · Neto = R + Q + S · T = pico de la onda T (con signo) · T/R solo donde R ≥ 0,3 mV. La última fila da el rango de la R latido a latido en un registro real de 20 s: la respiración rota levemente el vector y modula su amplitud, y se suma el ruido.', '');
  L.push('| | ' + DERIVACIONES.join(' | ') + ' |');
  L.push('|:-' + '|:-:'.repeat(DERIVACIONES.length) + '|');
  const fila = (nombre, f) => L.push(`| ${nombre} | ${DERIVACIONES.map((d) => f(d)).join(' | ')} |`);
  fila('P', (d) => n2(r.ondaP(d)));
  fila('Q', (d) => n2(a[d].q));
  fila('R', (d) => n2(a[d].r));
  fila('S', (d) => n2(a[d].s));
  fila('Neto', (d) => n2(r.neto(d)));
  fila('T', (d) => n2(r.netoT(d)));
  fila('T/R', (d) => (a[d].r >= 0.3 ? n2(r.netoT(d) / a[d].r) : '—'));
  fila('R entre latidos', (d) => `${n2(r.rangoR[d][0])}–${n2(r.rangoR[d][1])}`);

  L.push('', '### Tabla R2. Respuestas que se derivan de las amplitudes · actividades 2, 3, 7 y 8', '');
  L.push('| Magnitud | Valor esperado |');
  L.push('|:--|:--|');
  L.push(`| Mayor onda R del plano frontal | **${r.mayorR[0][0]}** (${n2(r.mayorR[0][1])} mV); le sigue ${r.mayorR[1][0]} (${n2(r.mayorR[1][1])} mV) |`);
  L.push(`| Mayor onda P del plano frontal | **${r.mayorP[0][0]}** (${n2(r.mayorP[0][1])} mV); le sigue ${r.mayorP[1][0]} (${n2(r.mayorP[1][1])} mV) |`);
  L.push(`| Derivación más isoeléctrica | **${r.iso[0][0]}** (QRS neto ${n2(r.neto(r.iso[0][0]))} mV; índice ${n2(r.iso[0][1])}, la siguiente es ${r.iso[1][0]} con ${n2(r.iso[1][1])}) |`);
  L.push(`| Eje del QRS, fórmula hexaxial | **${g0(r.ejeHex)}** |`);
  L.push(`| Eje del QRS, aproximación atan(aVF/I) | ${g0(r.ejeSimple)} |`);
  L.push(`| Eje del QRS, método de la derivación isoeléctrica | ${g0(r.ejeIso)} (perpendicular a ${r.iso[0][0]}, ${g0(HEXAXIAL[r.iso[0][0]])}) |`);
  L.push(`| Clasificación del eje | normal (entre −30° y +90°) |`);
  L.push(`| Onda T en DII: rama ascendente y descendente (umbral 0,025 mV) | ≈ ${n0(r.ramas.asc)} ms y ≈ ${n0(r.ramas.desc)} ms: asimétrica, sube más despacio de lo que baja |`);
  L.push(`| aVR: polaridad de P, QRS y T | negativas: P ${n2(r.ondaP('aVR'))}, QRS neto ${n2(r.neto('aVR'))}, T ${n2(r.netoT('aVR'))} mV |`);
  L.push(`| Eje de la onda P | ${g0(r.ejeP)} |`);
  L.push(`| Eje de la onda T (amplitudes de T en I y aVF) | ${g0(r.ejeT)}, a ${n0(Math.abs(HEXAXIAL.III - r.ejeT))}° del eje de DIII (+120°) |`);
  L.push(`| DIII: onda S y onda T | S ${n2(a.III.s)} mV (pequeña, pero visible) y T ${n2(r.netoT('III'))} mV (casi plana) |`);
  L.push(`| Fuerzas terminales del QRS (vector en el instante de la S de DIII, ${n0(r.terminal.t)} ms) | ${g0(r.terminal.angulo)}, ${n2(r.terminal.magnitud)} mV: su proyección sobre DIII es apreciable, pero el vector es pequeño |`);
  L.push('', 'Índice de isoelectricidad = |QRS neto| / amplitud pico a pico del QRS (0 = perfectamente isoeléctrica).');

  L.push('', '### Tabla R3. Leyes de Einthoven y Goldberger · actividad 4', '');
  L.push('Valores (mV) de las seis derivaciones en un mismo instante. En el registro cambian de un latido a otro (fila «R entre latidos» de la tabla R1), pero las sumas se mantienen en todo instante.', '');
  L.push('| Instante | I | II | III | I + III | aVR | aVL | aVF | aVR + aVL + aVF |');
  L.push('|:--|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|');
  for (const [nombre, p] of [[`Pico de R en DII (${n0(r.picoR.t)} ms después del inicio del QRS)`, r.picoR], [`Pico de T en DII (${n0(r.picoT.t)} ms)`, r.picoT]]) {
    const w = p.valores;
    L.push(`| ${nombre} | ${n2(w.I)} | ${n2(w.II)} | ${n2(w.III)} | ${n2(w.I + w.III)} | ${n2(w.aVR)} | ${n2(w.aVL)} | ${n2(w.aVF)} | ${n2(w.aVR + w.aVL + w.aVF)} |`);
  }

  L.push('', '### Tabla R4. Ritmo y frecuencia cardíaca · actividad 5', '');
  L.push('| Magnitud | Valor esperado |');
  L.push('|:--|:-:|');
  L.push(`| R–R individuales (dependen del momento de la impresión) | ${n2(r.rrMin)} – ${n2(r.rrMax)} s |`);
  L.push(`| R–R medio | ${n2(r.rr)} s |`);
  L.push(`| Desviación estándar de 10 R–R consecutivos (95 % de las ventanas) | ${n3(r.sd10[0])} – ${n3(r.sd10[1])} s |`);
  L.push(`| FC calculada con 10 R–R (95 % de las ventanas) | ${n0(r.fc10[0])} – ${n0(r.fc10[1])} lpm |`);
  L.push(`| FC que muestra el equipo en el encabezado (95 %) | ${n0(r.fcEq[0])} – ${n0(r.fcEq[1])} lpm |`);

  L.push('', '### Tabla R5. Intervalos en DII · actividad 6', '');
  L.push('Rango = lo que se lee con umbrales de 0,05 a 0,01 mV; entre paréntesis, el valor central. El QTc se calcula con el R–R medio.', '');
  L.push('| Intervalo | Lectura esperada (ms) | Por construcción (ms) | Valor normal |');
  L.push('|:--|:-:|:-:|:--|');
  L.push(`| PR | ${n0(m05.pr)}–${n0(m01.pr)} (${n0(m025.pr)}) | ${n0(r.dur.pr * 1000)} | 120–200 ms |`);
  L.push(`| QRS | ${n0(m05.qrs)}–${n0(m01.qrs)} (${n0(m025.qrs)}) | ${n0(r.dur.qrs * 1000)} | < 120 ms |`);
  L.push(`| QT | ${n0(m05.qt)}–${n0(m01.qt)} (${n0(m025.qt)}) | ${n0(r.qtConstr)} | — |`);
  L.push(`| QTc (Bazett) | ${n0(qtc(m05.qt))}–${n0(qtc(m01.qt))} (${n0(qtc(m025.qt))}) | ${n0(v.qtc * 1000)} | < ${v.sexo === 'mujer' ? 460 : 440} ms (${v.sexo === 'mujer' ? 'mujeres' : 'hombres'}) |`);

  // Efectos (dependen solo de la conexión)
  const Lstd = vectoresDeDerivacion(vec('correcto'));
  L.push('', '### Tabla R6. Efecto de cada conexión incorrecta sobre las 12 derivaciones · actividad 9', '');
  L.push('| Condición | Mensaje del equipo | ' + DERIVACIONES.join(' | ') + ' |');
  L.push('|:-|:-' + '|:-:'.repeat(DERIVACIONES.length) + '|');
  const texto = (e) => ({ igual: '=', invertida: '−', plana: 'plana', 'sin-senal': 'sin señal', distinta: '≠' }[e.tipo] ?? `${e.signo < 0 ? '−' : ''}${e.a}`);
  const mensajes = {
    'ra-la': 'ninguno («Conexión completa»)',
    'ra-rl': 'ninguno («Conexión completa»)',
    'la-suelto': '«LA desconectado · sin señal en I, III, aVR, aVL, aVF y V1–V6»',
    'sin-rl': '«RL (referencia) desconectado · interferencia de red elevada»',
  };
  for (const [id, nombre] of [['ra-la', 'RA↔LA'], ['ra-rl', 'RA↔RL'], ['la-suelto', 'LA desenganchado'], ['sin-rl', 'Sin RL (actividad 10)']]) {
    const ef = efectosDeConexion(vectoresDeDerivacion(vec(id)), Lstd);
    L.push(`| ${nombre} | ${mensajes[id]} | ${DERIVACIONES.map((d) => texto(ef[d])).join(' | ')} |`);
  }
  L.push('', '«=» igual a la referencia · «−» invertida · «X» registra lo que era la derivación X · «−X» registra X invertida · «≠» distinta de todas las derivaciones de la referencia. Con RA↔RL, **aVR = aVF = III/2** y cada precordial vale **Vi − II/3** (la TCW incluye ahora la pierna derecha). Sin RL, las derivaciones son las mismas, pero con más interferencia de red. Todos estos efectos son exactos en el modelo, que supone las dos piernas al mismo potencial.');

  L.push('', '### Tabla R7. Valores para verificar los registros de las conexiones incorrectas · actividades 9 y 10', '');
  L.push('| Condición | Qué comparar | Referencia | Con el error |');
  L.push('|:--|:--|:-:|:-:|');
  const qrs = (d) => `Q ${n2(a[d].q)} · R ${n2(a[d].r)} · S ${n2(a[d].s)} (neto ${n2(r.neto(d))})`;
  L.push(`| RA↔LA | I: ondas P y T | P ${n2(r.ondaP('I'))} · T ${n2(r.netoT('I'))} | P ${n2(-r.ondaP('I'))} · T ${n2(-r.netoT('I'))} |`);
  L.push(`| RA↔LA | I: complejo QRS (queda invertido) | ${qrs('I')} | r ${n2(-a.I.q)} · S ${n2(-a.I.r)} · r′ ${n2(-a.I.s)} (neto ${n2(-r.neto('I'))}) |`);
  L.push(`| RA↔LA | R de II y de III (se intercambian) | II ${n2(a.II.r)} · III ${n2(a.III.r)} | II ${n2(a.III.r)} · III ${n2(a.II.r)} |`);
  L.push(`| RA↔LA | R de aVR y de aVL (se intercambian) | aVR ${n2(a.aVR.r)} · aVL ${n2(a.aVL.r)} | aVR ${n2(a.aVL.r)} · aVL ${n2(a.aVR.r)} |`);
  L.push(`| RA↔RL | II: pico a pico del QRS | ${n2(r.ppII)} | ${n2(0)} (plana; solo ruido) |`);
  L.push(`| RA↔RL | I (= −III de la referencia): QRS neto y T | ${n2(r.neto('I'))} · T ${n2(r.netoT('I'))} | ${n2(-r.neto('III'))} · T ${n2(-r.netoT('III'))} |`);
  L.push(`| RA↔RL | aVR y aVF (= III/2): QRS neto | aVR ${n2(r.neto('aVR'))} · aVF ${n2(r.neto('aVF'))} | ${n2(r.neto('III') / 2)} en ambas |`);
  for (const d of ['V1', 'V6']) {
    const e = r.aRaRl[d];
    L.push(`| RA↔RL | ${d} (trazado = ${d} − II/3): R, S y neto | R ${n2(a[d].r)} · S ${n2(a[d].s)} (neto ${n2(r.neto(d))}) | R ${n2(e.r)} · S ${n2(e.s)} (neto ${n2(e.r + e.q + e.s)}) |`);
  }
  L.push(`| LA desenganchado | II (única derivación que queda) | R ${n2(a.II.r)} · neto ${n2(r.neto('II'))} | igual a la referencia |`);
  const mm = (mV) => (Math.round(mV * 100) / 10).toFixed(1).replace('.', ',');
  L.push(`| Sin RL (actividad 10) | grosor del trazo de II en el segmento T–P (pico a pico) | ${n2(r.grosor.ref)} mV (${mm(r.grosor.ref)} mm) | ${n2(r.grosor.sinRL)} mV (≈ ${mm(r.grosor.sinRL)} mm a 10 mm/mV); componentes de ${n2(r.interferencia.a60)} mV a 60 Hz y ${n2(r.interferencia.a180)} mV a 180 Hz |`);
  L.push('', 'Las identidades de la tabla R6 valen muestra a muestra; las amplitudes de los picos no se suman exactamente (por ejemplo, el neto de V1 con RA↔RL no es −0,83 − 0,84/3) porque los picos de cada derivación no ocurren en el mismo instante.');
  return L.join('\n');
}

const MARCA_INICIO = '<!-- referencias:inicio -->';
const MARCA_FIN = '<!-- referencias:fin -->';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ruta = fileURLToPath(new URL('../guias/docente/guia-docente.md', import.meta.url));
  const tablas = await generarReferencias();
  let guia = await readFile(ruta, 'utf8');
  const i = guia.indexOf(MARCA_INICIO);
  const j = guia.indexOf(MARCA_FIN);
  if (i < 0 || j < 0) throw new Error('No se encontraron las marcas en la guía del docente');
  guia = `${guia.slice(0, i + MARCA_INICIO.length)}\n\n${tablas}\n\n${guia.slice(j)}`;
  await writeFile(ruta, guia);
  console.log('Tablas de referencia actualizadas en guias/docente/guia-docente.md');
}
