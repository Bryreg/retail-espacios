import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  MURAL_VEGETALES, NEVERA, PORTA_PRECIOS, SOBRE_REJILLA,
  altoUtilDeNevera, nivelesDeMural, nivelesDeNevera, puertasDe,
} from "./medidas";
import { geometriaDeEmpaque, geometriaMarcoDePuerta, geometriaPortaPrecios } from "./perfiles";
import { acomodar, EMPAQUES } from "./producto";
import { BRILLO, conLuzDeVenta, K_ENTORNO_MUEBLE, useLuzDeVenta, useSoltarMateriales } from "./luzDeVenta";
import { useAtenuacion } from "./atenuacion";
import { useThree } from "@react-three/fiber";

/**
 * Un mueble refrigerado de puerta de vidrio: la nevera de refrescos y la
 * vitrina son el mismo mueble con otro alto.
 *
 * ## Lo que le faltaba, y era todo
 *
 * Tenía carrocería, compresor, rejilla de ventilación, estantes y tiras de
 * LED — y **no tenía puertas**. Sin puertas una nevera no se lee como nevera:
 * se lee como una estantería pintada de oscuro, que es exactamente lo que
 * parecía en el plano. La puerta es lo primero que el ojo usa para
 * clasificarla, antes que el color y antes que la luz.
 *
 * Y lo que se reconoce de una puerta no es el vidrio —que casi no se ve— sino
 * el **marco de aluminio**: ancho, claro, con su propia sombra contra el
 * cuerpo oscuro. Por eso el marco es geometría con bisel y el vidrio es un
 * plano casi transparente.
 *
 * ## Por qué el frente se parte
 *
 * Una hoja de más de 75 cm no la fabrica nadie: no la aguanta la bisagra y no
 * abre en un pasillo. Un frente de 1,20 m lleva dos puertas, y esa línea
 * vertical del montante en el medio es la segunda cosa que la delata.
 *
 * ## Por qué el interior va iluminado y frío
 *
 * El contraste entre la carrocería oscura y el interior encendido es lo que
 * hace que en un plano lleno de muebles claros la nevera salte a la vista. Es
 * también lo que pasa en tienda, y por lo que se paga por estar adentro.
 */

export interface NeveraRealProps {
  w: number;
  d: number;
  h: number;
  /** Color de estado comercial. Tiñe la franja del zócalo — NO la carrocería
   *  ni el copete, que es donde va la marca del proveedor. */
  statusColor?: string;
  ghost?: boolean;
  /**
   * Qué clase de mueble frío es. No son dos estilos del mismo dibujo: son dos
   * muebles distintos que se compran por separado.
   *
   * · `multideck` — frente ABIERTO, con cortina de aire. Es el de bebidas y
   *   lácteos de un supermercado: sin puerta, para que el cliente agarre sin
   *   detenerse. Lo que lo delata es el copete profundo con la boca de aire
   *   arriba y la reja de retorno abajo.
   * · `puertas` — cerrado con puertas de vidrio. El de un autoservicio o una
   *   tienda de conveniencia, donde el consumo eléctrico manda más que la
   *   velocidad de compra.
   * · `vegetales` — el mural de frutas y verduras. Abierto como el multideck,
   *   pero sus niveles son BANDEJAS INCLINADAS y no entrepaños planos: lo que
   *   se carga encima es fruta suelta, que rueda y hay que verla desde arriba.
   *   Con estantes planos se lee como una estantería con cosas encima.
   */
  variante?: "multideck" | "puertas" | "vegetales";
  /** Llena los entrepaños con envases mudos. Se apaga cuando el proveedor
   *  subió su arte: lo que se ve por el vidrio tiene que ser SU producto. */
  conRelleno?: boolean;
  /** Las alturas de las rejillas, si se reacomodaron para el producto que se
   *  está probando (`rejillasParaProducto`). Es de la sesión: el plano no se
   *  toca. Sin esto, las de fábrica (`nivelesDeNevera`). */
  niveles?: readonly number[];
  /** La chapa del cabezote con la marca del producto en prueba (`pop.ts`),
   *  como el copete de la punta. Sin esto, la chapa clara de siempre. */
  cabezote?: THREE.Material;
  /** Cuántas puertas tiene el frente, si el mueble lo guardó de su ficha
   *  (`partes.puertas` de la nevera de puertas). Sin esto, las que pide el
   *  ancho (`puertasDeNevera`). Sólo cuenta en la variante `puertas`. */
  puertas?: number;
}

