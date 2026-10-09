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

// ─── El cielo raso de la pantalla de venta ────────────────────────────────────

/**
 * Altura del cielo raso de la pantalla de venta, en metros.
 *
 * Es el de un supermercado mediano, y no los 4,5 m de los muros de la
 * caminata, por una cuenta y no por gusto: con la toma de venta de hoy (la
 * cámara a 1,25 m, el borde de arriba del cuadro a ~16° sobre la horizontal)
 * y el muro del fondo a 5-11 m, un techo a 4,5 m no entra en NINGUNA toma
 * —lo que llena la mitad de arriba del cuadro es el muro—, y uno a 3,2 m deja
 * entre 56 y 127 filas de cielo raso (de 1080) en las tomas de la punta y del
 * robatope. En la nevera, con el muro de atrás a 2,5 m, lo de arriba es el
 * muro en los dos casos.
 */
export const ALTO_CIELO_RASO = 3.2;

/**
 * Las luminarias embutidas en el cielo raso: tiras de 2,4 × 0,2 m, en filas
 * paralelas a las góndolas cada 3 m, con 0,6 m entre tira y tira, centradas en
 * la planta con 0,5 m de margen contra el muro. Es el paño de luz corrido que
 * tiene cualquier supermercado, y lo que dice «tienda» en la parte de arriba
 * del cuadro.
 */
export const LUMINARIA = {
  largo: 2.4,
  ancho: 0.2,
  /** Entre centro y centro de dos tiras de la misma fila: el largo y 0,6 m. */
  pasoEnFila: 3.0,
  /** Entre fila y fila. */
  pasoEntreFilas: 3.0,
  /** Lo que queda libre entre la tira y el muro. */
  margen: 0.5,
} as const;

/**
 * La grilla de las luminarias, dicha con parámetros y no como lista.
 *
 * El brillo de las luminarias en el acero y su reflejo en el piso (la luz de
 * venta, en `luzDeVenta.ts`) se calculan POR PÍXEL: recorrer cien tiras por
 * píxel, pasadas en uniformes, es caro y en una placa integrada puede pasarse
 * del límite de uniformes. Con la grilla, saber si un punto del cielo raso cae
 * en una tira es una cuenta de `floor`, en O(1).
 *
 * Las tiras están en `origen + i·pasoU·U + j·pasoV·V` (i < cuantas.u, j <
 * cuantas.v), con U = (cos giro, −sin giro) y V = (sin giro, cos giro) en
 * (x, z): el giro es el `rotY` de three, así que una tira girada `giro` tiene
 * el largo en U.
 */
export interface GrillaDeLuminarias {
  origen: { x: number; z: number };
  paso: { u: number; v: number };
  /** Largo (u) y ancho (v) de cada tira. */
  tamano: { u: number; v: number };
  /** 0 (filas a lo largo de X) o π/2 (a lo largo de Z). */
  giro: number;
  cuantas: { u: number; v: number };
  /** A qué altura cuelgan (5 mm bajo el cielo raso). */
  y: number;
}

export interface Luminaria { x: number; z: number; rotY: number }

/** Los dos ejes de la grilla, en (x, z). */
export function ejesDeGrilla(giro: number): { u: { x: number; z: number }; v: { x: number; z: number } } {
  const c = Math.cos(giro), s = Math.sin(giro);
  return { u: { x: c, z: -s }, v: { x: s, z: c } };
}

/**
 * Hacia dónde corren las góndolas de una planta: 0 si la mayoría corre a lo
 * largo de X, π/2 si a lo largo de Z.
 *
 * Vota cada mueble alargado (el lado largo al menos 1,3 veces el corto) con
 * su largo: dos góndolas de 3,6 m pesan más que tres puntas de 0,9. Sin
 * ningún mueble alargado, a lo largo del lado más largo del local. Sólo dos
 * direcciones porque el local es una caja alineada a los ejes (`limites`): una
 * grilla girada 20° dentro de un rectángulo recto deja tiras cortadas por el
 * muro.
 */
export function direccionDeGondolas(muebles: MuebleEnPlanta[], limites: LimitesPlanta): number {
  let enX = 0, enZ = 0;
  for (const f of muebles) {
    const largo = Math.max(f.w, f.d), corto = Math.min(f.w, f.d);
    if (largo < corto * 1.3) continue;
    const eje = (f.rotY ?? 0) + (f.w >= f.d ? 0 : Math.PI / 2);
    if (Math.abs(Math.cos(eje)) >= Math.abs(Math.sin(eje))) enX += largo; else enZ += largo;
  }
  if (enX === 0 && enZ === 0) return limites.w >= limites.d ? 0 : Math.PI / 2;
  return enX >= enZ ? 0 : Math.PI / 2;
}

/**
 * Dónde van las luminarias del cielo raso: la lista de tiras (para dibujarlas,
 * una `InstancedMesh`) y la grilla que las reproduce (para la luz de venta).
 *
 * Una planta vacía cae en la caja nominal de `limites` y lleva su grilla igual;
 * una planta tan chica que no entra una tira, ninguna.
 */
