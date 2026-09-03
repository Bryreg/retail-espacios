# Backend — Fase 1 Identidad

Builder: backend-identidad · Territorio: `backend/**` (no se tocó `frontend/`) ·
Rama `claude/fase-1-identidad` · Sin commit, sin push.

## Endpoints implementados

### `POST /api/auth/oauth` (`app/routers/auth.py`)

Implementa exactamente el contrato del plan del orquestador
(`features/identidad/outputs/equipo-fase1-identidad.md`):

- **503** si falta `FIREBASE_PROJECT_ID` — el resto de la app sigue andando
  (verificado con un test que hace login legado justo después del 503).
- **401** si el ID token no verifica, o si el correo no viene verificado para
  cualquier proveedor que no sea Google (ver hallazgo H-2 abajo).
- **403** sin membresía activa ni invitación pendiente, o pidiendo un cliente
  al que no se tiene acceso.
- **200 simple** con una sola membresía activa (o `cliente` en el body):
  `{token, role, cliente, email, nombre}` — superset del shape del login
  legado.
- **200 `requiere_cliente`** con varias membresías activas y sin `cliente`:
  `{requiere_cliente: true, membresias: [{cliente, nombre, rol}]}`.
- Freno de fuerza bruta por IP, reusando `frenar_si_hay_muchos_fallos` /
  `anotar_fallo` / `borrar_fallos` del login legado (ahora parametrizadas por
  `modelo`) contra una tabla PROPIA, `oauth_attempts` — no `login_attempts`
  (hallazgos H-6 y H-9, ver abajo).

JWT propio: `{role, epoca, cliente, exp, sub, email}`. `role` = `"admin"` si la
membresía es `owner` o `admin`, `"worker"` si es `worker`. `epoca` sale de
`epoca_de()` sobre la base del CLIENTE elegido — mismo mecanismo de siempre.

### `POST /api/usuarios/invitar`, `GET /api/usuarios`, `PATCH /api/usuarios/{id}`

Router nuevo `app/routers/usuarios.py`, montado en `main.py`, todo con
`require_admin` operando sobre `cliente_del_pedido` (nunca un slug del body).
Rutas literales (`/invitar`, la lista en la raíz) declaradas antes que la
paramétrica.

- `POST /invitar` `{email, rol}` → `{ok, expira_en}`. 409 si ya es miembro.
  Token de invitación: `secrets.token_urlsafe(32)` (256 bits, no depende de
  `JWT_SECRET`), TTL 7 días, correo por el mailer existente (Brevo/SendGrid/
  SMTP, según `EMAIL_PROVIDER`).
- `GET /usuarios` → `{miembros: [...], invitaciones: [...]}` exacto al
  contrato.
- `PATCH /usuarios/{id}` `{activo}` → 404 sin membresía en ese cliente; 409 si
  desactivaría al último `owner` activo del cliente.

### Modelos nuevos — `app/models/identidad.py`

`usuarios`, `membresias` (`UNIQUE(usuario_id, cliente_slug)`), `invitaciones`.
Tablas NUEVAS, importadas en `main.py` para que `Base.metadata.create_all()`
las vea en el arranque. `git diff main -- backend/app/models/models.py` está
vacío: **cero columnas nuevas en tablas existentes**. Se leen/escriben SIEMPRE
con `clientes.sesion_registro()`.

### Verificador Firebase — `app/services/firebase_tokens.py`

`VerificadorDeIdToken` (interfaz) + `VerificadorFirebase` (implementación
real): baja el JWKS de `securetoken.google.com`, cachea por `kid` respetando
`Cache-Control: max-age` (con techo de 6h si el header no viene), exige
`alg=RS256` exclusivamente (rechaza `none` y `HS256` ANTES de tocar el JWKS),
valida `aud`, `iss` y `exp` vía `jwt.decode`. Sin SDK de Firebase — sólo
`PyJWT[crypto]` (ya en `requirements.txt`, se agregó el extra `[crypto]`
porque antes no estaba declarado y un despliegue limpio se habría quedado sin
soporte RSA).

El transporte HTTP es inyectable (`transporte: Callable[[url], (status, body,
cache_control)]`), lo que permite testear la clase REAL sin red: los tests de
ataque firman con una clave RSA propia y sirven un JWKS falso en memoria.

