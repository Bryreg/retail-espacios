/**
 * Con qué se reconoce cada participación de una cara: un tono, una textura y
 * su número. Lo usan el lienzo de Distribución, el 3D, la leyenda y la barra
 * de capacidad (§9.7 del diseño de participaciones).
 *
 * ── Los tonos ────────────────────────────────────────────────────────────────
 *
 * Tres, validados con el validador de la skill de gráficos (todas las parejas,
 * sobre el papel `#EFF1ED`, la tarjeta `#FFFFFF` y el panel oscuro `#0B1116`):
 * en tono pleno pasan en los dos temas —peor separación con daltonismo ΔE 9,9
 * (> 8), con visión normal 18,3 (> 15), contraste ≥ 3:1 contra esas tres
 * superficies— y se separan de los colores de estado (libre, se libera,
 * tomado). Son los MISMOS valores que `--marca-1..3` de `tema.css`, que los
 * repite en el bloque oscuro; `probar-distribucion.mjs` compara los dos
 * archivos y `probar-tema.mjs` vuelve a validar la paleta.
 *
 * Mezclados con la transparencia del relleno la separación baja (al 35 % sobre
 * el metal claro del 3D, ΔE 6,1 normal y 2,9 con daltonismo), y el violeta da
 * 2,88:1 sobre ese metal. Por eso el color NUNCA va solo: la identidad la
 * llevan la cinta de 1 cm en tono pleno, la textura (lleno, rayado a 45°,
 * rayado a 135°) y el número en el rótulo y en la leyenda.
 *
 * ── La asignación ────────────────────────────────────────────────────────────
 *
 * Estampa preferida = `supplierId mod 9`: el mismo proveedor se ve igual en
 * todas las caras, y como renovar no cambia de proveedor (I2) la estampa de
 * una participación no cambia mientras vive. Dentro de una cara, recorriendo
 * las participaciones vivas por número, si la preferida ya la tomó una de
 * número menor se prueba la siguiente (+1 mod 9); con más de nueve se repite
 * (el número las distingue). La historia va en gris: no entra acá.
 *
 * Una participación más nueva nunca repinta a las anteriores (se recorre por
 * número, y el número sólo crece). Sacar una participación sólo puede repintar
 * a las que chocaban con ella y habían tenido que correrse.
 *
 * Puro: sin React, sin catálogo, sin nada del navegador.
 */

/** = `--marca-1`, `--marca-2`, `--marca-3` de `tema.css` (los dos temas). */
export const TONOS_DE_MARCA = ["#1A67C2", "#A4338F", "#B165FD"] as const;

export type Textura = "lleno" | "rayado45" | "rayado135";
export const TEXTURAS: readonly Textura[] = ["lleno", "rayado45", "rayado135"];

export interface Estampa {
  /** 0..8: su lugar en `ESTAMPAS`. */
  indice: number;
  tono: string;
  textura: Textura;
}

/**
 * Las nueve estampas: 3 tonos × 3 texturas. El TONO cambia primero (las tres
 * primeras son los tres tonos llenos): una participación que se corre por un
 * choque cae en OTRO tono, no en el mismo tono con otro rayado, y una cara con
 * hasta tres participaciones de proveedores consecutivos lleva los tres tonos.
 * (El diseño decía «orden tono-mayor»; con el tono como índice lento, un
 * choque dejaba dos zonas del mismo color distinguidas sólo por el rayado.)
 */
export const ESTAMPAS: readonly Estampa[] = Array.from({ length: TONOS_DE_MARCA.length * TEXTURAS.length }, (_, i) => ({
  indice: i,
  tono: TONOS_DE_MARCA[i % TONOS_DE_MARCA.length],
  textura: TEXTURAS[Math.floor(i / TONOS_DE_MARCA.length)],
}));

/** La estampa que prefiere un proveedor (su id mod 9; un id roto, la 0). */
export function estampaPreferida(supplierId: number): number {
  const n = ESTAMPAS.length;
  if (!Number.isFinite(supplierId)) return 0;
  const k = Math.trunc(supplierId) % n;
  return k < 0 ? k + n : k;
}

/**
 * La estampa de cada participación VIVA de una cara, por `spaceId`. No
 * depende del orden de la lista ni de lo que filtre la pantalla: se recorre
 * por número (y, a igual número —un dato roto—, por `spaceId`). Hay que
 * pasarle todas las vivas de la cara, antes de filtrar.
 */
export function estampasDeLaCara(ps: readonly { spaceId: number; numero: number; supplierId: number }[]): Map<number, Estampa> {
  const orden = [...ps].sort((a, b) => (a.numero - b.numero) || (a.spaceId - b.spaceId));
  const fuera = new Map<number, Estampa>();
  const usadas = new Set<number>();
  const n = ESTAMPAS.length;
  for (const p of orden) {
    if (fuera.has(p.spaceId)) continue;
    const preferida = estampaPreferida(p.supplierId);
    let elegida = preferida;
    if (usadas.size < n) {
      for (let k = 0; k < n; k++) {
        const i = (preferida + k) % n;
        if (!usadas.has(i)) { elegida = i; break; }
      }
    }
    usadas.add(elegida);
    fuera.set(p.spaceId, ESTAMPAS[elegida]);
  }
  return fuera;
}
