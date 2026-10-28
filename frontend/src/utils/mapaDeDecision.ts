/**
 * EL MAPA DE DECISIÓN de Indicadores (versión B, aprobada el 2026-10-28).
 *
 * El plano para contratar pinta el estado de cada cara (libre, en parte,
 * tomada). Este mapa es otra cosa: la misma planta, en una base neutra, con UNA
 * capa de datos por indicador —el ingreso, lo que vence, los montajes, lo vacío,
 * lo vendido en parte, un cliente— para decidir dónde actuar. Acá vive la regla,
 * sin React: qué dice cada espacio, cómo se parte la brecha del potencial, qué
 * acción va primero y dónde va cada etiqueta para que no se pisen. Lo prueba
 * `scripts/probar-mapa-de-decision.mjs` sin navegador.
 */

export type CapaDelMapa = "acciones" | "ingreso" | "vence" | "montaje" | "vacias" | "parcial" | "cliente";

/** El estado de un montaje en el mapa, del más urgente al menos. */
export type EstadoDeMontajeEnElMapa = "no_realizado" | "no_coincide" | "sin_montar" | "guia" | "por_verificar";

export const ORDEN_DEL_MONTAJE: readonly EstadoDeMontajeEnElMapa[] = ["no_realizado", "no_coincide", "sin_montar", "guia", "por_verificar"];

export const TEXTO_DEL_MONTAJE: Record<EstadoDeMontajeEnElMapa, string> = {
  no_realizado: "no realizado",
  no_coincide: "no coincide",
  sin_montar: "sin montar",
  guia: "guía sin enviar",
  por_verificar: "por verificar",
};

/** Lo que el mapa sabe de UNA cara. La plata es `null` para quien no la ve. */
export interface EspacioDelMapa {
  /** `fixtureId-cara`, la llave de todo el tablero. */
  clave: string;
  fixtureId: string;
  cara: "A" | "B";
  codigo: string;
  /** Si se vende (cuenta en la ocupación). Los muebles que no se venden sólo
   *  aparecen en la capa de montajes, por sus planogramas. */
  comercial: boolean;
  estado: "vendida" | "parcial" | "libre" | "otro";
  /** Lo vendido hoy, de 0 a 1. `null`: no se dice (la participación, a quien
   *  no administra). */
  vendido: number | null;
  /** Vendida por partes (entrepaños, puertas): cuántas hay y cómo están. */
  partes?: { total: number; vendidas: number; reservadas: number; nombre: string };
  ingresoAlMes: number | null;
  /** Lo que falta vender, a tarifa, al mes. */
  libreAlMes: number | null;
  tarifa: number | null;
  clientes: string[];
  /** El vencimiento sin renovar más próximo, en 90 días. */
  vence: { dias: number; fecha: string; alMes: number | null; codigo: string; proveedor: string | null } | null;
  montaje: EstadoDeMontajeEnElMapa | null;
  /** Lo que dice el montaje que manda: el motivo, quién lo reportó. */
  montajeDetalle: string | null;
  /** Libre: días desde que terminó su último contrato (`null`: no se sabe). */
  diasSinContrato: number | null;
  nuncaContratada: boolean;
  /** El tipo del mueble en palabras («Punta de góndola»). */
  tipo: string;
  /** Lo que queda en una cara vendida en parte: «4 de 6 entrepaños libres»,
   *  «60 % libre» (el % sólo para quien administra). */
  detalleParcial: string | null;
  /** Los contratos que corren o están firmados en la cara (y en sus partes),
   *  para la ficha de negociación. */
  contratos: { codigo: string; proveedor: string; alMes: number | null; desde: string; hasta: string; vigente: boolean }[];
}

/** Lo que falta para el potencial, por causa. Las cuatro partes suman el
 *  potencial (con `sobreTarifa` cuando se cobra más que la tarifa).
 *
 *  Antes la pantalla decía «Sin alquilar · 4 caras» con el valor de las caras
 *  vacías MÁS las partes libres de las caras vendidas en parte, y «se cobra
 *  por debajo de la tarifa» con lo que quedaba sin vender de las caras por
 *  participación: dos rótulos que no decían lo que contaban, y que chocaban
 *  con «precio contra tarifa 102 %». */
