/**
 * El trazo en curso como se ve en el 3D, sin DOM ni three (lo prueba
 * `probar-distribucion.mjs`). Desde el rediseño de Distribuir (2026-10-24) en
 * el 3D ya no se dibuja —«Editar en el 3D» se fue: la zona flotando delante de
 * los estantes y el giro con el botón derecho confundían—; el 3D se mira. Lo
 * que queda es mostrar ahí, punteado, el trazo «A mano» que se está tocando en
 * la cara de frente.
 */
import type { EstadoDeEdicion } from "./edicionDeZonas";
import type { Poligono, Punto } from "./zonasGeometria";

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
