# ENTREGA — Auditoría integral de RECABRA (post Fase 6)

Rama `claude/auditoria-integral`, árbol `/tmp/retail-espacios-test`. Fecha: 2026-09-05.

Equipo: cinco auditores (ingresos, frontera, hardening, bugs, compliance), dos
builders (backend-hardening, backend-plataforma), un verificador. Seis
dimensiones de la spec (`features/auditoria/spec.md`), 24 hallazgos con
reproducción, 11 arreglados en esta rama, 1 abierto por decisión de producto,
el resto documentados con propuesta. Los entregables por agente están en este
mismo directorio.

## Veredicto en tres líneas

1. **La frontera multi-tenant y la verificación de identidad aguantaron todo.**
   Nadie cruzó de una base a otra, nadie forjó un token, nadie saltó
   `require_operador`. Eso es lo que más importa y está bien.
2. **Lo que se rompió fue de segundo orden y se arregló**: DoS trivial por
   uploads sin tope real (pre-auth incluido), un oráculo de estado de cuenta
   reabierto, PII de terceros en reposo en el registro, un consolidado que
   contradecía a sus sumandos, tablas que nunca se purgaban.
3. **No se puede mergear todavía.** Hay cuatro bloqueantes concretos (abajo,
   "Qué le queda al humano"): la suite está roja por un guardián de CSP que
   dispara sobre un comentario, nada está commiteado, un test viejo quedó
   afirmando algo falso en verde, y el gate de `deps-audit` va a fallar en CI
   en cuanto se mergee — porque ahora funciona.

---

## 1. Tabla de hallazgos

Estados: **arreglado** (código + test de regresión verde en esta rama),
**documentado** (confirmado con reproducción, sin arreglo en esta rama, con
propuesta), **abierto** (confirmado, arreglable, escalado como decisión de
producto), **sospecha** (sin reproducción; no es hallazgo).

Severidad = la del Maestro tras triage (la del auditor entre paréntesis cuando difiere).

