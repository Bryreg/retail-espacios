# Backend — reporte de transparencia por cliente (Fase 7, Parte B)

Builder: `backend-reporte`. Repo `/tmp/retail-espacios-test`, rama
`claude/fase-7-transparencia`. Sin commit, sin push, sin tocar `ESTADO.md`
(lo escribe `backend-supresion`).

## AJUSTE ITERACIÓN 2 (2026-09-05)

Dos bloqueantes del auditor (`test_transparencia_ataques.py::test_t36` y
`::test_t62`, ambos `xfail(strict=True)`, NO tocados — territorio del
auditor). Los dos corregidos en este territorio:

- **C-2 — freno cobrado antes de validar `meses`.** En
  `routers/derechos.py::mi_reporte_plataforma`, se movió la validación
  `1 <= meses <= MESES_MAXIMO` (mismo texto exacto de `MesesInvalidos`:
  `"Los meses van de 1 a {MESES_MAXIMO}."`) ANTES de
  `_chequear_y_anotar_freno_export(usuario_id)`. Se importó `MESES_MAXIMO`
  de `app.plataforma_tendencia` al lado del `MESES_DEFAULT` que ya estaba.
  El `except MesesInvalidos` existente se dejó como red de seguridad (no se
  borró). Docstring del endpoint actualizado explicando el orden. Test
  nuevo: `test_meses_invalido_no_consume_el_freno_del_dueno` (3×`meses=0` →
  422 cada uno, sin gastar cupo; el 4.º con meses por defecto → 200). El
  endpoint del operador (`routers/plataforma.py`) no tiene este problema
  (no comparte freno) — no se tocó.
- **C-3 — 5 claves de `valores[]` sin entrada en `CATALOGO`.** Se agregaron
  ADITIVAMENTE 5 entradas nuevas al final de `CATALOGO` (las 17 originales
  no se tocaron ni se reordenaron): `ocupadas`, `contratos_activos`,
  `canon_total`, `origen`, `capturado_en` — cada una con las 7 claves de
  `CLAVES_CATALOGO_ITEM` y `tratamiento` dentro del vocabulario cerrado
  (`conteo`, `conteo`, `exacto`, `exacto`, `sin_hora` respectivamente). Su
  `endpoints` es `["reporte"]` en las 5 (nunca `"metricas"`/`"tendencia"`/
  `"adopcion"`: ninguna sale con ese nombre exacto en esos endpoints, y
  `test_t61` del auditor afirma el recíproco). `CATALOGO` pasa de 17 a
  **22 entradas**; el comentario de cabecera del módulo se actualizó.
  Además (L-4, una línea): la entrada `estado_cuenta` aclara ahora en su
  `definicion` que el motivo del último cambio lo escribe el operador, no
  es un dato tomado del cliente.
- Verificación de que ninguno de los dos arreglos rompió nada propio: los
  64 tests de mi territorio (`test_plataforma_reporte.py` con el test nuevo
  incluido + los 3 archivos vecinos) siguen en verde, y
  `test_catalogo_cubre_cada_clave_publicada_por_metricas_y_adopcion` (que
  sólo chequea inclusión) sigue verde con el catálogo de 22.
- Confirmado con lectura (sin editar el archivo del auditor):
  `pytest tests/test_transparencia_ataques.py -k "t36 or t62"` → los dos
  ahora **XPASS(strict)** (ver salida completa más abajo) — la prueba de
  que ambos arreglos entraron; el auditor quita los `xfail`.

## Archivos tocados

- **NUEVO** `backend/app/plataforma_reporte.py` — `CATALOGO` (**22 entradas**
  taxativas: 17 originales + 5 agregadas en la iteración 2, ver arriba) +
  `armar_reporte(slug, meses) -> dict`, única puerta que arman los dos
  endpoints.
- `backend/app/routers/derechos.py` — `GET /clientes/mi-reporte-plataforma`
  (owner-only, valida `meses` ANTES del freno compartido con `/mi-export`,
  no anota bitácora) + import de `MESES_DEFAULT` y `MESES_MAXIMO` desde
  `plataforma_tendencia`.
