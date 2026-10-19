import type { UnifiedFixture } from "../types/fixtures";

/**
 * Lo que el store le manda al servidor en `PUT /layout/{sede}`, y lo que
 * repone un deshacer.
 *
 * ── Por qué está aparte ──────────────────────────────────────────────────────
 *
 * Lo usa el store (`store/fixtureStore.ts`), que va en el pedazo de entrada:
 * no importa nada en tiempo de ejecución, así que no arrastra el catálogo de
 * muebles (`types/fixtures.ts` sí). Y es puro: `scripts/probar-geometria.mjs`
 * lo ejecuta, y además ejecuta el store de verdad con la red de mentira para
 * ver el cuerpo del `PUT` que sale después de un deshacer.
 *
 * ── La ficha: ausente, valor o null ──────────────────────────────────────────
 *
 * `PUT /layout` le rellena al mueble la ficha que llega AUSENTE con la que
 * tenía guardada (`_con_la_ficha_de_antes` en `routers/layout.py`): ausente es
 * como llega de una pestaña abierta desde antes de que la ficha existiera, y
 * esa pestaña no puede borrarla sin saberlo. La borra sólo un `null`.
 *
 * Eso obliga al navegador de hoy a decir `null` cada vez que quiere que una
 * clave deje de estar. El panel lo hace al vaciar un campo (`conGeometria`).
 * El deshacer también tiene que hacerlo: el plano repuesto es el de antes del
 * cambio, y si antes del cambio el mueble no tenía la clave, el arreglo
 * repuesto la tiene AUSENTE. Lo mismo ADENTRO de `partes` (vender por partes):
 * el servidor rellena cada clave de `partes` que llega ausente (`division`,
 * cómo se vende la nevera), así que deshacer «por puertas» tiene que mandar
 * `division: null`. Mandado así, el servidor rellenaba el valor que
 * se acababa de deshacer: el editor dibujaba la cuenta de siempre y la base
 * guardaba los entrepaños deshechos, que eran los que veían el visor de otro
 * equipo, el enlace de la mercaderista y el mismo editor al recargar. Por eso
 * `conFichaQuitada`.
 */

/** Las claves de la ficha. Son las que `PUT /layout` le rellena a un mueble
 *  que llega sin ellas (una pestaña de antes no las conoce) y las únicas en
 *  que un `null` significa «borrada a propósito» (ver `UnifiedFixture.modelo`
 *  y `CLAVES_DE_FICHA` en `services/layout_lookup.py`, que dice lo mismo;
 *  `tests/test_layout_ficha.py` compara las dos listas). */
export const CLAVES_DE_FICHA = ["modelo", "partes", "entrepanos", "modulo"] as const;

/**
 * Los campos que la BASE manda y el layout ya no guarda.
 *
 * El servidor los recorta al recibir un plano (`_sin_contrato` en
 * `routers/layout.py`); esto los recorta también **al mandarlos**, para que lo
 * que viaja por el cable sea sólo geometría. Con los dos lados cortando, ningún
 * camino —un guardado viejo en cola, un `force` de conflicto, un bootstrap—
 * puede volver a escribir un contrato en el JSON.
 */
export const CAMPOS_DE_CONTRATO = [
  "status", "supplierName", "brandCategory", "negotiatedValue",
  "startDate", "endDate", "observation", "reservaHasta",
] as const;

/** El mismo plano sin una sola palabra de lo comercial. No toca el original.
 *  Saca sólo esos ocho campos: la ficha viaja como está, `null` incluido. */
export function sinComercial(fixtures: UnifiedFixture[]): UnifiedFixture[] {
  return fixtures.map((f) => {
    const limpio: Record<string, unknown> = { ...f };
    for (const campo of CAMPOS_DE_CONTRATO) delete limpio[campo];
    if (limpio.faceB && typeof limpio.faceB === "object") {
      const caraB: Record<string, unknown> = { ...(limpio.faceB as object) };
      for (const campo of CAMPOS_DE_CONTRATO) delete caraB[campo];
      if (Object.keys(caraB).length > 0) limpio.faceB = caraB;
      else delete limpio.faceB;
    }
    return limpio as unknown as UnifiedFixture;
  });
}

/**
 * El plano que repone un deshacer (o un rehacer), con la ficha que se va dicha
 * con `null`.
 *
 * Para cada mueble del plano repuesto que sigue en el de ahora (mismo `id`):
 * una clave de la ficha que ahora tiene algo —un valor, o un `null` todavía
 * sin guardar— y en el repuesto falta, vuelve en `null`. Así el próximo
 * guardado le dice al servidor «ya no está» en vez de «no sé». El resto del
 * mueble queda tal cual, y los muebles sin nada que decir conservan su
 * identidad (los espejos de los editores comparan por identidad); si ninguno
 * cambia, vuelve el mismo arreglo.
 */
const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export function conFichaQuitada(
  repuesto: UnifiedFixture[], actual: readonly UnifiedFixture[],
): UnifiedFixture[] {
  const deAhora = new Map(actual.map((f) => [f.id, f as unknown as Record<string, unknown>]));
  let cambio = false;
  const fuera = repuesto.map((f) => {
    const ahora = deAhora.get(f.id);
    if (!ahora) return f;
    const antes = f as unknown as Record<string, unknown>;
    const faltan = CLAVES_DE_FICHA.filter((k) => antes[k] === undefined && ahora[k] !== undefined);
    // Adentro de `partes`: lo que ahora tiene y el repuesto no.
    const partesAntes = antes.partes;
    const partesAhora = ahora.partes;
    const faltanEnPartes = esObjeto(partesAntes) && esObjeto(partesAhora)
      ? Object.keys(partesAhora).filter((k) => partesAntes[k] === undefined && partesAhora[k] !== undefined)
      : [];
    if (faltan.length === 0 && faltanEnPartes.length === 0) return f;
    cambio = true;
    const out: Record<string, unknown> = { ...antes };
    for (const k of faltan) out[k] = null;
    if (faltanEnPartes.length > 0) {
      const partes: Record<string, unknown> = { ...(partesAntes as Record<string, unknown>) };
      for (const k of faltanEnPartes) partes[k] = null;
      out.partes = partes;
    }
    return out as unknown as UnifiedFixture;
  });
  return cambio ? fuera : repuesto;
}
