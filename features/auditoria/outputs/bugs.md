# Dimensión 5 — Bugs en los últimos cambios (Fases 4-6, #41-#46)

Auditor adversarial, sólo demuestra con reproducción. Territorio: revisión del
diff `6dd2f4c..HEAD` — `plataforma_metricas.py`, `plataforma_tendencia.py`,
`plataforma_adopcion.py`, `main.py` (lifespan / mantenimiento),
`fixtureStore.ts` (`scopeToCliente`), `Dashboard.tsx`/`DashboardView.tsx`,
componentes `plataforma/tendencia.tsx` y `adopcion.tsx`.

Test: `backend/tests/test_auditoria_bugs.py` (1 test, verde,
`TMPDIR=/tmp/pt-bugs python -m pytest -q tests/test_auditoria_bugs.py`).

## Hallazgos

### bugs-1 — El arreglo de BUG-1 (consolidado congelado) usa datos DE HOY de un cliente ya congelado, no lo que quedó persistido

**Severidad: alta** (corrupción de datos / cifra de negocio que contradice a
sus propios sumandos publicados — el mismo tipo de daño que BUG-1 original,
por una vía distinta).

**Dónde**: `backend/app/plataforma_tendencia.py::persistir_snapshots`, rama
`hubo_alta` (líneas ~289-334), específicamente la rama "exacta":

```python
if slugs_persistidos <= set(crudos_por_slug.keys()):
    crudo_reconstruido = consolidar_crudos(
        [crudos_por_slug[slug] for slug in slugs_persistidos]
    )
```

El comentario del propio código dice que la consolidada de un mes pasado "se
reconstruye a partir de TODAS las filas por cliente ya persistidas" — pero la
implementación no lee esas filas de disco: usa `crudos_por_slug[slug]`, que
son los crudos que **esta captura acaba de calcular en vivo** contra la base
de HOY de cada cliente, incluidos los que ya tenían su propia fila congelada
de ese mes.

`_calcular` (en `plataforma_metricas.py`) recorre y recalcula **todos** los
clientes en cada llamada, así que `crudos_por_slug` casi siempre contiene a
todos los clientes con fila persistida (`slugs_persistidos <=
crudos_por_slug.keys()` es la condición típica, no la excepcional) — la rama
"aproximada" (`_reconstruir_consolidado_desde_disco`, que si lee de disco) es
la que casi nunca se toma en la práctica.

**Reproducción** (`test_bugs_1_reconstruccion_exacta_usa_datos_de_hoy_no_lo_congelado`):

1. `acme` tiene 3 contratos por $600 en M-1 (K=3, nada suprimido). Se pide
   `/metricas?periodo=M-1`: la fila de `acme` en `snapshot_metricas` queda
   **congelada** en `canon_total=600`. El consolidado también congela en 600.
2. Se **cancela** uno de los contratos de `acme` en M-1 (`is_active=False`) —
   la fila de `acme` en disco no se toca (mes pasado, regla del congelado):
   sigue en 600. La base de `acme`, hoy, sólo tiene 2 contratos activos / $300.
3. Se funda `beta` con historia retroactiva en M-1: 3 contratos por $900.
   Nunca tuvo fila en M-1.
4. Se pide `/metricas?periodo=M-1` otra vez. Esto inserta la fila de `beta`
   (dispara `hubo_alta`) y con ella la reconstrucción del consolidado.

