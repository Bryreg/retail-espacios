import client from "./client";
import type { AvisosContrato } from "../types";
import type {
  EstadoDeDistribucion, EstadoDeTermino, EstadoVisible, Termino,
} from "../utils/participaciones";
import type { Superficie } from "../utils/superficie";
import type { Exclusion, Poligono } from "../utils/zonasGeometria";

/**
 * Las participaciones de cara contra el servidor (`/api/participaciones/…`,
 * `backend/app/routers/participaciones.py`). Los cuerpos y las respuestas son
 * EXACTAMENTE los de §5.3 del diseño de participaciones: el servidor se hace
 * con el mismo contrato, y la prueba de rutas del navegador (paso 8) mira que
 * este archivo sólo llame rutas que existen.
 *
 *   · Los GET reciben todo por query, nunca por ruta (los códigos con `#` o
 *     `/` no rompen la URL, y el barrido del token de montaje no necesita
 *     casos nuevos).
 *   · Fechas `YYYY-MM-DD`; porcentajes en puntos básicos enteros (1 pb =
 *     0,01 %); los números de la geometría viajan sin redondear.
 *   · Todo es de administración salvo `ocupacion` (anónima: sin nombres,
 *     montos ni números de participación), que es lo único que pide un
 *     trabajador.
 *   · Un 409 llega de dos formas: con `detail: {code, message, …}` (los que no
 *     escriben) o, en los que guardan algo antes de rechazar
 *     (`distribucion_invalida`), con el cuerpo suelto `{code, message, …}`.
 *     `rechazoDe` lee las dos.
 *
 * Nada de esto se guarda en el navegador (ni `localStorage` ni
 * `sessionStorage`): el borrador oficial vive en el servidor.
 */

/* ── Objetos de salida comunes ─────────────────────────────────────────────── */

export interface TerminoOut {
  id: number;
  space_id: number;
  codigo: string;
  numero: number;
  cara: "A" | "B";
  estado: EstadoDeTermino;
  estado_visible: EstadoVisible;
  puntos_basicos: number;
  porcentaje: string;
  /** Del lease si es contrato. */
  proveedor: { id: number; nombre: string } | null;
  marca: string | null;
  /** Del lease si es contrato. */
  desde: string;
  hasta: string;
  caduca: string | null;
  /** null en una reserva. */
  lease_id: number | null;
  valor_mensual: number | null;
  renueva_a: number | null;
  notas: string | null;
  baja_en: string | null;
  /** El día de la baja en Colombia (§3.2): el navegador usa ÉSE, nunca deriva
   *  un día de `baja_en`. */
  baja_fecha: string | null;
  version: number;
  creada_en: string;
  creada_por: string | null;
}

export interface ZonaOut {
  id: number;
  participacion_space_id: number;
  vertices: Poligono;
  orden: number;
}

export interface ProblemaOut {
  codigo: string;
  frase: string;
  /** Índice 0-based en la lista enviada o guardada. */
  zona: number | null;
  /** Los números de participación (el n de PC<n>). */
  participaciones: number[];
}

export interface SuperficieOut {
  orientacion: "frente" | "arriba";
  ancho: number;
  alto: number;
  plano: number;
  giro_x: number;
  area_util_m2: number;
  /** Exactas, cuantizadas a 1e-6. */
  exclusiones: Exclusion[];
}

export interface DistribucionOut {
  id: number;
  version: number;
  estado: EstadoDeDistribucion;
  confirmada_en: string | null;
  confirmada_por: string | null;
  para_revisar: boolean;
  borrador_en: string | null;
  borrador_por: string | null;
  confirmada: ZonaOut[];
  /** Lista o null. */
  borrador: ZonaOut[] | null;
}

export interface ParticipacionOut {
  space_id: number;
  codigo: string;
  numero: number;
  viva: boolean;
  /** De la capa que se muestra (el borrador si hay). */
  contratado_pb: number;
  dibujado_pb: number;
  pendiente_pb: number;
  /** Del más nuevo al más viejo. */
  terminos: TerminoOut[];
}

