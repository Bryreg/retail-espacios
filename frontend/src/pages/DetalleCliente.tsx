import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Printer, Search } from "lucide-react";
import {
  getDetalleCliente,
  type DetalleCliente as DetalleClienteShape,
  type EspacioDetalle,
  type Oportunidad,
  type OportunidadCandidato,
  type PrioridadRecomendacion,
  type Recomendacion,
  type TipoRecomendacion,
} from "../api/plataforma";
import { describeError } from "../api/client";
import {
  temaInicial, guardarTema, TemaToggle, type ConsolaTema,
  EstadoVacio, EstadoError, KpiTile,
  Barras, BarraFila,
  TablaScroll,
  IMPRESION_CLARA_VARS,
} from "../components/plataforma/consola";

// ─── /plataforma/clientes/:slug — Fase 8 (asesoría) ─────────────────────────
//
// Detalle por cliente para la sesión de asesoría comercial: espacio por
// espacio, contrato por contrato, con las oportunidades y recomendaciones ya
// calculadas por el backend. Es la vista que abre "el negocio" de un
// supermercado que Fase 4-7 mantuvieron siempre en agregado -- una decisión
// de producto (spec `features/asesoria-detalle/spec.md`), no un accidente.
//
// Página completa, FUERA del layout de sede -- misma familia visual que
// `ReportePlataforma.tsx` y `Plataforma.tsx`: `data-consola-tema`,
// `TemaToggle`, tokens `--con-*`, primitivas de `consola.tsx`. Codificada
// contra el shape VINCULANTE de la spec, no contra una respuesta real (el
// backend lo construye en paralelo).
//
// Orden de secciones, fijado por la spec: Recomendaciones (protagonista) →
// Oportunidades → Espacios → Por tipo → Proveedores → Movimientos. El botón
// "Imprimir recomendaciones" es lo que el asesor le deja al cliente: fuerza
// la MISMA paleta clara que el reporte de transparencia (Fase 7,
// `IMPRESION_CLARA_VARS` en `consola.tsx`) y oculta todo salvo la cabecera,
// Recomendaciones y Oportunidades.

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});
const formatoCOP = (n: number | null): string => (n === null ? "—" : COP.format(n));
const formatoPct = (n: number | null): string => (n === null ? "—" : `${n.toFixed(1).replace(".", ",")} %`);

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function etiquetaMes(periodo: string): string {
  const [a, m] = periodo.split("-");
  const idx = Number(m) - 1;
  return `${MESES_LARGOS[idx] ?? m} ${a}`;
}

/** Fecha "YYYY-MM-DD" -> "DD mmm YYYY", sin pasar por `Date` (evita que el
 *  huso horario local corra el día para una fecha que no lleva hora). */
function formatoFecha(iso: string | null): string {
  if (!iso) return "—";
  const partes = iso.split("-");
  if (partes.length !== 3) return iso;
  const [a, m, d] = partes;
  const idx = Number(m) - 1;
  const mes = MESES_CORTOS[idx] ?? m;
  return `${d} ${mes} ${a}`;
}

/** Fecha sola desde un ISO 8601 con hora (p. ej. `generado_en`) -- nunca la
 *  hora, mismo criterio que el resto de la consola. */
function soloFecha(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const TIPO_RECOMENDACION_LABEL: Record<TipoRecomendacion, string> = {
  espacio_libre: "Espacio libre",
  contrato_por_vencer: "Contrato por vencer",
  precio_bajo_tarifa: "Precio bajo el promedio",
  concentracion_proveedor: "Concentración de proveedor",
  sede_subutilizada: "Sede subutilizada",
  sin_tarifa: "Sin tarifa",
  arranque: "Arranque",
};

const PRIORIDAD_LABEL: Record<PrioridadRecomendacion, string> = {
  alta: "Alta", media: "Media", baja: "Baja",
};

function colorPrioridad(p: PrioridadRecomendacion): string {
  if (p === "alta") return "var(--con-estado-corte)";
  if (p === "media") return "var(--con-estado-aviso)";
  return "var(--con-ink-3)";
}

/** Badge de prioridad: punto + palabra, mismo criterio que `EstadoPill` de la
 *  consola (el color acompaña, nunca reemplaza la palabra). */
function BadgePrioridad({ prioridad }: { prioridad: PrioridadRecomendacion }) {
  const color = colorPrioridad(prioridad);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{PRIORIDAD_LABEL[prioridad]}</span>
    </span>
  );
}

