import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { create } from "zustand";
import { ChevronDown, ChevronRight, MoreHorizontal, RotateCcw } from "lucide-react";
import {
  cancelarReserva, espacioDeLaCara, leerCara, rechazoDe, terminoDeOut,
  type CaraOut, type ParticipacionOut, type TerminoOut, type ZonaOut,
} from "../../api/participaciones";
import { cancelLease } from "../../api/spaces";
import { describeError } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useDistribucionStore } from "../../store/distribucionStore";
import { useFixtureStore } from "../../store/fixtureStore";
import { useModalAbierto } from "../../tema";
import { TONOS_DE_MARCA, estampasDeLaCara, type Estampa } from "../../utils/coloresDeMarca";
import { ajustarAlContratado, revisarZonas, type ZonaEnEdicion } from "../../utils/edicionDeZonas";
import {
  cuentaElDia, cuentaEseDia, disponible, intervalosQueCuentan, pct, pico, seCruzanEnFechas, vivo,
  type Cuenta, type Fisico, type Juicio, type Termino,
} from "../../utils/participaciones";
import {
  areaCubierta, areaUtil, dentroDeLosTopes, dibujadoPb, validarZona, type Exclusion, type Medidas, type Poligono,
} from "../../utils/zonasGeometria";

/**
 * La leyenda de la distribución de una cara (§9.3 del diseño de
 * participaciones) y lo que comparten las piezas de `components/Distribucion/`:
 * con qué se reconoce cada participación (estampa, número), la revisión en
 * vivo de lo dibujado, la capacidad de un día y de un período, cómo se dicen
 * el estado comercial y la vigencia de un término, y el diálogo de siempre.
 *
 * Una fila por participación viva, con las CUATRO magnitudes a la vista
 * —contratado, dibujado, lo que falta dibujar y, arriba, lo que queda para
 * vender—, el estado comercial («Contrato vigente», «Reserva provisional ·
 * caduca el 25 oct») y la vigencia («del 1 nov 2026 al 31 ene 2027»). El
 * color nunca va solo: cada fila lleva su número, su textura (lleno, rayado a
 * 45°, rayado a 135°) y su cinta en tono pleno (§9.7).
 *
 * Clic en una fila = la participación ACTIVA (con la que se dibuja), y
 * resaltada en el lienzo y en el 3D; otro clic la suelta. Las que no cuentan
 * el día de «Ver al día» llevan «desde el 1 dic». La historia (sin términos
 * vivos) va plegada, en gris, con «Cargar de nuevo».
 *
 * Los colores salen de los tokens del tema: los tonos son `--marca-1..3`, y
 * los neutros se escriben `rgb(var(--x-rgb))` y no `var(--x)`: el editor 3D es
 * un cajón oscuro (`tema.css`) que redefine los canales `-rgb`, y un `var(--x)`
 * resuelto en `:root` llegaría adentro con el valor del tema claro.
 */

