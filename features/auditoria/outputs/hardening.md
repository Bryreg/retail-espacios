# Auditoría integral — Dimensión 4: OWASP / hardening / deps / config

Agente: auditor (hardening). Rol: **auditor**, no arreglo nada — sólo demuestro.
Archivo de test: `backend/tests/test_auditoria_hardening.py` (9 tests, todos
verdes — ver ejecución al final). TMPDIR propio: `/tmp/pt-hardening`.

## Tabla de hallazgos

| id | severidad | estado | resumen |
|---|---|---|---|
| hardening-1 | **alta** | documentado (no arreglado — auditor) | `await file.read()` / `await foto.read()` bufferizan el cuerpo ENTERO en RAM antes de comparar contra `MAX_FILE_SIZE`/`MAX_PHOTO`: el límite no frena la lectura, sólo rechaza después de haberla completado |
| hardening-1b | **alta** | documentado | Mismo patrón en `mounts.py` (`await foto.read()`) |
| hardening-1c | **alta** | documentado | No existe NINGÚN límite de tamaño de request en toda la app (ni middleware, ni Starlette, ni Render sin nginx delante) — alcanza también a `/api/auth/login` y `/api/auth/oauth`, que corren ANTES de cualquier autenticación |
| hardening-8 | **media** | documentado | `deps-audit.yml` (el gate de CI que debería frenar un PR con una dependencia HIGH/CRITICAL) nunca puede confirmar severidad: `pip_audit_severity.py` intenta leer un score numérico de un vector CVSS textual y siempre falla — el gate corre, no truena nunca, y 20 CVEs reales (varias DoS, coincidentes con hardening-1/1b/1c) pasan con "ninguna HIGH/CRITICAL confirmada" |
| hardening-2 | baja | documentado, sin arreglo necesario | HSTS se puede forzar/omitir vía `X-Forwarded-Proto` spoofeado, pero el impacto es benigno (ver detalle) |
| hardening-9 | baja | documentado | Dockerfile no declara `USER`: el proceso corre como root dentro del contenedor |
| — | — | verificado, sin hallazgo | CORS: origen no listado no se refleja, sin credenciales (hardening-3) |
| — | — | verificado, sin hallazgo | Redacción de dinero: worker no ve `negotiatedValue` en layout; files/mounts no tienen campos de dinero en su schema de salida (hardening-4) |
| — | — | verificado, sin hallazgo | SVG rechazado en mounts, con o sin extensión disfrazada (hardening-5) |
| — | — | verificado, sin hallazgo | Secretos: no hay ninguno que no debería ser público en el repo/bundle (hardening-6) |
| — | — | verificado, sin hallazgo | `npm audit --omit=dev`: 3 moderate, 0 high/critical (hardening-7b) |

---

## hardening-1 / 1b / 1c — DoS: el límite de tamaño no frena la lectura (severidad alta)

**Hipótesis del Maestro, confirmada.** `backend/app/routers/files.py:159-161`:

```python
data = await file.read()
if len(data) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, ...)
```

y `backend/app/routers/mounts.py:170-172`, idéntico patrón. El chequeo de
tamaño llega **después** de que el archivo entero ya está en memoria como
`bytes`. Con `--workers 1` (Dockerfile, `render.yaml` heredado — un solo
proceso uvicorn) y sin ningún proxy delante en Render (a diferencia del VPS
alternativo, ver más abajo), un archivo de varios GB entra entero a RAM antes
de que el 413 tenga oportunidad de cortar nada — el 413 nunca corta el
ataque, sólo lo confirma después de haber pagado el costo.

**Reproducción** (`test_h1_files_lee_el_archivo_completo_antes_de_chequear_el_limite`,
`test_h1b_mounts_lee_la_foto_completa_antes_de_chequear_el_limite`): bajo el
límite en caliente a 100 bytes (monkeypatch de `MAX_FILE_SIZE`/`MAX_PHOTO`) y
subo un archivo de ~2 MB, espiando cuántos bytes pasaron realmente por
`UploadFile.read()` (parcheando `starlette.datastructures.UploadFile.read` —
**ojo**: la clase que instancia el parser de multipart de Starlette es esa,
NO `fastapi.UploadFile`, aunque la segunda herede de la primera; parchear la
de FastAPI no intercepta nada, ver el commit del test). Con el límite en 100
bytes, el servidor de todos modos leyó los **2 097 156 / 2 097 174 bytes
completos** antes de responder 413. Ese es el hueco: no hace falta simular
gigabytes para probar que el corte no existe, sólo demostrar que el 413 llega
DESPUÉS de la lectura completa, sea cual sea el tamaño.

