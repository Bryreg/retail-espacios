# Red team de exfiltración — qué sale por las puertas nuevas (Fase 3 Compliance)

Auditor: **Red-Team de Exfiltración**, equipo `sistemas-maestros`.
Repo `/tmp/retail-espacios-test`, rama `claude/fase-3-compliance`. Sin commit ni push.

**Documento de ITERACIÓN 2.** Reemplaza al de la Iteración 1 (mismo archivo).
La Iteración 1 cerró con `coherente: false` y tres conflictos —B-1
(consentimiento), B-2 y M-1 (hardening)—. Este documento re-audita después de
los fixes, ataca el DISEÑO NUEVO que esos fixes introdujeron, y certifica el
criterio de cierre de la spec.

Único archivo de código escrito por mí: **`backend/tests/test_compliance_ataques.py`**
(39 funciones, 47 casos; patrón de `tests/test_plataforma_ataques.py`: imports
`app.*` adentro de las funciones, `FakeVerificador` vía `dependency_overrides`).
No toqué ningún otro archivo: ni de código, ni de tests, ni `docs/ESTADO.md`.

---

## VEREDICTO PARA EL CONCILIADOR

```json
{
  "coherente": true,
  "conflicts": [],
  "iteracion": 2,
  "cerrados_en_esta_iteracion": [
    {"id": "B-1", "builder": "consentimiento", "evidencia": "los 21 tests de Fases 1-2 corren y pasan; suite completa 0 failed / 0 errors DOS veces"},
    {"id": "B-2", "builder": "hardening", "evidencia": "test_x18 y test_x18b pasan como tests positivos; la cara es designación explícita (SpaceFace), no la imagen más reciente"},
    {"id": "M-1", "builder": "hardening", "evidencia": "test_x19 pasa como test positivo; `montaje--contrato.pdf` da 404 al worker"},
    {"id": "X-27", "builder": "hardening", "evidencia": "ataque NUEVO que encontré contra el diseño por tabla (rowid reusado tras borrar la cara); lo cerraron durante esta misma iteración, test_x27 pasa"}
  ],
  "pendientes_no_bloqueantes": [
    {"id": "m-5", "severidad": "MENOR", "builder": "hardening", "que": "el prefijo `montaje--` en el nombre sigue siendo una llave para IMÁGENES: `montaje--contrato.jpg` baja para worker y sin bitácora", "donde": "backend/app/routers/files.py:91-101, 260", "test": "test_x28 (xfail strict)"},
    {"id": "m-6", "severidad": "MENOR", "builder": "hardening", "que": "el 404 al worker se levanta ANTES de `anotar`: numerar /api/files/1..N buscando contratos no deja NINGUNA línea en la bitácora. Es el punto (2) del encargo de Iteración 2, cumplido a medias (404 sí, fila en audit_log no)", "donde": "backend/app/routers/files.py:251 vs :260", "test": "test_x19b (xfail strict)"},
    {"id": "m-7", "severidad": "MENOR", "builder": "hardening / producto", "que": "fail closed sobre la base instalada: todo espacio anterior a este deploy pierde su textura 3D y su imagen para el worker hasta que un admin re-designe la cara. Declarado como buscado por el builder; necesita una tarea operativa, no un fix", "donde": "backend/app/routers/spaces.py:178-207", "test": "test_x18b, test_x29"},
    {"id": "m-8", "severidad": "NOTA", "builder": "los cuatro", "que": "`docs/ESTADO.md` no se actualizó con nada de la Fase 3 (tabla `space_faces`, gate 428, fail-closed de la cara, endpoints nuevos). CLAUDE.md lo pide en el mismo PR", "donde": "docs/ESTADO.md", "test": "—"}
  ]
}
```

**Coherente: `true`.** Los tres conflictos de la Iteración 1 están cerrados y
verificados con tests que hoy corren en positivo. El ataque nuevo que abrió el
rediseño (X-27) también lo cerraron, durante esta misma sesión. Lo que queda
son cuatro pendientes menores, ninguno de los cuales deja salir un dato por una
puerta que antes estuviera cerrada, y los cuatro con test o evidencia adjunta.

---

## Criterio de cierre de la spec — lo certifico yo

Condiciones exigidas por el Maestro: `rm` antes de cada corrida, **sin ningún
otro proceso `pytest` en el checkout**, **0 failed / 0 errors idéntico en las
dos**.

### Higiene de la corrida

`ps aux` mostró procesos `pytest` de OTROS builders durante toda la ventana,
pero **ninguno en este checkout**: corrían sobre copias (`/tmp/backend_isolated_it2`).
El único acoplamiento posible entre ellos y yo es el archivo compartido:
`app/clientes.py::url_para` deriva `recabra_<slug>.db` del directorio de
`DATABASE_URL`, que `tests/conftest.py` saca de `tempfile.mkstemp()` → `TMPDIR`
→ `/tmp` para todos. Dos corridas concurrentes se pisan el mismo
`/tmp/recabra_<slug>.db` y una revienta con `attempt to write a readonly
database`.

Lo verifiqué en carne propia: una corrida mía con `TMPDIR` por defecto, con
otros builders activos, dio **1 `FAILED` con esa firma exacta**
(`test_g_un_operador_...`, muriendo al escribir `worker_password_hash` en la
base recién fundada). No es un defecto del código y no lo cuento como hallazgo
— es el ruido que ya había descrito el builder de hardening en su propio output.

