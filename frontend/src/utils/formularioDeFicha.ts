import { CATALOGO_DE_MUEBLES, formaDe, resolverTipo, type Confiabilidad } from "../catalogo/catalogo";
import { FAMILIAS_CON_FICHA, problemasDeLaFicha, tarifasDeFicha, type ProblemaDeFicha } from "../catalogo/fichas";
import type { ModeloPropio } from "../catalogo/propias";
import { entrepanosQueEntran, TIPOS_CON_GEOMETRIA } from "./geometriaDelMueble";

/**
 * El formulario con que la dueña arma la ficha de un mueble suyo, en el taller
 * (pestaña «Fichas»). Puro —ni React, ni la API, ni el store—: lo ejecuta
 * `scripts/probar-catalogo.mjs` tal cual.
 *
 * ── Qué se escribe ───────────────────────────────────────────────────────────
 *
 * La familia (sólo las que admiten fichas: las que tienen `rango` en el
 * catálogo; la góndola, central o de pared), el nombre, las medidas EN
 * CENTÍMETROS —como vienen en una ficha técnica—, la geometría de su familia
 * (puertas, tramos, entrepaños, módulo), CÓMO SE VENDE (entera, o entera o por
 * puertas, tramos o entrepaños: lo que su familia admite), la tarifa (la de su
 * familia o una propia de las que ya existen) y de dónde salió: la URL de la
 * ficha, una nota en palabras propias y cuánto confiar. Sin foto: la dueña no
 * tiene fotos de sus muebles, y la ficha no las admite.
 *
 * «Cómo se vende» es lo que la dueña pidió de las fichas propias: que el
 * mueble que ella arma ya venga configurado para venderse por partes. Lo
 * colocado desde la ficha se estampa con eso (`estampaDe`), y Vender lo
 * ofrece entero o por partes sin tocar el panel. Los tramos de una góndola no
 * van en la ficha (la ficha es un módulo, y cuántos tramos tiene depende del
 * largo del corrido): se fijan en el panel del plano, uno por módulo. Y lo que
 * nunca se vende entero dice sus PIEZAS: la caja, cuántas bahías de impulso
 * vende (de 1 a 4); la columna, si su forro se vende.
 *
 * ── Se valida antes de mandar ────────────────────────────────────────────────
 *
 * Con las MISMAS reglas que el servidor (`problemasDeLaFicha`, que corre los
 * casos compartidos de `casos/fichas.json`), y además una que el servidor no
 * puede hacer porque depende de cotas del dibujo: que los entrepaños queden a
 * 25 cm o más (`entrepanosQueEntran`). `guardarFicha` no llama a la API si hay
 * un problema; si el servidor igual dice que no (otro dato, una clave que ya
 * existe), sus problemas vuelven por campo, con sus palabras.
 */

/** Lo que tiene escrito el formulario: textos, como en los campos. */
export interface FormularioDeFicha {
  /** La familia, como una entrada de la paleta: `gondola:double`, `punta`… */
  entrada: string;
  nombre: string;
  /** Lo que guarda el plano (`cli:<clave>`). Sale del nombre mientras la
   *  dueña no la toque; al editar, no cambia. */
  clave: string;
  claveTocada: boolean;
  anchoCm: string;
  fondoCm: string;
  altoCm: string;
  entrepanos: string;
  moduloCm: string;
  puertas: string;
  /** Los tramos del frente (la nevera abierta, la de vegetales). */
  tramos: string;
  /** Cómo se vende: `""` entera; o la división (`puertas`, `tramos`,
   *  `entrepanos`), de las que admite su familia. */
  division: string;
  /** Las bahías de impulso de una caja que se venden (`""`: ninguna). */
  bahias: string;
  /** El forro de una columna se vende: `"si"`, o `""`. */
  forro: string;
  /** `""`: la tarifa de su familia. */
  tarifa: string;
  url: string;
  nota: string;
  confiabilidad: Confiabilidad | "";
}

