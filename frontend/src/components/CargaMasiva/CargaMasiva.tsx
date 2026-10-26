import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, Download, FileSpreadsheet, Info, Loader2, Upload, X,
} from "lucide-react";
import { confirmarLote, validarLote, type FilaRevisada, type Revision } from "../../api/bulkLeases";
import type { AvisosContrato } from "../../types";
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
 *
 * Desde el 2026-10-26 (decisión del dueño): el valor es lo de CADA MES —cada
 * fila muestra «$ 650.000 al mes × 6 meses = $ 3.900.000» y se guarda el
 * total, como «Al mes» en Vender— y sólo entran muebles que se venden ENTEROS
 * (las partes y los porcentajes, en Vender: lo frena el servidor). Al guardar se
 * dice lo que de verdad salió (`avisos`), no una frase fija.
 */

type Paso = "archivo" | "revision" | "listo";

const money = (n?: number | null) =>
  n == null ? "—" : "$ " + Math.round(n).toLocaleString("es-CO");

/** «6 meses», «6,5 meses», «1 mes». */
const textoDeMeses = (m: number): string => {
  const r = Math.round(m * 100) / 100;
  return `${String(r).replace(".", ",")} ${r === 1 ? "mes" : "meses"}`;
};

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

/** En el teléfono la tabla de ocho columnas no entra: el valor —lo que más
 *  hay que mirar— quedaba fuera de la pantalla (ronda del 2026-10-26). */
