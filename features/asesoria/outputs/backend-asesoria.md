# Backend Asesoría (spread + adopción) — Fase 6

## Resumen

Implementadas las dos partes del backend de la Fase 6, sin migraciones:

- **(A) Spread canon vs tarifa de referencia** en `/api/plataforma/metricas`,
  por cliente (`spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`) y
  consolidado (`spread_pct`, `clientes_con_tarifa`). La tarifa nunca sale de la
  base del cliente.
- **(B) Conteo de contratos activos por cliente**, de uso interno, para que
  adopción no reabra las N bases de negocio: `_calcular` (antes `calcular`)
  devuelve también `{slug: nº contratos}` de los legibles; nuevo caché
  `_cache_contratos` con el mismo TTL; `contratos_activos_por_cliente(anio_mes)`.
- **(C) Cohortes de adopción**, módulo nuevo `app/plataforma_adopcion.py`,
  `calcular_adopcion()`, todo desde el REGISTRO.
- **(D)** `GET /api/plataforma/adopcion` en `routers/plataforma.py`, literal,
  después de `/tendencia` y antes de `/supresiones/{id}` y `/clientes/{slug}`,
  `require_operador`, bitácora `accion="adopcion"`.
- **(E)** Listas blancas existentes actualizadas (`test_metricas_ataques.py`,
  `test_metricas_conciliacion.py`, `test_plataforma_metricas.py`).
- **(F)** Tests nuevos: `test_plataforma_spread.py` (11 tests) y
  `test_plataforma_adopcion.py` (12 tests).
- **(G)** `docs/ESTADO.md` — sección "### Fase 6 — Asesoría" agregada después
  de Fase 5.

## Archivos tocados

- `backend/app/plataforma_metricas.py` — el grueso del trabajo:
  - `_spread(canon, tarifa, contratos) -> float|None` (helper nuevo, usa
    `K_MINIMO_CONTRATOS`, no un literal).
  - `_tipo_de_tarifa` (copia local, misma semántica que la de
    `routers/bulk_leases.py`) y `_mapa_tipos_de_sede` — arma
    `codigo_completo -> (SEDE, tipo)` en la MISMA pasada de
    `_numeros_del_layout` que ya recorre `layout_snapshots` para
    `_caras_comercializables`. `_numeros_del_layout` ahora devuelve
    `(sedes, caras, mapa_tipos)` — tercer valor de retorno.
  - `_tarifas_limpias(db)` (import local de `reference_rates_raw` y
    `_clean_rates` de `routers/layout.py`, misma sesión del cliente ya
    abierta) y `_tarifa_aplicable(tarifas, sede, tipo)`.
  - `_metricas_de_un_cliente`: calcula los 5 crudos nuevos
    (`canon_con_tarifa`, `tarifa_total`, `contratos_con_tarifa`,
    `contratos_sin_tarifa`, `tarifa_configurada`) y agrega los 3 campos
    públicos por cliente DESPUÉS de `publicas_desde_crudos` (igual que
    `ultimo_acceso`) — nunca dentro de esa función, que reusa la tendencia.
  - `_consolidar`: agrega `spread_pct` y `clientes_con_tarifa` al agregado de
    `consolidar_agregado`, calculados acá mismo con los crudos de
    `acumulado` — NO en `consolidar_agregado` ni `consolidar_crudos` (esas
    las reusa `plataforma_tendencia`, que reconstruye desde disco sin estas
    claves).
  - `calcular` renombrada a `_calcular(anio_mes, origen) -> (cuerpo, {slug:
    contratos})`; `calcular()` es ahora un wrapper de la misma firma de
    siempre (lo sigue usando `cerrar_mes_anterior` sin cambios).
  - `metricas_del_periodo` llena, además del `_cache` de siempre, un
    `_cache_contratos[anio_mes]` con el mismo TTL.
  - `contratos_activos_por_cliente(anio_mes)` — nueva función pública, de
    uso interno (nunca al JSON).
  - `limpiar_cache_metricas()` limpia los dos cachés.
- `backend/app/plataforma_adopcion.py` — **nuevo módulo**, `calcular_adopcion()`.
- `backend/app/routers/plataforma.py` — nuevo `GET /adopcion`; docstring del
  módulo actualizado (menciona los tres endpoints con acceso a datos de
  negocio: métricas, tendencia, adopción — la adopción no abre ninguna base
  de cliente, sólo lee `contratos_activos_por_cliente`, ya calculado).
- `backend/app/models/plataforma.py` — comentario de `accion` actualizado
  ("metricas" | "tendencia" | "adopcion"). Cero columnas nuevas.
- `backend/tests/test_metricas_ataques.py` — `CONSOLIDADO` y
  `METRICAS_CLIENTE` (usadas por `_validar_contrato`, M-4) ganan los campos
  nuevos.
