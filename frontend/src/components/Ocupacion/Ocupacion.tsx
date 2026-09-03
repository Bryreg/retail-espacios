import { useEffect, useState } from "react";
import { getOcupacion, type OcupacionSede } from "../../api/dashboard";
import type { BrechaEspacio } from "./types";
import BarraSede from "./BarraSede";
import TablaOcupacion from "./TablaOcupacion";

/** ── Ocupación real vs esperada ──────────────────────────────────────────
 *
 *  Consume `GET /dashboard/ocupacion?sede=&desde=&hasta=`. Se pide SIN
 *  `sede` a propósito —trae todas las que tienen plano guardado— porque la
 *  comparación que pide la spec es POR SEDE: una sola barra repetida para la
 *  sede en pantalla no compara nada. El período es el mismo `DateRange` que
 *  ya gobierna el mapa y el resto de "Supervisar" (`SeasonPicker`); esta
 *  sección no trae su propio calendario.
 *
 *  ## Las fórmulas, tal como las implementa el backend (`services/ocupacion.py`)
 *
 *  - **`caras_comercializables`**: por CARA, no por mueble — una góndola
 *    doble cuenta dos. Sólo lo comercializable (`isRentable`).
 *  - **Ocupación esperada** = `contratadas / caras_comercializables`.
 *    `contratadas` = caras con AL MENOS un contrato activo que TOCA el
 *    período `[desde, hasta]` pedido (se solapa aunque sea un día — mismo
 *    criterio que el choque de fechas al crear un contrato). No prorratea:
 *    un contrato de un día dentro de un período de un mes cuenta entera.
 *  - **Ocupación real** = `montadas / caras_comercializables` — MISMO
 *    denominador que la esperada, a propósito, para que las dos lean como
 *    una sola barra comparada contra el mismo total. `montadas` = de las
 *    contratadas, cuántas tienen el ÚLTIMO reporte de montaje (no archivado)
 *    en estado "montado" — el reporte no lleva fecha propia, así que no se
 *    filtra por período, sólo pregunta "¿está montada, hoy, la que está
 *    contratada para este período?".
 *  - **Vencidas**: caras cuyo contrato más reciente ya terminó, mirado desde
 *    el FINAL del período pedido (no desde "hoy" real) — para que el número
 *    sea coherente con el resto de las cifras del mismo período consultado.
 *  - **Brecha** (contratadas sin montar) = `contratadas − montadas` en
 *    conteo; la LISTA de códigos (ver más abajo) es un cómputo local,
 *    documentado como gap.
 *  - **Ingreso contratado** (admin) — DEVENGADO PRORRATEADO del período: para
 *    cada contrato que toca `[desde, hasta]`, `monthly_rent / 30 × días de
 *    intersección` (inclusiva en los dos extremos), sumado. Un contrato de 6
 *    días dentro de un período de 30 aporta 6/30 de su canon, nunca el mes
 *    completo. **Ingreso a referencia** (admin): el MISMO prorrateo `/30 ×
 *    días`, aplicado a la tarifa de referencia (tipo + sede) de TODAS las
 *    caras comercializables, contratadas o no — el techo de P&L del período
 *    si todo se vendiera a tarifa de lista. Con el prorrateo, "a referencia"
 *    puede quedar por DEBAJO de "contratado" según el período (no es
 *    garantía de ser siempre el mayor de los dos) — por eso esta sección NO
 *    calcula ni muestra un desvío o porcentaje entre ambas cifras, sólo las
 *    yuxtapone: cualquier resta hecha a ojo por quien lea la pantalla corre
 *    el riesgo de leer el signo al revés si asume el viejo supuesto
 *    ("referencia siempre gana"). Ninguna de las dos cifras es el "Canon
 *    vigente" de la franja de arriba (esa es HOY, sin prorratear, del JSON
 *    del layout) — son fuentes y períodos distintos (`space_leases` del
 *    período vs snapshot de hoy) que este componente no suma ni compara; esa
 *    divergencia queda como hallazgo arquitectónico abierto, no resuelto acá.
 *
 *  Fuente completa de cada fórmula: `features/vitrinas-3d/outputs/builder-rates-api.md`
 *  y `features/vitrinas-3d/outputs/auditor-contador-pl.md` (regla de prorrateo `/30`).
 *
 *  ## El gap de la lista de códigos
 *
 *  El endpoint agregado NO devuelve códigos, sólo conteos — inventar una
 *  lista a partir de esos conteos sería simularle al backend un dato que no
 *  manda. Para la sede QUE ESTÁ EN PANTALLA sí hay de dónde sacarla sin
 *  inventar nada: `DashboardView` ya tiene cargados los fixtures, el
 *  período y los reportes de montaje de esa sede (la misma fuente que arma
 *  "Contratado sin montar" en Atención), así que ahí se deriva la lista real
 *  y se pasa acá por props (`brecha`). Para las DEMÁS sedes de la
 *  comparación no hay fixtures cargados localmente, así que esta sección NO
 *  puede mostrar sus códigos — sólo agregados. Ver el gap documentado en el
 *  entregable de este builder. */
