# Fase 4 — Red Team de la Frontera de Privacidad · entregable

Auditoría adversaria de la enmienda de la regla del operador: el JSON de
`GET /api/plataforma/metricas` y el token de consola (`cliente = "plataforma"`).
Rama `claude/fase-4-plataforma`. **Sin commit ni push.**

**No se tocó una sola línea de código de producción.** Cada defecto encontrado
se pagó con un test que lo demuestra y un renglón acá.

| | |
|---|---|
| Archivo de ataque (territorio exclusivo) | `backend/tests/test_metricas_ataques.py` — **36 ataques**, 1.664 líneas |
| Bitácora ataque por ataque | `features/plataforma/outputs/red-team-metricas.md` |
| Resultado | **33 verdes · 3 `xfail(strict=True)`** (los hallazgos abiertos) |
| Suite completa | **552 tests · 0 fallas · 14 xfail · exit 0 · DOS veces** |
| Hallazgos **bloqueantes** | **0 incondicionales · 1 condicional (H-2)** |

---

## Veredicto

**El peor bug posible de esta fase no ocurrió.** Con el campo de batalla sembrado
a propósito con correos de usuarios finales, fichas completas de proveedores
(`contact_name`/`phone`/`email`/`notes`), notas libres en espacios y contratos,
motivos de corte de cuenta y solicitudes de supresión, el JSON de métricas
salió limpio en las ocho inspecciones recursivas: **ni una arroba, ni un monto
individual suelto, ni una clave fuera de la lista blanca exacta, y los únicos
arreglos de toda la respuesta son `clientes` y `top_proveedores`.**

El token de la consola no abrió **ninguno** de los 51 endpoints de negocio
probados a mano ni ninguna de las rutas del barrido automático: 401 o 403 en
todos, ni un 200, ni un 402. La puerta cierra por los cuatro lados (no-operador
con membresías, legado, variable vacía, revocación en caliente). El endpoint no
escribe una fila en ninguna tabla de ninguna base. La bitácora anota una línea
por consulta, la cacheada incluida, con el correo de quien miró.

Lo que sí encontré son **seis hallazgos**, ninguno de ellos un fallo de
implementación contra lo que la spec pidió: dos son **límites reales del diseño
del agregado** que la spec no resolvió y hay que decidir antes de publicar la
política de datos, uno es un defecto latente de una línea, y tres son
consecuencias que conviene tener escritas y vigiladas.

**Recomendación**: mergeable **después** de resolver H-2 (decisión del Maestro,
puede ser "se acepta y se documenta") y con H-1 y H-3 en la misma rama o en un
PR inmediato. H-1 y H-2 tienen un motivo extra de urgencia que explico abajo:
**hacen falsas dos frases de la Política de Tratamiento de Datos que esta fase
está agregando.**

---

## Los seis hallazgos

| # | Hallazgo | Severidad | Test que lo fija |
|---|---|---|---|
| **H-1** | Un proveedor con un correo en el **nombre** filtra ese correo al JSON | **ALTA** | `test_m29_…` (`xfail`) |
| **H-2** | Con **un solo contrato activo**, el agregado **ES** el contrato individual | **ALTA · bloqueante condicional** | `test_m30_…` (`xfail`) |
| **H-3** | `startswith("/api/plataforma")` sin frontera de segmento | **MEDIA · latente** | `test_m31_…` (`xfail`) |
| **H-4** | `clientes.nombre` es texto libre sin filtro ni tope de largo | **BAJA** | `test_m32_…` |
| **H-5** | El admin del cliente por defecto puede cortar la consola del operador | **BAJA** | `test_m33_…` |
| **H-6** | El caché de 5 min sirve un `estado_cuenta` viejo tras el PATCH del propio operador | **BAJA** | `test_m34_…` |

### Criterio de severidad usado

El listón que me dio el Maestro: **bloqueante = cualquier dato de negocio
individual o correo de usuario final en la respuesta, o un 200 del token
plataforma en un endpoint de negocio.**

