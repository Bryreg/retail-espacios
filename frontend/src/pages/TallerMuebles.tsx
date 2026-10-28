import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GondolaReal } from "../components/StoreEditor3D/muebles/GondolaReal";
import { ProductoEnGondola } from "../components/StoreEditor3D/muebles/ProductoEnGondola";
import { PuntaReal } from "../components/StoreEditor3D/muebles/PuntaReal";
import { ProductoEnPunta } from "../components/StoreEditor3D/muebles/ProductoEnPunta";
import { NeveraReal } from "../components/StoreEditor3D/muebles/NeveraReal";
import { geometriaDe, puertasDe } from "../components/StoreEditor3D/muebles/medidas";
import { FixtureMesh, FIXTURE_DEFS } from "../components/StoreEditor3D/StoreEditor3D";
import type { FacePaint, PlacedFixture } from "../components/StoreEditor3D/StoreEditor3D";
import type { SlotDeProducto } from "../components/StoreEditor3D/muebles/ProductoEnGondola";
import { ventaDeTipo } from "../components/StoreEditor3D/muebles/venta";
import { partesNumeradas, type ParteNumerada } from "../components/StoreEditor3D/muebles/contornos";
import { Html } from "@react-three/drei";
import { unidadesDePrueba } from "../components/StoreEditor3D/muebles/frentes";
import { empaqueDeArte } from "../components/StoreEditor3D/muebles/producto";
import type { FichaDeArte, FormaDeFicha } from "../components/StoreEditor3D/muebles/producto";
import { claveDeArte, etiquetaDeArte, marcarEnUso } from "../components/StoreEditor3D/muebles/etiqueta";
import type { Etiqueta } from "../components/StoreEditor3D/muebles/etiqueta";
import type { ModoDeFondo } from "../components/StoreEditor3D/muebles/recorte";
import { arteUrl, listarCatalogo, type Arte } from "../api/catalogo";
import { defDeModelo, paletaConPropias } from "../catalogo/editor3D";
import type { FixtureDef } from "../catalogo/editor3D";
import { fichaDe } from "../utils/convertirPlano";
import type { ShelfSlot } from "../types/fixtures";
import { useFichasPropias } from "../store/fichasPropias";
import { PanelDeFichas } from "../components/taller/PanelDeFichas";
import {
  FAMILIAS_DEL_FORMULARIO, familiaDe, fichaParaDibujar, formularioVacio, type FormularioDeFicha,
} from "../utils/formularioDeFicha";
import { resolverTipo } from "../catalogo/catalogo";

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
 *
 * Y es donde la dueña arma las FICHAS de sus muebles (pestaña «Fichas»,
 * `components/taller/PanelDeFichas.tsx`): el mueble que su supermercado tiene
 * y el catálogo no, con sus medidas y de dónde salieron. Mientras escribe, al
 * lado se dibuja ESE mueble con esa ficha estampada —con la misma entrada de
 * paleta con que se colocará (`defDeModelo`)—, y al guardarla aparece en
 * «Mis muebles», el catálogo del plano 2D.
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

