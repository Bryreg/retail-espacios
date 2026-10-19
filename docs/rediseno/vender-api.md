# Rediseño de Vender — el contrato entre la pantalla y el servidor (PR 1)

Aprobado por el dueño el 2026-10-19 (pasos 1 y 2 del rediseño; los dibujos están en
`docs/maquetas/rediseno-2026-10/`). Este archivo es el acuerdo que comparten el servidor y
la pantalla: si uno cambia, cambia el otro y este archivo en el mismo commit.

Reglas que no se tocan: **sin migraciones** (sólo tablas nuevas, nunca columnas nuevas en
tablas existentes; `test_t22`), **la plata nunca le llega al trabajador**, **delante del
proveedor sólo lo suyo** (en Vender: su % y lo que queda; nunca nombres, % ni formas de otros),
la capacidad de una cara la decide el servidor con el candado del mueble y `expire_all`.

## 1. Guardar un contrato de Vender: `POST /api/contratos/vender`

Sólo administración. `?validar=1` revisa todo y no escribe nada (la vista previa antes de
habilitar «Guardar»). Sin `validar`: **todo o nada** — o se escriben todas las líneas o
ninguna (un solo commit; cualquier error hace rollback).

```jsonc
{
  "sede": "CENTRO",
  "proveedor": "Lácteos del Valle",        // find-or-create por nombre, como hoy
  "correo": "compras@…",                   // opcional, para la constancia
  "marca": "Yogur Valle",                  // opcional
  "nota": "…",                             // opcional
  "desde": "2026-11-01", "hasta": "2026-11-30",
  "tipo": "contrato",                      // "contrato" | "reserva"
  "caduca": null,                          // obligatorio si tipo = "reserva" (hoy ≤ caduca ≤ hasta); sin valor por defecto
  "cobro": { "modo": "fijo" },             // o { "modo": "ventas", "porcentaje": 8, "corte": "mensual" | "al_final" }
  "lineas": [
    // Una cara entera o una parte (PU/TR/EN/BI/FO), con el código completo como hoy.
    { "espacio": "CENTRO-PUN-02-EN1", "valor": 130000, "modo_precio": "total", "valor_tecleado": 130000 },
    // Un porcentaje de una cara (la cara B con -B). El servidor pone el número PC.
    { "participacion": { "cara": "CENTRO-GON-02", "puntos_basicos": 7500, "renueva": null },
      "valor": 600000, "modo_precio": "mensual", "valor_tecleado": 600000 }
  ]
}
```

- `valor` es **siempre el total** de esa línea por todo el plazo: es lo que se guarda en el
  contrato (`monthly_rent`, que en Vender nunca se prorrateó). `modo_precio` y
  `valor_tecleado` sólo recuerdan cómo se escribió («al mes» × la duración = el total; ver §6).
- Con `cobro.modo = "ventas"`, `valor` va en 0 y no se exige; el monto sale de los cortes (§3).
- `tipo = "reserva"` vale para **cualquier** línea (decisión del dueño, 2026-10-19): un
  porcentaje se reserva como hoy (término `reserva` de participaciones, con su precio en §2) y
  una cara entera o una parte con la reserva de espacio nueva (§8). Una reserva guarda su
  precio acordado. Todo el pedido es una reserva o todo es un contrato.
- `participacion.renueva`: id del término que se renueva (Renovar desde Supervisar). Mismas
  invariantes que `POST /api/participaciones/{id}/renovar`: mismo proveedor, marca y %, y
  empieza después de los vivos.
- Un porcentaje de una cara que todavía no se vende por participación: la pantalla primero
  cambia la forma de venderse con el camino que ya existe (mismas guardas del Plano:
  `revisarCambioDePartes`, `PUT /layout`) y después manda la línea. El servidor la rechaza si la
  cara no se vende así (`cara_no_distribuible` / la compuerta de siempre).

**Cómo revisa.** Junta todos los códigos (caras y partes) y toma `tomar_candados` UNA vez, en
orden; `expire_all`; vuelve a revisar todo; escribe. Dos porcentajes de la misma cara en el
mismo pedido se suman entre sí antes de comparar contra la capacidad. Bitácora: `contrato.alta`
por contrato y `participacion.contrato` / `participacion.reserva` por porcentaje. Un solo envío
de avisos con todas las filas, como `bulk_leases._avisar`.

**Respuesta 200**
```jsonc
{ "contratos": [{ "espacio": "CENTRO-PUN-02-EN1", "lease_id": 41 }],
  "participaciones": [{ "cara": "CENTRO-GON-02", "espacio": "CENTRO-GON-02-PC2", "termino_id": 9, "tipo": "contrato" }],
  "avisos": { /* la misma forma que devuelve hoy confirmarLote */ } }
```

**Respuesta 409** (no se escribió nada)
```jsonc
{ "detail": { "code": "contrato_invalido",
  "filas": [ { "indice": 1, "espacio": "CENTRO-GON-02", "code": "capacidad_excedida",
               "mensaje": "Ya no entra el 75 %: desde el 3 nov queda 70 %.",
               "queda_pb": 7000, "desde_dia": "2026-11-03" } ] } }
```
Los mensajes **no nombran a nadie** ni dicen el % de otro: sólo lo que queda y desde cuándo.
`?validar=1` contesta 200 `{ "ok": true, "filas": [] }` o el mismo 409.

## 2. El precio de una reserva: tabla `precios_de_reserva`