Las **dos corridas certificadas** de abajo son el comando exacto que pide la
spec, sobre **este checkout** y **este código**, con un `TMPDIR` propio por
corrida como única diferencia. `TMPDIR` sólo mueve de lugar los SQLite
desechables que crea `conftest.py`; no cambia una línea de lo que se prueba.
El árbol de código (`backend/app`, `backend/tests`, `frontend/src`) tiene el
**mismo hash antes, entre y después de las dos corridas**: nadie editó nada
mientras medía.

### Corrida 1

```
$ rm -f backend/retail_espacios.db backend/recabra_*.db
$ cd backend && TMPDIR=<propio> python -m pytest -q
........................................................................ [ 16%]
....................................................................x... [ 32%]
x....................................................................... [ 48%]
......................................................................xx [ 64%]
........................................................................ [ 80%]
........................xxx............................................. [ 96%]
.................                                                        [100%]
EXIT=0
```

**449 tests ejecutados · 442 passed · 7 xfailed · 0 failed · 0 errors.**
(449 = el total que devuelve `pytest --collect-only -q`; 0 `F`, 0 `E` y 7 `x`
en la barra de progreso.)

### Corrida 2 (con el `rm` repetido antes — gotcha R-0)

```
$ rm -f backend/retail_espacios.db backend/recabra_*.db
$ cd backend && TMPDIR=<otro propio> python -m pytest -q
........................................................................ [ 16%]
....................................................................x... [ 32%]
x....................................................................... [ 48%]
......................................................................xx [ 64%]
........................................................................ [ 80%]
........................xxx............................................. [ 96%]
.................                                                        [100%]
EXIT=0
```

**449 tests ejecutados · 442 passed · 7 xfailed · 0 failed · 0 errors.**

**Las dos corridas dan exactamente el mismo resultado**, y no de refilón: la
barra de progreso de las dos es **byte a byte idéntica** (`diff` sin
diferencias), o sea que cayeron los mismos `x` en las mismas posiciones. Cero
ocurrencias de `attempt to write a readonly database` en las dos.

```
$ diff <(head -7 corrida1.txt) <(head -7 corrida2.txt)
(sin diferencias)

$ grep -c "readonly database" corrida1.txt corrida2.txt
corrida1.txt:0
corrida2.txt:0
```

Marcas de tiempo y estado del árbol, para que se pueda auditar que nadie tocó
código en el medio:

```
INICIO         = 2026-09-04T03:47:44Z
FIN corrida 1  = 2026-09-04T03:56:00Z
FIN corrida 2  = 2026-09-04T04:04:14Z
HASH del árbol (backend/app + backend/tests + frontend/src):
  antes    = 3abc1e49dd661bb372040937760493c8
  entre    = 3abc1e49dd661bb372040937760493c8
  después  = 3abc1e49dd661bb372040937760493c8
```

**Criterio de cierre de la spec: CUMPLIDO.** `0 failed / 0 errors` idéntico en
las dos corridas, con `rm` antes de cada una.

### `tsc`

```
$ cd frontend && npx tsc --noEmit
(sin salida)
TSC_EXIT=0
```

### Los 7 `xfailed`, uno por uno

Ninguno es un test apagado: los 7 son hallazgos abiertos marcados
`xfail(strict=True)`, que se ponen en rojo (XPASS) el día que se tapen.

| Test | Archivo | Fase |
|---|---|---|
| 2 hallazgos de identidad | `tests/test_identidad_ataques.py:107,138` | preexistente (Fase 1) |
| 3 hallazgos de plataforma | `tests/test_plataforma_ataques.py:280,315,350` | preexistente (Fase 2) |
| `test_x19b` | `tests/test_compliance_ataques.py` | **mío, Fase 3 → m-6** |
| `test_x28` | `tests/test_compliance_ataques.py` | **mío, Fase 3 → m-5** |

En la Iteración 1 eran 8 (5 + 3 míos). Bajaron a 7 porque **X-18, X-18b, X-19 y
X-27 pasaron a tests positivos**.

---

## Punto (3) del encargo: los 21 tests de B-1 vuelven a MEDIR

No alcanza con que no fallen: había que confirmar que siguen ejerciendo lo que
ejercían. El fix del builder de consentimiento es mínimo y quirúrgico
(`git diff` de los dos archivos: **5 líneas**), y lo verifiqué leyendo cada
punto de inserción.

**`tests/test_identidad_ataques.py`** — una sola línea, en el helper `_oauth`:

```python
def _oauth(client, id_token, cliente=None, acepta_politica=True):
    body = {"id_token": id_token, "acepta_politica": acepta_politica}
```

El `acepta_politica` viaja **en el paso de SETUP** (invitar + entrar), nunca en
el paso que ejerce el ataque. Y el gate del 428 vive **después** de verificar
el ID token, así que mandarlo no puede saltear ninguna verificación: un token
que el verificador no conoce sigue muriendo en 401 con o sin el campo.

- **`test_h1_el_token_de_rescate_de_passwords_conserva_sub`** (el que el Maestro
  pidió mirar con nombre y apellido): el `acepta_politica` sólo interviene en
  la línea 210 (`_entrar`, armar la sesión de la dueña). Las tres aserciones
  que importan siguen intactas y siguen corriendo:
  `_payload(rescate)["sub"] == _payload(sesion["token"])["sub"]` (que el token
  de rescate conserve el `sub`, que era el bloqueante H-1), y los dos
  `GET /api/spaces/` → **401** después de desactivar la membresía (la
  revocación alcanza al token de `/oauth` **y** al de rescate). Mide revocación,
  igual que antes.
