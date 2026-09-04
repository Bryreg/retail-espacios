# Frontend — Fase 2 Clientes: alta, avisos, bloqueo y panel operador

Builder: frontend-clientes · rama `claude/fase-2-clientes` · territorio `frontend/src/**` exclusivo (sin tocar `backend/**`).

## Qué se construyó y dónde vive

### 1. API nueva

- **`frontend/src/api/clientes.ts`** (nuevo) — `altaCliente({id_token, slug, nombre})` →
  `POST /clientes/alta`; `sugerirSlug(nombre)` (slugify en vivo: quita tildes, minúsculas,
  `[^a-z0-9]+` → `_`, recorta puntas, antepone `c` si no arranca con letra); `SLUG_VALIDO`
  (mismo regex que el backend, `^[a-z][a-z0-9_]{1,30}$`).
- **`frontend/src/api/plataforma.ts`** (nuevo) — `soyOperador()` → `GET /plataforma/soy`;
  `getClientesPlataforma()` → `GET /plataforma/clientes`; `patchEstadoCliente(slug, {estado,
  motivo})` → `PATCH /plataforma/clientes/{slug}`; tipos `EstadoCuenta`, `ClientePlataforma`,
  `EstadoClienteActualizado`.
- **`frontend/src/api/auth.ts`** (editado) — `LoginResponse` y `OauthOk` ahora traen
  `aviso_cuenta?: AvisoCuenta` opcional.
- **`frontend/src/api/firebase.ts`** (editado) — `obtenerIdTokenFresco()`: `getIdToken(true)`
  del usuario actual del SDK, para que el alta nunca reuse el `id_token` que ya rechazó `/oauth`.

### 2. Sesión — `frontend/src/store/authStore.ts` (editado)

- Nuevo campo `avisoCuenta: AvisoCuenta | null` (tipo `{estado: "gracia"|"solo_lectura"|
  "suspendido", motivo: string}`), **persistido junto con el resto de la sesión** (mismo
  criterio que `token`/`role`/`cliente`: es el estado de ESTA cuenta, no datos de otros
  clientes). `setAuth` recibe un 7º parámetro opcional `avisoCuenta`; `logout()` lo limpia.
- El `operador` de plataforma **no vive en este store** — se pregunta de nuevo en cada
  sesión (ver Dashboard) y nunca se persiste.

### 3. Pantalla "Creá tu supermercado" — dentro de `frontend/src/pages/Login.tsx` (editado)

- El 403 de `/oauth` ("sin membresías") ya no muestra el error seco: `manejarErrorOauth`
  ahora hace `setSinCliente(true)` y la pantalla entra en el modo alta (mismo lugar donde
  antes vivía el selector de cliente / Google-correo, dentro del bloque `firebaseDisponible`).
  Aplica sin importar el camino que llevó al 403 (Google, correo, o `confirmarCliente`).
- Formulario: nombre → slug sugerido en vivo con `sugerirSlug()`, editable (deja de seguir al
  nombre en cuanto la persona lo toca — `altaSlugTocado`). Validación del lado cliente antes de
  llamar (nombre no vacío, slug con `SLUG_VALIDO`); el resto de los códigos (409/403/422/429)
  se muestran **tal cual** vía `describeError()`.
- Al confirmar: `obtenerIdTokenFresco()` (nunca el token viejo del intento de oauth) → `POST
  /clientes/alta` → éxito se trata exactamente como un oauth exitoso: `setAuth(token, "admin",
  cliente, cliente_nombre, email, nombre)` y entra.
- "Volver" reutiliza `empezarDeNuevo()` (ahora también limpia el estado de alta).

### 4. Aviso de cuenta — banner y bloqueo

- **`frontend/src/components/AvisoCuentaBanner.tsx`** (nuevo) — banner persistente, no modal,
  no bloqueante. Lee `avisoCuenta` del store; `gracia` y `solo_lectura` muestran el motivo
  (variante rotulada distinto: "Pago pendiente" / "Cuenta en solo lectura"); `suspendido` no
  se dibuja acá (pasa a `BloqueoCuenta`). Montado en `pages/Dashboard.tsx`, arriba del Topbar,
  visible para cualquier rol.
