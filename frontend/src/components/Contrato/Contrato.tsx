import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, ImageUp, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { describirUbicacion } from "../MiniMapa/MiniMapa";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { parseISODate, upcomingSeasons } from "../../types/seasons";
import { confirmarLote } from "../../api/bulkLeases";
import { subirPlanometria } from "../../api/planograms";
import { describeError } from "../../api/client";
import type { AvisosContrato } from "../../types";
import NotifyPreview from "../NotifyPreview";
import {
  fullSpaceCode, isDoubleGondola, rangeAvailability, rateTypeOf, referenceRateFor,
  type FaceData, type RangeAvailability, type UnifiedFixture,
} from "../../types/fixtures";
import { nombreDeMueble } from "../../utils/nomenclatura";

/**
 * El contrato: un hook con todo el estado y dos piezas para dibujarlo.
 *
 * Está partido en tres a propósito. En el modo Vender el botón de guardar no
 * vive adentro del formulario sino en una barra al pie de la pantalla —así el
 * resumen de lo que se está por firmar (espacio → proveedor → valor → fechas)
 * se lee de un vistazo antes de tocarlo, que para algo que escribe plata vale
 * la pena. Eso obliga a que el estado esté por encima de los campos, no dentro.
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

/** El parche que hay que escribirle al layout, por cara. */
export interface ParcheDeCara {
  fixtureId: string;
  face: "A" | "B";
  patch: Partial<FaceData>;
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
  onGuardado: (parches: ParcheDeCara[], resumen: ResumenContrato) => void;
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

export const DISPONIBILIDAD: Record<
  RangeAvailability,
  { texto: string; color: string; fondo: string; borde: string }
> = {
  libre:   { texto: "Libre todo el periodo", color: "var(--success)", fondo: "var(--success-50)", borde: "var(--success-100)" },
  parcial: { texto: "Parte del periodo vendida", color: "var(--warning)", fondo: "var(--warning-50)", borde: "var(--line)" },
  tomado:  { texto: "Vendido en ese periodo", color: "var(--ink-2)", fondo: "var(--surface-3)", borde: "var(--line)" },
};

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
  /** El valor mensual de cada espacio, tecleado, indexado por su código
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
        nombre: nombreDeMueble({ code: corto, nomenclatura: fixture.nomenclatura }),
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

  /** Lo que se cobra por mes por TODO el contrato. */
  const montoMensual = lineas.reduce((t, l) => t + l.monto, 0);

  /** Lo que se firma, no lo que se cobra por mes.
   *
   *  El formulario pide el valor MENSUAL —así se negocia— pero lo que queda
   *  escrito en el contrato es el total del plazo, y son dos números
   *  distintos: $2.250.000 al mes por 61 días son $4.575.000. Sin este
   *  renglón había que hacer la cuenta de cabeza con el proveedor esperando,
   *  que es exactamente cuando se equivoca. Prorratea por día sobre 30, igual
   *  que todo el resto del sistema. */
  const total = montoMensual > 0 && fechasEnOrden ? Math.round((montoMensual / 30) * dias) : 0;

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

  const sinValor = lineas.filter((l) => l.monto <= 0);
  const puedeGuardar =
    lineas.length > 0 && proveedor.trim().length > 0 && fechasEnOrden && sinValor.length === 0;

  /** Qué falta para poder guardar, dicho antes de que alguien busque el botón.
   *  Nombra el espacio al que le falta el valor: con tres renglones, «falta el
   *  valor mensual» obliga a buscar cuál. */
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
      const parches: ParcheDeCara[] = [];
      const guardados: string[] = [];
      const fallaron: { espacio: string; motivo: string }[] = [];

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
        parches.push({
          fixtureId: l.fixture.id,
          face: l.face,
          patch: {
            status: "occupied",
            supplierName: proveedor.trim(),
            brandCategory: marca.trim(),
            negotiatedValue: l.monto,
            startDate: desde,
            endDate: hasta,
            observation: nota.trim(),
          } as Partial<FaceData>,
        });
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

