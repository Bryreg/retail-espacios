# Auditoría legal / privacidad — qué precio ve cada rol

**Feature:** Vitrinas 3D con tarifas de referencia · **Repo:** `/tmp/retail-espacios-test` ·
rama `claude/sistemas-maestros-retail-mzb1om` · **Cierre:** 2026-09-03 17:09 UTC
**Ronda:** 2 (re-auditoría tras los fixes de backend de los conflictos 2, 3 y 4).
**Alcance:** read-only. No se tocó una línea de código del producto.

---

## Veredicto de un vistazo

| # | Hallazgo | Rol | Severidad ronda 1 | Estado ronda 2 |
|---|---|---|---|---|
| **H1** | PII del proveedor (email/teléfono/contacto/notas) entera al worker | worker | bloqueante | **CERRADO** |
| **H2** | `lease.notes` y `fixture.observation` sin redactar | worker | bloqueante | **CERRADO** |
| **H5** | `/spaces/{code}/rates` sin `Cache-Control: no-store` | admin→worker | advertencia | **CERRADO** |
| **H3** | `top_suppliers` viaja **ordenado por plata** al worker | worker | advertencia | **PENDIENTE** |
| **H4** | `/kpis` manda `0.0` donde los endpoints nuevos mandan ausencia | worker | advertencia (diseño) | **PENDIENTE** |
| **H6** | Lista negra en `layout.py` / `spaces.py` donde el resto usa lista blanca | — | advertencia (diseño) | **PENDIENTE (mitigado a medias)** |
| **H7** | El correo de montaje de la **tanda** no lleva enlace firmado | mercaderista | advertencia | **PENDIENTE** |
| **H8** | Un contrato escaneado en JPG es descargable por el worker | worker | advertencia | **PENDIENTE** |
| **H9** | Recuadro «Tarifa de referencia» vacío para rol sin tarifa | — | nota | **PENDIENTE** |
| **N1** | Huecos de cobertura de tests sobre lo recién cerrado | — | nota nueva | abierto |
| **N2** | Tipos del cliente desalineados con la respuesta redactada | — | nota nueva | abierto |
| **N3** | `test_clientes.py` intermitente — **preexistente, no es de esta feature** | — | nota nueva | abierto |

**Fugas residuales bloqueantes: ninguna.** Las tres que había están cerradas y verificadas
en caliente con las tres credenciales. Todo lo demás son advertencias abiertas para
decisión del maestro.

---

## Método (ronda 2)

Idéntico al de la ronda 1, con la misma semilla, para que los dos informes se comparen
renglón a renglón:

1. **Sonda en caliente.** Arnés equivalente al de `backend/tests/conftest.py` (SQLite
   descartable, `ADMIN_PASSWORD` / `WORKER_PASSWORD` por entorno), levantado desde un
   script fuera del repo. Semilla: plano `NAVE` con cuatro muebles (uno no comercializable),
   tarifa de referencia `punta = $2.000.000` y `gondola = $900.000`, contrato vigente de
   `$1.500.000`, contrato **próximo** de `$777.000`, proveedor `Alpina` con
   `contact_name`, `phone`, `email` y `notes`, y la **cadena canaria**
   `descuento del 25% cerrado por telefono` sembrada en `lease.notes`, en
   `fixture.observation`, en `faceB.observation` y en `slots[0].observation`.
   Cada endpoint se pidió con **admin**, **worker**, **token de montaje** y **sin token**.
   Todos los cuerpos citados abajo son respuestas reales.
2. **Barrido dinámico de rutas** con el token de montaje, recorriendo `app.routes` en vivo
   (mismo algoritmo que `test_montaje_enlace.py:114-158`), enumerado ruta por ruta.
3. **Lectura de código** para los caminos que la sonda no ejecuta: correos, `localStorage`,
   la lámina exportada.
4. **La suite**, corrida completa varias veces, y contra un `git archive HEAD` desplegado
   aparte para separar regresión de flakiness preexistente.

**Nota de sincronía.** Al arrancar esta ronda el árbol todavía se estaba escribiendo
(`builder-rates-api` commiteando los fixes). Se esperó a que no hubiera cambios por más de
dos minutos (última escritura 16:27 UTC) y **toda** la evidencia de abajo se tomó después
de ese punto, con el árbol quieto hasta el cierre (17:09 UTC).

---

## (a) Matriz endpoint × rol × campo de dinero — estado final

Leyenda: **ausente** = la clave no está en el JSON · **null** = la clave está, vacía ·
**0.0** = la clave está, en cero · **✓** = llega el valor real · **401/403** = no entra.

### Endpoints NUEVOS de esta feature

| Endpoint | Campo | admin | worker | token montaje | sin token |
|---|---|---|---|---|---|
| `GET /api/spaces/{code}/rates` | `reference_rate` | ✓ `2000000.0` | **ausente** | 401 | 401 |
| | `Cache-Control` | `no-store, max-age=0` | `no-store, max-age=0` | 401 | 401 |
| | `code` / `sede` / `type` | ✓ | ✓ | 401 | 401 |
| | `occupancy.estado` | ✓ | ✓ | 401 | 401 |
| | `occupancy.lease_desde/hasta/se_libera_el` | ✓ | ✓ (fechas) | 401 | 401 |
| `GET /api/dashboard/ocupacion` | `ingreso_contratado` | ✓ `50000` | **ausente** | 401 | 401 |
| | `ingreso_a_referencia` | ✓ `193333` | **ausente** | 401 | 401 |
| | `caras_comercializables` / `contratadas` / `montadas` / `vencidas` | ✓ | ✓ | 401 | 401 |
| | `ocupacion_esperada_pct` / `ocupacion_real_pct` | ✓ | ✓ | 401 | 401 |

Cuerpos textuales de la sonda:

```
ADMIN   /api/spaces/NAVE-PUN-04/rates -> 200  Cache-Control=no-store, max-age=0
{"code":"NAVE-PUN-04","sede":"NAVE","type":"punta",
 "occupancy":{"estado":"ocupado","lease_desde":"2026-09-03","lease_hasta":"2026-10-13",
              "se_libera_el":"2026-10-14"},
 "reference_rate":2000000.0}

WORKER  /api/spaces/NAVE-PUN-04/rates -> 200  Cache-Control=no-store, max-age=0
{"code":"NAVE-PUN-04","sede":"NAVE","type":"punta",
 "occupancy":{"estado":"ocupado","lease_desde":"2026-09-03","lease_hasta":"2026-10-13",
              "se_libera_el":"2026-10-14"}}

WORKER  /api/dashboard/ocupacion -> 200
[{"sede":"NAVE","caras_comercializables":4,"contratadas":1,"montadas":0,"vencidas":0,
  "ocupacion_esperada_pct":25.0,"ocupacion_real_pct":0.0}]
```

