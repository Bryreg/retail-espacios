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
  //
  // Aire arriba: el último entrepaño no toca el remate.
  return nivelesEntre(ZOCALO.alto, alto - 0.1);
}

/**
 * Las alturas de entrepaño que entran entre dos cotas, al ras de ranura.
 *
 * Lo comparten la góndola y la punta, que reparten sus bandejas con la misma
 * regla y se diferencian sólo en dónde empiezan y dónde terminan. Tenerlo
 * escrito una vez es lo que hace que agregar un mueble nuevo no reabra la
 * discusión de cuántos entrepaños van.
 */
export function nivelesEntre(desde: number, hasta: number): number[] {
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

/* ── La punta de góndola ─────────────────────────────────────────────────────
   Es el espacio más caro de un supermercado: se ve de frente desde todo el
   pasillo transversal y por eso se vende aparte y más caro que el lineal. Su
   forma tiene dos cosas que la góndola no tiene — un COPETE arriba, que es la
   cartelería de la marca, y una sola cara vendible, porque la de atrás da
   contra el corrido. */

export const COPETE = {
  /** Alto del cartel de arriba. Es la cota que separa el cuerpo del copete y
   *  la que decide, por resta, cuántos entrepaños entran. */
  alto: 0.36,
  /** Fondo del marco del copete. Va mucho más fino que el cuerpo: el cartel es
   *  una chapa con marco, no un cajón. */
  fondo: 0.055,
  /** Cuánto sobresale a cada lado del cuerpo. Ese vuelo es lo que hace que el
   *  copete se lea como cartel y no como la tapa del mueble. */
  vuelo: 0.05,
  /** Alto de la barra de luz que lo remata. */
  altoLuz: 0.05,
} as const;

/** Los entrepaños de una punta, dentro de su cuerpo (sin el copete).
 *
 *  Terminan un poco antes del copete: el cartel necesita su aire o se lee
 *  como un entrepaño más. */
export function nivelesDePunta(altoDeCuerpo: number): number[] {
  return nivelesEntre(ZOCALO.alto, altoDeCuerpo - 0.06);
}

/**
 * Las filas de producto de una punta.
 *
 * Se diferencia de la góndola en el techo de la última fila: en la góndola es
 * el entrepaño de arriba, y acá es **el copete**. Por eso una punta tiene
 * tantas filas como entrepaños —sobre el de más arriba también se para
 * producto— y una góndola tiene una menos.
 */
export function filasDePunta(altoDeCuerpo: number, fondoMaximo: number): FilasDeProducto {
  const niveles = nivelesDePunta(altoDeCuerpo);
  if (niveles.length === 0) {
    return {
      rowBottom: ZOCALO.alto,
      alturas: [ZOCALO.alto, altoDeCuerpo],
      rowPitch: Math.max(0.2, altoDeCuerpo - ZOCALO.alto),
      rows: 1,
      fondos: [Math.min(PROFUNDIDADES[0], fondoMaximo)],
    };
  }
  // El techo de la última fila es la parte de abajo del copete.
  const alturas = [...niveles, altoDeCuerpo];
  const rows = niveles.length;
  return {
    rowBottom: niveles[0],
    alturas,
    rowPitch: (alturas[rows] - alturas[0]) / rows,
    rows,
    fondos: Array.from({ length: rows }, (_, i) =>
      profundidadDeNivel(i, alturas.length, fondoMaximo),
    ),
  };
}

/**
 * El alto de la franja de slots de una PUNTA.
 *
 * Deliberadamente NO es `altoDeZonaDeSlots`. La góndola descuenta el remate y
 * la base; la punta descuenta sólo el remate, y su franja se mide sobre el
 * cuerpo (sin el copete). Son dos fórmulas distintas porque así se repartieron
 * los slots cuando se dibujaron, y la posición de cada slot viaja en los
 * contratos de los clientes: unificarlas «para que quede prolijo» corre todos
 * los espacios vendidos de las puntas.
 */
export function altoDeZonaDeSlotsDePunta(altoDeCuerpo: number): number {
  return altoDeCuerpo - ZONA_DE_SLOTS.remate;
}

/* ── Los muebles refrigerados ────────────────────────────────────────────────
   La nevera de refrescos y la vitrina son el mismo mueble con otro alto: una
   carrocería de chapa, un zócalo que esconde el compresor, un copete arriba
   con la marca y la luz, y adelante una CORTINA DE AIRE —si es de frente
   abierto— o PUERTAS DE VIDRIO —si es cerrado—.

   Ese frente es lo que las define. Sin él el mueble se lee como una estantería
   pintada de oscuro, que es exactamente como se veía. */

export const NEVERA = {
  /** Alto del zócalo, que es donde vive el compresor. Es una cota de
   *  fabricación —el compresor mide lo que mide— y no una fracción del alto:
   *  una nevera de 2 m no tiene un compresor más alto que una de 1,8. Era
   *  `h * 0.14`, y con eso un mueble alto salía con un zócalo de 28 cm. */
  zocalo: 0.17,
  /** Alto del copete: la banda de arriba donde va la marca y la luminaria. */
  copete: 0.14,
  /** Espesor de la carrocería. Es panel aislado, no chapa sola: por eso son
   *  35 mm y no los 2 mm de un entrepaño. */
  chapa: 0.035,
  /** Ancho del perfil de aluminio que rodea el vidrio. Es lo que el ojo
   *  reconoce como puerta; el vidrio casi no se ve. */
  marcoPuerta: 0.045,
  /** Espesor del conjunto de la puerta. El vidrio es doble con cámara. */
  fondoPuerta: 0.028,
  /** A partir de qué ancho el frente se parte en dos puertas. Una hoja de más
   *  de 75 cm no la fabrica nadie: no la aguanta la bisagra y no abre en un
   *  pasillo. */
  anchoMaximoDePuerta: 0.75,
  /** Luz entre el vidrio y el producto. */
  holguraDePuerta: 0.02,
  /** Alto de la manija vertical. */
  manija: 0.9,
} as const;

/** El alto libre del interior de un mueble refrigerado. */
export function altoUtilDeNevera(alto: number): number {
  return Math.max(0.2, alto - NEVERA.zocalo - NEVERA.copete);
}

/** Cuántas puertas lleva un frente. */
export function puertasDeNevera(ancho: number): number {
  return Math.max(1, Math.ceil(ancho / NEVERA.anchoMaximoDePuerta));
}

/** Los entrepaños de un mueble refrigerado.
 *
 *  Van más juntos que los de una góndola: lo que se guarda en frío es chico y
 *  el metro cúbico refrigerado es caro, así que se aprovecha. */
export function nivelesDeNevera(alto: number): number[] {
  const util = altoUtilDeNevera(alto);
  const desde = NEVERA.zocalo + 0.04;
  const hasta = NEVERA.zocalo + util - 0.04;
  if (hasta <= desde) return [];

  const disponible = hasta - desde;
  const cuantos = Math.max(1, Math.round(disponible / 0.3));
  const paso = disponible / cuantos;
  const niveles: number[] = [];
  for (let i = 0; i <= cuantos; i++) {
    const y = alRasDeRanura(desde + i * paso);
    if (y <= hasta + 1e-6) niveles.push(y);
  }
  return niveles;
}

/** Las filas de producto de un mueble refrigerado. */
export function filasDeNevera(alto: number, fondoMaximo: number): FilasDeProducto {
  const niveles = nivelesDeNevera(alto);
  const techo = NEVERA.zocalo + altoUtilDeNevera(alto);
  if (niveles.length === 0) {
    return {
      rowBottom: NEVERA.zocalo,
      alturas: [NEVERA.zocalo, techo],
      rowPitch: Math.max(0.2, techo - NEVERA.zocalo),
      rows: 1,
      fondos: [Math.min(PROFUNDIDADES[0], fondoMaximo)],
    };
  }
  // Igual que la punta: sobre el entrepaño de arriba también se vende, porque
  // lo que lo techa es el copete y no otro entrepaño.
  const alturas = [...niveles, techo];
  const rows = niveles.length;
  return {
    rowBottom: niveles[0],
    alturas,
    rowPitch: (alturas[rows] - alturas[0]) / rows,
    rows,
    // El frío no escalona: la carrocería es una caja y todos los entrepaños
    // tienen el mismo fondo.
    fondos: Array.from({ length: rows }, () => fondoMaximo),
  };
}

/* ── El mural de frutas y verduras ───────────────────────────────────────────
   Es un mueble de frío abierto como el multideck de bebidas, con dos
   diferencias que cambian la forma entera:

   · sus niveles son BANDEJAS INCLINADAS hacia el cliente, no entrepaños
     planos. La fruta suelta rueda y hay que verla desde arriba, así que el
     plano de apoyo cae unos quince grados; y
   · van muchos menos y mucho más hondos, porque lo que se carga encima es una
     caja de producto y no una fila de envases. */

export const MURAL_VEGETALES = {
  /** Inclinación de la bandeja hacia el cliente, en radianes. */
  caida: (15 * Math.PI) / 180,
  /** Alto del borde de contención del frente. Sin él la fruta se cae, y sin
   *  dibujarlo el mueble se lee como una estantería con cosas encima. */
  tope: 0.07,
  /** Separación mínima entre bandejas. */
  paso: 0.42,
} as const;

/** Las bandejas de un mural de vegetales: pocas, hondas e inclinadas. */
export function nivelesDeMural(alto: number): number[] {
  const util = altoUtilDeNevera(alto);
  const desde = NEVERA.zocalo + 0.05;
  const hasta = NEVERA.zocalo + util - 0.06;
  if (hasta <= desde) return [];
  const cuantos = Math.max(1, Math.round((hasta - desde) / MURAL_VEGETALES.paso));
  const paso = (hasta - desde) / cuantos;
  return Array.from({ length: cuantos + 1 }, (_, i) => alRasDeRanura(desde + i * paso));
}

/* ── El mostrador de servicio refrigerado ────────────────────────────────────
   (carnes, fiambres, quesos, pescadería)

   La foto de uno real manda tres cosas que el modelo no tenía, y las tres son
   de FORMA, no de material ni de color:

   · **No es un cajón hasta el piso.** La carrocería fría va colgada a media
     altura sobre PATAS ACAMPANADAS —troncos de cono que se abren hacia el
     suelo—. Ese hueco por debajo es lo primero que se ve de lejos, y es lo que
     separa un mostrador de servicio de una isla o de una batea, que sí apoyan.
   · **No es oscuro.** La carrocería es acero inoxidable CLARO, con un bocel
     gordo de acero corrido en el filo del frente. Lo único negro es el marco
     del vidrio, la reja del compresor y el trasero de servicio. Pintado de
     casi-negro el mueble se leía como un contenedor.
   · **El vidrio es una BÓVEDA, no una visera.** Nace EN el filo del frente
     —no por delante, colgando en el aire, que es donde estaba— y se tumba
     hacia atrás por encima de todo el producto hasta el mueble de servicio.
     Se lleva más de la mitad del alto: es la pieza dominante del mueble.

   Las cotas viven acá y no en el componente porque el que vuelca el producto
   adentro necesita las mismas: si hay dos cuentas, la carne flota o se hunde. */

export const MOSTRADOR = {
  /** Reparto del alto total entre las tres franjas que se leen de lejos:
   *  patas, carrocería fría y bóveda. El resto es vidrio. */
  fraccionDePata: 0.24,
  fraccionHastaElFilo: 0.48,
  /** Cuánto del fondo tapa la bóveda. Lo que sobra atrás es el mueble de
   *  servicio, cerrado, por donde el carnicero saca y repone. */
  fraccionDeVuelo: 0.8,
  /** Radio del bocel de acero del filo del frente. Es una cota de forma: sin
   *  él el frente es una arista viva y el mueble se ve de chapa doblada. */
  bocel: 0.055,
  /** Espesor de la carrocería. */
  chapa: 0.02,
  /** La pata: tronco de cono que se ABRE hacia el piso, y ovalado en planta
   *  (más largo de fondo que de ancho, como el de la foto). */
  pata: { arriba: 0.07, abajo: 0.13, ovalo: 1.6, paso: 0.95 },
  /** Cuánto se hunde el plano de la cubeta respecto del filo del frente: el
   *  cliente mira POR ENCIMA del bocel, no a través de él. */
  hundido: 0.06,
  /** Ancho de paño entre montantes negros del vidrio. El de la foto es
   *  modular: cada paño tiene su arco y entre paño y paño hay un montante. */
  panoDeVidrio: 1.15,
  /** El compresor: cajón oscuro con reja de malla, colgado bajo un extremo. */
  compresor: { ancho: 0.44, fondo: 0.6, fraccionDeCaida: 0.55 },
} as const;

export interface CotasDeMostrador {
  /** Alto del hueco bajo la carrocería: donde van las patas. */
  altoDePata: number;
  /** Alto del filo del frente — el tope de la carrocería y el arranque del
   *  vidrio. */
  filo: number;
  /** Alto de la bóveda, del filo para arriba. */
  altoDeVidrio: number;
  /** Cuánto se tumba la bóveda hacia atrás. */
  vuelo: number;
  /** Z de la cara del frente. */
  zFrente: number;
  /** Z donde la bóveda toca el mueble de servicio de atrás. */
  zRemate: number;
  /** Fondo del mueble de servicio cerrado, detrás de la bóveda. */
  fondoDeServicio: number;
  /** Dónde apoyan las patas, a lo ancho. */
  xDePatas: number[];
  /** Dónde van los montantes negros del vidrio, a lo ancho. */
  xDeMontantes: number[];
}

function entre(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export function cotasDeMostrador(w: number, d: number, h: number): CotasDeMostrador {
  const altoDePata = entre(h * MOSTRADOR.fraccionDePata, 0.12, h * 0.34);
  const filo = entre(h * MOSTRADOR.fraccionHastaElFilo, altoDePata + 0.16, h * 0.72);
  const vuelo = entre(d * MOSTRADOR.fraccionDeVuelo, 0.18, d - 0.08);
  const zFrente = -d / 2;

  const margen = MOSTRADOR.pata.abajo * 1.3;
  const util = Math.max(0, w - margen * 2);
  const cuantas = Math.max(2, Math.round(util / MOSTRADOR.pata.paso) + 1);
  const xDePatas = Array.from({ length: cuantas }, (_, i) =>
    cuantas === 1 ? 0 : -util / 2 + (util * i) / (cuantas - 1),
  );

  // Los montantes van en las JUNTAS entre paños, más los dos de las puntas:
  // un vidrio sin canto oscuro se ve como una calcomanía pegada al aire.
  const panos = Math.max(1, Math.round(w / MOSTRADOR.panoDeVidrio));
  const xDeMontantes = Array.from({ length: panos + 1 }, (_, i) =>
    -w / 2 + (w * i) / panos,
  );

  return {
    altoDePata,
    filo,
    altoDeVidrio: Math.max(0.16, h - filo),
    vuelo,
    zFrente,
    zRemate: zFrente + vuelo,
    fondoDeServicio: Math.max(0.06, d - vuelo),
    xDePatas,
    xDeMontantes,
  };
}

/* ── La caja registradora ────────────────────────────────────────────────────
   La ficha de catálogo de una de verdad manda una forma que el modelo no tenía:

   · **La mesa no es una tapa lisa.** Es una CAMA HUNDIDA —por donde corre la
     cinta y donde el cliente descarga— rodeada de un bocel de goma oscuro que
     da la vuelta completa. Ese contraste entre la bandeja clara y el marco
     oscuro es lo que se ve desde el pasillo, mucho antes que la registradora.
   · **La registradora va sobre una consola**, un pupitre de chapa doblada
     apoyado en la mesa, y el poste de la pantalla NACE de esa consola.
   · **Del lado del cajero, el sector de empaque**, más alto que la cama y con
     una guarda parada atrás para que nada se caiga del otro lado.
   · **Del lado del cliente, los estantes de impulso.** Son el espacio más caro
     de toda la línea de cajas —chicles, pilas, revistas— y son ESPACIO
     VENDIBLE: en un plano que se le muestra a un proveedor no pueden faltar.
   · Un parachoques corrido a media altura, que es lo que come los carros. */

export const CHECKOUT = {
  /** Bocel de goma del perímetro de la mesa. */
  bocel: 0.038,
  /** Cuánto se hunde la cama respecto del bocel. */
  hundido: 0.03,
  /** Fracción del largo que se lleva la cama de la cinta; el resto es el
   *  sector de empaque. */
  fraccionDeCama: 0.58,
  /** El pupitre de la registradora. */
  consola: { ancho: 0.3, fondo: 0.32, alto: 0.24 },
  /** Poste y pantalla del punto de venta. */
  poste: { radio: 0.018, alto: 0.4 },
  pantalla: { ancho: 0.3, alto: 0.21, espesor: 0.024, caida: 0.22 },
  /** Guarda parada al fondo del sector de empaque. */
  guarda: 0.2,
  /** Zócalo retranqueado y parachoques corrido. */
  zocalo: 0.09,
  parachoques: 0.05,
  /** Los estantes de impulso del lado del cliente. */
  impulso: { fondo: 0.15, niveles: 3 },
} as const;

export interface CotasDeCheckout {
  /** Alto de la cara superior del bocel: la mesa. */
  mesa: number;
  /** Alto de la cama hundida por donde corre la cinta. */
  cama: number;
  /** Largo de la cama, y dónde está centrada. */
  largoDeCama: number;
  xDeCama: number;
  /** El sector de empaque, del otro extremo. */
  largoDeEmpaque: number;
  xDeEmpaque: number;
  /** Dónde se apoya la consola de la registradora. */
  xDeConsola: number;
  zDeConsola: number;
  /** La cadena que sostiene la pantalla: tapa de la consola → punta del poste
   *  → centro de la pantalla. Van juntas y no sueltas porque el defecto que
   *  arreglaron fue justamente calcularlas por separado: el poste medía
   *  `posH * 0.75`, la pantalla se colocaba a `posH`, y quedaban veinticinco
   *  centímetros de aire entre las dos. Compilaba. */
  yConsola: number;
  yPoste: number;
  yPantalla: number;
  /** Alturas de los estantes de impulso, del lado del cliente. */
  yDeImpulso: number[];
}

export function cotasDeCheckout(w: number, d: number, h: number): CotasDeCheckout {
  const mesa = h;
  const cama = mesa - CHECKOUT.bocel - CHECKOUT.hundido;
  const largoDeCama = Math.max(0.3, w * CHECKOUT.fraccionDeCama);
  const largoDeEmpaque = Math.max(0.25, w - largoDeCama - 0.04);

  // La cama arranca del lado del cliente; el empaque queda del lado del
  // cajero, que es el orden en el que se recorre una caja.
  const xDeCama = -w / 2 + largoDeCama / 2 + 0.02;
  const xDeEmpaque = w / 2 - largoDeEmpaque / 2 - 0.02;

  const desde = CHECKOUT.zocalo + 0.1;
  const hasta = h - CHECKOUT.bocel - 0.12;
  const n = Math.max(1, Math.min(CHECKOUT.impulso.niveles, Math.floor((hasta - desde) / 0.2) + 1));
  const paso = n > 1 ? (hasta - desde) / (n - 1) : 0;
  const yDeImpulso = hasta > desde
    ? Array.from({ length: n }, (_, i) => desde + i * paso)
    : [];

  const yConsola = mesa + CHECKOUT.consola.alto;
  const yPoste = yConsola + CHECKOUT.poste.alto;

  return {
    mesa,
    cama,
    largoDeCama,
    xDeCama,
    largoDeEmpaque,
    xDeEmpaque,
    // El pupitre va entre la cama y el empaque, del lado del cajero.
    xDeConsola: xDeCama + largoDeCama / 2 - CHECKOUT.consola.ancho / 2 - 0.02,
    zDeConsola: d / 2 - CHECKOUT.consola.fondo / 2 - 0.03,
    yConsola,
    yPoste,
    // La pantalla se APOYA en la punta del poste: su borde de abajo baja dos
    // centímetros por dentro, para que la unión no quede a hueso.
    yPantalla: yPoste + CHECKOUT.pantalla.alto / 2 - 0.02,
    yDeImpulso,
  };
}
