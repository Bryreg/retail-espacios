import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ALTO_CIELO_RASO } from "../../../utils/planta";

/**
 * La sala de la pantalla de venta: los muros y el cielo raso que cierran la
 * tienda en Presentar y en la lámina (`StoreRoom` los dibuja; en el editor no
 * existen). Geometría pura, aparte del editor para poder probarla sin montar
 * la escena.
 *
 * Todo es de UNA cara y mira hacia ADENTRO: desde la órbita alejada —por
 * fuera, o por encima del cielo raso— no se dibuja, y la tienda se ve como
 * una maqueta abierta en vez de una caja cerrada. Nada arroja ni recibe
 * sombra: el mapa de sombras de la tienda y su calibración no se tocan.
 */

/** Lo que hace falta de la planta (`LimitesPlanta`). */
export interface CajaDeSala {
  cx: number; cz: number; w: number; d: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

/**
 * Los cuatro muros como PLANOS que miran hacia adentro, unidos en una
 * geometría (una llamada de dibujo). `adentro` corre cada plano hacia el
 * interior: el zócalo va 1,2 cm delante del muro.
 */
export function geometriaDeMurosDeVenta(l: CajaDeSala, alto: number, adentro = 0): THREE.BufferGeometry {
  const plano = (ancho: number, giro: number, x: number, z: number) => {
    const g = new THREE.PlaneGeometry(ancho, alto);
    g.rotateY(giro);
    g.translate(x, alto / 2, z);
    return g;
  };
  const partes = [
    plano(l.w, 0, l.cx, l.minZ + adentro),               // mira a +Z
    plano(l.w, Math.PI, l.cx, l.maxZ - adentro),         // mira a −Z
    plano(l.d, Math.PI / 2, l.minX + adentro, l.cz),     // mira a +X
    plano(l.d, -Math.PI / 2, l.maxX - adentro, l.cz),    // mira a −X
  ];
  const g = mergeGeometries(partes)!;
  partes.forEach((p) => p.dispose());
  return g;
}

/** El cielo raso: un plano a `ALTO_CIELO_RASO` que mira ABAJO. Desde arriba
 *  (la vista superior, la órbita) no se dibuja. */
export function geometriaDeCieloRaso(l: Pick<CajaDeSala, "cx" | "cz" | "w" | "d">): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(l.w, l.d);
  g.rotateX(Math.PI / 2);
  g.translate(l.cx, ALTO_CIELO_RASO, l.cz);
  return g;
}
