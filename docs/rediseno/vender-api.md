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
  Si viene otro valor, la línea vuelve en el 409 con `code: "valor"`. Sin `porcentaje` (0 < p ≤
  100) o sin `corte`: 422 `cobro`.
- Con `tipo = "contrato"` y cobro fijo, cada línea lleva `valor` > 0 (si no, 409 `valor`). Con
  `modo_precio = "mensual"` el servidor comprueba `round(valor_tecleado × meses) = valor` (±1
  peso, la cuenta de §6); si no coincide, 409 `valor`.
- `tipo = "reserva"` vale para **cualquier** línea (decisión del dueño, 2026-10-19): un
  porcentaje se reserva como hoy (término `reserva` de participaciones, con su precio en §2) y
  una cara entera o una parte con la reserva de espacio nueva (§8). Una reserva guarda su
  precio acordado. Todo el pedido es una reserva o todo es un contrato.
- Una reserva también puede cobrar por **% de las ventas** (decisión del dueño, 2026-10-20):
  guarda `cobro` (porcentaje y corte) en vez de un precio, y al confirmarla el contrato queda
  cobrando por ventas (se crea su `cobros_por_venta`). Las tablas de reserva guardan el cobro en
  columnas propias de esas tablas nuevas (`cobro_modo`, `cobro_porcentaje`, `cobro_corte`).
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
  // lease_id: el contrato del porcentaje (para colgarle la planometría); null en una reserva.
  // reserva_id: en una reserva de porcentaje es el mismo termino_id; null en un contrato.
  "participaciones": [{ "cara": "CENTRO-GON-02", "espacio": "CENTRO-GON-02-PC2", "termino_id": 9,
                        "tipo": "contrato", "lease_id": 42, "reserva_id": null }],
  // Las caras enteras y las partes reservadas (§8); vacío en un contrato.
  "reservas": [{ "espacio": "CENTRO-PUN-02-EN1", "reserva_id": 3 }],
  "avisos": { /* la misma forma que devuelve hoy confirmarLote; null en una reserva */ } }
```
Errores del pedido entero (antes de mirar las líneas): 422 `{ "detail": { "code", "message" } }`
con `code` `sede`, `proveedor`, `sin_lineas`, `demasiadas_lineas`, `fechas`, `reserva_pasada`,
`caduca`, `cobro` o `linea` (una línea con espacio Y porcentaje, o ninguno). Campos de más → 422.

**Respuesta 409** (no se escribió nada)
```jsonc
{ "detail": { "code": "contrato_invalido",
  "filas": [ { "indice": 1, "espacio": "CENTRO-GON-02", "code": "capacidad_excedida",
               "mensaje": "Ya no entra el 75 %: desde el 3 nov queda 70 %.",
               "queda_pb": 7000, "desde_dia": "2026-11-03" } ] } }
