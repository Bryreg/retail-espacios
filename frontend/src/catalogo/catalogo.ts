import datos from "./muebles.json";

/**
 * El catálogo de los tipos de mueble, leído de UN archivo: `muebles.json`.
 *
 * ── Lo que había antes ───────────────────────────────────────────────────────
 *
 * El tipo de mueble estaba escrito a mano en unas veintidós tablas: el catálogo
 * del editor 3D, el del plano 2D, los altos y colores con que nace un mueble en
 * el 2D, los prefijos, lo que no se alquila, las tarifas, los nombres de los
 * informes, los muebles de frío, las referencias del minimapa… y del lado del
 * servidor sus copias. Algunas se vigilaban entre sí y el resto ya no decía lo
 * mismo: el mostrador de carnes nacía con 0,85 de fondo en el 2D y 0,90 en el
 * 3D, el servicio al cliente dibujado en el 2D nacía de 1,80 m de alto, los
 * informes nombraban `metro` y `mueble` por su clave.
 *
 * Ahora cada tipo está una vez, en `muebles.json`, y las tablas de siempre se
 * CALCULAN de ahí, con el mismo nombre y en el mismo orden: `FIXTURE_DEFS` y
 * los `TIPOS_CON_*` (`catalogo/editor3D.ts`), `CATALOG`, `H_DEFAULTS` y
 * `COLOR_DEFAULTS` (`catalogo/plano2D.ts`), `REFERENCIAS`
 * (`catalogo/minimapa.ts`), `NUNCA_ALQUILABLE`, `NON_RENTABLE_BY_DEFAULT`,
 * `RATE_TYPES` y `CATEGORIA_DE_TIPO` (`types/fixtures.ts`), `PREFIJO_POR_TIPO`
 * (`utils/nomenclatura.ts`), `MUEBLES_FRIOS` (`muebles/producto.ts`),
 * `FORMAN_CORRIDA` (`utils/pasillos.ts`) y los nombres de `plataforma/formato.ts`.
 * Quien las usaba no cambió.
 *
 * El servidor lee una copia idéntica byte a byte
 * (`backend/app/catalogo/muebles.json`, con `app/services/catalogo_muebles.py`):
 * la imagen de Docker lleva `backend/` y `frontend/dist`, no una carpeta
 * compartida. `tests/test_catalogo_muebles.py` exige que las dos sean iguales.
 *
 * ── Lo que NO hace ───────────────────────────────────────────────────────────
 *
 * No toca lo guardado. Las medidas, el color y el rótulo del catálogo se usan
 * al CREAR un mueble; el que ya está en un plano conserva los suyos. Las claves
 * de los tipos, los prefijos y las claves de tarifa no cambian: están en los
 * planos, en los códigos de espacio y en las tarifas de cada cliente.
 *
 * `scripts/probar-catalogo.mjs` valida el archivo y compara todo lo que se
 * calcula de él contra `scripts/casos/catalogo-antes.json`, lo que hacía el
 * código antes, con la lista escrita de lo que cambió a propósito.
 */

/** Si el tipo se alquila: siempre, sólo si se lo habilita a mano (nace con
 *  `rentable: false`), o nunca, diga lo que diga la bandera. */
export type Alquilable = "si" | "no_por_defecto" | "nunca";

/** Lo que el tipo lleva, para las pantallas que preguntan por tipo.
 *  · `producto`: puede llevar el producto del proveedor (`TIPOS_CON_PRODUCTO`).
 *  · `prueba3D`: el producto de prueba se para como envases 3D (`TIPOS_CON_PRUEBA_3D`).
 *  · `surtido`: se ofrece el surtido de varios productos (`TIPOS_CON_SURTIDO`).
 *  · `frio`: es un mueble refrigerado (`MUEBLES_FRIOS`).
 *  · `formaCorrida`: arma corrida en el recorrido de la tienda (`FORMAN_CORRIDA`). */
export type Bandera = "producto" | "prueba3D" | "surtido" | "frio" | "formaCorrida";
export const BANDERAS: readonly Bandera[] = ["producto", "prueba3D", "surtido", "frio", "formaCorrida"];

export interface Medidas { w: number; d: number; h: number }

/** Cómo nace un mueble del tipo (o de una variante): sólo se usa al crearlo. */
export interface FormaDeMueble {
  /** El rótulo de los dos editores. El 2D lo estampa en `label` cada vez que
   *  abre el plano: cambiarlo cambia lo guardado. */
  rotuloEditor?: string;
  /** Metros: ancho, fondo y alto. */
  medidas?: Partial<Medidas>;
  color?: string;
  /** El color con que nace dibujado en el 2D, cuando no es el del 3D. */
  color2D?: string;
  emoji?: string;
  descripcion?: string;
}

export interface VarianteDeMueble extends FormaDeMueble {
  /** Caras vendibles: 2 es la cara A y la `-B`. Tiene que decir lo mismo que
   *  `carasDe` (`types/espacio.ts`); `probar-catalogo.mjs` lo compara. */
  caras: 1 | 2;
}

