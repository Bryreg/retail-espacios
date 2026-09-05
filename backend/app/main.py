import asyncio
import threading
import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.auth import ensure_default_config
from app.database import engine, Base
from app.routers import spaces, suppliers, dashboard, layout, files, notifications, mounts, montaje, planograms, bulk_leases, catalogo
from app.routers import bitacora as bitacora_routes
from app.routers import auth as auth_routes
from app.routers import usuarios as usuarios_routes
from app.routers import alta as alta_routes
from app.routers import derechos as derechos_routes
from app.routers import plataforma as plataforma_routes
from app.models.models import Space, SpaceStatus
from app.services.subidas import LimiteDeCuerpo
# Tablas de identidad (Fase 1): archivo nuevo, sin columnas agregadas a nada
# existente. El único propósito de este import es que `Base.metadata` las
# conozca ANTES de que corra `create_all()` en el lifespan de abajo — si no,
# `create_all` nunca se entera de que existen.
from app.models import identidad as identidad_models  # noqa: F401

logger = logging.getLogger("retail.main")


# ─── Seed ─────────────────────────────────────────────────────────────────────

def seed_spaces(db):
    spaces_data = [
        # Row A
        {"code": "A01", "svg_id": "lic-24h", "name": "Licores 24H", "zone": "Pasillo A", "area_m2": 6.5},
        {"code": "A02", "svg_id": "lic-golosinas", "name": "Licores / Golosinas y Nueces", "zone": "Pasillo A", "area_m2": 9.5},
        {"code": "A03", "svg_id": "sal-azucar-granos", "name": "Sal / Panela / Azúcar / Granos", "zone": "Pasillo A", "area_m2": 14.0},
        {"code": "A04", "svg_id": "arroz-centro", "name": "Arroz (3 módulos)", "zone": "Pasillo A", "area_m2": 10.0},
        {"code": "A05", "svg_id": "grano-granel", "name": "Grano a Granel", "zone": "Pasillo A", "area_m2": 7.5},
        {"code": "A06", "svg_id": "desechables-a", "name": "Desechables (sector A)", "zone": "Pasillo A", "area_m2": 6.0},
        {"code": "A07", "svg_id": "vacio-aceites", "name": "Vacío / Aceites", "zone": "Pasillo A", "area_m2": 8.0},
        # Row B
        {"code": "B01", "svg_id": "utensilios-ferreteria", "name": "Utensilios Plásticos / Ferretería / Autos", "zone": "Pasillo B", "area_m2": 16.5},
        {"code": "B02", "svg_id": "mascotas", "name": "Mascotas / Mascotas Granel", "zone": "Pasillo B", "area_m2": 14.0},
        {"code": "B03", "svg_id": "arroz-exhibicion", "name": "Arroz - Exhibición Principal", "zone": "Arroz", "area_m2": 35.0},
        # Row C
        {"code": "C01", "svg_id": "aseo-panales", "name": "Aseo BB / Pañales / Papel Higiénico", "zone": "Pasillo C", "area_m2": 18.0},
        {"code": "C02", "svg_id": "escobas-guantes", "name": "Escobas / Traperos / Guantes / Bolsas", "zone": "Pasillo C", "area_m2": 9.0},
        {"code": "C03", "svg_id": "servilletas-cocina", "name": "Servilletas / Papel Cocina", "zone": "Pasillo C", "area_m2": 7.0},
        {"code": "C04", "svg_id": "mezclas-harinas", "name": "Mezclas / Harinas", "zone": "Pasillo C", "area_m2": 7.5},
        {"code": "C05", "svg_id": "pastas-salsas", "name": "Pastas / Salsas", "zone": "Pasillo C", "area_m2": 7.0},
        {"code": "C06", "svg_id": "aceites-sopas", "name": "Aceites / Mantequilla / Sopas y Cremas", "zone": "Pasillo C", "area_m2": 9.5},
        {"code": "C07", "svg_id": "cereales", "name": "Cereales / Leche Líquida / Pan Dulce", "zone": "Pasillo C", "area_m2": 8.0},
        {"code": "C08", "svg_id": "panaderia-sal", "name": "Panadería / Sal", "zone": "Panadería", "area_m2": 12.0},
        # Zona Promocional
        {"code": "PROMO", "svg_id": "zona-promocional", "name": "Zona Promocional", "zone": "Promocional", "area_m2": 25.0},
        # Row D - Lácteos / Refrigerados
        {"code": "D01", "svg_id": "leche-huevos", "name": "Leche Líquida / Huevos / Condimentos", "zone": "Refrigerados", "area_m2": 22.0},
        # Row D - Cuidado Personal
        {"code": "D02", "svg_id": "cuid-facial-des", "name": "CUD Facial / Desodorantes", "zone": "Pasillo D", "area_m2": 13.0},
        {"code": "D03", "svg_id": "jab-cuid-oral", "name": "JAB Corp / Cuidado Oral / Capilar", "zone": "Pasillo D", "area_m2": 13.0},
        # Row D - Dulces
        {"code": "D04", "svg_id": "gelatinas-aromaticas", "name": "Gelatinas / Aromáticas / Modificadores", "zone": "Pasillo D", "area_m2": 9.0},
        {"code": "D05", "svg_id": "cafes-choco", "name": "Cafés / Chocomesa", "zone": "Pasillo D", "area_m2": 12.0},
        # Row E - Limpieza
        {"code": "E01", "svg_id": "limpiadores-insect", "name": "Limpiadores / Iluminación / Insecticidas", "zone": "Pasillo E", "area_m2": 14.0},
        {"code": "E02", "svg_id": "detergente-polvo", "name": "Detergente Polvo / Limpia Pisos / Lavaloza", "zone": "Pasillo E", "area_m2": 15.0},
        # Row E - Galletería
        {"code": "E03", "svg_id": "galletas", "name": "Galletas", "zone": "Pasillo E", "area_m2": 10.0},
        {"code": "E04", "svg_id": "reposteria", "name": "Repostería", "zone": "Pasillo E", "area_m2": 13.0},
        # Row F
        {"code": "F01", "svg_id": "enlatados-conservas", "name": "Encurtidos / Enlatados", "zone": "Pasillo F", "area_m2": 14.0},
        {"code": "F02", "svg_id": "leche-polvo-bebe", "name": "Leche Polvo / Alimento Bebé / Avenas", "zone": "Pasillo F", "area_m2": 11.5},
        {"code": "F03", "svg_id": "desechables-snack", "name": "Desechables / Snack", "zone": "Pasillo F", "area_m2": 10.5},
        {"code": "F04", "svg_id": "ref-cosmeticos", "name": "REF / Res / Cosméticos", "zone": "Pasillo F", "area_m2": 10.0},
        # Bottom strip
        {"code": "G01", "svg_id": "jabon-blanq", "name": "Bondi / Blanqueadores / Suavizantes / Jabón en Barra", "zone": "Pasillo G", "area_m2": 18.0},
        # Especialidades
        {"code": "SP1", "svg_id": "cantera", "name": "Cantera / En Guaje", "zone": "Especialidades", "area_m2": 8.0},
        {"code": "SP2", "svg_id": "vivero", "name": "Vivero", "zone": "Especialidades", "area_m2": 6.0},
        {"code": "SP3", "svg_id": "decoraciones", "name": "Decoraciones", "zone": "Especialidades", "area_m2": 7.0},
        {"code": "SP4", "svg_id": "zona-azul", "name": "Pasillo Final / Zona Azul", "zone": "Especialidades", "area_m2": 40.0},
        # Refrigeradores derecha
        {"code": "REF1", "svg_id": "ref-col-a", "name": "Refrigerador Columna A", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF2", "svg_id": "ref-col-b", "name": "Refrigerador Columna B", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF3", "svg_id": "ref-col-c", "name": "Refrigerador Columna C", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF4", "svg_id": "ref-col-d", "name": "Refrigerador Columna D", "zone": "Refrigeradores", "area_m2": 8.0},
    ]
    for s in spaces_data:
        db.add(Space(**s, status=SpaceStatus.free))
    db.commit()


# ─── Lease maintenance loop ───────────────────────────────────────────────────

REMINDER_INTERVAL_SECONDS = 12 * 60 * 60  # every 12 hours

# Corte cooperativo del hilo de mantenimiento. `Task.cancel()` cancela la TASK
# de asyncio pero NO el hilo de SO que `to_thread` ya lanzó: sin esta señal, el
# hilo quedaba huérfano al apagar la app, seguía recorriendo clientes contra
# bases que el teardown de los tests ya había borrado ("database is locked"),
# y —como los hilos del executor por defecto no son daemon— mantenía vivo el
# proceso de pytest después del 100 %. El hilo mira la señal entre cliente y
# cliente y se retira solo.
_stop_mantenimiento = threading.Event()


def _run_lease_maintenance():
    """Expire stale leases and send expiry reminders (runs in a worker thread).

    Recorre **todos los clientes**. Cada supermercado tiene su propia base, sus
    propios contratos y sus propios destinatarios de correo, así que el
    mantenimiento se hace una vez por cada uno. Si uno falla, los demás siguen:
    un problema en la base de un cliente no puede dejar sin recordatorios a los
    otros.
    """
    from app.clientes import listar, sesion_de
    from app.routers.spaces import expire_leases
    from app.services.bitacora import purgar
    from app.services.reminders import check_expiring_leases

    for cliente in listar():
        if _stop_mantenimiento.is_set():
            return
        db = sesion_de(cliente)
        try:
            expire_leases(db)
            check_expiring_leases(db)
            # La bitácora no puede crecer para siempre en una base de plan
            # gratuito, y guardar más de lo necesario es su propio riesgo.
            purgar(db)
        except Exception:
            logger.exception("Mantenimiento falló para el cliente %s", cliente.slug)
        finally:
            db.close()

    # Cierre automático del mes (Fase 5): snapshotea el MES YA CERRADO si le
    # falta la fila a algún cliente, para que la serie de tendencia no dependa de
    # que alguien haya abierto la consola ese mes. Es una tarea de la PLATAFORMA
    # y no de cada supermercado: se hace una sola vez por corrida. Va DESPUÉS del
    # recorrido y no antes: cuando falta una fila recorre todas las bases por
    # `calcular()`, y hacer eso primero retrasaba vencimientos y recordatorios
    # varios segundos en cada arranque (y volvía intermitentes los tests de
    # recordatorios, que comparten este hilo). En su propio try/except: una falla
    # del histórico no puede dejar sin nada al resto del ciclo. Sólo LEE las
    # bases de cliente; lo que escribe va al registro.
    if _stop_mantenimiento.is_set():
        return
    from app.plataforma_tendencia import cerrar_mes_anterior
    try:
        cerrar_mes_anterior()
    except Exception:
        logger.exception("El cierre mensual de la serie de tendencia falló")


# La vuelta de mantenimiento que está corriendo AHORA en el hilo de fondo, para
# que el apagado pueda esperarla. Cancelar la tarea asyncio corta el `await`,
# no el hilo: sin esto, el hilo seguía vivo después del shutdown y —en los
# tests, que levantan y bajan la app cientos de veces— terminaba escribiendo en
# la base del test SIGUIENTE (mismo proceso, `DATABASE_URL` ya cambiado).
_mantenimiento_en_vuelo: "asyncio.Future | None" = None


async def _lease_maintenance_loop():
    """Run maintenance at startup and then every 12 hours. Never dies on errors."""
    global _mantenimiento_en_vuelo
    loop = asyncio.get_running_loop()
    while True:
        try:
            _mantenimiento_en_vuelo = loop.run_in_executor(None, _run_lease_maintenance)
            # `shield`: la cancelación de esta tarea no toca al hilo (no se puede
            # matar un hilo); quien lo espera hasta el final es el lifespan.
            await asyncio.shield(_mantenimiento_en_vuelo)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en el ciclo de mantenimiento de contratos")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.clientes import listar, motor_de, registrar_el_de_siempre, sesion_de

    # La base por defecto primero: es donde vive la lista de clientes, así que
    # tiene que tener sus tablas antes de poder preguntarle quiénes son.
    Base.metadata.create_all(bind=engine)
    por_defecto = registrar_el_de_siempre()

    for cliente in listar():
        Base.metadata.create_all(bind=motor_de(cliente))
        db = sesion_de(cliente)
        try:
            ensure_default_config(db)
            # Los pasillos de ejemplo se siembran SÓLO en la base de siempre.
            # Darle "Licores 24H" y "Arroz" a un supermercado nuevo sería peor
            # que dejarlo vacío: parece que el sistema ya sabe algo de su tienda
            # cuando no sabe nada.
            if cliente.slug == por_defecto.slug and db.query(Space).count() == 0:
                seed_spaces(db)
        finally:
            db.close()
    # Background task: lease expiry + email reminders (runs immediately, then every 12 h)
    _stop_mantenimiento.clear()  # los tests abren y cierran la app muchas veces
    maintenance_task = asyncio.create_task(_lease_maintenance_loop())
    yield
    _stop_mantenimiento.set()  # el hilo en vuelo se retira en el próximo cliente
    maintenance_task.cancel()  # y esto corta el sleep de 12 horas
    try:
        await maintenance_task
    except asyncio.CancelledError:
        pass
    # Y se espera al hilo hasta que de verdad termine: la app no está apagada
    # mientras un hilo suyo siga leyendo bases. Con tope, para que un cliente
    # con la base colgada no deje al proceso sin poder salir.
    en_vuelo = _mantenimiento_en_vuelo
    if en_vuelo is not None and not en_vuelo.done():
        try:
            await asyncio.wait_for(asyncio.shield(en_vuelo), timeout=30)
        except asyncio.TimeoutError:
            logger.warning("El mantenimiento de fondo no terminó en 30 s; se lo abandona")
        except Exception:
            pass  # su error ya quedó en el log del ciclo


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="RECABRA API", lifespan=lifespan)

