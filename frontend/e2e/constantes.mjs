/**
 * Lo que comparten el servidor de los recorridos (`servidor.mjs`) y la siembra
 * (`sembrar.ts`). El secreto firma los tokens de la base DESCARTABLE de la
 * prueba —nunca es el de Render— y la siembra lo usa para firmar el enlace de
 * montaje como lo firma el correo (`bulk_leases._enlace_de_montaje`): en la
 * prueba no sale ningún correo.
 */
export const JWT_SECRET_E2E = "e2e-solo-para-la-base-descartable-de-los-recorridos-" + "x".repeat(24);
export const PUERTO_E2E = Number(process.env.E2E_PORT || 8765);