`(participacion_id PK FK, valor, modo_precio, valor_tecleado, creado_en, creado_por)`. Se
escribe al reservar desde Vender. `confirmar_reserva` usa ese valor si el cuerpo no trae
`valor_mensual`, y borra la fila al confirmar. Sale como `valor_acordado` en las rutas de
administración de participaciones. Nunca en el historial (que no lleva plata).

## 3. Cobro por % de las ventas: tablas `cobros_por_venta` y `cortes_de_venta`

- `cobros_por_venta(lease_id PK FK, porcentaje, corte "mensual"|"al_final", creado_en, creado_por)`
- `cortes_de_venta(id, lease_id FK, periodo_desde, periodo_hasta, ventas, monto, cargado_en, cargado_por)`

Rutas (sólo administración):
- `GET /api/cobros/pendientes?sede=` → los cortes vencidos sin cargar:
  `[{ lease_id, espacio, proveedor, porcentaje, periodo_desde, periodo_hasta }]`.
- `POST /api/cobros/{lease_id}/cortes` `{ periodo_desde, periodo_hasta, ventas }` → `{ monto }`
  (monto = ventas × porcentaje, redondeado al peso).
- `GET /api/cobros?sede=` → por contrato: porcentaje, corte, cortes cargados y próximo corte.

Las métricas (dashboard, plataforma, tendencia, detalle, asesoría, transparencia) **no cuentan
estos contratos como de $ 0**: los sacan de los promedios y suman lo cobrado en los cortes.

## 4. El aviso de montaje de un porcentaje: tabla `montajes_pendientes`

`(lease_id PK, cara_space_id, creado_en)`. Al firmar un porcentaje se avisa a comercial y al
proveedor, pero no al montaje: queda pendiente. Al confirmar la distribución de esa cara
(después del commit y sólo si no quedó inválida), sale el correo de montaje de los pendientes
cuya participación tiene zona confirmada, y se borran.

## 5. Completar el proveedor: `GET /api/suppliers/completar?prefijo=`

Sólo administración. Desde 3 letras; sin tildes ni mayúsculas. Devuelve `{ "nombre": "…" }` o
`{ "nombre": null }`: **un solo nombre**, el de más contratos entre los que empiezan así.
Nunca una lista, nunca montos.

## 6. La duración en meses (para «al mes» y para Supervisar)

Una sola cuenta, escrita dos veces con los mismos casos (`frontend/src/utils/meses.ts` ↔
`backend/app/services/meses.py`, `frontend/scripts/casos/meses.json`): los meses calendario
completos entre `desde` y `hasta + 1 día`, más los días que sobran ÷ 30. 1 nov – 30 nov = 1;
1 nov – 31 ene = 3; 19 oct – 18 nov = 1. «Al mes» × meses = total (redondeado al peso), y en
Supervisar (PR 2) total ÷ meses = al mes.

## 7. Todas las tablas nuevas

Entran a `TABLAS_DEL_CLIENTE` (`services/traspaso.py`), a la copia (`copia.py`) y a la
exportación (`derechos.py`); se importan en `main.py`; se suman a los barridos de fuga de plata
(`test_auditoria_hardening`, `test_identidad`, `test_montaje_enlace`, `test_suite_sin_fuga`).
La quinta tabla es `condiciones_de_contrato(lease_id PK FK, modo_precio, valor_tecleado,
creado_en)`, que recuerda cómo se escribió el precio de un contrato entero o de una parte.

## 8. Reservar una cara entera o una parte: tabla `reservas_de_espacio`

Decisión del dueño (2026-10-19): «Reservar hasta…» vale también para espacios enteros y partes,
no sólo para porcentajes. Es un concepto nuevo: **lo reservado cuenta como ocupado** en sus
fechas mientras la reserva viva, igual que un contrato, en TODOS los caminos que hoy deciden si
algo choca o se puede vender.

- Tabla `reservas_de_espacio(id, space_id FK spaces, supplier_id FK, marca, desde, hasta,
  caduca, valor, modo_precio, valor_tecleado, correo, notas, estado "viva"|"confirmada"|
  "cancelada", lease_id NULL FK al confirmar, creado_en, creado_por, baja_en, baja_por)`.
  Viva = `estado = "viva"` y `caduca ≥ hoy` (fecha de Colombia). La caducidad la elige quien
  opera, sin valor por defecto: `hoy ≤ caduca ≤ hasta`, como las reservas de participación.
- **Cuenta como ocupado** mientras vive, en sus fechas: el choque de contratos
  (`contratos_que_chocan` / `chocan` y la compuerta de partes `motivo_para_no_vender_parte`), la
  planilla (`bulk_leases._revisar`), el contrato suelto (`POST /spaces/{id}/leases`), el guardado
  único (§1), la capacidad de una cara por participación (una cara entera o una parte física
  reservada cuenta como lo físico, `fisicos_de`), el guardarraíl del plano (sacar de circulación
  algo reservado se frena igual que algo vendido) y el mapa comercial que lee el navegador
  (`GET /api/spaces/comercial`: la cara sale tomada en esas fechas, con `reservaHasta` para
  quien administra; al trabajador, tomada y nada más).
- Rutas (administración): `GET /api/reservas?sede=` (las vivas y las que caducan pronto, para
  «Reservas por caducar» de Supervisar), `POST /api/reservas/{id}/confirmar` (crea el contrato
  con el precio guardado; el cuerpo puede cambiarlo; revisa choques con candado como §1),
  `DELETE /api/reservas/{id}` (cancelar; queda en el registro con `baja_en`).
- Delante del proveedor, una cara reservada por otro se ve **Tomada**, sin decir que es una
  reserva ni de quién. Sus avisos por correo siguen a los de una reserva de participación.
