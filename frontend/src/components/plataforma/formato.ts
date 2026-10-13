/* ============================================================================
   RECABRA · Plataforma — formato de cifras, fechas y nombres

   Capa 0 de los gráficos: nada de esto dibuja, todo esto ESCRIBE. Sale tal
   cual del prototipo que eligió el dueño
   (`features/plataforma-asesoria/outputs/opciones/A-el-informe/index.html`,
   bloque «formato»), portado a TypeScript sobre los tipos reales de
   `src/api/plataforma.ts`.

   Dos reglas que atraviesan el archivo y que no son de estilo:

   1. **`null` es «sin dato», nunca 0.** Todas las funciones devuelven `SIN_DATO`
      («—») ante `null`/`undefined`. El backend distingue con cuidado un 0 real
      (`ingreso_contratado_mes: 0.0` con cero contratos) de una ausencia
      (`ocupacion_pct: null` sin espacios comercializables); rellenar la
      ausencia con un cero acá borraría esa distinción en la última milla.
   2. **Plata en pesos colombianos**, punto de miles y coma decimal, con el
      signo menos tipográfico `−` (U+2212) y no el guion del teclado: en
      columna con `tabular-nums` el guion se lee como un tachado.
   ========================================================================== */

import { nombresDeInforme } from "../../catalogo/catalogo";

/** Lo que se escribe cuando la API no trajo el dato. Nunca un 0, nunca vacío. */
export const SIN_DATO = "—";

type Cifra = number | null | undefined;

const miles = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `$ 382.107.500` · negativo `−$ 45.300.000` · `null` → «—». */
export function plata(n: Cifra): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  return (n < 0 ? "−$ " : "$ ") + miles(Math.abs(n));
}

/** `$ 382,1 M` — para ejes y rótulos donde la cifra exacta ya está en la tabla.
 *  A partir de 100 millones se cae el decimal: `$ 382 M` no gana nada con un
 *  «,1» que nadie compara. */
export function platM(n: Cifra): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  const v = Math.abs(n) / 1e6;
  const s = (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",");
  return (n < 0 ? "−$ " : "$ ") + s + " M";
}

/** `47,4 %` con un decimal por defecto. */
export function pct(n: Cifra, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  return n.toFixed(decimales).replace(".", ",") + " %";
}

/** El mismo porcentaje pero con signo explícito: `+5,2 %` / `−9,1 %`.
 *  Se usa donde el cero significa algo (spread contra la propia tarifa,
 *  brecha contra el benchmark): ahí «5,2 %» y «+5,2 %» no son lo mismo. */
export function pctSig(n: Cifra, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  const s = Math.abs(n).toFixed(decimales).replace(".", ",");
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s + " %";
}

/** Puntos porcentuales — la diferencia entre dos porcentajes NO es un
 *  porcentaje. `+1,8 pts`. */
export function puntos(n: Cifra, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  const s = Math.abs(n).toFixed(decimales).replace(".", ",");
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s + " pts";
}

/** Conteo con punto de miles: `1.540`. */
export function num(n: Cifra): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  return miles(n);
}

/** Cualquier formateador, con su signo delante: `sig(-4.5e7, platM)` →
 *  `−$ 45,3 M`. El formateador recibe siempre el valor absoluto. */
export function sig(n: Cifra, f: (v: number) => string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return SIN_DATO;
  return (n > 0 ? "+" : n < 0 ? "−" : "") + f(Math.abs(n));
}

/** Singular/plural sin inventar: `plural(1,'sede','sedes')` → `1 sede`. */
export function plural(n: number, uno: string, varios: string): string {
  return num(n) + " " + (n === 1 ? uno : varios);
}

// ─── Fechas ────────────────────────────────────────────────────────────────
//
// Todas las fechas del contrato son cadenas `"YYYY-MM"` o `"YYYY-MM-DD"` y se
// leen POR TROZOS, nunca con `new Date(...)`: `new Date("2026-09-01")` se
// interpreta en UTC y en Bogotá (UTC−5) devuelve el 31 de agosto. Un mes
// corrido en un rótulo es un error de dato, no de estilo.

const MESES: Record<string, string> = {
  "01": "ene", "02": "feb", "03": "mar", "04": "abr", "05": "may", "06": "jun",
  "07": "jul", "08": "ago", "09": "sep", "10": "oct", "11": "nov", "12": "dic",
};

const MESES_LARGO: Record<string, string> = {
  "01": "enero", "02": "febrero", "03": "marzo", "04": "abril", "05": "mayo",
  "06": "junio", "07": "julio", "08": "agosto", "09": "septiembre",
  "10": "octubre", "11": "noviembre", "12": "diciembre",
};

/** `"2026-09"` → `sep`; en enero se agrega el año (`ene '26`) porque es el
 *  único punto de la rejilla de doce meses donde el lector necesita saber que
 *  cambió de año. */
