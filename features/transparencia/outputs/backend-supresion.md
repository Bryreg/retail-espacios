# Backend — quitar K=3 y reescribir sus tests (Fase 7, Parte A)

Builder: "Backend — quitar K=3 y reescribir sus tests". Territorio: `backend/app/plataforma_metricas.py`, `backend/app/plataforma_tendencia.py`, los tests listados en la misión, y `docs/ESTADO.md`. No se tocaron routers, `clientes.py`, models ni frontend.

## Qué cambió, por archivo

### `backend/app/plataforma_metricas.py`
- Eliminados `K_MINIMO_CONTRATOS` y `_suprimir_celda_chica` enteros (constante, función y todo comentario que los explicaba).
- `_spread(canon, tarifa, contratos)`: misma firma; ahora `None` solo si `contratos == 0` o `tarifa <= 0`; si no, `round((canon/tarifa - 1)*100, 1)`. Sin piso de 3.
- `publicas_desde_crudos`: ya no llama a `_suprimir_celda_chica`. `ingreso_contratado_mes` siempre número (`0.0` con 0 contratos), `canon_promedio_mensual` `null` solo sin contratos, `top_proveedores` la lista real de `_top`.
- `consolidar_agregado`: mismo cambio, sin la supresión final.
- `_consolidar`: el spread consolidado ya NO filtra por `publicables` (`contratos_con_tarifa >= K_MINIMO_CONTRATOS`); suma `canon_con_tarifa`/`tarifa_total`/`contratos_con_tarifa` de **todo** `acumulado`, igual que ya hacía el ingreso consolidado.
- Docstrings reescritos: cabecera del módulo, `publicas_desde_crudos`, `consolidar_crudos`, `consolidar_agregado`, `_consolidar`, y los comentarios internos de `_metricas_de_un_cliente` y del import local de `persistir_snapshots` — todos dicen ahora "agregados exactos, sin umbral" y nombran al reporte de transparencia (`app/plataforma_reporte.py`, `GET /api/clientes/mi-reporte-plataforma`, `GET /api/plataforma/clientes/{slug}/reporte`) como la contrapartida.

### `backend/app/plataforma_tendencia.py`
- Import a nivel de módulo: se quitó `_suprimir_celda_chica` de `from app.plataforma_metricas import (...)`.
- `publicar_fila`: ya no llama a `_suprimir_celda_chica`; reusa solo `_pct`, `_plata`, `_top`. Docstring reescrito.
- `_mes_vacio`: sin cambios de comportamiento (sigue siendo `null`/`[]` por ausencia de dato); docstring aclara que la razón ya no es la supresión sino la ausencia de fila.
- Docstrings reescritos: cabecera del módulo (sección "Los NÚMEROS se protegen al LEER..." reescrita a "Fase 7 — agregados EXACTOS, sin umbral").
- `contratos_activos` y `ocupadas` siguen sin salir jamás al JSON (eso no cambia: son crudos de negocio, no algo que la spec deje cruzar, independiente del umbral).

Verificación de restos:
```
$ grep -rn "K_MINIMO\|_suprimir_celda_chica" backend/app
(vacío)
```
`python -c "import app.main"` — sin errores.

## Tabla test viejo → test nuevo

