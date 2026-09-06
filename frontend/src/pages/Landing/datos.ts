/**
 * MercaFresco — el supermercado de EJEMPLO de la landing.
 *
 * Todo lo de este archivo es INVENTADO y está sembrado acá, en el código de la
 * página pública: la landing no hace ni una llamada a `/api/*`, así que no hay
 * forma de que un dato de un cliente real se filtre a una pantalla sin sesión.
 * Los proveedores tampoco son empresas existentes — poner una marca real en un
 * plano público sería afirmar una relación comercial que no existe
 * (`features/landing/outputs/copy.md`, §13).
 *
 * Los prefijos son los del código real (`src/utils/nomenclatura.ts`): GON, PUN,
 * EXP, ISL, CRS, BEB, FRU, BAT, CAJ, SAC, COL. La landing enseña la misma
 * nomenclatura que la persona va a usar adentro.
 *
 * La escena está armada para que se lea como una tienda: 16 alquilables (7
 * libres, 3 que se liberan, 6 tomados) rodeados de ~30 muebles grises. Si todo
 * el piso estuviera pintado no se entendería que lo que se vende es escaso, que
 * es justamente el argumento de la página.
 */

export type Estado = "libre" | "libera" | "tomado" | "resto";

export interface Pieza {
  /** Esquina en coordenadas de sala (metros aproximados de la maqueta). */
  x: number;
  y: number;
  /** Ancho, profundidad y alto del prisma. */
  w: number;
  d: number;
  h: number;
  e: Estado;
  code: string;
  tipo: string;
  sede: "CENTRO" | "PALMAS";
  /** Dónde queda, en palabras (lo mismo que dice la app adentro). */
  ubi?: string;
  prov?: string;
  canon?: string;
  tarifa?: string;
  fecha?: string;
}

export interface Piso {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: "CENTRO" | "PALMAS";
}

/** La etiqueta de cada estado, palabra por palabra igual que `DashboardView`. */
export const ETIQUETA: Record<Estado, string> = {
  libre: "Libre todo el periodo",
  libera: "Se libera en el periodo",
  tomado: "Tomado",
  resto: "Resto de la sala",
};

/** Desplazamiento de PALMAS: queda detrás y arriba a la derecha de CENTRO. */
const OX = -2.5;
const OY = -30;

const piezas: Pieza[] = [];

function centro(p: Omit<Pieza, "sede">): void {
  piezas.push({ ...p, sede: "CENTRO" });
}

function palmas(p: Omit<Pieza, "sede">): void {
  piezas.push({ ...p, x: p.x + OX, y: p.y + OY, sede: "PALMAS" });
}

export const PISOS: Piso[] = [
  { x: -1.5, y: -1.5, w: 33, d: 23, rot: "CENTRO" },
  { x: -1.5 + OX, y: -1.5 + OY, w: 21, d: 17, rot: "PALMAS" },
];

/* ── CENTRO · contexto (gris, no se alquila) ─────────────────────────────── */
centro({ x: 2, y: -0.2, w: 13, d: 1.2, h: 3.2, e: "resto", code: "Pared de refrigerados", tipo: "Pared de refrigerados" });
centro({ x: 20.4, y: -0.2, w: 7.6, d: 1.2, h: 3.2, e: "resto", code: "Pared de refrigerados", tipo: "Pared de refrigerados" });
centro({ x: 4, y: 3.5, w: 20, d: 1.6, h: 2.2, e: "resto", code: "Corrida de góndola", tipo: "Góndola (no marcada como alquilable)" });
centro({ x: 4, y: 6.5, w: 20, d: 1.6, h: 2.2, e: "resto", code: "Corrida de góndola", tipo: "Góndola (no marcada como alquilable)" });
centro({ x: 4, y: 12.5, w: 20, d: 1.6, h: 2.2, e: "resto", code: "Corrida de góndola", tipo: "Góndola (no marcada como alquilable)" });
(["CAJ-01", "CAJ-03", "CAJ-04", "CAJ-05"] as const).forEach((c, i) => {
  centro({ x: 4.5 + i * 4, y: 17.6, w: 2.6, d: 1.2, h: 1.15, e: "resto", code: c, tipo: "Caja registradora" });
});
centro({ x: 21.5, y: 17.4, w: 4, d: 1.6, h: 1.3, e: "resto", code: "SAC-01", tipo: "Mostrador de servicio al cliente" });
([[2.2, 2.2], [2.2, 15.6], [13.6, 2.2], [13.6, 15.6], [26.4, 2.2], [26.4, 15.6]] as const).forEach((p, i) => {
  centro({ x: p[0], y: p[1], w: 0.9, d: 0.9, h: 4.2, e: "resto", code: "COL-0" + (i + 1), tipo: "Columna" });
});

