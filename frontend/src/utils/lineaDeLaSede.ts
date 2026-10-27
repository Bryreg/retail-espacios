/**
 * La línea de tiempo de la sede en Contratos (rediseño UX 2026-10, etapa 4),
 * sin React: un carril por espacio que se vende (cada cara, y cada parte que
 * tenga algo), sus barras —contratos y reservas, sólo fechas— y el hueco que
 * se toca para contratar. `probar-armazon` lo corre sin navegador.
 *
 * Las fechas van como `YYYY-MM-DD`: se comparan como texto y se suman con
 * `sumarDias` (`utils/meses.ts`), sin husos horarios de por medio.
 */
import { sumarDias } from "./meses";
import { codigoDeParte, partirCodigo, sufijoDeParte } from "./partes";

export interface Barra {
  tipo: "contrato" | "reserva";
  desde: string;
  hasta: string;
  caduca?: string;
}

export interface Carril {
  /** El código completo del espacio (`CENTRO-GON-01-B-PC1`). */
  codigo: string;
  /** Cómo se lee: `GON-01·B`, `PUN-03·EN2`. */
  etiqueta: string;
  fixtureId: string;
  cara: "A" | "B";
  /** La parte (`EN2`), o `null` para la cara entera. */
  sufijo: string | null;
  barras: Barra[];
}

export interface MuebleDeLaLinea {
  id: string;
  code: string;
  /** Tiene cara B. */
  doble: boolean;
}

/** Los carriles, en el orden del plano: cada cara de cada mueble que se vende
 *  y, debajo, las partes que tienen algo en la línea. Las filas de espacios
 *  que ningún mueble dibuja no tienen dónde ir (esas las cuenta «Para revisar»:
 *  contrato sin mueble en el plano). */
export function armarCarriles(
  muebles: readonly MuebleDeLaLinea[],
  filas: readonly { espacio: string; tipo: "contrato" | "reserva"; desde: string; hasta: string; caduca?: string }[],
  sede: string,
): Carril[] {
  const pre = `${sede.trim().toUpperCase()}-`;
  const porCodigo = new Map<string, Barra[]>();
  for (const f of filas) {
    const k = f.espacio.toUpperCase();
    const lista = porCodigo.get(k) ?? [];
    lista.push({ tipo: f.tipo, desde: f.desde, hasta: f.hasta, ...(f.caduca ? { caduca: f.caduca } : {}) });
    porCodigo.set(k, lista);
  }
  const fuera: Carril[] = [];
  for (const m of muebles) {
    const base = (pre + m.code.trim().toUpperCase());
    for (const cara of (m.doble ? ["A", "B"] : ["A"]) as ("A" | "B")[]) {
      const codigo = codigoDeParte(base, cara, null);
      const nombre = m.doble ? `${m.code}·${cara}` : m.code;
      fuera.push({ codigo, etiqueta: nombre, fixtureId: m.id, cara, sufijo: null,
        barras: ordenar(porCodigo.get(codigo) ?? []) });
      // Las partes de esta cara que tienen algo en la línea.
      const partes = [...porCodigo.keys()]
        .filter((k) => k.startsWith(base + "-"))
        .map((k) => ({ k, p: partirCodigo(k) }))
        .filter(({ p }) => p.parte && p.base === base && p.cara === cara)
        .sort((a, b) => a.k.localeCompare(b.k, "es", { numeric: true }));
      for (const { k, p } of partes) {
        const sufijo = sufijoDeParte(p.parte!);
        fuera.push({ codigo: k, etiqueta: `${nombre}·${sufijo}`, fixtureId: m.id, cara, sufijo,
          barras: ordenar(porCodigo.get(k) ?? []) });
      }
    }
  }
  return fuera;
}

function ordenar(b: Barra[]): Barra[] {
  return [...b].sort((x, y) => x.desde.localeCompare(y.desde));
}

/** ¿Nada del carril pisa esas fechas? */
export function libreEnLasFechas(barras: readonly Barra[], desde: string, hasta: string): boolean {
  return !barras.some((b) => b.desde <= hasta && b.hasta >= desde);
}

/** El hueco que contiene `dia`, recortado a [inicio, fin]: del día después de
 *  la barra anterior (o el inicio) al día antes de la siguiente (o el fin). Si
 *  `dia` cae adentro de una barra, no hay hueco. */
export function huecoEn(
  barras: readonly Barra[], dia: string, inicio: string, fin: string,
): { desde: string; hasta: string; dias: number } | null {
  if (dia < inicio || dia > fin) return null;
  if (barras.some((b) => b.desde <= dia && dia <= b.hasta)) return null;
  let desde = inicio;
  let hasta = fin;
  for (const b of barras) {
    if (b.hasta < dia) { const d = sumarDias(b.hasta, 1); if (d > desde) desde = d; }
    if (b.desde > dia) { const h = sumarDias(b.desde, -1); if (h < hasta) hasta = h; }
  }
  return { desde, hasta, dias: diasEntre(desde, hasta) };
}

/** Cuántos días van de `a` a `b`, los dos incluidos. */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000) + 1;
}
