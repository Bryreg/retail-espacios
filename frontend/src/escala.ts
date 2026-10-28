import { useLayoutEffect, type CSSProperties } from "react";

/**
 * UN SOLO DISEÑO QUE SE ESCALA (rediseño UX, aprobado el 2026-10-26).
 *
 * La app entera crece o se achica con la pantalla, en vez de tener un diseño por
 * resolución: letra, márgenes, tarjetas, paneles e íconos guardan la misma
 * proporción en una tableta horizontal, un portátil o un monitor 2K. Es el
 * prototipo aprobado (`docs/maquetas/ux-2026-10/generadores/recabra.css`)
 * llevado a la app real.
 *
 * Cómo: `zoom` sobre `<body>` con un factor que sale del ancho y del alto de la
 * ventana, tomando 1440 × 900 como 1 (el tamaño para el que se dibujó todo):
 *   · desde 1024 px de ancho: el menor entre ancho ÷ 1440 y alto ÷ 900, con
 *     piso 15/16 (que la letra no baje de lo legible) y techo 28/16;
 *   · debajo de 1024 (tableta vertical y teléfono): 1, y el diseño se
 *     reacomoda en vez de achicarse (eso lo hace el armazón, con media queries).
 *   Da 0,9375 en 1024–1366, 1 en 1440 × 900, 1,2 en 1920 × 1080 y 1,6 en
 *   2560 × 1440.
 *
 * Por qué `zoom` y no el `font-size` de la raíz: media app todavía escribe sus
 * tamaños en px dentro de estilos en línea, y el `rem` sólo agrandaría lo que
 * ya está en `rem`. El `zoom` escala todo por igual, px incluidos.
 *
 * Lo que el `zoom` obliga a cuidar (medido en Chromium 141):
 *   · las unidades de la ventana (`100dvh`) también se agrandan: todo alto que
 *     dependa de la ventana se divide por `--escala` (`altoDeLaVentana`);
 *   · un lienzo WebGL se mide con `getBoundingClientRect` (ya agrandado) y se
 *     pone ese tamaño en px CSS, que se vuelven a agrandar: crecía sin fin. Sus
 *     anfitriones llevan `zoom: calc(1 / var(--escala))` y quedan a 1:1;
 *   · los clics sobre SVG (plano 2D) se resuelven bien solos (`getScreenCTM`).
 *
 * Sólo se aplica mientras el tablero está montado: la landing, el ingreso, la
 * consola de plataforma y las pantallas por enlace (montaje, guía) no se tocan.
 */
export const BASE_ANCHO = 1440;
export const BASE_ALTO = 900;
export const ESCALA_MINIMA = 15 / 16;
export const ESCALA_MAXIMA = 28 / 16;
export const ANCHO_DEL_REACOMODO = 1024;

export function factorDeEscala(ancho: number, alto: number): number {
  if (!(ancho >= ANCHO_DEL_REACOMODO) || !(alto > 0)) return 1;
  const f = Math.min(ancho / BASE_ANCHO, alto / BASE_ALTO);
  return Math.round(Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, f)) * 10000) / 10000;
}

/** El alto de la ventana en px CSS del contenido escalado. */
export const altoDeLaVentana = "calc(100dvh / var(--escala, 1))";

/** El estilo que deja un lienzo WebGL a 1:1 adentro de la app escalada. */
export const SIN_ESCALA = "calc(1 / var(--escala, 1))";

/** El anfitrión de un `<Canvas>` adentro de una caja con `position:
 *  relative`: la llena y la deja a 1:1. Todo lienzo WebGL del tablero va
 *  adentro de uno (o de un nodo con el mismo `zoom`). Sin él, a 1920 × 1080
 *  (escala 1,2) la vista 3D de la ficha del plano crecía de a 1,2 por vuelta
 *  hasta millones de px, y el mueble «se iba» (el dueño, 2026-10-28). */
export const ANFITRION_SIN_ESCALA: CSSProperties = { position: "absolute", inset: 0, zoom: SIN_ESCALA };

export function useEscalaDeLaApp(): void {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const raiz = document.documentElement;
    const aplicar = () => {
      const f = factorDeEscala(window.innerWidth, window.innerHeight);
      raiz.style.setProperty("--escala", String(f));
      raiz.dataset.escala = String(f);
      document.body.style.setProperty("zoom", String(f));
    };
    aplicar();
    window.addEventListener("resize", aplicar);
    return () => {
      window.removeEventListener("resize", aplicar);
      raiz.style.removeProperty("--escala");
      delete raiz.dataset.escala;
      document.body.style.removeProperty("zoom");
    };
  }, []);
}