/** Una familia que admite fichas, como la ofrece el formulario. */
export interface FamiliaDeFicha {
  entrada: string;
  tipo: string;
  variante?: string;
  rotulo: string;
  /** En metros, del catálogo. */
  rango: { w: [number, number]; d: [number, number]; h: [number, number] };
  geometria: {
    entrepanos?: [number, number]; modulo?: [number, number]; puertas?: [number, number]; tramos?: [number, number];
    bahias?: [number, number];
  };
  /** Las formas en que se vende por partes (`partes.divisiones` de la
   *  familia), y cuáles se cuentan en el plano y no en la ficha. */
  divisiones: string[];
  seCuentanEnElPlano: string[];
  /** Las piezas que lleva (`partes.piezas`: las bahías de la caja, el forro
   *  de la columna). */
  piezas: string[];
  /** La clave de la tarifa de su familia y las propias que puede elegir. */
  tarifa?: string;
  tarifasPropias: string[];
}

const rotuloDeTarifa = (clave: string) => CATALOGO_DE_MUEBLES.tarifas.find((t) => t.clave === clave)?.rotulo ?? clave;

/** Las familias que admiten fichas, en el orden de la paleta del 3D. La góndola
 *  va dos veces —central y de pared—, porque de eso dependen las caras. */
export const FAMILIAS_DEL_FORMULARIO: readonly FamiliaDeFicha[] = CATALOGO_DE_MUEBLES.orden.editor3D.flatMap((entrada) => {
  const r = resolverTipo(entrada);
  if (!r || !Object.prototype.hasOwnProperty.call(FAMILIAS_CON_FICHA, r.clave)) return [];
  const t = r.tipo;
  const forma = formaDe(t, r.variante);
  const rotulo = r.variante !== undefined
    ? `${forma.rotuloEditor ?? r.clave} (${forma.caras === 2 ? "central, dos caras" : "de pared, una cara"})`
    : t.tarifa ? rotuloDeTarifa(t.tarifa) : (forma.rotuloEditor ?? r.clave);
  return [{
    entrada,
    tipo: r.clave,
    ...(r.variante !== undefined ? { variante: r.variante } : {}),
    rotulo,
    rango: t.rango!,
    geometria: t.geometria ?? {},
    divisiones: t.partes?.divisiones ?? [],
    seCuentanEnElPlano: t.partes?.seCuentanEnElPlano ?? [],
    piezas: t.partes?.piezas ?? [],
    ...(t.tarifa ? { tarifa: t.tarifa } : {}),
    tarifasPropias: tarifasDeFicha(r.clave),
  }];
});

export function familiaDe(entrada: string): FamiliaDeFicha | undefined {
  return FAMILIAS_DEL_FORMULARIO.find((f) => f.entrada === entrada);
}

/** El rótulo de una tarifa, para el selector («Media estiba»). */
export { rotuloDeTarifa };

const cm = (m: number | undefined) => (m === undefined ? "" : String(Math.round(m * 1000) / 10).replace(".", ","));

/** Un formulario en blanco para esa familia, con las medidas con que nace
 *  su mueble de siempre. */
export function formularioVacio(entrada: string): FormularioDeFicha {
  const r = resolverTipo(entrada);
  const medidas = r ? formaDe(r.tipo, r.variante).medidas : undefined;
  return {
    entrada, nombre: "", clave: "", claveTocada: false,
    anchoCm: cm(medidas?.w), fondoCm: cm(medidas?.d), altoCm: cm(medidas?.h),
    entrepanos: "", moduloCm: "", puertas: "", tramos: "", division: "", bahias: "", forro: "",
    tarifa: "", url: "", nota: "", confiabilidad: "",
  };
}

/** El formulario de una ficha que ya está guardada, para editarla. */
export function formularioDe(m: ModeloPropio): FormularioDeFicha {
  return {
    entrada: m.variante !== undefined ? `${m.tipo}:${m.variante}` : m.tipo,
    nombre: m.nombre, clave: m.clave, claveTocada: true,
    anchoCm: cm(m.w), fondoCm: cm(m.d), altoCm: cm(m.h),
    entrepanos: m.entrepanos !== undefined ? String(m.entrepanos) : "",
    moduloCm: cm(m.modulo),
    puertas: m.partes?.puertas != null ? String(m.partes.puertas) : "",
    tramos: m.partes?.tramos != null ? String(m.partes.tramos) : "",
    division: typeof m.partes?.division === "string" ? m.partes.division : "",
    bahias: typeof m.partes?.bahias === "number" ? String(m.partes.bahias) : "",
    forro: m.partes?.forro === true ? "si" : "",
    tarifa: m.tarifa ?? "",
    url: m.fuente.url ?? "", nota: m.fuente.nota ?? "",
    confiabilidad: m.fuente.confiabilidad,
  };
}

