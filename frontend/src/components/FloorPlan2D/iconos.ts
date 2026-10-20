/**
 * Los íconos del Plano (rediseño, PR 3; hoja aprobada:
 * `docs/maquetas/rediseno-2026-10/hoja-iconos-y-piezas.html`, tablas «Plano» y
 * «Catálogo del Plano»). Un solo juego —lucide-react 0.396, el del proyecto—,
 * 16 px y trazo 1,75, en gris en reposo. Reemplazan a los emoji del catálogo
 * del 2D y del panel del mueble.
 *
 * Están escritos UNA vez, acá: la biblioteca, el panel, el lienzo (el ícono
 * de un mueble chico, donde no entra el código) y las familias los piden por
 * el tipo. El `emoji` del catálogo de muebles (`catalogo/muebles.json`) sigue
 * existiendo para quien lo lea; el plano ya no lo dibuja (`probar-plano`
 * busca emoji en `FloorPlan2D.tsx`).
 */
import {
  Apple, Beef, Boxes, BrickWall, Carrot, ConciergeBell, Cross, CupSoda, GalleryVerticalEnd, Landmark, Library,
  Link2, Megaphone, PanelLeft, Refrigerator, Scan, ShieldHalf, ShoppingBasket, ShoppingCart, Snowflake, Square, Store,
  type LucideIcon,
} from "lucide-react";
import type { FixType2D } from "../../utils/convertirPlano";

/** El tamaño y el trazo de todo ícono del Plano. */
export const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Un ícono por tipo de mueble (la tabla «Catálogo del Plano» de la hoja). */
export const ICONO_DEL_TIPO: Record<FixType2D, LucideIcon> = {
  gondola_doble: Library,
  gondola_mural: BrickWall,
  punta: PanelLeft,
  robatope: ShieldHalf,
  impulsador: Megaphone,
  ristra: Link2,
  cross: Cross,
  puesto_impulso: Store,
  mueble: GalleryVerticalEnd,
  isla: Boxes,
  batea: ShoppingBasket,
  isla_fria: Snowflake,
  nevera_puertas: Refrigerator,
  nevera_refrescos: CupSoda,
  nevera_carnes: Beef,
  nevera_vegetales: Carrot,
  stand_frutas: Apple,
  checkout: ShoppingCart,
  servicio_cliente: ConciergeBell,
  metro: Scan,
  columna: Landmark,
  // El tipo de antes (se dibujaba con un rectángulo a mano): no está en la biblioteca.
  exhibicion: Square,
};

/** El ícono de cada familia del catálogo: el de su primer tipo, como en el dibujo. */
export const ICONO_DE_FAMILIA: Record<string, LucideIcon> = {
  "Góndolas": Library,
  "Displays": Megaphone,
  "Muebles": Boxes,
  "Refrigeración": Snowflake,
  "Frescos": Apple,
  "Servicio": ShoppingCart,
  "Infraestructura": Landmark,
};

/** El ícono de un tipo; uno que no está en la tabla (un plano de otra versión) se ve como un cuadro. */
export function iconoDelTipo(tipo: string): LucideIcon {
  return (ICONO_DEL_TIPO as Record<string, LucideIcon>)[tipo] ?? Square;
}

/** El de una familia; una que el catálogo agregue después, con el de su primer tipo. */
export function iconoDeFamilia(familia: string, primerTipo?: string): LucideIcon {
  return ICONO_DE_FAMILIA[familia] ?? (primerTipo ? iconoDelTipo(primerTipo) : Square);
}