| Archivo | Test viejo (K=3) | Test nuevo / tratamiento |
|---|---|---|
| test_plataforma_metricas.py | `test_con_menos_de_tres_contratos_la_plata_se_suprime` | `test_con_un_contrato_de_4_173_919_el_ingreso_y_el_canon_salen_exactos` (usa exactamente el monto de la spec) |
| | `test_con_dos_contratos_tambien_se_suprime` | fusionado en `test_con_cualquier_cantidad_de_contratos_el_agregado_sale_exacto` (parametrizado 1/2/3/5) |
| | `test_con_tres_contratos_ya_se_publica` | idem (mismo test parametrizado; 3 ya no es especial) |
| | `test_la_supresion_no_toca_los_conteos_ni_la_ocupacion` | `test_los_conteos_y_la_ocupacion_no_dependen_de_cuantos_contratos_haya` |
| | `test_el_consolidado_se_calcula_con_los_datos_subyacentes_de_las_filas_suprimidas` | `test_el_consolidado_es_exactamente_la_suma_de_todas_las_filas_legibles` (la aserción se invierte: `visibles == consolidado`, ya no `!=`) |
| | `test_el_consolidado_tambien_se_suprime_si_toda_la_plataforma_tiene_menos_de_tres` | `test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_pocos_contratos` |
| | (nuevo) | `test_con_cero_contratos_el_ingreso_es_0_0_y_el_canon_null` — cubre el caso `0` explícitamente pedido por la spec |
| test_metricas_conciliacion.py | `test_la_frontera_de_K_son_tres_contratos` | `test_con_2_o_3_contratos_la_fila_publica_el_numero_exacto_por_igual` |
| | `test_con_menos_de_K_contratos_en_toda_la_plataforma_el_consolidado_tambien_se_suprime` | `test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_pocos_contratos` |
| | CENTRO/SUSP/GALERIAS (constantes de datos) | reescritas: ingreso/canon/top exactos en vez de `null`/`[]`; `OCULTO_*` se conservan como referencia (ahora coinciden literalmente con lo publicado) |
| | 6 tests de conciliación (ingreso, espacios, top de proveedores, etc.) | reescritos: la conciliación ahora cierra SIN residuo (antes había que sumarle a mano lo oculto) |
| test_metricas_ataques.py | `test_m30_hallazgo_celda_de_uno_el_agregado_es_el_valor_individual` (afirmaba que el canon NO aparecía) | `test_m30_con_un_solo_contrato_el_canon_sale_exacto_por_decision_de_producto` (afirma lo contrario: el canon SÍ aparece, y por qué) |
| | `test_m26_...` (comentario y aserciones sobre BETA suprimido) | mismo test, reescrito para afirmar `BETA_INGRESO`/`BETA_CANON_PROMEDIO` exactos |
| test_plataforma_tendencia.py | `test_k3_se_aplica_mes_a_mes` | `test_el_agregado_exacto_se_aplica_mes_a_mes` |
| test_tendencia_ataques.py | `test_t14_menos_de_k3_no_publica_el_monto_caracteristico` | `test_t14_con_un_contrato_el_monto_caracteristico_sale_exacto` (afirma que el monto SÍ sale, y que el correo/teléfono del proveedor sigue sin salir) |
| | `test_t18_beta_con_tres_contratos_no_filtra_datos_individuales` | `test_t18_beta_publica_el_agregado_sin_filtrar_datos_individuales` (mismas aserciones numéricas, docstring/nombre actualizados: ya no depende de "superar K=3") |
| | `test_t15...` (comentario) | mismo test, comentario reescrito |
| test_tendencia_conciliacion.py | `test_k3_por_mes_en_la_serie_del_cliente` | `test_el_agregado_exacto_se_aplica_mes_a_mes_en_la_serie_del_cliente` |
| | `test_consolidado_usa_los_datos_subyacentes_del_cliente_suprimido` | `test_consolidado_usa_los_datos_subyacentes_del_cliente` (mismos números — el consolidado nunca dependió de la supresión — docstring/nombre actualizados) |
| | `test_plataforma_entera_bajo_k3_suprime_el_consolidado` | `test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_un_solo_contrato` |
| | `test_consolidado_canon_es_ponderado` (aserción sobre acme suprimida) | mismo test, `acme["canon_promedio_mensual"] == 100.0` / `ingreso == 200.0` en vez de `None` |
| test_asesoria_ataques.py | `test_a3_k3_del_spread_no_deja_despejar_la_tarifa` | `test_a3_el_spread_con_pocos_contratos_publica_exacto_sin_umbral` (2 contratos → −10,0; 1 contrato → −10,0 también, en vez de `null`) |
| | `test_a16_caracterizacion_el_consolidado_no_despeja_al_cliente_suprimido` | `test_a16_caracterizacion_el_consolidado_del_spread_suma_a_todos` — afirma que A y B publican exacto y el consolidado es −12,5 (Σ de todos) |
| | `test_a17_hallazgo_la_suma_de_tarifas_de_un_cliente_suprimido_no_deberia_despejarse` | `test_a17_caracterizacion_el_despeje_ya_coincide_con_el_spread_publicado` — la misma aritmética del "ataque" ahora coincide con el spread publicado de B, porque ya no hay nada oculto |
| | `test_a18_caracterizacion_con_tres_contratos_homogeneos_la_tarifa_se_estima` | mismo test, docstring reescrito (el residual ya no está acotado por K=3, vale para cualquier n) |
| | `test_a15_...` (aserción `"3 contratos" in bajo or "tres contratos" in bajo`) | reemplazada por `"agregados exactos"`, `"sin umbral"`, `"reporte de transparencia"`, `"mi-reporte-plataforma"` (las 4, manteniendo el resto de aserciones) |
| test_asesoria_contador.py | `test_02_dos_contratos_suprimen_el_spread_pero_no_la_tarifa_configurada` | `test_02_dos_contratos_publican_el_spread_exacto` (B: spread −10,0, canon 900.000, ingreso 1.800.000) |
| | `test_06_consolidado_ponderado_excluye_al_cliente_suprimido` | `test_06_consolidado_ponderado_incluye_al_cliente_chico` (consolidado −18,3 sumando A+B+D; B publica −10,0 en su fila) |
| | `test_07_consolidado_con_menos_de_tres_contratos_con_tarifa_es_null` | `test_07_el_consolidado_es_null_solo_sin_ningun_contrato_con_tarifa` (2 contratos → −10,0, no `null`) |
| | `CONS_PROMEDIO_DE_SPREADS` (constante) | recalculada: −14,77 (promedio de A, B y D los tres publicados; antes solo A y D, −17,15) |
| test_auditoria_frontera.py | `test_f09_hallazgo_el_consolidado_despeja_el_contrato_unico_del_cliente_suprimido` (`xfail(strict=True)`) | **ELIMINADO**, con un comentario en su lugar explicando la resolución por decisión de producto (Fase 7). El helper `_dos_clientes_uno_de_un_solo_contrato` (usado solo por ese test) se eliminó junto con él — no lo usaba ningún otro test del archivo. `CANON_UNICO` también se eliminó (sin otro uso). |
| test_plataforma_spread.py | `test_dos_contratos_con_tarifa_dan_null_por_K3` | `test_dos_contratos_con_tarifa_publican_el_spread_exacto` (no estaba en la lista mínima de la misión, pero el nombre y la aserción dependían de K=3 — se justifica el cambio: sin esto el archivo quedaba rojo) |
| test_auditoria_bugs.py | comentario línea ~246 (K=3) | actualizado, sin cambio de comportamiento del test |
| test_auditoria_compliance.py | comentarios líneas ~180 y ~205 (K=3) | actualizados, sin cambio de comportamiento del test |