- `backend/app/routers/plataforma.py` — `GET /plataforma/clientes/{slug}/reporte`
  (operador, declarada al final del archivo, después de todas las literales;
  anota `accion="reporte"` en la bitácora).
- `backend/app/clientes.py` — una línea en `_EXENTOS_POR_HABEAS_DATA`:
  `"/api/clientes/mi-reporte-plataforma"`.
- **NUEVO** `backend/tests/test_plataforma_reporte.py` — 19 tests (18 +
  `test_meses_invalido_no_consume_el_freno_del_dueno` de la iteración 2).

No se tocó ningún otro archivo de `plataforma_metricas.py` / `plataforma_tendencia.py`
(el otro agente los está editando en paralelo para sacar K=3; sólo se
importan sus nombres públicos: `periodo_actual`, `rango_del_periodo`,
`_metricas_de_un_cliente`, `_top`, `_pct`, `_plata`, `sanear_nombre_proveedor`
—vía `_top`—, `ultimos_periodos`, `CONSOLIDADO_SLUG`, `MESES_DEFAULT`,
`MESES_MAXIMO`, `MesesInvalidos`, `ClienteDesconocido`).

## JSON de ejemplo REAL (generado corriendo la app de verdad)

Cliente `demosuper`: se fundó por alta self-service (acepta la política de
entrada), se cargó un proveedor con un correo adentro del nombre
(`"Alpina Distribuciones (ventas@alpina.co)"`), un contrato de $1.500.000 y un
plano con una sola cara. El operador (`op@recabra.co`) miró `/metricas` (para
disparar el write-through del snapshot del mes en curso) y después pidió el
reporte del operador; luego se pidió el reporte del dueño, que es el que se
muestra acá completo:

