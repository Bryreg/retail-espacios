/**
 * Extensión real de la planta y física de la caminata en primera persona.
 *
 * El editor 3D nació con una tienda ficticia de 30 × 42 m anclada en el origen
 * (STORE_W / STORE_D). Ninguna sede real cabe ahí: NAVE mide 42 × 16 m y
 * empieza en x = −23, así que 48 de sus 104 muebles quedaban fuera de la caja
 * y eran inalcanzables a pie. Todo lo que depende del tamaño del local se
 * calcula acá, a partir de los muebles.
 *
 * Vive fuera del componente porque es geometría pura: así se puede probar sin
 * montar Three.js ni un navegador.
 */

/** Lo mínimo que hay que saber de un mueble para ubicarlo en el piso. */
export interface MuebleEnPlanta {
  x: number; z: number;
  w: number; d: number;
  rotY?: number;
  /** Altura en metros. Ausente = se asume que estorba. */
  h?: number;
}

export interface Caja {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface LimitesPlanta extends Caja {
  cx: number; cz: number;
  w: number; d: number;
}

/**
 * Hasta cuánto se pueden meter dos muebles uno en otro y seguir siendo
 * «pegados» y no «encimados».
 *
 * Una corrida de góndolas se arma poniéndolas al ras, y eso tiene que salir
 * siempre: si la regla fuera «cero solape» bastaría el ruido de coma flotante
 * de una rotación —cos(90°) da 6·10⁻¹⁷, no 0— o medio milímetro de redondeo
 * para que el editor se negara a dejarlas juntas. Dos centímetros es menos que
 * la grilla de 5 cm con la que se dibuja: por debajo de eso nadie lo puso ahí a
 * propósito. Por encima ya es un mueble sobre otro, y eso se bloquea.
 */
export const TOLERANCIA_CONTACTO = 0.02;  // m

/** Por debajo de esta altura un mueble se pisa en vez de estorbar (Zona Libre mide 5 cm). */
export const ALTURA_PISABLE = 0.25;
/** Radio del cuerpo: mantiene la cámara despegada de la cara del mueble. */
export const RADIO_PERSONA  = 0.28;
/** Paso normal dentro de un supermercado. Antes eran 0.08 m por frame ≈ 4.8 m/s: trotando. */
export const VEL_CAMINANDO  = 1.4;  // m/s
/** Con Shift, para cruzar una sede de 40 m sin desesperarse. */
export const VEL_APURADA    = 3.2;  // m/s

/**
 * Huella de un mueble sobre el piso, ya rotada.
 *
 * El helper de colocación (getAABB) ignora rotY porque los muebles se colocan
 * sin girar; acá no se puede: la mayoría de las góndolas están giradas 90°, y
 * sin la rotación una góndola de 3.6 m de largo se lee como si midiera 0.9 m.
 */
export function huella(f: MuebleEnPlanta): Caja {
  const r  = f.rotY ?? 0;
  const cs = Math.abs(Math.cos(r));
  const sn = Math.abs(Math.sin(r));
  const hw = (cs * f.w + sn * f.d) / 2;
  const hd = (sn * f.w + cs * f.d) / 2;
  return { minX: f.x - hw, maxX: f.x + hw, minZ: f.z - hd, maxZ: f.z + hd };
}

/**
 * Caja que contiene a todos los muebles, más un margen de pasillo perimetral.
 * Con la planta vacía cae en `vacia`: no hay de dónde deducir nada.
 */
export function limitesDePlanta(
  fixtures: MuebleEnPlanta[],
  margen = 2.5,
  vacia: Caja = { minX: 0, maxX: 30, minZ: 0, maxZ: 42 },
): LimitesPlanta {
  let { minX, maxX, minZ, maxZ } = vacia;
  if (fixtures.length > 0) {
    const cajas = fixtures.map(huella);
    minX = Math.min(...cajas.map(c => c.minX)) - margen;
    maxX = Math.max(...cajas.map(c => c.maxX)) + margen;
    minZ = Math.min(...cajas.map(c => c.minZ)) - margen;
    maxZ = Math.max(...cajas.map(c => c.maxZ)) + margen;
  }
  return {
    minX, maxX, minZ, maxZ,
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
    w: maxX - minX, d: maxZ - minZ,
  };
}

/**
 * Cámara general que encuadra toda la planta: desde el frente, a una altura
 * proporcional al lado más largo, mirando al centro del local.
 */
export function vistaGeneral(limites: LimitesPlanta) {
  return {
    pos:    { x: limites.cx, y: Math.max(limites.w, limites.d) * 0.7, z: limites.maxZ + 8 },
    mirada: { x: limites.cx, y: 0, z: limites.cz },
  };
}

/** Una cámara: dónde está parada y adónde mira. */
export interface Vista3D {
  posX: number; posY: number; posZ: number;
  targetX: number; targetY: number; targetZ: number;
}

/**
 * Hacia dónde da una cara del mueble, en coordenadas del local.
 *
 * En la caja de Three.js el orden de materiales es [+X, −X, +Y, −Y, +Z, −Z], y
 * el editor pinta la cara A en el índice 5 y la B en el 4. O sea: **la cara A
 * mira a −Z y la B a +Z en coordenadas locales**, y después el mueble entero
 * gira `rotY` alrededor de Y.
 */
export function normalDeCara(rotY: number, cara: "A" | "B"): { x: number; z: number } {
  const signo = cara === "A" ? 1 : -1;
  return { x: signo * -Math.sin(rotY), z: signo * -Math.cos(rotY) };
}

/**
 * Encuadre de una cara del mueble: de frente, llena y a la altura de una
 * persona. Es la foto que se le manda al proveedor.
 *
 * La distancia sale del campo visual de la cámara y de lo que hay que meter en
 * el cuadro: una góndola de 3,6 m y una punta de 0,9 m no se miran desde la
 * misma distancia. Se toma el lado más grande entre el ancho de la cara y su
 * alto, con un margen para que la exhibición no quede pegada al borde.
 */
export function vistaDeCara(
  mueble: { cx: number; cz: number; w: number; d: number; h: number; rotY?: number },
  cara: "A" | "B",
  fovGrados = 50,
  margen = 1.35,
): Vista3D {
  const rotY = mueble.rotY ?? 0;
  const n = normalDeCara(rotY, cara);

  // La cara mide `w` de ancho y `h` de alto SIEMPRE: es una cara de la caja,
  // abarca los ejes locales X e Y del mueble. Girarlo cambia hacia dónde
  // apunta, no cuánto mide. (No confundir con `huella`, que sí intercambia
  // ancho y fondo porque describe la caja alineada al MUNDO.)
  const anchoCara = mueble.w;
  const fondoCara = mueble.d;

  const fov = (fovGrados * Math.PI) / 180;
  // La cámara es horizontal, así que el límite real suele ser el alto; se toma
  // el mayor de los dos y se encuadra contra el campo vertical.
  const aCubrir = Math.max(anchoCara, mueble.h) * margen;
  // Distancia desde la CARA, no desde el centro: media profundidad no cuenta.
  const distancia = Math.max(1.6, aCubrir / (2 * Math.tan(fov / 2)));

  // Altura de mirada: el medio del mueble, pero nunca por debajo de la vista de
  // una persona — una batea de 80 cm mirada desde 40 cm de altura parece una
  // foto tomada desde el piso.
  const alturaMirada = Math.max(mueble.h / 2, 1.2);
  const alturaCamara = Math.max(alturaMirada, 1.65);

  const desdeCara = fondoCara / 2 + distancia;
  return {
    posX: mueble.cx + n.x * desdeCara,
    posY: alturaCamara,
    posZ: mueble.cz + n.z * desdeCara,
    targetX: mueble.cx,
    targetY: alturaMirada,
    targetZ: mueble.cz,
  };
}

/** ¿Ese punto de mira cae dentro del local? */
export function miradaSensata(limites: Caja, x: number, z: number): boolean {
  return x >= limites.minX && x <= limites.maxX && z >= limites.minZ && z <= limites.maxZ;
}

/**
 * Muebles que estorban al caminar, ya inflados por el radio del cuerpo.
 * Los que miden menos de ALTURA_PISABLE quedan fuera: son marcas en el piso.
 */
export function murosDeCaminata(fixtures: MuebleEnPlanta[]): Caja[] {
  return fixtures
    .filter(f => (f.h ?? Infinity) > ALTURA_PISABLE)
    .map(f => {
      const b = huella(f);
      return {
        minX: b.minX - RADIO_PERSONA, maxX: b.maxX + RADIO_PERSONA,
        minZ: b.minZ - RADIO_PERSONA, maxZ: b.maxZ + RADIO_PERSONA,
      };
    });
}

/** ¿Ese punto está dentro de algún mueble? */
export function chocaEn(muros: Caja[], x: number, z: number): boolean {
  return muros.some(m => x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ);
}

/**
 * El lugar despejado más cercano a un punto, buscando en espiral hacia afuera.
 *
 * Sirve para entrar a la caminata y para aterrizar un salto: nadie debe quedar
 * parado dentro de una góndola, y quien apunta al medio de un mueble en el
 * plano quiere llegar al pasillo de al lado, no que no pase nada.
 */
export function puntoLibreCerca(
  limites: LimitesPlanta,
  muros: Caja[],
  x: number,
  z: number,
): { x: number; z: number } {
  const dentro = (px: number, pz: number) =>
    px > limites.minX && px < limites.maxX && pz > limites.minZ && pz < limites.maxZ;

  const cx = Math.max(limites.minX, Math.min(limites.maxX, x));
  const cz = Math.max(limites.minZ, Math.min(limites.maxZ, z));
  if (!chocaEn(muros, cx, cz)) return { x: cx, z: cz };

  const alcance = Math.max(limites.w, limites.d);
  for (let r = 0.5; r <= alcance; r += 0.5) {
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      const px = cx + Math.cos(t) * r;
      const pz = cz + Math.sin(t) * r;
      if (dentro(px, pz) && !chocaEn(muros, px, pz)) return { x: px, z: pz };
    }
  }
  return { x: cx, z: cz };
}

