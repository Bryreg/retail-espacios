/**
 * Dónde va cada unidad de producto sobre un mueble: el relleno por rubro y la
 * prueba del producto del proveedor.
 *
 * ## Por qué es puro
 *
 * Sin React ni three: sólo `medidas.ts` y `producto.ts`. La cuenta de frentes
 * es lo que se discute en la reunión —«entran diez por entrepaño»—, así que
 * tiene que poder CORRERSE en una prueba y no sólo leerse. El relleno por rubro
 * vivía adentro de `ProductoEnMueble` mezclado con las matrices de three; acá
 * queda la cuenta y allá sólo el dibujo.
 *
 * (No se llama `acomodo.ts` porque ya existe `utils/acomodar.ts`, que es otra
 * cosa: dónde cae una copia de un mueble en el plano.)
 *
 * ## Las dos cosas que se paran sobre un entrepaño
 *
 * - **El relleno por rubro** (`rellenoPorRubro`): lo VENDIDO, dibujado con el
 *   empaque del rubro del contrato. Coordenadas del mueble, planas.
 * - **La prueba del proveedor** (`unidadesDePrueba`): SU producto, con su
 *   medida real, en la cara entera o en los entrepaños elegidos. Coordenadas
 *   de la CARA —mira a −Z— y de cada fila: quien lo dibuja lo cuelga de grupos
 *   anidados que heredan la transformación del mueble, que es lo único que
 *   funcionó para geometría nueva (ver ESTADO.md, «El producto estaba pintado
 *   al fondo del mueble»).
 *
 * La regla entre las dos es «arte o relleno» por (cara, entrepaño): donde hay
 * prueba no va relleno (`cubiertas`), y en el resto del mueble lo vendido a
 * otros sigue viéndose como vendido.
 */
import type { FilasDeProducto, Vano, VentaDeMueble } from "./medidas";
import { PARANTE, ZONA_DE_SLOTS, alRasDeRanura } from "./medidas";
import { acomodar, colorDeRubro, empaqueQueEntra, entraDeFondo, hashTexto, RETIRO_AL_FRENTE } from "./producto";
import type { Empaque } from "./producto";

/** Lo que hace falta de un slot. Se declara acá y no se importa `ShelfSlot`
 *  entero para que la cuenta siga siendo geometría y no dependa del modelo
 *  comercial del editor. */
export interface SlotDeProducto {
  id: string;
  /** Fracción del ancho del mueble, de 0 a 1, desde la punta izquierda. */
  x: number;
  w: number;
  /** Fracción de la franja de slots, de 0 a 1, desde abajo. */
  y: number;
  h: number;
  status: string;
  brandCategory?: string;
}

/** Un espacio con contrato encima. `reserved` también: está comprometido, y
 *  quien mira el plano necesita verlo tomado. */
export const VENDIDO = new Set(["occupied", "reserved"]);

/** Cuántas unidades se ponen hacia el fondo detrás de cada frente.
 *
 *  En tienda hay las que quepan, pero desde afuera sólo se ve la primera: las
 *  de atrás quedan tapadas por su propio frente. Se ponen dos porque desde
 *  arriba —que es como se mira el plano la mayor parte del tiempo— una sola
 *  deja el entrepaño con aire raro, y la tercera ya no se ve desde ningún
 *  lado y sólo cuesta instancias. */
const PROFUNDIDAD_VISIBLE = 2;
/** Y cuántas en un mueble que se contrata completo. Más, porque es chico y se
 *  mira desde todos lados: lo que en una góndola queda tapado por su propio
 *  frente, acá se ve. */
const PROFUNDIDAD_DE_MUEBLE_ENTERO = 5;

/** El margen con que un entrepaño cuenta como adentro de la franja de un
 *  espacio: ±1 mm, para que el redondeo al paso de ranura no lo deje afuera. */
const HOLGURA_DE_FRANJA = 0.001;

/**
 * Qué entrepaños tapa la prueba en cada cara, para que el relleno por rubro no
 * se dibuje debajo. Indexado por cara (en el orden de `caras`): `"todas"` es la
 * cara entera, una lista son esos entrepaños, y `null`/ausente es que esa cara
 * no tiene prueba.
 */
export type Cubiertas = readonly ("todas" | readonly number[] | null | undefined)[];

/** Una clave primitiva para las dependencias de un `useMemo`: el arreglo de
 *  cubiertas se rearma en cada render y por identidad nunca sería igual. */
export function claveDeCubiertas(c: Cubiertas | undefined): string {
  if (!c) return "";
  return c.map((x, i) => `${i}:${x === "todas" ? "todas" : x && x.length ? x.join(",") : "-"}`).join("|");
}

/** Qué entrepaños tapa la prueba en cada cara de un mueble, para el relleno
 *  por rubro: arte o relleno vale por (cara, entrepaño). La pintura de las
 *  caras del editor (`FacePaint`) lleva la prueba de la A y de la B; un mural
 *  tiene una sola cara.
 *
 *  Vive acá y no en el editor para CORRERLA en `probar-muebles`: una guarda
 *  que sólo buscaba el texto `cubiertas={cubiertasDe(` seguía en verde con
 *  esta función devolviendo siempre `[null, null]`, y el relleno de Nutresa
 *  se dibujaba debajo de los vasos de Alpina. */
export function cubiertasDe(
  pintura: {
    pruebaA?: { donde: "todas" | readonly number[] } | null;
    pruebaB?: { donde: "todas" | readonly number[] } | null;
  } | null | undefined,
  esMural: boolean,
): Cubiertas {
  return [pintura?.pruebaA?.donde ?? null, esMural ? null : (pintura?.pruebaB?.donde ?? null)];
}

function estaCubierta(c: Cubiertas | undefined, cara: number, fila: number): boolean {
  const x = c?.[cara];
  if (!x) return false;
  return x === "todas" || x.includes(fila);
}

/** La franja vertical de un espacio, en metros desde el piso del mueble. */
function franjaDelEspacio(slot: Pick<SlotDeProducto, "y" | "h">, franja: number) {
  return {
    yBajo: ZONA_DE_SLOTS.desde + slot.y * franja,
    yAlto: ZONA_DE_SLOTS.desde + (slot.y + slot.h) * franja,
  };
}

/**
 * Los entrepaños (índices de fila) que caen dentro de un espacio vendido.
 *
 * Es la regla con que el relleno decide qué producto es de qué contrato: el
 * apoyo del entrepaño tiene que caer DENTRO de la franja del slot, con ±1 mm.
 * La usa también el panel que ofrece «Por entrepaño», para marcar «vendido»
 * los entrepaños que ya tienen dueño — sin nombrarlo.
 */
export function entrepanosDelEspacio(
  slot: Pick<SlotDeProducto, "y" | "h">, filas: FilasDeProducto, franja: number,
): number[] {
  const { yBajo, yAlto } = franjaDelEspacio(slot, franja);
  const fuera: number[] = [];
  for (let i = 0; i < filas.rows; i++) {
    const apoyo = filas.alturas[i];
    if (apoyo < yBajo - HOLGURA_DE_FRANJA || apoyo > yAlto + HOLGURA_DE_FRANJA) continue;
    fuera.push(i);
  }
  return fuera;
}

export interface PosicionDeRelleno {
  /** Índice de la cara en `caras`. */
  cara: number;
  fila: number;
  x: number;
  y: number;
  z: number;
}

