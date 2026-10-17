import { createContext } from "react";

/**
 * El mueble DESNUDO de la capa Distribución (§10.2 del diseño de
 * participaciones): mientras se dibujan las zonas de una cara, el mueble que
 * se distribuye se ve sin nada encima —ni el patrón de paquetes del rubro, ni
 * los envases de los espacios internos, ni la foto del proveedor, ni el
 * producto en prueba— para que las zonas se lean contra el mueble y nada las
 * atraviese (el plano del dibujo va a 6 mm del frente: un envase o un panel de
 * slot lo cruzaría).
 *
 * La escena ya le saca al mueble el rubro, los slots y el pintado de caras;
 * este contexto es la defensa para los rellenos que NO dependen sólo del rubro
 * (`ProductoEnGondola` y `ProductoEnPunta` reciben `vendidoEntero` y
 * `cubiertas`; `ProductoAGranel` siembra con su semilla; `ProductoDePrueba`
 * dibuja lo que le llegue). Cada uno lo lee arriba y devuelve `null` DESPUÉS
 * de sus hooks: el mismo mueble entra y sale de Distribución sin remontarse, y
 * un `return` antes de un hook rompería el orden de los hooks.
 *
 * Mismo patrón que `FocoDeVenta`: un boolean, `false` por defecto. Sólo lo
 * pone en `true` la escena, para el mueble que se distribuye y sólo con la
 * condición única del modo (`distribucionVisible`): nunca en Presentar, la
 * lámina, el visor de Vender, la reunión ni la primera persona.
 */
export const DesnudoDelMueble = createContext(false);
