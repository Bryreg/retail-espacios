import { memo, useContext, useMemo } from "react";
import { DesnudoDelMueble } from "./desnudo";
import * as THREE from "three";
import { colorVolcado, empaqueVolcadoEn } from "./producto";
import { geometriaDeEmpaque } from "./perfiles";

/**
 * Producto a granel, visto desde arriba: lo que llena una batea, un cajón de
 * frutas, una isla de congelados o la bandeja de un mostrador.
 *
 * ## Por qué hace falta
 *
 * Media docena de muebles del catálogo tenían la forma bien —el cajón de
 * madera con sus listones, la isla con su guarda de acrílico, el mostrador con
 * su vidrio— y aun así se leían como maquetas. El motivo era siempre el mismo:
 * **estaban vacíos**. Un mostrador de carnes sin carne es un mueble; con carne
 * es una carnicería. En un plano que se le muestra a un proveedor, eso decide
 * si entiende lo que está comprando.
 *
 * Y no es lo mismo que el producto de un entrepaño. Sobre un entrepaño el
 * producto está PARADO, alineado y en frentes; acá está VOLCADO: apilado
 * suelto, desparejo, más alto en el medio que en los bordes. Alinearlo en una
 * grilla perfecta se ve peor que no ponerlo, porque parece un damero.
 *
 * ## Por qué el desorden es determinista
 *
 * El desparejo sale de un generador sembrado con el id del mueble, no de
 * `Math.random`. Si fuera al azar, cada vez que se mueve la cámara la fruta se
 * reacomodaría sola: el plano titilaría entero y nadie podría señalar nada.
 * Con la semilla, la misma batea se ve siempre igual — en esta sesión, en la
 * próxima y en la pantalla del proveedor.
 */

export interface ProductoAGranelProps {
  /** Ancho de la boca que se llena. */
  ancho: number;
  /** Fondo de la boca. */
  fondo: number;
  /** Altura de la superficie donde se apoya el producto. */
  y: number;
  /** Cuánto se puede amontonar hacia arriba. */
  altoLibre: number;
  /** Rubro del contrato, si hay. Decide el empaque y el color. */
  rubro?: string | null;
  /** Semilla del desparejo. El id del mueble sirve: es estable y distinto
   *  entre muebles, así que dos bateas contiguas no salen clonadas. */
  semilla: string;
  ghost?: boolean;
}

/** Generador sembrado. Es un xorshift de 32 bits: alcanza de sobra para
 *  desordenar fruta y no arrastra dependencias. */
function azarDe(semilla: string): () => number {
  let x = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    x ^= semilla.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    return x / 4294967296;
  };
}

/** Aire entre unidad y unidad. Muy poco: lo volcado va apretado. */
const LUZ = 0.006;
/** Cuánto se mete el producto respecto del borde del canasto, para que no
 *  parezca que se está cayendo. */
const RETIRO = 0.03;
/** Cuánto se hunde cada capa en la de abajo. Lo volcado no se apila prolijo:
 *  las piezas se acomodan en los huecos de las de abajo. */
const ASIENTO = 0.12;

