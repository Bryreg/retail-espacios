import datos from "./muebles.json";
import { fichaPropiaPorId, type ModeloPropio } from "./propias";

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
 *
 * ── Los modelos ──────────────────────────────────────────────────────────────
 *
 * Un TIPO dice cómo se dibuja un mueble y cómo se cobra; un MODELO es una
 * ficha de un mueble de verdad dentro de ese tipo —la góndola central de 2,00
 * con módulo de 1,00, la nevera de tres puertas de Frigomaster, la media
 * estiba—, con la URL de donde salieron las medidas y cuánto confiar en ellas
 * (`ficha`, `catalogo` o `estimado`). Nunca una imagen de terceros: sólo
 * medidas, dichas con palabras propias.
 *
 * Cada tipo tiene su modelo base implícito (`base:<tipo>`, o `base:<alias>` en
 * la góndola): colocarlo es colocar el mueble como siempre, sin `modelo`. Al
 * colocar un modelo se ESTAMPAN en el mueble sus medidas, su color, su id y su
 * geometría (`estampaDe`), y lo guardado no se vuelve a leer de acá: cambiar
 * una ficha no mueve lo ya colocado. Lo único que se busca por el id es la
 * tarifa de los modelos que tienen una propia (`tarifaDeModelo`).
 *
 * Las fichas PROPIAS de cada supermercado (`cli:<clave>`, las que arma la
 * dueña en el taller) se buscan igual, por el mismo `modeloPorId`: viven en su
 * base y las trae `catalogo/propias.ts`. Mismo trato que un modelo de acá —se
 * estampan, la tarifa se busca por el id y sólo si es del tipo del mueble—,
 * y las paletas las listan debajo de su familia, después de las de RECABRA
 * (`modelosPropiosDe`).
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

/** Cuánto confiar en las medidas de un modelo.
 *  · `ficha`: la página del fabricante o del distribuidor las trae explícitas.
 *  · `catalogo`: salen del título del producto o de un listado.
 *  · `estimado`: una deducción (de otro modelo, de una guía, de la norma). En
 *    pantalla lleva un «≈». */
export type Confiabilidad = "ficha" | "catalogo" | "estimado";

/** Las partes de un mueble que cuenta su ficha. Hoy, las puertas de la nevera
 *  de puertas, que sólo sirven para dibujarla: se vende entera. Sólo números:
 *  nunca lleva nada comercial. */
export interface PartesDeMueble { puertas?: number }

/** La geometría que un modelo puede fijar, por tipo, con su rango: los
 *  entrepaños y el módulo de la góndola, las puertas de la nevera de puertas. */
export type CampoDeGeometria = "entrepanos" | "modulo" | "puertas";

/** Una ficha de un mueble de verdad. Ver «Los modelos», arriba. Las de este
 *  archivo traen las tres cosas de la fuente; una ficha propia del
 *  supermercado (`ModeloPropio`) puede traer sólo la URL o sólo la nota. */
export interface ModeloDeMueble {
  /** `base:…`: no cambia nunca, porque el mueble lo guarda. */
  id: string;
  tipo: string;
  /** En los tipos con variantes (la góndola), cuál. */
  variante?: string;
  nombre: string;
  /** Metros: ancho, fondo y alto. En la góndola, el ancho es UN módulo. */
  w: number; d: number; h: number;
  /** Góndola: entrepaños por cara, sin contar la base. */
  entrepanos?: number;
  /** Góndola: ancho de módulo. */
  modulo?: number;
  partes?: PartesDeMueble;
  /** El color con que nace; si falta, el de su tipo. */
  color?: string;
  /** Una tarifa propia (`tarifas`): se cobra aparte de su tipo. Con ella, los
   *  nombres con que la nombran los informes. No cambia nunca. */
  tarifa?: string;
  informe?: string;
  informePlural?: string;
  fuente: { url: string; confiabilidad: Confiabilidad; nota: string };
}

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
  /** Entre qué medidas tiene que estar un MODELO de este tipo, en metros. */
  rango?: Record<keyof Medidas, [number, number]>;
  /** Qué geometría puede fijar un modelo de este tipo, y entre qué valores. */
  geometria?: Partial<Record<CampoDeGeometria, [number, number]>>;
}

