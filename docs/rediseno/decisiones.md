# Rediseño — decisiones del dueño que todavía no están en el código

Se pasan a `docs/ESTADO.md` en el PR que las implementa.

## Plano (PR 3), aprobadas el 2026-10-19 — HECHAS (2026-10-20)
Dibujo: `docs/maquetas/rediseno-2026-10/plano.html`. Pasaron a `docs/ESTADO.md` (*Rediseño, PR 3
(Plano)* y la regla dura «Un espacio se ocupa vendiéndolo, y se reserva en Vender»): 1, 2, 3 y 5
están en el código; la 4 la cerró Vender (PR 1, «Cambia cómo se vende … en toda la tienda» de
`LineaDelContrato.tsx`), y en el Plano «Cómo» sigue escribiendo la misma `partes.division`.

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
5. **El panel del mueble es el B** (aprobado el 2026-10-20, `panel-plano.html`): encabezado con
   el código y su lápiz, una línea con tipo · sede (candado) · pasillo, una franja de resumen y
   tres pestañas — **Venta** (se vende, cómo, estado, contratado), **Medidas** (medidas,
   entrepaños con − y +, módulo) y **Documentos** (archivos; «Usar como foto de la cara en el
   3D», con la foto en chiquito; y la **«Nota del contrato»**, que es la de Vender, o «Nota del
   espacio» sin contrato). Abre siempre en Venta. Varios elegidos, Revisar y Atajos, en el mismo
   estilo.

## Vender (PR 1), 2026-10-20
- Una reserva puede cobrar por **% de las ventas**: guarda el porcentaje y el corte, y al
  confirmarla el contrato queda cobrando por ventas (`vender-api.md` §1).
- **La planometría se carga sólo en Supervisar** (ficha del espacio), nunca en Vender ni en una
  reserva: así el área comercial siempre pasa por Supervisar una vez que el contrato existe.
  Vender pierde el campo de planometría y la opción del visor 3D de usar la lámina como
  planometría (la lámina se sigue pudiendo armar para el proveedor).

## Supervisar (PR 2), 2026-10-20
- **«Falta planometría»** en «Para revisar»: los contratos con montaje próximo que todavía no
  tienen planometría cargada.
- **El correo de montaje espera a la planometría**: sale cuando está cargada (y, en un contrato
  por porcentaje de cara, además, cuando la distribución está confirmada). El servidor ya lo hace
  (`vender-api.md` §4, con `GET /api/montajes/pendientes` para «Falta planometría»).