export interface BrechaDelPotencial {
  potencial: number;
  cobrado: number;
  /** Las caras enteras sin contrato, a tarifa. */
  vacias: number;
  /** Lo que queda libre en las caras vendidas en parte: partes sin vender y lo
   *  que no está comprometido de las caras por participación. */
  enParciales: number;
  /** El resto: ventas sin cargar, contratos que todavía no empiezan y precios
   *  por encima o por debajo de la tarifa, neto. Nunca negativo. */
  precioYCobro: number;
  /** Lo que se cobra por encima del potencial (si pasa). */
  sobreTarifa: number;
  /** Lo que falta para el potencial. */
  falta: number;
}

export function brechaDelPotencial(d: { potencial: number; cobrado: number; vacias: number; enParciales: number }): BrechaDelPotencial {
  const potencial = Math.max(0, d.potencial);
  const cobrado = Math.max(0, d.cobrado);
  const vacias = Math.max(0, Math.min(d.vacias, potencial));
  const enParciales = Math.max(0, Math.min(d.enParciales, potencial - vacias));
  const resto = potencial - cobrado - vacias - enParciales;
  return {
    potencial, cobrado, vacias, enParciales,
    precioYCobro: Math.max(0, resto),
    sobreTarifa: Math.max(0, -resto),
    falta: Math.max(0, potencial - cobrado),
  };
}

/** Partes de un total que suman 100 (resto mayor): «61 · 20 · 18 · 1», nunca
 *  «61 · 20 · 17 · 1» que suma 99. */
export function porcentajesQueSuman(valores: readonly number[]): number[] {
  const total = valores.reduce((t, v) => t + Math.max(0, v), 0);
  if (total <= 0) return valores.map(() => 0);
  const crudos = valores.map((v) => (Math.max(0, v) / total) * 100);
  const base = crudos.map(Math.floor);
  let falta = 100 - base.reduce((t, v) => t + v, 0);
  const orden = crudos.map((c, i) => ({ i, r: c - Math.floor(c) })).sort((a, b) => b.r - a.r);
  for (const { i } of orden) { if (falta <= 0) break; base[i]++; falta--; }
  return base;
}

// ─── Las acciones prioritarias ──────────────────────────────────────────────

export type TipoDeAccion =
  | "renovar" | "vencido" | "ventas" | "no_montado" | "planograma_no_se_pudo"
  | "planograma_sin_montar" | "planograma_por_revisar" | "planograma_no_coincide" | "sin_montar";

/** Qué tan alta va cada tipo: lo que ya es plata que se pierde, primero. */
const PESO: Record<TipoDeAccion, number> = {
  vencido: 100, renovar: 90, ventas: 80, no_montado: 70, planograma_no_se_pudo: 60,
  planograma_sin_montar: 50, sin_montar: 45, planograma_no_coincide: 40, planograma_por_revisar: 30,
};

export interface Accion {
  tipo: TipoDeAccion;
  clave: string;
  /** Plata al mes que toca (la renovación); `null` si no hay o no se ve. */
  impacto: number | null;
  /** Días para el plazo (negativo: ya pasó). */
  dias: number | null;
}

/** Alta: lo que pierde plata ahora (un vencimiento a una semana o menos, lo
 *  vencido, ventas sin cargar, un montaje que no se pudo hacer). */
export function prioridadDe(a: Pick<Accion, "tipo" | "dias">): "alta" | "media" {
  if (a.tipo === "vencido" || a.tipo === "ventas" || a.tipo === "no_montado") return "alta";
  if (a.tipo === "renovar") return a.dias !== null && a.dias <= 7 ? "alta" : "media";
  return "media";
}

/** El orden de la lista: prioridad, después lo que más plata toca, después el
 *  peso del tipo y lo más cercano. */
export function ordenarAcciones<T extends Accion>(acciones: readonly T[]): T[] {
  return [...acciones].sort((a, b) => {
    const pa = prioridadDe(a) === "alta" ? 0 : 1, pb = prioridadDe(b) === "alta" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ia = a.impacto ?? 0, ib = b.impacto ?? 0;
    if (ia !== ib) return ib - ia;
    if (PESO[a.tipo] !== PESO[b.tipo]) return PESO[b.tipo] - PESO[a.tipo];
    return (a.dias ?? 9999) - (b.dias ?? 9999) || a.clave.localeCompare(b.clave);
  });
}

