# Backend de tarifas y ocupación por espacio — entregable (estado final, iteración 2)

Builder: `builder-rates-api`. Este archivo **reemplaza** el de la ronda 1
(no lo duplica) — refleja el estado final del código en el repo después de
los tres bloqueantes + la advertencia de una línea que asignó el Maestro en
la iteración 2, derivados del Conciliador.

## Territorio tocado

**Ronda 1** (el declarado originalmente):

- `backend/app/routers/spaces.py` — endpoint nuevo `GET /{code}/rates`.
- `backend/app/routers/dashboard.py` — endpoint nuevo `GET /ocupacion`.
- `backend/app/services/ocupacion.py` — **nuevo**. Toda la lógica de tarifa
  y ocupación derivada vive acá; los dos routers son delgados.
- `backend/tests/test_space_rates.py`, `backend/tests/test_dashboard_ocupacion.py`
  — nuevos.

**Ronda 2** (ampliación explícita del Maestro: "sos el único builder de
backend, te asigno los tres bloqueantes" — autoriza territorio fuera de la
lista original de ronda 1):

- `backend/app/schemas/spaces.py` — `SupplierPublicOut` (id + name, nada
  más) y el helper `supplier_out_for_role`.
- `backend/app/routers/suppliers.py` — `GET /` y `GET /{id}` redactan por
  rol.
- `backend/app/routers/spaces.py` — `_space_out_for_role` ahora también
  anula `lease.notes` y redacta `lease.supplier` a `SupplierPublicOut` para
  no-admin; el endpoint `/rates` suma `Cache-Control: no-store`.
