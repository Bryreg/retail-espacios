import {
  Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { ALQUILABLES, ETIQUETA, PIEZAS, PISOS, PIEZA_INICIAL, type Pieza } from "./datos";

/**
 * El plano isométrico de la landing.
 *
 * SVG propio, dibujado a mano: ni three.js ni una librería de gráficos entran
 * en el primer pintado. La escena son ~46 prismas (tres polígonos cada uno)
 * calculados UNA vez; el paneo y el zoom son un único `transform` sobre el `<g>`
 * de cámara, no un redibujado — por eso arrastrar es barato hasta en un celular.
 *
 * La vista 3D de verdad (three.js) se carga recién cuando alguien toca «Ver en
 * 3D»: `React.lazy` + `import()` dinámico, en su propio chunk. El plano de acá
 * no depende de ella para nada.
 */

const Vista3D = lazy(() => import("./Vista3D"));

/* ── Proyección: isometría 2:1 (dimetría de juego) ────────────────────────
   sx = (x − y)·U · sy = ((x + y)·0,5 − z·0,66)·U. Se eligió 2:1 sobre la
   isometría verdadera de 30° porque las corridas de góndola quedan con ángulos
   más limpios y los códigos se leen mejor. Es la misma familia de proyección
   que usa `FloorPlan2D` para el mapa de la sede, con el escorzo del diseño. */
const U = 13;
const UY = 0.5;
const UZ = 0.66;

type P2 = readonly [number, number];

function pr(x: number, y: number, z: number): P2 {
  return [(x - y) * U, ((x + y) * UY - z * UZ) * U];
}

function pts(a: readonly P2[]): string {
  return a.map((q) => q[0].toFixed(2) + "," + q[1].toFixed(2)).join(" ");
}

interface Cuerpo {
  p: Pieza;
  i: number;
  alq: boolean;
  ft: string;
  fr: string;
  fl: string;
  lx: number;
  ly: number;
}

const CUERPOS: Cuerpo[] = PIEZAS.map((p, i) => {
  const h = p.h;
  const a = pr(p.x, p.y, h);
  const b = pr(p.x + p.w, p.y, h);
  const c = pr(p.x + p.w, p.y + p.d, h);
  const d = pr(p.x, p.y + p.d, h);
  const b0 = pr(p.x + p.w, p.y, 0);
  const c0 = pr(p.x + p.w, p.y + p.d, 0);
  const d0 = pr(p.x, p.y + p.d, 0);
  const m = pr(p.x + p.w / 2, p.y + p.d / 2, h);
  return {
    p, i, alq: p.e !== "resto",
    ft: pts([a, b, c, d]),
    fr: pts([b, c, c0, b0]),
    fl: pts([d, c, c0, d0]),
    lx: m[0], ly: m[1] + 3.2,
  };
});

const SUELOS = PISOS.map((s) => {
  const A = pr(s.x, s.y, 0);
  const B = pr(s.x + s.w, s.y, 0);
  const C = pr(s.x + s.w, s.y + s.d, 0);
  const D = pr(s.x, s.y + s.d, 0);
  const mid = pr(s.x + s.w / 2, s.y - 0.9, 0);
  return {
    rot: s.rot,
    top: pts([A, B, C, D]),
    canto: pts([D, C, [C[0], C[1] + 7], [D[0], D[1] + 7]]),
    tx: mid[0], ty: mid[1], ly: mid[1] + 7,
  };
});

/** El encuadre: todo lo dibujado, con aire alrededor. */
const VB = (() => {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  const mirar = (q: P2) => {
    if (q[0] < minx) minx = q[0];
    if (q[0] > maxx) maxx = q[0];
    if (q[1] < miny) miny = q[1];
    if (q[1] > maxy) maxy = q[1];
  };
  PISOS.forEach((s) => {
    [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.d], [s.x, s.y + s.d]]
      .forEach(([x, y]) => mirar(pr(x, y, 0)));
  });
  PIEZAS.forEach((p) => {
    const h = p.h * 1.4;
    [[p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y + p.d, 0], [p.x, p.y + p.d, 0],
     [p.x, p.y, h], [p.x + p.w, p.y, h], [p.x + p.w, p.y + p.d, h], [p.x, p.y + p.d, h]]
      .forEach(([x, y, z]) => mirar(pr(x, y, z)));
  });
  return [minx - 30, miny - 34, maxx - minx + 60, maxy - miny + 68] as const;
})();