* **Ningún 200 del token plataforma**: 51 endpoints curados + barrido automático
  de toda la aplicación. Cero.
* **Ningún correo de usuario final**: cero, en todas las siembras.
* **Dato de negocio individual**: acá está el matiz, y es H-2. Con un contrato
  activo, `ingreso_contratado_mes` **es** el `monthly_rent` de ese contrato. Lo
  llamo *bloqueante condicional* y no bloqueante a secas porque el endpoint hace
  exactamente lo que la spec ordenó —los agregados son los taxativos, calculados
  bien— y porque la contradicción está en la spec, no en el código. Pero el dato
  individual está en la respuesta, y con clientes nuevos va a estar seguido.

---

## H-1 · El nombre del proveedor viaja crudo · ALTA

**Qué pasa.** `top_proveedores` devuelve `Supplier.name` **verbatim**. Ese campo
es texto libre que carga el supermercado, sin validación. Sembrado
`"Juan Pérez Distribuciones (juan.perez@gmail.example)"`:

```json
{"nombre": "Juan Pérez Distribuciones (juan.perez@gmail.example)", "contratos_activos": 1}
```

**Por qué importa, y no es teórico.** En retail colombiano el proveedor es muy
seguido una **persona natural**, y la gente escribe el contacto adentro del
nombre porque es el único campo que aparece en las listas del sistema. El
nombre de una persona natural ya es un dato personal de un tercero; un correo
adentro del nombre lo es sin discusión.

**Y hace falsa la política que esta fase agrega.** El punto 5.3 nuevo de
`docs/legal/politica-datos.md` dice, textual: *«un top de proveedores por nombre
comercial y número de contratos activos (nunca los datos de la persona de
contacto)»* y *«el operador nunca ve … un dato de una persona identificada del
supermercado o de sus proveedores»*. Con H-1 abierto, esas dos frases no son
verdad, y son frases de un documento que va a ir a un abogado y después a los
titulares. **Prefiero arreglar el código para que el texto sea cierto antes que
suavizar el texto.**

**Arreglo propuesto** (una función en `plataforma_metricas.py`, sin migración y
sin tocar el contrato): sanear el nombre antes de meterlo en `_top()` — recortar
a un largo razonable y quitar/enmascarar lo que parezca correo o teléfono. La
métrica que el operador necesita —"con quién trabajan más"— sobrevive intacta.

> **Decisión que necesita el Maestro**: ¿saneado en el backend (mi
> recomendación) o se acepta y la política se reescribe para admitir que el
> nombre del proveedor es texto libre del cliente?

---

## H-2 · Celda de uno: el agregado ES el contrato · ALTA · bloqueante condicional

**Qué pasa.** Un cliente con **un** contrato activo:

```
canon sembrado (monthly_rent) : 100003.0
ingreso_contratado_mes        : 100003.0   ← el mismo número
canon_promedio_mensual        : 100003.0   ← el mismo número
top_proveedores               : [{"nombre": "Alpina", "contratos_activos": 1}]
```

El operador reconstruye la fila entera: **con quién** (el único proveedor del
top), **cuánto** (la suma, que tiene un solo sumando) y, si además hay una sola
cara ocupada, **cuál espacio** (`espacios_comercializables` × `ocupacion_pct`).
Con dos contratos la reconstrucción es parcial pero sigue siendo fuerte.

**La spec se contradice sola acá.** Autoriza taxativamente
`ingreso_contratado_mes` y `canon_promedio_mensual`, y en *qué NUNCA* prohíbe
«valores de contratos individuales». Con n=1 las dos cláusulas piden cosas
opuestas. El builder implementó la primera literalmente y no tenía cómo saber
que la segunda le aplicaba: **la contradicción es de la spec, no del código.**

**Por qué no es un caso de laboratorio.** Es el estado normal de un supermercado
en su primer mes — y el panel del operador es justamente donde se miran los
clientes nuevos. También lo es un mes flojo, o un período pasado consultado con
`?periodo=`.

