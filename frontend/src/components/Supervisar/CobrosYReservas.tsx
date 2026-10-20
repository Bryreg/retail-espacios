import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { describeError } from "../../api/client";
import { cargarCorte, cobrosPorVentas, cortesPendientes, type CobroPorVentas, type CortePendiente } from "../../api/cobros";
import { cancelarReserva, confirmarReserva, reservasDeEspacio, type ReservaDeEspacio } from "../../api/reservas";
import { money } from "../Contrato/Contrato";
import { fechaEnCurso } from "../../utils/propuesta";
import { toISODate } from "../../types/seasons";
import { isDoubleGondola } from "../../types/espacio";
import { codigoVisibleDe, partirCodigo } from "../../utils/partes";
import { useFixtureStore } from "../../store/fixtureStore";
import { EncabezadoDeSeccion } from "./piezas";

/**
 * Dos bloques de «Para revisar» que nacieron con el rediseño de Vender (PR 1,
 * `docs/rediseno/vender-api.md` §3 y §8):
 *
 *  · **Ventas por cargar**: un contrato que se cobra por un % de las ventas no
 *    tiene canon fijo; cada período que termina hay que escribir lo vendido, y
 *    el servidor dice lo que se cobra («→ $ 360.000»).
 *  · **Reservas**: una cara entera o una parte reservada desde Vender
 *    («Reservar hasta…») cuenta como ocupada hasta que caduca. Acá se confirma
 *    —con el precio que se guardó al reservar— o se cancela.
 *
 * SÓLO ADMINISTRACIÓN y SÓLO SUPERVISAR: llevan proveedores y plata. Quien los
 * monta los pone adentro de `isAdmin &&`, los hooks no piden nada si no están
 * `activo`, y ningún archivo de Vender llega a este módulo ni a `api/cobros` o
 * `api/reservas` (`probar-vender` lo asevera). Si el servidor todavía no tiene
 * las rutas, no se muestra nada: es un extra de la lista, no algo de lo que
 * dependa la pantalla.
 *
 * Nada de montos abreviados: toda plata se escribe entera (`money`).
 */

const HOY = () => toISODate(new Date());

/** `CENTRO-PUN-02-EN1` en la sede CENTRO → `PUN-02-EN1`. */
function codigoEnLaSede(espacio: string, sede: string): string {
  const pre = `${(sede || "").toUpperCase()}-`;
  return espacio.toUpperCase().startsWith(pre) ? espacio.slice(pre.length) : espacio;
}

/** Cómo se LEE el código en pantalla, como en la tabla y la ficha
 *  (`codigoVisibleDe`): `GON-04·B`, `GON-04·A`, `NEV-03·PU2`. La cara A de una
 *  góndola doble lleva su letra si el mueble del plano la tiene. */
export function useCodigoVisible(sede: string): (espacio: string) => string {
  const muebles = useFixtureStore((s) => s.fixturesBySede[sede]);
  return useCallback((espacio: string) => {
    const p = partirCodigo(codigoEnLaSede(espacio, sede));
    const f = (muebles ?? []).find((x) => (x.code || "").toUpperCase() === p.base);
    const doble = f ? isDoubleGondola(f) : p.cara === "B";
    return codigoVisibleDe(p.base, p.cara, doble, p.parte);
  }, [muebles, sede]);
}

/** Lo que se va a cobrar por lo vendido: ventas × %, redondeado al peso como
 *  el servidor (`monto_de`, el `round` de Python: la mitad va al par). Es la
 *  vista previa mientras se escribe; lo que vale es lo que contesta el
 *  servidor al guardar. */
export function montoDeVentas(ventas: number, porcentaje: number): number {
  const x = (ventas * porcentaje) / 100;
  const piso = Math.floor(x);
  const resto = x - piso;
  if (Math.abs(resto - 0.5) < 1e-9) return piso % 2 === 0 ? piso : piso + 1;
  return resto > 0.5 ? piso + 1 : piso;
}

/** «1 oct – 31 oct»; el año sólo si no es el de hoy. */
function periodo(desde: string, hasta: string): string {
  return `${fechaEnCurso(desde)} – ${fechaEnCurso(hasta)}`;
}