| id | sev | dimensión | estado | qué era | reproducción | arreglo |
|---|---|---|---|---|---|---|
| hardening-1 / 1b | alta | 4 OWASP | **arreglado** | `await file.read()` bufferizaba el archivo entero en RAM antes de comparar contra `MAX_FILE_SIZE` / `MAX_PHOTO`. Con `--workers 1`, un archivo de GB mata el único proceso. | `test_auditoria_hardening.py::test_h1_files_*`, `test_h1b_mounts_*`: con tope 100 B y archivo de 2 MB, se leían 2 097 156 B antes del 413. | `app/services/subidas.py::leer_con_tope` (chunks de 64 KiB, corta apenas `acumulado > tope`). Ahora se leen 65 536 B. Códigos y textos intactos. |
| hardening-1 (ext.) | alta | 4 OWASP | **arreglado** | Mismo patrón en `catalogo.py` (5 MB, 413) y `planograms.py` (10 MB, 400), que el auditor no listó; lo vio el Maestro. | `test_h1d_catalogo_*`, `test_h1e_planograms_*`. | Mismo helper. `montaje.py` no se toca: delega en `mounts.registrar_montaje`. |
| hardening-1c | alta | 4 OWASP | **arreglado** | Ningún límite de tamaño de request en toda la app, alcanzable sin credencial: `POST /api/auth/login` con 5 MB de contraseña se parseaba entero. | `test_h1c_login_*` (5 MB → 401, no 413). | Middleware ASGI puro `LimiteDeCuerpo` (2 MiB JSON / 12 MiB multipart, tope por Content-Type; `Content-Length` sólo para rechazar, el conteo real sobre `receive` decide), registrado en `main.py`. 5 tests: 413 JSON pre-auth, login normal intacto y 413 con CSP, upload de 9 MB sigue en 201, 20 MB lo corta el middleware, `Content-Length` mentido no sirve. |
| bugs-1 | alta | 5 bugs recientes | **arreglado** | La reconstrucción "exacta" del consolidado (BUG-1 iter. 2) usaba los crudos de HOY para un cliente con fila ya congelada: acme congelada en 600 con un contrato cancelado después, beta llega tarde con 900 → consolidado 1 200 en vez de 1 500. `/tendencia` publicaba sumandos que no sumaban el total. | `test_auditoria_bugs.py::test_bugs_1_*`. | `_reconstruir_consolidado` unificada en `plataforma_tendencia.py`: un cliente con fila previa se suma SIEMPRE desde su fila en disco; sólo los slugs `recien_insertados` en esta captura salen de memoria. El test afirma `canon == 1500` y `acme + beta == consolidado`. |
| compliance-1 = frontera-2 | alta (media/alta) | 6 privacidad · 3 frontera | **arreglado** | `snapshot_metricas.proveedores_json` guardaba el nombre CRUDO del proveedor (correo/teléfono de un tercero de un cliente) en la base del registro = la base de GALERIAS, sin plazo. El saneo sólo vivía al leer. | `test_compliance1_*`, `test_f06_*`: `'{"Distribuciones Norte juan.perez...@correo-personal.example": 3}'` en disco. | `_recortar_top` ordena/recorta con el nombre original y baja el nombre SANEADO (sumando conteos si dos originales sanean igual). Único punto previo al `json.dumps`. Saneo idempotente; `publicar_fila` sigue pasando por `_top`. Sin migración. |
| frontera-5 | alta | 3 frontera | **ABIERTO — decisión de producto** | Cliente A publica (3 contratos), cliente B tiene UN contrato y K=3 lo suprime. `ingreso_consolidado − ingreso_A` devuelve al peso el canon del contrato único de B (4 173 919). Con N clientes alcanza con que N−1 publiquen. | `test_auditoria_frontera.py::test_f09_*`, `xfail(strict=True)`. Verificado por el Maestro. | Ninguno en esta rama. Contradice la regla escrita y test-enforced "el ingreso consolidado sí suma a todos" (ESTADO.md Fase 4/6, `test_m26`, `test_metricas_conciliacion.py:1338`, `test_plataforma_metricas.py:495/516`, `test_plataforma_tendencia.py:632/670`). Ver §4. |
| ingresos-1 | media | 2 multi-tenant | **arreglado** | Con UN cliente en la instalación (producción hoy), `Bearer basura` o `?token=basura` recibía 402 con el estado de cuenta (suspendido / solo_lectura en POST) antes del 401. Reabría el oráculo que R-1 cerró. | `test_ingresos_1_*`: `suspendido  anonimo=401  bearer-basura=402`. | `auth.token_verifica()`; `cliente_del_pedido` sólo aplica `_aplicar_estado` en la rama `unico()` si la credencial VERIFICA. `test_ingresos_1b` cubre JWT con otra clave, vencido y basura, por header y query; control positivo: token legado válido sin claim `cliente` SIGUE recibiendo 402. |
| frontera-1 | media | 3 frontera | **arreglado** | `sanear_nombre_proveedor` sólo conocía ASCII: `＠` (U+FF20), espacio de ancho cero y separadores `/ _ · ,` dejaban pasar correo y teléfono enteros a `/metricas` y `/tendencia`. | `test_f03_*` (sonda), `test_f04_*`, `test_f05_*`. | NFKC como primer paso, borrado de categoría `Cf`, `_TELEFONO_RE` con `[\s\-.()/_·,]`. Las seis formas enmascaradas. |
| frontera-3 | media | 3 frontera | **arreglado (variante)** | `periodo` sin techo (~97 000 valores); cada uno recorría las N bases, entraba a `_cache`/`_cache_contratos` sin desalojo y ESCRIBÍA `snapshot_metricas` — para meses futuros incluidos, que luego se leían como historia. | `test_f07_*`: 25 períodos → 25 entradas de caché y fila persistida para `9999-12`. | Ventana `[actual − 24, actual + 12]` con 422 de texto fijo (NO "hasta hoy": los tests consultan meses futuros a propósito para contratos que arrancan el mes que viene); `persistir_snapshots` no escribe si `anio_mes > periodo_actual()`; cachés como `OrderedDict` LRU con tope 24. `rango_del_periodo` intacto. |
| frontera-4 = ingresos-5 | media (media/baja) | 2 base de datos · 3 frontera | **arreglado** | `bitacora_plataforma`, `intentos_alta` y `snapshot_metricas` crecían sin purga en el registro; `audit_log` de cada cliente sí se purga a 365 días. | `test_f08_*`: siembra 3 años y corre `main._run_lease_maintenance()` real. | `plataforma_tendencia.purgar_registro()`: bitácora > `DIAS_QUE_SE_GUARDA` (365, importada de `services.bitacora`), `IntentoAlta` > 24 h, snapshots por cliente < actual − 36 meses, fila `__consolidado__` EXENTA. Llamada siempre al final de `cerrar_mes_anterior()` (main.py no se tocó). El test verifica que lo de ayer, lo de 6 meses y el `__consolidado__` viejo sobreviven. |
| frontera-6 | media | 3 frontera | **arreglado** | `GET /plataforma/supresiones` (email, usuario_id, motivo de titulares de habeas data) y `GET /plataforma/clientes` (motivo del corte) no dejaban línea en `bitacora_plataforma`; sólo `/metricas`, `/tendencia`, `/adopcion` anotaban. | `test_f12_*`: `0 -> 0`. | Helper `_anotar_consulta` (sesión propia, nunca propaga) en `routers/plataforma.py`; los tres endpoints existentes lo usan sin cambiar valores; `/supresiones` y `/clientes` anotan sin dato de negocio. `/soy` no anota. |
| ingresos-2 | baja | 2 defensa en profundidad | **arreglado** | `_EXENTOS_EN_SOLO_LECTURA` / `_EXENTOS_POR_HABEAS_DATA` con `startswith` sin frontera de segmento: `/api/authorizaciones/...` heredaba la exención de `/api/auth`. Sin ruta así hoy. | `test_ingresos_2_*`. | `clientes._path_bajo` (igualdad o prefijo + `/`) usado en las tres comparaciones, `_es_path_de_plataforma` reimplementada encima. 7 paths siguen exentos, 5 impostores cortan. |
| hardening-8 | media | 4 OWASP / CI | **arreglado (script) — con consecuencia** | El gate `deps-audit` nunca podía confirmar HIGH/CRITICAL: `severidad_de()` hacía `float()` sobre un vector CVSS textual y siempre salía exit 0. | `pip_audit_severity.py` sobre 27 avisos: "severidad desconocida" ×20, exit 0. | Score base CVSS v3.x calculado desde el vector (fórmula §7.1, sin librerías), mapeo a severidad, `::warning::` cuando no puede determinar, búsqueda en alias GHSA cuando el PYSEC trae vector marcador de posición (score 0.0), `--self-test` verde (9/9). **Corrido contra el árbol real: 9 HIGH confirmados, exit 1.** Sin test de pytest (el self-test no corre en el workflow). Dependencias NO actualizadas. |
| compliance-2 | baja (media) | 6 privacidad | **documentado** | Nada en el ORM impide escribir un `@` en `proveedores_json`. | `test_compliance2_*` (sonda verde). | Cae con compliance-1: el nombre baja saneado. Una validación en el modelo queda como defensa en profundidad opcional. La invariante vive en `_recortar_top` (escritura) y `_top` (lectura), ambas idempotentes. |
| compliance-3 | baja (media) | 6 privacidad | **documentado** | El enlace de invitación viaja con token de un solo uso en el cuerpo del correo hacia Brevo/SendGrid; la política no nombra al proveedor ni ese dato. | `test_compliance3_*` (sonda verde): `login?invitacion=WgZw...` en el HTML. | No es fix de código. Completar `docs/legal/politica-datos.md` §9.1. |
| ingresos-3 | baja | 1 Firebase | **documentado (caracterización)** | `leeway=60` también alarga `exp`: un ID token vencido hace < 60 s verifica. | `test_ingresos_3_*` (verde): exp hace 30 s verifica, hace 120 s rechaza. | Intencional y documentado en `services/firebase_tokens.py`; aceptable con TTL de 1 h. Cierre opcional: chequeo de `exp` sin tolerancia después del decode. |
| ingresos-4 | baja | 1 alta self-service | **documentado** | `CREATE DATABASE` denegado se muestra como "Ese código ya está tomado" (409) y deja `Usuario` huérfano (R-4). | `test_ingresos_15_*` (verde). | Distinguir validación (409) de infraestructura (503 + log) en `crear_cliente`; no persistir el Usuario antes del paso irreversible. |
| hardening-2 | baja | 4 OWASP | **documentado (sin cambio)** | HSTS forzable con `X-Forwarded-Proto: https` spoofeado. | `test_h2_*` (caracterización). | Benigno: el navegador ignora HSTS sobre HTTP plano (RFC 6797 §7.2). |
| hardening-9 | baja | 4 OWASP | **documentado** | Dockerfile sin `USER`: uvicorn corre como root. | Inspección del Dockerfile. | No se toca: no se puede verificar el permiso de escritura sobre el disco de datos en Render desde acá. Propuesta en §4. |

