/**
 * Lo que Supervisar dice de las participaciones de cara, sin React: las
 * tarjetas de «Para revisar», los segmentos de la barra de capacidad de la
 * ficha y las palabras con que se nombra cada estado (§11 del diseño de
 * participaciones). Las pantallas (`components/Distribucion/RevisarParticipaciones.tsx`,
 * `ParticipacionesDeLaCara.tsx`) sólo dibujan lo que sale de acá, y
 * `probar-comercial.mjs` lo prueba sin navegador.
 *
 * Todo sale de lo que el servidor ya contó con las reglas gemelas
 * (`GET /participaciones/resumen` y `GET /participaciones/cara`): acá no se
 * vuelve a juzgar nada, se ordena y se dice. Las fechas son textos
 * `YYYY-MM-DD` y `hoy` es SIEMPRE el del servidor (la fecha de Colombia).
 *
 * Es de administración: lleva nombres de proveedores y marcas. El trabajador no
 * ve participaciones en Supervisar (D7): sólo la palabra del estado de la cara
 * (`palabraDeLaCara`), que sale de la ocupación anónima y nunca lleva %.
 */
import type { CaraOut, ParticipacionOut, ResumenOut, TerminoOut } from "../api/participaciones";
import { codigoDeParte, esParticipacion, partirCodigo } from "./partes";
import {
  CARA_ENTERA_PB, DIAS_AVISO_CADUCA, pct, type EstadoDeDistribucion, type EstadoVisible,
} from "./participaciones";
import { estampasDeLaCara, TONOS_DE_MARCA, type Textura } from "./coloresDeMarca";
import { carasDe } from "../types/espacio";

