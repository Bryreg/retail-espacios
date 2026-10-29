import type {
  CaraDelPlanograma, ColorDeDestino, DestinoOut, EstadoDeLaCara, EstadoDeMontaje, PiezaOut, TipoDeDestino, VersionOut,
} from "../api/planogramas";
import { fechaEnCurso } from "./propuesta";
import { pct, pico } from "./participaciones";
import { formaDeLoDibujado, rectDePoligono, type FormaDePieza, type Ocupado, type Rect } from "./piezas";
import { AREA_MINIMA_M2, areaCubierta, dibujadoPb, validarZona, type Exclusion, type Poligono } from "./zonasGeometria";

/**
 * Planificar una cara con DESTINOS (fase 2 de la distribución, 2026-10-24):
 * lo puro. Las piezas son destinos —una categoría, la marca propia, una
 * promoción…— con el % que quiera quien planifica; se ubican con las mismas
 * formas y la misma cuenta que las marcas de «Distribuir esta cara»
 * (`utils/piezas.ts`, la geometría gemela del servidor). Lo vendido manda: las
 * marcas con lugar confirmado vienen BLOQUEADAS (no se mueven ni se pisan) y lo
 * contratado sin ubicar queda guardado (su % no se usa).
 *
 * La revisión de verdad es la del servidor (`services/planogramas.revisar`):
 * acá se dice lo mismo, antes, para que la persona lo vea al soltar.
 */

/** Una pieza de la cara: un destino (id > 0) o una marca vendida (id < 0:
 *  el `space_id` de su participación, negativo). */
export interface PiezaDelPlano {
  id: number;
  nombre: string;
  /** Lo corto que va sobre la pieza. */
  corto: string;
  pb: number;
  /** El color (token del tema). */
  tono: string;
  poligonos: Poligono[];
  rect: Rect | null;
  forma: FormaDePieza;
  dibujado: number;
  estado: EstadoDePiezaDelPlano;
  /** Con qué pieza choca (su id), si choca. */
  choca: number | null;
  /** Una marca vendida: no se mueve ni se toca. */
  bloqueada: boolean;
  destino: DestinoOut | null;
}

export type EstadoDePiezaDelPlano = "sin_ubicar" | "ubicada" | "falta" | "sobra" | "choca" | "rehacer";

/** Lo que se edita: el destino, su % y su polígono (null: sin ubicar). */
export interface PiezaEnEdicion {
  destinoId: number;
  pb: number;
  vertices: Poligono | null;
}

/** Los tipos de destino, en el orden del formulario, con su ícono (lucide). */
export const TIPOS_DE_DESTINO: { tipo: TipoDeDestino; texto: string }[] = [
  { tipo: "categoria", texto: "Categoría" },
  { tipo: "marca_propia", texto: "Marca propia" },
  { tipo: "producto", texto: "Producto o grupo" },
  { tipo: "promocion", texto: "Promoción" },
  { tipo: "otro", texto: "Otro" },
];
export const textoDelTipo = (t: TipoDeDestino): string => TIPOS_DE_DESTINO.find((x) => x.tipo === t)?.texto ?? "Otro";

export const COLORES_DE_DESTINO: ColorDeDestino[] = ["d1", "d2", "d3", "d4", "d5", "d6"];
/** El color de un destino como token del tema (`--destino-1`…`--destino-6`). */
export const tonoDeDestino = (c: ColorDeDestino): string => `rgb(var(--destino-${c.slice(1)}-rgb))`;
/** Lo vendido, en un gris neutro: no compite con los colores de los destinos. */
export const TONO_VENDIDO = "rgb(var(--ink-3-rgb))";

/** El primer color que no usa ningún destino de la cara (si están todos, el
 *  que menos se repite). */
export function colorLibre(usados: readonly ColorDeDestino[]): ColorDeDestino {
  const cuenta = new Map(COLORES_DE_DESTINO.map((c) => [c, 0]));
  for (const c of usados) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  return COLORES_DE_DESTINO.reduce((m, c) => ((cuenta.get(c) ?? 0) < (cuenta.get(m) ?? 0) ? c : m), COLORES_DE_DESTINO[0]);
}

/** Las piezas que arranca la pantalla: el borrador si hay; si no, la vigente
 *  (para hacer la versión siguiente); si no, ninguna. */
