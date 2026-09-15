import type { UnifiedFixture } from "../types/fixtures";
import { fullSpaceCode, isRentable } from "../types/fixtures";
import type { EstadoPorEspacio } from "./estadoComercial";

/**
 * Contratos que la BASE tiene vivos y que NINGÚN plano puede mostrar.
 *
 * Es el fantasma, con nombre y apellido. El contrato existe —es plata y es un
 * compromiso con un proveedor— pero no hay mueble que lo dibuje, así que la
 * pantalla dice «libre» y el servidor rechaza cualquier venta nueva nombrando
 * un contrato que la ficha no muestra. Así se reportó: «no me deja alquilar la
 * IMP-17 que está libre, el sistema la toma como ocupada».
 *
 * ── Por qué se calcula acá y no en un script ─────────────────────────────────
 *
 * Existe `backend/scripts/auditar_desfase.py`, que hace esto mismo contra la
 * base. Necesita una consola en el servidor, que es un plan pago de Render.
 *
 * Pero el navegador ya tiene las dos mitades: el store baja TODOS los planos
 * (`fetchAllLayouts`) y el mapa comercial entero (`fetchEstadoComercial`) en
 * cada sincronización, porque los necesita para pintar. O sea que la auditoría
 * no necesita ni consola ni credenciales: es una resta entre dos cosas que ya
 * están en memoria. Y deja de ser una corrida que alguien tiene que acordarse
 * de hacer — se ve sola, en la pantalla, al lado de lo demás que hay que
 * revisar.
 *
 * ── La mitad que este cálculo NO puede ver ───────────────────────────────────
 *
 * La dirección contraria —un contrato que vive sólo en el JSON del layout y no
 * tiene fila en ninguna tabla— no se puede ver desde acá, porque la fusión la
 * pisa antes de que nadie la mire. Esa mitad la resuelve
 * `scripts/importar_contratos_del_plano.py`, que se corre una vez.
 */

/** Un contrato vivo sin mueble donde verse. */
export interface ContratoSinMueble {
  /** El código COMPLETO, tal como está en `spaces`: `NAVE-IMP-17`. */
  espacio: string;
  /** La sede, cuando se pudo separar del código. */
  sede: string;
  /** El código corto: el que está en el plano y en la cartelería de la tienda. */
  code: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  /** 0 para un mercaderista: el servidor no le manda plata. */
  negotiatedValue: number;
}

/** La misma regla que `normalizeSede` del store. Se pasa como parámetro para no
 *  arrastrar el store entero a una función pura, y así hay UNA definición. */
const NORMALIZAR = (s: string) => s.trim().toUpperCase();

/**
 * Los códigos COMPLETOS que los planos ponen a la venta hoy.
 *
 * Espejo de `espacios_ofrecidos` en `backend/app/services/layout_lookup.py`, y
 * tiene que seguir siéndolo: si las dos listas se separan, el aviso de la
 * pantalla y el guardarraíl del servidor dejan de hablar del mismo conjunto.
 *
 * Una góndola doble son DOS espacios. Un mueble no comercializable no está —y
 * ése es justamente uno de los casos que hay que encontrar—.
 */
function espaciosOfrecidos(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  normalizar: (s: string) => string,
): Set<string> {
  const ofrecidos = new Set<string>();
  for (const [clave, fixtures] of Object.entries(fixturesBySede)) {
    if (!Array.isArray(fixtures)) continue;
    for (const f of fixtures) {
      const code = (f.code || "").trim().toUpperCase();
      if (!code || !isRentable(f)) continue;
      // La sede del MUEBLE, no la de la clave: un plano copiado de otra tienda
      // dibuja muebles que no son de ésta.
      const completo = fullSpaceCode(normalizar(f.sede || clave), code);
      ofrecidos.add(completo);
      if (f.gondolaType === "double" || (f.type as string) === "gondola_doble") {
        ofrecidos.add(`${completo}-B`);
      }
    }
  }
  return ofrecidos;
}

/** Partir `NAVE-IMP-17` en sede y código corto, usando las sedes que existen.
 *  Gana el prefijo más largo: con «NAVE» y «NAVE 2» cargadas, el código de la
 *  segunda no se puede leer como el de la primera. */
function partir(espacio: string, sedes: string[]): { sede: string; code: string } {
  let mejor = "";
  for (const sede of sedes) {
    if (sede && espacio.startsWith(`${sede}-`) && sede.length > mejor.length) mejor = sede;
  }
  return mejor
    ? { sede: mejor, code: espacio.slice(mejor.length + 1) }
    : { sede: "", code: espacio };
}

export function contratosSinMueble(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  estado: EstadoPorEspacio,
  normalizar: (s: string) => string = NORMALIZAR,
): ContratoSinMueble[] {
  const claves = Object.keys(estado);
  if (claves.length === 0) return [];

  const ofrecidos = espaciosOfrecidos(fixturesBySede, normalizar);
  // Las sedes que conoce el store, más las que traen los propios muebles.
  const sedes = new Set(Object.keys(fixturesBySede).map(normalizar));
  for (const fixtures of Object.values(fixturesBySede)) {
    if (!Array.isArray(fixtures)) continue;
    for (const f of fixtures) if (f.sede) sedes.add(normalizar(f.sede));
  }
  const lista = [...sedes];

  const fantasmas: ContratoSinMueble[] = [];
  for (const clave of claves) {
    const e = estado[clave];
    // Sólo lo VENDIDO. «Reservado» y «en mantenimiento» los pone una persona a
    // propósito y no tienen contrato detrás: que no haya mueble es raro, pero
    // no es plata en el aire.
    if (e.status !== "occupied") continue;
    const espacio = clave.trim().toUpperCase();
    if (ofrecidos.has(espacio)) continue;
    const { sede, code } = partir(espacio, lista);
    fantasmas.push({
      espacio, sede, code,
      supplierName: e.supplierName,
      startDate: e.startDate,
      endDate: e.endDate,
      negotiatedValue: e.negotiatedValue,
    });
  }
  // Por sede y después por código: se leen agrupados por tienda, que es como
  // se van a ir a resolver.
  return fantasmas.sort((a, b) =>
    a.sede === b.sede ? a.code.localeCompare(b.code) : a.sede.localeCompare(b.sede));
}
