import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, CircleCheck, Undo2 } from "lucide-react";
import { describeError } from "../../api/client";
import { contratosSinForma, corregirPrecio, deshacerPrecio, type ContratoSinForma } from "../../api/precioSinForma";
import { useFixtureStore } from "../../store/fixtureStore";
import { diaConAnio, pesosExactos } from "../../utils/edicionDeContrato";
import { EncabezadoDeSeccion } from "./piezas";

/**
 * «Contratos cargados antes: ¿el valor es al mes?» (2026-10-25), en «Para
 * revisar» → Corregir. Los contratos cargados antes de Vender no dicen si su
 * valor era el de cada mes o el total, y se leían como el total: en GALERÍAS
 * todos eran al mes, y el «al mes» de Supervisar salía dividido por la
 * duración.
 *
 * Por contrato, «Es al mes» (el total pasa a ser el valor × los meses) o «Es el
 * total» (no cambia); y «Todos son al mes», que pregunta antes. Se puede
 * deshacer desde el aviso. No manda correos: corrige cómo se lee un dato
 * (decisión del dueño). SÓLO ADMINISTRACIÓN: lleva plata y proveedores; quien
 * lo monta lo pone adentro de `isAdmin &&`, y el hook no pide nada si no está
 * `activo`. Cuenta como UN aviso en la pastilla (es una sola tarea, aunque
 * sean cien contratos viejos).
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const MOSTRAR = 8;

const ESTADO: Record<ContratoSinForma["estado"], { texto: string; tono: string }> = {
  vigente: { texto: "vigente", tono: "libre" },
  proximo: { texto: "próximo", tono: "entra" },
  vencido: { texto: "vencido", tono: "" },
  cerrado: { texto: "cerrado", tono: "" },
};

/** «6 meses», «6,5 meses», «1 mes». */
export const textoDeMeses = (m: number): string => {
  const r = Math.round(m * 100) / 100;
  return `${String(r).replace(".", ",")} ${r === 1 ? "mes" : "meses"}`;
};

