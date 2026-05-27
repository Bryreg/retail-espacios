import type { ZoneDef } from "../../types";

// Viewport matches actual image: 1229 x 896
// Zones are semi-transparent overlays on top of the real floor plan image
// Coordinates calibrated via pixel analysis of plano.png

export const IMG_W = 1229;
export const IMG_H = 896;

export const ZONES: ZoneDef[] = [
  // ── Licores (small section just below register strip, top-left) ───────────
  { id: "lic-24h",           label: "Licores 24H",                  x: 102, y: 93,  width: 76,  height: 82,  selectable: true, type: "gondola" },
  { id: "lic-golosinas",     label: "Licores / Golosinas",          x: 178, y: 93,  width: 128, height: 82,  selectable: true, type: "gondola" },

  // ── Left row A — Sal / Azúcar / Granos / Arroz (y=204-282) ───────────────
  { id: "sal-azucar-granos", label: "Sal / Azúcar / Granos",        x: 178, y: 204, width: 341, height: 78,  selectable: true, type: "gondola" },
  { id: "arroz-centro",      label: "Arroz (3 módulos)",            x: 519, y: 204, width: 138, height: 78,  selectable: true, type: "gondola" },

  // ── ARROZ Exhibición Principal (large green grid, right side y=160-284) ───
  { id: "arroz-exhibicion",  label: "ARROZ\nExhibición Principal",  x: 657, y: 160, width: 298, height: 124, selectable: true, type: "gondola" },

  // ── Right row A2 — small zones above arroz exhibición (same y=93-155) ─────
  // NOTE: grano-granel is BELOW arroz-exhibicion in the actual floor plan (y≈338)
  // These are positioned at right side, second gondola tier

  // ── Left row B — Utensilios / Mascotas (y=338-400) ───────────────────────
  { id: "utensilios-ferreteria", label: "Utensilios / Ferretería / Autos", x: 102, y: 338, width: 200, height: 62, selectable: true, type: "gondola" },
  { id: "mascotas",              label: "Mascotas / Granel",               x: 302, y: 338, width: 215, height: 62, selectable: true, type: "gondola" },

  // ── Right row B — Grano / Desechables / Vacío (y=338-368) ────────────────
  { id: "grano-granel",      label: "Grano a Granel",               x: 657, y: 338, width: 108, height: 34,  selectable: true, type: "gondola" },
  { id: "desechables-a",     label: "Desechables",                  x: 765, y: 338, width: 90,  height: 34,  selectable: true, type: "gondola" },
  { id: "vacio-aceites",     label: "Vacío / Aceites",              x: 855, y: 338, width: 100, height: 34,  selectable: true, type: "gondola" },

  // ── Right row B2 — Mezclas / Pastas / Aceites (y=372-400) ────────────────
  { id: "mezclas-harinas",   label: "Mezclas / Harinas",            x: 657, y: 372, width: 108, height: 30,  selectable: true, type: "gondola" },
  { id: "pastas-salsas",     label: "Pastas / Salsas",              x: 765, y: 372, width: 96,  height: 30,  selectable: true, type: "gondola" },
  { id: "aceites-sopas",     label: "Aceites / Mant. / Sopas",      x: 861, y: 372, width: 94,  height: 30,  selectable: true, type: "gondola" },

  // ── Left row C — Aseo / Pañales / Papel (y=425-515) ──────────────────────
  { id: "aseo-panales",      label: "Aseo BB / Pañales / Papel Hig.",  x: 102, y: 425, width: 205, height: 90, selectable: true, type: "gondola" },
  { id: "escobas-guantes",   label: "Escobas / Guantes / Bolsas",      x: 307, y: 425, width: 120, height: 90, selectable: true, type: "gondola" },
  { id: "servilletas-cocina",label: "Servilletas / Papel Cocina",       x: 427, y: 425, width: 92,  height: 90, selectable: true, type: "gondola" },

  // ── Right row C — Cereales / Panadería (y=405-449) ───────────────────────
  { id: "cereales",          label: "Cereales",                     x: 657, y: 405, width: 104, height: 44,  selectable: true, type: "gondola" },
  { id: "panaderia-sal",     label: "Leche / Pan Dulce / Panadería",x: 761, y: 405, width: 194, height: 44,  selectable: true, type: "gondola" },

  // ── Lácteos / Refrigerados frente (y=449-517) ────────────────────────────
  { id: "leche-huevos",      label: "Leche / Huevos / Condimentos", x: 657, y: 449, width: 298, height: 68,  selectable: true, type: "refrigerator" },

  // ── ZONA PROMOCIONAL (y=558-598) ─────────────────────────────────────────
  { id: "zona-promocional",  label: "ZONA PROMOCIONAL",             x: 102, y: 558, width: 518, height: 40,  selectable: true, type: "promo" },

  // ── Left row D — Cuidado Personal / Limpiadores (y=628-696) ──────────────
  { id: "cuid-facial-des",   label: "CUD Facial / Desodorantes",    x: 102, y: 628, width: 178, height: 68, selectable: true, type: "gondola" },
  { id: "jab-cuid-oral",     label: "JAB Corp / Cuid. Oral / Capilar", x: 280, y: 628, width: 178, height: 68, selectable: true, type: "gondola" },
  { id: "limpiadores-insect",label: "Limpiadores / Insecticidas",   x: 458, y: 628, width: 162, height: 68, selectable: true, type: "gondola" },

  // ── Right row D — Gelatinas / Cafés / Galletas / Repostería (y=560-640) ──
  { id: "gelatinas-aromaticas", label: "Gelatinas / Aromáticas / Modificadores", x: 657, y: 560, width: 154, height: 42, selectable: true, type: "gondola" },
  { id: "cafes-choco",          label: "Cafés / Chocomesa",                       x: 811, y: 560, width: 144, height: 42, selectable: true, type: "gondola" },
  { id: "galletas",             label: "Galletas",                                x: 657, y: 602, width: 154, height: 40, selectable: true, type: "gondola" },
  { id: "reposteria",           label: "Repostería",                              x: 811, y: 602, width: 144, height: 40, selectable: true, type: "gondola" },

  // ── Left row E — Detergentes / Enlatados / Leche Polvo (y=700-768) ───────
  { id: "detergente-polvo",  label: "Detergente / Limpia Pisos / Lavaloza", x: 102, y: 700, width: 205, height: 68, selectable: true, type: "gondola" },
  { id: "enlatados-conservas",label: "Encurtidos / Enlatados",               x: 307, y: 700, width: 180, height: 68, selectable: true, type: "gondola" },
  { id: "leche-polvo-bebe",  label: "Leche Polvo / Alim. Bebé / Avenas",    x: 487, y: 700, width: 133, height: 68, selectable: true, type: "gondola" },

  // ── Right row E — Desechables / REF / Cosméticos (y=642-712) ─────────────
  { id: "desechables-snack", label: "Desechables / Snack",          x: 657, y: 642, width: 154, height: 68,  selectable: true, type: "gondola" },
  { id: "ref-cosmeticos",    label: "REF / Res / Cosméticos",       x: 811, y: 642, width: 144, height: 68,  selectable: true, type: "gondola" },

  // ── Row F — Jabones / Blanqueadores (y=795-835) ───────────────────────────
  { id: "jabon-blanq",       label: "Jabón / Blanqueadores / Suavizantes / Bondi", x: 102, y: 795, width: 520, height: 42, selectable: true, type: "gondola" },

  // ── Bottom specialty strip (y=855-880) ────────────────────────────────────
  { id: "cantera",      label: "Cantera",        x: 102, y: 855, width: 78,  height: 25, selectable: true, type: "specialty" },
  { id: "vivero",       label: "Vivero",         x: 180, y: 855, width: 82,  height: 25, selectable: true, type: "specialty" },
  { id: "decoraciones", label: "Decoraciones",   x: 262, y: 855, width: 98,  height: 25, selectable: true, type: "specialty" },
  { id: "zona-azul",    label: "Zona Final",     x: 360, y: 855, width: 595, height: 25, selectable: true, type: "specialty" },

  // ── Refrigeradores columna derecha (x=958) ────────────────────────────────
  { id: "ref-col-a",    label: "Ref A", x: 958, y: 160, width: 48, height: 178, selectable: true, type: "refrigerator" },
  { id: "ref-col-b",    label: "Ref B", x: 958, y: 338, width: 48, height: 179, selectable: true, type: "refrigerator" },
  { id: "ref-col-c",    label: "Ref C", x: 958, y: 517, width: 48, height: 183, selectable: true, type: "refrigerator" },
  { id: "ref-col-d",    label: "Ref D", x: 958, y: 700, width: 48, height: 155, selectable: true, type: "refrigerator" },
];