### Hallazgos propios del Verificador (no listados por ningún auditor)

| id | sev | estado | qué es |
|---|---|---|---|
| verif-1 | bloqueante | **abierto** | `tests/test_tendencia_ataques.py::test_t32_csp_de_main_solo_cambio_run_lease_maintenance` en rojo. Es un guardián que corre `git diff main -- backend/app/main.py` con la condición `"Content-Security-Policy" in contenido or "add_middleware" in contenido and "CSP" in diff` (= `A or (B and C)`). El comentario nuevo de hardening-1c dice literalmente "`add_middleware` apila del último al primero" y la palabra "CSP" aparece en el diff: dispara sobre un comentario. **Falso positivo verificado**: `git diff main -- backend/app/main.py \| grep -E "^[+-].*Content-Security-Policy"` no devuelve nada. La suite está roja igual. |
| verif-2 | media | **abierto** | `tests/test_auditoria_ingresos.py::test_ingresos_16_las_tablas_del_registro_que_crecen_no_tienen_purga` pasa en VERDE afirmando que NO hay purga (`assert not purga_bitacora_plataforma and not purga_snapshots`), cuando frontera-4 la agregó. Sus patrones de string (`BitacoraPlataforma.at <`, `SnapshotMetricas.capturado_en <`) no matchean el código nuevo (columna `.en`, filtro por `.periodo`, cadena partida en varias líneas). Verde vacío que miente. El test real de la purga es `test_f08`. |
| verif-3 | cosmético | abierto | `pip_audit_severity.py` imprime "9 vulnerabilidad(es)" y lista 11 líneas (ids duplicados por pip-audit no deduplicados). |

### Sospechas sin confirmar (no son hallazgos; van tal cual)