/**
 * Envases mudos llenando los entrepaños.
 *
 * Una nevera encendida y vacía no se lee como nevera: se lee como un error.
 * Y a diferencia de la góndola —donde el hueco vacío ES el dato, porque dice
 * qué espacio queda libre— acá el mueble se vende ENTERO, no por pedazos: la
 * marca compra la nevera, no un estante. Así que mostrarla llena no esconde
 * ninguna disponibilidad, y mostrarla vacía sí miente sobre cómo se ve.
 *
 * Van de un solo tono frío y sin marca, a propósito. En cuanto entra el arte
 * del proveedor desaparecen: lo que se ve por el vidrio tiene que ser el
 * producto que alguien compró, no uno inventado.
 */
const RellenoDeNevera = memo(function RellenoDeNevera({
  niveles, techo, ancho, fondo, material,
}: {
  niveles: number[];
  /** Hasta dónde llega el interior, para saber cuánto entra en la fila de
   *  arriba. */
  techo: number;
  ancho: number;
  fondo: number;
  material: THREE.Material;
}) {
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4();
    const fuera: THREE.Matrix4[] = [];
    const e = EMPAQUES.botellaChica;
    for (let i = 0; i < niveles.length; i++) {
      const apoyo = niveles[i];
      const libre = (niveles[i + 1] ?? techo) - apoyo;
      const a = acomodar(ancho, fondo, libre, e);
      if (a.frentes === 0) continue;
      const desdeX = -a.ocupado / 2 + e.ancho / 2;
      for (let f = 0; f < a.frentes; f++) {
        // Una sola fila de fondo: lo que se ve por el vidrio es el frente, y
        // las de atrás quedan tapadas por su propio facing.
        fuera.push(m.clone().setPosition(
          desdeX + f * a.pasoX,
          apoyo + e.alto / 2 + SOBRE_REJILLA,
          -fondo / 2 + e.fondo / 2 + 0.02,
        ));
      }
    }
    return fuera;
  }, [niveles, techo, ancho, fondo]);

  // Con forma de BOTELLA. Un multideck de bebidas lleno de prismas se lee como
  // un archivador: el cilindro con cuello es lo que dice «bebida» a diez
  // metros, y es lo primero que el ojo clasifica.
  const geometria = useMemo(() => geometriaDeEmpaque(
    EMPAQUES.botellaChica.forma,
    EMPAQUES.botellaChica.ancho, EMPAQUES.botellaChica.alto, EMPAQUES.botellaChica.fondo,
  ), []);

  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      args={[geometria, material, matrices.length]}
      castShadow
      ref={(nodo) => {
        if (!nodo) return;
        matrices.forEach((mat, i) => nodo.setMatrixAt(i, mat));
        nodo.instanceMatrix.needsUpdate = true;
        nodo.computeBoundingSphere();
      }}
    />
  );
});

/** La rejilla de alambre de la pantalla de venta: varillas claras de fondo a
 *  frente sobre el hueco oscuro, una cada 2 cm, con las dos barras del canto.
 *  Opaca a propósito: con `alphaTest` las varillas de 2 mm desaparecen en el
 *  primer mipmap, y con transparencia hay que ordenar contra las botellas. */
const alambres = new Map<number, THREE.CanvasTexture>();
/** Una por cantidad de varillas, compartida entre neveras: antes cada nevera
 *  creaba la suya (con mipmaps y anisotropía 8) cada vez que entraba a
 *  Presentar, y no se soltaba nunca. */
