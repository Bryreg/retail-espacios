import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { capaQueSeMuestra, planoAlDia, useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import { TOQUE_PX, esClic, puntoInterior } from "../../utils/edicionDeZonas";
import { pct } from "../../utils/participaciones";
import {
  AJUSTE_SOLO_PB, bordesUtiles, dejarJustaAMano, encajar, estirar, huecosLibres, imantarAMano, lineasDeLaCara,
  lineasDeOcupados, llevaAMano, poligonoDeRect, primeraQuePisa, type CaraDePiezas as Cara, type Rect,
} from "../../utils/piezas";
import { trapecios, type Poligono, type Punto } from "../../utils/zonasGeometria";
import { datosDeLaCara, useVistaDeDistribucion } from "./LeyendaDeParticipaciones";
import { ocupadosPara, useCaraDePiezas, usePiezas, usePiezasUI, type Pieza } from "./piezasDeLaCara";

/**
 * La cara de frente, con sus piezas (Distribuir «como un juego de piezas»,
 * 2026-10-24). Un SVG en METROS: lo que no se vende va rayado (zócalo,
 * parantes, remate), lo libre en verde, los estantes como líneas, y encima la
 * pieza de cada marca con su nombre y su %.
 *
 *   · Las piezas se SUELTAN acá (desde la lista de la derecha, o moviéndolas
 *     dentro de la cara): `encajar` (de `utils/piezas.ts`) las pega a los
 *     bordes de lo que se vende y al costado de las otras, y siempre con su %
 *     exacto. Si caen encima de otra marca cuyas fechas se cruzan, quedan
 *     marcadas en rojo y NO se ubican.
 *   · Una Franja o una de Estantes elegida tiene cuatro manijas: estirarla
 *     conserva el % (más ancha, más baja).
 *   · «A mano»: cada toque es una esquina, pegada por eje al estante o borde
 *     más cercano; el primer punto es un círculo grande y tocarlo cierra.
 *
 * Edita SÓLO por el reductor del store (`despachar` de `utils/edicionDeZonas`,
 * `ponerPiezas` y el trazo «A mano»): nada escribe el plano. Las teclas las
 * atiende el oyente en captura de la pantalla (`atajoDeDistribucion`): Supr
 * saca la pieza elegida, nunca el mueble.
 *
 * Los colores salen de los tokens del tema (`rgb(var(--x-rgb))`): la pantalla
 * va en el tema de la app, claro u oscuro.
 */

/** Los colores: tokens del tema (canales `-rgb`). */
const C = {
  cara: "rgb(var(--surface-rgb))",
  borde: "rgb(var(--ink-1-rgb))",
  raya: "rgb(var(--line-strong-rgb))",
  estante: "rgb(var(--line-strong-rgb))",
  libre: "rgb(var(--libre-suave-rgb))",
  libreTxt: "rgb(var(--libre-txt-rgb))",
  tinta: "rgb(var(--ink-1-rgb))",
  tinta2: "rgb(var(--ink-2-rgb))",
  gris: "rgb(var(--ink-3-rgb))",
  rojo: "rgb(var(--ocupado-rgb))",
  rojoTxt: "rgb(var(--ocupado-txt-rgb))",
  pastilla: "rgb(var(--surface-rgb) / 0.9)",
};

/** Cómo se llama lo que no se vende, al pasar el puntero por encima. */
const NOMBRES_DE_EXCLUSION: Record<string, string> = {
  zocalo: "zócalo", parante: "parante", remate: "remate", copete: "copete", base: "base", marco: "marco",
  divisor: "divisor", poste: "poste", cabezal: "cabezal", tapa: "tapa",
  costado: "costado", montante: "montante",
};

const camino = (pts: readonly Punto[], W: number, H: number) =>
  pts.map(([u, v], i) => `${i === 0 ? "M" : "L"}${u * W} ${(1 - v) * H}`).join(" ") + " Z";

/** El SVG de la cara montado (lo usa el arrastre que empieza en la lista). */
let svgDeLaCara: SVGSVGElement | null = null;

/** De un punto de la pantalla a u,v de la cara; null si cae afuera del dibujo. */
export function uvEnLaCara(x: number, y: number, ancho: number, alto: number): Punto | null {
  const svg = svgDeLaCara;
  const m = svg?.getScreenCTM();
  if (!svg || !m) return null;
  const r = svg.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return [p.x / ancho, 1 - p.y / alto];
}

/** Píxeles por metro del dibujo de la cara (para el radio del imán). */
export function escalaDeLaCara(): number {
  const a = svgDeLaCara?.getScreenCTM()?.a;
  return a && Number.isFinite(a) && a > 0 ? a : 200;
}

/** Dónde caería una pieza soltada en (u, v): el rectángulo exacto y a quién
 *  pisaría. La misma cuenta para la lista y para mover en la cara. */
export function dondeCae(cara: Cara, p: Pieza, piezas: readonly Pieza[], hoy: string, u: number, v: number): { rect: Rect | null; pisa: number | null } {
  if (p.forma === "a_mano") return { rect: null, pisa: null };
  const ocupados = ocupadosPara(p.spaceId, piezas, hoy);
  const radio = 14 / (escalaDeLaCara() * cara.ancho);
  const ancho = p.forma === "estantes" && p.rect && p.estado !== "sin_ubicar" ? p.rect.u1 - p.rect.u0 : null;
  const rect = encajar(cara, p.pb, p.forma, u, v, ocupados, { radio, ancho });
  return { rect, pisa: rect ? primeraQuePisa([poligonoDeRect(rect)], ocupados, cara) : null };
}

type Gesto =
  | { tipo: "mover"; spaceId: number; x: number; y: number; movido: boolean }
  | { tipo: "estirar"; spaceId: number; lado: "e" | "o" | "n" | "s"; x: number; y: number; movido: boolean }
  | { tipo: "tocar"; x: number; y: number };

/** Lo que se ve mientras se mueve o se estira una pieza dentro de la cara. */
interface Vista { spaceId: number; rect: Rect | null; pisa: number | null }

export default function CaraDePiezas({ fixtureId, sede, onSoltar }: {
  fixtureId: string;
  sede: string;
  /** Ubicar la pieza en ese rectángulo (o marcar el choque): lo decide la pantalla. */
  onSoltar: (spaceId: number, rect: Rect | null, pisa: number | null) => void;
}) {
  const datos = useDistribucionStore((s) => s.datos);
  const activa = useDistribucionStore((s) => s.activa);
  const edicion = useDistribucionStore((s) => s.edicion);
  const cargando = useDistribucionStore((s) => s.cargando);
  const comoEstaba = useVistaDeDistribucion((s) => s.comoEstaba);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[sede] ?? selectFixtures(s)).find((f) => f.id === fixtureId) ?? null);
  const cara = useCaraDePiezas(fixtureId, sede);
  const piezas = usePiezas();
  const elegida = usePiezasUI((s) => s.elegida);
  const arrastre = usePiezasUI((s) => s.arrastre);
  const choque = usePiezasUI((s) => s.choque);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const W = cara?.ancho ?? 1, H = cara?.alto ?? 1;
  const margen = 0.025 * Math.max(W, H);
  const [escala, setEscala] = useState(200);
  useLayoutEffect(() => {
    const leer = () => {
      const a = svgRef.current?.getScreenCTM()?.a;
      if (a && Number.isFinite(a) && a > 0) setEscala((x) => (Math.abs(x - a) > 1e-6 ? a : x));
    };
    leer();
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(leer);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [W, H, !!cara]);
  const px = (n: number) => n / escala;

  const [cursor, setCursor] = useState<Punto | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const gesto = useRef<Gesto | null>(null);

  const alDia = planoAlDia(datos, mueble);
  const puedeEditar = !!cara && !!datos?.por_participacion && alDia && !cargando && edicion.modo === "editar";
  const hoy = datos?.hoy ?? "";
  const porS = useMemo(() => new Map(piezas.map((p) => [p.spaceId, p])), [piezas]);
  const piezaElegida = elegida !== null ? porS.get(elegida) ?? null : null;
  const aMano = !!piezaElegida && piezaElegida.forma === "a_mano" && edicion.herramienta === "poligono" && edicion.activa === piezaElegida.spaceId;

  // Las líneas del imán «A mano»: las de la cara y los lados de las otras piezas.
  const lineasAMano = useMemo(() => {
    if (!cara || !piezaElegida) return null;
    const l = lineasDeLaCara(cara);
    const o = lineasDeOcupados(ocupadosPara(piezaElegida.spaceId, piezas, hoy));
    return { us: [...l.us, ...o.us], vs: [...l.vs, ...o.vs] };
  }, [cara, piezaElegida, piezas, hoy]);

  const aUV = (x: number, y: number): Punto | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return [p.x / W, 1 - p.y / H];
  };
  const aPantalla = ([u, v]: Punto): { x: number; y: number } | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(u * W, (1 - v) * H).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const imantado = (p: Punto): Punto => {
    if (!lineasAMano) return p;
    const r = 10 / escala;
    return imantarAMano(p, lineasAMano, { u: r / W, v: r / H });
  };
  const despachar = useDistribucionStore.getState().despachar;

  /* ── El puntero ─────────────────────────────────────────────────────────── */

  const alBajar = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !cara) return;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = e.target as Element;
    const manija = el.closest?.("[data-manija]");
    const pieza = el.closest?.("[data-pieza]");
    const base = { x: e.clientX, y: e.clientY };
    if (puedeEditar && !aMano && manija && piezaElegida?.rect) {
      gesto.current = { tipo: "estirar", spaceId: piezaElegida.spaceId, lado: manija.getAttribute("data-manija") as "e" | "o" | "n" | "s", ...base, movido: false };
      return;
    }
    if (!aMano && pieza) {
      const s = Number(pieza.getAttribute("data-pieza"));
      gesto.current = { tipo: "mover", spaceId: s, ...base, movido: false };
      return;
    }
    gesto.current = { tipo: "tocar", ...base };
  };

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    const p = aUV(e.clientX, e.clientY);
    if (!g) {
      if (aMano && p) setCursor(imantado(p)); else if (cursor) setCursor(null);
      return;
    }
    if (!p || !cara) return;
    if (g.tipo === "tocar") { if (aMano) setCursor(imantado(p)); return; }
    if (!g.movido && esClic({ x: g.x, y: g.y }, { x: e.clientX, y: e.clientY })) return;
    g.movido = true;
    const pz = porS.get(g.spaceId);
    if (!pz || !puedeEditar) return;
    if (g.tipo === "mover") {
      if (pz.forma === "a_mano") return;           // una forma a mano se rehace, no se arrastra
      setVista({ spaceId: pz.spaceId, ...dondeCae(cara, pz, piezas, hoy, p[0], p[1]) });
      return;
    }
    // Estirar: el lado sigue al puntero y el otro eje se resuelve solo.
    if (!pz.rect) return;
    const valor = g.lado === "e" || g.lado === "o" ? p[0] : p[1];
    const rect = estirar(cara, pz.pb, pz.rect, g.lado, valor, 10 / (escala * (g.lado === "e" || g.lado === "o" ? W : H)));
    const pisa = rect ? primeraQuePisa([poligonoDeRect(rect)], ocupadosPara(pz.spaceId, piezas, hoy), cara) : null;
    if (rect) setVista({ spaceId: pz.spaceId, rect, pisa });
  };

  const alSoltar = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    gesto.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g || !cara) return;
    const p = aUV(e.clientX, e.clientY);
    const v = vista;
    setVista(null);
    if ((g.tipo === "mover" || g.tipo === "estirar") && g.movido) {
      if (v && v.spaceId === g.spaceId) onSoltar(g.spaceId, v.rect, v.pisa);
      return;
    }
    if (g.tipo === "mover") {
      // Un toque en una pieza: queda elegida (y su zona, para Supr).
      usePiezasUI.getState().elegir(g.spaceId);
      const pz = porS.get(g.spaceId);
      if (pz?.zonas[0]) despachar({ tipo: "seleccionar", zona: pz.zonas[0].clave });
      return;
    }
    if (!p || !esClic({ x: g.x, y: g.y }, { x: e.clientX, y: e.clientY })) return;
    if (aMano && puedeEditar) {
      const ed = useDistribucionStore.getState().edicion;
      const primero = ed.trazo?.[0];
      const pp = primero ? aPantalla(primero) : null;
      if (ed.trazo && ed.trazo.length >= 3 && pp && Math.hypot(pp.x - e.clientX, pp.y - e.clientY) <= TOQUE_PX * 2) {
        // Si quedó cerca (±3 %), se deja JUSTA sola corriendo un lado suelto
        // —el que se puso a ojo—; los pegados a estantes y bordes no se tocan.
        const lleva = llevaAMano(ed.trazo, cara);
        const justa = piezaElegida && lineasAMano && lleva !== null && lleva !== piezaElegida.pb && Math.abs(lleva - piezaElegida.pb) <= AJUSTE_SOLO_PB
          ? dejarJustaAMano(ed.trazo, cara, piezaElegida.pb, ocupadosPara(piezaElegida.spaceId, piezas, hoy).flatMap((o) => [...o.poligonos]), lineasAMano)
          : null;
        despachar({ tipo: "cerrarTrazo", reemplazar: true });
        if (justa && piezaElegida) {
          despachar({ tipo: "ponerPiezas", piezas: [{ spaceId: piezaElegida.spaceId, vertices: [justa] }] });
          usePiezasUI.getState().decir(`${piezaElegida.corto}: le corrimos un lado para que quede en ${pct(piezaElegida.pb)} justo. Deshacer la deja como la dibujaste.`);
        }
        setCursor(null);
      } else {
        if (!ed.trazo?.length) usePiezasUI.getState().decir(null);   // empieza otra forma: la pista vuelve a explicar
        despachar({ tipo: "agregarPunto", punto: imantado(p) });
      }
      return;
    }
    // Tocar lo libre con una pieza sin ubicar elegida: ahí va (lo mismo que arrastrarla).
    if (puedeEditar && piezaElegida && piezaElegida.estado === "sin_ubicar" && piezaElegida.forma !== "a_mano") {
      const r = dondeCae(cara, piezaElegida, piezas, hoy, p[0], p[1]);
      onSoltar(piezaElegida.spaceId, r.rect, r.pisa);
      return;
    }
    despachar({ tipo: "seleccionar", zona: null });
  };

  const alCancelar = () => { gesto.current = null; setVista(null); };
  useEffect(() => { if (!aMano) setCursor(null); }, [aMano]);

  /* ── Lo que se dibuja ───────────────────────────────────────────────────── */

  const sup = datos?.superficie ?? null;
  const E = sup?.exclusiones;
  const vendible = useMemo(() => (E ? trapecios([[[0, 0], [1, 0], [1, 1], [0, 1]]], E).map((t) => camino(t, W, H)).join(" ") : ""), [E, W, H]);
  const relleno = (P: readonly Poligono[]) => (E ? trapecios([...P], E).map((t) => camino(t, W, H)).join(" ") : "");

  /** La historia: zonas de marcas que ya no rigen (gris, punteado). */
  const historia = useMemo(() => {
    if (!datos) return [];
    const muertas = new Set(datosDeLaCara(datos).historia.map((p) => p.space_id));
    return capaQueSeMuestra(datos).filter((z) => muertas.has(z.participacion_space_id));
  }, [datos]);

  const marco = (texto: string) => (
    <div data-lienzo-de-zonas className="flex min-h-[220px] w-full items-center justify-center rounded-xl border border-dashed border-line p-6">
      <p className="max-w-sm text-center text-sm leading-relaxed text-ink-2">{texto}</p>
    </div>
  );
  if (!activa || (!datos && cargando)) return marco("Leyendo la cara…");
  if (!datos) return marco("No se pudo leer la cara.");
  if (!datos.por_participacion) return marco("Esta cara se vende entera: no tiene piezas que ubicar.");
  if (!cara || !E) return marco("Este mueble no tiene una cara para ubicar marcas.");

  const b = bordesUtiles(E);
  const fs = px(12);
  // Lo libre: el hueco más ancho, con lo que queda sin ubicar.
  const ubicado = piezas.reduce((a, p) => a + Math.min(p.dibujado, p.pb), 0);
  const libre = Math.max(0, 10000 - ubicado);
  const huecos = huecosLibres(cara, piezas.filter((p) => p.poligonos.length > 0).map((p) => ({ spaceId: p.spaceId, poligonos: p.poligonos })));
  const ancho = huecos.reduce((m, h) => (h[1] - h[0] > m[1] - m[0] ? h : m), [0, 0] as [number, number]);
  const mostrarLibre = libre > 0 && (ancho[1] - ancho[0]) * W >= px(90) && !arrastre && !vista;

  /** Una pieza: su relleno (sólo lo que se vende), su contorno y su rótulo. */
  const dibujoDePieza = (p: Pieza, P: readonly Poligono[], o: { fantasma?: boolean; rojo?: boolean; rotulo?: string | null } = {}) => {
    const tono = o.rojo ? C.rojo : p.tono;
    const textura = p.estampa?.textura ?? "lleno";
    const pat = o.rojo ? `${uid}-rojo` : textura !== "lleno" ? `${uid}-t${p.spaceId}` : null;
    // El cartel del fantasma va arriba de la pieza (no encima del nombre de la
    // que está abajo), con un halo del color de la cara para que se lea.
    const arriba = o.fantasma && P[0] ? Math.max(...P[0].map((x) => x[1])) : null;
    const centro = P[0] ? (arriba !== null ? [puntoInterior(P[0], W, H)[0], arriba - (fs * 1.6) / H] as const : puntoInterior(P[0], W, H)) : null;
    const rotulo = o.rotulo !== undefined ? o.rotulo : `${p.corto}`;
    const linea2 = o.rotulo !== undefined ? null : `${pct(p.pb)}${p.estado === "ubicada" ? " ✓" : ""}`;
    return (
      <g key={`${o.fantasma ? "f" : "p"}${p.spaceId}`} data-pieza={o.fantasma ? undefined : p.spaceId} data-estado={o.fantasma ? undefined : p.estado}
        style={{ cursor: puedeEditar && !aMano && p.forma !== "a_mano" ? "grab" : "pointer" }} opacity={o.fantasma ? 0.92 : 1}>
        <path d={relleno(P)} fill={tono} fillOpacity={o.rojo ? 0.18 : 0.22} />
        {pat && <path d={relleno(P)} fill={`url(#${pat})`} />}
        {P.map((poly, i) => (
          <path key={i} d={camino(poly, W, H)} fill="transparent" stroke={tono} strokeWidth={px(o.fantasma || elegida === p.spaceId ? 3 : 2.25)}
            strokeDasharray={o.fantasma || p.esReserva ? `${px(7)} ${px(5)}` : undefined} strokeLinejoin="round" />
        ))}
        {centro && rotulo && (
          <g pointerEvents="none">
            <text x={centro[0] * W} y={(1 - centro[1]) * H - (linea2 ? fs * 0.55 : 0)} textAnchor="middle" dominantBaseline="central"
              stroke={o.fantasma ? C.cara : undefined} strokeWidth={o.fantasma ? fs * 0.35 : undefined} paintOrder="stroke" strokeLinejoin="round"
              style={{ fill: o.rojo ? C.rojoTxt : C.tinta, fontSize: fs, fontWeight: 700 }}>{rotulo}</text>
            {linea2 && (
              <text x={centro[0] * W} y={(1 - centro[1]) * H + fs * 0.75} textAnchor="middle" dominantBaseline="central"
                style={{ fill: C.tinta2, fontSize: fs * 0.92, fontWeight: 600, fontFamily: "var(--f-mono)" }}>{linea2}</text>
            )}
          </g>
        )}
      </g>
    );
  };

  const fantasma = arrastre?.rect ? { spaceId: arrastre.spaceId, rect: arrastre.rect, pisa: arrastre.pisa } : vista;
  const piezaDelFantasma = fantasma ? porS.get(fantasma.spaceId) ?? null : null;
  const trazo = aMano ? edicion.trazo : null;
  const manijas = piezaElegida?.rect && puedeEditar && !aMano && piezaElegida.forma !== "a_mano" && !vista && !arrastre ? piezaElegida.rect : null;

  return (
    <div data-lienzo-de-zonas className="w-full">
      <svg
        ref={(el) => { svgRef.current = el; svgDeLaCara = el; }}
        role="application" tabIndex={0}
        aria-label={`La cara ${activa.cara} de ${activa.codigo} de frente: arrastrá cada marca a su lugar`}
        viewBox={`${-margen} ${-margen} ${W + 2 * margen} ${H + 2 * margen}`}
        className="block h-auto w-full touch-none select-none outline-none"
        style={{ maxHeight: "min(62vh, 560px)", cursor: aMano ? "crosshair" : undefined }}
        onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alCancelar}
        onPointerLeave={() => { if (!gesto.current) setCursor(null); }}
      >
        <defs>
          <pattern id={`${uid}-rayas`} width={px(7)} height={px(7)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={px(7)} stroke={C.raya} strokeWidth={px(2)} />
          </pattern>
          <pattern id={`${uid}-rojo`} width={px(7)} height={px(7)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={px(7)} stroke={C.rojo} strokeWidth={px(2.5)} />
          </pattern>
          {piezas.filter((p) => p.estampa && p.estampa.textura !== "lleno").map((p) => (
            <pattern key={p.spaceId} id={`${uid}-t${p.spaceId}`} width={px(8)} height={px(8)} patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${p.estampa!.textura === "rayado45" ? 45 : 135})`}>
              <line x1="0" y1="0" x2="0" y2={px(8)} stroke={p.tono} strokeWidth={px(2)} strokeOpacity={0.55} />
            </pattern>
          ))}
        </defs>

        {/* La cara entera: lo que no se vende, rayado. */}
        <rect x={0} y={0} width={W} height={H} rx={px(6)} fill={C.cara} />
        <rect x={0} y={0} width={W} height={H} rx={px(6)} fill={`url(#${uid}-rayas)`} stroke={C.borde} strokeWidth={px(2)} />
        {/* Lo que se vende, en verde: lo libre. */}
        <path d={vendible} fill={C.libre} />
        {E.map((x, i) => (
          <rect key={i} x={x.u0 * W} y={(1 - x.v1) * H} width={(x.u1 - x.u0) * W} height={(x.v1 - x.v0) * H} fill="transparent">
            <title>{`${NOMBRES_DE_EXCLUSION[x.por] ?? x.por}: no se vende`}</title>
          </rect>
        ))}
        {/* Los estantes. */}
        {(cara.estantes ?? []).filter((v) => v > b.v0 + 0.005 && v < b.v1 - 0.005).map((v, i) => (
          <line key={i} x1={b.u0 * W} x2={b.u1 * W} y1={(1 - v) * H} y2={(1 - v) * H} stroke={C.estante} strokeWidth={px(2)} pointerEvents="none" />
        ))}

        {/* «Cómo estaba» (historial), en gris. */}
        {comoEstaba && comoEstaba.zonas.map((z) => (
          <path key={`c${z.id}`} d={camino(z.vertices, W, H)} fill={C.gris} fillOpacity={0.14} stroke={C.gris}
            strokeWidth={px(2)} strokeDasharray={`${px(4)} ${px(3)}`} pointerEvents="none" />
        ))}
        {/* Marcas que ya no rigen: punteado gris. */}
        {historia.map((z) => (
          <path key={`h${z.id}`} d={camino(z.vertices, W, H)} fill="none" stroke={C.gris} strokeWidth={px(1.5)}
            strokeDasharray={`${px(3)} ${px(4)}`} pointerEvents="none" />
        ))}

        {/* Las piezas ubicadas (la que se mueve, en su lugar nuevo como fantasma). */}
        {piezas.filter((p) => p.poligonos.length > 0 && !(fantasma && fantasma.spaceId === p.spaceId && !arrastre)).map((p) => dibujoDePieza(p, p.poligonos))}

        {/* Lo libre, dicho. */}
        {mostrarLibre && (
          <text x={((ancho[0] + ancho[1]) / 2) * W} y={(1 - (b.v0 + b.v1) / 2) * H} textAnchor="middle" dominantBaseline="central"
            style={{ fill: C.libreTxt, fontSize: fs * 1.05, fontWeight: 600 }} pointerEvents="none">
            Libre {pct(libre)}
          </text>
        )}

        {/* El choque de recién: en rojo, donde se soltó. */}
        {choque && porS.get(choque.spaceId) && !fantasma &&
          dibujoDePieza(porS.get(choque.spaceId)!, [poligonoDeRect(choque.rect)], { rojo: true, rotulo: null })}

        {/* La pieza que se arrastra: dónde quedaría. */}
        {fantasma?.rect && piezaDelFantasma &&
          dibujoDePieza(piezaDelFantasma, [poligonoDeRect(fantasma.rect)], {
            fantasma: true, rojo: fantasma.pisa !== null,
            rotulo: fantasma.pisa !== null ? `Ahí ya está ${porS.get(fantasma.pisa)?.corto ?? "otra marca"}` : "Soltá acá",
          })}

        {/* Las manijas de la elegida: estirarla conserva el %. */}
        {manijas && ([
          ["e", manijas.u1, (manijas.v0 + manijas.v1) / 2, "ew-resize"], ["o", manijas.u0, (manijas.v0 + manijas.v1) / 2, "ew-resize"],
          ["n", (manijas.u0 + manijas.u1) / 2, manijas.v1, "ns-resize"], ["s", (manijas.u0 + manijas.u1) / 2, manijas.v0, "ns-resize"],
        ] as const).map(([m, u, v, cur]) => (
          <rect key={m} data-manija={m} x={u * W - px(7)} y={(1 - v) * H - px(7)} width={px(14)} height={px(14)} rx={px(3)}
            fill={C.cara} stroke={piezaElegida!.tono} strokeWidth={px(2.5)} style={{ cursor: cur }}>
            <title>Estirala: el % no cambia</title>
          </rect>
        ))}

        {/* «A mano»: el trazo, sus puntos y el círculo grande del primero. */}
        {trazo && trazo.length > 0 && piezaElegida && (
          <g pointerEvents="none">
            <polyline points={trazo.map(([u, v]) => `${u * W},${(1 - v) * H}`).join(" ")} fill="none" stroke={piezaElegida.tono}
              strokeWidth={px(2.5)} strokeDasharray={`${px(7)} ${px(5)}`} strokeLinejoin="round" />
            {cursor && (
              <line x1={trazo[trazo.length - 1][0] * W} y1={(1 - trazo[trazo.length - 1][1]) * H} x2={cursor[0] * W} y2={(1 - cursor[1]) * H}
                stroke={piezaElegida.tono} strokeWidth={px(1.5)} strokeDasharray={`${px(3)} ${px(4)}`} />
            )}
            {trazo.length >= 3 && (
              <circle data-primer-punto cx={trazo[0][0] * W} cy={(1 - trazo[0][1]) * H} r={px(12)} fill="none" stroke={piezaElegida.tono} strokeWidth={px(2)} />
            )}
            {trazo.map(([u, v], i) => (
              <circle key={i} cx={u * W} cy={(1 - v) * H} r={px(5)} fill={C.cara} stroke={piezaElegida.tono} strokeWidth={px(2.5)} />
            ))}
          </g>
        )}
        {aMano && cursor && (
          <circle cx={cursor[0] * W} cy={(1 - cursor[1]) * H} r={px(9)} fill="none" stroke={piezaElegida!.tono} strokeWidth={px(1.5)} opacity={0.6} pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
