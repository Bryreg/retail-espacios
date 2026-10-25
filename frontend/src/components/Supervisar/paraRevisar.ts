/**
 * «Para revisar» en tres grupos (rediseño, PR 2; dibujo aprobado en
 * `docs/maquetas/rediseno-2026-10/supervisar.html`, paso 2): **Hoy**, **30
 * días** y **Corregir**. Eran quince tipos de aviso en una lista larga y
 * angosta; se agrupan por CUÁNDO hay que actuar.
 *
 * Esto es la regla, sin React: qué sección va en qué grupo, cuántos avisos
 * tiene cada grupo (la pastilla roja de la pestaña Supervisar es la SUMA de los
 * tres, y cada sección cuenta), en cuál abre la tarjeta y qué mueble lleva
 * chincheta en el plano. Las secciones las dibuja `DashboardView` con las
 * acciones de siempre; `probar-comercial` corre esto sin navegador.
 *
 *  · Hoy: las ventas por cargar (cortes ya vencidos), lo que falta distribuir o
 *    le falta la planometría y empieza en 7 días o menos, los vencidos, lo que
 *    no se pudo montar y las reservas que caducan hoy.
 *  · 30 días: por vencer (con Renovar), lo que falta distribuir o le falta la
 *    planometría con más margen, lo contratado sin montar, las reservas por
 *    caducar y los borradores de distribución sin confirmar.
 *  · Corregir: datos que no cuadran — contrato sin mueble, sólo en el plano,
 *    ocupado sin contrato, marcado reservado a mano (PR 3), participación sin mueble, sin término, distribución
 *    con problemas o para revisar, bajo tarifa y los montajes viejos sin
 *    reporte (antes una nota que no contaba).
 *
 * Fase 4 de la distribución (2026-10-25): los planogramas montados por revisar,
 * los que no coinciden, los que no se pudieron montar y los que rigen sin que
 * nadie avise van en «Hoy» (`components/Supervisar/PlanogramasPorRevisar.tsx`).
 */

export type GrupoDeRevision = "hoy" | "dias30" | "corregir";

export const GRUPOS: readonly { id: GrupoDeRevision; texto: string }[] = [
  { id: "hoy", texto: "Hoy" },
  { id: "dias30", texto: "30 días" },
  { id: "corregir", texto: "Corregir" },
];

export type SeccionDeRevisar =
  | "ventas_por_cargar" | "falta_distribuir" | "falta_planometria" | "vencidos" | "no_se_pudo_montar"
  | "reservas" | "por_vencer" | "sin_montar" | "borradores"
  | "contrato_sin_mueble" | "solo_en_el_plano" | "ocupado_sin_contrato" | "reservado_a_mano" | "participacion_sin_mueble"
  | "sin_termino" | "distribucion_con_problemas" | "distribucion_para_revisar" | "bajo_tarifa" | "montajes_viejos"
  // Fase 4 de la distribución (2026-10-25): la supervisión de los planogramas.
  | "planograma_por_revisar" | "planograma_no_coincide" | "planograma_no_se_pudo" | "planograma_sin_montar";

/** Con cuántos días o menos para empezar algo que falta preparar (la
 *  distribución, la planometría) pasa a «Hoy»: es el montaje de alguien que ya
 *  firmó (el mismo umbral que pinta de rojo «Falta distribuir»). */
export const DIAS_PARA_HOY = 7;

/** Desde cuántos días cobrando sin que nadie reporte el montaje la fila de
 *  «Contratado sin montar» va en rojo. La lista corta a los 30 días
 *  (`VENTANA_MONTAJE_DIAS`): el «más de 60» de antes no podía pasar nunca. Dos
 *  semanas cobrando algo que nadie armó ya no es una espera, es un problema. */
export const DIAS_SIN_MONTAR_EN_ROJO = 14;

/** Dónde va cada sección: un grupo fijo, o «Hoy» hasta tantos días y si no
 *  «30 días» (lo que depende de cuándo empieza o caduca). */
