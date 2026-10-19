import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { useFichasPropias } from "../../store/fichasPropias";
import { describirUbicacion } from "../MiniMapa/MiniMapa";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { parseISODate, upcomingSeasons } from "../../types/seasons";
import {
  filasRechazadas, guardarContrato, validarContrato,
  type Cobro, type FilaRechazada, type LineaDeVenta, type ModoPrecio, type PedidoDeVenta,
} from "../../api/vender";
import { describeError } from "../../api/client";
import type { AvisosContrato } from "../../types";
import {
  isDoubleGondola, type RangeAvailability, type UnifiedFixture,
} from "../../types/fixtures";
import { fullSpaceCode } from "../../types/espacio";
import { nombreDeMueble } from "../../utils/nomenclatura";
import { textoDePrecio, valoresDeLista } from "../../utils/precioDeLista";
import { meses, sumarDias, sumarMeses, textoDeMeses } from "../../utils/meses";
import { pbDeTexto, pct } from "../../utils/participaciones";
import {
  cantidadDe, claseDe, codigoDeParte, codigoVisibleDe, comercialDelEspacio, esDivision, esParticipacion, parteDeSufijo,
  partirCodigo, quedaEnLaCara, redondear, tarifaDeEspacio, textoAlTocarEnVender, textoDeParte, tomadaPorLoSuyo,
  type OrigenDeTarifa, type ParticipacionDeLaCara,
} from "../../utils/partes";

/**
 * El contrato: TODO el estado y la aritmética del acuerdo, sin una sola línea
 * de dibujo.
 *
 * Quien lo dibuja es `ModoVender.tsx` (la ficha de D, panel 03 de la hoja).
 * Están separados a propósito y por una razón que sobrevivió al rediseño: el
 * estado del contrato lo tocan piezas que NO están adentro de la ficha —el
 * plano suma y saca espacios, la barra de arriba mueve el periodo, «Renovar»
 * lo siembra desde otra pantalla—, así que tiene que vivir por encima de los
 * campos y no dentro de ellos.
 *
 * Rediseño de Vender (PR 1, `docs/rediseno/vender-api.md`). Un contrato tiene
 * líneas de tres clases: una cara ENTERA, una cara POR PARTES (las partes
 * elegidas van en UNA línea, «PUN-02 · EN1, EN2», con el precio de todas; al
 * guardar es un contrato por parte, con el precio repartido parejo) y un
 * PORCENTAJE de una cara («GON-02 · A · 75 %»). Las piezas de lo que no se
 * vende entero (la bahía de una caja, el forro) siguen una por línea. Cada
 * precio se escribe como total o «al mes» (× `meses()`), y lo que la línea
 * entrega es SIEMPRE el total. Se guarda todo junto o nada
 * (`POST /contratos/vender`), como contrato o como reserva hasta una fecha.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ResumenContrato {
  /** Las líneas que quedaron guardadas, como se leen: `PUN-02 · EN1, EN2`,
   *  `GON-02·A · 75 %`. */
  espacios: string[];
  proveedor: string;
  desde: string;
  hasta: string;
  /** El total del plazo, que es lo que quedó escrito (0 con cobro por ventas). */
  total: number;
  /** Contrato o reserva, y hasta cuándo se sostiene la reserva. */
  tipo: "contrato" | "reserva";
  caduca: string | null;
  cobro: Cobro;
  /** A quién avisó el servidor. Ausente = no se pudo saber. */
  avisos?: AvisosContrato;
}

/** Un espacio adentro del contrato que se está armando: una cara entera, una
 *  de sus partes (`parte: "PU2"`), un porcentaje de la cara (`pc`) o la cara
 *  por partes sin ninguna marcada (`porPartes: "entrepanos"`). */
export interface CaraElegida {
  fixture: UnifiedFixture;
  face: "A" | "B";
  parte?: string;
  pc?: true;
  porPartes?: string;
}

/** Con qué llega prellenado un contrato al que se entra por «Renovar». */
export interface SemillaContrato {
  /** Qué renovación es. La pantalla lo usa de `key` para REMONTAR el
   *  formulario: los campos se siembran en el `useState` inicial, así que un
   *  formulario ya montado ignoraría la semilla y «Renovar» no haría nada
   *  visible si ya había un contrato a medio armar en pantalla. */
  id: string;
  proveedor: string;
  correo: string;
  marca: string;
  /** ISO. El día después de que termina el contrato vigente. */
  desde: string;
  /** ISO. Mismo largo que el contrato vigente. */
  hasta: string;
  /** Por la clave de precio de cada línea (`claveDePrecio`). */
  valores: Record<string, string>;
  /** Un porcentaje que se renueva: su % (en puntos básicos) y el término que
   *  renueva, por el código completo de la cara. */
  porcentajes?: Record<string, number>;
  renueva?: Record<string, number>;
}

