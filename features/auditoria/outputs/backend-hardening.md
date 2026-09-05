# Backend hardening — límites de carga, tope de body y oráculo de estado de cuenta

Builder de arreglos. Cinco hallazgos asignados, **cinco arreglados**, todos con
el `xfail` del auditor convertido en test verde (y ampliado a regresión).

| id | severidad | qué era | estado |
|---|---|---|---|
| hardening-1 / -1b | alta (DoS trivial) | `await file.read()` bufferiza el archivo entero antes de comparar contra el límite | **arreglado** |
| hardening-1 (extensión) | alta | el mismo patrón en `catalogo.py` y `planograms.py`, que el auditor no listó | **arreglado** |
| hardening-1c | alta (DoS trivial, pre-auth) | ningún límite de tamaño de request en toda la app | **arreglado** |
| ingresos-1 | media | con un solo cliente, un `Bearer basura` recibe 402 con el estado de cuenta | **arreglado** |
| ingresos-2 | baja (defensa en profundidad) | exenciones del interruptor comparadas con `startswith` sin frontera de segmento | **arreglado** |
| hardening-8 | media | el gate de CI de pip-audit no podía confirmar HIGH/CRITICAL nunca | **arreglado** (y ahora **falla**: ver gaps) |

---

## hardening-1 / -1b — la lectura ahora corta en el límite

**Qué pasaba.** Los cuatro endpoints de subida hacían
`data = await file.read()` y recién después `if len(data) > MAX: 413`. El 413
era correcto y llegaba tarde: para contestarlo el proceso ya tenía el archivo
entero en RAM. El Dockerfile arranca uvicorn con `--workers 1` — un único
proceso atiende todo el supermercado —, así que un archivo de varios GB no
hace lento al servidor: lo mata. Y el atacante no necesita que se lo acepten,
le alcanza con mandarlo.

**El arreglo.** `backend/app/services/subidas.py::leer_con_tope(upload, tope,
detalle, codigo=413)` lee de a 64 KiB, acumula, y apenas `acumulado > tope`
corta el loop y levanta el `HTTPException`. El `detalle` y el `codigo` los pasa
el llamador: **no se unificó ningún texto ni ningún código de respuesta**
(`planograms.py` sigue contestando 400 y no 413, que es lo que contestaba
desde siempre).

El `tope` se lee del módulo **en tiempo de llamada** (`leer_con_tope(file,
MAX_FILE_SIZE, ...)` dentro de la función, nunca como default de parámetro),
porque los tests lo bajan en caliente con
`monkeypatch.setattr(files_mod, "MAX_FILE_SIZE", 100)`.

Reemplazado en:

| archivo | constante | código/texto (sin cambios) |
|---|---|---|
| `backend/app/routers/files.py:159` | `MAX_FILE_SIZE` (10 MB) | 413 · "El archivo supera el límite de 10 MB" |
| `backend/app/routers/mounts.py:170` | `MAX_PHOTO` (10 MB) | 413 · "La foto supera el límite de 10 MB" |
| `backend/app/routers/catalogo.py:114` | `MAX_SIZE` (5 MB) | 413 · "El arte supera los 5 MB." |
| `backend/app/routers/planograms.py:109` | `MAX_SIZE` (10 MB) | **400** · "El archivo supera los 10 MB." |

`montaje.py` no lee la foto: delega en `mounts.registrar_montaje`, así que
queda cubierto por el mismo arreglo (se verificó: su único `UploadFile` viaja
sin tocar).

**Medición** (salida literal de los tests, tope bajado a 100 B, archivo de
2 MB = 2 097 156 B):

```
files.py:      tope 100 B · archivo 2097156 B · LEÍDO 65536 B (máximo aceptable 65636)
mounts.py:     tope 100 B · archivo 2097173 B · LEÍDO 65536 B (máximo aceptable 65636)
catalogo.py:   tope 100 B · archivo 2097156 B · LEÍDO 65536 B (máximo aceptable 65636)
planograms.py: tope 100 B · archivo 2097156 B · LEÍDO 65536 B (máximo aceptable 65636)
```

Antes: `LEÍDO == 2097156` en los cuatro. Ahora entra **un chunk**, y nada más.

Tests (eran las sondas `test_h1_*` / `test_h1b_*`, ahora regresión):
`test_h1_files_corta_la_lectura_al_pasarse_del_limite`,
`test_h1b_mounts_corta_la_lectura_de_la_foto_al_pasarse_del_limite`,
`test_h1d_catalogo_...`, `test_h1e_planograms_...` — todos afirman el 413/400
**y** el texto exacto **y** `leido <= tope + 65536`.

## hardening-1c — tope de tamaño del cuerpo, antes de cualquier auth

