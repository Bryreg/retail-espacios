import { useEffect, useMemo, useRef, useState } from "react";
import { retirarModeloPropio, reactivarModeloPropio } from "../../api/muebles";
import type { ModeloPropio } from "../../catalogo/propias";
import { recargarFichasPropias } from "../../store/fichasPropias";
import { useFixtureStore } from "../../store/fixtureStore";
import { useModalAbierto } from "../../tema";
import { problemasDelServidor, retirarOReactivarFicha } from "../../utils/formularioDeFicha";

/** Cuántos muebles de los planos se colocaron con esta ficha (los de las
 *  sedes que esta sesión ya bajó). */
export function useColocadosCon(id: string): number {
  const porSede = useFixtureStore((s) => s.fixturesBySede);
  return useMemo(
    () => Object.values(porSede).reduce((n, lista) => n + lista.filter((f) => f.modelo === id).length, 0),
    [porSede, id],
  );
}

/** Retirar o reactivar, sin confirmación para reactivar: no se pierde nada. */
export async function retirarOReactivar(m: ModeloPropio): Promise<string> {
  try {
    return await retirarOReactivarFicha(
      m, { retirar: retirarModeloPropio, reactivar: reactivarModeloPropio }, recargarFichasPropias);
  } catch (err) {
    throw new Error(problemasDelServidor(err).map((p) => p.problema).join(" "));
  }
}

/**
 * «¿Retirar …?» (2026-10-28): en la app y no en el aviso del navegador, y con
 * lo que de verdad pasa: deja de ofrecerse en el catálogo del plano y lo ya
 * colocado sigue igual —dice cuántos hay—. Se reactiva desde «Retirados».
 */
export function RetirarMueble({ mueble, onCerrar, onRetirado }: {
  mueble: ModeloPropio;
  onCerrar: () => void;
  onRetirado: (aviso: string) => void;
}) {
  useModalAbierto();
  const colocados = useColocadosCon(mueble.id);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelarRef.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const retirar = async () => {
    setEnCurso(true); setError(null);
    try { onRetirado(await retirarOReactivar(mueble)); }
    catch (e) { setError((e as Error).message); setEnCurso(false); }
  };

  return (
    <div className="mm-dialogo" data-capa-modal onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="mm-dialogo-caja" role="alertdialog" aria-modal="true" aria-labelledby="mm-retirar-t"
        aria-describedby="mm-retirar-d" data-dialogo-retirar>
        <h3 id="mm-retirar-t">¿Retirar «{mueble.nombre}»?</h3>
        <p id="mm-retirar-d">
          Deja de ofrecerse en el catálogo del plano.{" "}
          {colocados === 0
            ? "No hay ninguno colocado en los planos."
            : colocados === 1
              ? "El que ya está colocado sigue igual, con sus medidas y su tarifa."
              : `Los ${colocados} que ya están colocados siguen igual, con sus medidas y su tarifa.`}{" "}
          Se puede reactivar cuando quieras desde «Retirados».
        </p>
        {error && <p className="mm-mal" role="alert">{error}</p>}
        <div className="mm-dialogo-acc">
          <button ref={cancelarRef} type="button" className="mm-bt" onClick={onCerrar} disabled={enCurso}>Cancelar</button>
          <button type="button" className="mm-bt peligro" onClick={() => void retirar()} disabled={enCurso} data-confirmar-retirar>
            {enCurso ? "Retirando…" : "Retirar"}
          </button>
        </div>
      </div>
    </div>
  );
}
