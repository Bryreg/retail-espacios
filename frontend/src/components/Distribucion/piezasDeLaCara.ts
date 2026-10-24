import { useMemo } from "react";
import { create } from "zustand";
import type { CaraOut, ParticipacionOut, TerminoOut } from "../../api/participaciones";
import { useAuthStore } from "../../store/authStore";
import { useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import type { Estampa } from "../../utils/coloresDeMarca";
import type { ZonaEnEdicion } from "../../utils/edicionDeZonas";
import { pct, seCruzanEnFechas, vivo, type Termino } from "../../utils/participaciones";
import {
  formaDeLoDibujado, rectDePoligono, type CaraDePiezas, type FormaDePieza, type Ocupado, type Rect,
} from "../../utils/piezas";
import { guiasDeCara } from "../../utils/superficie";
import type { Poligono } from "../../utils/zonasGeometria";
import { datosDeLaCara, estadoComercialDe, marcaDe, tonoCss, useRevisionEnVivo, vigenciaDe, type RevisionEnVivo } from "./LeyendaDeParticipaciones";

/**
 * Las PIEZAS de una cara (Distribuir «como un juego de piezas», 2026-10-24):
 * una por marca viva —su proveedor y su marca, nunca el número interno— con su
 * % contratado, lo que tiene ubicado en la cara, su forma y su estado en
 * palabras («Arrastrala a la cara», «Ubicada»…). Sale de lo que ya calcula la
 * revisión en vivo (`medir` + `juzgar`, las mismas cuentas que el servidor):
 * acá no se cuenta nada distinto.
 *
 * Y el estado de PANTALLA que comparten la cara y la lista de piezas (cuál está
 * elegida, la forma que se le eligió, el arrastre en curso, el aviso de un
 * choque, el 3D en grande). Nada comercial ni nada que persista: se vacía al
 * cambiar de cara, de sesión o de cliente.
 */

export type EstadoDePieza = "sin_ubicar" | "ubicada" | "falta" | "sobra" | "choca" | "rehacer";

export interface Pieza {
  spaceId: number;
  /** «Café Montaña · Café A» (o sólo el proveedor). */
  nombre: string;
  /** Lo corto que va sobre la pieza: la marca, o el proveedor. */
  corto: string;
  pb: number;
  estampa: Estampa | null;
  /** El tono como token del tema (`var(--marca-k)`). */
  tono: string;
  zonas: ZonaEnEdicion[];
  poligonos: Poligono[];
  /** La forma: la que se eligió, o la de lo dibujado, o «franja». */
  forma: FormaDePieza;
  /** El rectángulo, si la pieza es UNA zona rectangular. */
  rect: Rect | null;
  dibujado: number;
  estado: EstadoDePieza;
  /** Con quién choca (su `spaceId`), si choca. */
  choca: number | null;
  /** «Contrato vigente · del 1 oct 2026 al 31 mar 2027». */
  detalle: string;
  esReserva: boolean;
  terminos: Termino[];
  participacion: ParticipacionOut;
}

/** «Café Montaña · Café A»: el proveedor y la marca, sin número (`marcaDe`). */
export const nombreDeMarca = marcaDe;

/** Lo corto: la marca si tiene, si no el proveedor. */
export function cortoDeMarca(p: ParticipacionOut): string {
  const t = p.terminos[0];
  return t?.marca || t?.proveedor?.nombre || "Sin proveedor";
}

/** El término que se describe: el vivo que empieza antes, o el más nuevo. */
function terminoQueSeDice(p: ParticipacionOut, hoy: string, terminos: Termino[]): TerminoOut | null {
  const vivos = p.terminos.filter((_t, i) => vivo(terminos[i], hoy))
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.id - b.id));
  return vivos[0] ?? p.terminos[0] ?? null;
}

