import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePlanograma } from "../../store/planogramaStore";
import { TOQUE_PX, esClic, puntoInterior } from "../../utils/edicionDeZonas";
import { pct } from "../../utils/participaciones";
import {
  bordesUtiles, encajar, estirar, huecosLibres, imantarConGuias, lineasDeLaCara, lineasDeOcupados, poligonoDeRect, primeraQuePisa,
  rotuloDeLoQueHay, ubicarSinArrastrar, type CaraDePiezas as Cara, type GuiasDelIman, type Rect,
} from "../../utils/piezas";
import { ocupadosDelPlano, type PiezaDelPlano } from "../../utils/planograma";
import { trapecios, type Poligono, type Punto } from "../../utils/zonasGeometria";

/**
 * La cara de frente de un planograma, con sus piezas (fase 2 de la
 * distribución, 2026-10-24). El mismo dibujo y los mismos gestos que la cara de
 * «Distribuir esta cara» (`components/Distribucion/CaraDePiezas.tsx`), con las
 * piezas de un planograma: los destinos (se arrastran, se estiran, se dibujan a
 * mano) y lo vendido (bloqueado, en gris, con candado: no se agarra).
 *
 *   · Un SVG en METROS: lo que no se vende va rayado, lo libre en verde y los
 *     estantes como líneas.
 *   · Soltar (`encajar`) pega la pieza a los bordes, a los estantes y al costado
 *     de las otras, con su % exacto; si cae encima de otra, se ve en rojo y NO
 *     se ubica.
 *   · «A mano»: cada toque es una esquina pegada al estante o borde más
 *     cercano; el primer punto es un círculo grande y tocarlo (o Enter) cierra.
 *
 * Edita SÓLO por el store del planograma (`usePlanograma`): nada escribe el
 * plano.
 */

const C = {
  cara: "rgb(var(--surface-rgb))",
  borde: "rgb(var(--ink-1-rgb))",
  raya: "rgb(var(--line-strong-rgb))",
  estante: "rgb(var(--line-strong-rgb))",
  libre: "rgb(var(--libre-suave-rgb))",
  libreTxt: "rgb(var(--libre-txt-rgb))",
  tinta: "rgb(var(--ink-1-rgb))",
  tinta2: "rgb(var(--ink-2-rgb))",
  rojo: "rgb(var(--ocupado-rgb))",
  rojoTxt: "rgb(var(--ocupado-txt-rgb))",
};

const camino = (pts: readonly Punto[], W: number, H: number) =>
  pts.map(([u, v], i) => `${i === 0 ? "M" : "L"}${u * W} ${(1 - v) * H}`).join(" ") + " Z";

/** El SVG de la cara montado (lo usa el arrastre que empieza en la lista). */
let svgDelPlano: SVGSVGElement | null = null;

/** De un punto de la pantalla a u,v de la cara; null si cae afuera. */
export function uvEnElPlano(x: number, y: number, ancho: number, alto: number): Punto | null {
  const svg = svgDelPlano;
  const m = svg?.getScreenCTM();
  if (!svg || !m) return null;
  const r = svg.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return [p.x / ancho, 1 - p.y / alto];
}

function escalaDelPlano(): number {
  const a = svgDelPlano?.getScreenCTM()?.a;
  return a && Number.isFinite(a) && a > 0 ? a : 200;
}

/** Dónde caería una pieza soltada en (u, v): el rectángulo exacto y a quién pisaría. */
export function dondeCaeEnElPlano(cara: Cara, p: PiezaDelPlano, piezas: readonly PiezaDelPlano[], u: number, v: number): { rect: Rect | null; pisa: number | null } {
  if (p.forma === "a_mano" || p.bloqueada) return { rect: null, pisa: null };
  const ocupados = ocupadosDelPlano(p.id, piezas);
  const radio = 14 / (escalaDelPlano() * cara.ancho);
  const ancho = p.forma === "estantes" && p.rect && p.estado !== "sin_ubicar" ? p.rect.u1 - p.rect.u0 : null;
  const rect = encajar(cara, p.pb, p.forma, u, v, ocupados, { radio, ancho });
  return { rect, pisa: rect ? primeraQuePisa([poligonoDeRect(rect)], ocupados, cara) : null };
}