# CORS: set ALLOWED_ORIGINS env var in production (comma-separated).
# Falls back to localhost dev ports so the app works out of the box.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Tope de tamaño del cuerpo del pedido (hallazgo hardening-1c). Va acá, entre
# los middlewares, porque tiene que correr ANTES de cualquier autenticación:
# hasta ahora `POST /api/auth/login` con 5 MB de "contraseña" se parseaba
# entero para terminar contestando 401, y para eso no hace falta cuenta.
# `add_middleware` apila del último al primero, así que este queda por DENTRO
# de `cabeceras_de_seguridad` (registrado más abajo) y su 413 sale con CSP y
# el resto de las cabeceras, como cualquier otra respuesta.
app.add_middleware(LimiteDeCuerpo)

# ─── Cabeceras de seguridad ──────────────────────────────────────────────────
#
# La misma aplicación sirve la API y el frontend, así que estas cabeceras cubren
# las dos cosas. La política de contenido está escrita contra lo que la app
# realmente usa, medido archivo por archivo (Fase 3, `features/compliance/`) y
# no un origen más:
#
#   style-src  https://fonts.googleapis.com  — frontend/index.html:15, <link
#              rel="stylesheet"> de Geist/Archivo Narrow.
#   font-src   https://fonts.gstatic.com      — los .woff2 que baja ese CSS.
#   connect-src https://identitytoolkit.googleapis.com
#               https://securetoken.googleapis.com
#              — frontend/src/api/firebase.ts: signInWithPopup,
#              signInWithEmailAndPassword, createUserWithEmailAndPassword,
#              sendPasswordResetEmail y el refresh de ID token, TODOS vía el
#              SDK de Firebase Auth (`@firebase/auth`), pegan a estos dos
#              hosts. `grep -n "identitytoolkit\|securetoken"
#              node_modules/@firebase/auth/dist/esm/index-*.js` los confirma
#              como los ÚNICOS hosts de red que arma el SDK (apiHost /
#              tokenApiHost, ver esa misma búsqueda). El resto de la app
#              (axios en frontend/src/api/client.ts) sólo pega a `/api`,
#              mismo origen — cubierto por 'self'.
#   script-src https://apis.google.com
#              — SOLO por signInWithPopup: `Login.tsx` usa el popup de
#              Google (no signInWithRedirect), y el propio SDK, antes de
#              abrir el popup, instancia `BrowserPopupRedirectResolver`
#              (@firebase/auth/dist/esm/index-*.js:10709 en adelante), que
#              carga `gapi.iframes` bajando
#              `DEFAULT_CDNDOMAIN.gapiScript = "https://apis.google.com/js/api.js"`
#              (misma fuente, línea ~11263) SI `window.gapi.iframes.Iframe`
#              no está ya presente. Sin este origen el popup de Google se
#              rompe (el listener de eventos entre ventanas no arranca);
#              login por correo/contraseña (`signInWithEmailAndPassword`,
#              `createUserWithEmailAndPassword`) no lo necesita, pero
#              Login.tsx ofrece las dos vías en la misma pantalla.
#   frame-src https://*.firebaseapp.com
#              — el mismo `BrowserPopupRedirectResolver._openIframe` abre un
#              iframe OCULTO en `https://${authDomain}/__/auth/iframe`
#              (índice ~10461) para escuchar el resultado del popup vía
#              postMessage — es la pieza que faltaba junto al script de
#              arriba. `authDomain` es `VITE_FIREBASE_AUTH_DOMAIN`
#              (`render.yaml`: `recabra.firebaseapp.com`); el wildcard de
#              subdominio cubre ese valor sin clavar el nombre del proyecto
#              acá adentro, para el día que cambie.
#   img-src / worker-src  data: blob:
#              — Three.js (`@react-three/fiber`) texturiza las caras de los
#              muebles con `blob:` (fotos de proveedor bajadas por
#              `fileUrl()`) y usa Web Workers también por blob; sin cambios,
#              ya alcanzaba.
#
# `unsafe-inline` en los estilos es inevitable hoy: media aplicación pinta con
# `style={{...}}` de React, que son atributos inline. En los SCRIPTS no está, que
# es donde de verdad importa — el único origen externo que se sumó ahí
# (`apis.google.com`) es un script CONCRETO de Google, no un comodín.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://*.firebaseapp.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