/** Las piezas de la cara, en el orden de la lista (el de la cara: por número). */
export function piezasDe(datos: CaraOut | null, zonas: readonly ZonaEnEdicion[], rev: RevisionEnVivo | null,
  formas: Readonly<Record<number, FormaDePieza>>): Pieza[] {
  if (!datos?.superficie) return [];
  const d = datosDeLaCara(datos);
  const E = datos.superficie.exclusiones;
  const porS = new Map<number, ZonaEnEdicion[]>();
  for (const z of zonas) {
    const l = porS.get(z.participacionSpaceId);
    if (l) l.push(z); else porS.set(z.participacionSpaceId, [z]);
  }
  // Los choques que el servidor marcaría (SOLAPE nombra los dos números).
  const chocaCon = new Map<number, number>();
  const rehacer = new Set<number>();
  for (const pr of rev?.juicio.errores ?? []) {
    if (pr.codigo === "SOLAPE" && pr.participaciones.length >= 2) {
      const [a, b] = pr.participaciones.map((n) => d.porNumero.get(n)?.space_id);
      if (a !== undefined && b !== undefined) { if (!chocaCon.has(a)) chocaCon.set(a, b); if (!chocaCon.has(b)) chocaCon.set(b, a); }
    } else if (pr.zona !== null) {
      const z = zonas[pr.zona];
      if (z) rehacer.add(z.participacionSpaceId);
    }
  }
  return d.vivas.map((p) => {
    const propias = porS.get(p.space_id) ?? [];
    const poligonos = propias.map((z) => z.vertices);
    const c = rev?.juicio.cuentas.get(p.space_id);
    const pb = c?.contratado ?? p.contratado_pb;
    const dibujado = c?.dibujado ?? 0;
    const terminos = d.terminosPorS.get(p.space_id) ?? [];
    const t = terminoQueSeDice(p, datos.hoy, terminos);
    const choca = chocaCon.get(p.space_id) ?? null;
    let estado: EstadoDePieza;
    if (propias.length === 0) estado = "sin_ubicar";
    else if (rehacer.has(p.space_id)) estado = "rehacer";
    else if (choca !== null) estado = "choca";
    else if (dibujado > pb) estado = "sobra";
    else if (dibujado < pb) estado = "falta";
    else estado = "ubicada";
    const detectada = formaDeLoDibujado(poligonos, E);
    const estampa = d.estampas.get(p.space_id) ?? null;
    return {
      spaceId: p.space_id, nombre: nombreDeMarca(p), corto: cortoDeMarca(p), pb, estampa,
      tono: estampa ? tonoCss(estampa) : "rgb(var(--ink-3-rgb))",
      zonas: propias, poligonos, forma: formas[p.space_id] ?? detectada ?? "franja",
      rect: propias.length === 1 ? rectDePoligono(propias[0].vertices) : null,
      dibujado, estado, choca,
      detalle: t ? `${estadoComercialDe(t, datos.hoy)} · ${vigenciaDe(t)}` : "",
      esReserva: t?.estado === "reserva", terminos, participacion: p,
    };
  });
}

/** Lo que una pieza no puede pisar: las otras piezas ubicadas cuyas fechas se
 *  cruzan con las suyas (dos marcas que nunca están a la vez sí pueden). */
export function ocupadosPara(spaceId: number, piezas: readonly Pieza[], hoy: string): Ocupado[] {
  const yo = piezas.find((p) => p.spaceId === spaceId);
  if (!yo) return [];
  return piezas
    .filter((p) => p.spaceId !== spaceId && p.poligonos.length > 0 && seCruzanEnFechas(yo.terminos, p.terminos, hoy))
    .map((p) => ({ spaceId: p.spaceId, poligonos: p.poligonos }));
}

/** ¿Las fechas de estas dos marcas se cruzan? (para «Acomodar solas»). */
export function cruzanEnFechas(piezas: readonly Pieza[], hoy: string): (a: number, b: number) => boolean {
  const por = new Map(piezas.map((p) => [p.spaceId, p.terminos]));
  return (a, b) => {
    const ta = por.get(a), tb = por.get(b);
    return !!ta && !!tb && seCruzanEnFechas(ta, tb, hoy);
  };
}