```json
{
  "cliente": {
    "slug": "demosuper",
    "nombre": "Demo Super"
  },
  "generado_en": "2026-09-05T13:07:15Z",
  "ventana": {
    "desde": "2025-10",
    "hasta": "2026-09",
    "meses": 12
  },
  "politica": {
    "version_vigente": "2026-09-v1",
    "version_aceptada": "2026-09-v1",
    "aceptada_en": "2026-09-05",
    "base_legal": "Política de Tratamiento de Datos Personales, §5.3 (Ley 1581/2012, Decreto 1377/2013)",
    "url": "/politica-datos"
  },
  "catalogo": [
    { "clave": "sedes_con_plano", "nombre": "Sedes con plano", "definicion": "Cuántas sedes del cliente tienen un plano (layout) guardado en la plataforma.", "fuente": "layout_snapshots", "finalidad": "salud_cartera", "endpoints": ["metricas", "tendencia"], "tratamiento": "exacto" },
    { "clave": "espacios_comercializables", "nombre": "Espacios comercializables", "definicion": "Cuántas caras de mueble están marcadas como vendibles en los planos vigentes del cliente.", "fuente": "layout_snapshots", "finalidad": "salud_cartera", "endpoints": ["metricas", "tendencia"], "tratamiento": "exacto" },
    { "clave": "ocupacion_pct", "nombre": "Ocupación", "definicion": "Porcentaje de espacios comercializables con un contrato activo en el período (ocupadas ÷ comercializables × 100).", "fuente": "layout_snapshots, space_leases", "finalidad": "salud_cartera", "endpoints": ["metricas", "tendencia"], "tratamiento": "relacion" },
    { "clave": "canon_promedio_mensual", "nombre": "Canon promedio mensual", "definicion": "Promedio del canon mensual de los contratos activos del período (canon total ÷ cantidad de contratos activos).", "fuente": "space_leases", "finalidad": "salud_cartera", "endpoints": ["metricas", "tendencia"], "tratamiento": "relacion" },
    { "clave": "ingreso_contratado_mes", "nombre": "Ingreso contratado del mes", "definicion": "Suma del canon mensual de todos los contratos activos del período.", "fuente": "space_leases", "finalidad": "salud_cartera", "endpoints": ["metricas", "tendencia"], "tratamiento": "exacto" },
    { "clave": "top_proveedores", "nombre": "Top de proveedores", "definicion": "Los proveedores con más contratos activos del período (hasta 5), con el nombre saneado (correos y teléfonos enmascarados) y su conteo de contratos.", "fuente": "space_leases, suppliers", "finalidad": "asesoria", "endpoints": ["metricas", "tendencia"], "tratamiento": "saneado" },
    { "clave": "usuarios_con_cuenta", "nombre": "Usuarios con cuenta", "definicion": "Cantidad de personas con una membresía activa en la cuenta del cliente.", "fuente": "membresias", "finalidad": "cobranza", "endpoints": ["metricas", "tendencia", "adopcion"], "tratamiento": "conteo" },
    { "clave": "ultimo_acceso", "nombre": "Último acceso", "definicion": "Fecha (sin hora) del ingreso más reciente de cualquier persona con membresía activa en el cliente.", "fuente": "usuarios.ultimo_login, membresias", "finalidad": "cobranza", "endpoints": ["metricas"], "tratamiento": "sin_hora" },
    { "clave": "estado_cuenta", "nombre": "Estado de cuenta", "definicion": "El estado comercial de la cuenta (activo, gracia, solo_lectura o suspendido) que fijó el operador, con el motivo del último cambio.", "fuente": "estados_cliente", "finalidad": "cobranza", "endpoints": ["metricas", "adopcion"], "tratamiento": "exacto" },
    { "clave": "spread_pct", "nombre": "Spread sobre la tarifa de referencia", "definicion": "Diferencia porcentual entre el canon efectivamente cobrado y la tarifa de referencia del espacio, en los contratos del período con tarifa aplicable ((Σ canon con tarifa ÷ Σ tarifa − 1) × 100). La tarifa de referencia nunca sale, sólo esta relación.", "fuente": "space_leases, app_config (tarifa de referencia)", "finalidad": "salud_cartera", "endpoints": ["metricas"], "tratamiento": "relacion" },
    { "clave": "tarifa_configurada", "nombre": "Tarifa de referencia configurada", "definicion": "Si el cliente tiene alguna tarifa de referencia cargada (nunca cuál, sólo si existe).", "fuente": "app_config (tarifa de referencia)", "finalidad": "salud_cartera", "endpoints": ["metricas"], "tratamiento": "exacto" },
    { "clave": "contratos_sin_tarifa", "nombre": "Contratos sin tarifa aplicable", "definicion": "Cantidad de contratos activos del período cuyo espacio no tiene una tarifa de referencia (de su sede o por defecto) aplicable.", "fuente": "space_leases, app_config (tarifa de referencia)", "finalidad": "salud_cartera", "endpoints": ["metricas"], "tratamiento": "conteo" },
    { "clave": "cohorte", "nombre": "Cohorte de adopción", "definicion": "Mes de alta del cliente (la fundación self-service más antigua, o la fecha de creación del registro si no hay fundación), usado para agrupar la adopción.", "fuente": "fundaciones, clientes", "finalidad": "asesoria", "endpoints": ["adopcion"], "tratamiento": "sin_hora" },
    { "clave": "clasificacion", "nombre": "Clasificación de adopción", "definicion": "Categoría del cliente en el período (nueva, activa, fantasma, dormida o sin_cuentas), según cuentas con membresía, accesos recientes y contratos activos.", "fuente": "membresias, usuarios.ultimo_login, space_leases", "finalidad": "asesoria", "endpoints": ["adopcion"], "tratamiento": "relacion" },
    { "clave": "usuarios_activos_30d", "nombre": "Usuarios activos en 30 días", "definicion": "Cantidad de personas con membresía activa que ingresaron en los últimos 30 días.", "fuente": "membresias, usuarios.ultimo_login", "finalidad": "asesoria", "endpoints": ["adopcion"], "tratamiento": "conteo" },
    { "clave": "dias_sin_acceso", "nombre": "Días sin acceso", "definicion": "Días transcurridos desde el último ingreso de cualquier persona con membresía activa (sin dato si nunca entró nadie).", "fuente": "usuarios.ultimo_login, membresias", "finalidad": "asesoria", "endpoints": ["adopcion"], "tratamiento": "sin_hora" },
    { "clave": "con_contratos_activos", "nombre": "Tiene contratos activos", "definicion": "Si el cliente tiene al menos un contrato activo en el período en curso.", "fuente": "space_leases", "finalidad": "asesoria", "endpoints": ["adopcion"], "tratamiento": "exacto" }
  ],
  "valores": [
    { "periodo": "2025-10", "sin_dato": true, "origen": null, "capturado_en": null, "sedes_con_plano": null, "espacios_comercializables": null, "ocupadas": null, "ocupacion_pct": null, "contratos_activos": null, "canon_total": null, "canon_promedio_mensual": null, "usuarios_con_cuenta": null, "top_proveedores": [] },
    { "periodo": "2025-11", "sin_dato": true, "...": "(9 meses sin_dato más, misma forma, hasta 2026-08)" },
    {
      "periodo": "2026-09",
      "sin_dato": false,
      "origen": "vista",
      "capturado_en": "2026-09-05",
      "sedes_con_plano": 1,
      "espacios_comercializables": 1,
      "ocupadas": 0,
      "ocupacion_pct": 0.0,
      "contratos_activos": 1,
      "canon_total": 1500000.0,
      "canon_promedio_mensual": 1500000.0,
      "usuarios_con_cuenta": 1,
      "top_proveedores": [
        { "nombre": "Alpina Distribuciones ([correo oculto])", "contratos": 1 }
      ]
    }
  ],
  "spread_actual": {
    "periodo": "2026-09",
    "tarifa_configurada": false,
    "spread_pct": null,
    "contratos_sin_tarifa": 1
  },
  "accesos": {
    "total": 2,
    "lineas": [
      { "fecha": "2026-09-05", "operador": "op@recabra.co", "accion": "reporte", "periodo": "demosuper:2025-10..2026-09" },
      { "fecha": "2026-09-05", "operador": "op@recabra.co", "accion": "metricas", "periodo": "2026-09" }
    ]
  },
  "derechos": {
    "export": "GET /api/clientes/mi-export",
    "supresion": "POST /api/clientes/solicitar-supresion",
    "reporte": "GET /api/clientes/mi-reporte-plataforma",
    "contacto": "Correo de protección de datos de la política, §8"
  }
}
```

