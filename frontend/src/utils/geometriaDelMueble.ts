import { carasDe, fullSpaceCode } from "../types/espacio";
import { modeloPorId, resolverTipo, type PartesDeMueble } from "../catalogo/catalogo";
import {
  PASO_ENTRE_ENTREPANOS, ZOCALO,
  filasDePunta, filasDeProducto, nivelesDeEntrepano, techoDeCara, tramosValidos, vanosDeCorrido,
} from "../components/StoreEditor3D/muebles/medidas";
import type { EstadoPorEspacio } from "./estadoComercial";
import { claseDe, codigoDeParte, divisionDe, porParticipacion } from "./partes";
import { firmaDeCara } from "./superficie";

/**
 * Alto, entrepaños y módulo de una góndola o una punta: lo que el panel deja
 * escribir, y lo que tiene que preguntar antes de escribirlo.
 *
 * ── Por qué se pregunta ──────────────────────────────────────────────────────
 *
 * El mueble guarda su geometría (de la ficha de su modelo, o escrita acá) y
 * de ella sale TODO lo que se le muestra a un proveedor: las filas del arte
 * pintado en la cara, los entrepaños donde se para el producto, los módulos
 * por los que se reparte, los habladores. Cambiar el alto o los entrepaños de
 * una cara vendida corre lo vendido: el arte que el proveedor aprobó queda
 * con otras filas, y el producto en otros entrepaños. La regla de siempre es
 * que el espacio vendido no cambia de lugar, así que acá no se cambia sin
 * decir qué se mueve y sin que alguien diga «igual».
 *
 * Qué cuenta como vendido, por cara:
 *  · un contrato vivo o firmado para más adelante: la fusión con la base pinta
 *    la cara «occupied» con los dos (`spaces/comercial` toma el que corre o, si
 *    no hay, el próximo). La planometría cuelga del contrato —sólo existe la
 *    del vigente o el próximo—, así que una cara con planometría ya está acá;
 *  · el arte pintado en la cara (la imagen designada del espacio, la «cara
 *    del 3D»), que se alinea a los entrepaños.
 * Y del mueble entero, los espacios internos vendidos del Editor 3D
 * (`slots` ocupados o reservados), que viven sólo en el plano. Con ésos no
 * se puede cambiar la CANTIDAD de entrepaños hasta liberarlos: cada espacio
 * interno cae sobre ciertos entrepaños (`entrepanosDelEspacio`), y con otros
 * entrepaños lo vendido pasaría a ser otra cosa.
 *
 * Una cara que se vende POR PARTICIPACIÓN es otra cosa: sus contratos (`…-PC3`)
 * no caen en un lugar fijo del mueble —se reparten en zonas dibujadas— y la
 * fusión con la base no los ve (no cambian el estado de la cara). Lo que pasa
 * al cambiarle el alto, los entrepaños o el módulo es que cambia su firma
 * (§3.9 del diseño de participaciones) y una distribución confirmada queda
 * «para revisar». Eso se dice con lo que sabe la ocupación anónima (que cuenta
 * también las reservas provisionales) y, si se leyó, el estado de su
 * distribución.
 *
 * ── Ausente, número o null ───────────────────────────────────────────────────
 *
 * `entrepanos` y `modulo` ausentes son la cuenta de siempre (`nivelesDeEntrepano`,
 * `nivelesDePunta`, `vanosDeCorrido` con 1,25). Vaciar el campo pide volver a
 * ella, y eso se escribe `null` en el store: es BORRADO A PROPÓSITO, y es lo
 * único que hace que el servidor lo saque. Una clave ausente, en cambio, el
 * servidor la rellena con lo guardado (una pestaña de antes no la conoce).
 *
 * Es puro —ni React ni el store—: lo ejecuta `scripts/probar-geometria.mjs`.
 */