export interface CapacidadOut {
  hoy_pb: number;
  disponible_hoy_pb: number;
  periodo: { desde: string; hasta: string; pico_pb: number; dia_pico: string; disponible_pb: number };
  intervalos: { desde: string; hasta: string; pb: number; tipo: "contrato" | "reserva"; numero: number }[];
  fisicos: { codigo: string; desde: string; hasta: string; huerfano: boolean }[];
}

export interface RevisionOut {
  capa: "borrador" | "confirmada";
  errores: ProblemaOut[];
  avisos: ProblemaOut[];
}

/** 1 · `GET /participaciones/cara`. */
export interface CaraOut {
  sede: string;
  hoy: string;
  codigo_cara: string;
  cara: "A" | "B";
  fixture: { id: string; code: string; label: string; type: string; caras: 1 | 2 };
  por_participacion: boolean;
  comercializable: boolean;
  /** null si el tipo no tiene receta. */
  superficie: SuperficieOut | null;
  firma: string | null;
  /** null si la cara nunca se distribuyó (versión 0). */
  distribucion: DistribucionOut | null;
  participaciones: ParticipacionOut[];
  capacidad: CapacidadOut;
  revision: RevisionOut;
}

/** 2 · `GET /participaciones/resumen`: totales de UN día, capacidad del período. */
export interface ResumenOut {
  sede: string;
  hoy: string;
  dia: string;
  desde: string;
  hasta: string;
  caras: {
    codigo_cara: string;
    cara: "A" | "B";
    fixture_code: string;
    rotulo: string;
    estado_distribucion: EstadoDeDistribucion;
    area_util_m2: number;
    comprometido_dia_pb: number;
    pico_pb: number;
    dia_pico: string;
    disponible_pb: number;
    dibujado_dia_pb: number;
    pendiente_dia_pb: number;
    errores: number;
    avisos: number;
    /** El borrador guardado (también encima de una confirmada, que sigue
     *  `confirmada`): el instante y su DÍA en Colombia. null sin borrador. */
    borrador_en?: string | null;
    borrador_dia?: string | null;
    participaciones: {
      codigo: string; numero: number; proveedor_id: number; proveedor: string; marca: string | null;
      cuenta_el_dia: boolean; estado_visible: EstadoVisible; puntos_basicos: number;
      desde: string; hasta: string; caduca: string | null; dibujado_pb: number; m2_contratados: number;
    }[];
  }[];
  por_proveedor: { proveedor_id: number; proveedor: string; participaciones: number; caras: number; m2_contratados_dia: number }[];
  totales: {
    caras_por_participacion: number; sin_distribuir: number; borradores: number; para_revisar: number;
    con_errores: number; reservas_por_caducar: number; sin_mueble: number; huerfanos: number;
  };
  /** §11-6: las caras con términos VIVOS que el plano ya no vende por
   *  participación (`en_el_plano`: el mueble sigue, pero se vende de otra
   *  forma). Sólo sin el filtro `espacio`. */
  sin_mueble?: { codigo_cara: string; cara: "A" | "B"; fixture_code: string; en_el_plano: boolean; participaciones: number; hasta: string }[];
  /** §3.2: los contratos `…-PC<n>` sin término que cuentan como la cara entera en el período. */
  huerfanos?: { codigo: string; desde: string; hasta: string }[];
}

/** 3 · `GET /participaciones/ocupacion`: anónima. */
export interface OcupacionOut {
  sede: string;
  hoy: string;
  caras: Record<string, { intervalos: { desde: string; hasta: string; pb: number }[]; fisicos: { desde: string; hasta: string }[] }>;
}

/** 4 · `GET /participaciones/historial`. */
export interface EntradaDeHistorial {
  id: number;
  en: string;
  actor: string | null;
  tipo: "contractual" | "geometria" | "estado" | "evento";
  accion: string;
  participacion_id?: number | null;
  codigo?: string | null;
  detalle: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}
