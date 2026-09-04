# Fase 2 — Clientes: equipo, contrato vinculante y misiones

Maestro Orchestrator (Fable) · rama `claude/fase-2-clientes` · spec: `features/clientes/spec.md` (contrato, no se re-litiga).

---

## 1. Análisis del problema

La fase mezcla cuatro superficies distintas y cada una pide un ojo propio:

1. **Alta self-service** — superficie de abuso clásica: slugs (validación, reservados,
   duplicados, carrera), tope de 2 fundaciones por usuario, freno de fuerza bruta.
   El endpoint NO puede exigir JWT propio: un usuario Firebase sin membresías no puede
   obtener uno (`/oauth` le da 403), así que el alta recibe el `id_token` de Firebase
   directamente, con la MISMA vara de correo confiable que `/oauth`.
2. **Interruptor de estado** — semántica de denegación por método y por path, aplicada
   en UN solo lugar: `cliente_del_pedido` (clientes.py), que es por donde pasa todo
   `get_db`. Sutileza central: `expire_leases()` escribe DENTRO de
   `GET /spaces/map-status`; como el corte es al pedido HTTP y no a la sesión de base,
   un GET permitido en `solo_lectura` sigue pudiendo escribir internamente. Los logins
   (`/login`, `/oauth`) NO pasan por `cliente_del_pedido` — resuelven cliente solos —
   así que el gating de suspendido en login se aplica ahí, aparte y explícito.
3. **Operador de plataforma** — frontera de privilegio NUEVA. Email en env
   `OPERADOR_EMAILS`, solo cuentas con `sub` (el token legado no trae email → 403
   siempre, por construcción). Un operador toca SOLO el registro: jamás datos de
   negocio de una base de cliente.
4. **UI** — alta, banner de gracia, bloqueo, panel operador. Territorio frontend puro.

**Acople resuelto por el maestro**: los dos builders de backend comparten tablas y
helpers. Para que corran en paralelo con territorios disjuntos, los dos archivos
compartidos (`app/models/plataforma.py` y `app/plataforma_estado.py`) van escritos
**verbatim en este contrato** y cada builder los crea byte-a-byte si faltan (contenido
idéntico ⇒ sin conflicto). El registro de las tablas en `Base.metadata` NO pasa por
`main.py`: `plataforma_estado.py` importa el módulo de modelos a nivel de módulo, y
lo importan (a nivel de módulo) tanto `clientes.py` (builder B) como los routers
nuevos (builder A) — cualquiera de los dos caminos alcanza para que `create_all()`
las vea.

**Equipo**: en Fase 1 ganó 2 builders + red team + auditor de regresión. Esta fase
suma UI, así que: 3 builders (backend-alta/plataforma, backend-interruptor, frontend)
+ red team de privilegio/denegación (la frontera de operador y la superficie de 402
merecen ataque dedicado) + auditor de regresión y coherencia (cero regresión para
galerias, checklist de la spec, ESTADO.md).

---

## 2. CONTRATO VINCULANTE (idéntico en todas las misiones)

### 2.1 Archivos compartidos — crear byte-a-byte si faltan; si existen y difieren, FRENAR y reportar

**`backend/app/models/plataforma.py`** (tablas NUEVAS de la base registro; `create_all()` las crea, sin migración):

```python
"""Plataforma (Fase 2): estado de cuenta por cliente y frenos del alta self-service.

Tablas NUEVAS de la base por defecto (el registro) — ``create_all()`` las crea sin
migración, igual que las de identidad. **FILA AUSENTE en ``estados_cliente`` =
cliente activo**: galerias y todo cliente existente quedan activos sin backfill.
Se leen y escriben SOLO con ``clientes.sesion_registro()``.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from app.database import Base


class EstadoCliente(Base):
    """El interruptor de estado de cuenta, movido a mano por un operador.

    Una fila con estado "activo" también es activo: el PATCH del operador deja la
    fila puesta para conservar quién cambió qué por última vez.
    """

    __tablename__ = "estados_cliente"

    slug = Column(String, primary_key=True)
    estado = Column(String, nullable=False)  # activo | gracia | solo_lectura | suspendido
    motivo = Column(String, nullable=False)
    cambiado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    cambiado_por = Column(String, nullable=False)  # email del operador (cuenta con sub)


class IntentoAlta(Base):
    """Fallos de ``POST /api/clientes/alta`` — tabla propia estilo ``IntentoOauth``.

    Misma forma que ``LoginAttempt``/``IntentoOauth`` a propósito: sirven las mismas
    tres funciones de freno de ``routers/auth.py``, parametrizadas por el modelo.
    Tabla aparte para no contaminar los frenos del login legado ni los de /oauth.
    """

    __tablename__ = "alta_attempts"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)


class Fundacion(Base):
    """Quién fundó qué cliente por el alta self-service — para el tope de 2."""

    __tablename__ = "fundaciones"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cliente_slug", name="uq_fundacion_usuario_cliente"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    cliente_slug = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
```

