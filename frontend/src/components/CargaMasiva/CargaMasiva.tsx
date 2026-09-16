import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload, X,
} from "lucide-react";
import { confirmarLote, validarLote, type FilaRevisada, type Revision } from "../../api/bulkLeases";
import { describeError } from "../../api/client";
import { descargarPlantilla, leerPlanilla, type FilaPlanilla, type LecturaPlanilla } from "../../utils/planilla";
import { useModalAbierto } from "../../tema";

/**
 * Cargar una tanda de contratos desde la planilla de la reunión comercial.
 *
 * El flujo es leer → revisar → confirmar, y el paso del medio es el que importa:
 * lo que se sube es un archivo escrito a mano, con códigos mal tipeados y el
 * mismo espacio vendido dos veces. Crear cuarenta contratos y después descubrir
 * el error no tiene botón de deshacer, así que primero se muestra fila por fila
 * qué entendió el servidor y con qué choca, y recién ahí se guarda.
 *
 * Las filas con error no se pueden marcar. Las demás vienen marcadas y se pueden
 * desmarcar: la revisión es de la persona, no del validador.
 */

type Paso = "archivo" | "revision" | "listo";

const money = (n?: number | null) =>
  n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CO");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]}`;
}

const PINTA: Record<FilaRevisada["estado"], { fondo: string; borde: string; color: string; texto: string }> = {
  ok:     { fondo: "var(--surface)",    borde: "var(--line-soft)",   color: "var(--success)", texto: "Lista" },
  aviso:  { fondo: "var(--warning-50)", borde: "var(--line)",        color: "var(--warning)", texto: "Revisar" },
  error:  { fondo: "var(--danger-50)",  borde: "var(--line)",        color: "var(--danger)",  texto: "No entra" },
};

export interface ResultadoCarga {
  creados: FilaRevisada[];
}

