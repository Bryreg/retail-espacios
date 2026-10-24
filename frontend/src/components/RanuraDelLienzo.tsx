import { useLayoutEffect, useRef, type CSSProperties } from "react";

/**
 * Un lugar donde se ENCHUFA el lienzo 3D del editor sin volver a montarlo.
 *
 * El `<Canvas>` del Editor 3D se dibuja dentro de un nodo propio (el
 * «anfitrión», un `div` que crea el editor una vez) por un portal de React; ese
 * nodo se mueve con el DOM de ranura en ranura. Así Distribuir muestra el MISMO
 * motor 3D —la misma escena, las mismas zonas sobre la cara, el mismo contexto
 * WebGL— como miniatura viva debajo de la cara o en grande («Ver en 3D»), y el
 * editor lo vuelve a tener en su lugar al salir, sin perder nada: React nunca
 * mueve el anfitrión (sólo sus hijos), así que mudarlo no lo desmonta.
 *
 * La ranura que se monta lo toma; la que se va lo suelta sólo si todavía lo
 * tiene (la nueva ya pudo haberlo tomado: `appendChild` lo muda).
 */
export default function RanuraDelLienzo({ anfitrion, className, style }: {
  anfitrion: HTMLElement | null;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anfitrion) return;
    el.appendChild(anfitrion);
    return () => { if (anfitrion.parentNode === el) el.removeChild(anfitrion); };
  }, [anfitrion]);
  return <div ref={ref} className={className} style={style} data-ranura-del-lienzo />;
}
