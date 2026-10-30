import { defineConfig, devices } from "@playwright/test";

/**
 * Los recorridos de extremo a extremo (auditoría pre-lanzamiento, P1-19 y
 * P2-21). Corren contra el backend de verdad sirviendo el `dist` construido
 * (`e2e/servidor.mjs`), con una base SQLite nueva en cada corrida.
 *
 *   npm run build && npm run e2e
 *
 * En CI los corre el job «E2E» de `.github/workflows/deploy.yml`. Localmente,
 * `E2E_PYTHON` apunta al intérprete con las dependencias del backend y, si el
 * Chromium no es el que trae esta versión de Playwright, `PW_CHROMIUM` a su
 * ejecutable.
 */
const PUERTO = Number(process.env.E2E_PORT || 8765);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts$/,
  // Comparten UN servidor (un proceso, como en Render) y cada recorrido arma
  // su propia sede: pueden ir en paralelo, pero pocos a la vez.
  workers: process.env.CI ? 2 : 3,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../e2e-informe" }]] : [["list"]],
  outputDir: "../e2e-resultados",
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "node e2e/servidor.mjs",
    cwd: "..",
    url: `http://127.0.0.1:${PUERTO}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