export default function CargaMasiva({
  sede, onCerrar, onGuardado,
}: {
  /** La sede activa: las filas que no traigan la suya caen acá. */
  sede: string;
  onCerrar: () => void;
  /** Los contratos quedaron creados: hay que escribirlos en el plano para que
   *  el mapa los pinte, igual que al vender de a uno. */
  onGuardado: (resultado: ResultadoCarga) => void;
}) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [archivo, setArchivo] = useState<string>("");
  const [lectura, setLectura] = useState<LecturaPlanilla | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [creados, setCreados] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mientras la carga masiva está abierta, ELLA es la pantalla: se lleva el
  // amarillo y el «Guardar contrato y avisar» de Vender pasa a tinta.
  useModalAbierto();

  const porFila = useMemo(() => {
    const m = new Map<number, FilaPlanilla>();
    (lectura?.filas ?? []).forEach((f) => m.set(f.fila, f));
    return m;
  }, [lectura]);

  const tomar = useCallback(async (f: File | null) => {
    if (!f) return;
    setError("");
    setOcupado(true);
    try {
      const leido = await leerPlanilla(f);
      setArchivo(f.name);
      setLectura(leido);
      if (leido.faltan.length) {
        setError(
          "Faltan columnas obligatorias: " + leido.faltan.join(", ") +
          ". Descargá la plantilla para ver el formato.",
        );
        setOcupado(false);
        return;
      }
      if (!leido.filas.length) {
        setError("No encontré ninguna fila con datos debajo de los encabezados.");
        setOcupado(false);
        return;
      }
      const rev = await validarLote(sede, leido.filas);
      setRevision(rev);
      // Todo lo que puede entrar arranca marcado; los errores ni se pueden.
      setElegidas(new Set(rev.filas.filter((x) => x.estado !== "error").map((x) => x.fila)));
      setPaso("revision");
    } catch (e) {
      setError(e instanceof Error && !("response" in e)
        ? e.message
        : describeError(e, "No se pudo leer la planilla."));
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [sede]);

  async function guardar() {
    if (!revision || !elegidas.size || ocupado) return;
    setOcupado(true);
    setError("");
    try {
      const filas = revision.filas
        .filter((r) => elegidas.has(r.fila))
        .map((r) => porFila.get(r.fila))
        .filter(Boolean) as FilaPlanilla[];
      const res = await confirmarLote(sede, filas);
      setCreados(res.creados);
      // Sólo lo que el servidor confirmó, y con lo que él resolvió: si entre la
      // revisión y el botón alguien vendió uno de esos espacios, esa fila no
      // vuelve y el plano no debe pintarla.
      onGuardado({ creados: res.filas.filter((f) => f.estado !== "error" && elegidas.has(f.fila)) });
      setPaso("listo");
    } catch (e) {
      setError(describeError(e, "No se pudieron guardar los contratos."));
    } finally {
      setOcupado(false);
    }
  }

  const marcadas = revision?.filas.filter((r) => elegidas.has(r.fila)) ?? [];
  const total = marcadas.reduce((a, r) => a + (r.valor || 0), 0);

  return (
    <div
      data-capa-modal
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(26,24,20,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}
    >
      <div
        style={{
          width: "min(1080px, 100%)", maxHeight: "100%",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", borderRadius: "var(--r-2xl)",
          border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <FileSpreadsheet size={17} style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Cargar contratos desde una planilla</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 1 }}>
              {paso === "archivo"
                ? `Excel o CSV · las filas sin sede caen en ${sede}`
                : archivo}
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: ocupado ? "wait" : "pointer", color: "var(--ink-3)", padding: 4 }}
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Paso 1: el archivo ───────────────────────────────────────── */}
        {paso === "archivo" && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                padding: "36px 20px", cursor: ocupado ? "wait" : "pointer",
                borderRadius: "var(--r-xl)", border: "1px dashed var(--line-strong)",
                background: "var(--surface-2)", textAlign: "center",
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (!ocupado) tomar(e.dataTransfer.files?.[0] ?? null); }}
            >
              {ocupado ? (
                <Loader2 size={26} style={{ color: "var(--accent)", animation: "spin .9s linear infinite" }} />
              ) : (
                <Upload size={26} style={{ color: "var(--accent)" }} />
              )}
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink-1)" }}>
                {ocupado ? "Leyendo…" : "Arrastrá el archivo o tocá para elegirlo"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 460 }}>
                Se aceptan <b>.xlsx</b>, <b>.xls</b> y <b>.csv</b>. Los encabezados se reconocen
                solos —«Código» o «Espacio», «Valor» o «Renta»— y la fila de títulos no tiene
                que ser la primera.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: "none" }}
                disabled={ocupado}
                onChange={(e) => tomar(e.target.files?.[0] ?? null)}
              />
            </label>

            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "11px 13px", borderRadius: "var(--r-lg)",
                background: "var(--accent-50)", border: "1px solid var(--accent-200)",
              }}
            >
              <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {/* Decía «Valor mensual», y desde la fase 17 el valor NO es
                    mensual: es lo acordado por el periodo, tal como se teclea,
                    sin prorratear. Llamarlo mensual acá invitaba a escribir una
                    tarifa de mes para un contrato de diez días. El lector de
                    encabezados acepta igual «valor mensual», «precio», «canon»,
                    «monto» y «tarifa», así que ninguna planilla ya hecha se
                    rompe por esto. */}
                Columnas: <b>Espacio</b>, Sede, <b>Proveedor</b>, Correo, Marca,
                {" "}<b>Valor</b>, <b>Desde</b>, <b>Hasta</b> y Nota.
                Las fechas se leen <b>día primero</b>: 15/09/2026 es el 15 de
                septiembre. Sirve con <b>/</b>, <b>-</b> o <b>.</b>, y también
                2026-09-15 (año-mes-día). El valor es{" "}
                <b>lo acordado por el periodo</b>, no una tarifa mensual.
                La plantilla trae las instrucciones completas en su segunda pestaña.
              </div>
              <button
                onClick={() => descargarPlantilla(sede)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 32, padding: "0 13px", borderRadius: "var(--r-md)",
                  border: "1px solid var(--accent-200)", background: "var(--surface)",
                  color: "var(--accent-700)", fontSize: 12.5, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <Download size={13} /> Descargar la plantilla
              </button>
            </div>

            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "var(--danger)", lineHeight: 1.5 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}
          </div>
        )}

        {/* ── Paso 2: la revisión ──────────────────────────────────────── */}
        {paso === "revision" && revision && (
          <>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                padding: "10px 18px", borderBottom: "1px solid var(--line-soft)",
                background: "var(--surface-2)", fontSize: 12.5,
              }}
            >
              <span><b style={{ color: "var(--success)" }}>{revision.ok}</b> listas</span>
              <span><b style={{ color: "var(--warning)" }}>{revision.avisos}</b> con avisos</span>
              <span><b style={{ color: "var(--danger)" }}>{revision.errores}</b> no entran</span>
              {lectura?.ignoradas.length ? (
                <span style={{ marginLeft: "auto", color: "var(--ink-3)" }}>
                  Columnas ignoradas: {lectura.ignoradas.join(", ")}
                </span>
              ) : null}
            </div>

            {/* «Entra, pero se mira» es una categoría propia y hasta acá se
                dependía de que alguien notara un fondo ámbar entre veinte
                renglones. Una fila con aviso se guarda igual —tiene que poder
                guardarse: los dos muebles existen y contratar los dos es
                legítimo—, así que el aviso no puede vivir sólo en el color. */}
            {revision.avisos > 0 && (
              <div
                style={{
                  display: "flex", gap: 9, alignItems: "flex-start",
                  padding: "10px 18px", background: "var(--warning-50)",
                  borderBottom: "1px solid var(--warning-100)",
                  fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5,
                }}
              >
                <AlertTriangle size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>{revision.avisos}</b>{" "}
                  {revision.avisos === 1 ? "fila entra igual" : "filas entran igual"}, pero hay
                  algo que mirar antes de guardar. {revision.avisos === 1 ? "Está" : "Están"} en
                  ámbar, con el aviso completo debajo del renglón: si no es lo que quisiste,
                  desmarcá{revision.avisos === 1 ? "la" : "las"} y arreglá la planilla.
                </span>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "var(--surface-3)" }}>
                    {/* «Nombre dibujado» va pegado al código a propósito: son los
                        dos nombres del mismo mueble, y verlos separados es lo que
                        dejó firmar dos veces el mismo espacio. */}
                    {["", "Fila", "Espacio", "Nombre dibujado", "Proveedor", "Periodo", "Valor", "Estado"].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          textAlign: i === 6 ? "right" : "left",
                          padding: "8px 10px", fontSize: 10, fontWeight: 700,
                          letterSpacing: "0.06em", textTransform: "uppercase",
                          color: "var(--ink-3)", position: "sticky", top: 0,
                          background: "var(--surface-3)", whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {revision.filas.map((r) => {
                    const pinta = PINTA[r.estado];
                    const puede = r.estado !== "error";
                    const marcada = elegidas.has(r.fila);
                    // El mueble se resolvió cuando el servidor pudo decir de qué
                    // TIPO es: `nombre` sale del mueble del plano, nunca de la
                    // planilla. Una fila que no entra por choque de fechas SÍ
                    // tiene mueble resuelto —y es justo cuando hace falta ver
                    // cuál era—; una ambigua o un código que no existe, no.
                    const resuelto = puede || Boolean(r.nombre) || Boolean(r.nombre_dibujado);
                    // El aviso se lee entero, en su propio renglón y a todo el
                    // ancho: metido en la última celda, un mensaje que nombra el
                    // otro mueble caía en seis líneas de columna angosta.
                    const cuerpoFila = {
                      background: pinta.fondo,
                      opacity: puede && !marcada ? 0.55 : 1,
                    };
                    // «Entra sin que haya nada que mirar» es lo único que se
                    // lee de corrido: lo demás lleva barra al costado y el aviso
                    // en su propio renglón.
                    const puedeSinMirar = r.estado === "ok";
                    const barra = puedeSinMirar ? undefined : `inset 3px 0 0 ${pinta.color}`;
                    return (
                      <Fragment key={r.fila}>
                      <tr
                        style={{
                          ...cuerpoFila,
                          borderBottom: r.mensajes.length ? "none" : "1px solid var(--line-soft)",
                        }}
                      >
                        <td style={{ padding: "8px 10px", width: 30, boxShadow: barra }}>
                          <input
                            type="checkbox"
                            checked={marcada}
                            disabled={!puede}
                            onChange={(e) => {
                              const s = new Set(elegidas);
                              if (e.target.checked) s.add(r.fila); else s.delete(r.fila);
                              setElegidas(s);
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
                          {r.fila}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {r.codigo || "—"}
                          </div>
                          {r.nombre && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.nombre}</div>}
                        </td>
                        {/* Cómo se llama ese mueble EN EL PLANO. Cuando alguien le
                            puso un nombre a mano, es el único campo de la fila que
                            la persona reconoce: el código se lo devuelve el
                            servidor tal como ella lo tecleó, y el nombre de arriba
                            es el del tipo de mueble, igual en los cuarenta. */}
                        <td style={{ padding: "8px 10px" }}>
                          {r.nombre_dibujado ? (
                            <>
                              <div style={{
                                fontFamily: "var(--font-mono)", fontWeight: 700,
                                whiteSpace: "nowrap", color: "var(--warning)",
                              }}>
                                {r.nombre_dibujado}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                                así lo dibuja el plano
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                              {/* «—» es «no hay mueble del que hablar», y eso pasa
                                  cuando el código es ambiguo o no existe. Una fila
                                  rechazada por choque de fechas SÍ tiene mueble
                                  resuelto: decirle «—» le escondía a la persona
                                  contra cuál chocó, que es lo único que quería ver. */}
                              {resuelto ? "se dibuja con su código" : "—"}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600 }}>{r.proveedor || "—"}</div>
                          {r.marca && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.marca}</div>}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {fechaCorta(r.desde)} → {fechaCorta(r.hasta)}
                          {r.dias ? <span style={{ color: "var(--ink-3)" }}> · {r.dias}d</span> : null}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                          {money(r.valor)}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 999,
                              fontSize: 10.5, fontWeight: 700, color: pinta.color,
                              border: `1px solid ${pinta.borde}`, background: "var(--surface)",
                            }}
                          >
                            {pinta.texto}
                          </span>
                        </td>
                      </tr>
                      {r.mensajes.length > 0 && (
                        <tr style={{ ...cuerpoFila, borderBottom: "1px solid var(--line-soft)" }}>
                          <td style={{ boxShadow: barra }} />
                          <td colSpan={7} style={{ padding: "0 10px 9px" }}>
                            {/* Una fila limpia también dice cosas —«proveedor
                                nuevo»— y ésas NO llevan el triángulo ni el color
                                del estado: si el aviso de una fila que hay que
                                mirar se pinta igual que una nota de trámite, en
                                una planilla de temporada entera se aprende a
                                saltear los dos. */}
                            <div style={{
                              display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12,
                              color: puedeSinMirar ? "var(--ink-3)" : pinta.color,
                              lineHeight: 1.5, maxWidth: 780,
                            }}>
                              {!puedeSinMirar && (
                                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                              )}
                              <span>{r.mensajes.join(" ")}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "12px 18px", borderTop: "1px solid var(--line)",
              }}
            >
              <div style={{ fontSize: 13 }}>
                <b>{marcadas.length}</b> contrato{marcadas.length === 1 ? "" : "s"} por guardar
                {total > 0 && (
                  <span style={{ color: "var(--ink-3)" }}>
                    {" · "}
                    <b style={{ fontFamily: "var(--font-mono)", color: "var(--success)" }}>{money(total)}</b> al mes
                  </span>
                )}
              </div>
              {error && (
                <span style={{ fontSize: 12, color: "var(--danger)", maxWidth: 420 }}>{error}</span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setPaso("archivo"); setRevision(null); setError(""); }}
                  disabled={ocupado}
                  style={{
                    height: 38, padding: "0 15px", borderRadius: "var(--r-lg)",
                    border: "1px solid var(--line)", background: "var(--surface)",
                    color: "var(--ink-2)", fontSize: 13, fontWeight: 600,
                    fontFamily: "inherit", cursor: ocupado ? "wait" : "pointer",
                  }}
                >
                  Cambiar el archivo
                </button>
                {/* Mientras este modal está abierto ÉL es la pantalla, así que
                    se lleva el amarillo y el de Vender que quedó atrás pasa a
                    tinta (`[data-modal-abierto]` en `index.css`). */}
                <button
                  className="btn-principal"
                  onClick={guardar}
                  disabled={!marcadas.length || ocupado}
                  style={{
                    height: 38, padding: "0 18px", borderRadius: "var(--r-lg)",
                    display: "inline-flex", alignItems: "center", gap: 7,
                    fontSize: 13.5, fontFamily: "inherit",
                  }}
                >
                  {ocupado
                    ? <Loader2 size={14} style={{ animation: "spin .9s linear infinite" }} />
                    : <Check size={14} />}
                  {ocupado ? "Guardando…" : `Guardar ${marcadas.length} y avisar`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Paso 3: listo ────────────────────────────────────────────── */}
        {paso === "listo" && (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Check size={19} style={{ color: "var(--success)" }} />
              <b style={{ fontSize: 16 }}>
                {creados} contrato{creados === 1 ? "" : "s"} guardado{creados === 1 ? "" : "s"}
              </b>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Los espacios ya están pintados como vendidos en el mapa. Los avisos salieron
              <b> agrupados</b>: un correo al comercial con la tanda completa, uno al
              mercaderista con la lista de lo que hay que montar —sin valores— y una
              constancia por proveedor con todos sus espacios.
              <br /><br />
              <span style={{ color: "var(--ink-3)" }}>
                Cuarenta contratos por el camino de a uno habrían sido ciento veinte correos
                en un minuto: nadie los lee y el proveedor de correo los trata como spam.
              </span>
            </div>
            <button
              onClick={onCerrar}
              style={{
                alignSelf: "flex-start", marginTop: 4, height: 38, padding: "0 18px",
                borderRadius: "var(--r-lg)", border: "none", background: "var(--accent)",
                color: "#fff", fontSize: 13.5, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Volver al mapa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
