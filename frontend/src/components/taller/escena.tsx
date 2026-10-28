import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Html } from "@react-three/drei";
import { FIXTURE_DEFS } from "../StoreEditor3D/StoreEditor3D";
import type { PlacedFixture } from "../StoreEditor3D/StoreEditor3D";
import type { SlotDeProducto } from "../StoreEditor3D/muebles/ProductoEnGondola";
import type { ParteNumerada } from "../StoreEditor3D/muebles/contornos";
import type { FixtureDef } from "../../catalogo/editor3D";
import { fichaDe } from "../../utils/convertirPlano";
import type { ShelfSlot } from "../../types/fixtures";

/**
 * La escena del taller, compartida por el banco de prueba (`/taller/banco`,
 * `pages/TallerMuebles.tsx`) y el asistente de «Mis muebles»
 * (`pages/MisMuebles.tsx`, 2026-10-28): la luz de entorno, la órbita con sus
 * tomas fijas, el piso, el mueble del catálogo armado con su ficha y las
 * partes numeradas. Vivían adentro del banco; se mudaron tal cual.
 */

/** Una toma a tres cuartos que encuadra el mueble entero (contra la cara A,
 *  que mira a −Z): la del asistente. La misma cuenta que la del banco, sin el
 *  mueble de al lado: se aleja lo que pidan el alto, el ancho que se ve de
 *  tres cuartos (el frente y el costado) contra el `aspecto` del lienzo —la
 *  vista del asistente es más alta que ancha— y la esquina de abajo más
 *  cercana. */
export function tomaTresCuartos(w: number, d: number, h: number, aspecto = 1.3): Exclude<Toma, null> {
  const tan = Math.tan((21 * Math.PI) / 180);
  const ang = (35 * Math.PI) / 180;
  const yMira = h / 2;
  const altoDeCamara = Math.max(1.2, Math.min(1.7, h * 0.85));
  const anchoVisto = w * Math.cos(ang) + d * Math.sin(ang);
  let dist = Math.max(1.6, (h * 1.15) / (2 * tan), (anchoVisto * 1.15) / (2 * tan * Math.max(0.4, aspecto)));
  const cerca = (w / 2) * Math.sin(ang) + (d / 2) * Math.cos(ang);
  for (let i = 0; i < 20; i++) {
    const lejos = d / 2 + dist;
    const bajaLaToma = Math.atan2(altoDeCamara - yMira, lejos);
    const bajaLaEsquina = Math.atan2(altoDeCamara, Math.max(0.1, lejos - cerca));
    if (bajaLaEsquina <= bajaLaToma + (19 * Math.PI) / 180) break;
    dist *= 1.1;
  }
  return { pos: [Math.sin(ang) * (d / 2 + dist), altoDeCamara, -Math.cos(ang) * (d / 2 + dist)], mira: [0, yMira, 0] };
}

/** Iluminación de entorno hecha con three directo y NO con drei.
 *
 *  `@react-three/drei` está en 10.x y sus peers piden fiber 9 y React 19,
 *  mientras el proyecto tiene fiber 8 y React 18 — por eso `npm install` pide
 *  `--legacy-peer-deps`. Hoy sólo se usa `<Html>` y funciona de casualidad;
 *  meter `<Environment>` sería justo el componente que rompe. `RoomEnvironment`
 *  viene con three y no arrastra nada.
 *
 *  Sin esto, cualquier material con `metalness` renderiza lo que refleja, que
 *  es nada: gris plano. Con esto, el acero pintado tiene de dónde tomar luz. */
export function EntornoNeutro() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = entorno.texture;
    return () => {
      entorno.texture.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/** Una toma fija de la cámara: dónde se para y adónde mira. */
export type Toma = { pos: [number, number, number]; mira: [number, number, number] } | null;

export function Controles({ toma, girar = false }: { toma: Toma; girar?: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const ctrl = useRef<OrbitControls | null>(null);
  // «Girar»: el mueble da vueltas solo, para mirarlo de todos lados mientras
  // se escribe su ficha. La órbita a mano sigue andando.
  useEffect(() => {
    const c = ctrl.current;
    if (!c) return;
    c.autoRotate = girar;
    c.autoRotateSpeed = 1.4;
  }, [girar]);
  useFrame(() => { if (girar) ctrl.current?.update(); });
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 0.9, 0);
    c.enableDamping = true;
    c.autoRotate = girar;
    c.autoRotateSpeed = 1.4;
    c.update();
    ctrl.current = c;
    const animar = () => { c.update(); };
    gl.domElement.addEventListener("pointermove", animar);
    return () => { gl.domElement.removeEventListener("pointermove", animar); c.dispose(); ctrl.current = null; };
    // `girar` lo sigue el efecto de arriba: acá sólo el valor con que nace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);
  // Las tomas fijas son para medir y para comparar fotos: de frente a la
  // altura del ojo, a tres cuartos, de cerca. Con la órbita a mano dos fotos
  // nunca salen iguales.
  useEffect(() => {
    const c = ctrl.current;
    if (!toma || !c) return;
    camera.position.set(...toma.pos);
    c.target.set(...toma.mira);
    c.update();
    invalidate();
  }, [toma, camera, invalidate]);
  return null;
}


/** El piso. `lado`: en «Mis muebles» la toma se aleja más (una nevera de
 *  3,2 m), y con 24 m el borde del piso se veía detrás del mueble. */
export function Piso({ lado = 24 }: { lado?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[lado, lado]} />
      <meshStandardMaterial color="#a8a49d" roughness={0.94} metalness={0} />
    </mesh>
  );
}