**`backend/app/plataforma_estado.py`** (helpers compartidos; módulo de contrato — no agregarle nada):

```python
"""Estado de cuenta por cliente y operadores de plataforma — helpers compartidos.

MÓDULO DE CONTRATO (Fase 2): lo usan la resolución de cliente (``clientes.py``),
los logins (``routers/auth.py``) y el panel del operador
(``routers/plataforma.py``). Si dos ramas lo crean, lo crean IDÉNTICO.

El estado vive en ``estados_cliente``, en la base por defecto (el registro):
fila ausente = activo, y una fila con estado "activo" también es activo.
"""
import os
import threading
import time

# El import registra las tablas en Base.metadata ANTES de que corra create_all()
# — quien importe este módulo a nivel de módulo (clientes.py, los routers de
# plataforma/alta) ya deja las tablas creadas en el arranque. No hay ciclo:
# models/plataforma.py sólo importa app.database.
from app.models import plataforma as _tablas  # noqa: F401

ESTADOS_CUENTA = ("activo", "gracia", "solo_lectura", "suspendido")

# Mismo espíritu que el cache de membresía de app/auth.py: el estado se lee en
# CADA pedido, así que 60 s de cache con invalidación explícita en el PATCH.
_ESTADO_CACHE_TTL_SEGUNDOS = 60.0
_estado_cache: dict[str, tuple[tuple[str, str | None], float]] = {}
_estado_cache_candado = threading.Lock()


def estado_de(slug: str) -> tuple[str, str | None]:
    """``(estado, motivo)`` del cliente. Fila ausente o "activo" → ("activo", None)."""
    ahora = time.monotonic()
    with _estado_cache_candado:
        cacheado = _estado_cache.get(slug)
        if cacheado is not None and cacheado[1] > ahora:
            return cacheado[0]

    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
    finally:
        reg.close()

    if fila is None or fila.estado == "activo":
        valor: tuple[str, str | None] = ("activo", None)
    else:
        valor = (fila.estado, fila.motivo)

    with _estado_cache_candado:
        _estado_cache[slug] = (valor, ahora + _ESTADO_CACHE_TTL_SEGUNDOS)
    return valor


def invalidar_cache_estado(slug: str) -> None:
    """La llama el PATCH del operador: el corte se siente en el pedido siguiente."""
    with _estado_cache_candado:
        _estado_cache.pop(slug, None)


def limpiar_cache_estado() -> None:
    """Para las pruebas, que arman una base nueva por prueba."""
    with _estado_cache_candado:
        _estado_cache.clear()


def es_operador(email: str | None) -> bool:
    """¿Este correo es operador de plataforma?

    La lista vive en la env ``OPERADOR_EMAILS`` (coma-separada, sin distinguir
    mayúsculas) — no hay tabla de superadmins que alguien pueda escribir. Se lee
    en cada llamada a propósito: los tests la monkeypatchean sin tocar caches.
    Sólo aplica a cuentas con ``sub`` — el email llega del token; el legado no
    trae email y jamás es operador.
    """
    if not email:
        return False
    crudos = os.getenv("OPERADOR_EMAILS", "")
    operadores = {e.strip().lower() for e in crudos.split(",") if e.strip()}
    return email.strip().lower() in operadores
```

### 2.2 Endpoints y semántica (rutas, payloads, códigos — vinculante)

**A) `POST /api/clientes/alta`** — router nuevo `app/routers/alta.py` (`prefix="/clientes"`). SIN JWT propio; body `{"id_token": str, "slug": str, "nombre": str}`. Orden exacto:

1. Freno por IP contra `IntentoAlta` (`frenar_si_hay_muchos_fallos(reg, ip, modelo=IntentoAlta)`) — ANTES del verificador. 429 si excede.
2. Verificador ausente (`get_verificador` → None) → **503** "Login con Google/correo no configurado en este servidor".
3. `claims = verificador.verificar(id_token)`; None → `anotar_fallo` + **401** "Token inválido o expirado".
4. Correo confiable con LA MISMA vara que `/oauth` (`email_verificado or proveedor == "google.com"`); si no → `anotar_fallo` + **401** "Verificá tu correo antes de entrar". Email vacío → `anotar_fallo` + 401.
5. `nombre` vacío tras strip → **422** "El nombre del supermercado no puede estar vacío".
6. `slug` normalizado (strip + lower); no matchea `SLUG_VALIDO` → **422** con el mensaje de `crear_cliente` ("El código del cliente va en minúsculas, sin espacios ni tildes, y arranca con una letra.").
7. `slug` en `SLUGS_RESERVADOS` → **409** "Ese código ya está tomado. Probá con otro."
   `SLUGS_RESERVADOS = {"galerias", "api", "www", "admin", "plataforma", "registro", "recabra", "app", "auth", "login", "oauth", "test", "demo", "soporte", "status", "render"}` (constante en `routers/alta.py`).
