import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import type { FacePaint, PlacedFixture } from "../components/StoreEditor3D/StoreEditor3D";
import type { SlotDeProducto } from "../components/StoreEditor3D/muebles/ProductoEnGondola";
import { ventaDeTipo } from "../components/StoreEditor3D/muebles/venta";
import { unidadesDePrueba } from "../components/StoreEditor3D/muebles/frentes";
import { empaqueDeArte } from "../components/StoreEditor3D/muebles/producto";
import type { FichaDeArte, FormaDeFicha } from "../components/StoreEditor3D/muebles/producto";
import { claveDeArte, etiquetaDeArte, marcarEnUso } from "../components/StoreEditor3D/muebles/etiqueta";
import type { Etiqueta } from "../components/StoreEditor3D/muebles/etiqueta";
import type { ModoDeFondo } from "../components/StoreEditor3D/muebles/recorte";
import { arteUrl, listarCatalogo, type Arte } from "../api/catalogo";

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

/** Una toma fija de la cámara: dónde se para y adónde mira. */
type Toma = { pos: [number, number, number]; mira: [number, number, number] } | null;

function Controles({ toma }: { toma: Toma }) {
  const { camera, gl, invalidate } = useThree();
  const ctrl = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 0.9, 0);
    c.enableDamping = true;
    c.update();
    ctrl.current = c;
    const animar = () => { c.update(); };
    gl.domElement.addEventListener("pointermove", animar);
    return () => { gl.domElement.removeEventListener("pointermove", animar); c.dispose(); ctrl.current = null; };
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

/** La luz del EDITOR (la de `Scene`), para ver y calibrar el producto con la
 *  misma luz con que se lo muestra al proveedor. Sin `EntornoNeutro`: el
 *  editor no tiene entorno de escena, y el envase trae el suyo. */
function LuzDelEditor() {
  return (
    <>
      <ambientLight intensity={0.55} color="#fff8f0" />
      <directionalLight position={[4, 40, 3]} intensity={1.6} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <directionalLight position={[-6, 25, -6]} intensity={0.3} color="#fffaee" />
      <directionalLight position={[6, 25, 6]} intensity={0.2} color="#e0eeff" />
    </>
  );
}

/** La carta de color: ocho parches de marca, para calibrar el material de la
 *  etiqueta contra colores conocidos. Se dibuja una vez. */
export const PARCHES_DE_CARTA: [string, string][] = [
  ["rojo", "#D0103A"], ["azul", "#1F4E9A"],
  ["amarillo", "#FFD100"], ["verde", "#00A651"],
  ["naranja", "#F58220"], ["blanco", "#FFFFFF"],
  ["lechoso", "#F2EDE1"], ["negro", "#151515"],
];
let carta: Promise<Blob> | null = null;
function cartaDeColor(): Promise<Blob> {
  return (carta ??= new Promise((ok) => {
    // 2 columnas × 4 filas, con una junta gris entre parches para poder
    // ubicarlos en la captura.
    const c = document.createElement("canvas");
    c.width = 400; c.height = 800;
    const g = c.getContext("2d")!;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, c.width, c.height);
    PARCHES_DE_CARTA.forEach(([, color], i) => {
      g.fillStyle = color;
      g.fillRect((i % 2) * 200 + 6, Math.floor(i / 2) * 200 + 6, 188, 188);
    });
    c.toBlob((b) => ok(b!), "image/png");
  }));
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

/** La ficha de la sesión del taller: no se guarda, es para probar. */
const FICHA_TALLER: FichaDeArte = {
  forma: "auto", alto_mm: null, ancho_mm: null, fondo_mm: null,
  apilable: false, acostado: false, fondo_foto: "auto",
};

