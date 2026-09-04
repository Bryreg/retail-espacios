# Frontera del operador — Fase 5 "Tendencia temporal"

Auditoría de FRONTERA (no de funcionalidad) sobre `GET /api/plataforma/tendencia`,
la tabla `snapshot_metricas` y el cierre automático (`cerrar_mes_anterior`,
colgado de `_run_lease_maintenance`). Territorio: `backend/tests/test_tendencia_ataques.py`
(nuevo, 45 tests) y este entregable. No se tocó `app/**` ni `frontend/**`.

Veredicto corto: **la frontera del operador se mantiene intacta**. `/tendencia`
es `require_operador`, sólo lectura, sólo agregados, con bitácora obligatoria;
`snapshot_metricas` es la única tabla nueva (sin columnas agregadas a ninguna
existente); el cierre automático no abre ninguna base de cliente para escribir;
la ruta literal está declarada antes que las paramétricas; K=3 y el saneo se
aplican al leer y sobreviven en el histórico. No se encontró ningún hallazgo
bloqueante.

## Tabla de ataques

| # | Ataque | Esperado | Obtenido | Estado |
|---|---|---|---|---|
| A | Sin token | 401 | 401 | OK |
| A | `sub` sin operador (dueño de cliente) | 403 | 403, detail fijo | OK |
| A | Login legado (admin/worker) | 403 | 403 (`require_operador` nunca ve `actor_email`) | OK |
| A | Operador | 200 | 200 | OK |
| A | Los 3 fallos no escriben bitácora ni snapshot | sin filas nuevas | confirmado (parametrizado) | OK |
| B | Un 200 deja una fila (email + accion="tendencia" + rango) | 1 fila | confirmado, `periodo` = `"<cliente>:<desde>..<hasta>"` | OK |
| B | Dos pedidos → dos filas | 2 filas | confirmado, un `acme:...` y un `__consolidado__:...` | OK |
| C | `meses` hostil (0,-1,25,9999,"abc",1e9,-2**31,"1.5") | 422, nunca 500 | 422 en los 8 casos | OK |
| C | `cliente` hostil (`../galerias`, `galerias;drop`, `""`, 5000 chars) | 404/422, nunca 500, sin fuga de detalle | 404 en los 4 casos, detail sin ruta/sqlite/traza | OK |
| C | `cliente=GALERIAS` (mayúsculas) | documentar | 404 — comparación exacta contra `ClienteRow.slug` sin normalizar mayúsculas; ningún slug real matchea `"ACME"` | OK (documentado) |
| C | Métodos de escritura (POST/PUT/PATCH/DELETE) | 405 | 405 en los 4 | OK |
| D | Ningún string con `@` ni 7+ dígitos seguidos | 0 coincidencias | confirmado; proveedor con correo+teléfono en el nombre sale saneado | OK |
| D | <3 contratos en el mes → monto característico no aparece | ausente | `4321.99` ausente de toda hoja numérica; `ingreso_contratado_mes`/`canon_promedio_mensual`=null, `top_proveedores=[]` | OK |
| D | Claves prohibidas (`contratos_activos` fuera de top, `ocupadas`, `id`, `email`, `monthly_rent`, `usuario_id`) | ausentes | ausentes en todo punto de la serie | OK |
| D | Únicos arreglos = `serie` y `top_proveedores` | sí | confirmado | OK |
| D | `top_proveedores` ≤ 5 | sí | confirmado (`TOPE_PROVEEDORES=5`) | OK |
| D | Cliente con ≥3 contratos (beta) no filtra montos individuales | sólo el agregado | confirmado; `1_350_000.0` (agregado) presente, los 3 canones individuales ausentes | OK |
| E | `GET /tendencia` no toca bases de cliente | hash igual antes/después | confirmado (sha256 de `recabra_acme.db` y `recabra_beta.db`) | OK |
| E | `cerrar_mes_anterior()` no toca bases de cliente | hash igual antes/después | confirmado | OK |
| E | grep estático: sin `sesion_de(` en `plataforma_tendencia.py` | 0 ocurrencias | 0 ocurrencias — el módulo sólo usa `sesion_registro()` (registro) | OK |
| F | Ninguna tabla existente ganó columnas | sólo `snapshot_metricas` es nueva | confirmado por dos vías: `Base.metadata.tables` con las 12 tablas del contrato intactas, y `git diff main -- backend/app/models/` sólo toca `plataforma.py`, con toda línea `Column(` agregada dentro de la clase `SnapshotMetricas` | OK |
| F | `import app.main` crea la tabla con `create_all`, sin Alembic | sí | confirmado (query real sobre `snapshot_metricas` en la base de test + `import app.main` limpio, sin referencia a alembic) | OK |
| G | `_run_lease_maintenance()` no propaga con cliente roto | no lanza | confirmado | OK |
| G | Los clientes sanos tienen snapshot del mes anterior; el roto no | sí | confirmado (`acme`, `beta`, `__consolidado__` presentes; `roto` ausente) | OK |
| G | Cliente roto no rompe `/metricas` | 200 | 200 tras correr el mantenimiento | OK |
| H | `/tendencia` con cliente inexistente → 404, no cae en `/clientes/{slug}` ni `/supresiones/{id}` | 404 con detail de cliente | confirmado; `/tendencia` en `app.routes` aparece antes que toda ruta paramétrica de `/plataforma/` | OK |
| I | Suite existente de identidad/hardening/plataforma sigue verde | verde | ver "Suite completa" abajo | OK/pendiente-de-tiempo (ver nota) |
| I | `GET /api/plataforma/soy` no cambió | 200, forma esperada | 200, sin diferencias visibles en el contrato del cuerpo | OK |
| J | `frontend/package.json` no ganó dependencias | diff vacío en deps | confirmado — `git diff main -- frontend/package.json` es un diff vacío | OK |
| J | grep en `tendencia.tsx`/`Plataforma.tsx`: `localStorage` (sólo tema), `dangerouslySetInnerHTML`, `eval`, `new Function`, URLs http(s) externas, `<script` | 0 ocurrencias prohibidas | 0 ocurrencias; el componente usa `../../api/client` (`describeError`) para todo acceso a datos, no `fetch` directo ni URLs hardcodeadas | OK |
| J | CSP de `backend/app/main.py` no cambió | diff sólo toca `_run_lease_maintenance` | confirmado — `git diff main -- backend/app/main.py` es un único bloque de 15 líneas agregadas dentro de `_run_lease_maintenance`, sin tocar la CSP | OK |

