import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Building2, Send, Users, Wrench } from "lucide-react";
import { useModalAbierto } from "../../tema";
import type { Contrato } from "./Contrato";
import { nombreDelContrato, notaDelReemplazo } from "../../utils/edicionDeContrato";

/**
 * «¿Guardar los cambios y reenviar?» — el último paso de «Editar contrato»
 * (el dibujo aprobado, paso 3). Recién acá se guarda: antes de tocar «Guardar y
 * reenviar» se ve a quiénes les llega otra vez el contrato —comercial, el
 * proveedor con su correo y montaje— y el resumen de lo que cambia.
 *
 * Un diálogo de verdad: `role="dialog"` con `aria-modal`, el resto de la app
 * `inert` (el foco no se escapa con Tab), Escape y «Volver» cierran sin
 * guardar, y el foco vuelve al botón que lo abrió. Mientras está abierto ÉL es
 * la pantalla y se lleva el amarillo (`data-capa-modal` + `useModalAbierto`):
 * el «Guardar cambios y reenviar» de atrás pasa a tinta (`index.css`). Nunca
 * dos amarillos a la vez.
 *
 * Lo mira el proveedor (es Vender): sólo SU correo, el personal de la sede por
 * su rol, lo de este contrato y nada de la nota interna.
 */
export default function ConfirmarEdicion({ c, onVolver, onGuardar }: {
  c: Contrato; onVolver: () => void; onGuardar: () => void;
}) {
  useModalAbierto();
  const titulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const volver = useRef<HTMLButtonElement>(null);
  const edita = c.edita!;
  const pendiente = !!c.edicion?.reemplazo || edita.montajePendiente;

  useEffect(() => {
    const app = document.getElementById("root");
    const antes = document.activeElement as HTMLElement | null;
    app?.setAttribute("inert", "");
    volver.current?.focus();
    return () => {
      app?.removeAttribute("inert");
      // El foco vuelve al botón que lo abrió (o al principal del pie).
      (antes && document.contains(antes) ? antes : document.querySelector<HTMLElement>("[data-guardar-edicion]"))?.focus();
    };
  }, []);

  /** Escape cierra; Tab no sale del diálogo (además de `inert`, para los
   *  navegadores que no lo tienen). */
  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onVolver(); return; }
    if (e.key !== "Tab") return;
    const focos = [...(caja.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input, [tabindex]:not([tabindex='-1'])") ?? [])];
    if (focos.length === 0) return;
    const primero = focos[0], ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };

  const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  return createPortal(
    <div className="dialogo-fondo" data-capa-modal onMouseDown={(e) => { if (e.target === e.currentTarget) onVolver(); }}>
      <div
        ref={caja}
        className="dialogo-edicion"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        onKeyDown={teclado}
        data-confirmar-edicion
      >
        <header>
          <Send {...ICONO} />
          <h3 id={titulo}>¿Guardar los cambios y reenviar?</h3>
        </header>
        <div className="dialogo-cuerpo">
          <p>
            El contrato de <b className="mono">{nombreDelContrato(edita.antes)}</b> con {c.proveedor.trim() || edita.antes.proveedor}
            {" "}cambia y se envía de nuevo a:
          </p>
          <ul className="destinatarios">
            <li data-rol="comercial">
              <Users {...ICONO} />
              <span><b>Comercial</b> · gerente y administrador de {edita.sede}</span>
            </li>
            <li data-rol="proveedor">
              <Building2 {...ICONO} />
              <span>
                {/* El correo del proveedor QUE QUEDA: cambiar de proveedor no
                    arrastra el del anterior (`correoDelProveedorQueQueda`). */}
                <b>El proveedor</b> · {c.correoDestino}
              </span>
            </li>
            <li data-rol="montaje">
              <Wrench {...ICONO} />
              <span>
                <b>Montaje</b> · mercaderista de {edita.sede} (sin precios
                {pendiente ? "; sale cuando se cargue la planometría" : ""})
              </span>
            </li>
          </ul>
          {/* La lista ENTERA de lo que cambia (en el pie va plegada a una línea). */}
          {c.edicion && c.edicion.cambios.length > 0 && (
            <ul className="que-cambia-lista" data-que-cambia-dialogo>
              {c.edicion.cambios.map((x) => (
                <li key={x.campo}>
                  <span className="campo-cambia">{x.campo}</span>
                  <s>{x.antes}</s>
                  <ArrowRight {...ICONO} />
                  <b>{x.ahora}</b>
                </li>
              ))}
            </ul>
          )}
          {c.edicion?.reemplazo && (
            <p className="nota-edicion" data-reemplazo>
              {notaDelReemplazo(edita, c.nuevos)}
            </p>
          )}
        </div>
        <div className="dialogo-acciones">
          <button ref={volver} type="button" className="btn-texto" onClick={onVolver}>Volver</button>
          <button type="button" className="btn-principal" onClick={onGuardar}>
            <Send {...ICONO} /> Guardar y reenviar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