**hardening-1c**: el mismo patrón, generalizado. `grep -rn "content-length\|
max_content\|BodyLimit\|client_max_body" backend/app` no encuentra nada — no
hay ningún límite de tamaño de request en la aplicación FastAPI en sí, para
NINGÚN endpoint (uploads o no). Esto incluye `/api/auth/login` y
`/api/auth/oauth`, que corren antes de cualquier verificación de credencial:
`test_h1c_login_no_tiene_limite_de_tamano_de_body_y_es_pre_auth` manda un
`password` de 5 MB sin ninguna credencial y el servidor lo procesa entero
(401, no 413/422 por tamaño) — un atacante ni siquiera necesita una cuenta
para forzar a Uvicorn a parsear bodies arbitrariamente grandes.

**Por qué es "alta" y no "crítica":** no hay bypass de auth ni fuga de datos
de otro cliente — es DoS por agotamiento de memoria de un único proceso
(`--workers 1`), que el criterio de la spec pone en "alta" ("DoS trivial").

**Nota sobre el VPS alternativo:** `nginx/retail.conf` sí declara
`client_max_body_size 10M` — pero ese despliegue está DESACTIVADO por defecto
(`deploy.yml`: "opt-in... `DEPLOY_TARGET=vps`", nunca configurado, según el
comentario del propio workflow). La producción real es Render
(`render.yaml`, sin nginx propio delante del contenedor), donde este límite
no existe en ninguna capa.

**Arreglo propuesto** (para el builder que el Maestro asigne, NO lo hago yo):
leer en streaming con un tope acumulado (`while chunk := await
file.read(65536): ...; if total > MAX: raise 413` cortando el loop, o usar
`request.headers.get("content-length")` como primer filtro barato — sabiendo
que un `Content-Length` ausente o mentiroso no exime del streaming) en los
tres puntos (`files.py`, `mounts.py`) y considerar `python-multipart>=0.0.27`
(ver hardening-8: ya trae parte de esta defensa en la librería, no hace falta
reinventarla toda a mano) más un middleware global de `Content-Length` para
JSON puro (login/oauth/layout) que corte ANTES de que Starlette arme el body
en memoria.

---

## hardening-8 — El gate de CI de dependencias nunca puede confirmar severidad (severidad media)

`pip-audit -r backend/requirements.txt` (corrido localmente) encuentra **27
avisos en 3 paquetes** (`python-multipart==0.0.20`, `pyjwt==2.9.0`,
`starlette==0.38.6` — este último es una dependencia transitiva de
`fastapi==0.115.0`, no está en `requirements.txt` pero SÍ en lo instalado).
Entre ellos, dos coinciden exactamente con hardening-1/1c:

- `PYSEC-2026-1943` (starlette, fix en 0.40.0): "buffers [multipart fields
  without a filename] in byte strings **with no size limit**" — el mismo
  patrón que ataco arriba, pero en la librería, no sólo en el código de la
  app.
- `PYSEC-2026-3040` (python-multipart, fix en 0.0.31): `Content-Length`
  negativo convierte una lectura acotada en lectura-hasta-EOF — el body
  entero entra a memoria salteándose cualquier límite que dependa de confiar
  en ese header.

`.github/workflows/deps-audit.yml` existe precisamente para frenar esto en un
PR, delegando la severidad a `.github/scripts/pip_audit_severity.py` (OSV no
trae severidad categórica para casi ningún aviso, así que el script intenta
derivarla de un vector CVSS). Pero el vector que OSV expone en
`severity[].score` es el **vector completo** (`"CVSS:3.1/AV:N/AC:L/.../A:N"`),
no un score numérico — y el script hace
`float(vector.rsplit("/", 1)[-1])`, que sobre ese string intenta convertir
`"A:N"` a `float` y siempre lanza `ValueError` (capturado por el `continue`
de más arriba). Resultado: `severidad_de()` devuelve `None` para
absolutamente cualquier aviso que no traiga `database_specific.severity`
(la mayoría, y ninguno de los 20 que trae `requirements.txt` hoy).

