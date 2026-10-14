import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as ControlesDeOrbita } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, ChevronRight, Download, FileCheck, Loader2, Search, Upload, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { useModalAbierto } from "../../tema";
import { arteUrl, esProveedorNuevo, listarDelProveedor, subirArteDelProveedor, type Arte } from "../../api/catalogo";
import { describeError } from "../../api/client";
import { normalDeCara, type TomaDeVenta } from "../../utils/planta";
import { normalizarProveedor } from "../../utils/proveedor";
import { componerPropuesta, descargar, nombreDeArchivo, prepararToma, type DatosPropuesta } from "../../utils/propuesta";
import {
  CAM_POS, CAM_TARGET, CanvasErrorBoundary, FONDO_DE_SALA, FOV_DEL_EDITOR, HOLGURA_DE_LAMINA, HudQueSeEsconde,
  nombresDeLaPrueba, PanelDePrueba, Scene, storeToFixtures, TIPOS_CON_PRODUCTO, TIPOS_CON_PRUEBA_3D, TIPOS_CON_SURTIDO,
  type ComoSePrueba, type EstadoDeEscena, type PedidoDeToma, type PlacedFixture,
} from "../StoreEditor3D/StoreEditor3D";
import EditorDeFicha, { FICHA_VACIA } from "../StoreEditor3D/EditorDeFicha";
import type { FichaDeArte } from "../StoreEditor3D/muebles/producto";
import { arteALaVista, pruebasDelContrato, sinDatosComerciales, sinRepisasVendidas } from "../StoreEditor3D/muebles/privacidad";
import { RellenoNeutro } from "../StoreEditor3D/muebles/luzDeVenta";
import { olvidarEtiquetas, precalentarEtiquetas, registrarRenderer } from "../StoreEditor3D/muebles/etiqueta";
import { olvidarGeometrias } from "../StoreEditor3D/muebles/perfiles";
import { olvidarCopetes } from "../StoreEditor3D/muebles/pop";
import type { SesionDeVenta } from "./sesionDeVenta";
// Los estilos de la chapa, el HUD y el cajón bajan con el visor; la capa y el
// aviso de falla están en `vender.css` (tienen que verse aunque esto no baje).
import "./visor.css";

/**
 * EL VISOR 3D DE VENDER — «¿y cómo queda?», sin salir del contrato.
 *
 * La dueña arma el contrato en Vender con el proveedor del otro lado del
 * monitor (o de la videollamada) y la pregunta llega sola: «¿y cómo se vería
 * mi producto acá?». Antes había que ir a la pestaña Editor 3D, y cambiar de
 * pestaña desmonta Vender entera: se perdía el contrato a medio llenar.
 *
 * Esto es una CAPA encima de la ficha (un portal), no otra pestaña: la ficha
 * sigue montada debajo, con todo lo tecleado, y al cerrar está exactamente
 * como quedó. Se baja recién cuando se abre (`lazy` en `ModoVender.tsx`):
 * Vender no carga three.js para quien sólo vende.
 *
 * LO QUE ESTA PANTALLA NO PUEDE HACER, porque la mira el proveedor:
 *
 * · Mostrar algo de OTRO proveedor. Los muebles llegan sin datos comerciales
 *   (`sinDatosComerciales`); el catálogo se pide por el nombre del contrato y
 *   el servidor devuelve sólo los de ése (`listarDelProveedor`); la escena va
 *   con `soloVenta` (no baja las fotos de las caras) y con `privadoPara`
 *   SIEMPRE definido —el `supplier_id` del que mira o `null`—, así que la
 *   prueba de nadie más se dibuja. Ni lista de proveedores, ni buscador de
 *   proveedores: el único nombre que se escribe es el del contrato.
 * · Escribir algo. Ni el plano, ni el store, ni la cámara del Editor 3D, ni
 *   `enfoque3D` (que cambia de pestaña y desmonta Vender), ni la sede. La
 *   prueba vive en la ficha (`useSesionDeVenta`). Lo único que sube al
 *   servidor es un producto nuevo («Subir un producto») o sus medidas.
 *
 * Es la MISMA escena que «Presentar» del editor —la sala de venta, la luz, la
 * persona de 1,70 m, las tres tomas—: lo que la dueña aprobó ahí es lo que se
 * ve acá.
 */

// ─── Lo que recibe ───────────────────────────────────────────────────────────

/** Una cara del contrato, como la lee el visor: dónde está y cómo se llama.
 *  Nada comercial cruza desde la ficha: ni valores, ni fechas, ni la tarifa. */
export interface CaraDelVisor {
  fixtureId: string;
  face: "A" | "B";
  /** `PUN-03`, `GON-02·B`: como se lee en la ficha. */
  visible: string;
  /** `PRINCIPAL-PUN-03`, `PRINCIPAL-GON-02-B`: el código completo, el que
   *  encabeza la lámina. */
  codigo: string;
  /** «Punta de góndola», «Góndola, por cara». */
  tipo: string;
  /** Vender por partes: las puertas de esta cara que van en el contrato,
   *  como vanos del DIBUJO (`vanoDeParte`). Se marcan y el producto en prueba
   *  va sólo detrás de ellas. Sin esto, la cara entera. */
  vanos?: number[];
}

export interface CaraActiva { fixtureId: string; face: "A" | "B" }

interface VisorDeVentaProps {
  caras: CaraDelVisor[];
  activa: CaraActiva;
  onActiva: (c: CaraActiva) => void;
  /** El proveedor del contrato, tal como está tecleado en la ficha. */
  proveedor: string;
  /** Escribe el proveedor EN LA FICHA: si la dueña lo teclea acá, queda en
   *  el contrato. */
  onProveedor: (s: string) => void;
  sesion: SesionDeVenta;
  onCerrar: () => void;
  /** La sede, para el pie de la lámina. */
  sede: string;
  /** Adjunta la lámina como planometría DEL CONTRATO (el campo de la ficha,
   *  que sigue montada debajo). Nunca el plano. `cara` es la de la lámina
   *  (`GON-02·A`): la ficha la recuerda para decir de quién es, y la saca si
   *  cambia el proveedor. `proveedor` es el nombre (normalizado) con que se
   *  ARMÓ: si el contrato ya es de otro, la ficha no la adjunta y devuelve
   *  `false`. */
  onPlanometria: (archivo: File, cara: string, proveedor: string) => boolean;
  /** Lo que la ficha tiene como planometría: la lámina de una cara (armada
   *  acá, con el proveedor de ahora: si cambia, la ficha la saca), otro
   *  archivo, o nada. El otro archivo NO se nombra: su nombre lo puso quien
   *  lo subió y puede ser el de cualquiera. */
  planometria: { lamina: string } | "otra" | null;
}

// ─── Constantes de la escena ─────────────────────────────────────────────────
//
// Todo lo de edición que la escena pide como prop, apagado. Son constantes de
// MÓDULO: con funciones nuevas en cada render el `memo` del lienzo no serviría
// y teclear en el cajón redibujaría la tienda entera.

/** Sin unificados: la escena no los necesita para pintar (y no hay
 *  insignias de «sin contrato» ni nada que salga de un contrato). */
const SIN_UNIFICADOS: [] = [];
const NADA = () => {};
const NADA_CON_MUEBLES: React.Dispatch<React.SetStateAction<PlacedFixture[]>> = () => {};
const NADA_CON_VISTA = (_fn: () => void) => {};

/** Las tres tomas del vendedor, en el orden del HUD. */
const TOMAS: readonly [TomaDeVenta, string][] = [["frente", "De frente"], ["tres_cuartos", "Tres cuartos"], ["cerca", "De cerca"]];

/** Cuánto se espera después de la última tecla del proveedor antes de pedir su
 *  catálogo: el nombre se teclea letra por letra. */
const ESPERA_DEL_CATALOGO_MS = 400;

const claveDe = (c: CaraActiva) => `${c.fixtureId}|${c.face}`;

