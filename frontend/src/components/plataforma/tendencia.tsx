import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CONSOLIDADO_SLUG,
  getTendencia,
  type ClientePlataforma,
  type PuntoTendencia,
  type Tendencia,
} from "../../api/plataforma";
import { describeError } from "../../api/client";
import { Panel, EstadoVacio, EstadoError } from "./consola";

// ─── Tendencia temporal (Fase 5) ─────────────────────────────────────────────
//
// Gráfico de LÍNEA propio en SVG — la tendencia es cambio en el tiempo, no
// comparación entre categorías (eso ya lo cubren las barras de Fase 4). Dos
// gráficos apilados (ocupación / ingreso), NUNCA doble eje: mezclar % y plata
// en el mismo eje Y falsea la lectura visual de cuál "sube más". Reusa
// `Panel` y los tokens `--con-*` de la consola; agrega sólo `--con-linea*`
// (definidos en index.css, claro y oscuro).
//
// Criterio de analista (agente-datos): el gráfico se lee en 5 segundos sin
// inventar — nunca se interpola sobre un hueco, nunca se compara contra un
// mes sin dato o suprimido, y el mes en curso (parcial) queda marcado y
// afuera de cualquier lectura de racha.

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});
const formatoCOP = (n: number): string => COP.format(n);
const formatoPct = (n: number): string => `${n.toFixed(1).replace(".", ",")} %`;

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function etiquetaMesCorta(periodo: string): string {
  const [a, m] = periodo.split("-");
  const idx = Number(m) - 1;
  const nombre = MESES_CORTOS[idx] ?? m;
  return `${nombre} ${a.slice(2)}`;
}

// ═══ Semántica del contrato: tres ausencias distintas + un 0 real ═══════════

type Campo = "ocupacion_pct" | "ingreso_contratado_mes";
type EstadoPunto = "normal" | "sindato" | "suprimido";

/** Valor comparable del punto para este campo, o `null` si no hay nada que
 *  graficar/comparar (sin snapshot, o suprimido/sin base para esta métrica
 *  puntual). Un 0 real NUNCA cae acá -- vuelve como `0`, no `null`. */
function valorDePunto(p: PuntoTendencia, campo: Campo): number | null {
  if (p.sin_dato) return null;
  return campo === "ingreso_contratado_mes" ? p.ingreso_contratado_mes : p.ocupacion_pct;
}

/** Estado visual del punto para este campo. La supresión K=3 (contrato Fase
 *  5, punto (b)) sólo se define sobre ingreso/canon/top -- nunca toca
 *  `ocupacion_pct` (no es una regla de privacidad, es "sin espacios
 *  comercializables ese mes"), así que ese caso se pinta como "sin dato" de
 *  ESA métrica puntual, no como K=3 (mentir el motivo sería peor que no
 *  mostrar nada). */
function estadoDePunto(p: PuntoTendencia, campo: Campo): EstadoPunto {
  if (p.sin_dato) return "sindato";
  if (campo === "ingreso_contratado_mes") {
    return p.ingreso_contratado_mes === null ? "suprimido" : "normal";
  }
  return p.ocupacion_pct === null ? "sindato" : "normal";
}

// ═══ LineaTendencia — gráfico de línea SVG propio ═══════════════════════════

const H = 150;
// El padding izquierdo (`PAD_L`) NO es una constante -- se calcula dentro de
// `LineaTendencia` a partir del texto de la etiqueta del techo del eje: el
// máximo de ingreso puede ser un monto largo ("$93.400.000"), y un ancho fijo
// lo recorta contra el borde del viewBox en ese caso o sobra en el caso común
// (ocupación, que siempre es "0"/"100,0 %").
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_H = H - PAD_T - PAD_B;
const ANCHO_POR_MES = 42;
const ANCHO_MIN = 320;

/** Redondea el techo del eje a un número "lindo" (múltiplo de una potencia de
 *  10 razonable) para que la etiqueta de arriba no sea un número pelado como
 *  "$13.482.219". Sólo aplica a ingreso -- ocupación siempre 0-100. */
function techoLindo(max: number): number {
  if (max <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(max));
  const pasos = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const p of pasos) {
    const techo = p * magnitud;
    if (techo >= max) return techo;
  }
  return magnitud * 10;
}

