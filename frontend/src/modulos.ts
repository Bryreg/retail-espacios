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
 *   `/plano/muebles` Plano › Mis muebles: los muebles propios del supermercado
 *                   (lo que era la pestaña «Fichas» del taller, 2026-10-28).
 *                   Adentro, `/plano/muebles/nuevo` arma uno y
 *                   `/plano/muebles/<clave>` lo edita.
 *   `/plano/caras`  Plano › Caras: todas las caras de la sede con el estado de
 *                   su reparto y su montaje (2026-10-29).
 *
 * Todas montan el MISMO `Dashboard` (`App.tsx`, `path="/*"`): pasar de un
 * módulo a otro no lo vuelve a montar, así que un contrato a medio armar no se
 * pierde por ir a mirar el plano.
 */
export type Modulo = "inicio" | "contratos" | "indicadores" | "montajes" | "plano" | "plano3d" | "muebles" | "caras";

export const RUTA_DE: Record<Modulo, string> = {
  inicio: "/",
  contratos: "/contratos",
  indicadores: "/indicadores",
  montajes: "/montajes",
  plano: "/plano",
  plano3d: "/plano/3d",
  muebles: "/plano/muebles",
  caras: "/plano/caras",
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
  if (p === "/plano/muebles" || p.startsWith("/plano/muebles/")) return "muebles";
  if (p === "/plano/caras") return "caras";
  return null;
}

/** Cómo se llama cada módulo en la barra para volver. */
export const NOMBRE_DE: Record<Modulo, string> = {
  inicio: "Inicio",
  contratos: "Contratos",
  indicadores: "Indicadores",
  montajes: "Montajes",
  plano: "Plano de la sede",
  plano3d: "Plano de la sede · 3D",
  muebles: "Mis muebles",
  caras: "Plano de la sede · Caras",
};

/** Las tres vistas del Plano (2D, 3D, Mis muebles). */
const DEL_PLANO: ReadonlySet<Modulo> = new Set<Modulo>(["plano", "plano3d", "muebles", "caras"]);

/** Adónde vuelve «Volver a …» del 3D: el módulo y la dirección exacta. */
export interface VueltaDelPlano { modulo: Modulo; ruta: string }

/**
 * Al 3D no se llega por el menú (el menú abre el Plano en 2D): se llega desde
 * otra pantalla —«Distribuir» de la ficha, Pendientes, Indicadores, «Ver en
 * 3D»— y antes se quedaba ahí, sin camino de vuelta (el dueño, 2026-10-29).
 * Llegar al 3D desde afuera del Plano anota de dónde; moverse entre 2D, 3D y
 * Mis muebles la conserva; salir del Plano la olvida.
 */
export function vueltaAlCambiar(
  vuelta: VueltaDelPlano | null, antes: Modulo, ahora: Modulo, rutaDeAntes: string,
): VueltaDelPlano | null {
  if (!DEL_PLANO.has(ahora)) return null;
  if (DEL_PLANO.has(antes)) return vuelta;
  return ahora === "plano3d" ? { modulo: antes, ruta: rutaDeAntes } : null;
}

/** Lo que cada rol puede abrir. Es lo mismo de antes de los módulos: quien
 *  trabaja en la tienda veía la pestaña Sede en Supervisar y Montajes —y
 *  confirmar un montaje es justamente su trabajo—; el resto es de quien
 *  administra (el servidor lo exige igual: 403). */
export function puedeAbrir(modulo: Modulo, esAdmin: boolean): boolean {
  if (esAdmin) return true;
  return modulo === "inicio" || modulo === "indicadores" || modulo === "montajes";
}