/** Los tipos con alto, entrepaños y módulo en el panel. */
export const TIPOS_CON_GEOMETRIA: ReadonlySet<string> = new Set(["gondola", "punta"]);

/** Lo que el panel mira del mueble del store, ya fusionado con la base. */
export interface MuebleConGeometria {
  id: string;
  code: string;
  type: string;
  gondolaType?: string | null;
  sede?: string;
  w: number;
  h: number;
  /** El fondo: la firma no lo lleva, pero sin él no hay superficie que
   *  firmar (si falta, se firma con uno cualquiera). */
  d?: number;
  modelo?: string | null;
  entrepanos?: number | null;
  modulo?: number | null;
  /** El estado de la cara A según la base (`fusionarEstadoComercial`). */
  status?: string;
  faceB?: { status?: string } | null;
  slots?: readonly { status: string }[] | null;
  /** Vender por partes: los tramos guardados parten el corrido (el módulo
   *  sale del ancho), y la forma de dividir dice si los entrepaños son
   *  partes que se venden. */
  partes?: PartesDeMueble | null;
  rentable?: boolean;
}

/** Un cambio pedido en el panel. `undefined`: ese campo no se toca. `null`:
 *  volver a la cuenta de siempre. */
export interface CambioDeGeometria {
  h?: number;
  entrepanos?: number | null;
  modulo?: number | null;
}

/** Los espacios internos que cuentan como vendidos: los mismos que avisa
 *  Vender en la fila del contrato (`repisasVendidas`). */
const SLOT_VENDIDO = new Set(["occupied", "reserved"]);

/** Metros con coma: «1,80». */
export function metros(x: number): string {
  return x.toFixed(2).replace(".", ",");
}

// ─── Los límites ──────────────────────────────────────────────────────────────

/** Entre qué valores puede estar cada campo: los del catálogo de muebles
 *  (`rango.h` y `geometria` del tipo), que son los mismos contra los que se
 *  validan las fichas. */
export function limitesDe(type: string): {
  alto: [number, number]; entrepanos: [number, number]; modulo: [number, number];
} {
  const t = resolverTipo(type)?.tipo;
  return {
    alto: t?.rango?.h ?? [0.3, 3.5],
    entrepanos: t?.geometria?.entrepanos ?? [1, 8],
    modulo: t?.geometria?.modulo ?? [0.3, 2],
  };
}

/** El alto útil donde se reparten la base y los entrepaños: el mismo tramo
 *  que usan `nivelesDeEntrepano` y `nivelesDePunta`. */
function tramoParaEntrepanos(type: string, h: number): number {
  return type === "punta"
    ? techoDeCara(h) - 0.06 - ZOCALO.alto
    : h - 0.1 - ZOCALO.alto;
}

/** Cuántos entrepaños (sin la base) entran en ese alto sin que queden a
 *  menos del paso mínimo de catálogo (`PASO_ENTRE_ENTREPANOS.minimo`): más
 *  apretados no entra ni un paquete de galletas parado. */
export function entrepanosQueEntran(type: string, h: number): number {
  const tramo = tramoParaEntrepanos(type, h);
  return Math.max(0, Math.floor(tramo / PASO_ENTRE_ENTREPANOS.minimo + 1e-9) - 1);
}

// ─── Lo que hay hoy ───────────────────────────────────────────────────────────

/**
 * Lo que se dibuja hoy: lo guardado o la cuenta de siempre.
 *
 * Los entrepaños se cuentan en la MISMA unidad en que se escriben: los que
 * llevan producto sobre la base, que son las filas de producto menos una
 * (`filasDeProducto` / `filasDePunta`, la cuenta que alinea el arte). En la
 * góndola sin entrepaños guardados el de más arriba es TECHO —sobre él no se
 * para nada— y no se cuenta: una de 1,80 dibuja la base, cuatro con producto
 * y el techo, y el panel dice 4. Antes decía 5, y escribir el 5 que el propio
 * panel sugería daba seis filas, con otras alturas, sobre una cara vendida.
 * En la punta el techo de la última fila es el copete, así que no hay techo.
 */
