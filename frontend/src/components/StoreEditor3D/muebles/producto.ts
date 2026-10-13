/**
 * Qué producto se para sobre un entrepaño, y cuánto entra.
 *
 * ## Por qué no hay un catálogo de SKUs
 *
 * Este sistema no vende productos: vende ESPACIO. Lo que sabe de cada espacio
 * es quién lo contrató, por cuánto, hasta cuándo, y un rubro escrito a mano
 * («Gaseosas», «Aceites», «Galletas»). No hay códigos de barras, ni fichas de
 * empaque, ni fotos. Inventar un catálogo de productos sería inventar datos
 * que nadie cargó y que nadie puede corregir.
 *
 * Entonces lo que se para sobre el entrepaño no pretende ser el producto
 * exacto: es el EMPAQUE del rubro, a escala real. Un paquete de galletas mide
 * lo que mide, y con eso una góndola de 1,25 m muestra los diez frentes que
 * caben de verdad y no los cinco que quedaban lindos. Esa cuenta —cuántos
 * frentes entran— es justamente la que le interesa a quien negocia el espacio.
 *
 * Cuando el proveedor sube su arte, manda el arte: la lámina de producto tapa
 * esta capa, porque es información real y ésta es una aproximación.
 *
 * ## Las medidas
 *
 * Son de empaque comercial, en METROS, y salen de formatos estándar. Igual que
 * `medidas.ts`, están acá para poder corregirse en un solo lugar.
 */
import type { EstadoDelRecorte } from "./recorte";
import { tiposConBandera } from "../../../catalogo/catalogo";

/** La silueta del envase. Es lo PRIMERO que el ojo clasifica —antes que el
 *  color y mucho antes que la etiqueta—, así que decide la geometría con la
 *  que se dibuja. Durante un tiempo este dato existió y no se usaba: todo
 *  terminaba en el mismo cubo, y un lineal de gaseosas se veía como una pared
 *  de ladrillos. */
export type FormaDeEmpaque =
  | "caja" | "botella" | "lata" | "bolsa"
  /** Suelto, sin envase: una manzana, un tomate, una papa. */
  | "pieza"
  /** Bandeja de carne o fiambre, con el film abombado arriba. */
  | "bandeja";

export interface Empaque {
  /** Frente del envase: lo que se ve mirando la góndola. */
  ancho: number;
  alto: number;
  /** Cuánto ocupa hacia el fondo del entrepaño. */
  fondo: number;
  forma: FormaDeEmpaque;
  /** El envase está volcado de costado: su eje largo quedó horizontal. Lo
   *  marca `acostar`, y lo necesita la geometría — una botella acostada sigue
   *  siendo una botella, pero dibujada de pie y aplastada sale un disco. */
  acostado?: boolean;
}

/** Los formatos que se repiten en cualquier supermercado. */
export const EMPAQUES = {
  /** Botella de gaseosa de 1,5 L. */
  botellaGrande: { ancho: 0.090, alto: 0.310, fondo: 0.090, forma: "botella" },
  /** Botella personal de 600 ml, y también agua y jugos. */
  botellaChica:  { ancho: 0.065, alto: 0.230, fondo: 0.065, forma: "botella" },
  /** Lata de 350 ml: gaseosa, cerveza, conservas altas. */
  lata:          { ancho: 0.066, alto: 0.122, fondo: 0.066, forma: "lata" },
  /** Enlatado bajo: atún, arvejas, leche condensada. */
  latabaja:      { ancho: 0.075, alto: 0.110, fondo: 0.075, forma: "lata" },
  /** Caja de cereal, de té, de pasta. */
  cajaAlta:      { ancho: 0.190, alto: 0.280, fondo: 0.070, forma: "caja" },
  /** Caja mediana: galletas, arroz, harina. */
  caja:          { ancho: 0.110, alto: 0.190, fondo: 0.070, forma: "caja" },
  /** Tetrapak de leche o jugo, 1 L. */
  tetra:         { ancho: 0.070, alto: 0.200, fondo: 0.070, forma: "caja" },
  /** Bolsa de snack, inflada y liviana. */
  bolsa:         { ancho: 0.160, alto: 0.230, fondo: 0.060, forma: "bolsa" },
  /** Botella de limpieza o aceite, con asa. */
  botellaAncha:  { ancho: 0.100, alto: 0.250, fondo: 0.065, forma: "botella" },
  /** Una pieza suelta: una manzana, un tomate, una papa. Lo que se vende a
   *  granel no viene en envase, así que no tiene un formato de catálogo — mide
   *  lo que mide la fruta. */
  pieza:         { ancho: 0.075, alto: 0.070, fondo: 0.075, forma: "pieza" },
  /** Una bandeja de carne o fiambre, de las del mostrador. */
  bandeja:       { ancho: 0.180, alto: 0.045, fondo: 0.130, forma: "bandeja" },
} as const satisfies Record<string, Empaque>;

