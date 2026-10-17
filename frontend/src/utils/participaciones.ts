/**
 * Las reglas de las participaciones de cara: qué término cuenta un día, cuánto
 * queda para vender, las invariantes de los términos de una participación y el
 * juicio de una distribución (sus zonas contra lo contratado).
 *
 * Gemela de `backend/app/services/reglas_participacion.py`: las dos corren los
 * MISMOS casos (`scripts/casos/participaciones.json`, con
 * `probar-distribucion.mjs` de este lado y `tests/test_participaciones_reglas.py`
 * del otro) y tienen que dar exactamente lo mismo, frases incluidas. Lo que la
 * dueña ve mientras carga una participación o dibuja («En esas fechas queda
 * 40 %», «La participación 3 tiene dibujado 26 %…») es lo que el servidor
 * acepta o rechaza con el candado tomado: si las dos cuentas se separaran, el
 * formulario diría que entra y el servidor contestaría 409.
 *
 * Sin base, sin reloj y sin React: `hoy` es SIEMPRE un parámetro (el que manda
 * el servidor en cada respuesta, la fecha de Colombia de `app/fechas.py`; acá
 * nunca se pregunta la hora del navegador). Las fechas son textos
 * `YYYY-MM-DD`, que se comparan como texto. Los porcentajes van en puntos
 * básicos enteros (1 pb = 0,01 %; 10 000 = la cara entera). La geometría
 * (validar, medir, lo que se pisan dos participaciones) es de
 * `zonasGeometria.ts`; acá sólo se juzga lo medido.
 *
 * Diseño: §3 de `participaciones/21-diseno-final.md` (scratchpad de la etapa).
 */
import { AREA_MINIMA_M2, type CodigoDeZona, type Medidas } from "./zonasGeometria";

/* ── Constantes (§3.1) ─────────────────────────────────────────────────────── */

export const CARA_ENTERA_PB = 10000;
export const PB_MIN = 1;
export const PB_MAX = 10000;
/** D8: lo dibujado no pasa lo contratado, estricto. «Ajustar al contratado»
 *  deja margen por su cuenta (`edicionDeZonas.ts`). */
export const TOLERANCIA_EXCESO_PB = 0;
/** Supervisar avisa de las reservas que caducan dentro de estos días. */
export const DIAS_AVISO_CADUCA = 7;

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

export type EstadoDeTermino = "reserva" | "reserva_cancelada" | "contrato";
/** Lo que dice la interfaz de un término (§3.3). */
export type EstadoVisible =
  | "vigente" | "firmado" | "vencido" | "cancelado"
  | "reserva" | "reserva_caducada" | "reserva_cancelada";

export interface LeaseDeTermino { isActive: boolean; startDate: string; endDate: string }

/**
 * Un término de una participación (una reserva provisional o un contrato),
 * como lo arma el cliente desde `TerminoOut`. En un contrato, proveedor,
 * marca y fechas son los de su lease (la única verdad, §2.2): las reglas leen
 * las fechas de `lease` cuando lo hay.
 */
export interface Termino {
  id: number; spaceId: number; numero: number; estado: EstadoDeTermino; pb: number;
  supplierId: number; marca: string | null; desde: string; hasta: string;
  caduca: string | null;
  /** El día de la cancelación en Colombia, calculado por el servidor (§3.2). */
  bajaFecha: string | null;
  lease: LeaseDeTermino | null;
}

/** Lo vendido entero o por partes físicas de la cara (o un lease de
 *  participación sin término, `huerfano`): cuenta como la cara entera. */
export interface Fisico { codigo?: string; desde: string; hasta: string; huerfano?: boolean }
export interface Intervalo { desde: string; hasta: string; pb: number }

/** Un «no» con su frase, listo para el 409 (`code`, `message` y lo de `extra`). */
export interface Rechazo { codigo: string; frase: string; extra: { disponiblePb?: number; dia?: string } }

/** El cambio que se quiere hacer sobre los términos de UNA participación. */
export type CambioDeTermino =
  | { tipo: "alta" }
  | { tipo: "renovar"; renuevaA: number; desde: string; hasta: string; pb: number; supplierId: number; marca: string | null }
  | { tipo: "editar" | "confirmar"; id: number; pb?: number; desde?: string; hasta?: string; marca?: string | null };

export type CodigoDeProblema =
  | CodigoDeZona | "ZONA_AJENA" | "ZONA_DE_PARTICIPACION_TERMINADA" | "ZONA_SIN_SUPERFICIE_UTIL"
  | "EXCESO" | "SOLAPE" | "PENDIENTE" | "PARA_REVISAR" | "TERMINOS_DESIGUALES";

/** = `ProblemaOut` (§5.3): `zona` es el índice 0-based en la lista enviada o
 *  guardada; `participaciones`, los NÚMEROS (el n de PC<n>), de menor a mayor. */
export interface Problema { codigo: CodigoDeProblema; frase: string; zona: number | null; participaciones: number[] }

