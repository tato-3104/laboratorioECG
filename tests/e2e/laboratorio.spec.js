/**
 * Recorridos completos por la interfaz (versión 2): banco vacío, procedimiento de 17 pasos con un único sujeto,
 * revisión del montaje, registros con nombre de condición, herramientas y adaptación a teléfono.
 */
import { test, expect } from '@playwright/test';

const errores = new WeakMap();

test.beforeEach(async ({ page }) => {
  const lista = [];
  errores.set(page, lista);
  page.on('pageerror', (e) => lista.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') lista.push(m.text());
  });
  await page.addInitScript(() => {
    try {
      // Se borra solo en la primera carga de cada prueba (para poder probar la recarga).
      if (!sessionStorage.getItem('prueba-iniciada')) {
        localStorage.clear();
        sessionStorage.setItem('prueba-iniciada', '1');
      }
    } catch {}
  });
  await page.goto('/?pruebas');
  await page.waitForFunction(() => window.laboratorioECG);
  await page.evaluate(() => window.laboratorioECG.archivo.vaciar());
});

test.afterEach(async ({ page }) => {
  expect(errores.get(page), 'errores en la consola').toEqual([]);
  const texto = await page.locator('body').innerText();
  expect(texto, 'textos de depuración visibles').not.toMatch(/\b(null|undefined|NaN)\b/);
});

/** Coloca un montaje de referencia (atajo de las pruebas; el estudiante lo hace a mano). */
async function montar(page, id) {
  await page.evaluate(async (id) => {
    const { montajeConNombre } = await import('/src/conexiones/montajes.js');
    const L = window.laboratorioECG;
    L.almacen.actualizar({ montaje: montajeConNombre(id, L.torax) });
  }, id);
}
/** Avanza el tiempo simulado del equipo. */
const avanzar = (page, s) => page.evaluate((s) => { const m = window.laboratorioECG.motor; for (let i = 0; i < s * 4; i++) m.generar(125); }, s);
const hechos = (page) => page.evaluate(() => window.laboratorioECG.almacen.obtener().procedimiento.hechos);

test('arranca con el banco vacío, el equipo apagado y el procedimiento en el paso 1', async ({ page }) => {
  await expect(page).toHaveTitle('Laboratorio virtual de ECG');
  await expect(page.locator('#txt-encendido')).toHaveText('Apagado');
  await expect(page.locator('#cuenta-pinza')).toHaveText('4');
  await expect(page.locator('#progreso-texto')).toContainText('0 de 17');
  await expect(page.locator('.paso.actual')).toContainText('Conecte el cable de paciente');
  await expect(page.locator('#filtros-fijos')).toContainText('0,05 Hz');
  await expect(page.locator('#modo-exploracion, #sel-escenario, #btn-alcohol, #btn-tenso, input[name="estandar"], #sel-paso-alto, #sel-voluntario, #chip-voluntario, #in-grupo')).toHaveCount(0);
});

test('procedimiento completo: 17 pasos y registros con el nombre de cada condición', async ({ page }) => {
  await page.click('#btn-conector');
  await page.click('#btn-encendido');
  await page.waitForTimeout(1600);
  await page.click('#btn-paciente');
  await expect(page.locator('#ficha-voluntario')).toContainText('Hombre, 21 años');
  await page.fill('#in-nombre', 'Ana Pérez');
  await page.click('#btn-guardar-paciente');
  await expect(page.locator('#pantalla-paciente')).toHaveText('SUJETO · HOMBRE · 21 AÑOS');
  await expect(page.locator('.paso[data-paso="datos"]')).toHaveClass(/hecho/);
  await montar(page, 'correcto');
  await expect(page.locator('#pantalla-mensaje')).toContainText('Conexión completa');
  await page.click('#btn-revisar');
  await expect(page.locator('#resultado-revision')).toContainText('Montaje correcto');
  await page.click('#btn-1mv');
  await avanzar(page, 21);
  await page.click('#btn-imprimir');
  await expect(page.locator('#t-dlg-registro')).toContainText('Referencia');
  await expect(page.locator('#registro-paginas svg')).toHaveCount(2);
  await expect(page.locator('#registro-paginas svg').first()).toContainText('Sujeto: hombre, 21 años');
  await expect(page.locator('#registro-paginas svg').first()).toContainText('Estudiante: Ana Pérez');
  await page.click('#btn-reg-cerrar');
  for (const id of ['ra-la', 'ra-rl', 'la-suelto']) {
    await montar(page, id);
    await avanzar(page, 5);
    await page.click('#btn-imprimir');
    await expect(page.locator('#aviso-registro')).toContainText('cambio de conexión');
    await page.click('#btn-reg-cerrar');
    await avanzar(page, 16);
    await page.click('#btn-imprimir');
    await expect(page.locator('#aviso-registro')).toBeHidden();
    await page.click('#btn-reg-cerrar');
  }
  expect((await hechos(page)).length).toBe(14);
  await page.click('#btn-retirar-todo');
  await page.click('#btn-encendido');
  await page.click('#btn-conector');
  await expect(page.locator('#progreso-texto')).toContainText('17 de 17');
  await page.click('#tab-registros');
  await expect(page.locator('.registro-item')).toHaveCount(7);
});