**Qué pasaba.** No había ningún límite de tamaño de request en la app. No es un
problema de uploads: `POST /api/auth/login` con 5 MB de "contraseña" se
parseaba entero para terminar contestando 401 — sin cuenta, sin sesión, sin
nada. Cualquier anónimo.

**El arreglo.** `subidas.py::LimiteDeCuerpo`, middleware **ASGI puro**
registrado en `main.py` con `app.add_middleware(LimiteDeCuerpo)` junto al
`CORSMiddleware`. No es `@app.middleware("http")` a propósito:
`BaseHTTPMiddleware` no puede intervenir el `receive` — vería el cuerpo ya
leído por la capa de abajo, que es exactamente lo que hay que evitar.

Cómo corta:

* **Tope por Content-Type.** `multipart/form-data` → 12 MiB (los 10 MB de
  archivo que `files.py`/`mounts.py` sí aceptan, más las cabeceras del form).
  Todo lo demás → 2 MiB (los layouts JSON por sede, que son el cuerpo más
  pesado del sistema, pesan cientos de KB). El tope propio de cada endpoint lo
  sigue aplicando `leer_con_tope`: catálogo corta en 5 MB mucho antes que el
  middleware.
* **`Content-Length` declarado**: sirve para rechazar de entrada (barato),
  **nunca para permitir**. Lo que decide es el conteo real sobre el `receive`
  (un cuerpo `chunked` no lo trae, y uno que miente declara de menos).
* Al pasarse, se levanta una excepción interna en el `receive` envuelto y se
  contesta `413 {"detail": "El pedido supera el tamaño máximo permitido."}`.
  Hay bandera para no mandar la respuesta dos veces: si la app de abajo ya
  había arrancado la respuesta, no se pisa.

**Orden de middlewares y cabeceras de seguridad.** `add_middleware` apila del
último registrado al primero, así que el orden efectivo queda
`cabeceras_de_seguridad` (afuera) → `LimiteDeCuerpo` → `CORSMiddleware` → app.
Verificado con TestClient: **el 413 sale con CSP, `X-Frame-Options: DENY` y el
resto de las cabeceras** (`test_h1c_b_...` lo afirma y lo imprime). No hace
falta documentar ninguna excepción.

Se verificó por grep que ningún body JSON de los tests existentes supera 2 MiB
(el único cuerpo de 5 MB+1 vive en `tests/test_catalogo.py:175` y es
multipart, así que cae bajo el tope de 12 MiB y lo sigue rechazando el helper
del endpoint con su 413 propio).

Tests: `test_h1c_un_body_json_gigante_muere_antes_del_login` (413 JSON con el
detail exacto), `test_h1c_b_...` (control positivo: 401 con clave mala y 200
con la buena siguen igual; el 413 lleva CSP), `test_h1c_c_...` (un upload
legítimo de **9 MB** sigue dando **201** y guarda el tamaño correcto),
`test_h1c_d_...` (20 MB → lo corta el middleware, no el endpoint),
`test_h1c_e_...` (un `Content-Length` honesto de 5 MB tampoco pasa).

## ingresos-1 — el `Bearer basura` ya no delata el estado de cuenta

**Qué pasaba.** El arreglo de R-1 sólo miraba si el pedido traía *credencial*,
no si esa credencial *valía*. `cliente_del_token(raw)` devuelve `None` en dos
casos que hay que distinguir: «token nuestro, legítimo, sin claim `cliente`»
(los de antes del multi-tenant) y «texto inventado por un anónimo». Con un solo
cliente en la instalación — producción hoy — el segundo caso igual llamaba a
`_aplicar_estado(unico(), request)`, y eso reabría el oráculo entero: 402 = ese
supermercado dejó de pagar, 401 = está al día. Sin cuenta.

**El arreglo.** `app/auth.py::token_verifica(raw) -> bool` (`jwt.decode` con
`JWT_SECRET`/`JWT_ALGORITHM` dentro de `try/except jwt.PyJWTError`; no mira
ningún claim, sólo firma y `exp`). En `clientes.py::cliente_del_pedido`, la
rama `solo = unico()` ahora aplica el estado **sólo si**
`raw is not None and token_verifica(raw)`. El comentario del bloque explica las
tres situaciones (sin credencial / credencial basura / token nuestro válido sin
claim `cliente`).

**No se relajó nada.** El test afirma explícitamente el control positivo: un
token nuestro y vigente — incluso uno legado sin claim `cliente`, que es el
caso que el fallback `unico()` existe para cubrir — **sigue recibiendo 402**
cuando la cuenta está degradada, igual que el admin con su token normal.

