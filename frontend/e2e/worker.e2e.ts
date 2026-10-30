/**
 * Quien trabaja en la tienda (rol `worker`) nunca ve plata (regla dura): ni en
 * la pantalla ni en lo que le contesta el servidor (auditoría P1-19).
 */
import { expect, test } from "@playwright/test";
import { entrar, gondola, plano, sedeUnica, sesionEnElNavegador, venderEntera } from "./sembrar";

const VALOR = 7_654_321;

test("worker: Inicio, Indicadores y Montajes sin un solo monto", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("WRK");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: VALOR });

  const worker = await entrar(request, "worker");
  expect(worker.role).toBe("worker");
  await sesionEnElNavegador(page, worker, sede);

  // Todo lo que contesta /api mientras recorre: ningún valor de contrato.
  const respuestas: string[] = [];
  page.on("response", async (r) => {
    if (!r.url().includes("/api/") || !(r.headers()["content-type"] ?? "").includes("json")) return;
    try { respuestas.push(await r.text()); } catch { /* una que se cortó al navegar */ }
  });

  const montos = /\$\s?\d|\d{1,3}(\.\d{3}){2,}|7[.\s]?654[.\s]?321/;
  for (const ruta of ["/", "/indicadores", "/montajes"]) {
    await page.goto(ruta);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const texto = await page.locator("body").innerText();
    expect(texto, `${ruta} muestra plata`).not.toMatch(montos);
  }
  // Contratos (Vender) no es de este rol: vuelve al Inicio.
  await page.goto("/contratos");
  await expect(page).toHaveURL(/\/$/);

  expect(respuestas.length).toBeGreaterThan(3);
  for (const cuerpo of respuestas) {
    expect(cuerpo).not.toContain(String(VALOR));
    // El servidor lo redacta a 0 (o lo saca): nunca un valor de verdad.
    expect(cuerpo).not.toMatch(/"(negotiatedValue|monthly_rent|valor|valor_mensual)"\s*:\s*[1-9]/);
  }
});
