import type { FixType, GondolaType } from "../types/fixtures";

/**
 * Las tablas por TIPO de mueble del editor 3D, afuera del componente.
 *
 * Vivían adentro de `StoreEditor3D.tsx` —casi ocho mil líneas con three y
 * React—, y desde node no se podían leer: las guardas las fijaban con
 * expresiones regulares sobre el texto del componente. Están acá tal cual
 * estaban, con el mismo texto, los mismos valores y el mismo orden, para que
 * `scripts/capturar-catalogo.mjs` las vuelque a `scripts/casos/catalogo-antes.json`:
 * la referencia de cómo se comportaba cada tipo ANTES del catálogo único de
 * muebles.
 *
 * El orden de `FIXTURE_DEFS` importa: `/taller` (`pages/TallerMuebles.tsx`)
 * elige el mueble por su POSICIÓN en la lista.
 *
 * El editor las reexporta, así que quien las tomaba de ahí —`/taller`, el
 * visor de Vender— no cambió.
 */

export interface FixtureDef {
  type:         FixType;
  gondolaType?: GondolaType;
  label:        string;
  w: number; d: number; h: number;
  color:        string;
  emoji:        string;
  desc:         string;
  code:         string;
}

// ─── Fixture catalogue ────────────────────────────────────────────────────────

export const FIXTURE_DEFS: FixtureDef[] = [
  // ── Góndolas ──────────────────────────────────────────────────────────────
  { type:"gondola", gondolaType:"double", label:"Góndola Doble",    w:0.90, d:0.90, h:1.80, color:"#6366f1", emoji:"📚", desc:"Módulo de estante central, doble cara",   code:"GON" },
  { type:"gondola", gondolaType:"wall",   label:"Góndola Mural",    w:1.00, d:0.40, h:1.90, color:"#818cf8", emoji:"🧱", desc:"Módulo de estante contra pared",           code:"GON" },
  { type:"punta",                         label:"Punta Góndola",    w:0.90, d:0.40, h:1.80, color:"#7c3aed", emoji:"🏷️",  desc:"Cabecera de góndola con topper promocional", code:"PUN" },
  // ── Displays ──────────────────────────────────────────────────────────────
  { type:"ristra",                        label:"Ristra",           w:0.40, d:0.40, h:1.60, color:"#d97706", emoji:"🪝",  desc:"Colgante de productos",                   code:"RIS" },
  { type:"cross",                         label:"Exhibidor Cruz",   w:0.80, d:0.80, h:1.80, color:"#0891b2", emoji:"➕", desc:"Display lateral cross-selling",            code:"CRS" },
  // ── Muebles ───────────────────────────────────────────────────────────────
  { type:"mueble",                        label:"Vitrina",          w:1.20, d:0.60, h:2.00, color:"#475569", emoji:"🗄️", desc:"Vitrina con puertas de vidrio",            code:"MUE" },
  { type:"isla",                          label:"Exhib. de Piso",   w:1.20, d:0.80, h:1.40, color:"#f59e0b", emoji:"🏪", desc:"Exhibidor de piso con estantes y productos", code:"EXP" },
  { type:"impulsador",                    label:"Impulsador Marca",  w:0.60, d:0.40, h:1.50, color:"#e11d48", emoji:"🏷️",  desc:"Display compacto de impulso de marca",         code:"IMP" },
  { type:"batea",                         label:"Batea",            w:0.80, d:0.60, h:0.80, color:"#84cc16", emoji:"🧺", desc:"Canasto metálico con ruedas",              code:"BAT" },
  // ── Refrigeración ─────────────────────────────────────────────────────────
  { type:"isla_fria",        label:"Isla Helados/Cong.",  w:1.80, d:1.00, h:0.90, color:"#e5e7eb", emoji:"🍦", desc:"Isla abierta refrigerada con guarda de acrílico",code:"ISL" },
  { type:"nevera_carnes",    label:"Nevera Carnes",       w:2.00, d:0.90, h:1.05, color:"#111827", emoji:"🥩", desc:"Mostrador con vidrio curvo para carnes y deli",  code:"CAR" },
  { type:"nevera_refrescos", label:"Nevera Refrescos",    w:1.20, d:0.75, h:1.80, color:"#1e293b", emoji:"🥤", desc:"Vitrina multideck abierta para bebidas",         code:"BEB" },
  { type:"nevera_vegetales", label:"Nevera Vegetales",    w:1.80, d:0.90, h:1.60, color:"#1e293b", emoji:"🥬", desc:"Mural refrigerado de frutas y verduras, con bandejas inclinadas", code:"VEG" },
  // ── Servicio ──────────────────────────────────────────────────────────────
  { type:"stand_frutas",                  label:"Stand Frutas/Verd",w:1.50, d:1.20, h:0.95, color:"#84cc16", emoji:"🍎", desc:"Cajón expositor de frutas y verduras", code:"FRU" },
  { type:"checkout",                      label:"Checkout / Caja",  w:1.80, d:0.70, h:0.90, color:"#8b5cf6", emoji:"🛒", desc:"Caja registradora con cinta transportadora", code:"CAJ" },
  { type:"servicio_cliente",              label:"Servicio al Cliente", w:1.60, d:0.70, h:1.10, color:"#0ea5e9", emoji:"💁", desc:"Mostrador de atención: devoluciones, reclamos e información", code:"SAC" },
  // ── Infraestructura ───────────────────────────────────────────────────────
  { type:"metro",                         label:"Zona Libre",       w:1.00, d:1.00, h:0.05, color:"#64748b", emoji:"⬜", desc:"Área de suelo demarcada",                  code:"MET" },
  { type:"columna",                       label:"Columna",          w:0.30, d:0.30, h:3.00, color:"#94a3b8", emoji:"🏛️", desc:"Columna estructural",                      code:"COL" },
  // ── Accesorios de góndola ─────────────────────────────────────────────────
  // Robatope: w=0.30 (ancho del panel), d=0.40 (= profundidad de la Punta → encaja al ras)
  { type:"robatope",                      label:"Robatope",         w:0.30, d:0.40, h:1.60, color:"#c0c0bc", emoji:"🛡️", desc:"Panel lateral de protección — flanquea la Punta de Góndola", code:"ROB" },
];

