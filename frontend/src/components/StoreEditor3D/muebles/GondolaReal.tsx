import { memo, useMemo } from "react";
import {
  ZOCALO, ESPESOR_ESPINA, fondoPorCara, nivelesDeEntrepano, vanosDeCorrido,
} from "./medidas";
import { CaraDeEstanteria, useMateriales } from "./piezas";

/**
 * Una góndola de supermercado armada con las piezas que tiene una de verdad.
 *
 * Lo que la distingue de la anterior, que era una pila de cajas:
 *
 * 1. **Se arma por módulos.** Un corrido de 5 m no es un mueble de 5 m: son
 *    cuatro módulos de 1,25 m atornillados. Los parantes, los paneles, los
 *    entrepaños y los porta-precios se cortan en la junta de módulo, y esas
 *    líneas verticales repetidas son la primera cosa que el ojo usa para
 *    reconocer una góndola desde el otro lado del pasillo.
 * 2. **Dos juegos de entrepaños independientes.** Una góndola doble no es una
 *    tabla profunda con un riel de cada lado: son dos estanterías espalda con
 *    espalda, cada una con su propio fondo, separadas por una espina.
 * 3. **Paneles de fondo ranurados.** Es la superficie más grande del mueble.
 *    Dejarla lisa lo convierte en una pared blanca; con las lamas cada 100 mm
 *    aparece la escala y se lee la profundidad.
 * 4. **Parantes con la cara calada hacia el pasillo**, uno por junta de
 *    módulo, apoyados sobre la base y no clavados en el piso.
 * 5. **Perfil escalonado**: la bandeja de abajo es la más profunda y van
 *    achicándose hacia arriba.
 * 6. **Entrepaños de lámina plegada**, con labio y gancho, no losas macizas.
 * 7. **Base retranqueada** con la muesca donde entran los pies, y **remate
 *    superior** plegado que tapa el canto de arriba.
 *
 * Las cotas salen todas de `medidas.ts`, que son medidas de catálogo. Ninguna
 * se deriva del alto o del ancho del mueble.
 *
 * ## Sistema de coordenadas
 *
 * Todas las piezas de una cara nacen apoyadas en el plano z = 0 y crecen hacia
 * **-Z**, que es el pasillo. La cara que mira a +Z es el mismo subárbol girado
 * media vuelta. Mantener esa convención es lo que permite que entrepaño,
 * panel, parante, porta-precios y remate se monten sin corrimientos a mano.
 */

export interface GondolaRealProps {
  /** Ancho total del corrido, en metros. */
  w: number;
  /** Fondo total del mueble. En la doble se reparte entre las dos caras. */
  d: number;
  /** Alto total. */
  h: number;
  /** `double` vende por las dos caras; `wall` va contra la pared. */
  gondolaType?: "double" | "wall";
  /** Color de estado comercial. Tiñe el zócalo y el porta-precios — NO la
   *  estructura, que tiene que seguir pareciendo metal. */
  statusColor?: string;
  /** Previsualización al colocar: todo translúcido. */
  ghost?: boolean;
}

/* ── El mueble ─────────────────────────────────────────────────────────────*/

export const GondolaReal = memo(function GondolaReal({
  w, d, h, gondolaType = "double", statusColor, ghost = false,
}: GondolaRealProps) {
  const materiales = useMateriales(ghost, statusColor);
  const esMural = gondolaType === "wall";

  // En la doble, el fondo se reparte entre las dos caras y queda la espina en
  // el medio. En el mural, una sola cara usa todo el fondo.
  const espesorEspina = ESPESOR_ESPINA;
  const fondoDeCara = fondoPorCara(d, esMural);

  /** El corrido se parte en módulos de ancho de catálogo. De acá salen los
   *  vanos —los paneles y entrepaños— y, de sus bordes, los parantes. */
  const vanos = useMemo(() => vanosDeCorrido(w), [w]);
  const niveles = useMemo(() => nivelesDeEntrepano(h), [h]);

  // La base es una sola pieza que abraza las dos caras, así que la monta el
  // mueble y no cada cara. Va retranqueada respecto del entrepaño de abajo:
  // ésa es la muesca donde entran los pies de quien está mirando la góndola.
  const fondoBase = esMural
    ? Math.max(0.05, fondoDeCara - ZOCALO.retranqueo)
    : Math.max(0.05, d - ZOCALO.retranqueo * 2);

  return (
    <group>
      {/* ── Base ──────────────────────────────────────────────────────────*/}
      <mesh
        position={[0, ZOCALO.alto / 2, esMural ? -fondoBase / 2 + espesorEspina / 2 : 0]}
        castShadow
        receiveShadow
        material={materiales.zocalo}
      >
        <boxGeometry args={[w, ZOCALO.alto, fondoBase]} />
      </mesh>

      {/* ── Espina central / respaldo ─────────────────────────────────────
          En la doble es la chapa que separa las dos caras. En el mural es el
          respaldo, que va contra la pared. */}
      <mesh
        position={[0, ZOCALO.alto + (h - ZOCALO.alto) / 2, 0]}
        castShadow
        receiveShadow
        material={materiales.panel}
      >
        <boxGeometry args={[w, h - ZOCALO.alto, espesorEspina]} />
      </mesh>

      {/* ── Las caras ─────────────────────────────────────────────────────
          La cara nace mirando a -Z; la de +Z es la misma girada media vuelta.
          Cada una se apoya en su lado de la espina. */}
      <group position={[0, 0, -espesorEspina / 2]}>
        <CaraDeEstanteria
          anchoTotal={w}
          vanos={vanos}
          fondoMaximo={fondoDeCara}
          alto={h}
          niveles={niveles}
          materiales={materiales}
        />
      </group>
      {!esMural && (
        <group position={[0, 0, espesorEspina / 2]} rotation={[0, Math.PI, 0]}>
          <CaraDeEstanteria
            anchoTotal={w}
            vanos={vanos}
            fondoMaximo={fondoDeCara}
            alto={h}
            niveles={niveles}
            materiales={materiales}
          />
        </group>
      )}
    </group>
  );
});