- **`X-Forwarded-For`** si Render o un CDN futuro REEMPLAZA la cabecera en vez de agregar: `ip_del_cliente` tomaría la IP equivocada. Verificable sólo con un `curl` a un endpoint de eco en producción.
- **`CREATE DATABASE` en el Postgres de Render**: si el rol no lo tiene, el alta self-service está muerta en producción y se reporta como "slug tomado" (ingresos-4). Verificar a mano.
- **Cachés por proceso** (membresía 60 s, métricas 5 min, ahora LRU de 24): correctos con un worker, que es lo que corre Render hoy. Con dos o más, desactivar a alguien tarda hasta 60 s en los otros.
- **`?token=` en la query** viaja a logs de proxy y `Referer`. Decisión deliberada (`<img>`/`<iframe>`) y documentada; riesgo que crece con cada proxy nuevo.
- **H-7 / H-8** (token de invitación decorativo: se canjea por igualdad de email; membresía sin consentimiento desde otro cliente): xfail abiertos en `test_identidad_ataques.py`, de fases anteriores. En lectura del auditor de ingresos, siguen siendo lo más grave de identidad.
- **Actividad de una persona identificable** cuando `usuarios_con_cuenta == 1`: `ultimo_acceso` y `dias_sin_acceso` son la actividad de la dueña. Autorizado por la spec de Fase 4; la lógica de K=3 aplicaría igual.
- **Amplificación por vaciado de caché en paralelo**: frontera-3 lo acota (ventana + LRU), pero no se midió concurrencia real contra `POOL_POR_CLIENTE = 2`.
- **`GET /soy` como oráculo sobre uno mismo**: no hallazgo.
- **`mailer.py` loguea destinatarios** (`Correo enviado (%s) a %s`): los logs de Render como posible encargado adicional bajo Ley 1581. Decisión de producto.
- **UTC vs Colombia** en `periodo_actual()`: comportamiento aceptado y documentado; el borde de mes es una decisión de zona horaria, no un bug.
- **`starlette` no está fijado en `requirements.txt`** (viene transitivo de `fastapi==0.115.0`); subir fastapi cambia el parser multipart/form — probar los routers antes.
- `docker-compose.prod.yml` / `nginx/retail.conf` recibieron menos atención (despliegue VPS apagado por defecto).

---

## 2. Postura de seguridad — veredicto honesto

### Bien defendido (probado, no supuesto)

- **Aislamiento multi-tenant.** El barrido por 11 routers en las dos direcciones, el claim `cliente` reescrito, el token de consola por ambos caminos y el enlace de montaje sin cliente: todo cerrado. Es fuerte por construcción (`cliente` va dentro de lo firmado, `cliente_del_pedido` es el único punto que elige la base), no por disciplina.
- **Verificación de Firebase**: RS256 forzado desde el header antes de tocar la red, clave por `kid`, `aud`+`iss` por parámetro. El `leeway` sobre `exp` está medido y es aceptable.
- **Frontera del operador**: `require_operador`, lista taxativa de agregados, K=3 sobre plata y spread, saneo de proveedores (ahora también Unicode), bitácora (ahora completa). Ningún dato de negocio en las líneas de bitácora.
- **Derechos del titular** (export, supresión, consentimiento, exención del 402 para habeas data): sólidamente probados por `test_compliance_ataques.py`, `test_consentimiento.py`, `test_derechos.py`.
- **Cabeceras y CSP** (Fase 3) siguen intactas; el 413 nuevo sale con CSP y `X-Frame-Options`.
- **Errores silenciados**: los 9 `except Exception` de `main.py`/plataforma tienen `log.exception` y degradación documentada.
- **Después de esta rama**: uploads con tope de streaming en los cuatro routers, tope de cuerpo pre-auth, sin PII de terceros en reposo en el registro, registro con purga, consolidado que no contradice sus sumandos, gate de dependencias que de verdad falla.

### Mal defendido o abierto (con nombre)

- **frontera-5**: la regla "el consolidado suma a todos" permite despejar el canon exacto de un contrato único suprimido por K=3. Es la contradicción más seria entre lo que la frontera promete ("jamás valores de contratos individuales") y lo que hace. Confirmada, reproducida, no arreglada porque cambiarla es cambiar la spec. Decisión del usuario.
- **Dependencias con DoS activos**: `starlette 0.38.6` (CVE-2024-47874 = "no hay tope de tamaño de request"), `python-multipart 0.0.20`, `pyjwt 2.9.0` — 9 avisos HIGH confirmados por el gate arreglado. `LimiteDeCuerpo` MITIGA el de starlette, pero mitigar no es parchear.
- **Identidad**: H-7 y H-8 siguen abiertos desde fases anteriores (invitación canjeable por igualdad de email; membresía impuesta sin consentimiento). No son de esta auditoría, pero son lo más grave que arrastra la dimensión 1.
- **Alta self-service**: R-3/R-4/R-5 siguen xfail (carrera en el tope de fundaciones, `Usuario` huérfano antes del paso irreversible, `crear_cliente` adopta una base existente), y no sabemos si el rol de Postgres en producción puede crear bases.
- **Contenedor como root** (hardening-9). Higiene, pero real.
- **Un solo proceso**: todo el modelo de cachés y la protección contra DoS asume `--workers 1`. Es correcto hoy y se rompe silenciosamente el día que se escale.
- **Tope JSON de 2 MiB**: un juicio, no una medición; un layout con más de ~7 000 muebles en una sede lo rozaría. Vive en `subidas.py::TOPE_JSON`.

