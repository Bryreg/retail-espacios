# ENTREGA FINAL — Fase 1: Identidad (RECABRA)

**Rama:** `claude/fase-1-identidad` · **Repo:** `/tmp/retail-espacios-test` · Sin commit ni push.
**Fecha:** 2026-09-03 · **Orquestador:** Maestro (Fable) · **Rondas:** 1 (cero conflictos entre agentes).

**Veredicto en una línea:** el código funciona, la suite completa está verde (281 passed / 2 xfailed, exit 0), `tsc --noEmit` limpio, cero regresiones en login legado y redacción de dinero (verificadas con sondas propias, no solo tests) — pero **NO se puede mergear a main tal cual**: falta la configuración de Firebase en `render.yaml`, falta actualizar `docs/ESTADO.md` (regla dura de CLAUDE.md), y hay un 500 no manejado en `/oauth` encontrado en la verificación final. Detalle abajo.

---

## 1. Equipo y por qué

Esto no era un problema genérico de producto sino de **autenticación con restricción de compatibilidad dura** (login legado intacto, cero migraciones, redacción de dinero server-side intocable). El catálogo Frontend/Backend/Contador/Legal/Analytics no aplicaba: Contador/Legal/Analytics no aportan nada acá, y en cambio hacían falta dos auditores que el catálogo no tiene.

| id | rol | modelo | territorio |
|---|---|---|---|
| backend-identidad | builder | sonnet | `backend/**` exclusivo |
| frontend-login | builder | sonnet | `frontend/**` exclusivo |
| auditor-tokens | auditor ofensivo | **opus** | solo lectura + `test_identidad_ataques.py` |
| auditor-compat | auditor de regresión | sonnet | solo lectura/ejecución |

Decisiones de orquestación que pagaron:

- **Territorios disjuntos por árbol completo** (`backend/**` vs `frontend/**`, ningún archivo compartido): cero conflictos de merge, cero pisadas.
- **El contrato de API lo fijó el orquestador ANTES de lanzar** (payloads exactos de `/api/auth/oauth` con 503/401/403/200, flujo `requiere_cliente`, endpoints `/api/usuarios`, mapeo owner→admin, variables de entorno) y fue pegado idéntico en ambas misiones. Resultado: los builders corrieron en paralelo y el frontend encajó con el backend sin una sola iteración de conciliación. El frontend incluso verificó el contrato contra el **código real** del backend (no solo el documento) y se adaptó a la única desviación (el PATCH devuelve `{ok}`, no la fila).
- **Opus solo donde paga**: la auditoría ofensiva de tokens (JWKS, alg confusion, confusión de tokens, cross-cliente, invitaciones). Encontró 9 hallazgos, incluido un bloqueante (H-1) que sonnet no había visto. Todo lo demás, sonnet.
- **Los auditores no escriben código de producción**: informes con severidad y reproducción; el builder dueño del territorio corrige. Hubo una iteración en vivo builder↔auditor que cerró H-1 a H-6 y H-9 dentro de la misma ronda.

Plan completo con el contrato: `features/identidad/outputs/equipo-fase1-identidad.md`.

## 2. Qué construyó / halló cada uno

### backend-identidad (informe: `outputs/backend-identidad.md`)

- `backend/app/models/identidad.py` (nuevo, 116 líneas): tablas `usuarios`, `membresias` (UNIQUE usuario+cliente), `invitaciones`, `oauth_attempts`. Todas NUEVAS (cero migraciones, `create_all` las crea), siempre vía `sesion_registro()` — identidad global en la base por defecto.
- `backend/app/services/firebase_tokens.py` (nuevo, 227 líneas): `VerificadorFirebase` sin SDK de Firebase — baja el JWKS de securetoken, cachea por `kid` respetando `Cache-Control`, exige **RS256 exclusivo antes de tocar el JWKS**, valida `aud`/`iss`/`exp`. Transporte HTTP inyectable → la clase REAL se testea sin red con clave RSA propia.
- `backend/app/routers/auth.py` (+259): `POST /api/auth/oauth` con el contrato exacto (503 sin config / 401 token o correo sin verificar / 403 sin membresía ni invitación / 200 simple / 200 `requiere_cliente`), canje de TODAS las invitaciones pendientes en cada login, freno de fuerza bruta por IP contra tabla propia. Login legado (`/login`) sin una línea tocada.
- `backend/app/routers/usuarios.py` (nuevo, 224 líneas): `POST /invitar` (409 si ya es miembro, correo por el mailer existente), `GET /` (miembros + invitaciones), `PATCH /{id}` (activar/desactivar, 409 al último owner). Rutas literales antes que paramétricas. Todo `require_admin` sobre el cliente del token, nunca del body.
- `backend/app/auth.py` (+166): revocación por request — con `sub` en el token, `decode_token` exige membresía activa (caché TTL 60s, invalidada por el PATCH). Tokens sin `sub` (legado) pasan exactamente como antes. `PUT /passwords` conserva `sub`/`email` (fix de H-1).
- `backend/app/services/bitacora.py` (+17): email del actor anexado al `detalle` (sin columna nueva, sin tocar routers de negocio).
- `backend/tests/test_identidad.py` (nuevo, 752 líneas, 40 tests): las 8 casillas de la spec del lado backend.
- `requirements.txt`: `PyJWT[crypto]` (el extra faltaba; un deploy limpio se quedaba sin RSA).

