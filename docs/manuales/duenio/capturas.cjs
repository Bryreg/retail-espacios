/**
 * Capturas del manual del DUEÑO (Ajustes › Equipo y Cuenta, sedes, la cuenta
 * de la persona). Escribe `img/duenio/*.jpg`. Todo en computador (1280 × 800).
 *
 * Necesita la copia de prueba del dueño, no la de siempre:
 *
 *   MANUAL_TMP=<carpeta> MANUAL_PUERTO=8790 PYTHON=<python con el backend> sh docs/manuales/duenio/levantar-duenio.sh
 *   MANUAL_TMP=<carpeta> MANUAL_PUERTO=8790 node docs/manuales/duenio/capturas.cjs
 *
 * `levantar-duenio.sh` siembra CENTRO como siempre y, encima, con
 * `servidor-duenio.py` (tokens de Google/correo de prueba) y `sembrar-duenio.py`:
 * la dueña «Diana Prueba» con cuenta propia, su equipo, una invitación pendiente
 * y un segundo supermercado con suscripción. La sesión de la dueña se pone como
 * la deja el ingreso (igual que `abrir()` de comun.cjs, con el rol «owner»).
 */
const { lanzar, BASE, foto } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "duenio";
const PUERTO = Number(process.env.MANUAL_PUERTO || 8790);
const SESIONES = JSON.parse(fs.readFileSync(path.join(__dirname, `.sesion-duenia-${PUERTO}.json`), "utf8"));
const TEXTOS = path.join(process.env.MANUAL_TMP || "/tmp", "textos-duenio");
fs.mkdirSync(TEXTOS, { recursive: true });

async function abrirComoDuenia(nav, cual = "galerias") {
  const s = SESIONES[cual];
  const contexto = await nav.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
    locale: "es-CO", timezoneId: "America/Bogota", baseURL: BASE, colorScheme: "light", acceptDownloads: true,
  });
  {
    const sede = cual === "galerias" ? "CENTRO" : "";
    await contexto.addInitScript(([ses, sede]) => {
      if (sessionStorage.getItem("manual-sembrada")) return;
      sessionStorage.setItem("manual-sembrada", "1");
      localStorage.setItem("retail-auth-v1", JSON.stringify({
        state: {
          token: ses.token, role: ses.role, cliente: ses.cliente, clienteNombre: ses.cliente_nombre,
          rolCliente: ses.rol_cliente, email: ses.email, nombre: ses.nombre,
          avisoCuenta: ses.aviso_cuenta ?? null, pedirConsentimiento: false, plataforma: false,
        },
        version: 0,
      }));
      localStorage.setItem("retail-fixtures-v1", JSON.stringify({
        state: { sede, sedes: sede ? [sede] : [], clienteCache: ses.cliente }, version: 0,
      }));
      localStorage.setItem("recabra-config-inicial-vista", "1");
    }, [s, sede]);
  }
  const page = await contexto.newPage();
  page.setDefaultTimeout(20_000);
  const dialogos = [];
  page.on("dialog", async (d) => { dialogos.push(d.message()); await d.accept(); });
  return { contexto, page, dialogos };
}