/** Por dónde se entra a la caminata: el centro del local, o lo más cerca que se pueda. */
export function puntoDeEntrada(limites: LimitesPlanta, muros: Caja[]): { x: number; z: number } {
  return puntoLibreCerca(limites, muros, limites.cx, limites.cz);
}

/**
 * Longitud máxima de un tramo al resolver el choque.
 *
 * El choque se mide punto a punto, así que un paso más largo que el obstáculo
 * lo salta limpio: de (0, −1.2) a (0, 1.2) los dos extremos están libres y la
 * góndola del medio nunca se toca. Hoy un paso dura como mucho 0.32 m (la
 * velocidad más alta por el delta acotado) y el obstáculo más delgado —una
 * columna de 30 cm— mide 0.86 m ya inflada, así que no pasaría; pero eso
 * depende de que nadie suba la velocidad ni agregue un mueble más angosto.
 * Partir el paso en tramos cortos lo vuelve correcto sin depender de eso.
 */
export const PASO_MAXIMO = 0.2;  // m

/** Un tramo: recorta contra los límites del local y resuelve el choque por eje. */
function resolverTramo(
  antes:     { x: number; z: number },
  tentativo: { x: number; z: number },
  limites:   Caja,
  muros:     Caja[],
): { x: number; z: number } {
  let x = Math.max(limites.minX, Math.min(limites.maxX, tentativo.x));
  let z = Math.max(limites.minZ, Math.min(limites.maxZ, tentativo.z));

  // Si el punto de partida ya estaba dentro de un mueble — alguien lo colocó
  // encima mientras se caminaba — se deja salir. Frenarlo ahí lo dejaría
  // atrapado para siempre.
  if (!chocaEn(muros, antes.x, antes.z) && chocaEn(muros, x, z)) {
    // Resolver por eje es lo que hace que uno resbale a lo largo de la góndola
    // en vez de clavarse contra ella: se conserva la componente que sí pasa.
    if      (!chocaEn(muros, x, antes.z)) z = antes.z;
    else if (!chocaEn(muros, antes.x, z)) x = antes.x;
    else { x = antes.x; z = antes.z; }
  }
  return { x, z };
}