### frontend-login (informe: `outputs/frontend-login.md`)

- `frontend/src/api/firebase.ts` (nuevo, 161 líneas): `firebaseDisponible` + helpers (Google popup, correo, registro, reenviar verificación, reset). **Import 100% dinámico**: el SDK (~128 kB) vive en un chunk aparte que solo se pide al usarlo; sin las 3 variables `VITE_FIREBASE_*` no se solicita nunca.
- `frontend/src/pages/Login.tsx` (+391): vía nueva arriba (Google + correo, selector de cliente para multi-membresía), formulario legado abajo, intacto, rotulado "Acceso anterior". Toda la vía nueva detrás de UN solo `{firebaseDisponible && ...}` — sin variables, la pantalla es idéntica byte a byte a la de hoy. Maneja 503 (apaga la vía nueva con aviso), 401, 403, correo sin verificar (con reenvío), popup cancelado (silencioso).
- `frontend/src/pages/Dashboard.tsx` (+255): gestión de usuarios como `UsuariosSection` dentro del panel de Configuración existente (admin-only), sin pantalla nueva. Cero colores/tamaños nuevos — reusa los tokens de `index.css`.
- `frontend/src/api/auth.ts` (+85), `authStore.ts` (+33, `setAuth` retrocompatible, logout hace `signOut` de Firebase), `vite-env.d.ts`, `package.json` (`firebase@^12.18.0` con `--legacy-peer-deps`).

### auditor-tokens, opus (informe: `outputs/auditoria-seguridad.md`)

9 hallazgos (H-1 a H-9), cada uno con reproducción ejecutable en `backend/tests/test_identidad_ataques.py` (nuevo, 540 líneas). **7 cerrados en la misma ronda** por el builder, con test de regresión:

- **H-1 (bloqueante, cerrado):** el token de rescate de `PUT /passwords` salía sin `sub` → inmune a la revocación individual. Era la razón de ser de la fase, anulada desde el propio panel.
- H-2 (alta, cerrado): solo `password` exigía `email_verified`; ahora todo proveedor salvo `google.com`.
- H-3/H-4 (medias, cerradas): invitaciones a un segundo cliente que nunca se canjeaban o se pisaban entre sí.
- H-5 (baja, cerrado), H-6 (media, cerrado: `/oauth` sin freno de intentos), H-9 (baja, cerrado: el freno contaminaba `login_attempts` del cliente por defecto → tabla propia `oauth_attempts`).
- **H-7 y H-8 ABIERTOS** — ver sección 5.

Además, ~20 ataques que NO encontraron nada (alg none, HS256 key confusion, ID token válido de OTRO proyecto Firebase, kid inventado, confusión de tokens en ambas direcciones, cross-cliente por body/PATCH/GET, revocación por los caminos laterales `?token=` y montaje, escalada de rol, enumeración, fugas de secretos). Veredicto del auditor: **APTO para producción, H-7/H-8 como deuda antes de Fase 2**.

### auditor-compat (informe: `outputs/auditoria-compatibilidad.md`)

Veredicto: **SIN REGRESIONES**. Evidencia clave:

