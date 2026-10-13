import client from "./client";
import type { EstadoCuentaAviso } from "../store/authStore";

// ─── La suscripción, vista por el supermercado (C2, 2026-10-13) ─────────────
//
// Dos puertas, las dos EXENTAS del corte por estado de cuenta en el backend
// (`_EXENTOS_PARA_PONERSE_AL_DIA` en `backend/app/clientes.py`): justamente
// tienen que contestar con la cuenta en sólo lectura o suspendida.
//
//   · `GET /auth/estado-cuenta` — el estado en vivo, para CUALQUIER rol. El
//     motivo, sólo para la dueña. Sin plata. Lo consultan `BloqueoCuenta` y la
//     franja cada pocos minutos, para que la pantalla se entere de que la
//     cuenta volvió a estar al día sin que nadie vuelva a entrar.
//   · `/clientes/mi-suscripcion` — lo que RECABRA le cobra: plata y cuentas de
//     cobro. **Sólo la dueña** (membresía `owner`; su gente recibe 403), y en
//     pantalla sólo en Configuración → Suscripción o tras un clic en «Ver
//     suscripción»: nunca en la franja ni en la pantalla de bloqueo, que se ven
//     en Vender, delante de proveedores.
//
// Sin pasarela: se paga por transferencia, con los datos que la dueña de
// RECABRA dejó en el servidor (`instrucciones_transferencia`). Plata en pesos
// enteros; fechas `"YYYY-MM-DD"` de Colombia.

export type EstadoDeCuenta = "activo" | EstadoCuentaAviso;

export interface EstadoCuentaVivo {
  estado: EstadoDeCuenta;
  /** Sólo para la dueña; `null` para su gente y con la cuenta al día. */
  motivo: string | null;
  /** Lo dice la membresía, no el rol del token (la dueña viaja como admin). */
  duena: boolean;
}

export const getEstadoCuenta = (): Promise<EstadoCuentaVivo> =>
  client.get<EstadoCuentaVivo>("/auth/estado-cuenta").then((r) => r.data);

export interface FacturaDeLaSuscripcion {
  id: number;
  numero: string | null;
  /** `"2026-11"` o `"2026-11..2027-01"`. */
  periodo: string;
  emitida_el: string | null;
  vence_el: string;
  subtotal_cop: number;
  iva_cop: number;
  total_cop: number;
  retenciones_estimadas_cop: number;
  neto_esperado_cop: number;
  estado: "borrador" | "emitida" | "pagada" | "anulada";
  en_disputa: boolean;
  pagada_el: string | null;
  abonado_cop: number;
  saldo_cop: number;
  /** Emitida e impaga con el vencimiento ATRÁS: el día que vence, todavía no. */
  vencida: boolean;
  dias_atraso: number | null;
  /** Factura electrónica (tiene CUFE) o cuenta de cobro. */
  electronica: boolean;
}

export interface ProximaFactura extends FacturaDeLaSuscripcion {
  /** Con cobro automático: desde qué día la cuenta pasaría a sólo lectura si
   *  sigue impaga. `null` con cobro manual o en disputa. */
  solo_lectura_desde: string | null;
}

export interface PagoDeLaSuscripcion {
  recibido_el: string;
  factura_numero: string | null;
  valor_recibido_cop: number;
  /** Lo que el supermercado retuvo: cuenta como pagado. */
  retenciones_cop: number;
  certificado_recibido: boolean;
  ref_externa: string;
}

export interface CambioDeEstado {
  en: string;
  de: EstadoDeCuenta;
  a: EstadoDeCuenta;
  motivo: string;
  /** «RECABRA» o «automático»: el correo de quien lo hizo no viaja. */
  por: string;
}

export interface DatosDeFacturacion {
  razon_social: string | null;
  nit: string | null;
  correo_facturacion: string | null;
  municipio: string | null;
}

export interface LoPactado extends DatosDeFacturacion {
  modo: "manual" | "automatico";
  valor_cop: number;
  unidad: "supermercado_mes" | "sede_mes";
  cantidad: number;
  periodicidad_meses: number;
  plazo_pago_dias: number;
  dia_solo_lectura: number;
  prorroga_hasta: string | null;
  retefuente_pct: number;
  reteica_pct: number;
  reteiva_pct: number;
}

export interface MiSuscripcion {
  hoy: string;
  estado: { estado: EstadoDeCuenta; motivo: string | null; cambiado_en: string | null };
  /** `null`: el supermercado no tiene suscripción (está exento). */
  suscripcion: LoPactado | null;
  proxima_factura: ProximaFactura | null;
  facturas: FacturaDeLaSuscripcion[];
  pagos: PagoDeLaSuscripcion[];
  cambios: CambioDeEstado[];
  /** Los datos para transferir, o `null` si RECABRA no los dejó cargados. */
  instrucciones_transferencia: string | null;
}

/** **Nunca se guarda en localStorage**: es plata, y la máquina puede ser
 *  compartida con el turno siguiente. */
export const getMiSuscripcion = (): Promise<MiSuscripcion> =>
  client.get<MiSuscripcion>("/clientes/mi-suscripcion").then((r) => r.data);

export const guardarMiFacturacion = (datos: DatosDeFacturacion): Promise<DatosDeFacturacion> =>
  client.put<DatosDeFacturacion>("/clientes/mi-suscripcion/facturacion", datos).then((r) => r.data);
