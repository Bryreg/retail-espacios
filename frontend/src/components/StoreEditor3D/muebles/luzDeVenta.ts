/**
 * La luz de la pantalla de venta: la misma, para el mueble y para el producto.
 *
 * ## Por qué existe
 *
 * El producto en prueba trae su propio entorno (`useEntornoDeProducto`, un
 * cuarto gris con tiras de luz en el techo) y los muebles no tenían ninguno:
 * el editor no lleva `scene.environment`, así que una cara VERTICAL de un
 * mueble sólo recibía la luz ambiente (0,55/π del albedo). Medido en la
 * crítica de la segunda ronda: el blanco de la caja de cereal en 232-240 sRGB
 * contra 97-112 del porta-precios —que es casi blanco (#f7f5ef)—, y la
 * etiqueta del vaso en 218 contra 160 de la bandeja más clara. El envase se
 * leía como una calcomanía pegada sobre una maqueta oscura, y la góndola,
 * que es gris clara (#c6cac9, la RAL 7035 de cualquier Éxito o Jumbo), salía
 * grafito.
 *
 * En la pantalla de venta (Presentar y la lámina que se descarga) cada
 * material de mueble recibe la luz DIFUSA de ese mismo cuarto: lo que el
 * envase toma de su entorno, el mueble lo toma también, y el blanco del
 * producto queda a la par del blanco del mueble (medido: etiqueta 220,
 * porta-precios 196–222, paneles ~180).
 *
 * ## Por qué un término propio y no el mapa de entorno
 *
 * La primera versión le ponía al mueble el MISMO mapa (PMREM) que al envase.
 * Se veía bien, pero muestrear un PMREM en cada píxel de cada mueble —en una
 * toma de venta, la pantalla entera— hacía cada cuadro 25 veces más caro: en
 * swiftshader, 12 s contra 0,45 s del editor, y un giro a mano dejaba la
 * pantalla congelada medio minuto. Los muebles son mates (rugosidad
 * 0,55–0,8): de ese mapa sólo se veía la parte difusa, y la difusa de un
 * cuarto así es casi exactamente un hemisferio —el promedio del techo arriba,
 * el del piso abajo—. Eso es lo que se suma, en el shader, como una cuenta de
 * dos colores por píxel (`parcheDeLuzDeVenta`).
 *
 * ## Por qué un contexto y no una luz de la escena
 *
 * Una `HemisphereLight` o `scene.environment` alumbran TODO: el piso, las
 * paredes y el propio envase, que ya trae su luz calibrada (y en three 0.184
 * `scene.environment` también lo toman los `MeshLambertMaterial`). Por
 * contexto la reciben sólo los materiales de mueble que la piden
 * (`useMateriales`, la nevera, el robatope, el relleno por rubro), y sólo
 * mientras la pantalla es de un proveedor. Fuera de Presentar el editor se ve
 * exactamente como siempre.
 */
import { createContext, useContext, useEffect, useMemo } from "react";
import * as THREE from "three";
import { ALTO_CIELO_RASO, SOMBRA_AL_PIE, ejesDeGrilla } from "../../../utils/planta";
import type { Caja, GrillaDeLuminarias } from "../../../utils/planta";

/** `true` en la pantalla de venta; `false` en el editor de siempre. */
export const LuzDeVenta = createContext<boolean>(false);

/** Si este mueble se dibuja en la pantalla de venta. */
export const useLuzDeVenta = (): boolean => useContext(LuzDeVenta);

/**
 * Si este mueble se dibuja con TODA su luz en la pantalla de venta: `true` el
 * mueble que se está mostrando (el de una prueba a la vista o el de la toma),
 * y cualquiera cuando no hay ninguno; `false` un vecino, que se atenúa para no
 * competir con lo que se vende. Va APARTE de `LuzDeVenta` y es un boolean a
 * propósito: los materiales se arman con `LuzDeVenta` en sus `useMemo`, y un
 * objeto nuevo en cada render los rehacía en los ~100 muebles de la tienda. La
 * atenuación la escriben un efecto en los uniformes (`atenuarUniformes`), sin
 * recrear ni recompilar nada.
 */
export const FocoDeVenta = createContext<boolean>(true);

