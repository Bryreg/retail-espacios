/**
 * Inicio, Indicadores y la ficha del espacio, como los recorre quien trabaja
 * en la tienda (lo que se encontró al hacer los manuales, 2026-11-20):
 *
 *  · «Montajes por resolver» del Inicio es la cuenta de Montajes (Sin montar
 *    que ya empezó + No realizado), con lo viejo sin reporte y con las
 *    participaciones que Montajes le muestra.
 *  · El chip «Sin montar» de Contratos cuenta las filas que dicen «Sin montar».
 *  · Capacidad por vender nombra a los clientes de las participaciones.
 *  · La ficha de una punta vendida por entrepaños lo dice arriba.
 *  · Historial: el código corto y «Duró» de lo cancelado.
 *  · Al trabajador, botones que dicen lo que pasan y ningún consejo de negociación;
 *    para administración, lo de siempre.
 */
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { meses, textoDeMeses } from "../src/utils/meses";
import {
  conSesion, entrar, gondola, gondolaPorParticipacion, isoDentroDe, plano, sedeUnica, sesionEnElNavegador,
  venderEntera, venderParticipacion, type Mueble, type Sesion,
} from "./sembrar";

const punta = (sede: string, code: string, cx: number): Mueble => ({
  id: `f-${sede}-${code}`, code, sede, type: "punta", label: `Punta ${code}`,
  cx, cz: 8, rotY: 0, w: 1.6, d: 1.0, h: 1.8, color: "#818cf8", entrepanos: 4, partes: { division: "entrepanos" },
});

async function reportarNoMontado(api: APIRequestContext, s: Sesion, codigo: string) {
  const r = await api.post("/api/montaje/reportar", {
    headers: conSesion(s),
    multipart: { estado: "no_montado", space_code: codigo, motivo: "sin_material", reportado_por: "Prueba", nota: "No llegó el material" },
  });
  expect(r.status(), await r.text()).toBe(201);
}

async function cancelar(api: APIRequestContext, s: Sesion, codigo: string, contrato: { contratos: { lease_id: number }[] }) {
  const esp = await (await api.get(`/api/spaces/by-code/${encodeURIComponent(codigo)}`, { headers: conSesion(s) })).json();
  const r = await api.delete(`/api/spaces/${esp.id}/leases/${contrato.contratos[0].lease_id}`, { headers: conSesion(s) });
  expect(r.status(), await r.text()).toBe(204);
}

