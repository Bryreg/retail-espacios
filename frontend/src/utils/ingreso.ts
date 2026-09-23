/**
 * Las decisiones de la pantalla de ingreso que no necesitan React.
 *
 * Salen de una pregunta del dueño de la plataforma (2026-09-23): «¿cuando el
 * dueño de una sede invite a un administrador por correo va a quedar
 * aperturando un supermercado nuevo? ¿va a entrar en el supermercado
 * equivocado?». Las dos cosas podían pasar, y tres de las causas vivían acá:
 *
 * · el enlace del correo (`/login?invitacion=<token>`) no lo leía nadie;
 * · con dos supermercados, el selector arrancaba con el primero ya elegido y
 *   un «Continuar» al lado: un Enter y se entraba al que tocara;
 * · dos supermercados podían llamarse igual en ese selector.
 *
 * Aritmética pura, para probarla sin navegador (`scripts/probar-ingreso.mjs`).
 */

/** Una membresía como la manda `/oauth` cuando hay que elegir. */
export interface MembresiaBreve {
  cliente: string;
  nombre: string;
  rol: "owner" | "admin" | "worker";
}

/** El token del enlace de invitación que trae la URL, o `null`. */
export function tokenDeInvitacion(search: string): string | null {
  try {
    const token = new URLSearchParams(search).get("invitacion");
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

/** Dónde se recuerda, en ESTE navegador, el último supermercado al que se
 *  entró. Sólo el código: nada que no se vea ya en la barra de la app. */
export const CLAVE_ULTIMO_CLIENTE = "recabra-ultimo-cliente";

/** Qué supermercado aparece elegido en el selector: el último al que se
 *  entró desde este navegador, si sigue entre las membresías. Si no, NINGUNO
 *  —el selector arranca vacío y hay que elegir—: preseleccionar el primero
 *  de la lista era elegir por la persona. */
export function clientePreseleccionado(membresias: { cliente: string }[], recordado: string | null): string {
  return recordado && membresias.some((m) => m.cliente === recordado) ? recordado : "";
}

/** El nombre para COMPARAR —sin tildes, sin mayúsculas, sólo letras y
 *  números—, igual que `nombre_normalizado` del backend. */
export function nombreComparable(nombre: string): string {
  return (nombre ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** El texto de cada opción del selector. Dos supermercados que se leen igual
 *  se distinguen por su código; los demás, sólo por su nombre. */
export function etiquetaDeMembresia(
  m: MembresiaBreve,
  todas: MembresiaBreve[],
  rol: (r: MembresiaBreve["rol"]) => string,
): string {
  const propio = nombreComparable(m.nombre);
  const repetido = todas.filter((x) => nombreComparable(x.nombre) === propio).length > 1;
  return `${m.nombre}${repetido ? ` (${m.cliente})` : ""} · ${rol(m.rol)}`;
}
