# B (builder) — Fase 5: Tendencia temporal

## Resumen

Implementada de punta a punta: tabla nueva `snapshot_metricas` (registro, sin
migración), poblado híbrido (write-through en `plataforma_metricas.calcular` +
cierre automático colgado de `_run_lease_maintenance`), endpoint
`GET /api/plataforma/tendencia`, y el gráfico de línea en la consola. Nota de
proceso: este entorno tuvo edición concurrente activa sobre el mismo working
tree (varios procesos escribiendo los mismos archivos en paralelo, visible en
los `git diff`/`ps aux` durante la sesión) — mi aporte terminó siendo una
mezcla de código propio (el primer refactor de `_metricas_de_un_cliente`/
`_consolidar` hacia `publicas_desde_crudos`/`consolidar_agregado`, luego
retomado y extendido por el otro proceso) y verificación/arreglo de lo que
apareció en disco. Verifiqué TODO lo que quedó — lo leí completo, corrí la
suite dos veces en aislamiento y until confirmé cada pieza contra la spec —
antes de darlo por bueno.

## Qué quedó armado

**Backend**
- `backend/app/models/plataforma.py` — `SnapshotMetricas`: crudos
  (`sedes_con_plano`, `espacios_comercializables`, `ocupadas`,
  `contratos_activos`, `canon_total`, `usuarios` como CONTEO,
  `proveedores_json` recortado a 5), `clientes_incluidos`/`clientes_con_error`
  (sólo tienen sentido en la fila `__consolidado__`), `origen`
  (`"vista"`/`"cierre"`), `capturado_en`. `UNIQUE(cliente_slug, periodo)`.
- `backend/app/plataforma_metricas.py` — refactor SIN cambiar el JSON público:
  `publicas_desde_crudos(crudos)` y `consolidar_agregado(acumulado)` son
  ahora el único lugar donde un crudo se vuelve público (K=3 incluido);
  `_metricas_de_un_cliente` y `_consolidar` los reusan. `calcular()` dispara
  el write-through (`persistir_snapshots`) al final, tolerante a fallos
  (try/except propio, nunca rompe `/metricas`).
- `backend/app/plataforma_tendencia.py` (nuevo) — `persistir_snapshots`
  (upsert por `(slug, periodo)`, converge el mes en curso, congela un mes
  pasado), `cerrar_mes_anterior()` (llamado desde
  `main.py::_run_lease_maintenance`, idempotente, reusa `calcular(mes,
  origen="cierre")`), `serie(cliente, meses)` (lee sólo `snapshot_metricas`,
  nunca abre una base de cliente; K=3 y saneo al leer vía
  `publicar_fila`/`_suprimir_celda_chica`/`_top`).
- `backend/app/routers/plataforma.py` — `GET /plataforma/tendencia`, ruta
  literal junto a `/metricas`, `require_operador`, `meses` fuera de 1..24 →
  422, cliente inexistente → 404 con texto fijo, bitácora
  (`accion="tendencia"`, `periodo="<cliente>:<desde>..<hasta>"`).
- `backend/app/main.py` — `cerrar_mes_anterior()` colgado del ciclo de
  mantenimiento (antes del recorrido por clientes), en su propio
  try/except.

**Frontend**
- `frontend/src/api/plataforma.ts` — `getTendencia`, tipos `Tendencia`/
  `PuntoTendencia` (shape verificado contra el backend real, no a ojo).
- `frontend/src/components/plataforma/tendencia.tsx` (nuevo) — `LineaTendencia`
  (SVG propio, sin librería), dos gráficos apilados (ocupación / ingreso,
  nunca doble eje), huecos que cortan la línea en vez de interpolar,
  marcadores distintos para "sin dato" vs "suprimido K=3" vs el mes parcial,
  tabla accesible oculta (lector de pantalla), lectura accionable (delta vs
  mes anterior + racha de N meses, sin comparar contra huecos ni el parcial).
  `PanelTendencia` + hook `useTendencia`.
- `frontend/src/pages/Plataforma.tsx` — dispara la tendencia DESPUÉS de que
  `/metricas` resuelve (así el write-through del mes en curso ya corrió).
- `frontend/src/index.css` — tokens `--con-linea`/`--con-linea-punto`, claro
  y oscuro, ≥3:1 contra `--con-surface`.

