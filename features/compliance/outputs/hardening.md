# Hardening OWASP — Fase 3 compliance

Builder: **sistemas-maestros / Hardening OWASP — CSP medida, fix contrato-imagen,
CI de dependencias**. Territorio (Iteración 1): bloque de cabeceras de
`backend/app/main.py` (~línea 200-260), `backend/app/routers/files.py`,
`.github/workflows/deps-audit.yml` + `.github/scripts/pip_audit_severity.py`
(nuevos), `backend/tests/test_hardening.py` (nuevo) y ampliaciones a
`backend/tests/test_files_acceso.py`. No se tocó `auth.py`, `alta.py`,
`plataforma.py`, `derechos.py` ni ningún archivo de `frontend/` en la
Iteración 1 — ya venían modificados por otros builders de esta misma fase
(consentimiento, derechos del titular) y no hizo falta ningún cambio de
frontend para la CSP. **La Iteración 2 (más abajo) SÍ tocó frontend** —
`frontend/src/api/files.ts` y `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`
— por la declaración explícita de la cara vigente; sigue sin tocarse
`auth.py`, `alta.py` ni `plataforma.py`.

> **ACTUALIZACIÓN — Iteración 2 (ajuste del Maestro, B-2 bloqueante + M-1).**
> El fix H8 de la Iteración 1 (descrito en la sección 2 original, más abajo)
> quedó estructuralmente incompleto: filtraba por "la imagen más reciente del
> espacio", una heurística que un contrato en JPG sigue pudiendo satisfacer
> (si es la única imagen, o la última en subirse). El Maestro lo diagnosticó
> con los hallazgos X-18/X-18b del red-team y pidió un rediseño: **designación
> explícita**, no otra heurística sobre el orden de subida. La sección 2 de
> abajo describe ahora el diseño CERRADO (Iteración 2); el diseño de la
> Iteración 1 queda documentado ahí mismo, marcado como superado, porque
> explica el porqué del cambio. Ver **"Iteración 2 — B-2 + M-1"** al final de
> la sección 2 para el detalle completo del rediseño, los archivos tocados y
> el estado de los tests del red-team.

---

## 1. CSP y cabeceras de seguridad

### Medición antes de tocar nada

La CSP que ya existía (`backend/app/main.py`, bloque de cabeceras) traía
`connect-src 'self'` y `script-src 'self'` sin excepciones. Eso bloquea el
login por cuentas de Fase 1: el SDK de Firebase Auth necesita salir del
origen propio. Medí qué pide el frontend REAL antes de tocar la política —
sin arrancar un navegador (ver "Cómo se verificó" más abajo), por grep sobre
el código fuente y sobre `node_modules/@firebase/auth` instalado en el repo,
que es exactamente la versión que se sirve.

**`frontend/src/api/firebase.ts` — qué llama el SDK.** El archivo usa,
condicionadas a que existan las tres `VITE_FIREBASE_*`:

- `signInWithPopup` (Google) — **popup**, no redirect. Esto importa para
  `frame-src`, ver abajo.
- `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`,
  `sendEmailVerification`, `sendPasswordResetEmail` — todas contra el SDK,
  sin popup ni iframe.

**`frontend/src/pages/Login.tsx`** confirma que las dos vías (Google y
correo/contraseña) están montadas en la misma pantalla — así que las
concesiones de las dos aplican, no una sola.

**Los hosts de red del SDK**, por grep directo sobre el bundle instalado
(`node_modules/@firebase/auth/dist/esm/index-*.js`, que es el que Vite
empaqueta):

```
$ grep -oE "identitytoolkit[a-zA-Z0-9._-]*|securetoken[a-zA-Z0-9._-]*" \
    node_modules/@firebase/auth/dist/esm/index-*.js | sort -u
identitytoolkit.googleapis.com
identitytoolkit.sandbox.googleapis.com
securetoken.googleapis.com
```

Y la constante que arma el SDK por defecto (misma búsqueda,
`apiHost`/`tokenApiHost`):

```
apiHost: "identitytoolkit.googleapis.com",
tokenApiHost: "securetoken.googleapis.com",
```

Esos DOS son los únicos hosts de red que el SDK contacta — no hay ningún
otro `googleapis.com` ni dominio de Google en el bundle salvo estos y las
URLs de documentación (`cloud.google.com`, `firebase.google.com`, que no son
llamadas de red).

**El popup necesita más que `connect-src`.** `signInWithPopup` instancia
`BrowserPopupRedirectResolver` (mismo archivo, `class
BrowserPopupRedirectResolver` ~línea 10709) ANTES de abrir el popup:

```js
async _openPopup(auth, provider, authType, eventId) {
    debugAssert(this.eventManagers[auth._key()]?.manager,
                '_initialize() not called before _openPopup()');
    ...
}
_initialize(auth) { ... return this.initAndGetManager(auth); }
async initAndGetManager(auth) {
    const iframe = await _openIframe(auth);   // ← acá
    ...
}
```

Y `signInWithPopup` (~línea 9698) llama `this.resolver._initialize(this.auth)`
antes de `_openPopup`, así que esto SIEMPRE corre en el flujo real, no es un
camino alternativo. `_openIframe` (~línea 10461) abre un **iframe oculto**:

```js
: `https://${auth.config.authDomain}/${IFRAME_PATH}`   // IFRAME_PATH = '__/auth/iframe'
```

`authDomain` es `VITE_FIREBASE_AUTH_DOMAIN`, y `render.yaml` documenta el
valor real del proyecto: `recabra.firebaseapp.com`. Ese iframe necesita
`frame-src`.

Ese mismo iframe se comunica por `gapi.iframes`, que si no está ya cargado
en `window.gapi`, el SDK lo baja con un `<script>`:

```js
gapiScript: 'https://apis.google.com/js/api.js',
```

(constante `DEFAULT_CDNDOMAIN` cerca de la línea 11263). Eso necesita
`script-src`.

**Lo que NO hizo falta agregar** (ya estaba cubierto, verificado antes de
tocar la CSP):

- `style-src https://fonts.googleapis.com` — `frontend/index.html:15`, el
  `<link rel="stylesheet">` de Geist/Archivo Narrow. Ya estaba.
- `font-src https://fonts.gstatic.com` — los `.woff2` que baja ese CSS. Ya
  estaba.
- `img-src`/`worker-src` con `blob:`/`data:` — Three.js
  (`@react-three/fiber`) texturiza las caras con `blob:` (fotos bajadas por
  `fileUrl()` en `frontend/src/api/files.ts`) y usa Web Workers también por
  blob. Ya estaba, sin cambios.
- El resto de la app (`frontend/src/api/client.ts`, axios) sólo pega a
  `/api` — mismo origen, cubierto por `'self'`. El backend NUNCA sirve el
  frontend desde otro dominio (`app.mount`/catch-all en `main.py`), así que
  no hace falta ningún otro origen de API.
- No hay `RecaptchaVerifier` ni auth por teléfono en el código — no hizo
  falta `https://www.google.com/recaptcha/api.js`, aunque el SDK lo trae
  como constante (`recaptchaV2Script`); no se usa, no se agrega.

### La CSP final, anotada

```
default-src 'self'
script-src 'self' https://apis.google.com
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com data:
img-src 'self' data: blob:
connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com
worker-src 'self' blob:
frame-src 'self' blob: https://*.firebaseapp.com
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
```

