import type { Guia, PiezaDeGuia } from "../api/guia";
import { pct } from "./participaciones";
import { bordesUtiles, cajaDe, huecosLibres, type CaraDePiezas } from "./piezas";
import { queCambia } from "./planograma";
import type { Exclusion, Poligono } from "./zonasGeometria";

/**
 * La guía de montaje «para dummies» (fase 3 de la distribución, 2026-10-24):
 * lo puro. De una versión publicada a lo que dice la hoja:
 *
 *   · cada destino con un NÚMERO, de izquierda a derecha (y de arriba abajo si
 *     comparten la misma franja);
 *   · dónde va, en CENTÍMETROS desde el borde izquierdo del mueble mirándolo de
 *     frente, redondeado al medio centímetro;
 *   · en qué estantes, contados DESDE ARRIBA (decisión del dueño): el 1 es el
 *     de más arriba. Un «estante» es cada nivel donde se apoya mercadería,
 *     entre una repisa y la siguiente (la base cuenta);
 *   · lo que queda vacío a propósito y lo que cambia contra la versión anterior.
 *
 * Sin precios ni nombres de proveedores: la guía la abre quien monta.
 */

export interface DestinoDeLaGuia extends PiezaDeGuia {
  numero: number;
  poligono: Poligono | null;
  /** De dónde a dónde, en cm desde la izquierda. */
  desdeCm: number;
  hastaCm: number;
  /** Los estantes (desde arriba) que ocupa. */
  estantes: number[];
  /** «los 6 estantes», «estante 2», «estantes 2 a 4». */
  textoEstantes: string;
}

/** Medio centímetro, que es lo que se puede medir con una cinta. */
export const aMedioCm = (m: number): number => Math.round(m * 200) / 2;
/** «72», «115,5». */
export const cm = (n: number): string => String(n).replace(".", ",");

/** Los niveles de la cara (donde se apoya algo), de ARRIBA hacia abajo, en v:
 *  entre el borde de arriba de lo que se vende, cada repisa y la base. */
export function nivelesDesdeArriba(E: readonly Exclusion[], repisas: readonly number[]): [number, number][] {
  const b = bordesUtiles(E);
  const cortes = [...new Set([b.v0, ...repisas.filter((v) => v > b.v0 + 0.005 && v < b.v1 - 0.005), b.v1])].sort((x, y) => x - y);
  const niveles: [number, number][] = [];
  for (let i = 0; i + 1 < cortes.length; i++) niveles.push([cortes[i], cortes[i + 1]]);
  return niveles.reverse();
}

/** «los 6 estantes», «estante 2», «estantes 2 a 4», «estantes 1, 3 y 5». */
export function textoDeEstantes(estantes: readonly number[], total: number): string {
  if (estantes.length === 0) return "";
  if (estantes.length === total && total > 1) return `los ${total} estantes`;
  if (estantes.length === 1) return `estante ${estantes[0]}`;
  const seguidos = estantes.every((e, i) => i === 0 || e === estantes[i - 1] + 1);
  if (seguidos) return `estantes ${estantes[0]} a ${estantes[estantes.length - 1]}`;
  return `estantes ${estantes.slice(0, -1).join(", ")} y ${estantes[estantes.length - 1]}`;
}

/** Qué estantes ocupa una pieza: los niveles donde tapa al menos la mitad de
 *  su alto (una franja que roza la repisa de abajo no «ocupa» ese estante). */
export function estantesDe(caja: { v0: number; v1: number }, niveles: readonly [number, number][]): number[] {
  const fuera: number[] = [];
  niveles.forEach(([a, z], i) => {
    const solapa = Math.min(z, caja.v1) - Math.max(a, caja.v0);
    if (solapa > (z - a) * 0.5 - 1e-9) fuera.push(i + 1);
  });
  return fuera;
}

/** Los destinos de la hoja, numerados de izquierda a derecha. */
export function destinosDeLaGuia(g: Pick<Guia, "piezas" | "superficie">, repisas: readonly number[]): DestinoDeLaGuia[] {
  const W = g.superficie.ancho;
  const niveles = nivelesDesdeArriba(g.superficie.exclusiones, repisas);
  const con = g.piezas.map((p) => ({ p, caja: p.vertices ? cajaDe([p.vertices]) : null }));
  con.sort((a, b) => {
    if (!a.caja || !b.caja) return a.caja ? -1 : b.caja ? 1 : 0;
    return (a.caja.u0 - b.caja.u0) || (b.caja.v1 - a.caja.v1);
  });
  return con.map(({ p, caja }, i) => {
    const estantes = caja ? estantesDe(caja, niveles) : [];
    return {
      ...p, numero: i + 1, poligono: p.vertices,
      desdeCm: caja ? aMedioCm(caja.u0 * W) : 0, hastaCm: caja ? aMedioCm(caja.u1 * W) : 0,
      estantes, textoEstantes: textoDeEstantes(estantes, niveles.length),
    };
  });
}

