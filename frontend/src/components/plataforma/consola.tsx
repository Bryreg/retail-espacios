import type { CSSProperties, ReactNode } from "react";
import { Sun, Moon, AlertTriangle } from "lucide-react";
import type { EstadoCuenta } from "../../api/plataforma";

// ─── Primitivas visuales de la consola de plataforma (Fase 4b) ──────────────
//
// Sistema visual PROPIO del operador — carácter de back-office / BI, distinto
// de la vista de sede del cliente. Todo se pinta con tokens `--con-*`
// (definidos en `index.css`, tema claro en `:root` y oscuro bajo
// `[data-consola-tema="oscuro"]`), así que estas piezas cambian de tema sin
// tocar una línea de JS: el color lo decide el atributo en la raíz.
//
// Reglas que estas primitivas fijan y que el resto de la consola hereda:
//  · Ocupación (y cualquier %) es MAGNITUD: barra secuencial `--con-mag-*`,
//    con eje desde cero. NUNCA la terna de estado.
//  · Estado de cuenta usa la terna (`--con-estado-*`) — activo neutro,
//    gracia/solo_lectura ámbar, suspendido rojo — siempre con punto + palabra,
//    nunca color solo.
//  · Fase 7: los agregados por cliente son EXACTOS, sin umbral de privacidad
//    — la contrapartida es el reporte de transparencia. Un dato ausente es
//    "sin dato" (— apagado), nunca una supresión; distinto de un 0 real.
//  · Todo lo interactivo lleva foco de teclado visible (clase `con-focusable`
//    o `con-bar-row`).
//
// El ENCUADRE DE NEGOCIO de cada métrica (qué pregunta responde, orden de las
// barras, textos de tooltip, roadmap) lo cierra el Analista después. Estas
// primitivas son presentacionales: reciben datos ya formateados y no deciden
// significado.

// ═══ Tema claro/oscuro ══════════════════════════════════════════════════════

export type ConsolaTema = "claro" | "oscuro";

const TEMA_KEY = "recabra-consola-tema";

/** Tema inicial: preferencia guardada del operador si la hay, si no la del
 *  sistema (`prefers-color-scheme`). Es una preferencia de UI — NO es dato de
 *  cliente ni métrica, así que persistirla no roza el guardrail de
 *  localStorage (que cubre la lista de clientes y las métricas). Todo lectura
 *  de storage va en try/catch: una ventana privada puede tirar al leer. */
export function temaInicial(): ConsolaTema {
  try {
    const guardado = localStorage.getItem(TEMA_KEY);
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch {
    /* storage bloqueado: caemos a la preferencia del sistema */
  }
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "oscuro";
  } catch {
    /* sin matchMedia: claro por defecto */
  }
  return "claro";
}

export function guardarTema(tema: ConsolaTema): void {
  try {
    localStorage.setItem(TEMA_KEY, tema);
  } catch {
    /* no persiste: el tema sigue vivo en el estado del componente igual */
  }
}

/** Botón para alternar claro/oscuro. Muestra el ícono del tema al que se va
 *  (sol cuando estás en oscuro), con `aria-label` explícito. */
