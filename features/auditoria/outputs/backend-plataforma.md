# backend-plataforma — arreglos de auditoría (tendencia, snapshot, saneo, registro)

Seis hallazgos asignados, seis arreglados con su `xfail` convertido en verde.
Ningún arreglo relaja una frontera, desactiva un test ni agrega una columna
(SIN MIGRACIONES: no se tocó `app/models/plataforma.py`).

## Tabla

| id | severidad | arreglo | test que quedó verde |
|---|---|---|---|
| bugs-1 | alta | `_reconstruir_consolidado` unificada: para un cliente con fila previa manda SU FILA EN DISCO | `test_auditoria_bugs.py::test_bugs_1_...` |
| compliance-1 = frontera-2 | alta | `_recortar_top` sanea el nombre ANTES del `json.dumps` | `test_auditoria_compliance.py::test_compliance1_...`, `test_auditoria_frontera.py::test_f06_...` |
| frontera-1 | alta | `sanear_nombre_proveedor`: NFKC + borrado de `Cf` + separadores ampliados | `test_f04_...`, `test_f05_...` (+ `test_f03_...` como caracterización) |
| frontera-3 | alta | ventana de `periodo`, LRU acotado, nada de historia futura | `test_f07_...` |
| frontera-4 = ingresos-5 | alta | `purgar_registro()` llamada al final de `cerrar_mes_anterior()` | `test_f08_...` |
| frontera-6 | media/alta | `_anotar_consulta` + bitácora en `/supresiones` y `/clientes` | `test_f12_...` (y `test_f10_...` sigue verde) |

`test_f09` (frontera-5, K=3 despejable por diferencia contra el consolidado)
queda `xfail(strict=True)` tal cual: es una decisión de producto escalada al
usuario, no se toca en esta rama.

## Qué se hizo, hallazgo por hallazgo

### bugs-1 — el consolidado contradecía a sus sumandos (`app/plataforma_tendencia.py`)

La iteración 2 del arreglo de BUG-1 tenía dos ramas: si esta captura había
leído a TODOS los clientes con fila persistida, reconstruía "exacto" con
`crudos_por_slug`; si no, sumaba desde disco. La rama "exacta" era el bug: los
crudos en memoria son la base de HOY, y un cliente cuya fila ya estaba
congelada (contrato cancelado después de la captura) entraba al total con sus
números de hoy. Reproducción: acme congelada en 600, beta llega tarde con 900,
consolidado salía 1.200.

Ahora hay **una sola** reconstrucción, `_reconstruir_consolidado(filas_clientes,
crudos_por_slug, recien_insertados, con_error)`, con una regla de precedencia
única: el sumando sale de la memoria **sólo** si el slug está en
`recien_insertados` (su fila NACIÓ en esta captura, así que lo de memoria ES lo
que se acaba de escribir, y además trae ids reales de usuario y el conteo
completo por proveedor); para todo lo demás, de su fila en disco. Se eliminó
`_reconstruir_consolidado_desde_disco`.

`test_bugs_1_...` ahora afirma directamente `fila_consolidado['canon'] == 1500.0`
y que en `/tendencia` `acme + beta == consolidado`. Sigue verde
`test_tendencia_conciliacion.py::test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`.

### compliance-1 = frontera-2 — el nombre crudo del proveedor en el registro

`_recortar_top` es el único paso previo al `json.dumps` de
`snapshot_metricas.proveedores_json` (fila por cliente, consolidada y
reconstrucción). Ahora ordena y recorta con el nombre **ORIGINAL** (que es el
que agrupó, para no fundir dos proveedores al elegir el top) y **baja el nombre
SANEADO**; si dos originales del top sanean igual, se suman los conteos —la
misma aproximación que la rama desde disco ya aceptaba—. Los números siguen
crudos: K=3 se aplica al leer, en `publicar_fila`.

El saneo es idempotente (las máscaras no traen ni `@` ni dígitos), así que
`publicar_fila` lo sigue pasando por `_top` sin enmascarar dos veces. Hay un
assert de idempotencia en `test_compliance1_...` y otro en `test_f03_...`.