Las dos claves de dinero **no viajan en null: no existen**. Lista blanca explícita en
`backend/app/routers/spaces.py:333-334` (`if role == "admin": payload["reference_rate"] = …`)
y en `backend/app/services/ocupacion.py:414-416` (`if include_money: out["ingreso_…"] = …`,
con `include_money = role == "admin"` desde `backend/app/routers/dashboard.py:184`).
Además `ocupacion.py:377-378` ni siquiera **lee** la tabla de tarifas ni la de cancelaciones
cuando el rol no es admin: el dato no se carga en memoria en el proceso que atiende a un worker.

### Endpoints preexistentes que tocan dinero o PII

| Endpoint | Campo | admin | worker | token montaje | sin token |
|---|---|---|---|---|---|
| `GET /api/layout/rates` | `default` / `by_sede` | ✓ | **403** | 401 | 401 |
| `PUT /api/layout/rates` | — | ✓ | 403 | 401 | 401 |
| `GET /api/layout/{sede}` | `fixture.negotiatedValue` | ✓ `1500000` | **ausente** | 401 | 401 |
| | `faceB.negotiatedValue`, `slots[].negotiatedValue` | ✓ | **ausente** | 401 | 401 |
| | `fixture.observation` (+ `faceB`, `slots[]`) | ✓ | **ausente ← CERRADO (H2)** | 401 | 401 |
| `GET /api/layout/` (todas) | idem | ✓ | ausente | 401 | 401 |
| `GET /api/spaces/` · `/{id}` · `/by-code/{code}` · `/by-svg/{id}` | `active_lease.monthly_rent` | ✓ | **null** | 401 | 401 |
| | `upcoming_lease.monthly_rent` | ✓ | null | 401 | 401 |
| | `active_lease.notes` · `upcoming_lease.notes` | ✓ | **null ← CERRADO (H2)** | 401 | 401 |
| | `…lease.supplier.{email,phone,contact_name,notes}` | ✓ | **ausente ← CERRADO (H1)** | 401 | 401 |
| | `…lease.supplier.{id,name}` | ✓ | ✓ | 401 | 401 |
| `GET /api/spaces/map` | `supplier_name` | ✓ | ✓ | 401 | 401 |
| `GET /api/suppliers/` · `/{id}` | `email` / `phone` / `contact_name` / `notes` | ✓ | **ausente ← CERRADO (H1)** | 401 | 401 |
| | `id` / `name` | ✓ | ✓ | 401 | 401 |
| `GET /api/dashboard/kpis` | `monthly_revenue` | ✓ | **0.0 (H4)** | 401 | 401 |
| | `top_suppliers[].revenue` | ✓ | 0.0 | 401 | 401 |
| | `top_suppliers[]` **orden** | ✓ | **✓ ordenado por plata (H3)** | 401 | 401 |
| `GET /api/dashboard/spaces` | `lease.monthly_rent` | ✓ | null | 401 | 401 |
| `POST /api/leases/bulk/validar` | `referencia`, aviso «N% por debajo de la tarifa ($X)» | ✓ | **403** | 401 | 401 |
| `POST /api/leases/bulk/confirmar` | idem | ✓ | 403 | 401 | 401 |
| `POST /api/spaces/{id}/leases` | crea con `monthly_rent`; devuelve `avisos` | ✓ | **403** | 401 | 401 |
| `DELETE /api/spaces/{id}/leases/{id}` | registra `LeaseCancellation` | ✓ (204) | **403** | 401 | 401 |
| `GET /api/files/{id}` | contrato en PDF | ✓ | **404 (tachado)** | 401 | 401 |
| | contrato escaneado en JPG/PNG/WEBP | ✓ | **✓ (H8)** | 401 | 401 |
| `GET /api/bitacora/` | quién descargó qué | ✓ | **403** | 401 | 401 |
| `GET /api/montaje/mi-espacio` | cualquier monto | — | — | **ausente por diseño** | 401 |
| | `vecinos[]` | — | — | sólo `_GEOMETRIA` | 401 |

Confirmaciones puntuales, con línea (árbol actual):

- La redacción de `monthly_rent`, `notes` y `supplier` cubre **las dos** puntas del contrato,
  vigente y próximo: `backend/app/routers/spaces.py:41-54` (bucle
  `for lease in (out.active_lease, out.upcoming_lease)`). Verificado en caliente sobre
  `upcoming_lease` con un contrato que arranca dentro de diez días — ver H1/H2.
- `/api/layout/rates` **403 para worker en el GET**, no sólo en el PUT:
  `backend/app/routers/layout.py:362` y `:392`, los dos con `dependencies=[Depends(require_admin)]`.
- La redacción de `negotiatedValue` y `observation` es un `pop`, no un cero:
  `backend/app/routers/layout.py:91-102`, en las tres profundidades.
- El token de montaje no llega a **ningún** endpoint de estas tablas: `decode_token`
  (`backend/app/auth.py`) no reconoce el rol `montaje`, así que `require_auth` lo rechaza
  antes de mirar nada. Cerrado por defecto, tal como lo describe `docs/ESTADO.md`.
- `POST` y `DELETE` de contratos siguen exigiendo admin: sonda `403` para worker y `401`
  para el token de montaje en los dos.

### Barrido dinámico de rutas con el token de montaje — enumerado

Recorriendo `app.routes` en vivo, con el mismo relleno de parámetros que usa el test:

```
OK-401  /api/spaces/map                    OK-401  /api/layout/
OK-401  /api/spaces/                       OK-401  /api/layout/revisions
OK-401  /api/spaces/face-images            OK-401  /api/layout/settings
OK-401  /api/spaces/{space_id}             OK-401  /api/layout/seasons
OK-401  /api/spaces/by-svg/{svg_id}        OK-401  /api/layout/rates
OK-401  /api/spaces/by-code/{code}         OK-401  /api/layout/{sede}
OK-401  /api/spaces/{code}/rates   ← NUEVO OK-401  /api/layout/{sede}/impact
OK-401  /api/suppliers/                    OK-401  /api/spaces/{space_id}/files
OK-401  /api/suppliers/{supplier_id}       OK-401  /api/files/{file_id}
OK-401  /api/dashboard/kpis                OK-401  /api/notifications/config
OK-401  /api/dashboard/spaces              OK-401  /api/notifications/contacts
OK-401  /api/dashboard/ocupacion  ← NUEVO  OK-401  /api/notifications/recipients
OK-401  /api/mounts/                       OK-401  /api/mounts/files/{file_id}/exists
OK-401  /api/leases/{lease_id}/planometria OK-401  /api/planometrias/por-espacio/{space_code}
OK-401  /api/planometrias/{file_id}        OK-401  /api/catalogo/
OK-401  /api/catalogo/{arte_id}/imagen     OK-401  /api/bitacora/
OK-401  /api/bitacora/acciones

TOTAL BARRIDAS: 33   (el test exige >= 27)
NO-401: ninguna
```

