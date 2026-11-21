/**
 * Montajes con la cuenta del TRABAJADOR (recorrido de los manuales,
 * 2026-11-20): lo que se encontró al hacer el manual de ese rol.
 *
 * · Los montajes de planogramas de la sede se ven en la lista (antes le
 *   llegaban vacíos), y se miran con «Ver la guía»: revisarlos es de quien
 *   publica.
 * · Sin conexión, el formulario dice «en este equipo» y la barra de arriba
 *   dice «Sin conexión» sin tocarla; al volver, el reporte sale solo y la
 *   lista dice «Listo: … quedó reportado como montado.».
 * · La pastilla roja de «Pendientes» es la misma en Montajes que en el Inicio,
 *   también entrando directo a `/montajes`.
 * · «Montajes por resolver» del Inicio cuenta lo que lista Montajes, también
 *   los planogramas que el trabajador sólo mira.
 * · La ayuda «?» no le define «Canon», y un «no realizado» le dice que avise
 *   a quien administra (reclamarle al proveedor es de administración).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { conSesion, entrar, gondola, isoDentroDe, plano, sedeUnica, sesionEnElNavegador, venderEntera, type Sesion } from "./sembrar";

/** Un mueble interno (no se vende): su planograma lo publica administración. */
const interno = (sede: string, code: string, cx: number) => ({
  id: `f-${sede}-${code}`, code, sede, type: "metro", label: code, rentable: false,
  cx, cz: 2, rotY: 0, w: 1, d: 1, h: 0.05, color: "#818cf8",
});

/** Publica un planograma de una pieza en la cara A, vigente desde hoy. */
async function publicarPlanograma(api: APIRequestContext, s: Sesion, sede: string, fixtureId: string): Promise<number> {
  const h = { headers: conSesion(s) };
  const d = await api.post("/api/planogramas/destinos", { ...h, data: { sede, nombre: "Lácteos", tipo: "categoria", color: "d1" } });
  expect(d.status(), await d.text()).toBe(201);
  const base = { sede, fixture_id: fixtureId, cara: "A" };
  const piezas = [{ destino_id: (await d.json()).id, pb: 4000, vertices: [[0, 0], [0.4, 0], [0.4, 1], [0, 1]] }];
  const b = await api.put("/api/planogramas/borrador", { ...h, data: { ...base, version: 0, piezas } });
  expect(b.status(), await b.text()).toBe(200);
  // El «hoy» del servidor (puede no ser el de esta máquina): ni antes se
  // puede, ni después entraría en la lista hasta que rija.
  const { hoy } = await (await api.get("/api/planogramas/supervision", { ...h, params: { sede } })).json();
  const p = await api.post("/api/planogramas/publicar", { ...h, data: { ...base, version: 1, rige_desde: hoy } });
  expect(p.status(), await p.text()).toBe(200);
  return (await p.json()).planograma.vigente.id;
}

/** Una foto de verdad (un JPEG que el navegador pueda decodificar). */
async function foto(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 48;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2f855a"; g.fillRect(0, 0, 64, 48);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

test("el trabajador ve los montajes de planogramas y abre la guía, sin revisarlos", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("PGT");
  await plano(request, admin, sede, [interno(sede, "INT-01", 2), gondola(sede, "GON-01", 6)]);
  await publicarPlanograma(request, admin, sede, `f-${sede}-INT-01`);
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  await page.goto("/montajes");
  const fila = page.locator('[data-montaje="planograma"]');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("INT-01 · cara A");
  await expect(fila).toContainText("Sin montar");
  // Revisar pide poder publicar esa cara: el trabajador sólo mira la guía.
  await expect(fila.getByRole("button", { name: "Ver la guía y revisar" })).toHaveCount(0);
  await fila.getByRole("button", { name: "Ver la guía" }).click();
  const guia = page.getByRole("dialog", { name: /Guía de montaje de INT-01 · cara A/ });
  await expect(guia).toBeVisible();
  await expect(guia.getByText("Lácteos").first()).toBeVisible();
  await expect(guia.getByRole("button", { name: /Mandarla a quien corresponde/ })).toHaveCount(0);
  await expect(guia.getByRole("button", { name: /Copiar el enlace/ })).toHaveCount(0);
  await guia.getByRole("button", { name: "Cerrar" }).click();
  await expect(guia).toHaveCount(0);
});

test("el Inicio del trabajador cuenta los mismos montajes que lista Montajes, con los planogramas", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("PGI");
  await plano(request, admin, sede, [interno(sede, "INT-01", 2), gondola(sede, "GON-01", 6)]);
  // Un planograma que rige desde hoy (lo publica administración) y un contrato
  // que empezó hace 5 días: los dos sin montar.
  await publicarPlanograma(request, admin, sede, `f-${sede}-INT-01`);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  await page.goto("/montajes");
  await expect(page.locator('[data-montaje="planograma"]')).toHaveCount(1);
  await expect(page.locator('[data-montaje="contrato"]')).toHaveCount(1);
  await expect(page.locator('[data-filtro="sin_montar"] .mono')).toHaveText("2");
  await expect(page.locator('[data-filtro="no_realizado"] .mono')).toHaveText("0");

  // Antes el Inicio pedía sólo lo que el trabajador revisa y decía 1.
  await page.goto("/");
  const tarjeta = page.locator('[data-cifra-inicio="Montajes por resolver"]');
  await expect(tarjeta.locator(".valor")).toHaveText("2");
  await expect(tarjeta).toContainText("2 sin montar");
  // «Para revisar» sigue siendo de quien publica: el planograma no le llega
  // como tarea de revisión.
  await expect(page.locator('[data-aviso^="pg:"]')).toHaveCount(0);
});

