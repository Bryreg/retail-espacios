import { CATALOGO_DE_MUEBLES, type PartesDeMueble } from "../catalogo/catalogo";
import { puertasDe } from "../components/StoreEditor3D/muebles/medidas";
import { fullSpaceCode } from "../types/espacio";
import type { EstadoPorEspacio } from "./estadoComercial";
import { claseDe, codigoDeParte, divisionDe, partesDe, sufijoDeParte } from "./partes";

/**
 * «Cómo se vende» una nevera de puertas, en el panel del plano 2D y en el del
 * Editor 3D: entera, o entera o por puertas. Puro: lo prueba
 * `probar-geometria.mjs`, y lo dibuja `components/PartesDelMueble.tsx`.
 *
 * Dos reglas de la dueña, de vender por partes:
 *
 *  · **Lo ya colocado no cambia solo.** Una nevera sin `partes.division` se
 *    vende entera aunque tenga sus puertas en la ficha; sólo se vende por
 *    puertas cuando alguien elige «Entera o por puertas» acá.
 *  · **Con una puerta vendida no se mueve lo vendido.** No cambia la cantidad
 *    de puertas ni deja de venderse por puertas —la «puerta 2» pasaría a ser
 *    otra hoja, o dejaría de existir— hasta que termine o se cancele su
 *    contrato. El servidor frena lo mismo (409 `partes_vendidas` y
 *    `contratos_vivos`); acá se dice antes, sin nombrar a nadie.
 */

type Mueble = {
  id: string; code: string; type: string; sede?: string; w: number;
  gondolaType?: string | null; rentable?: boolean; partes?: PartesDeMueble | null;
};

/** Las formas en que se puede vender por partes un mueble de esa familia. */
export function divisionesDe(tipo: string): string[] {
  const t = CATALOGO_DE_MUEBLES.tipos[CATALOGO_DE_MUEBLES.alias[tipo]?.tipo ?? tipo];
  return t?.partes?.divisiones ?? [];
}

/** Cuántas puertas tiene: las de su ficha o las que se dibujan por el ancho. */
export function puertasDibujadas(f: Mueble): number {
  const p = f.partes?.puertas;
  return puertasDe(f.w, typeof p === "number" ? p : undefined);
}

/** Lo que el panel escribe: la forma de venderse y la cantidad. `null` es
 *  borrar a propósito (el servidor rellena lo AUSENTE adentro de `partes`). */
export interface CambioDePartes { division?: string | null; puertas?: number | null }

/** El mismo plano con ese cambio en `partes` de ese mueble. `partes` se
 *  escribe ENTERA a partir de la que tiene (`{...f.partes, ...cambio}`): un
 *  panel que la armara sólo con lo que conoce borraría lo demás. */
export function conPartes<T extends { id: string; partes?: PartesDeMueble | null }>(
  fixtures: readonly T[], id: string, cambio: CambioDePartes,
): T[] {
  if (!fixtures.some((f) => f.id === id)) return fixtures as T[];
  return fixtures.map((f) => (f.id !== id ? f : { ...f, partes: { ...(f.partes ?? {}), ...cambio } }));
}

/** Las partes del mueble y si están vendidas (contrato vivo o firmado: el
 *  mapa crudo dice `occupied`). Sin nombres ni fechas: lo mira quien arma el
 *  plano, y la pantalla puede estar compartida. */
export function partesConEstado(
  f: Mueble, estado: EstadoPorEspacio, sede: string,
): { codigo: string; sufijo: string; vendida: boolean }[] {
  const completo = fullSpaceCode(f.sede || sede, f.code);
  return partesDe(f).map(({ cara, parte }) => {
    const codigo = codigoDeParte(completo, cara, parte);
    return { codigo, sufijo: sufijoDeParte(parte), vendida: estado[codigo]?.status === "occupied" };
  });
}

/** ¿Hay algo vendido de esa clase en el mueble? Mira el mapa crudo por
 *  código (también lo que hoy no se ofrece: un `PU3` vendido de antes). */
function vendidasDeLaClase(f: Mueble, estado: EstadoPorEspacio, sede: string, token: string): string[] {
  const prefijo = `${fullSpaceCode(f.sede || sede, f.code)}-`;
  const deLaClase = new RegExp(`^(?:B-)?${token}[1-9][0-9]?$`);
  return Object.entries(estado)
    .filter(([c, e]) => e.status === "occupied" && c.startsWith(prefijo) && deLaClase.test(c.slice(prefijo.length)))
    .map(([c]) => c.slice(prefijo.length));
}

export interface RevisionDePartes {
  /** No se puede: hay una parte vendida que se movería o desaparecería. */
  bloqueo: string | null;
  /** Se puede, y conviene decir qué cambia. */
  aviso: string | null;
}

/**
 * Qué pasa si se escribe ese cambio. Con una parte de esa clase vendida, no se
 * cambia ni la forma ni la cantidad (bloqueo). Con la nevera vendida entera,
 * cambiar las puertas cambia cómo se dibuja lo que se vendió (aviso). Lo
 * demás, se escribe.
 */
export function revisarCambioDePartes(
  f: Mueble, cambio: CambioDePartes, estado: EstadoPorEspacio, sede: string,
): RevisionDePartes {
  const antes = divisionDe(f);
  const despues = divisionDe({ ...f, partes: { ...(f.partes ?? {}), ...cambio } });
  const mismaForma = (antes?.clase ?? null) === (despues?.clase ?? null) && (antes?.n ?? null) === (despues?.n ?? null);
  if (antes && !mismaForma) {
    const clase = claseDe(antes.clase)!;
    const vendidas = vendidasDeLaClase(f, estado, sede, clase.token);
    if (vendidas.length > 0) {
      return {
        bloqueo: `Con ${vendidas.length === 1 ? `una ${clase.singular} vendida` : `${vendidas.length} ${clase.plural} vendidas`} ` +
          `(contrato vivo o firmado), la cantidad de ${clase.plural} no cambia ni deja de venderse por ` +
          `${clase.plural}: la ${clase.singular} vendida quedaría en otro lugar. Esperá a que termine o cancelá su contrato.`,
        aviso: null,
      };
    }
  }
  const puertasCambian = cambio.puertas !== undefined && cambio.puertas !== (f.partes?.puertas ?? undefined);
  const entera = estado[fullSpaceCode(f.sede || sede, f.code)]?.status === "occupied";
  if (puertasCambian && entera) {
    return { bloqueo: null, aviso: "La nevera está vendida entera: cambia cómo se dibuja lo que se vendió (las hojas del frente)." };
  }
  return { bloqueo: null, aviso: null };
}