(async () => {
  const nav = await lanzar();
  const espera = (page, ms = 700) => page.waitForTimeout(ms);
  const guardarTexto = async (nombre, loc) =>
    fs.writeFileSync(path.join(TEXTOS, `${nombre}.txt`), (await loc.innerText()).replace(/\n{2,}/g, "\n"));

  // La pantalla de ingreso (Google o correo) y el correo de invitación no se
  // capturan: la copia de prueba no tiene Firebase configurado y la invitación
  // sale directo, sin pasar por la cola de correos (ver notas.md).

  // ── 1. Galerías, como dueña ───────────────────────────────────────────────
  const { page, dialogos } = await abrirComoDuenia(nav, "galerias");
  const boton = (n, exact = true) => page.getByRole("button", { name: n, exact });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await espera(page, 2000);
  if (await page.locator("[data-cajon]").count()) { await page.keyboard.press("Escape"); await espera(page, 500); }
  await guardarTexto("01-inicio", page.locator("body"));

  // El menú de la cuenta
  const cuenta = page.locator(".cuenta-app > button");
  await cuenta.click();
  await espera(page, 600);
  await foto(page, C, "02-menu-cuenta", { marca: page.locator(".menu-cuenta") });
  await guardarTexto("02-menu-cuenta", page.locator(".menu-cuenta"));
  await page.keyboard.press("Escape");
  await espera(page, 400);

  // Ajustes › Equipo
  await page.getByTitle(/Usuarios, avisos/).first().click();
  await espera(page, 1000);
  await page.locator("[data-tema=equipo]").click();
  await espera(page, 2000);
  await foto(page, C, "03-equipo", { marca: page.locator("[data-tema=equipo]") });
  await guardarTexto("03-equipo", page.locator(".ajustes-tema"));

  // Invitar
  const correo = page.getByPlaceholder("persona@empresa.com");
  await correo.fill("sofia.nueva@supermercado.example");
  const rol = page.locator(".ajustes-tema select").first();
  await rol.selectOption("admin");
  await foto(page, C, "04-invitar", { marca: [
    { loc: correo, n: 1 }, { loc: rol, n: 2 }, { loc: boton("Invitar"), n: 3 },
  ] });
  console.log("  roles que ofrece:", (await rol.locator("option").allInnerTexts()).join(" | "));
  await boton("Invitar").click();
  await espera(page, 2500);
  const usuarios = page.locator(".ajustes-tema > div").first();
  await foto(page, C, "05-invitacion-enviada", { recorte: usuarios, margen: 6, marca: page.getByText(/Invitación enviada a/) });
  await guardarTexto("05-invitacion-enviada", usuarios);

  // Desactivar a alguien que se fue
  const filaLuis = page.getByText("luis.tienda@supermercado.example", { exact: false }).locator("xpath=../..");
  await foto(page, C, "06-desactivar", { recorte: usuarios, margen: 6, marca: filaLuis.getByRole("button", { name: "Desactivar" }) });
  await filaLuis.getByRole("button", { name: "Desactivar" }).click();
  await espera(page, 1500);
  console.log("  confirmación:", dialogos.at(-1));
  fs.writeFileSync(path.join(TEXTOS, "06-confirmacion.txt"), dialogos.at(-1) || "");
  await foto(page, C, "07-desactivado", { recorte: usuarios, margen: 6, marca: filaLuis });
  // Lo deja como estaba.
  await filaLuis.getByRole("button", { name: "Activar" }).click();
  await espera(page, 1200);

  // Permisos de planogramas y cortar un enlace
  const permisos = page.locator("[data-bloque-ajustes=permisos]");
  await permisos.scrollIntoViewIfNeeded();
  await foto(page, C, "09-permisos", { recorte: permisos, margen: 6 });
  const cortar = page.locator("[data-bloque-ajustes=cortar-enlace]");
  await cortar.scrollIntoViewIfNeeded();
  await foto(page, C, "09b-cortar-enlace", { recorte: cortar, margen: 6 });
  await guardarTexto("09-permisos-y-enlaces", page.locator(".ajustes-tema"));

  // Cuenta (Galerías: sin suscripción, es la base principal)
  await page.locator("[data-tema=cuenta]").click();
  await espera(page, 2500);
  await foto(page, C, "10-cuenta", { marca: page.locator("[data-tema=cuenta]") });
  await guardarTexto("10-cuenta", page.locator(".ajustes-tema"));

  // Copia de seguridad
  const copia = boton(/Descargar copia de seguridad/, false);
  await copia.scrollIntoViewIfNeeded();
  await copia.click();
  await espera(page, 6000);
  const bloqueCopia = page.getByText("Copia de seguridad", { exact: true }).locator("xpath=..");
  await foto(page, C, "12-copia", { recorte: bloqueCopia, margen: 6, marca: page.getByText(/^Listo: /).first() });
  await guardarTexto("12-copia", bloqueCopia);

  // Tus datos: los datos del supermercado y la supresión
  const tusDatos = page.getByText("Tus datos", { exact: true }).locator("xpath=..");
  await boton(/Descargar los datos del supermercado/, false).click();
  await espera(page, 3000);
  await page.getByPlaceholder("Por qué querés que se suprima el cliente").fill("Prueba del manual: no ejecutar");
  await foto(page, C, "13-tus-datos", { recorte: tusDatos, margen: 6, marca: [
    { loc: boton(/Descargar los datos del supermercado/, false), n: 1 },
    { loc: boton(/Solicitar supresión/, false), n: 2 },
    { loc: boton(/Reporte de transparencia/, false), n: 3 },
  ] });
  await boton(/Solicitar supresión/, false).click();
  await espera(page, 2500);
  console.log("  confirmación de supresión:", dialogos.at(-1));
  fs.writeFileSync(path.join(TEXTOS, "14-confirmacion-supresion.txt"), dialogos.at(-1) || "");
  await foto(page, C, "14-supresion-registrada", { recorte: tusDatos, margen: 6, marca: page.getByText(/Solicitud registrada/) });
  await guardarTexto("14-tus-datos", tusDatos);

  // Bitácora, filtrada
  const bitacora = page.getByText("Bitácora", { exact: true }).locator("xpath=../..");
  await bitacora.locator("select").selectOption({ label: "Persona invitada" });
  await espera(page, 1500);
  await bitacora.scrollIntoViewIfNeeded();
  await foto(page, C, "16-bitacora", { recorte: bitacora, margen: 6, marca: bitacora.locator("select") });
  await guardarTexto("16-bitacora", bitacora);
  await bitacora.locator("select").selectOption({ label: "Todo" });
  await espera(page, 1500);
  await guardarTexto("16-bitacora-todo", bitacora);

  // Reporte de transparencia
  await boton(/Reporte de transparencia/, false).click();
  await page.waitForLoadState("networkidle");
  await espera(page, 2500);
  await foto(page, C, "15-reporte");
  await guardarTexto("15-reporte", page.locator("body"));

  // Sedes (Ajustes › Sede y plano)
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");
  await espera(page, 1500);
  await page.getByTitle(/Usuarios, avisos/).first().click();
  await espera(page, 800);
  await page.locator("[data-tema=sede]").click();
  await espera(page, 1500);
  const sedes = page.locator("[data-bloque-ajustes=sedes]");
  await page.getByLabel("Nombre de la sede nueva").fill("NORTE");
  await foto(page, C, "17-agregar-sede", { recorte: sedes, margen: 8, marca: boton("Agregar sede", false) });
  await boton("Agregar sede", false).click();
  await espera(page, 2000);
  await foto(page, C, "18-sede-agregada", { recorte: sedes, margen: 8, marca: page.getByRole("button", { name: "Eliminar NORTE" }) });
  await page.getByRole("button", { name: "Eliminar NORTE" }).click();
  await espera(page, 1200);
  const dBorrar = page.getByText("Eliminar la sede «NORTE»").locator("xpath=../..");
  await dBorrar.locator("input").fill("NORTE");
  await foto(page, C, "19-eliminar-sede", { recorte: dBorrar, margen: 8, marca: dBorrar.getByRole("button", { name: "Eliminar sede" }) });
  await dBorrar.getByRole("button", { name: "Eliminar sede" }).click();
  await espera(page, 2500);
  await foto(page, C, "20-papelera", { recorte: sedes, margen: 8, marca: page.getByRole("button", { name: /Restaurar/ }).first() });
  await page.getByRole("button", { name: /Restaurar/ }).first().click();
  await espera(page, 2500);
  await foto(page, C, "21-restaurada", { recorte: sedes, margen: 8 });
  await guardarTexto("21-restaurada", sedes);
  await page.context().close();

  // ── 2. El otro supermercado: suscripción y franja de pago pendiente ──────
  {
    const { page } = await abrirComoDuenia(nav, "norte");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await espera(page, 2500);
    await foto(page, C, "30-franja-pago");
    await guardarTexto("30-franja-pago", page.locator("body"));
    await page.getByTitle(/Usuarios, avisos/).first().click();
    await espera(page, 800);
    await page.locator("[data-tema=cuenta]").click();
    await espera(page, 2500);
    const susc = page.getByText("Suscripción", { exact: true }).first().locator("xpath=..");
    await foto(page, C, "31-suscripcion", { recorte: page.locator(".ajustes-tema"), margen: 0 });
    await guardarTexto("31-suscripcion", page.locator(".ajustes-tema"));
    const fact = page.getByText("Datos de facturación", { exact: true }).locator("xpath=..");
    await fact.scrollIntoViewIfNeeded();
    await espera(page, 400);
    await foto(page, C, "32-facturacion", { recorte: fact, margen: 8 });
    await page.context().close();
  }

  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
