/**
 * Los módulos de la aplicación y su dirección (rediseño UX 2026-10, etapa 2).
 *
 * Antes la pantalla de adentro era UNA dirección (`/`) con cuatro pestañas en
 * la barra: Sede, Montajes, Plano y Editor 3D. El dibujo aprobado el 26/10
 * (`docs/maquetas/ux-2026-10/final/`) la parte en módulos, cada uno con su
 * dirección, para que el «atrás» del navegador y un enlace guardado lleven al
 * mismo lugar:
 *
 *   `/`             Inicio
 *   `/contratos`    Contratos (lo que era «Vender», en la pestaña Sede)
 *   `/indicadores`  Indicadores (lo que era «Supervisar»)
 *   `/montajes`     Montajes
 *   `/plano`        Plano de la sede, en 2D
 *   `/plano/3d`     Plano de la sede, en 3D (lo que era «Editor 3D»)
 *
 * Todas montan el MISMO `Dashboard` (`App.tsx`, `path="/*"`): pasar de un
 * módulo a otro no lo vuelve a montar, así que un contrato a medio armar no se
 * pierde por ir a mirar el plano.
 */
export type Modulo = "inicio" | "contratos" | "indicadores" | "montajes" | "plano" | "plano3d";

export const RUTA_DE: Record<Modulo, string> = {
  inicio: "/",
  contratos: "/contratos",
  indicadores: "/indicadores",
  montajes: "/montajes",
  plano: "/plano",
  plano3d: "/plano/3d",
};

/** El módulo de una dirección. Lo que no es de ningún módulo da `null`: quien
 *  llama decide adónde mandarlo (al Inicio). */
export function moduloDeRuta(pathname: string): Modulo | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/index.html") return "inicio";
  if (p === "/contratos") return "contratos";
  if (p === "/indicadores") return "indicadores";
  if (p === "/montajes") return "montajes";
  if (p === "/plano") return "plano";
  if (p === "/plano/3d") return "plano3d";
  return null;
}

/** Lo que cada rol puede abrir. Es lo mismo de antes de los módulos: quien
 *  trabaja en la tienda veía la pestaña Sede en Supervisar y Montajes —y
 *  confirmar un montaje es justamente su trabajo—; el resto es de quien
 *  administra (el servidor lo exige igual: 403). */
export function puedeAbrir(modulo: Modulo, esAdmin: boolean): boolean {
  if (esAdmin) return true;
  return modulo === "inicio" || modulo === "indicadores" || modulo === "montajes";
}
