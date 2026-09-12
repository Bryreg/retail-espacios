import { memo, useMemo } from "react";
import * as THREE from "three";
import {
  ENTREPANO, PANEL_FONDO, PARANTE, PORTA_PRECIOS, REMATE, ZOCALO,
  ESPESOR_ESPINA, fondoPorCara, vanosDeCorrido,
  nivelesDeEntrepano, profundidadDeNivel,
} from "./medidas";
import type { Vano } from "./medidas";
import {
  geometriaEntrepano, geometriaLama, geometriaParante, geometriaPortaPrecios,
  geometriaRanura, geometriaRemate, geometriaRespaldo, alturasDeRanura,
} from "./perfiles";

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

/* ── Materiales ──────────────────────────────────────────────────────────────
   Una góndola pintada es acero con pintura electrostática, y la pintura es un
   DIELÉCTRICO: metalness ~0, roughness media. Poner metalness alto la vuelve
   un espejo sin nada que reflejar, que es como queda gris plana y muerta.
   Metálico de verdad es sólo la tornillería. */

function useMateriales(ghost: boolean, statusColor?: string) {
  return useMemo(() => {
    // `envMapIntensity` bajo a propósito. El mapa de entorno es lo que le da
    // volumen al acero pintado, pero a intensidad 1 lo lava: la góndola queda
    // blanca sobre blanca y deja de leerse la forma, que es justo lo que se
    // vino a arreglar. A ~0.4 el reflejo se nota y el pliegue del labio
    // conserva su sombra propia.
    const comun = {
      transparent: ghost, opacity: ghost ? 0.42 : 1, envMapIntensity: 0.4,
    };
    return {
      // Acero con pintura electrostática: dieléctrico, no metal.
      pintado: new THREE.MeshStandardMaterial({
        color: "#c6cac9", metalness: 0.03, roughness: 0.55, ...comun,
      }),
      // El panel de fondo va un punto más oscuro que los entrepaños. En tienda
      // pasa lo mismo: el entrepaño está limpio y a la luz, el fondo está en
      // sombra propia. Ese escalón de valor es lo que despega las bandejas.
      panel: new THREE.MeshStandardMaterial({
        color: "#aeb3b4", metalness: 0.04, roughness: 0.68, ...comun,
      }),
      // El parante viene en un gris bastante más oscuro que los entrepaños, y
      // ese contraste es el que dibuja la estructura contra las bandejas.
      estructura: new THREE.MeshStandardMaterial({
        color: "#8d9499", metalness: 0.12, roughness: 0.45, ...comun,
      }),
      // Los calados se ven oscuros porque son agujeros, no piezas.
      calado: new THREE.MeshStandardMaterial({
        color: "#2f343a", metalness: 0.1, roughness: 0.85, ...comun,
      }),
      // El respaldo que asoma por las ranuras. NO va negro: es chapa pintada
      // en sombra, y lo que la oscurece es la sombra del listón que tiene
      // encima, no el color. Pintarlo negro es lo que convierte el panel en
      // una persiana en vez de un fondo ranurado.
      respaldo: new THREE.MeshStandardMaterial({
        color: "#6f767b", metalness: 0.05, roughness: 0.8, ...comun,
      }),
      // La tira del porta-precios: plástico claro y mate. Va casi blanca a
      // propósito — es el único elemento claro, y por contraste es lo que
      // dice «supermercado» y no «estantería de depósito».
      precios: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#f7f5ef", metalness: 0, roughness: 0.82, ...comun,
      }),
      zocalo: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#767d83", metalness: 0.08, roughness: 0.5, ...comun,
      }),
    };
  }, [ghost, statusColor]);
}

type Materiales = ReturnType<typeof useMateriales>;

/* ── Piezas ────────────────────────────────────────────────────────────────*/

/** Un parante con sus ranuras. Los calados van instanciados: ~80 por columna
 *  en una sola llamada de dibujo. */
const Parante = memo(function Parante({
  alto, materiales,
}: {
  alto: number;
  materiales: Materiales;
}) {
  const ranuras = useMemo(() => alturasDeRanura(alto), [alto]);

  const instancias = useMemo(() => {
    const m = new THREE.Matrix4();
    const fuera: THREE.Matrix4[] = [];
    for (const y of ranuras) {
      // Dos columnas de calados, una por cada ala del perfil en C.
      for (const x of [-PARANTE.ancho * 0.28, PARANTE.ancho * 0.28]) {
        // Justo sobre la cara exterior del perfil, que está en z = -fondo.
        fuera.push(m.clone().setPosition(x, y, -PARANTE.fondo + 0.0018));
      }
    }
    return fuera;
  }, [ranuras]);

  return (
    <group>
      <mesh
        geometry={geometriaParante(alto)}
        material={materiales.estructura}
        castShadow
        receiveShadow
      />
      <instancedMesh
        args={[geometriaRanura(), materiales.calado, instancias.length]}
        ref={(nodo) => {
          if (!nodo) return;
          instancias.forEach((mat, i) => nodo.setMatrixAt(i, mat));
          nodo.instanceMatrix.needsUpdate = true;
        }}
      />
    </group>
  );
});

/** El panel de fondo de un vano: listones horizontales sobre un respaldo.
 *
 *  Es la superficie más grande del mueble, así que es la que decide si el
 *  conjunto se lee como góndola o como pared. Los listones van instanciados:
 *  un vano de 1,60 m lleva unos dieciséis y se dibujan todos de una vez. */