Los dos endpoints nuevos entran por nombre, no por suerte: el relleno `"code": "NAVE-PUN-04"`
resuelve el parámetro de `/api/spaces/{code}/rates`, así que no se saltó en silencio.
`GET /api/suppliers/` y `/{supplier_id}` —los dos que cambiaron de firma en esta ronda—
siguen contestando 401, o sea que sacarles el `response_model` no les aflojó la dependencia
de router (`backend/app/routers/suppliers.py:10`).

### Cliente y artefactos que salen de la pantalla

| Superficie | Qué lleva de plata | Estado |
|---|---|---|
| `localStorage` clave `retail-fixtures-v1` | `referenceRates` | **fuera del `partialize`** — `frontend/src/store/fixtureStore.ts:1095-1112`, con el comentario que lo explica en `:1110-1111` |
| Login de worker | `referenceRates` | **forzado a `null`** — `fixtureStore.ts:1004-1006`, incluso si quedó de un admin en la misma pestaña |
| Fetch de tarifas | — | un worker **ni siquiera pide** el endpoint — `fixtureStore.ts:836-838` (`loadRates` corta en `canWrite()`) |
| Lámina antes/después (PNG) | `valorMensual` | **tachado para worker** — `StoreEditor3D.tsx:5286` (`isAdmin ? (uf.negotiatedValue \|\| null) : null`) |
| Lámina, pie | tarifa de referencia / desvío | **no van** — no figuran en el objeto `datos` |
| Correo de montaje, alta de a uno | ningún monto | `spaces.py:489-495`: Sede · Espacio · Dónde queda · Qué va · Desde · Hasta, y el enlace firmado de `:510` |
| Correo de montaje, tanda | ningún monto | `bulk_leases.py:455-458`: código + proveedor + fecha de arranque (ver **H7** por el enlace) |
| Correo al comercial (tanda) | `Total mensual` | ✓ a propósito — `bulk_leases.py:446` |
| Correo al proveedor | `Valor mensual` | ✓ a propósito — es su propio contrato |
| Aviso de vencimiento | `Valor mensual` | sólo a `recipients_for(...)["comercial"]` — `backend/app/services/reminders.py:118,130` |
| Pestañas visibles | — | worker sólo ve **Sede** y **Montajes**: `frontend/src/pages/Dashboard.tsx:684-686`. Ni Plano ni Editor 3D |

---

## (b) Hallazgos — veredicto por hallazgo

### H1 — BLOQUEANTE → **CERRADO** · PII del proveedor

**Criterio de cierre pedido:** para worker, `email` / `phone` / `contact_name` / `notes`
**AUSENTES (no null)** en `GET /api/suppliers/`, `GET /api/suppliers/{id}` y en el
`supplier` anidado de `active_lease`/`upcoming_lease` en `/api/spaces/` · `/{id}` ·
`/by-code/{code}` · `/by-svg/{id}`; y regresión: admin sigue viendo la PII completa.

**Cumple los seis puntos.** Evidencia nueva:

- `backend/app/schemas/spaces.py:25-37` — `SupplierPublicOut` declara **sólo** `id` y `name`.
  Es **lista blanca**: nada más que lo declarado viaja.
- `backend/app/schemas/spaces.py:40-51` — `supplier_out_for_role(supplier, role)` devuelve
  `SupplierOut` para admin y `SupplierPublicOut` para cualquier otro rol («worker, o lo que
  se agregue mañana», dice el docstring — el default correcto).
- `backend/app/routers/suppliers.py:13-22` y `:61-67` — las dos rutas de lectura pasan por
  ese helper. El `response_model=list[SupplierOut]` se **quitó a propósito**: con él,
  Pydantic revalidaba campo por campo desde el ORM y habría devuelto los cuatro campos en
  `null` en vez de ausentes. El comentario de `:13-19` lo explica; la sonda lo confirma.
- `backend/app/routers/spaces.py:54` — el `supplier` anidado se reemplaza por
  `SupplierPublicOut.model_validate(...)` dentro del bucle que ya cubre las **dos** puntas
  del contrato (`:41`).
- `backend/app/schemas/spaces.py:93` — `LeaseOut.supplier: Union[SupplierOut, SupplierPublicOut]`.
  Ese cambio de tipo es lo que hace que Pydantic serialice por el tipo **real** de la
  instancia; sin él la Union no existiría y el `SupplierPublicOut` se habría vuelto a
  ensanchar al serializar.

**Sonda en caliente (árbol quieto):**

```
ADMIN  /api/suppliers/ -> 200
[{"name":"Alpina","contact_name":"Ana Ruiz","phone":"3001234567",
  "email":"ventas@alpina.example","notes":"acordado 1.500.000 con 3 meses","id":1},
 {"name":"Nutresa","contact_name":"Beto Paz","phone":"3009999999",
  "email":"compras@nutresa.example","notes":null,"id":2}]

WORKER /api/suppliers/ -> 200
[{"id":1,"name":"Alpina"},{"id":2,"name":"Nutresa"}]

WORKER /api/suppliers/1 -> 200
{"id":1,"name":"Alpina"}

WORKER /api/spaces/by-code/NAVE-PUN-04 -> 200
… "active_lease":{ … "supplier":{"id":1,"name":"Alpina"}, …}

WORKER /api/spaces/by-code/NAVE-PUN-05 -> 200      ← contrato PRÓXIMO
… "upcoming_lease":{ … "supplier":{"id":1,"name":"Alpina"}, …}
```

Y las cuatro rutas de espacio verificadas una por una con worker — `/api/spaces/`,
`/api/spaces/{id}`, `/api/spaces/by-code/{code}`, `/api/spaces/by-svg/{id}` — más un barrido
de agujas sobre **el texto completo** de diecinueve respuestas de worker
(`ventas@alpina.example`, `3001234567`, `Ana Ruiz`, la nota del proveedor): **cero
apariciones en todas**. Regresión de admin: la PII completa sigue llegando en las cinco
rutas, comprobado arriba y fijado por `backend/tests/test_redaction_pii.py:95-106` y `:138-141`.

