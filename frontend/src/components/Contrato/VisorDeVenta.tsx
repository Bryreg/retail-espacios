import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as ControlesDeOrbita } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Loader2, Search, Upload, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { useModalAbierto } from "../../tema";
import { arteUrl, listarDelProveedor, subirArteDelProveedor, type Arte } from "../../api/catalogo";
import { describeError } from "../../api/client";
import type { TomaDeVenta } from "../../utils/planta";
import {
  CAM_POS, CAM_TARGET, CanvasErrorBoundary, FONDO_DE_SALA, FOV_DEL_EDITOR, HudQueSeEsconde, PanelDePrueba, Scene,
  storeToFixtures, TIPOS_CON_PRODUCTO, TIPOS_CON_PRUEBA_3D,
  type ComoSePrueba, type EstadoDeEscena, type PedidoDeToma, type PlacedFixture,
} from "../StoreEditor3D/StoreEditor3D";
import EditorDeFicha, { FICHA_VACIA } from "../StoreEditor3D/EditorDeFicha";
import type { FichaDeArte } from "../StoreEditor3D/muebles/producto";
import { arteALaVista, pruebasDelContrato, sinDatosComerciales } from "../StoreEditor3D/muebles/privacidad";
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
  /** «Punta de góndola», «Góndola, por cara». */
  tipo: string;
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
const NADA_CON_CAPTURA = (_fn: () => string) => {};
const NADA_CON_VISTA = (_fn: () => void) => {};

/** Las tres tomas del vendedor, en el orden del HUD. */
const TOMAS: readonly [TomaDeVenta, string][] = [["frente", "De frente"], ["tres_cuartos", "Tres cuartos"], ["cerca", "De cerca"]];

/** Cuánto se espera después de la última tecla del proveedor antes de pedir su
 *  catálogo: el nombre se teclea letra por letra. */
const ESPERA_DEL_CATALOGO_MS = 400;

const claveDe = (c: CaraActiva) => `${c.fixtureId}|${c.face}`;

// ─── La escena, en su propia pieza ───────────────────────────────────────────

/**
 * El lienzo con la escena. En `memo`: lo que se teclea en el cajón (el
 * buscador, el formulario) cambia el estado del visor y NO tiene que llegar
 * acá. Sólo lo redibuja lo que cambia lo que se ve.
 */
const Lienzo = memo(function Lienzo({
  muebles, privadoPara, sinArte, prueba, como, artes, pedido, estado,
}: {
  muebles: PlacedFixture[];
  privadoPara: number | null;
  sinArte: boolean;
  prueba: ReadonlyMap<string, number>;
  como: ReadonlyMap<string, ComoSePrueba>;
  artes: Arte[];
  pedido: PedidoDeToma | null;
  estado: React.MutableRefObject<EstadoDeEscena>;
}) {
  const orbitRef = useRef<ControlesDeOrbita | null>(null);
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
          screenshotReady={NADA_CON_CAPTURA}
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
        />
      </Canvas>
    </CanvasErrorBoundary>
  );
});

// ─── El visor ────────────────────────────────────────────────────────────────

