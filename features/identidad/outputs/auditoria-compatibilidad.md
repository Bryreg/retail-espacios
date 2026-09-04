# Auditoría de compatibilidad y regresión — Fase 1 Identidad

**Rol:** auditor-compat (guardián de la compatibilidad con producción) · **Rama:**
`claude/fase-1-identidad` · **Repo:** `/tmp/retail-espacios-test` · Sin commit, sin push.

No se modificó código de producción ni ningún test existente. Toda verificación
propia corrió desde `/tmp/claude-0/.../scratchpad/` o, cuando necesitaba los
fixtures de `conftest.py`, como un archivo temporal dentro de `backend/tests/`
borrado inmediatamente después de correr (`git status --porcelain backend/tests/`
confirmado limpio — solo quedan los dos archivos nuevos de los builders).

## Resumen del alcance tocado

```
$ git diff main --stat
 backend/app/auth.py              |  166 +++++-
 backend/app/main.py              |    9 +
 backend/app/routers/auth.py      |  259 ++++++++-
 backend/app/services/bitacora.py |   17 +-
 backend/requirements.txt         |    6 +-
 frontend/package-lock.json       | 1066 +++++++++++++++++++++++++++
 frontend/package.json            |    1 +
 frontend/src/api/auth.ts         |   85 +++
 frontend/src/pages/Dashboard.tsx |  255 ++++++++-
 frontend/src/pages/Login.tsx     |  391 +++++++++++++-
 frontend/src/store/authStore.ts  |   33 +-
```
más archivos nuevos: `backend/app/models/identidad.py`,
`backend/app/routers/usuarios.py`, `backend/app/services/firebase_tokens.py`,
`backend/tests/test_identidad.py`, `backend/tests/test_identidad_ataques.py`,
`frontend/src/api/firebase.ts`, `frontend/src/vite-env.d.ts`.

**Dato central para todo lo que sigue:** `backend/app/routers/layout.py` y
`backend/app/routers/spaces.py` — los dos archivos donde vive la redacción de
dinero — **no tienen ningún cambio** (no aparecen en `git diff main --stat`).
La compatibilidad de dinero no depende de que alguien haya "portado" la
redacción a un caso nuevo: depende de que `require_auth` siga devolviendo el
mismo `str` de rol de siempre, cosa que se verifica en la sección 4.

## Tabla checklist (mandato del Maestro, puntos 1–8)

| # | Ítem | Evidencia | Veredicto |
|---|---|---|---|
| 1 | Suite completa verde, ningún test existente tocado | `pytest -q` completo, exit 0, sin `F`; `git diff main -- backend/tests/` solo `test_identidad.py`/`test_identidad_ataques.py` (untracked, no modificación) | **PASA** |
| 2 | `import app.main` y `tsc --noEmit` limpios | Ambos exit 0, corridos de nuevo por mí, sin `--legacy-peer-deps` hizo falta (ya instalado) | **PASA** |
| 3 | Login legado: mismo shape/comportamiento | Lectura de diff (función `login()` byte-a-byte sin cambios) + ejecución directa + `test_login_legado_intacto_*` (3 tests) | **PASA** |
| 4 | Dinero: worker por membresía == worker legado, ni un campo más | Lectura de código (redacción vive en archivos NO tocados) + test propio de igualdad JSON completa (ver §5) + `test_worker_por_membresia_no_ve_negotiatedvalue_ni_monthly_rent` | **PASA** |
| 5 | Sin migraciones; identidad solo vía `sesion_registro()` | `git diff main -- backend/app/models/models.py` vacío; grep confirma `usuarios`/`membresias`/`invitaciones`/`oauth_attempts` solo se tocan vía `reg = sesion_registro()` | **PASA** |
| 6 | Orden de rutas: literales antes que paramétricas | Lectura de `@router.*` en `routers/auth.py` y `routers/usuarios.py` + `test_ruta_invitar_no_la_traga_la_parametrica` | **PASA** |
| 7 | Degradación backend (503) y frontend (solo legado) | Ejecución directa: `/oauth` sin `FIREBASE_PROJECT_ID` → 503, resto de la app funciona; `vite build`/`tsc` sin `VITE_FIREBASE_*` limpios, import 100% dinámico verificado por lectura | **PASA** |
| 8 | 8 casillas de "Verificación" de la spec | Ver tabla dedicada abajo | **PASA** (las 8 cubiertas) |

