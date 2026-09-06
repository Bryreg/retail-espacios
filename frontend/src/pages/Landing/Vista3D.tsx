import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PIEZAS, PISOS, type Estado } from "./datos";

/**
 * «Ver en 3D» — la misma tienda de ejemplo, vista desde abajo.
 *
 * ESTE ARCHIVO ES EL CHUNK PEREZOSO DE LA LANDING. `three` se importa acá y en
 * ningún otro lado de la página; `PlanoIsometrico` lo trae con `React.lazy` +
 * `import()`, así que el bundle inicial de `/` no lleva un solo byte de three.js
 * (la spec lo pide explícitamente: el plano no puede cargar el editor entero).
 *
 * Es una escena MÍNIMA hecha a mano —cajas, dos luces y una cámara que gira—,
 * no `StoreEditor3D`: ese arrastra `@react-three/fiber`, `drei`, el store de
 * muebles y media docena de llamadas a `/api/*`, y la landing es pública.
 */

/** La paleta de los estados, copiada de `landing.css` (§3.3 de diseno.md). */
const PALETA: Record<"claro" | "oscuro", Record<Estado, string> & { piso: string; fondo: string }> = {
  claro: {
    libre: "#1BA97B",
    libera: "#F0A63C",
    tomado: "#D6394F",
    resto: "#CFC9BC",
    piso: "#EBE6DB",
    fondo: "#F2EEE5",
  },
  oscuro: {
    libre: "#2FBE8B",
    libera: "#E7AE4E",
    tomado: "#EE6A7B",
    resto: "#4E5560",
    piso: "#1A1F27",
    fondo: "#0F1218",
  },
};

interface Props {
  /** El navegador no puede con WebGL: la landing vuelve al plano y lo dice. */
  onSinSoporte: () => void;
  onVolver: () => void;
}