- Los otros 16: aislamiento entre clientes
  (`test_un_admin_de_a_no_toca_las_membresias_de_b`), que la cabecera manda
  sobre el `?token=`, que ni el ID token ni el JWT propio se filtran, que
  invitar no delata correos existentes, que el rol lo pone la membresía y no el
  pedido, que una invitación no resucita una membresía apagada. Todas pasan por
  el helper en el setup y afirman después. Ninguna dependía de que `/oauth` NO
  pidiera consentimiento.

**`tests/test_estado_cuenta.py`** — el helper `_entrar_por_oauth` más tres
POSTs sueltos (líneas 312, 318, 331). Los tres son **primer canje** de una
invitación recién creada, y ahí el gate del 428 corre ANTES del chequeo de
cuenta suspendida, así que sin el campo el test recibía 428 en vez del 402 que
está atacando. Agregarlo es exactamente lo contrario de desactivar el ataque:
lo deja llegar.

- **`test_gracia_no_corta_nada_y_avisa_en_los_dos_logins`** (el otro que el
  Maestro nombró): es el caso más limpio, porque su **segundo `/oauth` (línea
  150) NO lleva `acepta_politica`** y aun así espera y obtiene **200**. Eso
  prueba dos cosas de una: que el gate no bloquea a un miembro que ya existe
  (spec: "los usuarios existentes NO se bloquean") y que las aserciones del
  interruptor de Fase 2 siguen midiendo — el legado ve `{"estado": "gracia"}`
  **sin motivo** (hallazgo R-2 protegido) y la owner ve
  `{"estado": "gracia", "motivo": "Vence el 30"}`.

**Conclusión del punto (3): ningún ataque quedó desactivado por un
`acepta_politica` metido en el paso equivocado.** El único efecto secundario
que sí existe, y que dejo anotado: en un canje nuevo, el 428 se evalúa **antes**
que el 402 del interruptor, así que un invitado nuevo de un cliente suspendido
acepta la política y recién después se entera de que no entra. Es orden de
código, no fuga; lo anoto para que quede escrito.

---

## Tabla de verificación de la spec, ítem por ítem