**Y también hace falsa la política.** El punto 5.3 dice: *«el operador nunca ve
una fila individual de negocio (un contrato, un espacio, un proveedor con sus
datos de contacto)»*. Con un contrato activo, efectivamente la ve.

**Arreglos posibles, de más barato a más caro** (los tres sin migración):

1. **Supresión de celda chica**: si `contratos < K` (K = 3 es el umbral clásico),
   `canon_promedio_mensual` e `ingreso_contratado_mes` salen en `null` y la
   consola muestra "pocos datos". Cuesta cuatro líneas en `_metricas_de_un_cliente`
   y no toca el contrato del JSON (los campos ya admiten `null`).
2. **Bandas** en vez de valores: `ingreso_contratado_mes` redondeado a la decena
   de millón. Rompe la utilidad de la métrica para clientes chicos.
3. **Aceptarlo y documentarlo**: dejar el número y decir en la política que el
   operador ve el ingreso contratado agregado, que en clientes con muy pocos
   contratos coincide con el contrato. Es defendible —el operador es el
   encargado del tratamiento y el dato es del **cliente**, no de un titular
   persona natural— pero hay que **decirlo**, no dejar la frase actual.

> **Decisión que necesita el Maestro**, y es la única que yo consideraría
> bloqueante: elegir entre 1 y 3. Mi recomendación es **1** (supresión bajo K=3),
> porque es la que deja verdadera la frase que la política ya está diciendo, y
> porque el operador que mira un cliente con dos contratos no está tomando
> ninguna decisión de negocio que el `null` le arruine.

---

## H-3 · El prefijo sin frontera de segmento · MEDIA · latente

**Qué pasa.** `clientes._cliente_de_la_consola` compara con
`startswith("/api/plataforma")`, sin exigir que el prefijo termine en `/` o en
fin de cadena:

```
'/api/plataforma/metricas'   -> RESUELVE cliente sintético   (correcto)
'/api/plataformazo/robar'    -> RESUELVE cliente sintético   (no debería)
'/api/plataforma-publica/x'  -> RESUELVE cliente sintético   (no debería)
'/api/spaces/'               -> 401                           (correcto)
```

**Hoy no es explotable**: no existe ninguna ruta con ese prefijo, y por eso el
ataque M-9/M-10 pasa. Es latente — y latente es el peor momento para no
anotarlo, porque la promesa que el builder escribió en el docstring es
literalmente *«aunque mañana alguien monte un endpoint nuevo sin pensar en esto,
el pedido no llega a tener sesión de base»*, y para un endpoint que empiece con
esas catorce letras, sí llega.

**Hay una segunda cara, peor.** El mismo `_PREFIJO_PLATAFORMA` gobierna la
**exención del interruptor de estado de cuenta** en `_aplicar_estado`
(`clientes.py`): una ruta futura `/api/plataforma-publica` quedaría exenta del
402 para clientes **suspendidos**. Ahí el afectado no sería el token de la
consola sino cualquier cliente cortado por impago.

**Arreglo**: un carácter. Comparar contra `"/api/plataforma/"` o exigir igualdad
con `"/api/plataforma"`. Sirve para los dos usos del prefijo.

---

## H-4 · `clientes.nombre` sin filtro ni tope · BAJA

El alta sólo le hace `strip()` y le exige no estar vacío. Un nombre de 5.000
caracteres con `<script>alert(1)</script>` y un correo adentro pasa el alta y
llega **entero** a `$.clientes[i].nombre`.

Dos consecuencias, las dos **nuevas de esta fase**:

* Lo que un cliente escriba llega al JSON del operador. La consola es React y
  escapa por defecto, así que no hay XSS hoy; pero la invariante «ni una arroba»
  de M-1 **no es estructural**: depende de lo que tecleó el cliente.
* Sin tope de largo, ese nombre infla la respuesta y el **caché de 5 minutos en
  memoria del proceso** de todos los operadores. Es una amplificación barata que
  antes no tenía destino.

