/**
 * Equipo simulado: filtros fijos, detector de QRS, motor de adquisición, ruido e interferencia de red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pasoAlto1, pasoBajo2, ranura, CadenaFiltros } from '../../src/modelo/filtros.js';
import { MotorAdquisicion } from '../../src/equipo/adquisicion.js';
import { crearRegistro, ventanaFinal } from '../../src/equipo/registro.js';
import { construirSujeto, sujetoDeVoluntario } from '../../src/modelo/vectorCardiaco.js';
import { SUJETO_REFERENCIA } from '../../src/config/sujetos.js';
import { EQUIPO } from '../../src/config/equipo.js';
import { VOLUNTARIOS } from '../../src/config/voluntarios.js';
import { montajeCorrecto, montajeConNombre, intercambiarCables } from '../../src/conexiones/montajes.js';
import { torax, campo } from './ayudas.js';

const FS = 500;
const ajustes = (op = {}) => ({ ...EQUIPO.ajustesIniciales, encendido: true, ...op });

function motorCon(montaje, op = {}) {
  const sujeto = op.sujeto ?? construirSujeto(SUJETO_REFERENCIA);
  const m = new MotorAdquisicion({ sujeto, semilla: op.semilla ?? 42, campo });
  m.configurar({ montaje, ajustes: ajustes() }, { asentar: op.asentar ?? true });
  return m;
}

/** Amplitud de una componente sinusoidal de frecuencia f (proyección de Fourier). */
function amplitudEn(x, f, fs = FS) {
  let re = 0, im = 0, n = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) continue;
    re += x[i] * Math.cos((2 * Math.PI * f * i) / fs);
    im += x[i] * Math.sin((2 * Math.PI * f * i) / fs);
    n++;
  }
  return (2 * Math.hypot(re, im)) / n;
}

/** Energía de alta frecuencia: valor eficaz de la diferencia entre muestras consecutivas. */
function ruidoAlto(x) {
  let s = 0;
  for (let i = 1; i < x.length; i++) s += (x[i] - x[i - 1]) ** 2;
  return Math.sqrt(s / x.length);
}

test('Filtros fijos: ranura de 60 Hz, paso bajo de 150 Hz y constante de tiempo del paso alto', () => {
  const r = ranura(60, FS, 30);
  assert.ok(r.respuesta(60, FS) < 0.01, 'atenuación > 40 dB a 60 Hz');
  assert.ok(r.respuesta(10, FS) > 0.99 && r.respuesta(120, FS) > 0.97);
  const pb = pasoBajo2(150, FS);
  assert.ok(Math.abs(pb.respuesta(150, FS) - Math.SQRT1_2) < 0.01, '−3 dB en la frecuencia de corte');
  assert.ok(pb.respuesta(20, FS) > 0.99);
  const pa = pasoAlto1(0.05, FS);
  // respuesta al escalón: cae a 1/e en τ = 1/(2π·0,05) ≈ 3,18 s
  let y = 0;
  const n = Math.round(3.183 * FS);
  for (let i = 0; i < n; i++) y = pa.procesar(1);
  assert.ok(Math.abs(y - Math.exp(-1)) < 0.01, `salida en τ: ${y}`);
  const cadena = new CadenaFiltros(EQUIPO.filtros, FS);
  assert.ok(cadena.respuesta(10, FS) > 0.98, 'banda diagnóstica intacta a 10 Hz');
  assert.ok(cadena.respuesta(60, FS) < 0.01, 'ranura a 60 Hz');
  assert.deepEqual(EQUIPO.filtros, { pasoAlto: 0.05, pasoBajo: 150, ranura: 60, ranuraQ: 30 });
});

test('Motor: las identidades de Einthoven y Goldberger se conservan después de los filtros', () => {
  const m = motorCon(montajeCorrecto(torax));
  m.generar(FS * 6);
  const ini = m.total - FS * 4;
  const L = (d) => m.leer(d, ini, m.total);
  const I = L('I'), II = L('II'), III = L('III'), aVR = L('aVR'), aVL = L('aVL'), aVF = L('aVF');
  for (let i = 0; i < I.length; i++) {
    assert.ok(Math.abs(II[i] - I[i] - III[i]) < 2e-3);
    assert.ok(Math.abs(aVR[i] + aVL[i] + aVF[i]) < 2e-3);
  }
});

