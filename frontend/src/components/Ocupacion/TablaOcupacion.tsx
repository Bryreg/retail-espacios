import type { OcupacionSede } from "../../api/dashboard";
import { formatCOP } from "./format";

/** La misma comparación de las barras, en tabla — la alternativa accesible
 *  que pide la spec: todo lo que la barra dice por ancho, acá lo dice un
 *  número en una celda, legible por un lector de pantalla y comparable fila
 *  a fila sin tener que medir píxeles. */
export default function TablaOcupacion({
  filas, sedeActual, isAdmin,
}: {
  filas: OcupacionSede[];
  sedeActual: string;
  isAdmin: boolean;
}) {
  const conMoneda = isAdmin && filas.some((f) => "ingreso_contratado" in f);

  const columnas: { etiqueta: string; derecha?: boolean }[] = [
    { etiqueta: "Sede" },
    { etiqueta: "Caras", derecha: true },
    { etiqueta: "Contratadas", derecha: true },
    { etiqueta: "Montadas", derecha: true },
    { etiqueta: "Vencidas", derecha: true },
    { etiqueta: "Esperada", derecha: true },
    { etiqueta: "Real", derecha: true },
  ];
  if (conMoneda) {
    // "(período)" en la cabecera, no "mensual" ni "canon" — esta columna es
    // el devengado prorrateado del rango elegido (`monthly_rent / 30 × días
    // dentro de [desde, hasta]`), una cifra distinta del "Canon vigente" de
    // la franja de arriba (que siempre es HOY, sin prorratear). La nota
    // completa va una sola vez, debajo de la tabla — repetirla en cada
    // encabezado la haría ilegible en 9.5px.
    columnas.push({ etiqueta: "Contratado (período)", derecha: true });
    columnas.push({ etiqueta: "A referencia (período)", derecha: true });
  }

  const th: React.CSSProperties = {
    padding: "0 8px 5px",
    fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
    color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em",
    borderBottom: "1px solid var(--line-strong)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "5px 8px", height: 26,
    borderBottom: "1px solid var(--line-soft)",
    fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "2px 15px 12px", overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: conMoneda ? 620 : 460, borderCollapse: "collapse" }}>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
          Ocupación esperada y real por sede, para el período elegido
        </caption>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.etiqueta} style={{ ...th, textAlign: c.derecha ? "right" : "left" }}>
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const activa = f.sede.toUpperCase() === sedeActual.toUpperCase();
            return (
              <tr key={f.sede} style={{ background: activa ? "var(--surface-2)" : undefined }}>
                <td style={{
                  ...td, fontWeight: activa ? 700 : 600, color: "var(--ink-1)",
                  boxShadow: activa ? "inset 2px 0 0 var(--ink-1)" : undefined,
                }}>
                  {f.sede}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{f.caras_comercializables}</td>
                <td style={{ ...td, textAlign: "right" }}>{f.contratadas}</td>
                <td style={{ ...td, textAlign: "right" }}>{f.montadas}</td>
                <td style={{
                  ...td, textAlign: "right",
                  color: f.vencidas > 0 ? "var(--ocupado)" : "var(--ink-vacio)",
                  fontWeight: f.vencidas > 0 ? 700 : 400,
                }}>
                  {f.vencidas || "—"}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-1)" }}>
                  {f.ocupacion_esperada_pct}%
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-1)" }}>
                  {f.ocupacion_real_pct}%
                </td>
                {conMoneda && (
                  <>
                    <td style={{ ...td, textAlign: "right" }}>
                      {"ingreso_contratado" in f ? formatCOP(f.ingreso_contratado!) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {"ingreso_a_referencia" in f ? formatCOP(f.ingreso_a_referencia!) : "—"}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {conMoneda && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
          Contratado / a referencia: ingreso <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>devengado del
          período</b>, prorrateado a los días que cada contrato toca el rango elegido (<span style={{ fontFamily: "var(--font-mono)" }}>canon / 30 × días</span>) —
          no es el "Canon vigente" mensual de la franja de arriba, que siempre reporta hoy. Las dos columnas no se suman
          ni se comparan entre sí en esta tabla.
        </p>
      )}
    </div>
  );
}
