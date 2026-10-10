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
  lados: readonly (1 | -1)[] = [1, -1],
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
  for (const lado of lados) {
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
  /** En un mueble angosto (el robatope: una bolsa por repisa) `yEntrepano` y
   *  `libreEntrepano` son de un PAR de repisas (`focoDeLaPrueba`), y «De
   *  cerca» las encuadra al `LLENADO_DE_PAR` del alto. */
  parDeRepisas?: boolean;
  /** Dónde termina la cara y empieza el copete (la punta; `techoDeCara` de
   *  `medidas.ts`), y cuánto mide el copete. «De cerca» no corta el copete
   *  por la mitad. */
  techoDeCara?: number;
  altoDeCopete?: number;
  /** «De frente» desde tan atrás como deja el pasillo (con el campo visual
   *  abierto de `fovParaLaCara`): más cerca, la cara larga no entra. */
  alFondo?: boolean;
}

/** Qué parte del alto del cuadro llenan las dos repisas de «De cerca» en un
 *  mueble angosto. */
// 0,8 en el plano de la cara. La crítica mide en la captura de la bolsa de
// arriba al riel de la repisa de abajo: con 0,7 daba 62 % y con 0,77, 64 %
// (las repisas se inclinan y el producto queda adelante del plano de la
// mira); pide 65-75 %, idealmente 68-70. Con 0,8, 66-67 % y el remate
// todavía entra arriba: más cerrado, el remate se corta y la toma pierde el
// mueble.
export const LLENADO_DE_PAR = 0.8;

/** La franja de abajo del cuadro que puede tapar el HUD de Presentar (110 px
 *  de 1080). En «De cerca» el producto del entrepaño elegido queda arriba de
 *  ella: el HUD se esconde solo, pero vuelve con cualquier movimiento. */