| Directiva | Origen agregado | Por qué / qué archivo lo pide |
|---|---|---|
| `connect-src` | `https://identitytoolkit.googleapis.com` | `firebase.ts`: TODA operación del SDK (login/registro por correo, popup de Google, reset de clave) pasa por `apiHost` de identitytoolkit. |
| `connect-src` | `https://securetoken.googleapis.com` | `firebase.ts`: refresh de ID token (`getIdToken(true)` en `obtenerIdTokenFresco`, y el refresh automático del SDK) pasa por `tokenApiHost`. |
| `script-src` | `https://apis.google.com` | SOLO por `signInWithPopup` (Google, botón "Continuar con Google" en `Login.tsx`): el SDK baja `gapi.iframes` desde ahí si no está cargado, antes de abrir el popup. |
| `frame-src` | `https://*.firebaseapp.com` | Mismo flujo de popup: iframe oculto en `https://<authDomain>/__/auth/iframe` para el mensajero entre ventanas. El wildcard de subdominio cubre `VITE_FIREBASE_AUTH_DOMAIN` (`recabra.firebaseapp.com` según `render.yaml`) sin clavar el nombre del proyecto en el código del backend. |

**Concesiones y su porqué** (todas ya estaban documentadas o se documentan
ahora en el propio archivo, `backend/app/main.py`):

- `'unsafe-inline'` en `style-src` — **la única en toda la política**. React
  pinta con `style={{...}}` (atributos inline) en toda la app; sacarla
  significaría reescribir cada componente para usar clases o un
  `styled-components`/nonce, fuera de alcance de esta fase. NO está en
  `script-src`, que es donde de verdad importa (XSS reflejado/almacenado no
  puede ejecutar un `<script>` inline con esta política).
- `https://apis.google.com` en `script-src` — un origen puntual de Google
  (no un wildcard), necesario SÓLO para el botón de Google. El login por
  correo/contraseña no lo necesita, pero ambas vías conviven en la misma
  pantalla.
- `https://*.firebaseapp.com` en `frame-src` — wildcard de subdominio (no de
  dominio raíz): cualquier proyecto Firebase vive bajo ese sufijo, así que
  el alcance real sigue acotado a la infraestructura de Firebase, no a
  cualquier sitio.

### HSTS: el bug del proxy

La condición vieja, `request.url.scheme == "https"`, **nunca era cierta en
producción**: Render termina TLS en su proxy y reenvía a la app por HTTP
plano, así que Starlette arma `request.url` con `scheme="http"` SIEMPRE,
incluso cuando el navegador entró por HTTPS real. HSTS jamás se hubiera
mandado en `retail-espacios.onrender.com` con esa condición sola — un bug
silencioso porque nada lo hacía fallar visiblemente.

Fix: se agregó `or request.headers.get("x-forwarded-proto") == "https"`, que
es el header que Render (como cualquier proxy inverso estándar) agrega. En
desarrollo directo (uvicorn sin proxy) el header no existe y sigue ganando
la condición de siempre. Verificado con tres tests nuevos en
`test_hardening.py`: sin ninguna señal de TLS (ausente), con
`x-forwarded-proto: https` (presente), y con `x-forwarded-proto: http`
explícito (ausente — sólo la señal positiva cuenta).

### Cabeceras en toda respuesta

`test_hardening.py` agrega cobertura que no existía sobre 404/422/401 (el
200 ya estaba cubierto desde Fase 1 en `test_files_acceso.py`):

- `test_cabeceras_en_200` — `GET /api/health`.
- `test_cabeceras_en_404_de_api` — una ruta que no matchea ningún router (ni
  siquiera el catch-all de la SPA, que en tests SÍ existe porque
  `frontend/dist` está armado en este checkout — se verificó ambos casos:
  con y sin `_DIST`, el 404 de un path `api/...` sale por el mismo
  `raise HTTPException(404)` documentado en `main.py`).
- `test_cabeceras_en_422` — `POST /api/spaces/` con payload vacío (falla la
  validación de Pydantic, no un `HTTPException` a mano — confirma que el
  middleware cubre también el 422 automático de FastAPI).
- `test_cabeceras_en_401_de_auth` — `GET /api/files/1` sin credencial.

Las cuatro verifican `X-Content-Type-Options`, `Content-Security-Policy`
(incluido `frame-ancestors 'none'`), `Referrer-Policy` y
`Permissions-Policy`. El middleware es un solo `@app.middleware("http")` que
envuelve `call_next` para TODA la app — no hay código de ruta que pueda
saltárselo, así que estos cuatro casos son representativos del resto (un
403, un 409, un 429, etc. pasan por el mismo `call_next`).

### Cómo se verificó (sin navegador)

No se levantó un navegador real contra la CSP — este entorno no tiene uno
disponible. Lo que sí se hizo:

1. **Medición estática** descrita arriba: grep sobre `frontend/src` y sobre
   el bundle real de `node_modules/@firebase/auth` instalado (no la
   documentación pública del SDK, el código que Vite empaqueta), leyendo la
   ruta de código exacta que ejecuta `signInWithPopup` para confirmar que
   `_openIframe`/`gapiScript` corren siempre en ese flujo y no son un camino
   alternativo.
2. **Tests automatizados** (`test_hardening.py::test_csp_incluye_...`) que
   confirman que la CSP servida contiene exactamente los orígenes medidos —
   ni de más (se verifica que `script-src` no lleva `unsafe-inline` ni
   `unsafe-eval`) ni de menos.
3. `python -c "import app.main"` — la app importa limpio con la CSP nueva
   (no es una prueba de que el navegador la acepte, pero confirma que el
   string de la política no tiene un error de sintaxis que rompa el
   middleware).

Falta, explícitamente: correr el stack real (`uvicorn` + `vite dev` o build)
con Firebase configurado de verdad y mirar la consola del navegador durante
un login con Google. Es el paso que un humano con navegador tendría que
confirmar antes de dar esto por cerrado en producción — la medición estática
da alta confianza (la ruta de código de `_openIframe`/`gapiScript` es
inequívoca en el bundle), pero no reemplaza abrir DevTools una vez.

---

## 2. Fix H8 — contrato escaneado como imagen, descargable por worker

> **El diseño descrito en esta sección (hasta "Iteración 2 — B-2 + M-1" al
> final) es el de la Iteración 1 y está SUPERADO.** Se deja intacto porque
> explica el hallazgo original y por qué la heurística de "imagen más
> reciente" parecía razonable — pero el código YA NO funciona así. El diseño
> vigente es el de la subsección **"Iteración 2"**, al final de esta sección.

### El hallazgo

`features/vitrinas-3d/outputs/auditor-legal-precios.md` (rama
`claude/sistemas-maestros-retail-mzb1om`), sección H8: el filtro de
`backend/app/routers/files.py` era por `content-type`
(`IMAGENES = {"image/jpeg","image/png","image/webp"}`), no por intención. Un
contrato fotografiado con el celular y subido como espacio se clasifica como
imagen, aparece en `GET /api/spaces/{id}/files` para `worker` y se descarga
por `GET /api/files/{id}` con la cifra a la vista. La bitácora tampoco lo
registraba (sólo anotaba descargas de "documentos").

### Consumidores verificados antes de tocar nada

Grep sobre `frontend/src` para no romper nada real:

- `frontend/src/api/files.ts` — `listSpaceFiles`, `fileUrl`,
  `fetchFileBlob`, `getFaceImages`. `fileUrl()` arma
  `/api/files/{id}?token=` para `<img>`/`<iframe>` (no puede mandar header
  Authorization).
- Consumidores de `listSpaceFiles`/`fileUrl`:
  `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`,
  `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx` (vía
  `getFaceImages`, para pintar el 3D), `frontend/src/components/
  FileViewerModal.tsx`, `frontend/src/pages/DashboardView.tsx`.
- El worker en el celular (`frontend/src/pages/MountView.tsx`) **NO** usa
  `listSpaceFiles` ni `fileUrl` — usa `planometriaDelEspacio`/
  `planometriaUrl` (`frontend/src/api/planograms.ts`), que cuelga de
  `LeaseFile` y del router `/api/montaje/*` con su propio token de rol
  `montaje`. Es territorio explícitamente fuera de este fix (el Maestro lo
  marcó "NO se toca") y el grep confirma que no lo cruza: `montaje.py` no
  importa nada de `files.py`.