**Reproducción** (sonda, no test — depende de red externa a OSV.dev, no
corre en la suite): `pip-audit -r backend/requirements.txt --format json` →
20 vulnerabilidades reales; `python3 .github/scripts/pip_audit_severity.py`
sobre ese JSON imprime, **para las 20**, `"severidad desconocida"` y termina
con exit code 0 y el mensaje textual:

```
20 vulnerabilidad(es) reportada(s) por pip-audit, ninguna HIGH/CRITICAL confirmada -- no se falla el job.
EXIT=0
```

El gate corre en cada PR, nunca truena, y esto pasó inadvertido porque
"nunca falla" es indistinguible de "todo está limpio" hasta que alguien
corre `pip-audit` a mano (como acá).

**Arreglo propuesto**: la severidad CVSS de verdad se calcula del *vector*, no
se lee de él — o se usa una librería (`cvss` en PyPI) para puntuarlo, o se
cambia el criterio a "hay un fix disponible Y la descripción menciona DoS/RCE/
auth bypass" como señal más barata, o —más simple y más alineado con "no
llorar lobo pero tampoco quedarse mudo"— se trata `None` (severidad
indeterminada) como **advertencia que sí se imprime en rojo en el resumen del
job** aunque no lo tumbe, en vez de una línea más de log que nadie mira.
Aparte: actualizar `python-multipart` a `>=0.0.31` y evaluar el salto de
`fastapi`/`starlette` (0.38.6 → una serie con `PYSEC-2026-1943`/`-1941`
resueltos) son, en sí mismos, ítems de hardening independientes de arreglar
el script.

**`npm audit --omit=dev`** (frontend): 3 `moderate`, 0 `high`/`critical` — no
hay nada que reportar ahí; el gate de Node si sirve para lo que promete hoy.

---

## hardening-2 — HSTS confía en `X-Forwarded-Proto` (severidad baja, sin arreglo necesario)

`main.py:332`: `if request.url.scheme == "https" or request.headers.get(
"x-forwarded-proto") == "https":`. Un cliente puede mandar ese header
directamente y forzar/omitir la cabecera HSTS
(`test_h2_hsts_se_puede_forzar_con_un_header_spoofeado`, confirmado: con el
header, la cabecera aparece; sin él, sobre una conexión sin TLS, no aparece).

**Impacto evaluado: benigno.** RFC 6797 §7.2 le exige al *servidor* no mandar
STS fuera de HTTPS, pero es el *navegador* quien decide si la aplica, y
ningún navegador activa HSTS a partir de una respuesta que le llegó por HTTP
plano — sólo la respeta si la conexión de verdad fue TLS. Spoofear el header
logra, como mucho, que el proceso escriba una cabecera de más en una
respuesta que ningún navegador va a tratar como promesa de HSTS. Se
documenta como higiene, no como hallazgo explotable — no amerita un `xfail`
de "arreglar", porque no hay nada que un atacante gane con esto.

## hardening-9 — Dockerfile corre como root (severidad baja)

`Dockerfile` no declara ningún `USER`: el proceso uvicorn corre como root
dentro del contenedor. Defensa en profundidad rota (si alguna vez hay RCE por
otra vía, root en el contenedor es peor que un usuario sin privilegios), pero
sin exploit propio — el `HEALTHCHECK` y el resto de la imagen no dependen de
privilegios elevados. Arreglo propuesto: `RUN useradd -r appuser && chown -R
appuser /app/backend/data` + `USER appuser` antes del `CMD`, cuidando que el
volumen de datos en Render tenga permisos de escritura para ese usuario.

---

## Verificado, sin hallazgo (control positivo — la hipótesis no se sostuvo)

- **CORS** (`test_h3_*`): un origen no listado en `ALLOWED_ORIGINS` nunca
  recibe `Access-Control-Allow-Origin` reflejando su propio valor, ni en un
  GET normal ni en el preflight OPTIONS; no hay `Access-Control-Allow-
  Credentials` en absoluto (coherente con `allow_credentials=False` en
  `main.py:240`).
