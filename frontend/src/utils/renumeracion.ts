/**
 * Renumerar el plano — lo que la PANTALLA tiene que poder afirmar por su cuenta.
 *
 * El cálculo es del servidor (`backend/app/services/renumeracion.py`): la regla
 * de recorrido, el arrastre de `spaces` y de las confirmaciones de montaje, y
 * los invariantes afirmados antes de escribir una sola fila. Acá no se
 * recalcula nada de eso — sería una segunda verdad que se puede desfasar.
 *
 * Lo que sí vive acá es la CUENTA, y vive acá a propósito. La promesa que se le
 * hizo al dueño es «ningún mueble se agrega ni se borra», y una promesa que sólo
 * se puede comprobar creyéndole al mismo que la hizo no es comprobable: si el
 * informe dijera «21 muebles» porque el servidor perdió uno y contó los que le
 * quedaron, la pantalla repetiría el número equivocado sin enterarse.
 *
 * Entonces la cuenta se arma cruzando TRES fuentes independientes:
 *
 *   1. los ids del plano que el navegador YA tiene dibujado (`fixturesBySede`,
 *      que es de donde sale el mapa que la persona mira);
 *   2. los ids que el informe del servidor lista, uno por renglón;
 *   3. después de aplicar, los ids del plano vuelto a bajar del servidor.
 *
 * Si las tres no coinciden, la pantalla lo dice con los ids en la mano. No hay
 * forma de que las tres mientan igual.
 */

// ─── El contrato del servidor, tal cual viaja ────────────────────────────────
//
// Se declara acá y no en `api/layout.ts` para que este módulo no arrastre a
// axios ni a la sesión: así `probar:renumerar` lo compila solo, sin levantar
// media aplicación para contar veinte renglones.

/** Un renglón del informe: un mueble, con el nombre que tenía y el que va a
 *  tener. Es lo que se imprime y lo que se camina en la tienda. */
export interface FilaRenumerada {
  id: string;
  tipo: string;
  etiqueta: string;
  /** Corrida del recorrido: 1, 2, 3… en el sentido en que se camina. */
  banda: number;
  antes: string;
  /** Lo que el plano DIBUJABA: la nomenclatura escrita a mano o, si no había,
   *  el código. Es el nombre que el dueño reconoce de la cartelería. */
  se_leia: string;
  ahora: string;
  codigo_antes: string;
  codigo_ahora: string;
  cambia: boolean;
  cx: number;
  cz: number;
}

/** Una fila de `spaces` que se muda con su mueble, con lo que cuelga de ella. */
export interface EspacioArrastrado {
  space_id: number;
  antes: string;
  ahora: string;
  svg_antes: string;
  svg_ahora: string;
  contratos: number;
}

export interface SedeRenumerada {
  sede: string;
  /** El eje que se camina ("z" o "x") y el perpendicular, el de las bandas. */
  eje_recorrido: string;
  eje_bandas: string;
  /** Por qué se eligió ese eje, medido sobre la geometría de ESTE plano. */
  motivo_eje: string;
  bandas: number;
  muebles: number;
  cambian: number;
  nomenclaturas_borradas: number;
  filas: FilaRenumerada[];
  espacios: EspacioArrastrado[];
  montajes: number;
  avisos: string[];
  /** El informe en texto plano que arma el servidor. La pantalla imprime su
   *  propia tabla —la misma que se ve, que es la única forma de que el papel no
   *  pueda decir algo distinto de la pantalla—, pero este texto se ofrece para
   *  copiar y pegar donde no haya impresora. */
  texto: string;
}

export interface Renumeracion {
  /** `false` en el previo, `true` en el aplicar. Que viaje en la respuesta evita
   *  la peor confusión posible de esta pantalla: creer que ya se aplicó. */
  aplicado: boolean;
  sedes: SedeRenumerada[];
  muebles: number;
  cambian: number;
}

// ─── La cuenta ───────────────────────────────────────────────────────────────

/** El conteo antes → después de UNA sede, cruzado contra el plano de verdad.
 *
 *  Todo lo que sea una lista de ids vacía es una promesa cumplida; cualquiera
 *  de ellas con algo adentro es la promesa rota, y los ids están ahí para poder
 *  ir a mirar cuál es el mueble. */