export function luminariasDeTienda(
  limites: LimitesPlanta,
  muebles: MuebleEnPlanta[],
): { instancias: Luminaria[]; grilla: GrillaDeLuminarias } {
  const giro = direccionDeGondolas(muebles, limites);
  const { u, v } = ejesDeGrilla(giro);
  // Lo que mide el local a lo largo de cada eje de la grilla.
  const largoU = giro === 0 ? limites.w : limites.d;
  const largoV = giro === 0 ? limites.d : limites.w;
  const { largo, ancho, pasoEnFila, pasoEntreFilas, margen } = LUMINARIA;
  // Cuántas y cada cuánto, de margen a margen. El paso de 3 m es el nominal:
  // se ajusta para que la primera y la última tira queden a 0,5 m del muro,
  // como las deja un luminotécnico (las tiras son de medida fija; lo que se
  // corre es la separación). Centradas con el paso fijo, en la sede de
  // pruebas quedaba 1,3 m de cielo raso sin luz contra cada muro, y la toma en
  // tres cuartos del robatope —que mira a una esquina— no veía ninguna.
  const repartir = (lado: number, tira: number, paso: number) => {
    const util = lado - 2 * margen - tira;
    if (util < 0) return { n: 0, paso };
    if (util < 1e-9) return { n: 1, paso };
    const menos = Math.max(1, Math.floor(util / paso + 1e-9));
    // De las dos cantidades que rodean el paso nominal, la que más se le
    // acerca, sin que dos tiras queden a menos de 20 cm.
    const opciones = [menos, menos + 1]
      .map((intervalos) => ({ n: intervalos + 1, paso: util / intervalos }))
      .filter((o) => o.paso >= tira + 0.2)
      .sort((a, b) => Math.abs(a.paso - paso) - Math.abs(b.paso - paso));
    return opciones[0] ?? { n: 1, paso };
  };
  const enU = repartir(largoU, largo, pasoEnFila);
  const enV = repartir(largoV, ancho, pasoEntreFilas);
  const nu = enU.n, nv = enV.n;
  // Centradas en la planta: la primera tira, media grilla atrás del centro.
  const du = (Math.max(0, nu - 1) * enU.paso) / 2;
  const dv = (Math.max(0, nv - 1) * enV.paso) / 2;
  const origen = {
    x: limites.cx - u.x * du - v.x * dv,
    z: limites.cz - u.z * du - v.z * dv,
  };
  const grilla: GrillaDeLuminarias = {
    origen,
    paso: { u: enU.paso, v: enV.paso },
    tamano: { u: largo, v: ancho },
    giro,
    cuantas: { u: nu, v: nv },
    y: ALTO_CIELO_RASO - 0.005,
  };
  const instancias: Luminaria[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      instancias.push({
        x: origen.x + u.x * i * enU.paso + v.x * j * enV.paso,
        z: origen.z + u.z * i * enU.paso + v.z * j * enV.paso,
        rotY: giro,
      });
    }
  }
  return { instancias, grilla };
}

/** Un punto del mundo visto por una cámara: en coordenadas normalizadas del
 *  cuadro (−1…1, y hacia arriba) y su profundidad a lo largo de la mirada, en
 *  metros (negativa: detrás de la cámara). Es la misma proyección que hace
 *  three con una `PerspectiveCamera` sin roll mirando de `pos` a `target`. */
export function proyectar(
  vista: Vista3D, fovGrados: number, aspecto: number, punto: { x: number; y: number; z: number },
): { x: number; y: number; profundidad: number } {
  const { f, r, arriba } = marcoDeVista(vista);
  const d = { x: punto.x - vista.posX, y: punto.y - vista.posY, z: punto.z - vista.posZ };
  const zc = d.x * f.x + d.y * f.y + d.z * f.z;
  const t = Math.tan((fovGrados * Math.PI) / 360);
  return {
    x: (d.x * r.x + d.y * r.y + d.z * r.z) / (zc * t * aspecto),
    y: (d.x * arriba.x + d.y * arriba.y + d.z * arriba.z) / (zc * t),
    profundidad: zc,
  };
}

/** La dirección (normalizada) del rayo de un punto del cuadro (−1…1). */
export function rayoDeVista(
  vista: Vista3D, fovGrados: number, aspecto: number, nx: number, ny: number,
): { x: number; y: number; z: number } {
  const { f, r, arriba } = marcoDeVista(vista);
  const t = Math.tan((fovGrados * Math.PI) / 360);
  const d = {
    x: f.x + r.x * nx * t * aspecto + arriba.x * ny * t,
    y: f.y + r.y * nx * t * aspecto + arriba.y * ny * t,
    z: f.z + r.z * nx * t * aspecto + arriba.z * ny * t,
  };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}

function marcoDeVista(v: Vista3D) {
  const n = (a: { x: number; y: number; z: number }) => {
    const l = Math.hypot(a.x, a.y, a.z);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const f = n({ x: v.targetX - v.posX, y: v.targetY - v.posY, z: v.targetZ - v.posZ });
  // derecha = f × arriba del mundo; arriba de la cámara = derecha × f.
  const r = n({ x: -f.z, y: 0, z: f.x });
  const arriba = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, arriba };
}