/**
 * Dónde termina realmente un paso, recorriéndolo en tramos cortos.
 *
 * Cada tramo avanza el mismo desplazamiento desde donde uno quedó, no desde la
 * recta original: así, cuando un tramo resbala contra una góndola, los
 * siguientes siguen resbalando en vez de volver a empujar contra la cara.
 */
export function resolverPaso(
  antes:     { x: number; z: number },
  tentativo: { x: number; z: number },
  limites:   Caja,
  muros:     Caja[],
): { x: number; z: number } {
  const dx = tentativo.x - antes.x;
  const dz = tentativo.z - antes.z;
  const tramos = Math.max(1, Math.ceil(Math.hypot(dx, dz) / PASO_MAXIMO));
  const px = dx / tramos, pz = dz / tramos;

  let actual = { x: antes.x, z: antes.z };
  for (let i = 0; i < tramos; i++) {
    actual = resolverTramo(actual, { x: actual.x + px, z: actual.z + pz }, limites, muros);
  }
  return actual;
}

// ─── La figura de escala ──────────────────────────────────────────────────────

/**
 * Dónde se para: al costado del mueble, un poco adelantada.
 *
 * Prueba derecha y después izquierda, y si en ninguna hay lugar devuelve
 * `null` en vez de plantarla igual. En una sede sembrada con doce góndolas
 * sueltas cualquier lado sirve; en una de ciento veintiséis, un costado da al
 * pasillo y el otro a la góndola de al lado, y una persona metida adentro de
 * un estante no aclara la escala: la arruina.
 *
 * El test es el mismo con el que se camina (`murosDeCaminata` ya infla cada
 * huella por `RADIO_PERSONA`, y respeta la rotación), así que la figura se para
 * exactamente donde podría pararse alguien.
 *
 * `separacion` es cuánto queda del canto del mueble.
 *
 * `enLaCara` la para EN EL PLANO de la cara que se está mostrando (la A o la
 * B), y no 35 cm por delante del centro. Es lo que pide la pantalla de venta:
 * adelantada, la perspectiva la agrandaba —en la toma de frente de una punta
 * de 1,80 la persona de 1,70 salía más alta que el mueble y lo hacía ver de
 * juguete, justo lo contrario de dar la escala—; y del lado A, en la toma de
 * una cara B quedaba detrás de la góndola.
 */