export const FRANJA_DEL_HUD = 110 / 1080;

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
  incluir?: readonly { x: number; y?: number; z: number }[],
  corrida?: { x: number; z: number } | null,
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
    // porta-precios (6 cm), al 75 % del cuadro; en un mueble angosto, el par
    // de repisas al 70 % (con dos repisas y media, la bolsa ocupaba ~245 px y
    // el resto del cuadro era góndola vacía y pared).
    const visible = foco.parDeRepisas ? alto / LLENADO_DE_PAR
      : mueble.w < 0.5 ? (alto + 0.03) * 2.6 : (alto + 0.06) / LLENADO_DE_CERCA;
    const ideal = Math.min(1.8, Math.max(0.6, visible / (2 * Math.tan(mitadV))));
    const dist = Math.max(0.6, Math.min(ideal, libre || ideal));
    const pos = { x: centro.x + n.x * dist, z: centro.z + n.z * dist };
    const yCamara = Math.min(1.65, mira + 0.1);
    const conMira = (m: number) => conAltura(pos, m, yCamara);
    const enCuadro = (m: number, y: number) =>
      proyectar(conMira(m), fovGrados, aspecto, { x: centro.x, y, z: centro.z }).y;
    // Dónde corta el borde de arriba del cuadro el plano de la cara.
    const bordeDeArriba = (m: number) => {
      const v = conMira(m);
      const r = rayoDeVista(v, fovGrados, aspecto, 0, 1);
      const haciaLaCara = -(r.x * n.x + r.z * n.z);
      return haciaLaCara > 1e-6 ? v.posY + (r.y * dist) / haciaLaCara : Infinity;
    };
    /** La mira más alta, entre `desde` y 40 cm más abajo, que cumple `ok`
     *  (bajar la mira sube el producto en el cuadro y baja el borde de
     *  arriba). Si ninguna lo cumple, la más baja. */
    const bajarHasta = (desde: number, ok: (m: number) => boolean) => {
      if (ok(desde)) return desde;
      let alta = desde, baja = desde - 0.4;
      if (!ok(baja)) return baja;
      for (let i = 0; i < 30; i++) {
        const medio = (alta + baja) / 2;
        if (ok(medio)) baja = medio; else alta = medio;
      }
      return baja;
    };
    let m = mira;
    // El pie del producto, por encima de la franja del HUD; sin sacar del
    // cuadro lo de arriba del entrepaño.
    const pie = mira - alto / 2, techo = mira + alto / 2;
    const lineaDelHud = -1 + 2 * FRANJA_DEL_HUD;
    if (enCuadro(m, pie) < lineaDelHud) {
      const bajada = bajarHasta(m, (x) => enCuadro(x, pie) >= lineaDelHud);
      if (enCuadro(bajada, techo) <= 0.98) m = bajada;
    }
    // El copete de la punta: si el borde de arriba lo corta, la mira baja lo
    // justo para que el borde quede en la cenefa. Medio vaso del copete
    // colgando del borde del cuadro parecía un objeto colgado del techo.
    if (foco.techoDeCara != null && foco.altoDeCopete != null) {
      const piso = foco.techoDeCara, tope = foco.techoDeCara + foco.altoDeCopete;
      const b = bordeDeArriba(m);
      if (b > piso && b < tope) m = bajarHasta(m, (x) => bordeDeArriba(x) <= piso - 0.01);
    }
    return conMira(m);
  }

  const mira = (foco.yBajo + foco.yAlto) / 2;
  const altoFoco = Math.max(0.1, foco.yAlto - foco.yBajo);
  // Lo que tiene que entrar de ancho, a cada lado del centro de la cara: el
  // mueble y, con `incluir`, la persona de escala. El centro NO se corre: el
  // cuadro se abre hasta ella sin descentrar el mueble que se vende.
  const tangente = { x: -n.z, z: n.x };
  const medioAncho = Math.max(mueble.w / 2,
    ...(incluir ?? []).map((p) => Math.abs((p.x - centro.x) * tangente.x + (p.z - centro.z) * tangente.z)));
  const ideal = Math.max(
    (altoFoco * 1.12) / (2 * Math.tan(mitadV)),
    (medioAncho * 2 * 1.1) / (2 * Math.tan(mitadH)),
  );
  const dist = Math.max(0.9, foco.alFondo ? libre : Math.min(ideal, libre));
  // Por entrepaño, casi perpendicular a lo elegido: desde 1,2 m un entrepaño
  // bajo se veía con 30° de picado y la bandeja vacía de arriba se llevaba
  // la atención. La cara entera, desde la altura de un comprador.
  const yCamara = foco.porEntrepano ? mira + 0.12 : Math.min(1.6, Math.max(1.2, mira + 0.35));
  const frente = conAltura({ x: centro.x + n.x * dist, z: centro.z + n.z * dist }, mira, yCamara);
  if (toma === "frente") {
    // Con `corrida` (la pantalla de venta con un vecino pegado,
    // `corridaPorVecino`), la toma se corre hacia el costado libre: la
    // cámara y la mira, juntas.
    const c = foco.porEntrepano ? null : corrida;
    return c ? { ...frente, posX: frente.posX + c.x, posZ: frente.posZ + c.z, targetX: frente.targetX + c.x, targetZ: frente.targetZ + c.z } : frente;
  }

  // Tres cuartos: el mismo punto girado alrededor de la mira, del lado con
  // más pasillo. Se acerca si de ese lado hay menos lugar que de frente.
  const girar = (a: number) => ({
    x: n.x * Math.cos(a) - n.z * Math.sin(a),
    z: n.x * Math.sin(a) + n.z * Math.cos(a),
  });
  // El eje X local del mueble en el mundo (el de `ladosPorLibre`): de qué
  // costado de la cara queda la cámara girada.
  const ejeX = { x: Math.cos(mueble.rotY ?? 0), z: -Math.sin(mueble.rotY ?? 0) };
  const lados = [35, -35].map((g) => {
    const dir = girar((g * Math.PI) / 180);
    const lado: 1 | -1 = dir.x * ejeX.x + dir.z * ejeX.z >= 0 ? 1 : -1;
    return { dir, libre: distanciaLibre(centro, dir, obstaculos, limites), alCostado: libreAlCostado(mueble, cara, lado, obstaculos, limites) };
  }).sort((a, b) => b.libre - a.libre);
  // El VECINO manda sobre la persona. Girada hacia el costado que tiene un
  // mueble pegado, la cámara lo deja en primer plano: en la toma de NEV-01,
  // NEV-02 —libre, con sus botellas mudas— ocupaba casi la mitad del cuadro
  // y la nevera que se vendía quedaba chica y al fondo. Girada hacia el
  // costado LIBRE, el vecino queda lejos y en parte detrás del propio mueble.
  // Con un vecino a menos de `VECINO_PEGADO` de un canto y más lugar del
  // otro, gana el otro (si tiene el pasillo mínimo), aunque ahí esté la
  // persona: `personaYTomaDeVenta` la deja sólo si entra entera y al costado.
  const [l0, l1] = lados;
  const pegado = Math.min(l0.alCostado, l1.alCostado) < VECINO_PEGADO && Math.abs(l0.alCostado - l1.alCostado) > 1e-9;
  if (pegado) {
    const libreDeVecino = l0.alCostado > l1.alCostado ? l0 : l1;
    if (libreDeVecino.libre >= 0.9 && lados[0] !== libreDeVecino) lados.reverse();
  } else if (evitar) {
    // Primero el lado que se ALEJA del punto a evitar, si tiene el pasillo
    // mínimo; si no, queda el orden por lugar libre.
    const haciaEvitar = (l: { dir: { x: number; z: number } }) =>
      l.dir.x * (evitar.x - centro.x) + l.dir.z * (evitar.z - centro.z);
    const lejos = lados.reduce((a, b) => (haciaEvitar(b) < haciaEvitar(a) ? b : a));
    if (lejos.libre >= 0.9 && lados[0] !== lejos) lados.reverse();
  }
  // Lo que hay que incluir con su altura (las esquinas de la persona): girada,
  // la cámara puede quedar más cerca de ella que del mueble y cortarle la
  // cabeza. Se aleja de a 5 cm, sin salir del pasillo de ese lado, hasta que
  // entra; si no entra, queda donde iba (y quien llama prueba otra cosa).
  const conAlto = (incluir ?? []).filter((p) => p.y != null);
  const entra = (v: Vista3D) => conAlto.every((p) => {
    const q = proyectar(v, fovGrados, aspecto, { x: p.x, y: p.y!, z: p.z });
    return dentroDelCuadro(q.x, q.y, q.profundidad > 0);
  });
  for (const { dir, libre: l } of lados) {
    const lugar = (d: number) => {
      const pos = { x: centro.x + dir.x * d, z: centro.z + dir.z * d };
      const adentro = pos.x > limites.minX && pos.x < limites.maxX && pos.z > limites.minZ && pos.z < limites.maxZ;
      return adentro && !chocaEn(obstaculos, pos.x, pos.z) ? conAltura(pos, mira, yCamara) : null;
    };
    const d0 = Math.max(0.9, Math.min(dist, l));
    const v0 = lugar(d0);
    if (!v0) continue;
    if (conAlto.length && !entra(v0)) {
      for (let d = d0 + 0.05; d <= l + 1e-9; d += 0.05) {
        const v = lugar(d);
        if (v && entra(v)) return v;
      }
    }
    return v0;
  }
  return frente;
}

