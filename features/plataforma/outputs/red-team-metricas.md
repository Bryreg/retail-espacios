# Fase 4 — Red Team de la Frontera de Privacidad · bitácora de ataque

Auditoría adversaria de `GET /api/plataforma/metricas` y del token de consola
(`cliente = "plataforma"`). Rama `claude/fase-4-plataforma`. **Sin commit ni
push. Sin una línea de código de producción tocada.**

Territorio exclusivo del auditor:

* `backend/tests/test_metricas_ataques.py` — **36 ataques**, 1.664 líneas
  (33 verdes, 3 `xfail(strict=True)` que son los hallazgos abiertos).
* Este archivo y `features/plataforma/outputs/auditor-privacidad.md` (el
  entregable con severidades, veredicto y las decisiones que necesita el
  Maestro).

Precedente y estilo: `backend/tests/test_plataforma_ataques.py` (Fase 2, 30
ataques). Misma disciplina de tres clases de test — **defensas que aguantan**,
**caracterizaciones** y **hallazgos abiertos** marcados `xfail(strict=True)` —
y misma regla: un defecto encontrado se paga con un test que lo demuestra y un
renglón en el informe, nunca con un parche.

Este archivo es la bitácora **ataque por ataque**, que es lo que citan los
docstrings de los 36 tests. El análisis de severidad, la decisión sobre
`VERSION_POLITICA` y lo que hay que resolver antes de mergear están en
`auditor-privacidad.md`.

---

## Cómo se sembró el campo de batalla

Todo ataque contra un filtro de datos vale lo que valgan los datos sembrados.
El escenario base (`_escenario`) monta, por los endpoints reales:

| Cliente | Cómo se creó | Qué lleva |
|---|---|---|
| `acme` | alta self-service real | 2 sedes, 5 caras (una góndola **doble**), 4 contratos activos |
| `beta` | alta self-service real | 1 sede, 2 caras, 2 contratos, **estado `suspendido`** con motivo jugoso |
| `galerias` | el de siempre | vacío |
| `roto` | fila en el registro + archivo basura en disco | base ilegible |

Y adentro, a propósito, todo lo que un atacante querría sacar del panel:

* **Correos de usuarios finales**: `duena.acme@…`, `dueno.beta@…` — cuentas
  reales del registro, con membresía y `ultimo_login`.
* **Ficha completa de cada proveedor**: `contact_name`, `phone`, `email`,
  `notes`. Es la tentación más obvia, porque el **nombre** del proveedor SÍ sale
  en el top-5 y el resto de la fila viaja al lado en el mismo objeto del ORM.
* **Notas libres** en `spaces` y en `space_leases`, más `marca` — los campos
  donde la gente escribe cualquier cosa, incluidos datos personales.
* **`estados_cliente.motivo`** con un correo adentro y
  **`solicitudes_supresion`** con el correo de quien pidió el borrado: los dos
  viven en la MISMA base que el endpoint abre para leer `clientes`.
* **Montos primos distintos** (100.003 · 200.003 · 300.007 · 500.009 · 700.001 ·
  1.300.021), elegidos para que **ninguna suma ni promedio de la respuesta
  coincida con un valor individual**. Se afirma en tiempo de importación
  (`assert not (_AGREGADOS & set(CANONES_INDIVIDUALES))`): si el sembrado se
  toca y la premisa se rompe, el archivo no llega a coleccionarse. Así, un monto
  individual en el JSON sólo puede venir de una fila filtrada, nunca de una
  cuenta que dio justo ese número.

Trece **sentinelas** de texto se buscan, literales, contra el JSON serializado
entero.

---

## Ataque 1 — Inspección profunda del JSON real

Tres recorridos recursivos propios (`_hojas`, `_claves`, `_arreglos`) que bajan
por todo el árbol. Un ataque que mire el primer nivel no sirve: lo que se filtra
se filtra adentro de `clientes[3].metricas.top_proveedores[0]`.