/** Las reglas de una ficha (`fichas` en `muebles.json`). Ver `catalogo/fichas.ts`. */
export interface ReglasDeFicha {
  leeme: string[];
  /** `cli:`: una ficha propia viaja en el plano como `cli:<clave>`. */
  prefijoPropio: string;
  /** La expresión que tiene que cumplir la clave de una ficha propia. */
  clave: string;
  confiabilidad: Confiabilidad[];
  /** Dónde vive cada campo de geometría (en `partes` o suelto) y si es entero. */
  geometria: Record<CampoDeGeometria, { enPartes: boolean; entero: boolean }>;
  /** La URL de una fuente que es una imagen: nunca se guarda una foto. */
  fuenteQueEsImagen: string;
  largoMaximo: { nombre: number; url: number; nota: number };
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
  /** Las fichas de muebles de verdad. Ver «Los modelos», arriba. */
  modelos: ModeloDeMueble[];
  /** Las reglas de una ficha, las mismas para los modelos de este archivo y
   *  para las fichas propias de cada supermercado: las lee `catalogo/fichas.ts`
   *  y, del lado del servidor, `catalogo_muebles.py`. */
  fichas: ReglasDeFicha;
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

/** Los nombres de los informes, singular y plural, de los tipos que los tienen
 *  y de las tarifas propias de los modelos (la plataforma cuenta por tarifa:
 *  una media estiba es «media estiba», no «estiba_media»). */
export function nombresDeInforme(): { singular: Record<string, string>; plural: Record<string, string> } {
  const singular: Record<string, string> = {};
  const plural: Record<string, string> = {};
  for (const [t, d] of Object.entries(C.tipos)) {
    if (d.informe) singular[t] = d.informe;
    if (d.informePlural) plural[t] = d.informePlural;
  }
  for (const m of C.modelos) {
    if (m.tarifa && m.informe) singular[m.tarifa] = m.informe;
    if (m.tarifa && m.informePlural) plural[m.tarifa] = m.informePlural;
  }
  return { singular, plural };
}

// ─── Los modelos ──────────────────────────────────────────────────────────────

/** Un modelo que puede estar guardado en un mueble: uno de `muebles.json`
 *  (`base:…`) o una ficha propia del supermercado (`cli:…`). */
export type FichaDeModelo = ModeloDeMueble | ModeloPropio;

/** Un `Map` y no un objeto: un id escrito a mano en un plano no puede caer en
 *  `toString` ni en `constructor`. Se arma la primera vez que se pide y no al
 *  cargar el módulo: armado arriba de todo, cualquiera que importara este
 *  archivo —el worker del recorte, por `MUEBLES_FRIOS`— se llevaba el
 *  catálogo entero aunque nunca preguntara por un modelo. */
let modeloPorIdArmado: ReadonlyMap<string, ModeloDeMueble> | null = null;

/** La ficha de ese id, o `undefined` si no está (un id que se borró, el
 *  modelo base implícito, que no tiene ficha, o una ficha propia que esta
 *  sesión todavía no leyó). Primero el catálogo: una ficha propia no puede
 *  hacerse pasar por un modelo de RECABRA —sólo se buscan las de su prefijo,
 *  `cli:`—, como en el servidor (`tarifa_del_mueble`). Las propias retiradas
 *  también se encuentran: lo colocado con ellas se sigue llamando así.
 *
 *  El tipo dice `string`, pero el `modelo` viene del JSON del plano y el
 *  servidor lo guarda como llegue: un `modelo: 5` escrito a mano por la API
 *  dejaba en blanco todas las pantallas del supermercado (`startsWith` no es
 *  una función de un número). Lo que no es texto no es un modelo, como en
 *  `tarifa_del_mueble`, que pregunta `isinstance(modelo, str)`. */
export function modeloPorId(id: string | undefined): FichaDeModelo | undefined {
  if (typeof id !== "string" || !id) return undefined;
  modeloPorIdArmado ??= new Map(C.modelos.map((m) => [m.id, m]));
  const delCatalogo = modeloPorIdArmado.get(id);
  if (delCatalogo) return delCatalogo;
  return id.startsWith(C.fichas.prefijoPropio) ? fichaPropiaPorId(id) : undefined;
}

/** El tipo de verdad de un tipo o un alias (`gondola_mural` → `gondola`). */
function tipoDe(tipo: string): string {
  return C.alias[tipo]?.tipo ?? tipo;
}

/** La tarifa propia del modelo que guardó un mueble, si la tiene. Sólo si la
 *  ficha es del mismo tipo que el mueble: un id que no corresponde no le
 *  cambia la tarifa a nadie. */
export function tarifaDeModelo(modelo: string | undefined, tipo: string): string | undefined {
  const m = modeloPorId(modelo);
  return m && m.tarifa && m.tipo === tipoDe(tipo) ? m.tarifa : undefined;
}

/** Los modelos de una entrada de las paletas: un tipo, un alias del 2D
 *  (`gondola_doble`) o un `tipo:variante` del 3D (`gondola:double`), en el
 *  orden del archivo. */
export function modelosDe(entrada: string): ModeloDeMueble[] {
  const r = resolverTipo(entrada);
  if (!r) return [];
  return C.modelos.filter((m) => m.tipo === r.clave && (r.variante === undefined || m.variante === r.variante));
}

/** Las fichas propias que se OFRECEN en una entrada de las paletas: las de su
 *  familia (y su variante, en la góndola), sin las retiradas, en el orden en
 *  que llegaron. Van después de los modelos de RECABRA. Una ficha con el id
 *  de un modelo del catálogo o sin el prefijo propio no se ofrece: no se la
 *  encontraría por su id. */
export function modelosPropiosDe(entrada: string, propias: readonly ModeloPropio[]): ModeloPropio[] {
  const r = resolverTipo(entrada);
  if (!r) return [];
  return propias.filter((m) => !m.retirado
    && typeof m.id === "string" && m.id.startsWith(C.fichas.prefijoPropio)
    && m.tipo === r.clave
    && (r.variante === undefined || m.variante === r.variante));
}

/** El id del modelo base implícito de una entrada: `base:<tipo>` o, en la
 *  góndola, `base:<alias>` (`base:gondola_doble`). Ningún modelo del archivo
 *  puede llamarse así. */
export function idDeModeloBase(entrada: string): string {
  const r = resolverTipo(entrada);
  if (!r) return `base:${entrada}`;
  if (r.variante === undefined) return `base:${r.clave}`;
  const alias = Object.entries(C.alias).find(([, x]) => x.tipo === r.clave && x.variante === r.variante)?.[0];
  return `base:${alias ?? `${r.clave}_${r.variante}`}`;
}

/** Lo que un modelo ESTAMPA en el mueble que se coloca: medidas, color, id y
 *  geometría. Lo que no tiene la ficha no se escribe. */
export interface EstampaDeModelo {
  w: number; d: number; h: number;
  color: string;
  modelo: string;
  entrepanos?: number;
  modulo?: number;
  partes?: PartesDeMueble;
}

export function estampaDe(m: FichaDeModelo): EstampaDeModelo {
  const r = resolverTipo(m.variante !== undefined ? `${m.tipo}:${m.variante}` : m.tipo);
  const forma = r ? formaDe(r.tipo, r.variante) : undefined;
  // Una ficha propia no trae color: nace con el de su familia.
  const color = "color" in m ? m.color : undefined;
  return {
    w: m.w, d: m.d, h: m.h,
    color: color ?? forma?.color ?? "#6366f1",
    modelo: m.id,
    ...(m.entrepanos !== undefined ? { entrepanos: m.entrepanos } : {}),
    ...(m.modulo !== undefined ? { modulo: m.modulo } : {}),
    ...(m.partes !== undefined ? { partes: { ...m.partes } } : {}),
  };
}

/** Lo que se muestra del modelo en un panel: su nombre y, si las medidas son
 *  una deducción, un «≈» adelante. Una ficha propia retirada se sigue
 *  nombrando —lo colocado con ella es eso—, y lo dice. */
export function nombreDeModelo(m: FichaDeModelo): string {
  const retirada = "retirado" in m && m.retirado ? " (retirada)" : "";
  return (m.fuente.confiabilidad === "estimado" ? "≈ " : "") + m.nombre + retirada;
}

/** El texto de la fuente al pasar el mouse por el nombre del modelo: la nota,
 *  cuánto confiar y la URL, lo que tenga (una ficha propia puede traer sólo
 *  la nota o sólo la URL). */
export function textoDeFuente(m: FichaDeModelo): string {
  const { nota, url, confiabilidad } = m.fuente;
  return [
    nota,
    `Fuente (${confiabilidad})${url ? `: ${url}` : ""}`,
    "retirado" in m && m.retirado ? "Ficha retirada: ya no se ofrece en la paleta; lo colocado sigue igual." : "",
  ].filter(Boolean).join("\n");
}