**Fijado por tests:** `backend/tests/test_redaction_pii.py:109-116` (listado, exige
`clave not in fila` — ausencia, no null), `:119-124` (por id, exige el cuerpo exacto
`{"id":…,"name":"Alpina"}`), `:127-141` (anidado + regresión de admin),
`:144-154` (401 para token de montaje y para sin token).

---

### H2 — BLOQUEANTE → **CERRADO** · `lease.notes` y `fixture.observation`

**Criterio de cierre pedido:** la cadena canaria `descuento del 25% cerrado por telefono`
no viaja al worker en `/api/spaces/by-code/{code}` ni en `GET /api/layout/{sede}` en las
**tres** profundidades (top, `faceB`, `slots`).

**Cumple.** Evidencia nueva:

- `backend/app/routers/spaces.py:50` — `lease.notes = None`, dentro del mismo bucle que
  cubre `active_lease` y `upcoming_lease`.
- `backend/app/routers/layout.py:94`, `:98`, `:102` — `pop("observation", None)` en las
  tres profundidades, al lado de cada `pop("negotiatedValue", None)` que ya estaba.

**Sonda en caliente, con la canaria sembrada en los cuatro lugares:**

```
GET /api/layout/NAVE
  ADMIN    200  canaria=True   observation=True   negotiatedValue=True   len=1008
  WORKER   200  canaria=False  observation=False  negotiatedValue=False  len=752
     fixture[0] claves: ['code','color','cx','cz','d','h','id','label','rotY','sede','type','w']
     faceB claves:      ['code']
     slots[0] claves:   ['code']
  MONTAJE  401
  ANON     401

GET /api/layout/   (todas las sedes)
  ADMIN 200 canaria=True   ·  WORKER 200 canaria=False  ·  MONTAJE 401  ·  ANON 401

WORKER /api/spaces/by-code/NAVE-PUN-04 -> 200
… "active_lease":{ … "monthly_rent":null,"notes":null, … }
WORKER /api/spaces/by-code/NAVE-PUN-05 -> 200
… "upcoming_lease":{ … "monthly_rent":null,"notes":null, … }
```

La búsqueda es sobre el **texto entero** de la respuesta, no sobre las claves que yo
esperaba: si la canaria hubiera salido por un camino que no nombré, `canaria=True` la
habría delatado. Sale `False` en las dos rutas de layout y en las cuatro de espacio.

**Diferencia de convención, anotada sin severidad.** La PII queda **ausente** (lista blanca)
y `notes` queda en **null** (lista negra sobre un campo `Optional`). Las dos cumplen el
criterio —el contenido no viaja— pero son dos convenciones distintas en la misma respuesta.
Es exactamente la tensión de **H6**; la anoto acá para que el maestro la vea junta.

**Origen del dato, para que la corrección se entienda completa:** el **mismo** campo «Nota»
del formulario de contrato se escribe en los dos destinos —
`frontend/src/components/Contrato/Contrato.tsx:350` (`nota` → `lease.notes` por la tanda) y
`:379` (`observation` → JSON del layout) — desde un textarea rotulado «Nota» con placeholder
«Algo que haya que saber de este acuerdo» (`:851-855`). El fix es server-side, que es lo
correcto: la advertencia en el formulario no habría cubierto ni un cliente viejo ni una
llamada directa a la API.

**Fijado por tests:** `backend/tests/test_redaction_pii.py:160-176` (nota: admin la ve,
worker recibe `None` **y** `SONDA not in r.text`) y `:182-202` (observación en las tres
profundidades, con la misma comprobación de texto completo).

---

### H5 — ADVERTENCIA → **CERRADO** · `Cache-Control: no-store` en el endpoint nuevo

**Criterio de cierre pedido:** header `Cache-Control: no-store` presente en
`GET /api/spaces/{code}/rates`.

**Cumple.** `backend/app/routers/spaces.py:299` —
`response.headers["Cache-Control"] = "no-store, max-age=0"`, con `response: Response`
agregado a la firma en `:268`. Es el **mismo valor exacto** que usa `_no_store`
(`backend/app/routers/layout.py:164-165`) para `/layout/rates`, así que los dos hermanos
que sirven la misma tarifa ahora se comportan igual.

**Sonda en caliente:** `Cache-Control=no-store, max-age=0` en la respuesta de **admin y de
worker** (verificado arriba, en la matriz). Que también salga para worker es lo deseable:
la ocupación es un dato en vivo y no conviene que un navegador la sirva vieja.

Cierra el escenario que lo motivaba: el admin usa el equipo del back-office, cierra sesión,
y a la hora entra la mercaderista con la clave compartida de worker; la respuesta con
`"reference_rate": 2000000.0` ya no queda cacheable en ese navegador. (Sigue sin haber
caché de proxy delante: `nginx/` no define `proxy_cache` ni `expires`.)

**No fijado por ningún test** — ver **N1**.

---

### H3 — ADVERTENCIA · **PENDIENTE** · El ranking de proveedores por plata viaja ordenado al worker

**Archivo:** `backend/app/routers/dashboard.py:67` (`.order_by(func.sum(SpaceLease.monthly_rent).desc())`)
y `:83-88` (se ponen los importes en `0.0` pero **la lista conserva el orden**).

**Rol afectado:** `worker`. **Sin cambios respecto de la ronda 1.**

**Evidencia en caliente (ronda 2):**

```
ADMIN  /api/dashboard/kpis -> 200
… "monthly_revenue":1500000.0,"top_suppliers":[{"name":"Alpina","leases":1,"revenue":1500000.0}]
WORKER /api/dashboard/kpis -> 200
… "monthly_revenue":0.0,"top_suppliers":[{"name":"Alpina","leases":1,"revenue":0.0}]
```

Con un solo proveedor no se nota; con los cinco de una sede real, la lista **es** el ranking
de quién le paga más a la tienda, más `leases` por cada uno.

**Escenario concreto.** El worker pide `/api/dashboard/kpis` y obtiene, sin ninguna cifra,
el orden `Nutresa > Alpina > Colanta > …`. Es información **derivada del dinero**: no da el
monto, da la jerarquía comercial de la sede — que es lo que se le vende a un competidor y lo
que se usa para negociar. No hace falta despejar nada: la ordenación *es* el dato.
Cruzándolo con `GET /api/spaces/map` (que le da `supplier_name` por espacio, sin distinguir
rol) y `/api/dashboard/spaces` (fechas por espacio), reconstruye qué proveedor tiene qué y
en qué orden de importancia paga.

