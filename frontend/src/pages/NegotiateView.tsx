import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MapPin, Search, X } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import SeasonPicker, { describeRange, type DateRange } from "../components/SeasonPicker/SeasonPicker";
import MiniMapa from "../components/MiniMapa/MiniMapa";
import { findOrCreateSpace, createLease } from "../api/spaces";
import { findOrCreateSupplier } from "../api/suppliers";
import { describeError } from "../api/client";
import {
  contractPhase, fullSpaceCode, isDoubleGondola, isRentable,
  rangeAvailability, rateTypeOf, referenceRateFor,
  type FaceData, type UnifiedFixture,
} from "../types/fixtures";
import { inclusiveDays } from "../types/seasons";

/**
 * Negociar un espacio, de punta a punta.
 *
 * Antes esto estaba repartido: la disponibilidad se miraba en el Dashboard y
 * el contrato se llenaba en un panel angosto adentro del editor del plano. Para
 * vender había que saltar entre pestañas y, peor, saber dónde estaba cada
 * mueble dibujado. Acá va todo seguido: para cuándo, cuál espacio, y el
 * contrato — que es el orden en que ocurre una negociación de verdad.
 */

const HOY = new Date();

/** Ancho del plano en la columna izquierda. El alto lo decide la forma de la
 *  tienda; ver MiniMapa. */
const ANCHO_PLANO = 520;

function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Rango por defecto: de hoy a un mes. Arranca con algo puesto a propósito —
 *  una pantalla en blanco no dice qué hacer primero. */
