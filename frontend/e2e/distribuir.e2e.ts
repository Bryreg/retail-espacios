/**
 * Distribuir una cara vendida por participación (auditoría P1-19): desde
 * Pendientes («Falta distribuir» → «Distribuir»), la pieza nace con el % que
 * se vendió, se acomoda sola y «Listo, guardar la cara» deja la distribución
 * CONFIRMADA en la base con lo dibujado igual a lo contratado.
 */
import { expect, test } from "@playwright/test";
import { conSesion, entrar, gondolaPorParticipacion, plano, sedeUnica, sesionEnElNavegador, venderParticipacion } from "./sembrar";

test("distribuir: la cara por participación queda confirmada con su %", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("DIS");
  await plano(request, admin, sede, [gondolaPorParticipacion(sede, "GON-01", 4)]);
  await venderParticipacion(request, admin, sede, `${sede}-GON-01`, { proveedor: "Snacks Ricos", puntosBasicos: 3000, valor: 800_000 });
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/");
  // Con algo para hoy, el primer ingreso del día abre Pendientes solo.
  const bandeja = page.getByRole("dialog", { name: "Pendientes" });
  await expect(bandeja).toBeVisible();
  await bandeja.getByRole("button", { name: "Distribuir" }).click();

  const distribuir = page.locator("[data-distribucion]");
  await expect(distribuir).toBeVisible();
  await expect(distribuir.getByText("30 % de la cara")).toBeVisible();
  await page.locator("[data-listo]").click();

  await expect.poll(async () => {
    const r = await request.get("/api/participaciones/cara", { headers: conSesion(admin), params: { sede, espacio: `${sede}-GON-01` } });
    const cara = await r.json();
    const p = cara.participaciones?.[0];
    return `${cara.distribucion?.estado} ${p?.contratado_pb}/${p?.dibujado_pb}`;
  }).toBe("confirmada 3000/3000");
});