/** La clave que sale de un nombre: «Nevera Inducol 2 puertas» →
 *  `nevera-inducol-2-puertas`. Minúsculas sin tildes, números y guiones,
 *  hasta 60: lo que admite `fichas.clave` del catálogo. */
export function claveDeNombre(nombre: string): string {
  return nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Un número escrito con coma o con punto; vacío es `undefined` y lo que no
 *  es un número, `NaN` (la validación dice «tiene que ser un número»). */
function numero(texto: string): number | undefined {
  const t = texto.trim().replace(",", ".");
  if (!t) return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** Centímetros a metros, al milímetro. */
function metrosDe(texto: string): number | undefined {
  const n = numero(texto);
  return n === undefined || Number.isNaN(n) ? n : Math.round(n * 10) / 1000;
}

/** La ficha que se manda: en metros, sin lo vacío y sólo con la geometría
 *  que admite su familia (la que no admite no se muestra, y no viaja). Al
 *  editar no lleva la clave: no cambia. */
export function fichaDelFormulario(f: FormularioDeFicha, { nueva = true }: { nueva?: boolean } = {}): Record<string, unknown> {
  const familia = familiaDe(f.entrada);
  const r = resolverTipo(f.entrada);
  const geo = familia?.geometria ?? {};
  const entrepanos = geo.entrepanos ? numero(f.entrepanos) : undefined;
  const modulo = geo.modulo ? metrosDe(f.moduloCm) : undefined;
  const puertas = geo.puertas ? numero(f.puertas) : undefined;
  // Los tramos que se cuentan en el plano (los de la góndola) no van.
  const tramos = geo.tramos && !familia?.seCuentanEnElPlano.includes("tramos") ? numero(f.tramos) : undefined;
  const division = f.division && familia?.divisiones.includes(f.division) ? f.division : undefined;
  // Las piezas: las bahías de la caja (un número) y el forro de la columna.
  const bahias = geo.bahias ? numero(f.bahias) : undefined;
  const forro = familia?.piezas.includes("forro") && f.forro === "si" ? true : undefined;
  const partes = {
    ...(puertas !== undefined ? { puertas } : {}),
    ...(tramos !== undefined ? { tramos } : {}),
    ...(division !== undefined ? { division } : {}),
    ...(bahias !== undefined ? { bahias } : {}),
    ...(forro !== undefined ? { forro } : {}),
  };
  const url = f.url.trim();
  const nota = f.nota.trim();
  return {
    ...(nueva ? { clave: f.clave.trim() } : {}),
    tipo: r?.clave ?? f.entrada,
    ...(r?.variante !== undefined ? { variante: r.variante } : {}),
    nombre: f.nombre.trim(),
    w: metrosDe(f.anchoCm), d: metrosDe(f.fondoCm), h: metrosDe(f.altoCm),
    ...(entrepanos !== undefined ? { entrepanos } : {}),
    ...(modulo !== undefined ? { modulo } : {}),
    ...(Object.keys(partes).length ? { partes } : {}),
    ...(f.tarifa ? { tarifa: f.tarifa } : {}),
    fuente: {
      confiabilidad: f.confiabilidad,
      ...(url ? { url } : {}),
      ...(nota ? { nota } : {}),
    },
  };
}

const m2 = (x: number) => x.toFixed(2).replace(".", ",");

/**
 * Lo que está mal en el formulario, por campo de la ficha (`w`, `entrepanos`,
 * `fuente.url`…). Vacío es que se puede guardar. Son los problemas de
 * `problemasDeLaFicha` —las mismas reglas que el servidor—, con las medidas
 * dichas en centímetros, más los entrepaños que no caben a 25 cm.
 */
export function problemasDelFormulario(f: FormularioDeFicha, { nueva = true }: { nueva?: boolean } = {}): ProblemaDeFicha[] {
  const ficha = fichaDelFormulario(f, { nueva });
  const modulo = familiaDe(f.entrada)?.geometria.modulo;
  const mal = problemasDeLaFicha(ficha, { nueva }).map((p) => ({
    ...p,
    // El módulo se escribe en centímetros; la regla lo dice en metros.
    problema: p.campo === "modulo" && modulo && /van de/.test(p.problema)
      ? `el módulo va de ${cm(modulo[0])} a ${cm(modulo[1])} cm`
      // En el formulario es una lista: lo que falta es elegir.
      : p.campo === "fuente.confiabilidad" && !f.confiabilidad
        ? "elegí cuánto confiar en las medidas"
        : enCentimetros(p.problema),
  }));
  const { tipo, h, entrepanos } = ficha as { tipo: string; h?: number; entrepanos?: number };
  if (TIPOS_CON_GEOMETRIA.has(tipo) && typeof h === "number" && Number.isFinite(h)
    && typeof entrepanos === "number" && Number.isInteger(entrepanos) && !mal.some((p) => p.campo === "entrepanos" || p.campo === "h")) {
    const caben = entrepanosQueEntran(tipo, h);
    if (entrepanos > caben) {
      mal.push({
        campo: "entrepanos",
        problema: `con ${m2(h)} m de alto entran hasta ${caben} entrepaños: más apretados quedan a menos de 25 cm y no entra el producto`,
      });
    }
  }
  return mal;
}

/** «(1,95 m)» y «(0,60 a 1,50 m)» de la validación, dichos en centímetros:
 *  el formulario se escribe en centímetros. */
function enCentimetros(texto: string): string {
  return texto
    .replace(/\((\d+,\d+) m\)/g, (_, a) => `(${cmDeTexto(a)} cm)`)
    .replace(/\((\d+,\d+) a (\d+,\d+) m\)/g, (_, a, b) => `(${cmDeTexto(a)} a ${cmDeTexto(b)} cm)`)
    .replace(/, en metros/g, ", en centímetros");
}
const cmDeTexto = (metros: string) => cm(Number(metros.replace(",", ".")));

/** El campo de la ficha del que habla cada problema, como lo nombra el
 *  formulario (para marcarlo y poner el texto debajo). */
export const CAMPO_DEL_FORMULARIO: Record<string, keyof FormularioDeFicha> = {
  clave: "clave", tipo: "entrada", variante: "entrada", nombre: "nombre",
  w: "anchoCm", d: "fondoCm", h: "altoCm",
  entrepanos: "entrepanos", modulo: "moduloCm", partes: "puertas", "partes.puertas": "puertas",
  "partes.tramos": "tramos", "partes.division": "division", "partes.bahias": "bahias", "partes.forro": "forro",
  tarifa: "tarifa", fuente: "nota", "fuente.url": "url", "fuente.nota": "nota",
  "fuente.confiabilidad": "confiabilidad",
};

/** Los problemas de un error del servidor, en las palabras de la dueña:
 *  un 422 trae cada problema con su campo (`loc`) y su mensaje ya escrito
 *  para ella; un 409 es una clave que ya existe; el resto, qué pasó y que
 *  la ficha no se guardó. */
export function problemasDelServidor(err: unknown): ProblemaDeFicha[] {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = res?.data?.detail;
  if (res?.status === 422 && Array.isArray(detail)) {
    const out: ProblemaDeFicha[] = [];
    for (const d of detail as unknown[]) {
      if (!d || typeof d !== "object") continue;
      const { loc, msg } = d as { loc?: unknown; msg?: unknown };
      const partes = Array.isArray(loc) ? loc.filter((x) => x !== "body").map(String) : [];
      out.push({ campo: partes.join(".") || "ficha", problema: enCentimetros(typeof msg === "string" ? msg : "no se pudo guardar") });
    }
    if (out.length) return out;
  }
  if (res?.status === 409) {
    return [{ campo: "clave", problema: typeof detail === "string" ? detail : "ya hay una ficha con esa clave" }];
  }
  if (res?.status === 403) return [{ campo: "ficha", problema: "Sólo administración guarda fichas de muebles." }];
  if (res?.status === 404) return [{ campo: "ficha", problema: "Esa ficha ya no está: recargá la lista." }];
  if (!res) return [{ campo: "ficha", problema: "No hay conexión con el servidor: la ficha no se guardó." }];
  return [{ campo: "ficha", problema: typeof detail === "string" && detail.trim() ? detail : "No se pudo guardar la ficha. Probá de nuevo." }];
}

/** Lo que necesita `guardarFicha` de la API (la de verdad está en
 *  `api/muebles.ts`; las pruebas le pasan otra que anota). */
export interface ApiDeFichas {
  crear: (ficha: never) => Promise<ModeloPropio>;
  cambiar: (clave: string, ficha: never) => Promise<ModeloPropio>;
}

/**
 * Guarda la ficha del formulario: la crea, o cambia la que tiene esa clave.
 * Si el formulario tiene un problema —una medida fuera del rango de su
 * familia, los entrepaños que no caben, la fuente sin URL ni nota— NO llama a
 * la API y devuelve los problemas. Si la API dice que no, devuelve los suyos.
 */
export async function guardarFicha(
  f: FormularioDeFicha,
  editando: string | null,
  api: ApiDeFichas,
): Promise<{ ok: true; ficha: ModeloPropio } | { ok: false; problemas: ProblemaDeFicha[] }> {
  const nueva = editando === null;
  const problemas = problemasDelFormulario(f, { nueva });
  if (problemas.length) return { ok: false, problemas };
  const ficha = fichaDelFormulario(f, { nueva }) as never;
  try {
    const guardada = nueva ? await api.crear(ficha) : await api.cambiar(editando, ficha);
    return { ok: true, ficha: guardada };
  } catch (err) {
    return { ok: false, problemas: problemasDelServidor(err) };
  }
}

/** Lo que necesita `retirarOReactivarFicha` de la API (la de verdad está en
 *  `api/muebles.ts`; las pruebas le pasan otra que anota). */
export interface ApiDeRetiro {
  retirar: (clave: string) => Promise<ModeloPropio>;
  reactivar: (clave: string) => Promise<ModeloPropio>;
}

/**
 * «Retirar» una ficha vigente o «Reactivar» una retirada, y DESPUÉS volver a
 * leer las fichas de la sesión (`recargar`), que es lo que la saca de las
 * paletas o la devuelve. En ese orden: releída antes del pedido, la paleta
 * seguía ofreciendo la retirada con el taller diciendo «quedó retirada».
 * Devuelve el aviso para la dueña; si el servidor dice que no, lanza su error
 * (y no relee). Retirar no borra nada: lo colocado con ella sigue igual.
 */
export async function retirarOReactivarFicha(
  m: Pick<ModeloPropio, "clave" | "nombre" | "retirado">,
  api: ApiDeRetiro,
  recargar: () => Promise<void>,
): Promise<string> {
  if (m.retirado) await api.reactivar(m.clave);
  else await api.retirar(m.clave);
  await recargar();
  return m.retirado
    ? `«${m.nombre}» vuelve al catálogo del plano.`
    : `«${m.nombre}» quedó retirado: ya no se ofrece en el plano. Lo ya colocado sigue igual.`;
}

/**
 * La ficha del formulario para DIBUJARLA en el taller mientras se escribe:
 * con las medidas y la geometría metidas en el rango de su familia (una
 * medida a medio escribir no dibuja una góndola de 30 m), y lo vacío como lo
 * dejaría el mueble de siempre. `null` si la familia no admite fichas. No es
 * lo que se guarda: eso es `fichaDelFormulario`, y lo que esté fuera de rango
 * se marca en el campo.
 */
export function fichaParaDibujar(f: FormularioDeFicha): ModeloPropio | null {
  const familia = familiaDe(f.entrada);
  if (!familia) return null;
  const vacio = formularioVacio(f.entrada);
  const enRango = (texto: string, defecto: string, r: [number, number]) => {
    const v = metrosDe(texto);
    const x = v === undefined || Number.isNaN(v) ? metrosDe(defecto) ?? r[0] : v;
    return Math.min(r[1], Math.max(r[0], x));
  };
  const w = enRango(f.anchoCm, vacio.anchoCm, familia.rango.w);
  const d = enRango(f.fondoCm, vacio.fondoCm, familia.rango.d);
  const h = enRango(f.altoCm, vacio.altoCm, familia.rango.h);
  const geo = familia.geometria;
  const entero = (texto: string, r: [number, number] | undefined) => {
    const v = r ? numero(texto) : undefined;
    return v === undefined || !Number.isFinite(v) ? undefined : Math.min(r![1], Math.max(r![0], Math.round(v)));
  };
  let entrepanos = entero(f.entrepanos, geo.entrepanos);
  if (entrepanos !== undefined && TIPOS_CON_GEOMETRIA.has(familia.tipo)) {
    entrepanos = Math.min(entrepanos, Math.max(1, entrepanosQueEntran(familia.tipo, h)));
  }
  const moduloM = geo.modulo ? metrosDe(f.moduloCm) : undefined;
  const modulo = moduloM === undefined || Number.isNaN(moduloM) ? undefined
    : Math.min(geo.modulo![1], Math.max(geo.modulo![0], moduloM));
  const puertas = entero(f.puertas, geo.puertas);
  const tramos = familia.seCuentanEnElPlano.includes("tramos") ? undefined : entero(f.tramos, geo.tramos);
  const division = f.division && familia.divisiones.includes(f.division) ? f.division : undefined;
  const bahias = entero(f.bahias, geo.bahias);
  const forro = familia.piezas.includes("forro") && f.forro === "si" ? true : undefined;
  const partes = {
    ...(puertas !== undefined ? { puertas } : {}),
    ...(tramos !== undefined ? { tramos } : {}),
    ...(division !== undefined ? { division } : {}),
    ...(bahias !== undefined ? { bahias } : {}),
    ...(forro !== undefined ? { forro } : {}),
  };
  return {
    id: `${CATALOGO_DE_MUEBLES.fichas.prefijoPropio}${f.clave || "nueva"}`,
    clave: f.clave || "nueva",
    tipo: familia.tipo,
    ...(familia.variante !== undefined ? { variante: familia.variante } : {}),
    nombre: f.nombre.trim() || "Ficha nueva",
    w, d, h,
    ...(entrepanos !== undefined ? { entrepanos } : {}),
    ...(modulo !== undefined ? { modulo } : {}),
    ...(Object.keys(partes).length ? { partes } : {}),
    ...(f.tarifa ? { tarifa: f.tarifa } : {}),
    fuente: { confiabilidad: f.confiabilidad || "estimado" },
    retirado: false,
  };
}

// ─── El asistente de «Mis muebles» (2026-10-28) ──────────────────────────────
//
// El taller pasó de un formulario largo a tres pasos: qué mueble es, cuánto
// mide, y nombre y cómo se vende. Las reglas son las de siempre
// (`problemasDelFormulario`): cada paso muestra y frena sólo con lo suyo, y
// guardar las vuelve a correr todas.

/** Los tres pasos del asistente. */
export type PasoDelAsistente = 1 | 2 | 3;

/** Los campos que escribe cada paso. */
export const CAMPOS_DEL_PASO: Record<PasoDelAsistente, readonly (keyof FormularioDeFicha)[]> = {
  1: ["entrada"],
  2: ["anchoCm", "fondoCm", "altoCm", "entrepanos", "moduloCm", "puertas", "tramos"],
  3: ["nombre", "clave", "division", "bahias", "forro", "tarifa", "url", "nota", "confiabilidad"],
};

/** El paso donde se corrige un problema de la ficha (por su campo). */
export function pasoDelProblema(p: ProblemaDeFicha): PasoDelAsistente {
  const campo = CAMPO_DEL_FORMULARIO[p.campo];
  if (campo && CAMPOS_DEL_PASO[1].includes(campo)) return 1;
  if (campo && CAMPOS_DEL_PASO[2].includes(campo)) return 2;
  return 3;
}

/** Los problemas que frenan un paso: los de sus campos. */
export function problemasDelPaso(f: FormularioDeFicha, paso: PasoDelAsistente, { nueva = true }: { nueva?: boolean } = {}): ProblemaDeFicha[] {
  return problemasDelFormulario(conOrigenCompleto(f), { nueva }).filter((p) => pasoDelProblema(p) === paso);
}

/** De dónde salieron las medidas, en una elección de tres: cada una es una
 *  `confiabilidad` y pide lo suyo. «Las medí en la tienda» no pide nada más
 *  (la nota la pone `conOrigenCompleto`; en el plano lleva «≈», como siempre
 *  lo estimado); la ficha del fabricante pide el enlace; un catálogo, el
 *  enlace o una nota. */
export const ORIGENES: readonly { valor: Confiabilidad; titulo: string; detalle: string; pide: "nada" | "url" | "url_o_nota" }[] = [
  { valor: "estimado", titulo: "Las medí en la tienda", detalle: "Con metro. En el plano lleva «≈».", pide: "nada" },
  { valor: "ficha", titulo: "Ficha del fabricante", detalle: "Pide el enlace de la página.", pide: "url" },
  { valor: "catalogo", titulo: "Un catálogo o listado", detalle: "Pide el enlace o una nota.", pide: "url_o_nota" },
];

/** La nota con que se guarda «Las medí en la tienda» si no se escribió otra. */
export const NOTA_DE_LA_TIENDA = "Medida en la tienda con metro.";

/** El formulario como se manda: «Las medí en la tienda» sin enlace ni nota
 *  lleva su nota, que la ficha exige (el servidor pide enlace o nota). */
export function conOrigenCompleto(f: FormularioDeFicha): FormularioDeFicha {
  return f.confiabilidad === "estimado" && !f.url.trim() && !f.nota.trim() ? { ...f, nota: NOTA_DE_LA_TIENDA } : f;
}

/** «Empezar desde»: un modelo de RECABRA de la familia como punto de partida.
 *  Copia sus medidas, su geometría, cómo se vende y su tarifa propia. NO copia
 *  de dónde salió: el enlace del modelo respalda SUS medidas, y las de este
 *  mueble se van a cambiar; eso lo dice quien lo arma, en el paso 3. El nombre
 *  y la clave también quedan para escribir. */
export function formularioDesdeModelo(
  entrada: string, m: Pick<ModeloPropio, "w" | "d" | "h" | "entrepanos" | "modulo" | "partes" | "tarifa">,
): FormularioDeFicha {
  const familia = familiaDe(entrada);
  const tarifa = m.tarifa && familia?.tarifasPropias.includes(m.tarifa) ? m.tarifa : "";
  return {
    ...formularioVacio(entrada),
    anchoCm: cm(m.w), fondoCm: cm(m.d), altoCm: cm(m.h),
    entrepanos: m.entrepanos !== undefined ? String(m.entrepanos) : "",
    moduloCm: cm(m.modulo),
    puertas: m.partes?.puertas != null ? String(m.partes.puertas) : "",
    tramos: m.partes?.tramos != null ? String(m.partes.tramos) : "",
    division: typeof m.partes?.division === "string" ? m.partes.division : "",
    bahias: typeof m.partes?.bahias === "number" ? String(m.partes.bahias) : "",
    forro: m.partes?.forro === true ? "si" : "",
    tarifa,
  };
}

/** La familia del asistente para un tipo del plano 2D (`gondola_doble`,
 *  `nevera_puertas`…): «Crear un mueble con otras medidas» trae el que se
 *  estaba por colocar. `undefined` si no es un tipo, o no admite fichas. */
export function entradaDelTipoDelPlano(tipo: string | null | undefined): string | undefined {
  const r = tipo ? resolverTipo(tipo) : null;
  if (!r) return undefined;
  const entrada = r.variante !== undefined ? `${r.clave}:${r.variante}` : r.clave;
  return familiaDe(entrada) ? entrada : undefined;
}

/** Un número del formulario más o menos `paso` (los «−» y «+» del asistente),
 *  dentro de `[min, max]`. Vacío arranca en `desde` (el valor automático). */
export function pasoDeNumero(texto: string, paso: number, min: number, max: number, desde: number): string {
  const n = numero(texto);
  const base = n === undefined || Number.isNaN(n) ? desde : n;
  const v = Math.min(max, Math.max(min, Math.round((base + paso) * 10) / 10));
  return String(v).replace(".", ",");
}
