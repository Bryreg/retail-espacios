import { memo, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { FilasDeProducto, VentaDeMueble } from "./medidas";
import type { EmpaqueDeArte } from "./producto";
import { unidadesDePrueba } from "./frentes";
import type { UnidadDePrueba } from "./frentes";
import { geometriaDeEtiqueta } from "./perfiles";
import { materialDeEtiqueta, sombraDeContacto, tiraDeContacto, useEntornoDeProducto } from "./etiqueta";
import type { Etiqueta } from "./etiqueta";

/**
 * El producto del proveedor parado en el mueble, como en la tienda.
 *
 * ## Qué reemplaza
 *
 * La lámina: una foto repetida como calcomanía, estirada al alto de cada
 * entrepaño, con su fondo blanco y sin luz. Un vaso de 9 cm salía de 26, los
 * entrepaños lo cortaban por la mitad y la cara se leía como papel tapiz.
 *
 * Ahora cada unidad es un envase con su medida real (`empaqueDeArte`), la
 * foto sin fondo como etiqueta, acomodado con la misma cuenta de frentes que
 * el relleno (`unidadesDePrueba`): frentes reales por vano, hasta tres de
 * fondo —lo de atrás más oscuro—, apilado sólo si la ficha lo dice, con una
 * sombra de contacto y un desorden mínimo y determinista.
 *
 * ## Por qué grupos anidados y ninguna cuenta de posición
 *
 * Los dos intentos viejos de poner geometría nueva en el mueble replicaban la
 * matemática de ubicación y se despegaron (ESTADO.md, «El producto estaba
 * pintado al fondo del mueble»). Esto es hijo del grupo del mueble, como la
 * lámina, y repite la MISMA anidación que las piezas: la cara se cuelga en su
 * plano de montaje —la B girada media vuelta—, y cada fila en la altura de su
 * entrepaño, girada lo que gira ese entrepaño. Así un envase de un entrepaño
 * inclinado se inclina con él, sin una línea de trigonometría.
 */

/** Lo que se está probando en UNA cara. */
export interface PruebaDeCara {
  /** `null` mientras la foto carga: la cara se ve vacía un momento. */
  etiqueta: Etiqueta | null;
  empaque: EmpaqueDeArte | null;
  /** «Toda la cara» o los entrepaños elegidos. */
  donde: "todas" | readonly number[];
  /** `${fixtureId}|${cara}|${arteId}`: el desorden es de ESTE mueble. */
  semilla: string;
  /** Las rejillas de la nevera reacomodadas para este producto
   *  (`rejillasParaProducto`): reemplazan las filas del mueble en ESTA cara.
   *  La nevera las dibuja con las mismas alturas. */
  filas?: FilasDeProducto;
  /** La marca en el copete de la punta (`pop.ts`), con «Toda la cara». */
  copete?: boolean;
}

interface Fila {
  fila: number;
  apoyo: number;
  giro: number;
  /** Las del frente (`prof` 0), con la geometría de siempre. */
  frente: UnidadDePrueba[];
  /** Las de atrás, con la de pocas facetas si el envase es torneado. */
  atras: UnidadDePrueba[];
  /** Las del piso de abajo (las manchas de contacto) y las del frente del
   *  piso de abajo (la tira de la fila). Partidas acá, una vez: partidas en
   *  el render, cada paso de un giro de cámara armaba arreglos nuevos y las
   *  instancias se volvían a escribir. */
  apoyadas: UnidadDePrueba[];
  delFrente: UnidadDePrueba[];
}

/** Una clave de texto de la venta: el objeto se rearma con cada render del
 *  mueble, y el memo tiene que depender de números, no de identidades. */
function claveDeVenta(v: VentaDeMueble): string {
  return [
    v.filas.alturas.map((y) => y.toFixed(4)).join(","),
    v.filas.fondos.map((f) => f.toFixed(4)).join(","),
    (v.filas.giros ?? []).map((g) => g.toFixed(4)).join(","),
    v.vanos.map((x) => `${x.x.toFixed(4)}:${x.ancho.toFixed(4)}`).join(","),
    v.caras.map((c) => `${c.montaje.toFixed(4)}:${c.hacia}`).join(","),
    v.sobreApoyo ?? 0,
    v.grupoGiro ?? 0,
  ].join("|");
}

const claveDeEmpaque = (e: EmpaqueDeArte | null) =>
  e ? `${e.envase}:${e.ancho}:${e.alto}:${e.fondo}:${e.apilable}:${e.acostado ?? false}:${e.transparente}:${e.pisosMaximos}` : "-";

const claveDeDonde = (d: PruebaDeCara["donde"]) => (d === "todas" ? "todas" : d.join(","));

export const ProductoDePrueba = memo(function ProductoDePrueba({
  venta, pruebas, ghost = false,
}: {
  venta: VentaDeMueble;
  /** Por cara, en el orden de `venta.caras`. */
  pruebas: (PruebaDeCara | null | undefined)[];
  ghost?: boolean;
}) {
  const entorno = useEntornoDeProducto();
  const { invalidate } = useThree();

  // Dependencias PRIMITIVAS: el objeto de la prueba se rearma con cada
  // arrastre de cámara, y sin esto cada cuadro reconstruiría las instancias.
  const claves = pruebas.map((p) =>
    p ? `${p.etiqueta?.clave ?? "-"}|${claveDeEmpaque(p.empaque)}|${claveDeDonde(p.donde)}|${p.semilla}|${
      p.filas?.alturas.map((y) => y.toFixed(4)).join(",") ?? "-"}` : "-",
  ).join("¦");
  const claveVenta = claveDeVenta(venta);

  const caras = useMemo(() => {
    return venta.caras.map((cara, c) => {
      const p = pruebas[c];
      if (!p || !p.etiqueta || !p.empaque) return null;
      const r = unidadesDePrueba({
        venta: p.filas ? { ...venta, filas: p.filas } : venta,
        empaque: p.empaque, donde: p.donde, semilla: p.semilla,
      });
      const filas: Fila[] = r.porFila
        .map((f) => {
          const unidades = r.unidades.filter((u) => u.fila === f.fila);
          return {
            fila: f.fila, apoyo: f.apoyo, giro: f.giro,
            frente: unidades.filter((u) => u.prof === 0),
            atras: unidades.filter((u) => u.prof > 0),
            apoyadas: unidades.filter((u) => u.piso === 0),
            delFrente: unidades.filter((u) => u.piso === 0 && u.prof === 0),
          };
        })
        .filter((f) => f.frente.length + f.atras.length > 0);
      const e = p.empaque;
      const vaso = e.envase === "revolucion" && !e.transparente;
      const geometriaCon = (detalle: "alto" | "bajo") => geometriaDeEtiqueta(
        e.envase, e.ancho, e.alto, e.fondo,
        e.envase === "revolucion" ? p.etiqueta!.recorte.perfil : undefined,
        e.acostado ?? false,
        e.transparente,
        vaso ? p.etiqueta!.tapa().franja : 0,
        detalle,
      );
      const geometria = geometriaCon("alto");
      // Lo de atrás, con pocas facetas (`DETALLE`): una caja ya son 12
      // triángulos y queda igual.
      const geometriaAtras = e.envase === "revolucion" ? geometriaCon("bajo") : geometria;
      const materiales = materialDeEtiqueta(p.etiqueta, e.envase, entorno, { transparente: e.transparente });
      // Con grupos (la caja parada: foto y costado; el vaso: foto y tapa), la
      // lista; sin grupos, un solo material — una lista sin grupos no dibuja
      // nada.
      const material = geometria.groups.length > 0 ? materiales : materiales[0];
      return { cara, filas, geometria, geometriaAtras, material, empaque: e };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves, claveVenta, entorno]);

  if (ghost || caras.every((c) => !c)) return null;
  const sombra = sombraDeContacto();
  const tiraDeFila = tiraDeContacto();

  const contenido = caras.map((c, i) => c && (
    <group
      key={i}
      position={[0, 0, c.cara.montaje]}
      rotation={[0, c.cara.hacia === 1 ? Math.PI : 0, 0]}
    >
      {c.filas.map((f) => (
        <group key={f.fila} position={[0, f.apoyo, 0]} rotation={[f.giro, 0, 0]}>
          <Unidades
            unidades={f.frente}
            geometria={c.geometria}
            material={c.material}
            invalidate={invalidate}
          />
          <Unidades
            unidades={f.atras}
            geometria={c.geometriaAtras}
            material={c.material}
            invalidate={invalidate}
          />
          <Sombras
            unidades={f.apoyadas}
            ancho={c.empaque.ancho}
            fondo={c.empaque.fondo}
            geometria={sombra.geometria}
            material={sombra.material}
          />
          <TiraDeFila
            unidades={f.delFrente}
            ancho={c.empaque.ancho}
            fondo={c.empaque.fondo}
            geometria={tiraDeFila.geometria}
            material={tiraDeFila.material}
          />
        </group>
      ))}
    </group>
  ));

  // El robatope cuelga todas sus repisas de un mismo grupo girado: el
  // producto va adentro del mismo giro.
  return venta.grupoGiro
    ? <group rotation={[venta.grupoGiro, 0, 0]}>{contenido}</group>
    : <group>{contenido}</group>;
});

/** Los envases de una fila: una sola llamada de dibujo. Sin sombras propias
 *  (castShadow): el mapa de 1024 px de toda la tienda no resuelve un envase. */
function Unidades({ unidades, geometria, material, invalidate }: {
  unidades: UnidadDePrueba[];
  geometria: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  invalidate: () => void;
}) {
  const n = unidades.length;
  // La referencia, estable: escrita en línea, React la volvía a llamar en
  // cada render del mueble —cada paso de un giro de cámara— y cada llamada
  // pedía un cuadro más (`invalidate` ACUMULA cuadros pendientes). Con 360
  // vasos en una máquina lenta, un giro a mano dejaba medio minuto encolado.
  const poner = useCallback((m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const matriz = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eje = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const uno = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    unidades.forEach((u, i) => {
      q.setFromAxisAngle(eje, u.giroY);
      m.setMatrixAt(i, matriz.compose(p.set(u.x, u.y, u.z), q, uno));
      m.setColorAt(i, color.setScalar(u.tono));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [unidades, invalidate]);
  if (n === 0) return null;
  return (
    <instancedMesh
      key={`u${n}`}
      args={[geometria, material, n]}
      castShadow={false}
      receiveShadow={false}
      ref={poner}
    />
  );
}

/** La mancha de contacto bajo cada envase del piso de abajo, apenas por
 *  encima del entrepaño. */
function Sombras({ unidades, ancho, fondo, geometria, material }: {
  unidades: UnidadDePrueba[];
  ancho: number;
  fondo: number;
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const n = unidades.length;
  if (n === 0) return null;
  return (
    <instancedMesh
      key={`s${n}`}
      args={[geometria, material, n]}
      renderOrder={1}
      ref={(m: THREE.InstancedMesh | null) => {
        if (!m) return;
        const matriz = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const p = new THREE.Vector3();
        const escala = new THREE.Vector3(ancho * 1.35, 1, fondo * 1.5);
        unidades.forEach((u, i) => {
          m.setMatrixAt(i, matriz.compose(p.set(u.x, 0.0015, u.z), q, escala));
        });
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }}
    />
  );
}

/** La sombra de la fila (`tiraDeContacto`): de punta a punta de las unidades
 *  del frente, 2 cm por delante de ellas y 3 por debajo. Hija del grupo de
 *  la fila: se inclina con el entrepaño. */
function TiraDeFila({ unidades, ancho, fondo, geometria, material }: {
  unidades: UnidadDePrueba[];
  ancho: number;
  fondo: number;
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  if (unidades.length === 0) return null;
  const xs = unidades.map((u) => u.x);
  const desde = Math.min(...xs) - ancho / 2 - 0.005;
  const hasta = Math.max(...xs) + ancho / 2 + 0.005;
  // El frente de las unidades del frente (el más cercano al pasillo, −Z).
  const frente = Math.min(...unidades.map((u) => u.z)) - fondo / 2;
  return (
    <mesh
      geometry={geometria}
      material={material}
      renderOrder={1}
      position={[(desde + hasta) / 2, 0.001, frente + 0.005]}
      scale={[hasta - desde, 1, 0.05]}
    />
  );
}
