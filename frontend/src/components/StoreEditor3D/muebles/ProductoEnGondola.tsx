import { memo, useMemo } from "react";
import * as THREE from "three";
import {
  ESPESOR_ESPINA, ZONA_DE_SLOTS, PARANTE,
  altoDeZonaDeSlots, filasDeProducto, fondoPorCara, vanosDeCorrido,
} from "./medidas";
import { acomodar, colorDeRubro, empaqueQueEntra, RETIRO_AL_FRENTE } from "./producto";

/**
 * El producto parado sobre los entrepaños de una góndola.
 *
 * ## Qué decide qué se ve
 *
 * **Lo que está vendido.** Cada slot es un pedazo de cara con un contrato
 * encima: quién lo tomó, hasta cuándo y de qué rubro. Los slots vendidos se
 * llenan de producto; los libres quedan vacíos. No es decoración: mirar la
 * tienda y ver dónde hay mercadería y dónde hay hueco ES el estado comercial,
 * dicho en el idioma en que lo ve quien camina el pasillo.
 *
 * Y es la razón por la que no se rellena la góndola entera «para que se vea
 * linda». Una tienda pintada llena miente sobre lo único que este sistema
 * tiene que decir.
 *
 * ## Por qué cuenta los frentes de verdad
 *
 * El empaque va a escala real, así que sobre un entrepaño de 1,20 m entran los
 * once frentes de galletas que entran, no los que quedaban prolijos. Ésa es
 * justo la cuenta que discute quien negocia el espacio, y verla dibujada es
 * más útil que cualquier textura.
 *
 * ## Sistema de coordenadas
 *
 * Todo en el espacio local del mueble, igual que `GondolaReal`: X a lo ancho
 * desde el centro, Y desde el piso, Z el fondo. La cara que mira a -Z y la que
 * mira a +Z se resuelven con un signo, no con dos subárboles.
 */

/** Lo que hace falta de un slot. Se declara acá y no se importa `ShelfSlot`
 *  entero para que este archivo siga siendo geometría y no dependa del modelo
 *  comercial del editor. */
export interface SlotDeProducto {
  id: string;
  /** Fracción del ancho del mueble, de 0 a 1, desde la punta izquierda. */
  x: number;
  w: number;
  /** Fracción de la franja de slots, de 0 a 1, desde abajo. */
  y: number;
  h: number;
  status: string;
  brandCategory?: string;
}

export interface ProductoEnGondolaProps {
  w: number;
  d: number;
  h: number;
  esMural: boolean;
  slots?: SlotDeProducto[];
  ghost?: boolean;
}

/** Un espacio con contrato encima. `reserved` también: está comprometido, y
 *  quien mira el plano necesita verlo tomado. */
const VENDIDO = new Set(["occupied", "reserved"]);

/** Cuántas unidades se ponen hacia el fondo detrás de cada frente.
 *
 *  En tienda hay las que quepan, pero desde afuera sólo se ve la primera: las
 *  de atrás quedan tapadas por su propio frente. Se ponen dos porque desde
 *  arriba —que es como se mira el plano la mayor parte del tiempo— una sola
 *  deja el entrepaño con aire raro, y la tercera ya no se ve desde ningún
 *  lado y sólo cuesta instancias. */
const PROFUNDIDAD_VISIBLE = 2;

interface Pieza {
  clave: string;
  color: string;
  ancho: number; alto: number; fondo: number;
  matrices: THREE.Matrix4[];
}