/* ── Fechas y textos ───────────────────────────────────────────────────────── */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-12-01` → «1 dic 2026»; con `hoy` del mismo año, «1 dic». */
export function fechaLegible(iso: string | null | undefined, hoy?: string): string {
  if (!iso || iso.length < 10) return "—";
  const dia = Number(iso.slice(8, 10)), mes = MESES[Number(iso.slice(5, 7)) - 1] ?? "?", anio = iso.slice(0, 4);
  return hoy && hoy.slice(0, 4) === anio ? `${dia} ${mes}` : `${dia} ${mes} ${anio}`;
}

/** El día `n` días después (o antes) de `iso`, sin husos: un día es un día. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(0);
  d.setUTCFullYear(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n);
  return d.toISOString().slice(0, 10);
}

/** «del 1 nov 2026 al 31 ene 2027». */
export function vigenciaDe(t: Pick<TerminoOut, "desde" | "hasta">): string {
  return `del ${fechaLegible(t.desde)} al ${fechaLegible(t.hasta)}`;
}

/** El estado comercial de un término, dicho entero (el chip de la fila). */
export function estadoComercialDe(t: Pick<TerminoOut, "estado_visible" | "desde" | "caduca">, hoy: string): string {
  switch (t.estado_visible) {
    case "vigente": return "Contrato vigente";
    case "firmado": return `Contrato firmado · empieza el ${fechaLegible(t.desde, hoy)}`;
    case "vencido": return "Contrato vencido";
    case "cancelado": return "Contrato cancelado";
    case "reserva": return t.caduca ? `Reserva provisional · caduca el ${fechaLegible(t.caduca, hoy)}` : "Reserva provisional";
    case "reserva_caducada": return "Reserva caducada";
    case "reserva_cancelada": return "Reserva cancelada";
  }
}

/** El nombre con que se dice una participación: «3 · Postobón · Hit». */
export function nombreDeParticipacion(p: ParticipacionOut): string {
  const t = p.terminos[0];
  const quien = t?.proveedor?.nombre ?? "Sin proveedor";
  return `${p.numero} · ${quien}${t?.marca ? ` · ${t.marca}` : ""}`;
}

/* ── Estampas: el tono de la serie como token ──────────────────────────────── */

/** `var(--marca-k)`: el tono de la estampa como token del tema (los dos temas
 *  lo tienen; `probar-distribucion` compara los valores con `coloresDeMarca`). */
export function tonoCss(e: Estampa): string {
  const k = TONOS_DE_MARCA.indexOf(e.tono as (typeof TONOS_DE_MARCA)[number]);
  return `var(--marca-${k < 0 ? 1 : k + 1})`;
}

/** El fondo de una estampa en HTML (la muestra de la leyenda y la barra de
 *  capacidad): lleno es el tono casi pleno; los rayados, un velo del tono con
 *  rayas en tono pleno, a 45° o a 135°. */
export function fondoDeEstampa(e: Estampa): CSSProperties {
  const tono = tonoCss(e);
  if (e.textura === "lleno") return { background: tono, opacity: 0.85 };
  const angulo = e.textura === "rayado45" ? 45 : 135;
  return { backgroundImage: `repeating-linear-gradient(${angulo}deg, ${tono} 0 2px, transparent 2px 5px)` };
}

/** La muestra de 14 px de una estampa: velo, textura y cinta en tono pleno. */
export function MuestraDeEstampa({ estampa, tamano = 14, apagada = false }: { estampa: Estampa | null; tamano?: number; apagada?: boolean }) {
  if (!estampa) {
    return (
      <span aria-hidden className="inline-block flex-shrink-0 rounded-[3px] border border-dashed"
        style={{ width: tamano, height: tamano, borderColor: "rgb(var(--ink-3-rgb))" }} />
    );
  }
  const tono = tonoCss(estampa);
  return (
    <span aria-hidden className="relative inline-block flex-shrink-0 overflow-hidden rounded-[3px]"
      style={{ width: tamano, height: tamano, border: `2px solid ${tono}`, opacity: apagada ? 0.45 : 1 }}>
      <span className="absolute inset-0" style={{ background: tono, opacity: 0.25 }} />
      <span className="absolute inset-0" style={fondoDeEstampa(estampa)} />
    </span>
  );
}

/* ── Lo que se lee de la cara (una vez por respuesta del servidor) ─────────── */

export interface DatosDeLaCara {
  /** Los términos de cada participación, como los leen las reglas. */
  terminosPorS: Map<number, Termino[]>;
  /** Todos los términos de la cara, juntos (para la capacidad). */
  todos: Termino[];
  fisicos: Fisico[];
  vivas: ParticipacionOut[];
  historia: ParticipacionOut[];
  porSpace: Map<number, ParticipacionOut>;
  porNumero: Map<number, ParticipacionOut>;
  /** La estampa de cada participación VIVA (la historia va en gris). */
  estampas: Map<number, Estampa>;
}

const cacheDeDatos = new WeakMap<CaraOut, DatosDeLaCara>();

export function datosDeLaCara(datos: CaraOut): DatosDeLaCara {
  const ya = cacheDeDatos.get(datos);
  if (ya) return ya;
  const terminosPorS = new Map<number, Termino[]>();
  const todos: Termino[] = [];
  const porSpace = new Map<number, ParticipacionOut>(), porNumero = new Map<number, ParticipacionOut>();
  const ordenadas = [...datos.participaciones].sort((a, b) => a.numero - b.numero || a.space_id - b.space_id);
  for (const p of ordenadas) {
    const ts = p.terminos.map(terminoDeOut);
    terminosPorS.set(p.space_id, ts);
    todos.push(...ts);
    porSpace.set(p.space_id, p);
    porNumero.set(p.numero, p);
  }
  const vivas = ordenadas.filter((p) => p.viva), historia = ordenadas.filter((p) => !p.viva);
  const estampas = estampasDeLaCara(vivas.map((p) => ({
    spaceId: p.space_id, numero: p.numero, supplierId: p.terminos[0]?.proveedor?.id ?? 0,
  })));
  const fisicos: Fisico[] = (datos.capacidad?.fisicos ?? []).map((f) => ({ ...f }));
  const r: DatosDeLaCara = { terminosPorS, todos, fisicos, vivas, historia, porSpace, porNumero, estampas };
  cacheDeDatos.set(datos, r);
  return r;
}

/* ── La revisión en vivo (las mismas funciones que el servidor) ────────────── */

export interface RevisionEnVivo {
  medidas: Medidas;
  juicio: Juicio;
  /** Las zonas entran en los topes del servidor (60 zonas, 240 puntos). */
  enLosTopes: boolean;
}

let ultimaRevision: { zonas: readonly ZonaEnEdicion[]; datos: CaraOut; r: RevisionEnVivo } | null = null;

/**
 * `medir` + `juzgar` de lo que se está editando (§9.4: al soltar, al cerrar un
 * trazo, al borrar; nunca por movimiento). Las piezas que la piden con las
 * MISMAS zonas y la misma cara comparten la cuenta. Los índices `zona` de los
 * problemas son los de `edicion.zonas` (no los de la capa del servidor, que
 * puede traer zonas de historia).
 */
export function revisionEnVivo(zonas: readonly ZonaEnEdicion[], datos: CaraOut | null): RevisionEnVivo | null {
  if (!datos?.superficie) return null;
  if (ultimaRevision && ultimaRevision.zonas === zonas && ultimaRevision.datos === datos) return ultimaRevision.r;
  const sup = datos.superficie;
  const { medidas, juicio } = revisarZonas(zonas,
    { exclusiones: sup.exclusiones, ancho: sup.ancho, alto: sup.alto, orientacion: sup.orientacion },
    datosDeLaCara(datos).terminosPorS, datos.hoy, { firmaCambio: !!datos.distribucion?.para_revisar });
  const r: RevisionEnVivo = { medidas, juicio, enLosTopes: dentroDeLosTopes(zonas.map((z) => ({ vertices: z.vertices }))) };
  ultimaRevision = { zonas, datos, r };
  return r;
}

/** La revisión de lo que se edita; durante un arrastre, la de antes de
 *  empezarlo (se revisa al soltar). */
export function useRevisionEnVivo(): RevisionEnVivo | null {
  const datos = useDistribucionStore((s) => s.datos);
  const zonas = useDistribucionStore((s) => (s.edicion.arrastre ? s.edicion.arrastre.antes : s.edicion.zonas));
  return revisionEnVivo(zonas, datos);
}

/** Las cuentas de una participación en la revisión en vivo (o, sin zonas, lo
 *  que dice el servidor). */
export function cuentaDe(p: ParticipacionOut, rev: RevisionEnVivo | null): Cuenta {
  const c = rev?.juicio.cuentas.get(p.space_id);
  if (c) return c;
  return { numero: p.numero, viva: p.viva, contratado: p.contratado_pb, dibujado: 0, pendiente: p.viva ? p.contratado_pb : 0, exceso: p.viva ? -p.contratado_pb : 0 };
}

/** Clic en un problema de la revisión: elige su zona (el índice es el de
 *  `edicion.zonas`) o, si es de una participación, la deja activa. */
export function irAlProblema(p: { zona: number | null; participaciones: readonly number[] }): void {
  const st = useDistribucionStore.getState();
  if (p.zona !== null) {
    const z = st.edicion.zonas[p.zona];
    if (z) {
      st.despachar({ tipo: "seleccionar", zona: z.clave });
      return;
    }
  }
  const n = p.participaciones[0];
  const part = n !== undefined && st.datos ? st.datos.participaciones.find((x) => x.numero === n) : undefined;
  if (part) st.despachar({ tipo: "elegirActiva", spaceId: part.space_id });
}

/* ── Capacidad: un día y un período ────────────────────────────────────────── */

export interface Capacidad {
  dia: string;
  /** Lo que cuenta ese día, por participación (con su estampa si está viva). */
  segmentos: { spaceId: number; numero: number; pb: number; estampa: Estampa | null }[];
  /** Ese día la cara está vendida entera o por partes (cuenta 100 %). */
  enteraElDia: boolean;
  comprometido: number;
  queda: number;
  periodo: { desde: string; hasta: string; pico: number; diaPico: string; queda: number };
}

/**
 * La capacidad de la cara el día `dia` (un segmento por participación que
 * cuenta ese día, §3.3) y en el período (el pico de la suma diaria y lo que
 * queda para vender en TODO el período desde hoy, §3.4): las mismas reglas que
 * el formulario y el servidor.
 */
export function capacidadDe(datos: CaraOut, dia: string, periodo?: { desde: string; hasta: string } | null): Capacidad {
  const d = datosDeLaCara(datos);
  const hoy = datos.hoy;
  const segmentos: Capacidad["segmentos"] = [];
  for (const p of [...d.vivas, ...d.historia]) {
    let pb = 0;
    for (const t of d.terminosPorS.get(p.space_id) ?? []) if (cuentaElDia(t, dia, hoy)) pb = Math.max(pb, t.pb);
    if (pb > 0) segmentos.push({ spaceId: p.space_id, numero: p.numero, pb, estampa: d.estampas.get(p.space_id) ?? null });
  }
  segmentos.sort((a, b) => a.numero - b.numero);
  const enteraElDia = d.fisicos.some((f) => f.desde <= dia && dia <= f.hasta);
  let comprometido = enteraElDia ? 10000 : 0;
  for (const s of segmentos) comprometido += s.pb;
  const desde = periodo?.desde || datos.capacidad.periodo.desde;
  const hasta = periodo?.hasta || datos.capacidad.periodo.hasta;
  const I = intervalosQueCuentan(d.todos, d.fisicos, hoy);
  const desdeHoy = desde > hoy ? desde : hoy;
  const pk = desdeHoy <= hasta ? pico(I, desdeHoy, hasta) : { pb: 0, dia: desdeHoy };
  return {
    dia, segmentos, enteraElDia, comprometido, queda: Math.max(0, 10000 - comprometido),
    periodo: { desde, hasta, pico: pk.pb, diaPico: pk.dia, queda: disponible(I, desde, hasta, hoy) },
  };
}

/* ── Una fila de la leyenda (pura: la prueba `probar-distribucion`) ────────── */

export interface FilaDeLaLeyenda {
  spaceId: number;
  numero: number;
  nombre: string;
  contratado: number;
  dibujado: number;
  pendiente: number;
  /** Lo dibujado de más (0 si no sobra). */
  exceso: number;
  /** El término que se muestra: el que cuenta ese día, o el próximo, o el último. */
  termino: TerminoOut | null;
  estado: string;
  vigencia: string;
  /** ¿Cuenta el día de «Ver al día»? */
  cuentaElDia: boolean;
  /** «desde el 1 dic» / «terminó el 31 oct» cuando no cuenta ese día. */
  rotuloDelDia: string | null;
  /** Es una reserva provisional (contorno punteado en el lienzo). */
  esReserva: boolean;
  /** El término que sigue después del que se muestra (una renovación). */
  despues: TerminoOut | null;
}

export function filaDeLaLeyenda(p: ParticipacionOut, cuenta: Cuenta, dia: string, hoy: string): FilaDeLaLeyenda {
  const pares = p.terminos.map((t) => ({ t, r: terminoDeOut(t) }));
  const cuentan = pares.filter(({ r }) => cuentaElDia(r, dia, hoy));
  const vivos = pares.filter(({ r }) => vivo(r, hoy)).sort((a, b) => (a.t.desde < b.t.desde ? -1 : a.t.desde > b.t.desde ? 1 : a.t.id - b.t.id));
  const proximo = vivos.find(({ t }) => t.desde > dia) ?? null;
  const elegido = cuentan[0] ?? proximo ?? vivos[vivos.length - 1] ?? pares[0] ?? null;
  const termino = elegido?.t ?? null;
  const cuenta1 = cuentaEseDia(pares.map(({ r }) => r), dia, hoy);
  let rotuloDelDia: string | null = null;
  if (!cuenta1 && p.viva) {
    if (proximo) rotuloDelDia = `desde el ${fechaLegible(proximo.t.desde, hoy)}`;
    else if (termino) rotuloDelDia = `terminó el ${fechaLegible(termino.hasta, hoy)}`;
  }
  const despues = termino ? vivos.find(({ t }) => t.id !== termino.id && t.desde > termino.hasta)?.t ?? null : null;
  return {
    spaceId: p.space_id, numero: p.numero, nombre: nombreDeParticipacion(p),
    contratado: cuenta.contratado, dibujado: cuenta.dibujado, pendiente: cuenta.pendiente, exceso: Math.max(0, cuenta.exceso),
    termino, estado: termino ? estadoComercialDe(termino, hoy) : "Sin términos",
    vigencia: termino ? vigenciaDe(termino) : "", cuentaElDia: cuenta1, rotuloDelDia,
    esReserva: termino?.estado === "reserva", despues,
  };
}

/**
 * Lo que se dice de la zona ELEGIDA, igual en «Mirar» que en «Editar» (pedido
 * §12: «al seleccionar una sombra, muestra sus datos y permite modificarla»):
 * cuál es, de qué participación (número, proveedor y marca), cuánto tiene
 * contratado, cuánto de lo que se vende cubre ESTA zona (m² y % de la cara) y
 * el estado comercial del término que se muestra ese día. `k` es el índice en
 * `edicion.zonas` (no el de la capa del servidor).
 */
export function datosDeLaZona(
  k: number, vertices: unknown, p: ParticipacionOut,
  sup: { ancho: number; alto: number; exclusiones: readonly Exclusion[] }, dia: string, hoy: string,
): string {
  const f = filaDeLaLeyenda(p, cuentaDe(p, null), dia, hoy);
  const r = validarZona(vertices, sup.ancho, sup.alto);
  let cubre = "zona sin terminar de dibujar";
  if (r.codigo === null) {
    const m2 = areaCubierta([r.vertices], sup.exclusiones) * sup.ancho * sup.alto;
    const m2Texto = m2 > 0 && m2 < 0.005 ? "menos de 0,01" : m2.toFixed(2).replace(".", ",");
    cubre = `esta zona cubre ${m2Texto} m² (${pct(dibujadoPb([r.vertices], sup.exclusiones))} de la cara)`;
  }
  const partes = [`Zona ${k + 1}`, `participación ${f.nombre}`, `${pct(f.contratado)} contratado`, cubre, f.estado];
  if (!f.cuentaElDia && f.rotuloDelDia) partes.push(f.rotuloDelDia);
  return partes.join(" · ");
}

/** «25 % contratado · 24,1 % dibujado · falta 0,9 %» (o «sobra 1 %»). */
export function textoDeMagnitudes(f: Pick<FilaDeLaLeyenda, "contratado" | "dibujado" | "pendiente" | "exceso">): string {
  const cola = f.exceso > 0 ? `sobra ${pct(f.exceso)}` : f.pendiente > 0 ? `falta ${pct(f.pendiente)}` : "completa";
  return `${pct(f.contratado)} contratado · ${pct(f.dibujado)} dibujado · ${cola}`;
}

/* ── Lo que comparten el panel y el lienzo, sin datos guardados ────────────── */

interface VistaDeDistribucion {
  /** «Ver cómo estaba»: una capa confirmada del historial, en gris y sólo lectura. */
  comoEstaba: { titulo: string; zonas: ZonaOut[] } | null;
  /** El período de la capacidad (null: el que mandó el servidor, un año). */
  periodo: { desde: string; hasta: string } | null;
  verComoEstaba: (c: { titulo: string; zonas: ZonaOut[] } | null) => void;
  elegirPeriodo: (p: { desde: string; hasta: string } | null) => void;
  reiniciar: () => void;
}

/** Estado de PANTALLA compartido por el panel y el lienzo (nada comercial que
 *  persista: se vacía al salir de la cara y al cambiar de sesión o cliente). */
export const useVistaDeDistribucion = create<VistaDeDistribucion>()((set) => ({
  comoEstaba: null,
  periodo: null,
  verComoEstaba: (comoEstaba) => set({ comoEstaba }),
  elegirPeriodo: (periodo) => set({ periodo }),
  reiniciar: () => set({ comoEstaba: null, periodo: null }),
}));

useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) useVistaDeDistribucion.getState().reiniciar();
});
useDistribucionStore.subscribe((s, antes) => {
  const a = s.activa, b = antes.activa;
  if (a !== b && (!a || !b || a.fixtureId !== b.fixtureId || a.cara !== b.cara || a.cliente !== b.cliente)) {
    useVistaDeDistribucion.getState().reiniciar();
  }
});

/* ── El diálogo de siempre ─────────────────────────────────────────────────── */

/**
 * Un diálogo modal del modo Distribución: mientras está abierto ÉL es la
 * pantalla (se lleva el amarillo, `useModalAbierto`), Esc lo cierra y ninguna
 * tecla sale de él hacia el atajo global del editor (que borraría o giraría
 * el mueble): el foco entra al abrirse y el `stopPropagation` de React corta
 * la burbuja antes de `window`.
 */
export function Dialogo({ titulo, onCerrar, children, ancho = "max-w-sm", cerrarAfuera = true, alEscape }: {
  titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string;
  /** Un clic afuera de la tarjeta lo cierra (no en un formulario: se perdería lo escrito). */
  cerrarAfuera?: boolean;
  /** Lo que hace Esc (también con el foco en un campo). Sin esto, cierra. Un
   *  formulario con algo escrito pregunta antes (`queHaceEsc`). */
  alEscape?: () => void;
}) {
  useModalAbierto();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <div
      ref={ref}
      data-capa-modal
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); (alEscape ?? onCerrar)(); }
      }}
      onMouseDown={(e) => { if (cerrarAfuera && e.target === e.currentTarget) onCerrar(); }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-5 outline-none"
    >
      <div className={`flex max-h-[90vh] w-full ${ancho} flex-col overflow-hidden rounded-xl border border-dark-line bg-dark-surface text-dark-ink-1 shadow-2xl`}>
        <p className="border-b border-dark-line px-4 py-3 text-sm font-bold">{titulo}</p>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/** Un botón de los secundarios del modo (el principal es UNO por pantalla). */
export const BOTON = "rounded-md border border-dark-line-2 bg-dark-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-dark-ink-1 hover:bg-dark-line disabled:cursor-not-allowed disabled:opacity-40";
/** Un botón que deshace algo (cancelar, descartar). */
export const BOTON_PELIGRO = "rounded-md border px-2.5 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40";
export const ESTILO_PELIGRO: CSSProperties = {
  borderColor: "rgb(var(--ocupado-txt-rgb) / 0.5)", color: "rgb(var(--ocupado-txt-rgb))", background: "rgb(var(--ocupado-txt-rgb) / 0.1)",
};

/* ── La leyenda ────────────────────────────────────────────────────────────── */

type Pregunta =
  | { tipo: "reserva"; p: ParticipacionOut; t: TerminoOut }
  | { tipo: "contrato"; p: ParticipacionOut; t: TerminoOut };

/** Con más de estas, la lista ofrece filtrar por proveedor (pedido §6). */
const FILTRO_DESDE = 6;

export default function LeyendaDeParticipaciones() {
  const datos = useDistribucionStore((s) => s.datos);
  const activa = useDistribucionStore((s) => s.edicion.activa);
  const modo = useDistribucionStore((s) => s.edicion.modo);
  const zonas = useDistribucionStore((s) => s.edicion.zonas);
  const verAlDia = useDistribucionStore((s) => s.verAlDia);
  const periodo = useVistaDeDistribucion((s) => s.periodo);
  const rev = useRevisionEnVivo();
  const [filtro, setFiltro] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [verHistoria, setVerHistoria] = useState(false);
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!datos) return null;
  const d = datosDeLaCara(datos);
  const hoy = datos.hoy;
  const dia = verAlDia || hoy;
  const cap = capacidadDe(datos, dia, periodo);
  const st = useDistribucionStore.getState;

  const elegir = (spaceId: number) => {
    setMenu(null);
    st().despachar({ tipo: "elegirActiva", spaceId: activa === spaceId ? null : spaceId });
  };

  /** «Ajustar al contratado»: achica sus zonas hasta lo contratado (sin pisar
   *  a las que rigen en las mismas fechas, si se puede). */
  const ajustar = (p: ParticipacionOut, contratado: number) => {
    const sup = datos.superficie;
    if (!sup) return;
    const propias = zonas.filter((z) => z.participacionSpaceId === p.space_id).map((z) => z.vertices);
    const mias = d.terminosPorS.get(p.space_id) ?? [];
    const otras = new Map<number, Poligono[]>();
    for (const z of zonas) {
      if (z.participacionSpaceId === p.space_id) continue;
      const suyas = d.terminosPorS.get(z.participacionSpaceId);
      if (!suyas || !seCruzanEnFechas(mias, suyas, hoy)) continue;
      const l = otras.get(z.participacionSpaceId);
      if (l) l.push(z.vertices); else otras.set(z.participacionSpaceId, [z.vertices]);
    }
    const nuevas = ajustarAlContratado(propias, sup.exclusiones, contratado, areaUtil(sup.exclusiones), [...otras.values()],
      { ancho: sup.ancho, alto: sup.alto });
    st().despachar({ tipo: "ajustarZonas", spaceId: p.space_id, vertices: nuevas });
    setMenu(null);
  };

  const filas = d.vivas
    .map((p) => ({ p, f: filaDeLaLeyenda(p, cuentaDe(p, rev), dia, hoy) }))
    .filter(({ p }) => {
      if (!filtro.trim()) return true;
      const quien = (p.terminos[0]?.proveedor?.nombre ?? "").toLowerCase();
      return quien.includes(filtro.trim().toLowerCase());
    });

  return (
    <section aria-label="Participaciones de la cara" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-dark-ink-3">Participaciones</p>
        <p className="text-right text-[11px] text-dark-ink-2" data-disponible>
          Para vender: <b className="text-dark-ink-1">queda {pct(cap.queda)}</b> el {fechaLegible(dia, hoy)}
          {" · "}{pct(cap.periodo.queda)} hasta el {fechaLegible(cap.periodo.hasta, hoy)}
        </p>
      </div>

      {d.vivas.length > FILTRO_DESDE && (
        <input
          type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por proveedor"
          className="w-full rounded-md border border-dark-line-2 bg-transparent px-2 py-1 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none"
        />
      )}

      {d.vivas.length === 0 && (
        <p className="rounded-md border border-dashed border-dark-line-2 px-3 py-2 text-[11px] leading-snug text-dark-ink-2">
          Todavía no hay participaciones en esta cara. Cargá la primera con «Nueva participación».
        </p>
      )}

      <ul className="flex max-h-[44vh] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {filas.map(({ p, f }) => {
          const estampa = d.estampas.get(p.space_id) ?? null;
          const esActiva = activa === p.space_id;
          const ts = p.terminos;
          const reservaViva = ts.find((t) => t.estado === "reserva" && t.estado_visible === "reserva") ?? null;
          const contratosVivos = ts.filter((t) => t.estado === "contrato" && t.lease_id != null && (t.estado_visible === "vigente" || t.estado_visible === "firmado"));
          // Renovar: sólo el término vivo más nuevo, y si es un contrato (§4.7).
          const vivos = ts.filter((t) => vivo(terminoDeOut(t), hoy));
          const masNuevo = [...vivos].sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : b.id - a.id))[0] ?? null;
          const renovable = masNuevo && masNuevo.estado === "contrato" ? masNuevo : null;
          return (
            <li key={p.space_id} data-participacion={p.numero}>
              {/* La fila son DOS botones hermanos —elegir la participación y sus
                  acciones—, no un botón adentro de otro (un `role="button"`
                  con un `<button>` adentro no se lee bien con un lector de
                  pantalla ni se recorre bien con Tab). Adentro de un botón sólo
                  va texto en línea: `span` con `block`, no `div` ni `p`. */}
              <div
                className={`flex items-start gap-2 rounded-md border px-2 py-1.5 transition-colors ${esActiva ? "border-dark-ink-2 bg-dark-surface-2" : "border-dark-line hover:border-dark-line-2"}`}
                style={{ opacity: f.cuentaElDia ? 1 : 0.7 }}
              >
                <button
                  type="button"
                  aria-pressed={esActiva}
                  data-elegir-participacion
                  onClick={() => elegir(p.space_id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
                >
                  <span className="mt-0.5"><MuestraDeEstampa estampa={estampa} apagada={!f.cuentaElDia} /></span>
                  <span className="block min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-dark-ink-1">
                      {f.nombre}
                      {esActiva && <span className="ml-1 text-[10px] font-normal text-dark-ink-2">· dibujás con ésta</span>}
                    </span>
                    <span className="block text-[11px] leading-snug" data-magnitudes
                      style={{ color: f.exceso > 0 ? "rgb(var(--ocupado-txt-rgb))" : "rgb(var(--ink-2-rgb))" }}>
                      {f.exceso > 0 && "⚠ "}{textoDeMagnitudes(f)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-snug text-dark-ink-2">
                      <span className={`rounded px-1 py-px font-semibold text-dark-ink-1 ${f.esReserva ? "border border-dashed border-dark-ink-3" : "border border-dark-line-2 bg-dark-surface-2"}`}>
                        {f.estado}
                      </span>
                      <span>{f.vigencia}</span>
                      {f.rotuloDelDia && <span className="font-semibold text-dark-ink-1">· {f.rotuloDelDia}</span>}
                    </span>
                    {f.despues && (
                      <span className="block text-[10px] text-dark-ink-3">
                        Después: {f.despues.estado === "reserva" ? "reserva provisional" : "contrato"} {vigenciaDe(f.despues)}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Acciones de la participación ${p.numero}`}
                  aria-expanded={menu === p.space_id}
                  onClick={() => setMenu(menu === p.space_id ? null : p.space_id)}
                  className="rounded p-1 text-dark-ink-2 hover:bg-dark-line hover:text-dark-ink-1"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
              {menu === p.space_id && (
                <div className="mt-1 flex flex-wrap gap-1 pl-6">
                  {renovable && (
                    <button type="button" className={BOTON} onClick={() => { setMenu(null); st().abrirFormulario({ modo: "renovar", terminoId: renovable.id }); }}>
                      Renovar
                    </button>
                  )}
                  {reservaViva && (
                    <>
                      <button type="button" className={BOTON} onClick={() => { setMenu(null); st().abrirFormulario({ modo: "confirmar", terminoId: reservaViva.id }); }}>
                        Confirmar reserva
                      </button>
                      <button type="button" className={BOTON} onClick={() => { setMenu(null); st().abrirFormulario({ modo: "editar", terminoId: reservaViva.id }); }}>
                        Cambiar reserva
                      </button>
                      <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={() => { setMenu(null); setAviso(null); setPregunta({ tipo: "reserva", p, t: reservaViva }); }}>
                        Cancelar reserva
                      </button>
                    </>
                  )}
                  {contratosVivos.map((t) => (
                    <button key={t.id} type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
                      onClick={() => { setMenu(null); setAviso(null); setPregunta({ tipo: "contrato", p, t }); }}>
                      {contratosVivos.length > 1 ? `Cancelar contrato ${vigenciaDe(t)}` : "Cancelar contrato"}
                    </button>
                  ))}
                  <button
                    type="button" className={BOTON}
                    disabled={modo !== "editar" || f.exceso <= 0 || !zonas.some((z) => z.participacionSpaceId === p.space_id)}
                    title={modo !== "editar" ? "Pasá a «Editar» para cambiar las zonas." : f.exceso <= 0 ? "Lo dibujado no pasa lo contratado." : undefined}
                    onClick={() => ajustar(p, f.contratado)}
                  >
                    Ajustar al contratado
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {d.historia.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerHistoria(!verHistoria)} aria-expanded={verHistoria}
            className="flex items-center gap-1 text-[11px] font-semibold text-dark-ink-3 hover:text-dark-ink-1">
            {verHistoria ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Historia ({d.historia.length}): participaciones que ya no rigen
          </button>
          {verHistoria && (
            <ul className="mt-1 flex flex-col gap-1">
              {d.historia.map((p) => {
                const t = p.terminos[0];
                return (
                  <li key={p.space_id} className="flex items-start gap-2 rounded-md border border-dashed border-dark-line-2 px-2 py-1.5 text-dark-ink-3">
                    <span className="mt-0.5"><MuestraDeEstampa estampa={null} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{nombreDeParticipacion(p)} · {pct(p.contratado_pb)}</p>
                      {t && <p className="text-[10px]">{estadoComercialDe(t, hoy)} · {vigenciaDe(t)}</p>}
                    </div>
                    {t && (
                      <button type="button" className={BOTON} title="Una participación nueva con el mismo proveedor, marca y porcentaje"
                        onClick={() => st().abrirFormulario({ modo: "cargarDeNuevo", terminoId: t.id })}>
                        <RotateCcw size={11} className="mr-1 inline" />Cargar de nuevo
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {pregunta && (
        <PreguntaDeCancelar
          pregunta={pregunta}
          aviso={aviso}
          onAviso={setAviso}
          onCerrar={() => { setPregunta(null); setAviso(null); }}
          datos={datos}
        />
      )}
    </section>
  );
}

/** «Cancelar reserva» y «Cancelar contrato», con la pregunta de siempre. */
function PreguntaDeCancelar({ pregunta, aviso, onAviso, onCerrar, datos }: {
  pregunta: Pregunta; aviso: string | null; onAviso: (s: string | null) => void; onCerrar: () => void; datos: CaraOut;
}) {
  const [haciendo, setHaciendo] = useState(false);
  const { p, t } = pregunta;
  const esContrato = pregunta.tipo === "contrato";

  async function cancelar() {
    if (haciendo) return;
    setHaciendo(true);
    onAviso(null);
    const st = useDistribucionStore.getState();
    try {
      if (esContrato) {
        // El contrato se cancela por el camino de siempre
        // (`DELETE /spaces/{id}/leases/{id}`); la cara se vuelve a leer.
        await cancelLease(t.space_id, t.lease_id as number);
        // El contrato era una fila de `space_leases`: el estado comercial del
        // plano (el panel comercial y el 3D al salir del modo) se vuelve a leer
        // ya, como después de cualquier venta, y no a los 20 s del sondeo.
        void useFixtureStore.getState().refrescarComercial();
        const a = st.activa;
        if (a) st.aplicarCara(await leerCara(a.sede, espacioDeLaCara(a.codigo, a.cara)));
      } else {
        const r = await cancelarReserva(t.id, t.version);
        st.aplicarCara(r.cara);
      }
      onCerrar();
    } catch (e) {
      const r = rechazoDe(e);
      onAviso(r?.message || describeError(e, esContrato ? "No se pudo cancelar el contrato." : "No se pudo cancelar la reserva."));
      setHaciendo(false);
    }
  }

  return (
    <Dialogo titulo={esContrato ? `Cancelar el contrato de la participación ${p.numero}` : `Cancelar la reserva de la participación ${p.numero}`} onCerrar={onCerrar}>
      <p className="text-xs leading-relaxed text-dark-ink-2">
        <b className="text-dark-ink-1">{nombreDeParticipacion(p)} · {pct(t.puntos_basicos)}</b>, {vigenciaDe(t)}.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-dark-ink-2">
        {esContrato
          ? "El lugar en la cara queda libre y el contrato deja de contar en ocupación e ingresos. La planometría y el reporte de montaje se quedan: son la prueba de lo que se acordó y de lo que se armó."
          : "La reserva deja de sostener ese porcentaje: queda libre para vender."}
        {" "}Si la participación no tiene otro término vivo, sus zonas pasan a la historia (en gris) y salen de la distribución al confirmarla.
      </p>
      {datos.distribucion?.estado === "confirmada" && (
        <p className="mt-2 text-[11px] text-dark-ink-3">La distribución confirmada no se toca: lo que cambia se ve al volver a revisarla.</p>
      )}
      {aviso && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{aviso}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={BOTON} onClick={onCerrar} disabled={haciendo}>Dejarlo así</button>
        <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={() => void cancelar()} disabled={haciendo}>
          {haciendo ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </Dialogo>
  );
}