- **`frontend/src/components/BloqueoCuenta.tsx`** (nuevo) — pantalla a pantalla completa, sin
  navegación de negocio, con el motivo y un botón "Cerrar sesión". Montada en `App.tsx`: si
  `avisoCuenta?.estado === "suspendido"` reemplaza TODO lo demás (chequeo después del guard de
  `!token`, antes del `BrowserRouter`) — sólo puede llegar ahí una sesión de owner, porque
  worker/admin reciben 402 en el login mismo y nunca guardan sesión.
- **402 en general**: no se tocó el interceptor de `api/client.ts` — sólo reacciona a 401, así
  que un 402 de "solo lectura" nunca desloguea. Cada mutación ya usa `describeError(err, …)` en
  su propio `catch` (patrón preexistente en todo el código: `UsuariosSection`, `ContactsSection`,
  etc.), así que el detail del backend ("Cuenta en solo lectura por pago pendiente.") aparece
  donde falló la acción, sin ninguna pantalla genérica de error.

### 5. Panel del operador

- **`frontend/src/components/Plataforma/PlataformaPanel.tsx`** (nuevo) — modal centrado (mismo
  patrón que `RatesModal`): tabla slug/nombre/estado/motivo/cambiado_en/cambiado_por, fila
  expandible por cliente con selector de los 4 estados + campo motivo obligatorio +
  `confirm()` antes del PATCH, y merge local de la fila devuelta (no vuelve a pedir toda la
  lista). Nada de gráficos ni métricas — panel de operación, no dashboard.
- **`frontend/src/pages/Dashboard.tsx`** (editado) — `useEffect` que llama `soyOperador()` una
  vez montado (cualquier rol, cualquier vía de login — el legado siempre da `false`, así que no
  hace falta distinguir antes de preguntar); si `true`, aparece un botón "Plataforma" en el
  Topbar (`{operador && (<button>…</button>)}` — **no existe en el DOM si es `false`**, no es un
  botón deshabilitado) que abre `PlataformaPanel`. La lista de clientes de plataforma vive
  exclusivamente en el estado del propio panel — nunca toca `localStorage` (mismo espíritu que
  `referenceRates` excluido de `partialize` en `fixtureStore.ts`), y `operador` mismo tampoco se
  persiste: se repregunta en cada sesión.

## Guardrails verificados

- Sin dinero nuevo mostrado a `worker`: nada de lo agregado toca esa superficie.
- Login legado e invitaciones existentes: sin cambios de comportamiento — sólo se agregó el
  paso opcional de leer `aviso_cuenta` de la respuesta si viene.
- Paleta y tipografía: reusa tokens existentes (`--warning`/`--warning-50`/`--warning-100` para
  el banner, `--danger` para el bloqueo y solo_lectura/suspendido en el panel, `--r-md`/`--r-xl`,
  los mismos 7 tamaños). Ningún color ni radio nuevo.
- Llamadas nuevas en `frontend/src/api/`, siguiendo el patrón (`client.get/post/patch(...).then((r) => r.data)`).
- Nada de plataforma en `localStorage`; `avisoCuenta` sí persiste (a propósito, ver arriba).

## Verificación

- `cd frontend && npx tsc --noEmit` → limpio.
- `cd frontend && npx vite build` → build completo sin errores (warning preexistente de chunk
  size, no relacionado).
- `git status` confirma que sólo se tocaron/crearon archivos bajo `frontend/src/**` desde este
  builder — cero cambios en `backend/**`.

## Archivos

**Nuevos:**
- `frontend/src/api/clientes.ts`
- `frontend/src/api/plataforma.ts`
- `frontend/src/components/AvisoCuentaBanner.tsx`
- `frontend/src/components/BloqueoCuenta.tsx`
- `frontend/src/components/Plataforma/PlataformaPanel.tsx`

**Editados:**
- `frontend/src/App.tsx`
- `frontend/src/api/auth.ts`
- `frontend/src/api/firebase.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/store/authStore.ts`
