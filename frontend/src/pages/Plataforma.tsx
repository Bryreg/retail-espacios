import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import {
  AgregadosMetricasCliente,
  soyOperador, getClientesPlataforma, patchEstadoCliente, getMetricasPlataforma,
  ESTADOS_CUENTA,
  type ClientePlataforma, type EstadoCuenta, type MetricasPlataforma, type ClienteMetricas,
} from "../api/plataforma";
import {
  getSolicitudesSupresion, atenderSupresion, type SolicitudSupresion,
} from "../api/derechos";
import { describeError } from "../api/client";
import { useAuthStore } from "../store/authStore";
import {
  type ConsolaTema, temaInicial, guardarTema, TemaToggle,
  Panel, EstadoVacio, EstadoError, KpiTile,
  Barras, BarraFila, EstadoPill, etiquetaEstado, SinDato,
  TablaScroll, TablaHead, TablaHeadCelda, Fila,
} from "../components/plataforma/consola";
import { PanelTendencia, useTendencia } from "../components/plataforma/tendencia";
import { PanelAdopcion, useAdopcion } from "../components/plataforma/adopcion";

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
// Fase 4b (diseño): la consola tiene ahora sistema visual PROPIO de
// back-office/BI — tokens `--con-*`, tema claro/oscuro, y primitivas
// reutilizables en `components/plataforma/consola.tsx` (KPI tiles, barras con
// eje desde cero, estado de cuenta, sin-dato, tabla de densidad).
//
// Fase 7 (transparencia): el operador ve los agregados EXACTOS de todos los
// clientes, sin umbral de privacidad -- la contrapartida es el reporte de
// transparencia que cada cliente puede generar (botón "Reporte" por fila,
// abajo, y desde el Dashboard del cliente).
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

/** Spread canon vs tarifa de referencia (Fase 6): signo menos tipográfico
 *  (U+2212, no el guion ASCII), coma decimal, espacio fino (U+2009) antes del
 *  "%". `0` explícito se pinta sin signo -- "0,0 %", nunca "+0,0 %". */
