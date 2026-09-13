import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GondolaReal } from "../components/StoreEditor3D/muebles/GondolaReal";
import { ProductoEnGondola } from "../components/StoreEditor3D/muebles/ProductoEnGondola";
import { PuntaReal } from "../components/StoreEditor3D/muebles/PuntaReal";
import { ProductoEnPunta } from "../components/StoreEditor3D/muebles/ProductoEnPunta";
import { NeveraReal } from "../components/StoreEditor3D/muebles/NeveraReal";
import { FixtureMesh, FIXTURE_DEFS } from "../components/StoreEditor3D/StoreEditor3D";
import type { PlacedFixture } from "../components/StoreEditor3D/StoreEditor3D";
import type { SlotDeProducto } from "../components/StoreEditor3D/muebles/ProductoEnGondola";

/**
 * El taller: un mueble solo, girable, para mirarle la forma.
 *
 * No es una pantalla de negocio — es el banco de pruebas donde se construye el
 * mobiliario. Existe por una razón concreta: el editor 3D son más de cinco mil
 * líneas y cambiar la geometría ahí adentro es cambiar a ciegas. Acá la pieza
 * se dibuja sola, con luz neutra y sin nada alrededor, así que lo que se ve es
 * la forma y nada más. Cuando la forma está bien, recién ahí se enchufa.
 *
 * También sirve después: es donde se mira si un mueble nuevo quedó parecido al
 * de la tienda antes de ponerlo en un plano de un cliente.
 */

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
function EntornoNeutro() {
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

function Controles() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 0.9, 0);
    c.enableDamping = true;
    c.update();
    const animar = () => { c.update(); };
    gl.domElement.addEventListener("pointermove", animar);
    return () => { gl.domElement.removeEventListener("pointermove", animar); c.dispose(); };
  }, [camera, gl]);
  return null;
}

function Piso() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[24, 24]} />
      <meshStandardMaterial color="#a8a49d" roughness={0.94} metalness={0} />
    </mesh>
  );
}

const campo: React.CSSProperties = {
  width: 84, height: 28, padding: "0 8px", borderRadius: 6,
  border: "1px solid var(--line)", background: "var(--surface-2)",
  color: "var(--ink-1)", fontSize: 12.5, fontFamily: "inherit",
};

/** Una cara vendida entera, partida en rubros. No es dato de negocio: es lo
 *  mínimo para poder mirar cómo queda un lineal lleno antes de que haya un
 *  contrato de verdad cargado. Los rubros son los que más cambian de empaque,
 *  a propósito — si se ven bien éstos, se ven bien todos. */
