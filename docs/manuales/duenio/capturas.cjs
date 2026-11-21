/**
 * Capturas del manual del DUEÑO (Ajustes › Equipo y Cuenta, sedes, la cuenta
 * de la persona). Escribe `img/duenio/*.jpg`. Todo en computador (1280 × 800).
 *
 * Necesita la copia de prueba del dueño, no la de siempre, sembrada DE NUEVO
 * antes de cada corrida (la corrida invita, cambia roles, desactiva y borra):
 *
 *   MANUAL_TMP=<carpeta> MANUAL_PUERTO=8790 PYTHON=<python con el backend> sh docs/manuales/duenio/levantar-duenio.sh
 *   MANUAL_TMP=<carpeta> MANUAL_PUERTO=8790 node docs/manuales/duenio/capturas.cjs
 *
 * `levantar-duenio.sh` siembra CENTRO como siempre y, encima, con
 * `servidor-duenio.py` (tokens de Google/correo de prueba) y `sembrar-duenio.py`:
 * la dueña «Diana Prueba» con cuenta propia, su equipo, una invitación pendiente
 * y un segundo supermercado con suscripción. Las sesiones (de la dueña, de Ana y
 * de Luis) se ponen como las deja el ingreso (igual que `abrir()` de comun.cjs).
 *
 * Los textos de pantalla que cita el manual quedan en `<MANUAL_TMP>/textos-duenio/`
 * (innerText), y los avisos del navegador (confirm) también.
 */
const { lanzar, BASE, foto } = require("../herramientas/comun.cjs");
const fs = require("node:fs");
const path = require("node:path");

const C = "duenio";
const PUERTO = Number(process.env.MANUAL_PUERTO || 8790);
const TMP = process.env.MANUAL_TMP || "/tmp";
const SESIONES = JSON.parse(fs.readFileSync(path.join(__dirname, `.sesion-duenia-${PUERTO}.json`), "utf8"));
const TEXTOS = path.join(TMP, "textos-duenio");
fs.rmSync(TEXTOS, { recursive: true, force: true });
fs.mkdirSync(TEXTOS, { recursive: true });

/** Un ingreso nuevo con el token de prueba de `servidor-duenio.py`: lo mismo
 *  que hace la pantalla de ingreso con Google o correo. */
