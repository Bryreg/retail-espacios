import type { EstadoPorEspacio } from "./estadoComercial";

/**
 * «Editar contrato»: las cuentas puras de la edición, en un lugar que pueden
 * importar Vender (la ficha que se reabre con el contrato cargado) y
 * Supervisar (el botón que la abre) sin que Vender alcance un módulo de
 * Supervisar (`probar-vender`).
 *
 * · Qué es lo que se edita (`EdicionDeContrato`): EL contrato del renglón
 *   —su `leaseId`, de `GET /spaces/comercial`, sólo para quien administra— y
 *   lo que el renglón mostró (`esperado`), que el servidor compara bajo el
 *   candado (409 `contrato_cambio`). Nunca se busca el contrato por código.
 * · El propio contrato NO cuenta como tomado contra sí mismo
 *   (`estadoSinElPropio`, `ocupacionSinElPropio`): la misma regla que el
 *   servidor (`excluir_lease`, `excluir_termino`).
 * · «Qué cambia» (`queCambia`): lo de antes → lo nuevo, y si cambia la forma
 *   de venderse (el viejo se cierra como «reemplazado»).
 * · Los cortes de ventas que ya vencieron (`avisoDeCortes`): la regla de
 *   `services/cobros.periodos` del servidor, con los mismos casos
 *   (`scripts/casos/cobro-por-ventas.json`).
 *
 * Sin la nota interna del contrato en ningún lado: Vender lo mira el proveedor.
 * Las fechas son días ISO, nunca `new Date("…")`.
 */

export type CorteDeVentas = "mensual" | "al_final";
export type FormaDelContrato = "entera" | "parte" | "pieza" | "participacion";

/** Lo que el renglón de Supervisar mostró del contrato: va como `esperado`. */
export interface EsperadoDelContrato { valor: number; desde: string; hasta: string }

/** Un contrato como lo lee «Qué cambia». Sin nota. */
export interface FotoDelContrato {
  forma: FormaDelContrato;
  /** El código de la cara como se lee («PUN-04», «GON-02·B»). */
  visibleCara: string;
  /** Las partes («EN1», «EN2»); en una pieza, la pieza («BI1»). */
  partes: string[];
  proveedor: string;
  marca: string;
  desde: string;
  hasta: string;
  /** El TOTAL del plazo (0 con cobro por ventas). */
  valor: number;
  modoPrecio: "total" | "mensual" | null;
  valorTecleado: number | null;
  cobro: { porcentaje: number; corte: CorteDeVentas } | null;
  /** Un porcentaje de la cara, en puntos básicos. */
  pb: number | null;
}

/** Lo que trae la semilla de Vender cuando se edita (Supervisar la arma con
 *  `GET /contratos/{id}/edicion` y con lo que el renglón mostró). */
export interface EdicionDeContrato {
  leaseId: number;
  esperado: EsperadoDelContrato;
  /** El código completo del espacio del contrato (de un porcentaje, el PC). */
  codigo: string;
  /** El código completo de la cara (para un porcentaje, la que se reparte). */
  cara: string;
  sede: string;
  antes: FotoDelContrato;
  /** Ya arrancó (Colombia): el «Desde» no se mueve. */
  arranco: boolean;
  /** El último día con ventas cargadas, o `null`. */
  ultimoCorte: string | null;
  cortes: number;
  /** El nombre de la planometría que tiene (lo dice «Qué cambia» si se reemplaza). */
  planometria: string | null;
  /** El correo del proveedor, para el aviso de a quién se reenvía. */
  correo: string | null;
  /** Su aviso de montaje todavía espera la planometría (o la zona). */
  montajePendiente: boolean;
  hoy: string;
}

/* ── El propio contrato no está tomado contra sí mismo ──────────────────── */

/** El mapa comercial sin el contrato que se edita: lo que él ocupa queda
 *  libre (un contrato vigente y otro próximo en la misma cara: el otro sigue
 *  contando, porque el mapa trae uno por espacio y con su `leaseId`). */
