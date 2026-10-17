import type { UnifiedFixture } from "../types/fixtures";
import { carasDe, fullSpaceCode, isRentable } from "../types/fixtures";
import { carasPorParticipacion, codigoDeParte, esParticipacion, partesDe, partirCodigo } from "./partes";
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
 * Una góndola doble son DOS espacios (`carasDe`, la misma regla que
 * `caras_de` del servidor). Un mueble no comercializable no está —y ése es
 * justamente uno de los casos que hay que encontrar—.
 *
 * Las participaciones (`NAVE-GON-01-PC3`) no se enumeran —sus números no
 * tienen tope—: van aparte las CARAS que se venden por participación
 * (`carasPc`, `carasPorParticipacion`), y una participación se ofrece si su
 * cara está ahí (`ofrecido`, que es `ofrece` del servidor).
 */
function espaciosOfrecidos(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  normalizar: (s: string) => string,
): { ofrecidos: Set<string>; carasPc: Set<string> } {
  const ofrecidos = new Set<string>();
  const carasPc = new Set<string>();
  for (const [clave, fixtures] of Object.entries(fixturesBySede)) {
    if (!Array.isArray(fixtures)) continue;
    for (const f of fixtures) {
      const code = (f.code || "").trim().toUpperCase();
      if (!code) continue;
      // La sede del MUEBLE, no la de la clave: un plano copiado de otra tienda
      // dibuja muebles que no son de ésta.
      const completo = fullSpaceCode(normalizar(f.sede || clave), code);
      if (isRentable(f)) {
        ofrecidos.add(completo);
        if (carasDe(f) === 2) ofrecidos.add(`${completo}-B`);
      }
      // Vender por partes: las puertas que el mueble ofrece (`NEV-03-PU2`),
      // como `espacios_de` del servidor. Una puerta vendida de una nevera que
      // hoy se vende entera NO está: es un contrato que ningún plano dibuja.
      // Y las piezas de lo que no se vende entero (la bahía de una caja, el
      // forro de una columna), aunque el mueble no sea comercializable.
      for (const { cara, parte } of partesDe(f)) ofrecidos.add(codigoDeParte(completo, cara, parte));
      // Las caras que se venden por participación, con la misma sede que sus
      // caras de arriba (la del mueble, si la trae).
      for (const c of carasPorParticipacion([f], normalizar(f.sede || clave))) carasPc.add(c);
    }
  }
  return { ofrecidos, carasPc };
}

/** ¿El plano pone a la venta este código COMPLETO? Lo que está entre lo
 *  ofrecido, por el texto tal cual —un mueble de antes del token que ya se
 *  llamaba `GON-07-PC1` es su cara entera (riesgo R1 del diseño)—, y una
 *  participación si su cara se vende por participación. Es `ofrece` de
 *  `backend/app/services/layout_lookup.py`. */
function ofrecido(o: { ofrecidos: Set<string>; carasPc: Set<string> }, espacio: string): boolean {
  if (o.ofrecidos.has(espacio)) return true;
  const p = partirCodigo(espacio);
  return esParticipacion(p.parte) && o.carasPc.has(codigoDeParte(p.base, p.cara, null));
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
    if (ofrecido(ofrecidos, espacio)) continue;
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
