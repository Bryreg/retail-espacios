# Auditoría integral — Dimensión 3: la frontera del operador (`/plataforma`)

Auditor: **frontera**. Rama `claude/auditoria-integral`, árbol `/tmp/retail-espacios-test`.
Archivo de test: `backend/tests/test_auditoria_frontera.py` (12 tests: 5 verdes,
7 `xfail(strict=True)`).

```
cd backend && mkdir -p /tmp/pt-frontera && TMPDIR=/tmp/pt-frontera python -m pytest -q tests/test_auditoria_frontera.py
5 passed, 7 xfailed, 2 warnings in 15.98s
```

No se arregló una sola línea de producción. Nada corrió contra
`retail-espacios.onrender.com`: todo con `TestClient` sobre el árbol local.

## Qué se atacó y qué NO se repitió

Se dieron por cubiertos (y se verificaron leyendo los tests, no la prosa) los
ataques ya escritos: barrido de rutas con cabecera (m9/m10/m11), bitácora de
métricas y adopción (m19/a8), motivo del estado (m20/a13), caché y atribución en
`/metricas` (m22), K=3 del spread y su despeje (a16/a17/a18), base rota
(m18/a12), `_es_path_de_plataforma` con frontera de segmento (m31, ya arreglado).

Los siete bordes nuevos: normalización Unicode del saneo de proveedor, lo que el
saneo NO alcanza (el crudo persistido), el `periodo` como palanca de crecimiento,
la ausencia de purga en el registro, el despeje de K=3 por el *ingreso*
consolidado, y la bitácora que no cubre la lectura de PII.

## Hallazgos

| id | severidad | qué | test |
|---|---|---|---|
| frontera-1 | media | El saneo del nombre de proveedor no normaliza Unicode: `＠` (U+FF20) y `U+200B` dejan pasar correo y teléfono enteros | f04, f05 (+ sonda f03) |
| frontera-2 | media | El nombre CRUDO del proveedor (con su correo) queda persistido sin plazo en `snapshot_metricas`, que vive en la base de GALERIAS | f06 |
| frontera-3 | media | `?periodo=` sin tope: caché de proceso que crece por período y snapshots escritos para meses arbitrarios, futuros incluidos | f07 |
| frontera-4 | media | `bitacora_plataforma` / `snapshot_metricas` no se purgan nunca; `AuditEntry` sí (365 días) | f08 |
| frontera-5 | **alta** | K=3 se despeja por diferencia: el canon EXACTO del contrato único de un cliente suprimido sale del consolidado | f09 |
| frontera-6 | media | `GET /supresiones` y `GET /clientes` sirven PII (correo, id, motivo) sin dejar una línea de bitácora | f12 |

---

### frontera-5 · alta · El ingreso consolidado despeja la celda que K=3 escondió

**Reproducción** — `test_f09_hallazgo_el_consolidado_despeja_el_contrato_unico_del_cliente_suprimido`
(`xfail(strict=True)`). Cliente A con 3 contratos de 1.000.000 (publica), cliente
B con **un solo** contrato de 4.173.919 (suprimido por K=3: su
`ingreso_contratado_mes`, su `canon_promedio_mensual` y su top van en
`null`/`[]`). Salida literal con `--runxfail`:

```
AssertionError: el canon del contrato único de B se despejó del consolidado: 4173919.0
assert 0.0 > 1.0
 +  where 0.0 = abs((4173919.0 - 4173919.0))
```