Severidad **baja** porque el operador ya veía ese mismo nombre en
`/plataforma/clientes` desde la Fase 2: el dato no es nuevo, el canal sí. Se
caracteriza (no `xfail`) para que un cambio se note. **Arreglo**: un tope de
largo en `routers/alta.py`, al lado del `strip()`.

---

## H-5 · Un cliente puede desloguear al dueño del SaaS · BAJA

La época del token de la consola se emite contra la base **por defecto**, que en
producción es la de `galerias`. `PUT /api/auth/passwords` con `worker_password`
sube `token_epoch_worker` ahí y el token del operador muere en el pedido
siguiente:

```
métricas antes            -> 200
PUT /api/auth/passwords   -> 200   (lo hace un admin de galerias)
métricas después          -> 401
```

Es decir: **el administrador de un cliente puede cerrarle la consola al operador
de la plataforma**, sin ser operador y sin saber que lo hizo. Es una influencia
entre inquilinos que no debería existir, aunque su efecto máximo sea un
re-login.

Lo caracterizo y no lo marco `xfail` porque el builder lo eligió a conciencia y
lo justificó bien (la alternativa era no comprobar época para este token, que
sería quitar una defensa). El test lo deja fijado para que, si mañana se resuelve
con una época propia del registro, alguien lo note. **Vale la pena que
`docs/ESTADO.md` lo diga**, como ya sugirió el propio builder.

---

## H-6 · Estado de cuenta viejo servido del caché · BAJA

`estado_cuenta` entra al cuerpo cacheado, y el PATCH del interruptor invalida el
caché de `plataforma_estado` pero **no** el de métricas:

```
métricas antes del PATCH        -> acme: activo
PATCH /plataforma/clientes/acme -> 200 suspendido
/plataforma/clientes            -> acme: suspendido
métricas después (de_cache:true)-> acme: activo      ← hasta 5 minutos
```

No es privacidad, es confianza en el tablero: un número viejo se perdona (el
JSON lo dice con `de_cache: true`), pero un **estado de cuenta** viejo se lee
como que el corte no se aplicó — y el operador acaba de aplicarlo en la misma
pantalla. **Arreglo**: una línea, `limpiar_cache_metricas()` desde el PATCH, al
lado del `invalidar_cache_estado` que ya está.

---

## Lo que aguantó, en una tabla

Detalle ataque por ataque en `red-team-metricas.md`.

| Frente | Ataques | Resultado |
|---|---|---|
| **1 · Inspección profunda del JSON** | M-1 a M-8 | Ni una arroba · ningún sentinela (13) · ningún canon individual suelto · lista blanca **exacta** en todos los niveles · 34 claves prohibidas ausentes · los únicos arreglos son `clientes` y `top_proveedores` · nombre de proveedor sí, ficha no · sin texto libre inesperado |
| **2 · El token contra todo** | M-9 a M-12, M-35, M-36 | **51/51** endpoints de negocio en 401/403 · barrido automático de toda la app sin un 200/402 · `?token=` cerrado · slug `plataforma` no se puede fundar ni disfrazado · rutas deformadas (`..`, `%2f`, doble barra, caja) no sirven datos · **ningún otro endpoint de plataforma abre una base de cliente** (probado rompiéndolas) |
| **3 · La puerta** | M-13 a M-17, M-23, M-28 | No-operador con membresías → 403 · legado → 403 con cualquier `OPERADOR_EMAILS` · variable vacía o ausente → cierra para todos · revocación **inmediata** en el pedido siguiente · 8 correos casi-iguales rechazados · 17 períodos hostiles → 422 sin reflejo ni traza · verbos de escritura → 405 |
| **4 · Fugas laterales** | M-18 a M-22 | El cliente roto no filtra base, ruta, driver ni traza (15 venenos) · bitácora: 3 consultas = 3 líneas (la cacheada incluida) y ni un dato de negocio en ninguna columna · el motivo del estado no se cuela · las supresiones no se cuelan · **cada operador anota su propia línea** aunque el JSON sea el cacheado del otro |
| **5 · No-escritura** | M-24 a M-26 | Foto de **todas** las tablas (inspector, no tres elegidas) de las dos bases de negocio: idénticas · en el registro lo único que crece es `bitacora_plataforma`, exactamente +2 · el suspendido aparece con métricas y su fila **no tiene dónde** meter el motivo |
| **6 · Orden de rutas** | M-27 | La literal antes que las paramétricas, verificado en `app.routes` **y** en el comportamiento |