export interface HistorialOut {
  entradas: EntradaDeHistorial[];
  /** Las DERIVADAS (el vencimiento de un contrato, la caducidad de una reserva):
   *  no tienen fila, salen de las fechas. `dia` es el día de Colombia en que
   *  pasó y `en`, la medianoche de ese día con su zona. Un servidor viejo no
   *  manda `dia` ni `derivado`, y manda `en` como día solo (fase 2 · I1, E5a). */
  derivados: { en: string; dia?: string; derivado?: true; tipo: "evento"; accion: string; participacion_id: number; detalle: string }[];
}

/* ── Cuerpos ───────────────────────────────────────────────────────────────── */

/** 5 · `POST /participaciones/`. */
export interface AltaIn {
  sede: string;
  espacio: string;
  tipo: "reserva" | "contrato";
  proveedor: string;
  correo: string | null;
  marca: string | null;
  puntos_basicos: number;
  desde: string;
  hasta: string;
  /** Obligatorio en reserva; prohibido en contrato. */
  caduca: string | null;
  /** Obligatorio (≥ 0) en contrato; prohibido en reserva. */
  valor_mensual: number | null;
  notas: string | null;
}
/** 6 · `PATCH /participaciones/{id}` (sólo una reserva viva). */
export interface CambioDeReservaIn {
  version: number;
  puntos_basicos?: number;
  desde?: string;
  hasta?: string;
  caduca?: string;
  marca?: string | null;
  notas?: string | null;
}
/** 7 · `POST /participaciones/{id}/confirmar`. */
export interface ConfirmarReservaIn {
  version: number;
  valor_mensual: number;
  correo?: string | null;
  notas?: string | null;
  puntos_basicos?: number;
  desde?: string;
  hasta?: string;
}
/** 9 · `POST /participaciones/{id}/renovar`. */
export interface RenovarIn {
  version: number;
  tipo: "reserva" | "contrato";
  desde: string;
  hasta: string;
  caduca?: string | null;
  valor_mensual?: number | null;
  correo?: string | null;
  notas?: string | null;
}
export interface ZonaIn { participacion_space_id: number; vertices: Poligono }
/** fase 2 · I1 · «Copiar zonas de otra cara»: a qué participación de esta cara
 *  fueron las zonas de cada participación del origen (por NÚMERO, el n de PC<n>). */
export interface ParDeCopiaIn {
  origen: number;
  /** null: no se copió. */
  destino: number | null;
}
/** De qué cara vienen las zonas de un borrador. Sólo va al historial y a la
 *  bitácora (`distribucion.copiada`): el servidor valida las zonas como las de
 *  cualquier borrador y no recalcula la copia. */
export interface OrigenDeCopiaIn {
  sede: string;
  /** «GON-01» o «GON-01-B», como en `GET /cara`. */
  espacio: string;
  capa: "confirmada" | "borrador";
  /** La versión de la distribución de origen que se leyó. */
  version: number;
  espejo: boolean;
  mapa: ParDeCopiaIn[];
  /** Las zonas del origen que quedaron afuera. */
  sin_copiar: number;
}
/** 10 · `PUT /participaciones/distribucion/borrador`. */
export interface BorradorIn {
  sede: string;
  espacio: string;
  /** 0 si la cara no tiene distribución. */
  version: number;
  /** true = autoguardado: sin historial ni bitácora. */
  automatico: boolean;
  zonas: ZonaIn[];
  /** fase 2 · I1: las zonas vienen de «Copiar zonas de otra cara». Con él se
   *  anota aunque sea autoguardado (el store lo manda con `automatico: false`). */
  origen?: OrigenDeCopiaIn;
}
/** 11 · `POST /participaciones/distribucion/confirmar`: el mismo, sin
 *  `automatico` ni `origen` (confirmar no cambia: una copia se guarda antes
 *  como borrador, con su origen). */
export type ConfirmarDistribucionIn = Omit<BorradorIn, "automatico" | "origen">;
/** 12 · `POST /participaciones/distribucion/descartar`. */
export interface DescartarIn { sede: string; espacio: string; version: number }