/* ── CENTRO · alquilables (10) ───────────────────────────────────────────── */
centro({ x: 25.5, y: 15.2, w: 2.2, d: 2.2, h: 2.6, e: "tomado", code: "PUN-01", tipo: "Punta de góndola", ubi: "Frente a la entrada", prov: "Bebidas Zafiro", canon: "$ 1.300.000", fecha: "hasta el 28 sep" });
centro({ x: 24.2, y: 6.5, w: 2.2, d: 1.6, h: 2.6, e: "libera", code: "PUN-02", tipo: "Punta de góndola", ubi: "Pasillo 2, de cara a las cajas", prov: "Confites Milagro", canon: "$ 1.150.000", fecha: "libre desde el 26 sep" });
centro({ x: 1.6, y: 12.5, w: 2.2, d: 1.6, h: 2.6, e: "libre", code: "PUN-05", tipo: "Punta de góndola", ubi: "Pasillo 5, contra la pared del fondo", tarifa: "$ 1.000.000" });
centro({ x: 21.5, y: 14.6, w: 3, d: 2.2, h: 1.15, e: "tomado", code: "EXP-01", tipo: "Isla", ubi: "Frente a la entrada", prov: "Galletas Doña Rita", canon: "$ 1.200.000", fecha: "hasta el 30 nov" });
centro({ x: 13.5, y: 14.8, w: 3, d: 2, h: 1.15, e: "libre", code: "EXP-02", tipo: "Isla", ubi: "A 3 m de las cajas", tarifa: "$ 1.200.000" });
centro({ x: 12, y: 8.3, w: 2.6, d: 1.1, h: 1, e: "libera", code: "CRS-01", tipo: "Exhibición de piso", ubi: "Pasillo central", prov: "Aseo Rocío", canon: "$ 900.000", fecha: "libre desde el 22 sep" });
centro({ x: 8, y: 9.5, w: 10, d: 0.8, h: 2.2, e: "tomado", code: "GON-04·A", tipo: "Góndola, por cara", ubi: "Pasillo 3, lado par", prov: "Lácteos Monteverde", canon: "$ 240.000", fecha: "hasta el 31 oct" });
centro({ x: 8, y: 10.3, w: 10, d: 0.8, h: 2.2, e: "libre", code: "GON-04·B", tipo: "Góndola, por cara", ubi: "Pasillo 4, lado impar", tarifa: "$ 230.000" });
centro({ x: 15.2, y: -0.2, w: 5, d: 1.2, h: 3.2, e: "tomado", code: "BEB-01", tipo: "Nevera de bebidas", ubi: "Pared de refrigerados", prov: "Bebidas Zafiro", canon: "$ 450.000", fecha: "hasta el 30 nov" });
centro({ x: 26.6, y: 9.6, w: 2.6, d: 3.2, h: 1.05, e: "libre", code: "FRU-02", tipo: "Frutas y verduras", ubi: "Entrada, mano derecha", tarifa: "$ 380.000" });