export default function OcupacionSection({
  sedeActual, desde, hasta, periodoLabel, isAdmin, brecha, onSeleccionarBrecha,
}: {
  sedeActual: string;
  /** YYYY-MM-DD. `undefined` en los dos = el período es HOY, igual que en
   *  el resto de "Supervisar". */
  desde?: string;
  hasta?: string;
  /** Cómo se lee el período elegido, para el subtítulo — el mismo texto que
   *  ya usa el encabezado del mapa (`describeRange`). */
  periodoLabel: string;
  isAdmin: boolean;
  /** La brecha YA CALCULADA de `sedeActual` (ver el docstring de arriba). */
  brecha: BrechaEspacio[];
  onSeleccionarBrecha?: (id: string, face: "A" | "B") => void;
}) {
  const [filas, setFilas] = useState<OcupacionSede[] | null | undefined>(undefined);
  const [errorReal, setErrorReal] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErrorReal(false);
    getOcupacion({ desde, hasta })
      .then((rows) => { if (vivo) setFilas(rows); })
      .catch(() => {
        if (!vivo) return;
        setFilas(null);
        setErrorReal(true);
      });
    return () => { vivo = false; };
  }, [desde, hasta]);

  // El endpoint todavía no existe (404): la sección se omite entera, sin
  // romper el resto del Dashboard. No es un estado de error para mostrar —
  // es "esto no está desplegado todavía".
  if (filas === null && !errorReal) return null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: "var(--r-xl)", display: "flex", flexDirection: "column",
      overflow: "hidden", marginTop: 10,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "11px 15px 4px", flexShrink: 0 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.005em", color: "var(--ink-1)", margin: 0 }}>
          Ocupación real vs esperada
        </h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{periodoLabel}</span>
      </div>
      {/* El rótulo de cada serie en palabras, no sólo en el color de la
          barra — la misma regla que rige el semáforo del plano. */}
      <p style={{ margin: "0 15px 8px", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
        <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>Esperada</b> — caras con contrato que cubre parte
        del período.{" "}
        <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>Real</b> — de ésas, cuántas tienen el montaje
        confirmado. Mismo total de caras comercializables en las dos.
      </p>

      {filas === undefined && (
        <div style={{ padding: "0 15px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skeleton" style={{ height: 34 }} />
          <div className="skeleton" style={{ height: 34 }} />
        </div>
      )}

      {errorReal && (
        <div style={{ padding: "0 15px 14px", fontSize: 12, color: "var(--ink-3)" }}>
          No se pudo cargar la ocupación por sede.
        </div>
      )}

      {filas !== undefined && filas !== null && (
        filas.length === 0 ? (
          <div style={{ padding: "0 15px 14px", fontSize: 12, color: "var(--ink-3)" }}>
            Ninguna sede tiene plano guardado todavía.
          </div>
        ) : (
          <>
            <div style={{ paddingBottom: 6 }}>
              {[...filas]
                .sort((a, b) => {
                  const aActual = a.sede.toUpperCase() === sedeActual.toUpperCase();
                  const bActual = b.sede.toUpperCase() === sedeActual.toUpperCase();
                  if (aActual !== bActual) return aActual ? -1 : 1;
                  return a.sede.localeCompare(b.sede);
                })
                .map((fila) => (
                  <BarraSede
                    key={fila.sede}
                    fila={fila}
                    esActual={fila.sede.toUpperCase() === sedeActual.toUpperCase()}
                    isAdmin={isAdmin}
                  />
                ))}
            </div>

            <div style={{ borderTop: "1px solid var(--line)" }}>
              <div style={{ padding: "10px 15px 2px" }}>
                <span className="rotulo">Detalle por sede</span>
              </div>
              <TablaOcupacion filas={filas} sedeActual={sedeActual} isAdmin={isAdmin} />
            </div>
          </>
        )
      )}

      {/* La brecha: el dato accionable. Sólo tiene sentido para la sede que
          está en pantalla — ver el docstring de arriba sobre por qué las
          demás no pueden traer códigos. */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 15px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="rotulo">Contratadas sin montar · {sedeActual}</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: brecha.length > 0 ? "var(--ink-1)" : "var(--libre)",
          }}>
            {brecha.length}
          </span>
        </div>
        {brecha.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--libre)" }}>
            Todas las caras contratadas para este período están montadas.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {brecha.map((b) => (
              <button
                key={`${b.id}-${b.face}`}
                type="button"
                onClick={onSeleccionarBrecha ? () => onSeleccionarBrecha(b.id, b.face) : undefined}
                disabled={!onSeleccionarBrecha}
                title={onSeleccionarBrecha ? "Verlo en el plano" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "5px 6px", border: "none", borderTop: "1px solid var(--line-soft)",
                  background: "none", textAlign: "left", fontFamily: "inherit",
                  cursor: onSeleccionarBrecha ? "pointer" : "default",
                }}
              >
                <span style={{
                  flexShrink: 0, width: 72, fontFamily: "var(--font-mono)",
                  fontWeight: 700, fontSize: 13, letterSpacing: "0.02em", color: "var(--ink-1)",
                }}>
                  {b.display}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12, color: "var(--ink-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {b.proveedor || "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
