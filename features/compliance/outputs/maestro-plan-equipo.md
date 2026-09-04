# Fase 3 Compliance — Plan de equipo del Maestro Orchestrator (Fable)

**Repo:** `/tmp/retail-espacios-test` · rama `claude/fase-3-compliance` (apilada sobre fase-2) · sin commit/push
**Spec vinculante:** `features/compliance/spec.md` · **Fecha:** 2026-09-04

---

## 1. Lectura del problema

Cuatro bloques con naturalezas distintas: redacción legal-técnica (política Ley 1581/2012 +
guía RNBD), un flujo de producto que cruza alta/invitación/login (consentimiento con
registro), una frontera de datos (export owner-only + solicitud de supresión), y hardening
mecánico-delicado (headers/CSP, fix del contrato-imagen, CI de dependencias).

Tres descubrimientos del reconocimiento que cambian las misiones:

1. **La CSP ya existe y ya está rota.** `backend/app/main.py:200-238` trae middleware de
   cabeceras con `connect-src 'self'` — eso **bloquea `identitytoolkit.googleapis.com` y
   `securetoken.googleapis.com`**, es decir el login por cuentas de Fase 1. El trabajo no es
   "poner CSP" sino medir el frontend real y reparar la puesta. El HSTS además mira
   `request.url.scheme == "https"`, que detrás del proxy de Render es siempre `http`:
   falta `x-forwarded-proto`.
2. **El hallazgo H8 es recuperable en esta máquina** sin ir a GitHub:
   `git show claude/sistemas-maestros-retail-mzb1om:features/vitrinas-3d/outputs/auditor-legal-precios.md`
   (sección H8, ~línea 457). El filtro de `routers/files.py` (`_puede_ver` = admin o
   no-documento) deja al worker bajar un contrato escaneado como JPG. Restricciones del fix:
   el 3D del worker pinta caras vía `GET /spaces/face-images` + `fileUrl(?token=)`
   (`frontend/src/api/files.ts:38,45`), y el admin usa `?token=` en `<img>/<iframe>`.
   `space_files` **no admite columna nueva** (regla dura sin migraciones): el fix es por
   rol/derivación, no por marca en la tabla.
3. **Owner viaja como admin en el JWT** (Fase 1). "Owner-only" para el export y la
   supresión obliga a resolver la membresía en el registro (`sesion_registro()`), nunca el
   rol del token. El legado (sin `sub`) queda afuera por construcción → 403.

Patrones heredados que TODAS las misiones respetan: tablas nuevas solo en el registro,
frenos en tabla propia (patrón `IntentoAlta`/`IntentoOauth`), `FakeVerificador` por
`dependency_overrides` en tests, rutas literales antes de paramétricas, y el gotcha R-0
(borrar `backend/retail_espacios.db backend/recabra_*.db` antes de re-correr la suite).

## 2. Equipo (5 agentes)

| id | rol | modelo | superficie |
|---|---|---|---|
| `legal` | builder | opus | `docs/legal/politica-datos.md`, `docs/legal/guia-rnbd.md`, `frontend/src/legal/politica-datos.md` (copia para la página pública) |
| `consentimiento` | builder | sonnet | `app/models/consentimiento.py`, `routers/auth.py`, `routers/alta.py`, frontend (página pública, checkbox del alta, modal de login), tests propios |
| `derechos` | builder | sonnet | `app/models/supresion.py`, `routers/derechos.py` (NUEVO), `routers/plataforma.py`, 1 línea en `main.py`, frontend mínimo, tests propios |
| `hardening` | builder | sonnet | middleware de `main.py`, `routers/files.py`, `.github/workflows/deps-audit.yml`, revisión de uploads/frenos, tests propios |
| `red-team-exfiltracion` | auditor | opus | solo lee y ataca; corre la suite 2× + tsc; escribe `features/compliance/outputs/red-team-exfiltracion.md` |