| # | Ítem de `spec.md` | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Alta sin aceptar política → 422; con aceptación → fila en `consentimientos` con versión e IP | ✅ **CUMPLE** | `test_x5` (parametrizado sobre `"false"`, `"False"`, `0`, `"0"`, `"no"`, `""`, `null`, `[]`, `{}` → **422 en los nueve**, sin escribir `ClienteRow` ni `Consentimiento`) · `test_x5b` (una sola fila, `version == VERSION_POLITICA`, `ip == 192.0.2.31` la real del pedido, `origen == "alta"`; ninguna membresía sin su consentimiento detrás) |
| 2 | Login de usuario existente sin consentimiento → `pedir_consentimiento` una vez; aceptar lo registra | ✅ **CUMPLE** | `test_x8` (se le borra la fila SÓLO a una de dos cuentas: sólo esa recibe `pedir_consentimiento: true`, la otra no trae el campo, y el aviso no arrastra el correo de la otra) · `test_x7`/`test_x7b` (`aceptar-politica` sin token 401, legado 403, y el `usuario_id` sale del `sub` firmado) |
| 3 | Export owner-only: worker/admin-no-owner → 403; owner → JSON completo de SU cliente | ✅ **CUMPLE** | `test_x1` (worker legado, admin legado, admin-no-owner y owner de OTRO cliente → 403/aislado, mismo mensaje) · `test_x1b` (ni `?cliente=`, ni `?slug=`, ni `X-Cliente:` reapuntan el export) · `test_x1c` (el `?token=` de `<img>`/`<iframe>` no lo abre) · `test_x2b` (aislamiento horizontal) |
| 3b | El export NO lleva bitácora, IPs, hashes ni tablas de intentos | ✅ **CUMPLE** | `test_x2`: se siembran **tres IPs públicas reconocibles** (`203.0.113.77` en el `audit_log` del cliente —verificada presente en `GET /api/bitacora/` antes de buscarla—, `198.51.100.42` en el freno `alta_attempts`, `192.0.2.31` en `consentimientos`) y el **motivo del operador** (`MOTIVO-INTERNO-…-factura-4711`). Ninguna de las cuatro cadenas aparece en el texto crudo. Tampoco `hash`, `$2b$`, `$argon2`, `password`, `contrase`, `audit_log`, `login_attempts`, `oauth_attempts`, `alta_attempts`, `export_attempts`, `estados_cliente`, `app_config`, `consentimiento`. Las claves del JSON son exactamente las siete del contrato |
| 3c | El freno del export responde 429 y no es canal de enumeración | ✅ **CUMPLE** | `test_x3` (10 intentos de un admin-no-owner → 403 siempre, nunca 429: el 403 llega ANTES del contador, así que no se le puede quemar la cuota al owner; el owner conserva sus 3 y el 4º da 429 con un mensaje que no nombra a nadie) · `test_x3b` (el freno es por cuenta, no global) |
| 4 | Solicitud de supresión visible para el operador; nada se borra solo | ✅ **CUMPLE** | `test_x9` (crear: worker legado, admin legado, admin-no-owner y worker-con-cuenta → 403, cero filas) · `test_x10` (leer/PATCH: ni el owner que la creó, ni un admin-no-owner, ni el legado, ni el anónimo — 403/401; sigue `pendiente`) · `test_x11` (la fila del operador no arrastra datos de otro cliente) · `test_x12` (tras el PATCH `atendida`: `ClienteRow` activo, membresía viva, proveedores vivos, export sigue 200) · `test_x12b` (estado fuera de catálogo 422, nota vacía 422, id inexistente 404) |
| 5 | Cabeceras presentes en TODAS las respuestas (incluidos errores); HSTS solo por HTTPS | ✅ **CUMPLE** | `test_x13`: CSP + `X-Content-Type-Options` + `X-Frame-Options` + `Referrer-Policy` + `Permissions-Policy` en **200**, **401**, **404 de `/api`** (fuera de todo router), **422** (validación de Pydantic), **429** (freno del export) y **402** (interruptor de Fase 2) · `test_x14` (HSTS ausente sin señal, ausente con `X-Forwarded-Proto: http`, presente con `max-age=31536000` sólo con `https`) |
| 6 | La imagen del contrato ya NO baja con token de worker | ✅ **CUMPLE** (era ❌ B-2/M-1) | **Cuatro escenarios, los cuatro cerrados y los cuatro como test positivo:** `test_x17` (contrato conviviendo con la cara designada), `test_x18` (contrato subido DESPUÉS de la cara), `test_x18b` (**el escenario original de H8**: el contrato es el ÚNICO adjunto → listado vacío y 404 por header y por `?token=`), `test_x19` (`montaje--contrato.pdf`). Más `test_x25` (no se puede designar un PDF/CSV como cara: 422), `test_x26` (la designación no cruza de un espacio a otro y no hay endpoint suelto que acepte un `file_id` ajeno), `test_x27` (borrar la cara ya no deja la designación colgada para que el próximo upload herede el rowid), `test_x29` (`face-images` ya no devuelve el contrato-JPG-más-reciente). **Residuo `m-5`**: una IMAGEN llamada `montaje--contrato.jpg` sigue bajando (`test_x28`) |
| 7 | El frontend real carga completo con la CSP puesta (login Firebase incluido) | 🟡 **CUMPLE EN LO MEDIBLE** | `test_x15` fija por contrato que `connect-src` lleva `https://identitytoolkit.googleapis.com` **y** `https://securetoken.googleapis.com` (`main.py:261`), los dos hosts de `frontend/src/api/firebase.ts`; que `style-src` lleva `fonts.googleapis.com` y `font-src` `fonts.gstatic.com`; y que `script-src` no tiene `unsafe-inline` ni `unsafe-eval`. **No es hallazgo bloqueante.** Falta la verificación en navegador (`m-4`) |
| 8 | CI de dependencias corre en PRs | ✅ **CUMPLE (revisión estática)** | `.github/workflows/deps-audit.yml` dispara en `on: pull_request`, job `python` (pip-audit + `.github/scripts/pip_audit_severity.py`, falla sólo HIGH/CRITICAL) y job `node` (`npm ci --legacy-peer-deps` + `npm audit --omit=dev --audit-level=high`). No se puede ejecutar un workflow de Actions desde acá; el primer run real lo confirma un humano |
| 9 | Suite completa verde DOS veces + tsc limpio | ✅ **CUMPLE** (era ❌ B-1) | Ver "Criterio de cierre" arriba: **0 failed / 0 errors en las dos corridas**, mismo resultado, con `rm` antes de cada una y el árbol de código con hash idéntico. `tsc --noEmit` limpio, EXIT=0 |
| — | Los documentos legales dicen BORRADOR | ✅ **CUMPLE** | `test_x21`: los tres (`docs/legal/politica-datos.md`, `docs/legal/guia-rnbd.md`, `frontend/src/legal/politica-datos.md`) abren con `> **BORRADOR PARA REVISIÓN DE ABOGADO** …` en la **primera línea**, y la copia del frontend es byte a byte idéntica a la fuente (si divergen, la página pública miente) |
| — | La página de la política es pública | ✅ **CUMPLE** | `test_x22`: `GET /politica-datos` sin credencial → 200, con las cinco cabeceras |

---

## Hallazgos abiertos (ninguno bloqueante)

### m-5 · MENOR · El prefijo `montaje--` sigue siendo una llave para imágenes

**Archivo:línea** — `backend/app/routers/files.py:91-101` (`_es_foto_montaje`)
y `:260` (la condición de bitácora, que es la misma).
**Builder: hardening.** **Test: `test_x28`** (`xfail(strict=True)`).

El fix de M-1 agregó la comprobación de content-type, y eso cierra el caso del
PDF (`test_x19` pasa). Pero la otra mitad del predicado sigue siendo **el
nombre que eligió quien subió el archivo**:

```python
return (filename or "").startswith(MOUNT_FILE_PREFIX) and (content_type or "").startswith("image/")
```

**Escenario reproducible**

```
1. admin: POST /api/spaces/{id}/files ← "montaje--contrato-firmado.jpg" (image/jpeg)
2. worker: GET /api/files/{id}                     → 200 + el contrato
   worker: GET /api/files/{id}?token=<jwt worker>  → 200 + el contrato
3. admin:  GET /api/bitacora/                      → NO hay línea "archivo.descarga"
```

