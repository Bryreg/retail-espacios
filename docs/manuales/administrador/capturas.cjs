/**
 * Capturas del manual del ADMINISTRADOR (rol `admin`), la mitad comercial:
 * barra, Inicio y Pendientes, Contratos (vender), la ficha del espacio,
 * Indicadores, Montajes y problemas frecuentes. Todo en computador (1280×800).
 *
 * Corre contra la copia de prueba recién sembrada (`herramientas/levantar.sh`):
 * vende, reserva, confirma, edita, cancela y verifica de verdad, así que se
 * corre una sola vez por siembra y EN ESTE ORDEN.
 *
 *   MANUAL_TMP=<carpeta de levantar.sh> MANUAL_PUERTO=8792 node docs/manuales/administrador/capturas.cjs
 *
 * Los capítulos de Plano de la sede, Planogramas y Ajustes tienen su propio
 * guion (imágenes en `img/administrador-plano/`).
 */
const { lanzar, abrir, correoReal } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "administrador";
const FOTO = path.join(__dirname, "..", "herramientas", "foto-de-prueba.jpg");
const TEXTOS = path.join(__dirname, "textos");
fs.mkdirSync(TEXTOS, { recursive: true });
const fallas = [];
let paginaActual = null;

(async () => {
  const nav = await lanzar();

  // ── 1. La portada y la hoja de ingreso (sin sesión) ───────────────────────
  {
    const { page } = await abrir(nav, null);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await paso("01-portada", () => foto(page, C, "01-portada", { marca: page.getByRole("button", { name: "Ya tengo cuenta" }).or(page.getByRole("link", { name: "Ya tengo cuenta" })).first() }));
    await paso("02-ingreso", async () => {
      await page.getByRole("button", { name: "Ya tengo cuenta" }).or(page.getByRole("link", { name: "Ya tengo cuenta" })).first().click();
      await page.waitForTimeout(1500);
      await page.mouse.move(1270, 790);
      await guardarTexto(page, "02-ingreso");
      await foto(page, C, "02-ingreso");
    });
    await page.context().close();
  }

  const { page, contexto } = await abrir(nav, "admin");
  page.setDefaultTimeout(12_000);
  paginaActual = page;
  page.on("pageerror", (e) => console.log("  ⚠ error de pantalla:", e.message.slice(0, 160)));
  const boton = (n, donde = page) => donde.getByRole("button", { name: n, exact: true }).first();
  const cajon = () => page.locator('[role="dialog"]').last();
  const panel = () => page.locator("section.vp.contrato");
  const bloque = (n) => page.locator(`section.bloque[data-bloque="${n}"]`);
  const pie = () => page.locator("[data-pie-fijo]");
  const espera = (ms = 700) => page.waitForTimeout(ms);
  const fueraDelMouse = () => page.mouse.move(1275, 795);

  async function tocar(cod) {
    const b = await page.locator(`text[data-cod="${cod}"]`).first().boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await fueraDelMouse();
    await espera(800);
  }
  async function ir(ruta) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await espera(1800);
  }
  async function cerrarCajon() {
    if (await page.locator('[role="dialog"]').count()) { await page.keyboard.press("Escape"); await espera(500); }
  }
  async function fichaDesdeContratos(cod) {
    await ir("/indicadores");
    await cerrarCajon();
    await page.getByRole("tab", { name: "Contratos" }).click();
    await espera(900);
    const fila = page.getByRole("row").filter({ has: page.getByRole("cell", { name: cod, exact: true }) }).first();
    await fila.click();
    await espera(1200);
    return fila;
  }

  // ── 1. La barra ─────────────────────────────────────────────────────────
  await ir("/contratos");
  const barra = page.locator(".barra-app");
  await paso("03-barra", () => foto(page, C, "03-barra", {
    recorte: barra, margen: 0,
    marca: [
      { loc: page.locator(".barra-app select").first(), n: 1 },
      { loc: page.getByRole("button", { name: /Buscar/ }).first(), n: 2 },
      { loc: boton("Más"), n: 3 },
      { loc: page.getByRole("button", { name: /Ayuda|ayuda/ }).first(), n: 4 },
      { loc: page.getByRole("button", { name: /Sincronizado/ }).first(), n: 5 },
      { loc: page.getByRole("button", { name: /Pendientes/ }).first(), n: 6 },
      { loc: page.getByRole("button", { name: /Administrador/ }).first(), n: 7 },
    ],
  }));
  await paso("04-menu", () => foto(page, C, "04-menu", { marca: page.locator("nav.menu-lateral") }));
  await paso("05-buscar", async () => {
    await page.getByRole("button", { name: /Buscar/ }).first().click();
    await espera(600);
    await page.keyboard.type("planilla", { delay: 60 });
    await espera(600);
    await foto(page, C, "05-buscar");
    await page.keyboard.press("Escape");
  });
  await paso("06-mas", async () => {
    await boton("Más").click();
    await espera(500);
    await foto(page, C, "06-mas");
    await page.keyboard.press("Escape");
  });
  await paso("07-ayuda", async () => {
    await page.getByRole("button", { name: /Ayuda|ayuda/ }).first().click();
    await espera(700);
    await foto(page, C, "07-ayuda");
    await page.keyboard.press("Escape");
    await espera(400);
  });
  await paso("08-cuenta", async () => {
    await page.getByRole("button", { name: /Administrador/ }).first().click();
    await espera(500);
    await foto(page, C, "08-cuenta", { recorte: page.getByRole("menu").or(page.getByText("Cerrar sesión").locator("xpath=ancestor::*[3]")).first(), margen: 40 });
    await page.keyboard.press("Escape");
  });

  // ── 2. Inicio y Pendientes ──────────────────────────────────────────────
  await ir("/");
  await paso("10-pendientes-solo", async () => {
    await foto(page, C, "10-pendientes-se-abre-solo", { marca: cajon().locator('button[data-grupo="hoy"]') });
  });
  await cerrarCajon();
  await paso("11-inicio", () => foto(page, C, "11-inicio", { marca: page.getByRole("button", { name: "Nuevo contrato" }) }));
  await paso("12-tarjetas", async () => {
    const t = page.locator(".ini-tarjetas").first();
    await t.scrollIntoViewIfNeeded();
    await foto(page, C, "12-tarjetas", { recorte: t, margen: 12 });
  });
  await paso("13-hoy-y-actividad", async () => {
    const p = page.locator(".ini-panel").first();
    await p.scrollIntoViewIfNeeded();
    await foto(page, C, "13-pendientes-de-hoy", { recorte: p, margen: 12 });
  });
  await page.getByRole("button", { name: /^Pendientes/ }).first().click();
  await espera(900);
  await paso("14-bandeja-hoy", () => foto(page, C, "14-bandeja-hoy", { recorte: cajon(), margen: 0, marca: cajon().locator('button[data-grupo="hoy"]') }));
  await paso("15-bandeja-30", async () => {
    await cajon().locator('button[data-grupo="dias30"]').click();
    await espera(700);
    await guardarTexto(page, "15-bandeja-30", cajon());
    await foto(page, C, "15-bandeja-30", { recorte: cajon(), margen: 0, marca: cajon().getByRole("button", { name: "Renovar" }).first() });
  });
  await paso("16-bandeja-corregir", async () => {
    await cajon().locator('button[data-grupo="corregir"]').click();
    await espera(700);
    await guardarTexto(page, "16-bandeja-corregir", cajon());
    await foto(page, C, "16-bandeja-corregir", { recorte: cajon(), margen: 0 });
    await cajon().locator('button[data-grupo="hoy"]').click();
    await espera(500);
  });
  await paso("17-ventas-por-cargar", async () => {
    const fila = cajon().locator("input").first();
    await fila.fill("4200000");
    await espera(300);
    const caja = fila.locator("xpath=ancestor::*[3]");
    await foto(page, C, "17-ventas-por-cargar", { recorte: caja, margen: 10, marca: boton("Guardar", caja) });
    await boton("Guardar", caja).click();
    await espera(1200);
  });
  await paso("18-reserva-caduca", async () => {
    const conf = cajon().getByRole("button", { name: "Confirmar", exact: true });
    await conf.scrollIntoViewIfNeeded();
    const caja = conf.locator("xpath=ancestor::*[3]");
    await foto(page, C, "18-reserva-caduca", { recorte: caja, margen: 12, marca: [{ loc: conf, n: 1 }, { loc: cajon().getByRole("button", { name: "Cancelar", exact: true }), n: 2 }] });
    await conf.click();
    await espera(900);
    await foto(page, C, "19-reserva-confirmada", { recorte: cajon(), margen: 0 });
  });
  await paso("20-no-se-pudo", async () => {
    const f = cajon().getByText("PUN-02·EN2", { exact: true }).last();
    await f.scrollIntoViewIfNeeded();
    await foto(page, C, "20-no-se-pudo-montar", { recorte: f.locator("xpath=ancestor::*[2]"), margen: 12 });
  });
  await paso("21-renovar-desde-pendientes", async () => {
    await cajon().locator('button[data-grupo="dias30"]').click();
    await espera(600);
    await cajon().getByRole("button", { name: "Renovar" }).first().click();
    await espera(1500);
    await foto(page, C, "21-renovar-desde-pendientes", { marca: panel().locator("section.bloque").first() });
  });

  // ── 3. Vender un espacio ────────────────────────────────────────────────
  await ir("/contratos");
  const fechas = page.getByText("¿Para qué fechas?", { exact: true }).locator("xpath=ancestor::*[2]");
  await paso("30-fechas", () => foto(page, C, "30-para-que-fechas", {
    recorte: fechas, margen: 10,
    marca: [{ loc: page.locator('input[type="date"]').first(), n: 1 }, { loc: boton("1 mes"), n: 2 }, { loc: boton("Temporadas"), n: 3 }],
  }));
  await paso("31-temporadas", async () => {
    await boton("Temporadas").click();
    await espera(700);
    await foto(page, C, "31-temporadas", { recorte: page.getByRole("button", { name: /^Navidad/ }).first().locator("xpath=ancestor::*[2]"), margen: 12, marca: page.getByRole("button", { name: /^Navidad/ }).first() });
    await boton("Temporadas").click();
    await espera(400);
  });
  await boton("3 meses").click();
  await espera(900);
  await paso("32-plano", () => foto(page, C, "32-plano-de-la-venta", { marca: page.getByText("Libre todo el periodo").locator("..").locator("..") }));
  await tocar("PUN-07");
  await paso("33-elegir", () => foto(page, C, "33-elegir-espacio", { marca: page.locator('text[data-cod="PUN-07"]').first() }));
  await paso("34-entera-al-mes", async () => {
    await boton("Al mes").click();
    await espera(500);
    await foto(page, C, "34-entera-al-mes", { recorte: bloque(1), margen: 10, marca: [{ loc: boton("Entera"), n: 1 }, { loc: boton("Al mes"), n: 2 }] });
  });
  await paso("35-proveedor", async () => {
    const prov = page.getByPlaceholder("Escribí el nombre");
    await prov.click();
    await page.keyboard.type("Gal", { delay: 80 });
    await espera(900);
    await foto(page, C, "35-proveedor", { recorte: bloque(2), margen: 10, marca: prov });
    await prov.press("Tab");
    await espera(500);
    await page.getByPlaceholder(/La que va en el espacio/).fill("Galletas Sol Integral");
    await foto(page, C, "36-a-quien-y-cuando", { recorte: bloque(2), margen: 10, marca: page.getByPlaceholder(/La que va en el espacio/) });
  });
  await paso("37-correo-y-nota", async () => {
    await page.getByText("Correo y nota para el proveedor").click();
    await espera(600);
    await page.getByPlaceholder("opcional", { exact: true }).fill("compras@galletassol.example");
    await page.getByPlaceholder(/Algo que haya que saber/).fill("Incluye cabezote con el logo.");
    await page.getByPlaceholder(/Algo que haya que saber/).scrollIntoViewIfNeeded();
    await foto(page, C, "37-correo-y-nota", { recorte: bloque(3), margen: 10, marca: [{ loc: page.getByPlaceholder("opcional", { exact: true }), n: 1 }, { loc: page.getByPlaceholder(/Algo que haya que saber/), n: 2 }] });
  });
  await paso("38-guardar", () => foto(page, C, "38-frase-y-guardar", { recorte: pie(), margen: 6, marca: boton("Guardar contrato") }));
  await paso("39-guardado", async () => {
    await boton("Guardar contrato").click();
    await espera(2500);
    await guardarTexto(page, "39-guardado", panel());
    await panel().scrollIntoViewIfNeeded();
    await foto(page, C, "39-contrato-guardado", { recorte: panel(), margen: 0 });
    const qp = page.locator("[data-que-pasa-ahora]");
    await qp.scrollIntoViewIfNeeded();
    await foto(page, C, "40-que-pasa-ahora", { recorte: qp, margen: 10 });
  });
  await paso("41-correo-proveedor", async () => {
    const correo = await abrir(nav, null);
    await correo.page.goto(correoReal("Confirmación de 1 espacio", "PUN-07"));
    await foto(correo.page, C, "41-correo-proveedor");
    await correo.page.goto(correoReal("contrato nuevo", "PUN-07"));
    await foto(correo.page, C, "42-correo-comercial");
    await correo.contexto.close();
  });

  // Otras formas de vender (sin guardar).
  await ir("/contratos");
  await boton("3 meses").click();
  await espera(700);
  await paso("43-entrepanos", async () => {
    await tocar("PUN-02");
    await boton("Por entrepaños").click();
    await espera(600);
    const en3 = bloque(1).getByText("EN3", { exact: true }).first();
    await en3.click().catch(() => {});
    await espera(600);
    await guardarTexto(page, "43-entrepanos", bloque(1));
    await foto(page, C, "43-por-entrepanos", { recorte: bloque(1), margen: 10, marca: [{ loc: boton("Por entrepaños"), n: 1 }, { loc: en3, n: 2 }] });
    await boton("Empezar de nuevo").click();
    await espera(600);
  });
  await paso("44-porcentaje", async () => {
    await tocar("GON-04·B");
    await boton("25 %").click();
    await espera(500);
    await boton("Al mes").click();
    await espera(500);
    await foto(page, C, "44-por-porcentaje", { recorte: bloque(1), margen: 10, marca: [{ loc: boton("25 %"), n: 1 }, { loc: boton("Al mes"), n: 2 }] });
  });
  await paso("45-reservar", async () => {
    const prov = page.getByPlaceholder("Escribí el nombre");
    await prov.click();
    await page.keyboard.type("Snacks", { delay: 80 });
    await espera(800);
    await prov.press("Tab");
    await espera(400);
    await boton("Reservar hasta…").click();
    await espera(600);
    const hasta = page.locator('[data-reserva] input[type="date"]').first();
    const d = new Date(); d.setDate(d.getDate() + 7);
    await hasta.fill(d.toISOString().slice(0, 10));
    await espera(500);
    await foto(page, C, "45-reservar-hasta", { recorte: pie(), margen: 6, marca: [{ loc: hasta, n: 1 }, { loc: boton("Reservar"), n: 2 }] });
    await boton("Reservar").click();
    await espera(2200);
    await guardarTexto(page, "46-reservado", panel());
    await foto(page, C, "46-reservado", { recorte: panel(), margen: 0 });
  });
  await ir("/contratos");
  await boton("3 meses").click();
  await espera(700);
  await paso("47-ventas", async () => {
    await tocar("PUN-08");
    await boton("% de las ventas").click();
    await espera(500);
    const pct = bloque(3).locator("input").first();
    await pct.fill("5");
    await espera(400);
    await foto(page, C, "47-porcentaje-de-ventas", { recorte: bloque(3), margen: 10, marca: [{ loc: boton("% de las ventas"), n: 1 }, { loc: pct, n: 2 }, { loc: boton("Cada mes"), n: 3 }] });
    await boton("Empezar de nuevo").click();
    await espera(600);
    await boton("Precio fijo").click();
    await espera(400);
  });
  await paso("48-tomado", async () => {
    await tocar("PUN-06");
    const msg = page.getByText(/está tomado del/).first();
    await guardarTexto(page, "48-tomado", bloque(1));
    await foto(page, C, "48-espacio-tomado", { recorte: bloque(1), margen: 10, marca: msg });
    await boton("Empezar de nuevo").click();
    await espera(600);
  });
  await paso("49-linea", async () => {
    await boton("Línea de tiempo").click();
    await espera(1200);
    await foto(page, C, "49-linea-de-tiempo", { marca: page.getByText("Sólo los disponibles en tus fechas") });
    await boton("Plano").click();
    await espera(800);
  });
  await paso("50-cuando-se-libera", async () => {
    const t = page.getByText("Cuándo se libera cada espacio", { exact: true }).locator("xpath=ancestor::section[1]");
    await t.scrollIntoViewIfNeeded();
    await foto(page, C, "50-cuando-se-libera", { recorte: t, margen: 8 });
  });
  await paso("51-tarifa-referencia", async () => {
    const t = page.getByText("Tarifa de referencia", { exact: true }).last().locator("xpath=ancestor::section[1]");
    await t.scrollIntoViewIfNeeded();
    await foto(page, C, "51-tarifa-de-referencia", { recorte: t, margen: 8 });
  });
  await paso("52-planilla", async () => {
    await page.evaluate(() => document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }));
    await boton("Planilla").click();
    await espera(900);
    await foto(page, C, "52-planilla", { marca: boton("Descargar la plantilla") });
    await page.keyboard.press("Escape");
    await espera(500);
  });
  await paso("53-tarifas", async () => {
    await ir("/contratos");
    await boton("Tarifas").click();
    await espera(900);
    await foto(page, C, "53-tarifas");
    await page.keyboard.press("Escape");
  });

  // ── 4. La ficha del espacio ─────────────────────────────────────────────
  await paso("60-abrir-ficha", async () => {
    await ir("/indicadores");
    await cerrarCajon();
    await page.getByRole("tab", { name: "Contratos" }).click();
    await espera(900);
    const fila = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "PUN-01", exact: true }) }).first();
    await foto(page, C, "60-abrir-ficha", { marca: fila });
    await fila.click();
    await espera(1300);
    await foto(page, C, "61-ficha", { recorte: cajon(), margen: 0 });
  });
  await paso("62-ficha-abajo", async () => {
    const l = cajon().getByText("Los próximos 12 meses").first();
    await l.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 250);
    await espera(500);
    await foto(page, C, "62-ficha-linea-y-planometria", { recorte: cajon(), margen: 0 });
  });
  await paso("63-cancelar-pregunta-pun01", async () => {
    // Sólo para mostrar el botón; no se cancela PUN-01.
    const b = cajon().getByRole("button", { name: "Cancelar el contrato" });
    await b.scrollIntoViewIfNeeded();
    await foto(page, C, "63-cancelar-boton", { recorte: cajon(), margen: 0, marca: b });
  });
  await paso("64-editar", async () => {
    await page.getByRole("button", { name: "Editar contrato" }).first().scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Editar contrato" }).first().click();
    await espera(1500);
    await foto(page, C, "64-editando", { recorte: panel(), margen: 0, marca: page.getByText(/Editando el contrato de/).first() });
    await page.getByText("Correo y nota para el proveedor").click();
    await espera(500);
    const nota = page.getByPlaceholder(/Algo que haya que saber/);
    await nota.fill("Se suma un exhibidor de piso en diciembre.");
    await espera(500);
    await foto(page, C, "65-editar-guardar", { recorte: pie(), margen: 6, marca: boton("Guardar cambios y reenviar") });
    await boton("Guardar cambios y reenviar").click();
    await espera(800);
    await foto(page, C, "66-editar-confirmar", { marca: boton("Guardar y reenviar") });
    await boton("Guardar y reenviar").click();
    await espera(2200);
    await guardarTexto(page, "67-editado", panel());
    await foto(page, C, "67-editado", { recorte: panel(), margen: 0 });
  });
  await paso("68-renovar", async () => {
    await fichaDesdeContratos("PUN-01");
    const r = cajon().getByRole("button", { name: /^Renovar con/ });
    await foto(page, C, "68-renovar-boton", { recorte: cajon(), margen: 0, marca: r });
    await r.click();
    await espera(1500);
    await guardarTexto(page, "69-renovar", panel());
    await foto(page, C, "69-renovar-formulario", { marca: [{ loc: page.locator('section.bloque[data-bloque="2"] input[type="date"]').first(), n: 1 }, { loc: page.locator('section.bloque[data-bloque="2"] input[type="date"]').nth(1), n: 2 }] });
  });
  await paso("70-planometria", async () => {
    await fichaDesdeContratos("PUN-07");
    const adj = cajon().getByText("Adjuntar la planometría").first();
    await adj.scrollIntoViewIfNeeded();
    await foto(page, C, "70-adjuntar-planometria", { recorte: cajon(), margen: 0, marca: adj });
    await cajon().locator('input[type="file"]').first().setInputFiles(FOTO);
    await espera(2500);
    const pl = cajon().getByText("PLANOMETRÍA", { exact: false }).first();
    await pl.scrollIntoViewIfNeeded();
    await guardarTexto(page, "71-planometria-cargada", cajon());
    await foto(page, C, "71-planometria-cargada", { recorte: cajon(), margen: 0 });
  });
  await paso("72-correo-montaje", async () => {
    const correo = await abrir(nav, null);
    await correo.page.goto(correoReal("por montar", "PUN-07"));
    await foto(correo.page, C, "72-correo-de-montaje");
    await correo.contexto.close();
  });
  await paso("73-anteriores", async () => {
    await ir("/indicadores");
    await cerrarCajon();
    await page.getByRole("tab", { name: "Contratos" }).click();
    await espera(800);
    await page.getByRole("button", { name: /^Libres/ }).first().click();
    await espera(700);
    await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "PUN-08", exact: true }) }).first().click();
    await espera(1300);
    const ant = cajon().getByText("Contratos anteriores").first();
    await ant.scrollIntoViewIfNeeded();
    const todos = cajon().getByRole("button", { name: /Ver todos/ });
    await foto(page, C, "73-contratos-anteriores", { recorte: cajon(), margen: 0, marca: (await todos.count()) ? todos : ant });
    if (await todos.count()) {
      await todos.click();
      await espera(1500);
      await foto(page, C, "74-ver-todos-historial");
    }
  });
  await paso("75-cancelar", async () => {
    await fichaDesdeContratos("PUN-06");
    const b = cajon().getByRole("button", { name: "Cancelar el contrato" });
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await espera(800);
    const si = cajon().getByRole("button", { name: "Sí, cancelar" });
    await si.scrollIntoViewIfNeeded();
    await guardarTexto(page, "75-cancelar", cajon());
    await foto(page, C, "75-cancelar-confirmacion", { recorte: cajon(), margen: 0, marca: [{ loc: cajon().getByRole("button", { name: "Dejarlo así" }), n: 1 }, { loc: si, n: 2 }] });
    await si.click();
    await espera(2000);
    await guardarTexto(page, "76-cancelado", page.locator("body"));
    await foto(page, C, "76-cancelado");
  });

  // ── 5. Indicadores ──────────────────────────────────────────────────────
  await ir("/indicadores");
  await cerrarCajon();
  await paso("80-mapa", () => foto(page, C, "80-mapa-de-oportunidades", { marca: page.getByRole("tablist").first() }));
  await paso("81-fecha", async () => {
    await page.getByRole("button", { name: /\d{1,2} \w{3} \d{4}/ }).first().click();
    await espera(700);
    await foto(page, C, "81-fecha-de-indicadores", { recorte: page.getByRole("button", { name: /^Navidad/ }).first().locator("xpath=ancestor::*[2]"), margen: 12 });
    await page.getByRole("button", { name: /\d{1,2} \w{3} \d{4}/ }).first().click();
    await espera(500);
  });
  for (const [i, [tab, nombre]] of [["Análisis", "82-analisis"], ["Plano", "83-plano"], ["Contratos", "84-contratos"], ["Historial", "85-historial"],
    ["Quién paga", "87-quien-paga"], ["Participaciones", "88-participaciones"], ["Diccionario", "89-diccionario"]].entries()) {
    await paso(nombre, async () => {
      await page.getByRole("tab", { name: tab }).click();
      await espera(1200);
      if (tab === "Contratos") {
        await foto(page, C, nombre, { marca: [{ loc: page.getByRole("button", { name: /^Por vencer/ }).first(), n: 1 }, { loc: page.getByPlaceholder("Filtrar").first(), n: 2 }, { loc: page.getByRole("button", { name: /CSV/ }).first(), n: 3 }] });
      } else if (tab === "Historial") {
        await foto(page, C, nombre, { marca: page.getByRole("button", { name: /Exportar a Excel/ }) });
        await page.getByRole("button", { name: /^Cancelado/ }).first().click();
        await espera(800);
        await foto(page, C, "86-historial-cancelados", { marca: page.getByRole("button", { name: /^Cancelado/ }).first() });
      } else {
        await foto(page, C, nombre);
      }
    });
    void i;
  }

  // ── 6. Montajes ─────────────────────────────────────────────────────────
  await ir("/montajes");
  await cerrarCajon();
  await paso("90-montajes", () => foto(page, C, "90-montajes", { marca: page.locator("[data-filtros-montajes]") }));
  await paso("91-verificar", async () => {
    await page.locator('[data-filtro="sin_verificar"]').click();
    await espera(700);
    const f = page.locator("li.mj-fila").filter({ hasText: "PUN-04" }).first();
    await foto(page, C, "91-sin-verificar", { marca: boton("Verificar montaje", f) });
    await boton("Verificar montaje", f).click();
    await espera(1500);
    await foto(page, C, "92-verificar", { marca: [{ loc: page.getByRole("radio", { name: "Coincide", exact: true }), n: 1 }, { loc: page.getByRole("radio", { name: "No coincide" }), n: 2 }] });
    await page.getByRole("radio", { name: "No coincide" }).click();
    await cajon().locator("textarea").fill("Falta el cabezote con el logo arriba de la punta.");
    await espera(400);
    await foto(page, C, "93-no-coincide", { marca: [{ loc: cajon().locator("textarea"), n: 1 }, { loc: cajon().getByText("Mandar el aviso de montaje de nuevo"), n: 2 }, { loc: boton("Guardar la verificación"), n: 3 }] });
    await boton("Guardar la verificación").click();
    await espera(1800);
    await guardarTexto(page, "94-verificado", cajon());
    await foto(page, C, "94-verificado-no-coincide", { marca: boton("Verificar el siguiente") });
    await boton("Verificar el siguiente").click();
    await espera(1500);
    await page.getByRole("radio", { name: "Coincide", exact: true }).click();
    await espera(300);
    await foto(page, C, "95-coincide", { marca: boton("Guardar la verificación") });
    await boton("Guardar la verificación").click();
    await espera(1500);
    await page.keyboard.press("Escape");
    await espera(600);
  });
  await paso("96-no-realizado", async () => {
    await page.locator('[data-filtro="no_realizado"]').click().catch(() => page.locator('[data-filtro="todos"]').click());
    await espera(700);
    const f = page.locator("li.mj-fila").filter({ hasText: "PUN-02-EN2" }).first();
    await boton("Resolver", f).click();
    await espera(1500);
    await guardarTexto(page, "96-no-realizado", cajon());
    await foto(page, C, "96-no-realizado", { marca: cajon().getByRole("button", { name: /Registrar el montaje de nuevo/ }) });
    await page.keyboard.press("Escape");
    await espera(600);
  });
  await paso("97-registrar", async () => {
    await page.locator('[data-filtro="todos"]').click();
    await espera(700);
    const f = page.locator("li.mj-fila").filter({ hasText: "PUN-03-EN1" }).first();
    await foto(page, C, "97-registrar-boton", { marca: boton("Registrar montaje", f) });
    await boton("Registrar montaje", f).click();
    await espera(1500);
    await guardarTexto(page, "98-registrar", page.locator("body"));
    await foto(page, C, "98-registrar-formulario");
    const monte = page.getByRole("button", { name: "Lo monté", exact: true });
    if (await monte.count()) {
      await monte.click();
      await espera(600);
      await page.locator('input[type="file"]').first().setInputFiles(FOTO);
      await espera(800);
      const nombre = page.getByPlaceholder(/nombre|Quién reporta/i).first();
      if (await nombre.count()) await nombre.fill("Ana Prueba");
      await foto(page, C, "99-registrar-con-foto", { marca: boton("Confirmar") });
      await boton("Confirmar").click();
      await espera(1800);
      await guardarTexto(page, "99b-registrado", page.locator("body"));
      await foto(page, C, "99b-registrado");
    }
  });
  await paso("100-falta-planometria", async () => {
    await ir("/montajes");
    const f = page.locator("li.mj-fila").filter({ hasText: "PUN-03-EN2" }).first();
    await foto(page, C, "100-falta-planometria", { recorte: f, margen: 8, marca: boton("Adjuntar planometría", f) });
  });

  // ── 10. Problemas frecuentes ────────────────────────────────────────────
  await paso("110-sin-conexion", async () => {
    await ir("/");
    await cerrarCajon();
    await contexto.setOffline(true);
    await page.getByRole("button", { name: /Sincronizado/ }).first().click();
    await espera(4000);
    await foto(page, C, "110-sin-conexion", { recorte: page.locator(".barra-app"), margen: 0, marca: page.getByRole("button", { name: /Sin conexión/ }).first() });
    await contexto.setOffline(false);
    await page.getByRole("button", { name: /Sin conexión/ }).first().click();
    await espera(3000);
  });

  await nav.close();
  if (fallas.length) { console.error("Fallaron:", fallas.join(", ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * La captura de este manual. Como `foto()` de `comun.cjs`, pero sin
 * `fullPage`: la app se desplaza por dentro (el panel del contrato, la ficha,
 * la bandeja), y una captura de página completa cambiaba el tamaño de la
 * ventana y corría los recuadros. Acá el recuadro es `position: fixed` sobre
 * la ventana y el recorte se hace sobre lo que se ve.
 */
async function foto(page, carpeta, nombre, { marca, recorte, margen = 16 } = {}) {
  const dir = path.join(__dirname, "..", "img", carpeta);
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (recorte) await recorte.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(350);
  const lista = marca ? (Array.isArray(marca) ? marca : [marca]) : [];
  const cajas = [];
  for (const o of lista) {
    const loc = o.loc ?? o;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error(`No se ve lo que hay que marcar: ${loc}`);
    cajas.push({ ...b, n: o.n ?? null });
  }
  await page.evaluate((cajas) => {
    for (const c of cajas) {
      const d = document.createElement("div");
      d.className = "manual-marca";
      Object.assign(d.style, {
        position: "fixed", left: `${c.x - 5}px`, top: `${c.y - 5}px`, width: `${c.width + 10}px`, height: `${c.height + 10}px`,
        border: "4px solid #F97316", borderRadius: "10px", boxShadow: "0 0 0 3px rgba(255,255,255,.9)",
        zIndex: 2147483647, pointerEvents: "none",
      });
      document.documentElement.appendChild(d);
      if (c.n !== null) {
        const n = document.createElement("div");
        n.className = "manual-marca";
        n.textContent = String(c.n);
        Object.assign(n.style, {
          position: "fixed", left: `${Math.max(2, c.x - 18)}px`, top: `${Math.max(2, c.y - 18)}px`, width: "28px", height: "28px",
          borderRadius: "50%", background: "#F97316", color: "#fff", font: "700 16px/28px system-ui, sans-serif",
          textAlign: "center", zIndex: 2147483647, pointerEvents: "none", boxShadow: "0 0 0 3px #fff",
        });
        document.documentElement.appendChild(n);
      }
    }
  }, cajas);
  const opciones = { path: path.join(dir, `${nombre}.jpg`), type: "jpeg", quality: 82, animations: "disabled" };
  if (recorte) {
    const b = await recorte.boundingBox();
    const vp = page.viewportSize();
    const x = Math.max(0, b.x - margen), y = Math.max(0, b.y - margen);
    opciones.clip = { x, y, width: Math.min(vp.width - x, b.width + 2 * margen), height: Math.min(vp.height - y, b.height + 2 * margen) };
  }
  await page.screenshot(opciones);
  await page.evaluate(() => document.querySelectorAll(".manual-marca").forEach((x) => x.remove()));
  console.log(`  📷 ${carpeta}/${nombre}.jpg`);
}

async function paso(nombre, fn) {
  try { await fn(); } catch (e) {
    fallas.push(nombre);
    console.error(`  ✗ ${nombre}: ${String(e.message).split("\n").slice(0, 3).join(" | ")}`);
    if (paginaActual && process.env.MANUAL_TMP) await paginaActual.screenshot({ path: path.join(process.env.MANUAL_TMP, `falla-${nombre}.png`) }).catch(() => {});
  }
}

async function guardarTexto(page, nombre, loc) {
  const t = await (loc ?? page.locator("body")).innerText().catch(() => "");
  fs.writeFileSync(path.join(TEXTOS, `${nombre}.txt`), t.replace(/\n{2,}/g, "\n"));
}