Por qué así: el catálogo de `agente-legal.md` por fin aplica de verdad (redacción Ley
1581/RNBD pide opus y cuidado, no velocidad); consentimiento y derechos son dos fronteras
distintas (una de entrada — quién aceptó qué —, otra de salida — qué sale y qué NO) con
territorios de archivos disjuntos; hardening junta lo OWASP porque headers, fix H8 y CI
comparten el mismo modo de verificación (medir contra la app real); y la fase pide un
auditor de EXFILTRACIÓN, no de coherencia funcional: todo lo nuevo de esta fase son
canales por los que pueden salir datos (export, página pública, headers, 428/429 como
oráculos).

Orden de ejecución: `legal`, `consentimiento`, `derechos` y `hardening` en paralelo
(Fase 1 del workflow); `red-team-exfiltracion` después (Fase 2). Los territorios en
paralelo no comparten archivos salvo dos puntos resueltos por contrato:
`main.py` (derechos agrega 1 línea de include en el bloque de routers; hardening toca solo
el bloque del middleware, líneas 200-238) y `frontend/src/legal/politica-datos.md`
(legal es dueño del contenido y lo sobreescribe entero; consentimiento solo lo crea como
stub si no existe).

## 3. Contratos compartidos (fijados por el Maestro — idénticos en las misiones)

### 3.1 Versión de la política
- Constante `VERSION_POLITICA = "2026-09-v1"` en `backend/app/models/consentimiento.py`.
- El documento legal declara en su encabezado: `Versión: 2026-09-v1 · Vigencia: septiembre 2026`
  y **BORRADOR PARA REVISIÓN DE ABOGADO** como primera línea visible.
- La página pública del frontend es la ruta `/politica-datos` (sin login), que renderiza
  `frontend/src/legal/politica-datos.md` importado con `?raw` (Vite).

### 3.2 Tabla `consentimientos` (registro, `sesion_registro()`, create_all sin migración)
```
id Integer PK · usuario_id Integer NOT NULL index · version String NOT NULL
aceptado_en DateTime(timezone=True) NOT NULL default now-utc · ip String NOT NULL
origen String NOT NULL ∈ {"alta","invitacion","login"}
UniqueConstraint(usuario_id, version, name="uq_consentimiento_usuario_version")
```

### 3.3 API de consentimiento
- `POST /api/clientes/alta`: campo nuevo del body `acepta_politica: bool = False`.
  `False` → **422** `{"detail": "Para fundar el cliente hay que aceptar la Política de Tratamiento de Datos Personales"}`,
  ANTES de `crear_cliente()` y de cualquier escritura. `True` → tras fundar, fila en
  `consentimientos` con `origen="alta"` y la IP del pedido.
- `POST /api/auth/oauth`: campo opcional del body `acepta_politica: bool = False`.
  Si el canje de invitaciones pendientes va a crear una membresía nueva y el usuario NO
  tiene fila para `VERSION_POLITICA` y `acepta_politica` no vino en `True` →
  **428** `{"detail": {"codigo": "consentimiento_requerido", "version": "2026-09-v1"}}`
  — nada se canjea, no se emite JWT. Con `True` → fila `origen="invitacion"` y el canje
  sigue como siempre. Usuario existente CON membresía y sin fila → el login **pasa** y la
  respuesta agrega el campo top-level `pedir_consentimiento: true` (el JWT no cambia de
  forma; es un campo hermano del token, como `aviso_cuenta` en Fase 2).
- `POST /api/auth/aceptar-politica`: Bearer con `sub` (legado sin `sub` → 403) → **204**,
  inserta fila `origen="login"`. Idempotente: fila ya existente → 204 igual.
- `POST /api/auth/login` (legado): **no cambia ni un byte**.

### 3.4 API de derechos del titular
- **Owner-only** se define así en TODOS lados: JWT con `sub` + membresía activa con
  `rol == "owner"` sobre el cliente del pedido, leída del registro. El rol del token no
  alcanza (owner viaja como admin). Legado o admin-no-owner → **403**.