export interface GrupoDeRelleno {
  /** Una clave por empaque y color: cada grupo es UNA llamada de dibujo. */
  clave: string;
  color: string;
  /** El rubro del contrato (texto libre): elige la paleta del relleno de
   *  venta (`paletaDeRubro`). Nunca se dibuja. */
  rubro?: string;
  empaque: Empaque;
  posiciones: PosicionDeRelleno[];
}

/**
 * Un mueble contratado ENTERO: el rubro de su relleno y si se llena en
 * profundidad. `hondo` (lo de siempre, el robatope y los exhibidores de
 * `ProductoEnRepisas`) llena `PROFUNDIDAD_DE_MUEBLE_ENTERO` filas hacia el
 * fondo, porque es chico y se mira desde todos lados. La góndola y la punta
 * contratadas enteras (`rubroDeContratoEntero`, sólo en venta) van con
 * `hondo: false`: las dos filas que se ven, como lo vendido por slot. Con
 * cinco, la góndola de Bimbo eran 1.635 cajas en el cuadro de bolsa-4, tres
 * de cada cinco tapadas por su propio frente.
 */
export interface VendidoEntero {
  rubro?: string;
  /** `false`: dos filas hacia el fondo. Ausente o `true`: cinco
   *  (`PROFUNDIDAD_DE_MUEBLE_ENTERO`), lo de siempre. `"todo"`: hasta el fondo
   *  —las filas que entren—, que es como viene cargada una ESTIBA de verdad:
   *  con cinco, la de 1,20 × 1,00 mostraba más de media tarima vacía desde
   *  arriba. Sólo la piden las estibas colocadas desde un modelo del catálogo
   *  (`IslaMesh`): una sin modelo, de un plano de antes, se sigue dibujando
   *  igual. */
  hondo?: boolean | "todo";
}

export interface EntradaDeRelleno {
  /** Ancho total del mueble, para pasar los slots de fracción a metros. */
  anchoTotal: number;
  filas: FilasDeProducto;
  vanos: Vano[];
  caras: readonly { montaje: number; hacia: 1 | -1 }[];
  /** Alto de la franja donde viven los slots. */
  franja: number;
  slots?: SlotDeProducto[];
  /** El mueble se vende ENTERO (ver `ProductoEnMueble`). */
  vendidoEntero?: VendidoEntero;
  /** Lo que tapa la prueba del proveedor, por cara. */
  cubiertas?: Cubiertas;
}

/**
 * El relleno por rubro: qué empaque va y dónde, para cada espacio vendido.
 *
 * Es el lazo que vivía en `ProductoEnMueble` TAL CUAL —mismo orden, mismas
 * cuentas—, con una sola novedad: una (cara, entrepaño) cubierta por la prueba
 * del proveedor se saltea. Así, en una góndola doble probada en la cara A, la
 * cara B conserva sus slots vendidos.
 *
 * Las coordenadas son las planas del mueble: `y = apoyo + alto/2` y
 * `z = montaje + hacia·desdeElFilo`, sin giro.
 */
export function rellenoPorRubro({
  anchoTotal, filas, vanos, caras, franja, slots, vendidoEntero, cubiertas,
}: EntradaDeRelleno): GrupoDeRelleno[] {
  // Un mueble que se vende entero es un solo espacio que toma todo el
  // frente. Se arma acá y no en cada mueble para que el camino del producto
  // siga siendo uno: lo que cambia es de dónde sale el contrato, no cómo se
  // acomoda el producto encima.
  const espacios: SlotDeProducto[] = vendidoEntero
    ? [{ id: "todo", x: 0, w: 1, y: 0, h: 1, status: "occupied", brandCategory: vendidoEntero.rubro }]
    : (slots ?? []);
  if (espacios.length === 0 || filas.rows <= 0) return [];

  const porClave = new Map<string, GrupoDeRelleno>();

  for (const slot of espacios) {
    if (!VENDIDO.has(slot.status)) continue;

    const color = colorDeRubro(slot.brandCategory);

    // El slot, pasado a metros: qué tramo del ancho toma y qué altura cubre.
    const x0 = slot.x * anchoTotal - anchoTotal / 2;
    const x1 = (slot.x + slot.w) * anchoTotal - anchoTotal / 2;
    const { yBajo, yAlto } = franjaDelEspacio(slot, franja);

    for (let i = 0; i < filas.rows; i++) {
      const apoyo = filas.alturas[i];
      // El entrepaño tiene que caer DENTRO del slot para que su producto
      // sea de este contrato y no del de al lado. En un mueble que se vende
      // entero no hay «el de al lado»: todas las repisas son del mismo
      // contrato, así que la franja no las recorta. (Es la regla de
      // `entrepanosDelEspacio`, escrita acá con los mismos números.)
      if (!vendidoEntero && (apoyo < yBajo - HOLGURA_DE_FRANJA || apoyo > yAlto + HOLGURA_DE_FRANJA)) continue;

      const libre = filas.alturas[i + 1] - apoyo;
      const fondoEntrepano = filas.fondos[i];
      // El formato se elige POR ENTREPAÑO: la botella de 1,5 L entra abajo y
      // arriba va la personal, igual que en tienda.
      const e = empaqueQueEntra(slot.brandCategory, libre);
      if (!e) continue;
      const clave = `${e.forma}|${e.ancho}|${e.alto}|${e.fondo}|${color}`;

      for (const vano of vanos) {
        // El producto se para dentro del vano, nunca encima de un parante.
        const vx0 = Math.max(x0, vano.x - vano.ancho / 2);
        const vx1 = Math.min(x1, vano.x + vano.ancho / 2);
        const util = vx1 - vx0;
        if (util <= 0) continue;

        const acomodo = acomodar(util, fondoEntrepano, libre, e);
        if (acomodo.frentes === 0) continue;

        // Centrado en el tramo, que es como se repone: el hueco sobrante se
        // reparte a los costados y no queda todo de un lado.
        const desdeX = (vx0 + vx1) / 2 - acomodo.ocupado / 2 + e.ancho / 2;
        // Un mueble que se vende entero se llena en profundidad: es chico,
        // se mira desde todos lados y está contratado completo. Con dos
        // filas, un exhibidor de 80 cm de fondo muestra siete centímetros de
        // producto y setenta de estante vacío.
        const fondos = vendidoEntero?.hondo === "todo" ? acomodo.filas : Math.min(
          acomodo.filas, vendidoEntero && vendidoEntero.hondo !== false ? PROFUNDIDAD_DE_MUEBLE_ENTERO : PROFUNDIDAD_VISIBLE,
        );

        const grupo = porClave.get(clave) ?? { clave, color, rubro: slot.brandCategory, empaque: e, posiciones: [] };
        if (!porClave.has(clave)) porClave.set(clave, grupo);

        caras.forEach((cara, c) => {
          // Lo que tapa la prueba del proveedor no lleva relleno: arte o
          // relleno, nunca las dos cosas en el mismo entrepaño.
          if (estaCubierta(cubiertas, c, i)) return;
          for (let f = 0; f < acomodo.frentes; f++) {
            for (let p = 0; p < fondos; p++) {
              // Desde el filo del entrepaño hacia adentro: el producto se
              // repone AL FRENTE. Un lineal con el producto pegado al fondo
              // y el filo vacío es lo que un supervisor manda a corregir.
              const desdeElFilo =
                fondoEntrepano - RETIRO_AL_FRENTE - e.fondo / 2 - p * acomodo.pasoZ;
              grupo.posiciones.push({
                cara: c,
                fila: i,
                x: desdeX + f * acomodo.pasoX,
                y: apoyo + e.alto / 2,
                z: cara.montaje + cara.hacia * desdeElFilo,
              });
            }
          }
        });
      }
    }
  }

  return [...porClave.values()].filter((g) => g.posiciones.length > 0);
}