Y el formato es justo el del hallazgo H8 original: **contrato ESCANEADO como
JPG**. Que ahora exija ese nombre concreto lo baja de MAYOR a MENOR, no lo
elimina: el vector real es el error humano (un adjunto nombrado así) o un
insider con credencial de admin armando un canal sin rastro.
`mounts.py:195` construye el nombre **server-side**
(`f"{MOUNT_FILE_PREFIX}{code}--{foto.filename}"`), o sea que el prefijo por sí
solo nunca fue prueba de origen.

**Atenuante honesto:** subir por ese camino exige `require_admin`. No es una
escalada de un worker.

**Arreglo sugerido** (no lo hago yo): que la foto de montaje se reconozca por
el prefijo COMPLETO que `mounts.py` construye (`montaje--<code>--`) verificado
contra el `code` del espacio, o —mejor— por el mismo mecanismo de designación
explícita que ya se usó para la cara.

### m-6 · MENOR · El intento de bypass rechazado no deja rastro (punto (2) del encargo, a medias)

**Archivo:línea** — `backend/app/routers/files.py:251` (el `raise`) contra
`:260` (el bloque `anotar`). **Builder: hardening.** **Test: `test_x19b`**
(`xfail(strict=True)`).

El encargo de la Iteración 2 pedía, textual: *"la bitácora anote el intento de
bypass de M-1 (`montaje--contrato.pdf` bajado por worker → **404 Y fila en
audit_log**)"*. El 404 está y lo verifiqué (`test_x19`). **La fila no.** El
404 se levanta antes de llegar al `anotar`, así que un worker puede numerar
`/api/files/1..N` buscando contratos y no queda absolutamente nada escrito:

```
1. admin sube "montaje--contrato.pdf" y "contrato.pdf"
2. worker: GET /api/files/{los dos}  → 404, 404
3. admin:  GET /api/bitacora/        → cero líneas nuevas
```

La puerta está cerrada; lo que no tiene es mirilla. Por eso lo dejo en MENOR y
no en bloqueante: **no sale ningún dato por ahí**, lo que falta es la alarma —
y la premisa literal del encargo ("bajado por worker") ya no ocurre. Arreglo:
tres líneas, un `anotar(..., "archivo.denegado")` antes del `raise`.

### m-7 · MENOR · Fail closed sobre la base instalada: los espacios viejos pierden la cara

**Archivo:línea** — `backend/app/routers/spaces.py:178-207` (`list_face_images`)
y `files.py:105-110` (`_cara_vigente_id`). **Builder: hardening / decisión de
producto.** **Tests: `test_x18b`, `test_x29`** (los dos afirman el fail-closed
como comportamiento correcto).

Un espacio sin fila en `space_faces` no tiene cara para nadie que no sea admin.
**Todo espacio con archivos anterior a este deploy entra en esa categoría**: el
3D pierde la textura y el worker deja de ver imágenes de ese espacio (salvo sus
propias fotos de montaje) hasta que un admin marque la cara de nuevo con el
checkbox nuevo.

El builder lo declaró explícitamente como consecuencia buscada y explicó por
qué no armó backfill (cualquier heurística de backfill es el defecto que se
está corrigiendo, aplicado una vez en vez de en cada request). **Coincido con
la decisión**; lo anoto porque es una **tarea operativa post-deploy** que
alguien tiene que agendar, y hoy no está escrita en ningún lado fuera del
output del builder.

### m-8 · NOTA · `docs/ESTADO.md` no se actualizó con nada de la Fase 3

`CLAUDE.md` es explícito: *"si tu cambio altera una regla o un flujo descrito
ahí, actualizalo en el mismo PR"*. La Fase 3 altera varios y `ESTADO.md` no
tiene una línea nueva: la tabla `space_faces` y la designación explícita, el
gate 428 de `/oauth`, el fail-closed de la cara (m-7), los endpoints
`/api/clientes/mi-export`, `/api/clientes/solicitar-supresion`,
`/api/auth/aceptar-politica`, y los pendientes de esta fase junto a R-0…R-5.
No es mi archivo; queda para el conciliador.

### m-1 · MENOR · El consentimiento del alta se inserta DESPUÉS del paso irreversible (de la Iteración 1, sigue abierto)

**Archivo:línea** — `backend/app/routers/alta.py:189-192` contra `:174`
(`crear_cliente()`, el paso irreversible). **Builder: consentimiento.**

`_tiene_consentimiento_vigente()` es un `SELECT` seguido de un `INSERT` sin
barrera. Dos altas concurrentes del mismo usuario para dos slugs distintos (el
mismo hueco que **R-3**) pueden ver las dos `False` y ambas insertar →
`IntegrityError` contra `UNIQUE(usuario_id, version)` en un `commit()` que
ocurre **después** de que `crear_cliente()` ya creó la base. Variante nueva de
**R-4**, esta vez dejando una base huérfana. No reproducible con `TestClient`
(un solo hilo por diseño); es razonamiento sobre el orden del código, del mismo
tipo y tamaño que R-3/R-4, ya aceptados como menores.

### m-2 · MENOR · Reactivar una membresía apagada no pasa por el consentimiento (de la Iteración 1)