**Docs**: `docs/ESTADO.md` tiene su sección "Fase 5 — Tendencia temporal" con
reglas duras y pendientes conocidos (cierre repetido si un cliente queda con
la base rota; consolidado del primer mes de vida de un cliente nuevo si el
cierre corre antes de que exista; sin backfill hacia atrás).

**Corrección propia**: `backend/tests/test_metricas_ataques.py::test_m25…` —
Fase 4 afirmaba que sólo `bitacora_plataforma` crecía en el registro al pedir
`/metricas`; ahora `snapshot_metricas` también crece (write-through, a
propósito). Actualicé el test para afirmar el crecimiento correcto (bitácora
+2 por las dos llamadas, snapshot +4: 3 clientes legibles + consolidado, sólo
en la primera llamada porque la segunda sale del caché de 5 min y no
recalcula).

## Verificación

- `cd backend && python -c "import app.main"` — limpio.
- `cd backend && python -m pytest -q` — **suite completa, DOS VECES, en
  TMPDIR aislado** (el entorno tenía otros procesos de prueba corriendo en
  paralelo sobre el mismo `/tmp`; aislar `TMPDIR` por corrida evitó choques
  de archivos `recabra_<slug>.db` entre corridas concurrentes) — las dos
  veces `exit code 0`, sin `F` en el resumen (los `x` son los `xfail`
  preexistentes de fases previas, ninguno nuevo).
- `cd frontend && npx tsc --noEmit` — limpio.
- `cd frontend && npm run build` — build de producción exitoso (el aviso de
  chunk >500kB es preexistente, no de esta fase).
- Leí `backend/tests/test_plataforma_tendencia.py` (22 tests) y
  `backend/tests/test_tendencia_conciliacion.py` (21 tests) completos:
  cubren write-through, idempotencia, congelado del mes pasado vs
  convergencia del mes en curso, cierre automático (idempotente, sobrevive a
  un cliente roto, disparado de verdad por `_run_lease_maintenance`), forma
  de la serie (N meses consecutivos, huecos en `null`, mes en curso
  `parcial`), K=3 aplicado MES A MES (un cliente puede salir suprimido un
  mes y publicado al siguiente, en la MISMA serie), consolidado ponderado
  contra números sembrados a mano (Σ/Σ ≠ promedio de promedios), saneo del
  proveedor, frontera del operador (403/404/422) y bitácora.

## Ajuste iteración 2 — C1-BUG-1 (BLOQUEANTE) y C8-NIT-4

**Raíz confirmada**: `persistir_snapshots` congelaba un mes pasado FILA POR
FILA. Cuando una captura de `/metricas` de un mes PASADO insertaba la fila de
un cliente que todavía no la tenía (alta retroactiva, o base que estuvo rota
en el cierre y ahora se pudo leer), la fila `__consolidado__` de ese mismo
período ya existía de antes y caía en la rama "mes pasado con fila ya
puesta ⇒ se deja congelada" — el total dejaba de ser la suma de sus sumandos
(subestimaba ingreso y ocupación).

**Arreglo, en `backend/app/plataforma_tendencia.py::persistir_snapshots`**:

1. Se separó el bucle en dos pasadas: primero las filas POR CLIENTE (sin
   tocar nunca una ya presente en mes pasado — la regla del congelado sigue
   intacta ahí), marcando `hubo_alta = True` cuando se inserta una fila nueva
   de cliente (no consolidado) en un mes que NO es el actual. Después, la fila
   `__consolidado__` se resuelve aparte: si `es_mes_en_curso` sigue
   convergiendo como siempre; si `hubo_alta` en un mes pasado, se
   **reconstruye** en vez de dejarse congelada; si no hay altas y es mes
   pasado, se deja exactamente como estaba (comportamiento previo, intacto).
2. La reconstrucción, dentro de la MISMA transacción (un `reg.flush()` antes
   de re-consultar para que las altas de este mismo bucle ya sean visibles, y
   un solo `commit()` al final — o queda el mes entero o no queda nada):
   vuelve a leer TODAS las filas por cliente ya persistidas de ese `periodo`
   (no sólo las de esta captura, porque una captura de mes pasado puede traer
   un subconjunto distinto al que quedó congelado en el cierre) y sobreescribe
   los crudos de la consolidada con la suma de esas filas.
