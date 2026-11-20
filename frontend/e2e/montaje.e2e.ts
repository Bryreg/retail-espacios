/**
 * Montar por el enlace del correo (auditoría P1-19): quien monta no tiene
 * cuenta; abre el enlace firmado, ve SU espacio (sin plata), saca la foto y
 * confirma. El reporte queda en la base y la administración lo ve en Montajes.
 */
import { expect, test } from "@playwright/test";
import { conSesion, enlaceDeMontaje, entrar, gondola, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

test("montar por enlace: con foto, sin sesión y sin plata a la vista", async ({ browser, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("MON");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  const venta = await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Lácteos del Valle", valor: 1_234_567 });
  const leaseId: number = venta.contratos[0].lease_id;

  // Un navegador limpio, sin sesión: como el teléfono de quien monta.
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-CO" });
  const page = await contexto.newPage();
  await page.goto(enlaceDeMontaje(`${sede}-GON-01`, admin.cliente, leaseId));

  // El token sale de la barra de direcciones apenas se lee.
  await expect(page).toHaveURL(/montaje=1/);
  expect(page.url()).not.toContain("t=");
  await expect(page.getByText("Lácteos del Valle").first()).toBeVisible();
  // Nunca la plata del contrato.
  const texto = await page.locator("body").innerText();
  expect(texto).not.toMatch(/1[.\s]?234[.\s]?567|\$\s?\d/);

  await page.getByRole("button", { name: "Lo monté" }).click();
  // La foto es obligatoria: sin ella, lo dice.
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(/Falta la foto/)).toBeVisible();

  // Una foto de verdad (un JPEG que el navegador pueda decodificar).
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 48;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2f855a"; g.fillRect(0, 0, 64, 48);
    g.fillStyle = "#f6e05e"; g.fillRect(8, 8, 24, 24);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "montaje.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64"),
  });
  await page.getByPlaceholder("Quién reporta").fill("Mercaderista de prueba");
  await page.getByRole("button", { name: "Confirmar" }).click();

  // La base tiene el reporte, con su contrato.
  await expect.poll(async () => {
    const r = await request.get("/api/mounts/", { headers: conSesion(admin) });
    const filas: { space_code: string; estado: string }[] = await r.json();
    return filas.find((m) => m.space_code === `${sede}-GON-01`)?.estado ?? null;
  }, { timeout: 20_000 }).toBe("montado");
  await contexto.close();
});

test("registrar montaje desde Montajes (con cuenta): abre el formulario y guarda", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("REG");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  await page.goto("/montajes");
  // Antes (2026-11-20) esto rompía la pantalla: un hook después del `return`
  // del formulario («Montajes no se pudo mostrar»).
  await page.getByRole("button", { name: "Registrar montaje" }).first().click();
  await expect(page.getByText("Montajes no se pudo mostrar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lo monté" })).toBeVisible();

  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 48;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2f855a"; g.fillRect(0, 0, 64, 48);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  await page.getByRole("button", { name: "Lo monté" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "montaje.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64"),
  });
  await page.getByPlaceholder("Quién reporta").fill("Trabajador de prueba");
  await page.getByRole("button", { name: "Confirmar" }).click();
  // De vuelta en la lista, el «Listo» con el espacio (antes, ninguna señal).
  await expect(page.getByRole("status").filter({ hasText: "Listo:" })).toHaveText(/Listo: GON-01 quedó reportado como montado\./);
  await expect.poll(async () => {
    const r = await request.get("/api/mounts/", { headers: conSesion(admin) });
    const filas: { space_code: string; estado: string }[] = await r.json();
    return filas.find((m) => m.space_code === `${sede}-GON-01`)?.estado ?? null;
  }, { timeout: 20_000 }).toBe("montado");
});