- `GET /api/clientes/mi-export` → 200 JSON:
  ```
  {"cliente": {"slug","nombre"}, "generado_en": iso, "version_politica": "2026-09-v1",
   "spaces": [...], "leases": [...], "suppliers": [...], "layouts": {sede: snapshot}}
  ```
  **Excluye siempre**: `audit_log` (IPs de terceros), hashes/claves, tablas de intentos,
  `estados_cliente`. Freno: tabla nueva `export_attempts` (id, usuario_id index, at) —
  máx 3 por hora por usuario → **429**.
- `POST /api/clientes/solicitar-supresion`, body `{"motivo": str|null}` → **201** con la
  fila; pendiente duplicada del mismo slug → **409**. Nada se borra nunca.
- Tabla `solicitudes_supresion` (registro):
  ```
  id PK · cliente_slug NOT NULL index · usuario_id NOT NULL · email NOT NULL
  motivo nullable · estado NOT NULL default "pendiente" ∈ {"pendiente","atendida","rechazada"}
  creado_en tz NOT NULL · atendido_en nullable · atendido_por nullable · nota nullable
  ```
- `GET /api/plataforma/supresiones` (require_operador) → lista completa.
  `PATCH /api/plataforma/supresiones/{id}` body `{"estado": "atendida"|"rechazada", "nota": str}`
  (nota obligatoria, como el motivo del PATCH de estados de Fase 2). Rutas nuevas de
  plataforma van ANTES de `/clientes/{slug}` en el archivo.
- Router nuevo `backend/app/routers/derechos.py` con `APIRouter(prefix="/clientes")`,
  incluido en `main.py` **antes** de `alta_routes` (una sola línea nueva).

### 3.5 Headers/CSP
- El middleware existente de `main.py` es el punto único. Cambios mínimos, medidos:
  `connect-src` debe permitir los endpoints reales de Firebase Auth; HSTS también cuando
  `x-forwarded-proto == "https"`; todo lo demás solo se toca con evidencia de qué archivo
  del frontend lo exige. Cabeceras presentes en TODAS las respuestas, errores y 402
  incluidos. Concesiones (p. ej. `unsafe-inline` en style-src) se documentan con el porqué.

### 3.6 Salidas
Cada agente escribe su entregable en `features/compliance/outputs/<id>.md`: qué tocó, qué
decisiones tomó dentro de su latitud, concesiones documentadas, y cómo verificó
(comandos + resultado). Verificación mínima común: `cd backend && python -c "import app.main"`,
sus pytest propios en verde, y `cd frontend && npx tsc --noEmit` si tocó frontend.

## 4. Criterios de cierre (checklist de la spec, mapeado)

| Verificación de la spec | Responsable primario | Verifica |
|---|---|---|
| Alta sin política → 422; con → fila con versión e IP | consentimiento | red-team |
| Login existente → `pedir_consentimiento` una vez | consentimiento | red-team |
| Export owner-only (403 worker/admin; JSON owner) | derechos | red-team |
| Supresión visible al operador, nada se borra | derechos | red-team |
| Headers en TODAS las respuestas; HSTS solo HTTPS | hardening | red-team |
| Contrato-imagen NO baja con token de worker | hardening | red-team |
| Frontend completo con CSP (login Firebase incluido) | hardening | red-team |
| CI de dependencias en PRs | hardening | red-team |
| Suite verde 2× + tsc limpio | todos | red-team |
| Docs con encabezado de BORRADOR | legal | red-team |

Riesgo residual declarado: el flujo real de login por popup de Firebase no tiene test
automatizado de navegador en este repo (no hay runner de frontend); la CSP se valida por
medición estática del código del SDK + smoke manual documentado por hardening, y el
red-team la re-verifica de forma independiente. Si el conciliador reporta conflicto entre
la página pública y el doc de legal (divergencia de contenido), la fuente de verdad es
`docs/legal/politica-datos.md` y se re-sincroniza la copia del frontend.