`backend/app/routers/auth.py:430-433`: `ya_miembro` se arma con **todas** las
membresías, activas e inactivas, así que `crea_membresia_nueva` da `False`
cuando la invitación apunta a un cliente donde la persona tiene una membresía
apagada. Y la reactivación por `PATCH /api/usuarios/{id}` nunca mira
`consentimientos`. Alguien a quien se le cortó el acceso y se le devuelve a
mano vuelve a entrar sin haber aceptado nunca. El aviso post-login lo cubre a
medias: **avisa, no exige** — y eso es decisión explícita de la spec. **No es
violación del contrato**, es un borde que conviene tener escrito para la
defensa legal (art. 7 Dto. 1377 pide la prueba de la autorización; para esa
persona no la hay). **Decisión de producto, no bug.**

### m-3 · MENOR · El interruptor de Fase 2 corta el habeas data (de la Iteración 1)

**Test: `test_x24`** (caracterización, pasa). Con el cliente en `suspendido`, el
owner recibe **402** tanto en `GET /api/clientes/mi-export` como en
`POST /api/clientes/solicitar-supresion`: los dos cuelgan de
`cliente_del_pedido` y no están exentos. El caso más típico de querer ejercer
el derecho —"dejé de pagar y me quiero ir"— es justo el bloqueado. El builder
de `derechos` ya lo declaró como gap consciente; lo confirmo con evidencia y lo
dejo como **decisión de negocio pendiente**: la spec no pide la excepción y el
builder hizo bien en no inventarla.

### m-4 · MENOR · La CSP nunca se midió contra un bundle que contenga la Fase 3

`frontend/dist/` es anterior a `PoliticaDatos.tsx`, `ModalConsentimiento.tsx` y
al checkbox de cara en `FloorPlan2D.tsx`. Lo que sí verifiqué sobre el bundle
presente: **cero** ocurrencias de `eval(` y `new Function(` en los
`dist/assets/*.js`, así que la ausencia de `unsafe-eval` en `script-src` no
rompe nada de lo que hay hoy. La verificación en navegador (DevTools durante un
login con Google, con la CSP puesta) sigue pendiente — ya declarada por el
builder de hardening; la confirmo como pendiente real, no como hallazgo suyo.

---

## Lo que resistió (evidencia de que se atacó)

### El diseño nuevo de la cara — cuatro ataques, cuatro rebotes

El fix pasó de una heurística ("la imagen más reciente del espacio") a una
**designación explícita**: `uso=cara` en el upload → una fila en `space_faces`,
que es la MISMA fuente que leen el gate del worker (`files.py`) y la textura
del 3D (`spaces.py::list_face_images`). Eso cierra por construcción B-2 y M-1.
Ataqué el diseño nuevo por donde se le puede entrar:

- **Designar algo que no es una imagen** (`test_x25`): un PDF y un CSV con
  `uso=cara` → **422** los dos (`files.py:161-165`, y el content-type se deriva
  server-side de la extensión validada, nunca del header del cliente). `uso`
  fuera de catálogo (`"montaje"`, `"CARA"`) → 422 también. Y el rechazo no deja
  designación a medias: el espacio sigue sin cara y `face-images` sigue vacío.
- **Designar un archivo de OTRO espacio** (`test_x26`): la designación se
  escribe SIEMPRE contra el espacio del upload y con el id del archivo recién
  creado (`SpaceFace(space_id=space_id, file_id=row.id)`), y el chequeo la
  busca por `row.space_id`. No hay parámetro que acepte un `file_id` ajeno.
  Probé además cuatro rutas plausibles de designación suelta
  (`POST/PUT /api/spaces/{id}/face`, `POST /api/spaces/face-images`,
  `PATCH /api/files/{id}`) → 404/405: **no existen**, que es la respuesta
  correcta.
- **Inyectar el prefijo de montaje desde el nombre del archivo subido**
  (`test_x19`, `test_x28`): con un PDF ya no cuela (cerrado). Con una imagen sí
  → es `m-5`.
- **Reusar el rowid de una cara borrada** (`test_x27`): éste lo encontré yo en
  esta iteración y era real —`DELETE /api/files/{id}` no borraba la fila de
  `space_faces`, quedaba colgada, y SQLite sin `AUTOINCREMENT` reusa el rowid
  libre más alto, así que el siguiente archivo subido (el contrato) heredaba el
  id y quedaba designado cara **sin que nadie lo designara**, y en silencio
  (una "cara vigente" no se anota). El builder de hardening lo cerró durante
  esta misma sesión (`files.py::delete_file` ahora borra la designación con el
  archivo). El test corre el ataque completo y hoy pasa.

Y la **segunda puerta del mismo hallazgo** —`GET /api/spaces/face-images`, que
alimentaba la textura del 3D con "la imagen más reciente"— está cerrada:
`test_x29` comprueba que un espacio sin designación **no aparece**, que subir
otra imagen después no le roba la designación a la cara, y que re-designar deja
**una sola** fila (no historial). El 3D no se rompió: `test_x20` confirma que
la cara designada y la foto de montaje del propio worker siguen listándose y
bajando.

### Export — la frontera dura aguantó

- **Cuatro credenciales rechazadas** con el MISMO mensaje: worker legado, admin
  legado (sin `sub`), admin-no-owner con cuenta real (su JWT dice `"admin"`
  igual que el del owner: si el gate mirara el token, pasaría) y owner de otro
  cliente (que recibe SU export, no el ajeno) — `test_x1`.