Todos los tests "viejos" mencionados en la misión tienen versión nueva; ninguno se borró sin justificación salvo `test_f09` (justificado explícitamente, per spec).

## `docs/ESTADO.md`

Editado como único responsable de este archivo en esta fase:

1. **Fase 4**: reescrita la "enmienda de la regla del operador" — agregados exactos sin umbral, contrapartida el reporte de transparencia; quitado el párrafo "Supresión de celda chica"; actualizado también el bullet de "Pendientes conocidos" sobre `VERSION_POLITICA` (marcado como superado en Fase 7).
2. **Fase 5**: reescrito el párrafo "La supresión K=3 se aplica AL LEER..." → ya no hay supresión, el saneo del nombre sigue igual.
3. **Fase 6**: reescrito el párrafo de definición del spread (sin `K_MINIMO_CONTRATOS`/`_suprimir_celda_chica`), el "Riesgo residual aceptado" (ya no acotado a exactamente 3), y la "Decisión de privacidad del spread" (el consolidado vuelve a sumar a todos).
4. **Auditoría integral**: `frontera-5` marcado RESUELTO por decisión de producto (Fase 7), con referencia a `test_f09` eliminado.
5. **Sección nueva `### Fase 7 — Transparencia`**: Parte A (este trabajo), Parte B (módulo `app/plataforma_reporte.py`, catálogo taxativo, los dos endpoints, el shape JSON exacto tal como lo dio el Maestro) y Parte C (`VERSION_POLITICA = "2026-09-v2"`, re-consentimiento, §5.3). Las Partes B y C las construye/construyó otro agente en paralelo; documenté lo que la spec exige de ellas para que ESTADO.md quede consistente como un solo documento.
6. Fecha de "Última actualización" en la cabecera, actualizada a 2026-09-05 / Fase 7.