export const ProductoAGranel = memo(function ProductoAGranel({
  ancho, fondo, y, altoLibre, rubro, semilla, ghost = false,
}: ProductoAGranelProps) {
  // El mueble desnudo de Distribución (`desnudo.ts`): nada encima. Se mira
  // después de los hooks (abajo), para que entrar y salir del modo no cambie
  // su orden.
  const desnudo = useContext(DesnudoDelMueble);
  const { matrices, empaque, color } = useMemo(() => {
    // Con el alto libre: lo envasado se acuesta sólo si no entra parado.
    const e = empaqueVolcadoEn(rubro, altoLibre);
    const color = colorVolcado(rubro);
    const vacio = { matrices: [] as THREE.Matrix4[], empaque: e, color };
    if (ghost || altoLibre <= 0) return vacio;

    const util = { w: ancho - RETIRO * 2, d: fondo - RETIRO * 2 };
    if (util.w <= 0 || util.d <= 0) return vacio;

    // ── De qué lado cae lo alargado ──────────────────────────────────────
    // Nadie vuelca las cosas alineadas: caen en el sentido en que entran. Con
    // una sola orientación, lo alargado deja media boca sin usar. Así que se
    // prueban las dos en planta y se usa la que mete más unidades.
    const opciones = [
      { girado: false, w: e.ancho, d: e.fondo },
      { girado: true,  w: e.fondo, d: e.ancho },
    ];
    let mejor: { girado: boolean; nx: number; nz: number; pasoX: number; pasoZ: number } | null = null;
    for (const o of opciones) {
      const nx = Math.floor((util.w + LUZ) / (o.w + LUZ));
      const nz = Math.floor((util.d + LUZ) / (o.d + LUZ));
      if (nx <= 0 || nz <= 0) continue;
      if (!mejor || nx * nz > mejor.nx * mejor.nz) {
        mejor = { girado: o.girado, nx, nz, pasoX: o.w + LUZ, pasoZ: o.d + LUZ };
      }
    }
    if (!mejor) return vacio;
    const { nx, nz, pasoX, pasoZ } = mejor;
    const giro = mejor.girado ? Math.PI / 2 : 0;

    // Cuántas capas se apilan. Se llena casi hasta el borde, que es como está
    // una batea de promoción de verdad: con tres capas fijas, un canasto hondo
    // quedaba con el producto hundido treinta centímetros y desde el pasillo
    // se veía VACÍO — el defecto que este componente vino a arreglar.
    // Contra la altura EFECTIVA de una capa, no contra el alto del envase: las
    // capas se asientan unas sobre otras y se hunden un 12 %. Contando con el
    // alto entero, el montón termina bastante más bajo de lo pedido y en un
    // canasto hondo eso se nota, porque la pared de adelante lo tapa.
    //
    // Pero no todo se apila: **una botella parada no va encima de otra**. Lo
    // que se amontona es lo bajo y lo suelto —fruta, bolsas, cajas—; lo alto y
    // esbelto se para en UNA capa, hombro con hombro. Apilando botellas salía
    // una torre en el medio del canasto que no existe en ninguna tienda.
    const apilable = e.alto <= Math.max(e.ancho, e.fondo) * 1.6;
    const altoDeCapa = e.alto * (1 - ASIENTO);
    const capas = apilable
      ? Math.max(1, Math.min(8, Math.floor((altoLibre * 0.9) / altoDeCapa)))
      : 1;

    const azar = azarDe(semilla);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const esc = new THREE.Vector3(1, 1, 1);
    const eje = new THREE.Euler();
    const fuera: THREE.Matrix4[] = [];

    const x0 = -((nx - 1) * pasoX) / 2;
    const z0 = -((nz - 1) * pasoZ) / 2;

    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        // El montículo: el centro lleva una capa más que los bordes. Es lo que
        // hace que se lea como producto volcado y no como una tapa impresa.
        //
        // Se SUMA sobre las capas base en vez de multiplicarlas. Multiplicando,
        // una grilla chica se queda sin montículo y sin relleno a la vez: con
        // 2×2 unidades todas las celdas son borde, el factor cae a 0,45 y el
        // canasto entero termina con UNA capa en el fondo. Pasó, y el mueble
        // se veía vacío.
        const dx = nx > 1 ? (ix / (nx - 1)) * 2 - 1 : 0;
        const dz = nz > 1 ? (iz / (nz - 1)) * 2 - 1 : 0;
        const centro = 1 - Math.min(1, Math.hypot(dx, dz) / Math.SQRT2);
        const aqui = capas + (apilable && centro > 0.45 ? 1 : 0);

        for (let c = 0; c < aqui; c++) {
          pos.set(
            x0 + ix * pasoX + (azar() - 0.5) * LUZ * 2.5,
            y + e.alto / 2 + c * altoDeCapa,
            z0 + iz * pasoZ + (azar() - 0.5) * LUZ * 2.5,
          );
          // Un giro chico, distinto en cada unidad. Sin esto, todas las caras
          // devuelven la misma luz y el montón se ve como un bloque tallado.
          eje.set(0, giro + (azar() - 0.5) * 0.5, (azar() - 0.5) * 0.12);
          rot.setFromEuler(eje);
          fuera.push(m.clone().compose(pos, rot, esc));
        }
      }
    }
    return { matrices: fuera, empaque: e, color };
  }, [ancho, fondo, y, altoLibre, rubro, semilla, ghost]);

  const geometria = useMemo(
    () => geometriaDeEmpaque(empaque.forma, empaque.ancho, empaque.alto, empaque.fondo, empaque.acostado),
    [empaque.forma, empaque.ancho, empaque.alto, empaque.fondo, empaque.acostado],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      color, metalness: 0, roughness: 0.78, envMapIntensity: 0.25,
    }),
    [color],
  );

  if (desnudo || matrices.length === 0) return null;

  return (
    <instancedMesh
      args={[geometria, material, matrices.length]}
      castShadow
      receiveShadow
      ref={(nodo) => {
        if (!nodo) return;
        matrices.forEach((mat, i) => nodo.setMatrixAt(i, mat));
        nodo.instanceMatrix.needsUpdate = true;
        nodo.computeBoundingSphere();
      }}
    />
  );
});