/* ── PALMAS · contexto ───────────────────────────────────────────────────── */
palmas({ x: 3, y: 3, w: 11, d: 1.5, h: 2.2, e: "resto", code: "Corrida de góndola", tipo: "Góndola (no marcada como alquilable)" });
palmas({ x: 3, y: 6.75, w: 11, d: 0.75, h: 2.2, e: "resto", code: "GON-11·B", tipo: "Góndola, cara no marcada" });
palmas({ x: 3, y: 9, w: 11, d: 1.5, h: 2.2, e: "resto", code: "Corrida de góndola", tipo: "Góndola (no marcada como alquilable)" });
(["CAJ-01", "CAJ-03", "CAJ-04"] as const).forEach((c, i) => {
  palmas({ x: 2.5 + i * 4, y: 12.6, w: 2.4, d: 1.2, h: 1.15, e: "resto", code: c, tipo: "Caja registradora" });
});
palmas({ x: 16.5, y: 0.5, w: 3, d: 1.5, h: 1.3, e: "resto", code: "SAC-01", tipo: "Mostrador de servicio al cliente" });
([[1, 5], [17.4, 4], [17.4, 13.2]] as const).forEach((p, i) => {
  palmas({ x: p[0], y: p[1], w: 0.9, d: 0.9, h: 4.2, e: "resto", code: "COL-0" + (i + 4), tipo: "Columna" });
});

/* ── PALMAS · alquilables (6) ────────────────────────────────────────────── */
palmas({ x: 15.5, y: 11, w: 2, d: 2, h: 2.6, e: "tomado", code: "PUN-01", tipo: "Punta de góndola", ubi: "Frente a la entrada", prov: "Café Alto Bosque", canon: "$ 1.100.000", fecha: "hasta el 15 dic" });
palmas({ x: 14.2, y: 9, w: 2, d: 1.5, h: 2.6, e: "libre", code: "PUN-03", tipo: "Punta de góndola", ubi: "Pasillo 3, de cara a las cajas", tarifa: "$ 1.000.000" });
palmas({ x: 6.5, y: 12.6, w: 2.4, d: 1.2, h: 1.15, e: "libera", code: "CAJ-02", tipo: "Cabecera de caja", ubi: "Caja 2", prov: "Confites Milagro", canon: "$ 850.000", fecha: "libre desde el 24 sep" });
palmas({ x: 2, y: 0.2, w: 4.5, d: 2, h: 1.4, e: "tomado", code: "ISL-01", tipo: "Isla de congelados", ubi: "Zona de congelados", prov: "Cárnicos San Isidro", canon: "$ 700.000", fecha: "hasta el 31 oct" });
palmas({ x: 3, y: 6, w: 11, d: 0.75, h: 2.2, e: "libre", code: "GON-11·A", tipo: "Góndola, por cara", ubi: "Pasillo 1, lado par", tarifa: "$ 230.000" });
palmas({ x: 8, y: 10.6, w: 2.4, d: 1.4, h: 0.9, e: "libre", code: "BAT-01", tipo: "Batea", ubi: "Pasillo central", tarifa: "$ 320.000" });

/**
 * Orden del pintor: los cuerpos se dibujan de atrás hacia adelante, por
 * `x + y` del centro de la pieza. Se ordena UNA vez, acá, y no en cada
 * repintado de la cámara.
 */
export const PIEZAS: readonly Pieza[] = piezas
  .slice()
  .sort((a, b) => a.x + a.w / 2 + (a.y + a.d / 2) - (b.x + b.w / 2 + (b.y + b.d / 2)));

/** Los 16 espacios que se alquilan, en el orden en que se recorren con Tab. */
export const ALQUILABLES: readonly Pieza[] = PIEZAS.filter((p) => p.e !== "resto");

/** La pieza que abre sola su ficha al cargar: la que se libera el 26. */
export const PIEZA_INICIAL = "PUN-02";
