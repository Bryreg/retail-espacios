import { Fragment, useEffect, useMemo, useState } from "react";
import { Layers, PenTool } from "lucide-react";
import { describeError } from "../../api/client";
import type { ParametrosDeResumen, ResumenOut } from "../../api/participaciones";
import { useAuthStore } from "../../store/authStore";
import { useFixtureStore } from "../../store/fixtureStore";
import { claveDeResumen, useOcupacionStore } from "../../store/ocupacionStore";
import { pct } from "../../utils/participaciones";
import {
  DIAS_DE_APURO, PALABRA_DE_LA_DISTRIBUCION, cuantasParaRevisar, fechaCorta, huerfanosDelEstado, paraRevisarDeResumen,
  rotuloDeCara, type MuebleDelPlano, type SeccionDeRevision,
} from "../../utils/revisarParticipaciones";
import { useAbrirEnDistribucion } from "./ParticipacionesDeLaCara";
import { Mira } from "../Supervisar/piezas";

/**
 * Las participaciones de cara en Supervisar (§11): las tarjetas de «Para
 * revisar» (`RevisarParticipaciones`) y la tabla «Participaciones de cara»
 * (`TablaDeParticipaciones`). Las dos leen `GET /participaciones/resumen`
 * por el store de LECTURA (`ocupacionStore`, que lo guarda en caché por
 * cliente y sede y lo olvida cuando una escritura de participaciones vuelve) y
 * dicen lo que sale de `utils/revisarParticipaciones.ts`, puro y probado.
 *
 * SÓLO ADMINISTRACIÓN: el resumen lleva proveedores y marcas, y la ruta es de
 * administración (al trabajador le daría 403 en pantalla). Quien los monta los
 * pone adentro de `isAdmin &&`, y el hook no pide nada si no está `activo`
 * (guardas estáticas en `probar-comercial.mjs`). Nunca en Vender.
 */

/** Los pedidos de resumen en vuelo, por clave: la tarjeta y la tabla piden el
 *  mismo resumen al montarse, y el store guarda sólo lo que ya llegó. */
const enVuelo = new Map<string, Promise<unknown>>();

/** El resumen de la sede (con esos filtros), leído una vez y vuelto a leer
 *  cuando el store lo olvida. `null` mientras no llega o si no está activo. */