(Los 12 `valores` reales — 11 meses `sin_dato` + septiembre con datos — y las
17 entradas del `catalogo` que existían al generar este JSON están arriba tal
cual salieron; la iteración 2 agregó 5 entradas más — `ocupadas`,
`contratos_activos`, `canon_total`, `origen`, `capturado_en` — así que un
reporte generado HOY trae 22 entradas en `catalogo`, no 17: ver la sección
"AJUSTE ITERACIÓN 2" arriba para el detalle de esas 5. El bloque
de meses `sin_dato` intermedios se resumió con `"..."` sólo en este documento
por espacio, no en la respuesta real.) JSON completo sin resumir, generado en
esta misma sesión, disponible en `/tmp/pt-backend-reporte-demo/ejemplo.json`
si hace falta re-verificar.

Nótese `ocupadas: 0` con `contratos_activos: 1`: es un artefacto de CÓMO se
sembró el demo (el espacio se creó con `find-or-create` sin que su código
completo calzara con el código del fixture del plano), no un bug del reporte
— el reporte lee exactamente lo que `snapshot_metricas` tiene guardado, sea
lo que sea.

## Tests (19 nuevos: los 18 originales + 1 de la iteración 2) + salida de pytest

`tests/test_plataforma_reporte.py`:

1. `test_owner_200_con_las_claves_exactas_del_shape` — set-equality del nivel
   1, `politica`, `ventana`, `accesos`, `derechos`, cada `valores[i]` y cada
   `catalogo[i]`; confirma `politica.version_aceptada`/`aceptada_en` con el
   consentimiento real del alta.
