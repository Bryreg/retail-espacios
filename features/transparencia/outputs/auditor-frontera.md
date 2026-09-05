# Red team — frontera del reporte y restos de K=3 (Fase 7, Transparencia)

**Auditor adversarial.** Territorio: `backend/tests/test_transparencia_ataques.py`
(NUEVO, 1.500 líneas) y este informe. Todo lo demás se leyó, nada se tocó.
Ningún commit, ningún push.

Precedente y disciplina: `features/auditoria/outputs/frontera.md` +
`backend/tests/test_auditoria_frontera.py`. **Acá no se arregla código de
producción**: un defecto se fija con un test que lo demuestra —`xfail(strict=
True)` afirmando el comportamiento SEGURO que hoy no se cumple— y se cuenta acá
con archivo:línea, reproducción y severidad. Ninguna aserción se borró para
dejar la suite verde.

**Estado del árbol cuando se auditó:** los tres builders y el agente de política
ya habían entregado. `backend/app/plataforma_reporte.py` (515 líneas),
`GET /api/clientes/mi-reporte-plataforma` (`routers/derechos.py:292`),
`GET /api/plataforma/clientes/{slug}/reporte` (`routers/plataforma.py:446`),
`VERSION_POLITICA = "2026-09-v2"` y §5.3 reescrita existían todos. **Todo lo de
abajo está VERIFICADO CORRIENDO**; no quedó ningún ataque en estado "no
verificable porque el archivo no existía aún".

**ITERACIÓN 2 (2026-09-05, esta actualización).** Los dos hallazgos que la
ronda 1 había dejado clavados como `xfail(strict=True)` —**H-1** (mayor) y
**H-2** (menor)— **están RESUELTOS** por `backend-reporte` en su propio
territorio (`routers/derechos.py` y `app/plataforma_reporte.py::CATALOGO`;
ver su entregable). Acá se hizo lo único que corresponde al auditor: **sacar
los dos decoradores `xfail`, conservando las aserciones intactas** —las dos ya
afirmaban el comportamiento SEGURO—, dejar la arqueología del hallazgo en un
comentario sobre cada test, y **endurecer** `test_t62` (ver E-1 más abajo). La
suite de ataque pasa a **82 passed, 0 xfailed**. No se tocó nada de `app/` ni
ningún test de otro agente.

---

## Veredicto de frontera

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| **¿El reporte del dueño puede ver algo de otro cliente?** | **NO.** Ni un número, ni un slug, ni un nombre, ni un proveedor, ni una línea de bitácora ajena. El slug sale del token firmado (`cliente_del_pedido`), nunca de un parámetro, cabecera o cookie; `valores` filtra por `SnapshotMetricas.cliente_slug == slug` y jamás toma `__consolidado__`; `accesos` sólo deja pasar `metricas\|adopcion\|clientes`, `tendencia`/`reporte` con prefijo `<slug>:` (y `__consolidado__:` para tendencia) y `supresiones` sólo si el cliente pidió. | t01–t09, t52, t64 |
| **¿El operador puede obtener una FILA de contrato?** | **NO.** Cero claves de fila en cualquier nivel (`monthly_rent`, `space_id`, `supplier_id`, `notes`, `marca`…), los únicos arreglos son los cinco del contrato, ninguna nota/marca/ficha de proveedor aparece, ninguna arroba fuera de `accesos.lineas[].operador`, ningún correo de usuario final. | t20–t28, t24, t25 |
| **¿El operador puede obtener la TARIFA de referencia?** | **No directamente** (ni su valor, ni Σ tarifa, ni ninguna clave `tarifa/rates/by_sede/default`), **pero sí la despeja del spread con ~0,03 % de error** cuando el cliente tiene sus contratos con tarifa del mismo tipo y `contratos_sin_tarifa == 0`. **Es un riesgo YA ACEPTADO y documentado** en `docs/ESTADO.md:462-469` como consecuencia consciente de quitar K=3, no un hallazgo nuevo de esta fase. Medido, no opinado. | t23 (no sale), t58 (se despeja) |
| **¿Quedó algún resto de K=3?** | **NO.** `grep -rnE "K_MINIMO\|_suprimir_celda_chica\|Suprimido\|suprimido por privacidad" backend/app frontend/src` → vacío (fuera de `*/legal/`, donde la política cuenta la historia del trato, que es correcto). Y el comportamiento nuevo está verificado al peso: 1 contrato de 4.173.919 sale exacto en `/metricas`, `/tendencia` y el reporte; consolidado = Σ de todos los legibles; `null` sólo por ausencia de dato. | t40–t46 |