function texturaDeAlambre(anchoInterior: number): THREE.CanvasTexture {
  const varillas = Math.max(4, Math.round(anchoInterior / 0.02));
  const ya = alambres.get(varillas);
  if (ya) return ya;
  const c = document.createElement("canvas");
  c.width = 32; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5d656e";
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = "#e4e9ee";
  g.fillRect(12, 0, 8, 128);
  g.fillRect(0, 0, 32, 7);
  g.fillRect(0, 121, 32, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(varillas, 1);
  t.anisotropy = 8;
  alambres.set(varillas, t);
  return t;
}

function useMaterialesDeFrio(
  ghost: boolean, statusColor: string | undefined, luz: boolean, anchoInterior: number, multideck: boolean,
) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    // En la pantalla de venta, con la luz del cuarto del producto
    // (`luzDeVenta.ts`); cada material con el peso de su `envMapIntensity` de
    // diseño y lo que toma del brillo de las luminarias (el aluminio y el
    // alambre como la estructura de la góndola; la chapa como el pintado).
    const venta = (base: number, brillo: number) => conLuzDeVenta(luz, K_ENTORNO_MUEBLE * base, brillo);
    return {
      /** La carrocería: panel aislado con terminación texturada, no espejo. */
      cuerpo: new THREE.MeshStandardMaterial({
        color: "#252d3a", metalness: 0.25, roughness: 0.62,
        envMapIntensity: 0.5, ...comun, ...venta(0.6, BRILLO.pintado),
      }),
      /** El interior, blanco y encendido. Es el contraste con la carrocería lo
       *  que hace que la nevera se distinga en un plano de muebles claros. */
      interior: new THREE.MeshStandardMaterial({
        color: "#eef6fb", metalness: 0, roughness: 0.85,
        emissive: "#cfe8f5", emissiveIntensity: EMISION_DE_FRIO.interior,
        envMapIntensity: 0.3, ...comun, ...venta(0.8, BRILLO.panel),
      }),
      /** Los entrepaños: rejilla de alambre cromado. */
      rejilla: new THREE.MeshStandardMaterial({
        color: "#b9c2cb", metalness: 0.55, roughness: 0.35,
        envMapIntensity: 0.7, ...comun, ...venta(1, BRILLO.estructura),
      }),
      /** La cubeta de un mural de vegetales: plástico claro, mate, lavable.
       *  No es rejilla de alambre — sobre rejilla la fruta se marca. */
      cubeta: new THREE.MeshStandardMaterial({
        color: "#dfe7ea", metalness: 0.05, roughness: 0.72,
        envMapIntensity: 0.4, ...comun,
      }),
      /** El marco de aluminio de la puerta. */
      marco: new THREE.MeshStandardMaterial({
        color: "#cdd3d8", metalness: 0.45, roughness: 0.34,
        envMapIntensity: 0.9, ...comun, ...venta(1, BRILLO.estructura),
      }),
      /** El vidrio. Casi transparente y muy liso: lo que se ve de él es el
       *  reflejo del entorno, no su color. `depthWrite` apagado para que no
       *  tape el producto de adentro al ordenar transparencias. */
      vidrio: new THREE.MeshStandardMaterial({
        color: "#dff0f7", metalness: 0.1, roughness: 0.04,
        envMapIntensity: 1.6,
        transparent: true, opacity: ghost ? 0.12 : 0.17, depthWrite: false,
      }),
      /** La tira de LED bajo cada entrepaño. */
      luz: new THREE.MeshStandardMaterial({
        color: "#e8f7ff", emissive: "#bfe8ff", emissiveIntensity: EMISION_DE_FRIO.luz,
        transparent: true, opacity: 0.8,
      }),
      /** Lo que se ve por una rejilla o por una junta: sombra, no pieza. */
      hueco: new THREE.MeshStandardMaterial({
        color: "#11151c", metalness: 0.1, roughness: 0.9, ...comun,
      }),
      /** La manija. Va oscura a propósito: en el mismo gris del marco
       *  desaparece, y la manija es de las tres cosas que hacen que una puerta
       *  se lea como puerta. */
      manija: new THREE.MeshStandardMaterial({
        color: "#3b444f", metalness: 0.6, roughness: 0.3,
        envMapIntensity: 1.1, ...comun, ...venta(1, BRILLO.estructura),
      }),
      /** Los envases mudos de relleno. Un solo tono frío y sin marca: es una
       *  aproximación, y tiene que verse como tal. */
      relleno: new THREE.MeshStandardMaterial({
        color: "#8fa3b4", metalness: 0.05, roughness: 0.55,
        envMapIntensity: 0.4, ...comun, ...venta(0.8, BRILLO.relleno),
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
      /** Sólo en la pantalla de venta: la rejilla de alambre (las placas
       *  macizas se leían como una caja de cajones) y el forro claro de los
       *  costados, el techo y la bandeja de abajo. */
      // Sólo el multideck de frente abierto: la nevera de puertas y el mural
      // de vegetales no llevan alambre ni forro.
      alambre: luz && !ghost && multideck ? new THREE.MeshStandardMaterial({
        map: texturaDeAlambre(anchoInterior), metalness: 0.3, roughness: 0.4, ...venta(1, BRILLO.estructura),
      }) : null,
      forro: luz && !ghost && multideck ? new THREE.MeshStandardMaterial({
        color: "#eef3f6", metalness: 0, roughness: 0.8,
        emissive: "#dcebf3", emissiveIntensity: EMISION_DE_FRIO.forro, ...venta(0.9, BRILLO.panel),
      }) : null,
    };
  }, [ghost, statusColor, luz, anchoInterior, multideck]);
  useSoltarMateriales(m);
  // Un vecino del mueble que se muestra va con menos luz (`useAtenuacion`) y
  // con el frío APAGADO (`apagarElFrio`). Es lo que hacía que NEV-02, libre y
  // con botellas mudas, pesara lo mismo que la nevera que se vende (un 40 %
  // del cuadro). Por efecto, sin rehacer ni recompilar los materiales.
  // Sin la exposición del vecino (`EXPOSICION_DE_NEVERA_VECINA`): el frío
  // apagado ya la deja un 60 % abajo, y con las dos las botellas mudas —que
  // tienen que seguir leyéndose— desaparecían (luminancia 65 → 28).
  const foco = useAtenuacion(Object.values(m), EXPOSICION_DE_NEVERA_VECINA);
  const { invalidate } = useThree();
  useEffect(() => {
    apagarElFrio(m, !foco && luz);
    invalidate();
  }, [m, foco, luz, invalidate]);
  return m;
}

