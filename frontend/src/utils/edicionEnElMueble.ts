/**
 * «Editar en el 3D», lo que se decide sin DOM ni three (lo prueba
 * `probar-distribucion.mjs`): qué hace el botón izquierdo sobre el mueble y
 * qué trazo se dibuja punteado sobre la cara.
 *
 * El 3D no tiene estado de zonas: el control del puntero
 * (`components/Distribucion/edicionEnElMueble.ts`) traduce el gesto a las
 * MISMAS acciones del reductor que el lienzo, y el lienzo y el 3D dibujan del
 * store. Por eso sólo tres gestos —Rectángulo, Polígono y mover la zona—: los
 * puntos, las manijas y el doble clic se quedan en el lienzo, que con zoom ×20
 * y sin perspectiva hace mejor el ajuste fino.
 */
import { zonaEnPunto, type EstadoDeEdicion } from "./edicionDeZonas";
import type { Poligono, Punto } from "./zonasGeometria";

/** "nada": no se toca el evento (la órbita gira y el clic de siempre elige
 *  la zona o cambia de cara). */
export type GestoEnElMueble = "nada" | "rectangulo" | "poligono" | "mover";

/**
 * Qué hace un `pointerdown` sobre el 3D con «Editar en el 3D» prendido, en
 * orden:
 *
 *   · apagado, otro botón que el izquierdo, el dedo, o la cara no se puede
 *     editar ahora («Mirar», el plano sin guardar…): nada;
 *   · el rayo no toca la cara que se edita (toca la otra o ninguna) o algo
 *     lo tapa: nada (el clic sigue cambiando de cara, como hoy);
 *   · Rectángulo o Polígono: su gesto;
 *   · Seleccionar sobre una zona: moverla (la elegida gana si se pisan; si no,
 *     la de arriba);
 *   · Seleccionar sobre la cara vacía: nada (gira, y el clic suelta la zona).
 */
export function queHaceElBotonIzquierdo(c: {
  prendido: boolean;
  puedeEditar: boolean;
  boton: number;
  tipoDePuntero: string;
  /** `corteConLaCara` (2 cm de tolerancia), sin el `t`. */
  toque: { cara: "A" | "B"; u: number; v: number } | null;
  /** `rayoTapado`: otro mueble corta el rayo antes que la cara. */
  tapado: boolean;
  caraEditada: "A" | "B" | null;
  edicion: Pick<EstadoDeEdicion, "herramienta" | "zonas" | "seleccion">;
}): { gesto: GestoEnElMueble; clave?: string } {
  if (!c.prendido || c.boton !== 0 || c.tipoDePuntero === "touch" || !c.puedeEditar) return { gesto: "nada" };
  if (!c.toque || c.caraEditada === null || c.toque.cara !== c.caraEditada || c.tapado) return { gesto: "nada" };
  const h = c.edicion.herramienta;
  if (h === "rectangulo") return { gesto: "rectangulo" };
  if (h === "poligono") return { gesto: "poligono" };
  const p: Punto = [c.toque.u, c.toque.v];
  const sel = c.edicion.seleccion;
  const elegida = sel ? c.edicion.zonas.find((z) => z.clave === sel.zona) : undefined;
  const clave = elegida && zonaEnPunto([elegida], p) ? elegida.clave : zonaEnPunto(c.edicion.zonas, p);
  return clave ? { gesto: "mover", clave } : { gesto: "nada" };
}

/**
 * El trazo en curso como se dibuja punteado sobre la cara (en el 3D, también
 * cuando se dibuja en el lienzo): en «Rectángulo», el rectángulo de sus dos
 * esquinas; en «Polígono», los puntos puestos más el cursor (cómo va a
 * quedar). `null` si no hay trazo o tiene menos de dos puntos.
 */
export function trazoParaDibujar(e: Pick<EstadoDeEdicion, "trazo" | "herramienta">, cursor: Punto | null): Poligono | null {
  const t = e.trazo;
  if (!t || t.length === 0) return null;
  if (e.herramienta === "rectangulo") {
    if (t.length < 2) return null;
    const a = t[0], b = t[t.length - 1];
    const u0 = Math.min(a[0], b[0]), u1 = Math.max(a[0], b[0]), v0 = Math.min(a[1], b[1]), v1 = Math.max(a[1], b[1]);
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  }
  if (e.herramienta === "poligono") {
    const puntos: Poligono = t.map(([u, v]) => [u, v] as Punto);
    if (cursor) puntos.push([cursor[0], cursor[1]]);
    return puntos.length >= 2 ? puntos : null;
  }
  return null;
}