- Login legado: la función `login()` no tiene una línea tocada (diff), shape de respuesta y de JWT verificados campo a campo (`{role, epoca, cliente, exp}`, sin `sub`/`email`).
- Dinero: los archivos de redacción (`layout.py`, `spaces.py`) no aparecen en el diff, y escribió un **test propio de igualdad JSON completa** (no solo campos sueltos) entre worker-por-membresía y worker-legado en los 5 caminos de dinero: idénticos.
- Cero migraciones, orden de rutas correcto, degradación verificada por ejecución en ambos lados (503 backend / build limpio sin variables frontend, con el SDK en chunk separado confirmado en el bundle).
- Diagnosticó (junto con auditor-tokens, de forma independiente) la no-determinismo de la suite en este sandbox: `clientes.url_para()` mapea a `/tmp/recabra_<slug>.db` fijo → contención entre procesos pytest paralelos. No afecta producción (Postgres); arreglo sugerido fuera de fase.

## 3. Coherencia

Historial: 1 ronda, 4 agentes, **cero conflictos** (`{"coherente": true, "conflicts": []}`). El contrato fijado de antemano funcionó: el único desvío detectado (PATCH devuelve `{ok}` y no la fila) lo absorbió el frontend leyendo el código real. La iteración builder↔auditor-tokens ocurrió dentro de la ronda, sin invadir territorios: el builder nunca tocó `test_identidad_ataques.py`, el auditor nunca tocó producción.

## 4. Verificación (independiente del orquestador)

| Chequeo | Resultado |
|---|---|
| `cd backend && python -m pytest -q` (suite COMPLETA) | **281 passed, 2 xfailed**, exit 0 (verificado con `PIPESTATUS`), corrida dos veces. Los 2 xfail son H-7/H-8, marcados por el propio auditor. |
| `cd frontend && npx tsc --noEmit` | Salida vacía, exit 0. |
| `python -c "import app.main"` | Limpio. |
| Login legado intacto | Sonda propia: token legado → `GET /api/spaces/` → 200. Payload del JWT byte a byte igual. Tabla de intentos separada (`oauth_attempts` vs `login_attempts`). |
| Worker no ve dinero | Test del builder (4 superficies) + test de igualdad JSON completa del auditor-compat + sonda propia del rol en el token. |
| Desactivar membresía → 401 | Sonda propia end-to-end: invitación → oauth → 200 → PATCH `{activo:false}` → **401 inmediato** (el PATCH invalida el caché de 60s). Cubre también `?token=` y montaje. |
| Cross-cliente | Sonda propia: `POST /invitar?cliente=segundo` — el query param se ignora por completo; el slug sale del token firmado (firma verificada ANTES de leer el slug). |
| Tamaño real del cambio | ~4.365 líneas nuevas en 19 archivos. Ojo: `git diff main --stat` (2.344) miente por omisión — 7 archivos clave están untracked. |

**Hallazgo propio de la verificación (ningún agente lo vio): 500 no manejado en `POST /api/auth/oauth`.** Reproducido. `backend/app/routers/auth.py:309-312`: proveedor `google.com` con `email_verified=false` + el correo ya tiene fila en `usuarios` con otro uid + invitación pendiente → `Usuario(...)` + `flush()` revienta con `IntegrityError: UNIQUE constraint failed: usuarios.email` → HTTP 500. No es un bypass (nadie entra), pero es alcanzable por un usuario legítimo (cuenta Workspace con el claim en false, ya registrada por correo/clave, invitada a un segundo cliente), y el 500-vs-403 es un **oráculo de existencia de correo** — exactamente lo que `test_oauth_no_distingue_correo_invitado_de_correo_desconocido` pretende cerrar por otra vía. Arreglo: try/except de `IntegrityError` con el mismo 403 genérico (como ya hacen `spaces.py:131` y `suppliers.py:39`), o vincular por email también cuando hay invitación pendiente.

**Hallazgo menor propio:** `auth.py:342-347` — en el camino de error "usuario sin membresías activas", `anotar_fallo` commitea y arrastra el re-vinculado de `firebase_uid` de la línea 276 aunque el login falle. Benigno, pero es escritura en camino de error.

## 5. Conflictos y hallazgos ABIERTOS (explícitos, nadie los oculta)