const ESTADO_ESPACIO_LABEL: Record<EspacioDetalle["estado"], string> = {
  ocupado: "Ocupado", libre: "Libre", se_libera: "Se libera",
};
function colorEstadoEspacio(e: EspacioDetalle["estado"]): string {
  if (e === "ocupado") return "var(--con-estado-activo)";
  if (e === "se_libera") return "var(--con-estado-aviso)";
  return "var(--con-accent)";
}
function PillEstadoEspacio({ estado }: { estado: EspacioDetalle["estado"] }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: colorEstadoEspacio(estado), flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>{ESTADO_ESPACIO_LABEL[estado]}</span>
    </span>
  );
}

/** El texto de la oportunidad se arma ACÁ, en el frontend, a partir de los
 *  campos del shape -- nunca viaja como prosa desde el backend (a diferencia
 *  de `Recomendacion.explicacion`, que sí lo hace). Ejemplo de la spec:
 *  "Ofrecer NAVE-PUN-02 (punta) a Alpina a unos $ 900.000". Sin candidato, se
 *  nombra la sede en su lugar; sin precio de referencia (ni de este cliente
 *  ni benchmark), se omite la cláusula de precio en vez de inventar un
 *  monto. */
function textoOportunidad(op: Oportunidad): string {
  const candidato = op.candidatos[0];
  const destino = candidato ? `a ${candidato.proveedor}` : `en ${op.sede}`;
  const precio = op.precio_sugerido !== null ? ` a unos ${formatoCOP(op.precio_sugerido)}` : "";
  return `Ofrecer ${op.codigo} (${op.tipo}) ${destino}${precio}.`;
}

function etiquetaOrigenPrecio(op: Oportunidad): string {
  if (op.precio_sugerido === null) return "sin referencia";
  if (op.origen_precio === "cliente") return "promedio del cliente";
  if (op.origen_precio === "benchmark") return "benchmark de plataforma";
  return "sin referencia";
}

function ChipCandidato({ c }: { c: OportunidadCandidato }) {
  return (
    <span
      title={c.mismo_tipo ? "Ya ocupa un espacio del mismo tipo" : "Ocupa espacios de otro tipo"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 999,
        fontSize: 10.5, whiteSpace: "nowrap",
        border: c.mismo_tipo ? "1px solid var(--con-accent)" : "1px solid var(--con-line)",
        background: c.mismo_tipo ? "var(--con-surface-raised)" : "transparent",
        color: c.mismo_tipo ? "var(--con-accent)" : "var(--con-ink-3)",
        fontWeight: c.mismo_tipo ? 700 : 500,
      }}
    >
      {c.proveedor} · {formatoCOP(c.canon_actual)}
    </span>
  );
}

// ─── Estilos locales (mismo patrón que Plataforma.tsx/ReportePlataforma.tsx) ─