/** Rubros que NO vienen en envase: se venden sueltos o en bandeja. En un
 *  canasto o un mostrador, lo que se ve de ellos es la pieza, no una caja. */
const A_GRANEL: [readonly string[], Empaque][] = [
  [["carne", "pollo", "res", "cerdo", "fiambre", "embutido", "queso", "deli", "pescado"], EMPAQUES.bandeja],
  [["fruta", "verdura", "hortaliza", "tomate", "papa", "cebolla", "manzana", "banano",
    "platano", "naranja", "limon", "aguacate", "granel"], EMPAQUES.pieza],
];

/**
 * El empaque de un rubro cuando va VOLCADO: en un canasto, un cajón o una
 * bandeja de mostrador.
 *
 * Dos diferencias con el de un entrepaño, y las dos se vieron en pantalla
 * antes de razonarlas:
 *
 * 1. **Lo que se vende suelto no tiene envase.** Un cajón de frutas lleno de
 *    cajas de galletas es lo que salía antes, porque el rubro «Frutas» no
 *    casaba con nada y caía en la caja por defecto.
 * 2. **Lo volcado está ACOSTADO.** Nadie tira cajas a un canasto y quedan
 *    paradas. Con el envase de pie, una capa de 19 cm de alto llena el cajón
 *    entero y lo que se ve desde arriba es una tapa lisa — se veía exactamente
 *    como una tela estirada. Acostado entran tres capas y aparece el relieve.
 */
export function empaqueVolcado(rubro: string | undefined | null): Empaque {
  return empaqueVolcadoEn(rubro, 0);
}

/**
 * El empaque de lo volcado, sabiendo CUÁNTO ALTO LIBRE hay encima.
 *
 * Lo que se vende suelto —fruta, verdura, carne— no cambia: no tiene envase.
 * Lo envasado se acuesta **sólo si no entra parado**, y eso importa más de lo
 * que parece: una botella de litro y medio acostada mide 30 cm de largo, así
 * que en una batea de 60 cm de fondo entra UNA fila y el canasto se ve vacío
 * —con producto adentro, pero vacío—, que es justo el defecto que el volcado
 * vino a arreglar. Y en la tienda tampoco es cierto: una batea de promoción de
 * gaseosas tiene las botellas PARADAS. Lo que se tira de costado es lo que no
 * entra de pie.
 */
export function empaqueVolcadoEn(
  rubro: string | undefined | null, altoLibre: number,
): Empaque {
  const palabras = palabrasDe(rubro ?? "");
  for (const [prefijos, empaque] of A_GRANEL) {
    if (prefijos.some((p) => palabras.some((w) => w.startsWith(p)))) return empaque;
  }
  const parado = empaqueDeRubro(rubro);
  if (altoLibre > 0 && parado.alto <= altoLibre) return parado;
  return acostar(parado);
}

/**
 * El color de un producto VOLCADO.
 *
 * `colorDeRubro` se mantiene lejos del verde y del rojo a propósito, porque
 * ésos son los colores del estado comercial. Para un envase impreso eso no
 * cuesta nada — una caja de galletas puede ser azul—, pero para lo que se vende
 * suelto sí: un cajón de frutas magenta es lo que salía, y no ayuda a nadie a
 * entender qué está mirando.
 *
 * Así que lo suelto se lleva a la banda cálida, que ya estaba permitida:
 * ámbar y ocre para la fruta y la verdura, ladrillo apagado para la carne.
 * Ninguno de los dos se confunde con el verde «disponible» ni con el rojo
 * «ocupado», que siguen siendo colores saturados y planos de interfaz.
 */
export function colorVolcado(rubro: string | undefined | null): string {
  const e = empaqueVolcado(rubro);
  const n = Math.abs(hashTexto(sinTildes(rubro ?? "")));
  if (e === EMPAQUES.pieza) {
    return `hsl(${24 + (n % 26)}, ${44 + (n % 16)}%, ${40 + ((n >> 3) % 12)}%)`;
  }
  if (e === EMPAQUES.bandeja) {
    return `hsl(${8 + (n % 8)}, ${26 + (n % 10)}%, ${42 + ((n >> 3) % 8)}%)`;
  }
  return colorDeRubro(rubro);
}

