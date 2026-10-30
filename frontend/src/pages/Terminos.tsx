import { useEffect, useState } from "react";
import { leerTerminos, type Terminos as TerminosVigentes } from "../api/legal";
import { renderMarkdownLite } from "../legal/markdownLite";

// ─── Página pública: Términos del servicio (auditoría P0-2) ─────────────────
//
// Igual que `PoliticaDatos`: sin login, resuelta en `App.tsx` mirando la URL,
// por fuera del `<BrowserRouter>`. A diferencia de la política, el texto NO
// viaja en el bundle: lo da el servidor (`GET /api/auth/terminos`) sólo
// cuando el dueño los marcó vigentes y ya no son un borrador. Mientras tanto
// la página dice que todavía no hay términos publicados.

export default function Terminos() {
  const [terminos, setTerminos] = useState<TerminosVigentes | null>(null);

  useEffect(() => {
    let vivo = true;
    void leerTerminos().then((t) => { if (vivo) setTerminos(t); });
    return () => { vivo = false; };
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <a
          href="/"
          style={{
            display: "inline-block", marginBottom: 16,
            fontSize: 12, fontWeight: 600, color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          ← Volver
        </a>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-xl)",
            padding: "28px 32px 36px",
          }}
        >
          {terminos === null ? (
            <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>Cargando…</p>
          ) : terminos.vigente && terminos.texto ? (
            renderMarkdownLite(terminos.texto)
          ) : (
            <>
              <h1 style={{ margin: "0 0 10px", fontSize: 20, color: "var(--ink-1)" }}>Términos del servicio</h1>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
                Todavía no hay términos del servicio publicados. Mientras tanto rige lo pactado con
                cada supermercado, y el tratamiento de los datos personales está en la{" "}
                <a href="/politica-datos" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  Política de Tratamiento de Datos Personales
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
