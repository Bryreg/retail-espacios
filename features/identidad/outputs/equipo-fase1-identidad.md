# Equipo Fase 1 — Identidad (definido por el Maestro Orchestrator)

Rama: `claude/fase-1-identidad` · Repo: `/tmp/retail-espacios-test` · Sin commit ni push.

## Lectura del problema

Esto NO es el equipo genérico Frontend/Backend/Contador/Legal/Analytics del catálogo:
es un problema de **autenticación y seguridad** con una restricción de compatibilidad
brutal (login legado intacto, JWT sin cambio de forma, redacción de dinero intacta,
cero migraciones). Contador/Legal/Analytics no aportan nada acá; en cambio hacen
falta dos auditores que el catálogo no tiene: uno que ATAQUE el flujo de tokens y
otro que defienda la compatibilidad hacia atrás.

Decisiones de orquestación:

1. **Dos builders con territorios disjuntos por árbol**: `backend/**` y
   `frontend/**`. Nada de dos agentes tocando `auth.py`.
2. **El contrato de API lo fijo YO acá abajo** y va pegado en las dos misiones.
   Los builders corren en paralelo; si cada uno inventara su payload, el
   Conciliador encontraría el choque recién en Fase 2. El contrato elimina esa
   iteración entera.
3. **Los auditores no escriben código**: producen informes con severidad y
   reproducción. Si encuentran algo bloqueante, itero ajustando el prompt del
   builder dueño del territorio.
4. **Opus solo donde paga**: la auditoría ofensiva del flujo de tokens (JWKS,
   confusión de tokens, invitaciones, cross-cliente). Todo lo demás es sonnet.

## Contrato de API (NO negociable entre builders — cualquier desvío es conflicto)

### POST /api/auth/oauth
Request: `{ "id_token": "<Firebase ID token>", "cliente": "<slug, opcional>" }`

- **503** si falta `FIREBASE_PROJECT_ID` en el entorno:
  `{"detail": "Login con Google/correo no configurado en este servidor"}`. El resto de la app funciona normal.
- **401** si el ID token no verifica: firma contra JWKS de
  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
  (o el endpoint JWKS estándar de securetoken), `aud == FIREBASE_PROJECT_ID`,
  `iss == https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, `exp`, alg **RS256 exclusivamente**.
- **401** si `email_verified` es false para proveedor password (Google ya viene verificado).
- **403** si el usuario no tiene membresía activa en ningún cliente NI invitación pendiente:
  `{"detail": "Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación."}`
- **200 con una sola membresía activa** (o `cliente` enviado y membresía activa en él):
  `{ "token": "<jwt propio>", "role": "admin"|"worker", "cliente": "<slug>", "email": "...", "nombre": "..." }`
  — superset del shape del login legado (que devuelve `token` y `role`).
- **200 con varias membresías y sin `cliente`**:
  `{ "requiere_cliente": true, "membresias": [{"cliente": "<slug>", "nombre": "<nombre visible>", "rol": "owner"|"admin"|"worker"}] }`
  El front repite el POST con `cliente` elegido.

### JWT propio emitido por /oauth
`{ role, epoca, cliente, exp, sub, email }` donde:
- `role` = `"admin"` si la membresía es `owner` o `admin`; `"worker"` si es `worker`.
  (owner se comporta como admin para TODO el middleware actual — spec, decisión 5).
- `epoca` = época vigente del role mapeado (mismo mecanismo actual).
- `sub` = id del usuario (tabla `usuarios`), `email` = su email.
- El login legado sigue emitiendo el token SIN `sub`/`email`, sin cambios.

### Gestión de usuarios (todas con require_admin, operan sobre el cliente del token)
- `POST /api/usuarios/invitar` `{ "email": "...", "rol": "admin"|"worker"|"owner" }` →
  `{ "ok": true, "expira_en": "<iso>" }`. Crea fila en `invitaciones` (token firmado
  con JWT_SECRET, TTL 7 días) y encola correo por el mailer existente. 409 si ya es miembro.
- `GET /api/usuarios` → `{ "miembros": [{"id", "email", "nombre", "rol", "activo", "ultimo_login"}], "invitaciones": [{"email", "rol", "expira_en"}] }`
- `PATCH /api/usuarios/{usuario_id}` `{ "activo": false|true }` → activa/desactiva la
  membresía de ese usuario EN el cliente del token. 404 si no hay membresía ahí.
  Un owner no puede desactivarse a sí mismo si es el último owner activo (409).

### Revocación por request
Cuando el token trae `sub`, `decode_token`/`require_auth` valida (además de época)
que la membresía (sub, cliente) siga activa — consulta a `sesion_registro()` con
caché en memoria de TTL 60 s. Token sin `sub` (legado) pasa como hoy.

### Frontend env
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`.
Si falta cualquiera → la pantalla de login muestra SOLO el formulario legado.

