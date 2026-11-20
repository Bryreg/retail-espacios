/**
 * Capturas de los capítulos del ADMINISTRADOR sobre el plano: 7 · Plano de la
 * sede, 8 · Planogramas y 9 · Ajustes. Escribe `img/administrador-plano/*.jpg`.
 *
 * Corre contra la copia de prueba recién sembrada (`herramientas/levantar.sh`):
 * coloca y borra muebles, publica una versión de un planograma y revisa un
 * montaje, así que se corre UNA vez por siembra. Todo en computador
 * (1280 × 800, escala 2). El plano 2D se maneja con el mouse: los clics van a
 * coordenadas medidas después de «Centrar en todo».
 *
 *   MANUAL_TMP=<carpeta de levantar.sh> MANUAL_PUERTO=8790 node docs/manuales/administrador/capturas-plano.cjs
 *
 * Los textos de cada pantalla quedan en $MANUAL_TMP/textos-plano/ para
 * comparar el manual con lo que dice la app.
 */
const { lanzar, abrir, marcar } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "administrador-plano";
const IMG = path.resolve(__dirname, "..", "img");

/**
 * `foto` de `comun.cjs`, con las marcas fuera del `zoom` de la app: en
 * computador la app escala `<body>` (escala.ts, ~0,9 a 1280 × 800) y los
 * recuadros que `marcar()` agrega a `body` salían corridos. Acá se mudan a
 * `<html>`, que no lleva zoom, antes de sacar la foto.
 */
async function foto(page, carpeta, nombre, { marca, recorte, margen = 16 } = {}) {
  const dir = path.join(IMG, carpeta);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(350);
  const quitar = marca ? await marcar(page, marca) : null;
  if (quitar) await page.evaluate(() => document.querySelectorAll(".manual-marca").forEach((m) => document.documentElement.appendChild(m)));
  const opciones = { path: path.join(dir, `${nombre}.jpg`), type: "jpeg", quality: 82, animations: "disabled" };
  if (recorte) {
    await recorte.scrollIntoViewIfNeeded().catch(() => {});
    const b = await recorte.boundingBox();
    const vp = page.viewportSize();
    const x = Math.max(0, b.x - margen), y = Math.max(0, b.y - margen);
    opciones.clip = { x, y, width: Math.min(vp.width - x, b.width + 2 * margen), height: Math.min(vp.height - y, b.height + 2 * margen) };
  }
  await page.screenshot(opciones);
  if (quitar) await quitar();
  console.log(`  📷 ${carpeta}/${nombre}.jpg`);
}

const TEXTOS = path.join(process.env.MANUAL_TMP || "/tmp", "textos-plano");
fs.mkdirSync(TEXTOS, { recursive: true });