/**
 * Dónde choca un rayo que sale de adentro del local: con el piso, con el
 * cielo raso o con un muro (el primero), y a qué distancia. Los muros de
 * venta van de piso a cielo raso en el borde de `limites`.
 */
export function choqueEnElLocal(
  o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number },
  limites: Caja, techo = ALTO_CIELO_RASO,
): { que: "piso" | "techo" | "muro"; t: number } {
  let t = Infinity, que: "piso" | "techo" | "muro" = "muro";
  if (d.y > 1e-9) { t = (techo - o.y) / d.y; que = "techo"; }
  else if (d.y < -1e-9) { t = -o.y / d.y; que = "piso"; }
  for (const [eje, val] of [["x", limites.minX], ["x", limites.maxX], ["z", limites.minZ], ["z", limites.maxZ]] as const) {
    const de = d[eje];
    if (Math.abs(de) < 1e-12) continue;
    const tm = (val - o[eje]) / de;
    if (tm > 1e-9 && tm < t) { t = tm; que = "muro"; }
  }
  return { que, t };
}

// ─── El piso de la pantalla de venta ──────────────────────────────────────────

/** La sombra al pie de los muebles: cuánto se oscurece el piso, cada cuánto
 *  se mide y hasta dónde llega. */
export const SOMBRA_AL_PIE = {
  /** Metros por píxel del mapa: una sede de 40 × 30 m son 120 KB. */
  paso: 0.1,
  /** Hasta dónde se difumina desde el borde de la huella. */
  alcance: 0.3,
  /** Cuánto oscurece al pie (en el shader del piso). */
  maximo: 0.3,
} as const;

/**
 * El mapa de la sombra al pie de cada mueble, para el piso de la pantalla de
 * venta: un valor por píxel de 10 cm, 255 bajo el mueble y a su pie, que se
 * desvanece hasta 0 a 30 cm del borde. Es lo que hace que un mueble se APOYE
 * en el piso y no flote sobre él («muebles apoyados en nada», dijo la
 * crítica): la sombra de la direccional cae casi a plomo y no asoma.
 *
 * Las huellas son las de la caminata (`huella`, con la rotación), de los
 * muebles que estorban (más altos que `ALTURA_PISABLE`). Cada mueble pinta
 * sólo su caja agrandada, así que cuesta lo que miden los muebles y no la
 * sede por la cantidad de muebles. Pura: se prueba sin DOM.
 */
export function sombraDeHuellas(
  muebles: MuebleEnPlanta[], limites: Caja,
): { datos: Uint8Array; ancho: number; alto: number; origen: { x: number; z: number }; paso: number } {
  const { paso, alcance } = SOMBRA_AL_PIE;
  const ancho = Math.max(1, Math.ceil((limites.maxX - limites.minX) / paso));
  const alto = Math.max(1, Math.ceil((limites.maxZ - limites.minZ) / paso));
  const datos = new Uint8Array(ancho * alto);
  const origen = { x: limites.minX, z: limites.minZ };
  for (const f of muebles) {
    if ((f.h ?? Infinity) <= ALTURA_PISABLE) continue;
    const c = huella(f);
    const i0 = Math.max(0, Math.floor((c.minX - alcance - origen.x) / paso));
    const i1 = Math.min(ancho - 1, Math.ceil((c.maxX + alcance - origen.x) / paso));
    const j0 = Math.max(0, Math.floor((c.minZ - alcance - origen.z) / paso));
    const j1 = Math.min(alto - 1, Math.ceil((c.maxZ + alcance - origen.z) / paso));
    for (let j = j0; j <= j1; j++) {
      const z = origen.z + (j + 0.5) * paso;
      const dz = Math.max(0, c.minZ - z, z - c.maxZ);
      for (let i = i0; i <= i1; i++) {
        const x = origen.x + (i + 0.5) * paso;
        const dx = Math.max(0, c.minX - x, x - c.maxX);
        const d = Math.hypot(dx, dz);
        if (d >= alcance) continue;
        const v = Math.round(255 * Math.pow(1 - d / alcance, 1.5));
        const k = j * ancho + i;
        if (v > datos[k]) datos[k] = v;
      }
    }
  }
  return { datos, ancho, alto, origen, paso };
}

/** El valor del mapa en un punto del piso (0…1), con el mismo filtro
 *  bilineal que hace la placa: lo usan las pruebas. */
export function sombraEn(m: ReturnType<typeof sombraDeHuellas>, x: number, z: number): number {
  const fx = (x - m.origen.x) / m.paso - 0.5, fz = (z - m.origen.z) / m.paso - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const v = (ii: number, jj: number) => {
    const a = Math.max(0, Math.min(m.ancho - 1, ii)), b = Math.max(0, Math.min(m.alto - 1, jj));
    return m.datos[b * m.ancho + a] / 255;
  };
  return (v(i, j) * (1 - ax) + v(i + 1, j) * ax) * (1 - az) + (v(i, j + 1) * (1 - ax) + v(i + 1, j + 1) * ax) * az;
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
