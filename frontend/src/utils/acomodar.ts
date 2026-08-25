/**
 * Dónde poner una copia para que no quede encima de nada.
 *
 * `Ctrl+D` desplazaba la copia 0,5 m en los dos ejes y la descartaba si
 * chocaba. Una Góndola Doble mide 0,90 × 0,90: la copia siempre se solapaba con
 * su original, se descartaba, y **no pasaba nada ni se avisaba**. Fallaba para
 * 11 de los 17 tipos del catálogo —todos los que miden más de 50 cm en los dos
 * lados— y funcionaba para los seis flacos. De ahí el «a veces anda».
 *
 * Ahora se busca un hueco de verdad, y el primero que se prueba es **al ras a
 * la derecha**: duplicar una góndola para seguir armando la corrida es
 * exactamente para lo que se usa.
 *
 * Trabaja en el sistema del plano 2D (esquina superior izquierda + huella ya
 * girada), que es donde vive el atajo.
 */

import { TOLERANCIA_CONTACTO } from "./planta";

export interface Caja { x: number; y: number; w: number; h: number }

/** ¿Estas dos cajas se montan? Pegadas no cuenta (ver TOLERANCIA_CONTACTO). */
export function seMontan(a: Caja, b: Caja, tol = TOLERANCIA_CONTACTO): boolean {
  return (
    a.x + tol < b.x + b.w && a.x + a.w - tol > b.x &&
    a.y + tol < b.y + b.h && a.y + a.h - tol > b.y
  );
}

/**
 * El primer lugar libre para `caja`, probando en este orden:
 *
 *   1. al ras a la derecha    — seguir la corrida
 *   2. al ras abajo           — la corrida de al lado
 *   3. al ras a la izquierda / arriba
 *   4. anillos cada vez más lejos, en pasos de grilla
 *
 * Devuelve null si no hay lugar en todo el alcance: quien llama tiene que
 * avisarlo, no quedarse callado.
 */
export function buscarHueco(
  caja: Caja,
  ocupadas: Caja[],
  paso = 0.05,
  alcance = 12,
): { x: number; y: number } | null {
  const libre = (x: number, y: number) =>
    !ocupadas.some((o) => seMontan({ ...caja, x, y }, o));

  // Los cuatro vecinos al ras: es lo que uno quiere el 99% de las veces.
  const pegados: [number, number][] = [
    [caja.x + caja.w, caja.y],
    [caja.x, caja.y + caja.h],
    [caja.x - caja.w, caja.y],
    [caja.x, caja.y - caja.h],
  ];
  for (const [x, y] of pegados) if (libre(x, y)) return { x, y };

  // Anillos hacia afuera. Se recorre el borde de cada anillo, no su interior:
  // lo de adentro ya se probó en el anillo anterior.
  const pasos = Math.ceil(alcance / paso);
  for (let r = 1; r <= pasos; r++) {
    for (let i = -r; i <= r; i++) {
      const candidatos: [number, number][] = [
        [caja.x + i * paso, caja.y - r * paso],
        [caja.x + i * paso, caja.y + r * paso],
        [caja.x - r * paso, caja.y + i * paso],
        [caja.x + r * paso, caja.y + i * paso],
      ];
      for (const [x, y] of candidatos) {
        if (libre(x, y)) return { x: +x.toFixed(4), y: +y.toFixed(4) };
      }
    }
  }
  return null;
}

/**
 * Dónde cae un grupo entero al duplicarlo o pegarlo, moviéndolo como un bloque.
 *
 * Se desplaza el conjunto completo por el mismo vector, así que las piezas
 * conservan su posición relativa: pegar media corrida tiene que devolver media
 * corrida, no seis muebles desparramados.
 */
export function buscarHuecoGrupo(
  grupo: Caja[],
  ocupadas: Caja[],
  paso = 0.05,
  alcance = 12,
): { dx: number; dy: number } | null {
  if (grupo.length === 0) return null;
  const minX = Math.min(...grupo.map((c) => c.x));
  const minY = Math.min(...grupo.map((c) => c.y));
  const maxX = Math.max(...grupo.map((c) => c.x + c.w));
  const maxY = Math.max(...grupo.map((c) => c.y + c.h));
  const ancho = maxX - minX, alto = maxY - minY;

  const cabe = (dx: number, dy: number) =>
    !grupo.some((c) =>
      ocupadas.some((o) => seMontan({ ...c, x: c.x + dx, y: c.y + dy }, o)),
    );

  for (const [dx, dy] of [[ancho, 0], [0, alto], [-ancho, 0], [0, -alto]] as const) {
    if (cabe(dx, dy)) return { dx, dy };
  }

  const pasos = Math.ceil(alcance / paso);
  for (let r = 1; r <= pasos; r++) {
    for (let i = -r; i <= r; i++) {
      const cands: [number, number][] = [
        [i * paso, -r * paso], [i * paso, r * paso],
        [-r * paso, i * paso], [r * paso, i * paso],
      ];
      for (const [dx, dy] of cands) {
        if (cabe(dx, dy)) return { dx: +dx.toFixed(4), dy: +dy.toFixed(4) };
      }
    }
  }
  return null;
}
