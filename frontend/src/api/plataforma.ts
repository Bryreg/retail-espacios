import client from "./client";

// ─── Panel del operador de plataforma (Fase 2 clientes) ─────────────────────
//
// Shapes fijados por el contrato vinculante de la Fase 2
// (features/clientes/outputs/equipo-fase-2.md §2.2 B/C/D). Sólo datos del
// registro — nunca dinero ni datos de negocio de un cliente.

/** ¿Esta cuenta es operador de plataforma? El legado (token sin email)
 *  siempre da `false` — no hace falta filtrarlo antes de preguntar, el
 *  backend ya lo resuelve así. */
export const soyOperador = (): Promise<boolean> =>
  client.get<{ operador: boolean }>("/plataforma/soy").then((r) => r.data.operador);

export type EstadoCuenta = "activo" | "gracia" | "solo_lectura" | "suspendido";

export const ESTADOS_CUENTA: EstadoCuenta[] = ["activo", "gracia", "solo_lectura", "suspendido"];

export interface ClientePlataforma {
  slug: string;
  nombre: string;
  activo: boolean;
  estado: EstadoCuenta;
  motivo: string | null;
  cambiado_en: string | null;
  cambiado_por: string | null;
}

/** Todos los clientes del registro con su estado — 403 si quien pregunta no
 *  es operador. **Nunca se guarda en localStorage**: es la lista completa de
 *  clientes de la plataforma, y persistirla filtraría eso entre sesiones de
 *  la misma máquina (ver guardrail en el mismo espíritu que `referenceRates`
 *  en `store/fixtureStore.ts`). Vive sólo en el estado del componente que la
 *  pide, tan fresca como la última vez que se abrió el panel. */
export const getClientesPlataforma = (): Promise<ClientePlataforma[]> =>
  client
    .get<{ clientes: ClientePlataforma[] }>("/plataforma/clientes")
    .then((r) => r.data.clientes);

export interface CambiarEstadoPayload {
  estado: EstadoCuenta;
  motivo: string;
}

/** La fila actualizada — sin `nombre` ni `activo`: quien llama ya los tiene
 *  y los conserva al mezclar la respuesta en su copia local. */
export interface EstadoClienteActualizado {
  slug: string;
  estado: EstadoCuenta;
  motivo: string;
  cambiado_en: string;
  cambiado_por: string;
}

export const patchEstadoCliente = (
  slug: string,
  payload: CambiarEstadoPayload
): Promise<EstadoClienteActualizado> =>
  client
    .patch<EstadoClienteActualizado>(`/plataforma/clientes/${encodeURIComponent(slug)}`, payload)
    .then((r) => r.data);
