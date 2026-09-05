import { useState } from "react";
import {
  getAdopcion,
  type Adopcion, type Clasificacion, type ClienteAdopcion, type CohorteAdopcion,
} from "../../api/plataforma";
import { describeError } from "../../api/client";
import { Panel, EstadoVacio, EstadoError, EstadoPill } from "./consola";

// ─── Adopción: cohortes de alta + "a quién llamar hoy" (Fase 6) ────────────
//
// Panel PROPIO, separado de PanelTendencia/consola.tsx (territorio de esta
// fase: no se toca ninguna de las dos). Todo lo que llega ya viene calculado
// por el backend -- clasificación, orden de cohortes (mes ascendente) y orden
// de clientes (fantasma → dormida → sin_cuentas → nueva → activa). Este
// archivo NO re-deriva nada a partir de fechas: sólo formatea y pinta.
//
// Colores: se reusan los tokens `--con-estado-*` existentes (nada nuevo) --
// `fantasma` es la señal de alerta (mismo tono que "gracia/solo_lectura" en
// EstadoPill), `activa` es la lectura "ok" (mismo tono que "activo" en
// EstadoPill); el resto (`nueva`, `dormida`, `sin_cuentas`) es neutro. Nunca
// sólo color: cada badge lleva la palabra siempre.

const formatoPct = (n: number | null): string =>
  n === null ? "—" : `${n.toFixed(1).replace(".", ",")} %`;

const ETIQUETAS_CLASIFICACION: Record<Clasificacion, string> = {
  nueva: "nueva",
  activa: "activa",
  fantasma: "fantasma",
  dormida: "dormida",
  sin_cuentas: "sin cuentas",
};

function tonoClasificacion(c: Clasificacion): string {
  if (c === "fantasma") return "var(--con-estado-aviso)";
  if (c === "activa") return "var(--con-estado-activo)";
  return "var(--con-ink-4)"; // nueva / dormida / sin_cuentas: neutro
}

/** Badge de clasificación: punto + palabra, nunca sólo color (mismo
 *  principio que `EstadoPill` de la consola, pero con las 5 clasificaciones
 *  propias de adopción -- por eso vive acá y no en consola.tsx). */
export function ClasificacionPill({ clasificacion }: { clasificacion: Clasificacion }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, background: tonoClasificacion(clasificacion), flexShrink: 0 }}
      />
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--con-ink-2)" }}>
        {ETIQUETAS_CLASIFICACION[clasificacion]}
      </span>
    </span>
  );
}

/** Conteo por clasificación de una cohorte, como fila de badges (0 se omite
 *  -- una cohorte de 40 clientes no necesita mostrar "0 fantasma, 0 dormida
 *  ..." si no hay ninguno; el número siempre acompaña al badge que sí
 *  aplica). */
function DesgloseCohorte({ cohorte }: { cohorte: CohorteAdopcion }) {
  const orden: Clasificacion[] = ["fantasma", "dormida", "sin_cuentas", "nueva", "activa"];
  const conteos: Record<Clasificacion, number> = {
    fantasma: cohorte.fantasma,
    dormida: cohorte.dormida,
    sin_cuentas: cohorte.sin_cuentas,
    nueva: cohorte.nueva,
    activa: cohorte.activa,
  };
  const partes = orden
    .map((c) => ({ c, n: conteos[c] }))
    .filter((p) => p.n > 0);

  if (partes.length === 0) {
    return <span style={{ color: "var(--con-ink-4)" }}>—</span>;
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {partes.map((p) => (
        <span key={p.c} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--con-ink-2)" }}>{p.n}</span>
          <ClasificacionPill clasificacion={p.c} />
        </span>
      ))}
    </div>
  );
}

function etiquetaCohorte(mes: string | null): string {
  if (mes === null) return "sin fecha de alta";
  const [a, m] = mes.split("-");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const idx = Number(m) - 1;
  const nombre = MESES[idx] ?? m;
  return `${nombre} ${a}`;
}

// ─── Tabla de cohortes ──────────────────────────────────────────────────────

const WC_MES = 130;
const WC_CLIENTES = 78;
const WC_RETENCION = 100;

