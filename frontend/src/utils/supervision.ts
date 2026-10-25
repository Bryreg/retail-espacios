import type { AvisoDeMontaje, MotivoDeNoMontaje } from "../api/guia";
import type { EstadoDeMontaje } from "../api/planogramas";
import type { CaraPorSupervisar, ResultadoDeRevision } from "../api/supervision";

/**
 * La supervisión de los planogramas (fase 4 de la distribución, 2026-10-25):
 * lo puro. Quien monta avisa desde el enlace de la guía; una persona pone lo
 * planificado al lado de la foto y dice si coincide. Nada se decide solo.
 *
 * Las reglas son las del servidor (`services/supervision_planogramas.py`):
 *  · una vigente sin aviso entra en «Para revisar» → Hoy el MISMO DÍA que
 *    empieza a regir (decisión del dueño);
 *  · «coincide» sin foto nueva pide haberla visto en la tienda;
 *  · «no coincide» pide al menos un número de la guía (o «Otra cosa», que pide
 *    la nota), y ofrece —marcado— mandar la guía de nuevo con la nota.
 */

/** Por qué no se pudo: los mismos que el servidor (`MOTIVO_LEGIBLE`). */
export const MOTIVOS_DE_NO_MONTAJE: readonly { id: MotivoDeNoMontaje; texto: string }[] = [
  { id: "sin_producto", texto: "No llegó el producto" },
  { id: "ocupado", texto: "El lugar está ocupado por otra cosa" },
  { id: "falta_material", texto: "Falta material (separadores, cenefas)" },
  { id: "otro", texto: "Otro motivo" },
];

export type TonoDeMontaje = "libre" | "entra" | "ocupado" | "neutro";

/** Cómo se dice el estado del montaje de una versión (en «Versiones»). */
export const ESTADO_DE_MONTAJE: Record<EstadoDeMontaje, { texto: string; tono: TonoDeMontaje }> = {
  no_rige: { texto: "Todavía no rige", tono: "neutro" },
  sin_montar: { texto: "Sin montar", tono: "ocupado" },
  por_revisar: { texto: "Montada · falta revisar", tono: "entra" },
  no_se_pudo: { texto: "No se pudo montar", tono: "ocupado" },
  coincide: { texto: "Coincide", tono: "libre" },
  no_coincide: { texto: "No coincide", tono: "ocupado" },
  sin_registro: { texto: "Sin registro de montaje", tono: "neutro" },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «21 oct» de un `AAAA-MM-DD` (sin pasar por `new Date`, que lo corre de día). */
export const diaCorto = (iso: string): string => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** «hoy 9:40», «ayer 18:05», «23 oct»: cuándo pasó algo, contra el día de hoy
 *  (`AAAA-MM-DD`, el del servidor). La hora, la del navegador. */
export function cuandoPaso(isoInstante: string | null, hoy: string): string {
  if (!isoInstante) return "";
  const d = new Date(isoInstante);
  if (Number.isNaN(d.getTime())) return "";
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (dia === hoy) return `hoy ${hora}`;
  const ayer = new Date(`${hoy}T12:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const iAyer = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;
  if (dia === iAyer) return `ayer ${hora}`;
  return diaCorto(dia);
}

/** «el 2 y el 3», «el 2», «el 1, el 2 y el 4» (los números de la guía). */
export function textoDeNumeros(numeros: readonly number[]): string {
  const xs = numeros.map((n) => `el ${n}`);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** Lo que quedó mal, en una línea: «el 2 y el 3 quedaron mal», «otra cosa». */
export function queQuedoMal(numeros: readonly number[], otraCosa: boolean): string {
  const partes: string[] = [];
  if (numeros.length === 1) partes.push(`${textoDeNumeros(numeros)} quedó mal`);
  else if (numeros.length > 1) partes.push(`${textoDeNumeros(numeros)} quedaron mal`);
  if (otraCosa) partes.push(numeros.length ? "y otra cosa" : "otra cosa");
  return partes.join(" ");
}

/** El aviso de quien monta, en palabras: «avisó que quedó · hoy 9:40». */
export function textoDelAviso(a: AvisoDeMontaje, hoy: string): string {
  const cuando = cuandoPaso(a.en, hoy);
  if (a.estado === "montada") return `avisó que quedó${cuando ? ` · ${cuando}` : ""}`;
  return `${a.motivo_legible ?? "No se pudo"}${a.nota ? ` · ${a.nota}` : ""}${cuando ? ` · ${cuando}` : ""}`;
}

/** La línea de una cara en «Para revisar». */
export function lineaParaRevisar(c: CaraPorSupervisar, hoy: string): string {
  switch (c.estado) {
    case "por_revisar":
      return `${c.aviso ? textoDelAviso(c.aviso, hoy) : "avisó que quedó"} · ${
        c.fotos_nuevas === 0 ? "sin foto" : c.fotos_nuevas === 1 ? "con 1 foto" : `con ${c.fotos_nuevas} fotos`}`;
    case "no_se_pudo":
      return c.aviso ? textoDelAviso(c.aviso, hoy) : "no se pudo";
    case "no_coincide": {
      const r = c.revision;
      if (!r) return "no coincide";
      const mal = queQuedoMal(r.numeros, r.otra_cosa);
      return `${mal}${r.guia_reenviada ? ` · guía reenviada ${cuandoPaso(r.en, hoy)}` : " · esperando que lo corrijan"}`;
    }
    case "sin_montar":
      return `${c.dias_que_rige <= 0 ? "rige desde hoy" : `rige desde el ${diaCorto(c.rige_desde)}`} · nadie avisó`;
  }
}

/** La pastilla de la fila: cuánto hace que rige («hoy», «3d»). */
export const pastillaParaRevisar = (c: CaraPorSupervisar): string => (c.dias_que_rige <= 0 ? "hoy" : `${c.dias_que_rige}d`);

/** El orden de las secciones en «Para revisar» → Hoy (el del dibujo aprobado). */
export const ORDEN_DE_SUPERVISION: readonly CaraPorSupervisar["estado"][] = ["por_revisar", "no_coincide", "no_se_pudo", "sin_montar"];

/** Lo que falta para guardar una revisión (las mismas reglas que el
 *  servidor); null si se puede. */
export function faltaParaRevisar(e: {
  resultado: ResultadoDeRevision; numeros: readonly number[]; otraCosa: boolean; nota: string;
  enLaTienda: boolean; hayFotoNueva: boolean; total: number;
}): string | null {
  if (e.resultado === "coincide") {
    return e.hayFotoNueva || e.enLaTienda ? null : "No hay foto nueva: sólo se da por buena si la viste en la tienda.";
  }
  if (e.numeros.some((n) => n < 1 || n > e.total)) return `Los números van del 1 al ${e.total}, como en la guía.`;
  if (e.numeros.length === 0 && !e.otraCosa) return "Tocá los números que quedaron mal (o «Otra cosa»).";
  if (e.otraCosa && !e.nota.trim()) return "Con «Otra cosa», escribí qué hay que corregir.";
  if (e.nota.length > 1000) return "La nota pasa de 1000 letras.";
  return null;
}
