# Fix contable: C-1 y C-3 (hallazgos bloqueantes del auditor contable)

Cierre de los dos bloqueantes documentados en `auditor-contador-pl.md` (§4, C-1 y C-3),
aplicado tras el ciclo de orquestación y verificado con la suite completa en verde.

## La decisión: UNA elegibilidad, pura y sin calendario

Los dos hallazgos tenían la misma raíz: `_ingreso_periodo_dias` (plata) y `_cubre_periodo`
(conteo) usaban reglas de elegibilidad distintas, y la de plata además comparaba contra
`date.today()`.

El fix introduce `_fin_efectivo(lease, cancelados)` en `backend/app/services/ocupacion.py`
como **la** regla, compartida por ambos numeradores:

- **Con fila en `lease_cancellations`** → corta en la fecha de cancelación (lo devengado no
  se borra; no sigue sumando después).
- **Sin fila** → corta en `end_date`, esté `is_active` o no. Un vencimiento natural de
  `expire_leases()` devengó su plazo completo; una cancelación pre-tabla queda contada hasta
  `end_date` de forma **explícita y estable**.

## Qué cierra cada parte

**C-1 (el número que "saltaba solo").** La rama vieja `is_active=False` sin fila comparaba
`end_date >= hoy`: el mismo lease valía $0 hoy y el plazo entero el día que su `end_date`
quedara atrás — el P&L de septiembre pasaba de $0 a $900.000 sin que nadie tocara nada. Ahora
la elegibilidad es función pura de lo guardado (fechas + fila): consultar el mismo período
hoy, mañana o en un año da el mismo peso. La sobre-declaración residual de las cancelaciones
históricas (cuentan hasta `end_date`) es la que el **backfill desde `audit_log`** repone con
la fecha real — decisión alineada con la corrección que el propio auditor propuso ("una fila
con `cancelled_at = end_date` los deja en el comportamiento actual de forma explícita y
estable"), y con su urgencia intacta (la bitácora se purga a los 365 días).

**C-3 (plata y ocupación contradiciéndose en la misma fila).** `_cubre_periodo` filtraba por
`is_active` mientras la plata ya usaba fechas + cancelación: junio devolvía
`ingreso_contratado = $1.000.000` con `contratadas = 0`. Ahora ambos derivan de
`_fin_efectivo`, así que **no pueden divergir por construcción**. `occupancy_range` (semáforo
de venta) queda a propósito con su regla propia — "cancelado no ocupa" es la regla para
VENDER; "ocupó los días que ocupó" es la regla para contar la temporada — tal como pidió el
auditor.

Consecuencia necesaria: `cancelados` (`_cancelados_de`) se carga **siempre** en
`sede_ocupacion`, no solo con `include_money`, porque ahora el conteo también lo usa.

## Cambio de comportamiento visible

- Una cara cancelada HOY cuenta como `contratada` para el período que incluye hoy (devengó
  hasta `cancelled_at`) y queda libre de mañana en adelante. El test
  `test_cancelar_no_deja_la_cara_contratada` codificaba exactamente la contradicción C-3
  (plata > 0 con contratadas = 0) y se reemplazó por
  `test_cancelar_libera_la_cara_para_periodos_futuros`.
- Una cancelación pre-tabla con `end_date` futuro ahora cuenta hasta `end_date` desde ya
  (antes: $0 hasta que el calendario la hiciera "saltar" al plazo entero).

## Tests de regresión nuevos (`tests/test_dashboard_ocupacion.py`)

- `test_cancelacion_historica_end_date_pasado_cuenta_hasta_end_date` — el caso [C] del banco
  del auditor, ahora estable y consistente (cubre además el hueco detectado: ningún test
  ejercitaba `is_active=False` sin fila).
- `test_cancelacion_historica_end_date_futuro_no_salta_con_el_calendario` — el caso [D→C].
- `test_plata_y_conteo_nunca_se_contradicen_en_temporada_cerrada` — el caso de junio de C-3.

Suite completa del backend tras el fix: **verde, exit 0** (282 tests). `tsc --noEmit`: limpio.

## Queda abierto (sin cambios en esta pasada)

C-2 (huso de `cancelled_at`, advertencia), C-4 (rótulo del techo), B-5/modelo dual (decisión
de producto) y el backfill operativo — todos en `docs/ESTADO.md` § pendientes.
