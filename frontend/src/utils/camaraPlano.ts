/**
 * La cámara del plano de la sede: la del Editor 3D, dibujada en SVG.
 *
 * El dueño pidió (2026-09-23) mover el mapa de Vender y de Supervisar «de la
 * misma manera que se mueve en el editor 3D», sin la primera persona ni el
 * resto del editor, y que arranque «desde la vista superior como se ve en el
 * plano». Eso es exactamente lo que hace el `OrbitControls` de three.js que usa
 * el editor, y este archivo lo replica con la misma aritmética:
 *
 *   · **Los mismos gestos.** Botón izquierdo gira; el derecho —o el izquierdo
 *     con Shift, Ctrl o ⌘— mueve; la rueda acerca; el botón del medio acerca
 *     arrastrando. En pantalla táctil, un dedo gira y dos acercan y mueven.
 *   · **La misma velocidad.** Arrastrar el ALTO del lienzo entero es una vuelta
 *     completa (sí, el alto: así lo hace OrbitControls también en horizontal).
 *     Cada «clic» de rueda (100 de `deltaY`) acerca 1/0,95.
 *   · **La misma geometría.** Azimut y ángulo polar como los usa three.js —la
 *     cámara en (sen φ·sen θ, cos φ, sen φ·cos θ) respecto del punto de mira—,
 *     y el arrastre para mover corre el punto de mira sobre la derecha y el
 *     arriba de la pantalla (`screenSpacePanning`, que es lo que trae el
 *     editor).
 *
 * Lo que NO copia: la perspectiva. El plano es un plano —se lee como el del
 * editor 2D, con las medidas parejas en toda la sala—, así que la proyección
 * es ORTOGRÁFICA y acercar es escalar. Y el tope de arriba: el editor no deja
 * mirar a menos de 30° de la vertical, y este plano arranca justamente en 0°,
 * mirando derecho hacia abajo.
 *
 * Por qué SVG y no el lienzo 3D del editor: el mapa ya es SVG y todo lo que
 * cuelga de él —los rótulos que miden 10,5 px a todo acercamiento y se
 * esquivan entre sí, el resaltado que apaga la sala, la cara A o B que se toca,
 * el tooltip— se queda como está. Lo único que cambia es CÓMO se proyecta un
 * punto, y eso vive acá, sin DOM, para poder probarlo sin navegador
 * (`scripts/probar-camara.mjs`).
 */

/** Hacia dónde mira la cámara. Los ángulos de `OrbitControls`. */
export interface Vista {
  /** Azimut θ, en radianes. 0 = la cámara del lado de +z, mirando hacia −z:
   *  arriba en pantalla queda el fondo del plano, como en el editor 2D. */
  az: number;
  /** Ángulo polar φ desde la vertical. 0 = cenital, la vista superior. */
  pol: number;
}

/** La vista con la que abre: desde arriba, orientada como el plano 2D. */
export const VISTA_SUPERIOR: Vista = { az: 0, pol: 0 };

/** El tope de abajo, el mismo del editor (`maxPolarAngle = π / 2,1`): casi al
 *  ras del piso, sin pasar por debajo. */
export const POLAR_MAX = Math.PI / 2.1;

/** Cuánto se puede acercar y alejar, contra el encuadre de la sede entera. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;

/** Los senos y cosenos de una vista, calculados una vez. */
export interface Ejes {
  sa: number;
  ca: number;
  sp: number;
  cp: number;
}

export function ejes(v: Vista): Ejes {
  return { sa: Math.sin(v.az), ca: Math.cos(v.az), sp: Math.sin(v.pol), cp: Math.cos(v.pol) };
}

/** Un punto del mundo (metros; y hacia arriba) → pantalla (metros; y hacia
 *  abajo), relativo al origen.
 *
 *  x de pantalla = el punto sobre la DERECHA de la cámara, (cos θ, 0, −sen θ).
 *  y de pantalla = menos el punto sobre el ARRIBA de la cámara,
 *  (−sen θ·cos φ, sen φ, −cos θ·cos φ). En la vista superior (θ = φ = 0) queda
 *  x → x, z → y: el plano del editor 2D tal cual. */