/** La exposición de una nevera VECINA: toda. Lo que la apaga es su frío
 *  (`apagarElFrio`, calibrado en la tanda 2: un 43 % abajo de la nevera que
 *  se vende, con las botellas mudas a la vista). */
export const EXPOSICION_DE_NEVERA_VECINA = 1;

/** La emisión de diseño del frío: el forro de venta, el interior y las tiras
 *  de LED (lo que la atenuación de un vecino baja y después repone). */
export const EMISION_DE_FRIO = { forro: 0.12, interior: 0.22, luz: 0.85 } as const;

/**
 * Cuánto queda de cada cosa en una nevera VECINA con el frío apagado.
 *
 * Bajar sólo la luz de venta no alcanzaba: NEV-02 (blanca por dentro, con
 * botellas mudas claras) seguía casi el doble de luminosa que la nevera que se
 * vende, que tiene producto oscuro y marco negro (medido en gaseosa-4: 0,33
 * contra 0,18 de luminancia relativa media). Adentro de una nevera la luz es la
 * de sus LED; con ellos apagados, la cavidad sólo recibe lo que entra por el
 * frente, de costado. Como la escena la ilumina igual que a un mueble abierto,
 * el color de lo que está adentro —forro e interior, rejillas y botellas— se
 * multiplica por esto: es la oclusión de la cavidad dicha barata, con
 * uniformes (sin recompilar). El criterio: NEV-02 al menos un 20 % menos
 * luminosa que la nevera que se vende, con las botellas mudas a la vista
 * (quedan un poco más claras que la cavidad, así que se siguen leyendo).
 * Medido en gaseosa-4 (NEV-01, la que se vende: 0,176 de luminancia relativa
 * media, 83 de gris sRGB): con 0,4/0,55 sólo en forro y botellas NEV-02 quedaba
 * en 0,19; con 0,2/0,45/0,35 en 0,126, pero con el mismo gris sRGB que NEV-01.
 * Para que quede un 20 % abajo con las dos cuentas, también el filo —el
 * aluminio de los porta-precios y del marco— baja a 0,4 (con 0,5 quedaba justo
 * en el 20 % de gris): no es oclusión, es que el vecino no se lleve la luz del
 * que se vende, como en un escenario. Con todo esto y `ATENUACION`, NEV-02
 * queda en 0,07 (58 de gris), un 30 % abajo.
 */