async function ingresar(correo, nombre, cliente) {
  const r = await fetch(`${BASE}/api/auth/oauth`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id_token: `prueba:${correo}:${nombre}`, acepta_politica: true, ...(cliente ? { cliente } : {}) }),
  });
  if (!r.ok) throw new Error(`ingreso ${correo}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function abrirCon(nav, s, { sede = "CENTRO", sinRol = false } = {}) {
  const contexto = await nav.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
    locale: "es-CO", timezoneId: "America/Bogota", baseURL: BASE, colorScheme: "light", acceptDownloads: true,
  });
  // `sinRol`: una sesión abierta antes de que el ingreso dijera el rol en el
  // supermercado (`rolCliente` en null). Va como bandera y no como `undefined`:
  // Playwright pasa `undefined` como null al navegador.
  await contexto.addInitScript(([ses, sede, sinRol]) => {
    if (sessionStorage.getItem("manual-sembrada")) return;
    sessionStorage.setItem("manual-sembrada", "1");
    localStorage.setItem("retail-auth-v1", JSON.stringify({
      state: {
        token: ses.token, role: ses.role, cliente: ses.cliente, clienteNombre: ses.cliente_nombre,
        rolCliente: sinRol ? null : ses.rol_cliente, email: ses.email, nombre: ses.nombre,
        avisoCuenta: ses.aviso_cuenta ?? null, pedirConsentimiento: false, plataforma: false,
      },
      version: 0,
    }));
    localStorage.setItem("retail-fixtures-v1", JSON.stringify({
      state: { sede, sedes: sede ? [sede] : [], clienteCache: ses.cliente }, version: 0,
    }));
    localStorage.setItem("recabra-config-inicial-vista", "1");
  }, [s, sede, sinRol]);
  const page = await contexto.newPage();
  page.setDefaultTimeout(20_000);
  // Los avisos del navegador (confirm): se anotan y se aceptan, salvo que el
  // paso pida cancelar (`page.__cancelar = true`).
  const dialogos = [];
  page.on("dialog", async (d) => {
    dialogos.push(d.message());
    if (page.__cancelar) await d.dismiss(); else await d.accept();
  });
  return { contexto, page, dialogos };
}

const espera = (page, ms = 700) => page.waitForTimeout(ms);
const guardar = (nombre, texto) => fs.writeFileSync(path.join(TEXTOS, `${nombre}.txt`), texto || "");
const guardarTexto = async (nombre, loc) => guardar(nombre, (await loc.innerText()).replace(/\n{2,}/g, "\n"));

async function abrirAjustes(page, tema) {
  await page.getByTitle(/Usuarios, avisos/).first().click();
  await espera(page, 1000);
  await page.locator(`[data-tema=${tema}]`).click();
  await espera(page, 2000);
}

/** El correo directo que guardó `servidor-duenio.py`, en un HTML con la
 *  cabecera de un buzón (como `herramientas/correo.py`). */
function correoDirecto(asunto, para = "") {
  const dir = path.join(TMP, `correos-directos-${PUERTO}`);
  const archivos = fs.existsSync(dir) ? fs.readdirSync(dir).sort().reverse() : [];
  for (const a of archivos) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, a), "utf8"));
    if (!c.asunto.includes(asunto) || !c.para.join(",").includes(para)) continue;
    const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const salida = path.join(TMP, `correo-directo-${PUERTO}.html`);
    fs.writeFileSync(salida, '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif">'
      + '<div style="background:#fff;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151">'
      + `<b style="font-size:15px;color:#111827">${esc(c.asunto)}</b><br>`
      + `<span style="color:#6b7280">De: RECABRA · Para: ${esc(c.para.join(", "))}</span></div>`
      + `<div style="padding:10px">${c.html}</div></body>`);
    return "file://" + salida;
  }
  throw new Error(`No quedó un correo «${asunto}» en ${dir}`);
}

(async () => {
  const nav = await lanzar();

  // ── 1. Galerías, como dueña ───────────────────────────────────────────────
  const { page, dialogos } = await abrirCon(nav, SESIONES.galerias);
  const boton = (n, exact = true) => page.getByRole("button", { name: n, exact });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await espera(page, 2000);
  if (await page.locator("[data-cajon]").count()) { await page.keyboard.press("Escape"); await espera(page, 500); }
  await guardarTexto("01-inicio", page.locator("body"));

  // El menú de la cuenta
  await page.locator(".cuenta-app > button").click();
  await espera(page, 600);
  await foto(page, C, "02-menu-cuenta", { marca: page.locator(".menu-cuenta") });
  await guardarTexto("02-menu-cuenta", page.locator(".menu-cuenta"));
  await page.keyboard.press("Escape");
  await espera(page, 400);

  // Ajustes › Equipo
  await abrirAjustes(page, "equipo");
  await foto(page, C, "03-equipo", { marca: page.locator("[data-tema=equipo]") });
  await guardarTexto("03-equipo", page.locator(".ajustes-tema"));
  const usuarios = page.locator(".ajustes-tema > div").first();
  const fila = (correo) => page.locator(`[data-miembro="${correo}"]`);
  const lista = fila("diana.duena@supermercado.example").locator("xpath=..");
  await foto(page, C, "03b-fila-propia", { recorte: lista, margen: 6, marca: fila("diana.duena@supermercado.example") });
  await guardarTexto("03b-lista", lista);

  // Invitar
  const correo = page.getByPlaceholder("persona@empresa.com");
  const form0 = () => page.locator("form").filter({ has: correo });
  await correo.fill("sofia.nueva@supermercado.example");
  const rol = page.locator("[data-rol-invitar]");
  await rol.selectOption("admin");
  await foto(page, C, "04-invitar", { recorte: usuarios, margen: 20, marca: [
    // Sin números: el número taparía el rótulo de cada campo («Invitar por
    // correo», «Rol»). El manual los nombra en orden.
    correo, rol, boton("Invitar"),
  ] });
  guardar("04-roles", (await rol.locator("option").allInnerTexts()).join(" | "));
  guardar("04-rol-elegido", await rol.evaluate((s) => s.options[s.selectedIndex].text + ` · ancho ${s.clientWidth}px · texto ${s.scrollWidth}px`));
  await boton("Invitar").click();
  await espera(page, 2500);
  await foto(page, C, "05-invitacion-enviada", { recorte: usuarios, margen: 6, marca: page.getByText(/Invitación enviada a/) });
  await guardarTexto("05-invitacion-enviada", usuarios);

  // Una invitación cuyo correo no salió (la copia de prueba contesta «no
  // salió» para carla.prueba@…, `servidor-duenio.py`): queda creada igual y el
  // aviso, en rojo, dice que RECABRA lo reintenta.
  await correo.fill("carla.prueba@supermercado.example");
  await rol.selectOption("worker");
  await boton("Invitar").click();
  await espera(page, 2500);
  const noSalio = page.getByText(/^Invitación creada para/);
  await foto(page, C, "05d-correo-no-salio", { recorte: [form0(), noSalio], margen: 8, marca: noSalio });
  guardar("05d-correo-no-salio", await noSalio.innerText());
  await guardarTexto("05d-equipo", usuarios);

  // Volver a invitar a alguien que ya está: el servidor dice cómo seguir.
  await correo.fill("luis.tienda@supermercado.example");
  await rol.selectOption("admin");
  await boton("Invitar").click();
  await espera(page, 2000);
  const form = page.locator("form").filter({ has: correo });
  const yaEsMiembro = page.getByText(/ya es miembro/);
  await foto(page, C, "05c-ya-es-miembro", { recorte: [form, yaEsMiembro], margen: 8, marca: yaEsMiembro });
  guardar("05c-ya-es-miembro", await yaEsMiembro.innerText());
  await correo.fill("");
  // El aviso rojo de arriba no se va solo: se sale de Equipo y se vuelve.
  await page.locator("[data-tema=cuenta]").click();
  await espera(page, 800);
  await page.locator("[data-tema=equipo]").click();
  await espera(page, 2000);

  // ── Cambiar el rol: Luis, de trabajador a administrador ──────────────────
  // Luis tiene la sesión abierta en otro computador.
  const luis = await abrirCon(nav, SESIONES.luis);
  await luis.page.goto("/");
  await luis.page.waitForLoadState("networkidle");
  await espera(luis.page, 1500);
  await luis.page.locator(".cuenta-app > button").click();
  await espera(luis.page, 500);
  await guardarTexto("08-luis-antes", luis.page.locator(".menu-cuenta"));
  await luis.page.keyboard.press("Escape");

  const rolLuis = page.getByLabel("Rol de Luis Prueba");
  await foto(page, C, "08-cambiar-rol", { recorte: lista, margen: 6, marca: rolLuis });
  guardar("08-opciones-rol-fila", (await rolLuis.locator("option").allInnerTexts()).join(" | "));
  await rolLuis.selectOption("admin");
  await espera(page, 2000);
  guardar("08-confirmacion", dialogos.at(-1));
  const listo = page.getByText(/^Listo: Luis Prueba ahora es/);
  await foto(page, C, "08b-rol-cambiado", { recorte: [lista, listo], margen: 22, marca: [rolLuis, listo] });
  guardar("08b-listo", await listo.innerText());

  // Lo que ve Luis: su sesión ya no vale; vuelve a la entrada.
  await luis.page.reload();
  await luis.page.waitForLoadState("networkidle");
  await espera(luis.page, 2500);
  guardar("08c-luis-despues-url", luis.page.url());
  await guardarTexto("08c-luis-despues", luis.page.locator("body"));
  await foto(luis.page, C, "08c-luis-sesion-cerrada", { marca: luis.page.getByRole("link", { name: "Ya tengo cuenta" }).first() });
  await luis.contexto.close();
  // Vuelve a entrar (con Google o su correo) y ya es administrador.
  const luisAdmin = await abrirCon(nav, await ingresar("luis.tienda@supermercado.example", "Luis Prueba"));
  await luisAdmin.page.goto("/");
  await luisAdmin.page.waitForLoadState("networkidle");
  await espera(luisAdmin.page, 2000);
  if (await luisAdmin.page.locator("[data-cajon]").count()) { await luisAdmin.page.keyboard.press("Escape"); await espera(luisAdmin.page, 500); }
  await luisAdmin.page.locator(".cuenta-app > button").click();
  await espera(luisAdmin.page, 600);
  await foto(luisAdmin.page, C, "08d-luis-administrador", {
    recorte: [luisAdmin.page.locator(".cuenta-app"), luisAdmin.page.locator(".menu-cuenta")], margen: 24,
    marca: luisAdmin.page.locator(".cuenta-app > button"),
  });
  await guardarTexto("08d-luis-menu", luisAdmin.page.locator(".menu-cuenta"));
  await guardarTexto("08d-luis-cuerpo", luisAdmin.page.locator("body"));
  await luisAdmin.contexto.close();

  // Darle el rol Dueño a Ana: se lee la pregunta y se CANCELA.
  page.__cancelar = true;
  await page.getByLabel("Rol de Ana Prueba").selectOption("owner");
  await espera(page, 1200);
  page.__cancelar = false;
  guardar("08e-confirmacion-duenio", dialogos.at(-1));
  guardar("08e-ana-sigue", await page.getByLabel("Rol de Ana Prueba").evaluate((s) => s.options[s.selectedIndex].text));

  // Luis vuelve a ser trabajador (lo que se hace si fue un error).
  await rolLuis.selectOption("worker");
  await espera(page, 2000);
  guardar("08f-confirmacion-vuelta", dialogos.at(-1));
  guardar("08f-listo", await page.getByText(/^Listo: Luis Prueba ahora es/).innerText());

  // Desactivar a alguien que se fue
  const filaLuis = fila("luis.tienda@supermercado.example");
  await foto(page, C, "06-desactivar", { recorte: lista, margen: 6, marca: filaLuis.getByRole("button", { name: "Desactivar" }) });
  await filaLuis.getByRole("button", { name: "Desactivar" }).click();
  await espera(page, 1500);
  guardar("06-confirmacion", dialogos.at(-1));
  await foto(page, C, "07-desactivado", { recorte: lista, margen: 6, marca: filaLuis });
  await guardarTexto("07-lista", lista);
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
  // Arriba de todo: el paso de antes dejó la columna bajada.
  await page.getByText("Suscripción", { exact: true }).first().evaluate((e) => e.scrollIntoView({ block: "center" }));
  await espera(page, 400);
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
  const tusDatos = page.locator("[data-tus-datos]");
  await boton(/Descargar los datos del supermercado/, false).click();
  await espera(page, 3000);
  await page.getByPlaceholder("Por qué querés que se borren los datos del supermercado").fill("Prueba del manual: no ejecutar");
  await foto(page, C, "13-tus-datos", { recorte: tusDatos, margen: 6, marca: [
    { loc: boton(/Descargar los datos del supermercado/, false), n: 1 },
    { loc: boton(/Solicitar supresión/, false), n: 2 },
    { loc: boton(/Reporte de transparencia/, false), n: 3 },
  ] });
  await guardarTexto("13-tus-datos", tusDatos);
  await boton(/Solicitar supresión/, false).click();
  await espera(page, 2500);
  guardar("14-confirmacion-supresion", dialogos.at(-1));
  await foto(page, C, "14-supresion-registrada", { recorte: tusDatos, margen: 6, marca: page.getByText(/Solicitud registrada/) });
  await guardarTexto("14-tus-datos", tusDatos);
  // Pedirla otra vez: ya hay una pendiente (409).
  await boton(/Solicitar supresión/, false).click();
  await espera(page, 2500);
  guardar("14b-confirmacion-otra-vez", dialogos.at(-1));
  await guardarTexto("14b-tus-datos-otra-vez", tusDatos);

  // Bitácora, filtrada: el cambio de rol
  const bitacora = page.getByText("Bitácora", { exact: true }).locator("xpath=../..");
  guardar("16-tipos", (await bitacora.locator("select option").allInnerTexts()).join(" | "));
  await bitacora.locator("select").selectOption({ label: "Rol de una persona cambiado" });
  await espera(page, 1500);
  await bitacora.scrollIntoViewIfNeeded();
  await foto(page, C, "16-bitacora", { recorte: bitacora, margen: 6, marca: bitacora.locator("select") });
  await guardarTexto("16-bitacora", bitacora);
  // A quién: la persona desactivada y la invitada, cada una en su línea. La
  // lista tiene su propia barra de desplazamiento; para la captura se la deja
  // crecer, así la segunda línea sale entera (sólo en la captura).
  const desplegar = () => bitacora.evaluate((b) => b.querySelectorAll("*").forEach((e) => {
    if (/(auto|scroll)/.test(getComputedStyle(e).overflowY)) { e.style.maxHeight = "none"; e.style.overflowY = "visible"; }
  }));
  await bitacora.locator("select").selectOption({ label: "Persona activada o desactivada" });
  await espera(page, 1500);
  await desplegar();
  const lineaDesactivado = bitacora.getByText(/^luis\.tienda@supermercado\.example: desactivado/).first();
  // El panel de Ajustes tiene su propio desplazamiento: la línea, al medio.
  await lineaDesactivado.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await espera(page, 300);
  await foto(page, C, "16b-bitacora-desactivado", { recorte: [bitacora.locator("select"), lineaDesactivado.locator("xpath=ancestor::*[contains(., '127.0.0.1')][1]")], margen: 12, marca: lineaDesactivado.locator("xpath=ancestor::*[contains(., '127.0.0.1')][1]") });
  await guardarTexto("16b-bitacora-desactivado", bitacora);
  await bitacora.locator("select").selectOption({ label: "Persona invitada" });
  await espera(page, 1500);
  await desplegar();
  const lineaInvitada = bitacora.getByText(/^sofia\.nueva@supermercado\.example: rol Administrador/).first();
  // El panel de Ajustes tiene su propio desplazamiento: la línea, al medio.
  await lineaInvitada.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await espera(page, 300);
  await foto(page, C, "16c-bitacora-invitada", { recorte: [bitacora.locator("select"), lineaInvitada.locator("xpath=ancestor::*[contains(., '127.0.0.1')][1]")], margen: 12, marca: lineaInvitada.locator("xpath=ancestor::*[contains(., '127.0.0.1')][1]") });
  await guardarTexto("16c-bitacora-invitada", bitacora);
  await bitacora.locator("select").selectOption({ label: "Todo" });
  await espera(page, 1500);
  await guardarTexto("16-bitacora-todo", bitacora);

  // Reporte de transparencia. Antes, una consulta del operador de RECABRA
  // (la lista de supermercados de su consola, como la abre cada día): así la
  // parte «3. Quién lo consultó» tiene una línea.
  {
    const op = await ingresar("operador@recabra.example", "Operador de prueba");
    const r = await fetch(`${BASE}/api/plataforma/clientes`, { headers: { authorization: `Bearer ${op.token}` } });
    if (!r.ok) throw new Error(`operador › clientes: ${r.status}`);
  }
  await boton(/Reporte de transparencia/, false).click();
  await page.waitForLoadState("networkidle");
  await espera(page, 2500);
  await foto(page, C, "15-reporte");
  await guardarTexto("15-reporte", page.locator("body"));
  const quien = page.getByRole("heading", { name: "3. Quién lo consultó" }).locator("xpath=..");
  await quien.scrollIntoViewIfNeeded();
  await foto(page, C, "15d-quien-lo-consulto", { recorte: quien, margen: 10 });
  await guardarTexto("15d-quien-lo-consulto", quien);
  const catalogo = page.getByRole("heading", { name: "1. Qué datos toma RECABRA y para qué" }).locator("xpath=..");
  await guardarTexto("15e-catalogo", catalogo);
  const derechos = page.getByRole("heading", { name: "4. Tus derechos" }).locator("xpath=..");
  await derechos.scrollIntoViewIfNeeded();
  await foto(page, C, "15c-tus-derechos", { recorte: derechos, margen: 10 });
  await guardarTexto("15c-tus-derechos", derechos);
  const aceptada = page.getByText(/versión aceptada/).first();
  if (await aceptada.count()) {
    const bloque = aceptada.locator("xpath=..");
    // Arriba de todo: la barra de «Volver» queda fija y taparía el principio.
    await page.evaluate(() => window.scrollTo(0, 0));
    await espera(page, 400);
    const titulo = page.getByText(/^Reporte de transparencia — /).first();
    await foto(page, C, "15b-reporte-fechas", { recorte: [titulo, bloque], margen: 14 });
    await guardarTexto("15b-reporte-fechas", bloque);
  }

  // Sedes (Ajustes › Sede y plano)
  await page.goto("/plano");
  await page.waitForLoadState("networkidle");
  await espera(page, 1500);
  await abrirAjustes(page, "sede");
  const sedes = page.locator("[data-bloque-ajustes=sedes]");
  await page.getByLabel("Nombre de la sede nueva").fill("NORTE");
  await foto(page, C, "17-agregar-sede", { recorte: sedes, margen: 8, marca: boton("Agregar sede", false) });
  await boton("Agregar sede", false).click();
  await espera(page, 2000);
  await foto(page, C, "18-sede-agregada", { recorte: sedes, margen: 8, marca: page.getByRole("button", { name: "Eliminar NORTE" }) });
  await guardarTexto("18-sede-agregada", sedes);
  await page.getByRole("button", { name: "Eliminar NORTE" }).click();
  await espera(page, 1200);
  const dBorrar = page.getByText("Eliminar la sede «NORTE»").locator("xpath=../..");
  await dBorrar.locator("input").fill("NORTE");
  await foto(page, C, "19-eliminar-sede", { recorte: dBorrar, margen: 8, marca: dBorrar.getByRole("button", { name: "Eliminar sede" }) });
  await guardarTexto("19-eliminar-sede", dBorrar);
  await dBorrar.getByRole("button", { name: "Eliminar sede" }).click();
  await espera(page, 2500);
  await foto(page, C, "20-papelera", { recorte: sedes, margen: 8, marca: page.getByRole("button", { name: /Restaurar/ }).first() });
  await guardarTexto("20-papelera", sedes);
  await page.getByRole("button", { name: /Restaurar/ }).first().click();
  await espera(page, 2500);
  await foto(page, C, "21-restaurada", { recorte: sedes, margen: 8 });
  await guardarTexto("21-restaurada", sedes);
  await page.context().close();

  // ── 2. El correo de invitación (el que armó el servidor) ─────────────────
  {
    const ctx = await nav.newContext({ viewport: { width: 760, height: 640 }, deviceScaleFactor: 2, locale: "es-CO" });
    const p = await ctx.newPage();
    await p.goto(correoDirecto("Invitación a Galerías", "sofia.nueva@"));
    await espera(p, 500);
    await foto(p, C, "05b-correo-invitacion", { recorte: p.locator("body"), margen: 0 });
    await guardarTexto("05b-correo-invitacion", p.locator("body"));
    await ctx.close();
  }

  // ── 3. El otro supermercado: suscripción y franja de pago pendiente ──────
  {
    const { page } = await abrirCon(nav, SESIONES.norte, { sede: "" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await espera(page, 2500);
    await foto(page, C, "30-franja-pago");
    await guardarTexto("30-franja-pago", page.locator("body"));
    await abrirAjustes(page, "cuenta");
    await espera(page, 500);
    await foto(page, C, "31-suscripcion", { recorte: page.locator(".ajustes-tema"), margen: 0 });
    await guardarTexto("31-suscripcion", page.locator(".ajustes-tema"));
    const fact = page.getByText("Datos de facturación", { exact: true }).locator("xpath=..");
    await fact.scrollIntoViewIfNeeded();
    await espera(page, 400);
    await foto(page, C, "32-facturacion", { recorte: fact, margen: 8 });
    await page.context().close();
  }

  // ── 4. Para comparar: Ana, administradora (no es dueña) ─────────────────
  {
    const { page } = await abrirCon(nav, SESIONES.ana);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await espera(page, 2000);
    if (await page.locator("[data-cajon]").count()) { await page.keyboard.press("Escape"); await espera(page, 500); }
    await abrirAjustes(page, "equipo");
    const listaAna = page.locator('[data-miembro="ana.admin@supermercado.example"]').locator("xpath=..");
    const rolAna = page.locator("[data-rol-invitar]");
    await foto(page, C, "40-ana-equipo", { recorte: [rolAna, listaAna], margen: 24, marca: [
      rolAna, page.locator('[data-miembro="diana.duena@supermercado.example"]'),
    ] });
    guardar("40-ana-roles", (await rolAna.locator("option").allInnerTexts()).join(" | "));
    await guardarTexto("40-ana-lista", listaAna);
    await page.locator("[data-tema=cuenta]").click();
    await espera(page, 2500);
    await guardarTexto("41-ana-cuenta", page.locator(".ajustes-tema"));
    await foto(page, C, "41-ana-tus-datos", { recorte: page.locator("[data-tus-datos]"), margen: 8 });
    await page.context().close();
  }

  // Una sesión de Ana abierta antes de que el ingreso dijera el rol (sin
  // `rolCliente`): ve los botones del dueño, y el servidor contesta el 403.
  {
    const { page } = await abrirCon(nav, SESIONES.ana, { sinRol: true });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await espera(page, 2000);
    if (await page.locator("[data-cajon]").count()) { await page.keyboard.press("Escape"); await espera(page, 500); }
    await abrirAjustes(page, "cuenta");
    await espera(page, 1500);
    await guardarTexto("42-sesion-vieja-cuenta", page.locator(".ajustes-tema"));
    const b = page.getByRole("button", { name: /Descargar los datos del supermercado/ });
    if (await b.count()) {
      await b.click();
      await espera(page, 2500);
      await guardarTexto("42-sesion-vieja-tus-datos", page.locator("[data-tus-datos]"));
    }
    await page.context().close();
  }

  await nav.close();
  console.log("listo · textos en", TEXTOS);
})().catch((e) => { console.error(e); process.exit(1); });
