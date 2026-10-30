/**
 * «Vacío» no es «no se pudo leer» (auditoría pre-lanzamiento, P2-15).
 *
 * Varias listas de Pendientes, Montajes y las tarifas tragaban el error del
 * pedido y quedaban vacías: la pantalla decía «Nada para hoy» con la red caída.
 * Ahora cada lectura dice si falló, y la pantalla lo avisa con «Reintentar».
 *
 * No es falla de lectura lo que el servidor contesta a propósito: un 404 (un
 * servidor sin esa ruta todavía, que es un aviso de más) ni un 401/403 (otro
 * rol; el 401 además lo maneja el interceptor de `api/client.ts`).
 */
export function esFallaDeLectura(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status !== 401 && status !== 403 && status !== 404;
}

/** «a», «a y b», «a, b y c». */
export function enLista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