3. **Reconstrucción exacta vs. aproximada**: si el conjunto de slugs
   persistidos está cubierto por lo que esta captura ya trae en memoria
   (`crudos_por_slug`), se reconstruye desde esos crudos — exacto también para
   usuarios (dedupe real por id) y proveedores (conteo completo, no sólo el
   top-5 guardado). Si hay algún cliente persistido que esta captura no leyó
   (base rota ahora, legible cuando se guardó su fila), se suma desde DISCO
   vía el nuevo helper `_reconstruir_consolidado_desde_disco` — exacto para
   ingreso/ocupación/contratos/sedes (los campos load-bearing del bug), pero
   **aproximado** para usuarios y proveedores: en disco sólo sobrevive el
   CONTEO de usuarios (no hay ids para deduplicar entre clientes) y el TOP-5
   de proveedores de cada cliente (no su conteo completo). Documentado como
   limitación conocida en `docs/ESTADO.md` (sección Fase 5).
4. **Helper compartido `consolidar_crudos`** (nuevo, en
   `backend/app/plataforma_metricas.py`): arma la suma CRUDA (Σ/Σ, sin K=3) de
   una lista de `crudos`. Lo usan tanto `persistir_snapshots` (armado inicial
   de `a_escribir` para `__consolidado__` Y la reconstrucción del punto 2-3)
   como el propio `consolidar_agregado` (que ahora lo llama y sólo le
   antepone K=3 + saneo para el JSON público de `/metricas`) — una sola
   fórmula del ponderado en todo el repo. Corregido también el docstring de
   `consolidar_agregado` (C8-NIT-4): ya no afirma que la tendencia lo usa a
   él (la tendencia guarda CRUDOS, sin K=3; usa `consolidar_crudos`, que
   `consolidar_agregado` también usa por dentro).
5. `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`
   (en `backend/tests/test_tendencia_conciliacion.py`): se quitó el marcador
   `xfail(strict=True)` y el comentario que lo acompañaba (actualizado para
   decir "arreglado" en vez de "arreglo sugerido"). El test PASA ahora.

**Verificación de este ajuste**:

- `cd backend && python -c "import app.main"` — limpio.
- `cd backend && python -m pytest -q` (TMPDIR aislado, `retail_espacios.db` /
  `recabra_*.db` borradas antes de cada corrida) — corrido **dos veces
  completas**, `exit code 0` las dos, sin ningún `F` (los `x` son los `xfail`
  preexistentes de fases previas — ya no incluyen el de BUG-1).
- `pytest tests/test_tendencia_conciliacion.py -k BUG_consolidado -v` aislado:
  `1 passed` (ya no `xfail`/`XPASS`).
- `cd frontend && npx tsc --noEmit` — limpio (este ajuste es 100% backend, no
  tocó nada de frontend).
- `cd frontend && npm run build` — build de producción exitoso (mismo aviso
  preexistente de chunk >500 kB).
- `docs/ESTADO.md` actualizado: la regla del congelado documenta ahora la
  excepción de la consolidada, y el pendiente "el primer mes de vida de un
  cliente nuevo puede quedar con el consolidado incompleto" quedó tachado con
  nota de arreglo (era exactamente este bug).

## Gaps / pendientes (heredados, documentados en ESTADO.md)

- Cierre automático recorre TODAS las bases de nuevo en cada ciclo mientras
  a un cliente con la base rota le falte la fila del mes anterior (no hay
  forma de anotar "ya se intentó" sin una columna/tabla más).
- ~~Consolidado del primer mes de vida de un cliente nuevo puede quedar
  incompleto si el cierre corre antes de que el cliente exista~~ —
  **arreglado en la iteración 2** (ver arriba, C1-BUG-1): ese consolidado
  ahora se reconstruye en vez de quedar congelado incompleto.
- Sin backfill: la serie arranca vacía desde el despliegue de esta fase.
- No verifiqué visualmente el gráfico en claro/oscuro con captura de pantalla
  (el checklist de la spec lo pide) — sólo tsc/build limpios y los tokens de
  contraste documentados en el propio CSS; recomiendo una pasada de diseño
  antes de dar la fase por cerrada del todo.