function LineaTendencia({
  serie, campo, ejeMax, formato, tooltipUnidad, tooltipContexto,
}: {
  serie: PuntoTendencia[];
  campo: Campo;
  /** `100` fijo para ocupación; para ingreso, el techo lindo del máximo. */
  ejeMax: number;
  formato: (n: number) => string;
  tooltipUnidad: string;
  tooltipContexto?: (p: PuntoTendencia) => string | null;
}) {
  const idHatch = useId();
  const n = serie.length;
  const etiquetaTecho = formato(ejeMax);
  // Ancho de la columna izquierda según el texto más largo que va a llevar
  // ("0" siempre, y el techo del eje -- que en ingreso puede ser
  // "$93.400.000"). Estimado por caracteres a fuente mono 9px; con margen
  // para que el número nunca quede recortado contra el borde del SVG.
  const PAD_L = Math.max(30, 14 + etiquetaTecho.length * 5.6);
  // El gráfico ocupa TODO el ancho del panel, no su mínimo: con `meet` y la
  // altura fija, un viewBox angosto se quedaba en ~40 % del panel pegado a la
  // izquierda. Se mide el contenedor y el viewBox lo sigue; el mínimo por mes
  // sólo manda cuando el panel es más angosto que eso (y ahí aparece el scroll).
  const contenedor = useRef<HTMLDivElement>(null);
  const [anchoPanel, setAnchoPanel] = useState(0);
  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      setAnchoPanel(Math.floor(entries[0]?.contentRect.width ?? 0));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(ANCHO_MIN + PAD_L + PAD_R, n * ANCHO_POR_MES + PAD_L + PAD_R, anchoPanel);

  const puntos = useMemo(() => {
    const plotW = W - PAD_L - PAD_R;
    return serie.map((p, i) => {
      const valor = valorDePunto(p, campo);
      const estado = estadoDePunto(p, campo);
      const x = PAD_L + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
      const vClamp = valor === null ? 0 : Math.max(0, Math.min(ejeMax, valor));
      const y = PAD_T + PLOT_H * (1 - vClamp / ejeMax);
      return { p, i, valor, estado, x, y };
    });
  }, [serie, campo, ejeMax, n, W]);

  const yBase = PAD_T + PLOT_H;

  // La línea se corta en cada hueco: sólo hay un tramo entre i e i+1 si AMBOS
  // tienen valor real. El tramo que entra al mes parcial se dibuja punteado.
  const tramos = useMemo(() => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number; punteado: boolean }> = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i];
      const b = puntos[i + 1];
      if (a.valor === null || b.valor === null) continue;
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, punteado: b.p.parcial });
    }
    return out;
  }, [puntos]);

  const ariaResumen = useMemo(() => {
    const conDato = puntos.filter((pt) => pt.valor !== null && !pt.p.parcial);
    if (conDato.length === 0) return `${tooltipUnidad}: sin datos en el período mostrado.`;
    const ultimo = conDato[conDato.length - 1];
    const primero = conDato[0];
    return (
      `${tooltipUnidad} de ${etiquetaMesCorta(primero.p.periodo)} a ${etiquetaMesCorta(ultimo.p.periodo)}: ` +
      `${conDato.length} mes${conDato.length === 1 ? "" : "es"} con dato, último ${etiquetaMesCorta(ultimo.p.periodo)} ${formato(ultimo.valor as number)}.`
    );
  }, [puntos, tooltipUnidad, formato]);

  return (
    <div>
      <div ref={contenedor} style={{ overflowX: "auto" }}>
        <div style={{ minWidth: W }}>
          <svg
            role="img"
            aria-label={ariaResumen}
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMinYMid meet"
          >
            <defs>
              <pattern id={idHatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" style={{ fill: "var(--con-surface)" }} />
                <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--con-suprimido-hatch)", strokeWidth: 2 }} />
              </pattern>
            </defs>

            {/* Eje: 0 y el techo, igual que las barras de Fase 4 (eje desde cero explícito). */}
            <line x1={PAD_L} y1={yBase} x2={W - PAD_R} y2={yBase} style={{ stroke: "var(--con-line)" }} strokeWidth={1} />
            <text x={PAD_L - 6} y={yBase + 3} textAnchor="end" fontSize={9} style={{ fill: "var(--con-ink-4)" }} fontFamily="var(--font-mono)">0</text>
            <text x={PAD_L - 6} y={PAD_T + 3} textAnchor="end" fontSize={9} style={{ fill: "var(--con-ink-4)" }} fontFamily="var(--font-mono)">
              {formato(ejeMax)}
            </text>

            {/* Tramos de línea -- cortados en cada hueco, punteados hacia el mes parcial. */}
            {tramos.map((t, i) => (
              <line
                key={i}
                x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                style={{ stroke: "var(--con-linea)" }}
                strokeWidth={2}
                strokeDasharray={t.punteado ? "4 3" : undefined}
              />
            ))}

            {/* Puntos + marcadores + etiquetas de mes. */}
            {puntos.map((pt) => {
              const tituloBase = `${pt.p.periodo}`;
              const contexto = tooltipContexto?.(pt.p);
              if (pt.estado === "sindato") {
                return (
                  <g key={pt.i}>
                    <line
                      x1={pt.x} y1={yBase - 5} x2={pt.x} y2={yBase + 5}
                      style={{ stroke: "var(--con-sindato-ink)" }} strokeWidth={2}
                    >
                      <title>{`${tituloBase} · sin dato`}</title>
                    </line>
                    <text x={pt.x} y={H - 4} textAnchor="middle" fontSize={8.5} style={{ fill: "var(--con-ink-4)" }}>
                      {etiquetaMesCorta(pt.p.periodo)}
                    </text>
                  </g>
                );
              }
              if (pt.estado === "suprimido") {
                return (
                  <g key={pt.i}>
                    <rect
                      x={pt.x - 4} y={yBase - 4} width={8} height={8}
                      style={{ fill: `url(#${idHatch})` }}
                      stroke="var(--con-suprimido-hatch)"
                    >
                      <title>{`${tituloBase} · ${tooltipUnidad} suprimido por privacidad (K=3)`}</title>
                    </rect>
                    <text x={pt.x} y={H - 4} textAnchor="middle" fontSize={8.5} style={{ fill: "var(--con-ink-4)" }}>
                      {etiquetaMesCorta(pt.p.periodo)}
                    </text>
                  </g>
                );
              }
              const valor = pt.valor as number;
              const titulo = `${tituloBase} · ${tooltipUnidad} ${formato(valor)}${contexto ? ` · ${contexto}` : ""}${pt.p.parcial ? " · parcial (mes en curso)" : ""}`;
              return (
                <g key={pt.i}>
                  <circle
                    cx={pt.x} cy={pt.y} r={pt.p.parcial ? 3.5 : 3}
                    style={{
                      fill: pt.p.parcial ? "var(--con-surface)" : "var(--con-linea-punto)",
                      stroke: "var(--con-linea-punto)",
                    }}
                    strokeWidth={pt.p.parcial ? 2 : 0}
                  >
                    <title>{titulo}</title>
                  </circle>
                  <text
                    x={pt.x} y={H - 4} textAnchor="middle" fontSize={8.5}
                    style={{ fill: pt.p.parcial ? "var(--con-ink-2)" : "var(--con-ink-4)" }}
                    fontWeight={pt.p.parcial ? 700 : 400}
                  >
                    {etiquetaMesCorta(pt.p.periodo)}{pt.p.parcial ? " ·" : ""}
                  </text>
                  {pt.p.parcial && (
                    <text x={pt.x} y={H - 4 + 9} textAnchor="middle" fontSize={7.5} style={{ fill: "var(--con-ink-3)" }} fontStyle="italic">
                      parcial
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Leyenda de marcadores -- sólo si aparece alguno en la serie. */}
      <LeyendaMarcadores serie={serie} campo={campo} />

      {/* Tabla accesible, oculta visualmente: mismos valores para lector de
          pantalla / navegación por teclado, sin depender del SVG. */}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 10.5, color: "var(--con-ink-4)", cursor: "pointer" }}>
          Ver valores por mes ({tooltipUnidad})
        </summary>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: 10.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", color: "var(--con-ink-4)", fontWeight: 500, padding: "2px 6px" }}>Mes</th>
              <th style={{ textAlign: "right", color: "var(--con-ink-4)", fontWeight: 500, padding: "2px 6px" }}>{tooltipUnidad}</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((pt) => (
              <tr key={pt.i} style={{ borderTop: "1px solid var(--con-line-soft)" }}>
                <td style={{ padding: "2px 6px", color: "var(--con-ink-2)" }}>
                  {pt.p.periodo}{pt.p.parcial ? " (parcial)" : ""}
                </td>
                <td style={{ padding: "2px 6px", textAlign: "right", color: "var(--con-ink-2)", fontFamily: "var(--font-mono)" }}>
                  {pt.estado === "sindato" ? "sin dato" : pt.estado === "suprimido" ? "‹3 (suprimido)" : formato(pt.valor as number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function LeyendaMarcadores({ serie, campo }: { serie: PuntoTendencia[]; campo: Campo }) {
  const estados = useMemo(() => new Set(serie.map((p) => estadoDePunto(p, campo))), [serie, campo]);
  const items: string[] = [];
  if (estados.has("sindato")) items.push("sin dato");
  if (estados.has("suprimido")) items.push("suprimido por privacidad (K=3)");
  if (serie.some((p) => p.parcial)) items.push("parcial (mes en curso)");
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 10, color: "var(--con-ink-4)" }}>
      {items.map((t) => <span key={t}>· {t}</span>)}
    </div>
  );
}

// ═══ Lectura accionable (criterio analista) ═════════════════════════════════
//
// Nunca compara contra un mes sin dato, un suprimido, ni el mes parcial. Sin
// al menos dos meses CALENDARIO-ADYACENTES con valor real no dice nada -- ni
// "estable".

function lecturaAccionable(serie: PuntoTendencia[], campo: Campo, formatoDelta: (n: number) => string): string | null {
  const valores = serie.map((p) => (p.parcial ? null : valorDePunto(p, campo)));

  let iActual = -1;
  for (let i = valores.length - 1; i >= 0; i--) {
    if (valores[i] !== null) { iActual = i; break; }
  }
  if (iActual < 1) return null; // no hay "último cerrado", o no hay mes anterior en la serie

  const actual = valores[iActual] as number;
  const anterior = valores[iActual - 1];
  if (anterior === null) return null; // el mes calendario anterior no es comparable -- no se inventa

  const frases: string[] = [];

  // Delta vs mes anterior.
  const delta = actual - anterior;
  if (Math.abs(delta) > 1e-9) {
    frases.push(`vs mes anterior: ${formatoDelta(delta)}`);
  }

  // Racha: pasos consecutivos, calendario-adyacentes, todos en la misma
  // dirección, terminando en el último mes cerrado.
  let pasos = 0;
  let direccion: "sube" | "baja" | null = null;
  let i = iActual;
  while (i - 1 >= 0 && valores[i] !== null && valores[i - 1] !== null) {
    const d = (valores[i] as number) - (valores[i - 1] as number);
    if (d === 0) break;
    const dir = d > 0 ? "sube" : "baja";
    if (direccion === null) direccion = dir;
    else if (dir !== direccion) break;
    pasos += 1;
    i -= 1;
  }
  if (pasos >= 2 && direccion) {
    frases.push(`${direccion === "sube" ? "subió" : "bajó"} ${pasos} meses seguidos`);
  }

  if (frases.length === 0) return null;
  return frases.join(" · ");
}

function formatoDeltaPct(n: number): string {
  const signo = n > 0 ? "+" : "";
  return `${signo}${n.toFixed(1).replace(".", ",")} pts`;
}

function formatoDeltaCOP(n: number, base: number): string {
  const signo = n > 0 ? "+" : "";
  if (base > 0) {
    const pct = (n / base) * 100;
    return `${signo}${pct.toFixed(1).replace(".", ",")} %`;
  }
  return `${signo}${formatoCOP(n)}`;
}

// ═══ PanelTendencia ══════════════════════════════════════════════════════════

const selectStyle: React.CSSProperties = {
  height: 30, padding: "0 8px",
  borderRadius: "var(--r-md)", border: "1px solid var(--con-line)",
  background: "var(--con-surface)", color: "var(--con-ink-1)",
  fontSize: 11.5, fontFamily: "inherit", outline: "none",
};

export function PanelTendencia({
  clientes, tendencia, loading, error, cliente, meses, onCambiarCliente, onCambiarMeses,
}: {
  clientes: ClientePlataforma[] | null;
  tendencia: Tendencia | null;
  loading: boolean;
  error: string | null;
  cliente: string;
  meses: number;
  onCambiarCliente: (slug: string) => void;
  onCambiarMeses: (n: number) => void;
}) {
  const serie = tendencia?.serie ?? [];
  const conDato = serie.filter((p) => !p.sin_dato).length;
  const hayHistoria = conDato >= 2;

  const lecturaOcupacion = tendencia ? lecturaAccionable(serie, "ocupacion_pct", formatoDeltaPct) : null;
  const lecturaIngreso = tendencia
    ? lecturaAccionable(
        serie,
        "ingreso_contratado_mes",
        (n) => {
          // base = valor del mes anterior comparable, para el % -- se recalcula
          // acá porque `lecturaAccionable` sólo conoce el delta.
          const valores = serie.map((p) => (p.parcial ? null : valorDePunto(p, "ingreso_contratado_mes")));
          let iActual = -1;
          for (let i = valores.length - 1; i >= 0; i--) if (valores[i] !== null) { iActual = i; break; }
          const base = iActual > 0 ? (valores[iActual - 1] as number) : 0;
          return formatoDeltaCOP(n, base);
        }
      )
    : null;

  const ejeMaxIngreso = useMemo(() => {
    const max = serie.reduce((m, p) => {
      const v = valorDePunto(p, "ingreso_contratado_mes");
      return v !== null ? Math.max(m, v) : m;
    }, 0);
    return techoLindo(max);
  }, [serie]);

  return (
    <Panel
      titulo="Tendencia"
      subtitulo="Evolución mensual de ocupación e ingreso contratado -- consolidado o por cliente. El mes en curso queda marcado como parcial."
      aside={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Cliente"
            value={cliente}
            onChange={(e) => onCambiarCliente(e.target.value)}
            className="con-focusable"
            style={selectStyle}
          >
            <option value={CONSOLIDADO_SLUG}>Consolidado</option>
            {(clientes ?? []).map((c) => (
              <option key={c.slug} value={c.slug}>{c.nombre}</option>
            ))}
          </select>
          <select
            aria-label="Meses"
            value={meses}
            onChange={(e) => onCambiarMeses(Number(e.target.value))}
            className="con-focusable"
            style={selectStyle}
          >
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
          </select>
        </div>
      }
    >
      {error ? (
        <EstadoError texto={error} />
      ) : loading || !tendencia ? (
        <EstadoVacio texto="Cargando tendencia…" />
      ) : !hayHistoria ? (
        <EstadoVacio texto="Hace falta más de un mes de historia para ver tendencia. El mes en curso se guarda cada vez que abrís las métricas; los meses cerrados se guardan solos." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>Ocupación (%)</h3>
              {lecturaOcupacion && (
                <span style={{ fontSize: 11, color: "var(--con-ink-3)" }}>{lecturaOcupacion}</span>
              )}
            </div>
            <LineaTendencia
              serie={serie}
              campo="ocupacion_pct"
              ejeMax={100}
              formato={formatoPct}
              tooltipUnidad="Ocupación"
              tooltipContexto={(p) =>
                p.espacios_comercializables !== null ? `${p.espacios_comercializables} espacios` : null
              }
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>Ingreso contratado (mes)</h3>
              {lecturaIngreso && (
                <span style={{ fontSize: 11, color: "var(--con-ink-3)" }}>{lecturaIngreso}</span>
              )}
            </div>
            <LineaTendencia
              serie={serie}
              campo="ingreso_contratado_mes"
              ejeMax={ejeMaxIngreso}
              formato={formatoCOP}
              tooltipUnidad="Ingreso contratado"
              tooltipContexto={(p) =>
                p.clientes_incluidos !== null ? `${p.clientes_incluidos} cliente${p.clientes_incluidos === 1 ? "" : "s"} incluidos` : null
              }
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

// Hook chico para que Plataforma.tsx no tenga que rearmar la lógica de carga
// (mismo patrón que el resto de la página: estado + loading + error acá
// mismo, sólo que como hook para no exportar setState crudo).
export function useTendencia() {
  const [cliente, setCliente] = useState(CONSOLIDADO_SLUG);
  const [meses, setMeses] = useState(12);
  const [tendencia, setTendencia] = useState<Tendencia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = (c: string = cliente, m: number = meses) => {
    setLoading(true);
    setError(null);
    getTendencia(c, m)
      .then(setTendencia)
      .catch((err) => setError(describeError(err, "No se pudo leer la tendencia.")))
      .finally(() => setLoading(false));
  };

  return { cliente, setCliente, meses, setMeses, tendencia, loading, error, cargar };
}
