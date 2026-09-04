import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import {
  getClientesPlataforma, patchEstadoCliente,
  ESTADOS_CUENTA, type ClientePlataforma, type EstadoCuenta,
} from "../../api/plataforma";
import {
  getSolicitudesSupresion, atenderSupresion, type SolicitudSupresion,
} from "../../api/derechos";
import { describeError } from "../../api/client";

// ─── Panel mínimo del operador de plataforma (Fase 2 clientes) ─────────────
//
// Sólo visible si el backend confirmó `operador === true` (ver Dashboard.tsx)
// — quien abre este panel ya pasó esa puerta. Lista todos los clientes del
// registro con su estado y deja moverlo a mano, con motivo obligatorio y
// confirmación: es una palanca que corta o restringe el servicio de un
// cliente entero. Panel de operación, no un dashboard — nada de gráficos ni
// métricas, sólo la tabla y el cambio de estado.

const inputStyle: React.CSSProperties = {
  height: 30, padding: "0 8px",
  borderRadius: "var(--r-md)", border: "1px solid var(--line)",
  background: "var(--surface)", color: "var(--ink-1)",
  fontSize: 12, fontFamily: "inherit", outline: "none",
};

const botonStyle: React.CSSProperties = {
  height: 26, padding: "0 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink-2)",
  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

const botonPrimarioStyle: React.CSSProperties = {
  ...botonStyle,
  background: "var(--accent)", color: "#fff", border: "none",
};

function etiquetaEstado(e: EstadoCuenta): string {
  if (e === "activo") return "Activo";
  if (e === "gracia") return "Gracia";
  if (e === "solo_lectura") return "Solo lectura";
  return "Suspendido";
}

/** `gracia` matiza (naranja, como "se libera" en el resto del sistema);
 *  `solo_lectura` y `suspendido` cortan servicio y comparten el rojo de
 *  "tomado" — la diferencia entre los dos la dice la palabra, no el tono. */
function colorEstado(e: EstadoCuenta): string {
  if (e === "activo") return "var(--ink-3)";
  if (e === "gracia") return "var(--warning)";
  return "var(--danger)";
}

const exacto = (iso: string | null): string => {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

/** Fila en edición: selector de los cuatro estados + motivo obligatorio +
 *  confirmación antes de mandar el PATCH. */
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

// ─── Solicitudes de supresión (Fase 3, derechos del titular) ───────────────
//
// Pedidos que un owner registra desde "Tus datos" en Configuración. Nada se
// borra acá: el operador sólo deja constancia de si la atendió o la
// rechazó -- la ejecución real, si corresponde, es MANUAL y fuera del
// sistema (spec, guardrail).

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
    <div>
      <div style={{
        padding: "10px 18px", borderTop: "1px solid var(--line)",
        fontSize: 12.5, fontWeight: 700, color: "var(--ink-1)",
      }}>
        Solicitudes de supresión
      </div>
      <div style={{ padding: "0 18px 10px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
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

export default function PlataformaPanel({ onClose }: { onClose: () => void }) {
  const [filas, setFilas] = useState<ClientePlataforma[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const cargar = () => {
    setError(null);
    getClientesPlataforma()
      .then(setFilas)
      .catch((err) => setError(describeError(err, "No se pudo leer la lista de clientes.")));
  };

  useEffect(cargar, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 760, maxHeight: "86vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <ShieldCheck size={15} style={{ color: "var(--accent)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Plataforma
          </span>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-md)",
              background: "transparent", border: "none",
              color: "var(--ink-2)", cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--line-soft)", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Estado de cuenta de cada supermercado. Cambiar el estado corta o restringe el
          servicio de inmediato — el motivo queda de constancia, también al reactivar.
        </div>

        {/* Rows */}
        <div style={{ overflowY: "auto" }}>
          {filas === null ? (
            <div style={{ padding: 18, fontSize: 12, color: error ? "var(--danger)" : "var(--ink-3)" }}>
              {error ?? "Cargando…"}
            </div>
          ) : filas.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: "var(--ink-3)" }}>No hay clientes todavía.</div>
          ) : (
            filas.map((f) => (
              <div key={f.slug}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 18px",
                    borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  <div style={{ flex: 1.3, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {f.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                      {f.slug}{!f.activo && " · inactivo"}
                    </div>
                  </div>
                  <div style={{ width: 96, fontSize: 11.5, fontWeight: 700, color: colorEstado(f.estado) }}>
                    {etiquetaEstado(f.estado)}
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
                  <div
                    style={{ width: 130, fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}
                    title={f.cambiado_por ? `Por ${f.cambiado_por}` : undefined}
                  >
                    {exacto(f.cambiado_en)}
                  </div>
                  <button
                    onClick={() => setEditando(editando === f.slug ? null : f.slug)}
                    style={botonStyle}
                  >
                    {editando === f.slug ? "Cerrar" : "Cambiar"}
                  </button>
                </div>

                {editando === f.slug && (
                  <FilaEditor
                    fila={f}
                    onCancelar={() => setEditando(null)}
                    onGuardado={(patch) => {
                      setFilas((prev) =>
                        prev ? prev.map((x) => (x.slug === f.slug ? { ...x, ...patch } : x)) : prev
                      );
                      setEditando(null);
                    }}
                  />
                )}
              </div>
            ))
          )}

          <SupresionesSection />
        </div>
      </div>
    </div>
  );
}
