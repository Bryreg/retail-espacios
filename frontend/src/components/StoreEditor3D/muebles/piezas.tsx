import { memo, useMemo } from "react";
import * as THREE from "three";
import { conLuzDeVenta, useLuzDeVenta, useSoltarMateriales } from "./luzDeVenta";
import {
  PANEL_FONDO, PARANTE, PORTA_PRECIOS, REMATE, ZOCALO,
  inclinacionDeNivel, profundidadDeNivel,
} from "./medidas";
import type { Vano } from "./medidas";
import {
  geometriaEntrepano, geometriaLama, geometriaParante, geometriaPortaPrecios,
  geometriaRanura, geometriaRemate, geometriaRespaldo, alturasDeRanura,
} from "./perfiles";

/**
 * Las piezas con las que se arma cualquier mueble de entrepaños.
 *
 * Nacieron adentro de `GondolaReal` y salieron acá al hacer la punta. El
 * motivo no es que ahora haya dos usos —eso solo no justifica mover nada—
 * sino que un parante, un panel de fondo y un juego de entrepaños son los
 * MISMOS objetos físicos en los dos muebles: una punta de góndola se arma con
 * el mismo herraje que el corrido, y en tienda se compran del mismo catálogo.
 * Copiarlos habría dejado dos definiciones de la misma pieza, que es el error
 * que este trabajo vino a deshacer en otra parte del editor.
 *
 * ## Sistema de coordenadas
 *
 * Toda pieza nace apoyada en el plano z = 0 y crece hacia **-Z**, que es el
 * pasillo. Una cara que mire a +Z es el mismo subárbol girado media vuelta.
 * Mantener esa convención es lo que permite montar entrepaño, panel, parante,
 * porta-precios y remate sin corrimientos a mano.
 */

/* ── Materiales ──────────────────────────────────────────────────────────────
   Una góndola pintada es acero con pintura electrostática, y la pintura es un
   DIELÉCTRICO: metalness ~0, roughness media. Poner metalness alto la vuelve
   un espejo sin nada que reflejar, que es como queda gris plana y muerta.
   Metálico de verdad es sólo la tornillería. */

export function useMateriales(ghost: boolean, statusColor?: string) {
  // En la pantalla de venta, la luz del mismo cuarto que el producto
  // (`luzDeVenta.ts`): sin ella, de frente el acero claro salía grafito al lado
  // de un envase lleno de luz. En el editor, `false`: nada cambia.
  const luz = useLuzDeVenta();
  const m = useMemo(() => {
    // `envMapIntensity` bajo a propósito. El mapa de entorno es lo que le da
    // volumen al acero pintado, pero a intensidad 1 lo lava: la góndola queda
    // blanca sobre blanca y deja de leerse la forma, que es justo lo que se
    // vino a arreglar. A ~0.4 el reflejo se nota y el pliegue del labio
    // conserva su sombra propia. (En la pantalla de venta la luz del cuarto
    // del producto va aparte: `K_ENTORNO_MUEBLE`.)
    const comun = {
      transparent: ghost, opacity: ghost ? 0.42 : 1, envMapIntensity: 0.4,
      ...conLuzDeVenta(luz),
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
  }, [ghost, statusColor, luz]);
  // Cada entrada y salida de Presentar rehace los materiales de cada mueble:
  // los viejos se sueltan (`useSoltarMateriales`).
  useSoltarMateriales(m);
  return m;
}

export type Materiales = ReturnType<typeof useMateriales>;

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
/**
 * Una cara completa: todo lo que se ve parado frente a un lado de un mueble.
 *
 * Recibe los niveles ya calculados en vez de calcularlos. Es lo único que
 * cambia entre una góndola y una punta —la góndola deja aire para su remate,
 * la punta termina contra el copete— y dejarlo afuera es lo que permite que
 * las dos compartan la pieza en vez de tener cada una la suya.
 */
export const CaraDeEstanteria = memo(function CaraDeEstanteria({
  anchoTotal, vanos, fondoMaximo, alto, niveles, materiales, conRemate = true,
}: {
  anchoTotal: number;
  vanos: Vano[];
  fondoMaximo: number;
  /** Alto del mueble hasta donde llega esta cara. */
  alto: number;
  /** Alturas de apoyo de los entrepaños. */
  niveles: number[];
  materiales: Materiales;
  /** La góndola se cierra con un remate plegado; la punta, con su copete. */
  conRemate?: boolean;
}) {
  const altoDePanel = Math.max(0.1, alto - ZOCALO.alto - (conRemate ? REMATE.alto : 0));
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
        // producto se vea desde abajo. La cuenta es la de `medidas.ts`: el
        // producto de prueba que se para encima gira con la misma.
        const giro = inclinacionDeNivel(y, alto);

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
      {conRemate && (
        <mesh
          geometry={geometriaRemate(anchoTotal, REMATE.saliente)}
          material={materiales.estructura}
          position={[0, alto, 0]}
          castShadow
        />
      )}
    </group>
  );
});

/** Los X de los parantes que bordean una lista de vanos. */
export function parantesDeVanos(vanos: Vano[], anchoTotal: number): number[] {
  if (vanos.length === 0) return [-anchoTotal / 2, anchoTotal / 2];
  const fuera = vanos.map((v) => v.x - v.ancho / 2 - PARANTE.ancho / 2);
  const ultimo = vanos[vanos.length - 1];
  fuera.push(ultimo.x + ultimo.ancho / 2 + PARANTE.ancho / 2);
  return fuera;
}

