import client from "./client";
import type { Role } from "../store/authStore";

// ─── Alta self-service (Fase 2 clientes) ────────────────────────────────────
//
// Un usuario Firebase SIN membresías puede fundar su propio supermercado y
// nacer owner. El endpoint no exige JWT propio — recibe el `id_token` de
// Firebase directo, con la misma vara de correo confiable que `/auth/oauth`.
// Shape fijado por el contrato vinculante de la Fase 2
// (features/clientes/outputs/equipo-fase-2.md §2.2 A) — no se ajusta a ojo.

export interface AltaClientePayload {
  id_token: string;
  slug: string;
  nombre: string;
  /** Fase 3 compliance: sin `true` el backend contesta 422 antes de fundar
   *  nada — "sin aceptación no hay alta" (spec). */
  acepta_politica: boolean;
}

/** Superset de `OauthOk` (api/auth.ts) con `cliente_nombre` puesto: acá SÍ
 *  viene directo del backend porque el cliente se acaba de crear — no hay
 *  lista previa de la que sacarlo, como sí pasa después de un oauth normal. */
export interface AltaClienteResponse {
  token: string;
  role: Role;
  cliente: string;
  cliente_nombre: string;
  email: string;
  nombre: string;
}

export const altaCliente = (payload: AltaClientePayload): Promise<AltaClienteResponse> =>
  client.post<AltaClienteResponse>("/clientes/alta", payload).then((r) => r.data);

/** Mismo régimen que `crear_cliente()` en el backend: minúsculas, sin
 *  tildes ni espacios, arranca con una letra. */
export const SLUG_VALIDO = /^[a-z][a-z0-9_]{1,30}$/;

/** Slug sugerido en vivo a partir del nombre — la persona lo puede editar
 *  después, esto sólo evita que tenga que inventarlo de cero.
 *
 *  Quita tildes, baja a minúsculas, cambia todo lo que no sea `[a-z0-9]` por
 *  `_`, recorta los `_` de las puntas y, si el resultado no arranca con una
 *  letra (nombre que empieza con número, o queda vacío), le antepone `c` —
 *  la regla del backend no admite otra cosa en la primera posición. */
// U+0300–U+036F: marcas diacríticas combinantes que deja `normalize("NFD")`.
const DIACRITICOS = /[̀-ͯ]/g;

export function sugerirSlug(nombre: string): string {
  let s = nombre
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 31);
  if (!/^[a-z]/.test(s)) s = `c${s}`;
  if (s.length < 2) s = `${s}x`;
  return s.slice(0, 31);
}