/* ── Respuestas de las escrituras ──────────────────────────────────────────── */

/** 5, 6, 7 y 9. */
export interface TerminoEscrito { termino: TerminoOut; cara: CaraOut; avisos: AvisosContrato | null }
/** 8. */
export interface ReservaCancelada { termino: TerminoOut; cara: CaraOut }
/** 10, 11 y 12: la versión nueva y el bloque de la cara (§5.3: «el mismo
 *  bloque que `GET /cara`»; las claves que no vengan quedan como estaban). */
export type DistribucionEscrita = Partial<CaraOut> & {
  version: number;
  distribucion: DistribucionOut | null;
  participaciones: ParticipacionOut[];
  revision: RevisionOut;
};

/* ── El cliente ────────────────────────────────────────────────────────────── */

const P = "/participaciones";

/** 1 · Todo lo de una cara. `espacio`: el código de la CARA (`GON-01`,
 *  `GON-01-B` o con la sede). Sin fechas, el servidor toma hoy y un año. */
export const leerCara = (sede: string, espacio: string, desde?: string, hasta?: string): Promise<CaraOut> =>
  client.get<CaraOut>(`${P}/cara`, { params: { sede, espacio, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) } })
    .then((r) => r.data);

export interface ParametrosDeResumen {
  sede: string;
  dia?: string;
  desde?: string;
  hasta?: string;
  proveedor_id?: number;
  espacio?: string;
}
/** 2 · El informe por sede, mueble, proveedor, día y período. */
export const resumen = (params: ParametrosDeResumen): Promise<ResumenOut> => {
  const limpios: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") limpios[k] = v;
  return client.get<ResumenOut>(`${P}/resumen`, { params: limpios }).then((r) => r.data);
};

/** 3 · La ocupación anónima de las caras por participación de la sede. */
export const ocupacion = (sede: string): Promise<OcupacionOut> =>
  client.get<OcupacionOut>(`${P}/ocupacion`, { params: { sede } }).then((r) => r.data);

/** 4 · El historial de una cara (`sede` + `espacio`) o de una participación. */
export const historial = (params: { sede: string; espacio: string; limite?: number } | { participacion_id: number; limite?: number }):
  Promise<HistorialOut> => client.get<HistorialOut>(`${P}/historial`, { params }).then((r) => r.data);

/** 5 · Alta de una reserva provisional o de un contrato. */
export const crear = (body: AltaIn): Promise<TerminoEscrito> =>
  client.post<TerminoEscrito>(`${P}/`, body).then((r) => r.data);

/** 6 · Cambiar una reserva viva. */
export const editarReserva = (id: number, body: CambioDeReservaIn): Promise<TerminoEscrito> =>
  client.patch<TerminoEscrito>(`${P}/${id}`, body).then((r) => r.data);

/** 7 · Reserva → contrato. */
export const confirmarReserva = (id: number, body: ConfirmarReservaIn): Promise<TerminoEscrito> =>
  client.post<TerminoEscrito>(`${P}/${id}/confirmar`, body).then((r) => r.data);

/** 8 · Cancelar una reserva (un contrato se cancela por
 *  `DELETE /spaces/{space_id}/leases/{lease_id}`). */
export const cancelarReserva = (id: number, version: number): Promise<ReservaCancelada> =>
  client.post<ReservaCancelada>(`${P}/${id}/cancelar`, { version }).then((r) => r.data);

/** 9 · Un término nuevo de la misma participación. */
export const renovar = (id: number, body: RenovarIn): Promise<TerminoEscrito> =>
  client.post<TerminoEscrito>(`${P}/${id}/renovar`, body).then((r) => r.data);

/** 10 · Guardar el borrador (con sus errores marcados). */
export const guardarBorrador = (body: BorradorIn): Promise<DistribucionEscrita> =>
  client.put<DistribucionEscrita>(`${P}/distribucion/borrador`, body).then((r) => r.data);