export function proyectar(e: Ejes, x: number, y: number, z: number): [number, number] {
  return [x * e.ca - z * e.sa, (x * e.sa + z * e.ca) * e.cp - y * e.sp];
}

/** Qué tan cerca de la cámara está un punto: más grande, más cerca. */
export function profundidad(e: Ejes, x: number, y: number, z: number): number {
  return (x * e.sa + z * e.ca) * e.sp + y * e.cp;
}

/** Un corrimiento EN PANTALLA (metros) → el corrimiento en el mundo que lo
 *  produce, sobre la derecha y el arriba de la cámara. Es el «mover» del
 *  editor: el punto de mira se desliza en el plano de la pantalla. */
export function enElMundo(e: Ejes, sx: number, sy: number): [number, number, number] {
  // v = sx·derecha − sy·arriba
  return [
    sx * e.ca + sy * e.sa * e.cp,
    -sy * e.sp,
    -sx * e.sa + sy * e.ca * e.cp,
  ];
}

/** Girar como OrbitControls: arrastrar el alto entero del lienzo es una vuelta.
 *  Hacia la derecha baja el azimut; hacia abajo baja el polar —la cámara sube
 *  hacia la vista superior—. */
export function girar(v: Vista, dx: number, dy: number, altoPx: number): Vista {
  const alto = Math.max(1, altoPx);
  const vuelta = 2 * Math.PI;
  let az = v.az - (vuelta * dx) / alto;
  // Se mantiene acotado para que la cuenta no pierda precisión tras mil vueltas.
  az = Math.atan2(Math.sin(az), Math.cos(az));
  const pol = Math.min(POLAR_MAX, Math.max(0, v.pol - (vuelta * dy) / alto));
  return { az, pol };
}

/** Cuánto acerca un evento de rueda: la cuenta de OrbitControls, con su misma
 *  normalización —las ruedas que cuentan líneas o páginas, y el pellizco del
 *  panel táctil, que llega como rueda con Ctrl—. Devuelve el factor por el que
 *  se MULTIPLICA el acercamiento. */
export function factorDeRueda(deltaY: number, deltaMode = 0, ctrl = false): number {
  let d = deltaY;
  if (deltaMode === 1) d *= 16;
  else if (deltaMode === 2) d *= 100;
  if (ctrl) d *= 10;
  if (d === 0) return 1;
  const escala = Math.pow(0.95, Math.abs(d * 0.01));
  return d < 0 ? 1 / escala : escala;
}

// ─── Qué se ve de cada mueble ────────────────────────────────────────────────

/** La huella de un mueble en planta (sus lados van por los ejes) y su alto. */
export interface Huella {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
}

/** Un lado del mueble: el que da hacia −x, +x, −z o +z. */
export type Lado = "x-" | "x+" | "z-" | "z+";

const NORMAL: Record<Lado, [number, number]> = {
  "x-": [-1, 0], "x+": [1, 0], "z-": [0, -1], "z+": [0, 1],
};

/** Los lados que miran a la cámara. Desde arriba no se ve ninguno. */
export function ladosVisibles(e: Ejes): Lado[] {
  if (e.sp < 1e-6) return [];
  const out: Lado[] = [];
  for (const l of ["x-", "x+", "z-", "z+"] as Lado[]) {
    const [nx, nz] = NORMAL[l];
    if (nx * e.sa + nz * e.ca > 1e-9) out.push(l);
  }
  return out;
}