/** Lo que queda vacío a propósito: los tramos libres de arriba abajo (de al
 *  menos 5 cm), en cm desde la izquierda. Lo ya asignado (vendido) no es vacío. */
export function vaciosDeLaGuia(g: Pick<Guia, "piezas" | "superficie" | "asignado">): { desdeCm: number; hastaCm: number }[] {
  const cara: CaraDePiezas = { ancho: g.superficie.ancho, alto: g.superficie.alto, exclusiones: g.superficie.exclusiones };
  const ocupados = [
    ...g.piezas.filter((p) => p.vertices).map((p, i) => ({ spaceId: i + 1, poligonos: [p.vertices!] })),
    ...g.asignado.map((poly, i) => ({ spaceId: -(i + 1), poligonos: [poly] })),
  ];
  return huecosLibres(cara, ocupados)
    .map(([a, z]) => ({ desdeCm: aMedioCm(a * g.superficie.ancho), hastaCm: aMedioCm(z * g.superficie.ancho) }))
    .filter((h) => h.hastaCm - h.desdeCm >= 5);
}

/** Qué cambia contra la versión anterior, en palabras (con los nombres de
 *  cada versión). Sin anterior: es la primera. */
export function cambiosDeLaGuia(g: Pick<Guia, "piezas" | "anterior">): string[] {
  if (!g.anterior) return [];
  const nombres = new Map<number, string>();
  for (const p of g.anterior.piezas) nombres.set(p.destino_id, p.nombre);
  for (const p of g.piezas) nombres.set(p.destino_id, p.nombre);
  const a = (ps: PiezaDeGuia[]) => ps.map((p) => ({ destinoId: p.destino_id, pb: p.pb, vertices: p.vertices }));
  return queCambia(a(g.anterior.piezas), a(g.piezas), (id) => nombres.get(id) ?? "Un destino");
}

/** «Rige del 28 oct al 2 nov 2026» / «Rige desde el 28 oct 2026». */
export function vigenciaDeLaGuia(v: Pick<Guia["version"], "rige_desde" | "hasta">): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const f = (iso: string, conAnio: boolean) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}${conAnio ? ` ${iso.slice(0, 4)}` : ""}`;
  if (!v.hasta) return `Rige desde el ${f(v.rige_desde, true)}`;
  const mismoAnio = v.rige_desde.slice(0, 4) === v.hasta.slice(0, 4);
  return `Rige del ${f(v.rige_desde, !mismoAnio)} al ${f(v.hasta, true)}`;
}

/** El aviso de arriba de la hoja si no es la que hay que montar hoy. */
export function avisoDeLaGuia(v: Guia["version"]): string | null {
  if (v.estado === "reemplazada" || v.hay_una_mas_nueva) return `Ésta es la versión ${v.numero} y ya hay una más nueva: pedí la guía nueva antes de montar.`;
  if (v.estado === "programada") return `La versión ${v.numero} todavía no rige: se monta a partir de su fecha.`;
  if (v.vencida_hace_dias != null) return `La versión ${v.numero} venció, pero sigue vigente hasta que se publique otra.`;
  return null;
}

/** Lo que va en el ficha de un destino, en una línea: «Categoría · 40 %». */
export const lineaDelDestino = (d: Pick<DestinoDeLaGuia, "pb">, tipo: string): string => `${tipo} · ${pct(d.pb)} de la cara`;

/** «a@x.co, b@y.co» o uno por renglón → la lista, sin repetidos ni los que no
 *  parecen correos. */
export function correosEscritos(texto: string): { validos: string[]; malos: string[] } {
  const partes = texto.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const validos: string[] = [], malos: string[] = [];
  for (const p of partes) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)) { if (!validos.some((v) => v.toLowerCase() === p.toLowerCase())) validos.push(p); }
    else malos.push(p);
  }
  return { validos, malos };
}