export function mesCorto(periodo: string | null | undefined): string {
  if (!periodo || periodo.length < 7) return SIN_DATO;
  const mm = periodo.slice(5, 7);
  return (MESES[mm] ?? mm) + (mm === "01" ? " '" + periodo.slice(2, 4) : "");
}

/** `"2026-09"` → `septiembre de 2026`. */
export function mesLargo(periodo: string | null | undefined): string {
  if (!periodo || periodo.length < 7) return SIN_DATO;
  const mm = periodo.slice(5, 7);
  return (MESES_LARGO[mm] ?? mm) + " de " + periodo.slice(0, 4);
}

/** `"2026-09-30"` → `30 sep`. */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha || fecha.length < 10) return SIN_DATO;
  return parseInt(fecha.slice(8, 10), 10) + " " + (MESES[fecha.slice(5, 7)] ?? "");
}

/** Días entre dos fechas `"YYYY-MM-DD"`, sin husos ni horas: los dos extremos
 *  se convierten a mediodía UTC, así que ningún cambio de hora los mueve. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10), 12);
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10), 12);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ─── Nombres de tipo de espacio ────────────────────────────────────────────
//
// `tipo` viaja como slug del backend (`nevera_refrescos`). Los nombres salen
// del catálogo de muebles (`informe` e `informePlural` de cada tipo en
// `catalogo/muebles.json`), más `fuera_del_plano`, que no es un mueble sino lo
// que el servidor cuenta afuera de todo plano. Un tipo que no esté se muestra
// tal cual llegó (no se adivina, no se rompe).
//
// Hasta que existió el catálogo faltaban la ristra, el impulsador, la vitrina
// (`mueble`) y la zona libre (`metro`): los informes decían «muebles»,
// «metros» e «impulsadors».

const NOMBRES = nombresDeInforme();

const TIPOS: Record<string, string> = {
  ...NOMBRES.singular,
  fuera_del_plano: "fuera del plano",
};

const TIPOS_PLURAL: Record<string, string> = NOMBRES.plural;

export function tipoN(tipo: string): string {
  return TIPOS[tipo] ?? tipo;
}

export function tipoP(tipo: string, n: number): string {
  return n === 1 ? tipoN(tipo) : (TIPOS_PLURAL[tipo] ?? tipoN(tipo) + "s");
}

/** La palabra del estado de espacio. El color NUNCA va solo (guion §3.5.7). */
export const ESTADO_TXT: Record<"libre" | "se_libera" | "ocupado", string> = {
  libre: "libre", se_libera: "se libera", ocupado: "ocupado",
};

/** La palabra de la clase de adopción. Misma regla: palabra siempre. */
export const CLASIFICACION_TXT: Record<string, string> = {
  activa: "activa", dormida: "dormida", fantasma: "fantasma",
  sin_cuentas: "sin cuentas", nueva: "nueva",
};

/** La palabra del estado de cuenta, sin guion bajo. */
export const ESTADO_CUENTA_TXT: Record<string, string> = {
  activo: "activo", gracia: "en gracia", solo_lectura: "solo lectura",
  suspendido: "suspendido",
};

/** Días sin acceso: `null` NO es «0 días», es «sin cuentas de usuario». */
export function diasSinAcceso(dias: number | null): string {
  if (dias === null) return "sin cuentas de usuario";
  if (dias === 0) return "entraron hoy";
  return plural(dias, "día sin acceso", "días sin acceso");
}

/* ── El periodo que se puede elegir ──────────────────────────────────────────
   A ofrece los periodos en un `<select>` armado con la serie de la tendencia,
   del más nuevo al más viejo. No es un `<input type="month">`: ese control lo
   pinta el navegador en SU idioma —«September 2026» en una pantalla escrita
   entera en español— y a 390 px se corta a la mitad.

   Un mes que la serie trae sin snapshot (`sin_dato`) se OFRECE igual, pero
   deshabilitado y con la palabra escrita: esconder el hueco haría creer que
   ese mes no existe, y ofrecerlo como si tuviera dato haría pedir un periodo
   que la pantalla no puede contar. El periodo puesto nunca se deshabilita —
   se puede llegar a él por la URL— porque un `<select>` cuyo valor no está
   entre sus opciones se pinta vacío.                                        */

export interface PeriodoOfrecido {
  p: string;
  sinDato: boolean;
}

export function periodosOfrecidos(
  serie: ReadonlyArray<{ periodo: string; sin_dato?: boolean }> | null | undefined,
  seleccionado: string
): PeriodoOfrecido[] {
  const m = new Map<string, boolean>();
  for (const s of serie ?? []) {
    if (typeof s?.periodo === "string" && s.periodo.length >= 7) m.set(s.periodo, s.sin_dato === true);
  }
  if (seleccionado) m.set(seleccionado, false);
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([p, sinDato]) => ({ p, sinDato }));
}