/** Las cuatro esquinas de un lado, ya proyectadas: arriba y abajo. */
export function esquinasDelLado(
  e: Ejes, h: Huella, lado: Lado, ox = 0, oz = 0,
): [number, number][] {
  const P = (x: number, y: number, z: number) => proyectar(e, x - ox, y, z - oz);
  switch (lado) {
    case "z+": return [P(h.x0, h.h, h.z1), P(h.x1, h.h, h.z1), P(h.x1, 0, h.z1), P(h.x0, 0, h.z1)];
    case "z-": return [P(h.x1, h.h, h.z0), P(h.x0, h.h, h.z0), P(h.x0, 0, h.z0), P(h.x1, 0, h.z0)];
    case "x+": return [P(h.x1, h.h, h.z1), P(h.x1, h.h, h.z0), P(h.x1, 0, h.z0), P(h.x1, 0, h.z1)];
    case "x-": return [P(h.x0, h.h, h.z0), P(h.x0, h.h, h.z1), P(h.x0, 0, h.z1), P(h.x0, 0, h.z0)];
  }
}

/** Cuánto se oscurece un lado. La luz viene de la izquierda de la pantalla,
 *  como en el isométrico de antes (0,14 el lado izquierdo, 0,26 el derecho):
 *  con la cámara girada, el lado que queda a la izquierda es el más claro. */
export function sombraDelLado(e: Ejes, lado: Lado): number {
  const [nx, nz] = NORMAL[lado];
  // La normal sobre la derecha de la cámara: −1 mira a la izquierda, +1 a la derecha.
  const haciaLaDerecha = nx * e.ca - nz * e.sa;
  return 0.2 + 0.085 * haciaLaDerecha;
}

// ─── El orden de pintado ─────────────────────────────────────────────────────

/**
 * De atrás hacia adelante, para que el de adelante tape al de atrás.
 *
 * Ordenar por el centro —lo que hacía el isométrico fijo, `cx + cz`— falla con
 * los muebles largos: una góndola de diez metros tiene el centro lejos de la
 * punta que tiene pegada, y con la cámara girando ese error aparece y
 * desaparece según el ángulo. Esto es el orden de verdad:
 *
 *  1. Sólo importan los pares que se tocan EN PANTALLA; el resto puede ir en
 *     cualquier orden. Se encuentran barriendo las cajas de pantalla.
 *  2. Para un par que se toca, se mira sobre una columna de pantalla que
 *     cruce a los dos: a lo largo de esa línea, dos huellas separadas quedan
 *     una entera delante de la otra. Para prismas parados sobre el mismo piso
 *     y una cámara ortográfica, eso decide quién tapa a quién —con cualquier
 *     alto y cualquier inclinación—.
 *  3. Con esas relaciones se arma el orden (topológico). Para huellas que no
 *     se pisan, «delante de» no puede formar un ciclo; si dos se pisan —un
 *     plano con muebles encimados— el ciclo se corta por el más lejano.
 *
 * Devuelve los índices en el orden en que hay que pintarlos.
 */
