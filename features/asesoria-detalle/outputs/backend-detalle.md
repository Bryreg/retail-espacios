# Backend — Detalle de cliente y recomendaciones (Fase 8)

`GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM` — el negocio de UN
supermercado espacio por espacio, para la sesión de asesoría comercial. Sólo
lectura, con bitácora, sin migraciones.

## Qué construí

* **`backend/app/plataforma_detalle.py` (NUEVO, ~900 líneas).** Toda la lógica:
  lee la base de ESTE cliente **una sola vez** (plano + `spaces` + `space_leases`
  + tarifas) y arma en memoria los espacios, el resumen por tipo, los
  proveedores, los movimientos de 12 meses, las oportunidades y las
  recomendaciones priorizadas con su `explicacion` en palabras. `armar_detalle`
  es la única puerta; levanta `ClienteDesconocido` (404) y `BaseIlegible` (503).
* **`benchmark_por_tipo(anio_mes)`** en el mismo archivo: la única otra apertura
  de bases. Recorre los MISMOS clientes que `plataforma_metricas._calcular`
  (todas las filas de `clientes`, ordenadas por slug, activas e inactivas, en
  secuencia y con `try/except` por cliente), abre cada base sólo para
  `_numeros_del_layout` + `_contratos_activos`, y devuelve **un número por
  tipo** — `{tipo: canon promedio}` — sin slugs, sin conteos, sin nombres. Caché
  en memoria por período con `CACHE_TTL_SEGUNDOS` y `TOPE_CACHE_PERIODOS`
  (mismo LRU acotado y mismo `_guardar_en_cache` que `/metricas`), más
  `limpiar_cache_detalle()` para las pruebas.
* **`backend/app/routers/plataforma.py`**: una ruta nueva AL FINAL del archivo
  (después de `/clientes/{slug}/reporte`, con el comentario del orden
  literal-antes-de-paramétrica) y el docstring del módulo actualizado — ya no
  dice que `/metricas` es la única excepción: ahora son dos, y la enmienda de la
  regla del operador pasa a "agregados exactos **y detalle de negocio**".
* **`backend/app/plataforma_metricas.py`**: DOS funciones nuevas, cero cambios
  de firma o de comportamiento en lo existente (el diff son 71 líneas, todas
  `+`).
* **`backend/tests/test_plataforma_detalle.py` (NUEVO)**: 33 pruebas, todas
  verdes.

## Archivos tocados

| Archivo | Qué |
|---|---|
| `backend/app/plataforma_detalle.py` | NUEVO — todo el cálculo |
| `backend/app/routers/plataforma.py` | ruta nueva al final + docstring del módulo |
| `backend/app/plataforma_metricas.py` | `+_del_periodo`, `+_contratos_del_cliente` (sólo agregados) |
| `backend/tests/test_plataforma_detalle.py` | NUEVO — 33 pruebas |

No toqué `docs/`, la política, `plataforma_reporte.py`, el frontend ni ningún
test ajeno.

## El endpoint

```
GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM
Depends(require_operador)
```

* `slug = (slug or "").strip().lower()` — igual que el PATCH de estados y que
  `/reporte`.
* `periodo` opcional: `normalizar_periodo` (por defecto el mes en curso, misma
  ventana de 24 atrás / 12 adelante de `/metricas`). Malformado o fuera de
  ventana → **422** con `str(e)`. Se valida ANTES de abrir nada.
* Slug inexistente (`app.clientes.buscar` → `None`) → **404**
  `"No hay un cliente con ese código."` (texto FIJO, el mismo de `/tendencia` y
  `/reporte`).
* Base de negocio ilegible → **503** con `ERROR_BASE_ILEGIBLE`; la URL de la
  base y el mensaje del driver van al log, nunca al JSON.
* Sin token → 401 y legado / trabajador / dueño de cliente → 403 salen solos de
  `require_operador`.
* **Bitácora SIEMPRE y DESPUÉS de armar**: `_anotar_consulta(email, "detalle",
  f"{slug}:{periodo}")`. Un 404 o un 422 no dejan línea: no hubo acceso a datos.
* **Sin caché del detalle**: se calcula en cada consulta (la bitácora anota cada
  una). Lo único cacheado es el benchmark.

## El shape, tal cual sale (JSON REAL de la siembra)

Cliente `detcli`, período `2026-09`: 2 sedes con plano; góndola doble (caras A y
B), punta y nevera en NAVE, punta en SUR; 3 contratos del período — uno que
vence adentro (`NAVE-PUN-01`, 19 días), uno que arranca adentro
(`NAVE-GON-01-B`, 2026-09-15) —, más un contrato histórico vencido y uno
cancelado. El proveedor de la punta se sembró con el correo y el teléfono
metidos adentro del `name`.

