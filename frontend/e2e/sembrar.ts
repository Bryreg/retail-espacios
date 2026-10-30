/**
 * La siembra de los recorridos E2E: TODO por la API real, como lo haría la
 * pantalla (nada escrito a mano en la base, nada en la base del repo). Cada
 * recorrido arma su propia sede con un nombre único, así los recorridos no se
 * pisan entre sí aunque compartan el servidor.
 */
import { createHmac, randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { JWT_SECRET_E2E } from "./constantes.mjs";

export const CLAVE_ADMIN = process.env.E2E_ADMIN_PASSWORD || "clave-admin-e2e";
export const CLAVE_WORKER = process.env.E2E_WORKER_PASSWORD || "clave-worker-e2e";

export interface Sesion {
  token: string;
  role: "admin" | "worker";
  cliente: string;
  cliente_nombre: string;
}

/** El ingreso por clave (`LOGIN_LEGADO=1`, sólo en la prueba). */
export async function entrar(api: APIRequestContext, rol: "admin" | "worker"): Promise<Sesion> {
  const r = await api.post("/api/auth/login", { data: { password: rol === "admin" ? CLAVE_ADMIN : CLAVE_WORKER } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

const con = (s: Sesion) => ({ Authorization: `Bearer ${s.token}` });

/** Deja la sesión en el navegador como la deja el ingreso (`retail-auth-v1`),
 *  y la sede elegida en el plano, ANTES de que cargue la app. */
export async function sesionEnElNavegador(page: Page, s: Sesion, sede?: string) {
  await page.addInitScript(([ses, sedeElegida]) => {
    // Sólo la primera vez de cada pestaña: un «Salir» o un 401 a mitad del
    // recorrido no tienen que resucitar la sesión al recargar.
    if (sessionStorage.getItem("e2e-sembrada")) return;
    sessionStorage.setItem("e2e-sembrada", "1");
    localStorage.setItem("retail-auth-v1", JSON.stringify({
      state: {
        token: ses.token, role: ses.role, cliente: ses.cliente, clienteNombre: ses.cliente_nombre,
        rolCliente: null, email: null, nombre: null, avisoCuenta: null, pedirConsentimiento: false, plataforma: false,
      },
      version: 0,
    }));
    if (sedeElegida) {
      // `clienteCache`: si no, `scopeToCliente` descarta lo local (y la sede
      // elegida) por creerlo de otro supermercado.
      localStorage.setItem("retail-fixtures-v1", JSON.stringify({ state: { sede: sedeElegida, sedes: [sedeElegida], clienteCache: ses.cliente }, version: 0 }));
    }
  }, [s, sede ?? ""] as const);
}

/** Un nombre de sede propio de cada recorrido (mayúsculas, sin espacios). */
export function sedeUnica(prefijo: string): string {
  return `${prefijo}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export interface Mueble {
  id: string; code: string; sede: string; type: string; label: string;
  cx: number; cz: number; rotY: number; w: number; d: number; h: number; color: string;
  [k: string]: unknown;
}

/** Una góndola doble entera (sin partes): se vende por cara. */
export const gondola = (sede: string, code: string, cx: number): Mueble => ({
  id: `f-${sede}-${code}`, code, sede, type: "gondola", gondolaType: "double", label: `Góndola ${code}`,
  cx, cz: 3, rotY: 0, w: 2.4, d: 0.9, h: 1.8, color: "#818cf8",
});

/** Una góndola que se vende por participación (% de la cara). */
export const gondolaPorParticipacion = (sede: string, code: string, cx: number): Mueble => ({
  ...gondola(sede, code, cx), partes: { division: "participacion" },
});

/** El plano de la sede y la lista de sedes (para que la app la ofrezca). */
export async function plano(api: APIRequestContext, s: Sesion, sede: string, muebles: Mueble[]) {
  const r = await api.put(`/api/layout/${encodeURIComponent(sede)}`, {
    headers: con(s), data: { fixtures: muebles, base_updated_at: null },
  });
  expect(r.status(), await r.text()).toBe(200);
  const actual = await (await api.get("/api/layout/settings", { headers: con(s) })).json();
  const sedes = [...new Set([...(actual.sedes ?? []), sede])];
  const r2 = await api.put("/api/layout/settings", {
    headers: con(s), data: { sedes, catalog_labels: actual.catalog_labels ?? {}, base_updated_at: actual.updated_at ?? null },
  });
  expect([200, 409]).toContain(r2.status());
}

export const isoDentroDe = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Un contrato entero por la misma ruta que «Guardar contrato» de Vender. */
export async function venderEntera(api: APIRequestContext, s: Sesion, sede: string, espacio: string, o: {
  proveedor: string; valor: number; desde?: string; hasta?: string;
}) {
  const r = await api.post("/api/contratos/vender", {
    headers: con(s),
    data: {
      sede, proveedor: o.proveedor, correo: "compras@ejemplo.co", marca: o.proveedor, tipo: "contrato",
      desde: o.desde ?? isoDentroDe(-5), hasta: o.hasta ?? isoDentroDe(60),
      lineas: [{ espacio, valor: o.valor, modo_precio: "total", valor_tecleado: o.valor }],
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

/** Un contrato por participación (% de la cara), como lo guarda Vender. */
export async function venderParticipacion(api: APIRequestContext, s: Sesion, sede: string, cara: string, o: {
  proveedor: string; puntosBasicos: number; valor: number; desde?: string; hasta?: string;
}) {
  const r = await api.post("/api/contratos/vender", {
    headers: con(s),
    data: {
      sede, proveedor: o.proveedor, correo: "compras@ejemplo.co", marca: o.proveedor, tipo: "contrato",
      desde: o.desde ?? isoDentroDe(-5), hasta: o.hasta ?? isoDentroDe(60),
      lineas: [{
        participacion: { cara, puntos_basicos: o.puntosBasicos, renueva: null },
        valor: o.valor, modo_precio: "total", valor_tecleado: o.valor,
      }],
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

export const conSesion = con;

/** El enlace del correo de montaje (`/?montar=…&t=…`), firmado como lo firma
 *  `bulk_leases._enlace_de_montaje` (`auth.create_mount_token`): en la prueba
 *  no sale ningún correo, así que se arma acá con el secreto de la prueba. */
export function enlaceDeMontaje(codigo: string, cliente: string, contrato: number): string {
  const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");
  const cabecera = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64(JSON.stringify({
    role: "montaje", code: codigo.toUpperCase(), cliente, contrato,
    exp: Math.floor(Date.now() / 1000) + 30 * 86400, jti: randomBytes(16).toString("hex"),
  }));
  const firma = createHmac("sha256", JWT_SECRET_E2E).update(`${cabecera}.${cuerpo}`).digest("base64url");
  return `/?montar=${encodeURIComponent(codigo)}&t=${cabecera}.${cuerpo}.${firma}`;
}

/** Lo que dice la base de un espacio (lo que lee el plano). */
export async function comercial(api: APIRequestContext, s: Sesion): Promise<Record<string, {
  status: string; supplierName?: string; negotiatedValue?: number | null; endDate?: string; leaseId?: number;
}>> {
  const r = await api.get("/api/spaces/comercial", { headers: con(s) });
  expect(r.status()).toBe(200);
  return r.json();
}