export function geometriaALaVista(f: MuebleConGeometria): {
  /** Entrepaños con producto sobre la base (filas de producto menos una). */
  entrepanos: number;
  /** ¿Son los guardados o la cuenta de siempre? */
  entrepanosGuardados: boolean;
  /** ¿Hay arriba un entrepaño de techo, sin producto? (la góndola sin
   *  entrepaños guardados). */
  techo: boolean;
  /** Cuántos módulos y de qué ancho de verdad (el corrido se parte parejo). */
  modulos: number;
  anchoDeModulo: number;
  moduloGuardado: boolean;
  /** Vender por partes: los módulos son los tramos guardados, y el módulo
   *  sale del ancho entre los tramos (el campo no manda). */
  porTramos: boolean;
} {
  const entrepanos = typeof f.entrepanos === "number" ? f.entrepanos : undefined;
  const modulo = typeof f.modulo === "number" ? f.modulo : undefined;
  const tramos = tramosValidos(f.partes?.tramos);
  // El fondo no cambia cuántas filas hay: se pide con uno cualquiera.
  const filas = f.type === "punta"
    ? filasDePunta(techoDeCara(f.h), 0.4, entrepanos)
    : filasDeProducto(f.h, 0.4, entrepanos);
  const vanos = vanosDeCorrido(f.w, modulo, f.type === "punta" ? undefined : tramos);
  return {
    entrepanos: Math.max(0, filas.rows - 1),
    entrepanosGuardados: entrepanos !== undefined,
    techo: f.type !== "punta" && entrepanos === undefined && nivelesDeEntrepano(f.h).length >= 2,
    modulos: vanos.length,
    anchoDeModulo: f.w / vanos.length,
    moduloGuardado: modulo !== undefined,
    porTramos: f.type !== "punta" && tramos !== undefined,
  };
}

/** Lo que dice la ficha del modelo del mueble, como sugerencia del panel. */
export function fichaSugerida(f: MuebleConGeometria): { h?: number; entrepanos?: number; modulo?: number } {
  const m = modeloPorId(f.modelo ?? undefined);
  if (!m) return {};
  return {
    h: m.h,
    ...(m.entrepanos !== undefined ? { entrepanos: m.entrepanos } : {}),
    ...(m.modulo !== undefined ? { modulo: m.modulo } : {}),
  };
}

// ─── Validar ──────────────────────────────────────────────────────────────────

/** Por qué no se puede escribir ese cambio, o null si se puede. */
export function problemaDelCambio(f: MuebleConGeometria, cambio: CambioDeGeometria): string | null {
  const lim = limitesDe(f.type);
  const h = cambio.h ?? f.h;
  if (cambio.h !== undefined) {
    if (!Number.isFinite(cambio.h) || cambio.h < lim.alto[0] - 1e-9 || cambio.h > lim.alto[1] + 1e-9) {
      return `El alto va de ${metros(lim.alto[0])} a ${metros(lim.alto[1])} m.`;
    }
  }
  const entrepanos = cambio.entrepanos !== undefined ? cambio.entrepanos : f.entrepanos;
  if (typeof cambio.entrepanos === "number") {
    if (!Number.isInteger(cambio.entrepanos) || cambio.entrepanos < lim.entrepanos[0] || cambio.entrepanos > lim.entrepanos[1]) {
      return `Los entrepaños van de ${lim.entrepanos[0]} a ${lim.entrepanos[1]}, sin contar la base.`;
    }
  }
  if (typeof entrepanos === "number" && entrepanos > entrepanosQueEntran(f.type, h)) {
    const caben = entrepanosQueEntran(f.type, h);
    return cambio.entrepanos === undefined
      ? `Con ${metros(h)} m de alto no entran los ${entrepanos} entrepaños que tiene (caben ${caben}): bajá primero los entrepaños.`
      : `Con ${metros(h)} m de alto entran hasta ${caben} entrepaños, uno cada ${Math.round(PASO_ENTRE_ENTREPANOS.minimo * 100)} cm como mínimo.`;
  }
  if (typeof cambio.modulo === "number") {
    if (!Number.isFinite(cambio.modulo) || cambio.modulo < lim.modulo[0] - 1e-9 || cambio.modulo > lim.modulo[1] + 1e-9) {
      return `El módulo va de ${metros(lim.modulo[0])} a ${metros(lim.modulo[1])} m.`;
    }
  }
  return null;
}