```json
{
 "cliente": {"slug": "detcli", "nombre": "Detalle Cliente", "estado_cuenta": "activo"},
 "periodo": "2026-09", "desde": "2026-09-01", "hasta": "2026-09-30",
 "generado_en": "2026-09-05T18:04:14Z",
 "sedes_con_plano": 2,
 "sedes": [
  {"sede": "NAVE", "espacios": 4, "ocupados": 3, "libres": 1, "ocupacion_pct": 75.0},
  {"sede": "SUR", "espacios": 1, "ocupados": 0, "libres": 1, "ocupacion_pct": 0.0}
 ],
 "espacios": [
  {"codigo": "NAVE-GON-01", "sede": "NAVE", "codigo_corto": "GON-01", "cara": "A",
   "tipo": "gondola", "zona": "Pasillo central", "area_m2": 4.5, "estado": "ocupado",
   "contrato": {"proveedor": "Alpina", "marca": "Alpina Kids", "canon_mensual": 1000000.0,
                "inicio": "2026-01-01", "fin": "2026-12-31", "dias_para_vencer": 121,
                "arranca_en_periodo": false}},
  {"codigo": "NAVE-GON-01-B", "sede": "NAVE", "codigo_corto": "GON-01", "cara": "B",
   "tipo": "gondola", "zona": null, "area_m2": 3.0, "estado": "ocupado",
   "contrato": {"proveedor": "Alpina", "marca": null, "canon_mensual": 600000.0,
                "inicio": "2026-09-15", "fin": "2026-11-30", "dias_para_vencer": 90,
                "arranca_en_periodo": true}},
  {"codigo": "NAVE-NEV-01", "sede": "NAVE", "codigo_corto": "NEV-01", "cara": null,
   "tipo": "nevera_refrescos", "zona": "Zona", "area_m2": 5.0, "estado": "libre",
   "contrato": null},
  {"codigo": "NAVE-PUN-01", "sede": "NAVE", "codigo_corto": "PUN-01", "cara": null,
   "tipo": "punta", "zona": "Zona", "area_m2": 5.0, "estado": "se_libera",
   "contrato": {"proveedor": "Nutresa [correo oculto] [teléfono oculto]", "marca": "Doria",
                "canon_mensual": 2000000.0, "inicio": "2026-05-01", "fin": "2026-09-20",
                "dias_para_vencer": 19, "arranca_en_periodo": false}},
  {"codigo": "SUR-PUN-01", "sede": "SUR", "codigo_corto": "PUN-01", "cara": null,
   "tipo": "punta", "zona": "Zona", "area_m2": 5.0, "estado": "libre", "contrato": null}
 ],
 "contratos_fuera_del_plano": 0,
 "resumen_por_tipo": [
  {"tipo": "gondola", "total": 2, "ocupados": 2, "libres": 0, "canon_promedio": 800000.0,
   "canon_minimo": 600000.0, "canon_maximo": 1000000.0, "tarifa_configurada": false},
  {"tipo": "nevera_refrescos", "total": 1, "ocupados": 0, "libres": 1,
   "canon_promedio": null, "canon_minimo": null, "canon_maximo": null,
   "tarifa_configurada": false},
  {"tipo": "punta", "total": 2, "ocupados": 1, "libres": 1, "canon_promedio": 2000000.0,
   "canon_minimo": 2000000.0, "canon_maximo": 2000000.0, "tarifa_configurada": false}
 ],
 "proveedores": [
  {"nombre": "Nutresa [correo oculto] [teléfono oculto]", "espacios": 1, "tipos": ["punta"],
   "sedes": ["NAVE"], "canon_total": 2000000.0, "canon_promedio": 2000000.0,
   "participacion_pct": 33.3, "desde": "2026-05-01", "contratos_por_vencer_60d": 1},
  {"nombre": "Alpina", "espacios": 2, "tipos": ["gondola"], "sedes": ["NAVE"],
   "canon_total": 1600000.0, "canon_promedio": 800000.0, "participacion_pct": 66.7,
   "desde": "2025-06-01", "contratos_por_vencer_60d": 0}
 ],
 "movimientos": [
  {"mes": "2025-10", "entradas": [], "salidas": []},
  {"mes": "2025-11", "entradas": [], "salidas": []},
  {"mes": "2025-12", "entradas": [], "salidas": [
    {"proveedor": "Alpina", "codigo": "SUR-PUN-01", "tipo": "punta",
     "canon_mensual": 800000.0, "fecha": "2025-12-31", "motivo": "vencimiento"}]},
  {"mes": "2026-01", "entradas": [
    {"proveedor": "Alpina", "codigo": "NAVE-GON-01", "tipo": "gondola",
     "canon_mensual": 1000000.0, "fecha": "2026-01-01", "cancelado": false}], "salidas": []},
  {"mes": "2026-02", "entradas": [], "salidas": []},
  {"mes": "2026-03", "entradas": [
    {"proveedor": "Bimbo", "codigo": "NAVE-NEV-01", "tipo": "nevera_refrescos",
     "canon_mensual": 300000.0, "fecha": "2026-03-01", "cancelado": true}], "salidas": []},
  {"mes": "2026-04", "entradas": [], "salidas": []},
  {"mes": "2026-05", "entradas": [
    {"proveedor": "Nutresa [correo oculto] [teléfono oculto]", "codigo": "NAVE-PUN-01",
     "tipo": "punta", "canon_mensual": 2000000.0, "fecha": "2026-05-01",
     "cancelado": false}], "salidas": []},
  {"mes": "2026-06", "entradas": [], "salidas": []},
  {"mes": "2026-07", "entradas": [], "salidas": []},
  {"mes": "2026-08", "entradas": [], "salidas": [
    {"proveedor": "Bimbo", "codigo": "NAVE-NEV-01", "tipo": "nevera_refrescos",
     "canon_mensual": 300000.0, "fecha": "2026-08-31", "motivo": "cancelacion"}]},
  {"mes": "2026-09", "entradas": [
    {"proveedor": "Alpina", "codigo": "NAVE-GON-01-B", "tipo": "gondola",
     "canon_mensual": 600000.0, "fecha": "2026-09-15", "cancelado": false}],
   "salidas": [
    {"proveedor": "Nutresa [correo oculto] [teléfono oculto]", "codigo": "NAVE-PUN-01",
     "tipo": "punta", "canon_mensual": 2000000.0, "fecha": "2026-09-20",
     "motivo": "vencimiento"}]}
 ],
 "benchmark_plataforma": {"gondola": 800000.0, "nevera_refrescos": 400000.0,
                          "punta": 2000000.0},
 "oportunidades": [
  {"codigo": "NAVE-PUN-01", "sede": "NAVE", "tipo": "punta", "estado": "se_libera",
   "precio_sugerido": 2000000.0, "origen_precio": "cliente",
   "valor_estimado_mensual": 2000000.0,
   "candidatos": [{"proveedor": "Alpina", "canon_actual": 800000.0, "mismo_tipo": false}]},
  {"codigo": "SUR-PUN-01", "sede": "SUR", "tipo": "punta", "estado": "libre",
   "precio_sugerido": 2000000.0, "origen_precio": "cliente",
   "valor_estimado_mensual": 2000000.0,
   "candidatos": [
     {"proveedor": "Nutresa [correo oculto] [teléfono oculto]", "canon_actual": 2000000.0,
      "mismo_tipo": true},
     {"proveedor": "Alpina", "canon_actual": 800000.0, "mismo_tipo": false}]},
  {"codigo": "NAVE-NEV-01", "sede": "NAVE", "tipo": "nevera_refrescos", "estado": "libre",
   "precio_sugerido": 400000.0, "origen_precio": "benchmark",
   "valor_estimado_mensual": 400000.0,
   "candidatos": [
     {"proveedor": "Nutresa [correo oculto] [teléfono oculto]", "canon_actual": 2000000.0,
      "mismo_tipo": false},
     {"proveedor": "Alpina", "canon_actual": 800000.0, "mismo_tipo": false}]}
 ],
 "recomendaciones": [
  {"id": "espacio_libre:punta", "tipo": "espacio_libre", "prioridad": "alta",
   "valor_estimado_mensual": 4000000.0,
   "explicacion": "2 espacio(s) de tipo punta libre(s) (NAVE-PUN-01, SUR-PUN-01): ofrecerlos a Alpina a unos $ 2.000.000 mensuales cada uno (promedio que ya cobra este cliente).",
   "datos": {"tipo": "punta", "espacios": ["NAVE-PUN-01", "SUR-PUN-01"], "libres": 2,
             "precio_sugerido": 2000000.0, "origen_precio": "cliente",
             "candidatos": [{"proveedor": "Alpina", "canon_actual": 800000.0,
                             "mismo_tipo": false}]}},
  {"id": "contrato_por_vencer:NAVE-PUN-01", "tipo": "contrato_por_vencer",
   "prioridad": "alta", "valor_estimado_mensual": 2000000.0,
   "explicacion": "El contrato de Nutresa [correo oculto] [teléfono oculto] en NAVE-PUN-01 (punta) vence el 2026-09-20 (en 19 días): renovar o reasignar; canon en juego $ 2.000.000.",
   "datos": {"codigo": "NAVE-PUN-01", "tipo": "punta",
             "proveedor": "Nutresa [correo oculto] [teléfono oculto]",
             "canon_mensual": 2000000.0, "fin": "2026-09-20", "dias_para_vencer": 19}},
  {"id": "sede_subutilizada:SUR", "tipo": "sede_subutilizada", "prioridad": "alta",
   "valor_estimado_mensual": 2000000.0,
   "explicacion": "SUR está al 0.0 % de ocupación, 60.0 puntos por debajo del promedio del cliente (60.0 %): concentrar la venta ahí; 1 espacios libres por $ 2.000.000 mensuales.",
   "datos": {"sede": "SUR", "ocupacion_pct": 0.0, "ocupacion_promedio_cliente_pct": 60.0,
             "libres": 1, "espacios_libres": ["SUR-PUN-01"]}},
  {"id": "concentracion_proveedor:Alpina", "tipo": "concentracion_proveedor",
   "prioridad": "alta", "valor_estimado_mensual": 1600000.0,
   "explicacion": "2 de 3 contratos activos (66.7 %) dependen de Alpina: diversificar; canon en juego $ 1.600.000.",
   "datos": {"proveedor": "Alpina", "contratos": 2, "contratos_activos_total": 3,
             "participacion_pct": 66.7, "canon_total": 1600000.0}},
  {"id": "espacio_libre:nevera_refrescos", "tipo": "espacio_libre", "prioridad": "media",
   "valor_estimado_mensual": 400000.0,
   "explicacion": "1 espacio(s) de tipo nevera_refrescos libre(s) (NAVE-NEV-01): ofrecerlos a Nutresa [correo oculto] [teléfono oculto], Alpina a unos $ 400.000 mensuales cada uno (promedio de la plataforma).",
   "datos": {"tipo": "nevera_refrescos", "espacios": ["NAVE-NEV-01"], "libres": 1,
             "precio_sugerido": 400000.0, "origen_precio": "benchmark",
             "candidatos": [
               {"proveedor": "Nutresa [correo oculto] [teléfono oculto]",
                "canon_actual": 2000000.0, "mismo_tipo": false},
               {"proveedor": "Alpina", "canon_actual": 800000.0, "mismo_tipo": false}]}},
  {"id": "precio_bajo_tarifa:gondola", "tipo": "precio_bajo_tarifa", "prioridad": "media",
   "valor_estimado_mensual": 200000.0,
   "explicacion": "1 contrato(s) de gondola cobran por debajo del promedio del cliente para ese tipo ($ 800.000): subir el canon en la próxima renovación; brecha $ 200.000 mensuales.",
   "datos": {"tipo": "gondola", "canon_promedio": 800000.0, "contratos_bajo_promedio": 1,
             "codigos": ["NAVE-GON-01-B"], "brecha_total": 200000.0}},
  {"id": "sin_tarifa:todos", "tipo": "sin_tarifa", "prioridad": "baja",
   "valor_estimado_mensual": 0.0,
   "explicacion": "Sin tarifa de referencia para gondola, nevera_refrescos, punta: cargar tarifas para medir el spread.",
   "datos": {"tipos": ["gondola", "nevera_refrescos", "punta"]}}
 ]
}
```