2. `test_401_sin_token`
3. `test_403_worker_admin_legado_y_membresia_no_owner` — worker legado, admin
   legado, membresía `admin` no-owner, membresía `worker`.
4. `test_operador_sin_membresias_no_ve_el_endpoint_del_dueno` — el token de
   la consola (`cliente=="plataforma"`) da 401/403 en la ruta del dueño (no
   resuelve fuera de `/api/plataforma`, mismo patrón que M-9 en
   `test_metricas_ataques.py`).
5. `test_owner_de_un_cliente_no_ve_nada_del_otro` — B nunca ve slug, nombre
   ni proveedor de A.
6. `test_meses_invalidos_da_422_en_los_dos_endpoints` — `0`, `25`, `"abc"`.
7. `test_operador_200_mismo_json_y_el_dueno_ve_el_acceso_despues` — mismas
   claves en los dos endpoints; la línea `accion="reporte"` con el correo
   del operador y `periodo="<slug>:<desde>..<hasta>"` aparece en el reporte
   del dueño después, y `accesos.total` sube en 1 (y NO vuelve a subir
   cuando el dueño simplemente vuelve a leer su propio reporte).
8. `test_operador_404_con_slug_inexistente` — texto fijo.
9. `test_operador_requiere_ser_operador`.
10. `test_valores_mes_a_mes_contra_snapshot_incluido_sin_dato` — snapshot
    sembrado a mano (mes viejo con datos + saneo de proveedor con correo, mes
    medio `sin_dato`, mes actual con datos), MÁS filas contaminantes en
    `__consolidado__` y en otro cliente para el mismo período — ninguna se
    filtra.
11. `test_fechas_sin_hora_en_todo_el_reporte` — regex `YYYY-MM-DD` en
    `aceptada_en` y en cada `accesos.lineas[].fecha`.
12. `test_ninguna_clave_prohibida_en_ningun_nivel` — recorre TODO el JSON
    buscando `monthly_rent`, `tarifa`, `rates`, `by_sede`, `default`,
    `email`, `usuario_id`, `space_id`, `notes`, `notas`, `foto`.
13. `test_freno_compartido_con_mi_export_429_en_el_cuarto` — 2×`/mi-export` +
    1×`/mi-reporte-plataforma` = 200,200,200; el 4º (reporte) = 429; otro
    owner no lo hereda.
14. `test_owner_de_cliente_suspendido_obtiene_200` — y el resto del negocio
    sigue en 402 (exención quirúrgica).
15. `test_ruta_del_dueno_esta_exenta_de_habeas_data` — `_EXENTOS_POR_HABEAS_DATA`.
16. `test_ruta_del_operador_declarada_despues_de_las_literales` — con
    `conftest.rutas_planas`, contra `/metricas`, `/tendencia`, `/adopcion`,
    `/supresiones`, `/soy`, `/clientes`.
17. `test_catalogo_cubre_cada_clave_publicada_por_metricas_y_adopcion` —
    llama a `/api/plataforma/metricas` y `/api/plataforma/adopcion` de
    verdad, junta las claves reales de cada fila de `clientes` (menos
    `slug`/`nombre`/`error`) y afirma que están todas en `CATALOGO`.
18. `test_el_reporte_no_escribe_nada_en_la_base_del_cliente` — mismo patrón
    que `test_las_metricas_no_escriben_en_la_base_del_cliente`.
19. **[iteración 2]** `test_meses_invalido_no_consume_el_freno_del_dueno` —
    3×`meses=0` → 422 cada uno sin gastar cupo del freno compartido; el 4.º
    pedido (meses por defecto) → 200. Prueba directa de C-2.

