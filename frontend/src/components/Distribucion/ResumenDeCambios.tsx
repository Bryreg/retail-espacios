import { Check } from "lucide-react";
import { BOTON, Dialogo } from "./LeyendaDeParticipaciones";

/**
 * «Así cambia la cara» (Distribuir con piezas, 2026-10-24): antes de guardar
 * una cara que YA estaba guardada como lista y cambia, lo que cambia dicho en
 * palabras, por marca («Café A: cambia de lugar (30 %)», «Aseo Total: sale de
 * la cara»). Es el resumen de antes de confirmar, sin «dibujado», «capa» ni
 * números internos. Mientras está abierto, ÉL es la pantalla: su «Sí, guardar
 * la cara» se lleva el amarillo (`Dialogo` marca la capa modal).
 *
 * Una cara que se guarda por primera vez no pasa por acá: no hay nada que
 * comparar.
 */
export default function ResumenDeCambios({ titulo, lineas, mensaje, guardando, bloqueado, onVolver, onGuardar }: {
  titulo: string;
  lineas: readonly string[];
  /** Lo que dijo el servidor si no se pudo (queda como borrador, otra sesión…). */
  mensaje: string | null;
  guardando: boolean;
  /** Errores, topes o el plano sin guardar: no se guarda. */
  bloqueado: boolean;
  onVolver: () => void;
  onGuardar: () => void;
}) {
  return (
    <Dialogo titulo={titulo} onCerrar={onVolver}>
      <ul className="flex flex-col gap-1 text-sm text-ink-2" data-cambios>
        {lineas.map((l, i) => <li key={i}>· {l}</li>)}
      </ul>
      {mensaje && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--entra-txt-rgb))" }}>{mensaje}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className={BOTON} onClick={onVolver} disabled={guardando}>Volver</button>
        <button type="button" className="btn-principal inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
          disabled={bloqueado || guardando} onClick={onGuardar}>
          <Check size={16} strokeWidth={1.75} aria-hidden />{guardando ? "Guardando…" : "Sí, guardar la cara"}
        </button>
      </div>
    </Dialogo>
  );
}
