/**
 * Vender, renovar y reservar: lo que encontró el recorrido de los manuales del
 * administrador (2026-11-20).
 *
 *  · «Renovar» copia los MESES del contrato, no los días (1 jun – 30 nov se
 *    renovaba hasta el 1 jun).
 *  · El precio arranca coherente con el plazo: la tarifa es al mes, y un
 *    contrato de 3 meses ya no se guarda por la tarifa de UN mes.
 *  · Una reserva guardada no dice «El contrato quedó guardado.».
 *  · Confirmar una reserva dice a quiénes salió el aviso (los de un contrato).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { comercial, conSesion, entrar, gondola, hoyEnColombia, isoDentroDe, plano, sedeUnica, sesionEnElNavegador, venderEntera, type Sesion } from "./sembrar";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** El último día del mes `k` meses después del de hoy, y el primero. */
/** Hoy, el día de Colombia (el del servidor), como fecha local del runner. */
const hoy = () => { const [a, m, d] = hoyEnColombia().split("-").map(Number); return new Date(a, m - 1, d); };
const ultimoDia = (k: number) => { const h = hoy(); return new Date(h.getFullYear(), h.getMonth() + k + 1, 0); };
const primerDia = (k: number) => { const h = hoy(); return new Date(h.getFullYear(), h.getMonth() + k, 1); };

/** La tarifa de las góndolas de ESTA sede (`by_sede`): las demás pruebas
 *  comparten el servidor y siguen sin tarifa. */
async function tarifaDeGondola(api: APIRequestContext, s: Sesion, sede: string, valor: number) {
  const actual = await (await api.get("/api/layout/rates", { headers: conSesion(s) })).json();
  const r = await api.put("/api/layout/rates", {
    headers: conSesion(s),
    data: { default: actual.default ?? {}, by_sede: { ...(actual.by_sede ?? {}), [sede]: { gondola: valor } } },
  });
  expect(r.status(), await r.text()).toBe(200);
}

test("renovar: los mismos meses, terminando la víspera del mismo día del mes", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("REN");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  // Seis meses justos, que terminan a fin de este mes (vence en ≤ 30 días).
  await venderEntera(request, admin, sede, `${sede}-GON-01`, {
    proveedor: "Limpio Hogar", valor: 3_600_000, desde: iso(primerDia(-5)), hasta: iso(ultimoDia(0)),
  });
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/indicadores");
  await page.getByRole("button", { name: "Ver ficha" }).first().click();
  await page.getByRole("button", { name: /^Renovar con Limpio Hogar/ }).click();
  const desde = page.locator("#contrato-desde");
  await expect(desde).toHaveValue(iso(primerDia(1)));
  const hasta = desde.locator('xpath=ancestor::div[contains(@class,"campo")][1]/following-sibling::div[contains(@class,"campo")][1]//input');
  // Del 1 del mes que viene al último día del sexto mes: 6 meses, no 6,03.
  await expect(hasta).toHaveValue(iso(ultimoDia(6)));
  await expect(page.locator("[data-pie-fijo]")).toContainText("6 meses");
});

