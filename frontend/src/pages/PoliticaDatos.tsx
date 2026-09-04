import politicaMd from "../legal/politica-datos.md?raw";
import { renderMarkdownLite } from "../legal/markdownLite";

// ─── Página pública: Política de Tratamiento de Datos Personales (Fase 3) ──
//
// Accesible SIN login — `App.tsx` la resuelve mirando `window.location.pathname`
// ANTES de decidir si mostrar el login o el tablero, exactamente como ya hace
// con el enlace de montaje (`?montaje=1`). Por eso este componente no usa
// `react-router`: se monta por fuera del `<BrowserRouter>` que envuelve el
// resto de la app, y un `<Link>` acá adentro reventaría sin el contexto de
// router.
//
// El contenido es el documento legal (`src/legal/politica-datos.md`), que no
// es de este builder: lo escribe/mantiene un agente legal, y esta página se
// limita a traerlo con `?raw` y pintarlo legible con `markdownLite`.

export default function PoliticaDatos() {
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
          {renderMarkdownLite(politicaMd)}
        </div>
      </div>
    </div>
  );
}