### Lo que esta auditoría NO cubrió

Concurrencia real (todo fue `TestClient`), producción (prohibido por regla), `X-Forwarded-For` bajo el proxy real, el despliegue VPS, y el frontend más allá de `tsc`/`build` (el `retail-auth-v1` en localStorage se listó en la spec pero ningún auditor lo atacó con reproducción).

---

## 3. Texto para `docs/ESTADO.md` — sección "Auditoría integral (post Fase 6)"

> Insertar como subsección nueva después de "Fase 6 — Asesoría". Además, dos
> párrafos de la Fase 5 quedaron desactualizados y hay que retocarlos (ver
> "Retoques a la Fase 5" al final de esta sección).

```markdown
### Auditoría integral (post Fase 6)

Auditoría adversarial del sistema completo (spec en `features/auditoria/spec.md`,
entregables en `features/auditoria/outputs/`), sobre seis dimensiones: ingreso
al sistema, aislamiento multi-tenant y base de datos, frontera del operador,
OWASP/hardening, bugs de las Fases 4–6 y compliance/privacidad. Cinco auditores,
24 hallazgos con reproducción (cada uno con un test en
`tests/test_auditoria_<dimension>.py`, estilo `test_*_ataques.py`), 11
arreglados en la misma rama con el `xfail` convertido en test verde. La
frontera multi-tenant, la verificación de Firebase y los derechos del titular
aguantaron todo sin un solo cruce: lo que se encontró fue de segundo orden.

**Qué se arregló**

- **Uploads con tope de streaming** (`app/services/subidas.py::leer_con_tope`):
  `files.py`, `mounts.py`, `catalogo.py` y `planograms.py` leían el archivo
  ENTERO en RAM antes de comparar contra su límite (con `--workers 1`, un
  archivo de GB tumba el único proceso). Ahora se lee de a 64 KiB y se corta
  apenas se pasa; códigos y textos de respuesta no cambiaron (`planograms`
  sigue en 400). `montaje.py` hereda el arreglo porque delega en
  `mounts.registrar_montaje`.
- **Tope de tamaño de cuerpo para toda la app, antes de cualquier auth**
  (`subidas.py::LimiteDeCuerpo`, middleware ASGI puro registrado en `main.py`):
  2 MiB para JSON y todo lo que no sea multipart, 12 MiB para
  `multipart/form-data` (el tope propio de cada endpoint lo sigue aplicando el
  helper). `Content-Length` sirve para rechazar de entrada, nunca para
  permitir: decide el conteo real. Responde 413 JSON con las cabeceras de
  seguridad puestas. No es `@app.middleware("http")` a propósito:
  `BaseHTTPMiddleware` no puede intervenir el `receive`. El tope JSON de 2 MiB
  es un juicio (los layouts por sede pesan cientos de KB), vive en
  `subidas.py::TOPE_JSON`.
- **El `Bearer basura` ya no delata el estado de cuenta** (ingresos-1). Con un
  solo cliente en la instalación, la rama `unico()` de `cliente_del_pedido`
  aplicaba `_aplicar_estado` ante CUALQUIER texto en el header o en `?token=`,
  y el 402 salía antes del 401. Ahora hay `auth.token_verifica()` y la rama
  exige que la credencial verifique (firma y `exp`). Tres situaciones: sin
  credencial → 401; credencial que no verifica → 401; token nuestro válido
  (incluso legado sin claim `cliente`) → el estado de cuenta se aplica, 402 si
  corresponde. Nada se relajó.
- **Exenciones del interruptor con frontera de segmento** (ingresos-2):
  `clientes._path_bajo` (igualdad o prefijo + `/`) reemplaza `startswith` en
  `_EXENTOS_EN_SOLO_LECTURA`, `_EXENTOS_POR_HABEAS_DATA` y
  `_es_path_de_plataforma`. Un solo helper para las tres.
- **BUG-1, iteración 3** (bugs-1): la reconstrucción de la fila
  `__consolidado__` cuando una captura de un mes pasado inserta una fila que
  faltaba ya no usa los crudos de HOY para clientes con fila previa. Regla
  única en `_reconstruir_consolidado`: **un cliente con fila persistida antes
  de esta captura se suma SIEMPRE desde su fila en disco**; sólo los slugs
  recién insertados en esta captura salen de memoria (lo que se acaba de
  escribir ES el valor fresco, con ids de usuario y conteo completo por
  proveedor). Ingreso, ocupación, contratos y sedes del consolidado nunca
  contradicen a sus sumandos; usuarios y proveedores siguen siendo
  aproximados para las filas que vienen de disco (limitación conocida).
- **El nombre del proveedor baja SANEADO a `snapshot_metricas`**
  (compliance-1 = frontera-2). `_recortar_top` ordena y recorta el top-5 con el
  nombre original y persiste `{sanear_nombre_proveedor(nombre): conteo}`,
  sumando conteos si dos originales sanean igual. Es el único paso previo al
  `json.dumps`, así que cubre fila por cliente, consolidada y reconstrucción.
  Los NÚMEROS siguen crudos y K=3 se sigue aplicando al leer; el NOMBRE se
  protege al escribir. El saneo es idempotente, así que `publicar_fila` sigue
  pasando por `_top` sin enmascarar dos veces. La invariante vive en dos
  lugares: `_recortar_top` (escritura) y `_top` (lectura). Efecto lateral
  aceptado: dos proveedores distintos cuyos nombres sanean igual se funden en
  la fila persistida. Sin migración: la columna no cambia de forma.
- **Saneo Unicode** (frontera-1): `sanear_nombre_proveedor` normaliza NFKC
  primero (`＠` → `@`, dígitos de ancho completo → ASCII), borra los caracteres
  de categoría `Cf` (ZWSP, ZWNJ, BOM, marcas de dirección) y `_TELEFONO_RE`
  acepta `/ _ · ,` como separadores.
- **Ventana de `periodo`** (frontera-3): `normalizar_periodo` acepta sólo
  `[actual − 24, actual + 12]` meses (`MESES_HISTORIA_MAXIMO`,
  `VENTANA_MESES_ADELANTE` en `plataforma_metricas`; `plataforma_tendencia`
  reusa la primera como `MESES_MAXIMO`); fuera de ahí, 422 con texto fijo.
  Los meses futuros se siguen aceptando porque un contrato que arranca el mes
  que viene se ve preguntando por ese mes. `rango_del_periodo` no cambió.
  **Un mes futuro NO se persiste**: `persistir_snapshots` retorna temprano si
  `anio_mes > periodo_actual()` (una proyección no es historia). `_cache` y
  `_cache_contratos` son `OrderedDict` LRU con `TOPE_CACHE_PERIODOS = 24`.
- **Purga del registro** (frontera-4 = ingresos-5):
  `plataforma_tendencia.purgar_registro()` borra `bitacora_plataforma` con más
  de `DIAS_QUE_SE_GUARDA` días (365, la MISMA constante que `audit_log`,
  importada de `services.bitacora`), `intentos_alta` con más de 24 h (la
  ventana del rate limit es de 15 min: sólo se va lo que ya no frena a nadie)
  y las filas POR CLIENTE de `snapshot_metricas` anteriores a
  `actual − 36 meses`. **La fila `__consolidado__` no se purga nunca**: es la
  serie larga del negocio, no habla de ningún cliente ni trae nombre de
  proveedor. Corre al final de `cerrar_mes_anterior()`, en su propio
  `try/except`, SIEMPRE (también cuando el cierre no tenía nada que hacer), así
  que `_run_lease_maintenance` la dispara una vez por vuelta sin cambios en
  `main.py`. Son DELETE: sin migraciones.
- **Bitácora en las lecturas de PII** (frontera-6): `routers/plataforma.py`
  extrae `_anotar_consulta(email, accion, periodo)` (sesión propia, nunca
  propaga: la constancia no puede tumbar la consulta) y lo usa en `/metricas`,
  `/tendencia`, `/adopcion` como antes y AHORA también en `/supresiones`
  (`accion="supresiones"`) y `/clientes` (`accion="clientes"`), con
  `periodo_actual()` y sin dato de negocio en la línea. `/soy` no anota.
- **Gate de `pip-audit` con CVSS real** (hardening-8): el script
  `.github/scripts/pip_audit_severity.py` hacía `float()` sobre un vector CVSS
  textual y nunca podía confirmar un HIGH/CRITICAL: el job `deps-audit` era un
  adorno. Ahora calcula el score base v3.x desde el vector (fórmula de la
  spec, sin librerías), busca la severidad en el alias GHSA cuando el PYSEC
  trae un vector marcador de posición (score 0.0), avisa con `::warning::`
  cuando no puede determinar y tiene `--self-test`. Consecuencia: **el gate
  ahora falla con 9 HIGH confirmados** (ver "abierto").

**Qué queda abierto y por qué**

- **frontera-5 — decisión de producto pendiente** (`test_f09`,
  `xfail(strict=True)`, NO borrar). Con un cliente que publica y otro
  suprimido por K=3, `ingreso_consolidado − ingreso_visible` devuelve al peso
  el canon del contrato único del suprimido. Contradice la regla "el
  consolidado sí suma a todos" (Fase 4, `test_m26`,
  `test_metricas_conciliacion.py:1338`, `test_plataforma_metricas.py:495/516`,
  `test_plataforma_tendencia.py:632/670`). Dos opciones: (a) sumar sólo
  clientes publicables (precedente del spread, a17); (b) sumar a los suprimidos
  sólo si entre todos juntan ≥ K contratos, de modo que el residuo
  `consolidado − visibles` sea siempre una celda K-segura y el "total del
  negocio" se conserve en casi todos los meses reales. Se recomienda (b).
  Cualquiera de las dos hay que replicarla en `publicar_fila` (que hoy lee la
  fila `__consolidado__` sin mirar las filas por cliente del período) y
  reescribir las expectativas de los cinco archivos citados.
- **Dependencias con DoS**: `starlette 0.38.6` (PYSEC-2026-1943 =
  CVE-2024-47874, sin tope de tamaño de request), `python-multipart 0.0.20`,
  `pyjwt 2.9.0`. `LimiteDeCuerpo` mitiga el de starlette; no lo parchea. No se
  cambian dependencias en esta rama; el salto de starlette arrastra FastAPI y
  el de pyjwt toca la verificación de tokens.
- **Dockerfile sin `USER`** (hardening-9): no verificable contra el disco de
  datos de Render desde acá.
- **H-7 / H-8** (identidad, fases anteriores) y **R-3 / R-4 / R-5** (alta
  self-service) siguen xfail. ingresos-4 (falla de infraestructura del alta
  disfrazada de "slug tomado") se suma a R-4.
- Documentados sin cambio: ingresos-3 (leeway sobre `exp`, medido, aceptable),
  hardening-2 (HSTS spoofeable, benigno por RFC 6797 §7.2), compliance-2
  (validación en el ORM como defensa opcional), compliance-3 (texto de la
  política: nombrar Brevo/SendGrid y el enlace con credencial de un solo uso
  en §9.1; completar §6 con 365 días).
```