const mmDeCm = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && n > 0 ? Math.round(n * 10) : null;
};

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

  // ── El banco del producto del proveedor ───────────────────────────────────
  // Se prueba acá, sobre un mueble del catálogo, antes de enchufarlo al
  // editor: el editor son más de cinco mil líneas y ahí se mira a ciegas.
  const [artes, setArtes] = useState<Arte[]>([]);
  useEffect(() => { listarCatalogo().then(setArtes).catch(() => setArtes([])); }, []);
  const [arteId, setArteId] = useState<number | null>(null);
  /** Un archivo local: NUNCA se sube, vive en la pestaña. */
  const [local, setLocal] = useState<File | null>(null);
  const [conCarta, setConCarta] = useState<Blob | null>(null);
  const [modo, setModo] = useState<ModoDeFondo>("auto");
  const [forma, setForma] = useState<FormaDeFicha>("auto");
  const [altoCm, setAltoCm] = useState("");
  const [anchoCm, setAnchoCm] = useState("");
  const [apilable, setApilable] = useState(false);
  const [acostada, setAcostada] = useState(false);
  const [donde, setDonde] = useState<"todas" | number[]>("todas");
  const [enCaraB, setEnCaraB] = useState(false);
  const [luz, setLuz] = useState<"editor" | "neutra">("neutra");
  const [vista, setVista] = useState<"libre" | "frente" | "tres_cuartos" | "cerca">("libre");
  const archivoRef = useRef<HTMLInputElement>(null);
  const [, setVersion] = useState(0);
  const [avisar] = useState(() => () => setVersion((v) => v + 1));

  const def = catalogo >= 0 ? FIXTURE_DEFS[catalogo] : null;
  const venta = useMemo(
    () => (def ? ventaDeTipo(def.type, ancho, fondo, alto, def.gondolaType) : null),
    [def, ancho, fondo, alto],
  );
  const arte = artes.find((a) => a.id === arteId) ?? null;
  const fuente: { clave: string; blob: Blob | string } | null = conCarta
    ? { clave: "carta:v1", blob: conCarta }
    : local
      ? { clave: `local:${local.name}:${local.size}`, blob: local }
      : arte ? { clave: claveDeArte(arte.id, modo), blob: arteUrl(arte.id) } : null;
  // La carta no lleva fondo que quitar: el blanco es uno de los parches.
  const modoEfectivo: ModoDeFondo = conCarta ? "conservar" : modo;
  const claveEtiqueta = fuente ? (fuente.clave.startsWith("catalogo:") ? fuente.clave : `${fuente.clave}:${modoEfectivo}`) : null;
  const etiqueta: Etiqueta | null = fuente && claveEtiqueta
    ? etiquetaDeArte(claveEtiqueta, fuente.blob, modoEfectivo, avisar)
    : null;
  useEffect(() => { marcarEnUso(claveEtiqueta ? [claveEtiqueta] : []); }, [claveEtiqueta]);

  const ficha: FichaDeArte = {
    ...(arte?.ficha ?? FICHA_TALLER),
    ...(forma !== "auto" ? { forma } : {}),
    ...(mmDeCm(altoCm) ? { alto_mm: mmDeCm(altoCm) } : {}),
    ...(mmDeCm(anchoCm) ? { ancho_mm: mmDeCm(anchoCm) } : {}),
    ...(apilable ? { apilable } : {}),
    fondo_foto: modo,
  };
  const empaque = etiqueta
    ? empaqueDeArte(
        conCarta ? { nombre: "Carta de color" } : local ? { nombre: local.name } : { nombre: arte?.nombre ?? "", categoria: arte?.categoria },
        ficha, etiqueta.recorte, { acostado: acostada },
      )
    : null;
  const prueba = etiqueta && empaque && fuente
    ? { etiqueta, empaque, donde, semilla: `taller|A|${fuente.clave}` }
    : null;
  const acomodo = venta && empaque ? unidadesDePrueba({ venta, empaque, donde, semilla: "taller" }) : null;
  const facePaint: FacePaint | null = prueba
    ? {
        front: null, back: null,
        pruebaA: prueba,
        pruebaB: enCaraB ? { ...prueba, semilla: `taller|B|${fuente!.clave}` } : null,
      }
    : null;

  // Las tomas fijas, contra la cara A del mueble (mira a −Z).
  const toma: Toma = useMemo(() => {
    if (vista === "libre") return null;
    const yMedio = alto / 2;
    if (vista === "cerca") {
      // El entrepaño más cerca de 1,30 m, de frente y a medio metro largo.
      const filas = venta?.filas;
      let y = 1.2;
      if (filas) {
        let mejor = Infinity;
        for (let i = 0; i < filas.rows; i++) {
          const c = (filas.alturas[i] + filas.alturas[i + 1]) / 2;
          if (Math.abs(c - 1.3) < mejor) { mejor = Math.abs(c - 1.3); y = c; }
        }
      }
      return { pos: [0, Math.min(1.65, y + 0.2), -(fondo / 2 + 0.85)], mira: [0, y, 0] };
    }
    const dist = Math.max(1.6, (alto * 1.15) / (2 * Math.tan((21 * Math.PI) / 180)));
    const ang = vista === "tres_cuartos" ? (35 * Math.PI) / 180 : 0;
    return {
      pos: [Math.sin(ang) * (fondo / 2 + dist), 1.55, -Math.cos(ang) * (fondo / 2 + dist)],
      mira: [0, yMedio, 0],
    };
  }, [vista, alto, fondo, venta]);

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
        {/* ── El producto del proveedor ─────────────────────────────────── */}
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          arte{" "}
          <select value={arteId ?? ""} style={{ ...campo, width: 190 }}
                  onChange={(e) => { setArteId(e.target.value ? +e.target.value : null); setLocal(null); setConCarta(null); }}>
            <option value="">— sin arte —</option>
            {artes.map((a) => (
              <option key={a.id} value={a.id}>{a.proveedor} · {a.nombre}</option>
            ))}
          </select>
        </label>
        <button type="button" style={{ ...campo, width: "auto" }} onClick={() => archivoRef.current?.click()}>
          o archivo…
        </button>
        <input ref={archivoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
               onChange={(e) => { setLocal(e.target.files?.[0] ?? null); setConCarta(null); }} />
        <button type="button" style={{ ...campo, width: "auto" }}
                onClick={() => { cartaDeColor().then((b) => { setConCarta(b); setLocal(null); }); }}>
          Carta de color
        </button>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          fondo de foto{" "}
          <select value={modo} style={{ ...campo, width: 84 }} onChange={(e) => setModo(e.target.value as ModoDeFondo)}>
            <option value="auto">Auto</option>
            <option value="quitar">Quitar</option>
            <option value="conservar">Dejar</option>
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          forma{" "}
          <select value={forma} style={{ ...campo, width: 84 }} onChange={(e) => setForma(e.target.value as FormaDeFicha)}>
            {["auto", "caja", "botella", "lata", "vaso", "frasco", "bolsa", "otro"].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          alto del envase{" "}
          <input value={altoCm} placeholder="cm" style={{ ...campo, width: 56 }} onChange={(e) => setAltoCm(e.target.value)} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          ancho del envase{" "}
          <input value={anchoCm} placeholder="cm" style={{ ...campo, width: 56 }} onChange={(e) => setAnchoCm(e.target.value)} />
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          <input type="checkbox" checked={apilable} onChange={(e) => setApilable(e.target.checked)} /> se apila
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          <input type="checkbox" checked={acostada} onChange={(e) => setAcostada(e.target.checked)} /> acostada
        </label>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", display: "inline-flex", gap: 4, alignItems: "center" }}>
          dónde
          <button type="button" style={{ ...campo, width: "auto", fontWeight: donde === "todas" ? 700 : 400 }}
                  onClick={() => setDonde("todas")}>Toda la cara</button>
          {venta && Array.from({ length: venta.filas.rows }, (_, i) => {
            const elegida = donde !== "todas" && donde.includes(i);
            return (
              <button key={i} type="button"
                      style={{ ...campo, width: 30, padding: 0, fontWeight: elegida ? 700 : 400,
                               background: elegida ? "var(--accent)" : "var(--surface-2)" }}
                      onClick={() => setDonde((d) => {
                        const lista = d === "todas" ? [] : d;
                        const nueva = lista.includes(i) ? lista.filter((x) => x !== i) : [...lista, i].sort();
                        return nueva.length ? nueva : "todas";
                      })}>
                {i + 1}
              </button>
            );
          })}
        </span>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          <input type="checkbox" checked={enCaraB} onChange={(e) => setEnCaraB(e.target.checked)} /> cara B
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          luz{" "}
          <select value={luz} style={{ ...campo, width: 84 }} onChange={(e) => setLuz(e.target.value as "editor" | "neutra")}>
            <option value="neutra">neutra</option>
            <option value="editor">editor</option>
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          cámara{" "}
          <select value={vista} style={{ ...campo, width: 110 }}
                  onChange={(e) => setVista(e.target.value as typeof vista)}>
            <option value="libre">libre</option>
            <option value="frente">de frente</option>
            <option value="tres_cuartos">tres cuartos</option>
            <option value="cerca">de cerca</option>
          </select>
        </label>
      </header>

      {/* La tira de diagnóstico: qué se hizo con la foto y qué medidas salieron. */}
      {fuente && (
        <div
          data-diagnostico
          style={{
            display: "flex", gap: 12, alignItems: "center", padding: "6px 16px",
            borderBottom: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5,
            color: "var(--ink-2)",
          }}
        >
          {etiqueta ? (
            <>
              <img
                alt=""
                src={etiqueta.lienzo.toDataURL()}
                style={{
                  height: 64, background:
                    "repeating-conic-gradient(#d6d6d6 0% 25%, #fff 0% 50%) 50% / 12px 12px",
                }}
              />
              <span>
                <b>{etiqueta.recorte.estado}</b> · aspecto {etiqueta.recorte.aspecto.toFixed(3)} · relleno{" "}
                {etiqueta.recorte.relleno.toFixed(2)} · simetría {etiqueta.recorte.simetria.toFixed(3)} · marca{" "}
                <span style={{ display: "inline-block", width: 10, height: 10, background: etiqueta.recorte.colorDominante }} />
                {etiqueta.recorte.avisos.length ? ` · ${etiqueta.recorte.avisos.join(" / ")}` : ""}
              </span>
              {empaque && (
                <span data-empaque>
                  {empaque.estimado || empaque.anchoEstimado ? "≈ " : ""}
                  {Math.round(empaque.ancho * 1000)}×{Math.round(empaque.alto * 1000)}×{Math.round(empaque.fondo * 1000)} mm
                  · {empaque.envase} · {empaque.de}
                </span>
              )}
              {acomodo && (
                <span data-frentes>
                  frentes por fila: {acomodo.porFila.map((f) => (f.motivo ? `${f.frentes}(${f.motivo})` : `${f.frentes}×${f.fondoVisible}×${f.pisos}`)).join(" · ")}
                </span>
              )}
            </>
          ) : (
            <span>Recortando la foto…</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <Canvas
          camera={camara}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 1.75]}
          style={{ background: "#c8c5bf" }}
        >
          <Suspense fallback={null}>
            <Controles toma={toma} />
            {luz === "editor" ? (
              <LuzDelEditor />
            ) : (
              <>
                <EntornoNeutro />
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
              </>
            )}
            <Piso />
            {catalogo >= 0 ? (
              <FixtureMesh fixture={delCatalogo(catalogo, ancho, fondo, alto, rubro)} facePaint={facePaint} />
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