function useResumen(params: ParametrosDeResumen, activo: boolean): { r: ResumenOut | null; error: string | null } {
  const cliente = useAuthStore((s) => s.cliente) ?? "";
  const clave = claveDeResumen(cliente, params);
  const r = useOcupacionStore((s) => (activo ? s.resumen[clave] ?? null : null));
  const cargarResumen = useOcupacionStore((s) => s.cargarResumen);
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null);
  useEffect(() => {
    if (!activo || r) return;
    let vivo = true;
    let pedido = enVuelo.get(clave);
    if (!pedido) {
      pedido = cargarResumen(params).finally(() => enVuelo.delete(clave));
      enVuelo.set(clave, pedido);
    }
    pedido
      .then(() => { if (vivo) setError(null); })
      .catch((e) => { if (vivo) setError({ clave, texto: describeError(e, "No se pudo leer el resumen de las participaciones.") }); });
    return () => { vivo = false; };
    // `params` entra por su clave: un objeto nuevo con lo mismo no vuelve a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, r, clave, cargarResumen]);
  return { r, error: error && error.clave === clave ? error.texto : null };
}

/**
 * Las tarjetas de «Para revisar» de las participaciones de la sede, y cuántas
 * cosas hay (lo que suma la cuenta de la tarjeta). `activo` es `isAdmin` y que
 * la sede tenga alguna cara por participación: sin eso no se pide nada.
 */
export function useRevisionDeParticipaciones({ sede, activo, muebles }: {
  sede: string; activo: boolean; muebles: readonly MuebleDelPlano[];
}): { secciones: SeccionDeRevision[]; total: number } {
  const { r } = useResumen({ sede }, activo);
  const estado = useFixtureStore((s) => s.estadoComercial);
  const secciones = useMemo(
    () => (r ? paraRevisarDeResumen(r, muebles, huerfanosDelEstado(estado, r)) : []),
    [r, muebles, estado],
  );
  return { secciones, total: cuantasParaRevisar(secciones) };
}

/** Lo que dice el botón de cada renglón: es el mismo camino —abrir la cara en
 *  el Editor 3D, en Distribución— con la palabra de lo que hay que hacer ahí
 *  (hoja de piezas del rediseño: «Distribuir», «Revisar»). */
function textoDelBoton(tipo: SeccionDeRevision["tipo"]): string {
  return tipo === "sin_dibujar" ? "Distribuir"
    : tipo === "para_revisar" || tipo === "con_problemas" ? "Revisar"
    : "Abrir en Distribución";
}

/** Las tarjetas, una por sección con algo, cada renglón con «Abrir en
 *  Distribución» cuando hay un mueble del plano que abrir. Supervisar las
 *  reparte en sus tres grupos (`components/Supervisar/paraRevisar.ts`) y le
 *  pasa a cada grupo sólo lo suyo; el título de la sección puede cambiar con
 *  el grupo (`tituloDe`). */
export default function RevisarParticipaciones({ secciones, tituloDe }: {
  secciones: readonly SeccionDeRevision[];
  tituloDe?: (s: SeccionDeRevision) => string;
}) {
  const abrir = useAbrirEnDistribucion("supervisar");
  if (secciones.length === 0) return null;
  return (
    <div data-revisar-participaciones style={{ display: "flex", flexDirection: "column" }}>
      {secciones.map((s) => (
        <div key={s.tipo} data-seccion={s.tipo}>
          <div className="sec-r">
            <span className="rotulo">{tituloDe ? tituloDe(s) : s.titulo} · <b>{s.items.length}</b></span>
          </div>
          {s.items.map((it) => {
            // «Falta distribuir»: cuántos días faltan para que empiece, en la
            // pastilla del renglón; roja con 7 días o menos, porque ahí ya hay
            // alguien que pagó y espera ver su exhibición. Una reserva, cuántos
            // le quedan antes de caducar.
            const dias = it.caducaEn ?? it.empiezaEn;
            const apuro = dias !== undefined && dias <= (it.caducaEn !== undefined ? 0 : DIAS_DE_APURO);
            return (
              <div key={it.clave} className="fila-r" data-aviso={`pc:${it.clave}`}>
                <span
                  className={`pill mono ${dias === undefined ? "resto" : apuro ? "ocupado" : "entra"}`}
                  title={it.empiezaEn !== undefined
                    ? (it.empiezaEn <= 0 ? "Ya corre" : `Empieza en ${it.empiezaEn} día${it.empiezaEn === 1 ? "" : "s"}`)
                    : undefined}
                >
                  {dias === undefined ? "—" : it.caducaEn !== undefined
                    ? (it.caducaEn <= 0 ? "hoy" : `${it.caducaEn}d`)
                    : dias <= 0 ? "corre" : `${dias}d`}
                </span>
                <div className="dat">
                  {it.rotulo && <b className="mono">{it.rotulo}</b>}
                  <span>{it.frase}</span>
                </div>
                {it.abrir && (
                  <button
                    type="button"
                    className="btn-s"
                    onClick={() => abrir(it.abrir!.fixtureId, it.abrir!.cara)}
                    title="Abrir en Distribución: el 3D del plano en esta cara"
                  >
                    <PenTool size={16} strokeWidth={1.75} aria-hidden /> {textoDelBoton(s.tipo)}
                  </button>
                )}
                <Mira />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** La clase de la pastilla de cada estado de la distribución. */
const PASTILLA_DE_LA_DISTRIBUCION: Record<keyof typeof PALABRA_DE_LA_DISTRIBUCION, "libre" | "entra" | "ocupado"> = {
  confirmada: "libre",
  sin_distribuir: "entra",
  borrador: "entra",
  para_revisar: "entra",
  sin_mueble: "ocupado",
};

const celda: React.CSSProperties = {
  padding: "6px 8px", borderTop: "1px solid var(--line-soft)", fontSize: "var(--t-2xs)",
  color: "var(--ink-2)", whiteSpace: "nowrap",
};
const cifra: React.CSSProperties = { ...celda, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-1)" };
const encabezado: React.CSSProperties = {
  padding: "6px 8px", fontSize: "var(--t-3xs)", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--ink-3)", textAlign: "left", whiteSpace: "nowrap",
};
const campo: React.CSSProperties = {
  height: 28, padding: "0 6px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)",
  background: "var(--surface)", color: "var(--ink-1)", fontFamily: "inherit", fontSize: "var(--t-2xs)",
};

/**
 * La tabla «Participaciones de cara» (D18): por cara, lo comprometido el día,
 * el pico y lo disponible del período, lo dibujado el día y el estado de la
 * distribución, con filtro por proveedor, día y período. Es una tabla (la leen
 * los lectores de pantalla); la única figura de las participaciones es la
 * barra de la ficha. Los totales son de UN día: dos participaciones con fechas
 * que no se cruzan pueden ocupar la misma región, y sumarlas daría más de 100 %.
 */
export function TablaDeParticipaciones({ sede, muebles }: { sede: string; muebles: readonly MuebleDelPlano[] }) {
  const abrir = useAbrirEnDistribucion("supervisar");
  const [dia, setDia] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [proveedor, setProveedor] = useState("");
  const params: ParametrosDeResumen = {
    sede,
    ...(dia ? { dia } : {}), ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}),
    ...(proveedor ? { proveedor_id: Number(proveedor) } : {}),
  };
  const { r, error } = useResumen(params, true);
  // Los proveedores del filtro salen del resumen sin filtros: con uno elegido,
  // la lista no se achica a ése solo.
  const { r: todos } = useResumen({ sede }, true);
  const porCodigo = useMemo(() => new Map(muebles.map((m) => [m.code.trim().toUpperCase(), m])), [muebles]);

  return (
    <div data-tabla-participaciones style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 15px 8px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
          Proveedor
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={campo} aria-label="Filtrar por proveedor">
            <option value="">Todos</option>
            {(todos?.por_proveedor ?? []).map((p) => (
              <option key={p.proveedor_id} value={String(p.proveedor_id)}>{p.proveedor}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
          Día
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} style={campo} aria-label="Día del informe" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
          Período
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={campo} aria-label="Desde" />
          <span>→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={campo} aria-label="Hasta" />
        </label>
        {r && (
          <span style={{ marginLeft: "auto", fontSize: "var(--t-3xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            el día {fechaCorta(r.dia, r.hoy)} · período {fechaCorta(r.desde, r.hoy)} → {fechaCorta(r.hasta, r.hoy)}
          </span>
        )}
      </div>
      {error && <div style={{ padding: "0 15px 8px", fontSize: "var(--t-2xs)", color: "var(--danger)" }}>{error}</div>}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 7px 10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption style={{ textAlign: "left", padding: "0 8px 4px", fontSize: "var(--t-3xs)", color: "var(--ink-3)" }}>
            Lo comprometido y lo dibujado son del día; el pico y lo disponible, del período.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={encabezado}>Sede</th>
              <th scope="col" style={encabezado}>Mueble</th>
              <th scope="col" style={encabezado}>Cara</th>
              <th scope="col" style={{ ...encabezado, textAlign: "right" }}>Comprometido el día</th>
              <th scope="col" style={{ ...encabezado, textAlign: "right" }}>Pico del período</th>
              <th scope="col" style={{ ...encabezado, textAlign: "right" }}>Disponible</th>
              <th scope="col" style={{ ...encabezado, textAlign: "right" }}>Dibujado el día</th>
              <th scope="col" style={encabezado}>Estado</th>
              <th scope="col" style={encabezado} aria-label="Abrir en Distribución" />
            </tr>
          </thead>
          <tbody>
            {!r && !error && (
              <tr><td colSpan={9} style={celda}>Cargando…</td></tr>
            )}
            {r && r.caras.length === 0 && (
              <tr><td colSpan={9} style={celda}>Ninguna cara por participación con esos filtros.</td></tr>
            )}
            {r?.caras.map((c) => {
              const mueble = porCodigo.get((c.fixture_code ?? "").trim().toUpperCase());
              return (
                <tr key={c.codigo_cara}>
                  <td style={celda}>{r.sede}</td>
                  <td style={{ ...celda, color: "var(--ink-1)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{c.fixture_code}</span>
                    {c.rotulo && c.rotulo !== c.fixture_code ? <span style={{ color: "var(--ink-3)" }}> · {c.rotulo}</span> : null}
                  </td>
                  <td style={celda}>{c.cara}</td>
                  <td style={cifra}>{pct(c.comprometido_dia_pb)}</td>
                  <td style={cifra}>
                    {pct(c.pico_pb)}
                    {c.dia_pico && c.pico_pb > 0 ? <span style={{ color: "var(--ink-3)" }}> · {fechaCorta(c.dia_pico, r.hoy)}</span> : null}
                  </td>
                  <td style={cifra}>{pct(c.disponible_pb)}</td>
                  <td style={cifra}>
                    {pct(c.dibujado_dia_pb)}
                    {c.pendiente_dia_pb > 0 ? <span style={{ color: "var(--ink-3)" }}> · falta {pct(c.pendiente_dia_pb)}</span> : null}
                  </td>
                  <td style={celda}>
                    {/* El estado de la distribución, en pastilla (rediseño, PR 2):
                        confirmada en verde, lo que falta en ámbar, lo que no
                        cuadra en rojo; la palabra va siempre adentro. */}
                    <span className="celda-pills">
                      <span className={`pill ${PASTILLA_DE_LA_DISTRIBUCION[c.estado_distribucion]}`}>
                        {PALABRA_DE_LA_DISTRIBUCION[c.estado_distribucion]}
                      </span>
                      {c.errores > 0 ? <span className="pill ocupado">{c.errores} problema{c.errores === 1 ? "" : "s"}</span> : null}
                    </span>
                  </td>
                  <td style={celda}>
                    {mueble && (
                      <button
                        type="button"
                        onClick={() => abrir(mueble.id, c.cara)}
                        aria-label={`Abrir ${rotuloDeCara(c.fixture_code, c.cara, mueble)} en Distribución`}
                        title="Abrir en Distribución"
                        style={{
                          height: 22, width: 26, borderRadius: "var(--r-sm)", border: "1px solid var(--line)",
                          background: "var(--surface-2)", color: "var(--ink-2)", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Layers size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {r && r.por_proveedor.length > 0 && (
          <div style={{ padding: "10px 8px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ ...encabezado, padding: 0 }}>Por proveedor, el día</span>
            {r.por_proveedor.map((p) => (
              <Fragment key={p.proveedor_id}>
                <span style={{ fontSize: "var(--t-2xs)", color: "var(--ink-2)" }}>
                  <b style={{ color: "var(--ink-1)" }}>{p.proveedor}</b>
                  {" · "}{p.participaciones} participación{p.participaciones === 1 ? "" : "es"} en {p.caras} cara{p.caras === 1 ? "" : "s"}
                  {" · "}{p.m2_contratados_dia.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m² contratados
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
