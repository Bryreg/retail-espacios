import { Suspense, lazy, useEffect, useRef } from "react";

const Login = lazy(() => import("../pages/Login"));

/**
 * El ingreso encima de la landing (Fase 10). «Crear mi cuenta» y «Ya tengo
 * cuenta» ya no saltan a `/login`: la portada dispara `recabra:ingresar`,
 * `App.tsx` monta esta hoja y el formulario de siempre entra perezoso.
 *
 * Mientras está abierta, el `<html>` toma el tema de la landing (oscuro salvo
 * que la portada esté en claro) para que los tokens del formulario pinten a
 * juego; al cerrarse vuelve lo que había. Escape, el velo y la × cierran.
 */
export default function HojaIngreso({ modo, onCerrar }: {
  modo: "login" | "registro";
  onCerrar: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const antes = html.dataset.tema;
    if (html.dataset.lpTema === "claro") delete html.dataset.tema;
    else html.dataset.tema = "oscuro";
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (antes === undefined) delete html.dataset.tema;
      else html.dataset.tema = antes;
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      panel.current?.querySelector<HTMLElement>("input, button:not(.hoja-ingreso__cerrar)")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="hoja-ingreso" role="dialog" aria-modal="true"
      aria-label={modo === "registro" ? "Crear mi cuenta" : "Ingresar a RECABRA"}>
      <div className="hoja-ingreso__velo" onClick={onCerrar} aria-hidden="true" />
      <div className="hoja-ingreso__panel" ref={panel}>
        <button type="button" className="hoja-ingreso__cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        <Suspense fallback={<div aria-busy="true" style={{ minHeight: 320 }} />}>
          <Login enHoja modoInicial={modo} />
        </Suspense>
      </div>
    </div>
  );
}