export function piezasDeEntrada(d: CaraDelPlanograma): PiezaEnEdicion[] {
  const fuente: PiezaOut[] = d.planograma.borrador?.piezas ?? d.planograma.vigente?.piezas ?? [];
  return fuente.map((p) => ({ destinoId: p.destino_id, pb: p.pb, vertices: p.vertices }));
}

/** Los destinos que nombra la pantalla: los de la respuesta, los de la sede y
 *  las fotos de la vigente (un destino de una versión vieja puede no estar). */
export function destinosConocidos(d: CaraDelPlanograma, extra: readonly DestinoOut[] = []): Map<number, DestinoOut> {
  const fuera = new Map<number, DestinoOut>();
  for (const p of [...(d.planograma.vigente?.piezas ?? []), ...d.planograma.programadas.flatMap((v) => v.piezas ?? [])]) {
    if (p.destino) fuera.set(p.destino_id, { ...p.destino, id: p.destino_id });
  }
  for (const x of d.biblioteca) fuera.set(x.id, x);
  for (const x of Object.values(d.destinos)) fuera.set(x.id, x);
  for (const x of extra) fuera.set(x.id, x);
  return fuera;
}

/** Lo vendido que se ve como pieza bloqueada (una marca con lugar confirmado). */
export function piezasVendidas(d: CaraDelPlanograma): PiezaDelPlano[] {
  const E = d.superficie.exclusiones;
  return d.vendido.participaciones.filter((p) => p.poligonos.length > 0).map((p) => ({
    id: -p.space_id, nombre: p.nombre, corto: p.nombre.split(" · ").pop() ?? p.nombre, pb: p.pb, tono: TONO_VENDIDO,
    poligonos: p.poligonos, rect: p.poligonos.length === 1 ? rectDePoligono(p.poligonos[0]) : null,
    forma: (formaDeLoDibujado(p.poligonos, E) ?? "a_mano") as FormaDePieza, dibujado: dibujadoPb(p.poligonos, E),
    estado: "ubicada", choca: null, bloqueada: true, destino: null,
  }));
}

/** Lo contratado que todavía no se ubicó: su % queda guardado. */
export function guardadoSinUbicar(d: CaraDelPlanograma): { nombre: string; pb: number }[] {
  return d.vendido.participaciones.filter((p) => p.poligonos.length === 0).map((p) => ({ nombre: p.nombre, pb: p.pb }));
}

const SIN_FIN = "9999-12-31";

/** El % que se lleva lo vendido por participación en el peor día desde hoy
 *  (lo ubicado y lo guardado). */
export function vendidoPico(d: CaraDelPlanograma, desde = d.hoy, hasta = SIN_FIN): number {
  const I = d.vendido.participaciones.flatMap((p) => p.intervalos);
  return I.length ? pico(I, desde, hasta).pb : 0;
}

/** La venta entera que corre hoy (no queda lugar), o null. */
export function vendidaEnteraHoy(d: CaraDelPlanograma): { desde: string; hasta: string } | null {
  return d.vendido.entera.find((e) => e.desde <= d.hoy && d.hoy <= e.hasta) ?? null;
}

/** La primera venta entera que empieza más adelante (pide «hasta» antes), o null. */
export function vendidaEnteraDespues(d: CaraDelPlanograma): { desde: string; hasta: string } | null {
  return [...d.vendido.entera].filter((e) => e.desde > d.hoy).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0] ?? null;
}

/** Lo libre para planificar: la cara entera menos lo vendido (su pico) y lo
 *  que ya llevan los destinos. */
export function libreParaPlanificar(d: CaraDelPlanograma, piezas: readonly PiezaEnEdicion[]): number {
  if (vendidaEnteraHoy(d)) return 0;
  const suma = piezas.reduce((s, p) => s + p.pb, 0);
  return Math.max(0, 10000 - vendidoPico(d) - suma);
}

/** Las piezas de la pantalla: primero lo vendido (bloqueado), después cada
 *  destino con su estado («Arrastrala a la cara», «Ubicada», «Le falta…»,
 *  «Pisa a…»), con la misma cuenta del servidor. */
