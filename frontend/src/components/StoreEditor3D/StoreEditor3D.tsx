import React, { useState, useRef, useEffect, useMemo, memo, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import {
  Trash2, RotateCw, FlipHorizontal2, Save, X,
  Building2, DollarSign, Calendar, Tag, Info, AlertTriangle, Boxes,
  Eye, EyeOff, Camera, User, Package, Plus, Search, Upload, Loader2,
} from "lucide-react";
import { Html } from "@react-three/drei";
import { GondolaReal } from "./muebles/GondolaReal";
import { ProductoEnGondola, ventaDeGondola } from "./muebles/ProductoEnGondola";
import { PuntaReal } from "./muebles/PuntaReal";
import { ProductoEnPunta, ventaDePunta } from "./muebles/ProductoEnPunta";
import { ProductoDePrueba } from "./muebles/ProductoDePrueba";
import { useHabladoresDeRelleno } from "./muebles/ProductoEnMueble";
import type { PruebaDeCara } from "./muebles/ProductoDePrueba";
import {
  ajusteDeRejillas, bloquesDeSurtido, claveDeFilas, cubiertasDe, entrepanosDelEspacio, filasSinAlto, focoDeLaPrueba, moverRejilla,
  rejillasDeLaPrueba, rubroDeContratoEntero, unidadesDePrueba, VENDIDO,
} from "./muebles/frentes";
import type { AccionDeRejillas, EleccionDeRejillas, FilaDePrueba, RejillasDeLaPrueba } from "./muebles/frentes";
import type { FilasDeProducto } from "./muebles/medidas";
import { esNeveraDeBebidas, ventaDeTipo } from "./muebles/venta";
import { contornosDeLasPartes, type ContornoDeParte } from "./muebles/contornos";
import {
  arteALaVista, caraDeLasTomas, habladorALaVista, hayReunion, laminaDelMueble, MAXIMO_DE_SURTIDO, supplierPorNombre, surtidoALaVista,
  proveedorParaPresentar, pruebaAjenaDelMueble, pruebasDelPlano, pruebasDeLaReunion, REUNION_SIN_PROVEEDOR, reunionFijada, ultimaPrueba,
} from "./muebles/privacidad";
import type { PrivadoPara } from "./muebles/privacidad";
import {
  claveDeArte, estadoDeEtiqueta, etiquetaDeArte, marcarEnUso, olvidarEtiquetas, reintentarEtiqueta,
  useEntornoDeProducto, useEtiqueta, precalentarEtiquetas, registrarRenderer,
} from "./muebles/etiqueta";
import type { Etiqueta } from "./muebles/etiqueta";
import { materialDeCenefa, materialDeCopete, olvidarCopetes } from "./muebles/pop";
import {
  BRILLO, FocoDeVenta, K_ENTORNO_MUEBLE, LuzDeVenta, parcheDelPiso, ponerTienda, useLuzDeVenta, usePropsDeLuzDeVenta,
} from "./muebles/luzDeVenta";
import { useAtenuacion } from "./muebles/atenuacion";
import type { UniformesDelPiso } from "./muebles/luzDeVenta";
import {
  COLOR_DEL_MURO_DE_VENTA, geometriaDeCenefa, geometriaDeCieloRaso, geometriaDeMurosConDegradado, geometriaDeMurosDeVenta,
} from "./muebles/sala";
import { NeveraReal } from "./muebles/NeveraReal";
import { PuestoImpulsoReal } from "./muebles/PuestoImpulsoReal";
import { ProductoAGranel } from "./muebles/ProductoAGranel";
import { BateaReal, bocaDeBatea } from "./muebles/BateaReal";
import { MostradorFrioReal, bandejaDeMostrador } from "./muebles/MostradorFrioReal";
import { CheckoutReal } from "./muebles/CheckoutReal";
import { StandFrutasReal } from "./muebles/StandFrutasReal";
import { ServicioClienteReal } from "./muebles/ServicioClienteReal";
import { EstibaReal } from "./muebles/EstibaReal";
import { bandejasDeMural } from "./muebles/ProductoEnMural";
import { ProductoEnRepisas } from "./muebles/ProductoEnRepisas";
import { avisoDeFrio, colorDeRubro, empaqueDeArte, empaqueQueEntra, vaRefrigerado } from "./muebles/producto";
import { olvidarGeometrias } from "./muebles/perfiles";
import {
  COPETE, ESPESOR_ESPINA, ESTIBA, NEVERA, PANEL_FONDO, PARANTE, ROBATOPE, ZONA_DE_SLOTS,
  altoDeZonaDeSlots, altoDeZonaDeSlotsDePunta, altoUtilDeNevera,
  bandejasDeStand, cotasDeEstiba, cotasDeRobatope, filasDeNevera, filasDeProducto, filasDePunta,
  fondoPorCara, pisoDelCartelDePunta, techoDeCara, ventaDeNevera, ventaDeRobatope,
  cotasDePuestoDeImpulso, geometriaDe, puertasDe, FORRO, type GeometriaDeMueble,
} from "./muebles/medidas";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import {
  fichaDe, fixturesToStore, storeToFixtures as delStoreAl3D, type Catalogo3D, type PlacedFixture,
} from "../../utils/convertirPlano";
import { useModalAbierto } from "../../tema";
import { FIXTURE_DEFS, TIPOS_CON_PRODUCTO, TIPOS_CON_PRUEBA_3D, TIPOS_CON_SURTIDO, paletaConPropias } from "../../catalogo/editor3D";
import { modeloPorId, nombreDeModelo, textoDeFuente } from "../../catalogo/catalogo";
// Cómo le dice este supermercado a cada familia: la paleta, el panel, el cartel
// del mouse y la lámina del proveedor (`catalogo/nombresPropios.ts`).
import { conNombrePropio } from "../../catalogo/nombresPropios";
import { useFichasPropias } from "../../store/fichasPropias";
import { GeometriaDelMueble } from "../GeometriaDelMueble";
import { PartesDelMueble } from "../PartesDelMueble";
import { textoDeLoQueNuncaSeAlquila } from "../../utils/partesDelMueble";
import type { FixtureDef } from "../../catalogo/editor3D";
import { isDoubleGondola, isRentable, fullSpaceCode, NON_RENTABLE_BY_DEFAULT, NUNCA_ALQUILABLE } from "../../types/fixtures";
import { claseDe, codigoDeParte, codigoVisibleDe, divisionDe } from "../../utils/partes";
import { partesQuePisa } from "../../utils/slotsDeLasPartes";
import type { UnifiedFixture, FixType, GondolaType, SpaceStatus } from "../../types/fixtures";
import {
  nombreDeMueble, renombrar, intercambiarNombres, choqueDeNombre,
  textoDelChoque, textoDelIntercambio, normalizar as normalizarNombre,
} from "../../utils/nomenclatura";
import type { RechazoDeNombre } from "../../utils/nomenclatura";
import { fileUrl, getFaceImages } from "../../api/files";
import { arteUrl, guardarFicha, listarCatalogo, subirArte, type Arte } from "../../api/catalogo";
import EditorDeFicha, { FICHA_VACIA, enCm, pareceEnPerspectiva } from "./EditorDeFicha";
import type { FichaDeArte } from "./muebles/producto";
import { getSuppliers } from "../../api/suppliers";
import { findOrCreateSpace, updateSpaceStatus } from "../../api/spaces";
import { describeError } from "../../api/client";
// Extensión real del local y física de la caminata — geometría pura, probada
// aparte. STORE_W/STORE_D describen una tienda ficticia que ninguna sede ocupa.
import {
  huella, limitesDePlanta, lugarDeLaFigura, murosDeCaminata, puntoDeEntrada, puntoLibreCerca, resolverPaso,
  TOLERANCIA_CONTACTO,
  vistaGeneral, miradaSensata, vistaDeCara, vistaDeVenta, FOV_DE_CERCA,
  personaYTomaDeVenta, FIGURA_DE_ESCALA, SEPARACIONES_DE_LA_FIGURA, fovParaLaCara, dentroDelCuadro,
  ALTO_CIELO_RASO, LUMINARIA, luminariasDeTienda, sombraDeHuellas,
  type Vista3D, type TomaDeVenta,
  VEL_CAMINANDO, VEL_APURADA,
  type LimitesPlanta,
} from "../../utils/planta";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import MiniMapa, { type CamaraEnPlanta } from "../MiniMapa/MiniMapa";
import { componerPropuesta, descargar, nombreDeArchivo, prepararToma } from "../../utils/propuesta";
import { siguienteCodigo } from "../../utils/nomenclatura";

// ─── Scene constants ──────────────────────────────────────────────────────────

const STORE_W = 30;
const STORE_D = 42;
const SNAP    = 0.05;   // matches FloorPlan2D's snapTo grid (5 cm)
// Camera is placed on the far (north) side so that the Z axis matches the 2D view:
// small Z (2D-top) → far from camera → appears at top of 3D scene.
// Previously the camera was at Z=-8 (south side), which flipped the 2D/3D relationship.
/** Caja de respaldo cuando la planta está vacía: no hay muebles de donde deducirla. */
const PLANTA_NOMINAL = { minX: 0, maxX: STORE_W, minZ: 0, maxZ: STORE_D };
export const CAM_POS: [number, number, number] = [STORE_W / 2, 28, STORE_D + 8];
/** El campo visual de siempre. Sólo la toma «De cerca» lo cambia, y lo
 *  devuelve (`FOV_DE_CERCA`, en `utils/planta.ts`). */
export const FOV_DEL_EDITOR = 50;
/** El color de la sala detrás del lienzo (que es transparente). La lámina
 *  apoya cada captura sobre él: si no, el fondo salía blanco. */
export const FONDO_DE_SALA = "#e8e4dc";
/** Cuánto aire lleva la toma «De frente» de la lámina: la franja del mueble
 *  agrandada 1,35 veces, el mueble al ~65 % del alto del cuadro. */
export const HOLGURA_DE_LAMINA = 1.35;
export const CAM_TARGET: [number, number, number] = [STORE_W / 2, 0, STORE_D / 2];

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }

// ─── Visual helpers ───────────────────────────────────────────────────────────


function computeDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «2027-06-30» → «jun 2027». Se lee la fecha como texto y no con `Date`: la
 *  medianoche UTC de un día 1 cae el mes anterior en la hora de Colombia. */
function mesYAnio(fecha: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(fecha);
  return m ? `${MESES_CORTOS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim() : fecha;
}

function euclidean(ax: number, az: number, bx: number, bz: number) {
  return Math.sqrt((ax-bx)**2+(az-bz)**2);
}

// ─── Face paint (per-face material arrays) ───────────────────────────────────
// Imagery (supplier photo or category pattern) is painted ONTO an existing box
// of the fixture mesh via a material array — never onto new positioned
// geometry — so it inherits the fixture group's transform and cannot float.

export interface FacePaint {
  /** Material for the fixture's FRONT face (this file's convention: -Z at rotY 0). */
  front: THREE.Material | null;
  /** Material for the BACK face (+Z) — only set for double gondolas (face B). */
  back:  THREE.Material | null;
  /** El producto del proveedor que se está PROBANDO en cada cara, como envases
   *  3D (`ProductoDePrueba`). Cuando hay prueba en una cara, su `front`/`back`
   *  llega en null: la prueba le gana a la foto del espacio y al patrón, y la
   *  lámina sólo dibuja la otra cara. */
  pruebaA?: PruebaDeCara | null;
  pruebaB?: PruebaDeCara | null;
  /** Vender por partes: las puertas de la cara A que se están vendiendo (los
   *  vanos del dibujo). La nevera las marca y la prueba va sólo detrás. */
  puertasA?: readonly number[];
  /** Vender por partes, en el visor de Vender: el contorno de cada tramo o
   *  entrepaño que se está vendiendo, en el frente de su cara
   *  (`contornosDeLasPartes`). Fuera de la lámina, como el de los slots. */
  contornos?: readonly ContornoDeParte[];
}

/** CÓMO se prueba un producto en una cara: en qué entrepaños y si va
 *  acostado. Estado de sesión, al lado de `prueba` y con la misma clave
 *  (`${fixtureId}|A`); igual que ella, nunca va al layout. */
export type ComoSePrueba = {
  donde: "todas" | number[];
  /** `undefined` hasta que la dueña aprieta «Mostrarla acostada» o «Volver a
   *  pararla»: mientras tanto decide la ficha del arte (`ficha.acostado`).
   *  Con un `false` de arranque la ficha nunca se aplicaba. */
  acostado?: boolean;
  /** Las rejillas de la nevera de refrescos (`rejillasDeLaPrueba`):
   *  `undefined` = AUTOMÁTICAS, el valor de entrada —si el producto parado no
   *  entra, se acomodan solas—; `"fabrica"` = las del mueble; o a mano,
   *  cuántas y, si se movieron, dónde. Sólo en la sesión: el plano no cambia. */
  rejillas?: EleccionDeRejillas;
  /** La marca del producto en el copete de la punta (`pop.ts`). Prendida si
   *  no se dice nada; sólo vale con «Toda la cara». */
  copete?: boolean;
  /** Hasta tres artes MÁS del mismo proveedor que el principal, en bloques
   *  verticales por vano (`bloquesDeSurtido`). Sólo góndola y punta. Como
   *  todo lo de acá, de la sesión: no va al layout. */
  surtido?: number[];
  /** «Acostarla sólo en la N»: con «Toda la cara», el producto parado va
   *  ACOSTADO en los entrepaños donde parado no entra (`filasSinAlto`), en
   *  vez de dejarlos vacíos. Se recalcula con las rejillas: si se mueven, se
   *  acuesta donde haga falta. */
  acostarDondeNoEntra?: boolean;
};

/** Lo que la escena YA dibujó, para quien saca capturas (la lámina): el
 *  lienzo del 3D es otra raíz de React, y un cambio de estado de afuera
 *  tarda lo que tarda en llegar. Esperar «dos cuadros» no alcanzaba: con la
 *  punta llena (360 vasos) la toma «Con Alpina» salía sin el producto, igual
 *  a «Hoy», y la lámina quedaba con una sola imagen. */
export type EstadoDeEscena = {
  sinArte: boolean; privadoPara: PrivadoPara; toma: number; primeraPersona: boolean;
  /** Las caras (`${fixtureId}|${cara}`) cuya prueba se dibuja con OTRAS
   *  rejillas que las de fábrica: la lámina lo dice en el pie. */
  rejillasAcomodadas: string[];
  /** El aspecto (ancho / alto) que necesita el recorte de la lámina para no
   *  partir a la persona de escala de la última toma; 0 sin persona. */
  aspectoConPersona: number;
};

/** Una toma de venta pedida para Presentar (o para la lámina). `n` cambia en
 *  cada pedido, para que pedir dos veces la misma vuelva a encuadrar.
 *  `holgura` agranda la franja que tiene que entrar: la lámina deja el
 *  mueble al ~65 % del alto, con aire alrededor. */
export type PedidoDeToma = { fixtureId: string; cara: "A" | "B"; toma: TomaDeVenta; n: number; holgura?: number };

/**
 * Build the 6-material array for a painted box.
 * BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z].
 * Front (-Z, index 5) ← face A texture; back (+Z, index 4) ← face B texture.
 */
function facePaintArray(
  plain: THREE.Material,
  front: THREE.Material | null,
  back:  THREE.Material | null,
): THREE.Material[] {
  return [plain, plain, plain, plain, back ?? plain, front ?? plain];
}

// ─── La lámina de producto ───────────────────────────────────────────────────
//
// El producto se pintaba sobre el panel TRASERO de cada mueble —la espina de la
// góndola, la placa de la punta, la pared de la nevera—. Es el sitio cómodo:
// esos paneles ya existen y ya heredan la transformación del mueble. Pero en
// una góndola de 0.9 m de fondo eso deja el producto **44 cm detrás del filo
// del entrepaño**, y al mirarla de frente se ve un estante vacío con algo
// pintado al fondo. En una tienda el producto está adelante: eso es lo que
// significa un «facing», y es lo que el proveedor viene a comprar.
//
// Ahora la imagen va en una lámina propia, parada al frente del entrepaño. No
// repite la matemática de ubicación del mueble —el error que hundió los dos
// intentos anteriores de poner geometría nueva—: es hija del mismo grupo, así
// que sólo conoce coordenadas locales.

/** Cuánto atrás del plano exterior del mueble se para el producto.
 *  Cinco centímetros: lo justo para que el riel de precio y el filo del
 *  entrepaño queden por delante, como en un lineal de verdad. */
const RETRANQUEO = 0.05;
/** Espesor de la lámina. No es el envase: es lo mínimo para que de perfil no
 *  se vea un papel. */
const ESPESOR_LAMINA = 0.03;
/** Lo mismo, pero medido contra el filo del ENTREPAÑO y no contra el plano
 *  exterior del mueble. Es más chico porque ahí no hay nada que descontar: el
 *  labio y el riel de precio son milímetros, no la mitad del fondo. */
const RETRANQUEO_ENTREPANO = 0.025;

/** Material invisible para las caras de la lámina que NO llevan la textura.
 *  Sin esto la lámina sería una placa opaca tapando el estante entero. */
let matInvisible: THREE.MeshBasicMaterial | null = null;
function getInvisible(): THREE.MeshBasicMaterial {
  if (!matInvisible) {
    matInvisible = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false,
    });
  }
  return matInvisible;
}

/**
 * El producto parado al frente del mueble, en una o en las dos caras.
 *
 * `y` y `alto` son los MISMOS que tenía el panel pintado de antes: la textura
 * viene compuesta con las filas alineadas a los entrepaños reales
 * (`getPanelShelfSpan`) en el espacio local de ese panel, así que mover la
 * lámina en Z no toca la alineación. Cambiar `y` o `alto` sí la rompería.
 */
function LaminaDeProducto({
  ancho, alto, y, fondo, doble = false, facePaint,
}: {
  ancho: number;
  alto: number;
  /** Centro vertical del panel, en local. */
  y: number;
  /** Fondo del mueble: la lámina se para a `RETRANQUEO` de su plano exterior. */
  fondo: number;
  /** El mueble se vende por las dos caras (góndola doble). */
  doble?: boolean;
  facePaint?: FacePaint | null;
}) {
  const caraA = facePaint?.front ?? null;
  const caraB = doble ? (facePaint?.back ?? null) : null;

  // La cara pintada es la EXTERIOR de la lámina (índice 5 = -Z, 4 = +Z), así
  // que el centro se corre medio espesor hacia adentro para que la imagen
  // quede exactamente sobre el retranqueo.
  const zA = -(fondo / 2 - RETRANQUEO) + ESPESOR_LAMINA / 2;
  const zB =  (fondo / 2 - RETRANQUEO) - ESPESOR_LAMINA / 2;

  const matsA = useMemo(
    () => (caraA ? facePaintArray(getInvisible(), caraA, null) : null), [caraA],
  );
  const matsB = useMemo(
    () => (caraB ? facePaintArray(getInvisible(), null, caraB) : null), [caraB],
  );

  return (
    <>
      {matsA && (
        <mesh position={[0, y, zA]} material={matsA}>
          <boxGeometry args={[ancho, alto, ESPESOR_LAMINA]} />
        </mesh>
      )}
      {matsB && (
        <mesh position={[0, y, zB]} material={matsB}>
          <boxGeometry args={[ancho, alto, ESPESOR_LAMINA]} />
        </mesh>
      )}
    </>
  );
}

/** Una lámina recortada a una franja de la textura.
 *
 *  La imagen de producto viene compuesta de una sola pieza, con las filas ya
 *  alineadas a los entrepaños. Para pararlas a distinta profundidad hay que
 *  partirla, y partirla significa recortar la V del mapeo — no recortar la
 *  imagen, que se compone una sola vez y se reusa. */
function laminaDeFranja(ancho: number, alto: number, v0: number, v1: number) {
  const g = new THREE.BoxGeometry(ancho, alto, ESPESOR_LAMINA);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * El producto de una góndola, parado fila por fila.
 *
 * `LaminaDeProducto` para una sola lámina plana delante del mueble, y eso
 * alcanza mientras todos los entrepaños tengan el mismo fondo. La góndola de
 * verdad es ESCALONADA: la bandeja de abajo es la más profunda y van
 * achicándose hacia arriba. Con una lámina única, el producto de las filas de
 * arriba queda colgado en el aire, varios centímetros por delante del
 * entrepaño que supuestamente lo sostiene.
 *
 * Así que se parte en una franja por fila, cada una parada en el filo de SU
 * entrepaño. La textura no cambia: lo que se recorta es la V del mapeo, de
 * manera que cada franja muestra exactamente el pedazo de imagen que le toca.
 */
function LaminaDeProductoPorFila({
  ancho, alto, filas, fondos, montajeA, haciaA, montajeB, haciaB, facePaint, doble = false,
}: {
  ancho: number;
  /** Alto del panel completo, que es el espacio de la textura. */
  alto: number;
  filas: { rowBottom: number; rowPitch: number; rows: number };
  /** Fondo del entrepaño de cada fila, de abajo hacia arriba. */
  fondos: number[];
  /** Z del plano donde se cuelgan los entrepaños de la cara A, y hacia dónde
   *  crecen desde ahí. Se dan por separado porque no siempre coinciden: la
   *  góndola monta cada cara en su lado de la espina y crece hacia afuera,
   *  pero la punta monta ATRÁS —contra el corrido— y crece hacia adelante. Con
   *  un signo único, el arte de la punta aparece detrás del mueble. */
  montajeA: number;
  haciaA: 1 | -1;
  montajeB?: number;
  haciaB?: 1 | -1;
  facePaint?: FacePaint | null;
  doble?: boolean;
}) {
  const caraA = facePaint?.front ?? null;
  const caraB = doble ? (facePaint?.back ?? null) : null;

  const matsA = useMemo(
    () => (caraA ? facePaintArray(getInvisible(), caraA, null) : null), [caraA],
  );
  const matsB = useMemo(
    () => (caraB ? facePaintArray(getInvisible(), null, caraB) : null), [caraB],
  );

  const franjas = useMemo(() => {
    const fuera: { y: number; geo: THREE.BufferGeometry; zA: number; zB: number }[] = [];
    for (let i = 0; i < filas.rows; i++) {
      const y0 = filas.rowBottom + i * filas.rowPitch;
      const y1 = y0 + filas.rowPitch;
      const fondo = fondos[i] ?? fondos[fondos.length - 1] ?? 0;
      // La cara PINTADA de la lámina es la exterior, así que el centro se
      // corre medio espesor hacia adentro para que la imagen quede justo
      // sobre el retranqueo.
      const desdeElFilo = fondo - RETRANQUEO_ENTREPANO;
      fuera.push({
        y: (y0 + y1) / 2,
        geo: laminaDeFranja(ancho, filas.rowPitch, y0 / alto, y1 / alto),
        zA: montajeA + haciaA * (desdeElFilo - ESPESOR_LAMINA / 2),
        zB: (montajeB ?? 0) + (haciaB ?? 1) * (desdeElFilo - ESPESOR_LAMINA / 2),
      });
    }
    return fuera;
  }, [ancho, alto, filas.rowBottom, filas.rowPitch, filas.rows, fondos,
      montajeA, haciaA, montajeB, haciaB]);

  useEffect(() => () => { for (const f of franjas) f.geo.dispose(); }, [franjas]);

  return (
    <>
      {franjas.map((f, i) => (
        <group key={i}>
          {matsA && (
            <mesh position={[0, f.y, f.zA]} geometry={f.geo} material={matsA} />
          )}
          {matsB && (
            <mesh position={[0, f.y, f.zB]} geometry={f.geo} material={matsB} />
          )}
        </group>
      ))}
    </>
  );
}

/**
 * El producto a granel, visto desde arriba.
 *
 * Es la forma que le faltaba al sistema. Una batea, una isla de piso o un
 * mostrador de carnes no tienen ninguna cara vertical donde pegar un facing:
 * el producto se ve desde arriba, volcado. Sin esto, la mitad del catálogo
 * —justo la mitad promocional— no se podía vestir.
 *
 * `y` es la altura de la superficie y `hundido` cuánto queda por debajo del
 * borde del canasto: un volcado al ras del borde se ve como una tapa impresa.
 */
function VolcadoDeProducto({
  ancho, fondo, y, material, semilla, rubro, altoLibre = 0.22, ghost = false,
}: {
  ancho: number;
  fondo: number;
  y: number;
  material: THREE.Material | null | undefined;
  /** Semilla del desparejo del producto genérico. El id del mueble: estable
   *  entre sesiones y distinto entre muebles, así que dos bateas contiguas no
   *  salen clonadas. */
  semilla?: string;
  /** Rubro del contrato. Decide qué empaque se amontona: una batea vendida a
   *  gaseosas se llena de botellas y no de cajas. */
  rubro?: string;
  /** Cuánto se puede amontonar hacia arriba desde `y`. */
  altoLibre?: number;
  ghost?: boolean;
}) {
  // Sin arte del proveedor, producto genérico volcado.
  //
  // Esto es lo que le faltaba a la mitad del catálogo. El cajón de frutas
  // tenía sus listones, la isla su guarda de acrílico y el mostrador su vidrio
  // curvo — y los tres se leían como maquetas, porque estaban VACÍOS. Un
  // mostrador de carnes sin carne es un mueble; con carne es una carnicería.
  //
  // A diferencia de la góndola, donde el hueco vacío ES el dato —dice qué
  // espacio queda libre—, estos muebles se venden ENTEROS y no por pedazos:
  // mostrarlos llenos no esconde ninguna disponibilidad, y mostrarlos vacíos
  // sí miente sobre cómo se ven.
  if (!material) {
    if (ghost) return null;
    return (
      <ProductoAGranel
        ancho={ancho} fondo={fondo} y={y} altoLibre={altoLibre}
        rubro={rubro} semilla={semilla ?? `${ancho}|${fondo}`}
      />
    );
  }
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[ancho, fondo]} />
    </mesh>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

// FixType, GondolaType, SpaceStatus imported from ../../types/fixtures

// Same palette as the 2D plan and the Dashboard map — one colour language for
// the whole app. Slightly brighter values than the 2D strokes because these are
// lit 3D materials, not flat SVG fills.
const STATUS_COLORS: Record<SpaceStatus, string> = {
  free:        "#4CC38A",
  occupied:    "#E24B4B",   // rojo: ocupado no se puede vender
  reserved:    "#F0B429",
  maintenance: "#A8A29E",
};

// Non-rentable fixtures are store infrastructure. Painting them slate keeps the
// commercial colour language (green/red/amber) meaningful: every coloured mesh
// in the scene is sellable space.
const NON_RENTABLE_COLOR = "#64748b";
/** El gris de chapa con que se pintan las tiras de estado en Presentar. */
const COLOR_NEUTRO = "#8d9499";

interface ShelfSlot {
  id:              string;
  x:               number;
  y:               number;
  w:               number;
  h:               number;
  supplierName:    string;
  brandCategory:   string;
  negotiatedValue: number;
  startDate:       string;
  endDate:         string;
  status:          SpaceStatus;
}

// `PlacedFixture` —la forma con que la escena trabaja cada mueble— vive en
// `utils/convertirPlano.ts`, junto con las conversiones desde y hacia el store.
export type { PlacedFixture };

// `FixtureDef` y `FIXTURE_DEFS` —el catálogo con que nace cada mueble: medidas,
// color, emoji y prefijo— y los conjuntos `TIPOS_CON_*` viven en
// `catalogo/editor3D.ts`, calculados del catálogo de muebles
// (`catalogo/muebles.json`). Se reexportan: `/taller` y el visor de Vender los
// siguen tomando de acá.
export { FIXTURE_DEFS, TIPOS_CON_PRODUCTO, TIPOS_CON_PRUEBA_3D, TIPOS_CON_SURTIDO };

// Chip styling mirrors STATUS_COLORS: ocupado se lee rojo, igual que el mueble.
const STATUS_META: Record<SpaceStatus, { bg: string; text: string; label: string }> = {
  free:        { bg:"bg-success/20",  text:"text-success",  label:"Disponible"    },
  occupied:    { bg:"bg-danger/20",   text:"text-danger",   label:"Ocupado"       },
  reserved:    { bg:"bg-warning/20",  text:"text-warning",  label:"Reservado"     },
  maintenance: { bg:"bg-dark-surface-2", text:"text-dark-ink-2", label:"Mantenimiento" },
};

// ─── Code & slot generation ───────────────────────────────────────────────────

/**
 * El código de un mueble nuevo.
 *
 * Antes acá se CONTABA cuántos había del mismo prefijo y se sumaba uno, y
 * además se anteponía la sede: dos problemas. Borrar `GON-02` hacía que el
 * siguiente volviera a ser `GON-02` —dos muebles con el mismo código, y con
 * eso dos espacios compartiendo contratos y correos— y el plano 2D generaba
 * `GON-01` donde éste generaba `NAVE-GON-001`, así que el mismo plano quedaba
 * con dos maneras de nombrar según por dónde se hubiera dibujado.
 *
 * La sede no va en el código: se antepone al guardar el espacio
 * (`fullSpaceCode`), que es donde hace falta que sea único entre sedes.
 */
function generateCode(_sede: string, def: FixtureDef, existing: PlacedFixture[]): string {
  return siguienteCodigo(def.gondolaType ? "gondola" : def.type, existing);
}

function defaultSlots(fix: { type: FixType; w: number; h: number; code: string }): ShelfSlot[] {
  if (fix.type !== "gondola" && fix.type !== "punta") return [];
  const cols = fix.type === "gondola" ? Math.max(2, Math.round(fix.w / 2.5)) : 2;
  const rows = 4;
  return Array.from({ length: cols * rows }, (_, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    return {
      id:              `${fix.code}-S${String(idx+1).padStart(2,"0")}`,
      x:               c / cols,
      y:               r / rows,
      w:               1 / cols,
      h:               1 / rows,
      supplierName:    "",
      brandCategory:   "",
      negotiatedValue: 0,
      startDate:       "",
      endDate:         "",
      status:          "free" as SpaceStatus,
    };
  });
}

// ─── Business rule validation ─────────────────────────────────────────────────

function validatePlacement(
  def: FixtureDef,
  pos: {x:number; z:number},
  existing: PlacedFixture[],
): string | null {
  if (def.type === "ristra") {
    const gondolas = existing.filter(f => f.type === "gondola" || f.type === "punta");
    if (!gondolas.some(g => euclidean(pos.x, pos.z, g.x, g.z) < 4))
      return "⚠️ Una Ristra debe estar cerca de una Góndola";
  }
  if (def.type === "cross") {
    const gondolas = existing.filter(f => f.type === "gondola");
    if (!gondolas.some(g => euclidean(pos.x, pos.z, g.x, g.z) < 4))
      return "⚠️ Un Cross debe estar cerca de una Góndola";
  }
  if (def.type === "gondola" && def.gondolaType === "wall") {
    // Contra la caja nominal, en una sede real esta advertencia salía siempre:
    // las paredes están donde terminan los muebles, no en x = 30 / z = 42.
    const margin = 3;
    const lim = limitesDePlanta(existing, 0, PLANTA_NOMINAL);
    const nearWall = pos.x < lim.minX + margin || pos.x > lim.maxX - margin ||
                     pos.z < lim.minZ + margin || pos.z > lim.maxZ - margin;
    if (!nearWall)
      return "⚠️ Góndola Mural recomendada cerca de una pared";
  }
  if (def.type === "columna") {
    // Columns are fine anywhere — no validation needed
  }
  return null;
}

// ─── MEJORA 2: AABB collision helpers ────────────────────────────────────────

/**
 * ¿Este mueble se monta encima de otro?
 *
 * Mide la huella YA ROTADA. Antes comparaba `w` y `d` crudos, y la mayoría de
 * las góndolas de una sede real están giradas 90°: una góndola de 3,6 × 0,9 se
 * leía como 0,9 de ancho, así que se podía soltar atravesada sobre otra y el
 * editor no decía nada. (El plano 2D nunca tuvo el problema porque intercambia
 * ancho y alto al rotar, así que ahí las medidas ya venían giradas.)
 */
function hasAABBCollision(
  pos: {x:number; z:number},
  def: { w:number; d:number; rotY?: number },
  existing: PlacedFixture[],
  excludeId?: string
): boolean {
  // Pegados sí, encimados no: hasta TOLERANCIA_CONTACTO es contacto. Era 1 mm,
  // que no alcanza para absorber el ruido de las rotaciones ni el redondeo de
  // la grilla, así que armar una corrida al ras podía rebotar sin motivo.
  const TOL = TOLERANCIA_CONTACTO;
  const a = huella({ x: pos.x, z: pos.z, w: def.w, d: def.d, rotY: def.rotY ?? 0 });
  return existing
    .filter(f => f.id !== excludeId)
    .some(f => {
      const b = huella({ x: f.x, z: f.z, w: f.w, d: f.d, rotY: f.rotY });
      return (
        a.minX < b.maxX - TOL && a.maxX > b.minX + TOL &&
        a.minZ < b.maxZ - TOL && a.maxZ > b.minZ + TOL
      );
    });
}

// ─── Mesh: Góndola (Double + Wall + Slots) ───────────────────────────────────

interface GondolaMeshProps {
  w: number; d: number; h: number;
  statusColor: string;
  ghost?:         boolean;
  gondolaType?:   GondolaType;
  facePaint?:     FacePaint | null;
  slots?:         ShelfSlot[];
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
  /** Sólo en venta: el rubro del contrato, si el mueble está contratado
   *  ENTERO y ninguno de sus slots está vendido (`rubroDeContratoEntero`). */
  rubroEntero?:    string;
  /** El id del mueble: siembra la variación del relleno en venta. */
  semilla?:        string;
  /** Lo que la góndola guardó de la ficha de su modelo: entrepaños por cara
   *  y ancho de módulo. Ausentes, la cuenta de siempre. El dibujo, el
   *  producto y la lámina preguntan con los mismos. */
  entrepanos?:     number;
  modulo?:         number;
  /** Vender por partes: los tramos guardados (`partes.tramos`), que parten el
   *  corrido en tramos iguales. El dibujo, el producto y la lámina preguntan
   *  con los mismos (`ventaDeGondola`). */
  tramos?:         number;
}

const GondolaMesh = memo(function GondolaMesh({
  w, d, h, ghost,
  gondolaType = "double",
  facePaint,
  slots, selectedSlotId, hoveredSlotId,
  onSlotClick, onSlotHover, rubroEntero, semilla, entrepanos, modulo, tramos,
}: GondolaMeshProps) {
  const isWall = gondolaType === "wall";

  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Estaba armada con `boxGeometry`: entrepaños macizos de 22 mm, dos postes
  // en las puntas y nada en el medio, el fondo liso. Mientras una pieza sea
  // una caja no hay labio, ni pliegue, ni ranura, y son esos detalles los que
  // hacen que el ojo lea «mueble de tienda». Ahora la dibuja `GondolaReal`,
  // con cotas de catálogo y armada por módulos.
  //
  // Lo que NO se movió de acá, a propósito: los paneles de slot y el pintado
  // de caras. El slot es el espacio que se vende —su posición está guardada
  // en los contratos de los clientes—, así que su geometría no se toca: el
  // mueble cambió de forma, el espacio vendido no.

  // Espacio de los slots. Definen dónde cayó cada espacio vendido, así que
  // quedan clavados aunque cambie el mueble; viven en `medidas.ts` porque el
  // producto que se para sobre esos entrepaños necesita la misma cuenta.
  const slotAreaH  = altoDeZonaDeSlots(h);
  const SLOT_PROTO = 0.12;

  // Las filas de producto salen de la misma cuenta que los entrepaños, no de
  // una copia. Ver `filasDeProducto`.
  const fondoCara = fondoPorCara(d, isWall);
  const filas = useMemo(() => filasDeProducto(h, fondoCara, entrepanos), [h, fondoCara, entrepanos]);

  const pinta = !ghost && !!facePaint && !!(facePaint.front || facePaint.back);
  // El producto del proveedor en prueba, como envases 3D parados en los
  // entrepaños. Es otra cosa que la lámina: sale de `ventaDeGondola`, la misma
  // cuenta que el relleno, y donde está la prueba no va relleno.
  const enPrueba = !ghost && !!(facePaint?.pruebaA || facePaint?.pruebaB);
  const ventaGondola = useMemo(
    () => ventaDeGondola(w, d, h, isWall, { entrepanos, modulo, tramos }),
    [w, d, h, isWall, entrepanos, modulo, tramos],
  );
  // Contratada entera con los slots libres (la góndola de Bimbo): en venta
  // se ve con el relleno neutro de su rubro, como cualquier cosa vendida.
  // Contratada entera: todas las filas, pero sólo las dos de adelante en
  // profundidad, como lo vendido por slot (`VendidoEntero.hondo`).
  const vendidoEntero = useMemo(() => (rubroEntero !== undefined ? { rubro: rubroEntero, hondo: false } : undefined), [rubroEntero]);
  // Los habladores genéricos de la tira, sobre lo que el relleno cubre (sólo
  // en venta: `useHabladoresDeRelleno` no hace nada en el editor).
  const habladores = useHabladoresDeRelleno(
    !pinta && !ghost, ventaGondola, w, slots, vendidoEntero, cubiertasDe(facePaint, isWall),
  );

  function renderSlotFace(faceSign: -1 | 1) {
    if (!slots || ghost || !onSlotClick) return null; // slots disabled → skip
    const panelZ = faceSign * (d / 2 + SLOT_PROTO);
    return slots.map(slot => {
      const sw    = slot.w * w - 0.04;
      const sh    = slot.h * slotAreaH - 0.025;
      const cx    = (slot.x + slot.w * 0.5) * w - w / 2;
      const cy    = ZONA_DE_SLOTS.desde + (slot.y + slot.h * 0.5) * slotAreaH;
      const sc    = STATUS_COLORS[slot.status] ?? STATUS_COLORS.free;
      const isSel = slot.id === selectedSlotId;
      const isHov = slot.id === hoveredSlotId;
      return (
        <mesh
          key={`${faceSign}|${slot.id}`}
          position={[cx, cy, panelZ]}
          // Fuera de toda captura: el estado de cada espacio no va en la
          // lámina que se le manda al proveedor.
          userData={CHROME}
          onClick={e  => { e.stopPropagation(); onSlotClick?.(slot.id); }}
          onPointerOver={e => { e.stopPropagation(); onSlotHover?.(slot.id); }}
          onPointerOut={e  => { e.stopPropagation(); onSlotHover?.(null); }}
        >
          <boxGeometry args={[Math.max(0.01, sw), Math.max(0.01, sh), 0.016]} />
          {/* Con producto en prueba, sólo el contorno (y un relleno apenas
              al elegirlo o pasar el mouse): al 72 % tapaban el producto que
              se está mostrando, y aun al 15 % lo teñían. Siguen clicables,
              porque el raycast no mira la opacidad. */}
          <meshStandardMaterial
            color={sc} transparent
            opacity={enPrueba ? (isSel ? 0.22 : isHov ? 0.12 : 0) : (isSel ? 0.94 : isHov ? 0.80 : 0.72)}
            emissive={sc}
            emissiveIntensity={enPrueba ? 0 : isSel ? 0.35 : isHov ? 0.18 : 0}
            depthWrite={false}
          />
          {enPrueba && (
            <ContornoDeSlot w={Math.max(0.01, sw)} h={Math.max(0.01, sh)} z={faceSign * 0.009} color={sc} />
          )}
        </mesh>
      );
    });
  }

  return (
    <group>
      <GondolaReal w={w} d={d} h={h} gondolaType={isWall ? "wall" : "double"} ghost={ghost} habladores={habladores ?? undefined}
        entrepanos={entrepanos} modulo={modulo} tramos={tramos} />

      {/* El producto de los espacios vendidos, parado sobre los entrepaños.
          Cuando el proveedor subió su arte manda el arte: la lámina es
          información real y esto es una aproximación por rubro, así que las
          dos no conviven sobre la misma cara. */}
      {!pinta && (
        <ProductoEnGondola
          w={w} d={d} h={h} esMural={isWall} slots={slots} ghost={ghost}
          entrepanos={entrepanos} modulo={modulo} tramos={tramos}
          cubiertas={cubiertasDe(facePaint, isWall)}
          vendidoEntero={vendidoEntero}
          semilla={semilla}
        />
      )}
      {enPrueba && (
        <ProductoDePrueba
          venta={ventaGondola}
          pruebas={[facePaint?.pruebaA, isWall ? null : facePaint?.pruebaB]}
          tipo="gondola"
        />
      )}

      {/* El producto, parado en el filo de cada entrepaño. La góndola mural va
          contra la pared: sólo se vende su cara de adelante. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={w - PARANTE.ancho * 2}
          alto={h}
          filas={filas}
          fondos={filas.fondos}
          montajeA={-ESPESOR_ESPINA / 2} haciaA={-1}
          montajeB={ESPESOR_ESPINA / 2} haciaB={1}
          doble={!isWall}
          facePaint={facePaint}
        />
      )}

      {/* Slot panels */}
      {renderSlotFace(-1)}
      {!isWall && renderSlotFace(1)}
    </group>
  );
});

/** El contorno de 1 px de un panel de slot. Con un producto en prueba el
 *  panel no se rellena: el velo de color, aun tenue, teñía de verde menta el
 *  mueble entero y el producto que se estaba mostrando. El contorno sigue
 *  diciendo dónde está cada espacio, y el panel transparente sigue
 *  recibiendo el clic (el raycast no mira la opacidad). */
function ContornoDeSlot({ w, h, z, color }: { w: number; h: number; z: number; color: string }) {
  const geometria = useMemo(() => {
    const plano = new THREE.PlaneGeometry(w, h);
    const g = new THREE.EdgesGeometry(plano);
    plano.dispose();
    return g;
  }, [w, h]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  return (
    <lineSegments geometry={geometria} position={[0, 0, z]}>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </lineSegments>
  );
}

// ─── Mesh: Punta de Góndola ───────────────────────────────────────────────────

interface PuntaMeshProps {
  w: number; d: number; h: number;
  statusColor: string; ghost?: boolean;
  facePaint?: FacePaint | null;
  slots?: ShelfSlot[];
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
  /** Ver `GondolaMeshProps.rubroEntero`. */
  rubroEntero?:    string;
  semilla?:        string;
  /** Lo que guardó la punta: entrepaños sin la base y ancho de módulo. Ver
   *  `GondolaMeshProps.entrepanos`: el dibujo, el producto, los habladores y
   *  la lámina preguntan con los mismos. */
  entrepanos?:     number;
  modulo?:         number;
}

function PuntaMesh({ w, d, h, ghost, facePaint, slots, selectedSlotId, hoveredSlotId, onSlotClick, onSlotHover, rubroEntero, semilla, entrepanos, modulo }: PuntaMeshProps) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // La punta es el espacio más caro de un supermercado: se ve de frente desde
  // todo el pasillo transversal y se negocia aparte del lineal. Estaba armada
  // con `boxGeometry` —placas planas y un cartel que era una caja— y la dibuja
  // ahora `PuntaReal`, con el mismo herraje que el corrido.
  //
  // Lo que NO se movió de acá, a propósito: los paneles de slot y el pintado
  // de caras. La posición de cada slot está guardada en los contratos de los
  // clientes, así que su geometría queda clavada aunque el mueble haya
  // cambiado de forma entero.

  const altoDeCuerpo = techoDeCara(h);
  const fondoDeCara = Math.max(0.12, d - PANEL_FONDO.espesor);

  // Espacio de los slots. `altoDeZonaDeSlotsDePunta` NO es la misma cuenta que
  // la de la góndola, y es deliberado: así se repartieron los slots de las
  // puntas cuando se dibujaron. Unificarlas corre todos los espacios vendidos.
  const slotAreaH = altoDeZonaDeSlotsDePunta(altoDeCuerpo);
  const panelZ = -(d / 2 + 0.10);

  // Las filas de producto salen de la misma cuenta que los entrepaños.
  const filas = useMemo(
    () => filasDePunta(altoDeCuerpo, fondoDeCara, entrepanos), [altoDeCuerpo, fondoDeCara, entrepanos],
  );

  const pinta = !ghost && !!facePaint?.front;
  // El producto del proveedor en prueba, como envases 3D. Una sola cara.
  const enPrueba = !ghost && !!facePaint?.pruebaA;
  const ventaPunta = useMemo(
    () => ventaDePunta(w, d, h, { entrepanos, modulo }),
    [w, d, h, entrepanos, modulo],
  );
  // Contratada entera con los slots libres: relleno neutro en venta.
  // Contratada entera: todas las filas, pero sólo las dos de adelante en
  // profundidad, como lo vendido por slot (`VendidoEntero.hondo`).
  const vendidoEntero = useMemo(() => (rubroEntero !== undefined ? { rubro: rubroEntero, hondo: false } : undefined), [rubroEntero]);
  const [habladores] = useHabladoresDeRelleno(
    !pinta && !ghost, ventaPunta, w, slots, vendidoEntero, cubiertasDe(facePaint, true),
  ) ?? [null];
  // La marca en el copete: sólo con la punta ENTERA probada (si se prueba un
  // entrepaño, el copete no es de ese proveedor) y si no se apagó en el panel.
  const entorno = useEntornoDeProducto();
  const pa = facePaint?.pruebaA;
  const conMarca = enPrueba && pa?.etiqueta && pa.donde === "todas" && pa.copete !== false;
  const copete = conMarca && pa?.etiqueta
    ? materialDeCopete(pa.etiqueta, w + COPETE.vuelo * 2 - 0.016, COPETE.alto - 0.016, entorno)
    : undefined;
  const cenefa = conMarca && pa?.etiqueta ? materialDeCenefa(pa.etiqueta, entorno) : undefined;

  return (
    <group>
      <PuntaReal w={w} d={d} h={h} ghost={ghost} copete={copete} cenefa={cenefa} habladores={habladores}
        entrepanos={entrepanos} modulo={modulo} />

      {/* El arte del proveedor, parado en el filo de cada entrepaño. La punta
          se cuelga ATRÁS —contra el corrido— y crece hacia el frente: con el
          montaje de la góndola, el arte aparecería detrás del mueble. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={w - PARANTE.ancho * 2}
          alto={altoDeCuerpo}
          filas={filas}
          fondos={filas.fondos}
          montajeA={d / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}

      {/* El producto de los espacios vendidos. Cuando el proveedor subió su
          arte manda el arte: las dos no conviven sobre la misma cara. */}
      {!pinta && (
        <ProductoEnPunta w={w} d={d} h={h} slots={slots} ghost={ghost}
          entrepanos={entrepanos} modulo={modulo}
          cubiertas={cubiertasDe(facePaint, true)} vendidoEntero={vendidoEntero} semilla={semilla} />
      )}
      {enPrueba && <ProductoDePrueba venta={ventaPunta} pruebas={[facePaint?.pruebaA]} tipo="punta" />}

      {/* Slot panels (same as GondolaMesh pattern) — disabled when onSlotClick is absent */}
      {!ghost && !!onSlotClick && slots?.map(slot => {
        const sw    = slot.w * w - 0.04;
        const sh    = slot.h * slotAreaH - 0.025;
        const cx    = (slot.x + slot.w * 0.5) * w - w / 2;
        const cy    = ZONA_DE_SLOTS.desde + (slot.y + slot.h * 0.5) * slotAreaH;
        const sc    = STATUS_COLORS[slot.status] ?? STATUS_COLORS.free;
        const isSel = slot.id === selectedSlotId;
        const isHov = slot.id === hoveredSlotId;
        return (
          <mesh key={slot.id} position={[cx, cy, panelZ]}
            userData={CHROME}
            onClick={e => { e.stopPropagation(); onSlotClick?.(slot.id); }}
            onPointerOver={e => { e.stopPropagation(); onSlotHover?.(slot.id); }}
            onPointerOut={e  => { e.stopPropagation(); onSlotHover?.(null); }}>
            <boxGeometry args={[Math.max(0.01, sw), Math.max(0.01, sh), 0.014]} />
            {/* Con producto en prueba, el mismo contorno que en la góndola. */}
            <meshStandardMaterial color={sc} transparent
              opacity={enPrueba ? (isSel ? 0.22 : isHov ? 0.12 : 0) : (isSel ? 0.94 : isHov ? 0.80 : 0.72)}
              emissive={sc} emissiveIntensity={enPrueba ? 0 : isSel ? 0.35 : isHov ? 0.18 : 0}
              depthWrite={false} />
            {enPrueba && (
              <ContornoDeSlot w={Math.max(0.01, sw)} h={Math.max(0.01, sh)} z={-0.008} color={sc} />
            )}
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Mesh: Robatope ───────────────────────────────────────────────────────────

// ─── Mesh: Robatope ───────────────────────────────────────────────────────────
// Panel lateral que flanquea la Punta de Góndola.
// Comparte el mismo lenguaje visual (uprights, shelves, pies, colores) para
// que al colocarlo junto a la Punta forme una unidad coherente.
// Dimensiones: w=0.30 (ancho panel), d=0.40 (= profundidad Punta → encaja ras)

/** La chapa clara del robatope. En el editor, Lambert como siempre; en la
 *  pantalla de venta, Standard con la misma luz que el producto
 *  (`luzDeVenta.ts`): con Lambert sus caras de frente quedaban en la sombra
 *  de la luz ambiente, al lado de una bolsa de arroz llena de luz.
 *
 *  Las props de venta, ESTABLES (`usePropsDeLuzDeVenta`): llamando
 *  `conLuzDeVenta` en cada render, el material recibía uniformes nuevos en
 *  cada cuadro y los del programa compilado —los que atenúa un vecino—
 *  quedaban huérfanos. */
function ChapaDeRobatope({ color, op, luz }: { color: string; op: number; luz: boolean }) {
  const venta = usePropsDeLuzDeVenta(luz, K_ENTORNO_MUEBLE, BRILLO.robatope);
  useAtenuacion([venta]);
  return luz
    ? <meshStandardMaterial color={color} metalness={0.04} roughness={0.75}
        transparent={op < 1} opacity={op} {...venta} />
    : <meshLambertMaterial color={color} transparent opacity={op} />;
}

function RobatopeMesh({ w, d, h, statusColor, ghost, facePaint, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;rubro?:string }) {
  const op      = ghost ? 0.42 : 1;
  // Las repisas salen de `cotasDeRobatope`, la MISMA cuenta que preguntan el
  // pintado de caras (`getPanelShelfSpan`) y el producto de prueba. Antes
  // estaban escritas acá y en el pintado, con un «manténganse iguales».
  const cotas   = useMemo(() => cotasDeRobatope(w, d, h), [w, d, h]);
  const capH    = ROBATOPE.capa;         // remate oscuro arriba, sin copete promocional
  const bodyH   = cotas.cuerpo;

  // Mismo paleta de colores que PuntaMesh → coherencia visual garantizada
  const G_WHITE = "#efefed";
  const G_FRAME = "#c0c0bc";
  const G_BACK  = "#d8d8d5";

  const pinta = !ghost && !!facePaint?.front;
  // El producto en prueba va adentro del mismo giro que las repisas.
  const enPrueba = !ghost && !!facePaint?.pruebaA;
  const ventaRobatope = useMemo(() => ventaDeRobatope(w, d, h), [w, d, h]);
  // La MISMA cuenta de entrepaños que usa el pintado de caras. Repetida acá,
  // la primera vez que se toque el mueble el arte queda a caballo entre dos.
  const span = getPanelShelfSpan("robatope", w, h, d);
  // En la pantalla de venta, con la luz del producto (`luzDeVenta.ts`). Las
  // props, estables: ver `ChapaDeRobatope`.
  const luz = useLuzDeVenta();
  const ventaParante = usePropsDeLuzDeVenta(luz, K_ENTORNO_MUEBLE, BRILLO.estructura);
  const ventaRemate = usePropsDeLuzDeVenta(luz, K_ENTORNO_MUEBLE, BRILLO.robatope);
  const ventaFilo = usePropsDeLuzDeVenta(luz, K_ENTORNO_MUEBLE, BRILLO.estructura);
  useAtenuacion([ventaParante, ventaRemate, ventaFilo]);

  return (
    <group>
      {/* Back structural panel (faces the gondola aisle) — estructura, lisa */}
      <mesh position={[0, bodyH / 2, d * 0.40]} castShadow>
        <boxGeometry args={[w, bodyH, d * 0.20]} />
        <ChapaDeRobatope color={G_BACK} op={op} luz={luz} />
      </mesh>

      {/* El arte del proveedor, REBANADO POR ENTREPAÑO.
          Como lámina entera era un póster del alto del mueble colgado por
          delante de todo: tapaba los estantes en vez de pararse sobre ellos.
          Por fila, cada tramo de la textura se para en su entrepaño, que es
          cómo está el producto de verdad. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={span.panelW}
          alto={span.panelH}
          filas={{ rowBottom: span.rowBottom, rowPitch: span.rowPitch, rows: span.rows }}
          fondos={Array.from({ length: span.rows }, () => d - 0.01)}
          montajeA={(d - 0.01) / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}

      {/* Left & right uprights — identical profile to PuntaMesh */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - ROBATOPE.parante / 2), bodyH / 2, 0]} castShadow>
          <boxGeometry args={[ROBATOPE.parante, bodyH, d]} />
          <meshStandardMaterial key={luz ? "venta" : "editor"} color={G_FRAME} metalness={0.18} roughness={0.70}
            transparent opacity={op} {...ventaParante} />
        </mesh>
      ))}

      {/* Shelf boards + front price rails */}
      {cotas.repisas.map((sy, i) => {
        return (
          <group key={i} rotation={[cotas.giro, 0, 0]}>
            <mesh position={[0, sy, 0]} castShadow>
              <boxGeometry args={[cotas.anchoUtil, ROBATOPE.espesorRepisa, cotas.fondo]} />
              <ChapaDeRobatope color={G_WHITE} op={op} luz={luz} />
            </mesh>
            <mesh position={[0, sy + ROBATOPE.rielSube, -(d / 2 - ROBATOPE.rielAdentro)]}>
              <boxGeometry args={[w - ROBATOPE.rielRetiro, ROBATOPE.rielAlto, ROBATOPE.rielEspesor]} />
              <ChapaDeRobatope color="#b0b0ad" op={op} luz={luz} />
            </mesh>
          </group>
        );
      })}

      {/* El remate de arriba. Era casi negro (#2e2e2c) y en la toma de venta
          se leía como un rectángulo negro que dominaba el cuadro (de frente
          su canto no recibe la luz de arriba): un gris medio con un filo más
          claro al frente, que lo lee como chapa plegada y no como un
          agujero. */}
      <mesh position={[0, bodyH + capH / 2, 0]} castShadow>
        <boxGeometry args={[w + 0.08, capH, d + 0.04]} />
        <meshStandardMaterial key={luz ? "venta" : "editor"} color="#9a9b96" metalness={0.22} roughness={0.6}
          transparent opacity={op} {...ventaRemate} />
      </mesh>
      <mesh position={[0, bodyH + 0.006, -(d / 2 + 0.02)]}>
        <boxGeometry args={[w + 0.08, 0.012, 0.004]} />
        <meshStandardMaterial key={luz ? "venta" : "editor"} color="#c4c4bf" metalness={0.22} roughness={0.5}
          transparent opacity={op} {...ventaFilo} />
      </mesh>

      {/* Corner feet — same style as PuntaMesh */}
      {([-1, 1] as const).map(sx => (
        <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.06), 0.045, 0]} castShadow>
          <boxGeometry args={[0.10, 0.090, d * 0.60]} />
          <ChapaDeRobatope color={G_FRAME} op={op} luz={luz} />
        </mesh>
      ))}

      {/* Indicador de estado, abajo. Arriba se montaba encima del producto:
          el estado es del sistema, y no tiene por qué taparle la cara al
          proveedor. */}
      <mesh position={[0, 0.100, -(d / 2 + 0.006)]}>
        <boxGeometry args={[w * 0.70, 0.040, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
      {/* El relleno mudo se apaga cuando el proveedor subió su arte: lo que se
          ve en el mueble tiene que ser SU producto, no uno inventado por el
          rubro. Dibujando los dos, el arte quedaba de póster por delante y los
          estantes llenos por detrás — el mueble mostraba dos cosas distintas a
          la vez. */}
      {enPrueba && <ProductoDePrueba venta={ventaRobatope} pruebas={[facePaint?.pruebaA]} tipo="robatope" />}
      {!pinta && !enPrueba && (
        <ProductoEnRepisas
          alturas={cotas.apoyos}
          techo={bodyH}
          ancho={cotas.anchoUtil} fondo={cotas.fondo}
          montaje={cotas.montaje} hacia={-1}
          rubro={rubro} ghost={ghost}
        />
      )}

    </group>
  );
}

// ─── Mesh: Ristra ─────────────────────────────────────────────────────────────

function RistraMesh({ w, d, h, statusColor, ghost, facePaint, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;rubro?:string }) {
  const op     = ghost ? 0.42 : 1;
  // Una ristra es una TIRA: unidades colgadas una debajo de otra. Sin producto
  // era un riel con ganchos vacíos, que no se parece a nada.
  const RISTRA_W = Math.min(0.13, Math.max(0.076, w * 0.45));
  const RISTRA_H = h - 0.12;
  const RAIL   = "#8a8a88";
  const HOOK   = "#9e9e9c";
  const nHooks = Math.max(4, Math.round(h / 0.28));
  const sp     = (h - 0.10) / nHooks;
  /** Ancho de la tira y del cabezal. Son cotas de FABRICACIÓN, no fracciones
   *  del mueble: la ficha del fabricante da 3,8 cm de ancho de tira y 12
   *  ganchos. Atadas al ancho del mueble, una ristra colocada con 40 cm de
   *  huella salía de 28 cm de ancho — o sea, una tabla. */
  const TIRA    = 0.038;
  const CABEZAL = Math.min(0.12, Math.max(TIRA * 2, w * 0.4));
  /** Lo que cuelga de cada gancho es un SOBRE, no una plancha del ancho del
   *  mueble. */
  const SOBRE   = Math.min(0.13, Math.max(TIRA * 2, w * 0.45));

  return (
    <group>
      <LaminaDeProducto
        ancho={RISTRA_W} alto={RISTRA_H} y={RISTRA_H / 2 + 0.06} fondo={d}
        facePaint={ghost ? null : facePaint}
      />
      {/* El CABEZAL porta-cartel, que es lo que compra la marca: la tarjeta
          impresa que corona la tira. Va del ancho de la tarjeta y no del ancho
          del mueble. */}
      <mesh position={[0, h + 0.005, 0]} castShadow>
        <boxGeometry args={[CABEZAL, 0.075, 0.005]} />
        <meshStandardMaterial color="#e8eaec" metalness={0.10} roughness={0.60} transparent opacity={op} />
      </mesh>
      {!ghost && rubro && (
        <mesh position={[0, h + 0.005, -0.004]}>
          <boxGeometry args={[CABEZAL - 0.014, 0.048, 0.004]} />
          <meshStandardMaterial
            color={colorDeRubro(rubro)} metalness={0} roughness={0.7}
            transparent opacity={op}
          />
        </mesh>
      )}

      {/* La TIRA. Angosta: una ristra no es un panel, es una tira de plástico
          que cuelga del filo de un entrepaño por delante de la mercadería. Acá
          había además un panel translúcido de 28 cm de ancho DETRÁS de la
          tira, y eso era lo que la hacía leer como una tabla: un clip strip no
          tiene respaldo — se ve la góndola a través de él. */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[TIRA, h, 0.010]} />
        <meshStandardMaterial color={RAIL} metalness={0.35} roughness={0.45} transparent opacity={op} />
      </mesh>

      {Array.from({ length: nHooks }, (_, i) => {
        const py = h - 0.08 - i * sp;
        return (
          <group key={i} position={[0, py, 0]}>
            {/* El GANCHO: una varilla corta que sale de la tira y se dobla
                hacia arriba en la punta. Acá había una bandeja —una placa
                horizontal del ancho del mueble— y eso convertía la ristra en
                una repisera angosta. Una ristra no lleva entrepaño: el
                producto CUELGA de la varilla por su troquel. */}
            <mesh position={[0, 0, -d * 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.0035, 0.0035, d * 0.32, 6]} />
              <meshStandardMaterial color={HOOK} metalness={0.7} roughness={0.28} transparent opacity={op} />
            </mesh>
            {/* La punta doblada hacia arriba, que es lo que retiene el sobre. */}
            <mesh position={[0, 0.009, -d * 0.32]} castShadow>
              <cylinderGeometry args={[0.0035, 0.0035, 0.018, 6]} />
              <meshStandardMaterial color={HOOK} metalness={0.7} roughness={0.28} transparent opacity={op} />
            </mesh>
            {/* El sobre, COLGADO de la varilla: su borde de arriba queda al
                ras del gancho y el resto pende. Los sobres se superponen un
                poco unos con otros, como en una ristra de verdad, donde cada
                uno tapa el troquel del de abajo. */}
            {!ghost && rubro && (
              <mesh
                position={[0, -sp * 0.46, -d * 0.22]}
                rotation={[0.06, 0, 0]}
                castShadow
              >
                <boxGeometry args={[SOBRE, sp * 0.92, 0.016]} />
                <meshStandardMaterial
                  color={colorDeRubro(rubro)} metalness={0} roughness={0.72}
                  transparent opacity={op}
                />
              </mesh>
            )}
            {/* La franja de estado, sobre la tira y no sobre una bandeja. */}
            <mesh position={[0, 0.016, -0.008]}>
              <boxGeometry args={[0.022, 0.012, 0.006]} />
              <meshLambertMaterial color={statusColor} transparent opacity={0.85 * op} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── Mesh: Cross ──────────────────────────────────────────────────────────────

function CrossMesh({ w, d, h, statusColor, ghost, facePaint, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;rubro?:string }) {
  const op      = ghost ? 0.42 : 1;
  // Era casi negro y se leía como un librero, no como un exhibidor. Un metal
  // claro con estantes blancos es lo que se ve en una punta de pasillo, y
  // además deja que el producto del proveedor sea lo que resalta.
  const DARK    = "#7c8085";   // perfil, cartelería
  const LADO    = "#cbced2";   // montantes laterales
  const SHELF_C = "#eceef0";
  const nLevels = Math.max(4, Math.round(h / 0.36));
  const pinta = !ghost && !!facePaint?.front;
  // La MISMA cuenta de entrepaños que usa el pintado de caras.
  const span = getPanelShelfSpan("cross", w, h, d);

  return (
    <group>
      {/* Fondo. Sin él, detrás del producto quedaba un hueco negro y el
          exhibidor se leía como un nicho vacío en vez de como un rack. */}
      <mesh position={[0, h / 2, d / 2 - 0.012]} castShadow>
        <boxGeometry args={[w - 0.05, h, 0.024]} />
        <meshLambertMaterial color="#dfe2e5" transparent={ghost} opacity={op} />
      </mesh>

      {/* El arte del proveedor, REBANADO POR ENTREPAÑO. Como lámina entera era
          un póster del alto del mueble colgado por delante de todo: tapaba los
          estantes en vez de pararse sobre ellos. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={span.panelW}
          alto={span.panelH}
          filas={{ rowBottom: span.rowBottom, rowPitch: span.rowPitch, rows: span.rows }}
          fondos={Array.from({ length: span.rows }, () => d - 0.04)}
          montajeA={(d - 0.04) / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}
      {/* Montantes. Eran dos paneles del fondo entero, en gris casi negro: dos
          paredes oscuras enmarcando el producto. Un rack se para en cuatro
          postes de esquina, y en metal claro el que resalta es lo que exhibe. */}
      {([-1, 1] as const).flatMap(side =>
        ([-1, 1] as const).map(dz => (
          <mesh key={`${side}|${dz}`}
            position={[side * (w / 2 - 0.032), h / 2, dz * (d / 2 - 0.032)]} castShadow>
            <boxGeometry args={[0.055, h, 0.055]} />
            <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
              transparent={ghost} opacity={op} />
          </mesh>
        )),
      )}
      {/* Travesaños que amarran los postes de cada lado */}
      {([-1, 1] as const).flatMap(side =>
        ([0.06, h - 0.06] as const).map((ty, i) => (
          <mesh key={`tv${side}|${i}`} position={[side * (w / 2 - 0.032), ty, 0]} castShadow>
            <boxGeometry args={[0.045, 0.045, d - 0.064]} />
            <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
              transparent={ghost} opacity={op} />
          </mesh>
        )),
      )}

      {Array.from({ length: nLevels }, (_, i) => {
        const py = 0.10 + i * ((h - 0.12) / Math.max(nLevels - 1, 1));
        return (
          <group key={i} position={[0, py, 0]} rotation={[-0.09, 0, 0]}>
            {/* Shelf surface — slightly thicker */}
            <mesh castShadow>
              <boxGeometry args={[w - 0.068, 0.026, d - 0.04]} />
              <meshStandardMaterial color={SHELF_C} metalness={0.50} roughness={0.40}
                transparent={ghost} opacity={op} />
            </mesh>
            {/* Front label panel */}
            <mesh position={[0, 0.032, -(d / 2 - 0.020)]}>
              <boxGeometry args={[w - 0.06, 0.062, 0.013]} />
              <meshStandardMaterial color={DARK} metalness={0.55} roughness={0.35}
                transparent={ghost} opacity={op} />
            </mesh>
            {/* Status color strip inside front panel */}
            <mesh position={[0, 0.032, -(d / 2 - 0.040)]}>
              <boxGeometry args={[w * 0.60, 0.024, 0.009]} />
              <meshLambertMaterial color={statusColor} transparent opacity={0.70 * op} />
            </mesh>
            {/* El producto del contrato, DENTRO del grupo de la repisa: es el
                que lleva la inclinación. Colgado afuera queda a la altura del
                eje y la repisa se le va varios centímetros por delante.

                La repisa de más arriba va sin producto: es la tapa del
                exhibidor, no un anaquel, y lo que se pare encima sobresale por
                arriba del mueble. */}
            {!pinta && i < nLevels - 1 && (
            <ProductoEnRepisas
              alturas={[0.013]}
              techo={(h - 0.12) / Math.max(nLevels - 1, 1)}
              ancho={w - 0.068} fondo={d - 0.04}
              montaje={(d - 0.04) / 2} hacia={-1}
              rubro={rubro} ghost={ghost}
            />
            )}
          </group>
        );
      })}

      {/* Feet */}
      {([-1, 1] as const).map(sx => (
        <mesh key={`ft${sx}`} position={[sx * (w / 2 - 0.055), 0.052, 0]}>
          <boxGeometry args={[0.065, 0.104, d * 0.60]} />
          <meshStandardMaterial color={LADO} metalness={0.12} roughness={0.62}
            transparent={ghost} opacity={op} />
        </mesh>
      ))}

    </group>
  );
}

// ─── Mesh: Metro cuadrado ─────────────────────────────────────────────────────

function MetroMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  const op       = ghost ? 0.42 : 1;
  const BODY     = "#e6e6e3";
  const FR       = "#c8c8c5";
  const RAIL     = "#b8b8b5";
  const nShelves = Math.max(3, Math.round(h / 0.40));
  const shelfYs  = Array.from({ length: nShelves }, (_, i) =>
    0.16 + i * ((h - 0.20) / Math.max(nShelves - 1, 1)));

  const faces: { ax: 'x'|'z'; sg: -1|1 }[] = [
    { ax:'z', sg:-1 }, { ax:'z', sg: 1 },
    { ax:'x', sg:-1 }, { ax:'x', sg: 1 },
  ];

  return (
    <group>
      {/* Central spine */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w * 0.22, h, d * 0.22]} />
        <meshLambertMaterial color="#dcdcda" transparent opacity={op} />
      </mesh>

      {/* 4 corner uprights */}
      {([-1,1] as const).flatMap(sx => ([-1,1] as const).map(sz => (
        <mesh key={`u${sx}${sz}`} position={[sx*(w/2-0.03), h/2, sz*(d/2-0.03)]} castShadow>
          <boxGeometry args={[0.05, h, 0.05]} />
          <meshStandardMaterial color={FR} metalness={0.18} roughness={0.70}
            transparent opacity={op} />
        </mesh>
      )))}

      {/* Per-face: back panel + shelves + price rail */}
      {faces.map(({ ax, sg }) => {
        const half = ax==='z' ? d/2 : w/2;
        const fw   = ax==='z' ? w   : d;
        const px   = ax==='x' ? sg*half*0.92 : 0;
        const pz   = ax==='z' ? sg*half*0.92 : 0;
        const shPx = ax==='x' ? sg*half*0.68 : 0;
        const shPz = ax==='z' ? sg*half*0.68 : 0;
        return (
          <group key={`${ax}${sg}`}>
            {/* Back panel */}
            <mesh position={[px, h/2, pz]} castShadow>
              <boxGeometry args={[ax==='z'?fw-0.04:0.032, h, ax==='z'?0.032:fw-0.04]} />
              <meshLambertMaterial color={BODY} transparent opacity={op} />
            </mesh>
            {/* Shelves */}
            {shelfYs.map((sy, i) => (
              <group key={i}>
                <mesh position={[shPx, sy, shPz]} castShadow>
                  <boxGeometry args={[ax==='z'?fw-0.08:half*0.52, 0.020, ax==='z'?half*0.52:fw-0.08]} />
                  <meshLambertMaterial color={BODY} transparent opacity={op} />
                </mesh>
                {/* Price rail */}
                <mesh position={[
                  ax==='x' ? sg*(half-0.015) : shPx,
                  sy + 0.030,
                  ax==='z' ? sg*(half-0.015) : shPz,
                ]}>
                  <boxGeometry args={[ax==='z'?fw-0.10:0.009, 0.036, ax==='z'?0.009:fw-0.10]} />
                  <meshLambertMaterial color={RAIL} transparent opacity={op} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {/* Corner feet */}
      {([-1,1] as const).flatMap(sx => ([-1,1] as const).map(sz => (
        <mesh key={`f${sx}${sz}`} position={[sx*(w/2-0.08), 0.05, sz*(d/2-0.08)]} castShadow>
          <boxGeometry args={[0.14, 0.10, 0.14]} />
          <meshLambertMaterial color={FR} transparent opacity={op} />
        </mesh>
      )))}

      {/* Status indicator: thin top band only */}
      <mesh position={[0, h - 0.03, 0]}>
        <boxGeometry args={[w * 0.94, 0.05, d * 0.94]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Mueble ─────────────────────────────────────────────────────────────

function MuebleMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  const op        = ghost ? 0.42 : 1;
  // Board layout mirrored by getPanelShelfSpan("mueble") — keep in sync.
  const baseH     = Math.min(h * 0.22, 0.40);   // solid plinth
  const doorH     = h - baseH;
  const nShelves  = Math.max(2, Math.round(doorH / 0.38));
  const nDoors    = Math.max(1, Math.round(w / 0.60));
  const doorW     = w / nDoors;
  // Una vitrina de supermercado es acero claro y vidrio. En gris pizarra se
  // leía como un electrodoméstico negro y le robaba todo el contraste al
  // producto que va adentro, que es lo único que tiene que llamar la atención.
  const METAL     = "#c3c7cc";   // cuerpo y marco, acero claro
  const METAL_D   = "#8d9299";   // zócalo y patas
  const METAL_L   = "#e8eaec";   // manija pulida
  const GLASS_C   = "#bae6fd";

  return (
    <group>
      {/* Plinth / base cabinet */}
      <mesh position={[0, baseH / 2, 0]} castShadow>
        <boxGeometry args={[w, baseH, d]} />
        <meshStandardMaterial color={METAL_D} metalness={0.35} roughness={0.55} transparent opacity={op} />
      </mesh>
      {/* Zócalo retranqueado */}
      <mesh position={[0, 0.055, -(d / 2 - 0.010)]}>
        <boxGeometry args={[w - 0.04, 0.100, 0.012]} />
        <meshStandardMaterial color={METAL_D} metalness={0.40} roughness={0.50} transparent opacity={op} />
      </mesh>

      {/* Outer frame — left/right uprights + top/bottom rails */}
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * (w / 2 - 0.018), baseH + doorH / 2, 0]} castShadow>
          <boxGeometry args={[0.036, doorH, d]} />
          <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
        </mesh>
      ))}
      {/* Top rail */}
      <mesh position={[0, baseH + doorH - 0.018, 0]} castShadow>
        <boxGeometry args={[w, 0.036, d]} />
        <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
      </mesh>

      {/* Glass door panels */}
      {Array.from({ length: nDoors }, (_, i) => {
        const dx = (i + 0.5) * doorW - w / 2;
        return (
          <group key={i}>
            {/* Glass pane */}
            <mesh position={[dx, baseH + doorH / 2, -(d / 2 - 0.018)]}>
              <boxGeometry args={[doorW - 0.010, doorH - 0.036, 0.008]} />
              <meshStandardMaterial color={GLASS_C} roughness={0.04} metalness={0.02}
                transparent opacity={0.22 * op} />
            </mesh>
            {/* Door divider rail */}
            {i > 0 && (
              <mesh position={[dx - doorW / 2, baseH + doorH / 2, -(d / 2 - 0.018)]}>
                <boxGeometry args={[0.018, doorH, 0.018]} />
                <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.50} transparent opacity={op} />
              </mesh>
            )}
            {/* Door handle */}
            <mesh position={[dx - doorW * 0.28, baseH + doorH * 0.48, -(d / 2 - 0.034)]}>
              <boxGeometry args={[0.012, 0.120, 0.010]} />
              <meshStandardMaterial color={METAL_L} metalness={0.60} roughness={0.25} transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Internal shelves (visible through glass) */}
      {Array.from({ length: nShelves }, (_, i) => {
        const sy = baseH + 0.10 + i * ((doorH - 0.12) / Math.max(nShelves - 1, 1));
        return (
          <mesh key={i} position={[0, sy, 0]} castShadow>
            <boxGeometry args={[w - 0.042, 0.014, d - 0.042]} />
            <meshLambertMaterial color="#e8e8e5" transparent opacity={0.90 * op} />
          </mesh>
        );
      })}

      {/* Back panel (inside) — estructura, lisa. El producto va adelante, contra
          el vidrio, que es donde se lo ve. */}
      {!ghost && facePaint?.front ? (
        <>
          <mesh position={[0, baseH + doorH / 2, d / 2 - 0.020]}>
            <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
            <meshLambertMaterial color="#f0f0ee" transparent opacity={op} />
          </mesh>
          <LaminaDeProducto
            ancho={w - 0.036} alto={doorH - 0.036}
            y={baseH + doorH / 2} fondo={d} facePaint={facePaint}
          />
        </>
      ) : (
        <mesh position={[0, baseH + doorH / 2, d / 2 - 0.020]}>
          <boxGeometry args={[w - 0.036, doorH - 0.036, 0.018]} />
          <meshLambertMaterial color="#f0f0ee" transparent opacity={op} />
        </mesh>
      )}

      {/* Tira LED del techo. Era una losa del fondo entero que le tapaba el
          estante de arriba al producto; una tira va pegada al frente, mirando
          hacia adentro. */}
      <mesh position={[0, baseH + doorH - 0.048, -(d / 2 - 0.055)]}>
        <boxGeometry args={[w - 0.060, 0.014, 0.016]} />
        <meshStandardMaterial color="#fffde7" emissive="#fffde7" emissiveIntensity={0.55}
          transparent opacity={0.85 * op} />
      </mesh>

      {/* Status indicator on base front */}
      <mesh position={[0, 0.090, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.75, 0.048, 0.012]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Exhibición de Piso ─────────────────────────────────────────────────
// Stepped promotional floor display — cardboard base boxes + product rows per level,
// narrowing like stairs as it goes up. Front price card at bottom.

function IslaMesh({ w, d, h, statusColor, ghost, facePaint, rubro, hastaElFondo = false }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string;hastaElFondo?:boolean }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Un «exhibidor de piso» no es un mueble: es una ESTIBA plantada en el
  // pasillo con la mercancía apilada encima. Lo confirma el propio catálogo —
  // la huella del tipo es 1,20 × 0,80 m, que es la medida de una tarima
  // estándar—, y el dato estaba escrito desde el principio sin leerse.
  //
  // Antes fue una pirámide de cajones de cartón que además escondía el
  // producto adentro, y después un mueble impreso con bandejas. Ninguno es
  // esto.
  //
  // El paso de la torre lo pone el EMPAQUE, no un alto nominal: los tendidos
  // de una estiba van pegados. Con un paso fijo de 30 cm, una caja de galletas
  // de 19 cm dejaba 11 cm de aire y la torre salía flotando en pisos.
  const empaque = empaqueQueEntra(rubro, Math.max(0.05, h - ESTIBA.alto));
  const c = cotasDeEstiba(w, d, h, empaque?.alto);
  const span = getPanelShelfSpan("isla", w, h, d);
  const pinta = !ghost && !!facePaint?.front;

  return (
    <group>
      <EstibaReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} />

      {/* El arte del proveedor, rebanado por capa de la torre. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={span.panelW}
          alto={span.panelH}
          filas={{ rowBottom: span.rowBottom, rowPitch: span.rowPitch, rows: span.rows }}
          fondos={Array.from({ length: span.rows }, () => c.fondo)}
          montajeA={c.fondo / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}

      {/* La mercancía, apilada en capas sobre la cubierta de la tarima. Una
          estiba de promoción viene cargada hasta el filo, así que se apila al
          ras y no centrada con aire alrededor. El relleno mudo se apaga cuando
          entra el arte del proveedor.
          La estiba colocada desde un modelo (`hastaElFondo`) se carga hasta el
          fondo de la tarima: con las cinco filas de siempre, la completa de
          1,20 × 1,00 dejaba más de media tarima vacía detrás de la torre, y
          desde arriba —como más se mira el plano— se veía una estiba a medio
          cargar. La de un plano de antes, sin modelo, sigue igual. */}
      {!pinta && (
        <ProductoEnRepisas
          alturas={c.capas}
          techo={c.techo}
          ancho={c.ancho} fondo={c.fondo}
          montaje={c.fondo / 2} hacia={-1}
          rubro={rubro} ghost={ghost}
          hastaElFondo={hastaElFondo}
        />
      )}
    </group>
  );
}

function ImpulsadorMesh({ w, d, h, statusColor, ghost, facePaint, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;rubro?:string }) {
  const op      = ghost ? 0.42 : 1;
  const WHITE   = "#f0f0ef";
  const LIGHT   = "#e2e8f0";
  const SPINE_W = Math.min(0.10, w * 0.18);   // narrow central column
  const SPINE_D = d * 0.55;
  const topperH = 0.24;
  const baseH   = 0.10;
  const bodyH   = h - topperH - baseH;
  const nShelves = Math.max(3, Math.round(bodyH / 0.30));
  const shelfGap = bodyH / (nShelves - 1);
  const pinta = !ghost && !!facePaint?.front;
  // La MISMA cuenta de entrepaños que usa el pintado de caras.
  const span = getPanelShelfSpan("impulsador", w, h, d);

  return (
    <group>
      {/* El arte del proveedor, REBANADO POR ENTREPAÑO. Como lámina entera era
          un póster del alto del mueble colgado por delante de todo: tapaba los
          estantes en vez de pararse sobre ellos. */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={span.panelW}
          alto={span.panelH}
          filas={{ rowBottom: span.rowBottom, rowPitch: span.rowPitch, rows: span.rows }}
          fondos={Array.from({ length: span.rows }, () => d)}
          montajeA={d / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}
      {/* Wedge base — wider than spine, smaller than shelves */}
      <mesh position={[0, baseH/2, 0]} castShadow>
        <boxGeometry args={[w * 0.65, baseH, d * 0.70]} />
        <meshStandardMaterial color={LIGHT} roughness={0.75} transparent opacity={op} />
      </mesh>

      {/* Central back spine — full height column */}
      <mesh position={[0, h/2, SPINE_D * 0.25]} castShadow>
        <boxGeometry args={[SPINE_W, h, SPINE_D]} />
        <meshStandardMaterial color={WHITE} roughness={0.70} transparent opacity={op} />
      </mesh>
      {/* Brand color stripe on spine front */}
      <mesh position={[0, h * 0.45, -(SPINE_D * 0.25) + 0.004]}>
        <boxGeometry args={[SPINE_W * 0.70, h * 0.55, 0.006]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.85 * op} />
      </mesh>
      {/* Round brand medallion on spine side */}
      <mesh position={[SPINE_W/2 + 0.006, h * 0.42, SPINE_D * 0.10]}
        rotation={[0, Math.PI/2, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.010, 20]} />
        <meshStandardMaterial color={statusColor} roughness={0.50} transparent opacity={op} />
      </mesh>
      <mesh position={[SPINE_W/2 + 0.010, h * 0.42, SPINE_D * 0.10]}
        rotation={[0, Math.PI/2, 0]}>
        <cylinderGeometry args={[0.050, 0.050, 0.008, 20]} />
        <meshStandardMaterial color="#ffffff" roughness={0.70} transparent opacity={0.88 * op} />
      </mesh>

      {/* Cantilevered shelves — much wider than spine, angled slightly up */}
      {Array.from({ length: nShelves }, (_, si) => {
        const sy  = baseH + si * shelfGap;
        // El giro va SOBRE LA BANDEJA, con el grupo ya puesto en su altura
        // (como en el mural de `NeveraReal`). Girando desde el origen del
        // mueble, cada bandeja se corría hacia atrás el 3,5 % de su altura
        // —4 cm la de 1,12 m del exhibidor de cartón— y el producto, que no
        // gira, quedaba volando delante del filo con el porta-precios
        // enterrado en la primera fila.
        return (
          <group key={si} position={[0, sy, 0]} rotation={[0.035, 0, 0]}>    {/* slight upward tilt */}
            {/* Shelf board */}
            <mesh castShadow>
              <boxGeometry args={[w, 0.018, d]} />
              <meshStandardMaterial color={LIGHT} roughness={0.65} transparent opacity={op} />
            </mesh>
            {/* Front lip / price strip */}
            <mesh position={[0, 0.030, -(d/2 - 0.006)]}>
              <boxGeometry args={[w, 0.050, 0.008]} />
              <meshLambertMaterial color={WHITE} transparent opacity={op} />
            </mesh>
            {/* Acá había un bloque de color por estante: producto inventado,
                metido en la geometría, que ninguna arte del proveedor podía
                reemplazar. El producto real lo pone `LaminaDeProducto`. */}
          </group>
        );
      })}

      {/* Mushroom topper — wide flat panel cantilevered above spine */}
      {/* El cartel ocupa los últimos `topperH` del alto y no se pasa: centrado
          en `h - topperH·0,3` asomaba 5 cm por encima de la tapa, y ese alto
          es el que mira el chequeo de choques. Arranca sobre la bandeja de
          más arriba y termina bajo la tapa. */}
      {/* Back brace from spine up to topper */}
      <mesh position={[0, h - topperH / 2 - 0.009, SPINE_D * 0.10]} castShadow>
        <boxGeometry args={[w * 1.05, topperH - 0.018, 0.018]} />
        <meshStandardMaterial color={statusColor} roughness={0.60} transparent opacity={op} />
      </mesh>
      {/* Topper front face (white brand label). Pegada a la cara del cartel:
          en el filo del mueble (`-(d/2 - 0.008)`) quedaba flotando en el aire,
          13 cm por delante de la espina y sin nada que la sostuviera. */}
      <mesh position={[0, h - topperH / 2 - 0.009, SPINE_D * 0.10 - 0.009 - 0.005]}>
        <boxGeometry args={[w * 0.92, topperH * 0.72, 0.008]} />
        <meshStandardMaterial color="#ffffff" roughness={0.80} transparent opacity={0.88 * op} />
      </mesh>
      {/* Topper top cap */}
      <mesh position={[0, h - 0.010, SPINE_D * 0.10]} castShadow>
        <boxGeometry args={[w * 1.05, 0.018, d * 0.60]} />
        <meshStandardMaterial color={LIGHT} roughness={0.65} transparent opacity={op} />
      </mesh>

      {/* Status strip front */}
      <mesh position={[0, 0.035, -(d/2 + 0.005)]}>
        <boxGeometry args={[w * 0.70, 0.022, 0.007]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
      {/* El relleno mudo se apaga cuando el proveedor subió su arte: lo que se
          ve tiene que ser SU producto, no uno inventado por el rubro. Con los
          dos dibujados, el mueble mostraba dos cosas distintas a la vez. */}
      {!pinta && (
        <ProductoEnRepisas
          alturas={Array.from({ length: nShelves }, (_, si) => baseH + si * shelfGap + 0.009)}
          techo={baseH + bodyH}
          ancho={w} fondo={d}
          montaje={d / 2} hacia={-1}
          rubro={rubro} ghost={ghost}
        />
      )}

    </group>
  );
}

// ─── Mesh: Exhibidor de cartón ────────────────────────────────────────────────

/** El id del modelo «Exhibidor de cartón de la marca» (tipo `impulsador`).
 *  Los ids de los modelos no cambian nunca (`scripts/casos/modelos-ids.json`). */
const MODELO_EXHIBIDOR_DE_CARTON = "base:exhibidor-carton";

/** Espesor de la plancha de cartón corrugado de los costados y el fondo. */
const CARTON = 0.006;

/**
 * El exhibidor de cartón que manda la marca: una caja abierta al frente —dos
 * costados, el fondo y el zócalo cerrado—, bandejas planas de borde a borde y
 * el cabezote arriba.
 *
 * Hasta el 2026-10-14 se dibujaba con la forma del impulsador (`ImpulsadorMesh`):
 * una columna al medio con bandejas en voladizo, sin costados ni fondo, que
 * no se leía como cartón; y la columna atravesaba el producto de cada bandeja,
 * que de frente se veía mordido al medio. Las bandejas, el cabezote y el arte
 * salen de la MISMA cuenta que el impulsador (`getPanelShelfSpan`), así que el
 * arte del proveedor y el relleno caen igual sobre cada bandeja; lo que cambia
 * es el mueble alrededor. El cabezote ocupa los 24 cm de arriba del alto (R3
 * dice unos 30): con más, cambiaría cuántas bandejas entran.
 *
 * Sólo se dibuja así el mueble colocado desde el modelo: un impulsador de un
 * plano de antes sigue siendo el impulsador.
 */
function ExhibidorCartonMesh({ w, d, h, statusColor, ghost, facePaint, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;rubro?:string }) {
  const op = ghost ? 0.42 : 1;
  const CARA = "#f2ede3";      // cartón impreso de blanco, por fuera
  const CANTO = "#d9c9a8";     // el corrugado que se ve en los cantos
  const span = getPanelShelfSpan("impulsador", w, h, d);
  const baseH = span.rowBottom - 0.009;
  const topperH = h - span.panelH;
  const bandejas = Array.from({ length: span.rows + 1 }, (_, i) => baseH + i * span.rowPitch);
  const anchoUtil = Math.max(0.05, w - 2 * CARTON);
  const fondoUtil = Math.max(0.05, d - CARTON);
  const pinta = !ghost && !!facePaint?.front;

  return (
    <group>
      {/* El arte del proveedor, rebanado por bandeja (la misma lámina que el
          impulsador: el arte se arma con la misma cuenta). */}
      {pinta && (
        <LaminaDeProductoPorFila
          ancho={span.panelW}
          alto={span.panelH}
          filas={{ rowBottom: span.rowBottom, rowPitch: span.rowPitch, rows: span.rows }}
          fondos={Array.from({ length: span.rows }, () => d)}
          montajeA={d / 2} haciaA={-1}
          facePaint={facePaint}
        />
      )}

      {/* Los dos costados, del piso al tope: el cabezote va encajado entre ellos. */}
      {[-1, 1].map((lado) => (
        <mesh key={lado} position={[lado * (w / 2 - CARTON / 2), h / 2, 0]} castShadow>
          <boxGeometry args={[CARTON, h, d]} />
          <meshStandardMaterial color={CARA} roughness={0.9} transparent opacity={op} />
        </mesh>
      ))}
      {/* El fondo. */}
      <mesh position={[0, h / 2, d / 2 - CARTON / 2]} castShadow>
        <boxGeometry args={[anchoUtil, h, CARTON]} />
        <meshStandardMaterial color={CARA} roughness={0.9} transparent opacity={op} />
      </mesh>
      {/* El zócalo: una caja cerrada hasta la primera bandeja, con la franja de
          estado al frente (como el impulsador). */}
      <mesh position={[0, baseH / 2, -CARTON / 2]} castShadow>
        <boxGeometry args={[anchoUtil, baseH, fondoUtil]} />
        <meshStandardMaterial color={CANTO} roughness={0.9} transparent opacity={op} />
      </mesh>
      <mesh position={[0, baseH * 0.5, -(d / 2 + 0.003)]}>
        <boxGeometry args={[anchoUtil * 0.85, Math.min(0.03, baseH * 0.4), 0.005]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>

      {/* Las bandejas: planas y de costado a costado (el cartón no se inclina),
          con el frente doblado hacia arriba como porta-precios. La de más
          arriba es el techo de la última fila: sin frente. */}
      {bandejas.map((y, i) => (
        <group key={i} position={[0, y, -CARTON / 2]}>
          <mesh position={[0, -0.006, 0]} castShadow>
            <boxGeometry args={[anchoUtil, 0.012, fondoUtil]} />
            <meshStandardMaterial color={CANTO} roughness={0.9} transparent opacity={op} />
          </mesh>
          {i < bandejas.length - 1 && (
            <mesh position={[0, 0.025, -(fondoUtil / 2 - CARTON / 2)]}>
              <boxGeometry args={[anchoUtil, 0.05, CARTON]} />
              <meshStandardMaterial color={CARA} roughness={0.85} transparent opacity={op} />
            </mesh>
          )}
        </group>
      ))}

      {/* El cabezote: el cartel de la marca, al frente y entre los costados.
          Ocupa lo que el impulsador le deja a su cartel y termina en el alto. */}
      <mesh position={[0, h - topperH / 2, -(d / 2 - CARTON)]} castShadow>
        <boxGeometry args={[anchoUtil, topperH, CARTON * 2]} />
        <meshStandardMaterial color={statusColor} roughness={0.7} transparent opacity={op} />
      </mesh>
      <mesh position={[0, h - topperH / 2, -(d / 2 + 0.0005)]}>
        <boxGeometry args={[anchoUtil * 0.88, topperH * 0.7, 0.002]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} transparent opacity={0.9 * op} />
      </mesh>

      {/* El relleno por rubro, sobre las bandejas y entre los costados. */}
      {!pinta && (
        <ProductoEnRepisas
          alturas={bandejas}
          techo={h - topperH}
          ancho={anchoUtil - 0.01} fondo={fondoUtil}
          montaje={d / 2 - CARTON} hacia={-1}
          rubro={rubro} ghost={ghost}
        />
      )}
    </group>
  );
}

// ─── Mesh: Puesto de impulso ──────────────────────────────────────────────────

/** El mostrador de la promotora (`PuestoImpulsoReal`). El arte del proveedor
 *  va impreso en el frente del cuerpo, que es el cartel grande de la marca
 *  (`getPanelShelfSpan` lo compone en una sola fila). No lleva producto
 *  inventado: lo que se ofrece en la tapa cambia cada día. */
function PuestoImpulsoMesh({ w, d, h, statusColor, ghost, facePaint }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null }) {
  return (
    <PuestoImpulsoReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost}
      frente={!ghost ? facePaint?.front ?? null : null} />
  );
}

// ─── Mesh: Batea ──────────────────────────────────────────────────────────────

function BateaMesh({ w, d, h, statusColor, ghost, facePaint, id, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Estaba dibujada como un CARRO DE REPOSICIÓN: una jaula de tubos con tres
  // repisas planas y ruedas. Eso existe en una tienda, pero es lo que usa
  // quien repone, no lo que ve el cliente. Una batea es un canasto de paredes
  // inclinadas en el que se hurga, y esa inclinación es justo lo que el ojo
  // usa para distinguirla de un cajón.
  const boca = bocaDeBatea(w, d, h);
  return (
    <group>
      <BateaReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} />
      <VolcadoDeProducto
        ancho={boca.ancho} fondo={boca.fondo}
        y={boca.y} material={ghost ? null : (facePaint?.front ?? null)}
        semilla={`${id}|batea`} rubro={rubro}
        altoLibre={boca.altoLibre} ghost={ghost}
      />
    </group>
  );
}

function IslaFriaMesh({ w, d, h, statusColor, ghost, facePaint, id, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string }) {
  const op      = ghost ? 0.42 : 1;
  const BODY    = "#f3f4f6";   // blanco/gris claro — cuerpo superior
  const COMP    = "#374151";   // compresor oscuro
  const FRAME   = "#9ca3af";   // rim de acero
  const GLASS_C = "#bae6fd";   // guarda de acrílico
  const INNER   = "#dbeafe";   // interior frío
  const compH   = h * 0.30;
  const wellH   = h - compH;
  const guardH  = 0.20;        // guarda siempre 20 cm, se posa sobre el borde
  /** Cuánto se hunde el pozo. Una isla de helados de verdad es un hueco al que
   *  te asomás desde arriba, no un cajón cerrado: acá el hueco es geometría, y
   *  el producto se apoya en su piso. */
  const pozo    = Math.min(0.30, wellH * 0.45);
  const PARED   = 0.055;       // espesor de la pared del pozo
  const pisoY   = h - pozo;    // el piso del pozo, donde queda el producto

  return (
    <group>
      {/* Bloque compresor inferior (oscuro) */}
      <mesh position={[0, compH / 2, 0]} castShadow>
        <boxGeometry args={[w, compH, d]} />
        <meshStandardMaterial color={COMP} roughness={0.60} metalness={0.25} transparent opacity={op} />
      </mesh>

      {/* Rejillas de ventilación — 5 tiras por las 4 caras del compresor */}
      {Array.from({ length: 5 }, (_, i) => {
        const yp = compH * 0.10 + i * (compH * 0.18);
        return (
          <group key={i}>
            {/* frente */}
            <mesh position={[0, yp, -(d / 2 - 0.002)]}>
              <boxGeometry args={[w * 0.82, 0.012, 0.006]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* atrás */}
            <mesh position={[0, yp, d / 2 - 0.002]}>
              <boxGeometry args={[w * 0.82, 0.012, 0.006]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* izquierda */}
            <mesh position={[-(w / 2 - 0.002), yp, 0]}>
              <boxGeometry args={[0.006, 0.012, d * 0.82]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
            {/* derecha */}
            <mesh position={[w / 2 - 0.002, yp, 0]}>
              <boxGeometry args={[0.006, 0.012, d * 0.82]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} transparent opacity={op} />
            </mesh>
          </group>
        );
      })}

      {/* Cuerpo blanco, hasta donde arranca el hueco */}
      <mesh position={[0, compH + (wellH - pozo) / 2, 0]} castShadow>
        <boxGeometry args={[w, wellH - pozo, d]} />
        <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
      </mesh>

      {/* Las cuatro paredes del pozo. Dejan el hueco abierto arriba: es lo que
          hace que se lea como isla de congelados y no como cajón cerrado. */}
      {([
        [0, -(d / 2 - PARED / 2), w, PARED],
        [0,   d / 2 - PARED / 2,  w, PARED],
      ] as const).map(([px, pz, pw, pd], i) => (
        <mesh key={`zw${i}`} position={[px, pisoY + pozo / 2, pz]} castShadow>
          <boxGeometry args={[pw, pozo, pd]} />
          <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
        </mesh>
      ))}
      {([-(w / 2 - PARED / 2), w / 2 - PARED / 2] as const).map((px, i) => (
        <mesh key={`xw${i}`} position={[px, pisoY + pozo / 2, 0]} castShadow>
          <boxGeometry args={[PARED, pozo, d - PARED * 2]} />
          <meshStandardMaterial color={BODY} roughness={0.55} metalness={0.10} transparent opacity={op} />
        </mesh>
      ))}

      {/* Piso del pozo, con el tinte frío del acero esmaltado */}
      <mesh position={[0, pisoY + 0.006, 0]} receiveShadow>
        <boxGeometry args={[w - PARED * 2, 0.012, d - PARED * 2]} />
        <meshStandardMaterial color={INNER} roughness={0.18} metalness={0.20} transparent opacity={op} />
      </mesh>

      {/* Y el producto encima de ese piso, visto desde arriba */}
      <VolcadoDeProducto
        ancho={w - PARED * 2 - 0.02} fondo={d - PARED * 2 - 0.02}
        y={pisoY + 0.014} material={ghost ? null : (facePaint?.front ?? null)}
        semilla={`${id}|isla_fria`} rubro={rubro}
        altoLibre={Math.max(0.08, h - pisoY - 0.10)} ghost={ghost}
      />

      {/* Rim de acero — 4 perfiles delgados en las aristas superiores (no tapa el pozo) */}
      {/* Frente */}
      <mesh position={[0, h + 0.009, -(d / 2 - 0.006)]}>
        <boxGeometry args={[w + 0.012, 0.018, 0.018]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Atrás */}
      <mesh position={[0, h + 0.009, d / 2 - 0.006]}>
        <boxGeometry args={[w + 0.012, 0.018, 0.018]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Izquierda */}
      <mesh position={[-(w / 2 - 0.006), h + 0.009, 0]}>
        <boxGeometry args={[0.018, 0.018, d + 0.012]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>
      {/* Derecha */}
      <mesh position={[w / 2 - 0.006, h + 0.009, 0]}>
        <boxGeometry args={[0.018, 0.018, d + 0.012]} />
        <meshStandardMaterial color={FRAME} metalness={0.55} roughness={0.25} transparent opacity={op} />
      </mesh>

      {/* Guarda de acrílico — 4 paneles muy transparentes sobre el rim */}
      <mesh position={[0, h + 0.018 + guardH / 2, -(d / 2 - 0.010)]}>
        <boxGeometry args={[w - 0.020, guardH, 0.007]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[0, h + 0.018 + guardH / 2, d / 2 - 0.010]}>
        <boxGeometry args={[w - 0.020, guardH, 0.007]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[-(w / 2 - 0.010), h + 0.018 + guardH / 2, 0]}>
        <boxGeometry args={[0.007, guardH, d - 0.020]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>
      <mesh position={[w / 2 - 0.010, h + 0.018 + guardH / 2, 0]}>
        <boxGeometry args={[0.007, guardH, d - 0.020]} />
        <meshStandardMaterial color={GLASS_C} roughness={0.05} metalness={0.01}
          transparent opacity={0.14 * op} />
      </mesh>

      {/* Indicador de estado en frente del compresor */}
      <mesh position={[0, compH * 0.50, -(d / 2 + 0.008)]}>
        <boxGeometry args={[w * 0.60, 0.034, 0.010]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.88 * op} />
      </mesh>
    </group>
  );
}

// ─── Mesh: Nevera Carnes ──────────────────────────────────────────────────────
// Mostrador negro con gran vidrio curvo al frente (foto real): cuerpo oscuro bajo,
// dos paneles de vidrio simulando la curva, arcos laterales de metal negro.

function NeveraCarnesMesh({ w, d, h, statusColor, ghost, facePaint, id, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Era un cajón oscuro con una placa de vidrio PLANA y vertical parada
  // encima. Eso no es un mostrador de carnes: es una vitrina cualquiera. Le
  // faltaban las tres cosas que lo identifican, y son de forma: el vidrio
  // curvo, la bandeja inclinada hacia el cliente y la franja de servicio del
  // lado del que atiende.
  const bandeja = bandejaDeMostrador(w, d, h);
  return (
    <group>
      <MostradorFrioReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} />
      <group position={[0, 0, bandeja.z]}>
        <VolcadoDeProducto
          ancho={bandeja.ancho} fondo={bandeja.fondo}
          y={bandeja.y} material={ghost ? null : (facePaint?.front ?? null)}
          semilla={`${id}|carnes`} rubro={rubro || "Carnes"}
          altoLibre={bandeja.altoLibre} ghost={ghost}
        />
      </group>
    </group>
  );
}

function NeveraRefrescosMesh({ w, d, h, statusColor, ghost, facePaint, puertas, tramos }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;puertas?:number;tramos?:number }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Era una caja oscura con estantes y tiras de luz. Le faltaba lo que hace
  // que el ojo lea «mueble de frío»: en un multideck, la CORTINA DE AIRE —la
  // boca de impulsión bajo el copete y la reja de retorno al ras de la
  // bandeja de abajo—. Ese par de bocas cumple el mismo papel que la puerta
  // en una nevera cerrada: sin ellas, el mueble se lee como una estantería
  // pintada de oscuro.
  //
  // `nevera_refrescos` es de frente ABIERTO, como dice su ficha del catálogo
  // («vitrina multideck abierta para bebidas»). Con `puertas` es la NEVERA DE
  // PUERTAS (`nevera_puertas`): el mismo cuerpo cerrado con puertas de vidrio
  // (`NeveraReal variante="puertas"`), tantas como guardó de su ficha, y el
  // producto en prueba parado detrás del vidrio de cada hoja. Se vende entera,
  // como la abierta: las puertas sólo dicen cómo se ve.
  const conPuertas = puertas !== undefined;

  const util = altoUtilDeNevera(h);
  const fondoInterior = Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta);
  const filas = useMemo(() => filasDeNevera(h, fondoInterior), [h, fondoInterior]);

  const pinta = !ghost && !!facePaint?.front;
  // La nevera se vende entera: con el producto del proveedor en prueba, las
  // botellas mudas se apagan en todo el mueble.
  const enPrueba = !ghost && !!facePaint?.pruebaA;
  // Abierta y vendida por tramos: un vano por tramo, con su montante.
  const ventaNevera = useMemo(() => ventaDeNevera(w, d, h, puertas, conPuertas ? undefined : tramos), [w, d, h, puertas, conPuertas, tramos]);
  // La marca en el cabezote, como el copete de la punta: la nevera se vende
  // entera, y el cartel de arriba en gris decía «maqueta» justo encima de
  // las botellas del proveedor. Mismo dibujo honesto (`pop.ts`): el color de
  // la marca y recortes del producto, sin texto.
  const entorno = useEntornoDeProducto();
  const pa = facePaint?.pruebaA;
  // Es un aviso LUMINOSO (retroiluminado) y, en una botella transparente,
  // recorta la franja de su etiqueta y no la del medio de la foto.
  // Vendiendo puertas sueltas (`pa.vanos`), el cabezote es de la nevera
  // entera: no lleva la marca de quien compra una puerta.
  const cabezote = enPrueba && pa?.etiqueta && pa.donde === "todas" && pa.copete !== false && !pa.vanos
    ? materialDeCopete(pa.etiqueta, w - NEVERA.chapa * 2, NEVERA.copete * 0.62, entorno, {
      retroiluminado: true, franja: !!pa.empaque?.transparente,
    })
    : undefined;

  return (
    <group>
      <NeveraReal
        w={w} d={d} h={h}
        statusColor={statusColor}
        ghost={ghost}
        cabezote={cabezote}
        variante={conPuertas ? "puertas" : "multideck"}
        puertas={puertas}
        tramos={conPuertas ? undefined : tramos}
        resaltadas={conPuertas ? facePaint?.puertasA : undefined}
        // El relleno mudo se apaga cuando el proveedor subió su arte: lo que
        // se ve en el mueble tiene que ser SU producto, no uno inventado.
        conRelleno={!pinta && !enPrueba}
        // Las rejillas reacomodadas para el producto en prueba, si se pidió:
        // el producto y las rejillas salen de las MISMAS alturas.
        niveles={enPrueba && facePaint?.pruebaA?.filas
          ? facePaint.pruebaA.filas.alturas.slice(0, -1) : undefined}
      />
      {enPrueba && <ProductoDePrueba venta={ventaNevera} pruebas={[facePaint?.pruebaA]} tipo={conPuertas ? "nevera_puertas" : "nevera_refrescos"} />}

      {pinta && (
        <LaminaDeProductoPorFila
          ancho={w - NEVERA.chapa * 2 - 0.02}
          alto={util}
          filas={{ ...filas, rowBottom: filas.rowBottom }}
          fondos={filas.fondos}
          montajeA={d / 2 - NEVERA.chapa} haciaA={-1}
          facePaint={facePaint}
        />
      )}
    </group>
  );
}

// ─── Mesh: Stand Frutas / Verduras ───────────────────────────────────────────
// Cajón estilo madera (tipo Alkosto): costillas horizontales, esquineros metálicos,
// patas cortas, relleno de producto con tinte verde/amarillo.

/**
 * El mural refrigerado de frutas y verduras.
 *
 * Es el mismo cuerpo que el multideck de bebidas —carrocería, zócalo con
 * compresor, copete y cortina de aire— con la diferencia que cambia todo: sus
 * niveles son BANDEJAS INCLINADAS y no entrepaños planos. Lo que se carga
 * encima es fruta suelta, que rueda y hay que verla desde arriba; con estantes
 * planos el mueble se lee como una estantería con cosas apoyadas.
 */
function NeveraVegetalesMesh({ w, d, h, statusColor, ghost, facePaint, id, rubro, tramos }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string;tramos?:number }) {
  return (
    <group>
      <NeveraReal
        w={w} d={d} h={h}
        statusColor={statusColor}
        ghost={ghost}
        variante="vegetales"
        conRelleno={false}
        // Vendido por tramos: un montante entre tramo y tramo.
        tramos={tramos}
      />
      {/* Cada bandeja se llena con el MISMO componente que la batea y el cajón
          de frutas: con el arte del proveedor si lo subió, y con producto
          genérico si no. Tener uno propio para el mural dejaba el mueble sin
          arte — calculaba si el proveedor tenía el suyo y después no lo
          dibujaba en ningún lado. */}
      {bandejasDeMural(w, d, h).map((b, i) => (
        <group key={i} position={[0, b.y, b.z]} rotation={[b.caida, 0, 0]}>
          <VolcadoDeProducto
            ancho={b.ancho} fondo={b.fondo}
            y={0} material={ghost ? null : (facePaint?.front ?? null)}
            semilla={`${id}|mural|${i}`} rubro={rubro || "Frutas"}
            altoLibre={b.altoLibre} ghost={ghost}
          />
        </group>
      ))}
    </group>
  );
}

function StandFrutasMesh({ w, d, h, statusColor, ghost, facePaint, id, rubro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;facePaint?:FacePaint|null;id?:string;rubro?:string }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Era un mesón macizo con un cajón poco profundo arriba: la fruta volcada
  // sobre una tabla plana rodeada de costillas. Eso es una mesa con cosas
  // encima. La ficha del fabricante da bandejas INCLINADAS y ESCALONADAS con
  // CAJONES plásticos apoyados: la inclinación es para mirar la fruta desde
  // arriba, el escalón para que la bandeja de atrás no quede tapada —o el
  // mueble pierde la mitad de su frente vendible— y el cajón porque la fruta
  // llega en cajón y se exhibe en el cajón.
  const bandejas = bandejasDeStand(w, d, h);
  return (
    <group>
      <StandFrutasReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} />
      {bandejas.map((b, i) => (
        // El producto va DENTRO del grupo que se inclina. Afuera, la fila de
        // atrás flota sobre el cajón y la de adelante se hunde en la madera.
        // Y cada escalón lleva SU semilla: con una sola, los cuatro salen
        // clonados y la isla se ve como un espejo de sí misma.
        <group key={i} position={[0, b.y, b.z]} rotation={[b.caida, 0, 0]}>
          {/* La fruta va DENTRO del cajón: mismo fondo y mismo corrimiento que
              le da `bandejasDeStand`. Con el fondo de la bandeja entera y sin
              correr —que es como estaba— la fruta se salía por el borde. */}
          <group position={[0, 0, b.cajonZ]}>
            <VolcadoDeProducto
              ancho={b.ancho - 0.05} fondo={b.cajonFondo - 0.04}
              y={0.03} material={ghost ? null : (facePaint?.front ?? null)}
              semilla={`${id}|stand${i}`} rubro={rubro || "Frutas"}
              altoLibre={b.altoLibre} ghost={ghost}
            />
          </group>
        </group>
      ))}
    </group>
  );
}

function CheckoutMesh({ w, d, h, statusColor, ghost, bahias }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;bahias?:number }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Era un cajón liso con una placa oscura de cinta y la PANTALLA FLOTANDO:
  // el poste medía `posH * 0.75` y la pantalla se colocaba a `posH`, así que
  // quedaban veinticinco centímetros de aire entre los dos. Y le faltaba lo
  // que hace que una caja se lea como una caja: la cama hundida con su bocel,
  // la consola de la registradora de la que sale el poste, el sector de
  // empaque con su guarda y los estantes de impulso del lado del cliente.
  //
  // Vender por partes: con las bahías de impulso del plano (`partes.bahias`),
  // la mesa se parte en esos nichos, que son lo que se vende de la caja.
  return <CheckoutReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} bahias={bahias} />;
}

// ─── Mesh: Columna ────────────────────────────────────────────────────────────

function ColumnaMesh({ w, d, h, statusColor, ghost, forro }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean;forro?:boolean }) {
  // En la pantalla de venta la columna es parte del LOCAL: va del piso al
  // cielo raso, con la luz de venta de los muebles y sin el remate de arriba.
  // Con la altura del plano (3 m, 20 cm por debajo del cielo raso), sin esa
  // luz y con el capitel, se veía como una chimenea marrón parada en medio de
  // la sala, detrás de la isla y encima de la góndola en la toma de PUN-03.
  const luz = useLuzDeVenta();
  const venta = usePropsDeLuzDeVenta(luz, K_ENTORNO_MUEBLE, BRILLO.pintado);
  useAtenuacion([venta]);
  const alto = luz ? Math.max(h, ALTO_CIELO_RASO) : h;
  const op      = ghost ? 0.42 : 1;
  const plinthH = Math.min(alto * 0.06, 0.18);
  const capitalH = luz ? 0 : Math.min(alto * 0.05, 0.15);
  const shaftH   = alto - plinthH - capitalH;
  const overhang = 0.06;  // how much plinth/capital overhang the shaft

  return (
    <group>
      {/* Plinth (base) */}
      <mesh position={[0, plinthH / 2, 0]} castShadow>
        <boxGeometry args={[w + overhang * 2, plinthH, d + overhang * 2]} />
        <meshStandardMaterial color="#b8b5ae" metalness={0.10} roughness={0.70} transparent opacity={op} {...venta} />
      </mesh>

      {/* Shaft */}
      <mesh position={[0, plinthH + shaftH / 2, 0]} castShadow>
        <boxGeometry args={[w, shaftH, d]} />
        <meshStandardMaterial color="#d1cec8" metalness={0.08} roughness={0.75} transparent opacity={op} {...venta} />
      </mesh>

      {/* Capital (top) — sólo en el editor */}
      {capitalH > 0 && (
        <mesh position={[0, plinthH + shaftH + capitalH / 2, 0]} castShadow>
          <boxGeometry args={[w + overhang * 2, capitalH, d + overhang * 2]} />
          <meshStandardMaterial color="#b8b5ae" metalness={0.10} roughness={0.70} transparent opacity={op} />
        </mesh>
      )}

      {/* Vender por partes: el forro de la columna (`partes.forro`), una
          envoltura de las cuatro caras del zócalo a dos metros, que es lo que
          se le vende a una marca. Sin el forro, la columna de siempre. */}
      {forro && (() => {
        const altoForro = Math.max(0.2, Math.min(FORRO.alto, plinthH + shaftH) - plinthH);
        return (
          <group>
            <mesh position={[0, plinthH + altoForro / 2, 0]} castShadow>
              <boxGeometry args={[w + FORRO.espesor * 2, altoForro, d + FORRO.espesor * 2]} />
              <meshStandardMaterial color="#ece7dc" metalness={0.05} roughness={0.55} transparent opacity={op} {...venta} />
            </mesh>
            {/* El marco de arriba: el remate del panel, que es lo que dice que
                es un forro y no la columna pintada. */}
            <mesh position={[0, plinthH + altoForro - 0.012, 0]}>
              <boxGeometry args={[w + FORRO.espesor * 2 + 0.01, 0.024, d + FORRO.espesor * 2 + 0.01]} />
              <meshStandardMaterial color="#8d969c" metalness={0.45} roughness={0.45} transparent opacity={op} {...venta} />
            </mesh>
          </group>
        );
      })()}

      {/* Status indicator (subtle thin ring at base) */}
      <mesh position={[0, plinthH + 0.02, 0]}>
        <boxGeometry args={[w + 0.004 + (forro ? FORRO.espesor * 2 + 0.01 : 0), 0.018, d + 0.004 + (forro ? FORRO.espesor * 2 + 0.01 : 0)]} />
        <meshLambertMaterial color={statusColor} transparent opacity={0.70 * op} />
      </mesh>
    </group>
  );
}

// ─── FixtureMesh dispatcher ───────────────────────────────────────────────────

interface FixtureMeshProps {
  fixture:         PlacedFixture;
  ghost?:          boolean;
  /** Sin colores de estado (Presentar): las tiras verdes y rojas del
   *  robatope, la nevera y el impulsador dicen qué está vendido, y eso no se
   *  le muestra a un proveedor. */
  neutro?:         boolean;
  facePaint?:      FacePaint | null;
  selectedSlotId?: string | null;
  hoveredSlotId?:  string | null;
  onSlotClick?:    (slotId: string) => void;
  onSlotHover?:    (slotId: string | null) => void;
}

/**
 * Mostrador de servicio al cliente: devoluciones, reclamos e información.
 *
 * Es más alto que una caja (1.10 m contra 0.90) porque se atiende de pie y de
 * frente, no de costado con una cinta; lleva un mostrador bajo accesible de un
 * lado y un cartel colgante, que es como se lo reconoce desde el pasillo.
 */
function ServicioClienteMesh({ w, d, h, statusColor, ghost }: { w:number;d:number;h:number;statusColor:string;ghost?:boolean }) {
  // ── La geometría del mueble vive en `muebles/`, no acá ──────────────────
  // Era una tapa lisa sobre un cajón con un cartel colgado de dos postes: ese
  // mueble no existe en ninguna tienda. Contra las fichas de dos fabricantes
  // de mobiliario comercial, lo que identifica un mostrador de atención es que
  // tiene DOS NIVELES — el plano de trabajo del que atiende, y encima la
  // repisa de atención volando hacia el cliente, donde el cliente apoya, firma
  // y deja lo que trae. Sin ese escalón, esto es un podio.
  return <ServicioClienteReal w={w} d={d} h={h} statusColor={statusColor} ghost={ghost} />;
}

/**
 * El despachador del catálogo: de un tipo de mueble al mesh que lo dibuja.
 *
 * Se exporta para el TALLER (`/taller`), que necesita poder pedir cualquier
 * mueble del catálogo por su tipo. Sin eso, mirarle la forma a un mueble
 * obliga a colocarlo en una sede y pelear con la cámara del editor, y la mitad
 * de los defectos de forma sólo se ven poniendo el ojo a la altura del
 * producto. No lo usa nadie más: el editor lo llama desde acá adentro.
 */
/** El contorno de la parte que se vende en el visor de Vender: el amarillo
 *  del botón de Vender, el mismo del marco de la puerta vendida. */
const COLOR_DE_LA_PARTE_VENDIDA = "#f2b705";

export function FixtureMesh({ fixture, ghost, neutro = false, facePaint, selectedSlotId, hoveredSlotId, onSlotClick, onSlotHover }: FixtureMeshProps) {
  const sc = neutro
    ? COLOR_NEUTRO
    : isRentable(fixture)
      ? (STATUS_COLORS[fixture.status] ?? STATUS_COLORS.free)
      : NON_RENTABLE_COLOR;
  const base = { w:fixture.w, d:fixture.d, h:fixture.h, statusColor:sc, ghost };
  const rubroEntero = rubroDeContratoEntero(fixture, neutro);
  // Lo que el mueble guardó (de su ficha o del panel), por la misma puerta
  // que usan la lámina, el producto y la cámara (`geometriaDe`).
  const geometria = geometriaDe(fixture);
  const cuerpo = (() => { switch (fixture.type) {
    case "gondola": return (
      <GondolaMesh {...base}
        rubroEntero={rubroEntero}
        semilla={fixture.id}
        gondolaType={fixture.gondolaType ?? "double"}
        entrepanos={geometria.entrepanos}
        modulo={geometria.modulo}
        tramos={geometria.tramos}
        facePaint={facePaint}
        slots={fixture.slots}
        selectedSlotId={selectedSlotId}
        hoveredSlotId={hoveredSlotId}
        onSlotClick={onSlotClick}
        onSlotHover={onSlotHover}
      />
    );
    case "punta": return (
      <PuntaMesh {...base}
        rubroEntero={rubroEntero}
        semilla={fixture.id}
        entrepanos={geometria.entrepanos}
        modulo={geometria.modulo}
        facePaint={facePaint}
        slots={fixture.slots}
        selectedSlotId={selectedSlotId}
        hoveredSlotId={hoveredSlotId}
        onSlotClick={onSlotClick}
        onSlotHover={onSlotHover}
      />
    );
    case "robatope":      return <RobatopeMesh      {...base} facePaint={facePaint} rubro={fixture.brandCategory} />;
    case "ristra":        return <RistraMesh         {...base} facePaint={facePaint} rubro={fixture.brandCategory} />;
    case "cross":         return <CrossMesh          {...base} facePaint={facePaint} rubro={fixture.brandCategory} />;
    case "metro":         return <MetroMesh          {...base} />;
    case "mueble":        return <MuebleMesh         {...base} facePaint={facePaint} />;
    // Una estiba o un exhibidor de cartón colocados desde un modelo tienen
    // su propio dibujo; sin modelo —un plano de antes—, el de siempre.
    case "isla":          return <IslaMesh           {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} hastaElFondo={typeof fixture.modelo === "string"} />;
    case "impulsador":    return fixture.modelo === MODELO_EXHIBIDOR_DE_CARTON
      ? <ExhibidorCartonMesh {...base} facePaint={facePaint} rubro={fixture.brandCategory} />
      : <ImpulsadorMesh     {...base} facePaint={facePaint} rubro={fixture.brandCategory} />;
    case "puesto_impulso": return <PuestoImpulsoMesh {...base} facePaint={facePaint} />;
    case "batea":         return <BateaMesh          {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} />;
    case "isla_fria":        return <IslaFriaMesh         {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} />;
    case "nevera_carnes":    return <NeveraCarnesMesh     {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} />;
    case "nevera_refrescos": return <NeveraRefrescosMesh  {...base} facePaint={facePaint} tramos={geometria.tramos} />;
    case "nevera_puertas":   return <NeveraRefrescosMesh  {...base} facePaint={facePaint} puertas={puertasDe(fixture.w, geometria.puertas)} />;
    case "nevera_vegetales": return <NeveraVegetalesMesh   {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} tramos={geometria.tramos} />;
    case "stand_frutas":     return <StandFrutasMesh       {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} />;
    case "checkout":      return <CheckoutMesh       {...base} bahias={geometria.bahias} />;
    case "servicio_cliente": return <ServicioClienteMesh {...base} />;
    case "columna":       return <ColumnaMesh        {...base} forro={geometria.forro} />;
    default:              return <IslaMesh           {...base} facePaint={facePaint} id={fixture.id} rubro={fixture.brandCategory} />;  // legacy exhibicion + unknown
  } })();
  // Vender por partes, en el visor de Vender: el contorno de cada tramo o
  // entrepaño que se vende, sobre el frente de su cara. Fuera de la lámina
  // (`CHROME`), como el contorno de los slots.
  const contornos = !ghost ? facePaint?.contornos : undefined;
  if (!contornos?.length) return cuerpo;
  return (
    <group>
      {cuerpo}
      {contornos.map((c, i) => (
        <group key={i} position={[c.cx, c.cy, c.z]} userData={CHROME}>
          <ContornoDeSlot w={Math.max(0.01, c.ancho)} h={Math.max(0.01, c.alto)} z={0} color={COLOR_DE_LA_PARTE_VENDIDA} />
        </group>
      ))}
    </group>
  );
}

// ─── Store room ───────────────────────────────────────────────────────────────

/** Lado de la baldosa, en metros. Es la medida de una baldosa de piso comercial,
 *  y de paso la unidad con la que el ojo mide distancias al caminar: sin una
 *  retícula en el suelo, avanzar por la tienda se siente como flotar porque no
 *  hay contra qué comparar el paso. */
const LADO_BALDOSA = 0.60;

/** La textura del piso: baldosa con junta, dibujada una sola vez en un canvas.
 *
 *  Dos baldosas por lado en la imagen y no una: así las juntas quedan por
 *  dentro del dibujo y no sobre el borde, que es donde el filtrado bilineal
 *  deja costura al repetir. Las líneas de los bordes se dibujan a media caña,
 *  y al repetirse se suman en una junta completa.
 */
function usarTexturaDePiso(): THREE.Texture {
  const { gl } = useThree();
  return useMemo(() => {
    const CELDA = 256;                 // px por baldosa
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = CELDA * 2;
    const c = lienzo.getContext("2d")!;
    c.fillStyle = "#ddd8cc";           // el mismo tono que tenía el piso liso
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.strokeStyle = "#cbc5b6";         // junta: apenas más oscura, no un enrejado
    c.lineWidth = 5;
    for (const v of [0, CELDA, CELDA * 2]) {
      c.beginPath(); c.moveTo(v, 0); c.lineTo(v, lienzo.height); c.stroke();
      c.beginPath(); c.moveTo(0, v); c.lineTo(lienzo.width, v); c.stroke();
    }
    const t = new THREE.CanvasTexture(lienzo);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    // Sin anisotropía, mirando el piso casi de canto —que es todo el rato en
    // primera persona— la retícula lejana se deshace en moaré.
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    return t;
  }, [gl]);
}

/** Alto del muro de la caminata: el de un supermercado de verdad, y
 *  suficiente para que su remate salga del cuadro salvo mirando de lejos. */
const ALTO_MURO = 4.5;
const ESPESOR_DE_MURO = 0.12;
const ZOCALO_DE_MURO = 0.12;

/**
 * El local: piso, bordes y —según la pantalla— muros y cielo raso.
 *
 * Todo sale de `limites` (`limitesDePlanta`, con la rotación de cada mueble):
 * es la MISMA caja de la grilla, de la caminata y de la cámara de venta. Antes
 * se calculaba aparte, con `f.x ± f.w/2` sin la rotación, y con las góndolas
 * giradas 90° los muros quedaban corridos hasta 1,35 m de la caminata.
 *
 * - En el editor: el piso de baldosa y sus bordes, como siempre.
 * - En primera persona: los muros de 4,5 m con su zócalo (al caminar ya te
 *   frena `murosDeCaminata` en el perímetro, y ese tope era invisible). En la
 *   órbita del editor no van: taparían el plano.
 * - En la pantalla de venta (Presentar y la lámina): el CIELO RASO a 3,2 m con
 *   las luminarias embutidas y los muros como planos que miran hacia adentro.
 *   Ninguno arroja ni recibe sombra (el mapa de sombras y su calibración no se
 *   tocan) ni suma luces (no recompila ningún material). Son cuatro llamadas:
 *   cielo raso, luminarias, muros y zócalos. Con primera persona, los muros de
 *   siempre y NO los planos: las dos cosas juntas se superponen y titilan.
 */
function StoreRoom({ limites, muebles, venta, primeraPersona }: {
  limites: LimitesPlanta;
  /** Para orientar las filas de luminarias con las góndolas. */
  muebles: PlacedFixture[];
  venta: boolean;
  primeraPersona: boolean;
}) {
  const { cx, cz, w: fw, d: fd } = limites;

  const piso = usarTexturaDePiso();
  const { invalidate } = useThree();
  useEffect(() => {
    // Repetir por metro real, no por lámina: la baldosa mide lo mismo en una
    // sede de 12 m que en una de 40.
    piso.repeat.set(fw / (LADO_BALDOSA * 2), fd / (LADO_BALDOSA * 2));
    piso.needsUpdate = true;
    invalidate();
  }, [piso, fw, fd, invalidate]);

  // Las luminarias y su grilla, que es lo que leen el brillo del acero y el
  // reflejo del piso (los uniformes compartidos de `luzDeVenta.ts`). La
  // orientación depende de los muebles; la clave es primitiva para no
  // rehacerla con cada arrastre que no cambia nada.
  const claveDeMuebles = muebles.map((f) => `${f.w.toFixed(2)}:${f.d.toFixed(2)}:${(f.rotY ?? 0).toFixed(3)}`).join(",");
  const luminarias = useMemo(
    () => luminariasDeTienda(limites, muebles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [limites.minX, limites.maxX, limites.minZ, limites.maxZ, claveDeMuebles],
  );
  useEffect(() => {
    if (ponerTienda(luminarias.grilla, limites)) invalidate();
  }, [luminarias, limites, invalidate]);

  const planos = venta && !primeraPersona;
  const geometrias = useMemo(() => planos ? {
    muros: geometriaDeMurosConDegradado(limites, ALTO_CIELO_RASO),
    zocalos: geometriaDeMurosDeVenta(limites, ZOCALO_DE_MURO, 0.012),
    cenefa: geometriaDeCenefa(limites),
    cielo: geometriaDeCieloRaso(limites),
    tira: new THREE.PlaneGeometry(LUMINARIA.largo, LUMINARIA.ancho).rotateX(Math.PI / 2),
  } : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [planos, limites.minX, limites.maxX, limites.minZ, limites.maxZ]);
  useEffect(() => () => {
    if (geometrias) Object.values(geometrias).forEach((g) => g.dispose());
  }, [geometrias]);

  // El piso de venta: el mismo Lambert de la baldosa con la sombra al pie de
  // cada mueble y el reflejo de las luminarias (`parcheDelPiso`). El mapa de
  // la sombra se arma sólo en venta y sólo cuando cambia el plano.
  const claveDePie = venta
    ? muebles.map((f) => `${f.x.toFixed(2)}:${f.z.toFixed(2)}:${f.w}:${f.d}:${f.h}:${(f.rotY ?? 0).toFixed(3)}`).join(",")
    : "";
  const pisoDeVenta = useMemo(() => {
    if (!venta) return null;
    const m = sombraDeHuellas(muebles, limites);
    const textura = new THREE.DataTexture(m.datos, m.ancho, m.alto, THREE.RedFormat, THREE.UnsignedByteType);
    // Una fila de un byte por píxel no viene alineada a 4.
    textura.unpackAlignment = 1;
    textura.magFilter = THREE.LinearFilter;
    textura.minFilter = THREE.LinearFilter;
    textura.needsUpdate = true;
    const uniformes: UniformesDelPiso = {
      uSombraPiso: { value: textura },
      uSombraCaja: { value: new THREE.Vector4(m.origen.x, m.origen.z, m.ancho * m.paso, m.alto * m.paso) },
    };
    const material = new THREE.MeshLambertMaterial({ map: piso });
    material.onBeforeCompile = parcheDelPiso(uniformes);
    material.customProgramCacheKey = () => "piso-de-venta";
    return { textura, material };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, claveDePie, limites.minX, limites.maxX, limites.minZ, limites.maxZ, piso]);
  useEffect(() => () => { pisoDeVenta?.textura.dispose(); pisoDeVenta?.material.dispose(); }, [pisoDeVenta]);

  const ponerLuminarias = useCallback((m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const matriz = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eje = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const uno = new THREE.Vector3(1, 1, 1);
    luminarias.instancias.forEach((l, i) => {
      m.setMatrixAt(i, matriz.compose(p.set(l.x, luminarias.grilla.y, l.z), q.setFromAxisAngle(eje, l.rotY), uno));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [luminarias, invalidate]);

  type V3 = [number, number, number];
  return (
    <group>
      {/* El piso de venta NO recibe la sombra de la direccional. Con el mapa
          de 1024 para toda la sede (un texel de ~4 cm) y la luz a plomo del
          centro, cada mueble lejos del centro tiraba al costado una sombra
          dura, en diagonal y con el borde en serrucho, que salía 15–25 cm de
          la base: con un cielo raso de luminarias difusas no hay sombras así,
          y era «mancha sucia» en cada toma con la base a la vista. El pie del
          mueble lo oscurece la sombra de las huellas (`sombraDeHuellas`),
          blanda y pegada a la base. Es el único material que lo cambia: es
          propio de la venta (se compila al entrar), así que ningún otro
          programa se recompila; el editor sigue con la sombra de siempre. */}
      {pisoDeVenta ? (
        <mesh rotation={[-Math.PI/2,0,0]} position={[cx,0,cz] as V3} receiveShadow={false} material={pisoDeVenta.material}>
          <planeGeometry args={[fw,fd]} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI/2,0,0]} position={[cx,0,cz] as V3} receiveShadow>
          <planeGeometry args={[fw,fd]} />
          <meshLambertMaterial map={piso} />
        </mesh>
      )}
      {[
        { pos:[cx,       0.001, cz-fd/2] as V3, args:[fw,   0.001, 0.06] as V3 },
        { pos:[cx,       0.001, cz+fd/2] as V3, args:[fw,   0.001, 0.06] as V3 },
        { pos:[cx-fw/2,  0.001, cz]      as V3, args:[0.06, 0.001, fd]   as V3 },
        { pos:[cx+fw/2,  0.001, cz]      as V3, args:[0.06, 0.001, fd]   as V3 },
      ].map((b,i)=>(
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.args} />
          <meshLambertMaterial color="#b8b0a4" />
        </mesh>
      ))}

      {/* Los muros de la caminata, con su zócalo. La cara interior queda justo
          sobre el borde del piso, y los del eje X se alargan un espesor para
          cerrar esquina. */}
      {primeraPersona && ([
        { pos:[cx, ALTO_MURO/2, cz - fd/2 - ESPESOR_DE_MURO/2] as V3, args:[fw + ESPESOR_DE_MURO*2, ALTO_MURO, ESPESOR_DE_MURO] as V3,
          zoc:[cx, ZOCALO_DE_MURO/2, cz - fd/2 + 0.012] as V3,        zargs:[fw, ZOCALO_DE_MURO, 0.024] as V3 },
        { pos:[cx, ALTO_MURO/2, cz + fd/2 + ESPESOR_DE_MURO/2] as V3, args:[fw + ESPESOR_DE_MURO*2, ALTO_MURO, ESPESOR_DE_MURO] as V3,
          zoc:[cx, ZOCALO_DE_MURO/2, cz + fd/2 - 0.012] as V3,        zargs:[fw, ZOCALO_DE_MURO, 0.024] as V3 },
        { pos:[cx - fw/2 - ESPESOR_DE_MURO/2, ALTO_MURO/2, cz] as V3, args:[ESPESOR_DE_MURO, ALTO_MURO, fd] as V3,
          zoc:[cx - fw/2 + 0.012, ZOCALO_DE_MURO/2, cz] as V3,        zargs:[0.024, ZOCALO_DE_MURO, fd] as V3 },
        { pos:[cx + fw/2 + ESPESOR_DE_MURO/2, ALTO_MURO/2, cz] as V3, args:[ESPESOR_DE_MURO, ALTO_MURO, fd] as V3,
          zoc:[cx + fw/2 - 0.012, ZOCALO_DE_MURO/2, cz] as V3,        zargs:[0.024, ZOCALO_DE_MURO, fd] as V3 },
      ]).map((m, i) => (
        <group key={`mu${i}`}>
          {/* El `emissive` no es un efecto: la direccional principal cuelga a
              40 m casi a plomo, así que una cara vertical recibe N·L ≈ 0 y el
              muro quedaba sólo con el ambiente —marrón sucio, más oscuro que
              el piso, al revés de cualquier tienda—. Levantarlo acá lo arregla
              sin tocar la luz de la escena, que ya está calibrada para los
              muebles. */}
          <mesh position={m.pos} receiveShadow>
            <boxGeometry args={m.args} />
            <meshLambertMaterial color="#efeae0" emissive="#a8a294" />
          </mesh>
          <mesh position={m.zoc}>
            <boxGeometry args={m.zargs} />
            <meshLambertMaterial color="#b9b2a3" emissive="#6e695d" />
          </mesh>
        </group>
      ))}

      {/* La tienda de la pantalla de venta: muros y zócalos que miran hacia
          adentro, el cielo raso que mira abajo y las luminarias. Con el mismo
          `emissive` que los muros de la caminata, y por la misma razón: la
          direccional les da de canto (a los muros) o de espaldas (al cielo
          raso), que sin él quedaría negro. */}
      {geometrias && (
        <>
          {/* El muro con su degradé (`luzDelMuro`): más claro arriba, bajo
              las luminarias, y más oscuro hacia el zócalo. Sin luz de la
              escena (que a un muro le da de canto): el color de siempre en la
              pantalla —#cfccc4, lo que daba el Lambert con su emissive— por
              el color de vértice. */}
          <mesh geometry={geometrias.muros} castShadow={false} receiveShadow={false}>
            <meshBasicMaterial color={COLOR_DEL_MURO_DE_VENTA} vertexColors toneMapped={false} side={THREE.FrontSide} />
          </mesh>
          {/* La cenefa perimetral (`geometriaDeCenefa`): paneles de la chapa
              de la tienda, sin texto. */}
          <mesh geometry={geometrias.cenefa} castShadow={false} receiveShadow={false}>
            <meshBasicMaterial vertexColors toneMapped={false} side={THREE.FrontSide} />
          </mesh>
          <mesh geometry={geometrias.zocalos} castShadow={false} receiveShadow={false}>
            <meshLambertMaterial color="#b9b2a3" emissive="#6e695d" side={THREE.FrontSide} />
          </mesh>
          <mesh geometry={geometrias.cielo} castShadow={false} receiveShadow={false}>
            <meshLambertMaterial color="#e4e2dc" emissive="#a9a7a1" side={THREE.FrontSide} />
          </mesh>
          {luminarias.instancias.length > 0 && (
            <instancedMesh
              key={`l${luminarias.instancias.length}`}
              args={[geometrias.tira, undefined, luminarias.instancias.length]}
              castShadow={false} receiveShadow={false}
              ref={ponerLuminarias}
            >
              <meshBasicMaterial color="#ffffff" toneMapped={false} side={THREE.FrontSide} />
            </instancedMesh>
          )}
        </>
      )}
    </group>
  );
}

// ─── Figura humana ────────────────────────────────────────────────────────────

/**
 * Una persona de 1,70 m al lado del mueble elegido.
 *
 * Es lo que vuelve legible la escala. Un render sin nada humano al lado se ve
 * como una maqueta: el proveedor no sabe si su exhibidor le llega al pecho o a
 * la rodilla, y «1,80 m de alto» escrito en una ficha no se lee igual que
 * verlo. Va al COSTADO y no adelante a propósito —adelante taparía justo la
 * cara que se está vendiendo, que es lo único que la lámina tiene que mostrar—.
 *
 * No es chrome: sale en la captura para el proveedor, que es donde hace falta.
 */
const ALTURA_PERSONA = FIGURA_DE_ESCALA.alto;
/** Cuánto se aparta la persona del canto del mueble en el EDITOR. Va en el
 *  PLANO de la cara, así que no la tapa aunque esté cerca. En la pantalla de
 *  venta la separación sale de la toma (`personaYTomaDeVenta`: de 1,2 m a
 *  30 cm, la primera en que entra entera); ésta queda para el editor y para
 *  Presentar sin toma. */
const SEPARACION_EN_VENTA = 0.3;
/** El gris de la silueta: en el editor, cálido y oscuro (se lee contra la
 *  grilla); en la pantalla de venta, más claro, para que pese menos que el
 *  mueble —la crítica: «tiene casi la masa visual del mueble y compite con el
 *  producto»—. Opaca en los dos: la translúcida era un fantasma. */
const GRIS_DE_SILUETA = "#8c867e";
const GRIS_DE_SILUETA_EN_VENTA = "#b8b4ae";

/** La silueta de la persona para la pantalla de venta, dibujada una vez.
 *
 *  Una figura de escala de arquitectura («scalie»): de frente, parada, con
 *  los brazos pegados al cuerpo y las piernas apenas separadas. La primera
 *  versión eran cajas redondeadas sueltas (brazos despegados del torso, un
 *  maniquí de prueba de choque) y translúcida: un fantasma por el que se veía
 *  el piso. Los trazos se superponen y se rellenan del mismo color, así que
 *  la unión es una sola mancha limpia. */
let texturaDeSilueta: THREE.CanvasTexture | null = null;
function siluetaDePersona(): THREE.CanvasTexture {
  if (texturaDeSilueta) return texturaDeSilueta;
  const ALTO = 864, ANCHO = 256;
  const m = ALTO / ALTURA_PERSONA;                         // px por metro
  const X = (x: number) => ANCHO / 2 + x * m, Y = (y: number) => ALTO - y * m;
  const c = document.createElement("canvas");
  c.width = ANCHO; c.height = ALTO;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  /** Un polígono suave por puntos (x, y) en metros, cerrado con curvas. */
  const forma = (pts: [number, number][]) => {
    g.beginPath();
    const n = pts.length;
    const medio = (a: [number, number], b: [number, number]) => [(X(a[0]) + X(b[0])) / 2, (Y(a[1]) + Y(b[1])) / 2];
    const [mx, my] = medio(pts[n - 1], pts[0]);
    g.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const [qx, qy] = medio(p, q);
      g.quadraticCurveTo(X(p[0]), Y(p[1]), qx, qy);
    }
    g.closePath();
    g.fill();
  };
  // La cabeza y el cuello.
  g.beginPath(); g.ellipse(X(0), Y(1.592), 0.074 * m, 0.098 * m, 0, 0, Math.PI * 2); g.fill();
  forma([[-0.045, 1.43], [-0.04, 1.52], [0.04, 1.52], [0.045, 1.43]]);
  // El torso: hombros redondeados, cintura, cadera.
  forma([[-0.06, 1.475], [-0.175, 1.45], [-0.205, 1.38], [-0.19, 1.2], [-0.155, 1.06], [-0.17, 0.93],
    [-0.15, 0.84], [0.15, 0.84], [0.17, 0.93], [0.155, 1.06], [0.19, 1.2], [0.205, 1.38], [0.175, 1.45], [0.06, 1.475]]);
  // Los brazos, colgando pegados al torso hasta la mano.
  for (const s of [-1, 1]) {
    forma([[s * 0.17, 1.44], [s * 0.225, 1.4], [s * 0.24, 1.2], [s * 0.235, 1.0], [s * 0.225, 0.84],
      [s * 0.205, 0.78], [s * 0.175, 0.8], [s * 0.172, 0.98], [s * 0.168, 1.25], [s * 0.15, 1.42]]);
  }
  // Las piernas, apenas separadas, y los pies.
  for (const s of [-1, 1]) {
    forma([[s * 0.008, 0.9], [s * 0.165, 0.92], [s * 0.15, 0.55], [s * 0.115, 0.12], [s * 0.125, 0.0],
      [s * 0.035, 0.0], [s * 0.045, 0.12], [s * 0.03, 0.55], [s * 0.012, 0.8]]);
  }
  texturaDeSilueta = new THREE.CanvasTexture(c);
  texturaDeSilueta.colorSpace = THREE.SRGBColorSpace;
  texturaDeSilueta.anisotropy = 4;
  return texturaDeSilueta;
}

/** Cuánto más oscura va la silueta al pie que en la cabeza (color de
 *  vértice): toda pareja era «de plano de arquitecto» al lado de muebles con
 *  sombra al pie y piso con reflejo (la crítica de la demo, ronda 3). El gris
 *  y la opacidad de siempre, arriba. */
export const DEGRADE_DE_SILUETA = 0.09;
/** La huella de sombra bajo los pies: un óvalo blando de 45 × 25 cm al 35 %.
 *  Sin ella la figura flotaba a un centímetro del baldosín. */
export const HUELLA_DE_PERSONA = { ancho: 0.45, fondo: 0.25, opacidad: 0.35 } as const;

let geometriaDeSilueta: THREE.PlaneGeometry | null = null;
/** El plano de la silueta con el degradé vertical en color de vértice (uno
 *  para todas: la persona es una sola a la vez). */
function planoDeSilueta(): THREE.PlaneGeometry {
  if (geometriaDeSilueta) return geometriaDeSilueta;
  const g = new THREE.PlaneGeometry(ALTURA_PERSONA * (256 / 864), ALTURA_PERSONA);
  const pos = g.getAttribute("position");
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // De 1 en la cabeza a 1 − DEGRADE en los pies.
    const k = 1 - DEGRADE_DE_SILUETA * (0.5 - pos.getY(i) / ALTURA_PERSONA);
    colores.set([k, k, k], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  geometriaDeSilueta = g;
  return g;
}

let huellaDePersona: { geometria: THREE.PlaneGeometry; material: THREE.MeshBasicMaterial } | null = null;
/** La huella de sombra de la persona: un plano acostado con un óvalo de
 *  borde blando (textura de 64 px, armada una vez). Translúcida y sin escribir
 *  profundidad: es una mancha en el piso, no un objeto. */
function sombraDePersona() {
  if (huellaDePersona) return huellaDePersona;
  const N = 64;
  const datos = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
    const r2 = Math.min(1, dx * dx + dy * dy);
    const k = (y * N + x) * 4;
    datos[k] = datos[k + 1] = datos[k + 2] = 255;
    datos[k + 3] = Math.round(255 * (1 - r2) * (1 - r2));
  }
  const textura = new THREE.DataTexture(datos, N, N, THREE.RGBAFormat);
  textura.magFilter = THREE.LinearFilter;
  textura.minFilter = THREE.LinearFilter;
  textura.needsUpdate = true;
  const geometria = new THREE.PlaneGeometry(HUELLA_DE_PERSONA.ancho, HUELLA_DE_PERSONA.fondo);
  geometria.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map: textura, transparent: true, opacity: HUELLA_DE_PERSONA.opacidad,
    depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  huellaDePersona = { geometria, material };
  return huellaDePersona;
}

/**
 * La persona de 1,70 m en la pantalla de venta: una SILUETA plana, opaca y de
 * un gris cálido, como las figuras de escala de un plano de arquitectura.
 *
 * La figura de cápsulas del editor era lo más «dibujo» de cada toma y lo
 * primero que miraba el ojo; la primera silueta, translúcida, era un
 * fantasma por el que se veían el piso y la pared. Opaca y más oscura que el
 * piso (cerca del 60 % de su tono) da la escala sin competir con el
 * producto. Si queda cortada por el borde del cuadro, no se dibuja: media
 * persona no da escala, distrae.
 */
function SiluetaDeEscala({ x, z, rotY, color = GRIS_DE_SILUETA, mirarCamara = false }: {
  x: number; z: number; rotY: number; color?: string;
  /** En venta la silueta gira sobre su eje vertical hacia la cámara (como un
   *  cartel de cartón que sigue a quien lo mira): la dueña gira a mano 25–35°
   *  más que la toma en plena reunión, y de canto la figura plana era una
   *  astilla gris. Lo que decide si entra en el cuadro siguen siendo las
   *  esquinas de `rotY` (las de `personaYTomaDeVenta`). */
  mirarCamara?: boolean;
}) {
  const grupo = useRef<THREE.Group>(null);
  const figura = useRef<THREE.Mesh>(null);
  // Las MISMAS esquinas que proyecta `personaYTomaDeVenta` para decidir si
  // entra (`FIGURA_DE_ESCALA`).
  const m = FIGURA_DE_ESCALA.medioAncho;
  const esquinas = useMemo(() => [
    new THREE.Vector3(-m, 0, 0), new THREE.Vector3(m, 0, 0),
    new THREE.Vector3(-m, ALTURA_PERSONA, 0), new THREE.Vector3(m, ALTURA_PERSONA, 0),
  ], [m]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = grupo.current;
    if (!g) return;
    g.updateMatrixWorld();
    g.visible = esquinas.every((e) => {
      v.copy(e).applyMatrix4(g.matrixWorld).project(camera);
      // La misma regla que la cuenta de la toma (`dentroDelCuadro`).
      return dentroDelCuadro(v.x, v.y, v.z < 1);
    });
    // El plano mira a +Z: su giro en el mundo es el que apunta a la cámara.
    if (mirarCamara && figura.current) figura.current.rotation.y = giroHaciaLaCamara(x, z, camera.position.x, camera.position.z) - rotY;
  });
  return (
    <group ref={grupo} position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh ref={figura} position={[0, ALTURA_PERSONA / 2, 0]} geometry={planoDeSilueta()}>
        {/* Opaca: el borde con alphaTest y a la pasada opaca, que escribe
            profundidad como cualquier mueble. El degradé (más oscura al pie),
            por color de vértice. */}
        <meshBasicMaterial
          map={siluetaDePersona()} color={color} alphaTest={0.5} vertexColors
          toneMapped={false} side={THREE.DoubleSide}
        />
        {/* La huella de sombra, HIJA de la figura: gira con ella hacia la
            cámara y se esconde con ella si la persona no entra entera. */}
        <mesh position={[0, -ALTURA_PERSONA / 2 + 0.003, 0]} renderOrder={1}
          geometry={sombraDePersona().geometria} material={sombraDePersona().material} />
      </mesh>
    </group>
  );
}

/** El giro (alrededor de Y) que deja un plano que mira a +Z, parado en
 *  (x, z), de frente a una cámara en (cx, cz). Puro. */
export function giroHaciaLaCamara(x: number, z: number, cx: number, cz: number): number {
  return Math.atan2(cx - x, cz - z);
}

// ─── Selection wireframe ──────────────────────────────────────────────────────

/** Marca lo que NO debe salir en una captura: es herramienta, no tienda. */
const CHROME = { chrome: true };

function SelectionBox({ w, d, h }: { w:number;d:number;h:number }) {
  return (
    <mesh position={[0,h/2,0]} userData={CHROME}>
      <boxGeometry args={[w+0.24, h+0.24, d+0.24]} />
      <meshBasicMaterial color="#818cf8" wireframe />
    </mesh>
  );
}

// ─── Camera controls ──────────────────────────────────────────────────────────

function CameraControls({
  orbitRef,
  onReady,
  distanciaMinima = 4,
}: {
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  onReady?: (ctrl: ThreeOrbitControls) => (() => void) | void;
  /** Cuánto se puede acercar la órbita a su mira. */
  distanciaMinima?: number;
}) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const ctrl = new ThreeOrbitControls(camera, gl.domElement);
    ctrl.target.set(...CAM_TARGET);
    ctrl.minPolarAngle = Math.PI / 6;
    ctrl.maxPolarAngle = Math.PI / 2.1;
    ctrl.minDistance   = 4;
    ctrl.maxDistance   = 80;
    ctrl.enablePan     = true;
    ctrl.panSpeed      = 1.4;
    ctrl.update();
    orbitRef.current   = ctrl;
    // With frameloop="demand", re-render only when the camera actually moves.
    const onCtrlChange = () => invalidate();
    ctrl.addEventListener('change', onCtrlChange);
    // B3: capture the disposer returned by onReady (removes the 'change' listener)
    const disposeListener = onReady?.(ctrl);
    return () => {
      ctrl.removeEventListener('change', onCtrlChange);
      disposeListener?.();
      ctrl.dispose();
      orbitRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Un efecto APARTE: los controles se arman una sola vez (dependencias
  // vacías) y rearmarlos perdería la cámara. Al volver a 4 m, `update()` aleja
  // la órbita sola hasta el mínimo.
  useEffect(() => {
    const ctrl = orbitRef.current;
    if (!ctrl) return;
    ctrl.minDistance = distanciaMinima;
    ctrl.update();
    invalidate();
  }, [distanciaMinima, orbitRef, invalidate]);
  // No useFrame needed — OrbitControls fires 'change' on every user interaction
  // (already calls update() internally), and we invalidate from that event.
  return null;
}

// ─── MEJORA 5: Screenshot capture ────────────────────────────────────────────

function ScreenshotCapture({ onReady }: { onReady: (fn: () => string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      // Esconder el gizmo y la caja de selección ACÁ, y no con un estado de
      // React, es lo único que funciona: apagarlos por estado deja la captura
      // a merced de cuándo React confirma el cambio, y el gizmo salía dibujado
      // en la primera de las dos tomas. Esto es sincrónico y no falla.
      const ocultos: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData?.chrome && o.visible) { o.visible = false; ocultos.push(o); }
      });
      try {
        // Dibujar y leer en el MISMO turno. El lienzo no se creó con
        // preserveDrawingBuffer, así que el búfer se limpia al componer y un
        // toDataURL suelto devuelve una imagen en blanco — que es lo que venía
        // bajando el botón de captura.
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } finally {
        ocultos.forEach((o) => { o.visible = true; });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, onReady]);
  return null;
}

/** Estilo de las etiquetas del panel derecho, compartido por sus bloques. */
const ETIQUETA_CLS = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";

/**
 * La vista con la que se le muestra este espacio a un proveedor.
 *
 * Sin esto, cada vez que alguien arma una propuesta tiene que volver a buscar
 * el ángulo a mano, y dos propuestas del mismo espacio salen distintas. La
 * cámara se guarda en el layout, así que viaja al servidor y aparece en la
 * laptop del que arma la propuesta.
 *
 * Se guarda la cámara ORBITAL. En primera persona la cámara no se persiste —
 * la caminata escribiría cientos de veces por recorrido — así que el botón
 * avisa en vez de guardar algo viejo.
 */
/**
 * Elegir qué producto se le prueba a la cara del mueble.
 *
 * Se abre como ventana y no dentro de la barra lateral porque acá se elige
 * MIRANDO: la barra tiene 208 px y una miniatura de producto ahí no se
 * distingue de la de al lado. En una reunión, esta ventana es lo que se
 * proyecta mientras el proveedor decide.
 */
function SelectorDeProducto({
  catalogo, cargando, isAdmin, proveedor, onProveedor, onElegir, onCerrar, onSubido,
}: {
  catalogo: Arte[];
  cargando: boolean;
  isAdmin: boolean;
  /** El proveedor con el que se está reunido, o null si todavía no se eligió. */
  proveedor: string | null;
  onProveedor: (proveedor: string | null) => void;
  onElegir: (arteId: number) => void;
  onCerrar: () => void;
  onSubido: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [abrirCarga, setAbrirCarga] = useState(false);
  /** El arte cuyas medidas se están corrigiendo, con la ficha en borrador. */
  const [midiendo, setMidiendo] = useState<{ arte: Arte; ficha: FichaDeArte } | null>(null);
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [problemasDeFicha, setProblemasDeFicha] = useState<string[]>([]);

  // ── Privacidad: la pantalla se comparte ──────────────────────────────────
  // El catálogo entero es la lista de clientes de la tienda: abrirlo delante
  // de Alpina le mostraba los productos de Nutresa y de Colanta. Con el
  // proveedor de la reunión fijado sólo salen los suyos; sin fijar, no sale
  // nada hasta que se escriben tres letras de SU nombre.
  const q = busca.trim().toLowerCase();
  const filtrado = useMemo(() => {
    if (proveedor) {
      return catalogo.filter(a => a.proveedor === proveedor && (!q ||
        `${a.nombre} ${a.categoria ?? ""}`.toLowerCase().includes(q)));
    }
    if (q.length < 3) return [];
    return catalogo.filter(a => a.proveedor.toLowerCase().includes(q));
  }, [catalogo, proveedor, q]);

  // Agrupado por proveedor: es como se piensa el catálogo cuando se está
  // negociando con uno de ellos.
  const porProveedor = useMemo(() => {
    const m = new Map<string, Arte[]>();
    for (const a of filtrado) {
      const lista = m.get(a.proveedor) ?? [];
      lista.push(a);
      m.set(a.proveedor, lista);
    }
    return [...m.entries()];
  }, [filtrado]);

  // Mientras el catálogo está abierto, ÉL es la pantalla: se lleva el amarillo
  // y cualquier botón principal de atrás pasa a tinta.
  useModalAbierto();

  return (
    <div
      data-cajon-oscuro
      data-capa-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-dark-line bg-dark-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-dark-line px-4 py-3">
          <Package size={15} className="text-accent" />
          <h3 className="text-sm font-semibold text-dark-ink-1" data-titulo-selector>
            {proveedor ? `Productos de ${proveedor}` : "Probar un producto"}
          </h3>
          {proveedor && (
            <button
              // La reunión sigue, sin proveedor hasta elegir un producto del
              // siguiente (`REUNION_SIN_PROVEEDOR`): con `null` se cerraba la
              // reunión, y al cerrar el selector volvían las pruebas de todos.
              onClick={() => { onProveedor(REUNION_SIN_PROVEEDOR); setBusca(""); }}
              className="text-[11px] text-dark-ink-3 underline-offset-2 hover:text-dark-ink-1 hover:underline"
            >
              Cambiar de proveedor
            </button>
          )}
          <div className="relative ml-auto">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dark-ink-3" />
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={proveedor ? "Producto…" : "Escribí el proveedor…"}
              aria-label={proveedor ? "Buscar un producto" : "Escribí el proveedor"}
              className="w-52 rounded border border-dark-line-2 bg-dark-bg py-1.5 pl-7 pr-2 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <button onClick={onCerrar} className="text-dark-ink-3 hover:text-dark-ink-1" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cargando ? (
            <p className="py-10 text-center text-xs text-dark-ink-3">Cargando el catálogo…</p>
          ) : catalogo.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-dark-ink-2">Todavía no hay artes cargadas.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-dark-ink-3">
                Subí la imagen del producto —la que manda el proveedor— y desde
                acá se la probás a cualquier mueble, en cualquier sede.
              </p>
            </div>
          ) : !proveedor && q.length < 3 ? (
            <p className="py-10 text-center text-xs text-dark-ink-3" data-sin-proveedor>
              Escribí al menos tres letras del proveedor con el que estás reunido:
              acá sólo aparecen sus productos.
            </p>
          ) : porProveedor.length === 0 ? (
            <p className="py-10 text-center text-xs text-dark-ink-3">
              {proveedor && !q
                ? `${proveedor} todavía no tiene productos cargados.`
                : `Nada que coincida con «${busca}».`}
            </p>
          ) : (
            // `deGrupo` y no `proveedor`: con el mismo nombre tapaba la prop, el
            // `if (!proveedor)` de abajo leía el nombre del grupo (siempre
            // lleno) y elegir un producto NUNCA fijaba el proveedor de la
            // reunión — y «Presentar» sin mueble elegido mostraba la tienda
            // sin ninguna prueba.
            porProveedor.map(([deGrupo, artes]) => (
              <div key={deGrupo} className="mb-5 last:mb-0">
                <p className={ETIQUETA_CLS}>{deGrupo}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2.5">
                  {artes.map(a => (
                    <div
                      key={a.id}
                      className="group overflow-hidden rounded-lg border border-dark-line-2 bg-dark-bg text-left transition-colors hover:border-accent"
                    >
                      <button
                        // Elegir un producto fija el proveedor de la reunión:
                        // la próxima vez el selector abre sólo con los suyos.
                        onClick={() => { if (!proveedor) onProveedor(a.proveedor); onElegir(a.id); }}
                        className="block w-full text-left"
                      >
                        <div className="flex h-20 items-center justify-center bg-dark-surface-2 p-1.5">
                          <img
                            src={arteUrl(a.id)}
                            alt={a.nombre}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="px-2 pt-1.5">
                          <p className="flex items-center gap-1 text-[11px] font-semibold text-dark-ink-1" title={a.nombre}>
                            <span className="truncate">{a.nombre}</span>
                            {/* Va en frío: probarlo en un mueble seco es lo
                                primero que descarta el que compra. */}
                            {vaRefrigerado(a.categoria, a.nombre) && (
                              <span className="shrink-0 rounded bg-sky-500/20 px-1 text-[9px] font-semibold text-sky-300" data-frio>frío</span>
                            )}
                          </p>
                          {/* «≈»: sin alto cargado, el 3D lo estima por el
                              contenido o por el rubro. Se ve a escala, pero
                              aproximada, y quien vende tiene que saberlo. */}
                          <p className="truncate text-[10px] text-dark-ink-3">
                            {a.ficha?.alto_mm
                              ? `${(a.ficha.alto_mm / 10).toString().replace(".", ",")} cm`
                              : "≈ medidas estimadas"}
                            {a.categoria ? ` · ${a.categoria}` : ""}
                          </p>
                        </div>
                      </button>
                      <div className="flex justify-end px-2 pb-1.5">
                        {isAdmin && (
                          <button
                            onClick={() => setMidiendo({ arte: a, ficha: a.ficha ?? FICHA_VACIA })}
                            className="text-[10px] font-semibold text-dark-ink-3 hover:text-dark-ink-1"
                          >
                            Medidas
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Corregir las medidas de un arte ya cargado: es el camino de las que
            se subieron antes de que existiera la ficha. */}
        {isAdmin && midiendo && (
          <div className="border-t border-dark-line px-4 py-3" data-medidas-de={midiendo.arte.id}>
            <p className="mb-2 text-xs font-semibold text-dark-ink-1">
              Medidas de {midiendo.arte.nombre}
            </p>
            <EditorDeFicha
              imagen={arteUrl(midiendo.arte.id)}
              ficha={midiendo.ficha}
              nombre={midiendo.arte.nombre}
              categoria={midiendo.arte.categoria}
              onCambio={(f) => setMidiendo(m => (m ? { ...m, ficha: f } : m))}
              onValidez={setProblemasDeFicha}
            />
            {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => { setMidiendo(null); setError(""); }} className="text-xs text-dark-ink-3 hover:text-dark-ink-1">
                Cancelar
              </button>
              <button
                // Con un campo que no se entiende no se guarda: viajaba como
                // `null` y pisaba el valor que estaba (`onValidez`).
                disabled={guardandoFicha || problemasDeFicha.length > 0}
                onClick={async () => {
                  if (problemasDeFicha.length > 0) return;
                  setGuardandoFicha(true);
                  setError("");
                  try {
                    await guardarFicha(midiendo.arte.id, midiendo.ficha);
                    setMidiendo(null);
                    onSubido();
                  } catch (e) {
                    setError(describeError(e, "No se pudieron guardar las medidas."));
                  } finally {
                    setGuardandoFicha(false);
                  }
                }}
                // Tinta y no amarillo: el amarillo del selector es «Guardar»
                // del alta, y los dos no se ven nunca a la vez pero cuentan
                // igual (`outputs/tema.md` §2: uno por pantalla).
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {guardandoFicha && <Loader2 size={12} className="animate-spin" />}
                Guardar medidas
              </button>
            </div>
          </div>
        )}

        {isAdmin && !midiendo && (
          <div className="border-t border-dark-line px-4 py-3">
            {abrirCarga ? (
              <FormularioDeArte
                proveedorInicial={proveedor}
                subiendo={subiendo}
                error={error}
                onError={setError}
                onSubiendo={setSubiendo}
                onListo={() => { setAbrirCarga(false); setError(""); onSubido(); }}
                onCancelar={() => { setAbrirCarga(false); setError(""); }}
              />
            ) : (
              <button
                onClick={() => setAbrirCarga(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
              >
                <Plus size={13} /> Subir el arte de un producto
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cargar un arte nueva sin salir de la ventana.
 *
 *  Va acá y no en otra pantalla porque el momento en que se descubre que falta
 *  es este: el proveedor pregunta cómo se vería su producto y no está cargado.
 *  Mandarlo a otro lado a subirlo termina la demostración. */
function FormularioDeArte({
  proveedorInicial, subiendo, error, onError, onSubiendo, onListo, onCancelar,
}: {
  /** El proveedor de la reunión: llega elegido. */
  proveedorInicial?: string | null;
  subiendo: boolean;
  error: string;
  onError: (m: string) => void;
  onSubiendo: (v: boolean) => void;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [nombre, setNombre] = useState("");
  // El rubro va a `categoria`, una columna que ya existía y que la interfaz
  // nunca llenaba. Sin ficha, es lo que permite estimar el envase.
  const [rubro, setRubro] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ficha, setFicha] = useState<FichaDeArte>(FICHA_VACIA);
  const [problemasDeFicha, setProblemasDeFicha] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSuppliers()
      .then(list => {
        const lista = list.map(p => ({ id: p.id, name: p.name }));
        setProveedores(lista);
        // Se sube el arte del proveedor con el que se está reunido: llega
        // elegido, y elegir otro sigue a un clic.
        const deLaReunion = proveedorInicial
          ? lista.find(p => p.name.trim().toLowerCase() === proveedorInicial.trim().toLowerCase())
          : undefined;
        if (deLaReunion) setSupplierId(id => (id === "" ? deLaReunion.id : id));
      })
      .catch(() => setProveedores([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campo = "rounded border border-dark-line-2 bg-dark-bg px-2 py-1.5 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none";

  async function enviar() {
    if (subiendo) return;
    if (supplierId === "") { onError("Elegí de qué proveedor es."); return; }
    if (!nombre.trim())    { onError("Ponele nombre al producto: es lo que se elige de la lista."); return; }
    if (!archivo)          { onError("Falta la imagen del producto."); return; }
    // El alto es lo que decide la escala y cuántos frentes entran: en un arte
    // NUEVO no se adivina.
    // Un campo que no se entiende (o fuera de los topes) viajaba como `null`:
    // el precio, el ancho o el fondo se perdían sin aviso.
    if (problemasDeFicha.length > 0) { onError(problemasDeFicha[0]); return; }
    if (!ficha.alto_mm)    { onError("Poné el alto del envase en cm: con eso se calcula cuántos entran."); return; }
    onSubiendo(true);
    onError("");
    try {
      await subirArte({
        supplierId, nombre: nombre.trim(), categoria: rubro.trim() || undefined, archivo, ficha,
      });
      setNombre("");
      setRubro("");
      setArchivo(null);
      setFicha(FICHA_VACIA);
      onListo();
    } catch (e) {
      onError(describeError(e, "No se pudo subir el arte."));
    } finally {
      onSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={supplierId}
          onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          className={campo}
        >
          <option value="">Proveedor…</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del producto (con el contenido: 200 g, 1,5 L)"
          className={`${campo} flex-1 min-w-[10rem]`}
        />
        <input
          value={rubro}
          onChange={e => setRubro(e.target.value)}
          placeholder="Rubro"
          aria-label="Rubro"
          className={`${campo} w-28`}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { setArchivo(e.target.files?.[0] ?? null); setFicha(FICHA_VACIA); onError(""); }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded border border-dark-line-2 px-2 py-1.5 text-xs text-dark-ink-2 hover:text-dark-ink-1"
        >
          <Upload size={12} /> {archivo ? "Cambiar" : "Imagen"}
        </button>
        {archivo && (
          <span className="max-w-[9rem] truncate text-[11px] text-dark-ink-3" title={archivo.name}>
            {archivo.name}
          </span>
        )}
        {/* El botón principal del editor de zonas: el único amarillo de esta
            pantalla (`outputs/tema.md` §2). «Cambiar / Imagen» y «Cancelar»
            quedan en tinta sobre el cajón oscuro. */}
        <button
          onClick={enviar}
          disabled={subiendo}
          className="btn-principal flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs"
        >
          {subiendo && <Loader2 size={12} className="animate-spin" />}
          {subiendo ? "Subiendo…" : "Guardar"}
        </button>
        <button onClick={onCancelar} className="text-xs text-dark-ink-3 hover:text-dark-ink-1">
          Cancelar
        </button>
      </div>
      {archivo && (
        <EditorDeFicha
          imagen={archivo}
          ficha={ficha}
          nombre={nombre}
          categoria={rubro}
          onCambio={setFicha}
          altoObligatorio
          onValidez={setProblemasDeFicha}
        />
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <p className="text-[10px] leading-relaxed text-dark-ink-3">
        Una foto del FRENTE del envase, derecha y sin perspectiva —con el costado
        a la vista, en el 3D se ve doble lomo—, y su alto en centímetros: con el
        alto se calcula cuántos entran por entrepaño. Mejor en PNG sin fondo; si
        no, sobre fondo blanco parejo, que se quita solo. Una sola unidad basta.
      </p>
    </div>
  );
}

/**
 * Dónde va el producto que se está probando, y cuánto entra.
 *
 * Es lo que se negocia: «entran diez por entrepaño, tres de fondo». Sale de
 * `unidadesDePrueba`, la MISMA cuenta que dibuja los envases en el 3D, así que
 * lo que dice el panel es lo que se ve. Y cuando el producto no entra, lo dice
 * con medidas en vez de achicarlo: «no entra parada: 33 cm en 31 cm libres».
 *
 * Los entrepaños vendidos a otros se marcan «vendido» SIN nombre ni precio: la
 * pantalla puede estar compartida con un proveedor.
 */
/** «36 a 37,5 cm» o «36 cm»: lo libre entre rejillas, del menor al mayor. */
function textoDeLibres(filas: { alturas: number[] }): string {
  const libres = filas.alturas.slice(1).map((y, i) => y - filas.alturas[i]);
  const min = Math.min(...libres), max = Math.max(...libres);
  return enCm(min) === enCm(max) ? `${enCm(min)} cm` : `${enCm(min)} a ${enCm(max)} cm`;
}

/**
 * Las rejillas de la nevera: **Automáticas · De fábrica · A mano**.
 *
 * Es el pedido de la dueña: que se acomoden SOLAS cuando el producto no entra
 * parado, y que si el acomodo no queda bien haya salida a mano. Todo sale de
 * `rejillasDeLaPrueba` (la misma cuenta que dibuja) y de `moverRejilla`.
 *
 * Cambiar de modo o de cantidad vuelve «Dónde va» a la cara entera: los
 * índices de «Por entrepaño» son de las filas VIGENTES, y con otras filas
 * apuntarían a otra rejilla. Mover una rejilla no lo toca: las filas siguen
 * siendo las mismas, sólo más altas o más bajas.
 */
function BloqueDeRejillas({
  rejillas, fabrica, vigentes, alto, porFila, onAjustar,
}: {
  rejillas: RejillasDeLaPrueba;
  fabrica: FilasDeProducto;
  vigentes: FilasDeProducto;
  alto: number;
  /** Lo que entra en cada rejilla vigente (`unidadesDePrueba`). */
  porFila: readonly FilaDePrueba[];
  onAjustar: (cambios: Partial<ComoSePrueba>) => void;
}) {
  const { modo } = rejillas;
  // Tres chips en 200 px: sin cortar «De fábrica» en dos renglones.
  const chip = (activo: boolean) =>
    `flex-1 whitespace-nowrap rounded px-0.5 py-1 text-[10px] font-semibold tracking-tight transition-colors ${
      activo ? "bg-accent text-accent-ink" : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
    }`;
  const libresDeFabrica = fabrica.alturas.slice(1).map((y, i) => y - fabrica.alturas[i]);
  const mover = (i: number, pasos: number) => moverRejilla(vigentes, i, pasos);
  const ajustar = (accion: AccionDeRejillas) => onAjustar(ajusteDeRejillas(accion, vigentes));

  return (
    <div className="flex flex-col gap-1" data-rejillas data-modo-rejillas={modo}>
      <p className="text-[10px] uppercase tracking-widest text-dark-ink-3">Rejillas</p>
      <div className="flex gap-1.5">
        <button className={chip(modo === "auto")} data-rejillas-modo="auto"
          onClick={() => modo !== "auto" && ajustar({ modo: "auto" })}>
          Automáticas
        </button>
        <button className={chip(modo === "fabrica")} data-rejillas-modo="fabrica"
          onClick={() => modo !== "fabrica" && ajustar({ modo: "fabrica" })}>
          De fábrica
        </button>
        <button className={chip(modo === "manual")} data-rejillas-modo="manual"
          // Arranca con las que se ven: tocar «A mano» no cambia nada hasta
          // que se mueve algo.
          onClick={() => modo !== "manual" && ajustar({ modo: "manual" })}>
          A mano
        </button>
      </div>

      {modo === "auto" && (
        <p className="text-[10.5px] leading-snug text-dark-ink-2" data-rejillas-texto>
          {rejillas.filas
            ? `${rejillas.filas.rows} rejillas con ${textoDeLibres(rejillas.filas)} libres: entra parada en todas. Es sólo para mostrar: el plano no cambia.`
            : libresDeFabrica.every((l) => l >= alto)
              ? "Las de fábrica: ya entra parada."
              : rejillas.nMax === 0
                ? "Las de fábrica: no entra parada ni acomodando las rejillas."
                : "Las de fábrica: acomodarlas no suma frentes."}
        </p>
      )}
      {modo === "fabrica" && (
        // En la MISMA línea, si parada no entra: el aviso quedaba más abajo, en
        // otro bloque, y la dueña lo tenía que buscar (la crítica, ronda 3).
        <p className="text-[10.5px] leading-snug text-dark-ink-3" data-rejillas-texto>
          Las {fabrica.rows} de fábrica, como está la nevera hoy.
          {(() => {
            const sin = libresDeFabrica.filter((l) => l < alto);
            if (sin.length === 0) return null;
            const max = Math.max(...(sin.length === libresDeFabrica.length ? libresDeFabrica : sin));
            return sin.length === libresDeFabrica.length
              ? <span className="text-warning"> No entra parada: {enCm(alto)} cm en {enCm(max)} cm libres.</span>
              : <span className="text-warning"> En {sin.length} de {libresDeFabrica.length} no entra parada: {enCm(alto)} cm en {enCm(max)} cm.</span>;
          })()}
        </p>
      )}
      {modo === "manual" && (
        <div className="flex flex-col gap-1" data-rejillas-a-mano>
          <div className="flex items-center gap-2 text-[11px] text-dark-ink-1">
            <button
              className="rounded border border-dark-line-2 px-2 font-bold disabled:opacity-40"
              disabled={rejillas.cuantas <= 1}
              data-rejillas-menos
              onClick={() => ajustar({ cuantas: rejillas.cuantas - 1 })}
            >−</button>
            <span className="font-semibold" data-rejillas-cuantas={rejillas.cuantas}>
              {rejillas.cuantas} {rejillas.cuantas === 1 ? "rejilla" : "rejillas"}
            </span>
            <button
              className="rounded border border-dark-line-2 px-2 font-bold disabled:opacity-40"
              // Hasta las de fábrica: no se inventan rejillas. Y no hasta las
              // que entran: con más, el panel dice dónde no entra.
              disabled={rejillas.cuantas >= fabrica.rows}
              data-rejillas-mas
              onClick={() => ajustar({ cuantas: rejillas.cuantas + 1 })}
            >+</button>
          </div>
          {/* De arriba hacia abajo, como se ve la nevera. */}
          {Array.from({ length: vigentes.rows }, (_, i) => vigentes.rows - 1 - i).map((i) => {
            const libre = vigentes.alturas[i + 1] - vigentes.alturas[i];
            const f = porFila[i];
            const noEntra = f?.motivo === "no-entra-alto";
            const arriba = mover(i, 1), abajo = mover(i, -1);
            return (
              <div key={i} data-rejilla={i}
                className="flex items-center gap-1.5 rounded border border-dark-line/60 px-1.5 py-0.5 text-[10.5px] text-dark-ink-2">
                <span className="w-3 font-mono font-bold">{i + 1}</span>
                <span className="flex-1">
                  a {enCm(vigentes.alturas[i])} cm · {enCm(libre)} cm libres
                  {noEntra && <span className="block text-warning">no entra parada: {enCm(alto)} cm en {enCm(libre)} cm</span>}
                </span>
                {i > 0 && (
                  <>
                    <button data-subir title="Subir una ranura (2,5 cm)"
                      disabled={arriba.alturas[i] === vigentes.alturas[i]}
                      className="px-1 disabled:opacity-30"
                      onClick={() => ajustar({ mover: i, pasos: 1 })}>▲</button>
                    <button data-bajar title="Bajar una ranura (2,5 cm)"
                      disabled={abajo.alturas[i] === vigentes.alturas[i]}
                      className="px-1 disabled:opacity-30"
                      onClick={() => ajustar({ mover: i, pasos: -1 })}>▼</button>
                  </>
                )}
              </div>
            );
          })}
          <p className="text-[10px] leading-snug text-dark-ink-3">Es sólo para mostrar: el plano no cambia.</p>
        </div>
      )}
    </div>
  );
}

/** Las etiquetas de varios artes, para un panel FUERA del lienzo (como
 *  `useEtiqueta`, pero para una lista): se vuelve a dibujar cuando cargan. */
function useEtiquetas(ids: readonly number[], catalogo: readonly Arte[]): (Etiqueta | null)[] {
  const [, setVersion] = useState(0);
  const [avisar] = useState(() => () => setVersion((v) => v + 1));
  return ids.map((id) => {
    const a = catalogo.find((x) => x.id === id);
    if (!a) return null;
    const modo = a.ficha?.fondo_foto ?? "auto";
    return etiquetaDeArte(claveDeArte(id, modo), arteUrl(id), modo, avisar, { arte: a, ficha: a.ficha ?? null });
  });
}

export function PanelDePrueba({
  fix, cara, arte, como, onAjustar, isAdmin, onRecargarCatalogo, catalogo, paraElProveedor = false,
}: {
  fix: PlacedFixture;
  cara: "A" | "B";
  arte: Arte;
  como: ComoSePrueba;
  onAjustar: (cambios: Partial<ComoSePrueba>) => void;
  isAdmin: boolean;
  onRecargarCatalogo: () => void;
  /** Para ofrecer el surtido: los OTROS artes de este proveedor. */
  catalogo: Arte[];
  /** El panel lo lee el PROVEEDOR (el visor de Vender). Las repisas que el
   *  plano da por vendidas aparte no tienen contrato en la base, y Vender
   *  —que mira contratos— le está ofreciendo la cara entera: decirle «esta
   *  cara tiene 5 entrepaños vendidos: la prueba los tapa» es contradecir la
   *  pantalla de al lado delante de él. Ahí no va el aviso, y la marca del
   *  entrepaño, sólo en «Por entrepaño» y en tinta. A la dueña se le avisa
   *  en la fila del contrato, antes de la reunión. */
  paraElProveedor?: boolean;
}) {
  const venta = useMemo(
    () => (TIPOS_CON_PRUEBA_3D.has(fix.type)
      ? ventaDeTipo(fix.type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fix.type, fix.w, fix.d, fix.h, fix.gondolaType, fix.entrepanos, fix.modulo, fix.partes?.puertas],
  );
  const modo = arte.ficha?.fondo_foto ?? "auto";
  // La misma etiqueta que usa el 3D (mismo caché): de ahí salen el aspecto y
  // el perfil con que se estima el envase cuando falta la ficha.
  // Con la pista del arte: el worker arma de una las variantes de su envase.
  const etiqueta = useEtiqueta(venta ? arte.id : null, modo, { arte, ficha: arte.ficha ?? null });
  // Si la foto no cargó, se dice y se ofrece reintentar: «Preparando el
  // producto…» para siempre no le dice a nadie qué hacer.
  const estadoFoto = venta ? estadoDeEtiqueta(claveDeArte(arte.id, modo)) : null;
  const [midiendo, setMidiendo] = useState<FichaDeArte | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [problemasDeFicha, setProblemasDeFicha] = useState<string[]>([]);
  const [error, setError] = useState("");

  const empaque = useMemo(
    () => (etiqueta ? empaqueDeArte(arte, arte.ficha ?? null, etiqueta.recorte, { acostado: como.acostado }) : null),
    [etiqueta, arte, como.acostado],
  );
  // En la nevera, las rejillas con que se prueba: la MISMA cuenta que dibuja
  // (`rejillasDeLaPrueba`, la usa también `construirPrueba`). Automáticas de
  // entrada: lo que hace el mercaderista cuando llega la de 2 L.
  const esNevera = esNeveraDeBebidas(fix.type);
  const rejillas = useMemo(
    () => (venta && esNevera ? rejillasDeLaPrueba(venta, empaque, como.rejillas) : null),
    [venta, esNevera, empaque, como.rejillas],
  );
  const ventaUsada = useMemo(
    () => (venta && rejillas?.filas ? { ...venta, filas: rejillas.filas } : venta),
    [venta, rejillas],
  );
  // Lo que entraría en cada entrepaño, elegido o no: es lo que ofrecen los
  // chips. Y lo que se dibuja, con lo elegido.
  const capacidad = useMemo(
    () => (ventaUsada && empaque ? unidadesDePrueba({ venta: ventaUsada, empaque, donde: "todas", semilla: "panel" }) : null),
    [ventaUsada, empaque],
  );
  const acomodo = useMemo(
    () => (ventaUsada && empaque ? unidadesDePrueba({ venta: ventaUsada, empaque, donde: como.donde, semilla: "panel" }) : null),
    [ventaUsada, empaque, como.donde],
  );
  // «Acostarla sólo en la N»: los entrepaños donde parada no entra, con la
  // MISMA cuenta que dibuja (`filasSinAlto`, la usa `construirPrueba`), y lo
  // que entra ahí acostada. Sólo un envase torneado parado, con la cara
  // entera, sin surtido y si en algún entrepaño sí entra parado.
  const acostadaSoloAhi = useMemo(() => {
    if (!ventaUsada || !empaque || !etiqueta || empaque.acostado || empaque.envase !== "revolucion"
      || como.donde !== "todas" || (como.surtido?.length ?? 0) > 0) return null;
    const sin = filasSinAlto(ventaUsada.filas, empaque.alto);
    if (sin.length === 0 || sin.length === ventaUsada.filas.rows) return null;
    const acostado = empaqueDeArte(arte, arte.ficha ?? null, etiqueta.recorte, { acostado: true });
    const r = unidadesDePrueba({ venta: ventaUsada, empaque: acostado, donde: sin, semilla: "panel" });
    const enCadaUna = sin.map((i) => r.porFila[i]?.frentes ?? 0);
    // Si acostada tampoco entra en alguno, no se ofrece: quedaría vacío igual.
    if (enCadaUna.some((n) => n === 0)) return null;
    return { filas: sin, nombres: sin.map((i) => i + 1).join(" y "), frentes: r.frentesALaVista, enCadaUna };
  }, [ventaUsada, empaque, etiqueta, arte, como.donde, como.surtido]);
  const acostadaActiva = !!como.acostarDondeNoEntra && !!acostadaSoloAhi;
  // Los entrepaños con un espacio vendido encima, por la misma regla que el
  // relleno por rubro (`entrepanosDelEspacio`). Se miran sobre las filas de
  // FÁBRICA y no sobre las rejillas acomodadas: en la nevera no importa,
  // porque no tiene franja de slots (`ventaDeNevera` no la trae: se vende
  // entera) y esto sale siempre vacío.
  const vendidos = useMemo(() => {
    const s = new Set<number>();
    if (!venta || venta.franja == null) return s;
    for (const slot of fix.slots ?? []) {
      if (!VENDIDO.has(slot.status)) continue;
      for (const i of entrepanosDelEspacio(slot, venta.filas, venta.franja)) s.add(i);
    }
    return s;
  }, [venta, fix.slots]);

  // El surtido (góndola y punta): los OTROS artes de este proveedor, en
  // bloques verticales por vano. Lo que se dibuja sale de la misma cuenta
  // (`surtidoALaVista`, `bloquesDeSurtido`, `unidadesDePrueba` con su tramo).
  const conSurtido = TIPOS_CON_SURTIDO.has(fix.type);
  const idsSurtido = useMemo(
    () => (conSurtido ? surtidoALaVista(arte.id, como.surtido, catalogo, undefined) : []),
    [conSurtido, arte.id, como.surtido, catalogo],
  );
  const etiquetasSurtido = useEtiquetas(idsSurtido, catalogo);
  const claveEtiquetasSurtido = etiquetasSurtido.map((e) => e?.clave ?? "-").join(",");
  const resumenDeSurtido = useMemo(() => {
    if (!ventaUsada || !empaque || idsSurtido.length === 0) return null;
    const tramos = bloquesDeSurtido(ventaUsada.vanos, idsSurtido.length + 1);
    const productos = [
      { arte, empaque },
      ...idsSurtido.map((id, k) => {
        const a = catalogo.find((x) => x.id === id)!;
        const et = etiquetasSurtido[k];
        return { arte: a, empaque: et ? empaqueDeArte(a, a.ficha ?? null, et.recorte, { acostado: como.acostado }) : null };
      }),
    ];
    let total = 0;
    const partes = productos.map((x, k) => {
      if (!x.empaque) return `${x.arte.nombre} …`;
      const r = unidadesDePrueba({
        venta: ventaUsada, empaque: x.empaque, donde: como.donde, semilla: "panel", tramo: tramos[k], surtido: true,
      });
      total += r.frentesALaVista;
      const fs = r.porFila.filter((f) => f.motivo === null).map((f) => f.frentes);
      if (fs.length === 0) return `${x.arte.nombre} 0`;
      const mn = Math.min(...fs), mx = Math.max(...fs);
      return `${x.arte.nombre} ${mn === mx ? mn : `${mn} a ${mx}`}`;
    });
    return { texto: `${partes.join(" · ")} por entrepaño · ${total} de frente` };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaUsada, empaque, idsSurtido, claveEtiquetasSurtido, como.donde, como.acostado, arte, catalogo]);
  const disponiblesParaSurtido = conSurtido
    ? catalogo.filter((a) => a.supplier_id === arte.supplier_id && a.id !== arte.id && !idsSurtido.includes(a.id))
    : [];

  // Los muebles sin entrepaños (vitrina, isla…) muestran la prueba como
  // lámina: no hay dónde elegir.
  if (!venta) return null;

  const chip = (activo: boolean) =>
    `flex-1 rounded px-1 py-1 text-[10.5px] font-semibold transition-colors ${
      activo ? "bg-accent text-accent-ink" : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
    }`;
  const porEntrepano = como.donde !== "todas";
  const elegidos = como.donde === "todas" ? [] : como.donde;
  const alternar = (i: number) => {
    const ya = elegidos.includes(i);
    const nuevos = ya ? elegidos.filter((x) => x !== i) : [...elegidos, i].sort((a, b) => a - b);
    onAjustar({ donde: nuevos });
  };
  const filas = capacidad?.porFila ?? [];
  const entran = filas.filter((f) => f.motivo !== "no-entra-alto" && f.frentes > 0);
  const maxLibre = filas.reduce((m, f) => Math.max(m, f.libre), 0);
  const conProducto = (acomodo?.porFila ?? []).filter((f) => f.motivo === null);
  const frentesPorFila = conProducto.map((f) => f.frentes);
  const minF = Math.min(...frentesPorFila), maxF = Math.max(...frentesPorFila);
  const pisos = conProducto.reduce((m, f) => Math.max(m, f.pisos), 0);
  const aprox = empaque?.estimado || empaque?.anchoEstimado ? "≈ " : "";
  // La cuenta que se negocia, en el orden en que se pregunta: cuántos de
  // frente, cuántos de fondo, cuántos por entrepaño y cuántos en total.
  // Decía «Entran 10 por entrepaño · 3 de fondo · 40 de frente»: el «por
  // entrepaño» eran frentes y el «de frente» el total de frentes, y ante
  // «¿cuántos me entran?» se leían 10 y 40 a la vez, sin las unidades. Y el
  // fondo era el que se DIBUJA (hasta tres): el entrepaño de 45 cm lleva seis
  // vasos de fondo (`fondoTotal`).
  const fondoReal = conProducto.reduce((m, f) => Math.max(m, f.fondoTotal), 0);
  const fondoMinimo = conProducto.reduce((m, f) => Math.min(m, f.fondoTotal), Infinity);
  const unidadesTotales = conProducto.reduce((t, f) => t + f.unidades, 0);
  const frentesTotales = conProducto.reduce((t, f) => t + f.frentes, 0);
  const parejo = conProducto.every((f) => f.frentes === minF && f.fondoTotal === fondoReal && f.pisos === pisos);
  const enProfundidad = fondoReal > 1 || pisos > 1;
  const textoDeLaCuenta = conProducto.length === 0 ? "" : [
    `${minF === maxF ? minF : `${minF} a ${maxF}`} de frente`,
    fondoReal > 1 ? ` × ${fondoMinimo === fondoReal ? fondoReal : `${fondoMinimo} a ${fondoReal}`} de fondo` : "",
    pisos > 1 ? ` × ${pisos} apilados` : "",
    conProducto.length === 1
      ? `: ${unidadesTotales} ${unidadesTotales === 1 ? "unidad" : "unidades"}`
      : `${enProfundidad && parejo ? ` = ${minF * fondoReal * pisos}` : ""} por entrepaño · ${conProducto.length} entrepaños: ${unidadesTotales} unidades`,
    enProfundidad ? ` (${frentesTotales} ${frentesTotales === 1 ? "frente" : "frentes"})` : "",
  ].join("");
  const vendidosTapados = como.donde === "todas"
    ? vendidos.size
    : elegidos.filter((i) => vendidos.has(i)).length;

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-panel-prueba data-cara={cara}>
      <p className="text-[10px] uppercase tracking-widest text-dark-ink-3">Dónde va</p>
      <div className="flex gap-1.5">
        <button className={chip(!porEntrepano)} onClick={() => onAjustar({ donde: "todas" })}>
          Toda la cara
        </button>
        <button
          className={chip(porEntrepano)}
          // Al pasar a «Por entrepaño» arranca con el que va a la altura de
          // los ojos y entra: es el que se ofrece primero.
          onClick={() => {
            if (porEntrepano) return;
            const ojos = entran.reduce<number | null>((m, f) =>
              m == null || Math.abs(f.apoyo + f.libre / 2 - 1.3) < Math.abs(filas[m].apoyo + filas[m].libre / 2 - 1.3) ? f.fila : m, null);
            onAjustar({ donde: ojos == null ? [] : [ojos] });
          }}
        >
          Por entrepaño
        </button>
      </div>

      {porEntrepano && (
        // De arriba hacia abajo, como se ve el mueble; numerados desde el piso.
        <div className="flex flex-col gap-1" data-chips-entrepano>
          {[...filas].reverse().map((f) => {
            const noEntra = f.motivo === "no-entra-alto" || f.motivo === "no-entra-fondo";
            const activo = elegidos.includes(f.fila);
            return (
              <button
                key={f.fila}
                disabled={noEntra}
                onClick={() => alternar(f.fila)}
                data-entrepano={f.fila}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-[10.5px] transition-colors ${
                  noEntra
                    ? "cursor-not-allowed border border-dark-line/50 text-dark-ink-3 opacity-60"
                    : activo
                      ? "bg-accent text-accent-ink"
                      : "border border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"
                }`}
              >
                <span className="w-3 font-mono font-bold">{f.fila + 1}</span>
                <span className="flex-1">
                  {f.motivo === "no-entra-fondo"
                    ? `no entra de fondo: ${enCm(f.fondo)} cm`
                    : noEntra ? `no entra: ${enCm(f.libre)} cm` : `${enCm(f.libre)} cm libres`}
                </span>
                {vendidos.has(f.fila) && (
                  <span
                    className={`text-[9.5px] font-semibold uppercase ${activo ? "" : paraElProveedor ? "text-dark-ink-3" : "text-warning"}`}
                    data-entrepano-vendido
                  >
                    vendido
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {vendidosTapados > 0 && !paraElProveedor && (
        <p className="text-[10.5px] leading-snug text-warning" data-vendidos-tapados>
          {como.donde === "todas"
            ? `Esta cara tiene ${vendidosTapados} ${vendidosTapados === 1 ? "entrepaño vendido" : "entrepaños vendidos"}: la prueba los tapa.`
            : `${vendidosTapados === 1 ? "Uno de los elegidos está vendido" : `${vendidosTapados} de los elegidos están vendidos`}: la prueba los tapa.`}
        </p>
      )}

      {/* Un producto de frío en un mueble seco: no se bloquea —decide la
          dueña—, pero se dice, antes que la cuenta. */}
      {avisoDeFrio(fix.type, arte.categoria, arte.nombre) && (
        <p className="rounded border border-warning/60 bg-warning/10 px-2 py-1 text-[10.5px] leading-snug text-warning" data-aviso-frio>
          Este producto va refrigerado: probalo en una nevera.
        </p>
      )}

      {/* El surtido: más productos del MISMO proveedor, cada uno en su bloque
          vertical. Sólo los de ese proveedor, sacados del catálogo, sin
          buscador libre: la pantalla puede estar compartida. */}
      {conSurtido && empaque && (idsSurtido.length > 0 || disponiblesParaSurtido.length > 0) && (
        <div className="flex flex-col gap-1" data-surtido>
          <p className="text-[10px] uppercase tracking-widest text-dark-ink-3">Más productos de {arte.proveedor} en esta cara</p>
          <div className="flex flex-wrap gap-1">
            {idsSurtido.map((id) => {
              const a = catalogo.find((x) => x.id === id);
              return (
                <span key={id} data-surtido-elegido={id}
                  className="flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">
                  {a?.nombre ?? id}
                  <button title="Quitar del surtido" className="font-bold"
                    onClick={() => onAjustar({ surtido: idsSurtido.filter((x) => x !== id) })}>×</button>
                </span>
              );
            })}
            {idsSurtido.length + 1 < MAXIMO_DE_SURTIDO && disponiblesParaSurtido.map((a) => (
              <button key={a.id} data-surtido-agregar={a.id}
                className="rounded border border-dark-line-2 px-1.5 py-0.5 text-[10px] text-dark-ink-2 hover:text-dark-ink-1"
                onClick={() => onAjustar({ surtido: [...idsSurtido, a.id] })}>
                + {a.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Las rejillas de la nevera: se acomodan SOLAS si el producto parado
          no entra (parada se ve; acostada, en una nevera de gaseosas, casi
          no), y si el acomodo no queda bien hay salida a mano. Todo es de la
          sesión. */}
      {esNevera && empaque && !empaque.acostado && rejillas && venta && (
        <BloqueDeRejillas
          rejillas={rejillas}
          fabrica={venta.filas}
          vigentes={ventaUsada?.filas ?? venta.filas}
          alto={empaque.alto}
          porFila={capacidad?.porFila ?? []}
          onAjustar={onAjustar}
        />
      )}

      {!empaque ? (
        estadoFoto === "error" || estadoFoto === "reintentando" ? (
          <div className="flex flex-col gap-1" data-foto-fallo>
            <p className="text-[10.5px] leading-snug text-warning">
              No se pudo cargar la foto del producto: mientras tanto se ve la lámina de siempre.
            </p>
            <button
              disabled={estadoFoto === "reintentando"}
              onClick={() => reintentarEtiqueta(claveDeArte(arte.id, modo))}
              className="self-start rounded border border-dark-line-2 px-2 py-1 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1 disabled:opacity-60"
            >
              {estadoFoto === "reintentando" ? "Reintentando…" : "Reintentar"}
            </button>
          </div>
        ) : (
          <p className="text-[10.5px] text-dark-ink-3">Preparando el producto…</p>
        )
      ) : entran.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] leading-snug text-dark-ink-1" data-no-entra>
            {filas.every((f) => f.motivo === "no-entra-alto")
              ? `No entra ${empaque.acostado ? "acostada" : "parada"}: ${enCm(empaque.alto)} cm en ${enCm(maxLibre)} cm libres.`
              : filas.every((f) => f.motivo === "no-entra-alto" || f.motivo === "no-entra-fondo")
                // El fondo aparte del ancho: un envase hondo en el robatope
                // decía «no caben de ancho» y se buscaba el problema al revés.
                ? `No entra de fondo: ${enCm(empaque.fondo)} cm en ${enCm(Math.max(...filas.map((f) => f.fondo)))} cm de entrepaño.`
                : `No entra: ${enCm(empaque.ancho)} cm de ancho no caben en el entrepaño.`}
          </p>
          {empaque.envase === "revolucion" && !empaque.acostado && (
            <button
              // Acostada, las rejillas se ignoran (van las de fábrica): si
              // estaban acomodadas, los índices de «Por entrepaño» quedarían
              // apuntando a otra rejilla, así que vuelve a «Toda la cara».
              onClick={() => onAjustar(rejillas?.filas ? { acostado: true, donde: "todas" } : { acostado: true })}
              className="rounded border border-dark-line-2 px-2 py-1 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1"
            >
              Mostrarla acostada
            </button>
          )}
        </div>
      ) : conProducto.length === 0 ? (
        <p className="text-[10.5px] text-dark-ink-3">Elegí al menos un entrepaño donde entre.</p>
      ) : (
        <>
          {resumenDeSurtido ? (
            // Con surtido, la cuenta por producto: «Müsli 5 · Choco Krispis 5
            // · Zucaritas 5 por entrepaño · 75 de frente».
            <p className="text-[11px] leading-snug text-dark-ink-1" data-resumen-prueba data-resumen-surtido>
              {aprox}{resumenDeSurtido.texto}
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-dark-ink-1" data-resumen-prueba>
              {aprox}{textoDeLaCuenta}
              {acostadaActiva && acostadaSoloAhi
                ? ` · y ${Math.min(...acostadaSoloAhi.enCadaUna)}${Math.min(...acostadaSoloAhi.enCadaUna) === Math.max(...acostadaSoloAhi.enCadaUna) ? "" : ` a ${Math.max(...acostadaSoloAhi.enCadaUna)}`} de frente acostadas en ${acostadaSoloAhi.filas.length === 1 ? "la" : "las"} ${acostadaSoloAhi.nombres}`
                : ""}
            </p>
          )}
          {/* Los entrepaños donde no entra, con medidas: la de 1,5 L dejaba
              las dos rejillas del medio vacías sin que nadie dijera por qué. */}
          {como.donde === "todas" && filas.some((f) => f.motivo === "no-entra-alto") && (() => {
            const sin = filas.filter((f) => f.motivo === "no-entra-alto");
            const nombres = sin.map((f) => f.fila + 1).join(" y ");
            const libre = Math.max(...sin.map((f) => f.libre));
            const uno = sin.length === 1;
            return (
              <div className="flex flex-col gap-1">
                <p className="text-[10.5px] leading-snug text-dark-ink-3" data-filas-sin-producto>
                  {acostadaActiva
                    ? `En ${uno ? "el entrepaño" : "los entrepaños"} ${nombres} va acostada: ${enCm(empaque.alto)} cm no entran parados en ${enCm(libre)} cm.`
                    : `${uno ? "El entrepaño" : "Los entrepaños"} ${nombres} ${uno ? "queda vacío" : "quedan vacíos"}: ${enCm(empaque.alto)} cm no entran en ${enCm(libre)} cm.`}
                </p>
                {/* Un hueco en el medio de SU nevera, para el proveedor, es un
                    quiebre de inventario: se ofrece acostarla sólo ahí. */}
                {acostadaSoloAhi && (acostadaActiva ? (
                  <button data-dejar-vacio onClick={() => onAjustar({ acostarDondeNoEntra: false })}
                    className="self-start text-[10px] text-dark-ink-3 hover:text-dark-ink-1">
                    {uno ? "Dejarlo vacío" : "Dejarlos vacíos"}
                  </button>
                ) : (
                  <button data-acostar-solo onClick={() => onAjustar({ acostarDondeNoEntra: true })}
                    className="self-start rounded border border-dark-line-2 px-2 py-1 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1">
                    Acostarla sólo en {uno ? "la" : "las"} {nombres}
                  </button>
                ))}
              </div>
            );
          })()}
        </>
      )}
      {/* La foto de una caja en tres cuartos se ve en el 3D con «doble lomo»:
          el costado de la foto pegado al frente de cada caja. Se avisa acá
          también, que es donde se ve, y no sólo al cargarla. */}
      {empaque?.envase === "caja" && etiqueta && pareceEnPerspectiva(etiqueta.recorte) && (
        etiqueta.cajaEnderezada() ? (
          // Se enderezó sola (`rectificarCaja`): el 3D ya no muestra el
          // costado, pero la foto del frente siempre sale mejor.
          <p className="text-[10.5px] leading-snug text-dark-ink-3" data-aviso-perspectiva>
            La foto venía en tres cuartos: se enderezó el frente. Con la foto de frente sale más nítida.
          </p>
        ) : (
          <p className="text-[10.5px] leading-snug text-warning" data-aviso-perspectiva>
            La foto parece en perspectiva: subí la del frente.
          </p>
        )
      )}
      {empaque && (
        <p className="text-[10px] leading-snug text-dark-ink-3">
          {`${aprox}${enCm(empaque.alto)} × ${enCm(empaque.ancho)} cm`}
          {empaque.estimado ? ` · medidas estimadas por ${empaque.de === "contenido" ? "el contenido" : "el rubro"}` : ""}
          {empaque.anchoEstimado ? " · el ancho, estimado: la foto conserva su fondo (cargalo en Medidas)" : ""}
        </p>
      )}
      {(fix.type === "punta" || esNeveraDeBebidas(fix.type)) && empaque && (
        <label className="flex items-center gap-1.5 text-[10.5px] text-dark-ink-2" data-copete-prueba>
          <input
            type="checkbox"
            checked={como.copete !== false}
            disabled={como.donde !== "todas"}
            onChange={(e) => onAjustar({ copete: e.target.checked })}
          />
          Marca en el copete
          {como.donde !== "todas" && <span className="text-dark-ink-3">(sólo con toda la cara)</span>}
        </label>
      )}
      {empaque?.acostado && (
        <button
          // De vuelta parada y con las rejillas AUTOMÁTICAS: en la nevera las
          // filas cambian, y con ellas lo que señalan los entrepaños elegidos.
          onClick={() => onAjustar(esNevera
            ? { acostado: false, rejillas: undefined, donde: "todas" }
            : { acostado: false, rejillas: undefined })}
          className="self-start text-[10px] text-dark-ink-3 hover:text-dark-ink-1"
        >
          Volver a pararla
        </button>
      )}

      {isAdmin && !midiendo && (
        <button
          onClick={() => { setMidiendo(arte.ficha ?? FICHA_VACIA); setError(""); }}
          className="self-start text-[10px] font-semibold text-dark-ink-3 hover:text-dark-ink-1"
        >
          Medidas
        </button>
      )}
      {isAdmin && midiendo && (
        <div className="rounded border border-dark-line-2 p-2" data-medidas-panel>
          <EditorDeFicha
            imagen={arteUrl(arte.id)}
            ficha={midiendo}
            nombre={arte.nombre}
            categoria={arte.categoria}
            onCambio={setMidiendo}
            onValidez={setProblemasDeFicha}
          />
          {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setMidiendo(null)} className="text-[11px] text-dark-ink-3 hover:text-dark-ink-1">
              Cancelar
            </button>
            <button
              // Con un campo que no se entiende no se guarda (`onValidez`).
              disabled={guardando || problemasDeFicha.length > 0}
              onClick={async () => {
                if (problemasDeFicha.length > 0) return;
                setGuardando(true);
                setError("");
                try {
                  await guardarFicha(arte.id, midiendo);
                  setMidiendo(null);
                  onRecargarCatalogo();
                } catch (e) {
                  setError(describeError(e, "No se pudieron guardar las medidas."));
                } finally {
                  setGuardando(false);
                }
              }}
              className="rounded border border-dark-line-2 px-2 py-1 text-[11px] font-semibold text-dark-ink-1 hover:border-accent"
            >
              {guardando ? "Guardando…" : "Guardar medidas"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VistaProveedor({
  fix, enCaminata, catalogo, cargandoCatalogo, prueba, onProbar, onRecargarCatalogo,
  comoSePrueba, onAjustarPrueba, proveedorDeReunion, onProveedorDeReunion, onMostrar,
  eligiendo, setEligiendo, onCara,
}: {
  fix: PlacedFixture;
  enCaminata: boolean;
  catalogo: Arte[];
  cargandoCatalogo: boolean;
  /** `${fixtureId}|A` → id del arte que se está probando en esa cara. */
  prueba: Map<string, number>;
  onProbar: (fixtureId: string, cara: "A" | "B", arteId: number | null) => void;
  onRecargarCatalogo: () => void;
  comoSePrueba: Map<string, ComoSePrueba>;
  onAjustarPrueba: (fixtureId: string, cara: "A" | "B", cambios: Partial<ComoSePrueba>) => void;
  proveedorDeReunion: string | null;
  onProveedorDeReunion: (proveedor: string | null) => void;
  onMostrar: (fixtureId: string, cara: "A" | "B") => void;
  /** El selector de productos abierto. Lo guarda el panel de afuera: con el
   *  selector abierto, el bloque «Contratado» se vuelve discreto. */
  eligiendo: boolean;
  setEligiendo: (abierto: boolean) => void;
  /** La cara abierta en el panel: la lámina sale de ESA cara (con pruebas
   *  en las dos de una góndola doble salía siempre la A). */
  onCara?: (fixtureId: string, cara: "A" | "B") => void;
}) {
  const camara3D      = useFixtureStore((s) => s.camera3D);
  const guardarVista  = useFixtureStore((s) => s.guardarVista3D);
  const borrarVista   = useFixtureStore((s) => s.borrarVista3D);
  const pedirEnfoque  = useFixtureStore((s) => s.pedirEnfoque3D);
  const unificados    = useFixtureStore(selectFixtures);
  const isAdmin       = useAuthStore(selectIsAdmin);

  const uf     = unificados.find((f) => f.id === fix.id);
  const doble  = isDoubleGondola(fix);
  const [cara, setCara] = useState<"A" | "B">("A");
  const caraUsada = doble ? cara : "A";
  useEffect(() => { onCara?.(fix.id, caraUsada); }, [fix.id, caraUsada, onCara]);
  const guardada = uf?.vista3D?.[caraUsada];
  const probandoId = prueba.get(`${fix.id}|${caraUsada}`);
  const probando = probandoId != null ? catalogo.find(a => a.id === probandoId) : undefined;
  // Con una reunión fijada, la prueba de OTRO proveedor en esta cara no se
  // dibuja (`pruebasDeLaReunion`) y acá tampoco se nombra: la pantalla se
  // está compartiendo. Se dice que hay una, y se puede quitar.
  // Lo mismo con el selector abierto y SIN proveedor («Cambiar de
  // proveedor»): la escena no dibuja ninguna prueba (`pruebasDeLaReunion`), y
  // el panel detrás del velo seguía diciendo «Finesse yogurt fresa · Alpina»
  // con el proveedor siguiente ya mirando.
  // Y con la reunión abierta sin proveedor aunque el selector se cierre
  // (`REUNION_SIN_PROVEEDOR`): toda prueba es de otro hasta elegir producto.
  const deReunion = supplierPorNombre(proveedorDeReunion, catalogo);
  const ajena = !!probando && (deReunion != null
    ? probando.supplier_id !== deReunion
    : eligiendo || reunionFijada(proveedorDeReunion));

  if (!uf || !isRentable(fix)) return null;

  return (
    <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-3">
      <p className={ETIQUETA_CLS}><Eye size={9} className="inline mr-1"/>Vista para el proveedor</p>

      {doble && (
        <div className="mb-2 flex gap-1.5">
          {(["A", "B"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setCara(id)}
              className={`flex-1 rounded px-1 py-1 text-[10.5px] font-semibold transition-colors ${
                caraUsada === id ? "bg-accent text-accent-ink"
                                 : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
              }`}
            >
              Cara {id}{uf.vista3D?.[id] ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}

      {/* Qué producto se está probando. Va ARRIBA del encuadre: primero se
          pone el producto y después se busca el ángulo desde donde se lo
          muestra, no al revés. */}
      <div className="mb-2 border-b border-dark-line/50 pb-2">
        {ajena ? (
          <div className="flex items-start gap-2" data-prueba-ajena>
            <p className="flex-1 text-[10.5px] leading-snug text-dark-ink-3">
              En esta cara hay una prueba de otro proveedor: no se muestra mientras dura esta reunión, y en Presentar sale vacía.
            </p>
            <button
              onClick={() => onProbar(fix.id, caraUsada, null)}
              className="flex-shrink-0 text-[10px] font-semibold text-dark-ink-3 hover:text-dark-ink-1"
            >
              Quitarla
            </button>
          </div>
        ) : probando ? (
          <div className="flex items-center gap-2">
            <img
              src={arteUrl(probando.id)}
              alt=""
              className="h-9 w-9 flex-shrink-0 rounded bg-dark-surface-2 object-contain p-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-dark-ink-1" title={probando.nombre}>
                {probando.nombre}
              </p>
              <p className="truncate text-[10px] text-dark-ink-3">{probando.proveedor}</p>
            </div>
            <button
              onClick={() => onProbar(fix.id, caraUsada, null)}
              aria-label="Quitar el producto de prueba"
              className="flex-shrink-0 text-dark-ink-3 hover:text-dark-ink-1"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEligiendo(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-dark-line-2 px-2 py-2 text-[11px] font-semibold text-dark-ink-2 hover:border-accent hover:text-dark-ink-1"
          >
            <Package size={12} /> Probar un producto
          </button>
        )}
        {probando && !ajena && (
          <PanelDePrueba
            key={`${fix.id}|${caraUsada}|${probando.id}`}
            fix={fix}
            cara={caraUsada}
            arte={probando}
            como={comoSePrueba.get(`${fix.id}|${caraUsada}`) ?? { donde: "todas" }}
            onAjustar={(cambios) => onAjustarPrueba(fix.id, caraUsada, cambios)}
            isAdmin={isAdmin}
            onRecargarCatalogo={onRecargarCatalogo}
            catalogo={catalogo}
          />
        )}
        {probando && (
          <button
            onClick={() => setEligiendo(true)}
            className="mt-1.5 w-full text-[10px] text-dark-ink-3 hover:text-dark-ink-1"
          >
            {ajena ? "Probar un producto" : "Probar otro"}
          </button>
        )}
        {/* El botón de la reunión: la pantalla de venta, limpia, con la toma
            de frente de esta cara. */}
        {probando && !ajena && (
          <button
            onClick={() => onMostrar(fix.id, caraUsada)}
            // El botón principal del editor: el único amarillo de la
            // pantalla (`outputs/tema.md` §2).
            className="btn-principal mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[12px]"
            data-mostrar-al-proveedor
          >
            <Eye size={13} /> Mostrar al proveedor
          </button>
        )}
      </div>

      {eligiendo && (
        <SelectorDeProducto
          catalogo={catalogo}
          cargando={cargandoCatalogo}
          isAdmin={isAdmin}
          proveedor={proveedorDeReunion}
          onProveedor={onProveedorDeReunion}
          onElegir={(arteId) => { onProbar(fix.id, caraUsada, arteId); setEligiendo(false); }}
          onCerrar={() => setEligiendo(false)}
          onSubido={onRecargarCatalogo}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => pedirEnfoque(fix.id, caraUsada)}
          className="rounded border border-dark-line-2 bg-dark-surface-2 px-2 py-1.5 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1">
          Encuadrar esta cara
        </button>

        {enCaminata ? (
          <p className="text-[10px] leading-relaxed text-dark-ink-3">
            Salí de la caminata para guardar una vista: en primera persona la
            cámara no se guarda.
          </p>
        ) : (
          <button
            onClick={() => guardarVista(fix.id, caraUsada, { ...camara3D })}
            // Con un producto en prueba, el amarillo es «Mostrar al proveedor»:
            // un solo botón principal por pantalla (`outputs/tema.md` §2).
            className={probando
              ? "rounded border border-dark-line-2 bg-dark-surface-2 px-2 py-1.5 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1"
              : "rounded-md bg-accent px-2 py-1.5 text-[11px] font-semibold text-accent-ink hover:opacity-90"}>
            {guardada ? "Reemplazar por la vista actual" : "Guardar esta vista"}
          </button>
        )}

        {guardada && (
          <button
            onClick={() => borrarVista(fix.id, caraUsada)}
            className="rounded border border-dark-line-2 px-2 py-1 text-[10px] text-dark-ink-3 hover:text-dark-ink-1">
            Olvidar la vista guardada
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-dark-ink-3">
        {guardada
          ? "Esta cara abre siempre en el ángulo guardado."
          : "Sin vista guardada abre de frente a la exhibición, calculado."}
      </p>
    </div>
  );
}

// ─── MEJORA 6: Transform Controls (Gizmo) ────────────────────────────────────

function FixtureTransformControls({
  fixture, orbitRef, onMove, limites
}: {
  fixture: PlacedFixture;
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  onMove: (id: string, x: number, z: number) => void;
  limites: LimitesPlanta;
}) {
  const { camera, gl, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const ctrlRef  = useRef<TransformControls|null>(null);

  // `useLayoutEffect` y no `useEffect`: el desarme tiene que pasar en el mismo
  // commit que saca el grupo de la escena. Con un efecto pasivo, «Mostrar al
  // proveedor» (que esconde el gizmo sin soltar la selección) dejaba un cuadro
  // con el ayudante dibujándose sobre un objeto ya fuera de la escena, y three
  // lo grita por consola.
  React.useLayoutEffect(() => {
    if (!groupRef.current) return;
    const ctrl = new TransformControls(camera, gl.domElement);
    ctrl.setMode('translate');
    ctrl.setSpace('world');
    ctrl.showY = false;
    ctrl.attach(groupRef.current);
    // TransformControls dejó de ser un Object3D: en three 0.184 extiende
    // Controls, y lo que va a la escena es su ayudante. El `as unknown as`
    // que había acá silenciaba el error de tipos pero no el de runtime — la
    // escena rechazaba el objeto y **el gizmo nunca se dibujó**. Sólo se veía
    // al seleccionar un mueble, que hasta ahora era raro.
    const ayudante = ctrl.getHelper();
    ayudante.userData.chrome = true;   // fuera de las capturas
    scene.add(ayudante);
    ctrlRef.current = ctrl;

    const onDragging = (e: THREE.Event) => {
      if (orbitRef.current) orbitRef.current.enabled = !(e as any).value;
    };
    const onObjectChange = () => {
      if (!groupRef.current) return;
      const p = groupRef.current.position;
      onMove(fixture.id, snap(p.x), snap(p.z));
      // Contra STORE_W/STORE_D esto encerraba el gizmo en x ≥ 0, y la mitad
      // izquierda de una sede real quedaba fuera de alcance al arrastrar.
      p.x = Math.max(limites.minX, Math.min(limites.maxX, p.x));
      p.z = Math.max(limites.minZ, Math.min(limites.maxZ, p.z));
      p.y = 0;
    };

    ctrl.addEventListener('dragging-changed', onDragging);
    ctrl.addEventListener('objectChange', onObjectChange);

    return () => {
      ctrl.removeEventListener('dragging-changed', onDragging);
      ctrl.removeEventListener('objectChange', onObjectChange);
      ctrl.detach();
      scene.remove(ayudante);
      ctrl.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture.id, camera, gl, scene]);

  return (
    <group ref={groupRef} position={[fixture.x, 0, fixture.z]} />
  );
}

// ─── Snap crosshair ───────────────────────────────────────────────────────────

/**
 * Small amber crosshair drawn exactly at the snap-target position.
 * Gives a clear visual "magnetic" feel — the object will land here.
 */
function SnapCrosshair({ x, z }: { x: number; z: number }) {
  const SIZE = 1.2;
  const pts1 = useMemo(() => [new THREE.Vector3(x-SIZE, 0.07, z), new THREE.Vector3(x+SIZE, 0.07, z)], [x, z]);
  const pts2 = useMemo(() => [new THREE.Vector3(x, 0.07, z-SIZE), new THREE.Vector3(x, 0.07, z+SIZE)], [x, z]);
  const geo1 = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts1), [pts1]);
  const geo2 = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts2), [pts2]);
  const mat  = useMemo(() => new THREE.LineBasicMaterial({ color: '#f59e0b', depthTest: false }), []);
  // B4: dispose geometries and material when they change or component unmounts
  useEffect(() => () => { geo1.dispose(); geo2.dispose(); }, [geo1, geo2]);
  useEffect(() => () => { mat.dispose(); }, [mat]);
  return (
    <>
      <primitive object={new THREE.Line(geo1, mat)} />
      <primitive object={new THREE.Line(geo2, mat)} />
    </>
  );
}

// ─── MEJORA 7: Alignment guides ──────────────────────────────────────────────

function AlignmentGuides({
  ghostX, ghostZ,
  fixtures, active
}: {
  ghostX: number; ghostZ: number; ghostW?: number; ghostD?: number;
  fixtures: PlacedFixture[]; active: boolean;
}) {
  const lines = useMemo(() => {
    if (!active || !fixtures.length) return [];
    const result: { points: [THREE.Vector3, THREE.Vector3]; color: string }[] = [];
    const TOL = 0.35;

    fixtures.forEach(f => {
      if (Math.abs(ghostX - f.x) < TOL) {
        result.push({
          points: [
            new THREE.Vector3(f.x, 0.05, Math.min(ghostZ, f.z) - 2),
            new THREE.Vector3(f.x, 0.05, Math.max(ghostZ, f.z) + 2),
          ],
          color: '#38bdf8',
        });
      }
      if (Math.abs(ghostZ - f.z) < TOL) {
        result.push({
          points: [
            new THREE.Vector3(Math.min(ghostX, f.x) - 2, 0.05, f.z),
            new THREE.Vector3(Math.max(ghostX, f.x) + 2, 0.05, f.z),
          ],
          color: '#38bdf8',
        });
      }
    });
    return result;
  }, [ghostX, ghostZ, fixtures, active]);

  // B4: pre-build Line objects in useMemo so they aren't recreated every render,
  // then dispose them when lines change or the component unmounts.
  const lineObjects = useMemo(
    () => lines.map(l => {
      const geo = new THREE.BufferGeometry().setFromPoints(l.points);
      const mat = new THREE.LineBasicMaterial({ color: l.color, depthTest: false });
      return new THREE.Line(geo, mat);
    }),
    [lines]
  );
  useEffect(() => {
    return () => {
      lineObjects.forEach(o => {
        (o.geometry as THREE.BufferGeometry).dispose();
        (o.material as THREE.LineBasicMaterial).dispose();
      });
    };
  }, [lineObjects]);

  if (!lineObjects.length) return null;

  return (
    <>
      {lineObjects.map((line, i) => <primitive key={i} object={line} />)}
    </>
  );
}

// ─── MEJORA 8: First-person controls ─────────────────────────────────────────
// La caminata se apoya en tres cosas que antes no existían: los límites salen
// de la planta real (no de STORE_W/STORE_D), los muebles frenan, y el paso se
// mide en metros por segundo en vez de metros por frame.

function FirstPersonControls({
  orbitRef, active, fixtures, limites, onCamara, saltarA
}: {
  orbitRef: React.MutableRefObject<ThreeOrbitControls|null>;
  active:   boolean;
  fixtures: PlacedFixture[];
  limites:  LimitesPlanta;
  /** Avisa dónde está y hacia dónde mira, para el minimapa. */
  onCamara: (c: CamaraEnPlanta | null) => void;
  /** Pedido de teletransporte. `n` cambia en cada clic para que tocar dos
   *  veces el mismo punto del plano vuelva a saltar. */
  saltarA:  { x: number; z: number; n: number } | null;
}) {
  const { camera, gl, invalidate } = useThree();
  const ctrlRef = useRef<PointerLockControls|null>(null);
  const keys    = useRef<Record<string, boolean>>({});
  const CAM_Y   = 1.65;

  const muros   = useMemo(() => murosDeCaminata(fixtures), [fixtures]);
  const entrada = useMemo(() => puntoDeEntrada(limites, muros), [limites, muros]);

  /** Último estado informado al minimapa, para no re-renderizar en cada cuadro. */
  const ultimo = useRef<CamaraEnPlanta | null>(null);
  const avisar = useCallback(() => {
    const d = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position;
    const previo = ultimo.current;
    // Un umbral por posición y otro por giro: caminar redibuja el minimapa unas
    // pocas veces por metro en vez de 60 veces por segundo.
    if (previo) {
      const movio = Math.hypot(p.x - previo.x, p.z - previo.z) > 0.12;
      const giro  = Math.hypot(d.x - previo.dirX, d.z - previo.dirZ) > 0.04;
      if (!movio && !giro) return;
    }
    const c = { x: p.x, z: p.z, dirX: d.x, dirZ: d.z };
    ultimo.current = c;
    onCamara(c);
  }, [camera, onCamara]);

  useEffect(() => {
    if (!active) return;

    camera.position.set(entrada.x, CAM_Y, entrada.z);
    // Mirar a lo largo del lado más largo del local, no contra una pared.
    if (limites.w >= limites.d) camera.lookAt(limites.maxX, CAM_Y, entrada.z);
    else                        camera.lookAt(entrada.x, CAM_Y, limites.maxZ);

    const ctrl = new PointerLockControls(camera, gl.domElement);
    ctrlRef.current = ctrl;

    // Con frameloop="demand" el lienzo sólo dibuja cuando se lo pide alguien.
    // PointerLockControls mueve la cámara en el mousemove, fuera del bucle de
    // cuadros: sin esto, parado y mirando alrededor la imagen quedaba
    // congelada hasta que uno tocaba una tecla de movimiento.
    const alMirar = () => { invalidate(); avisar(); };
    ctrl.addEventListener('change', alMirar);

    if (orbitRef.current) orbitRef.current.enabled = false;
    avisar();

    const lockOnClick = () => ctrl.lock();
    gl.domElement.addEventListener('click', lockOnClick);

    const onKey = (e: KeyboardEvent) => {
      keys.current[e.code] = e.type === 'keydown';
      // Kickstart the render loop when a movement key is pressed in first-person mode.
      if (e.type === 'keydown' && ctrl.isLocked) invalidate();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup',   onKey);

    return () => {
      ctrl.removeEventListener('change', alMirar);
      ctrl.unlock();
      ctrl.dispose();
      ctrlRef.current = null;
      keys.current = {};
      ultimo.current = null;
      onCamara(null);
      gl.domElement.removeEventListener('click', lockOnClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup',   onKey);
      // Volver a una vista general de ESTA planta. CAM_POS apunta al centro de
      // la tienda ficticia; en una sede real dejaba la cámara mirando al vacío.
      const { pos, mirada } = vistaGeneral(limites);
      camera.position.set(pos.x, pos.y, pos.z);
      const orbit = orbitRef.current;
      if (orbit) {
        orbit.enabled = true;
        // Apuntar al centro real del local. Una cámara guardada de antes trae
        // el centro de la tienda ficticia y deja la sede corrida a un lado.
        orbit.target.set(mirada.x, mirada.y, mirada.z);
        // Sin update() la cámara conserva la rotación de la caminata y sigue
        // mirando la góndola que uno tenía enfrente; sin invalidate() el cuadro
        // nuevo nunca se dibuja, porque el lienzo sólo renderiza bajo demanda.
        orbit.update();
      }
      invalidate();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera, gl, invalidate, entrada, limites, avisar, onCamara]);

  // Teletransporte: aterriza en el lugar despejado más cercano a lo que se
  // tocó en el plano. Quien apunta al medio de una góndola quiere el pasillo
  // de al lado, no que no pase nada. La mirada no se toca: uno salta, no gira.
  const saltoAtendido = useRef<number>(-1);
  useEffect(() => {
    if (!active || !saltarA || saltoAtendido.current === saltarA.n) return;
    saltoAtendido.current = saltarA.n;
    const destino = puntoLibreCerca(limites, muros, saltarA.x, saltarA.z);
    camera.position.set(destino.x, CAM_Y, destino.z);
    avisar();
    invalidate();
  }, [active, saltarA, limites, muros, camera, avisar, invalidate]);

  useFrame((_, delta) => {
    if (!active || !ctrlRef.current?.isLocked) return;
    const k = keys.current;
    const adelante = k['KeyW'] || k['ArrowUp'];
    const atras    = k['KeyS'] || k['ArrowDown'];
    const izq      = k['KeyA'] || k['ArrowLeft'];
    const der      = k['KeyD'] || k['ArrowRight'];
    if (!adelante && !atras && !izq && !der) return;

    // delta acotado: si la pestaña estuvo en segundo plano, un salto de varios
    // segundos atravesaría media tienda de un tirón.
    const vel  = (k['ShiftLeft'] || k['ShiftRight']) ? VEL_APURADA : VEL_CAMINANDO;
    const paso = vel * Math.min(delta, 0.1);

    const antesX = camera.position.x;
    const antesZ = camera.position.z;

    if (adelante) ctrlRef.current.moveForward(paso);
    if (atras)    ctrlRef.current.moveForward(-paso);
    if (izq)      ctrlRef.current.moveRight(-paso);
    if (der)      ctrlRef.current.moveRight(paso);

    const { x, z } = resolverPaso(
      { x: antesX, z: antesZ },
      { x: camera.position.x, z: camera.position.z },
      limites, muros,
    );

    camera.position.set(x, CAM_Y, z);
    avisar();
    invalidate(); // sustain the loop while keys are held
  });

  return null;
}

// ─── Face imagery sources (photos + category patterns) ───────────────────────
// Replaces BOTH earlier attempts (InstancedMesh products, CategoryStrips
// planes): any NEW positioned geometry had to replicate the fixture placement
// math and kept floating detached. Now the imagery is painted directly onto an
// EXISTING box of each fixture through a per-face material array (see
// facePaintArray above), so it inherits the fixture group's full transform and
// cannot misalign. Texture priority per face:
//   1. supplier photo   — GET /api/spaces/face-images, loaded via fileUrl()
//   2. category pattern — square canvas texture, "stocked shelves" look
//   3. none             — plain color material, exactly as today

// `TIPOS_CON_PRODUCTO`, `TIPOS_CON_PRUEBA_3D` y `TIPOS_CON_SURTIDO` —qué muebles
// llevan producto, cuáles lo paran como envases 3D y dónde se ofrece el
// surtido— viven en `catalogo/editor3D.ts` (ver arriba).

/** El renglón «Producto» de la lámina: el principal y, con surtido, los
 *  demás del mismo proveedor que se ven, unidos por « · » (`surtidoALaVista`
 *  con la misma pantalla que las tomas). */
export function nombresDeLaPrueba(
  arte: Arte, surtido: number[] | undefined, para: PrivadoPara, catalogo: readonly Arte[],
): string {
  const otros = surtidoALaVista(arte.id, surtido, catalogo, para)
    .map((id) => catalogo.find((a) => a.id === id)?.nombre ?? "")
    .filter(Boolean);
  return [arte.nombre, ...otros].join(" · ");
}

/** Lowercase + strip accents so "Lácteos" matches "lacteo". */
function normalizeText(s: string): string {
  // NFD splits accented letters into base char + combining mark (U+0300..U+036F);
  // drop the marks so "lácteo" -> "lacteo".
  let out = "";
  for (const ch of s.toLowerCase().normalize("NFD")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out;
}

type CategoryKey =
  | "snacks" | "bebidas" | "lacteos" | "enlatados"
  | "abarrotes" | "aseo" | "fruver" | "generico";

const CATEGORY_KEYWORDS: [CategoryKey, string[]][] = [
  ["snacks",    ["papas", "snack", "chips", "frito"]],
  ["bebidas",   ["bebida", "gaseosa", "refresco", "agua", "jugo", "cerveza"]],
  ["lacteos",   ["leche", "lacteo", "yogur", "queso", "huevo"]],
  ["enlatados", ["enlatado", "conserva", "atun", "lata"]],
  ["abarrotes", ["galleta", "cereal", "pasta", "harina", "arroz", "grano"]],
  ["aseo",      ["detergente", "aseo", "jabon", "limpia", "suavizante", "cloro"]],
  ["fruver",    ["fruta", "verdura", "fruver"]],
];

/** Keyword match on the category (fallback: fixture label). Default: "generico". */
function categoryKeyFor(category: string, label: string): CategoryKey {
  const text = normalizeText(category || label);
  for (const [key, kws] of CATEGORY_KEYWORDS) {
    if (kws.some(k => text.includes(k))) return key;
  }
  return "generico";
}

// Per-category look: large emoji + subdued (saturated but not neon) palette.
const CATEGORY_STYLE: Record<CategoryKey, { emoji: string; palette: string[] }> = {
  snacks:    { emoji: "🍟", palette: ["#c2703d", "#b3543a", "#c9932f", "#a34b2e"] },
  bebidas:   { emoji: "🥤", palette: ["#b13a3a", "#2f6f4f", "#3a5fa8", "#c07a2c"] },
  lacteos:   { emoji: "🥛", palette: ["#7fa3c4", "#a4b8cc", "#8caf9f", "#b9c4d6"] },
  enlatados: { emoji: "🥫", palette: ["#a84a3b", "#8a8f96", "#b98a3a", "#6f7d6a"] },
  abarrotes: { emoji: "🍪", palette: ["#a5793c", "#8a5f3c", "#b3924f", "#7d6748"] },
  aseo:      { emoji: "🧴", palette: ["#4f8fae", "#6aa8a0", "#7f6fae", "#5b9c7a"] },
  fruver:    { emoji: "🍎", palette: ["#5f8f3f", "#b0522f", "#c9932f", "#4f7d4a"] },
  generico:  { emoji: "📦", palette: ["#9a8f80", "#8a7f70", "#a89c88", "#7f7568"] },
};

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// Deterministic per-tile height factors → slightly irregular "product skyline".
const TILE_HEIGHT_VAR = [0.86, 0.97, 0.90, 1.00, 0.84, 0.94, 0.88, 0.99];

/** Square "stocked shelves" face texture per category — session-level cache. */
const faceTextureCache = new Map<CategoryKey, THREE.CanvasTexture>();

function getCategoryFaceTexture(key: CategoryKey): THREE.CanvasTexture {
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const S = 512, ROWS = 4, COLS = 4;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // Opaque neutral background — the texture replaces the panel color entirely.
  ctx.fillStyle = "#e3e0da";
  ctx.fillRect(0, 0, S, S);

  const { emoji, palette } = CATEGORY_STYLE[key];
  const rowH  = S / ROWS;
  const tileW = S / COLS;

  for (let r = 0; r < ROWS; r++) {
    const baseline = (r + 1) * rowH - 10;

    // Shelf board under each row of packages
    ctx.fillStyle = "#b7b3ab";
    ctx.fillRect(0, baseline, S, 7);

    for (let c = 0; c < COLS; c++) {
      const idx   = r * COLS + c;
      const tileH = (rowH - 26) * TILE_HEIGHT_VAR[idx % TILE_HEIGHT_VAR.length];
      const x     = c * tileW + 8;
      const bw    = tileW - 16;
      const y     = baseline - tileH;

      // Package silhouette (rounded rect)
      ctx.fillStyle = palette[idx % palette.length];
      traceRoundedRect(ctx, x, y, bw, tileH, 10);
      ctx.fill();

      // Subtle top highlight → reads as a lid / label band
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      traceRoundedRect(ctx, x + 5, y + 5, bw - 10, Math.max(8, tileH * 0.16), 6);
      ctx.fill();

      // Large centered emoji
      ctx.font = `${Math.round(tileH * 0.50)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, x + bw / 2, y + tileH * 0.55);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  faceTextureCache.set(key, tex);
  return tex;
}

/**
 * Category material per (category × face-aspect bucket). repeat.x tracks the
 * face's w/h so package tiles keep a roughly square world shape instead of
 * stretching with the panel. Aspect is bucketed (0.25 steps) to bound cache size.
 *
 * NOTE: unlike photo faces (getPhotoFaceMaterial), category patterns are NOT
 * board-aligned — they tile a pre-drawn decorative square canvas whose row
 * artwork (packages + painted board) is baked in. Aligning them would mean
 * regenerating that canvas per fixture span, a separate generator change; the
 * abstract pattern reads fine slightly offset, so it keeps whole-face tiling.
 */
const categoryFaceMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function getCategoryFaceMaterial(key: CategoryKey, faceAspect: number): THREE.MeshBasicMaterial {
  const bucket = Math.max(0.25, Math.round(faceAspect * 4) / 4);
  const cacheKey = `${key}|${bucket}`;
  let mat = categoryFaceMaterialCache.get(cacheKey);
  if (!mat) {
    const tex = getCategoryFaceTexture(key).clone();
    tex.repeat.x = bucket;
    tex.offset.x = bucket < 1 ? (1 - bucket) / 2 : 0;
    tex.needsUpdate = true;
    mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    categoryFaceMaterialCache.set(cacheKey, mat);
  }
  return mat;
}

// ─── Supplier photo textures (lazy, deduped, async) ──────────────────────────

interface PhotoTexEntry {
  status:   "loading" | "ok" | "error";
  texture?: THREE.Texture;
  aspect:   number;
  waiters:  Set<() => void>;
}

/** De dónde sale una textura de producto.
 *
 *  Hay dos orígenes y el compositor no distingue entre ellos: el archivo del
 *  espacio (`archivo:<id>`, el camino viejo) y el catálogo del proveedor
 *  (`catalogo:<id>`, el que se usa para vender). La clave NO puede llevar `|`
 *  porque la evicción borra los materiales derivados por prefijo. */
interface FuenteTextura {
  clave: string;
  url:   string;
}

/** Base photo texture per source — loaded at most once per session. */
const photoTexCache = new Map<string, PhotoTexEntry>();
/** Cover-fitted photo material per (source × face-aspect bucket). */
const photoMatCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * Cap the photo caches: long sessions browsing many supplier photos would
 * otherwise accumulate GPU textures without bound (nothing ever disposed).
 * Insertion-order eviction — Map preserves it, so the first key is the oldest.
 */
const MAX_PHOTO_TEX = 64;

function evictOldestPhotoIfFull(): void {
  if (photoTexCache.size < MAX_PHOTO_TEX) return;
  const oldestId = photoTexCache.keys().next().value;
  if (oldestId === undefined) return;
  photoTexCache.get(oldestId)?.texture?.dispose();
  photoTexCache.delete(oldestId);
  // Drop every derived material for that source — photoMatCache keys are
  // `${clave}|${type}|<span>`, so match on the clave prefix.
  const prefix = `${oldestId}|`;
  for (const [key, mat] of photoMatCache) {
    if (key.startsWith(prefix)) {
      mat.map?.dispose(); // cloned texture owned by this material
      mat.dispose();
      photoMatCache.delete(key);
    }
  }
}

// ─── Painted-panel shelf spans (per fixture type) ────────────────────────────
// The planogram texture rows must land EXACTLY on the shelf boards each mesh
// component draws, or products cross the boards mid-body and the stocked-shelf
// illusion dies. These formulas mirror the board math inside each mesh — every
// mirrored mesh carries a matching "keep in sync" reminder next to its layout.
//
// All values are in the painted panel's LOCAL space (metres, 0 = panel bottom):
//   panelW/panelH — size of the box face that receives the material (NOT
//                   always the full fixture w×h — punta/robatope/mueble/nevera
//                   paint a sub-panel)
//   rowBottom     — top surface of the lowest shelf board (first row's floor)
//   rowPitch      — uniform board spacing = row cell height
//   rows          — number of product rows (board gaps that display product)
// Bands outside [rowBottom, rowBottom + rows·rowPitch] (plinth, header) stay
// transparent so the plain panel color shows through — no floating products.

/**
 * Cómo lleva producto un mueble. No todos llevan estantes, y ésa es la razón
 * por la que la mitad del catálogo no se podía vestir: el compositor sólo sabía
 * apilar filas sobre entrepaños, así que una batea —que no tiene ninguna cara
 * vertical que pintar— nunca pudo entrar.
 *
 * · `estante` — filas de facings sobre entrepaños. Góndola, punta, vitrina.
 * · `volcado` — producto a granel visto DESDE ARRIBA. Batea, isla de piso,
 *               isla fría, mostrador de carnes, cajón de frutas.
 * · `tira`    — una columna de unidades colgadas. Ristra.
 */
type ModoProducto = "estante" | "volcado" | "tira";

interface PanelShelfSpan {
  /** Ausente = "estante", que es como se comportaba todo hasta ahora. */
  modo?:     ModoProducto;
  panelW:    number;
  /** Alto de la cara pintada, o FONDO de la superficie en un volcado. */
  panelH:    number;
  rowBottom: number;
  rowPitch:  number;
  rows:      number;
}

/** Ancho de una unidad de producto vista desde arriba, en metros. Un frente de
 *  paquete típico; a granel se ven de ese tamaño y con eso la batea se lee
 *  llena en vez de con cuatro paquetes gigantes. */
const ANCHO_UNIDAD = 0.13;

function getPanelShelfSpan(type: string, w: number, h: number, d: number, geometria?: GeometriaDeMueble): PanelShelfSpan {
  switch (type) {
    case "gondola":
    case "gondola_doble": {
      // Acá había una COPIA de la cuenta de entrepaños de `GondolaMesh`, con
      // un comentario pidiendo mantener las dos iguales. No se mantuvieron: la
      // primera vez que se tocó el mueble, el producto quedó pintado a caballo
      // entre dos entrepaños. Ahora las dos preguntan a `filasDeProducto`, que
      // es la misma función que ubica los entrepaños de verdad, así que no
      // pueden desincronizarse.
      // El reparto de filas depende sólo del alto; el fondo entra únicamente
      // en el escalonado, que acá no se usa. Por eso da igual si es mural o
      // doble: las filas caen a la misma altura en las dos.
      // Con los entrepaños de su ficha, si los guardó: los mismos que dibuja
      // `GondolaReal`, o el arte queda a caballo entre dos.
      const { rowBottom, rowPitch, rows } = filasDeProducto(h, fondoPorCara(d, false), geometria?.entrepanos);
      return { panelW: w, panelH: h, rowBottom, rowPitch, rows };
    }
    case "punta": {
      // Acá había una COPIA de la cuenta de entrepaños de `PuntaMesh`, igual
      // que la tenía la góndola, con el mismo comentario pidiendo mantener las
      // dos iguales. Ahora las dos preguntan a `filasDePunta`, que es la misma
      // función que ubica los entrepaños que se dibujan.
      //
      // Una punta tiene tantas filas como entrepaños —y no una menos, como la
      // góndola— porque el techo de la fila de arriba es el COPETE: sobre el
      // entrepaño más alto de una punta también se vende.
      // Con los entrepaños que guardó la punta, los mismos que dibuja
      // `PuntaReal`: si no, el arte queda a caballo entre dos.
      const altoDeCuerpo = techoDeCara(h);
      const { rowBottom, rowPitch, rows } = filasDePunta(
        altoDeCuerpo, Math.max(0.12, d - PANEL_FONDO.espesor), geometria?.entrepanos,
      );
      return { panelW: w, panelH: altoDeCuerpo, rowBottom, rowPitch, rows };
    }
    case "robatope": {
      // La misma cuenta que dibuja las repisas (`cotasDeRobatope`): el panel
      // es [w, cuerpo] y cada fila arranca en la cara de arriba de su tabla.
      const c = cotasDeRobatope(w, d, h);
      return { panelW: w, panelH: c.cuerpo, rowBottom: c.apoyos[0], rowPitch: c.paso, rows: c.n };
    }
    case "mueble": {
      // MuebleMesh — painted panel: inner back [w-0.036, doorH-0.036] whose
      // bottom sits at world baseH+0.018 (panel centred at baseH+doorH/2);
      // baseH = min(0.22h, 0.40), doorH = h - baseH. Shelves:
      // n = max(2, round(doorH/0.38)) at baseH + 0.10 + i·(doorH-0.12)/(n-1),
      // thickness 0.014; the top shelf is the cabinet ceiling (h-0.02) →
      // rows = n-1 gaps. rowBottom = (baseH+0.10) - (baseH+0.018) + 0.007.
      const baseH = Math.min(h * 0.22, 0.40);
      const doorH = h - baseH;
      const n     = Math.max(2, Math.round(doorH / 0.38));
      const pitch = (doorH - 0.12) / Math.max(n - 1, 1);
      return { panelW: w - 0.036, panelH: doorH - 0.036, rowBottom: 0.10 - 0.018 + 0.007, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "nevera_refrescos":
    case "nevera_puertas": {
      // Otra copia de la misma cuenta, como tenían la góndola y la punta.
      // Ahora la pide. Las alturas de `filasDeNevera` son absolutas —desde el
      // piso— y el panel pintado empieza arriba del zócalo, así que se
      // restan: el pintado se mide contra SU panel, no contra el mueble.
      const util = altoUtilDeNevera(h);
      const filas = filasDeNevera(h, Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta));
      return {
        panelW: w - NEVERA.chapa * 2 - 0.02,
        panelH: util,
        rowBottom: filas.rowBottom - NEVERA.zocalo,
        rowPitch: filas.rowPitch,
        rows: filas.rows,
      };
    }
    case "ristra": {
      // RistraMesh — tira colgante: una columna de unidades, no filas.
      return { modo: "tira", panelW: w * 0.55, panelH: h - 0.12, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "cross": {
      // CrossMesh — estantes en `py = 0.10 + i·((h-0.12)/(n-1))`, tabla de
      // 0.026, n = max(4, round(h/0.36)). Mantener en sync con la malla.
      const n     = Math.max(4, Math.round(h / 0.36));
      const pitch = (h - 0.12) / Math.max(n - 1, 1);
      return { panelW: w - 0.07, panelH: h, rowBottom: 0.10 + 0.013, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "puesto_impulso": {
      // PuestoImpulsoReal — el arte va impreso en el frente del mostrador, en
      // una sola fila: es un cartel, no un estante.
      const c = cotasDePuestoDeImpulso(w, d, h);
      return { panelW: c.frente.ancho, panelH: c.frente.alto, rowBottom: 0, rowPitch: c.frente.alto, rows: 1 };
    }
    case "impulsador": {
      // ImpulsadorMesh — panel [w, h - topperH]; estantes en
      // `baseH + i·shelfGap`, tabla de 0.018. Mantener en sync con la malla.
      const topperH = 0.24, baseH = 0.10;
      const bodyH   = h - topperH - baseH;
      const n       = Math.max(3, Math.round(bodyH / 0.30));
      const pitch   = bodyH / Math.max(n - 1, 1);
      return { panelW: w, panelH: h - topperH, rowBottom: baseH + 0.009, rowPitch: pitch, rows: Math.max(1, n - 1) };
    }
    case "stand_frutas": {
      // StandFrutasMesh — el cajón poco profundo de arriba del mesón; el
      // producto se ve desde arriba, apoyado en su piso.
      return { modo: "volcado", panelW: w - 0.07, panelH: d - 0.07, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "nevera_carnes": {
      // NeveraCarnesMesh — mostrador con bandeja fría bajo el vidrio curvo.
      return { modo: "volcado", panelW: w - 0.10, panelH: d - 0.08, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "isla_fria": {
      // IslaFriaMesh — pozo abierto de verdad: el producto se apoya en su piso,
      // entre paredes de 0.055 y con 1 cm de aire por lado.
      return { modo: "volcado", panelW: w - 0.13, panelH: d - 0.13, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "isla": {
      // IslaMesh — la estiba. Cada CAPA de la torre de mercancía es una fila:
      // la cuenta sale de `cotasDeEstiba`, la misma que apila el producto, así
      // que el arte no puede quedar a caballo entre dos capas.
      const c = cotasDeEstiba(w, d, h);
      return {
        panelW: c.ancho,
        panelH: c.techo,
        rowBottom: c.capas[0],
        rowPitch: c.paso,
        rows: c.capas.length,
      };
    }
    case "batea": {
      // BateaMesh — canasto. Una sola superficie: el fondo falso, cerca del borde.
      return { modo: "volcado", panelW: w - 0.06, panelH: d - 0.06, rowBottom: 0, rowPitch: 0, rows: 0 };
    }
    case "nevera_vegetales": {
      // El mural se pinta VOLCADO, como la batea y el exhibidor de piso: lo
      // que se compone es la superficie horizontal de una bandeja vista desde
      // arriba, no una cara vertical. Sin este caso caía en la grilla legado y
      // el arte salía estirado sobre todo el frente del mueble.
      const b = bandejasDeMural(w, d, h)[0];
      return {
        modo: "volcado",
        panelW: b?.ancho ?? w, panelH: b?.fondo ?? d,
        rowBottom: 0, rowPitch: 0, rows: 0,
      };
    }
    default: {
      // Unknown paintable type — legacy whole-face grid (pre-alignment rules).
      const rows = Math.min(5, Math.max(1, Math.floor(h / 0.45)));
      return { panelW: w, panelH: h, rowBottom: 0, rowPitch: h / Math.max(rows, 1), rows };
    }
  }
}

/**
 * Returns the photo material as a PLANOGRAM GRID aligned to the REAL shelf
 * boards of the fixture type (getPanelShelfSpan): one row per board gap, each
 * product image bottom-anchored so it "stands" on its board. The grid is
 * composited onto a canvas so the plinth/header bands outside the shelf region
 * stay fully transparent (plain wrap modes cannot mask sub-ranges of V).
 * Columns keep the product's real aspect; the last one may be cut at the
 * fixture edge, like a real shelf.
 * Null while the texture is still loading / after a load error (callers fall
 * through to the category pattern). `notify` fires once when the load settles.
 */
function getPhotoFaceMaterial(
  fuente: FuenteTextura,
  fixType: string,
  faceW: number,
  faceH: number,
  faceD: number,
  notify: () => void,
  geometria?: GeometriaDeMueble,
): THREE.MeshBasicMaterial | null {
  let entry = photoTexCache.get(fuente.clave);
  if (!entry) {
    evictOldestPhotoIfFull();
    const fresh: PhotoTexEntry = { status: "loading", aspect: 1, waiters: new Set() };
    photoTexCache.set(fuente.clave, fresh);
    entry = fresh;
    // Same-origin URL; the JWT rides in the ?token= query.
    new THREE.TextureLoader().load(
      fuente.url,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.center.set(0.5, 0.5);
        const img = tex.image as { width?: number; height?: number } | undefined;
        fresh.aspect  = img?.width && img?.height ? img.width / img.height : 1;
        fresh.texture = tex;
        fresh.status  = "ok";
        fresh.waiters.forEach(w => w());
        fresh.waiters.clear();
      },
      undefined,
      () => {
        fresh.status = "error";
        fresh.waiters.forEach(w => w());
        fresh.waiters.clear();
      },
    );
  }
  if (entry.status === "loading") { entry.waiters.add(notify); return null; }
  if (entry.status === "error" || !entry.texture) return null;
  const image = entry.texture.image as CanvasImageSource | undefined;
  if (!image) return null;

  // Board-aligned span for THIS fixture type, quantised to 5 mm buckets so
  // near-identical fixtures share a canvas (bounds the cache like the old
  // repeatX bucketing did). Boards are 10-22 mm thick and occlude the row
  // boundary, so 5 mm of quantisation error is invisible.
  const q   = (v: number) => Math.round(v / 0.005) * 0.005;
  const raw = getPanelShelfSpan(fixType, faceW, faceH, faceD, geometria);
  const span: PanelShelfSpan = {
    modo:      raw.modo,
    panelW:    Math.max(0.05, q(raw.panelW)),
    panelH:    Math.max(0.05, q(raw.panelH)),
    rowBottom: q(raw.rowBottom),
    rowPitch:  Math.max(0.05, q(raw.rowPitch)),
    rows:      raw.rows,
  };
  // Key carries the type + full span: types with different board layouts must
  // never share a wrongly-offset canvas for the same photo.
  const key = `${fuente.clave}|${fixType}|${span.modo ?? "estante"}|${span.rows}|${span.panelW}|${span.panelH}|${span.rowBottom}|${span.rowPitch}`;
  let mat = photoMatCache.get(key);
  if (!mat) {
    const PPM = 512; // texture pixels per metre, capped so no side exceeds 2048
    const px  = Math.min(PPM, 2048 / span.panelW, 2048 / span.panelH);
    const canvas = document.createElement("canvas");
    canvas.width  = Math.max(2, Math.round(span.panelW * px));
    canvas.height = Math.max(2, Math.round(span.panelH * px));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";

    if (span.modo === "volcado") {
      // Producto a granel visto desde arriba. Se dibuja en cuadrícula con un
      // giro alterno chico y solape: sin eso se ve una plantilla de imprenta y
      // no un canasto lleno. El giro es determinista —depende de la celda, no
      // del azar— para que la misma batea se dibuje siempre igual.
      const cellW = Math.min(ANCHO_UNIDAD, span.panelW / 2);
      const cellH = Math.max(0.04, cellW / Math.max(0.2, entry.aspect));
      const pasoX = cellW * 0.88;
      const pasoY = cellH * 0.80;
      let fila = 0;
      for (let y = -cellH * 0.3; y < span.panelH; y += pasoY, fila++) {
        const corrida = fila % 2 === 0 ? 0 : pasoX / 2;   // traba, como se apila
        let col = 0;
        for (let x = -cellW * 0.3 + corrida; x < span.panelW; x += pasoX, col++) {
          const giro = (((fila * 7 + col * 5) % 5) - 2) * 0.055;   // ±6°
          ctx.save();
          ctx.translate((x + cellW / 2) * px, (y + cellH / 2) * px);
          ctx.rotate(giro);
          ctx.drawImage(image, (-cellW / 2) * px, (-cellH / 2) * px, cellW * px, cellH * px);
          ctx.restore();
        }
      }
      const texV = new THREE.CanvasTexture(canvas);
      texV.colorSpace = THREE.SRGBColorSpace;
      texV.anisotropy = 4;
      texV.wrapS = THREE.ClampToEdgeWrapping;
      texV.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: texV, toneMapped: false, transparent: true });
      photoMatCache.set(key, mat);
      return mat;
    }

    if (span.modo === "tira") {
      // Una columna de unidades colgadas, de arriba hacia abajo. El ancho lo
      // manda el panel: una ristra es angosta por definición.
      const cellW = span.panelW;
      const cellH = Math.max(0.04, cellW / Math.max(0.2, entry.aspect));
      for (let y = 0; y + cellH <= span.panelH + 0.001; y += cellH) {
        ctx.drawImage(image, 0, y * px, cellW * px, cellH * px);
      }
      const texT = new THREE.CanvasTexture(canvas);
      texT.colorSpace = THREE.SRGBColorSpace;
      texT.anisotropy = 4;
      texT.wrapS = THREE.ClampToEdgeWrapping;
      texT.wrapT = THREE.ClampToEdgeWrapping;
      mat = new THREE.MeshBasicMaterial({ map: texT, toneMapped: false, transparent: true });
      photoMatCache.set(key, mat);
      return mat;
    }

    for (let r = 0; r < span.rows; r++) {
      const rowFloor = span.rowBottom + r * span.rowPitch; // board top surface (m)
      // Each row cell fills its board gap. A cell that would poke past the
      // panel top (constrained top shelves) shrinks to fit — the bottom stays
      // anchored on the board; spare room only ever appears at the cell TOP.
      const cellH = Math.min(span.rowPitch, span.panelH - rowFloor);
      if (cellH < 0.02) continue;
      const cellW = Math.max(0.05, cellH * entry.aspect); // real product aspect
      const yTop  = canvas.height - (rowFloor + cellH) * px; // canvas Y is top-down
      for (let x = 0; x < canvas.width; x += cellW * px) {
        ctx.drawImage(image, x, yTop, cellW * px, cellH * px); // last column cut at edge
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // transparent: the plinth/header bands (and real-alpha PNG margins) show
    // the panel color behind each product, reading as stocked shelves.
    mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    photoMatCache.set(key, mat);
  }
  return mat;
}

/**
 * Resolve the material for ONE face, by priority:
 *   producto en prueba → supplier photo → category pattern → null (plain color).
 *
 * El producto en prueba va PRIMERO porque es una elección explícita hecha en
 * ese momento, delante del proveedor: tiene que ganarle a lo que haya cargado
 * de antes, que es justamente lo que se está proponiendo reemplazar.
 */
function resolveFaceMaterial(
  arteId:   number | null,
  faceCode: string | null,
  fixType:  string,
  category: string,
  label:    string,
  faceW:    number,
  faceH:    number,
  faceD:    number,
  faceImages: Map<string, number> | null,
  notify:     () => void,
  /** Lo que el mueble guardó de su ficha (`geometriaDe`): la góndola pinta
   *  sus filas con los entrepaños de la ficha, los mismos que dibuja. */
  geometria?: GeometriaDeMueble,
): THREE.Material | null {
  const aspect = faceW / Math.max(0.05, faceH);
  // El patrón de categoría dibuja estantes con paquetes: sobre la superficie de
  // un volcado o en una ristra sería un dibujo de góndola pegado donde no va.
  // Sin foto, esos muebles quedan pelados, que es lo honesto.
  const soloFoto = getPanelShelfSpan(fixType, faceW, faceH, faceD, geometria).modo !== undefined
    && getPanelShelfSpan(fixType, faceW, faceH, faceD, geometria).modo !== "estante";
  if (arteId != null) {
    const arte = getPhotoFaceMaterial(
      { clave: `catalogo:${arteId}`, url: arteUrl(arteId) },
      fixType, faceW, faceH, faceD, notify, geometria,
    );
    // Si todavía carga —o si alguien borró el arte del catálogo— se cae al
    // camino de siempre en vez de dejar el mueble pelado a mitad de una
    // reunión.
    if (arte) return arte;
  }
  if (faceCode && faceImages) {
    const fileId = faceImages.get(faceCode);
    if (fileId !== undefined) {
      const photo = getPhotoFaceMaterial(
        { clave: `archivo:${fileId}`, url: fileUrl(fileId) },
        fixType, faceW, faceH, faceD, notify, geometria,
      );
      if (photo) return photo;
      // still loading or failed → fall through to the category pattern
    }
  }
  if (soloFoto) return null;
  const cat = (category || "").trim();
  if (cat) return getCategoryFaceMaterial(categoryKeyFor(cat, label), aspect);
  return null;
}

// ─── "Sin contrato" badge ────────────────────────────────────────────────────
// Anchored INSIDE the fixture's group (top center), scales with distance,
// occluded by geometry, and hidden entirely beyond BADGE_MAX_DIST so the
// scene never fills with billboards.

const BADGE_MAX_DIST = 25; // metres

function FixtureBadge({ x, z, h }: { x: number; z: number; h: number }) {
  const [visible, setVisible] = useState(false);
  useFrame(({ camera }) => {
    // Scalar math only — no allocations in the frame loop.
    const dx = camera.position.x - x;
    const dy = camera.position.y - h;
    const dz = camera.position.z - z;
    const near = dx * dx + dy * dy + dz * dz < BADGE_MAX_DIST * BADGE_MAX_DIST;
    setVisible(v => (v === near ? v : near));
  });
  if (!visible) return null;
  return (
    <Html
      position={[0, h + 0.35, 0]}
      center
      distanceFactor={6}
      occlude
      zIndexRange={[5, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div style={{
        background: "#ef4444",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        maxWidth: 90,
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}>
        ⚠ Sin contrato
      </div>
    </Html>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────

interface SceneProps {
  placedFixtures:    PlacedFixture[];
  selectedId:        string | null;
  selectedSlotId:    string | null;
  hoveredSlotId:     string | null;
  setHoveredSlotId:  (id: string|null) => void;
  placingDef:        FixtureDef | null;
  ghostX:            number;
  ghostZ:            number;
  ghostRotY:         number;
  ghostCollides:     boolean;
  draggingId:        React.MutableRefObject<string|null>;
  orbitRef:          React.MutableRefObject<ThreeOrbitControls|null>;
  onFloorMove:       (x:number, z:number) => void;
  onFloorClick:      (x:number, z:number) => void;
  onSelectFixture:   (id:string) => void;
  onSelectSlot:      (fixtureId:string, slotId:string) => void;
  setPlacedFixtures: React.Dispatch<React.SetStateAction<PlacedFixture[]>>;
  screenshotReady:   (fn: () => string) => void;
  topViewReady:      (fn: () => void) => void;
  firstPerson:       boolean;
  /** Apaga las artes del proveedor: el «antes» del antes y después. */
  sinArte:           boolean;
  /** Producto que se está probando en cada cara: `${fixtureId}|A` → id del
   *  arte del catálogo. Se indexa por id de mueble y cara, y NO por código de
   *  espacio: el código se compone en tres lugares con reglas de prefijo y
   *  mayúsculas, y basta que una difiera para pintar el mueble equivocado. */
  prueba:            ReadonlyMap<string, number>;
  /** En qué entrepaños y si va acostado, por la misma clave que `prueba`. */
  comoSePrueba:      ReadonlyMap<string, ComoSePrueba>;
  /** El catálogo: de ahí salen la ficha y el modo de fondo de cada arte. */
  catalogo:          Arte[];
  /** Vender por partes, en el visor de Vender: las puertas o los tramos que
   *  se venden de cada cara (`${fixtureId}|A` → vanos del dibujo de la cara).
   *  Se marcan y la prueba va sólo en ellos. Sin esto, las caras enteras. */
  vanosALaVenta?:    ReadonlyMap<string, readonly number[]>;
  /** Vender por partes: los entrepaños que se venden de cada cara, como
   *  filas de producto (la base es la 0). La prueba va sólo en ellas. */
  filasALaVenta?:    ReadonlyMap<string, readonly number[]>;
  /** La pantalla de venta: limpia y sin datos de otros proveedores. */
  presentationMode:  boolean;
  /** Para quién es lo que se dibuja (`muebles/privacidad.ts`): `undefined` en
   *  la pantalla de la dueña; el `supplier_id` del que mira en Presentar y en
   *  la lámina que se lleva. Ahí sólo se ve SU prueba, y ninguna foto,
   *  patrón ni estado de nadie más. */
  privadoPara:       PrivadoPara;
  /** La toma de venta pedida desde «Mostrar al proveedor» o el HUD. */
  pedidoDeToma:      PedidoDeToma | null;
  onCamaraFP:        (c: CamaraEnPlanta | null) => void;
  saltarA:           { x: number; z: number; n: number } | null;
  onHoverFixture:    (id: string|null, x: number, y: number) => void;
  fixtures:          import("../../types/fixtures").UnifiedFixture[];
  /** Se escribe al confirmar cada cambio (ver `EstadoDeEscena`). */
  estadoDeEscena:    React.MutableRefObject<EstadoDeEscena>;
  /** La escena del visor de Vender (`components/Contrato/VisorDeVenta.tsx`):
   *  la MISMA tienda, pero sin tocar nada que sea del editor ni de otros
   *  proveedores. Tres puertas, y ni una más:
   *  - no pide el índice de fotos de las caras (`getFaceImages`): son las
   *    marcas de los que hoy ocupan los espacios;
   *  - la órbita no lee ni escribe `camera3D`: es la cámara guardada del
   *    Editor 3D, y escribirla en cada paso del giro además redibujaba la hoja
   *    de Vender entera (`DashboardView` está suscripta al store completo);
   *  - no atiende `enfoque3D`: ese pedido es del editor, y el visor encuadra
   *    con sus propias tomas.
   *  Lo demás del editor ya se apaga con lo que pasa el visor: sin mueble
   *  elegido no hay caja ni gizmo ni paneles de slot; sin unificados no hay
   *  insignias; con `privadoPara` definido no hay grilla y la sala es la de
   *  venta; en `presentationMode` no se arrastra nada. */
  soloVenta?:        boolean;
}

export function Scene({
  placedFixtures, selectedId, selectedSlotId,
  hoveredSlotId, setHoveredSlotId, onSelectSlot,
  placingDef, ghostX, ghostZ, ghostRotY, ghostCollides,
  draggingId, orbitRef, onFloorMove, onFloorClick,
  onSelectFixture, setPlacedFixtures,
  screenshotReady, topViewReady, firstPerson, sinArte, prueba, onCamaraFP, saltarA,
  onHoverFixture, fixtures, comoSePrueba, catalogo, presentationMode, pedidoDeToma, privadoPara,
  estadoDeEscena, soloVenta = false, vanosALaVenta, filasALaVenta,
}: SceneProps) {
  const { gl, camera, invalidate, size } = useThree();
  // Con un selector, y no el store entero: cada movimiento de la órbita
  // escribe la cámara en el store, y suscripta a TODO la escena se volvía a
  // dibujar entera en cada paso de un arrastre (ver más abajo, en el editor).
  const setCamera3D = useFixtureStore((s) => s.setCamera3D);
  // Lo que ya está en el grafo de la escena: se escribe al confirmar.
  React.useLayoutEffect(() => {
    estadoDeEscena.current.sinArte = sinArte;
    estadoDeEscena.current.privadoPara = privadoPara;
    estadoDeEscena.current.primeraPersona = firstPerson;
  });

  // Extensión real del local. De aquí salen la grilla, el piso que recibe
  // clics, la vista superior y los límites de la caminata en primera persona.
  const limites = useMemo(() => limitesDePlanta(placedFixtures, 2.5, PLANTA_NOMINAL), [placedFixtures]);

  // Unified fixtures by id — sede/code/faceB metadata + badge checks.
  const unifiedById = useMemo(() => {
    const m = new Map<string, UnifiedFixture>();
    fixtures.forEach(f => m.set(f.id, f));
    return m;
  }, [fixtures]);

  // Supplier face images: code → file_id (most recent image per space).
  // null until the fetch settles; failures degrade to category patterns.
  // En el visor de Vender ni se piden (`soloVenta`): son las fotos de las
  // marcas de OTROS proveedores, y la pantalla la mira uno de ellos. Que la
  // escena privada no las dibuje no alcanza: bajarlas ya es entregarlas.
  const [faceImages, setFaceImages] = useState<Map<string, number> | null>(() => (soloVenta ? new Map() : null));
  useEffect(() => {
    if (soloVenta) return;
    let alive = true;
    getFaceImages()
      .then((rows: { code: string; file_id: number }[]) => {
        if (alive) setFaceImages(new Map(rows.map(r => [r.code.toUpperCase(), r.file_id])));
      })
      .catch(() => { if (alive) setFaceImages(new Map()); });
    return () => { alive = false; };
  }, []);

  // Bumped when an async photo texture settles → re-resolve materials + redraw.
  const [texVersion, setTexVersion] = useState(0);
  const notifyTexLoaded = useCallback(() => {
    setTexVersion(v => v + 1);
    invalidate();
  }, [invalidate]);

  // Face-paint materials per fixture id (photo → category pattern → plain).
  const facePaintById = useMemo(() => {
    const map = new Map<string, FacePaint>();
    // Sin arte no se pinta NADA sobre las caras: ni la foto del proveedor ni el
    // patrón de categoría. El «antes» tiene que ser el mueble pelado, que es
    // contra lo que se compara la marca puesta.
    if (sinArte) return map;
    const storeSede = useFixtureStore.getState().sede;
    const enUso: string[] = [];
    /** El producto de prueba de una cara: la etiqueta (la foto sin fondo, que
     *  carga sola y avisa con `notifyTexLoaded`), el envase a escala y dónde
     *  va. Mientras la foto carga, la cara se ve vacía un momento.
     *
     *  `null` si no se puede armar: el arte ya no está en el catálogo, o la
     *  foto no cargó (Render despertando, token vencido, la red). Ahí la cara
     *  cae a la lámina de siempre en vez de quedar vacía —sin producto, sin
     *  foto, sin patrón y sin relleno— a mitad de una reunión; la etiqueta se
     *  vuelve a pedir sola en un rato, o con «Reintentar» en el panel. */
    const construirPrueba = (fix: PlacedFixture, cara: "A" | "B", arteId: number): PruebaDeCara | null => {
      const fixId = fix.id;
      const arte = catalogo.find((a) => a.id === arteId);
      if (!arte) return null;
      const modo = arte.ficha?.fondo_foto ?? "auto";
      const clave = claveDeArte(arteId, modo);
      enUso.push(clave);
      // Con la pista del arte (nombre, categoría y ficha): el worker del
      // recorte sabe qué envase es y arma de una sus variantes.
      const etiqueta = etiquetaDeArte(clave, arteUrl(arteId), modo, notifyTexLoaded, { arte, ficha: arte.ficha ?? null });
      const estado = estadoDeEtiqueta(clave);
      if (!etiqueta && (estado === "error" || estado === "reintentando")) return null;
      const como = comoSePrueba.get(`${fixId}|${cara}`);
      const empaque = etiqueta
        ? empaqueDeArte(arte, arte.ficha ?? null, etiqueta.recorte, { acostado: como?.acostado })
        : null;
      // Las rejillas de la nevera (automáticas, de fábrica o a mano): las
      // dibuja la nevera y apoya el producto en ellas, con las MISMAS alturas.
      // Las automáticas existen recién con la foto: mientras carga, `filas`
      // queda sin definir y la toma re-encuadra cuando llegan (ver el efecto
      // de la toma).
      const filas = esNeveraDeBebidas(fix.type)
        ? rejillasDeLaPrueba(ventaDeTipo(fix.type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix))!, empaque, como?.rejillas).filas ?? undefined
        : undefined;
      // El surtido: más productos del MISMO proveedor, en bloques verticales
      // (sólo góndola y punta). Cada uno pasa por la misma privacidad que el
      // principal (`surtidoALaVista`). Los tramos se reparten entre todos los
      // que valen, carguen o no su foto: el principal no salta de la cara
      // entera a un tercio cuando llega la foto del segundo.
      const delSurtido = TIPOS_CON_SURTIDO.has(fix.type)
        ? surtidoALaVista(arteId, como?.surtido, catalogo, privadoPara) : [];
      let surtido: PruebaDeCara["surtido"];
      let tramos: PruebaDeCara["tramos"];
      if (delSurtido.length > 0) {
        const venta = ventaDeTipo(fix.type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix));
        tramos = venta ? bloquesDeSurtido(venta.vanos, delSurtido.length + 1) : undefined;
        surtido = delSurtido.map((id) => {
          const otro = catalogo.find((a) => a.id === id)!;
          const modoOtro = otro.ficha?.fondo_foto ?? "auto";
          const claveOtro = claveDeArte(id, modoOtro);
          enUso.push(claveOtro);
          const et = etiquetaDeArte(claveOtro, arteUrl(id), modoOtro, notifyTexLoaded, { arte: otro, ficha: otro.ficha ?? null });
          return {
            etiqueta: et,
            empaque: et ? empaqueDeArte(otro, otro.ficha ?? null, et.recorte, { acostado: como?.acostado }) : null,
            semilla: `${fixId}|${cara}|${id}`,
            hablador: habladorALaVista(otro, catalogo, privadoPara),
          };
        });
      }
      // «Acostarla sólo en la N»: el mismo producto acostado en las filas
      // vigentes donde parado no entra; con la cara entera y sin surtido.
      let acostada: PruebaDeCara["acostada"] = null;
      if (como?.acostarDondeNoEntra && etiqueta && empaque && !empaque.acostado && empaque.envase === "revolucion"
        && (como.donde ?? "todas") === "todas" && !surtido) {
        const vigentes = filas ?? ventaDeTipo(fix.type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix))?.filas;
        const sin = vigentes ? filasSinAlto(vigentes, empaque.alto) : [];
        if (vigentes && sin.length > 0 && sin.length < vigentes.rows) {
          acostada = { empaque: empaqueDeArte(arte, arte.ficha ?? null, etiqueta.recorte, { acostado: true }), filas: sin };
        }
      }
      const vanos = vanosALaVenta?.get(`${fixId}|${cara}`);
      // Vendiendo entrepaños sueltos, el producto va sólo en ESAS filas (las
      // que eligió quien prueba, si alguna es de ellas; si no, todas las del
      // contrato): las otras no se le venden a este proveedor.
      const filasDeLaParte = filasALaVenta?.get(`${fixId}|${cara}`);
      const elegidas = como?.donde && como.donde !== "todas" ? como.donde : null;
      const donde: PruebaDeCara["donde"] = filasDeLaParte && filasDeLaParte.length
        ? (elegidas && elegidas.some((i) => filasDeLaParte.includes(i))
          ? elegidas.filter((i) => filasDeLaParte.includes(i)) : [...filasDeLaParte])
        : como?.donde ?? "todas";
      return {
        etiqueta, empaque, donde, semilla: `${fixId}|${cara}|${arteId}`, filas,
        copete: como?.copete ?? true, acostada,
        ...(vanos && vanos.length ? { vanos } : {}),
        // El hablador: el nombre sin cifras y el precio SÓLO si está cargado
        // en la ficha; de un arte que esta pantalla no puede ver, ninguno.
        hablador: habladorALaVista(arte, catalogo, privadoPara),
        ...(surtido && tramos ? { surtido, tramos } : {}),
      };
    };
    for (const fix of placedFixtures) {
      const type = fix.type as string;
      if (!TIPOS_CON_PRODUCTO.has(type)) continue;
      // Infrastructure never carries a supplier planogram.
      if (!isRentable(fix)) continue;
      const uf = unifiedById.get(fix.id);
      // Contract-save convention (FloorPlan2D AssignmentPanel):
      //   fullCode = `${item.sede || sede}-${item.code}`; face B appends "-B".
      // 3D-generated codes already embed the sede prefix — guard against
      // double-prefixing so both editors' fixtures resolve their space code.
      const sedeVal = uf?.sede || storeSede;
      // Case-insensitive: generateCode embeds the sede UPPERCASED in fix.code,
      // so compare/compose in uppercase on both sides (faceImages keys are
      // uppercased too) — a raw-case sede must never double-prefix the code.
      const codeUC = fix.code.toUpperCase();
      const sedeUC = (sedeVal ?? "").toUpperCase();
      const fullCode = sedeUC && !codeUC.startsWith(`${sedeUC}-`)
        ? `${sedeUC}-${codeUC}`
        : codeUC;
      // Fallback: 2D-created spaces saved with a raw-case sede prefix may
      // uppercase to a key that differs from the computed fullCode — try the
      // bare uppercased code too. First hit wins.
      const pickCode = (primary: string, fallback: string) =>
        faceImages && !faceImages.has(primary) && faceImages.has(fallback)
          ? fallback
          : primary;
      const isDouble = isDoubleGondola(fix);
      const en3D = TIPOS_CON_PRUEBA_3D.has(type);
      // En una pantalla que mira un proveedor, sólo SUS pruebas: las de otros
      // proveedores de la misma sesión (la punta que se le ofreció a Alpina
      // a la mañana) no se le muestran a Diana a la tarde.
      const arteA = arteALaVista(prueba.get(`${fix.id}|A`), catalogo, privadoPara);
      const arteB = isDouble ? arteALaVista(prueba.get(`${fix.id}|B`), catalogo, privadoPara) : null;
      const privado = privadoPara !== undefined;
      // La prueba en 3D le gana a todo en SU cara: ni la foto del espacio ni
      // el patrón de categoría (ESTADO.md, «la prueba le gana a la foto»).
      const pruebaA = en3D && arteA != null ? construirPrueba(fix, "A", arteA) : null;
      const pruebaB = en3D && arteB != null ? construirPrueba(fix, "B", arteB) : null;
      // En una pantalla privada (Presentar, la lámina), las caras SIN prueba
      // del que mira no muestran nada de nadie: la foto del espacio y el
      // patrón de categoría son las marcas de OTROS proveedores. Caen al
      // relleno neutro por rubro, que no nombra a nadie. Y una cara CON su
      // prueba que no se pudo armar (la foto no cargó) cae a la lámina de
      // SU arte y a nada más: ni mientras carga se le muestra la foto del
      // espacio, que es la marca del que hoy lo tiene.
      const caraPintada = (
        arte: number | null, codigo: string, codigoSolo: string, categoria: string,
      ): THREE.Material | null => (privado
        ? (arte != null
          ? resolveFaceMaterial(arte, null, type, "", fix.label, fix.w, fix.h, fix.d, faceImages, notifyTexLoaded, geometriaDe(fix))
          : null)
        : resolveFaceMaterial(
          arte, pickCode(codigo, codigoSolo), type, categoria, fix.label,
          fix.w, fix.h, fix.d, faceImages, notifyTexLoaded, geometriaDe(fix),
        ));
      const front = pruebaA ? null : caraPintada(arteA, fullCode, codeUC, fix.brandCategory);
      const back = isDouble && !pruebaB
        ? caraPintada(arteB, `${fullCode}-B`, `${codeUC}-B`, uf?.faceB?.brandCategory ?? "")
        : null;
      const puertasA = vanosALaVenta?.get(`${fix.id}|A`);
      // El contorno de los tramos y entrepaños que se venden (la nevera de
      // puertas ya marca el marco de sus hojas).
      const contornos = type === "nevera_puertas" ? [] : (["A", "B"] as const).flatMap((c) => contornosDeLasPartes(
        type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix), c,
        vanosALaVenta?.get(`${fix.id}|${c}`), filasALaVenta?.get(`${fix.id}|${c}`),
      ));
      if (front || back || pruebaA || pruebaB || puertasA || contornos.length) {
        map.set(fix.id, {
          front, back, pruebaA, pruebaB,
          ...(puertasA && puertasA.length ? { puertasA } : {}),
          ...(contornos.length ? { contornos } : {}),
        });
      }
    }
    // Lo que está en prueba no se desaloja del caché de etiquetas.
    marcarEnUso(enUso);
    return map;
  // texVersion re-runs this memo when an async photo texture settles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFixtures, unifiedById, faceImages, texVersion, notifyTexLoaded, sinArte, prueba,
      catalogo, comoSePrueba, privadoPara, vanosALaVenta, filasALaVenta]);
  // El foco de la pantalla de venta: los muebles con una prueba a la vista y
  // el de la toma. Los demás —los vecinos— se atenúan para no competir con lo
  // que se vende; sin ninguno (Presentar sin proveedor ni toma), nadie. En el
  // editor, ninguno: la tienda se ve entera como siempre.
  const conFoco = useMemo(() => {
    const s = new Set<string>();
    if (privadoPara === undefined) return s;
    facePaintById.forEach((p, id) => { if (p.pruebaA || p.pruebaB) s.add(id); });
    if (pedidoDeToma) s.add(pedidoDeToma.fixtureId);
    return s;
  }, [privadoPara, facePaintById, pedidoDeToma]);
  // Qué caras se dibujan con las rejillas acomodadas, para el pie de la lámina.
  React.useLayoutEffect(() => {
    const acomodadas: string[] = [];
    facePaintById.forEach((p, id) => {
      if (p.pruebaA?.filas) acomodadas.push(`${id}|A`);
      if (p.pruebaB?.filas) acomodadas.push(`${id}|B`);
    });
    estadoDeEscena.current.rejillasAcomodadas = acomodadas;
  }, [facePaintById, estadoDeEscena]);

  // CHANGE 1 — Restore camera + wire persistence once OrbitControls are ready.
  // W1: Read camera3D from getState() at call time (not from closure) to avoid stale values.
  // B3: Returns a disposer so the caller can remove the listener on unmount.
  const handleOrbitReady = useCallback((ctrl: ThreeOrbitControls) => {
    const { camera3D: c3d } = useFixtureStore.getState();
    // Migrate old camera states. The new correct position is north of the store
    // at posZ = STORE_D + 8 = 50. Any saved posZ < STORE_D (42) means the camera
    // was saved from the old south-facing setup (including any in-store orbit positions).
    const needsMigration = c3d.posZ < STORE_D;
    const posX = needsMigration ? STORE_W / 2 : c3d.posX;
    const posY = needsMigration ? 28 : c3d.posY;
    const posZ = needsMigration ? STORE_D + 8 : c3d.posZ;
    const targetX = needsMigration ? STORE_W / 2 : c3d.targetX;
    const targetY = needsMigration ? 0 : c3d.targetY;
    const targetZ = needsMigration ? STORE_D / 2 : c3d.targetZ;
    camera.position.set(posX, posY, posZ);
    ctrl.target.set(targetX, targetY, targetZ);
    ctrl.update();
    const handler = () => {
      const p = camera.position;
      const t = ctrl.target;
      setCamera3D({ posX: p.x, posY: p.y, posZ: p.z, targetX: t.x, targetY: t.y, targetZ: t.z });
    };
    ctrl.addEventListener('change', handler);
    // Return cleanup so CameraControls can remove the listener on unmount (B3)
    return () => ctrl.removeEventListener('change', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vista superior — register handler so the toolbar button can trigger it
  useEffect(() => {
    topViewReady(() => {
      const ctrl = orbitRef.current;
      if (!ctrl) return;
      camera.position.set(limites.cx, Math.max(limites.w, limites.d) * 0.9, limites.cz);
      ctrl.target.set(limites.cx, 0, limites.cz);
      ctrl.update();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topViewReady, limites]);

  // CHANGE 2A — Encuadrar el local al abrir.
  //
  // Antes esto sólo actuaba si el punto de mira estaba exactamente en el
  // origen. Una cámara guardada apuntando al centro de la tienda ficticia
  // (15, 21) pasaba el filtro y la sede quedaba arrinconada en una esquina de
  // la pantalla al entrar. Ahora se reencuadra siempre que la mira caiga fuera
  // del local; si el usuario la dejó adentro, se respeta su encuadre.
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit || placedFixtures.length === 0) return;
    const t = orbit.target;
    if (miradaSensata(limites, t.x, t.z)) return;
    const { pos, mirada } = vistaGeneral(limites);
    camera.position.set(pos.x, pos.y, pos.z);
    orbit.target.set(mirada.x, mirada.y, mirada.z);
    orbit.update();
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedFixtures, limites]);

  /** Deja la cámara en una vista concreta y redibuja. */
  const aplicarVista = useCallback((v: Vista3D) => {
    const orbit = orbitRef.current;
    camera.position.set(v.posX, v.posY, v.posZ);
    if (orbit) {
      orbit.target.set(v.targetX, v.targetY, v.targetZ);
      orbit.update();
    }
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, invalidate]);

  /** Dónde se para la persona de escala en la pantalla de venta: la eligió la
   *  toma (`personaYTomaDeVenta`) para el mueble de la toma, o `null` si
   *  ninguna separación la deja entera en el cuadro. La silueta usa ÉSTA y no
   *  una calculada aparte: con dos cuentas, la toma del robatope no la
   *  encuadraba y la silueta se escondía. */
  const [personaDeVenta, setPersonaDeVenta] = useState<{
    fixtureId: string; persona: { x: number; z: number; rotY: number } | null;
  } | null>(null);
  useEffect(() => { if (privadoPara === undefined) setPersonaDeVenta(null); }, [privadoPara]);

  /**
   * La toma de venta de una cara: DENTRO del pasillo (`vistaDeVenta` mide
   * cuánto hay libre con los mismos muros de la caminata), encuadrando lo que
   * se está probando —la cara entera o los entrepaños elegidos, con la misma
   * cuenta que los dibuja— o la cara entera si no hay prueba. Pone también el
   * campo visual: «De cerca» va con teleobjetivo (`FOV_DE_CERCA`).
   */
  const tomaDeVenta = useCallback((fix: PlacedFixture, cara: "A" | "B", toma: TomaDeVenta, holgura = 1) => {
    const venta0 = ventaDeTipo(fix.type, fix.w, fix.d, fix.h, fix.gondolaType, geometriaDe(fix));
    const paint = facePaintById.get(fix.id);
    const enCara = cara === "A" ? paint?.pruebaA : paint?.pruebaB;
    // Con las rejillas reacomodadas, la toma encuadra ESAS alturas.
    const venta = venta0 && enCara?.filas ? { ...venta0, filas: enCara.filas } : venta0;
    const como = comoSePrueba.get(`${fix.id}|${cara}`);
    const foco0 = venta
      ? focoDeLaPrueba(venta, fix.h, enCara ? (como?.donde ?? "todas") : "todas", enCara?.empaque ?? null)
      : { yBajo: 0, yAlto: fix.h };
    // Con holgura, la misma franja agrandada alrededor de su centro.
    const medio = (foco0.yBajo + foco0.yAlto) / 2, mitad = ((foco0.yAlto - foco0.yBajo) / 2) * holgura;
    const foco = holgura === 1 ? foco0 : { ...foco0, yBajo: medio - mitad, yAlto: medio + mitad };
    const obstaculos = murosDeCaminata(placedFixtures.filter((f) => f.id !== fix.id));
    const aspecto = size.width / Math.max(1, size.height);
    const mueble = { cx: fix.x, cz: fix.z, w: fix.w, d: fix.d, h: fix.h, rotY: fix.rotY };
    // En la pantalla de venta, «De frente» abre el campo visual lo justo para
    // que la cara entre a lo ancho desde el pasillo (`fovParaLaCara`: una
    // góndola de 3,6 m en un pasillo de 2 m). También por entrepaño: mira la
    // franja elegida de frente y a su altura, pero de punta a punta —con 50°
    // la Avena de GON-02·A por entrepaño salía sin los dos cantos—. En el
    // editor, los 50° de siempre.
    const enVenta = presentationMode || privadoPara !== undefined;
    const fov = toma === "cerca" ? FOV_DE_CERCA
      : enVenta && toma === "frente" ? fovParaLaCara(mueble, cara, obstaculos, limites, aspecto, FOV_DEL_EDITOR, foco.porEntrepano ? foco : undefined)
        : FOV_DEL_EDITOR;
    // La punta: dónde empieza el cartel —el copete, o la cenefa que baja de
    // él hasta el último entrepaño—, para que «De cerca» no lo corte por la
    // mitad (`focoDeLaPrueba` mira entrepaños y no sabe del copete).
    const pisoDelCartel = fix.type === "punta" ? pisoDelCartelDePunta(fix.h, geometriaDe(fix).entrepanos) : 0;
    const focoConCopete = {
      ...(fix.type === "punta" ? { ...foco, techoDeCara: pisoDelCartel, altoDeCopete: fix.h - pisoDelCartel } : foco),
      // Con el campo visual abierto, desde el fondo del pasillo.
      ...(fov > FOV_DEL_EDITOR && toma === "frente" ? { alFondo: true } : {}),
    };
    ponerCampoVisual(fov);
    // En la pantalla de venta (Presentar y la lámina), «De frente» y «Tres
    // cuartos» de la cara entera salen con la persona de escala ENTERA en el
    // cuadro: una sola cuenta para la toma y para dónde se para
    // (`personaYTomaDeVenta`), y la escena la dibuja ahí. Por entrepaño y «De
    // cerca» miran lo elegido de frente: sin persona.
    estadoDeEscena.current.aspectoConPersona = 0;
    if (enVenta && toma !== "cerca" && !foco.porEntrepano) {
      // La lámina (venta fuera de Presentar) prueba primero la persona más
      // pegada: cada toma se recorta a la forma del mueble.
      const lamina = !presentationMode;
      const { vista, persona, extremo } = personaYTomaDeVenta(
        mueble, cara, toma, focoConCopete, obstaculos, limites, fov, aspecto,
        lamina ? [...SEPARACIONES_DE_LA_FIGURA].reverse() : SEPARACIONES_DE_LA_FIGURA,
      );
      setPersonaDeVenta({ fixtureId: fix.id, persona });
      if (persona) estadoDeEscena.current.aspectoConPersona = extremo * 1.04 * aspecto;
      aplicarVista(vista);
      return;
    }
    if (enVenta) setPersonaDeVenta({ fixtureId: fix.id, persona: null });
    // En el editor, la de siempre: la persona de 1,70 m se para al costado del
    // mueble elegido y el tres cuartos gira para el otro lado, sin ponerla en
    // primer plano.
    const persona = fix.id === selectedId
      ? lugarDeLaFigura(fix, obstaculos, SEPARACION_EN_VENTA, { d: fix.d, cara }) : null;
    aplicarVista(vistaDeVenta(
      mueble, cara, toma, focoConCopete, obstaculos, limites, fov, aspecto,
      persona ?? undefined,
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facePaintById, comoSePrueba, placedFixtures, selectedId, presentationMode, privadoPara, limites, size, aplicarVista]);

  /** El campo visual de la cámara. Sólo «De cerca» lo cambia; cualquier otra
   *  toma, salir de Presentar o la vista superior lo devuelven a 50°. */
  const ponerCampoVisual = useCallback((fov: number) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || cam.fov === fov) return;
    cam.fov = fov;
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate]);
  useEffect(() => {
    if (pedidoDeToma?.toma !== "cerca") ponerCampoVisual(FOV_DEL_EDITOR);
  }, [pedidoDeToma, ponerCampoVisual]);

  // Encuadrar el espacio que se pidió desde la pantalla de sede o con
  // «Encuadrar esta cara».
  //
  // Se espera a estar fuera de la primera persona: al salir de la caminata su
  // limpieza también mueve la cámara, y las dos escrituras en el mismo commit
  // se pisan. Con el pedido atendido por número, entrar y salir de la caminata
  // no vuelve a encuadrar solo.
  const enfoque3D = useFixtureStore((st) => st.enfoque3D);
  const enfoqueAtendido = useRef<number>(-1);
  useEffect(() => {
    // El visor de Vender encuadra con sus propias tomas: un `enfoque3D` es un
    // pedido para el editor (y cambia de pestaña).
    if (soloVenta || !enfoque3D || firstPerson) return;
    if (enfoqueAtendido.current === enfoque3D.n) return;
    const uf = fixtures.find((f) => f.id === enfoque3D.fixtureId);
    if (!uf) return;   // todavía no cargó la sede — se reintenta al llegar
    enfoqueAtendido.current = enfoque3D.n;
    // La vista guardada manda: alguien la eligió a mano para este espacio.
    const guardada = uf.vista3D?.[enfoque3D.cara];
    if (guardada) { ponerCampoVisual(FOV_DEL_EDITOR); aplicarVista(guardada); return; }
    // Si no, la MISMA toma «De frente» de la pantalla de venta: el encuadre
    // viejo (`vistaDeCara`) no miraba vecinos y a la cara B de una góndola la
    // encuadraba desde detrás de la de enfrente, con su lomo vacío tapando
    // todo. `vistaDeCara` queda para lo que no está en el plano 3D.
    const fix = placedFixtures.find((f) => f.id === enfoque3D.fixtureId);
    if (fix) tomaDeVenta(fix, enfoque3D.cara, "frente");
    else aplicarVista(vistaDeCara(uf, enfoque3D.cara));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfoque3D, firstPerson, fixtures, aplicarVista]);

  // La toma de venta pedida («Mostrar al proveedor» y el HUD de Presentar).
  // Un corte, sin animación: por videollamada el movimiento se empasta y el
  // proveedor ve una mancha.
  const tomaAtendida = useRef<number>(-1);
  /** Lo que dejó la última toma: las filas que encuadró, el tamaño del
   *  lienzo y dónde quedó la cámara. Con eso se sabe si hay que re-encuadrar
   *  (abajo). */
  const tomaHecha = useRef<{ n: number; filas: string; tamano: string; pos: THREE.Vector3; mira: THREE.Vector3 } | null>(null);
  const filasDeLaToma = (p: PedidoDeToma) => {
    const paint = facePaintById.get(p.fixtureId);
    return claveDeFilas((p.cara === "A" ? paint?.pruebaA : paint?.pruebaB)?.filas);
  };
  const tamanoDelLienzo = `${size.width}x${size.height}`;
  const recordarToma = (p: PedidoDeToma) => {
    const mira = orbitRef.current?.target;
    tomaHecha.current = {
      n: p.n, filas: filasDeLaToma(p), tamano: tamanoDelLienzo,
      pos: camera.position.clone(), mira: mira ? mira.clone() : new THREE.Vector3(),
    };
  };
  // Qué pide la toma: el número del pedido, el tamaño del lienzo y las filas
  // de la cara. El efecto atiende cualquier cambio de esa clave:
  //
  // - un pedido NUEVO (`n`) siempre encuadra;
  // - el TAMAÑO cambia al entrar a Presentar —el contenedor pasa a ocupar la
  //   pantalla y después llega la pantalla completa—, y la toma se pidió en
  //   el mismo clic, con el lienzo viejo: encuadrada para 1440 × 760 salía
  //   corrida y con aire de más en 1920 × 1080;
  // - las FILAS cambian cuando las rejillas automáticas de la nevera llegan
  //   con la foto, después del primer encuadre: la 2 L quedaba cortada arriba.
  //
  // Los dos últimos re-encuadran SÓLO si la cámara sigue donde la dejó la
  // toma (posición y mira a menos de 1 mm): un giro a mano de la dueña no se
  // pisa porque se agrandó la ventana. Con `sinArte` (el «Hoy» de la lámina)
  // las filas no se miran: vuelven a ser las de fábrica un momento y la toma
  // de «Hoy» tiene que ser la MISMA que la de «Con …».
  const claveDeLaToma = pedidoDeToma
    ? `${pedidoDeToma.n}|${tamanoDelLienzo}|${filasDeLaToma(pedidoDeToma)}` : "";
  useEffect(() => {
    if (!pedidoDeToma || firstPerson) return;
    const fix = placedFixtures.find((f) => f.id === pedidoDeToma.fixtureId);
    if (!fix) return;
    if (tomaAtendida.current === pedidoDeToma.n) {
      const hecha = tomaHecha.current;
      if (!hecha || hecha.n !== pedidoDeToma.n) return;
      const filas = filasDeLaToma(pedidoDeToma);
      const otroTamano = hecha.tamano !== tamanoDelLienzo;
      const otrasFilas = !sinArte && filas !== hecha.filas;
      if (!otroTamano && !otrasFilas) return;
      const mira = orbitRef.current?.target;
      const quieta = camera.position.distanceTo(hecha.pos) < 1e-3 && (!mira || mira.distanceTo(hecha.mira) < 1e-3);
      hecha.tamano = tamanoDelLienzo;
      if (!sinArte) hecha.filas = filas;
      if (!quieta) return;
    }
    tomaAtendida.current = pedidoDeToma.n;
    tomaDeVenta(fix, pedidoDeToma.cara, pedidoDeToma.toma, pedidoDeToma.holgura);
    recordarToma(pedidoDeToma);
    estadoDeEscena.current.toma = pedidoDeToma.n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDeLaToma, firstPerson, sinArte, placedFixtures]);

  // CHANGE 2B — Double-click to reset orbit pivot to clicked point
  function handleSceneDoubleClick(e: any) {
    if (!orbitRef.current || !e.point) return;
    orbitRef.current.target.set(e.point.x, 0, e.point.z);
    orbitRef.current.update();
  }

  // Two-level grid: major 1 m lines (visible) + minor 0.5 m lines (faint).
  // Se dimensiona y se centra sobre la planta real. El centro y el tamaño se
  // redondean a 1 m para no reconstruir la grilla en cada frame de un arrastre.
  const gridCX   = Math.round(limites.cx);
  const gridCZ   = Math.round(limites.cz);
  const gridSize = Math.ceil(Math.max(limites.w, limites.d)) + 4;
  const { gridMajor, gridMinor } = useMemo(() => {
    const DIVS = gridSize; // 1 m per cell
    const major = new THREE.GridHelper(gridSize, DIVS, "#a09890", "#cbc6be");
    major.position.set(gridCX, 0.004, gridCZ);
    (major.material as THREE.LineBasicMaterial).transparent = true;
    (major.material as THREE.LineBasicMaterial).opacity = 0.55;

    const minor = new THREE.GridHelper(gridSize, DIVS * 2, "#dbd8d4", "#dbd8d4");
    minor.position.set(gridCX, 0.002, gridCZ);
    (minor.material as THREE.LineBasicMaterial).transparent = true;
    (minor.material as THREE.LineBasicMaterial).opacity = 0.35;

    return { gridMajor: major, gridMinor: minor };
  }, [gridCX, gridCZ, gridSize]);

  // Liberar la grilla anterior cuando cambia el tamaño de la planta.
  useEffect(() => () => {
    [gridMajor, gridMinor].forEach(g => {
      g.geometry.dispose();
      (g.material as THREE.Material).dispose();
    });
  }, [gridMajor, gridMinor]);

  const ghostFixture: PlacedFixture | null = placingDef ? {
    id:"ghost", code:"", type:placingDef.type,
    gondolaType: placingDef.gondolaType,
    x:ghostX, z:ghostZ, rotY:ghostRotY,
    w:placingDef.w, d:placingDef.d, h:placingDef.h,
    label:placingDef.label, color:placingDef.color,
    supplierName:"", brandCategory:"",
    status:"free", negotiatedValue:0,
    startDate:"", endDate:"", observation:"",
    ...(NON_RENTABLE_BY_DEFAULT.has(placingDef.type) ? { rentable: false } : {}),
    // El fantasma se ve como va a quedar: con las puertas, los entrepaños y
    // el módulo de la ficha.
    ...fichaDe(placingDef),
  } : null;

  return (
    <>
      {/* MEJORA 1: Rebalanced lights */}
      <ambientLight intensity={0.55} color="#fff8f0" />
      {/* La luz principal y su cámara de sombras se cuelgan de la planta real:
          ancladas a STORE_W/STORE_D iluminaban una tienda que no existe y
          recortaban la sombra justo donde empieza la mitad izquierda de NAVE. */}
      {/* El sesgo de la sombra: sin él, cada bandeja vacía se veía con rayas
          diagonales y dientes claros (shadow acne), y en «Por entrepaño» —con
          la mayoría de las bandejas vacías y la cámara de venta a un metro—
          era lo que más se veía después del producto. */}
      <directionalLight position={[limites.cx,40,limites.cz]} intensity={1.6} castShadow
        shadow-bias={-0.0005} shadow-normalBias={0.02}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.5} shadow-camera-far={120}
        shadow-camera-left={-limites.w/2 - 4} shadow-camera-right={limites.w/2 + 4}
        shadow-camera-top={limites.d/2 + 4} shadow-camera-bottom={-limites.d/2 - 4} />
      <directionalLight position={[limites.minX,25,limites.minZ]} intensity={0.3} color="#fffaee" />
      <directionalLight position={[limites.maxX,25,limites.maxZ]} intensity={0.2} color="#e0eeff" />

      <StoreRoom limites={limites} muebles={placedFixtures}
        venta={privadoPara !== undefined} primeraPersona={firstPerson} />

      {/* La persona, al lado del mueble elegido. En primera persona no va: la
          persona sos vos, y una segunda parada al lado del estante distrae. */}
      {!firstPerson && (() => {
        // En Presentar, al lado del mueble que se está mostrando (el de la
        // última toma): un arrastre que empieza sobre otro mueble lo elige,
        // y la persona no tiene por qué saltar hasta él.
        // También en la lámina (`privadoPara` definido): es la pantalla de
        // venta que se lleva el proveedor.
        const pantallaDeVenta = presentationMode || privadoPara !== undefined;
        const enVenta = pantallaDeVenta && pedidoDeToma ? pedidoDeToma.fixtureId : null;
        const sel = placedFixtures.find((f) => f.id === (enVenta ?? selectedId));
        if (!sel) return null;
        // Sin el propio mueble: su huella inflada cubre justo el costado donde
        // la figura tiene que pararse, y se bloquearía a sí misma.
        const muros = murosDeCaminata(placedFixtures.filter((f) => f.id !== sel.id));
        // La silueta, parada en el plano de la cara que se muestra —en el
        // editor también: el muñeco de cápsulas, 35 cm por delante, quedaba en
        // primer plano en cuanto «Encuadrar esta cara» pasó a ser la toma de
        // frente, y se leía como un maniquí de prueba de choque—. En «De
        // cerca» no va: el entrepaño llena el cuadro y la persona sólo
        // aparecería cortada.
        const toma = pantallaDeVenta && pedidoDeToma?.fixtureId === sel.id ? pedidoDeToma : null;
        if (toma?.toma === "cerca") return null;
        // En venta, la persona que eligió la toma —la misma cuenta que la
        // encuadró—; si la toma no la pudo meter entera, ninguna.
        if (toma && personaDeVenta?.fixtureId === sel.id) {
          const q = personaDeVenta.persona;
          return q ? <SiluetaDeEscala x={q.x} z={q.z} rotY={q.rotY} color={GRIS_DE_SILUETA_EN_VENTA} mirarCamara /> : null;
        }
        const cara = toma?.cara ?? (prueba.has(`${sel.id}|B`) && !prueba.has(`${sel.id}|A`) ? "B" : "A");
        const p = lugarDeLaFigura(sel, muros, SEPARACION_EN_VENTA, { d: sel.d, cara });
        return p ? <SiluetaDeEscala x={p.x} z={p.z} rotY={p.rotY}
          color={pantallaDeVenta ? GRIS_DE_SILUETA_EN_VENTA : GRIS_DE_SILUETA} mirarCamara={pantallaDeVenta} /> : null;
      })()}
      {/* La grilla es del editor: en la pantalla de venta el piso es la
          baldosa de la tienda, sin las líneas de 1 m y 0,5 m. */}
      {privadoPara === undefined && <primitive object={gridMinor} />}
      {privadoPara === undefined && <primitive object={gridMajor} />}

      {/* Alignment guides + snap crosshair: during placement AND during drag */}
      {(() => {
        const draggedFix = draggingId.current
          ? placedFixtures.find(f => f.id === draggingId.current)
          : null;
        const guideX = draggedFix ? draggedFix.x : ghostX;
        const guideZ = draggedFix ? draggedFix.z : ghostZ;
        const guideActive = !!placingDef || !!draggedFix;
        const compareFixtures = draggedFix
          ? placedFixtures.filter(f => f.id !== draggingId.current)
          : placedFixtures;
        return guideActive ? (
          <>
            <AlignmentGuides
              ghostX={guideX}
              ghostZ={guideZ}
              fixtures={compareFixtures}
              active
            />
            <SnapCrosshair x={guideX} z={guideZ} />
          </>
        ) : null;
      })()}

      {/* Invisible raycast floor */}
      <mesh
        rotation={[-Math.PI/2,0,0]}
        position={[limites.cx,0.005,limites.cz]}
        onDoubleClick={handleSceneDoubleClick}
        onPointerMove={e=>{
          e.stopPropagation();
          const cx=Math.max(limites.minX,Math.min(limites.maxX,snap(e.point.x)));
          const cz=Math.max(limites.minZ,Math.min(limites.maxZ,snap(e.point.z)));
          if(draggingId.current) {
            const id = draggingId.current;
            setPlacedFixtures(prev => {
              const dragged = prev.find(f => f.id === id);
              if (!dragged) return prev;
              // Block the move if it would overlap another fixture
              if (hasAABBCollision({x:cx, z:cz}, dragged, prev, id)) return prev;
              return prev.map(f => f.id === id ? {...f, x:cx, z:cz} : f);
            });
          } else {
            onFloorMove(cx,cz);
          }
        }}
        onPointerUp={e=>{
          if(draggingId.current){
            e.stopPropagation();
            draggingId.current=null;
            if(orbitRef.current) orbitRef.current.enabled=true;
          }
        }}
        onClick={e=>{
          e.stopPropagation();
          if(!draggingId.current){
            const cx=Math.max(limites.minX,Math.min(limites.maxX,snap(e.point.x)));
            const cz=Math.max(limites.minZ,Math.min(limites.maxZ,snap(e.point.z)));
            onFloorClick(cx,cz);
          }
        }}
      >
        <planeGeometry args={[limites.w+40,limites.d+40]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Placed fixtures. En la pantalla de venta (Presentar y la lámina) los
          muebles reciben la luz difusa del mismo cuarto que ilumina al
          producto (`luzDeVenta.ts`): sin ella el envase brillaba como una
          calcomanía sobre una maqueta grafito. */}
      <LuzDeVenta.Provider value={privadoPara !== undefined}>
      {placedFixtures.map(fix => {
        /* Los espacios internos, que es lo que de verdad se vende de una
           góndola o de una punta: cada uno tiene su proveedor, su valor y su
           vigencia. Los paneles se dibujan SÓLO sobre el mueble seleccionado.
           Encendidos en toda la planta, un local de cincuenta muebles queda
           cubierto de rectángulos de colores flotando y no se ve la tienda;
           encendidos en ninguno —que es como estuvo hasta ahora— el panel
           lateral dice «hacé clic en un slot del panel frontal» señalando algo
           que nunca se dibujó, y la ocupación por espacio no se podía marcar
           desde el 3D. */
        const hasSlots = fix.type === "gondola" || fix.type === "punta";
        // En Presentar no van: los colores de estado dicen qué está vendido y
        // qué no, y eso no es asunto del proveedor que mira.
        const conEspacios = hasSlots && fix.id === selectedId && !placingDef && !firstPerson && !presentationMode;
        return (
          <group key={fix.id} position={[fix.x,0,fix.z]} rotation={[0,fix.rotY,0]}>
            {/* El foco de la pantalla de venta: un boolean (ver `FocoDeVenta`). */}
            <FocoDeVenta.Provider value={conFoco.size === 0 || conFoco.has(fix.id)}>
            <FixtureMesh
              fixture={fix}
              neutro={privadoPara !== undefined}
              facePaint={facePaintById.get(fix.id) ?? null}
              selectedSlotId={conEspacios ? selectedSlotId : null}
              hoveredSlotId={conEspacios ? hoveredSlotId : null}
              onSlotClick={conEspacios ? (slotId) => onSelectSlot(fix.id, slotId) : undefined}
              onSlotHover={conEspacios ? setHoveredSlotId : undefined}
            />
            </FocoDeVenta.Provider>
            {fix.id===selectedId && !selectedSlotId && !presentationMode && <SelectionBox w={fix.w} d={fix.d} h={fix.h} />}
            {/* CHANGE 4 — Unauthorized placement badge (distance-gated + occluded) */}
            {/* En Presentar no: «sin contrato» es un dato de la tienda, no
                del proveedor que está mirando. */}
            {!presentationMode && (() => {
              const unifiedFix = unifiedById.get(fix.id);
              if (!unifiedFix) return null;
              const isUnauthorized =
                isRentable(unifiedFix) &&
                unifiedFix.status === "occupied" &&
                (!unifiedFix.supplierName || !unifiedFix.endDate || new Date(unifiedFix.endDate) < new Date());
              if (!isUnauthorized) return null;
              return <FixtureBadge x={fix.x} z={fix.z} h={fix.h} />;
            })()}
            {/* Hit volume */}
            <mesh
              position={[0, fix.h/2, hasSlots ? 0.03 : 0]}
              onDoubleClick={handleSceneDoubleClick}
              onPointerDown={e=>{
                if (firstPerson) return;
                e.stopPropagation();
                onSelectFixture(fix.id);
                // En Presentar se elige el mueble (las tomas del HUD son de
                // ése) pero no se arrastra: un clic de más en plena reunión
                // movería el plano de verdad.
                if (presentationMode) return;
                draggingId.current=fix.id;
                if(orbitRef.current) orbitRef.current.enabled=false;
              }}
              // El mueble se selecciona en `pointerdown`, pero el `click` que
              // viene después seguía bajando hasta el piso —que está detrás y
              // sí tiene onClick— y ahí `onFloorClick` hacía `setSelectedId(null)`.
              // O sea: un clic sobre un mueble lo seleccionaba y lo
              // deseleccionaba en el mismo gesto, y el panel comercial del 3D
              // no se abría nunca por ese camino. Cortar la propagación acá lo
              // arregla sin tocar ninguna de las dos puntas.
              //
              // Mientras se está COLOCANDO un mueble no se corta: ahí el clic
              // tiene que llegar al piso, que es quien detecta que se está
              // montando sobre otro y lo avisa.
              onClick={e=>{
                if (placingDef || firstPerson) return;
                e.stopPropagation();
              }}
              onPointerOver={e=>{
                e.stopPropagation();
                if (!draggingId.current && !placingDef && !firstPerson) {
                  const rect = gl.domElement.getBoundingClientRect();
                  onHoverFixture(fix.id, e.clientX - rect.left, e.clientY - rect.top - 16);
                }
              }}
              onPointerOut={e=>{
                e.stopPropagation();
                onHoverFixture(null, 0, 0);
              }}
              onPointerMove={e=>{
                if (!draggingId.current && !placingDef && !firstPerson) {
                  const rect = gl.domElement.getBoundingClientRect();
                  onHoverFixture(fix.id, e.clientX - rect.left, e.clientY - rect.top - 16);
                }
              }}
            >
              <boxGeometry args={[
                fix.w + (hasSlots ? 0.08 : 0.30),
                fix.h + 0.20,
                fix.d + (hasSlots ? 0.08 : 0.30),
              ]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
      </LuzDeVenta.Provider>

      {/* MEJORA 2: Ghost with collision overlay — only when not in first-person */}
      {ghostFixture && !firstPerson && (
        <group position={[ghostFixture.x,0,ghostFixture.z]} rotation={[0,ghostFixture.rotY,0]}>
          {ghostCollides && (
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[ghostFixture.w + 0.2, ghostFixture.d + 0.2]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          )}
          {!ghostCollides && (
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[ghostFixture.w + 0.1, ghostFixture.d + 0.1]} />
              <meshBasicMaterial color="#22c55e" transparent opacity={0.15} depthWrite={false} />
            </mesh>
          )}
          <FixtureMesh fixture={ghostFixture} ghost />
        </group>
      )}

      {/* MEJORA 6: Transform gizmo — only when not first-person and not placing */}
      {selectedId && !placingDef && !firstPerson && !presentationMode && (() => {
        const fix = placedFixtures.find(f => f.id === selectedId);
        return fix ? (
          <FixtureTransformControls
            fixture={fix}
            orbitRef={orbitRef}
            limites={limites}
            onMove={(id, x, z) => setPlacedFixtures(prev => {
              const dragged = prev.find(f => f.id === id);
              if (!dragged) return prev;
              if (hasAABBCollision({x, z}, dragged, prev, id)) return prev;
              return prev.map(f => f.id === id ? {...f, x, z} : f);
            })}
          />
        ) : null;
      })()}

      {/* MEJORA 8: First-person controls */}
      <FirstPersonControls
        orbitRef={orbitRef}
        active={firstPerson}
        fixtures={placedFixtures}
        limites={limites}
        onCamara={onCamaraFP}
        saltarA={saltarA}
      />

      {/* MEJORA 5: Screenshot capture */}
      <ScreenshotCapture onReady={screenshotReady} />

      {/* En Presentar (y mientras se sacan las tomas de la lámina) se deja
          acercar a medio metro: la toma «de cerca» está a 0,6–1 m del
          entrepaño, y con el mínimo de 4 m el primer giro de la rueda la
          mandaba al fondo del pasillo. En el editor, 1,2 m: con 4, «Encuadrar
          esta cara» —que es la toma «De frente», a 2 m de la cara— quedaba
          empujada a 4 m por los controles, y en un pasillo de 2 m eso es
          DETRÁS de la góndola de enfrente. */}
      {/* En el visor de Vender la órbita es local: ni arranca desde la cámara
          guardada del editor ni la escribe al girar (ver `soloVenta`). */}
      <CameraControls orbitRef={orbitRef} onReady={soloVenta ? undefined : handleOrbitReady}
        distanciaMinima={presentationMode || privadoPara !== undefined ? 0.5 : 1.2} />
    </>
  );
}

// ─── Persistence ──────────────────────────────────────────────────────────────

// ─── Store ↔ PlacedFixture adapters ──────────────────────────────────────────

/** Lo que las conversiones de `utils/convertirPlano.ts` necesitan del catálogo
 *  de este editor. */
const CATALOGO_3D: Catalogo3D = { defs: FIXTURE_DEFS, slotsPorDefecto: defaultSlots };

/**
 * Convert the unified store into the 3D internal array.
 * Filters out "exhibicion" fixtures (no 3D mesh representation).
 *
 * La conversión vive en `utils/convertirPlano.ts`; ésta le pone el catálogo
 * del 3D. Se exporta porque el visor de Vender dibuja con ella. La vuelta,
 * `fixturesToStore`, NO se exporta desde acá: arma el plano para escribirlo, y
 * el visor no escribe.
 */
export function storeToFixtures(unifiedList: UnifiedFixture[]): PlacedFixture[] {
  return delStoreAl3D(unifiedList, CATALOGO_3D);
}

// ─── El HUD de Presentar ──────────────────────────────────────────────────────

/** Cuánto tarda el HUD de Presentar en esconderse sin mover el mouse. */
const HUD_SE_ESCONDE_MS = 2000;

/**
 * La píldora de Presentar (De frente · Tres cuartos · De cerca · Salir), que
 * se esconde sola.
 *
 * Quieta, tapaba el producto en las tomas «De cerca» —la fila de abajo de
 * vasos, la base de la bolsa, la caja del medio— y por videollamada se leía
 * como una app. A los `HUD_SE_ESCONDE_MS` sin mover el mouse se va (opacidad
 * 0 y sin recibir clics, con transición), y el cursor con ella; vuelve con
 * cualquier movimiento o un toque.
 *
 * El temporizador es estado de ESTE componente, no del editor: un cambio
 * suyo re-renderiza sólo la píldora. Si viviera en el editor, cada vez que
 * se esconde o aparece se re-renderizaría la escena entera, y en una PC sin
 * placa de video eso es un cuadro de un segundo y medio.
 */
export function HudQueSeEsconde({ contenedor, className, children }: {
  contenedor: React.RefObject<HTMLElement>;
  className: string;
  children: React.ReactNode;
}) {
  const [escondido, setEscondido] = useState(false);
  useEffect(() => {
    let t = 0;
    const despertar = () => {
      // Mismo valor: React no re-renderiza.
      setEscondido(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setEscondido(true), HUD_SE_ESCONDE_MS);
    };
    despertar();
    window.addEventListener("mousemove", despertar, { passive: true });
    window.addEventListener("touchstart", despertar, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", despertar);
      window.removeEventListener("touchstart", despertar);
    };
  }, []);
  // El cursor se esconde con el HUD. Directo en el estilo del contenedor, sin
  // pasar por el render del editor (ver arriba).
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    el.style.cursor = escondido ? "none" : "";
    return () => { el.style.cursor = ""; };
  }, [escondido, contenedor]);
  return (
    <div data-hud-presentar data-hud-escondido={escondido || undefined}
      className={`${className} transition-opacity duration-300 ${escondido ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      {children}
    </div>
  );
}

// ─── CommercialPanel ──────────────────────────────────────────────────────────

interface CommercialPanelProps {
  fix:           PlacedFixture;
  /** En primera persona la cámara no se persiste: el bloque de vista lo avisa. */
  enCaminata:    boolean;
  catalogo:          Arte[];
  cargandoCatalogo:  boolean;
  prueba:            Map<string, number>;
  onProbar:          (fixtureId: string, cara: "A" | "B", arteId: number | null) => void;
  comoSePrueba:      Map<string, ComoSePrueba>;
  onAjustarPrueba:   (fixtureId: string, cara: "A" | "B", cambios: Partial<ComoSePrueba>) => void;
  proveedorDeReunion: string | null;
  onProveedorDeReunion: (proveedor: string | null) => void;
  onMostrar:         (fixtureId: string, cara: "A" | "B") => void;
  onRecargarCatalogo: () => void;
  /** El selector de productos abierto: vive en el editor porque la escena
   *  también lo mira (`pruebasDeLaReunion`). */
  eligiendo:         boolean;
  setEligiendo:      (abierto: boolean) => void;
  /** La cara abierta en «Vista para el proveedor» (ver `VistaProveedor`). */
  onCara?:           (fixtureId: string, cara: "A" | "B") => void;
  selectedSlot:  ShelfSlot | null;
  onUpdate:      (id:string, u:Partial<PlacedFixture>) => void;
  /** Todo el plano de la sede: sin los demás muebles no se puede decir si el
   *  nombre que se está escribiendo ya es de otro. */
  muebles:       PlacedFixture[];
  /** El nombre NO se escribe con `onUpdate`. Va por acá, que es el mismo camino
   *  que el doble clic del plano 2D y el campo de su panel: `renombrar`
   *  comprueba y escribe en la misma llamada. Null = se pudo. */
  onRenombrar:   (id:string, nombre:string) => RechazoDeNombre<PlacedFixture> | null;
  /** Los dos nombres a la vez, que es cómo se renumera una corrida a mano. */
  onIntercambiar:(esteId:string, otroId:string) => void;
  onUpdateSlot:  (fixtureId:string, slotId:string, u:Partial<ShelfSlot>) => void;
  onRotate:      () => void;
  onFlip:        () => void;
  onDelete:      () => void;
  onClose:       () => void;
  onSlotClose:   () => void;
}

function CommercialPanel({
  fix, enCaminata, catalogo, cargandoCatalogo, prueba, onProbar, onRecargarCatalogo,
  comoSePrueba, onAjustarPrueba, proveedorDeReunion, onProveedorDeReunion, onMostrar,
  eligiendo, setEligiendo, onCara,
  selectedSlot, onUpdate, muebles, onRenombrar, onIntercambiar, onUpdateSlot,
  onRotate, onFlip, onDelete, onClose, onSlotClose,
}: CommercialPanelProps) {
  const isAdmin = useAuthStore(selectIsAdmin);
  // Vender por partes: el mapa CRUDO de la base (vender un tramo no cambia el
  // mueble fusionado) para avisar si un espacio interno cae en un tramo o un
  // entrepaño con contrato.
  const estadoCrudo = useFixtureStore((s) => s.estadoComercial);
  const sedeDelPanel = useFixtureStore((s) => s.sede);
  // El nombre del modelo de una ficha propia llega cuando se leen las fichas
  // del supermercado: escucharlas vuelve a dibujar el panel.
  useFichasPropias();
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const u  = useCallback((up: Partial<PlacedFixture>) => onUpdate(fix.id, up), [fix.id, onUpdate]);
  const us = useCallback((up: Partial<ShelfSlot>) => selectedSlot && onUpdateSlot(fix.id, selectedSlot.id, up), [fix.id, selectedSlot, onUpdateSlot]);

  // ── Lo contratado, discreto mientras hay reunión ──────────────────────────
  // El selector pide tres letras del proveedor justamente porque se usa con
  // la pantalla compartida; pero detrás seguía legible «Bimbo · $1.500.000 /
  // mes · hasta 2027-06-30» mientras se le probaba la góndola a Kellogg's. Con
  // una prueba puesta, un proveedor de reunión fijado o el selector abierto,
  // el bloque dice sólo «Ocupado hasta jun 2027»; el detalle, con un clic.
  const [verContrato, setVerContrato] = useState(false);
  useEffect(() => { setVerContrato(false); }, [fix.id]);
  const enReunion = hayReunion({ pruebas: prueba.size, proveedorDeReunion, eligiendo });
  useEffect(() => { if (eligiendo) setVerContrato(false); }, [eligiendo]);
  const contratoDiscreto = enReunion && !verContrato;

  const sm  = STATUS_META[fix.status];
  const def = FIXTURE_DEFS.find(d=>d.type===fix.type && (fix.type!=="gondola"||d.gondolaType===fix.gondolaType)) ?? FIXTURE_DEFS[0];
  const modeloDelMueble = modeloPorId(fix.modelo);
  // Infrastructure holds no contract: the commercial half of the panel hides.
  const rentable = isRentable(fix);

  const inputCls = "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3 transition-colors";
  const labelCls = ETIQUETA_CLS;

  // ── El nombre del mueble ──────────────────────────────────────────────────
  // El editor 3D no tenía cómo renombrar: mostraba el nombre y punto, así que
  // para cambiarlo había que ir al plano 2D. Ahora se puede desde acá y pasa por
  // la MISMA regla —`renombrar`—, que es el punto: que no haya un tercer camino
  // que escriba sin comprobar, como pasó con el campo del panel del 2D.
  const [nombreBorrador, setNombreBorrador] = useState(fix.code);
  const [rechazo, setRechazo] = useState<RechazoDeNombre<PlacedFixture> | null>(null);
  useEffect(() => { setNombreBorrador(fix.code); setRechazo(null); }, [fix.id, fix.code]);
  const choqueEscrito = useMemo(
    () => (normalizarNombre(nombreBorrador) === normalizarNombre(fix.code)
      ? null
      : choqueDeNombre(nombreBorrador, muebles, fix.id)),
    [nombreBorrador, muebles, fix.id, fix.code],
  );
  function guardarNombre() {
    const r = onRenombrar(fix.id, nombreBorrador);
    setRechazo(r);
    if (!r) setNombreBorrador(normalizarNombre(nombreBorrador));
  }

  // ── Retirar el mueble de circulación, o devolverlo ────────────────────────
  // Va a la BASE y no al plano. Acá se escribía `status` en el JSON del layout:
  // era una segunda copia del mismo hecho, sin nada que la obligara a coincidir
  // con `spaces`, y desde que el servidor la descarta al guardar el select se
  // veía cambiar sin cambiar nada. Un control que miente es peor que no tenerlo.
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [estadoError, setEstadoError] = useState("");

  async function cambiarEstado(nuevo: SpaceStatus) {
    // La sede del MUEBLE, no la abierta: un plano copiado de otra tienda dibuja
    // muebles que no son de ésta, y el código del espacio lleva la suya.
    const st = useFixtureStore.getState();
    const propio = st.fixturesBySede[st.sede]?.find((f) => f.id === fix.id);
    const sedeDelMueble = propio?.sede || st.sede;
    setEstadoError("");
    setGuardandoEstado(true);
    try {
      const espacio = await findOrCreateSpace({
        code: fullSpaceCode(sedeDelMueble, fix.code),
        name: fix.code,
        sede: sedeDelMueble,
      });
      await updateSpaceStatus(espacio.id, nuevo);
      // El mapa se pinta de la base: se vuelve a leer y aparece solo.
      await useFixtureStore.getState().refrescarComercial();
    } catch {
      setEstadoError("No se pudo guardar el estado. Probá de nuevo.");
    } finally {
      setGuardandoEstado(false);
    }
  }

  function handleSlotStatusChange(newStatus: SpaceStatus) {
    if (!selectedSlot) return;
    if (selectedSlot.status==="occupied" && newStatus==="free") {
      if (!confirm("¿Estás seguro de liberar este espacio ocupado?")) return;
    }
    us({ status: newStatus });
  }

  if (selectedSlot) {
    // Vender por partes: un mueble que se vende por tramos o por entrepaños
    // vende lo suyo con contrato, en Vender. Un espacio interno marcado
    // vendido acá no tiene contrato, y la misma repisa se podría vender dos
    // veces sin que el servidor lo vea: en ese mueble no se marca uno NUEVO
    // como vendido (el que ya estaba marcado se puede liberar, y se avisa).
    const divisionDelMueble = divisionDe(fix);
    const porPartes = !!divisionDelMueble && (divisionDelMueble.clase === "tramos" || divisionDelMueble.clase === "entrepanos");
    const claseDelMueble = divisionDelMueble ? claseDe(divisionDelMueble.clase) : undefined;
    const pisaConContrato = porPartes
      ? partesQuePisa(fix, selectedSlot, isDoubleGondola(fix) ? ["A", "B"] : ["A"])
        .filter(({ cara, parte }) => estadoCrudo[fullSpaceCode(sedeDelPanel, codigoDeParte(fix.code, cara, parte))]?.status === "occupied")
        .map(({ cara, parte }) => codigoVisibleDe("", cara, isDoubleGondola(fix), parte).replace(/^·/, ""))
      : [];
    const noSeMarcaVendido = porPartes && selectedSlot.status === "free";
    const slotSm   = STATUS_META[selectedSlot.status];
    const slotDays = computeDays(selectedSlot.startDate, selectedSlot.endDate);
    const slotStatusBorder = selectedSlot.status === "occupied" ? "border-l-4 border-danger" : selectedSlot.status === "reserved" ? "border-l-4 border-warning" : "border-l-4 border-accent";
    const slotSelectBorder = selectedSlot.status === "occupied" ? "border-danger/50" : selectedSlot.status === "reserved" ? "border-warning/50" : "border-success/50";
    return (
      <div className={`flex w-64 flex-shrink-0 flex-col overflow-y-auto border-l border-dark-line bg-dark-surface ${slotStatusBorder}`}>
        <div className="flex items-center gap-2 border-b border-dark-line p-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/20 text-xs font-mono font-bold text-accent-200">S</div>
          <div className="min-w-0 flex-1">
            <span className="bg-dark-bg rounded px-2 py-0.5 text-[10px] font-mono text-accent-200">{selectedSlot.id}</span>
            <p className="text-xs font-bold text-dark-ink-1 mt-0.5">Slot — {nombreDeMueble(fix)}</p>
          </div>
          <button onClick={onSlotClose} className="text-dark-ink-3 hover:text-dark-ink-1" title="Volver al fixture">
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-dark-line px-3 py-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${slotSm.bg} ${slotSm.text}`}>
            {slotSm.label}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className={labelCls}>Estado del slot</label>
            <select value={selectedSlot.status} onChange={e=>handleSlotStatusChange(e.target.value as SpaceStatus)}
              className={`w-full rounded border ${slotSelectBorder} bg-dark-bg px-2 py-1 text-xs text-dark-ink-1 focus:outline-none`}>
              <option value="free">Disponible</option>
              <option value="occupied" disabled={noSeMarcaVendido}>Ocupado</option>
              <option value="reserved" disabled={noSeMarcaVendido}>Reservado</option>
            </select>
            {porPartes && claseDelMueble && (
              <p className="mt-1 text-[10px] leading-snug text-dark-ink-3" data-slot-por-partes>
                Este mueble se vende por {claseDelMueble.plural}: lo que se vende de él va con contrato, en Vender.
                {noSeMarcaVendido ? " Un espacio interno nuevo no se marca vendido acá." : " Éste ya estaba marcado: se puede liberar."}
              </p>
            )}
            {pisaConContrato.length > 0 && (
              <p className="mt-1 text-[10px] leading-snug text-warning" data-slot-pisa-parte>
                Cae en {pisaConContrato.join(", ")}, que {pisaConContrato.length === 1 ? "tiene" : "tienen"} contrato.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}><Building2 size={9} className="inline mr-1"/>Proveedor</label>
            <input type="text" value={selectedSlot.supplierName} placeholder="Nombre del proveedor"
              onChange={e => {
                us({ supplierName: e.target.value });
                // Escribir un proveedor lo marcaba ocupado; en un mueble que
                // se vende por partes, no (se vende en Vender).
                if (e.target.value && selectedSlot.status==="free" && !noSeMarcaVendido)
                  us({ status:"occupied", supplierName: e.target.value });
              }} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}><Tag size={9} className="inline mr-1"/>Categoría</label>
            <input type="text" value={selectedSlot.brandCategory||""} placeholder="Marca / rubro"
              onChange={e=>us({brandCategory:e.target.value})} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}><DollarSign size={9} className="inline mr-1"/>Valor (COP/mes)</label>
            <input type="number" min={0} value={selectedSlot.negotiatedValue||""}
              onChange={e=>us({negotiatedValue:parseFloat(e.target.value)||0})}
              className={`${inputCls} ${selectedSlot.negotiatedValue > 0 ? "text-success text-base font-bold" : ""}`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}><Calendar size={9} className="inline mr-1"/>Inicio</label>
              <input type="date" value={selectedSlot.startDate||""}
                onChange={e=>us({startDate:e.target.value})} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fin</label>
              <input type="date" value={selectedSlot.endDate||""}
                onChange={e=>us({endDate:e.target.value})} className={inputCls} />
            </div>
          </div>

          {slotDays > 0 && (
            <p className="text-center text-[10px] text-dark-ink-2">
              <span className="font-bold text-accent-200">{slotDays}</span> días en el espacio
            </p>
          )}

          <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-2 font-mono text-[10px] text-dark-ink-3">
            {selectedSlot.id}
          </div>
        </div>
      </div>
    );
  }

  const days = computeDays(fix.startDate, fix.endDate);

  let progressPct = 0;
  let daysLeft    = 0;
  let progressColor = "bg-success";
  if (fix.startDate && fix.endDate) {
    const start    = new Date(fix.startDate).getTime();
    const end      = new Date(fix.endDate).getTime();
    const now      = Date.now();
    const total    = end - start;
    const elapsed  = now - start;
    progressPct    = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
    daysLeft       = Math.max(0, Math.ceil((end - now) / 86_400_000));
    if (progressPct > 90) progressColor = "bg-danger";
    else if (progressPct > 70) progressColor = "bg-warning";
  }
  const daysLeftColor = progressPct > 90 ? "text-danger" : progressPct > 70 ? "text-warning" : "text-success";

  return (
    <div className="flex w-64 flex-shrink-0 flex-col overflow-y-auto border-l border-dark-line bg-dark-surface"
      style={{ borderLeftWidth: "4px", borderLeftColor: rentable ? STATUS_COLORS[fix.status] : NON_RENTABLE_COLOR }}>

      <div className="flex items-center gap-2 border-b border-dark-line p-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-dark-surface-2 flex-shrink-0">
          {def.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-dark-ink-1">{conNombrePropio(fix, nombresPropios, fix.label)}</p>
          <p className="font-mono text-[10px] text-dark-ink-3">{nombreDeMueble(fix)}</p>
          {/* La ficha de la que nació, si nació de una: su nombre y, si sus
              medidas son una deducción, «≈». Lo guardado en el mueble no se
              relee de la ficha; esto es sólo el nombre. */}
          {modeloDelMueble && (
            <p className="truncate text-[10px] text-dark-ink-2" data-modelo={modeloDelMueble.id}
              title={textoDeFuente(modeloDelMueble)}>
              {nombreDeModelo(modeloDelMueble)}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-dark-ink-3 hover:text-dark-ink-1"><X size={14}/></button>
      </div>

      <div className="flex items-center gap-2 border-b border-dark-line px-3 py-2">
        {rentable ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 ${sm.bg} ${sm.text}`}>
            {fix.status === "occupied" && <span className="animate-pulse inline-block w-2 h-2 rounded-full mr-0.5" style={{ background: STATUS_COLORS[fix.status] }}/>}
            {sm.label}
          </span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(100,116,139,0.18)", color: "#94A3B8" }}>
            No comercializable
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={onRotate} title="Rotar 90° (R)"
            className="rounded border border-dark-line-2 bg-dark-surface-2 p-1 text-dark-ink-2 hover:bg-dark-line hover:text-dark-ink-1 active:scale-90 transition-transform duration-100">
            <RotateCw size={11}/>
          </button>
          <button onClick={onFlip} title="Flip (F)"
            className="rounded border border-dark-line-2 bg-dark-surface-2 p-1 text-dark-ink-2 hover:bg-dark-line hover:text-dark-ink-1 active:scale-90 transition-transform duration-100">
            <FlipHorizontal2 size={11}/>
          </button>
          <button onClick={onDelete} title="Eliminar (Del)"
            className="rounded border border-danger/40 bg-danger/10 p-1 text-danger hover:bg-danger/25 active:scale-90 transition-all duration-100">
            <Trash2 size={11}/>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">

        {/* Nombre — el del mueble, que es su código. Uno solo, y el mismo que
            dibuja el plano 2D, la pantalla de montaje y la lámina. */}
        <div>
          <p className={labelCls}>Nombre</p>
          <input
            className={inputCls}
            value={nombreBorrador}
            style={choqueEscrito ? { color: "var(--danger)", borderBottomColor: "var(--danger)" } : undefined}
            onChange={e => { setNombreBorrador(e.target.value); setRechazo(null); }}
            onBlur={guardarNombre}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); guardarNombre(); }
              if (e.key === "Escape") { setNombreBorrador(fix.code); setRechazo(null); }
            }}
          />
          {rechazo ? (
            <>
              <p className="mt-1 text-[11px] leading-snug text-danger">
                No se guardó: {textoDelChoque(nombreBorrador, rechazo, (m) => conNombrePropio(m, nombresPropios, ""))} Sigue
                llamándose «{fix.code}».
              </p>
              {rechazo.razon === "ocupado" && (
                <>
                  <button
                    onClick={() => { onIntercambiar(fix.id, rechazo.ocupa.id); setRechazo(null); }}
                    className="mt-1.5 rounded border border-danger/50 bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger hover:bg-danger/20"
                  >
                    Intercambiar con ese mueble
                  </button>
                  <p className="mt-1 text-[11px] leading-snug text-dark-ink-3">
                    {textoDelIntercambio(fix, rechazo.ocupa)}
                  </p>
                </>
              )}
            </>
          ) : choqueEscrito ? (
            <p className="mt-1 text-[11px] leading-snug text-danger">
              {textoDelChoque(nombreBorrador, choqueEscrito, (m) => conNombrePropio(m, nombresPropios, ""))}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-dark-ink-3">
              Es el nombre y es la llave: con él se arma{" "}
              {fullSpaceCode(useFixtureStore.getState().sede, fix.code)} y con eso viaja
              al contrato y al correo de montaje.
            </p>
          )}
        </div>

        {fix.slots && fix.slots.length > 0 && (
          <div className="rounded border border-dark-line bg-dark-bg/40 p-2">
            <p className="mb-1.5 text-[10px] font-semibold text-dark-ink-3">Slots internos</p>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {(["free","occupied","reserved"] as SpaceStatus[]).map(s=>{
                const cnt = fix.slots!.filter(sl=>sl.status===s).length;
                if (!cnt) return null;
                const sm2 = STATUS_META[s];
                return (
                  <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sm2.bg} ${sm2.text}`}>
                    {cnt} {sm2.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
            <p className="mt-1 text-[9px] text-dark-ink-3 italic">Hacé clic en un slot del panel frontal para editarlo</p>
          </div>
        )}

        {/* Destino del mueble. Cuando el TIPO ya lo decide —columna, caja
            registradora, servicio al cliente: puestos de trabajo de la tienda—
            el par de botones sería un control muerto: se pintaría el elegido y
            `isRentable` lo seguiría negando. En su lugar va la razón. */}
        <div>
          <label className={labelCls}>Destino del mueble</label>
          {NUNCA_ALQUILABLE.has(fix.type) ? (
            <p className="text-[11px] font-semibold text-dark-ink-2">No comercializable</p>
          ) : (
            <div className="flex gap-1.5">
              {([true, false] as const).map((value) => (
                <button
                  key={String(value)}
                  onClick={() => u({ rentable: value })}
                  className={`flex-1 rounded px-1 py-1.5 text-[10.5px] font-semibold transition-colors ${
                    rentable === value
                      ? "bg-accent text-accent-ink"
                      : "border border-dark-line-2 text-dark-ink-3 hover:text-dark-ink-1"
                  }`}
                >
                  {value ? "Comercializable" : "No comercial."}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-dark-ink-3">
            {NUNCA_ALQUILABLE.has(fix.type)
              ? textoDeLoQueNuncaSeAlquila(fix.type)
              : rentable
              ? "Se puede alquilar y cuenta en la disponibilidad de la sede."
              : "Mobiliario propio del local: no admite contrato y queda fuera de la ocupación."}
          </p>
        </div>

        {rentable && (
        <div>
          <label className={labelCls}><Info size={9} className="inline mr-1"/>Estado fixture</label>
          {/* «Ocupado» no está entre las opciones y es a propósito: un espacio
              se ocupa vendiéndolo, en Sede → Vender. Ponerlo a mano crearía un
              ocupado sin contrato, sin proveedor y sin fechas — el fantasma
              exacto que todo esto vino a eliminar. */}
          {fix.status === "occupied" ? (
            <p className="text-xs text-dark-ink-1">
              Ocupado
              <span className="mt-0.5 block text-[10px] text-dark-ink-3">
                Lo pone el contrato. Para liberarlo hay que cancelarlo.
              </span>
            </p>
          ) : (
            <select value={fix.status} disabled={guardandoEstado}
              onChange={e=>void cambiarEstado(e.target.value as SpaceStatus)}
              className="w-full rounded border border-dark-line-2 bg-dark-bg px-2 py-1 text-xs text-dark-ink-1 focus:border-accent focus:outline-none">
              <option value="free">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="maintenance">Mantenimiento</option>
            </select>
          )}
          {estadoError && (
            <p className="mt-1 text-[10px] text-danger">{estadoError}</p>
          )}
        </div>
        )}

        {rentable && (<>

        {/* Lo contratado, de sólo lectura. El editor 3D es de diseño: las artes,
            las dimensiones, dónde va cada mueble. El contrato se hace en
            Sede → Vender, que es donde está el mapa con la disponibilidad del
            periodo. Antes se podía llenar acá, en el plano 2D y en Sede: tres
            lugares para lo mismo, y los de acá creaban un contrato nuevo cada
            vez que se tocaba el botón en vez de editar el que había. */}
        <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-3" data-contratado>
          <p className={labelCls}><Building2 size={9} className="inline mr-1"/>Contratado</p>
          {fix.supplierName && contratoDiscreto ? (
            <>
              <p className="text-xs text-dark-ink-2" data-contrato-discreto>
                {fix.endDate ? `Ocupado hasta ${mesYAnio(fix.endDate)}` : "Ocupado"}
              </p>
              <button
                onClick={() => setVerContrato(true)}
                className="mt-1 text-[10px] text-dark-ink-3 underline-offset-2 hover:text-dark-ink-1 hover:underline"
              >
                Ver contrato
              </button>
            </>
          ) : fix.supplierName ? (
            <>
              <p className="text-sm font-semibold text-dark-ink-1">{fix.supplierName}</p>
              {fix.brandCategory && (
                <p className="text-xs text-dark-ink-2 mt-0.5">{fix.brandCategory}</p>
              )}
              {fix.startDate && fix.endDate && (
                <>
                  <p className="mt-1.5 font-mono text-[11px] text-dark-ink-2">
                    {fix.startDate} → {fix.endDate}
                  </p>
                  {days > 0 && (
                    <>
                      <div className="mt-1.5 h-1.5 rounded-full bg-dark-surface-2">
                        <div className={`rounded-full h-full transition-all ${progressColor}`} style={{ width: `${progressPct}%` }} />
                      </div>
                      <p className={`mt-1 text-[10px] ${daysLeftColor}`}>{daysLeft} días restantes</p>
                    </>
                  )}
                </>
              )}
              {isAdmin && fix.negotiatedValue > 0 && (
                <p className="mt-2 font-mono text-sm font-bold text-success">
                  ${fix.negotiatedValue.toLocaleString()} / mes
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-dark-ink-3">Sin contrato activo.</p>
          )}
          {isAdmin && (
            <p className="mt-2 text-[10px] leading-relaxed text-dark-ink-3">
              Los contratos se hacen en <b className="text-dark-ink-2">Sede → Vender</b>, sobre el mapa.
            </p>
          )}
        </div>

        <VistaProveedor
          fix={fix}
          enCaminata={enCaminata}
          catalogo={catalogo}
          cargandoCatalogo={cargandoCatalogo}
          prueba={prueba}
          onProbar={onProbar}
          onRecargarCatalogo={onRecargarCatalogo}
          comoSePrueba={comoSePrueba}
          onAjustarPrueba={onAjustarPrueba}
          proveedorDeReunion={proveedorDeReunion}
          onProveedorDeReunion={onProveedorDeReunion}
          onMostrar={onMostrar}
          eligiendo={eligiendo}
          setEligiendo={setEligiendo}
          onCara={onCara}
        />

        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea rows={2} value={fix.observation} placeholder="Notas…"
            onChange={e=>u({observation:e.target.value})} className={`${inputCls} resize-none`} />
        </div>
        </>)}

        {/* Alto, entrepaños y módulo (góndola y punta). El mismo componente
            que el plano 2D: escribe en el store después de revisar lo vendido
            —con espacios internos vendidos no cambia la cantidad de
            entrepaños; con una cara vendida, pregunta diciendo qué se mueve—.
            Ver `components/GeometriaDelMueble.tsx`. */}
        <GeometriaDelMueble id={fix.id} puedeEditar={isAdmin} />
        {/* Cómo se vende: la nevera entera o por puertas, el mural por
            tramos, la góndola por entrepaños, las bahías de la caja y el
            forro de la columna. El mismo componente que el plano 2D, fuera de
            lo comercial del panel (la caja no es comercializable). */}
        <PartesDelMueble id={fix.id} puedeEditar={isAdmin} />

        <div className="rounded-lg border border-dark-line/50 bg-dark-bg/60 p-2 font-mono text-[10px] text-dark-ink-3">
          {/* Las medidas al milímetro, como la paleta y el panel del plano: con
              `toFixed(1)` la nevera de 144,5 × 74 cm de la ficha decía «1.4 ×
              0.7», y quien acababa de escribirla en el taller veía otra. El
              `+` quita los ceros de más y el ruido de coma flotante. */}
          <p>{+fix.w.toFixed(3)} × {+fix.d.toFixed(3)} × {+fix.h.toFixed(3)} m</p>
          <p>pos ({fix.x.toFixed(1)}, {fix.z.toFixed(1)}) · {Math.round(((fix.rotY*180/Math.PI)%360+360)%360)}°</p>
          {fix.gondolaType && <p className="font-mono uppercase">{fix.gondolaType}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Canvas error boundary ────────────────────────────────────────────────────

export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 12, color: "var(--ink-2)",
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Error en el editor 3D</span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "1px solid var(--line)",
              background: "var(--surface-2)", cursor: "pointer", fontSize: 13,
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StoreEditor3D() {
  // Las geometrías de los perfiles se cachean por firma y viven en la GPU.
  // Sin soltarlas al desmontar, entrar y salir del editor de varias sedes deja
  // una copia de cada mueble de cada sede en memoria de video.
  useEffect(() => olvidarGeometrias, []);
  // Y las etiquetas del producto de prueba: texturas de hasta 1024 px.
  useEffect(() => olvidarEtiquetas, []);
  useEffect(() => olvidarCopetes, []);

  // ── Unified store (read once on mount; write on every change) ────────────────
  // Selectores, y no el store entero: la órbita escribe la cámara en el store
  // en cada paso de un arrastre, y suscripto a todo el editor se volvía a
  // renderizar entero —panel, escena y cada mueble— veinte veces por giro.
  // Cada vuelta le pedía a la escena un cuadro más (`invalidate` acumula), y
  // en una máquina lenta un giro a mano encolaba medio minuto de cuadros.
  const pushToStore = useFixtureStore((s) => s.setFixtures);
  const pushSedeToStore = useFixtureStore((s) => s.setSede);
  const commit = useFixtureStore((s) => s.commit);
  const undo = useFixtureStore((s) => s.undo);
  const redo = useFixtureStore((s) => s.redo);
  // Reactive subscription — re-renders when fixtures change (replaces getState() calls in JSX)
  const fixtures = useFixtureStore(selectFixtures);

  const [placedFixtures, setPlacedFixtures] = useState<PlacedFixture[]>(() =>
    storeToFixtures(selectFixtures(useFixtureStore.getState()))
  );
  const [selectedId, setSelectedId]         = useState<string|null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string|null>(null);
  const [hoveredSlotId, setHoveredSlotId]   = useState<string|null>(null);
  const [placingDef, setPlacingDef]         = useState<FixtureDef|null>(null);
  // La paleta: los modelos de RECABRA y, después, las fichas propias del
  // supermercado que no están retiradas. Una vez por cambio de las fichas: la
  // entrada elegida se compara por identidad.
  const fichasPropias = useFichasPropias();
  const paleta = useMemo(() => paletaConPropias(fichasPropias), [fichasPropias]);
  // El nombre propio de cada familia: la paleta lo dice en vez del de RECABRA,
  // y también el cartel del mouse, el aviso de «Colocando» y la lámina.
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  const [ghostX, setGhostX]                 = useState(STORE_W/2);
  const [ghostZ, setGhostZ]                 = useState(STORE_D/2);
  const [ghostRotY, setGhostRotY]           = useState(0);
  const [ghostCollides, setGhostCollides]   = useState(false);
  const [savedAt, setSavedAt]               = useState<Date|null>(null);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [warning, setWarning]               = useState<string|null>(null);
  const [sede, setSede]                     = useState(()=>useFixtureStore.getState().sede);

  // MEJORA 4: Presentation mode
  const [presentationMode, setPresentationMode] = useState(false);

  // ── Presentar ocupa la pantalla entera ────────────────────────────────────
  // Por videollamada se veía una app: la barra de RECABRA (Sede, Montajes,
  // Plano, el usuario, «Sincronizado») arriba y el lienzo con su marco de
  // esquinas redondeadas. En Presentar el contenedor pasa a `fixed inset-0`
  // —tapa la barra aunque el navegador niegue la pantalla completa— y además
  // se pide la pantalla completa del navegador.
  const contenedorRef = useRef<HTMLDivElement>(null);
  /** Pide la pantalla completa. Va DENTRO del manejador del clic: el
   *  navegador sólo la da con un gesto del usuario, y después de un `await`
   *  o en un efecto la niega. Si la niega queda el `fixed`, que ya tapa la
   *  barra. */
  const pedirPantallaCompleta = useCallback(() => {
    const el = contenedorRef.current;
    if (!el || document.fullscreenElement || typeof el.requestFullscreen !== "function") return;
    el.requestFullscreen().catch(() => { /* la negó: queda el fixed */ });
  }, []);
  // La salida, en UN solo lugar: cualquier camino que apague Presentar
  // («Salir», el botón de la barra, Esc, el desmontaje del editor) suelta la
  // pantalla completa. Atarla a cada botón dejaba caminos sin cubrir.
  useEffect(() => {
    if (!presentationMode) return;
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ya salió */ });
    };
  }, [presentationMode]);
  // Y al revés, salir de la pantalla completa NO apaga Presentar. Antes sí
  // (un `fullscreenchange` sin elemento lo apagaba), pero Chrome y Edge sacan
  // de pantalla completa a la pestaña que deja de estar al frente: la dueña
  // en Presentar hacía Ctrl+Tab para ir a Meet a mirar al proveedor —o a
  // apretar «Compartir», como aconseja ESTADO.md— y la pestaña compartida
  // pasaba a mostrar el editor, con el panel y las fotos de las caras de
  // otros proveedores. El `fixed inset-0` ya tapa la barra; el HUD ofrece
  // volver a la pantalla completa, y un segundo Esc (que ahora sí llega a la
  // página) sale de Presentar. Filtrar por `visibilityState` no alcanzaba:
  // el `fullscreenchange` llega ANTES que el `visibilitychange`.
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  // Antes y después: apagar las artes muestra el espacio como está hoy, que es
  // contra lo que el proveedor compara su marca puesta.
  const [sinArte, setSinArte] = useState(false);

  // ── El producto que se está probando ──────────────────────────────────────
  // Vive en la sesión y NO en el layout, a propósito. El layout es lo que está
  // montado de verdad: si probar un producto lo escribiera ahí, la góndola que
  // Nutresa tiene alquilada aparecería con producto de Alpina en la pantalla de
  // todos, y el 3D dejaría de servir para saber qué hay puesto en la tienda.
  // Acá se prueban tres ubicaciones en una reunión y al cerrar no queda nada.
  const [prueba, setPrueba] = useState<Map<string, number>>(new Map());
  const [catalogo, setCatalogo] = useState<Arte[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);

  // Si la recarga falla (después de «Guardar medidas», con Render
  // despertando) se queda el catálogo que había: vaciarlo dejaba sin arte a
  // todas las caras probadas a mitad de la reunión.
  const recargarCatalogo = useCallback(() => {
    setCargandoCatalogo(true);
    listarCatalogo()
      .then(setCatalogo)
      .catch(() => { /* se queda el catálogo anterior */ })
      .finally(() => setCargandoCatalogo(false));
  }, []);
  useEffect(recargarCatalogo, [recargarCatalogo]);

  // CÓMO se prueba, al lado y con la misma clave: en qué entrepaños y si va
  // acostada. Es un mapa aparte y no un cambio de forma de `prueba` porque a
  // ése lo leen la vista del proveedor, la lámina y los tipos de varios
  // componentes. Tampoco va al layout.
  const [comoSePrueba, setComoSePrueba] = useState<Map<string, ComoSePrueba>>(new Map());

  const probarProducto = useCallback(
    (fixtureId: string, cara: "A" | "B", arteId: number | null) => {
      setPrueba(prev => {
        const siguiente = new Map(prev);
        // Mapa nuevo y no mutación: el memo de materiales compara por
        // identidad, y mutar el mismo Map no repinta nada.
        if (arteId == null) siguiente.delete(`${fixtureId}|${cara}`);
        else siguiente.set(`${fixtureId}|${cara}`, arteId);
        return siguiente;
      });
      // Un producto nuevo arranca en «Toda la cara» y parado: es lo que se
      // muestra primero, y siempre está a un clic.
      setComoSePrueba(prev => {
        const siguiente = new Map(prev);
        if (arteId == null) siguiente.delete(`${fixtureId}|${cara}`);
        else siguiente.set(`${fixtureId}|${cara}`, { donde: "todas" });
        return siguiente;
      });
    },
    [],
  );

  const ajustarPrueba = useCallback(
    (fixtureId: string, cara: "A" | "B", cambios: Partial<ComoSePrueba>) => {
      setComoSePrueba(prev => {
        const siguiente = new Map(prev);
        const clave = `${fixtureId}|${cara}`;
        siguiente.set(clave, { donde: "todas", ...prev.get(clave), ...cambios });
        return siguiente;
      });
    },
    [],
  );

  // El proveedor con el que se está reunido. Con él fijado, el selector de
  // productos muestra SÓLO los suyos: la pantalla se comparte, y el catálogo
  // entero es la lista de clientes de la tienda.
  const [proveedorDeReunion, setProveedorDeReunion] = useState<string | null>(null);

  // Para quién es la pantalla de venta (`muebles/privacidad.ts`). Lo fija
  // «Mostrar al proveedor» con el dueño del producto que se va a encuadrar, o
  // el botón «Presentar» con el del mueble elegido o el de la reunión. En
  // Presentar se dibuja SÓLO lo suyo: la sesión acumula pruebas de varios
  // proveedores, y el que mira no puede ver las de sus competidores.
  const [proveedorEnPantalla, setProveedorEnPantalla] = useState<number | null>(null);
  // Lo mismo para la lámina que se descarga, mientras se sacan sus dos tomas.
  // `undefined` = no se está armando ninguna.
  const [laminaPara, setLaminaPara] = useState<PrivadoPara>(undefined);
  const privadoPara: PrivadoPara = laminaPara !== undefined
    ? laminaPara
    : presentationMode ? proveedorEnPantalla : undefined;
  // En la pantalla de la DUEÑA, con una reunión fijada, se dibujan sólo las
  // pruebas de ese proveedor (`pruebasDeLaReunion`): se comparte la pantalla
  // sin haber apretado «Presentar», y le probaba el arroz a Diana con los
  // vasos de Alpina de la mañana al lado. En Presentar y en la lámina ya
  // filtra `privadoPara`.
  const supplierDeReunion = useMemo(
    () => supplierPorNombre(proveedorDeReunion, catalogo), [proveedorDeReunion, catalogo],
  );
  // El selector de productos abierto. Vivía adentro del panel, pero la
  // escena también lo tiene que saber: con el selector abierto y sin
  // proveedor (recién apretado «Cambiar de proveedor») no se dibuja ninguna
  // prueba (`pruebasDeLaReunion`). Se cierra solo si el panel se va —otro
  // mueble, ninguno, o Presentar—: el selector vive adentro del panel, y un
  // `eligiendo` huérfano dejaría el editor sin pruebas.
  const [eligiendo, setEligiendo] = useState(false);
  useEffect(() => { setEligiendo(false); }, [selectedId, presentationMode]);
  // Con el selector abierto y el proveedor de la reunión fijado, sus artes
  // (los únicos que el selector lista) se preparan de antemano: el recorte en
  // el worker, las texturas en la GPU. Elegir uno ya no traba la pantalla.
  useEffect(() => {
    if (!eligiendo || !proveedorDeReunion) return;
    precalentarEtiquetas(catalogo.filter((a) => a.proveedor === proveedorDeReunion));
  }, [eligiendo, proveedorDeReunion, catalogo]);
  // Las pruebas de los muebles que siguen en el plano (`pruebasDelPlano`): una
  // prueba en un mueble borrado mantenía la reunión abierta para siempre y
  // «Mostrarla» encuadraba un mueble que ya no existe.
  const idsDelPlano = useMemo(() => new Set(placedFixtures.map(f => f.id)), [placedFixtures]);
  const pruebaViva = useMemo(() => pruebasDelPlano(prueba, idsDelPlano), [prueba, idsDelPlano]);
  const fijada = reunionFijada(proveedorDeReunion);
  const pruebaEnEscena = useMemo(
    () => (privadoPara !== undefined ? prueba : pruebasDeLaReunion(prueba, catalogo, supplierDeReunion, eligiendo, fijada)),
    [privadoPara, prueba, catalogo, supplierDeReunion, eligiendo, fijada],
  );
  // La reunión en curso, con la misma cuenta que el panel y el cartel.
  const enReunion = hayReunion({ pruebas: pruebaViva.size, proveedorDeReunion, eligiendo });
  /** «Terminar la reunión»: la reunión no terminaba nunca —el proveedor de la
   *  reunión sólo volvía a `null` con un botón escondido en el selector—, y
   *  hasta recargar el cartel y el bloque «Contratado» escondían los datos de
   *  TODOS los contratos. Suelta al proveedor y quita las pruebas de la
   *  sesión: la tienda vuelve a verse como está. Nada de esto estaba en el
   *  plano, así que no hay nada que deshacer en el layout. */
  const terminarReunion = useCallback(() => {
    setProveedorDeReunion(null);
    setPrueba(new Map());
    setComoSePrueba(new Map());
    setEligiendo(false);
  }, []);
  /** Al borrar un mueble se sueltan sus pruebas (no hay panel desde donde
   *  quitarlas). */
  const soltarPruebasDe = useCallback((fixtureId: string) => {
    const fuera = <T,>(prev: Map<string, T>) => {
      if (!prev.has(`${fixtureId}|A`) && !prev.has(`${fixtureId}|B`)) return prev;
      const siguiente = new Map(prev);
      siguiente.delete(`${fixtureId}|A`); siguiente.delete(`${fixtureId}|B`);
      return siguiente;
    };
    setPrueba(fuera); setComoSePrueba(fuera);
  }, []);
  // La cara abierta en «Vista para el proveedor»: la lámina sale de ésa.
  const caraDelPanel = useRef<{ fixtureId: string; cara: "A" | "B" } | null>(null);
  const alCambiarCara = useCallback((fixtureId: string, cara: "A" | "B") => {
    caraDelPanel.current = { fixtureId, cara };
  }, []);

  // La toma pedida para Presentar. `n` cambia en cada pedido para que pedir
  // dos veces la misma vuelva a encuadrar.
  const [pedidoDeToma, setPedidoDeToma] = useState<PedidoDeToma | null>(null);
  // El número sale de un contador propio y no del pedido anterior: al salir
  // de Presentar el pedido se borra (las tomas del HUD y la silueta son del
  // mueble que se estaba mostrando), y un `n` que volviera a 1 lo saltearía
  // la escena por «ya atendido».
  const tomasPedidas = useRef(0);
  const pedirToma = useCallback((fixtureId: string, cara: "A" | "B", toma: TomaDeVenta, holgura?: number) => {
    const n = ++tomasPedidas.current;
    setPedidoDeToma({ fixtureId, cara, toma, n, holgura });
    return n;
  }, []);
  const estadoDeEscena = useRef<EstadoDeEscena>({
    sinArte: false, privadoPara: undefined, toma: 0, primeraPersona: false, rejillasAcomodadas: [],
    aspectoConPersona: 0,
  });
  useEffect(() => { if (!presentationMode) setPedidoDeToma(null); }, [presentationMode]);

  // MEJORA 8: First-person mode
  const [firstPerson, setFirstPerson] = useState(false);
  // Dónde está y hacia dónde mira quien camina — lo dibuja el minimapa.
  const [camaraFP, setCamaraFP] = useState<CamaraEnPlanta | null>(null);
  // Pedido de teletransporte. El contador hace que tocar dos veces el mismo
  // punto del plano vuelva a saltar, en vez de quedarse quieto.
  const [saltarA, setSaltarA] = useState<{ x: number; z: number; n: number } | null>(null);
  // Con el mouse capturado no hay puntero que pueda tocar el plano: el
  // navegador lo esconde y manda todo al lienzo. El minimapa sigue orientando,
  // pero el salto sólo se ofrece cuando el mouse está suelto.
  const [mouseSuelto, setMouseSuelto] = useState(true);
  // Al salir de la caminata se olvida el último salto pedido. Si no, cambiar de
  // sede remonta la escena y al volver a entrar uno aparecía en el punto que
  // había tocado en el plano de la sede anterior.
  useEffect(() => { if (!firstPerson) setSaltarA(null); }, [firstPerson]);

  // Al pedir «Ver la exhibición en 3D» se selecciona el mueble —así el panel
  // de la derecha ya habla de ese espacio— y se sale de la caminata, que tiene
  // su propia cámara. El encuadre lo aplica la escena.
  const enfoquePedido = useFixtureStore((s) => s.enfoque3D);
  useEffect(() => {
    if (!enfoquePedido) return;
    setFirstPerson(false);
    setSelectedId(enfoquePedido.fixtureId);
    setSelectedSlotId(null);
  }, [enfoquePedido]);
  useEffect(() => {
    const alCambiar = () => setMouseSuelto(document.pointerLockElement === null);
    document.addEventListener("pointerlockchange", alCambiar);
    alCambiar();
    return () => document.removeEventListener("pointerlockchange", alCambiar);
  }, []);

  // MEJORA 9: Hover tooltip
  const [hoveredFixtureId, setHoveredFixtureId] = useState<string|null>(null);
  const [tooltipPos, setTooltipPos]             = useState<{x:number;y:number}>({x:0,y:0});

  // MEJORA 5: Screenshot
  const screenshotFnRef = useRef<(() => string) | null>(null);
  const setScreenshotFn  = useCallback((fn: () => string) => { screenshotFnRef.current = fn; }, []);

  // Vista superior: same pattern — Scene registers the fn, toolbar button calls it
  const topViewFnRef = useRef<(() => void) | null>(null);
  const handleTopView  = useCallback(() => { topViewFnRef.current?.(); }, []);
  const setTopViewFn   = useCallback((fn: () => void) => { topViewFnRef.current = fn; }, []);

  const orbitRef   = useRef<ThreeOrbitControls|null>(null);
  const draggingId = useRef<string|null>(null);

  // CHANGE 3 — u: undoable mutation helper
  // Updates local state AND records an undoable snapshot in the store.
  const u = useCallback((fn: (prev: PlacedFixture[]) => PlacedFixture[]) => {
    setPlacedFixtures(prev => {
      const next = fn(prev);
      // Commit to store immediately so undo history captures this snapshot
      const existingStore = selectFixtures(useFixtureStore.getState());
      commit(fixturesToStore(next, useFixtureStore.getState().sede, existingStore));
      return next;
    });
  }, [commit]);

  // ── Sync fixtures + sede → unified store ─────────────────────────────────────
  // The exact array we last wrote to the store, so the mirror effect below can
  // recognise its own echo by identity.
  const lastCommittedRef = useRef<UnifiedFixture[] | null>(null);
  // Set right after adopting server state, so re-serialising it does not bounce
  // straight back to the server (two open 3D editors would ping-pong forever).
  const suppressCommitRef = useRef(false);
  // Merely opening this editor must not dirty the layout.
  const isFirstRender3D = useRef(true);

  const prevSede3DRef = useRef(sede);
  useEffect(() => {
    if (isFirstRender3D.current) { isFirstRender3D.current = false; return; }
    if (suppressCommitRef.current) { suppressCommitRef.current = false; return; }
    const existingStore = selectFixtures(useFixtureStore.getState());
    const converted = fixturesToStore(placedFixtures, sede, existingStore);
    lastCommittedRef.current = converted;
    if (draggingId.current) {
      // During drag: update display without creating an undo entry or triggering server sync
      pushToStore(converted);
    } else {
      // Drag ended or fixtures changed outside drag: commit properly (undoable, server sync)
      commit(converted);
    }
  }, [placedFixtures, sede, pushToStore, commit]);

  // ── Sync unified store → fixtures (server pulls, undo/redo) ─────────────────
  // Without this the 3D canvas kept rendering whatever it loaded on mount, so a
  // layout saved on another workstation never appeared here.
  useEffect(() => {
    if (lastCommittedRef.current === fixtures) return; // our own echo
    if (draggingId.current) return;                    // never yank geometry mid-drag
    suppressCommitRef.current = true;
    setPlacedFixtures(storeToFixtures(fixtures));
  }, [fixtures]);

  useEffect(() => {
    if (prevSede3DRef.current === sede) return;
    prevSede3DRef.current = sede;
    // Switch sede in store (clears undo/redo) then reinit canvas
    pushSedeToStore(sede);
    const newFixtures = useFixtureStore.getState().fixturesBySede[sede] ?? [];
    setPlacedFixtures(storeToFixtures(newFixtures));
  }, [sede, pushSedeToStore]);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(()=>setWarning(null), 4000);
    return ()=>clearTimeout(t);
  }, [warning]);

  useEffect(()=>{
    const up=()=>{
      if(draggingId.current){ draggingId.current=null; if(orbitRef.current) orbitRef.current.enabled=true; }
    };
    window.addEventListener("pointerup",up);
    return ()=>window.removeEventListener("pointerup",up);
  },[]);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const tag=(e.target as HTMLElement).tagName.toLowerCase();
      if(tag==="input"||tag==="textarea"||tag==="select") return;
      // En Presentar sólo se atiende Esc. La selección ya no se ve (sin caja,
      // gizmo ni panel) y un clic elige el mueble que se muestra: una R, una
      // F o un Retroceso sin querer giraba o borraba la punta delante del
      // proveedor, y quedaba escrito en el plano. El arrastre ya estaba
      // bloqueado por lo mismo; Ctrl+Z también se va: deshace el plano.
      if (presentationMode) {
        if (e.key === "Escape" && !firstPerson && !document.pointerLockElement) setPresentationMode(false);
        return;
      }
      // CHANGE 3 — Undo / Redo
      if(e.ctrlKey && e.key==="z" && !e.shiftKey){
        e.preventDefault();
        undo();
        // Sync store state back to local after undo
        setPlacedFixtures(storeToFixtures(selectFixtures(useFixtureStore.getState())));
        return;
      }
      if(e.ctrlKey && (e.key==="y" || (e.key==="z" && e.shiftKey))){
        e.preventDefault();
        redo();
        // Sync store state back to local after redo
        setPlacedFixtures(storeToFixtures(selectFixtures(useFixtureStore.getState())));
        return;
      }
      if(e.key==="Escape"){
        // (En Presentar, arriba: sin pantalla completa Esc sale de Presentar;
        // con ella el primer Esc lo atiende el navegador y suelta sólo la
        // pantalla completa. En primera persona, o con el mouse capturado,
        // Esc suelta el mouse como siempre.)
        setPlacingDef(null); setSelectedId(null); setSelectedSlotId(null);
        setFirstPerson(false);
      }
      if((e.key==="r"||e.key==="R")&&!e.ctrlKey){
        e.preventDefault();
        if(placingDef) setGhostRotY(r=>r+Math.PI/2);
        else if(selectedId) u(p=>p.map(f=>f.id===selectedId?{...f,rotY:f.rotY+Math.PI/2}:f));
      }
      if((e.key==="f"||e.key==="F")&&!e.ctrlKey&&selectedId){
        e.preventDefault();
        u(p=>p.map(f=>f.id===selectedId?{...f,w:f.d,d:f.w}:f));
      }
      if((e.key==="Delete"||e.key==="Backspace")&&selectedId&&!placingDef){
        e.preventDefault();
        u(p=>p.filter(f=>f.id!==selectedId));
        soltarPruebasDe(selectedId);
        setSelectedId(null); setSelectedSlotId(null);
      }
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[placingDef,selectedId,u,undo,redo,presentationMode,firstPerson,soltarPruebasDe]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onFloorMove = useCallback((x:number, z:number) => {
    setGhostX(x);
    setGhostZ(z);
    if (placingDef) {
      // Con el giro del fantasma: se puede rotar ANTES de soltar, y sin esto la
      // vista previa se pintaba en verde mientras el mueble ya pisaba a otro.
      const collides = hasAABBCollision(
        {x, z}, { ...placingDef, rotY: ghostRotY }, placedFixtures,
      );
      setGhostCollides(collides);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placingDef, placedFixtures, ghostRotY]);

  function onFloorClick(x:number, z:number){
    if(placingDef){
      // El fantasma se pintaba rojo al pisar a otro mueble y el clic lo soltaba
      // igual: el aviso era decorativo. El plano 2D siempre lo bloqueó; acá no.
      // Un mueble encima de otro rompe el plano para todo lo que viene después
      // —la caminata, el encuadre del proveedor, el metraje que se cobra.
      if (hasAABBCollision({x, z}, { ...placingDef, rotY: ghostRotY }, placedFixtures)) {
        setWarning("⚠️ Ahí se monta sobre otro mueble — movelo o giralo (R)");
        return;
      }
      const warn = validatePlacement(placingDef, {x,z}, placedFixtures);
      if(warn) setWarning(warn);
      const newCode = generateCode(sede, placingDef, placedFixtures);
      const newFix: PlacedFixture = {
        id:              `${placingDef.type}-${Date.now()}`,
        code:            newCode,
        type:            placingDef.type,
        gondolaType:     placingDef.gondolaType,
        x, z, rotY:     ghostRotY,
        w:               placingDef.w,
        d:               placingDef.d,
        h:               placingDef.h,
        label:           placingDef.label,
        color:           placingDef.color,
        supplierName:    "",
        brandCategory:   "",
        status:          "free",
        negotiatedValue: 0,
        startDate:       "",
        endDate:         "",
        observation:     "",
        // Columns, checkouts and free zones are part of the store, not stock to
        // sell. Everything else stays rentable (flag left absent).
        ...(NON_RENTABLE_BY_DEFAULT.has(placingDef.type) ? { rentable: false } : {}),
        // Desde un modelo de la paleta (`paleta`, del catálogo o una ficha
        // propia del supermercado, `cli:…`): su id y su geometría
        // quedan ESTAMPADOS en el mueble (las medidas y el color ya vienen en
        // `placingDef`). El modelo base no trae nada: el mueble nace como
        // siempre.
        ...fichaDe(placingDef),
      };
      newFix.slots = defaultSlots({ type:newFix.type, w:newFix.w, h:newFix.h, code:newCode });
      u(prev=>[...prev,newFix]);
    } else {
      setSelectedId(null);
      setSelectedSlotId(null);
    }
  }

  function onSelectFixture(id:string){
    if(!placingDef && !firstPerson){ setSelectedId(id); setSelectedSlotId(null); }
  }

  function onSelectSlot(fixtureId:string, slotId:string){
    setSelectedId(fixtureId);
    setSelectedSlotId(slotId);
  }

  // B2: route through u() so commercial panel edits (supplier, dates, status) are undoable
  const updateFixture = useCallback((id:string, updates:Partial<PlacedFixture>)=>{
    u(prev=>prev.map(f=>f.id===id?{...f,...updates}:f));
  },[u]);

  const updateSlot = useCallback((fixtureId:string, slotId:string, updates:Partial<ShelfSlot>)=>{
    u(prev=>prev.map(f=>{
      if(f.id!==fixtureId||!f.slots) return f;
      return {...f, slots:f.slots.map(s=>s.id===slotId?{...s,...updates}:s)};
    }));
  },[u]);

  // ── Renombrar, por el mismo camino que el plano 2D ──────────────────────────
  // La regla vive en `utils/nomenclatura.ts` y comprueba y escribe en la misma
  // llamada: acá no se decide nada, sólo se guarda el resultado por `u` para que
  // el renombre entre en el historial de deshacer como cualquier otro cambio.
  const renombrarFixture = useCallback((id:string, nombre:string) => {
    const r = renombrar(placedFixtures, id, nombre);
    if (!r.ok) return r.rechazo;
    u(() => r.muebles);
    return null;
  }, [placedFixtures, u]);

  /** Los dos nombres a la vez: en ningún momento intermedio hay dos iguales. */
  const intercambiarFixtures = useCallback((esteId:string, otroId:string) => {
    u(prev => intercambiarNombres(prev, esteId, otroId));
  }, [u]);

  function rotateSelected(){ if(!selectedId) return; u(p=>p.map(f=>f.id===selectedId?{...f,rotY:f.rotY+Math.PI/2}:f)); }
  function flipSelected(){   if(!selectedId) return; u(p=>p.map(f=>f.id===selectedId?{...f,w:f.d,d:f.w}:f)); }
  function deleteSelected(){
    if(!selectedId) return;
    u(p=>p.filter(f=>f.id!==selectedId));
    soltarPruebasDe(selectedId);
    setSelectedId(null); setSelectedSlotId(null);
  }
  function handleSave(){
    // Fixtures are auto-saved to the store on every change via useEffect.
    // This button gives explicit visual feedback.
    setSavedAt(new Date());
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 3000);
  }
  function handleClear(){
    if(confirm("¿Limpiar todo el espacio?")){ setPlacedFixtures([]); setSelectedId(null); setSelectedSlotId(null); setSavedAt(null); }
  }


  // MEJORA 9: hover callback
  const onHoverFixture = useCallback((id: string|null, x: number, y: number) => {
    setHoveredFixtureId(id);
    if (id) setTooltipPos({ x, y });
  }, []);

  const selectedFix  = placedFixtures.find(f=>f.id===selectedId)??null;
  const isAdmin      = useAuthStore(selectIsAdmin);

  /** «Mostrar al proveedor»: la pantalla de venta, limpia, con la toma de
   *  frente de la cara que tiene el producto. */
  const mostrarAlProveedor = useCallback((fixtureId: string, cara: "A" | "B") => {
    // El que mira es el dueño de ESTE producto: lo demás que se haya probado
    // en la sesión, de otros proveedores, no se dibuja.
    const arteId = prueba.get(`${fixtureId}|${cara}`);
    setProveedorEnPantalla(catalogo.find(a => a.id === arteId)?.supplier_id ?? null);
    setSelectedSlotId(null);
    setFirstPerson(false);
    setPresentationMode(true);
    pedirPantallaCompleta();
    pedirToma(fixtureId, cara, "frente");
  }, [pedirToma, prueba, catalogo, pedirPantallaCompleta]);

  /** El botón «Presentar» de la barra: sin pasar por «Mostrar al proveedor»
   *  también hay que saber para quién es la pantalla.
   *
   *  Con el mueble elegido probado, es «Mostrar al proveedor»: la dueña
   *  aprieta el botón de siempre en plena videollamada, y la punta de Alpina
   *  no puede aparecer vacía delante de Alpina. Sin mueble elegido, la
   *  cámara queda donde la dejó (encuadró lo que quería mostrar) y sólo se
   *  decide para quién es la pantalla (`proveedorParaPresentar`). */
  const alternarPresentar = useCallback(() => {
    if (presentationMode) { setPresentationMode(false); return; }
    if (selectedId) {
      // Con una reunión fijada, sólo cuenta la prueba de ESE proveedor: un
      // arrastre que empezó sobre la punta de Alpina la elige, y «Presentar»
      // no puede pasarle la pantalla a Alpina en plena reunión con Diana.
      // Con la reunión abierta sin proveedor («Cambiar de proveedor»), la
      // prueba de nadie.
      const delQueMira = (c: "A" | "B") => {
        const id = prueba.get(`${selectedId}|${c}`);
        return id != null && (!fijada
          || catalogo.find(a => a.id === id)?.supplier_id === supplierDeReunion);
      };
      const cara = delQueMira("A") ? "A" : delQueMira("B") ? "B" : null;
      if (cara) { mostrarAlProveedor(selectedId, cara); return; }
    }
    setProveedorEnPantalla(proveedorParaPresentar({
      prueba: pruebaViva, catalogo, muebleId: selectedId, proveedorDeReunion,
    }));
    setPresentationMode(true);
    pedirPantallaCompleta();
  }, [presentationMode, prueba, pruebaViva, catalogo, selectedId, proveedorDeReunion, supplierDeReunion, fijada, mostrarAlProveedor, pedirPantallaCompleta]);

  /** La cara con prueba de un mueble, A primero: es la que encuadran las
   *  tomas del HUD de Presentar. Sólo una que el que mira pueda ver: con la
   *  prueba de otro proveedor el HUD encuadraría un mueble vacío. */
  const caraVisible = (fix: PlacedFixture | null): "A" | "B" | null => {
    if (!fix) return null;
    const ve = (cara: "A" | "B") =>
      arteALaVista(prueba.get(`${fix.id}|${cara}`), catalogo, privadoPara) != null;
    return ve("A") ? "A" : ve("B") ? "B" : null;
  };
  // El mueble de las tomas del HUD: el elegido si se ve su prueba; si no, el
  // de la última toma pedida. Un arrastre para girar que empieza sobre otro
  // mueble lo elige (o un clic en el piso suelta la selección), y antes eso
  // borraba las tres tomas a mitad de la demo y dejaba sólo «Salir».
  const muebleDeLaToma = presentationMode && pedidoDeToma
    ? placedFixtures.find(f => f.id === pedidoDeToma.fixtureId) ?? null : null;
  const muebleDelHud = caraVisible(selectedFix) ? selectedFix
    : caraVisible(muebleDeLaToma) ? muebleDeLaToma : null;
  // La cara de la toma vigente si es de este mueble y se ve (`caraDeLasTomas`):
  // con pruebas en las dos caras «De cerca» saltaba a la A.
  const caraConPrueba = muebleDelHud
    ? caraDeLasTomas(
        (c) => arteALaVista(prueba.get(`${muebleDelHud.id}|${c}`), catalogo, privadoPara) != null,
        pedidoDeToma?.fixtureId === muebleDelHud.id ? pedidoDeToma.cara : null,
      )
    : null;
  // Presentar sin proveedor identificado no dibuja ninguna prueba. Si hay
  // alguna puesta, se avisa SIN NOMBRES —la pantalla ya puede estar
  // compartida— y se ofrece mostrar la última.
  // Con un proveedor identificado NO se avisa nada en el HUD: lo lee el
  // proveedor, y «Hay una prueba que no se está mostrando» escrito sobre la
  // punta vacía le decía que esa punta se le está ofreciendo a otro (la fuga
  // que la primera crítica señaló). A la dueña se le avisa ANTES de entrar:
  // en el panel y en el botón «Presentar» (`pruebaAjenaElegida`).
  const pruebaOculta = presentationMode && privadoPara === null ? ultimaPrueba(pruebaViva, catalogo) : null;
  const pruebaAjenaElegida = !presentationMode && fijada && selectedId
    ? pruebaAjenaDelMueble(prueba, catalogo, selectedId, supplierDeReunion ?? -1) : null;

  /**
   * Baja la lámina para el proveedor.
   *
   * Con un mueble seleccionado saca DOS tomas desde la misma cámara —sin arte
   * y con arte— porque la comparación es lo que cierra la negociación. Sin
   * selección se queda con la vista de pantalla, que sigue sirviendo para
   * mostrar la sede entera.
   */
  const [exportando, setExportando] = useState(false);
  const exportarPropuesta = useCallback(async () => {
    const capturar = screenshotFnRef.current;
    if (!capturar || exportando) return;
    setExportando(true);
    const arteOriginal = sinArte;
    let camaraDeAntes: { pos: THREE.Vector3; mira: THREE.Vector3 } | null = null;
    // Entre toma y toma hay que dejar que React rearme los materiales y que
    // el lienzo vuelva a dibujar.
    const esperarCuadro = () =>
      new Promise<void>(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok())));
    /** Hasta que la escena confirme lo pedido (`EstadoDeEscena`), con un
     *  tope de ~4 s, y un cuadro más para que se dibuje. */
    const esperarEscena = async (listo: (e: EstadoDeEscena) => boolean) => {
      for (let i = 0; i < 240 && !listo(estadoDeEscena.current); i++) {
        await new Promise<void>(ok => requestAnimationFrame(() => ok()));
      }
      await esperarCuadro();
    };
    try {
      const fix = selectedFix;
      const uf  = fix ? fixtures.find(f => f.id === fix.id) : null;

      // Sin mueble elegido: una sola toma de lo que se ve, pero privada como
      // Presentar —para el proveedor de la reunión, o para nadie—. Es un
      // archivo que sale de la tienda: con la pantalla de la dueña llevaba
      // las pruebas de toda la sesión y las fotos de las caras de otros.
      if (!fix || !uf) {
        setLaminaPara(supplierDeReunion);
        await esperarEscena((e) => e.privadoPara === supplierDeReunion);
        const blob = await componerPropuesta(
          [{ titulo: "Vista general", dataUrl: capturar() }],
          { sede, espacio: sede, mueble: "", proveedor: "", categoria: "",
            desde: "", hasta: "", valorMensual: null },
        );
        descargar(blob, `${sede}_vista.png`);
        return;
      }

      // Las tomas de venta las atiende la órbita: en la caminata la escena
      // no las encuadra («Hoy» y «Con …» salían desde la cámara de la
      // caminata y «De cerca» igual a «Con …»), y al terminar la cámara
      // «volvía» girando la de la caminata. Se sale de la caminata primero.
      if (firstPerson) {
        setFirstPerson(false);
        await esperarEscena((e) => !e.primeraPersona);
      }

      // Qué producto se está probando en este mueble. Con una reunión fijada,
      // sólo un producto de ESE proveedor (abierta sin proveedor, ninguno). La
      // cara: la de la toma vigente o la abierta en el panel, si tiene uno; si
      // no, A y después B (`caraDeLasTomas`). Con pruebas en las dos caras
      // salía siempre la A aunque se estuviera hablando de la B.
      const arteDeCara = (c: "A" | "B") => {
        const id = prueba.get(`${fix.id}|${c}`);
        const a = id != null ? catalogo.find(x => x.id === id) : undefined;
        return a && (!fijada || a.supplier_id === supplierDeReunion) ? a : undefined;
      };
      const pedida = pedidoDeToma?.fixtureId === fix.id ? pedidoDeToma.cara
        : caraDelPanel.current?.fixtureId === fix.id ? caraDelPanel.current.cara : null;
      const caraDelArte = caraDeLasTomas((c) => !!arteDeCara(c), pedida);
      const arte = caraDelArte ? arteDeCara(caraDelArte) : undefined;

      // Con un producto en prueba, las tomas son las de la pantalla de venta
      // y no la cámara que hubiera quedado: con el encuadre viejo la punta
      // era el 15 % de cada imagen y los vasos, puntitos. «De frente» con
      // aire alrededor (el mueble al ~65 % del alto) para «Hoy» y «Con …», y
      // una tercera «De cerca», que es la que se lee. Al terminar la cámara
      // vuelve a donde estaba.
      const cara = arte ? caraDelArte : null;
      const conTomas = !!arte && !!cara && TIPOS_CON_PRUEBA_3D.has(fix.type);
      const ctrl = orbitRef.current;
      const cam = ctrl?.object as THREE.PerspectiveCamera | undefined;
      camaraDeAntes = conTomas && ctrl && cam
        ? { pos: cam.position.clone(), mira: ctrl.target.clone() } : null;
      // El recorte de cada toma, con la forma del mueble (ver `prepararToma`).
      const aspecto = conTomas
        ? Math.max(0.75, Math.min(16 / 9, (fix.w / (fix.h * 1.12 * HOLGURA_DE_LAMINA)) * 1.3))
        : 16 / 9;
      // Las tres tomas van del mismo tamaño en la lámina (`componerPropuesta`
      // las dibuja con el de la primera), así que el recorte es uno: el del
      // mueble o, si la persona de escala queda más afuera, hasta ella (sin
      // pasar del cuadro). Partida, no da escala.
      let aspectoDeLamina = aspecto;
      const preparar = (dataUrl: string) => prepararToma(dataUrl, aspectoDeLamina, FONDO_DE_SALA);

      // Con una propuesta, las DOS tomas son privadas para su proveedor, como
      // Presentar: ninguna foto, patrón ni prueba de otro. Sin esto «Con
      // Alpina» traía el patrón de cajas de la góndola de al lado y «Hoy» no,
      // y la diferencia entre las dos tenía que ser SÓLO el producto. La
      // lámina es justo el archivo que el proveedor se lleva y reenvía.
      //
      // Sin producto en prueba, la lámina es para el que tiene el contrato
      // (si tiene artes en el catálogo) o para nadie: tampoco ahí van las
      // pruebas de la sesión ni las fotos de las caras vecinas. Con una
      // reunión en curso, para el de la reunión y sin los datos de un
      // contrato ajeno (`laminaDelMueble`): en la reunión de Diana, con la
      // punta de Alpina elegida, el lienzo compartido dibujaba los vasos de
      // Alpina y bajaba «…_Alpina.png» con su valor mensual.
      const { para, contratoALaVista } = laminaDelMueble({
        arteSupplierId: arte?.supplier_id, contratoDe: uf.supplierName, proveedorDeReunion, catalogo,
      });
      setLaminaPara(para);
      if (conTomas && cara) {
        const n = pedirToma(fix.id, cara, "frente", HOLGURA_DE_LAMINA);
        await esperarEscena((e) => e.toma === n);
        aspectoDeLamina = Math.min(16 / 9, Math.max(aspecto, estadoDeEscena.current.aspectoConPersona));
      }

      setSinArte(true);
      await esperarEscena((e) => e.sinArte && e.privadoPara === para);
      const antes = await preparar(capturar());

      setSinArte(false);
      await esperarEscena((e) => !e.sinArte);
      const despues = await preparar(capturar());
      // «Hoy» sale con las rejillas de fábrica y «Con …» con las acomodadas
      // para el producto: es lo que haría el mercaderista, y la lámina no lo
      // esconde (renglón «Exhibición» del pie).
      const conRejillas = !!cara && estadoDeEscena.current.rejillasAcomodadas.includes(`${fix.id}|${cara}`);

      let deCerca: string | null = null;
      if (conTomas && cara) {
        const n = pedirToma(fix.id, cara, "cerca");
        await esperarEscena((e) => e.toma === n);
        deCerca = await preparar(capturar());
      }

      // Cuando se está PROPONIENDO un producto, el pie habla de esa propuesta y
      // no del contrato que hoy ocupa el espacio. Sin esto la lámina salía con
      // la foto del yogur de Alpina y, debajo, «Proveedor: Nutresa» con las
      // fechas del contrato de Nutresa: el error más caro posible en el único
      // papel que el proveedor se lleva.
      //
      // El período y el valor se omiten a propósito: de lo que se está
      // proponiendo todavía no hay nada acordado, y poner las fechas del
      // contrato de al lado sería inventarlas. Se negocian en la reunión.
      const mismoProveedor =
        !!arte && (uf.supplierName ?? "").trim().toLowerCase() === arte.proveedor.trim().toLowerCase();
      // Sin producto y con el contrato de otro en plena reunión, el pie va
      // como en una propuesta: sin proveedor, rubro, período ni valor.
      const proponiendo = (!!arte && !mismoProveedor) || !contratoALaVista;

      const datos = {
        sede,
        espacio: fullSpaceCode(uf.sede || sede, uf.code),
        mueble: conNombrePropio(uf, nombresPropios, uf.label || uf.code),
        proveedor: arte ? arte.proveedor : contratoALaVista ? (uf.supplierName ?? "") : "",
        // Con surtido, los productos de la cara unidos por « · » (los del
        // mismo proveedor que se ven en las tomas); sin período ni valor.
        producto: arte
          ? nombresDeLaPrueba(arte, cara && TIPOS_CON_SURTIDO.has(fix.type) ? comoSePrueba.get(`${fix.id}|${cara}`)?.surtido : undefined, para, catalogo)
          : undefined,
        exhibicion: conRejillas ? "rejillas acomodadas para este producto" : undefined,
        categoria: proponiendo ? (arte?.categoria ?? "") : (uf.brandCategory ?? ""),
        desde: proponiendo ? "" : (uf.startDate ?? ""),
        hasta: proponiendo ? "" : (uf.endDate ?? ""),
        // La plata se tacha para el trabajador, igual que en todas las demás
        // pantallas. Una lámina es un archivo que se reenvía.
        valorMensual: proponiendo ? null : (isAdmin ? (uf.negotiatedValue || null) : null),
      };
      // Sin arte cargada las dos tomas salen idénticas: mostrar el mismo
      // dibujo dos veces con los rótulos «Hoy» y «Con la marca» es mentirle
      // al que recibe la lámina. Ahí va una sola imagen.
      const hayComparacion = antes !== despues;
      const tomas = hayComparacion
        ? [
            { titulo: "Hoy", dataUrl: antes },
            { titulo: arte ? `Con ${arte.proveedor}` : "Con la marca", dataUrl: despues },
            ...(deCerca ? [{ titulo: "De cerca", dataUrl: deCerca }] : []),
          ]
        : [{ titulo: "El espacio hoy", dataUrl: despues }];
      const blob = await componerPropuesta(tomas, datos);
      descargar(blob, nombreDeArchivo(datos, hayComparacion));
    } catch {
      // Sin alertas: el botón vuelve a su estado y se puede reintentar.
    } finally {
      setSinArte(arteOriginal);
      setLaminaPara(undefined);
      // La cámara vuelve a donde la dejó la dueña (y el campo visual a 50°,
      // al soltar el pedido de toma).
      if (camaraDeAntes) {
        setPedidoDeToma(null);
        const ctrl = orbitRef.current;
        if (ctrl) {
          ctrl.object.position.copy(camaraDeAntes.pos);
          ctrl.target.copy(camaraDeAntes.mira);
          ctrl.update();
        }
      }
      setExportando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportando, sinArte, selectedFix, fixtures, sede, isAdmin, prueba, catalogo, pedirToma, supplierDeReunion, firstPerson, comoSePrueba, fijada, pedidoDeToma, proveedorDeReunion, nombresPropios]);
  const selectedSlot = selectedFix?.slots?.find(s=>s.id===selectedSlotId)??null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /* `data-cajon-oscuro`: el editor es oscuro en los dos temas (ver el
       bloque del mismo nombre en `tema.css`). Adentro de esta marca la tinta
       se invierte, así que `bg-accent` es una pestaña CLARA sobre el panel
       oscuro y no un rectángulo negro invisible. */
    <div data-cajon-oscuro ref={contenedorRef} data-presentar={presentationMode || undefined}
      className={presentationMode
        /* Presentar: la pantalla entera, sin marco ni barra (ver
           `pedirPantallaCompleta`). */
        ? "fixed inset-0 z-[60] flex overflow-hidden bg-dark-bg"
        : "flex flex-1 overflow-hidden rounded-xl border border-dark-line bg-dark-bg"}
      style={{minHeight:0}}>

      {/* ── Left sidebar — hidden in presentation mode ── */}
      <div className={`flex w-52 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-dark-line bg-dark-surface p-3 ${presentationMode ? 'hidden' : ''}`}>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Sede</label>
          <input type="text" value={sede} maxLength={10} onChange={e=>setSede(e.target.value.toUpperCase())}
            className="w-full border-0 border-b-2 border-dark-line-2 bg-transparent rounded-none px-0 font-mono text-sm text-accent-200 focus:border-accent focus:outline-none"
            placeholder="CENTRO" />
        </div>

        <div className="border-t border-dark-line" />

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Fixtures</p>
          {/* Por familia: el modelo base —se coloca como siempre— y, plegados
              debajo, los modelos de muebles de verdad del catálogo y después
              las fichas propias del supermercado (las vigentes), con las
              medidas de su ficha. «≈»: medidas deducidas, no de una ficha. */}
          <div className="flex flex-col gap-1.5" data-paleta-3d>
            {paleta.map((familia) => {
              const def = familia.base;
              const active = placingDef === def;
              const activoAdentro = familia.modelos.some((m) => m === placingDef);
              return (
                <div key={familia.entrada} className="flex flex-col gap-1">
                  <button data-modelo={familia.idBase}
                    onClick={()=>{ setPlacingDef(active?null:def); setSelectedId(null); setSelectedSlotId(null); if(!active) setGhostRotY(0); }}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all duration-150 ${
                      active
                        ? "ring-2 ring-accent ring-offset-1 ring-offset-dark-surface bg-accent/20 border-accent text-accent-200"
                        : "border-dark-line-2 bg-dark-surface-2 text-dark-ink-2 hover:bg-dark-line hover:border-dark-line-2"}`}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-dark-line/50 flex-shrink-0">{def.emoji}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-dark-ink-1">{conNombrePropio(def, nombresPropios, def.label)}</p>
                      <p className="text-[10px] text-dark-ink-3">{def.w}×{def.d}×{def.h} m</p>
                    </div>
                    {active&&<span className="ml-auto h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-accent"/>}
                  </button>
                  {familia.modelos.length > 0 && (
                    <details className="ml-3" open={activoAdentro || undefined}>
                      <summary className="cursor-pointer select-none text-[10px] text-dark-ink-3 hover:text-dark-ink-1">
                        {familia.modelos.length} {familia.modelos.length === 1 ? "modelo" : "modelos"}
                      </summary>
                      <div className="mt-1 flex flex-col gap-1">
                        {familia.modelos.map((m) => {
                          const activo = placingDef === m;
                          return (
                            <button key={m.modelo} data-modelo={m.modelo} title={m.desc}
                              onClick={()=>{ setPlacingDef(activo?null:m); setSelectedId(null); setSelectedSlotId(null); if(!activo) setGhostRotY(0); }}
                              className={`rounded-md border px-2 py-1 text-left transition-all duration-150 ${
                                activo
                                  ? "ring-2 ring-accent ring-offset-1 ring-offset-dark-surface bg-accent/20 border-accent text-accent-200"
                                  : "border-dark-line-2 bg-dark-surface-2 text-dark-ink-2 hover:bg-dark-line"}`}>
                              <p className="truncate text-[11px] font-medium text-dark-ink-1">
                                {m.estimado ? "≈ " : ""}{m.nombreModelo}
                              </p>
                              {/* Cómo se vende lo que se coloca desde este modelo
                                  («por puertas»): lo dice su ficha y se estampa. */}
                              <p className="text-[10px] text-dark-ink-3" data-como-se-vende={m.comoSeVende}>
                                {m.w}×{m.d}×{m.h} m{m.comoSeVende ? ` · ${m.comoSeVende}` : ""}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-dark-line" />

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-dark-ink-3">Estados</p>
          <div className="flex flex-col gap-1">
            {(["free","occupied","reserved"] as SpaceStatus[]).map(s=>{
              const sm=STATUS_META[s];
              return (
                <span key={s} className={`flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium ${sm.bg} ${sm.text}`}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{background:STATUS_COLORS[s]}}/>
                  {sm.label}
                </span>
              );
            })}
            <span
              className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{ background: "rgba(100,116,139,0.18)", color: "#94A3B8" }}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: NON_RENTABLE_COLOR }} />
              No comercializable
            </span>
          </div>
        </div>

        <div className="border-t border-dark-line" />

        <div className="text-[10px] text-dark-ink-3 space-y-0.5">
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">R</kbd> Rotar 90°</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">F</kbd> Flip ancho/fondo</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">Del</kbd> Eliminar</p>
          <p><kbd className="rounded-md border border-dark-line-2 bg-dark-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-dark-ink-2 shadow-sm">Esc</kbd> Cancelar</p>
        </div>

        <div className="mt-auto flex flex-col gap-1.5">
          <button onClick={handleSave}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent-600 shadow-lg active:scale-[0.98] transition-all py-2 text-xs font-semibold text-accent-ink">
            {showSavedFeedback
              ? <><span className="text-success-100">✓</span> <span className="text-success-100">Guardado</span></>
              : <><Save size={12}/> Guardar</>
            }
          </button>
          {savedAt && !showSavedFeedback && <p className="text-center text-[9px] text-dark-ink-3">Guardado {savedAt.toLocaleTimeString()}</p>}
          <button onClick={handleClear} className="text-center text-[10px] text-dark-ink-3 transition-colors hover:text-danger">Limpiar todo</button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="relative flex-1 overflow-hidden">

        {/* MEJORA 4: Status bar — hidden in presentation mode */}
        {!presentationMode && (
          <div className={`absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b px-4 py-1.5 text-[10px] backdrop-blur-sm ${
            warning
              ? "bg-warning/10 border-warning/30"
              : placingDef
                ? "bg-accent/10 border-accent/30"
                : "bg-dark-bg/85 border-dark-line/60"
          }`}>
            {warning ? (
              <span className="flex items-center gap-1.5 text-warning">
                <AlertTriangle size={12} className="text-warning"/> {warning}
              </span>
            ) : placingDef ? (
              <span className="flex items-center gap-2 text-accent-200">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent flex-shrink-0"/>
                Colocando <strong className="text-dark-ink-1">
                  {placingDef.nombreModelo ? `${placingDef.estimado ? "≈ " : ""}${placingDef.nombreModelo}` : conNombrePropio(placingDef, nombresPropios, placingDef.label)}
                </strong>
                <span className="text-accent/40">·</span>
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">clic</kbd> ubicar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">R</kbd> rotar ·
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1 text-dark-ink-2">Esc</kbd> cancelar
              </span>
            ) : (
              <span className="flex items-center gap-2 text-dark-ink-2">
                {placedFixtures.length} mueble{placedFixtures.length!==1?"s":""}
                {selectedFix&&(
                  <span className="flex items-center gap-1 ml-2">
                    <span className="text-dark-ink-3">·</span>
                    <span className="font-mono text-xs bg-dark-surface rounded px-2 py-0.5 text-accent-200">{nombreDeMueble(selectedFix)}</span>
                    {selectedSlot&&<span className="text-warning">› {selectedSlot.id}</span>}
                  </span>
                )}
              </span>
            )}
            <span className="ml-auto hidden text-dark-ink-3 lg:block">drag → orbitar · scroll → zoom</span>

            {/* Vista superior — alinea cámara cenital para mover fixtures fácil */}
            <button onClick={handleTopView}
              title="Vista superior (cenital) — ideal para mover los muebles"
              className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors">
              ⊞ Top
            </button>

            {/* MEJORA 8: First-person button */}
            <button onClick={() => setFirstPerson(p => !p)}
              title="Modo primera persona (WASD)"
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                firstPerson
                  ? 'border-success/50 bg-success/15 text-success'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}>
              <User size={10}/> {firstPerson ? 'Orbital' : '1ª Persona'}
            </button>

            {/* Antes y después: el mismo encuadre con la marca puesta y sin
                ella. Es la comparación que cierra una negociación, y hasta
                ahora había que imaginársela. */}
            <button onClick={() => setSinArte(p => !p)}
              title={sinArte ? "Volver a mostrar las artes del proveedor" : "Ver el espacio sin las artes (el «antes»)"}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                sinArte
                  ? 'border-warning/50 bg-warning/15 text-warning'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}>
              {sinArte ? <EyeOff size={10}/> : <Eye size={10}/>} {sinArte ? 'Sin arte' : 'Con arte'}
            </button>

            {/* La lámina para el proveedor: la exhibición encuadrada con un
                pie que dice de qué espacio se habla. Con un mueble
                seleccionado sale el par antes/después; sin selección, la
                imagen sola de lo que hay en pantalla. */}
            <button onClick={exportarPropuesta} disabled={exportando}
              title={selectedFix
                ? "Bajar la lámina de este espacio, con el antes y el después"
                : "Bajar la vista actual como imagen"}
              className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors disabled:opacity-50">
              <Camera size={10}/> {exportando ? "Armando…" : selectedFix ? "Propuesta" : "PNG"}
            </button>

            {/* «Terminar la reunión»: sin nombres (la pantalla puede estar
                compartida). Vuelve a mostrar los contratos en el cartel y el
                panel, y quita las pruebas de la sesión. */}
            {enReunion && !presentationMode && (
              <button
                onClick={() => {
                  if (pruebaViva.size === 0 || confirm(`¿Terminar la reunión? Se quitan ${pruebaViva.size === 1 ? "la prueba" : `las ${pruebaViva.size} pruebas`} de esta sesión.`)) terminarReunion();
                }}
                title="Quita las pruebas de la sesión y suelta al proveedor de la reunión"
                data-terminar-reunion
                className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface px-2 py-0.5 text-[10px] text-dark-ink-2 hover:bg-dark-surface-2 transition-colors">
                <X size={10}/> Terminar reunión
              </button>
            )}

            {/* MEJORA 4: Presentation mode button */}
            <button
              onClick={alternarPresentar}
              title={pruebaAjenaElegida
                ? "Este mueble tiene una prueba de otro proveedor: en Presentar sale vacío"
                : "Modo presentación"}
              data-presentar-ajena={pruebaAjenaElegida ? "" : undefined}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-all ${
                presentationMode
                  ? 'border-accent/50 bg-accent/15 text-accent-200'
                  : 'border-dark-line-2 bg-dark-surface text-dark-ink-2 hover:bg-dark-surface-2'
              }`}
            >
              {presentationMode ? <EyeOff size={10}/> : <Eye size={10}/>}
              {presentationMode ? 'Salir' : 'Presentar'}
            </button>

            {placingDef && (
              <button onClick={()=>setPlacingDef(null)}
                className="flex items-center gap-1 rounded border border-dark-line-2 bg-dark-surface-2 hover:bg-dark-line px-2 py-0.5 text-[10px] text-dark-ink-2 active:scale-95 transition-all">
                <X size={10}/> Cancelar
              </button>
            )}
          </div>
        )}

        {placedFixtures.length === 0 && !placingDef && !presentationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="flex flex-col items-center gap-4 text-center max-w-xs">
              <div className="w-20 h-20 rounded-2xl bg-dark-surface border border-dark-line flex items-center justify-center">
                <Boxes size={36} className="text-dark-ink-3" />
              </div>
              <div>
                <p className="text-dark-ink-2 font-medium text-sm">Tu tienda está vacía</p>
                <p className="text-dark-ink-3 text-xs mt-1">Seleccioná un fixture del panel izquierdo y hacé clic en el piso para colocarlo</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-dark-ink-3">
                <kbd className="rounded border border-dark-line-2 bg-dark-surface px-1.5 py-0.5 font-mono">R</kbd>
                <span>rotar antes de colocar</span>
              </div>
            </div>
          </div>
        )}

        <CanvasErrorBoundary>
          <Canvas
            camera={{ position:CAM_POS, fov:FOV_DEL_EDITOR, near:0.1, far:500 }}
            onCreated={({ camera, gl, scene })=>{
              camera.lookAt(...CAM_TARGET);
              // El lienzo, para adelantar en los ratos libres lo que costaba en
              // el cuadro del clic: subir las texturas del envase y compilar su
              // programa (`etiqueta.ts`, «El precalentado»).
              registrarRenderer(gl, scene, camera);
            }}
            gl={{ antialias:true, preserveDrawingBuffer: true }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            frameloop="demand"
            dpr={[1, 1.5]}
            style={{ background:FONDO_DE_SALA, width:"100%", height:"100%" }}
          >
            <Scene
              placedFixtures={placedFixtures}
              selectedId={selectedId}
              selectedSlotId={selectedSlotId}
              hoveredSlotId={hoveredSlotId}
              setHoveredSlotId={setHoveredSlotId}
              placingDef={placingDef}
              ghostX={ghostX}
              ghostZ={ghostZ}
              ghostRotY={ghostRotY}
              ghostCollides={ghostCollides}
              draggingId={draggingId}
              orbitRef={orbitRef}
              onFloorMove={onFloorMove}
              onFloorClick={onFloorClick}
              onSelectFixture={onSelectFixture}
              onSelectSlot={onSelectSlot}
              setPlacedFixtures={setPlacedFixtures}
              screenshotReady={setScreenshotFn}
              topViewReady={setTopViewFn}
              firstPerson={firstPerson}
              sinArte={sinArte}
              prueba={pruebaEnEscena}
              comoSePrueba={comoSePrueba}
              catalogo={catalogo}
              presentationMode={presentationMode}
              privadoPara={privadoPara}
              pedidoDeToma={pedidoDeToma}
              onCamaraFP={setCamaraFP}
              saltarA={saltarA}
              onHoverFixture={onHoverFixture}
              fixtures={fixtures}
              estadoDeEscena={estadoDeEscena}
            />
          </Canvas>
        </CanvasErrorBoundary>

        {/* MEJORA 9: Tooltip on hover */}
        {/* En Presentar no hay tooltip: la pantalla la está mirando el
            proveedor. Y fuera de Presentar, mientras se prueba un producto, no
            dice de quién es el espacio ni cuánto paga: se puede estar
            compartiendo la pantalla sin haber apretado «Presentar». */}
        {hoveredFixtureId && !presentationMode && (() => {
          const fix = placedFixtures.find(f => f.id === hoveredFixtureId);
          if (!fix || fix.id === selectedId) return null;
          const sm = STATUS_META[fix.status];
          // La misma cuenta que el panel (`hayReunion`): con la reunión fijada y
          // la prueba recién quitada, el cartel volvía a decir quién paga qué.
          const discreto = enReunion;
          return (
            <div
              className="pointer-events-none absolute z-30 rounded-lg border border-dark-line bg-dark-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8, transform: 'translateY(-100%)' }}
            >
              <p className="font-mono font-bold text-accent-200">{nombreDeMueble(fix)}</p>
              <p className="text-dark-ink-1">{conNombrePropio(fix, nombresPropios, fix.label)}</p>
              {!discreto && fix.supplierName && <p className="text-dark-ink-2 mt-0.5">🏢 {fix.supplierName}</p>}
              {!discreto && fix.negotiatedValue > 0 && <p className="text-success mt-0.5">💵 ${fix.negotiatedValue}/mes</p>}
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${sm.bg} ${sm.text}`}>
                {sm.label}
              </span>
            </div>
          );
        })()}

        {/* MEJORA 4: Presentation mode overlay pill.
            El HUD flota SOBRE la escena 3D, no sobre una superficie del tema:
            blanco al 60-90% y negro translúcido son lo correcto encima de un
            render, en los dos temas. Es la única familia de colores literales
            de Tailwind que queda fuera de la landing, y queda a propósito. */}
        {presentationMode && (
          <HudQueSeEsconde contenedor={contenedorRef}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-sm">
            {muebleDelHud && caraConPrueba ? (
              /* Las tres tomas quietas de la cámara del vendedor. Un corte, sin
                 animación: por videollamada el movimiento se empasta. */
              ([["frente", "De frente"], ["tres_cuartos", "Tres cuartos"], ["cerca", "De cerca"]] as const).map(([toma, rotulo]) => (
                <button key={toma}
                  onClick={() => pedirToma(muebleDelHud.id, caraConPrueba, toma)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    pedidoDeToma?.toma === toma && pedidoDeToma.fixtureId === muebleDelHud.id && pedidoDeToma.cara === caraConPrueba
                      ? "bg-dark-ink-1 text-dark-bg" : "bg-dark-ink-1/10 text-dark-ink-1 hover:bg-dark-ink-1/20"}`}>
                  {rotulo}
                </button>
              ))
            ) : pruebaOculta ? (
              <>
                <span className="px-1 text-sm text-white/80" data-prueba-oculta>Hay una prueba que no se está mostrando</span>
                {/* «Mostrarla» sólo sin nadie identificado (`privadoPara`
                    null). Con un proveedor fijado, la prueba oculta es de
                    OTRO —la punta de Alpina en la reunión de Diana— y el
                    botón le pasaba la pantalla a Alpina delante de Diana. */}
                {privadoPara === null && (
                  <button
                    onClick={() => mostrarAlProveedor(pruebaOculta.fixtureId, pruebaOculta.cara)}
                    className="rounded-full bg-dark-ink-1 px-3.5 py-1.5 text-sm font-semibold text-dark-bg transition-colors">
                    Mostrarla
                  </button>
                )}
              </>
            ) : (
              <span className="px-1 text-sm text-white/70">Modo presentación</span>
            )}
            {/* Salir de la pantalla completa no apaga Presentar (ver
                `pantallaCompleta`): se vuelve desde acá, con un clic, que es
                el gesto que el navegador pide. */}
            {!pantallaCompleta && typeof document !== "undefined" && document.fullscreenEnabled && (
              <button onClick={pedirPantallaCompleta} data-volver-pantalla-completa
                className="rounded-full bg-dark-ink-1/10 px-3.5 py-1.5 text-sm font-semibold text-dark-ink-1 hover:bg-dark-ink-1/20 transition-colors">
                Pantalla completa
              </button>
            )}
            <button onClick={() => setPresentationMode(false)}
              className="rounded-full bg-dark-ink-1/10 px-3.5 py-1.5 text-sm font-semibold text-dark-ink-1 hover:bg-dark-ink-1/20 transition-colors">
              Salir
            </button>
          </HudQueSeEsconde>
        )}

        {/* MEJORA 8: First-person overlay instructions */}
        {firstPerson && (
          <div className="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none z-10">
            <div className="rounded-xl border border-white/10 bg-black/50 p-3 backdrop-blur-sm text-xs text-white/70 space-y-1">
              <p className="font-semibold text-white/90 mb-2">Modo Primera Persona</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Clic</kbd> para capturar el mouse</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">WASD</kbd> para caminar</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Shift</kbd> para ir más rápido</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Esc</kbd> para soltar el mouse</p>
              <p><kbd className="bg-dark-ink-1/10 rounded px-1">Esc</kbd> y clic en el plano para saltar ahí</p>
              <button onClick={() => setFirstPerson(false)} className="pointer-events-auto mt-2 w-full rounded bg-dark-ink-1/10 hover:bg-dark-ink-1/20 px-2 py-1 text-center">
                Volver a vista orbital
              </button>
            </div>
          </div>
        )}

        {/* Minimapa: dónde estoy y para dónde miro.
            Es lo que evita perderse en primera persona, y además es el atajo
            para moverse: con el mouse suelto, un clic en el plano teletransporta.
            Caminar 40 m con WASD para ver la otra punta no lo hace nadie. */}
        {firstPerson && fixtures.length > 0 && (
          <div className="absolute bottom-4 left-4 z-10 w-[316px] overflow-hidden rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-sm">
            <MiniMapa
              fixtures={fixtures}
              ancho={300}
              altoMax={240}
              camara={camaraFP ?? undefined}
              onIrA={mouseSuelto
                ? (x, z) => setSaltarA(p => ({ x, z, n: (p?.n ?? 0) + 1 }))
                : undefined}
            />
            <p className="mt-1.5 text-center text-[10px] leading-tight text-white/60">
              {mouseSuelto
                ? "Clic en el plano para ir ahí"
                : "Esc suelta el mouse y el plano se vuelve clickeable"}
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel — hidden in presentation mode ── */}
      {selectedFix && !presentationMode && (
        <CommercialPanel
          fix={selectedFix}
          enCaminata={firstPerson}
          catalogo={catalogo}
          cargandoCatalogo={cargandoCatalogo}
          prueba={pruebaViva as Map<string, number>}
          onProbar={probarProducto}
          comoSePrueba={comoSePrueba}
          onAjustarPrueba={ajustarPrueba}
          proveedorDeReunion={proveedorDeReunion}
          onProveedorDeReunion={setProveedorDeReunion}
          onMostrar={mostrarAlProveedor}
          onRecargarCatalogo={recargarCatalogo}
          eligiendo={eligiendo}
          setEligiendo={setEligiendo}
          onCara={alCambiarCara}
          selectedSlot={selectedSlot}
          onUpdate={updateFixture}
          muebles={placedFixtures}
          onRenombrar={renombrarFixture}
          onIntercambiar={intercambiarFixtures}
          onUpdateSlot={updateSlot}
          onRotate={rotateSelected}
          onFlip={flipSelected}
          onDelete={deleteSelected}
          onClose={()=>{ setSelectedId(null); setSelectedSlotId(null); }}
          onSlotClose={()=>setSelectedSlotId(null)}
        />
      )}
    </div>
  );
}
