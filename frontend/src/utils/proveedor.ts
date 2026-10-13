/**
 * El nombre de un proveedor como lo compara «Guardar contrato»: sin espacios
 * de más y sin mayúsculas (`bulk_leases.confirmar` en el servidor; y
 * `?proveedor=` del catálogo, con la misma regla).
 *
 * Vive SOLO en este archivo, sin importar nada, a propósito: la ficha de
 * Vender la usa al entrar (`Contrato/sesionDeVenta.ts`), y si la importara de
 * `muebles/privacidad.ts` el paquete de Vender arrastraría privacidad, los
 * habladores y las medidas de los muebles —~6 KB gzip que quien sólo vende no
 * usa—. `privacidad.ts` la reexporta para el 3D y para `probar-muebles`.
 */
export const normalizarProveedor = (s: string): string => s.trim().toLowerCase();