const PanelDeFondo = memo(function PanelDeFondo({
  ancho, alto, materiales,
}: {
  ancho: number;
  alto: number;
  materiales: Materiales;
}) {
  const altoDeLama = PANEL_FONDO.pasoLama - PANEL_FONDO.luz;

  const instancias = useMemo(() => {
    const m = new THREE.Matrix4();
    const fuera: THREE.Matrix4[] = [];
    const paso = PANEL_FONDO.pasoLama;
    // Se centra la tira de listones en el alto disponible, así el vano no
    // termina en un listón cortado por la mitad.
    const cuantos = Math.max(1, Math.floor(alto / paso));
    const sobra = alto - cuantos * paso;
    for (let i = 0; i < cuantos; i++) {
      const y = -alto / 2 + sobra / 2 + paso * (i + 0.5);
      fuera.push(m.clone().setPosition(0, y, -PANEL_FONDO.vuelo));
    }
    return fuera;
  }, [alto]);

  return (
    <group>
      <mesh
        geometry={geometriaRespaldo(ancho, alto)}
        material={materiales.respaldo}
        receiveShadow
      />
      <instancedMesh
        args={[geometriaLama(ancho, altoDeLama), materiales.panel, instancias.length]}
        castShadow
        receiveShadow
        ref={(nodo) => {
          if (!nodo) return;
          instancias.forEach((mat, i) => nodo.setMatrixAt(i, mat));
          nodo.instanceMatrix.needsUpdate = true;
          nodo.computeBoundingSphere();
        }}
      />
    </group>
  );
});

/**
 * Una cara completa: todo lo que se ve parado frente a un lado de la góndola.
 *
 * Nace mirando hacia -Z. La cara opuesta de una doble es este mismo subárbol
 * girado media vuelta por quien lo monta.
 */
const CaraDeEstanteria = memo(function CaraDeEstanteria({
  anchoTotal, vanos, fondoMaximo, alto, materiales,
}: {
  anchoTotal: number;
  vanos: Vano[];
  fondoMaximo: number;
  alto: number;
  materiales: Materiales;
}) {
  const niveles = useMemo(() => nivelesDeEntrepano(alto), [alto]);

  const altoDePanel = Math.max(0.1, alto - ZOCALO.alto - REMATE.alto);
  const centroDePanel = ZOCALO.alto + altoDePanel / 2;

  return (
    <group>
      {/* ── Paneles de fondo, uno por vano ──────────────────────────────── */}
      {vanos.map((v) => (
        <group key={`panel-${v.x.toFixed(3)}`} position={[v.x, centroDePanel, 0]}>
          <PanelDeFondo ancho={v.ancho} alto={altoDePanel} materiales={materiales} />
        </group>
      ))}

      {/* ── Entrepaños, uno por vano y por nivel ────────────────────────── */}
      {niveles.map((y, i) => {
        const fondo = profundidadDeNivel(i, niveles.length, fondoMaximo);
        // Los entrepaños altos se inclinan hacia el cliente para que el
        // producto se vea desde abajo.
        const inclina = y / alto >= ENTREPANO.desdeFraccionDeAlto;
        const giro = inclina ? -ENTREPANO.inclinacion : 0;

        return vanos.map((v) => (
          <group key={`e-${y.toFixed(3)}-${v.x.toFixed(3)}`} position={[v.x, y, 0]}>
            <group rotation={[giro, 0, 0]}>
              <mesh
                geometry={geometriaEntrepano(v.ancho, fondo)}
                material={materiales.pintado}
                castShadow
                receiveShadow
              />
              {/* El porta-precios, montado en el canto del labio — que está
                  en el extremo -Z, que es el frente. */}
              <mesh
                geometry={geometriaPortaPrecios(v.ancho, PORTA_PRECIOS.alto)}
                material={materiales.precios}
                position={[0, -PORTA_PRECIOS.alto / 2, -(fondo + PORTA_PRECIOS.saliente)]}
                castShadow
              />
            </group>
          </group>
        ));
      })}

      {/* ── Parantes, sobre la base y no sobre el piso ──────────────────── */}
      {parantesDeVanos(vanos, anchoTotal).map((x) => (
        <group key={`p-${x.toFixed(3)}`} position={[x, ZOCALO.alto, 0]}>
          <Parante alto={alto - ZOCALO.alto} materiales={materiales} />
        </group>
      ))}

      {/* ── Remate superior ─────────────────────────────────────────────── */}
      <mesh
        geometry={geometriaRemate(anchoTotal, REMATE.saliente)}
        material={materiales.estructura}
        position={[0, alto, 0]}
        castShadow
      />
    </group>
  );
});

/** Los X de los parantes que bordean una lista de vanos. */
function parantesDeVanos(vanos: Vano[], anchoTotal: number): number[] {
  if (vanos.length === 0) return [-anchoTotal / 2, anchoTotal / 2];
  const fuera = vanos.map((v) => v.x - v.ancho / 2 - PARANTE.ancho / 2);
  const ultimo = vanos[vanos.length - 1];
  fuera.push(ultimo.x + ultimo.ancho / 2 + PARANTE.ancho / 2);
  return fuera;
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
            materiales={materiales}
          />
        </group>
      )}
    </group>
  );
});
