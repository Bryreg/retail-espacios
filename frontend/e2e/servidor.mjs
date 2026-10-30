/**
 * El servidor de los recorridos E2E (auditoría pre-lanzamiento, P1-19): el
 * backend DE VERDAD (FastAPI) con una base SQLite descartable, sirviendo el
 * `frontend/dist` ya construido —lo mismo que corre en Render, sin el proxy de
 * Vite—. Lo lanza `playwright.config.ts` (`webServer`).
 *
 * - La base va en una carpeta temporal nueva en cada arranque: nunca toca
 *   `backend/retail_espacios.db` ni ninguna base del repo. Los datos los siembra
 *   cada recorrido por la API (`e2e/sembrar.ts`).
 * - `ENV=test`, un `JWT_SECRET` largo y el ingreso por clave (`LOGIN_LEGADO=1`)
 *   con claves propias de la prueba: la pantalla sólo ofrece Google/correo
 *   (Firebase), que acá no hay.
 *
 * Variables: `E2E_PYTHON` (el intérprete con las dependencias del backend; por
 * defecto `python3`), `E2E_PORT` (8765), `E2E_TMP` (dónde crear la carpeta).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JWT_SECRET_E2E, PUERTO_E2E } from "./constantes.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const backend = join(aqui, "..", "..", "backend");
const dist = join(aqui, "..", "dist", "index.html");
if (!existsSync(dist)) {
  console.error("[e2e] Falta frontend/dist: corré `npm run build` antes de los recorridos.");
  process.exit(1);
}

const carpeta = mkdtempSync(join(process.env.E2E_TMP || tmpdir(), "recabra-e2e-"));
const puerto = String(PUERTO_E2E);
const python = process.env.E2E_PYTHON || "python3";

const hijo = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", puerto], {
  cwd: backend,
  stdio: "inherit",
  env: {
    ...process.env,
    ENV: "test",
    DATABASE_URL: `sqlite:///${join(carpeta, "recabra.db")}`,
    JWT_SECRET: JWT_SECRET_E2E,
    LOGIN_LEGADO: "1",
    ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || "clave-admin-e2e",
    WORKER_PASSWORD: process.env.E2E_WORKER_PASSWORD || "clave-worker-e2e",
    // Sin correo de verdad, sin respaldo, sin Sentry: nada sale de la máquina.
    SMTP_USER: "", SMTP_PASSWORD: "", EMAIL_API_KEY: "", SENTRY_DSN: "", LOG_FORMAT: "texto",
    APP_URL: `http://127.0.0.1:${puerto}`,
  },
});

const cerrar = () => {
  hijo.kill("SIGTERM");
  try { rmSync(carpeta, { recursive: true, force: true }); } catch { /* ya no está */ }
};
process.on("SIGINT", () => { cerrar(); process.exit(0); });
process.on("SIGTERM", () => { cerrar(); process.exit(0); });
hijo.on("exit", (code) => { try { rmSync(carpeta, { recursive: true, force: true }); } catch { /* */ } process.exit(code ?? 0); });
