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
import { ZONA_DE_SLOTS, alRasDeRanura } from "./medidas";
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
  empaque: Empaque;
  posiciones: PosicionDeRelleno[];
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
  vendidoEntero?: { rubro?: string };
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
        const fondos = Math.min(
          acomodo.filas, vendidoEntero ? PROFUNDIDAD_DE_MUEBLE_ENTERO : PROFUNDIDAD_VISIBLE,
        );

        const grupo = porClave.get(clave) ?? { clave, color, empaque: e, posiciones: [] };
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
}

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

/** Un generador sembrado (mulberry32): el mismo mueble se ve igual siempre.
 *  Al azar, el producto se reacomodaría solo cada vez que se mueve la cámara
 *  —el plano titila entero— y nadie puede señalar nada. */
function azarDe(semilla: number): () => number {
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
  venta, empaque, donde, semilla, profundidad = 3,
}: {
  venta: Pick<VentaDeMueble, "filas" | "vanos" | "sobreApoyo">;
  empaque: EmpaqueDePrueba;
  donde: "todas" | readonly number[];
  semilla: string;
  profundidad?: number;
}): PruebaAcomodada {
  const { filas, vanos } = venta;
  const porFila: FilaDePrueba[] = [];
  const unidades: UnidadDePrueba[] = [];
  let frentesALaVista = 0;
  const e = empaque;

  for (let i = 0; i < filas.rows; i++) {
    const apoyo = filas.alturas[i] + (venta.sobreApoyo ?? 0);
    const giro = filas.giros?.[i] ?? 0;
    const libre = filas.alturas[i + 1] - filas.alturas[i];
    const fila: FilaDePrueba = {
      fila: i, apoyo, giro, libre, fondo: filas.fondos[i], frentes: 0, fondoVisible: 0, pisos: 0, motivo: null,
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
    const redondo = (e.forma === "botella" || e.forma === "lata") && !e.acostado;
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
      // El vano ENTERO: la prueba es por entrepaño, no por el tramo de un slot.
      const a = acomodar(vano.ancho, filas.fondos[i], libre, eAncho);
      if (a.frentes === 0) continue;
      const desdeX = vano.x - a.ocupado / 2 + eAncho.ancho / 2;
      const fondoVisible = Math.min(a.filas, profundidad);
      fila.frentes += a.frentes;
      fila.fondoVisible = Math.max(fila.fondoVisible, fondoVisible);
      fila.pisos = pisos;
      // Lo que no se eligió dice cuánto entraría, pero no se dibuja.
      if (!elegida) continue;
      // Lo que queda libre detrás de la última unidad visible: hasta ahí se
      // puede correr una columna sin salirse del entrepaño por atrás.
      const libreAtras = Math.max(0, (a.filas - fondoVisible) * a.pasoZ);

      for (let f = 0; f < a.frentes; f++) {
        // Una columna de cada tanto quedó sin «frentear»: corrida hacia
        // adentro entera, como la deja el comprador que se llevó la primera.
        // Entera, para que la de adelante no se meta en la de atrás.
        const corrida = azar() < COLUMNA_CORRIDA ? Math.min(libreAtras, 0.01 + azar() * 0.01) : 0;
        for (let p = 0; p < fondoVisible; p++) {
          // Un hueco de reposición, sólo atrás y con toda su pila.
          const hueco = p > 0 && azar() < HUECO_DE_ATRAS;
          for (let piso = 0; piso < pisos; piso++) {
            const desdeElFilo = filas.fondos[i] - RETIRO_AL_FRENTE - e.fondo / 2 - p * a.pasoZ;
            // ±2 mm a lo ancho (la luz entre dos es de 4: no se tocan) y ±3 mm
            // de fondo: con ±1,5 mm la fila se leía como una grilla perfecta.
            const dx = entre(0.002), dz = entre(0.003), giro = entre(p === 0 ? giroFrente : giroAtras);
            const tono = TONO_POR_FONDO[Math.min(p, TONO_POR_FONDO.length - 1)] * (0.97 + azar() * 0.06);
            if (hueco) continue;
            unidades.push({
              fila: i,
              x: desdeX + f * a.pasoX + dx,
              y: piso * e.alto + e.alto / 2 - hundir,
              z: -(desdeElFilo - corrida + dz),
              giroY: giro,
              tono,
              prof: p,
              piso,
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
 *  saca tiene que entrar. */
const HOLGURA_DE_REJILLA = 0.02;

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
  const desde = filas.alturas[0], techo = filas.alturas[filas.rows];
  const n = Math.min(filas.rows, Math.floor((techo - desde) / (alto + HOLGURA_DE_REJILLA)));
  if (n < 1) return null;
  const paso = (techo - desde) / n;
  const parejas = Array.from({ length: n }, (_, i) => desde + i * paso);
  const enRanura = parejas.map((y, i) => (i === 0 ? y : alRasDeRanura(y)));
  const entra = (ys: number[]) => [...ys, techo].slice(1).every((y, i) => y - ys[i] >= alto + 0.005);
  const niveles = entra(enRanura) ? enRanura : parejas;
  return {
    rowBottom: desde,
    alturas: [...niveles, techo],
    rowPitch: paso,
    rows: n,
    fondos: Array.from({ length: n }, () => filas.fondos[0]),
    giros: Array.from({ length: n }, () => 0),
  };
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
}

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
  const cerca = lista.reduce((a, b) =>
    Math.abs(centro(b) - ALTURA_DE_LA_MIRADA) < Math.abs(centro(a) - ALTURA_DE_LA_MIRADA) ? b : a);
  return { yBajo, yAlto, yEntrepano: centro(cerca), libreEntrepano: cerca.libre, porEntrepano };
}