test("sin conexión: «en este equipo», la barra lo dice sola y al volver sale el «Listo»", async ({ page, context, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("SCX");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  await page.goto("/montajes");
  const barra = page.locator(".sync-status");
  await expect(barra).toHaveAccessibleName(/^Sincronizado\./);
  await page.getByRole("button", { name: "Registrar montaje" }).first().click();
  await page.getByRole("button", { name: "Lo monté" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "montaje.jpg", mimeType: "image/jpeg", buffer: await foto(page) });

  await context.setOffline(true);
  // La barra no espera a que algo falle: el navegador avisó que no hay red.
  await expect(barra).toHaveAccessibleName(/^Sin conexión\./);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Sin conexión: tu reporte quedó guardado en este equipo.")).toBeVisible();
  await expect(page.getByText(/^Guardado en este equipo /)).toBeVisible();
  await expect(page.getByText(/teléfono/)).toHaveCount(0);

  // Vuelve la red: el reporte sale solo y la lista confirma con el código.
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "Listo:" })).toHaveText(/Listo: GON-01 quedó reportado como montado\./);
  await expect(page.locator('[data-montaje="contrato"]').first()).toHaveAttribute("data-estado", "sin_verificar");
  await expect(barra).not.toHaveAccessibleName(/^Sin conexión/);
  await expect.poll(async () => {
    const r = await request.get("/api/mounts/", { headers: conSesion(admin) });
    const filas: { space_code: string; estado: string }[] = await r.json();
    return filas.find((m) => m.space_code === `${sede}-GON-01`)?.estado ?? null;
  }).toBe("montado");
});

test("«No pude» desde Montajes: la lista confirma que quedó el motivo", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("NOP");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  await page.goto("/montajes");
  await page.getByRole("button", { name: "Registrar montaje" }).first().click();
  await page.getByRole("button", { name: "No pude" }).click();
  await page.getByRole("button", { name: /No llegó el producto/ }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listo:" }))
    .toHaveText(/Listo: GON-01 quedó reportado como no montado, con el motivo\./);
  await expect(page.locator('[data-montaje="contrato"]').first()).toHaveAttribute("data-estado", "no_realizado");
});

test("al trabajador: la ayuda del Inicio sin «Canon» y el «no realizado» le dice que avise", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("AYU");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Aseo Total", valor: 900_000 });
  const r = await request.post("/api/montaje/reportar", {
    headers: conSesion(admin),
    multipart: { estado: "no_montado", space_code: `${sede}-GON-01`, motivo: "sin_material", reportado_por: "Prueba" },
  });
  expect(r.status(), await r.text()).toBe(201);
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  // La ayuda «?» del Inicio no le define plata.
  await page.goto("/");
  await page.locator("[data-abrir-ayuda]").click();
  const ayuda = page.locator('[data-ayuda="inicio"]');
  await expect(ayuda).toBeVisible();
  await expect(ayuda.locator("dt", { hasText: "Ocupación" })).toBeVisible();
  await expect(ayuda).not.toContainText("Canon");
  await expect(ayuda).not.toContainText("Lo que paga el proveedor");
  await page.keyboard.press("Escape");

  // «Ver registro» de un no realizado: reclamar es de administración.
  await page.goto("/montajes");
  await page.locator('[data-montaje="contrato"]').getByRole("button", { name: "Ver registro" }).click();
  const resolver = page.locator("[data-resolver-montaje]");
  await expect(resolver).toContainText("Avisale a quien administra la sede que falta el material del proveedor");
  await expect(resolver).not.toContainText("Reclamale");
});

test("«Pendientes» lleva el mismo número en Montajes que en el Inicio, entrando directo", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("PEN");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  // Vence en 10 días: «Por vencer», que el trabajador también ve (sin plata).
  await venderEntera(request, admin, sede, `${sede}-GON-01`, { proveedor: "Café Montaña", valor: 500_000, hasta: isoDentroDe(10) });
  const worker = await entrar(request, "worker");
  await sesionEnElNavegador(page, worker, sede);

  const cuenta = page.locator(".btn-pendientes .cuenta");
  await page.goto("/");
  await expect(cuenta).toHaveText(/^\d+$/);
  const enElInicio = (await cuenta.innerText()).trim();
  expect(Number(enElInicio)).toBeGreaterThan(0);
  // Directo a Montajes (una recarga, el enlace guardado): antes, sin número.
  await page.goto("/montajes");
  await expect(page.locator("[data-montajes]")).toBeVisible();
  await expect(cuenta).toHaveText(enElInicio);
  await page.reload();
  await expect(cuenta).toHaveText(enElInicio);
});