/** Sin catálogo: una constante, para que el `memo` del lienzo no vea una
 *  lista «nueva» en cada render. */
const SIN_ARTES: Arte[] = [];
const CATALOGO_VACIO = { de: "", lista: SIN_ARTES };

/** Lo que tira `armarLamina` cuando, entre toma y toma, cambió lo que se
 *  estaba mostrando (se cerró el visor, otra cara, otro proveedor): la lámina
 *  a medio armar ya no es de lo que está en pantalla y se descarta entera. */
const INTERRUMPIDA = new Error("la lámina se interrumpió");

// ─── La escena, en su propia pieza ───────────────────────────────────────────

/**
 * El lienzo con la escena. En `memo`: lo que se teclea en el cajón (el
 * buscador, el formulario) cambia el estado del visor y NO tiene que llegar
 * acá. Sólo lo redibuja lo que cambia lo que se ve.
 */
const Lienzo = memo(function Lienzo({
  muebles, privadoPara, sinArte, prueba, como, artes, pedido, estado, orbitRef, onCaptura, vanos,
}: {
  /** Vender por partes: las puertas que se venden, por cara. */
  vanos: ReadonlyMap<string, readonly number[]>;
  muebles: PlacedFixture[];
  privadoPara: number | null;
  sinArte: boolean;
  prueba: ReadonlyMap<string, number>;
  como: ReadonlyMap<string, ComoSePrueba>;
  artes: Arte[];
  pedido: PedidoDeToma | null;
  estado: React.MutableRefObject<EstadoDeEscena>;
  /** La órbita, en manos del visor: le pone los límites a cada toma. */
  orbitRef: React.MutableRefObject<ControlesDeOrbita | null>;
  /** Recibe la función que saca una captura del lienzo (la lámina). Estable. */
  onCaptura: (fn: () => string) => void;
}) {
  const draggingId = useRef<string | null>(null);
  return (
    <CanvasErrorBoundary>
      {/* El mismo lienzo que el editor: la misma cámara de partida, las
          mismas sombras, el mismo fondo de sala y `preserveDrawingBuffer`
          (una captura de pantalla de la dueña tiene que salir con imagen). */}
      <Canvas
        camera={{ position: CAM_POS, fov: FOV_DEL_EDITOR, near: 0.1, far: 500 }}
        onCreated={({ camera, gl, scene }) => {
          camera.lookAt(...CAM_TARGET);
          // Para adelantar en los ratos libres la subida de las texturas del
          // envase (`etiqueta.ts`, «El precalentado»).
          registrarRenderer(gl, scene, camera);
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        frameloop="demand"
        dpr={[1, 1.5]}
        style={{ background: FONDO_DE_SALA, width: "100%", height: "100%" }}
      >
        {/* Lo ajeno en grises (`RellenoNeutro`): el único color de la
            pantalla es el del proveedor que mira. Adentro del lienzo, que es
            otra raíz de React: la escena no se entera. */}
        <RellenoNeutro.Provider value>
        <Scene
          soloVenta
          placedFixtures={muebles}
          fixtures={SIN_UNIFICADOS}
          selectedId={null}
          selectedSlotId={null}
          hoveredSlotId={null}
          setHoveredSlotId={NADA}
          placingDef={null}
          ghostX={0}
          ghostZ={0}
          ghostRotY={0}
          ghostCollides={false}
          draggingId={draggingId}
          orbitRef={orbitRef}
          onFloorMove={NADA}
          onFloorClick={NADA}
          onSelectFixture={NADA}
          onSelectSlot={NADA}
          setPlacedFixtures={NADA_CON_MUEBLES}
          screenshotReady={onCaptura}
          topViewReady={NADA_CON_VISTA}
          firstPerson={false}
          sinArte={sinArte}
          prueba={prueba}
          comoSePrueba={como}
          catalogo={artes}
          presentationMode
          privadoPara={privadoPara}
          pedidoDeToma={pedido}
          onCamaraFP={NADA}
          saltarA={null}
          onHoverFixture={NADA}
          estadoDeEscena={estado}
          vanosALaVenta={vanos}
        />
        </RellenoNeutro.Provider>
      </Canvas>
    </CanvasErrorBoundary>
  );
});

// ─── El visor ────────────────────────────────────────────────────────────────

export default function VisorDeVenta({
  caras, activa, onActiva, proveedor, onProveedor, sesion, onCerrar, sede, onPlanometria, planometria,
}: VisorDeVentaProps) {
  const raiz = useRef<HTMLDivElement>(null);
  const volver = useRef<HTMLButtonElement>(null);
  const isAdmin = useAuthStore(selectIsAdmin);
  const orbitRef = useRef<ControlesDeOrbita | null>(null);
  /** Saca una captura del lienzo (la arma la escena: `ScreenshotCapture`). */
  const captura = useRef<(() => string) | null>(null);
  const alTenerCaptura = useCallback((fn: () => string) => { captura.current = fn; }, []);

  // ── La capa ─────────────────────────────────────────────────────────────
  // Mientras está abierto, ÉL es la pantalla: el amarillo de la ficha de
  // atrás pasa a tinta (`useModalAbierto`) y la app de atrás no recibe ni el
  // foco ni el teclado (`inert`): sin eso el Tab caía en los campos del
  // contrato, tapados, y se escribía en ellos sin verlos.
  useModalAbierto();
  useEffect(() => {
    const app = document.getElementById("root");
    app?.setAttribute("inert", "");
    volver.current?.focus();
    return () => app?.removeAttribute("inert");
  }, []);
  // La memoria de video se suelta al cerrar, como al salir del editor: las
  // geometrías de los envases, las etiquetas (texturas de hasta 1024 px) y los
  // copetes. Reabrir las vuelve a armar.
  useEffect(() => () => { olvidarGeometrias(); olvidarEtiquetas(); olvidarCopetes(); }, []);

  // Esc cierra el visor. El primer Esc, con pantalla completa, lo consume el
  // navegador para salir de ella; el segundo llega acá. Adentro de un campo
  // (el buscador, el proveedor, las medidas) Esc no cierra nada.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  // La pantalla completa la pide la ficha EN EL CLIC que abre el visor (después
  // del import el navegador ya no la da). Si se pierde —Ctrl+Tab a la
  // videollamada la saca—, el visor sigue tapando la app y el HUD ofrece
  // volver, que es el gesto que el navegador pide.
  const [pantallaCompleta, setPantallaCompleta] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  const pedirPantallaCompleta = () => {
    const el = document.documentElement;
    if (document.fullscreenElement || typeof el.requestFullscreen !== "function") return;
    el.requestFullscreen().catch(() => { /* la negó: el visor ya tapa todo */ });
  };

  // ── Los muebles: los de la sede, sin un solo dato comercial ─────────────
  // Y los del contrato con la cara ENTERA a la venta (`sinRepisasVendidas`):
  // los espacios internos que el plano da por vendidos aparte no tienen
  // contrato, Vender los ofrece, y mostrárselos vendidos al proveedor era
  // contradecir lo que se le vende. A la dueña se le avisa en la fila.
  const unificados = useFixtureStore(selectFixtures);
  const idsDelContrato = caras.map((c) => c.fixtureId).join(",");
  const muebles = useMemo(
    () => sinRepisasVendidas(sinDatosComerciales(storeToFixtures(unificados)), new Set(idsDelContrato.split(","))),
    [unificados, idsDelContrato],
  );
  const mueble = muebles.find((f) => f.id === activa.fixtureId) ?? null;
  /** Vender por partes: las puertas que van en el contrato, por cara
   *  (`${fixtureId}|${cara}` → vanos del dibujo). Con la firma en texto: la
   *  lista de caras llega nueva en cada render de la ficha, y el lienzo está en
   *  `memo`. */
  const firmaDeVanos = caras.filter((c) => c.vanos?.length).map((c) => `${c.fixtureId}|${c.face}:${c.vanos!.join(",")}`).join(";");
  const vanos = useMemo(() => new Map<string, readonly number[]>(
    firmaDeVanos ? firmaDeVanos.split(";").map((t) => {
      const [k, v] = t.split(":");
      return [k, v.split(",").map(Number)] as [string, number[]];
    }) : [],
  ), [firmaDeVanos]);
  const mueblesRef = useRef(muebles);
  mueblesRef.current = muebles;
  const cara = caras.find((c) => c.fixtureId === activa.fixtureId && c.face === activa.face) ?? null;
  // Si la cara se fue —la sincronización trajo un plano sin ese mueble, o
  // salió del contrato— no hay nada que mostrar: se vuelve a la ficha.
  useEffect(() => {
    if (!mueble || !cara) onCerrar();
  }, [mueble, cara, onCerrar]);

  // ── El catálogo: SÓLO el del proveedor del contrato ─────────────────────
  /** El catálogo que trajo el servidor, CON el nombre (normalizado) para el
   *  que se pidió: una lista sabe de quién es (ver `artes`, abajo). */
  const [catalogo, setCatalogo] = useState<{ de: string; lista: Arte[] }>(CATALOGO_VACIO);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState("");
  const pedidoDelCatalogo = useRef(0);
  const nombre = proveedor.trim();
  /** El nombre VIGENTE, para lo que termina después de un `await` (la subida
   *  de un producto, la lámina). La función que espera se armó en el render
   *  del clic y tiene adentro el nombre de ESE momento: «Subir» que terminaba
   *  después de cambiar a Postobón volvía a pedir el catálogo de Alpina —el
   *  último pedido, así que el descarte de respuestas viejas lo daba por
   *  bueno— y dejaba el cajón con los productos de Alpina y su kumis probado
   *  en la cara, con «Proveedor: Postobón» escrito arriba. */
  const nombreRef = useRef(nombre);
  nombreRef.current = nombre;
  /** Como lo compara «Guardar contrato» (y el servidor): «alpina » y
   *  «Alpina» son el mismo proveedor y la misma lista. */
  const proveedorNormal = normalizarProveedor(nombre);
  /** Si el visor sigue abierto: lo que termina después de cerrarlo (la subida,
   *  la lámina) no toca la ficha, que sigue montada debajo. */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);
  /** Con el nombre con que se abrió, la lista se pide YA; lo que se teclea
   *  después espera a que se deje de teclear. (No un «primera vez»: con
   *  StrictMode el efecto corre dos veces al montar y la segunda esperaba.) */
  const nombreAlAbrir = useRef(nombre);
  const traer = useCallback((quien: string, espera: number) => {
    const mio = ++pedidoDelCatalogo.current;
    if (!quien) { setCargando(false); setFallo(""); return () => {}; }
    setCargando(true);
    const t = window.setTimeout(() => {
      listarDelProveedor(quien)
        .then((lista) => {
          if (mio !== pedidoDelCatalogo.current) return;   // llegó una respuesta vieja
          setCatalogo({ de: normalizarProveedor(quien), lista });
          setFallo("");
          // El recorte y las texturas de SUS productos, de antemano: elegir
          // uno ya no traba la pantalla con el proveedor mirando.
          precalentarEtiquetas(lista);
        })
        .catch((e) => { if (mio === pedidoDelCatalogo.current) setFallo(describeError(e, "No se pudieron traer los productos.")); })
        .finally(() => { if (mio === pedidoDelCatalogo.current) setCargando(false); });
    }, espera);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    // Otro proveedor, otra lista: la de antes se va YA. Si no, mientras llega
    // la nueva el cajón seguía diciendo «Productos de Alpina» con «Postobón»
    // escrito en el contrato. (Otra forma de escribir el mismo no es otro: ni
    // se vacía ni se vuelve a pedir.)
    setCatalogo(CATALOGO_VACIO);
    setFallo("");
    const alAbrir = proveedorNormal === normalizarProveedor(nombreAlAbrir.current);
    return traer(nombreRef.current, alAbrir ? 0 : ESPERA_DEL_CATALOGO_MS);
  }, [proveedorNormal, traer]);
  // Del ref y no del render: `PanelDePrueba` y la subida la llaman después de
  // un `await`, y con el nombre del render del clic pedían la lista del
  // proveedor anterior (ver `nombreRef`).
  const recargar = useCallback(() => { traer(nombreRef.current, 0); }, [traer]);

  /** Lo que se muestra: la lista SÓLO si es del proveedor de ahora. Vaciarla
   *  en el efecto de arriba no alcanzaba: el efecto corre DESPUÉS del render
   *  con el nombre nuevo, y en ese render —un cuadro, pero un cuadro con
   *  «Productos de Alpina» y «Postobón» escrito— la lista era la del
   *  anterior. Así, ni un render la muestra con otro nombre puesto, y una
   *  respuesta que llega tarde para otro nombre no se ve aunque se colara. */
  const artes = catalogo.de === proveedorNormal ? catalogo.lista : SIN_ARTES;

  /** Para quién es la pantalla: el dueño de los artes que trajo el servidor
   *  (todos del mismo proveedor), o NADIE. Nunca `undefined`, que es la
   *  pantalla de la dueña y deja pasar todo (`privacidad.ts`). */
  const privadoPara: number | null = artes[0]?.supplier_id ?? null;
  /** El nombre que se pinta sale del arte del que mira, no del campo: es como
   *  lo tiene escrito la base. */
  const proveedorDeLosArtes = artes[0]?.proveedor ?? "";

  // ── La prueba: la de la ficha, sólo de las caras del contrato ───────────
  // Y sólo donde el producto va en envases (`TIPOS_CON_PRUEBA_3D`): en una
  // isla, una batea o una cruz iba como un cartel plano embaldosado, cada
  // envase cinco veces su tamaño, y «Tres cuartos» dejaba ver que era una
  // pared. Eso no se le puede mostrar a un cliente: ahí el visor muestra el
  // lugar.
  const clavesDeCaras = caras
    .filter((c) => TIPOS_CON_PRUEBA_3D.has(muebles.find((m) => m.id === c.fixtureId)?.type ?? ""))
    .map((c) => `${c.fixtureId}|${c.face}`).join(",");
  const pruebasEnEscena = useMemo(
    () => pruebasDelContrato(sesion.prueba, clavesDeCaras ? clavesDeCaras.split(",").map((k) => {
      const [fixtureId, face] = k.split("|");
      return { fixtureId, face: face as "A" | "B" };
    }) : []),
    [sesion.prueba, clavesDeCaras],
  );
  /** Mientras se arma la lámina, sólo la prueba de SU cara: en la del
   *  robatope, «Con Alpina» traía en primer plano la Avena probada en la isla
   *  de enfrente, que «Hoy» no tenía, y el antes y el después diferían en
   *  algo que no era lo que se vende. */
  const [soloLaCara, setSoloLaCara] = useState<string | null>(null);
  const pruebaDibujada = useMemo(() => {
    if (!soloLaCara) return pruebasEnEscena;
    const id = pruebasEnEscena.get(soloLaCara);
    return id == null ? new Map<string, number>() : new Map([[soloLaCara, id]]);
  }, [pruebasEnEscena, soloLaCara]);
  const clave = claveDe(activa);
  const claveRef = useRef(clave);
  claveRef.current = clave;
  /** Cuántas veces cambió lo que se muestra: sube al cambiar de cara, al
   *  cambiar de proveedor y al cerrar el visor. La lámina se arma en segundo
   *  plano durante varios segundos; si en el medio esto se mueve, lo armado
   *  es de otra cosa y se tira (ver `armarLamina`). Sin esto, cerrar a mitad
   *  del armado adjuntaba sola, 25 s después, una lámina con el panel «De
   *  cerca» vacío —sacado de un lienzo que ya no existía—, y cambiar de
   *  proveedor en el medio adjuntaba la lámina del anterior al contrato del
   *  nuevo. */
  const vigencia = useRef(0);
  useEffect(() => { vigencia.current++; }, [clave, proveedorNormal]);
  useEffect(() => () => { vigencia.current++; }, []);
  const arteDeLaCara =artes.find((a) => a.id === arteALaVista(pruebasEnEscena.get(clave), artes, privadoPara)) ?? null;

  // ── Las tomas ───────────────────────────────────────────────────────────
  // Un contador propio: pedir dos veces la misma toma vuelve a encuadrar.
  const [pedido, setPedido] = useState<PedidoDeToma | null>(null);
  const tomasPedidas = useRef(0);
  const pedirToma = useCallback((fixtureId: string, face: "A" | "B", toma: TomaDeVenta, holgura?: number) => {
    // Los límites de la órbita son de la cara de la toma anterior: con ellos
    // puestos, la escena (`aplicarVista` → `update()`) recortaría la toma
    // de otra cara. Se sueltan y se vuelven a poner cuando la toma llega.
    const ctrl = orbitRef.current;
    if (ctrl) { ctrl.minAzimuthAngle = -Infinity; ctrl.maxAzimuthAngle = Infinity; }
    const n = ++tomasPedidas.current;
    setPedido({ fixtureId, cara: face, toma, n, ...(holgura ? { holgura } : {}) });
    return n;
  }, []);
  /**
   * Hasta dónde se puede girar con el mouse: a lo sumo 65° a cada lado del
   * frente de la cara, sin correr la mira y entre 0,6 y 7 m. Sin límites, un
   * arrastre y una vuelta de rueda metían la cámara DENTRO del mueble —media
   * pantalla de costado gris— con el proveedor mirando, y para volver había
   * que encontrar una toma en un HUD que se esconde. (0,6 m es lo más cerca
   * que llega «De cerca»: más, y la órbita la empujaría.) El doble clic
   * vuelve a «De frente».
   */
  const limitarOrbita = useCallback((p: PedidoDeToma) => {
    const ctrl = orbitRef.current;
    const m = mueblesRef.current.find((f) => f.id === p.fixtureId);
    if (!ctrl || !m) return;
    const n = normalDeCara(m.rotY ?? 0, p.cara);
    const frente = Math.atan2(n.x, n.z);
    const giro = (65 * Math.PI) / 180;
    ctrl.minAzimuthAngle = frente - giro;
    ctrl.maxAzimuthAngle = frente + giro;
    ctrl.enablePan = false;
    ctrl.minDistance = 0.6;
    ctrl.maxDistance = 7;
  }, []);
  // «De frente» al abrir y al cambiar de cara: es la primera impresión, a la
  // altura de un comprador, con la persona de escala al lado.
  useEffect(() => {
    pedirToma(activa.fixtureId, activa.face, "frente");
  }, [activa.fixtureId, activa.face, pedirToma]);
  const estado = useRef<EstadoDeEscena>({
    sinArte: false, privadoPara: null, toma: 0, primeraPersona: false, rejillasAcomodadas: [], aspectoConPersona: 0,
  });
  // La toma ya dibujada, marcada en la raíz para quien saca capturas (y para
  // las pruebas de navegador): el lienzo es otra raíz de React. Y con la
  // toma puesta, los límites de la órbita para esa cara.
  const limitada = useRef(-1);
  useEffect(() => {
    const t = window.setInterval(() => {
      const el = raiz.current;
      if (!el) return;
      const lista = !!pedido && estado.current.toma === pedido.n;
      if (lista && limitada.current !== pedido!.n) { limitada.current = pedido!.n; limitarOrbita(pedido!); }
      if (lista) el.setAttribute("data-toma-lista", String(pedido!.n));
      else el.removeAttribute("data-toma-lista");
    }, 120);
    return () => window.clearInterval(t);
  }, [pedido, limitarOrbita]);

  // «Hoy»: la misma cámara, sin el producto. Al cambiar de cara o de producto
  // vuelve a «Con …».
  const [sinArte, setSinArte] = useState(false);
  useEffect(() => { setSinArte(false); }, [clave]);

  // ── El cajón de productos ───────────────────────────────────────────────
  // Se abre solo si la cara no tiene producto: es lo primero que hay que hacer.
  // También al saltar desde la chapa a otra cara sin producto: con el cajón
  // cerrado se veía el mueble vacío y había que buscar «Producto» en un HUD
  // que se esconde a los 2 s.
  // En una isla o una batea no hay producto que elegir (ver arriba): el
  // cajón no se abre solo.
  const pruebaRef = useRef(sesion.prueba);
  pruebaRef.current = sesion.prueba;
  const pideProducto = (c: CaraActiva) =>
    TIPOS_CON_PRUEBA_3D.has(mueblesRef.current.find((m) => m.id === c.fixtureId)?.type ?? "") && !pruebaRef.current.has(claveDe(c));
  const [cajon, setCajon] = useState(() => pideProducto(activa));
  useEffect(() => {
    if (pideProducto(activa)) setCajon(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  // El proveedor del contrato: sin nombre, el cajón lo pregunta (es una
  // pregunta para la dueña); con nombre, una línea —«Proveedor: Alpina ·
  // cambiar»— y no la pregunta, que el proveedor que mira no tiene por qué
  // leer. El campo queda mientras se teclea (si no, desaparecía con la
  // primera letra) y se pliega al salir de él.
  const [editandoProveedor, setEditandoProveedor] = useState(() => !proveedor.trim());
  const [busqueda, setBusqueda] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  /** El producto va camino al servidor: mientras tanto el proveedor no se
   *  cambia desde el cajón («Queda a nombre de «Alpina»» es lo que se está
   *  subiendo, y lo que vuelve es de Alpina). */
  const [enviandoAlta, setEnviandoAlta] = useState(false);
  // Al abrir el alta, se la trae a la vista una vez (el cuerpo del cajón rueda).
  const formularioDeAlta = useRef<HTMLElement>(null);
  useEffect(() => {
    if (subiendo) formularioDeAlta.current?.scrollIntoView({ block: "start" });
  }, [subiendo]);

  const elegir = (a: Arte) => {
    sesion.probar(activa.fixtureId, activa.face, a.id);
    setSinArte(false);
    // La cámara vuelve a encuadrar, ahora con el producto: que entre entero.
    pedirToma(activa.fixtureId, activa.face, "frente");
  };
  const quitar = () => {
    sesion.probar(activa.fixtureId, activa.face, null);
    pedirToma(activa.fixtureId, activa.face, "frente");
  };
  /**
   * El producto que se acaba de subir. Llega después de un `await` largo (una
   * foto pesada en Render tarda), y la función que lo recibe se armó en el
   * render del clic: todo lo que hace lo compara con lo VIGENTE, no con lo de
   * ese render.
   * · El visor se cerró: el producto quedó en el catálogo de su proveedor y
   *   nada más; la ficha, que sigue montada, no se toca.
   * · Cambió el proveedor: el producto es del ANTERIOR. Ni a la lista, ni a la
   *   cara; sólo se vuelve a pedir la lista del de ahora.
   * · Cambió la cara (la chapa sigue activa mientras sube): a la lista, pero
   *   no se prueba en una cara que la dueña no estaba mirando al subirlo.
   */
  const alSubir = (nuevo: Arte, desde: { proveedor: string; cara: string }) => {
    if (!vivo.current) return;
    setSubiendo(false);
    if (normalizarProveedor(desde.proveedor) !== normalizarProveedor(nombreRef.current)) {
      recargar();
      return;
    }
    // Ya, sin esperar la lista: es del proveedor del contrato (el servidor lo
    // resolvió por ese nombre). La lista vuelve a pedirse para quedar al día.
    const de = normalizarProveedor(desde.proveedor);
    setCatalogo((prev) => (prev.de !== de ? { de, lista: [nuevo] }
      : prev.lista.some((a) => a.id === nuevo.id) ? prev : { de, lista: [...prev.lista, nuevo] }));
    recargar();
    if (desde.cara === claveRef.current) elegir(nuevo);
  };

  // ── La lámina: «Bajar la propuesta» y «Usarla como planometría» ────────
  // La misma lámina del Editor 3D (`componerPropuesta`): «Hoy», «Con …» y «De
  // cerca» desde las tomas de venta, con el pie del producto. Faltaba acá, y
  // es el paso natural de la reunión: mandársela al proveedor o adjuntarla
  // como planometría del contrato que se está armando —que antes obligaba a
  // ir al Editor 3D y perder el contrato—. La escena ya es privada para el
  // proveedor de los artes (`privadoPara`), así que en las tomas no sale nada
  // de otro. El pie va SIN período ni valor: el visor no los conoce (nada
  // comercial cruza desde la ficha) y lo que se está proponiendo todavía no
  // está acordado. Y el mueble se nombra por su TIPO, no por su rótulo, que
  // es texto libre de la dueña.
  const [lamina, setLamina] = useState<"" | "bajando" | "adjuntando">("");
  const [laminaLista, setLaminaLista] = useState<"" | "bajada" | "adjunta">("");
  const [laminaFallo, setLaminaFallo] = useState("");
  useEffect(() => { setLaminaLista(""); setLaminaFallo(""); }, [clave, arteDeLaCara?.id]);
  /** El cuadro congelado mientras se arma la lámina (ver `armarLamina`). */
  const [congelado, setCongelado] = useState<string | null>(null);
  // La confirmación, a la vista: queda al pie del cuerpo del cajón, que rueda,
  // y a 1440 × 900 caía debajo del borde —lo único que decía que se adjuntó
  // era que el botón cambiaba de nombre—.
  const confirmacion = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (laminaLista || laminaFallo) confirmacion.current?.scrollIntoView({ block: "nearest" });
  }, [laminaLista, laminaFallo]);

  /**
   * Arma la lámina en segundo plano (unos segundos; en una máquina lenta, 20
   * o más). Queda ATADA a lo que se mostraba al empezar: la cara, el
   * proveedor y el visor abierto (`vigencia`). Después de cada `await` se
   * mira si sigue siendo lo mismo, y si no, se corta con `INTERRUMPIDA`: ni
   * una toma más de un lienzo que ya no existe, ni una lámina de Alpina en el
   * contrato de Postobón. Mientras tanto la pantalla queda quieta y el visor
   * no deja cambiar de cara, de toma ni de proveedor (`armando`); cerrar sí
   * se puede, y descarta lo armado.
   *
   * Devuelve, además de la lámina, el proveedor (normalizado) con que se armó
   * —la ficha la rechaza si el contrato ya es de otro— y `sigue()`, para
   * volver a mirar después de los `await` de quien la usa.
   */
  const armarLamina = async (): Promise<{
    blob: Blob; archivo: string; cara: string; proveedor: string; sigue: () => boolean;
  } | null> => {
    const capturar = captura.current;
    const arte = arteDeLaCara;
    if (!capturar || !arte || !mueble || !cara) return null;
    const mia = vigencia.current;
    const quien = normalizarProveedor(nombreRef.current);
    const sigue = () => vigencia.current === mia;
    const vigente = () => { if (!sigue()) throw INTERRUMPIDA; };
    // Entre toma y toma hay que dejar que React rearme los materiales y que el
    // lienzo vuelva a dibujar (como `exportarPropuesta` del editor).
    const esperarCuadro = () =>
      new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));
    const esperarEscena = async (listo: (e: EstadoDeEscena) => boolean) => {
      for (let i = 0; i < 240 && !listo(estado.current); i++) {
        await new Promise<void>((ok) => requestAnimationFrame(() => ok()));
        vigente();
      }
      await esperarCuadro();
      vigente();
    };
    const conTomas = TIPOS_CON_PRUEBA_3D.has(mueble.type);
    // El recorte de cada toma, con la forma del mueble (`prepararToma`).
    const aspecto = conTomas
      ? Math.max(0.75, Math.min(16 / 9, (mueble.w / (mueble.h * 1.12 * HOLGURA_DE_LAMINA)) * 1.3))
      : 16 / 9;
    let aspectoDeLamina = aspecto;
    const preparar = async (dataUrl: string) => {
      const toma = await prepararToma(dataUrl, aspectoDeLamina, FONDO_DE_SALA);
      vigente();
      return toma;
    };
    const sinArteAntes = sinArte;
    // La toma que había elegido la dueña: al terminar se vuelve a ésa (y no
    // siempre a «De frente»).
    const tomaAntes: TomaDeVenta = pedido && pedido.fixtureId === activa.fixtureId && pedido.cara === activa.face ? pedido.toma : "frente";
    // Mientras se arman las tomas (unos segundos; en una máquina lenta, más)
    // la pantalla se queda con el cuadro de ahora: el proveedor no ve la
    // cámara saltar de toma en toma, ni otro encuadre con otros productos.
    try { setCongelado(capturar()); } catch { /* sin cuadro: se ve el ir y venir */ }
    setSoloLaCara(clave);
    try {
      if (conTomas) {
        const n = pedirToma(activa.fixtureId, activa.face, "frente", HOLGURA_DE_LAMINA);
        await esperarEscena((e) => e.toma === n);
        aspectoDeLamina = Math.min(16 / 9, Math.max(aspecto, estado.current.aspectoConPersona));
      }
      setSinArte(true);
      await esperarEscena((e) => e.sinArte);
      const antes = await preparar(capturar());
      setSinArte(false);
      await esperarEscena((e) => !e.sinArte);
      const despues = await preparar(capturar());
      const conRejillas = estado.current.rejillasAcomodadas.includes(clave);
      let deCerca: string | null = null;
      if (conTomas) {
        const n = pedirToma(activa.fixtureId, activa.face, "cerca");
        await esperarEscena((e) => e.toma === n);
        deCerca = await preparar(capturar());
      }
      // El título, como se lee en la ficha y con el tipo («GON-02·A ·
      // Góndola, por cara»), y la sede debajo. Con el código interno salía
      // «PRINCIPAL-GON-02-B» sobre «PRINCIPAL», y la cara A sin su letra.
      const datos: DatosPropuesta = {
        sede: `Sede ${sede}`,
        espacio: `${cara.visible} · ${cara.tipo}`,
        mueble: cara.tipo,
        proveedor: arte.proveedor,
        producto: nombresDeLaPrueba(
          arte, TIPOS_CON_SURTIDO.has(mueble.type) ? sesion.como.get(clave)?.surtido : undefined, privadoPara, artes,
        ),
        exhibicion: conRejillas ? "rejillas acomodadas para este producto" : undefined,
        categoria: arte.categoria ?? "",
        desde: "",
        hasta: "",
        valorMensual: null,
      };
      // Sin diferencia entre las dos (la foto todavía no cargó), una sola
      // imagen: el mismo dibujo con «Hoy» y «Con …» le mentiría a quien la
      // recibe.
      const conComparacion = antes !== despues;
      const tomas = conComparacion
        ? [
            { titulo: "Hoy", dataUrl: antes },
            { titulo: `Con ${arte.proveedor}`, dataUrl: despues },
            ...(deCerca ? [{ titulo: "De cerca", dataUrl: deCerca }] : []),
          ]
        : [{ titulo: "El espacio hoy", dataUrl: despues }];
      // El archivo, con la sede y el código de la cara (la A con su letra,
      // como la B): `PRINCIPAL-GON-02-A_Alpina_antes-despues.png`.
      const archivo = nombreDeArchivo({ ...datos, espacio: `${sede}-${cara.visible}` }, conComparacion);
      const blob = await componerPropuesta(tomas, datos);
      vigente();
      return { blob, archivo, cara: cara.visible, proveedor: quien, sigue };
    } finally {
      // Las pruebas de las otras caras de vuelta, y sin congelar.
      setSoloLaCara(null);
      setCongelado(null);
      // Como estaba —con el producto (o «Hoy», si estaba en «Hoy») y en la
      // toma que había—, sólo si sigue siendo la MISMA cara. Si cambió, la
      // nueva ya pidió su «De frente»; reponer la toma de ésta dejaba el 3D
      // en una cara y la chapa y el cajón hablando de otra.
      if (vivo.current && claveRef.current === clave) {
        setSinArte(sinArteAntes);
        pedirToma(activa.fixtureId, activa.face, tomaAntes);
      }
    }
  };
  /** Lo que se dice si la lámina se cortó (`INTERRUMPIDA`) con el visor
   *  todavía abierto. Sin nombres: lo lee el proveedor. */
  const alFallarLamina = (e: unknown) => {
    if (!vivo.current) return;
    setLaminaFallo(e === INTERRUMPIDA
      ? "La lámina no se terminó: cambió lo que se estaba mostrando. Probá de nuevo."
      : "No se pudo armar la lámina. Probá de nuevo.");
  };
  const bajarLamina = async () => {
    if (lamina) return;
    setLamina("bajando");
    // Lo que dijo la lámina anterior («La lámina se bajó») no es de ésta.
    setLaminaLista("");
    setLaminaFallo("");
    try {
      const r = await armarLamina();
      if (!r) return;
      if (!r.sigue()) throw INTERRUMPIDA;
      descargar(r.blob, r.archivo);
      setLaminaLista("bajada");
    } catch (e) {
      alFallarLamina(e);
    } finally {
      setLamina("");
    }
  };
  /** La lámina, adjunta como planometría DEL CONTRATO: escribe el campo de la
   *  ficha (que sigue montada debajo) y viaja con «Guardar contrato», como
   *  la foto o el PDF que adjunta la dueña. En JPG: la planometría tiene un
   *  tope de 10 MB y viaja por correo. Nunca toca el plano. */
  const usarComoPlanometria = async () => {
    if (lamina) return;
    setLamina("adjuntando");
    setLaminaLista("");
    setLaminaFallo("");
    try {
      const r = await armarLamina();
      if (!r) return;
      const jpg = await aJpeg(r.blob);
      // El JPG también tarda: se vuelve a mirar antes de tocar la ficha.
      if (!r.sigue()) throw INTERRUMPIDA;
      const base = r.archivo.replace(/\.png$/, "");
      const adjunta = onPlanometria(new File([jpg.blob], `${base}.${jpg.extension}`, { type: jpg.blob.type }), r.cara, r.proveedor);
      if (!adjunta) throw INTERRUMPIDA;
      setLaminaLista("adjunta");
    } catch (e) {
      alFallarLamina(e);
    } finally {
      setLamina("");
    }
  };
  /** Mientras se arma la lámina, el visor queda quieto: ni otra cara, ni otra
   *  toma, ni «Hoy», ni otro producto, ni otro proveedor, ni abrir o cerrar
   *  el cajón (cambia el ancho del lienzo y con él la toma). Cada uno de esos
   *  gestos, en el medio, cambiaba lo que se estaba fotografiando. */
  const armando = lamina !== "";

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return artes;
    return artes.filter((a) => `${a.nombre} ${a.categoria ?? ""}`.toLowerCase().includes(q));
  }, [artes, busqueda]);

  const tipo = mueble?.type ?? "";
  const llevaProducto = TIPOS_CON_PRODUCTO.has(tipo);
  const conCuenta = TIPOS_CON_PRUEBA_3D.has(tipo);

  // ── El foco no se escapa ────────────────────────────────────────────────
  // Con la app de atrás `inert`, lo único que queda es el visor; estos dos
  // centinelas devuelven el Tab al principio (o al final) en vez de dejarlo
  // caer en la barra del navegador.
  const enfocables = () => [...(raiz.current?.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  ) ?? [])].filter((el) => !el.hasAttribute("data-centinela") && el.offsetParent !== null);
  const alPrincipio = () => { const l = enfocables(); l[l.length - 1]?.focus(); };
  const alFinal = () => { enfocables()[0]?.focus(); };

  if (!mueble || !cara) return null;

  const otras = caras.filter((c) => !(c.fixtureId === activa.fixtureId && c.face === activa.face));

  return createPortal(
    <div
      ref={raiz}
      className="visor-venta"
      data-cajon-oscuro
      data-capa-modal
      role="dialog"
      aria-modal="true"
      aria-label="Ver el espacio en 3D"
      data-cajon-abierto={cajon || undefined}
    >
      <span tabIndex={0} data-centinela onFocus={alPrincipio} />

      {/* El doble clic vuelve a «De frente»: si un giro dejó la cámara en un
          lugar raro, es lo primero que se hace sin buscar el HUD. */}
      <div className="visor-escena" onDoubleClick={() => { if (!armando) pedirToma(activa.fixtureId, activa.face, "frente"); }}>
        <Lienzo
          muebles={muebles}
          privadoPara={privadoPara}
          sinArte={sinArte}
          prueba={pruebaDibujada}
          como={sesion.como}
          artes={artes}
          pedido={pedido}
          estado={estado}
          orbitRef={orbitRef}
          onCaptura={alTenerCaptura}
          vanos={vanos}
        />
        {/* El cuadro de antes, quieto, mientras se arma la lámina. */}
        {congelado && <img className="visor-congelado" src={congelado} alt="" aria-hidden data-congelado />}
        {/* Y la órbita, quieta: un arrastre o una vuelta de rueda entre
            toma y toma movía la cámara de la lámina. */}
        {armando && <div className="visor-tapa" aria-hidden data-armando />}

        {/* Qué se está mirando, y las otras caras del contrato a un toque. */}
        <div className="visor-chapa">
          <span className="visor-chapa-cod">{cara.visible}</span>
          <span className="visor-chapa-tipo">{cara.tipo}</span>
          {otras.length > 0 && (
            <span className="visor-pestanas" role="group" aria-label="Las otras caras del contrato">
              {otras.map((c) => (
                <button
                  key={`${c.fixtureId}|${c.face}`}
                  type="button"
                  className="visor-pestana"
                  onClick={() => onActiva({ fixtureId: c.fixtureId, face: c.face })}
                  disabled={armando}
                  title={`Ver ${c.visible}`}
                >
                  {c.visible}
                </button>
              ))}
            </span>
          )}
        </div>

        <button ref={volver} type="button" className="visor-volver" onClick={onCerrar}>
          <X size={14} aria-hidden /> Volver al contrato
        </button>

        {/* El HUD de Presentar: se va a los 2 s sin mover el mouse, con el
            cursor; vuelve con cualquier movimiento. Las tres tomas SIEMPRE
            —también sin producto: el espacio vacío se muestra igual—. */}
        <HudQueSeEsconde contenedor={raiz} className="visor-hud">
          <span className="visor-hud-grupo" role="group" aria-label="Tomas">
            {/* «De cerca» mira entrepaños: sin envases (una isla, una
                batea) no hay qué mirar de cerca. */}
            {TOMAS.filter(([toma]) => conCuenta || toma !== "cerca").map(([toma, rotulo]) => (
              <button
                key={toma}
                type="button"
                className="visor-hud-boton"
                aria-pressed={pedido?.toma === toma && pedido.fixtureId === activa.fixtureId && pedido.cara === activa.face}
                onClick={() => pedirToma(activa.fixtureId, activa.face, toma)}
                disabled={armando}
              >
                {rotulo}
              </button>
            ))}
          </span>
          {arteDeLaCara && (
            <span className="visor-hud-grupo" role="group" aria-label="Antes y después">
              <button type="button" className="visor-hud-boton" aria-pressed={sinArte} onClick={() => setSinArte(true)} disabled={armando}>
                Hoy
              </button>
              <button type="button" className="visor-hud-boton" aria-pressed={!sinArte} onClick={() => setSinArte(false)} disabled={armando}>
                Con {proveedorDeLosArtes}
              </button>
            </span>
          )}
          <span className="visor-hud-grupo">
            <button type="button" className="visor-hud-boton" aria-pressed={cajon} aria-expanded={cajon} onClick={() => setCajon((v) => !v)} disabled={armando}>
              <Box size={13} aria-hidden /> Producto
            </button>
          </span>
          {!pantallaCompleta && document.fullscreenEnabled && (
            <span className="visor-hud-grupo">
              <button type="button" className="visor-hud-boton" onClick={pedirPantallaCompleta} data-volver-pantalla-completa disabled={armando}>
                Pantalla completa
              </button>
            </span>
          )}
        </HudQueSeEsconde>
      </div>

      {cajon && (
        <aside className="visor-cajon" aria-label="Producto">
          <header className="visor-cajon-cabeza">
            <h2>
              {nombre && artes.length > 0 ? <>Productos de {proveedorDeLosArtes}</> : "Producto"}
            </h2>
            {/* «Ocultar», con una flecha y no con una ×: con el cajón abierto
                convivían dos X —ésta y «× Volver al contrato»— y era fácil
                cerrar el visor queriendo cerrar el cajón. */}
            <button type="button" className="visor-cajon-cerrar" onClick={() => setCajon(false)} aria-label="Ocultar los productos" disabled={armando}>
              Ocultar <ChevronRight size={14} aria-hidden />
            </button>
          </header>

          <div className="visor-cajon-cuerpo">
            {/* Todo lo que cambia lo que se fotografía —el proveedor, el
                producto, «Cómo va»—, apagado mientras se arma la lámina
                (`armando`). «Para llevarse» queda afuera: ahí está el botón
                que gira y, al terminar, lo que pasó. */}
            <fieldset className="visor-quieto" disabled={armando} data-visor-quieto>
            {editandoProveedor || !nombre ? (
              <label className="visor-campo">
                <span className="visor-rotulo">
                  {nombre ? "Proveedor del contrato" : "¿Con qué proveedor estás armando este contrato?"}
                </span>
                <input
                  className="visor-entrada"
                  value={proveedor}
                  onChange={(e) => { setEditandoProveedor(true); onProveedor(e.target.value); }}
                  onBlur={(e) => { if (e.target.value.trim()) setEditandoProveedor(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="Nombre del proveedor"
                  autoComplete="off"
                  disabled={enviandoAlta}
                />
                <span className="visor-nota">Queda escrito en el contrato.</span>
              </label>
            ) : (
              <p className="visor-proveedor" data-proveedor-del-contrato>
                <span>Proveedor: <b>{nombre}</b></span>
                {/* Mientras sube un producto, no: lo que vuelve es de este
                    proveedor (ver `alSubir`). */}
                <button type="button" className="visor-enlace" onClick={() => setEditandoProveedor(true)} disabled={enviandoAlta}>cambiar</button>
              </p>
            )}

            {!llevaProducto ? (
              <p className="visor-aviso">Este mueble no lleva producto en el 3D.</p>
            ) : !conCuenta ? (
              // Una isla, una batea, una cruz: el producto va en cajas o
              // exhibidores que arma el proveedor, y como cartel plano
              // embaldosado no se le podía mostrar a nadie. Se muestra el
              // lugar: de frente y en tres cuartos.
              <p className="visor-aviso" data-sin-envases>
                {cara.tipo}: el producto va en cajas o exhibidores que arma el proveedor. El 3D muestra el
                lugar y cómo se ve desde el pasillo, no el producto.
              </p>
            ) : !nombre ? (
              <p className="visor-nota">Mientras tanto se puede mostrar el espacio vacío con las tres tomas.</p>
            ) : cargando && artes.length === 0 ? (
              <p className="visor-nota"><Loader2 size={12} className="visor-gira" aria-hidden /> Buscando los productos…</p>
            ) : fallo ? (
              <p className="visor-aviso">{fallo}</p>
            ) : artes.length === 0 ? (
              // No «Postobon todavía no tiene productos»: con el nombre sin
              // tilde o sin apóstrofe el servidor no encuentra a «Postobón»
              // (la regla del contrato sólo saca mayúsculas y espacios), y
              // decía que no tenía productos cuando tenía dos. Tampoco un
              // «¿quisiste decir…?»: un parecido sería el nombre de otro.
              <p className="visor-aviso" data-sin-productos>
                No encontré productos a nombre de «{nombre}». Revisá cómo está escrito (tildes,
                apóstrofes); si subís uno y el nombre no está, se da de alta como proveedor nuevo.
              </p>
            ) : (
              <>
                {artes.length > 4 && (
                  <label className="visor-buscador">
                    <Search size={13} aria-hidden />
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por nombre o rubro"
                      aria-label="Buscar un producto"
                    />
                  </label>
                )}
                <div className="visor-productos">
                  {filtrados.map((a) => {
                    const puesto = arteDeLaCara?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="visor-producto"
                        aria-pressed={puesto}
                        data-arte={a.id}
                        onClick={() => (puesto ? undefined : elegir(a))}
                      >
                        <span className="visor-producto-foto">
                          <img src={arteUrl(a.id)} alt={a.nombre} loading="lazy" />
                        </span>
                        <span className="visor-producto-nombre">{a.nombre}</span>
                        {puesto && <span className="visor-producto-puesto">En la cara</span>}
                      </button>
                    );
                  })}
                  {filtrados.length === 0 && <p className="visor-nota">Ningún producto con «{busqueda.trim()}».</p>}
                </div>
                {arteDeLaCara && (
                  <button type="button" className="visor-boton-linea" onClick={quitar}>Quitar el producto</button>
                )}
              </>
            )}

            {/* «Cómo va»: el mismo bloque del editor (dónde va, el surtido, la
                nevera, las medidas y la cuenta que se negocia). Sólo en los
                muebles con envases 3D; en una isla o una batea el producto va
                como lámina sobre la cara. */}
            {/* El alta va ADENTRO del cuerpo, que rueda: con la ficha del
                envase abierta mide más de lo que entra en una pantalla de
                768 px, y en el pie fijo «Subir» quedaba fuera de la vista. */}
            {isAdmin && conCuenta && nombre && subiendo && (
              <section className="visor-como" aria-label="Subir un producto" ref={formularioDeAlta}>
                <h3 className="visor-rotulo">Subir un producto</h3>
                <SubirProducto
                  proveedor={nombre}
                  cara={clave}
                  onListo={alSubir}
                  onEnviando={setEnviandoAlta}
                  onCancelar={() => setSubiendo(false)}
                />
              </section>
            )}

            {arteDeLaCara && conCuenta && !subiendo && (
              <section className="visor-como" aria-label="Cómo va">
                <h3 className="visor-rotulo">Cómo va</h3>
                <PanelDePrueba
                  fix={mueble}
                  cara={activa.face}
                  arte={arteDeLaCara}
                  como={sesion.como.get(clave) ?? { donde: "todas" }}
                  onAjustar={(c) => sesion.ajustar(activa.fixtureId, activa.face, c)}
                  isAdmin={isAdmin}
                  catalogo={artes}
                  onRecargarCatalogo={recargar}
                  paraElProveedor
                />
              </section>
            )}
            </fieldset>

            {arteDeLaCara && conCuenta && !subiendo && (
              <section className="visor-como" aria-label="La lámina">
                <h3 className="visor-rotulo">Para llevarse</h3>
                <p className="visor-nota">
                  La lámina de {cara.visible} con «Hoy», «Con {proveedorDeLosArtes}» y «De cerca», sin valores ni fechas.
                </p>
                {/* De quién es la planometría que ya tiene el contrato, antes
                    de reemplazarla. Una lámina de acá es siempre de este
                    proveedor (la ficha la saca si cambia); un archivo que
                    subió la dueña no se nombra. */}
                {planometria && (
                  <p className="visor-nota" data-planometria-actual>
                    {planometria === "otra"
                      ? "El contrato ya tiene una planometría (un archivo adjunto): usar la lámina la reemplaza."
                      : `La planometría del contrato es la lámina de ${planometria.lamina} con ${proveedorDeLosArtes}.`}
                  </p>
                )}
                <div className="visor-lamina">
                  <button type="button" className="visor-boton-linea" onClick={bajarLamina} disabled={!!lamina} data-bajar-lamina>
                    {lamina === "bajando" ? <Loader2 size={13} className="visor-gira" aria-hidden /> : <Download size={13} aria-hidden />}
                    Bajar la propuesta
                  </button>
                  <button type="button" className="visor-boton-linea" onClick={usarComoPlanometria} disabled={!!lamina} data-lamina-planometria>
                    {lamina === "adjuntando" ? <Loader2 size={13} className="visor-gira" aria-hidden /> : <FileCheck size={13} aria-hidden />}
                    {planometria ? "Reemplazar la planometría" : "Usarla como planometría"}
                  </button>
                </div>
                <p ref={confirmacion} className={laminaFallo ? "visor-aviso" : "visor-nota"} role={laminaFallo ? "alert" : "status"}
                  data-lamina-adjunta={laminaLista === "adjunta" || undefined} hidden={!laminaLista && !laminaFallo}>
                  {laminaFallo || (laminaLista === "adjunta"
                    ? `Quedó adjunta como planometría de este contrato (${cara.visible}): se guarda con él.`
                    : laminaLista === "bajada" ? "La lámina se bajó." : "")}
                </p>
              </section>
            )}
          </div>

          {isAdmin && conCuenta && nombre && !subiendo && (
            <footer className="visor-cajon-pie">
              <button type="button" className="visor-boton-linea" onClick={() => setSubiendo(true)} disabled={armando}>
                <Upload size={13} aria-hidden /> Subir un producto
              </button>
            </footer>
          )}
        </aside>
      )}

      <span tabIndex={0} data-centinela onFocus={alFinal} />
    </div>,
    document.body,
  );
}

// ─── La lámina en JPG ────────────────────────────────────────────────────────

/** La lámina (PNG) como JPG blanco de fondo, para la planometría: un PNG de
 *  tres tomas pesa varios megas y la planometría viaja por correo. Si el
 *  navegador no puede, queda en PNG. */
async function aJpeg(png: Blob): Promise<{ blob: Blob; extension: "jpg" | "png" }> {
  try {
    const imagen = await createImageBitmap(png);
    const c = document.createElement("canvas");
    c.width = imagen.width;
    c.height = imagen.height;
    const g = c.getContext("2d");
    if (!g) return { blob: png, extension: "png" };
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(imagen, 0, 0);
    imagen.close();
    const jpg = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    return jpg ? { blob: jpg, extension: "jpg" } : { blob: png, extension: "png" };
  } catch {
    return { blob: png, extension: "png" };
  }
}

// ─── Subir un producto, a nombre del proveedor del contrato ─────────────────

/**
 * El alta de un producto desde el visor. A diferencia del editor, NO hay
 * selector de proveedor (sería la lista de clientes de la tienda delante de
 * uno de ellos): el producto queda a nombre del proveedor del contrato, y el
 * servidor lo encuentra por nombre con la regla de «Guardar contrato» —o lo da
 * de alta en el mismo commit—. El alto es obligatorio: decide la escala y
 * cuántos entran, que es lo que se negocia.
 */
function SubirProducto({ proveedor, cara, onListo, onEnviando, onCancelar }: {
  proveedor: string;
  /** La cara que se miraba al abrir el alta (`${fixtureId}|cara`). */
  cara: string;
  /** El producto subido, con el proveedor y la cara de cuando se tocó
   *  «Subir»: lo que llega después del `await` se compara con lo vigente
   *  (`alSubir`), no con lo de este render. */
  onListo: (nuevo: Arte, desde: { proveedor: string; cara: string }) => void;
  /** Avisa mientras el producto va camino al servidor (el visor apaga
   *  «cambiar» el proveedor). */
  onEnviando: (enviando: boolean) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [rubro, setRubro] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ficha, setFicha] = useState<FichaDeArte>(FICHA_VACIA);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  /** El servidor no encontró a nadie con ese nombre: hay que confirmar el
   *  alta (`crear_proveedor`). Se pregunta UNA vez, acá, y no se crea solo. */
  const [nombreNuevo, setNombreNuevo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  // Otro nombre en el contrato, otra pregunta.
  useEffect(() => { setNombreNuevo(false); }, [proveedor]);
  useEffect(() => { onEnviando(enviando); }, [enviando, onEnviando]);
  // Si el alta se va en medio del envío (se cerró el cajón o el visor), que
  // «cambiar» no quede apagado.
  useEffect(() => () => onEnviando(false), [onEnviando]);

  async function enviar(crearProveedor = false) {
    if (enviando) return;
    if (!nombre.trim()) { setError("Ponele nombre al producto: es lo que se elige de la lista."); return; }
    if (!archivo) { setError("Falta la foto del producto."); return; }
    if (problemas.length > 0) { setError(problemas[0]); return; }
    if (!ficha.alto_mm) { setError("Poné el alto del envase en cm: con eso se calcula cuántos entran."); return; }
    setEnviando(true);
    setError("");
    // Lo de ESTE momento: es a nombre de quién se sube y para qué cara.
    const desde = { proveedor, cara };
    try {
      const nuevo = await subirArteDelProveedor({
        proveedor, nombre: nombre.trim(), categoria: rubro.trim() || undefined, archivo, ficha, crearProveedor,
      });
      onListo(nuevo, desde);
    } catch (e) {
      if (esProveedorNuevo(e)) setNombreNuevo(true);
      else setError(describeError(e, "No se pudo subir el producto."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="visor-subir" data-subir-producto>
      <p className="visor-nota">Queda a nombre de «{proveedor}», el proveedor de este contrato.</p>
      <input
        className="visor-entrada"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre, con el contenido: 200 g, 1,5 L"
        aria-label="Nombre del producto"
      />
      <input
        className="visor-entrada"
        value={rubro}
        onChange={(e) => setRubro(e.target.value)}
        placeholder="Rubro"
        aria-label="Rubro"
      />
      <input
        ref={archivoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setFicha(FICHA_VACIA); setError(""); }}
      />
      <button type="button" className="visor-boton-linea" onClick={() => archivoRef.current?.click()}>
        <Upload size={13} aria-hidden /> {archivo ? `Cambiar la foto (${archivo.name})` : "Elegir la foto del frente"}
      </button>
      {archivo && (
        <div className="visor-ficha">
          <EditorDeFicha
            imagen={archivo}
            ficha={ficha}
            nombre={nombre}
            categoria={rubro}
            onCambio={setFicha}
            altoObligatorio
            onValidez={setProblemas}
          />
        </div>
      )}
      {error && <p className="visor-aviso" role="alert">{error}</p>}
      {nombreNuevo ? (
        <div className="visor-aviso" role="alert" data-proveedor-nuevo>
          <p style={{ margin: 0 }}>
            No hay ningún proveedor «{proveedor}». Revisá cómo está escrito (tildes, apóstrofes): si
            ya existe con otra forma, corregilo en el contrato. Si es nuevo, se da de alta con este nombre.
          </p>
          <div className="visor-subir-acciones" style={{ marginTop: 8 }}>
            <button type="button" className="visor-boton" onClick={() => enviar(true)} disabled={enviando}>
              {enviando ? <><Loader2 size={13} className="visor-gira" aria-hidden /> Subiendo…</> : "Es nuevo: darlo de alta"}
            </button>
            <button type="button" className="visor-boton-linea" onClick={() => setNombreNuevo(false)} disabled={enviando}>
              Revisar el nombre
            </button>
          </div>
        </div>
      ) : (
        <div className="visor-subir-acciones">
          {/* En tinta y no en amarillo: el amarillo de esta pantalla es el de
              la ficha, y no se ve mientras el visor está abierto. */}
          <button type="button" className="visor-boton" onClick={() => enviar()} disabled={enviando}>
            {enviando ? <><Loader2 size={13} className="visor-gira" aria-hidden /> Subiendo…</> : "Subir"}
          </button>
          <button type="button" className="visor-boton-linea" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
