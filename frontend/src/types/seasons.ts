/**
 * Temporadas comerciales colombianas.
 *
 * Dos cosas distintas viven acá, y separarlas es el punto:
 *
 *  · El ANCLA es un hecho del calendario — el día del padre es el tercer
 *    domingo de junio, la semana santa se deriva de la pascua. Se calcula, no
 *    se guarda: si se guardara como fecha, el año entrante estaría mal.
 *  · La VENTANA de venta (cuántos días antes empieza y cuántos después
 *    termina) es una decisión comercial que el sistema no puede adivinar. Esa
 *    sí se guarda, y sobrevive de un año al siguiente.
 *
 * Las temporadas son iguales en las tres sedes, así que la configuración es
 * una sola y global.
 */

// ─── Aritmética de días ───────────────────────────────────────────────────────
// Todo el cálculo pasa por un número de día entero. Restar dos `Date` en
// milisegundos parece equivalente pero no lo es en cuanto hay cambio de huso
// horario, y da errores de un día que en un calendario de disponibilidad se
// traducen en vender dos veces el mismo espacio.

/** Días transcurridos desde epoch para la fecha civil (ignora hora y huso). */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Fecha civil local a partir de "YYYY-MM-DD". Null si no parsea.
 *  `new Date("2026-12-01")` se interpreta como UTC y en Colombia (UTC-5)
 *  retrocede al 30 de noviembre — de ahí que se parsee a mano. */
export function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rechaza fechas imposibles (31 de febrero) que el constructor "corrige".
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** "YYYY-MM-DD" de una fecha civil local. */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Suma días naturales. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Días que cubre un rango inclusivo en ambos extremos. */
export function inclusiveDays(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from) + 1;
}

// ─── Anclas ───────────────────────────────────────────────────────────────────

/** N-ésimo día de semana de un mes. `dow`: 0 = domingo … 6 = sábado. */
export function nthDayOfWeek(year: number, month1to12: number, dow: number, n: number): Date {
  const first = new Date(year, month1to12 - 1, 1);
  const shift = (dow - first.getDay() + 7) % 7;
  return new Date(year, month1to12 - 1, 1 + shift + (n - 1) * 7);
}

/** Domingo de Pascua — algoritmo de Meeus/Jones/Butcher (calendario gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export interface SeasonRule {
  id: string;
  label: string;
  /** Cómo se explica el ancla en pantalla. */
  ruleLabel: string;
  anchor: (year: number) => Date;
  /** Ventana por defecto; el usuario la ajusta y se guarda en el servidor. */
  defaultBefore: number;
  defaultAfter: number;
}

export const SEASON_RULES: SeasonRule[] = [
  {
    id: "escolar", label: "Escolar", ruleLabel: "Regreso a clases (15 de enero)",
    anchor: (y) => new Date(y, 0, 15), defaultBefore: 20, defaultAfter: 15,
  },
  {
    id: "semana_santa", label: "Semana Santa", ruleLabel: "Domingo de Pascua",
    anchor: easterSunday, defaultBefore: 7, defaultAfter: 0,
  },
  {
    id: "madre", label: "Día de la Madre", ruleLabel: "2.º domingo de mayo",
    anchor: (y) => nthDayOfWeek(y, 5, 0, 2), defaultBefore: 7, defaultAfter: 1,
  },
  {
    id: "padre", label: "Día del Padre", ruleLabel: "3.er domingo de junio",
    anchor: (y) => nthDayOfWeek(y, 6, 0, 3), defaultBefore: 7, defaultAfter: 1,
  },
  {
    id: "vacaciones", label: "Vacaciones", ruleLabel: "Mitad de año (15 de junio)",
    anchor: (y) => new Date(y, 5, 15), defaultBefore: 0, defaultAfter: 30,
  },
  {
    id: "amor_amistad", label: "Amor y Amistad", ruleLabel: "3.er sábado de septiembre",
    anchor: (y) => nthDayOfWeek(y, 9, 6, 3), defaultBefore: 6, defaultAfter: 1,
  },
  {
    id: "halloween", label: "Halloween", ruleLabel: "31 de octubre",
    anchor: (y) => new Date(y, 9, 31), defaultBefore: 7, defaultAfter: 1,
  },
  {
    id: "black_friday", label: "Black Friday", ruleLabel: "Viernes tras el 4.º jueves de noviembre",
    anchor: (y) => addDays(nthDayOfWeek(y, 11, 4, 4), 1), defaultBefore: 3, defaultAfter: 3,
  },
  {
    id: "navidad", label: "Navidad", ruleLabel: "24 de diciembre",
    anchor: (y) => new Date(y, 11, 24), defaultBefore: 23, defaultAfter: 0,
  },
];

/** Ventanas guardadas: { [id]: { before, after } }. Lo que no esté usa el default. */
export type SeasonWindows = Record<string, { before: number; after: number }>;

export interface SeasonOccurrence {
  id: string;
  label: string;
  ruleLabel: string;
  year: number;
  anchor: Date;
  from: Date;
  to: Date;
  days: number;
}

function windowFor(rule: SeasonRule, windows: SeasonWindows | null) {
  const saved = windows?.[rule.id];
  const before = Number.isFinite(saved?.before) ? Math.max(0, saved!.before) : rule.defaultBefore;
  const after = Number.isFinite(saved?.after) ? Math.max(0, saved!.after) : rule.defaultAfter;
  return { before, after };
}

export function occurrenceFor(
  rule: SeasonRule,
  year: number,
  windows: SeasonWindows | null,
): SeasonOccurrence {
  const anchor = rule.anchor(year);
  const { before, after } = windowFor(rule, windows);
  const from = addDays(anchor, -before);
  const to = addDays(anchor, after);
  return {
    id: rule.id, label: rule.label, ruleLabel: rule.ruleLabel,
    year, anchor, from, to, days: inclusiveDays(from, to),
  };
}

/**
 * Temporadas que aún no terminaron, ordenadas por fecha de inicio.
 *
 * Barre tres años (el anterior, el actual y el siguiente) porque una ventana
 * puede empezar en diciembre y terminar en enero — la temporada escolar arranca
 * el 26 de diciembre del año anterior — y porque en agosto ya se está vendiendo
 * la navidad del año que viene.
 */
export function upcomingSeasons(
  today: Date,
  windows: SeasonWindows | null,
  horizonDays = 400,
): SeasonOccurrence[] {
  const hoy = dayNumber(today);
  const limite = hoy + horizonDays;
  const year = today.getFullYear();
  const out: SeasonOccurrence[] = [];
  for (const rule of SEASON_RULES) {
    for (const y of [year - 1, year, year + 1]) {
      const occ = occurrenceFor(rule, y, windows);
      // Sigue vigente si no terminó, y entra si empieza dentro del horizonte.
      if (dayNumber(occ.to) >= hoy && dayNumber(occ.from) <= limite) out.push(occ);
    }
  }
  out.sort((a, b) => dayNumber(a.from) - dayNumber(b.from));
  return out;
}
