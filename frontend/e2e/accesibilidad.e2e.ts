/**
 * Accesibilidad con axe-core (auditoría P2-21): CERO violaciones serias o
 * críticas en las pantallas principales, en claro y en oscuro. Las moderadas y
 * menores se anotan en el informe del recorrido, sin frenar (para verlas).
 *
 * Si una pantalla nueva o un cambio mete una seria (contraste, un control sin
 * nombre, interactivos anidados…), esto falla en el PR con el selector.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { entrar, gondola, gondolaPorParticipacion, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

async function revisar(page: Page, donde: string) {
  const r = await new AxeBuilder({ page }).analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const leves = r.violations.filter((v) => !graves.includes(v));
  if (leves.length) {
    test.info().annotations.push({
      type: `axe leves · ${donde}`,
      description: leves.map((v) => `${v.impact} ${v.id} (${v.nodes.length})`).join(", "),
    });
  }
  const detalle = graves.map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(detalle, `${donde}: violaciones serias o críticas de axe`).toEqual([]);
}

for (const tema of ["claro", "oscuro"] as const) {
  test(`axe · portada, política e ingreso (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema === "oscuro" ? "dark" : "light" });
    for (const ruta of ["/", "/politica-datos", "/login"]) {
      await page.goto(ruta);
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await revisar(page, `${ruta} (${tema})`);
    }
  });

  test(`axe · pantallas de adentro (${tema})`, async ({ page, request }) => {
    const admin = await entrar(request, "admin");
    const sede = sedeUnica("AXE");
    await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7), gondolaPorParticipacion(sede, "GON-03", 11)]);
    await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Lácteos del Valle", valor: 1_200_000 });
    await sesionEnElNavegador(page, admin, sede);
    // El tema del interior se elige en la app (no sigue al sistema).
    if (tema === "oscuro") await page.addInitScript(() => localStorage.setItem("recabra-tema", "oscuro"));
    // Que Pendientes no se abra sola encima del Inicio (se revisa aparte).
    await page.addInitScript(() => localStorage.setItem("recabra-pendientes-del-dia", new Date().toISOString().slice(0, 10)));

    for (const ruta of ["/", "/contratos", "/indicadores", "/plano", "/plano/caras", "/montajes"]) {
      await page.goto(ruta);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await revisar(page, `${ruta} (${tema})`);
    }
    // Pendientes abierta, encima del Inicio.
    await page.goto("/");
    await page.getByRole("button", { name: /^Pendientes/ }).click();
    await expect(page.getByRole("dialog", { name: "Pendientes" })).toBeVisible();
    await revisar(page, `Pendientes (${tema})`);
  });
}
