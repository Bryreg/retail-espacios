import type { FaceData, UnifiedFixture } from "../types/fixtures";

/**
 * Pintar en el layout contratos que la BASE ya tiene, cada uno en SU sede.
 *
 * Esto es una función aparte y pura por una razón concreta: el bug que arregla
 * no se ve leyendo el código, se ve cuando dos tiendas tienen un mueble con el
 * mismo código — que es lo normal, los códigos se repiten entre sedes.
 *
 * ── Qué pasaba ───────────────────────────────────────────────────────────────
 *
 * La carga por planilla acepta una columna «sede», así que UNA planilla crea
 * contratos en varias tiendas. El parche del mapa, en cambio, se armaba con el
 * código CORTO —`IMP-17`— y se aplicaba sobre los muebles de la sede ABIERTA.
 * Con `CIUDAD JARDIN` en pantalla y una fila de `NAVE`, eso hacía dos daños de
 * una sola vez:
 *
 *   1. pintaba vendido el `IMP-17` de CIUDAD JARDIN, que no se vendió;
 *   2. dejaba el `IMP-17` de NAVE —el que SÍ se vendió— viéndose libre.
 *
 * El segundo es el que aparece meses después como «el espacio está libre y el
 * sistema no me deja venderlo»: la base sabe del contrato, el plano no.
 *
 * ── La regla ─────────────────────────────────────────────────────────────────
 *
 * Un mueble es único por SEDE + CÓDIGO. El código solo no lo es, y usarlo solo
 * es el bug. Lo que no se puede parchear se DEVUELVE para que alguien lo diga:
 * un layout que no está cargado no se inventa —mandar uno parcial borraría los
 * muebles que no vinieron— y un desfase que nadie ve es el que muerde después.
 */

export interface FilaContrato {
  /** La sede del contrato, no la que esté abierta. */
  sede: string;
  /** El código corto del mueble: `IMP-17`, sin la sede y sin el `-B`. */
  code: string;
  face: "A" | "B";
  patch: Partial<FaceData>;
}

export interface ResultadoContratos {
  /** Los layouts con los contratos pintados. Sólo cambian las sedes tocadas. */
  fixturesBySede: Record<string, UnifiedFixture[]>;
  /** Las claves del store que cambiaron, para marcarlas sucias y guardarlas. */
  tocadas: string[];
  /** Sedes cuyo contrato NO se pudo pintar: su layout no está cargado, o no
   *  tiene ese mueble. Hay que decirlo. */
  faltantes: string[];
}

/** La misma regla que `normalizeSede` del store. Se pasa como parámetro para no
 *  arrastrar el store entero a una función pura, y así hay UNA definición. */
const NORMALIZAR = (s: string) => s.trim().toUpperCase();

export function aplicarContratosEnPlanos(
  fixturesBySede: Record<string, UnifiedFixture[]>,
  filas: FilaContrato[],
  normalizar: (s: string) => string = NORMALIZAR,
): ResultadoContratos {
  const vacio: ResultadoContratos = { fixturesBySede, tocadas: [], faltantes: [] };
  if (filas.length === 0) return vacio;

  // Agrupado por sede y por código corto. Las dos partes de la clave, siempre.
  const porSede = new Map<string, Map<string, { face: "A" | "B"; patch: Partial<FaceData> }[]>>();
  for (const f of filas) {
    const sede = normalizar(f.sede ?? "");
    const code = (f.code ?? "").trim().toUpperCase();
    if (!sede || !code) continue;
    const dela = porSede.get(sede) ?? new Map();
    dela.set(code, [...(dela.get(code) ?? []), { face: f.face, patch: f.patch }]);
    porSede.set(sede, dela);
  }
  if (porSede.size === 0) return vacio;

  const siguientes = { ...fixturesBySede };
  const tocadas: string[] = [];
  const faltantes: string[] = [];

  for (const [sede, porCodigo] of porSede) {
    // La clave del store conserva la grafía con la que se cargó («Nave»), así
    // que se busca normalizando en vez de por igualdad.
    const clave = Object.keys(fixturesBySede).find((k) => normalizar(k) === sede);
    const actuales = clave ? fixturesBySede[clave] : undefined;
    if (!clave || !actuales) { faltantes.push(sede); continue; }

    let tocado = false;
    const nuevos = actuales.map((f) => {
      const suyos = porCodigo.get((f.code || "").trim().toUpperCase());
      if (!suyos) return f;
      tocado = true;
      let sig = f;
      for (const { face, patch } of suyos) {
        sig = face === "B"
          ? { ...sig, faceB: { ...(sig.faceB ?? {}), ...patch } as FaceData }
          : { ...sig, ...patch };
      }
      return sig;
    });

    // Un contrato para un mueble que el plano de esa sede no tiene es el mismo
    // desfase con otra cara, y tampoco se calla.
    if (!tocado) { faltantes.push(sede); continue; }
    siguientes[clave] = nuevos;
    tocadas.push(clave);
  }

  return { fixturesBySede: siguientes, tocadas, faltantes };
}