export interface ArgsContrato {
  /** Los espacios del contrato, en el orden en que se fueron tocando.
   *
   *  Un contrato con un proveedor sobre TRES puntas de góndola es un solo
   *  acuerdo —un proveedor, un periodo, una firma— y tecleado de a uno eran
   *  tres veces el mismo formulario, con tres oportunidades de escribir una
   *  fecha distinta. Acá es una lista y el valor va por línea, que es como
   *  se negocia: la punta de la entrada no vale lo que la del fondo. */
  espacios: CaraElegida[];
  /** Sede activa, para los muebles sin `sede` propia (los dibujados antes de esa columna). */
  sede: string;
  /** El periodo elegido arriba. Es de donde salen las fechas por defecto. */
  rango: DateRange | null;
  /** Con qué abre el formulario cuando se llega por «Renovar».
   *
   *  Renovar no es hacer un contrato en blanco sobre el mismo mueble: es el
   *  mismo acuerdo otra vez, y lo único que suele cambiar es el precio. */
  semilla?: SemillaContrato | null;
  /** La ocupación ANÓNIMA de una cara por participación (intervalos, sin
   *  nombres ni montos), o `undefined`. Es lo único de las participaciones que
   *  ve Vender: «queda X %» sale de acá, nunca de leer la cara. */
  ocupacionDe?: (f: UnifiedFixture, cara: "A" | "B") => ParticipacionDeLaCara | undefined;
  /** Sacar un espacio de la lista desde la propia ficha. */
  onQuitar: (fixtureId: string, face: "A" | "B", parte?: string) => void;
  /** Sumar o sacar una cara de una góndola doble. */
  onCambiarCara: (fixtureId: string, face: "A" | "B") => void;
  /** Vender por partes: prender o apagar la entera (`null`) o una parte
   *  (`"PU2"`) de esa cara. La entera y sus partes nunca juntas. */
  onCambiarParte: (fixtureId: string, face: "A" | "B", parte: string | null) => void;
  /** El contrato YA está en la base cuando esto se llama. No hay nada que
   *  escribirle al plano: quien dibuja vuelve a leer. */
  onGuardado: (resumen: ResumenContrato) => void;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** La plata, siempre entera y con su espacio: «$ 600.000». */
export const money = (n: number) => "$ " + Math.round(n).toLocaleString("es-CO");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-13" → "13 sep 2026". Los ISO son para la base, no para leerlos. */
export function fechaCorta(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-11-03" → "3 nov". */
export function diaCorto(iso: string): string {
  const d = parseISODate(iso);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : iso;
}

/** «1 – 30 nov», «26 dic – 15 ene». */
export function rangoCorto(desde: string, hasta: string): string {
  const a = parseISODate(desde), b = parseISODate(hasta);
  if (!a || !b) return `${desde} – ${hasta}`;
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()} – ${b.getDate()} ${MESES[b.getMonth()]}`
    : `${diaCorto(desde)} – ${diaCorto(hasta)}`;
}

function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** La clave del PRECIO de una línea, por el código completo de lo que vende:
 *  la cara entera, su código; una parte (`…-EN2`), la de todas las partes de
 *  esa clase de esa cara (`…-EN*`: van en una línea con un solo precio); un
 *  porcentaje de la cara, `…-PC*`. La usa «Renovar» para sembrar el valor. */
export function claveDePrecio(codigo: string): string {
  const p = partirCodigo(codigo);
  if (!p.parte) return codigo;
  const cara = codigoDeParte(p.base, p.cara, null);
  if (esParticipacion(p.parte)) return `${cara}-${p.parte.token}*`;
  if (esDivision(p.parte)) return `${cara}-${p.parte.token}*`;
  return codigo;
}

/** Los mensajes del servidor que hablan de un campo que le mandamos RELLENO.
 *
 *  La validación en vivo pregunta por las fechas y la capacidad, y para eso
 *  manda un proveedor y un valor de mentira cuando todavía están vacíos —si
 *  no, la fila se cae por un campo obligatorio y no se llega nunca a la
 *  respuesta sobre las fechas—. La contracara obligatoria: lo que se rellena,
 *  no se cree. */
const RELLENADO = /^(Proveedor nuevo|Falta el proveedor|Falta el valor)/i;

/** El periodo con el que arranca el contrato cuando arriba no hay temporada.
 *
 *  Prellenar es deliberado: reescribir dos fechas a mano era el paso que más se
 *  equivocaba, y una pantalla en blanco tampoco dice qué hacer primero. */
function rangoPorDefecto(): DateRange {
  const hoy = new Date();
  const to = new Date(hoy);
  to.setDate(to.getDate() + 30);
  return { from: hoy, to };
}

/** Los días de corte de un cobro por % de las ventas: el último día de cada
 *  mes del plazo (el último, `hasta`) o sólo `hasta`. */
export function cortesDe(desde: string, hasta: string, corte: "mensual" | "al_final"): string[] {
  if (!desde || !hasta || hasta < desde) return [];
  if (corte === "al_final") return [hasta];
  const fuera: string[] = [];
  let ini = desde;
  while (ini <= hasta && fuera.length < 60) {
    const finDeMes = sumarDias(sumarMeses(`${ini.slice(0, 7)}-01`, 1), -1);
    const cae = finDeMes < hasta ? finDeMes : hasta;
    fuera.push(cae);
    ini = sumarDias(cae, 1);
  }
  return fuera;
}

/** «30 nov, 31 dic y 31 ene». */
export function textoDeCortes(cortes: string[]): string {
  const d = cortes.map(diaCorto);
  return d.length <= 1 ? (d[0] ?? "") : `${d.slice(0, -1).join(", ")} y ${d[d.length - 1]}`;
}

/** Lo que dice el 409 de una línea: lo que queda y desde cuándo, nunca de quién. */
export function textoDelRechazo(f: FilaRechazada, pbPedido: number | null): { titulo: string; detalle: string } {
  if (f.code === "capacidad_excedida" && typeof f.queda_pb === "number") {
    return {
      titulo: pbPedido ? `Ya no entra el ${pct(pbPedido)}.` : "Ya no entra ese porcentaje.",
      detalle: `${f.desde_dia ? `Desde el ${diaCorto(f.desde_dia)} queda` : "Queda"} ${pct(f.queda_pb)}.`,
    };
  }
  return { titulo: f.mensaje || "Esta línea no se puede guardar.", detalle: "" };
}

// ─── Las piezas del cálculo ──────────────────────────────────────────────────

type TipoDeItem = "entera" | "parte" | "pieza" | "pc" | "sinElegir";

/** Un espacio del contrato (lo que se guarda: una fila por espacio). */
interface Item {
  fixture: UnifiedFixture;
  face: "A" | "B";
  tipo: TipoDeItem;
  /** `EN2`, `BI1`; `null` para la cara entera y el porcentaje. */
  parte: string | null;
  /** La clase de la parte (`entrepanos`), o la de la cara por partes sin elegir. */
  clase: string | null;
  corto: string;
  /** El código completo del espacio; del porcentaje, el de la cara. */
  codigo: string;
  /** Por qué fila de la vista previa del servidor se lo reconoce. */
  llave: string;
  ref: number | null;
  origenRef: OrigenDeTarifa;
  disponibilidad: RangeAvailability;
  porQue: "propio" | "entera" | "partes" | null;
}

export type TipoDeLinea = "entera" | "partes" | "pieza" | "pc";

// ─── El hook ─────────────────────────────────────────────────────────────────

export function useContrato({
  espacios, sede, rango, semilla, ocupacionDe, onQuitar, onCambiarCara, onCambiarParte, onGuardado,
}: ArgsContrato) {
  const fixtures = useFixtureStore(selectFixtures);
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const seasonWindows = useFixtureStore((s) => s.seasonWindows);
  // Las fichas propias del supermercado: con ellas `rateTypeOf` resuelve la
  // tarifa de un mueble colocado desde una (`cli:…`). Llegan después del
  // primer dibujo, así que van en las dependencias de lo que la pregunta.
  const fichasPropias = useFichasPropias();
  // Lo que dice la BASE de cada espacio, por código completo. Con la venta
  // por partes no alcanza el mueble fusionado: vender la puerta 2 no le cambia
  // nada a la nevera, y la entera choca con esa puerta.
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);

  // El periodo con el que abre. Se congela al montar a propósito: cambiar la
  // temporada de arriba no debe reescribirle las fechas a alguien que ya está
  // tecleando el acuerdo.
  const [inicial] = useState<DateRange>(() => rango ?? rangoPorDefecto());

  // Al renovar mandan las fechas de la semilla —el día después de que termina
  // el contrato vigente, por el mismo largo— y no el periodo de la barra.
  const [desde, setDesde] = useState(semilla?.desde || iso(inicial.from));
  const [hasta, setHasta] = useState(semilla?.hasta || iso(inicial.to));
  const [proveedor, setProveedor] = useState(semilla?.proveedor ?? "");
  const [correo, setCorreo] = useState(semilla?.correo ?? "");
  const [marca, setMarca] = useState(semilla?.marca ?? "");
  const [nota, setNota] = useState("");
  /** El precio de cada línea, tecleado, por su clave de precio. Vive en un mapa
   *  y no adentro de la lista porque la lista la manda la pantalla —se arma
   *  tocando el plano— y volver a montarla no puede borrar lo que alguien ya
   *  escribió. */
  const [valores, setValores] = useState<Record<string, string>>(
    () => semilla?.valores ?? {},
  );
  /** Cómo se escribió cada precio: el total del plazo o «al mes». */
  const [modos, setModos] = useState<Record<string, ModoPrecio>>({});
  /** El porcentaje de cada línea de porcentaje (puntos básicos), por el
   *  código completo de la cara. */
  const [porcentajes, setPorcentajes] = useState<Record<string, number>>(() => semilla?.porcentajes ?? {});
  /** Cómo se cobra: precio fijo, o un % de las ventas con su corte. */
  const [cobroModo, setCobroModo] = useState<"fijo" | "ventas">("fijo");
  const [ventasTexto, setVentasTexto] = useState("");
  const [corte, setCorte] = useState<"mensual" | "al_final">("mensual");
  /** «Reservar hasta…»: la fecha la elige quien opera. Arranca VACÍA y no
   *  guarda sin ella (decisión de la dueña, 2026-10-18). */
  const [reservando, setReservando] = useState(false);
  const [caduca, setCaduca] = useState("");
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");

  // «Empezar de nuevo» vacía la lista sin remontar la ficha: la reserva a
  // medio elegir se va con las líneas.
  useEffect(() => {
    if (espacios.length === 0) { setReservando(false); setCaduca(""); }
  }, [espacios.length]);

  const fechasEnOrden = desde.length > 0 && hasta.length > 0 && desde <= hasta;
  // Los dos extremos cuentan: el proveedor ocupa el mueble el primer día y el
  // último. Restar fechas a secas da un día menos, y así se facturaba.
  const dias = fechasEnOrden
    ? Math.round(
        (Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10)) -
          Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))) /
          86_400_000,
      ) + 1
    : 0;
  /** Cuántos meses dura (la misma cuenta que el servidor, `utils/meses.ts`). */
  const nMeses = fechasEnOrden ? meses(desde, hasta) : 0;

  /** Cada espacio del contrato, con lo comercial suyo.
   *
   *  La disponibilidad responde por LAS FECHAS QUE ESTÁN ESCRITAS, no por el
   *  periodo con el que abrió: si alguien corre el «hasta» hasta pisar un
   *  contrato que ya existe, el aviso aparece en esa línea — y se va cuando
   *  lo corre de vuelta. */
  const items = useMemo((): Item[] => {
    const f0 = fechasEnOrden ? parseISODate(desde) : null;
    const t0 = fechasEnOrden ? parseISODate(hasta) : null;
    const d = f0 && t0 ? f0 : inicial.from;
    const h = f0 && t0 ? t0 : inicial.to;
    return espacios.map(({ fixture, face, parte: sufijo, pc, porPartes }) => {
      const sedeDe = fixture.sede || sede;
      if (pc || porPartes) {
        // El porcentaje y la cara por partes sin elegir no son un espacio:
        // son la CARA. El código de la cara se arma con la sede del plano,
        // como lo arma el servidor (`codigo_cara`).
        const corto = codigoDeParte(fixture.code, face, null);
        const codigo = fullSpaceCode(pc ? sede : sedeDe, corto);
        return {
          fixture, face, tipo: pc ? "pc" as const : "sinElegir" as const, parte: null, clase: porPartes ?? null,
          corto, codigo, llave: `${codigo}#${pc ? "PC" : "?"}`,
          ref: pc ? tarifaDeEspacio(referenceRates, sedeDe, fixture, null).valor : null,
          origenRef: "cara" as const,
          disponibilidad: pc && tomadaPorLoSuyo(fixture, face, estadoComercial, sede, d, h) ? "tomado" as const : "libre" as const,
          porQue: null,
        };
      }
      // Vender por partes: `NEV-03-PU2` es la puerta 2 de `NEV-03`. Lo
      // comercial —el código, la tarifa de ESA parte y si se puede vender
      // mirando lo que choca— es una cuenta pura, probada en `probar-partes`.
      const { parte, corto, codigo, ref, origenRef, disponibilidad, porQue } = comercialDelEspacio(
        fixture, face, sufijo ?? null,
        { rates: referenceRates, sede, estado: estadoComercial, desde: d, hasta: h },
      );
      return {
        fixture, face, tipo: !parte ? "entera" as const : esDivision(parte) ? "parte" as const : "pieza" as const,
        parte: parte ? sufijo!.toUpperCase() : null, clase: parte?.clase ?? null,
        corto, codigo, llave: codigo.toUpperCase(),
        ref, origenRef: origenRef as OrigenDeTarifa,
        disponibilidad: disponibilidad as RangeAvailability, porQue,
      };
    });
  }, [espacios, fixtures, referenceRates, sede, desde, hasta, fechasEnOrden, inicial, fichasPropias,
    estadoComercial]);

  /** Las LÍNEAS del contrato, como se leen y se cobran: la cara entera, las
   *  partes de una cara juntas («PUN-02 · EN1, EN2», un precio), el porcentaje
   *  de una cara y cada pieza. Cada una entrega su TOTAL (`monto`). */
  const lineas = useMemo(() => {
    type Grupo = { clave: string; tipo: TipoDeLinea; base: Item; items: Item[] };
    const grupos: Grupo[] = [];
    const porClave = new Map<string, Grupo>();
    for (const it of items) {
      const tipo: TipoDeLinea = it.tipo === "sinElegir" || it.tipo === "parte" ? "partes" : it.tipo;
      const token = it.clase ? (claseDe(it.clase)?.token ?? it.clase) : "";
      const caraCompleta = fullSpaceCode(it.fixture.sede || sede, codigoDeParte(it.fixture.code, it.face, null));
      const clave = tipo === "partes" ? `${caraCompleta}-${token}*` : tipo === "pc" ? `${it.codigo}-PC*` : it.codigo;
      const ya = porClave.get(clave);
      if (ya) { if (it.tipo !== "sinElegir") ya.items.push(it); continue; }
      const g = { clave, tipo, base: it, items: it.tipo === "sinElegir" ? [] : [it] };
      porClave.set(clave, g);
      grupos.push(g);
    }
    const f0 = fechasEnOrden ? desde : iso(inicial.from);
    const t0 = fechasEnOrden ? hasta : iso(inicial.to);
    return grupos.map(({ clave, tipo, base, items: deLaLinea }) => {
      const fixture = (deLaLinea[0] ?? base).fixture;
      const face = (deLaLinea[0] ?? base).face;
      const doble = isDoubleGondola(fixture);
      const clase = (deLaLinea[0] ?? base).clase;
      const partes = deLaLinea.map((i) => i.parte!).filter(Boolean);
      const parteRef = partes.length === 1 ? parteDeSufijo(partes[0]) : null;
      // El porcentaje: lo que queda en las fechas del contrato, de la
      // ocupación anónima. Nunca de quién es lo demás.
      const par = tipo === "pc" ? ocupacionDe?.(fixture, face) : undefined;
      const queda = tipo === "pc" ? quedaEnLaCara(fixture, par, f0, t0) : null;
      const pb = tipo === "pc" ? (porcentajes[base.codigo] ?? 0) : 0;
      const tarifaCara = tipo === "pc" ? base.ref : null;
      const ref = tipo === "pc"
        ? (tarifaCara !== null && pb > 0 ? redondear(tarifaCara * pb / 10_000) : null)
        : deLaLinea.length > 0 && deLaLinea.every((i) => i.ref !== null)
        ? deLaLinea.reduce((t, i) => t + (i.ref ?? 0), 0)
        : null;
      const texto = valores[clave] ?? "";
      const numero = Number(texto.replace(/[^\d]/g, "")) || 0;
      const modo: ModoPrecio = modos[clave] ?? "total";
      const monto = deLaLinea.length === 0 && tipo !== "pc" ? 0
        : modo === "mensual" ? redondear(numero * nMeses) : numero;
      const peor: RangeAvailability = tipo === "pc"
        ? (base.disponibilidad === "tomado" || (queda !== null && queda.quedaPb <= 0) ? "tomado" : "libre")
        : deLaLinea.reduce<RangeAvailability>((p, i) =>
          (i.disponibilidad === "tomado" || p === "tomado" ? "tomado" : i.disponibilidad === "parcial" || p === "parcial" ? "parcial" : "libre"), "libre");
      const n = clase ? cantidadDe(fixture, clase) : null;
      const visibleCara = codigoVisibleDe(fixture.code, face, doble, null);
      return {
        clave,
        /** Para `valoresDeLista`: la clave del precio. Los códigos de lo que se
         *  guarda están en `items`. */
        codigo: clave,
        tipo,
        fixture, face, doble, clase, partes, items: deLaLinea,
        /** La cara (sin partes): de ella son el porcentaje, el resaltado y el visor. */
        codigoCara: base.codigo,
        /** Lo que choca de cada espacio, sin nombres. */
        porQue: deLaLinea.find((i) => i.porQue)?.porQue ?? null,
        parte: partes.length === 1 && tipo !== "partes" ? partes[0] : null,
        /** «Puerta 2 de 3», «2 de 5 entrepaños». */
        textoParte: tipo === "pieza" && parteRef ? textoDeParte(parteRef, cantidadDe(fixture, parteRef.clase))
          : tipo === "partes" && clase ? `${partes.length} de ${n ?? "?"} ${claseDe(clase)?.plural ?? clase}`
          : tipo === "pc" ? textoAlTocarEnVender(queda ? { dispo: "parcial", quedaPb: queda.quedaPb } : null, true)
          : null,
        /** `GON-60·A`, `PUN-02 · EN1, EN2`, `CAJ-04·BI1`: como se lee. */
        visible: tipo === "partes" && partes.length > 0
          ? `${visibleCara} · ${[...partes].sort().join(", ")}`
          : tipo === "pieza" && parteRef ? codigoVisibleDe(fixture.code, face, doble, parteRef)
          : visibleCara,
        nombre: nombreDeMueble({ code: (deLaLinea[0] ?? base).corto }),
        ubicacion: describirUbicacion(fixtures, fixture.code),
        ref, origenRef: (deLaLinea[0] ?? base).origenRef,
        /** De dónde sale la referencia, dicho: «75 % de $ 800.000 al mes»,
         *  «$ 650.000 ÷ 5 × 2». */
        tarifaCara,
        refUnidad: deLaLinea[0]?.ref ?? null,
        valor: texto,
        numero,
        modo,
        monto,
        desvio: ref !== null && numero > 0 && modo === "total" ? Math.round((1 - numero / ref) * 100) : null,
        disponibilidad: peor,
        pb,
        quedaPb: queda?.quedaPb ?? null,
        quedaDesde: queda?.dia ?? null,
        hoy: par?.hoy ?? null,
        /** Pide más de lo que queda en esas fechas: no se guarda. */
        noEntra: tipo === "pc" && queda !== null && pb > queda.quedaPb,
        renueva: tipo === "pc" ? (semilla?.renueva?.[base.codigo] ?? null) : null,
        sinElegir: tipo === "partes" && deLaLinea.length === 0,
      };
    });
  }, [items, valores, modos, porcentajes, nMeses, ocupacionDe, desde, hasta, fechasEnOrden, inicial, sede, fixtures,
    semilla]);

  /** Al entrar, cada línea arranca con su tarifa de referencia escrita, y el
   *  campo la SIGUE mientras nadie lo toque: la tarifa de un mueble de una
   *  ficha propia llega con las fichas, después del primer dibujo; la de un
   *  porcentaje cambia con el %, y la de las partes con las que se marcan. La
   *  cuenta está en `utils/precioDeLista.ts`. */
  // Lo que trae la semilla ya es de alguien: al renovar, el valor que manda es
  // el que se está pagando hoy, no la tarifa de lista. Lo mismo lo que se
  // teclea (`escribirValor`).
  const tocados = useRef(new Set<string>(Object.keys(semilla?.valores ?? {})));
  useEffect(() => {
    const nuevos = valoresDeLista(lineas, tocados.current);
    if (Object.keys(nuevos).length) setValores((v) => ({ ...v, ...nuevos }));
  }, [lineas]);

  const escribirValor = useCallback((codigo: string, txt: string) => {
    tocados.current.add(codigo);
    const soloDigitos = txt.replace(/[^\d]/g, "");
    setValores((v) => ({
      ...v,
      [codigo]: soloDigitos ? Number(soloDigitos).toLocaleString("es-CO") : "",
    }));
  }, []);

  /** «Volver a la tarifa»: escribe la de lista y deja de contarla como
   *  tocada, así el campo la vuelve a seguir. Por `escribirValor`: no hay otro
   *  camino que escriba el precio. */
  const volverALaTarifa = useCallback((clave: string, ref: number) => {
    escribirValor(clave, textoDePrecio(ref));
    tocados.current.delete(clave);
  }, [escribirValor]);
  const tocado = (clave: string) => tocados.current.has(clave);

  /** «Total | Al mes». Lo tecleado se convierte para que el total no salte;
   *  lo que nadie tocó sigue siendo la tarifa (que es al mes), y pasa a
   *  leerse como tal. */
  const cambiarModo = useCallback((clave: string, modo: ModoPrecio) => {
    setModos((m) => ({ ...m, [clave]: modo }));
    if (!tocados.current.has(clave) || nMeses <= 0) return;
    const l = lineas.find((x) => x.clave === clave);
    if (!l || l.modo === modo || l.numero <= 0) return;
    escribirValor(clave, String(modo === "mensual" ? redondear(l.numero / nMeses) : redondear(l.numero * nMeses)));
  }, [lineas, nMeses, escribirValor]);

  const escribirPorcentaje = useCallback((codigoCara: string, pb: number) => {
    setPorcentajes((p) => ({ ...p, [codigoCara]: Math.max(0, Math.min(10_000, Math.round(pb))) }));
  }, []);

  /** Lo que vale el contrato: la suma del TOTAL de cada línea.
   *
   *  Acá hubo un prorrateo —`(valor / 30) * dias`— que convertía lo tecleado
   *  en otro número: $200.000 por un mes del 11 de septiembre al 11 de octubre
   *  salían $206.667. **Quien negocia vende el espacio al valor que quiera por
   *  el tiempo que quiera** (decisión del dueño): el total es lo que se
   *  teclea. «Al mes» no lo cambia: es otra forma de TECLEARLO (× los meses
   *  calendario de `meses()`), y cada línea entrega igual su total. */
  const total = lineas.reduce((t, l) => t + l.monto, 0);

  /** Las temporadas comerciales que caen adentro del plazo: el argumento de
   *  venta que una planilla no da, y el control de que las fechas quedaron
   *  donde se querían. */
  const cubre = useMemo(() => {
    const d = parseISODate(desde);
    const h = parseISODate(hasta);
    if (!d || !h || h < d) return [] as string[];
    return upcomingSeasons(d, seasonWindows)
      .filter((t) => t.from <= h && t.to >= d)
      .map((t) => t.label);
  }, [desde, hasta, seasonWindows]);

  /** Los atajos de fecha: «1 mes · 3 meses · <la temporada que viene>». */
  const atajos = useMemo(() => {
    const base = parseISODate(desde) ? desde : iso(new Date());
    const fuera = [
      { texto: "1 mes", desde: base, hasta: sumarDias(sumarMeses(base, 1), -1) },
      { texto: "3 meses", desde: base, hasta: sumarDias(sumarMeses(base, 3), -1) },
    ];
    const hoy = new Date();
    const lista = upcomingSeasons(hoy, seasonWindows);
    const viene = lista.find((t) => t.from > hoy) ?? lista[0];
    if (viene) {
      const a = iso(viene.from), b = iso(viene.to);
      fuera.push({ texto: `${viene.label} · ${rangoCorto(a, b)}`, desde: a, hasta: b });
    }
    return fuera;
  }, [desde, seasonWindows]);

  /** Una parte de una cara, para la lista de partes de su línea: si se puede
   *  vender en las fechas escritas (sin decir por qué no) y su tarifa. */
  const parteEnElContrato = useCallback((fixture: UnifiedFixture, face: "A" | "B", sufijo: string) => {
    const f0 = fechasEnOrden ? parseISODate(desde) : null;
    const t0 = fechasEnOrden ? parseISODate(hasta) : null;
    const r = comercialDelEspacio(fixture, face, sufijo, {
      rates: referenceRates, sede, estado: estadoComercial,
      desde: f0 && t0 ? f0 : inicial.from, hasta: f0 && t0 ? t0 : inicial.to,
    });
    return { disponibilidad: r.disponibilidad, ref: r.ref };
  }, [fechasEnOrden, desde, hasta, referenceRates, sede, estadoComercial, inicial, fichasPropias]);

  /** Cómo se cobra, como lo recibe el servidor. */
  const ventasPb = pbDeTexto(ventasTexto);
  const cobro: Cobro = cobroModo === "fijo"
    ? { modo: "fijo" }
    : { modo: "ventas", porcentaje: (ventasPb ?? 0) / 100, corte };
  const cortes = cobroModo === "ventas" && fechasEnOrden ? cortesDe(desde, hasta, corte) : [];

  /** El pedido, como lo recibe `POST /contratos/vender`, y de qué espacio
   *  sale cada línea (para leer el 409 por índice). Las partes de una línea
   *  van una por espacio, con el precio repartido parejo (lo que no se divide
   *  justo, a la primera). Con `relleno`, para la vista previa: un proveedor y
   *  un valor de mentira donde todavía no hay. */
  const armarPedido = (tipo: "contrato" | "reserva", relleno: boolean) => {
    const filas: LineaDeVenta[] = [];
    const deDonde: { item: Item; linea: (typeof lineas)[number] }[] = [];
    const conVentas = cobroModo === "ventas";
    for (const l of lineas) {
      if (l.sinElegir) continue;
      if (l.tipo === "pc") {
        if (relleno && l.pb <= 0) continue;
        filas.push({
          participacion: { cara: l.codigoCara, puntos_basicos: l.pb, renueva: l.renueva },
          valor: conVentas ? 0 : relleno ? (l.monto > 0 ? l.monto : 1) : l.monto,
          modo_precio: l.modo, valor_tecleado: conVentas ? 0 : l.numero,
        });
        deDonde.push({ item: l.items[0], linea: l });
        continue;
      }
      const n = l.items.length;
      const parte = Math.floor(l.monto / n), resto = l.monto - parte * n;
      const tec = Math.floor(l.numero / n), restoTec = l.numero - tec * n;
      l.items.forEach((it, k) => {
        const monto = parte + (k === 0 ? resto : 0);
        filas.push({
          espacio: it.codigo,
          valor: conVentas ? 0 : relleno ? (monto > 0 ? monto : 1) : monto,
          modo_precio: l.modo, valor_tecleado: conVentas ? 0 : tec + (k === 0 ? restoTec : 0),
        });
        deDonde.push({ item: it, linea: l });
      });
    }
    const pedido: PedidoDeVenta = {
      sede: lineas[0]?.fixture.sede || sede,
      proveedor: relleno ? proveedor.trim() || "—" : proveedor.trim(),
      correo: correo.trim() || undefined,
      marca: marca.trim() || undefined,
      nota: nota.trim() || undefined,
      desde, hasta,
      tipo,
      caduca: tipo === "reserva" ? caduca || null : null,
      cobro: conVentas && !relleno ? cobro : conVentas ? { modo: "ventas", porcentaje: (ventasPb ?? 100) / 100, corte } : { modo: "fijo" },
      lineas: filas,
    };
    return { pedido, deDonde };
  };

  /** El veredicto del SERVIDOR, por espacio (`llave`).
   *
   *  El plano y la disponibilidad de cada línea salen de lo que el navegador
   *  bajó: una copia. Si un contrato entró por otro camino (otra sesión, otro
   *  computador), la copia dice «libre» y la base dice «ocupado», y el choque
   *  se descubría al guardar, con todo tecleado. `?validar=1` corre la MISMA
   *  revisión que el guardado —fechas, choques, capacidad de cada porcentaje—
   *  y no escribe nada, así que se le puede preguntar mientras se arma. */
  const [veredicto, setVeredicto] = useState<Record<string, FilaRechazada[]>>({});
  const pedido = useRef(0);
  const sedeContrato = lineas[0]?.fixture.sede || sede;
  const firmaValidacion = JSON.stringify([
    sedeContrato, desde, hasta, items.map((i) => i.llave), lineas.map((l) => l.pb),
  ]);

  useEffect(() => {
    if (lineas.length === 0 || !fechasEnOrden) { setVeredicto({}); return; }
    const mio = ++pedido.current;
    // Se espera a que dejen de teclear las fechas: el campo de fecha dispara
    // un cambio por dígito y cada uno sería un viaje.
    const t = setTimeout(() => {
      const { pedido: lo, deDonde } = armarPedido("contrato", true);
      if (lo.lineas.length === 0) { setVeredicto({}); return; }
      validarContrato(lo).then((r) => {
        if (mio !== pedido.current) return;  // llegó una respuesta vieja
        const out: Record<string, FilaRechazada[]> = {};
        for (const f of r.filas) {
          // Lo que se rellena, no se cree: el proveedor y el valor de verdad
          // los controla la pantalla y el servidor los vuelve a mirar al
          // guardar, que es donde manda.
          if (!f.mensaje || RELLENADO.test(f.mensaje)) continue;
          const de = deDonde[f.indice];
          if (de) out[de.item.llave] = [...(out[de.item.llave] ?? []), f];
        }
        setVeredicto(out);
      }).catch(() => {
        // Sin red no se inventa un veredicto: se cae al aviso local y el
        // servidor vuelve a decidir al guardar, que es donde siempre mandó.
        if (mio === pedido.current) setVeredicto({});
      });
    }, 500);
    return () => clearTimeout(t);
    // `proveedor` y los precios a propósito NO disparan: cambian mientras se
    // teclea y no cambian el veredicto sobre las fechas y la capacidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaValidacion, fechasEnOrden]);

  /** Lo que el servidor rechazó al GUARDAR (409, no se escribió nada), por
   *  espacio. Vale para las líneas y las fechas con que se pidió: si cambian,
   *  se va. */
  const [rechazo, setRechazo] = useState<{ firma: string; porLlave: Record<string, FilaRechazada> } | null>(null);
  const rechazoVigente = rechazo && rechazo.firma === firmaValidacion ? rechazo.porLlave : null;

  /** Las mismas líneas, con lo que dijo el servidor pegado a cada una. Va en
   *  un paso aparte porque el veredicto llega después —es un viaje— y
   *  recalcular las líneas enteras al llegar borraría lo que se esté
   *  tecleando. */
  const lineasConVeredicto = useMemo(
    () => lineas.map((l) => {
      const filas = l.items.flatMap((i) => veredicto[i.llave] ?? []);
      return {
        ...l,
        choqueServidor: filas.map((f) => {
          const t = textoDelRechazo(f, l.tipo === "pc" ? l.pb : null);
          return t.detalle ? `${t.titulo} ${t.detalle}` : t.titulo;
        }),
        rechazo: l.items.map((i) => rechazoVigente?.[i.llave]).find(Boolean) ?? null,
        items: l.items.map((i) => ({ ...i, choqueServidor: (veredicto[i.llave] ?? []).map((f) => f.mensaje) })),
      };
    }),
    [lineas, veredicto, rechazoVigente],
  );

  const sinValor = cobroModo === "fijo" ? lineas.filter((l) => !l.sinElegir && l.monto <= 0) : [];
  const sinElegir = lineas.filter((l) => l.sinElegir);
  const sinPorcentaje = lineas.filter((l) => l.tipo === "pc" && l.pb <= 0);
  /** Las líneas cuyo periodo choca con algo que ya existe, o cuyo % ya no entra.
   *
   *  Antes esto no frenaba nada: el botón se habilitaba igual y el único que
   *  se quejaba era el servidor, al guardar, con todo ya tecleado. Se vendió
   *  dos veces el mismo espacio por ese hueco. El servidor SIGUE validando —es
   *  él quien manda, y entre que se arma el contrato y se toca el botón alguien
   *  pudo vender desde otra sesión—; esto es para no llegar hasta ahí
   *  sabiéndolo desde el principio. */
  const chocan = lineas.filter(
    (l) => l.disponibilidad !== "libre" || l.items.some((i) => (veredicto[i.llave] ?? []).length > 0) || l.noEntra,
  );
  const ventasMal = cobroModo === "ventas" && ventasPb === null;
  const lineasReales = lineas.filter((l) => !l.sinElegir);
  const puedeGuardar =
    lineasReales.length > 0 && proveedor.trim().length > 0 && fechasEnOrden
    && sinValor.length === 0 && sinElegir.length === 0 && sinPorcentaje.length === 0 && !ventasMal
    && chocan.length === 0;

  /** Qué falta para poder guardar, dicho antes de que alguien busque el botón.
   *  Nombra la línea: con tres, «falta el valor» obliga a buscar cuál. */
  const falta = lineas.length === 0
    ? "Tocá un espacio en el plano"
    : !proveedor.trim()
    ? "Falta el proveedor"
    : sinElegir.length > 0
    ? `Elegí qué ${claseDe(sinElegir[0].clase ?? "")?.plural ?? "partes"} de ${sinElegir[0].visible}`
    : sinPorcentaje.length > 0
    ? `Elegí cuánto de ${sinPorcentaje[0].visible}`
    : ventasMal
    ? "Escribí el % de las ventas"
    : sinValor.length > 0
    ? sinValor.length === 1
      ? `Falta el valor de ${sinValor[0].visible}`
      : `Faltan ${sinValor.length} valores`
    : !fechasEnOrden
    ? "Revisá las fechas"
    : chocan.length > 0
    // Nombra la línea, igual que con el valor que falta.
    ? chocan.length === 1
      ? chocan[0].noEntra
        ? `Ya no entra el ${pct(chocan[0].pb)} de ${chocan[0].visible}`
        : `${chocan[0].visible} ya está vendido en esas fechas`
      : `${chocan.length} espacios ya están vendidos en esas fechas`
    : null;

  /** El día de hoy del negocio (el del servidor, si la ocupación llegó). */
  const hoy = lineas.find((l) => l.hoy)?.hoy ?? iso(new Date());
  /** «Reservar hasta…»: con una fecha elegida, de hoy al último día del
   *  contrato (el servidor exige lo mismo). Vale para cualquier línea y con
   *  cualquier cobro: una reserva guarda su precio, o su % de las ventas y su
   *  corte (decisión del dueño, 2026-10-20), y al confirmarla el contrato
   *  queda cobrando igual. */
  const faltaReserva = !caduca
    ? "Elegí hasta cuándo se sostiene la reserva."
    : caduca < hoy
    ? "La reserva no puede terminar antes de hoy."
    : caduca > hasta
    ? "La reserva no puede durar más que el contrato."
    : null;
  const puedeReservar = puedeGuardar;

  async function guardar() {
    const tipo = reservando ? "reserva" : "contrato";
    if (!puedeGuardar || estado === "guardando" || (tipo === "reserva" && (faltaReserva || !puedeReservar))) return;
    setEstado("guardando");
    setError("");
    setRechazo(null);
    const firma = firmaValidacion;
    const { pedido: lo, deDonde } = armarPedido(tipo, false);
    try {
      // TODO junto o nada (`POST /contratos/vender`): un candado para todas
      // las caras, una revisión con la base de ahora y un commit. Antes era la
      // tanda de la planilla, que guardaba lo que pasaba y saltaba lo demás —con
      // una cara entera y un porcentaje en el mismo contrato quedaba medio
      // contrato firmado—. Y un solo envío de avisos: un acuerdo es un correo
      // por rol, no uno por espacio.
      const resp = await guardarContrato(lo);

      // La planometría no va acá: se carga en Supervisar, en la ficha del
      // espacio, con el contrato ya hecho (decisión de la dueña, 2026-10-20).
      onGuardado({
        espacios: lineasReales.map((l) => (l.tipo === "pc" ? `${l.visible} · ${pct(l.pb)}` : l.visible)),
        proveedor: proveedor.trim(),
        desde,
        hasta,
        // Mismo criterio que el total de la pantalla: la suma del total de
        // cada línea. Si estos dos números se separan, el aviso de «guardado»
        // contradice a la ficha que se acaba de firmar. Todo o nada: lo que se
        // guardó es todo lo que está en pantalla.
        total: cobroModo === "fijo" ? total : 0,
        tipo,
        caduca: tipo === "reserva" ? caduca : null,
        cobro,
        avisos: resp.avisos ?? undefined,
      });
    } catch (e) {
      const filas = filasRechazadas(e);
      if (filas) {
        const porLlave: Record<string, FilaRechazada> = {};
        for (const f of filas) {
          const de = deDonde[f.indice];
          if (de) porLlave[de.item.llave] = f;
        }
        setRechazo({ firma, porLlave });
        setError(Object.keys(porLlave).length === filas.length
          ? "No se guardó nada: revisá las líneas marcadas."
          : `No se guardó nada. ${filas.map((f) => f.mensaje).filter(Boolean).join(" ")}`);
      } else {
        setError(describeError(e, "No se pudo guardar el contrato. No se guardó nada."));
      }
      setEstado("error");
    }
  }

  return {
    // La sede efectiva: los muebles dibujados antes de que existiera esa
    // columna no la traen, y ahí manda la sede activa.
    sede: lineas[0]?.fixture.sede || sede,
    lineas: lineasConVeredicto, onQuitar, onCambiarCara, onCambiarParte,
    total, cubre, atajos,
    desde, setDesde, hasta, setHasta,
    proveedor, setProveedor, correo, setCorreo, marca, setMarca,
    escribirValor, volverALaTarifa, tocado, cambiarModo, escribirPorcentaje, parteEnElContrato,
    nota, setNota,
    cobroModo, setCobroModo, ventasTexto, setVentasTexto, ventasPb, corte, setCorte, cortes,
    reservando, setReservando, caduca, setCaduca, faltaReserva, puedeReservar, hoy,
    dias, nMeses, textoDeMeses, fechasEnOrden, puedeGuardar, falta,
    vienenDelPeriodo: !!rango && desde === iso(rango.from) && hasta === iso(rango.to),
    estado, error, guardar,
  };
}

export type Contrato = ReturnType<typeof useContrato>;
export type LineaDelContrato = Contrato["lineas"][number];

/* ── LO QUE SE FUE DE ESTE ARCHIVO (rediseño de Vender, PR 1) ───────────────
   El contrato iba por la tanda de la planilla (`api/bulkLeases`: validar y
   confirmar), que no es todo o nada y no sabe de porcentajes: los resultados
   «por fila» con lo que no se pudo guardar (`fallaron`) se fueron con ella.
   Ahora una sola llamada guarda todo o nada (`api/vender.ts`), y un 409 dice
   en cada línea qué no entró, sin escribir ninguna. */