// ─── Qué cambia ───────────────────────────────────────────────────────────────

export interface CambioVisible {
  campo: "h" | "entrepanos" | "modulo";
  /** «el alto, de 1,80 a 2,00 m». */
  texto: string;
}

/** ¿Cambia cuántos entrepaños con producto tiene el mueble? Se compara lo
 *  que se dibuja antes y después, en la unidad del panel: sin entrepaños
 *  guardados, cambiar el alto puede sumar o sacar uno, y escribir el mismo
 *  número que da la cuenta de siempre no cambia la cantidad (los reparte
 *  parejo, que es otra cosa: eso avisa, no bloquea). */
export function cambiaLaCantidadDeEntrepanos(f: MuebleConGeometria, cambio: CambioDeGeometria): boolean {
  return geometriaALaVista(f).entrepanos !== geometriaALaVista({ ...f, ...conCambio(cambio) }).entrepanos;
}

/** Los campos que de verdad cambian, dichos en palabras. Escribir lo mismo
 *  que ya había no es un cambio y no pregunta nada. */
export function queCambia(f: MuebleConGeometria, cambio: CambioDeGeometria): CambioVisible[] {
  const fuera: CambioVisible[] = [];
  const antes = geometriaALaVista(f);
  const despuesF = { ...f, ...conCambio(cambio) };
  const despues = geometriaALaVista(despuesF);
  if (cambio.h !== undefined && Math.abs(cambio.h - f.h) > 1e-6) {
    // Sin entrepaños guardados, el alto decide cuántos entran: se dice.
    const arrastra = cambio.entrepanos === undefined && antes.entrepanos !== despues.entrepanos
      ? ` (los entrepaños pasan de ${antes.entrepanos} a ${despues.entrepanos})` : "";
    fuera.push({ campo: "h", texto: `el alto, de ${metros(f.h)} a ${metros(cambio.h)} m${arrastra}` });
  }
  if (cambio.entrepanos !== undefined && (cambio.entrepanos ?? null) !== (f.entrepanos ?? null)) {
    const de = antes.entrepanosGuardados ? `${antes.entrepanos}` : `${antes.entrepanos} (la cuenta de siempre)`;
    fuera.push({
      campo: "entrepanos",
      texto: cambio.entrepanos === null
        ? `los entrepaños, de ${antes.entrepanos} a la cuenta de siempre (${despues.entrepanos})`
        : despues.entrepanos === antes.entrepanos
          ? `los entrepaños: los mismos ${antes.entrepanos}, repartidos parejo (eran la cuenta de siempre)`
          : `los entrepaños, de ${de} a ${cambio.entrepanos}`,
    });
  }
  if (cambio.modulo !== undefined && (cambio.modulo ?? null) !== (f.modulo ?? null)) {
    fuera.push({
      campo: "modulo",
      texto: `los módulos, de ${antes.modulos} de ${metros(antes.anchoDeModulo)} m a ${despues.modulos} de ${metros(despues.anchoDeModulo)} m`,
    });
  }
  return fuera;
}

