import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowLeftToLine, ArrowRightToLine, Box, BoxSelect, Check, CircleAlert, CircleCheck, Copy, Crosshair, Eraser, GripVertical,
  History, Maximize2, Minimize2, MoreHorizontal, PenLine, Redo2, RotateCcw, Trash2, Undo2, Wand2, X,
} from "lucide-react";
import { describeError } from "../../api/client";
import { espacioDeLaCara, historial, terminoDeOut, type CaraOut, type EntradaDeHistorial, type HistorialOut, type ZonaOut } from "../../api/participaciones";
import { copiaALaVista, hayParaRecuperar, planoAlDia, useDistribucionStore, claveDeCara } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import { carasDe } from "../../types/espacio";
import { franjaDeLaCopia, motivoParaNoCopiar } from "../../utils/copiaDeZonas";
import { tipoDelMueble } from "../../catalogo/nombresPropios";
import { useFichasPropias } from "../../store/fichasPropias";
import { accionDeTecla, ajustarAlContratado, desdeElServidor, diferencias, revisarZonas, type Accion } from "../../utils/edicionDeZonas";
import { cambioParaDividir, conPartes, revisarCambioDePartes, type CambioDePartes } from "../../utils/partesDelMueble";
import { pct, vivo, type EstadoDeDistribucion } from "../../utils/participaciones";
import {
  FORMAS, acomodarSolas, cajaDe, contadorAMano, dejarJustaAMano, encajar, estantes, franja, lineasDeLaCara,
  lineasDeOcupados, llevaAMano, poligonoDeRect, primeraQuePisa, ubicarSinArrastrar, type FormaDePieza, type Rect,
} from "../../utils/piezas";
import { areaUtil } from "../../utils/zonasGeometria";
import RanuraDelLienzo from "../RanuraDelLienzo";
import CaraDePiezas, { dondeCae, dondeQuedo, uvEnLaCara } from "./CaraDePiezas";
import CopiarZonas from "./CopiarZonas";
import FormularioDeParticipacion from "./FormularioDeParticipacion";
import ResumenDeCambios from "./ResumenDeCambios";
import {
  BOTON, BOTON_PELIGRO, Dialogo, ESTILO_PELIGRO, PreguntaDeCancelar, capacidadDe, datosDeLaCara, fechaLegible,
  useRevisionEnVivo, useVistaDeDistribucion, type PreguntaDeCancelarTipo,
} from "./LeyendaDeParticipaciones";
import {
  alCerrarAMano, cruzanEnFechas, enLista, ocupadosPara, patronDe, textoDelEstado, useCaraDePiezas, usePiezas, usePiezasUI,
  type PatronDePieza, type Pieza,
} from "./piezasDeLaCara";

/**
 * Distribuir una cara «como un juego de piezas» (rediseño aprobado el
 * 2026-10-24; ver `docs/ESTADO.md` → *Distribuir con piezas*). UNA sola vista,
 * en el tema de la app (claro u oscuro): la cara de frente con sus estantes y,
 * al lado (debajo en pantallas angostas), una PIEZA por marca —su proveedor y
 * su marca, nunca el número interno— con su % y su estado. Cada pieza nace con
 * el tamaño EXACTO de su % (`utils/piezas.ts`, con la cuenta del servidor): se
 * arrastra a la cara y encaja; no hay forma de pasarse.
 *
 *   · Forma de la pieza: Franja (de arriba a abajo), Estantes (a lo ancho) o A
 *     mano (el dibujo libre de siempre, con un contador grande).
 *   · «Acomodar solas» las pone en franjas, en el orden de la lista; una cara
 *     sin nada ubicado se acomoda sola al abrirla (la persona revisa).
 *   · «Listo, guardar la cara» es el único amarillo: confirma (el confirmar de
 *     siempre, con su resumen en palabras si cambia algo de lo guardado),
 *     avisa a quién le llega el montaje y, si se vino de Supervisar, vuelve.
 *   · El 3D: una miniatura VIVA debajo de la cara (el mismo motor del editor,
 *     enchufado acá: `RanuraDelLienzo`) y «Ver en 3D» en grande, para mirar,
 *     girar y mostrar. En el 3D no se edita.
 *   · La parte que se vende se crea SÓLO en Vender: acá no hay alta.
 *
 * Nada se pierde en silencio (§9.8): el borrador se guarda solo, «Salir» con
 * cambios pregunta, una falla de red deja el trabajo acá, otra sesión que
 * guardó en el medio ofrece «Traer lo nuevo», y lo que no se pudo guardar al
 * salir vuelve como «Recuperar».
 *
 * El teclado (§9.5): mientras la pantalla está montada, un oyente en CAPTURA de
 * `window` (`atajoDeDistribucion`) se queda con las teclas que el atajo global
 * del editor usaría para borrar, girar o deshacer el MUEBLE (Supr, Retroceso,
 * R, F, Esc, Ctrl+Z/Y): Supr saca la pieza elegida, nunca el mueble; Ctrl+Z
 * deshace la cara, nunca el plano; Esc nunca saca de la pantalla.
 */

/** Las teclas que el atajo global del editor usaría (`StoreEditor3D`). */
const DEL_EDITOR = new Set(["Delete", "Backspace", "r", "R", "f", "F", "Escape"]);

/** Lo que el teclado puede hacer en esta pantalla: deshacer y rehacer, sacar
 *  la pieza elegida, y el trazo «A mano» (Retroceso saca el último punto,
 *  Enter lo cierra, Esc lo cancela o suelta lo elegido). Ni herramientas ni
 *  flechas: una pieza corrida a mano dejaría de dar su % exacto. */
const POR_TECLADO: ReadonlySet<Accion["tipo"]> = new Set<Accion["tipo"]>([
  "deshacer", "rehacer", "borrarZona", "borrarVertice", "quitarPunto", "cerrarTrazo", "cancelarTrazo", "seleccionar",
]);
/** Lo que también se despacha con el foco en la LISTA de piezas o en un botón
 *  de la pantalla: deshacer, rehacer y Esc. Nada que saque o mueva una pieza. */
const DESDE_EL_PANEL: ReadonlySet<Accion["tipo"]> = new Set<Accion["tipo"]>([
  "deshacer", "rehacer", "cancelarTrazo", "seleccionar",
]);

/** Lo que el oyente necesita del evento (un `KeyboardEvent` lo cumple). */
export interface TeclaDeDistribucion {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  stopPropagation: () => void;
  preventDefault: () => void;
}

type Destino = { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;

/**
 * El oyente en captura de Distribuir. Las acciones del reductor
 * (`accionDeTecla`, filtradas por `POR_TECLADO`) se despachan con el foco en la
 * cara —o en ninguna parte (`body`)—; desde la lista y los botones, sólo
 * `DESDE_EL_PANEL`. Las teclas que el atajo global usaría NO le llegan nunca
 * mientras dura la pantalla, tenga el foco quien lo tenga: se cortan acá. Lo
 * que se escribe (campos) y los diálogos mandan: un diálogo se queda con su Esc
 * y su Enter, aunque Supr, R, F y Ctrl+Z igual se cortan. Nunca saca de la
 * pantalla: se sale con «Salir».
 */
export function atajoDeDistribucion(
  e: TeclaDeDistribucion,
  hayModalAbierto: () => boolean = () => typeof document !== "undefined" && !!document.querySelector('[role="dialog"][aria-modal="true"]'),
): void {
  const st = useDistribucionStore.getState();
  if (!st.activa) return;
  const t = e.target as Destino;
  const tag = (t?.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;   // se escribe
  const ctrl = e.ctrlKey || e.metaKey;
  const deshacer = ctrl && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y");
  const delEditor = deshacer || DEL_EDITOR.has(e.key);
  if (t?.closest?.('[role="dialog"]') || hayModalAbierto()) {
    if (delEditor && e.key !== "Escape") e.stopPropagation();
    return;
  }
  // «Más» abierto: Esc lo cierra (y el foco vuelve a su botón); las flechas
  // las atiende el menú. Las teclas del editor igual se cortan.
  if (t?.closest?.("[data-menu-mas]")) {
    if (delEditor) e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); menuAbierto.cerrar?.(); }
    return;
  }
  const enLaCara = tag === "body" || !!t?.closest?.("[data-lienzo-de-zonas]");
  const enLaPantalla = enLaCara || !!t?.closest?.("[data-distribucion]");
  const posible = enLaPantalla ? accionDeTecla(st.edicion, { key: e.key, ctrl, shift: e.shiftKey }) : null;
  const permitida = posible && POR_TECLADO.has(posible.tipo) && (enLaCara || DESDE_EL_PANEL.has(posible.tipo)) ? posible : null;
  // «A mano»: Enter cierra la forma y la deja como LA pieza de esa marca, con
  // el MISMO ajuste solo (±3 %) que tocar el primer punto (`alCerrarAMano`).
  const a: Accion | null = permitida && permitida.tipo === "cerrarTrazo" ? { tipo: "cerrarTrazo", reemplazar: true } : permitida;
  if (a || delEditor) {
    e.stopPropagation();                          // el atajo global no ve la tecla
    if (a) {
      e.preventDefault();
      if (a.tipo === "cerrarTrazo" && alCerrarAMano.actual) alCerrarAMano.actual();
      else st.despachar(a);
    } else if (delEditor && enLaCara) e.preventDefault();
  }
}

