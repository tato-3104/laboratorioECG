/**
 * Coherencia de las guías con el laboratorio y entre sí.
 * Si falla la de las tablas: ejecute `npm run referencias`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generarReferencias } from '../../tools/valores-referencia.mjs';

test('Guía del docente: tablas de referencia actualizadas', async () => {
  const guia = await readFile(new URL('../../guias/docente/guia-docente.md', import.meta.url), 'utf8');
  assert.ok(guia.includes(await generarReferencias()), 'ejecute npm run referencias');
});

test('Guía del estudiante: los 17 pasos del procedimiento, con los mismos títulos del laboratorio', async () => {
  const { PASOS } = await import('../../src/procedimiento/pasos.js');
  const guia = await readFile(new URL('../../guias/estudiante/guia-estudiante.md', import.meta.url), 'utf8');
  PASOS.forEach((p, i) => assert.ok(guia.includes(`**Paso ${i + 1}. ${p.titulo}.**`), `paso ${i + 1}: ${p.titulo}`));
  assert.ok(!guia.includes('**Paso 18.'));
  assert.ok(!/\bgrupo\b|compañer|parejas|voluntario asignado/i.test(guia), 'la guía es para trabajo individual');
});

test('Guías coherentes: las mismas diez actividades, con los mismos títulos, en ambas guías', async () => {
  const leer = (ruta) => readFile(new URL(ruta, import.meta.url), 'utf8');
  const titulos = (guia) => [...guia.matchAll(/\*\*Actividad (\d+)\. ([^*]+?)\*\*/g)].map((m) => `${m[1]}. ${m[2]}`);
  const estudiante = titulos(await leer('../../guias/estudiante/guia-estudiante.md'));
  const docente = titulos(await leer('../../guias/docente/guia-docente.md'));
  assert.equal(estudiante.length, 10);
  assert.deepEqual(estudiante.map((t) => Number.parseInt(t, 10)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(docente, estudiante);
});

test('Guía del docente: un solo sujeto y trabajo individual', async () => {
  const guia = await readFile(new URL('../../guias/docente/guia-docente.md', import.meta.url), 'utf8');
  assert.ok(!/voluntario [2-6]\b|\?voluntario=|seis voluntarios|parejas/i.test(guia));
  assert.ok(guia.includes('17 pasos') && guia.includes('4 registros'));
});