/** Lo que el cambio escribe sobre el mueble (sólo los tres campos). */
function conCambio(cambio: CambioDeGeometria): Partial<MuebleConGeometria> {
  const out: Partial<MuebleConGeometria> = {};
  if (cambio.h !== undefined) out.h = cambio.h;
  if (cambio.entrepanos !== undefined) out.entrepanos = cambio.entrepanos;
  if (cambio.modulo !== undefined) out.modulo = cambio.modulo;
  return out;
}

// ─── Lo vendido ───────────────────────────────────────────────────────────────

export interface CaraVendida {
  cara: "A" | "B";
  /** Contrato vivo o firmado para más adelante (la base la pinta «occupied»). */
  contrato: boolean;
  /** Tiene arte pintado (la imagen designada de la cara). */
  arte: boolean;
}

/** Una cara que se vende por participación, para la revisión del cambio. */
export interface ParticipacionDeLaCara {
  cara: "A" | "B";
  /** Tiene términos vivos o por venir (contratos o reservas provisionales),
   *  según la ocupación anónima. `null`: no se pudo leer. */
  comprometida: boolean | null;
  /** Tiene una distribución confirmada. `null`: no se sabe. */
  confirmada: boolean | null;
}

/** Lo que se sabe de las participaciones de la sede (lo arma el editor con
 *  `ocupacionStore`). */
export interface DatosDeParticipacion {
  /** Las caras de `GET /participaciones/ocupacion`, por código completo
   *  (`NAVE-GON-01`, `NAVE-GON-01-B`). `null`: no se pudo leer. */
  ocupacion: Readonly<Record<string, { intervalos?: readonly unknown[] | null }>> | null;
  /** Los códigos completos de las caras con distribución confirmada (del
   *  resumen o de la lectura de la cara). `null` o ausente: no se sabe. */
  confirmadas?: ReadonlySet<string> | null;
}

/** Las caras con distribución CONFIRMADA del resumen de la sede (también la
 *  que quedó «para revisar», y una confirmada con un borrador encima, que
 *  sigue `confirmada`): lo que `DatosDeParticipacion.confirmadas` necesita.
 *  `null` sin resumen (no se sabe). */
export function confirmadasDelResumen(
  r: { caras: readonly { codigo_cara: string; estado_distribucion: string }[] } | null | undefined,
): Set<string> | null {
  if (!r) return null;
  return new Set(r.caras
    .filter((c) => c.estado_distribucion === "confirmada" || c.estado_distribucion === "para_revisar")
    .map((c) => c.codigo_cara));
}

export interface LoVendido {
  /** Sólo las caras con algo. */
  caras: CaraVendida[];
  /** Espacios internos del Editor 3D ocupados o reservados. */
  slots: number;
  /** No se pudo saber qué caras tienen arte pintado (falló la consulta). */
  arteSinRevisar: boolean;
  /** Vender por partes: las partes con contrato vivo o firmado (`EN2`,
   *  `B-TR1`), del mapa crudo de la base: vender una parte no cambia el
   *  mueble fusionado. Sin nombres. Nunca una participación (`PC3`): ésa no
   *  tiene lugar fijo en el mueble. */
  partes?: string[];
  /** Las caras que se venden por participación (sólo si el mueble se vende
   *  así). */
  participacion?: ParticipacionDeLaCara[];
}

/**
 * Lo vendido de este mueble, por cara.
 *
 * `carasConArte` son los códigos COMPLETOS (`SEDE-GON-03`, `SEDE-GON-03-B`)
 * con imagen designada, en mayúsculas, como los devuelve
 * `GET /spaces/face-images`; `null` es que no se pudo preguntar, y entonces
 * se avisa igual: ante la duda, se pregunta.
 *
 * `participaciones`: lo que se sabe de la sede si el mueble se vende por
 * participación (sin el dato, cada cara queda «no se sabe», y se avisa).
 */