// ─── Qué enciende cada capa ─────────────────────────────────────────────────

export function enLaCapa(e: EspacioDelMapa, capa: CapaDelMapa, cliente?: string | null): boolean {
  switch (capa) {
    // Lo que trabaja hoy, aunque todavía no haya pagado (un contrato por %
    // de las ventas sin el corte cargado): la misma cuenta que la ocupación.
    case "ingreso": return e.comercial && ((e.ingresoAlMes ?? 0) > 0 || e.estado === "vendida" || e.estado === "parcial");
    case "vence": return e.vence !== null;
    case "montaje": return e.montaje !== null;
    case "vacias": return e.comercial && e.estado === "libre";
    case "parcial": return e.comercial && e.estado === "parcial";
    case "cliente": return !!cliente && e.clientes.includes(cliente);
    case "acciones": return false;
  }
}

/** El más urgente de varios montajes de la misma cara (un entrepaño no
 *  realizado y otro sin montar: manda el no realizado). */
export function montajeQueManda(estados: readonly (EstadoDeMontajeEnElMapa | null | undefined)[]): EstadoDeMontajeEnElMapa | null {
  let mejor: EstadoDeMontajeEnElMapa | null = null;
  for (const e of estados) if (e && (mejor === null || ORDEN_DEL_MONTAJE.indexOf(e) < ORDEN_DEL_MONTAJE.indexOf(mejor))) mejor = e;
  return mejor;
}

/** El color de lo que vence, por urgencia (los de estado, siempre con texto). */
export function colorDelVencimiento(dias: number): "critico" | "serio" | "aviso" {
  return dias <= 30 ? "critico" : dias <= 60 ? "serio" : "aviso";
}

// ─── Las etiquetas: arriba del mapa, en filas, sin pisarse ─────────────────

export interface EtiquetaPedida { x: number; ancho: number }
export interface EtiquetaUbicada { izq: number; fila: number }

/**
 * Dónde va cada etiqueta: en una, dos o tres filas arriba del mapa según
 * quepan, y dentro de cada fila corridas hasta no tocarse. Antes se repartían
 * a ancho fijo y, con textos largos, quedaban una encima de otra (el dueño,
 * 2026-10-28, sobre «Caras sin contrato»). Devuelve en el orden de entrada.
 */
