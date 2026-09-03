/** Tipos compartidos por la sección "Ocupación real vs esperada" del Dashboard. */

/** Una cara CONTRATADA para el período elegido que todavía no tiene un
 *  reporte de montaje en "montado" — la BRECHA accionable.
 *
 *  Se computa en `DashboardView.tsx` (que ya tiene los fixtures, el período y
 *  los reportes de montaje de la sede en pantalla) y llega acá ya resuelta:
 *  esta sección no lee `useFixtureStore` ni ninguna otra tienda global, sólo
 *  props — así queda testeable sola y no duplica la fuente de verdad del
 *  layout. Sólo existe para la sede que está en pantalla: para las demás
 *  sedes de la comparación en barras no hay fixtures cargados localmente, así
 *  que no hay de dónde sacar códigos (ver el gap documentado en el entregable
 *  del builder). */
export interface BrechaEspacio {
  /** id del fixture, para poder seleccionarlo en el plano. */
  id: string;
  face: "A" | "B";
  /** Código completo SEDE-CODE, como lo guarda el backend (`fullSpaceCode`). */
  codigo: string;
  /** Como se lee: "PUN-04" o, en una góndola doble, "GON-60·B". */
  display: string;
  proveedor: string;
}
