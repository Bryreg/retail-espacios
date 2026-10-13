/**
 * Del mueble al espacio que se vende: el código con sede y cuántas caras tiene.
 *
 * Vivían en `types/fixtures.ts`, que se reexporta todo esto: quien las importa
 * de ahí no cambió. Están aparte por lo que NO importan. `types/fixtures.ts`
 * calcula sus tablas del catálogo de muebles (`catalogo/muebles.json`), y la
 * fusión con la base (`utils/estadoComercial.ts`) viaja en lo primero que baja
 * cualquier visitante, la landing incluida (`App.tsx` → `fixtureStore.ts` →
 * `estadoComercial.ts`). Pidiéndole estas dos funciones a `types/fixtures.ts`,
 * el catálogo entero —descripciones, emojis, medidas, rótulos de los editores—
 * entraba en ese primer pedazo. Este archivo no importa nada, y
 * `probar-catalogo.mjs` falla si el catálogo vuelve a lo que se baja de
 * entrada.
 */

/**
 * ¿Cuántas caras vendibles tiene el mueble? 2 es la cara A y la `-B`.
 *
 * Es LA respuesta a «¿esta góndola tiene cara B?», y la de todos: Vender, la
 * fusión con la base, la auditoría de «Contrato sin mueble», Supervisar y, del
 * lado del servidor, `caras_de` en `backend/app/services/layout_lookup.py`, que
 * es su espejo y tiene que seguir siéndolo.
 *
 * Hubo dos reglas. Una —la de Vender y los editores— contaba como doble la
 * góndola sin `gondolaType`; otra —la fusión, la auditoría, el guardarraíl del
 * servidor y la importación— exigía `"double"` escrito. Con una góndola vieja
 * sin el campo, Vender ofrecía la cara B y la vendía, pero el plano no la
 * pintaba vendida, el servidor no la contaba como espacio (borrar la góndola
 * no frenaba) y «Para revisar» la listaba como contrato sin mueble.
 *
 * Quedó la laxa, porque es lo que dibujan los dos editores y lo que ya ofrece
 * Vender:
 *  · `gondola` con `gondolaType` `"double"` o AUSENTE → 2;
 *  · el tipo legado `gondola_doble` de los planos viejos del 2D → 2;
 *  · cualquier otra cosa —`"wall"`, un mueble que no es góndola— → 1.
 */
export function carasDe(f: { type?: string; gondolaType?: string | null }): 1 | 2 {
  if (f.type === "gondola_doble") return 2;
  if (f.type !== "gondola") return 1;
  return (f.gondolaType ?? "double") === "double" ? 2 : 1;
}

/** ¿Tiene cara B? Es `carasDe(f) === 2`, con el nombre que ya usan las
 *  pantallas. */
export function isDoubleGondola(f: { type?: string; gondolaType?: string | null }): boolean {
  return carasDe(f) === 2;
}

/** El código con el que el espacio existe FUERA del plano: `SEDE-CODIGO`.
 *
 *  Dentro del layout un mueble se llama por su nombre corto (`PUN-01`), que se
 *  repite en las tres sedes. Lo que se guarda en `spaces`, lo que viaja en el
 *  enlace de los correos y lo que se reporta como montado es siempre el código
 *  con sede, porque es el único único.
 *
 *  Convención de guardado de contratos (AssignmentPanel de FloorPlan2D):
 *  `` `${item.sede || sede}-${item.code}` ``, con `-B` para la cara B. Los
 *  códigos que genera el editor 3D ya traen la sede adentro, así que el guard
 *  evita el doble prefijo — y todo se compara en mayúsculas porque el prefijo
 *  se genera en mayúsculas pero la sede puede venir escrita como sea. */
export function fullSpaceCode(sede: string | undefined, code: string): string {
  const codeUC = (code ?? "").trim().toUpperCase();
  const sedeUC = (sede ?? "").trim().toUpperCase();
  if (!sedeUC || codeUC.startsWith(`${sedeUC}-`)) return codeUC;
  return `${sedeUC}-${codeUC}`;
}
