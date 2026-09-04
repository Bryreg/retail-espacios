# Fase 5 — Tendencia temporal · Propuesta A (builder)

CÓDIGO REAL, verificado en un worktree limpio de `claude/fase-5-tendencia`
(aislado porque el árbol compartido lo estaban editando otros builders en
paralelo con un diseño distinto). **Patch completo y verificado listo para
aplicar: `features/tendencia/outputs/a.diff`** (11 archivos). Abajo, el
qué/por qué y la verificación.

Archivos (todos en el patch):
- `backend/app/models/plataforma.py` — tabla `SnapshotMetricas` (nueva)
- `backend/app/plataforma_metricas.py` — refactor + write-through
- `backend/app/plataforma_tendencia.py` — NUEVO (serie + poblado)
- `backend/app/routers/plataforma.py` — `GET /tendencia`
- `backend/app/main.py` — cierre en el mantenimiento
- `backend/app/database.py` — `busy_timeout` SQLite (ver §6)
- `backend/tests/test_plataforma_tendencia.py` — NUEVO (16 pruebas)
- `backend/tests/test_metricas_ataques.py` — m25 enmendado (ver más abajo)
- `frontend/src/api/plataforma.ts`, `components/plataforma/consola.tsx`,
  `pages/Plataforma.tsx`

## Resumen de la arquitectura entregada

Snapshot mensual de CRUDOS por cliente en una **tabla nueva del registro**
(`snapshot_metricas`), sin migración; la supresión K=3 y el saneo se aplican **al
leer**, reusando la lógica de `plataforma_metricas` (un solo lugar para la
privacidad). Poblado híbrido: **write-through** al calcular métricas + **cierre**
en el mantenimiento. Endpoint nuevo `GET /api/plataforma/tendencia`
(operator-only, con bitácora, literal antes de las paramétricas). Frontend:
gráfico de **línea** SVG propio (sin librería), claro+oscuro, mes en curso
parcial, estado vacío honesto con <2 meses, lectura de asesoría sin inventar.

## Backend

### 1. `app/models/plataforma.py` — tabla `SnapshotMetricas` (NUEVA, sin migración)
Columnas = los `crudos` de `_metricas_de_un_cliente`, no públicos:
`cliente_slug`, `periodo` ("YYYY-MM"), `sedes`, `espacios_comercializables`
(caras), `ocupadas`, `contratos_activos`, `canon_total`, `proveedores_json`
(`{nombre_original: conteo}`), `usuarios_json` (`[ids]`), `capturado_en`.
`UniqueConstraint(cliente_slug, periodo)`. Se guardan los **nombres originales**
de proveedor y los **ids** de usuario (números) para que el saneo y la dedup de
usuarios se hagan al leer, exactamente como el cálculo en vivo — el histórico
nunca queda congelado con una privacidad vieja. `create_all()` la crea, igual
que `estados_cliente`/`bitacora_plataforma`.

### 2. `app/plataforma_metricas.py` — refactor para NO duplicar fórmulas
Se extrajeron dos funciones puras, y el cálculo de Fase 4 ahora pasa por ellas
(comportamiento idéntico, verificado por la suite de Fase 4):
- `publicas_desde_crudos(crudos)` → agregados públicos por cliente **con K=3**
  (frontera única crudo→público; `_metricas_de_un_cliente` la usa y sólo le suma
  `ultimo_acceso` aparte).
- `consolidar_agregado(acumulado)` → consolidado **ponderado** (Σ/Σ) con K=3, sin
  `clientes_total`/`clientes_con_error`; `_consolidar` (panel) la envuelve
  sumándole esos dos conteos.
- Write-through: `calcular()` junta `(slug, crudos)` de los clientes legibles y
  al final llama `persistir_snapshots(anio_mes, capturados)` en try/except
  (tolerante: si la persistencia falla, las métricas se devuelven igual). Va en
  el cálculo, no en el caché: un hit de caché no recalcula ni trae crudos.

