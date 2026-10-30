/**
 * Los recorridos del contrato (auditoría P1-19): vender, editar y cancelar, de
 * punta a punta por la pantalla, y lo que queda en la BASE (no en el dibujo).
 */
import { expect, test } from "@playwright/test";
import { comercial, entrar, gondola, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

test("vender: un contrato entero desde Contratos queda en la base", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("VEN");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/contratos");
  await page.getByRole("button", { name: /^GON-02·A/ }).first().click();
  await page.getByLabel("Precio total de GON-02·A").fill("2500000");
  await page.getByLabel("Proveedor").fill("Galletas del Norte");
  await page.getByRole("button", { name: "Guardar contrato" }).click();

  // La pantalla dice qué pasa ahora, y la base lo tiene.
  await expect(page.locator("[data-que-pasa-ahora]")).toBeVisible();
  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-02-B`]?.status ?? "libre").toBe("libre");
  const fila = (await comercial(request, admin))[`${sede}-GON-02`];
  expect(fila?.status).toBe("occupied");
  expect(fila?.supplierName).toBe("Galletas del Norte");
  expect(fila?.negotiatedValue).toBe(2_500_000);
});

test("editar: cambiar el «hasta» de un contrato desde su ficha", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("EDI");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Lácteos del Valle", valor: 1_200_000 });
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/indicadores");
  await page.getByRole("button", { name: "Ver ficha" }).first().click();
  await page.locator("[data-editar-contrato]").first().click();
  // El «Hasta» del contrato que se edita (ya arrancó: su «Desde» está
  // bloqueado), no el de otro formulario de Vender que haya en la pantalla:
  // `.last()` dependía del orden del DOM y en algunas máquinas tocaba el otro.
  const hasta = page
    .locator('input[aria-label="Desde"][disabled]')
    .locator('xpath=ancestor::div[contains(@class,"campo")][1]/following-sibling::div[contains(@class,"campo")][1]//input[@aria-label="Hasta"]');
  await expect(hasta).toBeVisible();
  const nuevo = new Date(Date.now() + 200 * 86400_000).toISOString().slice(0, 10);
  await hasta.fill(nuevo);
  await page.getByRole("button", { name: "Guardar cambios y reenviar" }).click();
  // Antes de guardar se dice qué cambia; recién al confirmar se escribe.
  await expect(page.locator("[data-confirmar-edicion]")).toBeVisible();
  await page.getByRole("button", { name: "Guardar y reenviar" }).click();

  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-01`]?.endDate).toBe(nuevo);
});

test("cancelar: «Cancelar el contrato» libera el espacio en la base", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("CAN");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Bebidas del Sur", valor: 900_000 });
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/indicadores");
  await page.getByRole("button", { name: "Ver ficha" }).first().click();
  await page.getByRole("button", { name: "Cancelar el contrato" }).click();
  // Pregunta antes: es un compromiso con un proveedor.
  await expect(page.getByRole("button", { name: "Dejarlo así" })).toBeVisible();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();

  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-01`]?.status ?? "libre").not.toBe("occupied");
});