/**
 * Los muebles que pueden llevar el producto del proveedor.
 *
 * Antes eran DOS listas que se cruzaban —una de «tiene estantes» y otra de
 * «tiene cara pintable»— y bastaba faltar en cualquiera para quedar afuera. El
 * resultado: 8 de los 13 tipos que se venden no mostraban nada al cargarles el
 * arte, y justo los promocionales (isla, batea, impulsador, ristra). Una sola
 * lista, y lo que decide CÓMO se pinta es `getPanelShelfSpan`.
 *
 * Lo que no está acá es infraestructura: no se alquila, así que no lleva
 * producto de nadie.
 */
export const TIPOS_CON_PRODUCTO = new Set<string>([
  "gondola", "gondola_doble", "punta", "robatope", "mueble", "nevera_refrescos",
  "isla", "batea", "impulsador", "ristra", "cross",
  "stand_frutas", "nevera_carnes", "nevera_vegetales", "isla_fria", "exhibicion",
]);

/**
 * Los muebles donde el producto de PRUEBA se para como envases 3D
 * (`ProductoDePrueba`). Son los que venden por entrepaños y tienen su cuenta
 * en `ventaDeTipo`: ahí el producto se apoya en la altura exacta de cada
 * entrepaño. La vitrina, la ristra, los volcados, la cruz, el impulsador y la
 * isla siguen con la lámina, como antes: no tienen entrepaños donde pararlo.
 */
export const TIPOS_CON_PRUEBA_3D = new Set<string>(["gondola", "punta", "nevera_refrescos", "robatope"]);

/** Dónde se ofrece el surtido (varios productos del proveedor en bloques).
 *  No en la nevera —las rejillas automáticas se acomodan a UN producto, y
 *  con alturas distintas los demás no entrarían— ni en el robatope, que
 *  tiene un solo vano de 30 cm. */
export const TIPOS_CON_SURTIDO = new Set<string>(["gondola", "punta"]);
