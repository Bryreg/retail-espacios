# Derechos del titular — export owner-only y solicitud de supresión

Builder: sistemas-maestros, Fase 3 Compliance, bloque 2 de `features/compliance/spec.md`.
Rama `claude/fase-3-compliance`, apilada sobre `fase-2`. Sin commit ni push (por mandato).

## Qué se construyó

### [A] Definición de OWNER-ONLY, una sola vez, usada en los dos endpoints

`require_owner()` en `backend/app/routers/derechos.py`:

1. `require_auth` valida el JWT y devuelve el rol (no se usa para nada más:
   owner viaja como `admin` en el token desde la Fase 1, así que el rol del
   JWT **no distingue** owner de admin común).
2. `sub_y_email_de_la_sesion` (ya existía en `app/auth.py`, público) saca
   `(sub, email)` del mismo token. Sin `sub` → 403 directo: el legado nunca lo
   trae, así que nunca puede ser owner.
3. Con `sub`, se busca la membresía de ese usuario sobre el `cliente_del_pedido`
   con `sesion_registro()` — la MISMA fuente que usa el resto de la Fase 2. Si
   no hay fila, la fila no está activa, o `rol != "owner"` → 403.

`GET /mi-export` y `POST /solicitar-supresion` dependen los dos de
`require_owner`, así que la frontera es idéntica por construcción, no por
disciplina de copiar y pegar el mismo chequeo dos veces.

### [B]–[C] Router y modelos nuevos

- `backend/app/routers/derechos.py` — `APIRouter(prefix="/clientes", tags=["derechos"])`,
  importa `app/models/supresion.py` a nivel de módulo (mismo patrón que
  `plataforma_estado.py` con `models/plataforma.py`) para que `create_all()`
  vea las tablas nuevas sin migración.
- `backend/app/models/supresion.py` (NUEVO) — dos tablas del registro:
  - `solicitudes_supresion` (`SolicitudSupresion`): `id`, `cliente_slug`,
    `usuario_id`, `email`, `motivo` (nullable), `estado` (default
    `"pendiente"`), `creado_en`, y los tres campos que llena el PATCH del
    operador: `atendido_en`, `atendido_por`, `nota`.
  - `export_attempts` (`IntentoExport`): `id`, `usuario_id` (index), `at`
    (index) — freno del export, **por `usuario_id`, no por IP** (a
    diferencia de `IntentoAlta`/`IntentoOauth`): exportar los propios datos
    es un freno por CUENTA, no por conexión.
- `backend/app/main.py` — una línea: `app.include_router(derechos_routes.router, prefix="/api")`,
  declarada ANTES de `alta_routes` (contrato de la fase). En los hechos no
  cambia ningún resultado: los dos routers comparten el prefijo `/clientes`
  con únicamente rutas LITERALES (`/mi-export`, `/solicitar-supresion`,
  `/alta`), así que el orden entre ellos es irrelevante — se respeta el
  contrato igual, documentado en el propio comentario de `main.py`.

### [D] `GET /api/clientes/mi-export`

Freno: 3 por hora por `usuario_id` (limpia filas viejas de `export_attempts`
antes de contar, mismo estilo que `frenar_si_hay_muchos_fallos` de
`routers/auth.py`, pero con función propia porque esa está parametrizada por
`ip`, no por `usuario_id`). El 4º pedido en la hora da 429.

Los datos salen de `sesion_de(cliente)` — la base DEL cliente, no del
registro. Se consulta explícitamente:

- `Space` → `spaces` en el JSON
- `SpaceLease` → `leases`, **incluido `monthly_rent` sin redactar**: el owner
  es admin, así que a diferencia de todas las demás respuestas del sistema
  (que le tachan la plata a `worker`) acá no hay redacción.
- `Supplier` → `suppliers`
- `LayoutSnapshot` → `layouts`, un objeto `{sede: fixtures_json_parseado}`

Respuesta `200` exacta:
```json
{
  "cliente": {"slug": "...", "nombre": "..."},
  "generado_en": "2026-...(ISO UTC)",
  "version_politica": "2026-09-v1",
  "spaces": [...], "leases": [...], "suppliers": [...],
  "layouts": {"NAVE": [...], ...}
}
```
`version_politica` se importa de `app.models.consentimiento.VERSION_POLITICA`
(la misma constante que usa el consentimiento de alta/login) en vez de
duplicar el string — una sola fuente de verdad para el número de versión.

