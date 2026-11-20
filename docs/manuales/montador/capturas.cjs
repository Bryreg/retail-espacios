/**
 * Capturas del manual de QUIEN MONTA (sin cuenta: entra por el enlace del
 * correo, en el celular). Corre contra la copia de prueba recién sembrada
 * (`herramientas/levantar.sh`): registra montajes de verdad, así que se corre
 * una sola vez por siembra.
 *
 *   MANUAL_TMP=<carpeta de levantar.sh> node docs/manuales/montador/capturas.cjs
 */
const { lanzar, abrir, DATOS, correoReal, enlaceDeMontaje, foto } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "montador";
const FOTO = path.join(__dirname, "..", "herramientas", "foto-de-prueba.jpg");
const texto = async (page) => (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");

(async () => {
  const nav = await lanzar();
  const { page } = await abrir(nav, null, { celular: true });
  const boton = (n) => page.getByRole("button", { name: n, exact: true });

  // ── 1. El correo y el enlace ────────────────────────────────────────────
  await page.goto(correoReal("por montar", "PUN-03-EN1"));
  await foto(page, C, "01-correo", { marca: page.getByRole("link", { name: "Ver dónde queda y confirmar" }) });
  await page.getByRole("link", { name: "Ver dónde queda y confirmar" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await foto(page, C, "02-espacio");
  const tarjeta = page.getByText("Entrepaño 1 de", { exact: false }).locator("..");
  await foto(page, C, "03-tarjeta", { recorte: tarjeta, margen: 24, marca: page.getByText("Entrepaño 1 de", { exact: false }) });
  await foto(page, C, "04-asi-debe-quedar", { marca: page.getByText("Tocá para verla en grande") });
  await page.getByText("Tocá para verla en grande").click();
  await page.waitForTimeout(700);
  await foto(page, C, "05-planometria-grande");
  await page.keyboard.press("Escape");
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);
  const donde = page.locator('a:has-text("Tocá para verla en grande") + div');
  await donde.scrollIntoViewIfNeeded();
  await foto(page, C, "06-donde-queda", { marca: donde });

  // ── 2. Lo monté (con foto) ──────────────────────────────────────────────
  await foto(page, C, "07-lo-monte", { marca: boton("Lo monté") });
  await boton("Lo monté").click();
  await page.waitForTimeout(600);
  await foto(page, C, "08-formulario", { marca: page.getByText("Tomar foto", { exact: true }) });
  // Sin foto: lo dice.
  await boton("Confirmar").click();
  await page.waitForTimeout(500);
  const aviso = page.getByText(/Falta la foto/).first();
  await foto(page, C, "09-falta-la-foto", { marca: aviso });
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(800);
  await page.getByPlaceholder(/nombre|Quién reporta/i).first().fill("Luis Prueba");
  await foto(page, C, "10-con-foto-y-nombre", { marca: page.getByPlaceholder(/nombre|Quién reporta/i).first() });
  await foto(page, C, "11-confirmar", { marca: boton("Confirmar") });
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  await foto(page, C, "12-listo");
  fs.writeFileSync(path.join(__dirname, "textos-12-listo.txt"), await texto(page));
  const corregir = page.getByText("Corregir lo que acabo de reportar");
  await foto(page, C, "12b-corregir", { marca: corregir });
  await corregir.click();
  await page.waitForTimeout(700);
  await foto(page, C, "12c-corregir-formulario");
  fs.writeFileSync(path.join(__dirname, "textos-12c-corregir.txt"), await texto(page));

  // ── 3. No pude ──────────────────────────────────────────────────────────
  await page.goto(enlaceDeMontaje("CENTRO-GON-02-PC1", DATOS.leases["GON-02-PC1"]));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await foto(page, C, "13-otro-espacio");
  fs.writeFileSync(path.join(__dirname, "textos-13-otro-espacio.txt"), await texto(page));
  await foto(page, C, "14-no-pude", { marca: boton("No pude") });
  await boton("No pude").click();
  await page.waitForTimeout(600);
  await foto(page, C, "15-motivos", { marca: page.getByText("¿Qué pasó?", { exact: true }) });
  await page.getByText("No llegó el producto", { exact: true }).click();
  await page.getByPlaceholder(/nombre|Quién reporta/i).first().fill("Luis Prueba");
  const nota = page.getByPlaceholder(/nota/i).first();
  if (await nota.count()) await nota.fill("El producto llega el lunes");
  await foto(page, C, "16-motivo-elegido", { marca: page.getByText("No llegó el producto", { exact: true }) });
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  await foto(page, C, "17-no-pude-listo");
  fs.writeFileSync(path.join(__dirname, "textos-17-no-pude-listo.txt"), await texto(page));

  // ── 4. La guía de un planograma ─────────────────────────────────────────
  await page.goto(DATOS.guia_gon12a.replace(/^https?:\/\/[^/]+/, ""));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await foto(page, C, "20-guia");
  const pasos = page.locator("section.guia-paso");
  await pasos.nth(1).scrollIntoViewIfNeeded();
  await foto(page, C, "21-que-va-donde", { recorte: pasos.nth(1), marca: pasos.nth(1).locator("h3") });
  await page.locator(".guia-ficha").first().scrollIntoViewIfNeeded();
  await foto(page, C, "22-franjas", { recorte: page.locator(".guia-fichas"), marca: page.locator(".guia-ficha").first() });
  await pasos.nth(2).scrollIntoViewIfNeeded();
  for (const b of await page.locator("button.guia-check").all()) await b.click();
  await foto(page, C, "23-al-terminar", { recorte: pasos.nth(2) });
  const como = page.getByText("¿Cómo quedó?", { exact: true }).locator("..");
  await como.scrollIntoViewIfNeeded();
  await foto(page, C, "24-como-quedo", { marca: page.getByRole("radio", { name: "Quedó montada" }) });
  await page.getByRole("radio", { name: "Quedó montada" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.waitForTimeout(900);
  const avisar = page.locator("button.btn-principal");
  await foto(page, C, "25-avisar-montada", { marca: avisar });
  fs.writeFileSync(path.join(__dirname, "textos-25-antes-de-avisar.txt"), await texto(page));
  await avisar.click();
  await page.waitForTimeout(1500);
  const avisado = page.getByText(/Listo: avisaste/).locator("..");
  await avisado.scrollIntoViewIfNeeded();
  await foto(page, C, "26-guia-avisada", { marca: page.getByText(/Listo: avisaste/) });
  fs.writeFileSync(path.join(__dirname, "textos-26-guia-avisada.txt"), await texto(page));
  const imprimir = page.getByRole("button", { name: /Imprimir la hoja/ });
  if (await imprimir.count()) await foto(page, C, "27-imprimir", { marca: imprimir });

  // La otra cara: «No se pudo».
  await page.goto(DATOS.guia_gon12b.replace(/^https?:\/\/[^/]+/, ""));
  await page.waitForLoadState("networkidle");
  await page.getByText("¿Cómo quedó?", { exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("radio", { name: "No se pudo" }).click();
  await page.waitForTimeout(600);
  await foto(page, C, "28-guia-no-se-pudo", { marca: page.getByRole("radio", { name: "No se pudo" }) });
  fs.writeFileSync(path.join(__dirname, "textos-28-guia-no-se-pudo.txt"), await texto(page));

  // ── 5. Hay que corregir (quien administra dijo «no coincide») ─────────
  await page.goto(enlaceDeMontaje("CENTRO-PUN-06", DATOS.leases["PUN-06"]));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await foto(page, C, "40-hay-que-corregir", { marca: page.getByText("Hay que corregir el montaje") });
  fs.writeFileSync(path.join(__dirname, "textos-40-hay-que-corregir.txt"), await texto(page));
  await page.getByText("Corregir y registrar de nuevo").click();
  await page.waitForTimeout(700);
  await foto(page, C, "41-corregir-de-nuevo");

  // ── 6. Sin señal: el reporte queda guardado en el teléfono ──────────────
  await page.goto(enlaceDeMontaje("CENTRO-PUN-03-EN2", DATOS.leases["PUN-03-EN2"]));
  await page.waitForLoadState("networkidle");
  await boton("Lo monté").click();
  await page.locator('input[type="file"]').first().setInputFiles(FOTO);
  await page.getByPlaceholder(/nombre|Quién reporta/i).first().fill("Luis Prueba");
  await page.waitForTimeout(600);
  const contexto = page.context();
  await contexto.setOffline(true);
  await boton("Confirmar").click();
  await page.waitForTimeout(1500);
  const sinSenal = page.getByText(/Sin señal/).first();
  await foto(page, C, "45-sin-senal", { marca: sinSenal });
  fs.writeFileSync(path.join(__dirname, "textos-45-sin-senal.txt"), await texto(page));
  await contexto.setOffline(false);
  await page.waitForTimeout(6000);
  await foto(page, C, "46-volvio-la-senal");
  fs.writeFileSync(path.join(__dirname, "textos-46-volvio-la-senal.txt"), await texto(page));

  // ── 7. Un enlace vencido o roto ─────────────────────────────────────────
  await page.goto("/?montar=CENTRO-PUN-03-EN1&t=enlace.vencido.prueba");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await foto(page, C, "30-enlace-roto");
  fs.writeFileSync(path.join(__dirname, "textos-30-enlace-roto.txt"), await texto(page));

  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