// ─── La persona y la toma, con una sola cuenta ───────────────────────────────

/** La figura de escala: el alto y medio ancho del plano que la dibuja
 *  (`SiluetaDeEscala`). Las esquinas que se proyectan para saber si entra son
 *  las de ESTE rectángulo. */
export const FIGURA_DE_ESCALA = { alto: 1.7, medioAncho: 0.26 } as const;

/** Hasta dónde del cuadro (en coordenadas normalizadas, ±1 el borde) cuenta
 *  como «adentro» para la persona y lo que la toma tiene que incluir. */
export const BORDE_DEL_CUADRO = 0.98;
/**
 * ¿Un punto proyectado cae dentro del cuadro? `x`, `y` en coordenadas
 * normalizadas y `delante` si está delante de la cámara. Es la MISMA regla
 * para la cuenta de la toma (`personaYTomaDeVenta`) y para la silueta que se
 * dibuja (`SiluetaDeEscala`): media persona cortada por el borde no da escala,
 * y si las dos cuentas no coincidieran la silueta saldría partida.
 */
export function dentroDelCuadro(x: number, y: number, delante: boolean): boolean {
  return delante && Math.abs(x) <= BORDE_DEL_CUADRO && Math.abs(y) <= BORDE_DEL_CUADRO;
}