**Retoques a la Fase 5** (dos párrafos que ya no describen el código):

- Línea ~317: `proveedores_json` (`{nombre_ORIGINAL: conteo}` recortado al
  top 5)` → `proveedores_json` (`{nombre_SANEADO: conteo}`, top-5 elegido con
  el nombre original y saneado al bajar — ver Auditoría integral)`.
- Línea ~320: "La supresión K=3 y el saneo se aplican AL LEER" → "La supresión
  K=3 se aplica AL LEER; el saneo del nombre se aplica al ESCRIBIR (y también
  al leer, idempotente)".
- Líneas ~365–373: reemplazar desde "Cuando la captura tiene en memoria los
  crudos de TODOS..." hasta "...queden bien." por: "La reconstrucción suma
  SIEMPRE desde disco para los clientes con fila previa y sólo toma de memoria
  los slugs recién insertados en esta captura (BUG-1, iteración 3): exacta
  para ingreso/ocupación/contratos/sedes; aproximada para usuarios y
  proveedores en las filas que vienen de disco (conteo sin ids, top-5 sin
  conteo completo). Limitación conocida, aceptada."
- En "Reglas duras" (si corresponde): `periodo` sólo dentro de
  `[actual − 24, actual + 12]`; ningún snapshot de mes futuro; `__consolidado__`
  no se purga.