## 1–2. Suite e imports — evidencia cruda

```
$ cd backend && python -c "import app.main"
IMPORT_OK

$ cd frontend && npx tsc --noEmit
TSC_EXIT:0
```

Suite completa, con `TMPDIR` propio (ver nota de aislamiento más abajo):

```
$ MYTMP=$(mktemp -d) && TMPDIR=$MYTMP python -m pytest -q --tb=short
........................................................................ [ 25%]
........................................................................ [ 50%]
....................xx.................................................. [ 76%]
...................................................................      [100%]
=============================== warnings summary ===============================
(solo warnings preexistentes de starlette/multipart, no relacionados)
[exited with code 0]
```
Corrida dos veces de forma independiente (dos procesos en background,
`TMPDIR` distinto cada vez), las dos con exit code 0 y cero `F`. Los dos `x`
son los `xfail(strict=True)` del auditor-tokens (H-7/H-8), documentados como
hallazgos abiertos en su propio informe — no son regresiones de esta
auditoría, son hallazgos de seguridad ya reportados aparte.

**Nota de aislamiento (heredada del informe de auditor-tokens, re-verificada
acá):** con el `TMPDIR` por defecto del sandbox, `clientes.url_para()` mapea
cada cliente a una ruta fija hermana (`/tmp/recabra_<slug>.db`), compartida
por CUALQUIER proceso de pytest que corra en la máquina al mismo tiempo. En
este entorno hay otros agentes corriendo en paralelo sobre el mismo checkout,
así que una corrida con `TMPDIR` por defecto puede fallar de forma
intermitente por contención de archivo (`attempt to write a readonly
database`), no por una regresión del código. Con `TMPDIR` propio (como en la
evidencia de arriba) el problema desaparece. Confirmo el mismo diagnóstico
que auditor-tokens de forma independiente, y coincido en que el arreglo (que
el nombre del archivo SQLite temporal derive del nombre del archivo de la
prueba, no solo del slug) queda fuera de esta fase.

```
$ git diff main -- backend/tests/ --stat
(vacío)
$ git status --porcelain backend/tests/
?? backend/tests/test_identidad.py
?? backend/tests/test_identidad_ataques.py
```
Cero tests preexistentes modificados o borrados.

## 3. Login legado — shape y comportamiento

`git diff main -- backend/app/routers/auth.py` muestra que la función
`login()` (línea ~151) no tiene una sola línea tocada: el hunk de diff la
salta entera y agrega todo el código nuevo (`_rol_de_token`, `oauth_login`)
DESPUÉS de su `db.close()` de cierre. Las tres funciones de freno de fuerza
bruta (`frenar_si_hay_muchos_fallos`, `anotar_fallo`, `borrar_fallos`) ganaron
un parámetro `modelo=LoginAttempt` con ese valor por default — `login()` las
llama sin pasar `modelo`, así que su comportamiento es idéntico al de antes.

Verificado además por ejecución directa (sin pasar por ningún test):
```
oauth sin FIREBASE_PROJECT_ID: 503 {'detail': 'Login con Google/correo no configurado en este servidor'}
login legado sigue andando: 200 ['token', 'role', 'cliente', 'cliente_nombre']
login legado clave mala: 401 {'detail': 'Contraseña incorrecta'}
```

Y por los tests del builder, que sí llegan al nivel de detalle de comparar
el *shape* exacto del payload del JWT (no solo que "funcione"):

```python
# test_login_legado_intacto_clave_buena
body = r.json()
assert set(body) == {"token", "role", "cliente", "cliente_nombre"}
payload = jwt.decode(body["token"], options={"verify_signature": False})
assert "sub" not in payload
assert "email" not in payload
assert set(payload) == {"role", "epoca", "cliente", "exp"}
```