export interface Conteo {
  /** Muebles que el navegador tiene dibujados en esa sede. */
  enElPlano: number;
  /** Renglones del informe. Tiene que ser el mismo número. */
  enElInforme: number;
  /** Muebles del plano vuelto a bajar DESPUÉS de aplicar. `null` mientras no se
   *  aplicó: no se inventa un número que todavía no existe. */
  despues: number | null;
  /** Ids que el plano tiene y el informe no lista: se borrarían. */
  faltan: string[];
  /** Ids que el informe lista y el plano no tiene: se agregarían. */
  sobran: string[];
  /** Ids que estaban antes de aplicar y ya no están. La prueba de verdad. */
  perdidos: string[];
  /** Ids que aparecieron después de aplicar y no estaban. */
  aparecidos: string[];
  cambian: number;
  iguales: number;
  /** Nombres que quedarían en más de un mueble. Vacío o la renumeración no
   *  sirve: dos muebles con el mismo nombre es el error que esto viene a matar. */
  repetidos: string[];
  /** Si este navegador tenía con qué comparar. `false` cuando no hay plano
   *  local de esa sede (caché recién borrado, entrar por la barra de
   *  direcciones antes del primer pull): ahí no se puede afirmar nada sobre
   *  agregados ni borrados, y decir «se borran 21» sería una alarma falsa. Se
   *  dice que no se pudo comparar, que es la verdad. */
  comparable: boolean;
  /** Todo lo de arriba en una sola palabra. */
  ok: boolean;
}

const unicos = (xs: string[]): string[] => [...new Set(xs)];

/** Los que están en `a` y no en `b`, sin repetir y en el orden de `a`. */
function faltantes(a: string[], b: string[]): string[] {
  const tiene = new Set(b);
  return unicos(a.filter((x) => !tiene.has(x)));
}

/** Los nombres que quedarían en dos muebles o más, en el orden en que aparecen.
 *
 *  Se compara en mayúsculas porque el nombre es la llave: `imp-08` y `IMP-08`
 *  son el mismo espacio en todas las comparaciones del sistema. */