---

## El equipo (4 agentes)

| id | rol | modelo | territorio |
|---|---|---|---|
| backend-identidad | builder | sonnet | `backend/**` (código y tests nuevos) |
| frontend-login | builder | sonnet | `frontend/**` |
| auditor-tokens | auditor | opus | solo lee + escribe su informe en outputs/ |
| auditor-compat | auditor | sonnet | solo lee/corre suites + informe en outputs/ |

Los cuatro entregan además su informe en `features/identidad/outputs/`.

### Misión 1 — backend-identidad (builder, sonnet)

Territorio EXCLUSIVO: `backend/**`. Prohibido tocar `frontend/`.

Leer primero: `docs/ESTADO.md` (reglas duras), `backend/app/clientes.py` (docstring:
arquitectura multi-cliente y `sesion_registro()`), `backend/app/auth.py` (claves por
rol, épocas, JWT, `require_auth`/`require_montaje`), `backend/app/routers/auth.py`,
`backend/app/models/models.py`, `backend/app/services/mailer.py` y `contacts.py`,
`backend/tests/conftest.py`, y la spec `features/identidad/spec.md`.

Construir:
1. **Modelos nuevos** en archivo NUEVO `backend/app/models/identidad.py` (importado
   desde `models/__init__.py` o `main.py` para que `create_all` los vea):
   `usuarios` (id, firebase_uid UNIQUE, email UNIQUE, nombre, creado_en, ultimo_login),
   `membresias` (usuario_id, cliente_slug, rol ∈ {owner,admin,worker}, activo,
   creado_en, UNIQUE(usuario_id, cliente_slug)),
   `invitaciones` (email, cliente_slug, rol, token, expira_en, usada_en, invitado_por).
   REGLA: se leen/escriben SIEMPRE vía `clientes.sesion_registro()` — son identidad
   global, viven en la base por defecto. `create_all` sobre el motor por defecto en
   el arranque (donde ya se hace) las crea. CERO columnas nuevas en tablas existentes.
2. **Verificador Firebase** en `backend/app/services/firebase_tokens.py`, detrás de
   una interfaz inyectable (p.ej. `VerificadorDeIdToken` con método
   `verificar(id_token) -> ClaimsVerificadas | None`). La implementación real baja el
   JWKS de Google (con caché por kid + respeto de Cache-Control), exige RS256, valida
   aud/iss/exp. SIN SDK de Firebase. Los tests inyectan un verificador falso que firma
   con una clave RSA propia del test — sin red.
3. **POST /api/auth/oauth** en `backend/app/routers/auth.py`, implementando EXACTO el
   contrato de API del plan (503/401/403/200 simple/200 requiere_cliente). Al verificar:
   busca usuario por `firebase_uid`; si no existe y hay invitación pendiente no vencida
   para su email, crea usuario + membresía y marca `usada_en`; si no existe y el email
   ya es de un usuario (login por otro proveedor), vincula el `firebase_uid` solo si
   el email viene verificado. Actualiza `ultimo_login`.
4. **Gestión**: `POST /api/usuarios/invitar`, `GET /api/usuarios`,
   `PATCH /api/usuarios/{id}` según contrato, en router nuevo
   `backend/app/routers/usuarios.py` montado en `main.py`. El correo de invitación
   sale por el mailer existente. Rutas literales antes que paramétricas.
5. **Revocación por request**: en `app/auth.py`, cuando el token trae `sub`, validar
   membresía activa contra el registro con caché TTL 60 s (invalidada por el PATCH).
   Tokens sin `sub` pasan como hoy. NO tocar ningún router de negocio.
6. **Auditoría**: cuando hay `sub`, la bitácora (`services/bitacora.py` /
   `AuditEntry`) registra el email del actor sin columna nueva (usar el campo de
   actor/detalle existente).