## Resultado exacto de pytest (territorio, corrida en serie)

```
$ cd backend && TMPDIR=/tmp/pt-backend-supresion python -m pytest -q \
    tests/test_plataforma_metricas.py tests/test_metricas_conciliacion.py \
    tests/test_metricas_ataques.py tests/test_plataforma_tendencia.py \
    tests/test_tendencia_ataques.py tests/test_tendencia_conciliacion.py \
    tests/test_asesoria_ataques.py tests/test_asesoria_contador.py \
    tests/test_auditoria_frontera.py tests/test_plataforma_spread.py \
    tests/test_plataforma_adopcion.py

...F.................F.......... (resto en verde)
=========================== short test summary info ============================
FAILED tests/test_tendencia_ataques.py::test_t22_ninguna_tabla_existente_gano_columnas
FAILED tests/test_auditoria_frontera.py::test_f01_solo_metricas_tendencia_y_adopcion_abren_una_base_de_cliente
```

Las 2 fallas restantes **no son de mi territorio ni de K=3** — están causadas por trabajo de otros agentes ya presente en el árbol compartido (ver "Dependencias pendientes" abajo). Corrida cada archivo individualmente (sin las otras suites tocando el mismo `TMPDIR` en paralelo) confirma lo mismo: **cero fallas atribuibles a este trabajo**. `test_a15` (dependía de que el agente legal reescribiera la política) **ya pasa** — la política fue actualizada mientras yo trabajaba.

`python -c "import app.main"` → sin errores.

## Grep de restos

```
$ grep -rn "K_MINIMO\|_suprimir_celda_chica" backend/app
(vacío)
```

## Dependencias pendientes de otro agente (no tocadas, fuera de mi territorio)

1. **`test_auditoria_frontera.py::test_f01_...`** — falla porque `app/routers/plataforma.py` y `app/clientes.py` ya tienen (sin commitear, cambio de +54 líneas visto con `git diff --stat HEAD`) la ruta nueva `GET /api/plataforma/clientes/{slug}/reporte` (Parte B, la construye otro agente). El test de frontera barre TODAS las rutas del router de plataforma y exige que solo `/metricas`, `/tendencia` y `/adopcion` abran una base de cliente — la ruta de reporte también abre una (correcto, es su función), así que esta prueba de frontera va a necesitar que el agente de routers (o el Verificador) la actualice para incluir `GET /api/plataforma/clientes/{slug}/reporte` en la lista `permitidas`. No lo hice yo porque `routers/plataforma.py` está fuera de mi territorio y modificar el test para "aceptar" un endpoint que construye otro agente antes de que esté terminado/revisado no me corresponde.
2. **`test_tendencia_ataques.py::test_t22_...`** — falla porque `app/models/consentimiento.py` tiene (sin commitear) la subida de `VERSION_POLITICA` a `"2026-09-v2"` (Parte C, legal). El test compara `git diff --name-only main -- app/models/` contra una lista blanca que solo permite `plataforma.py` tocado. `consentimiento.py` no ganó ninguna columna (solo cambió el valor de una constante), así que el guardrail "SIN MIGRACIONES" sigue cumplido en espíritu, pero la aserción es literal sobre qué archivos aparecen en el diff. No lo edité porque el test cubre el trabajo de la Parte C (otro agente) y no es parte de mi misión de K=3; que se actualice junto con esa parte, o que el Verificador decida si la lista blanca debe ampliarse a `consentimiento.py` cuando solo cambia el valor de la constante.

Ninguna de las dos depende de mi código (`plataforma_metricas.py` / `plataforma_tendencia.py`) ni de mis tests reescritos.

## Archivos tocados