Header: `Content-Disposition: attachment; filename="recabra-export-<slug>-<fecha>.json"`.

**La frontera dura, EXPLÍCITA y probada** (no es una lista negra mantenida a
mano: es que el código simplemente no consulta nada de esto):

| Qué NO sale | Por qué | Cómo queda garantizado |
|---|---|---|
| `audit_log` (bitácora) | tiene IPs de terceros | nunca se importa `AuditEntry` ni se consulta esa tabla |
| `app_config` | guarda los hashes Argon2 de las claves legadas (`admin_password_hash`/`worker_password_hash`) | nunca se importa `AppConfig` ni se consulta esa tabla |
| tablas de intentos (`login_attempts`, `oauth_attempts`, `alta_attempts`, `export_attempts`) | son frenos de seguridad, no datos de negocio del cliente | ninguna se consulta desde `mi-export`; sólo `export_attempts` se ESCRIBE (freno), nunca se lee de vuelta hacia el JSON |
| `estados_cliente` | vive en el REGISTRO, no en la base del cliente — y decir "gracia"/"solo_lectura"/"suspendido" al propio owner por este canal no es lo que pide el contrato | `mi-export` sólo abre `sesion_de(cliente)`, nunca `sesion_registro()` para leer esto |

Test explícito (`test_export_no_filtra_bitacora_hashes_ni_tablas_de_intentos`):
genera una acción de negocio con una IP reconocible por `X-Forwarded-For` y
comprueba que esa IP NO aparece en el texto crudo de la respuesta, más
`"password"`/`"hash"` ausentes y los nombres de las seis tablas (`audit_log`,
`login_attempts`, `oauth_attempts`, `alta_attempts`, `export_attempts`,
`estados_cliente`) ausentes del JSON serializado.

### [E] `POST /api/clientes/solicitar-supresion`

Body `{"motivo": str opcional}`. Si ya hay una fila `estado == "pendiente"`
para ese `cliente_slug` → 409 (no abre una segunda cola). Si no, inserta y
devuelve 201 con la fila completa. **No borra nada — nunca**: el endpoint no
importa ni toca ninguna tabla de negocio del cliente, sólo escribe el registro.

### [F] Plataforma: `GET`/`PATCH /api/plataforma/supresiones`

Agregadas a `backend/app/routers/plataforma.py`, declaradas ANTES de
`/clientes` y `/clientes/{slug}` (contrato de la fase — en los hechos el
prefijo es distinto, `/supresiones` vs `/clientes`, así que tampoco había
colisión posible, pero se respeta el orden pedido igual).

- `GET /supresiones` (`require_operador`): todas las solicitudes,
  `ORDER BY creado_en DESC`.