/**
 * Cuánto de TODA su luz conserva un vecino en la pantalla de venta: lo que
 * multiplica el color final de sus materiales (`uExposicion`), con la luz de
 * la escena incluida.
 *
 * La crítica de la demo (ronda 2): con la sola atenuación de la luz del
 * cuarto, el robatope libre pegado a la punta de Alpina —una torre blanca con
 * cuatro repisas vacías— quedaba MÁS claro que la punta vendida (luminancia
 * media 180 contra 156), y la góndola libre de la que la punta es cabecera
 * pesaba lo mismo que ella (156 contra 153): la direccional y la ambiente, que
 * no se atenuaban, son casi toda la luz de una cara blanca que mira a la
 * cámara. Con la exposición, el vecino entero pierde luz —el blanco sigue
 * siendo blanco, más en sombra— y lo libre sigue vacío: sólo deja de competir.
 *
 * Medido en la demo (luminancia media de la caja de cada mueble): con 0,62 el
 * robatope quedaba a la par de la punta (154 contra 155); con 0,45, un 15 %
 * abajo —las caras de arriba de sus repisas, que miran a la direccional, se
 * comen el tono—; con 0,38, 121 contra 155 (un 22 % abajo) y la góndola libre
 * de «Tres cuartos» 102 contra 150 (un 32 %). Más abajo el vecino se lee como
 * un hueco apagado en la tienda.
 */
export const EXPOSICION_DEL_VECINO = 0.38;

/**
 * Cuánto pierde un vecino: la luz del cuarto y el brillo de las luminarias.
 *
 * El criterio: el mueble de al lado al menos un 20 % menos luminoso que el que
 * se vende. Medido en bolsa-4 (ROB-01 con Arroz Diana; al lado GON-01 con
 * relleno y GON-02 con slots vendidos), con la luminancia media de cada mueble:
 * con 0,75 la góndola de la derecha quedaba un 18 % abajo en gris sRGB (34 %
 * en luminancia relativa: la luz de la escena, que no se atenúa, pesa); con
 * 0,55 queda un 24 % abajo (44 %), y la otra un 29 % (47 %). La nevera vecina
 * además apaga su frío (`apagarElFrio` en `NeveraReal`): con la luz sola no
 * llegaba.
 */
export const ATENUACION = { luz: 0.55, brillo: 0.5, exposicion: EXPOSICION_DEL_VECINO } as const;

/**
 * Cuánto se LAVA un vecino hacia un gris medio (`GRIS_DEL_LAVADO`), además de
 * perder exposición: la fracción de la mezcla, con la exposición de siempre.
 *
 * La exposición multiplica todo por igual y conserva el contraste: el panel de
 * fondo de una góndola libre —ya oscuro— quedaba casi negro (46-60 de
 * luminancia) con los entrepaños claros de canto vivo encima (140): un salto
 * de 80-90 niveles en un píxel, «un esqueleto de CAD» y no un mueble vacío
 * (la crítica de la demo, ronda 3). Lo libre tiene que verse vacío, pero
 * terminado. Con 0,3 hacia 0,2 lineal (calculado con el tono ACES de la
 * escena): el panel sube a ~83 y el entrepaño queda en ~139, un salto de 55;
 * un blanco apagado (122) casi no cambia, así que el vecino sigue igual de
 * oscuro que antes en lo que pesa. Medido en «De cerca» del robatope girado
 * 60°: con 0,25 el panel pasó de 55 a 81 pero el canto del entrepaño todavía
 * saltaba 69 niveles; con 0,3, ver ESTADO.md.
 *
 * Proporcional a lo que se apaga (`lavadoPara`): la nevera vecina, que va con
 * exposición 1 (se apaga con su frío), no se lava; la chapa del copete libre
 * (0,7), a medias.
 */
export const LAVADO_DEL_VECINO = 0.3;
/** El gris hacia el que se lava un vecino, en luz lineal (antes del tono). */
export const GRIS_DEL_LAVADO = 0.2;

/** El lavado que corresponde a una exposición de vecino: el de diseño con
 *  `EXPOSICION_DEL_VECINO`, nada con exposición 1, y en proporción en el
 *  medio. */
export function lavadoPara(exposicion: number): number {
  const k = (1 - exposicion) / (1 - EXPOSICION_DEL_VECINO);
  return LAVADO_DEL_VECINO * Math.min(1, Math.max(0, k));
}

/** Los uniformes de venta de un material (o de las props de uno declarativo),
 *  si los tiene. */
export function uniformesDe(x: { userData?: { luzDeVenta?: UniformesDeVenta } } | null | undefined): UniformesDeVenta | undefined {
  return x?.userData?.luzDeVenta;
}

/** Pone la intensidad y el brillo de cada material según el foco: los de
 *  diseño con foco, × `ATENUACION` sin él (la exposición, la que se pase: la
 *  nevera se apaga con su frío y lleva la suya). Devuelve cuántos tocó. */
