/**
 * Entrar y salir (auditoría P1-19). La pantalla sólo ofrece Google/correo
 * (Firebase), que en la prueba no está configurado: se verifica que la portada
 * abre el ingreso y lo dice, y la sesión se arma por la API como la arma el
 * ingreso. «Cerrar sesión» deja al navegador sin sesión y al token sin efecto.
 */
import { expect, test } from "@playwright/test";
import { conSesion, entrar, gondola, plano, sedeUnica, sesionEnElNavegador } from "./sembrar";

test("la portada abre el ingreso, se entra al Inicio y se sale", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Recabre");
  await page.getByRole("link", { name: "Ya tengo cuenta" }).first().click();
  // Sin Firebase en este servidor: lo dice, en vez de quedar en blanco.
  await expect(page.getByText(/El ingreso no está configurado en este servidor/)).toBeVisible();

  const admin = await entrar(request, "admin");
  const sede = sedeUnica("ENT");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await sesionEnElNavegador(page, admin, sede);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^Hola/ })).toBeVisible();
  await expect(page.locator("main")).toBeVisible();

  await page.getByRole("button", { name: /Galerías/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Recabre");
  // «Salir» de verdad: el token ya no abre nada (P2-2).
  await expect.poll(async () => (await request.get("/api/layout/settings", { headers: conSesion(admin) })).status()).toBe(401);
});
