/**
 * Procedimiento: clasificación de la condición de cada registro y lógica de los 17 pasos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarCondicion, CONDICIONES } from '../../src/procedimiento/condiciones.js';
import { PASOS, PARTES, pasosActivos, evaluarPasos, pasoActual, PASOS_DE_REGISTRO } from '../../src/procedimiento/pasos.js';
import { montajeCorrecto, montajeConNombre, intercambiarCables, posicionesV1V2Altas } from '../../src/conexiones/montajes.js';
import { montajeVacio, colocarElectrodo, conectarCable, conectarTroncal, moverElectrodo } from '../../src/conexiones/montaje.js';
import { resolverEntradas } from '../../src/conexiones/entradas.js';
import { sitioPinzaHabitual } from '../../src/conexiones/sitios.js';
import { torax } from './ayudas.js';

test('Clasificación: el montaje correcto y los tres errores de la práctica', () => {
  assert.equal(clasificarCondicion(montajeCorrecto(torax), torax), 'referencia');
  for (const id of ['ra-la', 'ra-rl', 'la-suelto']) {
    assert.equal(clasificarCondicion(montajeConNombre(id, torax), torax), id, id);
    assert.ok(CONDICIONES[id].nombre && CONDICIONES[id].corto);
  }
});

test('Clasificación: otros errores no se nombran (no revelan qué tienen)', () => {
  for (const id of ['la-ll', 'ra-ll', 'll-rl', 'la-rl', 'bilateral', 'v1-v2', 'v4-suelto', 'v5v6-eic', 'ra-la-compartido', 'sin-troncal', 'sin-rl', 'v1v2-altos']) {
    assert.equal(clasificarCondicion(montajeConNombre(id, torax), torax), null, id);
  }
  // Dos errores a la vez tampoco cuentan para un paso.
  const doble = intercambiarCables(montajeConNombre('ra-la', torax), 'V1', 'V2');
  assert.equal(clasificarCondicion(doble, torax), null);
  // Un electrodo precordial fuera de su sitio tampoco.
  let soloV1 = montajeCorrecto(torax);
  soloV1 = moverElectrodo(soloV1, soloV1.cables.V1, { zona: 'torso', ...posicionesV1V2Altas(torax).V1 }).montaje;
  assert.equal(clasificarCondicion(soloV1, torax), null);
});

test('Clasificación: LA retirado del todo (no solo desenganchado) también cuenta', () => {
  const m = montajeCorrecto(torax);
  const sinPinzaLA = { ...m, electrodos: Object.fromEntries(Object.entries(m.electrodos).filter(([id]) => id !== m.cables.LA)), cables: { ...m.cables, LA: null } };
  assert.equal(clasificarCondicion(sinPinzaLA, torax), 'la-suelto');
});

// ------------------------------------------------------------------ pasos
const pasos = pasosActivos();
function contexto(op = {}) {
  const montaje = op.montaje ?? montajeVacio();
  const ajustes = { encendido: false, ...op.ajustes };
  return {
    montaje,
    ajustes,
    paciente: { voluntario: 1, nombre: '', ...op.paciente },
    registros: op.registros ?? [],
    eventos: { revisionCorrecta: false, calibrado: false, ...op.eventos },
    entradas: resolverEntradas(montaje, { encendido: ajustes.encendido }),
  };
}
const reg = (condicion, op = {}) => ({ condicion, uniforme: true, voluntario: 1, ...op });

test('Pasos: 17 en seis partes, con identificadores únicos', () => {
  assert.equal(PASOS.length, 17);
  assert.equal(pasos.length, 17);
  assert.equal(new Set(PASOS.map((p) => p.id)).size, 17);
  assert.deepEqual([...new Set(PASOS.map((p) => p.parte))], PARTES.map((p) => p.id));
  assert.equal(pasosActivos({ revisionHabilitada: false }).length, 16);
  assert.deepEqual(PASOS_DE_REGISTRO, ['referencia', 'ra-la', 'ra-rl', 'la-suelto']);
});

test('Pasos: al empezar no hay ninguno cumplido (el banco está vacío y el equipo apagado)', () => {
  assert.deepEqual(evaluarPasos(pasos, contexto()), []);
  assert.equal(pasoActual(pasos, []).id, 'conectar-cable');
});

test('Pasos: las partes A–C solo exigen hacer la acción, no hacerla bien', () => {
  // Pinzas en las cuatro extremidades, pero con los cables de los brazos intercambiados.
  const m = intercambiarCables(montajeCorrecto(torax), 'RA', 'LA');
  const hechos = evaluarPasos(pasos, contexto({ montaje: m, ajustes: { encendido: true }, paciente: { nombre: 'Ana' } }));
  assert.deepEqual(hechos, ['conectar-cable', 'encender', 'datos', 'pinzas', 'adhesivos', 'cables-extremidades', 'cables-precordiales', 'senal-completa']);
});

test('Pasos: dos pinzas en la misma extremidad no cumplen «una pinza en cada extremidad»', () => {
  let m = conectarTroncal(montajeVacio(), true);
  for (const z of ['brazo_der', 'brazo_der', 'pierna_izq', 'pierna_der']) m = colocarElectrodo(m, 'pinza', sitioPinzaHabitual(z)).montaje;
  assert.ok(!evaluarPasos(pasos, contexto({ montaje: m })).includes('pinzas'));
});

test('Pasos: los registros cuentan solo si son uniformes y del sujeto actual', () => {
  const base = { montaje: montajeCorrecto(torax), ajustes: { encendido: true }, paciente: { nombre: 'Ana' }, eventos: { revisionCorrecta: true, calibrado: true } };
  assert.ok(!evaluarPasos(pasos, contexto({ ...base, registros: [reg('referencia', { uniforme: false })] })).includes('referencia'));
  assert.ok(!evaluarPasos(pasos, contexto({ ...base, registros: [reg('referencia', { voluntario: 2 })] })).includes('referencia'));
  const todos = PASOS_DE_REGISTRO.map((c) => reg(c));
  const hechos = evaluarPasos(pasos, contexto({ ...base, registros: todos }));
  for (const id of PASOS_DE_REGISTRO) assert.ok(hechos.includes(id), id);
  assert.equal(pasoActual(pasos, hechos).id, 'retirar');
});

test('Pasos: el cierre solo se marca después de las partes A–E; los pasos cumplidos se conservan', () => {
  // Banco vacío y equipo apagado, pero sin haber hecho nada: el cierre no se marca.
  assert.ok(!evaluarPasos(pasos, contexto()).includes('retirar'));
  // Con A–E cumplidos, retirar, apagar y desconectar completan el procedimiento.
  const previos = pasos.filter((p) => !p.cierre).map((p) => p.id);
  const fin = evaluarPasos(pasos, contexto(), previos);
  assert.equal(fin.length, 17);
  assert.equal(pasoActual(pasos, fin), null);
  // Apagar sin haber retirado los electrodos no marca «apagar».
  const conElectrodos = evaluarPasos(pasos, contexto({ montaje: montajeCorrecto(torax) }), previos);
  assert.ok(!conElectrodos.includes('apagar') && !conElectrodos.includes('retirar'));
});

test('Pasos: sin «Revisar montaje» (deshabilitado por el docente) el procedimiento tiene 16 pasos y se puede completar', () => {
  const p16 = pasosActivos({ revisionHabilitada: false });
  const previos = p16.filter((p) => !p.cierre).map((p) => p.id);
  assert.ok(!previos.includes('revisar'));
  assert.equal(evaluarPasos(p16, contexto(), previos).length, 16);
});