Cliente sin contratos del período (o sin plano) → `recomendaciones` es
**exactamente** `[{"id": "arranque:todos", "prioridad": "alta", …}]`; las demás
no se generan.

## Reglas de cálculo implementadas

**Espacios.** El universo son las claves de `mapa_tipos` de
`_numeros_del_layout` (cara `-B` incluida, con el MISMO tipo que su góndola).
`codigo_corto` = código sin el prefijo `SEDE-` y sin el sufijo `-B`; `cara` =
`"B"` si termina en `-B`, `"A"` si su fixture es góndola doble
(`_es_gondola_doble`), `null` si no. `zona` = `Space.zone` si hay fila y no está
vacía; `area_m2` = `Space.area_m2` si hay fila y es > 0, si no la huella del
mueble (`_huella`, ancho × fondo con el giro aplicado) redondeada a 2, si no
`null`. Orden: sede, después código completo.

**Contratos del período.** `is_active AND start_date <= hasta AND end_date >=
desde` — la MISMA regla de `_contratos_activos`, ahora enunciada una sola vez en
`_del_periodo`. Con más de un contrato sobre el mismo espacio se publica el de
**fin más tardío** (empates por canon y por nombre, para que el JSON sea
determinista). `estado`: `ocupado`; `se_libera` si además `fin <= hasta`;
`libre` si no hay. `dias_para_vencer = (fin − desde).days`;
`arranca_en_periodo = inicio >= desde`. Un contrato cuyo código NO está en
`mapa_tipos` **no es un espacio**: cuenta en `contratos_fuera_del_plano`, en
`proveedores` (con `"fuera_del_plano"` en `tipos` y sin sede) y en
`movimientos`; nunca en `espacios` / `resumen_por_tipo` / `oportunidades`; sí en
`contrato_por_vencer`, porque la plata existe aunque el plano no la muestre.

