# Frontend — Login Fase 1 (Google/correo + gestión de usuarios)

Builder: frontend-login · territorio `frontend/**` · sin commit.

## Qué se construyó

### 1. `frontend/src/api/firebase.ts` (nuevo)

Lee `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
y exporta `firebaseDisponible` (true sólo con las tres presentes). **El import del
SDK es 100% dinámico** — `await import("firebase/app")` / `await import("firebase/auth")`
dentro de cada función, nunca en el top del módulo. Verificado en el build de
producción: el chunk principal sólo contiene el *glue code* del `import()` (nombres
de las funciones y la llamada dinámica); la implementación real de
`firebase/auth` (~128 kB) vive en un chunk aparte que sólo se pide si alguien
toca "Continuar con Google" o envía el formulario de correo. Sin las tres
variables, ese chunk nunca se solicita.

Helpers exportados: `loginConGoogle()` (popup), `loginConCorreo(email, pass)`,
`registrarConCorreo(email, pass)` (alta + envía verificación), `reenviarVerificacion()`,
`resetearClave(email)`, `signOutFirebase()` (no-op si nunca se inicializó nada) y
`describirErrorFirebase(err)` (mapea `error.code` de `firebase/auth` a español).
Los tres primeros devuelven `{ idToken, emailVerified, email }` — la UI decide
si mostrar "revisá tu correo" ANTES de llamar al backend, aunque el backend hace
el mismo chequeo igual (defensa en profundidad, no confía en el cliente).

Dependencia agregada: `firebase@^12.18.0`, con `npm install firebase --legacy-peer-deps`
(el flag es obligatorio en este repo). Se agregó también `frontend/src/vite-env.d.ts`
(`/// <reference types="vite/client" />`) — no existía, y sin él `import.meta.env`
no tipa en este tsconfig (sin `"types": ["vite/client"]`).

### 2. `frontend/src/pages/Login.tsx`

Arriba, sólo si `firebaseDisponible`: botón "Continuar con Google", separador
"o con correo", formulario de correo/contraseña con toggle login ⇄ registro y
enlace "Olvidé mi contraseña". Debajo, separador rotulado **"Acceso anterior"**
y el formulario legado de clave compartida, sin ningún cambio de comportamiento
ni de markup respecto del original.

El ID token va a `POST /api/auth/oauth` (`loginOauth` en `api/auth.ts`) con el
shape exacto del contrato: `{ id_token, cliente? }`. Response `requiere_cliente`
→ selector de cliente (lista `membresias`, texto `nombre · rol`) → se repite el
POST con `cliente` elegido, reusando el mismo `pendingIdToken` (no se vuelve a
pedir el popup de Google).

### 3. `frontend/src/store/authStore.ts`

`setAuth` gana dos parámetros opcionales al final (`email`, `nombre`) para no
romper la firma que ya usa el login legado (`setAuth(token, role, cliente, cliente_nombre)`
sigue andando literal). `logout()` limpia el store igual que antes y además
llama `signOutFirebase()` sin esperarla (fire-and-forget) — si el SDK nunca se
inicializó es un no-op instantáneo. No se tocó `partialize` (no existe uno acá:
todo el store de auth persiste, igual que antes) ni nada de `fixtureStore`.

### 4. Gestión de usuarios — colgada de "Configuración"

No es una pantalla nueva independiente: es una sección más (`UsuariosSection`)
dentro del mismo panel lateral que hoy abre el ícono de engranaje (`SettingsModal`
en `Dashboard.tsx`), que ya era admin-only (`{settingsOpen && isAdmin && ...}`).
Queda entre "Claves de acceso" y "Notificaciones" — es la contraparte moderna de
la primera sección, y conviene verlas juntas mientras dura la transición.

- Lista de miembros (`GET /api/usuarios`): nombre/email, rol en español, "hace
  cuánto" el último login (reusa `haceCuanto`, ya existente en el archivo),
  atenuado si está desactivado.
- Invitaciones pendientes: email, rol, `fraseVencimiento` ("vence en 3 d" /
  "vencida").
- Invitar (`POST /api/usuarios/invitar`): correo + selector de rol
  (trabajador/administrador/dueño). El 409 ("ya es miembro") sale tal cual lo
  manda el backend vía `describeError`.
- Activar/desactivar (`PATCH /api/usuarios/{id}`): confirmación explícita
  (`confirm()`, mismo patrón que ya usan `StoreEditor3D`/`FloorPlan2D` para
  acciones destructivas) SÓLO al desactivar — "le corta el acceso YA". El
  endpoint real devuelve `{ok}` y no la fila actualizada, así que el toggle se
  aplica a la copia local en vez de esperar un objeto que no llega (se
  verificó leyendo `backend/app/routers/usuarios.py`, que corrió en paralelo).

Cero colores o tamaños nuevos: todo el panel reusa `sectionLabelStyle`,
`fieldLabelStyle`, `inputStyle`, `ActionButton`, `FeedbackNote` ya definidos en
`Dashboard.tsx`, y los mismos pixeles que ya conviven ahí (11, 11.5, 12, 12.5,
13 · tokens `--ink-*`, `--danger`, `--success`, `--line*`, `--r-md`).

## Estados cubiertos

