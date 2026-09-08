import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

// ─── Primitivas visuales de la consola de plataforma (Fase 4b) ──────────────
//
// Sistema visual PROPIO del operador — carácter de back-office / BI, distinto
// de la vista de sede del cliente. Todo se pinta con tokens `--con-*`
// (definidos en `index.css`, tema claro en `:root` y oscuro bajo
// `html[data-tema="oscuro"]` — el MISMO atributo que el resto del interior,
// desde Fase 10), así que estas piezas cambian de tema sin tocar una línea de
// JS: el color lo decide el atributo de la raíz.
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

// ═══ Tema claro/oscuro — ya no vive acá ════════════════════════════════════
//
// Fase 10 dejó a la consola sin llave propia (`recabra-consola-tema`) y sin
// default propio: pasó a leer y escribir `recabra-tema` como el resto del
// interior. Pero quedó un SEGUNDO botón —`TemaToggle`, con borde y con el
// `aria-label` «Cambiar a tema oscuro»— junto al de `src/tema.tsx` («Cambiar a
// modo oscuro», sin borde). Las tres pantallas de plataforma usaban uno u otro
// según de dónde venían: la cartera el compartido, la sesión y el informe el de
// acá. Mismo atributo, misma llave, dos botones que se ven y se anuncian
// distinto en la misma área.
//
// Ahora hay UNO: `TemaToggle` de `src/tema.tsx`. Con él se fueron los alias
// `ConsolaTema`, `temaInicial` y `guardarTema`, que ya sólo servían para
// alimentar a este botón; quien necesite el tema usa `useTema()` del módulo
// compartido, que es donde vive la verdad.

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
          <h2 style={{ margin: 0, fontSize: "var(--t-xs)", fontWeight: 700, color: "var(--con-ink-1)" }}>
            {titulo}
          </h2>
          {subtitulo != null && (
            <div style={{ marginTop: 2, fontSize: "var(--t-2xs)", color: "var(--con-ink-3)", lineHeight: 1.4 }}>
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
    <div style={{ padding: "6px 0", fontSize: "var(--t-2xs)", color: "var(--con-ink-4)", fontStyle: "italic" }}>
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
        padding: "6px 0", fontSize: "var(--t-2xs)", color: "var(--con-estado-corte)", lineHeight: 1.45,
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{texto}</span>
    </div>
  );
}

// ═══ Impresión: paleta clara forzada (Fase 7/8) ═════════════════════════════
//
// La misma paleta clara que `ReportePlataforma.tsx` fija en su bloque
// `@media print` (Fase 7) -- extraída acá para que `DetalleCliente.tsx`
// (Fase 8, "Imprimir recomendaciones") la use sin duplicar la lista de
// tokens. Es sólo el CUERPO de declaraciones `--con-*` + `background`/`color`
// que cada página cuelga de su propio selector raíz dentro de un
// `@media print { .mi-clase-raiz { ...ESTO... } }` -- no incluye el
// `@media print` en sí, porque cada página oculta y particiona sus propias
// secciones de forma distinta.
export const IMPRESION_CLARA_VARS = `
  --con-bg: #FFFFFF !important;
  --con-surface: #FFFFFF !important;
  --con-surface-2: #FFFFFF !important;
  --con-surface-raised: #FFFFFF !important;
  --con-line: #C7CED0 !important;
  --con-line-soft: #DEE2E3 !important;
  --con-ink-1: #14181C !important;
  --con-ink-2: #4A5459 !important;
  --con-ink-3: #6B7479 !important;
  --con-ink-4: #8E979B !important;
  --con-accent: #275A7A !important;
  --con-accent-ink: #FFFFFF !important;
  --con-sindato-ink: #8E979B !important;
  --con-estado-corte: #8E1226 !important;
  background: #FFFFFF !important;
  color: #14181C !important;
`;

// ═══ Tabla de densidad de tablero ═══════════════════════════════════════════
//
// Pseudo-tabla en grid: legible con 1 fila y con 30. Cabecera en versalita,
// filas con realce al pasar (`con-fila`), hairline entre filas. Las columnas
// las define quien la usa (anchos por celda) para poder mezclar métricas y
// controles; estas piezas sólo fijan el ritmo vertical y los estados.

const filaBase: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  padding: "8px 16px",
  borderTop: "1px solid var(--con-line-soft)",
};

/** Fila de la tabla, con realce al pasar. */
export function Fila({ children }: { children: ReactNode }) {
  return <div className="con-fila" style={filaBase}>{children}</div>;
}
