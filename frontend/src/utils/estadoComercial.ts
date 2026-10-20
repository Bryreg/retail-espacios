import type { FaceData, UnifiedFixture } from "../types/fixtures";
// De `types/espacio.ts` y no de `types/fixtures.ts`: esto viaja en lo primero
// que baja la landing, y `types/fixtures.ts` arrastra el catálogo de muebles.
import { carasDe, fullSpaceCode } from "../types/espacio";

/**
 * Pegarle a cada mueble del plano lo que la BASE dice de él.
 *
 * El plano guarda lo que ES el mueble —dónde está, cuánto mide, cómo se llama—
 * y la base guarda lo que se le VENDIÓ. Son dos cosas distintas y estuvieron
 * mucho tiempo en el mismo JSON: el mismo hecho escrito dos veces, sin nada que
 * las obligara a coincidir. De ahí salían los tres síntomas de la auditoría,
 * todos con la misma cara: «el espacio está libre y el sistema dice que está
 * ocupado».
 *
 * La fusión pasa acá, en el borde del store, y por eso el resto de la
 * aplicación no cambió: `DashboardView`, `FloorPlan2D`, el editor 3D y la
 * escalera siguen leyendo `f.status` y `f.supplierName` como siempre. Lo que
 * cambió es de dónde salen — y que ya no se escriben nunca en el layout.
 *
 * ── Las dos reglas que hay que no romper ─────────────────────────────────────
 *
 * **Lo que no está en el mapa está LIBRE.** La fusión no rellena: REEMPLAZA.
 * Si sólo rellenara, un contrato cancelado seguiría pintado desde la copia
 * vieja de `localStorage` hasta que alguien recargara — que es exactamente la
 * clase de fantasma que esto vino a eliminar.
 *
 * **Si nada cambió, devuelve lo mismo.** Identidad, no copia: el arreglo y cada
 * mueble vuelven tal cual cuando el estado comercial no los toca. El store
 * refusiona en cada vuelta del poll (cada 20 s) y sin esto React volvería a
 * dibujar el plano entero cada vez, además de dejar la sede marcada como
 * modificada y disparar un guardado que no cambia nada.
 */

export interface EstadoComercial {
  status: string;
  supplierName: string;
  brandCategory: string;
  negotiatedValue: number;
  startDate: string;
  endDate: string;
  observation: string;
  /** Hasta cuándo se sostiene una RESERVA viva de la cara o de la parte
   *  (rediseño de Vender, §8): la base la manda tomada (`occupied`) y, sólo a
   *  quien administra, con esta fecha. No es un contrato: Supervisar no la
   *  cuenta en el canon, los contratos, los vencimientos ni el montaje
   *  (`conLaReserva` en `DashboardView`). Vender la ve «Tomado», sin más. No
   *  se le pega al mueble (la fusión la deja en el mapa crudo) y nunca viaja
   *  en el layout (`CAMPOS_DE_CONTRATO`). */
  reservaHasta?: string | null;
  /** La cara (o la parte) la toma una RESERVA, no un contrato. Es lo único que
   *  le llega al trabajador de una reserva —sin fechas, plata ni proveedor—:
   *  Supervisar la pone «Reservado» y no «Ocupado sin contrato». Como
   *  `reservaHasta`, ni se le pega al mueble ni viaja en el layout. */
  reservado?: boolean;
}

/** Por código COMPLETO del espacio: `NAVE-PUN-04`, y la cara B lleva `-B`. */
export type EstadoPorEspacio = Record<string, EstadoComercial>;

/** Un espacio sin contrato. Es el default, no un caso raro: la base sólo tiene
 *  fila para lo que se vendió alguna vez. */
export const LIBRE: EstadoComercial = {
  status: "free", supplierName: "", brandCategory: "", negotiatedValue: 0,
  startDate: "", endDate: "", observation: "",
};

const CAMPOS = Object.keys(LIBRE) as (keyof EstadoComercial)[];

/**
 * Lo que la base tiene guardado para este código, o `LIBRE`.
 *
 * El código del mueble es el CORTO (`PUN-04`) y el de la base el COMPLETO
 * (`NAVE-PUN-04`). La cuenta la hace `fullSpaceCode`, que es la MISMA que usan
 * el contrato, el correo de montaje y `_full_code` del servidor — incluida la
 * guarda contra el doble prefijo, porque el editor 3D genera los códigos con la
 * sede ya adentro. Tener una segunda definición de esto acá sería otra fuente
 * de verdad, en pequeño.
 *
 * Se prueba también el código pelado: un espacio creado en 2D pudo guardarse
 * con la sede en minúscula y quedar bajo una llave que no es la que arma la
 * cuenta.
 */
function loSuyo(
  estado: EstadoPorEspacio, sede: string, code: string,
): EstadoComercial {
  const c = (code || "").trim().toUpperCase();
  if (!c) return LIBRE;
  return estado[fullSpaceCode(sede, c)] ?? estado[c] ?? LIBRE;
}

/** Lo que se le pega al mueble: todo menos `reservaHasta`, que se lee del
 *  mapa crudo. Pegada, una reserva que se confirma (o caduca) dejaba la fecha
 *  vieja en el mueble y además viajaba en el `PUT /layout`. */
function sinReserva(e: EstadoComercial): EstadoComercial {
  if (!("reservaHasta" in e) && !("reservado" in e)) return e;
  const { reservaHasta: _fuera, reservado: _tampoco, ...resto } = e;
  return resto;
}

/**
 * ¿El objeto ya dice exactamente esto, con todos los campos escritos?
 *
 * Un campo AUSENTE no cuenta como igual, aunque «sin status» se lea como libre
 * en varios lados: `isSellableToday` pregunta `status !== "free"` y con
 * `undefined` entra por la rama del contrato y declara invendible un espacio
 * que está libre. Un plano recién cortado por el servidor viene sin ninguno de
 * los siete, así que la primera fusión los escribe todos y a partir de ahí no
 * vuelve a tocar nada.
 */
function yaEs(actual: Record<string, unknown> | undefined, e: EstadoComercial): boolean {
  if (!actual) return false;
  for (const campo of CAMPOS) if (actual[campo] !== e[campo]) return false;
  return true;
}

export function fusionarEstadoComercial(
  sede: string,
  fixtures: UnifiedFixture[],
  estado: EstadoPorEspacio,
): UnifiedFixture[] {
  let cambio = false;
  const salida = fixtures.map((f) => {
    const propia = f.sede || sede;
    const a = sinReserva(loSuyo(estado, propia, f.code));
    // ¿Tiene cara B? Se pregunta por el tipo (`carasDe`), no por si existe
    // `faceB`: desde el corte, la cara B ya no guarda nada y puede no existir.
    const doble = carasDe(f) === 2;
    const b = doble ? sinReserva(loSuyo(estado, propia, `${f.code}-B`)) : null;

    if (yaEs(f as unknown as Record<string, unknown>, a) &&
        (!doble || yaEs(f.faceB as unknown as Record<string, unknown>, b!))) {
      return f;
    }
    cambio = true;
    const siguiente = { ...f, ...a } as UnifiedFixture;
    if (doble) {
      // La cara B conserva lo suyo que NO es comercial —el reporte de montaje—
      // y recibe el contrato de la base.
      siguiente.faceB = { ...(f.faceB ?? {}), ...b } as FaceData;
    }
    return siguiente;
  });
  return cambio ? salida : fixtures;
}