- `backend/app/routers/layout.py` — `_redact_fixtures_for_worker` ahora
  también saca `observation` en las tres profundidades (top, faceB, slots),
  igual que ya hacía con `negotiatedValue`. Es el único cambio en un archivo
  que la ronda 1 había dejado explícitamente sin tocar ("reutilizá sus
  helpers, no lo toques") — acá el Maestro lo pidió por nombre.
- `backend/app/models/models.py` — tabla nueva `LeaseCancellation`
  (`lease_cancellations`: `id`, `lease_id` único, `cancelled_at`). Sin
  `ALTER`, sin columnas nuevas en tablas existentes — `create_all()` la crea
  como crea cualquier tabla nueva del proyecto.
- `backend/app/services/ocupacion.py` — reescrito el cálculo de ingreso:
  prorrateo `/30`, temporadas cerradas, cancelaciones.
- `backend/tests/test_redaction_pii.py` — **nuevo**: los dos hallazgos de
  redacción (H1 proveedor, H2 nota/observación).
- `backend/tests/test_dashboard_ocupacion.py` — ampliado con los tests de
  prorrateo, temporada cerrada, contratos consecutivos y cancelación.

No se tocó `frontend/`. No hay migraciones ni columnas nuevas en tablas
existentes en ningún punto de las dos rondas.

## Verificación

```
cd backend && python -c 'import app.main'   # OK
cd backend && python -m pytest tests/ -q    # 276 passed, 0 failed
```

Nota sobre el entorno de verificación: durante esta ronda hubo procesos
externos (otros agentes / el Conciliador) corriendo pytest en paralelo
contra el MISMO directorio `backend/tests/`. `tests/conftest.py` usa
`tempfile.mkstemp()` sin `dir=` (cae en el `/tmp` del sistema) y su
`teardown` borra por `glob` **todo** `recabra_*.db` que encuentre ahí —
así que dos corridas de pytest concurrentes contra el mismo repo se pisan
los archivos de `test_clientes.py` entre sí (`sqlite3.OperationalError:
attempt to write a readonly database`). Confirmado que es puro choque de
entorno y no una regresión de este cambio: corriendo con
`TMPDIR=<carpeta propia>` (aislando el `/tmp` de esta sesión del de los
procesos concurrentes) la suite completa pasa limpia, repetido tres veces.
`test_clientes.py` no fue tocado por este builder en ninguna ronda.

---

## 1. `GET /api/spaces/{code}/rates`

**Contrato sin cambios de ronda 1 → ronda 2**: mismo nombre, misma forma,
mismos campos. Lo único agregado es un header.

Requiere `Authorization: Bearer <jwt>` de rol `admin` o `worker` (un token de
montaje recibe 401 — lo bloquea `require_auth`).

**Path param**

| | |
|---|---|
| `code` | Código completo `SEDE-CODE`, como lo arma `fullSpaceCode()` en el cliente. Se normaliza a mayúsculas server-side. La cara B de una góndola doble es `SEDE-CODE-B`. |

**Query params (opcionales, van los DOS juntos o ninguno)**: `desde`,
`hasta` (`YYYY-MM-DD`). Ninguno → `occupancy` de HOY. Los dos → `occupancy`
del período `[desde, hasta]` (inclusivo). Uno solo → 422. `desde > hasta` →
422.

**404** si `code` no resuelve a ningún fixture en ningún `layout_snapshots`.

**Header nuevo (ronda 2, CONFLICTO-4)**: `Cache-Control: no-store, max-age=0`
en toda respuesta, admin o worker — espejo exacto de lo que ya hace
`GET /api/layout/rates`. Es plata y ocupación en vivo; no se cachea.

### Payload — sin cambios de forma

```jsonc
// admin, sin desde/hasta
{
  "code": "NAVE-PUN-04", "sede": "NAVE", "type": "punta",
  "reference_rate": 500000,       // number, o null si no hay tarifa configurada
  "occupancy": {
    "estado": "ocupado",          // disponible | contratado | vencido | ocupado
    "lease_desde": "2026-08-01", "lease_hasta": "2026-08-31",
    "se_libera_el": "2026-09-01"  // sólo con estado "ocupado"; si no, null
  }
}
```

```jsonc
// worker — "reference_rate" AUSENTE, no null
{ "code": "NAVE-PUN-04", "sede": "NAVE", "type": "punta", "occupancy": {...} }
```

Con `?desde=&hasta=`: `occupancy` pasa a `{ "estado": "libre" | "se_libera" | "tomado" }`
— sin los otros 3 campos.

Ver el detalle completo de derivación de campos, los 4 estados de HOY y los 3
de un período en el cuerpo de `services/ocupacion.py` (docstrings de
`occupancy_today`/`occupancy_range`) — no cambió de ronda 1.

---

## 2. `GET /api/dashboard/ocupacion`

**Contrato sin cambios de ronda 1 → ronda 2 en nombres ni forma de campos**
— el Maestro fue explícito: "NO cambies nombres ni forma de los campos...
sólo cambian los VALORES". Eso es exactamente lo que pasó: `ingreso_contratado`
e `ingreso_a_referencia` siguen ahí, con las mismas claves, pero ahora
**prorrateados** en vez de sumar el monto mensual completo.

Requiere `Authorization: Bearer <jwt>` de rol `admin` o `worker`.

**Query params**: `sede` (opcional, sin mayúsculas), `desde`+`hasta`
(opcionales, van juntos — sin ninguno el período es HOY). 422 si viene sólo
uno o si `desde > hasta`.

Devuelve **siempre una lista** (una fila por sede con `layout_snapshots`
guardado; con `sede=` queda en 0 o 1 elementos) — desviación ya documentada
y aceptada desde ronda 1.

```jsonc
// admin
[{
  "sede": "NAVE", "caras_comercializables": 19, "contratadas": 12,
  "montadas": 9, "vencidas": 2,
  "ocupacion_esperada_pct": 63.2, "ocupacion_real_pct": 47.4,
  "ingreso_contratado": 1100000, "ingreso_a_referencia": 1500000
}]
```

```jsonc
// worker — SIN las dos claves de plata (ausentes, no null)
[{ "sede": "NAVE", "caras_comercializables": 19, "contratadas": 12,
   "montadas": 9, "vencidas": 2,
   "ocupacion_esperada_pct": 63.2, "ocupacion_real_pct": 47.4 }]
```

`caras_comercializables`, `contratadas`, `montadas`, `vencidas`,
`ocupacion_esperada_pct`, `ocupacion_real_pct`: **fórmulas sin cambios** de
ronda 1 (ver el archivo anterior en el historial de git si hace falta el
detalle letra por letra — quedan resumidas más abajo). Lo que cambió por
completo es `ingreso_contratado`/`ingreso_a_referencia`.

### CONFLICTO-1 — el ingreso, reescrito (ronda 2)

**Antes** (ronda 1, el bug que reportó el Conciliador): `ingreso_contratado`
sumaba el `monthly_rent` COMPLETO de cualquier lease `is_active` que tocara
el período, sin prorratear. Eso producía: un contrato de un día sumando un
mes entero ($2.000.000 en vez de $66.667); dos contratos consecutivos sobre
la misma cara sumando dos meses completos por un período que entre los dos
no cubría uno; una temporada ya cerrada (lease `is_active=False` por
`expire_leases()`) reportando $0 aunque hubiera devengado toda la renta; y
como consecuencia de todo eso, un desvío de +47,1% sobre la cifra real de la
temporada vigente, con el signo invertido respecto de lo que el negocio
esperaba ver.

**Ahora**: prorrateo `/30`, la MISMA convención que ya firma
`Contrato.tsx:283` (`total = round(monthly_rent/30 * dias)`, rangos
inclusivos en los dos extremos). La fórmula:

```
ingreso_contratado = round( Σ [ monthly_rent_i × días_i ] / 30 )
```

donde `días_i` es la intersección en días (inclusiva) de cada lease elegible
con `[desde, hasta]`, y **la división por 30 se aplica UNA sola vez sobre la
suma de toda la sede** (en pesos-día) — no lease por lease. Esto es
deliberado: si se prorrateara y redondeara cada lease por separado antes de
sumar, dos contratos consecutivos sobre la misma cara podrían perder o ganar
un peso por el redondeo de cada uno; sumando primero y dividiendo una sola
vez, "dos contratos consecutivos suman sus prorrateos sin doblar" da
exactamente lo esperado.

`ingreso_a_referencia` prorratea **al mismo criterio, pero a la duración del
PERÍODO pedido** (no de un lease — no hay lease, es una tarifa de lista):

```
ingreso_a_referencia = round( Σ reference_rate_cara × período_días / 30 )
```

sumado sobre TODAS las caras comercializables (contratadas o no), para que
sea comparable número a número con `ingreso_contratado` en el mismo período.

**Elegibilidad por lease** (esto es lo nuevo, no sólo la división):
`services/ocupacion.py::_ingreso_periodo_dias` documenta los tres casos en
detalle; resumen:

1. **Vigente** (`is_active=True`): siempre cuenta, con su `end_date` tal
   cual.
2. **Temporada cerrada** (CONFLICTO-1b): `is_active=False` sin fila de
   cancelación, con `end_date` YA PASADO respecto de **HOY real** (el mismo
   día que usa `expire_leases()` — no `hasta`, el borde del período
   pedido): cuenta completo. Es el caso central: un contrato de junio, ya
   vencido y con la bandera apagada porque el mapa o los KPIs ya corrieron
   `expire_leases()` en algún otro endpoint, sigue reportando lo que
   devengó — "junio vendido" no puede volver $0.
3. **Cancelado** (CONFLICTO-1c, ver tabla nueva abajo): con fila en
   `lease_cancellations`, cuenta pero el corte es la fecha de cancelación
   (inclusive), no `end_date` — lo devengado hasta ahí no se borra, pero no
   sigue sumando después de que se canceló. Se evalúa ANTES que el caso 2
   porque un lease puede estar cancelado con `end_date` todavía en el
   futuro.

**Sin fila de cancelación, `is_active=False`, `end_date` todavía NO
pasado**: NO cuenta — es una cancelación de ANTES de que existiera
`lease_cancellations`, indistinguible de un contrato vigente cancelado ahora
mismo sin poder saber cuándo. **Limitación aceptada y documentada**, no un
intento de adivinar: el Maestro fue explícito en no pedir una solución acá
("se cuentan como vencidos" en el sentido de que reciben el mismo trato que
ya tenía cualquier lease inactivo-y-no-identificable — quedan fuera del
ingreso, igual que ya quedaban fuera antes de cualquiera de estos cambios).

### CONFLICTO-1c — tabla `lease_cancellations`

Nueva, vía `create_all()`, sin `ALTER`: `id`, `lease_id` (único, FK a
`space_leases`), `cancelled_at` (datetime, UTC). Se escribe en
`DELETE /api/spaces/{space_id}/leases/{lease_id}`, en la MISMA transacción
que el soft-delete (`lease.is_active = False`) — mismo `db.commit()`, así
que no hay ventana donde uno exista sin el otro.

**Leases cancelados ANTES de este deploy no tienen fila** — no hay forma de
llenarla retroactivamente sin inventar un dato que no se registró. Quedan
bajo la regla "sin fila, `end_date` no pasado → no cuenta" si su `end_date`
original seguía vigente al momento de cancelar, o bajo la regla de
"temporada cerrada" si su `end_date` ya había pasado de todos modos. Es la
misma ambigüedad que ya existía en `occupancy_today`/`_es_vencida` para
"vencido" (documentada desde ronda 1): el modelo no distingue "terminó solo"
de "lo bajaron antes" sin esta tabla, y sólo lo que pase DESPUÉS de este
cambio tiene el dato fino.

### Lo que queda deliberadamente SIN conciliar (hallazgo arquitectónico abierto)

El Maestro fue explícito: la parte NO accionable de CONFLICTO-1 es la
conciliación entre `space_leases` (lo normalizado, base de este endpoint) y
el JSON de `layout_snapshots` (el "Canon" que edita el 2D/3D, con su propio
`negotiatedValue` por fixture) — el modelo dual del proyecto. Este builder
**no la tocó** por instrucción directa.

Como consecuencia visible: **`GET /api/dashboard/kpis` (endpoint
preexistente, fuera de mi territorio) sigue sumando `monthly_rent` SIN
prorratear** para su `monthly_revenue` — no pasa por
`services/ocupacion.py`. Un admin que compare `/dashboard/kpis` contra
`/dashboard/ocupacion` para el mismo día va a ver dos cifras de "ingreso"
que no coinciden, a propósito: la primera es "renta mensual nominal de lo
que corre hoy", la segunda es "devengado prorrateado dentro del período
pedido". Documentado acá para que ningún agente de frontend intente
mostrarlas una al lado de la otra como si fueran la misma métrica.

---

## 3. CONFLICTO-2 (H1) — PII de proveedores redactada por rol

`SupplierPublicOut` (`schemas/spaces.py`): sólo `id` + `name`. Vía el
helper `supplier_out_for_role(supplier, role)` — admin recibe `SupplierOut`
completo (`email`, `phone`, `contact_name`, `notes` incluidos); cualquier
otro rol recibe `SupplierPublicOut`, y esas cuatro claves quedan **AUSENTES**
del JSON, no en `null`.

Alcance:

- `GET /api/suppliers/` y `GET /api/suppliers/{id}` — ya no llevan
  `response_model` fijo (un `SupplierOut` fijo reconstruye TODOS los campos
  desde el ORM al validar, así que un objeto con menos campos volvería a
  traerlos en `null` en vez de ausentes — por eso se devuelve directamente
  la instancia pydantic ya construida del tipo correcto).
- `LeaseOut.supplier` (`schemas/spaces.py`): tipo cambiado de `SupplierOut` a
  `Union[SupplierOut, SupplierPublicOut]`. Pydantic v2 serializa una Union
  por el tipo REAL de la instancia en tiempo de ejecución, así que
  `_space_out_for_role` (en `routers/spaces.py`) puede reemplazar
  `lease.supplier` por un `SupplierPublicOut` para no-admin y el campo sale
  del JSON con sólo `id`/`name` — verificado con un smoke test aparte antes
  de confiar en el mecanismo (Pydantic reconstruye por tipo declarado
  cuando el campo NO es Union, lo que habría vuelto a traer los campos en
  `null`; con Union, no).
- Esto cubre `active_lease.supplier` y `upcoming_lease.supplier` en LOS
  CUATRO endpoints que devuelven `SpaceOut` a través de
  `_space_out_for_role` (`GET /spaces/`, `GET /spaces/{id}`,
  `GET /spaces/by-svg/{svg_id}`, `GET /spaces/by-code/{code}`) — no sólo el
  que pidió el Maestro como caso de test.
- Los endpoints admin-only de `suppliers.py` (`find-or-create`, `POST /`,
  `PUT /{id}`, `DELETE /{id}`) no cambiaron: siguen devolviendo
  `SupplierOut` completo, porque sólo admin puede llegar a ellos.

## 4. CONFLICTO-3 (H2) — nota de contrato y observación del fixture

**Nota del contrato** (`routers/spaces.py`, mismo lugar donde ya se anulaba
`monthly_rent`, `_space_out_for_role`): para no-admin, `lease.notes = None`
en `active_lease` y `upcoming_lease` — misma técnica que `monthly_rent`
(clave presente, valor `null`; el Maestro pidió "anulá", no "sacá la
clave", a diferencia del caso del proveedor).

**Observación del fixture** (`routers/layout.py`,
`_redact_fixtures_for_worker`): `fixture.pop("observation", None)` en las
mismas tres profundidades donde ya se sacaba `negotiatedValue` — top,
`faceB`, cada `slot`. Acá sí se saca la clave (mismo patrón que
`negotiatedValue`, que también se popea).

Las dos cierran el mismo hallazgo del auditor: la nota/observación es donde
queda escrito lo que no entra en un campo con nombre — "descuento del 25%
cerrado por teléfono" no es un número en `monthly_rent`/`negotiatedValue`,
pero dice exactamente lo mismo. Se decide en el servidor porque avisar en el
formulario ("esto lo ve el mercaderista") no alcanza: un cliente viejo o una
llamada directa a la API la mandan igual.

`supplier.notes` queda cubierto por el punto 3 (es uno de los cuatro campos
que `SupplierPublicOut` no declara).

---

## Tests nuevos de ronda 2

- `backend/tests/test_redaction_pii.py` (10 tests): PII de proveedor
  ausente para worker en `/api/suppliers/` (listado e individual) y en
  `active_lease.supplier` de `/api/spaces/by-code/{code}`; admin ve todo;
  401 para token de montaje y sin token; nota del contrato anulada (no
  ausente) para worker vía `/api/spaces/by-code/{code}`; `observation`
  ausente en las tres profundidades vía `GET /api/layout/{sede}` — todos
  usando la cadena de la sonda del auditor ("descuento del 25% cerrado por
  telefono") como marcador de fuga.
- `backend/tests/test_dashboard_ocupacion.py`, ampliado: prorrateo a un
  período de 30 días da el monto mensual (caso ancla, reescribe el test que
  ronda 1 dejaba sin prorratear); prorrateo a medio período da la mitad;
  contrato de un día = `monthly/30` exacto (`$66.667`); temporada cerrada NO
  reporta `$0`; dos contratos consecutivos sobre la misma cara suman sus
  prorrateos sin doblar (contraste explícito contra lo que daría si
  doblara); cancelación conserva el devengado hasta `cancelled_at` (ni
  `$0`, ni el monto completo del contrato original).

## Decisiones y desviaciones — resumen para quien construye contra esto

Heredadas de ronda 1 (sin cambios): `type` normalizado en `/rates`;
`/dashboard/ocupacion` siempre lista; `ocupacion_real_pct` divide por
`caras_comercializables`; `vencidas` en el dashboard usa `hasta` como
referencia de "hoy" (no la fecha real del servidor); `vencido` (estado de
ocupación) ignora `is_active` mirando sólo `end_date`.

Nuevas de ronda 2:

1. **`ingreso_contratado`/`ingreso_a_referencia` cambiaron de VALOR, no de
   forma**: mismas claves, mismo tipo (number), ahora prorrateados. Un
   cliente que ya integró contra el contrato de ronda 1 no necesita tocar
   una línea de parseo — sólo el número que recibe va a ser distinto (y
   correcto).
2. **Dos "hoy" distintos en `ocupacion.py`, a propósito**: `_es_vencida`
   usa `hasta` (el borde del período pedido) para que `vencidas` sea
   coherente con el resto de las cifras de esa misma consulta;
   `_ingreso_periodo_dias` usa `date.today()` real para decidir si un lease
   inactivo-sin-fila-de-cancelación se cuenta como "vencido solo" — porque
   esa decisión depende de cuándo `expire_leases()` (que corre contra el
   reloj real del servidor) apagó la bandera, no de qué período se está
   consultando.
3. **`SupplierPublicOut` es la única redacción por AUSENCIA de clave** de
   esta ronda; `lease.notes` sigue el patrón por NULL que ya tenía
   `monthly_rent`. Dos técnicas distintas a propósito, siguiendo lo que pidió
   el Maestro para cada caso.
4. **Ningún desvío en las reglas duras**: sin migraciones, sin `ALTER`,
   `lease_cancellations` es tabla nueva vía `create_all()`, sin dependencias
   nuevas, `services/contratos.py` sigue importado y no reimplementado, el
   dinero nunca llega a un worker (verificado con test explícito en los
   tres frentes: `reference_rate`, `ingreso_contratado`/`ingreso_a_referencia`,
   y ahora también PII de proveedor y notas/observación).

## Para los agentes de frontend que construyen en paralelo

- Si algún cliente ya mostraba `ingreso_contratado`/`ingreso_a_referencia`
  de ronda 1 tal cual, el número que va a recibir ahora es menor (o distinto)
  para cualquier período que no sea "exactamente un mes calendario cubierto
  de punta a punta por el contrato" — es la corrección, no una regresión.
- `GET /api/suppliers/` para worker ahora devuelve objetos con sólo
  `{id, name}`. Si algún flujo de worker leía `email`/`phone` de ahí, ese
  flujo ya estaba mostrando datos que el rol no debía ver — no hay forma
  correcta de "seguir funcionando igual" para ese caso.
- La misma detección de clave-ausente-no-null que ya valía para
  `reference_rate` vale ahora para `email`/`phone`/`contact_name`/`notes`
  del proveedor: `"email" in proveedor`, nunca `proveedor.email != null`.
- `lease.notes` (dentro de `active_lease`/`upcoming_lease` de `SpaceOut`) y
  `fixture.observation`/`faceB.observation`/`slot.observation` (dentro del
  layout) siguen dos convenciones DISTINTAS entre sí: la primera es
  `null`-si-no-admin (clave presente), la segunda es clave AUSENTE. No
  asumir que todo lo redactado se comporta igual.