export function usePrecioSinForma({ sede, activo }: { sede: string; activo: boolean }) {
  const [filas, setFilas] = useState<ContratoSinForma[]>([]);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo || !sede) { setFilas([]); return; }
    let vivo = true;
    contratosSinForma(sede)
      .then((r) => { if (vivo) setFilas(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  /** Para la cuenta de «Para revisar»: UN aviso si hay alguno. */
  const unoSiHay = filas.slice(0, 1);
  return { filas, unoSiHay, recargar };
}

export function PrecioSinForma({ filas, titulo, onCambio }: {
  filas: readonly ContratoSinForma[];
  titulo: string;
  /** Se corrigió o se deshizo algo: recargar la lista y las cifras. */
  onCambio: () => void;
}) {
  const [verTodos, setVerTodos] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [haciendo, setHaciendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; deshacer: number[] | null; error?: boolean } | null>(null);
  const refrescarComercial = useFixtureStore((s) => s.refrescarComercial);

  const despues = useCallback(() => { onCambio(); void refrescarComercial(); }, [onCambio, refrescarComercial]);

  async function corregir(modo: "mensual" | "total", cuales: readonly ContratoSinForma[]) {
    if (haciendo || cuales.length === 0) return;
    setHaciendo(true);
    setAviso(null);
    try {
      const r = await corregirPrecio(modo, cuales.map((c) => ({ lease_id: c.lease_id, valor: c.valor })));
      const n = r.corregidos.length;
      const cual = n === 1 ? `El contrato de ${cuales[0].espacio}` : `${n} contratos`;
      setAviso({
        texto: modo === "mensual"
          ? `Listo: ${cual} ${n === 1 ? "pasó" : "pasaron"} a «al mes». El total es ahora el valor × sus meses. No se mandó ningún correo.`
          : `Listo: ${cual} ${n === 1 ? "quedó" : "quedaron"} como total, sin cambiar el valor.`,
        deshacer: r.corregidos,
      });
      setPreguntando(false);
      despues();
    } catch (e) {
      setAviso({ texto: describeError(e, "No se pudo corregir. Recargá y volvé a intentar."), deshacer: null, error: true });
    } finally {
      setHaciendo(false);
    }
  }

  async function deshacer(ids: number[]) {
    if (haciendo) return;
    setHaciendo(true);
    try {
      await deshacerPrecio(ids);
      setAviso({ texto: "Deshecho: volvieron al valor de antes.", deshacer: null });
      despues();
    } catch (e) {
      setAviso({ texto: describeError(e, "No se pudo deshacer."), deshacer: null, error: true });
    } finally {
      setHaciendo(false);
    }
  }

  if (filas.length === 0 && !aviso) return null;
  const visibles = verTodos ? filas : filas.slice(0, MOSTRAR);
  return (
    <div data-precio-sin-forma>
      <EncabezadoDeSeccion titulo={titulo} valor={filas.length || undefined} />
      {aviso && (
        <div role="status" data-aviso-precio
          style={{ margin: "4px 10px 8px", display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", gap: 8, alignItems: "start",
            padding: "10px 12px", borderRadius: 12, fontSize: "var(--t-xs)", color: "var(--ink-1)", lineHeight: 1.45,
            background: aviso.error ? "var(--ocupado-suave)" : "var(--libre-suave)",
            border: `1px solid ${aviso.error ? "var(--ocupado-borde)" : "var(--libre-borde)"}` }}>
          <CircleCheck {...ICONO} style={{ color: aviso.error ? "var(--ocupado-txt)" : "var(--libre-txt)", marginTop: 1 }} />
          <span>{aviso.texto}</span>
          {aviso.deshacer && (
            <button type="button" className="btn-s" onClick={() => void deshacer(aviso.deshacer!)} disabled={haciendo} data-deshacer-precio>
              <Undo2 {...ICONO} /> Deshacer
            </button>
          )}
        </div>
      )}
      {filas.length > 0 && (
        <>
          <p style={{ margin: "2px 18px 8px", fontSize: "var(--t-2xs)", color: "var(--ink-3)", lineHeight: 1.45 }}>
            Se cargaron antes de Vender y hoy se leen como el total del contrato. Si el valor es el de cada mes, el total pasa a
            ser el valor × los meses. No se manda ningún correo.
          </p>
          <div style={{ margin: "0 10px 6px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {!preguntando ? (
              <button type="button" className="btn-s" onClick={() => setPreguntando(true)} disabled={haciendo} data-todos-al-mes>
                <CalendarClock {...ICONO} /> Todos son al mes ({filas.length})
              </button>
            ) : (
              <div role="group" aria-label="Confirmar" data-confirmar-todos
                style={{ display: "grid", gap: 8, width: "100%", padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)",
                  border: "1px solid var(--line)", fontSize: "var(--t-xs)", color: "var(--ink-1)" }}>
                <span>
                  ¿Pasar los {filas.length} contratos a «al mes»? El total de cada uno pasa a ser su valor × sus meses
                  (por ejemplo {filas[0].espacio}: {pesosExactos(filas[0].valor)} × {textoDeMeses(filas[0].meses)} = {pesosExactos(filas[0].total_si_es_al_mes)}).
                  Se puede deshacer.
                </span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-s" onClick={() => void corregir("mensual", filas)} disabled={haciendo} data-si-todos>
                    {haciendo ? "Guardando…" : "Sí, son al mes"}
                  </button>
                  <button type="button" className="btn-s" onClick={() => setPreguntando(false)} disabled={haciendo}>Cancelar</button>
                </span>
              </div>
            )}
          </div>
          {visibles.map((c) => (
            <div key={c.lease_id} className="fila-r" data-aviso={`psf:${c.lease_id}`} data-contrato-sin-forma={c.lease_id}>
              <span className={`pill ${ESTADO[c.estado].tono}`}>{ESTADO[c.estado].texto}</span>
              <div className="dat">
                <b className="mono">{c.espacio}</b>
                <span>{c.proveedor || "—"} · {diaConAnio(c.desde)} → {diaConAnio(c.hasta)}</span>
                <span>
                  Hoy: {pesosExactos(c.valor)} de total · si es al mes: {pesosExactos(c.valor)} × {textoDeMeses(c.meses)} ={" "}
                  <b>{pesosExactos(c.total_si_es_al_mes)}</b>
                </span>
              </div>
              {/* `acc-r`: debajo de la cuenta, no en una columna aparte (en el
                  teléfono la columna caía debajo de la pastilla). */}
              <span className="acc-r">
                <button type="button" className="btn-s" onClick={() => void corregir("mensual", [c])} disabled={haciendo} data-es-al-mes={c.lease_id}>
                  Es al mes
                </button>
                <button type="button" className="btn-s" onClick={() => void corregir("total", [c])} disabled={haciendo} data-es-total={c.lease_id}>
                  Es el total
                </button>
              </span>
            </div>
          ))}
          {filas.length > MOSTRAR && (
            <button type="button" className="btn-s" style={{ margin: "4px 10px 8px" }} onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
              {verTodos ? <><ChevronUp {...ICONO} /> Ver menos</> : <><ChevronDown {...ICONO} /> Ver los {filas.length}</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}
