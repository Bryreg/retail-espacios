import { memo, useMemo } from "react";
import * as THREE from "three";
import { BRILLO, conLuzDeVenta, K_ENTORNO_MUEBLE, useLuzDeVenta, useSoltarMateriales } from "./luzDeVenta";
import { useAtenuacion } from "./atenuacion";
import {
  PANEL_FONDO, PARANTE, PORTA_PRECIOS, REMATE, ZOCALO,
  inclinacionDeNivel, profundidadDeNivel,
} from "./medidas";
import type { Vano } from "./medidas";
import { pintarHabladoresGenericos, TRAMO_GENERICO } from "./habladores";
import {
  geometriaEntrepano, geometriaEntrepanoDeVenta, geometriaLama, geometriaParante, geometriaPortaPrecios,
  geometriaRanura, geometriaRemate, geometriaRespaldo, alturasDeRanura, sombraDeListon,
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
    // Cada material con SUS uniformes de venta (`conLuzDeVenta` arma unos
    // nuevos por llamada) y cuánto toma del brillo de las luminarias: el acero
    // pintado más que el plástico mate del porta-precios.
    const comun = (brillo: number) => ({
      transparent: ghost, opacity: ghost ? 0.42 : 1, envMapIntensity: 0.4,
      ...conLuzDeVenta(luz, K_ENTORNO_MUEBLE, brillo),
    });
    return {
      // Acero con pintura electrostática: dieléctrico, no metal.
      pintado: new THREE.MeshStandardMaterial({
        color: "#c6cac9", metalness: 0.03, roughness: 0.55, ...comun(BRILLO.pintado),
      }),
      // El panel de fondo va un punto más oscuro que los entrepaños. En tienda
      // pasa lo mismo: el entrepaño está limpio y a la luz, el fondo está en
      // sombra propia. Ese escalón de valor es lo que despega las bandejas.
      panel: new THREE.MeshStandardMaterial({
        color: "#aeb3b4", metalness: 0.04, roughness: 0.68, ...comun(BRILLO.panel),
      }),
      // El parante viene en un gris bastante más oscuro que los entrepaños, y
      // ese contraste es el que dibuja la estructura contra las bandejas.
      estructura: new THREE.MeshStandardMaterial({
        color: "#8d9499", metalness: 0.12, roughness: 0.45, ...comun(BRILLO.estructura),
      }),
      // Los calados se ven oscuros porque son agujeros, no piezas.
      calado: new THREE.MeshStandardMaterial({
        color: "#2f343a", metalness: 0.1, roughness: 0.85, ...comun(0),
      }),
      // El respaldo que asoma por las ranuras. NO va negro: es chapa pintada
      // en sombra, y lo que la oscurece es la sombra del listón que tiene
      // encima, no el color. Pintarlo negro es lo que convierte el panel en
      // una persiana en vez de un fondo ranurado.
      respaldo: new THREE.MeshStandardMaterial({
        color: "#6f767b", metalness: 0.05, roughness: 0.8, ...comun(BRILLO.panel),
      }),
      // La tira del porta-precios: plástico claro y mate. Va casi blanca a
      // propósito — es el único elemento claro, y por contraste es lo que
      // dice «supermercado» y no «estantería de depósito».
      precios: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#f7f5ef", metalness: 0, roughness: 0.82, ...comun(BRILLO.precios),
      }),
      zocalo: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#767d83", metalness: 0.08, roughness: 0.5, ...comun(BRILLO.zocalo),
      }),
      // Sólo en la pantalla de venta: el pintado con la sombra de las uniones
      // como color de vértice (`geometriaEntrepanoDeVenta`). Lo usan SÓLO los
      // entrepaños, que son los que traen el atributo: con `vertexColors` y
      // sin él, una pieza sale negra (la tapa de la punta, la espina siguen
      // con `pintado`). Su existencia es también lo que le dice a la cara que
      // está en venta.
      pintadoAO: luz && !ghost ? new THREE.MeshStandardMaterial({
        color: "#c6cac9", metalness: 0.03, roughness: 0.55, vertexColors: true, ...comun(BRILLO.pintado),
      }) : null,
      // Sólo en venta: la misma tira con los habladores GENÉRICOS de lo vendido
      // a otros (sin texto). La usan los (vano, entrepaño) que el relleno
      // cubre (`tramosConRelleno`); el resto, la tira lisa de siempre.
      preciosConHabladores: luz && !ghost ? new THREE.MeshStandardMaterial({
        color: "#ffffff", map: texturaDeHabladoresGenericos(), metalness: 0, roughness: 0.82, ...comun(BRILLO.precios),
      }) : null,
    };
  }, [ghost, statusColor, luz]);
  // Cada entrada y salida de Presentar rehace los materiales de cada mueble:
  // los viejos se sueltan (`useSoltarMateriales`).
  useSoltarMateriales(m);
  // Un vecino del mueble que se muestra, con menos luz (sin rehacerlos).
  useAtenuacion(Object.values(m));
  return m;
}

