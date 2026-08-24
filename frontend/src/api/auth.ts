import client from "./client";
import type { Role } from "../store/authStore";

export interface LoginResponse {
  token: string;
  role: Role;
}

/** Exchange an access password for a session token.
 *  The backend decides the role by which password matched. */
export const login = (password: string): Promise<LoginResponse> =>
  client.post<LoginResponse>("/auth/login", { password }).then((r) => r.data);

/** Admin only — update either access password. */
export const updatePasswords = (payload: {
  admin_password?: string;
  worker_password?: string;
}): Promise<void> => client.put("/auth/passwords", payload).then(() => undefined);

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