```
Los mensajes **no nombran a nadie** ni dicen el % de otro: sólo lo que queda y desde cuándo.
`?validar=1` contesta 200 `{ "ok": true, "filas": [] }` o el mismo 409. Una línea de cara entera
o de parte que no entra trae `code: "linea_invalida"`, la primera frase de la planilla en
`mensaje` y todas en `mensajes`. Si el plano cambió entre las dos revisiones: 409
`plano_cambio` (nada escrito).

## 2. El precio de una reserva: tabla `precios_de_reserva`

`(participacion_id PK FK, valor, modo_precio, valor_tecleado, creado_en, creado_por)`. Se
escribe al reservar desde Vender. `confirmar_reserva` usa ese valor si el cuerpo no trae
`valor_mensual`, y borra la fila al confirmar. Sale como `valor_acordado` en las rutas de
administración de participaciones. Nunca en el historial (que no lleva plata).

Lleva también el cobro (`cobro_modo` "fijo"|"ventas", `cobro_porcentaje`, `cobro_corte`; con
ventas, `valor` va en null). Con cobro por ventas y sin `valor_mensual` en el cuerpo,
`confirmar_reserva` crea el contrato en 0 con su `cobros_por_venta`; un `valor_mensual` en el
cuerpo lo pasa a fijo. En las rutas de administración sale como `cobro_acordado: { modo,
porcentaje, corte }` (null si es fijo).

## 3. Cobro por % de las ventas: tablas `cobros_por_venta` y `cortes_de_venta`

- `cobros_por_venta(lease_id PK FK, porcentaje, corte "mensual"|"al_final", creado_en, creado_por)`
- `cortes_de_venta(id, lease_id FK, periodo_desde, periodo_hasta, ventas, monto, cargado_en, cargado_por)`

Rutas (sólo administración):
- `GET /api/cobros/pendientes?sede=` → los cortes vencidos sin cargar:
  `[{ lease_id, espacio, proveedor, porcentaje, periodo_desde, periodo_hasta }]`.
- `POST /api/cobros/{lease_id}/cortes` `{ periodo_desde, periodo_hasta, ventas }` → `{ monto }`
  (monto = ventas × porcentaje, redondeado al peso).
- `GET /api/cobros?sede=` → por contrato: `[{ lease_id, espacio, sede, proveedor, marca, desde,
  hasta, porcentaje, corte, cortes: [{ periodo_desde, periodo_hasta, ventas, monto, cargado_en,
  cargado_por }], cobrado, proximo_corte: { periodo_desde, periodo_hasta } | null }]`.

Los períodos: con corte mensual, uno por mes calendario dentro del contrato (19 oct – 18 dic →
19–31 oct, 1–30 nov, 1–18 dic); «al final», uno solo. Vencido = su último día es anterior a hoy
(Colombia); un contrato cancelado debe igual sus períodos terminados. El corte tiene que ser
exactamente uno de esos períodos (422 `periodo`), ya terminado (422 `periodo_abierto`) y no
cargado (409 `corte_cargado`).

Las métricas (dashboard, plataforma, tendencia, detalle, asesoría, transparencia) **no cuentan
estos contratos como de $ 0**: los sacan de los promedios y suman lo cobrado en los cortes.
Lo cobrado de un corte que cruza meses se reparte por días. La serie histórica
(`snapshot_metricas`) no tiene columna para lo cobrado (y no se agregan columnas): el mes en
curso lo suma, los meses ya guardados cuentan sólo el canon fijo.

## 4. El aviso de montaje espera a la planometría: tabla `montajes_pendientes`

`(lease_id PK, cara_space_id, creado_en)`. Decisión del dueño (2026-10-20, PR 2): el correo de
montaje de **cualquier** contrato nuevo —cara entera, parte o porcentaje— sale cuando el
contrato tiene su planometría cargada (`POST /api/leases/{id}/planometria`, en Supervisar) y,
en un porcentaje, además cuando su cara tiene la distribución confirmada con la zona de esa
participación. Lo que pase último lo dispara; sale **una vez** y la fila se borra.

- Todo contrato nuevo deja su fila al escribirse (`alta_de_contrato.escribir_contrato`, que usan
  la planilla, este guardado, las reservas confirmadas y los porcentajes —alta, confirmar,
  renovar—; y el contrato suelto, `POST /spaces/{id}/leases`). `cara_space_id`: en un
  porcentaje, la cara que se distribuye; en una entera o una parte, el espacio del contrato. Lo
  que falta no se guarda: se mira cada vez (`lease_files`, `zonas`).
- Al guardar, comercial y el proveedor reciben su correo como siempre; el de montaje no sale
  mientras el contrato tenga fila (`bulk_leases._avisar`). `avisos.montaje` va vacío y
  `avisos.montaje_pendiente` dice los `lease_id` que esperan (en el contrato suelto, también).
- Al cargar la planometría (después del commit): si el contrato tenía fila y no le falta la
  zona, sale el correo de montaje (el de la planilla: «N espacio por montar», con la parte, dónde
  queda en palabras y el enlace firmado; sin plata). La respuesta suma `aviso_de_montaje`:
  `{ estado: "salio", smtp_listo, montaje: [correos] }`, `{ estado: "espera_distribucion", … }`
  si es un porcentaje sin zona, o `null` si no había nada pendiente (un contrato de antes de la
  regla, o una planometría que reemplaza a otra: **no se reenvía**).
- Al confirmar la distribución de una cara (válida, después del commit): salen los pendientes de
  esa cara que ya tienen planometría y zona. Una renovación que conserva la zona espera igual su
  planometría.
- Un contrato cancelado mientras esperaba no se avisa (su fila se borra al dispararse). Sin SMTP
  o sin mercaderista cargado no se encola nada y la fila se borra igual, como al guardar.
- **Contratos de antes de esta regla** (sin fila): su aviso ya salió al guardarlos; cargarles la
  planometría o confirmar su distribución no manda nada.

**«Falta planometría» (Supervisar): `GET /api/montajes/pendientes?sede=`** — sólo
administración (`routers/montajes.py`; el trabajador, 403). Los contratos activos que no
terminaron (vigentes o por empezar) con el aviso de montaje pendiente, del que arranca antes al
último. **Sin plata.**
```jsonc
[{ "lease_id": 41, "espacio": "CENTRO-GON-02-PC2", "cara": "CENTRO-GON-02", "sede": "CENTRO",
   "proveedor": "Lácteos del Valle", "marca": "Yogur Valle",
   "desde": "2026-11-01", "hasta": "2026-11-30",
   "falta_planometria": true, "falta_distribucion": false,
   "dias_para_empezar": 12 }]   // negativo si ya arrancó (Colombia, `hoy()`)
