/**
 * Las medidas reales de una góndola de supermercado, en METROS.
 *
 * Todo lo que hay acá es una cota de catálogo, no una fracción inventada del
 * alto o del ancho del mueble. Esa es la diferencia entre un mueble que se
 * reconoce y uno que "parece". El error típico —y el que tenía el editor— es
 * derivar el espesor de un entrepaño de la altura del mueble: un entrepaño
 * mide lo que mide la lámina, tenga la góndola 1,35 m o 2,20 m.
 *
 * **Estas son las medidas estándar de la industria.** Están puestas en un solo
 * lugar y con nombre para que el día que llegue el catálogo del proveedor real
 * del cliente se corrijan acá y se corrija todo. Mientras tanto son un punto
 * de partida honesto, no una invención.
 */

/** Anchos de módulo que se fabrican. Un corrido largo son N módulos de éstos
 *  puestos uno al lado del otro, y por eso hay un parante cada tanto y no sólo
 *  en las dos puntas. */
export const ANCHOS_DE_MODULO = [1.0, 1.25, 1.33] as const;
export const ANCHO_MODULO_TIPICO = 1.25;

/** Alturas de fabricación. No se usan para forzar el mueble —el alto lo manda
 *  el plano— pero sí para elegir cuántos entrepaños entran de forma creíble. */
export const ALTURAS_TIPICAS = [1.35, 1.6, 1.8, 2.0, 2.2] as const;

/** El zócalo: la bandeja de abajo, que es más profunda y va retranqueada para
 *  que quepan los pies de quien está mirando la góndola. */
export const ZOCALO = {
  /** Alto del cajón inferior. */
  alto: 0.12,
  /** Cuánto se mete hacia adentro respecto del frente del entrepaño base.
   *  Es la muesca que hace que el mueble se lea como algo frente a lo que uno
   *  se para, y no como un bloque apoyado en el piso. */
  retranqueo: 0.06,
} as const;

/** El entrepaño NO es una losa: es lámina delgada plegada.
 *
 *  El labio de adelante es el que sostiene el porta-precios y es lo que el ojo
 *  reconoce; el gancho de atrás es el que engancha en el parante. Modelarlo
 *  como un bloque macizo de 25 mm es el delator número uno de un mueble hecho
 *  con primitivas. */
export const ENTREPANO = {
  /** Espesor de la lámina. Real ~1 mm; se usa 2 mm para que no titile en
   *  pantalla a distancia de trabajo, que es un problema de profundidad del
   *  buffer, no de fidelidad. */
  espesor: 0.002,
  /** Alto del labio frontal levantado. */
  labio: 0.03,
  /** Alto del pliegue trasero que engancha en el parante. */
  gancho: 0.022,
  /** Inclinación de los entrepaños altos hacia el cliente, en radianes.
   *  En tienda se inclinan para que el producto se vea desde abajo. */
  inclinacion: (5 * Math.PI) / 180,
  /** A partir de qué fracción del alto se empiezan a inclinar. */
  desdeFraccionDeAlto: 0.6,
} as const;

/** Profundidades de entrepaño que se fabrican, de la más profunda a la más
 *  corta. Una góndola real es ESCALONADA: la bandeja de abajo es la más
 *  profunda y van achicándose hacia arriba. Esa silueta en escalera es lo que
 *  permite reconocer una góndola desde el otro lado del pasillo. */
export const PROFUNDIDADES = [0.57, 0.5, 0.47, 0.42, 0.37, 0.3] as const;

/** El parante: columna ranurada donde se cuelgan los entrepaños. */
export const PARANTE = {
  /** Ancho de la cara visible del perfil. */
  ancho: 0.05,
  /** Fondo del perfil en C. */
  fondo: 0.032,
  /** Espesor de la lámina del perfil. */
  espesor: 0.0025,
  /** Paso entre ranuras. El estándar de la industria es 25 mm. */
  pasoRanura: 0.025,
  /** Tamaño del calado de cada ranura. */
  ranuraAlto: 0.012,
  ranuraAncho: 0.009,
} as const;

/** El panel de fondo: la chapa que cierra cada cara entre parante y parante.
 *
 *  Es la pieza que más superficie ocupa de una góndola y la que más delata un
 *  modelo hecho a las apuradas, porque si se deja lisa el mueble se lee como
 *  una pared blanca. Los paneles reales son ranurados —lamas horizontales cada
 *  100 mm, de donde también se cuelgan ganchos— y esa repetición horizontal es
 *  la textura que el ojo usa para calcular la profundidad del pasillo. */
