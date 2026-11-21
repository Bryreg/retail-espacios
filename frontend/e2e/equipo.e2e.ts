/**
 * Equipo, Cuenta y el reporte de transparencia, como los vio la dueña al
 * recorrer la app para su manual (2026-11-20): cambiar el rol de una persona
 * (no había cómo), el selector de rol que cortaba «Administrado», «Desactivar»
 * en la fila propia, «Tus datos» con botones que a un administrador le fallaban,
 * la bitácora que decía «admin» por la dueña y, en el reporte, la fecha de
 * aceptación un día antes y las rutas de la API en «Tus derechos».
 *
 * La copia de los recorridos no tiene Firebase: no hay cómo entrar con una
 * cuenta de dueña de verdad. La sesión es la de la clave de la instalación con
 * el correo y el rol de la persona puestos como los deja el ingreso, y lo que
 * depende de las membresías (la lista del equipo, el reporte) lo contesta la
 * prueba. Las reglas del servidor están en `tests/test_invitacion_enlace.py` y
 * `tests/test_plataforma_reporte.py`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { entrar, type Sesion } from "./sembrar";

const DIANA = "diana.duena@supermercado.example";
const ANA = "ana.admin@supermercado.example";
const LUIS = "luis.tienda@supermercado.example";

const miembros = () => [
  { id: 1, email: ANA, nombre: "Ana Prueba", rol: "admin", activo: true, ultimo_login: null },
  { id: 2, email: DIANA, nombre: "Diana Prueba", rol: "owner", activo: true, ultimo_login: null },
  { id: 3, email: LUIS, nombre: "Luis Prueba", rol: "worker", activo: true, ultimo_login: null },
];

async function comoPersona(page: Page, s: Sesion, email: string, rolCliente: "owner" | "admin") {
  await page.addInitScript(([ses, correo, rol]) => {
    if (sessionStorage.getItem("e2e-sembrada")) return;
    sessionStorage.setItem("e2e-sembrada", "1");
    localStorage.setItem("retail-auth-v1", JSON.stringify({
      state: {
        token: ses.token, role: ses.role, cliente: ses.cliente, clienteNombre: ses.cliente_nombre,
        rolCliente: rol, email: correo, nombre: null, avisoCuenta: null, pedirConsentimiento: false, plataforma: false,
      },
      version: 0,
    }));
    localStorage.setItem("recabra-config-inicial-vista", "1");
    localStorage.setItem("recabra-pendientes-del-dia", new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()));
  }, [s, email, rolCliente] as const);
}

/** La lista del equipo y los cambios: lo que manda la pantalla queda en `pedidos`. */
async function equipoDePrueba(page: Page) {
  const lista = miembros();
  const pedidos: { id: string; cuerpo: Record<string, unknown> }[] = [];
  await page.route(/\/api\/usuarios(\/\d+)?$/, async (r) => {
    const req = r.request();
    if (req.method() === "GET") {
      return r.fulfill({ json: { miembros: lista, invitaciones: [] } });
    }
    if (req.method() === "PATCH") {
      pedidos.push({ id: req.url().split("/").pop()!, cuerpo: req.postDataJSON() });
      return r.fulfill({ json: { ok: true } });
    }
    return r.continue();
  });
  return pedidos;
}

async function abrirAjustes(page: Page, tema: "equipo" | "cuenta") {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByTitle(/Usuarios, avisos/).first().click();
  await page.locator(`[data-tema=${tema}]`).click();
}