const CX = VB[0] + VB[2] / 2;
const CY = VB[1] + VB[3] / 2;
const KMIN = 0.5;
const KMAX = 4.5;
const HOME = (() => {
  const pc = pr(15, 10, 1); // centro aproximado de la sede CENTRO
  return { k: 1.25, tx: CX - 1.25 * pc[0], ty: CY - 1.25 * pc[1] };
})();

const AYUDA_MOUSE = "Arrastrá para moverte. Rueda para acercar. Tocá un mueble para ver su ficha.";
const AYUDA_TACTO = "Deslizá para moverte. Pellizcá para acercar. Tocá un mueble.";
const AYUDA_TECLADO = "Flechas para moverte · + y − para acercar · Enter para abrir la ficha del mueble · Esc para cerrarla";
const AYUDA_3D = "Vista 3D de ejemplo. Arrastrá para girar y acercá con la rueda.";

function menosMovimiento(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ── La ficha del mueble ─────────────────────────────────────────────────── */

function Ficha({ p, onCerrar, fichaRef }: {
  p: Pieza | null;
  onCerrar: () => void;
  fichaRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      className="ficha"
      ref={fichaRef}
      data-open={p ? "1" : "0"}
      role="group"
      aria-live="polite"
      aria-label="Ficha del mueble"
    >
      {p && (
        <>
          <p className="ficha__code">{p.code}</p>
          <p className="ficha__tipo">{p.tipo}</p>
          <p className="ficha__ubi">{p.ubi ? p.ubi + " · " : ""}sede {p.sede}</p>
          <hr />
          <p className="ficha__estado">
            <i aria-hidden="true" style={{ background: `var(--st-${p.e}-dot)` }} />
            {ETIQUETA[p.e]}
          </p>
          {p.e === "resto" ? (
            <p className="ficha__row">No se alquila. Es parte del local.</p>
          ) : p.e === "libre" ? (
            <>
              <p className="ficha__row">Tarifa de referencia</p>
              <p className="ficha__canon">{p.tarifa} al mes</p>
            </>
          ) : (
            <>
              <p className="ficha__row">{p.prov}</p>
              <p className="ficha__canon">{p.canon} al mes</p>
              <p className="ficha__row">{p.fecha}</p>
            </>
          )}
          {p.e !== "libre" && p.e !== "resto" && (
            <p className="ficha__pie">Proveedor y valores de ejemplo</p>
          )}
          <button type="button" className="btn btn--ghost btn--sm ficha__close" onClick={onCerrar}>
            Cerrar
          </button>
        </>
      )}
    </div>
  );
}

/* ── El plano ────────────────────────────────────────────────────────────── */

function Plano() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const camRef = useRef<SVGGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fichaRef = useRef<HTMLDivElement | null>(null);
  const piezasRef = useRef<Array<SVGGElement | null>>([]);

  /** La cámara del plano. Vive en un ref: moverla no vuelve a montar nada. */
  const V = useRef({ ...HOME });
  const armado = useRef(false);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<{ d: number; k: number } | null>(null);
  const arrastre = useRef<{ ux: number; uy: number; tx: number; ty: number } | null>(null);

  const [activa, setActiva] = useState<{ i: number; fijada: boolean } | null>(null);
  const [pulso, setPulso] = useState<number | null>(null);
  const [ayuda, setAyuda] = useState(AYUDA_MOUSE);
  const [en3d, setEn3d] = useState(false);
  const [cargando3d, setCargando3d] = useState(false);
  const [error3d, setError3d] = useState<"carga" | "soporte" | null>(null);
  const activaRef = useRef(activa);
  activaRef.current = activa;

  const aplicar = useCallback(() => {
    const g = camRef.current;
    if (!g) return;
    const v = V.current;
    g.setAttribute("transform", `translate(${v.tx.toFixed(2)},${v.ty.toFixed(2)}) scale(${v.k.toFixed(4)})`);
  }, []);

  /** Coordenadas del SVG a partir de un punto de la pantalla. */
  const aUser = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const u = pt.matrixTransform(m.inverse());
    return { x: u.x, y: u.y };
  }, []);

  const posicionar = useCallback(() => {
    const act = activaRef.current;
    const ficha = fichaRef.current;
    const stage = stageRef.current;
    if (!act || !ficha || !stage) return;
    if (window.matchMedia("(max-width:720px)").matches) {
      ficha.style.left = "";
      ficha.style.top = "";
      return;
    }
    const g = piezasRef.current[act.i];
    if (!g) return;
    const r = g.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    let x = r.left - s.left + r.width / 2 - 132;
    let y = r.top - s.top - ficha.offsetHeight - 12;
    if (y < 8) y = r.bottom - s.top + 12;
    x = Math.max(8, Math.min(x, s.width - 272));
    y = Math.max(8, Math.min(y, s.height - ficha.offsetHeight - 8));
    ficha.style.left = x + "px";
    ficha.style.top = y + "px";
  }, []);

  const zoomEn = useCallback((ux: number, uy: number, f: number) => {
    const v = V.current;
    const nk = Math.min(KMAX, Math.max(KMIN, v.k * f));
    const r = nk / v.k;
    v.tx = ux - (ux - v.tx) * r;
    v.ty = uy - (uy - v.ty) * r;
    v.k = nk;
    aplicar();
    posicionar();
  }, [aplicar, posicionar]);

  const cerrar = useCallback(() => {
    setActiva(null);
    setPulso(null);
  }, []);

  const centrar = useCallback(() => {
    V.current = { ...HOME };
    aplicar();
    cerrar();
  }, [aplicar, cerrar]);

  const abrir = useCallback((i: number, fijada: boolean) => {
    setActiva({ i, fijada });
    setPulso(null);
  }, []);

  /* Encuadre inicial + ayuda según el puntero. */
  useEffect(() => {
    aplicar();
    if (window.matchMedia("(pointer:coarse)").matches) setAyuda(AYUDA_TACTO);
  }, [aplicar]);

  /* La ficha se recoloca cuando cambia de mueble o cambia el tamaño. */
  useEffect(() => {
    posicionar();
  }, [activa, posicionar]);

  useEffect(() => {
    const alRedimensionar = () => posicionar();
    window.addEventListener("resize", alRedimensionar);
    return () => window.removeEventListener("resize", alRedimensionar);
  }, [posicionar]);

  /* El primer gesto se enseña solo: la ficha de PUN-02 se abre sola.
     Con `prefers-reduced-motion`, sin espera y sin pulso. */
  useEffect(() => {
    const i = CUERPOS.findIndex((c) => c.alq && c.p.code === PIEZA_INICIAL);
    if (i < 0) return;
    const suave = menosMovimiento();
    const t = window.setTimeout(() => {
      setActiva({ i, fijada: true });
      if (!suave) setPulso(i);
    }, suave ? 0 : 700);
    return () => window.clearTimeout(t);
  }, []);

  /* La rueda se arma con el primer clic o foco sobre el plano: mientras no lo
     tocaste, la rueda hace scroll de la página como en cualquier otra sección.
     Un plano en un hero nunca debe secuestrar el scroll. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const alRodar = (ev: WheelEvent) => {
      if (!armado.current) return;
      ev.preventDefault();
      const u = aUser(ev.clientX, ev.clientY);
      zoomEn(u.x, u.y, ev.deltaY < 0 ? 1.14 : 1 / 1.14);
    };
    stage.addEventListener("wheel", alRodar, { passive: false });
    return () => stage.removeEventListener("wheel", alRodar);
  }, [aUser, zoomEn]);

  /* Esc cierra la ficha desde cualquier lado. */
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && activaRef.current) {
        cerrar();
        stageRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cerrar]);

  /* ── punteros: arrastre y pinza ────────────────────────────────────────── */
  const alBajarPuntero = (ev: React.PointerEvent) => {
    armado.current = true;
    if ((ev.target as Element).closest(".ficha")) return;
    stageRef.current?.setPointerCapture(ev.pointerId);
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (punteros.current.size === 1) {
      const u = aUser(ev.clientX, ev.clientY);
      arrastre.current = { ux: u.x, uy: u.y, tx: V.current.tx, ty: V.current.ty };
      stageRef.current?.classList.add("dragging");
    } else if (punteros.current.size === 2) {
      const v = Array.from(punteros.current.values());
      pinza.current = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), k: V.current.k };
      arrastre.current = null;
    }
  };

  const alMoverPuntero = (ev: React.PointerEvent) => {
    if (!punteros.current.has(ev.pointerId)) return;
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinza.current && punteros.current.size === 2) {
      const v = Array.from(punteros.current.values());
      const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      const mid = aUser((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2);
      const objetivo = Math.min(KMAX, Math.max(KMIN, pinza.current.k * (d / pinza.current.d)));
      zoomEn(mid.x, mid.y, objetivo / V.current.k);
      return;
    }
    const a = arrastre.current;
    if (a) {
      const u = aUser(ev.clientX, ev.clientY);
      V.current.tx = a.tx + (u.x - a.ux);
      V.current.ty = a.ty + (u.y - a.uy);
      aplicar();
      posicionar();
    }
  };

  const alSoltarPuntero = (ev: React.PointerEvent) => {
    punteros.current.delete(ev.pointerId);
    if (punteros.current.size < 2) pinza.current = null;
    if (punteros.current.size === 0) {
      arrastre.current = null;
      stageRef.current?.classList.remove("dragging");
    }
  };

  const alTeclearEnPlano = (ev: React.KeyboardEvent) => {
    const paso = 60 / V.current.k;
    let usado = true;
    switch (ev.key) {
      case "ArrowUp": V.current.ty += paso; break;
      case "ArrowDown": V.current.ty -= paso; break;
      case "ArrowLeft": V.current.tx += paso; break;
      case "ArrowRight": V.current.tx -= paso; break;
      case "+": case "=": zoomEn(CX, CY, 1.28); break;
      case "-": case "_": zoomEn(CX, CY, 1 / 1.28); break;
      case "Home": centrar(); break;
      case "Escape": cerrar(); break;
      default: usado = false;
    }
    if (usado) {
      ev.preventDefault();
      aplicar();
      posicionar();
    }
  };

  /* ── «Ver en 3D» ───────────────────────────────────────────────────────── */

  /* Estas dos van en `useCallback` y no sueltas: son las dependencias del
     efecto que arma la escena de three.js. Con una función nueva por render,
     cualquier cambio de la ficha desmontaría y volvería a construir el WebGL
     entero mientras alguien lo está mirando. */
  const volverAlPlano = useCallback(() => {
    setEn3d(false);
    setAyuda(window.matchMedia("(pointer:coarse)").matches ? AYUDA_TACTO : AYUDA_MOUSE);
  }, []);

  const sinSoporte3d = useCallback(() => {
    setEn3d(false);
    setError3d("soporte");
  }, []);

  const alternar3d = async () => {
    if (en3d) {
      setEn3d(false);
      setError3d(null);
      setAyuda(window.matchMedia("(pointer:coarse)").matches ? AYUDA_TACTO : AYUDA_MOUSE);
      return;
    }
    setCargando3d(true);
    setError3d(null);
    try {
      // El `import()` de three.js: acá, y no en el bundle inicial de "/".
      await import("./Vista3D");
      setEn3d(true);
      setAyuda(AYUDA_3D);
    } catch {
      setError3d("carga");
    } finally {
      setCargando3d(false);
    }
  };

  const piezaActiva = activa ? CUERPOS[activa.i].p : null;

  return (
    <>
      <figure className="mesa">
        <span className="crop tl" aria-hidden="true" />
        <span className="crop tr" aria-hidden="true" />
        <span className="crop bl" aria-hidden="true" />
        <span className="crop br" aria-hidden="true" />

        <div className="mesa__bar">
          <span className="rotulo"><i className="dot" aria-hidden="true" /> Supermercado de ejemplo · Tocá un mueble</span>
          <div className="mesa__tools">
            <button type="button" className="tool" aria-label="Acercar" title="Acercar"
              onClick={() => zoomEn(CX, CY, 1.28)}>+</button>
            <button type="button" className="tool" aria-label="Alejar" title="Alejar"
              onClick={() => zoomEn(CX, CY, 1 / 1.28)}>−</button>
            <button type="button" className="tool tool--wide" aria-label="Centrar"
              title="Volver al encuadre inicial" onClick={centrar}>Centrar</button>
            <button type="button" className="tool tool--wide" aria-pressed={en3d}
              disabled={cargando3d} onClick={alternar3d}>
              {cargando3d ? "Cargando la vista 3D…" : en3d ? "Volver al plano" : "Ver en 3D"}
            </button>
          </div>
        </div>

        <div
          className="mesa__stage"
          ref={stageRef}
          tabIndex={0}
          role="group"
          aria-label="Plano interactivo de un supermercado de ejemplo. Usá las flechas para moverte y Enter para abrir la ficha de un mueble."
          aria-describedby="lp-plano-desc"
          onPointerDown={alBajarPuntero}
          onPointerMove={alMoverPuntero}
          onPointerUp={alSoltarPuntero}
          onPointerCancel={alSoltarPuntero}
          onPointerLeave={() => { armado.current = false; }}
          onKeyDown={alTeclearEnPlano}
          onFocus={() => { armado.current = true; setAyuda(AYUDA_TECLADO); }}
          onBlur={() => {
            if (!en3d) setAyuda(window.matchMedia("(pointer:coarse)").matches ? AYUDA_TACTO : AYUDA_MOUSE);
          }}
          onClick={(ev) => {
            const t = ev.target as Element;
            if (!t.closest(".pz--alq") && !t.closest(".ficha")) cerrar();
          }}
        >
          <svg
            className="plano"
            ref={svgRef}
            viewBox={VB.join(" ")}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Plano isométrico de un supermercado de ejemplo, visto desde arriba en perspectiva. Dieciséis muebles alquilables pintados según su estado —verde libre, naranja se libera, rojo tomado— entre pasillos, cajas y neveras en gris que no se alquilan."
          >
            <g ref={camRef}>
              {SUELOS.map((s) => (
                <g className="piso" key={s.rot}>
                  <polygon points={s.canto} fill="var(--plan-floor-3)" />
                  <polygon points={s.top} fill="var(--plan-floor)" stroke="var(--plan-outline)" strokeWidth=".6" strokeLinejoin="round" />
                  <line x1={s.tx - 26} x2={s.tx + 26} y1={s.ly} y2={s.ly} stroke="var(--plan-outline)" strokeWidth="1" />
                  <text className="rotsede" x={s.tx} y={s.ty} textAnchor="middle">{s.rot}</text>
                </g>
              ))}

              {CUERPOS.map((c) => {
                const activo = activa?.i === c.i;
                const clase = "pz pz--" + c.p.e + (c.alq ? " pz--alq" : "")
                  + (activo ? " activa" : "") + (pulso === c.i ? " pulso" : "");
                return (
                  <g
                    key={c.i}
                    className={clase}
                    ref={(el) => { piezasRef.current[c.i] = el; }}
                    {...(c.alq
                      ? {
                          tabIndex: 0,
                          role: "button",
                          "aria-label": `${c.p.code}, ${c.p.tipo}, sede ${c.p.sede}, ${ETIQUETA[c.p.e]}`,
                          onPointerEnter: (ev: React.PointerEvent) => {
                            if (ev.pointerType === "mouse" && !activaRef.current?.fijada) abrir(c.i, false);
                          },
                          onPointerLeave: (ev: React.PointerEvent) => {
                            if (ev.pointerType === "mouse" && !activaRef.current?.fijada) cerrar();
                          },
                          onClick: (ev: React.MouseEvent) => {
                            ev.stopPropagation();
                            abrir(c.i, true);
                            (ev.currentTarget as SVGGElement).focus({ preventScroll: true });
                          },
                          onFocus: () => abrir(c.i, true),
                          onKeyDown: (ev: React.KeyboardEvent) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              abrir(c.i, true);
                            }
                          },
                        }
                      : { "aria-hidden": true })}
                  >
                    <polygon className="f f-r" points={c.fr} />
                    <polygon className="f f-l" points={c.fl} />
                    <polygon className="f f-t" points={c.ft} />
                    {c.alq && (
                      <text className="pzcode" x={c.lx} y={c.ly} textAnchor="middle">{c.p.code}</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {en3d && (
            <Suspense fallback={<div className="escena3d"><div className="escena3d__aviso"><p>Cargando la vista 3D…</p></div></div>}>
              <Vista3D onSinSoporte={sinSoporte3d} onVolver={volverAlPlano} />
            </Suspense>
          )}

          {error3d && (
            <div className="escena3d">
              <div className="escena3d__aviso">
                <p>
                  {error3d === "soporte"
                    ? "Este navegador no puede mostrar la vista 3D. Adentro de RECABRA vas a poder abrirla desde un equipo de escritorio."
                    : "No pudimos abrir la vista 3D en este dispositivo. El plano de arriba sigue disponible."}
                </p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setError3d(null)}>
                  Volver al plano
                </button>
              </div>
            </div>
          )}

          <Ficha p={piezaActiva} onCerrar={() => { cerrar(); stageRef.current?.focus({ preventScroll: true }); }} fichaRef={fichaRef} />
        </div>

        <figcaption className="sr" id="lp-plano-desc">
          Supermercado de ejemplo con dos sedes. En la sede CENTRO hay diez espacios alquilables:
          cuatro libres, dos que se liberan dentro del periodo y cuatro tomados. En la sede PALMAS
          hay seis: tres libres, uno que se libera y dos tomados. Cada espacio tiene un código, un
          tipo de mueble, un proveedor de ejemplo y un canon mensual. Los datos son inventados.
        </figcaption>

        <div className="mesa__foot">
          <Leyenda />
          <p className="mono" style={{ fontSize: ".72rem" }}>{ayuda}</p>
        </div>
      </figure>
    </>
  );
}

/** Los cuatro estados, con la palabra al lado del color. El punto nunca viaja
 *  solo: es la regla del producto y la condición bajo la cual el ámbar de bajo
 *  contraste es aceptable. */
function Leyenda() {
  return (
    <div className="leyenda-wrap">
      <div className="leyenda" role="list" aria-label="Estado en el periodo">
        <span className="ley ley--libre" role="listitem"><i aria-hidden="true" />Libre todo el periodo</span>
        <span className="ley ley--libera" role="listitem"><i aria-hidden="true" />Se libera en el periodo</span>
        <span className="ley ley--tomado" role="listitem"><i aria-hidden="true" />Tomado</span>
        <span className="ley ley--resto" role="listitem"><i aria-hidden="true" />Resto de la sala</span>
      </div>
      <p className="leyenda-pie">Es la misma lectura que vas a tener adentro, con tu propia tienda.</p>
    </div>
  );
}

/** La alternativa no gráfica del plano: los mismos datos, en tabla. */
function TablaEquivalente() {
  const filas = useMemo(() => ALQUILABLES, []);
  return (
    <details className="tabla-eq">
      <summary>Los mismos datos del plano, en tabla</summary>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Tipo</th><th>Sede</th><th>Estado</th>
              <th>Proveedor de ejemplo</th><th>Canon mensual</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p, i) => (
              <tr key={p.code + p.sede + i}>
                <td>{p.code}</td>
                <td>{p.tipo}</td>
                <td>{p.sede}</td>
                <td>{ETIQUETA[p.e]}</td>
                <td>{p.prov ?? "—"}</td>
                <td className="n">{p.canon ?? `${p.tarifa} (tarifa)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Si el plano se cae, la página no se cae con él: se muestra el texto del copy
 * y un botón para reintentar. La leyenda, la nota y la tabla equivalente viven
 * afuera del plano justamente para que la sección siga contando lo mismo.
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
        <figure className="mesa">
          <div className="mesa__stage">
            <div className="plano-error">
              <p>No pudimos dibujar el plano de ejemplo. El resto de la página funciona igual.</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => this.setState((s) => ({ roto: false, intento: s.intento + 1 }))}
              >
                Reintentar
              </button>
            </div>
          </div>
          {/* La leyenda no se cae con el plano: sigue enseñando el idioma de
              adentro aunque el dibujo no esté. */}
          <div className="mesa__foot"><Leyenda /></div>
        </figure>
      );
    }
    return <div key={this.state.intento}>{this.props.children}</div>;
  }
}

export default function PlanoIsometrico() {
  return (
    <>
      <Limite>
        <Plano />
      </Limite>
      {/* La nota y la tabla equivalente viven AFUERA del plano y afuera del
          límite de error: son las que sostienen la sección si el dibujo falla
          y las que hacen que la escena se pueda leer sin verla. */}
      <p className="plano-nota">
        Los datos del plano son inventados, para mostrar cómo se ve. Ningún supermercado real aparece acá.
      </p>
      <TablaEquivalente />
    </>
  );
}
