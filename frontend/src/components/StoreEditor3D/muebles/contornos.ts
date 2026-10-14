import { NEVERA, altoUtilDeNevera, vanosDeTramos } from "./medidas";
import type { GeometriaDeMueble } from "./medidas";
import { ventaDeTipo } from "./venta";

/** El contorno de una parte que se está vendiendo: un rectángulo en el frente
 *  de su cara, en coordenadas del mueble (centro, ancho, alto y la `z` del
 *  frente). */
export interface ContornoDeParte { cx: number; cy: number; ancho: number; alto: number; z: number }

/**
 * Dónde marcar, en el visor de Vender, las partes de una cara que van en el
 * contrato: un tramo (o una puerta), por su vano; un entrepaño, por su fila.
 *
 * `vanos` son los del dibujo DE LA CARA (`vanoEnLaCara`) y `filas` las filas
 * de producto (la base es la 0), como los recibe el producto en prueba: así
 * el contorno y el producto caen en el mismo lugar. El producto de la cara B
 * se dibuja en un grupo girado media vuelta, así que su vano `i` está, en el
 * mueble, en `−x`. Las cuentas son las de `ventaDeTipo`; la nevera de
 * vegetales, que no prueba producto, con las suyas (sus tramos y su interior).
 * Sin partes, ninguno.
 */
export function contornosDeLasPartes(
  type: string, w: number, d: number, h: number, gondolaType: string | undefined,
  geometria: GeometriaDeMueble | undefined, cara: "A" | "B",
  vanosDeLaCara?: readonly number[], filasDeLaCara?: readonly number[],
): ContornoDeParte[] {
  if (!vanosDeLaCara?.length && !filasDeLaCara?.length) return [];
  if (type === "nevera_vegetales") {
    if (cara !== "A" || !vanosDeLaCara?.length || !geometria?.tramos) return [];
    const vanos = vanosDeTramos(w - 2 * NEVERA.chapa - 0.03, geometria.tramos);
    const alto = altoUtilDeNevera(h);
    return vanosDeLaCara.filter((i) => vanos[i]).map((i) => ({
      cx: vanos[i].x, cy: NEVERA.zocalo + alto / 2, ancho: vanos[i].ancho, alto, z: -d / 2 - 0.006,
    }));
  }
  const venta = ventaDeTipo(type, w, d, h, gondolaType, geometria);
  if (!venta) return [];
  const c = cara === "A" ? 0 : 1;
  const laCara = venta.caras[c];
  if (!laCara) return [];
  const { filas, vanos } = venta;
  const fondo = Math.max(...filas.fondos, 0.05);
  const z = laCara.montaje + laCara.hacia * (fondo + 0.006);
  // El producto de la cara B va en un grupo girado: su `x` es −x del mueble.
  const enElMueble = (x: number) => (laCara.hacia === 1 ? -x : x);
  const piso = filas.alturas[0];
  const techo = filas.alturas[filas.rows] ?? filas.alturas[filas.alturas.length - 1];
  const fuera: ContornoDeParte[] = [];
  for (const i of vanosDeLaCara ?? []) {
    const v = vanos[i];
    if (!v) continue;
    fuera.push({ cx: enElMueble(v.x), cy: (piso + techo) / 2, ancho: v.ancho, alto: techo - piso, z });
  }
  if (filasDeLaCara?.length && vanos.length) {
    const x0 = vanos[0].x - vanos[0].ancho / 2;
    const x1 = vanos[vanos.length - 1].x + vanos[vanos.length - 1].ancho / 2;
    for (const i of filasDeLaCara) {
      const y0 = filas.alturas[i];
      const y1 = filas.alturas[i + 1];
      if (y0 === undefined || y1 === undefined) continue;
      fuera.push({ cx: enElMueble((x0 + x1) / 2), cy: (y0 + y1) / 2, ancho: x1 - x0, alto: y1 - y0, z });
    }
  }
  return fuera;
}
