import { puertasDe } from "../StoreEditor3D/muebles/medidas";
import type { PartesDeMueble } from "../../catalogo/catalogo";
import { comoSeVendeLaFicha, textoDeComoSeVende } from "../../utils/partes";
import type { FamiliaDeFicha } from "../../utils/formularioDeFicha";

/** Cómo dice «Mis muebles» las medidas y lo de adentro de un mueble: en
 *  centímetros, como se miden en la tienda. */

/** Metros a centímetros, con coma si hace falta: 1,605 → «160,5». */
export const cmTexto = (m: number) => String(Math.round(m * 1000) / 10).replace(".", ",");

/** «160 × 74 × 210 cm»: ancho, fondo y alto. */
export function medidasDe(m: { w: number; d: number; h: number }): string {
  return `${cmTexto(m.w)} × ${cmTexto(m.d)} × ${cmTexto(m.h)} cm`;
}

const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo de adentro que se cuenta: «2 puertas», «4 entrepaños», «3 tramos»,
 *  «2 bahías de impulso». Las puertas de una nevera se dicen siempre (las de
 *  la ficha o las que salen del ancho): es lo primero que se mira. */
export function porDentroDe(m: { tipo: string; w: number; entrepanos?: number | null; partes?: PartesDeMueble | null }): string {
  const dichos: string[] = [];
  if (m.tipo === "nevera_puertas") dichos.push(contar(puertasDe(m.w, m.partes?.puertas ?? undefined), "puerta", "puertas"));
  if (typeof m.partes?.tramos === "number") dichos.push(contar(m.partes.tramos, "tramo", "tramos"));
  if (typeof m.entrepanos === "number") dichos.push(contar(m.entrepanos, "entrepaño", "entrepaños"));
  if (typeof m.partes?.bahias === "number") dichos.push(contar(m.partes.bahias, "bahía de impulso", "bahías de impulso"));
  if (m.partes?.forro === true) dichos.push("con forro");
  return dichos.join(" · ");
}

/** Cómo se vende, dicho entero: «entera o por puertas (2)», o «se vende
 *  entera» si la ficha no dice partes. Lo que nunca se vende entero (la caja,
 *  la columna) dice sus piezas, o que no se vende nada de él. */
export function comoSeVendeDe(m: { tipo: string; entrepanos?: number | null; partes?: PartesDeMueble | null }, familia?: FamiliaDeFicha): string {
  const como = comoSeVendeLaFicha(m);
  if (como) return textoDeComoSeVende(como);
  return familia && familia.piezas.length > 0 ? "no vende piezas" : "se vende entera";
}

/** El nombre corto de una familia, para las tarjetas del paso 1: «Góndola
 *  central», «Estiba», «Nevera de puertas». */
export function nombreCortoDe(f: FamiliaDeFicha): string {
  if (f.tipo === "gondola") return f.variante === "wall" ? "Góndola de pared" : "Góndola central";
  return f.rotulo.replace(/\s*\(.*\)\s*$/, "");
}

/** La primera letra en mayúscula. */
export const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