export function estadoSinElPropio(estado: EstadoPorEspacio, leaseId: number | null | undefined): EstadoPorEspacio {
  if (typeof leaseId !== "number") return estado;
  let cambio = false;
  const fuera: EstadoPorEspacio = {};
  for (const [k, v] of Object.entries(estado)) {
    if (v && v.leaseId === leaseId) { cambio = true; continue; }
    fuera[k] = v;
  }
  return cambio ? fuera : estado;
}

interface Ocupacion {
  intervalos: { desde: string; hasta: string; pb: number }[];
  fisicos: { desde: string; hasta: string }[];
}

/** La ocupación anónima de una cara sin el propio contrato: un intervalo con
 *  sus fechas y su % (si era un porcentaje de ESTA cara) o lo físico con sus
 *  fechas (si era la cara entera o una parte). Se saca UNO solo: otro igual
 *  es de otro. */
export function ocupacionSinElPropio<T extends { ocupacion: Ocupacion }>(
  par: T | undefined, propio: { desde: string; hasta: string; pb: number | null },
): T | undefined {
  if (!par) return par;
  const o = par.ocupacion;
  const intervalos = [...(o.intervalos ?? [])];
  const fisicos = [...(o.fisicos ?? [])];
  if (propio.pb !== null) {
    const i = intervalos.findIndex((x) => x.desde === propio.desde && x.hasta === propio.hasta && x.pb === propio.pb);
    if (i < 0) return par;
    intervalos.splice(i, 1);
  } else {
    const i = fisicos.findIndex((x) => x.desde === propio.desde && x.hasta === propio.hasta);
    if (i < 0) return par;
    fisicos.splice(i, 1);
  }
  return { ...par, ocupacion: { ...o, intervalos, fisicos } };
}

/* ── «Qué cambia» ────────────────────────────────────────────────────────── */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const dos = (n: number) => String(n).padStart(2, "0");