Salida de la corrida exigida por la regla de verificación (iteración 2, con
los dos arreglos ya aplicados):

```
$ cd backend && TMPDIR=/tmp/pt-backend-reporte \
  python -m pytest tests/test_plataforma_reporte.py tests/test_derechos.py \
  tests/test_plataforma.py tests/test_estado_cuenta.py
................................................................          [100%]
64 passed, 249 warnings in 46.19s

$ python -c "import app.main"
(sin salida -- import limpio)
```

(19 del archivo nuevo + 45 de los tres archivos existentes de mi territorio
de verificación, los tres sin tocar y en verde.)

Control adicional (lectura, sin editar `test_transparencia_ataques.py` —
territorio del auditor):

```
$ python -m pytest -v tests/test_transparencia_ataques.py -k "t36 or t62"
[XPASS(strict)] HALLAZGO (mayor). `routers/derechos.py:318` cobra el freno de
3/hora ANTES de validar `meses`: ...
FAILED tests/test_transparencia_ataques.py::test_t36_un_meses_invalido_no_consume_el_freno_del_dueno
[XPASS(strict)] HALLAZGO (menor). `app/plataforma_reporte.py:_valor_de_fila`
publica en `valores[]` tres cifras de negocio del cliente -- `canon_total`,
`contratos_activos` y `ocupadas` -- que NINGUNA entrada de `CATALOGO`
declara: ...
FAILED tests/test_transparencia_ataques.py::test_t62_cada_cifra_de_valores_tiene_su_entrada_en_el_catalogo
```

Ambos aparecen como `FAILED` porque `pytest` marca un `xfail(strict=True)`
que en realidad pasó como fallo de la corrida (es la señal correcta:
**XPASS(strict)** en las dos, visible en `-v`) — exactamente la prueba
pedida por la regla de verificación de que los dos arreglos entraron. El
auditor quita los `xfail` de esos dos tests en su propio paso.

## Decisiones

- **Freno compartido con `/mi-export`** (tabla `export_attempts`, sin columna
  nueva para distinguir el endpoint): documentado en el docstring de
  `mi_reporte_plataforma`. Es la misma superficie de abuso (un owner pidiendo
  sus propios datos completos a repetición) y la spec es explícita en que
  sin migraciones no hay dónde guardar un contador aparte.
- **`spread_actual` abre UNA sola base, sólo del mes en curso y sólo de este
  cliente** (`_metricas_de_un_cliente`, nunca `metricas_del_periodo` ni
  `calcular`, que recorren todas las bases). Cualquier excepción (base rota,
  tarifa ilegible) se traga entera y `spread_actual` sale `null` — nunca un
  dict parcial ni el mensaje del driver.
- **La validación de `meses` va antes del freno** (iteración 2, C-2): un
  `meses` fuera de rango se responde 422 sin llamar a
  `_chequear_y_anotar_freno_export` — de lo contrario tres pedidos
  inválidos (que igual iban a fallar) agotaban el cupo de 3/hora
  compartido con `/mi-export` y dejaban al titular sin poder ejercer su
  derecho de acceso durante una hora. El `except MesesInvalidos` que
  envuelve `armar_reporte` queda como red de seguridad (por ejemplo, si en
  el futuro `armar_reporte` gana otra fuente de invalidez sobre `meses`
  que el chequeo del router no anticipe).
- **`aceptación por owners`**: se busca la más reciente aceptación de
  `VERSION_POLITICA` entre TODOS los usuarios con membresía `owner` ACTIVA
  del cliente (join en memoria `membresias` → `consentimientos`), no sólo el
  fundador — si el owner original se va y otro owner acepta después, el
  reporte tiene que reflejar esa aceptación.
- **`top_proveedores` del reporte usa `{"nombre","contratos"}`** (no
  `{"nombre","contratos_activos"}` como `_top` original) porque el shape
  VINCULANTE de la spec pide esa clave — se reusa `_top` entero (orden, tope
  de 5, saneo) y sólo se renombra la clave de conteo al armar el objeto de
  salida (`_top_reporte`), cero fórmula reescrita.
