import { memo, useContext, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { VendidoEntero } from "./frentes";
import type { FilasDeProducto, Vano } from "./medidas";
import type { FormaDeEmpaque } from "./producto";
import { geometriaDeEmpaque } from "./perfiles";
import { claveDeCubiertas, rellenoPorRubro } from "./frentes";
import {
  CLAVE_DE_RELLENO, colorConDiseno, coloresDelRelleno, EXPOSICION_DEL_RELLENO_VECINO, PALETAS, parcheDeRellenoDeVenta, texturaDeEtiquetaDeRelleno,
} from "./rellenoDeVenta";
import type { Cubiertas, SlotDeProducto } from "./frentes";
import { BRILLO, conLuzDeVenta, K_ENTORNO_MUEBLE, RellenoNeutro, useLuzDeVenta } from "./luzDeVenta";
import { tramosConRelleno } from "./habladores";
import { useAtenuacion } from "./atenuacion";
import type { VentaDeMueble } from "./medidas";

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

/** El slot y lo que cuenta como vendido viven en `frentes.ts`, que es la
 *  cuenta pura; se re-exportan para quien ya los tomaba de acá. */
export type { SlotDeProducto } from "./frentes";
export { VENDIDO } from "./frentes";

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
  vendidoEntero?: VendidoEntero;
  /** Los entrepaños que tapa la prueba del producto del proveedor, por cara:
   *  ahí no va relleno (ver `rellenoPorRubro`). */
  cubiertas?: Cubiertas;
  ghost?: boolean;
  /** El mueble (su id): siembra la variación de tono del relleno en venta. */
  semilla?: string;
}

interface Pieza {
  clave: string;
  color: string;
  /** El rubro del contrato: la paleta del relleno de venta. */
  rubro?: string;
  /** Dónde va cada unidad (cara, entrepaño, x): los bloques del relleno de
   *  venta (`coloresDelRelleno`). En el orden de `matrices`. */
  lugares: { cara: number; fila: number; x: number }[];
  ancho: number; alto: number; fondo: number;
  forma: FormaDeEmpaque;
  acostado?: boolean;
  matrices: THREE.Matrix4[];
}