export function loVendidoDe(
  f: MuebleConGeometria, sede: string, carasConArte: ReadonlySet<string> | null,
  estado?: EstadoPorEspacio, participaciones?: DatosDeParticipacion,
): LoVendido {
  const codigo = fullSpaceCode(f.sede || sede, f.code);
  // Las partes vendidas de este mueble, por su código (`SEDE-GON-05-B-TR2`):
  // dos letras y un número al final, con la cara B adelante si es de ella.
  // Una participación (`-PC3`) tiene esa misma forma y NO es una parte: no
  // se para a ninguna altura.
  const tokenPC = claseDe("participacion")?.token ?? "PC";
  const partes = estado
    ? Object.entries(estado)
      .filter(([c, e]) => e.status === "occupied" && c.startsWith(`${codigo}-`)
        && /^(?:B-)?[A-Z]{2}[1-9][0-9]?$/.test(c.slice(codigo.length + 1))
        && !c.slice(codigo.length + 1).replace(/^B-/, "").startsWith(tokenPC))
      .map(([c]) => c.slice(codigo.length + 1)).sort()
    : [];
  const caras: CaraVendida[] = [];
  const estados: ["A" | "B", string | undefined][] = [["A", f.status]];
  if (carasDe(f) === 2) estados.push(["B", f.faceB?.status]);
  for (const [cara, estado] of estados) {
    const contrato = estado === "occupied";
    const arte = !!carasConArte?.has(cara === "A" ? codigo : `${codigo}-B`);
    if (contrato || arte) caras.push({ cara, contrato, arte });
  }
  const slots = (f.slots ?? []).filter((s) => SLOT_VENDIDO.has(s.status)).length;
  const participacion: ParticipacionDeLaCara[] = [];
  if (porParticipacion(f)) {
    for (const cara of carasDe(f) === 2 ? ["A", "B"] as const : ["A"] as const) {
      // Fase 2 · I4: con la sede del PLANO, no la del mueble: la ocupación y
      // las distribuciones confirmadas las arma el servidor así (Supervisar
      // también). Un mueble con otra «Sede» escrita daba `comprometida:
      // false` y cambiar Alto/Entrepaños/Módulo no avisaba de participaciones
      // vivas. El arte y las partes siguen con el código de arriba.
      const completo = fullSpaceCode(sede, codigoDeParte(f.code, cara, null));
      const oc = participaciones?.ocupacion;
      const deLaCara = oc ? (Object.prototype.hasOwnProperty.call(oc, completo) ? oc[completo] : undefined) : undefined;
      const confirmadas = participaciones?.confirmadas;
      participacion.push({
        cara,
        comprometida: oc ? (deLaCara?.intervalos?.length ?? 0) > 0 : null,
        confirmada: confirmadas ? confirmadas.has(completo) : null,
      });
    }
  }
  return {
    caras, slots, arteSinRevisar: carasConArte === null,
    ...(partes.length ? { partes } : {}),
    ...(participacion.length ? { participacion } : {}),
  };
}

/** La firma de la cara antes y después del cambio (§3.9). Sin fondo, se firma
 *  con uno cualquiera: la firma no lo lleva. */
function cambiaLaFirma(f: MuebleConGeometria, cambio: CambioDeGeometria, cara: "A" | "B"): boolean {
  const conFondo = { ...f, d: typeof f.d === "number" && f.d > 0 ? f.d : 1 };
  return firmaDeCara(conFondo, cara) !== firmaDeCara({ ...conFondo, ...conCambio(cambio) }, cara);
}

/** Qué le pasa a cada cara por participación con el cambio: sólo las caras
 *  cuya firma cambia y que tienen (o pueden tener) algo dibujado. */