/** El rótulo de una pieza: justa, su % con ✓; si no, lo que hay, en rojo. */
export function rotuloDelPlano(p: Pick<PiezaDelPlano, "estado" | "pb" | "dibujado" | "bloqueada">, otra: string | null): { texto: string; rojo: boolean } {
  if (p.bloqueada) return { texto: `${pct(p.pb)} · vendido`, rojo: false };
  if (p.estado === "ubicada") return { texto: `${pct(p.pb)} ✓`, rojo: false };
  if (p.estado === "choca") return { texto: `${pct(p.dibujado)} · pisa a ${otra ?? "otra pieza"}`, rojo: true };
  if (p.estado === "rehacer") return { texto: `${pct(p.dibujado)} · hay que rehacerla`, rojo: true };
  if (p.estado === "sin_ubicar") return { texto: pct(p.pb), rojo: false };
  return { texto: rotuloDeLoQueHay(p.pb, p.dibujado).texto, rojo: true };
}

/** «de 0,25 a 0,79 m desde la izquierda». */
export function dondeQuedoEnElPlano(r: Rect, ancho: number): string {
  const m = (x: number) => (Math.round(x * ancho * 100) / 100).toFixed(2).replace(".", ",");
  return `de ${m(r.u0)} a ${m(r.u1)} m desde la izquierda`;
}

type Gesto =
  | { tipo: "mover"; id: number; x: number; y: number; movido: boolean }
  | { tipo: "estirar"; id: number; lado: "e" | "o" | "n" | "s"; x: number; y: number; movido: boolean }
  | { tipo: "tocar"; x: number; y: number };

interface Vista { id: number; rect: Rect | null; pisa: number | null }

