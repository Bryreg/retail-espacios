import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { CENTRO, SEDES, type Pieza } from "./datos";
import { PALETA_VACIA, bbox, caras, leerPaleta, proy, quieto, type Paleta } from "./motor";

/**
 * Las dos miniaturas del plano que viven fuera de la sala pegada:
 *
 *  · `MiniMorfo` — la de la tarjeta 01, que morfa 2D ↔ 3D al pasar el mouse o
 *    al recibir el foco. Es la misma proyección con parámetro del plano
 *    grande, dibujada en chico: «Ver en 3D» no es otra escena.
 *  · `SalaPasos` — el momento de «Cómo se arranca»: la sala se vacía, se
 *    redibuja en gris pieza por pieza y se pinta con los 16 alquilables. En
 *    escritorio la conduce el scroll sobre una pantalla pegada; en pantallas
 *    chicas y con movimiento reducido se juega sola al entrar en cuadro, para
 *    que la prueba no dependa de un gesto.
 *
 * Las dos escriben en el SVG de forma imperativa (refs), nunca por estado:
 * son animaciones cuadro a cuadro y un `setState` por cuadro sería un render
 * del árbol entero sesenta veces por segundo.
 */

interface NodoMini {
  p: Pieza;
  g: SVGGElement | null;
}

/** Lee la paleta del tema vigente y avisa cuando la landing lo cambia. */
function usarPaleta(refNodo: React.RefObject<Element>, alCambiar: () => void) {
  const paleta = useRef<Paleta>(PALETA_VACIA);
  useEffect(() => {
    const raiz = refNodo.current?.closest(".lp");
    if (!raiz) return;
    const leer = () => {
      paleta.current = leerPaleta(raiz);
      alCambiar();
    };
    leer();
    const mo = new MutationObserver(leer);
    mo.observe(raiz, { attributes: true, attributeFilter: ["data-lp-tema"] });
    return () => mo.disconnect();
  }, [refNodo, alCambiar]);
  return paleta;
}

/** Coloca y pinta una lista de piezas dentro de una caja de `w × h`. */
function encuadrar(g: SVGGElement, lista: readonly Pieza[], w: number, h: number, v: number) {
  const bb = bbox(lista, v);
  const s = Math.min(w / bb.w, h / bb.h) * 0.92;
  g.setAttribute("transform",
    `translate(${w / 2 - s * (bb.x + bb.w / 2)},${h / 2 - s * (bb.y + bb.h / 2)}) scale(${s})`);
}

function repintar(nodos: NodoMini[], v: number) {
  nodos.forEach((n) => {
    if (!n.g) return;
    const f = caras(n.p, v);
    n.g.children[0].setAttribute("points", f.right);
    n.g.children[1].setAttribute("points", f.left);
    n.g.children[2].setAttribute("points", f.top);
  });
}

function teñir(n: NodoMini, paleta: Paleta, conColor: boolean) {
  if (!n.g) return;
  const c = conColor ? paleta[n.p.e] : paleta.resto;
  n.g.children[0].setAttribute("fill", c.right);
  n.g.children[1].setAttribute("fill", c.left);
  n.g.children[2].setAttribute("fill", c.top);
}

const ANCHO_MINI = 320;
const ALTO_MINI = 128;

/* ── la miniatura que morfa 2D ↔ 3D ───────────────────────────────────────── */