Cobertura ampliada (`test_ingresos_1b_...`): las otras formas de credencial
inválida tampoco delatan — un JWT bien formado firmado con **otra clave**, uno
nuestro pero **vencido**, y basura sintáctica; por header **y** por el
`?token=` de la query (el camino lateral de `<img>`/`<iframe>`). Los seis dan
401.

## ingresos-2 — frontera de segmento en las exenciones del interruptor

`_EXENTOS_EN_SOLO_LECTURA` y `_EXENTOS_POR_HABEAS_DATA` se comparaban con
`path.startswith(tupla)` sin frontera de segmento: `/api/authorizaciones/...`
heredaba la exención de `/api/auth`, y `/api/usuariosx` la de `/api/usuarios`.
Es el mismo defecto que H-3 obligó a arreglar para `/api/plataforma`.

Se extrajo `clientes._path_bajo(path, prefijos)` (`path == p` o
`path.startswith(p + "/")`) y se usa en **las tres** comparaciones:
`_EXENTOS_EN_SOLO_LECTURA`, `_EXENTOS_POR_HABEAS_DATA` y `_es_path_de_plataforma`,
que quedó reimplementado sobre el mismo helper con semántica idéntica. Un solo
lugar, para que no se pueda arreglar la mitad de las veces.

`test_ingresos_2_...` afirma las dos direcciones: siguen exentos `/api/auth`,
`/api/auth/login`, `/api/usuarios`, `/api/usuarios/invitar`,
`/api/clientes/mi-export`, `/api/clientes/solicitar-supresion` y
`/api/auth/aceptar-politica`; y **no** lo están `/api/authorizaciones/emitir`,
`/api/authx`, `/api/usuariosx`, `/api/usuarios-externos/alta` ni
`/api/clientes/mi-exportacion`. Más el control de que `/api/plataformazo` sigue
sin resolver.

## hardening-8 — el gate de pip-audit ahora puede confirmar severidad

**Qué pasaba.** `severidad_de()` hacía `float(vector.rsplit("/", 1)[-1])` sobre
un vector CVSS textual. El último segmento de
`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` es `A:H`, `float()` levanta
`ValueError` y el `continue` se comía la entrada. **El gate no podía confirmar
un HIGH/CRITICAL a partir de un vector, que es la forma en que vienen casi
todos**: era un adorno.

**El arreglo** (sólo `.github/scripts/pip_audit_severity.py`; no se tocó
`requirements*.txt` ni el workflow):

1. `score_de_vector()` calcula el score base CVSS v3.x desde el vector con las
   tablas y la fórmula de la spec §7.1 (AV, AC, PR con ajuste por Scope, UI,
   C/I/A; ISS, Impact con la rama de Scope cambiado, Exploitability, roundup a
   un decimal con la aritmética entera de la spec). ~40 líneas puras, sin
   dependencias nuevas. `severidad_de_score()` mapea 9.0+ CRITICAL, 7.0–8.9
   HIGH, 4.0–6.9 MEDIUM, <4 LOW. Un score numérico directo se sigue aceptando.
2. **Búsqueda en los alias.** Descubrimiento al probarlo contra la salida real:
   los ids `PYSEC-*` que devuelve pip-audit casi nunca traen severidad
   utilizable — varios traen un vector v3 **marcador de posición**
   (`.../C:N/I:N/A:N`, score 0.0) junto a un v4 que sí declara `VA:H`.
   Devolver LOW ahí sería un falso negativo con cara de dato, así que un score
   base 0.0 se trata como *no determinable* y se consulta el alias `GHSA-*`,
   que sí trae `database_specific.severity`. Es lo que convierte al gate en
   algo que de verdad confirma.
3. Cuando no se puede determinar, ya no queda en un log silencioso: sale como
   `::warning::<id>: ...` de GitHub Actions, visible en el resumen del job.
4. Self-test ejecutable: `python3 .github/scripts/pip_audit_severity.py
   --self-test`, sin red. Verifica cinco vectores con el score calculado a mano
   contra la fórmula (no de memoria) y cuatro formas de documento OSV:

```
  [ok ] CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H -> 9.8 (CRITICAL)
  [ok ] CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H -> 7.5 (HIGH)
  [ok ] CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N -> 3.1 (LOW)
  [ok ] CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H -> 10.0 (CRITICAL)
  [ok ] CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N -> 0.0 (LOW)
  [ok ] texto de GHSA -> HIGH · vector v3 -> HIGH
  [ok ] vector v3 marcador de posición + v4 -> None · aviso sin severidad -> None
self-test OK
```

