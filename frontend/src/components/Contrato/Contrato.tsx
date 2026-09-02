import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Box, ImageUp, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { describirUbicacion } from "../MiniMapa/MiniMapa";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { parseISODate, upcomingSeasons } from "../../types/seasons";
import { findOrCreateSpace, createLease } from "../../api/spaces";
import { subirPlanometria } from "../../api/planograms";
import { findOrCreateSupplier } from "../../api/suppliers";
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
  corto: string;
  codigo: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** El contrato quedó pero la planometría no subió. Se dice en la
   *  confirmación: callarlo dejaría al mercaderista sin la única imagen de
   *  cómo debe quedar el mueble, y nadie se enteraría hasta el montaje. */
  avisoPlanometria?: string;
  /** A quién avisó el servidor. Ausente = no se pudo saber. */
  avisos?: AvisosContrato;
}

export interface ArgsContrato {
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** Sede activa, para los muebles sin `sede` propia (los dibujados antes de esa columna). */
  sede: string;
  /** El periodo elegido arriba. Es de donde salen las fechas por defecto. */
  rango: DateRange | null;
  onGuardado: (patch: Partial<FaceData>, resumen: ResumenContrato) => void;
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

export function useContrato({ fixture, face, sede, rango, onGuardado }: ArgsContrato) {
  const fixtures = useFixtureStore(selectFixtures);
  const referenceRates = useFixtureStore((s) => s.referenceRates);
  const seasonWindows = useFixtureStore((s) => s.seasonWindows);

  const corto = face === "B" ? `${fixture.code}-B` : fixture.code;
  const codigo = fullSpaceCode(fixture.sede || sede, corto);
  const datos = datosDeCara(fixture, face);
  const doble = isDoubleGondola(fixture);
  const ref = referenceRateFor(referenceRates, fixture.sede || sede, rateTypeOf(fixture));

  // El periodo con el que abre. Se congela al montar a propósito: cambiar la
  // temporada de arriba no debe reescribirle las fechas a alguien que ya está
  // tecleando el acuerdo.
  const [inicial] = useState<DateRange>(() => rango ?? rangoPorDefecto());

  /** Dónde queda, con las referencias que alguien reconoce sin plano. El mapa
   *  está al lado, pero al teléfono con el proveedor hay que poder decir "es la
   *  punta de la entrada, no la del fondo". */
  const ubicacion = useMemo(
    () => describirUbicacion(fixtures, fixture.code),
    [fixtures, fixture.code],
  );

  const [desde, setDesde] = useState(iso(inicial.from));
  const [hasta, setHasta] = useState(iso(inicial.to));
  const [proveedor, setProveedor] = useState("");
  const [correo, setCorreo] = useState("");
  const [marca, setMarca] = useState("");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  /** La planometría que el proveedor mandó: cómo debe quedar armada la
   *  exhibición. Se sube DESPUÉS de crear el contrato, porque cuelga de él. */
  const [planometria, setPlanometria] = useState<File | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");

  const monto = Number(valor.replace(/[^\d]/g, "")) || 0;

  const escribirValor = useCallback((txt: string) => {
    const soloDigitos = txt.replace(/[^\d]/g, "");
    setValor(soloDigitos ? Number(soloDigitos).toLocaleString("es-CO") : "");
  }, []);

  const desvio = ref !== null && monto > 0 ? Math.round((1 - monto / ref) * 100) : null;

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

  /** El semáforo responde por LAS FECHAS QUE ESTÁN ESCRITAS, no por el periodo
   *  con el que abrió. Si alguien corre el "hasta" hasta pisar un contrato que
   *  ya existe, el aviso aparece ahí mismo — y se va cuando lo corre de vuelta. */
  const disponibilidad: RangeAvailability = useMemo(() => {
    const f = fechasEnOrden ? parseISODate(desde) : null;
    const t = fechasEnOrden ? parseISODate(hasta) : null;
    return f && t
      ? rangeAvailability(datos, f, t)
      : rangeAvailability(datos, inicial.from, inicial.to);
    // `datos` se recalcula en cada render; lo que importa de él son los campos
    // del contrato ya guardado, y esos vienen del fixture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, face, desde, hasta, fechasEnOrden, inicial]);

  const puedeGuardar = proveedor.trim().length > 0 && fechasEnOrden && monto > 0;

  /** Qué falta para poder guardar, dicho antes de que alguien busque el botón. */
  const falta = !proveedor.trim()
    ? "Falta el proveedor"
    : monto <= 0
    ? "Falta el valor mensual"
    : !fechasEnOrden
    ? "Revisá las fechas"
    : null;

  async function guardar() {
    if (!puedeGuardar || estado === "guardando") return;
    setEstado("guardando");
    setError("");
    try {
      const espacio = await findOrCreateSpace({
        code: codigo,
        name: fixture.label || fixture.code,
        zone: fixture.type,
        sede: (fixture.sede as string) || sede,
        area_m2: parseFloat((fixture.w * fixture.d).toFixed(2)),
      });
      const prov = await findOrCreateSupplier(proveedor.trim(), correo.trim() || undefined);
      const lease = await createLease(espacio.id, {
        supplier_id: prov.id,
        marca: marca.trim() || undefined,
        start_date: desde,
        end_date: hasta,
        monthly_rent: monto,
        notes: nota.trim() || undefined,
      });

      // La planometría va aparte y DESPUÉS: cuelga del contrato, que hasta esta
      // línea no existía. Si falla no se tira abajo el contrato —ya está
      // guardado y los correos ya salieron—; se avisa y se puede volver a
      // cargar desde el detalle del espacio.
      let avisoPlanometria: string | undefined;
      if (planometria) {
        try {
          await subirPlanometria((lease as { id: number }).id, planometria);
        } catch (e) {
          avisoPlanometria = describeError(
            e,
            "La planometría no se pudo subir. El contrato quedó guardado; cargala desde el detalle del espacio.",
          );
        }
      }

      onGuardado(
        {
          status: "occupied",
          supplierName: proveedor.trim(),
          brandCategory: marca.trim(),
          negotiatedValue: monto,
          startDate: desde,
          endDate: hasta,
          observation: nota.trim(),
        } as Partial<FaceData>,
        {
          corto: nombreDeMueble({ code: corto, nomenclatura: fixture.nomenclatura }),
          codigo,
          proveedor: proveedor.trim(),
          desde,
          hasta,
          avisoPlanometria,
          avisos: lease.avisos ?? undefined,
        },
      );
    } catch (e) {
      setError(describeError(e, "No se pudo guardar el contrato."));
      setEstado("error");
    }
  }

  /** Lo que se firma, no lo que se cobra por mes.
   *
   *  El formulario pide el valor MENSUAL —así se negocia— pero lo que queda
   *  escrito en el contrato es el total del plazo, y son dos números
   *  distintos: $1.500.000 al mes por 61 días son $3.050.000. Sin este
   *  renglón había que hacer la cuenta de cabeza con el proveedor esperando,
   *  que es exactamente cuando se equivoca. Prorratea por día sobre 30, igual
   *  que todo el resto del sistema. */
  const total = monto > 0 && fechasEnOrden ? Math.round((monto / 30) * dias) : 0;

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

  return {
    // La sede efectiva: los muebles dibujados antes de que existiera esa
    // columna no la traen, y ahí manda la sede activa.
    sede: fixture.sede || sede,
    fixture, face, corto, codigo, doble, ubicacion, ref, disponibilidad,
    total, cubre,
    desde, setDesde, hasta, setHasta,
    proveedor, setProveedor, correo, setCorreo, marca, setMarca,
    valor, escribirValor, monto, nota, setNota,
    planometria, setPlanometria,
    desvio, dias, fechasEnOrden, puedeGuardar, falta,
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

/** El encabezado de la ficha: de qué contrato se trata y sobre qué espacio.
 *
 *  El espacio va adentro de un recuadro propio y no suelto entre los campos.
 *  Es el único dato del formulario que NO se teclea —viene de haber tocado el
 *  plano— y encuadrarlo lo dice sin una sola palabra: esto ya está decidido,
 *  lo de abajo es lo que falta. Adentro del recuadro, el código en grande a la
 *  izquierda y la tarifa a la derecha, que son las dos puntas de la
 *  conversación: qué le doy y cuánto vale. */
export function CabezaContrato({
  c, onFace,
}: {
  c: Contrato;
  onFace: (f: "A" | "B") => void;
}) {
  const pinta = DISPONIBILIDAD[c.disponibilidad];
  const pedirEnfoque3D = useFixtureStore((s) => s.pedirEnfoque3D);
  return (
    <div style={{ padding: "11px 15px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 9 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.005em", margin: 0 }}>
          Contrato
        </h2>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>sin firmar</span>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 9,
          border: "1px solid var(--ink-1)", borderRadius: "var(--r-xs)",
          boxShadow: "0 0 0 2px rgba(20,24,28,.08)",
          padding: "7px 9px", background: "#FCFDFD",
        }}
      >
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 17,
          letterSpacing: "0.01em", lineHeight: 1, flexShrink: 0,
        }}>
          {nombreDeMueble({ code: c.corto, nomenclatura: c.fixture.nomenclatura })}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {c.fixture.label || c.fixture.code}
          {c.ubicacion && <><br />{c.ubicacion}</>}
        </span>
        {c.ref !== null && (
          <span
            title="Tarifa de referencia del tipo de mueble, al mes"
            style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {money(c.ref)}
          </span>
        )}
      </div>

      {/* Cómo está ese espacio en el periodo elegido. Va debajo del recuadro y
          no adentro: el recuadro dice QUÉ se está vendiendo, esto dice si se
          puede. Cuando está libre —que es el caso normal— no se dibuja: una
          pastilla verde que dice «todo en orden» en cada contrato es ruido. */}
      {c.disponibilidad !== "libre" && (
        <div
          style={{
            marginTop: 7, display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: pinta.color,
            background: pinta.fondo, border: `1px solid ${pinta.borde}`,
            borderRadius: "var(--r-xs)", padding: "3px 8px",
          }}
        >
          {pinta.texto}
        </div>
      )}

      {/* Mostrarle al proveedor cómo se ve su exhibición mientras se negocia.
          El 3D es la única pantalla que pone el arte sobre el mueble, y sin
          esto había que entrar a mano y buscarlo entre 104 muebles. */}
      <button
        onClick={() => pedirEnfoque3D(c.fixture.id, c.face)}
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

      {/* Una góndola doble son DOS espacios que se venden por separado. Sin
          este selector la cara B era invendible desde el mapa. */}
      {c.doble && (
        <div style={{ display: "flex", gap: 5, marginTop: 9 }}>
          {(["A", "B"] as const).map((id) => {
            const activa = c.face === id;
            return (
              <button
                key={id}
                onClick={() => onFace(id)}
                style={{
                  flex: 1, height: 27, borderRadius: "var(--r-xs)", cursor: "pointer",
                  border: `1px solid ${activa ? "var(--ink-1)" : "var(--line)"}`,
                  background: activa ? "var(--accent-50)" : "var(--surface)",
                  color: activa ? "var(--ink-1)" : "var(--ink-2)",
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cara {id}
              </button>
            );
          })}
        </div>
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
      {/* La advertencia de disponibilidad se dice UNA vez, en el encabezado,
          al lado del espacio del que habla. Acá estaba repetida en un recuadro
          de tres renglones que empujaba los campos hacia abajo. */}
      {c.disponibilidad !== "libre" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1, color: "var(--warning)" }} />
          <span>
            {c.disponibilidad === "parcial"
              ? "Parte del periodo ya está vendida: revisá las fechas antes de guardar."
              : "Está vendido en el periodo elegido. Si vas a renovar, ajustá las fechas."}
          </span>
        </div>
      )}

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

      <div>
        <Etiqueta>Valor mensual</Etiqueta>
        <input
          value={c.valor}
          onChange={(e) => c.escribirValor(e.target.value)}
          placeholder="1.800.000"
          style={{
            ...campo, height: 42, fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 600,
            borderColor: c.monto > 0 ? "var(--accent)" : "var(--line-strong)",
          }}
          inputMode="numeric"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, minHeight: 20 }}>
          {c.ref === null ? (
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              Sin tarifa de referencia para este tipo de mueble.
            </span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Referencia {money(c.ref)}</span>
              {c.desvio !== null && (
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                    background: c.desvio >= 1 ? "var(--warning-50)" : "var(--success-50)",
                    color: c.desvio >= 1 ? "var(--warning)" : "var(--success)",
                  }}
                >
                  {c.desvio >= 1
                    ? `${c.desvio}% por debajo`
                    : c.desvio <= -1
                    ? `${Math.abs(c.desvio)}% por encima`
                    : "en línea"}
                </span>
              )}
            </>
          )}
        </div>
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