---

## `VERSION_POLITICA`: mi lectura independiente

Me pidieron decidir y justificar si esto amerita subir la versión
(re-consentimiento) o es aclaración editorial. El builder de backend y el de
legal ya argumentaron **no subirla**. **Coincido, con una condición que cambia
la respuesta si no se cumple.**

**Por qué no subirla, con mis propias razones:**

1. `VERSION_POLITICA` gobierna un **re-consentimiento**, no un changelog:
   subirla hace que `_tiene_consentimiento_vigente` dé falso para todos, que
   empiecen a recibir `pedir_consentimiento: true` y un 428 en el canje de
   invitaciones. Es una acción **sobre las personas**, y sólo se justifica
   cuando cambia **a qué están consintiendo**.
2. Lo que la Fase 4 agrega, **si el JSON es el que la spec describe**, no es un
   dato personal nuevo cambiando de manos: conteos, porcentajes, sumas y un top
   de proveedores. El único dato que roza a una persona —`ultimo_acceso`— sale
   sin hora y sin identidad, y el operador ya veía desde la Fase 2 el nombre del
   cliente, su estado de cuenta y las supresiones con el correo de quien las
   pidió.
3. La política sigue siendo **BORRADOR**, con `[COMPLETAR]` y
   `[VALIDAR CON ABOGADO]`: no se ha publicado ni se ha recogido consentimiento
   contra un texto definitivo, así que no hay nada que re-consentir.

**La condición, y es donde mi lectura agrega algo:** el argumento 2 vale
**sólo si H-1 y H-2 se arreglan**. Tal como está el código hoy, el operador
puede recibir (a) el correo o el nombre de una persona natural proveedora
metido en `Supplier.name`, y (b) el valor exacto de un contrato individual
cuando el cliente tiene uno solo. Eso ya **no** es "sólo agregados sin datos
personales": es lo que el punto 5.3 nuevo promete que no pasa.

Así que la disyuntiva real no es *editorial vs. re-consentimiento*, es:

* **Arreglar el código** para que el texto del punto 5.3 sea verdad → **no se
  sube la versión**, es aclaración editorial. ← **mi recomendación**
* **Dejar el código como está** → hay que reescribir el punto 5.3 para admitir
  que el operador puede ver el nombre de un proveedor persona natural y el valor
  de un contrato en clientes de un solo contrato. Y en ese caso **sí subiría la
  versión** antes de la primera publicación real, porque el texto pasaría a
  describir un tratamiento distinto del que hoy describe.

Y una salvedad que ya está bien puesta en el documento y que suscribo: si el
abogado considera que "un tercero accede a información derivada de los datos del
titular" es una **finalidad nueva** y no una precisión de la existente, entonces
corresponde subir la versión — y hay que hacerlo **antes** de la primera
publicación real, no después, para no disparar un re-consentimiento masivo el
día uno. La decisión de fondo es legal; lo técnico es que subirla cuesta una
línea (`VERSION_POLITICA` más el encabezado de los dos `.md`, que un test fija
byte a byte) y que el mecanismo ya está probado.

**Nota sobre las dos frases del punto 5.3.** Independientemente de la versión,
las frases *«nunca los datos de la persona de contacto»* / *«nunca … un dato de
una persona identificada … de sus proveedores»* y *«el operador nunca ve una
fila individual de negocio (un contrato …)»* hoy no son exactas. Que estén bajo
`[VALIDAR CON ABOGADO]` no las hace inofensivas: es justamente el texto que el
abogado va a leer para decidir.

---