export const STATUS_COLORS: Record<string, string> = {
  free:        "rgba(34,  197, 94,  0.25)",
  occupied:    "rgba(239, 68,  68,  0.40)",
  reserved:    "rgba(245, 158, 11,  0.40)",
  maintenance: "rgba(148, 163, 184, 0.40)",
};

export const STATUS_COLORS_SOLID: Record<string, string> = {
  free:        "#22c55e",
  occupied:    "#ef4444",
  reserved:    "#f59e0b",
  maintenance: "#94a3b8",
};

export const INFRASTRUCTURE_COLORS: Record<string, string> = {
  register:        "#ea580c",
  infrastructure:  "#6b7280",
  refrigerator:    "rgba(239, 68,  68,  0.35)",
  promo:           "rgba(234, 179, 8,   0.35)",
  gondola:         "rgba(34,  197, 94,  0.25)",
  specialty:       "rgba(167, 139, 250, 0.35)",
  punta_gondola:   "rgba(59,  130, 246, 0.45)",   // blue
  robatope:        "rgba(249, 115, 22,  0.50)",   // orange
  ristra:          "rgba(168, 85,  247, 0.45)",   // purple
  cross:           "rgba(236, 72,  153, 0.45)",   // pink
  metro_cuadrado:  "rgba(20,  184, 166, 0.40)",   // teal
  mueble:          "rgba(234, 179, 8,   0.50)",   // amber
};
