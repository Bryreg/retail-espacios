import { memo, useMemo } from "react";
import * as THREE from "three";
import type { FilasDeProducto, Vano } from "./medidas";
import { ZONA_DE_SLOTS } from "./medidas";
import { acomodar, colorDeRubro, empaqueQueEntra, RETIRO_AL_FRENTE } from "./producto";

/**
 * El producto parado sobre los entrepaños de un mueble.
 *
 * ## Qué decide qué se ve
 *
 * **Lo que está vendido.** Cada slot es un pedazo de cara con un contrato
 * encima: quién lo tomó, hasta cuándo y de qué rubro. Los slots vendidos se
 * llenan de producto; los libres quedan vacíos. No es decoración: mirar la
 * tienda y ver dónde hay mercadería y dónde hay hueco ES el estado comercial,
 * dicho en el idioma en que lo ve quien camina el pasillo.
 *
 * Y es la razón por la que no se rellena el mueble entero «para que se vea
 * lindo». Una tienda pintada llena miente sobre lo único que este sistema
 * tiene que decir.
 *
 * ## Por qué cuenta los frentes de verdad
 *
 * El empaque va a escala real, así que sobre un entrepaño de 1,20 m entran los
 * once frentes de galletas que entran, no los que quedaban prolijos. Ésa es
 * justo la cuenta que discute quien negocia el espacio, y verla dibujada es
 * más útil que cualquier textura.
 *
 * ## Por qué es genérico
 *
 * Nació adentro de la góndola y se sacó afuera al hacer la punta. No porque
 * hubiera dos usos —eso solo no justifica una abstracción— sino porque lo que
 * cambia entre un mueble y otro es SÓLO dónde están las caras: la góndola
 * vende por las dos y la punta por una, la nevera por detrás de un vidrio. El
 * resto —qué empaque, cuántos frentes, a qué altura, hasta dónde llega el
 * contrato— es idéntico y no tiene por qué copiarse a cada mueble nuevo.
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

/**
 * Una cara vendible: dónde se montan sus entrepaños y hacia dónde crecen.
 *
 * Se dan las dos cosas por separado y no un signo solo, porque no siempre
 * coinciden: en la góndola doble cada cara se monta en su lado de la espina y
 * crece hacia afuera, pero en la punta la cara se monta ATRÁS —contra el
 * corrido— y crece hacia adelante. Con un signo único, el producto de la punta
 * aparece detrás del mueble.
 */
export interface CaraDeProducto {
  /** Z del plano donde se cuelgan los entrepaños de esta cara. */
  montaje: number;
  /** Hacia dónde crece el entrepaño desde ese plano. */
  hacia: 1 | -1;
}

export interface ProductoEnMuebleProps {
  /** Ancho total del mueble, para pasar los slots de fracción a metros. */
  anchoTotal: number;
  /** Dónde está cada entrepaño y qué fondo tiene. */
  filas: FilasDeProducto;
  /** Los huecos entre parantes. El producto se para dentro de un vano, nunca
   *  encima de un parante. */
  vanos: Vano[];
  caras: CaraDeProducto[];
  /** Alto de la franja donde viven los slots. */
  franja: number;
  slots?: SlotDeProducto[];
  /**
   * El mueble se vende ENTERO y no por espacios internos.
   *
   * Es el caso de casi todo el catálogo fuera de la góndola y la punta: un
   * exhibidor de cartón, un impulsador o un robatope se contratan completos —
   * la marca compra el mueble, no un estante—. Entonces no hay slots que
   * consultar, y el hueco vacío no dice nada sobre disponibilidad: lo dice el
   * estado del mueble. Se llenan todas las repisas con el rubro del contrato.
   */
  vendidoEntero?: { rubro?: string };
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
/** Y cuántas en un mueble que se contrata completo. Más, porque es chico y se
 *  mira desde todos lados: lo que en una góndola queda tapado por su propio
 *  frente, acá se ve. */
const PROFUNDIDAD_DE_MUEBLE_ENTERO = 5;

interface Pieza {
  clave: string;
  color: string;
  ancho: number; alto: number; fondo: number;
  matrices: THREE.Matrix4[];
}

export const ProductoEnMueble = memo(function ProductoEnMueble({
  anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, ghost = false,
}: ProductoEnMuebleProps) {
  const piezas = useMemo<Pieza[]>(() => {
    // Un mueble que se vende entero es un solo espacio que toma todo el
    // frente. Se arma acá y no en cada mueble para que el camino del producto
    // siga siendo uno: lo que cambia es de dónde sale el contrato, no cómo se
    // acomoda el producto encima.
    const espacios: SlotDeProducto[] = vendidoEntero
      ? [{ id: "todo", x: 0, w: 1, y: 0, h: 1, status: "occupied", brandCategory: vendidoEntero.rubro }]
      : (slots ?? []);
    if (espacios.length === 0 || ghost || filas.rows <= 0) return [];

    const porClave = new Map<string, Pieza>();
    const m = new THREE.Matrix4();

    for (const slot of espacios) {
      if (!VENDIDO.has(slot.status)) continue;

      const color = colorDeRubro(slot.brandCategory);

      // El slot, pasado a metros: qué tramo del ancho toma y qué altura cubre.
      const x0 = slot.x * anchoTotal - anchoTotal / 2;
      const x1 = (slot.x + slot.w) * anchoTotal - anchoTotal / 2;
      const yBajo = ZONA_DE_SLOTS.desde + slot.y * franja;
      const yAlto = ZONA_DE_SLOTS.desde + (slot.y + slot.h) * franja;

      for (let i = 0; i < filas.rows; i++) {
        const apoyo = filas.alturas[i];
        // El entrepaño tiene que caer DENTRO del slot para que su producto
        // sea de este contrato y no del de al lado. En un mueble que se vende
        // entero no hay «el de al lado»: todas las repisas son del mismo
        // contrato, así que la franja no las recorta.
        if (!vendidoEntero && (apoyo < yBajo - 0.001 || apoyo > yAlto + 0.001)) continue;

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
          // Un mueble que se vende entero se llena en profundidad: es chico,
          // se mira desde todos lados y está contratado completo. Con dos
          // filas, un exhibidor de 80 cm de fondo muestra siete centímetros de
          // producto y setenta de estante vacío.
          const fondos = Math.min(
            acomodo.filas, vendidoEntero ? PROFUNDIDAD_DE_MUEBLE_ENTERO : PROFUNDIDAD_VISIBLE,
          );

          const pieza = porClave.get(clave) ?? {
            clave, color, ancho: e.ancho, alto: e.alto, fondo: e.fondo, matrices: [],
          };
          if (!porClave.has(clave)) porClave.set(clave, pieza);

          for (const cara of caras) {
            for (let f = 0; f < acomodo.frentes; f++) {
              for (let p = 0; p < fondos; p++) {
                // Desde el filo del entrepaño hacia adentro: el producto se
                // repone AL FRENTE. Un lineal con el producto pegado al fondo
                // y el filo vacío es lo que un supervisor manda a corregir.
                const desdeElFilo =
                  fondoEntrepano - RETIRO_AL_FRENTE - e.fondo / 2 - p * acomodo.pasoZ;
                pieza.matrices.push(
                  m.clone().setPosition(
                    desdeX + f * acomodo.pasoX,
                    apoyo + e.alto / 2,
                    cara.montaje + cara.hacia * desdeElFilo,
                  ),
                );
              }
            }
          }
        }
      }
    }

    return [...porClave.values()].filter((p) => p.matrices.length > 0);
  }, [anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, ghost]);

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