**Hallazgos abiertos al cierre de la iteración 2: NINGUNO.** H-1 (mayor) y H-2 (menor) están arreglados y verificados corriendo; quedan cinco puntos ACEPTADOS (A1-A5), que son caracterizaciones, no defectos.

---

## Salida de pytest

**Corrida final (iteración 2), EN SERIE, salida exacta:**

```
cd /tmp/retail-espacios-test/backend
mkdir -p /tmp/pt-auditor-frontera
TMPDIR=/tmp/pt-auditor-frontera python -m pytest tests/test_transparencia_ataques.py

........................................................................ [ 87%]
..........                                                               [100%]
[warnings summary: 365 warnings, todas de terceros -- StarletteDeprecationWarning
 del TestClient e InsecureKeyLengthWarning de PyJWT por la clave de test]

82 passed, 365 warnings in 76.41s (0:01:16)
```

Ni un `xfail`, ni un `xpass`, ni un `skip`: **82 passed, 0 xfailed**.

> **Gotcha de invocación** (vale para el Verificador): `backend/pytest.ini`
> ya trae `addopts = -q`, así que el `-q` del comando canónico lo convierte en
> `-qq` y pytest **oculta la línea final de conteo** (por eso arriba se corre
> sin el `-q` extra). Con `-q` explícito la salida termina en el bloque de
> warnings y el conteo no se ve, aunque el exit code sea 0.

Y con el `-q` del comando de la regla de verificación, para que conste que es
el mismo resultado (`echo $?` → `0`):

```
TMPDIR=/tmp/pt-auditor-frontera python -m pytest -q tests/test_transparencia_ataques.py
........................................................................ [ 87%]
..........                                                               [100%]
exit=0
```

Y los tres tests tocados, aislados:

```
TMPDIR=/tmp/pt-auditor-frontera python -m pytest tests/test_transparencia_ataques.py -k "t36 or t61 or t62" -v
3 passed, 79 deselected, 29 warnings in 3.37s
```

`python -c "import app.main"` → limpio (sin salida, exit 0).

Contraste con el archivo del builder (leído, **no editado**; 18 → 19 tests,
el que sumó por C-2):

```
TMPDIR=/tmp/pt-auditor-frontera-b python -m pytest tests/test_plataforma_reporte.py
19 passed, 87 warnings in 13.90s
```

> **Nota de método.** Dos corridas concurrentes de pytest sobre el MISMO
> `TMPDIR` se pisan: `conftest.py` crea la base del registro con
> `tempfile.mkstemp()` (nombre único) pero las bases de cliente son hermanas con
> nombre FIJO `recabra_<slug>.db`. Un primer intento en paralelo dio 22 fallos
> fantasma (`UNIQUE constraint failed: layout_snapshots.sede`). Todas las cifras
> de arriba son de corridas EN SERIE, con el directorio limpio. Vale la pena
> anotarlo para el Verificador: **la suite completa no se puede paralelizar por
> archivo sin un TMPDIR por worker**.

---

## Tabla de ataques

`pasa` = la frontera aguantó · `caracterización` = comportamiento real
documentado a propósito (no es un defecto, es un guardián para que no empeore en
silencio). **Tras la iteración 2 no queda ningún `xfail`:** los dos que había
(t36, t62) pasaron a `pasa` porque el defecto se arregló en el territorio del
builder, con la aserción original intacta. Ningún ataque quedó en «no
verificable aún».

### 1 · Cross-tenant — el reporte del dueño de A contra B