### 3. `app/plataforma_tendencia.py` — NUEVO (serie + poblado)
- `persistir_snapshots`: upsert idempotente. Futuro → no se snapshotea; mes en
  curso → **converge** (update); mes pasado → **congela** (insert-only). Escribe
  sólo en el registro.
- `cerrar_mes_anterior`: si a algún cliente activo le falta el mes ya cerrado,
  llama `calcular(mes_cerrado)` (write-through insert-only). Barato en régimen
  (no recalcula si ya están todos). Tolerante a fallos por cliente vía `calcular`.
- `tendencia(cliente, meses)`: lee `snapshot_metricas` de la ventana de N meses
  (default 12, acotado 1..24), agrupa por período y arma la serie con
  `consolidar_agregado` (consolidado) o `publicas_desde_crudos` (un cliente).
  Sólo devuelve meses **con dato** (huecos no se rellenan con 0); marca `parcial`
  el mes en curso; `suficiente = len(serie) >= 2`. Cliente inexistente →
  `ClienteDesconocido`.

### 4. `app/routers/plataforma.py` — `GET /tendencia`
Ruta **literal**, declarada junto a `/metricas` y ANTES de `/clientes/{slug}` y
`/supresiones/{solicitud_id}`. `require_operador`, sólo lectura, **no abre
ninguna base de cliente** (lee snapshots del registro). Bitácora SIEMPRE
(`accion="tendencia"`, `periodo` = alcance consultado: slug o `__consolidado__`).
404 para cliente inexistente.

### 5. `app/main.py` — cierre en `_run_lease_maintenance`
`cerrar_mes_anterior()` corre tras el recorrido de clientes, en su propio
try/except. **Se salta en el pase inmediato del arranque** (`incluir_cierre_mensual`
= `not primer_pase`) y corre recién en los pases programados (cada 12 h): el
cierre es una red de seguridad de cadencia mensual y no debe pelear el registro
contra el propio arranque — esto además elimina una carrera de escritura
SQLite en los tests.

### 6. `app/database.py` — PRAGMA de convivencia SQLite (dev/test)
`busy_timeout=30000` vía listener en la clase `Engine`, **sólo para SQLite**.
La fase agrega escritores concurrentes al registro (write-through en el hilo de
la petición, cierre en el de mantenimiento) y, como el registro y la base "de
siempre" comparten archivo en SQLite, sin `busy_timeout` el segundo escritor
fallaba en el acto ("database is locked" / "readonly database") — una flakiness
**pre-existente** del arnés (la rama pristine también falla al azar bajo carga)
que esta fase intensifica. Con el PRAGMA el escritor espera su turno. **NO se
activó WAL** a propósito: dejaría ficheros `-wal`/`-shm` que el arnés no limpia
entre pruebas (reusa el nombre de base por slug) y contaminaría la siguiente.
En Postgres (producción) este camino ni se toca; el MVCC resuelve lo mismo.
**Nota para el conciliador**: es el único archivo de infraestructura compartida
que toco; es mínimo y justificado, pero conviene revisarlo aparte.

## Frontend

- `api/plataforma.ts`: `getTendencia(cliente, meses)`, `TENDENCIA_CONSOLIDADO`,
  tipos `Tendencia`/`PuntoTendencia`/`AgregadosMes`.
- `components/plataforma/consola.tsx`: `LineaTendencia` — gráfico de **línea SVG
  propio** (sin librería, bajo la CSP de Fase 3), tokens `--con-*` (claro+oscuro),
  **eje desde cero**, `null` = hueco (línea cortada, sin punto), mes parcial con
  **anillo hueco + segmento entrante punteado**, cada punto enfocable con tooltip.