function Controles({ toma, girar = false }: { toma: Toma; girar?: boolean }) {
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
function delCatalogo(
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
function ParteNumeradaDelTaller({ p }: { p: ParteNumerada }) {
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

/** Cuánto aire queda entre el mueble y el de hoy, cuando se miran juntos. */
const SEPARACION_DEL_DE_HOY = 0.6;

/** La ficha de la sesión del taller: no se guarda, es para probar. */
const FICHA_TALLER: FichaDeArte = {
  forma: "auto", alto_mm: null, ancho_mm: null, fondo_mm: null,
  apilable: false, acostado: false, fondo_foto: "auto",
};

const mmDeCm = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && n > 0 ? Math.round(n * 10) : null;
};

/** La familia del formulario para un tipo del plano 2D (`gondola_doble` →
 *  `gondola:double`), si admite ficha. */
function entradaDelPlano(tipo: string | null): string | undefined {
  const r = tipo ? resolverTipo(tipo) : null;
  if (!r) return undefined;
  const entrada = r.variante !== undefined ? `${r.clave}:${r.variante}` : r.clave;
  return familiaDe(entrada) ? entrada : undefined;
}

export default function TallerMuebles() {
  // Desde el plano (2026-10-28): «Crear un mueble con otras medidas» trae acá
  // con la sede y el tipo que se estaba por colocar. Se abre en «Fichas», en
  // esa familia, con un aviso que dice de dónde se vino y la vuelta al plano,
  // que abre el catálogo con «Mis muebles» a la vista.
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const desdePlano = params.get("desde") === "plano";
  const sedeDelPlano = params.get("sede") ?? "";
  const [guardadaDesdePlano, setGuardadaDesdePlano] = useState<string | null>(null);
  const volverAlPlano = () => navigate("/plano", { state: { delTaller: true } });
  /** «Mirar» es el banco de siempre; «Fichas», donde la dueña arma las de sus
   *  muebles y las ve dibujadas mientras escribe. */
  const [pestana, setPestana] = useState<"mirar" | "fichas">(desdePlano ? "fichas" : "mirar");
  const [formFicha, setFormFicha] = useState<FormularioDeFicha>(() => formularioVacio(
    (desdePlano ? entradaDelPlano(params.get("tipo")) : undefined) ?? FAMILIAS_DEL_FORMULARIO[0]?.entrada ?? "gondola:double"));
  /** La clave de la ficha que se edita; `null`, una nueva. */
  const [editandoFicha, setEditandoFicha] = useState<string | null>(null);
  const [girar, setGirar] = useState(true);
  /** La paleta con las fichas propias del supermercado, como la ven los
   *  editores: el taller mira también las suyas. */
  const propias = useFichasPropias();
  const paleta = useMemo(() => paletaConPropias(propias), [propias]);
  /** Qué mueble del catálogo se está mirando. -1 = los del taller. */
  const [catalogo, setCatalogo] = useState(-1);
  /** Cuál de sus modelos (`paleta`). -1 = el modelo base, el de hoy. */
  const [modeloI, setModeloI] = useState(-1);
  /** Qué se dibuja al lado del modelo, para compararlo contra lo de siempre a
   *  la misma escala y con la misma luz. Los dos van SIN ficha:
   *  · `de_hoy` — el modelo base con sus medidas de catálogo: lo que hoy
   *    coloca el editor;
   *  · `sin_ficha` — el mismo tipo con las medidas de este modelo: lo que la
   *    ficha cambia (entrepaños, módulo, puertas) y nada más. */
  const [alLado, setAlLado] = useState<"nada" | "de_hoy" | "sin_ficha">("nada");
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

  const enFichas = pestana === "fichas";
  // En «Fichas» se mira la ficha que se está escribiendo, con la MISMA entrada
  // de paleta con que se colocará (`defDeModelo`, la de los editores): sus
  // medidas, su color y su geometría estampadas.
  const fichaVista = useMemo(() => (enFichas ? fichaParaDibujar(formFicha) : null), [enFichas, formFicha]);
  const indiceFicha = fichaVista ? paleta.findIndex((f) => f.entrada === formFicha.entrada) : -1;
  const defFicha = useMemo(
    () => (fichaVista && indiceFicha >= 0 ? defDeModelo(paleta[indiceFicha].base, fichaVista) : null),
    [fichaVista, indiceFicha, paleta],
  );
  /** El mueble del catálogo que se dibuja, y con qué medidas. */
  const indiceVisto = enFichas ? indiceFicha : catalogo;
  const [anchoV, fondoV, altoV] = enFichas && defFicha ? [defFicha.w, defFicha.d, defFicha.h] : [ancho, fondo, alto];
  const def = indiceVisto >= 0 ? FIXTURE_DEFS[indiceVisto] : null;
  const modelos = catalogo >= 0 ? paleta[catalogo]?.modelos ?? [] : [];
  const modelo = enFichas ? defFicha : modelos[modeloI] ?? null;
  // La venta con la ficha del modelo: si no, las filas de «dónde» y la toma de
  // cerca saldrían de la cuenta de siempre y no de los entrepaños dibujados.
  const geometria = useMemo(() => (modelo ? geometriaDe(modelo) : undefined), [modelo]);
  // En «Fichas», las partes que va a vender lo que se coloque desde esta
  // ficha, numeradas sobre el mueble que gira (vender por partes).
  const numeradas = useMemo(
    () => (enFichas && def && defFicha
      ? partesNumeradas({ type: def.type, gondolaType: def.gondolaType, w: anchoV, d: fondoV, h: altoV,
        partes: defFicha.partes, entrepanos: defFicha.entrepanos, modulo: defFicha.modulo })
      : []),
    [enFichas, def, defFicha, anchoV, fondoV, altoV],
  );
  const venta = useMemo(
    () => (def ? ventaDeTipo(def.type, anchoV, fondoV, altoV, def.gondolaType, geometria) : null),
    [def, anchoV, fondoV, altoV, geometria],
  );
  // Memorizado: la toma depende de esto, y un objeto nuevo en cada dibujo
  // devolvería la cámara a la toma fija a cada rato.
  const deHoy = useMemo(
    () => (!def || !modelo || enFichas || alLado === "nada" ? null
      : alLado === "de_hoy" ? { w: def.w, d: def.d, h: def.h }
      : { w: ancho, d: fondo, h: alto }),
    [def, modelo, enFichas, alLado, ancho, fondo, alto],
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

  // Las tomas fijas, contra la cara A del mueble (mira a −Z). En «Fichas» la
  // cámara arranca a tres cuartos y encuadra el mueble entero, que gira: con la
  // órbita libre una nevera de 1,45 llenaba el cuadro y se miraba por detrás.
  const vistaEfectiva = enFichas && vista === "libre" ? "tres_cuartos" : vista;
  const toma: Toma = useMemo(() => {
    const vista = vistaEfectiva;
    if (vista === "libre") return null;
    const yMedio = altoV / 2;
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
      return { pos: [0, Math.min(1.65, y + 0.2), -(fondoV / 2 + 0.85)], mira: [0, y, 0] };
    }
    // Con el de hoy al lado, la toma encuadra a los dos: se corre al centro
    // del par. Y se aleja lo que pida el ancho, haya o no otro al lado: con
    // sólo el alto, la nevera de 4 puertas (2,72 de frente) salía cortada
    // por los costados (el lienzo es más ancho que alto; 1,3 es un mínimo
    // prudente).
    const tan = Math.tan((21 * Math.PI) / 180);
    const altoEscena = Math.max(altoV, deHoy?.h ?? 0);
    const anchoEscena = deHoy ? anchoV + SEPARACION_DEL_DE_HOY + deHoy.w : anchoV;
    const fondoEscena = Math.max(fondoV, deHoy?.d ?? 0);
    const cx = deHoy ? -(SEPARACION_DEL_DE_HOY + deHoy.w) / 2 : 0;
    const ang = vista === "tres_cuartos" ? (35 * Math.PI) / 180 : 0;
    const yMira = Math.max(yMedio, altoEscena / 2);
    const altoDeCamara = 1.55;
    let dist = Math.max(1.6, (altoEscena * 1.15) / (2 * tan), (anchoEscena * 1.1) / (2 * tan * 1.3));
    // Y lo que pida el piso: la esquina de abajo más cercana a la cámara
    // tiene que entrar en el cuadro. Mirando a media torre, la estiba sin
    // producto (la madera llega a 14 cm) salía con esa esquina cortada.
    const cerca = (anchoEscena / 2) * Math.sin(ang) + (fondoEscena / 2) * Math.cos(ang);
    for (let i = 0; i < 20; i++) {
      const lejos = fondoEscena / 2 + dist;
      const bajaLaToma = Math.atan2(altoDeCamara - yMira, lejos);
      const bajaLaEsquina = Math.atan2(altoDeCamara, Math.max(0.1, lejos - cerca));
      if (bajaLaEsquina <= bajaLaToma + (19 * Math.PI) / 180) break;
      dist *= 1.1;
    }
    return {
      pos: [cx + Math.sin(ang) * (fondoEscena / 2 + dist), altoDeCamara, -Math.cos(ang) * (fondoEscena / 2 + dist)],
      mira: [cx, yMira, 0],
    };
  }, [vistaEfectiva, altoV, fondoV, anchoV, venta, deHoy]);

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
        <span role="tablist" style={{ display: "inline-flex", gap: 4 }}>
          {([["mirar", "Mirar"], ["fichas", "Fichas"]] as const).map(([valor, rotulo]) => (
            <button key={valor} type="button" role="tab" aria-selected={pestana === valor} data-pestana={valor}
                    style={{ ...campo, width: "auto", fontWeight: pestana === valor ? 700 : 400,
                             background: pestana === valor ? "var(--surface-3)" : "var(--surface-2)" }}
                    onClick={() => setPestana(valor)}>
              {rotulo}
            </button>
          ))}
        </span>
        {enFichas ? (
          <>
            <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              <input type="checkbox" checked={girar} onChange={(e) => setGirar(e.target.checked)} /> girar
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
            <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              cámara{" "}
              <select value={vistaEfectiva} style={{ ...campo, width: 110 }}
                      onChange={(e) => setVista(e.target.value as typeof vista)}>
                <option value="frente">de frente</option>
                <option value="tres_cuartos">tres cuartos</option>
                <option value="cerca">de cerca</option>
              </select>
            </label>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              Se dibuja con la ficha que estás escribiendo, como se va a colocar.
            </span>
          </>
        ) : (
        <>
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
                    setModeloI(-1);
                    const def = FIXTURE_DEFS[i];
                    if (def) { setAncho(def.w); setFondo(def.d); setAlto(def.h); }
                  }}>
            <option value={-1}>— piezas del taller —</option>
            {FIXTURE_DEFS.map((d, i) => (
              <option key={`${d.type}-${i}`} value={i}>{d.label}</option>
            ))}
          </select>
        </label>
        {modelos.length > 0 && (
          <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            modelo{" "}
            <select data-modelo value={modeloI} style={{ ...campo, width: 230 }}
                    onChange={(e) => {
                      const i = +e.target.value;
                      setModeloI(i);
                      // Con las medidas de su ficha, como lo coloca la paleta.
                      const m = modelos[i] ?? def;
                      if (m) { setAncho(m.w); setFondo(m.d); setAlto(m.h); }
                    }}>
              <option value={-1}>— el de hoy —</option>
              {modelos.map((m, i) => (
                <option key={m.modelo} value={i}>{m.estimado ? "≈ " : ""}{m.nombreModelo}{m.comoSeVende ? ` · ${m.comoSeVende}` : ""}</option>
              ))}
            </select>
          </label>
        )}
        {modelo && (
          <label style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            al lado{" "}
            <select data-al-lado value={alLado} style={{ ...campo, width: 190 }}
                    onChange={(e) => setAlLado(e.target.value as typeof alLado)}>
              <option value="nada">— nada —</option>
              <option value="de_hoy">el de hoy, con sus medidas</option>
              <option value="sin_ficha">el mismo sin ficha</option>
            </select>
          </label>
        )}
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
        </>
        )}
      </header>

      {/* La tira de diagnóstico: qué se hizo con la foto y qué medidas salieron. */}
      {fuente && !enFichas && (
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

      {desdePlano && (
        <div role="status" data-taller-desde-plano
          style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "10px 16px", borderBottom: "1px solid var(--line)",
            background: "var(--surface-2)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45,
          }}>
          <span style={{ flex: "1 1 280px", minWidth: 0 }}>
            {guardadaDesdePlano ? (
              <>Listo: <b style={{ color: "var(--ink-1)" }}>«{guardadaDesdePlano}»</b> ya está en «Mis muebles», en el catálogo del plano.</>
            ) : (
              <>Desde el plano{sedeDelPlano ? <> de <b style={{ color: "var(--ink-1)" }}>{sedeDelPlano}</b></> : null}: armá el mueble con sus medidas.
                Al guardarlo aparece en «Mis muebles», en el catálogo del plano.</>
            )}
          </span>
          <button type="button" onClick={volverAlPlano} data-volver-al-plano
            style={{ ...campo, width: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--ink-1)", cursor: "pointer" }}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden /> {guardadaDesdePlano ? "Volver al plano a colocarlo" : "Volver al plano"}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {enFichas && (
          <PanelDeFichas form={formFicha} onForm={setFormFicha}
                         editando={editandoFicha} onEditando={setEditandoFicha}
                         onGuardada={desdePlano ? setGuardadaDesdePlano : undefined} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
        <Canvas
          camera={camara}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 1.75]}
          style={{ background: "#c8c5bf" }}
        >
          <Suspense fallback={null}>
            <Controles toma={toma} girar={enFichas && girar} />
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
            {indiceVisto >= 0 && def ? (
              <>
                {!conProducto && (def.type === "nevera_puertas" || def.type === "nevera_refrescos") ? (
                  // La nevera llena sus rejillas aunque esté libre (es como se
                  // ve en el editor): para mirarle las rejillas y las puertas
                  // sin botellas, el mismo cuerpo sin el relleno.
                  <NeveraReal w={anchoV} d={fondoV} h={altoV} conRelleno={false}
                    variante={def.type === "nevera_puertas" ? "puertas" : "multideck"}
                    puertas={def.type === "nevera_puertas" ? puertasDe(anchoV, geometria?.puertas) : undefined}
                    tramos={def.type === "nevera_refrescos" ? geometria?.tramos : undefined} />
                ) : (
                  <FixtureMesh fixture={delCatalogo(indiceVisto, anchoV, fondoV, altoV, conProducto ? rubro : "", modelo)}
                    facePaint={enFichas ? null : facePaint} />
                )}
                {numeradas.map((p, i) => <ParteNumeradaDelTaller key={`${p.etiqueta}-${i}`} p={p} />)}
                {deHoy && (
                  <group position={[-(anchoV / 2 + SEPARACION_DEL_DE_HOY + deHoy.w / 2), 0, 0]}>
                    {!conProducto && (def.type === "nevera_puertas" || def.type === "nevera_refrescos") ? (
                      // Igual que el de la ficha: sin producto, sin relleno.
                      // Si no, se comparan rejillas vacías contra botellas.
                      <NeveraReal w={deHoy.w} d={deHoy.d} h={deHoy.h} conRelleno={false}
                        variante={def.type === "nevera_puertas" ? "puertas" : "multideck"}
                        puertas={def.type === "nevera_puertas" ? puertasDe(deHoy.w) : undefined} />
                    ) : (
                      <FixtureMesh fixture={delCatalogo(catalogo, deHoy.w, deHoy.d, deHoy.h, conProducto ? rubro : "")} />
                    )}
                  </group>
                )}
              </>
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
    </div>
  );
}
