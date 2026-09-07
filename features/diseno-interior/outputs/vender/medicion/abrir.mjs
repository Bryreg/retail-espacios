/* Abre Vender con datos reales servidos por stubs de la API.
   Uso: import { abrir, cerrar } desde otro script. */
import { chromium } from "playwright";
import { FIXTURES, RATES } from "./datos.mjs";

export const BASE = process.env.BASE || "http://localhost:5231";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function abrir({ w = 1440, h = 900, tema = "claro" } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ([tema]) => {
      localStorage.setItem("retail-auth-v1", JSON.stringify({
        state: { token: "t", role: "admin", cliente: null, clienteNombre: null,
                 email: "a@b.c", nombre: "Admin", avisoCuenta: null,
                 pedirConsentimiento: false, plataforma: false },
        version: 0,
      }));
      localStorage.setItem("recabra-tema", tema);
    },
    [tema],
  );
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const u = new URL(route.request().url()).pathname;
    if (u.endsWith("/layout/")) return route.fulfill(json([{ sede: "NAVE", fixtures: FIXTURES, updated_at: "1" }]));
    if (u.endsWith("/layout/revisions")) return route.fulfill(json([{ sede: "NAVE", updated_at: "1", count: FIXTURES.length }]));
    if (u.endsWith("/layout/settings")) return route.fulfill(json({ sedes: ["NAVE", "TERRON"], catalog_labels: {}, updated_at: "1" }));
    if (u.endsWith("/layout/rates")) return route.fulfill(json(RATES));
    if (u.endsWith("/layout/seasons")) return route.fulfill(json({ windows: {} }));
    if (u.includes("/mounts")) return route.fulfill(json([]));
    if (u.includes("recipients") || u.includes("notif")) {
      return route.fulfill(json({ smtp_listo: true, comercial: ["comercial@nave.co"], montaje: ["merca@nave.co"] }));
    }
    if (u.includes("plataforma")) return route.fulfill(json(false));
    return route.fulfill(json({}));
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  try { await page.waitForSelector(".vender-hoja", { timeout: 15000 }); }
  catch (e) { console.log("TEXTO:", (await page.evaluate(() => document.body.innerText)).slice(0, 500)); console.log("ERR:", errores.slice(0,6)); throw e; }
  await page.waitForTimeout(700);
  return { browser, ctx, page, errores };
}
