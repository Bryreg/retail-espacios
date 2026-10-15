import {
  altoDeZonaDeSlots, altoDeZonaDeSlotsDePunta, filasDePunta, filasDeProducto, techoDeCara,
} from "../components/StoreEditor3D/muebles/medidas";
import { entrepanosDelEspacio } from "../components/StoreEditor3D/muebles/frentes";
import { claseDe, divisionDe, filaDeEntrepano, vanoDeParte, type ParteRef } from "./partes";
import type { PartesDeMueble } from "../catalogo/catalogo";

/**
 * Los espacios internos del Editor 3D (los `slots` de la góndola y la punta)
 * y las partes que se venden con contrato (tramos y entrepaños): cuál cae en
 * cuál.
 *
 * Los dos sistemas conviven: un espacio interno es una fracción del mueble
 * (`x`, `w` del ancho; `y`, `h` de la franja de slots), vale para las dos
 * caras y vive sólo en el JSON del plano, sin contrato. Una parte es una fila
 * de `spaces` con su contrato. **Se avisa, no se bloquea**: los espacios
 * internos no tienen contraparte en la base y pueden estar viejos, y frenar
 * una venta real por un estado que nadie firmó sería frenar la plata con un
 * dato que el sistema no puede verificar. Lo que sí se frena es lo nuevo: en
 * un mueble que se vende por partes, el panel del espacio interno no deja
 * marcarlo vendido (eso se vende en Vender, con contrato).
 *
 * Puro: lo prueba `probar-partes.mjs`. Las cuentas son las del dibujo:
 * `entrepanosDelEspacio` (la regla del relleno) y las filas de
 * `filasDeProducto`/`filasDePunta`.
 */

export interface SlotDelMueble {
  x: number; w: number; y: number; h: number; status: string;
}

type MuebleConSlots = {
  type: string; w: number; h: number; gondolaType?: string | null; rentable?: boolean;
  entrepanos?: number | null; partes?: PartesDeMueble | null;
  slots?: readonly SlotDelMueble[] | null;
};

const VENDIDO = new Set(["occupied", "reserved"]);
/** 1 mm de holgura, como `entrepanosDelEspacio`: el redondeo no deja un
 *  espacio interno adentro de dos tramos por un pelo. */
const HOLGURA = 0.001;

/** Las filas y la franja de slots del mueble, con las cuentas del dibujo. */
function filasYFranja(f: MuebleConSlots) {
  const entrepanos = typeof f.entrepanos === "number" ? f.entrepanos : undefined;
  if (f.type === "punta") {
    const cuerpo = techoDeCara(f.h);
    return { filas: filasDePunta(cuerpo, 0.4, entrepanos), franja: altoDeZonaDeSlotsDePunta(cuerpo) };
  }
  return { filas: filasDeProducto(f.h, 0.4, entrepanos), franja: altoDeZonaDeSlots(f.h) };
}

/**
 * Los espacios internos (de cualquier estado) que caen en esa parte de esa
 * cara: un tramo, por el ancho (con la numeración de la cara: el `TR1` de la
 * A está en +X); un entrepaño, por la regla del relleno. La cara entera:
 * todos. Las puertas no tienen espacios internos.
 */
export function slotsDeLaParte<S extends SlotDelMueble>(
  f: MuebleConSlots & { slots?: readonly S[] | null }, cara: "A" | "B", parte: ParteRef | null,
): S[] {
  const slots = (f.slots ?? []) as readonly S[];
  if (!parte) return [...slots];
  const div = divisionDe(f);
  if (!div || div.clase !== parte.clase || parte.n === null) return [];
  const regla = claseDe(parte.clase);
  if (parte.clase === "tramos" && regla?.eje === "ancho") {
    const i = vanoDeParte(cara, parte.n, div.n);
    const a = i / div.n;
    const b = (i + 1) / div.n;
    const e = HOLGURA / Math.max(0.01, f.w);
    return slots.filter((s) => s.x < b - e && s.x + s.w > a + e);
  }
  if (parte.clase === "entrepanos") {
    const { filas, franja } = filasYFranja(f);
    const fila = filaDeEntrepano(parte.n);
    return slots.filter((s) => entrepanosDelEspacio(s, filas, franja).includes(fila));
  }
  return [];
}

/** Cuántos espacios internos VENDIDOS (ocupados o reservados) caen en esa
 *  parte: lo que el renglón de Vender avisa, sin nombres. */
export function internosVendidosEnLaParte(
  f: MuebleConSlots, cara: "A" | "B", parte: ParteRef | null,
): number {
  return slotsDeLaParte(f, cara, parte).filter((s) => VENDIDO.has(s.status)).length;
}

/** Las partes (de las dos caras) que pisa un espacio interno: lo que el panel
 *  del espacio interno avisa si alguna tiene contrato. */
export function partesQuePisa(
  f: MuebleConSlots, slot: SlotDelMueble, caras: readonly ("A" | "B")[],
): { cara: "A" | "B"; parte: ParteRef }[] {
  const div = divisionDe(f);
  if (!div) return [];
  const regla = claseDe(div.clase);
  if (!regla || (div.clase !== "tramos" && div.clase !== "entrepanos")) return [];
  const fuera: { cara: "A" | "B"; parte: ParteRef }[] = [];
  for (const cara of caras) {
    for (let k = 1; k <= div.n; k++) {
      const parte: ParteRef = { clase: div.clase, token: regla.token, n: k };
      if (slotsDeLaParte({ ...f, slots: [slot] }, cara, parte).length > 0) fuera.push({ cara, parte });
    }
  }
  return fuera;
}