const inputStyle: React.CSSProperties = {
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

// ─── Sección 1 — Recomendaciones (protagonista) ─────────────────────────────

function SeccionRecomendaciones({ recomendaciones }: { recomendaciones: Recomendacion[] }) {
  const total = recomendaciones.reduce((s, r) => s + r.valor_estimado_mensual, 0);
  const conteo = { alta: 0, media: 0, baja: 0 };
  recomendaciones.forEach((r) => { conteo[r.prioridad] += 1; });

  return (
    <section className="detalle-seccion detalle-recomendaciones">
      <h2 style={tituloSeccion}>Recomendaciones</h2>
      <p style={parrafo}>Qué proponerle hoy a este cliente en la sesión de asesoría, priorizado.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <KpiTile
          variante="hero"
          rotulo="Σ valor en juego"
          valor={formatoCOP(total)}
          hint="Suma de canon mensual estimado de todas las recomendaciones."
        />
        <KpiTile
          rotulo="Prioridad alta"
          valor={String(conteo.alta)}
          contexto={`${conteo.media} media · ${conteo.baja} baja`}
        />
      </div>

      {recomendaciones.length === 0 ? (
        <EstadoVacio texto="Sin recomendaciones para este período." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recomendaciones.map((r) => (
            <div
              key={r.id}
              className="detalle-item"
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                padding: "10px 14px",
                border: "1px solid var(--con-line)",
                borderLeft: `3px solid ${colorPrioridad(r.prioridad)}`,
                borderRadius: "var(--r-lg)",
                background: "var(--con-surface-raised)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <BadgePrioridad prioridad={r.prioridad} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--con-ink-1)" }}>
                  {TIPO_RECOMENDACION_LABEL[r.tipo]}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: "var(--con-ink-1)", fontFamily: "var(--font-mono)" }}>
                  {formatoCOP(r.valor_estimado_mensual)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--con-ink-2)", lineHeight: 1.5 }}>{r.explicacion}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Sección 2 — Oportunidades ───────────────────────────────────────────────

function SeccionOportunidades({ oportunidades }: { oportunidades: Oportunidad[] }) {
  const total = oportunidades.reduce((s, o) => s + o.valor_estimado_mensual, 0);

  return (
    <section className="detalle-seccion detalle-oportunidades">
      <h2 style={tituloSeccion}>Oportunidades</h2>
      <p style={parrafo}>
        Espacios libres o que se liberan en el período, con precio sugerido y candidatos de este mismo cliente.
      </p>
      <div style={{ marginBottom: 10, fontSize: 12.5, color: "var(--con-ink-2)" }}>
        <strong style={{ color: "var(--con-ink-1)" }}>Σ valor estimado:</strong> {formatoCOP(total)}
      </div>

      {oportunidades.length === 0 ? (
        <EstadoVacio texto="Sin oportunidades para este período." />
      ) : (
        <TablaScroll minWidth={880}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Sede</th>
                <th style={th}>Tipo</th>
                <th style={th}>Estado</th>
                <th style={thNum}>Precio sugerido</th>
                <th style={th}>Candidatos</th>
                <th style={thNum}>Valor estimado</th>
                <th style={th}>Oportunidad</th>
              </tr>
            </thead>
            <tbody>
              {oportunidades.map((o) => (
                <tr key={o.codigo} className="detalle-item">
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--con-ink-1)" }}>{o.codigo}</td>
                  <td style={td}>{o.sede}</td>
                  <td style={td}>{o.tipo}</td>
                  <td style={td}><PillEstadoEspacio estado={o.estado} /></td>
                  <td style={tdNum}>
                    {formatoCOP(o.precio_sugerido)}
                    <div style={{ fontSize: 10, color: "var(--con-ink-4)", fontFamily: "var(--font-sans)" }}>
                      {etiquetaOrigenPrecio(o)}
                    </div>
                  </td>
                  <td style={td}>
                    {o.candidatos.length === 0 ? (
                      <span style={{ color: "var(--con-ink-4)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {o.candidatos.map((c, i) => <ChipCandidato key={i} c={c} />)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700, color: "var(--con-ink-1)" }}>{formatoCOP(o.valor_estimado_mensual)}</td>
                  <td style={{ ...td, minWidth: 260 }}>{textoOportunidad(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </section>
  );
}

// ─── Sección 3 — Espacios (filtrable) ───────────────────────────────────────

function SeccionEspacios({
  espacios, contratosFueraDelPlano,
}: {
  espacios: EspacioDetalle[];
  contratosFueraDelPlano: number;
}) {
  const [sede, setSede] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const sedes = useMemo(() => Array.from(new Set(espacios.map((e) => e.sede))).sort(), [espacios]);
  const tipos = useMemo(() => Array.from(new Set(espacios.map((e) => e.tipo))).sort(), [espacios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return espacios.filter((e) => {
      if (sede && e.sede !== sede) return false;
      if (tipo && e.tipo !== tipo) return false;
      if (estado && e.estado !== estado) return false;
      if (q) {
        const enCodigo = e.codigo.toLowerCase().includes(q) || e.codigo_corto.toLowerCase().includes(q);
        const enProveedor = e.contrato?.proveedor.toLowerCase().includes(q) ?? false;
        if (!enCodigo && !enProveedor) return false;
      }
      return true;
    });
  }, [espacios, sede, tipo, estado, busqueda]);

  return (
    <section className="detalle-seccion">
      <h2 style={tituloSeccion}>Espacios</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={sede} onChange={(e) => setSede(e.target.value)} className="con-focusable" style={inputStyle} aria-label="Filtrar por sede">
          <option value="">Todas las sedes</option>
          {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="con-focusable" style={inputStyle} aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="con-focusable" style={inputStyle} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="ocupado">Ocupado</option>
          <option value="libre">Libre</option>
          <option value="se_libera">Se libera</option>
        </select>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 8, top: 8, color: "var(--con-ink-4)" }} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o proveedor…"
            className="con-focusable"
            style={{ ...inputStyle, width: "100%", paddingLeft: 26 }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--con-ink-3)", whiteSpace: "nowrap" }}>
          {filtrados.length} de {espacios.length} espacios
        </div>
      </div>

      {contratosFueraDelPlano > 0 && (
        <div style={{ marginBottom: 8, fontSize: 11.5, color: "var(--con-estado-aviso)" }}>
          {contratosFueraDelPlano} contrato{contratosFueraDelPlano === 1 ? "" : "s"} fuera del plano.
        </div>
      )}

      {filtrados.length === 0 ? (
        <EstadoVacio texto="Ningún espacio coincide con el filtro." />
      ) : (
        <TablaScroll minWidth={1040}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Sede</th>
                <th style={th}>Tipo</th>
                <th style={th}>Zona</th>
                <th style={thNum}>Área m²</th>
                <th style={th}>Estado</th>
                <th style={th}>Proveedor</th>
                <th style={th}>Marca</th>
                <th style={thNum}>Canon</th>
                <th style={th}>Inicio</th>
                <th style={th}>Fin</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.codigo}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--con-ink-1)" }}>
                    {e.codigo}{e.cara ? ` (${e.cara})` : ""}
                  </td>
                  <td style={td}>{e.sede}</td>
                  <td style={td}>{e.tipo}</td>
                  <td style={td}>{e.zona ?? "—"}</td>
                  <td style={tdNum}>{e.area_m2 !== null ? e.area_m2.toFixed(1) : "—"}</td>
                  <td style={td}>
                    <PillEstadoEspacio estado={e.estado} />
                    {e.estado === "se_libera" && e.contrato && (
                      <div style={{ fontSize: 10, color: "var(--con-estado-aviso)", marginTop: 2 }}>
                        vence en {e.contrato.dias_para_vencer} día{e.contrato.dias_para_vencer === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td style={td}>{e.contrato?.proveedor ?? "—"}</td>
                  <td style={td}>{e.contrato?.marca ?? "—"}</td>
                  <td style={tdNum}>{e.contrato ? formatoCOP(e.contrato.canon_mensual) : "—"}</td>
                  <td style={td}>{e.contrato ? formatoFecha(e.contrato.inicio) : "—"}</td>
                  <td style={td}>{e.contrato ? formatoFecha(e.contrato.fin) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </section>
  );
}

// ─── Sección 4 — Por tipo ────────────────────────────────────────────────────

function SeccionPorTipo({ resumen }: { resumen: DetalleClienteShape["resumen_por_tipo"] }) {
  return (
    <section className="detalle-seccion">
      <h2 style={tituloSeccion}>Por tipo de espacio</h2>
      {resumen.length === 0 ? (
        <EstadoVacio texto="Sin espacios comercializables en el plano." />
      ) : (
        <TablaScroll minWidth={760}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Tipo</th>
                <th style={thNum}>Total</th>
                <th style={thNum}>Ocupados</th>
                <th style={thNum}>Libres</th>
                <th style={thNum}>Ocupación</th>
                <th style={thNum}>Canon prom.</th>
                <th style={thNum}>Canon mín.</th>
                <th style={thNum}>Canon máx.</th>
                <th style={th}>Tarifa configurada</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => {
                const ocupacionPct = r.total > 0 ? (r.ocupados / r.total) * 100 : null;
                return (
                  <tr key={r.tipo}>
                    <td style={{ ...td, fontWeight: 600, color: "var(--con-ink-1)" }}>{r.tipo}</td>
                    <td style={tdNum}>{r.total}</td>
                    <td style={tdNum}>{r.ocupados}</td>
                    <td style={tdNum}>{r.libres}</td>
                    <td style={tdNum}>{formatoPct(ocupacionPct)}</td>
                    <td style={tdNum}>{formatoCOP(r.canon_promedio)}</td>
                    <td style={tdNum}>{formatoCOP(r.canon_minimo)}</td>
                    <td style={tdNum}>{formatoCOP(r.canon_maximo)}</td>
                    <td style={td}>{r.tarifa_configurada ? "Sí" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </section>
  );
}

// ─── Sección 5 — Proveedores ─────────────────────────────────────────────────

function SeccionProveedores({ proveedores }: { proveedores: DetalleClienteShape["proveedores"] }) {
  return (
    <section className="detalle-seccion">
      <h2 style={tituloSeccion}>Proveedores</h2>
      {proveedores.length === 0 ? (
        <EstadoVacio texto="Sin proveedores con contrato en este cliente." />
      ) : (
        <TablaScroll minWidth={880}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Proveedor</th>
                <th style={thNum}>Espacios</th>
                <th style={thNum}>Participación</th>
                <th style={th}>Tipos</th>
                <th style={th}>Sedes</th>
                <th style={thNum}>Canon total</th>
                <th style={thNum}>Canon prom.</th>
                <th style={th}>Desde</th>
                <th style={thNum}>Por vencer 60d</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.nombre}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--con-ink-1)" }}>{p.nombre}</td>
                  <td style={tdNum}>{p.espacios}</td>
                  <td style={tdNum}>{formatoPct(p.participacion_pct)}</td>
                  <td style={td}>{p.tipos.join(", ")}</td>
                  <td style={td}>{p.sedes.join(", ")}</td>
                  <td style={tdNum}>{formatoCOP(p.canon_total)}</td>
                  <td style={tdNum}>{formatoCOP(p.canon_promedio)}</td>
                  <td style={td}>{formatoFecha(p.desde)}</td>
                  <td style={{ ...tdNum, color: p.contratos_por_vencer_60d > 0 ? "var(--con-estado-aviso)" : "var(--con-ink-2)", fontWeight: p.contratos_por_vencer_60d > 0 ? 700 : 400 }}>
                    {p.contratos_por_vencer_60d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </section>
  );
}

// ─── Sección 6 — Movimientos ──────────────────────────────────────────────────

function SeccionMovimientos({ movimientos }: { movimientos: DetalleClienteShape["movimientos"] }) {
  const maxNeto = useMemo(
    () => movimientos.reduce((m, mv) => Math.max(m, Math.abs(mv.entradas.length - mv.salidas.length)), 1),
    [movimientos]
  );

  return (
    <section className="detalle-seccion">
      <h2 style={tituloSeccion}>Movimientos (12 meses)</h2>

      {movimientos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Barras etiquetaMax={String(maxNeto)}>
            {movimientos.map((mv) => (
              <BarraFila
                key={mv.mes}
                label={mv.mes}
                valor={Math.abs(mv.entradas.length - mv.salidas.length)}
                max={maxNeto}
                texto={`${mv.entradas.length}↑ / ${mv.salidas.length}↓`}
                tono="conteo"
                hint={`${mv.mes}: ${mv.entradas.length} entrada${mv.entradas.length === 1 ? "" : "s"}, ${mv.salidas.length} salida${mv.salidas.length === 1 ? "" : "s"}.`}
              />
            ))}
          </Barras>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {movimientos.map((mv) => {
          const sinNada = mv.entradas.length === 0 && mv.salidas.length === 0;
          return (
            <div key={mv.mes} style={{ borderTop: "1px solid var(--con-line-soft)", paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--con-ink-1)", marginBottom: 4 }}>
                {etiquetaMes(mv.mes)}
              </div>
              {sinNada ? (
                <div style={{ fontSize: 11.5, color: "var(--con-ink-4)", fontStyle: "italic" }}>sin movimientos</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {mv.entradas.map((m, i) => (
                    <div key={`e${i}`} style={{ fontSize: 11.5, color: "var(--con-ink-2)" }}>
                      <span style={{ color: "var(--con-estado-activo)", fontWeight: 700 }}>+ entrada</span>{" "}
                      {m.proveedor} · {m.codigo} · {m.tipo} · {formatoCOP(m.canon_mensual)} · {formatoFecha(m.fecha)}
                      {m.cancelado && <span style={{ color: "var(--con-estado-corte)" }}> · cancelado</span>}
                    </div>
                  ))}
                  {mv.salidas.map((m, i) => (
                    <div key={`s${i}`} style={{ fontSize: 11.5, color: "var(--con-ink-2)" }}>
                      <span style={{ color: "var(--con-estado-corte)", fontWeight: 700 }}>− salida</span>{" "}
                      {m.proveedor} · {m.codigo} · {m.tipo} · {formatoCOP(m.canon_mensual)} · {formatoFecha(m.fecha)}
                      {" · "}{m.motivo === "vencimiento" ? "vencimiento" : "cancelación"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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

export default function DetalleCliente() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugParam ?? "";
  const navigate = useNavigate();

  const [tema, setTema] = useState<ConsolaTema>(temaInicial);
  const toggleTema = () => {
    setTema((prev) => {
      const siguiente: ConsolaTema = prev === "claro" ? "oscuro" : "claro";
      guardarTema(siguiente);
      return siguiente;
    });
  };

  const [periodo, setPeriodo] = useState(mesActual());
  const [detalle, setDetalle] = useState<DetalleClienteShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = (p: string) => {
    setLoading(true);
    setError(null);
    getDetalleCliente(slug, p)
      .then(setDetalle)
      .catch((err) => setError(describeError(err, "No se pudo leer el detalle de este cliente.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (slug) cargar(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, periodo]);

  return (
    <div
      className="detalle-cliente"
      data-consola-tema={tema}
      style={{ minHeight: "100dvh", background: "var(--con-bg)", color: "var(--con-ink-1)" }}
    >
      {/* Impresión ("Imprimir recomendaciones"): lo que el asesor le deja al
          cliente. Misma paleta clara del reporte de transparencia
          (`IMPRESION_CLARA_VARS`), oculta controles y TODAS las secciones
          salvo la cabecera + Recomendaciones + Oportunidades, cada item sin
          partirse entre páginas, y un pie propio. */}
      <style>{`
        @media print {
          .detalle-controles { display: none !important; }
          .detalle-cliente {
            ${IMPRESION_CLARA_VARS}
          }
          .detalle-seccion { display: none !important; }
          .detalle-recomendaciones, .detalle-oportunidades { display: block !important; }
          .detalle-item { page-break-inside: avoid; }
          .detalle-pie-impresion { display: block !important; }
        }
      `}</style>

      <div
        className="detalle-controles"
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 20px",
          background: "var(--con-surface)",
          borderBottom: "1px solid var(--con-line)",
        }}
      >
        <button onClick={() => navigate("/plataforma")} className="con-focusable" style={botonStyle}>
          <ArrowLeft size={13} /> Volver
        </button>

        <label style={{ fontSize: 11.5, color: "var(--con-ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
          Período
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value || mesActual())}
            className="con-focusable"
            style={inputStyle}
          />
        </label>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => slug && navigate(`/plataforma/reporte/${encodeURIComponent(slug)}`)}
            className="con-focusable"
            style={botonStyle}
          >
            <FileText size={13} /> Reporte de transparencia
          </button>
          <button onClick={() => window.print()} className="con-focusable" style={botonStyle} disabled={!detalle}>
            <Printer size={13} /> Imprimir recomendaciones
          </button>
          <TemaToggle tema={tema} onToggle={toggleTema} />
        </div>
      </div>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "22px 20px 60px", display: "flex", flexDirection: "column", gap: 26 }}>
        {error && <EstadoError texto={error} />}

        {loading && !detalle ? (
          <EstadoVacio texto="Cargando detalle…" />
        ) : detalle && (
          <>
            <header style={{ borderBottom: "1px solid var(--con-line)", paddingBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "var(--con-ink-1)" }}>
                  {detalle.cliente.nombre}
                </h1>
                <span style={{ fontSize: 11.5, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)" }}>
                  {detalle.cliente.slug}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>
                  {detalle.cliente.estado_cuenta}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--con-ink-3)" }}>
                Período {etiquetaMes(detalle.periodo)} ({detalle.desde} a {detalle.hasta}) · generado el {soloFecha(detalle.generado_en)}
              </div>
            </header>

            {detalle.sedes_con_plano === 0 && (
              <EstadoVacio texto="Sin plano cargado." />
            )}

            <SeccionRecomendaciones recomendaciones={detalle.recomendaciones} />
            <SeccionOportunidades oportunidades={detalle.oportunidades} />
            <SeccionEspacios espacios={detalle.espacios} contratosFueraDelPlano={detalle.contratos_fuera_del_plano} />
            <SeccionPorTipo resumen={detalle.resumen_por_tipo} />
            <SeccionProveedores proveedores={detalle.proveedores} />
            <SeccionMovimientos movimientos={detalle.movimientos} />

            <div
              className="detalle-pie-impresion"
              style={{ display: "none", marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--con-line)", fontSize: 10.5, color: "var(--con-ink-4)" }}
            >
              RECABRA · Recomendaciones de asesoría · {etiquetaMes(detalle.periodo)} · generado {soloFecha(detalle.generado_en)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