function lineasDeParticipacion(f: MuebleConGeometria, cambio: CambioDeGeometria, vendido: LoVendido): string[] {
  const lineas: string[] = [];
  for (const p of vendido.participacion ?? []) {
    if (!cambiaLaFirma(f, cambio, p.cara)) continue;
    if (p.confirmada === true) {
      lineas.push(`La cara ${p.cara} se vende por participación y tiene una distribución confirmada: `
        + "con este cambio queda para revisar.");
    } else if (p.comprometida === true) {
      lineas.push(`La cara ${p.cara} se vende por participación y tiene participaciones vivas (contratos o reservas `
        + "provisionales): con este cambio cambia la superficie que se reparte, y si su distribución estaba "
        + "confirmada queda para revisar.");
    } else if (p.comprometida === null && p.confirmada !== false) {
      lineas.push(`No se pudo revisar si la cara ${p.cara} tiene participaciones: si tiene una distribución `
        + "confirmada, con este cambio queda para revisar.");
    }
  }
  return lineas;
}

// ─── La revisión ──────────────────────────────────────────────────────────────

export interface AvisoDeGeometria {
  titulo: string;
  lineas: string[];
}

export interface RevisionDeGeometria {
  cambios: CambioVisible[];
  /** No se puede: hay que liberar algo antes. El panel no escribe nada. */
  bloqueo: string | null;
  /** Se puede, pero mueve lo vendido: el panel no escribe sin un «igual». */
  aviso: AvisoDeGeometria | null;
}

/**
 * Qué pasa si se escribe ese cambio en un mueble con eso vendido.
 *
 * Sin cambios de verdad, nada. Con espacios internos vendidos, la cantidad de
 * entrepaños no se toca (bloqueo). Con cualquier cosa vendida —una cara con
 * contrato o arte, un espacio interno— cambiar el alto, los entrepaños o el
 * módulo pide confirmación diciendo qué se mueve. Sin nada vendido, se
 * escribe sin preguntar.
 */