8. Ya existe `ClienteRow` con ese slug (**activo o no** — consulta directa a la tabla, no `buscar()`, que filtra inactivos y dejaría estrellar el UNIQUE) → **409** mismo detail que reservado.
9. Resolver/crear `Usuario` con las MISMAS reglas de vinculación que `/oauth` (por `firebase_uid`, si no por `email` confiable; nunca crear si el email ya tiene fila).
10. `count(Fundacion where usuario_id) >= 2` → **403** "Ya fundaste el máximo de clientes permitidos (2)."
11. Recién ahí `crear_cliente(slug, nombre)` (es el paso irreversible: TODA validación va antes — "sin cliente a medias"). `ErrorDeAlta` → 409; `IntegrityError` (carrera de slug) → 409 mismo detail.
12. `Membresia(usuario_id, cliente_slug=slug, rol="owner", activo=True)` + `Fundacion(...)` en UN solo commit del registro.
13. `borrar_fallos(reg, ip, modelo=IntentoAlta)` y **200**:
    `{"token", "role": "admin", "cliente": slug, "cliente_nombre": nombre, "email", "nombre"}` — token emitido igual que `/oauth` (`create_token("admin", epoca_de(cdb, "admin"), slug, sub=usuario.id, email=email)`, con la época leída de la base NUEVA del cliente).
    Los 401 cuentan fallo; 409/422/403 NO (a esa altura el token ya era válido; el tope de 2 acota el abuso).

**B) `GET /api/plataforma/soy`** — router nuevo `app/routers/plataforma.py` (`prefix="/plataforma"`). `require_auth`. **200** `{"operador": bool}`. Legado (token sin email) → siempre `false`.

**C) `GET /api/plataforma/clientes`** — dependencia `require_operador` (require_auth + `request.state.actor_email` presente + `es_operador(...)`; si no → **403** "Solo para operadores de la plataforma."; el legado no trae email → 403 siempre). **200**:
`{"clientes": [{"slug", "nombre", "activo", "estado", "motivo", "cambiado_en", "cambiado_por"}]}`
Todos los `ClienteRow` (incluidos inactivos) + join con `estados_cliente`; sin fila → `estado: "activo"`, `motivo/cambiado_en/cambiado_por: null`. **SOLO datos del registro — jamás abrir la base de un cliente desde este router.**

**D) `PATCH /api/plataforma/clientes/{slug}`** — `require_operador`. Body `{"estado": str, "motivo": str}`.
- `estado` ∉ `ESTADOS_CUENTA` → **422** "Estado inválido: debe ser uno de activo, gracia, solo_lectura, suspendido".
- `motivo` vacío tras strip → **422** "El motivo es obligatorio." (también para "activo": es la auditoría del cambio).
- slug sin `ClienteRow` → **404** "No hay un cliente con ese código."
- Upsert de la fila (también para "activo" — la fila queda como constancia del último cambio; el interruptor trata `estado=="activo"` igual que fila ausente), `cambiado_por` = email del operador, `cambiado_en` = ahora. Tras el commit: `invalidar_cache_estado(slug)`.
- **200**: `{"slug", "estado", "motivo", "cambiado_en", "cambiado_por"}`.

**E) El interruptor** — SOLO en `clientes.py::cliente_del_pedido` (helper privado `_aplicar_estado(cliente, request)`, llamado en TODOS los caminos que devuelven un cliente: el del token y el fallback `unico()`):

```
estado, motivo = plataforma_estado.estado_de(cliente.slug)
- "activo" o "gracia"                        → pasa
- path.startswith("/api/plataforma")         → pasa siempre (opera sobre el registro;
                                               un operador con su propio cliente
                                               degradado tiene que poder operar)
- "solo_lectura":
    method in (GET, HEAD, OPTIONS)           → pasa  (expire_leases() y demás
                                               escrituras internas de un GET
                                               permitido NO se tocan: el corte es
                                               al pedido HTTP, no a la sesión)
    path.startswith("/api/auth")
      or path.startswith("/api/usuarios")    → pasa  (login y gestión de usuarios
                                               del owner siguen — spec, decisión 3)
    resto                                    → 402 "Cuenta en solo lectura por pago
                                               pendiente."
- "suspendido"                               → 402 "La cuenta de este cliente está
                                               suspendida."  (todo método, GET incluido)
```