- `backend/tests/test_metricas_conciliacion.py` — `CLAVES_CONSOLIDADO`,
  `CLAVES_METRICAS`, y los dicts `CONSOLIDADO`/`NORTE`/`CENTRO`/`SUR`/`SUSP`/
  `GALERIAS` (comparados con `==`) ganan los tres/dos campos nuevos con los
  valores correctos del escenario (ningún cliente de esa conciliación tiene
  tarifa configurada → `spread_pct: null`, `tarifa_configurada: false`,
  `contratos_sin_tarifa` = los activos de cada fila; consolidado
  `clientes_con_tarifa: 0`).
- `backend/tests/test_plataforma_metricas.py` — el dict literal de
  `test_metricas_de_un_cliente_contra_datos_sembrados` gana los tres campos.
- `backend/tests/test_plataforma_spread.py` — **nuevo**, 11 tests.
- `backend/tests/test_plataforma_adopcion.py` — **nuevo**, 12 tests.
- `docs/ESTADO.md` — sección "### Fase 6 — Asesoría" nueva, después de Fase 5
  y antes de "Pendientes conocidos: clientes y plataforma".

No se tocó ningún otro archivo. No hay migraciones ni tablas/columnas nuevas.

## JSON real de /metricas (un cliente) — producido por los tests

Escenario: `acme`, 1 sede (NAVE), 3 contratos activos a 900.000 cada uno,
tarifa de referencia `default.punta = 1.000.000` (sin override por sede).
`galerias` es el cliente por defecto, sin nada sembrado.

```json
{
  "periodo": {"anio_mes": "2026-09", "desde": "2026-09-01", "hasta": "2026-09-30"},
  "generado_en": "2026-09-05T00:12:57Z",
  "de_cache": false,
  "consolidado": {
    "clientes_total": 2,
    "clientes_con_error": 0,
    "sedes_con_plano": 1,
    "espacios_comercializables": 3,
    "ocupacion_pct": 100.0,
    "canon_promedio_mensual": 900000.0,
    "ingreso_contratado_mes": 2700000.0,
    "top_proveedores": [
      {"nombre": "Proveedor 1", "contratos_activos": 1},
      {"nombre": "Proveedor 2", "contratos_activos": 1},
      {"nombre": "Proveedor 3", "contratos_activos": 1}
    ],
    "usuarios_con_cuenta": 1,
    "spread_pct": -10.0,
    "clientes_con_tarifa": 1
  },
  "clientes": [
    {
      "slug": "acme",
      "nombre": "Acme Supermercados",
      "estado_cuenta": "activo",
      "error": null,
      "metricas": {
        "sedes_con_plano": 1,
        "espacios_comercializables": 3,
        "ocupacion_pct": 100.0,
        "canon_promedio_mensual": 900000.0,
        "ingreso_contratado_mes": 2700000.0,
        "top_proveedores": [
          {"nombre": "Proveedor 1", "contratos_activos": 1},
          {"nombre": "Proveedor 2", "contratos_activos": 1},
          {"nombre": "Proveedor 3", "contratos_activos": 1}
        ],
        "usuarios_con_cuenta": 1,
        "ultimo_acceso": "2026-09-05",
        "spread_pct": -10.0,
        "tarifa_configurada": true,
        "contratos_sin_tarifa": 0
      }
    },
    {
      "slug": "galerias",
      "nombre": "Galerías",
      "estado_cuenta": "activo",
      "error": null,
      "metricas": {
        "sedes_con_plano": 0,
        "espacios_comercializables": 0,
        "ocupacion_pct": null,
        "canon_promedio_mensual": null,
        "ingreso_contratado_mes": null,
        "top_proveedores": [],
        "usuarios_con_cuenta": 0,
        "ultimo_acceso": null,
        "spread_pct": null,
        "tarifa_configurada": false,
        "contratos_sin_tarifa": 0
      }
    }
  ]
}
```

`spread_pct = (2.700.000 / 3.000.000 − 1) × 100 = -10.0`, verificado a mano.

## JSON real de /adopcion — producido por los tests

Mismo escenario (`acme` recién fundado hoy, `galerias` sin membresías):