```
`cara` es el código de la cara (en una entera, el mismo `espacio`; en una parte o un porcentaje,
la cara a la que pertenece). Cuál es «próximo» lo decide la pantalla con `dias_para_empezar`.

## 5. Completar el proveedor: `GET /api/suppliers/completar?prefijo=`

Sólo administración. Desde 3 letras (con menos, `{ "nombre": null }`); sin tildes ni mayúsculas.
Devuelve `{ "nombre": "…" }` o `{ "nombre": null }`: **un solo nombre**, el de más contratos
entre los que empiezan así (a igualdad, el más viejo).
Nunca una lista, nunca montos.

## 6. La duración en meses (para «al mes» y para Supervisar)

Una sola cuenta, escrita dos veces con los mismos casos (`frontend/src/utils/meses.ts` ↔
`backend/app/services/meses.py`, `frontend/scripts/casos/meses.json`): los meses calendario
completos entre `desde` y `hasta + 1 día`, más los días que sobran ÷ 30. 1 nov – 30 nov = 1;
1 nov – 31 ene = 3; 19 oct – 18 nov = 1. «Al mes» × meses = total (redondeado al peso), y en
Supervisar (PR 2) total ÷ meses = al mes. Un mes se suma desde el día de arranque y, si ese día
no existe en el mes de llegada, se queda en el último (31 ene + 1 mes = 28 feb; 31 ene – 27 feb
= 1, 31 ene – 28 feb = 1 mes y 1 día). Los casos llevan los meses redondeados a 6 decimales.

## 7. Todas las tablas nuevas

Entran a `TABLAS_DEL_CLIENTE` (`services/traspaso.py`), a la copia (`copia.py`) y a la
exportación (`derechos.py`); se importan en `main.py`; se suman a los barridos de fuga de plata
(`test_auditoria_hardening`, `test_identidad`, `test_montaje_enlace`, `test_suite_sin_fuga`).
La quinta tabla es `condiciones_de_contrato(lease_id PK FK, modo_precio, valor_tecleado,
creado_en)`, que recuerda cómo se escribió el precio de un contrato (entero, parte o porcentaje).
La sexta es `reservas_de_espacio` (§8) y la séptima, `contratos_reemplazados` (§9, «Editar
contrato»). En la exportación salen juntas bajo `condiciones_comerciales: { <tabla>: [filas] }`.

Los correos dicen «Valor del contrato» (nunca «Valor mensual» ni «Total mensual»: lo guardado
es el total) y, si se escribió por mes, «$ 1.800.000 ($ 600.000 al mes)»; un contrato por
ventas, «8 % de las ventas (corte mensual)». La plata, entera y con punto de miles.

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
  reserva ni de quién. Sus avisos por correo siguen a los de una reserva de participación (no
  manda ninguno; al confirmarla salen los de un contrato).
- Lo que quedó implementado (2026-10-19): en `GET /api/spaces/comercial` una cara o parte con
  reserva viva (y sin contrato) sale con `status: "occupied"`; quien administra ve además
  `supplierName`, `brandCategory`, `negotiatedValue` (el valor guardado), `startDate`/`endDate`
  (los de la reserva) y `reservaHasta` (la caducidad); el trabajador, todo vacío y
  `reservaHasta: null`. Los choques la dicen «tomado» (««X» está tomado del … al …: ajustá las
  fechas.»). `GET /api/reservas` devuelve `[{ id, espacio, sede, proveedor, marca, desde, hasta,
  caduca, caduca_pronto, valor, modo_precio, valor_tecleado, notas, creado_en, creado_por }]`
  (sólo las vivas; `caduca_pronto` = caduca dentro de 7 días). `POST
  /api/reservas/{id}/confirmar` recibe `{ valor?, modo_precio?, valor_tecleado?, correo?,
  notas? }` y contesta `{ reserva_id, lease_id, espacio, avisos }`; una reserva que ya no vive
  (confirmada, cancelada o caducada) da 409. Bitácora: `reserva_espacio.alta`,
  `reserva_espacio.confirmada` (+ `contrato.alta`) y `reserva_espacio.baja`.
- Cobro por ventas (2026-10-20): `reservas_de_espacio` guarda `cobro_modo`, `cobro_porcentaje`
  y `cobro_corte`; `GET /api/reservas` lo dice en `cobro: { modo, porcentaje?, corte? }`. Al
  confirmar, el cobro guardado manda salvo que el cuerpo traiga `valor` (contrato fijo) o `cobro: { modo, porcentaje, corte }` (el que se diga). Con ventas, el contrato
  nace en 0 con su `cobros_por_venta`. Borrar una sede cancela sus reservas de espacio.
- La planometría NO se carga en una reserva (decisión del dueño, 2026-10-20): comercial la
  cuelga del contrato una vez confirmado, con `POST /api/leases/{id}/planometria` como siempre.

## 9. Editar un contrato guardado: `POST /api/contratos/vender` con `edita` (2026-10-22)

Decisión del dueño (aprobada sobre el dibujo «Editar un contrato y reenviarlo»): un contrato YA
guardado se reabre en el formulario de Vender —forma de venderse, proveedor, correo, marca,
fechas, precio con su «Total | Al mes», precio fijo o % de las ventas con su corte, el % de una
participación— y al guardarlo **se envía de nuevo a los correos, a todos, siempre**. Motivo: ~30
contratos de POBLADO cargados con un valor de pocos pesos cuando eran por % de las ventas. Se
edita **de a uno** (nada de edición masiva). Sólo administración.

**Cómo se abre.** `GET /api/contratos/{lease_id}/edicion` (administración; trabajador 403, sin
sesión 401, 404 `contrato_no_existe`) devuelve lo que Vender carga, **sin la nota interna**:
```jsonc
{ "lease_id": 41, "espacio": "CENTRO-PUN-04", "sede": "CENTRO", "cara": "CENTRO-PUN-04",
  "forma": "entera" | "parte" | "pieza" | "participacion", "parte": "EN2" | null,
  "proveedor": "…", "correo": "…" | null, "marca": "…" | null, "desde": "2026-08-01", "hasta": "2027-01-31",
  "valor": 6, "modo_precio": "total" | "mensual" | null, "valor_tecleado": 6 | null,
  "cobro": { "porcentaje": 8, "corte": "mensual" } | null, "puntos_basicos": 5000 | null, "termino_id": 9 | null,
  "activo": true, "arranco": true, "ultimo_corte": "2026-09-30" | null, "cortes": 2,
  "planometria": "planometria-pun04.pdf" | null, "montaje_pendiente": false, "hoy": "2026-10-22" }
