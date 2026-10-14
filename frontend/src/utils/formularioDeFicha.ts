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
 * (puertas, entrepaños, módulo), la tarifa (la de su familia o una propia de
 * las que ya existen) y de dónde salió: la URL de la ficha, una nota en
 * palabras propias y cuánto confiar. Sin foto: la dueña no tiene fotos de sus
 * muebles, y la ficha no las admite.
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
  geometria: { entrepanos?: [number, number]; modulo?: [number, number]; puertas?: [number, number] };
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
    entrepanos: "", moduloCm: "", puertas: "",
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
    puertas: m.partes?.puertas !== undefined ? String(m.partes.puertas) : "",
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
    ...(puertas !== undefined ? { partes: { puertas } } : {}),
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
  return m.retirado ? `«${m.nombre}» vuelve a la paleta.` : `«${m.nombre}» quedó retirada.`;
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
  return {
    id: `${CATALOGO_DE_MUEBLES.fichas.prefijoPropio}${f.clave || "nueva"}`,
    clave: f.clave || "nueva",
    tipo: familia.tipo,
    ...(familia.variante !== undefined ? { variante: familia.variante } : {}),
    nombre: f.nombre.trim() || "Ficha nueva",
    w, d, h,
    ...(entrepanos !== undefined ? { entrepanos } : {}),
    ...(modulo !== undefined ? { modulo } : {}),
    ...(puertas !== undefined ? { partes: { puertas } } : {}),
    ...(f.tarifa ? { tarifa: f.tarifa } : {}),
    fuente: { confiabilidad: f.confiabilidad || "estimado" },
    retirado: false,
  };
}