**El hueco, con precisión:** el `order_by` es de la consulta, no de la redacción; tacharlo
requiere decidir si el worker necesita `top_suppliers` en absoluto. Decisión del maestro.

---

### H4 — ADVERTENCIA (diseño) · **PENDIENTE** · `kpis` manda `0.0` donde los endpoints nuevos mandan ausencia

**Archivos:** `backend/app/routers/dashboard.py:80` (`"monthly_revenue": monthly_revenue if is_admin else 0.0`)
y `:86` (`"revenue": … if is_admin else 0.0`), contra `backend/app/services/ocupacion.py:414-416`
(omite la clave) y `backend/app/routers/spaces.py:333-334` (idem).

Tres convenciones para lo mismo dentro del mismo backend, y ahora **cuatro** contando el
`notes: null` de H2. La convención nueva —omitir— es la correcta y `docs/ESTADO.md` explica
por qué: un `$0` hace parecer quebrada a la sede, y cualquier consumidor que no sepa de la
redacción lo suma, lo grafica o lo promedia. Hoy nadie lo dibuja (la franja del worker cuenta
espacios, no pesos), pero el contrato de la API sigue diciendo «la sede factura cero».
**No es fuga.** Es la inconsistencia por la que mañana alguien construye un panel sobre el cero.

La sección de ocupación que aterrizó en esta feature demuestra el patrón correcto — ver la
adenda al final.

---

### H6 — ADVERTENCIA (diseño) · **PENDIENTE, mitigado a medias**

**A favor (lista blanca, correcto) — y creció en esta ronda:**

- `backend/app/routers/montaje.py:42-45` `_GEOMETRIA` + `:121-122` `_solo_geometria`.
- Los dos endpoints nuevos: `spaces.py:328-334` arma `payload` desde cero;
  `ocupacion.py:405-416` arma `out` desde cero.
- **NUEVO:** `backend/app/schemas/spaces.py:25-37` `SupplierPublicOut` — un campo que se
  agregue mañana a `Supplier` (un `whatsapp`, un `nit`, un `cupo_credito`) **nace redactado**
  para todo rol que no sea admin. Este es el patrón que el proyecto debería generalizar,
  y el fix de H1 lo instaló donde más se necesitaba.

**En contra (lista negra) — sigue igual:**

- `backend/app/routers/layout.py:91-102` — quita **cinco** claves nombradas (ahora seis
  `pop`, contando `observation` en tres profundidades) de un dict que sale íntegro de
  `json.loads`. **Todo** campo comercial nuevo del `UnifiedFixture` nace filtrado al worker.
- `backend/app/routers/spaces.py:43` y `:50` — `monthly_rent = None`, `notes = None`: anulan
  atributos nombrados de un modelo Pydantic que expone todo lo demás.

**Escenario concreto.** El próximo agente que agregue al fixture un `costoMontaje`, un
`descuentoPct` o un `margenObjetivo` —los tres naturales en esta feature— no tiene que hacer
nada mal para filtrarlo: le alcanza con no acordarse de `_redact_fixtures_for_worker`. La
prueba de que el olvido ocurre es que **ya ocurrió dos veces**: `observation` y `notes`, en
un repo donde la regla está escrita en `CLAUDE.md`. Los dos se cerraron en esta ronda; el
mecanismo que los dejó pasar no cambió.

Lo señalo como hallazgo de diseño **aunque hoy no filtre nada**, que es lo que pide el encargo.

---

### H7 — ADVERTENCIA · **PENDIENTE** · El correo de montaje de la TANDA no lleva enlace firmado

**Archivos:** `backend/app/routers/bulk_leases.py:459-462` — el pie del correo al
mercaderista es `<a href="{app_base_url()}/">Abrir RECABRA</a>`, **sin token**;
`grep -rn create_mount_token backend/app/` devuelve **un solo uso**, en
`backend/app/routers/spaces.py:510` (el alta de a uno).

**Rol afectado:** la mercaderista, empujada de vuelta al rol `worker`.

**Escenario concreto.** `docs/ESTADO.md` § «El contrato multiespacio» dice que el contrato de
varios espacios **se guarda por el camino de la tanda**, `POST /leases/bulk/confirmar`. O sea:
todo contrato multiespacio —y toda planilla de temporada, que es el caso volumétrico— manda a
la mercaderista un correo sin `?t=`. Del otro lado hay un login, y para pasarlo tiene que usar
la **contraseña compartida de worker**.

**Lo que cambió en esta ronda:** lo que encuentra del otro lado ahora es **menos**. Con los
fixes de H1 y H2, entrar como worker ya no le entrega la libreta de proveedores ni las notas
de contrato. Le sigue entregando el mapa de las tres sedes, la tabla por espacio, el ranking
ordenado de `top_suppliers` (H3) y las imágenes de `space_files` (H8). El agujero es más
chico, pero el mecanismo intacto: el diseño «cerrado por defecto» del token de montaje —que
esta auditoría verificó dos veces que funciona— **se elude por el flujo normal de trabajo** en
cuanto el contrato tiene más de un espacio.

---

### H8 — ADVERTENCIA · **PENDIENTE** · Un contrato escaneado como imagen es descargable por el worker

**Archivos:** `backend/app/routers/files.py:60` (`IMAGENES = {"image/jpeg","image/png","image/webp"}`),
`:63-64` (`_es_documento` = «no está en esa lista»), `:67-68` (`_puede_ver` = `admin or not documento`),
aplicado en `:142` (listado) y `:158` (descarga).

**Rol afectado:** `worker`. **Token de montaje:** cerrado (401 en el barrido; la planometría
llega por `/api/montaje/planometria`, resuelta **desde el token**).

**Escenario concreto.** El filtro parte por **tipo de contenido**, no por intención, y el
propio repo documenta que el caso ocurre: `backend/app/models/models.py` cita «el contrato
escaneado en JPG» como una de las razones por las que hubo que sacar las artes de
`space_files`. Un contrato fotografiado con el celular y subido al espacio se clasifica como
imagen, aparece en `GET /api/spaces/{id}/files` para el worker y se descarga por
`GET /api/files/{id}` con la cifra a la vista. La bitácora tampoco lo registra: sólo anota
las descargas de **documentos**.

Preexistente. La mitigación por content-type es la correcta para las fotos de montaje; el
hueco es que no hay forma de marcar «esta imagen es un documento».

---