**Esperado** (lo que `docs/ESTADO.md` promete: "el total nunca puede
contradecir a sus sumandos, ni siquiera congelado"): consolidado = suma de lo
efectivamente **persistido** por cliente = `acme` (600, congelada) + `beta`
(900) = **1.500**.

**Obtenido** (salida literal del test): consolidado = **1.200** (`acme`
recalculado con el contrato ya cancelado, 300, + `beta`, 900). El mismo
desajuste se ve leyendo `/api/plataforma/tendencia`: `acme` publica
`ingreso_contratado_mes: 600.0`, `beta` publica `900.0` — la suma da 1.500 —
pero el consolidado del MISMO período publica `1.200.0`. Un operador que abra
la consola ve un consolidado que no cuadra con la suma de sus propios
clientes, para un mes que se supone cerrado y estable.

**Cómo se llega en producción, sin nada raro**: el ciclo de mantenimiento
(cada 12 h) recalcula métricas y dispara `persistir_snapshots` para el mes en
curso; `cerrar_mes_anterior()` lo hace para el mes recién cerrado. Cualquier
cliente cuyo contrato se edite/cancele DESPUÉS de que su propio mes quedó
congelado, y que MÁS TARDE coincida con la llegada tardía de otro cliente (un
alta retroactiva, o una base que estuvo rota y se recuperó) en el mismo
período, dispara esta reconstrucción "exacta" con datos de hoy en vez de los
congelados.

**Archivos**: `backend/app/plataforma_tendencia.py` (función
`persistir_snapshots`, rama `hubo_alta` / "exacta"), test en
`backend/tests/test_auditoria_bugs.py`.

**Arreglo propuesto** (NO aplicado — territorio de auditor): la rama "exacta"
debería construir `crudo_reconstruido` a partir de las **filas ya persistidas
en disco** para los slugs de `slugs_persistidos` que YA tenían fila antes de
esta captura (usando el mismo camino que `_reconstruir_consolidado_desde_disco`,
que sí lee columnas de la tabla) y sólo usar `crudos_por_slug[slug]` para los
slugs recién insertados en ESTA captura (los que causaron `hubo_alta`, que por
definición no tenían nada persistido antes y cuyo valor fresco ES lo que se
acaba de escribir). En la práctica, esto probablemente significa que la
distinción "exacta vs aproximada" actual está mal planteada: la única fuente
de verdad para un cliente con fila YA existente es esa fila, nunca un
recálculo en memoria — la rama "exacta" debería sencillamente sumar SIEMPRE
desde disco (`_reconstruir_consolidado_desde_disco`) para clientes con fila
previa, y sólo agregar en memoria los recién insertados. Esto sacrifica la
exactitud de usuarios/proveedores (que ya es la limitación aceptada de la
rama aproximada) a cambio de nunca contradecir lo persistido en ingreso/
ocupación/contratos, que es justamente lo que la fase promete proteger.

## Sospechas sin confirmar

Hipótesis atacadas sin lograr una reproducción que constituya un hallazgo
nuevo (no repetido de los red-teams existentes):

- **UTC vs Colombia (hipótesis 1)**: `periodo_actual()` y la ventana de
  adopción usan UTC intencionalmente y documentado en el propio código
  (`plataforma_metricas.py::periodo_actual`) y en `ESTADO.md`. El borde de
  mes (últimas horas Colombia = mes siguiente UTC) es un comportamiento
  ACEPTADO, no un bug: cambiarlo requeriría decidir en qué zona horaria vive
  "el negocio", una decisión de producto, no un defecto. La ventana de 30
  días inclusive de adopción (H-4) ya está reproducida en
  `test_asesoria_contador.py` (10e) — no se repite acá.
- **Caché de contratos (hipótesis 3)**: se revisó que `_cache_contratos`
  distingue `None` (base rota) de slug AUSENTE (cliente nuevo) exactamente
  como describe `ESTADO.md`, y que `limpiar_cache_metricas()` limpia los dos
  diccionarios (`_cache.clear()` y `_cache_contratos.clear()`, mismo
  candado). No se encontró una vía de confusión entre alta reciente y base
  rota que no esté ya cubierta por `test_plataforma_adopcion.py`.
- **`except Exception` (hipótesis 5)**: se enumeraron 9 bloques en
  `main.py` / `plataforma_metricas.py` / `plataforma_tendencia.py`. Todos
  menos el de este hallazgo (que no es un `except` sino una reconstrucción
  con datos equivocados) van acompañados de `log.exception` con traza y una
  degradación documentada (fila con error, snapshot no persistido, cierre
  mensual que no corrió). No se encontró uno que trague un error de forma
  silenciosa sin dejar rastro en el log.
- **Hilo de mantenimiento / `_stop_mantenimiento` (hipótesis 6)**: el
  mecanismo de corte cooperativo y el `await` con tope de 30 s en el
  `lifespan` están cubiertos por `test_run_lease_maintenance_dispara_el_cierre`
  y por el propio diseño descrito en el código; no se armó un escenario de
  carrera real (requeriría manipular el scheduler de asyncio/threading de
  forma más fina de lo que el tiempo de esta auditoría permitió) que la
  distinga de lo ya documentado.
- **Frontend `scopeToCliente` / `DEFAULT_SEDES` (hipótesis 7)**: se revisó
  que `scopeToCliente` sólo se llama con sesión activa (`App.tsx`, dentro del
  `if (!token ...) return`), nunca con `cliente=null` en logout, así que el
  caso "logout borra el caché" no aplica. `dataRole` no se resetea dentro de
  `scopeToCliente`, pero como `fixturesBySede` sí se vacía, la siguiente
  `syncFromServer` re-adopta todo igual por la rama `!known` — no se encontró
  un estado de UI imposible derivado de esto. No se tocó código de frontend,
  así que no hizo falta correr `tsc`.