// ─── La prueba del producto del proveedor ────────────────────────────────────

/** Un empaque concreto —el del producto que se está probando—, que puede
 *  apilarse o no, y hasta cuántos. `EmpaqueDeArte` lo cumple. */
export type EmpaqueDePrueba = Empaque & { apilable?: boolean; pisosMaximos?: number };

/** Por qué un entrepaño quedó sin producto. Se dice en el panel, con medidas:
 *  «no entra: 6,5 cm» no es lo mismo que «no se eligió». Y el fondo aparte
 *  del ancho: un envase hondo en el robatope salía «no entra de ancho», y
 *  quien negocia buscaba el problema en el lugar equivocado. */
export type MotivoVacio = null | "no-entra-alto" | "no-entra-ancho" | "no-entra-fondo" | "no-elegida";

export interface FilaDePrueba {
  fila: number;
  /** Altura del plano donde apoya el producto, desde el piso del mueble. */
  apoyo: number;
  /** Giro del entrepaño (`rotation={[giro, 0, 0]}`). */
  giro: number;
  /** Alto libre hasta el entrepaño de arriba (o el techo). */
  libre: number;
  /** Fondo útil del entrepaño: con él se dice «no entra de fondo». */
  fondo: number;
  /** Frentes que ENTRAN a lo ancho, sumando los vanos. Se cuentan también en
   *  una fila no elegida —el panel ofrece lo que cabría—, pero sólo las
   *  elegidas llevan unidades. */
  frentes: number;
  /** Cuántas unidades se ven hacia el fondo detrás de cada frente. */
  fondoVisible: number;
  /** Cuántas ENTRAN hacia el fondo: el 3D dibuja hasta tres (`fondoVisible`),
   *  pero el entrepaño de 45 cm lleva seis vasos de fondo, y «¿cuántos me
   *  entran?» se contesta con éste. */
  fondoTotal: number;
  /** Cuántas unidades entran en el entrepaño: frentes × fondo × pisos, vano
   *  por vano (con `fondoTotal`, no con lo que se dibuja). */
  unidades: number;
  /** Cuántas unidades apiladas, una sobre otra. */
  pisos: number;
  motivo: MotivoVacio;
}

export interface UnidadDePrueba {
  fila: number;
  /** En coordenadas de la FILA: x a lo ancho de la cara, y desde el plano de
   *  apoyo (el centro del envase), z hacia −Z, que es el pasillo. */
  x: number;
  y: number;
  z: number;
  /** Giro del envase sobre su eje vertical, el desorden de quien repone. */
  giroY: number;
  /** Multiplicador de color: lo de atrás, más oscuro. */
  tono: number;
  /** 0 = el frente; 1, 2… hacia el fondo. */
  prof: number;
  piso: number;
  /** Escala vertical (1 si falta): las bolsas de atrás se ASIENTAN 1-2 cm
   *  (`ASIENTO_DE_BOLSA`); la base sigue apoyada en el entrepaño. */
  escalaY?: number;
}

/** Cuánto se asienta una bolsa de atrás (m, entre los dos valores): en
 *  «Tres cuartos» las de atrás asomaban como copias exactas corridas, con
 *  «ARROZ DIANA» repetido arriba de cada repisa —una imagen fantasma—. Con
 *  el giro de ±2° de lo de atrás y su tono (`TONO_POR_FONDO`), quedan detrás
 *  del frente como una bolsa que ya se acomodó. */
export const ASIENTO_DE_BOLSA = [0.01, 0.02] as const;

export interface PruebaAcomodada {
  porFila: FilaDePrueba[];
  unidades: UnidadDePrueba[];
  /** Frentes a la vista sumando todos los entrepaños («40 de frente»). */
  frentesALaVista: number;
}

/** Cuánto sobra arriba de una pila: sin ese aire, la mano que repone no
 *  entra y la pila de arriba toca el entrepaño. */
const AIRE_DE_PILA = 0.02;
/** Pisos como máximo, aunque entren más. Más de tres apilados no los monta
 *  nadie (`pisosMaximos` del empaque lo puede bajar). */
const PISOS_MAXIMOS = 3;
/** Aire de más entre dos botellas ACOSTADAS: el pico de una no puede tocar
 *  la base de la de al lado. Con el aire de siempre (4 mm) el pico quedaba
 *  metido en el culo de la vecina, y la fila se leía como un salchichón. */
const LUZ_DE_ACOSTADA = 0.012;
/** Probabilidad de que un hueco de atrás esté vacío: la reposición de un
 *  día cualquiera. Sólo atrás: el frente se ve lleno, que es lo que se vende. */
const HUECO_DE_ATRAS = 0.05;
/** Cuánto se oscurece cada unidad hacia el fondo (el frente, la segunda, la
 *  tercera). Con un 12 % por fila la crítica midió las tapas de atrás un 12 %
 *  más oscuras que las del frente y no se leía la profundidad: el fondo de un
 *  entrepaño está en la sombra del de arriba, y se ve bastante más oscuro. */
export const TONO_POR_FONDO = [1, 0.82, 0.68] as const;
/** Probabilidad de que una columna quede corrida hacia adentro, y cuánto. */
const COLUMNA_CORRIDA = 0.22;
/** Probabilidad de que una columna (no corrida) quede un poco adelantada, y
 *  cuánto como mucho: dentro del retiro al frente (`RETIRO_AL_FRENTE`, 1 cm)
 *  con el ±3 mm de fondo del desorden encima. */
export const COLUMNA_ADELANTADA = 1 / 6;
export const ADELANTO = 0.004;
/** Con UN solo arte en una cara de más de `CARA_LARGA` (una góndola entera),
 *  la crítica leyó «papel de colgadura»: 75 frentes del mismo Müsli, misma
 *  caja, misma altura, misma alineación. Lo que delata el clonado es la
 *  perfección. Dos cosas lo rompen sin inventar producto:
 *  - el FRENTE CORRIDO: en un (vano, entrepaño), con esta probabilidad, falta
 *    la unidad del frente de una columna (con su pila) y se ve la de atrás,
 *    que ya va más oscura (`TONO_POR_FONDO`). Uno como mucho, y sólo si hay
 *    una de atrás (con una sola de fondo sería un hueco al frente, que es lo
 *    que se descartó: el frente se vende lleno);
 *  - una de cada cuatro cajas gira ±1,5° (las demás ±0,9°, como siempre).
 *  Con surtido no hace falta: los bloques de cada producto ya lo rompen. */
const FRENTE_CORRIDO = 0.35;
/** El tono de la unidad que queda a la vista detrás de un frente corrido:
 *  entre el del frente y el de una de atrás. */
export const TONO_DEL_CORRIDO = 0.92;
const CARA_LARGA = 1.2;
/** La caja que más gira, y cada cuántas (una de cuatro). */
const GIRO_DE_CAJA_SUELTA = 1.5;
const CAJA_SUELTA = 0.25;

/** El tramo de una cara que le toca a un producto del surtido, en
 *  coordenadas de la cara (x a lo ancho). */