### H9 — NOTA · **PENDIENTE** · El recuadro «Tarifa de referencia» se dibuja vacío para un rol sin tarifa

**Archivo:** `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx:4785`
(condición `rentable && (ratesA || ratesB)`) + `:4418-4455` (`TarifaCara`).

Para un rol no-admin, `getSpaceRates` devuelve **200 con objeto** (sin `reference_rate`), así
que `ratesA` no es `null` y el recuadro se dibuja: título «💲 Tarifa de referencia» y, adentro,
sólo la línea de ocupación. **No hay fuga** —`TarifaCara:4439` gatea la cifra con `ref != null`
y `:4444` gatea el desvío con `desvioPct !== null`, que exige `ref` **y** `negotiatedValue`— pero
el rótulo promete un dato que no está. Hoy es inalcanzable: el worker no ve la pestaña «Editor 3D»
(`frontend/src/pages/Dashboard.tsx:684-686`). Queda anotado para atar la condición a
`ratesA?.reference_rate != null` si alguna vez se le abre el 3D a un rol de sólo lectura.

---

### N1 — NOTA NUEVA · Huecos de cobertura sobre lo que se acaba de cerrar

El comportamiento de hoy es correcto (sonda en caliente), pero tres cosas no quedaron fijadas
por ningún test, así que pueden volver sin que nadie se entere:

| Qué | Verificado en caliente | Test que lo fije |
|---|---|---|
| `Cache-Control: no-store` en `/spaces/{code}/rates` (**H5**) | sí | **ninguno** — `grep -n "no-store\|Cache-Control" backend/tests/*.py` no devuelve nada |
| `supplier` redactado en `/api/spaces/`, `/{id}` y `/by-svg/{id}` | sí, las tres | `test_redaction_pii.py:127-141` sólo cubre `/by-code/{code}` |
| `supplier` y `notes` redactados en **`upcoming_lease`** | sí | ninguno — los tests usan sólo contratos vigentes |

Los tres son de una línea de test cada uno. Lo señalo porque **H5 nació de que el hermano
nuevo no copió una protección del viejo**: la misma clase de olvido, sin red que lo atrape.

---

### N2 — NOTA NUEVA · Los tipos del cliente no acompañan la redacción

`frontend/src/types/index.ts:6-13` declara `Supplier` con `contact_name`, `phone`, `email` y
`notes` como claves **presentes** (`string | null`), y `:23` declara `Lease.monthly_rent: number`
no anulable. El backend ahora manda esas cuatro claves **ausentes** y `monthly_rent` en `null`
para worker. `npx tsc --noEmit` pasa limpio (exit 0) porque nadie las lee: el único consumo de
`contact_name`/`phone`/`email` es `frontend/src/components/SpacePanel/SpacePanel.tsx:471-477`,
y ahí salen de un `useState` local de formulario (`:110`), no de un proveedor traído del servidor.

**No es fuga y no rompe nada hoy.** Es que el tipo miente sobre la forma real de la respuesta:
el compilador no va a avisar el día que alguien escriba `supplier.email` en una pantalla que el
worker sí ve. El patrón correcto ya existe en este mismo repo, escrito en esta feature:
`frontend/src/api/spaces.ts:97-103` declara `reference_rate?: number` — **opcional**, que es lo
que obliga a chequear presencia. Decisión del maestro sobre a quién le toca alinearlo.

---

### N3 — NOTA NUEVA · La suite tiene un intermitente PREEXISTENTE, ajeno a esta feature

En la primera corrida de esta ronda fallaron tres tests. Se investigó antes de reportar:

- **`backend/tests/test_clientes.py` es intermitente en `HEAD` sin tocar.** Se desplegó un
  `git archive HEAD` limpio en otro directorio y falla ahí también, con errores de SQLAlchemy
  y **un conjunto distinto de tests en cada corrida** (`test_el_trabajador_tampoco_cruza_de_cliente`
  sola; después `test_lo_de_un_supermercado_no_aparece_en_el_otro` +
  `test_el_cliente_nuevo_arranca_vacio` + `test_la_lista_es_publica_pero_no_cuenta_nada`).
  Es flakiness del arnés multi-cliente (motores SQLite por archivo), **no una regresión**.
- **`test_dashboard_ocupacion.py::test_temporada_cerrada_no_reporta_cero`** falló una vez
  (`assert fila["vencidas"] == 1` → `0`) y pasó 5/5 corriendo el archivo solo, y en todas las
  corridas completas posteriores. Arrastrado por el mismo intermitente. **No es de privacidad**
  —es la cuenta de `vencidas`— así que lo dejo señalado para el contador / el builder, no lo
  clasifico yo.

**Estado final de la suite:** tres corridas completas seguidas del árbol actual, `exit=0`,
**276 tests, 0 fallos**. Los cuatro archivos que tocan esta feature —`test_redaction_pii.py` (10),
`test_space_rates.py` (23), `test_dashboard_ocupacion.py` (22), `test_montaje_enlace.py` (23)—
pasan los 78, repetidos, incluido el barrido de 33 rutas.

---

### La tabla `lease_cancellations` — auditada, no abre nada

El builder agregó `LeaseCancellation` (`backend/app/models/models.py:293-315`, tabla nueva
—no una columna en `space_leases`— tal como manda la regla de SIN MIGRACIONES) y el registro
en `DELETE /api/spaces/{id}/leases/{id}` (`backend/app/routers/spaces.py:571`). Pasado otra
vez por la matriz:

- **La ruta que escribe** sigue siendo admin-only: sonda `403` para worker, `401` para el
  token de montaje, `204` para admin.
- **No hay ninguna ruta de lectura** de `lease_cancellations`: `grep -rn "LeaseCancellation"
  backend/app/` da tres usos — el modelo, el `db.add` del DELETE, y la lectura interna de
  `backend/app/services/ocupacion.py:238-242`.
- **Esa lectura interna está detrás de la puerta del dinero:**
  `backend/app/services/ocupacion.py:378` — `cancelados = _cancelados_de(db, spaces) if include_money else {}`.
  Para un worker la tabla **ni se consulta**.
- **No agrega ninguna clave a ninguna respuesta.** El `out` de `sede_ocupacion`
  (`ocupacion.py:408-416`) tiene las mismas siete claves para worker que antes; la fecha de
  cancelación sólo mueve el prorrateo de `ingreso_contratado`, que es admin-only.
- Sonda tras cancelar: worker recibe
  `{"sede":"NAVE","caras_comercializables":2,"contratadas":0,"montadas":0,"vencidas":0,
  "ocupacion_esperada_pct":0.0,"ocupacion_real_pct":0.0}` — sin plata, igual que antes.