(async () => {
  const nav = await lanzar();
  const { page } = await abrir(nav, "admin");
  const boton = (n, exact = true) => page.getByRole("button", { name: n, exact });
  const espera = (ms = 700) => page.waitForTimeout(ms);
  const guardarTexto = async (nombre, loc = page.locator("body")) =>
    fs.writeFileSync(path.join(TEXTOS, `${nombre}.txt`), (await loc.innerText()).replace(/\n{2,}/g, "\n"));
  /** El rótulo de un mueble en el lienzo (SVG): se le hace clic con el mouse. */
  const rotulo = (codigo) => page.locator("svg text", { hasText: new RegExp(`^${codigo}$`) }).first();
  const clicEnMueble = async (codigo) => {
    const b = await rotulo(codigo).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await espera(1200);
    return b;
  };
  const ficha = () => page.locator("body");
  const alPlano = async () => {
    await page.goto("/plano");
    await page.waitForLoadState("networkidle");
    await espera(1500);
    await page.getByRole("button", { name: "Centrar en todo" }).click();
    await espera(600);
  };

  // ══ 7 · PLANO DE LA SEDE ══════════════════════════════════════════════════
  await alPlano();
  await foto(page, C, "01-plano-mirar", { marca: boton("Mirar").locator("xpath=..") });
  // Buscar
  const buscador = page.getByPlaceholder(/Buscar espacio/);
  await buscador.fill("PUN-05");
  await espera(800);
  await foto(page, C, "03-buscar", { marca: buscador.locator("xpath=..") });
  await buscador.fill("");
  // Filtros
  const chipPorVencer = page.getByRole("button", { name: /Por vencer/ }).first();
  await chipPorVencer.click();
  await espera(800);
  await foto(page, C, "04-por-vencer", { marca: chipPorVencer });
  await page.getByRole("button", { name: /^Todos/ }).first().click();
  await espera(500);
  // La ficha (Mirar)
  await clicEnMueble("PUN-01");
  await foto(page, C, "05-ficha-mirar", { marca: page.locator("[data-codigo-del-mueble]") });
  await guardarTexto("05-ficha-mirar");
  await page.keyboard.press("Escape");
  await espera(400);

  // Editar: la tira del catálogo y colocar
  await boton("Editar").click();
  await espera(800);
  await foto(page, C, "02-plano-editar", { marca: [
    { loc: page.locator("[data-tira-2d]"), n: 1 },
    { loc: boton("Seleccionar").locator("xpath=.."), n: 2 },
  ] });
  const punta = page.locator("[data-tira-2d] button", { hasText: "Punta" }).first();
  await punta.click();
  await page.mouse.move(400, 680);
  await espera(500);
  await foto(page, C, "06-elegir-del-catalogo", { marca: punta });
  await page.mouse.click(400, 680);
  await espera(1500);
  await page.mouse.click(384, 643); // el mueble recién puesto
  await espera(1500);
  await foto(page, C, "07-colocado", { marca: page.locator("[data-codigo-del-mueble]") });
  await guardarTexto("07-colocado");

  // Cambiar el código
  await boton("Cambiar el código").click();
  await espera(400);
  const campoCodigo = page.getByLabel("El código del mueble");
  await campoCodigo.fill("PUN-10");
  await foto(page, C, "08-cambiar-codigo", { marca: campoCodigo });
  await campoCodigo.press("Enter");
  await espera(800);

  // Medidas
  await page.locator("[data-pestana=medidas]").click();
  await espera(800);
  await foto(page, C, "09-medidas", { marca: page.locator("[data-pestana=medidas]") });
  await guardarTexto("09-medidas", ficha());
  await page.locator("[data-pestana=venta]").click();
  await espera(600);

  // Cómo se vende
  const como = page.getByRole("radiogroup", { name: "Cómo se vende" }).first();
  await como.scrollIntoViewIfNeeded();
  await como.getByRole("radio", { name: "Por entrepaños" }).click();
  await espera(1000);
  await foto(page, C, "10-como-se-vende", { marca: como });
  await guardarTexto("10-como-se-vende", ficha());
  await como.getByRole("radio", { name: "Entera" }).click();
  await espera(600);

  // Rotar y mover
  const rotar = page.getByRole("button", { name: /^Rotar/ }).first();
  await rotar.click();
  await espera(800);
  await foto(page, C, "11-rotar", { marca: rotar });

  // Eliminar un mueble libre (se puede deshacer)
  const eliminarFicha = page.locator(".p2-pie-ficha button", { hasText: "Eliminar" });
  await eliminarFicha.scrollIntoViewIfNeeded();
  await foto(page, C, "12-eliminar", { marca: eliminarFicha });
  await eliminarFicha.click();
  await espera(1500);
  // Eliminar un mueble CON contrato: el servidor no lo guarda.
  await clicEnMueble("PUN-04");
  await page.locator(".p2-pie-ficha button", { hasText: "Eliminar" }).click();
  await espera(2500);
  const aviso = page.getByText("El servidor no guardó el plano").locator("xpath=..");
  await foto(page, C, "13-rechazado", { marca: aviso });
  await guardarTexto("13-rechazado", aviso);
  await page.mouse.click(700, 760);
  await espera(400);
  const deshacer = page.getByRole("button", { name: /^Deshacer/ }).first();
  await deshacer.click();
  await espera(2500);
  await foto(page, C, "14-deshacer", { marca: deshacer });

  // Revisar y Renumerar
  await boton("Mirar").click();
  await espera(500);
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await espera(1200);
  await foto(page, C, "15-revisar", { marca: page.getByText("Revisión del plano").locator("xpath=../..") });
  await page.goto("/renumerar");
  await page.waitForLoadState("networkidle");
  await espera(2000);
  await foto(page, C, "16-renumerar", { marca: page.getByRole("button", { name: /Aplicar/ }) });
  await guardarTexto("16-renumerar");

  // El 3D
  await page.goto("/plano/3d");
  await page.waitForLoadState("networkidle");
  await espera(5000);
  await foto(page, C, "17-3d");
  await guardarTexto("17-3d");

  // Mis muebles y el asistente
  await page.goto("/plano/muebles");
  await page.waitForLoadState("networkidle");
  await espera(2500);
  await foto(page, C, "18-mis-muebles", { marca: page.getByText("Crear un mueble").first() });
  await page.getByText("Crear un mueble").first().click();
  await espera(5000);
  await page.getByText("Punta de góndola", { exact: true }).first().click();
  await espera(3000);
  await foto(page, C, "19-asistente-1", { marca: page.getByText("Punta de góndola", { exact: true }).first().locator("xpath=..") });
  await boton(/Siguiente: medidas/, false).click();
  await espera(2000);
  await foto(page, C, "20-asistente-2");
  await guardarTexto("20-asistente-2", page.locator("main").first());
  await boton(/Siguiente: nombre/, false).click();
  await espera(1500);
  await page.locator("#mm-nombre").fill("Punta corta de pasillo");
  await page.getByText("Las medí en la tienda", { exact: true }).click();
  await espera(800);
  await foto(page, C, "21-asistente-3", { marca: boton("Guardar mueble") });
  await guardarTexto("21-asistente-3", page.locator("main").first());
  await boton("Guardar mueble").click();
  await espera(3000);
  await foto(page, C, "22-mueble-listo");
  await guardarTexto("22-mueble-listo", page.locator("main").first());

  // Caras
  await page.goto("/plano/caras");
  await page.waitForLoadState("networkidle");
  await espera(2000);
  await foto(page, C, "23-caras");
  await guardarTexto("23-caras");

  // Distribuir esta cara (por participación): GON-03
  await alPlano();
  await clicEnMueble("GON-03");
  const bloqueCara = page.getByText("Se vende por porcentaje", { exact: false }).locator("xpath=..");
  await bloqueCara.scrollIntoViewIfNeeded();
  await foto(page, C, "24-la-cara-porcentaje", { marca: page.getByRole("button", { name: /Distribuir la cara/ }).first() });
  await guardarTexto("24-la-cara-porcentaje", ficha());
  await page.getByRole("button", { name: /Distribuir la cara/ }).first().click();
  await espera(6000);
  await foto(page, C, "25-distribuir-participaciones", { marca: boton("Listo, guardar la cara") });
  await guardarTexto("25-distribuir-participaciones");
  await boton("Listo, guardar la cara").click();
  await espera(2500);
  await foto(page, C, "26-distribucion-guardada");
  await guardarTexto("26-distribucion-guardada");

  // ══ 8 · PLANOGRAMAS ═══════════════════════════════════════════════════════
  await alPlano();
  await clicEnMueble("GON-12");
  const laCara = page.locator(".p2-panel-b, [data-ficha-2d]").last();
  await foto(page, C, "30-gon12-la-cara", { marca: page.getByText("La cara", { exact: true }).last().locator("xpath=..") });
  await guardarTexto("30-gon12-la-cara", ficha());

  await page.goto("/plano/caras");
  await page.waitForLoadState("networkidle");
  await espera(2000);
  await page.getByRole("button", { name: "Ver o cambiar el reparto" }).nth(1).click(); // GON-12 · B
  await espera(3000);
  await foto(page, C, "31-tres-pasos", { marca: [
    { loc: page.getByText("Elegí qué va", { exact: true }).locator("xpath=../.."), n: 1 },
    { loc: page.getByText("Dibujalo en la cara", { exact: true }).locator("xpath=../.."), n: 2 },
    { loc: page.getByText("Publicá con una fecha", { exact: true }).locator("xpath=../.."), n: 3 },
  ] });
  await boton("Agregar destino").click();
  await espera(800);
  await page.locator("#destino-nombre").fill("Lácteos");
  await page.locator("#destino-pct").fill("20");
  await foto(page, C, "32-agregar-destino", { marca: boton("Agregar a la cara") });
  await guardarTexto("32-agregar-destino", page.getByRole("dialog").last());
  await boton("Agregar a la cara").click();
  await espera(2000);
  await foto(page, C, "33-falta-ubicar", { marca: page.getByText("Arrastrala a la cara").locator("xpath=../..") });
  // Arrastrar «Lácteos» desde su manija hasta lo verde.
  const manija = page.getByText("Arrastrala a la cara").locator("xpath=../..");
  const bm = await manija.boundingBox();
  const desde = { x: bm.x + bm.width - 49, y: bm.y + bm.height / 2 };
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(desde.x + (620 - desde.x) * i / 15, desde.y + (238 - desde.y) * i / 15);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await espera(3000);
  await foto(page, C, "34-ubicada", { marca: page.getByRole("button", { name: /Publicar versión/ }).first() });
  await page.getByRole("button", { name: /Publicar versión/ }).first().click();
  await espera(1000);
  const dPublicar = page.getByRole("dialog").last();
  await foto(page, C, "35-publicar", { recorte: dPublicar, margen: 24, marca: dPublicar.getByRole("button", { name: /Publicar versión/ }) });
  await guardarTexto("35-publicar", dPublicar);
  await dPublicar.getByRole("button", { name: /Publicar versión/ }).click();
  await espera(2500);
  const listo = page.getByText(/quedó publicada/).locator("xpath=../..");
  await foto(page, C, "36-publicada", { marca: [
    { loc: page.getByRole("button", { name: /Ver e imprimir la guía/ }), n: 1 },
    { loc: page.getByRole("button", { name: /Mandarla a quien corresponde/ }).first(), n: 2 },
  ] });
  await guardarTexto("36-publicada");
  await page.getByRole("button", { name: /Mandarla a quien corresponde/ }).first().click();
  await espera(1500);
  const dMandar = page.getByRole("dialog").last();
  await foto(page, C, "37-mandar-guia", { recorte: dMandar, margen: 24 });
  await guardarTexto("37-mandar-guia", dMandar);
  console.log("  botones de «Mandarla»:", (await dMandar.locator("button").allInnerTexts()).join(" | "));
  const mandar = dMandar.getByRole("button", { name: /^Mandar/ }).last();
  if (await mandar.count()) {
    await mandar.click();
    await espera(2000);
    await foto(page, C, "38-guia-mandada");
    await guardarTexto("38-guia-mandada");
  }
  await page.keyboard.press("Escape");
  await espera(500);
  await boton("Versiones").click();
  await espera(1500);
  const dVersiones = page.getByRole("dialog").last();
  await foto(page, C, "39-versiones", { recorte: dVersiones, margen: 24 });
  await guardarTexto("39-versiones", dVersiones);
  await dVersiones.getByRole("button", { name: "Guía" }).first().click();
  await espera(2000);
  await foto(page, C, "40-la-guia", { marca: page.getByRole("button", { name: "Copiar el enlace" }) });
  await guardarTexto("40-la-guia", page.getByRole("dialog").last());

  // Verificar el montaje de un planograma: Pendientes › Hoy › Verificar
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");
  await espera(1200);
  await page.getByRole("button", { name: "Pendientes" }).first().click();
  await espera(1500);
  const verificar = page.getByRole("button", { name: /^Verificar/ }).first();
  await verificar.scrollIntoViewIfNeeded();
  await foto(page, C, "41-pendientes-verificar", { marca: verificar });
  await verificar.click();
  await espera(2500);
  await foto(page, C, "42-revisar-montaje", { marca: [
    { loc: boton("Lo vi en la tienda: coincide", false).first(), n: 1 },
    { loc: boton("No coincide"), n: 2 },
  ] });
  await guardarTexto("42-revisar-montaje");
  await boton("No coincide").click();
  await espera(800);
  const dRevision = page.getByText("¿Qué no está como en la guía?").locator("xpath=..");
  await dRevision.getByRole("button", { name: /Arroz La Esquina/ }).first().click();
  const nota = page.getByPlaceholder(/./).last();
  const campoNota = page.locator("textarea").last();
  await campoNota.fill("El arroz quedó en los estantes de abajo: va de arriba a abajo en toda su franja.");
  await espera(500);
  await foto(page, C, "43-no-coincide", { marca: boton("Guardar y mandar la guía") });
  await guardarTexto("43-no-coincide");
  await boton("Guardar y mandar la guía").click();
  await espera(2500);
  await foto(page, C, "44-revision-guardada");
  await guardarTexto("44-revision-guardada");

  // ══ 9 · AJUSTES ═══════════════════════════════════════════════════════════
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");
  await espera(1200);
  const engranaje = page.getByTitle(/Usuarios, avisos/).first();
  await foto(page, C, "50-abrir-ajustes", { recorte: page.locator("nav").first(), marca: engranaje, margen: 8 });
  await engranaje.click();
  await espera(1000);
  await foto(page, C, "51-comercial", { marca: page.locator("[data-tema=comercial]") });
  await boton("Abrir las tarifas").click();
  await espera(1200);
  await foto(page, C, "52-tarifas");
  await guardarTexto("52-tarifas");
  await page.keyboard.press("Escape");
  await espera(500);
  await boton("Editar las temporadas").click();
  await espera(1200);
  await foto(page, C, "53-temporadas");
  await guardarTexto("53-temporadas");
  await page.keyboard.press("Escape");
  await espera(500);
  const metas = page.locator("[data-bloque-ajustes=metas]");
  await foto(page, C, "54-metas", { recorte: metas, margen: 12, marca: boton("Guardar las metas") });

  await page.locator("[data-tema=sede]").click();
  await espera(1500);
  await foto(page, C, "55-sede-y-plano", { marca: page.locator("[data-bloque-ajustes=sedes]") });
  await guardarTexto("55-sede-y-plano", page.locator(".ajustes-tema"));
  const nombres = page.locator("[data-seccion=nombres-de-muebles]");
  await nombres.scrollIntoViewIfNeeded();
  const campoEstiba = nombres.locator("input").nth(9);
  await campoEstiba.fill("Mamut");
  await foto(page, C, "56-nombres", { recorte: nombres, margen: 8, marca: campoEstiba });
  await campoEstiba.fill("");
  await campoEstiba.press("Tab");

  await page.locator("[data-tema=avisos]").click();
  await espera(1500);
  await foto(page, C, "57-avisos", { marca: [
    { loc: boton("Enviar correo de prueba", false), n: 1 },
    { loc: page.getByText("Quién recibe los avisos").locator("xpath=.."), n: 2 },
  ] });
  await guardarTexto("57-avisos", page.locator(".ajustes-tema"));
  await boton(/Enviar correo de prueba/, false).click();
  await espera(4000);
  await foto(page, C, "58-correo-de-prueba", { recorte: page.locator(".ajustes-tema .aj-bloque").first(), margen: 8 });
  await guardarTexto("58-correo-de-prueba", page.locator(".ajustes-tema"));

  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
