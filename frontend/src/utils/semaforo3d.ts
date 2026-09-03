/**
 * Modo Ocupación — el semáforo de disponibilidad pintado sobre el editor 3D.
 *
 * Esto NO decide colores nuevos: los toma tal cual de la terna auditada por
 * dicromacia (`docs/ESTADO.md` § «Paleta y tipografía», `frontend/src/index.css`
 * `--libre` / `--entra` / `--ocupado` / `--resto`, y `RANGE_TOP` /
 * `RANGE_LABEL` en `pages/DashboardView.tsx`, que es donde el mapa 2D de la
 * sede ya pinta exactamente esta misma lectura por periodo). Si algún día hay
 * que mover uno, hay que volver a correr la cuenta de contraste — no es una
 * decisión que se tome acá ni tocando este archivo.
 *
 * Los valores son literales hex y no `var(--x)` a propósito: Three.js no lee
 * variables CSS, así que no hay forma de que un material 3D consuma el token
 * del DOM. Es el mismo motivo por el que `RANGE_TOP` en el Dashboard también
 * repite los hex en vez de leer el CSS.
 */

import * as THREE from "three";
import { rangeAvailability, type RangeAvailability } from "../types/fixtures";

// ─── La terna, literal ────────────────────────────────────────────────────────
// libre    → --libre    #00786A  (verde: se puede vender el periodo entero)
// parcial  → --entra    #F08519  (naranja: se libera adentro del periodo)
// tomado   → --ocupado  #8E1226  (rojo oscuro a propósito — ver index.css)
export const OCUPACION_COLORS: Record<RangeAvailability, string> = {
  libre: "#00786A",
  parcial: "#F08519",
  tomado: "#8E1226",
};

// Mismo texto que `RANGE_LABEL` en DashboardView: un estado nunca se lee sólo
// por el color, así que la palabra tiene que ser la misma en las dos pantallas.
export const OCUPACION_LABELS: Record<RangeAvailability, string> = {
  libre: "Libre todo el periodo",
  parcial: "Se libera en el periodo",
  tomado: "Tomado",
};

/** Lo que no se alquila: gris pizarra, sin candidatura a ningún estado.
 *  Mismo valor que `NON_RENTABLE_COLOR` en StoreEditor3D.tsx y que
 *  `NON_RENTABLE_STROKE` en FloorPlan2D.tsx — los tres deben coincidir. */
export const NO_COMERCIALIZABLE_COLOR = "#64748b";
export const NO_COMERCIALIZABLE_LABEL = "No comercializable";

/** Leyenda en orden de lectura, lista para dibujar en el editor 3D. */
export const LEYENDA_OCUPACION: { estado: RangeAvailability; color: string; label: string }[] = [
  { estado: "libre", color: OCUPACION_COLORS.libre, label: OCUPACION_LABELS.libre },
  { estado: "parcial", color: OCUPACION_COLORS.parcial, label: OCUPACION_LABELS.parcial },
  { estado: "tomado", color: OCUPACION_COLORS.tomado, label: OCUPACION_LABELS.tomado },
];

/** Una cara comercial, como la trae `UnifiedFixture` (campos top-level = cara
 *  A) o `FaceData` (cara B de una góndola doble). */
export interface CaraComercial {
  status: "free" | "occupied" | "reserved" | "maintenance";
  startDate?: string;
  endDate?: string;
}

/** La cara B de una góndola doble que nunca se tocó: `fixture.faceB` queda
 *  `undefined` hasta el primer patch (mismo patrón que `EMPTY_FACE` en
 *  DashboardView.tsx / FloorPlan2D.tsx — no hay una tercera definición acá,
 *  sólo el mismo valor). Una góndola doble son DOS espacios desde que existe:
 *  que nadie haya escrito nada en la B todavía la deja "free", nunca "no
 *  pintada" — lo contrario dejaría la mitad de cada góndola nueva sin
 *  semáforo. */
export const CARA_B_VACIA: CaraComercial = { status: "free" };

/** El estado de UNA cara para el periodo elegido — misma regla que el mapa
 *  2D de la sede (`rangeAvailability` en `types/fixtures.ts`), nunca una
 *  segunda derivación. */
export function estadoDeCara(
  face: CaraComercial,
  range: { from: Date; to: Date },
  today?: Date,
): RangeAvailability {
  return rangeAvailability(face, range.from, range.to, today);
}

// ─── Materiales, cacheados como el resto del editor ──────────────────────────
// Tres estados posibles → tres materiales, reusados por todas las caras y
// muebles de la escena. `MeshBasicMaterial` (no reacciona a la luz) porque es
// el mismo lenguaje que ya usan las fotos de producto (`resolveFaceMaterial`):
// un panel plano y legible, no una superficie que la iluminación oscurezca.
const materialCache = new Map<RangeAvailability, THREE.MeshBasicMaterial>();

export function getOcupacionMaterial(estado: RangeAvailability): THREE.MeshBasicMaterial {
  let mat = materialCache.get(estado);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: OCUPACION_COLORS[estado], toneMapped: false });
    materialCache.set(estado, mat);
  }
  return mat;
}

// ─── Texto de apoyo para el panel del mueble seleccionado ────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function corta(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** Frase corta para el panel, más precisa que el color solo: distingue un
 *  contrato vigente de uno firmado que todavía no arranca, aunque las dos
 *  pinten el mismo rojo cuando caen dentro del periodo elegido. No es un
 *  cuarto color — la terna no se toca — es la palabra que la acompaña,
 *  igual que pide la regla «el estado va siempre rotulado». */
export function detalleDeCara(face: CaraComercial): string | null {
  if (face.status !== "occupied") return null;
  if (face.startDate && face.endDate) return `${corta(face.startDate)} → ${corta(face.endDate)}`;
  if (face.startDate) return `Desde ${corta(face.startDate)}`;
  if (face.endDate) return `Hasta ${corta(face.endDate)}`;
  return null;
}