| # | Ataque | Resultado |
|---|---|---|
| **M-1** | Ningún string del JSON contiene `@`. **Ni el del operador.** | ✅ Aguanta (pero ver **H-1**: la invariante es contingente) |
| **M-2** | Los 13 sentinelas, buscados contra el JSON serializado (no sólo hoja por hoja: si algo se colara adentro de un string compuesto, la búsqueda exacta no lo vería) | ✅ Ninguno aparece |
| **M-3** | Ningún canon sembrado sale como número; y los agregados que SÍ van, verificados a mano contra las cuentas | ✅ Aguanta (pero ver **H-2**: con un contrato, el agregado ES el canon) |
| **M-4** | Lista blanca **EXACTA** de claves, objeto por objeto, en todos los niveles: ni una de más ni una de menos | ✅ Contrato cumplido literal |
| **M-5** | Lista **negra** de 34 claves de negocio (`email`, `notes`, `monthly_rent`, `supplier_id`, `motivo`, `db_name`, `id`…), en cualquier profundidad | ✅ Ninguna |
| **M-6** | Los únicos arreglos son `$.clientes`, `$.consolidado.top_proveedores` y `$.clientes[i].metricas.top_proveedores` — verificado con regex sobre cada arreglo del árbol | ✅ Sin intrusos |
| **M-7** | La frontera exacta del top-5: el **nombre** sale, la **ficha** no | ✅ `{nombre, contratos_activos}` y nada más; contacto/teléfono/correo/notas ausentes |
| **M-8** | Perfil de tipos de TODA la respuesta: cualquier string que no sea fecha ISO, slug, estado, nombre o el error fijo es texto libre — y el texto libre es donde vive lo que la gente escribe | ✅ Sin texto libre inesperado |

**Por qué M-1 se pasa de estricto a propósito**: el corte no es "ningún correo
de usuario final" sino **ninguna arroba**. El contrato taxativo no tiene un solo
campo que deba llevar un correo —ni el del operador, que ya queda en la bitácora
del registro—, así que cualquier arroba es, por definición, algo que se coló. Un
test que buscara sólo los correos sembrados se dejaría afuera el correo que
siembre el usuario mañana. Es exactamente lo que pasa en **H-1**.

**M-4 y M-5 son redundantes a propósito.** M-4 se rompe si alguien agrega una
clave y actualiza el contrato de arriba sin pensar; M-5 nombra explícitamente lo
que jamás puede estar, y esa lista es más difícil de aflojar sin darse cuenta de
lo que se está haciendo.

---

## Ataque 2 — El token de plataforma contra todo

| # | Ataque | Resultado |
|---|---|---|
| **M-9** | **51 endpoints de negocio** curados a mano —spaces, layout (incluido `/layout/rates`), dashboard, suppliers, files, montaje, planograms, bulk_leases, usuarios, `clientes/mi-export`, `clientes/solicitar-supresion`, bitácora, catálogo, notifications, mounts— con el token de la consola | ✅ **51/51 en 401 o 403.** Ni un 200, ni un 402 |
| **M-10** | Barrido **automático** de TODAS las rutas registradas en FastAPI (se rellenan los parámetros de ruta y se golpea cada método) | ✅ Ninguna sirvió 200/201/204/402 |
| **M-11** | El camino lateral de la Fase 2: `?token=` en la query contra `require_auth_or_query_token` (`/api/files/1`, `/api/planometrias/1`, `/api/catalogo/1/imagen`) | ✅ 401/403 en los tres |
| **M-12** | Fundar el slug `plataforma` en cinco disfraces (`Plataforma`, `PLATAFORMA`, con espacios…) y comprobar en la tabla que no quedó fila | ✅ 409/422 en todos; `clientes.slug == "plataforma"` no existe |
| **M-35** | Rutas deformadas: `..`, `..%2f`, `%2f`, doble barra, caja distinta, `/./` | ✅ Nada sirve datos. Lo único que devuelve 200 es el `index.html` de la SPA (catch-all del frontend) y el test **exige** que ese 200 sea `text/html`, no JSON |
| **M-36** | Se destruye la base de **todos** los clientes y se piden los demás endpoints de `/api/plataforma` (`/soy`, `/clientes`, `/supresiones`, el PATCH del interruptor) | ✅ Los cuatro contestan 200 como si nada — **prueban que no abren ninguna base de negocio**; sólo `/metricas` acusa el golpe, marcando `error` en la fila |