- `backend/app/routers/spaces.py:180-219` (`list_face_images`,
  `MOUNT_FILE_PREFIX`) — el criterio que ya existía para pintar el 3D:
  imagen más reciente por espacio, excluyendo el prefijo de foto de
  montaje.

Conclusión: **el diseño sugerido por el Maestro es exactamente correcto**
para los consumidores reales — no hizo falta desviarse a otra derivación por
rol.

### El diseño

Se reemplazó el filtro por content-type por un filtro por **cuál imagen**:

- **admin**: ve todo (sin cambios).
- **worker**: ve sólo dos cosas —
  1. sus propias fotos de montaje (`filename` con `MOUNT_FILE_PREFIX =
     "montaje--"`, el mismo prefijo que usa `mounts.py`), y
  2. la **cara vigente** del espacio: la imagen más reciente
     (`content_type` imagen, sin el prefijo de montaje) — el MISMO criterio
     que usa `list_face_images` en `spaces.py`, pero resuelto por espacio.
- Todo lo demás —documentos por content-type de siempre, **y ahora también
  cualquier imagen que no sea la cara vigente ni una foto de montaje**
  (una versión vieja pisada, o el contrato en JPG del hallazgo)— queda
  fuera: no se lista, y la descarga da 404 (no 403 — convención ya
  establecida en el archivo: un 403 confirmaría que el archivo existe).

`backend/app/routers/files.py`:

- `_cara_vigente_id(db, space_id)` — una consulta (`ORDER BY uploaded_at
  DESC, id DESC LIMIT 1`, filtrando `content_type LIKE 'image/%'` y
  excluyendo `MOUNT_FILE_PREFIX`) para la descarga de UN archivo
  (`GET /files/{id}`), donde no hay más contexto que `row.space_id`.
- En `list_space_files` **no hace falta una segunda consulta**: la lista ya
  viene ordenada por `uploaded_at DESC, id DESC`, así que la cara vigente es
  simplemente la primera imagen (no de montaje) en ese orden — se resuelve
  en memoria sobre la misma lista que ya se trajo. El desempate por `id`
  (agregado al `order_by` que ya traía el endpoint, que sólo ordenaba por
  fecha) no es cosmético: sin él, dos archivos subidos en el mismo segundo
  podían ordenar distinto acá que en `_cara_vigente_id` (que sí desempataba
  por id, para calzar con `list_face_images` de `spaces.py`) — el worker
  hubiera podido ver una cara en el listado y otra, o un 404, al tocarla.
- `_puede_ver(rol, filename, *, es_cara_vigente)` reemplaza a la vieja
  `_puede_ver(rol, content_type)`.

**Bitácora**: se generaliza la condición de "documento" (`archivo.descarga`)
a "lo que un worker no vería" — antes era sólo `_es_documento(content_type)`,
ahora es `not (foto_de_montaje or cara_vigente)`, sin importar qué rol
descargue. Así una imagen que dejó de ser (o nunca fue) la cara vigente
queda anotada exactamente como un documento, tal como pide la spec — el
admin bajando un JPG viejo también queda registrado, porque la pregunta que
la bitácora tiene que poder contestar ("quién se llevó qué") no depende de
quién tenga permiso.

### Tests nuevos (`backend/tests/test_files_acceso.py`)

- `test_contrato_escaneado_como_jpg_no_es_la_cara_vigente` — sube un
  contrato en JPG y DESPUÉS una cara de proveedor más nueva sobre el mismo
  espacio: el worker no ve el contrato en el listado (`{cara}` únicamente),
  `GET /files/{contrato}` da 404 tanto con header `Authorization` como con
  `?token=` (el camino de `<img>`/`<iframe>`); la cara vigente sí baja para
  worker por las dos vías; el admin sigue bajando TODO por header y por
  `?token=` (no se le rompió nada).
- `test_la_foto_de_montaje_sigue_visible_para_el_worker_con_un_contrato_jpg`
  — un espacio con contrato JPG + cara vigente + foto de montaje: el worker
  ve `{cara, foto_montaje}`, nunca el contrato.
- `test_bajar_un_jpg_ya_no_vigente_queda_en_bitacora` — el admin baja un JPG
  que dejó de ser la cara vigente y la bajada aparece en
  `GET /api/bitacora/` con `accion == "archivo.descarga"`.

Los tests preexistentes de H1 (worker no ve/baja documentos,
404-no-403, sin credencial no baja nada, cabeceras en 200) siguen en verde
sin cambios: con una sola imagen por espacio esa imagen ES la cara vigente,
así que el comportamiento visible no cambió para el caso de un solo
archivo-imagen por espacio.

---

### Iteración 2 — B-2 (bloqueante) + M-1

**Diagnóstico aceptado, tal cual lo dio el Maestro:** "cara vigente = imagen
más reciente" es estructuralmente incapaz de distinguir un contrato
escaneado de la cara del mueble. Si el contrato es la ÚNICA imagen del
espacio (X-18b, el escenario original de H8) o se sube DESPUÉS de la cara
real (X-18), la heurística lo declara "el más reciente" y vuelve a ser la
cara — con el agravante de que `list_face_images` (spaces.py) lo pintaba
como TEXTURA DEL 3D para todo el mundo, no sólo lo bajaba el worker. El
red-team (`test_compliance_ataques.py`) cerró estos dos casos como
`xfail(strict=True)`, más un tercero (X-19: el prefijo de montaje en el
NOMBRE bastaba, sin mirar content-type — un `montaje--contrato.pdf` se
colaba, y además esquivaba la bitácora).

#### El rediseño: designación explícita, no otra heurística

`space_files` sigue sin poder llevar una columna nueva (regla dura, sin
migraciones). La designación vive en una **tabla nueva**, mismo patrón que
`MountConfirmation`/`ArchivedSpace` (`create_all()` la crea, `ALTER TABLE`
no hace falta):

```python
# backend/app/models/models.py
class SpaceFace(Base):
    __tablename__ = "space_faces"
    space_id = Column(Integer, ForeignKey("spaces.id"), primary_key=True)
    file_id = Column(Integer, ForeignKey("space_files.id"), nullable=False)
    designado_en = Column(DateTime(timezone=True), default=...)
```

Una fila POR ESPACIO (`space_id` es la primary key): designar una cara nueva
REEMPLAZA la anterior in-place, no acumula historial — ni al 3D ni al worker
les importa cuáles lo fueron, sólo cuál lo es ahora.

**Cómo se declara.** `POST /api/spaces/{id}/files` gana un campo de form
OPCIONAL, `uso` (`backend/app/routers/files.py:141`, `USOS_VALIDOS = {"cara"}`
en la línea 125): con `uso=cara`, el admin declara ESA imagen recién subida
como la cara vigente del espacio — se valida que sea una imagen de verdad
(`422` si no, línea 167) y se hace upsert sobre `SpaceFace` (línea 188). El
prefijo de foto de montaje, en cambio, lo sigue poniendo el SERVIDOR en
`mounts.py` (`MOUNT_FILE_PREFIX` + código + nombre) — no hay ningún campo del
form por el que el cliente pueda fingir esa ruta; se verificó con grep que
`mounts.py::registrar_montaje` arma el `filename` sin tocar nada que venga
del lado del que llama.

**De dónde sale la designación en el resto del código — LA MISMA fuente en
los tres lugares, a propósito, para que el 3D y el gate del worker nunca
puedan desacordar:**

- `files.py::_cara_vigente_id(db, space_id)` — `SELECT file_id FROM
  space_faces WHERE space_id = ?`. Ya no hay `ORDER BY uploaded_at`.