/** Las separaciones del canto que se prueban, de la más holgada a la más
 *  pegada. A 1-1,2 m la persona se lee como alguien en el pasillo y no le
 *  quita peso al mueble; pegada a 30 cm competía con él. */
export const SEPARACIONES_DE_LA_FIGURA = [1.2, 1.1, 1.0, 0.8, 0.6, 0.45, 0.3] as const;

/** Hasta dónde llega el foco con la persona en el cuadro: su cabeza (1,70)
 *  con aire. */
const ALTO_CON_PERSONA = 1.75;

/** Lo que se deja arriba del mueble en la toma con persona. */
export const AIRE_SOBRE_EL_MUEBLE = 0.06;

/** El aire mínimo entre la persona y la caja del mueble en el cuadro (de
 *  −1 a 1): 0,032 son 30 px en un cuadro de 1920. */
export const AIRE_DE_LA_FIGURA = 0.032;

/** Cuánto piso libre hay al costado de cada canto de la cara, hacia afuera y
 *  en su plano (de a 5 cm, hasta 3 m; cuenta cualquier mueble, también el que
 *  toca el canto), y los lados en ese orden: el más libre primero. */
export function ladosPorLibre(
  mueble: { cx: number; cz: number; w: number; d: number; rotY?: number },
  cara: "A" | "B",
  obstaculos: Caja[],
  limites: Caja,
): (1 | -1)[] {
  const libre = (lado: 1 | -1) => libreAlCostado(mueble, cara, lado, obstaculos, limites);
  return libre(1) >= libre(-1) ? [1, -1] : [-1, 1];
}

/** Lo más que puede medir lo ocupado (con el cuerpo inflado) entre el canto
 *  y la persona: un exhibidor angosto, no otro mueble entero. */
export const ANGOSTO_ENTRE_MEDIO = 0.7;

/** Hasta qué separación del canto se puede parar la persona de ese costado:
 *  lo que haya de piso, contando como libre un tramo ocupado de a lo sumo
 *  `ANGOSTO_ENTRE_MEDIO` (el robatope pegado a la punta). Se corta en el
 *  primer tramo ocupado más largo, o en el borde del local. */
export function alcanceDeLaFigura(
  mueble: { cx: number; cz: number; w: number; d: number; rotY?: number },
  cara: "A" | "B",
  lado: 1 | -1,
  obstaculos: Caja[],
  limites: Caja,
): number {
  const rotY = mueble.rotY ?? 0;
  const n = normalDeCara(rotY, cara);
  const t = { x: Math.cos(rotY), z: -Math.sin(rotY) };
  let l = 0, ocupado = 0;
  for (let s = 0.05; s <= 3 + 1e-9; s += 0.05) {
    const x = mueble.cx + n.x * (mueble.d / 2) + t.x * lado * (mueble.w / 2 + s);
    const z = mueble.cz + n.z * (mueble.d / 2) + t.z * lado * (mueble.w / 2 + s);
    if (x < limites.minX || x > limites.maxX || z < limites.minZ || z > limites.maxZ) break;
    if (chocaEn(obstaculos, x, z)) {
      ocupado += 0.05;
      if (ocupado > ANGOSTO_ENTRE_MEDIO + 1e-9) break;
      continue;
    }
    ocupado = 0;
    l = s;
  }
  return l;
}