export default function CaraDelPlanograma({ cara, piezas, puedeEditar, libre, fantasmaDeLista, onSoltar, onCerrarAMano, titulo }: {
  cara: Cara;
  piezas: readonly PiezaDelPlano[];
  puedeEditar: boolean;
  /** Lo libre para planificar (se dice en el hueco más ancho). */
  libre: number;
  /** La pieza que viene arrastrada desde la lista: dónde caería. */
  fantasmaDeLista: { id: number; rect: Rect | null; pisa: number | null } | null;
  onSoltar: (id: number, rect: Rect | null, pisa: number | null) => void;
  /** Cerrar el trazo «A mano» (tocando el primer punto o con Enter). */
  onCerrarAMano: () => void;
  titulo: string;
}) {
  const elegida = usePlanograma((s) => s.elegida);
  const trazoDelStore = usePlanograma((s) => s.trazo);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const W = cara.ancho, H = cara.alto;
  const E = cara.exclusiones;
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
  }, [W, H]);
  const px = (n: number) => n / escala;

  const [cursor, setCursor] = useState<Punto | null>(null);
  /** Por dónde se pegó el punto que se apunta (las guías punteadas). */
  const [guias, setGuias] = useState<GuiasDelIman | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [choque, setChoque] = useState<Vista | null>(null);
  const [enfocada, setEnfocada] = useState<number | null>(null);
  const gesto = useRef<Gesto | null>(null);
  const st = usePlanograma.getState;

  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const piezaElegida = elegida !== null ? porId.get(elegida) ?? null : null;
  const aMano = !!piezaElegida && piezaElegida.forma === "a_mano" && trazoDelStore !== null && puedeEditar;
  const trazo = aMano ? trazoDelStore : null;

  const lineasAMano = useMemo(() => {
    if (!piezaElegida) return null;
    const l = lineasDeLaCara(cara);
    const o = lineasDeOcupados(ocupadosDelPlano(piezaElegida.id, piezas));
    return { us: [...l.us, ...o.us], vs: [...l.vs, ...o.vs] };
  }, [cara, piezaElegida, piezas]);
  const imantado = (p: Punto): Punto => {
    if (!lineasAMano) return p;
    const r = 10 / escala;
    const i = imantarConGuias(p, lineasAMano, { u: r / W, v: r / H }, usePlanograma.getState().trazo ?? []);
    setGuias(i.guias);
    return i.punto;
  };
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

  // Un choque de recién se borra solo.
  useEffect(() => {
    if (!choque) return;
    const t = setTimeout(() => setChoque(null), 2600);
    return () => clearTimeout(t);
  }, [choque]);
  useEffect(() => { if (!aMano) setCursor(null); }, [aMano]);

  const soltar = (id: number, rect: Rect | null, pisa: number | null) => {
    if (rect && pisa !== null) setChoque({ id, rect, pisa });
    else setChoque(null);
    onSoltar(id, rect, pisa);
  };

  /* ── El puntero ─────────────────────────────────────────────────────────── */

  const alBajar = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = e.target as Element;
    const manija = el.closest?.("[data-manija]");
    const pieza = el.closest?.("[data-pieza-del-plano]");
    const base = { x: e.clientX, y: e.clientY };
    if (puedeEditar && !aMano && manija && piezaElegida?.rect && !piezaElegida.bloqueada) {
      gesto.current = { tipo: "estirar", id: piezaElegida.id, lado: manija.getAttribute("data-manija") as "e" | "o" | "n" | "s", ...base, movido: false };
      return;
    }
    if (!aMano && pieza) {
      gesto.current = { tipo: "mover", id: Number(pieza.getAttribute("data-pieza-del-plano")), ...base, movido: false };
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
    if (!p) return;
    if (g.tipo === "tocar") { if (aMano) setCursor(imantado(p)); return; }
    if (!g.movido && esClic({ x: g.x, y: g.y }, { x: e.clientX, y: e.clientY })) return;
    g.movido = true;
    const pz = porId.get(g.id);
    if (!pz || !puedeEditar || pz.bloqueada) return;
    if (g.tipo === "mover") {
      if (pz.forma === "a_mano") return;
      setVista({ id: pz.id, ...dondeCaeEnElPlano(cara, pz, piezas, p[0], p[1]) });
      return;
    }
    if (!pz.rect) return;
    const valor = g.lado === "e" || g.lado === "o" ? p[0] : p[1];
    const rect = estirar(cara, pz.pb, pz.rect, g.lado, valor, 10 / (escala * (g.lado === "e" || g.lado === "o" ? W : H)));
    const pisa = rect ? primeraQuePisa([poligonoDeRect(rect)], ocupadosDelPlano(pz.id, piezas), cara) : null;
    if (rect) setVista({ id: pz.id, rect, pisa });
  };

  const alSoltar = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    gesto.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    const p = aUV(e.clientX, e.clientY);
    const v = vista;
    setVista(null);
    if ((g.tipo === "mover" || g.tipo === "estirar") && g.movido) {
      if (v && v.id === g.id) soltar(g.id, v.rect, v.pisa);
      return;
    }
    if (g.tipo === "mover") {
      st().elegir(g.id);
      return;
    }
    if (!p || !esClic({ x: g.x, y: g.y }, { x: e.clientX, y: e.clientY })) return;
    if (aMano && puedeEditar && piezaElegida) {
      const t = st().trazo ?? [];
      const primero = t[0];
      const pp = primero ? aPantalla(primero) : null;
      if (t.length >= 3 && pp && Math.hypot(pp.x - e.clientX, pp.y - e.clientY) <= TOQUE_PX * 2) {
        onCerrarAMano();
      } else if (t.length < 24) {
        st().ponerTrazo([...t, imantado(p)]);
      }
      return;
    }
    // Tocar lo libre con una pieza sin ubicar elegida: ahí va.
    if (puedeEditar && piezaElegida && !piezaElegida.bloqueada && piezaElegida.estado === "sin_ubicar" && piezaElegida.forma !== "a_mano") {
      const r = dondeCaeEnElPlano(cara, piezaElegida, piezas, p[0], p[1]);
      soltar(piezaElegida.id, r.rect, r.pisa);
      return;
    }
    st().elegir(null);
  };

  const alCancelar = () => { gesto.current = null; setVista(null); };

  /* ── Lo que se dibuja ───────────────────────────────────────────────────── */

  const vendible = useMemo(() => trapecios([[[0, 0], [1, 0], [1, 1], [0, 1]]], E).map((t) => camino(t, W, H)).join(" "), [E, W, H]);
  const relleno = (P: readonly Poligono[]) => trapecios([...P], E).map((t) => camino(t, W, H)).join(" ");
  const b = bordesUtiles(E);
  const fs = px(12);
  const huecos = huecosLibres(cara, piezas.filter((p) => p.poligonos.length > 0).map((p) => ({ spaceId: p.id, poligonos: p.poligonos })));
  const ancho = huecos.reduce((m, h) => (h[1] - h[0] > m[1] - m[0] ? h : m), [0, 0] as [number, number]);
  const mostrarLibre = libre > 0 && (ancho[1] - ancho[0]) * W >= px(90) && !vista && !fantasmaDeLista;

  const moverConTeclado = (pz: PiezaDelPlano, como: "izquierda" | "derecha") => {
    if (!puedeEditar || pz.bloqueada) return;
    if (pz.forma === "a_mano") { st().decir(`${pz.corto} está hecha a mano: se rehace, no se mueve.`); return; }
    const r = ubicarSinArrastrar(cara, pz.pb, pz.forma, ocupadosDelPlano(pz.id, piezas), pz.estado === "sin_ubicar" ? null : pz.rect, como);
    if (!r) { st().decir(`${pz.corto}: no hay más lugar libre a la ${como}.`); return; }
    onSoltar(pz.id, r, null);
    st().decir(`${pz.corto} quedó ${dondeQuedoEnElPlano(r, W)}: ${pct(pz.pb)} justo.`);
  };

  const dibujo = (p: PiezaDelPlano, P: readonly Poligono[], o: { fantasma?: boolean; rojo?: boolean; rotulo?: string | null; inerte?: boolean } = {}) => {
    const tono = o.rojo ? C.rojo : p.tono;
    const real = !o.fantasma && !o.inerte;
    const arriba = o.fantasma && P[0] ? Math.max(...P[0].map((x) => x[1])) : null;
    const centro = P[0] ? (arriba !== null ? [puntoInterior(P[0], W, H)[0], arriba - (fs * 1.6) / H] as const : puntoInterior(P[0], W, H)) : null;
    const rotulo = o.rotulo !== undefined ? o.rotulo : p.corto;
    const otra = p.choca !== null ? porId.get(p.choca)?.corto ?? null : null;
    const r2 = o.rotulo !== undefined ? null : rotuloDelPlano(p, otra);
    const caja = P[0] ? P[0].reduce((m, [u]) => ({ u0: Math.min(m.u0, u), u1: Math.max(m.u1, u) }), { u0: 1, u1: 0 }) : null;
    const anchoP = caja ? (caja.u1 - caja.u0) * W : W;
    // En una pieza angosta (un teléfono) el nombre se corta con «…»: no se mete
    // en la de al lado. Entero está en la lista y en el título.
    const cabe = Math.max(2, Math.floor((anchoP * 0.92) / (fs * 0.62)));
    const rotuloQueEntra = rotulo && !o.fantasma && rotulo.length > cabe ? `${rotulo.slice(0, cabe - 1).trimEnd()}…` : rotulo;
    const r2Lineas = !r2 ? [] : r2.texto.includes(" · ") && r2.texto.length * fs * 0.92 * 0.62 > anchoP * 0.92 ? r2.texto.split(" · ") : [r2.texto];
    const lineas = 1 + r2Lineas.length;
    const y0 = centro ? (1 - centro[1]) * H - ((lineas - 1) * fs * 1.25) / 2 : 0;
    const halo = { stroke: C.cara, strokeWidth: fs * 0.35, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
    const nombre = real ? `${p.corto}, ${pct(p.pb)}, ${p.bloqueada ? "vendida" : p.estado === "ubicada" ? "ubicada" : p.estado === "sin_ubicar" ? "sin ubicar" : rotuloDelPlano(p, otra).texto}` : undefined;
    const agarrable = real && !p.bloqueada;
    return (
      <g key={`${o.fantasma ? "f" : o.inerte ? "x" : "p"}${p.id}`} data-pieza-del-plano={agarrable ? p.id : undefined}
        data-bloqueada={real && p.bloqueada ? "si" : undefined} data-estado={real ? p.estado : undefined}
        role={real ? "button" : undefined} tabIndex={agarrable ? 0 : undefined} aria-label={nombre}
        aria-pressed={agarrable ? elegida === p.id : undefined}
        onFocus={agarrable ? (e) => { if (e.currentTarget.matches?.(":focus-visible") ?? true) setEnfocada(p.id); } : undefined}
        onBlur={agarrable ? () => setEnfocada((x) => (x === p.id ? null : x)) : undefined}
        onKeyDown={agarrable ? (e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault(); e.stopPropagation();
            moverConTeclado(p, e.key === "ArrowLeft" ? "izquierda" : "derecha");
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); e.stopPropagation();
            st().elegir(p.id);
          }
        } : undefined}
        pointerEvents={o.inerte || o.fantasma || p.bloqueada ? "none" : undefined}
        style={{ cursor: agarrable ? (puedeEditar && !aMano && p.forma !== "a_mano" ? "grab" : "pointer") : undefined, outline: "none" }}
        opacity={o.fantasma ? 0.92 : 1}>
        <title>{nombre ?? rotulo ?? ""}</title>
        <path d={relleno(P)} fill={tono} style={{ fillOpacity: o.rojo ? 0.18 : p.bloqueada ? 0.16 : "var(--pieza-alfa)" }} />
        {P.map((poly, i) => (
          <path key={i} d={camino(poly, W, H)} fill="transparent" stroke={tono} strokeWidth={px(o.fantasma || elegida === p.id ? 3 : 2.25)}
            strokeDasharray={o.fantasma ? `${px(7)} ${px(5)}` : undefined} strokeLinejoin="round" />
        ))}
        {real && enfocada === p.id && P.map((poly, i) => (
          <path key={`f${i}`} d={camino(poly, W, H)} fill="none" stroke={C.tinta} strokeWidth={px(2)} strokeDasharray={`${px(3)} ${px(3)}`} />
        ))}
        {centro && rotulo && (
          <g pointerEvents="none">
            <text x={centro[0] * W} y={y0} textAnchor="middle" dominantBaseline="central" {...(o.fantasma ? halo : {})}
              style={{ fill: o.rojo ? C.rojoTxt : C.tinta, fontSize: fs, fontWeight: 700 }}>
              {rotuloQueEntra}
            </text>
            {r2 && r2Lineas.map((t, i) => (
              <text key={i} x={centro[0] * W} y={y0 + fs * 1.25 * (i + 1)} textAnchor="middle" dominantBaseline="central"
                style={{ fill: r2.rojo ? C.rojoTxt : C.tinta2, fontSize: fs * 0.92, fontWeight: 600, fontFamily: "var(--f-mono)" }} data-rotulo-pct>{t}</text>
            ))}
          </g>
        )}
      </g>
    );
  };

  const fantasma = fantasmaDeLista?.rect ? fantasmaDeLista : vista;
  const piezaDelFantasma = fantasma ? porId.get(fantasma.id) ?? null : null;
  const manijas = piezaElegida?.rect && puedeEditar && !piezaElegida.bloqueada && !aMano && piezaElegida.forma !== "a_mano" && !vista && !fantasmaDeLista ? piezaElegida.rect : null;

  return (
    <div className="w-full" data-cara-del-planograma>
      <svg
        ref={(el) => { svgRef.current = el; svgDelPlano = el; }}
        role="application" tabIndex={0} aria-label={titulo}
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
        </defs>
        <rect x={0} y={0} width={W} height={H} rx={px(6)} fill={C.cara} />
        <rect x={0} y={0} width={W} height={H} rx={px(6)} fill={`url(#${uid}-rayas)`} stroke={C.borde} strokeWidth={px(2)} />
        <path d={vendible} fill={C.libre} />
        {(cara.estantes ?? []).filter((v) => v > b.v0 + 0.005 && v < b.v1 - 0.005).map((v, i) => (
          <line key={i} x1={b.u0 * W} x2={b.u1 * W} y1={(1 - v) * H} y2={(1 - v) * H} stroke={C.estante} strokeWidth={px(2)} pointerEvents="none" />
        ))}

        {piezas.filter((p) => p.poligonos.length > 0 && !(vista && vista.id === p.id)).map((p) => dibujo(p, p.poligonos))}

        {mostrarLibre && (
          <text x={((ancho[0] + ancho[1]) / 2) * W} y={(1 - (b.v0 + 0.7 * (b.v1 - b.v0))) * H} textAnchor="middle" dominantBaseline="central"
            style={{ fill: C.libreTxt, fontSize: fs * 1.05, fontWeight: 600 }} pointerEvents="none">
            Libre {pct(libre)}
          </text>
        )}

        {choque?.rect && porId.get(choque.id) && !fantasma &&
          dibujo(porId.get(choque.id)!, [poligonoDeRect(choque.rect)], { rojo: true, rotulo: null, inerte: true })}

        {fantasma?.rect && piezaDelFantasma &&
          dibujo(piezaDelFantasma, [poligonoDeRect(fantasma.rect)], {
            fantasma: true, rojo: fantasma.pisa !== null,
            rotulo: fantasma.pisa !== null ? `Ahí ya está ${porId.get(fantasma.pisa)?.corto ?? "otra pieza"}` : "Soltá acá",
          })}

        {manijas && ([
          ["e", manijas.u1, (manijas.v0 + manijas.v1) / 2, "ew-resize"], ["o", manijas.u0, (manijas.v0 + manijas.v1) / 2, "ew-resize"],
          ["n", (manijas.u0 + manijas.u1) / 2, manijas.v1, "ns-resize"], ["s", (manijas.u0 + manijas.u1) / 2, manijas.v0, "ns-resize"],
        ] as const).map(([m, u, v, cur]) => (
          <rect key={m} data-manija={m} x={u * W - px(7)} y={(1 - v) * H - px(7)} width={px(14)} height={px(14)} rx={px(3)}
            fill={C.cara} stroke={piezaElegida!.tono} strokeWidth={px(2.5)} style={{ cursor: cur }}>
            <title>Estirala: el % no cambia</title>
          </rect>
        ))}

        {/* Las guías del imán «A mano»: la línea por la que se pegó el punto
            (recto con el anterior, alineado con otro punto, con un estante o
            con el lado de otra forma). Se ven mientras se apunta. */}
        {aMano && cursor && guias && (guias.u !== null || guias.v !== null) && (
          <g pointerEvents="none" data-guias-del-iman style={{ stroke: "var(--signal)" }}>
            {guias.u !== null && (
              <line x1={guias.u * W} y1={0} x2={guias.u * W} y2={H} strokeWidth={px(1.5)} strokeDasharray={`${px(6)} ${px(4)}`} />
            )}
            {guias.v !== null && (
              <line x1={0} y1={(1 - guias.v) * H} x2={W} y2={(1 - guias.v) * H} strokeWidth={px(1.5)} strokeDasharray={`${px(6)} ${px(4)}`} />
            )}
          </g>
        )}
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
        {aMano && cursor && piezaElegida && (
          <circle cx={cursor[0] * W} cy={(1 - cursor[1]) * H} r={px(9)} fill="none" stroke={piezaElegida.tono} strokeWidth={px(1.5)} opacity={0.6} pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