- **Redacción de dinero** (`test_h4_*`): el worker que lee un layout con un
  fixture con `negotiatedValue=999999` recibe el fixture SIN esa clave; el
  admin la ve completa. `files.py`/`mounts.py` ni siquiera tienen un campo de
  dinero en su `BaseModel` de salida (`SpaceFileOut`, `MountOut`) — no hay
  nada que redactar porque nunca se serializa. `derechos.py::mi_export` SÍ
  expone `monthly_rent`, pero está detrás de `require_owner` (dueño de SU
  cliente), nunca alcanzable por un worker.
- **SVG en mounts** (`test_h5_*`): un SVG con `<script>` se rechaza tanto con
  extensión propia (`.svg`) como disfrazado con extensión `.jpg` pero
  content-type `image/svg+xml` declarado — en el segundo caso gana la
  extensión (`PHOTO_TYPES[".jpg"]`) y se guarda como `image/jpeg` de verdad
  (payload de bytes SVG con content-type servido `image/jpeg`, que ningún
  navegador interpreta como SVG ejecutable). El único vector que quedaba —
  extensión ausente/rara + content-type declarado `image/svg+xml` — ya está
  cerrado porque `mounts.py:158` compara contra `PHOTO_TYPES.values()`
  (no contiene `image/svg+xml`) y no contra un `image/*` genérico.
- **Secretos**: `frontend/.env.local` (con `VITE_FIREBASE_API_KEY` real) NO
  está trackeado por git (`.gitignore`: `.env.*`; `git ls-files | grep -i
  env` no lo lista) y esa clave es pública por diseño de Firebase de
  cualquier forma. `JWT_SECRET` sin configurar cae a
  `"dev-secret-change-me"` **sólo si `RENDER` no está seteado y
  `DATABASE_URL` no es Postgres** — en producción real (Render + Postgres)
  levanta `RuntimeError` en vez de arrancar con el secreto por defecto
  (`auth.py:44-49`, no reproducido de nuevo acá: ya es del alcance de otra
  dimensión/hallazgo previo si existiera).
- **SSRF en correo/montaje** (spec ítem 4): `services/mailer.py` sólo pega a
  hosts fijos en el código (`api.brevo.com`, `api.sendgrid.com`) y a
  `APP_URL`, que es una env var del servidor, nunca un valor que entre desde
  un request — no hay URL controlada por el cliente en ningún llamado de
  red saliente. Verificado por inspección, no ameritó test.

## Sospechas sin confirmar

- **`fastapi==0.115.0` trae `starlette==0.38.6` como transitiva, ausente de
  `requirements.txt`** — el pin explícito de `python-multipart==0.0.20` en el
  comentario del propio `requirements.txt` dice haber cerrado
  CVE-2024-53981, y es cierto para ESA CVE puntual, pero el archivo no fija
  `starlette` y esa versión trae, hoy, sus propios avisos DoS activos
  (`PYSEC-2026-1943`/`-1941`, ver hardening-8). No alcancé a confirmar si
  actualizar `fastapi` a una serie más nueva arrastra sin fricción los
  routers actuales (querystring/form parsing cambia de comportamiento entre
  versiones de Starlette) — queda para quien encare el arreglo de
  hardening-1/hardening-8, no lo pruebo yo por no tocar código de producción.
- No alcancé a auditar `docker-compose.prod.yml`/`nginx/retail.conf` más allá
  de lo citado arriba (el despliegue VPS está apagado por defecto según
  `deploy.yml`, así que le puse menos tiempo que a Render, que es la
  producción real).

---

## Ejecución (SOLO este archivo, TMPDIR propio)

```
$ cd backend && TMPDIR=/tmp/pt-hardening python -m pytest -q tests/test_auditoria_hardening.py
.........                                                                [100%]
9 passed
```

## Deps (sondas fuera de pytest — no determinísticas, dependen de red)

```
$ pip-audit -r backend/requirements.txt
Found 27 known vulnerabilities in 3 packages (python-multipart, pyjwt, starlette)

$ cd frontend && npm audit --omit=dev
# 3 moderate, 0 high, 0 critical

$ python3 .github/scripts/pip_audit_severity.py <audit.json>
20 vulnerabilidad(es) reportada(s) por pip-audit, ninguna HIGH/CRITICAL confirmada -- no se falla el job.
(exit 0 — ver hardening-8)
```