`test_login_legado_intacto_con_epoca_invalidada` confirma que
`invalidar_sesiones` (disparado por `PUT /api/auth/passwords`) sigue matando
tokens legados viejos y que el login con la clave nueva sigue entrando.
`test_login_legado_intacto_clave_mala` confirma el 401.

Sobre "tardando parecido" (timing del 401): no hay cambio de código en el
camino de clave mala del login legado (verificado arriba por diff), así que
no hay mecanismo por el que el timing pudiera moverse; no se corrió un
benchmark formal porque el entorno comparte máquina con otros agentes y el
ruido de esa contención haría cualquier medición de latencia no confiable
(ver nota de aislamiento §1–2). Lo tomo como cubierto por "cero cambio de
código en el camino", no por medición.

**Un detalle a favor de la compatibilidad que vale explicitar:** el único
cambio de firma en `require_auth`/`require_auth_or_query_token` es que ganan
un parámetro `request: Request` — FastAPI lo inyecta automáticamente, así que
ningún router de negocio que dependa de `role: str = Depends(require_auth)`
necesitó tocarse ni se ve afectado. Confirmado por lectura del diff completo
de `auth.py`.

## 4. Dinero — worker por membresía == worker legado

**Por lectura de código.** La redacción vive en `layout.py`
(`_redact_fixtures_for_worker`, gateado por `if role != "admin"` donde
`role: str = Depends(require_auth)`) y en `spaces.py`
(`lease.monthly_rent = None`). Ninguno de los dos archivos tiene un solo byte
tocado por esta fase (no aparecen en `git diff main --stat`). El valor de
`role` que llega a esos endpoints sale de `decode_token`, que devuelve
`"worker"` de la misma manera para un token legado que para uno de membresía
— la única diferencia entre ambos es que el de membresía, al tener `sub`,
paga el costo adicional de `_membresia_activa()` ANTES de devolver el rol; el
valor devuelto y su tipo (`str`) no cambian. Por construcción, cualquier
endpoint que redacte por `role` trata a los dos exactamente igual, sin que
nadie haya tenido que "portar" la regla al caso nuevo.

`/layout/rates` exige `require_admin` **también para el GET** —
`dependencies=[Depends(require_admin)]` en la línea del decorador — sin
cambios de esta fase.