**Sedes.** Una fila por sede con plano; `ocupados` incluye a los `se_libera`
(durante el período están tomados); `ocupacion_pct` por `_pct`.

**Resumen por tipo.** `total/ocupados/libres`; promedio/mínimo/máximo sobre los
contratos PUBLICADOS en `espacios[]` de ese tipo (`null` con cero);
`tarifa_configurada` = `_tarifa_aplicable(_tarifas_limpias(db), sede, tipo)` no
es `None` para ALGUNA sede con espacios de ese tipo. **El valor de la tarifa no
sale nunca**, ni su suma, ni su promedio.

**Proveedores.** Se agrupa por el nombre **crudo** y se publica el **saneado**
(igual que `_top` de `plataforma_metricas`: agrupar por la versión saneada
podría fundir dos proveedores distintos y el conteo mentiría). `espacios` = nº
de contratos del período; `tipos` y `sedes` ordenados; `canon_total` /
`canon_promedio` por `_plata`; `participacion_pct` = `_pct(contratos, total de
contratos del período)`; `desde` = mínimo `start_date` de TODOS sus contratos
históricos (activos, vencidos o cancelados); `contratos_por_vencer_60d` =
contratos del período con `dias_para_vencer <= 60`. Orden: `canon_total` desc,
después nombre.