function TablaCohortes({ cohortes }: { cohortes: CohorteAdopcion[] }) {
  if (cohortes.length === 0) {
    return <EstadoVacio texto="Sin cohortes para este período." />;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 560 }}>
        <div
          role="row"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 0", borderBottom: "1px solid var(--con-line-soft)",
          }}
        >
          <div role="columnheader" className="rotulo" style={{ width: WC_MES, flexShrink: 0, color: "var(--con-ink-4)" }}>
            Mes de alta
          </div>
          <div role="columnheader" className="rotulo" style={{ width: WC_CLIENTES, flexShrink: 0, color: "var(--con-ink-4)", textAlign: "right" }}>
            Clientes
          </div>
          <div role="columnheader" className="rotulo" style={{ width: WC_RETENCION, flexShrink: 0, color: "var(--con-ink-4)", textAlign: "right" }}>
            Retención 30d
          </div>
          <div role="columnheader" className="rotulo" style={{ flex: 1, minWidth: 200, color: "var(--con-ink-4)" }}>
            Desglose
          </div>
        </div>
        {cohortes.map((c) => (
          <div
            key={c.cohorte ?? "__sin_fecha__"}
            role="row"
            className="con-fila"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--con-line-soft)" }}
          >
            <div role="cell" style={{ width: WC_MES, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: "var(--con-ink-1)" }}>
              {etiquetaCohorte(c.cohorte)}
            </div>
            <div role="cell" style={{ width: WC_CLIENTES, flexShrink: 0, fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "right", color: "var(--con-ink-2)" }}>
              {c.clientes}
            </div>
            <div role="cell" style={{ width: WC_RETENCION, flexShrink: 0, fontSize: 11.5, fontFamily: "var(--font-mono)", textAlign: "right", color: "var(--con-ink-2)" }} title="% de la cohorte con algún acceso en los últimos 30 días">
              {formatoPct(c.retencion_30d_pct)}
            </div>
            <div role="cell" style={{ flex: 1, minWidth: 200 }}>
              <DesgloseCohorte cohorte={c} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── "A quién llamar hoy": lista de clientes, fantasma primero ─────────────
//
// El orden lo fija el backend (fantasma → dormida → sin_cuentas → nueva →
// activa) -- acá NO se reordena por ninguna otra clave. Cada fila lleva el
// `EstadoPill` de la consola (estado de cuenta, ya existente) además del
// badge propio de clasificación, para que el operador vea las dos cosas de
// un vistazo: la cuenta puede estar "activa" en RECABRA y el cliente igual
// ser "fantasma" en el acceso -- son ejes distintos.

function accesoTexto(c: ClienteAdopcion): string {
  if (c.dias_sin_acceso === null) return "nunca entró nadie";
  if (c.dias_sin_acceso === 0) return "acceso hoy";
  return `sin acceso hace ${c.dias_sin_acceso} día${c.dias_sin_acceso === 1 ? "" : "s"}`;
}

function FilaClienteAdopcion({ cliente }: { cliente: ClienteAdopcion }) {
  return (
    <div
      role="row"
      className="con-fila"
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 0", borderBottom: "1px solid var(--con-line-soft)",
      }}
    >
      <div role="cell" style={{ flex: "1.3 1 160px", minWidth: 140, fontSize: 12, fontWeight: 600, color: "var(--con-ink-1)" }}>
        {cliente.nombre}
      </div>
      <div role="cell" style={{ width: 130, flexShrink: 0 }}>
        <ClasificacionPill clasificacion={cliente.clasificacion} />
      </div>
      <div role="cell" style={{ width: 110, flexShrink: 0 }}>
        <EstadoPill estado={cliente.estado_cuenta} />
      </div>
      {cliente.error ? (
        <div role="cell" style={{ flex: "2 1 200px", minWidth: 180, fontSize: 11.5, color: "var(--con-estado-corte)" }}>
          {cliente.error}
        </div>
      ) : (
        <>
          <div role="cell" style={{ flex: "1.6 1 180px", minWidth: 160, fontSize: 11.5, color: "var(--con-ink-3)" }}>
            {accesoTexto(cliente)}
          </div>
          <div role="cell" style={{ width: 130, flexShrink: 0, fontSize: 11, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)", textAlign: "right" }} title="Usuarios con cuenta">
            {cliente.usuarios_con_cuenta} cuenta{cliente.usuarios_con_cuenta === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}

function ListaLlamarHoy({ clientes }: { clientes: ClienteAdopcion[] }) {
  if (clientes.length === 0) {
    return <EstadoVacio texto="No hay clientes registrados para este período." />;
  }
  const fantasmas = clientes.filter((c) => c.clasificacion === "fantasma");
  return (
    <div>
      {fantasmas.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: 11, color: "var(--con-ink-3)" }}>
          {fantasmas.length} cliente{fantasmas.length === 1 ? "" : "s"} fantasma: contratos activos, sin acceso hace 30 días o más -- la señal clásica de una cancelación silenciosa.
        </div>
      )}
      <div>
        {clientes.map((c) => <FilaClienteAdopcion key={c.slug} cliente={c} />)}
      </div>
    </div>
  );
}

// ─── PanelAdopcion ═══════════════════════════════════════════════════════

export function PanelAdopcion({ adopcion, loading, error }: {
  adopcion: Adopcion | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Panel
      titulo="Adopción"
      subtitulo="Cohortes por mes de alta y a quién llamar hoy -- cuentas con contratos activos y ningún acceso reciente (fantasma) son la señal de una cancelación silenciosa."
    >
      {error ? (
        <EstadoError texto={error} />
      ) : loading || !adopcion ? (
        <EstadoVacio texto="Cargando adopción…" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>
              Cohortes por mes de alta
            </h3>
            <TablaCohortes cohortes={adopcion.cohortes} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>
              A quién llamar hoy
            </h3>
            <ListaLlamarHoy clientes={adopcion.clientes} />
          </div>
        </div>
      )}
    </Panel>
  );
}

// Hook chico -- mismo patrón que `useTendencia`: estado + loading + error acá
// mismo, `cargar()` para que Plataforma.tsx dispare la carga cuando toca
// (después de `metricasVersion > 0`, igual que la tendencia: el backend
// calcula `con_contratos_activos` con el mismo caché de métricas de 5 min).
export function useAdopcion() {
  const [adopcion, setAdopcion] = useState<Adopcion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    setError(null);
    getAdopcion()
      .then(setAdopcion)
      .catch((err) => setError(describeError(err, "No se pudo leer la adopción.")))
      .finally(() => setLoading(false));
  };

  return { adopcion, loading, error, cargar };
}
