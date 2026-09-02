// Mira las pantallas construidas SIN backend, para poder compararlas contra las
// maquetas de al lado.
//
//   node pantalla.mjs                  # admin, Vender y Supervisar
//   node pantalla.mjs trabajador       # rol mercaderista, y revisa que no se
//                                      # le escape una sola cifra en pesos
//   node pantalla.mjs ficha            # Vender con un espacio elegido
//   node pantalla.mjs multi            # un contrato sobre DOS espacios, y
//                                      # comprueba que el total sea la suma
//                                      # prorrateada de los dos
//   node pantalla.mjs guardar          # el mismo, guardado: comprueba que
//                                      # salga UNA sola tanda al servidor y
//                                      # que la confirmación nombre los dos
//
// Sirve `frontend/dist` con un servidor mínimo y contesta `/api/*` con la sede
// sintética de `sede-demo.mjs` (los datos de NAVE: 23 caras, ocho contratos que
// suman el canon exacto). Lo que NO está en el mapa de rutas contesta 404, como
// contestaría un backend que no tiene ese endpoint: así un componente toma su
// camino de error en vez de recibir un `[]` que parece un dato válido — que fue
// exactamente el bicho que este harness encontró la primera vez que corrió.
//
// Las fuentes se sirven desde `docs/maquetas/fuentes`: el contenedor no llega a
// Google Fonts, y sin esto la captura sale con la tipografía del sistema.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAYOUT, RATES, MONTAJES } from "./sede-demo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const DIST = path.join(RAIZ, "frontend/dist");
const FUENTES = path.join(RAIZ, "docs/maquetas/fuentes");
const MODO = process.argv[2] ?? "admin";
const PUERTO = 4173;

const TIPO = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2",
};

if (!fs.existsSync(DIST)) {
  console.error(`No hay build en ${DIST}. Corré antes: cd frontend && npm run build`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let file = url.startsWith("/fuentes/")
    ? path.join(RAIZ, "docs/maquetas", url)
    : path.join(DIST, url === "/" ? "index.html" : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TIPO[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PUERTO, r));

// El servidor le borra el `negotiatedValue` a un trabajador y nunca le manda
// las tarifas. Se replica acá para que la captura sea la que él ve de verdad.
const trabajador = MODO === "trabajador";
const layout = trabajador
  ? LAYOUT.map((l) => ({ ...l, fixtures: l.fixtures.map((f) => {
      const { negotiatedValue, ...resto } = f;
      if (resto.faceB) { const { negotiatedValue: _b, ...b } = resto.faceB; resto.faceB = b; }
      return resto;
    }) }))
  : LAYOUT;

const API = {
  "/api/layout/": layout,
  "/api/layout/revisions": layout.map((l) => ({ sede: l.sede, updated_at: l.updated_at, count: l.fixtures.length })),
  "/api/layout/settings": { sedes: ["NAVE", "TERRON", "ALFA", "BETA", "GAMA", "DELTA", "OMEGA"], catalog_labels: {} },
  "/api/layout/seasons": { windows: {} },
  "/api/mounts": MONTAJES,
  "/api/notifications/recipients": {
    sede: "NAVE", comercial: ["comercial@galerias.co"],
    montaje: ["mercaderista@galerias.co"], smtp_listo: true,
  },
  ...(trabajador ? {} : { "/api/layout/rates": RATES }),
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errores = [];
page.on("pageerror", (e) => errores.push(`JS: ${e.stack ?? e.message}`));
page.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
page.on("response", (r) => { if (r.status() === 404) errores.push(`404: ${new URL(r.url()).pathname}`); });

// Lo que el servidor recibió al guardar, para poder afirmar que salió UNA
// sola tanda y no un pedido por espacio.
const tandas = [];

await page.route("**/api/**", async (route) => {
  const u = new URL(route.request().url());

  // El guardado del layout. Es lo que persiste el plano después de escribir el
  // contrato: sin este stub la pantalla se ve bien igual —el store ya se
  // actualizó en memoria— y el fallo sólo aparecía como un 404 en la consola,
  // que es justo el modo de falla que este harness existe para no dejar pasar.
  if (route.request().method() === "PUT" && u.pathname.startsWith("/api/layout/")) {
    const cuerpo = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        sede: decodeURIComponent(u.pathname.split("/").pop()),
        fixtures: cuerpo.fixtures || [],
        updated_at: "2026-09-02T00:00:00Z",
      }),
    });
    return;
  }

  // El guardado del contrato multiespacio. Se contesta como el backend: una
  // fila por espacio, cada una con el id del contrato creado, y a quién se le
  // avisó — uno por rol para toda la tanda.
  if (u.pathname === "/api/leases/bulk/confirmar") {
    const cuerpo = JSON.parse(route.request().postData() || "{}");
    tandas.push(cuerpo);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        creados: (cuerpo.filas || []).length,
        omitidos: 0,
        filas: (cuerpo.filas || []).map((f, i) => ({
          fila: f.fila, estado: "ok", mensajes: [], codigo: f.espacio,
          proveedor: f.proveedor, valor: f.valor, desde: f.desde, hasta: f.hasta,
          proveedor_nuevo: false, lease_id: 900 + i,
        })),
        avisos: {
          smtp_listo: true, comercial: ["comercial@galerias.co"],
          montaje: ["mercaderista@galerias.co"], proveedor: [],
        },
      }),
    });
    return;
  }
  const cuerpo = API[u.pathname] ?? API[u.pathname.replace(/\/$/, "")];
  if (cuerpo === undefined) {
    await route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"sin stub"}' });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
});