test('Motor: FC automática cercana a la del voluntario y un QRS detectado por latido', () => {
  for (const v of VOLUNTARIOS) {
    const m = motorCon(montajeCorrecto(torax), { sujeto: sujetoDeVoluntario(v), semilla: v.semilla });
    m.generar(FS * 30);
    const fc = m.frecuencia();
    assert.ok(fc && Math.abs(fc - v.fc) < 6, `voluntario ${v.id}: FC ${fc}`);
    const latidos = m.generador.latidos.filter((l) => l.inicio > 3 && l.inicio < 29.5).length;
    const det = m.detector.detecciones.filter((t) => t > 3 && t < 29.5).length;
    assert.ok(Math.abs(latidos - det) <= 1, `voluntario ${v.id}: latidos ${latidos}, detecciones ${det}`);
  }
});

test('Detector: la FC sigue siendo correcta con cada conexión incorrecta del procedimiento', () => {
  for (const v of VOLUNTARIOS) {
    for (const id of ['ra-la', 'ra-rl', 'la-suelto', 'sin-rl', 'v1v2-altos', 'la-ll', 'ra-ll', 'la-rl', 'll-rl']) {
      const m = motorCon(montajeConNombre(id, torax), { sujeto: sujetoDeVoluntario(v), semilla: v.semilla });
      m.generar(FS * 25);
      const fc = m.frecuencia();
      assert.ok(fc && Math.abs(fc - v.fc) < 7, `voluntario ${v.id}, ${id}: FC ${fc}`);
    }
  }
});

test('Motor: electrodo suelto → derivaciones dependientes sin señal (NaN)', () => {
  const m = motorCon(montajeConNombre('la-suelto', torax));
  m.generar(FS * 2);
  const ult = (d) => m.leer(d, m.total - 10, m.total);
  assert.ok(ult('I').every(Number.isNaN));
  assert.ok(ult('V3').every(Number.isNaN));
  assert.ok(ult('II').every(Number.isFinite));
});

test('Interferencia de red: sin RL aparece aunque la ranura de 60 Hz está fija; con RL es despreciable', () => {
  for (const v of VOLUNTARIOS) {
    const medir = (id) => {
      const m = motorCon(montajeConNombre(id, torax), { sujeto: sujetoDeVoluntario(v), semilla: v.semilla });
      m.generar(FS * 6);
      const x = m.leer('I', m.total - FS * 4, m.total);
      return { a60: amplitudEn(x, 60) + amplitudEn(x, 180), ruido: ruidoAlto(x) };
    };
    const con = medir('correcto');
    const sin = medir('sin-rl');
    assert.ok(con.a60 < 0.01, `voluntario ${v.id}, con RL: ${con.a60}`);
    assert.ok(sin.a60 > 0.03, `voluntario ${v.id}, sin RL: ${sin.a60}`);
    assert.ok(sin.ruido > 2 * con.ruido, `voluntario ${v.id}: el trazado sin RL debe verse más «grueso»`);
  }
});

test('Conectar un electrodo produce deriva de línea de base que «Restablecer» elimina', () => {
  const m = motorCon(montajeCorrecto(torax), { asentar: false });
  m.generar(Math.round(FS * 0.5));
  const media = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const antes = Math.abs(media(m.leer('I', m.total - 50, m.total)));
  m.restablecerLineaBase();
  m.generar(Math.round(FS * 0.5));
  const despues = Math.abs(media(m.leer('I', m.total - 50, m.total)));
  assert.ok(antes > 0.1, `desplazamiento inicial ${antes}`);
  assert.ok(despues < 0.15, `tras restablecer ${despues}`);
});

test('Pulso de calibración de 1 mV', () => {
  const m = motorCon(montajeCorrecto(torax));
  m.generar(FS);
  const ini = m.total;
  m.pulso1mV();
  m.generar(FS / 2);
  const conPulso = m.leer('V1', ini + 20, ini + 90);
  // la diferencia con el mismo tramo de un motor sin pulso es ≈ 1 mV
  const m2 = motorCon(montajeCorrecto(torax));
  m2.generar(FS);
  m2.generar(FS / 2);
  const sinPulso = m2.leer('V1', ini + 20, ini + 90);
  // El filtro paso alto de 0,05 Hz hace que el pulso «caiga» ≈ 6 % en 200 ms (como en el papel real)
  // y la ranura de 60 Hz añade una pequeña oscilación.
  for (let i = 0; i < conPulso.length; i++) {
    const d = conPulso[i] - sinPulso[i];
    assert.ok(d > 0.9 && d < 1.1, `muestra ${i}: ${d}`);
  }
});

