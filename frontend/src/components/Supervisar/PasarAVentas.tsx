import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { describeError } from "../../api/client";
import { pasarAVentas } from "../../api/cobros";
import { pbDeTexto } from "../../utils/participaciones";
import { avisoDeCortes, hoyEnColombia, pesosExactos, porcentajeDeLoGuardado } from "./paraRevisar";

/**
 * «Pasar a % de ventas», el renglón abierto de Corregir → «Bajo tarifa de
 * referencia» (`docs/rediseno/vender-api.md` §3).
 *
 * En POBLADO quedaron ~30 contratos cargados con un valor fijo de unos pocos
 * pesos cuando el cobro por ventas no existía: ese número era el %. Salían
 * «−100 %» y «— al mes». Acá se pasan a % de las ventas: el campo trae lo
 * guardado si puede ser un % (`porcentajeDeLoGuardado`) y dice de dónde sale
 * («Valor guardado: $ 8»), el corte va mensual por defecto, y «Guardar» llama
 * a `POST /api/cobros/{lease_id}/pasar-a-ventas`. Debajo del corte dice, antes
 * de guardar, cuántos cortes ya vencidos quedan por cargar (`avisoDeCortes`,
 * la regla de períodos del servidor). Bien: quien lo monta vuelve a leer la
 * base, el renglón se va de «Bajo tarifa» (el valor queda en 0), el foco pasa
 * al renglón siguiente y se anuncia. Mal: el mensaje del servidor, en el
 * renglón.
 *
 * **El contrato es EL DEL RENGLÓN** (`leaseId`, de `GET /spaces/comercial`),
 * no «el que manda» en el espacio cuando se aprieta Guardar: volver a pedir el
 * espacio elegía `active_lease ?? upcoming_lease` y, con el vigente cancelado
 * entretanto, pasaba a ventas el próximo. Con el `lease_id` va `esperado` —el
 * valor y las fechas que el renglón mostró—: si el contrato ya no dice eso, el
 * servidor contesta 409 `contrato_cambio` y no toca nada. Lo visto se FIJA al
 * abrir (`visto`): si la vuelta del mapa comercial (cada 20 s) cambia el
 * contrato del renglón con el renglón abierto, el pedido sigue nombrando el
 * que se abrió —y el servidor dice que cambió— en vez de pasar el nuevo con el
 * % que se escribió para el otro.
 *
 * SÓLO ADMINISTRACIÓN y SÓLO SUPERVISAR (lo monta `DashboardView` adentro de
 * `isAdmin &&`): es plata. Vender no llega a este módulo (`probar-vender`).
 * Sin amarillo: ese es del botón principal de Vender.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

type Corte = "mensual" | "al_final";

export function PasarAVentas({ leaseId, valorGuardado, desde, hasta, onHecho, onCancelar }: {
  /** El contrato que dibuja el renglón (`leaseId` de `GET /spaces/comercial`,
   *  sólo para quien administra). */
  leaseId: number | null | undefined;
  /** Lo que guarda hoy el contrato (`monthly_rent`, el total del plazo). */
  valorGuardado: number;
  /** Las fechas que el renglón mostró (ISO): van en `esperado`. */
  desde: string;
  hasta: string;
  /** Se guardó, con el % en puntos básicos: hay que volver a leer la base (el
   *  renglón se va solo), mover el foco y anunciarlo. */
  onHecho: (pb: number) => void;
  onCancelar: () => void;
}) {
  // Lo que el renglón mostraba al abrirse: es lo que se ve acá y lo que va en
  // el pedido, aunque el renglón cambie mientras tanto.
  const [visto] = useState(() => ({ leaseId, valor: valorGuardado, desde, hasta }));
  const [texto, setTexto] = useState(() => porcentajeDeLoGuardado(valorGuardado));
  const [corte, setCorte] = useState<Corte>("mensual");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const id = useId();
  const pb = pbDeTexto(texto);
  const mal = texto.trim() !== "" && pb === null;
  // Lo que el servidor pondrá en «Ventas por cargar» apenas se guarde.
  const cortes = useMemo(() => avisoDeCortes(visto.desde, visto.hasta, corte, hoyEnColombia()), [visto, corte]);

  // Abierto con el teclado, el foco va al campo.
  useEffect(() => { campo.current?.focus(); campo.current?.select(); }, []);

  async function guardar() {
    if (pb === null || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      if (typeof visto.leaseId !== "number") {
        setError("No se encontró el contrato de este renglón: recargá y volvé a intentar.");
        return;
      }
      await pasarAVentas(visto.leaseId, {
        porcentaje: pb / 100, corte, esperado: { valor: visto.valor, desde: visto.desde, hasta: visto.hasta },
      });
      onHecho(pb);
    } catch (e) {
      setError(describeError(e, "No se pudo pasar a % de las ventas: probá de nuevo en un momento."));
    } finally {
      setGuardando(false);
    }
  }

  // «Guardar» se apaga mientras guarda y el foco se pierde: con un error, vuelve
  // al campo (el mensaje lo dice el `role="alert"`).
  useEffect(() => { if (error) campo.current?.focus(); }, [error]);

  return (
    <form
      data-pasar-a-ventas
      aria-label="Pasar a % de las ventas"
      onSubmit={(e) => { e.preventDefault(); void guardar(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancelar(); } }}
      style={{
        gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
        padding: "10px 10px 8px", borderRadius: "var(--r-md)",
        border: "1px solid var(--line)", background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "8px 14px", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <label htmlFor={`${id}-pct`} style={rotulo}>% de las ventas</label>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, height: 30, padding: "0 8px", width: 104,
            border: `1px solid ${mal ? "var(--ocupado-borde)" : "var(--brd-control, var(--line-strong))"}`,
            borderRadius: "var(--r-md)", background: "var(--surface)",
          }}>
            <input
              ref={campo}
              id={`${id}-pct`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="8"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={mal || undefined}
              aria-describedby={`${id}-guardado`}
              style={{
                minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent",
                color: "var(--ink-1)", fontFamily: "var(--font-mono)", fontSize: "var(--t-xs)",
                fontVariantNumeric: "tabular-nums", textAlign: "right",
              }}
            />
            <span aria-hidden style={{ color: "var(--ink-3)", fontSize: "var(--t-xs)" }}>%</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span id={`${id}-corte`} style={rotulo}>Corte</span>
          {/* El control segmentado de Supervisar (`.sup .seg`), como el
              «Cada mes | Al final» de «Cómo se cobra» en Vender. */}
          <span className="seg" role="group" aria-labelledby={`${id}-corte`} aria-describedby={cortes ? `${id}-cortes` : undefined}>
            <button type="button" aria-pressed={corte === "mensual"} onClick={() => setCorte("mensual")}
              style={{ height: 24 }}>Mensual</button>
            <button type="button" aria-pressed={corte === "al_final"} onClick={() => setCorte("al_final")}
              style={{ height: 24 }}>Al final</button>
          </span>
        </div>
      </div>
      {cortes && (
        <p id={`${id}-cortes`} data-cortes-vencidos style={{ margin: 0, fontSize: "var(--t-2xs)", color: "var(--ink-2)", lineHeight: 1.4 }}>
          {cortes}
        </p>
      )}
      <p id={`${id}-guardado`} style={{ margin: 0, fontSize: "var(--t-2xs)", color: "var(--ink-3)", lineHeight: 1.4 }}>
        Valor guardado: <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{pesosExactos(visto.valor)}</span>
        {mal ? " · Escribí un % de más de 0 y hasta 100, con dos decimales a lo sumo." : ""}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="submit" className="btn-s" disabled={pb === null || guardando}
          style={{ opacity: pb === null || guardando ? 0.55 : 1, cursor: pb === null ? "not-allowed" : "pointer" }}>
          <Check {...ICONO} /> {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="btn-s" onClick={onCancelar} disabled={guardando}>
          <X {...ICONO} /> Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--t-2xs)", color: "var(--ocupado-txt)", lineHeight: 1.4 }}>{error}</p>
      )}
    </form>
  );
}

const rotulo: React.CSSProperties = {
  fontSize: "var(--t-2xs)", fontWeight: 600, color: "var(--ink-2)",
};