await page.addInitScript((rol) => {
  localStorage.setItem("retail-auth-v1",
    JSON.stringify({ state: { token: "demo", role: rol, cliente: null, clienteNombre: null }, version: 0 }));
}, trabajador ? "worker" : "admin");

await page.goto(`http://localhost:${PUERTO}/`, { waitUntil: "networkidle" });

const todo = fs.readFileSync(path.join(FUENTES, "tipos.css"), "utf-8");
await page.addStyleTag({
  content: (todo.match(/@font-face\s*\{[^}]*\}/g) || [])
    .filter((b) => /font-family:\s*'(Chivo|Archivo Narrow)'/.test(b))
    .join("\n")
    .replace(/url\(w\//g, "url(/fuentes/w/"),
});

const sel = page.locator('select[aria-label="Sede"]');
if (await sel.count()) await sel.selectOption("NAVE");
await page.waitForTimeout(2600);

/** La página no scrollea: el que scrollea es el panel de adentro (la app vive
 *  en 100dvh), así que `fullPage` devolvería siempre 900. Se mide el
 *  contenedor y se agranda el viewport hasta que entra entero. */
async function capturar(nombre) {
  const { alto, ancho } = await page.evaluate(() => {
    const cont = [...document.querySelectorAll("div")]
      .find((d) => getComputedStyle(d).overflowY === "auto" && d.scrollHeight > d.clientHeight + 4);
    return {
      alto: cont ? cont.scrollHeight + (window.innerHeight - cont.clientHeight) : document.documentElement.scrollHeight,
      ancho: document.documentElement.scrollWidth,
    };
  });
  await page.setViewportSize({ width: 1440, height: Math.min(6000, Math.max(900, Math.ceil(alto))) });
  await page.waitForTimeout(700);
  const destino = path.join(AQUI, `pantalla-${nombre}.png`);
  await page.screenshot({ path: destino });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  console.log(`${nombre}: ${ancho}×${alto} → ${destino}${ancho > 1440 ? "   ⚠ DESBORDE HORIZONTAL" : ""}`);
}

if (MODO === "ficha" || MODO === "multi" || MODO === "guardar") {
  // Los prismas verdes del plano son los libres en el periodo. Tocarlos los
  // suma al contrato: uno para «ficha», dos para «multi».
  const verdes = page.locator('svg polygon[fill="#00786A"]');
  await verdes.nth(0).click({ force: true });
  await page.waitForTimeout(700);
  if (MODO === "multi" || MODO === "guardar") {
    await verdes.nth(3).click({ force: true });
    await page.waitForTimeout(700);
  }
  const llenar = async (sel, txt) => {
    const el = page.locator(sel);
    if (await el.count()) await el.first().fill(txt);
  };
  await llenar('input[placeholder^="Alpina"]', "ALPINA");
  await llenar('input[placeholder^="Lácteos"]', "Alpinito");
  const fechas = page.locator('input[type="date"]');
  if (await fechas.count() >= 2) {
    await fechas.nth(0).fill("2026-09-15");
    await fechas.nth(1).fill("2026-11-14");
  }
  await page.waitForTimeout(900);

  // El total tiene que ser la suma mensual de los espacios prorrateada por los
  // días del plazo. Es la cuenta que antes se hacía de cabeza, así que se
  // verifica y no se mira.
  const valores = await page.locator('input[aria-label^="Valor mensual de"]')
    .evaluateAll((els) => els.map((e) => ({ que: e.getAttribute("aria-label"), val: e.value })));
  const suma = valores.reduce((t, v) => t + Number(v.val.replace(/\D/g, "") || 0), 0);
  const esperado = "$" + Math.round((suma / 30) * 61).toLocaleString("es-CO");
  const texto = await page.evaluate(() => document.body.innerText);
  const enPantalla = (texto.match(/TOTAL DEL CONTRATO\s*\n?\s*(\$[\d.]+)/) || [])[1];
  console.log(`espacios en el contrato: ${valores.length} · ${valores.map((v) => v.val).join(" + ")} al mes`);
  console.log(enPantalla === esperado
    ? `total: ${enPantalla} = suma prorrateada por 61 días ✓`
    : `⚠ TOTAL EQUIVOCADO: en pantalla ${enPantalla}, esperado ${esperado}`);
  const marcados = await page.locator('svg polygon[stroke="var(--accent)"]').count();
  console.log(marcados === valores.length
    ? `el plano marca los ${marcados} ✓`
    : `⚠ el plano marca ${marcados} y el contrato tiene ${valores.length}`);

  if (MODO === "guardar") {
    await page.locator('button:has-text("Guardar contrato")').first().click();
    await page.waitForTimeout(1200);
    console.log(tandas.length === 1
      ? `un solo pedido al servidor con ${tandas[0].filas.length} espacios ✓`
      : `⚠ salieron ${tandas.length} pedidos; tendría que ser 1`);
    const t = tandas[0] || { filas: [] };
    const unProveedor = new Set(t.filas.map((f) => f.proveedor)).size === 1;
    const unPeriodo = new Set(t.filas.map((f) => `${f.desde}→${f.hasta}`)).size === 1;
    console.log(unProveedor && unPeriodo
      ? "un proveedor y un periodo para todos los espacios ✓"
      : "⚠ la tanda mezcla proveedores o periodos");
    const cerrado = await page.evaluate(() => document.body.innerText);
    console.log(/Contrato guardado/.test(cerrado)
      ? "la confirmación aparece ✓"
      : "⚠ no apareció la confirmación");
    for (const f of t.filas) {
      if (!cerrado.includes(String(f.espacio).replace(/^[A-Z]+-/, "").split("-")[0])) {
        console.log(`⚠ la confirmación no nombra ${f.espacio}`);
      }
    }
  }

  await capturar(MODO);
} else if (trabajador) {
  // El mercaderista no tiene pestañas: la pantalla es Supervisar y punto.
  await capturar("trabajador");
} else {
  for (const [nombre, boton] of [["vender", "Vender"], ["supervisar", "Supervisar"]]) {
    const b = page.locator(`button:text-is("${boton}")`).first();
    if (!(await b.count())) continue;
    await b.click();
    await page.waitForTimeout(1200);
    await capturar(nombre);
  }
}

// Lo que se sale de su panel
const fuera = await page.evaluate(() => {
  const malos = [];
  document.querySelectorAll("*:not(svg *)").forEach((el) => {
    const p = el.parentElement;
    if (!p || p === document.body) return;
    const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
    if (!a.width || !b.width) return;
    if (getComputedStyle(p).overflow !== "visible") return;
    if (a.right > b.right + 2 || a.bottom > b.bottom + 2) {
      malos.push(`${el.tagName} «${(el.textContent || "").trim().slice(0, 34)}»`);
    }
  });
  return malos.slice(0, 12);
});
console.log(fuera.length ? "\nSE SALEN DE SU PANEL:\n  " + fuera.join("\n  ") : "\nNada se sale de su panel.");

if (trabajador) {
  // La regla dura: a un mercaderista no le puede aparecer un peso en pantalla.
  const texto = await page.evaluate(() => document.body.innerText);
  const pesos = [...texto.matchAll(/\$[\d.]+/g)].map((m) => m[0]);
  console.log(pesos.length ? `\n⚠ CIFRAS EN PESOS VISIBLES: ${pesos.join(", ")}` : "\nSin cifras en pesos ✓");
  console.log(texto.includes("Vender") ? "⚠ VE LA PESTAÑA VENDER" : "No ve Vender ✓");
}

const unicos = [...new Set(errores)].filter((e) => !e.includes("ERR_CONNECTION_RESET"));
console.log(unicos.length ? "\nERRORES:\n  " + unicos.join("\n  ") : "\nSin errores de página.");

await browser.close();
server.close();