**M-9 no es un test de siete endpoints elegidos.** La defensa de la fase no es
un guard por router —que habría que acordarse de poner en cada endpoint nuevo—
sino `cliente_del_pedido`: el slug `plataforma` sólo resuelve a un cliente bajo
`/api/plataforma`, así que fuera de ahí el pedido **ni siquiera llega a tener
sesión de base**. M-9 y M-10 son la prueba de que esa construcción cubre la
superficie entera. `/api/health` es la única exención del barrido, con nombre y
apellido y con un assert que verifica que **siga** devolviendo su constante: el
día que alguien le agregue "clientes: 7", la exención deja de ser inocua.

**M-36 es el test que detecta la regresión más cara**: alguien que, para
"mejorar" el listado de clientes, le agregue un conteo leído de la base de cada
uno. Ese cambio pasaría todos los tests de contrato del JSON de métricas y
rompería la enmienda igual. Acá se rompe la base y se mira quién se queja.

---

## Ataque 3 — La puerta

| # | Ataque | Resultado |
|---|---|---|
| **M-13** | No-operador **con** membresías (owner de `acme`) contra `/metricas`, `/clientes`, `/supresiones` | ✅ 403 con el `detail` literal de `require_operador`. Y `/soy` le contesta `{"operador": false}` — la verdad, no un 403 |
| **M-14** | Login **legado** con `OPERADOR_EMAILS` conteniendo todo lo imaginable (`*`, `admin`, vacío, `None,*,admin@admin`) | ✅ 403 siempre: el legado no trae `email`, no hay correo que comparar, ninguna lista puede incluirlo |
| **M-15** | `OPERADOR_EMAILS` vacía (`""`, `"   "`, `",,,"`) y **ausente** | ✅ Cierra para todos. **401** al token de consola (`decode_token` lo mata antes del router) y **403** al operador con membresías. Cierra de más, que es el lado correcto |
| **M-16** | Quitar el correo de la variable → el token de la consola en el **pedido inmediatamente siguiente**, en los 4 endpoints + el PATCH que muta; y que poner OTRO correo no lo revive | ✅ Revocación inmediata, sin caché de por medio. Devolverle el correo lo revive (caracterizado: la fuente de verdad es la variable, y por eso revocar funciona) |
| **M-17** | Ocho correos que **casi** matchean: sufijo, prefijo, subdominio, punto de más, `+alias`, dominio truncado | ✅ Los seis distintos, fuera. Los dos que sí entran —espacio alrededor y caja distinta— son la normalización deliberada de `es_operador`, y el test la deja afirmada para que se sepa cuál de las dos cosas es intencional |
| **M-23** | El único parámetro que el operador controla: 17 `periodo` hostiles (inyección SQL, `../../etc/passwd`, `%2e%2e%2f`, `{}`/`%s`, `<script>`, NUL, 500 caracteres) | ✅ 422 en los 17, sin traza, y **sin reflejar el valor recibido** (un reflejo sería un XSS listo en la consola del operador). Las tablas siguen ahí |
| **M-28** | `POST`/`PUT`/`PATCH`/`DELETE` sobre `/metricas` | ✅ 405 en los cuatro: no hay escritura disfrazada de consulta |

**La enmienda del operador se cumple**: sí, ahora hay un agujero a los datos de
negocio, y sí, es exactamente uno, del tamaño que la spec dijo.

---

## Ataque 4 — Fugas laterales