export function piezasDelPlano(d: CaraDelPlanograma, edicion: readonly PiezaEnEdicion[], destinos: ReadonlyMap<number, DestinoOut>,
  formas: Readonly<Record<number, FormaDePieza>>): PiezaDelPlano[] {
  const sup = d.superficie;
  const E: readonly Exclusion[] = sup.exclusiones;
  const m2 = sup.ancho * sup.alto;
  const vendidas = piezasVendidas(d);
  const validas = new Map<number, Poligono>();
  const rehacer = new Set<number>();
  for (const p of edicion) {
    if (!p.vertices) continue;
    const v = validarZona(p.vertices, sup.ancho, sup.alto);
    if (v.codigo === null && v.vertices) validas.set(p.destinoId, v.vertices);
    else rehacer.add(p.destinoId);
  }
  // Los choques: con otro destino o con lo vendido (más de 1 cm²).
  const chocaCon = new Map<number, number>();
  const ids = [...validas.keys()];
  for (let i = 0; i < ids.length; i++) {
    const a = validas.get(ids[i])!;
    for (const vend of vendidas) {
      if (!chocaCon.has(ids[i]) && areaCubierta([a], E, [...vend.poligonos]) * m2 > AREA_MINIMA_M2) chocaCon.set(ids[i], vend.id);
    }
    for (let j = i + 1; j < ids.length; j++) {
      const b = validas.get(ids[j])!;
      if (areaCubierta([a], E, [b]) * m2 > AREA_MINIMA_M2) {
        if (!chocaCon.has(ids[i])) chocaCon.set(ids[i], ids[j]);
        if (!chocaCon.has(ids[j])) chocaCon.set(ids[j], ids[i]);
      }
    }
  }
  const propias = edicion.map((p): PiezaDelPlano => {
    const dest = destinos.get(p.destinoId) ?? null;
    const poligonos = p.vertices ? [p.vertices] : [];
    const v = validas.get(p.destinoId);
    const dibujado = v ? dibujadoPb([v], E) : 0;
    const choca = chocaCon.get(p.destinoId) ?? null;
    const estado: EstadoDePiezaDelPlano = !p.vertices ? "sin_ubicar" : rehacer.has(p.destinoId) ? "rehacer"
      : choca !== null ? "choca" : dibujado > p.pb ? "sobra" : dibujado < p.pb ? "falta" : "ubicada";
    const nombre = dest?.nombre ?? "Destino";
    return {
      id: p.destinoId, nombre, corto: nombre, pb: p.pb, tono: dest ? tonoDeDestino(dest.color) : TONO_VENDIDO,
      poligonos, rect: p.vertices ? rectDePoligono(p.vertices) : null,
      forma: formas[p.destinoId] ?? (p.vertices ? formaDeLoDibujado(poligonos, E) : null) ?? "franja",
      dibujado, estado, choca, bloqueada: false, destino: dest,
    };
  });
  return [...vendidas, ...propias];
}

/** Lo que una pieza no puede pisar: todas las demás que están en la cara
 *  (lo vendido también: lo vendido manda). */
export function ocupadosDelPlano(id: number, piezas: readonly PiezaDelPlano[]): Ocupado[] {
  return piezas.filter((p) => p.id !== id && p.poligonos.length > 0).map((p) => ({ spaceId: p.id, poligonos: p.poligonos }));
}

/** El estado de una pieza en palabras (la lista de la derecha). */
export function textoDelEstadoDelPlano(p: Pick<PiezaDelPlano, "estado" | "pb" | "dibujado" | "bloqueada">, nombreDeLaOtra: string | null): string {
  if (p.bloqueada) return "Vendida · su lugar no se toca";
  switch (p.estado) {
    case "sin_ubicar": return "Arrastrala a la cara";
    case "ubicada": return "Ubicada";
    case "falta": return `Le falta ${pct(p.pb - p.dibujado)}`;
    case "sobra": return `Sobra ${pct(p.dibujado - p.pb)}`;
    case "choca": return `Pisa a ${nombreDeLaOtra ?? "otra pieza"}`;
    case "rehacer": return "Hay que volver a ubicarla";
  }
}

/** ¿Las piezas de la edición son las mismas que estas otras? (para «sucio» y
 *  «Publicada, sin cambios»). */
export function mismasPiezas(a: readonly PiezaEnEdicion[], b: readonly PiezaEnEdicion[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.destinoId === b[i].destinoId && p.pb === b[i].pb && JSON.stringify(p.vertices) === JSON.stringify(b[i].vertices));
}

