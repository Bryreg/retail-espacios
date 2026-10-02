import client from "./client";
import type { AvisoCuenta, Role, RolCliente } from "../store/authStore";

// ─── Login con Google/correo (Firebase) ─────────────────────────────────────
//
// El shape exacto lo fija el contrato de la Fase 1 de identidad — el backend
// lo implementa en paralelo contra el mismo documento, así que esto NO se
// ajusta a ojo mirando una respuesta real.

/** Una membresía activa de la persona que acaba de loguearse, cuando tiene
 *  más de una y hay que preguntar en cuál entra. */
export interface Membresia {
  cliente: string;
  /** Nombre visible del supermercado. */
  nombre: string;
  rol: RolCliente;
}

/** Éxito: una sola membresía activa (o ya se mandó `cliente` y es válida). */
export interface OauthOk {
  token: string;
  role: Role;
  cliente: string;
  /** Nombre visible del supermercado y el rol de la persona en él
   *  (2026-10-02; antes el nombre salía de la lista pública `/auth/clientes`,
   *  que se fue). Ausentes en la sesión de plataforma. */
  cliente_nombre?: string;
  rol_cliente?: RolCliente;
  email: string;
  nombre: string;
  /** Fase 2 clientes: presente en `gracia`/`solo_lectura` para cualquier
   *  rol, y en `suspendido` sólo para el owner (worker/admin dan 402 antes
   *  de llegar acá). */
  aviso_cuenta?: AvisoCuenta;
  /** Fase 3 compliance: presente y en `true` cuando esta cuenta ya tenía
   *  membresía pero nunca aceptó la versión vigente de la Política de
   *  Tratamiento de Datos. No bloquea el login — el frontend avisa una vez. */
  pedir_consentimiento?: boolean;
  /** Fase 4 plataforma: presente y en `true` cuando la cuenta es operadora
   *  de la plataforma (email en `OPERADOR_EMAILS`) y NO tiene ninguna
   *  membresía. Reemplaza, sólo para operadores, la rama que antes ofrecía
   *  "fundá tu supermercado" ante el 403 -- esa rama sigue existiendo tal
   *  cual para cualquier cuenta que NO sea operadora. `cliente` viene como
   *  `"plataforma"` (no es un supermercado real; no tiene tarifas ni layout) y el aterrizaje es directo a `/plataforma`,
   *  resuelto en `Login.tsx` antes de guardar la sesión. */
  plataforma?: boolean;
}

/** Varias membresías activas y sin `cliente`: hay que elegir y repetir el
 *  POST con el elegido. */
export interface OauthRequiereCliente {
  requiere_cliente: true;
  membresias: Membresia[];
}

export type OauthResponse = OauthOk | OauthRequiereCliente;

export const esRequiereCliente = (r: OauthResponse): r is OauthRequiereCliente =>
  (r as OauthRequiereCliente).requiere_cliente === true;

/** Intercambia un ID token de Firebase por la sesión propia. `cliente` va
 *  sólo cuando ya se sabe cuál — la primera llamada de un login nuevo nunca
 *  lo manda. `aceptaPolitica` va en `true` sólo en el reintento que sigue al
 *  428 de "consentimiento_requerido" (ver `esConsentimientoRequerido`) —
 *  Fase 3 compliance. */
export const loginOauth = (
  idToken: string,
  cliente?: string,
  aceptaPolitica?: boolean,
  invitacion?: string
): Promise<OauthResponse> =>
  client
    .post<OauthResponse>("/auth/oauth", {
      id_token: idToken,
      ...(cliente ? { cliente } : {}),
      ...(aceptaPolitica ? { acepta_politica: true } : {}),
      ...(invitacion ? { invitacion } : {}),
    })
    .then((r) => r.data);

// ─── El enlace de la invitación (2026-09-23) ────────────────────────────────
//
// El correo apunta a `/login?invitacion=<token>`. Antes nadie leía ese token:
// quien entraba con otra cuenta que la invitada terminaba «sin acceso» y con
// el formulario de fundar un supermercado adelante. Ahora la pantalla muestra
// a qué supermercado y con qué cuenta entrar, y `/oauth` lleva a ese
// supermercado o explica por qué no.

export interface InvitacionVista {
  estado: "vigente" | "usada" | "vencida";
  cliente_nombre: string;
  rol: "owner" | "admin" | "worker";
  /** Enmascarado por el backend: `b•••o@gmail.com`. */
  correo: string;
  expira_en: string;
}

export const verInvitacion = (token: string): Promise<InvitacionVista> =>
  client.get<InvitacionVista>(`/auth/invitacion/${encodeURIComponent(token)}`).then((r) => r.data);

/** Lo que `/oauth` contesta cuando el enlace no lleva a ninguna parte: otra
 *  cuenta que la invitada, invitación vencida o inexistente, o un acceso que
 *  ya estaba y lo desactivaron. `mensaje` viene redactado para la persona. */
export interface ErrorDeInvitacion {
  codigo: "invitacion_otro_correo" | "invitacion_vencida" | "invitacion_invalida" | "invitacion_sin_acceso";
  mensaje: string;
  correo?: string;
  cliente_nombre?: string;
}

export function esErrorDeInvitacion(err: unknown): ErrorDeInvitacion | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const codigo = (detail as { codigo?: unknown }).codigo;
  return typeof codigo === "string" && codigo.startsWith("invitacion_") ? (detail as ErrorDeInvitacion) : null;
}

// ─── Consentimiento a la Política de Tratamiento de Datos (Fase 3) ─────────