const SLOTS_DE_MUESTRA: SlotDeProducto[] = [
  { id: "a", x: 0.00, w: 0.34, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Gaseosas" },
  { id: "b", x: 0.34, w: 0.33, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Galletas" },
  { id: "c", x: 0.67, w: 0.33, y: 0.00, h: 0.5, status: "occupied", brandCategory: "Aceites" },
  { id: "d", x: 0.00, w: 0.50, y: 0.50, h: 0.5, status: "occupied", brandCategory: "Snacks" },
  { id: "e", x: 0.50, w: 0.50, y: 0.50, h: 0.5, status: "occupied", brandCategory: "Atún" },
];

/** Un mueble del catálogo, armado con lo mínimo que pide `FixtureMesh`. No es
 *  un mueble de una sede: no tiene contrato, ni código de espacio, ni posición.
 *  Es el mismo dibujo que usa el editor, traído acá para poder mirarlo. */
function delCatalogo(indice: number, w: number, d: number, h: number, rubro: string): PlacedFixture {
  const def = FIXTURE_DEFS[indice] ?? FIXTURE_DEFS[0];
  return {
    id: "taller", code: def.code, type: def.type, gondolaType: def.gondolaType,
    x: 0, z: 0, rotY: 0, w, d, h,
    label: def.label, color: def.color,
    supplierName: rubro ? "Proveedor de prueba" : "", brandCategory: rubro,
    status: rubro ? "occupied" : "free",
    negotiatedValue: 0, startDate: "", endDate: "", observation: "",
  };
}

export default function TallerMuebles() {
  /** Qué mueble del catálogo se está mirando. -1 = los del taller. */
  const [catalogo, setCatalogo] = useState(-1);
  /** El rubro del contrato. Decide qué producto se dibuja adentro del mueble,
   *  así que hace falta poder cambiarlo sin ir a cargar un contrato. */
  const [rubro, setRubro] = useState("");
  const [ancho, setAncho] = useState(2.5);
  const [fondo, setFondo] = useState(1.0);
  const [alto, setAlto] = useState(1.8);
  const [tipo, setTipo] = useState<"double" | "wall" | "punta" | "nevera">("double");
  const [conProducto, setConProducto] = useState(true);

  const camara = useMemo(
    () => ({ position: [2.6, 1.7, 2.8] as [number, number, number], fov: 42, near: 0.05, far: 100 }),
    [],
  );

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "10px 16px", borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <strong style={{ fontSize: 13 }}>Taller de muebles</strong>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          ancho{" "}
          <input type="number" step="0.05" value={ancho} style={campo}
                 onChange={(e) => setAncho(Math.max(0.4, +e.target.value || 0))} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          fondo{" "}
          <input type="number" step="0.05" value={fondo} style={campo}
                 onChange={(e) => setFondo(Math.max(0.25, +e.target.value || 0))} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          alto{" "}
          <input type="number" step="0.05" value={alto} style={campo}
                 onChange={(e) => setAlto(Math.max(0.6, +e.target.value || 0))} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          tipo{" "}
          <select value={tipo} style={{ ...campo, width: 96 }}
                  onChange={(e) => setTipo(e.target.value as "double" | "wall" | "punta" | "nevera")}>
            <option value="double">góndola doble</option>
            <option value="wall">góndola mural</option>
            <option value="punta">punta de góndola</option>
            <option value="nevera">nevera de refrescos</option>
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          catálogo{" "}
          <select value={catalogo} style={{ ...campo, width: 170 }}
                  onChange={(e) => {
                    const i = +e.target.value;
                    setCatalogo(i);
                    const def = FIXTURE_DEFS[i];
                    if (def) { setAncho(def.w); setFondo(def.d); setAlto(def.h); }
                  }}>
            <option value={-1}>— piezas del taller —</option>
            {FIXTURE_DEFS.map((d, i) => (
              <option key={`${d.type}-${i}`} value={i}>{d.label}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          rubro{" "}
          <input type="text" value={rubro} placeholder="sin contrato" style={{ ...campo, width: 120 }}
                 onChange={(e) => setRubro(e.target.value)} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          <input type="checkbox" checked={conProducto}
                 onChange={(e) => setConProducto(e.target.checked)} />{" "}
          producto
        </label>
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
          Banco de pruebas de la forma. No es una pantalla de negocio.
        </span>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Canvas
          camera={camara}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 1.75]}
          style={{ background: "#c8c5bf" }}
        >
          <Suspense fallback={null}>
            <EntornoNeutro />
            <Controles />
            <ambientLight intensity={0.2} />
            <directionalLight
              position={[3, 6, 4]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-6}
              shadow-camera-right={6}
              shadow-camera-top={6}
              shadow-camera-bottom={-6}
            />
            <directionalLight position={[-4, 3, -3]} intensity={0.35} />
            <Piso />
            {catalogo >= 0 ? (
              <FixtureMesh fixture={delCatalogo(catalogo, ancho, fondo, alto, rubro)} />
            ) : tipo === "nevera" ? (
              <NeveraReal w={ancho} d={fondo} h={alto} />
            ) : tipo === "punta" ? (
              <>
                <PuntaReal w={ancho} d={fondo} h={alto} />
                {conProducto && (
                  <ProductoEnPunta w={ancho} d={fondo} h={alto} slots={SLOTS_DE_MUESTRA} />
                )}
              </>
            ) : (
              <>
                <GondolaReal w={ancho} d={fondo} h={alto} gondolaType={tipo} />
                {conProducto && (
                  <ProductoEnGondola
                    w={ancho} d={fondo} h={alto}
                    esMural={tipo === "wall"}
                    slots={SLOTS_DE_MUESTRA}
                  />
                )}
              </>
            )}
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
