/**
 * Convierte los documentos HTML de los manuales en PDF A4 a color.
 *
 *   node docs/manuales/herramientas/pdf.cjs            → todos
 *   node docs/manuales/herramientas/pdf.cjs trabajador → sólo los de esa carpeta
 *
 * Cada documento es `docs/manuales/<rol>/<documento>.html` y sale como
 * `docs/manuales/pdf/RECABRA-<Documento>-<Rol>.pdf`. En la portada se
 * reemplazan {{VERSION}} y {{FECHA}} (de `version.json`). El índice
 * (`<nav class="indice">`) se arma solo con los `h1` de cada capítulo y los
 * `h2.proceso`, y los números de página salen de una primera pasada: se
 * imprime, se busca cada título en el PDF (`pdftotext`) y se vuelve a imprimir
 * con los números puestos.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "pdf");
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));

const NOMBRE_DOC = { manual: "Manual", bolsillo: "Hoja-de-bolsillo", practica: "Ejercicios-y-evaluacion", capacitador: "Guia-del-capacitador" };
const TITULO_DOC = { manual: "Manual", bolsillo: "Hoja de bolsillo", practica: "Ejercicios y evaluación", capacitador: "Guía del capacitador" };

function pie(rotulo) {
  return `<div style="width:100%;font:8px Inter,Arial,sans-serif;color:#546072;padding:0 15mm;display:flex;justify-content:space-between">
    <span>RECABRA · ${rotulo} · versión ${VERSION.version} · ${VERSION.fecha}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
}

const normal = (t) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** En qué página aparece cada título (la primera después de `desde`). */
function paginasDe(pdf, titulos) {
  const n = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [pdf]).toString())[1]);
  const textos = [];
  for (let i = 1; i <= n; i++) {
    textos.push(normal(execFileSync("pdftotext", ["-f", String(i), "-l", String(i), "-layout", pdf, "-"]).toString()));
  }
  let desde = 2; // la portada y el índice no cuentan
  return titulos.map((t) => {
    const buscado = normal(t).slice(0, 60);
    for (let i = desde; i < n; i++) {
      if (textos[i].includes(buscado)) { desde = i; return i + 1; }
    }
    return null;
  });
}

/** Arma el documento: cada `<div data-incluir="capitulo.html"></div>` se
 *  reemplaza por ese archivo (de la misma carpeta). Devuelve la ruta armada. */
function armar(html) {
  const dir = path.dirname(html);
  const texto = fs.readFileSync(html, "utf8").replace(/<div data-incluir="([^"]+)"><\/div>/g,
    (_, archivo) => fs.readFileSync(path.join(dir, archivo), "utf8"));
  const armado = path.join(dir, `.armado-${path.basename(html)}`);
  fs.writeFileSync(armado, texto);
  return armado;
}

async function imprimir(navegador, html, pdf, rotulo, numeros) {
  const page = await navegador.newPage();
  const armado = armar(html);
  await page.goto("file://" + armado, { waitUntil: "networkidle" });
  await page.evaluate(({ v, numeros }) => {
    document.body.innerHTML = document.body.innerHTML.replaceAll("{{VERSION}}", v.version).replaceAll("{{FECHA}}", v.fecha)
      .replaceAll("{{APP}}", v.app);
    const nav = document.querySelector("nav.indice");
    if (!nav) return [];
    const titulos = [...document.querySelectorAll(".capitulo > h1, h2.proceso")];
    const ol = document.createElement("ol");
    titulos.forEach((h, i) => {
      const li = document.createElement("li");
      li.className = h.tagName === "H1" ? "cap" : "sub";
      // El número del capítulo va en su propio <span>: sin un espacio después,
      // el título del índice salía «1Antes de empezar» y no se encontraba en el PDF.
      const titulo = [...h.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(" ");
      li.innerHTML = `<span class="t">${titulo}</span><span class="p">${numeros?.[i] ?? ""}</span>`;
      ol.appendChild(li);
    });
    nav.appendChild(ol);
  }, { v: VERSION, numeros });
  const titulos = await page.evaluate(() => [...document.querySelectorAll(".capitulo > h1, h2.proceso")]
    .map((h) => [...h.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(" ")));
  await page.pdf({
    path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pie(rotulo),
  });
  await page.close();
  fs.rmSync(armado, { force: true });
  return titulos;
}

(async () => {
  const solo = process.argv[2];
  fs.mkdirSync(SALIDA, { recursive: true });
  const navegador = await chromium.launch();
  const roles = fs.readdirSync(RAIZ).filter((d) => fs.existsSync(path.join(RAIZ, d, "rol.json")) && (!solo || d === solo));
  for (const carpeta of roles) {
    const rol = JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, "rol.json"), "utf8"));
    for (const doc of Object.keys(NOMBRE_DOC)) {
      const html = path.join(RAIZ, carpeta, `${doc}.html`);
      if (!fs.existsSync(html)) continue;
      const pdf = path.join(SALIDA, `RECABRA-${NOMBRE_DOC[doc]}-${rol.archivo}.pdf`);
      const rotulo = `${TITULO_DOC[doc]} · ${rol.nombre}`;
      const titulos = await imprimir(navegador, html, pdf, rotulo, null);
      if (titulos.length) await imprimir(navegador, html, pdf, rotulo, paginasDe(pdf, titulos));
      const paginas = /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [pdf]).toString())[1];
      console.log(`${path.relative(RAIZ, pdf)} · ${paginas} páginas`);
    }
  }
  await navegador.close();
})();