/** 11 · Validar estricto y confirmar. Con errores, el servidor lo guarda como
 *  borrador y contesta 409 `distribucion_invalida` (ver `rechazoDe`). */
export const confirmarDistribucion = (body: ConfirmarDistribucionIn): Promise<DistribucionEscrita> =>
  client.post<DistribucionEscrita>(`${P}/distribucion/confirmar`, body).then((r) => r.data);

/** 12 · Borrar el borrador (la confirmada queda). */
export const descartarBorrador = (body: DescartarIn): Promise<DistribucionEscrita> =>
  client.post<DistribucionEscrita>(`${P}/distribucion/descartar`, body).then((r) => r.data);

/* ── Errores ───────────────────────────────────────────────────────────────── */

/** Un rechazo estructurado (`{code, message, …}`), venga en `detail` o suelto. */
export interface Rechazo {
  status: number;
  code: string;
  message: string;
  cuerpo: Record<string, unknown>;
}

export function rechazoDe(err: unknown): Rechazo | null {
  const res = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (!res || typeof res.status !== "number") return null;
  const data = res.data as Record<string, unknown> | null | undefined;
  const detail = data && typeof data === "object" ? data.detail : undefined;
  const cuerpo = detail && typeof detail === "object" && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : data && typeof data === "object" && typeof data.code === "string" ? data : null;
  if (!cuerpo || typeof cuerpo.code !== "string") return null;
  return { status: res.status, code: cuerpo.code, message: typeof cuerpo.message === "string" ? cuerpo.message : "", cuerpo };
}

/* ── De la respuesta a las reglas del navegador ────────────────────────────── */

/**
 * Un `TerminoOut` como lo leen las reglas (`utils/participaciones.ts`). En un
 * contrato, proveedor, marca y fechas ya vienen del lease; su `lease` se
 * arma con esas fechas y `isActive` sale de `estado_visible`: «vigente» y
 * «firmado» están activos, «cancelado» no, y «vencido» (que terminó antes de
 * hoy) da lo mismo en todas las reglas —ni cuenta desde hoy ni está vivo, y
 * sus días pasados cuentan igual—. Un contrato sin lease (dato roto) queda
 * sin lease, como lo lee el servidor.
 */
export function terminoDeOut(t: TerminoOut): Termino {
  const activo = t.estado_visible === "vigente" || t.estado_visible === "firmado" || t.estado_visible === "vencido";
  return {
    id: t.id, spaceId: t.space_id, numero: t.numero, estado: t.estado, pb: t.puntos_basicos,
    supplierId: t.proveedor?.id ?? 0, marca: t.marca, desde: t.desde, hasta: t.hasta,
    caduca: t.caduca, bajaFecha: t.baja_fecha,
    lease: t.estado === "contrato" && t.lease_id != null ? { isActive: activo, startDate: t.desde, endDate: t.hasta } : null,
  };
}

/** Los términos de cada participación de la cara, por `spaceId` (para
 *  `juzgar`, `revisarCapacidad`, `revisarTerminos`). */
export function terminosPorParticipacion(cara: Pick<CaraOut, "participaciones">): Map<number, Termino[]> {
  const fuera = new Map<number, Termino[]>();
  for (const p of cara.participaciones) fuera.set(p.space_id, p.terminos.map(terminoDeOut));
  return fuera;
}

/** La superficie de la respuesta con los nombres del navegador. */
export function superficieDeOut(s: SuperficieOut): Superficie {
  return {
    orientacion: s.orientacion, ancho: s.ancho, alto: s.alto, plano: s.plano, giroX: s.giro_x,
    exclusiones: s.exclusiones.map((e) => ({ ...e })), areaUtilM2: s.area_util_m2,
  };
}

/** El código de la cara que se pide (`GON-01` o `GON-01-B`). */
export function espacioDeLaCara(codigo: string, cara: "A" | "B"): string {
  return cara === "B" ? `${codigo}-B` : codigo;
}
