import { useEffect, useRef, useState } from "react";
import { Ellipsis, Pin, PinOff } from "lucide-react";
import { ACCIONES, MAXIMO_FIJADAS, accionesDeMas, alternarFijada, type ContextoDeAccion } from "../../acciones";
import type { Modulo } from "../../modulos";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** La clave de lo fijado: por persona (su correo, o el rol en el ingreso de
 *  antes). No cambia lo que ven los demás. */
const clave = (quien: string) => `recabra-fijadas-v1:${quien}`;

export function leerFijadas(quien: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave(quien)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && ACCIONES.some((a) => a.id === x)).slice(0, MAXIMO_FIJADAS) : [];
  } catch { return []; }
}
function guardarFijadas(quien: string, ids: string[]) {
  try { localStorage.setItem(clave(quien), JSON.stringify(ids)); } catch { /* sin almacenamiento: queda en esta pestaña */ }
}

/**
 * El menú «Más» del módulo (rediseño UX 2026-10, etapa 8): sólo lo raro o
 * peligroso de esa pantalla, para que lo de todos los días quede a la vista y
 * nada quede escondido. Cada función se puede fijar en la barra (hasta 3 por
 * persona).
 */
export default function Mas({ modulo, esAdmin, quien, ctx }: { modulo: Modulo; esAdmin: boolean; quien: string; ctx: ContextoDeAccion }) {
  const [abierto, setAbierto] = useState(false);
  const [fijadas, setFijadas] = useState<string[]>(() => leerFijadas(quien));
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { setFijadas(leerFijadas(quien)); }, [quien]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", fuera); window.removeEventListener("keydown", esc); };
  }, [abierto]);

  const lista = accionesDeMas(modulo, esAdmin);
  const fijar = (id: string) => setFijadas((f) => { const n = alternarFijada(f, id); guardarFijadas(quien, n); return n; });
  const visibles = fijadas.map((id) => ACCIONES.find((a) => a.id === id)!).filter((a) => a && (esAdmin || !a.admin));

  return (
    <>
      {visibles.map((a) => (
        <button key={a.id} type="button" className="btn-fijada" data-fijada={a.id} title={a.detalle} onClick={() => a.hacer(ctx)}>
          <Pin {...ICONO} /><span className="txt">{a.texto}</span>
        </button>
      ))}
      {lista.length > 0 && (
        <div className="mas-w" ref={caja}>
          <button type="button" className="btn-mas" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}
            title="Lo raro o peligroso de esta pantalla" data-mas={modulo}>
            <Ellipsis {...ICONO} /><span className="txt">Más</span>
          </button>
          {abierto && (
            <div className="mas-menu" role="menu">
              {lista.map((a) => {
                const fija = fijadas.includes(a.id);
                const lleno = !fija && fijadas.length >= MAXIMO_FIJADAS;
                return (
                  <div key={a.id} className="mas-fila">
                    <button type="button" role="menuitem" className="mas-accion" onClick={() => { setAbierto(false); a.hacer(ctx); }}>
                      <b>{a.texto}</b><small>{a.detalle}</small>
                    </button>
                    <button type="button" className="mas-pin" aria-pressed={fija} disabled={lleno} onClick={() => fijar(a.id)}
                      title={fija ? "Quitar de la barra" : lleno ? `Ya hay ${MAXIMO_FIJADAS} fijadas: quitá una` : "Fijar en la barra"}
                      aria-label={fija ? `Quitar «${a.texto}» de la barra` : `Fijar «${a.texto}» en la barra`}>
                      {fija ? <PinOff {...ICONO} /> : <Pin {...ICONO} />}
                    </button>
                  </div>
                );
              })}
              <p className="mas-nota">Fijá hasta {MAXIMO_FIJADAS} en tu barra. Sólo cambia lo que ves vos.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