export const FRIO_APAGADO = { cavidad: 0.12, rejilla: 0.35, relleno: 0.25, filo: 0.4, luz: 0.08 } as const;

type MaterialDeFrio = THREE.MeshStandardMaterial | null | undefined;

/** El color con que se creó un material: se guarda la primera vez para poder
 *  volver a él (el foco va y viene sin rehacer materiales). */
function colorDeDiseno(mat: THREE.MeshStandardMaterial): THREE.Color {
  const ud = mat.userData as { colorDeDiseno?: THREE.Color };
  if (!ud.colorDeDiseno) ud.colorDeDiseno = mat.color.clone();
  return ud.colorDeDiseno;
}

/**
 * Apaga (o vuelve a encender) el frío de una nevera: sin la emisión del forro
 * ni la del interior, las tiras de LED casi apagadas y el color de la cavidad,
 * de las rejillas y de las botellas multiplicado por `FRIO_APAGADO`. Con `apagado` en false
 * deja todo como se diseñó. Exportada para la prueba.
 */
export function apagarElFrio(
  m: {
    forro?: MaterialDeFrio; alambre?: MaterialDeFrio;
    interior: THREE.MeshStandardMaterial; rejilla: THREE.MeshStandardMaterial; marco: THREE.MeshStandardMaterial;
    luz: THREE.MeshStandardMaterial; relleno: THREE.MeshStandardMaterial;
  },
  apagado: boolean,
): void {
  const tono = (mat: MaterialDeFrio, f: number) => {
    if (mat) mat.color.copy(colorDeDiseno(mat)).multiplyScalar(apagado ? f : 1);
  };
  if (m.forro) m.forro.emissiveIntensity = apagado ? 0 : EMISION_DE_FRIO.forro;
  m.interior.emissiveIntensity = apagado ? 0 : EMISION_DE_FRIO.interior;
  m.luz.emissiveIntensity = EMISION_DE_FRIO.luz * (apagado ? FRIO_APAGADO.luz : 1);
  tono(m.forro, FRIO_APAGADO.cavidad);
  tono(m.interior, FRIO_APAGADO.cavidad);
  tono(m.rejilla, FRIO_APAGADO.rejilla);
  tono(m.alambre, FRIO_APAGADO.rejilla);
  tono(m.relleno, FRIO_APAGADO.relleno);
  tono(m.marco, FRIO_APAGADO.filo);
}