/** Las magnitudes de una participación en la capa juzgada (§3.5). Una que ya
 *  no rige (`viva: false`) no debe ni le sobra nada: `pendiente` y `exceso`
 *  van en 0 (su `contratado` es el del último término, para la historia). */
export interface Cuenta { numero: number | null; viva: boolean; contratado: number; dibujado: number; pendiente: number; exceso: number }

export interface OpcionesDeJuicio {
  /** Las zonas son la capa CONFIRMADA tal como está guardada: las de una
   *  participación que ya no rige son historia (D19) y no son error. Las que
   *  se MANDAN (borrador, confirmar) sí lo son: no se pueden volver a confirmar. */
  confirmada?: boolean;
  /** La firma del mueble cambió desde la confirmación (sólo en lecturas). */
  firmaCambio?: boolean;
  /** «arriba» en el metro: las frases dicen «la tapa» y no «la cara». */
  orientacion?: "frente" | "arriba";
}

export interface Juicio { errores: Problema[]; avisos: Problema[]; cuentas: Map<number, Cuenta> }

/** La ocupación ANÓNIMA de una cara (`GET /participaciones/ocupacion`): sin
 *  nombres, montos ni números de participación. */
export interface OcupacionDeCara { intervalos: Intervalo[]; fisicos: { desde: string; hasta: string }[] }

export type EstadoDeDistribucion = "sin_mueble" | "sin_distribuir" | "borrador" | "para_revisar" | "confirmada";
/** Lo que la base guarda de la distribución de una cara (sólo lo que decide
 *  su estado). Las fechas sólo se miran como presentes o ausentes. */
export interface DistribucionGuardada {
  fixtureId: string | null; confirmadaEn: string | null; firmaConfirmada: string | null; borradorEn: string | null;
}