```

**El pedido** es el de §1 con un campo más (campos de más → 422, también adentro):
```jsonc
{ …el pedido de Vender…, "tipo": "contrato",
  "edita": { "lease_id": 41, "esperado": { "valor": 6, "desde": "2026-08-01", "hasta": "2027-01-31" } } }
```
- `lease_id` es **EL contrato del renglón** (`leaseId` de `GET /api/spaces/comercial`, sólo para
  quien administra; al trabajador le llega `null`) y `esperado` lo que el renglón mostró
  (`negotiatedValue`, `startDate`, `endDate`; de una participación, el `valor_mensual`, `desde`
  y `hasta` de su término). Nunca se busca el contrato por código.
- Siempre `tipo: "contrato"` (422 `edita_tipo`: una reserva no se edita por acá), sin `nota`
  (422 `edita_nota`: la nota interna no viaja a Vender), sin `renueva` (422 `edita_renueva`).
- **Una línea** —el contrato que se edita— salvo cuando pasa a venderse por partes: entonces las
  partes elegidas de **una** cara y una clase (`PUN-04-EN1` y `-EN2`). Si no, 422 `edita_lineas`.
- `?validar=1` revisa todo sin escribir (la vista previa de Vender), igual que §1.

**Cómo revisa.** Bajo `tomar_candados` (los muebles del pedido **y** el del contrato que se edita)
+ `expire_all` + la fila del contrato `SELECT … FOR UPDATE` (la cancelación no toma el candado del
mueble, pero escribe la fila):
- 404 `contrato_no_existe`; **409 `contrato_cambio`** «Ese contrato cambió mientras lo editabas:
  recargá y volvé a intentar.» si ya no está activo (cancelado, reemplazado, término dado de baja),
  si terminó (`hasta` < hoy, Colombia) o si no coincide con `esperado` (el valor al centavo —
  `ROUND_HALF_UP` sobre `repr`: el ruido de un float no cuenta, un centavo sí—, las fechas exactas).
- **Fechas.** Un contrato que ya arrancó (`desde` ≤ hoy) no mueve su «Desde»: 422
  `desde_arrancado` («El contrato arrancó el 1 ago 2026: su «Desde» no se mueve. Para otro
  arranque, renovalo o cancelalo.»). El «Hasta» no queda antes del último corte de ventas cargado
  (422 `hasta_antes_del_corte`) ni antes de hoy (422 `hasta_pasado`). Uno que todavía no arrancó
  mueve las dos.
- **Choques y capacidad, sin contarse a sí mismo**: la revisión de §1 (`vender.revisar`) con
  `excluir_lease` (en `contratos_que_chocan`, `bulk_leases._revisar` y `fisicos_de`) y
  `excluir_termino` (en `intervalos_que_cuentan` de la capacidad y en `bloqueo_por_participaciones`).
  Sólo ese contrato y sólo desde esta ruta: otro contrato real —también del mismo proveedor, o el
  próximo de la misma cara— choca igual (409 `contrato_invalido` con sus `filas`, como §1).
- **Cobro con ventas cargadas** (409 `tiene_cortes`): sigue por ventas, con el mismo corte, y en el
  mismo contrato (no cambia de forma ni de espacio). El % sí cambia (vale para los cortes que
  vienen; los cargados quedan con su monto).
- Un porcentaje que se corrige en su lugar pasa además las invariantes de su participación
  (`otro_proveedor`, `otro_porcentaje`, `termino_superpuesto`, como `revisar_terminos`) y no puede
  romper la distribución confirmada (409 `rompe_distribucion`, con una frase neutra: lo ve el
  proveedor).

**Mismo espacio = mismo contrato (en su lugar).** La misma cara entera, la misma parte, la misma
pieza o un porcentaje de la misma cara: se corrigen `space_leases` (proveedor por
`proveedor_por_nombre`, marca, fechas, `monthly_rent`), `condiciones_de_contrato` (modo y lo
tecleado) y el cobro (fijo → ventas crea `cobros_por_venta`; ventas → fijo la borra —sin cortes—;
ventas → ventas cambia % y corte). En un porcentaje, los puntos básicos del término con su versión
(mismo PC, mismo número, mismas zonas). Todo lo que cuelga del contrato sigue colgado (mismo
`lease_id`): planometría, montaje pendiente, cortes, zona, enlace firmado, bitácora. El correo del
proveedor se completa **sólo si estaba vacío** (la regla de siempre de `proveedor_por_nombre`): si
el pedido trae otro, no pisa el que tiene. La nota interna no se toca.

**Otro espacio u otra forma = reemplazo.** En la MISMA transacción: los nuevos nacen por el camino
de Vender (`vender._escribir`, con la nota interna del viejo) y el viejo se cierra (`is_active =
False`, su espacio libre si no le queda otro contrato) y queda en la tabla nueva
**`contratos_reemplazados(lease_id PK FK, reemplazado_por JSON, en, por)`** —no se cancela: no
hay `contrato.baja`—. Un porcentaje reemplazado se da de baja con el ciclo de siempre (`baja_en`,
así deja de contar) y su historial lo dice `contrato.reemplazado` (`estado_visible` lo lee
«cancelado»: no hay columna para distinguirlo; la constancia está en el historial y en la tabla).
Lo que colgaba del viejo (planometría, montaje) se queda con él: los nuevos nacen con su fila en
`montajes_pendientes` y la piden en «Para revisar» como cualquier contrato nuevo. Con cortes
cargados no se reemplaza (409 `tiene_cortes`: los nuevos volverían a pedir los mismos meses).

**Bitácora.** `contrato.editado` (en su lugar) o `contrato.reemplazado` (+ `contrato.alta` de cada
nuevo), con el antes → ahora de lo que cambió. La bitácora es de administración.

**Respuesta 200** — la de §1, más `edicion`:
```jsonc
{ "contratos": [{ "espacio": "CENTRO-PUN-04-EN1", "lease_id": 51 }, …], "participaciones": [ … ], "reservas": [],
  "avisos": { /* AvisosContrato, como §1 */ },
  "edicion": { "modo": "en_el_lugar" | "reemplazo", "lease_id": 41, "reemplazado_por": [51, 52] } }
```

**Los correos «Contrato modificado», a todos y siempre** (después del commit,
`services/aviso_de_edicion.py`, por los mismos caños que `_avisar`):
- **Comercial** (gerente y administrador de la sede): «Contrato modificado — PUN-04 · POBLADO»,
  cada campo —espacio, proveedor, marca, fechas, cobro— «antes → ahora» o «(igual)», y «Lo cambió:
  quién · fecha, hora». La plata entera (`texto_del_valor`).
- **El proveedor** (el correo del proveedor del contrato que queda): «Tu contrato cambió: PUN-04 —
  Supermercado», antes → ahora de lo suyo. Si el contrato pasó a OTRO proveedor, el nuevo recibe
  sólo lo de ahora y el de antes no recibe nada (no se le cuenta a quién se le dio).
- **Montaje** (la mercaderista): sin plata, con el enlace firmado del contrato que queda. Si ese
  contrato todavía espera su planometría (uno nuevo de un reemplazo, o uno en su lugar que nunca la
  tuvo), su aviso espera como cualquier otro (`avisos.montaje_pendiente`) y sale al cargarla, con los
  datos de ese momento.