export const DONDE_VA: Record<SeccionDeRevisar, { grupo: GrupoDeRevision } | { hoyHasta: number }> = {
  ventas_por_cargar: { grupo: "hoy" },
  falta_distribuir: { hoyHasta: DIAS_PARA_HOY },
  falta_planometria: { hoyHasta: DIAS_PARA_HOY },
  vencidos: { grupo: "hoy" },
  no_se_pudo_montar: { grupo: "hoy" },
  // Una reserva que caduca hoy es de hoy; las demás, por caducar.
  reservas: { hoyHasta: 0 },
  por_vencer: { grupo: "dias30" },
  sin_montar: { grupo: "dias30" },
  borradores: { grupo: "dias30" },
  contrato_sin_mueble: { grupo: "corregir" },
  solo_en_el_plano: { grupo: "corregir" },
  ocupado_sin_contrato: { grupo: "corregir" },
  // «Reservado» a mano, sin proveedor ni fecha (rediseño, PR 3, decisión 1):
  // ya no se puede marcar; los que quedaron se liberan o se reservan de verdad.
  reservado_a_mano: { grupo: "corregir" },
  participacion_sin_mueble: { grupo: "corregir" },
  sin_termino: { grupo: "corregir" },
  distribucion_con_problemas: { grupo: "corregir" },
  distribucion_para_revisar: { grupo: "corregir" },
  bajo_tarifa: { grupo: "corregir" },
  montajes_viejos: { grupo: "corregir" },
  // Los planogramas van todos en «Hoy»: la vigente sin aviso entra el mismo
  // día que empieza a regir (decisión del dueño).
  planograma_por_revisar: { grupo: "hoy" },
  planograma_no_coincide: { grupo: "hoy" },
  planograma_no_se_pudo: { grupo: "hoy" },
  planograma_sin_montar: { grupo: "hoy" },
};

/** El título de cada sección, en el grupo donde se dice. */
export function tituloDeSeccion(s: SeccionDeRevisar, grupo: GrupoDeRevision): string {
  switch (s) {
    case "ventas_por_cargar": return "Ventas por cargar";
    case "falta_distribuir": return grupo === "hoy" ? `Falta distribuir · empieza en ${DIAS_PARA_HOY} días o menos` : "Falta distribuir";
    case "falta_planometria": return grupo === "hoy" ? `Falta planometría · empieza en ${DIAS_PARA_HOY} días o menos` : "Falta planometría";
    case "vencidos": return "Vencidos";
    case "no_se_pudo_montar": return "No se pudo montar";
    case "reservas": return grupo === "hoy" ? "Reservas que caducan hoy" : "Reservas por caducar";
    case "por_vencer": return "Por vencer en 30 días";
    case "sin_montar": return "Contratado sin montar";
    case "borradores": return "Borradores sin confirmar";
    case "contrato_sin_mueble": return "Contrato sin mueble en el plano";
    case "solo_en_el_plano": return "Contrato que sólo vive en el plano";
    case "ocupado_sin_contrato": return "Ocupado sin contrato";
    case "reservado_a_mano": return "Marcado reservado a mano";
    case "participacion_sin_mueble": return "Participación sin mueble";
    case "sin_termino": return "Contrato de participación sin término";
    case "distribucion_con_problemas": return "Distribución con problemas";
    case "distribucion_para_revisar": return "Distribución para revisar";
    case "bajo_tarifa": return "Bajo tarifa de referencia";
    case "montajes_viejos": return "Montaje sin reporte";
    case "planograma_por_revisar": return "Planograma montado por revisar";
    case "planograma_no_coincide": return "Planograma que no coincide";
    case "planograma_no_se_pudo": return "No se pudo montar el planograma";
    case "planograma_sin_montar": return "Planograma sin montar";
  }
}

/** En qué grupo cae UN aviso de esa sección, con los días que faltan para
 *  actuar (para empezar, para caducar). Sin días, el de más margen. */
export function grupoDelAviso(s: SeccionDeRevisar, dias?: number | null): GrupoDeRevision {
  const d = DONDE_VA[s];
  if ("grupo" in d) return d.grupo;
  return dias !== undefined && dias !== null && dias <= d.hoyHasta ? "hoy" : "dias30";
}

/** Un aviso de la lista: de qué sección, su clave (la de su fila en
 *  pantalla, `data-aviso`), los días para actuar y el mueble, si tiene. */
export interface Aviso {
  seccion: SeccionDeRevisar;
  clave: string;
  dias?: number | null;
  fixtureId?: string | null;
  cara?: "A" | "B";
}

export type CuentaPorGrupo = Record<GrupoDeRevision, number>;

/** Cuántos avisos tiene cada grupo: TODOS cuentan, de todas las secciones. */
export function contarPorGrupo(avisos: readonly Aviso[]): CuentaPorGrupo {
  const n: CuentaPorGrupo = { hoy: 0, dias30: 0, corregir: 0 };
  for (const a of avisos) n[grupoDelAviso(a.seccion, a.dias)] += 1;
  return n;
}

/** La cuenta de la pastilla roja: la suma de los tres grupos. */
export function cuentaDelBadge(n: CuentaPorGrupo): number {
  return n.hoy + n.dias30 + n.corregir;
}

/** En qué grupo abre la tarjeta: «Hoy» si tiene algo, si no «30 días»; si los
 *  dos están vacíos y queda algo para corregir, «Corregir». */