1. **H-7 (media, seguridad):** el token de la invitación es **decorativo** — se genera (256 bits), se guarda, viaja en el enlace del correo (`?invitacion=`)… y ningún código lo lee ni verifica. El canje es por igualdad de email. El contrato y el docstring prometen lo contrario. No es un agujero (poseer el correo ES el chequeo), pero es una garantía escrita que no existe.
2. **H-8 (media, seguridad/privacidad):** un admin de CUALQUIER cliente puede invitar un correo conocido; en el próximo login de esa persona nace sola una membresía en el cliente del invitador, **sin consentimiento**, y el invitador pasa a ver su nombre y último login. Hoy el atacante tiene que ser admin del sistema; **con el alta self-service de Fase 2 queda abierto a cualquiera — no puede cruzar esa fase abierto.** H-7 y H-8 se cierran juntos (canje explícito ligado al token del correo: campo `invitacion` en `OAuthIn` + el frontend reenvía `?invitacion=`). Quedaron abiertos a propósito: cambian el contrato de `/oauth` y requieren coordinar ambos builders — parcharlo unilateralmente habría creado justo el conflicto que el contrato fijo evitó.
3. **500 por IntegrityError** en `/oauth` (sección 4) — hallazgo de la verificación final, sin corregir.
4. **El flag por cliente para apagar el login legado (decisión 4 de la spec) NO está implementado.** Consecuencia: mientras conviva, cualquiera con la clave compartida de admin puede invitar owners — la revocación individual vale lo que valga la clave compartida.
5. **Auditoría por email en `detalle`, no en columna:** `bitacora.py:65-70` concatena `f'{detalle} · {email_actor}'` y `actor` sigue guardando el rol. Cumple la letra de la spec ("sin columna nueva"), no el espíritu: para saber QUIÉN hizo algo hay que parsear texto libre.
6. **Épocas atadas al legado:** cambiar la clave compartida de worker cierra la sesión de todos los workers con cuenta propia; y cuando un cliente apague el legado, no quedará palanca de revocación masiva.
7. **Sin revocación de Firebase:** una cuenta deshabilitada en la consola de Firebase puede canjear su ID token vigente (hasta 1h). Mitigado por el chequeo de membresía por request.
8. **Operativo:** no hay forma de cambiar el ROL de una membresía (solo `activo`); reinvitar da 409. Carrera hipotética en alta simultánea (obs. 8 del auditor) sin confirmar contra Postgres.
9. **Sandbox:** suite no determinista con `TMPDIR` por defecto por rutas SQLite fijas compartidas entre procesos (`clientes.py:79-84`). Solo tests, no producción.

## 6. Qué tiene que hacer el humano para activar Firebase

Sin esto, la feature entera queda **invisible**: `/api/auth/oauth` responde 503 para siempre y el login se ve idéntico a hoy (esa es la degradación diseñada — nada se rompe, pero nada nuevo aparece).

