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

/**
 * Cuánto gira el entrepaño que apoya a `apoyo` metros en una cara de
 * `altoDeCara` de alto, con el signo con que lo usa `rotation={[giro, 0, 0]}`.
 *
 * Vive acá y no adentro de la pieza que dibuja el entrepaño porque ahora hay
 * dos que lo necesitan: el entrepaño y el producto de prueba que se para
 * encima. Con una copia en cada lado, el día que se cambie la fracción el
 * producto de los entrepaños altos queda flotando sobre una bandeja inclinada
 * —o enterrado en ella—, que es el defecto que las cuentas compartidas de este
 * archivo vinieron a cerrar.
 */
export function inclinacionDeNivel(apoyo: number, altoDeCara: number): number {
  return apoyo / altoDeCara >= ENTREPANO.desdeFraccionDeAlto ? -ENTREPANO.inclinacion : 0;
}

/** Cuántos entrepaños entran, y a qué altura va cada uno.
 *
 *  Devuelve las alturas del PLANO SUPERIOR de cada entrepaño, ya redondeadas
 *  al paso de ranura. El primero se apoya sobre el zócalo.
 *
 *  Sin `entrepanos`, la cuenta de siempre: los que entran al paso típico, y el
 *  de más arriba hace de techo de la última fila (sobre él no se para nada).
 *  Con `entrepanos` —lo que dice la ficha del modelo, por cara y sin contar la
 *  base, y lo que el mueble guardó al colocarlo— van la base y ESOS
 *  entrepaños, todos con producto: el aire de arriba, hasta el remate, es la
 *  última fila (`filasDeProducto`). Una góndola de 2,00 «con cuatro
 *  entrepaños y la base» se ve con cuatro y la base, no con cinco. */
export function nivelesDeEntrepano(alto: number, entrepanos?: number): number[] {
  // El primero es la BANDEJA DE BASE: se apoya directo sobre el zócalo, es la
  // más profunda y en tienda es la que lleva el producto pesado. Arrancar el
  // primer nivel un paso más arriba deja un hueco vacío abajo que ninguna
  // góndola tiene, y es de las cosas que más delatan un modelo inventado.
  //
  // Aire arriba: el último entrepaño no toca el remate.
  //
  // fase 2 · I5: sólo al DIBUJAR, nunca se escribe de vuelta. Un alto
  // infinito (la API no lo acotaba) daba un `for` sin fin; unos entrepaños
  // de mil millones, un arreglo de mil millones. Un alto que no es un número
  // finito no tiene niveles; unos entrepaños que no son un número finito se
  // cuentan como si no estuvieran, y más de MAX_ENTREPANOS_A_DIBUJAR se dibujan
  // como ese tope. El servidor ya no deja guardarlos (`medidas_imposibles`).
  if (!Number.isFinite(alto)) return [];
  if (entrepanos !== undefined && Number.isFinite(entrepanos)) {
    return nivelesDeFicha(ZOCALO.alto, alto - 0.1, Math.min(entrepanos, MAX_ENTREPANOS_A_DIBUJAR));
  }
  return nivelesEntre(ZOCALO.alto, alto - 0.1);
}

/** Lo más que se DIBUJA (fase 2 · I5): los mismos topes que el servidor exige
 *  al guardar algo nuevo (`layout_lookup.medidas_imposibles`). Los módulos son
 *  `MAX_VANOS` de `utils/superficie.ts` (no se importa: `superficie.ts` importa
 *  de este archivo y sería un ciclo; `probar-muebles.mjs` exige que digan lo
 *  mismo). */
export const MAX_VANOS_A_DIBUJAR = 200;
export const MAX_ENTREPANOS_A_DIBUJAR = 50;

/** La base y `entrepanos` entrepaños, repartidos parejo entre `desde` y
 *  `hasta` dejando arriba una fila del mismo paso, al ras de ranura. */
export function nivelesDeFicha(desde: number, hasta: number, entrepanos: number): number[] {
  if (hasta <= desde) return [];
  const cuantos = Math.max(0, Math.round(entrepanos));
  const paso = (hasta - desde) / (cuantos + 1);
  return Array.from({ length: cuantos + 1 }, (_, i) => alRasDeRanura(desde + i * paso));
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
  /** Cuánto gira el entrepaño de cada fila, con el signo de
   *  `rotation={[giro, 0, 0]}`. Sale de `inclinacionDeNivel`, la misma cuenta
   *  que inclina la bandeja: quien para algo encima de un entrepaño alto tiene
   *  que girar con él o queda apoyado en el aire de un lado y enterrado del
   *  otro. Opcional porque el relleno genérico todavía no la usa. */
  giros?: number[];
}