test('Registro: copia de 20 s con metadatos y ventana final de 10 s', () => {
  const m = motorCon(montajeCorrecto(torax));
  m.generar(FS * 25);
  const r = crearRegistro(m, { ajustes: ajustes(), voluntario: 1, grupo: 'Prueba', numero: 1, condicion: 'referencia' });
  assert.equal(r.n, FS * 20);
  assert.equal(r.derivaciones.II.length, FS * 20);
  assert.ok(r.latidos.length >= 20);
  assert.equal(r.uniforme, true);
  assert.equal(r.voluntario, 1);
  const v = ventanaFinal(r, 10);
  assert.equal(v.n, FS * 10);
  assert.equal(v.derivaciones.V6[v.n - 1], r.derivaciones.V6[r.n - 1]);
});

test('Registro uniforme: solo si los 20 s corresponden a una misma conexión', () => {
  const m = motorCon(montajeCorrecto(torax));
  m.generar(FS * 25);
  m.configurar({ montaje: intercambiarCables(montajeCorrecto(torax), 'RA', 'LA'), ajustes: ajustes() });
  m.generar(FS * 10);
  const temprano = crearRegistro(m, { ajustes: ajustes(), numero: 2 });
  assert.equal(temprano.uniforme, false, 'incluye el cambio de hace 10 s');
  assert.ok(Math.abs(temprano.segundosSinCambios - 10) < 0.01);
  m.generar(FS * 10.5);
  assert.equal(crearRegistro(m, { ajustes: ajustes(), numero: 3 }).uniforme, true);
  // Cambiar velocidad o ganancia no es un cambio de conexión
  m.configurar({ montaje: m.config.montaje, ajustes: ajustes({ velocidad: 50, ganancia: 20 }) });
  assert.equal(crearRegistro(m, { ajustes: ajustes(), numero: 4 }).uniforme, true);
  // Mover un electrodo sí lo es
  const movido = structuredClone(m.config.montaje);
  movido.electrodos[movido.cables.V4].sitio.y += 2;
  m.configurar({ montaje: movido, ajustes: ajustes() });
  m.generar(FS);
  assert.equal(crearRegistro(m, { ajustes: ajustes(), numero: 5 }).uniforme, false);
});

test('Encender el equipo limpia el registro y reinicia el conteo de 20 s', () => {
  const m = new MotorAdquisicion({ sujeto: sujetoDeVoluntario(1), semilla: 1101, campo });
  const montaje = montajeCorrecto(torax);
  m.configurar({ montaje, ajustes: ajustes({ encendido: false }) });
  assert.equal(m.avanzar(1), 0, 'apagado no registra');
  m.configurar({ montaje, ajustes: ajustes() });
  m.generar(FS * 5);
  const r = crearRegistro(m, { ajustes: ajustes(), numero: 1 });
  assert.ok(r.duracion <= 5.01);
  assert.equal(r.uniforme, false);
});

test('Detector: tras invertir RA y LA (QRS de II mucho menor) recupera la FC en pocos segundos', () => {
  // Sujeto con eje del QRS cercano a +40°: con RA/LA invertidos, II registra lo que era III (casi perpendicular al eje).
  const sujeto = construirSujeto(SUJETO_REFERENCIA, { rotacionQRS: -18, rotacionT: -11 });
  const m = new MotorAdquisicion({ sujeto, semilla: 42, campo });
  m.configurar({ montaje: montajeCorrecto(torax), ajustes: ajustes() }, { asentar: true });
  m.generar(FS * 12);
  assert.ok(m.frecuencia(), 'FC antes del cambio');
  m.configurar({ montaje: montajeConNombre('ra-la', torax), ajustes: ajustes() }, { asentar: true });
  const tCambio = m.t;
  m.generar(FS * 8);
  const nuevas = m.detector.detecciones.filter((t) => t > tCambio);
  assert.ok(nuevas.length >= 4, `detecciones tras el cambio: ${nuevas.length}`);
  const fc = m.frecuencia();
  assert.ok(fc && Math.abs(fc - 68) < 8, `FC ${fc}`);
});

test('Cambiar de sujeto (posible ampliación futura) reinicia la señal con el nuevo ritmo', () => {
  const m = motorCon(montajeCorrecto(torax), { sujeto: sujetoDeVoluntario(1), semilla: 1101 });
  m.generar(FS * 10);
  const otro = construirSujeto(SUJETO_REFERENCIA, { fc: 88 });
  m.cambiarSujeto(otro, 6606);
  assert.equal(m.total - m.primeraDisponible(), 0, 'búfer vacío');
  m.generar(FS * 25);
  assert.ok(Math.abs(m.frecuencia() - 88) < 6, `FC ${m.frecuencia()}`);
});