- **`ocupadas`, `contratos_activos` y `canon_total` SÍ salen crudos** en
  `valores` (a diferencia de `/tendencia`, que nunca los publica): es la
  auditoría del propio cliente sobre sus datos, no lo que ve el operador de
  otro cliente — no hay nada que la celda chica proteja acá. Desde la
  iteración 2 las tres (más `origen` y `capturado_en`) tienen su propia
  entrada en `CATALOGO` (ver abajo) — antes salían sin declarar.
- **`CATALOGO` es estático y taxativo: 22 claves** (17 originales + 5 de la
  iteración 2). De las 17: 12 de `/metricas` —incluye `estado_cuenta`—
  compartidas con `/tendencia` salvo
  `ultimo_acceso`/`spread_pct`/`tarifa_configurada`/`contratos_sin_tarifa`,
  que `/tendencia` no persiste; 5 sólo de `/adopcion`. Las 5 nuevas
  (`ocupadas`, `contratos_activos`, `canon_total`, `origen`, `capturado_en`)
  son cifras que sólo salen en `valores[]` de ESTE reporte, bajo ese nombre
  exacto — ningún otro endpoint las publica así, por eso su `endpoints` es
  `["reporte"]` en las 5 (nunca `"metricas"`/`"tendencia"`/`"adopcion"`,
  para no chocar con el recíproco que afirma `test_t61` del auditor: toda
  entrada que declare uno de esos tres endpoints tiene que aparecer ahí con
  ese nombre exacto). El test 17 (`test_catalogo_cubre_...`) sigue viendo
  sólo la inclusión de `/metricas` y `/adopcion` en `CATALOGO`, así que
  sigue verde sin cambios con las 5 agregadas.

## Pendientes / para otros agentes

- **`backend-supresion`** (Parte A, en paralelo): confirmar que al terminar
  de quitar K=3, `plataforma_metricas.py`/`plataforma_tendencia.py` siguen
  exportando `_metricas_de_un_cliente`, `_top`, `_pct`, `_plata`,
  `sanear_nombre_proveedor`, `periodo_actual`, `rango_del_periodo`,
  `ultimos_periodos`, `CONSOLIDADO_SLUG`, `MESES_DEFAULT`, `MESES_MAXIMO`,
  `MesesInvalidos`, `ClienteDesconocido` con la MISMA firma — se verificó en
  esta sesión que a la fecha de este entregable esos nombres y firmas siguen
  intactos (se re-corrió toda la suite de este territorio después del
  cambio en paralelo y sigue en verde).
- **`ESTADO.md`**: falta documentar el reporte de transparencia y los dos
  endpoints nuevos (lo escribe `backend-supresion` según el reparto de
  territorio).
- **Frontend**: falta consumir `GET /api/clientes/mi-reporte-plataforma` y
  `GET /api/plataforma/clientes/{slug}/reporte` (mismo JSON, shape arriba) en
  la vista imprimible `/reporte-plataforma` y en la fila de cliente de
  `/plataforma` — fuera de mi territorio.
- **VERSION_POLITICA**: este módulo importa siempre la constante desde
  `app.models.consentimiento` (nunca el literal `"2026-09-v1"`), así que
  cuando otro agente la suba a `"2026-09-v2"` el reporte y sus tests siguen
  funcionando sin tocar este archivo.
- **Límite conocido, aceptado**: no hay un test que ejercite `valores[i]`
  con una fila REAL de `snapshot_metricas` que tenga `contratos_activos == 0`
  (sólo se probó el camino `sin_dato` para "sin contratos"); el código
  (`_valor_de_fila`) ya maneja ese caso (`canon_promedio_mensual: null` con
  `contratos: 0`, igual que `/tendencia`), pero no quedó un test dedicado —
  cobertura menor, no bloqueante.