/** Qué cambia contra la versión vigente, en palabras (el diálogo de publicar). */
export function queCambia(antes: readonly PiezaEnEdicion[], despues: readonly PiezaEnEdicion[], nombre: (id: number) => string): string[] {
  const porId = new Map(antes.map((p) => [p.destinoId, p]));
  const fuera: string[] = [];
  for (const p of despues) {
    const a = porId.get(p.destinoId);
    if (!a) fuera.push(`${nombre(p.destinoId)} entra con ${pct(p.pb)}.`);
    else if (a.pb !== p.pb) fuera.push(`${nombre(p.destinoId)}: ${pct(a.pb)} → ${pct(p.pb)}.`);
    else if (JSON.stringify(a.vertices) !== JSON.stringify(p.vertices)) fuera.push(`${nombre(p.destinoId)} cambia de lugar.`);
  }
  const quedan = new Set(despues.map((p) => p.destinoId));
  for (const a of antes) if (!quedan.has(a.destinoId)) fuera.push(`${nombre(a.destinoId)} sale de la cara.`);
  return fuera;
}

/** Hace cuánto, en palabras: «hace 1 día», «hace 10 días», «hace 2 meses». */
export function haceCuanto(dias: number): string {
  if (dias <= 1) return "hace 1 día";
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} meses`;
}

/** Un paso de la tira de arriba de «Distribuir la cara» (planograma). */
export interface PasoDelPlanograma {
  numero: 1 | 2 | 3;
  titulo: string;
  detalle: string;
  estado: "hecho" | "ahora" | "despues";
}

/**
 * Los 3 pasos de un planograma (el dueño, 2026-10-29: «para distribuir un
 * mueble no comercializable no se entiende por dónde comenzar ni cómo
 * hacerlo»): 1 elegir qué va, 2 dibujarlo en la cara, 3 publicar con una
 * fecha. El que toca («ahora») es el primero sin hacer; con la versión
 * publicada y sin cambios, los tres están hechos.
 */
export function pasosDelPlanograma(c: { destinos: number; sinUbicar: number; conProblema: number; publicada: boolean }): PasoDelPlanograma[] {
  const hecho = [
    c.publicada || c.destinos > 0,
    c.publicada || (c.destinos > 0 && c.sinUbicar === 0 && c.conProblema === 0),
    c.publicada,
  ];
  const ahora = hecho.indexOf(false);
  const estado = (i: number): PasoDelPlanograma["estado"] => (hecho[i] ? "hecho" : i === ahora ? "ahora" : "despues");
  const n = c.destinos;
  return [
    { numero: 1, titulo: "Elegí qué va", estado: estado(0),
      detalle: n === 0 ? "Categorías, marca propia o promociones" : `${n} ${n === 1 ? "elegido" : "elegidos"}` },
    { numero: 2, titulo: "Dibujalo en la cara", estado: estado(1),
      detalle: c.sinUbicar > 0 ? `Falta ubicar ${c.sinUbicar}` : c.conProblema > 0 ? `Revisá ${c.conProblema}` : n > 0 ? "Todo ubicado" : "Arrastrá cada uno a su lugar" },
    { numero: 3, titulo: "Publicá con una fecha", estado: estado(2),
      detalle: c.publicada ? "Publicada" : "El equipo recibe la guía de montaje" },
  ];
}

/* ── «La cara»: el estado de su reparto (2026-10-29) ───────────────────────── */

/** Por qué una cara pide revisión. */
export type MotivoDeRevision = "vencida" | "mueble_cambio" | "no_coincide" | "no_se_pudo";

/** Lo que dice el bloque «La cara» y la lista de Plano › Caras. `tono`:
 *  «falta» (ámbar: hay algo por hacer), «en_curso» (azul: guardado, falta
 *  publicar o todavía no rige) y «lista» (verde). */
export interface ComoEstaLaCara {
  estado: EstadoDeLaCara;
  motivo: MotivoDeRevision | null;
  tono: "falta" | "en_curso" | "lista";
  /** «Sin repartir», «Borrador guardado», «Lista · versión 2 desde el 12 oct»… */
  titulo: string;
  /** Una línea de qué significa y qué hacer. */
  texto: string;
  /** El botón: «Distribuir la cara», «Seguir y publicar», «Ver o cambiar el reparto»… */
  boton: string;
}

/**
 * El estado del reparto de una cara, desde lo que manda el servidor (el
 * `resumen` del plano o una fila de Plano › Caras). La misma regla que
 * `services/planogramas.caras_de_la_sede`: con versión vigente, «lista» salvo
 * que venció, que el mueble cambió o que su montaje no coincide o no se pudo
 * («para revisar»); sin vigente, «programada», «borrador» o «sin repartir».
 */
export function comoEstaLaCara(c: {
  borrador: boolean; vigente: VersionOut | null; programada: VersionOut | null; montaje?: EstadoDeMontaje | null;
}, hoy: Date = new Date()): ComoEstaLaCara {
  const f = (iso: string) => fechaEnCurso(iso, hoy);
  const v = c.vigente;
  if (v) {
    const motivo: MotivoDeRevision | null = v.para_revisar ? "mueble_cambio"
      : v.vencida_hace_dias != null ? "vencida"
      : c.montaje === "no_coincide" || c.montaje === "no_se_pudo" ? c.montaje
      : null;
    if (motivo) {
      const titulo = motivo === "mueble_cambio" ? "El mueble cambió" : motivo === "vencida" ? `Venció ${haceCuanto(v.vencida_hace_dias!)}`
        : motivo === "no_coincide" ? "El montaje no coincide" : "No se pudo montar";
      const texto = motivo === "mueble_cambio" ? `La versión ${v.numero} se hizo con otras medidas: revisala y publicá la siguiente.`
        : motivo === "vencida" ? `La versión ${v.numero} sigue rigiendo hasta que publiques otra.`
        : motivo === "no_coincide" ? "Lo montado no es lo planificado: revisalo con la foto."
        : "Quien monta avisó que no se pudo: mirá el motivo.";
      const boton = motivo === "no_coincide" || motivo === "no_se_pudo" ? "Revisar el montaje" : "Nueva versión";
      return { estado: "para_revisar", motivo, tono: "falta", titulo, texto, boton };
    }
    return {
      estado: "lista", motivo: null, tono: "lista", titulo: `Lista · versión ${v.numero} desde el ${f(v.rige_desde)}`,
      texto: c.borrador ? "Hay un borrador con cambios sin publicar." : "Cada parte tiene lo que va; el equipo tiene su guía.",
      boton: c.borrador ? "Seguir y publicar" : "Ver o cambiar el reparto",
    };
  }
  if (c.programada) {
    return { estado: "programada", motivo: null, tono: "en_curso", titulo: `Rige desde el ${f(c.programada.rige_desde)}`,
      texto: `La versión ${c.programada.numero} ya está publicada y empieza a regir ese día.`, boton: "Ver o cambiar el reparto" };
  }
  if (c.borrador) {
    return { estado: "borrador", motivo: null, tono: "en_curso", titulo: "Borrador guardado",
      texto: "Falta publicarlo: hasta entonces el equipo no tiene guía.", boton: "Seguir y publicar" };
  }
  return { estado: "sin_repartir", motivo: null, tono: "falta", titulo: "Sin repartir",
    texto: "Todavía no dice qué va en cada parte: el equipo no tiene guía para armarla.", boton: "Distribuir la cara" };
}

/** Las cuentas de arriba de Plano › Caras: cuántas en cada grupo. */
export function contarCaras(caras: readonly { estado: EstadoDeLaCara }[]): { sinRepartir: number; enCurso: number; paraRevisar: number; listas: number } {
  const n = (e: EstadoDeLaCara[]) => caras.filter((c) => e.includes(c.estado)).length;
  return { sinRepartir: n(["sin_repartir"]), enCurso: n(["borrador", "programada"]), paraRevisar: n(["para_revisar"]), listas: n(["lista"]) };
}

/** El filtro de Plano › Caras: lo que no se vende (el de entrada), lo libre
 *  de lo que se vende, o todas. */
export type FiltroDeCaras = "internas" | "lo_libre" | "todas";

export function filtrarCaras<T extends { comercializable: boolean }>(caras: readonly T[], f: FiltroDeCaras): T[] {
  return f === "todas" ? [...caras] : caras.filter((c) => c.comercializable === (f === "lo_libre"));
}