export function MiniMorfo() {
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const modoRef = useRef<HTMLSpanElement | null>(null);
  const nodos = useRef<NodoMini[]>(CENTRO.map((p) => ({ p, g: null })));
  const v = useRef(0);
  const anim = useRef<number | null>(null);

  const dibujar = useCallback(() => {
    if (gRef.current) encuadrar(gRef.current, CENTRO, ANCHO_MINI, ALTO_MINI, v.current);
    repintar(nodos.current, v.current);
  }, []);

  const paleta = usarPaleta(cajaRef, useCallback(() => {
    nodos.current.forEach((n) => teñir(n, paleta.current, true));
    // `paleta` es el ref que devuelve el hook: está definido cuando corre esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  useEffect(() => {
    dibujar();
    nodos.current.forEach((n) => teñir(n, paleta.current, true));
  }, [dibujar, paleta]);

  const morfar = useCallback((destino: number) => {
    const rotulo = modoRef.current;
    if (quieto()) {
      v.current = destino;
      dibujar();
      if (rotulo) rotulo.textContent = destino > 0.5 ? "3D" : "plano";
      return;
    }
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    const v0 = v.current;
    const t0 = performance.now();
    const paso = (t: number) => {
      const u = Math.min(1, (t - t0) / 520);
      const e = 1 - Math.pow(1 - u, 3);
      v.current = v0 + (destino - v0) * e;
      dibujar();
      if (u < 1) {
        anim.current = requestAnimationFrame(paso);
      } else {
        anim.current = null;
        if (rotulo) rotulo.textContent = destino > 0.5 ? "3D" : "plano";
      }
    };
    anim.current = requestAnimationFrame(paso);
  }, [dibujar]);

  /* El gesto es de la tarjeta entera, como en E: entrás a la tarjeta y la
     tienda se levanta. También con el foco, para quien va con el teclado. */
  useEffect(() => {
    const tarjeta = cajaRef.current?.closest(".card");
    if (!tarjeta) return;
    const entrar = () => morfar(1);
    const salir = () => morfar(0);
    tarjeta.addEventListener("mouseenter", entrar);
    tarjeta.addEventListener("mouseleave", salir);
    tarjeta.addEventListener("focusin", entrar);
    return () => {
      tarjeta.removeEventListener("mouseenter", entrar);
      tarjeta.removeEventListener("mouseleave", salir);
      tarjeta.removeEventListener("focusin", entrar);
      if (anim.current !== null) cancelAnimationFrame(anim.current);
    };
  }, [morfar]);

  return (
    <div className="mini" ref={cajaRef}>
      <div className="mini__bar">
        <span>Sede CENTRO</span>
        <span style={{ marginLeft: "auto" }} ref={modoRef}>plano</span>
      </div>
      <div className="mini__body" style={{ padding: 0 }}>
        <svg viewBox={`0 0 ${ANCHO_MINI} ${ALTO_MINI}`} style={{ display: "block", width: "100%", height: "auto" }} aria-hidden="true">
          <g ref={gRef}>
            {CENTRO.map((p, i) => (
              <g key={p.llave} ref={(el) => { nodos.current[i].g = el; }}>
                <polygon /><polygon /><polygon />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ── la sala que se vacía, se dibuja y se pinta ───────────────────────────── */

const ANCHO_SALA = 640;
const ALTO_SALA = 300;

const ROTULOS = [
  "Cuenta creada · sala vacía",
  "Dibujando la sala · todo en gris",
  "16 espacios alquilables, pintados",
];

export function SalaPasos({ children }: { children: ReactNode }) {
  const filmRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const pisoRef = useRef<SVGPolygonElement | null>(null);
  const rotuloRef = useRef<HTMLElement | null>(null);
  const nodos = useRef<NodoMini[]>(CENTRO.map((p) => ({ p, g: null })));
  const alquilables = useRef<NodoMini[]>([]);
  const fase = useRef("");
  const jugado = useRef(false);
  /** El último `(paso, avance)` pintado: al cambiar de tema se vuelve a poner. */
  const ultimo = useRef<[number, number]>([1, 0]);
  const reaplicar = useRef<() => void>(() => {});

  const paleta = usarPaleta(filmRef, useCallback(() => {
    if (pisoRef.current) {
      pisoRef.current.setAttribute("fill", paleta.current.piso);
      pisoRef.current.setAttribute("stroke", paleta.current.canto);
    }
    fase.current = "";
    reaplicar.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const poner = useCallback((f: number, u: number) => {
    const q = f + ":" + Math.round(u * 24);
    if (q === fase.current) return;
    fase.current = q;
    ultimo.current = [f, u];
    const todos = nodos.current;
    const alq = alquilables.current;
    if (f === 1) {
      todos.forEach((n) => { if (n.g) n.g.style.opacity = "0"; });
    } else if (f === 2) {
      todos.forEach((n, i) => {
        if (n.g) n.g.style.opacity = (i + 1) / todos.length <= u ? "1" : "0";
        teñir(n, paleta.current, false);
      });
    } else {
      todos.forEach((n) => {
        if (n.g) n.g.style.opacity = "1";
        if (!n.p.alq) teñir(n, paleta.current, false);
      });
      alq.forEach((n, i) => teñir(n, paleta.current, (i + 1) / alq.length <= u));
    }
    if (rotuloRef.current) rotuloRef.current.textContent = ROTULOS[f - 1];
    const pasos = filmRef.current?.querySelectorAll<HTMLElement>(".paso");
    pasos?.forEach((li, i) => li.setAttribute("data-on", i + 1 === f ? "true" : "false"));
  }, [paleta]);

  useEffect(() => {
    reaplicar.current = () => poner(ultimo.current[0], ultimo.current[1]);
  }, [poner]);

  const svgRef = useRef<SVGSVGElement | null>(null);

  /** Como en E: el viewBox se ajusta a la caja real y la sala llena el marco a cualquier ancho. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let w = 0;
    let h = 0;
    const ajustar = () => {
      const r = svg.getBoundingClientRect();
      const nw = Math.max(240, Math.round(r.width));
      const nh = Math.max(150, Math.round(r.height));
      if (Math.abs(nw - w) < 8 && Math.abs(nh - h) < 8) return;
      w = nw;
      h = nh;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      if (gRef.current) encuadrar(gRef.current, CENTRO, w, h, 0);
    };
    ajustar();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(ajustar);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    repintar(nodos.current, 0);
    alquilables.current = nodos.current.filter((n) => n.p.alq);
    if (pisoRef.current) {
      const s = SEDES.CENTRO;
      const x = s.dx - 0.8;
      const y = s.dy - 0.8;
      const q = (a: number, b: number) => {
        const t = proy(a, b, 0, 0);
        return t[0] + "," + t[1];
      };
      pisoRef.current.setAttribute("points",
        `${q(x, y)} ${q(x + s.w, y)} ${q(x + s.w, y + s.d)} ${q(x, y + s.d)}`);
    }
  }, []);

  /** La secuencia sola: sin pantalla pegada, la prueba no depende del scroll. */
  const secuencia = useCallback(() => {
    if (jugado.current) return;
    jugado.current = true;
    if (quieto()) { poner(3, 1); return; }
    poner(1, 0);
    const t0 = performance.now() + 450;
    const bucle = (ahora: number) => {
      const e = ahora - t0;
      if (e < 0) { requestAnimationFrame(bucle); return; }
      if (e < 1400) poner(2, e / 1400);
      else if (e < 2900) poner(3, (e - 1400) / 1500);
      else { poner(3, 1); return; }
      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  }, [poner]);

  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;
    const compacto = () => window.matchMedia("(max-width:999px)").matches;

    if (quieto()) {
      poner(3, 1);
      return;
    }
    if (compacto()) {
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { secuencia(); io.disconnect(); }
      }, { threshold: 0.15 });
      io.observe(film);
      return () => io.disconnect();
    }

    let pedido = false;
    const alScroll = () => {
      if (quieto()) { poner(3, 1); return; }
      if (compacto()) { poner(3, 1); return; }
      const r = film.getBoundingClientRect();
      const alto = Math.max(1, r.height - window.innerHeight);
      const p = Math.max(0, Math.min(1, -r.top / alto));
      if (p < 0.3) poner(1, 0);
      else if (p < 0.62) poner(2, (p - 0.3) / 0.32);
      else poner(3, Math.min(1, (p - 0.62) / 0.3));
    };
    const alPedir = () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => { pedido = false; alScroll(); });
    };
    alScroll();
    window.addEventListener("scroll", alPedir, { passive: true });
    window.addEventListener("resize", alPedir);
    return () => {
      window.removeEventListener("scroll", alPedir);
      window.removeEventListener("resize", alPedir);
    };
  }, [poner, secuencia]);

  return (
    <div className="pasos-film" ref={filmRef}>
      <div className="wrap pasos-sticky">
        <figure className="sala">
          <figcaption className="sala__bar">
            <span>Sede CENTRO</span>
            <b ref={rotuloRef}>Cuenta creada · sala vacía</b>
          </figcaption>
          <svg ref={svgRef} viewBox={`0 0 ${ANCHO_SALA} ${ALTO_SALA}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <g ref={gRef}>
              <polygon ref={pisoRef} fill={PALETA_VACIA.piso} stroke={PALETA_VACIA.canto} strokeWidth={0.06} />
              {CENTRO.map((p, i) => (
                <g key={p.llave} ref={(el) => { nodos.current[i].g = el; }}>
                  <polygon /><polygon /><polygon />
                </g>
              ))}
            </g>
          </svg>
        </figure>
        {children}
      </div>
    </div>
  );
}