export type Materiales = ReturnType<typeof useMateriales>;

let genericos: THREE.CanvasTexture | null = null;
/** La textura de los habladores genéricos, UNA para toda la tienda: un tramo
 *  de 35 cm de tira con una etiqueta (`pintarHabladoresGenericos`), repetido
 *  a lo ancho por la UV en metros de `geometriaPortaPrecios`. */
function texturaDeHabladoresGenericos(): THREE.CanvasTexture {
  if (genericos) return genericos;
  const c = document.createElement("canvas");
  // 64 de alto: la etiqueta ocupa sólo lo que se ve de la tira (menos de la
  // mitad, `VENTANA_DE_LA_TIRA`), y con 32 la franja amarilla eran 3 filas.
  c.width = 256; c.height = 64;
  pintarHabladoresGenericos(c.getContext("2d")!, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / TRAMO_GENERICO, 1);
  t.anisotropy = 8;
  return (genericos = t);
}

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
  ancho, alto, materiales, cerrado = true, niveles,
}: {
  ancho: number;
  alto: number;
  materiales: Materiales;
  /** El respaldo como caja (con lomo) o como una cara sola: ver
   *  `geometriaRespaldo`. */
  cerrado?: boolean;
  /** Sólo en la pantalla de venta: los entrepaños en las coordenadas del
   *  panel. Cada listón se oscurece según dónde queda respecto de ellos
   *  (`sombraDeListon`): la sombra del entrepaño sobre el fondo y la unión. */
  niveles?: readonly number[];
}) {
  const altoDeLama = PANEL_FONDO.pasoLama - PANEL_FONDO.luz;

  const instancias = useMemo(() => {
    const m = new THREE.Matrix4();
    const fuera: { matriz: THREE.Matrix4; y: number }[] = [];
    const paso = PANEL_FONDO.pasoLama;
    // Se centra la tira de listones en el alto disponible, así el vano no
    // termina en un listón cortado por la mitad.
    const cuantos = Math.max(1, Math.floor(alto / paso));
    const sobra = alto - cuantos * paso;
    for (let i = 0; i < cuantos; i++) {
      const y = -alto / 2 + sobra / 2 + paso * (i + 0.5);
      fuera.push({ matriz: m.clone().setPosition(0, y, -PANEL_FONDO.vuelo), y });
    }
    return fuera;
  }, [alto]);
  const claveNiveles = niveles?.map((y) => y.toFixed(4)).join(",") ?? "";
  // La sombra va por `instanceColor` (three multiplica el color del material
  // por el de la instancia sin cambiar de material: el panel sigue siendo
  // `materiales.panel`, el mismo de la espina). Sin niveles —el editor, el
  // taller— no se llama `setColorAt` y la malla no tiene `instanceColor`.
  const sombras = useMemo(
    () => (niveles ? instancias.map(({ y }) => sombraDeListon(y, altoDeLama, PANEL_FONDO.pasoLama, niveles)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instancias, claveNiveles, altoDeLama],
  );

  return (
    <group>
      <mesh
        geometry={geometriaRespaldo(ancho, alto, cerrado)}
        material={materiales.respaldo}
        receiveShadow
      />
      <instancedMesh
        // Con y sin sombra son mallas distintas: un `instanceColor` puesto
        // una vez no se saca, y el editor tiene que volver a ser el de siempre.
        key={sombras ? "venta" : "editor"}
        args={[geometriaLama(ancho, altoDeLama), materiales.panel, instancias.length]}
        castShadow
        receiveShadow
        ref={(nodo) => {
          if (!nodo) return;
          instancias.forEach(({ matriz }, i) => nodo.setMatrixAt(i, matriz));
          nodo.instanceMatrix.needsUpdate = true;
          if (sombras) {
            const c = new THREE.Color();
            sombras.forEach((k, i) => nodo.setColorAt(i, c.setScalar(k)));
            if (nodo.instanceColor) nodo.instanceColor.needsUpdate = true;
          }
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
  anchoTotal, vanos, fondoMaximo, alto, niveles, materiales, conRemate = true, respaldoCerrado = true, habladores,
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
  /** El respaldo con lomo (la punta: de atrás no hay nada más) o una cara
   *  sola (la góndola, que tiene la espina detrás). Ver `geometriaRespaldo`. */
  respaldoCerrado?: boolean;
  /** Sólo en venta: los (entrepaño, vano) —`${i}|${vano}`— cuya tira lleva
   *  habladores genéricos (`tramosConRelleno`). */
  habladores?: ReadonlySet<string> | null;
}) {
  const altoDePanel = Math.max(0.1, alto - ZOCALO.alto - (conRemate ? REMATE.alto : 0));
  const centroDePanel = ZOCALO.alto + altoDePanel / 2;
  // En la pantalla de venta (`pintadoAO` existe sólo ahí): la sombra de las
  // uniones, en los listones del fondo y en los entrepaños.
  const enVenta = materiales.pintadoAO != null;
  const nivelesDelPanel = useMemo(() => niveles.map((y) => y - centroDePanel), [niveles, centroDePanel]);

  return (
    <group>
      {/* ── Paneles de fondo, uno por vano ──────────────────────────────── */}
      {vanos.map((v) => (
        <group key={`panel-${v.x.toFixed(3)}`} position={[v.x, centroDePanel, 0]}>
          <PanelDeFondo ancho={v.ancho} alto={altoDePanel} materiales={materiales} cerrado={respaldoCerrado}
            niveles={enVenta ? nivelesDelPanel : undefined} />
        </group>
      ))}

      {/* ── Entrepaños, uno por vano y por nivel ────────────────────────── */}
      {niveles.map((y, i) => {
        const fondo = profundidadDeNivel(i, niveles.length, fondoMaximo);
        // Los entrepaños altos se inclinan hacia el cliente para que el
        // producto se vea desde abajo. La cuenta es la de `medidas.ts`: el
        // producto de prueba que se para encima gira con la misma.
        const giro = inclinacionDeNivel(y, alto);

        return vanos.map((v, vi) => (
          <group key={`e-${y.toFixed(3)}-${v.x.toFixed(3)}`} position={[v.x, y, 0]}>
            <group rotation={[giro, 0, 0]}>
              <mesh
                geometry={enVenta ? geometriaEntrepanoDeVenta(v.ancho, fondo) : geometriaEntrepano(v.ancho, fondo)}
                material={materiales.pintadoAO ?? materiales.pintado}
                castShadow
                receiveShadow
              />
              {/* El porta-precios, montado en el canto del labio — que está
                  en el extremo -Z, que es el frente. */}
              <mesh
                geometry={geometriaPortaPrecios(v.ancho, PORTA_PRECIOS.alto)}
                material={materiales.preciosConHabladores && habladores?.has(`${i}|${vi}`)
                  ? materiales.preciosConHabladores : materiales.precios}
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

