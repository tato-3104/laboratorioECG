/**
 * Pruebas de extremo a extremo (Playwright). Ejecutar con:  npm run test:e2e
 * Levanta el servidor local en el puerto 4173 y abre la aplicación con «?pruebas», que expone
 * window.laboratorioECG para leer el búfer del equipo.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/servidor.mjs 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }, grepInvert: /@telefono/ },
    { name: 'telefono', use: { ...devices['Pixel 7'] }, grep: /@telefono/ },
  ],
});