| # | Ataque | Resultado |
|---|---|---|
| **M-18** | La fila del cliente roto: se barre la **respuesta entera** (no sólo el campo `error`) contra el nombre de la base, la ruta en disco, `sqlite`/`postgres`/`://`/`/tmp`, `Traceback`, `OperationalError`, `password`, `file is not a database` | ✅ 15/15 limpios. `error` es el texto fijo, `metricas: null`, `clientes_con_error: 1` y el resto del panel intacto |
| **M-19** | La bitácora, por sus dos lados: **completitud** (3 consultas —cálculo, acierto de caché, otro período— = 3 líneas con correo/período/fecha) y **minimalidad** (se vuelcan TODAS las columnas de la tabla y se buscan los 13 sentinelas, los 6 canones y hasta los slugs y nombres de proveedor) | ✅ Tres líneas exactas, en orden, y ni un dato de negocio en ninguna columna |
| **M-20** | `estados_cliente.motivo` (texto libre del operador, con un correo adentro) colándose en `/metricas` | ✅ No aparece; tampoco `cambiado_por`. Y se verifica que **sí** está en `/plataforma/clientes`, donde ya vivía — la fuga sería que estuviera en los dos lados, no que exista |
| **M-21** | `solicitudes_supresion` (el correo de quien pidió el borrado) colándose en `/metricas` | ✅ Ni el motivo, ni el correo, ni las palabras `supresion`/`solicitud`. Y sigue estando en `/plataforma/supresiones` |
| **M-22** | Dos operadores contra el caché compartido: el segundo recibe el JSON cacheado del primero | ✅ **Cada uno anota su propia línea**: `[(op@…, 2026-09), (segunda.operadora@…, 2026-09)]`. La constancia sigue al **acceso**, no al cálculo |

**Por qué M-19 y M-22 son el corazón de la enmienda.** Lo que compra el permiso
de mirar el negocio de todos es la bitácora. Si la respuesta cacheada no dejara
línea, un operador podría mirar el panel cuatro veces en cinco minutos dejando
una sola marca; y si la línea se escribiera junto al cálculo, el **segundo**
operador miraría el negocio de todos los clientes **sin rastro** y la bitácora
diría que quien miró fue el primero. Las dos cosas están bien resueltas: el
router anota después de calcular, siempre, con su propio correo.

---

## Ataque 5 — No-escritura

| # | Ataque | Resultado |
|---|---|---|
| **M-24** | Foto de **todas** las tablas de las dos bases de negocio, enumeradas con el inspector de SQLAlchemy (no tres elegidas a mano), antes y después de dos consultas. Incluye `audit_log` | ✅ Diccionarios idénticos. Ni una fila |
| **M-25** | La otra mitad: foto de **todas** las tablas del registro | ✅ Lo único que crece es `bitacora_plataforma`, exactamente +2 (una por consulta, la cacheada incluida) |
| **M-26** | El guardrail de la spec: el cliente **suspendido** aparece con sus métricas, y su fila no revela el motivo | ✅ `estado_cuenta: "suspendido"`, métricas completas, `set(keys) == {slug, nombre, estado_cuenta, error, metricas}` — ni un campo donde meter el motivo. Y su plata cuenta en el consolidado: suspendido no es invisible |

**M-24 se hizo con el inspector a propósito**: un test que mire tres tablas
elegidas no ve la cuarta que alguien empiece a escribir mañana.

---

## Ataque 6 — Orden de rutas

| # | Ataque | Resultado |
|---|---|---|
| **M-27** | `/metricas` contra `/clientes/{slug}`, de las dos maneras: el **índice real** en `app.routes` (la literal antes que todas las paramétricas del router) y el **comportamiento** (`/metricas` da métricas; `PATCH /clientes/metricas` da 404 de cliente inexistente, no 405 ni un cambio de estado; `/clientes` literal sigue listando) | ✅ Las dos |

---

## Ataque 7 — Hallazgos