```json
{
  "periodo": "2026-09",
  "generado_en": "2026-09-05T00:12:57Z",
  "cohortes": [
    {
      "cohorte": "2026-09",
      "clientes": 2,
      "retencion_30d_pct": 50.0,
      "nueva": 1,
      "activa": 0,
      "fantasma": 0,
      "dormida": 0,
      "sin_cuentas": 1
    }
  ],
  "clientes": [
    {
      "slug": "galerias",
      "nombre": "Galerías",
      "estado_cuenta": "activo",
      "error": null,
      "cohorte": "2026-09",
      "clasificacion": "sin_cuentas",
      "usuarios_con_cuenta": 0,
      "usuarios_activos_30d": 0,
      "dias_sin_acceso": null,
      "con_contratos_activos": false
    },
    {
      "slug": "acme",
      "nombre": "Acme Supermercados",
      "estado_cuenta": "activo",
      "error": null,
      "cohorte": "2026-09",
      "clasificacion": "nueva",
      "usuarios_con_cuenta": 1,
      "usuarios_activos_30d": 1,
      "dias_sin_acceso": 0,
      "con_contratos_activos": true
    }
  ]
}
```

`acme` sale `nueva` (fundado hoy, < 30 días) aun con contratos y acceso hoy —
la regla de orden vinculante de la spec (`nueva` antes que `activa`/`fantasma`).
`galerias` es `sin_cuentas` (cero membresías activas — es el cliente legado,
la lista blanca que trae la app por defecto). Los tests
`test_plataforma_adopcion.py` cubren aparte, con fechas sembradas a mano vía
`Fundacion.creado_en`/`Usuario.ultimo_login` retrasados, las cinco
clasificaciones y las cohortes con más de un cliente.

## Verificación (REGLA DE VERIFICACIÓN, sólo territorio propio)

```
mkdir -p /tmp/pt-backend-asesoria
cd backend && TMPDIR=/tmp/pt-backend-asesoria python -m pytest -q \
  tests/test_plataforma_spread.py tests/test_plataforma_adopcion.py \
  tests/test_plataforma_metricas.py tests/test_metricas_ataques.py \
  tests/test_metricas_conciliacion.py tests/test_tendencia_ataques.py
```

Resultado: **todos verdes** (184 tests, 0 fallos), corridos primero cada
archivo por separado y luego los seis juntos. `python -c "import app.main"`
limpio. No se corrió la suite completa del proyecto ni `npm run build`
(regla del Maestro — hay otros agentes trabajando en paralelo sobre el mismo
árbol; se confirmó con `git status` que un agente de frontend está tocando
`frontend/src/api/plataforma.ts`, `frontend/src/pages/Plataforma.tsx` y
`frontend/src/components/plataforma/adopcion.tsx`, y otro backend
`backend/tests/test_asesoria_contador.py` — ninguno de esos archivos se tocó
desde esta sesión).

No se borró ningún `backend/*.db` preexistente (sólo los que generó el propio
script de muestreo, en un `TMPDIR` propio, y se limpiaron al terminar).

## Desvíos del contrato (con motivo)

Ninguno. Puntos donde hubo que decidir algo no explicitado línea a línea en
la spec, documentados también en `docs/ESTADO.md`:

- **`_tipo_de_tarifa` se copió localmente** a `plataforma_metricas.py` en vez
  de importarla desde `routers/bulk_leases.py` — evita que un módulo de
  servicio (reusado por la tendencia y ahora la adopción) dependa de un
  router; misma semántica, verificada en `test_tarifa_de_sede_gana_a_la_default`
  y afines.
- **Gotcha real encontrado y corregido durante el desarrollo** (no un desvío,
  un bug propio detectado por los tests nuevos antes de este entregable):
  `datetime` es subclase de `date` en Python, así que `isinstance(alta, date)`
  da `True` también para un `datetime` — la primera versión de
  `_fila_cliente` no reducía `ClienteRow.creado` (un `datetime`) a día y
  reventaba con `TypeError` al restarlo contra `hoy` (un `date`). Corregido
  preguntando por `datetime` explícitamente antes de convertir. Documentado
  en `docs/ESTADO.md` Fase 6 para que no se repita en código similar.
- **Riesgo residual aceptado, tal como pide la spec**: con exactamente 3
  contratos con tarifa del mismo tipo y `contratos_sin_tarifa == 0`,
  `ingreso/(1+spread/100)/3` despeja la tarifa de ese tipo. Es la decisión
  K=3 de la spec (la misma que ya acepta para el canon promedio publicado con
  3 contratos) — documentado en `docs/ESTADO.md`, no un descuido.

## Gaps / pendiente para otras sesiones

- Frontend de la Fase 6 (columna "vs tarifa", panel "Adopción") — ya en
  marcha por otro agente en este mismo árbol (`git status` lo confirma); no
  es territorio de este agente.
- `docs/legal/politica-datos.md` §5.3 — declarar los campos nuevos del
  operador (`spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`,
  `clientes_con_tarifa`, y el shape completo de `/adopcion`) queda para quien
  tenga ese archivo en su territorio (no estaba en la lista de archivos a
  tocar de esta misión).
- Histórico del spread: fuera de alcance de esta fase (documentado en la spec
  y en `docs/ESTADO.md`).