      onGuardado(parches, {
        espacios: guardados,
        proveedor: proveedor.trim(),
        desde,
        hasta,
        total: Math.round(
          (parches.reduce((t, p) => t + (p.patch.negotiatedValue ?? 0), 0) / 30) * dias,
        ),
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
    lineas, onQuitar, onCambiarCara,
    total, montoMensual, cubre,
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

// ─── Piezas ──────────────────────────────────────────────────────────────────

const campo: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px", boxSizing: "border-box",
  borderRadius: "var(--r-xs)", border: "1px solid var(--line-strong)",
  background: "#FCFDFD", color: "var(--ink-1)",
  fontSize: 14.5, fontWeight: 500, fontFamily: "inherit", outline: "none",
};

/** El nombre del campo, en versalita condensada.
 *
 *  Era texto corriente en 11.5 semibold: al lado del valor —que va en 14.5—
 *  competía con él, y en una columna de ocho campos apilados eso da dieciséis
 *  renglones que pesan casi igual. En versalita el nombre se lee sin leerse,
 *  que es lo que tiene que hacer una etiqueta. */
function Etiqueta({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="rotulo" style={{ marginBottom: 4 }}>
      {children}
      {hint && (
        <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--ink-4)" }}>
          {" · "}{hint}
        </span>
      )}
    </div>
  );
}

/** Un renglón de la lista: qué espacio es, dónde queda y cuánto sale.
 *
 *  El valor va ADENTRO del renglón y no en un campo aparte, porque en un
 *  contrato de tres espacios hay tres precios y no uno: la punta de la entrada
 *  no vale lo que la del fondo, y ese es justamente el detalle que se negocia.
 *  Arranca con la tarifa de referencia escrita —el precio de lista es el punto
 *  de partida real— y al lado se ve el desvío, así que bajar el precio es una
 *  decisión que se toma mirando cuánto se está bajando. */
function Renglon({
  l, c, sePuedeQuitar,
}: {
  l: Contrato["lineas"][number];
  c: Contrato;
  sePuedeQuitar: boolean;
}) {
  const pinta = DISPONIBILIDAD[l.disponibilidad];
  return (
    <div
      style={{
        border: "1px solid var(--line)", borderRadius: "var(--r-xs)",
        padding: "7px 9px", background: "#FCFDFD",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 17,
          letterSpacing: "0.01em", lineHeight: 1, flexShrink: 0,
        }}>
          {l.nombre}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {l.fixture.label || l.fixture.code}
          {l.ubicacion && <><br />{l.ubicacion}</>}
        </span>
        {sePuedeQuitar && (
          <button
            onClick={() => c.onQuitar(l.fixture.id, l.face)}
            title="Quitar este espacio del contrato"
            aria-label={`Quitar ${l.visible}`}
            style={{
              flexShrink: 0, background: "none", border: "none", cursor: "pointer",
              color: "var(--ink-3)", fontSize: 14.5, lineHeight: 1, padding: 2,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Una góndola doble son DOS espacios que se venden por separado, y las
            dos pueden ir en el mismo contrato: una marca que quiere el pasillo
            entero compra las dos caras de la misma góndola. Por eso cada letra
            es un interruptor y no una opción — con un selector entre A y B eso
            eran dos contratos. La cara de ESTE renglón va marcada; la otra se
            prende y aparece como un renglón propio, con su propio valor. */}
        {l.doble && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {(["A", "B"] as const).map((id) => {
              const propia = l.face === id;
              const puesta = c.lineas.some((o) => o.fixture.id === l.fixture.id && o.face === id);
              return (
                <button
                  key={id}
                  onClick={() => c.onCambiarCara(l.fixture.id, id)}
                  title={puesta
                    ? `Sacar la cara ${id} del contrato`
                    : `Sumar la cara ${id} al contrato`}
                  style={{
                    height: 26, padding: "0 8px", borderRadius: "var(--r-xs)", cursor: "pointer",
                    border: `1px solid ${propia ? "var(--ink-1)" : puesta ? "var(--line-strong)" : "var(--line)"}`,
                    background: propia ? "var(--accent-50)" : "var(--surface)",
                    color: puesta ? "var(--ink-1)" : "var(--ink-4)",
                    fontSize: 12, fontWeight: propia ? 700 : 600, fontFamily: "inherit",
                  }}
                >
                  {id}
                </button>
              );
            })}
          </div>
        )}
        {/* El peso va como rótulo del campo y no adentro del texto: tecleado
            se borra, y un campo de plata sin signo se confunde con los días. */}
        <div
          style={{
            flex: 1, minWidth: 0, height: 30, display: "flex", alignItems: "center",
            gap: 2, padding: "0 9px", boxSizing: "border-box",
            borderRadius: "var(--r-xs)", background: "var(--surface)",
            border: `1px solid ${l.monto > 0 ? "var(--line-strong)" : "var(--ocupado)"}`,
          }}
        >
          <span aria-hidden style={{ fontSize: 13, fontWeight: 700, color: l.monto > 0 ? "var(--ink-3)" : "var(--ocupado)" }}>
            $
          </span>
          <input
            value={l.valor}
            onChange={(e) => c.escribirValor(l.codigo, e.target.value)}
            placeholder="valor mensual"
            inputMode="numeric"
            aria-label={`Valor mensual de ${l.visible}`}
            style={{
              flex: 1, minWidth: 0, height: "100%", padding: 0, border: "none",
              background: "transparent", outline: "none", textAlign: "right",
              color: "var(--ink-1)", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--ink-3)", flexShrink: 0 }}>al mes</span>
        </div>
      </div>

      {/* La referencia y el desvío, en el renglón del espacio que los tiene.
          Estaban debajo de un campo único, y con tres espacios ese único
          número no decía de cuál de los tres estaba hablando. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, minHeight: 15 }}>
        {l.ref === null ? (
          <span style={{ color: "var(--ink-4)" }}>Sin tarifa de referencia para este tipo</span>
        ) : (
          <>
            <span style={{ color: "var(--ink-3)" }}>Referencia {money(l.ref)}</span>
            {l.desvio !== null && l.desvio !== 0 && (
              <span style={{
                fontWeight: 700,
                color: l.desvio >= 1 ? "var(--entra-txt)" : "var(--libre)",
              }}>
                {l.desvio >= 1 ? `${l.desvio}% por debajo` : `${Math.abs(l.desvio)}% por encima`}
              </span>
            )}
          </>
        )}
        {l.disponibilidad !== "libre" && (
          <span
            title={l.disponibilidad === "parcial"
              ? "Parte del periodo ya está vendida en este espacio"
              : "Este espacio está vendido en el periodo elegido"}
            style={{ marginLeft: "auto", color: pinta.color, fontWeight: 600 }}
          >
            {pinta.texto}
          </span>
        )}
      </div>
    </div>
  );
}

/** El encabezado de la ficha: de qué contrato se trata y sobre qué espacios.
 *
 *  Los espacios van adentro de recuadros propios y no sueltos entre los
 *  campos. Son los únicos datos del formulario que NO se teclean —vienen de
 *  haber tocado el plano— y encuadrarlos lo dice sin una sola palabra: esto ya
 *  está decidido, lo de abajo es lo que falta. */
export function CabezaContrato({ c }: { c: Contrato }) {
  const pedirEnfoque3D = useFixtureStore((s) => s.pedirEnfoque3D);
  const uno = c.lineas.length === 1 ? c.lineas[0] : null;
  return (
    <div style={{ padding: "11px 15px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 9 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.005em", margin: 0 }}>
          Contrato
        </h2>
        {c.lineas.length > 1 && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {c.lineas.length} espacios
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>sin firmar</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {c.lineas.map((l) => (
          <Renglon
            key={`${l.fixture.id}-${l.face}`}
            l={l}
            c={c}
            /* Con un solo espacio no se ofrece quitarlo: dejaría un contrato
               sin nada adentro, y para eso está Cancelar. */
            sePuedeQuitar={c.lineas.length > 1}
          />
        ))}
      </div>

      {/* «+ agregar otro espacio» no es un botón que abra un buscador: el
          buscador es el plano que está al lado, y decirlo acá es más corto que
          descubrirlo. Un contrato sobre tres puntas de góndola es UN acuerdo
          —un proveedor, un periodo, una firma— y tecleado de a uno eran tres
          veces el mismo formulario con tres oportunidades de escribir una
          fecha distinta. */}
      <div style={{
        marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--ink-1)",
        display: "flex", alignItems: "baseline", gap: 7,
      }}>
        + agregar otro espacio
        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--ink-3)" }}>
          tocalo en el plano
        </span>
      </div>

      {/* Mostrarle al proveedor cómo se ve su exhibición mientras se negocia.
          El 3D es la única pantalla que pone el arte sobre el mueble, y sin
          esto había que entrar a mano y buscarlo entre 104 muebles. Con más de
          un espacio no se ofrece: el editor encuadra UNO, y elegir cuál sería
          una pregunta más en medio de la llamada. */}
      {uno && (
        <button
          onClick={() => pedirEnfoque3D(uno.fixture.id, uno.face)}
          style={{
            marginTop: 9, width: "100%", height: 30, borderRadius: "var(--r-xs)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            border: "1px solid var(--line)", background: "var(--surface-2)",
            color: "var(--ink-2)", fontSize: 12, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <Box size={13} />
          Ver la exhibición en 3D
        </button>
      )}
    </div>
  );
}

/** Los campos. Sin botón de guardar: ese vive en la barra del pie. */
export function CamposContrato({ c }: { c: Contrato }) {
  return (
    // `alignContent: start` no es cosmético: en un grid que crece con el alto de
    // la columna, las filas implícitas se estiran para repartirse el sobrante y
    // los campos quedaban separados por medio dedo de aire cada uno.
    <div
      style={{
        padding: "13px 14px", display: "grid", gap: 12, alignContent: "start",
      }}
    >
      {/* La advertencia de disponibilidad se dice en el renglón del espacio
          del que habla —acá arriba, con el resto de los espacios— y no en un
          recuadro suelto entre los campos: con tres espacios ese recuadro no
          decía de cuál de los tres estaba hablando. Lo único que queda acá es
          el recuento, cuando hay más de uno con problema. */}
      {(() => {
        const enConflicto = c.lineas.filter((l) => l.disponibilidad !== "libre");
        if (enConflicto.length === 0) return null;
        return (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 7,
            fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: "var(--entra)" }} />
            <span>
              {enConflicto.length === 1
                ? `${enConflicto[0].visible} ya tiene ${enConflicto[0].disponibilidad === "parcial" ? "parte del" : "todo el"} periodo vendido: revisá las fechas antes de guardar.`
                : `${enConflicto.length} de los espacios ya tienen vendido parte del periodo: revisá las fechas antes de guardar.`}
            </span>
          </div>
        );
      })()}

      <div>
        <Etiqueta>Proveedor</Etiqueta>
        <input
          value={c.proveedor}
          onChange={(e) => c.setProveedor(e.target.value)}
          placeholder="Alpina, Nutresa, Postobón…"
          style={campo}
          autoFocus
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Etiqueta hint="para la constancia">Correo</Etiqueta>
          <input
            value={c.correo}
            onChange={(e) => c.setCorreo(e.target.value)}
            placeholder="opcional"
            style={campo}
            inputMode="email"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Etiqueta hint="opcional">Marca o categoría</Etiqueta>
          <input
            value={c.marca}
            onChange={(e) => c.setMarca(e.target.value)}
            placeholder="Lácteos, Chocolates Jet…"
            style={campo}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Etiqueta>Desde</Etiqueta>
          <input type="date" value={c.desde} onChange={(e) => c.setDesde(e.target.value)} style={campo} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Etiqueta>Hasta</Etiqueta>
          <input type="date" value={c.hasta} onChange={(e) => c.setHasta(e.target.value)} style={campo} />
        </div>
      </div>
      <div
        style={{
          marginTop: -6, fontSize: 12, lineHeight: 1.4,
          color: c.desde && c.hasta && !c.fechasEnOrden ? "var(--danger)" : "var(--ink-3)",
        }}
      >
        {c.desde && c.hasta && !c.fechasEnOrden
          ? "La fecha de fin es anterior a la de inicio."
          : c.fechasEnOrden
          ? `${c.vienenDelPeriodo ? "Del periodo elegido arriba · " : ""}${c.dias} día${
              c.dias === 1 ? "" : "s"
            }, contando los dos extremos.`
          : "Elegí las fechas del acuerdo."}
      </div>

      {/* La planometría: qué le prometimos armar al proveedor.
          Va acá y no en el plano porque cuelga de ESTE contrato — la misma
          punta recibe una distinta cada temporada, y en el mueble habría un
          solo casillero que se sobreescribe. */}
      <div>
        <Etiqueta hint="foto o PDF del proveedor">Planometría</Etiqueta>
        {c.planometria ? (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "8px 10px", borderRadius: "var(--r-md)",
              border: "1px solid var(--accent-200)", background: "var(--accent-50)",
            }}
          >
            <ImageUp size={15} style={{ color: "var(--accent-700)", flexShrink: 0 }} />
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {c.planometria.name}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", flexShrink: 0 }}>
              {Math.max(1, Math.round(c.planometria.size / 1024))} KB
            </span>
            <button
              onClick={() => c.setPlanometria(null)}
              aria-label="Quitar la planometría"
              style={{
                display: "flex", alignItems: "center", background: "none",
                border: "none", padding: 2, cursor: "pointer", color: "var(--ink-3)",
              }}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <label
            style={{
              display: "flex", alignItems: "center", gap: 8,
              height: 38, padding: "0 11px", cursor: "pointer",
              borderRadius: "var(--r-md)", border: "1px dashed var(--line-strong)",
              background: "var(--surface-2)", color: "var(--ink-3)", fontSize: 12.5,
            }}
          >
            <ImageUp size={15} />
            Adjuntar cómo debe quedar la exhibición
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => c.setPlanometria(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <div style={{ marginTop: 5, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.4 }}>
          La ve el mercaderista al montar, y sirve de prueba si el proveedor reclama.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Etiqueta hint="opcional">Nota</Etiqueta>
        <textarea
          rows={2}
          value={c.nota}
          onChange={(e) => c.setNota(e.target.value)}
          placeholder="Algo que haya que saber de este acuerdo"
          style={{ ...campo, height: "auto", padding: "9px 10px", resize: "none", lineHeight: 1.45 }}
        />
      </div>

      {/* Quién se va a enterar, ANTES de guardar. Justo encima del botón, que
          es donde se toma la decisión: enterarse después de haber cerrado la
          llamada no sirve de nada. */}
      <NotifyPreview sede={c.sede} />

      {/* ── Lo que se firma ─────────────────────────────────────────────────
          El total del plazo, que no es el valor mensual: $1.500.000 al mes por
          61 días son $3.050.000, y esa cuenta se hacía de cabeza con el
          proveedor esperando del otro lado.

          Es la única cifra grande de la pantalla —27 px, el peso 900 de Chivo—
          y se la gana: es lo que va a quedar escrito. Debajo, las temporadas
          que el plazo cubre, que son a la vez el argumento de venta y el
          control de que las fechas quedaron donde se querían. */}
      {c.total > 0 && (
        <div>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            borderTop: "2px solid var(--ink-1)", paddingTop: 9,
          }}>
            <span className="rotulo" style={{ fontSize: 11 }}>Total del contrato</span>
            <span style={{ fontSize: 27, fontWeight: 900, letterSpacing: "-0.02em" }}>
              {money(c.total)}
            </span>
          </div>
          {c.cubre.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
              {c.cubre.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 12, fontWeight: 500, color: "var(--libre)",
                    background: "var(--libre-suave)", padding: "3px 8px",
                    borderRadius: "var(--r-xs)",
                  }}
                >
                  Cubre {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