Docstrings actualizados: módulo de `plataforma_tendencia` ("los NÚMEROS se
protegen al leer; el NOMBRE, al escribir") y `_recortar_top`.

**Test existente ajustado y reportado**: `tests/test_plataforma_tendencia.py`
afirmaba el nombre con correo tal cual en disco
(`cons["proveedores"] == {..., PROVEEDOR_SUCIO: 2}`). Se agregó la constante
`PROVEEDOR_SUCIO_EN_DISCO = "Bimbo Distribuciones ([correo oculto])"` y se
afirma además que ninguna clave persistida trae `@`. Es el único cambio a un
test fuera de mi territorio de auditoría, y es exactamente la expectativa
literal sobre `proveedores_json` en disco que la asignación autorizaba.

`app/models/plataforma.py` NO se tocó (el docstring de la columna dice
"nombre_ORIGINAL"; queda desactualizado y es del otro builder / de ESTADO —
ver gaps).

### frontera-1 — el saneo sólo conocía ASCII (`app/plataforma_metricas.py`)

`sanear_nombre_proveedor` pasó de tres pasadas a cuatro:

0. `unicodedata.normalize("NFKC", ...)` como primer paso (`＠` U+FF20 → `@`,
   dígitos de ancho completo → ASCII, NBSP → espacio) y borrado de todo carácter
   de categoría `Cf` (U+200B..U+200D, U+FEFF, marcas de dirección).
1-3. correo, teléfono y tope de largo como antes, sobre el texto ya normalizado
   —el cinturón final `replace("@", " ")` incluido—.

`_TELEFONO_RE` amplió su clase de separadores a `[\s\-.()/_·,]`: `300/555/8899`,
`300_555_8899` y `300·555·8899` ya no se leían como tres números cortos.

Salida literal de la sonda f03 después del arreglo:

```
correo ascii   -> 'Norte [correo oculto]'
correo ancho   -> 'Norte [correo oculto]'
telefono ascii -> 'Valle Cel [teléfono oculto]'
telefono nbsp  -> 'Valle Cel [teléfono oculto]'
telefono zwsp  -> 'Valle Cel [teléfono oculto]'
telefono barras-> 'Valle Cel [teléfono oculto]'
```

### frontera-3 — `periodo` sin techo, cachés sin tope, historia futura

Variante acordada respecto de lo que proponía el auditor: los tests existentes
consultan meses futuros a propósito (un contrato que arranca el mes que viene se
mira preguntando por ese mes), así que la ventana NO es "hasta hoy".

* **(a)** `normalizar_periodo` acota a `[actual − MESES_HISTORIA_MAXIMO(24),
  actual + VENTANA_MESES_ADELANTE(12)]`. Fuera de ahí, `PeriodoInvalido` con
  texto fijo `"El período tiene que estar entre YYYY-MM y YYYY-MM."` → 422 por
  el router. `rango_del_periodo` **no cambió** (se prueba como unidad con
  `2028-02`). Las constantes de ventana viven en `plataforma_metricas` y
  `plataforma_tendencia` reusa `MESES_MAXIMO = MESES_HISTORIA_MAXIMO`: sin
  import circular y sin duplicar el horizonte.
* **(b)** `persistir_snapshots` retorna temprano (con `log.debug`) si
  `anio_mes > periodo_actual()`: un mes futuro es una proyección de la base de
  hoy, no historia — y persistirla la congelaría como un pasado que nunca
  ocurrió.
* **(c)** `_cache` y `_cache_contratos` son `OrderedDict` con
  `TOPE_CACHE_PERIODOS = 24`, `move_to_end` al acertar y `popitem(last=False)`
  al insertar de más, todo bajo el mismo candado. `limpiar_cache_metricas` los
  sigue vaciando.

`test_f07` reescrito: pide los 37 períodos de la ventana entera (más que el
tope), afirma `len(_cache) <= 24` y `len(_cache_contratos) <= 24`, que no hay
un solo snapshot con `periodo > actual` (y sí el del mes en curso, para que la
prueba valga), y 422 con `client.get` directo para `1900-01` y `9999-12`.
Siguen verdes `test_metricas_ataques.py` (períodos basura → 422) y los tests que
piden `2026-10` / `2026-11`.

### frontera-4 = ingresos-5 — el registro no se purgaba nunca

Nuevo `plataforma_tendencia.purgar_registro() -> dict[str, int]`, en una sesión
de registro:

* `BitacoraPlataforma.en < ahora − DIAS_QUE_SE_GUARDA` — la constante se
  **importa** de `app.services.bitacora`, no se duplica.
* `IntentoAlta.at < ahora − 24 h` (`HORAS_QUE_SE_GUARDA_EL_INTENTO`). La ventana
  del rate limit del alta es de 15 minutos (`routers/auth.LOGIN_WINDOW_SECONDS`),
  así que se purga sólo lo que ya no frenaba a nadie.
* `SnapshotMetricas.periodo < actual − (24 + 12) meses`, **excepto**
  `__consolidado__`: la serie larga del negocio se conserva entera (no habla de
  ningún cliente en particular ni trae un nombre de proveedor). Está dicho en el
  docstring.

Devuelve y loguea los conteos; nunca propaga. Se llama al **final** de
`cerrar_mes_anterior()`, en su propio `try/except`, y **también** cuando el
cierre no tenía nada que hacer: se reestructuró el `return` temprano en un `if`
para que la purga corra siempre. `app/main.py` no se tocó — el ciclo ya llama a
`cerrar_mes_anterior` una vez por vuelta, que es la cadencia que la purga
necesita; el docstring lo documenta ("las DOS tareas de plataforma del ciclo").

`test_f08` corre `main._run_lease_maintenance()` de verdad y ahora afirma
también la contracara: sobreviven una `BitacoraPlataforma` de ayer, un
`SnapshotMetricas` de hace 6 meses y la fila `__consolidado__` prehistórica; se
van la bitácora de 3 años, el `IntentoAlta` de 3 años y el snapshot por cliente
prehistórico.

### frontera-6 — la lectura de PII no dejaba constancia

`app/routers/plataforma.py`: el bloque `reg.add(BitacoraPlataforma(...))`
repetido tres veces se extrajo a `_anotar_consulta(email, accion, periodo)`
—sesión propia, commit, close, **nunca propaga** (loguea con `exception`): la
constancia no puede tumbar la consulta que constata—. Los tres endpoints
existentes lo usan **sin cambiar** sus valores de `accion` ni de `periodo`.

Se agregó la llamada en `listar_supresiones` (`accion="supresiones"`) y
`listar_clientes_plataforma` (`accion="clientes"`), ambos con
`periodo=periodo_actual()`, DESPUÉS de armar la respuesta y sin un solo dato de
negocio adentro de la línea. `GET /soy` no anota. Docstrings del módulo y de los
dos endpoints actualizados.

## Verificación

```
cd /tmp/retail-espacios-test/backend
TMPDIR=/tmp/pt-backend-plataforma python -m pytest -q -p no:cacheprovider \
  tests/test_auditoria_frontera.py tests/test_auditoria_bugs.py tests/test_auditoria_compliance.py
# 15 passed, 1 xfailed (f09 / frontera-5, por diseño)
```

Y los tests del módulo tocado:

```
... tests/test_plataforma_metricas.py tests/test_plataforma_tendencia.py
    tests/test_tendencia_ataques.py tests/test_tendencia_conciliacion.py
    tests/test_metricas_ataques.py tests/test_metricas_conciliacion.py
    tests/test_asesoria_ataques.py tests/test_asesoria_contador.py
    tests/test_plataforma_adopcion.py tests/test_plataforma_spread.py
# 1 fallo, AJENO: test_tendencia_ataques.py::test_t32_csp_de_main_solo_cambio_run_lease_maintenance
```

Ese fallo NO es mío: `t32` compara `git diff main -- backend/app/main.py` contra
la CSP, y `app/main.py` está modificado en el árbol por otro builder (10 líneas
agregadas). Yo no toqué `main.py` ni una línea. Queda para el Verificador / el
builder de hardening.

No se corrió la suite completa ni `npm run build`. No se tocó frontend, así que
no hubo `tsc`.

## Gaps (cosas que NO hice y por qué)

1. **`app/models/plataforma.py::SnapshotMetricas.proveedores_json`** sigue
   diciendo en su docstring "JSON: {nombre_ORIGINAL_del_proveedor: ...}" y "Se
   guarda el nombre SIN sanear porque el saneo se aplica al leer". Con el
   arreglo de compliance-1 eso dejó de ser cierto. El archivo está fuera de mi
   territorio (y es sólo texto, la columna no cambia de forma). **Pedido: que el
   Maestro asigne el retoque del docstring**, o que quede en la sección de
   ESTADO.
2. **`docs/ESTADO.md`** necesita cuatro renglones nuevos que no puedo escribir:
   la ventana de `periodo` (24/+12) y el LRU de 24, que un mes futuro no se
   persiste, la purga del registro (365 d / 24 h / 36 meses, `__consolidado__`
   exento) y que el nombre del proveedor ahora baja saneado a disco. También
   habría que reformular la limitación conocida del consolidado reconstruido:
   ahora la aproximación de usuarios/proveedores aplica sólo a las filas que
   salen de disco, y los recién insertados son exactos.
3. **frontera-5 (f09) sigue abierta**, `xfail(strict=True)`: el ingreso
   consolidado permite despejar el canon del contrato único de un cliente
   suprimido por K=3. Decisión de producto escalada al usuario — arreglarla
   implica o suprimir el consolidado o excluir a los clientes suprimidos de él,
   y las dos cosas cambian la spec de la Fase 4. No la toqué.
4. **`test_t32` de `test_tendencia_ataques.py` está en rojo por el diff de
   `app/main.py` de otro builder.** Lo reporto en vez de arreglarlo: `main.py`
   no es mi territorio y "arreglar" el test sería relajar un guardrail de CSP.
5. **Efecto lateral del saneo al escribir**: dos proveedores distintos cuyos
   nombres sanean igual (p. ej. dos correos distintos con el mismo prefijo)
   ahora se funden en la fila persistida, con los conteos sumados. Es la misma
   aproximación que la rama desde disco ya aceptaba y el top público ya la
   sufría, pero ahora también afecta al crudo guardado. Lo documento acá porque
   es una pérdida de fidelidad real, aunque menor y deliberada.