Lo que **no** aguantó. Tres van con `xfail(strict=True)` porque afirman el
comportamiento seguro que hoy no se cumple: la suite sigue verde, el hallazgo no
se pierde, y el día que se tape el agujero el test pasa a XPASS y la suite se
pone en rojo — el recordatorio de sacarle el marcador. Tres son
caracterizaciones: la conducta es defendible pero tiene una consecuencia que
conviene tener escrita y vigilada.

| # | Test | Hallazgo | Severidad |
|---|---|---|---|
| **M-29** | `xfail` | **H-1** · Un proveedor con un correo en el **nombre** filtra ese correo al JSON | **ALTA** |
| **M-30** | `xfail` | **H-2** · Con **un solo contrato activo**, el agregado ES el contrato individual | **ALTA** (bloqueante condicional) |
| **M-31** | `xfail` | **H-3** · `startswith("/api/plataforma")` sin frontera de segmento | **MEDIA** (latente) |
| **M-32** | caracterización | **H-4** · `clientes.nombre` es texto libre sin filtro ni tope de largo | **BAJA** |
| **M-33** | caracterización | **H-5** · El admin del cliente por defecto corta la consola del operador | **BAJA** |
| **M-34** | caracterización | **H-6** · El caché de 5 min sirve un `estado_cuenta` viejo tras el PATCH del propio operador | **BAJA** |

El desarrollo de cada uno —evidencia, por qué esa severidad y no otra, el
arreglo propuesto y qué decisión necesita el Maestro— está en
**`auditor-privacidad.md`**. Acá va sólo lo que hace falta para leer el test.

### H-1 · El nombre del proveedor viaja crudo (M-29)

`top_proveedores` devuelve `Supplier.name` **verbatim**, y ese campo es texto
libre que carga el supermercado. Sembrado
`"Juan Pérez Distribuciones (juan.perez@gmail.example)"`, el correo aparece tal
cual en el JSON:

```json
{"nombre": "Juan Pérez Distribuciones (juan.perez@gmail.example)", "contratos_activos": 1}
```

En retail colombiano el proveedor es muy seguido una **persona natural**, y la
gente escribe el contacto adentro del nombre porque es el único campo que se ve
en las listas. El test afirma el comportamiento seguro: que M-1 aguante
**también** cuando el nombre trae una arroba.

### H-2 · Celda de uno (M-30)

La spec dice dos cosas que con pocos datos se contradicen: «sólo agregados
(nunca filas individuales)» y, en *qué NUNCA*, «valores de contratos
individuales». Un cliente con **un** contrato activo hace que
`ingreso_contratado_mes` y `canon_promedio_mensual` sean, exactamente, el
`monthly_rent` de ese contrato, y `top_proveedores` de al lado dice con quién:

```
canon sembrado : 100003.0
ingreso        : 100003.0
canon promedio : 100003.0
top            : [{"nombre": "Alpina", "contratos_activos": 1}]
```

El operador reconstruye la fila entera —proveedor, monto y, si además hay una
sola cara ocupada, cuál espacio—. No es un caso de laboratorio: es el estado
normal de un supermercado en su primer mes, y el panel del operador es
justamente donde se miran los clientes nuevos.

### H-3 · El prefijo sin frontera de segmento (M-31)

`clientes._cliente_de_la_consola` compara con `startswith("/api/plataforma")`,
sin exigir que el prefijo termine en `/` o en fin de cadena:

```
'/api/plataforma/metricas'   -> RESUELVE cliente plataforma   (correcto)
'/api/plataformazo/robar'    -> RESUELVE cliente plataforma   (no debería)
'/api/plataforma-publica/x'  -> RESUELVE cliente plataforma   (no debería)
'/api/spaces/'               -> 401                            (correcto)
```

Hoy **no es explotable** (no existe ninguna ruta con ese prefijo). Es latente, y
latente es el peor momento para no anotarlo, porque la promesa escrita en
`clientes.py` es literalmente «aunque mañana alguien monte un endpoint nuevo sin
pensar en esto, el pedido no llega a tener sesión de base» — y para un endpoint
que empiece con esas catorce letras, sí llega. El mismo `_PREFIJO_PLATAFORMA`
gobierna además la **exención del interruptor de estado de cuenta** en
`_aplicar_estado`: una ruta futura `/api/plataforma-publica` quedaría también
exenta del 402 para clientes suspendidos.

