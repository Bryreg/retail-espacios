import type { OcupacionSede } from "../../api/dashboard";
import { formatCOP } from "./format";

/** Una fila de la barra: el rótulo (SIEMPRE palabra, nunca sólo color), la
 *  pista, el porcentaje y el conteo que lo explica.
 *
 *  Dos colores nada más, y ninguno de los tres del semáforo del plano
 *  (`--libre` / `--entra` / `--ocupado`): esta barra no describe el estado de
 *  UN espacio, describe qué fracción de la sede está en cada situación, y
 *  reusar el semáforo ahí mezclaría los dos lenguajes — un "Real" en verde se
 *  leería como "libre", cuando significa lo opuesto (tomado y montado). Se
 *  usa la escala de tinta neutra en su lugar: `--ink-3` para lo esperado
 *  (el plan) y `--ink-1` para lo real (lo que ya pasó), el mismo par que ya
 *  distingue texto secundario de texto de énfasis en el resto de la
 *  pantalla. */
function FilaBarra({
  rotulo, pct, color, conteo,
}: {
  rotulo: string;
  pct: number;
  color: string;
  conteo: string;
}) {
  const claro = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="rotulo" style={{ width: 58, flexShrink: 0 }}>{rotulo}</span>
      <div
        role="img"
        aria-label={`${rotulo}: ${pct}% — ${conteo}`}
        style={{
          flex: 1, height: 10, minWidth: 40,
          background: "var(--surface-3)", borderRadius: "var(--r-sm)", overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${claro}%`, background: color, borderRadius: "var(--r-sm)" }} />
      </div>
      <span style={{
        width: 50, flexShrink: 0, textAlign: "right",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--ink-1)",
      }}>
        {pct}%
      </span>
      <span style={{ width: 84, flexShrink: 0, fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        {conteo}
      </span>
    </div>
  );
}

/** Esperada y real de UNA sede, una debajo de la otra, con la sede en
 *  pantalla resaltada por texto ("esta sede"), nunca sólo por color o negrita
 *  —lo mismo que pide la paleta para los tres estados del plano, aplicado
 *  acá. */
export default function BarraSede({
  fila, esActual, isAdmin,
}: {
  fila: OcupacionSede;
  esActual: boolean;
  isAdmin: boolean;
}) {
  const conMoneda = isAdmin && "ingreso_contratado" in fila && "ingreso_a_referencia" in fila;
  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "center",
      padding: "9px 15px", borderTop: "1px solid var(--line-soft)",
    }}>
      <div style={{ width: 118, flexShrink: 0, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: esActual ? 700 : 600, color: "var(--ink-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {fila.sede}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {esActual && <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>esta sede · </span>}
          {fila.caras_comercializables} cara{fila.caras_comercializables === 1 ? "" : "s"}
          {fila.vencidas > 0 && (
            <span style={{ color: "var(--ocupado)" }}>
              {" "}· {fila.vencidas} vencida{fila.vencidas === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <FilaBarra
          rotulo="Esperada"
          pct={fila.ocupacion_esperada_pct}
          color="var(--ink-3)"
          conteo={`${fila.contratadas} de ${fila.caras_comercializables}`}
        />
        <FilaBarra
          rotulo="Real"
          pct={fila.ocupacion_real_pct}
          color="var(--ink-1)"
          conteo={`${fila.montadas} de ${fila.caras_comercializables}`}
        />
        {/* "Devengado del período" — nunca "contratado" a secas ni "canon":
            son dos palabras que en esta misma pantalla (franja de arriba,
            "Canon vigente") significan "el valor mensual del contrato que
            corre HOY". Esta cifra es otra cosa —prorrateada a los días que
            cada contrato toca el rango del SeasonPicker, `monthly_rent / 30 ×
            días`— y mezclar el nombre haría que un admin las reste o las dé
            por iguales cuando no lo son (divergencia `space_leases` vs JSON
            del layout, ver gap del entregable). No se muestra una relación o
            desvío entre las dos cifras acá: con el prorrateo el "a
            referencia" puede terminar por ARRIBA o por ABAJO del contratado
            según el período, y una resta o porcentaje mal leído deja el signo
            invertido; se dejan las dos cifras una al lado de la otra, sin
            operar entre ellas en pantalla. */}
        {conMoneda && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", paddingLeft: 66 }}>
            {formatCOP(fila.ingreso_contratado!)} devengado del período (prorrateado) · {formatCOP(fila.ingreso_a_referencia!)} a referencia (prorrateado)
          </div>
        )}
      </div>
    </div>
  );
}