function useAngosto(px = 640): boolean {
  const consulta = `(max-width: ${px}px)`;
  const [angosto, setAngosto] = useState(() => typeof window !== "undefined" && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const cambio = () => setAngosto(m.matches);
    m.addEventListener("change", cambio);
    return () => m.removeEventListener("change", cambio);
  }, [consulta]);
  return angosto;
}

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
  const [guardadas, setGuardadas] = useState<FilaRevisada[]>([]);
  const [avisos, setAvisos] = useState<AvisosContrato | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const angosto = useAngosto();

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
      const hechas = res.filas.filter((f) => f.estado !== "error" && elegidas.has(f.fila));
      setGuardadas(hechas);
      setAvisos(res.avisos ?? null);
      onGuardado({ creados: hechas });
      setPaso("listo");
    } catch (e) {
      setError(describeError(e, "No se pudieron guardar los contratos."));
    } finally {
      setOcupado(false);
    }
  }

  const marcadas = revision?.filas.filter((r) => elegidas.has(r.fila)) ?? [];
  const total = marcadas.reduce((a, r) => a + (r.valor || 0), 0);
  const alMes = marcadas.reduce((a, r) => a + (r.valor_mes || 0), 0);
  const totalGuardado = guardadas.reduce((a, r) => a + (r.valor || 0), 0);
  const alMesGuardado = guardadas.reduce((a, r) => a + (r.valor_mes || 0), 0);

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
                solos —«Código» o «Espacio», «Valor al mes» o «Renta»— y la fila de títulos no
                tiene que ser la primera.
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
                {/* El valor es lo de CADA MES (decisión del dueño, 2026-10-26):
                    así se negocia en las tiendas, y el total sale × los meses
                    del contrato. Una columna «Valor total» no se lee
                    (`ENCABEZADO_TOTAL`, en `utils/planilla.ts`). */}
                Columnas: <b>Espacio</b>, Sede, <b>Proveedor</b>, Correo, Marca,
                {" "}<b>Valor al mes</b>, <b>Desde</b>, <b>Hasta</b> y Nota.
                Las fechas se leen <b>día primero</b>: 15/09/2026 es el 15 de
                septiembre. Sirve con <b>/</b>, <b>-</b> o <b>.</b>, y también
                2026-09-15 (año-mes-día). El valor es <b>lo de cada mes</b>: el total
                del contrato es ese valor × sus meses. Sólo muebles que se venden{" "}
                <b>enteros</b>: las partes y los porcentajes se venden en Vender.
                La plantilla trae las instrucciones completas en su segunda pestaña.
              </div>
              <button
                // Ahora es asíncrona: la librería que le pone el diseño entra
                // por `import()` perezoso, para no cargarla en el arranque.
                onClick={() => void descargarPlantilla(sede)}
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

            <div
              data-planilla-al-mes
              style={{
                display: "flex", gap: 9, alignItems: "flex-start",
                padding: "10px 18px", borderBottom: "1px solid var(--line-soft)",
                fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5,
              }}
            >
              <CalendarClock size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
              <span>
                El valor de la planilla es <b>por mes</b>. El total de cada contrato es ese valor ×
                sus meses, y así se guarda: igual que «Al mes» en Vender.
              </span>
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
                    {(angosto ? ["", "Espacio", "Valor"] : ["", "Fila", "Espacio", "Nombre dibujado", "Proveedor", "Periodo", "Valor", "Estado"]).map((h, i) => (
                      <th
                        key={i}
                        style={{
                          textAlign: h === "Valor" ? "right" : "left",
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
                    const chip = (
                      <span
                        style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 999,
                          fontSize: 10.5, fontWeight: 700, color: pinta.color,
                          border: `1px solid ${pinta.borde}`, background: "var(--surface)",
                        }}
                      >
                        {pinta.texto}
                      </span>
                    );
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
                        {!angosto && (
                        <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
                          {r.fila}
                        </td>
                        )}
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {r.codigo || "—"}
                          </div>
                          {r.nombre && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.nombre}</div>}
                          {angosto && (
                            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2 }}>
                              <b>{r.proveedor || "—"}</b> · fila {r.fila}<br />
                              {fechaCorta(r.desde)} → {fechaCorta(r.hasta)}
                            </div>
                          )}
                        </td>
                        {/* Cómo se llama ese mueble EN EL PLANO. Cuando alguien le
                            puso un nombre a mano, es el único campo de la fila que
                            la persona reconoce: el código se lo devuelve el
                            servidor tal como ella lo tecleó, y el nombre de arriba
                            es el del tipo de mueble, igual en los cuarenta. */}
                        {!angosto && (
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
                        )}
                        {!angosto && (
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600 }}>{r.proveedor || "—"}</div>
                          {r.marca && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.marca}</div>}
                        </td>
                        )}
                        {!angosto && (
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {fechaCorta(r.desde)} → {fechaCorta(r.hasta)}
                          {r.meses ? (
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{textoDeMeses(r.meses)}</div>
                          ) : null}
                        </td>
                        )}
                        <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }} data-valor-fila={r.fila}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                            {r.valor_mes != null ? `${money(r.valor_mes)} al mes` : money(r.valor)}
                          </div>
                          {r.valor_mes != null && r.meses && r.valor != null ? (
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                              × {textoDeMeses(r.meses)} = <b style={{ color: "var(--ink-1)" }}>{money(r.valor)}</b>
                            </div>
                          ) : null}
                          {angosto && <div style={{ marginTop: 4 }}>{chip}</div>}
                        </td>
                        {!angosto && (
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {chip}
                        </td>
                        )}
                      </tr>
                      {r.mensajes.length > 0 && (
                        <tr style={{ ...cuerpoFila, borderBottom: "1px solid var(--line-soft)" }}>
                          <td style={{ boxShadow: barra }} />
                          <td colSpan={angosto ? 2 : 7} style={{ padding: "0 10px 9px" }}>
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
                {/* Decía «$ X al mes» sumando TOTALES (2026-10-26). */}
                {total > 0 && (
                  <span data-total-planilla>
                    {" · "}
                    <b style={{ fontFamily: "var(--font-mono)" }}>{money(total)}</b> en total
                    {alMes > 0 && <span style={{ color: "var(--ink-3)" }}> ({money(alMes)} al mes)</span>}
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
        {/* Lo que de verdad salió, con `avisos` (2026-10-26). Antes decía con
            una frase fija que al mercaderista ya le había llegado la lista de
            montaje —que espera la planometría— aunque el correo no estuviera
            configurado. */}
        {paso === "listo" && (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }} data-planilla-listo>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Check size={19} style={{ color: "var(--success)" }} />
              <b style={{ fontSize: 16 }}>
                {creados} contrato{creados === 1 ? "" : "s"} guardado{creados === 1 ? "" : "s"}
              </b>
              {totalGuardado > 0 && (
                <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {money(totalGuardado)} en total{alMesGuardado > 0 ? ` (${money(alMesGuardado)} al mes)` : ""}
                </span>
              )}
            </div>
            {avisos && !avisos.smtp_listo ? (
              <div style={{
                display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 14px", borderRadius: "var(--r-lg)",
                background: "var(--warning-50)", border: "1px solid var(--line)", fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5,
              }} data-sin-correo>
                <Info size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <span><b>El correo no está configurado:</b> no salió ningún aviso.</span>
              </div>
            ) : avisos ? (
              <div style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", overflow: "hidden", fontSize: 13, lineHeight: 1.5 }}>
                {[
                  {
                    quien: "Comercial",
                    que: avisos.comercial.length
                      ? <>Le llegó la tanda completa a <b>{[...new Set(avisos.comercial)].join(", ")}</b>.</>
                      : <span style={{ color: "var(--warning)" }}>No hay contacto comercial en la sede: no le llegó a nadie.</span>,
                  },
                  {
                    quien: "Proveedores",
                    que: <>
                      {avisos.proveedor.length
                        ? <>Constancia a <b>{[...new Set(avisos.proveedor)].join(", ")}</b>.</>
                        : "Ningún proveedor recibió constancia."}
                      {(avisos.proveedor_sin_correo ?? []).length > 0 && (
                        <span style={{ color: "var(--warning)" }}>
                          {" "}{(avisos.proveedor_sin_correo ?? []).join(", ")}{" "}
                          {(avisos.proveedor_sin_correo ?? []).length === 1 ? "no tiene" : "no tienen"} correo: no le llegó nada.
                        </span>
                      )}
                    </>,
                  },
                  {
                    quien: "Montaje",
                    que: (avisos.montaje_pendiente ?? []).length
                      ? "Todavía no sale: el aviso de cada espacio espera su planometría. Se carga en Supervisar, en la ficha del espacio; al cargarla, le llega a quien monta."
                      : avisos.montaje.length
                        ? <>Le llegó la lista a <b>{[...new Set(avisos.montaje)].join(", ")}</b>.</>
                        : "No hay contacto de montaje en la sede: no le llegó a nadie.",
                  },
                ].map((x, i) => (
                  <div key={x.quien} style={{
                    display: "grid", gridTemplateColumns: angosto ? "minmax(0, 1fr)" : "minmax(96px, 140px) minmax(0, 1fr)",
                    gap: angosto ? 2 : 12, padding: "11px 14px", overflowWrap: "anywhere",
                    borderTop: i ? "1px solid var(--line-soft)" : undefined,
                  }}>
                    <b>{x.quien}</b>
                    <span>{x.que}</span>
                  </div>
                ))}
              </div>
            ) : null}
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
