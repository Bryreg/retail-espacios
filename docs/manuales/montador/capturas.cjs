/**
 * Capturas del manual de QUIEN MONTA (sin cuenta: entra por el enlace del
 * correo). Vista de computador, en una ventana de 900 px (la pantalla de
 * montaje y la guía son de una columna: así la letra se lee en A4); cada paso
 * recorta la zona que importa.
 *
 * Corre contra la copia de prueba recién sembrada (`herramientas/levantar.sh`):
 * registra montajes de verdad, así que se corre una sola vez por siembra.
 *
 *   MANUAL_TMP=<carpeta de levantar.sh> node docs/manuales/montador/capturas.cjs
 */
const { lanzar, abrir, DATOS, correoReal, enlaceDeMontaje, foto } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "montador";
const FOTO = path.join(__dirname, "..", "herramientas", "foto-de-prueba.jpg");
const texto = async (page) => (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
const guardar = async (page, nombre) => fs.writeFileSync(path.join(__dirname, `textos-${nombre}.txt`), await texto(page));

(async () => {
  const dirImg = path.join(__dirname, "..", "img", C);
  if (fs.existsSync(dirImg)) for (const f of fs.readdirSync(dirImg)) fs.rmSync(path.join(dirImg, f));
  const nav = await lanzar();
  const { page } = await abrir(nav, null, { ancho: 900 });
  const boton = (n) => page.getByRole("button", { name: n, exact: true });
  const ir = async (url) => { await page.goto(url); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800); };
  // Las partes de la pantalla de montaje.
  const tarjeta = () => page.getByText("Entrepaño 1 de", { exact: false }).locator("..");
  const planometria = () => page.locator('a:has-text("Tocá para verla en grande")');
  const mapa = () => page.locator('a:has-text("Tocá para verla en grande") + div');
  const nombre = () => page.getByPlaceholder(/Quién reporta/i).first();

  // ── 1. El correo y el enlace ────────────────────────────────────────────
  await ir(correoReal("por montar", "PUN-03-EN1"));
  const enlace = page.getByRole("link", { name: "Ver dónde queda y confirmar" });
  // En el correo el enlace va pegado al renglón de arriba: un poco de aire para
  // que el recuadro naranja no tape «… · desde el dd/mm/aaaa».
  await enlace.evaluate((a) => { a.style.display = "inline-block"; a.style.marginTop = "8px"; });
  await foto(page, C, "01-correo", { recorte: page.locator('div[style*="max-width:560px"]'), margen: 20, marca: enlace });
  await guardar(page, "01-correo");
  await enlace.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  await foto(page, C, "02-espacio");
  await foto(page, C, "03-tarjeta", { recorte: tarjeta(), marca: page.getByText("Entrepaño 1 de", { exact: false }) });
  await foto(page, C, "04-asi-debe-quedar", { recorte: planometria(), marca: page.getByText("Tocá para verla en grande") });
  // «Tocá para verla en grande» abre la planometría en una pestaña nueva.
  const [grande] = await Promise.all([page.context().waitForEvent("page"), page.getByText("Tocá para verla en grande").click()]);
  await grande.waitForLoadState("load");
  await grande.waitForTimeout(700);
  await foto(grande, C, "05-planometria-grande");
  await grande.close();
  await page.waitForTimeout(400);
  await foto(page, C, "06-donde-queda", { recorte: mapa(), marca: page.getByText("PUN-03", { exact: true }).last() });

  // ── 2. Lo monté (con foto) ──────────────────────────────────────────────
  await foto(page, C, "07-lo-monte", { recorte: [mapa(), boton("No pude")], marca: boton("Lo monté") });
  await boton("Lo monté").click();
  await page.waitForTimeout(600);
  await foto(page, C, "08-formulario", { recorte: [boton("Lo monté"), boton("Confirmar")], marca: page.getByText("Tomar foto", { exact: true }) });
  await boton("Confirmar").click();
  await page.waitForTimeout(500);
  await foto(page, C, "09-falta-la-foto", { recorte: [nombre(), boton("Confirmar")], marca: page.getByText(/Falta la foto/).first() });
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(800);
  await nombre().fill("Luis Prueba");
  await foto(page, C, "10-con-foto-y-nombre", { recorte: [boton("Lo monté"), boton("Confirmar")], marca: nombre() });
  await foto(page, C, "11-confirmar", { recorte: [nombre(), boton("Confirmar")], marca: boton("Confirmar") });
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  const listo = page.getByText("Listo, quedó reportado").locator("..");
  await foto(page, C, "12-listo", { recorte: listo, margen: 24 });
  await guardar(page, "12-listo");
  const corregir = page.getByText("Corregir lo que acabo de reportar");
  await foto(page, C, "12b-corregir", { recorte: [listo, corregir], margen: 24, marca: corregir });
  await corregir.click();
  await page.waitForTimeout(700);
  await foto(page, C, "12c-corregir-formulario");
  await guardar(page, "12c-corregir");

  // ── 3. No pude ──────────────────────────────────────────────────────────
  await ir(enlaceDeMontaje("CENTRO-GON-02-PC1", DATOS.leases["GON-02-PC1"]));
  await foto(page, C, "13-otro-espacio");
  await guardar(page, "13-otro-espacio");
  await foto(page, C, "14-no-pude", { recorte: boton("Lo monté").locator(".."), marca: boton("No pude") });
  await boton("No pude").click();
  await page.waitForTimeout(600);
  await foto(page, C, "15-motivos", { recorte: [boton("Lo monté"), page.getByText("Otro motivo", { exact: true })], marca: page.getByText("¿Qué pasó?", { exact: true }) });
  await page.getByText("No llegó el producto", { exact: true }).click();
  await nombre().fill("Luis Prueba");
  await page.getByPlaceholder(/Algo que haya que saber/i).first().fill("El producto llega el lunes");
  await foto(page, C, "16-motivo-elegido", { recorte: [boton("Lo monté"), boton("Confirmar")], marca: page.getByText("No llegó el producto", { exact: true }) });
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  await foto(page, C, "17-no-pude-listo", { recorte: page.getByText("Listo, quedó reportado").locator(".."), margen: 24 });
  await guardar(page, "17-no-pude-listo");

  // ── 4. La guía de un planograma ─────────────────────────────────────────
  await ir(DATOS.guia_gon12a.replace(/^https?:\/\/[^/]+/, ""));
  await foto(page, C, "20-guia");
  const pasos = page.locator("section.guia-paso");
  await foto(page, C, "21-que-va-donde", { recorte: pasos.nth(1), marca: pasos.nth(1).locator("h3") });
  await foto(page, C, "22-franjas", { recorte: page.locator(".guia-fichas"), marca: page.locator(".guia-ficha").first() });
  for (const b of await page.locator("button.guia-check").all()) await b.click();
  await foto(page, C, "23-al-terminar", { recorte: pasos.nth(2) });
  const como = page.getByText("¿Cómo quedó?", { exact: true }).locator("..");
  await foto(page, C, "24-como-quedo", { recorte: como, marca: page.getByRole("radio", { name: "Quedó montada" }) });
  await page.getByRole("radio", { name: "Quedó montada" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(900);
  const avisar = page.locator("button.btn-principal");
  await foto(page, C, "25-avisar-montada", { recorte: como, marca: avisar });
  await avisar.click();
  await page.waitForTimeout(1500);
  await foto(page, C, "26-guia-avisada", { recorte: como, marca: page.getByText(/Listo: avisaste/) });
  await guardar(page, "26-guia-avisada");
  await foto(page, C, "27-imprimir", { recorte: como, marca: page.getByRole("button", { name: /Imprimir la hoja/ }) });

  await ir(DATOS.guia_gon12b.replace(/^https?:\/\/[^/]+/, ""));
  await page.getByRole("radio", { name: "No se pudo" }).click();
  await page.waitForTimeout(600);
  await foto(page, C, "28-guia-no-se-pudo", { recorte: page.getByText("¿Cómo quedó?", { exact: true }).locator(".."), marca: page.getByRole("radio", { name: "No se pudo" }) });
  await guardar(page, "28-guia-no-se-pudo");

  // ── 5. Hay que corregir (quien administra dijo «no coincide») ─────────
  await ir(enlaceDeMontaje("CENTRO-PUN-06", DATOS.leases["PUN-06"]));
  const aviso = page.getByText("Hay que corregir el montaje").locator("..");
  await foto(page, C, "40-hay-que-corregir", { recorte: [aviso, page.getByText("Corregir el reporte")], marca: page.getByText("Hay que corregir el montaje") });
  await guardar(page, "40-hay-que-corregir");
  await foto(page, C, "41-corregir-de-nuevo", { recorte: aviso, marca: page.getByText("Corregir y registrar de nuevo") });

  // ── 6. Sin conexión: el reporte queda guardado en el navegador ─────────────
  // Confirma sin conexión, cierra la página y vuelve a abrir el enlace ya con
  // conexión: el reporte guardado espera «Mandar ahora» o «Descartar». (Con la
  // página abierta se manda solo al volver la conexión: lo prueba la app.)
  const enlaceEN2 = enlaceDeMontaje("CENTRO-PUN-03-EN2", DATOS.leases["PUN-03-EN2"]);
  await ir(enlaceEN2);
  await boton("Lo monté").click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await nombre().fill("Luis Prueba");
  await page.waitForTimeout(600);
  await page.context().setOffline(true);
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  const sinSenal = page.getByText(/Sin conexión: tu reporte/).first();
  await foto(page, C, "45-sin-senal", { recorte: [nombre(), page.getByText(/todavía no llegó/).first()], marca: sinSenal });
  await guardar(page, "45-sin-senal");
  const otra = await page.context().newPage();
  otra.setDefaultTimeout(20_000);
  await page.close();
  await otra.context().setOffline(false);
  await otra.goto(enlaceEN2);
  await otra.waitForLoadState("networkidle");
  await otra.waitForTimeout(900);
  const mandar = otra.getByRole("button", { name: "Mandar ahora" });
  const pendiente = otra.getByText("Tenés un reporte sin mandar").locator("..");
  await foto(otra, C, "47-reporte-sin-mandar", { recorte: [pendiente, mandar], margen: 16, marca: mandar });
  await guardar(otra, "47-reporte-sin-mandar");
  await mandar.click();
  await otra.waitForTimeout(1500);
  await foto(otra, C, "46-volvio-la-senal", { recorte: otra.getByText("Listo, quedó reportado").locator(".."), margen: 24 });
  await guardar(otra, "46-volvio-la-senal");

  // ── 7. Un enlace vencido o roto ─────────────────────────────────────────
  await otra.goto("/?montar=CENTRO-PUN-03-EN1&t=enlace.vencido.prueba");
  await otra.waitForLoadState("networkidle");
  await otra.waitForTimeout(800);
  await foto(otra, C, "30-enlace-roto", { recorte: otra.getByText("Este enlace ya no sirve").locator(".."), margen: 40 });
  await guardar(otra, "30-enlace-roto");

  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
