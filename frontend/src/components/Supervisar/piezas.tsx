import type { ReactNode } from "react";
import { GRUPOS, type CuentaPorGrupo, type GrupoDeRevision } from "./paraRevisar";
import type { UnidadDePlata } from "./plata";

/**
 * Las piezas chicas de Supervisar (rediseño, PR 2; la hoja de piezas aprobada
 * es `docs/maquetas/rediseno-2026-10/hoja-iconos-y-piezas.html`): el selector
 * de la plata, las tres pestañas de «Para revisar» y el encabezado de cada
 * sección de la lista. Los estilos están en `src/supervisar.css`, colgados de
 * `.sup` (la raíz de Supervisar): Vender no ve una sola de estas reglas, y
 * ningún archivo de Vender llega a este módulo (`probar-vender`).
 *
 * Sin íconos en pestañas ni pastillas (regla de la hoja de piezas): la pestaña
 * dice su palabra y su cuenta.
 */

/** «Plata: Al mes | Total», a la derecha de la franja. Sólo para quien
 *  administra: el trabajador no ve plata. */
export function SelectorDePlata({ unidad, onCambio }: { unidad: UnidadDePlata; onCambio: (u: UnidadDePlata) => void }) {
  return (
    <span className="selector-plata">
      <span className="rotulo">Plata</span>
      <span className="seg" role="group" aria-label="Plata al mes o en total">
        {([["mes", "Al mes"], ["total", "Total"]] as const).map(([u, texto]) => (
          <button key={u} type="button" aria-pressed={unidad === u} onClick={() => onCambio(u)}>{texto}</button>
        ))}
      </span>
    </span>
  );
}

/** Las tres pestañas de «Para revisar», con su cuenta SIEMPRE a la vista (un
 *  cero también se dice: es lo que confirma que no hay nada). */
export function PestanasDeRevision({ cuentas, grupo, onGrupo }: {
  cuentas: CuentaPorGrupo;
  grupo: GrupoDeRevision;
  onGrupo: (g: GrupoDeRevision) => void;
}) {
  return (
    <div className="seg ancho" role="group" aria-label="Qué revisar">
      {GRUPOS.map((g) => (
        <button key={g.id} type="button" aria-pressed={grupo === g.id} onClick={() => onGrupo(g.id)} data-grupo={g.id}>
          {g.texto} <span className="n">{cuentas[g.id]}</span>
        </button>
      ))}
    </div>
  );
}

/** El encabezado de una sección de la lista: qué es y cuánto pesa («Ventas por
 *  cargar · 1», «Por vencer en 30 días · $ 333.333»). */
export function EncabezadoDeSeccion({ titulo, valor }: { titulo: string; valor?: ReactNode }) {
  return (
    <div className="sec-r">
      <span className="rotulo">{titulo}{valor !== undefined && valor !== null && <> · <b>{valor}</b></>}</span>
    </div>
  );
}
