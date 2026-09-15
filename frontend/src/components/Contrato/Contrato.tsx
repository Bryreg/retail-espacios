import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { describirUbicacion } from "../MiniMapa/MiniMapa";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { parseISODate, upcomingSeasons } from "../../types/seasons";
import { confirmarLote, validarLote } from "../../api/bulkLeases";
import { subirPlanometria } from "../../api/planograms";
import { describeError } from "../../api/client";
import type { AvisosContrato } from "../../types";
import {
  fullSpaceCode, isDoubleGondola, rangeAvailability, rateTypeOf, referenceRateFor,
  type FaceData, type RangeAvailability, type UnifiedFixture,
} from "../../types/fixtures";
import { nombreDeMueble } from "../../utils/nomenclatura";

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
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ResumenContrato {
  /** Los espacios que quedaron guardados, como se leen: `PUN-05`, `GON-60·A`. */
  espacios: string[];
  proveedor: string;
  desde: string;
  hasta: string;
  /** El total del plazo, que es lo que quedó escrito. */
  total: number;
  /** El contrato quedó pero la planometría no subió. Se dice en la
   *  confirmación: callarlo dejaría al mercaderista sin la única imagen de
   *  cómo debe quedar el mueble, y nadie se enteraría hasta el montaje. */
  avisoPlanometria?: string;
  /** Los espacios que NO se pudieron guardar, con su motivo.
   *
   *  Un contrato de tres espacios son tres filas en la base, y la segunda
   *  puede fallar con la primera ya escrita. Deshacer la primera sería peor
   *  —el correo ya salió y otra sesión pudo haberla leído—, así que no se
   *  deshace nada: se dice exactamente qué quedó y qué no. */
  fallaron?: { espacio: string; motivo: string }[];
  /** A quién avisó el servidor. Ausente = no se pudo saber. */
  avisos?: AvisosContrato;
}

/** Una cara adentro del contrato que se está armando. */
export interface CaraElegida {
  fixture: UnifiedFixture;
  face: "A" | "B";
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
  /** Por código completo del espacio, como los escribe el formulario. */
  valores: Record<string, string>;
}