test('revisar montaje: veredicto, detalles a pedido y aviso de revisión desactualizada', async ({ page }) => {
  await page.click('#btn-conector');
  await montar(page, 'ra-la');
  await page.click('#btn-revisar');
  await expect(page.locator('#resultado-revision')).toContainText('1 problema');
  await expect(page.locator('#resultado-revision')).not.toContainText('intercambiados');
  await page.click('#btn-detalles-revision');
  await expect(page.locator('#resultado-revision')).toContainText('RA y LA están intercambiados');
  await montar(page, 'correcto');
  await expect(page.locator('#resultado-revision')).toContainText('cambió después de esta revisión');
});

test('un terminal soltado donde no hay electrodo no coloca nada', async ({ page }) => {
  await page.locator('.terminal[data-entrada="RA"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#estado-paciente')).toContainText('no hay un electrodo');
  await expect(page.locator('#cuenta-pinza')).toHaveText('4');
});

test('equipo: LA desenganchado avisa y la inversión RA/LA no; la FC sigue correcta con RA↔RL', async ({ page }) => {
  await page.click('#btn-conector');
  await page.click('#btn-encendido');
  await montar(page, 'la-suelto');
  await expect(page.locator('#pantalla-mensaje')).toContainText('LA desconectado · sin señal en I, III, aVR, aVL, aVF y V1–V6');
  await montar(page, 'ra-rl');
  await expect(page.locator('#pantalla-mensaje')).toContainText('Conexión completa');
  await avanzar(page, 20);
  const fc = await page.evaluate(() => window.laboratorioECG.motor.frecuencia());
  expect(Math.abs(fc - 68)).toBeLessThan(7);
});

test('herramientas: ecuaciones sin conclusiones y vector cardíaco estático con vector de prueba', async ({ page }) => {
  await page.click('#btn-conector');
  await page.click('#btn-encendido');
  await montar(page, 'ra-la');
  await page.click('#tab-ecuaciones');
  for (const d of ['I', 'II', 'aVR', 'V3']) {
    await page.click(`#herr-ecuaciones button[data-derivacion="${d}"]`);
    await expect(page.locator('#herr-ecuaciones')).not.toContainText('invertida');
  }
  await page.click('#tab-vector');
  await page.click('#herr-vector button[data-derivacion="aVL"]');
  await expect(page.locator('#herr-vector')).toContainText('−30°');
  await page.fill('#in-vector-prueba', '60');
  await expect(page.locator('#herr-vector .tabla-proyecciones')).toContainText('casi isoeléctrica');
  await page.click('#herr-vector button[data-derivacion="V1"]');
  await expect(page.locator('#herr-vector')).toContainText('Plano horizontal');
});

test('los registros sobreviven a una recarga de la página', async ({ page }) => {
  await page.click('#btn-conector');
  await page.click('#btn-encendido');
  await page.waitForTimeout(1600);
  await montar(page, 'correcto');
  await avanzar(page, 21);
  await page.click('#btn-imprimir');
  await page.click('#btn-reg-cerrar');
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => window.laboratorioECG);
  await page.waitForTimeout(500);
  await page.click('#tab-registros');
  await expect(page.locator('.registro-item')).toHaveCount(1);
  await expect(page.locator('.paso[data-paso="conectar-cable"]')).toHaveClass(/hecho/);
});

test('@telefono la página no se desborda y las pestañas cambian de zona', async ({ page }) => {
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  const vista = await page.evaluate(() => window.innerWidth);
  expect(ancho).toBeLessThanOrEqual(vista);
  await expect(page.locator('#zona-panel')).toBeVisible();
  await page.click('.pestanas-moviles button[data-zona="paciente"]');
  await expect(page.locator('#zona-paciente')).toBeVisible();
  await expect(page.locator('#zona-equipo')).toBeHidden();
  await page.click('.pestanas-moviles button[data-zona="equipo"]');
  await expect(page.locator('#pantalla')).toBeVisible();
  await expect(page.locator('#btn-encendido')).toBeVisible();
});

test.describe('archivo único', () => {
  test('dist/laboratorio-ecg.html funciona abierto directamente, sin servidor', async ({ browser }) => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const raiz = fileURLToPath(new URL('../..', import.meta.url));
    execFileSync(process.execPath, ['tools/construir-archivo-unico.mjs'], { cwd: raiz });
    const pagina = await browser.newPage();
    const fallos = [];
    pagina.on('pageerror', (e) => fallos.push(e.message));
    await pagina.goto(`file://${raiz}dist/laboratorio-ecg.html`);
    await pagina.click('#btn-conector');
    await pagina.click('#btn-encendido');
    await expect(pagina.locator('#pantalla-mensaje')).toContainText('Sin electrodos', { timeout: 8000 });
    await expect(pagina.locator('#progreso-texto')).toContainText('2 de 17');
    expect(fallos).toEqual([]);
    await pagina.close();
  });
});
