import { Fragment, useCallback, useEffect, useState } from "react";
import { esFallaDeLectura } from "../../utils/sinLeer";
import { CalendarClock, ChevronDown, ChevronUp, CircleCheck, Percent, Undo2 } from "lucide-react";
import { describeError } from "../../api/client";
import { contratosSinForma, corregirPrecio, deshacerPrecio, type CobroPorVentasDe, type ContratoSinForma, type ModoDeCorreccion } from "../../api/precioSinForma";
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
 * total» (no cambia), o «Por % de ventas» (2026-10-27: queda como un contrato
 * por ventas de Vender, con valor 0, su porcentaje y su corte); y «Todos son al
 * mes», que pregunta antes. Se puede
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

const CORTE: Record<CobroPorVentasDe["corte"], string> = { mensual: "cada mes", al_final: "al final" };

/** «7,5» → 7.5; vacío, 0 o más de 100 → null. */
export function leerPorcentaje(t: string): number | null {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

const textoDePorcentaje = (n: number): string => String(n).replace(".", ",");

/** El porcentaje y el corte, con «Guardar» y «Cancelar». */
function CobroPorVentas({ etiqueta, haciendo, onGuardar, onCancelar }: {
  etiqueta: string;
  haciendo: boolean;
  onGuardar: (cobro: CobroPorVentasDe) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [corte, setCorte] = useState<CobroPorVentasDe["corte"]>("mensual");
  const porcentaje = leerPorcentaje(texto);
  const control = {
    height: 28, border: "1px solid var(--brd-control)", borderRadius: "var(--r-md)", background: "var(--surface)",
    color: "var(--ink-1)", fontSize: "var(--t-2xs)",
  } as const;
  return (
    <form data-cobro-por-ventas
      onSubmit={(e) => { e.preventDefault(); if (porcentaje !== null) onGuardar({ porcentaje, corte }); }}
      style={{ display: "grid", gap: 8, margin: "0 10px 8px", padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)",
        border: "1px solid var(--line)", fontSize: "var(--t-xs)", color: "var(--ink-1)", lineHeight: 1.45 }}>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ ...control, display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", width: 84 }}>
          <input inputMode="decimal" placeholder="8" aria-label={`Porcentaje de las ventas: ${etiqueta}`} value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} autoFocus
            style={{ minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent", color: "var(--ink-1)",
              fontFamily: "var(--font-mono)", fontSize: "var(--t-2xs)", fontVariantNumeric: "tabular-nums", textAlign: "right" }} />
          <span aria-hidden style={{ color: "var(--ink-3)" }}>%</span>
        </label>
        <span>de las ventas, corte</span>
        <select value={corte} onChange={(e) => setCorte(e.target.value as CobroPorVentasDe["corte"])} aria-label="Cada cuánto se cargan las ventas"
          style={{ ...control, padding: "0 6px" }}>
          <option value="mensual">cada mes</option>
          <option value="al_final">al final</option>
        </select>
        <button type="submit" className="btn-s" disabled={porcentaje === null || haciendo} data-guardar-ventas>
          {haciendo ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="btn-s" onClick={onCancelar} disabled={haciendo}>Cancelar</button>
      </span>
      {texto.trim() !== "" && porcentaje === null && (
        <span style={{ color: "var(--ocupado-txt)", fontSize: "var(--t-2xs)" }}>El porcentaje tiene que ser más de 0 y hasta 100.</span>
      )}
    </form>
  );
}

/** «6 meses», «6,5 meses», «1 mes». */
export const textoDeMeses = (m: number): string => {
  const r = Math.round(m * 100) / 100;
  return `${String(r).replace(".", ",")} ${r === 1 ? "mes" : "meses"}`;
};

export function usePrecioSinForma({ sede, activo }: { sede: string; activo: boolean }) {
  const [filas, setFilas] = useState<ContratoSinForma[]>([]);
  /** La lectura falló (auditoría P2-15): no es lo mismo que «no hay ninguno». */
  const [sinLeer, setSinLeer] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo || !sede) { setFilas([]); setSinLeer(false); return; }
    let vivo = true;
    contratosSinForma(sede)
      .then((r) => { if (vivo) { setFilas(Array.isArray(r) ? r : []); setSinLeer(false); } })
      .catch((e) => { if (vivo) { setFilas([]); setSinLeer(esFallaDeLectura(e)); } });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  /** Para la cuenta de «Para revisar»: UN aviso si hay alguno. */
  const unoSiHay = filas.slice(0, 1);
  return { filas, unoSiHay, recargar, sinLeer };
}

