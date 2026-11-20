/**
 * Pendientes, el Plano de la sede y lo que ve el trabajador, encontrados al
 * recorrer la app como administrador para los manuales (2026-11-20):
 *
 *  · «Montaje sin reporte» ofrece «Ir a Montajes», que abre Montajes con ese
 *    espacio marcado (sólo ofrecía «Editar contrato»).
 *  · Pendientes, abierta desde el Plano, dice de dónde se vino y al cerrarla
 *    vuelve al Plano (dejaba el Inicio atrás).
 *  · La búsqueda del plano encuentra al proveedor de una participación.
 *  · La ficha del trabajador no ofrece «Ver la exhibición en 3D» (no abre el 3D).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  entrar, gondola, gondolaPorParticipacion, isoDentroDe, plano, sedeUnica, sesionEnElNavegador, venderEntera, venderParticipacion,
} from "./sembrar";

/** Que Pendientes no se abra sola encima del Inicio. */
const sinPendientesDelDia = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("recabra-pendientes-del-dia", new Date().toISOString().slice(0, 10)));

test("«Montaje sin reporte» lleva a Montajes con ese espacio marcado", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("MSR");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  // Arrancó hace más de 30 días y nadie reportó el montaje.
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000, desde: isoDentroDe(-45), hasta: isoDentroDe(60) });
  await sesionEnElNavegador(page, admin, sede);
  await sinPendientesDelDia(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.locator(".btn-pendientes").click();
  await page.getByRole("button", { name: /^Corregir/ }).click();
  const fila = page.locator('[data-aviso^="mv-"]').first();
  await expect(fila).toContainText("GON-01");
  await fila.getByRole("button", { name: "Ir a Montajes" }).click();
  await expect(page).toHaveURL(/\/montajes$/);
  const marcada = page.locator(".mj-fila[data-resaltada]");
  await expect(marcada).toHaveCount(1);
  // Lo que se hace con él está en su fila (registrarlo o, sin planometría, adjuntarla).
  await expect(marcada).toContainText("GON-01");
  await expect(marcada).toContainText("Sin montar");
  await expect(marcada).toBeInViewport();
});

test("Pendientes abierta desde el Plano: dice de dónde se vino y al cerrarla vuelve al Plano", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("PDP");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await sesionEnElNavegador(page, admin, sede);
  await sinPendientesDelDia(page);
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");

  await page.locator(".btn-pendientes").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".btn-pendientes")).toHaveAttribute("aria-expanded", "true");
  const barra = page.locator("[data-volver-pendientes]");
  await expect(barra).toContainText("Viniste desde Plano de la sede");
  // Cerrar la bandeja (su ✕) vuelve al Plano.
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page).toHaveURL(/\/plano$/);
  await expect(barra).toHaveCount(0);

  // Y «Volver a Plano de la sede» de la barra, también.
  await page.locator(".btn-pendientes").click();
  await expect(page).toHaveURL(/\/$/);
  await barra.getByRole("button", { name: /Volver a Plano de la sede/ }).click();
  await expect(page).toHaveURL(/\/plano$/);
  await expect(page.locator(".btn-pendientes")).toHaveAttribute("aria-expanded", "false");

  // Abierta desde el Inicio, cerrarla no lleva a ningún lado.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator(".btn-pendientes").click();
  await expect(barra).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("la búsqueda del plano encuentra al proveedor de una participación", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("BPL");
  await plano(request, admin, sede, [gondolaPorParticipacion(sede, "GON-03", 3), gondola(sede, "GON-04", 7)]);
  await venderParticipacion(request, admin, sede, `${sede}-GON-03-B`, { proveedor: "Café Montaña", puntosBasicos: 2_500, valor: 300_000 });
  await sesionEnElNavegador(page, admin, sede);
  await sinPendientesDelDia(page);
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");

  const buscar = page.getByRole("textbox", { name: "Buscar espacio, categoría o proveedor" });
  // El contador de la búsqueda, exacto: la barra de arriba dice «N de M ·
  // 2 muebles» (las sedes) y una expresión suelta como /0 de 2/ también calza
  // en «10 de 20» cuando el CI ya creó muchas sedes.
  const cuenta = page.getByText(/^\d+ de 2$/);
  await buscar.fill("Montaña");
  await expect(cuenta).toHaveText("1 de 2");
  await buscar.fill("Nadie Así");
  await expect(cuenta).toHaveText("0 de 2");
});

test("la ficha del trabajador no ofrece «Ver la exhibición en 3D» (él no abre el 3D)", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("V3D");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });

  await sesionEnElNavegador(page, await entrar(request, "worker"), sede);
  await sinPendientesDelDia(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  const campo = page.getByRole("combobox", { name: "Buscar" });
  await campo.fill("GON-01");
  await expect(page.getByRole("option", { name: /^GON-01 / })).toBeVisible();
  await campo.press("Enter");
  const ficha = page.locator("[data-ficha-al-lado], .ficha-en-cajon").first();
  await expect(ficha).toContainText("Aseo Total");
  await expect(ficha.getByRole("button", { name: "Ver la exhibición en 3D" })).toHaveCount(0);
});
