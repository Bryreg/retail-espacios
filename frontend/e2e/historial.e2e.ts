/**
 * Indicadores › Historial (2026-11-13): los contratos que ya no están vivos,
 * con filtros, «Exportar a Excel» y «Ver todos (N)» desde la ficha. Quien
 * trabaja en la tienda lo ve sin plata (ni en la pantalla ni en la respuesta).
 */
import { expect, test } from "@playwright/test";
import { entrar, gondola, isoDentroDe, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

test("historial: filtros, Excel, la ficha y «Ver todos (N)»", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("HIS");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  // Seis contratos ya terminados en GON-01 (más de los cinco que muestra la
  // ficha) y uno en GON-02; uno vivo en GON-02, que no es historial.
  for (let i = 0; i < 6; i++) {
    await venderEntera(request, admin, sede, `${sede}-GON-01`, {
      proveedor: i === 0 ? "Galletas del Norte" : `Proveedor ${i}`, valor: 1_200_000,
      desde: isoDentroDe(-400 + i * 60), hasta: isoDentroDe(-400 + i * 60 + 29),
    });
  }
  await venderEntera(request, admin, sede, `${sede}-GON-02`, {
    proveedor: "Lácteos del Valle", valor: 900_000, desde: isoDentroDe(-90), hasta: isoDentroDe(-31),
  });
  await venderEntera(request, admin, sede, `${sede}-GON-02`, { proveedor: "Vivo Hoy", valor: 500_000 });
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/indicadores");
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = page.locator("[data-historial]");
  await expect(historial.getByRole("button", { name: "Terminado · 7" })).toBeVisible();
  await expect(historial.locator("tbody tr")).toHaveCount(7);
  await expect(historial).not.toContainText("Vivo Hoy");
  // La plata completa, nunca «M».
  await expect(historial.locator("tbody")).toContainText("$ 900.000");

  // Proveedor, sin tildes.
  await historial.getByLabel("Proveedor o marca").fill("lacteos");
  await expect(historial.locator("tbody tr")).toHaveCount(1);
  await expect(historial.locator("tbody tr")).toContainText("Lácteos del Valle");

  // El Excel baja lo filtrado.
  const [bajada] = await Promise.all([
    page.waitForEvent("download"),
    historial.getByRole("button", { name: "Exportar a Excel" }).click(),
  ]);
  expect(bajada.suggestedFilename()).toMatch(new RegExp(`^historial-contratos-${sede}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));

  // Nada coincide: lo dice, y «Limpiar filtros» vuelve a todo.
  await historial.getByLabel("Proveedor o marca").fill("no existe");
  await expect(page.locator('[data-historial-vacio="filtros"]')).toBeVisible();
  await expect(historial.getByRole("button", { name: "Exportar a Excel" })).toBeDisabled();
  await page.locator('[data-historial-vacio="filtros"]').getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(historial.locator("tbody tr")).toHaveCount(7);

  // El código abre la ficha; «Ver todos (6)» vuelve con esa cara filtrada.
  await historial.locator("tbody").getByRole("button", { name: `${sede}-GON-01` }).first().click();
  await page.locator("[data-ver-todos]").click();
  await expect(page.locator("[data-filtro-cara]")).toContainText(`${sede}-GON-01`);
  await expect(page.locator("[data-historial] tbody tr")).toHaveCount(6);
});

test("historial: quien trabaja en la tienda lo ve sin plata", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("HIW");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, {
    proveedor: "Aseo Total", valor: 7_654_321, desde: isoDentroDe(-90), hasta: isoDentroDe(-31),
  });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);
  const respuestas: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/spaces/historial")) respuestas.push(await r.text());
  });

  await page.goto("/indicadores");
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = page.locator("[data-historial]");
  await expect(historial.locator("tbody tr")).toHaveCount(1);
  await expect(historial).toContainText("Aseo Total");
  await expect(historial).not.toContainText("$");
  await expect(historial.getByRole("columnheader", { name: "Al mes" })).toHaveCount(0);
  expect(respuestas.length).toBeGreaterThan(0);
  for (const cuerpo of respuestas) expect(cuerpo).not.toMatch(/valor_total|valor_al_mes|7654321/);
});