export function PrecioSinForma({ filas, titulo, onCambio }: {
  filas: readonly ContratoSinForma[];
  titulo: string;
  /** Se corrigió o se deshizo algo: recargar la lista y las cifras. */
  onCambio: () => void;
}) {
  const [verTodos, setVerTodos] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  /** El contrato al que se le está escribiendo el porcentaje de las ventas. */
  const [porVentas, setPorVentas] = useState<number | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; deshacer: number[] | null; error?: boolean } | null>(null);
  const refrescarComercial = useFixtureStore((s) => s.refrescarComercial);

  const despues = useCallback(() => { onCambio(); void refrescarComercial(); }, [onCambio, refrescarComercial]);

  async function corregir(modo: ModoDeCorreccion, cuales: readonly ContratoSinForma[], cobro?: CobroPorVentasDe) {
    if (haciendo || cuales.length === 0) return;
    setHaciendo(true);
    setAviso(null);
    try {
      const r = await corregirPrecio(modo, cuales.map((c) => ({ lease_id: c.lease_id, valor: c.valor })), cobro);
      const n = r.corregidos.length;
      const cual = n === 1 ? `El contrato de ${cuales[0].espacio}` : `${n} contratos`;
      setAviso({
        texto: modo === "ventas" && cobro
          ? `Listo: ${cual} ${n === 1 ? "se cobra" : "se cobran"} el ${textoDePorcentaje(cobro.porcentaje)} % de las ventas, corte ${CORTE[cobro.corte]}. `
            + `El valor quedó en $ 0, como en Vender, y lo vendido en cada corte se carga en «Ventas por cargar». No se mandó ningún correo.`
          : modo === "mensual"
          ? `Listo: ${cual} ${n === 1 ? "pasó" : "pasaron"} a «al mes». El total es ahora el valor × sus meses. No se mandó ningún correo.`
          : `Listo: ${cual} ${n === 1 ? "quedó" : "quedaron"} como total, sin cambiar el valor.`,
        deshacer: r.corregidos,
      });
      setPreguntando(false);
      setPorVentas(null);
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

  const ventasBoton = (c: ContratoSinForma) => (
    <button type="button" className="btn-s" onClick={() => { setPorVentas(c.lease_id); setPreguntando(false); }} disabled={haciendo}
      aria-expanded={porVentas === c.lease_id} data-por-ventas={c.lease_id}>
      <Percent {...ICONO} /> Por % de ventas
    </button>
  );

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
            ser el valor × los meses. Si se cobra por un % de las ventas, elegí «Por % de ventas». No se manda ningún correo.
          </p>
          <div style={{ margin: "0 10px 6px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {!preguntando ? (
              <button type="button" className="btn-s" onClick={() => { setPreguntando(true); setPorVentas(null); }} disabled={haciendo} data-todos-al-mes>
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
            <Fragment key={c.lease_id}>
            <div className="fila-r" data-aviso={`psf:${c.lease_id}`} data-contrato-sin-forma={c.lease_id}>
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
                {ventasBoton(c)}
              </span>
            </div>
            {porVentas === c.lease_id && (
              <CobroPorVentas
                etiqueta={c.espacio}
                haciendo={haciendo}
                onGuardar={(cobro) => void corregir("ventas", [c], cobro)}
                onCancelar={() => setPorVentas(null)}
              />
            )}
            </Fragment>
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