/** Vuelca un envase de costado: el lado más corto pasa a ser el alto.
 *
 *  Se marca `acostado` porque no alcanza con permutar las medidas: una botella
 *  acostada sigue teniendo cuello, y dibujada de pie con 9 cm de alto sale un
 *  disco. La geometría necesita saber que hay que girarla, no achatarla. */
function acostar(e: Empaque): Empaque {
  const lados = [e.ancho, e.alto, e.fondo].sort((a, b) => b - a);
  return {
    ancho: lados[0], alto: lados[2], fondo: lados[1],
    forma: e.forma, acostado: true,
  };
}

/** Cada entrada es [palabras que puede escribir quien carga el rubro, empaque].
 *
 *  El rubro es TEXTO LIBRE —el campo dice «Marca / rubro» y lo teclea quien
 *  negocia—, así que no hay lista de valores contra la cual comparar. Se busca
 *  por palabra suelta y sin tildes, que es como se escribe de apuro. */
const POR_RUBRO: [readonly string[], Empaque][] = [
  [["gaseosa", "refresco", "bebida", "cola", "soda", "gatorade"], EMPAQUES.botellaGrande],
  [["agua", "jugo", "isotonic", "energiz", "hidrat"], EMPAQUES.botellaChica],
  [["cerveza", "lata"], EMPAQUES.lata],
  [["atun", "conserva", "enlatad", "sardina", "arveja", "frijol"], EMPAQUES.latabaja],
  [["aceite", "limpieza", "detergente", "jabon", "suavizante", "cloro", "shampoo", "blanqueador"], EMPAQUES.botellaAncha],
  [["cereal", "pasta", "fideo", "te", "avena", "spaghetti"], EMPAQUES.cajaAlta],
  [["galleta", "arroz", "harina", "azucar", "cafe", "chocolate", "sal"], EMPAQUES.caja],
  [["leche", "lacteo", "yogur", "crema"], EMPAQUES.tetra],
  [["snack", "papa", "pasabocas", "chip", "mecato", "dulce", "confite"], EMPAQUES.bolsa],
];