function repetidosEntre(nombres: string[]): string[] {
  const cuenta = new Map<string, number>();
  for (const n of nombres) {
    const k = n.trim().toUpperCase();
    if (!k) continue;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

/**
 * La cuenta de una sede.
 *
 * @param sede       el informe del servidor para esa sede
 * @param idsDelPlano ids de los muebles que el navegador tiene dibujados AHORA
 *                    (antes de aplicar). Es la fuente independiente.
 * @param idsDespues  ids del plano vuelto a bajar después de aplicar, o `null`
 *                    mientras el previo todavía no se aplicó.
 */
export function contar(
  sede: SedeRenumerada,
  idsDelPlano: string[],
  idsDespues: string[] | null = null,
): Conteo {
  const enInforme = sede.filas.map((f) => f.id);
  const plano = unicos(idsDelPlano);
  const despues = idsDespues === null ? null : unicos(idsDespues);
  // Sin plano local no hay contra qué comparar. Una sede de verdad SIEMPRE
  // tiene muebles —el dueño dijo «los planos ya están completos en todas las
  // sedes»—, así que cero acá es que este navegador todavía no bajó nada.
  const comparable = plano.length > 0 || enInforme.length === 0;

  const conteo: Conteo = {
    enElPlano: plano.length,
    enElInforme: unicos(enInforme).length,
    despues: despues === null ? null : despues.length,
    faltan: comparable ? faltantes(plano, enInforme) : [],
    sobran: comparable ? faltantes(enInforme, plano) : [],
    perdidos: despues === null || !comparable ? [] : faltantes(plano, despues),
    aparecidos: despues === null || !comparable ? [] : faltantes(despues, plano),
    cambian: sede.filas.filter((f) => f.cambia).length,
    iguales: sede.filas.filter((f) => !f.cambia).length,
    repetidos: repetidosEntre(sede.filas.map((f) => f.ahora)),
    comparable,
    ok: false,
  };
  conteo.ok =
    conteo.faltan.length === 0 &&
    conteo.sobran.length === 0 &&
    conteo.perdidos.length === 0 &&
    conteo.aparecidos.length === 0 &&
    conteo.repetidos.length === 0 &&
    (!comparable || conteo.enElPlano === conteo.enElInforme) &&
    (conteo.despues === null || !comparable || conteo.despues === conteo.enElPlano);
  return conteo;
}

/** La misma cuenta, sumada sobre todas las sedes del informe.
 *
 *  Las listas de ids se concatenan a propósito en vez de sólo sumarse los
 *  largos: un id perdido en POBLADO no se puede compensar con uno de más en
 *  NAVE, y con las listas puestas eso se ve. */
export function contarTodo(
  informe: Renumeracion,
  idsPorSede: Record<string, string[]>,
  idsDespuesPorSede: Record<string, string[]> | null = null,
): Conteo {
  const total: Conteo = {
    enElPlano: 0, enElInforme: 0, despues: idsDespuesPorSede === null ? null : 0,
    faltan: [], sobran: [], perdidos: [], aparecidos: [],
    cambian: 0, iguales: 0, repetidos: [], comparable: true, ok: true,
  };
  for (const sede of informe.sedes) {
    const c = contar(
      sede,
      idsPorSede[sede.sede] ?? [],
      idsDespuesPorSede === null ? null : (idsDespuesPorSede[sede.sede] ?? []),
    );
    total.enElPlano += c.enElPlano;
    total.enElInforme += c.enElInforme;
    if (total.despues !== null && c.despues !== null) total.despues += c.despues;
    total.cambian += c.cambian;
    total.iguales += c.iguales;
    // Los ids se prefijan con la sede: dos sedes pueden tener un `imp7` cada
    // una, y una lista mezclada sin sede no diría a cuál ir a mirar.
    total.faltan.push(...c.faltan.map((id) => `${sede.sede}·${id}`));
    total.sobran.push(...c.sobran.map((id) => `${sede.sede}·${id}`));
    total.perdidos.push(...c.perdidos.map((id) => `${sede.sede}·${id}`));
    total.aparecidos.push(...c.aparecidos.map((id) => `${sede.sede}·${id}`));
    total.repetidos.push(...c.repetidos.map((n) => `${sede.sede}·${n}`));
    // Una sola sede sin plano local vuelve incomparable el total: sumar sus
    // ceros a los números de las otras daría un total que parece bueno.
    total.comparable = total.comparable && c.comparable;
    total.ok = total.ok && c.ok;
  }
  return total;
}

// ─── El recorrido, dicho en palabras ────────────────────────────────────────

/** Los renglones agrupados por banda, en el orden en que se camina.
 *
 *  El servidor ya los manda ordenados; agrupar es sólo para poder dibujar la
 *  separación entre corridas, que es lo que hace que la tabla impresa se pueda
 *  seguir con el dedo mientras se camina el pasillo. */
export interface Banda {
  banda: number;
  filas: FilaRenumerada[];
  cambian: number;
}

export function porBanda(sede: SedeRenumerada): Banda[] {
  const bandas: Banda[] = [];
  for (const fila of sede.filas) {
    const ultima = bandas[bandas.length - 1];
    if (ultima && ultima.banda === fila.banda) ultima.filas.push(fila);
    else bandas.push({ banda: fila.banda, filas: [fila], cambian: 0 });
  }
  for (const b of bandas) b.cambian = b.filas.filter((f) => f.cambia).length;
  return bandas;
}

/** Una frase que dice cómo se numeró, para que quien lea el papel entienda por
 *  qué los números van en ese orden y no en otro. */
export function textoDelRecorrido(sede: SedeRenumerada): string {
  const eje = (sede.eje_recorrido || "").toUpperCase();
  const banda = (sede.eje_bandas || "").toUpperCase();
  return (
    `${sede.bandas} banda${sede.bandas === 1 ? "" : "s"} sobre ${banda}, ` +
    `y dentro de cada banda de menor a mayor ${eje}.`
  );
}

/** Cuántos contratos vigentes viajan con los espacios que se mudan. Es el
 *  número que decide si esto es una renumeración tranquila o una que hay que
 *  mirar dos veces antes de apretar. */
export function contratosEnJuego(sede: SedeRenumerada): number {
  return sede.espacios.reduce((n, e) => n + e.contratos, 0);
}

/** El resumen de una línea que va arriba del botón: qué se va a escribir. */
export function resumenDeLoQueSeEscribe(informe: Renumeracion): string {
  const sedes = informe.sedes.filter((s) => s.cambian > 0).length;
  const espacios = informe.sedes.reduce((n, s) => n + s.espacios.length, 0);
  const contratos = informe.sedes.reduce((n, s) => n + contratosEnJuego(s), 0);
  const montajes = informe.sedes.reduce((n, s) => n + s.montajes, 0);
  if (informe.cambian === 0) {
    return "No hay nada que renumerar: todos los muebles ya se llaman como el recorrido dice.";
  }
  const partes = [
    `${informe.cambian} de ${informe.muebles} muebles cambian de nombre`,
    `en ${sedes} sede${sedes === 1 ? "" : "s"}`,
  ];
  if (espacios) {
    partes.push(
      `${espacios} espacio${espacios === 1 ? "" : "s"} se muda${espacios === 1 ? "" : "n"} con su mueble` +
      (contratos ? ` (${contratos} contrato${contratos === 1 ? "" : "s"} vigente${contratos === 1 ? "" : "s"} encima)` : ""),
    );
  }
  if (montajes) {
    // El plural se escribe entero: «confirmación» + «es» da «confirmaciónes»,
    // que es la clase de detalle por la que un informe deja de leerse como algo
    // que alguien revisó.
    partes.push(`${montajes} ${montajes === 1 ? "confirmación" : "confirmaciones"} de montaje`);
  }
  return partes.join(" · ") + ".";
}