**Movimientos.** Doce meses, de `_corrido(periodo, -11)` al período inclusive.
Entradas = contratos que EMPEZARON ese mes (con `cancelado`); salidas =
contratos que TERMINARON ese mes, con `motivo` `"cancelacion"` si
`is_active == False` y `"vencimiento"` si no — el modelo no tiene tabla de
cancelaciones: `is_active=False` con la `end_date` intacta es lo que la
representa (`routers/spaces.py::cancel_lease`). Dentro del mes, ordenados por
fecha, código y proveedor.

**Benchmark.** `{tipo: promedio}` sobre todos los clientes legibles (el propio
incluido); los códigos sin tipo se saltan; las bases rotas se ignoran con
`log.exception`. Nada más sale de ahí.

**Oportunidades.** Un item por espacio `libre` o `se_libera`.
`precio_sugerido` = el `canon_promedio` del cliente para ese tipo (origen
`"cliente"`); si es `null`, el benchmark (origen `"benchmark"`); si tampoco,
`null` / `null`. `valor_estimado_mensual = precio_sugerido or 0`. `candidatos` =
proveedores del cliente que NO ocupan ese espacio, primero los que ya tienen
contratos del mismo tipo, dentro de cada grupo por `canon_actual`
(= `canon_promedio` del proveedor) desc y después por nombre; máximo 3. Orden:
valor desc, después código.

**Prioridad.** `ingreso_periodo` = Σ canon de todos los contratos del período
(fuera del plano incluidos). Regla general: **alta** si `valor >= 0,15 ×
ingreso` (o `ingreso == 0` y `valor > 0`), **media** si `valor >= 0,05 ×
ingreso`, **baja** si no. Excepciones: `contrato_por_vencer` es alta con
`dias_para_vencer <= 30` y nunca menos que media; `concentracion_proveedor` es
alta con participación ≥ 60 % y media si no; `sin_tarifa` es siempre baja con
valor 0; `arranque` es siempre alta.

**Recomendaciones** (`id = "{tipo}:{clave}"`):

| tipo | una por | valor | prioridad |
|---|---|---|---|
| `espacio_libre` | TIPO de espacio con ≥ 1 libre/se_libera | Σ precio sugerido de esos espacios | general |
| `contrato_por_vencer` | espacio con contrato del período a ≤ 60 días | canon mensual | ≤ 30 días alta; si no, general con piso media |
| `precio_bajo_tarifa` | tipo con ≥ 2 contratos publicados y alguno por debajo del promedio del cliente | Σ (promedio − canon) | general |
| `concentracion_proveedor` | proveedor con participación ≥ 40 % (y ≥ 2 contratos en total) | canon total del proveedor | ≥ 60 % alta, si no media |
| `sede_subutilizada` | sede ≥ 15 puntos bajo la ocupación global (con ≥ 2 sedes) | Σ precio sugerido de sus espacios libres | general |
| `sin_tarifa` | UNA, con todos los tipos sin tarifa | 0 | baja |
| `arranque` | ÚNICA si hay CERO contratos del período | Σ benchmark por espacio comercializable | alta |

Orden final: prioridad (alta, media, baja), después valor desc, después `id`
asc. `precio_bajo_tarifa` compara contra el **promedio del propio cliente**,
nunca contra la tarifa de referencia.

**Explicaciones.** Texto corto en español generado por plantilla desde `datos`,
sin PII: sólo nombres SANEADOS, códigos, tipos, fechas y plata formateada por
`_pesos(v)` → `"$ 1.200.000"` (sin decimales, punto de miles). Los tests afirman
las siete plantillas palabra por palabra y que ninguna trae una arroba, el
teléfono, el `contact_name` ni la nota sembrados.