`ingreso_consolidado − ingreso_de_A` da el monto exacto, al peso, del contrato
individual de B. Con N clientes es idéntico: alcanza con que N−1 publiquen. El
comentario de `_suprimir_celda_chica` dice explícitamente que lo que se protege
es que "el operador reconstruya la fila entera"; el cierre de la Fase 6 tapó esta
misma aritmética para el **spread** (`_consolidar`, hallazgo H-1 / test a17) pero
dejó abierto el **ingreso**, que es la cifra que la spec nombra primero ("nunca
valores de contratos individuales").

**Archivos**: `backend/app/plataforma_metricas.py`
(`consolidar_agregado` / `_consolidar` / `_suprimir_celda_chica`).

**Arreglo propuesto** (decisión de producto, igual que a17): el consolidado suma
sólo a los clientes cuyo propio `ingreso_contratado_mes` se publica —
`publicables = [a for a in acumulado if a["contratos"] >= K_MINIMO_CONTRATOS]` —
tanto para `ingreso_contratado_mes` como para `canon_promedio_mensual`,
exactamente como ya se hace con `spread_pct`. Cuesta que el "total del negocio"
deje de ser el total (precedente m26, que habría que reescribir); la alternativa
menos invasiva es suprimir el ingreso consolidado cuando **algún** cliente quedó
suprimido y hay menos de K clientes suprimidos entre los que repartir la
diferencia. La misma corrección hay que aplicarla en `publicar_fila` de
`plataforma_tendencia.py`, que reconstruye el consolidado desde disco con la
misma regla.

---

### frontera-1 · media · El saneo del proveedor sólo conoce ASCII

**Reproducción** — sonda `test_f03_sonda_el_saneo_solo_conoce_los_caracteres_ascii`
(verde, documenta el comportamiento) y dos `xfail(strict=True)`:
`test_f04_...arroba_ancha...` y `test_f05_...espacio_de_ancho_cero...`.

Salida literal de la sonda (`sanear_nombre_proveedor`):

```
'Norte juan.perez.distribuciones@correo-personal.example' -> 'Norte [correo oculto]'
'Norte juan.perez.distribuciones＠correo-personal.example' -> sin cambios
'Valle Cel 300 555 8899'   -> 'Valle Cel [teléfono oculto]'
'Valle Cel 300\xa0555\xa08899' -> 'Valle Cel [teléfono oculto]'
'Valle Cel 300​555​8899' -> sin cambios
'Valle Cel 300/555/8899'   -> sin cambios
```

`_CORREO_RE` y el "cinturón" `limpio.replace("@", " ")` piden un `@` ASCII: con
U+FF20 (o U+FE6B) el buzón completo de un tercero sale al JSON de `/metricas`
**y de `/tendencia`** (el saneo se aplica al leer, así que los dos endpoints
heredan el agujero). `_TELEFONO_RE` admite espacio, guion, punto y paréntesis
entre dígitos, pero `\s` no cubre U+200B (categoría `Cf`): el celular se lee como
tres números cortos, ninguno llega al umbral de 7, y sale entero. `/` como
separador tiene el mismo efecto sin necesidad de Unicode.

Se rebaja de "alta" a **media** con honestidad: el receptor es un operador
autenticado y autorizado a ver el nombre del proveedor, y hace falta que el
supermercado haya tecleado o pegado esa forma. Pero la invariante que el módulo
declara ("ningún string del JSON trae una arroba") hoy es falsa.

**Archivos**: `backend/app/plataforma_metricas.py` (`sanear_nombre_proveedor`,
`_CORREO_RE`, `_TELEFONO_RE`).

**Arreglo propuesto**: normalizar antes de enmascarar —
`unicodedata.normalize("NFKC", nombre)` (convierte `＠`→`@` y los dígitos de
ancho completo) y borrar los invisibles (`Cf`: `U+200B`-`U+200D`, `U+FEFF`) con
un `str.translate`—, ampliar la clase de separadores de `_TELEFONO_RE` con `/`,
`_`, `·` y `,`, y bajar el cinturón final a "cualquier carácter cuya
`NFKC` sea `@`". Test de regresión: los mismos f03/f04/f05 sin el marcador.

---

### frontera-2 · media · El crudo del proveedor queda en el registro, en claro y sin plazo

**Reproducción** — `test_f06_hallazgo_el_nombre_crudo_del_proveedor_queda_guardado_en_el_registro`
(`xfail(strict=True)`). Salida literal:

```
AssertionError: el correo del proveedor quedó en el registro, en claro:
'{"Distribuciones Norte juan.perez.distribuciones@correo-personal.example": 3}'
```

`persistir_snapshots` guarda `proveedores_json` con el nombre **original** (por
un motivo válido: agrupar por el saneado fundiría dos proveedores distintos). El
efecto colateral es que el correo o el teléfono que un supermercado tecleó
adentro de `Supplier.name` queda copiado, en claro, en `snapshot_metricas` — una
tabla del REGISTRO, que es la base por defecto, o sea **la base de negocio de
GALERIAS**. Dato personal de un tercero de un cliente, en reposo adentro de la
base de otro cliente, sin plazo de retención (ver frontera-4). No hay ruta de
lectura cruzada hoy (sólo `/plataforma` lee esa tabla), por eso es media y no
crítica.

**Archivos**: `backend/app/plataforma_tendencia.py` (`persistir_snapshots`,
`_recortar_top`), `backend/app/models/plataforma.py` (`SnapshotMetricas`).

**Arreglo propuesto**: persistir el nombre **saneado** como clave del JSON y el
recorte/orden seguir resolviéndolos con el original en memoria (el original ya no
hace falta después del top-5: nadie reagrupa desde disco). Si se quiere conservar
la exactitud del agrupamiento entre capturas, guardar un hash corto del original
como clave y el saneado como valor.

---

### frontera-3 · media · El `periodo` no tiene techo: caché y snapshots crecen a pedido

**Reproducción** — `test_f07_hallazgo_cada_periodo_pedido_agranda_el_cache_y_el_registro`
(`xfail(strict=True)`). 25 períodos distintos (1900-01 … 1905-10 y `9999-12`).
Salida literal:

```
AssertionError: se persistió historia de meses futuros: ['9999-12']
AssertionError: el caché de métricas guarda 25 períodos distintos, sin tope ni desalojo
```

`normalizar_periodo` acepta cualquier `YYYY-MM` entre 1900-01 y 9999-12 (≈97.000
valores). Cada período que no esté en caché (a) recorre las N bases de negocio —
trabajo real por pedido, sin límite de concurrencia—, (b) agrega una entrada a
`_cache` **y** a `_cache_contratos`, diccionarios de proceso con TTL pero **sin
tope de tamaño ni desalojo**, y (c) **escribe filas en `snapshot_metricas`** para
ese período. La (c) es la peor: la serie histórica es escritura *write-through*
de un GET, así que un operador que teclea mal un año inventa historia — y un mes
FUTURO escrito hoy se leerá el mes que viene como un punto real de la tendencia,
con los contratos de hoy proyectados hacia adelante.

Requiere token de operador, por eso no es "DoS trivial": es media.

**Archivos**: `backend/app/plataforma_metricas.py` (`normalizar_periodo`,
`metricas_del_periodo`, `_cache`, `_cache_contratos`),
`backend/app/plataforma_tendencia.py` (`persistir_snapshots`).

**Arreglo propuesto**: acotar `normalizar_periodo` a la ventana que la consola
usa de verdad (por ejemplo, de `MESES_MAXIMO` meses atrás hasta el mes en curso;
un período fuera de rango es 422, coherente con la regla de "el que teclea mal se
entera"), y no persistir snapshot cuando `anio_mes > periodo_actual()`. De paso,
`_cache`/`_cache_contratos` con tope duro (`OrderedDict` LRU de ~24 entradas):
sin migraciones, sin tabla nueva.

---

### frontera-4 · media · Lo que crece en el registro no se purga nunca

**Reproducción** — `test_f08_hallazgo_la_bitacora_del_operador_no_se_purga_nunca`
(`xfail(strict=True)`). Se siembra una línea de `AuditEntry` (base de cliente) y
una de `BitacoraPlataforma` (registro), las dos con tres años de antigüedad, y se
corre una vuelta real de `main._run_lease_maintenance()`:

```
assert quedan_cliente == 0   → PASA (la purga de la base de cliente sí corrió)
AssertionError: la bitácora del operador de hace tres años sigue entera:
                la tabla no se purga nunca
assert 1 == 0
```

`_run_lease_maintenance` llama a `services.bitacora.purgar(db)` por cada base de
cliente (`DIAS_QUE_SE_GUARDA = 365`), con un comentario que dice exactamente por
qué: "la bitácora no puede crecer para siempre en una base de plan gratuito". Las
tres tablas que crecen en el REGISTRO —`bitacora_plataforma`,
`snapshot_metricas`, `intentos_alta`— no tienen ningún equivalente. Es a la vez
disponibilidad (disco de plan chico, y el registro es la base de GALERIAS) y
retención (Ley 1581: dato conservado sin plazo, agravado por frontera-2, que
mete PII de terceros justamente ahí).

**Archivos**: `backend/app/main.py` (`_run_lease_maintenance`),
`backend/app/services/bitacora.py` (`purgar`, el precedente),
`backend/app/models/plataforma.py`.

**Arreglo propuesto**: un `purgar_registro()` al final de la vuelta de
mantenimiento, junto a `cerrar_mes_anterior()`: `BitacoraPlataforma` con el mismo
horizonte de 365 días (o el que fije compliance), `IntentoAlta` con horas, y
`SnapshotMetricas` acotado a `MESES_MAXIMO + margen` **excepto** las filas del
consolidado si se quiere serie larga. Sin migraciones: son `DELETE`.

---

### frontera-6 · media · La bitácora cubre los agregados, no la PII

**Reproducción** — `test_f12_hallazgo_leer_las_supresiones_no_deja_una_sola_linea`
(`xfail(strict=True)`):

```
AssertionError: leer supresiones y clientes no dejó ninguna línea: 0 -> 0
```

`BitacoraPlataforma` la escriben EXACTAMENTE tres endpoints: `/metricas`,
`/tendencia` y `/adopcion` (los tres agregados, donde no hay una sola persona
identificable). `GET /api/plataforma/supresiones` devuelve **`email`,
`usuario_id` y `motivo`** de cada titular que ejerció habeas data, y
`GET /api/plataforma/clientes` devuelve el `motivo` del corte de cada cuenta —
que en la práctica lleva adentro nombres, números de factura y correos de
contacto—. Ninguna de las dos lecturas deja rastro de quién la hizo. Los PATCH sí
dejan constancia (`atendido_por`/`cambiado_por` en la propia fila), como
documenta el router; el agujero es la LECTURA. La ironía está en el diseño: la
Fase 4 construyó una bitácora para los números agregados y dejó sin ella a los
dos endpoints que devuelven datos personales de verdad.

**Archivos**: `backend/app/routers/plataforma.py` (`listar_supresiones`,
`listar_clientes_plataforma`, `soy_operador`).

**Arreglo propuesto**: extraer el bloque de `reg.add(BitacoraPlataforma(...))` a
un helper `anotar_consulta(email, accion, periodo)` y llamarlo también en
`listar_supresiones` (`accion="supresiones"`) y `listar_clientes_plataforma`
(`accion="clientes"`), con `periodo` = `periodo_actual()` y **sin** dato de
negocio adentro (el test f10 ya afirma esa invariante para las tres acciones
existentes; hay que sumarle las nuevas). `GET /soy` no lo necesita: no devuelve
nada de nadie.

## Defensas que aguantaron (caracterizaciones verdes)

* **f01** — Barrido de las 8 rutas del router con espía sobre `clientes.sesion_de`:
  las ÚNICAS que abren una base de negocio son `/metricas` y `/adopcion` (que
  reusa el caché de la primera). `/tendencia`, `/clientes`, `/supresiones`,
  `/soy` y los dos PATCH no abren ninguna. La enmienda de la regla del operador
  se sostiene con las Fases 5 y 6 adentro.
* **f02** — Barrido de TODA la app con el token de consola por `?token=` (el
  camino del `<img>`/`<iframe>`, no la cabecera): cero 2xx fuera de
  `/api/plataforma` que un anónimo no obtenga igual (`/api/health` y
  `/api/auth/clientes` son públicos por diseño). `_cliente_de_la_consola` corta
  antes de que exista sesión de base.
* **f10** — Dos operadores distintos sobre `/tendencia` y `/adopcion`: mismos
  números (caché de proceso, no de operador) y una línea de bitácora por
  consulta con el correo correcto de cada uno, acierto de caché incluido.
  Ninguna línea lleva dato de negocio.
* **f11** — PATCH de estado real con un motivo que contiene un correo: no vuelve
  por `/metricas`, `/tendencia` ni `/adopcion`, y el caché de métricas se
  invalidó (M-1) — el `estado_cuenta` nuevo se ve en el pedido siguiente y
  `de_cache` vuelve en `false`.

## Sospechas sin confirmar

* **Actividad de una persona identificable sin K.** Con `usuarios_con_cuenta == 1`
  —el caso normal de un supermercado chico—, `ultimo_acceso` (`/metricas`) y
  `dias_sin_acceso` (`/adopcion`) SON la actividad de un individuo concreto y
  nombrable (la dueña, que es la única cuenta). La spec de la Fase 4 lo autoriza
  explícitamente ("la FECHA del último acceso"), así que no lo marco como
  hallazgo: es una decisión, no un defecto. Queda escrito porque la misma lógica
  que justificó K=3 sobre la plata aplica sobre las personas.
* **Vaciado del caché como amplificador.** frontera-3 muestra que cada período
  nuevo recorre las N bases; no medí si un operador puede sostener ese recorrido
  en paralelo hasta agotar el pool de conexiones (`POOL_POR_CLIENTE = 2` +
  3 de desborde). Hace falta una prueba de concurrencia que no cabe en TestClient
  sin levantar un server real.
* **`origen="vista"` en snapshots de meses ajenos.** Un snapshot escrito por un
  período pasado que todavía no tenía fila queda congelado con los datos de HOY
  proyectados hacia atrás (lo dice el propio módulo). No lo probé como hallazgo
  porque es el comportamiento declarado; lo que sí probé (f07) es que además se
  puede disparar para meses que nunca existieron.
* **`GET /soy` como oráculo.** Contesta `{"operador": true|false}` a cualquier
  token válido. No lo consideré hallazgo: quien pregunta ya está autenticado y
  sólo aprende sobre sí mismo.
