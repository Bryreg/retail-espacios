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