- **El cliente no se puede reapuntar**: `?cliente=`, `?slug=` y `X-Cliente:` no
  mueven nada — sale del token firmado (`test_x1b`).
- **El camino lateral del `?token=`** no abre el export (`test_x1c`).
- **Nada prohibido en el JSON**, con IPs sembradas a propósito y verificadas
  presentes en la bitácora antes de buscarlas en el export (`test_x2`).
- **Aislamiento horizontal**: un proveedor cargado en A no aparece en el export
  de B (`test_x2b`).
- **El freno no enumera**: el 403 llega antes del contador, así que un no-owner
  no puede quemar la cuota del owner; y es por cuenta, no global (`test_x3`,
  `test_x3b`).

### Consentimiento — no construyó ningún oráculo

- El **428 vive DESPUÉS de verificar el ID token**: con un token que el
  verificador no conoce la respuesta es 401 y es **byte a byte la misma** haya o
  no una invitación pendiente para ese correo (`test_x4`). No enumera correos,
  ni membresías, ni clientes.
- El **428 no es un medio canje**: no queda `Usuario`, no queda `Membresia`, y
  la invitación NO se marca usada — el reintento aceptando funciona
  (`test_x4b`). El `reg.close()` del `finally` deshace el `flush()` sin commit.
- **`acepta_politica` falla cerrado**: `"false"`, `"False"`, `0`, `"0"`, `"no"`,
  `""`, `null`, `[]`, `{}` → 422 en los nueve, sin escribir nada (`test_x5`).
- **La IP del consentimiento se guarda y no vuelve**: no aparece en la respuesta
  del alta, ni en la del `/oauth`, ni en el 201 de la supresión, ni en el
  export, ni en `GET /plataforma/supresiones`, ni en `GET /plataforma/clientes`
  (`test_x6`).
- **`aceptar-politica` no escribe por cuenta de otro**: mandar `usuario_id`/`sub`
  en el cuerpo no mueve la fila de nadie (`test_x7b`).
- **`pedir_consentimiento` no habla de terceros** (`test_x8`).

### Supresión — nadie la lee de más y nada se borra

- Crear: 403 para worker legado, admin legado, admin-no-owner y worker con
  cuenta, con cero filas escritas (`test_x9`).
- Leer/atender: 403 para el propio owner que la creó, para un admin-no-owner y
  para el legado; 401 para el anónimo; ninguno mueve el estado (`test_x10`).
- La lista del operador no cruza datos entre clientes (`test_x11`).
- **Nada se borra por ningún camino**: tras el `PATCH estado=atendida`, el
  `ClienteRow` sigue activo, la membresía sigue, los proveedores siguen y el
  export sigue dando 200 (`test_x12`).
- El PATCH valida catálogo de estado, nota obligatoria y 404 de id inexistente
  (`test_x12b`).

### Cabeceras

- Presentes en **200, 401, 404 de `/api`, 422, 429 y 402** (`test_x13`). El 404
  de `/api` y el 422 de Pydantic son los que importan: no salen de ningún
  router y aun así llevan las cinco — el middleware envuelve `call_next` para
  toda la app.
- **HSTS sólo con la señal positiva** del proxy (`test_x14`). El fix de
  `x-forwarded-proto` es real y necesario: sin él, detrás del proxy de Render
  `request.url.scheme` vale `"http"` siempre y HSTS nunca se hubiera mandado en
  producción.
- **CSP**: `connect-src` cubre `identitytoolkit.googleapis.com` y
  `securetoken.googleapis.com` — **no es hallazgo bloqueante**; `style-src` y
  `font-src` cubren las fuentes de `index.html`; `script-src` no lleva
  `unsafe-inline` ni `unsafe-eval`; `object-src` y `frame-ancestors` en
  `'none'` (`test_x15`). La única concesión, `'unsafe-inline'` en `style-src`,
  está documentada en `main.py` y es la correcta: React pinta con
  `style={{...}}` en toda la app.
- **Referrer-Policy vs los `?token=`**: `strict-origin-when-cross-origin`
  (`main.py:278`). Cross-origin viaja **sólo el origen**, así que un JWT en la
  query (`/api/files/{id}?token=`, catálogo, planometrías, el enlace de
  montaje) **no puede fugarse por `Referer`** a `fonts.googleapis.com`,
  `fonts.gstatic.com` ni a ningún tercero. `test_x16` lo fija por contrato: si
  alguien la afloja a `unsafe-url` o `no-referrer-when-downgrade`, se pone rojo.

### Documentos legales y página pública

- Los tres documentos abren con `> **BORRADOR PARA REVISIÓN DE ABOGADO** …` en
  la primera línea, y la copia del frontend es **byte a byte** idéntica a
  `docs/legal/politica-datos.md` (`test_x21` — deja fijado el `cmp` que el
  builder legal pedía en CI y no tenía dónde poner).
- `GET /politica-datos` responde 200 sin credencial y con las cinco cabeceras
  (`test_x22`).
- **Revisión de contenido**: la política no filtra infraestructura sensible. Lo
  que sí nombra —`GET /api/clientes/mi-export`, Firebase Authentication, Render
  como alojamiento, hash Argon2id, la existencia de frenos por IP— es
  **exigido** por la ley (art. 13 Dto. 1377: identificar tratamientos,
  encargados y transferencias internacionales), no una fuga: son rutas ya
  visibles en el bundle y nombres de proveedor que hay que declarar. No hay
  correos reales, ni dominios internos, ni rutas de base, ni nombres de tabla
  del registro. **17 `[COMPLETAR]` y 7 `[VALIDAR CON ABOGADO]`** quedan visibles
  para cualquiera si la página se publica — riesgo reputacional/legal ya
  declarado por el builder legal, no fuga de datos.