/* ── Fechas y textos ───────────────────────────────────────────────────────── */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-10-17` → `17 oct 2026` (como `fechaCorta` de `utils/propuesta.ts`). */
function fechaCorta(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** El día siguiente, en UTC (sin husos: un día es un día). */
function masUnDia(iso: string): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) + 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const mayor = (a: string, b: string) => (a > b ? a : b);
const menor = (a: string, b: string) => (a < b ? a : b);

/** «25 %», «33,33 %», «12,5 %», «0,01 %». */
export function pct(pb: number): string {
  if (pb < 0) return "-" + pct(-pb);
  const e = Math.floor(pb / 100);
  const c = pb - e * 100;
  if (c === 0) return `${e} %`;
  return `${e},${String(c).padStart(2, "0").replace(/0+$/, "")} %`;
}

/** Un entero con punto de miles: `2500` → `2.500`. */
function entero(n: number): string {
  const s = String(n);
  let fuera = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) fuera += ".";
    fuera += s[i];
  }
  return fuera;
}

const BLANCO = "[ \\t\\u00a0\\u202f]*";
const RE_PORCENTAJE = new RegExp(`^${BLANCO}([0-9]{1,3})(?:[.,]([0-9]{1,2}))?${BLANCO}%?${BLANCO}$`);

/** Lo que se escribe en «Porcentaje»: «25», «25,5», «25.5», «25 %» → 2500,
 *  2550. `null` si no es un número con hasta dos decimales entre 0,01 y 100. */
export function pbDeTexto(s: string): number | null {
  if (typeof s !== "string") return null;
  const m = RE_PORCENTAJE.exec(s);
  if (!m) return null;
  const pb = Number(m[1]) * 100 + (m[2] === undefined ? 0 : Number(m[2].padEnd(2, "0")));
  return pb >= PB_MIN && pb <= PB_MAX ? pb : null;
}

const ORILLAS = /^[ \t\n\r  ]+|[ \t\n\r  ]+$/g;
/** La marca se compara sin mayúsculas ni espacios de los costados (I2). */
function marcaNormal(m: string | null | undefined): string {
  return (m ?? "").replace(ORILLAS, "").toLowerCase();
}

/* ── Qué cuenta un día (§3.3) ──────────────────────────────────────────────── */

/** Las fechas del término: las del lease si es un contrato con lease. */
function fechasDe(t: Termino): [string, string] {
  if (t.estado === "contrato" && t.lease) return [t.lease.startDate, t.lease.endDate];
  return [t.desde, t.hasta];
}

/** La reserva se sostiene hoy (compara con HOY, no con el día que se mira). */
function seSostiene(t: Termino, hoy: string): boolean {
  return t.caduca != null && t.caduca >= hoy;
}

/** ¿El término cuenta en la capacidad el día `d`? Para `d ≥ hoy` es «contrato
 *  activo que cubre el día» o «reserva no caducada que cubre el día»; la rama
 *  del pasado (lo vencido contó sus días; lo cancelado, hasta la baja) sirve
 *  a los informes. */
export function cuentaElDia(t: Termino, d: string, hoy: string): boolean {
  if (t.estado === "contrato") {
    const L = t.lease;
    if (!L) return false;
    if (!(L.startDate <= d && d <= L.endDate)) return false;
    if (L.isActive) return true;
    if (t.bajaFecha == null) return L.endDate < hoy;
    return d < t.bajaFecha;
  }
  if (t.estado === "reserva") return seSostiene(t, hoy) && t.desde <= d && d <= t.hasta;
  return false;
}

/** ¿Alguno de los términos cuenta el día `d`? («Ver al día», §9.4.) */
export function cuentaEseDia(ts: readonly Termino[], d: string, hoy: string): boolean {
  for (const t of ts) if (cuentaElDia(t, d, hoy)) return true;
  return false;
}

/** El término cuenta hoy o más adelante. */
export function vivo(t: Termino, hoy: string): boolean {
  if (t.estado === "contrato") return t.lease != null && t.lease.isActive && t.lease.endDate >= hoy;
  if (t.estado === "reserva") return seSostiene(t, hoy) && t.hasta >= hoy;
  return false;
}

/** El estado que dice la interfaz. Un contrato sin lease (dato roto) se lee
 *  como cerrado: «cancelado». */
export function estadoVisible(t: Termino, hoy: string): EstadoVisible {
  if (t.estado === "contrato") {
    const L = t.lease;
    if (t.bajaFecha != null || !L) return "cancelado";
    if (L.endDate < hoy) return "vencido";
    if (!L.isActive) return "cancelado";
    if (L.startDate > hoy) return "firmado";
    return "vigente";
  }
  if (t.estado === "reserva_cancelada") return "reserva_cancelada";
  if (!seSostiene(t, hoy)) return "reserva_caducada";
  return "reserva";
}

/* ── Capacidad por día y disponible por período (§3.4) ─────────────────────── */

/** Lo que cuenta desde hoy: lo físico como la cara entera, los contratos
 *  activos y las reservas que se sostienen. `excluir`: el término que se está
 *  cambiando (no compite consigo mismo). Sólo vale para días ≥ hoy. */
export function intervalosQueCuentan(ts: readonly Termino[], fisicos: readonly Fisico[], hoy: string,
  excluir?: number | null): Intervalo[] {
  const I: Intervalo[] = [];
  for (const f of fisicos) I.push({ desde: f.desde, hasta: f.hasta, pb: CARA_ENTERA_PB });
  for (const t of ts) {
    if (excluir != null && t.id === excluir) continue;
    if (t.estado === "contrato" && t.lease && t.lease.isActive) {
      I.push({ desde: t.lease.startDate, hasta: t.lease.endDate, pb: t.pb });
    } else if (t.estado === "reserva" && seSostiene(t, hoy)) {
      I.push({ desde: t.desde, hasta: t.hasta, pb: t.pb });
    }
  }
  return I;
}

/** Los eventos de la suma diaria recortados a [desde, hasta], ordenados por
 *  fecha y, en la misma fecha, primero las salidas: un intervalo que termina
 *  el 30 y otro que empieza el 1 no se suman. */
function eventos(I: readonly Intervalo[], desde: string, hasta: string): [string, number][] {
  const ev: [string, number][] = [];
  for (const it of I) {
    const a = mayor(it.desde, desde), b = menor(it.hasta, hasta);
    if (a > b) continue;
    ev.push([a, it.pb], [masUnDia(b), -it.pb]);
  }
  ev.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : Math.sign(x[1]) - Math.sign(y[1])));
  return ev;
}

/** El máximo de la suma diaria en [desde, hasta] y el primer día en que se
 *  alcanza (`desde` si no hay nada). */
export function pico(I: readonly Intervalo[], desde: string, hasta: string): { pb: number; dia: string } {
  let suma = 0, mejor = 0, dia = desde;
  for (const [f, delta] of eventos(I, desde, hasta)) {
    suma += delta;
    if (suma > mejor) { mejor = suma; dia = f; }
  }
  return { pb: mejor, dia };
}

/** Lo comprometido el día `d`. */
export function comprometido(I: readonly Intervalo[], d: string): number {
  return pico(I, d, d).pb;
}

/** Lo que se puede vender en TODO el período (el pasado no se vende). Lo
 *  dibujado no lo cambia. */
export function disponible(I: readonly Intervalo[], desde: string, hasta: string, hoy: string): number {
  const a = mayor(desde, hoy);
  if (a > hasta) return 0;
  return Math.max(0, CARA_ENTERA_PB - pico(I, a, hasta).pb);
}

/** El primer día de [desde, hasta] en que queda algo para vender, o null. */
function primerDiaConLugar(I: readonly Intervalo[], desde: string, hasta: string): string | null {
  if (desde > hasta) return null;
  let suma = 0, desdeAca = desde;
  const ev = eventos(I, desde, hasta);
  let i = 0;
  while (i < ev.length) {
    const f = ev[i][0];
    if (desdeAca < f && suma < CARA_ENTERA_PB) return desdeAca;
    while (i < ev.length && ev[i][0] === f) { suma += ev[i][1]; i++; }
    desdeAca = f;
  }
  return desdeAca <= hasta && suma < CARA_ENTERA_PB ? desdeAca : null;
}

/**
 * La regla de capacidad (§3.4): la vista previa del formulario y, en el
 * servidor, la decisión con el candado. Mira sólo [max(desde, hoy), hasta]: el
 * pasado no se valida. `I` sin el término propio. Las frases no nombran
 * proveedores ni montos (las puede ver Vender en vivo).
 */
export function revisarCapacidad(I: readonly Intervalo[], fisicos: readonly Fisico[], pb: number,
  desde: string, hasta: string, cara: "A" | "B", hoy: string): Rechazo | null {
  const a = mayor(desde, hoy);
  if (a > hasta) return null;
  for (const f of fisicos) {
    if (f.desde <= hasta && a <= f.hasta) {
      const cuando = `del ${fechaCorta(f.desde)} al ${fechaCorta(f.hasta)}`;
      return {
        codigo: "cara_vendida_entera",
        frase: f.huerfano
          ? `La cara ${cara} tiene un contrato de participación sin término ${cuando}, que cuenta como la cara entera `
            + "hasta que se aclare (Supervisar → «Para revisar»): en esas fechas no se vende por participación."
          : `La cara ${cara} está vendida entera o por partes ${cuando}: en esas fechas no se vende por participación.`,
        extra: {},
      };
    }
  }
  const p = pico(I, a, hasta);
  if (p.pb + pb > CARA_ENTERA_PB) {
    const queda = Math.max(0, CARA_ENTERA_PB - p.pb);
    return {
      codigo: "capacidad_excedida",
      frase: `No entra: el ${fechaCorta(p.dia)} la cara ${cara} ya tiene ${pct(p.pb)} comprometido; `
        + `queda ${pct(queda)} y pediste ${pct(pb)}.`,
      extra: { disponiblePb: queda, dia: p.dia },
    };
  }
  return null;
}

/* ── Invariantes de término (§3.5) ─────────────────────────────────────────── */

const rechazo = (codigo: string, frase: string): Rechazo => ({ codigo, frase, extra: {} });

/** El término vivo más nuevo (el de inicio más tarde; a igual inicio, el de
 *  id mayor). */
function elMasNuevo(vivos: readonly Termino[]): Termino | null {
  let mejor: Termino | null = null;
  for (const t of vivos) {
    if (mejor === null) { mejor = t; continue; }
    const a = fechasDe(t)[0], b = fechasDe(mejor)[0];
    if (a > b || (a === b && t.id > mejor.id)) mejor = t;
  }
  return mejor;
}

const YA_NO_RIGE = "Esa participación ya no rige: cargala de nuevo con «Nueva participación» (se prellena).";
const NO_EDITABLE = "Sólo se cambia una reserva provisional viva: un contrato se cancela o se renueva.";

/**
 * Las tres invariantes de los términos de UNA participación (§3.5), más el
 * estado del término que se toca (§4.7, §5.3): renovar sólo el contrato vivo
 * más nuevo, cambiar o confirmar sólo una reserva viva. Orden: el estado, I2
 * (proveedor y marca, contra TODOS los otros términos), I3 (porcentaje, contra
 * los otros vivos) e I1 (fechas, contra los otros vivos): primero lo que sólo
 * se arregla con «Nueva participación», después lo que se arregla con otras
 * fechas. En un cambio, I2 e I3 se miran sólo si el cambio toca la marca o el
 * porcentaje: un dato viejo desparejo no frena cambiar otra cosa.
 */
export function revisarTerminos(de: readonly Termino[], cambio: CambioDeTermino, hoy: string): Rechazo | null {
  if (cambio.tipo === "alta") return null;
  const vivos: Termino[] = [];
  for (const t of de) if (vivo(t, hoy)) vivos.push(t);
  let nuevo: { desde: string; hasta: string; pb: number; supplierId: number; marca: string | null };
  let otros: Termino[];
  let miraMarca: boolean, miraPb: boolean;
  const renovar = cambio.tipo === "renovar";
  if (cambio.tipo === "renovar") {
    const t = de.find((x) => x.id === cambio.renuevaA);
    if (!t || !vivo(t, hoy)) return rechazo("no_renovable", YA_NO_RIGE);
    if (t.estado !== "contrato") {
      return rechazo("no_renovable", "Una reserva provisional no se renueva: confirmala como contrato o cambiá sus fechas.");
    }
    const ultimo = elMasNuevo(vivos);
    if (ultimo && ultimo.id !== t.id) {
      const [a, b] = fechasDe(ultimo);
      return rechazo("no_renovable",
        `La participación ${t.numero} ya tiene un término más nuevo (del ${fechaCorta(a)} al ${fechaCorta(b)}): renová ése.`);
    }
    nuevo = { desde: cambio.desde, hasta: cambio.hasta, pb: cambio.pb, supplierId: cambio.supplierId, marca: cambio.marca };
    otros = [...de];
    miraMarca = true; miraPb = true;
  } else {
    const t = de.find((x) => x.id === cambio.id);
    if (cambio.tipo === "editar") {
      if (!t || t.estado !== "reserva" || !vivo(t, hoy)) return rechazo("no_editable", NO_EDITABLE);
    } else {
      if (!t || t.estado !== "reserva") return rechazo("no_editable", "Sólo se confirma una reserva provisional viva.");
      if (!seSostiene(t, hoy)) {
        return rechazo("reserva_caducada", t.caduca != null
          ? `La reserva caducó el ${fechaCorta(t.caduca)}: cargá una nueva.`
          : "La reserva caducó: cargá una nueva.");
      }
      if (!vivo(t, hoy)) return rechazo("no_editable", "Sólo se confirma una reserva provisional viva.");
    }
    const [d0, h0] = fechasDe(t);
    nuevo = {
      desde: cambio.desde ?? d0, hasta: cambio.hasta ?? h0, pb: cambio.pb ?? t.pb,
      supplierId: t.supplierId, marca: cambio.marca !== undefined ? cambio.marca : t.marca,
    };
    otros = de.filter((x) => x.id !== t.id);
    miraMarca = cambio.marca !== undefined && marcaNormal(cambio.marca) !== marcaNormal(t.marca);
    miraPb = cambio.pb != null && cambio.pb !== t.pb;
  }
  // I2: el mismo proveedor y la misma marca que todos los otros términos.
  if (miraMarca) {
    for (const o of otros) {
      if (o.supplierId !== nuevo.supplierId || marcaNormal(o.marca) !== marcaNormal(nuevo.marca)) {
        return rechazo("otro_proveedor", "Otro proveedor u otra marca es otra participación: cargala con «Nueva participación».");
      }
    }
  }
  // I3: el mismo porcentaje que los otros vivos.
  if (miraPb) {
    for (const o of otros) {
      if (vivo(o, hoy) && o.pb !== nuevo.pb) {
        return rechazo("otro_porcentaje", "Con otro porcentaje es una participación nueva: cargala con «Nueva participación» "
          + "(podés dibujarla en el mismo lugar desde que empiece).");
      }
    }
  }
  // I1: los vivos no se pisan en fechas. Al renovar, el nuevo empieza después
  // de todos (§4.7).
  const n = de.length > 0 ? de[0].numero : null;
  if (renovar) {
    let ultimo: Termino | null = null;
    for (const o of vivos) if (ultimo === null || fechasDe(o)[1] > fechasDe(ultimo)[1]) ultimo = o;
    if (ultimo && nuevo.desde <= fechasDe(ultimo)[1]) {
      const [a, b] = fechasDe(ultimo);
      return rechazo("termino_superpuesto",
        `La participación ${n} ya tiene un término del ${fechaCorta(a)} al ${fechaCorta(b)}: el nuevo tiene que empezar después.`);
    }
  } else {
    const pisan: Termino[] = [];
    for (const o of otros) {
      if (!vivo(o, hoy)) continue;
      const [a, b] = fechasDe(o);
      if (a <= nuevo.hasta && nuevo.desde <= b) pisan.push(o);
    }
    if (pisan.length > 0) {
      let primero = pisan[0];
      for (const o of pisan) if (fechasDe(o)[0] < fechasDe(primero)[0]) primero = o;
      const [a, b] = fechasDe(primero);
      return rechazo("termino_superpuesto",
        `La participación ${n} ya tiene otro término del ${fechaCorta(a)} al ${fechaCorta(b)}: las fechas no pueden pisarse.`);
    }
  }
  return null;
}

/** ¿Rige la participación (tiene algún término vivo)? Sin ninguno, sus zonas
 *  son historia (D19): no cuentan, no chocan y se dibujan en gris. */
export function rige(ts: readonly Termino[], hoy: string): boolean {
  for (const t of ts) if (vivo(t, hoy)) return true;
  return false;
}

/** Lo contratado de una participación (§3.5): el pb de sus vivos (todos
 *  iguales por I3; si un dato viejo los trae distintos, el menor y
 *  `desiguales`); sin vivos, el del último término, para la historia. */
export function contratadoPb(ts: readonly Termino[], hoy: string): { pb: number; desiguales: boolean } {
  let pb: number | null = null, desiguales = false;
  for (const t of ts) {
    if (!vivo(t, hoy)) continue;
    if (pb === null) pb = t.pb;
    else if (t.pb !== pb) { desiguales = true; if (t.pb < pb) pb = t.pb; }
  }
  if (pb !== null) return { pb, desiguales };
  let ultimo: Termino | null = null;
  for (const t of ts) {
    if (ultimo === null) { ultimo = t; continue; }
    const a = fechasDe(t)[0], b = fechasDe(ultimo)[0];
    if (a > b || (a === b && t.id > ultimo.id)) ultimo = t;
  }
  return { pb: ultimo ? ultimo.pb : 0, desiguales: false };
}

/* ── Solape (§3.6) ─────────────────────────────────────────────────────────── */

/** Los períodos en que rige la participación desde hoy. */
function ventanas(ts: readonly Termino[], hoy: string): [string, string][] {
  const w: [string, string][] = [];
  for (const t of ts) {
    if (!vivo(t, hoy)) continue;
    const [a, b] = fechasDe(t);
    const a2 = mayor(a, hoy);
    if (a2 <= b) w.push([a2, b]);
  }
  return w;
}

/** El primer día (desde hoy) en que rigen las dos participaciones, o null. */
function primerCruce(t1: readonly Termino[], t2: readonly Termino[], hoy: string): string | null {
  let primero: string | null = null;
  for (const [a1, b1] of ventanas(t1, hoy)) {
    for (const [a2, b2] of ventanas(t2, hoy)) {
      if (a1 <= b2 && a2 <= b1) {
        const d = mayor(a1, a2);
        if (primero === null || d < primero) primero = d;
      }
    }
  }
  return primero;
}

/** ¿Hay algún día, desde hoy, en que rigen las dos? Si no, pueden ocupar la
 *  misma región (D19). El lienzo pinta el solape sólo si esto es cierto. */
export function seCruzanEnFechas(t1: readonly Termino[], t2: readonly Termino[], hoy: string): boolean {
  return primerCruce(t1, t2, hoy) !== null;
}

/* ── El juicio de una distribución (§3.8) ──────────────────────────────────── */

/** «La zona 1…»: a la persona se le cuenta desde 1 (`zona` sigue 0-based). */
function fraseDeZona(codigo: CodigoDeZona, k: number, superficie: string): string {
  const z = `La zona ${k + 1}`;
  switch (codigo) {
    case "ZONA_MALFORMADA": return `${z} no es una lista de puntos: borrala y dibujala de nuevo.`;
    case "ZONA_POCOS_VERTICES": return `${z} tiene menos de tres puntos: agregale puntos o borrala.`;
    case "ZONA_DEMASIADOS_VERTICES": return `${z} tiene más de 24 puntos: simplificala o partila en dos.`;
    case "ZONA_FUERA": return `${z} se sale de ${superficie}: tiene que quedar adentro.`;
    case "ZONA_SE_CRUZA": return `${z} se cruza consigo misma: dibujala sin que sus bordes se crucen.`;
    case "ZONA_SIN_AREA": return `${z} es demasiado chica (menos de 1 cm²).`;
  }
}

const PARA_REVISAR_FRASE = "El mueble cambió desde que se confirmó esta distribución (medidas, entrepaños o tipo): "
  + "revisala y volvé a confirmar.";

/** Las participaciones de la cara y las que aparecen en lo medido, por id. */
function participacionesDe(m: Medidas, terminosPorS: ReadonlyMap<number, readonly Termino[]>): number[] {
  const ss = new Set<number>();
  for (const s of terminosPorS.keys()) ss.add(s);
  for (const s of m.dibujadoPb.keys()) ss.add(s);
  return [...ss].sort((a, b) => a - b);
}

/**
 * Juzga lo medido (`medir` de `zonasGeometria.ts`) con los términos: barato,
 * así el servidor lo corre adentro del candado con los términos frescos.
 *   1. por zona, en orden: su código de validación (error); una zona que no es
 *      de ninguna participación de la cara (`ZONA_AJENA`, error); la de una
 *      participación que ya no rige (error al mandarla; en la confirmada
 *      guardada es historia y no dice nada); si no, `ZONA_SIN_SUPERFICIE_UTIL`
 *      (aviso). Un aviso nunca tapa un error: una zona tiene un solo problema.
 *   2. por participación viva con zonas: `EXCESO` si dibujado > contratado.
 *   3. por par que se pisa más de 1 cm² y cuyas fechas se cruzan: `SOLAPE`.
 *   4. por participación viva: `TERMINOS_DESIGUALES` (dato viejo) y
 *      `PENDIENTE` si falta dibujar.
 *   5. `PARA_REVISAR` si la firma cambió.
 */
export function juzgar(m: Medidas, terminosPorS: ReadonlyMap<number, readonly Termino[]>, hoy: string,
  opciones: OpcionesDeJuicio = {}): Juicio {
  const superficie = opciones.orientacion === "arriba" ? "la tapa" : "la cara";
  const errores: Problema[] = [], avisos: Problema[] = [];
  const cuentas = new Map<number, Cuenta>();
  const desiguales = new Set<number>();
  for (const s of participacionesDe(m, terminosPorS)) {
    const ts = terminosPorS.get(s);
    const dibujado = m.dibujadoPb.get(s) ?? 0;
    if (!ts) {
      cuentas.set(s, { numero: null, viva: false, contratado: 0, dibujado, pendiente: 0, exceso: 0 });
      continue;
    }
    const viva = rige(ts, hoy);
    const c = contratadoPb(ts, hoy);
    if (c.desiguales) desiguales.add(s);
    cuentas.set(s, {
      numero: ts.length > 0 ? ts[0].numero : null, viva, contratado: c.pb, dibujado,
      pendiente: viva ? Math.max(0, c.pb - dibujado) : 0, exceso: viva ? dibujado - c.pb : 0,
    });
  }
  const conLugar = new Set(m.sinSuperficieUtil);
  // 1. Cada zona.
  for (const v of m.validaciones) {
    const cu = cuentas.get(v.participacionSpaceId);
    const conocida = terminosPorS.has(v.participacionSpaceId);
    if (opciones.confirmada && conocida && cu && !cu.viva) continue;   // historia (D19)
    const ns = cu && cu.numero !== null ? [cu.numero] : [];
    if (v.codigo !== null) {
      errores.push({ codigo: v.codigo, frase: fraseDeZona(v.codigo, v.k, superficie), zona: v.k, participaciones: ns });
    } else if (!conocida) {
      errores.push({ codigo: "ZONA_AJENA", frase: `La zona ${v.k + 1} no es de ninguna participación de esta cara: borrala.`,
        zona: v.k, participaciones: [] });
    } else if (cu && !cu.viva) {
      errores.push({ codigo: "ZONA_DE_PARTICIPACION_TERMINADA",
        frase: `La zona ${v.k + 1} es de la participación ${cu.numero}, que ya no rige (vencida, cancelada o caducada): `
          + "borrala; queda en el historial.",
        zona: v.k, participaciones: ns });
    } else if (conLugar.has(v.k)) {
      avisos.push({ codigo: "ZONA_SIN_SUPERFICIE_UTIL",
        frase: `La zona ${v.k + 1} cae entera sobre lo que no se vende (zócalo, parantes, copete): no suma.`,
        zona: v.k, participaciones: ns });
    }
  }
  // 2. Más dibujado que contratado.
  for (const [s, cu] of cuentas) {
    if (!cu.viva || !m.dibujadoPb.has(s) || cu.numero === null) continue;
    if (cu.exceso > TOLERANCIA_EXCESO_PB) {
      errores.push({ codigo: "EXCESO",
        frase: `La participación ${cu.numero} tiene dibujado ${pct(cu.dibujado)} y contratado ${pct(cu.contratado)}: `
          + "achicá sus zonas (o usá «Ajustar al contratado»).",
        zona: null, participaciones: [cu.numero] });
    }
  }
  // 3. Dos participaciones que se pisan y rigen a la vez.
  for (const p of m.pisadas) {
    if (!(p.m2 > AREA_MINIMA_M2)) continue;
    const t1 = terminosPorS.get(p.s1), t2 = terminosPorS.get(p.s2);
    if (!t1 || !t2 || !seCruzanEnFechas(t1, t2, hoy)) continue;
    const n1 = cuentas.get(p.s1)!.numero!, n2 = cuentas.get(p.s2)!.numero!;
    const ns = n1 < n2 ? [n1, n2] : [n2, n1];
    errores.push({ codigo: "SOLAPE",
      frase: `Las zonas de las participaciones ${ns[0]} y ${ns[1]} se pisan (${entero(Math.floor(p.m2 * 10000 + 0.5))} cm²) `
        + "y sus fechas se cruzan: separalas.",
      zona: null, participaciones: ns });
  }
  // 4. Lo que falta dibujar (y los datos viejos desparejos).
  for (const [s, cu] of cuentas) {
    if (!cu.viva || cu.numero === null) continue;
    if (desiguales.has(s)) {
      avisos.push({ codigo: "TERMINOS_DESIGUALES",
        frase: `La participación ${cu.numero} tiene términos con porcentajes distintos (dato viejo): se toma el menor.`,
        zona: null, participaciones: [cu.numero] });
    }
    if (cu.pendiente > 0) {
      avisos.push({ codigo: "PENDIENTE",
        frase: `A la participación ${cu.numero} le falta dibujar ${pct(cu.pendiente)} de ${pct(cu.contratado)}.`,
        zona: null, participaciones: [cu.numero] });
    }
  }
  // 5. El mueble cambió desde la confirmación.
  if (opciones.firmaCambio) avisos.push({ codigo: "PARA_REVISAR", frase: PARA_REVISAR_FRASE, zona: null, participaciones: [] });
  return { errores, avisos, cuentas };
}

/* ── Un cambio de término no puede romper la confirmada (§3.11) ────────────── */

const claveDe = (p: Problema) => `${p.codigo}|${[...p.participaciones].sort((a, b) => a - b).join(",")}`;
const rompe = (r: Juicio) => r.errores.filter((p) => p.codigo === "SOLAPE" || p.codigo === "EXCESO");

/**
 * Los SOLAPE y EXCESO que la capa medida tiene con los términos de `despues`
 * y no tenía con los de `antes` (clave: código y números de participación).
 * Lo que ya estaba roto no frena. Con algo nuevo, el servidor contesta 409
 * `rompe_distribucion` sobre la confirmada (y lo pone en `avisos` sobre el
 * borrador). Las frases dicen qué rompe el cambio.
 */
export function rompeDistribucion(m: Medidas, antes: ReadonlyMap<number, readonly Termino[]>,
  despues: ReadonlyMap<number, readonly Termino[]>, hoy: string): Problema[] {
  const ya = new Set(rompe(juzgar(m, antes, hoy, { confirmada: true })).map(claveDe));
  const juicio = juzgar(m, despues, hoy, { confirmada: true });
  const porNumero = new Map<number, number>();
  for (const [s, cu] of juicio.cuentas) if (cu.numero !== null) porNumero.set(cu.numero, s);
  const nuevos: Problema[] = [];
  for (const p of rompe(juicio)) {
    if (ya.has(claveDe(p))) continue;
    if (p.codigo === "SOLAPE") {
      const [n1, n2] = p.participaciones;
      const dia = primerCruce(despues.get(porNumero.get(n1)!)!, despues.get(porNumero.get(n2)!)!, hoy)!;
      nuevos.push({ ...p, frase: `Con esas fechas, las zonas de la participación ${n1} pisan las de la ${n2} desde el `
        + `${fechaCorta(dia)}: corregí la distribución (o elegí otras fechas) y volvé a intentar.` });
    } else {
      const cu = juicio.cuentas.get(porNumero.get(p.participaciones[0])!)!;
      nuevos.push({ ...p, frase: `Con ese porcentaje, la participación ${cu.numero} queda con ${pct(cu.dibujado)} dibujado y `
        + `${pct(cu.contratado)} contratado: achicá sus zonas (o elegí otro porcentaje) y volvé a intentar.` });
    }
  }
  return nuevos;
}

/** El `message` del 409 `rompe_distribucion`: el primer problema y cuántos más. */
export function mensajeDeRompe(problemas: readonly Problema[]): string {
  if (problemas.length === 0) return "";
  const mas = problemas.length - 1;
  if (mas === 0) return problemas[0].frase;
  return `${problemas[0].frase} Además hay ${mas} problema${mas === 1 ? "" : "s"} más.`;
}

/* ── Estados derivados de la distribución (§3.9, §3.10) ────────────────────── */

/** La confirmada quedó vieja: el mueble cambió (firma distinta, o sin firma). */
export function paraRevisar(d: DistribucionGuardada | null, firmaActual: string | null): boolean {
  return d !== null && d.confirmadaEn != null && d.firmaConfirmada !== firmaActual;
}

/** `porParticipacion`: el mueble está en el plano y esta cara se vende por
 *  participación. `fixtureId`: el id del mueble del plano que tiene hoy el
 *  código (una distribución dibujada para otro mueble no vale, §2.5). */
export function estadoDistribucion(porParticipacion: boolean, fixtureId: string | null,
  d: DistribucionGuardada | null, firmaActual: string | null): EstadoDeDistribucion {
  if (!porParticipacion) return "sin_mueble";
  if (d === null || (d.confirmadaEn == null && d.borradorEn == null) || d.fixtureId !== fixtureId) return "sin_distribuir";
  if (d.confirmadaEn == null) return "borrador";
  if (paraRevisar(d, firmaActual)) return "para_revisar";
  return "confirmada";
}

/* ── La ocupación anónima (Vender, Supervisar, plano 2D, banda 3D: §4.8, §10.8) */

/**
 * Cómo se pinta y se rotula una cara por participación en el período, sin
 * nombres: `tomado` si no queda nada para vender en todo el período, `libre`
 * si no hay nada comprometido, `parcial` si no. `quedaPb` = `disponible`;
 * `libreDesde`: el primer día del período (desde hoy) en que queda algo para
 * vender, o null.
 */
export function dispoPorParticipacion(o: OcupacionDeCara, desde: string, hasta: string, hoy: string):
  { dispo: "tomado" | "parcial" | "libre"; quedaPb: number; libreDesde: string | null } {
  const I: Intervalo[] = [];
  for (const f of o.fisicos ?? []) I.push({ desde: f.desde, hasta: f.hasta, pb: CARA_ENTERA_PB });
  for (const it of o.intervalos ?? []) I.push({ desde: it.desde, hasta: it.hasta, pb: it.pb });
  const queda = disponible(I, desde, hasta, hoy);
  const libreDesde = primerDiaConLugar(I, mayor(desde, hoy), hasta);
  return { dispo: queda === 0 ? "tomado" : queda === CARA_ENTERA_PB ? "libre" : "parcial", quedaPb: queda, libreDesde };
}