### H-4 · `clientes.nombre` sin filtro ni tope (M-32)

El alta sólo le hace `strip()` y le exige no estar vacío. Ese string aparece
ahora en `$.clientes[i].nombre` de un endpoint que recorre TODOS los clientes y
**cachea la respuesta cinco minutos en memoria del proceso**. Un nombre de 5.000
caracteres con `<script>` y un correo adentro pasa el alta y llega entero al
JSON del operador. Se caracteriza y no se marca `xfail` porque el operador ya
veía ese mismo nombre en `/plataforma/clientes` desde la Fase 2: el dato no es
nuevo, el canal sí.

### H-5 · Un cliente puede desloguear al dueño del SaaS (M-33)

La época del token de la consola se emite contra la base **por defecto**, que en
producción es la de `galerias`. `PUT /api/auth/passwords` con
`worker_password` sube `token_epoch_worker` ahí, y el token del operador muere
en el pedido siguiente:

```
antes del cambio de clave  -> 200
PUT /api/auth/passwords    -> 200
después                    -> 401
```

El builder la eligió a conciencia y la documentó (la alternativa era no
comprobar época para este token, que sería quitar una defensa). El test la deja
fijada para que, si mañana se resuelve con una época propia del registro,
alguien lo note.

### H-6 · Estado de cuenta viejo servido del caché (M-34)

`estado_cuenta` entra al cuerpo cacheado, y el PATCH del interruptor invalida el
caché de `plataforma_estado` pero **no** el de métricas:

```
métricas antes del PATCH        -> acme: activo
PATCH /plataforma/clientes/acme -> 200 suspendido
/plataforma/clientes            -> acme: suspendido
métricas después (de_cache)     -> acme: activo     ← hasta 5 minutos
```

No es privacidad, es confianza en el tablero: un número viejo se perdona (el
JSON dice `de_cache: true`), un estado de cuenta viejo se lee como que el corte
no se aplicó. El arreglo es una línea: llamar a `limpiar_cache_metricas()` desde
el PATCH, al lado del `invalidar_cache_estado` que ya está.

---

## Verificación

```
rm -f backend/retail_espacios.db backend/recabra_*.db
cd backend && python -m pytest tests/test_metricas_ataques.py     # 33 passed, 3 xfailed
cd backend && python -m pytest                                    # suite COMPLETA, dos veces
```

```
tests/test_metricas_ataques.py -> 33 passed, 3 xfailed
suite completa, corrida 1     -> 552 tests · 538 passed · 14 xfailed · EXIT=0
suite completa, corrida 2     -> 552 tests · 538 passed · 14 xfailed · EXIT=0
```

El patrón de puntos y de `x` es **idéntico carácter por carácter** entre las dos
corridas. Los 14 `xfail` son 11 preexistentes (Fases 1-3 y el otro agente de la
Fase 4) más los 3 de esta auditoría: **cero regresiones**. El desglose por
archivo y el análisis están en `auditor-privacidad.md`.

**Gotcha R-0 / R-0 bis, confirmado por segunda vez.** `rm -f` de las `.db` entre
corridas no es higiene, es obligatorio (`test_correo_api.py` importa
`app.services.mailer` a nivel de módulo y deja `app.database` clavado contra
`backend/retail_espacios.db`). Y el teardown de `tests/conftest.py` borra
**todos** los `recabra_*.db` del directorio temporal, no sólo los suyos: con dos
procesos de pytest sobre el mismo `/tmp` salen fallas fantasma
(`attempt to write a readonly database`) repartidas al azar. Las corridas de
esta auditoría se hicieron con `TMPDIR` propio. Es el mismo hallazgo que ya
reportó el builder de métricas; queda confirmado de forma independiente y sigue
viviendo en `tests/conftest.py`, fuera del territorio de esta auditoría.