## Helpers reusados (cero fórmulas duplicadas)

De `app/plataforma_metricas.py`: `_numeros_del_layout` (y su `mapa_tipos`),
`_contratos_activos` (benchmark), `_es_comercializable`, `_es_gondola_doble`,
`_codigo_completo`, `_tarifas_limpias`, `_tarifa_aplicable`,
`sanear_nombre_proveedor`, `_pct`, `_plata`, `_ahora_iso`, `_corrido`,
`rango_del_periodo`, `normalizar_periodo`, `PeriodoInvalido`,
`ERROR_BASE_ILEGIBLE`, `CACHE_TTL_SEGUNDOS`, `TOPE_CACHE_PERIODOS`,
`_guardar_en_cache`. De `app/plataforma_tendencia.py`: `ClienteDesconocido` (la
MISMA excepción de `/tendencia` y `/reporte`, para que el 404 sea idéntico). De
`app/services/layout_lookup.py`: `_huella`. De `app/plataforma_estado.py`:
`estado_de`. De `app/clientes.py`: `buscar`, `sesion_de`, `sesion_registro`.

**Helpers nuevos en `plataforma_metricas.py`** (hermanos de `_contratos_activos`,
sin tocar su firma ni su comportamiento):

* `_del_periodo(inicio, fin, activo, desde, hasta) -> bool` — la MISMA regla de
  "activo en el período", enunciada una sola vez para los dos caminos (el
  filtro SQL de `_contratos_activos` y la decisión en memoria del detalle).
* `_contratos_del_cliente(db) -> [(codigo, proveedor, marca, canon, inicio, fin,
  is_active)]` — todos los contratos de la base, sin filtrar: el detalle
  necesita los históricos para los movimientos de 12 meses y para el primer
  contrato de cada proveedor.

**Helpers nuevos en `plataforma_detalle.py`**: `_fixtures_por_codigo` (la vuelta
del plano que devuelve el FIXTURE de cada código, con los mismos helpers de
`_numeros_del_layout`, en vez de llamar a `find_fixture_by_space_code` una vez
por espacio), `_zona_y_area` (SÓLO `code`, `zone` y `area_m2` de `spaces`:
`notes` y el `id` no se leen), `_pesos`, y las funciones puras de armado
(`_armar_espacios`, `_armar_sedes`, `_armar_resumen_por_tipo`,
`_indice_de_proveedores`, `_armar_movimientos`, `_armar_oportunidades`,
`_rec_*`).

## La frontera, tal como quedó

NUNCA al JSON: `Supplier.contact_name` / `phone` / `email` / `notes`,
`Space.notes`, `SpaceLease.notes`, `SpaceFile`, `LeaseFile`, fotos,
`observation` / `supplierName` / `negotiatedValue` / `nomenclatura` / `label` del
fixture (los contratos salen SOLO de `space_leases`), ningún correo/nombre/id de
usuario, ningún id de fila (`space_id`, `lease_id`, `supplier_id`), la tarifa de
referencia ni su suma ni su promedio. El nombre del proveedor pasa por
`sanear_nombre_proveedor` antes de entrar a CUALQUIER string del JSON — incluidas
las `explicacion` y los `id` de las recomendaciones —; la `marca` va por el mismo
saneo, que es el otro texto libre que teclea el cliente.

Un test barre las CLAVES de todos los niveles contra
`{contact_name, phone, email, notes, notas, tarifa, rates, by_sede, default,
space_id, lease_id, supplier_id, svg_id, foto, observation, supplierName,
negotiatedValue}` y afirma que la única clave con "tarifa" es
`tarifa_configurada`; otro barre los VALORES contra el correo, el teléfono, el
`contact_name`, la nota y los correos de usuario sembrados, y que ningún string
del JSON trae una arroba.

## Verificación

```
cd backend
python -c "import app.main"                                            # ok
TMPDIR=/tmp/pt-backend-detalle pytest -q tests/test_plataforma_detalle.py    # 33 passed
TMPDIR=/tmp/pt-backend-detalle pytest -q tests/test_plataforma_metricas.py \
                                        tests/test_plataforma_reporte.py    # 64 passed
```

Las 33 pruebas cubren: la siembra de la spec espacio por espacio (tipo, estado,
contrato con canon y fechas exactos, proveedor enmascarado); el resumen por tipo
a mano; sedes y contratos fuera del plano; proveedores (`desde`,
`participacion_pct`, `por_vencer_60d`); los 12 meses de movimientos con una
entrada, un vencimiento y una cancelación; oportunidades con precio del cliente
y con benchmark (sembrando un segundo cliente y verificando el promedio a mano);
las siete recomendaciones ordenadas, sus `datos` y sus `explicacion` palabra por
palabra; el cliente sin contratos (una sola `arranque`) y el cliente sin plano;
200/401/403 legado/403 dueño/404 con el texto fijo/422/503 con
`ERROR_BASE_ILEGIBLE`; la bitácora (`accion="detalle"`,
`periodo="<slug>:<YYYY-MM>"`, dos consultas → dos líneas, y un 404 → ninguna);
las claves exactas de cada nivel; el orden de rutas por `rutas_planas`; que el
endpoint no escribe (sha256 del archivo de la base + conteo de filas idénticos
antes y después); y que dos consultas seguidas devuelven exactamente lo mismo.