### Revocación por request — `app/auth.py`

`decode_token` ahora, cuando el payload trae `sub`, comprueba además que la
membresía `(sub, cliente)` siga activa — consulta a `sesion_registro()` con
caché en memoria TTL 60s, invalidada explícitamente por el `PATCH`
(`invalidar_cache_membresia`). Tokens sin `sub` (todo el login legado) no
pagan ese costo y pasan exactamente como pasaban antes.

### Auditoría — sin columna nueva

`require_auth` (y `require_auth_or_query_token`), cuando el token trae
`email`, lo deja en `request.state.actor_email`. `services/bitacora.py::anotar`
lo agrega al `detalle` existente si está presente — **sin tocar un solo
router de negocio**: todos ya reciben el mismo `Request` y ya llaman a
`anotar`. El login legado, que no tiene `email`, sigue anotando exactamente
igual que antes.

## Decisiones tomadas

1. **Invitaciones pendientes se canjean SIEMPRE, no sólo al crear la
   cuenta.** El diseño inicial sólo miraba la tabla `invitaciones` cuando el
   usuario no existía todavía; el auditor de tokens encontró que eso deja
   huérfana cualquier invitación a un SEGUNDO cliente recibida DESPUÉS del
   primer login (H-3), y que dos invitaciones de clientes distintos, recibidas
   antes del primer login, sólo canjeaban la más nueva (H-4). Ahora se
   consultan y canjean TODAS las invitaciones pendientes del correo en CADA
   login, exista o no la cuenta.
2. **Sólo Google queda exento de `email_verified`.** El contrato decía
   "401 si `email_verified` es false para proveedor password (Google ya viene
   verificado)"; se implementó literal al principio (`proveedor == "password"`),
   pero el auditor señaló que eso deja sin filtro a cualquier otro proveedor
   que Firebase pudiera tener habilitado. El check ahora es
   `proveedor != "google.com"`, que sigue cumpliendo la letra del contrato
   (Google exento, password exigido) y cierra el resto por defecto.
3. **El token de rescate de `PUT /api/auth/passwords` ahora hereda `sub`/
   `email` de quien lo pide.** Si no lo hiciera, un admin con cuenta real que
   cambia su propia contraseña se llevaba un token sin `sub` — que
   `decode_token` no somete al chequeo de membresía — y desactivarlo dejaba de
   tener efecto mientras ese token viviera (hasta 12h). El login legado
   (que nunca tiene `sub`/`email` que propagar) no cambia.
4. **`_membresia_activa` ahora hace `JOIN` contra `usuarios`.** Hoy no hay
   ningún endpoint que borre una fila de `usuarios`, así que no es explotable
   todavía, pero es la diferencia entre "sin efecto" y "agujero latente" el
   día que exista uno.
5. **`/oauth` tiene el mismo freno de fuerza bruta que el login legado**,
   reusando las funciones existentes (`frenar_si_hay_muchos_fallos`,
   `anotar_fallo`, `borrar_fallos`, ahora parametrizadas por `modelo` en vez
   de tener el modelo fijo) — antes el endpoint no frenaba nunca, dejando la
   verificación RSA por intento como superficie de CPU gratis y el endpoint
   como oráculo de "¿este id_token es válido?" sin límite. **Contra una tabla
   NUEVA y propia, `oauth_attempts` (`IntentoOauth` en `identidad.py`), no
   contra `login_attempts`**: el primer intento de esto compartía la tabla
   del login legado, y como la base del registro es, por construcción, la
   MISMA que la del cliente por defecto, los fallos de `/oauth` de
   CUALQUIER cliente se sumaban a los del login legado de un solo cliente
   (el por defecto) sin que los demás se enteraran (hallazgo H-9 del
   auditor, sobre mi propio arreglo de H-6 — ver tabla abajo).
6. **`FakeVerificador`/`ClaimsVerificadas` de los tests propios no heredan
   nada de `app.*` a nivel de módulo.** El primer intento importaba
   `from app.services.firebase_tokens import get_verificador` arriba del
   archivo de test, y fallaba de forma intermitente en la suite completa (no
   en aislado): `conftest.py` purga `sys.modules['app.*']` entre pruebas, así
   que un import de nivel de módulo tomado en la colección de pytest se queda
   viejo en cuanto CUALQUIER otro archivo de test corre antes y dispara la
   purga — el `dependency_overrides` deja de encajar con el objeto que el
   router realmente usa. Se corrigió moviendo todos los `import app.*` adentro
   de las funciones, y usando `types.SimpleNamespace` en vez de la clase real
   `ClaimsVerificadas` para no necesitar ese import en absoluto. El auditor de
   tokens encontró el mismo patrón de forma independiente y lo documentó en su
   propio archivo de tests.