test("la dueña cambia el rol de una persona y no se ve «Desactivar» en su propia fila", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  await comoPersona(page, admin, DIANA, "owner");
  const pedidos = await equipoDePrueba(page);
  const dialogos: string[] = [];
  page.on("dialog", async (d) => { dialogos.push(d.message()); await d.accept(); });
  await abrirAjustes(page, "equipo");

  // Su fila: dice «vos» y su rol, sin «Desactivar» ni selector.
  const yo = page.locator(`[data-miembro="${DIANA}"]`);
  await expect(yo).toContainText("vos");
  await expect(yo).toContainText("Dueño");
  await expect(yo.getByRole("button")).toHaveCount(0);
  await expect(yo.locator("select")).toHaveCount(0);

  // A Luis (trabajador) lo pasa a administrador desde la lista.
  const rolDeLuis = page.getByRole("combobox", { name: "Rol de Luis Prueba" });
  await expect(rolDeLuis.locator("option")).toHaveText(["Trabajador", "Administrador", "Dueño"]);
  await rolDeLuis.selectOption("admin");
  await expect(page.getByText("Listo: Luis Prueba ahora es administrador.")).toBeVisible();
  expect(pedidos).toEqual([{ id: "3", cuerpo: { rol: "admin" } }]);
  expect(dialogos[0]).toContain("volver a entrar");
  await expect(rolDeLuis).toHaveValue("admin");

  // El selector de invitar se lee entero: «Administrador», no «Administrado».
  const invitar = page.locator("[data-rol-invitar]");
  await invitar.selectOption("admin");
  const entra = await invitar.evaluate((el: HTMLSelectElement) => {
    const estilo = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
    const texto = ctx.measureText(el.options[el.selectedIndex].text).width;
    // El texto, el relleno y la flecha del selector (~20 px) entran en el ancho.
    const libre = el.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight) - 20;
    return { texto, libre };
  });
  expect(entra.texto).toBeLessThanOrEqual(entra.libre);

  // Los selectores nuevos tienen nombre (axe: nada grave en la lista del equipo).
  const r = await new AxeBuilder({ page }).include("[data-miembro]").include("[data-rol-invitar]").analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("la administradora no toca a la dueña ni da el rol Dueño, y en Cuenta ve qué es de quién", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  await comoPersona(page, admin, ANA, "admin");
  await equipoDePrueba(page);
  await abrirAjustes(page, "equipo");

  const duenia = page.locator(`[data-miembro="${DIANA}"]`);
  await expect(duenia).toContainText("Dueño");
  await expect(duenia.getByRole("button")).toHaveCount(0);
  await expect(duenia.locator("select")).toHaveCount(0);
  await expect(page.locator(`[data-miembro="${ANA}"]`).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Rol de Luis Prueba" }).locator("option"))
    .toHaveText(["Trabajador", "Administrador"]);
  await expect(page.locator("[data-rol-invitar] option")).toHaveText(["Trabajador", "Administrador"]);

  // Cuenta › Tus datos: ni un botón que después falla; dónde bajar lo suyo.
  await page.locator("[data-tema=cuenta]").click();
  const tusDatos = page.locator("[data-tus-datos]");
  await expect(tusDatos).toHaveAttribute("data-tus-datos", "persona");
  await expect(tusDatos).toContainText("«Descargar mis datos»");
  await expect(tusDatos).toContainText("son del dueño de la cuenta");
  await expect(tusDatos.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Solicitar supresión|Reporte de transparencia|Descargar los datos del supermercado/ }))
    .toHaveCount(0);
});