- `backend/app/plataforma_metricas.py`
- `backend/app/plataforma_tendencia.py`
- `backend/tests/test_plataforma_metricas.py`
- `backend/tests/test_metricas_conciliacion.py`
- `backend/tests/test_metricas_ataques.py`
- `backend/tests/test_plataforma_tendencia.py`
- `backend/tests/test_tendencia_ataques.py`
- `backend/tests/test_tendencia_conciliacion.py`
- `backend/tests/test_asesoria_ataques.py`
- `backend/tests/test_asesoria_contador.py`
- `backend/tests/test_auditoria_frontera.py`
- `backend/tests/test_plataforma_spread.py`
- `backend/tests/test_auditoria_bugs.py` (solo comentario)
- `backend/tests/test_auditoria_compliance.py` (solo comentarios)
- `docs/ESTADO.md`

---

## AJUSTE ITERACIÓN 2 (3 bloqueantes + gap propio)

Ninguno de los 3 bloqueantes tocaba código de mi territorio (`plataforma_metricas.py` / `plataforma_tendencia.py` no cambiaron en esta iteración) — todos eran prosa de `docs/ESTADO.md` que había quedado desactualizada frente a decisiones tomadas por el Maestro y por el agente legal mientras yo trabajaba, más un gap propio en `test_auditoria_frontera.py`/`test_tendencia_ataques.py` (archivos de mi territorio) que quedó roto por el trabajo (ya terminado y presente en el árbol) de otro agente en `routers/plataforma.py` y `models/consentimiento.py`.

### 1. `docs/ESTADO.md` — C-3 (catálogo del reporte, Parte B)

En el párrafo de `CATALOGO` (Parte B), después de "...tratamiento (`exacto`/`saneado`/`sin_hora`/`conteo`/`relacion`)" agregué:

> El catálogo también declara las cifras que SOLO el reporte publica en `valores[]` (`ocupadas`, `contratos_activos`, `canon_total`, `origen`, `capturado_en`), con `endpoints: ["reporte"]` — `"reporte"` es un valor válido de `endpoints` en el shape (`endpoints:[metricas|tendencia|adopcion|reporte]`). Regla dura: ninguna clave puede aparecer en `valores[]` sin una entrada en `CATALOGO` (la fija `test_t62`).

### 2. `docs/ESTADO.md` — C-2 (orden de validación de `meses` vs. freno compartido)

En el bullet de `GET /api/clientes/mi-reporte-plataforma?meses=N`, agregué:

> `meses` se valida primero (`1..MESES_MAXIMO`, si no 422) ANTES de cobrar el freno compartido con `/mi-export` — un pedido inválido nunca consume cupo de un derecho de habeas data. Ese freno (3/hora por usuario, tabla `export_attempts`) queda compartido con `/mi-export`: riesgo aceptado (L-3 de la revisión legal), decisión del Maestro de mantenerlo así sin migraciones.

### 3. `docs/ESTADO.md` — C-1 (tipo del item de `top_proveedores` del reporte)

El shape JSON ya decía `top_proveedores:[{nombre(saneado),contratos}]` (confirmado, no hacía falta tocarlo). Agregué al párrafo de Frontend, al final:

> El tipo del item de `top_proveedores` en el reporte es `ProveedorTopReporte {nombre, contratos}` — distinto de `ProveedorTop {nombre, contratos_activos}` que ya usan `/metricas` y `/tendencia` (no comparten shape ni nombre de campo de conteo).

### 4. `docs/ESTADO.md` — L-5 (arrastre de legal: `VERSION_POLITICA` en la sección de reglas duras de Fase 3)

`docs/ESTADO.md:181` todavía decía `VERSION_POLITICA = "2026-09-v1"` como regla dura (desactualizado: el agente legal ya subió la constante real a `"2026-09-v2"` en `app/models/consentimiento.py`, y la sección Fase 7 más abajo ya lo decía bien — solo esta mención temprana había quedado atrás). Cambiado a:

> `VERSION_POLITICA = "2026-09-v2"` (`models/consentimiento.py`, subida en Fase 7 Parte C) — debe coincidir con el encabezado de `docs/legal/politica-datos.md`, y `frontend/src/legal/politica-datos.md` es copia byte a byte (test lo fija). El historial de versiones vive en §11 de la política ("Vigencia y versionado"), no en §10.

Verificado contra `docs/legal/politica-datos.md`: §11 = "Vigencia y versionado" con "### Historial de versiones" adentro (línea ~712); §10 = "Seguridad de la información" (no tiene historial). La referencia corregida es correcta.

