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
