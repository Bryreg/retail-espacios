import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRightToLine, Grid3x3, Magnet, Maximize2, MousePointer2, Pentagon, Redo2, Square, Undo2, X } from "lucide-react";
import { capaQueSeMuestra, planoAlDia, useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import {
  AVISO_SIN_ACTIVA, RADIO_DEL_IMAN_PX, TOQUE_PX, esClic, imantar, imantarTraslado, objetivosDelIman, puntoInterior, zonaEnPunto,
  type Accion, type Herramienta, type Manija,
} from "../../utils/edicionDeZonas";
import { cuentaEseDia, pct, seCruzanEnFechas } from "../../utils/participaciones";
import { guiasDeCara } from "../../utils/superficie";
import { AREA_MINIMA_M2, cajas, trapecios, validarZona, type Poligono, type Punto } from "../../utils/zonasGeometria";
import { ESTAMPAS, type Estampa } from "../../utils/coloresDeMarca";
import {
  datosDeLaCara, datosDeLaZona, nombreDeParticipacion, tonoCss, useRevisionEnVivo, useVistaDeDistribucion,
} from "./LeyendaDeParticipaciones";

/**
 * El lienzo de Distribución (§9.4 del diseño de participaciones): la cara en
 * METROS, en un SVG, con las zonas de cada participación encima. Lee y edita
 * SÓLO por el store (`despachar` del reductor de `utils/edicionDeZonas.ts`):
 * acá no hay estado de las zonas, sólo el del puntero y el de la vista.
 *
 *   · Coordenadas: del puntero a metros con `getScreenCTM().inverse()` (la
 *     transformación que de verdad aplicó el navegador, con el encaje del
 *     `viewBox`, como `Libera.tsx`); de metros a u,v, `u = x/W`, `v = 1 − y/H`.
 *   · Herramientas (sólo en «Editar»): Seleccionar (V) —clic elige la zona de
 *     arriba, arrastre la mueve, sus puntos le cambian la forma, las manijas
 *     del recuadro la escalan (Shift conserva la proporción), doble clic en un
 *     borde agrega un punto—, Rectángulo (R) y Polígono (P) —clic agrega un
 *     punto; clic en el primero o Enter cierra; Esc cancela; Retroceso saca el
 *     último—. Un arrastre entero es UN paso de deshacer (el reductor). Un
 *     clic es un clic si el puntero se movió menos de 4 px.
 *   · Imán (G), prendido: a puntos y bordes de las OTRAS zonas y al borde de
 *     la cara, 6 px de pantalla; a las guías sólo si se pide. Guías
 *     (entrepaños y parantes) prendidas para VER, punteadas.
 *   · Zoom con la rueda alrededor del cursor (oyente NATIVO con
 *     `passive: false`: el `onWheel` de React es pasivo y no frena la página),
 *     de 1× a 20×; paneo con espacio + arrastre o con el botón del medio;
 *     «Encuadrar» (0) vuelve a 1×.
 *   · Se dibuja: la cara, lo que no se vende (rayado gris, con su nombre al
 *     pasar), las guías, «Ver cómo estaba» (gris), la historia (contorno gris
 *     punteado), las zonas vivas (relleno con su estampa, sólo lo que cae en lo
 *     que se vende, y cinta en tono pleno; la reserva, punteada; la que no
 *     cuenta el día de «Ver al día», sólo el contorno punteado), los SOLAPES
 *     de participaciones que rigen a la vez (rayado rojo: el pedazo que
 *     choca), la zona elegida con sus manijas, el trazo y los rótulos «3 ·
 *     25 %» sobre una pastilla (el texto nunca va en el color de la serie).
 *
 * Las teclas del lienzo las atiende el oyente en captura del panel
 * (`atajoDeDistribucion`): Supr borra la ZONA elegida, nunca el mueble.
 */

/** Los colores: tokens del tema que el cajón oscuro redefine (canales `-rgb`). */
const C = {
  cara: "rgb(var(--surface-rgb))",
  borde: "rgb(var(--line-strong-rgb))",
  linea: "rgb(var(--line-rgb))",
  tinta: "rgb(var(--ink-1-rgb))",
  tinta2: "rgb(var(--ink-2-rgb))",
  gris: "rgb(var(--ink-3-rgb))",
  rojo: "rgb(var(--ocupado-txt-rgb))",
};

const NOMBRES_DE_EXCLUSION: Record<string, string> = {
  zocalo: "zócalo", parante: "parante", remate: "remate", copete: "copete", base: "base", marco: "marco",
  divisor: "divisor", poste: "poste", cabezal: "cabezal", tapa: "tapa",
};

const ZOOM_MAXIMO = 20;
const PASO_DE_RUEDA = 1.15;
// La distancia para tocar una manija, el primer punto o un borde (`TOQUE_PX`)
// vive en `edicionDeZonas.ts`: la misma en el lienzo y en el 3D.

const metros = (x: number) => x.toFixed(2).replace(".", ",");
const camino = (pts: readonly Punto[], W: number, H: number) =>
  pts.map(([u, v], i) => `${i === 0 ? "M" : "L"}${u * W} ${(1 - v) * H}`).join(" ") + " Z";

type Gesto =
  | { tipo: "pan"; x: number; y: number; cx: number; cy: number }
  | { tipo: "rect"; x: number; y: number }
  | { tipo: "poligono"; x: number; y: number }
  | { tipo: "elegir"; x: number; y: number }
  | { tipo: "mover"; x: number; y: number; clave: string; desde: Punto; activo: boolean }
  | { tipo: "vertice"; x: number; y: number; clave: string; vertice: number; activo: boolean }
  | { tipo: "escala"; x: number; y: number; clave: string; manija: Manija; activo: boolean };

const MANIJAS: { m: Manija; u: (c: number[]) => number; v: (c: number[]) => number; cursor: string }[] = [
  { m: "no", u: (c) => c[0], v: (c) => c[3], cursor: "nwse-resize" },
  { m: "n", u: (c) => (c[0] + c[2]) / 2, v: (c) => c[3], cursor: "ns-resize" },
  { m: "ne", u: (c) => c[2], v: (c) => c[3], cursor: "nesw-resize" },
  { m: "e", u: (c) => c[2], v: (c) => (c[1] + c[3]) / 2, cursor: "ew-resize" },
  { m: "se", u: (c) => c[2], v: (c) => c[1], cursor: "nwse-resize" },
  { m: "s", u: (c) => (c[0] + c[2]) / 2, v: (c) => c[1], cursor: "ns-resize" },
  { m: "so", u: (c) => c[0], v: (c) => c[1], cursor: "nesw-resize" },
  { m: "o", u: (c) => c[0], v: (c) => (c[1] + c[3]) / 2, cursor: "ew-resize" },
];

const PISTAS: Record<Herramienta, string> = {
  seleccionar: "Arrastrá una zona para moverla y sus puntos para cambiarle la forma; doble clic en un borde agrega un punto; Supr la borra.",
  rectangulo: "Arrastrá para dibujar un rectángulo de la participación activa.",
  poligono: "Clic agrega un punto · clic en el primero o Enter cierra · Esc cancela · Retroceso saca el último.",
};

export default function LienzoDeZonas({ fixtureId, sede }: { fixtureId: string; sede: string }) {
  const datos = useDistribucionStore((s) => s.datos);
  const activaCara = useDistribucionStore((s) => s.activa);
  const cargando = useDistribucionStore((s) => s.cargando);
  const edicion = useDistribucionStore((s) => s.edicion);
  const verAlDia = useDistribucionStore((s) => s.verAlDia);
  const comoEstaba = useVistaDeDistribucion((s) => s.comoEstaba);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[sede] ?? selectFixtures(s)).find((f) => f.id === fixtureId) ?? null);
  const rev = useRevisionEnVivo();

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const sup = datos?.superficie ?? null;
  const W = sup?.ancho ?? 1, H = sup?.alto ?? 1;
  const margen = 0.05 * Math.max(W, H);
  /** El SVG está montado (los oyentes nativos y la escala se enganchan a él). */
  const hayLienzo = !!activaCara && !!datos?.por_participacion && !!sup;

  const [vista, setVista] = useState({ zoom: 1, cx: W / 2, cy: H / 2 });
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const encuadrar = () => setVista({ zoom: 1, cx: W / 2, cy: H / 2 });
  useEffect(() => { setVista({ zoom: 1, cx: W / 2, cy: H / 2 }); }, [W, H, activaCara?.fixtureId, activaCara?.cara]);
  const vw = (W + 2 * margen) / vista.zoom, vh = (H + 2 * margen) / vista.zoom;
  const viewBox = `${vista.cx - vw / 2} ${vista.cy - vh / 2} ${vw} ${vh}`;

  // Píxeles por metro (la matriz real del SVG): los trazos, las manijas y los
  // rótulos miden en pantalla, no en metros.
  const [escala, setEscala] = useState(200);
  const escalaRef = useRef(escala);
  escalaRef.current = escala;
  useLayoutEffect(() => {
    const leerEscala = () => {
      const a = svgRef.current?.getScreenCTM()?.a;
      if (a && Number.isFinite(a) && a > 0 && Math.abs(a - escalaRef.current) > 1e-6) setEscala(a);
    };
    leerEscala();
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(leerEscala);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [viewBox, hayLienzo]);
  const px = (n: number) => n / escala;

  const [cursor, setCursor] = useState<Punto | null>(null);
  const [panoramica, setPanoramica] = useState(false);
  const espacio = useRef(false);
  const gesto = useRef<Gesto | null>(null);
  const pendiente = useRef<Accion | null>(null);
  const raf = useRef<number | null>(null);

  const despachar = (a: Accion) => useDistribucionStore.getState().despachar(a);
  /** Los movimientos de un arrastre van de a uno por cuadro. */
  const programar = (a: Accion) => {
    pendiente.current = a;
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      const x = pendiente.current;
      pendiente.current = null;
      if (x) despachar(x);
    });
  };
  const vaciar = () => {
    if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    const x = pendiente.current;
    pendiente.current = null;
    if (x) despachar(x);
  };
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);

  const alDia = planoAlDia(datos, mueble);
  const puedeEditar = !!sup && !!datos?.por_participacion && alDia && !cargando && edicion.modo === "editar";

  const guias = useMemo(
    () => (mueble && activaCara ? guiasDeCara(mueble, activaCara.cara) : { entrepanos: [] as number[], parantes: [] as number[] }),
    [mueble, activaCara?.cara],
  );

  /* ── Del puntero a la cara ───────────────────────────────────────────────── */

  const aMetros = (x: number, y: number): [number, number] | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const aUV = (x: number, y: number): Punto | null => {
    const m = aMetros(x, y);
    return m ? [m[0] / W, 1 - m[1] / H] : null;
  };
  const aPantalla = ([u, v]: Punto): { x: number; y: number } | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(u * W, (1 - v) * H).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const radioUV = () => {
    const r = RADIO_DEL_IMAN_PX / escalaRef.current;
    return { u: r / W, v: r / H };
  };
  /** El punto con el imán, si está prendido (a las OTRAS zonas: `excluir`). */
  const imantarUV = (p: Punto, excluir: string | null): Punto => {
    const e = useDistribucionStore.getState().edicion;
    if (!e.iman) return p;
    const { objetivos, segmentos } = objetivosDelIman(e, excluir, guias);
    return imantar(p, objetivos, segmentos, radioUV());
  };

  // La rueda: nativa y no pasiva, alrededor del cursor.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      const m = aMetros(ev.clientX, ev.clientY);
      if (!m) return;
      const v = vistaRef.current;
      const z = Math.min(ZOOM_MAXIMO, Math.max(1, v.zoom * (ev.deltaY < 0 ? PASO_DE_RUEDA : 1 / PASO_DE_RUEDA)));
      if (z === v.zoom) return;
      const k = v.zoom / z;
      setVista({ zoom: z, cx: m[0] + (v.cx - m[0]) * k, cy: m[1] + (v.cy - m[1]) * k });
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
    // `aMetros` lee la matriz del momento; W y H cambian el lienzo entero.
  }, [W, H, hayLienzo]);

  /* ── El puntero ──────────────────────────────────────────────────────────── */

  const alBajar = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!sup) return;
    e.currentTarget.focus({ preventScroll: true });
    if (e.button === 1 || (e.button === 0 && espacio.current)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      gesto.current = { tipo: "pan", x: e.clientX, y: e.clientY, cx: vista.cx, cy: vista.cy };
      setPanoramica(true);
      return;
    }
    if (e.button !== 0) return;
    const p = aUV(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = { x: e.clientX, y: e.clientY };
    const st = useDistribucionStore.getState();
    const ed = st.edicion;
    if (!puedeEditar) { gesto.current = { tipo: "elegir", ...base }; return; }
    if (ed.herramienta === "rectangulo") {
      st.despachar({ tipo: "empezarTrazo", punto: imantarUV(p, null) });
      gesto.current = { tipo: "rect", ...base };
      return;
    }
    if (ed.herramienta === "poligono") { gesto.current = { tipo: "poligono", ...base }; return; }
    const el = e.target as Element;
    const sel = ed.seleccion;
    const vertice = el.closest?.("[data-vertice]");
    const manija = el.closest?.("[data-manija]");
    if (sel && vertice) {
      const i = Number(vertice.getAttribute("data-vertice"));
      st.despachar({ tipo: "seleccionar", zona: sel.zona, vertice: i });
      gesto.current = { tipo: "vertice", ...base, clave: sel.zona, vertice: i, activo: false };
      return;
    }
    if (sel && manija) {
      gesto.current = { tipo: "escala", ...base, clave: sel.zona, manija: manija.getAttribute("data-manija") as Manija, activo: false };
      return;
    }
    // La elegida gana si el puntero cae adentro (se pisan): si no, la de arriba.
    const elegida = sel ? ed.zonas.find((z) => z.clave === sel.zona) : undefined;
    const clave = elegida && zonaEnPunto([elegida], p) ? elegida.clave : zonaEnPunto(ed.zonas, p);
    if (clave) {
      if (!sel || sel.zona !== clave || sel.vertice !== null) st.despachar({ tipo: "seleccionar", zona: clave });
      gesto.current = { tipo: "mover", ...base, clave, desde: p, activo: false };
      return;
    }
    st.despachar({ tipo: "seleccionar", zona: null });
  };

  /** Arranca el arrastre (un paso de deshacer) cuando dejó de ser un clic. */
  const arrancar = (g: Extract<Gesto, { activo: boolean }>, x: number, y: number): boolean => {
    if (g.activo) return true;
    if (esClic({ x: g.x, y: g.y }, { x, y })) return false;
    g.activo = true;
    despachar({ tipo: "empezarArrastre" });
    return true;
  };

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    const p = aUV(e.clientX, e.clientY);
    if (!g) {
      const h = edicion.herramienta;
      if (puedeEditar && p && (h === "poligono" || h === "rectangulo")) setCursor(imantarUV(p, null));
      else if (cursor) setCursor(null);
      return;
    }
    if (g.tipo === "pan") {
      const s = escalaRef.current;
      setVista((v) => ({ ...v, cx: g.cx - (e.clientX - g.x) / s, cy: g.cy - (e.clientY - g.y) / s }));
      return;
    }
    if (!p) return;
    switch (g.tipo) {
      case "rect":
        programar({ tipo: "estirarTrazo", punto: imantarUV(p, null) });
        return;
      case "poligono":
        setCursor(imantarUV(p, null));
        return;
      case "mover": {
        if (!arrancar(g, e.clientX, e.clientY)) return;
        let du = p[0] - g.desde[0], dv = p[1] - g.desde[1];
        const ed = useDistribucionStore.getState().edicion;
        const z = (ed.arrastre?.antes ?? ed.zonas).find((x) => x.clave === g.clave);
        if (z && ed.iman) {
          // El imán mueve la zona entera: el punto suyo que caiga más cerca
          // de un objetivo se pega, y los demás lo siguen (la misma cuenta
          // que el 3D, `imantarTraslado`).
          const { objetivos, segmentos } = objetivosDelIman(ed, g.clave, guias);
          [du, dv] = imantarTraslado(z.vertices, du, dv, objetivos, segmentos, radioUV(), W, H);
        }
        programar({ tipo: "moverZona", clave: g.clave, du, dv });
        return;
      }
      case "vertice":
        if (!arrancar(g, e.clientX, e.clientY)) return;
        programar({ tipo: "moverVertice", clave: g.clave, vertice: g.vertice, punto: imantarUV(p, g.clave) });
        return;
      case "escala":
        if (!arrancar(g, e.clientX, e.clientY)) return;
        programar({ tipo: "escalar", clave: g.clave, manija: g.manija, punto: imantarUV(p, g.clave), proporcional: e.shiftKey });
        return;
      case "elegir":
        return;
    }
  };

  const alSoltar = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    gesto.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    const clic = esClic({ x: g.x, y: g.y }, { x: e.clientX, y: e.clientY });
    const p = aUV(e.clientX, e.clientY);
    switch (g.tipo) {
      case "pan":
        setPanoramica(espacio.current);
        return;
      case "rect":
        vaciar();
        despachar(clic ? { tipo: "cancelarTrazo" } : { tipo: "cerrarTrazo" });
        return;
      case "poligono": {
        if (!clic || !p) return;
        const ed = useDistribucionStore.getState().edicion;
        const primero = ed.trazo?.[0];
        const pp = primero ? aPantalla(primero) : null;
        if (ed.trazo && ed.trazo.length >= 3 && pp && Math.hypot(pp.x - e.clientX, pp.y - e.clientY) <= TOQUE_PX) {
          despachar({ tipo: "cerrarTrazo" });
          setCursor(null);
        } else {
          despachar({ tipo: "agregarPunto", punto: imantarUV(p, null) });
        }
        return;
      }
      case "mover": case "vertice": case "escala":
        if (g.activo) { vaciar(); despachar({ tipo: "terminarArrastre" }); }
        return;
      case "elegir":
        if (clic && p) despachar({ tipo: "seleccionar", zona: zonaEnPunto(useDistribucionStore.getState().edicion.zonas, p) });
        return;
    }
  };

  const alCancelar = () => {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    if (g.tipo === "rect") { pendiente.current = null; despachar({ tipo: "cancelarTrazo" }); }
    if ((g.tipo === "mover" || g.tipo === "vertice" || g.tipo === "escala") && g.activo) { vaciar(); despachar({ tipo: "terminarArrastre" }); }
    if (g.tipo === "pan") setPanoramica(espacio.current);
  };

  /** Doble clic en un borde de la zona elegida: un punto nuevo ahí. */
  const alDobleClic = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!puedeEditar || edicion.herramienta !== "seleccionar" || !edicion.seleccion) return;
    const z = edicion.zonas.find((x) => x.clave === edicion.seleccion!.zona);
    const p = aUV(e.clientX, e.clientY);
    if (!z || !p) return;
    let mejor = -1, dmin = Infinity;
    for (let i = 0; i < z.vertices.length; i++) {
      const a = aPantalla(z.vertices[i]), b = aPantalla(z.vertices[(i + 1) % z.vertices.length]);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / l2)) : 0;
      const d = Math.hypot(e.clientX - (a.x + t * dx), e.clientY - (a.y + t * dy));
      if (d < dmin) { dmin = d; mejor = i; }
    }
    if (mejor >= 0 && dmin <= TOQUE_PX) despachar({ tipo: "insertarVertice", clave: z.clave, despuesDe: mejor, punto: p });
  };

  /* ── Lo que se dibuja ────────────────────────────────────────────────────── */

  const d = datos ? datosDeLaCara(datos) : null;
  const hoy = datos?.hoy ?? "";
  const dia = verAlDia || hoy;

  /** Por participación: su estampa, si cuenta el día, si es reserva y su número. */
  const porS = useMemo(() => {
    const m = new Map<number, { estampa: Estampa | null; cuenta: boolean; reserva: boolean; numero: number | null; nombre: string; contratado: number }>();
    if (!d || !datos) return m;
    for (const p of datos.participaciones) {
      const ts = d.terminosPorS.get(p.space_id) ?? [];
      const queCuenta = p.terminos.find((_t, i) => cuentaEseDia([ts[i]], dia, hoy)) ?? p.terminos[0];
      m.set(p.space_id, {
        estampa: d.estampas.get(p.space_id) ?? null, cuenta: cuentaEseDia(ts, dia, hoy),
        reserva: queCuenta?.estado === "reserva", numero: p.numero, nombre: nombreDeParticipacion(p), contratado: p.contratado_pb,
      });
    }
    return m;
  }, [d, datos, dia, hoy]);

  /** El relleno de cada participación: los trapecios de su unión ∩ lo que se vende. */
  const rellenos = useMemo(() => {
    const out: { spaceId: number; d: string }[] = [];
    if (!sup) return out;
    const validas = new Map<number, Poligono[]>();
    for (const z of edicion.zonas) {
      const r = validarZona(z.vertices, W, H);
      if (r.codigo !== null) continue;
      const l = validas.get(z.participacionSpaceId);
      if (l) l.push(r.vertices); else validas.set(z.participacionSpaceId, [r.vertices]);
    }
    for (const [s, P] of validas) {
      const ts = trapecios(P, sup.exclusiones);
      out.push({ spaceId: s, d: ts.map((t) => camino(t, W, H)).join(" ") });
    }
    return out;
  }, [edicion.zonas, sup, W, H]);

  /** Los solapes de participaciones que rigen a la vez (más de 1 cm²). */
  const solapes = useMemo(() => {
    const out: string[] = [];
    if (!sup || !rev || !d) return out;
    const por = new Map<number, Poligono[]>();
    for (const v of rev.medidas.validaciones) {
      if (v.codigo !== null || !v.vertices) continue;
      const l = por.get(v.participacionSpaceId);
      if (l) l.push(v.vertices); else por.set(v.participacionSpaceId, [v.vertices]);
    }
    for (const pz of rev.medidas.pisadas) {
      if (!(pz.m2 > AREA_MINIMA_M2)) continue;
      const t1 = d.terminosPorS.get(pz.s1), t2 = d.terminosPorS.get(pz.s2);
      if (!t1 || !t2 || !seCruzanEnFechas(t1, t2, hoy)) continue;
      const ts = trapecios(por.get(pz.s1) ?? [], sup.exclusiones, por.get(pz.s2) ?? []);
      out.push(ts.map((t) => camino(t, W, H)).join(" "));
    }
    return out;
  }, [rev, sup, d, hoy, W, H]);

  /** Las zonas con un error propio y las participaciones que se pasan. */
  const conError = useMemo(() => {
    const zonas = new Set<number>(), participaciones = new Set<number>();
    for (const p of rev?.juicio.errores ?? []) {
      if (p.zona !== null) zonas.add(p.zona);
      else if (p.codigo === "EXCESO") for (const n of p.participaciones) participaciones.add(n);
    }
    return { zonas, participaciones };
  }, [rev]);

  const rotulos = useMemo(() => edicion.zonas.map((z) => puntoInterior(z.vertices, W, H)), [edicion.zonas, W, H]);

  /** La historia: zonas de la capa del servidor cuyas participaciones ya no rigen. */
  const historia = useMemo(() => {
    if (!datos || !d) return [];
    const muertas = new Set(d.historia.map((p) => p.space_id));
    return capaQueSeMuestra(datos).filter((z) => muertas.has(z.participacion_space_id));
  }, [datos, d]);

  /* ── Sin cara que dibujar ───────────────────────────────────────────────── */

  const marco = (texto: string) => (
    <div data-distribucion data-lienzo-de-zonas className="flex h-full w-full items-center justify-center bg-dark-bg p-6">
      <p className="max-w-sm text-center text-sm leading-relaxed text-dark-ink-2">{texto}</p>
    </div>
  );
  if (!activaCara || (!datos && cargando)) return marco("Leyendo la cara…");
  if (!datos) return marco("No se pudo leer la cara: mirá el panel de la derecha.");
  if (!datos.por_participacion) return marco("Esta cara se vende entera: para dibujar sus zonas, vendela por participación desde el panel de la derecha.");
  if (!sup) return marco("Este mueble no tiene una cara para dibujar zonas.");

  const ed = edicion;
  const elegida = ed.seleccion ? ed.zonas.find((z) => z.clave === ed.seleccion!.zona) ?? null : null;
  const cajaElegida = elegida ? cajas([elegida.vertices]) : null;
  const atenuar = (s: number) => ed.activa !== null && ed.activa !== s;
  const tonoDe = (s: number) => {
    const e = porS.get(s)?.estampa;
    return e ? tonoCss(e) : C.gris;
  };
  const herramienta = (h: Herramienta, icono: JSX.Element, titulo: string, tecla: string) => {
    const dibujo = h !== "seleccionar";
    const deshabilitada = !puedeEditar || (dibujo && ed.activa === null);
    return (
      <button
        type="button"
        aria-pressed={ed.herramienta === h}
        disabled={deshabilitada}
        title={dibujo && ed.activa === null ? AVISO_SIN_ACTIVA : `${titulo} (${tecla})`}
        onClick={() => despachar({ tipo: "elegirHerramienta", herramienta: h })}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${ed.herramienta === h ? "border-dark-ink-2 bg-dark-surface-2 text-dark-ink-1" : "border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"}`}
      >
        {icono}<span>{titulo}</span><kbd className="font-mono text-[9px] text-dark-ink-3">{tecla}</kbd>
      </button>
    );
  };
  const interruptor = (prendido: boolean, accion: Accion, icono: JSX.Element, titulo: string, ayuda: string) => (
    <button
      type="button" aria-pressed={prendido} title={ayuda} onClick={() => despachar(accion)}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${prendido ? "border-dark-ink-2 bg-dark-surface-2 text-dark-ink-1" : "border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"}`}
    >
      {icono}<span>{titulo}</span><span className="text-[9px] text-dark-ink-3">{prendido ? "sí" : "no"}</span>
    </button>
  );

  /** «Ajustar el borde a la vecina»: no cuentan como vecinas las zonas de
   *  participaciones cuyas fechas no se cruzan con las de la elegida (pueden
   *  pisarse), como en «Ajustar al contratado» de la leyenda. */
  const ajustarBorde = () => {
    if (!elegida || !d) return;
    const mias = d.terminosPorS.get(elegida.participacionSpaceId) ?? [];
    const ignorar = ed.zonas.filter((z) => {
      if (z.clave === elegida.clave || z.participacionSpaceId === elegida.participacionSpaceId) return false;
      const suyas = d.terminosPorS.get(z.participacionSpaceId);
      return !suyas || !seCruzanEnFechas(mias, suyas, hoy);
    }).map((z) => z.clave);
    despachar({ tipo: "ajustarBorde", clave: elegida.clave, ignorar });
  };

  const pista = ed.aviso
    ?? (!alDia ? "El plano tiene cambios sin guardar: esperá un momento."
      : ed.modo === "mirar" ? "Mirar: tocá una zona para ver de quién es. Para dibujar, pasá a «Editar»."
      : ed.activa === null && ed.herramienta !== "seleccionar" ? AVISO_SIN_ACTIVA
      : ed.activa === null ? `${PISTAS.seleccionar} Para dibujar, elegí una participación en la lista.`
      : PISTAS[ed.herramienta]);

  const fs = px(11);
  const manijaPx = px(10);
  // Los datos de la zona elegida se ven en «Mirar» y en «Editar» por igual
  // (pedido §12: «al seleccionar una sombra, muestra sus datos»).
  const partElegida = elegida ? d?.porSpace.get(elegida.participacionSpaceId) ?? null : null;
  const kElegida = elegida ? ed.zonas.indexOf(elegida) : -1;

  return (
    <div data-distribucion data-lienzo-de-zonas className="flex h-full w-full min-w-0 flex-col bg-dark-bg text-dark-ink-1">
      {/* Herramientas */}
      <div className="flex flex-wrap items-center gap-1 border-b border-dark-line px-2 py-1.5">
        {herramienta("seleccionar", <MousePointer2 size={12} />, "Seleccionar", "V")}
        {herramienta("rectangulo", <Square size={12} />, "Rectángulo", "R")}
        {herramienta("poligono", <Pentagon size={12} />, "Polígono", "P")}
        <span className="mx-1 h-4 w-px bg-dark-line" aria-hidden />
        <button type="button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={!puedeEditar || ed.atras.length === 0}
          onClick={() => despachar({ tipo: "deshacer" })}
          className="rounded-md border border-dark-line-2 p-1 text-dark-ink-2 hover:text-dark-ink-1 disabled:cursor-not-allowed disabled:opacity-40"><Undo2 size={12} /></button>
        <button type="button" title="Rehacer (Ctrl+Shift+Z o Ctrl+Y)" aria-label="Rehacer" disabled={!puedeEditar || ed.adelante.length === 0}
          onClick={() => despachar({ tipo: "rehacer" })}
          className="rounded-md border border-dark-line-2 p-1 text-dark-ink-2 hover:text-dark-ink-1 disabled:cursor-not-allowed disabled:opacity-40"><Redo2 size={12} /></button>
        <span className="mx-1 h-4 w-px bg-dark-line" aria-hidden />
        {interruptor(ed.iman, { tipo: "alternarIman" }, <Magnet size={12} />, "Imán",
          "Imán (G): pega los puntos a los de las otras zonas y al borde de la cara.")}
        {interruptor(ed.guias, { tipo: "alternarGuias" }, <Grid3x3 size={12} />, "Guías",
          "Ver los entrepaños y los parantes (sólo para ver: no imantan).")}
        {ed.guias && interruptor(ed.imanAGuias, { tipo: "alternarImanAGuias" }, <Magnet size={12} />, "Imán a guías",
          "Que el imán también pegue a los entrepaños y los parantes.")}
        <button
          type="button" data-ajustar-borde disabled={!puedeEditar || !elegida || !!ed.trazo} onClick={ajustarBorde}
          title="Ajustar el borde a la vecina: pega el borde más cercano de la zona elegida al de la zona de al lado (hasta 5 cm). Sólo mueve los dos puntos de ese borde."
          className="flex items-center gap-1 rounded-md border border-dark-line-2 px-2 py-1 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowRightToLine size={12} /><span>Ajustar el borde</span>
        </button>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-dark-ink-3">
            Cara {activaCara.cara} · {metros(W)} × {metros(H)} m · {Math.round(vista.zoom * 100)} %
          </span>
          <button type="button" title="Encuadrar (0)" aria-label="Encuadrar" onClick={encuadrar}
            className="rounded-md border border-dark-line-2 p-1 text-dark-ink-2 hover:text-dark-ink-1"><Maximize2 size={12} /></button>
        </span>
      </div>

      {comoEstaba && (
        <div className="flex items-center gap-2 border-b border-dark-line px-3 py-1.5 text-[11px] text-dark-ink-2">
          <span>Viendo <b className="text-dark-ink-1">{comoEstaba.titulo}</b>, en gris y sólo para mirar.</span>
          <button type="button" onClick={() => useVistaDeDistribucion.getState().verComoEstaba(null)}
            className="ml-auto flex items-center gap-1 rounded border border-dark-line-2 px-1.5 py-0.5 text-dark-ink-1 hover:bg-dark-line">
            <X size={11} />Dejar de verlo
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          tabIndex={0}
          role="application"
          aria-label={`Lienzo de la cara ${activaCara.cara}: ${ed.zonas.length} zonas. Herramientas V, R y P; Supr borra la zona elegida; Ctrl+Z deshace.`}
          className="absolute inset-0 block h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-dark-ink-3"
          style={{
            touchAction: "none",
            cursor: panoramica ? "grabbing" : puedeEditar && ed.herramienta !== "seleccionar" ? "crosshair" : "default",
          }}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alCancelar}
          onPointerLeave={() => { if (!gesto.current && cursor) setCursor(null); }}
          onDoubleClick={alDobleClic}
          onKeyDown={(e) => {
            if (e.key === " ") { e.preventDefault(); if (!espacio.current) { espacio.current = true; setPanoramica(true); } }
            else if (e.key === "0" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); encuadrar(); }
          }}
          onKeyUp={(e) => { if (e.key === " ") { espacio.current = false; if (!gesto.current) setPanoramica(false); } }}
          onBlur={() => { espacio.current = false; if (!gesto.current) setPanoramica(false); }}
        >
          <defs>
            <pattern id={`${uid}-excl`} patternUnits="userSpaceOnUse" width={px(7)} height={px(7)} patternTransform="rotate(45)">
              <rect width={px(7)} height={px(7)} style={{ fill: C.linea, opacity: 0.5 }} />
              <line x1={0} y1={0} x2={0} y2={px(7)} style={{ stroke: C.gris }} strokeWidth={px(1.5)} />
            </pattern>
            <pattern id={`${uid}-solape`} patternUnits="userSpaceOnUse" width={px(6)} height={px(6)} patternTransform="rotate(-45)">
              <line x1={0} y1={0} x2={0} y2={px(6)} style={{ stroke: C.rojo }} strokeWidth={px(2.5)} />
            </pattern>
            {ESTAMPAS.filter((e) => e.textura !== "lleno").map((e) => (
              <pattern key={e.indice} id={`${uid}-e${e.indice}`} patternUnits="userSpaceOnUse" width={px(7)} height={px(7)}
                patternTransform={`rotate(${e.textura === "rayado45" ? 45 : 135})`}>
                <line x1={0} y1={0} x2={0} y2={px(7)} style={{ stroke: tonoCss(e) }} strokeWidth={px(2.2)} />
              </pattern>
            ))}
          </defs>

          {/* La cara y lo que no se vende */}
          <rect x={0} y={0} width={W} height={H} style={{ fill: C.cara, stroke: C.borde }} strokeWidth={px(1)} />
          {sup.exclusiones.map((x, i) => (
            <rect key={i} x={x.u0 * W} y={(1 - x.v1) * H} width={(x.u1 - x.u0) * W} height={(x.v1 - x.v0) * H}
              fill={`url(#${uid}-excl)`} data-exclusion={x.por}>
              <title>{`${NOMBRES_DE_EXCLUSION[x.por] ?? x.por}: no se vende`}</title>
            </rect>
          ))}

          {/* Guías: sólo para ver */}
          {ed.guias && (
            <g style={{ stroke: C.tinta2 }} strokeWidth={px(1)} strokeDasharray={`${px(3)} ${px(3)}`} opacity={0.55} pointerEvents="none">
              {guias.entrepanos.map((v, i) => <line key={`e${i}`} x1={0} x2={W} y1={(1 - v) * H} y2={(1 - v) * H} />)}
              {guias.parantes.map((u, i) => <line key={`p${i}`} x1={u * W} x2={u * W} y1={0} y2={H} />)}
            </g>
          )}

          {/* «Ver cómo estaba» */}
          {comoEstaba && (
            <g pointerEvents="none">
              {comoEstaba.zonas.map((z) => (
                <path key={z.id} d={camino(z.vertices, W, H)} style={{ fill: C.gris, stroke: C.gris }} fillOpacity={0.25} strokeWidth={px(1.5)} />
              ))}
            </g>
          )}

          {/* La historia: participaciones que ya no rigen */}
          <g pointerEvents="none">
            {historia.map((z) => (
              <path key={z.id} d={camino(z.vertices, W, H)} style={{ fill: "none", stroke: C.gris }}
                strokeWidth={px(1.5)} strokeDasharray={`${px(4)} ${px(3)}`} data-historia />
            ))}
          </g>

          {/* Rellenos: su estampa, sólo sobre lo que se vende */}
          <g pointerEvents="none">
            {rellenos.map(({ spaceId, d: dd }) => {
              const info = porS.get(spaceId);
              if (!info?.cuenta || !info.estampa) return null;
              const e = info.estampa;
              const tenue = atenuar(spaceId);
              return (
                <g key={spaceId} opacity={tenue ? 0.15 : 1} data-relleno={info.numero ?? ""}>
                  <path d={dd} style={{ fill: tonoCss(e) }} fillOpacity={e.textura === "lleno" ? 0.45 : 0.18} />
                  {e.textura !== "lleno" && <path d={dd} fill={`url(#${uid}-e${e.indice})`} />}
                </g>
              );
            })}
          </g>

          {/* Los contornos crudos */}
          <g pointerEvents="none">
            {ed.zonas.map((z, k) => {
              const info = porS.get(z.participacionSpaceId);
              const error = conError.zonas.has(k) || (info?.numero != null && conError.participaciones.has(info.numero));
              const punteado = !info?.cuenta || info.reserva;
              const resaltada = ed.activa === z.participacionSpaceId;
              return (
                <path key={z.clave} d={camino(z.vertices, W, H)}
                  opacity={atenuar(z.participacionSpaceId) ? 0.15 : 1}
                  style={{ fill: "none", stroke: error ? C.rojo : tonoDe(z.participacionSpaceId) }}
                  strokeWidth={px(resaltada ? 3 : 2)}
                  strokeDasharray={punteado ? `${px(6)} ${px(4)}` : undefined}
                  strokeLinejoin="round"
                  data-zona={k + 1}
                />
              );
            })}
          </g>

          {/* Solapes con fechas cruzadas: el pedazo que choca */}
          <g pointerEvents="none">
            {solapes.map((dd, i) => (
              <g key={i} data-solape>
                <path d={dd} fill={`url(#${uid}-solape)`} />
                <path d={dd} style={{ fill: "none", stroke: C.rojo }} strokeWidth={px(1)} />
              </g>
            ))}
          </g>

          {/* La zona elegida: puntos y manijas de escala */}
          {elegida && cajaElegida && (
            <g>
              <rect x={cajaElegida[0] * W} y={(1 - cajaElegida[3]) * H} width={(cajaElegida[2] - cajaElegida[0]) * W}
                height={(cajaElegida[3] - cajaElegida[1]) * H} style={{ fill: "none", stroke: C.tinta2 }}
                strokeWidth={px(1)} strokeDasharray={`${px(2)} ${px(3)}`} pointerEvents="none" />
              {puedeEditar && ed.herramienta === "seleccionar" && MANIJAS.map((m) => (
                <circle key={m.m} data-manija={m.m} cx={m.u(cajaElegida) * W} cy={(1 - m.v(cajaElegida)) * H} r={px(4.5)}
                  style={{ fill: C.tinta, stroke: C.cara, cursor: m.cursor }} strokeWidth={px(1.5)} />
              ))}
              {elegida.vertices.map(([u, v], i) => {
                const marcado = ed.seleccion?.vertice === i;
                return (
                  <rect key={i} data-vertice={i} x={u * W - manijaPx / 2} y={(1 - v) * H - manijaPx / 2} width={manijaPx} height={manijaPx}
                    style={{ fill: marcado ? C.tinta : C.cara, stroke: C.tinta, cursor: puedeEditar ? "move" : "default" }}
                    strokeWidth={px(1.5)} pointerEvents={puedeEditar && ed.herramienta === "seleccionar" ? "all" : "none"} />
                );
              })}
            </g>
          )}

          {/* El trazo en curso */}
          {ed.trazo && (
            <g pointerEvents="none" style={{ stroke: ed.activa !== null ? tonoDe(ed.activa) : C.tinta }}>
              {ed.herramienta === "rectangulo" && ed.trazo.length >= 2 && (() => {
                const [a, b] = [ed.trazo[0], ed.trazo[ed.trazo.length - 1]];
                return (
                  <rect x={Math.min(a[0], b[0]) * W} y={(1 - Math.max(a[1], b[1])) * H}
                    width={Math.abs(b[0] - a[0]) * W} height={Math.abs(b[1] - a[1]) * H}
                    style={{ fill: "none" }} strokeWidth={px(2)} strokeDasharray={`${px(5)} ${px(3)}`} />
                );
              })()}
              {ed.herramienta === "poligono" && (
                <>
                  <polyline
                    points={[...ed.trazo, ...(cursor ? [cursor] : [])].map(([u, v]) => `${u * W},${(1 - v) * H}`).join(" ")}
                    style={{ fill: "none" }} strokeWidth={px(2)} />
                  {ed.trazo.map(([u, v], i) => (
                    <circle key={i} cx={u * W} cy={(1 - v) * H} r={px(i === 0 ? 6 : 3)}
                      style={{ fill: i === 0 ? C.cara : C.tinta }} strokeWidth={px(1.5)} />
                  ))}
                </>
              )}
            </g>
          )}
          {cursor && puedeEditar && ed.herramienta !== "seleccionar" && !ed.trazo && (
            <circle cx={cursor[0] * W} cy={(1 - cursor[1]) * H} r={px(3)} style={{ fill: C.tinta }} pointerEvents="none" />
          )}

          {/* Rótulos: número y porcentaje, sobre una pastilla */}
          <g pointerEvents="none" fontSize={fs} fontWeight={700}>
            {ed.zonas.map((z, k) => {
              const info = porS.get(z.participacionSpaceId);
              const [u, v] = rotulos[k] ?? [0.5, 0.5];
              const error = conError.zonas.has(k) || (info?.numero != null && conError.participaciones.has(info.numero));
              const texto = `${error ? "⚠ " : ""}${info?.numero ?? "?"} · ${pct(info?.contratado ?? 0)}`;
              const ancho = texto.length * fs * 0.62 + px(8);
              const alto = fs * 1.5;
              return (
                <g key={z.clave} opacity={atenuar(z.participacionSpaceId) ? 0.35 : 1} transform={`translate(${u * W} ${(1 - v) * H})`}>
                  <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx={px(4)}
                    style={{ fill: C.cara, stroke: error ? C.rojo : C.borde }} strokeWidth={px(1)} />
                  <text textAnchor="middle" dominantBaseline="central" style={{ fill: error ? C.rojo : C.tinta }}>{texto}</text>
                  <title>{`Zona ${k + 1} · participación ${info?.nombre ?? "?"}`}</title>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Lo que se ve de la zona elegida, en «Mirar» y en «Editar» */}
        {elegida && partElegida && (
          <div data-datos-de-la-zona className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-md border border-dark-line-2 bg-dark-surface px-2.5 py-1.5 text-[11px] text-dark-ink-2 shadow-lg">
            {datosDeLaZona(kElegida, elegida.vertices, partElegida, sup, dia, hoy)}
          </div>
        )}
        {!alDia && (
          <div className="absolute inset-x-2 bottom-2 rounded-md border px-3 py-1.5 text-[11px]"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))", background: "rgb(var(--surface-rgb))" }}>
            El plano tiene cambios sin guardar: esperá un momento. La edición sigue cuando el plano se guarde.
          </div>
        )}
      </div>

      <p className="border-t border-dark-line px-3 py-1.5 text-[11px] leading-snug"
        style={{ color: ed.aviso ? "rgb(var(--entra-txt-rgb))" : "rgb(var(--ink-3-rgb))" }} aria-live="polite">
        {pista}
      </p>
    </div>
  );
}