1. **Crear el proyecto Firebase** en https://console.firebase.google.com (o reusar uno). No hace falta plan pago para Authentication básico.
2. **Habilitar proveedores** en Authentication → Sign-in method: **Google** y **Email/Password**. En Google, configurar el nombre público y correo de soporte.
3. **Dominios autorizados** (Authentication → Settings → Authorized domains): agregar `retail-espacios.onrender.com` (y el dominio propio si existe). Sin esto el popup de Google falla en producción.
4. **Registrar una app Web** (Project settings → General → Your apps → Web) y copiar del snippet de config: `apiKey`, `authDomain`, `projectId`. No hace falta service account ni Admin SDK — el backend verifica los ID tokens contra el JWKS público de Google.
5. **Variables en Render** (dashboard del servicio, y declararlas en `render.yaml` con `sync: false`, como ya se hace con las de correo):
   - Backend (runtime): `FIREBASE_PROJECT_ID` = el project id.
   - Frontend (**build time** — Vite las hornea en el bundle; hay que redeployar tras setearlas): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`.
6. **Probar:** entrar con Google → debería dar 403 "Tu cuenta no tiene acceso a ningún cliente" (correcto: sin invitación no se entra). Después, con un admin legado, invitarse desde Configuración → Usuarios, y volver a entrar con Google.

Nota: la `apiKey` de Firebase web NO es un secreto (identifica el proyecto, viaja en el bundle); el aislamiento real lo dan los dominios autorizados y la verificación server-side del ID token.

## 7. docs/ESTADO.md — SÍ necesita actualización (regla dura de CLAUDE.md, hoy incumplida)

`git diff main -- docs/` está **vacío**. CLAUDE.md dice literal: "si tu cambio altera una regla o un flujo descrito ahí, actualizalo en el mismo PR" — y esta fase agrega un proveedor de identidad, 4 tablas, un router, un endpoint de login y una revocación por request. ESTADO.md sigue describiendo un mundo de dos claves compartidas. Qué diría la actualización:

- **Autenticación (reescribir la sección):** ahora hay DOS vías. (a) Legada: claves compartidas por rol, hasheadas en `app_config` de cada cliente, JWT `{role, epoca, cliente, exp}` — intacta, sin fecha de apagado (el flag por cliente de la decisión 4 de la spec NO está implementado). (b) Cuentas reales: Firebase (Google + correo/clave verificado) → `POST /api/auth/oauth` → mismo JWT + `sub` (id en `usuarios`) y `email`. `owner|admin` → `role=admin`; `worker` → `role=worker`. Verificación de ID tokens en `app/services/firebase_tokens.py` (JWKS de Google, RS256 exclusivo, sin SDK de Firebase).
- **Regla nueva:** un token CON `sub` exige membresía activa en cada request (caché 60s, invalidado al desactivar); un token SIN `sub` se revoca solo por época. Desactivar una membresía corta el acceso de inmediato, incluidos `?token=` y montaje.
- **Modelo de datos:** `usuarios`/`membresias`/`invitaciones`/`oauth_attempts` son tablas de la BASE POR DEFECTO (identidad global, siempre vía `sesion_registro()`), no de las bases por cliente. Sigue rigiendo cero migraciones.
- **Gestión:** `/api/usuarios` (invitar/listar/activar-desactivar), admin-only, opera sobre el cliente del token. UI en Configuración → sección Usuarios.
- **Config de deploy:** `FIREBASE_PROJECT_ID` (backend) y `VITE_FIREBASE_*` ×3 (build del frontend); sin ellas la vía nueva se apaga limpia (503 / pantalla legada).
- **Deuda conocida:** H-7/H-8 (canje de invitación implícito por email — cerrar ANTES del alta self-service de Fase 2), 500 IntegrityError en `/oauth`, flag de apagado del legado pendiente, email del actor en `detalle` de la bitácora.

Además hay material para `docs/engram/`: los gotchas de sesiones (purga de `sys.modules` en conftest vs imports a nivel de módulo en tests; rutas SQLite fijas y contención entre agentes; `--stat` que omite untracked).

## 8. Próximos pasos (en orden)

1. **Antes del merge (bloquean el deploy útil, no el código):**
   a. `render.yaml`: declarar `FIREBASE_PROJECT_ID` y `VITE_FIREBASE_*` con `sync: false` + párrafo de cómo obtenerlas (espejo de lo que ya hace con el correo, líneas 21-39).
   b. Actualizar `docs/ESTADO.md` (sección 7).
   c. Arreglar el 500 de `/oauth` (try/except IntegrityError → 403 genérico) + test. Chico, territorio backend, sin cambio de contrato.
2. **El humano:** crear el proyecto Firebase y cargar las 4 variables (sección 6).
3. **Antes de Fase 2 (self-service) — no negociable:** cerrar **H-8 + H-7 juntos** (canje explícito con el token del correo: `invitacion` en `OAuthIn`, frontend lee y reenvía `?invitacion=`; `GET /api/usuarios` deja de exponer nombre/último login de quien no aceptó). Un builder backend + un ajuste chico de frontend, coordinados porque cambia el contrato.
4. **Fase 2 o mantenimiento:** flag por cliente para apagar el login legado + épocas propias para cuentas reales (revocación masiva sin palanca hoy); cambiar rol de membresía vía PATCH; email del actor a columna propia (tabla nueva o en la próxima que se cree — sin migrar); confirmar la carrera de alta simultánea contra Postgres; desacoplar rutas SQLite de test del nombre del slug.

## 9. Archivos de esta entrega

- Plan y contrato: `features/identidad/outputs/equipo-fase1-identidad.md`
- Informes: `outputs/backend-identidad.md`, `outputs/frontend-login.md`, `outputs/auditoria-seguridad.md` (= `auditor-tokens.md`), `outputs/auditoria-compatibilidad.md` (= `auditor-compat.md`)
- Código backend: `backend/app/models/identidad.py`, `backend/app/services/firebase_tokens.py`, `backend/app/routers/usuarios.py`, y diffs en `backend/app/{auth.py, main.py, routers/auth.py, services/bitacora.py, requirements.txt}`
- Tests: `backend/tests/test_identidad.py` (builder), `backend/tests/test_identidad_ataques.py` (auditor)
- Código frontend: `frontend/src/api/{firebase.ts, auth.ts}`, `frontend/src/pages/{Login.tsx, Dashboard.tsx}`, `frontend/src/store/authStore.ts`, `frontend/src/vite-env.d.ts`, `frontend/package.json`
