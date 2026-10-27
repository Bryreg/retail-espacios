import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useModalAbierto } from "../../tema";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/**
 * Un cajón que se abre encima de la pantalla en uso (rediseño UX 2026-10): la
 * bandeja de Pendientes y la ficha del espacio. A la derecha desde 640 px, y
 * en el teléfono una hoja que sube desde abajo (`armazon.css`).
 *
 * Mientras está abierto ÉL es la pantalla: el botón principal de lo que quedó
 * atrás se apaga (`useModalAbierto`, la regla de un solo botón principal) y
 * Esc lo cierra. Tocar afuera también: la pantalla de atrás sigue ahí.
 */
export default function Cajon({ titulo, sub, onCerrar, children, ancho = 460, sinCabecera = false, capa = 0, etiqueta }: {
  titulo?: ReactNode;
  sub?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  /** El ancho en la pantalla grande. */
  ancho?: number;
  /** Lo que se mete adentro ya trae su cabecera (la ficha del espacio). */
  sinCabecera?: boolean;
  /** Un cajón encima de otro (la ficha abierta desde Pendientes). */
  capa?: number;
  /** El nombre del cajón para un lector de pantalla. */
  etiqueta: string;
}) {
  useModalAbierto();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Sólo el de más arriba se cierra con Esc.
      if (e.key !== "Escape") return;
      const todos = document.querySelectorAll("[data-cajon]");
      if (todos[todos.length - 1] === caja.current) cerrar.current();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  // El foco entra al cajón al abrirlo: con teclado se sigue desde ahí.
  useEffect(() => { caja.current?.focus(); }, []);
  return (
    <div className="cajon-fondo" data-capa-modal style={{ zIndex: 120 + capa * 2 }} onClick={onCerrar}>
      <div
        ref={caja}
        className="cajon"
        data-cajon
        role="dialog"
        aria-label={etiqueta}
        tabIndex={-1}
        style={{ ["--cajon-ancho" as string]: `${ancho}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {!sinCabecera && (
          <header className="cajon-cab">
            <div className="tit">
              <h2>{titulo}</h2>
              {sub && <p>{sub}</p>}
            </div>
            <button type="button" className="cajon-x" onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)">
              <X {...ICONO} />
            </button>
          </header>
        )}
        <div className="cajon-cuerpo">{children}</div>
      </div>
    </div>
  );
}