export function atenuarUniformes(
  lista: readonly (UniformesDeVenta | undefined)[], foco: boolean, exposicion: number = ATENUACION.exposicion,
): number {
  let n = 0;
  for (const u of lista) {
    if (!u) continue;
    u.uLuzVenta.value = u.base.luz * (foco ? 1 : ATENUACION.luz);
    u.uBrillo.value = u.base.brillo * (foco ? 1 : ATENUACION.brillo);
    u.uExposicion.value = foco ? 1 : exposicion;
    u.uLavado.value = foco ? 0 : lavadoPara(exposicion);
    n++;
  }
  return n;
}

/**
 * Cuánto pesa la luz del cuarto en un mueble, en la pantalla de venta.
 *
 * Con este valor el porta-precios —el blanco del mueble— y el blanco de la
 * etiqueta quedan a menos de 15 sRGB, que es lo que pide el criterio (ver
 * `etiqueta.ts`, «La calibración», para el lado del producto).
 */
export const K_ENTORNO_MUEBLE = 1.15;

/** La radiancia media del cuarto del producto (`EntornoDeTienda`, en
 *  `etiqueta.ts`) mirando hacia arriba —paredes 0,55 y las tiras de luz del
 *  techo— y hacia abajo —el piso 0,32 y las paredes—. */
const CIELO = [0.78, 0.76, 0.73] as const;
const SUELO = [0.42, 0.41, 0.40] as const;

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;
const f4 = (x: number) => x.toFixed(4);

/* ── La tienda que se refleja ─────────────────────────────────────────────────
   El brillo del acero y el del piso salen de la MISMA tienda que se dibuja: el
   cielo raso a 3,2 m con sus luminarias (`luminariasDeTienda`, en
   `utils/planta.ts`), los muros en el borde de la planta y el piso. No se
   muestrea ningún mapa de entorno —el PMREM en cada píxel de cada mueble hacía
   el cuadro 25 veces más caro (ver arriba)—: el rayo reflejado se corta con el
   plano del cielo raso y la grilla de luminarias dice, con una cuenta de
   `floor`, si ahí hay una tira. */

/**
 * Las radiancias (lineales) de lo que se refleja y cómo se reparte el reflejo.
 * Las MISMAS constantes las usan el trozo de shader (`GLSL_DE_TIENDA`, que se
 * arma con estos números) y su gemelo en JS (`brilloDeVenta`), que es lo que
 * prueba `probar-muebles` con las cámaras de venta antes de tocar el shader.
 */
export const REFLEJO = {
  /** La pintura electrostática es un dieléctrico: refleja el 4 % de frente. */
  F0: 0.04,
  /** Una tira de luz embutida: casi cien veces el cielo raso, como una de
   *  verdad. Es lo que hace que su reflejo se vea en una pintura semimate: el
   *  borde se ensancha con la rugosidad (`borroso`), pero el pico sigue alto.
   *  Con 3 —el doble del techo— el reflejo ensanchado de una tira de 20 cm no
   *  se despegaba del techo (6 sRGB sobre el resto del parante); con 12, en
   *  las capturas no se veía; con 120 las franjas lavaban el acero. */
  luminaria: 48.0,
  techo: 0.55,
  piso: 0.35,
  muro: 0.6,
  /** Cuánto se ensancha el borde de una tira reflejada por metro recorrido y
   *  por unidad de rugosidad: la pintura no es un espejo. */
  borroso: 0.06,
  /** El lóbulo de una superficie rugosa no es sólo la dirección espejo: se
   *  promedian dos rayos, el espejo y uno levantado `sesgo × rugosidad` hacia
   *  arriba. Con el espejo solo, una cara vertical vista desde 1,25 m refleja
   *  el piso y nunca una luminaria —medido con las tomas de venta de la punta:
   *  0,9 sRGB de brillo en el parante—; con el lóbulo, la tira aparece como una
   *  franja que se corre con el ángulo, que es como se ve el acero pintado de
   *  un supermercado bajo un paño de luz. */
  sesgo: 0.8,
  /** Cuánto pesa el rayo levantado frente al espejo. */
  lobulo: 0.35,
  /** Con la cámara por encima del cielo raso (la órbita alejada, la vista
   *  superior) el techo no se dibuja, y su reflejo tampoco: se apaga en los
   *  50 cm que la cámara sube por encima de él. Si no, desde arriba el piso
   *  mostraba manchas de luz debajo de cada luminaria invisible. */
  sobreElTecho: 0.5,
} as const;

/** Lo que cada pieza toma del brillo (`uBrillo`): el acero pintado más que el
 *  plástico mate del porta-precios, y el relleno casi nada. */
export const BRILLO = {
  pintado: 0.35,
  estructura: 0.45,
  precios: 0.25,
  panel: 0.2,
  zocalo: 0.3,
  relleno: 0.15,
  robatope: 0.3,
} as const;