export default function VisorDeVenta({
  caras, activa, onActiva, proveedor, onProveedor, sesion, onCerrar,
}: VisorDeVentaProps) {
  const raiz = useRef<HTMLDivElement>(null);
  const volver = useRef<HTMLButtonElement>(null);
  const isAdmin = useAuthStore(selectIsAdmin);

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
  const unificados = useFixtureStore(selectFixtures);
  const muebles = useMemo(() => sinDatosComerciales(storeToFixtures(unificados)), [unificados]);
  const mueble = muebles.find((f) => f.id === activa.fixtureId) ?? null;
  const cara = caras.find((c) => c.fixtureId === activa.fixtureId && c.face === activa.face) ?? null;
  // Si la cara se fue —la sincronización trajo un plano sin ese mueble, o
  // salió del contrato— no hay nada que mostrar: se vuelve a la ficha.
  useEffect(() => {
    if (!mueble || !cara) onCerrar();
  }, [mueble, cara, onCerrar]);

  // ── El catálogo: SÓLO el del proveedor del contrato ─────────────────────
  const [artes, setArtes] = useState<Arte[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState("");
  const pedidoDelCatalogo = useRef(0);
  const nombre = proveedor.trim();
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
          setArtes(lista);
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
    // Otro nombre, otra lista: la de antes se va YA. Si no, mientras llega la
    // nueva el cajón seguía diciendo «Productos de Alpina» con «Postobón»
    // escrito en el contrato.
    setArtes([]);
    return traer(nombre, nombre === nombreAlAbrir.current ? 0 : ESPERA_DEL_CATALOGO_MS);
  }, [nombre, traer]);
  const recargar = useCallback(() => { traer(nombre, 0); }, [nombre, traer]);

  /** Para quién es la pantalla: el dueño de los artes que trajo el servidor
   *  (todos del mismo proveedor), o NADIE. Nunca `undefined`, que es la
   *  pantalla de la dueña y deja pasar todo (`privacidad.ts`). */
  const privadoPara: number | null = artes[0]?.supplier_id ?? null;
  /** El nombre que se pinta sale del arte del que mira, no del campo: es como
   *  lo tiene escrito la base. */
  const proveedorDeLosArtes = artes[0]?.proveedor ?? "";

  // ── La prueba: la de la ficha, sólo de las caras del contrato ───────────
  const clavesDeCaras = caras.map((c) => `${c.fixtureId}|${c.face}`).join(",");
  const pruebasEnEscena = useMemo(
    () => pruebasDelContrato(sesion.prueba, caras),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sesion.prueba, clavesDeCaras],
  );
  const clave = claveDe(activa);
  const arteDeLaCara = artes.find((a) => a.id === arteALaVista(pruebasEnEscena.get(clave), artes, privadoPara)) ?? null;

  // ── Las tomas ───────────────────────────────────────────────────────────
  // Un contador propio: pedir dos veces la misma toma vuelve a encuadrar.
  const [pedido, setPedido] = useState<PedidoDeToma | null>(null);
  const tomasPedidas = useRef(0);
  const pedirToma = useCallback((fixtureId: string, face: "A" | "B", toma: TomaDeVenta) => {
    const n = ++tomasPedidas.current;
    setPedido({ fixtureId, cara: face, toma, n });
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
  // las pruebas de navegador): el lienzo es otra raíz de React.
  useEffect(() => {
    const t = window.setInterval(() => {
      const el = raiz.current;
      if (!el) return;
      const lista = !!pedido && estado.current.toma === pedido.n;
      if (lista) el.setAttribute("data-toma-lista", String(pedido!.n));
      else el.removeAttribute("data-toma-lista");
    }, 120);
    return () => window.clearInterval(t);
  }, [pedido]);

  // «Hoy»: la misma cámara, sin el producto. Al cambiar de cara o de producto
  // vuelve a «Con …».
  const [sinArte, setSinArte] = useState(false);
  useEffect(() => { setSinArte(false); }, [clave]);

  // ── El cajón de productos ───────────────────────────────────────────────
  // Se abre solo si la cara no tiene producto: es lo primero que hay que hacer.
  const [cajon, setCajon] = useState(() => !sesion.prueba.has(claveDe(activa)));
  // Se preguntó por el proveedor al abrir: el campo queda mientras se teclea
  // (si no, desaparecía con la primera letra).
  const [pidioProveedor] = useState(() => !proveedor.trim());
  const [busqueda, setBusqueda] = useState("");
  const [subiendo, setSubiendo] = useState(false);

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

      <div className="visor-escena">
        <Lienzo
          muebles={muebles}
          privadoPara={privadoPara}
          sinArte={sinArte}
          prueba={pruebasEnEscena}
          como={sesion.como}
          artes={artes}
          pedido={pedido}
          estado={estado}
        />

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
            {TOMAS.map(([toma, rotulo]) => (
              <button
                key={toma}
                type="button"
                className="visor-hud-boton"
                aria-pressed={pedido?.toma === toma && pedido.fixtureId === activa.fixtureId && pedido.cara === activa.face}
                onClick={() => pedirToma(activa.fixtureId, activa.face, toma)}
              >
                {rotulo}
              </button>
            ))}
          </span>
          {arteDeLaCara && (
            <span className="visor-hud-grupo" role="group" aria-label="Antes y después">
              <button type="button" className="visor-hud-boton" aria-pressed={sinArte} onClick={() => setSinArte(true)}>
                Hoy
              </button>
              <button type="button" className="visor-hud-boton" aria-pressed={!sinArte} onClick={() => setSinArte(false)}>
                Con {proveedorDeLosArtes}
              </button>
            </span>
          )}
          <span className="visor-hud-grupo">
            <button type="button" className="visor-hud-boton" aria-pressed={cajon} aria-expanded={cajon} onClick={() => setCajon((v) => !v)}>
              <Box size={13} aria-hidden /> Producto
            </button>
          </span>
          {!pantallaCompleta && document.fullscreenEnabled && (
            <span className="visor-hud-grupo">
              <button type="button" className="visor-hud-boton" onClick={pedirPantallaCompleta} data-volver-pantalla-completa>
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
            <button type="button" className="visor-cajon-cerrar" onClick={() => setCajon(false)} aria-label="Cerrar el cajón de productos">
              <X size={14} aria-hidden />
            </button>
          </header>

          <div className="visor-cajon-cuerpo">
            {(pidioProveedor || !nombre) && (
              <label className="visor-campo">
                <span className="visor-rotulo">¿Con qué proveedor estás armando este contrato?</span>
                <input
                  className="visor-entrada"
                  value={proveedor}
                  onChange={(e) => onProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  autoComplete="off"
                />
                <span className="visor-nota">Queda escrito en el contrato.</span>
              </label>
            )}

            {!llevaProducto ? (
              <p className="visor-aviso">Este mueble no lleva producto en el 3D.</p>
            ) : !nombre ? (
              <p className="visor-nota">Mientras tanto se puede mostrar el espacio vacío con las tres tomas.</p>
            ) : cargando && artes.length === 0 ? (
              <p className="visor-nota"><Loader2 size={12} className="visor-gira" aria-hidden /> Buscando los productos…</p>
            ) : fallo ? (
              <p className="visor-aviso">{fallo}</p>
            ) : artes.length === 0 ? (
              <p className="visor-aviso" data-sin-productos>{nombre} todavía no tiene productos cargados.</p>
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
            {arteDeLaCara && conCuenta && (
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
                />
              </section>
            )}
          </div>

          {isAdmin && llevaProducto && nombre && (
            <footer className="visor-cajon-pie">
              {subiendo ? (
                <SubirProducto
                  proveedor={nombre}
                  onListo={(nuevo) => {
                    setSubiendo(false);
                    // Ya, sin esperar la lista: es del proveedor del contrato
                    // (el servidor lo resolvió por ese nombre), y queda probado
                    // en la cara. La lista vuelve a pedirse para quedar al día.
                    setArtes((prev) => (prev.some((a) => a.id === nuevo.id) ? prev : [...prev, nuevo]));
                    recargar();
                    elegir(nuevo);
                  }}
                  onCancelar={() => setSubiendo(false)}
                />
              ) : (
                <button type="button" className="visor-boton-linea" onClick={() => setSubiendo(true)}>
                  <Upload size={13} aria-hidden /> Subir un producto
                </button>
              )}
            </footer>
          )}
        </aside>
      )}

      <span tabIndex={0} data-centinela onFocus={alFinal} />
    </div>,
    document.body,
  );
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
function SubirProducto({ proveedor, onListo, onCancelar }: {
  proveedor: string;
  onListo: (nuevo: Arte) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [rubro, setRubro] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ficha, setFicha] = useState<FichaDeArte>(FICHA_VACIA);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const archivoRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    if (enviando) return;
    if (!nombre.trim()) { setError("Ponele nombre al producto: es lo que se elige de la lista."); return; }
    if (!archivo) { setError("Falta la foto del producto."); return; }
    if (problemas.length > 0) { setError(problemas[0]); return; }
    if (!ficha.alto_mm) { setError("Poné el alto del envase en cm: con eso se calcula cuántos entran."); return; }
    setEnviando(true);
    setError("");
    try {
      const nuevo = await subirArteDelProveedor({
        proveedor, nombre: nombre.trim(), categoria: rubro.trim() || undefined, archivo, ficha,
      });
      onListo(nuevo);
    } catch (e) {
      setError(describeError(e, "No se pudo subir el producto."));
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
      <div className="visor-subir-acciones">
        {/* En tinta y no en amarillo: el amarillo de esta pantalla es el de la
            ficha, y no se ve mientras el visor está abierto. */}
        <button type="button" className="visor-boton" onClick={enviar} disabled={enviando}>
          {enviando ? <><Loader2 size={13} className="visor-gira" aria-hidden /> Subiendo…</> : "Subir"}
        </button>
        <button type="button" className="visor-boton-linea" onClick={onCancelar} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  );
}
