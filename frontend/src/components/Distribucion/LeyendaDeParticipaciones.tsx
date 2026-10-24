import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { create } from "zustand";
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
import { revisarZonas, type ZonaEnEdicion } from "../../utils/edicionDeZonas";
import {
  cuentaElDia, cuentaEseDia, disponible, intervalosQueCuentan, pct, pico, vivo,
  type Cuenta, type Fisico, type Juicio, type Termino,
} from "../../utils/participaciones";
import {
  dentroDeLosTopes, type Medidas,
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

/** «Postobón · Hit»: el proveedor y la marca, sin el número interno. Es como
 *  se nombra una marca en Distribuir y en sus diálogos. */
export function marcaDe(p: ParticipacionOut): string {
  const t = p.terminos[0];
  const quien = t?.proveedor?.nombre ?? "Sin proveedor";
  return t?.marca ? `${quien} · ${t.marca}` : quien;
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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 outline-none"
    >
      <div className={`flex max-h-[90vh] w-full ${ancho} flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink-1 shadow-2xl`}>
        <p className="border-b border-line px-4 py-3 text-sm font-bold">{titulo}</p>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/** Un botón de los secundarios del modo (el principal es UNO por pantalla). */
export const BOTON = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
/** Un botón que deshace algo (cancelar, descartar). */
export const BOTON_PELIGRO = "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40";
export const ESTILO_PELIGRO: CSSProperties = {
  borderColor: "rgb(var(--ocupado-txt-rgb) / 0.5)", color: "rgb(var(--ocupado-txt-rgb))", background: "rgb(var(--ocupado-txt-rgb) / 0.1)",
};

/* ── Cancelar una reserva o un contrato ─────────────────────────────────── */

export type PreguntaDeCancelarTipo =
  | { tipo: "reserva"; p: ParticipacionOut; t: TerminoOut }
  | { tipo: "contrato"; p: ParticipacionOut; t: TerminoOut };
type Pregunta = PreguntaDeCancelarTipo;

/** «Cancelar la reserva» y «Cancelar el contrato» de una marca, con la pregunta de siempre. */
export function PreguntaDeCancelar({ pregunta, aviso, onAviso, onCerrar, datos }: {
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
      // Un 409 (otra sesión la cambió, ya caducó…): la cara se vuelve a leer
      // en segundo plano, como después de un rechazo del formulario.
      void st.releerTrasConflicto(e);
    }
  }

  return (
    <Dialogo titulo={esContrato ? `Cancelar el contrato de ${marcaDe(p)}` : `Cancelar la reserva de ${marcaDe(p)}`} onCerrar={onCerrar}>
      <p className="text-xs leading-relaxed text-ink-2">
        <b className="text-ink-1">{marcaDe(p)} · {pct(t.puntos_basicos)} de la cara</b>, {vigenciaDe(t)}.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">
        {esContrato
          ? "Su lugar en la cara queda libre y el contrato deja de contar en ocupación e ingresos. La planometría y el reporte de montaje se quedan: son la prueba de lo que se acordó y de lo que se armó."
          : "La reserva deja de guardarle ese porcentaje: queda libre para vender."}
        {" "}Si la marca no tiene otro contrato que siga, su pieza sale de la cara (queda en gris hasta que guardes la cara).
      </p>
      {datos.distribucion?.estado === "confirmada" && (
        <p className="mt-2 text-[11px] text-ink-3">Lo que ya estaba guardado no se toca: el cambio se ve cuando vuelvas a guardar la cara.</p>
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