/**
 * Los uniformes de la tienda, compartidos: UN objeto de módulo cuyas MISMAS
 * referencias se enganchan en `shader.uniforms` de cada material de venta y
 * del piso. `StoreRoom` los actualiza cuando cambia la planta (`ponerTienda`):
 * cambiar un valor no recompila ningún programa.
 */
export const UNIFORMES_DE_TIENDA = {
  uTecho: { value: ALTO_CIELO_RASO },
  uGrillaOrigen: { value: new THREE.Vector2(0, 0) },
  uGrillaPaso: { value: new THREE.Vector2(3, 3) },
  uGrillaTam: { value: new THREE.Vector2(2.4, 0.2) },
  /** (cos giro, sin giro) del eje U de la grilla. */
  uGrillaEje: { value: new THREE.Vector2(1, 0) },
  uGrillaCuantas: { value: new THREE.Vector2(0, 0) },
  /** minX, minZ, maxX, maxZ de la planta. */
  uLimites: { value: new THREE.Vector4(0, 0, 30, 42) },
};

/** Pasa la planta y su grilla de luminarias a los uniformes compartidos.
 *  Devuelve si algo cambió (para pedir un cuadro). */
export function ponerTienda(grilla: GrillaDeLuminarias, limites: Caja): boolean {
  const u = UNIFORMES_DE_TIENDA;
  const antes = JSON.stringify([u.uGrillaOrigen.value, u.uGrillaPaso.value, u.uGrillaTam.value,
    u.uGrillaEje.value, u.uGrillaCuantas.value, u.uLimites.value]);
  u.uGrillaOrigen.value.set(grilla.origen.x, grilla.origen.z);
  u.uGrillaPaso.value.set(grilla.paso.u, grilla.paso.v);
  u.uGrillaTam.value.set(grilla.tamano.u, grilla.tamano.v);
  u.uGrillaEje.value.set(Math.cos(grilla.giro), Math.sin(grilla.giro));
  u.uGrillaCuantas.value.set(grilla.cuantas.u, grilla.cuantas.v);
  u.uLimites.value.set(limites.minX, limites.minZ, limites.maxX, limites.maxZ);
  u.uTecho.value = ALTO_CIELO_RASO;
  return antes !== JSON.stringify([u.uGrillaOrigen.value, u.uGrillaPaso.value, u.uGrillaTam.value,
    u.uGrillaEje.value, u.uGrillaCuantas.value, u.uLimites.value]);
}

/** 1 con la cámara bajo el cielo raso; 0 desde 50 cm por encima. */
export function bajoElTecho(yCamara: number): number {
  return Math.max(0, Math.min(1, (ALTO_CIELO_RASO + REFLEJO.sobreElTecho - yCamara) / REFLEJO.sobreElTecho));
}

/** Lo que cubre una tira de ancho `a` un filtro de caja de medio ancho `b`
 *  centrado a `d` de su eje: el borde suavizado sin muestrear de más. */
export function cobertura(d: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (Math.min(a / 2, d + b) - Math.max(-a / 2, d - b)) / (2 * b)));
}

/** Cuánto de una tira de luz cae en el punto (x, z) del cielo raso, con el
 *  borde ensanchado `b`. Es la tira más cercana de la grilla: O(1). */
export function mascaraDeLuminarias(x: number, z: number, g: GrillaDeLuminarias, b: number): number {
  if (g.cuantas.u < 1 || g.cuantas.v < 1) return 0;
  const { u, v } = ejesDeGrilla(g.giro);
  const rx = x - g.origen.x, rz = z - g.origen.z;
  const cu = rx * u.x + rz * u.z, cv = rx * v.x + rz * v.z;
  const i = Math.max(0, Math.min(g.cuantas.u - 1, Math.floor(cu / g.paso.u + 0.5)));
  const j = Math.max(0, Math.min(g.cuantas.v - 1, Math.floor(cv / g.paso.v + 0.5)));
  return cobertura(cu - i * g.paso.u, g.tamano.u, b) * cobertura(cv - j * g.paso.v, g.tamano.v, b);
}

type V = { x: number; y: number; z: number };
const unit = (a: V): V => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** Lo que se ve en una dirección desde un punto de la tienda: el cielo raso
 *  (con sus luminarias), un muro o el piso. `aa` es el borde mínimo (en el
 *  shader, lo que mide un píxel: `fwidth`). */