export const PANEL_FONDO = {
  /** Espesor de la chapa de respaldo, la que va contra la espina. */
  espesor: 0.004,
  /** Paso entre lamas: cada cuánto se repite el listón. */
  pasoLama: 0.1,
  /** Luz entre listón y listón. Es la ranura de verdad: por ahí se ve la
   *  chapa de atrás y ahí es donde entran los ganchos. Son 7 mm: lo que mide
   *  el gancho, no lo que se ve bien en pantalla. Agrandarla para que "se
   *  note" convierte el fondo en una persiana. */
  luz: 0.007,
  /** Cuánto se despega el listón del respaldo. Este vuelo es el que hace que
   *  la ranura tire sombra propia en vez de quedar como una raya pintada. */
  vuelo: 0.005,
} as const;

/** El remate de arriba: la chapa plegada que tapa el canto superior del panel
 *  y une los dos parantes de una junta. Sin esto el mueble termina en un borde
 *  de chapa cruda y se le nota que es una caja. */
export const REMATE = { alto: 0.045, saliente: 0.02 } as const;

/** El porta-precios: la tira clara en el canto del entrepaño. Es, junto con el
 *  escalonado, lo que más dice «supermercado» y no «estantería». */
export const PORTA_PRECIOS = {
  /** Alto de la tira. El estándar de data strip ronda 26–39 mm. */
  alto: 0.03,
  /** Cuánto sobresale del canto del entrepaño. */
  saliente: 0.004,
} as const;

/** Separación entre entrepaños. No es libre: los parantes tienen ranuras cada
 *  25 mm, así que cualquier altura real es múltiplo del paso. */
export const PASO_ENTRE_ENTREPANOS = { minimo: 0.25, tipico: 0.33, maximo: 0.45 } as const;

/** Redondea una altura al paso de ranura del parante, que es donde de verdad
 *  puede apoyarse un entrepaño. Sin esto las alturas quedan en valores que
 *  ningún parante admite — y se nota, porque nada se alinea con nada. */
export function alRasDeRanura(altura: number): number {
  return Math.round(altura / PARANTE.pasoRanura) * PARANTE.pasoRanura;
}

/** Cuántos entrepaños entran, y a qué altura va cada uno.
 *
 *  Devuelve las alturas del PLANO SUPERIOR de cada entrepaño, ya redondeadas
 *  al paso de ranura. El primero se apoya sobre el zócalo. */
export function nivelesDeEntrepano(alto: number): number[] {
  // El primero es la BANDEJA DE BASE: se apoya directo sobre el zócalo, es la
  // más profunda y en tienda es la que lleva el producto pesado. Arrancar el
  // primer nivel un paso más arriba deja un hueco vacío abajo que ninguna
  // góndola tiene, y es de las cosas que más delatan un modelo inventado.
  const desde = ZOCALO.alto;
  const hasta = alto - 0.1; // aire arriba: el último entrepaño no toca el techo
  if (hasta <= desde) return [];

  const disponible = hasta - desde;
  const cuantos = Math.max(1, Math.round(disponible / PASO_ENTRE_ENTREPANOS.tipico));
  const paso = Math.min(
    PASO_ENTRE_ENTREPANOS.maximo,
    Math.max(PASO_ENTRE_ENTREPANOS.minimo, disponible / cuantos),
  );

  const niveles: number[] = [];
  for (let i = 0; i <= cuantos; i++) {
    const y = alRasDeRanura(desde + i * paso);
    // Con tolerancia, y no `y <= hasta` a secas. El último entrepaño cae
    // JUSTO en el límite, y ahí la comparación la decide el último bit del
    // flotante: con alto 1,80 el nivel de arriba sale 1.7000000000000002 y el
    // tope sale 1.7000000000000002, y aun así una góndola de 1,80 perdía su
    // entrepaño más alto mientras una de 1,85 lo conservaba. No es una
    // diferencia cosmética: cambia `rows`, y `rows` es lo que alinea las filas
    // del arte que sube el proveedor.
    if (y <= hasta + 1e-6) niveles.push(y);
  }
  return niveles;
}

/** La profundidad que le toca a cada nivel: escalonada, la más profunda abajo.
 *
 *  `fondoMueble` es el fondo total que dibujó el plano; las profundidades de
 *  catálogo se recortan para no pasarse de ahí. En una góndola doble el fondo
 *  se reparte entre las dos caras, y eso lo resuelve quien llama. */
export function profundidadDeNivel(indice: number, total: number, fondoMaximo: number): number {
  if (total <= 0) return fondoMaximo;
  // Se recorre el catálogo de profundidades de la más honda a la más corta,
  // repartiendo los niveles disponibles entre los escalones que haya.
  const escalones = PROFUNDIDADES.filter((p) => p <= fondoMaximo + 0.001);
  const lista = escalones.length > 0 ? escalones : [fondoMaximo];
  const cual = Math.min(lista.length - 1, Math.floor((indice / Math.max(total, 1)) * lista.length));
  return Math.min(lista[cual], fondoMaximo);
}