| id | vector | resultado |
|---|---|---|
| t01 | Barrido de TODAS las hojas del JSON de A contra los sentinelas únicos de B (slug, nombre, proveedor `ZetaUnicaBetaSAS`, correo del dueño, canon 8.654.321 y la suma A+B) | pasa |
| t02 | `valores` sale sólo de `snapshot_metricas` del propio slug — contrastado contra lo que la TABLA tiene de verdad, incluida la fila `__consolidado__` | pasa |
| t03 | `?slug=beta`, `?cliente=beta`, `?cliente_slug=beta` sobre el endpoint del dueño | pasa (ignorados; el slug sale del token firmado) |
| t04 | `X-Cliente`, `X-Client`, `X-Tenant`, `X-Cliente-Slug`, `Host: beta.…`, `Cookie: cliente=beta` | pasa |
| t05 | Rutas paramétricas hermanas inventadas (`/mi-reporte-plataforma/beta`, `/beta/mi-reporte-plataforma`, `/clientes/beta/reporte`) con token de A, comparando la respuesta para un slug que EXISTE contra uno que no | pasa (mismo estado y mismo texto: no es oráculo) |
| t06 | El operador pide A y pide B: ninguno trae nada del otro, ni la tarifa de A en el de B | pasa |
| t07 | Los dos endpoints devuelven el MISMO cuerpo (salvo `generado_en` y `accesos`) | pasa |
| t08 | Bitácora ajena: `tendencia` y `reporte` con `periodo="beta:…"` NO aparecen en el reporte de A; `__consolidado__:` sí; el slug `beta` no aparece en ninguna hoja | pasa |
| t09 | `supresiones` aparece SOLO si A tiene solicitud; B, que no pidió nada, sigue sin verla | pasa |
| t52 | Un slug que es PREFIJO de otro (`alfa` / `alfados`): los accesos no se cruzan en ninguna de las dos direcciones | pasa |
| t64 | El reporte del dueño como censo: ni `clientes_total`, ni `clientes_incluidos`, ni `clientes_con_tarifa`, ni `consolidado`, ni el número A+B | pasa |

### 2 · Roles

