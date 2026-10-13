/**
 * El supermercado de EJEMPLO de la landing — la constante `PIEZAS` de la
 * dirección E (`features/landing/outputs/opciones/E-fusion/index.html`),
 * portada tal cual: 45 piezas, 16 alquilables (10 en CENTRO, 6 en PALMAS) y 29
 * de contexto gris, porque el gris tiene que ser mayoría (`copy.md` §13.1).
 *
 * Todo lo de este archivo es INVENTADO y está sembrado acá, en el código de la
 * página pública: la landing no hace ni una llamada a `/api/*`, así que no hay
 * forma de que un dato de un cliente real se filtre a una pantalla sin sesión.
 * Los proveedores tampoco son empresas existentes — poner una marca real en un
 * plano público sería afirmar una relación comercial que no existe
 * (`features/landing/outputs/copy.md`, §13).
 *
 * El supermercado NO se nombra en pantalla («Supermercado de ejemplo» y nada
 * más): el nombre que propone el copy ya identifica a un cliente en la consola
 * del operador, y `backend/tests/test_landing_ataques.py` §L05 lo prohíbe en
 * una página indexable. Es la única palabra del copy que no se pudo usar.
 *
 * Los prefijos son los del código real (`src/utils/nomenclatura.ts`): GON, PUN,
 * EXP, ISL, CRS, BEB, FRU, BAT, CAJ, SAC, COL. La landing enseña los mismos
 * nombres que la persona va a usar adentro.
 */

export type Estado = "libre" | "libera" | "tomado" | "resto";
export type Sede = "CENTRO" | "PALMAS";

/** Las dos salas, con su desplazamiento en la maqueta (metros aproximados). */
export const SEDES: Record<Sede, { dx: number; dy: number; w: number; d: number }> = {
  CENTRO: { dx: 0, dy: 0, w: 31.2, d: 21.2 },
  PALMAS: { dx: 38, dy: 1.5, w: 21.2, d: 17.2 },
};

export interface Pieza {
  /** `SEDE/CODE`: identifica la pieza sin ambigüedad (los códigos se repiten). */
  llave: string;
  sede: Sede;
  code: string;
  tipo: string;
  /** El estado de origen. La temporada lo repinta en caliente, no acá. */
  e: Estado;
  /** Dónde queda, en palabras (lo mismo que dice la app adentro). */
  ubi?: string;
  prov?: string;
  /** Plata en números: la landing la formatea con `pesos()`, sin librerías. */
  canon?: number;
  tarifa?: number;
  fecha?: string;
  /** Esquina en coordenadas de sala, ya con el desplazamiento de la sede. */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Orden del pintor: de atrás hacia adelante. */
  depth: number;
  alq: boolean;
}

/** La etiqueta de cada estado, palabra por palabra igual que `DashboardView`. */
export const ETIQUETA: Record<Estado, string> = {
  libre: "Libre todo el periodo",
  libera: "Se libera en el periodo",
  tomado: "Tomado",
  resto: "Resto de la sala",
};

type Cruda = Omit<Pieza, "llave" | "depth" | "alq" | "x" | "y"> & { x: number; y: number };