> Nota: el tercer vector que traía la consigna (`.../AC:H/PR:L/UI:R/S:U/C:L/I:N/A:N`
> = 3.1) **no da 3.1**: la fórmula da 2.6 (ISS=0.22 → Impacto 1.4124;
> Explotabilidad 8.22·0.85·0.44·0.62·0.62 = 1.1818; suma 2.594 → roundup 2.6).
> Se usó `AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N`, que sí da 3.1 (1.4124 + 1.6201
> = 3.0325). La consigna pedía verificar contra la fórmula y no de memoria:
> esto es esa verificación.

---

## Gaps y advertencias (NO los arreglé; quedan para el usuario)

1. **El gate de deps ahora FALLA, y con razón.** Corrido contra el
   `pip-audit` real del árbol, el script confirma **9 avisos HIGH** y el job
   `deps-audit` va a ponerse rojo. No se cambian dependencias en esta rama
   (regla del encargo), así que la actualización queda para el usuario:

   | paquete | versión hoy | avisos HIGH confirmados | fix mínimo |
   |---|---|---|---|
   | `python-multipart` | 0.0.20 | PYSEC-2026-1852 (path traversal, sólo con `UPLOAD_DIR`+`UPLOAD_KEEP_FILENAME` — **no es la configuración de este repo**), PYSEC-2026-3036, PYSEC-2026-3039 | 0.0.31 |
   | `starlette` | 0.38.6 | PYSEC-2026-1943 (= CVE-2024-47874, **DoS por multipart sin límite de tamaño**), PYSEC-2026-249, PYSEC-2026-2281 | 1.3.1 (arrastra FastAPI) |
   | `pyjwt` | 2.9.0 | PYSEC-2025-183, PYSEC-2026-120, PYSEC-2026-179 | 2.13.0 |

   PYSEC-2026-1943 / PYSEC-2026-3040 son los avisos de DoS que el encargo
   mandaba documentar. **`LimiteDeCuerpo` mitiga parcialmente el de starlette**
   (CVE-2024-47874 es literalmente "no hay tope de tamaño de request"), pero
   mitigar no es parchear: la actualización sigue haciendo falta, y el salto de
   starlette 0.38 a 1.3 arrastra FastAPI, así que no es un bump de una línea.
   Subir `pyjwt` toca la verificación de tokens: pide su propia corrida de
   `test_identidad*.py` en serie.

2. **El tope JSON de 2 MiB es un juicio, no una medición de producción.** Se
   eligió mirando el layout por sede (cientos de KB) y verificando que ningún
   body JSON de los tests lo supere. Un layout con más de ~7 000 muebles en una
   sola sede empezaría a rozarlo. Si aparece uno, el número vive en
   `subidas.py::TOPE_JSON` y el middleware acepta el tope por constructor.

3. **`montaje.py` no se modificó.** Delega la foto en
   `mounts.registrar_montaje`, así que hereda el arreglo. Se dejó constancia
   acá para que nadie lo busque en el diff.

4. **`hardening-2` (HSTS spoofeable por `X-Forwarded-Proto`) no estaba
   asignado** y no se tocó. El propio auditor lo evaluó como benigno.

---

## Verificación

Sólo los archivos del territorio y los módulos tocados, con
`TMPDIR=/tmp/pt-backend-hardening`, nunca la suite completa:

```
tests/test_auditoria_hardening.py ....................... 15 passed
tests/test_auditoria_ingresos.py ........................ 17 passed
tests/test_files_acceso.py tests/test_catalogo.py
tests/test_planograms.py tests/test_clientes.py
tests/test_montaje_enlace.py tests/test_mounts.py
tests/test_estado_cuenta.py tests/test_hardening.py ..... 133 passed
+ tests/test_identidad_ataques.py tests/test_plataforma_ataques.py
  tests/test_derechos.py tests/test_alta.py tests/test_bulk_leases.py
  tests/test_claves.py tests/test_consentimiento.py .... 168 passed, 5 xfailed
                                                          (exit 0; los 5 xfail
                                                          son de OTROS auditores
                                                          — en mis dos archivos
                                                          no queda ninguno)
python3 .github/scripts/pip_audit_severity.py --self-test  self-test OK
```

Frontend: no se tocó, no corresponde `tsc`. No se hizo commit ni push. No se
tocó `docs/ESTADO.md`.

### Archivos

* **NUEVO** `backend/app/services/subidas.py` — `leer_con_tope` + `LimiteDeCuerpo`
* `backend/app/main.py` — registro de `LimiteDeCuerpo`
* `backend/app/auth.py` — `token_verifica`
* `backend/app/clientes.py` — `_path_bajo`, `_es_path_de_plataforma`, `_aplicar_estado`, `cliente_del_pedido`
* `backend/app/routers/files.py`, `mounts.py`, `catalogo.py`, `planograms.py`
* `.github/scripts/pip_audit_severity.py`
* `backend/tests/test_auditoria_hardening.py`, `backend/tests/test_auditoria_ingresos.py`
