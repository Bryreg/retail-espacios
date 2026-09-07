import { Suspense, lazy, useEffect } from "react";

const Login = lazy(() => import("../pages/Login"));

/**
 * El ingreso ADENTRO de la portada (Fase 10). «Crear mi cuenta» y «Ya tengo
 * cuenta» ya no saltan a `/login`: la landing dispara `recabra:ingresar`,
 * `App.tsx` arma este componente y se lo pasa a `<Landing ingreso={…}>`, que
 * lo pone en la tarjeta del hero, al lado del plano, que sigue vivo. El
 * formulario de siempre entra perezoso.
 *
 * Mientras está montado, el `<html>` toma el tema de la landing (oscuro salvo
 * que la portada esté en claro) para que los tokens de :root del formulario
 * pinten a juego; al desmontarse vuelve lo que había.
 */
export default function IngresoPortada({ modo, onCerrar }: {
  modo: "login" | "registro";
  onCerrar: () => void;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.dataset.tema;
    if (html.dataset.lpTema === "claro") delete html.dataset.tema;
    else html.dataset.tema = "oscuro";
    return () => {
      if (antes === undefined) delete html.dataset.tema;
      else html.dataset.tema = antes;
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div>
      <button
        type="button"
        onClick={onCerrar}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6,
          padding: "6px 10px 6px 6px", borderRadius: 999, border: "1px solid var(--line)",
          background: "transparent", color: "var(--ink-2)", cursor: "pointer",
          font: "inherit", fontSize: 12.5,
        }}
      >
        <span aria-hidden="true">←</span> Volver a la portada
      </button>
      <Suspense fallback={<div aria-busy="true" style={{ minHeight: 320 }} />}>
        <Login enHoja modoInicial={modo} />
      </Suspense>
    </div>
  );
}