7. **Tests nuevos** en `backend/tests/test_identidad.py` (+ los que hagan falta):
   los 8 checks de "Verificación" de la spec del lado backend, incluyendo: oauth crea
   usuario vía invitación, multi-membresía devuelve lista, membresía desactivada →
   401 en el siguiente request, token de un cliente no abre otro, worker por
   membresía NO recibe `negotiatedValue`/`monthly_rent`, login legado intacto,
   503 sin FIREBASE_PROJECT_ID, y ataques básicos (alg=none, aud ajena, exp vencido,
   invitación vencida/reusada).

Guardrails: login legado (`POST /api/auth/login`) intacto; forma del JWT solo gana
`sub`/`email`; suite existente completa verde (`cd backend && python -m pytest`);
`python -c "import app.main"` pasa; sin dependencias nuevas salvo lo mínimo para
JWKS/RSA (PyJWT ya está — usar `PyJWT[crypto]`); sin migraciones; sin commit.

Entregable: código + tests + `features/identidad/outputs/backend-identidad.md` con
resumen de endpoints, decisiones tomadas y salida de pytest.

### Misión 2 — frontend-login (builder, sonnet)

Territorio EXCLUSIVO: `frontend/**`. Prohibido tocar `backend/`.

Leer primero: `docs/ESTADO.md` (paleta, tipografía Chivo/Archivo Narrow, siete
tamaños, reglas de dinero en cliente), `frontend/src/pages/Login.tsx`,
`frontend/src/api/auth.ts`, `frontend/src/api/client.ts`,
`frontend/src/store/authStore.ts`, `frontend/src/App.tsx`, `frontend/src/index.css`,
`tailwind.config.js`, y la spec `features/identidad/spec.md`.

Construir:
1. **Config Firebase** en `frontend/src/api/firebase.ts`: lee `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`; exporta
   `firebaseDisponible` y helpers `loginConGoogle()` (popup) y
   `loginConCorreo(email, pass)` + registro y reset de clave usando `firebase/auth`
   (agregar dependencia con `npm install --legacy-peer-deps`). Si falta cualquier
   variable, NO se inicializa nada y la pantalla muestra SOLO el formulario legado.
2. **Login.tsx**: botones "Continuar con Google" y correo/contraseña arriba, el
   formulario legado de clave compartida debajo (marcado como acceso anterior).
   Tras obtener el ID token: `POST /api/auth/oauth` (nueva función en `api/auth.ts`
   siguiendo el contrato del plan). Si la respuesta trae `requiere_cliente`, mostrar
   selector de cliente (lista `membresias`) y repetir el POST con el elegido.
   Manejar 503 (ocultar la vía nueva con aviso discreto), 401 y 403 con mensajes
   claros. Correo no verificado: ofrecer reenviar verificación (Firebase lo trae).
3. **authStore**: guardar además `email`/`nombre` de la sesión cuando existan; logout
   también cierra sesión de Firebase (`signOut`) si está inicializado. El token
   propio sigue viajando igual que hoy (mismo interceptor); nada de dinero en
   `localStorage` (regla dura intacta).
4. **Pantalla de gestión de usuarios** (solo admin, punto de entrada donde hoy vive
   Configuración): lista miembros e invitaciones (`GET /api/usuarios`), invitar por
   email+rol (`POST /api/usuarios/invitar`), activar/desactivar
   (`PATCH /api/usuarios/{id}`), con confirmación al desactivar. Estilo: tokens y
   tamaños existentes de `index.css`, sin colores nuevos.

Guardrails: `cd frontend && npx tsc --noEmit` limpio; sin variables Firebase todo
se ve EXACTAMENTE como hoy; no tocar la lógica de redacción/partialize del store de
fixtures; `npm install --legacy-peer-deps`; sin commit.

Entregable: código + `features/identidad/outputs/frontend-login.md` con capturas de
decisiones (flujo, estados de error, degradación) y salida de tsc.

### Misión 3 — auditor-tokens (auditor, opus)

Rol: atacante. NO escribe código de producción; puede escribir scripts/PoC
descartables en su scratchpad y, si sirve, tests de ataque en un archivo separado
`backend/tests/test_identidad_ataques.py` (único archivo que puede crear).

Leer primero: `backend/app/auth.py`, `backend/app/routers/auth.py`,
`backend/app/routers/usuarios.py`, `backend/app/services/firebase_tokens.py`,
`backend/app/models/identidad.py`, `backend/app/clientes.py`, y el contrato de API
en `features/identidad/outputs/equipo-fase1-identidad.md`.