---

## Preexistente (contexto, NO conflicto de esta fase)

- **R-0** (`docs/ESTADO.md:275-295`) — la suite sólo está verde la primera vez
  sobre un checkout, por el import a nivel de módulo de
  `tests/test_correo_api.py`. **Vigente y sin arreglar.** Con el `rm` antes de
  cada corrida queda neutralizado: mis dos corridas certificadas dieron
  resultado idéntico. **Sigue siendo una trampa activa** para cualquiera que
  corra la suite dos veces sin el `rm`.
- **R-1** (el 402 sin credencial) — `clientes.py:442-451` ya sólo aplica
  `_aplicar_estado` cuando el pedido trajo credencial, que es lo que R-1
  sugería; `ESTADO.md` todavía lo lista como pendiente. **No lo re-descubro.**
  Lo que sí verifiqué, porque es mi mandato: **esta fase no agregó ningún
  oráculo parecido** — sin credencial, `/mi-export`, `/solicitar-supresion` y
  `/aceptar-politica` contestan **401** aunque el cliente esté `suspendido`,
  nunca 402 ni 428 (`test_x23`).
- **R-2** (`aviso_cuenta.motivo` en `gracia`/`solo_lectura` le llega a cualquier
  rol) — sigue abierto, ajeno a esta fase. El export **no** lo agrava: el motivo
  del operador no sale por ahí (`test_x2`).
- **R-3 / R-4** — el tope de fundaciones sin barrera y el `Usuario` huérfano.
  `m-1` es una variante nueva del mismo patrón sobre la tabla nueva.
- **`GET /api/spaces/face-images` no exige credencial** (`spaces.py:179`, sin
  `Depends(require_auth)`). Es de la Fase 0 y el diff de esta fase **no lo
  cambió**; lo anoto sólo porque el endpoint se tocó y alguien podría creer que
  es nuevo. Lo que devuelve hoy es `{code, file_id}` — menos que antes, porque
  un espacio sin designación no aparece.
- **Fotos de montaje visibles para cualquier worker en cualquier espacio** —
  comportamiento de la Fase 0. `m-5` cuelga del mismo mecanismo.

---

## Qué hay en `backend/tests/test_compliance_ataques.py`

39 funciones, **47 casos** (la parametrización de `test_x5` aporta 9). Los
`X-n` son los identificadores que usa este informe.

| Test | Superficie | Clase |
|---|---|---|
| `test_x1`, `x1b`, `x1c` | Export: quién lo pide | defensa |
| `test_x2`, `x2b` | Export: qué sale adentro | defensa |
| `test_x3`, `x3b` | Export: el freno como canal | defensa |
| `test_x4`, `x4b` | 428 como oráculo | defensa |
| `test_x5` (×9), `x5b` | `acepta_politica` en tipos raros | defensa |
| `test_x6` | La IP del consentimiento no vuelve | defensa |
| `test_x7`, `x7b`, `x8` | `aceptar-politica` / `pedir_consentimiento` | defensa |
| `test_x9`…`x12b` | Supresión: crear, leer, atender, no borrar | defensa |
| `test_x13`…`x16` | Cabeceras, HSTS, CSP, Referrer-Policy | defensa |
| `test_x17`, `x20` | H8: la cara designada y el 3D siguen andando | defensa |
| **`test_x18`, `x18b`, `x19`** | **H8: los tres hallazgos de la Iteración 1** | **CERRADOS — hoy son tests positivos** |
| `test_x25`, `x26`, `x29` | Ataques al diseño por designación | defensa |
| **`test_x27`** | **Rowid reusado tras borrar la cara** | **hallazgo mío, CERRADO en esta iteración** |
| **`test_x19b`, `x28`** | **Bitácora del rechazo · prefijo de montaje en imágenes** | **hallazgos abiertos (`xfail(strict=True)`) → m-6, m-5** |
| `test_x21`, `x22` | Documentos legales y página pública | defensa |
| `test_x23` | Ningún oráculo nuevo tipo R-1 | defensa |
| `test_x24` | El interruptor corta el habeas data | caracterización |

---

## Qué queda para después del merge

Ninguna de estas cuatro bloquea. Las dejo ordenadas por costo:

1. **`m-6`** (hardening, ~3 líneas): anotar el rechazo antes del `raise` en
   `files.py`. Criterio de cierre: `test_x19b` pasa a XPASS → sacarle el
   marcador en el mismo PR.
2. **`m-5`** (hardening): reconocer la foto de montaje por el prefijo completo
   `montaje--<code>--` verificado contra el espacio, o por designación
   explícita. Criterio de cierre: `test_x28` pasa a XPASS.
3. **`m-8`** (conciliador): volcar la Fase 3 a `docs/ESTADO.md` —
   `space_faces`, el gate 428, el fail-closed de la cara, los tres endpoints
   nuevos, y `m-1`…`m-7` junto a R-0…R-5.
4. **`m-7`** (producto): agendar la re-designación de caras post-deploy, y
   **`m-4`**: abrir el frontend en un navegador con la CSP puesta y hacer un
   login con Google mirando la consola.