export interface ArgsContrato {
  /** Los espacios del contrato, en el orden en que se fueron tocando.
   *
   *  Un contrato con un proveedor sobre TRES puntas de góndola es un solo
   *  acuerdo —un proveedor, un periodo, una firma— y tecleado de a uno eran
   *  tres veces el mismo formulario, con tres oportunidades de escribir una
   *  fecha distinta. Acá es una lista y el valor va por espacio, que es como
   *  se negocia: la punta de la entrada no vale lo que la del fondo. */
  espacios: CaraElegida[];
  /** Sede activa, para los muebles sin `sede` propia (los dibujados antes de esa columna). */
  sede: string;
  /** El periodo elegido arriba. Es de donde salen las fechas por defecto. */
  rango: DateRange | null;
  /** Con qué abre el formulario cuando se llega por «Renovar».
   *
   *  Renovar no es hacer un contrato en blanco sobre el mismo mueble: es el
   *  mismo acuerdo otra vez, y lo único que suele cambiar es el precio. Sin
   *  esto había que volver a tipear el proveedor, el correo, la marca y el
   *  valor mirando la ficha de al lado, y cada uno de esos cuatro campos es una
   *  oportunidad de escribir mal el nombre del proveedor y crear uno nuevo. */
  semilla?: SemillaContrato | null;
  /** Sacar una cara de la lista desde la propia ficha. */
  onQuitar: (fixtureId: string, face: "A" | "B") => void;
  /** Sumar o sacar una cara de una góndola doble. Es un interruptor por cara,
   *  no un selector entre las dos: vendérselas ambas al mismo proveedor en el
   *  mismo contrato es lo normal, y con un selector había que hacer dos. */
  onCambiarCara: (fixtureId: string, face: "A" | "B") => void;
  /** El contrato YA está en la base cuando esto se llama. No hay nada que
   *  escribirle al plano: quien dibuja vuelve a leer. */
  onGuardado: (resumen: ResumenContrato) => void;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

export const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-13" → "13 sep 2026". Los ISO son para la base, no para leerlos. */
export function fechaCorta(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** El periodo con el que arranca el contrato cuando arriba no hay temporada.
 *
 *  Prellenar es deliberado: reescribir dos fechas a mano era el paso que más se
 *  equivocaba, y una pantalla en blanco tampoco dice qué hacer primero. */
/** Los mensajes del servidor que hablan de un campo que le mandamos RELLENO.
 *
 *  La validación en vivo pregunta por las fechas, y para eso manda un proveedor
 *  y un valor de mentira cuando todavía están vacíos —si no, la fila se cae por
 *  un campo obligatorio y no se llega nunca a la respuesta sobre las fechas—.
 *  La contracara obligatoria: lo que se rellena, no se cree. */
const RELLENADO = /^(Proveedor nuevo|Falta el proveedor|Falta el valor)/i;

function rangoPorDefecto(): DateRange {
  const hoy = new Date();
  const to = new Date(hoy);
  to.setDate(to.getDate() + 30);
  return { from: hoy, to };
}

function datosDeCara(f: UnifiedFixture, face: "A" | "B"): FaceData {
  if (face === "B") return (f.faceB ?? {}) as FaceData;
  return {
    status: f.status, supplierName: f.supplierName, brandCategory: f.brandCategory,
    negotiatedValue: f.negotiatedValue, startDate: f.startDate, endDate: f.endDate,
    observation: f.observation,
  } as FaceData;
}

// ─── El hook ─────────────────────────────────────────────────────────────────

export function useContrato({
  espacios, sede, rango, semilla, onQuitar, onCambiarCara, onGuardado,
}: ArgsContrato) {
  const fixtures = useFixtureStore(selectFixtures);
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const seasonWindows = useFixtureStore((s) => s.seasonWindows);

  // El periodo con el que abre. Se congela al montar a propósito: cambiar la
  // temporada de arriba no debe reescribirle las fechas a alguien que ya está
  // tecleando el acuerdo.
  const [inicial] = useState<DateRange>(() => rango ?? rangoPorDefecto());

  // Al renovar mandan las fechas de la semilla —el día después de que termina
  // el contrato vigente, por el mismo largo— y no el periodo de la barra de
  // arriba: renovar «del 2 sep al 2 oct» cuando el contrato corre hasta el 26
  // de septiembre solaparía tres semanas con un acuerdo que sigue vivo.
  const [desde, setDesde] = useState(semilla?.desde ?? iso(inicial.from));
  const [hasta, setHasta] = useState(semilla?.hasta ?? iso(inicial.to));
  const [proveedor, setProveedor] = useState(semilla?.proveedor ?? "");
  const [correo, setCorreo] = useState(semilla?.correo ?? "");
  const [marca, setMarca] = useState(semilla?.marca ?? "");
  const [nota, setNota] = useState("");
  /** El valor acordado de cada espacio, tecleado, indexado por su código
   *  completo. Vive en un mapa y no adentro de la lista porque la lista la
   *  manda la pantalla —se arma tocando el plano— y volver a montarla no
   *  puede borrar lo que alguien ya escribió. */
  const [valores, setValores] = useState<Record<string, string>>(
    () => semilla?.valores ?? {},
  );
  /** La planometría que el proveedor mandó: cómo debe quedar armada la
   *  exhibición. Se sube DESPUÉS de crear el contrato, porque cuelga de él. */
  const [planometria, setPlanometria] = useState<File | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");

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

  /** Cada espacio del contrato, con todo lo que su renglón necesita saber.
   *
   *  La disponibilidad responde por LAS FECHAS QUE ESTÁN ESCRITAS, no por el
   *  periodo con el que abrió: si alguien corre el «hasta» hasta pisar un
   *  contrato que ya existe, el aviso aparece en ese renglón — y se va cuando
   *  lo corre de vuelta. */
  const lineas = useMemo(() => {
    const f = fechasEnOrden ? parseISODate(desde) : null;
    const t = fechasEnOrden ? parseISODate(hasta) : null;
    return espacios.map(({ fixture, face }) => {
      const corto = face === "B" ? `${fixture.code}-B` : fixture.code;
      const codigo = fullSpaceCode(fixture.sede || sede, corto);
      const datos = datosDeCara(fixture, face);
      const ref = referenceRateFor(referenceRates, fixture.sede || sede, rateTypeOf(fixture));
      const texto = valores[codigo] ?? "";
      const monto = Number(texto.replace(/[^\d]/g, "")) || 0;
      return {
        fixture, face, corto, codigo, ref,
        doble: isDoubleGondola(fixture),
        /** `GON-60·A`, que es como se lee. El de la base sigue siendo `corto`. */
        visible: isDoubleGondola(fixture) ? `${fixture.code}·${face}` : corto,
        // Un mueble tiene UN nombre y es su código: lo que se lee acá es lo
        // mismo que dibuja el plano, sin resolver nada.
        nombre: nombreDeMueble({ code: corto }),
        ubicacion: describirUbicacion(fixtures, fixture.code),
        valor: texto,
        monto,
        desvio: ref !== null && monto > 0 ? Math.round((1 - monto / ref) * 100) : null,
        disponibilidad: (f && t
          ? rangeAvailability(datos, f, t)
          : rangeAvailability(datos, inicial.from, inicial.to)) as RangeAvailability,
      };
    });
  }, [espacios, valores, fixtures, referenceRates, sede, desde, hasta, fechasEnOrden, inicial]);


  /** Al entrar, cada espacio arranca con su tarifa de referencia escrita.
   *
   *  No es una comodidad: el precio de lista es el punto de partida real de la
   *  negociación, y dejar el campo vacío obliga a ir a buscar la tarifa en otro
   *  panel y a teclearla — que es donde se cuela un cero de más. Se escribe una
   *  sola vez por espacio; si alguien lo borra a mano, se queda borrado. */
  // Lo que trae la semilla ya cuenta como visto: al renovar, el valor que
  // manda es el que se está pagando hoy, no la tarifa de lista. Pisarlo con la
  // tarifa haría que renovar arrancara proponiendo otro precio sin que nadie lo
  // pidiera.
  const vistos = useRef(new Set<string>(Object.keys(semilla?.valores ?? {})));
  useEffect(() => {
    const nuevos: Record<string, string> = {};
    for (const l of lineas) {
      if (vistos.current.has(l.codigo)) continue;
      vistos.current.add(l.codigo);
      if (l.ref !== null) nuevos[l.codigo] = l.ref.toLocaleString("es-CO");
    }
    if (Object.keys(nuevos).length) setValores((v) => ({ ...v, ...nuevos }));
  }, [lineas]);

  const escribirValor = useCallback((codigo: string, txt: string) => {
    const soloDigitos = txt.replace(/[^\d]/g, "");
    setValores((v) => ({
      ...v,
      [codigo]: soloDigitos ? Number(soloDigitos).toLocaleString("es-CO") : "",
    }));
  }, []);

  /** Lo que vale el contrato: la suma de lo tecleado, sin tocar.
   *
   *  Acá había un prorrateo —`(valor / 30) * dias`— que convertía lo tecleado
   *  en otro número: $200.000 por un mes del 11 de septiembre al 11 de octubre
   *  salían $206.667, porque los dos extremos cuentan (31 días) y el mes se
   *  tomaba de 30. La cuenta estaba bien y la premisa estaba mal.
   *
   *  **Quien negocia vende el espacio al valor que quiera por el tiempo que
   *  quiera** (decisión del dueño). Si acuerda un mes por $200.000, el
   *  contrato vale $200.000; si acuerda 31 días por $200.000, vale lo mismo.
   *  No hay un valor mensual del que se derive un total: hay un precio, y es
   *  el que se teclea. Derivar otro número sólo servía para que la pantalla
   *  contradijera al que lo acordó. */
  const total = lineas.reduce((t, l) => t + l.monto, 0);

  /** Las temporadas comerciales que caen adentro del plazo.
   *
   *  Es el argumento de venta que el sistema puede dar y una planilla no:
   *  «este contrato cubre Amor y Amistad y Halloween». También es un control
   *  —si la temporada que se estaba buscando NO aparece, las fechas están
   *  mal— y por eso va al lado del total y no escondido en una ayuda. */
  const cubre = useMemo(() => {
    const d = parseISODate(desde);
    const h = parseISODate(hasta);
    if (!d || !h || h < d) return [] as string[];
    return upcomingSeasons(d, seasonWindows)
      .filter((t) => t.from <= h && t.to >= d)
      .map((t) => t.label);
  }, [desde, hasta, seasonWindows]);

  /** El veredicto del SERVIDOR sobre las fechas, por código de espacio.
   *
   *  Esto no es un lujo: el plano y la disponibilidad de cada renglón salen
   *  del JSON del layout, que es una copia — quien la mantiene al día es el
   *  navegador que vendió, en el momento de vender. Si un contrato entró por
   *  otro camino (otra sesión, un arreglo a mano, una carga cuyo push del
   *  layout no llegó), la copia dice «libre» y la base dice «ocupado». Ahí el
   *  aviso local no aparece, el botón se habilita, y el choque se descubre al
   *  guardar, con todo tecleado. Reproducido así: contrato del 8 de septiembre
   *  al 8 de octubre en la base, el plano pintándolo libre todo el periodo.
   *
   *  `/leases/bulk/validar` es el mismo control que corre al guardar pero **no
   *  escribe nada**, así que se le puede preguntar mientras se arma. Manda la
   *  base, no la copia. */
  const [veredicto, setVeredicto] = useState<Record<string, string[]>>({});
  const pedido = useRef(0);
  const sedeContrato = lineas[0]?.fixture.sede || sede;
  const firmaValidacion = JSON.stringify([
    sedeContrato, desde, hasta, lineas.map((l) => l.codigo),
  ]);

  useEffect(() => {
    if (lineas.length === 0 || !fechasEnOrden) { setVeredicto({}); return; }
    const mio = ++pedido.current;
    // Se espera a que dejen de teclear las fechas: el campo de fecha dispara
    // un cambio por dígito y cada uno sería un viaje.
    const t = setTimeout(() => {
      validarLote(
        sedeContrato,
        lineas.map((l, i) => ({
          fila: i + 1, espacio: l.codigo, sede: l.fixture.sede || sede,
          // El proveedor y el valor todavía pueden estar vacíos: lo que se le
          // pregunta al servidor son LAS FECHAS. Un relleno acá no crea nada
          // —`/validar` no escribe— y evita que falte un campo obligatorio.
          //
          // El valor iba de verdad, y ésa era la falla: la firma de abajo NO lo
          // mira, así que la primera validación salía con el campo en cero, el
          // servidor contestaba «Falta el valor mensual», y eso quedaba
          // guardado para siempre — tipear el valor no volvía a preguntar. Peor
          // todavía: `chocan` cuenta CUALQUIER mensaje del servidor como choque
          // de fechas, así que el espacio quedaba marcado «ya está vendido en
          // esas fechas» y no se podía guardar nunca más.
          proveedor: proveedor.trim() || "—",
          valor: l.monto > 0 ? l.monto : 1,
          desde, hasta,
        })),
      ).then((r) => {
        if (mio !== pedido.current) return;  // llegó una respuesta vieja
        const out: Record<string, string[]> = {};
        for (const f of r.filas) {
          if (f.estado !== "error") continue;
          // Lo que se rellena, no se cree. Arriba van un proveedor y un valor
          // de mentira para que la fila no se caiga por un campo que todavía no
          // se llenó; creerle al servidor sobre ESOS campos sería creerle sobre
          // el relleno. El proveedor y el valor de verdad los controla la
          // pantalla —`sinValor` y el botón— y el servidor los vuelve a mirar
          // al guardar, que es donde manda.
          const ms = (f.mensajes ?? []).filter((m) => !RELLENADO.test(m));
          if (ms.length) out[(f.codigo || "").toUpperCase()] = ms;
        }
        setVeredicto(out);
      }).catch(() => {
        // Sin red no se inventa un veredicto: se cae al aviso local y el
        // servidor vuelve a decidir al guardar, que es donde siempre mandó.
        if (mio === pedido.current) setVeredicto({});
      });
    }, 500);
    return () => clearTimeout(t);
    // `proveedor` a propósito NO dispara: cambia mientras se teclea y no
    // cambia el veredicto sobre las fechas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaValidacion, fechasEnOrden]);

  /** Las mismas líneas, con lo que dijo el servidor pegado a cada una.
   *  Va en un paso aparte porque el veredicto llega después —es un viaje— y
   *  recalcular las líneas enteras al llegar borraría lo que se esté
   *  tecleando. */
  const lineasConVeredicto = useMemo(
    () => lineas.map((l) => ({ ...l, choqueServidor: veredicto[l.codigo.toUpperCase()] ?? [] })),
    [lineas, veredicto],
  );

  const sinValor = lineas.filter((l) => l.monto <= 0);
  /** Los espacios cuyo periodo choca con un contrato que ya existe.
   *
   *  Antes esto no frenaba nada: el botón se habilitaba igual y el único que
   *  se quejaba era el servidor, al guardar, con todo ya tecleado. Y el aviso
   *  del renglón vivía adentro de un texto que se corta, así que en la
   *  práctica no se veía. Se vendió dos veces el mismo espacio por ese hueco.
   *
   *  El servidor SIGUE validando —es él quien manda, y entre que se arma el
   *  contrato y se toca el botón alguien pudo vender desde otra sesión—; esto
   *  es para no llegar hasta ahí sabiéndolo desde el principio. */
  const chocan = lineas.filter(
    (l) => l.disponibilidad !== "libre" || (veredicto[l.codigo.toUpperCase()] ?? []).length > 0,
  );
  const puedeGuardar =
    lineas.length > 0 && proveedor.trim().length > 0 && fechasEnOrden
    && sinValor.length === 0 && chocan.length === 0;

  /** Qué falta para poder guardar, dicho antes de que alguien busque el botón.
   *  Nombra el espacio al que le falta el valor: con tres renglones, «falta el
   *  valor» obliga a buscar cuál. */
  const falta = lineas.length === 0
    ? "Tocá un espacio en el plano"
    : !proveedor.trim()
    ? "Falta el proveedor"
    : sinValor.length > 0
    ? sinValor.length === 1
      ? `Falta el valor de ${sinValor[0].visible}`
      : `Faltan ${sinValor.length} valores`
    : !fechasEnOrden
    ? "Revisá las fechas"
    : chocan.length > 0
    // Nombra el espacio, igual que con el valor que falta: con tres renglones,
    // «hay un choque» obliga a ir a buscar cuál.
    ? chocan.length === 1
      ? `${chocan[0].visible} ya está vendido en esas fechas`
      : `${chocan.length} espacios ya están vendidos en esas fechas`
    : null;

  async function guardar() {
    if (!puedeGuardar || estado === "guardando") return;
    setEstado("guardando");
    setError("");
    try {
      // Un contrato de N espacios va por el camino de la TANDA y no por el de
      // a uno, y no es una comodidad de implementación: por el camino de a uno
      // cada espacio dispara su propio juego de correos, así que un acuerdo
      // sobre tres puntas le llegaba al proveedor como tres confirmaciones, al
      // comercial como tres contratos nuevos y al mercaderista como tres
      // órdenes. Nueve correos para una sola firma es exactamente lo que hace
      // que nadie los lea. El endpoint de tanda ya resolvía eso para la
      // planilla —«un correo por rol para TODA la tanda»— y es el mismo
      // problema.
      //
      // De paso trae dos cosas gratis: revalida cada espacio contra la base
      // justo antes de escribir —entre que se armó el contrato y se tocó el
      // botón, alguien pudo haber vendido una de esas puntas desde otra
      // sesión— y devuelve fila por fila qué pasó con cada una.
      const resp = await confirmarLote(
        lineas[0]?.fixture.sede || sede,
        lineas.map((l, i) => ({
          fila: i + 1,
          espacio: l.codigo,
          sede: l.fixture.sede || sede,
          proveedor: proveedor.trim(),
          correo: correo.trim() || undefined,
          marca: marca.trim() || undefined,
          valor: l.monto,
          desde,
          hasta,
          nota: nota.trim() || undefined,
        })),
      );

      const porFila = new Map(resp.filas.map((f) => [f.fila, f]));
      const guardados: string[] = [];
      const fallaron: { espacio: string; motivo: string }[] = [];
      let total = 0;

      lineas.forEach((l, i) => {
        const fila = porFila.get(i + 1);
        if (!fila || fila.lease_id == null) {
          fallaron.push({
            espacio: l.visible,
            motivo: fila?.mensajes.join(" ") || "el servidor no lo pudo crear",
          });
          return;
        }
        guardados.push(l.visible);
        total += l.monto;
      });

      if (guardados.length === 0) {
        setError(fallaron[0]?.motivo || "No se pudo guardar el contrato.");
        setEstado("error");
        return;
      }

      // La planometría va aparte y DESPUÉS: cuelga del contrato, que hasta acá
      // no existía. Va a CADA espacio y no sólo al primero — el mercaderista
      // abre el espacio que le toca montar, y una lámina que sólo cuelga de
      // otro no la ve nunca. Si falla no se tira abajo el contrato —ya está
      // guardado y los correos ya salieron—: se avisa, y se puede volver a
      // cargar desde el detalle del espacio.
      let avisoPlanometria: string | undefined;
      if (planometria) {
        for (const fila of resp.filas) {
          if (fila.lease_id == null) continue;
          try {
            await subirPlanometria(fila.lease_id, planometria);
          } catch (e) {
            avisoPlanometria = describeError(
              e,
              "La planometría no se pudo subir. El contrato quedó guardado; cargala desde el detalle del espacio.",
            );
          }
        }
      }

      onGuardado({
        espacios: guardados,
        proveedor: proveedor.trim(),
        desde,
        hasta,
        // Mismo criterio que el total de la pantalla: lo acordado, sumado y
        // sin prorratear. Si estos dos números se separan, el aviso de
        // «guardado» contradice a la ficha que se acaba de firmar.
        total,
        avisoPlanometria,
        fallaron: fallaron.length ? fallaron : undefined,
        avisos: resp.avisos ?? undefined,
      });
    } catch (e) {
      setError(describeError(e, "No se pudo guardar el contrato."));
      setEstado("error");
    }
  }

  return {
    // La sede efectiva: los muebles dibujados antes de que existiera esa
    // columna no la traen, y ahí manda la sede activa.
    sede: lineas[0]?.fixture.sede || sede,
    lineas: lineasConVeredicto, onQuitar, onCambiarCara,
    total, cubre,
    desde, setDesde, hasta, setHasta,
    proveedor, setProveedor, correo, setCorreo, marca, setMarca,
    escribirValor, nota, setNota,
    planometria, setPlanometria,
    dias, fechasEnOrden, puedeGuardar, falta,
    vienenDelPeriodo: !!rango && desde === iso(rango.from) && hasta === iso(rango.to),
    estado, error, guardar,
  };
}

export type Contrato = ReturnType<typeof useContrato>;

/* ── LO QUE SE FUE DE ESTE ARCHIVO (PR 2 · Vender con la forma de D) ────────
   `CabezaContrato`, `CamposContrato`, `Renglon`, `Etiqueta`, el estilo `campo`
   y la tabla `DISPONIBILIDAD` vivían acá y los dibujaba `ModoVender`. La ficha
   de D no es la misma ficha con otra piel: cambian la composición (filas mono
   con el valor adentro, separador punteado, total grande, sellos, botón dentro
   del panel), el orden de los campos (Proveedor|Marca y Desde|Hasta en dos
   pares) y dónde vive cada aviso. Reescribirla EN `ModoVender.tsx` —que es el
   único que la usa— deja una pieza en un archivo en vez de una pieza repartida
   en dos, y este archivo se queda con lo que de verdad comparte: el hook.

   `useContrato` NO se tocó: la aritmética del contrato (el prorrateo por día
   sobre 30, los dos extremos contando, la revalidación contra la base al
   guardar, el reparto de parches por cara) es exactamente la misma. Lo que
   cambió es la forma, que es lo que este PR vino a cambiar. */