/** Un mueble a menos de esto de un canto de la cara es un VECINO PEGADO: la
 *  toma «Tres cuartos» no gira hacia él (`vistaDeVenta`). */
export const VECINO_PEGADO = 1.0;

/** El campo visual (vertical) más abierto que acepta «De frente» en la
 *  pantalla de venta: unos 24 mm de una cámara de fotos, el de una toma de
 *  pasillo. Más, y las cajas de los bordes se estiran. */
export const FOV_MAXIMO_DE_FRENTE = 70;

/**
 * El campo visual de «De frente» para que la cara ENTERA entre a lo ancho
 * (con un 10 % de aire) desde donde deja pararse el pasillo, o `base` si ya
 * entra. Una góndola de 3,6 m frente a un pasillo de 2 m no entra con 50°:
 * la lámina de Kellogg's cortaba el bloque de Müsli —el producto principal—
 * y el de Zucaritas.
 */
export function fovParaLaCara(
  mueble: { cx: number; cz: number; w: number; d: number; h: number; rotY?: number },
  cara: "A" | "B",
  obstaculos: Caja[],
  limites: Caja,
  aspecto = 16 / 9,
  base = 50,
): number {
  // Con la toma de verdad (`vistaDeVenta`, la cara entera): la cámara mira un
  // poco para abajo y las esquinas de arriba quedan más cerca que el centro,
  // así que la cuenta plana con el pasillo dejaba la góndola justo en el borde.
  // Las cuatro esquinas de la cara, dentro del 96 % del cuadro.
  const n = normalDeCara(mueble.rotY ?? 0, cara), t = { x: -n.z, z: n.x };
  const esquinas = [-1, 1].flatMap((lado) => [0, mueble.h].map((y) => ({
    x: mueble.cx + (n.x * mueble.d) / 2 + t.x * lado * mueble.w / 2, y, z: mueble.cz + (n.z * mueble.d) / 2 + t.z * lado * mueble.w / 2,
  })));
  for (let fov = base; fov <= FOV_MAXIMO_DE_FRENTE; fov += 1) {
    const v = vistaDeVenta(mueble, cara, "frente", { yBajo: 0, yAlto: mueble.h, alFondo: fov > base }, obstaculos, limites, fov, aspecto);
    if (esquinas.every((e) => { const q = proyectar(v, fov, aspecto, e); return q.profundidad > 0 && Math.abs(q.x) <= 0.96; })) return fov;
  }
  return FOV_MAXIMO_DE_FRENTE;
}

/** Cuánto se corre «De frente» hacia el costado libre cuando hay un vecino
 *  pegado del otro. */
export const DESCENTRADO_POR_VECINO = 0.18;

/**
 * La corrida de la toma «De frente» (en el mundo), o `null`.
 *
 * Con el mueble lleno de alto y centrado, una nevera de 1,2 m en un cuadro
 * 16:9 deja 1,2 m de cada lado: si la vecina está pegada, entra ENTERA en
 * uno de ellos (el 29 % del cuadro, con sus botellas mudas) y del otro queda
 * muro. Corrida 18 cm hacia el costado libre —el mueble sigue casi al centro,
 * un 5 % corrido—, la vecina queda cortada por el borde (menos del 25 %) y
 * la persona entra por el otro. Sólo si de un lado hay un vecino a menos de
 * `VECINO_PEGADO` y del otro al menos eso libre.
 */
export function corridaPorVecino(
  mueble: { cx: number; cz: number; w: number; d: number; rotY?: number },
  cara: "A" | "B",
  obstaculos: Caja[],
  limites: Caja,
): { x: number; z: number } | null {
  const izq = libreAlCostado(mueble, cara, -1, obstaculos, limites);
  const der = libreAlCostado(mueble, cara, 1, obstaculos, limites);
  if (Math.min(izq, der) >= VECINO_PEGADO || Math.max(izq, der) < VECINO_PEGADO) return null;
  const lado = der > izq ? 1 : -1, rotY = mueble.rotY ?? 0;
  return { x: Math.cos(rotY) * lado * DESCENTRADO_POR_VECINO, z: -Math.sin(rotY) * lado * DESCENTRADO_POR_VECINO };
}

