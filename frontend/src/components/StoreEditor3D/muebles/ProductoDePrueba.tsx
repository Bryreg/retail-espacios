import { memo, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { labioDeFila } from "./medidas";
import type { FilasDeProducto, VentaDeMueble } from "./medidas";
import type { EmpaqueDeArte } from "./producto";
import { unidadesDePrueba } from "./frentes";
import type { TramoDeSurtido, UnidadDePrueba } from "./frentes";
import { geometriaDeEtiqueta } from "./perfiles";
import {
  materialDeEtiqueta, materialDeHablador, planoDeHablador, sombraDeContacto, tiraDeContacto, useEntornoDeProducto,
} from "./etiqueta";
import type { Etiqueta } from "./etiqueta";
import { HABLADOR, posicionesDeHabladores } from "./habladores";
import type { ContenidoDelHablador } from "./habladores";
import { useLuzDeVenta } from "./luzDeVenta";

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
  /** Más productos del MISMO proveedor en la cara, en bloques verticales
   *  (`bloquesDeSurtido`). `etiqueta`, `empaque` y `semilla` de arriba son
   *  del PRINCIPAL, y es lo único que leen el copete, el cabezote, la toma
   *  de venta y /taller: nada de eso cambia con el surtido. Un producto cuya
   *  foto todavía carga llega con `etiqueta` null y no se dibuja (su tramo
   *  queda reservado: el principal no salta de la cara entera a un tercio). */
  surtido?: ProductoDelSurtido[];
  /** El tramo de la cara de cada producto: el 0 es el principal y los
   *  siguientes, los del surtido en orden. Sin surtido no viene. */
  tramos?: TramoDeSurtido[];
  /** Lo que dice el hablador del principal (`habladorALaVista`): el nombre
   *  sin cifras y el precio sólo si está cargado. Sin esto, sin hablador. */
  hablador?: ContenidoDelHablador | null;
}

/** Un producto más del surtido de una cara. */
export interface ProductoDelSurtido {
  etiqueta: Etiqueta | null;
  empaque: EmpaqueDeArte | null;
  semilla: string;
  hablador?: ContenidoDelHablador | null;
}

/** Lo que dibuja un producto en una fila: sus unidades y con qué. */
interface DeUnProducto {
  /** Las del frente (`prof` 0), con la geometría de siempre. Si lo de atrás
   *  usa la MISMA geometría y material (la caja), van todas acá: una sola
   *  llamada de dibujo por (fila, producto). */
  frente: UnidadDePrueba[];
  /** Las de atrás, con la de pocas facetas (envase torneado, bolsa). */
  atras: UnidadDePrueba[];
  geometria: THREE.BufferGeometry;
  geometriaAtras: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  materialAtras: THREE.Material | THREE.Material[];
  /** Los habladores de este producto en esta fila (sólo en venta): dónde
   *  van, ya en las coordenadas de la fila, y con qué material. */
  habladores: { x: number; y: number; z: number }[];
  materialDelHablador: THREE.Material | null;
}

/** Una unidad con su medida: las sombras y la tira de la fila llevan los
 *  productos del surtido juntos, cada uno con su tamaño. */
interface ConMedida { u: UnidadDePrueba; ancho: number; fondo: number }