export function reflejoDeTienda(p: V, r: V, rugosidad: number, g: GrillaDeLuminarias, limites: Caja, aa = 0): number {
  if (r.y <= 1e-3) return REFLEJO.piso;
  const t = (ALTO_CIELO_RASO - p.y) / r.y;
  const hx = p.x + r.x * t, hz = p.z + r.z * t;
  if (hx < limites.minX || hx > limites.maxX || hz < limites.minZ || hz > limites.maxZ) return REFLEJO.muro;
  const b = Math.max(0.01, Math.min(aa, 2) + t * rugosidad * REFLEJO.borroso);
  return REFLEJO.techo + (REFLEJO.luminaria - REFLEJO.techo) * mascaraDeLuminarias(hx, hz, g, b);
}

/**
 * El brillo de las luminarias en una superficie pintada, en JS: el gemelo de
 * lo que suma el shader (`GLSL_DE_TIENDA`), antes de `uBrillo` y de la
 * oclusión. `N` es la normal en el mundo, `camara` dónde está el ojo y `P` el
 * punto. Devuelve la radiancia que se suma (lineal) y sus dos factores.
 *
 * Fresnel de Schlick con F0 = 0,04, atenuado por la rugosidad en el canto
 * (una pintura mate no llega a espejo ni de canto), por el promedio de los dos
 * rayos del lóbulo (`REFLEJO.sesgo`).
 */
export function brilloDeVenta(
  N: V, camara: V, P: V, g: GrillaDeLuminarias, limites: Caja, rugosidad = 0.55,
): { valor: number; fresnel: number; radiancia: number } {
  const I = unit({ x: P.x - camara.x, y: P.y - camara.y, z: P.z - camara.z });
  const dn = I.x * N.x + I.y * N.y + I.z * N.z;
  const R = { x: I.x - 2 * dn * N.x, y: I.y - 2 * dn * N.y, z: I.z - 2 * dn * N.z };
  const Ru = unit({ x: R.x, y: R.y + REFLEJO.sesgo * rugosidad, z: R.z });
  const c = Math.max(0, -dn);
  const fresnel = REFLEJO.F0 + (Math.max(1 - rugosidad, REFLEJO.F0) - REFLEJO.F0) * Math.pow(1 - c, 5);
  const radiancia = (1 - REFLEJO.lobulo) * reflejoDeTienda(P, R, rugosidad, g, limites)
    + REFLEJO.lobulo * reflejoDeTienda(P, Ru, rugosidad, g, limites);
  return { valor: fresnel * radiancia * bajoElTecho(camara.y), fresnel, radiancia };
}

/** El trozo de GLSL de la tienda (a nivel de archivo, antes de `main`): los
 *  uniformes compartidos y las mismas cuentas que `reflejoDeTienda` y
 *  `mascaraDeLuminarias`, con las constantes de `REFLEJO`. Usa `fwidth` (WebGL
 *  2) fuera de toda rama, como pide la derivada. */
export const GLSL_DE_TIENDA = `
uniform float uTecho;
uniform vec2 uGrillaOrigen;
uniform vec2 uGrillaPaso;
uniform vec2 uGrillaTam;
uniform vec2 uGrillaEje;
uniform vec2 uGrillaCuantas;
uniform vec4 uLimites;
float tiendaCobertura( float d, float a, float b ) {
  return clamp( ( min( 0.5 * a, d + b ) - max( -0.5 * a, d - b ) ) / ( 2.0 * b ), 0.0, 1.0 );
}
float tiendaLuminarias( vec2 p, float b ) {
  vec2 rel = p - uGrillaOrigen;
  float cu = rel.x * uGrillaEje.x - rel.y * uGrillaEje.y;
  float cv = rel.x * uGrillaEje.y + rel.y * uGrillaEje.x;
  float hay = step( 0.5, min( uGrillaCuantas.x, uGrillaCuantas.y ) );
  float i = clamp( floor( cu / uGrillaPaso.x + 0.5 ), 0.0, max( uGrillaCuantas.x - 1.0, 0.0 ) );
  float j = clamp( floor( cv / uGrillaPaso.y + 0.5 ), 0.0, max( uGrillaCuantas.y - 1.0, 0.0 ) );
  return hay * tiendaCobertura( cu - i * uGrillaPaso.x, uGrillaTam.x, b ) * tiendaCobertura( cv - j * uGrillaPaso.y, uGrillaTam.y, b );
}
vec3 tiendaPosicion() {
  return cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
}
float tiendaBajoElTecho() {
  return clamp( ( uTecho + ${f4(REFLEJO.sobreElTecho)} - cameraPosition.y ) / ${f4(REFLEJO.sobreElTecho)}, 0.0, 1.0 );
}
float tiendaReflejo( vec3 p, vec3 r, float rugosidad ) {
  float sube = step( 1e-3, r.y );
  float t = ( uTecho - p.y ) / max( r.y, 1e-3 );
  vec2 h = p.xz + r.xz * t;
  float aa = min( length( fwidth( h ) ), 2.0 );
  float dentro = step( uLimites.x, h.x ) * step( h.x, uLimites.z ) * step( uLimites.y, h.y ) * step( h.y, uLimites.w );
  float b = max( 0.01, aa + t * rugosidad * ${f4(REFLEJO.borroso)} );
  float techo = mix( ${f4(REFLEJO.techo)}, ${f4(REFLEJO.luminaria)}, tiendaLuminarias( h, b ) );
  return mix( ${f4(REFLEJO.piso)}, mix( ${f4(REFLEJO.muro)}, techo, dentro ), sube );
}
`;