export default function Vista3D({ onSinSoporte, onVolver }: Props) {
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;

    const tema = (caja.closest("[data-lp-tema]") as HTMLElement | null)?.dataset.lpTema === "oscuro"
      ? "oscuro" : "claro";
    const paleta = PALETA[tema];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      // Un contexto que no se crea tira acá; algunos navegadores devuelven
      // un renderer sin contexto en vez de tirar, así que se comprueba.
      if (!renderer.getContext()) throw new Error("sin contexto");
    } catch {
      onSinSoporte();
      return;
    }

    const ancho = () => caja.clientWidth || 640;
    const alto = () => caja.clientHeight || 400;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(ancho(), alto(), false);
    renderer.setClearColor(new THREE.Color(paleta.fondo), 1);
    caja.appendChild(renderer.domElement);

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(38, ancho() / alto(), 0.5, 500);

    escena.add(new THREE.HemisphereLight(0xffffff, 0x404450, 1.15));
    const sol = new THREE.DirectionalLight(0xffffff, 1.05);
    sol.position.set(-18, 26, 14);
    escena.add(sol);

    /* El centro de la escena: la sede CENTRO. La cámara gira alrededor de acá. */
    const foco = new THREE.Vector3(15, 1, 10);

    const basura: Array<THREE.BufferGeometry | THREE.Material> = [];

    /* Pisos */
    PISOS.forEach((s) => {
      const g = new THREE.BoxGeometry(s.w, 0.12, s.d);
      const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(paleta.piso) });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(s.x + s.w / 2, -0.06, s.y + s.d / 2);
      escena.add(mesh);
      basura.push(g, m);
    });

    /* Muebles: lo alquilable, entero; el contexto, apagado y traslúcido, para
       que se lea lo mismo que en el plano — el color es lo que se vende. */
    PIEZAS.forEach((p) => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      const alq = p.e !== "resto";
      const m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(paleta[p.e]),
        transparent: !alq,
        opacity: alq ? 1 : 0.42,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(p.x + p.w / 2, p.h / 2, p.y + p.d / 2);
      escena.add(mesh);
      const bordes = new THREE.EdgesGeometry(g);
      const lm = new THREE.LineBasicMaterial({
        color: new THREE.Color(tema === "oscuro" ? 0x0b0e13 : 0x1a1c22),
        transparent: true,
        opacity: alq ? 0.35 : 0.15,
      });
      const linea = new THREE.LineSegments(bordes, lm);
      linea.position.copy(mesh.position);
      escena.add(linea);
      basura.push(g, m, bordes, lm);
    });

    /* Cámara orbital hecha a mano: sin OrbitControls, sin dependencias nuevas. */
    let az = -0.72;      // acimut
    let el = 0.52;       // elevación
    let dist = 46;
    const colocar = () => {
      camara.position.set(
        foco.x + dist * Math.cos(el) * Math.cos(az),
        foco.y + dist * Math.sin(el),
        foco.z + dist * Math.cos(el) * Math.sin(az),
      );
      camara.lookAt(foco);
    };

    let pendiente = false;
    const pintar = () => {
      pendiente = false;
      renderer.render(escena, camara);
    };
    /* Se pinta a pedido, no en un bucle: quieta, la escena no gasta un frame.
       Eso vale para la batería del celular y para `prefers-reduced-motion`. */
    const pedirPintado = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(pintar);
    };

    colocar();
    pintar();
    setListo(true);

    /* ── gestos ─────────────────────────────────────────────────────────── */
    const lienzo = renderer.domElement;
    const punteros = new Map<number, { x: number; y: number }>();
    let pinza: { d: number; dist: number } | null = null;

    const alBajar = (ev: PointerEvent) => {
      lienzo.setPointerCapture(ev.pointerId);
      punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (punteros.size === 2) {
        const v = Array.from(punteros.values());
        pinza = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), dist };
      }
      caja.classList.add("dragging");
    };
    const alMover = (ev: PointerEvent) => {
      const prev = punteros.get(ev.pointerId);
      if (!prev) return;
      punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinza && punteros.size === 2) {
        const v = Array.from(punteros.values());
        const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
        dist = Math.min(110, Math.max(14, pinza.dist * (pinza.d / Math.max(1, d))));
        colocar();
        pedirPintado();
        return;
      }
      az -= (ev.clientX - prev.x) * 0.006;
      el = Math.min(1.35, Math.max(0.08, el + (ev.clientY - prev.y) * 0.005));
      colocar();
      pedirPintado();
    };
    const alSoltar = (ev: PointerEvent) => {
      punteros.delete(ev.pointerId);
      if (punteros.size < 2) pinza = null;
      if (punteros.size === 0) caja.classList.remove("dragging");
    };
    const alRodar = (ev: WheelEvent) => {
      ev.preventDefault();
      dist = Math.min(110, Math.max(14, dist * (ev.deltaY < 0 ? 1 / 1.12 : 1.12)));
      colocar();
      pedirPintado();
    };
    const alTeclear = (ev: KeyboardEvent) => {
      let usado = true;
      switch (ev.key) {
        case "ArrowLeft": az -= 0.12; break;
        case "ArrowRight": az += 0.12; break;
        case "ArrowUp": el = Math.min(1.35, el + 0.08); break;
        case "ArrowDown": el = Math.max(0.08, el - 0.08); break;
        case "+": case "=": dist = Math.max(14, dist / 1.12); break;
        case "-": case "_": dist = Math.min(110, dist * 1.12); break;
        case "Escape": onVolver(); return;
        default: usado = false;
      }
      if (usado) {
        ev.preventDefault();
        colocar();
        pedirPintado();
      }
    };

    lienzo.addEventListener("pointerdown", alBajar);
    lienzo.addEventListener("pointermove", alMover);
    lienzo.addEventListener("pointerup", alSoltar);
    lienzo.addEventListener("pointercancel", alSoltar);
    lienzo.addEventListener("wheel", alRodar, { passive: false });
    caja.addEventListener("keydown", alTeclear);

    const ro = new ResizeObserver(() => {
      renderer.setSize(ancho(), alto(), false);
      camara.aspect = ancho() / Math.max(1, alto());
      camara.updateProjectionMatrix();
      pedirPintado();
    });
    ro.observe(caja);

    /* El contexto se puede perder (pestaña de fondo, GPU ocupada). Si pasa, la
       landing vuelve al plano en vez de dejar un rectángulo negro. */
    const alPerderContexto = (ev: Event) => {
      ev.preventDefault();
      onSinSoporte();
    };
    lienzo.addEventListener("webglcontextlost", alPerderContexto);

    return () => {
      ro.disconnect();
      lienzo.removeEventListener("pointerdown", alBajar);
      lienzo.removeEventListener("pointermove", alMover);
      lienzo.removeEventListener("pointerup", alSoltar);
      lienzo.removeEventListener("pointercancel", alSoltar);
      lienzo.removeEventListener("wheel", alRodar);
      lienzo.removeEventListener("webglcontextlost", alPerderContexto);
      caja.removeEventListener("keydown", alTeclear);
      basura.forEach((b) => b.dispose());
      renderer.dispose();
      if (lienzo.parentNode === caja) caja.removeChild(lienzo);
    };
  }, [onSinSoporte, onVolver]);

  return (
    <div
      className="escena3d"
      ref={cajaRef}
      tabIndex={0}
      role="group"
      aria-label="Vista 3D del supermercado de ejemplo. Arrastrá o usá las flechas para girar la cámara, + y − para acercar, Esc para volver al plano."
    >
      <p className="escena3d__pie">
        {listo ? "Sede CENTRO · vista 3D de ejemplo" : "Cargando la vista 3D…"}
      </p>
    </div>
  );
}