/**
 * Dónde van las filas de producto de una góndola.
 *
 * Existe para que el pintado de caras no vuelva a desincronizarse de la
 * geometría. Antes había dos copias de la misma cuenta —una en el mesh y otra
 * en `getPanelShelfSpan`— con un comentario pidiendo mantenerlas iguales; la
 * segunda vez que alguien tocó el mueble, el producto quedó pintado entre dos
 * entrepaños. Ahora las dos preguntan acá.
 *
 * Una fila es el HUECO entre un entrepaño y el de arriba: es ahí donde se para
 * el producto. Por eso hay una fila menos que entrepaños — sobre el último no
 * se puede parar nada.
 */
export interface FilasDeProducto {
  /** Altura del plano de apoyo de la fila más baja. */
  rowBottom: number;
  /** Altura EXACTA del plano de apoyo de cada entrepaño, redondeada al paso de
   *  ranura. `rowBottom` + `rowPitch` es el promedio, que es lo que necesita el
   *  mapeo de una textura; quien PARA algo encima necesita la de verdad, o el
   *  producto queda hundido o flotando un centímetro. */
  alturas: number[];
  /** Separación entre filas. */
  rowPitch: number;
  /** Cuántas filas hay. */
  rows: number;
  /** Fondo del entrepaño de cada fila, de abajo hacia arriba. El escalonado
   *  hace que no sean todos iguales, y quien pare producto encima necesita
   *  saber a qué profundidad va cada uno o lo deja flotando en el aire. */
  fondos: number[];
}

export function filasDeProducto(alto: number, fondoMaximo: number): FilasDeProducto {
  const niveles = nivelesDeEntrepano(alto);
  if (niveles.length < 2) {
    return {
      rowBottom: ZOCALO.alto,
      alturas: [ZOCALO.alto, alto],
      rowPitch: Math.max(0.2, alto - ZOCALO.alto),
      rows: 1,
      fondos: [Math.min(PROFUNDIDADES[0], fondoMaximo)],
    };
  }
  const rows = niveles.length - 1;
  return {
    rowBottom: niveles[0],
    alturas: niveles,
    rowPitch: (niveles[niveles.length - 1] - niveles[0]) / rows,
    rows,
    fondos: Array.from({ length: rows }, (_, i) =>
      profundidadDeNivel(i, niveles.length, fondoMaximo),
    ),
  };
}

/** El fondo que le toca a una cara de un mueble de fondo total `d`. En la
 *  doble se reparte entre las dos caras, descontando la espina. */
export const ESPESOR_ESPINA = 0.02;
export function fondoPorCara(d: number, esMural: boolean): number {
  return esMural ? d - ESPESOR_ESPINA : (d - ESPESOR_ESPINA) / 2;
}

/** Un vano: el hueco de un módulo, entre parante y parante. */
export interface Vano {
  /** Centro en X, respecto del centro del corrido. */
  x: number;
  /** Ancho libre entre los dos parantes que lo bordean. */
  ancho: number;
}

/**
 * Cómo se parte un corrido en módulos.
 *
 * Un corrido de 5 m no es un mueble de 5 m: son cuatro módulos de catálogo
 * atornillados, con un parante en cada junta. De acá salen los paneles de
 * fondo, los entrepaños y los porta-precios — y también dónde se puede parar
 * producto, que es la razón por la que esta cuenta vive acá y no adentro del
 * componente que dibuja: si el producto la calculara por su lado, terminaría
 * apoyado sobre un parante.
 */
export function vanosDeCorrido(w: number): Vano[] {
  const cuantos = Math.max(1, Math.round(w / ANCHO_MODULO_TIPICO));
  const anchoModulo = w / cuantos;
  const libre = Math.max(0.1, anchoModulo - PARANTE.ancho);
  return Array.from({ length: cuantos }, (_, i) => ({
    x: -w / 2 + anchoModulo * (i + 0.5),
    ancho: libre,
  }));
}

/**
 * La franja del mueble donde viven los espacios que se venden.
 *
 * Estas dos cotas deciden dónde cayó cada slot, y la posición de cada slot está
 * guardada en los contratos de los clientes. **No se tocan.** El mueble puede
 * cambiar de forma —de hecho cambió entero— pero el espacio vendido no puede
 * cambiar de lugar, o los contratos vigentes pasan a señalar otro pedazo de
 * góndola.
 *
 * Viven acá y no adentro del mesh porque ahora hay dos cosas que necesitan
 * saberlo: el panel del slot y el producto que se para sobre los entrepaños de
 * ese slot. Con una copia en cada lado, el día que una se corrija sin la otra
 * el producto aparece un espacio más arriba de lo que se vendió.
 */
export const ZONA_DE_SLOTS = {
  /** Altura a la que arranca la franja. */
  desde: 0.06,
  /** Cuánto se descuenta del alto total por el remate de arriba. */
  remate: 0.08,
} as const;

export function altoDeZonaDeSlots(alto: number): number {
  return alto - ZONA_DE_SLOTS.remate - ZONA_DE_SLOTS.desde;
}
