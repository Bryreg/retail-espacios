/**
 * Capturas del manual del TRABAJADOR (rol `worker`: personal de la tienda con
 * cuenta; nunca ve plata). Todo en computador (1280×800). Corre contra la copia
 * de prueba recién sembrada (`herramientas/levantar.sh`): registra montajes y
 * agrega contratos viejos de PUN-07, así que se corre una sola vez por siembra.
 *
 *   MANUAL_TMP=<carpeta de levantar.sh> MANUAL_PUERTO=8790 node docs/manuales/trabajador/capturas.cjs
 *
 * Dos preparaciones, hechas como administración por la API (el manual no las
 * muestra):
 *  - cuatro contratos ya terminados en PUN-07, para que su ficha tenga más de
 *    cinco anteriores y aparezca «Ver todos (N)»;
 *  - una invitación de trabajador, para capturar cómo se ve el enlace.
 * Y un truco de captura: en la copia de prueba el ingreso con Google/correo
 * (Firebase) no está configurado, así que la hoja de ingreso diría «El ingreso
 * no está configurado en este servidor». Para la captura se le dice a la
 * pantalla que sí lo está (`ingresoEncendido`): se ve el formulario real, que
 * acá no funciona.
 */
const { lanzar, abrir, entrar, BASE, foto } = require("../herramientas/comun.cjs");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const C = "trabajador";
const FOTO = path.join(__dirname, "..", "herramientas", "foto-de-prueba.jpg");
const PUERTO = Number(process.env.MANUAL_PUERTO || 8790);
const TMP = process.env.MANUAL_TMP || "/tmp";
const TEXTOS = path.join(TMP, "textos-trabajador");
fs.mkdirSync(TEXTOS, { recursive: true });
const texto = async (page) => (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
const guardarTexto = async (page, nombre) => fs.writeFileSync(path.join(TEXTOS, `${nombre}.txt`), await texto(page));

// ── Preparación por la API, como administración ───────────────────────────
async function api(token, metodo, ruta, cuerpo) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo, headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${await r.text()}`);
  return r.json();
}
const iso = (d) => d.toISOString().slice(0, 10);
function mes(k) { const h = new Date(); return new Date(Date.UTC(h.getFullYear(), h.getMonth() + k, 1)); }
function fin(k) { const h = new Date(); return new Date(Date.UTC(h.getFullYear(), h.getMonth() + k + 1, 0)); }

async function preparar() {
  const { token } = await entrar("admin");
  const viejos = [
    ["Aseo Total", "trade@aseototal.example", "Aseo Total Hogar", -19, -14],
    ["Lácteos Andinos", "comercial@lacteosandinos.example", "Yogur Andino", -25, -20],
    ["Limpio Hogar", "compras@limpiohogar.example", "Limpio Hogar", -31, -26],
    ["Bebidas del Valle", "trade@bebidasvalle.example", "Agua del Valle", -37, -32],
  ];
  for (const [proveedor, correo, marca, k0, k1] of viejos) {
    const meses = k1 - k0 + 1;
    await api(token, "POST", "/api/contratos/vender", {
      sede: "CENTRO", proveedor, correo, marca, desde: iso(mes(k0)), hasta: iso(fin(k1)), tipo: "contrato",
      lineas: [{ espacio: "CENTRO-PUN-07", valor: 500000 * meses, modo_precio: "mensual", valor_tecleado: 500000 }],
    });
  }
  await api(token, "POST", "/api/usuarios/invitar", { email: "maria.prueba@supermercado.example", rol: "worker" });
  const base = path.join(TMP, `bd-${PUERTO}`, "manual.db");
  return execFileSync("python3", ["-c",
    "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute(\"select token from invitaciones where email like 'maria.prueba%' order by id desc\").fetchone()[0])",
    base]).toString().trim();
}

/** La hoja de ingreso con Google/correo «encendido» (ver arriba). */
async function ingresoEncendido(contexto) {
  await contexto.route(/\/assets\/Login-[^/]+\.js$/, async (route) => {
    const r = await route.fetch();
    const cuerpo = (await r.text())
      .replace(/([\w$]+) as he([,}])/, "$1 as he__$2") // `he`: «el ingreso está configurado» (cambia de letra con cada build)
      .replace(/(from"\.\/index-[^"]+\.js";)/, "$1const he=!0;");
    await route.fulfill({ response: r, body: cuerpo });
  });
}

(async () => {
  const invitacion = await preparar();
  const nav = await lanzar();

  // ── 1. Entrar ─────────────────────────────────────────────────────────────
  {
    const { page, contexto } = await abrir(nav, null);
    await ingresoEncendido(contexto);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const yaTengo = page.getByRole("link", { name: "Ya tengo cuenta" }).first();
    await foto(page, C, "01-portada", { marca: yaTengo });
    await yaTengo.click();
    await page.waitForTimeout(1500);
    await foto(page, C, "02-hoja-ingreso", { marca: [{ loc: page.getByRole("button", { name: "Continuar con Google" }), n: 1 }, { loc: page.locator("#fb-email"), n: 2 }] });
    await page.goto(`/login?invitacion=${invitacion}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const tarjeta = page.getByText("Invitación a Galerías").locator("xpath=ancestor::*[.//button][1]");
    await foto(page, C, "03-invitacion", { recorte: tarjeta, margen: 30, marca: page.getByText("Invitación a Galerías").locator("..") });
    await guardarTexto(page, "03-invitacion");
    await contexto.close();
  }

  let { page, contexto } = await abrir(nav, "worker");
  const boton = (n) => page.getByRole("button", { name: n, exact: true });
  const ir = async (ruta) => { await page.goto(ruta); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1800); };
  const pestana = async (t) => {
    await page.getByRole("tab", { name: t, exact: true }).or(page.getByRole("button", { name: t, exact: true })).first().click();
    await page.waitForTimeout(1500);
  };
  const barra = page.locator(".barra-app");

  // ── 2. La barra de arriba ─────────────────────────────────────────────────
  await ir("/");
  // Un poco de aire arriba de la barra, para que los números de las marcas
  // no queden cortados por el borde de la captura.
  await barra.evaluate((b) => { b.style.marginTop = "26px"; });
  await foto(page, C, "05-barra", {
    recorte: barra, margen: 8,
    marca: [
      { loc: page.locator('select[aria-label="Sede"]'), n: 1 },
      { loc: page.locator(".btn-buscar"), n: 2 },
      { loc: page.getByLabel("Ayuda de esta pantalla"), n: 3 },
      { loc: page.getByText("Sincronizado", { exact: true }).locator(".."), n: 4 }, // con el punto: el número no tapa la «S»
      { loc: page.getByRole("button", { name: /^Pendientes/ }).first(), n: 5 },
      { loc: page.getByRole("button", { name: /Trabajador/ }).first(), n: 6 },
    ],
  });
  await barra.evaluate((b) => { b.style.marginTop = ""; });
  await page.locator(".btn-buscar").click();
  await page.waitForTimeout(400);
  await page.keyboard.type("historial", { delay: 40 });
  await page.waitForTimeout(800);
  await foto(page, C, "06-buscar", { recorte: page.locator(".buscador"), margen: 20, marca: page.locator(".buscador-fila").first() });
  await page.keyboard.press("Escape");
  await page.locator(".btn-buscar").click();
  await page.waitForTimeout(400);
  await page.keyboard.type("PUN-07", { delay: 40 });
  await page.waitForTimeout(800);
  await foto(page, C, "06b-buscar-espacio", { recorte: page.locator(".buscador"), margen: 20, marca: page.locator(".buscador-fila").first() });
  await guardarTexto(page, "06b-buscar-espacio");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  await foto(page, C, "06c-ficha-desde-buscar");
  await guardarTexto(page, "06c-ficha-desde-buscar");
  await ir("/");
  await page.getByLabel("Ayuda de esta pantalla").click();
  await page.waitForTimeout(800);
  await foto(page, C, "07-ayuda");
  await guardarTexto(page, "07-ayuda");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByText("Trabajador", { exact: true }).click();
  await page.waitForTimeout(500);
  const menu = page.locator(".menu-cuenta");
  await foto(page, C, "08-cuenta", { recorte: menu, margen: 10, marca: menu.locator("[data-fila-tema]") });
  await page.keyboard.press("Escape");
  await page.mouse.click(600, 600);

  // ── 3. Inicio ─────────────────────────────────────────────────────────────
  await ir("/");
  const tarjetas = page.locator(".ini-tarjeta");
  await foto(page, C, "10-inicio", {
    marca: [0, 1, 2, 3].map((i) => ({ loc: tarjetas.nth(i), n: i + 1 })),
  });
  await guardarTexto(page, "10-inicio");
  await tarjetas.nth(0).locator(".ini-link").click();
  await page.waitForTimeout(1800);
  await foto(page, C, "11-desde-inicio", { marca: page.getByText("Volver al Inicio") });

  // ── 4. Pendientes ────────────────────────────────────────────────────────
  await ir("/");
  await page.getByRole("button", { name: /^Pendientes/ }).first().click();
  await page.waitForTimeout(1000);
  await foto(page, C, "15-pendientes", { marca: page.getByText("Limpio Hogar · vence el 30 nov").locator("..").locator("..") });
  await guardarTexto(page, "15-pendientes");
  await page.getByText("Limpio Hogar · vence el 30 nov").click();
  await page.waitForTimeout(2000);
  await foto(page, C, "17-pendiente-abierto");

  // ── 5. Montajes ──────────────────────────────────────────────────────────
  await ir("/montajes");
  const fila = (c) => page.locator("li.mj-fila", { has: page.locator("b.mono", { hasText: new RegExp(`^${c}$`) }) }).first();
  const filtros = page.locator("[data-filtros-montajes]");
  await foto(page, C, "20-montajes", { marca: [{ loc: filtros, n: 1 }, { loc: page.getByText("Resumen de montajes"), n: 2 }] });
  await guardarTexto(page, "20-montajes");
  await filtros.getByRole("button", { name: /^Sin montar/ }).click();
  await page.waitForTimeout(700);
  await foto(page, C, "21-sin-montar", { marca: fila("PUN-03-EN1").locator("button.mj-btn") });
  await fila("PUN-03-EN1").locator("button.mj-btn").click();
  await page.waitForTimeout(2000);
  await foto(page, C, "22-formulario");
  await guardarTexto(page, "22-formulario");
  const dondeQueda = page.getByText("DÓNDE QUEDA", { exact: false }).first();
  await dondeQueda.scrollIntoViewIfNeeded();
  await foto(page, C, "23-donde-queda", { marca: dondeQueda.locator("..") });
  await foto(page, C, "24-lo-monte", { recorte: boton("Lo monté").locator(".."), margen: 12, marca: boton("Lo monté") });
  await boton("Lo monté").click();
  await page.waitForTimeout(700);
  await boton("Confirmar").click();
  await page.waitForTimeout(600);
  await page.getByText(/Falta la foto/).first().scrollIntoViewIfNeeded();
  await foto(page, C, "25-falta-la-foto", { marca: page.getByText(/Falta la foto/).first() });
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(1200);
  const nombre = page.getByPlaceholder(/Quién reporta/i).first();
  if (await nombre.count()) await nombre.fill("Marta Prueba");
  await page.getByPlaceholder(/Algo que haya que saber/i).first().fill("Quedó con el cabezote nuevo");
  await boton("Confirmar").scrollIntoViewIfNeeded();
  await foto(page, C, "26-confirmar", { marca: [{ loc: nombre, n: 1 }, { loc: boton("Confirmar"), n: 2 }] });
  await boton("Confirmar").click();
  await page.waitForTimeout(2500);
  // Vuelve a la lista con «Listo: PUN-03-EN1 quedó reportado como montado.»
  // arriba, y el espacio pasa de «Sin montar» a «Montado, sin verificar».
  await foto(page, C, "27-listo", { marca: page.getByText(/^Listo: .* quedó reportado/).first() });
  await guardarTexto(page, "27-listo");

  // No pude (GON-02-PC1)
  await ir("/montajes");
  await fila("GON-02-PC1").locator("button.mj-btn").click();
  await page.waitForTimeout(2000);
  await boton("No pude").click();
  await page.waitForTimeout(700);
  const quePaso = page.getByText("¿Qué pasó?", { exact: true });
  await quePaso.scrollIntoViewIfNeeded();
  await page.getByText("No llegó el producto", { exact: true }).click();
  const nombre2 = page.getByPlaceholder(/Quién reporta/i).first();
  if (await nombre2.count()) await nombre2.fill("Marta Prueba");
  await page.getByPlaceholder(/Algo que haya que saber|nota/i).first().fill("El producto llega el lunes");
  await quePaso.scrollIntoViewIfNeeded();
  await foto(page, C, "30-no-pude", { marca: page.getByText("No llegó el producto", { exact: true }) });
  await guardarTexto(page, "30-no-pude");
  await boton("Confirmar").click();
  await page.waitForTimeout(2500);
  await foto(page, C, "31-no-pude-listo", { marca: page.getByText(/^Listo: .* quedó reportado/).first() });
  await guardarTexto(page, "31-no-pude-listo");

  // Ver el registro y la foto
  await ir("/montajes");
  await fila("PUN-05").locator("button.mj-btn").click();
  await page.waitForTimeout(1800);
  await foto(page, C, "33-ver-registro");
  await guardarTexto(page, "33-ver-registro");
  await page.keyboard.press("Escape");
  await ir("/montajes");
  await fila("PUN-06").locator("button.mj-btn").click();
  await page.waitForTimeout(1800);
  await foto(page, C, "34-no-coincide", { marca: page.getByText(/No coincide ·/).first() });
  await guardarTexto(page, "34-no-coincide");
  await page.keyboard.press("Escape");
  await ir("/montajes");
  await fila("PUN-02-EN2").locator("button.mj-btn").click();
  await page.waitForTimeout(1800);
  await foto(page, C, "35-no-realizado", { marca: page.getByRole("button", { name: "Registrar el montaje de nuevo" }) });
  await guardarTexto(page, "35-no-realizado");
  await page.keyboard.press("Escape");

  // Planogramas: el trabajador ve la guía (sólo lectura)
  await ir("/montajes");
  const filaGuia = fila("GON-12 · cara A");
  await foto(page, C, "28-planograma", { marca: filaGuia.getByRole("button", { name: "Ver la guía" }) });
  await filaGuia.getByRole("button", { name: "Ver la guía" }).click();
  await page.waitForTimeout(2500);
  await foto(page, C, "29-guia", { marca: page.getByRole("dialog").getByRole("button", { name: "Imprimir" }) });
  await guardarTexto(page, "29-guia");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
  await page.waitForTimeout(600);

  // Sin conexión (PUN-03-EN2)
  await ir("/montajes");
  await fila("PUN-03-EN2").locator("button.mj-btn").click();
  await page.waitForTimeout(2000);
  await boton("Lo monté").click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(1000);
  const nombre3 = page.getByPlaceholder(/Quién reporta/i).first();
  if (await nombre3.count()) await nombre3.fill("Marta Prueba");
  await contexto.setOffline(true);
  await boton("Confirmar").click();
  await page.waitForTimeout(2000);
  const sinSenal = page.getByText(/Sin conexión: tu reporte/).first();
  await sinSenal.scrollIntoViewIfNeeded();
  const cajaSinSenal = sinSenal.locator("xpath=ancestor::*[.//button[contains(., 'Reintentar')]][1]");
  await foto(page, C, "37-sin-senal", { recorte: cajaSinSenal, margen: 24, marca: page.getByRole("button", { name: "Reintentar ahora" }) });
  await guardarTexto(page, "37-sin-senal");
  // La barra pasa sola a «Sin conexión» (escucha al navegador).
  await page.getByText("Sin conexión", { exact: true }).waitFor({ timeout: 15000 });
  await foto(page, C, "38-sin-conexion", { recorte: barra, margen: 0, marca: page.getByText("Sin conexión", { exact: true }) });
  await contexto.setOffline(false);
  await page.waitForTimeout(6000);
  await guardarTexto(page, "39-volvio-la-senal");
  await foto(page, C, "39-volvio-la-conexion", { marca: page.getByText(/^Listo: .* quedó reportado/).first() });

  // Se cortó internet al confirmar y se CERRÓ la página: al volver a abrir el
  // espacio, «Tenés un reporte sin mandar» sale arriba de todo del formulario.
  // Se captura y se descarta, para no cambiar lo que muestran las capturas de
  // Indicadores (GON-02-PC1 sigue «No realizado»).
  await ir("/montajes");
  await fila("GON-02-PC1").locator("button.mj-btn").click();
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "Registrar el montaje de nuevo" }).click();
  await page.waitForTimeout(1800);
  await boton("Lo monté").click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(1000);
  const nombre4 = page.getByPlaceholder(/Quién reporta/i).first();
  if (await nombre4.count()) await nombre4.fill("Marta Prueba");
  await contexto.setOffline(true);
  await boton("Confirmar").click();
  await page.waitForTimeout(2000);
  await page.close();
  await contexto.setOffline(false);
  page = await contexto.newPage();
  page.setDefaultTimeout(20_000);
  await ir("/montajes");
  await fila("GON-02-PC1").locator("button.mj-btn").click();
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "Registrar el montaje de nuevo" }).click();
  await page.waitForTimeout(2000);
  const sinMandar = page.getByText("Tenés un reporte sin mandar", { exact: true });
  const cajaSinMandar = sinMandar.locator("xpath=ancestor::*[.//button[contains(., 'Mandar ahora')]][1]");
  await foto(page, C, "39b-reporte-sin-mandar", {
    recorte: [page.getByText(/GON-02-PC1$/).first(), cajaSinMandar], margen: 24,
    marca: boton("Mandar ahora"),
  });
  await guardarTexto(page, "39b-reporte-sin-mandar");
  await boton("Descartar").click();
  await page.waitForTimeout(1500);
  await guardarTexto(page, "39c-descartado");


  // ── 6. Indicadores ───────────────────────────────────────────────────────
  await ir("/indicadores");
  await pestana("Mapa de oportunidades"); // Indicadores vuelve a la última pestaña que se usó
  await foto(page, C, "40-mapa", { marca: page.getByRole("tablist").or(page.locator('[role="tablist"]')).first() });
  await guardarTexto(page, "40-mapa");
  // El mouse fuera del mapa: al pasar por un indicador, este panel cambia a
  // los espacios de ese indicador.
  await page.mouse.move(2, 790);
  await page.waitForTimeout(600);
  const acciones = page.locator("section.mo-panel", { has: page.getByText(/^Ordenadas por impacto/) }).first();
  await acciones.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 790);
  await page.waitForTimeout(600);
  await foto(page, C, "41-acciones", { recorte: acciones, margen: 12, marca: acciones.getByRole("button", { name: "Ver la ficha" }).first() });
  await pestana("Plano");
  await foto(page, C, "42-plano");
  await pestana("Contratos");
  await foto(page, C, "43-contratos", {
    marca: [{ loc: page.getByRole("button", { name: /^Vigentes hoy/ }).locator(".."), n: 1 }, { loc: page.getByRole("button", { name: /Bajar todos/ }), n: 2 }],
  });
  await guardarTexto(page, "43-contratos");
  await page.getByText("PUN-01", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await foto(page, C, "45-ficha");
  await guardarTexto(page, "45-ficha");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await pestana("Contratos");
  await page.getByText("PUN-02", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await foto(page, C, "45b-ficha-en-parte", { marca: page.getByText(/^De 5 entrepaños, 2 con contrato/).first() });
  await guardarTexto(page, "45b-ficha-en-parte");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await pestana("Contratos");
  await page.getByText("PUN-07", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  const verTodos = page.locator("[data-ver-todos]");
  await verTodos.scrollIntoViewIfNeeded();
  await foto(page, C, "46-ficha-anteriores", { marca: verTodos });
  await guardarTexto(page, "46-ficha-anteriores");
  await verTodos.click();
  await page.waitForTimeout(2000);
  await foto(page, C, "47-historial-del-espacio", { marca: page.getByText("Limpiar filtros") });
  await pestana("Historial");
  await page.getByText("Limpiar filtros").click().catch(() => {});
  await page.waitForTimeout(800);
  await foto(page, C, "48-historial", {
    marca: [
      { loc: page.getByPlaceholder(/^Buscar/), n: 1 },
      { loc: page.getByRole("button", { name: /^Cancelado/ }), n: 2 },
      { loc: page.getByRole("button", { name: /Exportar a Excel/ }), n: 3 },
    ],
  });
  await guardarTexto(page, "48-historial");

  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
