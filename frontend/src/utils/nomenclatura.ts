/**
 * Cómo se llaman los muebles del plano.
 *
 * Toda la experiencia del sistema arranca en el plano: el código que se le pone
 * a un mueble acá es el que después viaja al contrato, al correo del
 * mercaderista y a la lámina del proveedor. Si se repite, dos espacios
 * distintos comparten historia.
 *
 * Había dos esquemas, uno por editor:
 *
 *   - El plano 2D generaba `GON-01`, buscando el número más alto y sumando uno.
 *   - El editor 3D generaba `NAVE-GON-001`, **contando** cuántos había. Borrar
 *     `GON-02` dejaba dos muebles con el mismo código, porque el conteo bajaba
 *     y el siguiente volvía a caer en un número usado.
 *
 * Acá vive uno solo, y devuelve el primer número LIBRE, no el siguiente al
 * conteo. Es geometría de nombres: se prueba sin navegador.
 */

/** Prefijo por tipo. Cubre los nombres del 3D y los del 2D, que difieren. */
export const PREFIJO_POR_TIPO: Record<string, string> = {
  // Nombres del modelo unificado / editor 3D
  gondola: "GON",
  punta: "PUN",
  robatope: "ROB",
  ristra: "RIS",
  cross: "CRS",
  metro: "MET",
  mueble: "MUE",
  isla: "EXP",
  impulsador: "IMP",
  batea: "BAT",
  isla_fria: "ISL",
  nevera_carnes: "CAR",
  nevera_refrescos: "BEB",
  stand_frutas: "FRU",
  checkout: "CAJ",
  servicio_cliente: "SAC",
  columna: "COL",
  exhibicion: "EXH",
  // Nombres que sólo usa el plano 2D: la góndola se parte en dos tipos
  gondola_doble: "GON",
  gondola_mural: "GON",
};

/** Prefijo de un mueble. Lo desconocido cae en SPC, como hacía el 2D. */
export function prefijoDe(tipo: string): string {
  return PREFIJO_POR_TIPO[tipo] ?? "SPC";
}

/** Número que lleva un código, o null si no sigue el esquema `PRE-NN`. */
export function numeroDe(codigo: string, prefijo: string): number | null {
  const c = (codigo ?? "").trim().toUpperCase();
  const p = prefijo.toUpperCase() + "-";
  if (!c.startsWith(p)) return null;
  const resto = c.slice(p.length);
  if (!/^\d+$/.test(resto)) return null;
  return parseInt(resto, 10);
}

/** Normaliza para comparar: los códigos no distinguen mayúsculas ni espacios. */
export function normalizar(codigo: string): string {
  return (codigo ?? "").trim().toUpperCase();
}

/**
 * El siguiente código libre para ese tipo.
 *
 * Toma el número más alto en uso y sigue subiendo hasta encontrar uno que no
 * esté tomado. Lo segundo importa: alguien puede haber escrito un código a
 * mano, y con sólo `max + 1` bastaba una edición manual para chocar.
 */
export function siguienteCodigo(
  tipo: string,
  existentes: { code: string }[],
): string {
  const prefijo = prefijoDe(tipo);
  const tomados = new Set(existentes.map((f) => normalizar(f.code)));
  const numeros = existentes
    .map((f) => numeroDe(f.code, prefijo))
    .filter((n): n is number => n !== null);

  let n = numeros.length ? Math.max(...numeros) + 1 : 1;
  // El tope es de cortesía: con 999 muebles del mismo tipo en una sede algo
  // más grave está pasando, pero un while sin techo no se pone en producción.
  for (let intentos = 0; intentos < 1000; intentos++, n++) {
    const candidato = `${prefijo}-${String(n).padStart(2, "0")}`;
    if (!tomados.has(candidato)) return candidato;
  }
  return `${prefijo}-${Date.now()}`;
}

/** ¿Ese código ya lo usa OTRO mueble? */
export function codigoRepetido(
  codigo: string,
  existentes: { id: string; code: string }[],
  exceptoId?: string,
): boolean {
  const c = normalizar(codigo);
  if (!c) return false;
  return existentes.some((f) => f.id !== exceptoId && normalizar(f.code) === c);
}

export interface Duplicado { codigo: string; ids: string[] }

/** Los códigos que aparecen más de una vez. Vacío es lo que se espera. */
export function duplicados(items: { id: string; code: string }[]): Duplicado[] {
  const porCodigo = new Map<string, string[]>();
  for (const f of items) {
    const c = normalizar(f.code);
    if (!c) continue;
    porCodigo.set(c, [...(porCodigo.get(c) ?? []), f.id]);
  }
  return [...porCodigo.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([codigo, ids]) => ({ codigo, ids }));
}

/** Muebles cuyo prefijo no corresponde a su tipo (renombrados a mano). */
export function prefijoDesalineado(
  items: { id: string; code: string; type: string }[],
): { id: string; code: string; esperado: string }[] {
  return items
    .filter((f) => {
      const esperado = PREFIJO_POR_TIPO[f.type];
      return esperado && !normalizar(f.code).startsWith(esperado + "-");
    })
    .map((f) => ({ id: f.id, code: f.code, esperado: prefijoDe(f.type) }));
}

// ─── El nombre del mueble ────────────────────────────────────────────────────

/**
 * Cómo se llama un mueble. Uno solo, no dos.
 *
 * Había dos campos en paralelo: el **código** que genera el sistema (`GON-800`,
 * dibujado dentro del mueble en el plano y usado para armar el código de
 * espacio que viaja al contrato) y una **nomenclatura** de texto libre,
 * opcional, que casi nadie llenaba. El panel del plano mostraba «—» mientras el
 * plano mostraba `GON-800`: dos nombres para la misma cosa, y ninguno de los
 * dos era «el» nombre.
 *
 * El nombre efectivo es el código que puso el sistema, y escribir una
 * nomenclatura lo REEMPLAZA. Así hay una sola respuesta a «¿cómo se llama este
 * mueble?», y es la que se ve en el plano, en el 3D, en la pantalla de montaje
 * y en la lámina del proveedor.
 *
 * El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es
 * cómo se lo nombra.
 */
export function nombreDeMueble(
  mueble: { code: string; nomenclatura?: string | null },
): string {
  return (mueble.nomenclatura ?? "").trim() || mueble.code;
}

/** ¿El nombre lo puso una persona, o se heredó del código del sistema? */
export function nombrePropio(
  mueble: { code: string; nomenclatura?: string | null },
): boolean {
  const puesto = (mueble.nomenclatura ?? "").trim();
  return puesto !== "" && puesto !== mueble.code;
}
