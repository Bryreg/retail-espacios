import type { FixType2D } from "../utils/convertirPlano";

/**
 * Las tablas por TIPO de mueble del plano 2D, afuera del componente.
 *
 * Vivían adentro de `FloorPlan2D.tsx` y desde node no se podían leer. Están
 * acá tal cual estaban —mismo texto, mismos valores, mismo orden— para que
 * `scripts/capturar-catalogo.mjs` las vuelque a `scripts/casos/catalogo-antes.json`,
 * la referencia de cómo se comportaba cada tipo ANTES del catálogo único de
 * muebles. Los comentarios viajaron con su tabla: el «arriba» del de los
 * colores es `FloorPlan2D.tsx`, donde está la terna de estado.
 *
 * Ojo con las diferencias contra el editor 3D (`catalogo/editor3D.ts`), que
 * quedan como estaban a propósito: acá el fondo del mostrador de carnes es
 * 0,85 (allá 0,90), `H_DEFAULTS` no tiene `servicio_cliente` (nace de 1,80 m)
 * y `COLOR_DEFAULTS` trae un `nevera_mural` que no existe.
 */

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const CATALOG: {
  type: FixType2D;
  label: string;
  w: number;
  h: number;      // depth (Z axis in 2D top-down; maps to UnifiedFixture.d)
  emoji: string;
  prefix: string;
  category: string;
}[] = [
  // ── Góndolas ──────────────────────────────────────────────────────────
  { type: "gondola_doble", label: "Góndola Doble",    w: 0.90, h: 0.90, emoji: "📚", prefix: "GON", category: "Góndolas" },
  { type: "gondola_mural", label: "Góndola Mural",    w: 1.00, h: 0.40, emoji: "🧱", prefix: "GON", category: "Góndolas" },
  { type: "punta",         label: "Punta Góndola",    w: 0.90, h: 0.40, emoji: "🏷️",  prefix: "PUN", category: "Góndolas" },
  { type: "robatope",      label: "Robatope",          w: 0.30, h: 0.40, emoji: "🛡️", prefix: "ROB", category: "Góndolas" },
  // ── Displays & Cross-selling ────────────────────────────────────────
  { type: "ristra",        label: "Ristra",            w: 0.40, h: 0.40, emoji: "🪝",  prefix: "RIS", category: "Displays" },
  { type: "cross",         label: "Exhibidor Cruz",    w: 0.80, h: 0.80, emoji: "➕", prefix: "CRS", category: "Displays" },
  { type: "impulsador",   label: "Impulsador Marca",  w: 0.60, h: 0.40, emoji: "🏷️", prefix: "IMP", category: "Displays" },
  // ── Muebles ───────────────────────────────────────────────────────────
  { type: "mueble",        label: "Vitrina",           w: 1.20, h: 0.60, emoji: "🗄️", prefix: "MUE", category: "Muebles" },
  { type: "isla",          label: "Exhib. de Piso",    w: 1.20, h: 0.80, emoji: "🏪", prefix: "EXP", category: "Muebles" },
  { type: "batea",         label: "Batea",             w: 0.80, h: 0.60, emoji: "🧺", prefix: "BAT", category: "Muebles" },
  // ── Refrigeración ─────────────────────────────────────────────────────
  { type: "isla_fria",        label: "Isla Helados/Cong.", w: 1.80, h: 1.00, emoji: "🍦", prefix: "ISL", category: "Refrigeración" },
  { type: "nevera_carnes",    label: "Nevera Carnes",      w: 2.00, h: 0.85, emoji: "🥩", prefix: "CAR", category: "Refrigeración" },
  { type: "nevera_vegetales", label: "Nevera Vegetales",   w: 1.80, h: 0.90, emoji: "🥬", prefix: "VEG", category: "Refrigeración" },
  { type: "nevera_refrescos", label: "Nevera Refrescos",   w: 1.20, h: 0.75, emoji: "🥤", prefix: "BEB", category: "Refrigeración" },
  // ── Servicio ──────────────────────────────────────────────────────────
  { type: "stand_frutas",  label: "Stand Frutas/Verd", w: 1.50, h: 1.20, emoji: "🍎", prefix: "FRU", category: "Frescos" },
  { type: "checkout",      label: "Checkout / Caja",   w: 1.80, h: 0.70, emoji: "🛒", prefix: "CAJ", category: "Servicio" },
  { type: "servicio_cliente", label: "Servicio al Cliente", w: 1.60, h: 0.70, emoji: "💁", prefix: "SAC", category: "Servicio" },
  // ── Infraestructura ───────────────────────────────────────────────────
  { type: "metro",         label: "Zona Libre",        w: 1.00, h: 1.00, emoji: "⬜", prefix: "MET", category: "Infraestructura" },
  { type: "columna",       label: "Columna",           w: 0.30, h: 0.30, emoji: "🏛️", prefix: "COL", category: "Infraestructura" },
];

/** 3D height defaults (used when promoting a 2D item to a UnifiedFixture).
 *  Keys match FixType2D so gondola_doble / gondola_mural can be distinguished. */
export const H_DEFAULTS: Record<string, number> = {
  gondola_doble: 1.80, gondola_mural: 1.90,
  punta: 1.80, robatope: 1.60, ristra: 1.60,
  cross: 1.80, metro: 0.05, mueble: 2.00, exhibicion: 1.50,
  isla: 1.40, impulsador: 1.50,
  batea: 0.80, isla_fria: 0.90,
  nevera_carnes: 1.05, nevera_refrescos: 1.80, nevera_vegetales: 1.60,
  stand_frutas: 0.95, checkout: 0.90, columna: 3.00,
};

/* PENDIENTE DEL PR 2 (forma / dataviz). Estos veinte son un color por TIPO de
   mueble —góndola, punta, ristra, nevera, caja— y quedan como estaban a
   propósito. No son la terna de estado (esa ya salió a tokens arriba) sino una
   paleta CATEGÓRICA de veinte entradas elegidas a ojo: no está validada contra
   daltonismo, no está medida contra ninguna de las dos superficies, y en modo
   oscuro varias son igual de brillantes entre sí. Cambiarlas es reelegir una
   paleta de veinte con el validador en la mano, que es una decisión de diseño
   y no un cambio de piel. Anotado en `features/diseno-interior/outputs/frontend.md`.
   Además el color de cada mueble es dato guardado (`f.color`), así que moverlo
   toca lo que ya está en la base, no sólo lo que se pinta. */
export const COLOR_DEFAULTS: Record<string, string> = {
  gondola_doble: "#6366f1", gondola_mural: "#818cf8",
  punta: "#7c3aed", robatope: "#c0c0bc",
  ristra: "#d97706", cross: "#0891b2", impulsador: "#e11d48", metro: "#64748b",
  mueble: "#475569", exhibicion: "#ec4899",
  isla: "#f59e0b", batea: "#84cc16", nevera_mural: "#06b6d4",
  isla_fria: "#e5e7eb", nevera_carnes: "#1e293b", nevera_refrescos: "#1e293b",
  nevera_vegetales: "#1e293b",
  stand_frutas: "#84cc16",
  checkout: "#8b5cf6", columna: "#94a3b8",
};