- `files.py::list_space_files` — la misma consulta, una vez por listado (ya
  no hace falta el desempate por `id` que tenía la Iteración 1: no hay
  ninguna carrera entre "cuál es la más reciente" en dos consultas distintas,
  porque ya no hay ninguna consulta por recencia).
- `spaces.py::list_face_images` (la que consume el 3D) — se REESCRIBIÓ
  entera: la window function `row_number() OVER (PARTITION BY space_id ORDER
  BY uploaded_at DESC)` se reemplazó por un JOIN directo contra `SpaceFace`.
  Un espacio sin fila en `SpaceFace` **no aparece** en la respuesta — el 3D
  se queda sin textura para ese espacio, no "adivina" una.

**`_es_foto_montaje` gana el chequeo de content-type (M-1, X-19):**

```python
def _es_foto_montaje(filename, content_type) -> bool:
    return (filename or "").startswith(MOUNT_FILE_PREFIX) and (content_type or "").startswith("image/")
```

Antes bastaba el nombre. Ahora también tiene que ser una imagen de verdad —
y el content-type SIEMPRE se deriva server-side de la extensión validada
(`files.py`) o de una lista cerrada (`mounts.py::PHOTO_TYPES`), nunca del
header que manda el cliente, así que esta comprobación no es falsificable
subiendo un PDF con content-type `image/jpeg` a mano. **Nota de diseño
importante que el mandato original no mencionaba:** se comparó contra
`(content_type or "").startswith("image/")` y NO contra el `IMAGENES`
estricto (`{"image/jpeg","image/png","image/webp"}`) que ya existía en el
archivo — `mounts.py::PHOTO_TYPES` acepta también `image/heic` e
`image/heif` (fotos de iPhone sin convertir; hay un test de regresión
dedicado, `test_an_iphone_photo_is_accepted` en `test_mounts.py`, que ya
cubría la subida). Exigir el conjunto estricto acá hubiera dejado a un
mercaderista con iPhone SIN VER su propia foto de montaje — lo encontré
al revisar `mounts.py::PHOTO_TYPES` antes de tocar la condición, no lo
reportó ningún test hasta que agregué uno (`test_foto_de_montaje_heic_...`)
que falla con el `IMAGENES` estricto y pasa con `image/%`.

Y la condición de bitácora (`files.py`, la que decide si una descarga se
anota) usa el `_es_foto_montaje` YA corregido — el bypass del nombre no
esquiva tampoco el registro.

#### Consumidores verificados (Iteración 2)

- `frontend/src/api/files.ts::getFaceImages` — sin cambios de contrato (sigue
  devolviendo `{code, file_id}[]`); lo que cambia es que un espacio legado
  (subido antes de este fix) deja de aparecer hasta que se lo designe de
  nuevo. Es el comportamiento BUSCADO, documentado abajo.
- `StoreEditor3D.tsx` (vía `getFaceImages`) — no se tocó: consume la misma
  forma de respuesta, sólo que ahora puede venir con menos filas.
- `mounts.py::registrar_montaje` — grep confirmó que sigue armando el
  `filename` con el prefijo server-side y que nunca pasa por `uso`
  (`mounts.py` no llama a `upload_space_file`, tiene su propio INSERT
  directo a `SpaceFile`); no hacía falta tocarlo para (a)/(b)/(c), sólo para
  el bug de HEIC en (d) — que en realidad es un fix en `files.py`, no en
  `mounts.py`.

#### Fail closed: consecuencia buscada, no un descuido