### 5. Gap propio: `test_auditoria_frontera.py::test_f01` y `test_tendencia_ataques.py::test_t22`

Corriendo el territorio completo antes de este ajuste, ambos fallaban por trabajo (ya presente, sin commitear) de otros agentes:

**`test_f01_solo_metricas_tendencia_y_adopcion_abren_una_base_de_cliente`** — la Parte B (otro agente) ya agregó `GET /api/plataforma/clientes/{slug}/reporte` en `app/routers/plataforma.py`, que abre la base del cliente pedido (para el spread del mes en curso vía `_metricas_de_un_cliente`). El barrido de `_rutas_de_plataforma` la golpea con slug sintético `galerias` y la detecta como "ruta que abrió una base" — correcto, es su función — pero no estaba en `permitidas`. Es mi archivo (lo reescribí en la Parte A), así que la actualicé yo: agregué `"GET /api/plataforma/clientes/galerias/reporte"` al set `permitidas`, con un comentario que cita Fase 7 Parte B y explica por qué es legítimo (abre UNA base, la del cliente, sólo para el spread del mes en curso; el resto sale de tablas de plataforma). No toqué `routers/plataforma.py` ni ningún otro archivo fuera de mi territorio.

**`test_t22_ninguna_tabla_existente_gano_columnas`** — el bump legítimo de `VERSION_POLITICA` en `app/models/consentimiento.py` (Parte C, legal) hace que ese archivo aparezca en `git diff --name-only main -- app/models/`, y la lista blanca solo aceptaba `plataforma.py`. Amplié la lista blanca a `{"backend/app/models/plataforma.py", "backend/app/models/consentimiento.py"}` con un comentario que aclara: `consentimiento.py` sólo cambia el VALOR de una constante (`"2026-09-v1"` → `"2026-09-v2"`), cero columnas nuevas ni tocadas — la verificación real de "sin columnas agregadas" sigue recayendo exclusivamente sobre el diff de `plataforma.py` (la segunda mitad del test, sin cambios). Este archivo es mío (lo reescribí en la Parte A, `test_tendencia_ataques.py`).

### Resultado exacto de pytest (territorio afectado por este ajuste, en serie)

```
$ cd backend && TMPDIR=/tmp/pt-backend-supresion python -m pytest \
    tests/test_auditoria_frontera.py tests/test_tendencia_ataques.py \
    tests/test_plataforma_metricas.py tests/test_plataforma_tendencia.py -q

........................................................................ [ 59%]
.................................................                        [100%]
123 passed (+ warnings de deprecación de httpx/jwt, no relacionadas)
```

`python -c "import app.main"` → sin errores.

### Grep de restos (repetido tras el ajuste)

```
$ grep -rn "K_MINIMO\|_suprimir_celda_chica" backend/app
(vacío)
```

### Diff de `docs/ESTADO.md` en esta iteración (resumen; el `git diff` completo del archivo muestra TODO el bloque Fase 7 como agregado porque nada de esta rama está commiteado contra `main` — no hay una versión intermedia commiteada para diffear solo la iteración 2, así que documento acá los 4 cambios puntuales tal como quedaron, listados arriba en los puntos 1-4). Los cambios de código de esta iteración quedan enteramente en:

- `backend/tests/test_auditoria_frontera.py` (una entrada agregada al set `permitidas`, con comentario)
- `backend/tests/test_tendencia_ataques.py` (lista blanca de `app/models/**` ampliada en un archivo, con comentario)
- `docs/ESTADO.md` (4 párrafos ajustados: C-3, C-2, C-1, L-5)

Ningún archivo fuera de mi territorio fue tocado. No hice commit ni push.

### Dependencias pendientes (sin cambios respecto de la entrega anterior)

Las dos dependencias que reporté en la iteración 1 (routers/plataforma.py necesitaba la ruta de reporte en la lista blanca de f01; consentimiento.py necesitaba entrar en la lista blanca de t22) están **resueltas** en esta iteración — las hice yo mismo porque ambos archivos de test son míos y el trabajo de los otros agentes (Parte B y Parte C) ya está terminado y presente en el árbol. No quedan dependencias pendientes de mi lado.
