/**
 * Arreglos sueltos encontrados al recorrer la app para los manuales
 * (2026-11-20): el buscador le encuentra los espacios también a quien trabaja
 * en la tienda —y le abre la ficha, sin plata ni acciones de venta—, y su
 * campo no pierde lo que se teclea mientras baja.
 */
import { expect, test } from "@playwright/test";
import { entrar, gondola, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

const VALOR = 4_321_987;
const montos = /\$\s?\d|\d{1,3}(\.\d{3}){2,}|4[.\s]?321[.\s]?987/;

test("worker: el buscador encuentra el espacio y abre su ficha, sin plata ni «Renovar»", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("BUS");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: VALOR });

  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);
  // Que Pendientes no se abra sola encima del Inicio.
  await page.addInitScript(() => localStorage.setItem("recabra-pendientes-del-dia", new Date().toISOString().slice(0, 10)));
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("Control+k");
  const campo = page.getByRole("combobox", { name: "Buscar" });
  await campo.fill("GON-01");
  const fila = page.getByRole("option", { name: /^GON-01 / });
  await expect(fila).toBeVisible();
  // Lo que el trabajador puede hacer: leer la ficha. Ni renovar ni vender.
  await expect(fila).toContainText("Ver la ficha");
  await expect(page.locator(".buscador-lista")).not.toContainText(/Renovar contrato|Nuevo contrato/);
  await expect(page.locator(".buscador-lista")).not.toContainText("No encontré nada");

  await campo.press("Enter");
  await expect(page).toHaveURL(/\/indicadores$/);
  const ficha = page.locator("[data-ficha-al-lado], .ficha-en-cajon").first();
  await expect(ficha).toBeVisible();
  await expect(ficha).toContainText("GON-01");
  await expect(ficha).toContainText("Aseo Total");
  const texto = await ficha.innerText();
  expect(texto, "la ficha del trabajador muestra plata").not.toMatch(montos);
  await expect(ficha.getByRole("button", { name: /Renovar|Editar contrato|Negociar|Nuevo contrato/ })).toHaveCount(0);
});

test("admin: el buscador sigue llevando a vender el espacio", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("BUA");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await sesionEnElNavegador(page, admin, sede);
  await page.addInitScript(() => localStorage.setItem("recabra-pendientes-del-dia", new Date().toISOString().slice(0, 10)));
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Buscar" }).fill("GON-01");
  const fila = page.getByRole("option", { name: /^GON-01 / });
  await expect(fila).toContainText("Nuevo contrato");
  await fila.click();
  await expect(page).toHaveURL(/\/contratos$/);
});

test("buscador: lo tecleado apenas se abre con el mouse no se pierde", async ({ page, request }) => {
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker);
  await page.addInitScript(() => localStorage.setItem("recabra-pendientes-del-dia", new Date().toISOString().slice(0, 10)));
  // El buscador baja a pedido: que tarde, como en una conexión lenta.
  await page.route(/\/assets\/Buscador-[^/]*\.js$/, async (r) => {
    await new Promise((listo) => setTimeout(listo, 1200));
    await r.continue();
  });
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.locator("[data-abrir-buscador]").click();
  await page.keyboard.type("reno");
  const campo = page.getByRole("combobox", { name: "Buscar" });
  await expect(campo).toHaveValue("reno");
  await expect(campo).toBeFocused();
  // Y se sigue escribiendo en el campo.
  await page.keyboard.type("var");
  await expect(campo).toHaveValue("renovar");
});