function rangoInicial(): DateRange {
  const to = new Date(HOY);
  to.setDate(to.getDate() + 30);
  return { from: new Date(HOY), to };
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Cómo se pinta el plano en esta pantalla. Un espacio no se puede negociar sin
 *  verlo: la lista de códigos no dice si la punta está en la entrada o contra
 *  la pared del fondo, y esa es media negociación. */
const PINTA = {
  libre: "#4CC38A",
  parcial: "#F0B429",
  tomado: "#CBD5E1",
};

interface Cara {
  fixture: UnifiedFixture;
  face: "A" | "B";
  /** `SEDE-CODIGO`, el que se guarda y viaja en los correos. */
  codigo: string;
  /** La nomenclatura corta, que es como la gente lo llama. */
  corto: string;
  data: FaceData;
}

function carasDe(f: UnifiedFixture): Cara[] {
  const a: Cara = {
    fixture: f, face: "A", codigo: "", corto: f.code,
    data: {
      status: f.status, supplierName: f.supplierName, brandCategory: f.brandCategory,
      negotiatedValue: f.negotiatedValue, startDate: f.startDate, endDate: f.endDate,
      observation: f.observation,
    } as FaceData,
  };
  if (!isDoubleGondola(f)) return [a];
  const b = (f.faceB ?? {}) as FaceData;
  return [a, { fixture: f, face: "B", codigo: "", corto: `${f.code}-B`, data: b }];
}

export default function NegotiateView({ onIrAlPlano }: { onIrAlPlano?: () => void }) {
  const fixtures = useFixtureStore(selectFixtures);
  const sede = useFixtureStore((s) => s.sede);
  const sedes = useFixtureStore((s) => s.sedes);
  const setSede = useFixtureStore((s) => s.setSede);
  const commit = useFixtureStore((s) => s.commit);
  const referenceRates = useFixtureStore((s) => s.referenceRates);

  const [rango, setRango] = useState<DateRange | null>(rangoInicial);
  const [busqueda, setBusqueda] = useState("");
  const [incluirParciales, setIncluirParciales] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  /** Lo que se acaba de cerrar. Vive acá y no adentro del formulario porque al
   *  guardar el espacio sale de la lista de disponibles, y eso desmontaba el
   *  mensaje justo cuando había que leerlo. */
  const [cerrado, setCerrado] = useState<
    { corto: string; proveedor: string; desde: string; hasta: string } | null
  >(null);

  // Cambiar de sede invalida lo elegido: ese espacio es de la otra tienda.
  useEffect(() => {
    setElegido(null);
    setCerrado(null);
  }, [sede]);

  // ── Paso 2: qué se puede vender para ese periodo ──────────────────────────
  const candidatos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const out: (Cara & { disponibilidad: "libre" | "parcial" | "tomado"; ref: number | null })[] = [];
    for (const f of fixtures) {
      if (!isRentable(f)) continue;
      for (const cara of carasDe(f)) {
        const codigo = fullSpaceCode((f.sede as string) || sede, cara.corto);
        const cara2 = { ...cara, codigo };
        const disponibilidad = rango
          ? rangeAvailability(cara2.data, rango.from, rango.to)
          : contractPhase(cara2.data) === "vigente" ? "tomado" : "libre";
        if (disponibilidad === "tomado") continue;
        if (disponibilidad === "parcial" && !incluirParciales) continue;
        if (q) {
          const texto = `${codigo} ${cara.corto} ${f.label ?? ""} ${f.nomenclatura ?? ""}`.toLowerCase();
          if (!texto.includes(q)) continue;
        }
        out.push({
          ...cara2,
          disponibilidad,
          ref: referenceRateFor(referenceRates, (f.sede as string) || sede, rateTypeOf(f)),
        });
      }
    }
    // Lo enteramente libre primero; dentro de eso, por código.
    out.sort((a, b) =>
      Number(a.disponibilidad === "parcial") - Number(b.disponibilidad === "parcial") ||
      a.corto.localeCompare(b.corto, "es", { numeric: true }));
    return out;
  }, [fixtures, sede, rango, busqueda, incluirParciales, referenceRates]);

  const seleccion = candidatos.find((c) => c.codigo === elegido) ?? null;

  /** El color de cada mueble en el plano: verde lo que se puede vender para el
   *  periodo elegido, ámbar lo que está libre solo una parte, gris lo demás.
   *  Solo lo elegible recibe color, y el mapa hace clicable exactamente eso. */
  const pintarMueble = useCallback(
    (f: UnifiedFixture): string | null => {
      if (!isRentable(f)) return null;
      const propio = candidatos.filter((c) => c.fixture.id === f.id);
      if (propio.length === 0) return PINTA.tomado;
      return propio.some((c) => c.disponibilidad === "libre") ? PINTA.libre : PINTA.parcial;
    },
    [candidatos],
  );
  const totalLibres = candidatos.filter((c) => c.disponibilidad === "libre").length;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", padding: 20 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: "0 0 2px", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Negociar un espacio
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
              Elegí el periodo, después el espacio en el plano, y llená el contrato acá mismo.
            </p>
          </div>
          {/* La sede se elegía en otra pantalla: para negociar en POBLADO había
              que ir al tablero, cambiarla y volver. */}
          <label
            style={{
              display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
              padding: "7px 11px", borderRadius: "var(--r-md)",
              background: "var(--surface)", border: "1px solid var(--line)",
            }}
          >
            <MapPin size={13} style={{ color: "var(--accent)" }} />
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              style={{
                border: "none", background: "transparent", color: "var(--ink-1)",
                fontSize: 13.5, fontWeight: 600, fontFamily: "inherit",
                outline: "none", cursor: "pointer",
              }}
            >
              {sedes.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Paso 1 ───────────────────────────────────────────────────── */}
        <Paso n={1} titulo="¿Para cuándo?" />
        <div
          style={{
            padding: 14, borderRadius: "var(--r-lg)", background: "var(--surface)",
            border: "1px solid var(--line)", marginBottom: 18,
          }}
        >
          <SeasonPicker range={rango} onChange={setRango} />
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-2)" }}>
            {rango ? (
              <>
                <b>{describeRange(rango)}</b> · {inclusiveDays(rango.from, rango.to)} días ·{" "}
                <b style={{ color: "var(--success)" }}>{totalLibres}</b> espacio
                {totalLibres === 1 ? "" : "s"} libre{totalLibres === 1 ? "" : "s"} todo el periodo
              </>
            ) : (
              "Sin periodo elegido: se listan los espacios libres hoy."
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ── Paso 2 ─────────────────────────────────────────────────── */}
          <div style={{ flex: "1.25 1 460px", minWidth: 420 }}>
            <Paso n={2} titulo="¿Cuál espacio?" />
            <div
              style={{
                borderRadius: "var(--r-lg)", background: "var(--surface)",
                border: "1px solid var(--line)", overflow: "hidden",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  padding: "9px 12px", borderBottom: "1px solid var(--line-soft)",
                  fontSize: 11.5, color: "var(--ink-3)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>
                  Tocá el espacio en el plano
                </span>
                <Punto color={PINTA.libre} texto="Libre" />
                <Punto color={PINTA.parcial} texto="Parcial" />
                <Punto color={PINTA.tomado} texto="Tomado" />
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                {fixtures.length === 0 ? (
                  <div style={{ padding: "24px 6px", fontSize: 12.5, color: "var(--ink-3)", textAlign: "center" }}>
                    Esta sede todavía no tiene plano.
                  </div>
                ) : (
                  <MiniMapa
                    fixtures={fixtures}
                    targetCode={seleccion?.corto ?? ""}
                    ancho={ANCHO_PLANO}
                    altoMax={330}
                    colorDe={pintarMueble}
                    onElegir={(corto) => {
                      const c = candidatos.find((x) => x.corto === corto);
                      if (c) { setElegido(c.codigo); setCerrado(null); }
                    }}
                  />
                )}
              </div>
            </div>
            <div
              style={{
                borderRadius: "var(--r-lg)", background: "var(--surface)",
                border: "1px solid var(--line)", overflow: "hidden",
              }}
            >
              <div style={{ padding: 10, borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ position: "relative" }}>
                  <Search
                    size={13}
                    style={{ position: "absolute", left: 9, top: 9, color: "var(--ink-4)" }}
                  />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por código o tipo…"
                    style={{
                      width: "100%", padding: "7px 9px 7px 26px", fontSize: 13,
                      borderRadius: "var(--r-md)", border: "1px solid var(--line)",
                      background: "var(--surface-2)", color: "var(--ink-1)",
                      fontFamily: "inherit", outline: "none",
                    }}
                  />
                </div>
                <label
                  style={{
                    display: "flex", alignItems: "center", gap: 6, marginTop: 8,
                    fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={incluirParciales}
                    onChange={(e) => setIncluirParciales(e.target.checked)}
                  />
                  Mostrar también los que están libres solo una parte del periodo
                </label>
              </div>

              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {candidatos.length === 0 && (
                  <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--ink-3)" }}>
                    {fixtures.length === 0
                      ? "Esta sede todavía no tiene plano. Dibujalo desde la pestaña Plano."
                      : "No hay espacios disponibles para ese periodo."}
                  </div>
                )}
                {candidatos.map((c) => {
                  const activo = c.codigo === elegido;
                  return (
                    <button
                      key={c.codigo}
                      onClick={() => setElegido(c.codigo)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "10px 12px", background: activo ? "var(--accent-50)" : "transparent",
                        border: "none", borderLeft: `3px solid ${activo ? "var(--accent)" : "transparent"}`,
                        borderBottom: "1px solid var(--line-soft)",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                            color: activo ? "var(--accent-700)" : "var(--ink-1)",
                          }}
                        >
                          {c.fixture.nomenclatura || c.corto}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                          {c.fixture.label || c.fixture.code}
                        </span>
                        {c.disponibilidad === "parcial" && (
                          <span
                            style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                              background: "var(--warning-50)", color: "var(--warning)",
                            }}
                          >
                            parcial
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                        {c.ref !== null ? `Referencia ${money(c.ref)} / mes` : "Sin tarifa de referencia"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Paso 3 ─────────────────────────────────────────────────── */}
          <div style={{ flex: "1 1 420px", minWidth: 360 }}>
            <Paso n={3} titulo="El contrato" />
            {cerrado ? (
              <Cerrado datos={cerrado} onSeguir={() => setCerrado(null)} />
            ) : seleccion ? (
              <FormularioContrato
                key={seleccion.codigo}
                cara={seleccion}
                sede={sede}
                rango={rango}
                vecinos={fixtures}
                onCerrar={() => setElegido(null)}
                onGuardado={(patch, resumen) => {
                  // El JSON del layout es lo que pinta el mapa y responde la
                  // disponibilidad; sin esto el contrato existiría en la base y
                  // el espacio seguiría viéndose libre.
                  const siguiente = fixtures.map((f) => {
                    if (f.id !== seleccion.fixture.id) return f;
                    return seleccion.face === "B"
                      ? { ...f, faceB: { ...(f.faceB ?? {}), ...patch } as FaceData }
                      : { ...f, ...patch };
                  });
                  commit(siguiente);
                  setElegido(null);
                  setCerrado(resumen);
                }}
              />
            ) : (
              <div
                style={{
                  padding: "34px 18px", borderRadius: "var(--r-lg)",
                  background: "var(--surface-2)", border: "1px dashed var(--line-strong)",
                  fontSize: 13, color: "var(--ink-3)", textAlign: "center",
                }}
              >
                Elegí un espacio de la lista para llenar el contrato.
                {onIrAlPlano && (
                  <>
                    <br />
                    <button
                      onClick={onIrAlPlano}
                      style={{
                        marginTop: 10, background: "none", border: "none", padding: 0,
                        color: "var(--accent-700)", fontSize: 12.5, fontWeight: 600,
                        cursor: "pointer", textDecoration: "underline", fontFamily: "inherit",
                      }}
                    >
                      ¿Falta un espacio? Dibujalo en el plano
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Paso({ n, titulo }: { n: number; titulo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span
        style={{
          width: 19, height: 19, borderRadius: 999, background: "var(--accent)",
          color: "#fff", fontSize: 11, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-1)" }}>{titulo}</span>
    </div>
  );
}

// ─── Paso 3: el contrato ─────────────────────────────────────────────────────

const campo: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  borderRadius: "var(--r-md)", border: "1px solid var(--line)",
  background: "var(--surface-2)", color: "var(--ink-1)",
  fontFamily: "inherit", outline: "none",
};

function Etiqueta({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
      {children}
      {hint && <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {hint}</span>}
    </div>
  );
}

function FormularioContrato({
  cara, sede, rango, vecinos, onGuardado, onCerrar,
}: {
  cara: Cara & { disponibilidad: "libre" | "parcial" | "tomado"; ref: number | null };
  sede: string;
  rango: DateRange | null;
  /** Los muebles de la sede, para el plano chico del encabezado. */
  vecinos: UnifiedFixture[];
  /** El contrato quedó guardado: acá se escribe en el JSON del layout y se
   *  muestra la confirmación, que vive en la pantalla y no en este formulario. */
  onGuardado: (
    patch: Partial<FaceData>,
    resumen: { corto: string; proveedor: string; desde: string; hasta: string },
  ) => void;
  onCerrar: () => void;
}) {
  // Las fechas arrancan con el periodo que ya se eligió arriba: reescribirlas a
  // mano era el paso que más se equivocaba, y es información que la pantalla ya
  // tiene.
  const [desde, setDesde] = useState(rango ? iso(rango.from) : "");
  const [hasta, setHasta] = useState(rango ? iso(rango.to) : "");
  const [proveedor, setProveedor] = useState("");
  const [correoProveedor, setCorreoProveedor] = useState("");
  const [marca, setMarca] = useState("");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const monto = Number(valor.replace(/[^\d]/g, "")) || 0;

  function escribirValor(txt: string) {
    const soloDigitos = txt.replace(/[^\d]/g, "");
    setValor(soloDigitos ? Number(soloDigitos).toLocaleString("es-CO") : "");
  }
  const desvio =
    cara.ref !== null && monto > 0 ? Math.round((1 - monto / cara.ref) * 100) : null;

  const fechasEnOrden = desde.length > 0 && hasta.length > 0 && desde <= hasta;
  const dias =
    fechasEnOrden
      ? Math.round(
          (Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10)) -
            Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))) /
            -86_400_000,
        ) + 1
      : 0;
  const puedeGuardar = proveedor.trim().length > 0 && fechasEnOrden && monto > 0;

  async function guardar() {
    if (!puedeGuardar || estado === "guardando") return;
    setEstado("guardando");
    setError("");
    try {
      const espacio = await findOrCreateSpace({
        code: cara.codigo,
        name: cara.fixture.label || cara.fixture.code,
        zone: cara.fixture.type,
        sede: (cara.fixture.sede as string) || sede,
        area_m2: parseFloat((cara.fixture.w * cara.fixture.d).toFixed(2)),
      });
      const prov = await findOrCreateSupplier(
        proveedor.trim(),
        correoProveedor.trim() || undefined,
      );
      await createLease(espacio.id, {
        supplier_id: prov.id,
        marca: marca.trim() || undefined,
        start_date: desde,
        end_date: hasta,
        monthly_rent: monto,
        notes: nota.trim() || undefined,
      });
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
          corto: cara.fixture.nomenclatura || cara.corto,
          proveedor: proveedor.trim(),
          desde,
          hasta,
        },
      );
    } catch (e) {
      setError(describeError(e, "No se pudo guardar el contrato."));
      setEstado("error");
    }
  }

  return (
    <div
      style={{
        padding: 18, borderRadius: "var(--r-lg)",
        background: "var(--surface)", border: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {cara.fixture.nomenclatura || cara.corto} · {cara.fixture.label || cara.fixture.code}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            {cara.codigo}
            {cara.face === "B" && " · Cara B"}
          </div>
        </div>
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{ background: "none", border: "none", color: "var(--ink-3)", cursor: "pointer", padding: 2 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Dónde queda, sin salir del contrato. Mientras se negocia un valor hay
          que poder decir "es la punta de la entrada, no la del fondo" sin
          cambiar de pantalla. */}
      {vecinos.length > 0 && (
        <div
          style={{
            marginBottom: 14, padding: 8, borderRadius: "var(--r-md)",
            background: "var(--surface-2)", border: "1px solid var(--line-soft)",
          }}
        >
          <MiniMapa fixtures={vecinos} targetCode={cara.corto} ancho={360} altoMax={150} />
        </div>
      )}

      {cara.disponibilidad === "parcial" && (
        <div
          style={{
            padding: "9px 11px", borderRadius: "var(--r-md)", marginBottom: 14,
            background: "var(--warning-50)", color: "var(--warning)", fontSize: 12.5,
          }}
        >
          Este espacio ya tiene parte del periodo vendida. Revisá las fechas antes de guardar.
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <Etiqueta>Proveedor</Etiqueta>
          <input
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Alpina, Nutresa, Postobón…"
            style={campo}
            autoFocus
          />
        </div>

        <div>
          <Etiqueta hint="para mandarle la constancia">Correo del proveedor</Etiqueta>
          <input
            value={correoProveedor}
            onChange={(e) => setCorreoProveedor(e.target.value)}
            placeholder="opcional"
            style={campo}
            inputMode="email"
          />
        </div>

        <div>
          <Etiqueta hint="opcional">Marca o categoría</Etiqueta>
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            placeholder="Lácteos, Chocolates Jet…"
            style={campo}
          />
        </div>

        <div>
          <Etiqueta>Valor mensual</Etiqueta>
          <input
            value={valor}
            onChange={(e) => escribirValor(e.target.value)}
            placeholder="1.800.000"
            style={{ ...campo, fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600 }}
            inputMode="numeric"
          />
          <div style={{ marginTop: 6, fontSize: 12.5, minHeight: 18 }}>
            {cara.ref === null ? (
              <span style={{ color: "var(--ink-3)" }}>
                Sin tarifa de referencia para este tipo de mueble.
              </span>
            ) : desvio === null ? (
              <span style={{ color: "var(--ink-3)" }}>Referencia {money(cara.ref)} / mes</span>
            ) : (
              <span style={{ color: desvio >= 1 ? "var(--warning)" : "var(--success)" }}>
                Referencia {money(cara.ref)} ·{" "}
                {desvio >= 1
                  ? `${desvio}% por debajo`
                  : desvio <= -1
                  ? `${Math.abs(desvio)}% por encima`
                  : "en línea"}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Etiqueta>Desde</Etiqueta>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={campo} />
          </div>
          <div style={{ flex: 1 }}>
            <Etiqueta>Hasta</Etiqueta>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={campo} />
          </div>
        </div>
        <div style={{ marginTop: -8, fontSize: 12.5, color: fechasEnOrden ? "var(--ink-3)" : "var(--danger)" }}>
          {desde && hasta && !fechasEnOrden
            ? "La fecha de fin es anterior a la de inicio."
            : fechasEnOrden
            ? `${dias} día${dias === 1 ? "" : "s"}, contando los dos extremos.`
            : "Las fechas vienen del periodo elegido arriba; podés ajustarlas."}
        </div>

        <div>
          <Etiqueta hint="opcional">Nota</Etiqueta>
          <textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Algo que haya que saber de este acuerdo"
            style={{ ...campo, resize: "none" }}
          />
        </div>

        {error && <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>}

        <button
          onClick={guardar}
          disabled={!puedeGuardar || estado === "guardando"}
          style={{
            width: "100%", minHeight: 46, borderRadius: "var(--r-lg)", border: "none",
            background: puedeGuardar ? "var(--accent)" : "var(--surface-3)",
            color: puedeGuardar ? "#fff" : "var(--ink-4)",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            cursor: puedeGuardar ? "pointer" : "default",
          }}
        >
          {estado === "guardando" ? "Guardando…" : "Guardar contrato y avisar"}
        </button>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "center", marginTop: -6 }}>
          Al guardar salen los tres avisos y el espacio queda pendiente de montaje.
        </div>
      </div>
    </div>
  );
}


/** Lo que se acaba de cerrar. Se queda hasta que la persona lo cierre: al
 *  guardar un contrato lo que hay que ver es a quién le llegó el aviso, y ese
 *  mensaje se iba solo antes de que nadie alcanzara a leerlo. */
function Cerrado({
  datos, onSeguir,
}: {
  datos: { corto: string; proveedor: string; desde: string; hasta: string };
  onSeguir: () => void;
}) {
  return (
    <div
      style={{
        padding: 20, borderRadius: "var(--r-lg)",
        background: "var(--success-50)", border: "1px solid var(--success-100)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Check size={17} style={{ color: "var(--success)" }} />
        <b style={{ fontSize: 15 }}>Contrato guardado</b>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
        <b>{datos.corto}</b> queda contratado para <b>{datos.proveedor}</b>, del{" "}
        {datos.desde} al {datos.hasta}.
        <br />
        <br />
        Ya salieron los avisos: el resumen con el valor al comercial, la orden de
        montaje <b>sin valores</b> al mercaderista —con el plano del espacio
        señalado— y la constancia al proveedor si tiene correo cargado.
      </div>
      <button
        onClick={onSeguir}
        style={{
          marginTop: 14, padding: "9px 16px", borderRadius: "var(--r-md)",
          border: "1px solid var(--success)", background: "transparent",
          color: "var(--success)", fontSize: 13.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Negociar otro espacio
      </button>
    </div>
  );
}


/** Un punto de color con su etiqueta, para la leyenda del plano. */
function Punto({ color, texto }: { color: string; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
      {texto}
    </span>
  );
}