export function lugarDeLaFigura(
  f: { x: number; z: number; w: number; rotY: number },
  muros: Caja[],
  separacion = 0.45,
  enLaCara?: { d: number; cara: "A" | "B" },
): { x: number; z: number; rotY: number } | null {
  const cos = Math.cos(f.rotY), sen = Math.sin(f.rotY);
  const aMundo = (lx: number, lz: number) => ({
    x: f.x + lx * cos + lz * sen,
    z: f.z - lx * sen + lz * cos,
  });
  // La cara A mira a −Z local (`normalDeCara`): su plano está en z = −d/2.
  const lz = enLaCara ? (enLaCara.cara === "A" ? -1 : 1) * (enLaCara.d / 2) : -0.35;
  // Mirando hacia el mismo lado que la cara: de frente a quien la mira.
  const rotY = enLaCara?.cara === "B" ? f.rotY + Math.PI : f.rotY;
  for (const lado of [1, -1] as const) {
    const p = aMundo(lado * (f.w / 2 + separacion), lz);
    if (!chocaEn(muros, p.x, p.z)) return { ...p, rotY };
  }
  return null;
}

// ─── La cámara del vendedor ───────────────────────────────────────────────────

/** Las tres tomas con que se le muestra un espacio al proveedor. */
export type TomaDeVenta = "frente" | "tres_cuartos" | "cerca";

/**
 * El campo visual (vertical, en grados) de la toma «De cerca».
 *
 * Con los 50° de siempre, para llenar el cuadro con un entrepaño la cámara
 * tenía que pegarse a 60 cm: un gran angular que estiraba las cajas de los
 * bordes, con la cámara a 1,6 m mirando para abajo, las tapas de los vasos
 * dominaban el cuadro y el entrepaño de arriba se comía un tercio. Con un
 * teleobjetivo corto la cámara se para más atrás, casi a la altura del
 * entrepaño, y el producto se ve de frente, como lo mira quien lo compra.
 */
export const FOV_DE_CERCA = 32;
/** Qué parte del alto del cuadro llena el entrepaño en «De cerca». */
const LLENADO_DE_CERCA = 0.75;

/**
 * Cuánto pasillo libre hay delante de una cara, en la dirección `normal`.
 *
 * Avanza de a 5 cm desde el plano de la cara hasta que choca con otro mueble
 * (`chocaEn`, el mismo test de la caminata: los muebles ya vienen inflados por
 * el radio del cuerpo) o se sale del local, y devuelve esa distancia menos un
 * paso. Es lo que `vistaDeCara` no miraba: la cara B de una góndola que da a un
 * pasillo de 2 m se encuadraba desde 5,7 m, DETRÁS de la góndola de enfrente,
 * y el proveedor veía el lomo vacío de la vecina en vez de su producto.
 */