export function grupoParaAbrir(n: CuentaPorGrupo): GrupoDeRevision {
  if (n.hoy > 0) return "hoy";
  if (n.dias30 === 0 && n.corregir > 0) return "corregir";
  return "dias30";
}

const PRIORIDAD: Record<GrupoDeRevision, number> = { hoy: 0, dias30: 1, corregir: 2 };

/** Una chincheta del plano: el mueble que tiene algo en «Para revisar», con el
 *  grupo más urgente de sus avisos y el aviso al que lleva. */
export interface Chincheta {
  fixtureId: string;
  cara: "A" | "B";
  grupo: GrupoDeRevision;
  clave: string;
  seccion: SeccionDeRevisar;
}

/** Las chinchetas: SÓLO los muebles que tienen un aviso en la lista (nada se
 *  marca en el plano sin estar en «Para revisar»), una por mueble y cara, la
 *  del aviso más urgente. */
export function chinchetasDe(avisos: readonly Aviso[]): Chincheta[] {
  const por = new Map<string, Chincheta>();
  for (const a of avisos) {
    if (!a.fixtureId) continue;
    const cara = a.cara ?? "A";
    const k = `${a.fixtureId}-${cara}`;
    const grupo = grupoDelAviso(a.seccion, a.dias);
    const ya = por.get(k);
    if (!ya || PRIORIDAD[grupo] < PRIORIDAD[ya.grupo]) {
      por.set(k, { fixtureId: a.fixtureId, cara, grupo, clave: a.clave, seccion: a.seccion });
    }
  }
  return [...por.values()];
}

/** Los PUNTOS del plano de Supervisar («aire y pines»): uno por MUEBLE con algo
 *  en «Para revisar», el de su aviso más urgente —rojo si tiene algo de «Hoy»,
 *  ámbar si lo más urgente es de «30 días», tinta si sólo tiene algo para
 *  «Corregir»—. Salen de `chinchetasDe`, así que tampoco marcan nada que no
 *  esté en la lista. Una góndola doble con avisos en las dos caras es un
 *  punto: el de la cara más urgente (a igual grupo, la primera que aparece). */
export function puntosDelPlano(avisos: readonly Aviso[]): Chincheta[] {
  const por = new Map<string, Chincheta>();
  for (const c of chinchetasDe(avisos)) {
    const ya = por.get(c.fixtureId);
    if (!ya || PRIORIDAD[c.grupo] < PRIORIDAD[ya.grupo]) por.set(c.fixtureId, c);
  }
  return [...por.values()];
}

/** El grupo más urgente de los avisos de una clave de fila (`data-aviso`): el
 *  color con que el plano marca su mueble al pasar por el renglón. */
export function avisoPorClave(avisos: readonly Aviso[]): Map<string, Aviso & { grupo: GrupoDeRevision }> {
  const m = new Map<string, Aviso & { grupo: GrupoDeRevision }>();
  for (const a of avisos) if (!m.has(a.clave)) m.set(a.clave, { ...a, grupo: grupoDelAviso(a.seccion, a.dias) });
  return m;
}

/** Las secciones de las participaciones (`utils/revisarParticipaciones.ts`)
 *  con la sección de esta lista que les toca. */
export const SECCION_DE_PARTICIPACIONES: Record<
  "sin_dibujar" | "con_problemas" | "para_revisar" | "por_caducar" | "borradores" | "sin_mueble" | "sin_termino",
  SeccionDeRevisar
> = {
  sin_dibujar: "falta_distribuir",
  con_problemas: "distribucion_con_problemas",
  para_revisar: "distribucion_para_revisar",
  por_caducar: "reservas",
  borradores: "borradores",
  sin_mueble: "participacion_sin_mueble",
  sin_termino: "sin_termino",
};

/** Los días para actuar de un renglón de las participaciones: para empezar
 *  (lo que falta distribuir) o para caducar (una reserva). */
export function diasDelRenglon(it: { empiezaEn?: number; caducaEn?: number }): number | undefined {
  return it.caducaEn ?? it.empiezaEn;
}

/** Las tarjetas de las participaciones de UN grupo: cada renglón cae en el
 *  grupo de su sección y sus días, y una tarjeta sin renglones no va. */
export function deParticipacionesEn<
  T extends { tipo: keyof typeof SECCION_DE_PARTICIPACIONES; items: readonly I[] },
  I extends { empiezaEn?: number; caducaEn?: number },
>(secciones: readonly T[], grupo: GrupoDeRevision): (T & { items: I[] })[] {
  const fuera: (T & { items: I[] })[] = [];
  for (const s of secciones) {
    const items = s.items.filter((it) => grupoDelAviso(SECCION_DE_PARTICIPACIONES[s.tipo], diasDelRenglon(it)) === grupo);
    if (items.length) fuera.push({ ...s, items });
  }
  return fuera;
}