/** Cada material de venta tiene SU intensidad y SU brillo, como uniformes: la
 *  atenuación de los vecinos (ver `useAtenuarVecino`) los cambia sin
 *  recompilar. `base` guarda los valores de diseño para volver a ellos. */
export interface UniformesDeVenta {
  uLuzVenta: { value: number };
  uBrillo: { value: number };
  /** Lo que multiplica el color final (1 con foco; `EXPOSICION_DEL_VECINO`
   *  en un vecino). */
  uExposicion: { value: number };
  /** Cuánto se mezcla el color final con `GRIS_DEL_LAVADO` (0 con foco;
   *  `lavadoPara(exposición)` en un vecino). */
  uLavado: { value: number };
  base: { luz: number; brillo: number };
}

/** El parche del shader: la luz difusa del cuarto, por hemisferio, y el
 *  brillo de las luminarias, sumados a lo emitido —que el tono de la escena
 *  trata igual que lo iluminado—.
 *
 *  `normal` ya está en espacio de vista ahí (`normal_fragment_begin` va antes
 *  que `emissivemap_fragment`); el «arriba» del local se lleva a ese espacio
 *  con `viewMatrix`, y la posición y el rayo reflejado vuelven al MUNDO con la
 *  transpuesta (`vec4(x, 0) * viewMatrix`), para cortarlos con el cielo raso.
 *  La intensidad y el brillo son uniformes (`uLuzVenta`, `uBrillo`): UN solo
 *  programa para todos los muebles —antes eran cuatro, uno por intensidad—.
 *  Si three cambia el nombre del trozo, el mueble queda con la luz del editor
 *  (lo vigila `probar-muebles`). */
export function parcheDeLuzDeVenta(u: UniformesDeVenta) {
  const trozo = "#include <emissivemap_fragment>";
  const trozoFinal = "#include <opaque_fragment>";
  return (shader: { fragmentShader: string; uniforms?: Record<string, unknown> }) => {
    if (!shader.fragmentShader.includes(trozo) || !shader.fragmentShader.includes("void main() {")) return;
    if (shader.uniforms) Object.assign(shader.uniforms, UNIFORMES_DE_TIENDA, { uLuzVenta: u.uLuzVenta, uBrillo: u.uBrillo, uExposicion: u.uExposicion, uLavado: u.uLavado });
    shader.fragmentShader = shader.fragmentShader
      // La exposición del vecino: TODO lo que sale (la luz de la escena, la
      // del cuarto y el brillo), antes del tono; y el lavado hacia un gris
      // medio (`LAVADO_DEL_VECINO`), que le baja el contraste. Si three
      // cambia el nombre del trozo, el vecino queda sin esta parte (lo vigila
      // probar-muebles).
      .replace(trozoFinal, `outgoingLight *= uExposicion;
	outgoingLight = mix( outgoingLight, vec3( ${f4(GRIS_DEL_LAVADO)} ), uLavado );
	${trozoFinal}`)
      .replace("void main() {", `uniform float uLuzVenta;
uniform float uBrillo;
uniform float uExposicion;
uniform float uLavado;
${GLSL_DE_TIENDA}
void main() {`)
      .replace(trozo, `${trozo}
{
  vec3 arribaDelLocal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float haciaArriba = 0.5 * dot( normal, arribaDelLocal ) + 0.5;
  totalEmissiveRadiance += uLuzVenta * diffuseColor.rgb * mix( ${v3(SUELO)}, ${v3(CIELO)}, haciaArriba );
  #ifdef STANDARD
    float rugosidadDeVenta = roughnessFactor;
  #else
    float rugosidadDeVenta = 0.6;
  #endif
  vec3 haciaElOjo = normalize( vViewPosition );
  vec3 pDeVenta = tiendaPosicion();
  vec3 rDeVenta = normalize( ( vec4( reflect( - haciaElOjo, normal ), 0.0 ) * viewMatrix ).xyz );
  vec3 rLevantado = normalize( rDeVenta + vec3( 0.0, ${f4(REFLEJO.sesgo)} * rugosidadDeVenta, 0.0 ) );
  float cDeVenta = max( dot( normal, haciaElOjo ), 0.0 );
  float fDeVenta = ${f4(REFLEJO.F0)} + ( max( 1.0 - rugosidadDeVenta, ${f4(REFLEJO.F0)} ) - ${f4(REFLEJO.F0)} ) * pow( 1.0 - cDeVenta, 5.0 );
  float lDeVenta = ${f4(1 - REFLEJO.lobulo)} * tiendaReflejo( pDeVenta, rDeVenta, rugosidadDeVenta )
    + ${f4(REFLEJO.lobulo)} * tiendaReflejo( pDeVenta, rLevantado, rugosidadDeVenta );
  #ifdef USE_COLOR
    float aoDeVenta = vColor.r;
  #else
    float aoDeVenta = 1.0;
  #endif
  totalEmissiveRadiance += vec3( uBrillo * aoDeVenta * fDeVenta * lDeVenta * tiendaBajoElTecho() );
}`);
  };
}