**F) Logins** (en `routers/auth.py`; NO pasan por `cliente_del_pedido`, el gating va explícito):
- `POST /api/auth/login` (legado): resuelto el cliente, `suspendido` → **402** "La cuenta de este cliente está suspendida." (ambos roles: el legado nunca es owner). `gracia`/`solo_lectura` → 200 con campo NUEVO opcional `aviso_cuenta: {"estado", "motivo"}` en `LoginOut`. El resto del legado no cambia en un byte.
- `POST /api/auth/oauth`: con la membresía elegida y el cliente resuelto: `suspendido` y `rol != "owner"` → **402** mismo detail (sin motivo: el motivo es para el owner). `suspendido` y owner → **200** con `aviso_cuenta: {"estado": "suspendido", "motivo"}`. `gracia`/`solo_lectura` → 200 + `aviso_cuenta`. La respuesta de multi-membresía (`requiere_cliente`) no cambia.
- **El JWT no cambia de forma**: `aviso_cuenta` es campo de RESPUESTA, jamás claim.

### 2.3 Registro en `main.py` (SOLO builder A lo toca)

```python
from app.routers import alta as alta_routes
from app.routers import plataforma as plataforma_routes
...
app.include_router(alta_routes.router,       prefix="/api")
app.include_router(plataforma_routes.router, prefix="/api")
```

(sin import de modelos en main.py: `plataforma_estado.py` ya registra las tablas, y lo importan a nivel de módulo `clientes.py` y los dos routers nuevos).

### 2.4 Territorios (disjuntos, vinculantes)

| Agente | Crea | Edita | Prohibido |
|---|---|---|---|
| A backend-alta-plataforma | `app/models/plataforma.py`\*, `app/plataforma_estado.py`\*, `app/routers/alta.py`, `app/routers/plataforma.py`, `tests/test_alta.py`, `tests/test_plataforma.py` | `app/main.py` (solo las 4 líneas de 2.3) | `clientes.py`, `routers/auth.py`, `routers/usuarios.py`, `models/models.py`, `models/identidad.py`, `frontend/**` |
| B backend-interruptor | `app/models/plataforma.py`\*, `app/plataforma_estado.py`\*, `tests/test_estado_cuenta.py` | `app/clientes.py`, `app/routers/auth.py` | `main.py`, routers nuevos, `usuarios.py`, `models/models.py`, `frontend/**` |
| C frontend | archivos nuevos bajo `frontend/src/` | `frontend/src/**` (Login, App, store, api, componentes) | `backend/**` |
| Red team | `tests/test_plataforma_ataques.py`, `features/clientes/outputs/red-team-fase-2.md` | — | todo código de `app/` y `frontend/` |
| Regresión | `features/clientes/outputs/regresion-fase-2.md` | `docs/ESTADO.md` | todo lo demás |

\* byte-a-byte según 2.1; si ya existe idéntico, no tocarlo; si existe distinto, frenar y reportar.

---

## 3. Misiones completas

Las misiones van en el retorno estructurado del maestro (una por agente, autocontenidas,
cada una con el contrato de 2.x adentro o referido por ruta absoluta a este archivo:
`/tmp/retail-espacios-test/features/clientes/outputs/equipo-fase-2.md`).

Resumen del equipo:

| id | nombre | modelo | tipo |
|---|---|---|---|
| backend-alta-plataforma | Builder Backend — Alta self-service y panel de plataforma | sonnet | builder |
| backend-interruptor | Builder Backend — Interruptor de estado de cuenta | opus | builder |
| frontend-clientes | Builder Frontend — Alta, avisos, bloqueo y panel operador | sonnet | builder |
| red-team-privilegio | Red Team — Frontera de operador y superficie de denegación | opus | auditor |
| auditor-regresion | Auditor — Regresión, checklist de spec y coherencia | sonnet | auditor |

## 4. Plan de verificación de cierre (lo corre el auditor de regresión)

- `cd backend && python -m pytest` — suite COMPLETA verde (las preexistentes intactas).
- `cd backend && python -c "import app.main"`.
- `cd frontend && npx tsc --noEmit`.
- Checklist de la spec, punto por punto (sección Verificación de `spec.md`).
- `git diff` de `models/models.py` y `models/identidad.py` VACÍO (ninguna columna a tablas existentes).
- Los dos archivos compartidos idénticos al contrato 2.1.
- `docs/ESTADO.md` actualizado con la sección de Fase 2.
