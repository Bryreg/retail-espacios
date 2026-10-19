# Rediseño — decisiones del dueño que todavía no están en el código

Se pasan a `docs/ESTADO.md` en el PR que las implementa.

## Plano (PR 3), aprobadas el 2026-10-19
Dibujo: `docs/maquetas/rediseno-2026-10/plano.html`.

1. **Sin «Reservado» a mano** en «Estado del espacio»: queda Disponible / Mantenimiento. La
   reserva de verdad sale de Vender, con proveedor y fecha (`vender-api.md` §8). Los espacios
   que hoy estén marcados «Reservado» aparecen en Supervisar → Corregir, para pasarlos a una
   reserva real o liberarlos.
2. **La sede una sola vez**, arriba, con la misma pieza que en Vender y Supervisar (renombrar,
   agregar y eliminar en su menú «⋯»). Abajo ya no se repite.
3. **Dos filtros nuevos** en el lienzo: «Vendido en parte» y «Reservados».
4. **«Cómo se vende» sigue en el Plano** y es UNA verdad: `partes.division` del mueble. Vender
   la puede cambiar sólo cuando el mueble está libre (sin contratos ni reservas vivas en
   ninguna de sus caras), con una confirmación en línea que dice que vale para todo el mueble
   («las dos caras» si las tiene), por el mismo camino del Plano (`PUT /layout` con sus
   guardas). Si no se puede, la opción se ve deshabilitada con el motivo y sin nombrar a nadie.
   Las líneas de ese mueble que ya estaban en el contrato se reemplazan por la forma nueva.