export function empacarEtiquetas(pedidas: readonly EtiquetaPedida[], ancho: number, separacion = 8, maxFilas = 3): EtiquetaUbicada[] {
  const orden = pedidas.map((p, i) => ({ ...p, i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const filas = filasDeEtiquetas(pedidas, ancho, separacion, maxFilas);
  const out: EtiquetaUbicada[] = pedidas.map(() => ({ izq: 0, fila: 0 }));
  for (let f = 0; f < filas; f++) {
    const fila = orden.filter((_, k) => k % filas === f);
    // De izquierda a derecha: cada una donde quiere, o pegada a la anterior.
    const izq: number[] = [];
    let borde = 4;
    for (const p of fila) { const x = Math.max(p.x - p.ancho / 2, borde); izq.push(x); borde = x + p.ancho + separacion; }
    // De derecha a izquierda: lo que se pasó del borde vuelve, empujando.
    let lim = ancho - 4;
    for (let k = fila.length - 1; k >= 0; k--) {
      if (izq[k] + fila[k].ancho > lim) izq[k] = lim - fila[k].ancho;
      lim = izq[k] - separacion;
    }
    // Si aun así la primera quedó afuera (la fila no entra), se apilan desde 4.
    if (fila.length && izq[0] < 4) {
      let b = 4;
      for (let k = 0; k < fila.length; k++) { izq[k] = Math.max(izq[k], b); b = izq[k] + fila[k].ancho + separacion; }
    }
    fila.forEach((p, k) => { out[p.i] = { izq: izq[k], fila: f }; });
  }
  return out;
}

/** Cuántas filas hacen falta para que las etiquetas entren a lo ancho: se
 *  reparten de izquierda a derecha, una en cada fila por turno, y se suma una
 *  fila mientras alguna no entre (hasta `maxFilas`). Lo usan el empaque y el
 *  mapa, que reserva ese alto arriba. */
export function filasDeEtiquetas(pedidas: readonly EtiquetaPedida[], ancho: number, separacion = 8, maxFilas = 3): number {
  if (pedidas.length === 0) return 0;
  const orden = [...pedidas].sort((a, b) => a.x - b.x);
  for (let f = 1; f < maxFilas; f++) {
    const largo = Array.from({ length: f }, () => 4);
    orden.forEach((p, k) => { largo[k % f] += p.ancho + separacion; });
    if (Math.max(...largo) <= ancho) return f;
  }
  return maxFilas;
}

/** Qué etiquetas se ponen cuando no entran todas (en TERRON vencían 42 en 90
 *  días y los globos tapaban el mapa, el dueño 2026-10-28): las de más peso,
 *  mientras entren en `maxFilas` filas y no pasen de `tope`, dejando lugar
 *  para la etiqueta «+N más» si quedan afuera. Las otras siguen en el mapa
 *  por su color, en la lista de abajo y al pasar el mouse. Devuelve los
 *  índices elegidos, en el orden de entrada. */
export function elegirEtiquetas(
  pedidas: readonly { ancho: number; peso: number }[], ancho: number,
  { separacion = 8, maxFilas = 3, tope = 10, anchoDelResto = 120 }: { separacion?: number; maxFilas?: number; tope?: number; anchoDelResto?: number } = {},
): number[] {
  const orden = pedidas.map((p, i) => ({ ...p, i })).sort((a, b) => b.peso - a.peso || a.i - b.i);
  const entra = (anchos: number[]) => {
    const f = filasDeEtiquetas(anchos.map((a, k) => ({ x: k, ancho: a })), ancho, separacion, maxFilas + 1);
    return f <= maxFilas;
  };
  const elegidas: typeof orden = [];
  for (const p of orden) {
    if (elegidas.length >= tope) break;
    const quedan = orden.length - elegidas.length - 1;
    const anchos = [...elegidas.map((x) => x.ancho), p.ancho, ...(quedan > 0 ? [anchoDelResto] : [])];
    if (!entra(anchos)) break;
    elegidas.push(p);
  }
  return elegidas.map((x) => x.i).sort((a, b) => a - b);
}

/** Cuánto mide un texto de etiqueta (aproximado, para empacar): el código va
 *  en monoespaciada de 11 px y el detalle en la letra del texto de 10,5 px. */
export function anchoDeEtiqueta(l1: string, l2?: string | null): number {
  return Math.max(l1.length * 7, (l2 ?? "").length * 6.1) + 20;
}

// ─── Las piezas de un mueble ────────────────────────────────────────────────

/** Una caja en planta (metros) con su alto. */
export interface Caja { x0: number; x1: number; z0: number; z1: number }

/** Parte una caja a lo largo: la fracción [t0, t1] de su lado más largo. */
export function tramoDeCaja(c: Caja, t0: number, t1: number): Caja {
  const largoZ = c.z1 - c.z0 >= c.x1 - c.x0;
  if (largoZ) { const L = c.z1 - c.z0; return { ...c, z0: c.z0 + t0 * L, z1: c.z0 + t1 * L }; }
  const L = c.x1 - c.x0;
  return { ...c, x0: c.x0 + t0 * L, x1: c.x0 + t1 * L };
}

/** Las dos mitades de una góndola doble, como las corta el plano: si es más
 *  ancha que honda el corte va por Z (la A del lado de −z); si no, por X (la A
 *  del lado de −x). */
export function mitadesDeLaGondola(c: Caja): { A: Caja; B: Caja } {
  const anchoManda = c.x1 - c.x0 >= c.z1 - c.z0;
  if (anchoManda) { const zm = (c.z0 + c.z1) / 2; return { A: { ...c, z1: zm }, B: { ...c, z0: zm } }; }
  const xm = (c.x0 + c.x1) / 2;
  return { A: { ...c, x1: xm }, B: { ...c, x0: xm } };
}