/* ── Fechas ────────────────────────────────────────────────────────────────── */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-10-25` → «25 oct» (con el año si no es el de `hoy`). */
export function fechaCorta(iso: string, hoy: string): string {
  const base = `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1] ?? "?"}`;
  return iso.slice(0, 4) === hoy.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** El día `n` días después (en UTC: un día es un día). */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(0);
  d.setUTCFullYear(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n);
  return d.toISOString().slice(0, 10);
}

/** Días de `a` a `b` (b − a). */
export function diasEntre(a: string, b: string): number {
  const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/* ── Palabras ──────────────────────────────────────────────────────────────── */

/** El estado de un término, en palabras. */
export const PALABRA_DEL_TERMINO: Record<EstadoVisible, string> = {
  vigente: "Vigente",
  firmado: "Firmado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  reserva: "Reserva provisional",
  reserva_caducada: "Reserva caducada",
  reserva_cancelada: "Reserva cancelada",
};

/** El estado de la distribución de una cara, en palabras (§3.10). */
export const PALABRA_DE_LA_DISTRIBUCION: Record<EstadoDeDistribucion, string> = {
  sin_mueble: "Sin mueble",
  sin_distribuir: "Sin distribuir",
  borrador: "Borrador sin confirmar",
  para_revisar: "Para revisar",
  confirmada: "Confirmada",
};

/** La palabra con que el TRABAJADOR ve una cara por participación (D7 con
 *  D13): «Libre», «Por participación» o «Tomada». Nunca el %, nunca quién. */
export function palabraDeLaCara(dispo: "libre" | "parcial" | "tomado"): string {
  return dispo === "tomado" ? "Tomada" : dispo === "parcial" ? "Por participación" : "Libre";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/* ── El mueble del plano ───────────────────────────────────────────────────── */

/** Lo que hace falta del mueble para nombrar la cara y abrirla en el 3D. */
export interface MuebleDelPlano { id: string; code: string; type: string; gondolaType?: string | null }

const norm = (s: unknown) => (s == null ? "" : String(s)).trim().toUpperCase();

/** «GON-01 · A» para una cara de un mueble de dos caras; «PUN-03» para uno de
 *  una sola (`carasDe`, la única regla de «¿tiene cara B?»). Sin el mueble en
 *  el plano, con la letra. */
export function rotuloDeCara(codigo: string, cara: "A" | "B", mueble: MuebleDelPlano | undefined): string {
  if (mueble && carasDe(mueble) === 1 && cara === "A") return codigo;
  return `${codigo} · ${cara}`;
}

/* ── «Para revisar» ────────────────────────────────────────────────────────── */

export type TipoDeRevision =
  | "sin_dibujar" | "con_problemas" | "para_revisar" | "por_caducar" | "borradores" | "sin_mueble" | "sin_termino";

export interface ItemDeRevision {
  clave: string;
  /** «GON-01 · A»; vacío cuando la frase ya lo dice todo. */
  rotulo: string;
  frase: string;
  /** Para «Abrir en Distribución»; null si no hay un mueble del plano que abrir. */
  abrir: { fixtureId: string; cara: "A" | "B" } | null;
}

export interface SeccionDeRevision {
  tipo: TipoDeRevision;
  titulo: string;
  items: ItemDeRevision[];
}

/** En qué orden se dicen: primero lo que no se puede ver de otra forma (lo
 *  que cuenta como la cara entera sin estar escrito), después lo que vence
 *  solo (las reservas) y al final lo que se arregla dibujando. */
const ORDEN: TipoDeRevision[] = ["sin_termino", "sin_mueble", "por_caducar", "con_problemas", "para_revisar", "sin_dibujar", "borradores"];

const TITULOS: Record<TipoDeRevision, string> = {
  sin_dibujar: "Contratado sin dibujar",
  con_problemas: "Distribución con problemas",
  para_revisar: "Distribución para revisar",
  por_caducar: "Reservas por caducar",
  borradores: "Borradores sin confirmar",
  sin_mueble: "Participación sin mueble",
  sin_termino: "Contrato de participación sin término",
};

/**
 * Las tarjetas de «Para revisar» de las participaciones de una sede, con el
 * resumen del servidor de HOY (sin filtros: el resumen filtrado por proveedor
 * deja afuera lo que hay que revisar de los demás).
 *
 *  1. *Contratado sin dibujar*: una cara con participaciones que cuentan hoy y
 *     les falta superficie («GON-01 · A: falta dibujar 15 % (2 participaciones).»),
 *     o que todavía no se distribuyó.
 *  2. *Distribución con problemas*: excesos, solapes o zonas fuera de lugar.
 *  3. *Distribución para revisar*: el mueble cambió desde que se confirmó.
 *  4. *Reservas por caducar* (≤ 7 días).
 *  5. *Borradores sin confirmar*: una cara que nunca se confirmó y tiene un
 *     borrador (el resumen no trae la fecha del borrador ni el de una cara ya
 *     confirmada: ésos se ven en la ficha).
 *  6. *Participación sin mueble*: caras con participaciones que el plano ya no
 *     vende así (el resumen da la cuenta).
 *  7. *Contrato de participación sin término*: un contrato `…-PC<n>` sin fila
 *     de participación, que cuenta como la cara entera (§3.2). Con los códigos
 *     que se pudieron identificar (`huerfanos`), si no, la cuenta del servidor.
 *
 * Sólo las secciones con algo: una tarjeta vacía no se dibuja.
 */
export function paraRevisarDeResumen(
  r: ResumenOut, muebles: readonly MuebleDelPlano[], huerfanos: readonly string[] = [],
): SeccionDeRevision[] {
  const porCodigo = new Map<string, MuebleDelPlano>();
  for (const m of muebles) if (m && norm(m.code)) porCodigo.set(norm(m.code), m);
  const secciones = new Map<TipoDeRevision, ItemDeRevision[]>();
  const sumar = (t: TipoDeRevision, it: ItemDeRevision) => secciones.set(t, [...(secciones.get(t) ?? []), it]);
  const limite = sumarDias(r.hoy, DIAS_AVISO_CADUCA);

  for (const c of r.caras) {
    const mueble = porCodigo.get(norm(c.fixture_code));
    const codigo = c.fixture_code || c.codigo_cara;
    const rotulo = rotuloDeCara(codigo, c.cara, mueble);
    const abrir = mueble ? { fixtureId: mueble.id, cara: c.cara } : null;
    const clave = `${c.codigo_cara}`;
    const conTermino = c.participaciones.length;

    if (c.pendiente_dia_pb > 0) {
      const faltan = c.participaciones.filter((p) => p.cuenta_el_dia && p.puntos_basicos > p.dibujado_pb).length;
      sumar("sin_dibujar", {
        clave: `${clave}|pend`, rotulo, abrir,
        frase: `falta dibujar ${pct(c.pendiente_dia_pb)}${faltan > 0 ? ` (${plural(faltan, "participación", "participaciones")})` : ""}.`,
      });
    } else if (c.estado_distribucion === "sin_distribuir" && conTermino > 0) {
      sumar("sin_dibujar", {
        clave: `${clave}|sin`, rotulo, abrir,
        frase: `todavía sin distribuir (${plural(conTermino, "participación", "participaciones")}).`,
      });
    }
    if (c.errores > 0) {
      sumar("con_problemas", {
        clave: `${clave}|err`, rotulo, abrir,
        frase: `${plural(c.errores, "problema", "problemas")} en la distribución.`,
      });
    }
    if (c.estado_distribucion === "para_revisar") {
      sumar("para_revisar", {
        clave: `${clave}|rev`, rotulo, abrir,
        frase: "el mueble cambió desde que se confirmó la distribución.",
      });
    }
    if (c.estado_distribucion === "borrador") {
      sumar("borradores", { clave: `${clave}|bor`, rotulo, abrir, frase: "tiene un borrador sin confirmar." });
    }
    for (const p of c.participaciones) {
      if (p.estado_visible !== "reserva" || !p.caduca || p.caduca > limite) continue;
      const quien = `${p.proveedor ?? "Un proveedor"}${p.marca ? ` (${p.marca})` : ""}`;
      const cuando = p.caduca <= r.hoy ? "caduca hoy" : `caduca el ${fechaCorta(p.caduca, r.hoy)}`;
      sumar("por_caducar", {
        clave: `${clave}|res|${p.codigo ?? p.numero}`, rotulo: "", abrir,
        frase: `Reserva de ${quien} en ${rotulo} ${cuando}.`,
      });
    }
  }

  if (r.totales.sin_mueble > 0) {
    const n = r.totales.sin_mueble;
    sumar("sin_mueble", {
      clave: "sin_mueble", rotulo: "", abrir: null,
      frase: `${plural(n, "cara con participaciones ya no está", "caras con participaciones ya no están")} en el plano como «por participación». Volvé a ponerla${n === 1 ? "" : "s"} así o cancelá lo que quede vivo.`,
    });
  }

  if (huerfanos.length > 0) {
    for (const codigo of huerfanos) {
      sumar("sin_termino", {
        clave: `huerfano|${codigo}`, rotulo: codigo, abrir: null,
        frase: "cuenta como la cara entera hasta que se aclare.",
      });
    }
  } else if (r.totales.huerfanos > 0) {
    sumar("sin_termino", {
      clave: "huerfanos", rotulo: "", abrir: null,
      frase: `${plural(r.totales.huerfanos, "contrato de participación sin término cuenta", "contratos de participación sin término cuentan")} como la cara entera hasta que se aclare.`,
    });
  }

  return ORDEN.filter((t) => secciones.has(t)).map((t) => ({ tipo: t, titulo: TITULOS[t], items: secciones.get(t)! }));
}

/** Cuántas cosas hay para revisar (lo que suma la cuenta de «Para revisar»). */
export function cuantasParaRevisar(secciones: readonly SeccionDeRevision[]): number {
  let n = 0;
  for (const s of secciones) n += s.items.length;
  return n;
}

/**
 * Los contratos de participación sin término (§3.2) que se pueden nombrar: los
 * `…-PC<n>` que el mapa de la base trae vivos (ocupados y sin terminar antes de
 * hoy) sobre una cara por participación del plano, y que el resumen no lista
 * (el resumen lista toda participación con un término que rige o está por
 * venir). Un contrato con término vivo siempre está en el resumen; uno que no
 * está, no tiene término.
 */
export function huerfanosDelEstado(
  estado: Readonly<Record<string, { status: string; endDate?: string }>>, r: ResumenOut,
): string[] {
  const caras = new Set(r.caras.map((c) => norm(c.codigo_cara)));
  const conTermino = new Set<string>();
  for (const c of r.caras) for (const p of c.participaciones) if (p.codigo) conTermino.add(norm(p.codigo));
  const fuera: string[] = [];
  for (const [codigo, e] of Object.entries(estado)) {
    const c = norm(codigo);
    const partido = partirCodigo(c);
    if (!esParticipacion(partido.parte)) continue;
    if (!e || e.status !== "occupied" || (e.endDate && e.endDate < r.hoy)) continue;
    if (!caras.has(codigoDeParte(partido.base, partido.cara, null))) continue;
    if (!conTermino.has(c)) fuera.push(c);
  }
  return fuera.sort();
}

/* ── La ficha: la barra de capacidad de hoy ───────────────────────────────── */

export interface SegmentoDeCapacidad {
  clave: string;
  pb: number;
  /** «3 · 25 %», «Libre 40 %», «Vendida entera». */
  rotulo: string;
  tipo: "contrato" | "reserva" | "libre" | "entera";
  /** El tono (`--marca-k`) y la textura de la participación; null en lo libre y lo entero. */
  tono: number | null;
  textura: Textura | null;
}

/**
 * Los segmentos de la barra de capacidad de HOY de una cara (§11: la única
 * figura de la ficha): uno por participación que cuenta hoy, con su estampa
 * (`estampasDeLaCara`, la misma del lienzo y la leyenda), y lo libre. Si hoy
 * la cara está vendida entera (o un contrato sin término la cubre), un solo
 * segmento «Vendida entera». Los rótulos llevan el número: el color nunca va
 * solo.
 */
export function segmentosDeHoy(cara: Pick<CaraOut, "hoy" | "capacidad" | "participaciones">): SegmentoDeCapacidad[] {
  const hoy = cara.hoy;
  if (cara.capacidad.fisicos.some((f) => f.desde <= hoy && hoy <= f.hasta)) {
    return [{ clave: "entera", pb: CARA_ENTERA_PB, rotulo: "Vendida entera", tipo: "entera", tono: null, textura: null }];
  }
  const vivas = cara.participaciones.filter((p) => p.viva);
  const estampas = estampasDeLaCara(vivas.map((p) => ({
    spaceId: p.space_id, numero: p.numero, supplierId: proveedorDe(p)?.id ?? 0,
  })));
  const porNumero = new Map(cara.participaciones.map((p) => [p.numero, p]));
  const fuera: SegmentoDeCapacidad[] = [];
  let usado = 0;
  const hoyCuentan = cara.capacidad.intervalos
    .filter((i) => i.desde <= hoy && hoy <= i.hasta)
    .sort((a, b) => a.numero - b.numero);
  for (const i of hoyCuentan) {
    const p = porNumero.get(i.numero);
    const e = p ? estampas.get(p.space_id) : undefined;
    const tono = e ? TONOS_DE_MARCA.indexOf(e.tono as (typeof TONOS_DE_MARCA)[number]) : -1;
    fuera.push({
      clave: `${i.numero}|${i.desde}`, pb: i.pb, rotulo: `${i.numero} · ${pct(i.pb)}`, tipo: i.tipo,
      tono: tono >= 0 ? tono : null, textura: e?.textura ?? null,
    });
    usado += i.pb;
  }
  const libre = Math.max(0, CARA_ENTERA_PB - usado);
  if (libre > 0) fuera.push({ clave: "libre", pb: libre, rotulo: `Libre ${pct(libre)}`, tipo: "libre", tono: null, textura: null });
  return fuera;
}

/** El proveedor de una participación (el de su término más nuevo: renovar no
 *  cambia de proveedor, I2). */
export function proveedorDe(p: Pick<ParticipacionOut, "terminos">): { id: number; nombre: string } | null {
  return p.terminos[0]?.proveedor ?? null;
}

/** El término que la ficha muestra de una participación: el que rige hoy si
 *  hay uno, si no el más nuevo. */
export function terminoQueSeMuestra(p: Pick<ParticipacionOut, "terminos">, hoy: string): TerminoOut | null {
  const rige = p.terminos.find((t) =>
    (t.estado_visible === "vigente" || t.estado_visible === "reserva") && t.desde <= hoy && hoy <= t.hasta);
  return rige ?? p.terminos[0] ?? null;
}

/** El término que se renueva desde la ficha, o null: el más nuevo, si es un
 *  contrato vivo (vigente o firmado) que termina dentro de `dias` (60, como
 *  el «Renovar» de siempre: antes no hay nada que renovar). El servidor manda
 *  igual (I1, `no_renovable`). */
export function terminoParaRenovar(p: Pick<ParticipacionOut, "terminos">, hoy: string, dias = 60): TerminoOut | null {
  const t = p.terminos[0];
  if (!t || t.estado !== "contrato") return null;
  if (t.estado_visible !== "vigente" && t.estado_visible !== "firmado") return null;
  return diasEntre(hoy, t.hasta) <= dias ? t : null;
}
