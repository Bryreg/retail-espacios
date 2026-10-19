import { create } from "zustand";
import { useDistribucionStore } from "../../store/distribucionStore";
import {
  RADIO_DEL_IMAN_PX, TOQUE_PX, enLaCara, esClic, imantar, imantarTraslado, objetivosDelIman,
  type Accion, type EstadoDeEdicion,
} from "../../utils/edicionDeZonas";
import { queHaceElBotonIzquierdo } from "../../utils/edicionEnElMueble";
import { radioEnLaCara } from "../../utils/zonas3d";
import type { Punto } from "../../utils/zonasGeometria";

/**
 * «Editar en el 3D» (fase 2 · I2): el interruptor y el control del puntero.
 * Sin JSX, sin React y sin three: el componente R3F
 * (`EdicionEnElMueble.tsx`, perezoso) arma las `deps` —el rayo de la cámara,
 * el corte con la cara, la proyección a pantalla— y esto lo EJECUTA
 * `probar-distribucion.mjs` con un contenedor y eventos de mentira.
 *
 * (Se llama `punteroEnElMueble.ts` y no `edicionEnElMueble.ts` para no chocar,
 * en un disco que no distingue mayúsculas, con `EdicionEnElMueble.tsx`: el
 * `import("./EdicionEnElMueble")` perezoso resolvería este archivo.)
 *
 * ── Por qué en el DOM y no con eventos de R3F ─────────────────────────────
 *
 * El volumen de toque del mueble queda DELANTE del plano del dibujo y su
 * `onPointerDown` corta la propagación (fijado por una guarda), y
 * OrbitControls escucha en el `<canvas>` antes que R3F (que escucha en el div
 * de afuera, en burbuja). Un oyente en CAPTURA en el contenedor del canvas
 * (`gl.domElement.parentElement`) corre antes que los dos: si el gesto es del
 * dibujo, `stopPropagation()` ahí los deja sin el evento y no hace falta tocar
 * ninguna línea de la escena. Si no lo es («nada»), no se toca el evento: la
 * órbita gira y el clic de siempre elige la zona o cambia de cara.
 *
 * ── Una sola fuente ────────────────────────────────────────────────────────
 *
 * No hay zonas acá: el gesto se traduce a las MISMAS acciones del reductor que
 * usa el lienzo (`despachar`), con el mismo imán (`imantar`,
 * `imantarTraslado`), y el lienzo y el 3D dibujan del store. Lo único local es
 * el gesto en curso y el punto del polígono bajo el puntero (para el
 * punteado).
 */

/* ── El interruptor ────────────────────────────────────────────────────────── */

interface EditarEnEl3D {
  /** «Editar en el 3D»: apagado al entrar, nunca guardado en el navegador. */
  prendido: boolean;
  /** El punto del polígono bajo el puntero en el 3D: el punteado de «cómo va
   *  a quedar». Estado de pantalla, nada comercial. */
  cursor: Punto | null;
  alternar: () => void;
  apagar: () => void;
  ponerCursor: (p: Punto | null) => void;
}

const mismoPunto = (a: Punto | null, b: Punto | null) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);

export const useEditarEnEl3D = create<EditarEnEl3D>()((set) => ({
  prendido: false,
  cursor: null,
  alternar: () => set((s) => ({ prendido: !s.prendido, cursor: null })),
  apagar: () => set((s) => (s.prendido || s.cursor !== null ? { prendido: false, cursor: null } : s)),
  ponerCursor: (p) => set((s) => (mismoPunto(s.cursor, p) ? s : { cursor: p })),
}));

// Se apaga al salir de la cara (salir, Presentar, una reunión, la caminata:
// todo pasa por `salir`), al reiniciar el store (cambio de sesión o de
// cliente), al pasar a otro mueble y al pasar a «Mirar». Cambiar de cara del
// mismo mueble lo deja como estaba.
useDistribucionStore.subscribe((s, antes) => {
  const a = s.activa, b = antes.activa;
  const otroMueble = a !== b && (!a || !b || a.fixtureId !== b.fixtureId || a.sede !== b.sede || a.cliente !== b.cliente);
  if (otroMueble || s.edicion.modo !== "editar") useEditarEnEl3D.getState().apagar();
});

/* ── El control del puntero ────────────────────────────────────────────────── */

type Cara = "A" | "B";
type PuntoDePantalla = { clientX: number; clientY: number };