test("Inicio, Indicadores y la ficha: las cuentas de montaje, los clientes, la punta por entrepaños y el historial", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("IND");
  await plano(request, admin, sede, [punta(sede, "PUN-02", 2), gondolaPorParticipacion(sede, "GON-01", 6), gondola(sede, "GON-02", 10), punta(sede, "PUN-08", 14)]);
  // Sin montar: un entrepaño de hace 60 días (fuera de la ventana de 30 de
  // Pendientes), otro de hace 5 y una participación de hace 40.
  await venderEntera(request, admin, sede, `${sede}-PUN-02-EN1`, { proveedor: "Snacks Norte", valor: 300_000, desde: isoDentroDe(-60), hasta: isoDentroDe(120) });
  await venderEntera(request, admin, sede, `${sede}-PUN-02-EN2`, { proveedor: "Café Montaña", valor: 300_000, desde: isoDentroDe(-5), hasta: isoDentroDe(120) });
  await venderParticipacion(request, admin, sede, `${sede}-GON-01`, { proveedor: "Lácteos Andinos", puntosBasicos: 5000, valor: 600_000, desde: isoDentroDe(-40), hasta: isoDentroDe(120) });
  // No realizado, y vence en 10 días.
  await venderEntera(request, admin, sede, `${sede}-GON-02`, { proveedor: "Aseo Total", valor: 900_000, desde: isoDentroDe(-50), hasta: isoDentroDe(10) });
  await reportarNoMontado(request, admin, `${sede}-GON-02`);
  // Historial: uno cancelado antes de empezar y otro que corrió y se canceló hoy.
  const futuro = await venderEntera(request, admin, sede, `${sede}-PUN-08`, { proveedor: "Limpio Hogar", valor: 1_800_000, desde: isoDentroDe(40), hasta: isoDentroDe(130) });
  await cancelar(request, admin, `${sede}-PUN-08`, futuro);
  const corrio = await venderEntera(request, admin, sede, `${sede}-GON-02-B`, { proveedor: "Bebidas del Valle", valor: 1_800_000, desde: isoDentroDe(-62), hasta: isoDentroDe(120) });
  await cancelar(request, admin, `${sede}-GON-02-B`, corrio);

  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  // ── Montajes: lo que lista, y el Inicio cuenta lo mismo.
  await page.goto("/montajes");
  const sinMontar = page.locator('[data-filtro="sin_montar"]');
  await expect(sinMontar).toContainText("3");
  await expect(page.locator('[data-filtro="no_realizado"]')).toContainText("1");
  await page.goto("/");
  const tarjeta = page.locator('[data-cifra-inicio="Montajes por resolver"]');
  await expect(tarjeta.locator(".valor")).toHaveText("4");
  await expect(tarjeta).toContainText("3 sin montar · 1 no realizado");
  // Por vencer: el trabajador no «actúa», avisa.
  const vence = page.locator('[data-cifra-inicio="Por vencer (30 días)"]');
  await expect(vence).toContainText("Avisale a quien administra");
  await expect(vence).not.toContainText("Requieren acción");
  await expect(page.getByRole("button", { name: /^Ver los 1$/ })).toHaveCount(0);

  // ── Contratos: el chip cuenta sus filas.
  await page.goto("/indicadores");
  await page.getByRole("tab", { name: "Contratos" }).click();
  const filasSinMontar = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Sin montar", exact: true }) });
  await expect(filasSinMontar).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Sin montar\s*2$/ })).toBeVisible();

  // ── Mapa: sin tareas de administración.
  await page.getByRole("tab", { name: "Mapa de oportunidades" }).click();
  const mapa = page.locator("[data-mapa-de-oportunidades]");
  await expect(mapa).toContainText("Caras con montaje pendiente");
  await expect(mapa.getByRole("button", { name: /Ver el plano/ })).toBeVisible();
  for (const t of ["Plano para contratar", "Gestionar renovación", "Ver detalle", "Mandar la guía", "Ver los 1 "]) await expect(mapa).not.toContainText(t);
  await expect(mapa.getByRole("button", { name: "Ver la ficha" }).first()).toBeVisible();

  // ── Análisis: los clientes de la participación, sin consejos.
  await page.getByRole("tab", { name: "Análisis" }).click();
  const analisis = page.locator("[data-analisis]");
  const gon01 = analisis.locator("table.an-cap tr").filter({ hasText: "GON-01·A" });
  await expect(gon01).toContainText("Lácteos Andinos");
  await expect(gon01).not.toContainText("Sin contrato hoy.");
  for (const t of ["negociación", "Ofrecer", "Gestionar renovaciones", "Ver las 1", "Ver los 1 "]) await expect(analisis).not.toContainText(t);
  await expect(analisis.getByRole("button", { name: "Renovar" })).toHaveCount(0);

  // ── La ficha de la punta: vendida en parte, arriba.
  await page.getByRole("tab", { name: "Contratos" }).click();
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "PUN-02", exact: true }) }).first().click();
  const enParte = page.locator("[data-vendido-en-parte]");
  await expect(enParte).toContainText("Vendido en parte");
  await expect(enParte).toContainText("2 con contrato");
  await expect(page.getByText("Disponible para vender")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // ── Historial: el código corto; lo que no corrió no «duró»; el filtro con el corto.
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = page.locator("[data-historial]");
  await expect(historial.locator("tbody tr")).toHaveCount(2);
  await expect(historial.locator("tbody")).not.toContainText(`${sede}-`);
  const noCorrio = historial.locator("tbody tr").filter({ hasText: "Limpio Hogar" });
  await expect(noCorrio.getByRole("button", { name: "PUN-08", exact: true })).toBeVisible();
  await expect(noCorrio).toContainText("no llegó a correr");
  await expect(noCorrio.locator("td").nth(4)).toHaveText("—");
  const cancelado = historial.locator("tbody tr").filter({ hasText: "Bebidas del Valle" });
  await expect(cancelado).toContainText("corrió hasta el");
  // Hasta la víspera de la baja (hoy), no hasta su «hasta» de dentro de 120 días.
  await expect(cancelado.locator("td").nth(4)).toHaveText(textoDeMeses(meses(isoDentroDe(-62), isoDentroDe(-1))));
  await historial.getByRole("searchbox", { name: "Espacio" }).fill("PUN-08");
  await expect(historial.locator("tbody tr")).toHaveCount(1);
  // El Excel también lleva el código corto y «Meses» hasta la baja.
  const [bajada] = await Promise.all([page.waitForEvent("download"), historial.getByRole("button", { name: "Exportar a Excel" }).click()]);
  const XLSX = await import("xlsx");
  const libro = XLSX.read(readFileSync((await bajada.path())!));
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], { header: 1 });
  expect(filas[1][0]).toBe("PUN-08");
  expect(filas[1][5] ?? null).toBeNull();
});

test("Indicadores: para administración los botones de siempre", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("INA");
  await plano(request, admin, sede, [gondola(sede, "GON-02", 10)]);
  await venderEntera(request, admin, sede, `${sede}-GON-02`, { proveedor: "Aseo Total", valor: 900_000, desde: isoDentroDe(-50), hasta: isoDentroDe(10) });
  await sesionEnElNavegador(page, admin, sede);
  await page.goto("/");
  await expect(page.locator('[data-cifra-inicio="Por vencer (30 días)"]')).toContainText("Requieren acción");
  await page.goto("/indicadores");
  await page.getByRole("tab", { name: "Mapa de oportunidades" }).click();
  const mapa = page.locator("[data-mapa-de-oportunidades]");
  await expect(mapa.getByRole("button", { name: /Plano para contratar/ })).toBeVisible();
  await expect(mapa.getByRole("button", { name: "Gestionar renovación" }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Análisis" }).click();
  await expect(page.locator("[data-analisis]").getByRole("button", { name: "Renovar" }).first()).toBeVisible();
});