**Un espacio sin ninguna designación no tiene cara para nadie que no sea
admin.** Todo espacio con archivos de ANTES de este deploy —toda la base
instalada hoy— entra en esa categoría: el 3D pierde la textura y el worker
deja de ver imágenes de ese espacio (salvo sus propias fotos de montaje)
hasta que un admin vuelva a subir o re-declare una cara con `uso=cara`. Es
la consecuencia directa e inevitable de "designación explícita, no
heurística": no hay forma de inferir con seguridad cuál imagen vieja *habría
sido* la cara sin volver a caer en la misma clase de heurística que el
Maestro pidió eliminar. **Esto es una migración de datos operativa
pendiente, no un bug**: hay que avisarle al equipo de producto que, tras
este deploy, alguien tiene que re-recorrer los espacios con contrato y
volver a marcar la cara de cada uno (o re-subir el arte con el toggle
nuevo). No se armó un script de backfill automático porque cualquier
heurística de backfill ("la imagen más reciente de cada espacio, a las
12:00:00 del día del deploy") es exactamente el defecto que se está
corrigiendo, aplicado una vez en vez de en cada request — se decidió no
reintroducirlo ni siquiera como transición.

#### Frontend: la declaración en el flujo de subida existente

Cambios mínimos, en el panel de archivos que YA tenía cada espacio
(`frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`, componente
`FilesSection` — es territorio de nadie más en esta fase, no se coordinó con
otro builder):

- `frontend/src/api/files.ts::uploadSpaceFile` gana un tercer parámetro
  opcional, `uso?: "cara"`, que se agrega al `FormData` sólo si viene.
- `FilesSection` gana un checkbox, "Es la cara del mueble (textura del 3D)",
  visible sólo para admin, DEBAJO de la lista de archivos y ARRIBA del botón
  "＋ Subir archivo" — se aplica al PRÓXIMO archivo que se suba, se
  desmarca solo después de cada subida (éxito o error) para que no quede
  "pegado" sin querer en el siguiente archivo. Si está marcado y el archivo
  elegido no es una imagen, se corta ANTES de pegarle al backend con un
  mensaje claro ("Sólo una imagen (JPG, PNG o WEBP) puede marcarse como cara
  del mueble") — el 422 del backend queda como defensa en profundidad, no
  como la única señal que ve el admin.
- **Default a propósito: DESAPAGADO, no encendido.** Uno podría argumentar
  que "la próxima imagen que subís es la cara" debería ser el default (era,
  en los hechos, el comportamiento viejo). Se decidió lo contrario: el
  default apagado obliga a una acción deliberada, que es justamente lo que
  el fix pide — un admin que sube el contrato escaneado sin pensarlo dos
  veces NO lo convierte en la cara por accidente. El costo es un clic extra
  cuando SÍ es la cara; el beneficio es que subir CUALQUIER OTRA COSA nunca
  la reemplaza sin querer.

`npx tsc --noEmit` corre limpio con este cambio (ver "Verificación" al
final).

#### Tests nuevos y reescritos

**`backend/tests/test_files_acceso.py`** (`_subir` gana un kwarg `uso=None`
que agrega `data={"uso": uso}` a la llamada multipart):

- Los tres tests de la Iteración 1 (`test_contrato_escaneado_como_jpg_...`,
  `test_la_foto_de_montaje_sigue_visible_...`, `test_bajar_un_jpg_ya_no_...`)
  se RENOMBRARON y se les agregó `uso="cara"` a la subida de la cara real —
  sin eso, bajo el diseño nuevo, ninguna imagen sin designar sería la cara y
  las aserciones de la Iteración 1 dejarían de tener sentido.
- `test_el_trabajador_no_lista_ni_baja_documentos` (test preexistente, de
  H1) también se actualizó: la foto ahora se sube con `uso="cara"`.
- **Nuevos, uno por escenario que pidió el Maestro:**
  - `test_x18_contrato_jpg_subido_despues_de_la_cara_no_la_reemplaza` — cara
    designada primero, contrato subido DESPUÉS sin `uso`: el worker sigue
    sin ver el contrato (cierra X-18).
  - `test_x18b_espacio_cuyo_unico_adjunto_es_el_contrato_jpg_no_designado` —
    el contrato es el ÚNICO archivo del espacio, sin designar: listado
    vacío para worker, 404 por header y por `?token=`, Y la bajada del admin
    queda en bitácora (cierra X-18b).
  - `test_espacio_sin_designacion_el_worker_no_ve_ninguna_imagen_no_de_montaje`
    — varias imágenes, ninguna designada: el worker no ve NINGUNA (fail
    closed explícito, más allá del caso de un solo archivo).
  - `test_x19_montaje_contrato_pdf_no_cuela_por_el_nombre` — PDF con el
    prefijo de montaje en el nombre: 404 para worker por header y por
    `?token=`, Y bitácora al bajarlo el admin (cierra X-19).
  - `test_designar_una_cara_nueva_reemplaza_a_la_anterior` — segunda
    designación desplaza a la primera, en `list_space_files` Y en
    `GET /spaces/face-images`.
  - `test_designar_como_cara_exige_una_imagen` — `uso=cara` sobre un PDF →
    422.
  - `test_uso_invalido_es_422` — cualquier valor de `uso` que no sea
    `"cara"` → 422.
  - `test_face_images_solo_lista_espacios_con_designacion` — la MISMA
    designación que ve el worker es la que consume el 3D: sin ella, el
    espacio no aparece en `/spaces/face-images`; con ella, aparece con el
    `file_id` correcto.
  - `test_foto_de_montaje_heic_sigue_visible_para_el_worker` — regresión
    dirigida al bug de HEIC que encontré yo mismo al escribir el fix de M-1
    (ver arriba): sube una foto de montaje `image/heic` por
    `POST /api/mounts/` y confirma que el worker la sigue viendo y bajando.
    Sin el fix (`_es_foto_montaje` contra el `IMAGENES` estricto), este test
    falla.

16 tests en total en el archivo (era 7 antes de la Iteración 2).

**`backend/tests/test_compliance_ataques.py`** — territorio del auditor
red-team, NO se tocaron los marcadores `xfail`. Se hicieron dos cambios
mínimos y quirúrgicos, necesarios porque el propio rediseño que pidió el
Maestro invalida el supuesto con el que estaban escritos dos tests que NO
son xfail (se supone que ya pasan):

- `_subir` (helper del archivo) ganó el mismo kwarg `uso=None` que
  `test_files_acceso.py`.
- `test_x17_el_contrato_jpg_pisado_por_una_cara_mas_nueva_no_baja_para_worker`
  y `test_x20_la_cara_vigente_del_3d_sigue_bajando_para_el_worker` —
  ninguno de los dos está marcado `xfail`, así que se supone que YA
  representan el comportamiento cerrado. Los dos subían una "cara" sin
  declararla (dependían de que fuera "la más reciente"); con el diseño
  nuevo eso ya no alcanza — sin `uso="cara"` en esa subida, NINGUNA imagen
  sería la cara y el worker vería el listado vacío, no `{cara}`. Se les
  agregó `uso="cara"` a la subida de la imagen que el test llama "cara" —
  la intención del test (que la cara DE VERDAD siga bajando) queda intacta;
  sólo cambió cómo se declara cuál es. No se tocó ninguna otra línea de
  esos dos tests.
- **No se tocó nada del resto del archivo** — las otras 21 pruebas de las
  secciones [1]-[4] y [6] no dependen de `SpaceFace` ni de `_es_foto_montaje`
  y no se vieron afectadas.

**`backend/tests/test_mounts.py`** — un test SÍ dependía de la vieja
semántica de `list_face_images` y no es mío (`test_mounts.py` no está en mi
territorio explícito, pero prueba directamente el comportamiento de
`spaces.py::list_face_images`, que sí lo está — "sus tests"):

- `test_the_mount_photo_is_not_a_planogram` subía el arte del proveedor SIN
  declararlo como cara (dependía de "es la más reciente" para que
  `/spaces/face-images` lo devolviera). Se le agregó `data={"uso": "cara"}`
  a esa subida; la aserción que importa —que la foto de montaje NO le roba
  el lugar al arte del proveedor— sigue siendo exactamente la misma
  comprobación, y sigue siendo la comprobación correcta bajo el diseño
  nuevo.
- El resto del archivo (19 tests más) no toca `list_face_images` y pasa sin
  cambios.

#### Estado de los xfail — destrabado por el auditor red-team durante esta misma sesión

Al cerrar el fix, **X-18, X-18b y X-19 daban `XPASS(strict)`** al correr
`test_compliance_ataques.py` — el comportamiento SEGURO que afirman esos tres
tests SE CUMPLÍA con el código, y `strict=True` hacía que la suite saliera en
rojo con `XPASS` hasta que alguien les sacara el marcador `xfail`. **No les
saqué el marcador yo** (instrucción explícita del Maestro: es la
certificación del auditor, no mía) — avisé formalmente que estaban listos.
**El auditor red-team, trabajando en paralelo sobre el mismo archivo, ya se
los sacó**: confirmado por grep sobre `test_compliance_ataques.py` — las
funciones se renombraron (`..._no_baja_para_worker` en vez de
`..._deberia_bajar_para_worker`, quitando el condicional de "hallazgo
abierto") y ya no llevan el decorador `xfail`. Corren hoy como tests
normales, en verde. Lo mismo pasó con **X-27** (ver más abajo, un hallazgo
que agregó el propio auditor sobre este fix, no del encargo original): lo
corregí, y el auditor también le sacó el marcador. Sólo quedan abiertos,
a propósito, **X-19b** y **X-28** — ninguno de los dos estaba en el encargo
de B-2/M-1; se explican más abajo.

#### Hallazgos que agregó el propio auditor red-team, en paralelo, sobre este mismo fix

Mientras se trabajaba esta iteración, otra sesión (el auditor red-team, en el
mismo checkout) agregó CINCO tests nuevos a `test_compliance_ataques.py`
dirigidos específicamente al diseño por designación (`X-25` a `X-29`), más
uno sobre la bitácora (`X-19b`). Como comparten archivo y se corrigen en
tiempo real, documento acá el estado de cada uno tal como quedó al terminar:

| Test | Qué ataca | Estado |
|---|---|---|
| X-25 | `uso=cara` sobre un no-imagen (PDF, CSV), y valores de `uso` fuera de catálogo (`"montaje"`, `"CARA"`) — todo 422, nada queda designado a medias | **Pasa** sin cambios — el diseño ya lo cubría (`USOS_VALIDOS`, validación de `_es_imagen` antes del upsert). |
| X-26 | La designación no cruza de un espacio a otro; no hay endpoint lateral (`POST/PUT /spaces/{id}/face`, `PATCH /files/{id}`) para designar un `file_id` ajeno | **Pasa** sin cambios — `SpaceFace(space_id=space_id, file_id=row.id)` se crea siempre contra el `space_id` de la URL del upload, y no existe ningún endpoint de designación aparte del propio upload. |
| X-27 | `DELETE /api/files/{id}` no limpiaba `space_faces`; en SQLite (sin `AUTOINCREMENT`) el próximo INSERT puede reusar el rowid borrado y el archivo siguiente hereda la designación sin que nadie la pidiera | **Encontrado real, CORREGIDO en esta misma iteración** (no estaba en el encargo original del Maestro — lo trajo el test del auditor). Ver más abajo. |
| X-28 | `_es_foto_montaje` sigue confiando en el NOMBRE que el cliente elige en el upload GENÉRICO (`POST /spaces/{id}/files`, no `POST /mounts/`): una imagen llamada `montaje--contrato.jpg` subida por ese camino cumple prefijo + content-type de imagen sin que nadie la haya designado, baja para el worker, y además esquiva la bitácora (misma condición reusada) | **Abierto, documentado, NO corregido.** Ver "Por qué X-28 queda abierto" más abajo. |
| X-29 | `list_face_images` (la que alimenta el 3D) ya no devuelve el contrato JPG más reciente; un espacio sin designación no aparece; re-designar mueve la fila y no deja historial | **Pasa** — es la comprobación en `spaces.py` del mismo rediseño. |
| X-19b | El 404 que recibe el worker se levanta ANTES del bloque `anotar` (`files.py`, `_puede_ver` corta el flujo antes de la anotación): un INTENTO de bajar algo prohibido no deja ninguna fila en `audit_log`, así que numerar `/api/files/1..N` buscando contratos no queda rastreado en absoluto | **Abierto, NO corregido** — fuera del encargo de B-2/M-1 (que pide anotar DESCARGAS restringidas, no INTENTOS rechazados); es una decisión de diseño distinta (¿se anota cada 404, con el volumen que eso implica?) que no me correspondía tomar sola en esta iteración. |

**X-27 — el fix, ya en el código** (`backend/app/routers/files.py`,
`delete_file`):

```python
db.query(SpaceFace).filter(SpaceFace.file_id == file_id).delete()
db.delete(row)
db.commit()
```

Borrar el `SpaceFile` sin borrar la fila de `SpaceFace` que lo señala dejaba
una designación colgada apuntando a un id que ya no existe — inofensivo en
Postgres (el próximo id sale de una secuencia que nunca retrocede), pero
peligroso en SQLite (que es lo que corren los tests, y lo que corre en
desarrollo local): sin `AUTOINCREMENT` explícito, SQLite reutiliza el rowid
libre más alto en el próximo INSERT. Borrar la cara y subir el contrato a
continuación podía hacer que el contrato heredara EXACTAMENTE el id de la
cara borrada y quedara designado sin que nadie lo pidiera — H8 reabierto por
una puerta que no tiene nada que ver con la designación en sí. El fix borra
la fila de `SpaceFace` en la misma transacción que borra el archivo: fail
closed otra vez — el espacio queda sin cara hasta que un admin designe de
nuevo, en vez de arriesgar una designación fantasma. Verificado: `X-27` pasó
de `xfail` a `XPASS(strict)` con este cambio, y el auditor red-team ya le
sacó el marcador en el archivo compartido (docstring actualizado a "CERRADO
durante la Iteración 2") — corre hoy como test normal, en verde.

**Por qué X-28 queda abierto — el análisis, para que quien lo tome después no
repita el camino:**

Cerrarlo del todo pide que `POST /spaces/{id}/files` (el upload GENÉRICO,
admin-only) RECHACE cualquier nombre de archivo que empiece con
`MOUNT_FILE_PREFIX` — ese namespace está reservado para lo que arma
`mounts.py` server-side. Es un cambio de una línea en `files.py`. El problema
es el radio: **todos** mis propios tests nuevos y los ya existentes de
`test_files_acceso.py`, `test_compliance_ataques.py` y `test_mounts.py`
simulan "una foto de montaje" subiéndola por el camino GENÉRICO con un
nombre `montaje--...` a mano (`_subir(..., "montaje--...")`), en vez de
pasar por el endpoint real `POST /api/mounts/` — es el atajo que ya traía la
Iteración 1 y que yo mismo seguí usando. Si `files.py` empieza a rechazar ese
prefijo, TODOS esos tests (más de media docena, en tres archivos, dos de
ellos NO son míos — `test_compliance_ataques.py` es del auditor,
`test_mounts.py` tiene un test que también lo usa así) hay que reescribirlos
para que monten la foto por `POST /api/mounts/` de verdad. Es un cambio
correcto y lo suficientemente grande como para que decidirlo y ejecutarlo en
el resto de las suites de otra sesión, en paralelo, sin coordinarlo, sea más
riesgoso que dejarlo documentado y abierto para una iteración con ese alcance
explícito. **Dirección del fix, para la próxima vuelta:** (1) en
`upload_space_file`, `422` si `(file.filename or "").startswith(MOUNT_FILE_PREFIX)`;
(2) reescribir las simulaciones de "foto de montaje" en los tres archivos de
test para que pasen por `POST /api/mounts/` en vez del upload genérico.

#### Archivos tocados (Iteración 2, además de los de la Iteración 1)

- `backend/app/models/models.py` — clase nueva `SpaceFace`.
- `backend/app/routers/files.py` — `_es_foto_montaje` (gana `content_type` y
  el chequeo `image/heic`-friendly), `_cara_vigente_id` (pasa a leer
  `SpaceFace`), `_puede_ver` (gana `content_type`), `upload_space_file`
  (campo `uso`, upsert de `SpaceFace`), `list_space_files` (ya no hay
  desempate por recencia — no hace falta), `delete_file` (limpia la fila de
  `SpaceFace` del archivo borrado — fix de X-27, hallazgo del auditor).
- `backend/app/routers/spaces.py` — `list_face_images` reescrito contra
  `SpaceFace`; se sacaron los imports que quedaron sin uso (`func` de
  sqlalchemy, `SpaceFile`, `MOUNT_FILE_PREFIX`).
- `backend/app/routers/mounts.py` — SIN CAMBIOS (se verificó que arma el
  prefijo server-side y no necesitaba tocarse para (a)/(b)/(c); el bug de
  HEIC que se encontró se corrigió del lado de `files.py`, no acá).
- `backend/tests/test_files_acceso.py` — reescrito (16 tests).
- `backend/tests/test_compliance_ataques.py` — dos tests (`x17`, `x20`) +
  el helper `_subir` ganaron `uso`. Nada más — los tests `x25`-`x29`/`x19b`
  son del auditor, no los toqué.
- `backend/tests/test_mounts.py` — un test (`test_the_mount_photo_is_not_a_planogram`)
  ganó `uso=cara` en su subida de arte.
- `backend/tests/test_bitacora.py` — `test_la_imagen_no_ensucia_la_bitacora`
  ganó `uso=cara`: sin designar, la exención de bitácora ya no aplica (es
  justamente el punto del fix — una imagen sin designar se trata como
  documento en la bitácora también).
- `frontend/src/api/files.ts` — `uploadSpaceFile` gana el parámetro `uso`.
- `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx` — checkbox de
  declaración en `FilesSection`.

---

## 3. CI de dependencias

`.github/workflows/deps-audit.yml` (nuevo), dispara en `pull_request`
(aparte de `deploy.yml`, que sigue gateando el deploy con su propio
`pytest`/`tsc` — los dos workflows son independientes).

**Job `python`**: `pip install pip-audit` + `pip-audit -r requirements.txt
--format json`. `pip-audit` devuelve exit 1 apenas encuentra UNA
vulnerabilidad de CUALQUIER severidad, así que el paso corre con `|| true`
para siempre producir el JSON, y el veredicto de pasar/fallar lo decide
`.github/scripts/pip_audit_severity.py` (nuevo, no un heredoc inline —
se probó que un heredoc de Python indentado dentro de un bloque YAML `run:
|` rompe con `IndentationError` porque bash no le quita la sangría a un
heredoc `<<'PYEOF'`; un archivo `.py` aparte evita el problema y es
testeable solo).

`pip-audit` no expone severidad en su JSON, así que el script consulta
`https://api.osv.dev/v1/vulns/{id}` por cada vulnerabilidad reportada —
`database_specific.severity` (texto LOW/MODERATE/HIGH/CRITICAL, lo que usan
los avisos GHSA) o, si falta, el score de un vector CVSS_V3 bucketizado
(≥9.0 CRITICAL, ≥7.0 HIGH, ≥4.0 MODERATE, si no LOW). Sólo falla el job si
hay al menos una CONFIRMADA como HIGH/CRITICAL; una severidad que no se pudo
determinar (red caída, id no encontrado en OSV) se imprime en el log pero
**no** cuenta como high/critical — documentado explícitamente como una
decisión de "no llorar lobo" que corta para los dos lados: no se bloquea un
PR por algo sin confirmar, aunque eso deja un hueco teórico si OSV está
caído justo cuando hay una vulnerabilidad real sin poder clasificar.

Verificado en este entorno (con acceso a red):
- JSON sin vulnerabilidades → exit 0.
- Una vulnerabilidad real y conocida (`GHSA-3f63-hfp8-52jq`, Pillow) →
  el script la detecta como `CRITICAL` contra la API real de OSV.dev y
  devuelve exit 1, con el paquete/versión impreso.
- Un id inexistente en OSV (404) → se imprime "severidad desconocida", no
  cuenta, exit 0.

**Job `node`**: `npm ci --legacy-peer-deps` (mismo requisito que
`deploy.yml`) + `npm audit --omit=dev --audit-level=high`. Acá SÍ hay un
mecanismo nativo de la herramienta (`--audit-level`) — no hizo falta
filtrado explícito. `--omit=dev` deja afuera las herramientas de build
(vite, typescript, etc.), que no viajan a producción.

**Lo que NO se hizo, y por qué**: correr los dos jobs en este entorno contra
las dependencias REALES del repo (`backend/requirements.txt` y
`frontend/package-lock.json`) — instalar `pip-audit`/`npm audit` completo
contra las versiones pineadas del repo no formaba parte del alcance
verificable sin ejecutar el workflow en GitHub Actions; se validó en cambio
que el YAML parsea (`python3 -c "import yaml; yaml.safe_load(...)"`), que el
script Python compila y corre correctamente contra JSON de prueba (vacío,
con una vulnerabilidad real, con un id 404), y que la sintaxis de cada paso
es la misma que ya usa `deploy.yml` (mismas versions de `setup-python`/
`setup-node`, mismo `--legacy-peer-deps`). Un humano con acceso al repo en
GitHub debería confirmar el primer run real en un PR.

---

## 4. Revisión puntual

### Tamaño máximo en endpoints que reciben archivo

| Endpoint | Archivo:línea | Límite |
|---|---|---|
| `POST /spaces/{id}/files` | `files.py:17,136` (`MAX_FILE_SIZE`) | 10 MB |
| `POST /catalogo/...` | `catalogo.py:28,117` (`MAX_SIZE`) | 5 MB |
| `POST /planometrias/...` | `planograms.py:32,112` (`MAX_SIZE`) | 10 MB |
| `POST /mounts/` (foto de montaje) | `mounts.py:21,171` (`MAX_PHOTO`) | 10 MB |
| `POST /montaje/reportar` | `montaje.py:287,302` — delega en `registrar_montaje` de `mounts.py`, mismo límite | 10 MB (heredado) |

**Los cinco endpoints que reciben `UploadFile` en el repo imponen un límite
explícito** (`grep -rln "UploadFile" app/routers/*.py` da exactamente estos
cinco archivos). No hay ninguno sin freno de tamaño.

### Freno por IP en endpoints nuevos de Fases 1-2 que aceptan credenciales o crean recursos

| Endpoint | Anónimo/credencial | Freno |
|---|---|---|
| `POST /auth/login` (legado) | anónimo, contraseña compartida | `frenar_si_hay_muchos_fallos`/`anotar_fallo` contra `LoginAttempt` (`auth.py:222,234`) |
| `POST /auth/oauth` | anónimo, ID token de Firebase | mismo mecanismo contra `IntentoOauth` (`auth.py:340,344,...`) |
| `POST /clientes/alta` | anónimo (sin membresía aún) | mismo mecanismo contra `IntentoAlta` (`alta.py:80,92,...`) |
| `GET /clientes/mi-export` | autenticado (owner), pero descarga masiva | freno propio `IntentoExport`, 3/hora por `usuario_id` (`derechos.py:99-123`) — no es IP porque ya hay identidad; el spam de un owner autenticado no es el mismo riesgo que credential-stuffing anónimo |
| `POST /clientes/solicitar-supresion` | autenticado (owner) | sin freno de tasa, pero acotado por `409` si ya hay una pendiente (`derechos.py:251-263`) — no crea un recurso nuevo por request, sólo UNO por cliente a la vez |
| `POST /usuarios/invitar`, `PATCH /usuarios/{id}` | autenticado (admin) | sin freno de IP — requiere JWT de admin válido, no es una superficie de credential-stuffing anónimo |
| `PATCH /plataforma/clientes/{slug}`, `PATCH /plataforma/supresiones/{id}` | autenticado (operador, `require_operador`) | ídem — gate es la membresía de operador, no IP |

**No se encontró ningún endpoint anónimo (sin JWT ni membresía) de las
Fases 1-2 sin freno por IP.** Los únicos tres puntos anónimos que crean
sesión o recurso —`/auth/login`, `/auth/oauth`, `/clientes/alta`— tienen los
tres su propia tabla de intentos, confirmado por grep
(`frenar_si_hay_muchos_fallos`/`anotar_fallo` con los tres modelos
distintos). Todo lo demás que "crea recursos" ya exige una credencial
válida primero, que es un freno distinto pero real: no hace falta además un
freno por IP para algo que ya exige robar o adivinar un JWT.

No se aplicó ningún cambio en este bloque — no encontré un hueco chico y sin
riesgo que arreglar; lo que hay ya está cubierto.

---

## Verificación

**Iteración 1** (sin cambios respecto de lo ya reportado):

```
$ cd backend && rm -f retail_espacios.db recabra_*.db
$ python -c "import app.main"                                          # limpio
$ python -m pytest tests/test_hardening.py tests/test_files_acceso.py tests/test_identidad.py -q
59 passed                                                               # x3, en checkouts frescos aislados
```

**Iteración 2** (B-2 + M-1 + los hallazgos del auditor que se corrigieron):

```
$ cd backend && rm -f retail_espacios.db recabra_*.db
$ python -c "import app.main"                                                       # limpio
$ python -m pytest tests/test_hardening.py tests/test_files_acceso.py \
      tests/test_identidad.py tests/test_mounts.py tests/test_bitacora.py \
      tests/test_catalogo.py -q
141 passed                                                                            # todos verdes
```

Corrí además la suite COMPLETA (`python -m pytest -q`, sin filtrar archivo)
sobre una copia aislada de `backend/` con `TMPDIR` propio (mismo método que
la Iteración 1, para no repetir la contaminación entre procesos que se
explica abajo): en ese instante, **449 tests recolectados, 3 `FAILED`** —
identificados uno por uno:

1. `test_x27_borrar_la_cara_designada_...` — en el momento de esa corrida
   todavía era el `XPASS(strict)` ESPERADO del fix de X-27 (ver arriba): el
   comportamiento seguro SE CUMPLÍA pero el marcador `xfail` seguía puesto.
   El auditor red-team ya se lo sacó desde entonces (confirmado por grep
   sobre el archivo compartido) — hoy corre como test normal, en verde, y no
   cuenta más como falla en una corrida nueva.
2. `test_x21_los_tres_documentos_legales_dicen_que_son_borrador` — busca
   `docs/legal/politica-datos.md` y `docs/legal/guia-rnbd.md`, que no existen
   en este checkout. Territorio de otro builder (los documentos legales /
   RNBD), no `files.py`/`spaces.py`.
3. `test_x22_la_pagina_publica_no_exige_login_y_lleva_las_cabeceras` — pide
   `GET /politica-datos` y recibe 404: la ruta pública de la política aún no
   está montada en el catch-all de la SPA. Territorio de frontend/routing de
   otro builder, no el mío.

`test_compliance_ataques.py` es un archivo COMPARTIDO que otra sesión (el
auditor red-team) estuvo editando en tiempo real durante todo este trabajo
— confirmado viendo cambiar el archivo en disco entre mis propias corridas
(agregó `X-25`-`X-29`/`X-19b`, y ya sacó el marcador `xfail` de `X-18`,
`X-18b` y `X-19` — los tres ahora corren como tests normales, en verde). Por
eso una corrida sobre el directorio compartido, en el momento equivocado,
puede mostrar fallas ajenas y transitorias (lo vi con `X-1`/`X-2`/`X-3`, del
export, fallando en una corrida y en verde un minuto después) — el número
que vale es el de la copia AISLADA, tomada en un instante y corrida sin
interferencia, que es el que reporto arriba.

`npx tsc --noEmit` sobre `frontend/` — limpio, sin errores (el cambio de
`FloorPlan2D.tsx`/`files.ts` para el checkbox de designación).

### La suite entera: contaminación cruzada entre builders (histórico, Iteración 1)

> **Nota de la Iteración 2**: las 21 fallas de `test_identidad_ataques.py` /
> `test_estado_cuenta.py` que describe esta subsección (fixture desactualizado
> tras el gate de consentimiento de `/oauth`) ya NO aparecen — el builder de
> consentimiento/derechos actualizó esos fixtures durante esta misma sesión.
> La corrida aislada de la Iteración 2 (más arriba) lo confirma: de 449 tests,
> sólo 3 fallan, y ninguno es ese. Se deja el relato original tal cual porque
> documenta bien el patrón de contaminación entre procesos, que sigue siendo
> real y hay que tenerlo en cuenta al leer cualquier corrida sobre el
> directorio compartido.

Este repo (`/tmp/retail-espacios-test`) lo están tocando VARIOS builders de
Fase 3 **al mismo tiempo, en el mismo checkout en disco** — vi procesos
`pytest` ajenos corriendo en paralelo durante toda esta sesión
(`test_derechos.py tests/test_plataforma.py tests/test_plataforma_ataques.py`
en loop, no un comando mío). Eso importa para `python -m pytest -q` sobre
`backend/` tal cual, porque `app/clientes.py::url_para` deriva el archivo
SQLite de cada cliente (`recabra_<slug>.db`) del directorio de
`DATABASE_URL` — que es `/tmp`, el mismo para TODOS los procesos de la
máquina. Dos test runs concurrentes que fundan un cliente `primero` (varios
archivos de test usan los mismos slugs de ejemplo) escriben al mismo
`/tmp/recabra_primero.db` y uno de los dos revienta con
`sqlite3.OperationalError: attempt to write a readonly database`. Correr
`python -m pytest -q` directo sobre `backend/` mientras otro builder hace lo
mismo da decenas de `ERROR` que no tienen nada que ver con ningún cambio de
código — los vi aparecer IDÉNTICOS antes y después de tocar `files.py`.

Para separar señal de ruido armé tres corridas de la suite completa sobre
copias aisladas de `backend/` (`/tmp/backend_isolated`, con y sin
`TMPDIR` propio para además evitar la colisión de archivo compartido):

1. **Contaminada** (sin TMPDIR propio, con builders hermanos corriendo en
   paralelo): decenas de `ERROR` de `attempt to write a readonly database`,
   esparcidos por archivos de test sin relación entre sí
   (`test_mounts.py`, `test_planograms.py`, `test_plataforma.py`,
   `test_recordatorios.py`, `test_sede_delete.py`...).
2. **Aislada, TMPDIR compartido**: los `ERROR` de base de datos bajan pero
   no desaparecen (misma causa, menos frecuencia).
3. **Aislada + `TMPDIR` propio** (elimina la colisión de archivo entre
   procesos): **367 passed, 21 failed, 5 xfailed** — CERO `ERROR`. La
   diferencia entre esta corrida y la (1) confirma que los `ERROR` eran
   contaminación entre procesos, no un defecto de código.

Las **21 `FAILED`** que sobreviven en la corrida limpia (3) son reales, pero
**no las causó este builder ni tocan mi territorio** — las 21 están
concentradas en `tests/test_estado_cuenta.py` (4) y
`tests/test_identidad_ataques.py` (17), y la traza es la misma en las 21:

```
AssertionError: {"detail":{"codigo":"consentimiento_requerido","version":"2026-09-v1"}}
assert 428 == 200
```

`test_identidad_ataques.py` es un archivo de la Fase 1 (ataques de
identidad) que `git status` mostraba SIN modificar al empezar esta sesión —
a diferencia de `test_identidad.py`, `test_alta.py`, `test_plataforma.py` y
`test_plataforma_ataques.py`, que otro builder de esta fase (el de
consentimiento/derechos) SÍ actualizó para pasar `acepta_politica: true` al
invitar+entrar un miembro nuevo. El endpoint `/api/auth/oauth` ahora exige
consentimiento antes de crear una membresía nueva (spec de esta fase,
bloque 1) y contesta `428` si falta — correcto según la spec — pero el
helper `_entrar()`/`_oauth()` de `test_identidad_ataques.py` quedó afuera de
esa actualización, así que sus 21 casos (que SÍ siguen ejerciendo el
comportamiento de seguridad que prueban — revocación, aislamiento entre
clientes, etc. — sólo que ahora tropiezan primero con el 428) fallan por
un fixture desactualizado, no por una regresión de seguridad. Archivo y
comportamiento (`auth.py`, el gate de consentimiento, `test_identidad_ataques.py`)
están TODOS fuera de mi territorio (`NO toques auth.py`, explícito en mi
encargo) y dentro del de otro builder — que, por lo que vi correr en
paralelo, ya lo estaba trabajando durante esta misma sesión.

**Ninguna de las 21 fallas toca `files.py`, el bloque de cabeceras de
`main.py`, CSP, HSTS, ni el fix de H8** — confirmado tanto por los nombres
de archivo/test como porque mis tres archivos de verificación explícita
(`test_hardening.py`, `test_files_acceso.py`, `test_identidad.py` — este
último SÍ está en mi lista de verificación y SÍ pasa, a diferencia de
`test_identidad_ataques.py`, que no lo está) corren en verde de punta a
punta, tres veces, en checkouts aislados frescos.

---

## Archivos tocados (acumulado, Iteración 1 + Iteración 2)

- `backend/app/main.py` — sólo el bloque de cabeceras (~línea 200-260): CSP
  anotada con Firebase, HSTS con `x-forwarded-proto`. No se tocaron los
  `include_router` ni el `lifespan`. (Iteración 1, sin cambios en la 2.)
- `backend/app/models/models.py` — clase nueva `SpaceFace` (Iteración 2).
- `backend/app/routers/files.py` — filtro por rol de H8 (Iteración 1);
  rediseño a designación explícita + fix de X-27 en `delete_file`
  (Iteración 2).
- `backend/app/routers/spaces.py` — `list_face_images` reescrito contra
  `SpaceFace`, imports sin uso retirados (Iteración 2 — no se había tocado en
  la 1).
- `backend/tests/test_files_acceso.py` — 3 tests nuevos para H8 (Iteración
  1); reescrito con 16 tests para la designación explícita (Iteración 2).
- `backend/tests/test_hardening.py` (nuevo, Iteración 1) — cabeceras en
  200/404/422/401, HSTS en las tres variantes, CSP anotada. Sin cambios en
  la 2.
- `backend/tests/test_compliance_ataques.py` — dos tests (`x17`, `x20`) + el
  helper `_subir` ganaron `uso` (Iteración 2). Es el archivo del auditor
  red-team; el resto de los cambios ahí (`x18`/`x18b`/`x19` sin xfail,
  `x25`-`x29`, `x19b`) son suyos, no míos.
- `backend/tests/test_mounts.py` — un test ganó `uso=cara` en su subida de
  arte (Iteración 2, para seguir probando lo mismo bajo el diseño nuevo).
- `backend/tests/test_bitacora.py` — un test ganó `uso=cara` (Iteración 2,
  mismo motivo).
- `frontend/src/api/files.ts` — `uploadSpaceFile` gana el parámetro `uso`
  (Iteración 2).
- `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx` — checkbox de
  declaración en `FilesSection` (Iteración 2).
- `.github/workflows/deps-audit.yml` (nuevo, Iteración 1).
- `.github/scripts/pip_audit_severity.py` (nuevo, Iteración 1).