/** El piso de la pantalla de venta: cuánto refleja y cuán liso es. */
export const PISO_DE_VENTA = {
  /** Lo más que suma el reflejo de una luminaria: el 12 % del blanco DE LA
   *  PANTALLA (se suma después del tono: un piso claro está en el hombro de
   *  la curva, y el 12 % sumado antes eran 5 sRGB). Un porcelanato de
   *  supermercado refleja las tiras como manchas tenues, no como un espejo. */
  reflejo: 0.12,
  /** La rugosidad que ensancha el reflejo con la distancia: más liso que la
   *  pintura del mueble (un piso pulido). */
  rugosidad: 0.2,
} as const;

/** Los uniformes PROPIOS del piso (los de la tienda son los compartidos): el
 *  mapa de la sombra al pie de los muebles y su caja en el piso. */
export interface UniformesDelPiso {
  uSombraPiso: { value: THREE.Texture | null };
  /** origen x, origen z, ancho y fondo cubiertos por el mapa, en metros. */
  uSombraCaja: { value: THREE.Vector4 };
}

/**
 * El parche del piso de la pantalla de venta (el mismo Lambert de la baldosa;
 * en el editor no lleva nada):
 *
 * - (a) **Oscuro al pie de cada mueble**: el mapa de `sombraDeHuellas` (10 cm
 *   por píxel, difuminado 30 cm) oscurece hasta un 30 % el color después de
 *   `map_fragment`.
 * - (b) **El reflejo de las luminarias**: el rayo reflejado se corta con el
 *   cielo raso y se evalúa contra la MISMA grilla, en O(1), con los uniformes
 *   compartidos de `UNIFORMES_DE_TIENDA` —nunca se recorre la lista de
 *   luminarias, que en una integrada podría pasarse del límite de uniformes—.
 *   Sólo cuenta la luminaria (el techo liso no suma) y como mucho el 12 % del
 *   blanco; el borde se ensancha con la distancia y la rugosidad, y `fwidth`
 *   lo suaviza a la medida del píxel: con un giro lento no titila.
 *
 * Nada de pases extra ni de `MeshReflectorMaterial`: una cuenta más por píxel
 * del piso.
 */
export function parcheDelPiso(u: UniformesDelPiso) {
  const trozoMapa = "#include <map_fragment>";
  const trozo = "#include <emissivemap_fragment>";
  return (shader: { fragmentShader: string; uniforms?: Record<string, unknown> }) => {
    const f = shader.fragmentShader;
    const trozoTono = "#include <tonemapping_fragment>";
    if (!f.includes(trozo) || !f.includes(trozoMapa) || !f.includes(trozoTono) || !f.includes("void main() {")) return;
    if (shader.uniforms) Object.assign(shader.uniforms, UNIFORMES_DE_TIENDA, u);
    shader.fragmentShader = f
      .replace("void main() {", `uniform sampler2D uSombraPiso;
uniform vec4 uSombraCaja;
${GLSL_DE_TIENDA}
void main() {`)
      .replace(trozoMapa, `${trozoMapa}
  vec3 pDelPiso = tiendaPosicion();
  float sombraAlPie = texture2D( uSombraPiso, ( pDelPiso.xz - uSombraCaja.xy ) / uSombraCaja.zw ).r;
  diffuseColor.rgb *= 1.0 - ${f4(SOMBRA_AL_PIE.maximo)} * sombraAlPie;
  float reflejoDelPiso = 0.0;`)
      .replace(trozo, `${trozo}
{
  vec3 ojoDelPiso = normalize( vViewPosition );
  vec3 rDelPiso = normalize( ( vec4( reflect( - ojoDelPiso, normal ), 0.0 ) * viewMatrix ).xyz );
  float lDelPiso = tiendaReflejo( pDelPiso, rDelPiso, ${f4(PISO_DE_VENTA.rugosidad)} );
  float luminariaEnElPiso = clamp( ( lDelPiso - ${f4(REFLEJO.techo)} ) / ${f4(REFLEJO.luminaria - REFLEJO.techo)}, 0.0, 1.0 );
  reflejoDelPiso = ${f4(PISO_DE_VENTA.reflejo)} * luminariaEnElPiso * ( 1.0 - sombraAlPie ) * tiendaBajoElTecho();
}`)
      .replace(trozoTono, `${trozoTono}
  gl_FragColor.rgb = min( gl_FragColor.rgb + vec3( reflejoDelPiso ), vec3( 1.0 ) );`);
  };
}