interface Fila {
  fila: number;
  apoyo: number;
  giro: number;
  productos: DeUnProducto[];
  /** Las del piso de abajo (las manchas de contacto) y las del frente del
   *  piso de abajo (la tira de la fila), de TODOS los productos. Partidas
   *  acá, una vez: partidas en el render, cada paso de un giro de cámara
   *  armaba arreglos nuevos y las instancias se volvían a escribir. */
  apoyadas: ConMedida[];
  delFrente: ConMedida[];
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
  venta, pruebas, ghost = false, tipo,
}: {
  venta: VentaDeMueble;
  /** Por cara, en el orden de `venta.caras`. */
  pruebas: (PruebaDeCara | null | undefined)[];
  ghost?: boolean;
  /** El tipo de mueble: dice dónde está su porta-precios (`labioDeFila`). */
  tipo: string;
}) {
  const entorno = useEntornoDeProducto();
  const { invalidate } = useThree();
  // Los habladores van sólo en la pantalla de venta: en el editor el
  // porta-precios sigue con el color de estado y sin nada encima.
  const enVenta = useLuzDeVenta();

  // Dependencias PRIMITIVAS: el objeto de la prueba se rearma con cada
  // arrastre de cámara, y sin esto cada cuadro reconstruiría las instancias.
  const claveDeProducto = (x: {
    etiqueta: Etiqueta | null; empaque: EmpaqueDeArte | null; semilla: string; hablador?: ContenidoDelHablador | null;
  }) =>
    `${x.etiqueta?.clave ?? "-"}|${claveDeEmpaque(x.empaque)}|${x.semilla}|${x.hablador ? `${x.hablador.nombre}:${x.hablador.precio ?? "-"}` : "-"}`;
  const claves = pruebas.map((p) =>
    p ? `${claveDeProducto(p)}|${claveDeDonde(p.donde)}|${
      p.filas?.alturas.map((y) => y.toFixed(4)).join(",") ?? "-"}|${
      (p.surtido ?? []).map(claveDeProducto).join("+")}|${
      (p.tramos ?? []).map((t) => `${t.x0.toFixed(4)}:${t.x1.toFixed(4)}`).join(",")}` : "-",
  ).join("¦");
  const claveVenta = claveDeVenta(venta);

  const caras = useMemo(() => {
    return venta.caras.map((cara, c) => {
      const p = pruebas[c];
      if (!p || !p.etiqueta || !p.empaque) return null;
      const ventaUsada = p.filas ? { ...venta, filas: p.filas } : venta;
      // El principal y, con surtido, los demás, cada uno en su tramo. Uno
      // cuya foto todavía carga no se dibuja, pero su tramo queda.
      const conSurtido = !!p.tramos && (p.surtido?.length ?? 0) > 0;
      const productos = [
        { etiqueta: p.etiqueta, empaque: p.empaque, semilla: p.semilla, hablador: p.hablador, tramo: conSurtido ? p.tramos![0] : undefined },
        ...(conSurtido ? p.surtido!.map((x, k) => ({ ...x, tramo: p.tramos![k + 1] })) : []),
      ].filter((x): x is {
        etiqueta: Etiqueta; empaque: EmpaqueDeArte; semilla: string; hablador: ContenidoDelHablador | null | undefined;
        tramo: TramoDeSurtido | undefined;
      } => !!x.etiqueta && !!x.empaque && (!conSurtido || !!x.tramo));
      const cuentas = productos.map((x) => {
        const e = x.empaque;
        const r = unidadesDePrueba({
          venta: ventaUsada, empaque: e, donde: p.donde, semilla: x.semilla, tramo: x.tramo, surtido: conSurtido,
        });
        const vaso = e.envase === "revolucion" && !e.transparente;
        const geometriaCon = (detalle: "alto" | "bajo") => geometriaDeEtiqueta(
          e.envase, e.ancho, e.alto, e.fondo,
          e.envase === "revolucion" ? x.etiqueta.recorte.perfil : undefined,
          e.acostado ?? false,
          e.transparente,
          vaso ? x.etiqueta.tapa().franja : 0,
          detalle,
        );
        const geometria = geometriaCon("alto");
        // Lo de atrás, con pocas facetas (`DETALLE`) y la bolsa con la mitad
        // de filas: en una góndola de bolsas son cientos. Una caja ya son 12
        // triángulos y queda igual.
        const geometriaAtras = e.envase === "revolucion" || e.envase === "almohada" ? geometriaCon("bajo") : geometria;
        const materiales = materialDeEtiqueta(x.etiqueta, e.envase, entorno, { transparente: e.transparente });
        // POR GEOMETRÍA: con grupos (la caja parada: foto y costado; el
        // torneado del frente: foto, tapa y espalda), la lista; sin grupos,
        // un solo material — una lista sin grupos no dibuja nada. Lo de
        // atrás puede no tener grupos aunque el frente sí (la botella de 12
        // lados): decidiendo con la del frente, la de atrás dejaba de
        // dibujarse.
        const materialPara = (g: THREE.BufferGeometry) => (g.groups.length > 0 ? materiales : materiales[0]);
        return {
          r, e, geometria, geometriaAtras,
          material: materialPara(geometria), materialAtras: materialPara(geometriaAtras),
          materialDelHablador: enVenta && x.hablador ? materialDeHablador(x.etiqueta, x.hablador) : null,
        };
      });
      const porFila = cuentas[0]?.r.porFila ?? [];
      const filas: Fila[] = porFila
        .map((f) => {
          const fila: Fila = { fila: f.fila, apoyo: f.apoyo, giro: f.giro, productos: [], apoyadas: [], delFrente: [] };
          for (const k of cuentas) {
            const unidades = k.r.unidades.filter((u) => u.fila === f.fila);
            if (unidades.length === 0) continue;
            // Misma geometría y material adelante y atrás (la caja): UNA
            // llamada para las dos.
            const juntas = k.geometriaAtras === k.geometria && k.materialAtras === k.material;
            // Los habladores: uno por bloque de este producto en esta fila,
            // en su borde izquierdo visto desde el pasillo, colgados de la
            // tira del porta-precios de ESTA fila (1 mm por delante de ella).
            const labio = k.materialDelHablador ? labioDeFila(tipo, ventaUsada, f.fila) : null;
            const habladores = labio
              ? posicionesDeHabladores(unidades.filter((u) => u.prof === 0 && u.piso === 0).map((u) => ({ x: u.x, ancho: k.e.ancho })))
                .map((x) => ({ x, y: labio.y, z: labio.z - HABLADOR.delante }))
              : [];
            fila.productos.push({
              frente: juntas ? unidades : unidades.filter((u) => u.prof === 0),
              atras: juntas ? [] : unidades.filter((u) => u.prof > 0),
              geometria: k.geometria, geometriaAtras: k.geometriaAtras,
              material: k.material, materialAtras: k.materialAtras,
              habladores, materialDelHablador: k.materialDelHablador,
            });
            const medida = (u: UnidadDePrueba) => ({ u, ancho: k.e.ancho, fondo: k.e.fondo });
            fila.apoyadas.push(...unidades.filter((u) => u.piso === 0).map(medida));
            fila.delFrente.push(...unidades.filter((u) => u.piso === 0 && u.prof === 0).map(medida));
          }
          return fila;
        })
        .filter((f) => f.productos.length > 0);
      return { cara, filas };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves, claveVenta, entorno, enVenta, tipo]);

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
          {f.productos.map((pr, k) => (
            <group key={k}>
              <Unidades
                unidades={pr.frente}
                geometria={pr.geometria}
                material={pr.material}
                invalidate={invalidate}
              />
              <Unidades
                unidades={pr.atras}
                geometria={pr.geometriaAtras}
                material={pr.materialAtras}
                invalidate={invalidate}
              />
              {pr.materialDelHablador && (
                <Habladores puntos={pr.habladores} material={pr.materialDelHablador} />
              )}
            </group>
          ))}
          {/* Las sombras y la tira, UNA por fila con todos los productos. */}
          <Sombras
            unidades={f.apoyadas}
            geometria={sombra.geometria}
            material={sombra.material}
          />
          <TiraDeFila
            unidades={f.delFrente}
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
    const escala = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    unidades.forEach((u, i) => {
      q.setFromAxisAngle(eje, u.giroY);
      // La bolsa de atrás, asentada (`escalaY`): más baja, con la base donde iba.
      m.setMatrixAt(i, matriz.compose(p.set(u.x, u.y, u.z), q, escala.set(1, u.escalaY ?? 1, 1)));
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

/** Los habladores de un producto en una fila: UNA llamada de dibujo, hijos
 *  del grupo de la fila (se inclinan con el entrepaño). */
function Habladores({ puntos, material }: { puntos: { x: number; y: number; z: number }[]; material: THREE.Material }) {
  const poner = useCallback((m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const matriz = new THREE.Matrix4();
    puntos.forEach((p, i) => m.setMatrixAt(i, matriz.makeTranslation(p.x, p.y, p.z)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [puntos]);
  if (puntos.length === 0) return null;
  return (
    <instancedMesh
      key={`h${puntos.length}`}
      args={[planoDeHablador(), material, puntos.length]}
      castShadow={false}
      receiveShadow={false}
      ref={poner}
    />
  );
}

/** La mancha de contacto bajo cada envase del piso de abajo, apenas por
 *  encima del entrepaño. Cada instancia con la medida de SU producto (el
 *  surtido mezcla tamaños en la misma fila). */
function Sombras({ unidades, geometria, material }: {
  unidades: ConMedida[];
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
        const escala = new THREE.Vector3();
        unidades.forEach(({ u, ancho, fondo }, i) => {
          m.setMatrixAt(i, matriz.compose(p.set(u.x, 0.0015, u.z), q, escala.set(ancho * 1.35, 1, fondo * 1.5)));
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
function TiraDeFila({ unidades, geometria, material }: {
  unidades: ConMedida[];
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  if (unidades.length === 0) return null;
  const desde = Math.min(...unidades.map(({ u, ancho }) => u.x - ancho / 2)) - 0.005;
  const hasta = Math.max(...unidades.map(({ u, ancho }) => u.x + ancho / 2)) + 0.005;
  // El frente de las unidades del frente (el más cercano al pasillo, −Z).
  const frente = Math.min(...unidades.map(({ u, fondo }) => u.z - fondo / 2));
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