export interface TramoDeSurtido { x0: number; x1: number }

/**
 * Los bloques verticales de un surtido: `n` productos del MISMO proveedor
 * repartidos en la cara, en el orden en que se ven desde el pasillo.
 *
 * Es el bloque de marca de cualquier supermercado: cada producto de arriba
 * abajo en su vano, no mezclados. Con un solo arte en una góndola entera la
 * crítica vio «papel de colgadura» (75 frentes del mismo Müsli).
 *
 * - En coordenadas de la cara quien mira desde el pasillo ve +X a su
 *   IZQUIERDA (la UV del envase, `perfiles.ts`): el primero —el principal—
 *   va del lado de +X.
 * - Con tantos vanos como productos o más, cada corte va al parante más
 *   cercano: un producto por vano con 3 y 3, 2+1 con 3 vanos y 2 productos
 *   (el principal se lleva el vano de más). Ningún producto queda sobre un
 *   parante.
 * - Con menos vanos que productos (una punta de un vano), se parte el ancho
 *   en partes iguales: es la única forma de que entren.
 */
export function bloquesDeSurtido(vanos: readonly Vano[], n: number): TramoDeSurtido[] {
  const cuantos = Math.max(1, Math.floor(n));
  if (vanos.length === 0) return [];
  // De izquierda a derecha según quien mira: de +X hacia −X.
  const orden = [...vanos].sort((a, b) => b.x - a.x);
  const izq = (v: Vano) => v.x + v.ancho / 2, der = (v: Vano) => v.x - v.ancho / 2;
  if (cuantos === 1) return [{ x0: der(orden[orden.length - 1]), x1: izq(orden[0]) }];
  if (orden.length >= cuantos) {
    // Los cortes, en número de vanos desde la izquierda: el ideal k·V/n
    // redondeado al parante más cercano (hacia el principal en un empate),
    // sin dejar a nadie sin vano.
    const V = orden.length;
    const cortes: number[] = [0];
    for (let k = 1; k < cuantos; k++) {
      // `Math.round` sube el medio: con 3 vanos y 2 productos el corte va
      // después del 2.º, y el principal se lleva dos.
      const ideal = (k * V) / cuantos;
      cortes.push(Math.max(cortes[k - 1] + 1, Math.min(V - (cuantos - k), Math.round(ideal + 1e-9))));
    }
    cortes.push(V);
    return Array.from({ length: cuantos }, (_, k) => {
      const grupo = orden.slice(cortes[k], cortes[k + 1]);
      return { x0: der(grupo[grupo.length - 1]), x1: izq(grupo[0]) };
    });
  }
  // Menos vanos que productos: partes iguales de punta a punta.
  const desde = izq(orden[0]), hasta = der(orden[orden.length - 1]);
  const paso = (desde - hasta) / cuantos;
  return Array.from({ length: cuantos }, (_, k) => ({ x0: desde - (k + 1) * paso, x1: desde - k * paso }));
}

/** Un generador sembrado (mulberry32): el mismo mueble se ve igual siempre.
 *  Al azar, el producto se reacomodaría solo cada vez que se mueve la cámara
 *  —el plano titila entero— y nadie puede señalar nada. */