/** Una cara vendida entera, partida en rubros. No es dato de negocio: es lo
 *  mínimo para poder mirar cómo queda un lineal lleno antes de que haya un
 *  contrato de verdad cargado. Los rubros son los que más cambian de empaque,
 *  a propósito — si se ven bien éstos, se ven bien todos. */
export const SLOTS_DE_MUESTRA: SlotDeProducto[] = [
  { id: "a", x: 0.00, w: 0.34, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Gaseosas" },
  { id: "b", x: 0.34, w: 0.33, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Galletas" },
  { id: "c", x: 0.67, w: 0.33, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Aceites" },
  { id: "d", x: 0.00, w: 0.50, y: 0.50, h: 0.5, status: "occupied", brandCategory: "Snacks" },
  { id: "e", x: 0.50, w: 0.50, y: 0.50, h: 0.5, status: "occupied", brandCategory: "Atún" },
];

/** Un mueble del catálogo, armado con lo mínimo que pide `FixtureMesh`. No es
 *  un mueble de una sede: no tiene contrato, ni código de espacio, ni posición.
 *  Es el mismo dibujo que usa el editor, traído acá para poder mirarlo.
 *
 *  Con `modelo` (uno de `PALETA_3D`), el mueble lleva estampada la ficha de
 *  ese modelo —entrepaños, módulo, puertas— igual que el que el editor coloca
 *  desde la paleta (`fichaDe`): sin eso, el taller dibujaba la cuenta de
 *  siempre y una nevera de 4 puertas se miraba con las que salen del ancho.
 *
 *  La góndola y la punta sólo dibujan producto sobre espacios vendidos: con
 *  rubro, cada espacio de muestra lleva ESE rubro, así el rubro sigue siendo
 *  lo que decide qué se para en los entrepaños. */
export function delCatalogo(
  indice: number, w: number, d: number, h: number, rubro: string, modelo?: FixtureDef | null,
): PlacedFixture {
  const def = FIXTURE_DEFS[indice] ?? FIXTURE_DEFS[0];
  const conEspacios = rubro && (def.type === "gondola" || def.type === "punta");
  return {
    id: "taller", code: def.code, type: def.type, gondolaType: def.gondolaType,
    x: 0, z: 0, rotY: 0, w, d, h,
    label: def.label, color: modelo?.color ?? def.color,
    supplierName: rubro ? "Proveedor de prueba" : "", brandCategory: rubro,
    status: rubro ? "occupied" : "free",
    negotiatedValue: 0, startDate: "", endDate: "", observation: "",
    ...(modelo ? fichaDe(modelo) : {}),
    ...(conEspacios ? { slots: espaciosDeMuestra(rubro) } : {}),
  };
}

/** Los espacios de muestra como espacios de un mueble, todos con el rubro. */
function espaciosDeMuestra(rubro: string): ShelfSlot[] {
  return SLOTS_DE_MUESTRA.map((s) => ({
    id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, status: "occupied",
    supplierName: "Proveedor de prueba", brandCategory: rubro,
    negotiatedValue: 0, startDate: "", endDate: "",
  }));
}

/** Una parte que vende la ficha, en el taller: su contorno sobre el frente y
 *  su número («PU1», «EN1 · base»), con las cuentas del visor de Vender
 *  (`partesNumeradas`). Fuera de la escena de venta: es para la dueña. */
export function ParteNumeradaDelTaller({ p }: { p: ParteNumerada }) {
  const { contorno: c } = p;
  const geometria = useMemo(() => {
    const plano = new THREE.PlaneGeometry(Math.max(0.01, c.ancho), Math.max(0.01, c.alto));
    const g = new THREE.EdgesGeometry(plano);
    plano.dispose();
    return g;
  }, [c.ancho, c.alto]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  return (
    <group position={[c.cx, c.cy, c.z]}>
      <lineSegments geometry={geometria}>
        <lineBasicMaterial color="#f2b705" />
      </lineSegments>
      {/* Sólo la cara A lleva el número: la B se numera igual mirando su
          frente, y dos rótulos en el mismo lugar no se leen. */}
      {p.cara === "A" && (
        <Html center style={{ pointerEvents: "none" }}>
          <span data-parte-numerada={p.etiqueta} style={{
            fontSize: 11, fontWeight: 700, padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap",
            background: "rgba(242,183,5,0.92)", color: "#1c1917",
          }}>{p.etiqueta}</span>
        </Html>
      )}
    </group>
  );
}