/** Cuerpo del 428 que `/auth/oauth` contesta cuando el canje de una
 *  invitación pendiente iba a crear una membresía nueva y esta cuenta
 *  todavía no aceptó la versión vigente de la política. */
export interface ConsentimientoRequerido {
  codigo: "consentimiento_requerido";
  version: string;
}

/** ¿Este error de `loginOauth` es el 428 de "hace falta aceptar la
 *  política"? Se usa para mostrar el modal de aceptación en vez del error
 *  genérico, y para saber con qué reintentar. */
export function esConsentimientoRequerido(err: unknown): ConsentimientoRequerido | null {
  const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (resp?.status !== 428) return null;
  const detail = resp.data?.detail;
  if (detail && typeof detail === "object" && (detail as { codigo?: unknown }).codigo === "consentimiento_requerido") {
    return detail as ConsentimientoRequerido;
  }
  return null;
}

/** Registra la aceptación para una cuenta con sesión ya abierta —lo llama
 *  el modal que dispara `pedir_consentimiento` en la respuesta del login.
 *  204 sin cuerpo; idempotente del lado del servidor. */
export const aceptarPolitica = (): Promise<void> =>
  client.post("/auth/aceptar-politica").then(() => undefined);

// ─── Gestión de usuarios (admin) ────────────────────────────────────────────

export interface Miembro {
  id: number;
  email: string;
  nombre: string | null;
  rol: "owner" | "admin" | "worker";
  activo: boolean;
  ultimo_login: string | null;
}

export interface InvitacionPendiente {
  email: string;
  rol: "owner" | "admin" | "worker";
  expira_en: string;
}

export interface UsuariosResponse {
  miembros: Miembro[];
  invitaciones: InvitacionPendiente[];
}

export const getUsuarios = (): Promise<UsuariosResponse> =>
  client.get<UsuariosResponse>("/usuarios").then((r) => r.data);

export interface InvitarPayload {
  email: string;
  rol: "owner" | "admin" | "worker";
}

export const invitarUsuario = (payload: InvitarPayload): Promise<{ ok: boolean; expira_en: string }> =>
  client.post<{ ok: boolean; expira_en: string }>("/usuarios/invitar", payload).then((r) => r.data);

/** Activa o desactiva la membresía de esa persona EN el cliente del token
 *  de quien llama. Desactivar le corta el acceso YA: el siguiente request
 *  de esa persona da 401 (revocación por request, no espera a que expire
 *  el JWT). El endpoint devuelve sólo `{ok}` — no la fila actualizada —,
 *  así que quien llama actualiza su propia copia local del miembro. */
export const setMiembroActivo = (usuarioId: number, activo: boolean): Promise<{ ok: boolean }> =>
  client.patch<{ ok: boolean }>(`/usuarios/${usuarioId}`, { activo }).then((r) => r.data);


export interface NotificationConfig {
  notify_emails: string;   // comma-separated recipient list
  reminder_days: string;   // comma-separated day thresholds, e.g. "30,15,6"
}

export const getNotificationConfig = (): Promise<NotificationConfig> =>
  client.get<NotificationConfig>("/notifications/config").then((r) => r.data);

export const updateNotificationConfig = (
  payload: Partial<NotificationConfig>
): Promise<NotificationConfig> =>
  client.put<NotificationConfig>("/notifications/config", payload).then((r) => r.data);

/** Admin only — sends a test email to the configured recipients. */
export const sendTestNotification = (): Promise<{ ok: boolean; detail: string }> =>
  client.post("/notifications/test").then((r) => r.data);

// ─── Contact book ────────────────────────────────────────────────────────────

/** Who gets told what. The merchandiser is the one role that never receives
 *  money, so the split is not cosmetic — it is the same rule the rest of the
 *  app enforces for workers. */
export interface SedeContacts {
  admin: string[];
  mercaderista: string[];
}

export interface ContactBook {
  /** Operational manager — supervises every sede admin, so one list for all. */
  gerente: string[];
  by_sede: Record<string, SedeContacts>;
}

export const getContacts = (): Promise<ContactBook> =>
  client.get<ContactBook>("/notifications/contacts").then((r) => r.data);

export const saveContacts = (book: ContactBook): Promise<ContactBook> =>
  client.put<ContactBook>("/notifications/contacts", book).then((r) => r.data);

export interface RecipientPreview {
  sede?: string | null;
  /** Gets the commercial summary, money included. */
  comercial: string[];
  /** Gets the work order, no money. */
  montaje: string[];
  smtp_listo: boolean;
}

/** Who would be notified if a contract were saved in this sede — asked BEFORE
 *  saving, so nobody hangs up the phone believing an alert went out. */
export const previewRecipients = (sede: string): Promise<RecipientPreview> =>
  client
    .get<RecipientPreview>("/notifications/recipients", { params: { sede } })
    .then((r) => r.data);

// ─── Bitácora ────────────────────────────────────────────────────────────────

/** Una línea de "quién hizo qué".
 *
 *  El `titulo` viene armado del servidor a partir del código: si la frase se
 *  guardara al escribir, cambiar la redacción reescribiría el pasado. */
export interface LineaBitacora {
  id: number;
  at: string;
  rol: string;
  ip: string;
  accion: string;
  titulo: string;
  entidad?: string | null;
  entidad_id?: string | null;
  detalle?: string | null;
}

export const getBitacora = (params?: { limite?: number; accion?: string }): Promise<LineaBitacora[]> =>
  client.get<LineaBitacora[]>("/bitacora/", { params }).then((r) => r.data);

/** Código → nombre en español, para el filtro. */
export const getAccionesBitacora = (): Promise<Record<string, string>> =>
  client.get<Record<string, string>>("/bitacora/acciones").then((r) => r.data);
