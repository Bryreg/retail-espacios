import { Building2, CircleCheck, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { contraLaMeta, pesos, textoContraLaMeta } from "../../utils/indicadores";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export interface FilaDeSede {
  sede: string;
  /** Plata: sólo administración. */
  canonHoy: number | null;
  serie: number[] | null;
  variacion: number | null;
  ocupacion: { pct: number; ocupadas: number; total: number };
  canonTarifa: number | null;
  /** Al mes, lo que vence en 90 días sin un contrato siguiente. */
  sinRenovar90: number | null;
  meta: { ocupacion: number; canon_tarifa: number };
}

function Mini({ serie }: { serie: number[] }) {
  const W = 200, H = 36, P = 3;
  const max = Math.max(1, ...serie);
  const pts = serie.map((v, i) => `${(P + (i * (W - 2 * P)) / Math.max(1, serie.length - 1)).toFixed(1)},${(H - P - (v / max) * (H - 2 * P)).toFixed(1)}`).join(" ");
  return <svg className="ind-curva" style={{ height: 36 }} viewBox={`0 0 ${W} ${H}`} aria-hidden><polyline points={pts} className="lin" /></svg>;
}

/** La frase de arriba: qué sede necesita atención y por qué (la que más lejos
 *  está de su meta), o que todas están en la suya. */
export function fraseDeLasSedes(filas: readonly FilaDeSede[]): string {
  let peor: { sede: string; falta: number; que: string } | null = null;
  for (const f of filas) {
    // Una sede sin plano todavía no está «bajo la meta»: no tiene caras.
    if (f.ocupacion.total === 0) continue;
    const fo = f.meta.ocupacion - f.ocupacion.pct;
    if (fo > 0 && (!peor || fo > peor.falta)) peor = { sede: f.sede, falta: fo, que: `ocupación ${f.ocupacion.pct} % contra ${f.meta.ocupacion} %` };
    if (f.canonTarifa !== null) {
      const ft = f.meta.canon_tarifa - f.canonTarifa;
      if (ft > 0 && (!peor || ft > peor.falta)) peor = { sede: f.sede, falta: ft, que: `canon ÷ tarifa ${f.canonTarifa} % contra ${f.meta.canon_tarifa} %` };
    }
  }
  return peor ? `${peor.sede} necesita atención: ${peor.que}.` : "Todas las sedes están en su meta.";
}

/** Indicadores › Todas las sedes (rediseño UX 2026-10, etapa 5): la misma
 *  lectura para un supermercado con varias sedes, una tarjeta por sede y una
 *  para el total; «Abrir» lleva al Mapa de oportunidades de esa sede. */
export default function TodasLasSedes({ esAdmin, filas, total, onAbrir }: {
  esAdmin: boolean;
  filas: FilaDeSede[];
  total: FilaDeSede | null;
  onAbrir: (sede: string) => void;
}) {
  const tarjeta = (f: FilaDeSede, esTotal = false) => (
    <section key={f.sede} className="ind-tarjeta" data-sede-tarjeta={f.sede}>
      <header><h3><Building2 {...ICONO} />{esTotal ? "Todas las sedes" : f.sede}</h3></header>
      <div className="cuerpo">
        {esAdmin && f.canonHoy !== null && (
          <>
            <div className="valor">{pesos(f.canonHoy)}</div>
            <p className="nota">
              canon al mes
              {f.variacion !== null && (
                <span className={"delta " + (f.variacion >= 0 ? "sube" : "baja")}>
                  {f.variacion >= 0 ? <TrendingUp {...ICONO} /> : <TrendingDown {...ICONO} />}
                  {f.variacion >= 0 ? "+" : ""}{f.variacion.toLocaleString("es-CO")} % contra el mes anterior
                </span>
              )}
            </p>
            {f.serie && <Mini serie={f.serie} />}
          </>
        )}
        {f.ocupacion.total === 0 ? (
          <p className="nota">Sin plano todavía: no tiene caras que se vendan.</p>
        ) : (
          <>
            <p className="nota">Ocupación <b>{f.ocupacion.pct} %</b> · {f.ocupacion.ocupadas} de {f.ocupacion.total} caras</p>
            <span className={"ind-meta " + contraLaMeta(f.ocupacion.pct, f.meta.ocupacion)}>
              {contraLaMeta(f.ocupacion.pct, f.meta.ocupacion) === "ok" ? <CircleCheck {...ICONO} /> : <TriangleAlert {...ICONO} />}
              {textoContraLaMeta(f.ocupacion.pct, f.meta.ocupacion)}
            </span>
          </>
        )}
        {esAdmin && f.canonTarifa !== null && <p className="nota">Canon ÷ tarifa <b>{f.canonTarifa} %</b></p>}
        {esAdmin && f.sinRenovar90 !== null && <p className="nota">Sin renovar a 90 días: <b>{pesos(f.sinRenovar90)}</b> al mes</p>}
      </div>
      {!esTotal && <button type="button" className="ind-link" onClick={() => onAbrir(f.sede)}>Abrir {f.sede}</button>}
    </section>
  );
  return (
    <div data-todas-las-sedes>
      <p className="ind-frase">{fraseDeLasSedes(filas)}</p>
      <div className="ind-sedes">
        {total && tarjeta(total, true)}
        {filas.map((f) => tarjeta(f))}
      </div>
    </div>
  );
}