**Por ejecución — el test del builder.**
`test_worker_por_membresia_no_ve_negotiatedvalue_ni_monthly_rent` recorre
`/api/spaces/{id}`, `/api/layout/NAVE`, `/api/dashboard/kpis`,
`/api/dashboard/spaces` y `/api/layout/rates` con las dos credenciales,
comprobando en cada una que los campos de dinero son `None`/ausentes/`403`.
Es una cobertura real, pero compara *campos sueltos*, no el JSON completo —
no prueba que un worker de membresía no reciba **un campo de más** en algún
lugar que el test no pensó en mirar (el mandato explícito del Maestro: "ni un
campo más").

**Hueco encontrado y cerrado por esta auditoría.** Escribí y corrí un test
propio (`/tmp/claude-0/.../scratchpad/test_paridad_dinero.py`, copiado
temporalmente a `backend/tests/zz_auditor_compat_paridad.py`, borrado
después — `git status` limpio) que hace **igualdad de diccionario completa**
(`assert j1 == j2`) entre la respuesta de un worker por membresía (token con
`sub`+`email`, confirmado por `jwt.decode`) y un worker legado, en los mismos
cinco caminos, sobre datos con plata real:

```
PARIDAD COMPLETA: worker-membresia == worker-legado en los 5 caminos de dinero (JSON idéntico).
```

Con esto, el punto 4 del mandato queda cubierto por evidencia de igualdad
total, no solo por ausencia de campos individuales.

## 5. Sin migraciones

```
$ git diff main -- backend/app/models/models.py
(vacío)
```
Cero columnas nuevas en tablas existentes. Las tres tablas de la spec más la
del freno de `/oauth` viven en el archivo nuevo `backend/app/models/identidad.py`:
`Usuario` (`usuarios`), `Membresia` (`membresias`), `Invitacion`
(`invitaciones`), `IntentoOauth` (`oauth_attempts` — tabla PROPIA, distinta de
`LoginAttempt`/`login_attempts` que usa el login legado; ver §7 de la nota de
H-9 en el informe del auditor-tokens, ya cerrado).

Grep de todo acceso a las cuatro tablas nuevas confirma que SIEMPRE pasa por
`reg = sesion_registro()` (o `db` cuando `db` YA es esa sesión, dentro de
`_membresia_activa`), nunca por la sesión de un cliente (`sesion_de(cliente)`,
`get_db`/`Depends(get_db)` que resuelve al cliente del pedido). Los únicos
usos de `get_db`/`Session` "de cliente" en los archivos tocados son para
tablas de negocio existentes (`LoginAttempt` en el login legado, y las que
tocan `layout`/`spaces`, sin relación con identidad).

`app/main.py` importa `app.models.identidad` (con `# noqa: F401`) antes del
`create_all()` del lifespan, para que las tablas nuevas se creen en el
arranque — es el único propósito de ese import, documentado en el propio
comentario del diff.

## 6. Orden de rutas FastAPI

```
routers/auth.py:      /clientes, /login, /oauth, /passwords   (ninguna paramétrica en este router)
routers/usuarios.py:  /invitar, "" (GET lista), /{usuario_id}  (paramétrica AL FINAL)
```
Las dos rutas nuevas del contrato (`/oauth`, `/invitar`) son literales y
conviven con rutas también literales; la única paramétrica de todo lo nuevo
(`PATCH /{usuario_id}`) está declarada después de `/invitar` y de la raíz.
Confirmado también por `test_ruta_invitar_no_la_traga_la_parametrica`.

## 7. Degradación

**Backend.** Ejecución directa (arriba, §3): sin `FIREBASE_PROJECT_ID`,
`/api/auth/oauth` responde 503 con el mensaje del contrato, y en el MISMO
proceso el login legado sigue respondiendo 200. `get_verificador()` en
`services/firebase_tokens.py` es lo único que consulta la variable de
entorno, y lo hace en tiempo de request (dependency), no en tiempo de import
— así que ni siquiera hace falta la variable para que `app.main` importe.

**Frontend.** `frontend/src/api/firebase.ts`: `firebaseDisponible` es la
única cosa calculada a nivel de módulo (lectura pura de
`import.meta.env.VITE_FIREBASE_*`); todo lo demás —`initializeApp`, el SDK—
vive detrás de `await import("firebase/auth")` dentro de funciones,
verificado por lectura línea por línea del archivo. `Login.tsx` envuelve TODA
la vía nueva (botones, los dos formularios, selector de cliente) en un único
`{firebaseDisponible && (...)}` (línea 311) — no hay ramas parciales.

Confirmado por ejecución, no solo por lectura:
```
$ env | grep -i VITE_FIREBASE     # nada — las tres variables ausentes
$ npx tsc --noEmit                # exit 0
$ npx vite build                  # build completo, sin error
dist/assets/index-CWSAH6CI.js      2,072.57 kB   (bundle principal)
dist/assets/index.esm-CMSkDWRI.js    127.80 kB   (chunk aparte — es el tamaño
                                                   que reporta el builder para
                                                   firebase/auth)
```
El build entero pasa sin las variables, y el tamaño del chunk que reporta
`vite build` coincide con lo que el informe del builder atribuye al SDK de
Firebase separado en su propio chunk — consistente con que el bundle
principal no lo arrastra.

## 8. Las 8 casillas de "Verificación" de la spec

| Casilla de la spec | Cubierta por | Estado |
|---|---|---|
| Login con Google crea usuario y entra al cliente correcto | `test_oauth_crea_usuario_por_invitacion_y_entra_al_cliente_correcto` | Cubierta |
| Login con correo/contraseña + verificación de email funciona | `test_correo_no_verificado_por_password_da_401` + `test_google_sin_email_verified_en_el_claim_igual_entra` | Cubierta |
| Invitar worker por email → entra con rol worker y NO ve dinero | `test_worker_por_membresia_no_ve_negotiatedvalue_ni_monthly_rent` + test de igualdad completa de esta auditoría (§4) | Cubierta |
| Desactivar membresía → el siguiente request de esa persona es 401 | `test_membresia_desactivada_da_401_en_el_siguiente_request` (además prueba la reactivación) | Cubierta |
| El login viejo por clave compartida sigue funcionando intacto | `test_login_legado_intacto_clave_buena/mala/con_epoca_invalidada` + verificación directa de esta auditoría | Cubierta |
| `audit_log` registra el email del actor en acciones con cuenta nueva | `test_la_bitacora_registra_el_email_del_actor_con_cuenta_nueva` | Cubierta |
| Un token de un cliente no abre la base de otro (re-testear) | `test_token_de_un_cliente_no_abre_la_base_de_otro` (datos de negocio Y `GET /api/usuarios` cross-cliente) | Cubierta |
| Suite completa verde + `tsc --noEmit` limpio | §1–2 de este informe, ejecutado de forma independiente dos veces | Cubierta |

Ninguna casilla queda DESCUBIERTA.

## Hallazgos de esta auditoría

Ningún hallazgo de regresión. El único hueco de cobertura encontrado —la
ausencia de un test de igualdad JSON completa para el punto 4 del mandato— se
cerró en el momento (§4), con test propio ejecutado y en verde; no bloquea
nada porque el propio análisis de código ya garantizaba el resultado por
construcción (archivos de redacción no tocados).

Para que quede completo el cuadro de esta fase, dejo constancia (sin que sean
hallazgos de MI territorio, ya reportados por otros roles) de que
`auditoria-seguridad.md` (auditor-tokens) documenta dos hallazgos ABIERTOS de
severidad media —H-7 (token de invitación decorativo) y H-8 (un admin de
cualquier cliente puede anexarse la membresía de alguien que ya tiene cuenta,
sin consentimiento)— con veredicto **APTO para producción, deuda a cerrar
antes de Fase 2**. Ninguno de los dos es una regresión de compatibilidad ni
toca dinero, login legado o el modelo de datos: quedan fuera del alcance de
esta auditoría (compatibilidad) pero se mencionan para que el veredicto final
de esta fase no se lea aislado del de seguridad.

## Veredicto final

# SIN REGRESIONES

- Suite completa verde (283 tests contando ambos archivos nuevos de
  identidad; 267 + 2 xfail(strict) documentados como hallazgos de seguridad
  abiertos, no regresiones), cero tests preexistentes tocados.
- `import app.main` y `tsc --noEmit` limpios, en ambos casos re-ejecutados de
  forma independiente por esta auditoría.
- Login legado: mismo shape de respuesta, mismo shape de JWT (verificado
  campo por campo), 401 en clave mala, época sigue invalidando tokens viejos.
- Dinero: worker por membresía y worker legado reciben JSON **idéntico** en
  los cinco caminos de dinero (test de igualdad completa, no solo de
  ausencia de campos) — verificado con test propio además del del builder.
- Cero migraciones: cero columnas nuevas en tablas existentes; toda la
  identidad nueva vive en tabla nueva, accedida siempre vía
  `sesion_registro()`.
- Orden de rutas correcto en los dos routers tocados/nuevos.
- Degradación limpia y verificada por ejecución en los dos lados: backend
  arranca y da 503 sin `FIREBASE_PROJECT_ID`; frontend construye y muestra
  solo el formulario legado sin `VITE_FIREBASE_*`, con el SDK en un chunk
  separado que nunca se pide sin esas variables.
- Las 8 casillas de "Verificación" de la spec, cubiertas con evidencia
  ejecutable, ninguna descubierta.
