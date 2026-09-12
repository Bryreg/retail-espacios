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
  const palabras = palabrasDe(rubro ?? "");
  for (const [prefijos, empaque] of A_GRANEL) {
    if (prefijos.some((p) => palabras.some((w) => w.startsWith(p)))) return empaque;
  }
  return acostar(empaqueDeRubro(rubro));
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
  const n = Math.abs(hashDe(sinTildes(rubro ?? "")));
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
  const palabras = palabrasDe(rubro ?? "");
  if (palabras.length === 0) return EMPAQUES.caja;
  for (const [prefijos, empaque] of POR_RUBRO) {
    if (prefijos.some((p) => palabras.some((w) => w.startsWith(p)))) return empaque;
  }
  return EMPAQUES.caja;
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
function hashDe(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

export function colorDeRubro(rubro: string | undefined | null): string {
  const n = Math.abs(hashDe(sinTildes(rubro ?? "")));
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

/** Desde dónde se empieza a apilar en profundidad, contando desde el filo del
 *  entrepaño hacia adentro. El producto se repone AL FRENTE: un lineal con el
 *  producto pegado al fondo y el filo vacío es exactamente lo que un supervisor
 *  manda a corregir. */
export const RETIRO_AL_FRENTE = RETIRO_FRENTE;