export function TemaToggle({ tema, onToggle }: { tema: ConsolaTema; onToggle: () => void }) {
  const vaAOscuro = tema === "claro";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="con-focusable"
      aria-label={vaAOscuro ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={vaAOscuro ? "Tema oscuro" : "Tema claro"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 28, width: 28, padding: 0,
        borderRadius: "var(--r-md)",
        background: "transparent",
        border: "1px solid var(--con-line)",
        color: "var(--con-ink-2)", cursor: "pointer",
      }}
    >
      {vaAOscuro ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}

// ═══ Panel ══════════════════════════════════════════════════════════════════

/** Tarjeta de la consola. `titulo` obligatorio; `subtitulo` opcional (una
 *  línea de contexto), `aside` va a la derecha del título (un control, un
 *  conteo). `sinPadding` para tablas que llevan su propio interior. */
export function Panel({
  titulo, subtitulo, aside, children, sinPadding,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  sinPadding?: boolean;
}) {
  return (
    <section
      style={{
        background: "var(--con-surface)",
        border: "1px solid var(--con-line)",
        borderRadius: "var(--r-xl)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 16px",
          borderBottom: "1px solid var(--con-line-soft)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--con-ink-1)" }}>
            {titulo}
          </h2>
          {subtitulo != null && (
            <div style={{ marginTop: 2, fontSize: 11, color: "var(--con-ink-3)", lineHeight: 1.4 }}>
              {subtitulo}
            </div>
          )}
        </div>
        {aside != null && <div style={{ marginLeft: "auto", flexShrink: 0 }}>{aside}</div>}
      </header>
      <div style={sinPadding ? undefined : { padding: "14px 16px" }}>{children}</div>
    </section>
  );
}

// ═══ Estado vacío / error dentro de un panel ════════════════════════════════

export function EstadoVacio({ texto }: { texto: string }) {
  return (
    <div style={{ padding: "6px 0", fontSize: 12, color: "var(--con-ink-4)", fontStyle: "italic" }}>
      {texto}
    </div>
  );
}

export function EstadoError({ texto }: { texto: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "6px 0", fontSize: 12, color: "var(--con-estado-corte)", lineHeight: 1.45,
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{texto}</span>
    </div>
  );
}

// ═══ KPI tile ═══════════════════════════════════════════════════════════════
//
// Jerarquía: el número va grande y PRIMERO; el rótulo lo nombra arriba en
// versalita; el contexto (una lectura corta) va debajo, chico. Máximo un nivel
// de énfasis por tarjeta: sólo el número pesa. `variante="hero"` es la cifra
// por la que el dueño abre la consola.

export function KpiTile({
  rotulo, valor, contexto, hint, variante = "normal",
}: {
  rotulo: string;
  /** Ya formateado por quien llama (incluye "—" cuando es null). */
  valor: string;
  /** Lectura corta bajo el número — el Analista la completa con el encuadre. */
  contexto?: ReactNode;
  /** Tooltip nativo con la definición de la métrica. */
  hint?: string;
  variante?: "normal" | "hero";
}) {
  const hero = variante === "hero";
  const vacio = valor === "—";
  return (
    <div
      title={hint}
      style={{
        flex: hero ? "2 1 260px" : "1 1 150px",
        minWidth: hero ? 240 : 140,
        display: "flex", flexDirection: "column", gap: hero ? 8 : 6,
        padding: hero ? "16px 18px" : "13px 15px",
        background: "var(--con-surface-raised)",
        border: "1px solid var(--con-line)",
        borderLeft: hero ? "3px solid var(--con-accent)" : "1px solid var(--con-line)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div className="rotulo" style={{ color: "var(--con-ink-3)" }}>{rotulo}</div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: hero ? 27 : 17,
          fontWeight: 900,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          color: vacio ? "var(--con-sindato-ink)" : "var(--con-ink-1)",
        }}
      >
        {valor}
      </div>
      {contexto != null && (
        <div style={{ fontSize: 11, color: "var(--con-ink-3)", lineHeight: 1.4 }}>{contexto}</div>
      )}
    </div>
  );
}

// ═══ Barras horizontales con eje desde cero ═════════════════════════════════
//
// Comparación de magnitudes. El track dibuja el rango 0→máx y el relleno la
// proporción, así el eje-cero es explícito (además de las marcas 0 y máx bajo
// el grupo). Dos tonos: "magnitud" (azul, para %) y "conteo" (grafito, para
// cantidades) — ninguno es color de estado.

const GRID_BARRA = "minmax(84px, 38%) 1fr 58px";

export type TonoBarra = "magnitud" | "conteo";
export type EstadoBarra = "normal" | "sindato";

function pistaColor(tono: TonoBarra): string {
  return tono === "magnitud" ? "var(--con-mag-track)" : "var(--con-bar-neutral-track)";
}
function rellenoColor(tono: TonoBarra): string {
  return tono === "magnitud" ? "var(--con-mag-fill)" : "var(--con-bar-neutral)";
}

/** Contenedor del grupo: dibuja el eje (0 … máx) alineado bajo los tracks. */
export function Barras({
  etiquetaMax, children,
}: {
  /** Texto de la marca del extremo derecho (p. ej. "100%" o el conteo tope). */
  etiquetaMax: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
      {/* Eje: alineado con la columna del track (celda central del grid). */}
      <div style={{ display: "grid", gridTemplateColumns: GRID_BARRA, gap: 10, marginTop: 6 }}>
        <div />
        <div style={{ position: "relative", height: 14, borderTop: "1px solid var(--con-line)" }}>
          <span style={{ position: "absolute", left: 0, top: 2, fontSize: 9.5, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)" }}>0</span>
          <span style={{ position: "absolute", right: 0, top: 2, fontSize: 9.5, color: "var(--con-ink-4)", fontFamily: "var(--font-mono)" }} title={`Máximo del eje: ${etiquetaMax}`}>{etiquetaMax}</span>
        </div>
        <div />
      </div>
    </div>
  );
}

/** Una barra. `estado`:
 *   · "normal"  → track + relleno a la proporción, texto = valor.
 *   · "sindato" → sin barra, texto = "—" apagado.
 *  Es enfocable con teclado (cada barra es un dato inspeccionable); el
 *  Analista puede colgar el tooltip de contenido del `aria-label`/`title`. */
export function BarraFila({
  label, valor, max, texto, tono = "magnitud", estado = "normal", hint,
}: {
  label: string;
  valor: number;
  max: number;
  /** Valor ya formateado para la etiqueta derecha. */
  texto: string;
  tono?: TonoBarra;
  estado?: EstadoBarra;
  hint?: string;
}) {
  const pct = estado === "normal" && max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  const aria =
    estado === "sindato" ? `${label}: sin dato`
    : `${label}: ${texto}`;

  return (
    <div
      className="con-bar-row"
      tabIndex={0}
      role="group"
      aria-label={aria}
      title={hint}
      style={{ display: "grid", gridTemplateColumns: GRID_BARRA, alignItems: "center", gap: 10, padding: "4px 4px" }}
    >
      <div
        style={{ fontSize: 11.5, color: "var(--con-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={label}
      >
        {label}
      </div>

      {estado === "sindato" ? (
        <div style={{ height: 14, display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "var(--con-sindato-ink)", fontStyle: "italic" }}>sin dato</span>
        </div>
      ) : (
        <div style={{ height: 14, borderRadius: "var(--r-sm)", background: pistaColor(tono), overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: rellenoColor(tono), borderRadius: "var(--r-sm)" }} />
        </div>
      )}

      <div style={{ textAlign: "right", fontSize: 11.5, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
        {estado === "sindato" ? (
          <span style={{ color: "var(--con-sindato-ink)" }}>—</span>
        ) : (
          <span style={{ color: "var(--con-ink-1)" }}>{texto}</span>
        )}
      </div>
    </div>
  );
}

// ═══ Estado de cuenta: punto + palabra (la terna, reservada a esto) ═════════

function tonoEstado(e: EstadoCuenta): string {
  if (e === "activo") return "var(--con-estado-activo)";
  if (e === "gracia" || e === "solo_lectura") return "var(--con-estado-aviso)";
  return "var(--con-estado-corte)";
}
export function etiquetaEstado(e: EstadoCuenta): string {
  if (e === "activo") return "Activo";
  if (e === "gracia") return "Gracia";
  if (e === "solo_lectura") return "Solo lectura";
  return "Suspendido";
}

/** Punto de color + palabra. El color acompaña, no reemplaza: la palabra
 *  siempre está. */
export function EstadoPill({ estado }: { estado: EstadoCuenta }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: 999, background: tonoEstado(estado), flexShrink: 0 }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--con-ink-2)" }}>
        {etiquetaEstado(estado)}
      </span>
    </span>
  );
}

// ═══ Sin dato — distinto de un 0 real ═══════════════════════════════════════

/** Ausencia real de dato: un guion en el tono de vacío. Distinto del 0 —
 *  Fase 7 quitó la supresión de celda chica: los agregados por cliente
 *  ahora son EXACTOS, sin umbral, así que esto sólo aparece cuando de verdad
 *  no hay nada que mostrar (p. ej. cero contratos activos en el período). */
export function SinDato({ title = "Sin dato para este período" }: { title?: string }) {
  return <span title={title} style={{ color: "var(--con-sindato-ink)" }}>—</span>;
}

// ═══ Tabla de densidad de tablero ═══════════════════════════════════════════
//
// Pseudo-tabla en grid: legible con 1 fila y con 30. Cabecera en versalita,
// filas con realce al pasar (`con-fila`), hairline entre filas. Las columnas
// las define quien la usa (anchos por celda) para poder mezclar métricas y
// controles; estas piezas sólo fijan el ritmo vertical y los estados.

export function TablaScroll({ minWidth = 720, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

const filaBase: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  padding: "8px 16px",
  borderTop: "1px solid var(--con-line-soft)",
};

export function TablaHeadCelda({
  children, width, flex, alinear = "left",
}: {
  children: ReactNode; width?: number; flex?: string; alinear?: "left" | "right";
}) {
  return (
    <div
      className="rotulo"
      style={{ ...(flex ? { flex } : { width, flexShrink: 0 }), color: "var(--con-ink-4)", textAlign: alinear }}
    >
      {children}
    </div>
  );
}

export function TablaHead({ children }: { children: ReactNode }) {
  return <div style={{ ...filaBase, padding: "7px 16px" }}>{children}</div>;
}

/** Fila de la tabla, con realce al pasar. */
export function Fila({ children }: { children: ReactNode }) {
  return <div className="con-fila" style={filaBase}>{children}</div>;
}
