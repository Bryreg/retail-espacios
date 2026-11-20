/**
 * Lo que comparten los guiones de captura de los manuales: entrar como un rol
 * en la copia de prueba (`servidor.sh` + `sembrar.py`), abrir un navegador de
 * computador o de celular, marcar el botón o el campo de cada paso y guardar
 * la captura.
 *
 * Usa el Playwright instalado en la máquina (`require("playwright")`).
 */
const { chromium } = require("playwright");
const { createHmac, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PUERTO = Number(process.env.MANUAL_PUERTO || 8790);
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRETO = "manual-solo-para-la-base-descartable-de-las-capturas-xxxxxxxxxxxx";
const CLAVES = { admin: "admin-manual", worker: "trabajador-manual" };
const IMG = path.resolve(__dirname, "..", "img");
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, `datos-de-la-siembra-${PUERTO}.json`), "utf8"));

/** Chromium en español de Colombia: así los campos de fecha dicen dd/mm/aaaa. */
function lanzar() {
  return chromium.launch({ args: ["--lang=es-CO"], env: { ...process.env, LANG: "es_CO.UTF-8", LANGUAGE: "es_CO" } });
}

async function entrar(rol) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: CLAVES[rol] }),
  });
  if (!r.ok) throw new Error(`login ${rol}: ${r.status}`);
  return r.json();
}

/** Un navegador con la sesión del rol ya puesta (como la deja el ingreso). */
async function abrir(navegador, rol, { celular = false, escala = 2 } = {}) {
  const opciones = celular
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: escala, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: escala };
  const contexto = await navegador.newContext({
    ...opciones, locale: "es-CO", timezoneId: "America/Bogota", baseURL: BASE, colorScheme: "light",
  });
  if (rol) {
    const s = await entrar(rol);
    await contexto.addInitScript(([ses]) => {
      if (sessionStorage.getItem("manual-sembrada")) return;
      sessionStorage.setItem("manual-sembrada", "1");
      localStorage.setItem("retail-auth-v1", JSON.stringify({
        state: {
          token: ses.token, role: ses.role, cliente: ses.cliente, clienteNombre: ses.cliente_nombre,
          rolCliente: null, email: null, nombre: null, avisoCuenta: null, pedirConsentimiento: false, plataforma: false,
        },
        version: 0,
      }));
      localStorage.setItem("retail-fixtures-v1", JSON.stringify({
        state: { sede: "CENTRO", sedes: ["CENTRO"], clienteCache: ses.cliente }, version: 0,
      }));
      // Sin la guía de primeros pasos ni avisos de bienvenida tapando la pantalla.
      localStorage.setItem("recabra-config-inicial-vista", "1");
    }, [s]);
  }
  const page = await contexto.newPage();
  page.setDefaultTimeout(20_000);
  return { contexto, page };
}

/** El enlace del correo de montaje, firmado como lo firma el servidor. */
function enlaceDeMontaje(codigo, contrato, cliente = "galerias") {
  const b64 = (x) => Buffer.from(x).toString("base64url");
  const cabecera = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64(JSON.stringify({
    role: "montaje", code: codigo.toUpperCase(), cliente, contrato,
    exp: Math.floor(Date.now() / 1000) + 30 * 86400, jti: randomBytes(16).toString("hex"),
  }));
  const firma = createHmac("sha256", SECRETO).update(`${cabecera}.${cuerpo}`).digest("base64url");
  return `/?montar=${encodeURIComponent(codigo)}&t=${cabecera}.${cuerpo}.${firma}`;
}

/** La caja de un elemento en coordenadas de la PÁGINA (no de la ventana). */
async function enPagina(page, loc) {
  const b = await loc.boundingBox();
  if (!b) return null;
  const { sx, sy } = await page.evaluate(() => ({ sx: window.scrollX, sy: window.scrollY }));
  return { x: b.x + sx, y: b.y + sy, width: b.width, height: b.height };
}

/**
 * Marca uno o varios elementos con un recuadro naranja y su número (1, 2…),
 * como en un manual impreso. Devuelve una función que los quita.
 */
async function marcar(page, objetivos) {
  const lista = Array.isArray(objetivos) ? objetivos : [objetivos];
  const cajas = [];
  for (const o of lista) {
    const loc = o.loc ?? o;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await enPagina(page, loc);
    if (!b) throw new Error(`No se ve lo que hay que marcar: ${loc}`);
    cajas.push({ ...b, n: o.n ?? null });
  }
  await page.evaluate((cajas) => {
    for (const c of cajas) {
      const d = document.createElement("div");
      d.className = "manual-marca";
      Object.assign(d.style, {
        position: "absolute", left: `${c.x - 5}px`, top: `${c.y - 5}px`, width: `${c.width + 10}px`, height: `${c.height + 10}px`,
        border: "4px solid #F97316", borderRadius: "10px", boxShadow: "0 0 0 3px rgba(255,255,255,.9)",
        zIndex: 2147483647, pointerEvents: "none",
      });
      document.body.appendChild(d);
      if (c.n !== null) {
        const n = document.createElement("div");
        n.className = "manual-marca";
        n.textContent = String(c.n);
        Object.assign(n.style, {
          position: "absolute", left: `${c.x - 18}px`, top: `${c.y - 18}px`, width: "28px", height: "28px",
          borderRadius: "50%", background: "#F97316", color: "#fff", font: "700 16px/28px system-ui, sans-serif",
          textAlign: "center", zIndex: 2147483647, pointerEvents: "none", boxShadow: "0 0 0 3px #fff",
        });
        document.body.appendChild(n);
      }
    }
  }, cajas);
  return () => page.evaluate(() => document.querySelectorAll(".manual-marca").forEach((x) => x.remove()));
}

/**
 * Guarda la captura `img/<carpeta>/<nombre>.jpg`. Con `marca` dibuja el
 * recuadro; con `recorte` (un locator) recorta alrededor de esa zona.
 */
async function foto(page, carpeta, nombre, { marca, recorte, margen = 16, completa = false } = {}) {
  const dir = path.join(IMG, carpeta);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(350);
  const quitar = marca ? await marcar(page, marca) : null;
  const opciones = { path: path.join(dir, `${nombre}.jpg`), type: "jpeg", quality: 82, animations: "disabled" };
  if (recorte) {
    const b = await enPagina(page, recorte);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    const x = Math.max(0, b.x - margen), y = Math.max(0, b.y - margen);
    opciones.fullPage = true;
    opciones.clip = { x, y, width: Math.min(ancho - x, b.width + 2 * margen), height: b.height + 2 * margen };
  } else if (completa) {
    opciones.fullPage = true;
  }
  await page.screenshot(opciones);
  if (quitar) await quitar();
  console.log(`  📷 ${carpeta}/${nombre}.jpg`);
}

/** Un correo REAL de la cola de la copia de prueba, en un HTML para abrir y
 *  capturar (`correo.py`). La base es la de `levantar.sh` (MANUAL_TMP). */
function correoReal(asunto, texto) {
  const { execFileSync } = require("node:child_process");
  const base = path.join(process.env.MANUAL_TMP || "/tmp", `bd-${PUERTO}`, "manual.db");
  const salida = path.join(require("node:os").tmpdir(), `correo-${PUERTO}-${Date.now()}.html`);
  execFileSync("python3", [path.join(__dirname, "correo.py"), base, asunto, texto, salida]);
  return "file://" + salida;
}

module.exports = { chromium, lanzar, BASE, DATOS, abrir, correoReal, entrar, enlaceDeMontaje, marcar, foto };