export function azarDe(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADO = Math.PI / 180;

/**
 * El rubro con que se rellena un mueble contratado ENTERO cuyos slots están
 * todos libres (la góndola de Bimbo), o `undefined`.
 *
 * Sólo en la pantalla de venta (`venta`): en el editor un mueble así se sigue
 * viendo vacío, como siempre. Y sólo sin slots vendidos: si alguno lo está,
 * el relleno es el de esos slots y lo libre queda vacío (ningún mueble
 * inventa producto donde nadie compró). El estado del mueble es el comercial
 * (el de la base), no el del plano.
 */
export function rubroDeContratoEntero(
  f: { status: string; brandCategory?: string; slots?: readonly { status: string }[] }, venta: boolean,
): string | undefined {
  if (!venta || !VENDIDO.has(f.status)) return undefined;
  if (f.slots?.some((s) => VENDIDO.has(s.status))) return undefined;
  return f.brandCategory ?? "";
}

/** Cuánto varía el tono del relleno neutro de una unidad a otra (±). */
export const VARIACION_DE_RELLENO = 0.06;

/**
 * El tono de cada unidad del relleno neutro en la pantalla de venta: un
 * multiplicador cerca de 1 (±6 %), apenas más cálido o más frío, SEMBRADO por
 * mueble y grupo como todo el desorden —el mismo mueble se ve igual siempre—.
 * Un lineal de cien cajas del mismo color exacto se lee como una pared de
 * bloques; con esto, como mercadería distinta, sin ninguna marca.
 */
export function tonosDelRelleno(semilla: string, n: number): [number, number, number][] {
  const azar = azarDe(hashTexto(`relleno|${semilla}`));
  return Array.from({ length: n }, () => {
    const k = 1 + (azar() * 2 - 1) * VARIACION_DE_RELLENO;
    const t = (azar() * 2 - 1) * VARIACION_DE_RELLENO * 0.4;
    return [k * (1 + t), k, k * (1 - t)];
  });
}

/**
 * Las unidades del producto de prueba sobre UNA cara del mueble.
 *
 * - `donde`: `"todas"` (la cara entera) o los entrepaños elegidos, por índice
 *   de fila desde el piso. Lo libre queda vacío: «ningún mueble inventa
 *   producto».
 * - El empaque es CONCRETO: nunca se cambia por uno más chico del rubro
 *   (`empaqueQueEntra`). Si no entra, el entrepaño queda vacío y se dice por
 *   qué — eso es información para quien negocia, no un hueco a tapar.
 * - Hasta `profundidad` unidades hacia el fondo, y apiladas sólo si la ficha
 *   dice que se apila.
 * - Un desorden mínimo y determinista, sembrado con `semilla`
 *   (`${fixtureId}|${cara}|${arteId}`): un lineal perfecto se lee como render.
 *
 * Todo en coordenadas LOCALES de la cara, que mira a −Z (ESTADO.md,
 * «Sistema de coordenadas»): quien dibuja cuelga cada fila de un grupo en
 * `[0, apoyo, 0]` girado `giro`, adentro del grupo de la cara.
 */
export function unidadesDePrueba({
  venta, empaque, donde, semilla, profundidad = 3, tramo, surtido = false,
}: {
  venta: Pick<VentaDeMueble, "filas" | "vanos" | "sobreApoyo">;
  empaque: EmpaqueDePrueba;
  donde: "todas" | readonly number[];
  semilla: string;
  profundidad?: number;
  /** Con surtido, el tramo de la cara que le toca a ESTE producto
   *  (`bloquesDeSurtido`): cada vano se recorta a él, igual que el relleno
   *  recorta al tramo de un slot. */
  tramo?: TramoDeSurtido;
  /** Es uno de varios productos en la cara: sin frente corrido. */
  surtido?: boolean;
}): PruebaAcomodada {
  const { filas, vanos } = venta;
  const porFila: FilaDePrueba[] = [];
  const unidades: UnidadDePrueba[] = [];
  let frentesALaVista = 0;
  const e = empaque;
  // Una cara larga con UN solo arte se varía (ver `FRENTE_CORRIDO`).
  const anchoDeCara = vanos.length
    ? Math.max(...vanos.map((v) => v.x + v.ancho / 2)) - Math.min(...vanos.map((v) => v.x - v.ancho / 2))
    : 0;
  const variado = !surtido && anchoDeCara > CARA_LARGA;
  // De planta redonda (botella, lata, vaso): girar no la ensancha.
  const redondaEnPlanta = e.forma === "botella" || e.forma === "lata"
    || (e as EmpaqueDePrueba & { envase?: string }).envase === "revolucion";

  for (let i = 0; i < filas.rows; i++) {
    const apoyo = filas.alturas[i] + (venta.sobreApoyo ?? 0);
    const giro = filas.giros?.[i] ?? 0;
    const libre = filas.alturas[i + 1] - filas.alturas[i];
    const fila: FilaDePrueba = {
      fila: i, apoyo, giro, libre, fondo: filas.fondos[i], frentes: 0, fondoVisible: 0, fondoTotal: 0, unidades: 0, pisos: 0, motivo: null,
    };
    porFila.push(fila);

    // Primero lo físico: un entrepaño donde el producto no entra parado se
    // dice así aunque no se haya elegido, porque el panel lo ofrece apagado
    // («no entra: 6,5 cm») en vez de dejar que se elija y salga vacío.
    if (e.alto > libre) { fila.motivo = "no-entra-alto"; continue; }
    const elegida = donde === "todas" || donde.includes(i);

    const pisos = e.apilable
      ? Math.max(1, Math.min(e.pisosMaximos ?? PISOS_MAXIMOS, Math.floor((libre - AIRE_DE_PILA) / e.alto)))
      : 1;
    // Una semilla por fila y no una para toda la cara: elegir otro entrepaño
    // no reacomoda el producto de los demás.
    const azar = azarDe(hashTexto(`${semilla}|${i}`));
    const entre = (a: number) => (azar() * 2 - 1) * a;
    // El desorden de quien repone. Una caja casi no gira (se apoya contra la
    // de al lado); una botella o una lata sí, y es lo que más delata un
    // lineal clonado: cuarenta etiquetas mirando exactamente al frente.
    // Acostada, en cambio, se la deja derecha: girarla la cruza en la rejilla.
    // El vaso también (todo envase torneado, `redondaEnPlanta`): con ±0,9° los
    // 39 Finesse de la nevera miraban todos exactamente al frente, «un patrón
    // repetido» (la crítica de la demo, ronda 2).
    const redondo = (e.forma === "botella" || e.forma === "lata" || redondaEnPlanta) && !e.acostado;
    const giroFrente = (redondo ? 5 : e.acostado ? 0.5 : 0.9) * GRADO;
    const giroAtras = (redondo ? 8 : e.acostado ? 0.5 : 2) * GRADO;
    // Para acomodar, la acostada ocupa un poco más (ver LUZ_DE_ACOSTADA).
    const eAncho = e.acostado && (e.forma === "botella" || e.forma === "lata")
      ? { ...e, ancho: e.ancho + LUZ_DE_ACOSTADA } : e;

    // Lo justo: una botella de 30 cm en 30 cm libres entra (es la cuenta que
    // se negocia), pero parada SOBRE el alambre de la rejilla asomaba la tapa
    // 5 mm por encima de la rejilla de arriba —puntos naranjas en el estante
    // vacío—. Se la hunde lo que sobra, nunca más que lo que la levanta la
    // rejilla: queda dentro del espesor del alambre, abajo y arriba.
    const hundir = Math.min(
      venta.sobreApoyo ?? 0,
      Math.max(0, apoyo + pisos * e.alto - filas.alturas[i + 1]),
    );

    for (const vano of vanos) {
      // El vano ENTERO: la prueba es por entrepaño, no por el tramo de un
      // slot. Con surtido, sólo lo que el tramo de este producto toca.
      const vx0 = Math.max(tramo ? tramo.x0 : -Infinity, vano.x - vano.ancho / 2);
      const vx1 = Math.min(tramo ? tramo.x1 : Infinity, vano.x + vano.ancho / 2);
      if (vx1 - vx0 <= 1e-6) continue;
      const a = acomodar(tramo ? vx1 - vx0 : vano.ancho, filas.fondos[i], libre, eAncho);
      if (a.frentes === 0) continue;
      const desdeX = (tramo ? (vx0 + vx1) / 2 : vano.x) - a.ocupado / 2 + eAncho.ancho / 2;
      const fondoVisible = Math.min(a.filas, profundidad);
      fila.frentes += a.frentes;
      fila.fondoVisible = Math.max(fila.fondoVisible, fondoVisible);
      fila.fondoTotal = Math.max(fila.fondoTotal, a.filas);
      fila.unidades += a.frentes * a.filas * pisos;
      fila.pisos = pisos;
      // Lo que no se eligió dice cuánto entraría, pero no se dibuja.
      if (!elegida) continue;
      // Lo que queda libre detrás de la última unidad visible: hasta ahí se
      // puede correr una columna sin salirse del entrepaño por atrás.
      const libreAtras = Math.max(0, (a.filas - fondoVisible) * a.pasoZ);
      // El frente corrido de este (vano, entrepaño): una columna como mucho,
      // y sólo con algo detrás que se vea.
      const sinFrente = variado && fondoVisible >= 2 && azar() < FRENTE_CORRIDO
        ? Math.floor(azar() * a.frentes) : -1;
      // La luz entre dos unidades vecinas (4 mm): cada una se corre a lo
      // ancho a lo sumo la mitad, MENOS lo que la ensancha su propio giro.
      // Así dos vecinas giradas y corridas una hacia la otra no se cruzan.
      const luz = a.pasoX - eAncho.ancho;

      for (let f = 0; f < a.frentes; f++) {
        // Una columna de cada tanto quedó sin «frentear»: corrida hacia
        // adentro entera, como la deja el comprador que se llevó la primera.
        // Entera, para que la de adelante no se meta en la de atrás.
        const corrida = azar() < COLUMNA_CORRIDA ? Math.min(libreAtras, 0.01 + azar() * 0.01) : 0;
        // Y alguna, al revés, un poco ADELANTADA (la del frente, con su pila):
        // la que acaban de poner. Dentro del retiro al frente, sin tocar el
        // labio.
        const adelantada = !corrida && azar() < COLUMNA_ADELANTADA ? ADELANTO * (0.75 + azar() * 0.25) : 0;
        for (let p = 0; p < fondoVisible; p++) {
          // Un hueco de reposición, sólo atrás y con toda su pila; nunca
          // detrás de un frente corrido (sería un hueco de punta a punta).
          const hueco = p > 0 && azar() < HUECO_DE_ATRAS && !(f === sinFrente && p === 1);
          // Una de cada cuatro cajas, más girada: en cualquier cara (en la
          // punta, 44 cajas de Avena en fila perfecta se leían clonadas).
          const suelta = !redondo && !e.acostado && p === 0 && azar() < CAJA_SUELTA;
          for (let piso = 0; piso < pisos; piso++) {
            const desdeElFilo = filas.fondos[i] - RETIRO_AL_FRENTE - e.fondo / 2 - p * a.pasoZ;
            // ±2 mm a lo ancho (la luz entre dos es de 4) y ±3 mm de fondo:
            // con ±1,5 mm la fila se leía como una grilla perfecta.
            const giro = entre(p === 0 ? (suelta ? GIRO_DE_CAJA_SUELTA * GRADO : giroFrente) : giroAtras);
            const ensancha = redondaEnPlanta ? 0
              : (eAncho.ancho / 2) * (Math.cos(giro) - 1) + (e.fondo / 2) * Math.abs(Math.sin(giro));
            const tope = Math.max(0, Math.min(0.002, luz / 2 - ensancha));
            // Lo mismo de fondo, contra la de adelante y la de atrás: ±3 mm
            // con 4 mm de luz metían un vaso en el otro (con otra semilla).
            const ensanchaZ = redondaEnPlanta ? 0
              : (e.fondo / 2) * (Math.cos(giro) - 1) + (eAncho.ancho / 2) * Math.abs(Math.sin(giro));
            const topeZ = Math.max(0, Math.min(0.003, (a.pasoZ - e.fondo) / 2 - ensanchaZ));
            const dx = entre(0.002), dz = Math.max(-topeZ, Math.min(topeZ, entre(0.003)));
            // La de atrás de un frente corrido queda A LA VISTA, de frente al
            // pasillo: recibe más luz que una tapada (`TONO_DEL_CORRIDO`). Con
            // el tono de una de atrás (0,82) se leía como un hueco oscuro, 12
            // niveles por debajo de sus vecinas.
            const base = f === sinFrente && p === 1 ? TONO_DEL_CORRIDO : TONO_POR_FONDO[Math.min(p, TONO_POR_FONDO.length - 1)];
            const tono = base * (0.97 + azar() * 0.06);
            // Una bolsa de atrás, asentada (sólo la de abajo de una pila).
            const asiento = e.forma === "bolsa" && p > 0 && piso === 0 && !e.acostado
              ? ASIENTO_DE_BOLSA[0] + azar() * (ASIENTO_DE_BOLSA[1] - ASIENTO_DE_BOLSA[0]) : 0;
            const escalaY = asiento > 0 ? Math.max(0.5, 1 - asiento / e.alto) : 1;
            if (hueco || (p === 0 && f === sinFrente)) continue;
            unidades.push({
              fila: i,
              x: desdeX + f * a.pasoX + Math.max(-tope, Math.min(tope, dx)),
              y: piso * e.alto + (e.alto * escalaY) / 2 - hundir,
              z: -(desdeElFilo - corrida + dz + (p === 0 ? adelantada : 0)),
              giroY: giro,
              tono,
              prof: p,
              piso,
              ...(escalaY < 1 ? { escalaY } : {}),
            });
          }
        }
      }
    }
    if (fila.frentes === 0) fila.motivo = entraDeFondo(filas.fondos[i], eAncho) ? "no-entra-ancho" : "no-entra-fondo";
    else if (!elegida) fila.motivo = "no-elegida";
    else frentesALaVista += fila.frentes;
  }

  return { porFila, unidades, frentesALaVista };
}

// ─── Las rejillas de la nevera, para este producto ───────────────────────────

/** Aire sobre el producto parado en una rejilla reacomodada: la mano que lo
 *  saca tiene que entrar, y para inclinar una botella y sacarla hace falta
 *  más que un dedo. Con 2 cm la 2 L salía en CUATRO rejillas de 35 cm —le
 *  rozaba la tapa a la de arriba— y no en las tres que arma un mercaderista;
 *  con 5, tres (48 cm), y la de 1,5 L sigue en cuatro (4 × 11). */
export const HOLGURA_DE_REJILLA = 0.05;

/**
 * Las filas donde el producto PARADO no entra de alto: con la misma regla que
 * `unidadesDePrueba` (`alto` > lo libre entre esta fila y la de arriba).
 *
 * Es lo que acuesta «Acostarla sólo en la N»: con las rejillas a mano, la de
 * 2 L dejaba el entrepaño 2 vacío y, en la pantalla que mira el proveedor, una
 * rejilla vacía en el medio de SU nevera es un quiebre de inventario (la
 * crítica de la demo, ronda 3). Acostada sólo ahí, el resto sigue parado.
 */
export function filasSinAlto(filas: Pick<FilasDeProducto, "alturas" | "rows">, alto: number): number[] {
  const fuera: number[] = [];
  for (let i = 0; i < filas.rows; i++) if (alto > filas.alturas[i + 1] - filas.alturas[i]) fuera.push(i);
  return fuera;
}

/**
 * Las rejillas de una nevera reacomodadas para que el producto entre PARADO
 * en todas — lo que hace el mercaderista cuando llega la gaseosa de 2 L.
 *
 * Con las rejillas de fábrica, la de 2 L no entraba parada en ninguna (33 cm
 * en 31 libres) y la única salida era acostarla: en Colombia una 2 L acostada
 * en la nevera de gaseosas casi no se ve. Y la de 1,5 L entraba en tres de
 * cinco: las dos del medio —a la altura de la mano y del ojo, la zona que más
 * vende— quedaban vacías y la nevera se veía desabastecida justo donde se la
 * estaba ofreciendo.
 *
 * - Se reparten parejas entre la primera rejilla y el techo, tantas como
 *   entren con el producto más 2 cm de aire, y nunca MÁS que las que tiene la
 *   nevera (no se inventan rejillas).
 * - Cada una al ras de una ranura, si así siguen entrando; si no, donde caen.
 * - `null` si no hace falta (el producto ya entra en todas) o si ni así entra.
 *
 * Es de la SESIÓN, como toda la prueba: no se escribe en el plano.
 */
export function rejillasParaProducto(filas: FilasDeProducto, alto: number): FilasDeProducto | null {
  const libres = filas.alturas.slice(1).map((y, i) => y - filas.alturas[i]);
  if (libres.every((l) => l >= alto)) return null;
  const n = rejillasQueEntran(filas, alto);
  if (n < 1) return null;
  const techo = filas.alturas[filas.rows];
  const entra = (ys: number[]) => ys.slice(1).every((y, i) => y - ys[i] >= alto + 0.005);
  // Al ras de una ranura si así siguen entrando; si no, donde caen parejas.
  const enRanura = repartirRejillas(filas, n);
  return entra(enRanura.alturas) ? enRanura : filasConNiveles(filas, parejas(filas, n), techo);
}

/** Cuántas rejillas entran como mucho con el producto PARADO y su aire, sin
 *  pasar de las que tiene la nevera. */
function rejillasQueEntran(filas: FilasDeProducto, alto: number): number {
  const desde = filas.alturas[0], techo = filas.alturas[filas.rows];
  return Math.min(filas.rows, Math.floor((techo - desde) / (alto + HOLGURA_DE_REJILLA)));
}

/** `n` niveles parejos entre la primera rejilla y el techo, sin redondear. */
function parejas(filas: FilasDeProducto, n: number): number[] {
  const desde = filas.alturas[0], techo = filas.alturas[filas.rows];
  const paso = (techo - desde) / n;
  return Array.from({ length: n }, (_, i) => desde + i * paso);
}

/** Las filas de la nevera con otras rejillas: el techo y la primera, las de
 *  fábrica; el fondo y el giro, copiados (el frío no escalona ni inclina). */
function filasConNiveles(fabrica: FilasDeProducto, niveles: number[], techo: number): FilasDeProducto {
  const n = niveles.length;
  return {
    rowBottom: niveles[0],
    alturas: [...niveles, techo],
    rowPitch: (techo - niveles[0]) / n,
    rows: n,
    fondos: Array.from({ length: n }, (_, i) => fabrica.fondos[Math.min(i, fabrica.rows - 1)]),
    giros: Array.from({ length: n }, (_, i) => fabrica.giros?.[Math.min(i, fabrica.rows - 1)] ?? 0),
  };
}

/**
 * `cuantas` rejillas repartidas parejas entre la primera de fábrica y el techo,
 * cada una (salvo la primera, que no se mueve) al ras de una ranura.
 *
 * Es la ÚNICA cuenta de dónde van las rejillas: la usan las automáticas
 * (`rejillasParaProducto`) y «A mano» cuando se cambia cuántas. NO mira si el
 * producto entra: eso lo dice `unidadesDePrueba` («no-entra-alto»), y «A mano»
 * tiene que poder mostrar justamente dónde no entra.
 *
 * `cuantas` se acota a 1…las de fábrica: no se inventan rejillas.
 */
export function repartirRejillas(fabrica: FilasDeProducto, cuantas: number): FilasDeProducto {
  const n = Math.max(1, Math.min(fabrica.rows, Math.round(cuantas) || 1));
  const niveles = parejas(fabrica, n).map((y, i) => (i === 0 ? y : alRasDeRanura(y)));
  return filasConNiveles(fabrica, niveles, fabrica.alturas[fabrica.rows]);
}

/** Lo mínimo entre dos rejillas: con menos no entra la mano, ni una lata. */
export const SEPARACION_MINIMA_DE_REJILLAS = 0.05;

/**
 * La rejilla `i` (1…rows−1) corrida `pasos` ranuras (25 mm cada una, hacia
 * arriba si es positivo), al ras de ranura. La de abajo y el techo no se
 * mueven, y ninguna se acerca a menos de 5 cm de sus vecinas: se frena ahí,
 * en la última ranura permitida. Un índice fuera de rango devuelve las
 * mismas filas.
 */
export function moverRejilla(filas: FilasDeProducto, i: number, pasos: number): FilasDeProducto {
  if (!Number.isInteger(i) || i < 1 || i >= filas.rows || !pasos) return filas;
  const paso = PARANTE.pasoRanura;
  const abajo = filas.alturas[i - 1] + SEPARACION_MINIMA_DE_REJILLAS;
  const arriba = filas.alturas[i + 1] - SEPARACION_MINIMA_DE_REJILLAS;
  // Los topes, en ranuras: la primera ranura por encima del de abajo y la
  // última por debajo del de arriba (con 1e-6 contra el último bit).
  const min = Math.ceil(abajo / paso - 1e-6) * paso;
  const max = Math.floor(arriba / paso + 1e-6) * paso;
  if (max < min) return filas;
  const y = Math.min(max, Math.max(min, alRasDeRanura(filas.alturas[i] + pasos * paso)));
  const alturas = [...filas.alturas];
  alturas[i] = Number(y.toFixed(6));
  return { ...filas, alturas, rowPitch: (alturas[filas.rows] - alturas[0]) / filas.rows };
}

/** Lo que se eligió para las rejillas de la nevera en la sesión.
 *  `undefined` = automáticas (el valor de entrada); `"fabrica"` = las del
 *  mueble; o a mano: cuántas y, si se movieron, sus alturas (sin el techo). */
export type EleccionDeRejillas = undefined | "fabrica" | { cuantas: number; alturas?: readonly number[] };

export interface RejillasDeLaPrueba {
  /** Las filas con que se prueba, o `null` = las de fábrica. */
  filas: FilasDeProducto | null;
  modo: "auto" | "fabrica" | "manual";
  /** Cuántas rejillas quedan (las de fábrica si `filas` es null). */
  cuantas: number;
  /** Cuántas entran como mucho con el producto parado (0 si ni una). */
  nMax: number;
}

/** Las alturas guardadas a mano sirven si son tantas como `cuantas`, la
 *  primera es la de fábrica, crecen con 5 cm entre una y otra y quedan
 *  dentro del mueble. Si no (otra nevera, otro tamaño), se reparten. */
function alturasCoherentes(fabrica: FilasDeProducto, cuantas: number, alturas?: readonly number[]): boolean {
  if (!alturas || alturas.length !== cuantas) return false;
  const techo = fabrica.alturas[fabrica.rows];
  if (Math.abs(alturas[0] - fabrica.alturas[0]) > 1e-4) return false;
  const todas = [...alturas, techo];
  return todas.every((y, k) => Number.isFinite(y) && (k === 0 || y - todas[k - 1] >= SEPARACION_MINIMA_DE_REJILLAS - 1e-6));
}

/**
 * Con qué rejillas se prueba el producto en la nevera de refrescos.
 *
 * Es la ÚNICA cuenta: la usan el dibujo (`construirPrueba`) y el panel, que
 * antes tenían cada uno su copia, y la toma de venta encuadra las mismas filas.
 *
 * - **Acostada**: siempre las de fábrica (las rejillas se acomodan para
 *   pararla; acostada no hace falta).
 * - **`"fabrica"`**: las de fábrica, aunque no entre.
 * - **A mano**: las alturas guardadas si son coherentes; si no, `cuantas`
 *   repartidas. Las cuantas van de 1 a las de fábrica y NO hasta las que
 *   entran: con 4 rejillas «A mano» tiene que poder decir dónde no entra.
 * - **Automáticas** (`undefined`): se acomodan sólo si el producto parado no
 *   entra en alguna de fábrica Y acomodadas muestran MÁS frentes con la cara
 *   entera. Un producto que ya entra en todas queda en las de fábrica, y la
 *   2 L, que no entraba en ninguna, sale parada en todas sin tocar nada.
 *
 * Sin empaque (la foto todavía carga) no hay automáticas: las de fábrica.
 */
export function rejillasDeLaPrueba(
  venta: Pick<VentaDeMueble, "filas" | "vanos" | "sobreApoyo">,
  empaque: EmpaqueDePrueba | null,
  eleccion: EleccionDeRejillas,
): RejillasDeLaPrueba {
  const fabrica = venta.filas;
  const nMax = empaque && !empaque.acostado ? Math.max(0, rejillasQueEntran(fabrica, empaque.alto)) : 0;
  const deFabrica = (modo: RejillasDeLaPrueba["modo"]): RejillasDeLaPrueba =>
    ({ filas: null, modo, cuantas: fabrica.rows, nMax });
  if (!empaque || empaque.acostado) return deFabrica(eleccion === undefined ? "auto" : eleccion === "fabrica" ? "fabrica" : "manual");
  if (eleccion === "fabrica") return deFabrica("fabrica");
  if (eleccion && typeof eleccion === "object") {
    const cuantas = Math.max(1, Math.min(fabrica.rows, Math.round(eleccion.cuantas) || 1));
    const filas = alturasCoherentes(fabrica, cuantas, eleccion.alturas)
      ? filasConNiveles(fabrica, [...eleccion.alturas!], fabrica.alturas[fabrica.rows])
      : repartirRejillas(fabrica, cuantas);
    return { filas, modo: "manual", cuantas, nMax };
  }
  // Automáticas.
  const libres = fabrica.alturas.slice(1).map((y, i) => y - fabrica.alturas[i]);
  if (libres.every((l) => l >= empaque.alto)) return deFabrica("auto");
  const acomodadas = rejillasParaProducto(fabrica, empaque.alto);
  if (!acomodadas) return deFabrica("auto");
  const frentes = (filas: FilasDeProducto) =>
    unidadesDePrueba({ venta: { ...venta, filas }, empaque, donde: "todas", semilla: "rejillas" }).frentesALaVista;
  if (frentes(acomodadas) <= frentes(fabrica)) return deFabrica("auto");
  return { filas: acomodadas, modo: "auto", cuantas: acomodadas.rows, nMax };
}

/** Lo que se toca en el bloque «Rejillas» del panel. */
export type AccionDeRejillas =
  | { modo: "auto" | "fabrica" | "manual" }
  | { cuantas: number }
  | { mover: number; pasos: number };

/**
 * El cambio de sesión que pide cada botón del bloque «Rejillas».
 *
 * Cambiar de modo o de cantidad vuelve «Dónde va» a la cara entera: los
 * índices de «Por entrepaño» son de las filas VIGENTES, y con otras filas
 * apuntarían a otra rejilla (el entrepaño 3 de cinco no es el 3 de cuatro).
 * Mover una rejilla no lo toca: las filas son las mismas, más arriba o más
 * abajo. «A mano» arranca con las que se ven, para que tocarlo no cambie
 * nada hasta mover algo.
 */
export function ajusteDeRejillas(
  accion: AccionDeRejillas, vigentes: FilasDeProducto,
): { rejillas: EleccionDeRejillas; donde?: "todas" } {
  if ("modo" in accion) {
    const rejillas: EleccionDeRejillas = accion.modo === "auto"
      ? undefined
      : accion.modo === "fabrica" ? "fabrica" : { cuantas: vigentes.rows, alturas: vigentes.alturas.slice(0, -1) };
    return { rejillas, donde: "todas" };
  }
  if ("cuantas" in accion) return { rejillas: { cuantas: accion.cuantas }, donde: "todas" };
  const m = moverRejilla(vigentes, accion.mover, accion.pasos);
  return { rejillas: { cuantas: m.rows, alturas: m.alturas.slice(0, -1) } };
}

/** Una clave de texto de unas filas, para re-encuadrar cuando cambian. */
export function claveDeFilas(filas: FilasDeProducto | null | undefined): string {
  return filas ? filas.alturas.map((y) => y.toFixed(4)).join(",") : "-";
}

// ─── A dónde mira la cámara de venta ─────────────────────────────────────────

/** La altura de los ojos de quien compra, más o menos: el entrepaño que se
 *  muestra «de cerca» es el que queda más cerca de acá. Es también el que más
 *  se paga. */
const ALTURA_DE_LA_MIRADA = 1.3;

/** Lo que encuadra la cámara de venta (`vistaDeVenta`, en utils/planta.ts):
 *  la franja de la prueba y el entrepaño que va «de cerca». */
export interface FocoDeLaPrueba {
  yBajo: number;
  yAlto: number;
  /** Centro del alto libre del entrepaño que va «de cerca». */
  yEntrepano?: number;
  /** Ese alto libre: la toma «de cerca» se aleja lo justo para que entre. */
  libreEntrepano?: number;
  /** Se eligieron entrepaños (no la cara entera). */
  porEntrepano?: boolean;
  /** `yEntrepano` y `libreEntrepano` son de un PAR de repisas (mueble
   *  angosto: ver `MUEBLE_ANGOSTO`). */
  parDeRepisas?: boolean;
}

/** Un vano más angosto que esto es un mueble de una columna (el robatope de
 *  30 cm: una bolsa por repisa). Ahí «De cerca» encuadra DOS repisas: con una
 *  sola, el producto era un 13 % del cuadro y el resto, el costado del
 *  vecino; con dos y media, la bolsa ocupaba ~245 px y el resto era góndola
 *  vacía y pared. */
export const MUEBLE_ANGOSTO = 0.5;

/**
 * La franja que encuadra la cámara de venta para una prueba.
 *
 * - Cara entera: del piso al tope del mueble (`alto`).
 * - Por entrepaño: del apoyo más bajo al techo más alto de los elegidos, con
 *   5 cm de aire de cada lado.
 * - «De cerca»: entre los entrepaños elegidos —o, con la cara entera, entre
 *   los que tienen producto— el de centro más cerca de 1,3 m.
 *
 * Es pura y sale de la MISMA cuenta que dibuja la prueba (`unidadesDePrueba`):
 * si la cámara calculara sus alturas aparte, la toma «de cerca» terminaría
 * mirando un entrepaño vacío.
 */
export function focoDeLaPrueba(
  venta: Pick<VentaDeMueble, "filas" | "vanos" | "sobreApoyo">,
  alto: number,
  donde: "todas" | readonly number[],
  empaque: EmpaqueDePrueba | null,
): FocoDeLaPrueba {
  const { filas } = venta;
  // Sin empaque (la foto todavía carga) se encuadra lo elegido igual.
  const porFila: { fila: number; apoyo: number; libre: number; conProducto: boolean }[] = empaque
    ? unidadesDePrueba({ venta, empaque, donde, semilla: "foco" }).porFila
        .map((f) => ({ fila: f.fila, apoyo: f.apoyo, libre: f.libre, conProducto: f.motivo === null }))
    : Array.from({ length: filas.rows }, (_, i) => ({
        fila: i,
        apoyo: filas.alturas[i] + (venta.sobreApoyo ?? 0),
        libre: filas.alturas[i + 1] - filas.alturas[i],
        conProducto: donde === "todas" || donde.includes(i),
      }));

  const elegidas = donde === "todas" ? porFila : porFila.filter((f) => donde.includes(f.fila));
  let yBajo = 0, yAlto = alto;
  if (donde !== "todas" && elegidas.length > 0) {
    yBajo = Math.max(0, Math.min(...elegidas.map((f) => f.apoyo)) - 0.05);
    yAlto = Math.min(alto, Math.max(...elegidas.map((f) => f.apoyo + f.libre)) + 0.05);
  }

  const porEntrepano = donde !== "todas" && elegidas.length > 0;
  const candidatas = elegidas.filter((f) => f.conProducto);
  const lista = candidatas.length > 0 ? candidatas : elegidas;
  if (lista.length === 0) return { yBajo, yAlto, porEntrepano };
  const centro = (f: { apoyo: number; libre: number }) => f.apoyo + f.libre / 2;
  // Un mueble angosto: el PAR de repisas vecinas con producto (las dos de
  // `lista`) cuyo centro queda más cerca de la mirada. «Vecinas» es por
  // número de fila: con una vacía en el medio, el par mostraría un hueco.
  const angosto = venta.vanos.length > 0 && Math.max(...venta.vanos.map((v) => v.ancho)) < MUEBLE_ANGOSTO;
  if (angosto) {
    const pares: { apoyo: number; libre: number }[] = [];
    for (const a of lista) {
      const b = lista.find((f) => f.fila === a.fila + 1);
      if (b) pares.push({ apoyo: a.apoyo, libre: b.apoyo + b.libre - a.apoyo });
    }
    if (pares.length > 0) {
      const par = pares.reduce((a, b) =>
        Math.abs(centro(b) - ALTURA_DE_LA_MIRADA) < Math.abs(centro(a) - ALTURA_DE_LA_MIRADA) ? b : a);
      return { yBajo, yAlto, yEntrepano: centro(par), libreEntrepano: par.libre, porEntrepano, parDeRepisas: true };
    }
  }
  const cerca = lista.reduce((a, b) =>
    Math.abs(centro(b) - ALTURA_DE_LA_MIRADA) < Math.abs(centro(a) - ALTURA_DE_LA_MIRADA) ? b : a);
  return { yBajo, yAlto, yEntrepano: centro(cerca), libreEntrepano: cerca.libre, porEntrepano };
}
