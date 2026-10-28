import { Fragment, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  AlertTriangle,
  RefreshCw,
  Building2,
  Plus,
  X,
  FileText,
  ChevronRight,
  Search,
  CalendarRange,
  ChevronDown,
  Handshake,
  FileSpreadsheet,
  Box,
  Layers,
  Shapes,
  // Rediseño 2026-10 (hoja de piezas): la barra de la sede, el ícono de cada
  // tarjeta y de cada cifra, y las herramientas del plano. `MapIcon` es el
  // `Map` de lucide con su otro nombre: `Map` a secas taparía el de JS.
  Tag, MapIcon, Clock, Gauge, ClipboardCheck, Table2, Percent,
  Banknote, CircleDashed, AlarmClock, PieChart, Hammer, Minus, Focus, Mouse,
  // Rediseño de Supervisar (PR 2): la chincheta del plano, la flecha de la
  // ficha, el orden de «Quién paga», Renovar y las acciones de la ficha.
  Pin, ArrowLeft, ArrowDownWideNarrow, Repeat, FilePenLine,
  // «Reservar de verdad» (rediseño, PR 3): la reserva que se acaba sola.
  Hourglass, CircleCheck,
  // Indicadores (rediseño UX 2026-10, etapa 5): bajar la tabla (CSV).
  Download,
} from "lucide-react";
import { useFixtureStore, selectFixtures, normalizeSede } from "../store/fixtureStore";
import { useFichasPropias } from "../store/fichasPropias";
import { usePlanograma } from "../store/planogramaStore";
import { tieneSuperficie } from "../utils/superficie";
import { temaActual, useTema } from "../tema";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import client, { describeError } from "../api/client";
import { listSpaceFiles, type SpaceFileMeta } from "../api/files";
import { findOrCreateSpace, updateSpaceStatus } from "../api/spaces";
import FileViewerModal from "../components/FileViewerModal";
import {
  fetchMounts, estadoMontaje, MOTIVO_LABEL,
  type MountConfirmation, type MountMotivo,
} from "../api/mounts";
import { reportesPorCodigo, reporteDelContrato } from "../utils/montajeDelContrato";
import RatesModal from "../components/RatesModal/RatesModal";
import type { Space } from "../types";
import {
  contractPhase,
  daysTakenInRange,
  footprint2D,
  fullSpaceCode,
  isDoubleGondola,
  isRentable,
  rangeAvailability,
  rateTypeOf,
  referenceRateFor,
  rateTypeLabel,
} from "../types/fixtures";
import type {
  UnifiedFixture, SpaceStatus, FaceData, RangeAvailability,
} from "../types/fixtures";
import SeasonPicker, { describeRange, hoyComoRango, type DateRange } from "../components/SeasonPicker/SeasonPicker";
import Libera from "../components/Libera/Libera";
import ModoVender from "../components/Contrato/ModoVender";
import { claveDePrecio, diaCorto, fechaCorta, money } from "../components/Contrato/Contrato";
import type { ResumenContrato } from "../components/Contrato/Contrato";
import Planometria from "../components/Contrato/Planometria";
import CancelarContrato from "../components/Contrato/CancelarContrato";
import CargaMasiva from "../components/CargaMasiva/CargaMasiva";
import { inclusiveDays, parseISODate, toISODate, upcomingSeasons } from "../types/seasons";
/* El parte —la zona superior escrita en prosa— salió de las dos pantallas.
   En Supervisar lo reemplaza la franja de cinco cifras: quien pone el canon no
   necesita que se le explique el negocio, necesita el dato a mano. En Vender
   lo reemplazan la escalera y el panel de tarifas, que contestan la misma
   pregunta con la fecha adentro.

   La redacción que lo armaba —`utils/parte.ts`, `utils/redaccion.ts` y
   `components/Parte/`, con sus dos suites— no viene a esta rama: cuatrocientas
   líneas que no importa nadie, más dos suites que las prueban, se leen como
   código vivo hasta que alguien pierde media hora averiguando que no lo es.
   Quedan en la historia de `claude/retail-espacios-continue-jdn085`, que es
   donde hay que ir a buscarlas si el parte vuelve. */
import { nombreDeMueble, nombreAnterior, nombresChocados, choqueDeRotulo } from "../utils/nomenclatura";
import { conNombrePropio, nombreDeTarifa, tipoDelMueble, type NombresPropios } from "../catalogo/nombresPropios";
import type { CaraElegida, SemillaContrato } from "../components/Contrato/Contrato";
import { fechaEnCurso } from "../utils/propuesta";
import { espaciosSinMueble } from "../utils/espaciosSinMueble";
import { contratosSinMueble, type ContratoSinMueble } from "../utils/auditoriaDesfase";
import { repartirAnchos, type Columna as ColumnaTabla } from "../utils/anchosTabla";
import {
  alTocarEnVender, alternarParte, cantidadDe, claseDe, claveDeEspacio, codigoDeParte, codigoVisibleDe, concordancia,
  disponibilidadDeCara, disponibilidadDeEspacio, divisionDe, esDivision, esPieza, estadoDeEspacio, indiceDePartes,
  partesDe, partirClave, partirCodigo, piezasDe, piezasDeLaFamilia, seVendeAlgo, sufijoDeParte,
  tarifaDeLaFila, textoDeParte, comoSeLiberaLaCara, type ComoSeLibera, type EnContrato, type IndiceDePartes, type ParteRef,
  comoSeLiberaPorParticipacion, dispoDeParticipacion, esParticipacion, ocupadoPorParticipacion, parteVisible,
  porParticipacion, textoDeLoComprometido, type ParticipacionDeLaCara,
  // Rediseño de Vender: la forma de cada línea y lo que queda del contrato
  // cuando el mueble cambia cómo se vende.
  aLaFormaNueva, conLaForma, type FormaDeLaLinea,
  // fase 2 · I4: el ámbar de Vender contado por motivo, el rótulo corto de una
  // cara por participación y lo puesto a mano que manda sobre la ocupación.
  alCerrar, comoLaVeSupervisar, conLasDeParticipacion, contarElPeriodo, desgloseDelParcial, enParte, motivoDelParcial,
  textoCortoDeParticipacion, tomadaPorLoSuyo, type CaraDelPeriodo, type ConteoDelPeriodo,
} from "../utils/partes";
// Las participaciones de cara (§4.8, §9.9, §11): la ocupación ANÓNIMA para
// Vender, Supervisar y el plano (store de LECTURA, el de edición es del 3D) y
// los bloques de Supervisar, sólo para quien administra.
import { claveDeSede, useOcupacionStore } from "../store/ocupacionStore";
import { useArmazon } from "../store/armazonStore";
import Cajon from "../components/Armazon/Cajon";
import Inicio, { type FilaDeHoy } from "../components/Inicio/Inicio";
import LineaDeTiempo from "../components/Ficha/LineaDeTiempo";
import ParaQueFechas from "../components/Contrato/ParaQueFechas";
import LineaDeLaSede from "../components/Contrato/LineaDeLaSede";
import { armarCarriles, type Carril } from "../utils/lineaDeLaSede";
import Resumen, { type DatosDelResumen, type PeriodoDelResumen } from "../components/Indicadores/Resumen";
import Detalle, { type DatosDelDetalle } from "../components/Indicadores/Detalle";
import TodasLasSedes, { type FilaDeSede } from "../components/Indicadores/TodasLasSedes";
import Diccionario from "../components/Indicadores/Diccionario";
import {
  aCsv, bajarCsv, canonContraTarifa, diasHasta, diasSinContrato, montajesDelMes, venceEn, variacion,
  type EstadoDeMontaje,
} from "../utils/indicadores";
import { getMetas, getSerieDeCanon, metaDeLaSede, type Metas, type SerieDeCanon } from "../api/indicadores";
import { getLineaDeLaSede, type FilaDeLaLinea } from "../api/spaces";
import { sumarDias as sumarDiasIso } from "../utils/meses";
import type { OcupacionOut, TerminoOut } from "../api/participaciones";
import { espacioDeLaCara, leerCara } from "../api/participaciones";
// «Editar contrato»: lo que Supervisar lee de UN contrato para reabrirlo en
// Vender (administración, sin la nota). Vender no llega a este módulo
// (`probar-vender`); la edición se guarda con `api/vender.ts` (`edita`).
import { contratoParaEditar } from "../api/edicionDeContrato";
import type { EsperadoDelContrato, FotoDelContrato } from "../utils/edicionDeContrato";
import { textoDePrecioExacto } from "../utils/precioDeLista";
import type { OcupacionDeCara } from "../utils/participaciones";
import { palabraDeLaCara } from "../utils/revisarParticipaciones";
import { conPartes, type CambioDePartes } from "../utils/partesDelMueble";
import ParticipacionesDeLaCara, { useAbrirEnDistribucion } from "../components/Distribucion/ParticipacionesDeLaCara";
import RevisarParticipaciones, {
  TablaDeParticipaciones, useRevisionDeParticipaciones,
} from "../components/Distribucion/RevisarParticipaciones";
import type { EstadoPorEspacio } from "../utils/estadoComercial";
import { partesConEstado } from "../utils/partesDelMueble";
import { revisarImportacion, aplicarImportacion, type Importacion } from "../api/layout";
// Rediseño de Vender (PR 1): lo que Supervisar revisa de los cobros por % de
// las ventas y de las reservas de espacio. SÓLO Supervisar y sólo quien
// administra: Vender no llega a este módulo (`probar-vender`).
import {
  FilaDeReserva, ReservasSinConfirmar, VentasPorCargar, useCobrosPorVentas, useReservasDeEspacio,
} from "../components/Supervisar/CobrosYReservas";
// Rediseño de Supervisar (PR 2): «Falta planometría», la plata en una unidad
// (`Al mes | Total`), los tres grupos de «Para revisar» y sus piezas. SÓLO
// Supervisar: Vender no llega a ninguno de estos módulos (`probar-vender`).
import { FaltaPlanometria, useFaltaPlanometria } from "../components/Supervisar/FaltaPlanometria";
import {
  claveDeSupervision, PlanogramasPorRevisar, SECCION_DE_SUPERVISION, usePlanogramasPorRevisar,
} from "../components/Supervisar/PlanogramasPorRevisar";
import { PrecioSinForma, usePrecioSinForma } from "../components/Supervisar/PrecioSinForma";
// La supervisión de los planogramas (fase 4): la ficha y la guía, a pedido.
const RevisarMontaje = lazy(() => import("../components/Supervision/RevisarMontaje"));
const VerGuia = lazy(() => import("../components/Guia/VerGuia"));
import type { MontajePendiente } from "../api/montajesPendientes";
import type { CobroPorVentas } from "../api/cobros";
import type { ReservaDeEspacio } from "../api/reservas";
import {
  ROTULO_DEL_VALOR, enLaUnidad, tarifaEnLaUnidad, textoCortoDelCobro, textoDelCobro,
  type UnidadDePlata,
} from "../components/Supervisar/plata";
import { useUnidadDePlata } from "../components/Supervisar/useUnidadDePlata";
// «Bajo tarifa» (el contrato al mes contra la tarifa): lo cuenta `kpis`, que
// corre también con Vender abierto, así que vive en `utils/meses`, no en la
// plata de Supervisar.
import { bajoLaTarifa } from "../utils/meses";
import {
  DIAS_SIN_MONTAR_EN_ROJO, SECCION_DE_PARTICIPACIONES, avisoPorClave, contarPorGrupo, cuentaDelBadge,
  deParticipacionesEn, diasDelRenglon, grupoDelAviso, grupoParaAbrir, puntosDelPlano, tituloDeSeccion,
  type Aviso, type Chincheta, type GrupoDeRevision,
} from "../components/Supervisar/paraRevisar";
import { EncabezadoDeSeccion, Mira, PestanasDeRevision, SelectorDePlata } from "../components/Supervisar/piezas";
import {
  ALTURA, UNIDAD_ISO, VISTA_INICIAL, ZOOM_MAX, ZOOM_MIN, encuadreInicial, enElMundo, ejes,
  esquinasDelLado, factorDeRueda, girar, ladosVisibles, ordenDePintado, proyectar, sombraDelLado,
  type Huella, type Lado, type Vista,
} from "../utils/camaraPlano";

// ─── Date / money helpers ────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  // Parse both sides as local date components to avoid UTC-vs-local off-by-one.
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Plata, SIEMPRE entera: «$ 1.400.000», nunca «1,4 M» ni «850 k» (regla del
 *  dueño al aprobar la hoja de piezas, 2026-10). Es `money` del contrato, la
 *  misma cuenta en las dos pantallas; cero o nada es «—».
 *
 *  Acá vivía `compactCOP` («$1,4 M» / «$850 k») para la fila «Bajo tarifa de
 *  referencia», «donde los montos enteros chocan». Se fue: un monto abreviado
 *  obliga a hacer la cuenta para saber cuánto es, y la fila cede el proveedor
 *  antes que la cifra. `probar-vender` falla si vuelve una abreviatura. */
function formatCOP(n: number): string {
  if (!n) return "—";
  return money(n);
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDate(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return s;
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

/** Compact contract period for one-line rows: "8 jul → 15 jul 2026". */
function formatRange(start: string, end: string): string {
  if (!start && !end) return "—";
  const short = (s: string) => {
    const [, m, d] = s.split("-").map(Number);
    return d && m >= 1 && m <= 12 ? `${d} ${MONTHS_ES[m - 1]}` : s;
  };
  return `${start ? short(start) : "—"} → ${end ? formatDate(end) : "—"}`;
}

// ─── Faces (a double gondola counts as 2 rentable units) ─────────────────────

interface FaceEntry {
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** Backend Space code: face A = full fixture code, face B = code + "-B". */
  code: string;
  status: SpaceStatus;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  /** Vender por partes: la parte (`PU2`) si la fila es una parte de esta
   *  cara, con su propio contrato. `code` es entonces el de la parte
   *  (`NEV-03-PU2`). Sin esto, la cara entera, como siempre. */
  parte?: ParteRef | null;
  /** Una RESERVA viva (rediseño de Vender, §8), no un contrato: hasta cuándo
   *  se sostiene. Sólo en Supervisar y sólo para quien administra
   *  (`conLaReserva`); con esto la fila va como «Reservado» y no suma canon,
   *  contratos, vencimientos ni montaje. */
  reservaHasta?: string | null;
  /** La toma una reserva (con o sin `reservaHasta`): al trabajador le llega
   *  sólo esto, sin fecha (`conLaReserva`). */
  reservado?: boolean;
  /** El contrato que dibuja la fila (`leaseId` de `GET /spaces/comercial`,
   *  sólo para quien administra; `conLaReserva` lo lee del mapa crudo, como
   *  `reservaHasta`). «Editar contrato» abre ESE contrato. */
  leaseId?: number | null;
  /** El PRÓXIMO contrato de la misma cara o parte, cuando hay uno vigente
   *  (`proximoLeaseId`, sólo para quien administra, del mapa crudo): «Editar el
   *  próximo contrato» de la ficha abre ESE. */
  proximoLeaseId?: number | null;
}

/** Vender, cuando el Plano no deja cambiar cómo se vende un mueble: sin el
 *  mensaje del servidor, que puede nombrar a otro proveedor (`venderAsi`). */
const NO_SE_CAMBIO_LA_FORMA = "No se pudo cambiar cómo se vende: tiene algo vendido o tomado. Revisalo en el Plano.";

/** ¿El mueble se vende igual? (`partes` sin los vacíos, y `entrepanos`): con
 *  eso, volver a la forma de antes en una edición deja de estar pendiente. */
function mismasPartes(
  a: { partes?: object | null; entrepanos?: number | null },
  b: { partes?: object | null; entrepanos?: number | null },
): boolean {
  const limpio = (p?: object | null) => JSON.stringify(Object.entries(p ?? {})
    .filter(([, v]) => v !== null && v !== undefined).sort(([x], [y]) => x.localeCompare(y)));
  return limpio(a.partes) === limpio(b.partes) && (a.entrepanos ?? null) === (b.entrepanos ?? null);
}

/** «Cargar planometría» de «Para revisar»: el contrato que la espera. */
interface PlanometriaPedida {
  /** El código completo del espacio del contrato (`CENTRO-GON-01-PC2`). */
  codigo: string;
  /** El contrato: puede arrancar más adelante (no es el `active_lease`). */
  leaseId: number;
  /** El código como se lee (`GON-01·A·PC2`). */
  rotulo: string;
}

/** Supervisar: una cara o una parte TOMADA por una reserva viva no es un
 *  contrato. La base la manda `occupied` con su proveedor, sus fechas y su
 *  precio (`GET /spaces/comercial`, con `reservaHasta` sólo para quien
 *  administra); acá pasa a «Reservado» con su fecha, y con eso queda fuera del
 *  canon, de «N contratos», de «Por vencer», de «Contratado sin montar», de
 *  «Quién paga el canon» y del bajo tarifa (`contractPhase` = sin contrato).
 *  Vender no pasa por acá: la ve «Tomado», sin decir que es una reserva.
 *  Al trabajador la base le manda sólo `reservado` (ni fecha, ni plata, ni
 *  proveedor): va «Reservado» a secas, y no cae en «Ocupado sin contrato». */
function conLaReserva(e: FaceEntry, estado: EstadoPorEspacio, sede: string): FaceEntry {
  const corto = (e.code || "").trim().toUpperCase();
  const suyo = estado[fullSpaceCode(e.fixture.sede || sede, corto)] ?? estado[corto];
  if (suyo?.reservaHasta) return { ...e, status: "reserved", reservaHasta: suyo.reservaHasta, reservado: true };
  // Al trabajador le llega sólo la marca (sin fecha, plata ni proveedor): va
  // «Reservado» a secas, y no «Ocupado sin contrato» en Corregir.
  if (suyo?.reservado) return { ...e, status: "reserved", reservado: true };
  // El contrato que dibuja la fila (sólo le llega a quien administra): como
  // `reservaHasta`, del mapa crudo; la fusión no se lo pega al mueble.
  if (typeof suyo?.leaseId !== "number") return e;
  return typeof suyo.proximoLeaseId === "number"
    ? { ...e, leaseId: suyo.leaseId, proximoLeaseId: suyo.proximoLeaseId }
    : { ...e, leaseId: suyo.leaseId };
}

const EMPTY_FACE: FaceData = {
  supplierName: "", brandCategory: "", negotiatedValue: 0,
  startDate: "", endDate: "", observation: "", status: "free",
};

function facesOf(f: UnifiedFixture): FaceEntry[] {
  const faceA: FaceEntry = {
    fixture: f, face: "A", code: f.code,
    status: f.status,
    supplierName: f.supplierName, brandCategory: f.brandCategory,
    negotiatedValue: f.negotiatedValue,
    startDate: f.startDate, endDate: f.endDate, observation: f.observation,
  };
  if (!isDoubleGondola(f)) return [faceA];
  const b = f.faceB ?? EMPTY_FACE;
  return [
    faceA,
    {
      fixture: f, face: "B", code: `${f.code}-B`,
      status: b.status,
      supplierName: b.supplierName, brandCategory: b.brandCategory,
      negotiatedValue: b.negotiatedValue,
      startDate: b.startDate, endDate: b.endDate, observation: b.observation,
    },
  ];
}

/** El código como se LEE, no como se guarda.
 *
 *  Una góndola doble guarda la cara A con el código pelado (`GON-60`) y la B
 *  con sufijo (`GON-60-B`), porque así se llaman los espacios en la base. En
 *  pantalla eso queda asimétrico: dos filas contiguas, una «GON-60» y otra
 *  «GON-60-B», y hay que deducir que la primera es una cara y no el mueble
 *  entero. Se muestran `GON-60·A` y `GON-60·B`, que es como las nombra
 *  cualquiera que las esté mirando. El código de la base no se toca: es el que
 *  viaja a la API y en los enlaces de los correos. */
/** ¿Hay algo que renovar acá?
 *
 *  Un contrato con proveedor que se cae dentro de 60 días o que ya se cayó.
 *  Antes de eso el botón sería una trampa: crearía un contrato que arranca
 *  dentro de meses y se solapa con uno que sigue vivo. 60 y no 30 porque una
 *  punta de góndola grande se empieza a hablar con dos meses de anticipación.
 */
const DIAS_PARA_RENOVAR = 60;

function renovable(entry: FaceEntry): boolean {
  // Una reserva no se renueva: se confirma o se cancela («Reservas»).
  if (entry.reservaHasta || !entry.supplierName.trim() || !entry.endDate) return false;
  const dias = daysUntil(entry.endDate);
  return dias !== null && dias <= DIAS_PARA_RENOVAR;
}

function codigoVisible(entry: FaceEntry): string {
  if (entry.parte) return codigoVisibleDe(entry.fixture.code, entry.face, isDoubleGondola(entry.fixture), entry.parte);
  if (!isDoubleGondola(entry.fixture)) return entry.code;
  return entry.face === "B" ? `${entry.fixture.code}·B` : `${entry.fixture.code}·A`;
}

/** Una cara que se puede ofrecer en el periodo elegido. */
interface Disponible {
  code: string;
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** El primer día en que queda libre. Ausente = libre desde el arranque. */
  desde?: Date;
  /** Libre desde el arranque y tomada más adelante: el último día libre
   *  (`ultimoDiaLibreDesdeElArranque`), como el rótulo del plano. */
  hasta?: Date;
  /** Parcial por sus partes: «1 de 3 puertas vendida», en vez del día. */
  porPartes?: string;
  /** La cara se vende por participación: no se suma al contrato de Vender
   *  (se carga en el Editor 3D → Distribución). */
  porParticipacion?: true;
}

/** Desde cuándo se puede ofrecer una cara que está tomada parte del periodo.
 *
 *  Se cuenta día por día en vez de sumarle uno a la fecha de fin del contrato,
 *  que es lo que uno escribiría primero: esa cuenta se equivoca en los dos
 *  casos que de verdad aparecen —un contrato que ARRANCA en el medio de la
 *  ventana, donde el día libre es el primero y no el último, y una cara con dos
 *  contratos que dejan un hueco entre medio—. Son 31 días y cinco caras: la
 *  cuenta directa cuesta nada y no puede estar mal. */
function primerDiaLibre(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  from: Date,
  to: Date,
): Date | undefined {
  const dia = 86_400_000;
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0);
  const fin = new Date(to); fin.setHours(0, 0, 0, 0);
  for (let t = d0.getTime(); t <= fin.getTime(); t += dia) {
    const d = new Date(t);
    if (daysTakenInRange(face, d, d) === 0) return d;
  }
  return undefined;
}

/** Si la cara está libre desde el ARRANQUE del periodo y se toma más adelante
 *  (un contrato o una reserva que empiezan después), el último día libre de
 *  ese primer tramo; si no, `null`. Con eso el rótulo dice «libre hasta 31 oct»
 *  y no «libre 19 oct», que se lee como «se libera el 19 oct». Lo mismo para
 *  un contrato que para una reserva: las dos llegan `occupied` con sus fechas. */
function ultimoDiaLibreDesdeElArranque(
  face: { status: SpaceStatus; startDate?: string; endDate?: string },
  desde: Date, from: Date, to: Date,
): Date | null {
  const dia = 86_400_000;
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(desde); d1.setHours(0, 0, 0, 0);
  const fin = new Date(to); fin.setHours(0, 0, 0, 0);
  if (d1.getTime() !== d0.getTime()) return null;
  let ultimo: Date | null = null;
  for (let t = d0.getTime(); t <= fin.getTime(); t += dia) {
    const d = new Date(t);
    if (daysTakenInRange(face, d, d) > 0) return ultimo;
    ultimo = d;
  }
  return null;
}

/** Faces that take part in the COMMERCIAL picture.
 *
 *  A non-rentable fixture (a column, a checkout, a free zone) is part of the
 *  store but is not sellable space, so it must not inflate the totals, dilute
 *  the occupancy percentage or turn up as an available space in search. It is
 *  still drawn on the map — see `facesOf`, which every render path uses. */
function commercialFacesOf(f: UnifiedFixture): FaceEntry[] {
  return isRentable(f) ? facesOf(f) : [];
}

/** La llave de una fila: `${id}-${cara}` para una cara y `${id}-${cara}-PU2`
 *  para una parte (`claveDeEspacio`). */
function claveDeFila(e: FaceEntry): string {
  return claveDeEspacio(e.fixture.id, e.face, e.parte ? sufijoDeParte(e.parte) : null);
}

/** Una parte de una cara como fila de Supervisar, con lo que la BASE dice de
 *  ella (el mapa crudo: la fusión no la conoce). */
function entradaDeParte(
  f: UnifiedFixture, face: "A" | "B", parte: ParteRef, estado: EstadoPorEspacio, sede: string,
): FaceEntry {
  const e = estadoDeEspacio(f, face, parte, estado, sede);
  return {
    fixture: f, face, parte, code: codigoDeParte(f.code, face, parte),
    status: e.status as SpaceStatus, supplierName: e.supplierName, brandCategory: e.brandCategory,
    negotiatedValue: e.negotiatedValue, startDate: e.startDate, endDate: e.endDate, observation: e.observation,
  };
}

/**
 * Vender por partes: las partes de las caras comerciales del mueble que tienen
 * algo en la base (un contrato que corre o firmado, o retiradas a mano), como
 * filas propias. Son contratos como cualquier otro: plata, vencimientos,
 * montaje, renovar y cancelar. Una parte libre no es fila: la cara ya lo dice.
 *
 * También las que el mueble hoy no ofrece (un `PU3` firmado antes de bajar a
 * dos puertas no se puede, el servidor lo frena; pero si llega, se ve).
 *
 * Y las PIEZAS de lo que no se vende entero (la bahía de impulso de una caja,
 * el forro de una columna): la caja no es una cara comercial, pero sus bahías
 * vendidas son contratos como cualquier otro.
 */
function partesConContrato(
  f: UnifiedFixture, estado: EstadoPorEspacio, indice: IndiceDePartes, sede: string,
  /** Las participaciones (`…-PC3`) cuelgan de su cara sólo para quien
   *  administra: el trabajador no ve participaciones en Supervisar (D7). */
  conParticipaciones = true,
): FaceEntry[] {
  const soloPiezas = !isRentable(f);
  if (soloPiezas && piezasDeLaFamilia(f.type).length === 0) return [];
  const fuera: FaceEntry[] = [];
  for (const { face } of facesOf(f)) {
    const caraCorta = codigoDeParte(f.code, face, null);
    const caraCompleta = fullSpaceCode(f.sede || sede, caraCorta);
    const vistas = new Set<string>();
    const conAlgo = [...(indice.get(caraCompleta) ?? []), ...(caraCompleta !== caraCorta ? indice.get(caraCorta) ?? [] : [])]
      .filter((o) => o.partido.parte && o.estado.status !== "free" && (!soloPiezas || esPieza(o.partido.parte)))
      .filter((o) => parteVisible(o.partido.parte, conParticipaciones))
      .filter((o) => {
        const k = sufijoDeParte(o.partido.parte!);
        if (vistas.has(k)) return false;
        vistas.add(k);
        return true;
      })
      .sort((a, b) => (a.partido.parte!.n ?? 0) - (b.partido.parte!.n ?? 0));
    for (const { partido } of conAlgo) fuera.push(entradaDeParte(f, face, partido.parte!, estado, sede));
  }
  return fuera;
}

/** Cómo cuenta una CARA en los totales cuando se vende por partes: si la
 *  entera está libre pero hay puertas que corren, la cara está trabajando
 *  (`active`); si sólo hay puertas firmadas, `committed`. Sin partes, lo suyo.
 *
 *  Una cara POR PARTICIPACIÓN cuenta igual, con sus contratos `…-PC3` como
 *  partes (la misma regla que las puertas). Una reserva provisional no la hace
 *  «trabajar» (no es una venta), pero si hoy la deja sin lugar
 *  (`sinLugarHoy`, de la ocupación) la saca de «Libres»: cuenta como apartada. */
function estadoDeUnidad(cara: FaceEntry, partes: FaceEntry[], sinLugarHoy = false): DisplayStatus {
  const propio = displayStatus(cara);
  const libreOApartada: DisplayStatus = propio === "free" && sinLugarHoy ? "reserved" : propio;
  if (propio !== "free" || partes.length === 0) return libreOApartada;
  const de = partes.map((p) => displayStatus(p));
  if (de.some((d) => d === "active" || d === "expiring")) return "active";
  if (de.some((d) => d === "committed")) return "committed";
  return libreOApartada;
}

/** Una cara sin nada comprometido en la ocupación: la sede se leyó y esa cara
 *  no está (el servidor todavía no la ve por participación, o no tiene nada). */
const OCUPACION_VACIA: OcupacionDeCara = { intervalos: [], fisicos: [] };

/** La ocupación anónima de UNA cara por participación, con el `hoy` del
 *  servidor, o `undefined` si el mueble no se vende por participación o la
 *  sede todavía no se leyó (entonces todo sigue como antes). El código de la
 *  cara se arma con la sede del PLANO, como `carasPorParticipacion` y el
 *  servidor (nunca con el campo `sede` del mueble). */
function participacionDeLaCara(
  ocupacion: OcupacionOut | undefined, f: UnifiedFixture, cara: "A" | "B", sede: string,
): ParticipacionDeLaCara | undefined {
  if (!ocupacion || !porParticipacion(f)) return undefined;
  const codigo = fullSpaceCode(sede, codigoDeParte(f.code, cara, null));
  const o = Object.prototype.hasOwnProperty.call(ocupacion.caras, codigo) ? ocupacion.caras[codigo] : OCUPACION_VACIA;
  return { ocupacion: o, hoy: ocupacion.hoy };
}

/** Cómo está HOY una cara por participación (para la palabra de su estado y
 *  los totales), o `null` si no se vende así o no se sabe todavía. */
function useDispoDeHoy(fixture: UnifiedFixture, cara: "A" | "B") {
  const sede = useFixtureStore((s) => s.sede);
  const cliente = useAuthStore((s) => s.cliente) ?? "";
  const ocupacion = useOcupacionStore((s) => s.ocupacion[claveDeSede(cliente, sede)]);
  const par = participacionDeLaCara(ocupacion, fixture, cara, sede);
  return par ? dispoDeParticipacion(fixture, par, par.hoy, par.hoy) : null;
}

/** Cuántos días atrás sigue teniendo sentido reclamar un montaje sin reportar.
 *
 *  Pasado ese plazo el espacio está armado hace rato y lo que falta es el
 *  papel, no la exhibición. */
const VENTANA_MONTAJE_DIAS = 30;

// ─── Display status (used by the table) ──────────────────────────────────────

type DisplayStatus =
  | "active" | "committed" | "expiring" | "expired" | "no_contract"
  | "reserved" | "maintenance" | "free";

/** Reading of one face TODAY.
 *
 *  `committed` is the state that used to be missing: a contract that is signed
 *  but has not started yet. Without it, booking a December end-cap in August
 *  painted the space occupied for four months — the plan said "taken" while
 *  the backend would happily have sold those months to someone else. */
function displayStatus(f: { status: SpaceStatus; startDate?: string; endDate: string }): DisplayStatus {
  if (f.status === "free")        return "free";
  if (f.status === "reserved")    return "reserved";
  if (f.status === "maintenance") return "maintenance";
  if (f.status !== "occupied")    return "free";
  const phase = contractPhase(f);
  if (phase === "sin_contrato")   return "no_contract";
  if (phase === "pendiente")      return "committed";
  if (phase === "vencido")        return "expired";
  // Running with a start date but no end: an open-ended contract, not a
  // missing one. Calling it "no_contract" here contradicted contractPhase,
  // which already counted its money as current revenue, and polluted the
  // very alert meant to surface spaces occupied without paperwork.
  if (!f.endDate)                 return "active";
  return daysUntil(f.endDate) <= 30 ? "expiring" : "active";
}

/** Cada estado con su terna: color de tinta, fondo tintado y borde.
 *
 *  `fill` estaba declarado desde siempre y no lo usaba nadie: la pastilla de
 *  estado salía del MISMO fondo para los ocho, y lo único que cambiaba era un
 *  punto de 6 px. Un «Vencido» y un «Activo» se veían iguales de reojo, que es
 *  justo como se mira una tabla de 126 filas.
 *
 *  Fondo tintado MÁS borde —y no fondo solo— es el patrón que usan los
 *  tableros comerciales que se ven caros; el borde es lo que le da el canto y
 *  evita que la pastilla se disuelva contra la fila. */
const STATUS_META: Record<
  DisplayStatus,
  { ring: string; fill: string; edge: string; label: string }
> = {
  active:      { ring: "var(--success)",      fill: "var(--success-50)", edge: "var(--success-100)", label: "Activo" },
  committed:   { ring: "var(--accent-700)",   fill: "var(--accent-50)",  edge: "var(--accent-100)",  label: "Contratado" },
  expiring:    { ring: "var(--warning)",      fill: "var(--warning-50)", edge: "var(--warning-100)", label: "Por vencer" },
  expired:     { ring: "var(--danger)",       fill: "var(--danger-50)",  edge: "var(--danger-100)",  label: "Vencido" },
  no_contract: { ring: "var(--danger)",       fill: "var(--danger-50)",  edge: "var(--danger-100)",  label: "Sin contrato" },
  reserved:    { ring: "var(--warning)",      fill: "var(--warning-50)", edge: "var(--warning-100)", label: "Reservado" },
  maintenance: { ring: "var(--muted-status)", fill: "var(--surface-3)",  edge: "var(--line)",        label: "Mantenim." },
  free:        { ring: "var(--ink-3)",        fill: "var(--surface-2)",  edge: "var(--line)",        label: "Libre" },
};

// ─── Map search + status filter (product geolocation) ────────────────────────

/** Los filtros que comparten el plano y la tabla.
 *
 *  `sin_montar` no sale del estado del contrato sino de los reportes del
 *  mercaderista, así que es el único que necesita un dato de afuera: quien
 *  filtra pasa el conjunto de caras sin reportar. Está acá y no en una lista
 *  aparte porque es una de las cuatro preguntas que se le hacen a esta tabla,
 *  y tener tres filtros en un lugar y el cuarto en otro es de las cosas que
 *  obligan a aprenderse la pantalla. */
type MapFilter =
  | "todos" | "free" | "occupied" | "committed" | "expiring" | "expired"
  | "sin_montar" | "en_parte";


/** Accent- and case-insensitive comparison base. */
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** `q` must already be normalized. Checks face fields plus fixture identity.
 *
 *  Con `nombres` (el nombre propio de cada familia, `catalogLabels`) se
 *  encuentra también por cómo le dicen acá: «mamut» lleva a las estibas. El
 *  nombre de RECABRA sigue encontrando lo mismo que antes. */
function faceMatchesQuery(entry: FaceEntry, q: string, nombres: NombresPropios): boolean {
  return [
    entry.brandCategory,
    entry.supplierName,
    entry.fixture.label,
    conNombrePropio(entry.fixture, nombres, ""),
    // El nombre VIEJO del mueble. Ya no se dibuja en ningún lado, pero la
    // cartelería de la góndola y el papel del proveedor pueden seguir
    // diciéndolo: buscar por él tiene que llevar igual al mueble. Sale de
    // `nombreAnterior`, que es lo que sobrevive a la renumeración; leer
    // `nomenclatura` a secas no servía, porque renumerar la borra y el
    // buscador se quedaba sin el único dato que reconcilia el cartel viejo
    // con el mueble de hoy.
    nombreAnterior(entry.fixture) ?? "",
    entry.code,
    // El TIPO —«punta», «impulsador»—: es la segunda columna de la tabla y la
    // pregunta más común que se le hace («¿qué impulsadores tengo libres?»).
    rateTypeLabel(rateTypeOf(entry.fixture)),
    tipoDelMueble(entry.fixture, nombres),
  ].some((s) => s && normalizeText(s).includes(q));
}

function faceMatchesFilter(
  entry: FaceEntry,
  filter: MapFilter,
  /** Claves (`claveDeFila`) de las caras y partes contratadas y sin reportar. */
  sinMontar?: Set<string>,
  /** Claves (`id-cara`) de las caras vendidas en parte en el periodo: con
   *  partes vendidas o por participación con algo comprometido. La pestaña
   *  «Vendido en parte» muestra LA CARA (no sus partes, que tienen su fila en
   *  «Todas»): así su cuenta es la de la clave del plano. */
  enParte?: Set<string>,
  /** Claves (`id-cara`) de las caras libres en el periodo, sin nada tomado.
   *  Con esto «Libres» es esa cuenta (la de la clave del plano) y no el estado
   *  de HOY de cada fila, que dejaba pasar una cara con una parte o una
   *  participación vendida. */
  libres?: Set<string>,
): boolean {
  if (filter === "todos") return true;
  if (filter === "sin_montar") {
    return sinMontar ? sinMontar.has(claveDeFila(entry)) : false;
  }
  if (filter === "en_parte") {
    return enParte ? !entry.parte && enParte.has(`${entry.fixture.id}-${entry.face}`) : false;
  }
  if (filter === "free" && libres) return !entry.parte && libres.has(`${entry.fixture.id}-${entry.face}`);
  const ds = displayStatus(entry);
  // "Ocupados" means earning today. A committed-but-not-started contract is
  // neither occupied nor available, so it answers to its own chip.
  if (filter === "occupied") return ds === "active" || ds === "expiring";
  if (filter === "committed") return ds === "committed";
  if (filter === "free") return ds === "free";
  if (filter === "expiring") return ds === "expiring";
  return ds === "expired";
}

/** Per-fixture face flags (aligned with facesOf order) + matched-face count. */
interface MapMatch {
  faceFlags: Map<string, boolean[]>;
  count: number;
}

// ─── Card shell ───────────────────────────────────────────────────────────────

/** Un panel. Blanco sobre el papel, una línea de 1px y 3px de esquina.
 *
 *  No lleva sombra: separar con una línea dice dónde termina una cosa y
 *  empieza otra sin fingir profundidad. Es la única caja del sistema —el mapa,
 *  el contrato, la tabla y los pendientes son todos esto—, y por eso ninguno
 *  se lee como «el widget importante»: la jerarquía la dan el tamaño y la
 *  posición, no el peso del borde. */
function Card({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-xl)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Encabezado de panel ──────────────────────────────────────────────────────

/** El ícono de una tarjeta, de una cifra o de un botón: UN tamaño y UN trazo
 *  en toda la pantalla (hoja de piezas del rediseño, 2026-10: «16 px y trazo
 *  1,75 en todos lados: tarjeta, cifra, campo y botón»). El color lo pone
 *  quien lo dibuja: gris en reposo, tinta plena si está activo, rojo sólo en
 *  una cifra que es alarma. Nunca amarillo. Lo comparten Vender y Supervisar:
 *  es un objeto de tres números, no dibuja nada de ninguna de las dos. */
const ICONO_TARJETA = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Título, aclaración y lo que vaya a la derecha, todos sobre la misma línea.
 *
 *  Sin línea divisoria abajo: el encabezado y su contenido son la misma cosa,
 *  y una regla entre los dos los parte en dos bloques que hay que volver a
 *  juntar leyendo. El aire alcanza para separarlos.
 *
 *  El ícono VOLVIÓ, con otra regla (rediseño 2026-10). Antes había un
 *  triangulito, una flechita y una lupa —uno por panel— que no decían nada
 *  que el título no dijera. Ahora es UN juego (lucide), un tamaño, un trazo y
 *  un concepto por ícono: el mismo `Tag` en la tarjeta de la tarifa y en el
 *  botón «Tarifas», el mismo `MapIcon` en el piso de Vender y en el de
 *  Supervisar. Va suelto, en gris, antes del título. */
function CardHeader({
  title,
  icon,
  sub,
  right,
}: {
  title: string;
  /** El ícono de la tarjeta (`<X {...ICONO_TARJETA} />`), antes del título. */
  icon?: React.ReactNode;
  sub?: React.ReactNode;
  /** La zona derecha: la clave del plano, los chips de filtro, «al mes». */
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        // Envuelve: a lo angosto lo de la derecha baja a su renglón y nunca
        // empuja la tarjeta de costado (390 px, sin scroll de página).
        display: "flex", alignItems: "center", gap: "6px 10px", flexWrap: "wrap",
        padding: "11px 15px 9px", flexShrink: 0, minWidth: 0,
      }}
    >
      {icon && (
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0, color: "var(--ink-2)" }}>
          {icon}
        </span>
      )}
      <h2 style={{
        fontSize: "var(--t-base)", fontWeight: 700, letterSpacing: "-0.005em",
        color: "var(--ink-1)", margin: 0, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {title}
      </h2>
      {/* El subtítulo es lo primero que cede. Sin esto el título se partía en
          dos renglones antes de que la aclaración soltara un solo píxel — y el
          título es lo único de este renglón que no se puede leer a medias. */}
      {sub && (
        <span style={{
          fontSize: "var(--t-xs)", color: "var(--ink-3)", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {sub}
        </span>
      )}
      {right && (
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 14,
          flexWrap: "wrap", justifyContent: "flex-end",
          fontSize: "var(--t-xs)", color: "var(--ink-3)", flexShrink: 1, minWidth: 0,
        }}>
          {right}
        </div>
      )}
    </div>
  );
}

// ─── Stat card (headline metrics) ────────────────────────────────────────────

/** One headline number. `meter` (0-100) draws a progress bar under the value —
 *  used for occupancy, where the ratio matters more than the raw count.
 *  `note` is a second fact on its own line: `sub` sits inline beside the value
 *  and a long one breaks across three lines in a card this narrow. */
// ─── El plano de la sede (hero) ──────────────────────────────────────────────

function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

/** LOS SIETE ESTADOS DEL CONTRATO, SOBRE LOS CUATRO COLORES VALIDADOS.
 *
 *  (Pendiente del PR 1, `docs/ESTADO.md` → «Pendientes para el PR 2»:
 *  «`DISPLAY_TOP` del plano: siete clases sobre cuatro colores validados
 *  (`active`/`expired`/`no_contract` del mismo rojo). O una paleta de siete
 *  validada, o borrar el respaldo (el mapa siempre tiene periodo)».)
 *
 *  Se resuelve por las dos puntas, y así queda escrito:
 *
 *  1. **Del PLANO se borra.** El mapa no pinta nunca por esta lectura: las dos
 *     pantallas ponen SIEMPRE un periodo (el efecto de `mapRange`: Vender
 *     arranca en treinta días, Supervisar en hoy, que es un periodo de un día),
 *     así que `topColorFor()` era código muerto desde que ese efecto existe. Un
 *     respaldo que nunca corre es un respaldo que nadie prueba. El plano pinta
 *     con `RANGE_TOP`, que es la terna VALIDADA (peor par ΔE 19,9 en
 *     dicromacia), y punto.
 *
 *  2. **De la tabla y del popover NO se borra, porque ahí se lee el CONTRATO**
 *     —vencido, comprometido, en mantenimiento— y esa distinción es el trabajo
 *     de la pantalla de Supervisar. Lo que se borra es la PALETA DE SIETE: los
 *     siete estados se apoyan ahora en los cuatro colores validados y en nada
 *     más. Se fueron los dos tintes al 60 % (`#66B39C` y `#E2B96C`), que eran
 *     los únicos dos hex del archivo que no había validado nadie.
 *
 *  Que cuatro de los siete compartan color no es una pérdida de información: la
 *  regla del sistema es que **cada estado va siempre con su palabra al lado**
 *  —`pinDe()` lleva `palabra` justamente para eso— y la identidad nunca depende
 *  sólo del color. Inventar tres matices más para separar «vencido» de
 *  «ocupado» sería elegir color a ojo, que es lo que este proyecto tiene
 *  prohibido desde que verde + naranja reprobó el validador.
 *
 *  No pueden ser `var(--x)`: `darken()` recibe un hex y le hace la cuenta a
 *  cada cara del prisma. Son EXACTAMENTE los mismos hex que `tema.css`; si
 *  alguno se despega, el que está mal es este archivo. */
const ESTADO_CLARO: Record<DisplayStatus, string> = {
  free:        "#00805A",   // --libre
  committed:   "#00805A",   // --libre  · «Contratado», con su palabra
  active:      "#D8342E",   // --ocupado
  expiring:    "#CE8A0A",   // --entra
  expired:     "#D8342E",   // --ocupado · «Vencido»
  no_contract: "#D8342E",   // --ocupado · «Sin contrato»
  reserved:    "#CE8A0A",   // --entra   · «Reservado»
  maintenance: "#AAB3BE",   // --resto
};

const ESTADO_OSCURO: Record<DisplayStatus, string> = {
  free:        "#00BE86",
  committed:   "#00BE86",
  active:      "#F4544E",
  expiring:    "#F5A524",
  expired:     "#F4544E",
  no_contract: "#F4544E",
  reserved:    "#F5A524",
  maintenance: "#33414F",
};

function colorEstado(): Record<DisplayStatus, string> {
  return temaActual() === "oscuro" ? ESTADO_OSCURO : ESTADO_CLARO;
}

/** Colours for the "available for this period" reading, which answers a
 *  different question than "what is happening today" and therefore uses its
 *  own three-way scale: sellable, negotiable, taken.
 *
 *  Verde se puede, naranja a medias, rojo no. El rojo es OSCURO a propósito:
 *  cuando el tono se colapsa —un deuteranope no separa rojo de verde por
 *  color— lo que queda es la luminosidad, y un rojo claro contra un verde
 *  medio se vuelven el mismo bloque. Medida con la misma cuenta, esta terna
 *  separa mejor que la que estaba desplegada en TODOS los pares: el peor par
 *  pasa de 13,5 a 19,9 en dicromacia y de 27,4 a 33,8 en visión normal.
 *
 *  Antes de mover uno hay que volver a correr la cuenta sobre los cinco
 *  colores del plano —los tres estados, el cuerpo y lo no comercializable—.
 *  Que «se vean distintos» no es evidencia. */
const RANGE_TOP_CLARO: Record<RangeAvailability, string> = {
  libre:   "#00805A",   // --libre
  parcial: "#CE8A0A",   // --entra
  tomado:  "#D8342E",   // --ocupado
};

const RANGE_TOP_OSCURO: Record<RangeAvailability, string> = {
  libre:   "#00BE86",
  parcial: "#F5A524",
  tomado:  "#F4544E",
};

function rangeTop(): Record<RangeAvailability, string> {
  return temaActual() === "oscuro" ? RANGE_TOP_OSCURO : RANGE_TOP_CLARO;
}

const RANGE_LABEL: Record<RangeAvailability, string> = {
  libre: "Libre todo el periodo",
  // Decía «Libre parte del periodo», que nombra el estado; después «Se libera
  // en el periodo», que nombra UNO de los tres hechos que pintan ámbar. Fase
  // 2 (2026-10-19): el ámbar es «se vende una parte» —una cara que se libera
  // adentro del periodo, una con puertas vendidas, una por participación con
  // algo comprometido— y contaba las tres como días. El desglose va en el
  // `title` del renglón (`desgloseDelParcial`).
  parcial: "Disponible en parte",
  tomado: "Tomado",
};

/** El mismo ámbar mirado desde Supervisar: lo vendido de una cara que no
 *  está tomada entera. En Supervisar el periodo por defecto es un día, y ahí
 *  el ámbar nunca es «vence dentro»: son partes o participaciones. */
const RANGE_LABEL_PARCIAL_SUPERVISAR = "Vendido en parte";

/** Infrastructure on the isometric map: present, but visibly not for sale.
 *
 *  La distinción que carga el peso no es este gris contra el del cuerpo —es
 *  color contra ausencia de color: un mueble comercializable SIEMPRE tiene la
 *  tapa pintada de un estado, y uno que no se alquila está gris entero—. Aun
 *  así los dos grises se separan más que los que estaban desplegados (7,0
 *  contra 4,1), y el orden es el correcto: la infraestructura es la más clara
 *  y se va al fondo, el mueble que se vende es más oscuro y se adelanta.
 *
 *  Las caras y el contorno salen de acá por `darken()`, así que el prisma
 *  sigue leyéndose en tres dimensiones y no queda una silueta plana. */
function noRentableTop(): string {
  // Se acerca a la superficie del piso en cada modo: en claro es más CLARO que
  // el mueble y se va al fondo; en oscuro es más OSCURO y se va al fondo
  // igual. «Irse al fondo» es acercarse al piso, no ser más claro siempre.
  return temaActual() === "oscuro" ? "#26313C" : "#DDE1E6";
}

/** El material del mueble. El cuerpo no toma el color del estado: se queda en
 *  el gris del acero y el color va en la CARA, que es lo que de verdad se
 *  vende. Una góndola doble con la cara A libre y la B tomada se veía toda
 *  roja; así se ve el mueble, y el rojo sólo en el lado que está tomado. */
function colorCuerpo(): string {
  return temaActual() === "oscuro" ? "#33414F" : "#AAB3BE";   // --resto
}
function colorCuerpoLinea(): string {
  return temaActual() === "oscuro" ? "#566779" : "#7C8794";
}
const NON_RENTABLE_LABEL = "Resto de la sala";

function pts(...points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export interface MapAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface IsoMapProps {
  fixtures: UnifiedFixture[];
  /** Las CARAS marcadas, por su llave `${fixtureId}-${cara}`. En Supervisar es
   *  una —la que se está mirando—; en Vender son todas las que van en el
   *  contrato que se está armando. Por cara y no por mueble: una góndola doble
   *  puede tener vendida una sola de sus dos caras, y la tapa se pinta por
   *  mitad. */
  selectedKeys: string[];
  /** `point` is relative to the map wrapper, and carries the wrapper's own
   *  size so the popover can flip sides and stay inside the card. */
  onSelect: (f: UnifiedFixture | null, point?: MapAnchor, cara?: "A" | "B") => void;
  /** Active search/filter result — null when no query or filter applies. */
  match: MapMatch | null;
  /** El periodo por el que se pregunta. NO es opcional: las dos pantallas
   *  tienen siempre uno puesto, y sin él el plano contestaba con la otra
   *  escala —siete clases sobre cuatro colores— donde dos estados opuestos
   *  compartían tinta. «Hoy» es un periodo de un día, que es lo que de verdad
   *  es. */
  range: DateRange;
  /** Dónde deja el plano su función de resaltado, para que la tarifa, la
   *  escalera y el contrato la llamen sin volver a pintar la escena. */
  resaltar?: React.MutableRefObject<((claves: string[] | null) => void) | null>;
  /** Cómo está una CARA en el periodo, mirando también sus partes (vender por
   *  partes: una nevera con la puerta 2 vendida se pinta «parcial»: se puede
   *  vender otra puerta). Sin esto, la cara sola, como siempre. */
  dispo?: (f: UnifiedFixture, face: FaceEntry) => RangeAvailability;
  /** Lo que dice el rótulo de una cara «parcial» POR SUS PARTES («1 de 3
   *  puertas vendida»), en vez del día en que se libera: con la puerta 2
   *  vendida, «libre 14 oct» leía como que la nevera entera se libera hoy.
   *  `null` si la cara está parcial por sus días: ahí manda la fecha. */
  porPartes?: (f: UnifiedFixture, face: FaceEntry) => string | null;
  /** Fase 2 · I4: la segunda línea CORTA del rótulo de una cara por
   *  participación en el plano («queda 45 %», «tomada», «por participación»:
   *  `textoCortoDeParticipacion`). La larga («Por participación · queda
   *  45 %») sigue en el cartel del mouse (`porPartes`): once renglones largos
   *  tapaban la sala. `null` si la cara no es por participación. */
  cortoDe?: (f: UnifiedFixture, face: FaceEntry) => string | null;
  /** Desde qué día se puede vender la cara ENTERA y cuántos días tiene libres
   *  en el periodo, mirando lo que choca con ella (`comoSeLiberaLaCara`): con
   *  la entera vendida hasta el 20 y la puerta 2 desde el 21, «libre 21 oct»
   *  era falso. Sin esto, los días de la cara sola, como siempre. */
  libreDesde?: (f: UnifiedFixture, face: FaceEntry) => { desde: Date; diasLibres: number } | undefined;
  /** SÓLO Supervisar: las chinchetas de los muebles que tienen algo en «Para
   *  revisar» (`chinchetasDe`, nada que no esté en la lista), con el color de
   *  su grupo, y qué hacer al tocar una (llevar a su aviso). Vender no las
   *  pasa nunca: delante del proveedor no hay avisos. */
  chinchetas?: readonly (Chincheta & { titulo: string })[];
  onChincheta?: (c: Chincheta) => void;
  /** SÓLO Supervisar: dónde deja el plano su función para SEÑALAR un mueble
   *  —el piso punteado alrededor y un punto con anillo— mientras se pasa el
   *  mouse (o el foco del teclado) por un renglón de «Para revisar»; `null` lo
   *  apaga y el plano queda como estaba. Imperativa, como `resaltar`: pasar por
   *  la lista no vuelve a pintar la sala. Vender no la pasa nunca. */
  senalar?: React.MutableRefObject<((foco: FocoDelPlano | null) => void) | null>;
}

/** Lo que el plano señala al pasar por un renglón de «Para revisar»: el mueble,
 *  la cara del aviso y su grupo (el color: Hoy rojo, 30 días ámbar, Corregir
 *  tinta). */
interface FocoDelPlano {
  fixtureId: string;
  cara: "A" | "B";
  grupo: GrupoDeRevision;
}

/** Cuánto se abre el piso punteado alrededor del mueble señalado, en metros. */
const MARGEN_DEL_FOCO = 0.5;

/** El aire alrededor de la sede con el que abre el plano, en unidades del
 *  isométrico de antes (`encuadreInicial`; aquel usaba 26 por lado). Con el
 *  plano al 60 % de la hoja («aire y pines») esas 26 unidades eran vacío que el
 *  piso no usaba, y en Vender cedían cuatro rótulos (PUN-03, PUN-05, GON-02·B,
 *  GON-03·A, contra uno en `main`). Con 8 el piso crece hasta llenar la caja
 *  en su lado que manda y vuelven a entrar (a 1440×900 cede sólo PUN-03, como
 *  en `main`); el piso y los muebles siguen enteros adentro —el encuadre es la
 *  caja de la sede proyectada—, con el aire justo para que el rótulo del
 *  mueble más alto no se salga por arriba. */
const MARGEN_DEL_ENCUADRE = 8;

/** Un rótulo del plano: el código del espacio y, si se libera adentro del
 *  periodo, cuándo. Dos `<tspan>` que miden lo mismo y se distinguen por peso
 *  y color, como en D.
 *
 *  Acá va lo que el rótulo DICE, que no cambia al mover la cámara. Dónde cae
 *  —el ancla— sale de la escena (`scene.anclas`), que sí se rehace con cada
 *  giro. */
interface Rotulo {
  /** `${fixtureId}-${cara}` — la misma llave con la que el contrato, la tarifa
   *  y la escalera nombran una cara. Es lo que permite que el resaltado sea
   *  una sola función. */
  clave: string;
  cod: string;
  fecha: string;
  /** Fase 2 · I4: lo que se escribe en el plano en lugar de `fecha` cuando la
   *  cara es por participación: la línea corta («queda 45 %»). */
  corto?: string;
  /** La tercera línea, y sólo la llevan los que CHOCAN: cuántos muebles de la
   *  sede se dibujan con este mismo nombre y cuál es el código de éste.
   *  «×2 · IMP-12». Vacía es lo normal.
   *
   *  Es el hallazgo grave de la fase 12 traído al sitio donde se elige: dos
   *  cajas rotuladas «IMP-08» son dos muebles distintos, los dos se pueden
   *  contratar, y el rótulo solo no dice cuál se está tocando. El código sí. */
  choque: string;
  /** Orden para deschocar: 0 el que comparte su nombre con otro mueble, 1 lo
   *  que se libera (lleva fecha), 2 lo libre, 3 lo tomado. Lo que se está
   *  vendiendo manda, y por encima de todo el aviso: un rótulo repetido que
   *  CEDE deja la colisión invisible otra vez, que es de donde venimos. */
  peso: number;
}

/** Lo que `acomodar()` necesita de cada rótulo: su ancla en unidades del plano
 *  (se rehace con cada giro de la cámara) y su caja en píxeles de pantalla
 *  (se mide una vez: el rótulo mide siempre lo mismo en pantalla). */
interface Pieza extends Rotulo {
  txt: SVGTextElement;
  hit: SVGRectElement | null;
  ax: number;
  ay: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

/** Cuánto se corre un rótulo cuando su ancla natural choca, en milésimas del
 *  largo de la sede. D corría cinco anclas a mano y todas exactamente 20
 *  unidades de su viewBox (1032,5 de ancho) en una de cuatro direcciones. Acá
 *  no puede haber lista —los muebles los pone el usuario, no un generador—,
 *  así que es la misma regla CALCULADA: un solo valor, cuatro direcciones, y
 *  el que no encuentra lugar cede. */
const DESVIO = 20 / 1032.5;

/** Separación de las dos caras de una góndola, en la misma unidad. Cada rótulo
 *  se ancla en la punta de SU cara, en direcciones opuestas. */
const SEP_CARA = 16 / 1032.5;

/** El cuerpo del rótulo, EN PÍXELES DE PANTALLA. No es un tamaño del SVG: el
 *  grupo de la escena publica `--lbl: LBL / escala`, así que el rótulo mide lo
 *  mismo se acerque o se aleje el plano. */
const LBL = 10.5;

/** Los trazos, en unidades del isométrico de antes (`UNIDAD_ISO`): escalan con
 *  el acercamiento como escalaban, y a acercamiento 1 miden lo que medían. */
const TRAZO = {
  mueble: 0.5 * UNIDAD_ISO,
  piso: 0.8 * UNIDAD_ISO,
  elegido: 1.6 * UNIDAD_ISO,
  brillo: 3.4 * UNIDAD_ISO,
  filtro: 1.3 * UNIDAD_ISO,
};

/** Lo mínimo que mide, EN PANTALLA, lo que se toca de un mueble: 44 × 44 px,
 *  el blanco para un dedo (WCAG 2.5.5). Ver `ajustarMinimos` en `IsoMap`. */
const MINIMO_AL_TOCAR = 44;

/** Dos cajas se pisan si se cruzan y también si se acercan a menos de esto: un
 *  rótulo pegado a otra letra se lee mal aunque no la toque. */
const AIRE_TXT = 2;

function cruza(a: Caja, b: Caja): boolean {
  return a.left - AIRE_TXT < b.right && b.left - AIRE_TXT < a.right
      && a.top - AIRE_TXT < b.bottom && b.top - AIRE_TXT < a.bottom;
}
interface Caja { left: number; top: number; right: number; bottom: number }

/** Qué gesto está en curso sobre el plano. Los del Editor 3D (`OrbitControls`):
 *  izquierdo gira, derecho mueve, el del medio acerca; con Shift, Ctrl o ⌘ el
 *  izquierdo mueve y el derecho gira. Dos dedos, acercar y mover a la vez. */
type Gesto = "girar" | "mover" | "acercar" | "pellizco";

/**
 * EL PLANO DE LA SEDE — el mismo en Vender y en Supervisar.
 *
 * Abre como abrió siempre —el isométrico, encuadrado igual— y se mueve con los
 * gestos del Editor 3D: la cámara está en `utils/camaraPlano.ts`, que es donde
 * se explica por qué es la misma y en qué no. «Centrar» vuelve a esa vista.
 *
 * La cámara son dos cosas y no una:
 *
 *  · **Hacia dónde mira** (azimut y polar) es ESTADO de React: girarla cambia
 *    qué lados de cada mueble se ven y en qué orden se pintan, así que la
 *    escena se vuelve a armar. Durante un arrastre se pide un cuadro por vez.
 *  · **Cuánto se acerca y dónde mira** NO es estado: es un `transform` escrito
 *    a mano sobre el grupo de la escena. Si entra a `useState`, el plano
 *    tiembla y —peor— la medición del deschoque se hace contra la geometría
 *    del paso anterior.
 */
function IsoMap({ fixtures, selectedKeys, onSelect, match, range, resaltar, dispo, porPartes, cortoDe, libreDesde, chinchetas, onChincheta, senalar }: IsoMapProps) {
  /** La disponibilidad de una cara en el periodo: la combinada con sus
   *  partes si quien dibuja la sabe, y si no la de la cara sola. */
  const dispoDe = useCallback(
    (f: UnifiedFixture, face: FaceEntry) => (dispo ? dispo(f, face) : rangeAvailability(face, range.from, range.to)),
    [dispo, range],
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const escenaRef = useRef<SVGGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);
  /** El nombre propio de cada familia: lo dice el cartel del mouse. */
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  /* La escena pinta con `temaActual()` adentro del memo: si el tema no es
     dependencia, tocar el sol/luna deja el plano con la terna del modo viejo
     hasta recargar (verificador, Fase 10). */
  const [tema] = useTema();

  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  /** La orientación pedida. Durante un arrastre va un cuadro adelante del
   *  estado: se junta lo que se movió y se pinta una vez por cuadro. */
  const vistaPedida = useRef<Vista>(VISTA_INICIAL);
  const cuadro = useRef(0);
  /** Acercamiento (contra el encuadre con el que abre) y cuánto se corrió el
   *  punto de mira desde el de ese encuadre, en metros. Es el `target` de
   *  OrbitControls: se gira alrededor de él y el arrastre para mover lo
   *  desliza. */
  const cam = useRef({ zoom: 1, T: [0, 0, 0] as [number, number, number] });
  /** La ayuda de los gestos se va con el primer gesto. */
  const [ayuda, setAyuda] = useState(true);

  /** LA PLANTA: lo que no cambia al mover la cámara. La huella de cada mueble
   *  —con su giro aplicado— relativa al centro de la sala, su alto ya achatado
   *  como en el isométrico de siempre (`ALTURA`), el piso con un metro de aire,
   *  y el encuadre con el que abre. */
  const planta = useMemo(() => {
    if (fixtures.length === 0) return null;
    const huellas = fixtures.map((f) => {
      const fp = footprint2D(f);
      return { f, fp, x0: f.cx - fp.w / 2, x1: f.cx + fp.w / 2, z0: f.cz - fp.d / 2, z1: f.cz + fp.d / 2 };
    });
    const gx0 = Math.min(...huellas.map((q) => q.x0)) - 1;
    const gx1 = Math.max(...huellas.map((q) => q.x1)) + 1;
    const gz0 = Math.min(...huellas.map((q) => q.z0)) - 1;
    const gz1 = Math.max(...huellas.map((q) => q.z1)) + 1;
    const cx = (gx0 + gx1) / 2, cz = (gz0 + gz1) / 2;
    const cajas: Huella[] = huellas.map((q) => ({
      x0: q.x0 - cx, x1: q.x1 - cx, z0: q.z0 - cz, z1: q.z1 - cz,
      h: Math.max(q.f.h || 1, 0.4) * ALTURA,
    }));
    const esquinasPiso: [number, number, number][] = [
      [gx0 - cx, 0, gz0 - cz], [gx1 - cx, 0, gz0 - cz], [gx1 - cx, 0, gz1 - cz], [gx0 - cx, 0, gz1 - cz],
    ];
    const encuadre = encuadreInicial([
      ...esquinasPiso,
      ...cajas.flatMap((c): [number, number, number][] => [
        [c.x0, 0, c.z0], [c.x1, 0, c.z0], [c.x1, 0, c.z1], [c.x0, 0, c.z1],
        [c.x0, c.h, c.z0], [c.x1, c.h, c.z0], [c.x1, c.h, c.z1], [c.x0, c.h, c.z1],
      ]),
    ], MARGEN_DEL_ENCUADRE);
    return { huellas, cajas, esquinasPiso, encuadre };
  }, [fixtures]);

  const scene = useMemo(() => {
    if (!planta) return null;
    const { huellas, cajas, esquinasPiso, encuadre: base } = planta;
    const e = ejes(vista);
    const lados = ladosVisibles(e);
    const piso = pts(...esquinasPiso.map(([x, y, z]) => proyectar(e, x, y, z)));

    // De atrás hacia adelante, con el orden de verdad (ver `ordenDePintado`):
    // con la cámara girando, el orden por centro se equivoca con los muebles
    // largos.
    const orden = ordenDePintado(cajas, e);

    const prisms = orden.map((k) => {
      const { f, fp } = huellas[k];
      const caja = cajas[k];
      const { x0, x1, z0, z1, h } = caja;
      const Q = (x: number, y: number, z: number) => proyectar(e, x, y, z);

      const rentable = isRentable(f);
      // A non-rentable fixture is drawn as one neutral block: no face split, no
      // commercial hue.
      const double = isDoubleGondola(f) && rentable;
      const faces = facesOf(f);
      const paint = (face: FaceEntry) => rangeTop()[dispoDe(f, face)];
      const topA = rentable ? paint(faces[0]) : noRentableTop();
      const topB = rentable && faces[1] ? paint(faces[1]) : noRentableTop();
      // Cuando el mueble es más ancho que hondo el corte va por Z y la mitad
      // de adelante (+z) es la B; si es más hondo que ancho el corte va por X
      // y la B queda del lado de +x.
      const anchoManda = fp.w >= fp.d;
      const cuerpo = rentable ? colorCuerpo() : noRentableTop();
      const stroke = rentable ? colorCuerpoLinea() : darken(noRentableTop(), 0.42);

      const tA = Q(x0, h, z0), tB = Q(x1, h, z0), tC = Q(x1, h, z1), tD = Q(x0, h, z1);

      // Top face — split into two halves for double gondolas
      const mitad = (color: string, cara: "A" | "B", esquinas: [number, number][]) => ({
        color,
        cara,
        points: pts(...esquinas),
        cx: esquinas.reduce((a, q) => a + q[0], 0) / esquinas.length,
        cy: esquinas.reduce((a, q) => a + q[1], 0) / esquinas.length,
      });
      let topHalves: { color: string; cara: "A" | "B"; points: string; cx: number; cy: number }[];
      if (double) {
        if (anchoManda) {
          const zm = (z0 + z1) / 2;
          topHalves = [
            mitad(topA, "A", [Q(x0, h, z0), Q(x1, h, z0), Q(x1, h, zm), Q(x0, h, zm)]),
            mitad(topB, "B", [Q(x0, h, zm), Q(x1, h, zm), Q(x1, h, z1), Q(x0, h, z1)]),
          ];
        } else {
          const xm = (x0 + x1) / 2;
          topHalves = [
            mitad(topA, "A", [Q(x0, h, z0), Q(xm, h, z0), Q(xm, h, z1), Q(x0, h, z1)]),
            mitad(topB, "B", [Q(xm, h, z0), Q(x1, h, z0), Q(x1, h, z1), Q(xm, h, z1)]),
          ];
        }
      } else {
        topHalves = [mitad(topA, "A", [tA, tB, tC, tD])];
      }

      // LOS LADOS que miran a la cámara —ninguno desde arriba—. Los dos
      // largos son la cara que se vende y van con su color: el de −z (o −x)
      // es la A, el otro la B; en un mueble de una sola cara, los dos son la A.
      // Las cabeceras son el cuerpo, que no se vende y va del color del
      // material. Cada lado sabe qué cara es: tocarlo elige esa cara.
      const caraDelLado = (lado: Lado): "A" | "B" | null => {
        if (!rentable) return null;
        const largo = anchoManda ? lado[0] === "z" : lado[0] === "x";
        if (!largo) return null;
        if (!double) return "A";
        return lado[1] === "-" ? "A" : "B";
      };
      const sides = lados.map((lado) => {
        const cara = caraDelLado(lado);
        const sombra = sombraDelLado(e, lado);
        const color = cara === "B" ? topB : cara === "A" ? topA : cuerpo;
        return {
          lado,
          cara,
          points: pts(...esquinasDelLado(e, caja, lado)),
          fill: darken(color, sombra),
          // El más claro lleva la clase de la izquierda: es la que tiñe la
          // selección de Vender (`.pz[data-sel] .c-izq`).
          clase: sombra < 0.2 ? "c-izq" : "c-der",
        };
      });

      // Asking about a period changes the question the tooltip should answer:
      // not "who is here" but "can I sell this, and if not, how much of it".
      const rangeSub = (face: FaceEntry) => {
        // A column or a checkout is not for sale, so it must never answer
        // "libre los 24 días" — the colour already excludes it, the words
        // have to as well.
        if (!rentable) return NON_RENTABLE_LABEL;
        const partes = porPartes?.(f, face) ?? null;
        if (partes) return partes;
        const total = inclusiveDays(range.from, range.to);
        // Los días de la cara, como siempre (un «Reservado» toma el periodo
        // entero), y con partes, también los que la entera no se puede vender.
        const libre = libreDesde?.(f, face);
        const taken = Math.max(daysTakenInRange(face, range.from, range.to), libre ? total - libre.diasLibres : 0);
        if (taken <= 0) return `libre los ${total} día${total === 1 ? "" : "s"}`;
        if (taken >= total) return "tomado";
        return `libre ${total - taken} de ${total} días`;
      };
      const tooltipSub = double
        ? `A: ${rangeSub(faces[0])} · B: ${faces[1] ? rangeSub(faces[1]) : "—"}`
        : rangeSub(faces[0]);

      // La caja del prisma en el plano (sus ocho esquinas proyectadas): con
      // ella `ajustarMinimos()` sabe cuánto mide el mueble EN PANTALLA.
      const esquinas = [
        Q(x0, 0, z0), Q(x1, 0, z0), Q(x1, 0, z1), Q(x0, 0, z1), tA, tB, tC, tD,
      ];
      const caja2d = {
        x0: Math.min(...esquinas.map((q) => q[0])), x1: Math.max(...esquinas.map((q) => q[0])),
        y0: Math.min(...esquinas.map((q) => q[1])), y1: Math.max(...esquinas.map((q) => q[1])),
      };

      return {
        f, topHalves, sides, rentable, double, faces, stroke,
        topOutline: pts(tA, tB, tC, tD),
        tooltipSub, caja2d,
        // La huella en el plano (metros, relativa al centro de la sala): de
        // ella sale el piso punteado del mueble señalado.
        caja,
      };
    });

    /* LAS ANCLAS DE LOS RÓTULOS. No están escritas a mano: son el centroide de
       la tapa de su mueble, que sale de la misma geometría que dibuja el
       prisma. Las dos caras de una góndola se anclan EN PUNTAS OPUESTAS: cada
       rótulo se corre `SEP_CARA` sobre el eje que separa las dos mitades, cada
       uno del lado de la cara que nombra. Sin eso los dos caen casi en el mismo
       punto y uno de los dos tiene que ceder siempre.

       La unidad es el lado mayor del encuadre con el que abre —el viewBox de
       antes—, que no cambia al girar: así los rótulos no se acercan ni se
       alejan de su mueble con la cámara. */
    const unidad = Math.max(base.ancho, base.alto);
    const sep = SEP_CARA * unidad;
    const anclas = new Map<string, [number, number]>();
    for (const p of prisms) {
      if (!p.rentable) continue;
      p.topHalves.forEach((m, i) => {
        const entry = p.faces[i];
        if (!entry) return;
        let ax = m.cx, ay = m.cy;
        if (p.double && p.topHalves.length > 1) {
          const otra = p.topHalves[1 - i];
          const dx = m.cx - otra.cx, dy = m.cy - otra.cy;
          const largo = Math.hypot(dx, dy) || 1;
          ax += (dx / largo) * sep;
          ay += (dy / largo) * sep;
        }
        anclas.set(`${p.f.id}-${entry.face}`, [ax, ay]);
      });
    }

    return { prisms, piso, anclas, e, unidad, base };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planta, range, tema, vista, dispoDe, porPartes, libreDesde]);
  /** El lienzo existe: los oyentes que se cuelgan de él esperan a esto. Sin
   *  muebles el componente no dibuja nada, y un efecto que corrió en ese
   *  momento no vuelve a correr cuando los muebles llegan. */
  const hayEscena = scene !== null;

  /** Lo que dicen los rótulos. No depende de la cámara: girar no vuelve a
   *  medir ni a ordenar nada de esto. */
  const labels = useMemo<Rotulo[]>(() => {
    // Qué nombres los lleva más de un mueble de la sede. Una vez por plano.
    const chocados = nombresChocados(fixtures);
    const salida: Rotulo[] = [];
    for (const f of fixtures) {
      if (!isRentable(f)) continue;
      const nombre = nombreDeMueble(f);
      const doble = isDoubleGondola(f);
      // El rótulo repetido es el que dejó vender dos veces el mismo cartel:
      // dos cajas «IMP-08 · libre 16 sep», dos proveedores, el mismo periodo.
      // Los dos muebles existen y los dos se pueden contratar; lo que faltaba
      // era que el plano dijera que son dos. Con un solo nombre esto ya no se
      // puede crear —la regla lo impide en los tres caminos de renombre— pero
      // un plano guardado antes puede traerlo, y entonces se sigue viendo. La
      // regla vive en `nomenclatura.ts` y se prueba sin navegador.
      const choque = choqueDeRotulo(f, chocados);
      for (const entry of facesOf(f)) {
        const dispo = dispoDe(f, entry);
        const partes = dispo === "parcial" ? porPartes?.(f, entry) ?? null : null;
        const desde = dispo === "parcial" && !partes
          ? (libreDesde ? libreDesde(f, entry)?.desde : primerDiaLibre(entry, range.from, range.to))
          : undefined;
        // Fase 2 · I4: una cara por participación lleva en el plano la línea
        // CORTA («queda 45 %»); la larga sigue en el cartel del mouse.
        const corto = dispo === "parcial" ? cortoDe?.(f, entry) ?? null : null;
        // Libre HOY (el primer día del periodo) y tomada más adelante —un
        // contrato o una reserva que arrancan después—: «libre 19 oct» se leía
        // como «se libera el 19 oct». Dice hasta cuándo se puede vender.
        const hastaLibre = desde && !partes ? ultimoDiaLibreDesdeElArranque(entry, desde, range.from, range.to) : null;
        salida.push({
          clave: `${f.id}-${entry.face}`,
          cod: doble ? `${nombre}·${entry.face}` : nombre,
          fecha: partes ?? (hastaLibre
            ? `libre hasta ${hastaLibre.getDate()} ${MONTHS_ES[hastaLibre.getMonth()]}`
            : desde ? `libre ${desde.getDate()} ${MONTHS_ES[desde.getMonth()]}` : ""),
          ...(corto ? { corto } : {}),
          // Sólo la cuenta. Antes acompañaba el código del mueble, que era lo
          // único que distinguía a los dos gemelos; ahora los dos se llaman
          // igual de verdad y el código no distingue nada: lo que hay que hacer
          // es renombrar uno, y eso lo dice la revisión del plano.
          choque: choque ? choque.marca : "",
          // La de participación cede como una libre: lo que se vende en este
          // plano es «libre 14 oct», no lo que se carga en Distribución.
          peso: choque ? 0 : corto ? 2 : dispo === "parcial" ? 1 : dispo === "libre" ? 2 : 3,
        });
      }
    }
    // Primero el que comparte su nombre con otro —el aviso no puede ser lo que
    // cede—, después lo que se libera (lleva fecha), lo libre y lo tomado: si
    // dos se pisan, el que cede es el que menos se está vendiendo.
    return salida.sort((a, b) => a.peso - b.peso || (a.cod < b.cod ? -1 : 1));
  }, [fixtures, range, dispoDe, porPartes, cortoDe, libreDesde]);

  // ── Del plano a la pantalla ──────────────────────────────────────────────
  //
  // El SVG no lleva viewBox: sus unidades son los píxeles de su caja. El grupo
  // de la escena lleva `translate(centro − k·mira) scale(k)`, con k los
  // píxeles por metro: los de encajar el encuadre con el que abre —el viewBox
  // del isométrico de antes, con su mismo margen—, por el acercamiento. Girar
  // no cambia k: igual que en el editor, la sala no se agranda ni se achica
  // porque la cámara dé la vuelta.
  const escenaActual = useRef(scene);
  escenaActual.current = scene;

  const encuadre = useCallback(() => {
    const sc = escenaActual.current;
    const r = svgRef.current?.getBoundingClientRect();
    if (!sc || !r || !(r.width > 0) || !(r.height > 0)) return null;
    const k0 = Math.max(0.001, Math.min(r.width / sc.base.ancho, r.height / sc.base.alto));
    const k = k0 * cam.current.zoom;
    const [ox, oy, oz] = sc.base.mira;
    const T = cam.current.T;
    const [mx, my] = proyectar(sc.e, ox + T[0], oy + T[1], oz + T[2]);
    return { r, k, mx, my, e: sc.e };
  }, []);
  type Encuadre = NonNullable<ReturnType<typeof encuadre>>;

  /** Un punto del plano → pantalla, con la cámara que ACABA de escribirse: no
   *  se le pregunta al navegador dónde quedó nada. Es lo que evita que
   *  `acomodar()` decida un paso tarde (README de D §4.3). */
  const aPantalla = useCallback((x: number, y: number, c: Encuadre): [number, number] => [
    c.r.left + c.r.width / 2 + c.k * (x - c.mx),
    c.r.top + c.r.height / 2 + c.k * (y - c.my),
  ], []);

  /** Pantalla → plano. Para acercar sobre el puntero. */
  const aPlano = useCallback((px: number, py: number, c: Encuadre): [number, number] => [
    (px - c.r.left - c.r.width / 2) / c.k + c.mx,
    (py - c.r.top - c.r.height / 2) / c.k + c.my,
  ], []);

  /** Escribir la cámara: un `transform` y el cuerpo del rótulo. `--lbl` es la
   *  pieza que hay que portar con cuidado — se escribe como propiedad en el
   *  grupo de la escena, fuera de React. */
  const escribir = useCallback(() => {
    const g = escenaRef.current;
    const c = encuadre();
    if (!g || !c) return;
    g.style.setProperty("--lbl", `${(LBL / c.k).toFixed(4)}px`);
    g.setAttribute(
      "transform",
      `translate(${(c.r.width / 2 - c.k * c.mx).toFixed(2)},${(c.r.height / 2 - c.k * c.my).toFixed(2)}) scale(${c.k.toFixed(4)})`,
    );
  }, [encuadre]);

  const piezas = useRef<Pieza[]>([]);
  const calibrado = useRef(false);
  const pendiente = useRef(0);
  const txtRefs = useRef(new Map<string, SVGTextElement>());
  const hitRefs = useRef(new Map<string, SVGRectElement>());
  const grupoRefs = useRef(new Map<string, SVGGElement>());

  /** Que ningún rótulo pise una letra.
   *
   *  Aritmética pura: ni una sola lectura de geometría del plano. El rótulo
   *  mide lo mismo EN PANTALLA a todo acercamiento, así que su caja se midió
   *  una vez (`calibrar`) y no vuelve a cambiar; lo único que se mueve es el
   *  ancla, y el ancla la da `aPantalla()` con la cámara recién escrita.
   *
   *  Orden: lo que flota encima del plano manda; después los rótulos por su
   *  peso. El que se cruza con algo ya aceptado, o el que se sale del lienzo,
   *  prueba las cuatro desviaciones de un único valor y, si ninguna entra,
   *  CEDE — y vuelve solo en cuanto el acercamiento le abre lugar. Nunca se
   *  achica: el cuerpo es constante. */
  /** Las chinchetas de Supervisar (los puntos de «Para revisar»), por cara
   *  (`id-cara`), y dónde quedó en la última vuelta de `acomodar` el rótulo de
   *  cada cara y el punto de cada aviso.
   *
   *  LAS CAJAS SE GUARDAN RELATIVAS AL LIENZO (a la esquina de arriba a la
   *  izquierda de `wrapRef`), no en pantalla. La pantalla rueda —Supervisar
   *  siempre, Vender cuando el contrato es más alto que la ventana— y una caja
   *  guardada en coordenadas de pantalla quedaba corrida exactamente lo que
   *  hubiera rodado la página entre el `acomodar` que la midió y el
   *  `ubicarFoco` que la usaba (el punto con anillo del señalado caía lejos de
   *  su rótulo). Relativas al lienzo no dependen de dónde esté el lienzo en la
   *  pantalla: se usan tal cual, sin restarles nada. */
  const pinRefs = useRef(new Map<string, HTMLButtonElement>());
  const cajasDeRotulo = useRef(new Map<string, Caja>());
  /** El punto de cada aviso (relativo al lienzo), con su centro en el medio
   *  de la caja. */
  const cajasDePin = useRef(new Map<string, Caja>());
  const acomodar = useCallback(() => {
    if (!calibrado.current) return;
    cajasDeRotulo.current.clear();
    cajasDePin.current.clear();
    const c = encuadre();
    const lz = wrapRef.current?.getBoundingClientRect();
    const sc = escenaActual.current;
    if (!c || !lz || !sc) return;
    // De la pantalla al lienzo: TODO lo que se guarda pasa por acá.
    const alLienzo = (b: Caja): Caja => ({
      left: b.left - lz.left, top: b.top - lz.top, right: b.right - lz.left, bottom: b.bottom - lz.top,
    });
    const d = DESVIO * sc.unidad;
    const fijos: Caja[] = [];
    wrapRef.current?.querySelectorAll(".herr, .herr-ayuda").forEach((n) => fijos.push(n.getBoundingClientRect()));
    const seSale = (b: Caja) =>
      b.left < lz.left + 2 || b.right > lz.right - 2 || b.top < lz.top + 2 || b.bottom > lz.bottom - 2;

    // LOS RÓTULOS. Se acomodan SIN mirar los puntos («aire y pines»): prender
    // los puntos de «Para revisar» no puede esconder un código que apagados se
    // ve. Antes cada rótulo con chincheta reservaba arriba lo que ella medía,
    // y esa reserva era un obstáculo para los vecinos: prendidos, cedían
    // cuatro rótulos más (PUN-02, PUN-04, GON-02·B, GON-03·B).
    const ok: Caja[] = [];
    const enPantalla = new Map<string, Caja>();
    for (const p of piezas.current) {
      const intentos: [number, number][] = [[0, 0], [-d, 0], [d, 0], [0, d], [0, -d]];
      let puesto: { b: Caja; dx: number; dy: number } | null = null;
      for (const [dx, dy] of intentos) {
        const a = aPantalla(p.ax + dx, p.ay + dy, c);
        const b: Caja = {
          left: a[0] + p.ox, top: a[1] + p.oy,
          right: a[0] + p.ox + p.w, bottom: a[1] + p.oy + p.h,
        };
        if (seSale(b)) continue;
        if (fijos.some((o) => cruza(b, o))) continue;
        if (ok.some((o) => cruza(b, o))) continue;
        puesto = { b, dx, dy };
        break;
      }
      if (!puesto) {
        p.txt.style.display = "none";
        p.hit?.setAttribute("width", "0");
        p.hit?.setAttribute("height", "0");
        continue;
      }
      enPantalla.set(p.clave, puesto.b);
      cajasDeRotulo.current.set(p.clave, alLienzo(puesto.b));
      p.txt.style.display = "";
      p.txt.setAttribute("x", (p.ax + puesto.dx).toFixed(3));
      p.txt.setAttribute("y", (p.ay + puesto.dy).toFixed(3));
      for (const hijo of Array.from(p.txt.children)) {
        hijo.setAttribute("x", (p.ax + puesto.dx).toFixed(3));
      }
      ok.push(puesto.b);
      // La caja de impacto, en unidades del plano: seis píxeles de pantalla de
      // margen alrededor de lo que ocupa el rótulo. El clic lo cobra el mueble,
      // no el rótulo.
      if (p.hit) {
        const m = 6 / c.k;
        p.hit.setAttribute("x", (p.ax + puesto.dx + p.ox / c.k - m).toFixed(3));
        p.hit.setAttribute("y", (p.ay + puesto.dy + p.oy / c.k - m).toFixed(3));
        p.hit.setAttribute("width", (p.w / c.k + 2 * m).toFixed(3));
        p.hit.setAttribute("height", (p.h / c.k + 2 * m).toFixed(3));
      }
    }

    // LOS PUNTOS, después de todos los rótulos y sin ser obstáculo de ninguno:
    // cada uno se apoya pegado a SU rótulo —debajo, sobre el techo de su
    // mueble; si no entra, arriba, a la derecha o a la izquierda— sin tapar
    // ningún código, ni las herramientas, ni otro punto. Un rótulo que cedió
    // deja su punto sobre el techo (el ancla), o corrido donde no tape nada.
    const puntos: Caja[] = [];
    for (const [k, pin] of pinRefs.current) {
      const r = Math.max(pin.offsetWidth || 16, pin.offsetHeight || 16) / 2;
      const caja = (x: number, y: number): Caja => ({ left: x - r, top: y - r, right: x + r, bottom: y + r });
      const sep = r + AIRE_TXT + 1;
      const candidatos: Caja[] = [];
      const suyo = enPantalla.get(k);
      if (suyo) {
        const cx = (suyo.left + suyo.right) / 2, cy = (suyo.top + suyo.bottom) / 2;
        candidatos.push(caja(cx, suyo.bottom + sep), caja(cx, suyo.top - sep), caja(suyo.right + sep, cy), caja(suyo.left - sep, cy));
        for (const m of [1, 2]) {
          for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
            candidatos.push(caja(cx + x * (m * d + (suyo.right - suyo.left) / 2), cy + y * (suyo.bottom - suyo.top) / 2 + y * sep));
          }
        }
      } else {
        let a = sc.anclas.get(k);
        if (!a) {
          const pr = sc.prisms.find((x) => `${x.f.id}-A` === k || `${x.f.id}-B` === k);
          if (pr) a = [(pr.caja2d.x0 + pr.caja2d.x1) / 2, pr.caja2d.y0];
        }
        if (!a) continue;
        for (const m of [0, 1, 2, 3]) {
          const vueltas: [number, number][] = m === 0 ? [[0, 0]]
            : [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
          for (const [x, y] of vueltas) {
            const [px, py] = aPantalla(a[0] + x * m * d, a[1] + y * m * d, c);
            candidatos.push(caja(px, py));
          }
        }
      }
      const fuera = (b: Caja) => seSale(b) || fijos.some((o) => cruza(b, o));
      // Primero sin pisar nada; después, sin pisar ningún CÓDIGO (otro punto
      // sí); si ni eso, el primero que entre en el lienzo: un aviso no se
      // esconde, y con su rótulo puesto queda pegado a él.
      const elegido = candidatos.find((b) => !fuera(b) && !ok.some((o) => cruza(b, o)) && !puntos.some((o) => cruza(b, o)))
        ?? candidatos.find((b) => !fuera(b) && !ok.some((o) => cruza(b, o)))
        ?? candidatos.find((b) => !seSale(b));
      if (!elegido) continue;
      puntos.push(elegido);
      cajasDePin.current.set(k, alLienzo(elegido));
    }
  }, [aPantalla, encuadre]);

  /** EL MÍNIMO PARA EL DEDO. Una punta o un impulsador miden, con la sede
   *  entera a la vista, ocho o diez píxeles: con el mouse se apunta, con el
   *  dedo no. Cada mueble que vende algo lleva una caja de impacto INVISIBLE
   *  (`.pl-min`, en la capa de impactos) que mide por lo menos 44 × 44 px EN
   *  PANTALLA, centrada en el mueble; se recalcula con cada acercamiento
   *  (`aplicar`), y si el mueble ya mide eso, la caja queda en cero y manda
   *  el prisma. No cambia nada de lo que se ve, no entra al deschoque de los
   *  rótulos (que mide sólo los textos y las herramientas) y queda DEBAJO de
   *  las cajas de los rótulos, que siguen cobrando su clic. */
  const minRefs = useRef(new Map<string, SVGRectElement>());
  const ajustarMinimos = useCallback(() => {
    const c = encuadre();
    const sc = escenaActual.current;
    if (!c || !sc) return;
    const lado = MINIMO_AL_TOCAR / c.k;
    for (const p of sc.prisms) {
      const el = minRefs.current.get(p.f.id);
      if (!el) continue;
      const { x0, x1, y0, y1 } = p.caja2d;
      const w = x1 - x0, h = y1 - y0;
      if (w * c.k >= MINIMO_AL_TOCAR && h * c.k >= MINIMO_AL_TOCAR) {
        el.setAttribute("width", "0");
        el.setAttribute("height", "0");
        continue;
      }
      const W = Math.max(w, lado), H = Math.max(h, lado);
      el.setAttribute("x", ((x0 + x1) / 2 - W / 2).toFixed(3));
      el.setAttribute("y", ((y0 + y1) / 2 - H / 2).toFixed(3));
      el.setAttribute("width", W.toFixed(3));
      el.setAttribute("height", H.toFixed(3));
    }
  }, [encuadre]);

  /** LOS PUNTOS DE «PARA REVISAR» (Supervisar): un botón por mueble con algo
   *  en la lista, pegado a su rótulo. Son HTML encima del lienzo —se tocan, se
   *  leen y miden lo mismo a todo acercamiento—; dónde va cada uno lo decide
   *  `acomodar`, después de los rótulos y sin ser obstáculo de ninguno. Un
   *  mueble que no se vende entero (la caja de una bahía) no tiene ancla de
   *  rótulo: va al centro de lo alto de su caja. */
  /** EL MUEBLE SEÑALADO desde «Para revisar» («aire y pines»): el piso
   *  punteado alrededor (en el plano, debajo de los muebles: se mueve con la
   *  cámara sin que nadie lo reubique, y se rehace al girar) y un punto con
   *  anillo, que es HTML y se ubica como las chinchetas: apoyado ARRIBA del
   *  rótulo de su cara, nunca sobre el código. */
  const focoRef = useRef<FocoDelPlano | null>(null);
  const focoPisoRef = useRef<SVGPolygonElement>(null);
  const focoMarcaRef = useRef<HTMLSpanElement>(null);
  const dibujarFocoPiso = useCallback(() => {
    const el = focoPisoRef.current;
    if (!el) return;
    const f = focoRef.current;
    const sc = escenaActual.current;
    const p = f && sc ? sc.prisms.find((x) => x.f.id === f.fixtureId) : undefined;
    if (!f || !sc || !p) { el.style.display = "none"; return; }
    const m = MARGEN_DEL_FOCO;
    const { x0, x1, z0, z1 } = p.caja;
    el.setAttribute("points", pts(
      proyectar(sc.e, x0 - m, 0, z0 - m), proyectar(sc.e, x1 + m, 0, z0 - m),
      proyectar(sc.e, x1 + m, 0, z1 + m), proyectar(sc.e, x0 - m, 0, z1 + m),
    ));
    el.dataset.grupo = f.grupo;
    el.style.display = "";
  }, []);
  const ubicarFoco = useCallback(() => {
    const el = focoMarcaRef.current;
    if (!el) return;
    const f = focoRef.current;
    const c = encuadre();
    const lz = wrapRef.current?.getBoundingClientRect();
    const sc = escenaActual.current;
    if (!f || !c || !lz || !sc) { el.style.display = "none"; return; }
    el.dataset.grupo = f.grupo;
    // Con el rótulo de su cara puesto (o el de la otra cara), arriba de él.
    const otra = f.cara === "A" ? "B" : "A";
    const caja = cajasDeRotulo.current.get(`${f.fixtureId}-${f.cara}`) ?? cajasDeRotulo.current.get(`${f.fixtureId}-${otra}`);
    // La caja ya es relativa al lienzo (ver `cajasDeRotulo`): se usa tal cual,
    // aunque la página haya rodado desde el último `acomodar`.
    if (caja) {
      el.style.display = "";
      el.style.left = `${((caja.left + caja.right) / 2).toFixed(1)}px`;
      el.style.top = `${(caja.top - 2).toFixed(1)}px`;
      el.dataset.sobre = "rotulo";
      return;
    }
    // Sin rótulo (cedió, o el mueble no se vende entero): sobre el techo.
    let a = sc.anclas.get(`${f.fixtureId}-${f.cara}`);
    if (!a) {
      const p = sc.prisms.find((x) => x.f.id === f.fixtureId);
      if (p) a = [(p.caja2d.x0 + p.caja2d.x1) / 2, p.caja2d.y0];
    }
    if (!a) { el.style.display = "none"; return; }
    const [x, y] = aPantalla(a[0], a[1], c);
    const fuera = x < lz.left || x > lz.right || y < lz.top || y > lz.bottom;
    el.style.display = fuera ? "none" : "";
    el.style.left = `${(x - lz.left).toFixed(1)}px`;
    el.style.top = `${(y - lz.top).toFixed(1)}px`;
    el.dataset.sobre = "ancla";
  }, [aPantalla, encuadre]);
  useEffect(() => {
    if (!senalar) return;
    senalar.current = (foco) => {
      focoRef.current = foco;
      dibujarFocoPiso();
      ubicarFoco();
    };
    return () => { if (senalar) senalar.current = null; };
  }, [senalar, dibujarFocoPiso, ubicarFoco]);

  const ubicarChinchetas = useCallback(() => {
    // El punto del mueble señalado se ubica con lo que flota sobre el plano:
    // cada vez que se mueve la cámara o se acomodan los rótulos.
    ubicarFoco();
    // Cada punto, donde lo dejó `acomodar` (relativo al lienzo, centrado en su
    // caja): pegado a su rótulo sin tapar ningún código. Sin lugar, escondido.
    for (const [k, el] of pinRefs.current) {
      const b = cajasDePin.current.get(k);
      if (!b) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.left = `${((b.left + b.right) / 2).toFixed(1)}px`;
      el.style.top = `${((b.top + b.bottom) / 2).toFixed(1)}px`;
    }
  }, [ubicarFoco]);

  const aplicar = useCallback(() => { escribir(); ajustarMinimos(); acomodar(); ubicarChinchetas(); }, [escribir, ajustarMinimos, acomodar, ubicarChinchetas]);
  // Una lista nueva de puntos se ubica en cuanto existe. Los rótulos se
  // vuelven a acomodar en la misma vuelta, pero sin contar con los puntos: lo
  // que cambia es sólo dónde va cada punto, nunca qué rótulo se ve.
  useLayoutEffect(() => { acomodar(); ubicarChinchetas(); }, [chinchetas, acomodar, ubicarChinchetas]);

  /** Medir bien es todo el asunto. Un `requestAnimationFrame` NO alcanza: el
   *  navegador corre esos avisos ANTES de rehacer el dibujo, así que la caja
   *  que devuelve todavía es la del cuerpo anterior. Por eso se mide en el
   *  SEGUNDO cuadro y se repite hasta que dos pasadas dan lo mismo. */
  const calibrar = useCallback((intento = 0) => {
    if (!encuadre()) return;
    // Volver TODOS al ancla natural antes de medir. Sin esto se mide un rótulo
    // que `acomodar()` ya corrió, el desplazamiento se cuenta dos veces, y las
    // cajas quedan corridas justo lo que hace falta para que dos se crucen sin
    // que la cuenta lo vea.
    for (const p of piezas.current) {
      p.txt.style.display = "";
      p.txt.setAttribute("x", p.ax.toFixed(3));
      p.txt.setAttribute("y", p.ay.toFixed(3));
      for (const hijo of Array.from(p.txt.children)) hijo.setAttribute("x", p.ax.toFixed(3));
    }
    escribir();
    if (pendiente.current) cancelAnimationFrame(pendiente.current);
    pendiente.current = requestAnimationFrame(() => {
      pendiente.current = requestAnimationFrame(() => {
        pendiente.current = 0;
        let cambio = false;
        const c = encuadre();
        if (!c) return;
        for (const p of piezas.current) {
          // Contra donde el rótulo ESTÁ escrito, no contra su ancla: entre la
          // vuelta al ancla y esta medida puede haber corrido un `acomodar()`
          // (una lista nueva de chinchetas, una escena nueva) que lo movió, y
          // medir contra el ancla contaba ese corrimiento como parte de la caja
          // —la chincheta y el deschoque quedaban corridos del texto—.
          const xa = Number(p.txt.getAttribute("x")), ya = Number(p.txt.getAttribute("y"));
          const a = aPantalla(Number.isFinite(xa) ? xa : p.ax, Number.isFinite(ya) ? ya : p.ay, c);
          const r = p.txt.getBoundingClientRect();
          if (!(r.width > 0)) continue;
          if (Math.abs(p.w - r.width) > 0.5 || Math.abs(p.h - r.height) > 0.5) cambio = true;
          p.w = r.width; p.h = r.height;
          p.ox = r.left - a[0]; p.oy = r.top - a[1];
        }
        calibrado.current = piezas.current.every((p) => p.w > 0);
        acomodar();
        ubicarChinchetas();
        if (cambio && intento < 3) calibrar(intento + 1);
      });
    });
  }, [aPantalla, acomodar, encuadre, escribir, ubicarChinchetas]);

  /** Rearmar la lista de piezas cada vez que cambian los rótulos: lo que DICEN
   *  —que es lo que se mide—, no dónde caen. */
  useLayoutEffect(() => {
    const anclas = escenaActual.current?.anclas;
    piezas.current = labels
      .map((l) => {
        const txt = txtRefs.current.get(l.clave);
        const a = anclas?.get(l.clave);
        if (!txt || !a) return null;
        return { ...l, txt, hit: hitRefs.current.get(l.clave) ?? null, ax: a[0], ay: a[1], w: 0, h: 0, ox: 0, oy: 0 };
      })
      .filter((p): p is Pieza => p !== null);
    calibrado.current = false;
    calibrar();
  }, [labels, calibrar]);

  /** Con cada escena nueva —un giro de la cámara, otro periodo, otro tema—
   *  las anclas se mueven: se les da la nueva posición y se vuelven a
   *  acomodar, sin medir otra vez. */
  useLayoutEffect(() => {
    if (!scene) return;
    for (const p of piezas.current) {
      const a = scene.anclas.get(p.clave);
      if (a) { p.ax = a[0]; p.ay = a[1]; }
    }
    // El piso del mueble señalado se rehace con la escena (un giro lo cambia).
    dibujarFocoPiso();
    aplicar();
  }, [scene, aplicar, dibujarFocoPiso]);

  // La tipografía del sistema puede llegar después del primer pintado: cada vez
  // que puede haber cambiado el ancho de una letra, se vuelve a medir.
  useEffect(() => {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (f?.ready) void f.ready.then(() => calibrar());
  }, [calibrar]);

  // Al cambiar la caja del plano cambia la escala: se reescribe el transform y
  // se vuelve a acomodar. El cuerpo del rótulo no cambia, así que no hay que
  // volver a medirlo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => aplicar());
    ro.observe(el);
    window.addEventListener("resize", aplicar);
    return () => { ro.disconnect(); window.removeEventListener("resize", aplicar); };
  }, [aplicar, hayEscena]);

  /** EL RESALTADO: apaga la sala y enciende esos muebles.
   *
   *  Se registra como función imperativa y no como estado: apagar la sala es
   *  CSS sobre los hijos de la escena, y marcar es un `classList.toggle` sobre
   *  los nodos que ya existen. Con estado, pasar el mouse por una fila de la
   *  tarifa volvería a pintar ciento seis prismas. */
  useEffect(() => {
    if (!resaltar) return;
    resaltar.current = (claves) => {
      const g = escenaRef.current;
      if (!g) return;
      const on = !!claves && claves.length > 0;
      const set = new Set(claves ?? []);
      g.setAttribute("data-foco", on ? "1" : "0");
      // Los grupos están indexados por MUEBLE y las llaves son por CARA: un
      // mueble se enciende si alguna de sus caras está en la lista.
      grupoRefs.current.forEach((el, id) => {
        el.classList.toggle("mk", claves ? claves.some((c) => c.startsWith(id + "-")) : false);
      });
      txtRefs.current.forEach((el, clave) => {
        el.classList.toggle("mk", set.has(clave));
      });
    };
    return () => { if (resaltar) resaltar.current = null; };
  }, [resaltar]);

  // ── Los gestos ───────────────────────────────────────────────────────────

  /** Acercar a `z`, dejando quieto el punto del plano que está bajo (px, py):
   *  lo que se mira no se escapa de abajo del puntero. */
  const ponerZoom = useCallback((z: number, px?: number, py?: number) => {
    const c = encuadre();
    if (!c) return;
    const x = px ?? c.r.left + c.r.width / 2;
    const y = py ?? c.r.top + c.r.height / 2;
    const [qx, qy] = aPlano(x, y, c);
    const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const k1 = (c.k / cam.current.zoom) * z1;
    const mx1 = qx - (x - c.r.left - c.r.width / 2) / k1;
    const my1 = qy - (y - c.r.top - c.r.height / 2) / k1;
    const [dx, dy, dz] = enElMundo(c.e, mx1 - c.mx, my1 - c.my);
    const T = cam.current.T;
    cam.current = { zoom: z1, T: [T[0] + dx, T[1] + dy, T[2] + dz] };
    aplicar();
  }, [aPlano, aplicar, encuadre]);

  /** Mover: la sala sigue al puntero, (dx, dy) píxeles. */
  const desplazar = useCallback((dx: number, dy: number) => {
    const c = encuadre();
    if (!c) return;
    const [ex, ey, ez] = enElMundo(c.e, -dx / c.k, -dy / c.k);
    const T = cam.current.T;
    cam.current = { ...cam.current, T: [T[0] + ex, T[1] + ey, T[2] + ez] };
    aplicar();
  }, [aplicar, encuadre]);

  /** Girar: se pide un cuadro por vez. */
  const orbitar = useCallback((dx: number, dy: number) => {
    const alto = svgRef.current?.clientHeight || wrapRef.current?.clientHeight || 600;
    vistaPedida.current = girar(vistaPedida.current, dx, dy, alto);
    if (!cuadro.current) {
      cuadro.current = requestAnimationFrame(() => {
        cuadro.current = 0;
        setVista(vistaPedida.current);
      });
    }
  }, []);
  useEffect(() => () => { if (cuadro.current) cancelAnimationFrame(cuadro.current); }, []);

  const centrar = useCallback(() => {
    cam.current = { zoom: 1, T: [0, 0, 0] };
    vistaPedida.current = VISTA_INICIAL;
    setVista(VISTA_INICIAL);
    aplicar();
  }, [aplicar]);

  /** Los punteros apoyados, para el pellizco con dos dedos. */
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ modo: Gesto; x: number; y: number; dist: number; movido: boolean } | null>(null);
  /** Hubo arrastre: el clic que el navegador manda al soltar no elige nada. */
  const arrastro = useRef(false);

  const alBajar = (ev: React.PointerEvent<HTMLDivElement>) => {
    // Un gesto nuevo: el arrastre anterior ya no tiene clic que anular (pudo
    // soltarse afuera del plano). Antes de mirar las herramientas, o el «+»
    // quedaba sin responder una vez.
    if (punteros.current.size === 0) arrastro.current = false;
    if ((ev.target as Element).closest?.(".herr, .chinchetas")) return;

    // El segundo dedo: acercar y mover a la vez.
    if (punteros.current.size === 1 && ev.pointerType === "touch") {
      punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const [a, b] = [...punteros.current.values()];
      gesto.current = {
        modo: "pellizco", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, movido: true,
      };
      arrastro.current = true;
      return;
    }
    if (punteros.current.size > 0) return;

    // Los botones de OrbitControls, con sus modificadores.
    const conTecla = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    const modo: Gesto | null =
      ev.button === 1 ? "acercar"
      : ev.button === 2 ? (conTecla ? "girar" : "mover")
      : ev.button === 0 ? (conTecla ? "mover" : "girar")
      : null;
    if (!modo) return;
    // El botón del medio abre el desplazamiento automático del navegador.
    if (ev.button === 1) ev.preventDefault();
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    gesto.current = { modo, x: ev.clientX, y: ev.clientY, dist: 0, movido: false };

    const mover = (e2: PointerEvent) => {
      const p = punteros.current.get(e2.pointerId);
      if (!p) return;
      p.x = e2.clientX; p.y = e2.clientY;
      const g = gesto.current;
      if (!g) return;
      if (g.modo === "pellizco") {
        if (punteros.current.size < 2) return;
        const [a, b] = [...punteros.current.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || g.dist;
        ponerZoom(cam.current.zoom * (dist / g.dist), mx, my);
        desplazar(mx - g.x, my - g.y);
        g.x = mx; g.y = my; g.dist = dist;
        return;
      }
      const dx = e2.clientX - g.x, dy = e2.clientY - g.y;
      if (!g.movido) {
        if (Math.abs(dx) + Math.abs(dy) < 3) return;
        g.movido = true;
        arrastro.current = true;
        setTip(null);
        setAyuda(false);
      }
      if (g.modo === "girar") orbitar(dx, dy);
      else if (g.modo === "mover") desplazar(dx, dy);
      else ponerZoom(cam.current.zoom * factorDeRueda(dy));
      g.x = e2.clientX; g.y = e2.clientY;
    };
    const soltar = (e2: PointerEvent) => {
      punteros.current.delete(e2.pointerId);
      // Con un dedo menos, el pellizco termina: seguir con el que queda
      // giraría la sala sin que nadie lo haya pedido.
      if (gesto.current?.modo === "pellizco" || punteros.current.size === 0) gesto.current = null;
      if (punteros.current.size > 0) return;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  };

  /** La rueda va como oyente NATIVO y no como `onWheel` de React.
   *
   *  React 18 registra `wheel` en la raíz y de forma PASIVA, así que el
   *  `preventDefault()` de adentro no hace nada: el navegador lo avisa por
   *  consola («Unable to preventDefault inside passive event listener») y la
   *  página rueda mientras uno cree que está acercando el plano. Con
   *  `{ passive: false }` sobre el lienzo, el gesto es del plano. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      setAyuda(false);
      ponerZoom(cam.current.zoom * factorDeRueda(ev.deltaY, ev.deltaMode, ev.ctrlKey), ev.clientX, ev.clientY);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [ponerZoom, hayEscena]);

  if (!scene) return null;

  const handleMove = (e: React.MouseEvent, title: string, sub: string) => {
    if (gesto.current?.movido) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, sub });
  };

  const porId = new Map(scene.prisms.map((p) => [p.f.id, p]));

  const elegir = (f: UnifiedFixture, e: React.MouseEvent, cara: "A" | "B") => {
    const rect = wrapRef.current?.getBoundingClientRect();
    onSelect(
      f,
      rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height } : undefined,
      cara,
    );
  };

  return (
    <div
      ref={wrapRef}
      className="plano-lienzo"
      style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0, display: "flex" }}
      onPointerDown={alBajar}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        // Soltar después de girar o mover no es tocar un mueble.
        if (arrastro.current) { arrastro.current = false; e.stopPropagation(); e.preventDefault(); }
      }}
    >
      {/* Las herramientas: tres botones de ícono de 32 px (hoja de piezas:
          `Plus` · `Minus` · `Focus`, el mismo trazo que el resto). «Centrar»
          perdió la palabra en pantalla, no en el `aria-label` ni en el
          `title`, que dicen qué hace. */}
      <div className="herr">
        <button type="button" aria-label="Acercar el plano" title="Acercar"
          onClick={(e) => { e.stopPropagation(); ponerZoom(cam.current.zoom * 1.25); }}>
          <Plus {...ICONO_TARJETA} />
        </button>
        <button type="button" aria-label="Alejar el plano" title="Alejar"
          onClick={(e) => { e.stopPropagation(); ponerZoom(cam.current.zoom / 1.25); }}>
          <Minus {...ICONO_TARJETA} />
        </button>
        <button type="button" aria-label="Centrar el plano"
          title="Centrar: volver a la vista de siempre, con la sede entera"
          onClick={(e) => { e.stopPropagation(); centrar(); }}>
          <Focus {...ICONO_TARJETA} />
        </button>
      </div>
      {chinchetas && chinchetas.length > 0 && (
        <div className="chinchetas">
          {chinchetas.map((ch) => {
            const k = `${ch.fixtureId}-${ch.cara}`;
            return (
              /* Un PUNTO chico sobre el techo, del color de su grupo: sin
                 globo, sin palito y sin ícono («aire y pines»), pegado a su
                 rótulo sin tapar ningún código (`acomodar`). Tocarlo lleva a
                 su aviso. */
              <button
                key={k}
                type="button"
                className="punto-revisar"
                data-grupo={ch.grupo}
                ref={(el) => { if (el) pinRefs.current.set(k, el); else pinRefs.current.delete(k); }}
                title={ch.titulo}
                aria-label={ch.titulo}
                onClick={(e) => { e.stopPropagation(); onChincheta?.(ch); }}
              />
            );
          })}
        </div>
      )}
      {/* El punto con anillo del mueble señalado desde «Para revisar». */}
      {senalar && (
        <div className="foco-capa" aria-hidden>
          <span ref={focoMarcaRef} className="foco-marca" style={{ display: "none" }} />
        </div>
      )}
      {ayuda && (
        <p className="herr-ayuda" aria-hidden>
          <span className="con-mouse"><Mouse {...ICONO_TARJETA} />Arrastrá para girar · clic derecho para mover · rueda para acercar</span>
          <span className="con-dedo">Un dedo gira · dos dedos acercan y mueven</span>
        </p>
      )}
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        onClick={() => onSelect(null)}
      >
        <g ref={escenaRef} className="iso-escena" data-foco="0">
        {/* Ground */}
        <polygon
          points={scene.piso}
          fill="var(--surface-2)"
          stroke="var(--line)"
          strokeWidth={TRAZO.piso}
        />
        {/* El piso punteado del mueble señalado desde «Para revisar»: debajo
            de los muebles, como una marca en el suelo. */}
        {senalar && (
          <polygon
            ref={focoPisoRef}
            className="foco-piso"
            style={{ display: "none" }}
            strokeWidth={TRAZO.filtro}
            strokeDasharray={`${(4 * UNIDAD_ISO).toFixed(3)} ${(3 * UNIDAD_ISO).toFixed(3)}`}
            strokeLinejoin="round"
          />
        )}

        {scene.prisms.map(({ f, topHalves, sides, stroke, topOutline, tooltipSub, faces, rentable }) => {
          const selected = faces.some((x) => selectedKeys.includes(`${f.id}-${x.face}`));
          const flags = match?.faceFlags.get(f.id);
          const matched = !match || (flags?.some(Boolean) ?? false);
          const dimmed = match !== null && !matched;
          const est = !rentable ? "resto"
            : dispoDe(f, faces[0]) === "libre" ? "libre" : "otro";
          return (
            <g
              key={f.id}
              className="pz"
              data-est={est}
              data-sel={selected ? "1" : undefined}
              ref={(el) => { if (el) grupoRefs.current.set(f.id, el); else grupoRefs.current.delete(f.id); }}
              onClick={(e) => {
                e.stopPropagation();
                /* QUÉ CARA se tocó. Una góndola doble son dos espacios que se
                   venden por separado, y en el plano cada uno tiene su media
                   tapa, su lado largo, su rótulo y su caja de impacto: tocar
                   la mitad de atrás tiene que sumar la cara de atrás. */
                const cara = (e.target as Element).getAttribute?.("data-cara");
                elegir(f, e, cara === "B" ? "B" : "A");
              }}
              onMouseMove={(e) => {
                // The popover already describes this one — a tooltip on top of
                // it would just be two cards saying the same thing.
                if (selected) { setTip(null); return; }
                handleMove(e, conNombrePropio(f, nombresPropios, f.label || f.code), tooltipSub);
              }}
              onMouseLeave={() => setTip(null)}
              opacity={dimmed ? 0.18 : 1}
              style={{ cursor: "pointer", transition: "filter .12s, opacity .15s" }}
            >
              {/* Los lados que miran a la cámara: ninguno desde arriba. */}
              {sides.map((s) => (
                <polygon
                  key={s.lado}
                  className={s.clase}
                  data-cara={s.cara ?? undefined}
                  points={s.points}
                  fill={s.fill}
                  stroke={stroke}
                  strokeWidth={TRAZO.mueble}
                  strokeLinejoin="round"
                />
              ))}
              {/* Top face (1 or 2 halves) — non-matching halves of a double dim per face */}
              {topHalves.map((th, i) => (
                <polygon
                  key={i}
                  className={`c-tapa${selectedKeys.includes(`${f.id}-${th.cara}`) ? " sel" : ""}`}
                  data-cara={th.cara}
                  points={th.points}
                  fill={th.color}
                  fillOpacity={match && matched && topHalves.length > 1 && flags && !flags[i] ? 0.25 : 1}
                  stroke={stroke}
                  strokeWidth={TRAZO.mueble}
                  strokeLinejoin="round"
                />
              ))}
              {/* Match highlight — accent glow + outline */}
              {match !== null && matched && !selected && (
                <>
                  <polygon points={topOutline} fill="none" stroke="var(--accent)" strokeWidth={TRAZO.brillo} opacity={0.3}
                    strokeLinejoin="round" />
                  <polygon points={topOutline} fill="none" stroke="var(--accent)" strokeWidth={TRAZO.filtro}
                    strokeLinejoin="round" />
                </>
              )}
              {/* Selection ring */}
              {selected && (
                <polygon points={topOutline} fill="none" stroke="var(--accent)" strokeWidth={TRAZO.elegido}
                  strokeLinejoin="round" />
              )}
            </g>
          );
        })}

        {/* LOS RÓTULOS, en una capa propia dibujada DESPUÉS de los muebles: con
            el rótulo colgando de su pieza, los prismas de adelante le comen
            media palabra al de atrás. */}
        <g className="rotulos">
          {labels.map((l) => {
            const a = scene.anclas.get(l.clave);
            if (!a) return null;
            const ax = a[0].toFixed(3), ay = a[1].toFixed(3);
            // La segunda línea: la corta de una cara por participación, si la hay.
            const linea = l.corto || l.fecha;
            return (
              <text
                key={l.clave}
                className="p-cod"
                data-cod={l.cod}
                data-choque={l.choque || undefined}
                data-sel={selectedKeys.includes(l.clave) ? "1" : undefined}
                x={ax}
                y={ay}
                ref={(el) => { if (el) txtRefs.current.set(l.clave, el); else txtRefs.current.delete(l.clave); }}
              >
                <tspan x={ax} dy={linea || l.choque ? "-.22em" : ".36em"}>{l.cod}</tspan>
                {linea && <tspan className="p-fec" x={ax} dy="1.18em">{linea}</tspan>}
                {l.choque && <tspan className="p-chq" x={ax} dy="1.18em">{l.choque}</tspan>}
              </text>
            );
          })}
        </g>

        {/* LAS CAJAS DE IMPACTO DEL RÓTULO, en una capa por encima de todo.
            El rótulo se dibuja arriba de los muebles y no cobra el clic
            (`pointer-events:none`); el que lo cobra es el mueble que nombra. La
            caja tiene que estar ARRIBA y no adentro del grupo del mueble: los
            prismas se pintan de atrás hacia adelante, así que una caja metida
            en el grupo de un mueble del fondo queda tapada por los de adelante
            y el clic sobre el rótulo terminaba eligiendo el mueble equivocado
            —o uno que no se alquila, que además vaciaba el contrato—.
            Las miden `calibrar()` y `acomodar()`, no un `style`. */}
        <g className="impactos">
          {/* El mínimo para el dedo (ver `ajustarMinimos`): debajo de las cajas
              de los rótulos. Una góndola doble elige la cara cuyo rótulo
              queda más cerca del toque. */}
          {scene.prisms.filter((p) => seVendeAlgo(p.f)).map(({ f, faces, tooltipSub }) => (
            <rect
              key={`min-${f.id}`}
              className="pl-hit pl-min"
              x={0} y={0} width={0} height={0}
              ref={(el) => { if (el) minRefs.current.set(f.id, el); else minRefs.current.delete(f.id); }}
              onClick={(e) => {
                e.stopPropagation();
                let cara: "A" | "B" = "A";
                const c = encuadre();
                if (faces.length > 1 && c) {
                  const [px, py] = aPlano(e.clientX, e.clientY, c);
                  const d = (k: string) => {
                    const a = scene.anclas.get(k);
                    return a ? Math.hypot(a[0] - px, a[1] - py) : Infinity;
                  };
                  if (d(`${f.id}-B`) < d(`${f.id}-A`)) cara = "B";
                }
                elegir(f, e, cara);
              }}
              onMouseMove={(e) => handleMove(e, conNombrePropio(f, nombresPropios, f.label || f.code), tooltipSub)}
              onMouseLeave={() => setTip(null)}
            />
          ))}
          {labels.map((l) => {
            // Con `partirClave`: un `id` puede tener guiones, y una llave de
            // una parte (`${id}-A-PU2`) no es la de una cara.
            const { id, cara } = partirClave(l.clave);
            const pieza = porId.get(id);
            return (
              <rect
                key={l.clave}
                className="pl-hit"
                x={0} y={0} width={0} height={0}
                ref={(el) => { if (el) hitRefs.current.set(l.clave, el); else hitRefs.current.delete(l.clave); }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pieza) elegir(pieza.f, e, cara);
                }}
              />
            );
          })}
        </g>
        </g>
      </svg>

      {/* Tooltip */}
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 14,
            top: tip.y + 14,
            pointerEvents: "none",
            background: "var(--dark-bg)",
            border: "1px solid var(--dark-line)",
            borderRadius: "var(--r-md)",
            padding: "6px 10px",
            zIndex: 5,
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{ fontSize: "var(--t-2xs)", fontWeight: 600, color: "var(--dark-ink-1)" }}>{tip.title}</div>
          <div style={{ fontSize: "var(--t-3xs)", color: "var(--dark-ink-2)", marginTop: 1 }}>{tip.sub}</div>
        </div>
      )}
    </div>
  );
}

/** La clave del plano: qué quiere decir cada color y CUÁNTAS caras hay de cada
 *  uno.
 *
 *  El número al lado del color es lo que la vuelve un dato en vez de un
 *  glosario. Sin él hay que contar prismas a ojo para saber si «se libera en el
 *  periodo» son dos o son veinte, que es justo la pregunta que se le hace a
 *  esta pantalla.
 *
 *  CINCO ESTADOS, con «En el contrato» como quinto contado (de D): lo que entra
 *  al contrato deja de estar libre, y tiene que verse que dejó de estarlo en el
 *  mismo renglón donde se cuenta lo libre. Los cuatro primeros conteos y el
 *  pie de la tarifa son LA MISMA CUENTA mirada en dos lugares, así que la
 *  pantalla no se puede contradecir a sí misma.
 *
 *  Las palabras cambian con el modo porque la pregunta cambia: quien vende mira
 *  lo que puede ofrecer —«Disponible en parte»— y quien supervisa lo que ya
 *  vendió —«Vendido en parte»—. Es el mismo hecho y el mismo color. El ámbar
 *  junta tres motivos (se libera adentro del periodo, partes vendidas, una
 *  participación comprometida): el número es la suma y el `title` los separa,
 *  sin nombres (`desgloseDelParcial`). Decía «Se libera en el periodo» /
 *  «Vence dentro» y contaba como días las doce caras por participación. */
function MapLegend({
  tally, modo, enContrato, chinchetas, pendientes, onPendientes,
}: {
  tally: ConteoDelPeriodo;
  modo: "vender" | "supervisar";
  /** Cuántas caras hay en el contrato que se está armando. Sólo en Vender. */
  enContrato?: number;
  /** Cuántos muebles tienen algo en «Para revisar». Sólo en Supervisar. */
  chinchetas?: number;
  /** Si el plano muestra sus puntos, y prenderlos o apagarlos: «Para revisar
   *  N» es un BOTÓN («aire y pines»). Sólo en Supervisar. */
  pendientes?: boolean;
  onPendientes?: () => void;
}) {
  const items: { c: string; b: string; l: string; n?: number; t?: string }[] = [
    { c: rangeTop().libre, b: "var(--libre-borde)",
      l: modo === "vender" ? RANGE_LABEL.libre : "Libre", n: tally.libres },
    { c: rangeTop().parcial, b: "var(--entra-borde)",
      l: modo === "vender" ? RANGE_LABEL.parcial : RANGE_LABEL_PARCIAL_SUPERVISAR, n: enParte(tally),
      t: desgloseDelParcial(tally) || undefined },
    { c: rangeTop().tomado, b: "var(--ocupado-borde)", l: RANGE_LABEL.tomado, n: tally.tomados },
    { c: noRentableTop(), b: "var(--resto)", l: NON_RENTABLE_LABEL },
  ];
  if (enContrato !== undefined) {
    items.push({ c: "var(--pl-ei)", b: "var(--ink-3)", l: "En el contrato", n: enContrato });
  }
  /* Sin separadores: una raya suelta entre dos ítems quedaba colgando al
     final del renglón cuando la clave se partía. Los separa el `gap`. */
  return (
    <div className="clave">
      {items.map((o) => (
        <span key={o.l} title={o.t}>
          <i style={{ background: o.c, borderColor: o.b }} />
          {o.l}
          {o.n !== undefined && <b>{o.n}</b>}
        </span>
      ))}
      {/* «Para revisar N»: prende y apaga TODOS los puntos del plano. Arranca
          apagado y se recuerda (`pendientesEnElPlano`, en el store). */}
      {chinchetas !== undefined && (
        <button
          type="button"
          className="clave-pin"
          aria-pressed={!!pendientes}
          onClick={onPendientes}
          title={pendientes
            ? "Esconder los puntos de lo que hay para revisar"
            : "Mostrar un punto sobre cada mueble con algo para revisar"}
        >
          <Pin {...ICONO_TARJETA} />
          Para revisar
          <b>{chinchetas}</b>
        </button>
      )}
    </div>
  );
}

// ─── Fixture detail drawer (dark, right side) ────────────────────────────────

// ─── Space files (shared by the popover and the full detail) ────────────────

type FilesState = "loading" | "ok" | "none" | "error";

/** Look up the Space behind a face code and list its contract files.
 *  Skipped entirely when the fixture cannot hold a contract. */
function useSpaceFiles(code: string, enabled: boolean) {
  const [state, setState] = useState<FilesState>("loading");
  const [files, setFiles] = useState<SpaceFileMeta[]>([]);

  useEffect(() => {
    if (!enabled) {
      setState("none");
      setFiles([]);
      return;
    }
    let cancelled = false;
    setState("loading");
    setFiles([]);
    // `si_existe=1`: un espacio que nunca se vendió no tiene fila, y eso es lo
    // normal —el servidor contesta `null` en vez del 404 que ensuciaba la
    // consola en cada ficha—.
    client
      .get<Space | null>(`/spaces/by-code/${encodeURIComponent(code)}`, { params: { si_existe: 1 } })
      .then(async (r) => {
        if (!r.data) { if (!cancelled) setState("none"); return; }
        const fl = await listSpaceFiles(r.data.id);
        if (cancelled) return;
        setFiles(fl);
        setState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err?.response?.status === 404 ? "none" : "error");
      });
    return () => { cancelled = true; };
  }, [code, enabled]);

  return { state, files };
}

function fileTint(f: SpaceFileMeta): string {
  if (f.content_type?.startsWith("image/")) return "var(--accent)";
  if (/sheet|excel|csv/i.test(f.content_type ?? "")) return "var(--success)";
  return "var(--danger)";
}

function FileRow({ file, onOpen }: { file: SpaceFileMeta; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "8px 10px", borderRadius: "var(--r-md)",
        border: "1px solid var(--line)", background: "var(--surface)",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}
    >
      <FileText size={13} style={{ color: fileTint(file), flexShrink: 0 }} />
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 500, color: "var(--ink-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {file.filename}
      </span>
      <span style={{ fontSize: 10, color: "var(--ink-3)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
        {file.size >= 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(file.size / 1024))} KB`}
      </span>
    </button>
  );
}

/** Status pill in the page's light theme (the old panel was dark-on-light).
 *  Reads the face, not the raw status, so a contract signed for later says
 *  "Contratado" here exactly as it does on the map and in the cards. */
/** La palabra del estado de una cara POR PARTICIPACIÓN que está libre por sí
 *  misma (los contratos `…-PC3` nunca la pintan ocupada): sale de la ocupación
 *  anónima de hoy y es la misma para quien administra y para el trabajador
 *  —«Libre», «Por participación», «Tomada»—, nunca con %. */
const META_DE_PARTICIPACION: Record<"parcial" | "tomado", { meta: (typeof STATUS_META)[DisplayStatus]; anillo: DisplayStatus }> = {
  parcial: { meta: { ...STATUS_META.reserved, label: palabraDeLaCara("parcial") }, anillo: "reserved" },
  tomado: { meta: { ...STATUS_META.expired, label: palabraDeLaCara("tomado") }, anillo: "active" },
};

/** La pastilla de cada estado (rediseño, PR 2; hoja de piezas): verde lo que
 *  trabaja o se puede vender, rojo lo que se cae o no cuadra, ámbar lo vendido
 *  en parte, gris lo apartado. La palabra va siempre adentro: el color nunca va
 *  solo. Las clases están en `supervisar.css`. */
const PASTILLA_DE_ESTADO: Record<DisplayStatus, "libre" | "entra" | "ocupado" | "resto" | ""> = {
  active: "libre",
  free: "libre",
  committed: "",
  expiring: "ocupado",
  expired: "ocupado",
  no_contract: "ocupado",
  reserved: "resto",
  maintenance: "resto",
};

/** La palabra de una cara entera que está libre pero tiene partes vendidas. */
const VENDIDO_EN_PARTE = "Vendido en parte";

function StatusPill({ fixture, face, enParte = false }: {
  fixture: UnifiedFixture; face: FaceEntry;
  /** La cara está libre entera pero tiene partes vendidas que corren. */
  enParte?: boolean;
}) {
  const rentable = isRentable(fixture) || esPieza(face.parte);
  const ds = displayStatus(face);
  const pc = useDispoDeHoy(fixture, face.face);
  const porPc = !face.parte && ds === "free" && pc && pc.dispo !== "libre" ? META_DE_PARTICIPACION[pc.dispo] : null;
  const meta = porPc ? porPc.meta : STATUS_META[ds];
  const claseDePastilla = !rentable ? "resto"
    : porPc ? (porPc.anillo === "active" ? "ocupado" : "entra")
    : enParte && ds === "free" ? "entra"
    : PASTILLA_DE_ESTADO[ds];
  return (
    <span className={`pill ${claseDePastilla}`}>
      {!rentable ? NON_RENTABLE_LABEL : !porPc && enParte && ds === "free" ? VENDIDO_EN_PARTE : meta.label}
    </span>
  );
}

function SupplierLine({ entry, size = 34 }: { entry: FaceEntry; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: "var(--r-lg)", flexShrink: 0,
          background: "var(--accent-100)", color: "var(--accent-700)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.42, fontWeight: 700,
        }}
      >
        {entry.supplierName.trim().charAt(0).toUpperCase() || "—"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14, fontWeight: 600, color: "var(--ink-1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {entry.supplierName}
        </div>
        {entry.brandCategory && (
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{entry.brandCategory}</div>
        )}
      </div>
    </div>
  );
}

/** Light-theme day chip — replaces the dark drawer's daysChip(). */
function daysPill(days: number | null): { text: string; color: string; bg: string } | null {
  if (days === null) return null;
  if (days < 0)
    return { text: `Vencido hace ${Math.abs(days)}d`, color: "var(--danger)", bg: "var(--danger-100)" };
  if (days <= 30)
    return { text: `Vence en ${days}d`, color: "var(--warning)", bg: "var(--warning-100)" };
  return { text: `${days}d restantes`, color: "var(--success)", bg: "var(--success-100)" };
}

function PeriodBox({ entry }: { entry: FaceEntry }) {
  const pill = daysPill(entry.endDate ? daysUntil(entry.endDate) : null);
  return (
    <div>
      <div
        style={{
          fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 6,
        }}
      >
        Periodo
      </div>
      <div
        style={{
          border: "1px solid var(--line)", background: "var(--surface-2)",
          borderRadius: "var(--r-lg)", padding: "10px 12px",
          display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>INICIO</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--ink-1)", marginTop: 2 }}>
            {formatDate(entry.startDate)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-3)" }}>FIN</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", color: pill?.color ?? "var(--ink-1)", marginTop: 2 }}>
            {formatDate(entry.endDate)}
          </div>
        </div>
        {pill && (
          <div style={{ gridColumn: "1 / -1" }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700,
                padding: "3px 9px", borderRadius: "var(--r-sm)", background: pill.bg, color: pill.color,
              }}
            >
              {pill.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lo que el TRABAJADOR ve de una cara por participación en la ficha (D7 con
 *  D13): que se vende así y la palabra de su estado hoy —«Libre», «Por
 *  participación», «Tomada»—, sin %, sin proveedores y sin zonas. Lo que hay
 *  que armar está en Montajes, como cualquier contrato. */
function CaraPorParticipacion({ fixture, face }: { fixture: UnifiedFixture; face: "A" | "B" }) {
  const pc = useDispoDeHoy(fixture, face);
  return (
    <div data-cara-por-participacion style={{ padding: "18px 4px 6px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: "var(--t-base)", fontWeight: 700, color: "var(--ink-1)" }}>
        Se vende por participación
      </div>
      <div style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)", lineHeight: 1.55, marginTop: 6 }}>
        {pc ? `Hoy: ${palabraDeLaCara(pc.dispo)}.` : "La cara se reparte entre varios proveedores."}{" "}
        Lo que hay que armar está en Montajes, como cualquier contrato.
      </div>
    </div>
  );
}

/** Shown instead of a wall of "—" when there is nothing to report. */
function NoContractState({ fixture, isAdmin }: { fixture: UnifiedFixture; isAdmin: boolean }) {
  const rentable = isRentable(fixture);
  // La caja y la columna no se venden enteras, pero sus piezas sí (la bahía
  // de impulso, el forro): se dice cuáles y dónde se configuran.
  const llevaPiezas = !rentable && piezasDeLaFamilia(fixture.type).length > 0;
  const tienePiezas = piezasDe(fixture).length > 0;
  const plural = claseDe(piezasDeLaFamilia(fixture.type)[0] ?? "")?.plural ?? "piezas";
  return (
    <div style={{ padding: "22px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div
        style={{
          width: 46, height: 46, borderRadius: "var(--r-xl)", marginBottom: 13,
          background: rentable ? "var(--success-50)" : "var(--surface-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Building2 size={22} style={{ color: rentable ? "var(--success)" : "var(--ink-2)" }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)" }}>
        {rentable ? "Disponible para vender" : llevaPiezas ? "No se vende entero" : "Parte del local"}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 6 }}>
        {rentable
          ? "Este espacio no tiene contrato activo."
          : llevaPiezas && tienePiezas
          ? `Es parte del local y no cuenta en la ocupación; sus ${plural} se venden, cada una con su contrato.`
          : llevaPiezas
          ? `Es parte del local y no cuenta en la ocupación; sus ${plural} se venden si se configuran en el plano.`
          : "Está marcado como no comercializable: no admite contrato y no cuenta en la ocupación."}
      </div>
      {isAdmin && (
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 10 }}>
          {rentable
            ? "Con «Negociar este espacio» llenás el contrato acá mismo."
            : llevaPiezas
            ? "En el plano, «Cómo se vende» de su panel dice cuántas se venden."
            : "Para alquilarlo, cambiá su destino a «Comercializable» desde el plano."}
        </div>
      )}
    </div>
  );
}

// ─── Quick-look popover, anchored to the fixture on the map ─────────────────

function FixturePopover({
  fixture, cara = "A", anchor, isAdmin, onExpand, onNegociar, onRenovar, onAbrirEnDistribucion, onClose,
}: {
  fixture: UnifiedFixture;
  /** Fase 2 · I4: la cara que se tocó en el plano (`detailFace`). El globo
   *  decía siempre la A: en una góndola doble por participación, tocar la B
   *  daba el % de la A. */
  cara?: "A" | "B";
  anchor: MapAnchor;
  isAdmin: boolean;
  onExpand: () => void;
  /** Abre el contrato en el riel. Ausente para el mercaderista, que no vende. */
  onNegociar?: () => void;
  /** El mismo acuerdo otra vez, prellenado. Sólo cuando hay algo que renovar. */
  onRenovar?: () => void;
  /** Una cara por participación se vende en el Editor 3D → Distribución, no
   *  acá: sólo para quien administra. */
  onAbrirEnDistribucion?: () => void;
  onClose: () => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const entry = faces.find((x) => x.face === cara) ?? faces[0];
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  // Por el código COMPLETO, igual que el panel de detalle: `by-code` guarda
  // `NAVE-PUN-04`, y buscando `PUN-04` contestaba 404 siempre — el contador de
  // archivos decía "Sin archivos" aunque hubiera.
  const { files } = useSpaceFiles(
    fullSpaceCode(fixture.sede, entry.code),
    rentable && entry.status === "occupied",
  );
  const pill = daysPill(entry.endDate ? daysUntil(entry.endDate) : null);
  const hasContract = rentable && entry.supplierName.trim().length > 0;
  // Una cara POR PARTICIPACIÓN nunca tiene `supplierName` (un contrato `…-PC3`
  // no la pinta): sin esto el globo decía «Sin contrato activo — disponible
  // para vender» sobre un robatope tomado al 100 %. Lo dice su ocupación
  // anónima de hoy —la misma de la pastilla—: cuánto está comprometido y
  // cuánto queda, y «disponible» sólo si queda algo (`textoDeLoComprometido`).
  const esPc = rentable && porParticipacion(fixture);
  const dispoPc = useDispoDeHoy(fixture, entry.face);
  // Vender por partes: qué puertas de la cara del globo están vendidas, sin
  // nombres (el detalle, con «Ver todo», dice de quién y hasta cuándo).
  const sedeActiva = useFixtureStore((s) => s.sede);
  const estado = useFixtureStore((s) => s.estadoComercial);
  const puertas = useMemo(
    () => (rentable
      // Las de la B llevan su letra en el sufijo (`B·EN2`, `partesConEstado`).
      ? partesConEstado(fixture, estado, sedeActiva).filter((p) => p.sufijo.startsWith("B·") === (entry.face === "B"))
      : []),
    [rentable, fixture, estado, sedeActiva, entry.face],
  );
  // De qué clase son (puertas, tramos, entrepaños), para decirlas bien.
  const divisionDelPopover = divisionDe(fixture);
  const claseDelPopover = divisionDelPopover ? claseDe(divisionDelPopover.clase) : undefined;
  const generoDelPopover = divisionDelPopover ? concordancia(divisionDelPopover.clase).o : "a";

  const W = 296;
  // Alto estimado, sólo para no dejarlo colgando fuera del mapa. Creció con el
  // botón de negociar; si se queda corto el popover se sale por abajo.
  const EST_H = rentable && isAdmin ? 296 : 250;
  // Flip to whichever side has room, measured against the real map width.
  const flip = anchor.x + 18 + W > anchor.w - 8;
  const left = Math.max(8, flip ? anchor.x - W - 18 : anchor.x + 18);
  const top = Math.min(Math.max(8, anchor.y - 70), Math.max(8, anchor.h - EST_H));

  return (
    <div
      style={{
        position: "absolute", left, top, width: W, zIndex: 30,
        background: "var(--surface)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)",
      }}
    >
      <div
        style={{
          position: "absolute", [flip ? "right" : "left"]: -7, top: 82,
          width: 12, height: 12, background: "var(--surface)",
          borderLeft: flip ? "none" : "1px solid var(--line-strong)",
          borderBottom: flip ? "none" : "1px solid var(--line-strong)",
          borderRight: flip ? "1px solid var(--line-strong)" : "none",
          borderTop: flip ? "1px solid var(--line-strong)" : "none",
          transform: "rotate(45deg)",
        } as React.CSSProperties}
      />

      <div style={{ padding: "12px 14px 11px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {conNombrePropio(fixture, nombresPropios, fixture.label || fixture.code)}
          </div>
          <div
            style={{
              fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {entry.code} · {fixture.sede}
          </div>
          <div style={{ marginTop: 7 }}>
            <StatusPill fixture={fixture} face={entry} />
          </div>
        </div>
        <button
          onClick={onClose}
          title="Cerrar"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, flexShrink: 0, borderRadius: "var(--r-sm)",
            border: "1px solid var(--line)", background: "var(--surface-2)",
            color: "var(--ink-2)", cursor: "pointer", padding: 0,
          }}
        >
          <X size={11} />
        </button>
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
        {hasContract ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <SupplierLine entry={entry} size={30} />
              {isAdmin && entry.negotiatedValue > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--success)" }}>
                  {formatCOP(entry.negotiatedValue)}
                </span>
              )}
            </div>
            {(entry.startDate || entry.endDate) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                  {formatRange(entry.startDate, entry.endDate)}
                </span>
                {pill && (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--r-sm)", background: pill.bg, color: pill.color }}>
                    {pill.text}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div data-globo-participacion={esPc ? "" : undefined} style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {rentable
              ? esPc
                ? textoDeLoComprometido(dispoPc, isAdmin, { propio: entry.status })
                : puertas.some((p) => p.vendida) && claseDelPopover
                ? `Entera, sin contrato: hay ${claseDelPopover.plural} vendid${generoDelPopover}s.`
                : "Sin contrato activo — disponible para vender."
              : "Parte del local, no admite contrato."}
          </div>
        )}
        {puertas.length > 0 && (
          <div data-puertas-del-popover style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
            {puertas.map((p) => `${p.sufijo} ${p.vendida ? `vendid${generoDelPopover}` : "libre"}`).join(" · ")}
          </div>
        )}

        {/* La acción principal del mapa es vender: el popover es lo que se abre
            al tocar un espacio, y antes lo único que ofrecía era mirar. */}
        {/* Tocar un mueble naranja en el plano y poder renovarlo ahí mismo: es
            el camino corto, y el color ya dijo que se está por caer. */}
        {rentable && onRenovar && (
          <button
            onClick={onRenovar}
            style={{
              width: "100%", height: 34, borderRadius: "var(--r-md)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--accent)", color: "#fff",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <RefreshCw size={13} />
            Renovar
          </button>
        )}
        {rentable && onNegociar && (
          <button
            onClick={onNegociar}
            style={{
              width: "100%", height: 34, borderRadius: "var(--r-md)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              border: onRenovar ? "1px solid var(--line)" : "none",
              background: onRenovar ? "var(--surface-2)" : "var(--accent)",
              color: onRenovar ? "var(--ink-2)" : "#fff",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Handshake size={13} />
            {onRenovar ? "Con otro proveedor"
              : hasContract ? "Nuevo contrato" : "Negociar este espacio"}
          </button>
        )}
        {esPc && isAdmin && onAbrirEnDistribucion && (
          <button
            onClick={onAbrirEnDistribucion}
            title="Abre el 3D del plano en esta cara, en Distribución"
            style={{
              width: "100%", height: 34, borderRadius: "var(--r-md)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-2)",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Layers size={13} />
            Abrir en Distribución
          </button>
        )}

        {/* Un mueble interno con cara: su planograma (lo que hay que montar).
            Lo ve todo el equipo; lo planifica quien administra (o el equipo,
            si la dueña lo habilitó). */}
        {!rentable && tieneSuperficie(fixture.type) && (
          <button
            data-abrir-planograma
            onClick={() => { onClose(); void usePlanograma.getState().abrir({ sede: sedeActiva, fixtureId: fixture.id, cara: entry.face }); }}
            style={{
              width: "100%", height: 34, borderRadius: "var(--r-md)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-2)",
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Shapes size={13} />
            Planograma{faces.length > 1 ? ` de la cara ${entry.face}` : ""}
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          {rentable && (
            <>
              <FileText size={13} style={{ color: "var(--ink-3)" }} />
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {files.length > 0 ? `${files.length} archivo${files.length !== 1 ? "s" : ""}` : "Sin archivos"}
              </span>
            </>
          )}
          <button
            onClick={onExpand}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", color: "var(--accent-700)",
            }}
          >
            Ver todo <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vender por partes: las puertas de la cara ───────────────────────────────

/**
 * Las partes de la cara que se está mirando: las que el mueble ofrece y las
 * que tienen contrato, cada una con lo suyo. Una puerta vendida es un contrato
 * como cualquier otro, así que acá se renueva y se cancela, una por una, igual
 * que la cara entera en el resto del panel.
 *
 * El mercaderista ve qué puerta es de quién y hasta cuándo —es lo que tiene
 * que armar—, nunca cuánto paga. Lee el mapa CRUDO del store: la fusión no le
 * cambia nada a la nevera cuando se vende una puerta.
 */
function PartesDeLaCara({
  fixture, face, isAdmin, onVender, onRenovar, onCancelado, onEditar, onEditarProximo,
}: {
  fixture: UnifiedFixture;
  face: "A" | "B";
  isAdmin: boolean;
  /** Abrir Vender con esa parte. */
  onVender?: (parte: string) => void;
  onRenovar?: (e: FaceEntry) => void;
  onCancelado?: () => void;
  /** «Editar contrato» de una parte con contrato (su `leaseId`, del mapa
   *  crudo: sólo le llega a quien administra). */
  onEditar?: (e: FaceEntry) => void;
  /** «Editar el próximo»: el contrato que arranca después del vigente de la
   *  parte (`proximoLeaseId`); su `esperado` sale de ESE contrato, no de la fila. */
  onEditarProximo?: (e: FaceEntry, leaseId: number) => void;
}) {
  const sede = useFixtureStore((s) => s.sede);
  const estado = useFixtureStore((s) => s.estadoComercial);
  const indice = useMemo(() => indiceDePartes(estado), [estado]);
  const filas = useMemo(() => {
    const ofrecidas = partesDe(fixture).filter((p) => p.cara === face).map((p) => p.parte);
    // Las participaciones (`…-PC3`) no van acá: las muestra
    // `ParticipacionesDeLaCara`, sólo para quien administra (§9.9).
    const conContrato = partesConContrato(fixture, estado, indice, sede, false).filter((p) => p.face === face);
    const mismo = (a: ParteRef, b: ParteRef) => sufijoDeParte(a) === sufijoDeParte(b);
    return [
      ...ofrecidas.map((parte) => conContrato.find((e) => mismo(e.parte!, parte))
        ?? entradaDeParte(fixture, face, parte, estado, sede)),
      ...conContrato.filter((e) => !ofrecidas.some((p) => mismo(p, e.parte!))),
    ];
  }, [fixture, face, estado, indice, sede]);
  if (filas.length === 0) return null;
  // De qué clase: la forma en que se vende hoy o sus piezas (las bahías de
  // la caja) o, si dejó de venderse así, la de la primera parte con contrato.
  const claseDeLaCara = divisionDe(fixture)?.clase ?? piezasDe(fixture)[0]?.clase ?? filas[0]?.parte?.clase ?? "puertas";
  const reglaDeLaCara = claseDe(claseDeLaCara);
  const g = concordancia(claseDeLaCara);
  return (
    <div data-partes-de-la-cara={`${fixture.id}-${face}`}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 7 }}>
        Por {reglaDeLaCara?.plural ?? "partes"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filas.map((e) => {
          const conContrato = e.supplierName.trim().length > 0;
          const deLaBase = estado[fullSpaceCode(fixture.sede || sede, e.code)];
          const leaseId = deLaBase?.leaseId;
          const proximoLeaseId = deLaBase?.proximoLeaseId;
          return (
            <div key={e.code} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12.5, color: "var(--ink-1)" }}>
                  {codigoVisible(e)}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{e.parte ? textoDeParte(e.parte, cantidadDe(fixture, e.parte.clase)) : ""}</span>
                <span style={{ marginLeft: "auto" }}><StatusPill fixture={fixture} face={e} /></span>
              </div>
              {conContrato && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--ink-2)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.supplierName}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>{formatRange(e.startDate, e.endDate)}</span>
                  {isAdmin && e.negotiatedValue > 0 && (
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--success)" }}>
                      {formatCOP(e.negotiatedValue)}
                    </span>
                  )}
                </div>
              )}
              {isAdmin && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {onRenovar && renovable(e) && (
                    <button onClick={() => onRenovar(e)} style={botonDeParte(true)}>
                      <RefreshCw size={12} /> Renovar
                    </button>
                  )}
                  {onEditar && conContrato && typeof leaseId === "number" && (
                    <button onClick={() => onEditar({ ...e, leaseId })} style={botonDeParte(false)} data-editar-contrato={leaseId}
                      title="Abre Vender con este contrato cargado; al guardar se reenvía a los correos">
                      <FilePenLine size={16} strokeWidth={1.75} aria-hidden /> Editar contrato
                    </button>
                  )}
                  {onEditarProximo && conContrato && typeof leaseId === "number" && typeof proximoLeaseId === "number" && (
                    <button onClick={() => onEditarProximo({ ...e, leaseId, proximoLeaseId }, proximoLeaseId)} style={botonDeParte(false)}
                      data-editar-contrato={proximoLeaseId} data-editar-proximo
                      title="Abre Vender con el contrato que arranca después de éste; al guardar se reenvía a los correos">
                      <FilePenLine size={16} strokeWidth={1.75} aria-hidden /> Editar el próximo
                    </button>
                  )}
                  {onVender && !conContrato && e.parte && (
                    <button onClick={() => onVender(sufijoDeParte(e.parte!))} style={botonDeParte(false)}>
                      <Handshake size={12} /> Vender {g.este} {reglaDeLaCara?.singular ?? "parte"}
                    </button>
                  )}
                </div>
              )}
              {isAdmin && onCancelado && (
                <CancelarContrato
                  key={e.code}
                  spaceCode={fullSpaceCode(fixture.sede || sede, e.code)}
                  segunElPlano={conContrato}
                  onCancelado={onCancelado}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function botonDeParte(lleno: boolean): React.CSSProperties {
  return {
    height: 28, padding: "0 10px", borderRadius: "var(--r-md)",
    display: "inline-flex", alignItems: "center", gap: 5,
    border: lleno ? "none" : "1px solid var(--line)",
    background: lleno ? "var(--accent)" : "var(--surface-2)",
    color: lleno ? "#fff" : "var(--ink-2)",
    fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
  };
}

// ─── Full detail, rendered in the right-hand rail ────────────────────────────

function FixtureDetailCard({
  fixture, isAdmin, face, onFace, onBack, onNegociar, onRenovar, onCancelado, onOpenFile,
  onNegociarParte, onRenovarParte, onEditar, onEditarParticipacion, onEditarProximo, avisoDeEdicion,
  unidad = "mes", montajeDe, montajeDelCodigo, cobroDe, reservaDe, onReservaCambio,
  planometriaPedida, onPlanometriaCargada, onVenderLoQueQueda,
}: {
  /** La unidad de la plata de la franja (rediseño, PR 2). */
  unidad?: UnidadDePlata;
  /** El montaje del contrato de la cara, como en la tabla. */
  montajeDe?: (entry: FaceEntry) => MountConfirmation | undefined;
  /** El montaje de un contrato por su código completo (las participaciones). */
  montajeDelCodigo?: (codigo: string, desde: string) => MountConfirmation | undefined;
  /** El cobro por % de las ventas de un contrato, por su código completo. */
  cobroDe?: (codigo: string) => CobroPorVentas | undefined;
  /** La reserva viva de ese espacio (código completo), para «Reservado hasta
   *  …» con Confirmar y Cancelar. Sólo quien administra. */
  reservaDe?: (codigo: string) => ReservaDeEspacio | undefined;
  onReservaCambio?: () => void;
  /** Se llegó por «Cargar planometría»: el código completo del contrato al
   *  que le falta. La ficha la muestra arriba y la trae a la vista. */
  planometriaPedida?: PlanometriaPedida | null;
  onPlanometriaCargada?: () => void;
  /** «Vender el Y %» de una cara por participación: abre Vender con ella. */
  onVenderLoQueQueda?: (quedaPb: number) => void;
  /** Vender por partes: abrir Vender con una parte de esta cara (`PU2`). */
  onNegociarParte?: (parte: string) => void;
  /** Renovar el contrato de una parte. */
  onRenovarParte?: (e: FaceEntry) => void;
  /** «Editar contrato»: abre Vender con ESE contrato (el de la cara o el de
   *  una parte, por su `leaseId`) cargado. Sólo quien administra. */
  onEditar?: (e: FaceEntry) => void;
  /** «Editar contrato» de una participación de la cara (su término). */
  onEditarParticipacion?: (t: TerminoOut) => void;
  /** «Editar el próximo contrato»: el que arranca después del vigente de esta
   *  cara (`proximoLeaseId`). Su semilla y su `esperado` salen de ESE contrato. */
  onEditarProximo?: (e: FaceEntry, leaseId: number) => void;
  /** Lo que salió mal al abrir «Editar contrato» (se dice acá). */
  avisoDeEdicion?: string | null;
  fixture: UnifiedFixture;
  isAdmin: boolean;
  face: "A" | "B";
  onFace: (f: "A" | "B") => void;
  onBack: () => void;
  /** Cambia este panel por el del contrato, sobre la cara que se está viendo. */
  onNegociar?: () => void;
  /** El mismo acuerdo otra vez, prellenado. Sólo llega cuando el contrato se
   *  está por caer: antes de eso no hay nada que renovar. */
  onRenovar?: () => void;
  /** El contrato se canceló en la base. No lleva parche: el mapa se pinta
   *  desde ahí, así que alcanza con volver a leer. */
  onCancelado?: () => void;
  onOpenFile: (f: SpaceFileMeta) => void;
}) {
  const rentable = isRentable(fixture);
  const faces = facesOf(fixture);
  const double = isDoubleGondola(fixture) && rentable;
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const sedeDelMapa = useFixtureStore((s) => s.sede);
  // Una reserva viva se dice «Reservado», con su fecha (`conLaReserva`).
  const entry = conLaReserva(face === "B" && faces.length > 1 ? faces[1] : faces[0], estadoComercial, sedeDelMapa);
  // Por el código COMPLETO. Buscaba por el corto —`PUN-04` en vez de
  // `NAVE-PUN-04`— y `by-code` devolvía 404 siempre, así que "Archivos del
  // contrato" nunca mostró nada: los que se suben desde el plano quedaban
  // invisibles acá. El corto además se repite entre sedes.
  const { state, files } = useSpaceFiles(fullSpaceCode(fixture.sede, entry.code), rentable);
  const hasContract = rentable && entry.supplierName.trim().length > 0;
  const pedirEnfoque3D = useFixtureStore((s) => s.pedirEnfoque3D);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  /** La sede del PLANO: con ella se nombra la cara ante las participaciones. */
  const sedeDelPlano = useFixtureStore((s) => s.sede);
  /** La cara se vende por participación: no se negocia entera (se carga en
   *  Distribución) y lo que tiene lo dice `ParticipacionesDeLaCara`. */
  const pc = porParticipacion(fixture);
  /** La cara entera está libre pero tiene partes vendidas que corren: la
   *  pastilla dice «Vendido en parte». */
  const indiceDeLaFicha = useMemo(() => indiceDePartes(estadoComercial), [estadoComercial]);
  const partesQueCorren = useMemo(() => partesConContrato(fixture, estadoComercial, indiceDeLaFicha, sedeDelMapa, isAdmin)
    .some((p) => p.face === entry.face && ["active", "expiring", "committed"].includes(displayStatus(p))),
  [fixture, estadoComercial, indiceDeLaFicha, sedeDelMapa, isAdmin, entry.face]);
  const codigoDeLaCara = fullSpaceCode(fixture.sede || sedeDelMapa, entry.code);
  const reservaViva = isAdmin && entry.reservaHasta ? reservaDe?.(codigoDeLaCara) : undefined;
  const cobroDeLaCara = isAdmin && hasContract ? cobroDe?.(codigoDeLaCara) : undefined;
  /** La planometría pedida, si es de OTRO contrato que el de la cara (una
   *  parte o una participación): va arriba, aparte. */
  const pedidaAparte = planometriaPedida && planometriaPedida.codigo.toUpperCase() !== codigoDeLaCara.toUpperCase()
    ? planometriaPedida : null;
  const pedidaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (planometriaPedida) pedidaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [planometriaPedida, entry.code]);

  return (
    <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* El encabezado de la ficha (dibujo aprobado, paso 3): la flecha que
          vuelve a «Para revisar», el código como se lee, el nombre y la sede,
          y el estado en pastilla. */}
      <div className="ficha-cab">
        <button type="button" className="icobtn" onClick={onBack} title="Volver" aria-label="Volver a «Para revisar»">
          <ArrowLeft {...ICONO_TARJETA} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="mono" data-ficha-titulo tabIndex={-1}>{codigoVisible(entry)}</h3>
          <div className="sub">
            {conNombrePropio(fixture, nombresPropios, fixture.label || fixture.code)} · {fixture.sede}
          </div>
        </div>
        <StatusPill fixture={fixture} face={entry} enParte={partesQueCorren} />
      </div>

      {double && (
        <div style={{ padding: "10px 14px 0" }}>
          <div className="seg ancho" role="group" aria-label="Qué cara">
            {(["A", "B"] as const).map((id) => {
              const other = faces[id === "A" ? 0 : 1];
              return (
                <button key={id} type="button" aria-pressed={face === id} onClick={() => onFace(id)}>
                  {/* The supplier on the tab saves a click just to find out
                      whether the other face holds anything. */}
                  Cara {id}{other?.supplierName ? ` · ${other.supplierName}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 13, overflowY: "auto" }}>
        {/* «Cargar planometría» de «Para revisar»: la del contrato que la
            espera, arriba y a la vista. */}
        {isAdmin && pedidaAparte && (
          <div ref={pedidaRef} className="pedida" data-planometria-pedida>
            <span className="rotulo">Planometría de <span className="mono">{pedidaAparte.rotulo}</span></span>
            <Planometria
              key={`${pedidaAparte.codigo}|${pedidaAparte.leaseId}`}
              spaceCode={pedidaAparte.codigo}
              leaseId={pedidaAparte.leaseId}
              isAdmin={isAdmin}
              onCargada={onPlanometriaCargada}
            />
          </div>
        )}

        {/* Las participaciones de esta cara (dibujo aprobado, paso 3): la barra
            de lo comprometido, una fila por marca con su % y su cobro y su
            montaje, y Distribuir · Renovar · Vender lo que queda. Sólo para
            quien administra: lleva proveedores, marcas y fechas de todos, y su
            ruta es de administración (§4.8, §11). */}
        {isAdmin && pc && (
          <ParticipacionesDeLaCara
            fixtureId={fixture.id}
            codigo={fixture.code}
            cara={entry.face}
            sede={sedeDelPlano}
            doble={double}
            onRenovar={onRenovarParte
              ? (n) => {
                const parte = partirCodigo(`X-PC${n}`).parte;
                onRenovarParte({ ...entry, code: codigoDeParte(fixture.code, entry.face, parte), parte });
              }
              : undefined}
            /* La plata la escribe Supervisar: el componente también lo carga
               el plano 2D, que no tiene por qué traer estas cuentas. */
            precioDe={(t) => `${formatCOP(enLaUnidad(t.valor_mensual, t.desde, t.hasta, unidad))} ${unidad === "mes" ? "al mes" : "en total"}`}
            montajeDe={montajeDelCodigo}
            cobroDe={cobroDe
              ? (c) => {
                const x = cobroDe(c);
                return x ? { texto: textoDelCobro(x.porcentaje), proximo_corte: x.proximo_corte } : undefined;
              }
              : undefined}
            onVender={onVenderLoQueQueda}
            onEditar={onEditarParticipacion ? (t) => onEditarParticipacion(t) : undefined}
          />
        )}

        {/* Las acciones de la cara, en un renglón (hoja de piezas): Renovar
            —el mismo acuerdo otra vez, mismo proveedor, marca y valor,
            arrancando el día después de que termina el que corre; aparece
            cuando el contrato se cae dentro de 60 días o ya se cayó—, vender
            otra vez o a otro proveedor, y ver la exhibición en 3D. */}
        <div className="acc">
        {rentable && onRenovar && (
          <button type="button" className="btn-s" onClick={onRenovar}>
            <Repeat {...ICONO_TARJETA} />
            Renovar {entry.supplierName ? `con ${entry.supplierName}` : "este contrato"}
          </button>
        )}
        {/* «Editar contrato» (2026-10-22): reabre ESTE contrato en Vender, con
            todo lo guardado; al guardar se reenvía a los correos. Sólo quien
            administra, y sólo con un contrato de verdad (no una reserva). */}
        {isAdmin && rentable && onEditar && hasContract && !entry.reservaHasta && typeof entry.leaseId === "number" && (
          <button type="button" className="btn-s" onClick={() => onEditar(entry)} data-editar-contrato={entry.leaseId}
            title="Abre Vender con este contrato cargado; al guardar se reenvía a los correos">
            <FilePenLine {...ICONO_TARJETA} />
            Editar contrato
          </button>
        )}
        {/* El contrato que arranca DESPUÉS del vigente (la fila dibuja el
            vigente): sin esto no había cómo editarlo. */}
        {isAdmin && rentable && onEditarProximo && hasContract && !entry.reservaHasta
          && typeof entry.leaseId === "number" && typeof entry.proximoLeaseId === "number" && (
          <button type="button" className="btn-s" onClick={() => onEditarProximo(entry, entry.proximoLeaseId!)}
            data-editar-contrato={entry.proximoLeaseId} data-editar-proximo
            title="Abre Vender con el contrato que arranca después del vigente; al guardar se reenvía a los correos">
            <FilePenLine {...ICONO_TARJETA} />
            Editar el próximo contrato
          </button>
        )}
        {rentable && onNegociar && !pc && (
          <button type="button" className="btn-s" onClick={onNegociar}>
            <FilePenLine {...ICONO_TARJETA} />
            {/* Con «Renovar» al lado, éste es el otro camino: cambiar de
                proveedor. Decirlo así ahorra tener que deducirlo. */}
            {onRenovar ? "Contrato con otro proveedor"
              : hasContract ? "Nuevo contrato para esta cara"
              : "Negociar este espacio"}
          </button>
        )}

        {/* Ver la exhibición como la va a ver el proveedor. El 3D es la única
            pantalla que muestra el arte puesto sobre el mueble. */}
        {rentable && (
          <button type="button" className="btn-s" onClick={() => pedirEnfoque3D(fixture.id, face)}>
            <Box {...ICONO_TARJETA} />
            Ver la exhibición en 3D
          </button>
        )}
        </div>
        {isAdmin && avisoDeEdicion && (
          <p role="alert" className="aviso-edicion" style={{ margin: 0, fontSize: "var(--t-xs)", color: "var(--ocupado-txt)", lineHeight: 1.45 }}>
            {avisoDeEdicion}
          </p>
        )}
        {!hasContract && pc ? (
          !isAdmin && <CaraPorParticipacion fixture={fixture} face={entry.face} />
        ) : !hasContract && entry.reservado ? (
          /* El trabajador: la base le dice sólo que la toma una reserva. */
          <div data-reservada style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)", lineHeight: 1.5 }}>
            Reservado: la toma una reserva, que todavía no es un contrato. No hay nada que montar.
          </div>
        ) : !hasContract ? (
          <NoContractState fixture={fixture} isAdmin={isAdmin} />
        ) : (
          <>
            <SupplierLine entry={entry} />
            {entry.reservaHasta && (
              <div style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)", lineHeight: 1.45 }}>
                Reservado hasta el {diaCorto(entry.reservaHasta)}: todavía no es un contrato.
                {reservaViva ? "" : " Se confirma o se cancela en «Reservas»."}
              </div>
            )}
            {/* La reserva se confirma o se cancela acá mismo, con el precio
                que se guardó al reservar. */}
            {isAdmin && reservaViva && onReservaCambio && (
              <FilaDeReserva r={reservaViva} sede={sedeDelMapa} onCambio={onReservaCambio} />
            )}
            {(entry.startDate || entry.endDate) && <PeriodBox entry={entry} />}
            {isAdmin && (entry.negotiatedValue > 0 || cobroDeLaCara) && (
              <div className="valor-ficha">
                <span className="rotulo">{cobroDeLaCara ? "Cobro" : ROTULO_DEL_VALOR[unidad]}</span>
                <span className="mono">
                  {cobroDeLaCara
                    ? `${textoDelCobro(cobroDeLaCara.porcentaje)}${cobroDeLaCara.proximo_corte ? ` · próximo corte ${fechaEnCurso(cobroDeLaCara.proximo_corte.periodo_hasta)}` : ""}`
                    : formatCOP(enLaUnidad(entry.negotiatedValue, entry.startDate, entry.endDate, unidad))}
                </span>
              </div>
            )}
            {!entry.reservaHasta && (
              <div className="fila-dist">
                <span className="rotulo">Montaje</span>
                <MontajeChip entry={entry} reporte={montajeDe?.(entry)} />
              </div>
            )}
            {entry.observation && (
              <div>
                <div style={{ fontSize: "var(--t-3xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 5 }}>
                  Observación
                </div>
                <div style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)", lineHeight: 1.55 }}>{entry.observation}</div>
              </div>
            )}
          </>
        )}

        {/* La línea de tiempo (etapa 3): los próximos 12 meses, desde cuándo
            queda disponible y lo que ya terminó, del historial de la base. */}
        {rentable && (
          <LineaDeTiempo codigo={fullSpaceCode(fixture.sede, entry.code)} esAdmin={isAdmin} />
        )}

        {/* Vender por partes: las puertas de esta cara, cada una con su
            contrato; o las bahías de impulso de una caja y el forro de una
            columna, que no se venden enteras. Sin partes no dibuja nada. */}
        {(rentable || seVendeAlgo(fixture) || piezasDeLaFamilia(fixture.type).length > 0) && (
          <PartesDeLaCara
            fixture={fixture}
            face={entry.face}
            isAdmin={isAdmin}
            onVender={onNegociarParte}
            onRenovar={onRenovarParte}
            onCancelado={onCancelado}
            onEditar={isAdmin ? onEditar : undefined}
            onEditarProximo={isAdmin ? onEditarProximo : undefined}
          />
        )}

        {/* Qué le prometimos armar al proveedor. Se resuelve por el código del
            espacio —el layout no guarda ids de contrato— y sólo aparece si hay
            algo que mostrar o algo a lo que adjuntarle. */}
        {rentable && hasContract && (
          <div ref={pedidaAparte ? undefined : pedidaRef} data-planometria-pedida={planometriaPedida && !pedidaAparte ? "" : undefined}>
            <Planometria
              key={`${entry.code}|${planometriaPedida && !pedidaAparte ? planometriaPedida.leaseId : ""}`}
              spaceCode={fullSpaceCode(fixture.sede, entry.code)}
              /* Llegando por «Cargar planometría», la del contrato que la
                 espera, aunque todavía no arranque. */
              leaseId={planometriaPedida && !pedidaAparte ? planometriaPedida.leaseId : null}
              isAdmin={isAdmin}
              onCargada={onPlanometriaCargada}
            />
          </div>
        )}

        {rentable && (state === "loading" || files.length > 0) && (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 7 }}>
              Archivos del contrato
            </div>
            {state === "loading" ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Cargando…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {files.map((f) => (
                  <FileRow key={f.id} file={f} onOpen={() => onOpenFile(f)} />
                ))}
              </div>
            )}
          </div>
        )}
        {rentable && state === "error" && (
          <div style={{ fontSize: 11.5, color: "var(--danger)" }}>No se pudo consultar el servidor.</div>
        )}

        {/* Soltar el espacio. Al final del panel y con confirmación: es
            destructivo, y hasta ahora no existía en ninguna pantalla pese a que
            el backend lo soporta —el mensaje de choque de fechas mandaba a
            «cancelalo primero» señalando algo que no se podía hacer.

            NO se pide `hasContract`, y es el arreglo: `hasContract` sale del
            JSON del layout, que es una copia. El caso que hay que poder
            resolver es justamente aquel en que la copia y la base no coinciden
            —la base tiene el contrato, el plano pinta el mueble libre—, y ahí
            `hasContract` es `false`: el botón desaparecía justo cuando hacía
            falta, y «cancelalo primero» volvía a señalar algo imposible.

            `CancelarContrato` le pregunta al servidor y se dibuja solo si hay
            un contrato de verdad que soltar, así que la condición correcta la
            tiene él, no esta pantalla. */}
        {isAdmin && rentable && onCancelado && (
          <CancelarContrato
            key={entry.code}
            spaceCode={fullSpaceCode(fixture.sede, entry.code)}
            segunElPlano={hasContract}
            onCancelado={onCancelado}
          />
        )}
      </div>
    </Card>
  );
}

/** Contratos que la planilla creó sobre espacios que NINGÚN plano dibuja.
 *
 *  El contrato QUEDÓ —lo escribió el servidor, es plata y es un compromiso con
 *  un proveedor— pero no hay mueble donde verlo. No es un desfase entre dos
 *  copias: desde que lo comercial vive sólo en la base, el mapa se pinta de ahí
 *  y siempre coincide. Es que ese espacio no está en el plano: se borró el
 *  mueble, se pasó la góndola de doble a simple y desapareció la cara B, o
 *  nunca se dibujó y el código de la planilla tiene un error de tipeo.
 *
 *  Se dice en vez de callarlo, y se dice qué hacer. Callarlo es lo que produce,
 *  meses después, «el espacio está libre y el sistema no me deja venderlo». */
function AvisoSinMueble({ espacios, onCerrar }: { espacios: string[]; onCerrar: () => void }) {
  const uno = espacios.length === 1;
  return (
    <div
      data-capa-modal
      role="alertdialog"
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(26,24,20,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div
        style={{
          width: "min(460px, 100%)", padding: 18,
          background: "var(--surface)", borderRadius: "var(--r-2xl)",
          border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 10 }}>
          <AlertTriangle size={17} style={{ color: "var(--warning, var(--ink-2))", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {uno ? "Un contrato quedó guardado" : `${espacios.length} contratos quedaron guardados`}
            {" "}sobre {uno ? "un espacio" : "espacios"} que el plano no dibuja
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 14 }}>
          <b>{espacios.join(" · ")}</b>
          <br /><br />
          {uno ? "El contrato existe y vale" : "Los contratos existen y valen"}, pero no hay
          mueble con ese código en el plano de esa tienda, así que no {uno ? "se va" : "se van"} a
          ver en el mapa — y el espacio va a rechazar cualquier venta nueva
          nombrando un contrato que la ficha no muestra.
          <br /><br />
          Revisá el código en la planilla, o dibujá el mueble en el plano de esa
          sede: en cuanto exista, el contrato aparece solo.
        </div>
        <button
          onClick={onCerrar}
          style={{
            width: "100%", height: 34, borderRadius: "var(--r-md)", border: "none",
            background: "var(--accent)", color: "#fff",
            fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

// ─── Atención (vencidos + por vencer + anomalías, one-line rows) ─────────────

interface ContractEntry extends FaceEntry {
  days: number;
}

/** El encabezado de un grupo de pendientes: qué son, y cuánto pesan.
 *
 *  El número de la derecha es la razón de ser del grupo. «Por vencer en 30
 *  días» sin cifra es una categoría; con «$3.700.000» al lado es una alarma
 *  con tamaño, y ése es el dato con el que se decide a quién llamar primero. */
function AtencionSection({
  label, monto,
}: {
  label: string;
  /** Lo que ese grupo vale: plata en los que vencen, cantidad en el resto. */
  monto?: React.ReactNode;
}) {
  return <EncabezadoDeSeccion titulo={label} valor={monto} />;
}

/**
 * Los contratos que viven SÓLO en el JSON del layout, y el botón que los pasa.
 *
 * Es la otra mitad del desfase, y la más silenciosa: estos contratos no están
 * en ninguna tabla, así que no salen en ningún reporte, no generan aviso de
 * vencimiento y no existen para nada que consulte la base. Es plata y es un
 * compromiso con un proveedor que el sistema no sabe que tiene.
 *
 * Salieron de un panel del plano 2D que tuvo campos de contrato editables y
 * escribía el JSON sin tocar la base. Se quitó justamente por esto, pero lo que
 * se cargó así sigue ahí.
 *
 * ── Dos cosas que hacen que esto no sea un botón peligroso ───────────────────
 *
 * **Se ve antes de escribir.** La lista de arriba es exactamente lo que se va a
 * crear, con proveedor, fechas y valor. El servidor la calcula sin tocar una
 * fila.
 *
 * **Lo que falta no se inventa.** Un contrato del plano sin proveedor o sin
 * fechas no puede ser una fila de `space_leases` —esas columnas son
 * obligatorias— así que se muestra aparte, con el motivo, para arreglarlo a
 * mano. Rellenarlo con algo plausible sería fabricar un contrato que nadie
 * firmó.
 */
function ImportarDelPlano({
  datos, importados, onAplicado,
}: {
  datos: Importacion;
  /** Cuántos se acaban de pasar en esta sesión, para confirmarlo. */
  importados: number;
  onAplicado: (r: Importacion) => void;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");
  const n = datos.importables.length;
  const residuos = datos.incompletos.filter((x) => x.residuo);
  const aMedias = datos.incompletos.filter((x) => !x.residuo);

  async function importar() {
    setError("");
    setAplicando(true);
    try {
      onAplicado(await aplicarImportacion());
    } catch (e) {
      setError(describeError(e, "No se pudo importar. Probá de nuevo."));
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div>
      <AtencionSection
        label="Contrato que sólo vive en el plano"
        monto={n + datos.incompletos.length}
      />
      {importados > 0 && (
        <p style={{
          fontSize: 11.5, color: "var(--success, var(--ink-2))", lineHeight: 1.5,
          padding: "2px 6px 8px", fontWeight: 600,
        }}>
          {importados} contrato{importados === 1 ? "" : "s"} pasado
          {importados === 1 ? "" : "s"} a la base. Ya se {importados === 1 ? "ve" : "ven"}
          {" "}en el mapa.
        </p>
      )}
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5, padding: "2px 6px 8px" }}>
        {n > 0
          ? "Están escritos en el plano pero no tienen fila en la base: no salen en " +
            "ningún reporte ni generan aviso de vencimiento. Pasarlos es de una sola vez."
          : datos.incompletos.length > 0
          ? "Ninguno de los que quedan se puede pasar automáticamente: hay que " +
            "completarlos a mano."
          : "No queda nada por pasar."}
      </p>

      {datos.importables.map((f) => (
        <div key={f.espacio} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "5px 6px",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.06em", padding: "2px 5px", borderRadius: 3,
            background: "var(--surface-2)", color: "var(--ink-2)", flexShrink: 0,
          }}>
            {f.sede}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {f.code}
          </span>
          <span style={{
            fontSize: 11.5, color: "var(--ink-2)", flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {f.proveedor}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", flexShrink: 0 }}>
            {fechaCorta(f.desde)} → {fechaCorta(f.hasta)}
          </span>
        </div>
      ))}

      {/* Dos cosas muy distintas, y por eso van separadas: un contrato a medias
          hay que COMPLETARLO, y un «Ocupado» puesto a mano no tiene nada que
          completar. Juntos, el consejo del primero manda a inventar contratos
          que no existen para el segundo. */}
      {aMedias.length > 0 && (
        <div style={{
          margin: "8px 6px 4px", padding: "9px 10px",
          borderRadius: "var(--r-lg)", background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
            letterSpacing: "0.09em", textTransform: "uppercase",
            color: "var(--ink-3)", margin: "0 0 6px",
          }}>
            {aMedias.length} contrato{aMedias.length === 1 ? "" : "s"} a medias
          </p>
          {aMedias.map((x) => (
            <div key={x.espacio} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {x.sede} · {x.code}
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-2)", flex: 1, minWidth: 0 }}>
                {x.motivo}
                {/* Lo que SÍ tiene: es con lo que se decide si vale la pena
                    reconstruirlo o si se descarta. */}
                {(x.proveedor || x.marca || x.valor > 0) && (
                  <span style={{ color: "var(--ink-3)" }}>
                    {" — tiene "}
                    {[x.proveedor, x.marca, x.valor > 0 ? money(x.valor) : ""]
                      .filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </div>
          ))}
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.45, margin: "6px 0 0" }}>
            Abrí ese espacio y cargá el contrato desde Vender, con los datos que falten.
          </p>
        </div>
      )}

      {residuos.length > 0 && (
        <div style={{
          margin: "8px 6px 4px", padding: "9px 10px",
          borderRadius: "var(--r-lg)", background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
            letterSpacing: "0.09em", textTransform: "uppercase",
            color: "var(--ink-3)", margin: "0 0 6px",
          }}>
            {residuos.length} marcado{residuos.length === 1 ? "" : "s"} «Ocupado» a mano
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, margin: "0 0 6px" }}>
            Sin proveedor, sin fechas y sin valor: <b>no hay ningún contrato detrás</b>.
            El plano tuvo un selector que dejaba marcar un mueble como ocupado a mano;
            se quitó, porque un espacio se ocupa vendiéndolo.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginBottom: 6 }}>
            {residuos.map((x) => (
              <span key={x.espacio} style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
              }}>
                {x.sede} · {x.code}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.45, margin: 0 }}>
            <b>No hay que hacer nada.</b> Se van solos la próxima vez que se guarde
            ese plano — el servidor ya no acepta ese campo. Para apurarlo, abrí el
            plano de esa sede y movés cualquier mueble.
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 11, color: "var(--danger)", padding: "4px 6px 0" }}>{error}</p>
      )}

      {n > 0 && (
        <button
          onClick={() => void importar()}
          disabled={aplicando}
          style={{
            width: "calc(100% - 12px)", margin: "8px 6px 0", height: 32,
            borderRadius: "var(--r-md)", border: "none",
            background: "var(--accent)", color: "#fff",
            fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
            cursor: aplicando ? "wait" : "pointer",
          }}
        >
          {aplicando
            ? "Importando…"
            : `Pasar ${n} contrato${n === 1 ? "" : "s"} a la base`}
        </button>
      )}
      {datos.ya_estaban > 0 && (
        <p style={{ fontSize: 10.5, color: "var(--ink-3)", padding: "6px 6px 0" }}>
          {datos.ya_estaban} ya {datos.ya_estaban === 1 ? "estaba" : "estaban"} en la base.
        </p>
      )}
    </div>
  );
}

/**
 * Un contrato vivo que NINGÚN plano puede mostrar.
 *
 * No es una fila como las otras y por eso no reusa `AtencionRow`: las demás
 * cuelgan de un mueble —tocarlas lo señala en el plano de al lado— y ésta,
 * justamente, no tiene mueble. Ése es el hallazgo.
 *
 * Por eso trae su propia salida en vez de mandar a mirar el mapa: o se dibuja
 * el mueble con ese código en el plano de esa sede —y el contrato aparece
 * solo—, o se cancela desde acá. `CancelarContrato` ya sabe nombrar lo que
 * encuentra cuando el plano no lo tiene: se construyó para este caso.
 */
function FantasmaRow({
  fila, isAdmin, abierto, onAbrir, onCancelado,
}: {
  fila: ContratoSinMueble;
  isAdmin: boolean;
  abierto: boolean;
  onAbrir: () => void;
  onCancelado: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 6px", borderRadius: "var(--r-md)", cursor: "pointer",
          background: abierto || hover ? "var(--surface-2)" : "transparent",
          transition: "background .12s",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.06em", padding: "2px 5px", borderRadius: 3,
            background: "var(--warning-50, var(--surface-2))",
            color: "var(--warning, var(--ink-2))", flexShrink: 0,
          }}
        >
          {fila.sede || "?"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {fila.code}
        </span>
        <span style={{
          fontSize: 11.5, color: "var(--ink-2)", flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {fila.supplierName || "sin proveedor"}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--ink-3)", flexShrink: 0 }}>
          {fila.endDate ? `hasta ${fechaCorta(fila.endDate)}` : "sin fecha"}
        </span>
      </div>
      {abierto && (
        <div style={{
          margin: "2px 6px 8px", padding: "9px 10px",
          borderRadius: "var(--r-lg)", background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}>
          <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5, margin: "0 0 8px" }}>
            El plano de <b>{fila.sede || "esa sede"}</b> no tiene ningún mueble con el
            código <b>{fila.code}</b>, así que este contrato no se ve en el mapa — y ese
            espacio va a rechazar cualquier venta nueva nombrándolo.
            <br /><br />
            Dibujá el mueble con ese código y el contrato aparece solo. Si el espacio ya
            no existe, cancelalo.
          </p>
          {isAdmin ? (
            <CancelarContrato
              spaceCode={fila.espacio}
              segunElPlano={false}
              onCancelado={onCancelado}
            />
          ) : (
            <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
              Pedile a un administrador que lo resuelva.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Una fila de «Para revisar»: días, código, quién, y cuándo.
 *
 *  Es un BOTÓN, no un renglón. Antes la lista y el plano eran dos paneles que
 *  no se hablaban: se leía «PUN-03 vence en 24 días» y para ver dónde quedaba
 *  ese espacio había que buscarlo a ojo entre 106 muebles. Ahora tocar la fila
 *  lo selecciona en el plano de al lado —y el plano, al seleccionarlo, lo
 *  rotula—. La lista dice QUÉ y el plano dice DÓNDE; sueltos no servían.
 *
 *  Los días van primero y en una plaquita: es por lo que se ordena la lista y
 *  lo único que decide si esto se mira hoy o la semana que viene. */
function AtencionRow({
  entry,
  chip,
  tono = "alarma",
  dates,
  selected,
  onSelect,
  onFoto,
  aviso,
  accion,
  acciones,
}: {
  entry: FaceEntry;
  chip: string;
  /** `alarma` = rojo (vence, vencido). `espera` = ámbar (falta poco).
   *  `sordo` = gris (esperando algo). */
  tono?: "alarma" | "espera" | "sordo";
  dates: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Abre la foto del montaje. Solo la traen las filas que tienen prueba. */
  onFoto?: () => void;
  /** La clave del aviso (`data-aviso`): la chincheta del plano lleva acá. */
  aviso?: string;
  /** La acción de la fila, si tiene una propia («Renovar»). */
  accion?: { texto: string; icono: React.ReactNode; onClick: () => void };
  /** Más de una («Liberar» y «Reservar de verdad» de «Marcado reservado a
   *  mano»), después de `accion`. */
  acciones?: { texto: string; icono: React.ReactNode; onClick: () => void; titulo?: string; ocupado?: boolean;
    /** «Editar contrato»: el `leaseId` que abre (para volver con el foco acá). */
    leaseId?: number }[];
}) {
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  return (
    <div
      data-fila-revisar
      data-aviso={aviso}
      className={"fila-r" + (selected ? " elegida" : "")}
    >
      <span className={`pill mono ${tono === "alarma" ? "ocupado" : tono === "espera" ? "entra" : "resto"}`}>{chip}</span>
      <button
        type="button"
        className="dat"
        onClick={onSelect}
        disabled={!onSelect}
        title={onSelect ? "Abrir la ficha del espacio" : undefined}
      >
        {/* «Se ajusta la columna, no la tipografía»: el código en mono, con
            `9ch` de mínimo, entra entero (`GON-60·A`). */}
        <b className="mono">{codigoVisible(entry)}</b>
        <span>
          {entry.supplierName || conNombrePropio(entry.fixture, nombresPropios, entry.fixture.label || entry.fixture.code)}
          {" · "}{dates}
        </span>
      </button>
      {(accion || onFoto || (acciones && acciones.length > 0)) && (
        <span className="acc-r">
          {accion && (
            <button type="button" className="btn-s" onClick={accion.onClick}>
              {accion.icono} {accion.texto}
            </button>
          )}
          {acciones?.map((a) => (
            <button key={a.texto} type="button" className="btn-s" onClick={a.onClick} title={a.titulo} disabled={a.ocupado}
              data-editar-contrato={a.leaseId}>
              {a.icono} {a.texto}
            </button>
          ))}
          {onFoto && (
            <button type="button" className="btn-s" onClick={onFoto} aria-label="Ver la foto del reporte">
              <Camera {...ICONO_TARJETA} /> Ver foto
            </button>
          )}
        </span>
      )}
      {onSelect && <ChevronRight {...ICONO_TARJETA} className="ir" />}
      {/* La mira, en lugar del chevron, mientras el renglón señala su mueble
          en el plano (`data-senalada`, lo pone `senalarFila`). */}
      <Mira />
    </div>
  );
}

/** Estado de montaje de una cara, en la tabla.
 *
 *  Solo dice algo cuando hay algo que decir: un espacio libre, uno vencido o
 *  uno cuyo contrato todavía no arrancó no están "sin montar" — no les toca
 *  todavía, y marcarlos llenaría la columna de ruido. */
function MontajeChip({
  entry, reporte,
}: {
  entry: FaceEntry;
  reporte: MountConfirmation | undefined;
}) {
  const fase = contractPhase(entry);
  const aplica = fase === "vigente" || fase === "pendiente";
  const nada = <span className="punto" style={{ "--c": "var(--ink-4)" } as React.CSSProperties}>—</span>;
  if (!aplica && !reporte) return nada;
  const estado = estadoMontaje(reporte);
  // Firmado pero sin arrancar y sin reporte: no le toca todavía.
  if (estado === "pendiente" && fase !== "vigente") return nada;
  // Punto y palabra (hoja de piezas): verde montado, rojo no se pudo, gris
  // lo que todavía nadie reportó.
  const pinta =
    estado === "montado" ? { c: "var(--libre)", t: "Montado" }
    : estado === "no_montado" ? { c: "var(--ocupado)", t: "No se pudo" }
    : { c: "var(--ink-4)", t: "Sin montar" };
  return (
    <span
      className="punto"
      style={{ "--c": pinta.c } as React.CSSProperties}
      title={
        reporte
          ? [reporte.reportado_por, reporte.motivo ? MOTIVO_LABEL[reporte.motivo as MountMotivo] : "",
             reporte.nota].filter(Boolean).join(" · ")
          : "El contrato ya arrancó y nadie reportó el montaje"
      }
    >
      {pinta.t}
    </span>
  );
}

// ─── Quién paga el canon ─────────────────────────────────────────────────────

/** Un proveedor y lo que pone, con la parte del canon que representa.
 *
 *  El panel se llamaba «Los que más pagan» y estaba ordenado por plata, con un
 *  1-2-3 al costado. Ese ranking contesta una pregunta de vanidad. La que
 *  importa es de quién depende la sede: por eso el porcentaje —«COCA COLA es
 *  el 23% del canon»— y el sello VENCE, que juntos dicen cuánta plata se
 *  levanta y se va si esa renovación no se cierra.
 *
 *  El número de contratos se fue de la fila: ocupaba lugar y no cambia
 *  ninguna decisión. Está en la tabla de abajo, que es donde se mira. */
function SupplierRow({
  name, revenue, pct, vence, barra,
}: {
  name: string;
  revenue: number;
  /** Qué parte del canon vigente pone este proveedor. */
  pct: number;
  /** Tiene al menos una cara que vence dentro de los 30 días. */
  vence: boolean;
  /** 0-100: el largo de su barra, contra el que más pone. */
  barra: number;
}) {
  return (
    <div className="qp">
      <span className="nombre" title={name}>
        {name}
        {vence && (
          <span className="pill ocupado chica" title="Tiene al menos un contrato que vence dentro de 30 días">vence</span>
        )}
      </span>
      <b className="mono">{formatCOP(revenue)}</b>
      <span className="pct mono">{pct} %</span>
      <div className="barrita"><span style={{ width: `${Math.max(0, Math.min(100, barra))}%` }} /></div>
    </div>
  );
}

// ─── Estado por espacio ──────────────────────────────────────────────────────

/** Cómo se dice cada estado en la tabla, y de qué color va el punto.
 *
 *  El punto es el MISMO color que el mueble en el plano de arriba: es lo que
 *  permite leer una fila y encontrarla en la sala sin volver a pensar. Nunca
 *  va solo —al lado está la palabra, y a la derecha los días—, así que la
 *  identidad del estado no depende del color en ningún momento. */
function pinDe(): Record<DisplayStatus, { punto: string; texto: string; palabra: string }> {
  return {
  free:        { punto: rangeTop().libre,   texto: "var(--libre-txt)",   palabra: "Libre" },
  active:      { punto: rangeTop().tomado,  texto: "var(--ink-2)",   palabra: "Activo" },
  expiring:    { punto: rangeTop().parcial, texto: "var(--ocupado-txt)", palabra: "Por vencer" },
  committed:   { punto: colorEstado().committed, texto: "var(--ink-2)", palabra: "Contratado" },
  expired:     { punto: rangeTop().tomado,  texto: "var(--ocupado-txt)", palabra: "Vencido" },
  no_contract: { punto: rangeTop().tomado,  texto: "var(--ocupado-txt)", palabra: "Sin contrato" },
  reserved:    { punto: colorEstado().reserved, texto: "var(--ink-2)", palabra: "Reservado" },
  maintenance: { punto: colorEstado().maintenance, texto: "var(--ink-3)", palabra: "Mantenim." },
  };
}

/** El punto y la palabra de una cara POR PARTICIPACIÓN que está libre por sí
 *  misma, con su ocupación anónima de hoy: «Por participación» (algo
 *  comprometido) o «Tomada» (sin lugar). La misma palabra para quien
 *  administra y para el trabajador, nunca con %. */
function pinDeParticipacion(dispo: "parcial" | "tomado"): { punto: string; texto: string; palabra: string } {
  return dispo === "tomado"
    ? { punto: rangeTop().tomado, texto: "var(--ocupado-txt)", palabra: palabraDeLaCara("tomado") }
    : { punto: rangeTop().parcial, texto: "var(--entra-txt)", palabra: palabraDeLaCara("parcial") };
}

/** El orden de la tabla: primero lo que pide acción.
 *
 *  Ordenar sólo por «días que faltan» ponía arriba lo vencido —que ya no se
 *  puede evitar— y enterraba lo que vence la semana que viene, que es lo único
 *  sobre lo que todavía se puede hacer algo. Van por grupo y adentro del grupo
 *  por urgencia; lo libre al final, alfabético, porque ahí no hay urgencia:
 *  hay inventario. */
function ordenDeFila(e: FaceEntry): [number, number, string] {
  const ds = displayStatus(e);
  const dias = e.endDate ? daysUntil(e.endDate) : 99999;
  const grupo =
    ds === "no_contract" ? 0
    : ds === "expired" ? 1
    : ds === "expiring" ? 2
    : ds === "free" ? 5
    : ds === "maintenance" ? 4
    : 3;
  return [grupo, dias, e.code];
}

/** Filtrar por texto: código, proveedor, marca, tipo o nombre viejo.
 *
 *  Sin caja y con una línea abajo: vacío —que es como está el 95% del tiempo—
 *  no ocupa. Y dice «filtrar», que es lo que hace, y no «buscar», que promete
 *  llevarte a otra pantalla.
 *
 *  Está dos veces en Supervisar —al borde del plano y en el encabezado de la
 *  tabla— y las dos escriben el MISMO filtro: la tabla queda a una pantalla de
 *  distancia del plano, y pedirle a alguien que suba a filtrar lo que está
 *  mirando abajo es esconderle el control. Dos campos con un solo valor no
 *  pueden decir cosas distintas. */
function FiltroTexto({ valor, onCambio, etiqueta, ancho = 118 }: {
  valor: string;
  onCambio: (v: string) => void;
  etiqueta: string;
  ancho?: number;
}) {
  return (
    <div style={{ position: "relative", width: ancho, flexShrink: 0 }}>
      <Search
        size={12}
        style={{
          position: "absolute", left: 1, top: "50%",
          transform: "translateY(-50%)", color: "var(--ink-4)", pointerEvents: "none",
        }}
      />
      <input
        type="text"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder="Filtrar"
        aria-label={etiqueta}
        style={{
          width: "100%", height: 24, padding: "0 20px 0 17px",
          borderRadius: 0, border: "none",
          borderBottom: "1px solid var(--line)",
          background: "transparent", color: "var(--ink-1)",
          fontSize: 12, fontFamily: "inherit", outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--ink-1)"; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--line)"; }}
      />
      {valor && (
        <button
          onClick={() => onCambio("")}
          title="Limpiar el filtro"
          style={{
            position: "absolute", right: 0, top: "50%",
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 99,
            background: "var(--surface-3)", border: "none",
            color: "var(--ink-2)", cursor: "pointer",
          }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

/** Cuánto mide el más largo de estos textos en esa letra. Un solo lienzo para
 *  todas las medidas: crear uno por llamada se nota en una tabla de doscientas
 *  filas. Sin documento (pruebas en node) contesta 0 y quien llama pone su
 *  piso. */
let lienzoDeMedir: CanvasRenderingContext2D | null = null;
function anchoDeTexto(textos: string[], fuente: string): number {
  if (typeof document === "undefined") return 0;
  lienzoDeMedir ??= document.createElement("canvas").getContext("2d");
  if (!lienzoDeMedir) return 0;
  lienzoDeMedir.font = fuente;
  let max = 0;
  for (const t of textos) if (t) max = Math.max(max, lienzoDeMedir.measureText(t).width);
  return max;
}

function SpacesTable({
  fixtures, isAdmin, query, filter, montajeDe, tarifaDe,
  selectedId, onSelect, sinMontar, titulo, sub, derecha, espaciosDe = commercialFacesOf,
  unidad = "mes", cobroDe, periodo, enParte, libres, pestanas, suma,
}: {
  /** Con esto, una fila al pie con la suma de la plata de las filas que se
   *  ven (sin las libres ni las reservas, que no se cobran): el rótulo dice
   *  qué se suma. Es la cuenta del «Canon del mes» del Inicio, fila por fila. */
  suma?: string;
  /** La unidad de la plata de la franja: la columna de valor dice «Valor al
   *  mes» o «Valor total» y cada fila la sigue (rediseño, PR 2). */
  unidad?: UnidadDePlata;
  /** El cobro por % de las ventas de esa fila, si se cobra así: dice «8 %
   *  ventas» en vez de un monto. */
  cobroDe?: (entry: FaceEntry) => CobroPorVentas | undefined;
  /** El periodo que se está mirando (ISO), para la tarifa de una cara libre
   *  en «Total». */
  periodo?: { desde: string; hasta: string };
  /** Las caras (`id-cara`) vendidas en parte: la pestaña de ese nombre y la
   *  pastilla. */
  enParte?: Set<string>;
  /** Las caras (`id-cara`) libres en el periodo: la pestaña «Libres». */
  libres?: Set<string>;
  /** Las pestañas de la tabla, entre el encabezado y las filas. */
  pestanas?: React.ReactNode;
  /** Las filas de un mueble: sus caras comerciales y, vendiendo por partes,
   *  sus partes vendidas (cada una con su contrato). */
  espaciosDe?: (f: UnifiedFixture) => FaceEntry[];
  /** El encabezado de la tarjeta. Lo dibuja la tabla porque mide lo mismo que
   *  sus columnas: el filtro y los chips terminan donde termina la última, y
   *  no flotan sobre el blanco de una pantalla ancha. */
  titulo: string;
  sub?: React.ReactNode;
  derecha?: React.ReactNode;
  fixtures: UnifiedFixture[];
  isAdmin: boolean;
  /** El último reporte de montaje de esa cara, si lo hay. */
  montajeDe: (entry: FaceEntry) => MountConfirmation | undefined;
  /** Driven by the page-level control bar — the table no longer owns a second
   *  search box and a second row of chips doing the same job as the map's. */
  query: string;
  filter: MapFilter;
  /** El mueble abierto en el plano: la fila se marca y el plano la rotula. */
  selectedId?: string | null;
  /** Abrir la ficha de esa cara (la flecha de cada fila). */
  onSelect?: (f: UnifiedFixture, face: "A" | "B") => void;
  /** Claves de las caras contratadas y sin reportar, para el filtro. */
  sinMontar?: Set<string>;
  /** La tarifa de referencia de esa cara. Sin esto la columna de plata queda
   *  vacía en las filas libres, que suelen ser la mayoría de la tabla, y no
   *  se puede contestar «¿cuánto pido por ésta?» sin salir a otra pantalla. */
  tarifaDe: (entry: FaceEntry) => number | null;
}) {
  // Las fichas propias del supermercado: con ellas `rateTypeOf` resuelve la
  // tarifa de un mueble colocado desde una (`cli:…`). Llegan después del
  // primer dibujo, así que van en las dependencias de lo que la pregunta.
  const fichasPropias = useFichasPropias();
  // Cómo le dicen acá a cada familia: la columna «Tipo» y la búsqueda.
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  // Las caras por participación dicen su estado con la ocupación anónima de
  // hoy (la sede del PLANO, como el servidor).
  const sedeDelPlano = useFixtureStore((s) => s.sede);
  const clienteDeLaTabla = useAuthStore((s) => s.cliente) ?? "";
  const ocupacionDeLaTabla = useOcupacionStore((s) => s.ocupacion[claveDeSede(clienteDeLaTabla, sedeDelPlano)]);
  // One row per rentable face — doubles expand to A + B, matching the KPIs.
  const rows = useMemo(
    () =>
      fixtures.flatMap(espaciosDe).sort((a, b) => {
        const [ga, da, ca] = ordenDeFila(a);
        const [gb, db, cb] = ordenDeFila(b);
        return ga - gb || da - db || ca.localeCompare(cb);
      }),
    [fixtures, espaciosDe],
  );

  // Text search AND status chip (same face-level matcher as the map's search).
  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return rows.filter(
      (e) => (!q || faceMatchesQuery(e, q, nombresPropios)) && faceMatchesFilter(e, filter, sinMontar, enParte, libres),
    );
  }, [rows, filter, query, sinMontar, enParte, libres, fichasPropias, nombresPropios]);

  /** La suma al pie (`suma`): lo mismo que muestra la columna de plata. */
  const sumaDeFilas = useMemo(() => {
    if (!suma) return null;
    let total = 0;
    for (const e of filtered) {
      if (displayStatus(e) === "free" || e.reservaHasta) continue;
      const c = cobroDe?.(e);
      total += c ? enLaUnidad(c.cobrado, c.desde, c.hasta, unidad) : enLaUnidad(e.negotiatedValue, e.startDate, e.endDate, unidad);
    }
    return total;
  }, [suma, filtered, cobroDe, unidad]);

  /* LOS ANCHOS, MEDIDOS.
     Proveedor no llevaba ancho y se quedaba con todo lo que sobraba: en una
     pantalla de 1920 eran mil píxeles para nombres de trescientos, y el estado
     quedaba a media pantalla del proveedor (captura del dueño, 2026-09-23).
     Ahora Tipo y Proveedor miden lo que mide su texto más largo —con un techo:
     el que se pasa se corta con «…» y el nombre entero queda al pasar por
     encima— y la tabla mide la suma de sus columnas. Lo que sobra de una
     pantalla ancha queda a la derecha, afuera de la tabla, y no entre el
     proveedor y su estado. */
  const [fuentes, setFuentes] = useState(0);
  useEffect(() => {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (f?.ready) void f.ready.then(() => setFuentes((n) => n + 1));
  }, []);
  const anchos = useMemo(() => {
    const familia = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
    const fuente = `400 12.5px ${familia || "sans-serif"}`;
    const tipos = rows.map((e) => tipoDelMueble(e.fixture, nombresPropios));
    const nombres = rows.map((e) => (displayStatus(e) === "free" && e.supplierName
      ? `último: ${e.supplierName}` : e.supplierName));
    // El ESTADO: la pastilla más larga («Por participación», «Vendido en
    // parte») con su relleno (9 + 9), su borde y el de la celda (8 + 8); con
    // una reserva, además «hasta 19 oct». En 100 px «Por participación» se
    // cortaba sin «…».
    const pastilla = `600 11.5px ${familia || "sans-serif"}`;
    const palabras = [VENDIDO_EN_PARTE, palabraDeLaCara("parcial"), palabraDeLaCara("tomado"),
      ...Object.values(pinDe()).map((x) => x.palabra)];
    const conReserva = rows.filter((e) => e.reservaHasta).map((e) => ` hasta ${diaCorto(e.reservaHasta!)}`);
    const estadoMinimo = anchoDeTexto(palabras, pastilla) + 20 + 18;
    const estado = Math.max(
      estadoMinimo,
      conReserva.length ? anchoDeTexto(["Reservado"], pastilla) + 20 + anchoDeTexto(conReserva, fuente) + 18 : 0,
    );
    // Desde y Hasta, cada una con lo suyo y con el año cuando no es el de hoy
    // («31 ene 2027»): en 88 px se cortaba en «31 ene 20…». Las fechas no
    // ceden nunca.
    const fechaDe = (isos: string[]) => anchoDeTexto(isos.filter(Boolean).map((iso) => fechaEnCurso(iso)), fuente) + 28;
    // El código de una PARTE es más largo que el de una cara, y en 104 px
    // las tres puertas de una nevera decían «NEV-01·P…» las tres (el recorrido
    // en el navegador, 2026-10-14): la columna se estira a lo que miden. Sin
    // partes vendidas no se mide nada y queda en 104, como siempre.
    const mono = typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--font-mono").trim() : "";
    const deLasPartes = rows.filter((e) => e.parte).map((e) => codigoVisible(e));
    // El punto de color (7 + 8 px), el relleno de la celda (8 + 8) y el
    // espaciado de la letra.
    const codigo = deLasPartes.length
      ? Math.round(Math.min(170, Math.max(104, anchoDeTexto(deLasPartes, `700 13px ${mono || "monospace"}`) * 1.03 + 34)))
      : 104;
    return {
      codigo,
      tipo: Math.round(Math.min(200, Math.max(110, anchoDeTexto(tipos, fuente) + 24))),
      proveedor: Math.round(Math.min(340, Math.max(150, anchoDeTexto(nombres, fuente) + 24))),
      estado: Math.round(Math.min(230, Math.max(100, estado))),
      estadoMinimo: Math.round(Math.min(180, Math.max(100, estadoMinimo))),
      desde: Math.round(Math.min(124, Math.max(88, fechaDe(rows.map((e) => e.startDate))))),
      hasta: Math.round(Math.min(124, Math.max(88, fechaDe(rows.map((e) => e.endDate))))),
    };
  // `fuentes` vuelve a medir cuando llega la tipografía de la página.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fuentes, fichasPropias, nombresPropios]);

  // Los anchos van en el `th` y no en el `td`: con `table-layout:fixed` el
  // navegador toma las medidas de la PRIMERA fila, que es la del encabezado.
  // Puestos en las celdas se ignoran en silencio y la tabla vuelve a repartir
  // el ancho a ojo — que es exactamente lo que hacía antes de esto.
  const pedidas: (ColumnaTabla & { etiqueta: string; derecha?: boolean })[] = [
    { etiqueta: "Código", ancho: anchos.codigo, minimo: anchos.codigo },
    // Tipo y Proveedor ceden primero (se cortan con «…» y dicen todo en su
    // `title`); el Estado, después, hasta lo que mide su pastilla más larga
    // («hasta 25 oct» de una reserva se corta con «…»). Las fechas, nunca.
    { etiqueta: "Tipo", ancho: anchos.tipo, minimo: Math.min(anchos.tipo, 88), cede: 2 },
    { etiqueta: "Proveedor", ancho: anchos.proveedor, minimo: Math.min(anchos.proveedor, 120), cede: 1 },
    { etiqueta: "Estado", ancho: anchos.estado, minimo: anchos.estadoMinimo, cede: 3 },
    { etiqueta: "Montaje", ancho: 96, minimo: 96 },
    { etiqueta: "Desde", ancho: anchos.desde, minimo: anchos.desde },
    { etiqueta: "Hasta", ancho: anchos.hasta, minimo: anchos.hasta },
    { etiqueta: "Días", ancho: 56, minimo: 56, derecha: true },
  ];
  // La plata en la unidad de la franja: «Valor al mes» o «Valor total».
  if (isAdmin) pedidas.push({ etiqueta: ROTULO_DEL_VALOR[unidad], ancho: 112, minimo: 112, derecha: true });
  // La flecha que abre la ficha.
  pedidas.push({ etiqueta: "", ancho: 30, minimo: 30 });

  /* LA TABLA LLENA SU CAJA: lo que sobra se reparte parejo entre las columnas
     y, si falta, ceden Proveedor y Tipo (ver `utils/anchosTabla.ts`). La caja
     se mide: es la columna de la hoja, que cambia con la ventana. */
  const cajaRef = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(0);
  useLayoutEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    const medir = () => setDisponible(Math.max(0, el.clientWidth - 30));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const repartidos = repartirAnchos(pedidas, disponible);
  const columnas = pedidas.map((c, i) => ({ ...c, ancho: Math.floor(repartidos[i]) }));
  const anchoDatos = columnas.reduce((t, c) => t + c.ancho, 0);

  const vacio = <span style={{ color: "var(--ink-vacio)" }}>—</span>;

  return (
    <>
    <CardHeader icon={<Table2 {...ICONO_TARJETA} />} title={titulo} sub={sub} right={derecha} />
    {pestanas && <div style={{ padding: "0 15px 8px", minWidth: 0 }}>{pestanas}</div>}
    {/* Rueda adentro de su tarjeta, con los títulos de las columnas fijos
        arriba: la tarjeta mide lo mismo que la de al lado, como en Vender. */}
    <div ref={cajaRef} style={{ padding: "0 15px 12px", overflow: "auto", flex: 1, minHeight: 0 }}>
      <table
        style={{
          width: anchoDatos, minWidth: anchoDatos,
          borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th
                key={i}
                style={{
                  width: c.ancho,
                  padding: "0 8px 5px",
                  textAlign: c.derecha ? "right" : "left",
                  fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
                  color: "var(--ink-3)",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  borderBottom: "1px solid var(--line-strong)",
                  whiteSpace: "nowrap",
                  position: "sticky", top: 0, zIndex: 1, background: "var(--surface)",
                }}
              >
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={columnas.length} style={{ padding: "14px 8px", fontSize: 12, color: "var(--ink-3)" }}>
                {query.trim()
                  ? <>Sin resultados para «{query.trim()}»</>
                  : "Sin espacios con este estado."}
              </td>
            </tr>
          )}
          {filtered.map((entry) => {
            const ds = displayStatus(entry);
            const libre = ds === "free";
            const par = !entry.parte && libre
              ? participacionDeLaCara(ocupacionDeLaTabla, entry.fixture, entry.face, sedeDelPlano) : undefined;
            const pcHoy = par ? dispoDeParticipacion(entry.fixture, par, par.hoy, par.hoy) : null;
            const pin = pcHoy && pcHoy.dispo !== "libre" ? pinDeParticipacion(pcHoy.dispo) : pinDe()[ds];
            const days = entry.endDate && !libre ? daysUntil(entry.endDate) : null;
            const sel = selectedId === entry.fixture.id;
            // Una cara entera libre con partes vendidas: «Vendido en parte».
            const enParteLaCara = !entry.parte && libre && !(pcHoy && pcHoy.dispo !== "libre")
              && !!enParte?.has(`${entry.fixture.id}-${entry.face}`);
            const claseDelEstado = pcHoy && pcHoy.dispo !== "libre"
              ? (pcHoy.dispo === "tomado" ? "ocupado" : "entra")
              : enParteLaCara ? "entra" : PASTILLA_DE_ESTADO[ds];
            const cobro = !libre ? cobroDe?.(entry) : undefined;

            const celda: React.CSSProperties = {
              padding: "0 8px", height: 28,
              borderBottom: "1px solid var(--line-soft)",
              fontSize: 12.5, color: libre ? "var(--ink-3)" : "var(--ink-2)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              background: sel ? "var(--surface-2)" : undefined,
            };

            return (
              <tr
                key={claveDeFila(entry)}
                onClick={onSelect ? () => onSelect(entry.fixture, entry.face) : undefined}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  if (sel) return;
                  e.currentTarget.querySelectorAll("td").forEach((td) => {
                    (td as HTMLElement).style.background = "var(--surface-2)";
                  });
                }}
                onMouseLeave={(e) => {
                  if (sel) return;
                  e.currentTarget.querySelectorAll("td").forEach((td) => {
                    (td as HTMLElement).style.background = "";
                  });
                }}
              >
                <td
                  style={{
                    ...celda,
                    fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
                    letterSpacing: "0.02em", color: "var(--ink-1)",
                    boxShadow: sel ? "inset 2px 0 0 var(--ink-1)" : undefined,
                  }}
                >
                  {codigoVisible(entry)}
                </td>
                {/* El TIPO, no el nombre propio del mueble. La maqueta dice
                    «Punta de góndola» y no «Punta 3 del pasillo 5»: el nombre
                    propio ya está en la columna del código, y repetirlo acá
                    dejaba la columna sin contestar de qué clase de espacio se
                    trata —que es lo que se compara entre filas—. El nombre
                    completo queda al pasar por encima. */}
                <td style={celda} title={conNombrePropio(entry.fixture, nombresPropios, entry.fixture.label) || undefined}>
                  {tipoDelMueble(entry.fixture, nombresPropios)}
                  {/* Vender por partes: «· Puerta 2 de 3». */}
                  {entry.parte ? ` · ${textoDeParte(entry.parte, cantidadDe(entry.fixture, entry.parte.clase))}` : ""}
                </td>
                <td style={{ ...celda, color: libre ? "var(--ink-3)" : "var(--ink-1)" }}
                    title={entry.supplierName || undefined}>
                  {entry.supplierName
                    ? libre
                      ? <span style={{ color: "var(--ink-4)" }}>último: {entry.supplierName}</span>
                      : entry.supplierName
                    : vacio}
                </td>
                <td style={celda} title={entry.reservaHasta ? `Reservado hasta ${diaCorto(entry.reservaHasta)}` : undefined}>
                  {/* El estado en pastilla (rediseño, PR 2): la palabra adentro. */}
                  <span className={`pill ${claseDelEstado}`} title={enParteLaCara ? VENDIDO_EN_PARTE : pin.palabra}>
                    {enParteLaCara ? VENDIDO_EN_PARTE : pin.palabra}
                  </span>
                  {entry.reservaHasta && (
                    <span style={{ color: "var(--ink-3)" }}> hasta {diaCorto(entry.reservaHasta)}</span>
                  )}
                </td>
                <td style={celda}>
                  <MontajeChip entry={entry} reporte={montajeDe(entry)} />
                </td>
                {/* El período. La tabla ya ordenaba por fecha de fin y contaba
                    los días, pero no decía DESDE ni HASTA cuándo — y eso es lo
                    que se necesita para renovar o para reclamar. */}
                {([entry.startDate, entry.endDate] as const).map((iso, i) => (
                  <td key={i} style={celda}>
                    {iso && !libre ? fechaEnCurso(iso) : vacio}
                  </td>
                ))}
                <td
                  style={{
                    ...celda, textAlign: "right", fontWeight: 700,
                    color: days === null ? "var(--ink-vacio)"
                      : days < 0 ? "var(--ocupado)"
                      : days <= 30 ? "var(--ocupado)"
                      : "var(--ink-2)",
                  }}
                >
                  {days === null ? vacio : (
                    <>{days}<i style={{ fontStyle: "normal", fontSize: 10, fontWeight: 600, color: "var(--ink-3)" }}>d</i></>
                  )}
                </td>
                {isAdmin && (
                  <td style={{ ...celda, textAlign: "right", fontWeight: 700, color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                    {/* En una cara libre esto no es lo que se cobra sino lo que
                        se pediría: va en gris y sin negrita, para que no se
                        sume con la vista a lo que sí está entrando. Una reserva
                        tampoco cuenta: va en gris. La unidad es la de la
                        franja; un contrato por ventas dice su porcentaje. */}
                    {libre
                      ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                          {(() => {
                            const t = tarifaDe(entry);
                            return t ? formatCOP(periodo ? tarifaEnLaUnidad(t, periodo.desde, periodo.hasta, unidad) : t) : "—";
                          })()}
                        </span>
                      : cobro ? textoCortoDelCobro(cobro.porcentaje)
                      : entry.negotiatedValue > 0
                      ? (entry.reservaHasta
                        ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }} title="Una reserva no cuenta en el canon">
                            {formatCOP(enLaUnidad(entry.negotiatedValue, entry.startDate, entry.endDate, unidad))}
                          </span>
                        : formatCOP(enLaUnidad(entry.negotiatedValue, entry.startDate, entry.endDate, unidad)))
                      : vacio}
                  </td>
                )}
                <td style={{ ...celda, textAlign: "right", color: "var(--ink-3)" }}>
                  <ChevronRight {...ICONO_TARJETA} style={{ verticalAlign: -3 }} />
                </td>
              </tr>
            );
          })}
        </tbody>
        {isAdmin && sumaDeFilas !== null && filtered.length > 0 && (
          <tfoot data-suma-tabla>
            <tr>
              <td colSpan={columnas.length - 2} style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "var(--ink-1)", borderTop: "2px solid var(--ink-1)" }}>
                {suma}
              </td>
              <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--ink-1)", borderTop: "2px solid var(--ink-1)" }}>
                {formatCOP(sumaDeFilas)}
              </td>
              <td style={{ borderTop: "2px solid var(--ink-1)" }} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  );
}

/* LAS PASTILLAS DE CÓDIGO (`ChipEspacio`) Y LOS ESTILOS DE LA TARIFA SE FUERON.
   Las pastillas colgaban de cada fila de la tarifa —«Isla · 3 · $1.200.000» y
   debajo `ISL-04 ISL-05 ISL-06`— y contestaban «cuáles son». En la hoja de D la
   contesta el propio plano: los veintitrés espacios llevan su código escrito
   encima del mueble, y pasar el mouse por la fila de la tarifa APAGA la sala y
   deja encendidos los de ese tipo. Es la misma respuesta, en el lugar donde
   además se toca, y sin repetir veintitrés códigos que ya están dibujados
   —«si dos elementos dicen el mismo dato, uno sobra»—.

   Con ellas se fue el panel «Qué está libre», que era esas mismas pastillas
   mudadas de columna para tapar un desnivel entre dos columnas de alto
   distinto. La rejilla de D no tiene desnivel: los cuatro paneles alinean fila
   con fila.

   `celdaTarifa` y `pieTarifa` eran estilos en línea de la tabla; ahora la tabla
   la viste `vender.css`, que es donde el pie puede declarar que no envuelve y
   las columnas su ancho. */


// ─── La franja de cifras ─────────────────────────────────────────────────────

/** Una cifra de la franja: cómo se llama, cuánto es, y qué quiere decir.
 *
 *  El rótulo va arriba y en versalita, el número abajo y grande. Al revés
 *  —número primero— la fila se lee como una hilera de importes sin nombre y
 *  hay que volver a subir para saber de qué es cada uno.
 *
 *  `tasa` es el segundo renglón de «Sin alquilar»: lo que se evapora mientras
 *  la cara sigue vacía. No dice «perdido» a propósito — con el periodo por
 *  delante todavía no se perdió nada, y llamarle pérdida a lo que aún se puede
 *  vender es la clase de exageración que hace que después nadie crea el resto
 *  de los números. */
function Cifra({
  icono, rotulo, valor, notas, tasa, alarma, barra,
}: {
  /** El ícono de la cifra (`<X {...ICONO_TARJETA} />`), chico y en gris al
   *  lado del rótulo; rojo sólo si la cifra es una alarma (hoja de piezas). */
  icono: React.ReactNode;
  rotulo: string;
  valor: string;
  notas: string[];
  tasa?: string;
  /** Rojo: es plata que se puede caer. */
  alarma?: boolean;
  /** 0-100. Dibuja la barrita bajo el número. */
  barra?: number;
}) {
  const cero = valor === "0" || valor === "—" || valor === "0 %";
  // Una caja por cifra (rediseño, PR 2): el ícono y el rótulo arriba, la cifra
  // en mono, las notas abajo. Las cajas se acomodan en `.cifras`.
  return (
    <div className={"cifra" + (alarma ? " alarma" : "")}>
      <span className="cab">
        <span aria-hidden style={{
          display: "inline-flex", flexShrink: 0,
          color: alarma ? "var(--ocupado-txt)" : "var(--ink-3)",
        }}>
          {icono}
        </span>
        <span className="rotulo">{rotulo}</span>
      </span>
      <b className={"v" + (cero ? " cero" : "")}>{valor}</b>
      {notas.map((n) => <i key={n}>{n}</i>)}
      {tasa && <i className="tasa">{tasa}</i>}
      {barra !== undefined && (
        <div className="barrita">
          <span style={{ width: `${Math.max(0, Math.min(100, barra))}%` }} />
        </div>
      )}
    </div>
  );
}

/** La lectura del cursor de la escalera, en el encabezado del panel 02.
 *
 *  Es un componente con su propio estado y una función registrada por `ref`:
 *  `Libera` la llama en cada movimiento del cursor y sólo se vuelve a pintar
 *  este renglón. Con la lectura como estado de la pantalla, arrastrar el mouse
 *  por la escalera repintaría el plano entero treinta veces por segundo.
 *
 *  «el 26 de sep», con un espacio normal: la caja de ancho fijo la lleva SÓLO
 *  la cifra —tabular, para que no baile al mover el cursor— y las palabras van
 *  en la familia de texto. Entera en mono se leía «el 26  de  sep». */
function Lectura({
  registrar,
}: {
  registrar: React.MutableRefObject<((dia: string, n: number) => void) | null>;
}) {
  const [v, setV] = useState<{ dia: string; n: number } | null>(null);
  useEffect(() => {
    registrar.current = (dia, n) => setV((x) => (x && x.dia === dia && x.n === n ? x : { dia, n }));
    return () => { registrar.current = null; };
  }, [registrar]);
  if (!v) return null;
  const [cifra, ...mes] = v.dia.split(" ");
  return (
    <p className="lectura">
      si arrancás el <b><span className="dig">{cifra}</span> de {mes.join(" ")}</b>
      {" → "}<b className="n dig">{v.n}</b> libres
    </p>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard({
  sede, isAdmin, onDisenarPlano,
}: {
  sede: string; isAdmin: boolean; onDisenarPlano: () => void;
}) {
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "flex-start", justifyContent: "center",
        padding: "40px 44px", textAlign: "left",
      }}
    >
      {/* Tenía un cuadrado de 88px con un ícono de edificio adentro. El catálogo
          de tells lo nombra tal cual —«estado vacío: ícono centrado en una caja»—
          y tiene razón en por qué: el ícono no enseña nada. Lo que le falta a
          quien llega acá es saber qué hacer, y eso lo dicen las palabras. */}
      <p
        style={{
          fontSize: 16, fontWeight: 600,
          color: "var(--ink-1)", marginBottom: 6,
        }}
      >
        Todavía no hay muebles en{" "}
        <span style={{ fontFamily: "var(--font-mono)" }}>{sede}</span>
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 360, marginBottom: 18 }}>
        {isAdmin
          ? "Dibujá la tienda en «Plano de la sede». Con el plano cargado aparece el mapa de la sede, qué está libre y cuánto entra por cada espacio."
          : "Todavía no hay un plano cargado para esta sede. Pedile a un administrador que lo diseñe."}
      </p>
      {isAdmin && (
        <button
          onClick={onDisenarPlano}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 16px",
            borderRadius: "var(--r-md)",
            background: "var(--accent)", color: "#fff",
            border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 500, fontFamily: "inherit",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Plus size={14} /> Diseñar plano
        </button>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

/** Qué muestra la pantalla comercial. Con el armazón de módulos (rediseño UX
 *  2026-10, etapa 2) el modo lo decide la dirección —`/contratos` es Vender,
 *  `/indicadores` es Supervisar— y no las pestañas de la barra de la sede, que
 *  se fueron; los cambios de modo de adentro (Renovar desde Supervisar, volver
 *  de una edición…) navegan con `onModo`. */
export type ModoComercial = "vender" | "supervisar";

export default function DashboardView({ onDisenarPlano, modo: modoPedido, onModo, inicio = false, onIrAMontajes, onIrAlInicio }: {
  onDisenarPlano: () => void;
  /** «Ver montajes» del Inicio: el módulo Montajes. */
  onIrAMontajes?: () => void;
  /** «Volver al Inicio» desde una lista a la que se llegó tocando una cifra. */
  onIrAlInicio?: () => void;
  /** El Inicio del armazón (etapa 3): la misma pantalla en Supervisar, que
   *  dibuja lo de hoy en vez del tablero entero. */
  inicio?: boolean;
  /** El modo que manda el armazón. Sin él, la pantalla lleva el suyo. */
  modo?: ModoComercial;
  onModo?: (m: ModoComercial) => void;
}) {
  // Las fichas propias del supermercado: con ellas `rateTypeOf` resuelve la
  // tarifa de un mueble colocado desde una (`cli:…`). Llegan después del
  // primer dibujo, así que van en las dependencias de lo que la pregunta.
  const fichasPropias = useFichasPropias();
  // El plano isométrico pinta con hex de verdad y no con `var(--x)` —`darken()`
  // le hace la cuenta a cada cara del prisma—, así que las ternas se eligen al
  // pintar con `temaActual()`. Esta suscripción es lo que hace que el plano se
  // vuelva a pintar cuando alguien toca el sol/luna de la barra: sin ella el
  // CSS cambiaría de tema y el plano se quedaría con los colores del otro.
  useTema();

  const fixtures = useFixtureStore(selectFixtures);
  const { sedes, sede, fixturesBySede, seasonWindows } = useFixtureStore();
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const refrescarComercial = useFixtureStore((s) => s.refrescarComercial);
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  /** Cómo le dicen acá a cada familia (`catalogo/nombresPropios.ts`): lo usan
   *  la búsqueda, la tarifa de referencia y «Cuándo se libera». */
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  /** La auditoría de desfase, calculada en la pantalla.
   *
   *  Existe `backend/scripts/auditar_desfase.py`, que hace esto contra la base
   *  — pero necesita una consola en el servidor, que es un plan pago. Y acá no
   *  hace falta: el store ya bajó TODOS los planos y el mapa comercial entero,
   *  porque los necesita para pintar. La auditoría es una resta entre dos cosas
   *  que ya están en memoria, sin consola y sin credenciales.
   *
   *  Además deja de ser una corrida que alguien tiene que acordarse de hacer:
   *  se ve sola, al lado de lo demás que hay que revisar. */
  const fantasmas = useMemo(
    () => contratosSinMueble(fixturesBySede, estadoComercial, normalizeSede),
    [fixturesBySede, estadoComercial],
  );
  /** Espacios con contrato que NINGÚN plano dibuja, después de una planilla.
   *  Se muestran: el contrato existe y vale, pero no hay mueble donde verlo, y
   *  un fantasma que nadie nombra es el que aparece meses después al vender
   *  como «está libre y no me deja venderlo». */
  const [sinMueble, setSinMueble] = useState<string[] | null>(null);
  /** Qué fantasma está desplegado, por código completo. Uno a la vez: cada uno
   *  abre su propio `CancelarContrato`, que consulta la base al montarse. */
  const [fantasmaAbierto, setFantasmaAbierto] = useState<string | null>(null);

  const isAdmin = useAuthStore(selectIsAdmin);

  /** Las participaciones de cara: la ocupación ANÓNIMA de la sede (intervalos
   *  `{desde, hasta, pb}`, sin nombres, montos ni números), del store de
   *  LECTURA. La leen Vender (una cara por participación nunca aparece libre
   *  si no le queda lugar), Supervisar y «Cuándo se libera». Se pide sólo si
   *  la sede tiene alguna cara por participación, una vez por sede, y otra vez
   *  cuando el mapa de la base cambia (un contrato entra o se cancela). */
  const clienteActual = useAuthStore((s) => s.cliente) ?? "";
  const ocupacionDeSede = useOcupacionStore((s) => s.ocupacion[claveDeSede(clienteActual, sede)]);
  const cargarOcupacion = useOcupacionStore((s) => s.cargarOcupacion);
  const recargarOcupacion = useOcupacionStore((s) => s.recargarOcupacion);
  const invalidarResumen = useOcupacionStore((s) => s.invalidarResumen);
  const hayParticipaciones = useMemo(() => fixtures.some((f) => porParticipacion(f)), [fixtures]);
  useEffect(() => {
    if (hayParticipaciones) void cargarOcupacion(sede);
  }, [hayParticipaciones, sede, cargarOcupacion]);
  const estadoVisto = useRef(estadoComercial);
  useEffect(() => {
    if (estadoVisto.current === estadoComercial) return;
    estadoVisto.current = estadoComercial;
    if (!hayParticipaciones) return;
    void recargarOcupacion(sede);
    invalidarResumen(sede);
  }, [estadoComercial, hayParticipaciones, sede, recargarOcupacion, invalidarResumen]);
  /** La ocupación de UNA cara por participación (o `undefined`: todo como antes). */
  const participacionDe = useCallback(
    (f: UnifiedFixture, cara: "A" | "B") => participacionDeLaCara(ocupacionDeSede, f, cara, sede),
    [ocupacionDeSede, sede],
  );
  /** «Para revisar» de las participaciones: sólo para quien administra, y sólo
   *  si la sede vende alguna cara así (si no, no se pide nada). */
  const revisionPc = useRevisionDeParticipaciones({ sede, activo: isAdmin && hayParticipaciones, muebles: fixtures });
  const abrirEnDistribucion = useAbrirEnDistribucion("supervisar");

  /** La OTRA mitad del desfase: contratos que viven sólo en el JSON del layout.
   *
   *  Ésta no se puede calcular acá. La fusión del store reemplaza lo comercial
   *  con lo que dice la base, así que un contrato que sólo está en el JSON
   *  desaparece antes de que esta pantalla lo mire — hay que preguntárselo al
   *  servidor, que es el único que ve el snapshot crudo.
   *
   *  Se pide UNA vez por sesión y sólo para un admin. Es una migración de una
   *  sola vez: desde el corte el layout no puede guardar un contrato nuevo, así
   *  que en cuanto se importe lo que había, esto contesta vacío para siempre. */
  const [importacion, setImportacion] = useState<Importacion | null>(null);
  useEffect(() => {
    if (!isAdmin) { setImportacion(null); return; }
    let vivo = true;
    revisarImportacion()
      .then((r) => { if (vivo) setImportacion(r); })
      // Sin ruido: es un extra de diagnóstico, no algo que la pantalla necesite
      // para funcionar. Si el servidor no contesta, no se muestra y ya.
      .catch(() => { if (vivo) setImportacion(null); });
    return () => { vivo = false; };
  }, [isAdmin]);

  const pendientesDelPlano = importacion
    ? importacion.importables.length + importacion.incompletos.length
    : 0;
  /** Cuántos se acaban de pasar. Sostiene la confirmación en pantalla: sin
   *  esto, apretar el botón haría desaparecer la sección sin decir qué pasó. */
  const [importados, setImportados] = useState(0);
  const [ratesOpen, setRatesOpen] = useState(false);

  const [selected, setSelected] = useState<UnifiedFixture | null>(null);
  /** El mueble abierto, siempre el de la ÚLTIMA vuelta del store. El objeto
   *  lo reemplaza cada sincronización: al cancelar o confirmar una reserva
   *  desde la ficha el mapa se vuelve a leer, pero la ficha seguía con el
   *  mueble de antes —con el proveedor de la reserva pegado— y ofrecía
   *  «Renovar con …» algo que ya no existía. */
  useEffect(() => {
    if (!selected) return;
    const fresco = fixtures.find((f) => f.id === selected.id);
    if (fresco && fresco !== selected) setSelected(fresco);
  }, [fixtures, selected]);
  /** Los espacios que van en el contrato que se está armando, en el orden en
   *  que se fueron tocando.
   *
   *  Guarda `id` y cara, no el mueble: el objeto lo reemplaza el store en cada
   *  sincronización, y una referencia vieja dejaría la ficha mostrando el
   *  estado de hace un minuto. Se resuelve contra `fixtures` en cada render.
   *
   *  Vive acá y no adentro de la ficha porque el que la arma es el PLANO: se
   *  toca un espacio y entra a la lista. Un contrato con un proveedor sobre
   *  tres puntas de góndola es un solo acuerdo —un proveedor, un periodo, una
   *  firma— y tecleado de a uno eran tres veces el mismo formulario. */
  const [enContrato, setEnContrato] = useState<EnContrato[]>([]);
  /** «Editar contrato» que cambia cómo se vende el mueble («Por entrepaños →
   *  Cambiar»): el cambio queda PENDIENTE, no se escribe en el plano al tocar
   *  «Cambiar». Vender lo ve encima del mueble (`fixturesDelContrato`) y se
   *  escribe al guardar (`planoPendiente`); «Salir sin cambios» o un guardado
   *  que falla dejan el plano como estaba. Fuera de una edición, «Cambiar»
   *  escribe el plano al tocarlo, como siempre. */
  const [formaPendiente, setFormaPendiente] = useState<{ id: string; cambio: CambioDePartes } | null>(null);
  /** ¿Vender está editando un contrato? (la semilla se declara más abajo). */
  const editandoRef = useRef(false);
  // Where on the map the click landed (anchors the quick-look popover).
  const [anchor, setAnchor] = useState<MapAnchor | null>(null);
  // false = quick popover, true = full detail in the rail ("Ver todo").
  const [detailFull, setDetailFull] = useState(false);
  const [detailFace, setDetailFace] = useState<"A" | "B">("A");
  /** Para qué está abierta la pantalla ahora mismo.
   *
   *  Negociar y Resumen eran dos pestañas que abrían las dos con el plano de la
   *  misma sede, y la pregunta "¿en cuál de las dos hago el contrato?" no tenía
   *  buena respuesta. Es una sola pantalla con dos modos declarados: en Vender
   *  el mapa manda y el contrato va al lado; en Supervisar mandan los números y
   *  lo que está pendiente. El mercaderista no vende, así que sólo ve el
   *  segundo. */
  const [modoPropio, setModoPropio] = useState<ModoComercial>("vender");
  const modo = modoPedido ?? modoPropio;
  /** Cambiar de modo: con el armazón navega (y la dirección vuelve como
   *  `modo`); sin él, como siempre. */
  const setModo = useCallback((m: ModoComercial) => {
    // Lo que trae un contrato a Vender (Editar, Renovar, Contratar, confirmar
    // una reserva) cierra la bandeja de Pendientes: si ya se estaba en
    // Contratos no hay cambio de módulo que la cierre, y quedaba encima del
    // contrato que se acababa de abrir.
    if (m === "vender") useArmazon.getState().cerrarBandeja();
    if (onModo) onModo(m);
    else setModoPropio(m);
  }, [onModo]);
  const modoEfectivo: ModoComercial = isAdmin ? modo : "supervisar";
  /** Los cortes de ventas sin cargar y cuántos contratos de hoy se cobran por
   *  ventas (para la nota del canon), y las reservas de espacio vivas. Sólo
   *  quien administra (es plata y son proveedores) y sólo en Supervisar, que es
   *  donde se dibujan: en Vender ni se piden. */
  /** La bandeja de Pendientes (rediseño UX 2026-10, etapa 3): «Para revisar»
   *  en un cajón encima de la pantalla, abierto desde la barra de arriba. */
  const bandejaAbierta = useArmazon((s) => s.bandejaAbierta);
  const grupoPedido = useArmazon((s) => s.grupoPedido);
  const cerrarBandeja = useArmazon((s) => s.cerrarBandeja);
  /** Lo de «Para revisar» se pide en Supervisar (Indicadores y el Inicio) y
   *  con la bandeja abierta. Con Vender abierto no: la pantalla la mira el
   *  proveedor; sólo si quien administra abre la bandeja a propósito. */
  const pideRevision = modoEfectivo === "supervisar" || bandejaAbierta;
  const cortesSinCargar = useCobrosPorVentas({ sede, activo: isAdmin && pideRevision });
  const reservasSinConfirmar = useReservasDeEspacio({ sede, activo: isAdmin && pideRevision });
  /** Los contratos a los que les falta la planometría para que salga el aviso
   *  de montaje («Falta planometría»). Igual: sólo quien administra, sólo acá. */
  const faltaPlanometria = useFaltaPlanometria({ sede, activo: isAdmin && pideRevision });
  /** Los planogramas en «Hoy» (fase 4): el servidor sólo trae las caras que
   *  este rol puede revisar (las mismas que puede publicar). Sin plata. */
  const planogramasPorRevisar = usePlanogramasPorRevisar({ sede, activo: pideRevision });
  /** Los contratos de antes de Vender que no dicen si su valor es al mes
   *  (2026-10-25). Plata y proveedores: sólo quien administra, sólo acá. */
  const precioSinForma = usePrecioSinForma({ sede, activo: isAdmin && pideRevision });
  const [revisarMontajeDe, setRevisarMontajeDe] = useState<number | null>(null);
  const [guiaParaMandar, setGuiaParaMandar] = useState<number | null>(null);
  const [avisoDeSupervision, setAvisoDeSupervision] = useState<string | null>(null);
  /** «Plata: Al mes | Total», recordado por quien mira (rediseño, PR 2). */
  const [unidad, setUnidad] = useUnidadDePlata();
  /** El orden de «Quién paga el canon». */
  const [ordenQuienPaga, setOrdenQuienPaga] = useState<"monto" | "nombre">("monto");
  /** El grupo de «Para revisar» que se eligió; sin elegir, abre en «Hoy» si
   *  tiene algo y si no en «30 días» (`grupoParaAbrir`). */
  const [grupoElegido, setGrupoElegido] = useState<GrupoDeRevision | null>(null);
  /** La bandeja que se abrió pidiendo un grupo («Ver cuáles» de «Por vencer»
   *  en el Inicio) abre en ése. */
  useEffect(() => {
    if (bandejaAbierta && grupoPedido) setGrupoElegido(grupoPedido);
  }, [bandejaAbierta, grupoPedido]);
  /** El aviso al que llevó una chincheta del plano: se trae a la vista y se
   *  marca un momento. */
  const [avisoMarcado, setAvisoMarcado] = useState<string | null>(null);
  /** «Cargar planometría»: el contrato cuya planometría la ficha muestra
   *  arriba (su código completo, su id y su código como se lee). */
  const [planometriaPedida, setPlanometriaPedida] = useState<PlanometriaPedida | null>(null);
  /** El contrato que se acaba de cerrar.
   *
   *  Vive en la pantalla y no adentro del formulario a propósito: al guardar,
   *  el mueble cambia de estado y el formulario se desmontaría con el mensaje
   *  adentro, justo cuando hay que leer a quién le llegó el aviso. */
  const [cerrado, setCerrado] = useState<ResumenContrato | null>(null);
  /** La planilla de la reunión comercial, cargada de una tanda. */
  const [cargaAbierta, setCargaAbierta] = useState(false);
  /** La fila de temporadas, desplegada. Arranca cerrada: el periodo se lee en
   *  la barra y se cambia de a ratos. */
  const [periodoAbierto, setPeriodoAbierto] = useState(false);
  /** Contratos: el plano de la sede o la línea de tiempo (etapa 4). */
  const [vistaContratos, setVistaContratos] = useState<"plano" | "linea">("plano");
  /** Indicadores (etapa 5): la pestaña, recordada por quien mira, y el
   *  periodo del Resumen. */
  type PestanaInd = "resumen" | "plano" | "contratos" | "quien" | "participaciones" | "sedes" | "detalle" | "diccionario";
  const [pestanaInd, setPestanaIndCruda] = useState<PestanaInd>(() => {
    try {
      const v = window.localStorage.getItem("recabra-indicadores-pestana");
      return (["resumen", "plano", "contratos", "quien", "participaciones", "sedes", "detalle", "diccionario"] as const)
        .find((x) => x === v) ?? "resumen";
    } catch { return "resumen"; }
  });
  const setPestanaInd = (p: PestanaInd) => {
    setPestanaIndCruda(p);
    try { window.localStorage.setItem("recabra-indicadores-pestana", p); } catch { /* sin almacenamiento, igual cambia */ }
  };
  const [periodoResumen, setPeriodoResumen] = useState<PeriodoDelResumen>("hoy");
  /** De qué cifra se llegó a la tabla de contratos (Inicio o el Resumen): la
   *  tabla abre filtrada en lo que esa cifra cuenta, dice de dónde se vino y
   *  ofrece volver. Tocar otra pestaña u otro filtro lo olvida. */
  const [llegada, setLlegada] = useState<{ desde: "Inicio" | "Resumen"; cifra: string } | null>(null);
  const enIndicadores = modoEfectivo === "supervisar" && !inicio;
  // Lo que pide el armazón (Ctrl K, «Más», lo fijado): esta pantalla lo sabe
  // hacer y lo atiende cuando ya es la que está a la vista.
  const pedidoDelArmazon = useArmazon((s) => s.pedido);
  useEffect(() => {
    if (pedidoDelArmazon === "planilla" && modoEfectivo === "vender" && !inicio) {
      useArmazon.getState().atender();
      if (isAdmin) setCargaAbierta(true);
    } else if (pedidoDelArmazon === "diccionario" && enIndicadores) {
      useArmazon.getState().atender();
      setPestanaInd("diccionario");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDelArmazon, modoEfectivo, inicio, enIndicadores, isAdmin]);

  const selectFixture = (f: UnifiedFixture | null, point?: MapAnchor, cara: "A" | "B" = "A") => {
    setSelected(f);
    // En Vender el popover sobra: la ficha de la derecha ya dice todo lo que
    // ese globito decía, y encima tapa el mapa que se está mirando.
    setAnchor(modoEfectivo === "vender" ? null : point ?? null);
    setDetailFull(false);
    setDetailFace(cara);
    setCerrado(null);

    // En Vender tocar un espacio lo SUMA al contrato; tocarlo de nuevo lo
    // saca. Antes reemplazaba la selección, y con eso un contrato sobre tres
    // puntas había que tipearlo tres veces. Lo que no se alquila no entra —la
    // ficha explica por qué—.
    //
    // Por CARA y no por mueble: en la hoja de D cada cara de una góndola doble
    // tiene su media tapa, su rótulo y su caja de impacto, así que tocar la
    // mitad de atrás suma la cara de atrás. Antes entraba siempre la A y la B
    // había que ir a buscarla al renglón del contrato — el renglón sigue
    // teniendo sus dos interruptores, pero ya no es el único camino.
    if (modoEfectivo !== "vender" || !f) return;
    // Una caja o una columna (nunca enteras) suman su primera pieza libre en
    // el periodo; lo demás, la cara que se tocó (`alTocarEnVender`, probada).
    const libre = (p: ParteRef) => !mapRange || disponibilidadDeEspacio(
      f, "A", p, estadoComercial, indicePartes, sede, mapRange.from, mapRange.to) === "libre";
    setEnContrato((lista) => alTocarEnVender(lista, f, cara, libre));
  };

  /** «Sumar la BI1 de todas las cajas de la sede»: esa pieza de cada mueble de
   *  ese tipo que la tiene configurada, un renglón por mueble, en el mismo
   *  contrato (el multiespacio). Lo que ya estaba queda como estaba. */
  const sumarEnTodas = useCallback((tipo: string, parte: string) => {
    setEnContrato((lista) => {
      const nuevos = fixtures
        .filter((f) => f.type === tipo && piezasDe(f).some((p) => sufijoDeParte(p) === parte))
        .filter((f) => !lista.some((x) => x.id === f.id && x.parte === parte))
        .map((f) => ({ id: f.id, face: "A" as const, parte }));
      return [...lista, ...nuevos];
    });
  }, [fixtures]);

  /** Quitar un espacio del contrato: una cara, o una parte de ella. */
  const quitarDelContrato = useCallback((id: string, face: "A" | "B", parte?: string) => {
    setEnContrato((lista) => lista.filter((x) => !(x.id === id && x.face === face && (x.parte ?? null) === (parte ?? null))));
  }, []);

  /** Prender o apagar una parte (o la entera) en el renglón: la regla de la
   *  dueña —la nevera entera o por puertas, nunca las dos— está en
   *  `alternarParte`. */
  const alternarDeParte = useCallback((id: string, face: "A" | "B", parte: string | null) => {
    setEnContrato((lista) => {
      const nueva = alternarParte(lista, parte ? { id, face, parte } : { id, face });
      // Desmarcar la última parte de una cara «por partes» no saca la cara del
      // contrato: la línea queda, con su lista de partes abierta.
      const p = parte ? partirCodigo(`X-${parte}`).parte : null;
      if (p && esDivision(p) && !nueva.some((x) => x.id === id && x.face === face)) {
        return [...nueva, { id, face, porPartes: p.clase }];
      }
      return nueva;
    });
  }, []);

  /** La forma de UNA línea del contrato («Entera · Por entrepaños · Por
   *  porcentaje»). Si el mueble hoy se vende de otra forma, `cambio` es lo que
   *  hay que escribirle —ya revisado en la ficha con las MISMAS guardas del
   *  panel «Cómo se vende» del Plano (`cambioDesdeVender`), sobre sus dos
   *  caras— y se escribe por el camino de siempre, como «Vender esta cara por
   *  participación» de Distribución: primero se guarda lo pendiente del plano,
   *  después el cambio (`commit`) y se manda ya (`PUT /layout`), así el Plano,
   *  el Editor 3D y el servidor ven la forma nueva. Hay UNA verdad: el
   *  `partes.division` del mueble. Las líneas de ese mueble que ya estaban en el
   *  contrato pasan al estado vacío de la forma nueva (`aLaFormaNueva`).
   *  Devuelve el problema, si el plano no se guardó. */
  const venderAsi = useCallback(async (
    id: string, face: "A" | "B", forma: FormaDeLaLinea, cambio: CambioDePartes | null,
  ): Promise<string | null> => {
    if (!cambio) {
      setEnContrato((lista) => conLaForma(lista, id, face, forma));
      return null;
    }
    if (editandoRef.current) {
      // Editando: NADA se escribe en el plano todavía. Queda pendiente (junto
      // con lo que ya estaba pendiente de ese mueble) y se escribe al guardar.
      const base = selectFixtures(useFixtureStore.getState()).find((f) => f.id === id);
      setFormaPendiente((p) => {
        const junto = p && p.id === id ? { ...p.cambio, ...cambio } : cambio;
        if (!base) return p;
        const [vuelto] = conPartes([base], id, junto);
        return mismasPartes(base, vuelto) ? null : { id, cambio: junto };
      });
      setEnContrato((lista) => aLaFormaNueva(lista, id, face, forma));
      return null;
    }
    try {
      const fs = useFixtureStore.getState();
      await fs.flushPending();
      const antes = useFixtureStore.getState();
      antes.commit(conPartes(selectFixtures(antes), id, cambio));
      await useFixtureStore.getState().flushPending();
      // Delante del proveedor: el rechazo del servidor (`message`, `choques`)
      // puede nombrar a otro proveedor y la fecha de su reserva. Se dice una
      // frase genérica; el detalle lo ve quien administra en el Plano.
      if (useFixtureStore.getState().rechazos[sede]) return NO_SE_CAMBIO_LA_FORMA;
    } catch {
      // Tampoco el texto del error: sólo que no se pudo.
      return "No se pudo guardar el plano: probá de nuevo en un momento.";
    }
    setEnContrato((lista) => aLaFormaNueva(lista, id, face, forma));
    return null;
  }, [sede]);

  /** El cambio pendiente de «Editar contrato», para el guardado: `escribir` lo
   *  manda al plano por el camino de siempre (`commit` + `PUT /layout`) justo
   *  antes del pedido —el servidor lee las partes del plano—, y `deshacer`
   *  vuelve el mueble a como estaba si el guardado falla. */
  const planoPendiente = useMemo(() => {
    if (!formaPendiente) return null;
    const { id, cambio } = formaPendiente;
    let antes: { partes: UnifiedFixture["partes"]; entrepanos: UnifiedFixture["entrepanos"] } | null = null;
    const deshacer = async () => {
      if (!antes) return;
      const vuelta = antes;
      antes = null;
      const st = useFixtureStore.getState();
      // `null` y no `undefined`: la ficha viaja como está, y un campo que no
      // viaja el servidor lo conserva (quedaba la punta partida).
      st.commit(selectFixtures(st).map((f) => (f.id === id
        ? { ...f, partes: vuelta.partes ?? null, entrepanos: vuelta.entrepanos ?? null } : f)));
      await useFixtureStore.getState().flushPending();
    };
    const escribir = async (): Promise<string | null> => {
      try {
        await useFixtureStore.getState().flushPending();
        const st = useFixtureStore.getState();
        const f = selectFixtures(st).find((x) => x.id === id);
        if (!f) return "El mueble ya no está en el plano: recargá y volvé a intentar.";
        antes = { partes: f.partes, entrepanos: f.entrepanos };
        st.commit(conPartes(selectFixtures(st), id, cambio));
        await useFixtureStore.getState().flushPending();
        if (useFixtureStore.getState().rechazos[sede]) {
          await deshacer();
          return NO_SE_CAMBIO_LA_FORMA;
        }
        return null;
      } catch {
        await deshacer().catch(() => undefined);
        return "No se pudo guardar el plano: probá de nuevo en un momento.";
      }
    };
    return { escribir, deshacer };
  }, [formaPendiente, sede]);

  /** Sumar o sacar una cara de una góndola doble.
   *
   *  Es un interruptor por cara y no un selector entre las dos: las dos caras
   *  de una góndola son DOS espacios, y vendérselas al mismo proveedor en el
   *  mismo contrato es lo normal —una marca que quiere el pasillo entero—.
   *  Con un selector eso obligaba a hacer dos contratos. Sacar la última cara
   *  saca el mueble del contrato, que es lo que uno espera al apagar la
   *  única que quedaba prendida. */
  const alternarCara = useCallback((id: string, face: "A" | "B") => {
    setEnContrato((lista) => {
      if (lista.some((x) => x.id === id && x.face === face)) return lista.filter((x) => !(x.id === id && x.face === face));
      // Una cara por participación entra como su PORCENTAJE (la línea de %),
      // nunca entera: también desde una pastilla de la tarifa.
      const f = fixtures.find((x) => x.id === id);
      if (f && porParticipacion(f)) return [...lista, { id, face, pc: true }];
      return [...lista, { id, face }];
    });
  }, [fixtures]);

  /** Los muebles como los ve el contrato: los del plano y, editando, con la
   *  forma de venderse que quedó pendiente encima (`formaPendiente`). */
  const fixturesDelContrato = useMemo(
    () => (formaPendiente ? conPartes(fixtures, formaPendiente.id, formaPendiente.cambio) : fixtures),
    [fixtures, formaPendiente],
  );
  /** Los espacios del contrato resueltos contra el layout de ahora. */
  const espaciosDelContrato = useMemo(
    () =>
      enContrato
        .map(({ id, face, parte, pc, porPartes }): CaraElegida | null => {
          const fixture = fixturesDelContrato.find((f) => f.id === id);
          // El % (`pc`) y la cara por partes sin ninguna marcada (`porPartes`)
          // tienen que llegar a la ficha: sin ellos una cara por participación
          // entraba como «Entera» y «Por entrepaños» no hacía nada.
          return fixture ? {
            fixture, face,
            ...(parte ? { parte } : {}),
            ...(pc ? { pc } : {}),
            ...(porPartes ? { porPartes } : {}),
          } : null;
        })
        .filter((x): x is CaraElegida => x !== null),
    [enContrato, fixturesDelContrato],
  );

  /** Las llaves `${fixtureId}-${cara}` de las CARAS que toca el contrato. Es
   *  el idioma con el que el plano, la tarifa, la escalera y la ficha nombran
   *  una cara: una sola llave para las cuatro piezas es lo que permite que el
   *  resaltado sea una sola función y que los conteos no se contradigan.
   *  Vendiendo por partes, una puerta toca su nevera: el plano la marca y deja
   *  de contarla libre (la llave de la parte, `claveDeEspacio`, es sólo de
   *  la fila del contrato). */
  const carasDelContrato = useMemo(
    () => [...new Set(espaciosDelContrato.map((e) => `${e.fixture.id}-${e.face}`))],
    [espaciosDelContrato],
  );

  /** Qué tipos de tarifa toca el contrato, para marcar sus filas en la tabla. */
  const tiposDelContrato = useMemo(
    () => new Set(espaciosDelContrato.map((e) => rateTypeOf(e.fixture))),
    [espaciosDelContrato, fichasPropias],
  );

  /** EL RESALTADO. Apaga la sala al 20 % y enciende los muebles de los que se
   *  está hablando, desde una fila de la tarifa, un chip de la escalera o una
   *  fila del contrato. Una sola función para las tres.
   *
   *  Es imperativa a propósito: el apagado es CSS sobre los hijos de la escena
   *  y el encendido un `classList.toggle` sobre nodos que ya existen. Con
   *  estado de React, pasar el mouse por una fila volvería a pintar ciento seis
   *  prismas por cada píxel que se mueve el mouse. */
  const resaltarPlano = useRef<((claves: string[] | null) => void) | null>(null);
  /** Lo FIJADO: las caras de la fila de la tarifa que se tocó (clic o toque).
   *  Con el dedo no hay `mouseenter` que valga, y antes tocar una fila no
   *  encendía nada. Mientras hay algo fijado, «apagar» (`destacar(null)`)
   *  vuelve a eso y no a la sala entera: el resaltado de un chip o de una
   *  fila del contrato pasa por encima un momento y después vuelve. */
  const fijadoEnPlano = useRef<string[] | null>(null);
  const destacar = useCallback((claves0: string[] | null) => {
    const claves = claves0 ?? fijadoEnPlano.current;
    resaltarPlano.current?.(claves);
    const set = new Set(claves ?? []);
    document.querySelectorAll<HTMLElement>(".eitem[data-clave]").forEach((el) => {
      el.classList.toggle("hl", set.has(el.dataset.clave ?? ""));
    });
  }, []);

  /** La lectura del cursor de la escalera, que vive en el encabezado del panel
   *  02. `Libera` la escribe por acá en vez de subirla como estado: mover el
   *  cursor no puede volver a pintar la pantalla entera. */
  const lecturaRef = useRef<((dia: string, n: number) => void) | null>(null);
  const escribirLectura = useCallback((dia: string, n: number) => {
    lecturaRef.current?.(dia, n);
  }, []);


  const closeDetail = () => {
    setSelected(null);
    setAnchor(null);
    setDetailFull(false);
    setEnContrato([]);
    // La semilla se va con el contrato que la trajo. Si quedara, el próximo
    // espacio que alguien elija abriría el formulario con el proveedor y el
    // periodo de una renovación que se canceló.
    setSemilla(null);
    // Lo pendiente de una edición se va con ella: el plano nunca se tocó.
    setFormaPendiente(null);
  };
  /** Desde «Para revisar»: abrir la FICHA del espacio, no sólo señalarlo.
   *
   *  Tocar una fila llamaba a `selectFixture` sin punto de anclaje, y con eso
   *  no aparecía ninguno de los dos paneles: el globito del mapa necesita un
   *  ancla —no la hay, porque no se tocó el mapa— y la ficha necesita
   *  `detailFull`, que sólo lo prendía el globito al expandirse. Resultado: la
   *  fila pintaba el mueble en el plano y ahí terminaba todo.
   *
   *  Es un callejón sin salida justo donde no puede haberlo: «PUN-03 vence en
   *  22 días» es el renglón desde el que se sale a renovar, y el botón para
   *  hacerlo —«Nuevo contrato para esta cara»— vive en la ficha que no se
   *  abría. Nunca se quitó el botón; lo que faltaba era el camino hasta él.
   *
   *  Se abre en la cara del renglón: en una góndola doble, la que vence es una
   *  de las dos y no da lo mismo cuál. */
  const revisar = (f: UnifiedFixture, face: "A" | "B" = "A") => {
    setSelected(f);
    setPlanometriaPedida(null);
    setAnchor(null);
    setDetailFace(face);
    setDetailFull(true);
    setCerrado(null);
  };

  /** Pasar a vender ese espacio, venga de donde venga: del popover del mapa o
   *  del panel de detalle en Supervisar. */
  const negociar = (
    f: UnifiedFixture, face: "A" | "B" = "A", semilla: SemillaContrato | null = null, parte?: string,
  ) => {
    setSelected(f);
    setDetailFace(face);
    setDetailFull(false);
    setAnchor(null);
    setCerrado(null);
    setSemilla(semilla);
    // Arranca un contrato NUEVO con ese espacio. Sumarlo a uno que estuviera a
    // medio armar mezclaría dos negociaciones sin avisar. Vendiendo por
    // partes, con la puerta elegida (`PU2`); una cara por participación, con
    // su línea de porcentaje (nunca entera). Un mueble que se vende por
    // partes (`partes.division`) entra con su lista de partes abierta y
    // ninguna marcada: entera chocaría con la parte que ya esté vendida. Una
    // renovación (`semilla`) trae lo que renueva y entra como estaba.
    const division = !parte && !semilla ? divisionDe(f) : null;
    setEnContrato([porParticipacion(f) ? { id: f.id, face, pc: true }
      : parte ? { id: f.id, face, parte }
      : division ? { id: f.id, face, porPartes: division.clase } : { id: f.id, face }]);
    setModo("vender");
  };

  /** Con qué abre el formulario cuando se llega por «Renovar». */
  const [semilla, setSemilla] = useState<SemillaContrato | null>(null);
  useEffect(() => {
    editandoRef.current = !!semilla?.edita;
    if (!semilla?.edita) setFormaPendiente(null);
  }, [semilla]);

  /** «Vender» del panel del Plano (rediseño, PR 3): llega por el store
   *  (`pedirVender`, `Dashboard.tsx` ya cambió de pestaña) y se arma con
   *  `negociar`, el mismo camino que el globo del mapa. Se suelta enseguida:
   *  volver a esta pestaña no lo repite. */
  const pedidoVender = useFixtureStore((s) => s.pedidoVender);
  useEffect(() => {
    if (!pedidoVender || !isAdmin) return;
    useFixtureStore.getState().soltarPedidoVender();
    const f = fixtures.find((x) => x.id === pedidoVender.fixtureId);
    if (f) negociar(f, pedidoVender.cara);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoVender, isAdmin]);

  /** Distribuir, al guardar una cara a la que se entró desde Supervisar
   *  («Falta distribuir» → «Distribuir»): vuelve acá, a Supervisar, con el
   *  aviso de lo que pasó («Listo: GON-01 · cara A quedó distribuida…»). Se
   *  suelta enseguida, como `pedidoVender`. */
  const pedidoSupervisar = useFixtureStore((s) => s.pedidoSupervisar);
  const [avisoDeDistribucion, setAvisoDeDistribucion] = useState<string | null>(null);
  useEffect(() => {
    if (!pedidoSupervisar || !isAdmin) return;
    useFixtureStore.getState().soltarPedidoSupervisar();
    setModo("supervisar");
    setAvisoDeDistribucion(pedidoSupervisar.aviso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoSupervisar, isAdmin]);

  /** «Marcado reservado a mano» → «Liberar»: Disponible en la base, como el
   *  selector del Plano. «Reservar de verdad» libera la marca y abre Vender
   *  con el espacio: la reserva de verdad lleva proveedor y fecha, y con la
   *  marca puesta Vender lo da tomado. */
  const [liberando, setLiberando] = useState<string | null>(null);
  const liberarReservadoAMano = async (entry: FaceEntry, despues?: () => void) => {
    const codigo = fullSpaceCode(entry.fixture.sede || sede, entry.code);
    setLiberando(codigo);
    try {
      const espacio = await findOrCreateSpace({ code: codigo, name: entry.fixture.code, sede: entry.fixture.sede || sede });
      await updateSpaceStatus(espacio.id, "free");
      await refrescarComercial();
      despues?.();
    } catch {
      /* el mapa no cambió: la fila sigue ahí para volver a probar */
    } finally {
      setLiberando(null);
    }
  };

  /** Renovar una participación: Vender con el contrato armado (rediseño de
   *  Vender, PR 1; antes abría el Editor 3D → Distribución). La línea es el
   *  porcentaje de esa cara con el término que se renueva (`renueva`), el
   *  mismo proveedor, marca y %, y el periodo siguiente por el mismo largo.
   *  El término sale de `GET /participaciones/cara`: esto corre en
   *  Supervisar, que es de administración —la ficha de Vender no lee
   *  participaciones—. Si no se puede leer o ya no se renueva (vencido,
   *  cancelado, una reserva), Vender abre con el porcentaje de esa cara y sin
   *  `renueva`: lo que se carga es un contrato nuevo. */
  const renovarParticipacion = useCallback(async (entry: FaceEntry) => {
    const f = entry.fixture;
    const codigo = fullSpaceCode(sede, entry.code);
    const caraCompleta = fullSpaceCode(sede, codigoDeParte(f.code, entry.face, null));
    let termino: number | undefined;
    let semillaPc: SemillaContrato | null = null;
    try {
      const cara = await leerCara(sede, espacioDeLaCara(f.code, entry.face));
      const t = cara.participaciones.find((p) => p.codigo.toUpperCase() === codigo)?.terminos[0];
      if (t && t.estado === "contrato" && (t.estado_visible === "vigente" || t.estado_visible === "firmado")) termino = t.id;
      if (t) {
        const dia = 86_400_000;
        const fin = parseISODate(t.hasta), ini = parseISODate(t.desde);
        const largo = fin && ini ? Math.round((+fin - +ini) / dia) : null;
        const desde = fin ? new Date(+fin + dia) : null;
        const hasta = desde && largo !== null ? new Date(+desde + largo * dia) : null;
        semillaPc = {
          id: `${codigo}|${t.id}`,
          proveedor: t.proveedor?.nombre ?? entry.supplierName ?? "",
          correo: "",
          marca: t.marca ?? entry.brandCategory ?? "",
          desde: termino && desde ? toISODate(desde) : "",
          hasta: termino && hasta ? toISODate(hasta) : "",
          valores: t.valor_mensual && t.valor_mensual > 0
            ? { [claveDePrecio(`${caraCompleta}-PC1`)]: t.valor_mensual.toLocaleString("es-CO") } : {},
          porcentajes: { [caraCompleta]: t.puntos_basicos },
          renueva: termino ? { [caraCompleta]: termino } : {},
        };
      }
    } catch {
      /* sin el término, Vender abre con el porcentaje de la cara y nada más */
    }
    negociar(f, entry.face, semillaPc);
  }, [sede]);

  /** La cara que la ficha está mostrando. Se calcula acá y no adentro de la
   *  ficha porque el botón de renovar necesita la MISMA: dos cálculos separados
   *  de «cuál cara es» se desincronizan en una góndola doble, y renovar la cara
   *  B creyendo que es la A es un error que no se ve hasta que sale el correo. */
  const entradaDetalle = useMemo((): FaceEntry | null => {
    if (!selected) return null;
    const caras = facesOf(selected);
    // Una reserva viva no se renueva (`renovable`): va con su fecha.
    return conLaReserva(detailFace === "B" && caras.length > 1 ? caras[1] : caras[0], estadoComercial, sede);
  }, [selected, detailFace, estadoComercial, sede]);

  /** Renovar: el mismo acuerdo otra vez, empezando cuando termina el que corre.
   *
   *  Renovar NO es hacer un contrato en blanco sobre el mismo mueble. Es el
   *  mismo proveedor, la misma marca y —hasta que alguien lo cambie— el mismo
   *  valor, por el mismo tiempo, arrancando el día después de que termina el
   *  que está corriendo. Sin esto había que volver a tipear proveedor, correo,
   *  marca y valor mirando la ficha de al lado, y cada uno de esos cuatro
   *  campos es una oportunidad de escribir mal el nombre del proveedor y
   *  terminar con dos proveedores que son el mismo.
   *
   *  El día DESPUÉS, no el mismo: los dos extremos cuentan como ocupados, así
   *  que arrancar el mismo día se pisaría con el contrato vigente y la propia
   *  validación del formulario lo marcaría como no disponible.
   *
   *  El valor viene del contrato que está corriendo y no de la tarifa de lista:
   *  lo que se renegocia es lo que se está pagando. Queda editable, que es
   *  justamente donde se sube el canon. */
  const renovar = useCallback((entry: FaceEntry) => {
    // Una participación (`…-PC3`) se renueva en Distribución, con su
    // formulario (§4.7): no es un contrato de Vender.
    if (entry.parte && esParticipacion(entry.parte)) {
      void renovarParticipacion(entry);
      return;
    }
    const dia = 86_400_000;
    const fin = entry.endDate ? parseISODate(entry.endDate) : null;
    const ini = entry.startDate ? parseISODate(entry.startDate) : null;
    // Mismo largo que el contrato vigente, contando los dos extremos. Sin
    // fechas confiables se cae al periodo de la barra, que es lo que hacía
    // antes de que este botón existiera.
    const largo = fin && ini ? Math.round((+fin - +ini) / dia) : null;
    const desde = fin ? new Date(+fin + dia) : null;
    const hasta = desde && largo !== null ? new Date(+desde + largo * dia) : null;

    const codigo = fullSpaceCode(entry.fixture.sede || sede, entry.code);
    setSemilla({
      id: `${codigo}|${entry.endDate}`,
      proveedor: entry.supplierName,
      correo: "",
      marca: entry.brandCategory,
      desde: desde ? toISODate(desde) : "",
      hasta: hasta ? toISODate(hasta) : "",
      // Por la clave de PRECIO de su línea: una parte va en la línea de las
      // partes de su cara («PUN-02 · EN1»), con un precio para todas.
      valores: entry.negotiatedValue > 0
        ? { [claveDePrecio(codigo)]: entry.negotiatedValue.toLocaleString("es-CO") }
        : {},
    });
    setSelected(entry.fixture);
    setDetailFace(entry.face);
    setDetailFull(false);
    setAnchor(null);
    setCerrado(null);
    // Una parte se renueva como parte: el mismo espacio (`NEV-03-PU2`), no la
    // nevera entera.
    setEnContrato([entry.parte
      ? { id: entry.fixture.id, face: entry.face, parte: sufijoDeParte(entry.parte) }
      : { id: entry.fixture.id, face: entry.face }]);
    setModo("vender");
  }, [sede, renovarParticipacion]);
  /** «Editar contrato» (2026-10-22): Vender con un contrato YA guardado,
   *  cargado entero —cómo se vende, proveedor, correo, marca, fechas, precio
   *  con su «Total | Al mes», precio fijo o % de las ventas con su corte, el %
   *  de una participación—. Nunca la nota interna (Vender lo mira el
   *  proveedor).
   *
   *  Es EL contrato del renglón: su `leaseId` (del mapa comercial, sólo para
   *  quien administra) y lo que el renglón mostró (`mostrado`, que va como
   *  `esperado`). Lo demás se lee de `GET /contratos/{id}/edicion`; nunca se
   *  vuelve a buscar el contrato por código («el que manda» puede ser otro si
   *  el de la fila se canceló entretanto). */
  const [abriendoEdicion, setAbriendoEdicion] = useState<number | null>(null);
  const [avisoDeEdicion, setAvisoDeEdicion] = useState<string | null>(null);
  /** De dónde se abrió la edición: al salir sin cambios o al volver a
   *  Supervisar, el foco vuelve a ESE botón «Editar contrato» (o, si ya no
   *  está —un contrato reemplazado—, al título de su sección). */
  const origenDeEdicion = useRef<{ leaseId: number; fixtureId: string; face: "A" | "B"; enFicha: boolean;
    seccion: string | null } | null>(null);
  const editarContrato = useCallback(async (
    f: UnifiedFixture, face: "A" | "B", leaseId: number,
    mostrado: Pick<EsperadoDelContrato, "valor" | "desde" | "hasta"> & Partial<Pick<EsperadoDelContrato, "proveedor" | "marca">> | null,
    origen: { enFicha: boolean; seccion?: string | null },
  ) => {
    setAbriendoEdicion(leaseId);
    setAvisoDeEdicion(null);
    try {
      const d = await contratoParaEditar(leaseId);
      if (!d.activo) {
        setAvisoDeEdicion("Ese contrato ya no está vigente: recargá y volvé a intentar.");
        return;
      }
      const forma = d.forma;
      const visibleCara = codigoVisibleDe(f.code, face, forma === "pieza" ? false : isDoubleGondola(f), null);
      // La clave del precio de la línea, como la arma Vender (`claveDePrecio`).
      const clave = claveDePrecio(forma === "participacion" ? `${d.cara}-PC1` : d.espacio);
      const tecleado = d.modo_precio === "mensual" && d.valor_tecleado ? d.valor_tecleado : d.valor;
      const antes: FotoDelContrato = {
        forma, visibleCara, partes: d.parte ? [d.parte] : [], proveedor: d.proveedor, marca: d.marca ?? "",
        desde: d.desde, hasta: d.hasta, valor: d.valor, modoPrecio: d.modo_precio, valorTecleado: d.valor_tecleado,
        cobro: d.cobro, pb: d.puntos_basicos,
      };
      /** La huella que se espera encontrar al guardar: lo que la FILA mostró
       *  (valor, fechas, proveedor, marca) y, de lo que la fila no dice, lo que
       *  se leyó al abrir (cómo se cobra, el %). El próximo contrato no tiene
       *  fila: sale entero de lo leído. */
      const esperado: EsperadoDelContrato = {
        valor: mostrado?.valor ?? d.valor,
        desde: mostrado?.desde ?? d.desde,
        hasta: mostrado?.hasta ?? d.hasta,
        proveedor: mostrado?.proveedor ?? d.proveedor,
        marca: mostrado?.marca !== undefined ? mostrado.marca : d.marca,
        cobro: d.cobro ? { modo: "ventas", porcentaje: d.cobro.porcentaje, corte: d.cobro.corte } : { modo: "fijo" },
        puntos_basicos: d.puntos_basicos,
      };
      origenDeEdicion.current = { leaseId, fixtureId: f.id, face, enFicha: origen.enFicha, seccion: origen.seccion ?? null };
      setSemilla({
        id: `editar|${leaseId}|${Date.now()}`,
        proveedor: d.proveedor,
        correo: d.correo ?? "",
        marca: d.marca ?? "",
        desde: d.desde,
        hasta: d.hasta,
        // El valor EXACTO, con su coma («0,5»): redondearlo a pesos cambiaba
        // el contrato sin que nadie lo tocara («$ 0,5 → $ 1»).
        valores: d.cobro ? {} : { [clave]: textoDePrecioExacto(tecleado) },
        modos: d.modo_precio ? { [clave]: d.modo_precio } : {},
        porcentajes: forma === "participacion" && d.puntos_basicos ? { [d.cara]: d.puntos_basicos } : undefined,
        cobro: d.cobro
          ? { modo: "ventas", texto: String(d.cobro.porcentaje).replace(".", ","), corte: d.cobro.corte }
          : { modo: "fijo" },
        edita: {
          leaseId, esperado, codigo: d.espacio, cara: d.cara, sede: d.sede, antes,
          arranco: d.arranco, ultimoCorte: d.ultimo_corte, cortes: d.cortes, planometria: d.planometria,
          correo: d.correo, montajePendiente: d.montaje_pendiente, hoy: d.hoy,
        },
      });
      setSelected(f);
      setDetailFace(face);
      setDetailFull(false);
      setAnchor(null);
      setCerrado(null);
      setEnContrato([forma === "participacion" ? { id: f.id, face, pc: true }
        : d.parte ? { id: f.id, face, parte: d.parte } : { id: f.id, face }]);
      setModo("vender");
    } catch (e) {
      setAvisoDeEdicion(describeError(e, "No se pudo abrir el contrato para editarlo. Probá de nuevo."));
    } finally {
      setAbriendoEdicion(null);
    }
  }, []);
  /** «Editar contrato» de una fila (de «Para revisar», de la ficha o de una
   *  parte): lo que la fila MUESTRA es lo que se espera encontrar. */
  const editarFila = useCallback((entry: FaceEntry, origen: { enFicha: boolean; seccion?: string | null }) => {
    if (typeof entry.leaseId !== "number") return;
    void editarContrato(entry.fixture, entry.face, entry.leaseId, {
      valor: entry.negotiatedValue, desde: entry.startDate, hasta: entry.endDate,
      proveedor: entry.supplierName, marca: entry.brandCategory || null,
    }, origen);
  }, [editarContrato]);
  /** El botón de una fila de «Corregir» que tiene un contrato detrás. */
  const accionEditar = (entry: FaceEntry, seccion: string) => (isAdmin && typeof entry.leaseId === "number" ? [{
    texto: "Editar contrato", icono: <FilePenLine {...ICONO_TARJETA} />,
    titulo: "Abre Vender con este contrato cargado; al guardar se reenvía a los correos",
    ocupado: abriendoEdicion === entry.leaseId,
    leaseId: entry.leaseId,
    onClick: () => editarFila(entry, { enFicha: false, seccion }),
  }] : undefined);
  /** Salir de una edición (sin cambios, ya guardada o tras un 409): a
   *  Supervisar, con la base releída, y el foco al botón que la abrió. */
  const [enfocarAlVolver, setEnfocarAlVolver] = useState(0);
  const volverDeLaEdicion = () => {
    const o = origenDeEdicion.current;
    setCerrado(null);
    closeDetail();
    setModo("supervisar");
    void refrescarComercial();
    if (o?.enFicha) {
      const f = fixtures.find((x) => x.id === o.fixtureId);
      if (f) revisar(f, o.face);
    }
    if (o) setEnfocarAlVolver((n) => n + 1);
  };
  useEffect(() => {
    const o = origenDeEdicion.current;
    if (!enfocarAlVolver || !o) return;
    let cuadros = 0;
    let raf = 0;
    const buscar = () => {
      const boton = document.querySelector<HTMLElement>(`[data-editar-contrato="${o.leaseId}"]`);
      if (boton) { boton.focus(); origenDeEdicion.current = null; return; }
      // El contrato ya no tiene su botón (se reemplazó): al título de su
      // sección, después de darle a la lista un momento para dibujarse.
      if (++cuadros < 90) { raf = requestAnimationFrame(buscar); return; }
      const titulo = o.enFicha
        ? document.querySelector<HTMLElement>("[data-ficha-titulo]")
        : [...document.querySelectorAll<HTMLElement>(".sec-r .rotulo")].find((x) => !!o.seccion && x.textContent?.startsWith(o.seccion))
          ?? [...document.querySelectorAll<HTMLElement>("h2")].find((x) => x.textContent === "Para revisar") ?? null;
      if (titulo) {
        if (!titulo.hasAttribute("tabindex")) titulo.setAttribute("tabindex", "-1");
        titulo.focus();
      }
      origenDeEdicion.current = null;
    };
    raf = requestAnimationFrame(buscar);
    return () => cancelAnimationFrame(raf);
  }, [enfocarAlVolver]);
  const [viewerFile, setViewerFile] = useState<SpaceFileMeta | null>(null);

  // ── Estado de montaje ────────────────────────────────────────────────────
  // El mercaderista ya reportaba y nadie leía: el reporte caía en una tabla que
  // ninguna pantalla mostraba. Se pide una sola vez, para todas las sedes —
  // son unas pocas filas y el enlace del correo puede apuntar a cualquiera.
  const [montajes, setMontajes] = useState<MountConfirmation[]>([]);
  useEffect(() => {
    let vivo = true;
    fetchMounts()
      .then((m) => { if (vivo) setMontajes(m); })
      .catch(() => { if (vivo) setMontajes([]); });
    return () => { vivo = false; };
  }, []);
  const reportesDeMontaje = useMemo(() => reportesPorCodigo(montajes), [montajes]);

  /** El último reporte de una cara PARA SU CONTRATO, buscado por su código
   *  COMPLETO.
   *
   *  `FaceEntry.code` es el nombre corto, que se repite entre sedes; los
   *  reportes se guardan con la sede adentro. Buscar por el corto mezclaría
   *  tiendas — es el mismo error que ya costó un arreglo en la pantalla del
   *  mercaderista. Y cuenta sólo lo reportado desde la víspera del arranque
   *  (2026-10-05, `utils/montajeDelContrato.ts`): el «montado» del contrato
   *  anterior no es prueba de que el actual se haya montado. */
  const montajeDe = useCallback(
    (entry: FaceEntry): MountConfirmation | undefined =>
      reporteDelContrato(
        reportesDeMontaje, fullSpaceCode(entry.fixture.sede || sede, entry.code), entry.startDate,
      ),
    [reportesDeMontaje, sede],
  );

  const [mapQuery, setMapQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<MapFilter>("todos");
  /* El filtro por TIPO de espacio se fue con las pastillas de código: en la
     hoja de D, pasar el mouse por una fila de la tarifa APAGA la sala y deja
     encendidos los muebles de ese tipo, que es la misma pregunta contestada
     sin dejar la pantalla en un estado que después hay que acordarse de
     deshacer. El filtro de texto del plano sigue vivo, en Supervisar. */
  /** El periodo que contesta el plano, UNO POR PANTALLA (rediseño UX 2026-10,
   *  etapa 4): Contratos pregunta «¿para qué fechas?» y arranca en treinta
   *  días; Indicadores (Supervisar) e Inicio hablan de hoy. Eran uno solo para
   *  las dos pestañas y se lo ponía la primera que se abría; con el armazón la
   *  aplicación abre en el Inicio, y el contrato —que congela sus fechas al
   *  montarse— arrancaba en «hoy → hoy». Cada pantalla guarda el suyo. */
  const [rangoVender, setRangoVender] = useState<DateRange>(() => {
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    return { from, to };
  });
  const [rangoSupervisar, setRangoSupervisar] = useState<DateRange>(() => hoyComoRango());
  const mapRange: DateRange | null = modoEfectivo === "vender" ? rangoVender : rangoSupervisar;
  const setMapRange = useCallback((r: DateRange | null) => {
    if (modoEfectivo === "vender") { if (r) setRangoVender(r); }
    else setRangoSupervisar(r ?? hoyComoRango());
  }, [modoEfectivo]);

  /** Vender por partes: las partes con algo dicho en la base, por su cara. Se
   *  arma con el mapa CRUDO (`estadoComercial`): la fusión no le cambia nada
   *  al mueble cuando se vende una puerta, así que todo cálculo que mira
   *  partes depende de esto y no sólo de `fixtures`. */
  const indicePartes = useMemo(() => indiceDePartes(estadoComercial), [estadoComercial]);
  /** Cómo está una cara en el periodo, mirando sus partes: una nevera con la
   *  puerta 2 vendida está «parcial» (se puede vender otra puerta); con todas
   *  vendidas, «tomada». Sin partes, la cara sola, como siempre. Es la ÚNICA
   *  cuenta del plano, la tarifa, la escalera y los contadores. */
  const dispoDeCara = useCallback(
    (f: UnifiedFixture, face: FaceEntry): RangeAvailability => (mapRange
      // Una cara por participación, con su ocupación anónima: sin lugar en el
      // periodo, tomada; con algo comprometido, parcial (§4.8).
      ? disponibilidadDeCara(f, face.face, estadoComercial, indicePartes, sede, mapRange.from, mapRange.to, participacionDe(f, face.face))
      : "libre"),
    [mapRange, estadoComercial, indicePartes, sede, participacionDe],
  );
  /** Lo que dice una cara parcial: «1 de 3 puertas vendida» (POR SUS PARTES)
   *  o desde qué día se vende ENTERA, mirando lo que choca con ella
   *  (`comoSeLiberaLaCara`). Una sola cuenta para el rótulo del plano, el
   *  cartel del mouse y la lista de precios. */
  const comoSeLibera = useCallback(
    (f: UnifiedFixture, face: FaceEntry): ComoSeLibera | null => (mapRange
      // Fase 2 · I4: lo puesto a mano (Mantenimiento, Reservado) o la venta
      // entera mandan sobre la ocupación (`tomadaPorLoSuyo`, la regla de
      // `disponibilidadDeCara`): una cara así no dice «queda 75 %».
      ? (tomadaPorLoSuyo(f, face.face, estadoComercial, sede, mapRange.from, mapRange.to)
        ? comoSeLiberaLaCara(f, face.face, estadoComercial, indicePartes, sede, mapRange.from, mapRange.to)
        // Una cara por participación con algo comprometido dice «Por
        // participación · queda 40 %» (el % sólo para quien administra: el
        // trabajador ve la palabra) en el cartel y la tarifa.
        : comoSeLiberaPorParticipacion(f, participacionDe(f, face.face), mapRange.from, mapRange.to, isAdmin)
          ?? comoSeLiberaLaCara(f, face.face, estadoComercial, indicePartes, sede, mapRange.from, mapRange.to))
      : null),
    [mapRange, estadoComercial, indicePartes, sede, participacionDe, isAdmin],
  );
  /** Fase 2 · I4: la línea corta del rótulo de una cara por participación en
   *  el plano («queda 45 %» / «tomada» / «por participación»). El plano la pide
   *  sólo para una cara «parcial», que ya pasó por la regla de lo puesto a
   *  mano (`dispoDeCara`). */
  const cortoDeCara = useCallback(
    (f: UnifiedFixture, face: FaceEntry): string | null => {
      if (!mapRange) return null;
      const d = dispoDeParticipacion(f, participacionDe(f, face.face), mapRange.from, mapRange.to);
      return d && d.dispo !== "libre" ? textoCortoDeParticipacion(d, isAdmin) : null;
    },
    [mapRange, participacionDe, isAdmin],
  );
  const porPartesDeCara = useCallback(
    (f: UnifiedFixture, face: FaceEntry): string | null => comoSeLibera(f, face)?.porPartes ?? null,
    [comoSeLibera],
  );
  const libreDesdeDeCara = useCallback(
    (f: UnifiedFixture, face: FaceEntry) => {
      const c = comoSeLibera(f, face);
      return c?.desde ? { desde: c.desde, diasLibres: c.diasLibres } : undefined;
    },
    [comoSeLibera],
  );
  /** Las partes vendidas de un mueble, como filas propias (`partesConContrato`).
   *  Dependen del mapa crudo: vender una puerta no cambia `fixtures`. */
  const partesVendidasDe = useCallback(
    (f: UnifiedFixture): FaceEntry[] => partesConContrato(f, estadoComercial, indicePartes, sede),
    [estadoComercial, indicePartes, sede],
  );
  /** Las mismas, como se MUESTRAN: los contratos de participación (`…-PC3`)
   *  sólo para quien administra (el trabajador no ve participaciones en
   *  Supervisar, D7). Las cuentas de ocupación usan todas (`partesVendidasDe`):
   *  una cara con un contrato de participación que corre está trabajando, la
   *  vea quien la vea. */
  const partesVisiblesDe = useCallback(
    (f: UnifiedFixture): FaceEntry[] => partesConContrato(f, estadoComercial, indicePartes, sede, isAdmin),
    [estadoComercial, indicePartes, sede, isAdmin],
  );
  /** Las caras comerciales con los contratos de sus partes pegados
   *  (`tambien`): «Cuándo se libera» cuenta una cara libre sólo si no tiene
   *  ninguna puerta tomada ese día, como el plano. */
  const carasConSusPartes = useCallback(
    (f: UnifiedFixture) => {
      const partes = partesVendidasDe(f);
      // Una cara por participación no está libre ENTERA el día que tiene algo
      // comprometido (una participación, una reserva): se vende otra
      // participación, como con una puerta vendida. De la ocupación anónima.
      const conPc = porParticipacion(f);
      if (partes.length === 0 && !conPc) return commercialFacesOf(f);
      return commercialFacesOf(f).map((c) => ({
        ...c,
        tambien: [...partes.filter((p) => p.face === c.face), ...ocupadoPorParticipacion(participacionDe(f, c.face))],
      }));
    },
    [partesVendidasDe, participacionDe],
  );
  /** Todo lo que de un mueble tiene contrato o se puede contratar: sus caras
   *  comerciales y sus partes vendidas. Es la lista de la tabla, de la plata,
   *  de los vencimientos y del montaje. Sin partes, las caras como siempre. */
  const espaciosDelMueble = useCallback(
    (f: UnifiedFixture): FaceEntry[] => {
      const partes = partesVisiblesDe(f);
      // Una reserva viva va «Reservado» (`conLaReserva`): no se monta ni vence.
      return (partes.length ? [...commercialFacesOf(f), ...partes] : commercialFacesOf(f))
        .map((e) => conLaReserva(e, estadoComercial, sede));
    },
    [partesVisiblesDe, estadoComercial, sede],
  );

  // Deselect when switching sedes: ese mueble es de la otra tienda, y un
  // contrato a medio llenar apuntaría al espacio equivocado.
  //
  // Sólo cuando la sede CAMBIÓ, no al montar: la pantalla se vuelve a montar
  // al llegar desde el Plano con «Vender», y este efecto corre DESPUÉS del
  // que arma el pedido (`pedidoVender`, más arriba) en el mismo montaje. Sin
  // la guarda borraba el contrato recién armado y Vender abría vacío.
  const sedeDelContrato = useRef(sede);
  useEffect(() => {
    if (sedeDelContrato.current === sede) return;
    sedeDelContrato.current = sede;
    setSelected(null);
    setCerrado(null);
    setEnContrato([]);
    setGrupoElegido(null);
  }, [sede]);

  /* Las dos pantallas tienen SIEMPRE un periodo puesto (`rangoVender`,
     `rangoSupervisar`, arriba). Sin periodo el plano contestaba con la otra
     escala —«qué pasa hoy», siete clases— donde `free` contra `maintenance`
     da ΔE 3.6 en deuteranopía: el mismo color para dos estados opuestos. Con
     periodo pinta la escala de tres, que es la única que la separación
     aguanta. «Hoy» sigue existiendo: es un periodo de un día, que es lo que
     de verdad es. En Vender arranca en treinta días porque «hoy» no es una
     pregunta comercial —lo que se vende es una temporada—. */


  // La lista de precios de la sede: qué familias hay, cuántas caras de cada una
  // están libres en el periodo, cuántas se liberan adentro, y a cuánto sale.
  //
  // Usa la misma `rangeAvailability` que el mapa y que la clave del plano, así
  // que los números no pueden discrepar entre sí.
  //
  // Ordenada por TARIFA, de mayor a menor. Antes iba por cantidad de caras
  // libres, y eso contestaba «de qué me sobra», que no es la pregunta: cuando
  // hay un proveedor del otro lado del teléfono lo que se busca es qué es lo
  // caro que todavía está disponible. La cantidad ya se ve en la columna de al
  // lado y no necesita mandar el orden.
  //
  // Fase 2 · I4: cada cara del periodo se mira UNA vez (`filasDelPeriodo`):
  // cómo está, qué dice si está en parte y POR QUÉ está en parte
  // (`motivoDelParcial`: se libera adentro, partes vendidas o participación).
  // La clave del plano, la columna «Libres · en parte» y el pie cuentan con
  // `contarElPeriodo`: eran tres bucles que contaban como días las caras por
  // participación y sumaban a «al cerrar» lo que nunca entra a este contrato.
  const filasDelPeriodo = useMemo(() => {
    const filas = new Map<string, CaraDelPeriodo & { como: ComoSeLibera | null }>();
    if (!mapRange) return filas;
    fixtures.forEach((f) => {
      const deParticipacion = porParticipacion(f);
      commercialFacesOf(f).forEach((face) => {
        const dispo = dispoDeCara(f, face);
        const como = dispo === "parcial" ? comoSeLibera(f, face) : null;
        filas.set(`${f.id}-${face.face}`, {
          dispo, deParticipacion, como,
          ...(dispo === "parcial" ? { motivo: motivoDelParcial(deParticipacion, como) } : {}),
        });
      });
    });
    return filas;
  }, [fixtures, mapRange, fichasPropias, dispoDeCara, comoSeLibera]);
  /** Las mismas filas COMO LAS MIRA SUPERVISAR (`comoLaVeSupervisar`): una cara
   *  vendida entera que empieza o termina adentro del periodo está tomada, no
   *  «vendida en parte». De acá salen, en Supervisar, la clave y el color del
   *  plano, la nota de «Ocupación» y las pestañas «Libres» y «Vendido en
   *  parte» de la tabla: UNA cuenta. */
  const filasSupervisar = useMemo(
    () => new Map([...filasDelPeriodo].map(([clave, fila]) => [clave, comoLaVeSupervisar(fila)] as const)),
    [filasDelPeriodo],
  );
  const dispoSupervisar = useCallback(
    (f: UnifiedFixture, face: FaceEntry): RangeAvailability =>
      filasSupervisar.get(`${f.id}-${face.face}`)?.dispo ?? dispoDeCara(f, face),
    [filasSupervisar, dispoDeCara],
  );
  const porCategoria = useMemo(() => {
    if (!mapRange) return [];
    const acum = new Map<string, {
      libres: Disponible[]; parciales: Disponible[]; total: number; tarifa: number | null;
      /** Las llaves `id-cara` de este tipo que se pueden ofrecer: las que el
       *  resaltado enciende cuando el mouse pasa por la fila. Lo tomado no
       *  entra — no es lo que se está mostrando. */
      claves: string[];
      /** Las caras de este tipo, para la cuenta de la fila (`contarElPeriodo`). */
      filas: CaraDelPeriodo[];
    }>();
    fixtures.forEach((f) => {
      const cat = rateTypeOf(f);
      const ref = referenceRateFor(referenceRates, f.sede || sede, cat);
      commercialFacesOf(f).forEach((face) => {
        const e = acum.get(cat)
          ?? { libres: [], parciales: [], total: 0, tarifa: ref, claves: [], filas: [] };
        const clave = `${f.id}-${face.face}`;
        const fila = filasDelPeriodo.get(clave);
        const a = fila ? fila.dispo : dispoDeCara(f, face);
        const enContrato = carasDelContrato.includes(clave);
        // Lo que ya entró al contrato DEJA DE ESTAR LIBRE, acá y en el pie y en
        // la clave del plano: son la misma cuenta mirada tres veces.
        if (fila) e.filas.push({ ...fila, enContrato });
        if (a === "libre") {
          // El conteo NO cuenta lo que ya entró al contrato; el resaltado SÍ lo
          // enciende: la fila dice «de este tipo, esto es lo que hay», y lo que
          // uno acaba de tomar es parte de esa respuesta —se ve en tinta.
          if (!enContrato) {
            e.libres.push({
              code: codigoVisible(face), fixture: f, face: face.face,
              ...(porParticipacion(f) ? { porParticipacion: true as const } : {}),
            });
          }
          e.claves.push(clave);
        } else if (a === "parcial") {
          const como = fila ? fila.como : comoSeLibera(f, face);
          // Libre hoy y tomada más adelante: «hasta 31 oct», como el rótulo.
          const hasta = !como?.porPartes && como?.desde
            ? ultimoDiaLibreDesdeElArranque(face, como.desde, mapRange.from, mapRange.to) : null;
          e.parciales.push({
            code: codigoVisible(face), fixture: f, face: face.face,
            ...(como?.porPartes ? { porPartes: como.porPartes } : { desde: como?.desde }),
            ...(hasta ? { hasta } : {}),
            ...(porParticipacion(f) ? { porParticipacion: true as const } : {}),
          });
          e.claves.push(clave);
        }
        e.total++;
        if (e.tarifa === null) e.tarifa = ref;
        acum.set(cat, e);
      });
    });
    return [...acum].map(([cat, { filas, ...v }]) => ({ cat, ...v, cuenta: contarElPeriodo(filas) }))
      .sort((a, b) => (b.tarifa ?? -1) - (a.tarifa ?? -1));
  }, [fixtures, mapRange, referenceRates, sede, carasDelContrato, fichasPropias, filasDelPeriodo, dispoDeCara, comoSeLibera]);

  /** La fila de la tarifa FIJADA con un clic o un toque: sus muebles quedan
   *  encendidos hasta que se vuelve a tocar la fila (o se elige otra). Las
   *  caras se rehacen con el periodo y el contrato, así que lo encendido las
   *  sigue; si el tipo deja de estar en la tabla, se suelta. Al volver a
   *  Vender el plano es otro (se montó de nuevo) y se le vuelve a pedir. */
  const [tipoFijado, setTipoFijado] = useState<string | null>(null);
  useEffect(() => {
    const fila = tipoFijado ? porCategoria.find((c) => c.cat === tipoFijado) : undefined;
    if (tipoFijado && !fila) { setTipoFijado(null); return; }
    fijadoEnPlano.current = fila ? fila.claves : null;
    destacar(null);
  }, [tipoFijado, porCategoria, destacar, modoEfectivo]);

  // ── KPI computation (per rentable face — doubles count as 2 units) ──
  // Buckets use displayStatus() so KPIs, Atención, map chips and table agree.
  const kpis = useMemo(() => {
    // Una reserva viva no es un contrato (`conLaReserva`): va «Reservado».
    const reserva = (e: FaceEntry) => conLaReserva(e, estadoComercial, sede);
    const caras = fixtures.flatMap(commercialFacesOf).map(reserva);
    // Vender por partes: las partes vendidas son contratos como cualquier
    // otro —plata, vencimientos, proveedores, bajo la tarifa— pero NO son
    // unidades nuevas: la ocupación sigue contando caras, y una cara con una
    // puerta que corre está trabajando (`estadoDeUnidad`).
    const partes = fixtures.flatMap(partesVendidasDe).map(reserva);
    // Las filas, las listas y las cuentas de contratos se hacen con lo que se
    // MUESTRA (los contratos de participación, sólo a quien administra); la
    // ocupación, con todo: una cara por participación que trabaja, trabaja.
    const visibles = isAdmin ? partes : fixtures.flatMap(partesVisiblesDe).map(reserva);
    const faces = visibles.length ? [...caras, ...visibles] : caras;
    const total = caras.length;
    // Kept separate so the strip can explain why "Espacios" is lower than the
    // number of fixtures drawn on the plan.
    const rentableFixtures = fixtures.filter(isRentable).length;
    const nonRentable = fixtures.length - rentableFixtures;
    // Every bucket comes from displayStatus(), which now reads the contract's
    // dates. That single source is what keeps the cards, the map chips and the
    // table agreeing — counting "expired" as available here while the chip of
    // the same name excluded it made the two disagree on screen.
    const ds = faces.map((x) => displayStatus(x));
    const phases = faces.map((x) => contractPhase(x));
    /** Una cara por participación que hoy no tiene lugar (reservas que la
     *  llenan) no está libre aunque nada la haga trabajar todavía. */
    const sinLugarHoy = (c: FaceEntry) => {
      const par = participacionDe(c.fixture, c.face);
      return !!par && dispoDeParticipacion(c.fixture, par, par.hoy, par.hoy)?.dispo === "tomado";
    };
    const porUnidad = caras.map((c) => estadoDeUnidad(
      c, partes.filter((p) => p.fixture.id === c.fixture.id && p.face === c.face), sinLugarHoy(c)));
    const occupied  = porUnidad.filter((s) => s === "active" || s === "expiring").length;
    const committed = porUnidad.filter((s) => s === "committed").length;
    const free      = porUnidad.filter((s) => s === "free").length;
    /** Las partes que se ofrecen y cuántas corren o están firmadas: «Puertas
     *  vendidas: 2 de 9», «Tramos vendidos: 1 de 6»; con varias clases en la
     *  sede, «Partes vendidas». Cero y cero si nadie vende por partes. */
    const divisionesDe = (f: UnifiedFixture) => partesDe(f).filter((p) => esDivision(p.parte));
    const partesOfrecidas = fixtures.filter(isRentable).reduce((t, f) => t + divisionesDe(f).length, 0);
    const clasesOfrecidas = new Set(fixtures.filter(isRentable).flatMap((f) => divisionesDe(f).map((p) => p.parte.clase)));
    const unaClase = clasesOfrecidas.size === 1 ? [...clasesOfrecidas][0] : null;
    const rotuloPartes = unaClase && claseDe(unaClase)
      ? `${claseDe(unaClase)!.plural.charAt(0).toUpperCase()}${claseDe(unaClase)!.plural.slice(1)} vendid${concordancia(unaClase).o}s`
      : "Partes vendidas";
    const corre = (p: FaceEntry) => {
      const d = displayStatus(p);
      return d === "active" || d === "expiring" || d === "committed";
    };
    const partesVendidas = partes.filter((p) => esDivision(p.parte) && corre(p)).length;
    /** Los contratos que corren o están firmados: uno por espacio, la cara
     *  entera o cada parte. Decía «ocupadas + firmadas», que son CARAS: con
     *  tres puertas de una nevera vendidas a tres proveedores, «1 contrato».
     *  Sin partes vendidas es la misma cuenta de siempre. */
    const contratos = faces.filter(corre).length;
    /** Las piezas (las bahías de las cajas, los forros de las columnas): no
     *  son caras ni cuentan en la ocupación, pero se dice cuántas corren de
     *  las que se ofrecen: «Bahías de impulso: 5 de 16». */
    const piezasOfrecidas = new Map<string, number>();
    for (const f of fixtures) for (const p of piezasDe(f)) piezasOfrecidas.set(p.clase, (piezasOfrecidas.get(p.clase) ?? 0) + 1);
    const piezasVendidas = [...piezasOfrecidas].map(([clase, de]) => {
      const c = claseDe(clase)!;
      const n = partes.filter((p) => p.parte?.clase === clase && corre(p)).length;
      return `${c.plural.charAt(0).toUpperCase()}${c.plural.slice(1)}: ${n} de ${de}`;
    });
    // reserved + maintenance + expired + occupied-without-dates. Kept as the
    // remainder so Libres + Ocupados + Contratados never overstate the total.
    const held = total - occupied - committed - free;
    const occPct = total ? Math.round((occupied / total) * 100) : 0;
    // Money actually being earned this month — a signed contract that has not
    // started yet is not revenue, and counting it overstated the monthly income.
    const revenue = faces
      .filter((_, i) => phases[i] === "vigente")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);
    const committedRevenue = faces
      .filter((_, i) => phases[i] === "pendiente")
      .reduce((s, x) => s + (x.negotiatedValue ?? 0), 0);

    const expired: ContractEntry[] = [];
    const expiring: ContractEntry[] = [];
    const noContract: FaceEntry[] = [];
    /** «Marcado reservado a mano» (rediseño, PR 3, decisión 1): «Reservado»
     *  sin proveedor ni fecha, del selector de antes. Una reserva de Vender
     *  llega con la marca `reservado` (`conLaReserva`) y no cae acá. Ya no se
     *  puede marcar así (`PATCH /spaces/{id}/status` contesta 409): los que
     *  quedaron se liberan o se reservan de verdad desde Corregir. */
    const reservadoAMano: FaceEntry[] = [];
    faces.forEach((x, i) => {
      if (ds[i] === "expired") expired.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds[i] === "expiring") expiring.push({ ...x, days: daysUntil(x.endDate) });
      else if (ds[i] === "no_contract") noContract.push(x);
      else if (ds[i] === "reserved" && !x.reservado) reservadoAMano.push(x);
    });
    expired.sort((a, b) => a.days - b.days);
    expiring.sort((a, b) => a.days - b.days);

    // Top suppliers — by what they are paying NOW, so the ranking matches the
    // monthly revenue figure above instead of mixing in future commitments.
    const supplierMap: Record<string, { revenue: number; count: number }> = {};
    faces.forEach((x, i) => {
      if (!x.supplierName || !x.negotiatedValue || phases[i] !== "vigente") return;
      if (!supplierMap[x.supplierName]) supplierMap[x.supplierName] = { revenue: 0, count: 0 };
      supplierMap[x.supplierName].revenue += x.negotiatedValue;
      supplierMap[x.supplierName].count++;
    });
    const topSuppliers = Object.entries(supplierMap)
      .map(([name, { revenue: r, count }]) => ({ name, revenue: r, count }))
      .sort((a, b) => b.revenue - a.revenue)
      // Diez y no seis: el panel contesta «de quién depende la sede», y con
      // un corte en seis un proveedor que pone el 8% quedaba afuera sin que
      // nada dijera que había más. Lo que no entra en el alto, scrollea.
      .slice(0, 10);

    // Contracts paying below the reference rate for their type + sede.
    // Only meaningful gaps (≥1%) — a peso of rounding is not an anomaly.
    // Workers hold no rates, so for them this list is always empty.
    // Includes contracts already signed for a future period: catching an
    // under-priced deal before it starts is the only moment it can still be
    // renegotiated.
    // La tarifa es AL MES y el contrato guarda su TOTAL: se compara lo que el
    // contrato paga al mes (`bajoLaTarifa`), que es lo que dice la fila.
    const belowReference: (FaceEntry & { ref: number; gapPct: number; alMes: number })[] = [];
    faces.forEach((x, i) => {
      if ((phases[i] !== "vigente" && phases[i] !== "pendiente") || !(x.negotiatedValue > 0)) return;
      // La de una puerta es la de su clase o la de la nevera ÷ puertas.
      const ref = tarifaDeLaFila(referenceRates, sede, x).valor;
      if (ref === null) return;
      const bajo = bajoLaTarifa(x.negotiatedValue, x.startDate, x.endDate, ref);
      if (bajo) belowReference.push({ ...x, ref, gapPct: bajo.brechaPct, alMes: bajo.alMes });
    });
    belowReference.sort((a, b) => b.gapPct - a.gapPct);

    return {
      total, occupied, committed, free, held, occPct, revenue, committedRevenue,
      rentableFixtures, nonRentable,
      expired, expiring, noContract, reservadoAMano,
      topSuppliers, belowReference,
      /** Los contratos que corren hoy con valor: la plata de la franja y de
       *  «Quién paga» sale de acá, en la unidad que se elija. */
      vigentes: faces.filter((x, i) => phases[i] === "vigente" && x.negotiatedValue > 0),
      partesOfrecidas, partesVendidas, rotuloPartes, piezasVendidas, contratos,
      /** Cada cara con su estado de hoy (`estadoDeUnidad`): la misma cuenta
       *  de la ocupación, para el Resumen y el «Por qué» de Indicadores. */
      unidades: caras.map((c, i) => ({ cara: c, estado: porUnidad[i] })),
      /** Todas las filas (caras y partes) con su fase: vigente, pendiente
       *  (firmado y por empezar)… Las usan los vencimientos a 90 días y los
       *  montajes del mes de Indicadores, también para quien no ve plata. */
      todas: faces.map((x, i) => ({ entry: x, fase: phases[i] })),
      /** Las filas de la tabla: las caras y las partes vendidas. */
      filas: faces.length,
    };
  }, [fixtures, referenceRates, sede, fichasPropias, partesVendidasDe, partesVisiblesDe, isAdmin, participacionDe, estadoComercial]);

  // How much of the sede can actually be sold for the chosen period. Counted
  // per face, like every other total on this page. Fase 2 · I4: la misma
  // cuenta que la tarifa (`contarElPeriodo`), con el ámbar separado por motivo.
  const rangeTally = useMemo(() => contarElPeriodo(filasSupervisar.values()), [filasSupervisar]);

  /** El mismo recuento, DESCONTANDO lo que ya entró al contrato que se está
   *  armando. Es el que ve la clave del plano y el pie de la tarifa en Vender:
   *  un espacio que uno acaba de meter al contrato no se le puede seguir
   *  ofreciendo al proveedor como libre. Supervisar sigue viendo el crudo, que
   *  es de lo que ese tablero habla.
   *
   *  Lo que está en el contrato no es libre NI tomado: se cuenta aparte, en el
   *  quinto estado de la clave (`enContrato`). Sumarlo a «tomado» hacía que
   *  meter un espacio al contrato subiera el contador de lo que no se puede
   *  vender, que es lo contrario de lo que acaba de pasar. */
  const tallyVender = useMemo(
    () => contarElPeriodo([...filasDelPeriodo].map(([clave, fila]) => ({ ...fila, enContrato: carasDelContrato.includes(clave) }))),
    [filasDelPeriodo, carasDelContrato],
  );

  // ── Montaje: lo que hay que mirar ────────────────────────────────────────
  //
  // Dos listas distintas porque piden dos cosas distintas. "No se pudo" es un
  // problema que alguien tiene que resolver hoy —el proveedor no entregó, el
  // espacio está ocupado por otra cosa— y trae su motivo. "Sin montar" es
  // silencio: el contrato ya arrancó, se está cobrando, y nadie dijo nada.
  const montaje = useMemo(() => {
    const noMontado: (FaceEntry & { reporte: MountConfirmation })[] = [];
    const sinMontar: (FaceEntry & { dias: number })[] = [];
    /** Los que arrancaron hace más de la ventana y nunca se reportaron: antes
     *  una nota que no contaba; ahora una sección de «Corregir». */
    const viejos: (FaceEntry & { dias: number })[] = [];
    // Con las partes vendidas: una puerta se monta como cualquier espacio.
    fixtures.flatMap(espaciosDelMueble).forEach((entry) => {
      const fase = contractPhase(entry);
      // Lo vencido ya no se monta y lo libre no tiene qué montar.
      if (fase !== "vigente" && fase !== "pendiente") return;
      const reporte = montajeDe(entry);
      if (reporte && reporte.estado === "no_montado") {
        noMontado.push({ ...entry, reporte });
        return;
      }
      if (reporte) return; // montado
      // Solo lo que YA arrancó: un contrato que empieza en tres semanas no
      // está sin montar, está esperando.
      if (fase !== "vigente") return;
      const dias = Math.max(0, -daysUntil(entry.startDate));
      // Un contrato que arrancó hace meses y sigue corriendo se montó hace
      // meses: lo que falta es el reporte, no la exhibición. Nadie va a ir a
      // fotografiarlo ahora. Mezclarlos con los de esta semana enterraría lo
      // accionable — en NAVE hay contratos de enero, de antes de que el
      // montaje existiera. No se descartan en silencio: se cuentan aparte.
      if (dias > VENTANA_MONTAJE_DIAS) {
        viejos.push({ ...entry, dias });
        return;
      }
      sinMontar.push({ ...entry, dias });
    });
    noMontado.sort((a, b) =>
      (b.reporte.confirmado_en ?? "").localeCompare(a.reporte.confirmado_en ?? ""));
    sinMontar.sort((a, b) => b.dias - a.dias);
    viejos.sort((a, b) => b.dias - a.dias);
    return { noMontado, sinMontar, viejos };
  }, [fixtures, montajeDe, espaciosDelMueble]);


  // ─── Lo que la franja de Supervisar necesita saber ──────────────────────

  /** La tarifa de referencia de una cara. Es lo que se pediría por ella, no lo
   *  que se cobra: para una cara libre es el único precio que existe. */
  const tarifaDe = useCallback(
    (e: FaceEntry): number | null =>
      // Una puerta: la de su clase o la de la nevera ÷ puertas (`tarifaDeLaFila`).
      tarifaDeLaFila(referenceRates, sede, e).valor,
    [referenceRates, sede, fichasPropias],
  );

  /** Lo que la sede NO está cobrando: las caras libres hoy, valoradas a tarifa.
   *
   *  Es la cifra que faltaba. «Ocupación 35%» dice que sobra sala; «$8.730.000
   *  al mes sin alquilar» dice cuánto vale esa sala, y ése es el número con el
   *  que se decide si vale la pena salir a buscar proveedores.
   *
   *  La tasa diaria divide por 30 y no por los días del periodo elegido: la
   *  tarifa está expresada al mes, así que su valor por día es tarifa/30 mire
   *  uno una ventana de siete días o de tres meses. Es la misma cuenta que usa
   *  el resto de la pantalla para prorratear.
   *
   *  Las caras cuyo tipo no tiene tarifa cargada se cuentan aparte y se dicen:
   *  sin eso el total parece chico y nadie sabe por qué. */
  const sinAlquilar = useMemo(() => {
    let plata = 0, caras = 0, sinTarifa = 0;
    fixtures.forEach((f) => {
      const vendidas = partesVendidasDe(f);
      commercialFacesOf(f).forEach((face) => {
        if (displayStatus(face) !== "free") return;
        const suyas = vendidas.filter((p) => p.face === face.face);
        if (suyas.length === 0) {
          caras++;
          const ref = tarifaDe(face);
          if (ref) plata += ref; else sinTarifa++;
          return;
        }
        // Vendida por partes: lo que falta alquilar son las puertas libres, a
        // la tarifa de cada una. La cara no cuenta como libre: ya trabaja.
        for (const { parte } of partesDe(f).filter((p) => p.cara === face.face && esDivision(p.parte))) {
          if (suyas.some((p) => p.parte && sufijoDeParte(p.parte) === sufijoDeParte(parte))) continue;
          const ref = tarifaDe({ ...face, parte });
          if (ref) plata += ref; else sinTarifa++;
        }
      });
      // Las piezas libres (la bahía de una caja, el forro de una columna), a
      // la tarifa de su clase: también son plata que la sede no cobra.
      const piezas = piezasDe(f);
      if (piezas.length) {
        const caraA = facesOf(f)[0];
        for (const parte of piezas) {
          if (vendidas.some((p) => p.parte && sufijoDeParte(p.parte) === sufijoDeParte(parte))) continue;
          const ref = tarifaDe({ ...caraA, parte });
          if (ref) plata += ref; else sinTarifa++;
        }
      }
    });
    return { plata, caras, sinTarifa, porDia: Math.round(plata / 30) };
  }, [fixtures, tarifaDe, partesVendidasDe]);

  // ─── La plata de Supervisar, en UNA unidad (rediseño, PR 2) ──────────────
  //
  // Lo guardado es el total del contrato. «Al mes» lo reparte en los meses de
  // cada contrato (`utils/meses.ts`, la gemela del servidor) y «Total» lo deja
  // como está. Un contrato por % de las ventas suma lo cargado en sus cortes.
  // Sólo quien administra: para el trabajador esto no existe.

  /** Los contratos que se cobran por ventas, por su código completo. */
  const cobroPorCodigo = useMemo(
    () => new Map(cortesSinCargar.cobros.map((c) => [c.espacio.toUpperCase(), c])),
    [cortesSinCargar.cobros],
  );
  const cobroDeCodigo = useCallback((codigo: string) => cobroPorCodigo.get(codigo.toUpperCase()), [cobroPorCodigo]);
  const cobroDeFila = useCallback(
    (e: FaceEntry) => cobroPorCodigo.get(fullSpaceCode(e.fixture.sede || sede, e.code).toUpperCase()),
    [cobroPorCodigo, sede],
  );
  /** Las reservas vivas, por su código completo (la ficha las confirma). */
  const reservaPorCodigo = useMemo(
    () => new Map(reservasSinConfirmar.vivas.map((r) => [r.espacio.toUpperCase(), r])),
    [reservasSinConfirmar.vivas],
  );
  const reservaDeCodigo = useCallback((codigo: string) => reservaPorCodigo.get(codigo.toUpperCase()), [reservaPorCodigo]);
  /** El montaje de un contrato por su código completo (las participaciones). */
  const montajeDelCodigo = useCallback(
    (codigo: string, desde: string) => reporteDelContrato(reportesDeMontaje, codigo, desde),
    [reportesDeMontaje],
  );

  /** El periodo que se mira, en días ISO: la tarifa de lo libre en «Total». */
  const periodoIso = useMemo(
    () => (mapRange ? { desde: toISODate(mapRange.from), hasta: toISODate(mapRange.to) } : null),
    [mapRange],
  );

  const plata = useMemo(() => {
    if (!isAdmin) return null;
    const hoyIso = toISODate(new Date());
    const en = (x: FaceEntry) => enLaUnidad(x.negotiatedValue, x.startDate, x.endDate, unidad);
    // Los que se cobran por ventas y corren hoy: lo cargado en sus cortes.
    const porVentas = cortesSinCargar.cobros.filter((c) => c.desde <= hoyIso && hoyIso <= c.hasta);
    let canon = 0;
    for (const x of kpis.vigentes) canon += en(x);
    let cargado = 0;
    for (const c of porVentas) {
      canon += enLaUnidad(c.cobrado, c.desde, c.hasta, unidad);
      cargado += c.cobrado;
    }
    let vence = 0;
    for (const x of kpis.expiring) vence += en(x);
    // Lo libre, a tarifa: la tarifa es al mes; en «Total», por el periodo.
    const sinAlquilarEn = periodoIso
      ? tarifaEnLaUnidad(sinAlquilar.plata, periodoIso.desde, periodoIso.hasta, unidad) : sinAlquilar.plata;
    // De quién depende el canon, con la misma cuenta.
    const venciendo = new Set(kpis.expiring.map((e) => e.supplierName).filter(Boolean));
    const por = new Map<string, number>();
    for (const x of kpis.vigentes) if (x.supplierName) por.set(x.supplierName, (por.get(x.supplierName) ?? 0) + en(x));
    for (const c of porVentas) {
      const monto = enLaUnidad(c.cobrado, c.desde, c.hasta, unidad);
      if (c.proveedor && monto > 0) por.set(c.proveedor, (por.get(c.proveedor) ?? 0) + monto);
    }
    const total = canon || 1;
    const maximo = Math.max(1, ...por.values());
    const quienes = [...por].map(([name, revenue]) => ({
      name, revenue,
      pct: Math.round((revenue / total) * 100),
      barra: (revenue / maximo) * 100,
      vence: venciendo.has(name),
      porVentas: porVentas.some((c) => c.proveedor === name && c.cobrado > 0),
    }));
    quienes.sort(ordenQuienPaga === "nombre"
      ? (a, b) => a.name.localeCompare(b.name, "es")
      : (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "es"));
    return {
      canon, cargado, porVentas: porVentas.length,
      vence, vencePct: canon ? Math.round((vence * 100) / canon) : 0,
      sinAlquilar: sinAlquilarEn,
      quienes,
    };
  }, [isAdmin, unidad, kpis, cortesSinCargar.cobros, sinAlquilar, periodoIso, ordenQuienPaga]);

  /** Las caras contratadas y sin reportar, para que el chip «Sin montar» de la
   *  tabla filtre exactamente la misma lista que muestran los pendientes. */
  const sinMontarSet = useMemo(
    () => new Set(montaje.sinMontar.map((e) => claveDeFila(e))),
    [montaje.sinMontar],
  );

  /** Las temporadas comerciales que pisan el periodo, para el fondo del riel. */
  const temporadasDelPeriodo = useMemo(() => {
    if (!mapRange) return [];
    return upcomingSeasons(new Date(), seasonWindows).filter(
      (t) => t.from <= mapRange.to && t.to >= mapRange.from,
    );
  }, [mapRange, seasonWindows]);

  // ─── «Para revisar» en tres grupos (rediseño, PR 2) ─────────────────────
  //
  // Cada aviso de cada sección es UNA fila de `avisos`: de ahí salen la cuenta
  // de cada pestaña, la pastilla roja (la suma de las tres) y las chinchetas
  // del plano. Una sección que se dibuja y no está acá no se contaría: por eso
  // las secciones de la lista leen las MISMAS listas que se cuentan.

  /** El mueble de un espacio de la sede, por su código completo. */
  const muebleDelEspacio = useCallback((espacio: string): { fixture: UnifiedFixture; cara: "A" | "B" } | null => {
    const pre = `${sede.toUpperCase()}-`;
    const corto = espacio.toUpperCase().startsWith(pre) ? espacio.slice(pre.length) : espacio;
    const p = partirCodigo(corto);
    const f = fixtures.find((x) => (x.code || "").trim().toUpperCase() === p.base);
    return f ? { fixture: f, cara: p.cara } : null;
  }, [fixtures, sede]);

  /** Las reservas de espacio que caducan hoy (Hoy) y las demás (30 días). */
  const reservasPorGrupo = useMemo(() => {
    const hoyIso = toISODate(new Date());
    return {
      hoy: reservasSinConfirmar.vivas.filter((r) => r.caduca <= hoyIso),
      dias30: reservasSinConfirmar.vivas.filter((r) => r.caduca > hoyIso),
    };
  }, [reservasSinConfirmar.vivas]);
  /** Lo que falta de planometría, en «Hoy» con 7 días o menos para empezar. */
  const planometriaPorGrupo = useMemo(() => ({
    hoy: faltaPlanometria.filas.filter((f) => grupoDelAviso("falta_planometria", f.dias_para_empezar) === "hoy"),
    dias30: faltaPlanometria.filas.filter((f) => grupoDelAviso("falta_planometria", f.dias_para_empezar) === "dias30"),
  }), [faltaPlanometria.filas]);
  /** Las tarjetas de las participaciones, repartidas en los tres grupos. */
  const participacionesPorGrupo = useMemo(() => ({
    hoy: deParticipacionesEn(revisionPc.secciones, "hoy"),
    dias30: deParticipacionesEn(revisionPc.secciones, "dias30"),
    corregir: deParticipacionesEn(revisionPc.secciones, "corregir"),
  }), [revisionPc.secciones]);

  const avisos = useMemo((): Aviso[] => {
    const a: Aviso[] = [];
    const de = (e: FaceEntry) => ({ fixtureId: e.fixture.id, cara: e.face });
    // Para todos (el trabajador ve estas, sin plata).
    for (const e of kpis.expired) a.push({ seccion: "vencidos", clave: `v-${claveDeFila(e)}`, ...de(e) });
    for (const e of kpis.expiring) a.push({ seccion: "por_vencer", clave: `pv-${claveDeFila(e)}`, ...de(e) });
    for (const e of kpis.noContract) a.push({ seccion: "ocupado_sin_contrato", clave: `nc-${claveDeFila(e)}`, ...de(e) });
    // Sin plata ni proveedor (no tiene ninguno): el trabajador ya lo ve en su
    // mapa, como «Ocupado sin contrato». Las acciones son de administración.
    for (const e of kpis.reservadoAMano) a.push({ seccion: "reservado_a_mano", clave: `ra-${claveDeFila(e)}`, ...de(e) });
    // Los fantasmas cuentan para TODAS las sedes, no sólo la abierta: un
    // contrato sin mueble no se ve en ningún plano, así que si sólo contara en
    // la suya no se vería nunca. Es lo único de esta lista que cruza tiendas.
    for (const f of fantasmas) a.push({ seccion: "contrato_sin_mueble", clave: `fa-${f.espacio}` });
    // Los planogramas (fase 4): también para el equipo, si puede publicar esa cara.
    for (const c of planogramasPorRevisar.filas) {
      a.push({ seccion: SECCION_DE_SUPERVISION[c.estado], clave: claveDeSupervision(c), fixtureId: c.fixture_id, cara: c.cara });
    }
    if (!isAdmin) return a;
    // Sólo quien administra: llevan proveedores, plata o participaciones.
    for (const c of cortesSinCargar.pendientes) {
      const k = `${c.lease_id}|${c.periodo_desde}`;
      if (k in cortesSinCargar.cargados) continue;
      const m = muebleDelEspacio(c.espacio);
      a.push({ seccion: "ventas_por_cargar", clave: `corte:${k}`, fixtureId: m?.fixture.id, cara: m?.cara });
    }
    for (const sec of revisionPc.secciones) {
      for (const it of sec.items) {
        a.push({
          seccion: SECCION_DE_PARTICIPACIONES[sec.tipo], clave: `pc:${it.clave}`, dias: diasDelRenglon(it),
          fixtureId: it.abrir?.fixtureId ?? null, cara: it.abrir?.cara,
        });
      }
    }
    for (const f of faltaPlanometria.filas) {
      const m = muebleDelEspacio(f.espacio);
      a.push({ seccion: "falta_planometria", clave: `pl:${f.lease_id}`, dias: f.dias_para_empezar, fixtureId: m?.fixture.id, cara: m?.cara });
    }
    for (const e of montaje.noMontado) a.push({ seccion: "no_se_pudo_montar", clave: `nm-${claveDeFila(e)}`, ...de(e) });
    for (const e of montaje.sinMontar) a.push({ seccion: "sin_montar", clave: `sm-${claveDeFila(e)}`, ...de(e) });
    for (const e of montaje.viejos) a.push({ seccion: "montajes_viejos", clave: `mv-${claveDeFila(e)}`, ...de(e) });
    for (const r of reservasSinConfirmar.vivas) {
      const m = muebleDelEspacio(r.espacio);
      a.push({ seccion: "reservas", clave: `res:${r.id}`, dias: daysUntil(r.caduca), fixtureId: m?.fixture.id, cara: m?.cara });
    }
    for (const e of kpis.belowReference) a.push({ seccion: "bajo_tarifa", clave: `bt-${claveDeFila(e)}`, ...de(e) });
    // Los contratos de antes sin forma de precio: UNA tarea, aunque sean muchos.
    for (const _c of precioSinForma.unoSiHay) a.push({ seccion: "precio_sin_forma", clave: "precio-sin-forma" });
    // Lo que sólo vive en el plano: cada contrato que falta pasar (o completar).
    if (importacion) {
      for (const x of [...importacion.importables, ...importacion.incompletos]) {
        a.push({ seccion: "solo_en_el_plano", clave: `ip-${x.sede}-${x.code}` });
      }
    }
    return a;
  }, [kpis, fantasmas, isAdmin, cortesSinCargar.pendientes, cortesSinCargar.cargados, revisionPc.secciones,
    faltaPlanometria.filas, montaje, reservasSinConfirmar.vivas, importacion, muebleDelEspacio, planogramasPorRevisar.filas,
    precioSinForma.unoSiHay]);

  /** Cuántos avisos tiene cada grupo, y la pastilla roja: la suma de los tres. */
  const cuentasDeRevision = useMemo(() => contarPorGrupo(avisos), [avisos]);
  const attentionCount = cuentaDelBadge(cuentasDeRevision);
  /** La cuenta viaja al armazón: la pastilla roja del botón «Pendientes» de
   *  la barra de arriba (era la de la pestaña «Supervisar»). En Vender no se
   *  cuenta: mezcla vencimientos, bajo tarifa, reservas y cortes de ventas, y
   *  la pantalla la mira el proveedor. */
  const cuentaParaElMenu = modoEfectivo === "supervisar" ? attentionCount : 0;
  useEffect(() => {
    useArmazon.getState().setCuentaPendientes(cuentaParaElMenu);
  }, [cuentaParaElMenu]);
  const grupoDeRevision: GrupoDeRevision = grupoElegido ?? grupoParaAbrir(cuentasDeRevision);

  /** Al primer ingreso del día, si hay algo con fecha límite hoy, la bandeja
   *  se abre sola (rediseño UX 2026-10). Se recuerda por quien mira, en este
   *  navegador: es una comodidad, no un dato. */
  useEffect(() => {
    if (!inicio || cuentasDeRevision.hoy === 0) return;
    const hoyIso = toISODate(new Date());
    const LLAVE = "recabra-pendientes-del-dia";
    try {
      if (window.localStorage.getItem(LLAVE) === hoyIso) return;
      window.localStorage.setItem(LLAVE, hoyIso);
    } catch { return; /* sin almacenamiento no se abre sola: mejor eso que abrirla siempre */ }
    useArmazon.getState().abrirBandeja("hoy");
  }, [inicio, cuentasDeRevision.hoy]);

  /** El canon del mes del Inicio: los contratos vigentes, cada uno en sus
   *  meses, y lo cargado de los que se cobran por % de las ventas. Es la cuenta
   *  de «Canon vigente» con la plata «Al mes», sin importar qué unidad eligió
   *  quien mira la franja. */
  const canonDelMes = useMemo(() => {
    if (!isAdmin) return null;
    const hoyIso = toISODate(new Date());
    let total = 0;
    for (const x of kpis.vigentes) total += enLaUnidad(x.negotiatedValue, x.startDate, x.endDate, "mes");
    for (const c of cortesSinCargar.cobros) {
      if (c.desde <= hoyIso && hoyIso <= c.hasta) total += enLaUnidad(c.cobrado, c.desde, c.hasta, "mes");
    }
    return total;
  }, [isAdmin, kpis.vigentes, cortesSinCargar.cobros]);

  /** Los puntos del plano («aire y pines»): uno por mueble con algo en «Para
   *  revisar», del color de su grupo más urgente (`puntosDelPlano`, que sale
   *  de `chinchetasDe`). Nada que no esté en `avisos`. */
  const chinchetasDeRevision = useMemo(
    () => puntosDelPlano(avisos).map((c) => ({ ...c, titulo: `Para revisar · ${tituloDeSeccion(c.seccion, c.grupo)}` })),
    [avisos],
  );
  /** Al abrir, el plano NO los muestra: «Para revisar N» de la clave los prende
   *  y los apaga, y se recuerda por persona (en el store persistido, como las
   *  cámaras). */
  const pendientesEnElPlano = useFixtureStore((s) => s.pendientesEnElPlano);
  const setPendientesEnElPlano = useFixtureStore((s) => s.setPendientesEnElPlano);
  /** Pasar el mouse —o el foco del teclado— por un renglón de «Para revisar»
   *  SEÑALA su mueble en el plano (el piso punteado y un punto con anillo); al
   *  salir del renglón, el plano vuelve a como estaba. La lista no sabe de qué
   *  mueble habla cada fila: lo dice su aviso (`data-aviso` → `avisos`), así
   *  que vale para todas las secciones sin tocar ninguna. Tocar el renglón
   *  sigue haciendo lo de siempre; con el dedo no hay mouse que pase. */
  const senalarEnElPlano = useRef<((foco: FocoDelPlano | null) => void) | null>(null);
  const avisosPorClave = useMemo(() => avisoPorClave(avisos), [avisos]);
  const filaSenalada = useRef<string | null>(null);
  /** El renglón que está señalando: se marca a mano (`data-senalada` con el
   *  grupo del aviso, que le da el tono y la mira), sin volver a pintar la
   *  lista, igual que el plano. */
  const filaSenaladaEl = useRef<HTMLElement | null>(null);
  const senalarFila = useCallback((objetivo: EventTarget | null) => {
    const fila = objetivo instanceof Element ? objetivo.closest<HTMLElement>("[data-aviso]") : null;
    const clave = fila?.dataset.aviso ?? null;
    if (clave === filaSenalada.current) return;
    filaSenalada.current = clave;
    const a = clave ? avisosPorClave.get(clave) : undefined;
    filaSenaladaEl.current?.removeAttribute("data-senalada");
    filaSenaladaEl.current = null;
    if (fila && a?.fixtureId) {
      fila.dataset.senalada = a.grupo;
      filaSenaladaEl.current = fila;
    }
    senalarEnElPlano.current?.(a?.fixtureId ? { fixtureId: a.fixtureId, cara: a.cara ?? "A", grupo: a.grupo } : null);
  }, [avisosPorClave]);
  /** Tocar un renglón abre la ficha en el lugar de la lista: la lista se va
   *  sin que el mouse «salga» de nada, y el plano vuelve a como estaba. */
  const listaALaVista = !(selected && detailFull);
  useEffect(() => { if (!listaALaVista) senalarFila(null); }, [listaALaVista, senalarFila]);
  /** Tocar una chincheta lleva a su aviso: «Para revisar» en su grupo, con la
   *  fila a la vista y marcada un momento. */
  const irAlAviso = useCallback((c: Chincheta) => {
    setSelected(null);
    setDetailFull(false);
    setAnchor(null);
    setGrupoElegido(c.grupo);
    setAvisoMarcado(c.clave);
  }, []);
  useEffect(() => {
    if (!avisoMarcado) return;
    const el = document.querySelector<HTMLElement>(`[data-aviso="${CSS.escape(avisoMarcado)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el?.setAttribute("data-marcada", "1");
    const t = window.setTimeout(() => { el?.removeAttribute("data-marcada"); setAvisoMarcado(null); }, 2400);
    return () => window.clearTimeout(t);
  }, [avisoMarcado]);

  /** Se vino de Montajes («Ubicar la zona», «Adjuntar planometría»): la fila
   *  de ese contrato en Pendientes —su grupo abierto, a la vista y marcada—.
   *  La participación (`-PC1`) se busca por su cara: «Falta distribuir» es de
   *  la cara entera. */
  const desdeMontaje = useArmazon((s) => s.desdeMontaje);
  const avisoDelMontaje = useMemo(() => {
    if (!desdeMontaje) return null;
    const m = muebleDelEspacio(desdeMontaje.codigo.replace(/-PC\d+$/i, ""));
    if (!m) return null;
    const deLaCara = avisos.filter((a) => a.fixtureId === m.fixture.id && (a.cara ?? "A") === m.cara);
    return (desdeMontaje.estado === "falta_planometria"
      ? deLaCara.find((a) => a.seccion === "falta_planometria")
      : deLaCara.find((a) => a.clave.startsWith("pc:"))) ?? null;
  }, [desdeMontaje, avisos, muebleDelEspacio]);
  useEffect(() => {
    if (!bandejaAbierta || !avisoDelMontaje) return;
    setGrupoElegido(grupoDelAviso(avisoDelMontaje.seccion, avisoDelMontaje.dias));
    const t = window.setTimeout(() => {
      document.querySelectorAll("[data-desde-montaje]").forEach((e) => e.removeAttribute("data-desde-montaje"));
      const el = document.querySelector<HTMLElement>(`[data-aviso="${CSS.escape(avisoDelMontaje.clave)}"]`);
      el?.setAttribute("data-desde-montaje", "1");
      el?.scrollIntoView({ block: "center" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [bandejaAbierta, avisoDelMontaje]);

  /** «Cargar planometría»: la ficha del espacio, con la planometría de ese
   *  contrato arriba. */
  const cargarPlanometria = (f: MontajePendiente, rotulo: string) => {
    const m = muebleDelEspacio(f.espacio);
    if (!m) return;
    revisar(m.fixture, m.cara);
    // Con el contrato de la fila: el que la espera puede arrancar más adelante
    // y no ser el que corre hoy (`active_lease`).
    setPlanometriaPedida({ codigo: f.espacio.toUpperCase(), leaseId: f.lease_id, rotulo });
  };

  /** Las caras vendidas en parte en el periodo (con partes vendidas o por
   *  participación con algo comprometido; NO una vendida entera que empieza o
   *  termina adentro): la pestaña de la tabla y su pastilla. La misma cuenta
   *  que «Vendido en parte» de la clave del plano y la nota de «Ocupación»
   *  (`filasSupervisar`). */
  const enParteSet = useMemo(
    () => new Set([...filasSupervisar].filter(([, f]) => f.dispo === "parcial").map(([k]) => k)),
    [filasSupervisar],
  );
  /** Las caras libres en el periodo: nada tomado, ni una parte ni una
   *  participación. La pestaña «Libres» (su cuenta y sus filas) y «Libre» de
   *  la clave del plano. */
  const libresSet = useMemo(
    () => new Set([...filasSupervisar].filter(([, f]) => f.dispo === "libre").map(([k]) => k)),
    [filasSupervisar],
  );

  // ── Map search / status filter (per rentable face) ──
  // Después de las cuentas del periodo: «Libres» y «Vendido en parte»
  // encienden en el plano lo mismo que muestra la tabla.
  const mapMatch = useMemo<MapMatch | null>(() => {
    const q = normalizeText(mapQuery.trim());
    if (!q && mapFilter === "todos") return null;
    const faceFlags = new Map<string, boolean[]>();
    let count = 0;
    fixtures.forEach((f) => {
      // Una cara se enciende si ella o alguna de sus partes vendidas contesta
      // (buscar al proveedor de la puerta 2 tiene que encontrar su nevera).
      const partes = partesVisiblesDe(f);
      const flags = commercialFacesOf(f).map((entry) => {
        const contesta = (e: FaceEntry) => (!q || faceMatchesQuery(e, q, nombresPropios))
          && faceMatchesFilter(e, mapFilter, sinMontarSet, enParteSet, libresSet);
        const deLasPartes = partes.filter((p) => p.face === entry.face && contesta(p)).length;
        const ok = contesta(entry) || deLasPartes > 0;
        if (ok) count += Math.max(1, deLasPartes);
        return ok;
      });
      faceFlags.set(f.id, flags);
    });
    return { faceFlags, count };
  }, [fixtures, mapQuery, mapFilter, fichasPropias, nombresPropios, partesVisiblesDe, sinMontarSet, enParteSet, libresSet]);

  /** Cuántas filas deja ver la tabla con el filtro y el chip puestos: la misma
   *  cuenta que hace `SpacesTable`, para decir «12 de 68» en el encabezado. */
  const visiblesEnTabla = useMemo(() => {
    const q = normalizeText(mapQuery.trim());
    return fixtures.flatMap(espaciosDelMueble)
      .filter((e) => (!q || faceMatchesQuery(e, q, nombresPropios)) && faceMatchesFilter(e, mapFilter, sinMontarSet, enParteSet, libresSet))
      .length;
  }, [fixtures, mapQuery, mapFilter, sinMontarSet, enParteSet, libresSet, fichasPropias, nombresPropios, espaciosDelMueble]);

  /** Cuántas caras contesta cada chip de la tabla. Un filtro que no puede
   *  devolver nada no se dibuja: es la misma regla que ya gobernaba el parte,
   *  y es lo que evita que alguien toque «Sin montar 0» y crea que se rompió. */
  const chipsTabla = useMemo(() => {
    // Las cinco pestañas del dibujo, con su cuenta siempre a la vista: un
    // cero dice que no hay, que es una respuesta (rediseño, PR 2). «Libres»
    // y «Vendido en parte» cuentan EXACTAMENTE las filas que muestran: con la
    // misma regla (`faceMatchesFilter`), sobre las mismas filas.
    const filas = fixtures.flatMap(espaciosDelMueble);
    const cuantas = (id: MapFilter) => filas.filter((e) => faceMatchesFilter(e, id, sinMontarSet, enParteSet, libresSet)).length;
    const todos: { id: MapFilter; label: string; n: number }[] = [
      { id: "todos", label: "Todas", n: kpis.filas },
      { id: "occupied", label: "Vigentes hoy", n: cuantas("occupied") },
      { id: "expiring", label: "Por vencer", n: kpis.expiring.length },
      { id: "sin_montar", label: "Sin montar", n: montaje.sinMontar.length },
      { id: "free", label: "Libres", n: cuantas("free") },
      { id: "en_parte", label: "Vendido en parte", n: cuantas("en_parte") },
    ];
    return todos;
  }, [kpis, montaje.sinMontar.length, fixtures, espaciosDelMueble, sinMontarSet, enParteSet, libresSet]);

  /** Los contratos que corren HOY (la pestaña «Vigentes hoy»): es la cifra
   *  «Contratos activos» del Inicio, y sus filas suman el «Canon del mes». */
  const vigentesHoy = chipsTabla.find((c) => c.id === "occupied")?.n ?? 0;

  /** Una cifra lleva a la tabla de contratos filtrada en lo que cuenta. */
  const abrirTablaDesde = (filtro: MapFilter, desde: "Inicio" | "Resumen", cifra: string) => {
    setModo("supervisar");
    setPestanaInd("contratos");
    setMapFilter(filtro);
    setMapQuery("");
    setLlegada({ desde, cifra });
  };

  /** «lunes 31 de agosto de 2026». Es el único lugar de la pantalla donde se
   *  dice qué día es, y hace falta: todo lo demás —los días que faltan, lo que
   *  vence, el periodo— se cuenta contra hoy. */
  const hoyLargo = useMemo(() => {
    const t = new Date().toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    return t.replace(",", "");
  }, []);

  /** La tarjeta del plano DE SUPERVISAR. El mapa es el mismo componente en los
   *  dos modos —no cambia porque cambie para qué lo estás mirando— y el panel
   *  que lo enmarca MIDE LO MISMO: en Vender es el panel `01` de la hoja (más
   *  abajo), con la clave de cinco estados; acá es una tarjeta de una fila,
   *  con el filtro del plano al costado.
   *
   *  Ocupa la celda de arriba a la izquierda de la hoja de Supervisar, que
   *  tiene las mismas columnas y el mismo alto de fila que la de Vender: el
   *  plano mide lo mismo en las dos pantallas. Antes el alto lo ponía la
   *  proporción del dibujo y el mismo plano salía mucho más grande acá
   *  (captura del dueño, 2026-09-23). */
  const tarjetaMapa = (
        <section className="vp vp-plano" style={{ minWidth: 0 }}>
          {/* El MISMO panel que el plano de Vender (`.vp-plano`: el mismo
              encabezado, el mismo lienzo con el mismo relleno), en una fila
              del mismo alto (`--alto-plano`): el plano mide lo mismo en las dos
              pantallas. La clave lleva «Vendido en parte» y las chinchetas de
              lo que hay para revisar; el filtro es un control DEL mapa y vive
              en su borde, como la regla al costado de un plano impreso. */}
          <header>
            <MapIcon {...ICONO_TARJETA} className="ico-tarjeta" />
            <h2>Piso de {sede}</h2>
            <span className="sub">{fixtures.length} muebles</span>
            <div className="der">
              <MapLegend tally={rangeTally} modo="supervisar"
                chinchetas={chinchetasDeRevision.length}
                pendientes={pendientesEnElPlano}
                onPendientes={() => setPendientesEnElPlano(!pendientesEnElPlano)}
              />
              <FiltroTexto valor={mapQuery} onCambio={setMapQuery} etiqueta="Filtrar el plano" />
            </div>
          </header>

          <div className="lienzo">
            {mapRange && (
              <IsoMap
                fixtures={fixtures}
                /* El que se está mirando, por su cara. */
                selectedKeys={selected ? [`${selected.id}-${detailFace}`] : []}
                onSelect={selectFixture}
                match={mapMatch}
                range={mapRange}
                /* Como lo mira Supervisar: lo vendido entero parte del
                   periodo, tomado; el ámbar es lo vendido en parte. */
                dispo={dispoSupervisar}
                porPartes={porPartesDeCara}
                cortoDe={cortoDeCara}
                libreDesde={libreDesdeDeCara}
                /* Los puntos de «Para revisar», sólo si se prendieron en la
                   clave (arranca apagado). */
                chinchetas={pendientesEnElPlano ? chinchetasDeRevision : undefined}
                onChincheta={irAlAviso}
                senalar={senalarEnElPlano}
              />
            )}
          </div>

          {/* Quick look, anchored to the fixture. Hidden once the full
              detail takes over the rail so the two never compete. */}
          {selected && anchor && !detailFull && entradaDetalle && (
            <FixturePopover
              fixture={selected}
              /* Fase 2 · I4: la cara que se tocó, la misma de la ficha
                 (`entradaDetalle`): el globo, Renovar y «Abrir en
                 Distribución» decían y hacían siempre la A. */
              cara={entradaDetalle.face}
              anchor={anchor}
              isAdmin={isAdmin}
              onExpand={() => setDetailFull(true)}
              onNegociar={isAdmin && !porParticipacion(selected) ? () => negociar(selected, entradaDetalle.face) : undefined}
              onRenovar={isAdmin && renovable(entradaDetalle)
                ? () => renovar(entradaDetalle)
                : undefined}
              onAbrirEnDistribucion={isAdmin && porParticipacion(selected)
                ? () => abrirEnDistribucion(selected.id, entradaDetalle.face)
                : undefined}
              onClose={closeDetail}
            />
          )}
        </section>
  );

  /* ══ LA HOJA DE VENDER · la composición de D ═══════════════════════════════
     Cuatro paneles —el piso, cuándo se libera, el contrato y la tarifa—, cada
     uno con su ícono donde iba su número (rediseño 2026-10: el número y el
     conector decían el orden de lectura; el ícono dice QUÉ es), el plano
     arriba a la izquierda, la escalera debajo, el contrato a la derecha y la
     tarifa abajo. Desde «aire y pines» son dos PILAS: la izquierda mide la
     ventana y queda quieta; la derecha mide lo que mide el contrato, y si no
     entra rueda la pantalla (nunca el documento, nunca el cuerpo del
     contrato), con el pie del contrato pegado abajo.
     Referencia: `outputs/vender/opciones/D-fusion/index.html`.             */

  /** EL PISO (era el panel 01).
   *
   *  Encabezado: ícono (`MapIcon`, el mismo de Supervisar), título, cuántos muebles, y la clave de CINCO estados
   *  con sus conteos. Lienzo: el plano, con las herramientas de acercamiento
   *  —que son lo que hace verificable la promesa del rótulo («mide 10,5 px a
   *  todo acercamiento»)—. */
  /** Los muebles que se venden, para la línea de tiempo de la sede. */
  const mueblesDeLaLinea = useMemo(
    () => fixtures.filter(isRentable).map((f) => ({ id: f.id, code: f.code, doble: isDoubleGondola(f) })),
    [fixtures],
  );
  /** «Contratar estas fechas» de un hueco de la línea: el periodo pasa a ser
   *  el del hueco y el contrato arranca con ese espacio y esas fechas. */
  const contratarDesdeLaLinea = (c: Carril, desde: string, hasta: string) => {
    const f = fixtures.find((x) => x.id === c.fixtureId);
    if (!f) return;
    const a = parseISODate(desde), b = parseISODate(hasta);
    if (a && b) setMapRange({ from: a, to: b });
    negociar(f, c.cara, {
      id: `linea|${c.codigo}|${desde}`, proveedor: "", correo: "", marca: "", desde, hasta,
      valores: {}, porcentajes: {},
    }, c.sufijo ?? undefined);
  };

  /** El primer espacio del último contrato guardado («Ver la ficha»). */
  const ultimoGuardado = useRef<EnContrato | null>(null);

  const panelPlano = mapRange && (
    <section className="vp vp-plano">
      <header>
        <MapIcon {...ICONO_TARJETA} className="ico-tarjeta" />
        <h2>{vistaContratos === "linea" ? `Línea de tiempo de ${sede}` : `Piso de ${sede}`}</h2>
        <span className="sub">{fixtures.length} muebles</span>
        {/* Plano | Línea de tiempo (etapa 4): la misma pregunta —qué está
            disponible en esas fechas— vista en el piso o en 12 meses. */}
        <div className="seg vista-contratos" role="group" aria-label="Ver como">
          <button type="button" aria-pressed={vistaContratos === "plano"} onClick={() => setVistaContratos("plano")}>Plano</button>
          <button type="button" aria-pressed={vistaContratos === "linea"} onClick={() => setVistaContratos("linea")}>Línea de tiempo</button>
        </div>
        <div className="der">
          <MapLegend tally={tallyVender} modo="vender" enContrato={espaciosDelContrato.length} />
        </div>
      </header>
      <div className="lienzo">
        {vistaContratos === "linea" ? (
          <LineaDeLaSede
            sede={sede}
            muebles={mueblesDeLaLinea}
            desde={toISODate(mapRange.from)}
            hasta={toISODate(mapRange.to)}
            version={estadoComercial}
            onContratar={contratarDesdeLaLinea}
          />
        ) : (
        <IsoMap
          fixtures={fixtures}
          selectedKeys={carasDelContrato}
          onSelect={selectFixture}
          match={mapMatch}
          range={mapRange}
          resaltar={resaltarPlano}
          dispo={dispoDeCara}
          porPartes={porPartesDeCara}
          cortoDe={cortoDeCara}
          libreDesde={libreDesdeDeCara}
        />
        )}
      </div>
    </section>
  );

  /** CUÁNDO SE LIBERA CADA ESPACIO (era el panel 02), con `Clock`.
   *
   *  La escalera A·4 entera, con la lectura del cursor chica y en mono a la
   *  derecha del encabezado (pedido del dueño, 2026-09-07). La lectura la
   *  escribe `Lectura`, que es un componente propio con su estado: mover el
   *  cursor por la escalera no puede volver a pintar la pantalla. */
  const panelEscalera = mapRange && (
    <section className="vp vp-libera">
      <header>
        <Clock {...ICONO_TARJETA} className="ico-tarjeta" />
        <h2>Cuándo se libera cada espacio</h2>
        <div className="der">
          <Lectura registrar={lecturaRef} />
        </div>
      </header>
      <div className="graf">
        <Libera
          fixtures={fixtures}
          facesOf={carasConSusPartes}
          tipoDe={(f) => tipoDelMueble(f, nombresPropios)}
          desde={mapRange.from}
          hasta={mapRange.to}
          temporadas={temporadasDelPeriodo}
          onLectura={escribirLectura}
          onResaltar={destacar}
        />
      </div>
    </section>
  );

  /** TARIFA DE REFERENCIA (era el panel 04), con `Tag`: la misma etiqueta que
   *  el botón «Tarifas» de la barra, porque es la misma cosa.
   *
   *  Está en la pantalla y no en un modal porque es la respuesta a «¿qué le
   *  ofrezco?»: detrás de un botón obligaba a abrir, mirar, cerrar y volver al
   *  plano — cuatro gestos para un dato que se usa en cada llamada.
   *
   *  LOS CONTEOS SE DERIVAN, NO SE ESCRIBEN. La columna «Libres · en parte»,
   *  el pie y la clave del plano son la misma cuenta mirada tres veces
   *  (`contarElPeriodo`), así que un espacio que entra al contrato deja de
   *  estar libre en los tres lugares a la vez.
   *
   *  Fase 2 · I4: el «+N» ámbar es «se vende una parte» y su `title` dice por
   *  qué, sin nombres: se liberan en el periodo, con partes vendidas, por
   *  participación. Y «N al cerrar» es lo que ESTE contrato puede tomar
   *  (`alCerrar`): desde el rediseño de Vender, también las caras por
   *  participación, que se venden acá como una línea de porcentaje (hasta
   *  entonces se restaban porque «se cargaban en el Editor 3D → Distribución»).
   *  Así el pie es libres + el «+N», la misma cuenta que cada fila.
   *
   *  Pasar el mouse por una fila APAGA LA SALA y enciende los muebles de ese
   *  tipo (los libres y los que se liberan); TOCARLA (clic, toque o Enter) la
   *  FIJA —con el dedo no hay mouse que pase— y volver a tocarla la suelta.
   *  Las pastillas siguen sumando al contrato con un clic. Y debajo de cada tipo van las
   *  pastillas de código de lo que está libre, como antes del PR 2 (el dueño
   *  las pidió de vuelta, 2026-09-07): dicen CUÁLES son sin tocar el plano,
   *  y pasar el mouse por una enciende ESE mueble. Sólo mientras no hay
   *  contrato armado: con la ficha abierta la pregunta ya es otra. */
  const conCodigos = espaciosDelContrato.length === 0;
  const panelTarifas = (
    <section className="vp vp-tarifa">
      <header>
        <Tag {...ICONO_TARJETA} className="ico-tarjeta" />
        <h2>Tarifa de referencia</h2>
        <div className="der"><span className="vpill">al mes</span></div>
      </header>
      <div className="tabla">
        <table>
          <thead>
            <tr>
              <th scope="col">Tipo de espacio</th>
              <th scope="col" className="der2 c2">Libres · en parte</th>
              <th scope="col" className="der2 c3">Tarifa</th>
            </tr>
          </thead>
          <tbody>
            {porCategoria.map(({ cat, libres, parciales, tarifa, claves, cuenta }) => {
              const chips = conCodigos ? [...libres, ...parciales] : [];
              const nParte = enParte(cuenta);
              const porQue = desgloseDelParcial(cuenta);
              return (
              <Fragment key={cat}>
              <tr
                className={[
                  tiposDelContrato.has(cat) ? "mk" : "", chips.length ? "conchips" : "",
                  tipoFijado === cat ? "fijada" : "",
                ].join(" ").trim() || undefined}
                tabIndex={0}
                data-fijada={tipoFijado === cat ? "1" : undefined}
                title={tipoFijado === cat ? "Tocá de nuevo para soltar" : "Tocá para dejar encendidos estos muebles en el plano"}
                onMouseEnter={() => destacar(claves)}
                onMouseLeave={() => destacar(null)}
                onClick={() => setTipoFijado((x) => (x === cat ? null : cat))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  setTipoFijado((x) => (x === cat ? null : cat));
                }}
              >
                <td>{nombreDeTarifa(cat, nombresPropios)}</td>
                <td className="der2 cif">
                  {cuenta.libres === 0
                    ? <span className="cero">0</span>
                    : cuenta.libres}
                  {nParte > 0 && (
                    <>
                      {" "}
                      <span
                        className="entran"
                        title={porQue}
                      >
                        +{nParte}
                      </span>
                    </>
                  )}
                </td>
                <td className="der2 cif">
                  {tarifa ? formatCOP(tarifa) : <span className="cero">sin tarifa</span>}
                </td>
              </tr>
              {chips.length > 0 && (
                <tr
                  className="chips"
                  onMouseEnter={() => destacar(claves)}
                  onMouseLeave={() => destacar(null)}
                >
                  <td colSpan={3}>
                    <div className="chips-fila">
                      {chips.map((d) => {
                        const entra = d.desde !== undefined || !!d.porPartes;
                        const clave = `${d.fixture.id}-${d.face}`;
                        return (
                          <button
                            key={clave}
                            type="button"
                            className={"chip" + (entra ? " chip--entra" : "")}
                            title={d.porParticipacion
                              ? `Sumar ${d.code} al contrato · por porcentaje${d.porPartes ? ` · ${d.porPartes}` : ""}`
                              : d.porPartes
                              ? `Sumar ${d.code} al contrato · ${d.porPartes}: se vende otra parte, no la entera`
                              : entra && d.hasta
                              ? `Sumar ${d.code} al contrato · libre hasta el ${fechaEnCurso(toISODate(d.hasta))}`
                              : entra
                              ? `Sumar ${d.code} al contrato · se libera el ${fechaEnCurso(toISODate(d.desde as Date))}`
                              : `Sumar ${d.code} al contrato`}
                            onMouseEnter={() => destacar([clave])}
                            onMouseLeave={() => destacar(claves)}
                            /* Una cara por participación también se suma: entra como su
                               línea de porcentaje (`alternarCara`). */
                            onClick={(e) => { e.stopPropagation(); destacar(null); alternarCara(d.fixture.id, d.face); }}
                          >
                            {d.code}
                            {entra && <span className="chip__f">{d.porPartes ?? (d.hasta
                              ? `hasta ${fechaEnCurso(toISODate(d.hasta))}`
                              : fechaEnCurso(toISODate(d.desde as Date)))}</span>}
                            {/* Una cara por participación sin nada comprometido dice
                                que entra como porcentaje. */}
                            {!entra && d.porParticipacion && <span className="chip__f">por porcentaje</span>}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>
                {kpis.total} espacio{kpis.total === 1 ? "" : "s"} comercializable{kpis.total === 1 ? "" : "s"}
              </td>
              <td className="der2 cif">
                {tallyVender.libres === 0
                  ? <span className="cero">0</span>
                  : tallyVender.libres}
                {enParte(tallyVender) > 0 && (
                  <> <span className="entran" title={desgloseDelParcial(tallyVender)}>+{enParte(tallyVender)}</span></>
                )}
              </td>
              <td className="der2 cif" title={conLasDeParticipacion(tallyVender) ?? undefined}>
                {alCerrar(tallyVender)} al cerrar
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  /** El cuerpo de «Para revisar»: las tres pestañas, los avisos de quien
   *  supervisa y sus filas. Se dibuja en la tarjeta de Indicadores y en la
   *  bandeja de Pendientes (etapa 3), nunca en las dos a la vez. */
  const cuerpoDeRevision = (
    <>
      {/* Tres grupos por cuándo hay que actuar, con su cuenta siempre
          a la vista (`components/Supervisar/paraRevisar.ts`). */}
      <div style={{ padding: "0 12px 8px" }}>
        <PestanasDeRevision cuentas={cuentasDeRevision} grupo={grupoDeRevision} onGrupo={setGrupoElegido} />
      </div>
      {/* «Editar contrato» que no se pudo abrir (el contrato ya no
          está vigente, o no se pudo leer): se dice acá, donde se
          tocó el botón. */}
      {/* Lo que dejó Distribuir al guardar una cara (y volver acá). */}
      {isAdmin && avisoDeDistribucion && (
        <div role="status" data-aviso-de-distribucion
          style={{ margin: "0 12px 8px", display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 8, alignItems: "start",
            padding: "10px 12px", borderRadius: 12, background: "var(--libre-suave)", border: "1px solid var(--libre-borde)",
            fontSize: "var(--t-xs)", color: "var(--ink-1)", lineHeight: 1.45 }}>
          <CircleCheck size={16} strokeWidth={1.75} aria-hidden style={{ color: "var(--libre-txt)", marginTop: 1 }} />
          <span>{avisoDeDistribucion}</span>
          <button type="button" className="btn-s" aria-label="Cerrar el aviso" onClick={() => setAvisoDeDistribucion(null)}>
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {/* Lo que dejó la revisión de un planograma (fase 4). */}
      {avisoDeSupervision && (
        <div role="status" data-aviso-de-supervision
          style={{ margin: "0 12px 8px", display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 8, alignItems: "start",
            padding: "10px 12px", borderRadius: 12, background: "var(--libre-suave)", border: "1px solid var(--libre-borde)",
            fontSize: "var(--t-xs)", color: "var(--ink-1)", lineHeight: 1.45 }}>
          <CircleCheck size={16} strokeWidth={1.75} aria-hidden style={{ color: "var(--libre-txt)", marginTop: 1 }} />
          <span>{avisoDeSupervision}</span>
          <button type="button" className="btn-s" aria-label="Cerrar el aviso" onClick={() => setAvisoDeSupervision(null)}>
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {(revisarMontajeDe !== null || guiaParaMandar !== null) && (
        <Suspense fallback={null}>
          {revisarMontajeDe !== null && (
            <RevisarMontaje versionId={revisarMontajeDe} onCerrar={() => setRevisarMontajeDe(null)}
              onRevisada={(texto) => { setRevisarMontajeDe(null); setAvisoDeSupervision(texto); planogramasPorRevisar.recargar(); }} />
          )}
          {guiaParaMandar !== null && (
            <VerGuia versionId={guiaParaMandar} puedeCompartir mandar onCerrar={() => setGuiaParaMandar(null)} />
          )}
        </Suspense>
      )}
      {isAdmin && avisoDeEdicion && !(selected && detailFull) && (
        <p role="alert" data-aviso-edicion style={{ margin: "0 12px 8px", fontSize: "var(--t-xs)", color: "var(--ocupado-txt)", lineHeight: 1.45 }}>
          {avisoDeEdicion}
        </p>
      )}
      <div
        className="lista-r"
        data-senala-en-el-plano
        onPointerOver={(e) => { if (e.pointerType !== "touch") senalarFila(e.target); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") senalarFila(null); }}
        onFocus={(e) => senalarFila(e.target)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) senalarFila(null); }}
      >
        {cuentasDeRevision[grupoDeRevision] === 0 && (
          <div className="vacio-r">
            {grupoDeRevision === "hoy" ? "Nada para hoy."
              : grupoDeRevision === "dias30" ? "Nada que venza ni que haya que preparar en los próximos 30 días."
              : "Nada que corregir: todo lo que la base tiene vendido se ve en el plano."}
          </div>
        )}

        {/* ── HOY: lo que no espera ── */}
        {grupoDeRevision === "hoy" && (
          <>
            {/* Lo que se vende por % de las ventas: cada período que
                terminó, lo vendido, y el servidor dice cuánto se cobra. */}
            {isAdmin && cortesSinCargar.pendientes.length > 0 && (
              <VentasPorCargar
                sede={sede}
                pendientes={cortesSinCargar.pendientes}
                cargados={cortesSinCargar.cargados}
                onCargado={cortesSinCargar.marcarCargado}
              />
            )}
            {/* Falta distribuir (7 días o menos) y las reservas de
                participación que caducan hoy. */}
            {isAdmin && participacionesPorGrupo.hoy.length > 0 && (
              <RevisarParticipaciones
                secciones={participacionesPorGrupo.hoy}
                tituloDe={(x) => tituloDeSeccion(SECCION_DE_PARTICIPACIONES[x.tipo], "hoy")}
              />
            )}
            {isAdmin && planometriaPorGrupo.hoy.length > 0 && (
              <FaltaPlanometria
                sede={sede}
                filas={planometriaPorGrupo.hoy}
                titulo={tituloDeSeccion("falta_planometria", "hoy")}
                onCargar={cargarPlanometria}
              />
            )}
            {/* Los planogramas: montados por revisar, no coinciden,
                no se pudieron montar, rigen sin aviso (fase 4). */}
            <PlanogramasPorRevisar
              filas={planogramasPorRevisar.filas}
              hoy={planogramasPorRevisar.hoy}
              onAbrir={(c) => { setAvisoDeSupervision(null); setRevisarMontajeDe(c.version_id); }}
              onMandar={(c) => { setAvisoDeSupervision(null); setGuiaParaMandar(c.version_id); }}
            />
            {kpis.expired.length > 0 && (
              <div>
                <AtencionSection
                  label="Vencidos"
                  monto={isAdmin
                    ? formatCOP(kpis.expired.reduce((t, e) => t + enLaUnidad(e.negotiatedValue, e.startDate, e.endDate, unidad), 0))
                    : kpis.expired.length}
                />
                {kpis.expired.map((entry) => (
                  <AtencionRow
                    key={`v-${entry.fixture.id}-${entry.face}`}
                    aviso={`v-${claveDeFila(entry)}`}
                    entry={entry}
                    chip={`${Math.abs(entry.days)}d`}
                    dates={entry.endDate ? `venció el ${fechaEnCurso(entry.endDate)}` : "—"}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                  />
                ))}
              </div>
            )}
            {isAdmin && montaje.noMontado.length > 0 && (
              <div>
                <AtencionSection label="No se pudo montar" monto={montaje.noMontado.length} />
                {montaje.noMontado.map((entry) => (
                  <AtencionRow
                    key={`nm-${entry.fixture.id}-${entry.face}`}
                    aviso={`nm-${claveDeFila(entry)}`}
                    entry={entry}
                    chip="!"
                    dates={entry.reporte.motivo
                      ? `«${MOTIVO_LABEL[entry.reporte.motivo as MountMotivo]}»`
                      : "sin motivo"}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                    onFoto={
                      entry.reporte.file_id
                        ? () => setViewerFile({
                            id: entry.reporte.file_id as number,
                            filename: entry.reporte.foto_nombre ?? "montaje.jpg",
                            content_type: entry.reporte.foto_tipo ?? "image/jpeg",
                            size: 0,
                            uploaded_at: entry.reporte.confirmado_en ?? "",
                          })
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
            {/* Las reservas de una cara entera o de una parte que
                caducan hoy. Confirmar usa el precio que se guardó al
                reservar. */}
            {isAdmin && reservasPorGrupo.hoy.length > 0 && (
              <ReservasSinConfirmar
                sede={sede}
                titulo={tituloDeSeccion("reservas", "hoy")}
                vivas={reservasPorGrupo.hoy}
                onCambio={() => {
                  reservasSinConfirmar.recargar();
                  void refrescarComercial();
                  if (hayParticipaciones) void recargarOcupacion(sede);
                }}
              />
            )}
          </>
        )}

        {/* ── 30 DÍAS: lo que viene ── */}
        {grupoDeRevision === "dias30" && (
          <>
            {kpis.expiring.length > 0 && (
              <div>
                <AtencionSection
                  label="Por vencer en 30 días"
                  monto={isAdmin && plata ? formatCOP(plata.vence) : kpis.expiring.length}
                />
                {kpis.expiring.map((entry) => (
                  <AtencionRow
                    key={`pv-${claveDeFila(entry)}`}
                    aviso={`pv-${claveDeFila(entry)}`}
                    entry={entry}
                    chip={`${entry.days}d`}
                    dates={entry.endDate ? `vence el ${fechaEnCurso(entry.endDate)}` : "—"}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                    /* «Renovar» abre Vender con el contrato armado. */
                    accion={isAdmin && renovable(entry)
                      ? { texto: "Renovar", icono: <Repeat {...ICONO_TARJETA} />, onClick: () => renovar(entry) }
                      : undefined}
                  />
                ))}
              </div>
            )}
            {/* Falta distribuir con más margen, reservas de
                participación por caducar y borradores sin confirmar. */}
            {isAdmin && participacionesPorGrupo.dias30.length > 0 && (
              <RevisarParticipaciones
                secciones={participacionesPorGrupo.dias30}
                tituloDe={(x) => tituloDeSeccion(SECCION_DE_PARTICIPACIONES[x.tipo], "dias30")}
              />
            )}
            {isAdmin && planometriaPorGrupo.dias30.length > 0 && (
              <FaltaPlanometria
                sede={sede}
                filas={planometriaPorGrupo.dias30}
                titulo={tituloDeSeccion("falta_planometria", "dias30")}
                onCargar={cargarPlanometria}
              />
            )}
            {isAdmin && montaje.sinMontar.length > 0 && (
              <div>
                <AtencionSection label="Contratado sin montar" monto={montaje.sinMontar.length} />
                {montaje.sinMontar.map((entry) => (
                  <AtencionRow
                    key={`sm-${claveDeFila(entry)}`}
                    aviso={`sm-${claveDeFila(entry)}`}
                    entry={entry}
                    chip={entry.dias === 0 ? "hoy" : `${entry.dias}d`}
                    /* Dos semanas cobrando algo que nadie reportó
                       armado deja de ser un pendiente y pasa a ser
                       un problema (la lista corta a los 30 días: el
                       «más de 60» de antes no podía pasar). */
                    tono={entry.dias > DIAS_SIN_MONTAR_EN_ROJO ? "alarma" : "espera"}
                    dates={entry.dias === 0 ? "empieza hoy" : `empezó el ${fechaEnCurso(entry.startDate)}`}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                  />
                ))}
              </div>
            )}
            {isAdmin && reservasPorGrupo.dias30.length > 0 && (
              <ReservasSinConfirmar
                sede={sede}
                titulo={tituloDeSeccion("reservas", "dias30")}
                vivas={reservasPorGrupo.dias30}
                onCambio={() => {
                  reservasSinConfirmar.recargar();
                  void refrescarComercial();
                  if (hayParticipaciones) void recargarOcupacion(sede);
                }}
              />
            )}
          </>
        )}

        {/* ── CORREGIR: datos que no cuadran ── */}
        {grupoDeRevision === "corregir" && (
          <>
            {/* Cómo se lee el valor de los contratos de antes de
                Vender (al mes o total): sólo quien administra. */}
            {isAdmin && (
              <PrecioSinForma
                filas={precioSinForma.filas}
                titulo={tituloDeSeccion("precio_sin_forma", "corregir")}
                onCambio={() => { precioSinForma.recargar(); cortesSinCargar.recargar(); }}
              />
            )}
            {/* Las dos mitades del desfase van primero, juntas: son lo
                único acá que la pantalla no puede mostrar de ninguna
                otra forma. */}
            {fantasmas.length > 0 && (
              <div>
                <AtencionSection label="Contrato sin mueble en el plano" monto={fantasmas.length} />
                {fantasmas.map((f) => (
                  <FantasmaRow
                    key={f.espacio}
                    fila={f}
                    isAdmin={isAdmin}
                    abierto={fantasmaAbierto === f.espacio}
                    onAbrir={() => setFantasmaAbierto(
                      fantasmaAbierto === f.espacio ? null : f.espacio,
                    )}
                    onCancelado={() => {
                      setFantasmaAbierto(null);
                      void refrescarComercial();
                    }}
                  />
                ))}
              </div>
            )}
            {isAdmin && importacion && (pendientesDelPlano > 0 || importados > 0) && (
              <ImportarDelPlano
                datos={importacion}
                importados={importados}
                onAplicado={(r) => {
                  setImportados(r.importables.length);
                  // Lo importado ya es de la base: el mapa se repinta de
                  // ahí, y los fantasmas se recalculan solos.
                  void refrescarComercial();
                  // Y se vuelve a preguntar. La respuesta de aplicar dice
                  // qué se ESCRIBIÓ, no qué queda.
                  revisarImportacion().then(setImportacion).catch(() => {});
                }}
              />
            )}
            {kpis.noContract.length > 0 && (
              <div>
                <AtencionSection label="Ocupado sin contrato" monto={kpis.noContract.length} />
                {kpis.noContract.map((entry) => (
                  <AtencionRow
                    key={`nc-${entry.fixture.id}-${entry.face}`}
                    aviso={`nc-${claveDeFila(entry)}`}
                    entry={entry}
                    chip="—"
                    tono="sordo"
                    dates="sin papeles"
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                  />
                ))}
              </div>
            )}
            {/* «Reservado» a mano, del selector de antes: sin
                proveedor ni fecha. Se libera, o se reserva de verdad
                en Vender (rediseño, PR 3, decisión 1). */}
            {kpis.reservadoAMano.length > 0 && (
              <div data-reservado-a-mano>
                <AtencionSection label={tituloDeSeccion("reservado_a_mano", "corregir")} monto={kpis.reservadoAMano.length} />
                {kpis.reservadoAMano.map((entry) => {
                  const codigo = fullSpaceCode(entry.fixture.sede || sede, entry.code);
                  return (
                    <AtencionRow
                      key={`ra-${claveDeFila(entry)}`}
                      aviso={`ra-${claveDeFila(entry)}`}
                      entry={entry}
                      chip="—"
                      tono="sordo"
                      dates="sin proveedor ni fecha"
                      selected={selected?.id === entry.fixture.id}
                      onSelect={() => revisar(entry.fixture, entry.face)}
                      acciones={isAdmin ? [
                        {
                          texto: "Liberar", icono: <CircleDashed {...ICONO_TARJETA} />,
                          titulo: "Pasa el espacio a Disponible",
                          ocupado: liberando === codigo,
                          onClick: () => void liberarReservadoAMano(entry),
                        },
                        {
                          texto: "Reservar de verdad", icono: <Hourglass {...ICONO_TARJETA} />,
                          titulo: "Saca la marca a mano y abre Vender con este espacio, para reservarlo con proveedor y fecha",
                          ocupado: liberando === codigo,
                          onClick: () => void liberarReservadoAMano(entry, () => negociar(entry.fixture, entry.face)),
                        },
                      ] : undefined}
                    />
                  );
                })}
              </div>
            )}
            {/* Participación sin mueble, sin término, distribución
                con problemas o para revisar. Sólo para quien
                administra: lleva proveedores y marcas. */}
            {isAdmin && participacionesPorGrupo.corregir.length > 0 && (
              <RevisarParticipaciones
                secciones={participacionesPorGrupo.corregir}
                tituloDe={(x) => tituloDeSeccion(SECCION_DE_PARTICIPACIONES[x.tipo], "corregir")}
              />
            )}
            {isAdmin && kpis.belowReference.length > 0 && (
              <div>
                <AtencionSection label="Bajo tarifa de referencia" monto={kpis.belowReference.length} />
                {kpis.belowReference.map((entry) => (
                  <AtencionRow
                    /* La clave de la FILA: dos partes de la misma
                       cara (PUN-03·EN1 y ·EN2) son dos renglones. */
                    key={`bt-${claveDeFila(entry)}`}
                    aviso={`bt-${claveDeFila(entry)}`}
                    entry={entry}
                    chip={`−${entry.gapPct} %`}
                    tono="espera"
                    /* La tarifa de referencia es AL MES: el contrato
                       se compara en sus meses, sea cual sea la
                       unidad de la franja. */
                    dates={`${formatCOP(entry.alMes)} al mes · ref ${formatCOP(entry.ref)}`}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                    /* «Editar contrato» (2026-10-22): los que se
                       cargaron fijos cuando eran por % de las
                       ventas se corrigen acá, uno por uno. */
                    acciones={accionEditar(entry, "Bajo tarifa de referencia")}
                  />
                ))}
              </div>
            )}
            {/* Lo que arrancó hace más de 30 días y nunca se reportó:
                a esa altura el espacio ya está armado; lo que falta es
                el reporte. Antes una nota que no contaba. */}
            {isAdmin && montaje.viejos.length > 0 && (
              <div>
                <AtencionSection label={tituloDeSeccion("montajes_viejos", "corregir")} monto={montaje.viejos.length} />
                {montaje.viejos.map((entry) => (
                  <AtencionRow
                    key={`mv-${claveDeFila(entry)}`}
                    aviso={`mv-${claveDeFila(entry)}`}
                    entry={entry}
                    chip={`${entry.dias}d`}
                    tono="sordo"
                    dates={`arrancó hace más de ${VENTANA_MONTAJE_DIAS} días y nadie reportó el montaje`}
                    selected={selected?.id === entry.fixture.id}
                    onSelect={() => revisar(entry.fixture, entry.face)}
                    acciones={accionEditar(entry, tituloDeSeccion("montajes_viejos", "corregir"))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  /** La ficha del espacio (la misma en el Inicio, en Indicadores y desde
   *  Pendientes): se abre en un cajón encima de la pantalla. */
  const fichaDelEspacio = selected && detailFull ? (
    <FixtureDetailCard
      fixture={selected}
      isAdmin={isAdmin}
      face={detailFace}
      onFace={setDetailFace}
      onBack={closeDetail}
      onNegociar={isAdmin ? () => negociar(selected, detailFace) : undefined}
      onNegociarParte={isAdmin ? (parte) => negociar(selected, detailFace, null, parte) : undefined}
      onRenovarParte={isAdmin ? renovar : undefined}
      onEditar={isAdmin ? (e) => editarFila(e, { enFicha: true }) : undefined}
      onEditarParticipacion={isAdmin
        ? (t) => {
          if (typeof t.lease_id !== "number") return;
          void editarContrato(selected, detailFace, t.lease_id,
            { valor: t.valor_mensual ?? 0, desde: t.desde, hasta: t.hasta,
              proveedor: t.proveedor?.nombre ?? undefined, marca: t.marca },
            { enFicha: true });
        }
        : undefined}
      onEditarProximo={isAdmin
        ? (e, id) => void editarContrato(e.fixture, e.face, id, null, { enFicha: true })
        : undefined}
      avisoDeEdicion={avisoDeEdicion}
      /* Sólo cuando hay algo que renovar: un contrato con proveedor
         que se cae dentro de 60 días o que ya se cayó. Con más
         margen el botón crearía un contrato solapado con uno vivo. */
      onRenovar={isAdmin && entradaDetalle && renovable(entradaDetalle)
        ? () => renovar(entradaDetalle)
        : undefined}
      onCancelado={() => {
        // Igual que al guardar: la fila ya no está en la base y el
        // mapa se vuelve a leer de ahí. No hay copia que limpiar.
        void refrescarComercial();
        closeDetail();
      }}
      onOpenFile={setViewerFile}
      unidad={unidad}
      montajeDe={montajeDe}
      montajeDelCodigo={montajeDelCodigo}
      cobroDe={isAdmin ? cobroDeCodigo : undefined}
      reservaDe={isAdmin ? reservaDeCodigo : undefined}
      onReservaCambio={() => {
        reservasSinConfirmar.recargar();
        void refrescarComercial();
        if (hayParticipaciones) void recargarOcupacion(sede);
      }}
      planometriaPedida={planometriaPedida}
      onPlanometriaCargada={faltaPlanometria.recargar}
      /* «Vender el Y %»: Vender con esta cara y lo que queda en el
         periodo (el pico, `capacidad.periodo.disponible_pb`). */
      onVenderLoQueQueda={isAdmin && porParticipacion(selected)
        ? (queda) => {
          const cara = fullSpaceCode(sede, codigoDeParte(selected.code, detailFace, null));
          negociar(selected, detailFace, {
            id: `${cara}|queda`, proveedor: "", correo: "", marca: "", desde: "", hasta: "",
            valores: {}, porcentajes: { [cara]: queda },
          });
        }
        : undefined}
    />
  ) : null;

  /** Lo de HOY para el Inicio, fila por fila: qué es, el espacio y cuándo, y
   *  la acción que lo resuelve. Lo que se resuelve en su fila de «Para
   *  revisar» (cargar ventas, confirmar una reserva, la planometría, los
   *  planogramas…) abre la bandeja; lo demás, la ficha del espacio. */
  const filasDeHoy: FilaDeHoy[] = (inicio || enIndicadores) ? avisos
    .filter((a) => grupoDelAviso(a.seccion, a.dias) === "hoy")
    .map((a) => {
      const f = a.fixtureId ? fixtures.find((x) => x.id === a.fixtureId) ?? null : null;
      const cara = a.cara ?? "A";
      const codigo = f ? (isDoubleGondola(f) ? `${f.code}·${cara}` : f.code) : null;
      const d = a.dias;
      const cuando = d === undefined || d === null ? null
        : d < 0 ? `hace ${-d} día${d === -1 ? "" : "s"}`
        : d === 0 ? "hoy" : `en ${d} día${d === 1 ? "" : "s"}`;
      const abrirBandeja = () => useArmazon.getState().abrirBandeja("hoy");
      const enLaBandeja: Partial<Record<Aviso["seccion"], string>> = {
        ventas_por_cargar: "Cargar", reservas: "Confirmar", falta_planometria: "Adjuntar",
        falta_distribuir: "Distribuir", planograma_por_revisar: "Verificar", planograma_no_coincide: "Resolver",
        planograma_no_se_pudo: "Resolver", planograma_sin_montar: "Resolver",
      };
      const texto = enLaBandeja[a.seccion];
      return {
        clave: a.clave,
        titulo: tituloDeSeccion(a.seccion, "hoy"),
        codigo,
        cuando,
        accion: texto || !f
          ? { texto: texto ?? "Resolver", onClick: abrirBandeja }
          : { texto: a.seccion === "vencidos" ? "Ver ficha" : "Resolver", onClick: () => revisar(f, cara) },
        onFicha: f ? () => revisar(f, cara) : undefined,
      };
    }) : [];
  const nombreDeQuienEntra = useAuthStore.getState().nombre?.trim().split(/\s+/)[0] ?? null;

  // ─── Indicadores (rediseño UX 2026-10, etapa 5) ─────────────────────────
  //
  // Resumen · Plano · Contratos · Quién paga · Participaciones · Todas las
  // sedes · Detalle · Diccionario. Cada cifra sale de las MISMAS cuentas que
  // ya usa esta pantalla (`kpis`, `plata`, `montaje`, `cuentasDeRevision`); lo
  // único nuevo que se pide es la serie de 12 meses (`GET /dashboard/serie`),
  // las metas (`GET /layout/metas`) y, para «Detalle», la línea de la sede.
  const [serie, setSerie] = useState<SerieDeCanon | null>(null);
  useEffect(() => {
    if (!isAdmin || !enIndicadores) return;
    let vivo = true;
    getSerieDeCanon(24).then((r) => { if (vivo) setSerie(r); }).catch(() => { if (vivo) setSerie(null); });
    return () => { vivo = false; };
  }, [isAdmin, enIndicadores]);
  const [metas, setMetas] = useState<Metas | null>(null);
  useEffect(() => {
    let vivo = true;
    getMetas().then((m) => { if (vivo) setMetas(m); }).catch(() => { /* sin metas: las propuestas */ });
    return () => { vivo = false; };
  }, []);
  const meta = metaDeLaSede(metas, sede);
  const [lineaInd, setLineaInd] = useState<FilaDeLaLinea[] | null>(null);
  useEffect(() => {
    if (!isAdmin || !enIndicadores || pestanaInd !== "detalle") return;
    let vivo = true;
    setLineaInd(null);
    getLineaDeLaSede(sede).then((r) => { if (vivo) setLineaInd(r.filas); }).catch(() => { if (vivo) setLineaInd(null); });
    return () => { vivo = false; };
  }, [isAdmin, enIndicadores, pestanaInd, sede]);

  const hoyIso = toISODate(new Date());
  const ultimoFin = serie?.sedes[sede.toUpperCase()]?.ultimo_fin ?? {};
  /** Cómo está el montaje de una fila con contrato (los cuatro estados del
   *  Resumen). */
  const estadoDeMontajeDe = (e: FaceEntry): EstadoDeMontaje => {
    const r = montajeDe(e);
    if (!r) return "sin_montar";
    if (r.estado !== "montado") return "no_realizado";
    return r.verificacion?.resultado === "coincide" ? "verificado" : "sin_verificar";
  };
  const conContrato = kpis.todas.filter((t) => t.fase === "vigente" || t.fase === "pendiente");
  const delMes = conContrato.filter((t) => (t.entry.startDate ?? "").slice(0, 7) === hoyIso.slice(0, 7));
  const montajesMes = montajesDelMes(delMes.map((t) => ({ desde: t.entry.startDate, estado: estadoDeMontajeDe(t.entry) })), hoyIso);
  const alMesDe = (x: FaceEntry) => (isAdmin ? enLaUnidad(x.negotiatedValue, x.startDate, x.endDate, "mes") : 0);
  const vence90 = venceEn(kpis.todas.filter((t) => t.fase === "vigente").map((t) => ({
    codigo: codigoVisible(t.entry), hasta: t.entry.endDate, alMes: alMesDe(t.entry), renovado: !!t.entry.proximoLeaseId,
  })), hoyIso, 90);
  const libresHoy = kpis.unidades.filter((u) => u.estado === "free");
  const ct = isAdmin ? canonContraTarifa(kpis.vigentes.map((x) => ({
    alMes: alMesDe(x), tarifa: tarifaDeLaFila(referenceRates, sede, x).valor ?? 0,
  }))) : null;
  const potencial = isAdmin
    ? kpis.unidades.reduce((t, u) => t + (tarifaDeLaFila(referenceRates, sede, u.cara).valor ?? 0), 0) : 0;
  const serieDeLaSede = serie?.sedes[sede.toUpperCase()]?.canon ?? (serie ? serie.meses.map(() => 0) : []);
  const datosResumen: DatosDelResumen = {
    esAdmin: isAdmin,
    sede,
    meta,
    metaPropuesta: !metas || metas.por_defecto,
    canon: isAdmin && canonDelMes !== null ? { hoy: canonDelMes, serie: serieDeLaSede, meses: serie?.meses ?? [], potencial } : null,
    ocupacion: {
      pct: kpis.occPct, ocupadas: kpis.occupied, total: kpis.total,
      cuadros: kpis.unidades.map((u) => ({ clave: claveDeFila(u.cara), codigo: codigoVisible(u.cara), ocupada: u.estado === "active" || u.estado === "expiring" })),
    },
    canonTarifa: ct ? { pct: ct.pct, contadas: ct.contadas, sinTarifa: ct.sinTarifa } : null,
    hoy: { cuenta: cuentasDeRevision.hoy, filas: filasDeHoy },
    vence: vence90,
    montajes: montajesMes,
    disponibles: {
      codigos: diasSinContrato(libresHoy.map((u) => codigoVisible(u.cara)), Object.fromEntries(
        libresHoy.map((u) => [codigoVisible(u.cara).toUpperCase(), ultimoFin[fullSpaceCode(sede, u.cara.code)]]).filter(([, v]) => v),
      ), hoyIso),
      sinFacturar: isAdmin ? sinAlquilar.plata : null,
      conHistorial: isAdmin && !!serie,
    },
  };

  /** «Detalle»: los cuatro bloques. */
  const datosDetalle: DatosDelDetalle = (() => {
    const semanas = Array.from({ length: 13 }, (_, i) => ({ desde: sumarDiasIso(hoyIso, i * 7), renovado: 0, sinRenovar: 0 }));
    for (const p of vence90.puntos) {
      const k = Math.min(12, Math.floor(p.dias / 7));
      const v = isAdmin ? p.alMes : 1;
      if (p.renovado) semanas[k].renovado += v; else semanas[k].sinRenovar += v;
    }
    let disponiblesPorDia: number[] | null = null;
    if (lineaInd) {
      const carriles = armarCarriles(mueblesDeLaLinea, lineaInd, sede);
      const porCara = new Map<string, { desde: string; hasta: string }[]>();
      for (const c of carriles) {
        const k = `${c.fixtureId}|${c.cara}`;
        porCara.set(k, [...(porCara.get(k) ?? []), ...c.barras.map((b) => ({ desde: b.desde, hasta: b.hasta }))]);
      }
      disponiblesPorDia = Array.from({ length: 90 }, (_, d) => {
        const dia = sumarDiasIso(hoyIso, d);
        let n = 0;
        for (const barras of porCara.values()) if (!barras.some((b) => b.desde <= dia && dia <= b.hasta)) n++;
        return n;
      });
    }
    const tipos = new Map<string, DatosDelDetalle["porTipo"][number] & { _canon: number; _tarifa: number; _dias: number[]; _potencial: number; _cobrado: number }>();
    const fila = (tipo: string) => {
      if (!tipos.has(tipo)) tipos.set(tipo, { tipo, espacios: 0, contratados: 0, ocupacionPct: 0, diasEntre: null, canonTarifa: null, sinFacturar: isAdmin ? 0 : null, canon: null, potencial: null, _canon: 0, _tarifa: 0, _dias: [], _potencial: 0, _cobrado: 0 });
      return tipos.get(tipo)!;
    };
    for (const u of kpis.unidades) {
      const t = fila(tipoDelMueble(u.cara.fixture, nombresPropios));
      t.espacios++;
      if (isAdmin) t._potencial += tarifaDeLaFila(referenceRates, sede, u.cara).valor ?? 0;
      if (u.estado === "active" || u.estado === "expiring") t.contratados++;
      if (u.estado === "free") {
        if (isAdmin) t.sinFacturar = (t.sinFacturar ?? 0) + (tarifaDeLaFila(referenceRates, sede, u.cara).valor ?? 0);
        const fin = ultimoFin[fullSpaceCode(sede, u.cara.code)];
        if (fin) t._dias.push(Math.max(0, diasHasta(fin, hoyIso)));
      }
    }
    if (isAdmin) for (const x of kpis.vigentes) {
      const t = fila(tipoDelMueble(x.fixture, nombresPropios));
      const tar = tarifaDeLaFila(referenceRates, sede, x).valor ?? 0;
      t._cobrado += alMesDe(x);
      if (tar > 0) { t._canon += alMesDe(x); t._tarifa += tar; }
    }
    const porTipo = [...tipos.values()].map(({ _canon, _tarifa, _dias, _potencial, _cobrado, ...t }) => ({
      ...t,
      canon: isAdmin ? _cobrado : null,
      potencial: isAdmin ? _potencial : null,
      ocupacionPct: t.espacios ? Math.round((t.contratados / t.espacios) * 100) : 0,
      diasEntre: _dias.length ? Math.round(_dias.reduce((a, b) => a + b, 0) / _dias.length) : null,
      canonTarifa: isAdmin && _tarifa > 0 ? Math.round((_canon / _tarifa) * 100) : null,
    })).sort((a, b) => b.espacios - a.espacios || a.tipo.localeCompare(b.tipo, "es"));
    const faltaIds = new Set(faltaPlanometria.filas.map((f) => f.lease_id));
    const conReporte = delMes.filter((t) => !!montajeDe(t.entry));
    // Lo que sigue corriendo (Detalle › «¿Qué pasa en las próximas
    // semanas?»): los mismos contratos vigentes de los que sale `vence90`.
    const vigentesHoy = kpis.todas.filter((t) => t.fase === "vigente");
    return {
      esAdmin: isAdmin, sede, hoy: hoyIso,
      resultado: {
        canon: isAdmin ? canonDelMes : null, potencial: isAdmin ? potencial : null,
        ocupacionPct: kpis.occPct, metaOcupacion: meta.ocupacion,
        canonTarifa: ct?.pct ?? null, metaCanonTarifa: meta.canon_tarifa,
        sinFacturar: isAdmin ? sinAlquilar.plata : null,
        contratosSinTarifa: isAdmin && ct ? ct.sinTarifa : 0,
      },
      semanas, disponiblesPorDia, porTipo,
      vencen: vence90.puntos.map((p) => ({ codigo: p.codigo, dias: p.dias, alMes: isAdmin ? p.alMes : 1, renovado: p.renovado })),
      baseQueSigue: isAdmin ? vigentesHoy.reduce((t, x) => t + alMesDe(x.entry), 0) : vigentesHoy.length,
      embudo: {
        empiezan: delMes.length,
        avisoEnviado: isAdmin ? delMes.filter((t) => !(t.entry.leaseId && faltaIds.has(t.entry.leaseId))).length : delMes.length,
        registrado: conReporte.length,
        montado: conReporte.filter((t) => montajeDe(t.entry)?.estado === "montado").length,
        verificado: delMes.filter((t) => estadoDeMontajeDe(t.entry) === "verificado").length,
      },
      pendientes: cuentasDeRevision,
    };
  })();

  /** «Todas las sedes»: la sede abierta con sus cuentas exactas; las demás
   *  con la misma regla (`estadoDeUnidad`), sin las participaciones que sólo
   *  se cargan para la abierta. */
  const filasDeSedes: FilaDeSede[] = pestanaInd !== "sedes" ? [] : sedes.map((s) => {
    const m = metaDeLaSede(metas, s);
    const ser = serie?.sedes[s.toUpperCase()]?.canon ?? null;
    const v = ser ? variacion(ser) : null;
    if (s === sede) {
      return {
        sede: s, canonHoy: isAdmin ? (ser ? ser[ser.length - 1] : canonDelMes) : null,
        serie: isAdmin && ser ? ser.slice(-12) : null, variacion: isAdmin ? v?.pct ?? null : null,
        ocupacion: { pct: kpis.occPct, ocupadas: kpis.occupied, total: kpis.total },
        canonTarifa: ct?.pct ?? null,
        sinRenovar90: isAdmin ? vence90.sinRenovar : null, meta: m,
      };
    }
    const fx = fixturesBySede[s] ?? [];
    const caras = fx.flatMap(commercialFacesOf).map((e) => conLaReserva(e, estadoComercial, s));
    const partes = fx.flatMap((f) => partesConContrato(f, estadoComercial, indicePartes, s));
    const estados = caras.map((c) => estadoDeUnidad(c, partes.filter((p) => p.fixture.id === c.fixture.id && p.face === c.face)));
    const ocupadas = estados.filter((e) => e === "active" || e === "expiring").length;
    const filas = [...caras, ...partes].filter((x) => contractPhase(x) === "vigente");
    const ctS = isAdmin ? canonContraTarifa(filas.filter((x) => x.negotiatedValue > 0).map((x) => ({
      alMes: alMesDe(x), tarifa: tarifaDeLaFila(referenceRates, s, x).valor ?? 0,
    }))) : null;
    const vS = venceEn(filas.map((x) => ({ codigo: x.code, hasta: x.endDate, alMes: alMesDe(x), renovado: !!x.proximoLeaseId })), hoyIso, 90);
    return {
      sede: s, canonHoy: isAdmin && ser ? ser[ser.length - 1] : null,
      serie: isAdmin && ser ? ser.slice(-12) : null, variacion: isAdmin ? v?.pct ?? null : null,
      ocupacion: { pct: caras.length ? Math.round((ocupadas / caras.length) * 100) : 0, ocupadas, total: caras.length },
      canonTarifa: ctS?.pct ?? null, sinRenovar90: isAdmin ? vS.sinRenovar : null, meta: m,
    };
  });
  const totalDeSedes: FilaDeSede | null = filasDeSedes.length < 2 ? null : (() => {
    const n = serie ? serie.meses.length : 0;
    const suma = serie ? Array.from({ length: n }, (_, i) => Object.values(serie.sedes).reduce((t, x) => t + (x.canon[i] ?? 0), 0)) : null;
    const ocup = filasDeSedes.reduce((t, f) => t + f.ocupacion.ocupadas, 0);
    const tot = filasDeSedes.reduce((t, f) => t + f.ocupacion.total, 0);
    return {
      sede: "Todas", canonHoy: isAdmin && suma ? suma[suma.length - 1] : null,
      serie: isAdmin && suma ? suma.slice(-12) : null, variacion: isAdmin && suma ? variacion(suma).pct : null,
      ocupacion: { pct: tot ? Math.round((ocup / tot) * 100) : 0, ocupadas: ocup, total: tot },
      canonTarifa: null,
      sinRenovar90: isAdmin ? filasDeSedes.reduce((t, f) => t + (f.sinRenovar90 ?? 0), 0) : null,
      meta: metas?.general ?? meta,
    };
  })();

  /** Las filas de la tabla de contratos, para bajar (CSV): todas, con su
   *  estado y, para quien administra, la plata al mes. */
  const bajarTabla = () => bajarCsv(`contratos-${sede}.csv`, aCsv(
    ["Espacio", "Proveedor", "Marca", "Estado", "Desde", "Hasta", ...(isAdmin ? ["Canon al mes", "Tarifa al mes"] : [])],
    kpis.todas.filter((t) => t.fase !== "sin_contrato").map(({ entry: e, fase }) => [
      codigoVisible(e), e.supplierName, e.brandCategory, fase, e.startDate, e.endDate,
      ...(isAdmin ? [Math.round(alMesDe(e)), tarifaDeLaFila(referenceRates, sede, e).valor ?? ""] : []),
    ]),
  ));
  const bajarQuienPaga = () => plata && bajarCsv(`quien-paga-${sede}.csv`, aCsv(
    ["Proveedor", unidad === "mes" ? "Canon al mes" : "Total", "% del total", "Vence en 30 días"],
    plata.quienes.map((q) => [q.name, Math.round(q.revenue), q.pct, q.vence ? "sí" : "no"]),
  ));

  return (
    <div
      /* En Vender la pantalla es una HOJA: toma el alto que le deja la barra de
         la aplicación; el plano y «Cuándo se libera» lo llenan y quedan
         quietos, y si el contrato es más alto que la ventana rueda el área de
         la pantalla, con su pie pegado abajo («aire y pines»). Sin scroll de
         documento y sin esconder nada adentro de un panel. En Supervisar sigue
         siendo un documento largo que rueda, que es lo que esa pantalla es. */
      className={modoEfectivo === "vender" && fixtures.length > 0 ? "vender" : "sup"}
      style={
        modoEfectivo === "vender" && fixtures.length > 0
          ? { padding: "10px 12px 12px", background: "var(--bg)" }
          : inicio && fixtures.length > 0
          /* El Inicio rueda por dentro y trae su propia cabecera. */
          ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }
          : { flex: 1, overflowY: "auto", padding: "10px 12px 16px", background: "var(--bg)" }
      }
    >
      {/* ── La barra de la pantalla ────────────────────────────────────────
          Dónde estás, para qué estás, y de qué periodo se está hablando. Las
          tres cosas de las que depende todo lo que se lee abajo, en un solo
          renglón y en ese orden.

          Acá vivía un titular de $12.400.000 en cuerpo 27 con «TERRON · 16
          espacios · 2 sedes activas» debajo. Ese número tenía el tamaño de un
          titular y el contenido de un pie de página: no se decide nada con el
          canon total de la sede, y encima repetía datos que están en la tabla.
          El nombre de la sede tampoco es un hecho, es el estado de un control:
          se dice UNA vez, acá, y no vuelve a aparecer. */}
      {!(inicio && fixtures.length > 0) && (<>
      <div className="barra-pantalla">
        {/* La sede y el modo se fueron al armazón (rediseño UX 2026-10, etapa
            2): la sede se elige UNA vez, en la barra de arriba, y Vender y
            Supervisar son los módulos Contratos e Indicadores del menú. */}

        {/* 3 · DE QUÉ FECHAS hablás: el periodo, en los dos modos. El
            mercaderista está SIEMPRE en Supervisar, así que sacarlo de ahí lo
            dejaría sin control de periodo para siempre.

            Va como TEXTO y no como la fila de siete temporadas: esa fila mide
            700 px y partía la barra en dos renglones, con la fecha y los
            botones caídos abajo. El periodo hay que verlo siempre —todo lo
            que se lee está medido contra él— pero elegirlo es algo que se
            hace de a ratos, así que se ve siempre y se despliega al tocarlo. */}
        {modoEfectivo === "vender" && mapRange ? (
          <ParaQueFechas
            rango={mapRange}
            onCambio={setMapRange}
            temporadasAbiertas={periodoAbierto}
            onTemporadas={() => setPeriodoAbierto((x) => !x)}
          />
        ) : (
        <button
          type="button"
          className="pieza periodo"
          onClick={() => setPeriodoAbierto((x) => !x)}
          aria-expanded={periodoAbierto}
          title="Elegir el periodo"
        >
          <CalendarRange {...ICONO_TARJETA} className="ico" />
          {mapRange ? describeRange(mapRange) : "Hoy"}
          <ChevronDown {...ICONO_TARJETA} className="chev" />
        </button>
        )}

        {/* A la derecha: qué día es hoy y lo que se le hace A LA SEDE. Ninguno
            cambia lo que se está leyendo; sólo lo actualizan. «Tarifas» lleva
            la etiqueta: es la lista de precios, el mismo ícono que la tarjeta
            «Tarifa de referencia» (un concepto, un ícono). */}
        <div className="der">
          <span className="hoy">{hoyLargo}</span>
          {isAdmin && (
            <button
              type="button"
              className="btn-barra"
              onClick={() => setCargaAbierta(true)}
              title="Cargar una tanda de contratos desde un Excel o un CSV"
              aria-label="Planilla"
            >
              <FileSpreadsheet {...ICONO_TARJETA} className="ico" />
              <span className="txt">Planilla</span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="btn-barra"
              onClick={() => setRatesOpen(true)}
              title="Tarifas de referencia por tipo de mueble"
              aria-label="Tarifas"
            >
              <Tag {...ICONO_TARJETA} className="ico" />
              <span className="txt">Tarifas</span>
            </button>
          )}
          {/* «Actualizar» se fue: lo hace el guardado de la barra de arriba,
              que trae los cambios del servidor con un clic. */}
        </div>
      </div>

      {periodoAbierto && (
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap",
          padding: "8px 14px", marginBottom: 10,
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
        }}>
          <SeasonPicker range={mapRange} onChange={setMapRange} />
        </div>
      )}

      </>)}

      {fixtures.length === 0 ? (
        <EmptyDashboard sede={sede} isAdmin={isAdmin} onDisenarPlano={onDisenarPlano} />
      ) : inicio ? (
        <Inicio
          esAdmin={isAdmin}
          sede={sede}
          nombre={nombreDeQuienEntra}
          cifras={{
            contratos: vigentesHoy,
            firmados: kpis.contratos - vigentesHoy,
            porVencer: kpis.expiring.length,
            montajesPorResolver: montaje.sinMontar.length + montaje.noMontado.length,
            canonDelMes,
            disponibles: libresSet.size,
          }}
          filasDeHoy={filasDeHoy}
          cuentaHoy={cuentasDeRevision.hoy}
          totalPendientes={attentionCount}
          onNuevoContrato={isAdmin ? () => setModo("vender") : undefined}
          onVerTabla={() => abrirTablaDesde("occupied", "Inicio", "Contratos activos")}
          onVerPorVencer={() => useArmazon.getState().abrirBandeja("dias30")}
          onVerMontajes={() => onIrAMontajes?.()}
          onVerIndicadores={() => isAdmin
            ? abrirTablaDesde("occupied", "Inicio", "Canon del mes")
            : abrirTablaDesde("free", "Inicio", "Disponibles hoy")}
          onVerPendientes={() => useArmazon.getState().abrirBandeja()}
          onTarifas={isAdmin ? () => setRatesOpen(true) : undefined}
        />
      ) : modoEfectivo === "vender" ? (
        /* Vender: la hoja de D. Cuatro paneles, el plano y la escalera a la
           izquierda, el contrato y la tarifa a la derecha. Sin KPIs — para poner un precio no sirve la ocupación
           de hoy, sirve ver qué hay libre en el periodo, cuándo se suelta lo
           que falta y a cuánto sale. */
        <div className="vender-hoja">
          {/* Dos PILAS («aire y pines»): a la izquierda el plano y «Cuándo
              se libera», del alto de la ventana y quietos (`position:
              sticky`); a la derecha el contrato, de su alto natural, y la
              tarifa debajo. Si el contrato es más alto que la ventana rueda
              la pantalla —no el cuerpo del contrato— y su pie (el total y
              «Guardar») queda pegado abajo. */}
          <div className="hoja-col hoja-izq">
            {panelPlano}
            {panelEscalera}
          </div>
          <div className="hoja-col hoja-der">
          <ModoVender
            espacios={espaciosDelContrato}
            onBorrador={(t) => useArmazon.getState().setBorradorDeVenta(t)}
            ultimo={selected}
            ocupacionDe={participacionDe}
            onVenderAsi={venderAsi}
            onQuitar={quitarDelContrato}
            onCambiarCara={alternarCara}
            onCambiarParte={alternarDeParte}
            onSumarEnTodas={sumarEnTodas}
            onResaltar={destacar}
            sede={sede}
            rango={mapRange}
            cerrado={cerrado}
            onVerFicha={() => {
              const e = ultimoGuardado.current;
              const f = e ? fixtures.find((x) => x.id === e.id) : null;
              if (!f || !e) return;
              setCerrado(null);
              setModo("supervisar");
              revisar(f, e.face);
            }}
            onGuardado={(resumen) => {
              // El primer espacio del contrato, para «Ver la ficha».
              ultimoGuardado.current = enContrato[0] ?? null;
              // El contrato ya está en la base, que es la única verdad de lo
              // comercial. Acá se parcheaba el JSON del layout a mano, mueble
              // por mueble: era la copia que pintaba el mapa, y si esta pestaña
              // se cerraba antes de que el guardado saliera, el contrato
              // quedaba en la base y el espacio se seguía viendo libre. Ahora
              // se vuelve a leer y listo.
              void refrescarComercial();
              // Un porcentaje (o una reserva) no siempre cambia el mapa de la
              // base: la ocupación se vuelve a leer igual.
              if (hayParticipaciones) void recargarOcupacion(sede);
              setSelected(null);
              setAnchor(null);
              setEnContrato([]);
              setSemilla(null);
              setCerrado(resumen);
            }}
            semilla={semilla}
            onCancelar={closeDetail}
            onSeguir={() => setCerrado(null)}
            /* «Editar contrato»: salir sin cambios, o ya guardado, vuelve a
               Supervisar (con la base ya releída al guardar). */
            onSalirDeEdicion={volverDeLaEdicion}
            onVolverASupervisar={volverDeLaEdicion}
            planoPendiente={planoPendiente}
          />
          {panelTarifas}
          </div>
        </div>
      ) : (
        <>
          {/* ── Indicadores (rediseño UX 2026-10, etapa 5): pestañas ──────── */}
          <nav className="ind-pestanas" role="tablist" aria-label="Indicadores">
            {([
              ["resumen", "Resumen"], ["plano", "Plano"], ["contratos", "Contratos"],
              ...(isAdmin && plata ? [["quien", "Quién paga"]] as const : []),
              ...(isAdmin && hayParticipaciones ? [["participaciones", "Participaciones"]] as const : []),
              ...(sedes.length > 1 ? [["sedes", "Todas las sedes"]] as const : []),
              ["detalle", "Detalle"], ["diccionario", "Diccionario"],
            ] as const).map(([id, texto]) => (
              <button key={id} type="button" role="tab" aria-selected={pestanaInd === id} onClick={() => { setPestanaInd(id); setLlegada(null); }}>
                {texto}
              </button>
            ))}
          </nav>

          {pestanaInd === "resumen" && (
            <Resumen
              datos={datosResumen}
              periodo={periodoResumen}
              onPeriodo={setPeriodoResumen}
              onTabla={(que) => abrirTablaDesde("occupied", "Resumen", que === "canon" ? "Canon mensual contratado" : "Canon ÷ tarifa")}
              onVencen={() => {
                // Lo que vence en 90 días, contrato por contrato, está en
                // Detalle › Lo que viene: se abre ahí, en ese capítulo.
                setPestanaInd("detalle"); setLlegada(null);
                window.setTimeout(() => document.querySelector('[data-bloque="lo-que-viene"]')?.scrollIntoView({ block: "start" }), 120);
              }}
              onPendientes={() => useArmazon.getState().abrirBandeja()}
              onMontajes={() => onIrAMontajes?.()}
              onDisponibles={() => {
                // «Contratar estos espacios»: Contratos con los disponibles de
                // hoy ya elegidos (la cara entera de cada uno).
                const lista = libresHoy.map((u) => ({ id: u.cara.fixture.id, face: u.cara.face }));
                setSelected(null); setDetailFull(false); setAnchor(null); setCerrado(null); setSemilla(null);
                setEnContrato(lista);
                setModo("vender");
              }}
              onPlano={() => setPestanaInd("plano")}
            />
          )}

          {pestanaInd === "plano" && (
            <>
          {/* ── LA HOJA DE SUPERVISAR: la misma rejilla que la de Vender ──────
                  Dos columnas en la misma proporción (3 : 2) y filas del
                  mismo alto que el panel del plano de Vender (`--alto-plano`):

                      el plano             │ para revisar (o la ficha)
                      estado por espacio   │ quién paga el canon
                      participaciones de cara, a todo el ancho

                  Cada tarjeta desplaza lo suyo. Por debajo de 1000 px, una sola
                  columna con «Para revisar» primero (dibujo aprobado). */}
              <div className="supervisar-hoja">
                {tarjetaMapa}

                {/* Lo que hay que revisar —o la ficha del espacio elegido, que
                    ocupa su lugar—, al lado del plano donde se lo busca. */}
                <div className="col-revisar">
                  {/* La ficha del espacio ya no ocupa este lugar: se abre en su
                      cajón, la misma en el Inicio y en Indicadores (etapa 3). */}
                  <Card style={{ flex: 1, minHeight: 0 }}>
                    <CardHeader
                      icon={<ClipboardCheck {...ICONO_TARJETA} />}
                      title="Para revisar"
                      right={attentionCount > 0 ? <span className="cuenta" aria-label={`${attentionCount} para revisar`}>{attentionCount}</span> : undefined}
                    />
                    {bandejaAbierta
                      ? <div className="vacio-r">Abierto en Pendientes.</div>
                      : cuerpoDeRevision}
                  </Card>
                </div>

              </div>
            </>
          )}

          {pestanaInd === "contratos" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
                {isAdmin && <SelectorDePlata unidad={unidad} onCambio={setUnidad} />}
                <button type="button" className="ind-csv" onClick={bajarTabla} data-csv-contratos>
                  <Download {...ICONO_TARJETA} /> Bajar todos (CSV)
                </button>
              </div>
          {llegada && (
            <div className="ind-llegada" role="status" data-llegada>
              <span>
                Desde <b>{llegada.desde} › {llegada.cifra}</b>:{" "}
                {mapFilter === "free"
                  ? `los ${visiblesEnTabla} espacios libres en ${sede}.`
                  : `los ${visiblesEnTabla} contratos vigentes hoy en ${sede}${isAdmin ? ", con lo que paga cada uno" : ""}.`}
              </span>
              <button type="button" className="ind-csv" onClick={() => {
                setLlegada(null);
                if (llegada.desde === "Inicio") onIrAlInicio?.(); else setPestanaInd("resumen");
              }}>
                <ArrowLeft {...ICONO_TARJETA} /> Volver {llegada.desde === "Inicio" ? "al Inicio" : "al Resumen"}
              </button>
              <button type="button" className="ind-csv" onClick={() => { setMapFilter("todos"); setLlegada(null); }}>
                Ver todos los espacios
              </button>
            </div>
          )}
          {/* ── Estado por espacio: abajo del plano, y del mismo ancho. Para
              quien no ve plata no hay «quién paga el canon», así que la tabla
              se queda con la fila entera. */}
          <Card style={{ minWidth: 0, minHeight: "min(70vh, 720px)" }}>
            <SpacesTable
              titulo="Estado por espacio"
              espaciosDe={espaciosDelMueble}
              sub={visiblesEnTabla === kpis.filas
                ? `${kpis.filas} espacio${kpis.filas !== 1 ? "s" : ""}`
                : `${visiblesEnTabla} de ${kpis.filas} espacios`}
              derecha={<FiltroTexto valor={mapQuery} onCambio={setMapQuery} etiqueta="Filtrar la tabla" ancho={160} />}
              pestanas={
                <div className="seg" role="group" aria-label="Qué espacios">
                  {chipsTabla.map((c) => (
                    <button key={c.id} type="button" aria-pressed={mapFilter === c.id} onClick={() => { setMapFilter(c.id); setLlegada(null); }}>
                      {c.label} <span className="n">{c.n}</span>
                    </button>
                  ))}
                </div>
              }
              fixtures={fixtures}
              isAdmin={isAdmin}
              query={mapQuery}
              filter={mapFilter}
              montajeDe={montajeDe}
              tarifaDe={tarifaDe}
              sinMontar={sinMontarSet}
              enParte={enParteSet}
              libres={libresSet}
              unidad={unidad}
              cobroDe={isAdmin ? cobroDeFila : undefined}
              periodo={periodoIso ?? undefined}
              selectedId={selected?.id ?? null}
              onSelect={revisar}
              suma={mapFilter === "occupied" && !mapQuery.trim()
                ? `Suma ${unidad === "mes" ? "al mes" : "total"} de los ${visiblesEnTabla} contratos vigentes hoy`
                : undefined}
            />
          </Card>
            </>
          )}

          {pestanaInd === "quien" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
                <SelectorDePlata unidad={unidad} onCambio={setUnidad} />
                <button type="button" className="ind-csv" onClick={() => bajarQuienPaga()} data-csv-quien-paga>
                  <Download {...ICONO_TARJETA} /> Bajar (CSV)
                </button>
              </div>
          {isAdmin && plata && (
            <Card style={{ minWidth: 0, minHeight: 0 }}>
              <CardHeader
                icon={<Building2 {...ICONO_TARJETA} />}
                title="Quién paga el canon"
                right={
                  <label className="orden-sel">
                    <ArrowDownWideNarrow {...ICONO_TARJETA} />
                    <select
                      value={ordenQuienPaga}
                      onChange={(e) => setOrdenQuienPaga(e.target.value === "nombre" ? "nombre" : "monto")}
                      aria-label="Ordenar quién paga el canon"
                    >
                      <option value="monto">Por monto</option>
                      <option value="nombre">Por nombre</option>
                    </select>
                  </label>
                }
              />
              <div className="quien-l">
                {plata.quienes.length === 0 ? (
                  <div className="nota">Sin contratos vigentes con valor registrado.</div>
                ) : (
                  plata.quienes.map((x) => (
                    <SupplierRow
                      key={x.name}
                      name={x.name}
                      revenue={x.revenue}
                      pct={x.pct}
                      vence={x.vence}
                      barra={x.barra}
                    />
                  ))
                )}
                <span className="nota">
                  {unidad === "mes" ? "al mes" : "en total"} · «Al mes | Total», arriba
                  {plata.quienes.some((x) => x.porVentas) ? " · lo cobrado por % de venta, ya cargado" : ""}
                </span>
              </div>
            </Card>
          )}
            </>
          )}

          {pestanaInd === "participaciones" && (
            <>
          {/* «Participaciones de cara»: por cara, lo comprometido y lo dibujado
              el día, el pico y lo disponible del período, con filtro por
              proveedor, día y período (D18). Una tabla a todo el ancho, sólo
              para quien administra y sólo si la sede vende alguna cara así.
              FUERA de la hoja: las filas de la hoja miden `--alto-plano`, y en
              una de ellas esta tarjeta dejaba un blanco de 250 px abajo. Mide
              lo que mide su contenido. */}
          {isAdmin && hayParticipaciones && (
            <Card style={{ minWidth: 0, marginTop: 10 }}>
              <CardHeader icon={<Percent {...ICONO_TARJETA} />} title="Participaciones de cara" right={<span>por cara</span>} />
              <TablaDeParticipaciones sede={sede} muebles={fixtures} />
            </Card>
          )}
            </>
          )}

          {pestanaInd === "sedes" && (
            <TodasLasSedes esAdmin={isAdmin} filas={filasDeSedes} total={totalDeSedes}
              onAbrir={(s) => { useFixtureStore.getState().setSede(s); setPestanaInd("resumen"); }} />
          )}

          {pestanaInd === "detalle" && (
            <Detalle datos={datosDetalle}>
          {/* ── La franja ──────────────────────────────────────────────────
              Cinco cifras y ninguna oración, cada una en su caja (rediseño,
              PR 2). El orden no es decorativo: lo que entra, lo que no entra,
              lo que se puede caer, cuánto de la sala está trabajando, y qué se
              está cobrando sin haberlo armado. A la derecha, UN selector para
              la plata —«Al mes | Total»— que siguen las cifras, la columna de
              valor de la tabla y «Quién paga el canon». Sólo quien administra
              lo ve: el trabajador no ve plata. */}
          <Card style={{ flexShrink: 0, marginBottom: 10 }}>
            <CardHeader
              icon={<Gauge {...ICONO_TARJETA} />}
              title={sede}
              sub={
                <>
                  {mapRange ? describeRange(mapRange) : "Hoy"} · {kpis.contratos} contrato
                  {kpis.contratos === 1 ? "" : "s"} · {kpis.total} caras
                </>
              }
              right={isAdmin ? <SelectorDePlata unidad={unidad} onCambio={setUnidad} /> : undefined}
            />
            {/* La plata sólo para quien la maneja. El servidor ya le borra el
                `negotiatedValue` a un mercaderista y nunca le manda las
                tarifas, así que estas tres cifras le llegarían en cero — y
                «CANON VIGENTE $0» no es discreción, es una sede que parece
                quebrada. Lo que él necesita saber es qué hay que montar y qué
                se está por caer, y eso sí lo ve, contado en espacios. */}
            <div className="cifras">
              {isAdmin && plata ? (
                <>
                  <Cifra
                    icono={<Banknote {...ICONO_TARJETA} />}
                    rotulo="Canon vigente"
                    valor={formatCOP(plata.canon)}
                    notas={[
                      unidad === "mes" ? "al mes · cada contrato en sus meses" : "lo firmado en los contratos vigentes",
                      // Los contratos que se cobran por % de las ventas suman
                      // lo cargado en sus cortes, y se dice cuántos son.
                      ...(plata.porVentas > 0
                        ? [`+ ${plata.porVentas} por % de venta${plata.cargado > 0 ? ` · ${money(plata.cargado)} cargado` : ""}`] : []),
                    ]}
                  />
                  <Cifra
                    icono={<CircleDashed {...ICONO_TARJETA} />}
                    rotulo="Sin alquilar"
                    valor={formatCOP(plata.sinAlquilar)}
                    notas={[
                      `${unidad === "mes" ? "al mes a tarifa" : "en el periodo, a tarifa"} · ${sinAlquilar.caras} cara${sinAlquilar.caras === 1 ? "" : "s"}`,
                      ...(sinAlquilar.sinTarifa > 0
                        ? [`${sinAlquilar.sinTarifa} sin tarifa, fuera de la cuenta`] : []),
                    ]}
                    tasa={`${formatCOP(sinAlquilar.porDia)} por día vacío`}
                  />
                  <Cifra
                    icono={<AlarmClock {...ICONO_TARJETA} />}
                    rotulo="Vence en 30 días"
                    valor={formatCOP(plata.vence)}
                    notas={[`${plata.vencePct} % del canon · ${kpis.expiring.length} espacio${kpis.expiring.length === 1 ? "" : "s"}`]}
                    alarma
                  />
                </>
              ) : (
                <>
                  <Cifra
                    icono={<AlarmClock {...ICONO_TARJETA} />}
                    rotulo="Vence en 30 días"
                    valor={String(kpis.expiring.length)}
                    notas={["contratos que se caen"]}
                    alarma
                  />
                  <Cifra
                    icono={<CircleDashed {...ICONO_TARJETA} />}
                    rotulo="Libres"
                    /* La misma cuenta que la pestaña «Libres» y la clave del plano. */
                    valor={String(libresSet.size)}
                    notas={[`de ${kpis.total} caras`]}
                  />
                </>
              )}
              <Cifra
                icono={<PieChart {...ICONO_TARJETA} />}
                rotulo="Ocupación"
                valor={`${kpis.occPct} %`}
                notas={[
                  `${kpis.occupied} de ${kpis.total} caras${enParte(rangeTally) > 0 ? ` · ${enParte(rangeTally)} vendida${enParte(rangeTally) === 1 ? "" : "s"} en parte` : ""}`,
                  // Vender por partes: cuántas partes corren o están firmadas,
                  // de las que se ofrecen. Sólo si alguien vende por partes.
                  ...(kpis.partesOfrecidas > 0
                    ? [`${kpis.rotuloPartes}: ${kpis.partesVendidas} de ${kpis.partesOfrecidas}`] : []),
                  // Las piezas de lo que no se vende entero, aparte: no son caras.
                  ...kpis.piezasVendidas,
                ]}
                barra={kpis.occPct}
              />
              <Cifra
                icono={<Hammer {...ICONO_TARJETA} />}
                rotulo="Sin montar"
                valor={String(montaje.sinMontar.length)}
                notas={["contratados y sin armar"]}
              />
            </div>
          </Card>
            </Detalle>
          )}

          {pestanaInd === "diccionario" && <Diccionario esAdmin={isAdmin} />}
        </>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {/* La bandeja de Pendientes (etapa 3): «Para revisar» encima de la
          pantalla en uso. Con su clase `sup`: las filas son las de Supervisar. */}
      {bandejaAbierta && (
        <Cajon
          etiqueta="Pendientes"
          titulo="Pendientes"
          sub={`${attentionCount} para revisar en ${sede} · pasá el mouse por una fila y se señala en el plano de Indicadores`}
          onCerrar={cerrarBandeja}
        >
          <div className="sup bandeja">
            {desdeMontaje && (
              <div className="bandeja-desde-montaje" role="status" data-tira-montaje>
                <span>
                  Desde <b>Montajes › <span className="mono">{desdeMontaje.corto}</span></b>:{" "}
                  {desdeMontaje.estado === "falta_zona" ? "falta ubicar su zona en la cara" : "falta su planometría"}
                  {desdeMontaje.quien ? ` (${desdeMontaje.quien})` : ""}.
                  {avisoDelMontaje ? " Está marcado abajo." : ""}
                </span>
                <button type="button" className="btn-s" onClick={() => { onIrAMontajes?.(); }}>
                  <ArrowLeft {...ICONO_TARJETA} /> Volver a Montajes
                </button>
              </div>
            )}
            {cuerpoDeRevision}
          </div>
        </Cajon>
      )}
      {/* La ficha del espacio: la misma desde el Inicio, Indicadores y
          Pendientes, en su cajón (encima de la bandeja si se abrió desde ahí). */}
      {fichaDelEspacio && modoEfectivo !== "vender" && (
        <Cajon etiqueta={`Ficha de ${selected?.code ?? "espacio"}`} sinCabecera capa={1} ancho={520} onCerrar={closeDetail}>
          <div className="sup ficha-en-cajon">{fichaDelEspacio}</div>
        </Cajon>
      )}
      {viewerFile && (
        <FileViewerModal file={viewerFile} onClose={() => setViewerFile(null)} />
      )}
      {ratesOpen && isAdmin && <RatesModal onClose={() => setRatesOpen(false)} />}
      {cargaAbierta && isAdmin && (
        <CargaMasiva
          sede={sede}
          onCerrar={() => setCargaAbierta(false)}
          onGuardado={({ creados }) => {
            // Los contratos ya están en la base, que es la única verdad de lo
            // comercial: alcanza con volver a leerla y el mapa se repinta solo,
            // en todas las sedes y no sólo en la que esté abierta.
            //
            // Acá se armaba un parche con el código corto —`IMP-17`— y se
            // aplicaba sobre los muebles de la sede EN PANTALLA. Como los
            // códigos se repiten entre tiendas, una planilla con la columna
            // «sede» apuntando a otra pintaba vendido el mueble equivocado y
            // dejaba el realmente vendido viéndose libre.
            void refrescarComercial();

            // Queda un desfase que ninguna fusión arregla: un contrato para un
            // espacio que NINGÚN plano dibuja. Ahí no hay nada que pintar, y
            // por eso hay que decirlo — callarlo es lo que produce el «está
            // libre pero no me deja venderlo» meses después.
            const filas = creados.map((c) => {
              const completo = (c.codigo || "").toUpperCase();
              const sedeFila = (c.sede || sede || "").toUpperCase();
              const corto = sedeFila && completo.startsWith(`${sedeFila}-`)
                ? completo.slice(sedeFila.length + 1)
                : completo;
              // `NEV-03-PU2` es la puerta 2 del mueble `NEV-03`: lo que tiene
              // que estar dibujado es el mueble (`partirCodigo`).
              const partido = partirCodigo(corto);
              return {
                sede: sedeFila,
                code: partido.base,
                face: partido.cara,
              };
            });
            const fantasmas = espaciosSinMueble(fixturesBySede, filas);
            if (fantasmas.length) setSinMueble(fantasmas);
          }}
        />
      )}
      {sinMueble && (
        <AvisoSinMueble
          espacios={sinMueble}
          onCerrar={() => setSinMueble(null)}
        />
      )}
    </div>
  );
}
