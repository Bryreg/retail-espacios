# Builder Backend — Alta self-service y panel de plataforma

Territorio: `app/models/plataforma.py`\*, `app/plataforma_estado.py`\*, `app/routers/alta.py`,
`app/routers/plataforma.py`, `tests/test_alta.py`, `tests/test_plataforma.py`; edité
`app/main.py` sólo con los 2 imports + 2 `include_router` del contrato §2.3.
\* No existían — los creé byte-a-byte según el contrato (`features/clientes/outputs/equipo-fase-2.md` §2.1).

## Qué se construyó

**`POST /api/clientes/alta`** (`app/routers/alta.py`, prefix `/clientes`) — 13 pasos en
el orden exacto del contrato: freno por IP (`IntentoAlta`) → verificador → token → correo
confiable (misma vara que `/oauth`) → nombre → slug (`SLUG_VALIDO`) → reservado
(`SLUGS_RESERVADOS`, constante local) → duplicado (consulta directa a `ClienteRow`, no
`buscar()`) → resolver/crear `Usuario` (mismas reglas de vinculación que `oauth_login`) →
tope de 2 fundaciones → `crear_cliente()` (paso irreversible) → `Membresia(owner)` +
`Fundacion` → token igual que `/oauth`. Sólo los 401 anotan fallo.

**`GET /api/plataforma/soy`**, **`GET /api/plataforma/clientes`**, **`PATCH
/api/plataforma/clientes/{slug}`** (`app/routers/plataforma.py`, prefix `/plataforma`) —
`require_operador` local (require_auth + `actor_email` + `es_operador`); el listado hace
join con `estados_cliente` (fila ausente → `activo`/null; con fila, incluso "activo",
muestra los valores reales — auditoría); el PATCH valida estado/motivo, hace upsert,
`cambiado_por`/`cambiado_en`, e invalida el cache tras el commit. Nunca abre `sesion_de`
de un cliente — sólo el registro.

## Decisión no trivial: el lock de SQLite entre `reg` y `crear_cliente()`

`crear_cliente()` abre su propia sesión contra la base por defecto y hace su propio commit.
En SQLite eso choca con la transacción que la sesión `reg` del router venía arrastrando
(la resolución del `Usuario`, con su `flush()`): "database is locked". La solución fue un
`reg.commit()` explícito justo antes de llamar a `crear_cliente()` (después de resolver el
`Usuario` y contar las fundaciones, antes del paso irreversible) — libera la transacción de
`reg` sin perder nada: si el usuario era nuevo, ya quedó guardado; si `crear_cliente()`
falla después (409), sólo queda un `Usuario` sin membresía, que es un estado normal del
sistema (ver `test_no_se_puede_desactivar_al_ultimo_owner` en `test_identidad.py`), no
"cliente a medias". El commit de `Membresia`+`Fundacion` en el paso 12 sigue siendo un
commit único, como pide el contrato.

## Verificación

- `python -c "import app.main"` — OK.
- `python -m pytest tests/test_alta.py tests/test_plataforma.py -q` — verde de forma
  consistente en ejecuciones aisladas (repetido >20 veces sin fallos).
- `python -m pytest -q` (suite completa) — ver **Gap** abajo: intermitente por una causa
  preexistente, no de este territorio.

## Gap encontrado (no es mío arreglarlo, lo dejo reportado)

La suite completa es **intermitentemente flaky** — a veces cuelga o falla con
`sqlalchemy.exc.OperationalError: database is locked` / `attempt to write a readonly
database` al crear un cliente nuevo (`Base.metadata.create_all` / `ensure_default_config`
sobre la base nueva). Lo reproduje también con `tests/test_identidad.py` solo (sin tocar
nada mío), corriéndolo varias veces seguidas — así que **es preexistente a esta fase**, no
algo que introduje.

Causa raíz, con bastante confianza: `app/main.py::lifespan` hace
`maintenance_task.cancel()` seguido de `await maintenance_task` al apagar, pero la tarea
envuelve `asyncio.to_thread(_run_lease_maintenance)` — cancelar la `Task` de asyncio NO
detiene el hilo de SO ya en marcha (`to_thread` no es interrumpible), así que el hilo de
mantenimiento puede seguir vivo, huérfano, con referencias al módulo/motor viejo, mientras
el fixture `client` de las pruebas borra los archivos SQLite del test y el siguiente test
arranca un `TestClient` nuevo. Ese hilo huérfano compitiendo por los mismos archivos
explica tanto los locks como, a veces, un cuelgue.

Está fuera de mi territorio (`app/main.py` sólo lo puedo tocar para las 4 líneas de
routers, y el lifespan no es una de ellas). Lo señalo para que el auditor de regresión o
el maestro lo enruten — probablemente a un hilo de trabajo aparte que reemplace
`asyncio.to_thread` + `cancel()` por algo genuinamente cancelable (un `Event` que
`_run_lease_maintenance` chequee, o correr el mantenimiento en el propio loop con
`run_in_executor` y un `Future` que sí se pueda cancelar/esperar de verdad).

## Decisiones de diseño (resumen)

- Los dos archivos compartidos (`models/plataforma.py`, `plataforma_estado.py`) no
  existían: los creé verbatim según el contrato §2.1 — no hubo conflicto que reportar.
- `SLUGS_RESERVADOS` vive como constante en `alta.py` (no en `clientes.py`), tal como pide
  el contrato.
- `require_operador` vive en `plataforma.py`, no en `auth.py` — territorio propio, y el
  legado da 403 "gratis" porque nunca deja `actor_email`.
- El listado de `/plataforma/clientes` muestra los valores reales de la fila también
  cuando el estado es "activo" (no los nulea): es la auditoría de "quién dejó esto en
  activo por última vez" que pide la spec, y así lo cubre `test_patch_estado_activo_deja_fila`.