No corrí la suite completa, ni `npm run build`, ni `tsc` (no toqué frontend).

## Gaps y supuestos

1. **`plataforma_reporte.py::CATALOGO` — es de `legal-catalogo`.** Faltan las
   entradas del detalle. Sugerencia de claves nuevas con
   `endpoints: ["detalle"]`: `espacio_codigo` / `espacio_tipo` /
   `espacio_estado` (`tratamiento: "exacto"`, fuente
   `layout_snapshots, spaces`), `contrato_proveedor`
   (`tratamiento: "saneado"`, fuente `space_leases, suppliers`),
   `contrato_canon_mensual` / `contrato_fechas` (`"exacto"`, fuente
   `space_leases`), `proveedor_participacion` (`"exacto"`),
   `benchmark_plataforma` (`"exacto"`, fuente `space_leases de todos los
   clientes`, finalidad `mejora_servicio`) y `recomendaciones`
   (`"exacto"`/derivado). Finalidad sugerida: `asesoria`, más la nueva
   `mejora_servicio` que pide la spec.
2. **`plataforma_reporte.py::_accesos_del_cliente` — es de `legal-catalogo`.**
   Hoy la cadena de `if` no conoce `"detalle"` y cae en `alcanza = False`: la
   línea que este endpoint deja en `bitacora_plataforma` **no aparece** en el
   reporte de transparencia del dueño. Hace falta una rama
   `elif f.accion == "detalle": alcanza = periodo.startswith(f"{slug}:")`
   (idéntica a la de `"reporte"`, porque el formato del `periodo` es el mismo
   `"<slug>:<algo>"`). Mi test lee la bitácora directo del registro justamente
   porque el reporte todavía no la muestra.
3. **`docs/ESTADO.md`** lo escribe `legal-catalogo`; abajo dejo el texto
   propuesto.
4. **Supuesto — agrupación de proveedores por nombre crudo.** El JSON publica el
   nombre saneado, pero el agrupamiento y los conteos usan el crudo (precedente
   de `_top`). Si dos nombres distintos sanearan al mismo string, aparecerían
   dos filas con el mismo `nombre` y dos recomendaciones de concentración con el
   mismo `id`. Preferí el conteo correcto sobre la unicidad cosmética del `id`;
   es reversible en una línea si el Verificador prefiere lo otro.
5. **Supuesto — `contrato_por_vencer` es una por ESPACIO**, sobre el contrato
   publicado (el de fin más tardío), no una por fila de `space_leases`: así el
   `id` es único y coincide con lo que muestra la tabla de espacios. Con un
   contrato por espacio —el caso real— es lo mismo.
6. **Supuesto — `sede_subutilizada` cuenta como "libres" sólo los `libre`**, no
   los `se_libera`, para cuadrar con la columna `libres` de `sedes[]`.
   `espacio_libre` y `oportunidades` sí incluyen los `se_libera` (ahí lo que
   importa es qué se puede ofrecer).
7. **Supuesto — `sedes[]` sale de las sedes con espacios comercializables.** Una
   sede cuyo plano existe pero cuyos muebles están todos marcados
   `rentable: false` cuenta en `sedes_con_plano` y no aparece en `sedes[]`: no
   tiene inventario que vender.
8. **El benchmark incluye al propio cliente** ("todos los legibles"). Con un
   solo cliente en la plataforma, el benchmark de un tipo que ese cliente ya
   cobra es su propio promedio — no se usa nunca en ese caso (manda el precio
   del cliente), pero sale en `benchmark_plataforma`.
9. **Frontend**: el shape es el que pide el Maestro, sin una clave de más ni de
   menos; `frontend-detalle.md` (otro agente) tiene que consumir estos nombres
   exactos.

## Texto propuesto para `docs/ESTADO.md` — sección "Fase 8"