export const ProductoEnMueble = memo(function ProductoEnMueble({
  anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, cubiertas, ghost = false, semilla = "",
}: ProductoEnMuebleProps) {
  // Las cubiertas llegan como un arreglo nuevo en cada render: se compara por
  // una clave primitiva, o el memo se rearmaría con cada arrastre.
  const claveCubiertas = claveDeCubiertas(cubiertas);
  const piezas = useMemo<Pieza[]>(() => {
    if (ghost) return [];
    // La cuenta —qué empaque, cuántos frentes, dónde— vive en `frentes.ts`
    // (`rellenoPorRubro`), que es pura y se prueba ejecutándola. Acá sólo se
    // arman las matrices.
    const m = new THREE.Matrix4();
    return rellenoPorRubro({ anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, cubiertas })
      .map((g) => ({
        clave: g.clave,
        color: g.color,
        rubro: g.rubro,
        lugares: g.posiciones.map((p) => ({ cara: p.cara, fila: p.fila, x: p.x })),
        ancho: g.empaque.ancho, alto: g.empaque.alto, fondo: g.empaque.fondo,
        forma: g.empaque.forma, acostado: g.empaque.acostado,
        matrices: g.posiciones.map((p) => m.clone().setPosition(p.x, p.y, p.z)),
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, claveCubiertas, ghost]);

  if (piezas.length === 0) return null;

  return (
    <group>
      {piezas.map((p) => (
        <InstanciasDeEmpaque key={p.clave} pieza={p} semilla={`${semilla}|${p.clave}`} />
      ))}
    </group>
  );
});

/** Un empaque repetido. Un pasillo entero de gaseosas son cientos de botellas
 *  y una sola llamada de dibujo. */
function InstanciasDeEmpaque({ pieza, semilla }: { pieza: Pieza; semilla: string }) {
  // En la pantalla de venta, con la luz del cuarto del producto y del mueble
  // (`luzDeVenta.ts`): el relleno neutro de los slots vendidos a otros no
  // puede quedar en sombra al lado de un mueble iluminado. Y que se lea como
  // EMPAQUE (`rellenoDeVenta.ts`): un color apagado por «producto», en bloques
  // de 2 a 5 frentes, con una etiqueta pintada sin texto; color y diseño van
  // en el color por instancia, sin llamadas nuevas. En el editor, la
  // geometría y el material de siempre, sin color por instancia.
  const luz = useLuzDeVenta();
  const geometria = useMemo(
    () => geometriaDeEmpaque(pieza.forma, pieza.ancho, pieza.alto, pieza.fondo, pieza.acostado, luz),
    [pieza.forma, pieza.ancho, pieza.alto, pieza.fondo, pieza.acostado, luz],
  );
  // En el visor de Vender, todo lo ajeno en grises (`RellenoNeutro`): el
  // único color de la pantalla es el del proveedor que mira.
  const neutro = useContext(RellenoNeutro);
  const colores = useMemo(
    () => (luz ? coloresDelRelleno(pieza.lugares, pieza.rubro, semilla, neutro ? PALETAS.neutro : undefined) : null),
    [luz, pieza.lugares, pieza.rubro, semilla, neutro],
  );
  const material = useMemo(() => {
    const venta = conLuzDeVenta(luz, K_ENTORNO_MUEBLE * 0.8, BRILLO.relleno);
    const etiqueta = luz ? parcheDeRellenoDeVenta(texturaDeEtiquetaDeRelleno()) : null;
    return new THREE.MeshStandardMaterial({
      // En venta el color es el de cada unidad (por instancia); el material,
      // blanco. En el editor, el color del rubro de siempre.
      color: luz ? "#ffffff" : pieza.color,
      // Cartón y plástico impreso: mate, nada de metal. Un envase brillante
      // devuelve el reflejo del entorno y todo el lineal se lee como vidrio.
      metalness: 0,
      roughness: 0.72,
      // Y con poco entorno: a intensidad 1 el mapa lava los colores hasta
      // dejarlos pastel, y el lineal pierde justo lo que lo hace legible, que
      // es que cada rubro sea un bloque de color distinto.
      envMapIntensity: 0.25,
      ...(luz ? { vertexColors: true } : {}),
      ...venta,
      ...(etiqueta && venta.onBeforeCompile ? {
        // Primero la luz de venta (el fragment), después la etiqueta (el
        // vertex y el color): son trozos distintos del shader.
        onBeforeCompile: (s: Parameters<NonNullable<typeof venta.onBeforeCompile>>[0] & { vertexShader?: string }) => {
          venta.onBeforeCompile!(s);
          etiqueta(s);
        },
        customProgramCacheKey: () => CLAVE_DE_RELLENO,
      } : {}),
    });
  }, [pieza.color, luz]);
  // Cada entrada y salida de Presentar rehace el material: el viejo se suelta.
  useEffect(() => () => material.dispose(), [material]);
  // En un vecino del mueble que se muestra, con menos luz (un poco menos
  // apagado que su mueble: ver `EXPOSICION_DEL_RELLENO_VECINO`).
  useAtenuacion([material], EXPOSICION_DEL_RELLENO_VECINO);

  return (
    <instancedMesh
      // Con y sin color por instancia son mallas distintas: un
      // `instanceColor` puesto no se saca, y el editor vuelve al de siempre.
      key={colores ? "venta" : "editor"}
      args={[geometria, material, pieza.matrices.length]}
      // En venta no tira sombra, como el producto de prueba: el mapa de
      // 1.024 px de toda la tienda no resuelve un envase, y la pasada de
      // sombra dibujaba OTRA VEZ cada caja del relleno —en bolsa-4, 3.540
      // envases por cuadro contando las dos pasadas—. La recibe igual.
      castShadow={!luz}
      receiveShadow
      ref={(nodo) => {
        if (!nodo) return;
        pieza.matrices.forEach((mat, i) => nodo.setMatrixAt(i, mat));
        nodo.instanceMatrix.needsUpdate = true;
        if (colores) {
          // sRGB → el espacio de trabajo (lineal), y el diseño de la etiqueta
          // adentro del rojo (`colorConDiseno`).
          const c = new THREE.Color();
          colores.forEach(({ rgb, diseno }, i) => {
            c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
            const [r, g, b] = colorConDiseno([c.r, c.g, c.b], diseno);
            nodo.setColorAt(i, c.setRGB(r, g, b));
          });
          if (nodo.instanceColor) nodo.instanceColor.needsUpdate = true;
        }
        nodo.computeBoundingSphere();
      }}
    />
  );
}

/**
 * Los (entrepaño, vano) de cada cara que llevan habladores GENÉRICOS en la
 * pantalla de venta: los que el relleno de lo vendido cubre en un 80 % o más
 * (`tramosConRelleno`, con la MISMA cuenta que dibuja el relleno). En el
 * editor —o sin relleno— `null`: la tira sigue con el color de estado.
 */
export function useHabladoresDeRelleno(
  conRelleno: boolean, venta: VentaDeMueble, anchoTotal: number,
  slots: SlotDeProducto[] | undefined, vendidoEntero: VendidoEntero | undefined, cubiertas: Cubiertas,
): Set<string>[] | null {
  const enVenta = useLuzDeVenta();
  const claveCubiertas = claveDeCubiertas(cubiertas);
  return useMemo(() => {
    if (!enVenta || !conRelleno) return null;
    const grupos = rellenoPorRubro({
      anchoTotal, filas: venta.filas, vanos: venta.vanos, caras: venta.caras,
      franja: venta.franja ?? 0, slots, vendidoEntero, cubiertas,
    });
    return tramosConRelleno(grupos, venta.vanos, venta.caras);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enVenta, conRelleno, venta, anchoTotal, slots, vendidoEntero, claveCubiertas]);
}
