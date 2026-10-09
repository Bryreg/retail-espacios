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
import { createContext, useContext, useEffect } from "react";

/** `true` en la pantalla de venta; `false` en el editor de siempre. */
export const LuzDeVenta = createContext<boolean>(false);

/** Si este mueble se dibuja en la pantalla de venta. */
export const useLuzDeVenta = (): boolean => useContext(LuzDeVenta);

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

const v3 = (c: readonly number[], k: number) => `vec3(${c.map((x) => (x * k).toFixed(4)).join(", ")})`;

/** El parche del shader: la luz difusa del cuarto, por hemisferio, sumada a
 *  lo emitido —que el tono de la escena trata igual que lo iluminado—.
 *  `normal` ya está en espacio de vista ahí (`normal_fragment_begin` va
 *  antes que `emissivemap_fragment`); el «arriba» del local se lleva a ese
 *  espacio con `viewMatrix`. Si three cambia el nombre del trozo, el mueble
 *  queda con la luz del editor (lo vigila `probar-muebles`). */
export function parcheDeLuzDeVenta(intensidad: number) {
  const trozo = "#include <emissivemap_fragment>";
  return (shader: { fragmentShader: string }) => {
    if (!shader.fragmentShader.includes(trozo)) return;
    shader.fragmentShader = shader.fragmentShader.replace(trozo, `${trozo}
{
  vec3 arribaDelLocal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float haciaArriba = 0.5 * dot( normal, arribaDelLocal ) + 0.5;
  totalEmissiveRadiance += diffuseColor.rgb * mix( ${v3(SUELO, intensidad)}, ${v3(CIELO, intensidad)}, haciaArriba );
}`);
  };
}

/** Lo que se le suma a un material de mueble en la pantalla de venta (nada
 *  en el editor). Un programa por intensidad: el parche cambia el shader. */
export function conLuzDeVenta(
  venta: boolean, intensidad = K_ENTORNO_MUEBLE,
): { onBeforeCompile?: (s: { fragmentShader: string }) => void; customProgramCacheKey?: () => string } {
  if (!venta) return {};
  const clave = `luz-de-venta:${intensidad.toFixed(3)}`;
  return { onBeforeCompile: parcheDeLuzDeVenta(intensidad), customProgramCacheKey: () => clave };
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