export const NeveraReal = memo(function NeveraReal({
  w, d, h, statusColor, ghost = false, variante = "multideck", conRelleno = true,
  niveles: nivelesDePrueba, cabezote, puertas,
}: NeveraRealProps) {
  const conPuertas = variante === "puertas";
  const esMural = variante === "vegetales";
  const luz = useLuzDeVenta();
  const m = useMaterialesDeFrio(ghost, statusColor, luz, Math.max(0.1, w - NEVERA.chapa * 2), !conPuertas && !esMural);
  // La marca del cabezote va SÓLO en la cara que mira al pasillo (−Z;
  // BoxGeometry ordena +X, −X, +Y, −Y, +Z, −Z), como la chapa del copete de
  // la punta. Con un material solo, la marca salía también en los cantos.
  const chapaDelCabezote = useMemo(
    () => (cabezote ? [m.interior, m.interior, m.interior, m.interior, m.interior, cabezote] : m.interior),
    [cabezote, m.interior],
  );
  // En la pantalla de venta la nevera se ve como un mueble de bebidas
  // encendido: forro claro, rejilla de alambre y la luz de la tienda sin
  // sombras adentro. En el editor, como siempre.
  const venta = !!m.forro;

  const util = altoUtilDeNevera(h);
  const yInterior = NEVERA.zocalo + util / 2;
  const clavePrueba = nivelesDePrueba?.map((y) => y.toFixed(4)).join(",") ?? "";
  const niveles = useMemo(
    () => (esMural ? nivelesDeMural(h) : nivelesDePrueba ? [...nivelesDePrueba] : nivelesDeNevera(h)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h, esMural, clavePrueba],
  );
  const cuantasPuertas = puertasDe(w, puertas);
  const anchoDePuerta = w / cuantasPuertas;

  // El interior, descontando la carrocería de los lados y del fondo.
  const anchoInterior = Math.max(0.1, w - NEVERA.chapa * 2);
  const fondoInterior = Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta);
  const zFrente = -d / 2;

  return (
    <group>
      {/* ── Carrocería ────────────────────────────────────────────────────
          Laterales, fondo y copete. El frente queda abierto: ahí van las
          puertas. */}
      {([-1, 1] as const).map((sx) => (
        <mesh
          key={`lat${sx}`}
          position={[sx * (w / 2 - NEVERA.chapa / 2), h / 2, 0]}
          castShadow
          receiveShadow
          material={m.cuerpo}
        >
          <boxGeometry args={[NEVERA.chapa, h, d]} />
        </mesh>
      ))}
      <mesh
        position={[0, h / 2, d / 2 - NEVERA.chapa / 2]}
        castShadow
        receiveShadow
        material={m.cuerpo}
      >
        <boxGeometry args={[w, h, NEVERA.chapa]} />
      </mesh>

      {/* ── El zócalo, que es donde vive el compresor ─────────────────────*/}
      <mesh position={[0, NEVERA.zocalo / 2, 0]} castShadow receiveShadow material={m.cuerpo}>
        <boxGeometry args={[w, NEVERA.zocalo, d]} />
      </mesh>
      {/* La rejilla de ventilación: el compresor tira calor al pasillo y ésa
          es la razón por la que una nevera tiene ese zócalo alto. */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh
          key={`rej${i}`}
          position={[0, NEVERA.zocalo * (0.28 + i * 0.16), zFrente - 0.004]}
          material={m.hueco}
        >
          <boxGeometry args={[w * 0.66, 0.010, 0.008]} />
        </mesh>
      ))}
      {/* La franja de estado comercial, abajo y al frente. */}
      <mesh position={[0, NEVERA.zocalo * 0.86, zFrente - 0.009]} material={m.estado}>
        <boxGeometry args={[w * 0.6, 0.026, 0.010]} />
      </mesh>

      {/* ── El copete ─────────────────────────────────────────────────────
          La banda de arriba: cartelería del proveedor y luminaria. */}
      <mesh
        position={[0, h - NEVERA.copete / 2, 0]}
        castShadow
        receiveShadow
        material={m.cuerpo}
      >
        <boxGeometry args={[w, NEVERA.copete, d]} />
      </mesh>
      {/* Por DELANTE de la carrocería, no dentro: a ras del frente los dos
          planos se pelean el z-buffer y el copete sale rayado. */}
      <mesh
        position={[0, h - NEVERA.copete / 2, zFrente - 0.007]}
        material={chapaDelCabezote}
      >
        <boxGeometry args={[w - NEVERA.chapa * 2, NEVERA.copete * 0.62, 0.012]} />
      </mesh>

      {/* ── El interior iluminado ─────────────────────────────────────────
          En la pantalla de venta, sin la sombra de la luz de la tienda: la
          carrocería y el copete la recortaban en rectángulos a media anchura
          sobre el fondo, y adentro de una nevera la luz es la del LED. */}
      <mesh
        position={[0, yInterior, d / 2 - NEVERA.chapa - 0.006]}
        receiveShadow={!venta}
        material={m.interior}
      >
        <boxGeometry args={[anchoInterior, util, 0.012]} />
      </mesh>
      {m.forro && (
        <>
          {/* El forro de los costados: de frente se veía el azul de la
              carrocería por dentro, y la nevera era una caja negra. */}
          {([-1, 1] as const).map((sx) => (
            <mesh
              key={`forro${sx}`}
              position={[sx * (anchoInterior / 2 - 0.002), yInterior, (NEVERA.fondoPuerta - NEVERA.chapa) / 2]}
              material={m.forro!}
            >
              <boxGeometry args={[0.004, util, fondoInterior]} />
            </mesh>
          ))}
          {/* El techo y la bandeja de abajo. */}
          <mesh position={[0, NEVERA.zocalo + util - 0.002, (NEVERA.fondoPuerta - NEVERA.chapa) / 2]} material={m.forro}>
            <boxGeometry args={[anchoInterior, 0.004, fondoInterior]} />
          </mesh>
          <mesh position={[0, NEVERA.zocalo + 0.002, (NEVERA.fondoPuerta - NEVERA.chapa) / 2]} material={m.forro}>
            <boxGeometry args={[anchoInterior, 0.004, fondoInterior]} />
          </mesh>
          {/* La luminaria de arriba, detrás de la boca de aire: lo que hace
              que el mueble se lea encendido desde el otro lado del pasillo. */}
          <mesh position={[0, h - NEVERA.copete - 0.03, zFrente + 0.11]} material={m.luz}>
            <boxGeometry args={[anchoInterior - 0.04, 0.012, 0.03]} />
          </mesh>
        </>
      )}

      {/* ── Entrepaños de rejilla, con su tira de luz ─────────────────────*/}
      {niveles.map((y) => (
        <group key={`e${y.toFixed(3)}`}>
          {/* En el mural de vegetales la bandeja CAE hacia el cliente y lleva
              un tope al frente. Sin la caída, la fruta de atrás queda tapada
              por la de adelante; sin el tope, se cae al pasillo — y dibujado
              plano el mueble se lee como una estantería con cosas encima. */}
          {/* El giro va SOBRE LA BANDEJA, con el grupo ya puesto en su
              altura. Rotando el grupo desde el origen del mueble, una bandeja
              a 1,2 m se corre treinta centímetros en Z y sale por el costado
              de la carrocería — se probó y se ve exactamente así. */}
          <group
            position={[0, y, NEVERA.chapa / 2]}
            rotation={[esMural ? MURAL_VEGETALES.caida : 0, 0, 0]}
          >
            <mesh castShadow receiveShadow material={esMural ? m.cubeta : (m.alambre ?? m.rejilla)}>
              <boxGeometry args={[
                anchoInterior - 0.01, esMural ? 0.016 : 0.009, fondoInterior,
              ]} />
            </mesh>
            {esMural && (
              <mesh
                position={[0, MURAL_VEGETALES.tope / 2, -fondoInterior / 2]}
                castShadow
                material={m.marco}
              >
                <boxGeometry args={[anchoInterior - 0.01, MURAL_VEGETALES.tope, 0.012]} />
              </mesh>
            )}
          </group>
          {/* El porta-precios en el filo. Un multideck lo lleva igual que el
              lineal: es donde va el precio de la bebida. */}
          <mesh
            geometry={geometriaPortaPrecios(anchoInterior - 0.02, PORTA_PRECIOS.alto)}
            material={m.marco}
            position={[0, y - PORTA_PRECIOS.alto / 2 - NEVERA.portaBaja,
                       zFrente + NEVERA.fondoPuerta + NEVERA.portaAdentro]}
            castShadow
          />
          {/* La tira de LED va bajo el filo del entrepaño, apuntando al
              producto del nivel de abajo. */}
          <mesh
            position={[0, y - 0.012, zFrente + NEVERA.fondoPuerta + 0.03]}
            material={m.luz}
          >
            <boxGeometry args={[anchoInterior - 0.05, 0.006, 0.010]} />
          </mesh>
        </group>
      ))}

      {/* ── El producto ───────────────────────────────────────────────────*/}
      {conRelleno && !ghost && !esMural && (
        <RellenoDeNevera
          niveles={niveles}
          techo={NEVERA.zocalo + util}
          ancho={anchoInterior - 0.03}
          fondo={fondoInterior}
          material={m.relleno}
        />
      )}

      {/* ── La cortina de aire ────────────────────────────────────────────
          Un multideck no tiene puerta: lo que retiene el frío es un chorro de
          aire que baja del copete y vuelve por la reja de abajo. Esas dos
          bocas son lo que hace que el ojo lo lea como mueble de frío abierto
          en vez de como una estantería oscura — que es el mismo papel que
          cumple la puerta en el otro. */}
      {!conPuertas && (
        <>
          {/* Boca de impulsión, mirando hacia abajo desde el copete. */}
          <mesh
            position={[0, h - NEVERA.copete - 0.012, zFrente + 0.05]}
            material={m.hueco}
          >
            <boxGeometry args={[anchoInterior, 0.024, 0.075]} />
          </mesh>
          {/* Reja de retorno, al ras de la bandeja de abajo. */}
          <mesh
            position={[0, NEVERA.zocalo + 0.018, zFrente + 0.045]}
            material={m.hueco}
          >
            <boxGeometry args={[anchoInterior, 0.036, 0.06]} />
          </mesh>
        </>
      )}

      {/* ── Las puertas ───────────────────────────────────────────────────
          Lo que hace que esto sea una nevera y no una estantería oscura. */}
      {conPuertas && Array.from({ length: cuantasPuertas }, (_, i) => {
        const cx = -w / 2 + anchoDePuerta * (i + 0.5);
        const altoDePuerta = h - NEVERA.zocalo - NEVERA.copete;
        const yPuerta = NEVERA.zocalo + altoDePuerta / 2;
        const vidrioAncho = Math.max(0.02, anchoDePuerta - NEVERA.marcoPuerta * 2);
        const vidrioAlto = Math.max(0.02, altoDePuerta - NEVERA.marcoPuerta * 2);
        return (
          <group key={`pu${i}`} position={[cx, yPuerta, zFrente + NEVERA.fondoPuerta]}>
            <mesh
              geometry={geometriaMarcoDePuerta(
                anchoDePuerta, altoDePuerta, NEVERA.marcoPuerta, NEVERA.fondoPuerta,
              )}
              material={m.marco}
              castShadow
            />
            <mesh position={[0, 0, -NEVERA.fondoPuerta / 2]} material={m.vidrio}>
              <boxGeometry args={[vidrioAncho, vidrioAlto, 0.006]} />
            </mesh>
            {/* La manija: barra vertical al borde de la hoja. Las hojas de un
                frente doble abren hacia afuera, así que las manijas quedan
                enfrentadas en el medio. */}
            <mesh
              position={[
                (i === 0 && cuantasPuertas > 1 ? 1 : -1) * (anchoDePuerta / 2 - 0.035),
                0,
                -NEVERA.fondoPuerta - 0.012,
              ]}
              material={m.manija}
              castShadow
            >
              <boxGeometry args={[0.022, Math.min(NEVERA.manija, altoDePuerta * 0.7), 0.022]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});