/** «8 %» con la coma de acá («7,5 %»). */
function porcentaje(n: number): string {
  return `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
}

const fila: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6, padding: "8px 6px",
  borderTop: "1px solid var(--line-soft)",
};
const renglon: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 9, minWidth: 0,
  fontSize: "var(--t-2xs)", color: "var(--ink-2)",
};
const codigo: React.CSSProperties = {
  flexShrink: 0, minWidth: "9ch", fontFamily: "var(--font-mono)", fontWeight: 700,
  fontSize: "var(--t-sm)", color: "var(--ink-1)",
};
const quien: React.CSSProperties = {
  flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const cifra: React.CSSProperties = {
  flexShrink: 0, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
  color: "var(--ink-1)", whiteSpace: "nowrap",
};
/** Un botón de tinta con su ícono a la izquierda (hoja de piezas: «todos los
 *  botones con palabra llevan su ícono»). Supervisar no tiene amarillo. */
const boton: React.CSSProperties = {
  flexShrink: 0, height: 28, padding: "0 10px", borderRadius: "var(--r-md)",
  display: "inline-flex", alignItems: "center", gap: 6,
  border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink-1)",
  fontSize: "var(--t-2xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
};
const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

// ─── Ventas por cargar ───────────────────────────────────────────────────────

/** Un corte, por su contrato y su primer día: así se lo nombra en el servidor. */
const claveDeCorte = (c: Pick<CortePendiente, "lease_id" | "periodo_desde">) => `${c.lease_id}|${c.periodo_desde}`;

/**
 * Los cortes vencidos sin cargar de la sede, y cuántos contratos que corren
 * HOY se cobran por ventas (la nota del canon vigente: «+ 2 por % de venta»).
 * Lo que se carga en esta sesión se recuerda con su monto: la fila queda con
 * «→ $ 360.000» y deja de contar para «Para revisar».
 */
export function useCobrosPorVentas({ sede, activo }: { sede: string; activo: boolean }) {
  const [pendientes, setPendientes] = useState<CortePendiente[]>([]);
  const [vigentes, setVigentes] = useState(0);
  /** Los contratos por ventas de la sede, con sus cortes cargados (`cobrado`) y
   *  el próximo: con ellos el canon, «Quién paga» y la tabla dicen lo cargado
   *  y la ficha «8 % de las ventas · próximo corte 30 nov». */
  const [cobros, setCobros] = useState<CobroPorVentas[]>([]);
  const [cargados, setCargados] = useState<Record<string, number>>({});
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    setCargados({});
    if (!activo || !sede) { setPendientes([]); setVigentes(0); setCobros([]); return; }
    let vivo = true;
    cortesPendientes(sede)
      .then((r) => { if (vivo) setPendientes(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivo) setPendientes([]); });
    cobrosPorVentas(sede)
      .then((r) => {
        if (!vivo) return;
        const hoy = HOY();
        const todos = Array.isArray(r) ? r : [];
        setCobros(todos);
        setVigentes(todos.filter((c) => c.desde <= hoy && hoy <= c.hasta).length);
      })
      .catch(() => { if (vivo) { setVigentes(0); setCobros([]); } });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const marcarCargado = useCallback((c: CortePendiente, monto: number) => {
    setCargados((x) => ({ ...x, [claveDeCorte(c)]: monto }));
  }, []);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  const porCargar = useMemo(() => pendientes.filter((c) => !(claveDeCorte(c) in cargados)).length, [pendientes, cargados]);
  return { pendientes, cargados, marcarCargado, porCargar, vigentes, cobros, recargar };
}

/** «Ventas por cargar»: cada corte con su campo «vendido» y «Guardar». */
export function VentasPorCargar({ sede, pendientes, cargados, onCargado }: {
  sede: string;
  pendientes: readonly CortePendiente[];
  cargados: Readonly<Record<string, number>>;
  onCargado: (c: CortePendiente, monto: number) => void;
}) {
  if (pendientes.length === 0) return null;
  const faltan = pendientes.filter((c) => !(claveDeCorte(c) in cargados)).length;
  return (
    <div data-ventas-por-cargar>
      <EncabezadoDeSeccion titulo="Ventas por cargar" valor={faltan} />
      {pendientes.map((c) => (
        <CorteParaCargar
          key={claveDeCorte(c)}
          corte={c}
          sede={sede}
          monto={cargados[claveDeCorte(c)]}
          onCargado={(m) => onCargado(c, m)}
        />
      ))}
    </div>
  );
}

function CorteParaCargar({ corte, sede, monto, onCargado }: {
  corte: CortePendiente; sede: string; monto: number | undefined; onCargado: (monto: number) => void;
}) {
  /** Lo escrito, sólo las cifras: los pesos no llevan centavos. */
  const [cifras, setCifras] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuando = periodo(corte.periodo_desde, corte.periodo_hasta);
  const ventas = cifras === "" ? null : Number(cifras);
  const visible = useCodigoVisible(sede);
  const cod = visible(corte.espacio);

  async function guardar() {
    if (ventas === null || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await cargarCorte(corte.lease_id, {
        periodo_desde: corte.periodo_desde, periodo_hasta: corte.periodo_hasta, ventas,
      });
      onCargado(r.monto);
    } catch (e) {
      setError(describeError(e, "No se pudo guardar lo vendido: probá de nuevo en un momento."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={fila} className="fila-r destacada pv" data-corte={`${corte.lease_id}|${corte.periodo_desde}`}
      data-aviso={`corte:${claveDeCorte(corte)}`}>
      <div style={renglon}>
        <span style={codigo}>{cod}</span>
        <span style={quien}>{corte.proveedor ?? "—"}</span>
        <span style={cifra}>{porcentaje(corte.porcentaje)}</span>
        <span style={{ flexShrink: 0, whiteSpace: "nowrap", color: "var(--ink-3)" }}>{cuando}</span>
      </div>
      {monto !== undefined ? (
        <div style={{ ...renglon, justifyContent: "flex-end" }}>
          <span style={{ color: "var(--ink-3)" }}>vendido {ventas !== null ? money(ventas) : ""}</span>
          <b style={{ ...cifra, fontWeight: 700 }}>→ {money(monto)}</b>
        </div>
      ) : (
        <form
          style={{ ...renglon, justifyContent: "flex-end" }}
          onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        >
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px",
            border: "1px solid var(--brd-control)", borderRadius: "var(--r-md)", background: "var(--surface)",
            minWidth: 0, flex: "0 1 170px",
          }}>
            <span aria-hidden style={{ color: "var(--ink-3)" }}>$</span>
            <input
              inputMode="numeric"
              placeholder="vendido"
              aria-label={`Lo vendido en ${cod}, ${cuando}`}
              value={ventas === null ? "" : ventas.toLocaleString("es-CO")}
              onChange={(e) => setCifras(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15))}
              style={{
                minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent",
                color: "var(--ink-1)", fontFamily: "var(--font-mono)", fontSize: "var(--t-2xs)",
                fontVariantNumeric: "tabular-nums", textAlign: "right",
              }}
            />
          </label>
          {/* Lo que se cobra, mientras se escribe: «→ $ 360.000». */}
          <b style={{ ...cifra, fontWeight: 700, minWidth: "11ch", textAlign: "right" }} data-monto-previo>
            {ventas !== null ? `→ ${money(montoDeVentas(ventas, corte.porcentaje))}` : ""}
          </b>
          <button
            type="submit"
            disabled={ventas === null || guardando}
            style={{ ...boton, opacity: ventas === null || guardando ? 0.55 : 1, cursor: ventas === null ? "not-allowed" : "pointer" }}
          >
            <Check {...ICONO} /> {guardando ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--t-2xs)", color: "var(--ocupado-txt)", lineHeight: 1.4 }}>{error}</p>
      )}
    </div>
  );
}

// ─── Reservas de espacio ─────────────────────────────────────────────────────

/** Las reservas vivas de la sede (de la que caduca primero a la última). */
export function useReservasDeEspacio({ sede, activo }: { sede: string; activo: boolean }) {
  const [vivas, setVivas] = useState<ReservaDeEspacio[]>([]);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo || !sede) { setVivas([]); return; }
    let vivo = true;
    reservasDeEspacio(sede)
      .then((r) => { if (vivo) setVivas(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivo) setVivas([]); });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { vivas, recargar };
}

/** «Reservas»: cada una con Confirmar (con el precio que se guardó al
 *  reservar) y Cancelar (que pregunta antes: es un compromiso con alguien). */
export function ReservasSinConfirmar({ sede, vivas, onCambio, titulo = "Reservas" }: {
  sede: string;
  /** «Reservas que caducan hoy» (Hoy) o «Reservas por caducar» (30 días). */
  titulo?: string;
  vivas: readonly ReservaDeEspacio[];
  /** Una reserva se confirmó o se canceló: hay que volver a leer la lista y el mapa. */
  onCambio: () => void;
}) {
  if (vivas.length === 0) return null;
  return (
    <div data-reservas-de-espacio>
      <EncabezadoDeSeccion titulo={titulo} valor={vivas.length} />
      {vivas.map((r) => <FilaDeReserva key={r.id} r={r} sede={sede} onCambio={onCambio} />)}
    </div>
  );
}

/** Una reserva con Confirmar y Cancelar. También la usa la ficha del espacio
 *  («Reservado hasta …»), con el mismo camino. */
export function FilaDeReserva({ r, sede, onCambio }: { r: ReservaDeEspacio; sede: string; onCambio: () => void }) {
  const [enCurso, setEnCurso] = useState<"confirmar" | "cancelar" | null>(null);
  const [preguntando, setPreguntando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cod = useCodigoVisible(sede)(r.espacio);
  const hoy = HOY();
  const caduca = r.caduca <= hoy ? "caduca hoy" : `caduca el ${fechaEnCurso(r.caduca)}`;

  async function hacer(que: "confirmar" | "cancelar") {
    if (enCurso) return;
    setEnCurso(que);
    setError(null);
    try {
      if (que === "confirmar") await confirmarReserva(r.id);
      else await cancelarReserva(r.id);
      onCambio();
    } catch (e) {
      setError(describeError(e, que === "confirmar"
        ? "No se pudo confirmar la reserva: probá de nuevo en un momento."
        : "No se pudo cancelar la reserva: probá de nuevo en un momento."));
      setEnCurso(null);
    }
  }

  return (
    <div style={fila} className="fila-r" data-reserva={r.id} data-aviso={`res:${r.id}`}>
      <div style={renglon}>
        <span style={codigo}>{cod}</span>
        <span style={quien}>{r.proveedor ?? "—"}{r.marca ? ` · ${r.marca}` : ""}</span>
        {r.valor !== null && r.valor > 0 && <span style={cifra}>{money(r.valor)}</span>}
      </div>
      <div style={renglon}>
        <span style={{ flex: 1, minWidth: 0, color: "var(--ink-3)" }}>
          {periodo(r.desde, r.hasta)}
          {" · "}
          <span style={{ color: r.caduca_pronto ? "var(--ocupado-txt)" : "var(--ink-3)", fontWeight: r.caduca_pronto ? 600 : 400 }}>
            {caduca}
          </span>
        </span>
        {preguntando ? (
          <>
            <span style={{ flexShrink: 0, color: "var(--ink-1)" }}>¿Cancelarla?</span>
            <button type="button" style={boton} disabled={!!enCurso} onClick={() => void hacer("cancelar")}>
              <X {...ICONO} /> {enCurso === "cancelar" ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button type="button" style={{ ...boton, borderColor: "var(--line)" }} disabled={!!enCurso} onClick={() => setPreguntando(false)}>
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              style={boton}
              disabled={!!enCurso}
              title="Pasa a contrato con el precio que se guardó al reservar"
              onClick={() => void hacer("confirmar")}
            >
              <Check {...ICONO} /> {enCurso === "confirmar" ? "Confirmando…" : "Confirmar"}
            </button>
            <button
              type="button"
              style={{ ...boton, borderColor: "var(--line)", color: "var(--ink-2)" }}
              disabled={!!enCurso}
              onClick={() => setPreguntando(true)}
            >
              <X {...ICONO} /> Cancelar
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--t-2xs)", color: "var(--ocupado-txt)", lineHeight: 1.4 }}>{error}</p>
      )}
    </div>
  );
}
