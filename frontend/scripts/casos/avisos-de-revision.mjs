/**
 * De dónde sale cada aviso de «Para revisar» (`const avisos = useMemo(` en
 * `DashboardView.tsx`), y cuáles son SÓLO para quien administra.
 *
 * La usan las DOS guardas de privacidad —`probar-vender` y `probar-comercial`—
 * con la misma lista: antes cada una miraba cuatro nombres después del corte
 * del trabajador (`if (!isAdmin) return a;`) y un aviso nuevo con proveedor,
 * plata o fechas de otro podía sumarle al trabajador sin que nada fallara.
 * Ahora:
 *  · antes del corte sólo pueden leerse las fuentes de `PARA_TODOS`, y todas;
 *  · cada fuente de `SOLO_ADMINISTRACION` se lee, y sólo después del corte;
 *  · después del corte no se lee NADA que no esté en `SOLO_ADMINISTRACION`
 *    (un aviso nuevo obliga a ponerlo acá, o la guarda falla).
 * Es igual o más estricto que la cuenta de antes del rediseño, que exigía la
 * parte de administración ENTERA dentro de la rama `isAdmin ?`.
 */

/** Lo que ve el trabajador: vencidos, por vencer, ocupado sin contrato, lo
 *  marcado «Reservado» a mano (rediseño, PR 3: no lleva plata ni proveedor
 *  —no tiene ninguno— y el estado ya le llega pintado en su mapa; liberarlo o
 *  reservarlo de verdad es de administración) y los contratos sin mueble. Sin
 *  plata ni proveedor (el servidor ya se los tacha).
 *  Y los planogramas por revisar (fase 4 de la distribución): no llevan plata
 *  ni proveedor, y el SERVIDOR sólo le manda a cada rol las caras que puede
 *  publicar —al equipo, las internas y sólo si la dueña lo habilitó; nunca un
 *  mueble que se vende— (`supervision_planogramas.para_revisar`). */
export const PARA_TODOS = ["kpis.expired", "kpis.expiring", "kpis.noContract", "kpis.reservadoAMano", "fantasmas",
  "planogramasPorRevisar.filas"];

/** Llevan proveedores, plata, fechas de otro o participaciones. */
export const SOLO_ADMINISTRACION = [
  "cortesSinCargar.pendientes", "revisionPc.secciones", "faltaPlanometria.filas",
  "montaje.noMontado", "montaje.sinMontar", "montaje.viejos",
  "reservasSinConfirmar.vivas", "kpis.belowReference",
  // `pendientesDelPlano`: lo que sólo vive en el plano (importables e incompletos).
  "importacion",
];

/** Las fuentes que lee un trozo de código: `for (const x of FUENTE)` y
 *  `...FUENTE` (sin las que recorren algo de un bucle de afuera, como
 *  `sec.items`). */
function fuentes(trozo) {
  const deBucle = new Set([...trozo.matchAll(/for \(const (\w+) of /g)].map((m) => m[1]));
  const salida = [];
  for (const m of trozo.matchAll(/for \(const (?:\w+|\{[^}]*\}|\[[^\]]*\]) of ([\w.]+)\)|\.\.\.([\w.]+)(?![\w.(])/g)) {
    const f = m[1] ?? m[2];
    if (deBucle.has(f.split(".")[0])) continue;
    salida.push(f);
  }
  return salida;
}

const es = (f, n) => f === n || f.startsWith(`${n}.`);

/** Devuelve la lista de fallas (vacía si está bien). `avisosDef` es el cuerpo
 *  de `const avisos = useMemo(`… hasta `const cuentasDeRevision`. */
export function revisarAvisos(avisosDef) {
  const fallas = [];
  const corte = avisosDef.indexOf("if (!isAdmin) return a;");
  if (corte < 0) return ["los avisos de «Para revisar» no cortan para el trabajador"];
  const antes = fuentes(avisosDef.slice(0, corte));
  const despues = fuentes(avisosDef.slice(corte));
  for (const f of antes) {
    if (!PARA_TODOS.some((n) => es(f, n))) fallas.push(`«${f}» le suma al trabajador (está antes del corte)`);
  }
  for (const n of PARA_TODOS) if (!antes.some((f) => es(f, n))) fallas.push(`«${n}» no suma a «Para revisar»`);
  for (const n of SOLO_ADMINISTRACION) {
    if (!despues.some((f) => es(f, n))) fallas.push(`«${n}» no suma a «Para revisar», o no está después del corte`);
    if (antes.some((f) => es(f, n))) fallas.push(`«${n}» le suma al trabajador`);
  }
  for (const f of despues) {
    if (!SOLO_ADMINISTRACION.some((n) => es(f, n))) fallas.push(`«${f}» suma a «Para revisar» sin estar en la lista de lo de administración`);
  }
  return fallas;
}