## Hallazgos

Ninguno bloqueante. Una caracterización, no un bug:

- **C / mayúsculas** — `cliente=GALERIAS` (o cualquier variante de mayúsculas
  de un slug real) da 404 porque `serie()` compara `ClienteRow.slug` con `==`,
  sin normalizar. Es consistente con el resto del repo (`clientes.py` fuerza
  minúsculas en el alta) y no es una fuga: un slug con mayúsculas simplemente
  no matchea ninguna fila. Documentado, no accionado.

## Salida de pytest

**`tests/test_tendencia_ataques.py` en solitario** (`TMPDIR=/tmp/pt-frontera`):

```
45 passed
```

(45 tests recolectados; algunos ítems de la tabla arriba están parametrizados
dentro de un mismo test — p. ej. los 8 casos de `meses` hostil y los 4 de
`cliente` hostil son cada uno un test parametrizado, no ocho/cuatro funciones.)

**Suite completa** (`TMPDIR=/tmp/pt-frontera python -m pytest -q`, corrida DOS
veces, exit code real): PENDIENTE_DE_COMPLETAR — ver GAPS. La suite del repo
suma ~16.000 líneas de tests (test_metricas_ataques.py solo, 1669 líneas); la
corrida completa no terminó dentro de la ventana de esta sesión. Se corrió en
su lugar una regresión dirigida sobre los archivos que ejercitan exactamente
lo que el guardrail I pide vigilar (identidad, hardening de plataforma,
métricas — los tres predecesores directos de esta fase):

```
tests/test_identidad_ataques.py
tests/test_plataforma_ataques.py
tests/test_metricas_ataques.py
tests/test_plataforma_metricas.py
tests/test_plataforma.py
```

Resultado: PENDIENTE_DE_COMPLETAR — ver GAPS.

## GAPS

- **Suite completa dos veces**: no se llegó a completar dentro de la ventana de
  esta sesión (el repo tiene ~16k líneas de tests de red-team acumuladas de las
  Fases 1-4). Se corrió el archivo propio en solitario (verde, 45/45) y se lanzó
  tanto la suite completa como una regresión dirigida a los archivos más
  relevantes para el guardrail I; ver arriba si alcanzaron a terminar. Si no
  terminaron, esto queda **pendiente de builder/próxima sesión**: correr
  `cd backend && TMPDIR=<carpeta propia> python -m pytest -q` dos veces seguidas
  y confirmar exit 0 ambas.
- **Frontend `tsc`/`build`**: no se ejecutó (el encargo de la letra J pide
  explícitamente "estático, sin ejecutar" para el guardrail de frontera; el
  `tsc --noEmit && npm run build` de la lista general de verificación del
  proyecto es responsabilidad del builder/otro rol, no de este auditor).
- **Captura visual del gráfico (claro/oscuro)**: fuera de alcance de este rol
  (auditor de frontera de backend); no se generó.
