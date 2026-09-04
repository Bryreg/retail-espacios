import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import {
  soyOperador, getClientesPlataforma, patchEstadoCliente, getMetricasPlataforma,
  ESTADOS_CUENTA,
  type ClientePlataforma, type EstadoCuenta, type MetricasPlataforma, type ClienteMetricas,
} from "../api/plataforma";
import {
  getSolicitudesSupresion, atenderSupresion, type SolicitudSupresion,
} from "../api/derechos";
import { describeError } from "../api/client";
import { useAuthStore } from "../store/authStore";

// ─── /plataforma — Fase 4: ruta propia del operador ─────────────────────────
//
// Página completa, FUERA del layout de cliente (sin Topbar de sede, sin
// Router-hermanos de Dashboard): monta directo adentro del `<BrowserRouter>`
// de App.tsx, con su propio encabezado mínimo. Reemplaza al modal
// `components/Plataforma/PlataformaPanel.tsx` (borrado en este mismo
// cambio): la tabla de clientes con estado + botón Cambiar (FilaEditor,
// motivo obligatorio, confirmación) y la sección de supresiones se mudan
// acá TAL CUAL se comportaban, y se les suma el panel de métricas del
// negocio (spec `features/plataforma/spec.md`).
//
// Guard de SPA: se pregunta `GET /api/plataforma/soy` al montar. Es
// cortesía nada más -- el 403 real lo tira el backend en cada endpoint, y
// si igual llega (carrera entre pestañas, revocación a mitad de sesión) se
// muestra tal cual llegue, no se inventa un mensaje.

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

const formatoCOP = (n: number | null): string => (n === null ? "—" : COP.format(n));
const formatoPct = (n: number | null): string => (n === null ? "—" : `${n.toFixed(1)}%`);

const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Fecha sola, sin hora -- la spec es explícita: "último acceso con cuenta"
 *  muestra la fecha, no la hora ni quién. */
const soloFecha = (iso: string | null): string => {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

const haceMin = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
};

// ─── Estilos compartidos (tokens del repo, nada nuevo) ──────────────────────

const inputStyle: React.CSSProperties = {
  height: 32, padding: "0 10px",
  borderRadius: "var(--r-md)", border: "1px solid var(--line)",
  background: "var(--surface)", color: "var(--ink-1)",
  fontSize: 12.5, fontFamily: "inherit", outline: "none",
};

const botonStyle: React.CSSProperties = {
  height: 28, padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink-2)",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

const botonPrimarioStyle: React.CSSProperties = {
  ...botonStyle,
  background: "var(--accent)", color: "#fff", border: "none",
};

const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-xl)",
  overflow: "hidden",
};

const sectionTitleStyle: React.CSSProperties = {
  padding: "12px 18px",
  fontSize: 13, fontWeight: 700, color: "var(--ink-1)",
  borderBottom: "1px solid var(--line-soft)",
};

function etiquetaEstado(e: EstadoCuenta): string {
  if (e === "activo") return "Activo";
  if (e === "gracia") return "Gracia";
  if (e === "solo_lectura") return "Solo lectura";
  return "Suspendido";
}

function colorEstado(e: EstadoCuenta): string {
  if (e === "activo") return "var(--ink-3)";
  if (e === "gracia") return "var(--warning)";
  return "var(--danger)";
}

// ─── Tarjeta de resumen ──────────────────────────────────────────────────────

function TarjetaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div
      style={{
        flex: "1 1 160px", minWidth: 150,
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div className="rotulo" style={{ marginBottom: 6 }}>{etiqueta}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--ink-1)", fontFamily: "var(--font-sans)" }}>
        {valor}
      </div>
    </div>
  );
}

// ─── Gráfico sobrio: barras horizontales (SVG/CSS propio, sin librería) ─────