const crudas: Cruda[] = [
  /* ── CENTRO · contexto (el gris es mayoría) ─────────────────────────────── */
  { sede: "CENTRO", code: "REF-01", tipo: "Pared de refrigerados", e: "resto", x: 2, y: 0.6, w: 17, d: 1.4, h: 3.2 },
  { sede: "CENTRO", code: "REF-02", tipo: "Pared de refrigerados", e: "resto", x: 25.6, y: 0.6, w: 3.4, d: 1.4, h: 3.2 },
  { sede: "CENTRO", code: "GON-01", tipo: "Corrida de góndola", e: "resto", x: 3, y: 4.0, w: 10, d: 1.2, h: 2.0 },
  { sede: "CENTRO", code: "GON-02", tipo: "Corrida de góndola", e: "resto", x: 16.5, y: 4.0, w: 9.5, d: 1.2, h: 2.0 },
  { sede: "CENTRO", code: "GON-04", tipo: "Corrida de góndola", e: "resto", x: 3, y: 7.6, w: 10, d: 1.0, h: 2.0 },
  { sede: "CENTRO", code: "GON-05", tipo: "Corrida de góndola", e: "resto", x: 16.5, y: 7.6, w: 9.5, d: 1.2, h: 2.0 },
  { sede: "CENTRO", code: "GON-08", tipo: "Corrida de góndola", e: "resto", x: 3, y: 11.0, w: 10, d: 1.2, h: 2.0 },
  { sede: "CENTRO", code: "GON-09", tipo: "Corrida de góndola", e: "resto", x: 16.5, y: 11.0, w: 9.5, d: 1.2, h: 2.0 },
  { sede: "CENTRO", code: "CAJ-01", tipo: "Caja registradora", e: "resto", x: 3, y: 16.0, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "CENTRO", code: "CAJ-03", tipo: "Caja registradora", e: "resto", x: 6.6, y: 16.0, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "CENTRO", code: "CAJ-04", tipo: "Caja registradora", e: "resto", x: 10.2, y: 16.0, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "CENTRO", code: "CAJ-05", tipo: "Caja registradora", e: "resto", x: 13.8, y: 16.0, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "CENTRO", code: "CAJ-06", tipo: "Caja registradora", e: "resto", x: 17.4, y: 16.0, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "CENTRO", code: "SAC-01", tipo: "Mostrador de servicio al cliente", e: "resto", x: 23, y: 15.8, w: 5, d: 1.6, h: 1.3 },
  { sede: "CENTRO", code: "COL-01", tipo: "Columna", e: "resto", x: 14.6, y: 2.2, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "CENTRO", code: "COL-02", tipo: "Columna", e: "resto", x: 14.6, y: 9.4, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "CENTRO", code: "COL-03", tipo: "Columna", e: "resto", x: 16.4, y: 14.6, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "CENTRO", code: "COL-04", tipo: "Columna", e: "resto", x: 29, y: 6.0, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "CENTRO", code: "COL-05", tipo: "Columna", e: "resto", x: 0.6, y: 9.4, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "CENTRO", code: "COL-06", tipo: "Columna", e: "resto", x: 29, y: 13.6, w: 0.7, d: 0.7, h: 3.6 },

  /* ── CENTRO · alquilables (10) ──────────────────────────────────────────── */
  { sede: "CENTRO", code: "PUN-01", tipo: "Punta de góndola", ubi: "Frente a la entrada", e: "tomado", prov: "Bebidas Zafiro", canon: 1300000, fecha: "hasta el 28 sep", x: 1.4, y: 13.2, w: 1.8, d: 1.9, h: 2.6 },
  { sede: "CENTRO", code: "PUN-02", tipo: "Punta de góndola", ubi: "Pasillo 2, de cara a las cajas", e: "libera", prov: "Confites Milagro", canon: 1150000, fecha: "libre desde el 26 sep", x: 13.3, y: 13.2, w: 1.8, d: 1.9, h: 2.6 },
  { sede: "CENTRO", code: "PUN-05", tipo: "Punta de góndola", ubi: "Pasillo 5, contra la pared del fondo", e: "libre", tarifa: 1000000, x: 26.4, y: 3.0, w: 1.8, d: 1.9, h: 2.6 },
  { sede: "CENTRO", code: "EXP-01", tipo: "Estiba (exhibición de piso)", ubi: "Frente a la entrada", e: "tomado", prov: "Galletas Doña Rita", canon: 1200000, fecha: "hasta el 30 nov", x: 5.4, y: 13.4, w: 3.2, d: 1.8, h: 1.5 },
  { sede: "CENTRO", code: "EXP-02", tipo: "Estiba (exhibición de piso)", ubi: "A 3 m de las cajas", e: "libre", tarifa: 1200000, x: 18.4, y: 13.4, w: 3.2, d: 1.8, h: 1.5 },
  { sede: "CENTRO", code: "CRS-01", tipo: "Exhibidor cruz", ubi: "Pasillo central", e: "libera", prov: "Aseo Rocío", canon: 900000, fecha: "libre desde el 22 sep", x: 14.3, y: 5.4, w: 1.5, d: 2.6, h: 1.4 },
  { sede: "CENTRO", code: "GON-04·A", tipo: "Góndola, por cara", ubi: "Pasillo 3, lado par", e: "tomado", prov: "Lácteos Monteverde", canon: 240000, fecha: "hasta el 31 oct", x: 4.5, y: 7.14, w: 8, d: 0.46, h: 2.4 },
  { sede: "CENTRO", code: "GON-04·B", tipo: "Góndola, por cara", ubi: "Pasillo 4, lado impar", e: "libre", tarifa: 230000, x: 4.5, y: 8.6, w: 8, d: 0.46, h: 2.4 },
  { sede: "CENTRO", code: "BEB-01", tipo: "Nevera de bebidas", ubi: "Pared de refrigerados", e: "tomado", prov: "Bebidas Zafiro", canon: 450000, fecha: "hasta el 30 nov", x: 19.2, y: 0.6, w: 6.2, d: 1.4, h: 3.2 },
  { sede: "CENTRO", code: "FRU-02", tipo: "Frutas y verduras", ubi: "Entrada, mano derecha", e: "libre", tarifa: 380000, x: 24, y: 18.0, w: 4.5, d: 1.5, h: 1.2 },

  /* ── PALMAS · contexto ──────────────────────────────────────────────────── */
  { sede: "PALMAS", code: "REF-01", tipo: "Pared de refrigerados", e: "resto", x: 2, y: 0.6, w: 16, d: 1.4, h: 3.2 },
  { sede: "PALMAS", code: "GON-05", tipo: "Corrida de góndola", e: "resto", x: 3, y: 3.5, w: 9, d: 1.2, h: 2.0 },
  { sede: "PALMAS", code: "GON-11", tipo: "Corrida de góndola", e: "resto", x: 3, y: 7.0, w: 9, d: 1.0, h: 2.0 },
  { sede: "PALMAS", code: "GON-14", tipo: "Corrida de góndola", e: "resto", x: 3, y: 10.5, w: 9, d: 1.2, h: 2.0 },
  { sede: "PALMAS", code: "CAJ-01", tipo: "Caja registradora", e: "resto", x: 3, y: 13.6, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "PALMAS", code: "CAJ-03", tipo: "Caja registradora", e: "resto", x: 10.2, y: 13.6, w: 2.8, d: 1.2, h: 1.1 },
  { sede: "PALMAS", code: "SAC-01", tipo: "Mostrador de servicio al cliente", e: "resto", x: 15, y: 13.4, w: 4, d: 1.6, h: 1.3 },
  { sede: "PALMAS", code: "COL-01", tipo: "Columna", e: "resto", x: 13.5, y: 3.0, w: 0.7, d: 0.7, h: 3.6 },
  { sede: "PALMAS", code: "COL-02", tipo: "Columna", e: "resto", x: 13.5, y: 10.0, w: 0.7, d: 0.7, h: 3.6 },

  /* ── PALMAS · alquilables (6) ───────────────────────────────────────────── */
  { sede: "PALMAS", code: "PUN-01", tipo: "Punta de góndola", ubi: "Frente a la entrada", e: "tomado", prov: "Café Alto Bosque", canon: 1100000, fecha: "hasta el 15 dic", x: 0.9, y: 11.9, w: 1.8, d: 1.9, h: 2.6 },
  { sede: "PALMAS", code: "PUN-03", tipo: "Punta de góndola", ubi: "Pasillo 3, de cara a las cajas", e: "libre", tarifa: 1000000, x: 12.3, y: 11.4, w: 1.8, d: 1.9, h: 2.6 },
  { sede: "PALMAS", code: "CAJ-02", tipo: "Cabecera de caja", ubi: "Caja 2", e: "libera", prov: "Confites Milagro", canon: 850000, fecha: "libre desde el 24 sep", x: 6.6, y: 13.6, w: 2.8, d: 1.2, h: 1.7 },
  { sede: "PALMAS", code: "ISL-01", tipo: "Isla de congelados", ubi: "Zona de congelados", e: "tomado", prov: "Cárnicos San Isidro", canon: 700000, fecha: "hasta el 31 oct", x: 15, y: 3.5, w: 4, d: 3.0, h: 1.3 },
  { sede: "PALMAS", code: "GON-11·A", tipo: "Góndola, por cara", ubi: "Pasillo 1, lado par", e: "libre", tarifa: 230000, x: 4, y: 6.54, w: 7, d: 0.46, h: 2.4 },
  { sede: "PALMAS", code: "BAT-01", tipo: "Batea", ubi: "Pasillo central", e: "libre", tarifa: 320000, x: 15, y: 8.0, w: 3.2, d: 2.0, h: 1.0 },
];