export interface TipoDeMueble extends FormaDeMueble {
  /** Las tres letras del código de espacio (`GON-01`). No cambia nunca. */
  prefijo: string;
  alquilable: Alquilable;
  /** Clave de la tarifa de referencia (`tarifas`). Falta en lo que no se vende. */
  tarifa?: string;
  /** Cómo lo nombran los informes, en minúscula: va a mitad de frase. */
  informe?: string;
  informePlural?: string;
  /** La familia comercial (`CATEGORIA_DE_TIPO`). */
  categoria?: string;
  /** El grupo de la biblioteca del plano 2D. */
  grupo2D?: string;
  /** El nombre con que el minimapa lo usa de referencia. */
  referencia?: { corto: string; frase: string };
  banderas: Bandera[];
  /** Sólo existe en planos viejos: no se coloca ni tiene tarifa. */
  legado?: boolean;
  /** Formas del mismo tipo (la góndola: doble y mural), por `gondolaType`. */
  variantes?: Record<string, VarianteDeMueble>;
}

/** Un nombre viejo del 2D que es un tipo con una variante fija. Las banderas
 *  van escritas una por una: así estaban en las tablas de antes. */
export interface AliasDeMueble { tipo: string; variante: string; banderas: Bandera[] }

export interface CatalogoDeMuebles {
  version: number;
  leeme: string[];
  prefijoDesconocido: string;
  tipos: Record<string, TipoDeMueble>;
  alias: Record<string, AliasDeMueble>;
  /** Las tarifas de referencia, en el orden en que se muestran. */
  tarifas: { clave: string; rotulo: string }[];
  orden: {
    /** La paleta del editor 3D: `tipo` o `tipo:variante`. `/taller` elige por posición. */
    editor3D: string[];
    /** La biblioteca del plano 2D: tipos y alias. */
    plano2D: string[];
    /** Las referencias del minimapa: ante dos etiquetas que chocan, gana la primera. */
    minimapa: string[];
  };
}

export const CATALOGO_DE_MUEBLES = datos as unknown as CatalogoDeMuebles;

const C = CATALOGO_DE_MUEBLES;

/** Un tipo o un alias, con su variante: `"gondola:double"` y `"gondola_doble"`
 *  dan lo mismo. Lo que no está en el catálogo da `null`. */
export function resolverTipo(nombre: string): { clave: string; tipo: TipoDeMueble; variante?: string } | null {
  const [base, variante] = nombre.split(":");
  const alias = C.alias[base];
  const clave = alias ? alias.tipo : base;
  const tipo = C.tipos[clave];
  if (!tipo) return null;
  return { clave, tipo, variante: alias ? alias.variante : variante };
}

/** La forma con que nace un mueble: la de su variante, si la tiene, sobre la del tipo. */
export function formaDe(tipo: TipoDeMueble, variante?: string): FormaDeMueble & { caras?: 1 | 2 } {
  const v = variante !== undefined ? tipo.variantes?.[variante] : undefined;
  return v ? { ...tipo, ...v } : tipo;
}

/** El prefijo de cada tipo y de cada alias, en el orden del archivo. */
export function prefijosPorTipo(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [t, d] of Object.entries(C.tipos)) out[t] = d.prefijo;
  for (const [a, x] of Object.entries(C.alias)) out[a] = C.tipos[x.tipo].prefijo;
  return out;
}

/** Los tipos con alguno de esos niveles de `alquilable`. */
export function tiposQueSeAlquilan(...niveles: Alquilable[]): string[] {
  return Object.entries(C.tipos).filter(([, d]) => niveles.includes(d.alquilable)).map(([t]) => t);
}

/** Los tipos y los alias que llevan esa bandera. */
export function tiposConBandera(b: Bandera): string[] {
  return [
    ...Object.entries(C.tipos).filter(([, d]) => d.banderas.includes(b)).map(([t]) => t),
    ...Object.entries(C.alias).filter(([, x]) => x.banderas.includes(b)).map(([a]) => a),
  ];
}

/** La clave de tarifa de cada tipo y alias que la tiene. */
export function tarifaPorTipo(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [t, d] of Object.entries(C.tipos)) if (d.tarifa) out[t] = d.tarifa;
  for (const [a, x] of Object.entries(C.alias)) {
    const tarifa = C.tipos[x.tipo].tarifa;
    if (tarifa) out[a] = tarifa;
  }
  return out;
}

/** La familia comercial de los tipos que la tienen. */
export function categoriasDeTipo(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [t, d] of Object.entries(C.tipos)) if (d.categoria) out[t] = d.categoria;
  return out;
}

/** Los nombres de los informes, singular y plural, de los tipos que los tienen. */
export function nombresDeInforme(): { singular: Record<string, string>; plural: Record<string, string> } {
  const singular: Record<string, string> = {};
  const plural: Record<string, string> = {};
  for (const [t, d] of Object.entries(C.tipos)) {
    if (d.informe) singular[t] = d.informe;
    if (d.informePlural) plural[t] = d.informePlural;
  }
  return { singular, plural };
}