test("el precio: la tarifa arranca «al mes» y el total es por todo el plazo", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("TAR");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  await tarifaDeGondola(request, admin, sede, 450_000);
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/contratos");
  await page.getByRole("button", { name: "3 meses", exact: true }).first().click();
  await page.getByRole("button", { name: /^GON-02·A/ }).first().click();
  const campo = page.getByLabel("Precio al mes de GON-02·A");
  await expect(campo).toHaveValue("450.000");
  await expect(page.locator("[data-pie-fijo]")).toContainText("$ 1.350.000");
  // Pasarla a «Total» la multiplica por los meses: nunca un mes como el total.
  await page.getByRole("button", { name: "Total", exact: true }).click();
  await expect(page.getByLabel("Precio total de GON-02·A")).toHaveValue("1.350.000");
  await page.getByRole("button", { name: "Al mes", exact: true }).click();
  await expect(page.getByLabel("Precio al mes de GON-02·A")).toHaveValue("450.000");

  await page.getByLabel("Proveedor").fill("Galletas del Norte");
  await page.getByRole("button", { name: "Guardar contrato" }).click();
  await expect(page.locator("[data-que-pasa-ahora]")).toBeVisible();
  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-02`]?.negotiatedValue).toBe(1_350_000);
});

test("reservar no dice «contrato guardado», y confirmar dice a quiénes salió el aviso", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("RES");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3), gondola(sede, "GON-02", 7)]);
  await sesionEnElNavegador(page, admin, sede);

  await page.goto("/contratos");
  await page.getByRole("button", { name: "1 mes", exact: true }).first().click();
  await page.getByRole("button", { name: /^GON-02·A/ }).first().click();
  await page.getByLabel("Precio total de GON-02·A").fill("900000");
  await page.getByLabel("Proveedor").fill("Lácteos Andinos");
  await page.getByRole("button", { name: "Reservar hasta…" }).click();
  await page.getByLabel("Reservar hasta").fill(hoyEnColombia());
  await page.getByRole("button", { name: /^Reservar hasta el / }).click();

  const hecho = page.locator('[data-guardado="reserva"]');
  await expect(hecho).toContainText("Reservado hasta el");
  await expect(page.locator("[data-reserva-sin-avisos]")).toBeVisible();
  await expect(page.getByText("El contrato quedó guardado.")).toHaveCount(0);
  // Ni «la planometría se carga…»: una reserva no la lleva (§8).
  await expect(page.locator("[data-planometria-en-supervisar]")).toHaveCount(0);

  // Confirmarla desde Pendientes › Hoy: dice qué salió.
  await page.goto("/indicadores");
  await page.getByRole("button", { name: /^Pendientes/ }).first().click();
  const cajon = page.locator('[role="dialog"]').last();
  await cajon.locator('button[data-grupo="hoy"]').click();
  await cajon.locator("[data-reserva]").getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator("[data-aviso-de-supervision]")).toContainText("GON-02·A pasó a contrato.");
  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-02`]?.leaseId ?? null).not.toBeNull();
});

/** Una reserva por la misma ruta que «Reservar hasta…» de Contratos. */
async function reservar(api: APIRequestContext, s: Sesion, sede: string, espacio: string, proveedor: string) {
  const r = await api.post("/api/contratos/vender", {
    headers: conSesion(s),
    data: {
      sede, proveedor, correo: "compras@ejemplo.co", marca: proveedor, tipo: "reserva", caduca: isoDentroDe(3),
      desde: isoDentroDe(0), hasta: isoDentroDe(60),
      lineas: [{ espacio, valor: 900_000, modo_precio: "total", valor_tecleado: 900_000 }],
    },
  });
  expect(r.status(), await r.text()).toBe(200);
}

/** La ficha de GON-01·A desde Indicadores › Contratos (la fila de la reserva). */
async function abrirLaFicha(page: Page) {
  await page.goto("/indicadores");
  await page.getByRole("tab", { name: "Contratos" }).click();
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "GON-01·A", exact: true }) }).first().click();
  await expect(page.locator("[data-reserva]")).toBeVisible();
}

test("la ficha del espacio dice qué pasó al confirmar la reserva", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("RFI");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await reservar(request, admin, sede, `${sede}-GON-01`, "Lácteos Andinos");
  await sesionEnElNavegador(page, admin, sede);

  // Antes sólo cambiaba a «Contratado», sin decir nada.
  await abrirLaFicha(page);
  await page.locator("[data-reserva]").getByRole("button", { name: "Confirmar", exact: true }).click();
  const aviso = page.locator("[data-aviso-de-la-reserva]");
  await expect(aviso).toContainText("GON-01·A pasó a contrato.");
  await expect(aviso).toContainText(/Salió el aviso|No salió ningún (aviso|correo)/);
  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-01`]?.leaseId ?? null).not.toBeNull();
});

test("la ficha del espacio dice qué pasó al cancelar la reserva", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  const sede = sedeUnica("RFC");
  await plano(request, admin, sede, [gondola(sede, "GON-01", 3)]);
  await reservar(request, admin, sede, `${sede}-GON-01`, "Bebidas del Sur");
  await sesionEnElNavegador(page, admin, sede);

  await abrirLaFicha(page);
  await page.locator("[data-reserva]").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.locator("[data-reserva]").getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.locator("[data-aviso-de-la-reserva]"))
    .toHaveText("Se canceló la reserva de GON-01·A: esas fechas quedan libres. No salió ningún correo.");
  await expect.poll(async () => (await comercial(request, admin))[`${sede}-GON-01`]?.status ?? "libre").toBe("libre");
});
