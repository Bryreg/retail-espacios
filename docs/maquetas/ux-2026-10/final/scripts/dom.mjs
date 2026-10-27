// Recorre las páginas generadas en el navegador y anota todo lo verificable:
// cifras (data-v), campos de la base (data-campo), espacios (data-ref), enlaces,
// secciones del inventario (data-sec) y títulos nuevos. Escribe salida/dom.json.
import { chromium } from "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/verif17/herr/comun.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const D = process.argv[2];
const paginas = JSON.parse(readFileSync(`${D}/paginas.json`, "utf8"));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errores = []; p.on("pageerror", (e) => errores.push(e.message)); p.on("console", (m) => m.type() === "error" && errores.push(m.text()));
const salida = {};
for (const pg of paginas) {
  await p.goto(`file://${D}/${pg}.html`);
  salida[pg] = await p.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent.trim() ?? "",
    v: [...document.querySelectorAll("[data-v]")].map((e) => [e.dataset.v, e.textContent.trim()]),
    campo: [...document.querySelectorAll("[data-campo]")].map((e) => [e.dataset.campo, e.textContent.trim()]),
    ref: [...document.querySelectorAll("a[data-ref]")].map((e) => [e.dataset.ref, e.getAttribute("href")]),
    enlaces: [...document.querySelectorAll("a[href]")].map((e) => e.getAttribute("href")),
    sec: [...new Set([...document.querySelectorAll("[data-sec]")].map((e) => e.dataset.sec).filter(Boolean))],
    titulosNuevos: document.querySelectorAll("[data-titulo-nuevo]").length,
  }));
}
salida.__errores = errores;
writeFileSync(`${D}/dom.json`, JSON.stringify(salida));
console.log(paginas.length, "páginas leídas ·", errores.length, "errores de consola");
await b.close();