/** «21 oct 2026» (la fecha como la dice la app). */
export function diaConAnio(iso: string): string {
  if (!ISO_DIA.test(iso)) return iso;
  return `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

/** Los centavos de un número ≥ 0, redondeados con los medios hacia arriba
 *  sobre su escritura decimal más corta (`String(v)`, como `repr` del
 *  servidor): 0,995 da 100 centavos. */
function centavosDe(a: number): number {
  const s = String(a);
  if (/e/i.test(s)) return a < 1 ? 0 : Math.round(a * 100);
  const [ent, dec = ""] = s.split(".");
  const tres = (dec + "000").slice(0, 3);
  return Number(ent) * 100 + Number(tres.slice(0, 2)) + (Number(tres[2]) >= 5 ? 1 : 0);
}

/** La plata entera y con punto de miles; con decimales, con su coma y hasta
 *  el centavo («$ 0,5»): un contrato de POBLADO guardó «0,5», y «$ 1» no es lo
 *  que tenía. Nunca «M» ni «k». */
export function pesosExactos(valor: number): string {
  const v = Number.isFinite(valor) ? valor : 0;
  const centavos = centavosDe(Math.abs(v));
  const entero = Math.floor(centavos / 100);
  const dec = centavos % 100;
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signo = v < 0 && centavos > 0 ? "-" : "";
  if (dec === 0) return `$ ${signo}${miles}`;
  return `$ ${signo}${miles},${String(dec).padStart(2, "0").replace(/0$/, "")}`;
}

/** «8 %», «7,5 %». */
function porcentaje(p: number): string {
  return `${String(Math.round(p * 100) / 100).replace(".", ",")} %`;
}

/** «PUN-04 entera», «PUN-04 · EN1 y EN2», «GON-01·A · 25 %», «CAJ-04·BI1». */
export function textoDelEspacio(f: Pick<FotoDelContrato, "forma" | "visibleCara" | "partes" | "pb">): string {
  if (f.forma === "participacion") return `${f.visibleCara} · ${porcentaje((f.pb ?? 0) / 100)}`;
  if (f.forma === "entera") return `${f.visibleCara} entera`;
  if (f.forma === "pieza") return `${f.visibleCara}·${f.partes[0] ?? ""}`;
  const p = [...f.partes].sort();
  const lista = p.length <= 1 ? (p[0] ?? "") : `${p.slice(0, -1).join(", ")} y ${p[p.length - 1]}`;
  return `${f.visibleCara} · ${lista}`;
}

/** Cómo se nombra el contrato que se edita: «PUN-04» (la cara entera),
 *  «PUN-03 · EN1» (una parte), «GON-01·A · 50 %» (un porcentaje). */
export function nombreDelContrato(f: Pick<FotoDelContrato, "forma" | "visibleCara" | "partes" | "pb">): string {
  return f.forma === "entera" ? f.visibleCara : textoDelEspacio(f);
}

/** «Precio fijo $ 6», «Precio fijo $ 1.800.000 ($ 600.000 al mes)», «8 % de
 *  las ventas, corte mensual». */
export function textoDelCobro(f: Pick<FotoDelContrato, "valor" | "modoPrecio" | "valorTecleado" | "cobro">): string {
  if (f.cobro) return `${porcentaje(f.cobro.porcentaje)} de las ventas, corte ${f.cobro.corte === "mensual" ? "mensual" : "al final"}`;
  const alMes = f.modoPrecio === "mensual" && f.valorTecleado ? ` (${pesosExactos(f.valorTecleado)} al mes)` : "";
  return `Precio fijo ${pesosExactos(f.valor)}${alMes}`;
}

export interface CambioDelContrato { campo: string; antes: string; ahora: string }

/** ¿Es el MISMO espacio de la misma forma? La misma cara entera, la misma
 *  parte, la misma pieza o un porcentaje de la misma cara. Si no, el viejo se
 *  cierra como «reemplazado» (la regla de `_en_el_lugar` del servidor). */
export function mismoEspacio(antes: FotoDelContrato, ahora: FotoDelContrato): boolean {
  if (antes.forma !== ahora.forma || antes.visibleCara !== ahora.visibleCara) return false;
  if (antes.forma === "entera" || antes.forma === "participacion") return true;
  return ahora.partes.length === 1 && antes.partes.length === 1 && ahora.partes[0] === antes.partes[0];
}

/** Lo de antes → lo nuevo, campo por campo (sólo lo que cambió), y si se
 *  reemplaza. Sin la nota. */
export function queCambia(antes: FotoDelContrato, ahora: FotoDelContrato): {
  cambios: CambioDelContrato[]; reemplazo: boolean;
} {
  const fila = (campo: string, a: string, b: string) => (a === b ? [] : [{ campo, antes: a, ahora: b }]);
  const reemplazo = !mismoEspacio(antes, ahora);
  const cambios = [
    ...fila("Espacio", textoDelEspacio(antes), textoDelEspacio(ahora)),
    ...fila("Proveedor", antes.proveedor.trim(), ahora.proveedor.trim()),
    ...fila("Marca", antes.marca.trim() || "sin marca", ahora.marca.trim() || "sin marca"),
    ...fila("Fechas", `${diaConAnio(antes.desde)} → ${diaConAnio(antes.hasta)}`, `${diaConAnio(ahora.desde)} → ${diaConAnio(ahora.hasta)}`),
    ...fila("Cobro", textoDelCobro(antes), textoDelCobro(ahora)),
  ];
  return { cambios, reemplazo };
}

/** Lo que frena guardar una edición antes de preguntarle al servidor (que
 *  igual lo vuelve a mirar: 422/409), o `null`. */
export function faltaDeLaEdicion(e: EdicionDeContrato, ahora: FotoDelContrato, lineas: number): string | null {
  if (lineas > 1 && ahora.forma !== "parte") return "Una edición lleva un solo espacio, o las partes de una misma cara";
  if (e.arranco && ahora.desde !== e.antes.desde) return `Ya arrancó: el «Desde» sigue en el ${diaConAnio(e.antes.desde)}`;
  if (e.ultimoCorte && ahora.hasta < e.ultimoCorte) return `Hay ventas cargadas hasta el ${diaConAnio(e.ultimoCorte)}: el «Hasta» no puede quedar antes`;
  if (ahora.hasta < e.hoy) return "El «Hasta» no puede quedar antes de hoy";
  if (e.cortes > 0) {
    if (!mismoEspacio(e.antes, ahora)) return "Ya tiene ventas cargadas: no cambia de forma ni de espacio";
    if (!ahora.cobro) return "Ya tiene ventas cargadas: sigue por % de las ventas";
    if (e.antes.cobro && ahora.cobro.corte !== e.antes.cobro.corte) return "Ya tiene ventas cargadas: el corte no cambia";
  }
  return null;
}

/* ── Los cortes que ya vencieron, ANTES de guardar ──────────────────────── */

function finDeMes(iso: string): string {
  const anio = +iso.slice(0, 4), mes = +iso.slice(5, 7);
  return `${iso.slice(0, 4)}-${dos(mes)}-${dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;
}

function diaSiguiente(iso: string): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + 1));
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

