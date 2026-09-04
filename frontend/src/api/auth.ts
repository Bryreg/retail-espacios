import client from "./client";
import type { Role } from "../store/authStore";

export interface LoginResponse {
  token: string;
  role: Role;
  cliente: string;
  cliente_nombre: string;
}

/** Un supermercado que usa el sistema, para el selector de la pantalla de ingreso. */
export interface ClienteBreve {
  slug: string;
  nombre: string;
}

/** La lista de supermercados. Pública porque hay que mostrarla ANTES de que
 *  nadie se identifique; sólo trae código y nombre. */
export const getClientes = (): Promise<ClienteBreve[]> =>
  client.get<ClienteBreve[]>("/auth/clientes").then((r) => r.data);

/** Exchange an access password for a session token.
 *  The backend decides the role by which password matched.
 *
 *  El supermercado va explícito y **nunca se deduce de la contraseña**: si dos
 *  clientes eligieran la misma, el sistema entraría al que revise primero. */
export const login = (password: string, cliente?: string): Promise<LoginResponse> =>
  client
    .post<LoginResponse>("/auth/login", cliente ? { password, cliente } : { password })
    .then((r) => r.data);

// ─── Login con Google/correo (Firebase) ─────────────────────────────────────
//
// El shape exacto lo fija el contrato de la Fase 1 de identidad — el backend
// lo implementa en paralelo contra el mismo documento, así que esto NO se
// ajusta a ojo mirando una respuesta real.

/** Una membresía activa de la persona que acaba de loguearse, cuando tiene
 *  más de una y hay que preguntar en cuál entra. */
export interface Membresia {
  cliente: string;
  /** Nombre visible del supermercado — el mismo que trae `getClientes()`. */
  nombre: string;
  rol: "owner" | "admin" | "worker";
}

/** Éxito: una sola membresía activa (o ya se mandó `cliente` y es válida). */
export interface OauthOk {
  token: string;
  role: Role;
  cliente: string;
  email: string;
  nombre: string;
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
 *  lo manda. */
export const loginOauth = (idToken: string, cliente?: string): Promise<OauthResponse> =>
  client
    .post<OauthResponse>("/auth/oauth", cliente ? { id_token: idToken, cliente } : { id_token: idToken })
    .then((r) => r.data);

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

export interface PasswordsResponse {
  ok: boolean;
  /** Sólo viene cuando el admin cambió SU propia clave.
   *
   *  Cambiar una clave cierra las sesiones abiertas de ese rol —para eso se
   *  cambia—, así que el token con el que se guardó acaba de morir. El backend
   *  devuelve uno nuevo para no echar de la pantalla a quien acaba de guardar. */
  token: string | null;
}

/** Admin only — update either access password. */
export const updatePasswords = (payload: {
  admin_password?: string;
  worker_password?: string;
}): Promise<PasswordsResponse> =>
  client.put<PasswordsResponse>("/auth/passwords", payload).then((r) => r.data);

export interface NotificationConfig {
  notify_emails: string;   // comma-separated recipient list
  reminder_days: string;   // comma-separated day thresholds, e.g. "30,15,7,1"
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