| id | vector | resultado |
|---|---|---|
| t10 | Sin token, los dos endpoints | pasa (401) |
| t11 | Admin legado y worker legado (clave compartida, JWT sin `sub`), los dos endpoints | pasa (403) |
| t12 | Membresía `admin` (gerente invitado) y `worker` sobre el endpoint del dueño — el JWT dice `rol: admin` para los dos, así que sólo la membresía puede decidir | pasa (403, y sin filtrar nada en el cuerpo del error) |
| t13 | Token de la consola (operador SIN membresías) contra el endpoint del dueño; el mismo token contra el suyo | pasa (401, ver «Aceptados» #A1; 200 en el del operador) |
| t14 | Owner NO operador contra `/plataforma/clientes/{slug}/reporte`, pidiendo su PROPIO cliente y el ajeno | pasa (403 idéntico en los dos: indistinguible) |
| t15 | 403 del no-operador para un slug que existe vs uno que no | pasa (mismo estado, mismo texto) |
| t16 | Un operador al que le sacan el correo de `OPERADOR_EMAILS` con el token ya emitido | pasa (401, ver «Aceptados» #A1) |

### 3 · Bitácora

| id | vector | resultado |
|---|---|---|
| t17 | El reporte del operador deja EXACTAMENTE UNA línea `accion="reporte"` con `periodo="<slug>:<desde>..<hasta>"` | pasa |
| t18 | El `periodo` de la bitácora no lleva ningún dato de negocio (regex estricta, sin `@`, sin nombre de cliente, sin cifras) | pasa |
| t19 | El reporte del DUEÑO no anota ninguna línea; el acceso del operador aparece después en el reporte del dueño con el correo del operador y fecha sin hora; mirarse a sí mismo no infla el conteo | pasa |
| t53 | Slug veneno en el path del operador (`../../etc/passwd`, `..%2F..%2Fetc`, `alfa:2020-01..2020-02`, `alfa%00`, `alfa'--`, 300 caracteres, `__consolidado__`, y `ALFA`/`alfa ` que sí normalizan): 404 con texto fijo (o el 404 genérico de Starlette cuando ni matchea), sin línea de bitácora y sin envenenar el `periodo` que después se le muestra al titular | pasa |
| t56 | POST/PUT/PATCH/DELETE sobre los dos endpoints: 404/405 y sin línea de bitácora por un acceso que no ocurrió | pasa |
| t59 | La ventana de `accesos` sigue a `meses` (una línea de hace 200 días aparece con `meses=12` y no con `meses=1`) | pasa |

### 4 · Claves prohibidas, PII y tarifa

| id | vector | resultado |
|---|---|---|
| t20 | `monthly_rent`, `tarifa`, `tarifa_total`, `canon_con_tarifa`, `rates`, `by_sede`, `default`, `usuario_id`, `space_id`, `supplier_id`, `lease_id`, `notes`, `ip`, `hash`, `firebase_uid`, `marca`, `svg_id`, `fixtures_json`, `proveedores_json`, `motivo`, `cambiado_por` — en CUALQUIER nivel, en los dos endpoints | pasa |
| t21 | Clave `email`/`correo` en cualquier nivel | pasa |
| t22 | Ningún string con `@` fuera de `accesos.lineas[].operador`, y ese valor es el correo del OPERADOR; ningún correo de usuario final ni de proveedor en el texto plano | pasa |
| t23 | Ningún número igual a la tarifa sembrada (3.141.593), ni la cadena en el JSON serializado | pasa |
| t24 | Nota del proveedor, del espacio y del contrato, marca del contrato, contacto y teléfono de la ficha | pasa |
| t25 | Proveedor con correo Y teléfono adentro del nombre: sale con las dos máscaras en `valores[].top_proveedores` y el crudo no aparece en ninguna otra hoja | pasa |
| t26 | `aceptada_en`, `capturado_en` y `accesos.lineas[].fecha` con `^\d{4}-\d{2}-\d{2}$` (sin hora); `generado_en` sí lleva hora, que es correcto (es el sello del documento) | pasa |
| t27 | Shape EXACTO, clave por clave, en los nueve objetos del contrato | pasa |
| t28 | Los únicos arreglos son `$.catalogo`, `$.valores`, `$.valores[].top_proveedores`, `$.accesos.lineas` y `$.catalogo[].endpoints` | pasa |
| t54 | `proveedores_json` ilegible (una LISTA con un correo adentro): no tumba el reporte, `top_proveedores == []` y el crudo no sale | pasa |
| t55 | Fila histórica con el nombre CRUDO persistido (frontera-2 aplicado al reporte): se sanea AL LEER | pasa |
| t63 | El catálogo declara `ultimo_acceso` como `sin_hora`: `/metricas` efectivamente lo publica sin hora (el reporte no certifica algo falso) | pasa |

### 5 · Sólo lectura y aislamiento de bases

| id | vector | resultado |
|---|---|---|
| t29 | Conteo de `spaces`/`leases`/`suppliers`/`layouts`/`audit_log` de la base de A antes y después de tres reportes (dueño, operador, `meses=24`) | pasa (idéntico) |
| t30 | `spread_actual` de A con la base de un tercero rota **y la de B rota**: A sigue 200 con `spread_actual` NO nulo (prueba de que usa `_metricas_de_un_cliente` y no `metricas_del_periodo`) | pasa |
| t31 | Reporte de un cliente cuya base está rota: 200 con `spread_actual: null` y sin una palabra del driver (`sqlite`, `OperationalError`, `.db`, `/tmp`, traceback) | pasa |

### 6 · Freno, validación e interruptor de cobranza

| id | vector | resultado |
|---|---|---|
| t32 | El 4.º pedido de la hora MEZCLANDO `/mi-export` y el reporte → 429 (el freno es compartido, no 6 descargas disfrazadas de 3) | pasa |
| t33 | El endpoint del operador NO comparte ese freno (5 pedidos → 5 × 200 y 5 líneas de bitácora) | caracterización |
| t34 | `meses` = `0`, `25`, `-1`, `abc`, `1e3`, `""`, `12.5`, `٣` (dígito árabe-índico) → 422 en los DOS endpoints y sin línea de bitácora | pasa |
| t35 | `meses` = 1, 12, 24 manda la ventana y la cantidad de filas | pasa |
| t36 | Tres pedidos INVÁLIDOS por abajo (`meses=0`) → 422 y **no** consumen cupo; el siguiente legítimo → 200. Ídem tres por arriba (`meses=25`) → 422 y el que sigue → 200 | **pasa** (era H-1, **resuelto**) |
| t37 | Owner de un cliente `suspendido`: `/api/spaces/map` da 402 pero el reporte da 200, y `/api/clientes/mi-reporte-plataforma` figura en `_EXENTOS_POR_HABEAS_DATA` | pasa |
| t38 | `/api/clientes/mi-reporte-plataformaX` y `…-privado` NO heredan la exención (frontera de segmento, hallazgo H-3 revisitado) | pasa |
| t39 | Orden de rutas por `rutas_planas(app)`: la paramétrica del operador está DESPUÉS de las seis literales de su router; la del dueño no tiene ningún segmento variable | pasa |
| t57 | El panel del operador no se corta por el estado de cuenta: reporte del operador sobre un cliente suspendido → 200 | pasa |
| t60 | La ventana de `valores` es consecutiva, sin repetidos, y termina en el mes en curso, para `meses` 1/6/24 | pasa |

### 7 · Restos de K=3

| id | vector | resultado |
|---|---|---|
| t40 | `grep -rnE "K_MINIMO\|_suprimir_celda_chica\|Suprimido\|suprimido por privacidad" backend/app frontend/src` (excluyendo `*/legal/`) | pasa (vacío) |
| t41 | 1 contrato de **4.173.919**: `/metricas` publica ingreso 4.173.919, canon promedio 4.173.919, el proveedor (saneado) con `contratos_activos: 1`, y `spread_pct` numérico exacto | pasa |
| t42 | Consolidado = Σ EXACTA de los legibles: ingreso `A+B`, canon ponderado Σ/Σ, `spread_pct` Σ/Σ, `clientes_con_tarifa` | pasa |
| t43 | Cliente con 0 contratos (`galerias`): ingreso `0.0` (float real), canon `null`, top `[]`, `spread_pct` `null`, `contratos_sin_tarifa` 0 | pasa |
| t44 | `/tendencia` del cliente publica el mes en curso exacto y ningún agregado de negocio en `null` | pasa |
| t45 | `/tendencia` consolidada suma a todos (ingreso `A+B`, canon ponderado) | pasa |
| t46 | El REPORTE tampoco suprime la celda chica del propio titular (su único contrato sale entero) y la palabra «suprimido» no aparece | pasa |
| t58 | Despeje de la tarifa desde `ingreso` + `spread_pct` con 1 contrato: error relativo medido `< 1 %` (hoy ~0,03 %) y `> 0` | caracterización (riesgo ACEPTADO, ver A2) |
| t61 | El catálogo declara TODO lo que `/metricas` y `/adopcion` publican de verdad, y nada que no publiquen (catálogo ni corto ni inflado) | pasa |
| t62 | Cada cifra de `valores[]` tiene su entrada en el catálogo — con `metadatos` estrechado a `{"periodo", "sin_dato"}`, así que `origen` y `capturado_en` también tienen que estar declaradas | **pasa** (era H-2, **resuelto**) |

### 8 · Política y consentimiento

| id | vector | resultado |
|---|---|---|
| t47 | §5.3 contiene «agregados exactos», «sin umbral», «reporte de transparencia», «mi-reporte-plataforma» y «bitácora» | pasa |
| t48 | `docs/legal/politica-datos.md` y `frontend/src/legal/politica-datos.md` byte-idénticas | pasa |
| t49 | `VERSION_POLITICA == "2026-09-v2"` y la cabecera de la política la contiene | pasa |
| t50 | Un usuario con fila SÓLO para `2026-09-v1` recibe `pedir_consentimiento: true` al entrar, y su reporte dice `version_aceptada: null` / `aceptada_en: null` con `version_vigente: "2026-09-v2"` | pasa |
| t51 | El login legado (clave compartida) sigue entrando sin pedir consentimiento tras subir la versión | pasa |

---

## Hallazgos

Los dos hallazgos de la ronda 1 están **RESUELTOS** en la iteración 2. Se
conserva abajo la descripción completa —el hallazgo, la reproducción y el
porqué— porque es la arqueología de por qué el código quedó como quedó, con el
arreglo verificado al final de cada uno.

### H-1 — El freno de habeas data se cobraba ANTES de validar `meses` · **mayor** · ✅ RESUELTO

**Dónde.** `backend/app/routers/derechos.py:318` (dentro de
`mi_reporte_plataforma`, `derechos.py:292-329`), contra
`_chequear_y_anotar_freno_export` (`derechos.py:104-127`).

```python
cliente, usuario_id, _email = dueno
_chequear_y_anotar_freno_export(usuario_id)   # ← cobra el cupo acá

try:
    return armar_reporte(cliente.slug, meses)
except MesesInvalidos as e:
    raise HTTPException(status_code=422, detail=str(e)) from e   # ← valida acá
```

**Qué pasa.** `meses` es un `int` válido para FastAPI (así que la dependencia
corre y el cupo se cobra) pero inválido para el negocio: `0`, `25`, `-1`. Tres
pedidos que terminan en **422** dejan al titular con el cupo agotado, y como el
cupo es **compartido con `/mi-export`** (decisión deliberada y correcta,
documentada en el docstring), el dueño queda una hora entera sin poder ejercer
**ni el acceso ni la portabilidad** de la Ley 1581 — sin haber recibido un solo
byte de datos.

**Reproducción** (`test_t36`):

```python
for _ in range(3):
    assert _reporte_dueno(client, cab_a, meses=0).status_code == 422
r = _reporte_dueno(client, cab_a)      # pedido legítimo
assert r.status_code == 200            # falla: es 429
```

**Por qué importa más de lo que parece.** No hace falta un atacante: alcanza un
frontend que mande `meses=0` cuando el selector arranca vacío, o un reintento
automático. Convierte un error de validación en un bloqueo temporal de un
derecho, que es exactamente lo que `_EXENTOS_POR_HABEAS_DATA` existe para
evitar (hallazgo m-3 de la verificación de Fase 3, mismo espíritu).

**ARREGLO VERIFICADO (iteración 2).** `backend-reporte` aplicó exactamente la
guarda sugerida en `routers/derechos.py::mi_reporte_plataforma`: el chequeo
`1 <= meses <= MESES_MAXIMO` con el mismo texto de `MesesInvalidos`
(`"Los meses van de 1 a {MESES_MAXIMO}."`) va **antes** de
`_chequear_y_anotar_freno_export(usuario_id)`, y el `except MesesInvalidos`
quedó como red de seguridad. Verificado leyendo el código y corriendo el vector
COMPLETO, ahora sin `xfail`:

- 3 × `meses=0` → 422, 422, 422 · el 4.º pedido con `meses` por defecto → **200**
- 3 × `meses=25` (fuera de rango por ARRIBA) → 422, 422, 422 · el siguiente
  legítimo → **200** (van 2 de 3 cupos consumidos, ninguno de los seis 422 sumó)

El `xfail(strict=True)` se sacó de `test_t36`; **las aserciones no se tocaron**
(ya afirmaban el comportamiento seguro) y se le sumó el tramo de `meses=25`. El
motivo del hallazgo quedó como comentario sobre el test
(`tests/test_transparencia_ataques.py`, encabezado de `test_t36`).

Nota: `/api/plataforma/clientes/{slug}/reporte` **no** tenía el problema — ahí
la bitácora se anota DESPUÉS de armar, que es el orden correcto (t34 lo
confirma: un `meses` inválido no deja línea).

---

### H-2 — Tres cifras del reporte no estaban en su propio catálogo · **menor** · ✅ RESUELTO

**Dónde.** `backend/app/plataforma_reporte.py:_valor_de_fila` (≈ líneas 262-285)
contra `CATALOGO` (`plataforma_reporte.py:89-235`).

**Qué pasa.** `valores[]` publica `canon_total`, `contratos_activos` y
`ocupadas` —tres cifras de negocio tomadas del cliente, guardadas en
`snapshot_metricas`— y **ninguna tiene entrada en `CATALOGO`**. El catálogo
declara `ingreso_contratado_mes`, `canon_promedio_mensual` y `ocupacion_pct`,
que son los derivados; los sumandos crudos salen sin definición, sin fuente y
sin finalidad.

La promesa central de la Fase 7 es «cada dato que la plataforma tomó de él, cómo
lo calculó, de dónde, para qué». Un número sin entrada de catálogo es
exactamente el hueco que el reporte existe para tapar. La política **sí** los
menciona en prosa (§5.3: «las cifras mensuales guardadas de las que salen
—contratos activos, caras ocupadas, canon total…»), así que la decisión de
mostrarlos es correcta; lo que falta es la contraparte legible por máquina.

**Reproducción** (`test_t62`):

```python
metadatos = {"periodo", "sin_dato", "origen", "capturado_en"}
declaradas = {i["clave"] for i in cuerpo["catalogo"]}
for valor in cuerpo["valores"]:
    assert not (set(valor) - metadatos - declaradas)
# AssertionError: cifras sin entrada en el catálogo:
#   ['canon_total', 'contratos_activos', 'ocupadas']
```

**ARREGLO VERIFICADO (iteración 2).** `backend-reporte` agregó al final de
`CATALOGO` **cinco** entradas nuevas (no tres): las tres del hallazgo
—`ocupadas`, `contratos_activos`, `canon_total`— más `origen` y `capturado_en`,
todas con las 7 claves de `CLAVES_CATALOGO_ITEM`, `endpoints: ["reporte"]` y un
`tratamiento` del vocabulario cerrado ya existente. `CATALOGO` pasa de 17 a 22
entradas; las 17 originales no se tocaron ni se reordenaron, así que el cambio
es puramente aditivo y no mueve ninguna frontera.

Se sacó el `xfail(strict=True)` de `test_t62` conservando la aserción, y —
**E-1, endurecimiento**— se estrechó el set `metadatos` de
`{"periodo", "sin_dato", "origen", "capturado_en"}` a **`{"periodo", "sin_dato"}`**:
sólo esas dos son estructura del reporte (el eje de la ventana y el marcador de
fila vacía); `origen` y `capturado_en` son datos sobre el dato del titular y
ahora tienen que estar **declaradas en el catálogo**, no tapadas por una lista
de excepciones del test. Con las 22 entradas nuevas el test pasa así de
estricto. Es un endurecimiento deliberado del ataque, no una concesión: la
próxima clave que alguien agregue a `valores[]` sin entrada de catálogo va a
romper este test.

**Chequeo de que el arreglo no rompió el recíproco.** `test_t61` afirma la
dirección contraria (nada declarado que no se publique de verdad) mirando sólo
`"metricas" in item["endpoints"]` y `"adopcion" in item["endpoints"]`; el valor
nuevo `"reporte"` no cae en ninguna de esas dos ramas, así que las 5 entradas
nuevas pasan sin tocar nada. **Verificado corriendo**: `t61` sigue verde. No
hay ninguna otra aserción en el archivo que enumere los valores permitidos de
`endpoints` (`grep -n "endpoints" tests/test_transparencia_ataques.py`: sólo
`t61`, la lista de arreglos permitidos de `t28` —`$.catalogo[].endpoints`— y
`t63`, que fija `endpoints == ["metricas"]` para `ultimo_acceso`, que no
cambió).

---

## Aceptados (comportamiento real, no defectos)

**A1 — El token de la consola devuelve 401, no 403, fuera de `/api/plataforma`.**
El contrato del Maestro pedía 403 para «operador sin membresías en el endpoint
del dueño» y para «operador al que le sacan el correo de `OPERADOR_EMAILS`». La
implementación da **401**: `_cliente_de_la_consola` (`app/clientes.py:453-486`)
sólo resuelve bajo `/api/plataforma` y en cualquier otro path contesta el mismo
401 que un token que nombra un cliente inexistente. Es igual de opaco —o más:
no confirma que el correo sea operador— y es una decisión explícita y
comentada. Los tests afirman `in (401, 403)` y, además, que el cuerpo no trae ni
el proveedor ni el canon. **Aceptado.**

**A2 — La tarifa de referencia se despeja del spread.** Con `contratos_sin_tarifa
== 0` y contratos del mismo tipo, `ingreso / (1 + spread_pct/100) / n` devuelve
la tarifa unitaria; medido en `test_t58` con 1 contrato: **3.140.646 contra
3.141.593 sembrados, 0,03 % de error**. El único obstáculo es el redondeo del
spread a un decimal. Esto **ya está documentado y aceptado** en
`docs/ESTADO.md:462-469` («Riesgo residual aceptado (documentado, no un bug),
vigente tras Fase 7 […] sin umbral el residual ya no tiene frontera — se acepta
para cualquier n, es la misma decisión de producto de Fase 7»). No se cuenta
como hallazgo nuevo: se deja **medido** para que un cambio futuro que publique
el spread con más decimales no lo empeore en silencio.

**A3 — El endpoint del operador no tiene freno de tasa.** 5 reportes seguidos →
5 × 200 y 5 líneas de bitácora (`test_t33`). Es coherente: la puerta del
operador se controla con la bitácora, no con un cupo. Caracterizado para que un
cambio se note.

**A4 — `test_f09` (frontera-5) eliminado.** Confirmado en
`tests/test_auditoria_frontera.py:28-32`: queda un comentario `f08`/`f09` en su
lugar explicando la resolución por decisión de producto. Es lo que la spec pedía
(«se explica en el entregable por qué ya no aplica»), no un test borrado porque
molestaba.

**A5 — La suite no se paraleliza por archivo con un TMPDIR compartido.** Ver la
nota de método arriba. No es un defecto del código de producción, pero el
Verificador lo va a chocar si corre archivos en paralelo.

---

## Lo que se leyó y no se tocó

`features/transparencia/spec.md` · `docs/ESTADO.md` (reglas duras, Fases 4-6,
«Auditoría integral» frontera-1..6) · `backend/app/plataforma_reporte.py` ·
`app/routers/derechos.py` · `app/routers/plataforma.py` · `app/clientes.py` ·
`app/plataforma_metricas.py` · `app/plataforma_tendencia.py` ·
`app/models/plataforma.py` · `app/models/consentimiento.py` ·
`docs/legal/politica-datos.md` + `frontend/src/legal/politica-datos.md` ·
`tests/conftest.py` · `tests/test_auditoria_frontera.py` ·
`tests/test_metricas_ataques.py` · `tests/test_plataforma_metricas.py` ·
`tests/test_plataforma_reporte.py`.

**Único archivo escrito:** `backend/tests/test_transparencia_ataques.py`
(64 funciones, 82 casos con las parametrizaciones).

**Diff de la iteración 2 sobre ese único archivo** (nada más se tocó, ni en
`app/`, ni en tests de otros agentes, ni en el frontend):

1. `test_t36`: se borró el decorador `@pytest.mark.xfail(strict=True, …)` y el
   motivo bajó a un comentario (`H-1 …, RESUELTO en routers/derechos.py`). Las
   aserciones quedaron tal cual y se agregó el tramo `meses=25` (fuera de rango
   por arriba) al mismo vector.
2. `test_t62`: mismo trato (`H-2 …, RESUELTO en plataforma_reporte.py::CATALOGO`)
   y **endurecimiento E-1**: `metadatos` pasó de
   `{"periodo", "sin_dato", "origen", "capturado_en"}` a `{"periodo", "sin_dato"}`.
3. `test_t61`: sin cambios; verificado que sigue verde con el valor nuevo
   `"reporte"` en `endpoints`.