const formatoSpread = (n: number): string => {
  const cifra = Math.abs(n).toFixed(1).replace(".", ",");
  const signo = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${signo}${cifra} %`;
};

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

// ─── Estilos compartidos de formulario (tokens --con-* de la consola) ───────

const inputStyle: React.CSSProperties = {
  height: 32, padding: "0 10px",
  borderRadius: "var(--r-md)", border: "1px solid var(--con-line)",
  background: "var(--con-surface)", color: "var(--con-ink-1)",
  fontSize: 12.5, fontFamily: "inherit", outline: "none",
};

const botonStyle: React.CSSProperties = {
  height: 28, padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--con-line)",
  background: "var(--con-surface)",
  color: "var(--con-ink-2)",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

const botonPrimarioStyle: React.CSSProperties = {
  ...botonStyle,
  background: "var(--con-accent)", color: "var(--con-accent-ink)", border: "none",
};

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
    <div style={{ padding: "10px 16px", background: "var(--con-surface-2)", borderTop: "1px solid var(--con-line-soft)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoCuenta)}
          className="con-focusable"
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
          className="con-focusable"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={guardar} disabled={busy} className="con-focusable" style={{ ...botonPrimarioStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button onClick={onCancelar} disabled={busy} className="con-focusable" style={botonStyle}>
          Cancelar
        </button>
        {error && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--con-estado-corte)" }}>{error}</span>}
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


/** Celda de importe (Fase 7: agregados EXACTOS, sin umbral). `null` significa
 *  únicamente "cero contratos activos en el período" -- nunca una supresión
 *  de privacidad; con 1 o más contratos el número sale exacto, sin ocultar
 *  nada. */
function celdaPlata(v: number | null) {
  if (v !== null) return <span style={{ color: "var(--con-ink-2)" }}>{formatoCOP(v)}</span>;
  return <SinDato title="Sin contratos activos en el período" />;
}

/** Celda "vs tarifa" (Fase 6, oportunidad de precio): dos ausencias propias,
 *  ninguna es la ausencia genérica de `celdaPlata` --
 *   · `tarifa_configurada === false` → "sin tarifa" en tinta apagada (el
 *     cliente sencillamente no configuró nada todavía).
 *   · tarifa configurada pero `spread_pct === null` → "sin contratos con
 *     tarifa aplicable" (Fase 7: sin umbral -- con 1 contrato con tarifa
 *     aplicable, el número sale exacto).
 *   · valor → signo + magnitud; por debajo de tarifa (negativo) se resalta
 *     con el tono de aviso de la consola (mismo ámbar que gracia/solo
 *     lectura) porque es la lectura que dispara una conversación de
 *     asesoría -- por encima o en cero queda en tinta neutra, no es un
 *     problema. La tarifa en sí nunca se pinta ni se manda: sólo esta
 *     relación. */
function celdaSpread(m: AgregadosMetricasCliente) {
  if (!m.tarifa_configurada) {
    return <span style={{ color: "var(--con-ink-4)" }}>sin tarifa</span>;
  }
  if (m.spread_pct === null) {
    return <span style={{ color: "var(--con-ink-4)" }}>sin contratos con tarifa aplicable</span>;
  }
  const color = m.spread_pct < 0 ? "var(--con-estado-aviso)" : "var(--con-ink-2)";
  return <span style={{ color, fontWeight: 600 }}>{formatoSpread(m.spread_pct)}</span>;
}

function hintSpread(m: AgregadosMetricasCliente | null): string {
  if (!m) return "vs tarifa de referencia";
  const base = !m.tarifa_configurada
    ? "Sin tarifa de referencia configurada."
    : m.spread_pct === null
      ? "Sin contratos con tarifa aplicable en el período."
      : "Canon vs tarifa de referencia (negativo = por debajo de su tarifa).";
  if (m.contratos_sin_tarifa > 0) {
    return `${base} ${m.contratos_sin_tarifa} contrato${m.contratos_sin_tarifa === 1 ? "" : "s"} sin tarifa aplicable.`;
  }
  return base;
}

const W_ESTADO = 118;
const W_OCUP = 74;
const W_CANON = 108;
const W_ING = 118;
const W_ACC = 90;
const W_SPREAD = 96;
const W_BTN = 76;
const W_BTN_REPORTE = 74;
const W_BOTONES = W_BTN_REPORTE + 6 + W_BTN;

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
  const navigate = useNavigate();

  return (
    <div>
      <Fila>
        <div style={{ flex: "1.4 1 180px", minWidth: 150 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: "var(--con-ink-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {fila.nombre}
          </div>
          <div style={{ fontSize: 11, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)" }}>
            {fila.slug}{!fila.activo && " · inactivo"}
          </div>
        </div>

        <div style={{ width: W_ESTADO, flexShrink: 0 }}>
          <EstadoPill estado={fila.estado} />
        </div>

        {error ? (
          <div style={{ flex: "3 1 260px", minWidth: 200, fontSize: 11.5, color: "var(--con-estado-corte)" }}>
            {error}
          </div>
        ) : (
          <>
            <div style={{ width: W_OCUP, flexShrink: 0, fontSize: 11.5, color: "var(--con-ink-2)", fontFamily: "var(--font-mono)", textAlign: "right" }} title="Ocupación del período">
              {m ? (m.ocupacion_pct !== null ? formatoPct(m.ocupacion_pct) : <SinDato />) : "—"}
            </div>
            <div style={{ width: W_CANON, flexShrink: 0, fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "right" }} title="Canon promedio mensual">
              {m ? celdaPlata(m.canon_promedio_mensual) : "—"}
            </div>
            <div style={{ width: W_ING, flexShrink: 0, fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "right" }} title="Ingreso contratado del mes">
              {m ? celdaPlata(m.ingreso_contratado_mes) : "—"}
            </div>
            <div style={{ width: W_SPREAD, flexShrink: 0, fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "right" }} title={hintSpread(m)}>
              {m ? celdaSpread(m) : "—"}
            </div>
            <div
              style={{ width: W_ACC, flexShrink: 0, fontSize: 11, color: "var(--con-ink-3)" }}
              title={
                m
                  ? `${m.usuarios_con_cuenta} cuenta${m.usuarios_con_cuenta === 1 ? "" : "s"} de usuario · último acceso ${m.ultimo_acceso ? soloFecha(m.ultimo_acceso) : "sin registrar"}`
                  : "Último acceso con cuenta"
              }
            >
              {m ? soloFecha(m.ultimo_acceso) : "—"}
            </div>
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={() => navigate(`/plataforma/reporte/${encodeURIComponent(fila.slug)}`)}
            className="con-focusable"
            style={{ ...botonStyle, width: W_BTN_REPORTE }}
            title="Reporte de transparencia de este cliente -- qué toma la plataforma, cómo lo calcula y quién lo consultó."
          >
            Reporte
          </button>
          <button onClick={onEditar} className="con-focusable" style={{ ...botonStyle, width: W_BTN }}>
            {editando ? "Cerrar" : "Cambiar"}
          </button>
        </div>
      </Fila>

      {editando && (
        <FilaEditor fila={fila} onCancelar={onCancelar} onGuardado={onGuardado} />
      )}
    </div>
  );
}

// ─── Gráficos: barras con eje desde cero (primitivas de la consola) ─────────

// Pregunta de negocio: "¿qué cliente necesita una conversación de asesoría
// primero?" -- por eso el orden es de MENOR a MAYOR ocupación (el peor caso
// arriba, no abajo) y los clientes sin dato de ocupación se muestran igual
// (al final, como "sin dato") en vez de desaparecer del panel: un cliente sin
// contratos activos en el período es, si acaso, el que MÁS necesita una
// llamada -- ocultarlo sería el error de presentación opuesto al que se
// está corrigiendo.
function GraficoOcupacion({ clientes }: { clientes: ClienteMetricas[] }) {
  const filas = useMemo(() => {
    const conDato = clientes
      .filter((c) => c.metricas && c.metricas.ocupacion_pct !== null)
      .map((c) => ({
        slug: c.slug,
        nombre: c.nombre,
        ocupacion: c.metricas!.ocupacion_pct as number,
        espacios: c.metricas!.espacios_comercializables,
        estado: "normal" as const,
      }))
      .sort((a, b) => a.ocupacion - b.ocupacion); // menor primero: el que necesita asesoría antes
    const sinDato = clientes
      .filter((c) => c.metricas && c.metricas.ocupacion_pct === null)
      .map((c) => ({
        slug: c.slug,
        nombre: c.nombre,
        ocupacion: 0,
        espacios: c.metricas!.espacios_comercializables,
        estado: "sindato" as const,
      }));
    return [...conDato, ...sinDato];
  }, [clientes]);

  return (
    <Panel
      titulo="Ocupación por cliente"
      subtitulo="Espacios con contrato activo sobre comercializables, en el período — de menor a mayor: el que necesita asesoría primero."
    >
      {filas.length === 0 ? (
        <EstadoVacio texto="Sin datos de ocupación para este período." />
      ) : (
        <Barras etiquetaMax="100%">
          {filas.map((f) => (
            <BarraFila
              key={f.slug}
              label={f.nombre}
              valor={f.ocupacion}
              max={100}
              texto={f.estado === "sindato" ? "—" : formatoPct(f.ocupacion)}
              tono="magnitud"
              estado={f.estado}
              hint={
                f.estado === "sindato"
                  ? `${f.nombre}: sin dato de ocupación este período (${f.espacios} espacios comercializables, sin contratos activos que la calculen).`
                  : `${f.nombre}: ${formatoPct(f.ocupacion)} de ${f.espacios} espacios comercializables.`
              }
            />
          ))}
        </Barras>
      )}
    </Panel>
  );
}

// Pregunta de negocio: "¿qué tan expuesta está la cartera a un solo
// proveedor?" -- la concentración se calcula SOLO sobre el top-5 que trae el
// endpoint (no hay un total de proveedores en el JSON), así que la lectura se
// nombra explícitamente "entre los 5 principales" para no insinuar un
// porcentaje de la cartera completa que no se puede calcular con estos datos.
function GraficoProveedores({ metricas }: { metricas: MetricasPlataforma | null }) {
  const top = (metricas?.consolidado.top_proveedores ?? []).slice(0, 5);
  const maximo = top.reduce((m, p) => Math.max(m, p.contratos_activos), 0);
  const totalTop = top.reduce((s, p) => s + p.contratos_activos, 0);
  const liderPct = top.length > 0 && totalTop > 0 ? (top[0].contratos_activos / totalTop) * 100 : null;

  return (
    <Panel
      titulo="Top proveedores (consolidado)"
      subtitulo={
        liderPct !== null
          ? `Contratos activos por proveedor. "${top[0].nombre}" concentra ${liderPct.toFixed(1)}% de los contratos entre los 5 principales — cuanto más cerca del 100%, mayor el riesgo de depender de uno solo.`
          : "Contratos activos por proveedor — concentración entre los 5 principales."
      }
    >
      {top.length === 0 ? (
        <EstadoVacio texto="Sin contratos activos en este período." />
      ) : (
        <Barras etiquetaMax={String(maximo)}>
          {top.map((p) => {
            const share = totalTop > 0 ? (p.contratos_activos / totalTop) * 100 : 0;
            return (
              <BarraFila
                key={p.nombre}
                label={p.nombre}
                valor={p.contratos_activos}
                max={maximo}
                texto={String(p.contratos_activos)}
                tono="conteo"
                hint={`${p.nombre}: ${p.contratos_activos} contrato${p.contratos_activos === 1 ? "" : "s"} activo${p.contratos_activos === 1 ? "" : "s"} — ${share.toFixed(1)}% de los 5 principales.`}
              />
            );
          })}
        </Barras>
      )}
    </Panel>
  );
}

// ─── Solicitudes de supresión (mudada del modal, sin cambios) ──────────────

function etiquetaSupresion(e: SolicitudSupresion["estado"]): string {
  if (e === "pendiente") return "Pendiente";
  if (e === "atendida") return "Atendida";
  return "Rechazada";
}

function colorSupresion(e: SolicitudSupresion["estado"]): string {
  if (e === "pendiente") return "var(--con-estado-aviso)";
  if (e === "atendida") return "var(--con-ink-3)";
  return "var(--con-estado-corte)";
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
    <div style={{ padding: "10px 16px", background: "var(--con-surface-2)", borderTop: "1px solid var(--con-line-soft)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as "atendida" | "rechazada")}
          className="con-focusable"
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
          className="con-focusable"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={guardar} disabled={busy} className="con-focusable" style={{ ...botonPrimarioStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Guardando…" : "Confirmar"}
        </button>
        <button onClick={onCancelar} disabled={busy} className="con-focusable" style={botonStyle}>
          Cancelar
        </button>
        {error && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--con-estado-corte)" }}>{error}</span>}
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
    <Panel
      titulo="Solicitudes de supresión"
      subtitulo="Pedidos de un owner para suprimir su cliente. Nada se borra desde acá — la ejecución, si corresponde, es manual y fuera del sistema."
      sinPadding
    >
      {filas === null ? (
        <div style={{ padding: "12px 16px" }}>
          {error ? <EstadoError texto={error} /> : <EstadoVacio texto="Cargando…" />}
        </div>
      ) : filas.length === 0 ? (
        <div style={{ padding: "12px 16px" }}>
          <EstadoVacio texto="No hay solicitudes todavía." />
        </div>
      ) : (
        filas.map((f) => (
          <div key={f.id}>
            <Fila>
              <div style={{ flex: 1.3, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--con-ink-1)" }}>
                  {f.cliente_slug}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)",
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
                  flex: 1.6, minWidth: 0, fontSize: 11.5, color: "var(--con-ink-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={f.motivo ?? undefined}
              >
                {f.motivo ?? "—"}
              </div>
              {f.estado === "pendiente" ? (
                <button onClick={() => setEditando(editando === f.id ? null : f.id)} className="con-focusable" style={botonStyle}>
                  {editando === f.id ? "Cerrar" : "Atender"}
                </button>
              ) : (
                <div
                  style={{ width: 130, fontSize: 10.5, color: "var(--con-ink-4)", whiteSpace: "nowrap" }}
                  title={f.nota ?? undefined}
                >
                  {f.atendido_por ?? "—"}
                </div>
              )}
            </Fila>

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
    </Panel>
  );
}

// ─── Encabezado propio (sin Topbar de sede) ─────────────────────────────────

function Encabezado({ email, tema, onToggleTema }: { email: string | null; tema: ConsolaTema; onToggleTema: () => void }) {
  const logout = useAuthStore((s) => s.logout);
  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 20px",
        background: "var(--con-surface)",
        borderBottom: "1px solid var(--con-line)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.055em", color: "var(--con-ink-1)" }}>
        RECABRA
      </span>
      <span style={{ color: "var(--con-ink-4)" }}>·</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--con-ink-2)" }}>Plataforma</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {email && (
          <span style={{ fontSize: 11.5, color: "var(--con-ink-4)", whiteSpace: "nowrap" }}>{email}</span>
        )}
        <TemaToggle tema={tema} onToggle={onToggleTema} />
        <button
          onClick={logout}
          title="Salir"
          className="con-focusable"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 28, padding: "0 10px",
            borderRadius: "var(--r-md)",
            background: "transparent", border: "1px solid var(--con-line)",
            color: "var(--con-ink-2)", cursor: "pointer",
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

  // ── Tema de la consola (claro/oscuro) — preferencia de UI, no dato ────────
  const [tema, setTema] = useState<ConsolaTema>(temaInicial);
  const toggleTema = () => {
    setTema((prev) => {
      const siguiente: ConsolaTema = prev === "claro" ? "oscuro" : "claro";
      guardarTema(siguiente);
      return siguiente;
    });
  };

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

  // Sube en cada resolución (éxito o error) de `cargarMetricas` -- la
  // tendencia se dispara DESPUÉS, nunca antes: el backend hace write-through
  // del snapshot del mes en curso al calcular métricas, así que pedir la
  // tendencia antes de que eso corra deja el mes actual como "sin dato".
  const [metricasVersion, setMetricasVersion] = useState(0);

  const cargarMetricas = (p: string) => {
    setMetricasLoading(true);
    setMetricasError(null);
    getMetricasPlataforma(p)
      .then(setMetricas)
      .catch((err) => setMetricasError(describeError(err, "No se pudieron leer las métricas.")))
      .finally(() => {
        setMetricasLoading(false);
        setMetricasVersion((v) => v + 1);
      });
  };

  useEffect(() => {
    if (operador === "si") cargarMetricas(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador, periodo]);

  // ── Tendencia temporal (Fase 5) ────────────────────────────────────────────
  //
  // Reusa la lista de clientes que la página YA cargó (`getClientesPlataforma`
  // arriba) -- ni un fetch nuevo de clientes. Se recarga al cambiar cliente o
  // meses, y cada vez que las métricas terminan de resolver (incluye la
  // primera carga del período inicial).
  const tend = useTendencia();

  useEffect(() => {
    if (operador === "si" && metricasVersion > 0) tend.cargar(tend.cliente, tend.meses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador, metricasVersion, tend.cliente, tend.meses]);

  // ── Adopción (Fase 6) ─────────────────────────────────────────────────────
  //
  // Mismo motivo que la tendencia: `con_contratos_activos` lo calcula el
  // backend con el mismo caché de métricas de 5 min, así que se pide DESPUÉS
  // de que `/metricas` haya resuelto al menos una vez (`metricasVersion > 0`),
  // nunca antes.
  const adop = useAdopcion();

  useEffect(() => {
    if (operador === "si" && metricasVersion > 0) adop.cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador, metricasVersion]);

  const metricasPorSlug = useMemo(() => {
    const mapa = new Map<string, ClienteMetricas>();
    (metricas?.clientes ?? []).forEach((c) => mapa.set(c.slug, c));
    return mapa;
  }, [metricas]);

  // "Clientes activos" se cuenta desde la lista de ESTADOS (fuente fresca de
  // cada apertura de la página), no desde `consolidado.clientes_total` de
  // métricas, que cuenta TODOS los clientes sin importar su estado.
  const clientesActivos = clientes ? clientes.filter((c) => c.estado === "activo").length : null;
  const clientesConError = metricas?.consolidado.clientes_con_error ?? 0;

  if (operador === "no") return <Navigate to="/" replace />;

  return (
    <div
      data-consola-tema={tema}
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--con-bg)", color: "var(--con-ink-1)" }}
    >
      <Encabezado email={email} tema={tema} onToggleTema={toggleTema} />

      {operador === "verificando" ? (
        <div style={{ padding: 40, fontSize: 12.5, color: "var(--con-ink-3)" }}>Verificando acceso…</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 60px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* ── Selector de período + indicador de frescura ── */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div>
                <label htmlFor="plataforma-periodo" style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--con-ink-3)", marginBottom: 4 }}>
                  Período
                </label>
                <input
                  id="plataforma-periodo"
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value || mesActual())}
                  className="con-focusable"
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--con-ink-4)", paddingBottom: 8 }}>
                {metricasLoading
                  ? "Cargando métricas…"
                  : metricas
                    ? `Actualizado ${haceMin(metricas.generado_en)}${metricas.de_cache ? " (caché)" : ""}`
                    : null}
              </div>
            </div>

            {metricasError && <EstadoError texto={metricasError} />}

            {/* ── KPIs consolidados: el hero (ingreso contratado) grande y
                   primero; el resto lo sostiene. Un nivel de énfasis por tile. */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KpiTile
                variante="hero"
                rotulo="Ingreso contratado · mes"
                valor={formatoCOP(metricas?.consolidado.ingreso_contratado_mes ?? null)}
                hint="Suma del canon de los contratos activos del período, consolidada sobre todos los clientes."
                contexto={
                  clientesConError > 0
                    ? `${clientesConError} cliente${clientesConError === 1 ? "" : "s"} sin leer este período`
                    : undefined
                }
              />
              <KpiTile
                rotulo="Clientes activos"
                valor={clientesActivos === null ? "—" : String(clientesActivos)}
                hint="Clientes con estado de cuenta 'activo' (fuente: lista de estados, no las métricas)."
                contexto={
                  metricas ? `de ${metricas.consolidado.clientes_total} en el registro` : undefined
                }
              />
              <KpiTile
                rotulo="Ocupación media"
                valor={formatoPct(metricas?.consolidado.ocupacion_pct ?? null)}
                hint="Espacios con contrato activo sobre comercializables, consolidado."
                contexto={
                  metricas
                    ? `sobre ${metricas.consolidado.espacios_comercializables} espacios comercializables en ${metricas.consolidado.sedes_con_plano} sede${metricas.consolidado.sedes_con_plano === 1 ? "" : "s"} con plano`
                    : undefined
                }
              />
              <KpiTile
                rotulo="Canon promedio"
                valor={formatoCOP(metricas?.consolidado.canon_promedio_mensual ?? null)}
                hint="Canon mensual promedio de los contratos activos, consolidado."
              />
              <KpiTile
                rotulo="vs tarifa de referencia"
                valor={
                  !metricas ? "—"
                  : metricas.consolidado.clientes_con_tarifa === 0 ? "sin tarifa"
                  : metricas.consolidado.spread_pct === null ? "—"
                  : formatoSpread(metricas.consolidado.spread_pct)
                }
                hint="Ponderado: Σ canon / Σ tarifa de referencia de los clientes con tarifa configurada (nunca promedio de spreads). Fase 7: suma a todos los clientes legibles con tarifa configurada, sin umbral."
                contexto={
                  !metricas ? undefined
                  : metricas.consolidado.clientes_con_tarifa === 0
                    ? "ningún cliente configuró tarifa de referencia"
                  : metricas.consolidado.spread_pct === null
                    ? "ningún contrato con tarifa aplicable en el período"
                  : metricas.consolidado.spread_pct < 0
                    ? `la cartera cobra ${Math.abs(metricas.consolidado.spread_pct).toFixed(1).replace(".", ",")} % por debajo de sus tarifas de referencia`
                  : metricas.consolidado.spread_pct > 0
                    ? `la cartera cobra ${metricas.consolidado.spread_pct.toFixed(1).replace(".", ",")} % por encima de sus tarifas de referencia`
                  : "la cartera cobra exactamente su tarifa de referencia"
                }
              />
            </div>

            {/* ── Gráficos: barras con eje desde cero (SVG/CSS propio) ── */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <GraficoOcupacion clientes={metricas?.clientes ?? []} />
              </div>
              <div style={{ flex: "1 1 380px", minWidth: 320 }}>
                <GraficoProveedores metricas={metricas} />
              </div>
            </div>

            {/* ── Clientes: estado + métricas + Cambiar en la misma fila ── */}
            <Panel
              titulo="Clientes"
              subtitulo="Estado de cuenta y métricas del período por supermercado. Cambiar el estado corta o restringe el servicio de inmediato — el motivo queda de constancia, también al reactivar."
              sinPadding
            >
              <TablaScroll minWidth={856 + W_BTN_REPORTE + 6}>
                {clientes === null ? (
                  <div style={{ padding: 16 }}>
                    {clientesError ? <EstadoError texto={clientesError} /> : <EstadoVacio texto="Cargando…" />}
                  </div>
                ) : clientes.length === 0 ? (
                  <div style={{ padding: 16 }}>
                    <EstadoVacio texto="No hay clientes todavía." />
                  </div>
                ) : (
                  <>
                    {/* Encabezados: mismas anchuras que las celdas de FilaCliente. */}
                    <TablaHead>
                      <TablaHeadCelda flex="1.4 1 180px">Supermercado</TablaHeadCelda>
                      <TablaHeadCelda width={W_ESTADO}>Estado</TablaHeadCelda>
                      <TablaHeadCelda width={W_OCUP} alinear="right">Ocupación</TablaHeadCelda>
                      <TablaHeadCelda width={W_CANON} alinear="right">Canon prom.</TablaHeadCelda>
                      <TablaHeadCelda width={W_ING} alinear="right">Ingreso (mes)</TablaHeadCelda>
                      <TablaHeadCelda width={W_SPREAD} alinear="right">vs tarifa</TablaHeadCelda>
                      <TablaHeadCelda width={W_ACC}>Últ. acceso</TablaHeadCelda>
                      <div style={{ marginLeft: "auto", width: W_BOTONES }} />
                    </TablaHead>
                    {clientes.map((f) => (
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
                    ))}
                  </>
                )}
              </TablaScroll>
            </Panel>

            <PanelTendencia
              clientes={clientes}
              tendencia={tend.tendencia}
              loading={tend.loading}
              error={tend.error}
              cliente={tend.cliente}
              meses={tend.meses}
              onCambiarCliente={tend.setCliente}
              onCambiarMeses={tend.setMeses}
            />

            <PanelAdopcion adopcion={adop.adopcion} loading={adop.loading} error={adop.error} />

            <SupresionesSection />
          </div>
        </div>
      )}
    </div>
  );
}