export function distanciaLibre(
  origen: { x: number; z: number },
  normal: { x: number; z: number },
  obstaculos: Caja[],
  limites: Caja,
  max = 8,
): number {
  const PASO = 0.05;
  // Lo que ya rodea al punto de partida no está DELANTE de la cara: es el
  // mueble pegado al costado (el robatope arrimado a la punta), cuya huella
  // inflada por el radio del cuerpo cubre el canto. Contándolo, el pasillo
  // de un robatope medía cero y la toma de frente se pegaba a 90 cm,
  // cortándole las repisas de arriba.
  const delante = obstaculos.filter((c) => !chocaEn([c], origen.x, origen.z));
  let libre = 0;
  for (let s = PASO; s <= max + 1e-9; s += PASO) {
    const x = origen.x + normal.x * s;
    const z = origen.z + normal.z * s;
    if (x < limites.minX || x > limites.maxX || z < limites.minZ || z > limites.maxZ) break;
    if (chocaEn(delante, x, z)) break;
    libre = s;
  }
  return Math.max(0, libre - PASO);
}

/** Lo que tiene que entrar en el cuadro: la franja vertical del producto y,
 *  para «De cerca», el centro y el alto libre del entrepaño elegido. */
export interface FocoDeVenta {
  yBajo: number;
  yAlto: number;
  yEntrepano?: number;
  libreEntrepano?: number;
  /** La prueba va en algunos entrepaños y no en la cara entera: la toma de
   *  frente los mira DE FRENTE, a su altura, y no desde 1,2 m para abajo. */
  porEntrepano?: boolean;
}

/** El ángulo polar de OrbitControls va de π/6 a π/2,1 (`CameraControls`): una
 *  cámara a la altura exacta de la mira queda FUERA y los controles la mueven
 *  solos. Esto es la subida mínima, con margen, por metro de distancia. */
const SUBIDA_MINIMA = Math.tan(Math.PI / 2 - Math.PI / 2.1) * 1.08;

/**
 * Una toma de venta: quieta, dentro del pasillo y a la altura de un comprador.
 *
 * - **De frente**: la franja del producto entera, de frente, desde donde se
 *   para alguien en el pasillo. La distancia es la que hace falta para que
 *   entre —por alto y por ancho— pero nunca más de lo que deja el pasillo, y
 *   nunca menos de 90 cm.
 * - **Tres cuartos**: la de frente girada 35° alrededor de la mira, hacia el
 *   lado que tenga más lugar. Es la que muestra el volumen: la tapa y el
 *   costado de cada envase. Si no hay lugar de ningún lado, queda de frente.
 * - **De cerca**: el entrepaño elegido llena el 75 % del alto del cuadro, con
 *   la cámara apenas por encima de su centro y el campo visual angosto de
 *   `FOV_DE_CERCA` (el que llama lo pasa en `fovGrados`): es la que se lee
 *   por videollamada. En un mueble angosto (el robatope de 30 cm, una bolsa
 *   por repisa) encuadra dos repisas y media: con una sola, el producto
 *   ocupaba el 13 % del cuadro y el resto era el costado del vecino.
 *
 * La cámara va siempre por encima de la mira —como un comprador mirando un
 * estante— y dentro del rango polar de los controles, que si no la corrigen
 * solos y la toma sale otra.
 *
 * `evitar` es un punto que no conviene tener entre la cámara y el mueble —la
 * persona de 1,70 m parada al costado—: el tres cuartos gira hacia el OTRO
 * lado si ahí también hay pasillo. Con la persona en primer plano, media
 * punta quedaba tapada.
 */