## Verificación

Territorio respetado: sólo se crearon `backend/tests/test_metricas_ataques.py`,
este archivo y `red-team-metricas.md`. `git status` no muestra ningún otro
archivo tocado por esta auditoría.

```
rm -f backend/retail_espacios.db backend/recabra_*.db
cd backend && python -m pytest tests/test_metricas_ataques.py
    -> 33 passed, 3 xfailed
```

**Suite completa, verde DOS veces**, borrando las `.db` entre corridas
(gotcha **R-0** de `docs/ESTADO.md`: `test_correo_api.py` importa
`app.services.mailer` a nivel de módulo y deja `app.database` clavado contra
`backend/retail_espacios.db`):

```
corrida 1: 552 tests · 538 passed · 14 xfailed · 0 fallas · EXIT_RUN1=0
corrida 2: 552 tests · 538 passed · 14 xfailed · 0 fallas · EXIT_RUN2=0
```

El **patrón de puntos y de `x` es idéntico carácter por carácter** en las dos
corridas (comparado programáticamente, no a ojo): mismos tests, mismos
resultados, mismo orden. Los exit codes se capturaron sin tubería a `tail`, que
se lleva puesto el `$?` de pytest.

**Cero regresiones.** Los 14 `xfail` se reparten así, contados por decorador:

| Archivo | xfail | Origen |
|---|---|---|
| `test_identidad_ataques.py` | 2 | Fase 1 |
| `test_plataforma_ataques.py` | 3 | Fase 2 |
| `test_compliance_ataques.py` | 2 | Fase 3 |
| `test_metricas_conciliacion.py` | 4 | Fase 4, otro agente |
| `test_metricas_ataques.py` | **3** | **esta auditoría (H-1, H-2, H-3)** |

Los 7 pre-Fase-4 son exactamente los que ya estaban en `main`.

**Gotcha R-0 bis, confirmado de forma independiente.** El teardown de
`tests/conftest.py` borra **todos** los `recabra_*.db` del directorio temporal,
no sólo los suyos
(`glob.glob(os.path.join(carpeta, "recabra_*.db"))`). Con dos procesos de pytest
sobre el mismo `/tmp` —que es lo que pasa cuando dos agentes verifican en
paralelo— uno le borra al otro la base que tiene abierta y salen fallas fantasma
(`attempt to write a readonly database`, `file is not a database`) repartidas al
azar. Lo vi en la primera corrida de esta auditoría, exactamente como lo
reportó el builder de métricas. **Las corridas de arriba se hicieron con
`TMPDIR` propio.** El arreglo de fondo vive en `tests/conftest.py`, fuera de mi
territorio.

---

## Qué mirar si esto cambia

Los tres tests `xfail(strict=True)` son la alarma: el día que alguien tape H-1,
H-2 o H-3, el test pasa a **XPASS** y la suite se pone **en rojo**. Eso es
deliberado — es el recordatorio de sacarle el marcador y mover el hallazgo a la
columna de defensas que aguantan. No hay que "arreglar" el rojo borrando el
test.

Y tres tests que valen más de lo que parecen, para quien siga tocando esto:

* **`test_m36_…`** rompe la base de todos los clientes y exige que
  `/soy`, `/clientes`, `/supresiones` y el PATCH contesten 200 igual. Es el que
  detecta la regresión más cara imaginable: alguien que, para "mejorar" el
  listado de clientes, le agregue un conteo leído de la base de cada uno. Ese
  cambio pasaría **todos** los tests del contrato del JSON de métricas y
  rompería la enmienda igual.
* **`test_m10_…`** enumera las rutas de FastAPI en vivo, así que cubre los
  endpoints que todavía no existen. La lista curada envejece; la aplicación no.
* **`test_m19_…`** vuelca **todas** las columnas de `bitacora_plataforma` y
  busca los sentinelas ahí adentro. La bitácora es lo que compra el permiso de
  mirar el negocio de todos: si algún día se le agrega una columna "resumen",
  este test lo dice.