> ### Fase 8 — Detalle por cliente para asesoría
>
> El operador ya no ve sólo agregados: ve el negocio de cada cliente **espacio
> por espacio**. Decisión del dueño de la plataforma (2026-09-05, encima de la
> Fase 7 y en la misma versión de política): "la plataforma aún no tiene toda la
> información disponible para hacer análisis; no sé qué proveedor está en cada
> espacio y a qué precio". La enmienda de la regla del operador pasa a
> **"agregados exactos y detalle de negocio (espacios, contratos, proveedores),
> solo lectura, con bitácora y reporte de transparencia"**.
>
> `GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM`
> (`require_operador`, `app/plataforma_detalle.py`, ruta declarada AL FINAL de
> `routers/plataforma.py` después de `/clientes/{slug}/reporte`). Abre la base de
> ESE cliente **una sola vez** y sólo para `query`; la única otra apertura de
> bases es `benchmark_por_tipo`, que recorre los mismos clientes que
> `_calcular` y devuelve UN número por tipo de espacio, sin desglose ni nombres.
> Sin migraciones: todo sale de `layout_snapshots`, `spaces`, `space_leases`,
> `suppliers` y `app_config`.
>
> Devuelve: `sedes[]` (espacios, ocupados, libres, % por sede); `espacios[]` (una
> por CARA comercializable del plano, `-B` incluida: código completo, código
> corto, cara A/B, tipo, zona, área, estado `ocupado`/`libre`/`se_libera`, y el
> contrato publicado —proveedor saneado, marca, canon, inicio, fin, días para
> vencer, si arranca en el período—); `contratos_fuera_del_plano`;
> `resumen_por_tipo[]` (total/ocupados/libres, canon promedio/mínimo/máximo y
> `tarifa_configurada` **sí/no**, nunca el valor); `proveedores[]` (espacios,
> tipos, sedes, canon total y promedio, participación, desde cuándo, contratos
> por vencer en 60 días); `movimientos[]` (12 meses, entradas y salidas con
> motivo `vencimiento`/`cancelacion`); `benchmark_plataforma`;
> `oportunidades[]` (precio sugerido = promedio del cliente para ese tipo o, si
> no tiene, el de la plataforma marcado `benchmark`, más hasta 3 proveedores
> candidatos); y `recomendaciones[]` priorizadas
> (`espacio_libre`, `contrato_por_vencer`, `precio_bajo_tarifa`,
> `concentracion_proveedor`, `sede_subutilizada`, `sin_tarifa`, y `arranque`
> como ÚNICA cuando el cliente no tiene un solo contrato del período), cada una
> con `prioridad`, `valor_estimado_mensual`, los datos que la sustentan y una
> `explicacion` corta generada en el backend sin PII.
>
> Frontera (igual de dura que la Fase 4, aplicada a filas): jamás
> `Supplier.contact_name`/`phone`/`email`/`notes`, `Space.notes`,
> `SpaceLease.notes`, `SpaceFile` ni fotos; ningún correo, nombre ni id de
> usuario del supermercado; ningún id de fila; ni la tarifa de referencia (sólo
> `tarifa_configurada`). El nombre del proveedor pasa por
> `sanear_nombre_proveedor` antes de entrar a cualquier string, incluidas las
> explicaciones y los `id` de las recomendaciones. Sin escritura: la garantía es
> por construcción (sólo `query` y `close`) y un test la comprueba desde afuera
> con el sha256 del archivo de la base. 401 sin token, 403 legado/trabajador/
> dueño, 404 con el texto fijo `"No hay un cliente con ese código."`, 422 por
> período fuera de ventana, 503 con `ERROR_BASE_ILEGIBLE` si la base no se deja
> leer. Bitácora SIEMPRE, `accion="detalle"`,
> `periodo="<slug>:<YYYY-MM>"`. **Sin caché del detalle** (cada consulta se
> calcula y se anota); el benchmark sí se cachea 5 minutos por período, con el
> mismo LRU acotado de `/metricas`.
>
> Reglas de cálculo que hay que respetar si esto se toca: "contrato del período"
> es `is_active AND start_date <= hasta AND end_date >= desde`
> (`plataforma_metricas._del_periodo`, la MISMA regla que `_contratos_activos`);
> con varios contratos sobre un espacio se publica el de fin más tardío; un
> contrato cuyo código no está en el plano no es un espacio pero sí es plata
> (cuenta en proveedores, movimientos y vencimientos); prioridad alta desde el
> 15 % del ingreso contratado del mes y media desde el 5 %, con las excepciones
> de vencimiento (≤ 30 días alta, nunca menos que media), concentración (≥ 60 %
> alta), `sin_tarifa` (siempre baja, valor 0) y `arranque` (siempre alta).
>
> Frontend: `/plataforma/clientes/:slug` con Recomendaciones primero, luego
> Oportunidades, Espacios, Por tipo, Proveedores y Movimientos; enlace "Ver
> detalle" desde la tabla de `/plataforma`; primitivas de
> `components/plataforma/consola.tsx`, tokens `--con-*`, claro y oscuro,
> imprimible, sin librerías nuevas.
>
> **Gotcha**: `test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint`
> barre el OpenAPI con el token de montaje y necesita un valor por cada
> parámetro de ruta en su diccionario `relleno`; `slug` ya está desde la Fase 7,
> así que este GET queda barrido solo.