export function filasDeProducto(alto: number, fondoMaximo: number, entrepanos?: number): FilasDeProducto {
  const niveles = nivelesDeEntrepano(alto, entrepanos);
  if (entrepanos !== undefined && niveles.length > 0) {
    // Con la ficha, todos los entrepaños llevan producto: el techo de la
    // última fila es el aire bajo el remate, que no se dibuja (como el copete
    // de la punta en `filasDePunta`).
    const alturas = [...niveles, alto - 0.1];
    const rows = niveles.length;
    return {
      rowBottom: niveles[0],
      alturas,
      rowPitch: (alturas[rows] - alturas[0]) / rows,
      rows,
      fondos: Array.from({ length: rows }, (_, i) => profundidadDeNivel(i, niveles.length, fondoMaximo)),
      giros: niveles.map((y) => inclinacionDeNivel(y, alto)),
    };
  }
  if (niveles.length < 2) {
    return {
      rowBottom: ZOCALO.alto,
      alturas: [ZOCALO.alto, alto],
      rowPitch: Math.max(0.2, alto - ZOCALO.alto),
      rows: 1,
      fondos: [Math.min(PROFUNDIDADES[0], fondoMaximo)],
      giros: [inclinacionDeNivel(ZOCALO.alto, alto)],
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
    // Con el alto del mueble, que es el que le pasa `GondolaReal` a
    // `CaraDeEstanteria`: la fracción se mide contra la cara que se dibuja.
    giros: niveles.slice(0, rows).map((y) => inclinacionDeNivel(y, alto)),
  };
}

/** El fondo que le toca a una cara de un mueble de fondo total `d`. En la
 *  doble se reparte entre las dos caras, descontando la espina. */
export const ESPESOR_ESPINA = 0.02;
export function fondoPorCara(d: number, esMural: boolean): number {
  return esMural ? d - ESPESOR_ESPINA : (d - ESPESOR_ESPINA) / 2;
}

/**
 * Lo que el mueble guardó de la ficha de su modelo (o se escribió en el
 * panel, «Entrepaños» y «Módulo») y cambia cómo se dibuja: los entrepaños y
 * el ancho de módulo de una góndola o una punta, y las puertas de una nevera
 * de puertas. Todo opcional: lo que falta se cuenta como siempre
 * (`nivelesDeEntrepano`, `nivelesDePunta`, `vanosDeCorrido`,
 * `puertasDeNevera`), así que un mueble de un plano viejo se dibuja igual que
 * antes.
 *
 * Sale del mueble con `geometriaDe` y viaja junto con el tipo y las medidas a
 * quien pregunta dónde vende (`ventaDeTipo`) o cómo pintar su cara: si el
 * dibujo usara la ficha y la cuenta del producto no, el producto quedaría
 * parado entre dos entrepaños.
 */
export interface GeometriaDeMueble {
  entrepanos?: number;
  modulo?: number;
  puertas?: number;
  /** Vender por partes: los tramos guardados (`partes.tramos`). En la góndola
   *  parten el corrido en ESOS módulos iguales (un tramo es siempre un vano);
   *  en la nevera abierta y la de vegetales ponen un montante entre tramo y
   *  tramo. Ausentes, la cuenta de siempre. */
  tramos?: number;
  /** Vender por partes, las piezas de la caja: cuántas bahías de impulso
   *  tiene del lado del cliente (`partes.bahias`, de 1 a 4). Parten la mesa en
   *  nichos iguales (`nichosDeImpulso`). Ausentes, el dibujo de siempre. */
  bahias?: number;
  /** La columna lleva forro (`partes.forro === true`): una envoltura de cuatro
   *  caras del zócalo a `FORRO.alto`. */
  forro?: boolean;
}

/** El forro de una columna: una envoltura de las cuatro caras, del zócalo a
 *  dos metros —lo que se ve parado al lado—, un poco más gruesa que el fuste. */
export const FORRO = { alto: 2.0, espesor: 0.015 } as const;

/** Los tramos con que se dibuja: un entero de 1 a 40 (`geometria.tramos` del
 *  catálogo llega a 40). Lo demás —un texto, un 0, un número que haría
 *  módulos de dos centímetros— no se dibuja: la cuenta de siempre. */
export function tramosValidos(tramos: number | null | undefined): number | undefined {
  return typeof tramos === "number" && Number.isInteger(tramos) && tramos >= 1 && tramos <= 40 ? tramos : undefined;
}

/** La geometría que guardó un mueble: sólo lo que tiene. Un `null` (el panel
 *  lo borró a propósito y todavía no se guardó) es no tenerlo. */
export function geometriaDe(f: {
  entrepanos?: number | null; modulo?: number | null;
  partes?: { puertas?: number | null; tramos?: number | null; bahias?: number | null; forro?: boolean | null } | null;
}): GeometriaDeMueble {
  const g: GeometriaDeMueble = {};
  if (typeof f.entrepanos === "number") g.entrepanos = f.entrepanos;
  if (typeof f.modulo === "number") g.modulo = f.modulo;
  if (typeof f.partes?.puertas === "number") g.puertas = f.partes.puertas;
  const tramos = tramosValidos(f.partes?.tramos);
  if (tramos !== undefined) g.tramos = tramos;
  const bahias = f.partes?.bahias;
  // Las bahías se dibujan de 1 a 4 (`geometria.bahias` del catálogo): lo
  // demás no se dibuja, como no se vende.
  if (typeof bahias === "number" && Number.isInteger(bahias) && bahias >= 1 && bahias <= 4) g.bahias = bahias;
  if (f.partes?.forro === true) g.forro = true;
  return g;
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
export function vanosDeCorrido(w: number, modulo?: number, tramos?: number): Vano[] {
  // Sin `modulo`, el de catálogo europeo (1,25). Con él —el ancho de módulo de
  // la ficha que el mueble guardó al colocarlo: en Colombia 0,90, 1,00 o
  // 1,20—, el corrido se parte en módulos de ESE ancho.
  //
  // Con `tramos` (vender por partes: `partes.tramos` de la góndola), en ESOS
  // tramos iguales, mande lo que mande el módulo: un tramo es siempre un vano,
  // así el producto de prueba y el relleno se paran adentro, y estirar el
  // corrido estira los tramos sin cambiar cuál es cuál.
  //
  // fase 2 · I5: con un tope, sólo al DIBUJAR. Un ancho de 1e6 con un módulo
  // de 1e-9 (la API no los acotaba) pedía un arreglo de mil billones de
  // módulos y colgaba la pestaña; un ancho infinito tiraba `RangeError`. Un
  // ancho que no es un número finito no tiene vanos, y nunca salen más de
  // MAX_VANOS_A_DIBUJAR. No se recorta lo guardado: `storeToFixtures` →
  // `fixturesToStore` lo volvería a escribir recortado.
  if (!Number.isFinite(w)) return [];
  const fijos = tramosValidos(tramos);
  const cuantos = fijos ?? Math.min(
    MAX_VANOS_A_DIBUJAR,
    Math.max(1, Math.round(w / (modulo && modulo > 0 ? modulo : ANCHO_MODULO_TIPICO))),
  );
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

/**
 * Dónde vende un mueble: sus filas, sus vanos y sus caras, en una sola pieza.
 *
 * Es lo que necesita cualquiera que pare producto sobre el mueble —el relleno
 * por rubro, la prueba del producto del proveedor— y lo que antes cada
 * componente armaba por su cuenta a partir de las mismas funciones. Juntarlo
 * no agrega ninguna cuenta: cada mueble lo arma con las que ya tenía
 * (`ventaDeGondola`, `ventaDePunta`, `ventaDeNevera`, `ventaDeRobatope`).
 */
export interface VentaDeMueble {
  filas: FilasDeProducto;
  vanos: Vano[];
  /** Dónde se cuelga cada cara y hacia dónde crece (ver `CaraDeProducto`). */
  caras: { montaje: number; hacia: 1 | -1 }[];
  /** Alto de la franja de slots, para los muebles que venden por espacios. */
  franja?: number;
  /** Alto de la cara contra el que se mide la inclinación de los entrepaños. */
  altoDeCara: number;
  /** Lo que el plano de apoyo queda por encima de `filas.alturas[i]`: la
   *  rejilla de la nevera es una malla y lo que se apoya, se apoya en el
   *  alambre. */
  sobreApoyo?: number;
  /** Giro de TODO el juego de repisas alrededor del origen del mueble, como
   *  lo dibuja el robatope (sus repisas cuelgan de un único grupo girado). */
  grupoGiro?: number;
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
   *  copete se lea como cartel y no como la tapa del mueble.
   *
   *  Un poco MENOS que el parante del robatope (`ROBATOPE.parante`, 5 cm): el
   *  robatope se arrima al costado de la punta y su remate (1,6 m) queda más
   *  alto que el cuerpo de ella (1,44 m), así que el vuelo del copete se mete
   *  en el parante. Con 5 cm justos, el costado del copete caía en el MISMO
   *  plano que la cara interior del parante y los dos peleaban por el
   *  depth-buffer: en «De cerca» del robatope era una línea oscura de 2-3 px
   *  colgando del remate hasta la tapa de la punta («un cable suelto o una
   *  grieta», la crítica de la demo, ronda 3). Con 4,5 cm el costado queda
   *  medio centímetro ADENTRO del parante, donde no se ve. */
  vuelo: 0.045,
  /** Alto de la barra de luz que lo remata. */
  altoLuz: 0.05,
} as const;

/**
 * Dónde termina la cara de una punta y empieza su copete: el alto del cuerpo,
 * `h` total menos el cartel (nunca menos de 40 cm).
 *
 * Es UNA cuenta para el mueble que se dibuja (`PuntaMesh`, `PuntaReal`), el
 * que vende (`ventaDePunta`) y la cámara de venta: «De cerca» no corta el
 * copete por la mitad, y `focoDeLaPrueba` no sabe del copete (mira
 * entrepaños). Con dos copias, un ajuste de un lado hacía que la toma
 * cortara el cartel en otro lugar que el que se dibuja.
 */
export function techoDeCara(h: number): number {
  return Math.max(0.4, h - COPETE.alto);
}

/** Debajo de esto, el hueco entre el último entrepaño y el copete no sirve
 *  para producto: lo tapa la cenefa del copete (`PuntaReal`). */
export const HUECO_SIN_PRODUCTO = 0.12;

/**
 * Dónde empieza, de abajo, lo que se lee como CARTEL en una punta: el copete
 * o, si el hueco de arriba no sirve para producto, la cenefa que baja del
 * copete hasta el último entrepaño. «De cerca» no corta ninguno de los dos:
 * con sólo el copete en la cuenta, el borde del cuadro caía en la cenefa
 * —una franja de color de la marca colgando arriba, con la chapa del visor
 * apoyada encima («el copete cortado por la mitad»)—.
 */
export function pisoDelCartelDePunta(h: number, entrepanos?: number): number {
  const techo = techoDeCara(h);
  const niveles = nivelesDePunta(techo, entrepanos);
  const ultimo = niveles[niveles.length - 1];
  return ultimo != null && techo - ultimo < HUECO_SIN_PRODUCTO ? ultimo : techo;
}

/** Los entrepaños de una punta, dentro de su cuerpo (sin el copete).
 *
 *  Terminan un poco antes del copete: el cartel necesita su aire o se lee
 *  como un entrepaño más.
 *
 *  Con `entrepanos` —los que el mueble guardó, por cara y sin contar la base,
 *  igual que en la góndola (`nivelesDeEntrepano`)— van la base y ESOS
 *  entrepaños repartidos parejo, y sobre el de más arriba también se vende:
 *  el techo de esa fila es el copete (`filasDePunta`). Sin el campo, la
 *  cuenta de siempre. */
export function nivelesDePunta(altoDeCuerpo: number, entrepanos?: number): number[] {
  if (entrepanos !== undefined) return nivelesDeFicha(ZOCALO.alto, altoDeCuerpo - 0.06, entrepanos);
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
export function filasDePunta(altoDeCuerpo: number, fondoMaximo: number, entrepanos?: number): FilasDeProducto {
  const niveles = nivelesDePunta(altoDeCuerpo, entrepanos);
  if (niveles.length === 0) {
    return {
      rowBottom: ZOCALO.alto,
      alturas: [ZOCALO.alto, altoDeCuerpo],
      rowPitch: Math.max(0.2, altoDeCuerpo - ZOCALO.alto),
      rows: 1,
      fondos: [Math.min(PROFUNDIDADES[0], fondoMaximo)],
      giros: [inclinacionDeNivel(ZOCALO.alto, altoDeCuerpo)],
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
    // Contra el alto del CUERPO, que es lo que `PuntaReal` le pasa a
    // `CaraDeEstanteria`: medida contra el alto total con copete, la fila 3
    // de una punta de 1,80 no se inclinaría y su entrepaño sí.
    giros: niveles.map((y) => inclinacionDeNivel(y, altoDeCuerpo)),
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
  /** El porta-precios del multideck, en el filo de cada rejilla: cuánto baja
   *  su centro respecto de la rejilla y cuánto se mete detrás del frente de
   *  la puerta. Constantes (y no números en `NeveraReal`) porque el hablador
   *  del producto en prueba se cuelga de la MISMA tira (`labioDeFila`). */
  portaBaja: 0.005,
  portaAdentro: 0.012,
} as const;

/** El alto libre del interior de un mueble refrigerado. */
export function altoUtilDeNevera(alto: number): number {
  return Math.max(0.2, alto - NEVERA.zocalo - NEVERA.copete);
}

/** Cuántas puertas lleva un frente. */
export function puertasDeNevera(ancho: number): number {
  return Math.max(1, Math.ceil(ancho / NEVERA.anchoMaximoDePuerta));
}

/** Las puertas de una nevera de puertas: las que guardó de su ficha
 *  (`partes.puertas`), o la cuenta de siempre. */
export function puertasDe(ancho: number, puertas?: number): number {
  return puertas !== undefined && puertas >= 1 ? Math.round(puertas) : puertasDeNevera(ancho);
}

/** El hueco detrás del vidrio de cada puerta: la hoja, menos su marco. */
export function vanosDePuertas(w: number, puertas: number): Vano[] {
  const n = puertasDe(w, puertas);
  const hoja = w / n;
  return Array.from({ length: n }, (_, i) => ({
    x: -w / 2 + hoja * (i + 0.5),
    ancho: Math.max(0.05, hoja - NEVERA.marcoPuerta * 2 - 0.01),
  }));
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
      giros: [0],
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
    // Ni se inclina: la rejilla del multideck va plana (`NeveraReal`).
    giros: Array.from({ length: rows }, () => 0),
  };
}

/** El montante entre tramo y tramo de una nevera abierta o un mural de
 *  vegetales vendidos por tramos: una chapa vertical del zócalo al copete. */
export const MONTANTE_DE_TRAMO = 0.03;

/** Los vanos de una nevera abierta partida en `tramos` iguales, sobre su
 *  ancho útil (`ancho`), descontando el montante de cada junta. */
export function vanosDeTramos(ancho: number, tramos: number): Vano[] {
  const n = Math.max(1, Math.round(tramos));
  const paso = ancho / n;
  return Array.from({ length: n }, (_, i) => ({
    x: -ancho / 2 + paso * (i + 0.5),
    ancho: Math.max(0.05, paso - (n > 1 ? MONTANTE_DE_TRAMO : 0)),
  }));
}

/** Dónde va el montante de cada junta entre tramos (centro en X), sobre el
 *  mismo ancho que `vanosDeTramos`: entre el vano `i` y el `i+1`. Sin tramos
 *  (o con uno), ninguno. */
export function montantesDeTramos(ancho: number, tramos: number | undefined): number[] {
  const n = tramosValidos(tramos);
  if (n === undefined || n < 2) return [];
  const paso = ancho / n;
  return Array.from({ length: n - 1 }, (_, i) => -ancho / 2 + paso * (i + 1));
}

/** Lo que el envase queda por encima del plano del entrepaño de la nevera: la
 *  rejilla es de alambre y lo que se apoya, se apoya en él. Estaba escrito a
 *  mano adentro del relleno mudo; ahora lo lee también el producto de prueba. */
export const SOBRE_REJILLA = 0.005;

/** Dónde vende la nevera de refrescos (el multideck). Las cuentas son las de
 *  `NeveraReal`: el interior descuenta la chapa del fondo y la puerta, la
 *  rejilla va en `z = chapa/2` con ese fondo —así que su canto de atrás cae en
 *  `(d − fondoPuerta)/2`—, y el relleno usa el ancho interior menos 3 cm. */
export function ventaDeNevera(w: number, d: number, h: number, puertas?: number, tramos?: number): VentaDeMueble {
  const fondoInterior = Math.max(0.1, d - NEVERA.chapa - NEVERA.fondoPuerta);
  const fijos = tramosValidos(tramos);
  return {
    filas: filasDeNevera(h, fondoInterior),
    // La de puertas: un vano por puerta, detrás del vidrio de cada hoja. Con
    // uno solo de punta a punta, el producto quedaba parado detrás de los
    // montantes. La multideck es de frente abierto: un vano, o uno por tramo
    // si se vende por tramos (con el montante entre uno y otro).
    vanos: puertas !== undefined
      ? vanosDePuertas(w, puertas)
      : fijos !== undefined && fijos > 1
        ? vanosDeTramos(w - 2 * NEVERA.chapa - 0.03, fijos)
        : [{ x: 0, ancho: w - 2 * NEVERA.chapa - 0.03 }],
    caras: [{ montaje: (d - NEVERA.fondoPuerta) / 2, hacia: -1 }],
    sobreApoyo: SOBRE_REJILLA,
    altoDeCara: h,
  };
}

/* ── El robatope ─────────────────────────────────────────────────────────────
   El panel lateral que flanquea la punta. Sus repisas estaban calculadas DOS
   veces —en el mesh y en el pintado de caras— con un «keep in sync» en cada
   una; ahora las dos preguntan acá, y también el producto de prueba. */

export const ROBATOPE = {
  /** El remate oscuro de arriba: no lleva copete. */
  capa: 0.055,
  /** El ancho de cada parante (el costado del mueble). El vuelo del copete de
   *  la punta tiene que ser menor: ver `COPETE.vuelo`. */
  parante: 0.05,
  /** Separación a la que se apunta al repartir las repisas. */
  pasoObjetivo: 0.40,
  /** Dónde arranca el reparto, sobre las patas. */
  base: 0.12,
  /** Lo que se descuenta del cuerpo antes de repartir. */
  margen: 0.16,
  /** Espesor de la tabla de cada repisa: el producto apoya en su cara de
   *  arriba, medio espesor por encima del centro. */
  espesorRepisa: 0.022,
  /** Giro de todo el juego de repisas, alrededor del origen del mueble. */
  giro: -0.06,
  /** Lo que la repisa es más angosta y más corta que el mueble. */
  retiroAncho: 0.055,
  retiroFondo: 0.01,
  /** El riel de precios de cada repisa: cuánto sube su centro sobre el centro
   *  de la tabla, su alto, su espesor, cuánto se mete desde el canto del
   *  mueble y cuánto más angosto es que el mueble. Constantes porque el
   *  hablador del producto en prueba va en el MISMO riel (`labioDeFila`). */
  rielSube: 0.030,
  rielAlto: 0.036,
  rielEspesor: 0.007,
  rielAdentro: 0.008,
  rielRetiro: 0.06,
} as const;

export interface CotasDeRobatope {
  /** Alto del cuerpo, sin el remate. */
  cuerpo: number;
  /** Cuántas repisas, y su separación. */
  n: number;
  paso: number;
  /** Centro de la tabla de cada repisa, de abajo hacia arriba. */
  repisas: number[];
  /** Cara de arriba de cada tabla: donde se apoya el producto. */
  apoyos: number[];
  anchoUtil: number;
  fondo: number;
  /** Z donde se cuelgan las repisas (crecen hacia −Z). */
  montaje: number;
  giro: number;
}

export function cotasDeRobatope(w: number, d: number, h: number): CotasDeRobatope {
  const cuerpo = h - ROBATOPE.capa;
  const n = Math.max(2, Math.round(cuerpo / ROBATOPE.pasoObjetivo));
  const paso = (cuerpo - ROBATOPE.margen) / (n + 1);
  // EXACTAMENTE la cuenta que tenía el mesh, con el mismo orden de operaciones
  // —primero el producto y después la división—: el refactor no puede mover
  // una repisa ni en el último bit.
  const repisas = Array.from(
    { length: n },
    (_, i) => ROBATOPE.base + (i + 1) * (cuerpo - ROBATOPE.margen) / (n + 1),
  );
  const fondo = d - ROBATOPE.retiroFondo;
  return {
    cuerpo, n, paso, repisas,
    apoyos: repisas.map((y) => y + ROBATOPE.espesorRepisa / 2),
    anchoUtil: w - ROBATOPE.retiroAncho,
    fondo,
    montaje: fondo / 2,
    giro: ROBATOPE.giro,
  };
}

/** Dónde vende el robatope. Se vende entero, así que no lleva franja. */
export function ventaDeRobatope(w: number, d: number, h: number): VentaDeMueble {
  const c = cotasDeRobatope(w, d, h);
  return {
    filas: {
      rowBottom: c.apoyos[0],
      alturas: [...c.apoyos, c.cuerpo],
      rowPitch: c.paso,
      rows: c.n,
      fondos: Array.from({ length: c.n }, () => c.fondo),
      // Las repisas no se inclinan una por una: gira el juego entero.
      giros: Array.from({ length: c.n }, () => 0),
    },
    vanos: [{ x: 0, ancho: c.anchoUtil }],
    caras: [{ montaje: c.montaje, hacia: -1 }],
    altoDeCara: c.cuerpo,
    grupoGiro: c.giro,
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
   Contra la ficha de catálogo de una de verdad. La forma tiene cinco rasgos y
   los cinco se ven de lejos:

   · **Es una L en planta.** La mesa larga con la cinta, y en el extremo de
     salida una ESTACIÓN DE EMPAQUE perpendicular que se adelanta hacia el
     cliente, más alta que la cama y con una guarda parada atrás. Modelada como
     una barra recta, la caja se lee como un mostrador cualquiera.
   · **El cuerpo es oscuro y las puntas claras.** Carcasa de chapa gris grafito
     con dos paneles laterales claros y un parachoques corrido a media altura.
     Nosotros lo teníamos al revés: cuerpo claro con molduras oscuras.
   · **La mesa es una bandeja hundida dentro de un bocel gordo** que da la
     vuelta completa y dobla EN CURVA en las puntas. Ese radio en planta es lo
     que hace que se lea como moldura y no como chapa cortada.
   · **Del lado del cliente el zócalo está ABIERTO**, en dos bahías grandes.
     Ése es el espacio de impulso, y es lo más caro de la línea de cajas.
   · **La registradora se apoya en una consola** —un pupitre de chapa doblada
     con la cara inclinada— y el poste de la pantalla nace de esa consola. */

export const CHECKOUT = {
  /** El bocel: espesor de la moldura, alto y radio de la esquina en planta. */
  bocel: { grosor: 0.055, alto: 0.05, radio: 0.1 },
  /** Cuánto se hunde la bandeja respecto de la cara de arriba del bocel. */
  hundido: 0.032,
  /** Cuánto del largo se lleva la estación de empaque, en el extremo. */
  fraccionDeAla: 0.3,
  /** Cuánto se retira del filo del cliente la mesa larga. Es lo que dibuja la
   *  L: el ala de empaque sí llega hasta el filo. */
  fraccionDeRetiro: 0.24,
  /** El pupitre de la registradora. */
  consola: { ancho: 0.3, fondo: 0.3, alto: 0.2, respaldo: 0.16 },
  /** Poste y pantalla del punto de venta. */
  poste: { radio: 0.016, alto: 0.38 },
  pantalla: { ancho: 0.29, alto: 0.2, espesor: 0.022, caida: 0.2 },
  /** Guarda parada al fondo del ala de empaque, y cuánto sube su plano. */
  ala: { guarda: 0.22, sobrealto: 0.055, cajones: 3 },
  /** Zócalo retranqueado y parachoques corrido. */
  zocalo: 0.085,
  parachoques: 0.055,
  /** Las bahías abiertas de impulso, del lado del cliente. */
  impulso: { fondo: 0.2, bahias: 2 },
} as const;

export interface CotasDeCheckout {
  /** Alto de la cara de arriba del bocel: la mesa. */
  mesa: number;
  /** Alto del plano hundido de la cinta. */
  cama: number;
  /** La mesa larga: cuánto mide y dónde está. */
  largoDeMesa: number;
  xDeMesa: number;
  fondoDeMesa: number;
  zDeMesa: number;
  /** La estación de empaque, en el extremo y a fondo completo. */
  largoDeAla: number;
  xDeAla: number;
  /** Alto del plano de empaque: sube sobre la mesa. */
  mesaDeAla: number;
  /** Dónde se apoya la consola de la registradora. */
  xDeConsola: number;
  zDeConsola: number;
  /** La cadena que sostiene la pantalla: tapa de la consola → punta del poste
   *  → centro de la pantalla. Van juntas y no sueltas porque el defecto que
   *  arreglaron fue calcularlas por separado: el poste medía `posH * 0.75`, la
   *  pantalla se colocaba a `posH`, y quedaban veinticinco centímetros de aire
   *  entre las dos. Compilaba. */
  yConsola: number;
  yPoste: number;
  yPantalla: number;
  /** Alturas de los entrepaños de las bahías de impulso. */
  yDeImpulso: number[];
}

/** El panel claro de la punta de la caja y la mesa larga entre él y la
 *  estación de empaque: el cuerpo donde se abren las bahías de impulso. Va
 *  aparte de `cotasDeCheckout` (que la referencia del catálogo compara tal
 *  cual) y se calcula de ellas. */
export interface MesaDeImpulso { punta: number; anchoDeMesa: number; xMesa: number }

export function mesaDeImpulso(w: number, c: CotasDeCheckout): MesaDeImpulso {
  // Los volúmenes se reparten el ancho sin pisarse (superpuestos, el z-buffer
  // decide qué cara gana y sale una malla rayada que titila al girar).
  const punta = Math.min(0.26, w * 0.16);
  const anchoDeMesa = Math.max(0.06, c.largoDeMesa - punta);
  return { punta, anchoDeMesa, xMesa: -w / 2 + punta + anchoDeMesa / 2 };
}

export function cotasDeCheckout(w: number, d: number, h: number): CotasDeCheckout {
  const mesa = h;
  const cama = mesa - CHECKOUT.hundido;

  const largoDeAla = entre(w * CHECKOUT.fraccionDeAla, 0.32, w * 0.45);
  const largoDeMesa = Math.max(0.3, w - largoDeAla);
  const retiro = entre(d * CHECKOUT.fraccionDeRetiro, 0.08, d * 0.35);
  const fondoDeMesa = Math.max(0.2, d - retiro);

  const xDeMesa = -w / 2 + largoDeMesa / 2;
  const xDeAla = w / 2 - largoDeAla / 2;
  // La mesa larga se retira del filo del cliente; el ala llega hasta el filo.
  // Ese escalón en planta ES la L.
  const zDeMesa = -d / 2 + retiro + fondoDeMesa / 2;

  const desde = CHECKOUT.zocalo + 0.09;
  const hasta = h - CHECKOUT.bocel.alto - 0.14;
  const n = Math.max(1, Math.min(CHECKOUT.impulso.bahias, Math.floor((hasta - desde) / 0.24) + 1));
  const paso = n > 1 ? (hasta - desde) / (n - 1) : 0;
  const yDeImpulso = hasta > desde
    ? Array.from({ length: n }, (_, i) => desde + i * paso)
    : [];

  const yConsola = mesa + CHECKOUT.consola.alto;
  const yPoste = yConsola + CHECKOUT.poste.alto;

  return {
    mesa,
    cama,
    largoDeMesa,
    xDeMesa,
    fondoDeMesa,
    zDeMesa,
    largoDeAla,
    xDeAla,
    mesaDeAla: mesa + CHECKOUT.ala.sobrealto,
    // El pupitre va del lado del cajero, cerca de la salida.
    xDeConsola: xDeMesa + largoDeMesa / 2 - CHECKOUT.consola.ancho / 2 - 0.04,
    zDeConsola: zDeMesa + fondoDeMesa / 2 - CHECKOUT.consola.fondo / 2 - 0.02,
    yConsola,
    yPoste,
    // La pantalla se APOYA en la punta del poste: su borde de abajo baja dos
    // centímetros por dentro, para que la unión no quede a hueso.
    yPantalla: yPoste + CHECKOUT.pantalla.alto / 2 - 0.02,
    yDeImpulso,
  };
}

/**
 * Las bahías de impulso de la caja, del lado del cliente: la mesa larga
 * (entre el panel de la punta y la estación de empaque) partida en `n` nichos
 * iguales, en el orden del dibujo (de −X a +X). Vender por partes las vende de
 * a una (`CAJ-04-BI1`) contando de izquierda a derecha mirando la caja desde la
 * fila, que es mirar hacia +Z: la `BI1` es el nicho `n − 1` (`vanoDeParte` de
 * la cara A). La usan el dibujo (`CheckoutReal`), el plano 2D y el contorno del
 * visor: una sola cuenta.
 */
export function nichosDeImpulso(c: MesaDeImpulso, n: number): Vano[] {
  const k = Math.max(1, Math.floor(n));
  const paso = c.anchoDeMesa / k;
  const desde = c.xMesa - c.anchoDeMesa / 2;
  // El montante que separa dos nichos mide 3 cm: el hueco libre es el paso
  // menos eso.
  return Array.from({ length: k }, (_, i) => ({ x: desde + paso * (i + 0.5), ancho: Math.max(0.02, paso - 0.03) }));
}

/** Dónde van los montantes entre bahía y bahía (en X, desde el centro de la
 *  caja): las juntas de los nichos de `nichosDeImpulso`. Con una bahía,
 *  ninguno. */
export function montantesDeImpulso(c: MesaDeImpulso, n: number): number[] {
  const k = Math.max(1, Math.floor(n));
  const paso = c.anchoDeMesa / k;
  const desde = c.xMesa - c.anchoDeMesa / 2;
  return Array.from({ length: k - 1 }, (_, i) => desde + paso * (i + 1));
}

/* ── La batea de promoción ───────────────────────────────────────────────────
   Un tacho poco hondo sobre patas largas, con las paredes inclinadas. Las dos
   cotas que decidían si se veía llena o vacía estaban mal, y las dos por el
   mismo motivo: se la midió como un contenedor y no como un mueble de venta.

   · **Va REBOSADA, no enrasada.** El montón que asoma por encima del borde es
     justamente lo que la hace leer como oferta.
   · **El piso va alto.** A 0,58 del alto total el canasto quedaba de 34 cm y
     una botella de litro y medio —31 cm— desaparecía adentro, tapada por la
     pared del frente: desde el pasillo, un mueble lleno se veía vacío.

   Entre las dos, el alto libre daba 30,6 cm y la botella no entraba parada
   POR CUATRO MILÍMETROS. Acostada mide 30 cm de largo, así que en el fondo
   entraba una sola fila. */

export const BATEA = {
  /** Cuánto más angosto es el fondo que la boca, por lado. */
  estrechamiento: 0.11,
  /** Radio de las ruedas. */
  rueda: 0.045,
  /** Espesor del borde volcado de la boca. */
  borde: 0.022,
  /** A qué altura va el piso del canasto, como fracción del alto total. */
  fraccionDePiso: 0.66,
  /** Cuánto sobresale el montón por encima del borde. */
  rebose: 0.09,
} as const;

export function pisoDeBatea(h: number): number {
  return Math.max(BATEA.rueda * 2 + 0.05, h * BATEA.fraccionDePiso);
}

export function cotasDeBatea(w: number, d: number, h: number) {
  const piso = pisoDeBatea(h);
  return {
    piso,
    y: piso + 0.016,
    ancho: Math.max(0.1, w - BATEA.estrechamiento * 2),
    fondo: Math.max(0.1, d - BATEA.estrechamiento * 2),
    altoLibre: Math.max(0.08, h - piso + BATEA.rebose),
  };
}

/* ── El stand de frutas y verduras ───────────────────────────────────────────
   La ficha del fabricante da una ISLA DE DOS CARAS, y eso cambia el mueble
   entero:

   · **Dos caras.** Una espina central, y a cada lado sus escalones. Un lado
     solo, con paneles ciegos mirando al pasillo, desperdicia la mitad del
     frente vendible — que es exactamente lo que se le está vendiendo al
     proveedor.
   · **La cubierta es de MADERA y es la superficie dominante.** Un plano ancho
     inclinado que corre todo el largo, y los cajones apoyados encima en fila.
   · **Los cajones van llenos y rebosados**, en una hilera apretada. Con una
     capa de fruta en el fondo, la pared del cajón la tapa y el mueble se ve
     vacío desde el pasillo.
   · **Riel de precios en el filo de cada escalón** y **peine de pinzas arriba**,
     sobre el respaldo del escalón alto. Es lo que remata el mueble.
   · **La estructura es negra y baja**: zócalo y perfiles. Cuatro postes
     asomando por encima de las cubiertas es lo que lo hacía leer como andamio.
*/

export const STAND_FRUTAS = {
  /** Inclinación de la cubierta hacia el cliente, en radianes. */
  caida: (15 * Math.PI) / 180,
  /** El cajón de cosecha que se apoya en la cubierta. */
  cajon: { alto: 0.15, largo: 0.42, luz: 0.015, pared: 0.013 },
  /** Espesor de la cubierta de madera y del riel de precios del filo. */
  cubierta: 0.03,
  porta: 0.055,
  /** Qué fracción del fondo de la bandeja ocupa el cajón. Lo que sobra es la
   *  banda de madera que queda a la vista delante de la fila. */
  fraccionDeCajon: 0.68,
  /** Zócalo negro y alto de la espina central sobre el escalón alto. */
  zocalo: 0.11,
  respaldo: 0.16,
  /** Reparto del alto: el escalón bajo y el alto, como fracción del total. */
  escalonBajo: 0.52,
  escalonAlto: 0.8,
} as const;

/** Hasta dónde llega la ESTRUCTURA de la isla: el remate de la espina, donde
 *  se prende el peine de pinzas de precio.
 *
 *  Existe como cuenta aparte para que se pueda afirmar lo que importa: que la
 *  estructura queda POR DEBAJO del alto del mueble. Cuatro postes subiendo
 *  hasta `h` por encima de las cubiertas es lo que hacía leer el stand como un
 *  andamio, y en la ficha no hay nada por arriba salvo el peine. */
export function alturaDeEspina(h: number): number {
  // Acotado al alto del mueble. Sin el tope, `0,8·h + 0,16` pasa de `h` en
  // cuanto el mueble mide menos de 80 cm: la espina y su peine de precios
  // asomaban POR ENCIMA del alto declarado, y ese alto es el que usan la
  // revisión de choques y el plano. Un mueble más alto que su propia ficha es
  // un error de datos, no de dibujo.
  return Math.min(h * STAND_FRUTAS.escalonAlto + STAND_FRUTAS.respaldo, h - 0.03);
}

export interface BandejaDeStand {
  /** Altura del plano de apoyo, antes de inclinar. */
  y: number;
  ancho: number;
  fondo: number;
  /** Z del centro de la bandeja. */
  z: number;
  /** Inclinación, con el signo del lado al que cae. */
  caida: number;
  /** Hacia qué pasillo mira: -1 es el frente (-Z), +1 el otro. */
  lado: 1 | -1;
  /** Cuánto se amontona dentro del cajón. */
  altoLibre: number;
  /** Cuántos cajones entran a lo ancho. */
  cajones: number;
  /** Fondo INTERIOR del cajón y cuánto está corrido respecto del centro de la
   *  bandeja.
   *
   *  Van acá y no dentro del componente porque el que vuelca la fruta necesita
   *  exactamente los mismos números. Estaban repetidos, y al achicar el cajón
   *  para dejar ver la banda de madera sólo se corrigió una de las dos copias:
   *  la fruta siguió usando el fondo entero de la bandeja, sin correr, y se
   *  salía del cajón por el borde de abajo. */
  cajonFondo: number;
  cajonZ: number;
}

/** Los cuatro escalones de una isla de frutas: dos por cara, el bajo adelante
 *  y el alto contra la espina. Devuelve descripciones y no geometría, igual
 *  que el mural de vegetales, para que el producto lo dibuje el mismo
 *  `VolcadoDeProducto` que usan los demás muebles de volcado. */
export function bandejasDeStand(w: number, d: number, h: number): BandejaDeStand[] {
  const ancho = Math.max(0.1, w - 0.08);
  // Cada cara se lleva la mitad del fondo, menos el espesor de la espina.
  const porCara = Math.max(0.16, (d - 0.06) / 2);
  const fondo = Math.max(0.12, porCara / 2);
  const cajones = Math.max(1, Math.floor(ancho / (STAND_FRUTAS.cajon.largo + STAND_FRUTAS.cajon.luz)));
  // El cajón va lleno y algo rebosado: con una capa en el fondo, la pared lo
  // tapa y el mueble se ve vacío. Es el mismo defecto que tenía la batea.
  const altoLibre = STAND_FRUTAS.cajon.alto * 1.15;
  // El cajón no cubre la bandeja entera: en la ficha queda una banda de madera
  // a la vista delante de la fila, y es la que hace que el mueble se lea como
  // frutería de tablero y no como una hilera de cajones flotando. Por eso el
  // cajón es más corto que la bandeja y está corrido hacia el fondo.
  const cajonFondo = fondo * STAND_FRUTAS.fraccionDeCajon;

  const caras: (1 | -1)[] = [-1, 1];
  const comun = { ancho, fondo, altoLibre, cajones, cajonFondo };
  return caras.flatMap((lado) => [
    {
      y: h * STAND_FRUTAS.escalonBajo,
      z: lado * (porCara - fondo / 2),
      caida: STAND_FRUTAS.caida * lado,
      cajonZ: -lado * ((fondo - cajonFondo) / 2),
      lado, ...comun,
    },
    {
      y: h * STAND_FRUTAS.escalonAlto,
      z: lado * (fondo / 2 + 0.02),
      caida: STAND_FRUTAS.caida * lado,
      cajonZ: -lado * ((fondo - cajonFondo) / 2),
      lado, ...comun,
    },
  ]);
}

/* ── El mostrador de servicio al cliente ─────────────────────────────────────
   Devoluciones, reclamos, información. Contra las fichas de dos fabricantes de
   mobiliario comercial, lo que lo identifica es UNA cosa y no la teníamos:

   · **Tiene DOS NIVELES.** Abajo, el plano de trabajo del que atiende —donde
     está el monitor y donde se escribe—; encima y hacia el cliente, la REPISA
     DE ATENCIÓN, más alta, donde el cliente apoya, firma y deja lo que trae.
     Ese escalón es lo que separa un mostrador de atención de una tapa lisa
     sobre un cajón, que es como se veía el nuestro.
   · Tapas oscuras con bocel redondeado sobre cuerpo claro de laminado: el
     contraste es lo que se ve desde el pasillo.
   · Zócalo oscuro retranqueado, y cajonera con puerta del lado del que
     atiende. Del lado del cliente el frente es ciego.
   · Y el TRAMO BAJO accesible, que ya estaba y es lo único que el modelo viejo
     tenía bien: un tramo del frente a 0,86 m para atender a alguien sentado.
     Sale de la norma de accesibilidad (34"), no de una fracción inventada. */

/* ── El puesto de impulso ────────────────────────────────────────────────────
   El mostrador chico de la promotora: degustación, impulso de una marca un
   sábado. Las cotas son las de la ficha de un counter de aluminio que se
   vende en Colombia (Grupo SRM, ES-MC-8040-C: 0,80 × 0,40, superficie a 1,00
   y cenefa hasta 2,00), dichas acá con palabras propias. */

export const PUESTO_IMPULSO = {
  /** Alto de la superficie donde la promotora apoya lo que ofrece. */
  superficie: 1.0,
  /** La tapa: una lámina con un vuelo chico sobre el frente. */
  tapa: { espesor: 0.025, vuelo: 0.015 },
  /** El zócalo, retranqueado. */
  zocalo: { alto: 0.06, retranqueo: 0.02 },
  /** La cenefa de arriba —el cartel de la marca— y lo que la sostiene. */
  cenefa: { alto: 0.3, espesor: 0.02 },
  mastil: 0.025,
} as const;

/** Dónde va cada cosa de un puesto de impulso de `w × d × h`. Con un alto
 *  menor que la superficie más la cenefa, la superficie baja: nunca queda
 *  la cenefa encima del mostrador. */
export function cotasDePuestoDeImpulso(w: number, d: number, h: number) {
  const cenefaDesde = Math.max(0.3, h - PUESTO_IMPULSO.cenefa.alto);
  const superficie = Math.min(PUESTO_IMPULSO.superficie, cenefaDesde - 0.2);
  const cuerpo = Math.max(0.1, superficie - PUESTO_IMPULSO.tapa.espesor - PUESTO_IMPULSO.zocalo.alto);
  return {
    superficie,
    cuerpo,
    cenefaDesde,
    /** Los mástiles, en las esquinas de atrás. */
    xMastil: Math.max(0.02, w / 2 - 0.04),
    zMastil: Math.max(0, d / 2 - 0.04),
    /** El frente del cuerpo, donde va impresa la marca. */
    frente: { ancho: Math.max(0.05, w - 0.04), alto: Math.max(0.05, cuerpo - 0.04) },
  };
}

export const SERVICIO = {
  /** Alto del plano de trabajo del que atiende, como fracción del total. */
  fraccionDeTrabajo: 0.7,
  /** La repisa alta de atención: cuánto vuela hacia el cliente y su canto. */
  repisa: { vuelo: 0.18, espesor: 0.045, radio: 0.05 },
  /** El tramo bajo accesible: alto de norma y qué parte del frente ocupa. */
  accesible: { alto: 0.86, fraccion: 0.3 },
  /** Espesor de las tapas y radio de sus esquinas. */
  tapa: { espesor: 0.045, radio: 0.06 },
  /** Zócalo oscuro retranqueado. */
  zocalo: 0.1,
  /** Cajonera del lado del que atiende. */
  cajones: 2,
  /** El cartel colgante: es como se reconoce el mueble desde el pasillo. */
  cartel: { alto: 0.28, fondo: 0.05, poste: 0.028, sobre: 0.4 },
} as const;

export interface CotasDeServicio {
  /** Alto del plano de trabajo del que atiende. */
  trabajo: number;
  /** Alto de la repisa de atención, del lado del cliente. */
  repisa: number;
  /** Fondo de la repisa y Z de su centro. */
  fondoDeRepisa: number;
  zDeRepisa: number;
  /** El tramo bajo accesible: dónde empieza, cuánto mide y a qué altura. */
  anchoAccesible: number;
  xAccesible: number;
  altoAccesible: number;
  /** El tramo alto: el resto del frente. */
  anchoAlto: number;
  xAlto: number;
  /** Dónde arranca el cartel colgante. */
  yCartel: number;
}

export function cotasDeServicio(w: number, d: number, h: number): CotasDeServicio {
  const trabajo = entre(h * SERVICIO.fraccionDeTrabajo, 0.6, h - 0.12);
  const fondoDeRepisa = entre(SERVICIO.repisa.vuelo, 0.1, d * 0.45);
  const anchoAccesible = entre(w * SERVICIO.accesible.fraccion, 0.35, w * 0.45);
  const anchoAlto = Math.max(0.3, w - anchoAccesible);

  return {
    trabajo,
    repisa: h,
    fondoDeRepisa,
    // La repisa vuela hacia el CLIENTE, que es -Z.
    zDeRepisa: -d / 2 + fondoDeRepisa / 2,
    anchoAccesible,
    xAccesible: -w / 2 + anchoAccesible / 2,
    // Nunca por encima del propio mostrador: es un tramo BAJO.
    altoAccesible: Math.min(SERVICIO.accesible.alto, h - 0.1),
    anchoAlto,
    xAlto: w / 2 - anchoAlto / 2,
    yCartel: h + SERVICIO.cartel.sobre,
  };
}

/* ── El exhibidor de piso: una ESTIBA con mercancía encima ───────────────────
   No es un mueble impreso con bandejas: es una TARIMA DE MADERA plantada en el
   pasillo con el producto apilado arriba. Lo confirma el propio catálogo —la
   huella del tipo es 1,20 × 0,80 m, que es exactamente la medida de una estiba
   estándar— y el alto de 1,40 es la tarima más la torre de mercancía.

   Es el exhibidor más común de una promoción: llega el camión, se baja la
   estiba entera y se planta en el pasillo. Por eso lo que se le alquila a la
   marca es la POSICIÓN, no un mueble.

   Las cotas son las de la tarima de verdad: 144 mm de alto, tablas de 22 mm y
   travesaños de 100 mm entre la cubierta y el piso. */

export const ESTIBA = {
  /** Alto total de la tarima. */
  alto: 0.144,
  /** Espesor de las tablas de la cubierta y del piso. */
  tabla: 0.022,
  /** Ancho de una tabla. */
  anchoDeTabla: 0.1,
  /** Cuántas tablas lleva la cubierta y cuántas el piso, como máximo: una
   *  tarima de 1,20 × 0,80 lleva cinco arriba y tres abajo. Se recortan si la
   *  huella es más chica — con las cinco a la fuerza sobre 60 cm de fondo las
   *  tablas se pisan y la cubierta queda maciza, que es justo lo contrario de
   *  lo que hace que se lea «estiba». */
  tablasArriba: 5,
  tablasAbajo: 3,
  /** La luz mínima entre tabla y tabla de la cubierta. Es lo que hace que se
   *  vea el enlistonado y no una tapa. */
  luzDeTabla: 0.035,
  /** Los travesaños que separan cubierta y piso, y dejan entrar la uña del
   *  montacargas. */
  travesano: { ancho: 0.1, cuantos: 3 },
  /** Alto de una capa de mercancía cuando todavía no se sabe qué se apila:
   *  es el que usa el arte del proveedor para rebanarse por tendido. */
  capa: 0.3,
  /** Lo que separa un tendido del siguiente: la lámina de cartón o el film.
   *  Milímetros, no centímetros — una estiba se apila AL RAS.
   *
   *  Acá estuvo el defecto que se vio en pantalla: las capas se repartían en
   *  pasos de 30 cm nominales y encima de cada una se paraba el empaque que
   *  entrara, así que una caja de galletas de 19 cm dejaba 11 cm de aire y la
   *  torre salía flotando en pisos separados. Una estiba no tiene estantes:
   *  cada tendido se apoya sobre el de abajo. */
  separacion: 0.006,
} as const;

/** Un tendido de mercancía sobre la tarima. */
export interface CapasDeEstiba {
  /** Alturas de apoyo de cada tendido, de abajo hacia arriba. */
  capas: number[];
  /** Cuánto sube un tendido respecto del de abajo. */
  paso: number;
  /** Hasta dónde llega la torre. */
  techo: number;
}

/**
 * Cómo se apila una torre de `altoDeCapa` sobre una cubierta a `cubierta`, sin
 * pasarse del alto `h` del espacio contratado.
 *
 * Los tendidos van pegados —`paso` es el alto del empaque más la lámina que lo
 * separa del de arriba—, así que la cuenta es cuántos ENTEROS entran y no cómo
 * repartir el alto disponible: media caja no se apila, y una torre que llega
 * justo al tope declarado del mueble es una torre inventada.
 */
export function capasDeEstiba(cubierta: number, h: number, altoDeCapa: number): CapasDeEstiba {
  const paso = Math.max(0.05, altoDeCapa) + ESTIBA.separacion;
  const cuantas = Math.max(1, Math.floor((h - cubierta) / paso));
  return {
    capas: Array.from({ length: cuantas }, (_, i) => cubierta + i * paso),
    paso,
    // Nunca por encima del alto del espacio: ese alto es el que mira el
    // chequeo de choques y el que se le cobra a la marca.
    techo: Math.min(cubierta + cuantas * paso, h),
  };
}

export interface CotasDeEstiba extends CapasDeEstiba {
  /** Alto de la cara de arriba de la tarima: donde apoya la mercancía. */
  cubierta: number;
  /** Huella útil de la mercancía sobre la tarima. */
  ancho: number;
  fondo: number;
  /** Posición de las tablas de la cubierta y del piso, a lo ancho del fondo. */
  zDeTablas: number[];
  zDePiso: number[];
  /** Posición de los travesaños, a lo largo. */
  xDeTravesanos: number[];
}

/** Las tablas repartidas a lo largo del fondo, sin pisarse y dejando luz. */
function enlistonado(cuantas: number, d: number): number[] {
  const n = Math.max(
    2,
    Math.min(cuantas, Math.floor(d / (ESTIBA.anchoDeTabla + ESTIBA.luzDeTabla))),
  );
  return Array.from(
    { length: n },
    (_, i) => -d / 2 + ESTIBA.anchoDeTabla / 2 + (i * (d - ESTIBA.anchoDeTabla)) / (n - 1),
  );
}

/**
 * Las cotas de la estiba: la tarima, y la torre que se le apila encima.
 *
 * `altoDeCapa` es el alto del empaque que se va a apilar. Sin ese dato —el
 * caso del arte del proveedor, que se rebana por tendido antes de saber qué
 * producto va— cae en el tendido nominal de `ESTIBA.capa`.
 */
export function cotasDeEstiba(w: number, d: number, h: number, altoDeCapa?: number): CotasDeEstiba {
  const cubierta = Math.min(ESTIBA.alto, h * 0.3);
  const torre = capasDeEstiba(cubierta, h, altoDeCapa ?? ESTIBA.capa);

  // La mercancía se apila AL RAS de la tarima, no centrada con aire alrededor:
  // una estiba de promoción viene cargada hasta el filo.
  const ancho = Math.max(0.1, w - 0.04);
  const fondo = Math.max(0.1, d - 0.04);

  const nV = Math.max(2, ESTIBA.travesano.cuantos);
  const xDeTravesanos = Array.from(
    { length: nV },
    (_, i) => -w / 2 + ESTIBA.travesano.ancho / 2 + (i * (w - ESTIBA.travesano.ancho)) / (nV - 1),
  );

  return {
    ...torre,
    cubierta,
    ancho,
    fondo,
    zDeTablas: enlistonado(ESTIBA.tablasArriba, d),
    zDePiso: enlistonado(ESTIBA.tablasAbajo, d),
    xDeTravesanos,
  };
}

/* ── El hablador del porta-precios ───────────────────────────────────────────
   El hablador (la etiqueta de precio) cuelga de la tira del porta-precios. El
   producto en prueba lleva el suyo, y va HIJO del grupo de la fila
   (`ProductoDePrueba`): se inclina con el entrepaño. Para eso hace falta saber
   dónde queda la tira en esas coordenadas, y la tira la arma cada mueble a su
   modo. Una sola cuenta, con las constantes de cada uno. */

/** Dónde queda la tira del porta-precios de una fila, en las coordenadas del
 *  grupo de la fila de `ProductoDePrueba` (origen en el plano de montaje de
 *  la cara, `y = 0` en el plano de apoyo, el pasillo hacia −Z): la altura de
 *  su centro, la `z` de su cara más adelantada (el borde de su caja) y su alto. */
export function labioDeFila(tipo: string, venta: VentaDeMueble, fila: number): { y: number; z: number; alto: number } {
  const cara = venta.caras[0];
  const apoyo = venta.filas.alturas[fila] + (venta.sobreApoyo ?? 0);
  switch (tipo) {
    case "nevera_refrescos":
    case "nevera_puertas": {
      // NeveraReal: la tira en [0, nivel − alto/2 − portaBaja, −d/2 +
      // fondoPuerta + portaAdentro] del mueble, y la cara en z = (d − fp)/2.
      const d = cara.montaje * 2 + NEVERA.fondoPuerta;
      const z = -d / 2 + NEVERA.fondoPuerta + NEVERA.portaAdentro;
      return { y: venta.filas.alturas[fila] - NEVERA.portaBaja - apoyo, z: z - cara.montaje, alto: PORTA_PRECIOS.alto };
    }
    case "robatope": {
      // RobatopeMesh: el riel en [0, repisa + rielSube, −(d/2 − rielAdentro)]
      // con `rielEspesor` de espesor, dentro del mismo grupo girado; la cara
      // en z = (d − retiroFondo)/2 y el apoyo medio espesor sobre la tabla.
      const d = cara.montaje * 2 + ROBATOPE.retiroFondo;
      const repisa = venta.filas.alturas[fila] - ROBATOPE.espesorRepisa / 2;
      const z = -(d / 2 - ROBATOPE.rielAdentro) - ROBATOPE.rielEspesor / 2;
      return { y: repisa + ROBATOPE.rielSube - apoyo, z: z - cara.montaje, alto: ROBATOPE.rielAlto };
    }
    default: {
      // Góndola y punta (CaraDeEstanteria): la tira centrada en el plano de
      // apoyo, en z = −(fondo + saliente); su sección va de 0 a 8 mm hacia
      // atrás desde ahí (`geometriaPortaPrecios`), así que su caja empieza
      // justo en esa z.
      return { y: 0, z: -(venta.filas.fondos[fila] + PORTA_PRECIOS.saliente), alto: PORTA_PRECIOS.alto };
    }
  }
}