/** El piso libre al costado de un canto de la cara (`lado`, en el eje X local
 *  del mueble), hacia afuera y en su plano: de a 5 cm, hasta 3 m. */
export function libreAlCostado(
  mueble: { cx: number; cz: number; w: number; d: number; rotY?: number },
  cara: "A" | "B",
  lado: 1 | -1,
  obstaculos: Caja[],
  limites: Caja,
): number {
  const rotY = mueble.rotY ?? 0;
  const n = normalDeCara(rotY, cara);
  // El eje X local del mueble en el mundo (el de `lugarDeLaFigura`).
  const t = { x: Math.cos(rotY), z: -Math.sin(rotY) };
  let l = 0;
  for (let s = 0.05; s <= 3 + 1e-9; s += 0.05) {
    const x = mueble.cx + n.x * (mueble.d / 2) + t.x * lado * (mueble.w / 2 + s);
    const z = mueble.cz + n.z * (mueble.d / 2) + t.z * lado * (mueble.w / 2 + s);
    if (x < limites.minX || x > limites.maxX || z < limites.minZ || z > limites.maxZ || chocaEn(obstaculos, x, z)) break;
    l = s;
  }
  return l;
}

/** Las cuatro esquinas de la figura parada en `p`, en el mundo. */
export function esquinasDeLaFigura(p: { x: number; z: number; rotY: number }): { x: number; y: number; z: number }[] {
  const c = Math.cos(p.rotY), s = Math.sin(p.rotY);
  const fuera: { x: number; y: number; z: number }[] = [];
  for (const lado of [-1, 1]) for (const y of [0, FIGURA_DE_ESCALA.alto]) {
    // El eje X local de la figura, como en `lugarDeLaFigura`.
    fuera.push({ x: p.x + lado * FIGURA_DE_ESCALA.medioAncho * c, y, z: p.z - lado * FIGURA_DE_ESCALA.medioAncho * s });
  }
  return fuera;
}

/**
 * La toma de venta («De frente» o «Tres cuartos») CON la persona de escala
 * entera adentro, o la de siempre sin persona.
 *
 * Antes la toma y la silueta se calculaban por separado: la toma encuadraba
 * el mueble con un 12 % de aire y la silueta se paraba a 30 cm del canto y se
 * escondía si una esquina quedaba fuera. En el robatope (1,6 m) el cuadro
 * cubría ~1,8 m centrado en 0,8: la cabeza quedaba afuera y no salía nadie,
 * y una bolsa de 23 cm no tenía contra qué medirse.
 *
 * Ahora es UNA cuenta: para cada separación (`SEPARACIONES_DE_LA_FIGURA`),
 * `lugarDeLaFigura` busca dónde pararla —el lado libre primero—, la toma sube
 * el foco hasta su cabeza y abre el cuadro hasta ella sin correr el centro
 * del mueble (`incluir`), y se proyectan sus cuatro esquinas con esa MISMA
 * cámara. La primera en que entran las cuatro (dentro de ±0,98) gana, y la
 * escena dibuja la silueta ahí. Si en ninguna entra, la toma de siempre y sin
 * persona: media persona no da escala, distrae.
 *
 * No se usa por entrepaño ni «De cerca»: esas tomas miran lo elegido de
 * frente y de cerca, donde una persona entera no cabe.
 *
 * `separaciones` es el orden en que se prueban. La lámina las prueba de la
 * más pegada a la más holgada: cada toma se recorta a la forma del mueble y
 * una persona a 1,2 m obligaba a abrir el recorte hasta achicar el mueble.
 * `extremo` es el |x| (−1…1) de la esquina de la figura más lejos del centro
 * del cuadro: hasta ahí tiene que llegar el recorte para no partirla.
 */
