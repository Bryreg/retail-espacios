/* Ningún texto del plano pisando otro, a 1× / 1,5× / 2× (y con la rueda).
   Se miden los rects de TODOS los <text> del plano y de los textos HTML que
   flotan encima (las herramientas), y se cruzan todos contra todos. */
import { abrir } from "./abrir.mjs";

const w = +(process.argv[2] || 1440), h = +(process.argv[3] || 900), tema = process.argv[4] || "claro";
const { browser, page, errores } = await abrir({ w, h, tema });

const medir = async () => page.evaluate(() => {
  const lienzo = document.querySelector(".lienzo");
  const cajas = [];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  lienzo.querySelectorAll("text").forEach((t) => {
    if (!visible(t)) return;
    const r = t.getBoundingClientRect();
    if (r.width < 1) return;
    cajas.push({ q: t.getAttribute("data-cod") || t.textContent.trim(), ...r.toJSON() });
  });
  lienzo.querySelectorAll(".herr button").forEach((b) => {
    const r = b.getBoundingClientRect();
    cajas.push({ q: "HUD:" + b.textContent.trim(), ...r.toJSON() });
  });
  const lz = lienzo.getBoundingClientRect();
  const cortados = cajas.filter((c) => c.left < lz.left - 0.5 || c.right > lz.right + 0.5
                                    || c.top < lz.top - 0.5 || c.bottom > lz.bottom + 0.5);
  const choques = [];
  let holgura = Infinity;
  for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
    const a = cajas[i], b = cajas[j];
    const dx = Math.max(a.left - b.right, b.left - a.right);
    const dy = Math.max(a.top - b.bottom, b.top - a.bottom);
    if (dx < 0 && dy < 0) choques.push([a.q, b.q, Math.round(-dx), Math.round(-dy)]);
    else holgura = Math.min(holgura, Math.max(dx, dy));
  }
  const tam = [...new Set(cajas.filter(c => !c.q.startsWith("HUD"))
    .map((c) => getComputedStyle(document.querySelector(".lienzo text")).fontSize))];
  return { n: cajas.length, choques, cortados: cortados.map(c => c.q),
           holgura: Math.round(holgura * 10) / 10, tam };
});

const lbl = async () => page.evaluate(() => {
  const t = document.querySelector(".rotulos .p-cod");
  if (!t) return null;
  // el cuerpo REAL en pantalla: font-size del SVG × escala de la matriz
  const m = t.getScreenCTM();
  const fs = parseFloat(getComputedStyle(t).fontSize);
  return Math.round(fs * Math.hypot(m.a, m.b) * 100) / 100;
});

const zoom = async (z) => {
  await page.evaluate(() => document.querySelector("#zCentrar")?.click());
  const veces = Math.round(Math.log(z) / Math.log(1.25));
  for (let i = 0; i < Math.abs(veces); i++) {
    await page.click(veces > 0 ? ".herr button[aria-label='Acercar el plano']" : ".herr button[aria-label='Alejar el plano']");
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
};

console.log(`\n== ${w}x${h} · ${tema} ==`);
for (const z of [1, 1.5625, 1.953]) {   // 1 · 1,25² ≈1,56 · 1,25³ ≈1,95
  if (z !== 1) await zoom(z); else await page.waitForTimeout(80);
  const r = await medir();
  console.log(`zoom≈${z.toFixed(2)}  textos=${r.n}  choques=${r.choques.length}  cortados=${r.cortados.length}  holgura=${r.holgura}  cuerpo=${await lbl()}px`);
  if (r.choques.length) console.log("   ", r.choques.slice(0, 6));
  if (r.cortados.length) console.log("   cortados:", r.cortados.slice(0, 6));
  await page.evaluate(() => document.querySelector(".herr button:nth-child(3)").click());
  await page.waitForTimeout(80);
}
// barrido con la rueda por nueve puntos del lienzo
const lz = await page.evaluate(() => { const r = document.querySelector(".lienzo").getBoundingClientRect(); return r.toJSON(); });
let peor = 0, totalCortados = 0, encuadres = 0;
for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.25, 0.5, 0.75]) for (const paso of [3, 6, -3]) {
  await page.evaluate(() => document.querySelector(".herr button:nth-child(3)").click());
  const x = lz.x + lz.width * fx, y = lz.y + lz.height * fy;
  await page.mouse.move(x, y);
  for (let i = 0; i < Math.abs(paso); i++) await page.mouse.wheel(0, paso > 0 ? -120 : 120);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await medir();
  encuadres++; peor = Math.max(peor, r.choques.length); totalCortados += r.cortados.length;
  if (r.choques.length) console.log("  CHOQUE en", fx, fy, paso, r.choques.slice(0, 3));
}
console.log(`barrido: ${encuadres} encuadres · choques máx ${peor} · cortados ${totalCortados}`);
const cc={}; for(const e of errores) cc[e.slice(0,110)]=(cc[e.slice(0,110)]||0)+1; console.log("errores de consola:", cc);
await browser.close();