Atacar, como mínimo:
1. **Verificación del ID token**: ¿acepta `alg: none` o HS256 firmado con el propio
   JWKS público? ¿valida `aud`, `iss`, `exp`? ¿el kid del header puede apuntar a una
   clave arbitraria (inyección de JWKS URL / kid confusion)? ¿qué pasa con un ID
   token de OTRO proyecto Firebase válido?
2. **Confusión de tokens**: ¿el JWT propio se acepta donde va el ID token y
   viceversa? ¿un token de montaje entra por /oauth o por la puerta general?
3. **Invitaciones**: ¿el token de invitación es adivinable/reutilizable/sin
   expiración efectiva? ¿un worker invitado puede escalarse a admin manipulando el
   flujo? ¿se puede invitar a un cliente ajeno manipulando el slug?
4. **Cross-cliente**: con membresía en cliente A, ¿puedo emitir/usar JWT para
   cliente B? ¿el `PATCH /api/usuarios` de un admin de A alcanza membresías de B?
5. **Revocación**: desactivada la membresía, ¿el caché de 60 s es el único retraso?
   ¿hay caminos (query token, montaje, iframe) que salteen el check? ¿la época
   sigue invalidando el legado?
6. **Enumeración y fuerza bruta**: ¿/oauth o /invitar filtran si un email existe?
   ¿tiempos distinguibles?
7. **Secretos**: ¿`FIREBASE_PROJECT_ID`/JWT_SECRET o claims sensibles terminan en
   logs, respuestas o en el frontend?

Entregable: `features/identidad/outputs/auditoria-seguridad.md` — hallazgos con
severidad (bloqueante/alta/media/baja), reproducción paso a paso, archivo:línea, y
propuesta de arreglo (para que el orquestador ajuste el prompt del builder dueño).
Veredicto final explícito: APTO / NO APTO para producción.

### Misión 4 — auditor-compat (auditor, sonnet)

Rol: guardián de la compatibilidad. NO modifica código de producción ni tests
existentes; solo corre y lee. Puede escribir scripts de verificación en scratchpad.

Verificar, con evidencia (comandos y salidas):
1. `cd backend && python -m pytest` — suite COMPLETA verde, cero tests existentes
   modificados o borrados (`git status`/`git diff --stat` sobre `backend/tests/`).
2. `python -c "import app.main"` y `cd frontend && npx tsc --noEmit` limpios.
3. **Login legado**: `POST /api/auth/login` responde igual que en `main` (comparar
   shape de respuesta y comportamiento con clave buena/mala/época invalidada).
4. **Dinero**: seguir el camino de la redacción (`layout`, `spaces`, `rates`,
   `dashboard`) y confirmar por lectura de código Y por test que un token worker
   CON `sub` recibe exactamente lo mismo que un worker legado: sin
   `negotiatedValue`, sin `monthly_rent`, 403 en tarifas.
5. **Regla sin migraciones**: `git diff main -- backend/app/models/models.py` no
   agrega columnas a tablas existentes; las tablas nuevas están en archivo nuevo y
   se leen solo vía `sesion_registro()` (grep de usos).
6. **Orden de rutas**: las literales nuevas (`/oauth`, `/usuarios/invitar`) antes
   que paramétricas en sus routers.
7. **Degradación**: sin `FIREBASE_PROJECT_ID` el backend arranca y /oauth da 503;
   sin `VITE_FIREBASE_*` el build del front no referencia firebase en el login
   inicial roto (revisar que el import sea condicional/lazy o tolere ausencia).
8. Checklist de "Verificación" de la spec: marcar cada casilla con el test que la
   cubre o señalarla como descubierta.

Entregable: `features/identidad/outputs/auditoria-compatibilidad.md` — tabla
checklist (ítem → evidencia → PASA/FALLA), regresiones encontradas con
archivo:línea, y veredicto explícito: SIN REGRESIONES / CON REGRESIONES (lista).

---

## Ciclo

Fase 1: backend-identidad ∥ frontend-login (paralelo, territorios disjuntos, contrato
fijado arriba). Fase 2: auditor-tokens ∥ auditor-compat sobre el resultado. Si algún
auditor reporta bloqueante → iteración: ajusto el prompt del builder dueño del
territorio con el hallazgo puntual (máx. 3 iteraciones; lo que quede abierto se
reporta, no se oculta).
