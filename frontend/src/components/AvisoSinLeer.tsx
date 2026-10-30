import { RefreshCw } from "lucide-react";
import { enLista } from "../utils/sinLeer";

/**
 * El aviso de una lectura que falló (auditoría P2-15): qué no se pudo leer,
 * que lo que se ve puede estar incompleto y «Reintentar». Va donde estaría la
 * lista, para que un «Nada para hoy» con la red caída no se lea como verdad.
 */
export function AvisoSinLeer({ que, onReintentar }: { que: readonly string[]; onReintentar: () => void }) {
  if (que.length === 0) return null;
  return (
    <div role="alert" className="aviso-sin-leer" data-sin-leer>
      <span>
        No se pudo leer {enLista(que)}. Lo que ves puede estar incompleto: no quiere decir que no haya nada.
      </span>
      <button type="button" onClick={onReintentar} data-reintentar>
        <RefreshCw size={14} strokeWidth={1.75} aria-hidden /> Reintentar
      </button>
    </div>
  );
}