export function ordenDePintado(huellas: Huella[], e: Ejes): number[] {
  const n = huellas.length;
  if (n === 0) return [];

  // Caja de pantalla de cada mueble y su profundidad al centro (desempate).
  const cajas = huellas.map((h) => {
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const x of [h.x0, h.x1]) for (const z of [h.z0, h.z1]) for (const y of [0, h.h]) {
      const [sx, sy] = proyectar(e, x, y, z);
      if (sx < sx0) sx0 = sx;
      if (sx > sx1) sx1 = sx;
      if (sy < sy0) sy0 = sy;
      if (sy > sy1) sy1 = sy;
    }
    return { sx0, sx1, sy0, sy1 };
  });
  const centro = huellas.map((h) => ((h.x0 + h.x1) / 2) * e.sa + ((h.z0 + h.z1) / 2) * e.ca);

  // El tramo (en profundidad horizontal) que la huella ocupa sobre la línea de
  // pantalla x = s. La línea es s·u + t·c, con u la derecha y c hacia la cámara.
  const tramo = (h: Huella, s: number): [number, number] | null => {
    let lo = -Infinity, hi = Infinity;
    const x = s * e.ca, z = -s * e.sa;
    if (Math.abs(e.sa) < 1e-9) {
      if (x < h.x0 - 1e-9 || x > h.x1 + 1e-9) return null;
    } else {
      let a = (h.x0 - x) / e.sa, b = (h.x1 - x) / e.sa;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    if (Math.abs(e.ca) < 1e-9) {
      if (z < h.z0 - 1e-9 || z > h.z1 + 1e-9) return null;
    } else {
      let a = (h.z0 - z) / e.ca, b = (h.z1 - z) / e.ca;
      if (a > b) [a, b] = [b, a];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    return lo <= hi + 1e-9 ? [lo, hi] : null;
  };
  // El intervalo de cada huella sobre la derecha de la cámara.
  const franja = huellas.map((h) => {
    const us = [h.x0 * e.ca - h.z0 * e.sa, h.x1 * e.ca - h.z0 * e.sa,
                h.x0 * e.ca - h.z1 * e.sa, h.x1 * e.ca - h.z1 * e.sa];
    return [Math.min(...us), Math.max(...us)] as [number, number];
  });

  /** ¿`i` va antes que `j`? null = no se tocan y da igual. */
  const antes = (i: number, j: number): boolean | null => {
    const s0 = Math.max(franja[i][0], franja[j][0]);
    const s1 = Math.min(franja[i][1], franja[j][1]);
    if (s1 - s0 <= 1e-9) return null;
    const s = (s0 + s1) / 2;
    const ti = tramo(huellas[i], s), tj = tramo(huellas[j], s);
    if (ti && tj) {
      if (ti[1] <= tj[0] + 1e-9) return true;   // i entera detrás de j
      if (tj[1] <= ti[0] + 1e-9) return false;  // j entera detrás de i
      // Se pisan: el más alto encima, que es lo que se ve desde arriba.
      if (Math.abs(huellas[i].h - huellas[j].h) > 1e-9) return huellas[i].h < huellas[j].h;
      return (ti[0] + ti[1]) / 2 < (tj[0] + tj[1]) / 2;
    }
    return centro[i] < centro[j];
  };

  // Pares que se tocan en pantalla: barrido por el borde izquierdo.
  const deAntes: number[][] = Array.from({ length: n }, () => []);
  const entrantes = new Array<number>(n).fill(0);
  const porIzq = [...huellas.keys()].sort((a, b) => cajas[a].sx0 - cajas[b].sx0);
  const activos: number[] = [];
  for (const i of porIzq) {
    const ci = cajas[i];
    for (let k = activos.length - 1; k >= 0; k--) {
      if (cajas[activos[k]].sx1 <= ci.sx0) activos.splice(k, 1);
    }
    for (const j of activos) {
      const cj = cajas[j];
      if (cj.sy1 <= ci.sy0 || ci.sy1 <= cj.sy0) continue;
      const r = antes(i, j);
      if (r === null) continue;
      if (r) { deAntes[i].push(j); entrantes[j]++; } else { deAntes[j].push(i); entrantes[i]++; }
    }
    activos.push(i);
  }

  // Topológico, sacando siempre el más lejano de los que están libres: así,
  // entre dos que no se tocan, el orden sigue siendo el natural.
  const orden: number[] = [];
  const hecho = new Array<boolean>(n).fill(false);
  const libres = new Set<number>();
  for (let i = 0; i < n; i++) if (entrantes[i] === 0) libres.add(i);
  while (orden.length < n) {
    let elegido = -1;
    for (const i of libres) if (elegido < 0 || centro[i] < centro[elegido]) elegido = i;
    if (elegido < 0) {
      // Un ciclo (muebles encimados): se corta por el más lejano.
      for (let i = 0; i < n; i++) if (!hecho[i] && (elegido < 0 || centro[i] < centro[elegido])) elegido = i;
    }
    libres.delete(elegido);
    hecho[elegido] = true;
    orden.push(elegido);
    for (const j of deAntes[elegido]) {
      if (hecho[j]) continue;
      entrantes[j]--;
      if (entrantes[j] === 0) libres.add(j);
    }
  }
  return orden;
}