/** Lo que el control necesita del 3D y del store (lo arma el componente). */
export interface DepsDelControl {
  prendido: () => boolean;
  /** La MISMA expresión que el `puedeEditar` del lienzo (una guarda la fija). */
  puedeEditar: () => boolean;
  caraEditada: () => Cara | null;
  edicion: () => EstadoDeEdicion;
  /** La cara y el punto que toca el rayo del evento (`corteConLaCara`, con
   *  2 cm de tolerancia) y si otro mueble lo tapa (`rayoTapado`); `null` si
   *  no toca ninguna cara. */
  toque: (ev: PuntoDePantalla) => { cara: Cara; u: number; v: number; tapado: boolean } | null;
  /** Dónde corta el rayo del evento el plano de ESA cara, sin recortar
   *  (`uvEnElPlano`): para arrastrar más allá del borde. */
  uvEnLaCara: (ev: PuntoDePantalla, cara: Cara) => Punto | null;
  /** Un punto de la cara en píxeles del cliente (como `clientX`/`clientY`). */
  aPantalla: (cara: Cara, p: Punto) => { x: number; y: number } | null;
  /** Entrepaños y parantes de la cara (el imán a guías, si se pide). */
  guias: (cara: Cara) => { entrepanos: readonly number[]; parantes: readonly number[] };
  /** Siempre `useDistribucionStore.getState().despachar` (nunca `setState`). */
  despachar: (a: Accion) => void;
  ponerCursor?: (p: Punto | null) => void;
  /** Lo que hace el navegador al tocar el canvas (que no es enfocable): el
   *  foco vuelve a `body`, donde las teclas del lienzo andan. */
  soltarFoco?: () => void;
  /** Los movimientos van de a uno por cuadro (por defecto, requestAnimationFrame). */
  pedirCuadro?: (f: () => void) => number;
  soltarCuadro?: (id: number) => void;
}

type Gesto =
  | { tipo: "rectangulo"; id: number; x: number; y: number; cara: Cara }
  | { tipo: "poligono"; id: number; x: number; y: number; cara: Cara }
  | { tipo: "mover"; id: number; x: number; y: number; cara: Cara; clave: string; desde: Punto; activo: boolean };

/**
 * Engancha el control del puntero al contenedor del canvas y devuelve con qué
 * desengancharlo. Sólo el botón izquierdo del mouse o del lápiz (con dos
 * dedos OrbitControls necesita ver los dos: el editor es de escritorio).
 *
 *   · Rectángulo: bajar → `empezarTrazo`; mover → `estirarTrazo` por cuadro;
 *     soltar → `cerrarTrazo` (un clic de menos de 4 px, `cancelarTrazo`).
 *   · Polígono: cada clic → `agregarPunto`; un clic a ≤ 8 px del primero, con
 *     tres puntos o más → `cerrarTrazo`. Un arrastre no hace nada (como en el
 *     lienzo). Enter, Retroceso y Esc ya andan (foco en `body`).
 *   · Mover: bajar → `seleccionar` (si no estaba elegida); pasados 4 px,
 *     `empezarArrastre` una vez y `moverZona` por cuadro, con el imán de la
 *     zona entera; soltar → `terminarArrastre` (un paso de deshacer).
 *   · `pointercancel` / `lostpointercapture`: el rectángulo se cancela y el
 *     arrastre se cierra (como `alCancelar` del lienzo).
 *   · `click` y `dblclick` de un gesto propio se cortan: R3F mediría el clic
 *     contra el `pointerdown` que no vio, y el doble clic movería la mira.
 */