- `PATCH /supresiones/{id}` (`require_operador`): body
  `{"estado": "atendida"|"rechazada", "nota": str}`. `nota` obligatoria → 422
  si falta o es sólo espacios (**espejo exacto** del `motivo` obligatorio del
  PATCH de `estados_cliente`, mismo mensaje de forma: "La nota es
  obligatoria."). Setea `estado`, `nota`, `atendido_en = now()`,
  `atendido_por = email del operador`.

**El patrón de constancia es el MISMO que el de Fase 2, copiado literal, no
inventado**: `EstadoCliente` dejaba `cambiado_en`/`cambiado_por`/`motivo` en
la MISMA fila que se está cambiando — no hay ninguna llamada a
`services/bitacora.anotar()` en el PATCH de estados (se verificó leyendo el
código: ese router jamás abre la base de un cliente, y `AuditEntry` vive
adentro de cada cliente, así que no hay dónde escribirle). `SolicitudSupresion`
hace exactamente lo mismo con `atendido_en`/`atendido_por`/`nota`: la fila
misma ES la bitácora del operador. No se inventó un canal nuevo.

La ejecución real de la supresión queda **fuera del sistema, a propósito**:
el PATCH no llama a ningún borrado, no desactiva el cliente, no toca
`estados_cliente` — sólo dice qué decidió el operador con el pedido.

### [G] Frontend mínimo

- `frontend/src/api/derechos.ts` (NUEVO): `descargarMiExport()` (blob +
  descarga del navegador, con destraducción del error-como-Blob para que
  `describeError` lo siga leyendo igual que cualquier otro 403/429),
  `solicitarSupresion()`, `getSolicitudesSupresion()`, `atenderSupresion()`.
- `frontend/src/pages/Dashboard.tsx`: sección **"Tus datos"** nueva
  (`TusDatosSection`) dentro de `SettingsModal` — que ya es admin-only por
  construcción (`{settingsOpen && isAdmin && <SettingsModal .../>}` en el
  render de `Dashboard`, sin tocar esa condición). Botón "Descargar mis
  datos" y botón "Solicitar supresión" con `confirm()` explícito de que es
  una SOLICITUD al operador, no un borrado. El 403 de "no sos owner" llega
  tal cual del backend (`"Solo el owner del cliente puede hacer esto."`) vía
  `describeError`.
- `frontend/src/components/Plataforma/PlataformaPanel.tsx`: sección
  **"Solicitudes de supresión"** agregada abajo de la lista de clientes
  existente (mismo panel, mismo modal) — lista con slug/email/estado/motivo,
  botón "Atender" sólo en las `pendiente`, editor con select
  atendida/rechazada + nota obligatoria + `confirm()` que recuerda que la
  ejecución es manual.

## Decisiones y por qué

- **El freno del export es por `usuario_id`, no por IP.** Descargar los
  propios datos es una acción de cuenta: dos owners detrás del mismo NAT no
  deberían compartir contador, y un mismo owner cambiando de red no debería
  resetearlo. Tabla propia (`export_attempts`) en vez de reusar
  `frenar_si_hay_muchos_fallos` porque esa función está parametrizada por
  `modelo.ip`, no por `usuario_id` — forzarla habría significado tocar una
  función compartida con el login legado y `/oauth`, fuera de mi territorio.
- **`require_owner` no mira el rol del JWT en absoluto.** Podría parecer
  redundante comprobar `rol == "admin"` como filtro rápido antes de ir a la
  base, pero el contrato es tajante: "el rol 'admin' del token NO alcanza" —
  y como owner Y admin-no-owner comparten el mismo rol de JWT (`"admin"`),
  cualquier atajo por rol sería, en el mejor caso, inútil, y en el peor,
  una fuente de confusión sobre cuál es la fuente de verdad real (la
  membresía). Se dejó UNA sola fuente de verdad.
- **`layouts` guarda el fixtures_json ya parseado**, no el string crudo — es
  lo que dice el contrato ("snapshot_json") y lo que un consumidor humano del
  export espera poder leer sin un segundo `JSON.parse`. Si algún día un
  layout quedara corrupto en la base, el except de fallback entrega el string
  crudo en vez de tirar el export entero abajo — un layout roto no debería
  poder bloquear que el owner se lleve el resto de sus datos.
- **`solicitar-supresion` acepta `motivo` vacío/ausente.** El contrato lo
  marca opcional; forzarlo habría sido inventar un requisito que el contrato
  no pide.

## Qué quedó DENTRO del export y por qué

`spaces`, `leases` (con `monthly_rent`), `suppliers`, `layouts` — exactamente
lo que pide el contrato [D], sin redactar nada porque el owner es admin sobre
su propio negocio.

## Qué quedó AFUERA del export y por qué

Ver la tabla de la sección [D] arriba: `audit_log` (IPs de terceros),
`app_config` (hashes de claves), toda tabla de intentos, y `estados_cliente`.
Ninguna se importa ni se consulta desde `mi-export` — no es una redacción
posterior, es que el endpoint no tiene ningún camino de código que las toque.

## Coordinación con builders paralelos (mismo checkout, misma rama)

Este repo se comparte en vivo entre varios builders trabajando la misma fase
al mismo tiempo (se observó `main.py` cambiar en disco entre lecturas, y hasta
8 procesos `pytest` corriendo a la vez de otras sesiones). Dos regresiones
aparecieron en la verificación por ese motivo, **ninguna en mi territorio**,
y las corregí con el mínimo cambio posible porque bloqueaban el "en verde"
que el mandato exige para MIS tres archivos de test:

1. El builder de consentimiento agregó `acepta_politica` (obligatorio) a
   `POST /api/clientes/alta` y un 428 `consentimiento_requerido` a
   `POST /api/auth/oauth` para cuentas sin consentimiento. Los helpers de
   `tests/test_plataforma.py` (`_cuenta_con_sub`) y
   `tests/test_plataforma_ataques.py` (`_alta`, y dos llamadas sueltas a
   `/oauth` en `test_r2`/`test_k`) no mandaban ese campo — ninguno de esos
   archivos ataca consentimiento, así que se les agregó `acepta_politica: True`
   de entrada. Verificado que ningún caso de esos archivos que espera un 4xx
   se ve afectado: todos los que validan slug/nombre/reservado/duplicado
   ocurren en `routers/alta.py` ANTES del chequeo de `acepta_politica`.
   **No toqué `alta.py` ni `auth.py`** (fuera de mi territorio) — sólo los
   sitios de llamada en tests.
2. **No toqué** `tests/test_identidad_ataques.py`, `tests/test_estado_cuenta.py`
   ni `tests/test_clientes.py`, que en el momento de correr la suite completa
   también fallaban por el mismo 428 nuevo — esos archivos no están en mi
   lista de verificación explícita (`test_derechos.py`, `test_plataforma.py`,
   `test_plataforma_ataques.py`) y arreglarlos es trabajo del builder de
   consentimiento, no mío.
3. **"readonly database" intermitente y en tablas ajenas** (`notification_logs`,
   `usuarios`, índices varios) al correr la suite completa o mis tres archivos
   mientras otras sesiones corrían `pytest` a la vez sobre el mismo
   contenedor — confirmado con `ps aux` (hasta 8 procesos `python -m pytest`
   simultáneos de otras sesiones). No es un bug de este código: cada archivo
   de test aislado, y mis tres archivos en conjunto corridos en un momento
   sin esa contención, pasan limpio y reproducible. Documentado acá para que
   quien integre no lo confunda con una regresión real.

## Archivos tocados

- `backend/app/models/supresion.py` (NUEVO)
- `backend/app/routers/derechos.py` (NUEVO)
- `backend/app/routers/plataforma.py` (agregado `GET`/`PATCH /supresiones`)
- `backend/app/main.py` (una línea: import + include de `derechos_routes`, antes de `alta_routes`)
- `backend/tests/test_derechos.py` (NUEVO, 17 tests)
- `backend/tests/test_plataforma.py` (fix de coordinación: `acepta_politica: True` en el helper de alta)
- `backend/tests/test_plataforma_ataques.py` (fix de coordinación: ídem + `acepta_politica: True` en 3 llamadas a `/oauth`)
- `frontend/src/api/derechos.ts` (NUEVO)
- `frontend/src/pages/Dashboard.tsx` (sección "Tus datos" en Configuración)
- `frontend/src/components/Plataforma/PlataformaPanel.tsx` (sección "Solicitudes de supresión")

## Verificación

- `python -c "import app.main"` → OK.
- `pytest tests/test_derechos.py tests/test_plataforma.py tests/test_plataforma_ataques.py -q`
  (con `rm -f backend/retail_espacios.db backend/recabra_*.db` antes, y en un
  momento sin otra sesión corriendo `pytest` en paralelo sobre el mismo
  contenedor — ver nota de contención arriba) → **32 passed, 3 xfail**, exit 0.
  Corrido en verde dos veces seguidas.
- `test_derechos.py` sólo, aislado: **17 passed**.
- `npx tsc --noEmit` (frontend) → limpio, sin salida.

## Gaps / pendientes conocidos

- El export no exime al cliente de un estado de cuenta `suspendido`/
  `solo_lectura`: `cliente_del_pedido` sigue aplicando el interruptor de
  Fase 2 a `/mi-export` y `/solicitar-supresion` igual que a cualquier otro
  endpoint de negocio (no están en `_EXENTOS_EN_SOLO_LECTURA` ni bajo
  `_PREFIJO_PLATAFORMA`). Es decir: un owner con la cuenta suspendida no
  puede bajar su export ni pedir la supresión hasta que el operador lo
  reactive. El contrato de esta fase no pide una excepción acá y no la
  inventé — lo dejo escrito por si el negocio decide lo contrario (un owner
  que quiere irse porque dejó de pagar es, si acaso, el caso MÁS típico de
  pedir supresión).
- `IntentoExport` no se purga por una tarea de fondo (a diferencia de
  `AuditEntry`, que tiene `purgar()` en el loop de mantenimiento): la
  limpieza ocurre inline, sólo de filas de más de una hora, en cada pedido a
  `/mi-export`. Como el freno hace ese barrido en cada llamada, la tabla
  nunca puede crecer sin límite en la práctica, pero no hay un `purgar()`
  explícito si un cliente jamás vuelve a exportar.