- `pages/Plataforma.tsx`: `SeccionTendencia` — selector cliente
  (Consolidado + cada cliente) y meses (6/12/24), dos líneas (Ocupación %,
  Ingreso contratado), estado vacío honesto con `!suficiente`, y **lectura de
  asesoría sin inventar** (`lecturaTendencia`): delta vs el mes previo que
  EXISTE, racha de ≥3 meses en la misma dirección, y aviso explícito cuando el
  ingreso no tiene dos meses comparables por K=3. Se ubica entre los gráficos de
  barras y la tabla de clientes.

## Verificación (real, en worktree limpio)

- Backend suite ENTERA (worktree limpio, borrando `retail_espacios.db`/
  `recabra_*.db` entre corridas): **1 sola falla en toda la suite**,
  `test_recordatorios::test_va_a_la_libreta_de_la_sede`, que **pasa aislada** —
  es la flakiness ambiental del arnés (hilo de mantenimiento + SQLite bajo carga),
  no una regresión de esta fase. Todo lo demás verde, incluidas las 16 pruebas
  de Fase 5, la suite de métricas de Fase 4 y el m25 enmendado. (Antes del
  `busy_timeout` la MISMA suite —incluso pristine— fallaba 6–8 tests al azar por
  corrida; el PRAGMA la bajó a ~0–1 flake ambiental.) **Segunda corrida completa
  de la suite: exit 0, CERO fallas — verde total.** La única falla de la primera
  corrida (recordatorios) es un flake ambiental confirmado (pasa aislada).
- `test_plataforma_tendencia.py` (16 pruebas, 3 corridas seguidas verdes):
  serie de 3 meses por cliente y consolidado ponderado; mes en curso parcial;
  <2 meses insuficiente; K=3 y saneo por mes; write-through deja/congela/converge;
  cierre automático sin abrir la consola; operator-only (403/401) + 404 + bitácora;
  frontera del JSON (sin `usuarios_json`/`canon_total`/correos).
- `npx tsc --noEmit`: limpio. `npm run build`: OK.

## Cambio de un test de Fase 4 (intencional, spec-mandated)

`test_metricas_ataques.py::test_m25` afirmaba que "lo único que crece en el
registro tras una consulta de métricas es la bitácora". La spec de Fase 5
(decisión 2, write-through) hace que **cada cálculo real de métricas también
deje/actualice `snapshot_metricas`** en el registro. No es una regresión: es la
conducta documentada de la fase. Actualicé m25 para (a) permitir el crecimiento
de `snapshot_metricas`, (b) **reforzar** la garantía real —ninguna tabla de
identidad ni de estado (`usuarios`, `membresias`, `estados_cliente`, …) se
mueve— y (c) verificar que el hit de caché NO reescribe el snapshot.
`test_m24` (foto de las bases de CLIENTE) queda intacto: el write-through
escribe sólo en el registro, jamás en una base de negocio.

## Decisiones / gaps para el conciliador

- **`meses` fuera de rango se ACOTA** (1..24), no es 422 — más indulgente para un
  parámetro de rango; un builder paralelo eligió 422. A decidir.
- **Bitácora**: guardo el alcance (`slug`/`__consolidado__`) en `periodo`. Una
  alternativa es guardar el rango `desde..hasta`.
- **`database.py`** es infraestructura compartida (ver §6): revisar aparte.
- El árbol compartido `/tmp/retail-espacios-test` fue editado por otros builders
  en paralelo con un diseño divergente; mi código verificado vive en el worktree
  y en el patch `outputs/a.diff`. No hice commit ni push.
- **Captura visual pendiente**: `tsc` y `build` pasan y el SVG está escrito
  contra los tokens `--con-*` en ambos temas, pero no adjunto screenshot claro/
  oscuro (no hay navegador en este entorno). Queda como verificación manual
  rápida para quien lo integre.
- El flake ambiental de la suite (hilo de mantenimiento + SQLite) se podría
  volver determinista gateando el loop de mantenimiento bajo `ENV=test`, pero es
  una decisión de infraestructura fuera del alcance de esta fase; no la tomé.