**Veredicto: no abrió ningún campo nuevo al worker.**

---

## (c) El vector indirecto: el desvío porcentual

**La aritmética.** El desvío se publica como `−17% vs referencia` y sale de
`desvío = 1 − negociado/referencia`. Dos de los tres términos despejan el tercero:

- desvío + referencia → **negociado** = referencia × (1 − desvío)
- desvío + negociado → **referencia** = negociado / (1 − desvío)

Con el redondeo a entero de porcentaje, un valor de `$2.000.000` se acota a ±`$20.000`: para
efectos comerciales, es el precio.

**Inventario completo de dónde se muestra un desvío, y con qué rol (líneas del árbol actual):**

| # | Lugar | Archivo:línea | De dónde saca la referencia | Rol que lo ve |
|---|---|---|---|---|
| 1 | Panel del mueble en el 3D (NUEVO) | `StoreEditor3D.tsx:4427-4431`, `:4444-4447` | `rates.reference_rate` del servidor | admin |
| 2 | Renglón por espacio en la ficha de contrato | `Contrato/Contrato.tsx:223`, `:235`, `:587-602` | `referenceRates` del store | admin |
| 3 | «Bajo tarifa de referencia» en Para revisar | `DashboardView.tsx:2932`, `:3876` | `referenceRates` del store | admin |
| 4 | `ReferenceRateHint` (campo de valor) | `ReferenceRateHint.tsx:21-31` | `referenceRates` del store | admin |
| 5 | Lista de precios por familia (modo Vender) | `DashboardView.tsx:2726`, `:2815` | `referenceRates` del store | admin |
| 6 | Aviso de la planilla: «N% por debajo de la tarifa de referencia ($X)» | `bulk_leases.py:252-257` | `reference_rates_raw(db)` | admin |

**Los seis cierran, y cierran por tres candados independientes:**

1. **El servidor no manda la referencia.** `GET /layout/rates` exige admin
   (`layout.py:362`); `/spaces/{code}/rates` la omite del payload (`spaces.py:333-334`);
   `/dashboard/ocupacion` omite `ingreso_a_referencia` (`ocupacion.py:414-416`). Sin
   referencia, ninguna de las dos ecuaciones se resuelve.
2. **El servidor no manda el negociado.** `negotiatedValue` sale por `pop`
   (`layout.py:93-102`), `monthly_rent` por `None` (`spaces.py:43`). Sin negociado, tampoco.
   **Y desde esta ronda, tampoco el negociado escrito en letras** (`notes`/`observation`, H2).
3. **El cliente refuerza los dos.** `referenceRateFor(null, …)` devuelve `null`
   (`frontend/src/types/fixtures.ts:136`), así que los cálculos #2–#5 devuelven `null` y no
   dibujan nada aunque el componente se montara. El #1 además gatea el negociado con `isAdmin`
   a mano (`StoreEditor3D.tsx:4792`) y pasa `undefined` para la cara B (`:4793`). Y
   `referenceRates` nunca se persiste (`fixtureStore.ts:1110-1111`), no se pide con sesión de
   worker (`:836-838`) y no sobrevive a un cambio de rol en la misma pestaña (`:1004-1006`).

**El oráculo de la planilla — el que sí habría servido.** `bulk_leases.py:252-257` responde,
para un valor arbitrario que el llamador elige, «este monto está N% por debajo de la tarifa de
referencia ($X)». Es un oráculo perfecto: **manda la referencia en el texto**, y aunque no la
mandara, bastaría una búsqueda binaria sobre `valor` para encontrar el umbral y despejarla.
Está cerrado con `require_admin` en las **dos** puertas — `bulk_leases.py:318` (`validar`) y
`:326` (`confirmar`) — y `validar` no escribe nada, así que un worker no puede ni sondearlo sin
efectos. Verificado: `403` para worker. **Si alguna vez alguien afloja ese `require_admin`
«porque validar no escribe», este es el agujero.**

**Fuga por agregado — despeje por diferencia.** `ingreso_contratado` es la suma prorrateada de
los `monthly_rent` de las caras contratadas de una sede (`ocupacion.py:395-396`) y
`ingreso_a_referencia` la suma de las tarifas de todas las caras comercializables (`:397-399`).
Con `sede`, `desde` y `hasta` libres, un llamador puede pedir dos rangos que difieran en un
solo contrato y **despejar ese contrato por resta** — o directamente pedir una sede con una
sola cara contratada y leer el precio. Los dos campos son **admin-only**, así que el despeje
sólo está al alcance de quien ya tiene el número: no es fuga. Lo dejo escrito porque es la
propiedad que hay que recordar el día que alguien proponga «mostrarle la ocupación al
mercaderista con los ingresos redondeados»: **redondear un agregado parametrizable por fechas
no lo protege; la diferencia entre dos consultas sí lo revela.** El prorrateo por
cancelación agregado en esta ronda hace el agregado *más* sensible a la fecha, no menos — un
argumento más para que esas dos claves nunca bajen de admin.

**Ordinal sin cifra.** El único desvío-de-hecho que llega a un worker sigue siendo el orden de
`top_suppliers` (**H3**): no es un porcentaje, pero es una comparación de dinero entre
proveedores que atraviesa la redacción intacta.

**Conclusión del vector.** Para el rol `worker` no existe hoy ningún camino —directo, por
despeje, por oráculo ni **por texto libre**— hacia la tarifa de referencia ni hacia el valor
negociado. La ronda 1 tenía que poner ese asterisco sobre el texto libre (H1/H2); esta ronda
ya no lo tiene. Para el token de montaje tampoco: no entra a ninguno de los seis lugares.
Lo único que sigue atravesando es información *derivada* de plata en forma **ordinal** (H3).

---

## (d) Veredicto sobre el ítem de la spec

> **Verificación:** «Tarifas de referencia ocultas a worker»

# CUMPLE

Evidencia, en cinco capas:

1. **Endpoint de origen cerrado en las dos direcciones.**
   `backend/app/routers/layout.py:362` y `:392` — `GET` y `PUT /api/layout/rates` con
   `dependencies=[Depends(require_admin)]`. Un worker recibe **403**, no una lista vacía.
   Sonda: `{"detail":"Se requiere rol de administrador"}`.
2. **El endpoint nuevo omite la clave, no la manda en null.**
   `backend/app/routers/spaces.py:333-334`. Comprobado en caliente: la respuesta del worker a
   `GET /api/spaces/NAVE-PUN-04/rates` es
   `{"code":…,"sede":"NAVE","type":"punta","occupancy":{…}}` — `reference_rate` no figura.
   Fijado por `backend/tests/test_space_rates.py`.