/** «Café A», «Café A y Marca 2», «A, B y C». */
export function enLista(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** El estado de una pieza en palabras (la lista de la derecha). */
export function textoDelEstado(p: Pick<Pieza, "estado" | "pb" | "dibujado" | "forma">, nombreDeLaOtra: (s: number) => string, choca: number | null): string {
  switch (p.estado) {
    case "sin_ubicar": return "Arrastrala a la cara";
    case "ubicada": return "Ubicada";
    case "falta": return `Le falta ${pct(p.pb - p.dibujado)}`;
    case "sobra": return `Sobra ${pct(p.dibujado - p.pb)}`;
    case "choca": return choca !== null ? `Pisa a ${nombreDeLaOtra(choca)}` : "Pisa a otra marca";
    case "rehacer": return "Hay que volver a ubicarla";
  }
}

/* ── El estado de pantalla ─────────────────────────────────────────────────── */

export interface ArrastreDePieza {
  spaceId: number;
  /** De la lista de la derecha o de la cara misma. */
  desde: "lista" | "cara";
  /** El puntero, en la pantalla (la pieza que vuela sigue al dedo). */
  x: number;
  y: number;
  /** Dónde caería si se suelta ahora (null: afuera de la cara). */
  rect: Rect | null;
  /** A quién pisaría. */
  pisa: number | null;
  /** Ya se movió más que un toque. */
  movida: boolean;
}

interface PiezasUI {
  elegida: number | null;
  formas: Record<number, FormaDePieza>;
  arrastre: ArrastreDePieza | null;
  /** Un choque al soltar: dónde quedó marcada en rojo y con quién. */
  choque: { spaceId: number; rect: Rect; con: number } | null;
  /** El 3D en grande («Ver en 3D»). */
  ver3D: boolean;
  /** Las caras (clave de cara + versión) que ya se acomodaron solas al entrar. */
  acomodadas: string[];
  /** La pista de la cara (lo que acaba de pasar, en palabras). */
  pista: string | null;
  elegir: (s: number | null) => void;
  ponerForma: (s: number, f: FormaDePieza) => void;
  ponerArrastre: (a: ArrastreDePieza | null) => void;
  ponerChoque: (c: PiezasUI["choque"]) => void;
  verEn3D: (v: boolean) => void;
  anotarAcomodada: (k: string) => void;
  decir: (p: string | null) => void;
  reiniciar: () => void;
}

const VACIO = { elegida: null, formas: {}, arrastre: null, choque: null, ver3D: false, pista: null };

export const usePiezasUI = create<PiezasUI>()((set) => ({
  ...VACIO,
  acomodadas: [],
  elegir: (elegida) => set({ elegida }),
  ponerForma: (s, f) => set((st) => ({ formas: { ...st.formas, [s]: f } })),
  ponerArrastre: (arrastre) => set({ arrastre }),
  ponerChoque: (choque) => set({ choque }),
  verEn3D: (ver3D) => set({ ver3D }),
  anotarAcomodada: (k) => set((st) => ({ acomodadas: [...st.acomodadas.slice(-20), k] })),
  decir: (pista) => set({ pista }),
  reiniciar: () => set({ ...VACIO, acomodadas: [] }),
}));

useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) usePiezasUI.getState().reiniciar();
});
useDistribucionStore.subscribe((s, antes) => {
  const a = s.activa, b = antes.activa;
  if (a !== b && (!a || !b || a.fixtureId !== b.fixtureId || a.cara !== b.cara || a.cliente !== b.cliente)) {
    const acomodadas = usePiezasUI.getState().acomodadas;
    usePiezasUI.setState({ ...VACIO, acomodadas });
  }
});

/** La cara como la leen las piezas: la superficie del servidor y las alturas
 *  de los estantes del mueble del plano. */
export function useCaraDePiezas(fixtureId: string, sede: string): CaraDePiezas | null {
  const datos = useDistribucionStore((s) => s.datos);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[sede] ?? selectFixtures(s)).find((f) => f.id === fixtureId) ?? null);
  const cara = datos?.cara ?? "A";
  return useMemo(() => {
    const sup = datos?.superficie;
    if (!sup) return null;
    return { ancho: sup.ancho, alto: sup.alto, exclusiones: sup.exclusiones, estantes: mueble ? guiasDeCara(mueble, cara).entrepanos : [] };
  }, [datos?.superficie, mueble, cara]);
}

/** Las piezas de lo que se está editando (se recalculan al soltar, no en
 *  cada movimiento: la revisión en vivo congela el arrastre del reductor). */
export function usePiezas(): Pieza[] {
  const datos = useDistribucionStore((s) => s.datos);
  const zonas = useDistribucionStore((s) => s.edicion.zonas);
  const formas = usePiezasUI((s) => s.formas);
  const rev = useRevisionEnVivo();
  return useMemo(() => piezasDe(datos, zonas, rev, formas), [datos, zonas, rev, formas]);
}