test("la bitácora dice «Dueño» cuando lo hizo la dueña, y a quién", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  await comoPersona(page, admin, DIANA, "owner");
  // El detalle como lo anota el servidor desde el 2026-11-21: a quién, qué y quién lo hizo.
  const rol = `${LUIS}: Trabajador → Administrador · ${DIANA}`;
  await page.route(/\/api\/bitacora\/\?/, (r) => r.fulfill({ json: [
    { id: 2, at: new Date().toISOString(), rol: "owner", ip: "127.0.0.1", accion: "usuario.rol",
      titulo: "Rol de una persona cambiado", detalle: rol },
    { id: 1, at: new Date().toISOString(), rol: "admin", ip: "127.0.0.1", accion: "usuario.cambio",
      titulo: "Persona activada o desactivada", detalle: `${LUIS}: activado · ${ANA}` },
  ] }));
  await abrirAjustes(page, "cuenta");
  await expect(page.getByText("Dueño · 127.0.0.1")).toBeVisible();
  await expect(page.getByText("Administrador · 127.0.0.1")).toBeVisible();
  await expect(page.getByText(/^(owner|admin) · /)).toHaveCount(0);
  // Entero, sin cortarse con «…»: a quién es lo primero que se lee.
  const linea = page.getByText(rol, { exact: true });
  await expect(linea).toBeVisible();
  expect(await linea.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("invitar: si el correo no salió, la pantalla no dice «enviada»", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  await comoPersona(page, admin, DIANA, "owner");
  await equipoDePrueba(page);
  const respuestas = [false, true];
  await page.route(/\/api\/usuarios\/invitar$/, (r) => r.fulfill({ json: {
    ok: true, expira_en: new Date(Date.now() + 7 * 86_400_000).toISOString(), correo_enviado: respuestas.shift(),
  } }));
  await abrirAjustes(page, "equipo");
  const correo = page.getByPlaceholder("persona@empresa.com");

  await correo.fill("nueva@supermercado.example");
  await page.getByRole("button", { name: "Invitar", exact: true }).click();
  await expect(page.getByText(/^Invitación creada para nueva@supermercado\.example, pero el correo no salió todavía: RECABRA lo vuelve a intentar solo\./)).toBeVisible();
  await expect(page.getByText(/Invitación enviada/)).toHaveCount(0);

  await correo.fill("otra@supermercado.example");
  await page.getByRole("button", { name: "Invitar", exact: true }).click();
  await expect(page.getByText(/^Invitación enviada a otra@supermercado\.example: /)).toBeVisible();
});

test("reporte de transparencia: el día de la aceptación es el de Colombia y los derechos dicen dónde", async ({ page, request }) => {
  const admin = await entrar(request, "admin");
  await comoPersona(page, admin, DIANA, "owner");
  const derechos = {
    export: "Bajar todos los datos del supermercado: Ajustes › Cuenta › Tus datos › «Descargar los datos del supermercado».",
    supresion: "Pedir la supresión del supermercado: Ajustes › Cuenta › Tus datos › «Solicitar supresión».",
    reporte: "Volver a ver este reporte: Ajustes › Cuenta › Tus datos › «Reporte de transparencia».",
    contacto: "El correo de protección de datos de la Política, §8.",
  };
  await page.route(/\/api\/clientes\/mi-reporte-plataforma/, (r) => r.fulfill({ json: {
    cliente: { slug: "galerias", nombre: "Galerías" },
    // Las 8:30 p. m. del 20 en Colombia: ya es el 21 en UTC.
    generado_en: "2026-11-21T01:30:00Z",
    ventana: { desde: "2026-11", hasta: "2026-11", meses: 1 },
    politica: { version_vigente: "2026-10-v3", version_aceptada: "2026-10-v3", aceptada_en: "2026-11-20",
      base_legal: "Ley 1581 de 2012", url: "/politica-datos" },
    catalogo: [
      { clave: "ocupacion_pct", nombre: "Ocupación", definicion: "Porcentaje de espacios comercializables con un contrato activo.",
        fuente: "layout_snapshots, space_leases", finalidad: "salud_cartera", endpoints: ["metricas", "tendencia"], tratamiento: "relacion" },
      { clave: "oportunidades", nombre: "Oportunidades de venta de espacio", definicion: "Por cada espacio libre, el precio sugerido.",
        fuente: "derivado de ocupacion_pct", finalidad: "asesoria", endpoints: ["detalle"], tratamiento: "relacion" },
    ],
    valores: [], spread_actual: null,
    accesos: { total: 1, lineas: [{ fecha: "2026-11-20", operador: "op@recabra.example", accion: "detalle", periodo: "galerias:2026-11" }] },
    derechos,
  } }));
  await page.goto("/reporte-plataforma");
  // «20 nov 2026» o «20 de nov de 2026», según el ICU del navegador; nunca el 19.
  const dia20 = "20 (de )?nov\\.? (de )?2026";
  const cabecera = page.locator("header").filter({ hasText: "Reporte de transparencia" });
  await expect(cabecera).toContainText(new RegExp(`generado el ${dia20}`));
  await expect(cabecera).toContainText(new RegExp(`\\(${dia20}\\)`));
  await expect(page.locator(".reporte-tabla tbody td").first()).toHaveText(new RegExp(`^${dia20}$`));
  // 1. En palabras: sin las rutas de la API, sin los nombres de las tablas ni el código interno.
  const catalogo = page.locator("[data-reporte-catalogo]");
  await expect(catalogo).toContainText("Salud de la cartera");
  await expect(catalogo).toContainText("De dónde sale: los planos de las sedes, los contratos. Cómo: sale calculado a partir de otros datos.");
  await expect(catalogo).toContainText("De dónde sale: se calcula con «Ocupación».");
  for (const tecnico of ["Endpoints", "Fuente", "layout_snapshots", "space_leases", "metricas", "ocupacion_pct"]) {
    await expect(catalogo).not.toContainText(tecnico);
  }
  await expect(cabecera).not.toContainText("galerias");
  await expect(page.locator(".reporte-tabla tbody td").nth(3)).toHaveText("2026-11");
  const tusDerechos = page.locator("section").filter({ hasText: "4. Tus derechos" });
  await expect(tusDerechos).toContainText("Ajustes › Cuenta › Tus datos");
  await expect(tusDerechos).not.toContainText("/api/");
});