---

## 4. Qué le queda al humano

### Bloqueantes antes de mergear (en orden)

1. **`test_t32_csp_de_main_solo_cambio_run_lease_maintenance` en rojo por falso
   positivo** (verif-1). Arreglo de una línea en el test: la condición
   `"Content-Security-Policy" in contenido or "add_middleware" in contenido and "CSP" in diff`
   tiene que mirar líneas `+`/`-` del diff que contengan
   `Content-Security-Policy`, no la palabra "CSP" en cualquier parte. O bien
   reformular el comentario de `main.py` para no decir `add_middleware`. Lo
   primero es mejor: el guardián estaba mal escrito, y la precedencia
   `A or (B and C)` es probablemente un bug de paréntesis. Ningún builder lo
   tocó porque el test es un guardrail y "arreglarlo" sin la autorización del
   usuario sería relajarlo.
2. **`test_ingresos_16` miente en verde** (verif-2). Borrarlo (el test real de
   la purga es `test_f08`) o reescribirlo para afirmar que `purgar_registro`
   existe y que `cerrar_mes_anterior` la llama.
3. **Nada está commiteado.** HEAD es `36c581d` (sólo la spec). 12 archivos
   modificados y 7 nuevos en el working tree (`git status` arriba). Hay que
   `git add` incluyendo los untracked (`backend/app/services/subidas.py`, los
   cinco `test_auditoria_*.py`, `features/auditoria/outputs/`).
4. **El workflow `deps-audit` va a fallar en CI** en cuanto se mergee, porque
   el gate ahora funciona: 9 HIGH confirmados. Opciones: (a) subir
   `python-multipart` → 0.0.31, `pyjwt` → 2.13.0, `starlette` → 1.3.1
   (arrastra `fastapi`) en un PR aparte y en serie, corriendo
   `test_identidad*.py` tras pyjwt y `test_files_acceso.py`/`test_catalogo.py`/
   `test_mounts.py` tras starlette (el parser multipart cambia); (b) mergear
   sabiendo que el job queda rojo hasta ese PR. Recomendación: (a) primero,
   esta rama después, o las dos en el mismo PR si la corrida en serie sale
   limpia.