/** El gemelo en JS del reflejo del piso (lo que suma, lineal), para las
 *  pruebas: la misma cuenta y las mismas constantes que `parcheDelPiso`. */
export function reflejoEnElPiso(camara: V, P: V, g: GrillaDeLuminarias, limites: Caja): number {
  const I = unit({ x: P.x - camara.x, y: P.y - camara.y, z: P.z - camara.z });
  const r = { x: I.x, y: -I.y, z: I.z };
  const l = reflejoDeTienda(P, r, PISO_DE_VENTA.rugosidad, g, limites);
  return PISO_DE_VENTA.reflejo * bajoElTecho(camara.y)
    * Math.max(0, Math.min(1, (l - REFLEJO.techo) / (REFLEJO.luminaria - REFLEJO.techo)));
}

/** La clave de programa de la luz de venta: UNA para todas las intensidades
 *  y brillos (son uniformes). */
export const CLAVE_DE_VENTA = "luz-de-venta";

/** Lo que se le suma a un material de mueble en la pantalla de venta (nada
 *  en el editor). Cada llamada arma uniformes PROPIOS: el programa es uno, y
 *  three llama `onBeforeCompile` por material aunque lo reuse
 *  (`WebGLRenderer.getProgram`), así que cada material engancha los suyos.
 *  Quedan en `userData.luzDeVenta` para atenuarlos sin recompilar. */
export function conLuzDeVenta(
  venta: boolean, intensidad = K_ENTORNO_MUEBLE, brillo: number = BRILLO.pintado,
): {
  onBeforeCompile?: (s: { fragmentShader: string; uniforms?: Record<string, unknown> }) => void;
  customProgramCacheKey?: () => string;
  userData?: { luzDeVenta: UniformesDeVenta };
} {
  if (!venta) return {};
  const u: UniformesDeVenta = {
    uLuzVenta: { value: intensidad }, uBrillo: { value: brillo }, uExposicion: { value: 1 }, uLavado: { value: 0 },
    base: { luz: intensidad, brillo },
  };
  return { onBeforeCompile: parcheDeLuzDeVenta(u), customProgramCacheKey: () => CLAVE_DE_VENTA, userData: { luzDeVenta: u } };
}

/** Lo mismo para un material DECLARATIVO (`<meshStandardMaterial {...} />`):
 *  un objeto estable por (venta, intensidad, brillo). Con `conLuzDeVenta`
 *  llamado en cada render, R3F le pondría al material uniformes nuevos en cada
 *  cuadro, y los del programa compilado —los que se atenúan— quedarían
 *  huérfanos. */
export function usePropsDeLuzDeVenta(venta: boolean, intensidad = K_ENTORNO_MUEBLE, brillo: number = BRILLO.pintado) {
  return useMemo(() => conLuzDeVenta(venta, intensidad, brillo), [venta, intensidad, brillo]);
}

/**
 * Suelta (`dispose`) los materiales de un memo cuando el memo se rehace o el
 * mueble se desmonta.
 *
 * Entrar y salir de Presentar cambia `LuzDeVenta`, y cada mueble rehace sus
 * materiales: sin soltarlos, una tienda con 20 neveras en la que se entra y se
 * sale de Presentar diez veces en una reunión dejaba 1.800 materiales vivos
 * en la GPU. Se sueltan DESPUÉS del cambio (la limpieza del efecto corre con
 * los materiales nuevos ya puestos). Una textura compartida —la del alambre
 * de la nevera— no se toca: `Material.dispose` no suelta su `map`.
 */
export function useSoltarMateriales(m: Record<string, { dispose(): void } | null | undefined>): void {
  useEffect(() => () => { for (const x of Object.values(m)) x?.dispose(); }, [m]);
}