export function revisarCambioDeGeometria(
  f: MuebleConGeometria, cambio: CambioDeGeometria, vendido: LoVendido,
): RevisionDeGeometria {
  const cambios = queCambia(f, cambio);
  if (cambios.length === 0) return { cambios, bloqueo: null, aviso: null };
  const campos = new Set(cambios.map((c) => c.campo));

  // Vender por partes: con la góndola o la punta vendida por entrepaños y
  // uno vendido, la cantidad de entrepaños es la cantidad de partes —el
  // «entrepaño 3» pasaría a ser otro—, y vaciarla deja de venderla por
  // entrepaños. Lo frena también el servidor (409 `partes_vendidas`).
  const division = divisionDe(f);
  const partesVendidas = vendido.partes ?? [];
  if (division) {
    const regla = claseDe(division.clase)!;
    const deLaClase = partesVendidas.filter((p) => p.replace(/^B-/, "").startsWith(regla.token));
    const despues = divisionDe({ ...f, ...conCambio(cambio) });
    if (deLaClase.length > 0 && (despues?.clase !== division.clase || despues.n !== division.n)) {
      return {
        cambios,
        bloqueo: `${f.code} se vende por ${regla.plural} y ${deLaClase.length === 1 ? "uno está vendido" : `${deLaClase.length} están vendidos`} `
          + `(contrato vivo o firmado): la cantidad de ${regla.plural} no cambia hasta que termine o se cancele su contrato, `
          + "porque lo vendido quedaría en otro lugar. El alto sí se puede cambiar, con aviso.",
        aviso: null,
      };
    }
  }

  if (vendido.slots > 0 && cambiaLaCantidadDeEntrepanos(f, cambio)) {
    const porElAlto = !campos.has("entrepanos")
      ? ` Con ${metros(cambio.h ?? f.h)} m de alto pasaría de ${geometriaALaVista(f).entrepanos} a `
        + `${geometriaALaVista({ ...f, ...conCambio(cambio) }).entrepanos} entrepaños.`
      : "";
    return {
      cambios,
      bloqueo: `${f.code} tiene ${cuantosInternos(vendido.slots)} (Editor 3D): no se puede cambiar `
        + `la cantidad de entrepaños hasta liberarlos.${porElAlto} Cada uno cae sobre ciertos entrepaños, y con `
        + `otros pasaría a ser otra cosa. El alto y el módulo sí se pueden cambiar, con aviso, mientras no `
        + `cambie la cantidad.`,
      aviso: null,
    };
  }

  const deParticipacion = lineasDeParticipacion(f, cambio, vendido);
  if (vendido.caras.length === 0 && vendido.slots === 0 && !vendido.arteSinRevisar && partesVendidas.length === 0
    && deParticipacion.length === 0) {
    return { cambios, bloqueo: null, aviso: null };
  }

  const filas = campos.has("h") || campos.has("entrepanos");
  const modulos = campos.has("modulo");
  const lineas: string[] = [];
  for (const c of vendido.caras) {
    const que = [c.contrato ? "contrato vivo o firmado" : "", c.arte ? "arte pintado" : ""].filter(Boolean).join(" y ");
    const efectos = [
      filas ? "cambian las filas del arte de esta cara y el producto se para en otros entrepaños" : "",
      modulos ? "el producto y los habladores se reparten en otros módulos" : "",
    ].filter(Boolean).join("; ");
    lineas.push(`Cara ${c.cara} (${que}): ${efectos}.`);
  }
  if (vendido.slots > 0) {
    lineas.push(campos.has("h")
      ? `${vendido.slots === 1 ? "El espacio interno vendido se mide" : `Los ${vendido.slots} espacios internos vendidos se miden`} sobre el alto: con otro alto quedan en otro lugar del mueble.`
      : campos.has("entrepanos")
        ? `Tiene ${cuantosInternos(vendido.slots)}: con los entrepaños a otra altura, el producto de su franja se para en otro lugar.`
        : `Tiene ${cuantosInternos(vendido.slots)}: el producto de su franja se reparte en otros módulos.`);
  }
  if (partesVendidas.length > 0) {
    lineas.push(`Tiene partes vendidas (${partesVendidas.join(", ")}): `
      + (filas ? "su producto se para a otra altura." : "su producto se reparte en otros módulos."));
  }
  lineas.push(...deParticipacion);
  if (vendido.arteSinRevisar) {
    lineas.push("No se pudo revisar si alguna cara tiene arte pintado: si lo tiene, cambian sus filas.");
  }
  lineas.push(`Lo que cambia: ${cambios.map((c) => c.texto).join("; ")}.`);
  return {
    cambios,
    bloqueo: null,
    aviso: { titulo: `Esto mueve lo que ya está vendido en ${f.code}.`, lineas },
  };
}

function cuantosInternos(n: number): string {
  return n === 1 ? "1 espacio interno vendido" : `${n} espacios internos vendidos`;
}

/** El aviso en un solo texto (para leerlo entero o probarlo). */
export function textoDelAviso(a: AvisoDeGeometria): string {
  return [a.titulo, ...a.lineas].join(" ");
}

// ─── Escribir ─────────────────────────────────────────────────────────────────

/**
 * El plano con el cambio escrito en ESE mueble, y los demás tal cual (la
 * misma identidad: los espejos de los editores comparan por identidad).
 *
 * `null` se escribe `null`, no se borra la clave: así viaja al servidor como
 * «borrado a propósito». Una clave borrada viajaría ausente, y ausente el
 * servidor la rellena con lo que tenía guardado.
 */
export function conGeometria<T extends { id: string }>(
  fixtures: readonly T[], id: string, cambio: CambioDeGeometria,
): T[] {
  if (!fixtures.some((f) => f.id === id)) return fixtures as T[];
  return fixtures.map((f) => {
    if (f.id !== id) return f;
    const out: Record<string, unknown> = { ...f };
    if (cambio.h !== undefined) out.h = cambio.h;
    if (cambio.entrepanos !== undefined) out.entrepanos = cambio.entrepanos;
    if (cambio.modulo !== undefined) out.modulo = cambio.modulo;
    return out as T;
  });
}