5. **`docs/ESTADO.md`**: pegar la sección de §3 y hacer los cuatro retoques
   de la Fase 5. Ningún builder lo tocó por regla.
6. **Docstring de `app/models/plataforma.py::SnapshotMetricas.proveedores_json`**:
   dice "nombre_ORIGINAL" y "se guarda SIN sanear"; ya no es cierto. Sólo texto,
   fuera del territorio de los dos builders. Retocar en el mismo commit.
7. Volver a correr la suite completa dos veces en serie + `tsc` + `build`
   después de 1–2 (la regla de la spec). El Verificador la corrió con el t32
   en rojo: 757 passed, 8 xfailed, 1 failed, determinista entre corridas.

### Decisiones de producto

1. **frontera-5** (la primera): ¿el ingreso consolidado suma a los clientes
   suprimidos por K=3? Hoy sí, y eso permite despejar el canon exacto de un
   contrato único. Opciones (a) sólo publicables / (b) suprimidos sólo si
   juntan ≥ K entre todos. Recomendación del Maestro: (b). Hasta que se decida,
   `test_f09` queda `xfail(strict=True)` como regresión.
2. **Zona horaria del negocio**: `periodo_actual()` usa UTC; las últimas horas
   de Colombia caen en el mes siguiente. Aceptado y documentado; se deja
   escrito por si algún día se quiere "mes Colombia".
3. **Actividad de una persona identificable** con `usuarios_con_cuenta == 1`:
   la spec de Fase 4 lo autoriza; la lógica de K=3 aplicaría. Decidir si se
   suprime `ultimo_acceso`/`dias_sin_acceso` bajo K.
4. **Logs de Render como encargado** (Ley 1581): `mailer.py` loguea
   destinatarios. Decidir retención / si se deja de loguear el correo.

### Verificar a mano en producción (no atacable desde acá)

- ¿El rol de Postgres en Render tiene `CREATE DATABASE`? Si no, el alta
  self-service está muerta y se ve como "Ese código ya está tomado".
- ¿Render AGREGA o REEMPLAZA `X-Forwarded-For`? Un `curl` a un endpoint de eco
  desde una IP conocida.
- ¿Cuántos clientes hay en producción? ingresos-1 dependía de que hubiera uno;
  ya está arreglado, pero el dato importa para R-1 y para los cachés por proceso.

### Higiene, cuando haya tiempo

- Dockerfile: `RUN useradd -r appuser && chown -R appuser /app/backend/data` +
  `USER appuser`, probado primero en un servicio de prueba de Render (permiso
  de escritura sobre el disco de datos).
- `docs/legal/politica-datos.md`: §6 plazo de bitácora = 365 (copiar
  `DIAS_QUE_SE_GUARDA`, no inventar otro), declarar `snapshot_metricas` con su
  plazo (36 meses por cliente, serie consolidada sin plazo); §9.1 nombrar
  Brevo/SendGrid y que los correos de invitación y montaje llevan un enlace
  con credencial de un solo uso; §9.2 sigue `[VALIDAR CON ABOGADO]`.
- ingresos-4 / R-4: distinguir en `crear_cliente` error de validación (409) de
  infraestructura (503 + log con causa real); no persistir el `Usuario` antes
  del paso irreversible.
- ingresos-3: si se quiere, chequeo explícito de `exp` sin tolerancia después
  del `jwt.decode` en `services/firebase_tokens.py`.
- compliance-2: validación en el ORM de `SnapshotMetricas.proveedores_json`
  (rechazar `@` o 7+ dígitos) como defensa en profundidad.
- verif-3: deduplicar ids en el listado de `pip_audit_severity.py`.
- Agregar un test de pytest (o un paso del workflow) que corra
  `pip_audit_severity.py --self-test`, para que el gate del gate no dependa de
  que alguien lo corra a mano.
- `npm audit`: 2 HIGH en `browserslist` (build-time, `npm audit fix` sin
  breaking); esbuild/vite y react-router 6 requieren majors. Preexistente.

### Estado de la verificación (para no repetirla a ciegas)

- `tsc --noEmit`: exit 0. `npm run build`: exit 0 (chunk de 2.1 MB > 500 kB,
  preexistente).
- Suite backend, dos corridas con bases borradas: 766 tests, 757 passed,
  8 xfailed (todos `strict=True`, todos documentados: f09, X-19b, X-28, H-7,
  H-8, R-3, R-4, R-5), 1 failed (t32), idéntico byte a byte entre corridas.
- Ningún `xfail` se aflojó a `strict=False` ni se borró.
- Diff: `git diff origin/main --stat` = 13 archivos, +888/−201, SIN contar los
  7 archivos nuevos untracked.