export function vistaDeVenta(
  mueble: { cx: number; cz: number; w: number; d: number; h: number; rotY?: number },
  cara: "A" | "B",
  toma: TomaDeVenta,
  foco: FocoDeVenta,
  obstaculos: Caja[],
  limites: Caja,
  fovGrados = 50,
  aspecto = 16 / 9,
  evitar?: { x: number; z: number },
): Vista3D {
  const n = normalDeCara(mueble.rotY ?? 0, cara);
  const centro = { x: mueble.cx + (n.x * mueble.d) / 2, z: mueble.cz + (n.z * mueble.d) / 2 };
  const libre = distanciaLibre(centro, n, obstaculos, limites);
  const mitadV = ((fovGrados * Math.PI) / 180) / 2;
  const mitadH = Math.atan(Math.tan(mitadV) * aspecto);

  const conAltura = (pos: { x: number; z: number }, mira: number, y: number): Vista3D => {
    const dist = Math.hypot(pos.x - centro.x, pos.z - centro.z);
    const camY = Math.max(y, mira + 0.05, mira + SUBIDA_MINIMA * dist);
    return { posX: pos.x, posY: camY, posZ: pos.z, targetX: centro.x, targetY: mira, targetZ: centro.z };
  };

  if (toma === "cerca") {
    const mira = foco.yEntrepano ?? (foco.yBajo + foco.yAlto) / 2;
    const alto = foco.libreEntrepano ?? 0.3;
    // Lo que tiene que entrar de alto: el entrepaño con su labio y el
    // porta-precios (6 cm), al 75 % del cuadro; o dos repisas y media.
    const visible = mueble.w < 0.5 ? (alto + 0.03) * 2.6 : (alto + 0.06) / LLENADO_DE_CERCA;
    const ideal = Math.min(1.8, Math.max(0.6, visible / (2 * Math.tan(mitadV))));
    const dist = Math.max(0.6, Math.min(ideal, libre || ideal));
    return conAltura({ x: centro.x + n.x * dist, z: centro.z + n.z * dist }, mira, Math.min(1.65, mira + 0.1));
  }

  const mira = (foco.yBajo + foco.yAlto) / 2;
  const altoFoco = Math.max(0.1, foco.yAlto - foco.yBajo);
  const ideal = Math.max(
    (altoFoco * 1.12) / (2 * Math.tan(mitadV)),
    (mueble.w * 1.1) / (2 * Math.tan(mitadH)),
  );
  const dist = Math.max(0.9, Math.min(ideal, libre));
  // Por entrepaño, casi perpendicular a lo elegido: desde 1,2 m un entrepaño
  // bajo se veía con 30° de picado y la bandeja vacía de arriba se llevaba
  // la atención. La cara entera, desde la altura de un comprador.
  const yCamara = foco.porEntrepano ? mira + 0.12 : Math.min(1.6, Math.max(1.2, mira + 0.35));
  const frente = conAltura({ x: centro.x + n.x * dist, z: centro.z + n.z * dist }, mira, yCamara);
  if (toma === "frente") return frente;

  // Tres cuartos: el mismo punto girado alrededor de la mira, del lado con
  // más pasillo. Se acerca si de ese lado hay menos lugar que de frente.
  const girar = (a: number) => ({
    x: n.x * Math.cos(a) - n.z * Math.sin(a),
    z: n.x * Math.sin(a) + n.z * Math.cos(a),
  });
  const lados = [35, -35].map((g) => {
    const dir = girar((g * Math.PI) / 180);
    return { dir, libre: distanciaLibre(centro, dir, obstaculos, limites) };
  }).sort((a, b) => b.libre - a.libre);
  if (evitar) {
    // Primero el lado que se ALEJA del punto a evitar, si tiene el pasillo
    // mínimo; si no, queda el orden por lugar libre.
    const haciaEvitar = (l: { dir: { x: number; z: number } }) =>
      l.dir.x * (evitar.x - centro.x) + l.dir.z * (evitar.z - centro.z);
    const lejos = lados.reduce((a, b) => (haciaEvitar(b) < haciaEvitar(a) ? b : a));
    if (lejos.libre >= 0.9 && lados[0] !== lejos) lados.reverse();
  }
  for (const { dir, libre: l } of lados) {
    const d = Math.max(0.9, Math.min(dist, l));
    const pos = { x: centro.x + dir.x * d, z: centro.z + dir.z * d };
    const adentro = pos.x > limites.minX && pos.x < limites.maxX && pos.z > limites.minZ && pos.z < limites.maxZ;
    if (adentro && !chocaEn(obstaculos, pos.x, pos.z)) return conAltura(pos, mira, yCamara);
  }
  return frente;
}
