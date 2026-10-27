/**
 * Montajes en una sola lista (rediseño UX 2026-10, etapa 7): el estado PRECISO
 * de cada montaje —de un contrato o de un planograma— y el filtro al que va.
 *
 * Funciones puras (las prueba `probar-montajes`): la pantalla las llama con lo
 * que ya bajó —los reportes de `/mounts/`, los avisos que esperan de
 * `/montajes/pendientes` y las caras de `/planogramas/supervision?todas=1`—.
 */

/** Lo que se lee en la fila. */
export type EstadoDeMontaje =
  | "falta_planometria"   // contrato sin reporte cuyo aviso espera la planometría
  | "falta_zona"          // … o, en un porcentaje, la zona confirmada
  | "aviso_enviado"       // contrato sin reporte, con el aviso ya mandado
  | "sin_montar"          // sin reporte (y sin saber del aviso, o un planograma)
  | "sin_verificar"       // se reportó montado y nadie lo comparó todavía
  | "no_realizado"        // se reportó que no se pudo
  | "coincide"
  | "no_coincide";

/** Los filtros de arriba de la lista. */
export type FiltroDeMontajes = "todos" | "sin_montar" | "sin_verificar" | "no_realizado" | "verificado";

export const FILTROS_DE_MONTAJES: readonly { id: FiltroDeMontajes; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "sin_montar", texto: "Sin montar" },
  { id: "sin_verificar", texto: "Montado, sin verificar" },
  { id: "no_realizado", texto: "No realizado" },
  { id: "verificado", texto: "Verificado" },
];

export const TEXTO_DEL_ESTADO: Record<EstadoDeMontaje, string> = {
  falta_planometria: "Sin montar · falta planometría",
  falta_zona: "Sin montar · falta la zona",
  aviso_enviado: "Sin montar · aviso enviado",
  sin_montar: "Sin montar",
  sin_verificar: "Montado, sin verificar",
  no_realizado: "No realizado",
  coincide: "Verificado: coincide",
  no_coincide: "Verificado: no coincide",
};

/** El filtro al que va cada estado. */
export function filtroDe(e: EstadoDeMontaje): Exclude<FiltroDeMontajes, "todos"> {
  switch (e) {
    case "falta_planometria": case "falta_zona": case "aviso_enviado": case "sin_montar": return "sin_montar";
    case "sin_verificar": return "sin_verificar";
    case "no_realizado": return "no_realizado";
    case "coincide": case "no_coincide": return "verificado";
  }
}

/** El último reporte de un contrato, con lo que importa acá. */
export interface ReporteParaElEstado {
  estado: "montado" | "no_montado";
  verificacion?: { resultado: "coincide" | "no_coincide" } | null;
}

/** El estado de un contrato. `aviso`: lo que dice `/montajes/pendientes` de
 *  ese contrato —`null` si su aviso ya salió— o `undefined` si no se sabe
 *  (quien no administra no lee esa lista: su fila dice sólo «Sin montar»). */
export function estadoDelContrato(
  reporte: ReporteParaElEstado | undefined | null,
  aviso: { falta_planometria: boolean; falta_distribucion: boolean } | null | undefined,
): EstadoDeMontaje {
  if (reporte) {
    if (reporte.estado === "no_montado") return "no_realizado";
    const v = reporte.verificacion?.resultado;
    return v === "coincide" ? "coincide" : v === "no_coincide" ? "no_coincide" : "sin_verificar";
  }
  if (aviso === undefined) return "sin_montar";
  if (aviso === null) return "aviso_enviado";
  if (aviso.falta_planometria) return "falta_planometria";
  if (aviso.falta_distribucion) return "falta_zona";
  // Ya tiene todo y el aviso está por salir: todavía no salió.
  return "sin_montar";
}

/** El estado de un montaje de planograma (`services/supervision_planogramas.py`). */
export function estadoDelPlanograma(
  e: "sin_montar" | "por_revisar" | "no_se_pudo" | "no_coincide" | "coincide",
): EstadoDeMontaje {
  return e === "por_revisar" ? "sin_verificar" : e === "no_se_pudo" ? "no_realizado" : e;
}

/** Cuántas filas hay en cada filtro (para la cuenta de cada botón). */
export function cuentaPorFiltro(estados: readonly EstadoDeMontaje[]): Record<FiltroDeMontajes, number> {
  const c: Record<FiltroDeMontajes, number> = { todos: estados.length, sin_montar: 0, sin_verificar: 0, no_realizado: 0, verificado: 0 };
  for (const e of estados) c[filtroDe(e)]++;
  return c;
}

/** Qué hacer con un montaje no realizado, según el motivo (`MountMotivo`). */
export function queHacerSegunElMotivo(motivo: string | null | undefined): string {
  switch (motivo) {
    case "sin_material": return "Reclamale el material al proveedor y, cuando llegue, registrá el montaje de nuevo.";
    case "sin_producto": return "Reclamale el producto al proveedor y, cuando llegue, registrá el montaje de nuevo.";
    case "espacio_ocupado": return "Liberá el espacio (sacá lo que lo ocupa o revisá si hay otro contrato encima) y registrá el montaje de nuevo.";
    default: return "Leé la nota de quien registró, resolvelo y registrá el montaje de nuevo.";
  }
}