export const ProductoEnGondola = memo(function ProductoEnGondola({
  w, d, h, esMural, slots, ghost = false,
}: ProductoEnGondolaProps) {
  const piezas = useMemo<Pieza[]>(() => {
    if (!slots || slots.length === 0 || ghost) return [];

    const fondoCara = fondoPorCara(d, esMural);
    const filas = filasDeProducto(h, fondoCara);
    if (filas.rows <= 0) return [];
    const vanos = vanosDeCorrido(w);
    const franja = altoDeZonaDeSlots(h);
    const caras: (1 | -1)[] = esMural ? [-1] : [-1, 1];

    const porClave = new Map<string, Pieza>();
    const m = new THREE.Matrix4();

    for (const slot of slots) {
      if (!VENDIDO.has(slot.status)) continue;

      const color = colorDeRubro(slot.brandCategory);

      // El slot, pasado a metros: qué tramo del ancho toma y qué altura cubre.
      const x0 = slot.x * w - w / 2;
      const x1 = (slot.x + slot.w) * w - w / 2;
      const yBajo = ZONA_DE_SLOTS.desde + slot.y * franja;
      const yAlto = ZONA_DE_SLOTS.desde + (slot.y + slot.h) * franja;

      for (let i = 0; i < filas.rows; i++) {
        const apoyo = filas.alturas[i];
        // El entrepaño tiene que caer DENTRO del slot para que su producto
        // sea de este contrato y no del de al lado.
        if (apoyo < yBajo - 0.001 || apoyo > yAlto + 0.001) continue;

        const libre = filas.alturas[i + 1] - apoyo;
        const fondoEntrepano = filas.fondos[i];
        // El formato se elige POR ENTREPAÑO: la botella de 1,5 L entra abajo y
        // arriba va la personal, igual que en tienda.
        const e = empaqueQueEntra(slot.brandCategory, libre);
        if (!e) continue;
        const clave = `${e.ancho}|${e.alto}|${e.fondo}|${color}`;

        for (const vano of vanos) {
          // El producto se para dentro del vano, nunca encima de un parante.
          const vx0 = Math.max(x0, vano.x - vano.ancho / 2);
          const vx1 = Math.min(x1, vano.x + vano.ancho / 2);
          const util = vx1 - vx0;
          if (util <= 0) continue;

          const acomodo = acomodar(util, fondoEntrepano, libre, e);
          if (acomodo.frentes === 0) continue;

          // Centrado en el tramo, que es como se repone: el hueco sobrante se
          // reparte a los costados y no queda todo de un lado.
          const desdeX = (vx0 + vx1) / 2 - acomodo.ocupado / 2 + e.ancho / 2;
          const fondos = Math.min(acomodo.filas, PROFUNDIDAD_VISIBLE);

          const pieza = porClave.get(clave) ?? {
            clave, color, ancho: e.ancho, alto: e.alto, fondo: e.fondo, matrices: [],
          };
          if (!porClave.has(clave)) porClave.set(clave, pieza);

          for (const cara of caras) {
            // El filo del entrepaño de esta cara, y hacia adentro desde ahí.
            const filo = ESPESOR_ESPINA / 2 + fondoEntrepano;
            for (let f = 0; f < acomodo.frentes; f++) {
              for (let p = 0; p < fondos; p++) {
                const z = cara * (filo - RETIRO_AL_FRENTE - e.fondo / 2 - p * acomodo.pasoZ);
                pieza.matrices.push(
                  m.clone().setPosition(
                    desdeX + f * acomodo.pasoX,
                    apoyo + e.alto / 2,
                    z,
                  ),
                );
              }
            }
          }
        }
      }
    }

    return [...porClave.values()].filter((p) => p.matrices.length > 0);
  }, [w, d, h, esMural, slots, ghost]);

  if (piezas.length === 0) return null;

  return (
    <group>
      {piezas.map((p) => (
        <InstanciasDeEmpaque key={p.clave} pieza={p} />
      ))}
    </group>
  );
});

/** Un empaque repetido. Un pasillo entero de gaseosas son cientos de botellas
 *  y una sola llamada de dibujo. */
function InstanciasDeEmpaque({ pieza }: { pieza: Pieza }) {
  const geometria = useMemo(
    () => new THREE.BoxGeometry(pieza.ancho, pieza.alto, pieza.fondo),
    [pieza.ancho, pieza.alto, pieza.fondo],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: pieza.color,
      // Cartón y plástico impreso: mate, nada de metal. Un envase brillante
      // devuelve el reflejo del entorno y todo el lineal se lee como vidrio.
      metalness: 0,
      roughness: 0.72,
      // Y con poco entorno: a intensidad 1 el mapa lava los colores hasta
      // dejarlos pastel, y el lineal pierde justo lo que lo hace legible, que
      // es que cada rubro sea un bloque de color distinto.
      envMapIntensity: 0.25,
    }),
    [pieza.color],
  );

  return (
    <instancedMesh
      args={[geometria, material, pieza.matrices.length]}
      castShadow
      receiveShadow
      ref={(nodo) => {
        if (!nodo) return;
        pieza.matrices.forEach((mat, i) => nodo.setMatrixAt(i, mat));
        nodo.instanceMatrix.needsUpdate = true;
        nodo.computeBoundingSphere();
      }}
    />
  );
}

/** El ancho útil de un corrido, descontando los parantes de las puntas. Lo usa
 *  quien necesita saber cuánto frente hay realmente para vender. */
export function anchoUtilDeCorrido(w: number): number {
  return Math.max(0, w - PARANTE.ancho * 2);
}