/** Los períodos de corte de un contrato (`periodos` del servidor): con corte
 *  mensual, uno por mes CALENDARIO dentro del contrato; «al final», uno solo. */
export function periodosDeCorte(desde: string, hasta: string, corte: CorteDeVentas): [string, string][] {
  if (!ISO_DIA.test(desde) || !ISO_DIA.test(hasta) || hasta < desde) return [];
  if (corte !== "mensual") return [[desde, hasta]];
  const fuera: [string, string][] = [];
  for (let a = desde; a <= hasta;) {
    const fin = finDeMes(a);
    const b = fin < hasta ? fin : hasta;
    fuera.push([a, b]);
    a = diaSiguiente(b);
  }
  return fuera;
}

/** Los períodos ya vencidos (su último día es anterior a `hoy`). */
export function cortesCerrados(desde: string, hasta: string, corte: CorteDeVentas, hoy: string): [string, string][] {
  return periodosDeCorte(desde, hasta, corte).filter(([, b]) => b < hoy);
}

/** El día de hoy en Colombia (UTC−5 todo el año), como `app/fechas.hoy`. */
export function hoyEnColombia(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function mesConAnio(iso: string): string {
  return `${MESES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

/** Lo que Vender dice debajo del corte, antes de guardar:
 *  · Mensual, uno vencido: «Queda 1 corte ya cerrado por cargar (sep 2026)»;
 *    dos: «Quedan 2 cortes ya cerrados por cargar (ago y sep 2026)»; más:
 *    «Quedan 3 cortes ya cerrados por cargar (desde jul 2026)».
 *  · Mensual, sin vencidos: cuándo cierra el primero.
 *  · Al final: «Un solo corte, al terminar el contrato (31 ene 2027)».
 *  `null` sin fechas que se entiendan. Los cortes ya cargados no se cuentan
 *  (`cargadosHasta`: el último día con ventas cargadas). */
export function avisoDeCortes(
  desde: string, hasta: string, corte: CorteDeVentas, hoy: string, cargadosHasta: string | null = null,
): string | null {
  const todos = periodosDeCorte(desde, hasta, corte);
  if (todos.length === 0) return null;
  const cerrados = todos.filter(([a, b]) => b < hoy && !(cargadosHasta && a <= cargadosHasta));
  if (corte !== "mensual") {
    return cerrados.length
      ? `Queda 1 corte ya cerrado por cargar (terminó el ${diaConAnio(hasta)})`
      : `Un solo corte, al terminar el contrato (${diaConAnio(hasta)})`;
  }
  if (cerrados.length === 1) return `Queda 1 corte ya cerrado por cargar (${mesConAnio(cerrados[0][0])})`;
  if (cerrados.length === 2) {
    const [a, b] = [cerrados[0][0], cerrados[1][0]];
    const mismoAnio = a.slice(0, 4) === b.slice(0, 4);
    return `Quedan 2 cortes ya cerrados por cargar (${mismoAnio ? MESES[+a.slice(5, 7) - 1] : mesConAnio(a)} y ${mesConAnio(b)})`;
  }
  if (cerrados.length > 2) {
    return `Quedan ${cerrados.length} cortes ya cerrados por cargar (desde ${mesConAnio(cerrados[0][0])})`;
  }
  const proximo = todos.find(([, b]) => b >= hoy) ?? todos[todos.length - 1];
  return `Ningún corte cerrado todavía: el primero cierra el ${diaConAnio(proximo[1])}`;
}