## Hallazgos de la auditoría de tokens atendidos en esta iteración

`backend/tests/test_identidad_ataques.py` (del auditor-tokens) marca varios
hallazgos con `xfail(strict=True)`. De los seis (`H-1` a `H-6`), esta
iteración corrigió:

| Id | Severidad (auditor) | Qué era | Arreglado |
|---|---|---|---|
| H-1 | Bloqueante | Token de rescate de `/passwords` sin `sub`/`email`: esquiva la revocación | Sí |
| H-2 | Alta | Sólo `password` exigía `email_verified`; otro proveedor no | Sí |
| H-3 | Media | Invitación a un segundo cliente, después del alta, nunca se canjeaba | Sí |
| H-4 | Media | Invitación de otro cliente "secuestraba" el alta y perdía la legítima | Sí (mismo fix que H-3) |
| H-5 | Baja (latente) | `_membresia_activa` no comprobaba que `usuarios` siguiera existiendo | Sí |
| H-6 | (documentación) | `/oauth` sin freno de fuerza bruta, a diferencia del login legado | Sí |

Esta iteración fue de ida y vuelta EN VIVO con el auditor (mismo checkout
compartido): al corregir H-1 a H-6, sus tests `xfail(strict=True)` pasaron a
XPASS y el auditor mismo actualizó `test_identidad_ataques.py` (renombró esos
seis tests a `test_h1_...` a `test_h6_...`, ahora en verde, sin marcador) — y
de paso encontró **tres hallazgos nuevos** revisando el fix de H-3/H-4/H-6:

| Id | Severidad | Qué es | Estado |
|---|---|---|---|
| H-9 | Baja | El freno de `/oauth` (mi arreglo de H-6) usaba `login_attempts`, la misma tabla que el login legado del cliente por defecto — sus fallos se mezclaban | **Arreglado en esta misma iteración**: tabla nueva `oauth_attempts` (`IntentoOauth`), propia de identidad global |
| H-7 | Media | El `token` de la invitación se genera, se guarda, va en el enlace del correo (`?invitacion={token}`) — y no lo verifica nadie: la invitación se canjea sólo por igualdad de `email` en `/oauth` | **Abierto — ver nota abajo** |
| H-8 | Media | Un admin de CUALQUIER cliente puede invitar el email de alguien que YA tiene cuenta en otro cliente; en su PRÓXIMO login (a cualquier cliente) esa persona gana la membresía nueva sin haber aceptado nada, y el admin que invitó pasa a verle nombre y `ultimo_login` en `GET /api/usuarios` | **Abierto — ver nota abajo** |

