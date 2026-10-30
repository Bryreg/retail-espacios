/**
 * La red de seguridad (auditoría P1-19, P2-15, P2-19): lo que ve la persona
 * cuando algo falla, forzado de verdad en el navegador.
 */
import { expect, test } from "@playwright/test";
import { entrar, gondola, plano, sedeUnica, sesionEnElNavegador } from "./sembrar";

async function conSede(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, prefijo: string) {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica(prefijo);
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await sesionEnElNavegador(page, admin, sede);
  return { admin, sede };
}

test("un pedazo que ya no está (versión nueva): recarga UNA vez y después muestra «Recargar»", async ({ page, request }) => {
  await conSede(page, request, "VER");
  let cargas = 0;
  page.on("load", () => { cargas += 1; });
  // La pantalla del Inicio no baja: como una pestaña abierta antes de un deploy.
  await page.route(/\/assets\/DashboardView-[^/]+\.js$/, (r) => r.abort());
  await page.goto("/");

  const aviso = page.locator('[data-error-de-app="modulo"]');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("versión nueva");
  // Recargó sola una vez (la marca en sessionStorage evita el bucle).
  expect(cargas).toBe(2);
  // El armazón sigue en pie: el menú y la barra.
  await expect(page.getByRole("link", { name: "Montajes" }).first()).toBeVisible();

  // Con la versión de hoy disponible, «Recargar» vuelve a andar.
  await page.unroute(/\/assets\/DashboardView-[^/]+\.js$/);
  await aviso.getByRole("button", { name: "Recargar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hola/ })).toBeVisible();
});

test("un error de la app entera muestra la pantalla de recuperación, no una pestaña en blanco", async ({ page, request }) => {
  await conSede(page, request, "APP");
  // Sin el armazón del tablero: lo ataja el límite de la app (`main.tsx`).
  await page.route(/\/assets\/Dashboard-[^/]+\.js$/, (r) => r.abort());
  await page.goto("/");
  const pantalla = page.locator('[data-error-de-app="app"]');
  await expect(pantalla).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(pantalla.getByRole("button", { name: "Recargar" })).toBeVisible();
  await expect(pantalla.getByRole("link", { name: "Ir al comienzo" })).toBeVisible();
});

test("una lista que no se pudo leer lo dice, con «Reintentar» (no «no hay nada»)", async ({ page, request }) => {
  await conSede(page, request, "LEE");
  const reportes = /\/api\/mounts\/?(\?.*)?$/;
  await page.route(reportes, (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.goto("/montajes");
  const aviso = page.locator("main [data-sin-leer]");
  await expect(aviso).toContainText("No se pudo leer los reportes de montaje");
  await page.unroute(reportes);
  await aviso.getByRole("button", { name: "Reintentar" }).click();
  await expect(aviso).toBeHidden();
});

test("las tarifas que no se pudieron leer dicen «Reintentar» en vez de «Cargando…» para siempre", async ({ page, request }) => {
  await conSede(page, request, "TAR");
  const tarifas = /\/api\/layout\/rates$/;
  await page.route(tarifas, (r) => (r.request().method() === "GET" ? r.fulfill({ status: 503, body: "{}" }) : r.continue()));
  await page.goto("/contratos");
  await page.getByRole("button", { name: "Tarifas" }).first().click();
  const aviso = page.locator("[data-tarifas-sin-leer]");
  await expect(aviso).toBeVisible();
  await page.unroute(tarifas);
  await aviso.getByRole("button", { name: "Reintentar" }).click();
  await expect(aviso).toBeHidden();
  // La tabla para editar, con la columna general.
  await expect(page.locator("table").filter({ hasText: /general/i }).first()).toBeVisible();
});

test("sin WebGL, el 3D dice la causa y lleva al 2D", async ({ page, request }) => {
  await conSede(page, request, "WGL");
  await page.addInitScript(() => {
    // Se pisa a propósito, sólo para los contextos WebGL; los demás pasan.
    const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...a: unknown[]) => unknown;
    (HTMLCanvasElement.prototype as unknown as { getContext: (...a: unknown[]) => unknown }).getContext =
      function (this: HTMLCanvasElement, tipo: unknown, ...resto: unknown[]) {
        if (/webgl/i.test(String(tipo))) return null;
        return original.call(this, tipo, ...resto);
      };
  });
  await page.goto("/plano/3d");
  const aviso = page.locator('[data-sin-lienzo="sin_webgl"]');
  await expect(aviso).toContainText("Este navegador no puede mostrar el 3D");
  await aviso.getByRole("button", { name: "Abrir el plano 2D" }).click();
  await expect(page).toHaveURL(/\/plano$/);
});
