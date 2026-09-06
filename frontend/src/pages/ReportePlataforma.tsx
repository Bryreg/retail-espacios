import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import {
  getReporteCliente,
  type CatalogoEntrada,
  type ReporteTransparencia,
  type SpreadActualReporte,
} from "../api/plataforma";
import { getMiReportePlataforma } from "../api/derechos";
import { describeError } from "../api/client";
// El tema ya no se lee acá: desde Fase 10 lo pinta `html[data-tema]` (una sola
// llave, `recabra-tema`, ver `src/tema.tsx`) y los `--con-*` cuelgan de ahí.
// La impresión sigue siendo clara SIEMPRE, con `IMPRESION_CLARA_VARS` en el
// `@media print` de más abajo, que no depende del tema de pantalla.
import { EstadoVacio, EstadoError, IMPRESION_CLARA_VARS } from "../components/plataforma/consola";

// ─── /reporte-plataforma y /plataforma/reporte/:slug — Fase 7 (transparencia) ─
//
// Vista imprimible del reporte de auditoría: la contrapartida de haber
// quitado la supresión de celda chica de la consola del operador (Parte A
// de la fase).
// MISMA vista para las dos vías de acceso -- sólo cambia de dónde sale el
// JSON:
//   · `modo="dueno"`     -- `/reporte-plataforma`, `getMiReportePlataforma`
//     (dueño del cliente; el 403 del backend se traduce acá abajo).
//   · `modo="operador"`  -- `/plataforma/reporte/:slug`, `getReporteCliente`
//     (el operador; este acceso también queda en la bitácora del cliente --
//     el reporte SIGUIENTE del dueño lo va a listar en la sección 3).
//
// Página completa, FUERA del layout de sede -- sin Topbar de cliente, sin
// Encabezado de `/plataforma` -- monta directo como ruta hermana de `Dashboard`
// y `Plataforma` en `App.tsx`, con su propio doc-frame. Reusa los tokens
// `--con-*` y `temaInicial()`/`EstadoVacio`/`EstadoError` de la consola
// (territorio ya definido en Fase 4b) para no duplicar sistema visual; el
// tema en pantalla sigue la misma preferencia guardada que `/plataforma` --
// en impresión, siempre claro, sin depender del tema (ver el bloque
// `@media print` más abajo). Sin librerías nuevas.

type Modo = "dueno" | "operador";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});
const formatoCOP = (n: number | null): string => (n === null ? "—" : COP.format(n));
const formatoPct = (n: number | null): string => (n === null ? "—" : `${n.toFixed(1).replace(".", ",")} %`);

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function etiquetaMes(periodo: string): string {
  const [a, m] = periodo.split("-");
  const idx = Number(m) - 1;
  return `${MESES_LARGOS[idx] ?? m} ${a}`;
}

/** Fecha sola, sin hora -- el reporte nunca lleva hora en ninguna fecha de
 *  acceso (frontera de privacidad), y `generado_en`/`aceptada_en` se
 *  muestran igual de simples: es un documento, no un log. */