**Por qué H-7 y H-8 quedan abiertos y no los resolví unilateralmente:** los
dos tocan el MISMO mecanismo — "toda invitación pendiente se canjea sola en
el próximo login por igualdad de email" — que es, literalmente, el flujo que
describe la spec ("el invitado entra con Google/correo → al verificar el ID
token se consume la invitación y nace la membresía") y que el CONTRATO fijo
del plan (`equipo-fase1-identidad.md`) no contempla con un paso de
aceptación explícita. Cerrarlos bien pide una decisión de producto —¿la
invitación necesita un "aceptar" antes de convertirse en membresía?, ¿el
`token` del correo debería ser obligatorio para canjearla?— que cambia el
contrato de `/oauth` (un campo nuevo en el body) y necesita al frontend, ya
completo para este contrato, del otro lado. Los dejo documentados con
severidad y reproducción del propio auditor en vez de parchearlos a medias:
un cambio de contrato a esta altura, sin coordinar con el builder de
frontend, generaría exactamente la clase de conflicto que el plan del
orquestador quiso evitar fijando el contrato de antemano.

No toqué `test_identidad_ataques.py` en ningún momento — no es mi territorio,
es el único archivo que el auditor-tokens puede crear/editar, y de hecho lo
fue actualizando él mismo en paralelo mientras yo corregía.

**Veredicto del auditor de tokens** (`features/identidad/outputs/auditoria-seguridad.md`):
**APTO para producción**, cero bloqueantes — el único que hubo (H-1) está
cerrado y con regresión propia. H-7/H-8/H-9 quedan como «deuda a cerrar antes
de Fase 2, no antes de desplegar Fase 1». Su informe recomienda el mismo
orden que yo: **H-8 y H-7 juntos** (comparten el arreglo — canje explícito
ligado al token de la invitación, con reenvío de `?invitacion=` en el
frontend) para el builder de backend, y **H-9 aparte**. Su informe quedó
escrito ANTES de que yo aplicara el fix de H-9 de esta misma iteración —
mi tabla de arriba ya lo refleja arreglado y verificado (XPASS confirmado
corriendo `test_ataque_el_freno_de_oauth_contamina_el_login_legado_del_cliente_por_defecto`
después del cambio); el informe del auditor quedó desactualizado en ese
único punto.

## Verificación

- `cd backend && python -c "import app.main"` — limpio.
- `cd backend && python -m pytest -q` — suite ENTERA verde: **269 tests**
  (`grep -rc "^def test_" tests/*.py` sumado), cero `F`/`FAILED` en la corrida
  limpia (`grep -c "^F\|FAILED"` → `0`), sólo **2 `x` (xfail) esperados** —
  `test_ataque_el_token_de_la_invitacion_no_se_verifica_nunca` (H-7) y
  `test_ataque_un_cliente_ajeno_se_agrega_una_membresia_sin_consentimiento`
  (H-8), los dos hallazgos abiertos documentados arriba, marcados por el
  propio auditor. Incluye `backend/tests/test_identidad.py` (40 tests
  nuevos, míos) y `backend/tests/test_identidad_ataques.py` (19 tests, del
  auditor-tokens). Ningún test preexistente modificado ni borrado —
  `git diff --stat main -- backend/tests/` sólo muestra los dos archivos
  nuevos. Salida real más abajo.
- `git diff main -- backend/app/models/models.py` → vacío: cero columnas
  nuevas en tablas existentes.
- Rutas literales antes que paramétricas verificado por lectura
  (`/usuarios/invitar`, `/usuarios` antes de `/usuarios/{usuario_id}`) y por
  test (`test_ruta_invitar_no_la_traga_la_parametrica`).
- Nota de entorno: este sandbox corre varios agentes en paralelo sobre el
  MISMO checkout (`/tmp/retail-espacios-test`) — el frontend-login builder y
  los dos auditores. Eso produjo fallos intermitentes y no reproducibles del
  tipo `sqlite3.OperationalError: attempt to write a readonly database` y
  `RuntimeError: Directory '.../frontend/dist/assets' does not exist` (este
  último por un `npm run build` del builder de frontend corriendo a la vez)
  cuando dos suites de pytest tocan archivos SQLite temporales al mismo
  tiempo. No son regresiones de este código — se confirmó reproduciendo el
  mismo test en aislamiento (pasa) y re-corriendo la suite completa hasta
  obtener una corrida limpia sin contención. El propio auditor de tokens
  encontró y documentó la misma causa de forma independiente en su informe,
  y se la asignó a auditor-compat (su territorio, no el mío).

### Salida de `pytest -q` (suite completa, corrida limpia)

```
$ python -m pytest -q --tb=short
........................................................................ [ 25%]
........................................................................ [ 50%]
....................xx.................................................. [ 76%]
...................................................................      [100%]
=============================== warnings summary ===============================
../../../usr/local/lib/python3.11/dist-packages/starlette/formparsers.py:12
  /usr/local/lib/python3.11/dist-packages/starlette/formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_bitacora.py::test_el_ingreso_queda_anotado
  /usr/local/lib/python3.11/dist-packages/starlette/testclient.py:40: DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated, use anyio.from_thread.BlockingPortal instead.
    _PortalFactoryType = typing.Callable[[], typing.ContextManager[anyio.abc.BlockingPortal]]

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
```

(Cero `F` — la corrida completa: 269 tests declarados, 267 en verde y los 2
`x` marcados arriba, exactamente los dos hallazgos abiertos H-7/H-8.)