function BarraHorizontal({
  label, valor, maximo, texto, color, trackColor,
}: {
  label: string; valor: number; maximo: number; texto: string; color: string; trackColor: string;
}) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div
        style={{
          width: 120, flexShrink: 0, fontSize: 11.5, color: "var(--ink-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </div>
      <div style={{ flex: 1, height: 14, borderRadius: "var(--r-sm)", background: trackColor, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "var(--r-sm)" }} />
      </div>
      <div style={{ width: 64, flexShrink: 0, textAlign: "right", fontSize: 11.5, fontWeight: 600, color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
        {texto}
      </div>
    </div>
  );
}

function GraficoOcupacion({ clientes }: { clientes: ClienteMetricas[] }) {
  const filas = useMemo(
    () =>
      clientes
        .filter((c) => c.metricas && c.metricas.ocupacion_pct !== null)
        .map((c) => ({ slug: c.slug, nombre: c.nombre, ocupacion: c.metricas!.ocupacion_pct as number }))
        .sort((a, b) => b.ocupacion - a.ocupacion),
    [clientes]
  );

  return (
    <div style={panelStyle}>
      <div style={sectionTitleStyle}>Ocupación por cliente</div>
      <div style={{ padding: "14px 18px" }}>
        {filas.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Sin datos de ocupación para este período.</div>
        ) : (
          filas.map((f) => (
            <BarraHorizontal
              key={f.slug}
              label={f.nombre}
              valor={f.ocupacion}
              maximo={100}
              texto={formatoPct(f.ocupacion)}
              color="var(--ocupado)"
              trackColor="var(--ocupado-suave)"
            />
          ))
        )}
      </div>
    </div>
  );
}

function GraficoProveedores({ metricas }: { metricas: MetricasPlataforma | null }) {
  const top = (metricas?.consolidado.top_proveedores ?? []).slice(0, 5);
  const maximo = top.reduce((m, p) => Math.max(m, p.contratos_activos), 0);

  return (
    <div style={panelStyle}>
      <div style={sectionTitleStyle}>Top proveedores (consolidado)</div>
      <div style={{ padding: "14px 18px" }}>
        {top.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Sin contratos activos en este período.</div>
        ) : (
          top.map((p) => (
            <BarraHorizontal
              key={p.nombre}
              label={p.nombre}
              valor={p.contratos_activos}
              maximo={maximo}
              texto={String(p.contratos_activos)}
              color="var(--ink-1)"
              trackColor="var(--surface-3)"
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Fila en edición del estado de cuenta (mudada del modal, sin cambios de
//     comportamiento: motivo obligatorio, confirmación antes del PATCH) ────

function FilaEditor({
  fila, onGuardado, onCancelar,
}: {
  fila: ClientePlataforma;
  onGuardado: (patch: Pick<ClientePlataforma, "estado" | "motivo" | "cambiado_en" | "cambiado_por">) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCuenta>(fila.estado);
  const [motivo, setMotivo] = useState(fila.motivo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!motivo.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }
    const seguro = confirm(
      `¿Cambiar "${fila.nombre}" (${fila.slug}) a "${etiquetaEstado(estado)}"?\n\nMotivo: ${motivo.trim()}`
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      const r = await patchEstadoCliente(fila.slug, { estado, motivo: motivo.trim() });
      onGuardado({
        estado: r.estado, motivo: r.motivo,
        cambiado_en: r.cambiado_en, cambiado_por: r.cambiado_por,
      });
    } catch (err) {
      setError(describeError(err, "No se pudo cambiar el estado."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "10px 18px", background: "var(--surface-2)", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoCuenta)}
          style={{ ...inputStyle, width: 140 }}
        >
          {ESTADOS_CUENTA.map((e) => (
            <option key={e} value={e}>{etiquetaEstado(e)}</option>
          ))}
        </select>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (obligatorio, también al reactivar)"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={guardar} disabled={busy} style={{ ...botonPrimarioStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button onClick={onCancelar} disabled={busy} style={botonStyle}>
          Cancelar
        </button>
        {error && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--danger)" }}>{error}</span>}
      </div>
    </div>
  );
}

// ─── Tabla de clientes: estado + métricas + Cambiar, en la misma fila ──────
//
// Fuente de verdad del estado y de la edición sigue siendo `GET
// /plataforma/clientes` (igual que en el modal viejo): trae `motivo` /
// `cambiado_en` / `cambiado_por`, que el endpoint de métricas no expone. Las
// columnas de métricas se completan por slug desde `GET
// /plataforma/metricas`, que puede llegar más tarde, quedar `null` en un
// cliente con error, o venir cacheada -- ninguna de esas tres cosas debe
// tapar el estado ni el botón Cambiar, que dependen sólo del primer fetch.

function FilaCliente({
  fila, metricas, editando, onEditar, onGuardado, onCancelar,
}: {
  fila: ClientePlataforma;
  metricas: ClienteMetricas | undefined;
  editando: boolean;
  onEditar: () => void;
  onGuardado: (patch: Pick<ClientePlataforma, "estado" | "motivo" | "cambiado_en" | "cambiado_por">) => void;
  onCancelar: () => void;
}) {
  const m = metricas?.metricas ?? null;
  const error = metricas?.error ?? null;

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "9px 18px",
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <div style={{ flex: "1.4 1 180px", minWidth: 150 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {fila.nombre}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
            {fila.slug}{!fila.activo && " · inactivo"}
          </div>
        </div>

        <div style={{ width: 92, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: colorEstado(fila.estado) }}>
          {etiquetaEstado(fila.estado)}
        </div>

        {error ? (
          <div style={{ flex: "3 1 260px", minWidth: 200, fontSize: 11.5, color: "var(--danger)" }}>
            {error}
          </div>
        ) : (
          <>
            <div style={{ width: 74, flexShrink: 0, fontSize: 11.5, color: "var(--ink-2)" }} title="Ocupación del período">
              {m ? formatoPct(m.ocupacion_pct) : "—"}
            </div>
            <div style={{ width: 108, flexShrink: 0, fontSize: 11.5, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }} title="Canon promedio mensual">
              {m ? formatoCOP(m.canon_promedio_mensual) : "—"}
            </div>
            <div style={{ width: 118, flexShrink: 0, fontSize: 11.5, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }} title="Ingreso contratado del mes">
              {m ? formatoCOP(m.ingreso_contratado_mes) : "—"}
            </div>
            <div style={{ width: 90, flexShrink: 0, fontSize: 11, color: "var(--ink-3)" }} title="Último acceso con cuenta">
              {m ? soloFecha(m.ultimo_acceso) : "—"}
            </div>
          </>
        )}

        <button onClick={onEditar} style={{ ...botonStyle, marginLeft: "auto" }}>
          {editando ? "Cerrar" : "Cambiar"}
        </button>
      </div>

      {editando && (
        <FilaEditor fila={fila} onCancelar={onCancelar} onGuardado={onGuardado} />
      )}
    </div>
  );
}

// ─── Solicitudes de supresión (mudada del modal, sin cambios) ──────────────

function etiquetaSupresion(e: SolicitudSupresion["estado"]): string {
  if (e === "pendiente") return "Pendiente";
  if (e === "atendida") return "Atendida";
  return "Rechazada";
}

function colorSupresion(e: SolicitudSupresion["estado"]): string {
  if (e === "pendiente") return "var(--warning)";
  if (e === "atendida") return "var(--ink-3)";
  return "var(--danger)";
}

function FilaEditorSupresion({
  fila, onGuardado, onCancelar,
}: {
  fila: SolicitudSupresion;
  onGuardado: (actualizada: SolicitudSupresion) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<"atendida" | "rechazada">("atendida");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nota.trim()) {
      setError("La nota es obligatoria.");
      return;
    }
    const seguro = confirm(
      `¿Marcar la solicitud de "${fila.cliente_slug}" como "${etiquetaSupresion(estado)}"?\n\n` +
      `Nota: ${nota.trim()}\n\n` +
      "Esto NO borra nada: la supresión real, si corresponde, se ejecuta a mano, fuera del sistema."
    );
    if (!seguro) return;
    setBusy(true);
    setError(null);
    try {
      const actualizada = await atenderSupresion(fila.id, { estado, nota: nota.trim() });
      onGuardado(actualizada);
    } catch (err) {
      setError(describeError(err, "No se pudo actualizar la solicitud."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "10px 18px", background: "var(--surface-2)", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as "atendida" | "rechazada")}
          style={{ ...inputStyle, width: 140 }}
        >
          <option value="atendida">Atendida</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (obligatoria)"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={guardar} disabled={busy} style={{ ...botonPrimarioStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button onClick={onCancelar} disabled={busy} style={botonStyle}>
          Cancelar
        </button>
        {error && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--danger)" }}>{error}</span>}
      </div>
    </div>
  );
}

function SupresionesSection() {
  const [filas, setFilas] = useState<SolicitudSupresion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);

  const cargar = () => {
    setError(null);
    getSolicitudesSupresion()
      .then(setFilas)
      .catch((err) => setError(describeError(err, "No se pudo leer las solicitudes de supresión.")));
  };

  useEffect(cargar, []);

  return (
    <div style={panelStyle}>
      <div style={sectionTitleStyle}>Solicitudes de supresión</div>
      <div style={{ padding: "10px 18px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        Pedidos de un owner para suprimir su cliente. Nada se borra desde acá — la ejecución,
        si corresponde, es manual y fuera del sistema.
      </div>

      {filas === null ? (
        <div style={{ padding: "0 18px 14px", fontSize: 12, color: error ? "var(--danger)" : "var(--ink-3)" }}>
          {error ?? "Cargando…"}
        </div>
      ) : filas.length === 0 ? (
        <div style={{ padding: "0 18px 14px", fontSize: 12, color: "var(--ink-3)" }}>
          No hay solicitudes todavía.
        </div>
      ) : (
        filas.map((f) => (
          <div key={f.id}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 18px", borderTop: "1px solid var(--line-soft)",
            }}>
              <div style={{ flex: 1.3, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)" }}>
                  {f.cliente_slug}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={f.email}>
                  {f.email}
                </div>
              </div>
              <div style={{ width: 96, fontSize: 11.5, fontWeight: 700, color: colorSupresion(f.estado) }}>
                {etiquetaSupresion(f.estado)}
              </div>
              <div
                style={{
                  flex: 1.6, minWidth: 0, fontSize: 11.5, color: "var(--ink-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={f.motivo ?? undefined}
              >
                {f.motivo ?? "—"}
              </div>
              {f.estado === "pendiente" ? (
                <button onClick={() => setEditando(editando === f.id ? null : f.id)} style={botonStyle}>
                  {editando === f.id ? "Cerrar" : "Atender"}
                </button>
              ) : (
                <div
                  style={{ width: 130, fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}
                  title={f.nota ?? undefined}
                >
                  {f.atendido_por ?? "—"}
                </div>
              )}
            </div>

            {editando === f.id && (
              <FilaEditorSupresion
                fila={f}
                onCancelar={() => setEditando(null)}
                onGuardado={(actualizada) => {
                  setFilas((prev) => (prev ? prev.map((x) => (x.id === f.id ? actualizada : x)) : prev));
                  setEditando(null);
                }}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Encabezado propio (sin Topbar de sede) ─────────────────────────────────

function Encabezado({ email }: { email: string | null }) {
  const logout = useAuthStore((s) => s.logout);
  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 20px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.055em", color: "var(--ink-1)" }}>
        RECABRA
      </span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Plataforma</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {email && (
          <span style={{ fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{email}</span>
        )}
        <button
          onClick={logout}
          title="Salir"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 28, padding: "0 10px",
            borderRadius: "var(--r-md)",
            background: "transparent", border: "1px solid var(--line)",
            color: "var(--ink-2)", cursor: "pointer",
            fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
          }}
        >
          <LogOut size={13} /> Salir
        </button>
      </div>
    </header>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function Plataforma() {
  const email = useAuthStore((s) => s.email);

  // Guard de cortesía: mientras no se sepa, no se pinta nada de negocio.
  // El backend contesta 403 en CADA endpoint igual -- esto sólo evita que
  // alguien que no es operador vea la forma de la pantalla un instante.
  const [operador, setOperador] = useState<"verificando" | "si" | "no">("verificando");

  useEffect(() => {
    let vivo = true;
    soyOperador()
      .then((v) => { if (vivo) setOperador(v ? "si" : "no"); })
      .catch(() => { if (vivo) setOperador("no"); });
    return () => { vivo = false; };
  }, []);

  // ── Clientes + estado (fuente de verdad para editar) ─────────────────────
  const [clientes, setClientes] = useState<ClientePlataforma[] | null>(null);
  const [clientesError, setClientesError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const cargarClientes = () => {
    setClientesError(null);
    getClientesPlataforma()
      .then(setClientes)
      .catch((err) => setClientesError(describeError(err, "No se pudo leer la lista de clientes.")));
  };

  useEffect(() => {
    if (operador === "si") cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador]);

  // ── Métricas del negocio ──────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState(mesActual());
  const [metricas, setMetricas] = useState<MetricasPlataforma | null>(null);
  const [metricasError, setMetricasError] = useState<string | null>(null);
  const [metricasLoading, setMetricasLoading] = useState(false);

  const cargarMetricas = (p: string) => {
    setMetricasLoading(true);
    setMetricasError(null);
    getMetricasPlataforma(p)
      .then(setMetricas)
      .catch((err) => setMetricasError(describeError(err, "No se pudieron leer las métricas.")))
      .finally(() => setMetricasLoading(false));
  };

  useEffect(() => {
    if (operador === "si") cargarMetricas(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador, periodo]);

  const metricasPorSlug = useMemo(() => {
    const mapa = new Map<string, ClienteMetricas>();
    (metricas?.clientes ?? []).forEach((c) => mapa.set(c.slug, c));
    return mapa;
  }, [metricas]);

  // "Clientes activos" se cuenta desde la lista de ESTADOS (fuente fresca de
  // cada apertura de la página), no desde `consolidado.clientes_total` de
  // métricas, que cuenta TODOS los clientes sin importar su estado.
  const clientesActivos = clientes ? clientes.filter((c) => c.estado === "activo").length : null;

  if (operador === "no") return <Navigate to="/" replace />;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <Encabezado email={email} />

      {operador === "verificando" ? (
        <div style={{ padding: 40, fontSize: 12.5, color: "var(--ink-3)" }}>Verificando acceso…</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 60px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* ── Selector de período + indicador de frescura ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <label htmlFor="plataforma-periodo" style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--ink-3)", marginBottom: 4 }}>
                  Período
                </label>
                <input
                  id="plataforma-periodo"
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value || mesActual())}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {metricasLoading
                  ? "Cargando métricas…"
                  : metricas
                    ? `Actualizado ${haceMin(metricas.generado_en)}${metricas.de_cache ? " (caché)" : ""}`
                    : null}
              </div>
            </div>

            {metricasError && (
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--danger)" }}>{metricasError}</div>
            )}

            {/* ── Tarjetas de resumen consolidado ── */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <TarjetaResumen
                etiqueta="Clientes activos"
                valor={clientesActivos === null ? "—" : String(clientesActivos)}
              />
              <TarjetaResumen
                etiqueta="Ocupación media"
                valor={formatoPct(metricas?.consolidado.ocupacion_pct ?? null)}
              />
              <TarjetaResumen
                etiqueta="Canon promedio"
                valor={formatoCOP(metricas?.consolidado.canon_promedio_mensual ?? null)}
              />
              <TarjetaResumen
                etiqueta="Ingreso contratado (mes)"
                valor={formatoCOP(metricas?.consolidado.ingreso_contratado_mes ?? null)}
              />
            </div>

            {/* ── Gráficos sobrios (SVG/CSS propio) ── */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <GraficoOcupacion clientes={metricas?.clientes ?? []} />
              </div>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <GraficoProveedores metricas={metricas} />
              </div>
            </div>

            {/* ── Clientes: estado + métricas + Cambiar en la misma fila ── */}
            <div style={panelStyle}>
              <div style={sectionTitleStyle}>Clientes</div>
              <div style={{ padding: "10px 18px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5, borderBottom: "1px solid var(--line-soft)" }}>
                Estado de cuenta y métricas del período por supermercado. Cambiar el estado corta o
                restringe el servicio de inmediato — el motivo queda de constancia, también al
                reactivar.
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 720 }}>
                  {clientes === null ? (
                    <div style={{ padding: 18, fontSize: 12, color: clientesError ? "var(--danger)" : "var(--ink-3)" }}>
                      {clientesError ?? "Cargando…"}
                    </div>
                  ) : clientes.length === 0 ? (
                    <div style={{ padding: 18, fontSize: 12, color: "var(--ink-3)" }}>No hay clientes todavía.</div>
                  ) : (
                    clientes.map((f) => (
                      <FilaCliente
                        key={f.slug}
                        fila={f}
                        metricas={metricasPorSlug.get(f.slug)}
                        editando={editando === f.slug}
                        onEditar={() => setEditando(editando === f.slug ? null : f.slug)}
                        onCancelar={() => setEditando(null)}
                        onGuardado={(patch) => {
                          setClientes((prev) =>
                            prev ? prev.map((x) => (x.slug === f.slug ? { ...x, ...patch } : x)) : prev
                          );
                          setEditando(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            <SupresionesSection />
          </div>
        </div>
      )}
    </div>
  );
}