3. **El agregado tampoco la deja despejar.** `backend/app/services/ocupacion.py:377` ni
   siquiera lee la tabla de tarifas cuando el rol no es admin, y `:414-416` no agrega
   `ingreso_a_referencia` ni `ingreso_contratado`. Comprobado en caliente.
4. **El cliente no la guarda, no la pide y no la conserva.**
   `frontend/src/store/fixtureStore.ts:1110-1111` (fuera del `partialize`, con el escenario de
   máquina compartida escrito en el comentario), `:836-838` (un worker no emite la llamada) y
   `:1004-1006` (un login de worker pone `referenceRates = null`, barriendo lo que hubiera
   dejado un admin en la misma pestaña).
5. **Y ahora tampoco queda en la caché del navegador.**
   `backend/app/routers/spaces.py:299` — `Cache-Control: no-store, max-age=0`, el mismo valor
   que `/layout/rates`. Era la única reserva que la ronda 1 tenía que anotar bajo este
   veredicto; **está cerrada.**

Y el token de montaje no alcanza ninguna de las tres rutas de tarifas: el barrido recorrió
**33** rutas GET reales —incluidas `/api/layout/rates`, `/api/spaces/{code}/rates` y
`/api/dashboard/ocupacion`, verificadas por nombre— y todas contestaron **401**.

**Sin reservas.** El veredicto de la ronda 1 era CUMPLE con una reserva (H5); esta ronda es
CUMPLE limpio.

---

## Adenda — el consumidor de analytics (re-verificado)

La sección de ocupación que dibuja `/dashboard/ocupacion` vive **dentro de Supervisar, que es
una de las dos pantallas del worker** (`frontend/src/pages/Dashboard.tsx:684-686`), así que se
re-auditó. **Correcto, con doble candado, sin cambios desde la ronda 1:**

| Chequeo | Evidencia |
|---|---|
| El tipo declara la plata como **opcional**, no como `number \| null` | `frontend/src/api/dashboard.ts:75` — `ingreso_contratado?: number`, con el comentario de `:48-51` que ordena chequear presencia y no `!== null` |
| Presencia **y** rol, no uno solo | `Ocupacion/TablaOcupacion.tsx:15` — `isAdmin && filas.some((f) => "ingreso_contratado" in f)`; `Ocupacion/BarraSede.tsx:62` — `isAdmin && "ingreso_contratado" in fila && "ingreso_a_referencia" in fila` |
| Las columnas de plata **no se declaran** si no hay plata | `TablaOcupacion.tsx:26-34` — los `push` de las dos columnas están dentro del `if (conMoneda)`: para un worker la tabla tiene siete columnas, no nueve con guiones |
| Nada de `$0` ni de `—` en lugar de un monto | `TablaOcupacion.tsx:91-100` y `:106`, `BarraSede.tsx:62` |

Es el patrón que **H4** pide para `/dashboard/kpis`: chequear la **presencia de la clave**, que
sólo se puede hacer porque el backend la omite en vez de mandarla en cero. Vale como
demostración de que la convención nueva es la que hay que unificar.

Detalle sin severidad: `getOcupacion` convierte el **404** en `null` pero deja propagar el
**403**. Hoy no puede haber 403 en esa ruta —el router es de cualquier rol autenticado
(`backend/app/routers/dashboard.py:12`)— así que no hay nada roto; conviene saberlo si algún
día se le pone `require_admin` a la ruta entera en vez de omitir las claves, porque ahí la
sección tiraría error en vez de esconderse.

---

## Supuestos y límites declarados

- **Jurisdicción y normativa: NO EVALUADAS.** Nadie indicó marco regulatorio. Los datos
  personales que se manejan (nombre de contacto, celular y correo de proveedores, más el nombre
  de quien reporta un montaje) son PII de terceros y la operación es de supermercados con sedes
  en Colombia según `docs/ESTADO.md`, lo que **haría suponer** un régimen local de protección de
  datos — pero eso es un supuesto mío, no un dato del proyecto. **H1 se calificó y se cerró por
  menor privilegio, no por cumplimiento normativo.** Si hace falta el análisis regulatorio, hay
  que indicar la jurisdicción y lo revisa un profesional.
- **No hay política de privacidad ni T&C en el repo.** Si el sistema pasa a tener cuentas
  nominadas o a mostrarle algo al proveedor, hace falta al menos: qué se recolecta (contacto del
  proveedor, foto de montaje con hora del servidor, bitácora de descargas con IP), con qué fin, y
  por cuánto tiempo se retiene — hoy nada se borra por diseño («la foto es la prueba»).
  **Insumo para un borrador, no un documento.**
- **Estado del árbol al cerrar (17:09 UTC), quieto desde las 16:27.** Modificados:
  `backend/app/models/models.py`, `backend/app/routers/{dashboard,layout,spaces,suppliers}.py`,
  `backend/app/schemas/spaces.py`, `frontend/src/api/{dashboard,spaces}.ts`,
  `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx`, `frontend/src/pages/DashboardView.tsx`.
  Nuevos: `backend/app/services/ocupacion.py`, `backend/tests/test_{dashboard_ocupacion,redaction_pii,space_rates}.py`,
  `frontend/src/components/Ocupacion/`, `frontend/src/utils/semaforo3d.ts`.
  **Todo lo que se escriba después de este punto queda sin auditar** — en particular, cualquier
  campo nuevo en los endpoints de esta feature hay que volver a pasarlo por la matriz.
- **No auditado:** el aislamiento multi-cliente (`backend/app/clientes.py`). Ningún endpoint
  nuevo elige base por su cuenta, que es la forma correcta, pero la separación entre
  supermercados es un encargo propio y no entraba en éste. (Los intermitentes de N3 viven ahí.)
- **No auditado campo por campo:** `/api/bitacora`, `/api/planogramas`, `/api/catalogo`,
  `/api/notifications`. Los cuatro pasaron el barrido con 401 para el token de montaje y el
  barrido de agujas de PII con worker sin una sola aparición.
- **Ninguna recomendación pendiente es un rediseño.** H4, H5-tests (N1), N2 y H9 se cierran con
  entre una y tres líneas cada una. H3 se cierra sacando el orden o sacando `top_suppliers` del
  alcance del worker. H6 es una decisión de arquitectura del maestro. H7 y H8 son huecos
  preexistentes que exceden esta feature.