/** El «Más» abierto: cómo cerrarlo desde el oyente del teclado (Esc). */
const menuAbierto: { cerrar: (() => void) | null } = { cerrar: null };
/** Los ítems de «Más» que se pueden usar, en orden. */
const itemsDelMenu = (m: HTMLElement | null): HTMLButtonElement[] =>
  m ? [...m.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')] : [];

/** La pista mientras se dibuja «A mano»: qué tocar ahora. */
export function pistaDelTrazo(puntos: number, rehaciendo: boolean): string {
  if (puntos === 0) {
    return rehaciendo
      ? "Rehacela: tocá un punto por cada esquina. Lo de antes queda hasta que cierres la forma nueva."
      : "Tocá un punto por cada esquina: se pegan a los estantes y a los bordes. El círculo grande es el primero: tocalo para cerrar.";
  }
  if (puntos < 3) return "Seguí tocando esquinas: hacen falta al menos tres.";
  return "Seguí tocando esquinas, o tocá el círculo grande (el primer punto) o Enter para cerrar la forma.";
}

/** La pista de una pieza «A mano» YA hecha y elegida (no se está dibujando):
 *  lo que se puede hacer según cómo quedó. Nunca «Tocá un punto…». */
export function pistaDeAMano(p: Pick<Pieza, "corto" | "estado" | "pb" | "dibujado">): string {
  switch (p.estado) {
    case "ubicada": return `${p.corto} está hecha a mano, con ${pct(p.pb)} justo. Para cambiarla, «Rehacer a mano».`;
    case "sobra": return `${p.corto} se pasa ${pct(p.dibujado - p.pb)}: tocá «Achicar a ${pct(p.pb)}» o «Rehacer a mano».`;
    case "falta": return `A ${p.corto} le falta ${pct(p.pb - p.dibujado)}: tocá «Llevar a ${pct(p.pb)}» o «Rehacer a mano».`;
    case "choca": return `${p.corto} pisa a otra marca: «Rehacer a mano» y dibujala en lo verde.`;
    default: return `${p.corto}: «Rehacer a mano» para dibujarla de nuevo.`;
  }
}

/** El estado de la cara, en palabras. */
const ESTADOS: Record<EstadoDeDistribucion, string> = {
  confirmada: "Guardada",
  borrador: "Borrador sin guardar como lista",
  para_revisar: "El mueble cambió: revisala",
  sin_distribuir: "Sin piezas ubicadas",
  sin_mueble: "Sin mueble",
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
/** Cuándo pasó una entrada REAL del historial: «17 oct 2026, 03:24 p. m.».
 *  El día como el de una derivada (`fechaLegible`); la hora, sólo acá. */
const cuandoFue = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fechaLegible(dia)}, ${hora(d.getTime())}`;
};

/** El título de la pantalla: qué SEDE, qué mueble y qué cara (pedido §12: «qué
 *  sede tiene seleccionada el usuario»). */
export function tituloDelPanel(a: { sede: string; codigo: string; cara: "A" | "B" }): string {
  return `${a.sede} · ${a.codigo} · cara ${a.cara}`;
}

/** El título para mostrar: «cara A» nunca se parte en dos renglones (a 390 px
 *  quedaba «cara» al final de uno y «A» solo en el siguiente). */
export function sinCortarLaCara(titulo: string): string {
  return titulo.replace(/cara ([AB])\b/g, "cara\u00A0$1");
}

/** Cómo se llama el mueble al lado del código: su nombre si tiene uno propio
 *  (distinto del código); si no, el tipo y el ancho («Góndola de 1,80 m»),
 *  como lo nombra Vender. */
export function nombreDescriptivo(m: { label?: string | null; type: string; gondolaType?: string | null; modelo?: string | null; w?: number } | null,
  codigo: string, nombres: Parameters<typeof tipoDelMueble>[1]): string {
  if (!m) return "";
  const propio = (m.label ?? "").trim();
  if (propio && propio !== codigo && !codigo.endsWith(propio)) return propio;
  const tipo = tipoDelMueble(m, nombres).replace(/,\s*por (cara|participaci[oó]n)$/i, "").trim();
  if (!tipo) return "";
  return m.w && m.w > 0 ? `${tipo} de ${(Math.round(m.w * 100) % 100 ? m.w.toFixed(2) : m.w.toFixed(0)).replace(".", ",")} m` : tipo;
}

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
/** La medianoche de un día de Colombia (UTC−5, sin horario de verano), en ms. */
const medianocheDeColombia = (dia: string) =>
  Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), 5, 0, 0);

/** Una línea del historial, lista para mostrar. */
export interface LineaDelHistorial {
  clave: string;
  /** El instante, en ms desde 1970: con él se ordena (nunca con el texto). */
  instante: number;
  /** «18 oct 2026» en una derivada (sólo el día); día y hora en una real. */
  cuando: string;
  derivada: boolean;
  actor: string | null;
  detalle: string;
  en: string;
  /** Lo que «Ver cómo estaba» dibuja (sólo las confirmaciones). */
  zonas: ZonaOut[] | null;
  /** Lo que se lee, en palabras simples (`textoDelHistorial`): sin «zona»,
   *  «participación N» ni fechas ISO. `detalle` es el texto del servidor. */
  texto: string;
}

/** Con qué se nombra a cada marca en el historial (sin número interno). */
export interface NombresDelHistorial {
  porTermino: ReadonlyMap<number, string>;
  porSpace: ReadonlyMap<number, string>;
  porNumero: ReadonlyMap<number, string>;
}

/** Los nombres de las marcas de la cara leída: «Snacks Norte · Papitas». */
export function nombresDelHistorial(datos: Pick<CaraOut, "participaciones"> | null): NombresDelHistorial {
  const porTermino = new Map<number, string>(), porSpace = new Map<number, string>(), porNumero = new Map<number, string>();
  for (const p of datos?.participaciones ?? []) {
    const t = p.terminos[0];
    const nombre = t ? (t.marca ? `${t.proveedor?.nombre ?? "Sin proveedor"} · ${t.marca}` : t.proveedor?.nombre ?? "Sin proveedor") : "una marca";
    porSpace.set(p.space_id, nombre);
    porNumero.set(p.numero, nombre);
    for (const x of p.terminos) porTermino.set(x.id, x.marca ? `${x.proveedor?.nombre ?? "Sin proveedor"} · ${x.marca}` : x.proveedor?.nombre ?? nombre);
  }
  return { porTermino, porSpace, porNumero };
}

const ISO_DIA = /\b(\d{4}-\d{2}-\d{2})(T[\d:.+-]+)?\b/g;
/** Un texto viejo del servidor, sin la jerga: «Participación 3» → «una marca»,
 *  «zona» → «pieza», «2026-10-24→2027-03-31» → «24 oct 2026 al 31 mar 2027». */
export function sinJerga(t: string): string {
  return t
    .replace(/[Ll]a participación \d+/g, "una marca").replace(/[Pp]articipación \d+/g, "una marca")
    .replace(/participaciones/g, "marcas").replace(/participación/g, "marca")
    .replace(/\bzonas\b/g, "piezas").replace(/\bzona\b/g, "pieza").replace(/\bZonas\b/g, "Piezas").replace(/\bZona\b/g, "Pieza")
    .replace(ISO_DIA, (_m, dia: string) => fechaLegible(dia))
    .replace(/\s*→\s*/g, " al ")
    .replace(/\s*·\s*·\s*/g, " · ");
}

const leer = (o: Record<string, unknown> | null | undefined, k: string): unknown => (o && typeof o === "object" ? o[k] : undefined);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const numero = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Una entrada del historial en palabras simples, armada EN EL CLIENTE desde
 * los datos (acción, antes/después y los nombres de la cara): el texto del
 * servidor dice «Contrato · Participación 1 · 60 % · … · 2026-10-01→2026-11-15»
 * y «Confirmada: 1 zona de 1 participación», y lo usan también la bitácora y
 * los correos (no se cambia allá). Lo que no se conoce pasa por `sinJerga`.
 */
export function textoDelHistorial(e: Pick<EntradaDeHistorial, "accion" | "detalle" | "antes" | "despues"> & { participacion_id?: number | null },
  n: NombresDelHistorial): string {
  const d = e.despues as Record<string, unknown> | null;
  const proveedor = texto(leer(d, "proveedor")), marca = texto(leer(d, "marca"));
  const quien = (proveedor ? (marca ? `${proveedor} · ${marca}` : proveedor) : null)
    ?? (e.participacion_id != null ? n.porTermino.get(e.participacion_id) ?? null : null) ?? "una marca";
  const pb = numero(leer(d, "puntos_basicos"));
  const desde = texto(leer(d, "desde")), hasta = texto(leer(d, "hasta")), caduca = texto(leer(d, "caduca"));
  const vig = desde && hasta ? `, del ${fechaLegible(desde)} al ${fechaLegible(hasta)}` : "";
  const marcasDe = (zonas: unknown, porNumero: boolean): string[] => {
    const nombres: string[] = [];
    if (Array.isArray(zonas)) {
      for (const z of zonas) {
        const s = numero(leer(z as Record<string, unknown>, "participacion_space_id"));
        const nom = s !== null ? n.porSpace.get(s) ?? null : null;
        if (nom && !nombres.includes(nom)) nombres.push(nom);
      }
    } else if (zonas && typeof zonas === "object") {
      for (const k of Object.keys(zonas)) {
        const nom = (porNumero ? n.porNumero.get(Number(k)) : n.porSpace.get(Number(k))) ?? null;
        if (nom && !nombres.includes(nom)) nombres.push(nom);
      }
    }
    return nombres;
  };
  switch (e.accion) {
    case "participacion.contrato": return `Se vendió ${pb !== null ? `el ${pct(pb)} de la cara ` : ""}a ${quien}${vig}.`;
    case "participacion.reserva": return `Se reservó ${pb !== null ? `el ${pct(pb)} de la cara ` : ""}para ${quien}${vig}${caduca ? `; la reserva caduca el ${fechaLegible(caduca)}` : ""}.`;
    case "participacion.confirmada": return `La reserva de ${quien} pasó a contrato${vig}.`;
    case "participacion.renovada": return `Se renovó el contrato de ${quien}${vig}.`;
    case "participacion.editada": return `Se cambió la reserva de ${quien}${vig}.`;
    case "reserva.cancelada": case "reserva.baja": return `Se canceló la reserva de ${quien}.`;
    case "contrato.cancelado": return `Se canceló el contrato de ${quien}.`;
    case "contrato.editado": return `Se corrigió el contrato de ${quien}.`;
    case "contrato.reemplazado": return `Se reemplazó el contrato de ${quien}.`;
    case "contrato.importado": return `El contrato de ${quien} pasó a la base.`;
    case "participacion.vencida": return `Venció el contrato de ${quien}.`;
    case "reserva.caducada": return `Caducó la reserva de ${quien}.`;
    case "distribucion.confirmada": {
      const m = marcasDe(leer(d, "zonas"), false);
      return m.length === 0 ? "Se guardó la cara sin piezas." : `Se guardó la cara: ${enLista(m)} ${m.length === 1 ? "quedó ubicada" : "quedaron ubicadas"}.`;
    }
    case "distribucion.borrador": {
      if (/^Confirmación rechazada/.test(e.detalle)) return "No se pudo guardar como lista: quedó como borrador para revisarla.";
      const m = marcasDe(leer(d, "zonas"), true);
      return m.length === 0 ? "Se guardó un borrador sin piezas." : `Se guardó un borrador con ${enLista(m)}.`;
    }
    case "distribucion.descartada": return "Se descartó el borrador.";
    case "distribucion.copiada": return "Se copiaron las piezas de otra cara, como borrador.";
    case "distribucion.division": return "La cara pasó a venderse por partes, una por marca.";
    case "distribucion.otro_mueble": return "El mueble del plano cambió: lo de antes quedó guardado acá.";
    case "distribucion.para_revisar": return "El mueble cambió: hay que revisar la cara.";
  }
  return sinJerga(e.detalle);
}

/**
 * El historial de la cara, del más nuevo al más viejo. Las entradas DERIVADAS
 * (un vencimiento, una caducidad: salen de las fechas) traen `dia`, el día de
 * Colombia en que pasó, y se muestran con el DÍA solo, leído como texto
 * (`fechaLegible`): con `new Date("2026-10-18")` en Colombia decía «17 oct».
 * Se ordenan por el instante, no comparando textos. Un servidor viejo manda
 * `en` como día solo: se lee igual, como día de Colombia.
 */
export function lineasDelHistorial(h: HistorialOut, nombres: NombresDelHistorial = nombresDelHistorial(null)): LineaDelHistorial[] {
  const lineas: LineaDelHistorial[] = [];
  for (const e of h.entradas) {
    const zonas = e.accion === "distribucion.confirmada" && e.despues && Array.isArray((e.despues as { zonas?: unknown }).zonas)
      ? (e.despues as { zonas: ZonaOut[] }).zonas : null;
    const instante = SOLO_DIA.test(e.en) ? medianocheDeColombia(e.en) : Date.parse(e.en);
    lineas.push({ clave: `e${e.id}`, instante, cuando: cuandoFue(e.en), derivada: false, actor: e.actor, detalle: e.detalle, en: e.en, zonas,
      texto: textoDelHistorial(e, nombres) });
  }
  h.derivados.forEach((d, i) => {
    const dia = typeof d.dia === "string" && SOLO_DIA.test(d.dia) ? d.dia : SOLO_DIA.test(d.en) ? d.en : null;
    const conZona = SOLO_DIA.test(d.en) ? NaN : Date.parse(d.en);
    const instante = Number.isNaN(conZona) ? (dia ? medianocheDeColombia(dia) : NaN) : conZona;
    lineas.push({
      clave: `d${i}`, instante, cuando: dia ? fechaLegible(dia) : cuandoFue(d.en), derivada: true,
      actor: null, detalle: d.detalle, en: d.en, zonas: null,
      texto: textoDelHistorial({ accion: d.accion, detalle: d.detalle, antes: null, despues: null, participacion_id: d.participacion_id }, nombres),
    });
  });
  const valor = (x: LineaDelHistorial) => (Number.isNaN(x.instante) ? -Infinity : x.instante);
  return lineas.map((l, i) => ({ l, i })).sort((a, b) => valor(b.l) - valor(a.l) || a.i - b.i).map((x) => x.l);
}

type Pregunta = { tipo: "cara"; cara: "A" | "B" } | { tipo: "salir" } | { tipo: "descartarBorrador" } | null;

/** Lo que dice «Descartar el borrador guardado» antes de hacerlo: también se
 *  pierde lo que se cambió en pantalla y no se guardó. */
export function textoDeDescartarBorrador(c: { cara: "A" | "B"; hayConfirmada: boolean; sucio: boolean }): string[] {
  const fuera = [
    `Se borra el borrador guardado de la cara ${c.cara}${c.hayConfirmada ? " y vuelve a verse la que estaba guardada como lista" : ""}. Queda anotado en el historial.`,
  ];
  if (c.sucio) fuera.push("También se pierden los cambios que hiciste en pantalla y todavía no guardaste.");
  return fuera;
}

/**
 * El aviso de montaje que dispara «Listo» (decisión del dueño, 2026-10-29: en
 * un contrato por porcentaje la zona confirmada ES su plano —ya no espera un
 * archivo—, así que el correo sale al guardar, una vez). Se nombran las marcas
 * con CONTRATO que entran o cambian de lugar al guardar (una reserva no manda
 * correos; a la que no cambió, su aviso ya salió).
 */
export function avisoDeMontaje(marcas: readonly string[]): string {
  const unicas = [...new Set(marcas.filter(Boolean))];
  if (unicas.length === 0) return "";
  const una = unicas.length === 1;
  return `A ${enLista(unicas)} ${una ? "le" : "les"} llega el aviso de montaje con su lugar.`;
}

/** El resumen de lo que cambia al guardar, en palabras, por marca. */
export function resumenLlano(cambios: ReturnType<typeof diferencias>, nombre: (s: number) => string): string[] {
  return cambios.participaciones.map((c) => {
    const quien = nombre(c.spaceId);
    if (c.dibujadoAntes === 0 && c.dibujadoDespues > 0) return `${quien}: entra a la cara (${pct(c.dibujadoDespues)}).`;
    if (c.dibujadoDespues === 0 && c.dibujadoAntes > 0) return `${quien}: sale de la cara.`;
    if (c.agregadas + c.borradas + c.cambiadas > 0) return `${quien}: cambia de lugar (${pct(c.dibujadoDespues)}).`;
    return `${quien}: ${pct(c.dibujadoAntes)} → ${pct(c.dibujadoDespues)}.`;
  });
}

/** El bloque de una marca en la lista: su color, del ancho de su %, LISO como
 *  la pieza (con los mismos puntos si otra marca de la cara tiene su tono). */
function Bloque({ p, chico = false, patron = "lisa" }: { p: Pick<Pieza, "tono" | "pb">; chico?: boolean; patron?: PatronDePieza }) {
  const ancho = Math.max(14, Math.min(46, Math.round((p.pb / 10000) * 92)));
  const fondo = `color-mix(in srgb, ${p.tono} 22%, rgb(var(--surface-rgb)))`;
  const paso = patron === "puntos" ? 7 : 11, r = patron === "puntos" ? 1.3 : 2.6;
  return (
    <span aria-hidden className="inline-block flex-shrink-0 rounded-md border-2" data-patron={patron}
      style={{ width: chico ? Math.min(ancho, 24) : ancho, height: chico ? 22 : 34, borderColor: p.tono,
        background: patron === "lisa" ? fondo
          : `radial-gradient(circle, ${p.tono} ${r}px, transparent ${r + 0.6}px) ${paso / 2}px ${paso / 2}px / ${paso}px ${paso}px, ${fondo}` }} />
  );
}

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export default function DistribuirCara({ fixtureId, sede, onEncuadrarCara, lienzo3D }: {
  fixtureId: string;
  sede: string;
  onEncuadrarCara: (cara: "A" | "B") => void;
  /** El anfitrión del lienzo 3D del editor (se enchufa en la miniatura o en grande). */
  lienzo3D: HTMLElement | null;
}) {
  const activa = useDistribucionStore((s) => s.activa);
  const datos = useDistribucionStore((s) => s.datos);
  const cargando = useDistribucionStore((s) => s.cargando);
  const error = useDistribucionStore((s) => s.error);
  const edicion = useDistribucionStore((s) => s.edicion);
  const sucio = edicion.sucio;
  const guardado = useDistribucionStore((s) => s.guardado);
  const formulario = useDistribucionStore((s) => s.formulario);
  const pedidoDeCara = useDistribucionStore((s) => s.pedidoDeCara);
  const fusion = useDistribucionStore((s) => s.fusion);
  const recuperable = useDistribucionStore(hayParaRecuperar);
  const copiaVisible = useDistribucionStore(copiaALaVista);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[sede] ?? selectFixtures(s)).find((f) => f.id === fixtureId) ?? null);
  const nombresPropios = useFixtureStore((s) => s.catalogLabels);
  // El nombre del tipo depende de las fichas del supermercado: cuando llegan,
  // el título se vuelve a armar.
  const fichasPropias = useFichasPropias();
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const planoSinGuardar = useFixtureStore((s) => !!s.dirty[sede]);
  const ultimoGuardadoDelPlano = useFixtureStore((s) => s.lastSyncedAt);
  const comoEstaba = useVistaDeDistribucion((s) => s.comoEstaba);
  const rev = useRevisionEnVivo();
  const cara = useCaraDePiezas(fixtureId, sede);
  const piezas = usePiezas();
  const elegida = usePiezasUI((s) => s.elegida);
  const arrastre = usePiezasUI((s) => s.arrastre);
  const ver3D = usePiezasUI((s) => s.ver3D);
  const pistaGuardada = usePiezasUI((s) => s.pista);
  const ajuste = usePiezasUI((s) => s.ajuste);
  // La pista vale mientras la cara siga como estaba cuando se dijo: deshacer,
  // rehacer o mover otra pieza la vuelven vieja, y entonces habla el estado.
  const pista = pistaGuardada && pistaGuardada.zonas === edicion.zonas ? pistaGuardada.texto : null;
  const ajusteVigente = ajuste && ajuste.zonas === edicion.zonas ? ajuste : null;
  const acomodadas = usePiezasUI((s) => s.acomodadas);

  const [pregunta, setPregunta] = useState<Pregunta>(null);
  const [mensajeDePregunta, setMensajeDePregunta] = useState<string | null>(null);
  const [mas, setMas] = useState(false);
  const [menuDe, setMenuDe] = useState<number | null>(null);
  const [cancelar, setCancelar] = useState<PreguntaDeCancelarTipo | null>(null);
  const [avisoCancelar, setAvisoCancelar] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [lineas, setLineas] = useState<HistorialOut | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<{ titulo: string; texto: string } | null>(null);
  const [division, setDivision] = useState<{ problema?: string; aviso?: string; cambio?: CambioDePartes } | null>(null);
  const [dividiendo, setDividiendo] = useState(false);

  const st = useDistribucionStore.getState;
  const ui = usePiezasUI.getState;

  /* ── «Más» se cierra tocando afuera ──────────────────────────────────────── */
  const menuMas = useRef<HTMLDivElement>(null);
  const botonMas = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mas) return;
    const afuera = (e: PointerEvent) => { if (menuMas.current && !menuMas.current.contains(e.target as Node)) setMas(false); };
    window.addEventListener("pointerdown", afuera, { capture: true });
    // Al abrirse, el foco entra al primer ítem que se puede usar; Esc (lo
    // atiende el oyente del teclado) lo cierra y el foco vuelve a «Más».
    menuAbierto.cerrar = () => { setMas(false); botonMas.current?.focus(); };
    itemsDelMenu(menuMas.current)[0]?.focus();
    return () => { window.removeEventListener("pointerdown", afuera, { capture: true }); menuAbierto.cerrar = null; };
  }, [mas]);
  /** Flechas, Inicio y Fin entre los ítems de «Más»; Tab lo cierra. */
  const teclaDelMenu = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemsDelMenu(menuMas.current);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (k: number) => { e.preventDefault(); items[(k + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(items.length - 1);
    else if (e.key === "Tab") setMas(false);
  };

  /* ── El teclado: en captura, mientras la pantalla está montada ──────────── */
  useEffect(() => {
    const enCaptura = (e: KeyboardEvent) => atajoDeDistribucion(e);
    window.addEventListener("keydown", enCaptura, { capture: true });
    return () => window.removeEventListener("keydown", enCaptura, { capture: true });
  }, []);

  /* ── Cerrar la pestaña con cambios sin guardar ───────────────────────────── */
  useEffect(() => {
    if (!sucio) return;
    const antesDeIrse = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", antesDeIrse);
    return () => window.removeEventListener("beforeunload", antesDeIrse);
  }, [sucio]);

  /* ── Encuadrar la cara en el 3D al entrar, al cambiar de cara y al agrandarlo ── */
  // Después del redimensionado (dos cuadros: el ResizeObserver del 3D corre antes de pintar).
  const encuadrar = useRef(onEncuadrarCara);
  encuadrar.current = onEncuadrarCara;
  useEffect(() => {
    if (!activa) return;
    const caraActiva = activa.cara;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => encuadrar.current(caraActiva)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [activa?.fixtureId, activa?.cara, ver3D]);

  /* ── El plano tiene cambios sin guardar: la edición espera ───────────────── */
  const alDia = planoAlDia(datos, mueble);
  useEffect(() => {
    if (!datos || alDia || planoSinGuardar || cargando) return;
    void st().traerLoNuevo();
  }, [alDia, planoSinGuardar, ultimoGuardadoDelPlano, datos?.firma]);
  const volverAEditar = useRef(false);
  useEffect(() => {
    if (!datos) return;
    const ed = st().edicion;
    if (!alDia && ed.modo === "editar") { volverAEditar.current = true; st().despachar({ tipo: "elegirModo", modo: "mirar" }); }
    else if (alDia && volverAEditar.current) {
      volverAEditar.current = false;
      if (ed.modo === "mirar") st().despachar({ tipo: "elegirModo", modo: "editar" });
    } else if (alDia && ed.modo === "mirar") st().despachar({ tipo: "elegirModo", modo: "editar" });
  }, [alDia, !!datos]);

  /* ── El historial (se pide al abrirlo) ───────────────────────────────────── */
  useEffect(() => {
    setLineas(null);
    setErrorHistorial(null);
    if (!verHistorial || !activa) return;
    let vale = true;
    historial({ sede: activa.sede, espacio: espacioDeLaCara(activa.codigo, activa.cara), limite: 50 })
      .then((h) => { if (vale) setLineas(h); })
      .catch((e) => { if (vale) setErrorHistorial(describeError(e, "No se pudo leer el historial.")); });
    return () => { vale = false; };
  }, [verHistorial, activa?.fixtureId, activa?.cara, datos?.distribucion?.version]);

  const editable = !!datos?.por_participacion && !!datos.superficie && alDia;
  const puedeEditar = editable && edicion.modo === "editar" && !cargando;
  const hoy = datos?.hoy ?? "";
  const porS = useMemo(() => new Map(piezas.map((p) => [p.spaceId, p])), [piezas]);
  const nombreDe = (s: number) => porS.get(s)?.corto ?? (datos ? (datosDeLaCara(datos).porSpace.get(s)?.terminos[0]?.marca ?? "otra marca") : "otra marca");
  const piezaElegida = elegida !== null ? porS.get(elegida) ?? null : null;

  /* ── Acomodar solas: al entrar a una cara sin nada ubicado, una vez ───────── */
  const acomodar = (alEntrar = false) => {
    if (!cara || !datos || !puedeEditar) return 0;
    const sin = piezas.filter((p) => p.estado === "sin_ubicar");
    if (sin.length === 0) return 0;
    const fijas = piezas.filter((p) => p.poligonos.length > 0).map((p) => ({ spaceId: p.spaceId, poligonos: p.poligonos }));
    const puestas = acomodarSolas(cara, sin.map((p) => ({ spaceId: p.spaceId, pb: p.pb })), fijas, cruzanEnFechas(piezas, hoy));
    if (puestas.size > 0) {
      if (!alEntrar) mostrarLaCara();
      st().despachar({ tipo: "ponerPiezas", piezas: [...puestas].map(([spaceId, r]) => ({ spaceId, vertices: [poligonoDeRect(r)] })) });
      for (const s of puestas.keys()) ui().ponerForma(s, "franja");
    }
    const faltan = sin.filter((p) => !puestas.has(p.spaceId));
    ui().decir(faltan.length > 0
      ? `${enLista(faltan.map((p) => p.corto))} no ${faltan.length === 1 ? "entra" : "entran"} como franja: ubicala en Estantes o a mano.`
      : alEntrar
        ? `Las acomodé solas en franjas, en el orden de la lista. Revisalas y tocá «Listo, guardar la cara».`
        : `${puestas.size === 1 ? "Quedó ubicada" : "Quedaron ubicadas"} en franjas, una al lado de la otra.`);
    return puestas.size;
  };
  const claveDeEntrada = activa && datos ? `${claveDeCara(activa)}|${datos.distribucion?.version ?? 0}` : null;
  useEffect(() => {
    if (!claveDeEntrada || !puedeEditar || recuperable || acomodadas.includes(claveDeEntrada)) return;
    ui().anotarAcomodada(claveDeEntrada);
    // Sólo una cara sin NADA ubicado: si ya hay algo dibujado, no se toca.
    if (edicion.zonas.length > 0 || piezas.length === 0) return;
    acomodar(true);
  }, [claveDeEntrada, puedeEditar, recuperable, piezas.length]);

  /* ── Soltar una pieza (de la lista o moviéndola en la cara) ──────────────── */
  const relojDelChoque = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soltar = (spaceId: number, rect: Rect | null, pisa: number | null) => {
    const p = porS.get(spaceId);
    if (!p || !rect || !puedeEditar) return;
    if (pisa !== null) {
      ui().ponerChoque({ spaceId, rect, con: pisa });
      ui().decir(`Ahí ya está ${nombreDe(pisa)}: soltala en lo verde.`);
      if (relojDelChoque.current) clearTimeout(relojDelChoque.current);
      relojDelChoque.current = setTimeout(() => ui().ponerChoque(null), 2600);
      return;
    }
    ui().ponerChoque(null);
    st().despachar({ tipo: "ponerPiezas", piezas: [{ spaceId, vertices: [poligonoDeRect(rect)] }] });
    ui().elegir(spaceId);
    ui().decir(`${p.corto} quedó ubicada: ${pct(p.pb)} justo.`);
  };
  useEffect(() => () => { if (relojDelChoque.current) clearTimeout(relojDelChoque.current); }, []);

  /** Arrastrar una pieza desde la lista: sigue al dedo y, sobre la cara,
   *  muestra dónde caería (la misma cuenta que soltarla). */
  const empezarArrastre = (p: Pieza, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !puedeEditar || p.forma === "a_mano" || !cara) return;
    const desde = { x: e.clientX, y: e.clientY };
    const boton = e.currentTarget;
    boton.setPointerCapture(e.pointerId);
    ui().ponerArrastre({ spaceId: p.spaceId, desde: "lista", x: e.clientX, y: e.clientY, rect: null, pisa: null, movida: false });
    const mover = (ev: PointerEvent) => {
      const a = ui().arrastre;
      if (!a) return;
      const movida = a.movida || Math.hypot(ev.clientX - desde.x, ev.clientY - desde.y) >= 4;
      const uv = movida ? uvEnLaCara(ev.clientX, ev.clientY, cara.ancho, cara.alto) : null;
      const donde = uv ? dondeCae(cara, p, usePiezasUIPiezas.actual, hoy, uv[0], uv[1]) : { rect: null, pisa: null };
      ui().ponerArrastre({ ...a, x: ev.clientX, y: ev.clientY, movida, rect: donde.rect, pisa: donde.pisa });
    };
    const fin = () => {
      boton.removeEventListener("pointermove", mover);
      boton.removeEventListener("pointerup", fin);
      boton.removeEventListener("pointercancel", cancelarArrastre);
      const a = ui().arrastre;
      ui().ponerArrastre(null);
      arrastrada.current = true;                  // el clic que sigue ya está atendido
      if (!a) return;
      if (!a.movida) { elegirPieza(p.spaceId); return; }
      if (a.rect) soltar(p.spaceId, a.rect, a.pisa);
      else ui().decir(`Soltá «${p.corto}» sobre la cara (lo verde está libre).`);
    };
    const cancelarArrastre = () => {
      boton.removeEventListener("pointermove", mover);
      boton.removeEventListener("pointerup", fin);
      boton.removeEventListener("pointercancel", cancelarArrastre);
      ui().ponerArrastre(null);
    };
    boton.addEventListener("pointermove", mover);
    boton.addEventListener("pointerup", fin);
    boton.addEventListener("pointercancel", cancelarArrastre);
  };
  const arrastrada = useRef(false);
  usePiezasUIPiezas.actual = piezas;

  const elegirPieza = (s: number) => {
    ui().elegir(s);
    const p = porS.get(s);
    if (p?.zonas[0]) st().despachar({ tipo: "seleccionar", zona: p.zonas[0].clave });
    // Elegir una pieza nunca empieza a dibujarla: una «A mano» YA hecha se
    // rehace sólo con «Rehacer a mano» (un toque en lo libre la rehacía sin
    // querer). Una «A mano» sin nada dibujado sí empieza el trazo: es lo único
    // que se puede hacer con ella.
    if (p?.forma === "a_mano" && p.poligonos.length === 0 && puedeEditar) empezarAMano(p);
    else salirDelTrazo();
  };
  /** Empezar (o rehacer) el trazo «A mano» de una pieza. */
  const empezarAMano = (p: Pieza) => {
    st().despachar({ tipo: "elegirActiva", spaceId: p.spaceId });
    st().despachar({ tipo: "elegirHerramienta", herramienta: "poligono" });
    ui().decir(p.poligonos.length > 0
      ? `Rehacé ${p.corto}: tocá un punto por cada esquina. Lo de antes queda hasta que cierres la forma nueva.`
      : "A mano: tocá un punto por cada esquina. Se pegan a los estantes y a los bordes; el círculo grande es el primero: tocalo (o Enter) para cerrar.");
  };
  /** Dejar de dibujar (sin tocar lo ya dibujado). */
  const salirDelTrazo = () => {
    if (st().edicion.trazo) st().despachar({ tipo: "cancelarTrazo" });
    if (st().edicion.herramienta !== "seleccionar") st().despachar({ tipo: "elegirHerramienta", herramienta: "seleccionar" });
  };
  /** Ubicar sin arrastrar (el menú de la pieza y, en la cara, las flechas). */
  const ubicarSinArrastre = (p: Pieza, como: "primero" | "izquierda" | "derecha") => {
    if (!cara || !puedeEditar || p.forma === "a_mano") return;
    const r = ubicarSinArrastrar(cara, p.pb, p.forma, ocupadosPara(p.spaceId, piezas, hoy), p.estado === "sin_ubicar" ? null : p.rect, como);
    if (!r) {
      ui().decir(como === "primero" ? `${p.corto} no entra entera en ningún hueco libre: probá en Estantes o a mano.` : `${p.corto}: no hay más lugar libre a la ${como}.`);
      return;
    }
    mostrarLaCara();
    soltar(p.spaceId, r, null);
    ui().decir(`${p.corto} quedó ${dondeQuedo(r, cara.ancho)}: ${pct(p.pb)} justo.`);
  };

  /** Cambiar la forma de la elegida: «A mano» abre el trazo; Franja y
   *  Estantes la vuelven a armar en su lugar, con su % exacto. */
  /** En una pantalla angosta la cara queda arriba de la lista: al cambiar la
   *  forma o acomodarlas, se vuelve a ver lo que cambió. */
  const caraRef = useRef<HTMLDivElement>(null);
  const mostrarLaCara = () => {
    const el = caraRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const cambiarForma = (f: FormaDePieza) => {
    const p = piezaElegida;
    if (!p || !cara || !puedeEditar) return;
    mostrarLaCara();
    ui().ponerForma(p.spaceId, f);
    if (f === "a_mano") { empezarAMano(p); return; }
    salirDelTrazo();
    const caja = cajaDe(p.poligonos);
    if (!caja) return;
    const ocupados = ocupadosPara(p.spaceId, piezas, hoy);
    const u = (caja.u0 + caja.u1) / 2, v = (caja.v0 + caja.v1) / 2;
    const r = encajar(cara, p.pb, f, u, f === "estantes" ? caja.v0 + 0.02 : v, ocupados, { radio: 0.03 });
    const pisa = r ? primeraQuePisa([poligonoDeRect(r)], ocupados, cara) : null;
    if (r && pisa === null) {
      st().despachar({ tipo: "ponerPiezas", piezas: [{ spaceId: p.spaceId, vertices: [poligonoDeRect(r)] }] });
      ui().decir(f === "franja" ? `${p.corto}: de arriba a abajo, ${pct(p.pb)} justo.` : `${p.corto}: a lo ancho, apoyada en un estante. Estirala y se acomoda sola.`);
    } else {
      ui().decir(`Ahí no entra como ${f === "franja" ? "franja" : "estantes"}: arrastrala a lo verde.`);
    }
  };

  /** Volver a dejar justa una pieza que quedó corta o pasada (un dato viejo,
   *  o el mueble que cambió): Franja y Estantes se rearman en su lugar; una a
   *  mano se achica con el ajuste de siempre. */
  const dejarJusta = (p: Pieza) => {
    if (!cara || !datos?.superficie || !puedeEditar) return;
    if (p.rect && p.forma !== "a_mano") {
      const r = p.forma === "franja" ? (franja(cara, p.pb, p.rect.u0, "derecha") ?? franja(cara, p.pb, p.rect.u1, "izquierda"))
        : estantes(cara, p.pb, p.rect.u0, p.rect.u1, p.rect.v0);
      if (r) st().despachar({ tipo: "ponerPiezas", piezas: [{ spaceId: p.spaceId, vertices: [poligonoDeRect(r)] }] });
      return;
    }
    achicar(p);
  };
  /** «Achicar a 30 %» / «Llevar a 30 %»: corriendo un lado suelto si se puede
   *  (queda justa); si no, el ajuste de siempre (`ajustarAlContratado`), sin pisar
   *  a las que rigen en las mismas fechas si se puede. */
  const achicar = (p: Pieza) => {
    const sup = datos?.superficie;
    if (!sup || !puedeEditar) return;
    const otras = ocupadosPara(p.spaceId, piezas, hoy).map((o) => [...o.poligonos]);
    // Una forma de UNA pieza: primero, corriendo un lado (queda justa, no «por
    // debajo»); si no se puede, el achique de siempre.
    if (cara && p.poligonos.length === 1 && p.poligonos[0]) {
      const l = lineasDeLaCara(cara), o = lineasDeOcupados(ocupadosPara(p.spaceId, piezas, hoy));
      const justa = dejarJustaAMano(p.poligonos[0], cara, p.pb, otras.flat(), { us: [...l.us, ...o.us], vs: [...l.vs, ...o.vs] });
      if (justa) { st().despachar({ tipo: "ajustarZonas", spaceId: p.spaceId, vertices: [justa] }); return; }
    }
    if (p.dibujado < p.pb) {
      ui().decir(`${p.corto}: no se llega a ${pct(p.pb)} corriendo un lado. Rehacela con más puntos o pasala a Franja.`);
      return;
    }
    const nuevas = ajustarAlContratado(p.poligonos, sup.exclusiones, p.pb, areaUtil(sup.exclusiones), otras, { ancho: sup.ancho, alto: sup.alto });
    st().despachar({ tipo: "ajustarZonas", spaceId: p.spaceId, vertices: nuevas });
  };

  const sacar = (p: Pieza) => {
    st().despachar({ tipo: "ponerPiezas", piezas: [{ spaceId: p.spaceId, vertices: [] }] });
    ui().decir(`${p.corto} salió de la cara: arrastrala de nuevo cuando quieras.`);
  };

  /* ── Salir, cambiar de cara, descartar ───────────────────────────────────── */
  const irseASupervisar = (aviso: string | null) => {
    if (activa?.volverA === "supervisar") useFixtureStore.getState().pedirSupervisar(aviso);
  };
  const pedirCara = (c: "A" | "B") => {
    if (!activa || c === activa.cara) return;
    if (sucio) { setMensajeDePregunta(null); setPregunta({ tipo: "cara", cara: c }); return; }
    void st().cambiarCara(c);
  };
  const pedirSalir = async () => {
    if (sucio) { setMensajeDePregunta(null); setPregunta({ tipo: "salir" }); return; }
    const volver = activa?.volverA === "supervisar";
    if (await st().salir() && volver) irseASupervisar(null);
  };
  const preguntaVisible: Pregunta = pregunta ?? (pedidoDeCara ? { tipo: "cara", cara: pedidoDeCara } : null);
  const cerrarPregunta = () => { setPregunta(null); setMensajeDePregunta(null); if (pedidoDeCara) st().cancelarPedidoDeCara(); };

  async function guardarYSeguir() {
    const p = preguntaVisible;
    if (!p) return;
    // «Guardar y …» es una decisión de la persona: va al historial y a la
    // bitácora (`automatico: false`), antes de cambiar de cara o salir.
    if (st().edicion.sucio && !(await st().guardarBorrador(false))) {
      setMensajeDePregunta(st().guardado.mensaje
        ?? "No se pudo guardar: tu trabajo sigue acá. Probá de nuevo o salí sin guardar.");
      return;
    }
    const volver = activa?.volverA === "supervisar";
    const ok = p.tipo === "cara" ? await st().cambiarCara(p.cara) : p.tipo === "salir" ? await st().salir() : false;
    if (ok) { setPregunta(null); setMensajeDePregunta(null); if (p.tipo === "salir" && volver) irseASupervisar(null); return; }
    setMensajeDePregunta(st().guardado.mensaje
      ?? "No se pudo guardar: tu trabajo sigue acá. Probá de nuevo o salí sin guardar.");
  }
  // «Sin guardar» descarta en el STORE, en cualquier modo (el reductor no edita en «Mirar»).
  async function descartarYSeguir() {
    const p = preguntaVisible;
    if (!p) return;
    setPregunta(null);
    setMensajeDePregunta(null);
    const volver = activa?.volverA === "supervisar";
    if (p.tipo === "cara") await st().cambiarCara(p.cara, { descartar: true });
    else if (p.tipo === "salir") { await st().salir({ descartar: true }); if (volver) irseASupervisar(null); }
  }

  /** «Vender esta cara por participación»: escribe la división en el plano,
   *  lo guarda ya (si no, el servidor todavía ve la cara entera) y vuelve a
   *  leer la cara. */
  async function venderPorParticipacion(confirmado = false) {
    if (!mueble || dividiendo) return;
    const r = cambioParaDividir(mueble, "participacion");
    if ("problema" in r) { setDivision({ problema: r.problema }); return; }
    const revision = revisarCambioDePartes(mueble, r.cambio, estadoComercial, sede);
    if (revision.bloqueo) { setDivision({ problema: revision.bloqueo }); return; }
    if (revision.aviso && !confirmado) { setDivision({ aviso: revision.aviso, cambio: r.cambio }); return; }
    setDividiendo(true);
    setDivision(null);
    try {
      const fs = useFixtureStore.getState();
      fs.commit(conPartes(selectFixtures(fs), fixtureId, r.cambio));
      await fs.flushPending();
      const rechazo = useFixtureStore.getState().rechazos[sede];
      if (rechazo) setDivision({ problema: `El servidor no guardó el plano: ${rechazo.message}${rechazo.choques.length ? ` ${rechazo.choques.join(" ")}` : ""}` });
      await st().traerLoNuevo();
    } catch (e) {
      setDivision({ problema: describeError(e, "No se pudo guardar el plano: probá de nuevo en un momento.") });
    } finally {
      setDividiendo(false);
    }
  }

  /* ── «Listo, guardar la cara» ────────────────────────────────────────────── */
  const errores = rev?.juicio.errores ?? [];
  const sinUbicar = piezas.filter((p) => p.estado === "sin_ubicar");
  const conProblema = piezas.filter((p) => p.estado !== "sin_ubicar" && p.estado !== "ubicada");
  const enLosTopes = rev?.enLosTopes ?? true;
  const ubicadas = piezas.filter((p) => p.estado === "ubicada").length;
  // Guardada y sin cambios: «Listo» se apaga (cada toque creaba una versión y
  // un «Confirmada» repetido en el historial).
  const guardadaSinCambios = !sucio && datos?.distribucion?.estado === "confirmada" && !datos.distribucion.borrador;
  const motivoDeListo = !datos?.por_participacion ? "Esta cara se vende entera: no tiene marcas que ubicar."
    : !alDia ? "El plano tiene cambios sin guardar: esperá un momento."
    : piezas.length === 0 ? "Esta cara no tiene marcas vendidas: vendelas en Vender."
    : sinUbicar.length > 0 ? `Falta ubicar ${enLista(sinUbicar.map((p) => p.corto))}`
    : conProblema.length > 0 ? `Revisá ${enLista(conProblema.map((p) => p.corto))}: ${textoDelEstado(conProblema[0], nombreDe, conProblema[0].choca).toLowerCase()}`
    : errores.length > 0 || !enLosTopes ? "Hay piezas que el servidor no aceptaría: revisá la lista."
    : guardado.estado === "version_vieja" ? "Otra sesión cambió esta cara: tocá «Traer lo nuevo»."
    : guardado.estado === "guardando" || guardando ? "Guardando…"
    : guardadaSinCambios ? "Guardada, sin cambios."
    : null;
  const bloqueado = errores.length > 0 || !enLosTopes || !alDia || motivoDeListo !== null;

  const cambiosAlGuardar = useMemo(() => {
    if (!datos?.superficie || !rev) return null;
    const sup = datos.superficie;
    const confirmada = datos.distribucion?.confirmada ?? [];
    const antes = revisarZonas(desdeElServidor(confirmada),
      { exclusiones: sup.exclusiones, ancho: sup.ancho, alto: sup.alto, orientacion: sup.orientacion },
      datosDeLaCara(datos).terminosPorS, datos.hoy, { confirmada: true });
    return diferencias(confirmada, edicion.zonas, antes.juicio.cuentas, rev.juicio.cuentas);
  }, [datos, edicion.zonas, rev]);

  const listo = () => {
    if (bloqueado || !datos) return;
    const habia = (datos.distribucion?.confirmada.length ?? 0) > 0;
    // El resumen sólo hace falta si cambia algo de lo que ya estaba guardado.
    if (habia && cambiosAlGuardar?.hayCambios) { setResumen(resumenLlano(cambiosAlGuardar, nombreDe)); return; }
    void confirmarYa();
  };
  async function confirmarYa() {
    const a = st().activa, d = st().datos;
    if (!a || !d) return;
    setGuardando(true);
    // Las marcas con contrato que entran o cambian de lugar: a ésas les llega
    // ahora el aviso de montaje.
    const habia = (d.distribucion?.confirmada.length ?? 0) > 0;
    const cambian = new Set((cambiosAlGuardar?.participaciones ?? []).filter((c) => c.dibujadoDespues > 0).map((c) => c.spaceId));
    const conAviso = piezas.filter((p) => !p.esReserva && p.poligonos.length > 0 && (!habia || cambian.has(p.spaceId))).map((p) => p.corto);
    await st().confirmar();
    setGuardando(false);
    const g = st().guardado;
    if (g.estado !== "quieto" || g.mensaje) { setResumen(null); return; }
    setResumen(null);
    const titulo = `Listo: ${a.codigo} · cara ${a.cara} quedó distribuida.`;
    const texto = avisoDeMontaje(conAviso);
    if (a.volverA === "supervisar") {
      if (await st().salir()) irseASupervisar(`${titulo} ${texto}`.trim());
      return;
    }
    setExito({ titulo, texto });
  }

  /* ── Lo que se ve ─────────────────────────────────────────────────────────── */

  // (Todos los hooks van ANTES del return temprano de abajo.)
  const nombreDelMueble = useMemo(() => nombreDescriptivo(mueble, activa?.codigo ?? "", nombresPropios),
    [mueble, activa?.codigo, nombresPropios, fichasPropias]);
  const nombresHist = useMemo(() => nombresDelHistorial(datos), [datos]);

  if (!activa) {
    return (
      <div data-distribucion className="flex h-full items-center justify-center bg-bg p-6 text-sm text-ink-2">Elegí una cara para distribuir.</div>
    );
  }

  const caras = datos ? datos.fixture.caras : mueble ? carasDe(mueble) : 1;
  const estado: EstadoDeDistribucion = datos?.distribucion?.estado ?? "sin_distribuir";
  const hayBorrador = !!datos?.distribucion?.borrador;
  const motivoCopiar = motivoParaNoCopiar({
    conSuperficie: !!datos?.superficie, alDia, enMirar: edicion.modo === "mirar", guardando: guardado.estado === "guardando",
    versionVieja: guardado.estado === "version_vieja", vivas: datos?.participaciones.filter((p) => p.viva).length ?? 0,
  });
  const queda = datos?.superficie && datos.por_participacion ? capacidadDe(datos, hoy).queda : null;
  const aMano = !!piezaElegida && piezaElegida.forma === "a_mano";
  // Dibujando (el trazo es de la elegida) o mirando una ya hecha: el contador
  // dice lo del trazo o lo dibujado, y la pista lo que se puede hacer.
  const dibujando = aMano && edicion.herramienta === "poligono" && edicion.activa === piezaElegida.spaceId;
  const trazo = dibujando ? edicion.trazo : null;
  const lleva = aMano && cara ? (trazo ? llevaAMano(trazo, cara) : piezaElegida.dibujado) : null;
  const contador = aMano && piezaElegida ? contadorAMano(lleva, piezaElegida.pb, !trazo && piezaElegida.poligonos.length > 0) : null;
  const piezaQueVuela = arrastre && arrastre.movida && !arrastre.rect ? porS.get(arrastre.spaceId) ?? null : null;

  const pistaQueSeVe = edicion.aviso
    ?? (!alDia && datos?.por_participacion ? "El plano tiene cambios sin guardar: esperá un momento." : null)
    ?? pista
    ?? (dibujando && piezaElegida ? pistaDelTrazo(trazo?.length ?? 0, piezaElegida.poligonos.length > 0) : null)
    ?? (aMano && piezaElegida && piezaElegida.poligonos.length > 0 ? pistaDeAMano(piezaElegida) : null)
    ?? (piezaElegida?.estado === "sin_ubicar" ? `Arrastrá «${piezaElegida.corto}» a lo verde, o tocá lo verde donde va.` : null)
    ?? (sinUbicar[0] ? `Arrastrá «${sinUbicar[0].corto}» a lo verde, o tocala en la lista y después tocá lo verde.` : null)
    ?? "Arrastrá una pieza para moverla, o elegila y movela con las flechas; las manijas la estiran sin cambiar su %.";

  const ITEM_MENU = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-ink-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

  /* ── El 3D en grande ─────────────────────────────────────────────────────── */
  if (ver3D) {
    return (
      <div data-distribucion aria-label="Así queda en 3D" className="flex h-full flex-col overflow-y-auto bg-bg text-ink-1">
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-3 p-3 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-ink-3">Así queda</p>
              <h2 className="text-balance break-words text-base font-bold leading-snug"><span className="codigo">{sinCortarLaCara(tituloDelPanel(activa))}</span> · en 3D</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BOTON} onClick={() => onEncuadrarCara(activa.cara)} data-encuadrar-cara><Crosshair {...ICONO} />Centrar la cara {activa.cara}</button>
              <button type="button" className={BOTON} onClick={() => ui().verEn3D(false)} data-volver-a-ubicar><ArrowLeft {...ICONO} />Volver a ubicar</button>
            </div>
          </div>
          <RanuraDelLienzo anfitrion={lienzo3D} className="relative min-h-[320px] flex-1 overflow-hidden rounded-xl border border-line" style={{ height: "62vh" }} />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
            {piezas.map((p) => (
              <span key={p.spaceId} className="inline-flex items-center gap-1.5"><Bloque p={p} chico patron={patronDe(p, piezas)} />{p.nombre} · {pct(p.pb)}</span>
            ))}
            {queda !== null && <span className="inline-flex items-center gap-1.5" style={{ color: "rgb(var(--libre-txt-rgb))" }}>
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm border-2 border-dashed" style={{ borderColor: "rgb(var(--libre-borde-rgb))", background: "rgb(var(--libre-suave-rgb))" }} />Libre · {pct(queda)}</span>}
          </div>
          <p className="text-center text-xs text-ink-3">Se mira y se gira arrastrando; para mover una pieza, «Volver a ubicar». Desde acá no se edita.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-distribucion aria-label="Distribuir la cara" className="flex h-full flex-col overflow-y-auto bg-bg text-ink-1">
      <div className="mx-auto w-full max-w-[1240px] p-3 sm:p-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">

          {/* 1 · El encabezado */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-ink-3">Distribuir la cara</p>
              <h2 className="text-balance break-words text-base font-bold leading-snug" title={tituloDelPanel(activa)} data-titulo-de-distribucion>
                <span className="codigo">{sinCortarLaCara(tituloDelPanel(activa))}</span>{nombreDelMueble ? ` · ${nombreDelMueble}` : ""}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3" data-estado-distribucion={estado}>
                <span>{sucio && estado === "sin_distribuir" ? "Todavía sin guardar" : ESTADOS[estado]}</span>
                {hayBorrador && estado !== "borrador" && <span>· hay cambios sin guardar como lista</span>}
                {guardado.estado === "guardando" && <span>· guardando…</span>}
                {guardado.estado === "quieto" && sucio && <span>· el borrador se guarda solo</span>}
                {guardado.estado === "quieto" && !sucio && guardado.ultimoAuto && <span>· borrador guardado solo a las {hora(guardado.ultimoAuto)}</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {caras === 2 && (
                <div role="radiogroup" aria-label="Cara" className="flex rounded-lg border border-line p-0.5">
                  {(["A", "B"] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={activa.cara === c} onClick={() => pedirCara(c)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activa.cara === c ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>
                      Cara {c}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className={BOTON} onClick={() => ui().verEn3D(true)} disabled={!datos?.superficie} data-ver-en-3d><Box {...ICONO} />Ver en 3D</button>
              <div className="relative" ref={menuMas}>
                <button type="button" ref={botonMas} className={BOTON} aria-haspopup="menu" aria-expanded={mas} onClick={() => setMas(!mas)} data-mas>
                  <MoreHorizontal {...ICONO} />Más
                </button>
                {mas && (
                  <div role="menu" aria-label="Más" data-menu-mas className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
                    onKeyDown={teclaDelMenu}>
                    <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || edicion.atras.length === 0}
                      onClick={() => { setMas(false); st().despachar({ tipo: "deshacer" }); }}><Undo2 {...ICONO} />Deshacer</button>
                    <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || edicion.adelante.length === 0}
                      onClick={() => { setMas(false); st().despachar({ tipo: "rehacer" }); }}><Redo2 {...ICONO} />Rehacer</button>
                    <button role="menuitem" type="button" className={ITEM_MENU} data-copiar-zonas-de-otra-cara disabled={!puedeEditar || motivoCopiar !== null}
                      title={motivoCopiar ?? undefined} onClick={() => { setMas(false); setCopiando(true); }}>
                      <Copy {...ICONO} />{caras === 2 ? "Copiar de la otra cara" : "Copiar de otra cara"}
                    </button>
                    <button role="menuitem" type="button" className={ITEM_MENU} onClick={() => { setMas(false); setVerHistorial(true); }}><History {...ICONO} />Qué pasó con esta cara</button>
                    <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || edicion.zonas.length === 0}
                      onClick={() => { setMas(false); st().despachar({ tipo: "ponerPiezas", piezas: piezas.map((p) => ({ spaceId: p.spaceId, vertices: [] })) }); ui().decir("Sacaste todas las piezas: arrastralas de nuevo o tocá «Acomodar solas»."); }}>
                      <Eraser {...ICONO} />Sacar todas las piezas</button>
                    <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || !sucio}
                      title="Volver a lo último que se guardó (sólo en esta pantalla)"
                      onClick={() => { setMas(false); st().despachar({ tipo: "descartarCambios" }); }}><RotateCcw {...ICONO} />Descartar mis cambios</button>
                    <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || !hayBorrador || guardado.estado === "guardando"}
                      onClick={() => { setMas(false); setPregunta({ tipo: "descartarBorrador" }); }}><Trash2 {...ICONO} />Descartar el borrador guardado</button>
                  </div>
                )}
              </div>
              <button type="button" className={BOTON} onClick={() => void pedirSalir()}><X {...ICONO} />Salir</button>
            </div>
          </div>

          {/* 2 · Lo que pasó con lo guardado */}
          {exito && (
            <div role="status" data-exito className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
              style={{ background: "rgb(var(--libre-suave-rgb))", borderColor: "rgb(var(--libre-borde-rgb))" }}>
              <CircleCheck {...ICONO} className="mt-0.5" style={{ color: "rgb(var(--libre-txt-rgb))" }} />
              <div><b>{exito.titulo}</b>{exito.texto && <span className="mt-0.5 block text-xs text-ink-2">{exito.texto}</span>}</div>
              <button type="button" className="rounded p-1 text-ink-3 hover:text-ink-1" aria-label="Cerrar el aviso" onClick={() => setExito(null)}><X {...ICONO} /></button>
            </div>
          )}
          {cargando && !datos && <p className="text-sm text-ink-2">Leyendo la cara…</p>}
          {error && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs" style={ESTILO_PELIGRO}>
              <p>No se pudo leer la cara: {error}</p>
              <button type="button" className={`${BOTON} mt-1.5`}
                onClick={() => void st().entrar({ sede: activa.sede, fixtureId: activa.fixtureId, codigo: activa.codigo, cara: activa.cara, ...(activa.volverA ? { volverA: activa.volverA } : {}) })}>
                Probar de nuevo
              </button>
            </div>
          )}
          {recuperable && (
            <div role="status" className="rounded-xl border border-line px-3 py-2.5 text-xs text-ink-2">
              <p>La última vez quedaron cambios de esta cara sin guardar (el guardado falló al salir).</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button type="button" className={BOTON} onClick={() => st().recuperar()} disabled={!datos}>Recuperar lo que no se guardó</button>
                <button type="button" className={BOTON} onClick={() => st().olvidarSinGuardar()}>Olvidarlo</button>
              </div>
            </div>
          )}
          {guardado.estado === "error" && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs" style={ESTILO_PELIGRO}>
              <p>{guardado.mensaje ?? "No se pudo guardar. Tu trabajo sigue acá."}</p>
              <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().guardarBorrador(false)}>Probar de nuevo</button>
            </div>
          )}
          {guardado.estado === "version_vieja" && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs"
              style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
              <p>{guardado.mensaje ?? "Otra sesión cambió esta cara mientras la ubicabas."}</p>
              <p className="mt-0.5 text-ink-2">El guardado automático se frenó. «Traer lo nuevo» junta lo de la otra sesión con lo tuyo, marca por marca.</p>
              <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().traerLoNuevo()}>Traer lo nuevo</button>
            </div>
          )}
          {guardado.estado === "quieto" && guardado.mensaje && (
            <div role="status" className="rounded-xl border px-3 py-2.5 text-xs"
              style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
              {guardado.mensaje} Revisá las piezas marcadas y volvé a tocar «Listo».
            </div>
          )}
          {fusion && fusion.conflictos.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-line px-3 py-2.5" data-conflictos>
              {fusion.conflictos.map((s) => (
                <div key={s} className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                  <p className="min-w-0 flex-1">La otra sesión también movió <b className="text-ink-1">{nombreDe(s)}</b>: quedó lo de la otra sesión.</p>
                  <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => st().usarLoMio(s)}>Usar lo mío</button>
                </div>
              ))}
            </div>
          )}
          {copiaVisible && (
            <p role="status" data-copia-de-zonas className="rounded-xl border border-line px-3 py-2.5 text-xs text-ink-2">
              {franjaDeLaCopia(copiaVisible.rotulo, copiaVisible.declarada)}
            </p>
          )}
          {comoEstaba && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-ink-2">
              <p className="min-w-0 flex-1">En gris: {comoEstaba.titulo}.</p>
              <button type="button" className={BOTON} onClick={() => useVistaDeDistribucion.getState().verComoEstaba(null)}>Dejar de mirar</button>
            </div>
          )}

          {/* 3 · Una cara que todavía no se vende por participación */}
          {datos && !datos.comercializable && (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-2">
              Este mueble no se alquila: marcalo como alquilable en el panel para distribuirlo.
            </p>
          )}
          {datos && datos.comercializable && !datos.por_participacion && (
            <div className="flex flex-col gap-2 rounded-xl border border-line px-3 py-3 text-sm text-ink-2">
              <p><b className="text-ink-1">Esta cara se vende entera.</b>{caras === 2 ? " Venderla por partes de la cara (por marca) vale para las dos caras del mueble." : ""}</p>
              {datos.superficie ? (
                <button type="button" className={`${BOTON} self-start`} disabled={dividiendo} onClick={() => void venderPorParticipacion()}>
                  {dividiendo ? "Guardando el plano…" : "Venderla por partes de la cara"}
                </button>
              ) : (
                <p>Este tipo de mueble no tiene una cara para repartir: se vende entero.</p>
              )}
              {division?.problema && <p role="alert" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{division.problema}</p>}
              {division?.aviso && (
                <div role="alert" style={{ color: "rgb(var(--entra-txt-rgb))" }}>
                  <p>{division.aviso}</p>
                  <div className="mt-1 flex gap-1.5">
                    <button type="button" className={BOTON} onClick={() => void venderPorParticipacion(true)}>Sí, venderla por partes</button>
                    <button type="button" className={BOTON} onClick={() => setDivision(null)}>Dejarla así</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4 · La cara y las piezas */}
          {datos?.por_participacion && (
            <div className="grid gap-5 [grid-template-areas:'cara'_'piezas'_'mini'] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:[grid-template-areas:'cara_piezas'_'mini_piezas']">
              <div className="flex min-w-0 flex-col items-center gap-2 [grid-area:cara]">
                <div ref={caraRef} className="w-full scroll-mt-4"><CaraDePiezas fixtureId={fixtureId} sede={sede} onSoltar={soltar} /></div>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <p className="min-h-[1.4em] text-center text-xs text-ink-2" aria-live="polite" data-pista>{pistaQueSeVe}</p>
                  {ajusteVigente && puedeEditar && (
                    <button type="button" className={BOTON} data-deshacer-ajuste
                      onClick={() => { st().despachar({ tipo: "deshacer" }); ui().anotarAjuste(null); }}>
                      <Undo2 {...ICONO} />Deshacer el ajuste
                    </button>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 [grid-area:piezas]" aria-label="Las marcas de la cara" data-piezas>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-sm" data-progreso>
                  <b>{ubicadas} de {piezas.length}</b><span>{piezas.length === 1 ? "marca ubicada" : "marcas ubicadas"}</span>
                  <span className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${piezas.length ? (100 * ubicadas) / piezas.length : 0}%`, background: "rgb(var(--libre-rgb))" }} />
                  </span>
                </div>

                {piezas.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink-2">
                    Esta cara no tiene marcas vendidas todavía. La parte de la cara que le toca a cada marca se vende en Vender.
                  </p>
                )}

                <ul className="flex flex-col gap-2">
                  {piezas.map((p) => {
                    const esElegida = elegida === p.spaceId;
                    const ok = p.estado === "ubicada";
                    const mal = p.estado !== "ubicada" && p.estado !== "sin_ubicar";
                    const ts = p.participacion.terminos;
                    const reservaViva = ts.find((t) => t.estado === "reserva" && t.estado_visible === "reserva") ?? null;
                    const contratosVivos = ts.filter((t) => t.estado === "contrato" && t.lease_id != null && (t.estado_visible === "vigente" || t.estado_visible === "firmado"));
                    const vivos = ts.filter((t) => vivo(terminoDeOut(t), hoy));
                    const masNuevo = [...vivos].sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : b.id - a.id))[0] ?? null;
                    const renovable = masNuevo && masNuevo.estado === "contrato" ? masNuevo : null;
                    return (
                      <li key={p.spaceId} data-pieza-de-la-lista={p.spaceId} data-estado={p.estado}>
                        <div className={`flex items-center gap-2 rounded-2xl border-[1.5px] py-2 pl-2.5 pr-1.5 ${ok ? "bg-surface-2" : "bg-surface"}`}
                          style={{ borderColor: esElegida ? p.tono : mal ? "rgb(var(--ocupado-rgb))" : "rgb(var(--line-rgb))",
                            boxShadow: esElegida ? `0 0 0 3px color-mix(in srgb, ${p.tono} 20%, transparent)` : undefined }}>
                          <button type="button" aria-pressed={esElegida} data-elegir-pieza
                            onPointerDown={(e) => { arrastrada.current = false; empezarArrastre(p, e); }}
                            onClick={() => { if (arrastrada.current) { arrastrada.current = false; return; } elegirPieza(p.spaceId); }}
                            className={`flex min-w-0 flex-1 touch-none items-center gap-2.5 text-left ${puedeEditar && p.forma !== "a_mano" ? "cursor-grab" : "cursor-pointer"}`}>
                            <Bloque p={p} patron={patronDe(p, piezas)} />
                            <span className="block min-w-0 flex-1">
                              <span className="block break-words text-sm font-bold leading-snug">{p.nombre}</span>
                              <span className="block text-xs text-ink-3">{pct(p.pb)} de la cara</span>
                              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold"
                                style={{ color: ok ? "rgb(var(--libre-txt-rgb))" : mal ? "rgb(var(--ocupado-txt-rgb))" : "rgb(var(--ink-2-rgb))" }}>
                                {ok && <CircleCheck {...ICONO} />}
                                {mal && <CircleAlert {...ICONO} />}
                                {textoDelEstado(p, nombreDe, p.choca)}
                              </span>
                            </span>
                            {p.estado === "sin_ubicar" && <GripVertical {...ICONO} className="flex-shrink-0 text-ink-3" />}
                          </button>
                          <button type="button" aria-label={`Más de ${p.nombre}`} aria-expanded={menuDe === p.spaceId}
                            onClick={() => setMenuDe(menuDe === p.spaceId ? null : p.spaceId)}
                            className="flex-shrink-0 rounded-md p-1.5 text-ink-2 hover:bg-surface-3 hover:text-ink-1">
                            <MoreHorizontal {...ICONO} />
                          </button>
                        </div>
                        {(p.estado === "falta" || p.estado === "sobra") && puedeEditar && !(esElegida && p.forma === "a_mano") && (
                          <div className="mt-1.5 flex flex-wrap gap-2 pl-2">
                            <button type="button" className={BOTON} onClick={() => dejarJusta(p)}>
                              <Minimize2 {...ICONO} />{p.estado === "sobra" ? `Achicar a ${pct(p.pb)}` : `Dejarla en ${pct(p.pb)}`}
                            </button>
                          </div>
                        )}
                        {menuDe === p.spaceId && (
                          <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-2.5 text-xs">
                            {p.detalle && <p className="text-ink-2">{p.detalle}</p>}
                            {p.forma !== "a_mano" && (
                              <div className="flex flex-wrap gap-1.5" data-ubicar-sin-arrastrar>
                                <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => { setMenuDe(null); ubicarSinArrastre(p, "primero"); }}>
                                  <BoxSelect {...ICONO} />Ponerla en el primer hueco libre
                                </button>
                                <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => ubicarSinArrastre(p, "izquierda")}>
                                  <ArrowLeftToLine {...ICONO} />A la izquierda
                                </button>
                                <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => ubicarSinArrastre(p, "derecha")}>
                                  <ArrowRightToLine {...ICONO} />A la derecha
                                </button>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {p.poligonos.length > 0 && (
                                <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => { setMenuDe(null); sacar(p); }}>Sacar de la cara</button>
                              )}
                              {renovable && (
                                <button type="button" className={BOTON} onClick={() => { setMenuDe(null); st().abrirFormulario({ modo: "renovar", terminoId: renovable.id }); }}>Renovar el contrato</button>
                              )}
                              {reservaViva && (
                                <>
                                  <button type="button" className={BOTON} onClick={() => { setMenuDe(null); st().abrirFormulario({ modo: "confirmar", terminoId: reservaViva.id }); }}>Pasarla a contrato</button>
                                  <button type="button" className={BOTON} onClick={() => { setMenuDe(null); st().abrirFormulario({ modo: "editar", terminoId: reservaViva.id }); }}>Cambiar la reserva</button>
                                  <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
                                    onClick={() => { setMenuDe(null); setAvisoCancelar(null); setCancelar({ tipo: "reserva", p: p.participacion, t: reservaViva }); }}>Cancelar la reserva</button>
                                </>
                              )}
                              {contratosVivos.map((t) => (
                                <button key={t.id} type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
                                  onClick={() => { setMenuDe(null); setAvisoCancelar(null); setCancelar({ tipo: "contrato", p: p.participacion, t }); }}>
                                  {contratosVivos.length > 1 ? `Cancelar el contrato ${fechaLegible(t.desde)}–${fechaLegible(t.hasta)}` : "Cancelar el contrato"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {queda !== null && queda > 0 && (
                  <p className="flex items-center gap-2.5 px-1 text-xs" style={{ color: "rgb(var(--libre-txt-rgb))" }} data-libre>
                    <span aria-hidden className="inline-block h-[30px] w-[18px] rounded-md border-2 border-dashed"
                      style={{ borderColor: "rgb(var(--libre-borde-rgb))", background: "rgb(var(--libre-suave-rgb))" }} />
                    Libre · {pct(queda)} sin vender
                  </p>
                )}
                {queda === 0 && <p className="px-1 text-xs text-ink-2" data-libre data-sin-lugar>Sin lugar libre: la cara está toda vendida.</p>}

                {piezaElegida && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-ink-3">Forma de {piezaElegida.corto}</span>
                    <div role="radiogroup" aria-label="Forma de la pieza" className="grid grid-cols-3 rounded-lg border border-line p-0.5">
                      {FORMAS.map((f) => (
                        <button key={f.forma} type="button" role="radio" aria-checked={piezaElegida.forma === f.forma} disabled={!puedeEditar}
                          onClick={() => cambiarForma(f.forma)} data-forma={f.forma}
                          className={`grid gap-px rounded-md px-1 py-1.5 text-center text-xs font-semibold disabled:opacity-40 ${piezaElegida.forma === f.forma ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink-1"}`}>
                          {f.texto}<span className="text-[10.5px] font-normal opacity-75">{f.ayuda}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {contador && piezaElegida && (
                  <div data-contador={contador.estado} className="grid gap-1.5 rounded-2xl border-[1.5px] px-3 py-2.5"
                    style={{
                      borderColor: contador.estado === "pasado" ? "rgb(var(--ocupado-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-rgb))" : piezaElegida.tono,
                      background: contador.estado === "pasado" ? "rgb(var(--ocupado-suave-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-suave-rgb))" : "rgb(var(--surface-rgb))",
                    }}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{contador.titulo}</span>
                      <b className="font-mono text-xl">{pct(lleva ?? 0)} <span className="text-xs font-medium text-ink-3">de {pct(piezaElegida.pb)}</span></b>
                    </div>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full" style={{
                        width: `${Math.min(100, (100 * (lleva ?? 0)) / Math.max(1, piezaElegida.pb))}%`,
                        background: contador.estado === "pasado" ? "rgb(var(--ocupado-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-rgb))" : piezaElegida.tono,
                      }} />
                    </span>
                    <span className="text-xs text-ink-2">{contador.texto}</span>
                    <div className="flex flex-wrap gap-2">
                      {contador.estado === "pasado" && !trazo && (
                        <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => achicar(piezaElegida)} data-achicar>
                          <Minimize2 {...ICONO} />Achicar a {pct(piezaElegida.pb)}
                        </button>
                      )}
                      {contador.estado === "lleva" && !trazo && piezaElegida.poligonos.length > 0 && (
                        <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => achicar(piezaElegida)} data-llevar>
                          <Maximize2 {...ICONO} />Llevar a {pct(piezaElegida.pb)}
                        </button>
                      )}
                      {trazo && trazo.length > 0 && (
                        <button type="button" className={BOTON} onClick={() => st().despachar({ tipo: "cancelarTrazo" })}><Eraser {...ICONO} />Borrar los puntos</button>
                      )}
                      {!dibujando && piezaElegida.poligonos.length > 0 && (
                        <button type="button" className={BOTON} disabled={!puedeEditar} onClick={() => empezarAMano(piezaElegida)} data-rehacer-a-mano>
                          <PenLine {...ICONO} />Rehacer a mano
                        </button>
                      )}
                      {dibujando && piezaElegida.poligonos.length > 0 && (
                        <button type="button" className={BOTON} onClick={() => { salirDelTrazo(); ui().decir(null); }} data-dejar-como-estaba>
                          <X {...ICONO} />Dejarla como estaba
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button type="button" className={BOTON} disabled={!puedeEditar || sinUbicar.length === 0} onClick={() => acomodar(false)} data-acomodar>
                  <Wand2 {...ICONO} />Acomodar solas
                </button>
                <button type="button" className="btn-principal inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm"
                  disabled={bloqueado} onClick={listo} data-listo>
                  <Check {...ICONO} />{guardando ? "Guardando…" : guardadaSinCambios ? "Guardada, sin cambios" : "Listo, guardar la cara"}
                </button>
                {motivoDeListo && !guardadaSinCambios && (
                  <p className="flex items-center gap-1.5 text-xs text-ink-3" data-motivo-de-listo><CircleAlert {...ICONO} />{motivoDeListo}</p>
                )}
              </div>

              {/* La miniatura viva: el motor 3D del editor, enchufado acá. */}
              <button type="button" onClick={() => ui().verEn3D(true)} aria-label="Ver en 3D, en grande" data-miniatura-3d
                className="grid w-full grid-cols-[minmax(0,180px)_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line bg-surface-2 p-2 pr-3 text-left [grid-area:mini] hover:bg-surface-3"
                style={{ cursor: "zoom-in" }}>
                <RanuraDelLienzo anfitrion={lienzo3D} className="pointer-events-none relative h-[118px] w-full overflow-hidden rounded-lg" />
                <span className="grid gap-0.5 text-xs text-ink-3">
                  <b className="text-sm text-ink-1">Así queda en 3D</b>
                  Se actualiza al soltar cada pieza
                  <Maximize2 {...ICONO} className="justify-self-end text-ink-2" />
                </span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* La pieza que vuela con el dedo (afuera de la cara). */}
      {piezaQueVuela && arrastre && (
        <div aria-hidden className="pointer-events-none fixed z-[900] flex items-center gap-2 rounded-xl border-2 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-lg"
          style={{ left: arrastre.x + 12, top: arrastre.y + 12, borderColor: piezaQueVuela.tono }}>
          <Bloque p={piezaQueVuela} chico patron={patronDe(piezaQueVuela, piezas)} />{piezaQueVuela.corto} · {pct(piezaQueVuela.pb)}
        </div>
      )}

      {/* Diálogos */}
      {preguntaVisible && preguntaVisible.tipo !== "descartarBorrador" && (
        <Dialogo titulo={preguntaVisible.tipo === "salir" ? "¿Salir de esta cara?" : `¿Pasar a la cara ${preguntaVisible.cara}?`} onCerrar={cerrarPregunta}>
          <p className="text-sm leading-relaxed text-ink-2">
            Tenés cambios de la cara {activa.cara} que todavía no guardaste. Si los guardás, quedan como borrador para seguir después;
            para que valgan, tocá «Listo, guardar la cara».
          </p>
          {mensajeDePregunta && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{mensajeDePregunta}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={BOTON} onClick={cerrarPregunta}>Seguir acá</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={() => void descartarYSeguir()}>
              {preguntaVisible.tipo === "salir" ? "Salir sin guardar" : "Cambiar sin guardar"}
            </button>
            <button type="button" className={BOTON} onClick={() => void guardarYSeguir()} disabled={guardado.estado === "guardando"}>
              {preguntaVisible.tipo === "salir" ? "Guardar y salir" : "Guardar y cambiar"}
            </button>
          </div>
        </Dialogo>
      )}
      {preguntaVisible?.tipo === "descartarBorrador" && (
        <Dialogo titulo="Descartar el borrador guardado" onCerrar={cerrarPregunta}>
          {textoDeDescartarBorrador({ cara: activa.cara, hayConfirmada: !!datos?.distribucion?.confirmada.length, sucio }).map((linea, i) => (
            <p key={i} className={`text-sm leading-relaxed ${i === 0 ? "text-ink-2" : "mt-1.5 font-semibold"}`}
              style={i === 0 ? undefined : { color: "rgb(var(--entra-txt-rgb))" }} data-descartar-linea={i}>
              {linea}
            </p>
          ))}
          {guardado.estado === "error" && guardado.mensaje && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{guardado.mensaje}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BOTON} onClick={cerrarPregunta}>Dejarlo así</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
              onClick={async () => { await st().descartar(); if (st().guardado.estado !== "error") cerrarPregunta(); }}>
              Sí, descartarlo
            </button>
          </div>
        </Dialogo>
      )}
      {resumen && (
        <ResumenDeCambios titulo={`Así cambia ${activa.codigo} · cara ${activa.cara}`} lineas={resumen} mensaje={guardado.mensaje}
          guardando={guardando} bloqueado={bloqueado} onVolver={() => setResumen(null)} onGuardar={() => void confirmarYa()} />
      )}
      {verHistorial && (
        <Dialogo titulo={`Qué pasó con ${activa.codigo} · cara\u00A0${activa.cara}`} onCerrar={() => setVerHistorial(false)} ancho="max-w-lg">
          <div className="flex flex-col gap-1.5 text-xs text-ink-2">
            {errorHistorial && <p style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{errorHistorial}</p>}
            {!lineas && !errorHistorial && <p>Leyendo…</p>}
            {lineas && lineas.entradas.length === 0 && lineas.derivados.length === 0 && <p>Todavía no pasó nada en esta cara.</p>}
            {lineas && lineasDelHistorial(lineas, nombresHist).map((e) => (
              <div key={e.clave} className="rounded-lg border border-line px-2.5 py-1.5" data-derivada={e.derivada || undefined}>
                <p className="text-ink-3">{e.cuando}{e.actor ? ` · ${e.actor}` : ""}</p>
                <p className="text-ink-1" data-texto-del-historial>{e.texto}</p>
                {e.zonas && (
                  <button type="button" className="mt-0.5 text-[11px] underline underline-offset-2 hover:text-ink-1"
                    onClick={() => { useVistaDeDistribucion.getState().verComoEstaba({ titulo: `cómo quedó el ${cuandoFue(e.en)}`, zonas: e.zonas! }); setVerHistorial(false); }}>
                    Ver cómo estaba
                  </button>
                )}
              </div>
            ))}
          </div>
        </Dialogo>
      )}
      {cancelar && datos && (
        <PreguntaDeCancelar pregunta={cancelar} aviso={avisoCancelar} onAviso={setAvisoCancelar}
          onCerrar={() => { setCancelar(null); setAvisoCancelar(null); }} datos={datos} />
      )}
      {formulario && <FormularioDeParticipacion />}
      {copiando && <CopiarZonas caras={caras} onCerrar={() => setCopiando(false)} />}
    </div>
  );
}

/** Las piezas del último dibujo, para el arrastre que empezó antes (sus
 *  oyentes nativos no ven los `props` nuevos). */
const usePiezasUIPiezas: { actual: Pieza[] } = { actual: [] };