export function conectarEdicionEnElMueble(contenedor: HTMLElement, deps: DepsDelControl): () => void {
  const pedir = deps.pedirCuadro ?? ((f: () => void) => requestAnimationFrame(f));
  const soltarElCuadro = deps.soltarCuadro ?? ((id: number) => cancelAnimationFrame(id));
  const cursorDeAntes = contenedor.style.cursor;
  let gesto: Gesto | null = null;
  /** El último `pointerdown` fue del dibujo: su `click` y su `dblclick` se cortan. */
  let ultimoFueMio = false;
  let pendiente: Accion | null = null;
  let hayCuadro = false;
  let cuadro = 0;
  let cursor: Punto | null = null;

  const programar = (a: Accion) => {
    pendiente = a;
    if (hayCuadro) return;
    hayCuadro = true;
    cuadro = pedir(() => {
      hayCuadro = false;
      const x = pendiente;
      pendiente = null;
      if (x) deps.despachar(x);
    });
  };
  const vaciar = () => {
    if (hayCuadro) { soltarElCuadro(cuadro); hayCuadro = false; }
    const x = pendiente;
    pendiente = null;
    if (x) deps.despachar(x);
  };
  const ponerCursor = (p: Punto | null) => {
    if (mismoPunto(cursor, p)) return;
    cursor = p;
    deps.ponerCursor?.(p);
  };
  const liberar = (id: number) => {
    try { if (contenedor.hasPointerCapture?.(id)) contenedor.releasePointerCapture(id); } catch { /* ya no la tenía */ }
  };

  /** El punto con el imán, si está prendido (a las OTRAS zonas: `excluir`),
   *  con el radio de 6 px medido en la pantalla alrededor del punto. */
  const imantado = (p: Punto, cara: Cara, excluir: string | null): Punto => {
    const e = deps.edicion();
    if (!e.iman) return p;
    const r = radioEnLaCara((q) => deps.aPantalla(cara, q), p, RADIO_DEL_IMAN_PX);
    if (!r) return p;
    const { objetivos, segmentos } = objetivosDelIman(e, excluir, deps.guias(cara));
    return imantar(p, objetivos, segmentos, r);
  };

  const decidir = (ev: PuntoDePantalla & { pointerType: string }, boton: number) => {
    const prendido = deps.prendido(), puedeEditar = deps.puedeEditar();
    const t = prendido && puedeEditar && boton === 0 && ev.pointerType !== "touch" ? deps.toque(ev) : null;
    const d = queHaceElBotonIzquierdo({
      prendido, puedeEditar, boton, tipoDePuntero: ev.pointerType,
      toque: t ? { cara: t.cara, u: t.u, v: t.v } : null, tapado: !!t?.tapado,
      caraEditada: deps.caraEditada(), edicion: deps.edicion(),
    });
    return { d, t };
  };

  /** Cierra un gesto que no terminó con un `pointerup`. */
  const terminar = (g: Gesto) => {
    if (g.tipo === "rectangulo") { pendiente = null; deps.despachar({ tipo: "cancelarTrazo" }); }
    else if (g.tipo === "mover" && g.activo) { vaciar(); deps.despachar({ tipo: "terminarArrastre" }); }
  };

  const bajar = (ev: PointerEvent) => {
    if (gesto) { const g = gesto; gesto = null; terminar(g); }
    const { d, t } = decidir(ev, ev.button);
    if (d.gesto === "nada" || !t) { ultimoFueMio = false; return; }
    ev.stopPropagation();
    ev.preventDefault();
    try { contenedor.setPointerCapture(ev.pointerId); } catch { /* sin captura, el gesto sigue mientras el puntero esté encima */ }
    deps.soltarFoco?.();
    ultimoFueMio = true;
    const base = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, cara: t.cara };
    const p: Punto = [t.u, t.v];
    if (d.gesto === "rectangulo") {
      deps.despachar({ tipo: "empezarTrazo", punto: imantado(p, t.cara, null) });
      gesto = { tipo: "rectangulo", ...base };
      return;
    }
    if (d.gesto === "poligono") { gesto = { tipo: "poligono", ...base }; return; }
    const clave = d.clave ?? "";
    const sel = deps.edicion().seleccion;
    if (!sel || sel.zona !== clave || sel.vertice !== null) deps.despachar({ tipo: "seleccionar", zona: clave });
    // Desde el corte SIN recortar: cerca del borde, el del toque (recortado)
    // haría saltar la zona en el primer movimiento.
    gesto = { tipo: "mover", ...base, clave, desde: deps.uvEnLaCara(ev, t.cara) ?? p, activo: false };
  };

  /** Sin gesto: el cursor (cruz sobre la cara con R o P, «mover» sobre una
   *  zona con V) y el punto del polígono para el punteado. No corta nada. */
  const pasivo = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    const { d } = decidir(ev, 0);
    const c = d.gesto === "rectangulo" || d.gesto === "poligono" ? "crosshair" : d.gesto === "mover" ? "move" : cursorDeAntes;
    if (contenedor.style.cursor !== c) contenedor.style.cursor = c;
    const cara = deps.caraEditada();
    if (d.gesto === "poligono" && cara && deps.edicion().trazo) {
      const q = deps.uvEnLaCara(ev, cara);
      ponerCursor(q ? imantado(enLaCara(q), cara, null) : null);
    } else {
      ponerCursor(null);
    }
  };

  const mover = (ev: PointerEvent) => {
    const g = gesto;
    if (!g) { pasivo(ev); return; }
    ev.stopPropagation();
    const q = deps.uvEnLaCara(ev, g.cara);
    if (g.tipo === "rectangulo") {
      if (q) programar({ tipo: "estirarTrazo", punto: imantado(q, g.cara, null) });
      return;
    }
    if (g.tipo === "poligono") {
      if (deps.edicion().trazo) ponerCursor(q ? imantado(enLaCara(q), g.cara, null) : null);
      return;
    }
    if (!g.activo) {
      if (esClic({ x: g.x, y: g.y }, { x: ev.clientX, y: ev.clientY })) return;
      g.activo = true;
      deps.despachar({ tipo: "empezarArrastre" });
    }
    if (!q) return;
    const { clave, cara, desde } = g;
    let du = q[0] - desde[0], dv = q[1] - desde[1];
    const ed = deps.edicion();
    const z = (ed.arrastre?.antes ?? ed.zonas).find((x) => x.clave === clave);
    if (z && ed.iman) {
      // El imán mueve la zona entera: el punto suyo que caiga más cerca de un
      // objetivo se pega y los demás lo siguen (la cuenta del lienzo).
      const r = radioEnLaCara((p) => deps.aPantalla(cara, p), q, RADIO_DEL_IMAN_PX);
      if (r) {
        const { objetivos, segmentos } = objetivosDelIman(ed, clave, deps.guias(cara));
        [du, dv] = imantarTraslado(z.vertices, du, dv, objetivos, segmentos, r, ed.medidas?.ancho ?? 1, ed.medidas?.alto ?? 1);
      }
    }
    programar({ tipo: "moverZona", clave, du, dv });
  };

  const soltar = (ev: PointerEvent) => {
    const g = gesto;
    if (!g) return;
    gesto = null;
    ev.stopPropagation();
    liberar(ev.pointerId);
    const clic = esClic({ x: g.x, y: g.y }, { x: ev.clientX, y: ev.clientY });
    if (g.tipo === "rectangulo") {
      vaciar();
      deps.despachar(clic ? { tipo: "cancelarTrazo" } : { tipo: "cerrarTrazo" });
      return;
    }
    if (g.tipo === "poligono") {
      if (!clic) return;
      const ed = deps.edicion();
      const primero = ed.trazo?.[0];
      const pp = primero ? deps.aPantalla(g.cara, primero) : null;
      if (ed.trazo && ed.trazo.length >= 3 && pp && Math.hypot(pp.x - ev.clientX, pp.y - ev.clientY) <= TOQUE_PX) {
        deps.despachar({ tipo: "cerrarTrazo" });
        ponerCursor(null);
        return;
      }
      const q = deps.uvEnLaCara(ev, g.cara);
      if (q) deps.despachar({ tipo: "agregarPunto", punto: imantado(q, g.cara, null) });
      return;
    }
    if (g.activo) { vaciar(); deps.despachar({ tipo: "terminarArrastre" }); }
  };

  const cancelar = (ev: PointerEvent) => {
    const g = gesto;
    if (!g) return;
    gesto = null;
    ev.stopPropagation();
    terminar(g);
  };

  const cortarClic = (ev: MouseEvent) => {
    if (ultimoFueMio) ev.stopPropagation();
  };

  contenedor.addEventListener("pointerdown", bajar, { capture: true });
  contenedor.addEventListener("pointermove", mover, { capture: true });
  contenedor.addEventListener("pointerup", soltar, { capture: true });
  contenedor.addEventListener("pointercancel", cancelar, { capture: true });
  contenedor.addEventListener("lostpointercapture", cancelar, { capture: true });
  contenedor.addEventListener("click", cortarClic, { capture: true });
  contenedor.addEventListener("dblclick", cortarClic, { capture: true });

  return () => {
    contenedor.removeEventListener("pointerdown", bajar, { capture: true });
    contenedor.removeEventListener("pointermove", mover, { capture: true });
    contenedor.removeEventListener("pointerup", soltar, { capture: true });
    contenedor.removeEventListener("pointercancel", cancelar, { capture: true });
    contenedor.removeEventListener("lostpointercapture", cancelar, { capture: true });
    contenedor.removeEventListener("click", cortarClic, { capture: true });
    contenedor.removeEventListener("dblclick", cortarClic, { capture: true });
    const g = gesto;
    gesto = null;
    if (g) { liberar(g.id); terminar(g); }
    if (hayCuadro) { soltarElCuadro(cuadro); hayCuadro = false; }
    pendiente = null;
    contenedor.style.cursor = cursorDeAntes;
    ponerCursor(null);
  };
}