export function personaYTomaDeVenta(
  mueble: { cx: number; cz: number; w: number; d: number; h: number; rotY?: number },
  cara: "A" | "B",
  toma: "frente" | "tres_cuartos",
  foco: FocoDeVenta,
  obstaculos: Caja[],
  limites: Caja,
  fovGrados = 50,
  aspecto = 16 / 9,
  separaciones: readonly number[] = SEPARACIONES_DE_LA_FIGURA,
): { vista: Vista3D; persona: { x: number; z: number; rotY: number; separacion: number } | null; extremo: number } {
  const rotY = mueble.rotY ?? 0;
  // Con la persona en el cuadro, la toma es del mueble ENTERO: del piso (sus
  // pies) a lo más alto entre su cabeza y el remate del mueble, con aire. Con
  // el foco del producto a secas, la nevera de la demo salía con el cabezote
  // pegado al borde de arriba (3 % de aire) y la cenefa del muro cortada.
  const conPersona: FocoDeVenta = {
    ...foco, yBajo: Math.min(foco.yBajo, 0), yAlto: Math.max(foco.yAlto, ALTO_CON_PERSONA, mueble.h + AIRE_SOBRE_EL_MUEBLE),
  };
  // En la pantalla de venta, «De frente» con un vecino pegado se corre hacia
  // el costado libre (`corridaPorVecino`). Sólo acá: el «Encuadrar esta cara»
  // del editor sigue como siempre.
  const corrida = toma === "frente" ? corridaPorVecino(mueble, cara, obstaculos, limites) : null;
  // El lado LIBRE primero: el que tiene más piso sin muebles al costado del
  // canto, en el plano de la cara. Pegada al robatope, la punta tiene un
  // costado ocupado; con el orden fijo de `lugarDeLaFigura` la persona
  // saltaba por encima del robatope y quedaba delante de la góndola vecina.
  // Para cada separación, los dos lados: primero el libre, y si con él no
  // entra, el otro. En tres cuartos la cámara gira hacia el lado con pasillo;
  // si ése es el de la persona, la tiene a un metro y le corta la cabeza, y
  // del otro lado del mueble entra entera y sin quedar en primer plano.
  const lados = ladosPorLibre(mueble, cara, obstaculos, limites);
  // Sin otro mueble ENTERO entre el canto y la persona: a 1,2 m del robatope,
  // del lado de la punta pegada, quedaba parada más allá de la punta, junto a
  // otro mueble (y la toma «Tres cuartos», que ya no gira hacia el vecino
  // pegado, la elegía ahí). Se para hasta donde llega el piso de ese costado
  // (`alcanceDeLaFigura`): puede quedar más allá de un exhibidor angosto —el
  // robatope pegado a la punta, como alguien parado en el pasillo—, no más
  // allá de una punta o una nevera. Es lo que deja a la persona de la punta
  // del lado CONTRARIO a la cámara en «Tres cuartos»: con el piso libre a
  // secas, el robatope la mandaba del lado de la cámara, en primer plano y
  // más alta que el mueble.
  const alcance = { [1]: alcanceDeLaFigura(mueble, cara, 1, obstaculos, limites), [-1]: alcanceDeLaFigura(mueble, cara, -1, obstaculos, limites) };
  const lugares: { p: { x: number; z: number; rotY: number }; separacion: number }[] = [];
  for (const separacion of separaciones) for (const lado of lados) {
    if (separacion > alcance[lado] + 1e-9) continue;
    const p = lugarDeLaFigura({ x: mueble.cx, z: mueble.cz, w: mueble.w, rotY }, obstaculos, separacion, { d: mueble.d, cara }, [lado]);
    if (!p) continue;
    // Dentro del local: a 1,2 m del canto, una punta contra el muro la
    // paraba del otro lado de la pared.
    if (p.x < limites.minX + RADIO_PERSONA || p.x > limites.maxX - RADIO_PERSONA
      || p.z < limites.minZ + RADIO_PERSONA || p.z > limites.maxZ - RADIO_PERSONA) continue;
    lugares.push({ p, separacion });
  }
  type Hallada = { vista: Vista3D; persona: { x: number; z: number; rotY: number; separacion: number }; extremo: number };
  // Las ocho esquinas de la CAJA del mueble: la persona no se superpone con
  // ella en el cuadro, con `AIRE_DE_LA_FIGURA` de aire. Con las cuatro de la
  // cara sola, en «Tres cuartos» la silueta tapaba el costado de la nevera
  // que da a la cámara (40 px en la de Postobón): un recorte pegado delante.
  const cos = Math.cos(rotY), sen = Math.sin(rotY);
  const caja8 = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [0, mueble.h].map((y) => ({
    x: mueble.cx + a * mueble.w / 2 * cos + b * mueble.d / 2 * sen, y, z: mueble.cz - a * mueble.w / 2 * sen + b * mueble.d / 2 * cos,
  }))));
  const ver = (vista: Vista3D, { p, separacion }: (typeof lugares)[number]): Hallada | null => {
    const q = esquinasDeLaFigura(p).map((e) => proyectar(vista, fovGrados, aspecto, e));
    const entra = q.every((e) => dentroDelCuadro(e.x, e.y, e.profundidad > 0));
    const xs = caja8.map((e) => proyectar(vista, fovGrados, aspecto, e)).filter((e) => e.profundidad > 0).map((e) => e.x);
    const [a, b] = [Math.min(...xs) - AIRE_DE_LA_FIGURA, Math.max(...xs) + AIRE_DE_LA_FIGURA];
    const [pa, pb] = [Math.min(...q.map((e) => e.x)), Math.max(...q.map((e) => e.x))];
    const alCostado = pb < a || pa > b;
    return entra && alCostado ? { vista, persona: { ...p, separacion }, extremo: Math.max(...q.map((e) => Math.abs(e.x))) } : null;
  };
  const probar = (l: (typeof lugares)[number], conAltura: boolean): Hallada | null => {
    const esquinas = esquinasDeLaFigura(l.p);
    // Sin la altura de las esquinas, la toma sólo abre el cuadro hasta la
    // persona; con ella, en tres cuartos además se aleja hasta que entra.
    const incluir = conAltura ? esquinas : esquinas.map(({ x, z }) => ({ x, z }));
    return ver(vistaDeVenta(mueble, cara, toma, conPersona, obstaculos, limites, fovGrados, aspecto, l.p, incluir, corrida), l);
  };
  // 0. La primera separación en que la persona entra en la toma del mueble
  //    SIN abrir el cuadro: el mueble lleno de alto (su 12 % de aire) y la
  //    persona por el borde. Abriendo el cuadro hasta una persona a 1,2 m,
  //    la nevera de la demo ocupaba el 26 % del ancho y el resto era muro
  //    —«dos neveras solas en un salón vacío»—; a 0,8 m entra sin achicarla.
  const sinAbrir = vistaDeVenta(mueble, cara, toma, conPersona, obstaculos, limites, fovGrados, aspecto, lugares[0]?.p, undefined, corrida);
  for (const l of lugares) {
    if (toma === "tres_cuartos") break;
    const h = ver(sinAbrir, l);
    if (h) return h;
  }
  // 1. La primera separación en que entra sin mover la toma más que para
  //    abrir el cuadro.
  for (const l of lugares) {
    const h = probar(l, false);
    if (h) return h;
  }
  // 2. Si no, alejando la cámara (tres cuartos, del lado de la persona: le
  //    cortaba la cabeza): la que queda MÁS CERCA del mueble, que es la que
  //    lo deja más grande en el cuadro.
  let mejor: Hallada | null = null;
  const lejos = (v: Vista3D) => Math.hypot(v.posX - v.targetX, v.posZ - v.targetZ);
  for (const l of lugares) {
    const h = probar(l, true);
    if (h && (!mejor || lejos(h.vista) < lejos(mejor.vista) - 1e-9)) mejor = h;
  }
  return mejor ?? { vista: vistaDeVenta(mueble, cara, toma, foco, obstaculos, limites, fovGrados, aspecto, undefined, undefined, corrida), persona: null, extremo: 0 };
}
