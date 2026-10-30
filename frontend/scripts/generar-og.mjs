/**
 * Rehace `public/og-recabra.png`, la imagen de la tarjeta compartida
 * (`og:image`, auditoría pre-lanzamiento P3-14).
 *
 * Es una captura de la landing de ESTE repo —el plano isométrico de ejemplo,
 * la leyenda de estados y el titular— a 1200 × 630: nada de imágenes de
 * terceros ni datos de un cliente (el plano de la landing es ilustrativo). Se
 * corre a mano cuando la portada cambia:
 *
 *   npm run build && npx vite preview --port 5310 &
 *   node scripts/generar-og.mjs http://localhost:5310/
 *
 * Se renderiza a 1600 × 840 con escala 0,75 (sale 1200 × 630 con la
 * composición de una pantalla de escritorio) y se ocultan los textos chicos
 * del pie del hero, que en la tarjeta quedaban cortados.
 */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.argv[2] || "http://localhost:5310/";
const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og-recabra.png");
const OCULTAR = ["El registro se hace", "Los datos del plano", "Arrastre para moverse"];

const navegador = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75, colorScheme: "dark" });
await pagina.goto(url, { waitUntil: "networkidle" });
await pagina.waitForTimeout(1500);
await pagina.evaluate((prefijos) => {
  for (const el of document.querySelectorAll("p, span, div")) {
    const t = (el.textContent || "").trim();
    if (el.children.length <= 2 && prefijos.some((x) => t.startsWith(x))) el.style.visibility = "hidden";
  }
}, OCULTAR);
await pagina.screenshot({ path: salida });
await navegador.close();
console.log(`listo: ${salida}`);