/**
 * Orden del pintor: los cuerpos se dibujan de atrás hacia adelante, por
 * `x + y` del centro de la pieza. Se ordena UNA vez, acá, y no en cada
 * repintado de la cámara.
 */
export const PIEZAS: readonly Pieza[] = crudas
  .map((p) => {
    const s = SEDES[p.sede];
    const x = p.x + s.dx;
    const y = p.y + s.dy;
    return {
      ...p,
      x,
      y,
      llave: p.sede + "/" + p.code,
      depth: x + p.w / 2 + (y + p.d / 2),
      alq: p.e !== "resto",
    };
  })
  .sort((a, b) => a.depth - b.depth);

/** Los 16 espacios que se alquilan, en el orden en que se recorren con Tab. */
export const ALQUILABLES: readonly Pieza[] = PIEZAS.filter((p) => p.alq);

/** Sólo la sede CENTRO: es la que sale en las miniaturas y en «Cómo se arranca». */
export const CENTRO: readonly Pieza[] = PIEZAS.filter((p) => p.sede === "CENTRO");

/** El piso de cada sala, con el mismo margen que usa el prototipo. */
export const PISOS = (Object.keys(SEDES) as Sede[]).map((rot) => {
  const s = SEDES[rot];
  return { rot, x: s.dx - 0.8, y: s.dy - 0.8, w: s.w, d: s.d };
});

/** La pieza que abre sola su ficha al cargar: la que se libera el 26. */
export const PIEZA_INICIAL = "CENTRO/PUN-02";

/** Las dos caras de la misma góndola: el bloque 1 las separa para mostrarlas. */
export const CARA_A = "CENTRO/GON-04·A";
export const CARA_B = "CENTRO/GON-04·B";

/** `1300000` → `$ 1.300.000`. Sin `Intl`, para que el separador no cambie. */
export function pesos(n: number): string {
  return "$ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
