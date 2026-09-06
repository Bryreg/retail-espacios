import {
  Component, Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import {
  ALQUILABLES, CARA_A, CARA_B, ETIQUETA, PIEZAS, PIEZA_INICIAL, SEDES,
  pesos, type Estado, type Pieza, type Sede,
} from "./datos";
import { bbox, caras, leerPaleta, proy, quieto, PALETA_VACIA, type Paleta } from "./motor";

/**
 * La sala pegada de la dirección E: el plano vive en una sola pantalla
 * `sticky` y la cámara la guía el scroll mientras las tarjetas del guion pasan
 * al costado. El objeto que mirás no cambia nunca — cambia tu punto de vista.
 *
 * Portado del prototipo `E-fusion/index.html`, con tres reglas que allá están
 * escritas y acá también valen:
 *
 *  · **La cámara es estado derivado del scroll, no del render.** `cam` y `tgt`
 *    viven en `useRef` y cada cuadro escribe UN solo `transform` sobre el `<g>`
 *    de la escena. Meterla en `useState` serían sesenta renders del árbol por
 *    segundo.
 *  · **Nada de `setPointerCapture` en el contenedor del plano.** Capturar el
 *    puntero ahí le roba el clic a los botones y a la ficha que viven encima;
 *    el arrastre se sigue con eventos de ventana, que además aguanta que el
 *    dedo se salga. (Es una trampa real: se pierde en silencio.)
 *  · **Los rótulos tienen tamaño constante en pantalla:** el `<g>` publica
 *    `--lbl` y `--sede` en píxeles divididos por la escala vigente.
 *
 * La vista 3D de verdad (three.js) sigue entrando SOLO bajo demanda, en su
 * propio chunk: `React.lazy` + `import()` dinámico. El botón «Ver en 3D» de E
 * no la necesita —es un parámetro de la misma proyección—, así que el motor
 * pesado se baja recién si alguien pide recorrer la sala.
 */
const Vista3D = lazy(() => import("./Vista3D"));

/* ── el mapa de escenas: nueve encuadres, no veinticuatro ─────────────────── */

interface Escena {
  /** Encuadre por punto de la sala… */
  cx?: number;
  cy?: number;
  /** …o por mueble, que es lo que hace el acercamiento. */
  key?: string;
  z: number;
  fx?: string[];
  sep?: boolean;
  temporada?: boolean;
}

const ESC: Record<string, Escena> = {
  "hero": { cx: 16.5, cy: 11.5, z: 0.82 },
  "qh-intro": { cx: 15, cy: 10, z: 1.0 },
  "qh-1": { key: CARA_A, z: 1.7, fx: ["fxCaras"], sep: true },
  "qh-2": { key: "CENTRO/PUN-01", z: 1.95, fx: ["fxContrato"] },
  "qh-3": { cx: 15, cy: 10, z: 0.95, fx: ["fxTemporada"], temporada: true },
  "qh-4": { key: CARA_A, z: 1.85, fx: ["fxTarifa"] },
  "qh-5": { cx: 15, cy: 10, z: 1.18, fx: ["fxAvisos"] },
  "qh-6": { key: "CENTRO/CRS-01", z: 1.9, fx: ["fxMontaje"] },
  "qh-cierre": { cx: 29.4, cy: 10, z: 0.55 },
};

/** Cada capa de prueba cuelga del mueble del que habla la tarjeta. */
const ANCLAS: Record<string, { key: string; dx: number; dy: number }> = {
  fxCaras: { key: CARA_A, dx: 0, dy: -22 },
  fxContrato: { key: "CENTRO/PUN-01", dx: 0, dy: -20 },
  fxTarifa: { key: CARA_A, dx: 0, dy: -18 },
  fxMontaje: { key: "CENTRO/CRS-01", dx: 140, dy: -24 },
};

const TEMPORADAS = [
  "Escolar", "Semana Santa", "Día de la Madre", "Día del Padre", "Vacaciones",
  "Amor y Amistad", "Halloween", "Black Friday", "Navidad",
];
/** La temporada que corresponde a los estados de origen del plano. */
const TEMPORADA_BASE = 5;

const INDICE: Record<string, number> = {};
PIEZAS.forEach((p, i) => { INDICE[p.llave] = i; });

interface Nodo {
  g: SVGGElement | null;
  estado: Estado;
  oy: number;
}

/* ── la ficha ─────────────────────────────────────────────────────────────── */

function Ficha({ p, onCerrar, fichaRef }: {
  p: Pieza | null;
  onCerrar: () => void;
  fichaRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="ficha" ref={fichaRef} data-open={p ? "true" : "false"}
      role="group" aria-live="polite" aria-label="Ficha del mueble">
      {p && (
        <>
          <button className="ficha__close" type="button" onClick={onCerrar} aria-label="Cerrar">
            <svg width="16" height="16" aria-hidden="true"><use href="#lp-i-close" /></svg>
          </button>
          <p className="ficha__code">{p.code}</p>
          <p className="ficha__type">{p.tipo}</p>
          <p className="ficha__loc">{p.ubi ? p.ubi + " · " : ""}sede {p.sede}</p>
          <div className="ficha__hr" />
          <p className="ficha__state" style={{ color: `var(--st-${p.e})` }}>
            <i className="dot" style={{ background: `var(--st-${p.e})` }} aria-hidden="true" />
            {ETIQUETA[p.e]}
          </p>
          {p.e === "resto" && <p className="ficha__row">No se alquila. Es parte del local.</p>}
          {p.e === "libre" && (
            <>
              <p className="ficha__row">Tarifa de referencia</p>
              <p className="ficha__row ficha__money">{pesos(p.tarifa ?? 0)} al mes</p>
            </>
          )}
          {(p.e === "tomado" || p.e === "libera") && (
            <>
              <p className="ficha__row">{p.prov}</p>
              <p className="ficha__row ficha__money">{pesos(p.canon ?? 0)} al mes</p>
              <p className="ficha__row">{p.fecha}</p>
            </>
          )}
          {p.prov && <p className="ficha__foot">Proveedor y valores de ejemplo</p>}
        </>
      )}
    </div>
  );
}

/* ── el escenario ─────────────────────────────────────────────────────────── */

function Escenario() {
  const planboxRef = useRef<HTMLDivElement | null>(null);
  const escenaRef = useRef<SVGGElement | null>(null);
  const fichaRef = useRef<HTMLDivElement | null>(null);
  const nodos = useRef<Nodo[]>(PIEZAS.map((p) => ({ g: null, estado: p.e, oy: 0 })));
  const pisos = useRef<Record<string, { poly: SVGPolygonElement | null; txt: SVGTextElement | null }>>({
    CENTRO: { poly: null, txt: null }, PALMAS: { poly: null, txt: null },
  });
  const fx = useRef<Record<string, HTMLDivElement | null>>({});
  const chips = useRef<Array<HTMLSpanElement | null>>([]);
  const paleta = useRef<Paleta>(PALETA_VACIA);

  /* La cámara. Fuera de React a propósito (ver el comentario de arriba). */
  const V = useRef(0);
  const cam = useRef({ s: 1, px: 0, py: 0 });
  const tgt = useRef({ s: 1, px: 0, py: 0 });
  const base = useRef({ s: 1, tx: 0, ty: 0 });
  const base0 = useRef<{ s: number; tx: number; ty: number } | null>(null);
  const base1 = useRef<{ s: number; tx: number; ty: number } | null>(null);
  const raf = useRef<number | null>(null);
  const animV = useRef<number | null>(null);
  const animSep = useRef<number | null>(null);
  const sepVal = useRef(0);
  const escenaActual = useRef("hero");
  /* La ficha del mueble solo existe en el inicio: en las specs tapaba la capa
     de prueba de la sección (dueño, 2026-09-06). Ahí queda el resaltado
     (anillo + código) y nada más. */
  const [enHero, setEnHero] = useState(true);
  const ultimaTemp = useRef(-1);
  const hoverBloq = useRef(false);
  const movio = useRef(0);

  const [activo, setActivo] = useState<{ i: number; fijo: boolean } | null>(null);
  const activoRef = useRef(activo);
  activoRef.current = activo;
  const [en3d, setEn3d] = useState(false);
  const [recorrido, setRecorrido] = useState(false);
  const [cargando3d, setCargando3d] = useState(false);
  const [error3d, setError3d] = useState<"carga" | "soporte" | null>(null);

  /* ── pintura ────────────────────────────────────────────────────────────── */

  const ubicarCapas = useCallback(() => {
    const caja = planboxRef.current;
    if (!caja) return;
    const r = caja.getBoundingClientRect();
    const S = base.current.s * cam.current.s;
    Object.keys(ANCLAS).forEach((n) => {
      const box = fx.current[n];
      if (!box || box.getAttribute("data-on") !== "true") return;
      const a = ANCLAS[n];
      const p = PIEZAS[INDICE[a.key]];
      const nodo = nodos.current[INDICE[a.key]];
      const c = proy(p.x + p.w / 2, p.y + nodo.oy + p.d / 2, p.h, V.current);
      const sx = base.current.tx + cam.current.px + S * c[0];
      const sy = base.current.ty + cam.current.py + S * c[1];
      const bw = box.offsetWidth || 240;
      const bh = box.offsetHeight || 120;
      let x = sx - bw / 2 + a.dx;
      let y = sy - bh + a.dy;
      x = Math.max(12, Math.min(r.width - bw - 12, x));
      y = Math.max(74, Math.min(r.height - bh - 12, y));
      box.style.left = x + "px";
      box.style.top = y + "px";
    });
  }, []);

  const ubicarFicha = useCallback((i: number) => {
    const caja = planboxRef.current;
    const ficha = fichaRef.current;
    if (!caja || !ficha) return;
    const p = PIEZAS[i];
    const r = caja.getBoundingClientRect();
    const S = base.current.s * cam.current.s;
    const c = proy(p.x + p.w / 2, p.y + nodos.current[i].oy + p.d / 2, p.h, V.current);
    const sx = base.current.tx + cam.current.px + S * c[0];
    const sy = base.current.ty + cam.current.py + S * c[1];
    const fw = ficha.offsetWidth || 252;
    const fh = ficha.offsetHeight || 170;
    let x = sx - fw / 2;
    let y = sy - fh - 14;
    if (y < 8) y = sy + 18;
    x = Math.max(8, Math.min(r.width - fw - 8, x));
    y = Math.max(8, Math.min(r.height - fh - 8, y));
    ficha.style.left = x + "px";
    ficha.style.top = y + "px";
  }, []);

  const aplicar = useCallback(() => {
    const g = escenaRef.current;
    if (!g) return;
    const S = base.current.s * cam.current.s;
    g.style.setProperty("--lbl", 11 / S + "px");
    g.style.setProperty("--sede", 12 / S + "px");
    g.setAttribute("transform",
      `translate(${base.current.tx + cam.current.px},${base.current.ty + cam.current.py}) scale(${S})`);
    const act = activoRef.current;
    if (act) ubicarFicha(act.i);
    ubicarCapas();
  }, [ubicarCapas, ubicarFicha]);

  const mezclarBase = useCallback(() => {
    const b0 = base0.current;
    const b1 = base1.current;
    if (!b0 || !b1) return;
    const v = V.current;
    base.current = {
      s: b0.s + (b1.s - b0.s) * v,
      tx: b0.tx + (b1.tx - b0.tx) * v,
      ty: b0.ty + (b1.ty - b0.ty) * v,
    };
  }, []);

  /** Repinta la geometría entera con el `v` y las separaciones vigentes. */
  const pintar = useCallback(() => {
    const v = V.current;
    (Object.keys(SEDES) as Sede[]).forEach((nombre) => {
      const s = SEDES[nombre];
      const nodo = pisos.current[nombre];
      if (!nodo.poly || !nodo.txt) return;
      const x = s.dx - 0.8;
      const y = s.dy - 0.8;
      const q = (a: number, b: number) => {
        const t = proy(a, b, 0, v);
        return t[0] + "," + t[1];
      };
      nodo.poly.setAttribute("points",
        `${q(x, y)} ${q(x + s.w, y)} ${q(x + s.w, y + s.d)} ${q(x, y + s.d)}`);
      const lt = proy(x + s.w / 2, y + s.d + 1.6, 0, v);
      nodo.txt.setAttribute("x", String(lt[0]));
      nodo.txt.setAttribute("y", String(lt[1]));
    });
    PIEZAS.forEach((p, i) => {
      const g = nodos.current[i].g;
      if (!g) return;
      const f = caras(p, v, nodos.current[i].oy);
      const hijos = g.children;
      hijos[0].setAttribute("points", f.right);
      hijos[1].setAttribute("points", f.left);
      hijos[2].setAttribute("points", f.top);
      hijos[3].setAttribute("points", f.top);
      const lab = hijos[4];
      if (lab) {
        const c = proy(p.x + p.w / 2, p.y + nodos.current[i].oy + p.d / 2, p.h, v);
        lab.setAttribute("x", String(c[0]));
        lab.setAttribute("y", String(c[1] - 0.3));
      }
    });
    mezclarBase();
    aplicar();
  }, [aplicar, mezclarBase]);

  /** Vuelve a pintar los `fill` de una pieza con la paleta vigente. */
  const teñir = useCallback((i: number) => {
    const g = nodos.current[i].g;
    if (!g) return;
    const c = paleta.current[nodos.current[i].estado];
    (g.children[0] as SVGElement).setAttribute("fill", c.right);
    (g.children[1] as SVGElement).setAttribute("fill", c.left);
    (g.children[2] as SVGElement).setAttribute("fill", c.top);
  }, []);

  const refrescarPaleta = useCallback(() => {
    const caja = planboxRef.current;
    if (!caja) return;
    const raiz = caja.closest(".lp") ?? document.documentElement;
    paleta.current = leerPaleta(raiz);
    PIEZAS.forEach((_, i) => teñir(i));
    (Object.keys(SEDES) as Sede[]).forEach((n) => {
      const nodo = pisos.current[n];
      if (!nodo.poly) return;
      nodo.poly.setAttribute("fill", paleta.current.piso);
      nodo.poly.setAttribute("stroke", paleta.current.canto);
    });
  }, [teñir]);

  /* ── encuadres ──────────────────────────────────────────────────────────── */

  const calcBase = useCallback((v: number) => {
    const caja = planboxRef.current;
    const r = caja ? caja.getBoundingClientRect() : { width: 800, height: 600 };
    const vw = Math.max(1, r.width);
    const vh = Math.max(1, r.height);
    const bb = bbox(PIEZAS.filter((p) => p.sede === "CENTRO"), v);
    const s = Math.min(vw / bb.w, vh / bb.h) * 0.8;
    return { s, tx: vw / 2 - s * (bb.x + bb.w / 2), ty: vh / 2 - s * (bb.y + bb.h / 2) };
  }, []);

  const kick = useCallback(() => {
    if (raf.current !== null) return;
    const paso = () => {
      raf.current = null;
      const k = 0.14;
      const ds = tgt.current.s - cam.current.s;
      const dx = tgt.current.px - cam.current.px;
      const dy = tgt.current.py - cam.current.py;
      cam.current.s += ds * k;
      cam.current.px += dx * k;
      cam.current.py += dy * k;
      aplicar();
      if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(ds) > 0.0008) kick();
    };
    raf.current = requestAnimationFrame(paso);
  }, [aplicar]);

  const setEscena = useCallback((id: string, inmediato: boolean) => {
    const caja = planboxRef.current;
    if (!caja) return;
    const s = ESC[id] || ESC.hero;
    const r = caja.getBoundingClientRect();
    let cx = s.cx ?? 15;
    let cy = s.cy ?? 10;
    let ancY = r.height * 0.5;
    if (s.key) {
      const i = INDICE[s.key];
      const p = PIEZAS[i];
      cx = p.x + p.w / 2;
      cy = p.y + nodos.current[i].oy + p.d / 2;
      ancY = r.height * 0.6;
    }
    const w = proy(cx, cy, 0, V.current);
    const S2 = base.current.s * s.z;
    tgt.current.s = s.z;
    tgt.current.px = r.width / 2 - S2 * w[0] - base.current.tx;
    tgt.current.py = ancY - S2 * w[1] - base.current.ty;
    if (inmediato || quieto()) {
      cam.current = { s: tgt.current.s, px: tgt.current.px, py: tgt.current.py };
      aplicar();
    } else {
      kick();
    }
  }, [aplicar, kick]);

  const refrescarBase = useCallback(() => {
    base0.current = calcBase(0);
    base1.current = calcBase(1);
    mezclarBase();
  }, [calcBase, mezclarBase]);

  /* ── las dos caras de la góndola se separan ─────────────────────────────── */

  const aplicarSep = useCallback(() => {
    nodos.current[INDICE[CARA_A]].oy = -1.15 * sepVal.current;
    nodos.current[INDICE[CARA_B]].oy = 1.15 * sepVal.current;
  }, []);

  const separarCaras = useCallback((on: boolean) => {
    const destino = on ? 1 : 0;
    [CARA_A, CARA_B].forEach((k) => {
      nodos.current[INDICE[k]].g?.setAttribute("data-show", on ? "true" : "false");
    });
    if (sepVal.current === destino && animSep.current === null) return;
    if (quieto()) {
      sepVal.current = destino;
      aplicarSep();
      pintar();
      return;
    }
    if (animSep.current !== null) cancelAnimationFrame(animSep.current);
    const v0 = sepVal.current;
    const t0 = performance.now();
    const pas = (t: number) => {
      const u = Math.min(1, (t - t0) / 520);
      const e = 1 - Math.pow(1 - u, 3);
      sepVal.current = v0 + (destino - v0) * e;
      aplicarSep();
      pintar();
      animSep.current = u < 1 ? requestAnimationFrame(pas) : null;
    };
    animSep.current = requestAnimationFrame(pas);
  }, [aplicarSep, pintar]);

  /* ── el plano se repinta por temporada ──────────────────────────────────── */

  const pintarTemporada = useCallback((idx: number) => {
    if (idx === ultimaTemp.current) return;
    ultimaTemp.current = idx;
    chips.current.forEach((c, i) => c?.classList.toggle("act", i === idx));
    const nombres: Estado[] = ["libre", "libera", "tomado"];
    PIEZAS.forEach((p, i) => {
      if (!p.alq) return;
      let h = 0;
      for (let k = 0; k < p.llave.length; k++) h = (h * 31 + p.llave.charCodeAt(k)) | 0;
      const st = idx === TEMPORADA_BASE ? p.e : nombres[Math.abs(h + idx * 7919) % 3];
      if (nodos.current[i].estado === st) return;
      nodos.current[i].estado = st;
      teñir(i);
      nodos.current[i].g?.setAttribute("aria-label",
        `${p.code}, ${p.tipo}, sede ${p.sede}, ${ETIQUETA[st]}`);
    });
  }, [teñir]);

  const restaurarTemporada = useCallback(() => {
    if (ultimaTemp.current === -1) return;
    pintarTemporada(TEMPORADA_BASE);
    ultimaTemp.current = -1;
    chips.current.forEach((c, i) => c?.classList.toggle("act", i === TEMPORADA_BASE));
  }, [pintarTemporada]);

  const aplicarFx = useCallback((id: string) => {
    const s = ESC[id] || {};
    const lista = s.fx || [];
    Object.keys(fx.current).forEach((n) => {
      fx.current[n]?.setAttribute("data-on", lista.indexOf(n) >= 0 ? "true" : "false");
    });
    separarCaras(!!s.sep);
    if (!s.temporada) restaurarTemporada();
    ubicarCapas();
  }, [restaurarTemporada, separarCaras, ubicarCapas]);

  /* ── ficha ──────────────────────────────────────────────────────────────── */

  const abrir = useCallback((i: number, fijo: boolean) => {
    hoverBloq.current = fijo;
    setActivo({ i, fijo });
  }, []);

  const cerrar = useCallback(() => {
    hoverBloq.current = false;
    setActivo(null);
  }, []);

  useEffect(() => {
    PIEZAS.forEach((_, i) => {
      nodos.current[i].g?.setAttribute("data-active", activo?.i === i ? "true" : "false");
    });
    if (activo) ubicarFicha(activo.i);
  }, [activo, ubicarFicha]);

  /* ── arranque ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    refrescarPaleta();
    pintar();
    refrescarBase();
    setEscena("hero", true);
    aplicarFx("hero");
    if (!quieto()) {
      cam.current.s = tgt.current.s * 0.88;
      aplicar();
      requestAnimationFrame(() => setEscena("hero", false));
    }
    const t = window.setTimeout(() => {
      if (!activoRef.current) abrir(INDICE[PIEZA_INICIAL], true);
    }, quieto() ? 0 : 700);
    return () => {
      window.clearTimeout(t);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (animV.current !== null) cancelAnimationFrame(animV.current);
      if (animSep.current !== null) cancelAnimationFrame(animSep.current);
    };
    // Sólo al montar: lo de adentro son funciones estables (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* El tema lo cambia la landing en el `.lp`: hay que releer la paleta. */
  useEffect(() => {
    const caja = planboxRef.current;
    const raiz = caja?.closest(".lp");
    if (!raiz) return;
    const mo = new MutationObserver(() => refrescarPaleta());
    mo.observe(raiz, { attributes: true, attributeFilter: ["data-lp-tema"] });
    return () => mo.disconnect();
  }, [refrescarPaleta]);

  /* ── scroll → escena ────────────────────────────────────────────────────── */

  useEffect(() => {
    const caja = planboxRef.current;
    const raiz = caja?.closest(".lp");
    if (!raiz) return;
    const paneles = Array.from(raiz.querySelectorAll<HTMLElement>(".panel[data-scene]"));
    let pedido = false;
    const alScroll = () => {
      const vh = window.innerHeight;
      const mid = window.scrollY + vh * 0.5;
      let best: HTMLElement | null = null;
      let bd = 1e12;
      let prog = 0;
      paneles.forEach((p) => {
        const r = p.getBoundingClientRect();
        const top = r.top + window.scrollY;
        const h = r.height || 1;
        const d = Math.abs(top + h / 2 - mid);
        if (d < bd) {
          bd = d;
          best = p;
          prog = Math.max(0, Math.min(1, (mid - top) / h));
        }
      });
      if (!best) return;
      const id = (best as HTMLElement).getAttribute("data-scene") || "hero";
      if (id !== escenaActual.current) {
        escenaActual.current = id;
        setEnHero(id === "hero");
        aplicarFx(id);
        /* La cámara de la sección SIEMPRE retoma el plano: un arrastre o un
           zoom a mano vale hasta la próxima sección, nunca congela el plano
           mientras se baja por las specs (dueño, 2026-09-06). */
        setEscena(id, false);
        if (activoRef.current && id !== "hero") cerrar();
      }
      if (id === "qh-3") pintarTemporada(Math.max(0, Math.min(8, Math.floor(prog * 9))));
    };
    const alPedir = () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => { pedido = false; alScroll(); });
    };
    alScroll();
    window.addEventListener("scroll", alPedir, { passive: true });
    return () => window.removeEventListener("scroll", alPedir);
  }, [aplicarFx, cerrar, pintarTemporada, setEscena]);

  useEffect(() => {
    let t: number | undefined;
    const alRedimensionar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        refrescarBase();
        setEscena(escenaActual.current, true);
      }, 140);
    };
    window.addEventListener("resize", alRedimensionar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", alRedimensionar);
    };
  }, [refrescarBase, setEscena]);

  /* ── zoom, arrastre, pellizco ───────────────────────────────────────────── */

  const sincronizar = useCallback(() => {
    tgt.current = { s: cam.current.s, px: cam.current.px, py: cam.current.py };
  }, []);

  const zoomEn = useCallback((f: number, cx?: number, cy?: number) => {
    const caja = planboxRef.current;
    if (!caja) return;
    const r = caja.getBoundingClientRect();
    const ax = cx === undefined ? r.width / 2 : cx;
    const ay = cy === undefined ? r.height / 2 : cy;
    const S = base.current.s * cam.current.s;
    const wx = (ax - (base.current.tx + cam.current.px)) / S;
    const wy = (ay - (base.current.ty + cam.current.py)) / S;
    cam.current.s = Math.max(0.35, Math.min(5, cam.current.s * f));
    const S2 = base.current.s * cam.current.s;
    cam.current.px = ax - S2 * wx - base.current.tx;
    cam.current.py = ay - S2 * wy - base.current.ty;
    sincronizar();
    aplicar();
  }, [aplicar, sincronizar]);

  useEffect(() => {
    const caja = planboxRef.current;
    if (!caja) return;
    const punteros = new Map<number, { x: number; y: number }>();
    let arrastre: { x: number; y: number; px: number; py: number } | null = null;
    let pinza: { d: number; s: number } | null = null;

    const alBajar = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest(".stage__svg")) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const v = Array.from(punteros.values());
      if (v.length === 1) {
        arrastre = { x: e.clientX, y: e.clientY, px: cam.current.px, py: cam.current.py };
        movio.current = 0;
      } else if (v.length === 2) {
        pinza = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), s: cam.current.s };
        arrastre = null;
      }
    };
    const alMover = (e: PointerEvent) => {
      if (!punteros.has(e.pointerId)) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const v = Array.from(punteros.values());
      if (pinza && v.length === 2) {
        const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
        const r = caja.getBoundingClientRect();
        zoomEn((d / pinza.d) * pinza.s / cam.current.s,
          (v[0].x + v[1].x) / 2 - r.left, (v[0].y + v[1].y) / 2 - r.top);
      } else if (arrastre) {
        const dx = e.clientX - arrastre.x;
        const dy = e.clientY - arrastre.y;
        movio.current = Math.max(movio.current, Math.abs(dx) + Math.abs(dy));
        if (movio.current > 10) {
          cam.current.px = arrastre.px + dx;
          cam.current.py = arrastre.py + dy;
          sincronizar();
          aplicar();
        }
      }
    };
    const alSoltar = (e: PointerEvent) => {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pinza = null;
      if (punteros.size === 0) arrastre = null;
    };
    /* La rueda sola SIEMPRE scrollea la página: el plano está pegado a toda la
       pantalla y «armarlo» con el clic lo dejaba secuestrando el scroll hasta
       que el mouse salía (dueño, 2026-09-06). El zoom por rueda pide Ctrl/⌘;
       la pinza del trackpad manda ctrlKey sola; quedan los botones y la pinza
       táctil. */
    const alRodar = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = caja.getBoundingClientRect();
      zoomEn(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };

    caja.addEventListener("pointerdown", alBajar);
    caja.addEventListener("wheel", alRodar, { passive: false });
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alSoltar);
    return () => {
      caja.removeEventListener("pointerdown", alBajar);
      caja.removeEventListener("wheel", alRodar);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alSoltar);
    };
  }, [aplicar, sincronizar, zoomEn]);

  /* ── «Ver en 3D»: un solo parámetro animado ─────────────────────────────── */

  const irA = useCallback((v: number) => {
    if (quieto()) {
      V.current = v;
      pintar();
      setEscena(escenaActual.current, true);
      return;
    }
    if (animV.current !== null) cancelAnimationFrame(animV.current);
    const v0 = V.current;
    const t0 = performance.now();
    const paso = (t: number) => {
      const u = Math.min(1, (t - t0) / 760);
      const e = 1 - Math.pow(1 - u, 3);
      V.current = v0 + (v - v0) * e;
      pintar();
      if (u < 1) {
        animV.current = requestAnimationFrame(paso);
      } else {
        animV.current = null;
        setEscena(escenaActual.current, true);
      }
    };
    animV.current = requestAnimationFrame(paso);
  }, [pintar, setEscena]);

  const alternar3d = useCallback(() => {
    const yaEn3D = V.current > 0.5;
    irA(yaEn3D ? 0 : 1);
    setEn3d(!yaEn3D);
    if (yaEn3D) {
      setRecorrido(false);
      setError3d(null);
    }
  }, [irA]);

  const volverDelRecorrido = useCallback(() => {
    setRecorrido(false);
    planboxRef.current?.focus({ preventScroll: true });
  }, []);

  const sinSoporte3d = useCallback(() => {
    setRecorrido(false);
    setError3d("soporte");
  }, []);

  /** El único camino a three.js de toda la página, y sólo si lo piden. */
  const abrirRecorrido = useCallback(async () => {
    if (recorrido) { volverDelRecorrido(); return; }
    setCargando3d(true);
    setError3d(null);
    try {
      await import("./Vista3D");
      setRecorrido(true);
    } catch {
      setError3d("carga");
    } finally {
      setCargando3d(false);
    }
  }, [recorrido, volverDelRecorrido]);

  /* ── teclado ────────────────────────────────────────────────────────────── */

  const alTeclear = (ev: React.KeyboardEvent) => {
    const paso = 48;
    switch (ev.key) {
      case "ArrowLeft": cam.current.px += paso; break;
      case "ArrowRight": cam.current.px -= paso; break;
      case "ArrowUp": cam.current.py += paso; break;
      case "ArrowDown": cam.current.py -= paso; break;
      case "+": case "=": zoomEn(1.18); return;
      case "-": case "_": zoomEn(1 / 1.18); return;
      case "Escape": cerrar(); return;
      case "Enter": case " ": {
        const g = (document.activeElement as Element | null)?.closest?.(".pieza");
        if (g) {
          ev.preventDefault();
          const k = g.getAttribute("data-llave");
          if (k && INDICE[k] !== undefined) abrir(INDICE[k], true);
        }
        return;
      }
      default: return;
    }
    ev.preventDefault();
    sincronizar();
    aplicar();
  };

  const llaveDe = (t: EventTarget | null): number | null => {
    const g = (t as Element | null)?.closest?.(".pieza");
    const k = g?.getAttribute("data-llave");
    return k && INDICE[k] !== undefined ? INDICE[k] : null;
  };

  const piezaActiva = activo && enHero ? PIEZAS[activo.i] : null;

  return (
    <div className="stage">
      <div
        className="stage__plan"
        ref={planboxRef}
        tabIndex={0}
        role="application"
        aria-label="Plano interactivo de un supermercado de ejemplo. Usá las flechas para moverte y Enter para abrir la ficha de un mueble."
        aria-describedby="lp-plano-desc"
        onKeyDown={alTeclear}
        onFocus={(e) => { if (e.target === e.currentTarget) e.currentTarget.setAttribute("data-kb", "1"); }}
        onBlur={(e) => { if (e.target === e.currentTarget) e.currentTarget.setAttribute("data-kb", "0"); }}
        onClick={(e) => {
          const t = e.target as Element;
          if (t.closest(".hud") || t.closest(".ficha")) return;
          if (movio.current > 10) { movio.current = 0; return; }
          const i = llaveDe(e.target);
          if (i === null) { cerrar(); return; }
          abrir(i, true);
        }}
        onMouseOver={(e) => {
          if (hoverBloq.current) return;
          const i = llaveDe(e.target);
          if (i !== null && i !== activoRef.current?.i) abrir(i, false);
        }}
        onFocusCapture={(e) => {
          const i = llaveDe(e.target);
          if (i !== null) abrir(i, true);
        }}
      >
        <svg
          className="stage__svg"
          role="img"
          aria-label="Plano isométrico de un supermercado de ejemplo, visto desde arriba en perspectiva. Dieciséis muebles alquilables pintados según su estado —verde libre, naranja se libera, rojo tomado— entre pasillos, cajas y neveras en gris que no se alquilan."
        >
          <g ref={escenaRef}>
            {(Object.keys(SEDES) as Sede[]).map((nombre) => (
              <g key={nombre} pointerEvents="none">
                <polygon
                  ref={(el) => { pisos.current[nombre].poly = el; }}
                  fill={PALETA_VACIA.piso} stroke={PALETA_VACIA.canto} strokeWidth={0.06} opacity={0.92}
                />
                <text className="sede-label" ref={(el) => { pisos.current[nombre].txt = el; }}>{nombre}</text>
              </g>
            ))}
            {PIEZAS.map((p, i) => (
              <g
                key={p.llave}
                className="pieza"
                data-llave={p.llave}
                ref={(el) => { nodos.current[i].g = el; }}
                {...(p.alq
                  ? {
                    tabIndex: 0,
                    role: "button",
                    "aria-label": `${p.code}, ${p.tipo}, sede ${p.sede}, ${ETIQUETA[p.e]}`,
                  }
                  : { "aria-hidden": true })}
              >
                <polygon className="face" />
                <polygon className="face" />
                <polygon className="face" fillOpacity={p.alq ? 1 : 0.92} />
                <polygon className="pieza__ring" style={{ strokeWidth: "0.1px" }} />
                {p.alq && <text className="pieza__code">{p.code}</text>}
              </g>
            ))}
          </g>
        </svg>

        <div className="vignette" aria-hidden="true" />

        {/* Las capas de prueba: la cámara las saca sobre el propio plano. */}
        <div className="fxlayer" aria-hidden="true">
          <div className="fxbox glass" id="lp-fxCaras" ref={(el) => { fx.current.fxCaras = el; }}>
            <b>Una góndola son dos espacios</b>
            GON-04·A tomada · GON-04·B libre. Cada cara se vende aparte.
          </div>
          <div className="fxbox glass" id="lp-fxContrato" ref={(el) => { fx.current.fxContrato = el; }}>
            <div className="ttl">Una sola ficha</div>
            <div className="row"><span>proveedor</span><b>Bebidas Zafiro</b></div>
            <div className="row"><span>canon mensual</span><b>$ 1.500.000</b></div>
            <div className="row"><span>desde</span><b>1 sep</b></div>
            <div className="row"><span>hasta</span><b>31 oct</b></div>
            <div className="tot"><span>61 días</span><b>$ 3.050.000</b></div>
          </div>
          <div className="fxbox glass" id="lp-fxTemporada" ref={(el) => { fx.current.fxTemporada = el; }}>
            {TEMPORADAS.map((t, i) => (
              <span key={t} className={i === TEMPORADA_BASE ? "act" : undefined}
                ref={(el) => { chips.current[i] = el; }}>{t}</span>
            ))}
          </div>
          <div className="fxbox glass" id="lp-fxTarifa" ref={(el) => { fx.current.fxTarifa = el; }}>
            <span className="d">−17 %</span>vs referencia
          </div>
          <div className="fxbox glass" id="lp-fxAvisos" ref={(el) => { fx.current.fxAvisos = el; }}>
            <div className="mails">
              <div className="mail"><em>el comercial</em> recibe el acuerdo con el valor<span className="tag">1</span></div>
              <div className="mail"><em>el mercaderista</em> recibe la orden de montaje<span className="tag">2</span></div>
              <div className="mail"><em>el proveedor</em> recibe la constancia<span className="tag">3</span></div>
            </div>
            <div className="line" />
            <div className="dots">
              <div className="dot3"><i /><b>30</b><span>días</span></div>
              <div className="dot3"><i /><b>15</b><span>días</span></div>
              <div className="dot3"><i /><b>6</b><span>días</span></div>
            </div>
          </div>
          <div className="fxbox glass" id="lp-fxMontaje" ref={(el) => { fx.current.fxMontaje = el; }}>
            <div className="scr">
              <div className="photo" />
              <div className="meta"><b>CRS-01</b><br />Pasillo central · sede CENTRO</div>
              <div className="btns"><span className="ok">Montado</span><span className="no">No pude</span></div>
            </div>
          </div>
        </div>

        <div className="hud">
          <p className="rotulo"><i className="pulse" aria-hidden="true" /> Supermercado de ejemplo · Tocá un mueble</p>
          <div className="tools">
            <button className="tool" type="button" aria-label="Alejar" title="Alejar" onClick={() => zoomEn(1 / 1.22)}>
              <svg width="15" height="15" aria-hidden="true"><use href="#lp-i-minus" /></svg>
            </button>
            <button className="tool" type="button" aria-label="Acercar" title="Acercar" onClick={() => zoomEn(1.22)}>
              <svg width="15" height="15" aria-hidden="true"><use href="#lp-i-plus" /></svg>
            </button>
            <button className="tool" type="button" aria-label="Centrar" title="Centrar"
              onClick={() => setEscena(escenaActual.current, false)}>
              <svg width="15" height="15" aria-hidden="true"><use href="#lp-i-target" /></svg><span>Centrar</span>
            </button>
            <button className="tool" type="button" aria-pressed={en3d}
              aria-label={en3d ? "Volver al plano" : "Ver en 3D"} title={en3d ? "Volver al plano" : "Ver en 3D"}
              onClick={alternar3d}>
              <svg width="15" height="15" aria-hidden="true"><use href="#lp-i-cube" /></svg>
              <span>{en3d ? "Volver al plano" : "Ver en 3D"}</span>
            </button>
            {en3d && (
              <button className="tool" type="button" aria-pressed={recorrido} disabled={cargando3d}
                aria-label={recorrido ? "Salir del recorrido" : "Recorrer la sala en 3D"}
                title={recorrido ? "Salir del recorrido" : "Recorrer la sala en 3D"}
                onClick={abrirRecorrido}>
                <svg width="15" height="15" aria-hidden="true"><use href="#lp-i-map" /></svg>
                <span>{cargando3d ? "Cargando…" : recorrido ? "Salir" : "Recorrerla"}</span>
              </button>
            )}
          </div>
          <div className="legend">
            <h4>Estado en el periodo</h4>
            <ul>
              <li><i className="dot dot--libre" aria-hidden="true" /> Libre todo el periodo <span className="n">7</span></li>
              <li><i className="dot dot--libera" aria-hidden="true" /> Se libera en el periodo <span className="n">3</span></li>
              <li><i className="dot dot--tomado" aria-hidden="true" /> Tomado <span className="n">6</span></li>
              <li><i className="dot dot--resto" aria-hidden="true" /> Resto de la sala</li>
            </ul>
            <p className="foot">Es la misma lectura que vas a tener adentro, con tu propia tienda.</p>
          </div>
          <p className="help">
            <span className="mouse">Arrastrá para moverte. Ctrl + rueda para acercar. Tocá un mueble para ver su ficha.</span>
            <span className="touch">Deslizá para moverte. Pellizcá para acercar. Tocá un mueble.</span>
            <span className="kb">Flechas para moverte · + y − para acercar · Enter para abrir la ficha del mueble · Esc para cerrarla</span>
          </p>
        </div>

        <Ficha p={piezaActiva} onCerrar={() => { cerrar(); planboxRef.current?.focus({ preventScroll: true }); }} fichaRef={fichaRef} />

        {recorrido && (
          <Suspense fallback={<div className="escena3d"><p className="escena3d__pie">Cargando la vista 3D…</p></div>}>
            <Vista3D onSinSoporte={sinSoporte3d} onVolver={volverDelRecorrido} />
          </Suspense>
        )}

        {error3d && (
          <div className="escena3d escena3d--aviso">
            <div className="escena3d__caja">
              <p>
                {error3d === "soporte"
                  ? "Este navegador no puede mostrar la vista 3D. Adentro de RECABRA vas a poder abrirla desde un equipo de escritorio."
                  : "No pudimos abrir la vista 3D en este dispositivo. El plano sigue disponible."}
              </p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setError3d(null)}>
                Volver al plano
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Si el plano se cae, la página no se cae con él: aparece el texto de
 * `copy.md` §11.4 con su botón «Reintentar». La leyenda, la nota y la tabla
 * equivalente viven afuera para que la sección siga contando lo mismo.
 */
class Limite extends Component<{ children: ReactNode }, { roto: boolean; intento: number }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { roto: false, intento: 0 };
  }

  static getDerivedStateFromError() {
    return { roto: true };
  }

  render() {
    if (this.state.roto) {
      return (
        <div className="stage">
          <div className="stage__plan">
            <div className="plano-error">
              <p className="body">No pudimos dibujar el plano de ejemplo. El resto de la página funciona igual.</p>
              <button type="button" className="btn btn--ghost btn--sm"
                onClick={() => this.setState((s) => ({ roto: false, intento: s.intento + 1 }))}>
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }
    /* Fragmento y no un `<div>`: el `.stage` tiene que seguir siendo hijo
       directo de `.film` o el `position:sticky` de la sala deja de pegar. */
    return <Fragment key={this.state.intento}>{this.props.children}</Fragment>;
  }
}

export default function PlanoIsometrico() {
  return <Limite><Escenario /></Limite>;
}

/** La descripción larga y la tabla equivalente: la lectura sin el dibujo. */
export function PlanoEnTabla() {
  return (
    <div className="wrap tabla-tira">
      <p className="tiny sr" id="lp-plano-desc">
        Supermercado de ejemplo con dos sedes. En la sede CENTRO hay diez espacios alquilables:
        cuatro libres, dos que se liberan dentro del periodo y cuatro tomados. En la sede PALMAS
        hay seis: tres libres, uno que se libera y dos tomados. Cada espacio tiene un código, un
        tipo de mueble, un proveedor de ejemplo y un canon mensual. Los datos son inventados.
      </p>
      <p className="tiny">Los datos del plano son inventados, para mostrar cómo se ve. Ningún supermercado real aparece acá.</p>
      <details className="tabla-alt">
        <summary>Los mismos datos del plano, en tabla</summary>
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th><th>Tipo</th><th>Sede</th><th>Estado</th>
                <th>Proveedor de ejemplo</th><th>Canon mensual</th>
              </tr>
            </thead>
            <tbody>
              {ALQUILABLES.map((p) => (
                <tr key={p.llave}>
                  <td>{p.code}</td>
                  <td>{p.tipo}</td>
                  <td>{p.sede}</td>
                  <td>{ETIQUETA[p.e]}</td>
                  <td>{p.prov ?? "—"}</td>
                  <td>{pesos(p.canon ?? p.tarifa ?? 0)} al mes{p.tarifa ? " (tarifa)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