| Estado | Cómo se ve |
|---|---|
| **Sin config** (`VITE_FIREBASE_*` ausente) | Login.tsx idéntico byte a byte al de antes de esta fase — la vía nueva ni se monta en el DOM. |
| **Backend sin config** (503 de `/oauth`) | Se intenta (Google o correo funcionan del lado del cliente), el POST da 503, y la vía nueva se reemplaza por un aviso discreto ("no está disponible en este servidor todavía. Usá el acceso anterior"). El acceso legado sigue abajo, sin tocarse. |
| **Un cliente** | `/oauth` devuelve 200 directo → `setAuth` → adentro. |
| **Multi-cliente** | `requiere_cliente: true` → selector con `nombre · rol` → confirma → segundo POST con `cliente` → adentro. Hay "Probar con otra cuenta" para volver atrás sin recargar. |
| **Correo sin verificar** | Detectado del lado del cliente (`emailVerified` del propio SDK, sin ni siquiera llamar al backend) tanto en registro como en login; aviso + botón "Reenviar correo de verificación" (`reenviarVerificacion()`, usa `auth.currentUser`). |
| **403 sin membresía** | Mensaje del backend tal cual ("Tu cuenta no tiene acceso a ningún cliente. Pedí una invitación."), en rojo, sin romper nada más de la pantalla. |
| **Popup de Google cancelado** | Silencioso (no es un error real: la persona se arrepintió), no ensucia la pantalla con un mensaje en rojo. |

## Decisiones de UI

- **La vía nueva completa (botones, ambos formularios, selector de cliente)
  vive detrás de un solo `{firebaseDisponible && (...)}`.** No hay ramas
  parciales: o está todo, o no hay nada — así "se ve exactamente como hoy"
  es literal y no aproximado.
- **El 503 se descubre en tiempo de uso, no antes.** No hay endpoint para
  "preguntar si el backend tiene Firebase configurado" — el contrato sólo
  define `/oauth`. Se intenta con lo que haya (Google o correo), y si
  responde 503 se apaga la sección para el resto de la sesión en esta
  pestaña (no vale la pena dejar botones que van a fallar de nuevo).
- **El chequeo de correo verificado se adelanta en el cliente.** El SDK ya
  sabe `emailVerified` apenas termina el login/registro; se usa esa
  respuesta para no gastar una vuelta al backend mostrando el mismo aviso
  que el 401 hubiera dado. El backend igual lo revalida — el cliente no es
  la fuente de verdad, sólo ahorra un viaje en el camino feliz.
- **Gestión de usuarios no es pantalla nueva: es sección de Configuración.**
  El prompt pedía "colgada de donde hoy vive Configuración", y la lectura
  literal — un ícono nuevo en el header, otra ruta, otro modal — hubiera
  creado un segundo lugar para lo mismo. Una sección más en el panel lateral
  que ya existe es menos superficie y menos que aprender.
- **El toggle activar/desactivar actualiza estado local, no re-pide la
  lista.** El PATCH real (revisado en el código del builder de backend, que
  corrió en paralelo) devuelve `{ok}`, no la fila — pedir toda la lista de
  nuevo por un solo campo sería una vuelta de red de más por cada clic.

## Verificación

```
$ cd frontend && npx tsc --noEmit
$ echo "exit code: $?"
exit code: 0
```

Limpio, sin warnings. También se corrió `npx vite build` completo (sin
errores, sólo el warning preexistente de chunk grande por Three.js) para
confirmar que el `import()` dinámico de Firebase efectivamente separa en un
chunk aparte — se inspeccionó el bundle principal y sólo contiene el nombre
de las funciones y la llamada `import(...)`, no la implementación de
`firebase/auth`.

## Archivos tocados (todo dentro de `frontend/`)

- `frontend/src/api/firebase.ts` — nuevo
- `frontend/src/vite-env.d.ts` — nuevo
- `frontend/src/api/auth.ts` — agregado `loginOauth`/`esRequiereCliente`/tipos
  de oauth y `getUsuarios`/`invitarUsuario`/`setMiembroActivo`/tipos de
  usuarios; nada existente modificado
- `frontend/src/pages/Login.tsx` — reescrito conservando el formulario legado
  intacto, con la vía nueva agregada arriba
- `frontend/src/pages/Dashboard.tsx` — nueva `UsuariosSection` dentro de
  `SettingsModal`, más el import de las funciones nuevas de `api/auth`
- `frontend/src/store/authStore.ts` — `email`/`nombre` en el estado, `setAuth`
  con dos parámetros opcionales más, `logout()` llama `signOutFirebase()`
- `frontend/package.json` / `frontend/package-lock.json` — dependencia
  `firebase` agregada con `--legacy-peer-deps`

## Para el orquestador / auditores

- El contrato de `POST /api/auth/oauth` y de `GET/POST/PATCH /api/usuarios`
  se verificó por LECTURA del código real de `backend/app/routers/auth.py` y
  `backend/app/routers/usuarios.py` (que corrieron en paralelo), no sólo
  contra el documento del plan — encontré una diferencia real: el PATCH
  devuelve `{ok}` y no la fila actualizada, y el frontend está adaptado a
  eso, no al plan.
- No se tocó nada bajo `backend/`.
- No hay pantalla de "olvidé mi contraseña" separada de la de login: el
  enlace vive adentro del formulario de correo, gated a `fbMode === "login"`.
- El `PATCH` de activar/desactivar es la ÚNICA acción destructiva de esta
  sección y es la única con `confirm()`; invitar y reenviar verificación no
  lo piden porque son reversibles o de bajo costo.