function soloFecha(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const FINALIDAD_LABEL: Record<CatalogoEntrada["finalidad"], string> = {
  asesoria: "Asesoría",
  salud_cartera: "Salud de cartera",
  cobranza: "Cobranza",
};

const TRATAMIENTO_LABEL: Record<CatalogoEntrada["tratamiento"], string> = {
  exacto: "Exacto",
  saneado: "Saneado",
  sin_hora: "Sin hora",
  conteo: "Conteo",
  relacion: "Relación",
};

/** Acciones tal como las anota `_anotar_consulta` en la bitácora del
 *  registro -- un texto que no está en la lista taxativa se muestra tal
 *  cual llegó (nunca se inventa una etiqueta). */
const ACCION_LABEL: Record<string, string> = {
  metricas: "Consulta de métricas",
  tendencia: "Consulta de tendencia",
  adopcion: "Consulta de adopción",
  clientes: "Listado de clientes",
  supresiones: "Solicitudes de supresión",
  reporte: "Reporte de transparencia",
};
const etiquetaAccion = (a: string): string => ACCION_LABEL[a] ?? a;

function textoSpread(s: SpreadActualReporte): string {
  if (!s.tarifa_configurada) return "Sin tarifa de referencia configurada.";
  if (s.spread_pct === null) return "Sin contratos con tarifa aplicable en el período.";
  const signo = s.spread_pct > 0 ? "+" : s.spread_pct < 0 ? "−" : "";
  const cifra = Math.abs(s.spread_pct).toFixed(1).replace(".", ",");
  return `${signo}${cifra} % vs tarifa de referencia.`;
}

/** Mismo patrón que `descargarMiExport` (api/derechos.ts), pero sin `fetch`:
 *  el reporte ya está en memoria (es el mismo JSON que se está mostrando),
 *  así que sólo hace falta envolverlo en un Blob y disparar la descarga. */
function descargarJSON(reporte: ReporteTransparencia): void {
  const hoy = new Date().toISOString().slice(0, 10);
  const nombre = `recabra-reporte-transparencia-${reporte.cliente.slug}-${hoy}.json`;
  const blob = new Blob([JSON.stringify(reporte, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Estilos locales (documento, no back-office) ────────────────────────────

const selectStyle: React.CSSProperties = {
  height: 30, padding: "0 8px",
  borderRadius: "var(--r-md)", border: "1px solid var(--con-line)",
  background: "var(--con-surface)", color: "var(--con-ink-1)",
  fontSize: 12, fontFamily: "inherit", outline: "none",
};

const botonStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 30, padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--con-line)",
  background: "var(--con-surface)",
  color: "var(--con-ink-2)",
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

/** La forma del botón principal, sin el color: el color lo pone
 *  `.btn-principal` (`index.css`), que es el único lugar donde vive el
 *  amarillo. Un `background` en línea acá le ganaría a la clase y volveríamos a
 *  tener un amarillo que nadie puede contar con un grep. */
const botonSenalStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 30, padding: "0 12px",
  borderRadius: "var(--r-md)",
  fontSize: 12, fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const th: React.CSSProperties = {
  textAlign: "left", padding: "5px 8px", fontSize: 11, fontWeight: 700,
  color: "var(--con-ink-3)", borderBottom: "1px solid var(--con-line)",
  whiteSpace: "nowrap",
};
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = {
  padding: "5px 8px", fontSize: 12, color: "var(--con-ink-2)",
  borderBottom: "1px solid var(--con-line-soft)", verticalAlign: "top",
};
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "var(--font-mono)" };

// ─── Secciones del documento ─────────────────────────────────────────────────

function SeccionCatalogo({ catalogo }: { catalogo: CatalogoEntrada[] }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={tituloSeccion}>1. Qué datos toma la plataforma y para qué</h2>
      <p style={parrafo}>
        Lista completa de los agregados que el operador de la plataforma puede consultar de
        este cliente, de dónde salen y para qué se usan. Ninguna fila de contrato, ningún
        correo ni nombre de usuario final cruza esta frontera.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="reporte-tabla" style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th}>Dato</th>
              <th style={th}>Definición</th>
              <th style={th}>Fuente</th>
              <th style={th}>Finalidad</th>
              <th style={th}>Endpoints</th>
              <th style={th}>Tratamiento</th>
            </tr>
          </thead>
          <tbody>
            {catalogo.map((c) => (
              <tr key={c.clave}>
                <td style={{ ...td, fontWeight: 600, color: "var(--con-ink-1)" }}>{c.nombre}</td>
                <td style={td}>{c.definicion}</td>
                <td style={td}>{c.fuente}</td>
                <td style={td}>{FINALIDAD_LABEL[c.finalidad] ?? c.finalidad}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{c.endpoints.join(", ")}</td>
                <td style={td}>{TRATAMIENTO_LABEL[c.tratamiento] ?? c.tratamiento}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeccionValores({
  reporte,
}: {
  reporte: ReporteTransparencia;
}) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={tituloSeccion}>2. Valores tomados, mes a mes</h2>
      <p style={parrafo}>
        Ventana de {reporte.ventana.meses} meses, de {etiquetaMes(reporte.ventana.desde)} a{" "}
        {etiquetaMes(reporte.ventana.hasta)}. Un mes sin captura no tuvo snapshot guardado --
        no es lo mismo que cero contratos.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="reporte-tabla" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Período</th>
              <th style={thNum}>Contratos</th>
              <th style={thNum}>Ingreso</th>
              <th style={thNum}>Canon prom.</th>
              <th style={thNum}>Ocupación</th>
              <th style={thNum}>Caras</th>
              <th style={thNum}>Usuarios</th>
              <th style={th}>Top proveedores</th>
            </tr>
          </thead>
          <tbody>
            {reporte.valores.map((v) => (
              <tr key={v.periodo}>
                <td style={{ ...td, fontWeight: 600, color: "var(--con-ink-1)" }}>{etiquetaMes(v.periodo)}</td>
                {v.sin_dato ? (
                  <td style={{ ...td, fontStyle: "italic", color: "var(--con-ink-4)" }} colSpan={7}>
                    sin captura
                  </td>
                ) : (
                  <>
                    <td style={tdNum}>{v.contratos_activos ?? "—"}</td>
                    <td style={tdNum}>{formatoCOP(v.canon_total)}</td>
                    <td style={tdNum}>{formatoCOP(v.canon_promedio_mensual)}</td>
                    <td style={tdNum}>{formatoPct(v.ocupacion_pct)}</td>
                    <td style={tdNum}>{v.espacios_comercializables ?? "—"}</td>
                    <td style={tdNum}>{v.usuarios_con_cuenta ?? "—"}</td>
                    <td style={td}>
                      {v.top_proveedores.length > 0
                        ? v.top_proveedores.map((p) => `${p.nombre} (${p.contratos})`).join(", ")
                        : "—"}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reporte.spread_actual && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--con-ink-2)" }}>
          <strong style={{ color: "var(--con-ink-1)" }}>
            Oportunidad de precio · {etiquetaMes(reporte.spread_actual.periodo)}:
          </strong>{" "}
          {textoSpread(reporte.spread_actual)}
          {reporte.spread_actual.contratos_sin_tarifa > 0 && (
            <> {reporte.spread_actual.contratos_sin_tarifa} contrato
              {reporte.spread_actual.contratos_sin_tarifa === 1 ? "" : "s"} sin tarifa aplicable.</>
          )}
        </div>
      )}
    </section>
  );
}

function SeccionAccesos({ reporte }: { reporte: ReporteTransparencia }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={tituloSeccion}>3. Quién lo consultó</h2>
      <p style={parrafo}>
        {reporte.accesos.total} acceso{reporte.accesos.total === 1 ? "" : "s"} del operador de
        la plataforma a los datos de este cliente en la ventana mostrada. Sólo fecha (sin
        hora), correo del operador, acción y período -- nunca qué miró exactamente.
      </p>
      {reporte.accesos.total === 0 ? (
        <EstadoVacio texto="Ningún acceso del operador en la ventana." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="reporte-tabla" style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Operador</th>
                <th style={th}>Acción</th>
                <th style={th}>Período</th>
              </tr>
            </thead>
            <tbody>
              {reporte.accesos.lineas.map((l, i) => (
                <tr key={i}>
                  <td style={td}>{l.fecha}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.operador}</td>
                  <td style={td}>{etiquetaAccion(l.accion)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.periodo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SeccionDerechos({ reporte }: { reporte: ReporteTransparencia }) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={tituloSeccion}>4. Tus derechos</h2>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--con-ink-2)", lineHeight: 1.6 }}>
        <li>{reporte.derechos.export}</li>
        <li>{reporte.derechos.supresion}</li>
        <li>{reporte.derechos.reporte}</li>
        <li>{reporte.derechos.contacto}</li>
      </ul>
    </section>
  );
}

const tituloSeccion: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 14.5, fontWeight: 700, color: "var(--con-ink-1)",
};
const parrafo: React.CSSProperties = {
  margin: "0 0 12px", fontSize: 12, color: "var(--con-ink-3)", lineHeight: 1.5,
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default function ReportePlataforma({ modo }: { modo: Modo }) {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [meses, setMeses] = useState(12);
  const [reporte, setReporte] = useState<ReporteTransparencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = (m: number) => {
    setLoading(true);
    setError(null);
    const pedido = modo === "dueno"
      ? getMiReportePlataforma(m)
      : getReporteCliente(slugParam ?? "", m);
    pedido
      .then(setReporte)
      .catch((err) => {
        // El backend contesta 403 con un `detail` genérico ("no sos el
        // owner") compartido con `/mi-export`/`solicitar-supresion` --
        // `describeError` lo mostraría tal cual. Acá el 403 tiene un único
        // significado posible (esta ruta es del dueño), así que se traduce
        // al mensaje específico de la spec en vez de dejar pasar el genérico.
        if (modo === "dueno" && (err as { response?: { status?: number } })?.response?.status === 403) {
          setError("Sólo el owner del cliente puede generar este reporte.");
          return;
        }
        setError(describeError(err, "No se pudo generar el reporte."));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar(meses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meses, slugParam, modo]);

  const volver = () => navigate(modo === "dueno" ? "/" : "/plataforma");

  return (
    <div
      className="reporte-transparencia"
      style={{ minHeight: "100dvh", background: "var(--con-bg)", color: "var(--con-ink-1)" }}
    >
      {/* Impresión: siempre claro, sin depender del tema de pantalla; oculta
          los controles; tablas sin partirse entre páginas. */}
      <style>{`
        @media print {
          .reporte-controles { display: none !important; }
          .reporte-transparencia {
            ${IMPRESION_CLARA_VARS}
          }
          .reporte-tabla { page-break-inside: avoid; }
        }
      `}</style>

      <div
        className="reporte-controles"
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 20px",
          background: "var(--con-surface)",
          borderBottom: "1px solid var(--con-line)",
        }}
      >
        <button onClick={volver} className="con-focusable" style={botonStyle}>
          <ArrowLeft size={13} /> Volver
        </button>
        <label style={{ fontSize: 11.5, color: "var(--con-ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
          Ventana
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="con-focusable"
            style={selectStyle}
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
          </select>
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} className="con-focusable" style={botonStyle} disabled={!reporte}>
            <Printer size={13} /> Imprimir / Guardar como PDF
          </button>
          {/* El botón principal del reporte: se lleva el amarillo. «Imprimir /
              Guardar como PDF» y «Volver» quedan en tinta — la acción que
              cierra esta pantalla es llevarse el dato. */}
          <button
            onClick={() => reporte && descargarJSON(reporte)}
            className="con-focusable btn-principal"
            style={botonSenalStyle}
            disabled={!reporte}
          >
            <Download size={13} /> Descargar JSON
          </button>
        </div>
      </div>

      <div className="reporte-doc" style={{ maxWidth: 860, margin: "0 auto", padding: "26px 28px 60px" }}>
        {error && <EstadoError texto={error} />}

        {loading && !reporte ? (
          <div style={{ padding: "24px 0" }}>
            <EstadoVacio texto="Generando reporte…" />
          </div>
        ) : reporte && (
          <>
            <header style={{ marginBottom: 26, borderBottom: "1px solid var(--con-line)", paddingBottom: 16 }}>
              <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "var(--con-ink-1)" }}>
                Reporte de transparencia — {reporte.cliente.nombre}
              </h1>
              <div style={{ fontSize: 11.5, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)", marginBottom: 10 }}>
                {reporte.cliente.slug} · generado el {soloFecha(reporte.generado_en)}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--con-ink-2)", lineHeight: 1.6 }}>
                <div>
                  Ventana: {etiquetaMes(reporte.ventana.desde)} a {etiquetaMes(reporte.ventana.hasta)} (
                  {reporte.ventana.meses} meses).
                </div>
                <div>
                  Política de Tratamiento de Datos: versión vigente{" "}
                  <strong>{reporte.politica.version_vigente}</strong>
                  {reporte.politica.version_aceptada ? (
                    <>
                      {" "}· versión aceptada <strong>{reporte.politica.version_aceptada}</strong>{" "}
                      ({soloFecha(reporte.politica.aceptada_en)})
                    </>
                  ) : (
                    " · sin aceptación registrada"
                  )}
                  .
                </div>
                <div>
                  Base legal: {reporte.politica.base_legal} —{" "}
                  <a href={reporte.politica.url} style={{ color: "var(--con-accent)" }}>
                    ver Política de Tratamiento de Datos
                  </a>
                  .
                </div>
              </div>
            </header>

            <SeccionCatalogo catalogo={reporte.catalogo} />
            <SeccionValores reporte={reporte} />
            <SeccionAccesos reporte={reporte} />
            <SeccionDerechos reporte={reporte} />

            <footer style={{ marginTop: 26, paddingTop: 12, borderTop: "1px solid var(--con-line)", fontSize: 10.5, color: "var(--con-ink-4)" }}>
              Política de Tratamiento de Datos versión {reporte.politica.version_vigente} · reporte generado el{" "}
              {soloFecha(reporte.generado_en)}.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