const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Las palabras del rubro, sin tildes ni puntuación. */
function palabrasDe(rubro: string): string[] {
  return sinTildes(rubro).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Qué empaque le corresponde a un rubro. Sin rubro, una caja mediana: es el
 * formato más común de un supermercado y el que menos miente.
 *
 * **Se compara contra el COMIENZO de una palabra, no contra cualquier pedazo
 * del texto.** Buscando dentro de la cadena, «te» —que es un rubro real—
 * caza adentro de «acei-te-s», y el lineal de aceites aparece lleno de cajas
 * de cereal. Pasó, y se veía como un problema de tamaños. Con el prefijo
 * anclado al principio de la palabra, «galleta» sigue cazando «galletas» y
 * «te» deja de cazar dentro de cualquier cosa.
 */
export function empaqueDeRubro(rubro: string | undefined | null): Empaque {
  return rubroQueCasa(rubro) ?? EMPAQUES.caja;
}

/** El empaque del rubro si el texto casa con alguno, o `null` si cae en el
 *  formato por defecto. Quien estima las medidas de un arte necesita saber la
 *  diferencia: «no casó nada» no es lo mismo que «es una caja». */
function rubroQueCasa(rubro: string | undefined | null): Empaque | null {
  const palabras = palabrasDe(rubro ?? "");
  if (palabras.length === 0) return null;
  for (const [prefijos, empaque] of POR_RUBRO) {
    if (prefijos.some((p) => palabras.some((w) => w.startsWith(p)))) return empaque;
  }
  return null;
}

// ─── El frío ───────────────────────────────────────────────────────────────

/** Los muebles de frío que existen en el editor (`FIXTURE_DEFS`): la bandera
 *  `frio` del catálogo de muebles (`catalogo/muebles.json`).
 *
 *  Las marcas `@__PURE__` le dicen al empaquetador que, si nadie usa la tabla,
 *  puede no calcularla. El web worker del recorte (`recorte.worker.ts`) importa
 *  este archivo por `empaqueDeArte` y nunca mira el frío: sin las marcas, la
 *  llamada a `tiposConBandera` se quedaba y arrastraba el catálogo entero al
 *  worker (`probar-catalogo.mjs` lo vigila). */
export const MUEBLES_FRIOS = /* @__PURE__ */ new Set<string>(/* @__PURE__ */ tiposConBandera("frio"));

/** Lo que va en frío, comparado contra el COMIENZO de cada palabra (como
 *  `rubroQueCasa`): «yogur» caza «yogurt» y «yogures», «queso» caza «quesos». */
const FRIO = ["yogur", "kumis", "queso", "mantequilla", "carne", "embutido", "pollo", "pescado", "helado", "refrigerad"];
/** Lo que no, aunque diga «leche» o «lácteo»: le gana a lo de arriba. */
const SIN_FRIO = ["uht", "arequipe", "polvo", "ultrapasteuriz"];

/**
 * Si un producto va refrigerado, por su categoría y su nombre.
 *
 * La crítica de la ronda 2: el caso de Alpina mostraba el yogur Finesse
 * —refrigerado— en una punta seca, de a tres apilados. Un KAM de Alpina lo
 * descarta en el primer segundo: el yogur va en la nevera. El sistema no lo
 * prohíbe —decide la dueña—, pero lo avisa.
 *
 * - Sí: lácteos frescos, yogur, kumis, queso, mantequilla, carne, embutido,
 *   pollo, pescado, helado, «refrigerado».
 * - No: larga vida, UHT, arequipe, leche en polvo. Le ganan a los «sí»: una
 *   leche larga vida de Alpina va en góndola seca aunque sea un lácteo.
 */
export function vaRefrigerado(categoria: string | null | undefined, nombre: string | null | undefined): boolean {
  const palabras = palabrasDe(`${categoria ?? ""} ${nombre ?? ""}`);
  const empieza = (lista: readonly string[]) => palabras.some((w) => lista.some((p) => w.startsWith(p)));
  const largaVida = palabras.some((w, i) => w.startsWith("larga") && palabras[i + 1]?.startsWith("vida"));
  if (largaVida || empieza(SIN_FRIO)) return false;
  const lacteoFresco = palabras.some((w) => w.startsWith("lacteo")) && palabras.some((w) => w.startsWith("fresc"));
  return lacteoFresco || empieza(FRIO);
}

/** El aviso del panel: un producto de frío probado en un mueble SECO. */
export function avisoDeFrio(tipoDeMueble: string, categoria: string | null | undefined, nombre: string | null | undefined): boolean {
  return vaRefrigerado(categoria, nombre) && !MUEBLES_FRIOS.has(tipoDeMueble);
}

/** El hash FNV-1a de un texto. Es la semilla de todo lo que tiene que salir
 *  IGUAL en cada render y en cada sesión: el color de un rubro y el desorden
 *  del producto de prueba (`frentes.ts`). */
export function hashTexto(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

/**
 * Un color estable para un rubro.
 *
 * Estable es el requisito, no bonito: el mismo rubro tiene que salir del mismo
 * color en cada render y en cada sesión, o la tienda titila cada vez que se
 * mueve la cámara y nadie puede señalar «el pasillo de los azules». Sale de un
 * hash del texto, así que no hay estado que guardar.
 *
 * Se mantiene lejos del verde y del rojo a propósito: ésos son los colores del
 * estado comercial (disponible / ocupado) y son los que tienen que seguir
 * significando algo cuando el mueble está lleno de producto.
 */
export function colorDeRubro(rubro: string | undefined | null): string {
  const n = Math.abs(hashTexto(sinTildes(rubro ?? "")));
  // Azules, violetas, ocres y turquesas: 190°–330° y 30°–60°.
  const tono = n % 2 === 0 ? 190 + (n % 140) : 30 + (n % 30);
  // Saturación contenida: un envase impreso tiene color, pero un lineal de
  // colores puros parece un gráfico de barras, no una tienda.
  const sat = 26 + (n % 20);
  // Oscuro a propósito. Entre el mapa de entorno y la luz de la escena, un
  // color de luminosidad media sale pastel y todo el lineal se lava: los
  // rubros dejan de distinguirse, que es lo único que este color tiene que
  // lograr.
  const luz = 34 + ((n >> 3) % 16);
  // Con COMAS. `THREE.Color` parsea `hsl(190, 40%, 50%)` y NO la sintaxis CSS
  // moderna separada por espacios: ante `hsl(190 40% 50%)` no falla, se queda
  // en blanco. Todo el lineal sale del color del papel y parece un error de
  // iluminación.
  return `hsl(${tono}, ${sat}%, ${luz}%)`;
}

/** Formatos más chicos del mismo rubro, para cuando el grande no entra parado.
 *
 *  No es un apaño: es lo que hace la tienda. La botella de 1,5 L va en la
 *  bandeja de abajo, que es la de más luz, y arriba va la personal — nadie
 *  deja un entrepaño vacío porque el formato grande no entraba. Sin esto, los
 *  entrepaños altos de un pasillo de bebidas quedan pelados y parece un error
 *  de dibujo. */
const MAS_CHICO: [Empaque, Empaque][] = [
  [EMPAQUES.botellaGrande, EMPAQUES.botellaChica],
  [EMPAQUES.botellaChica, EMPAQUES.lata],
  [EMPAQUES.botellaAncha, EMPAQUES.botellaChica],
  [EMPAQUES.cajaAlta, EMPAQUES.caja],
  [EMPAQUES.caja, EMPAQUES.latabaja],
  [EMPAQUES.bolsa, EMPAQUES.caja],
  [EMPAQUES.tetra, EMPAQUES.latabaja],
  [EMPAQUES.lata, EMPAQUES.latabaja],
];

/** El formato del rubro que entra parado bajo `altoLibre`. Si ninguno entra,
 *  devuelve `null`: ese entrepaño queda vacío de verdad, y eso es información,
 *  no un hueco a rellenar. */
export function empaqueQueEntra(
  rubro: string | undefined | null,
  altoLibre: number,
): Empaque | null {
  let e: Empaque | undefined = empaqueDeRubro(rubro);
  const vistos = new Set<Empaque>();
  while (e && !vistos.has(e)) {
    if (e.alto <= altoLibre) return e;
    vistos.add(e);
    e = MAS_CHICO.find(([de]) => de === e)?.[1];
  }
  return null;
}

export interface Acomodo {
  /** Cuántos frentes entran a lo ancho. */
  frentes: number;
  /** Cuántas unidades en profundidad detrás de cada frente. */
  filas: number;
  /** Separación entre centros a lo ancho. */
  pasoX: number;
  /** Separación entre centros en profundidad. */
  pasoZ: number;
  /** Ancho realmente ocupado, para poder centrarlo en el vano. */
  ocupado: number;
}

/** Aire entre envase y envase. En tienda el producto va casi tocándose: quien
 *  repone quiere el lineal lleno, no ordenado. */
const LUZ = 0.004;
/** El producto no se apoya contra el panel de fondo ni asomado al vacío. */
const RETIRO_FONDO = 0.012;
const RETIRO_FRENTE = 0.010;

/**
 * Cuánto producto entra sobre un entrepaño.
 *
 * Es la cuenta que le importa a quien negocia: un frente de góndola no se vende
 * por metros, se vende por FRENTES. Y también la que hace que el mueble se vea
 * real — un lineal con cinco paquetes espaciados se lee como una maqueta;
 * uno con los catorce que caben se lee como un supermercado.
 */
export function acomodar(
  anchoUtil: number,
  fondoUtil: number,
  altoLibre: number,
  e: Empaque,
): Acomodo {
  const vacio: Acomodo = { frentes: 0, filas: 0, pasoX: 0, pasoZ: 0, ocupado: 0 };
  if (anchoUtil <= 0 || fondoUtil <= 0 || altoLibre <= 0) return vacio;
  // No entra parado: el entrepaño de arriba lo aplastaría.
  if (e.alto > altoLibre) return vacio;

  const fondoDisponible = fondoUtil - RETIRO_FONDO - RETIRO_FRENTE;
  const frentes = Math.floor((anchoUtil + LUZ) / (e.ancho + LUZ));
  const filas = Math.floor((fondoDisponible + LUZ) / (e.fondo + LUZ));
  if (frentes <= 0 || filas <= 0) return vacio;

  return {
    frentes,
    filas,
    pasoX: e.ancho + LUZ,
    pasoZ: e.fondo + LUZ,
    ocupado: frentes * e.ancho + (frentes - 1) * LUZ,
  };
}

/** Si el envase entra de FONDO en un entrepaño, con los mismos retiros que
 *  `acomodar`: es lo que distingue «no entra de fondo» de «no entra de
 *  ancho» cuando un entrepaño queda vacío. */
export function entraDeFondo(fondoUtil: number, e: Empaque): boolean {
  return fondoUtil - RETIRO_FONDO - RETIRO_FRENTE >= e.fondo;
}

/** Desde dónde se empieza a apilar en profundidad, contando desde el filo del
 *  entrepaño hacia adentro. El producto se repone AL FRENTE: un lineal con el
 *  producto pegado al fondo y el filo vacío es exactamente lo que un supervisor
 *  manda a corregir. */
export const RETIRO_AL_FRENTE = RETIRO_FRENTE;

// ─── El empaque del ARTE del proveedor ───────────────────────────────────────
//
// Lo de arriba es una aproximación por rubro, para lo vendido de lo que no hay
// foto. El producto que se PRUEBA es otra cosa: es uno concreto, con su foto,
// y su medida decide la escala y cuántos frentes entran —justo la cuenta que
// se negocia—. Por eso se le pide la ficha al cargar el arte; para lo que se
// cargó antes, o sin ficha, se estima y se dice que es estimado.

/** La forma que se elige en la ficha. `auto` deja que decidan el rubro y la
 *  foto. */
export type FormaDeFicha = "auto" | "caja" | "botella" | "lata" | "vaso" | "frasco" | "bolsa" | "otro";

/** La ficha del arte, tal como la guarda `supplier_asset_specs`. */
export interface FichaDeArte {
  forma: FormaDeFicha;
  alto_mm: number | null;
  ancho_mm: number | null;
  fondo_mm: number | null;
  apilable: boolean;
  acostado: boolean;
  /** Qué hacer con el fondo de la foto (ver `recorte.ts`). */
  fondo_foto: "auto" | "quitar" | "conservar";
  /** El precio al público en pesos enteros, para el hablador del
   *  porta-precios. Opcional: sin él el hablador va sin cifra — nunca con
   *  una inventada. */
  precio_publico?: number | null;
}

/** Con qué geometría se dibuja el envase. */
export type FormaDeEnvase = "caja" | "revolucion" | "almohada" | "recorte";

export interface EmpaqueDeArte extends Empaque {
  envase: FormaDeEnvase;
  apilable: boolean;
  /** El alto no lo cargó nadie: salió del contenido o del rubro. Se rotula
   *  «≈» en el panel y en el selector. */
  estimado: boolean;
  /** El ancho tampoco es confiable: no está en la ficha y la foto conserva
   *  su fondo, así que su aspecto puede traer márgenes (`recorte.ts`,
   *  `sinQuitar`). Se acota a la forma, se rotula «≈» y la ficha lo pide. */
  anchoEstimado: boolean;
  /** De dónde salió el alto. */
  de: "ficha" | "contenido" | "rubro";
  /** Una botella de plástico transparente (gaseosa, agua, jugo, aceite): por
   *  el PET de la foto se ve el fondo del estudio, y la etiqueta se tiñe con
   *  el color del líquido (`llenarBotella`). Un vaso o una lata, no. */
  transparente: boolean;
  /** Cuántos se apilan como máximo, si se apila. Tres, también el vaso: de
   *  a dos (la primera ronda) la punta de Alpina se veía medio surtida, con
   *  un 35 % de aire sobre cada entrepaño, y así no se monta una punta
   *  negociada —se surte casi hasta el entrepaño de arriba—. */
  pisosMaximos: number;
}

/** Lo que dice el texto del producto sobre su contenido: «200 g», «1,5 L».
 *
 *  Con los números como se escriben acá: la COMA es el decimal y el punto
 *  separa los miles. Leyendo el punto como decimal, «1.000 g» era 1 g y
 *  «1.100 ml» 1,1 ml: el envase caía al mínimo de 4 cm y el entrepaño se
 *  llenaba de decenas de frentes de juguete. El punto seguido de grupos de
 *  EXACTAMENTE tres cifras es de miles; «1.5 L», con una sola cifra, sigue
 *  siendo litro y medio. Y en litros o kilos un «1.250» de miles daría un
 *  envase de 1.250 L, así que ahí, si da 100 o más, se lee como decimal. */
export function contenidoDelTexto(t: string): { cm3: number; unidad: "volumen" | "masa" } | null {
  const m = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(ml|l|lt|litros?|cc|g|gr|kg)\b/i.exec(t ?? "");
  if (!m) return null;
  const u = m[2].toLowerCase();
  const grande = u === "kg" || u === "l" || u === "lt" || u.startsWith("litro");
  const deMiles = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(m[1]);
  const comoMiles = Number(m[1].replace(/\./g, "").replace(",", "."));
  const n = deMiles && !(grande && comoMiles >= 100) ? comoMiles : Number(m[1].replace(",", "."));
  if (!(n > 0)) return null;
  if (u === "ml" || u === "cc") return { cm3: n, unidad: "volumen" };
  if (u === "l" || u === "lt" || u.startsWith("litro")) return { cm3: n * 1000, unidad: "volumen" };
  if (u === "kg") return { cm3: n * 1000, unidad: "masa" };
  return { cm3: n, unidad: "masa" };
}

/** Rubros donde un gramo ocupa más o menos un centímetro cúbico: lo líquido y
 *  lo lácteo. Un kilo de arroz o de cereal no dice nada de su volumen. */
const LIQUIDOS = ["leche", "lacteo", "yogur", "kumis", "bebida", "gaseosa", "jugo", "agua"];

/** Acota a [min, max]. */
const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** El ancho sobre el alto típico de cada forma de la ficha: es la referencia
 *  con que se acota un ancho que salió de una foto poco confiable. El vaso
 *  es el de yogur de 200 g (7,5 × 9 cm). Sin forma, la del rubro. */
const ASPECTO_DE_FORMA: Partial<Record<FormaDeFicha, number>> = {
  caja: EMPAQUES.caja.ancho / EMPAQUES.caja.alto,
  botella: EMPAQUES.botellaGrande.ancho / EMPAQUES.botellaGrande.alto,
  lata: EMPAQUES.lata.ancho / EMPAQUES.lata.alto,
  vaso: 0.83,
  frasco: 0.7,
  bolsa: EMPAQUES.bolsa.ancho / EMPAQUES.bolsa.alto,
};

/**
 * Las medidas del producto que se prueba, con o sin ficha.
 *
 * Con ficha, manda la ficha. Sin ficha se estima, en este orden:
 *
 * 1. **El alto por el contenido** escrito en el nombre o el rubro —«200 g»,
 *    «1,5 L»—, sólo para líquidos y lácteos, con el volumen y el aspecto de la
 *    foto. Por rubro solo, «yogur» cae en un tetra de 20 cm contra los 9 cm de
 *    un vaso de 200 g.
 * 2. **El alto del rubro** (`empaqueDeRubro`).
 * 3. **El ancho** sale del alto por el aspecto del recorte, acotado entre la
 *    mitad y el doble del ancho del rubro.
 *
 * NUNCA cambia el producto por uno más chico del rubro, como hace el relleno:
 * es un producto concreto. Si no entra, el entrepaño queda vacío y se dice.
 */
export function empaqueDeArte(
  arte: { nombre: string; categoria?: string | null },
  ficha: FichaDeArte | null,
  recorte: { aspecto: number; relleno: number; simetria: number; estado?: EstadoDelRecorte } | null,
  opciones: { acostado?: boolean } = {},
): EmpaqueDeArte {
  const texto = `${arte.categoria ?? ""} ${arte.nombre}`;
  const casa = rubroQueCasa(texto);
  const rubro = casa ?? EMPAQUES.caja;
  const forma = ficha?.forma ?? "auto";

  // ── Con qué geometría ─────────────────────────────────────────────────────
  let envase: FormaDeEnvase;
  if (forma === "caja") envase = "caja";
  else if (forma === "botella" || forma === "lata" || forma === "vaso" || forma === "frasco") {
    // Torneado sólo si la silueta es simétrica: una botella fotografiada en
    // tres cuartos, torneada, sale deforme. Sin recorte todavía, se tornea.
    envase = !recorte || recorte.simetria <= 0.08 ? "revolucion" : "recorte";
  } else if (forma === "bolsa") envase = "almohada";
  else if (forma === "otro") envase = "recorte";
  else if (!casa) {
    // El rubro no dice nada: decide la foto.
    const relleno = recorte?.relleno ?? 1;
    envase = relleno >= 0.95 ? "caja" : (recorte?.simetria ?? 1) < 0.06 ? "revolucion" : "recorte";
  } else if (rubro.forma === "botella" || rubro.forma === "lata") envase = "revolucion";
  else if (rubro.forma === "bolsa") envase = "almohada";
  else envase = (recorte?.relleno ?? 1) >= 0.9 ? "caja" : "recorte";

  // ── El alto ───────────────────────────────────────────────────────────────
  const aspecto = recorte?.aspecto ?? rubro.ancho / rubro.alto;
  let alto: number;
  let de: EmpaqueDeArte["de"];
  if (ficha?.alto_mm) {
    alto = ficha.alto_mm / 1000;
    de = "ficha";
  } else {
    const contenido = contenidoDelTexto(texto);
    const palabras = palabrasDe(texto);
    const liquido = palabras.some((w) => LIQUIDOS.some((l) => w.startsWith(l)))
      || rubro === EMPAQUES.tetra || rubro === EMPAQUES.botellaGrande || rubro === EMPAQUES.botellaChica;
    if (contenido && (contenido.unidad === "volumen" || liquido)) {
      const V = contenido.cm3 * 1e-6;
      if (envase === "revolucion" || envase === "recorte") {
        // Un cilindro que llena el 80 % de su volumen: V = 0,8·π·(a·h/2)²·h.
        alto = Math.cbrt((4 * V) / (Math.PI * aspecto * aspecto * 0.8));
      } else {
        // Una caja que llena el 90 %: V = 0,9·(a·h)·(c·a·h)·h.
        const c = rubro.fondo / rubro.ancho;
        alto = Math.cbrt(V / (aspecto * aspecto * c * 0.9));
      }
      alto = entre(alto, 0.04, 0.45);
      de = "contenido";
    } else {
      alto = rubro.alto;
      de = "rubro";
    }
  }
  const estimado = !ficha?.alto_mm;

  // ── Ancho y fondo ─────────────────────────────────────────────────────────
  // Una foto que conserva su fondo («conservado» o «dudoso») puede traer su
  // aspecto con márgenes: recortada a lo que se distingue del fondo casi
  // siempre acierta, pero no siempre (un estudio con viñeta, un vaso blanco
  // que toca los bordes). Ese ancho no se cree a ciegas, ni con el alto de la
  // ficha: se acota alrededor del aspecto típico de su forma y se dice «≈».
  const aspectoDudoso = recorte?.estado === "conservado" || recorte?.estado === "dudoso";
  const anchoEstimado = !ficha?.ancho_mm && !!recorte && aspectoDudoso;
  let ancho: number;
  if (ficha?.ancho_mm) ancho = ficha.ancho_mm / 1000;
  else if (!recorte) ancho = rubro.ancho;
  else {
    ancho = alto * recorte.aspecto;
    if (estimado) ancho = entre(ancho, rubro.ancho * 0.5, rubro.ancho * 2);
    if (anchoEstimado) {
      const tipico = alto * (ASPECTO_DE_FORMA[forma] ?? rubro.ancho / rubro.alto);
      ancho = entre(ancho, tipico * 0.6, tipico * 1.6);
    }
  }
  let fondo: number;
  if (ficha?.fondo_mm) fondo = ficha.fondo_mm / 1000;
  else if (envase === "revolucion") fondo = ancho;
  else if (envase === "almohada") fondo = Math.min(0.45 * ancho, rubro.fondo);
  else fondo = rubro.fondo;

  const apilable = ficha?.apilable ?? forma === "lata";
  const formaDeEmpaque: FormaDeEmpaque =
    envase === "revolucion" ? (forma === "lata" ? "lata" : "botella")
      : envase === "almohada" ? "bolsa" : "caja";

  const transparente = envase === "revolucion"
    && (forma === "botella" || (forma === "auto" && casa?.forma === "botella"));
  const base: EmpaqueDeArte = {
    ancho, alto, fondo, forma: formaDeEmpaque, envase, apilable, estimado, anchoEstimado, de,
    transparente, pisosMaximos: 3,
  };
  // Lo que se tocó en la sesión («Mostrarla acostada», «Volver a pararla»)
  // manda; si no se tocó nada, la ficha. El editor pasa `undefined` hasta
  // que la dueña aprieta uno de los dos.
  if (!(opciones.acostado ?? ficha?.acostado)) return base;

  // ── Acostado ──────────────────────────────────────────────────────────────
  // Una botella acostada sigue siendo una botella: el eje queda horizontal y
  // se GIRA (la geometría lo sabe por `acostado`), no se achata.
  if (envase === "revolucion") {
    return { ...base, ancho: alto, alto: ancho, fondo: ancho, acostado: true };
  }
  if (envase === "caja" || envase === "almohada") {
    const a = acostar(base);
    return { ...base, ancho: a.ancho, alto: a.alto, fondo: a.fondo, acostado: true };
  }
  return base;
}
