/**
 * Cuando el 3D no se puede dibujar (auditoría pre-lanzamiento, P2-19).
 *
 * Antes sólo la landing escuchaba `webglcontextlost`; el editor decía «Error en
 * el editor 3D / Reintentar» sin la causa, y sin WebGL quedaba un rectángulo
 * negro. Ahora hay tres causas, cada una con su texto, y la salida al 2D (donde
 * se hace todo lo del plano) cuando la pantalla la tiene.
 *
 * - `sin_webgl`: el navegador no da WebGL (aceleración apagada, equipo viejo,
 *   un escritorio remoto). Se mira ANTES de montar el lienzo (`hayWebGL`).
 * - `perdido`: el contexto se perdió con el 3D abierto (muchas pestañas, la
 *   GPU reiniciada, volver de la suspensión). Lo avisa `webglcontextlost`.
 * - `error`: cualquier otro error al dibujar la escena (lo ataja el límite).
 */

export type CausaSinLienzo = "sin_webgl" | "perdido" | "error";

/** ¿Este navegador puede crear un contexto WebGL? El de prueba se suelta en el
 *  acto: los navegadores tienen un tope de contextos vivos por página. */
export function hayWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const lienzo = document.createElement("canvas");
    const gl = (lienzo.getContext("webgl2") || lienzo.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** ¿El error es del navegador que no da WebGL? (Three lo dice así.) */
export function esFaltaDeWebGL(error: unknown): boolean {
  const texto = error instanceof Error ? error.message : String(error ?? "");
  return /WebGL context|WebGL is not supported|creating WebGL/i.test(texto);
}

const TEXTOS: Record<CausaSinLienzo, { titulo: string; cuerpo: string }> = {
  sin_webgl: {
    titulo: "Este navegador no puede mostrar el 3D",
    cuerpo:
      "Le falta WebGL: la aceleración gráfica está apagada o el equipo no la tiene. Todo lo del plano se hace en el 2D. Para ver el 3D, prendé «Usar aceleración por hardware» en la configuración del navegador o probá con otro (Chrome, Edge o Firefox al día).",
  },
  perdido: {
    titulo: "El 3D se detuvo",
    cuerpo:
      "La tarjeta de video dejó de responder: pasa con muchas pestañas abiertas o al volver de la suspensión. No se perdió nada; lo guardado sigue guardado.",
  },
  error: {
    titulo: "El 3D no se pudo dibujar",
    cuerpo: "Algo falló al dibujar la escena. No se perdió nada; lo guardado sigue guardado.",
  },
};

export function SinLienzo({ causa, detalle, onReintentar, irAl2D }: {
  causa: CausaSinLienzo;
  detalle?: string;
  /** Volver a montar el lienzo (no se ofrece si el navegador no tiene WebGL). */
  onReintentar?: () => void;
  /** La salida al plano 2D; sin ella (el visor de Vender), no se ofrece. */
  irAl2D?: () => void;
}) {
  const t = TEXTOS[causa];
  return (
    <div
      role="alert"
      data-sin-lienzo={causa}
      style={{
        position: "absolute", inset: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        background: "var(--dark-bg)", color: "var(--dark-ink-1)",
      }}
    >
      <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 10, textAlign: "center", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t.titulo}</p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--dark-ink-2)" }}>{t.cuerpo}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
          {irAl2D && (
            <button type="button" onClick={irAl2D} data-ir-al-2d style={BOTON}>
              Abrir el plano 2D
            </button>
          )}
          {onReintentar && causa !== "sin_webgl" && (
            <button type="button" onClick={onReintentar} data-reintentar-3d style={BOTON}>
              Volver a abrir el 3D
            </button>
          )}
        </div>
        {detalle && (
          <details style={{ fontSize: 12, color: "var(--dark-ink-3)" }}>
            <summary style={{ cursor: "pointer" }}>Detalle para soporte</summary>
            <code style={{ display: "block", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{detalle}</code>
          </details>
        )}
      </div>
    </div>
  );
}

const BOTON: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 8,
  border: "1px solid var(--dark-line-2)", background: "var(--dark-surface-2)", color: "var(--dark-ink-1)",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};