@app.middleware("http")
async def cabeceras_de_seguridad(request, call_next):
    respuesta = await call_next(request)
    respuesta.headers["Content-Security-Policy"] = CSP
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    # Redundante con frame-ancestors, para navegadores que no la apliquen.
    respuesta.headers["X-Frame-Options"] = "DENY"
    respuesta.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    respuesta.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS sólo donde hubo TLS de verdad. `request.url.scheme` no alcanza
    # detrás del proxy de Render: la conexión entre el proxy y este proceso
    # es SIEMPRE http, así que Starlette arma la URL con scheme "http" aun
    # cuando el navegador entró por https — con sólo esa condición, HSTS
    # jamás se hubiera mandado en producción. Render (como cualquier proxy
    # estándar) agrega `X-Forwarded-Proto: https` en ese caso; en desarrollo
    # directo (uvicorn sin proxy) el header no existe y gana la condición de
    # siempre.
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        respuesta.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return respuesta


app.include_router(auth_routes.router,   prefix="/api")
# Alta, listado y activación de miembros de un cliente. Todo detrás de
# `require_admin` (ver `routers/usuarios.py`), sobre el cliente del token.
app.include_router(usuarios_routes.router, prefix="/api")
# Derechos del titular (Fase 3): export owner-only y solicitud de supresión.
# Mismo prefix "/clientes" que alta_routes, ambos con rutas literales -- el
# orden entre los dos no cambia ningún resultado, pero va ANTES por el
# contrato de esta fase. Registra `solicitudes_supresion`/`export_attempts` en
# Base.metadata al importar `app/models/supresion.py`.
app.include_router(derechos_routes.router,   prefix="/api")
# Alta self-service (funda su cliente y nace owner) y panel del operador de
# plataforma (estado de cuenta por cliente). Fase 2 -- las tablas nuevas ya
# quedan registradas en Base.metadata porque `app/plataforma_estado.py` las
# importa a nivel de módulo, y estos dos routers importan ese módulo.
app.include_router(alta_routes.router,       prefix="/api")
app.include_router(plataforma_routes.router, prefix="/api")
app.include_router(spaces.router,        prefix="/api")
app.include_router(suppliers.router,     prefix="/api")
app.include_router(dashboard.router,     prefix="/api")
app.include_router(layout.router,        prefix="/api")
app.include_router(files.router,         prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(mounts.router,        prefix="/api")
# El enlace firmado de la mercaderista. Es lo ÚNICO que alcanza ese token: el
# resto de la app lo rechaza en `require_auth`.
app.include_router(montaje.router,       prefix="/api")
app.include_router(planograms.router,    prefix="/api")
app.include_router(bulk_leases.router,   prefix="/api")
# Las artes de los proveedores: qué producto se le prueba a un mueble en el 3D.
app.include_router(catalogo.router,      prefix="/api")
# Quién hizo qué. Sólo la lee el administrador.
app.include_router(bitacora_routes.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "RECABRA API"}


# ─── Static frontend (production only) ───────────────────────────────────────
# In Docker the build copies frontend/dist next to the backend directory.
# Path from /app/backend/app/main.py → /app/frontend/dist
_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve SPA index.html for any path not matched by an API route."""
        # Don't serve the SPA for unknown /api/* paths — return a proper 404 instead
        # so clients get JSON errors rather than the HTML shell.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file = _DIST / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(_DIST / "index.html")
