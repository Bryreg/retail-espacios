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
