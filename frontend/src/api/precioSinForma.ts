import client from "./client";

/**
 * Contratos cargados antes de Vender: ¿su valor era del mes o del total?
 * (2026-10-25, `services/precio_sin_forma.py`). Sólo administración y sólo
 * Supervisar: Vender no alcanza este módulo. No manda correos.
 */

export type EstadoDelContrato = "vigente" | "proximo" | "vencido" | "cerrado";

export interface ContratoSinForma {
  lease_id: number;
  /** «GON-02», «PUN-03-EN1» (sin la sede). */
  espacio: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** Lo guardado, que hoy se lee como el total. */
  valor: number;
  meses: number;
  /** Lo que quedaría de total si el valor es el de cada mes. */
  total_si_es_al_mes: number;
  estado: EstadoDelContrato;
}

export const contratosSinForma = (sede: string): Promise<ContratoSinForma[]> =>
  client.get<{ contratos: ContratoSinForma[] }>("/contratos/precio-sin-forma", { params: { sede } }).then((r) => r.data.contratos);

export const corregirPrecio = (
  modo: "mensual" | "total", contratos: { lease_id: number; valor: number }[],
): Promise<{ corregidos: number[]; modo: "mensual" | "total" }> =>
  client.post<{ corregidos: number[]; modo: "mensual" | "total" }>("/contratos/precio-sin-forma/corregir", { modo, contratos })
    .then((r) => r.data);

export const deshacerPrecio = (lease_ids: number[]): Promise<{ deshechos: number[] }> =>
  client.post<{ deshechos: number[] }>("/contratos/precio-sin-forma/deshacer", { lease_ids }).then((r) => r.data);
