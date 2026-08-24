import asyncio
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
from app.routers import spaces, suppliers, dashboard, layout, files, notifications, mounts
from app.routers import auth as auth_routes
from app.models.models import Space, SpaceStatus

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


def _run_lease_maintenance():
    """Expire stale leases and send expiry reminders (runs in a worker thread)."""
    from app.database import SessionLocal
    from app.routers.spaces import expire_leases
    from app.services.reminders import check_expiring_leases
    db = SessionLocal()
    try:
        expire_leases(db)
        check_expiring_leases(db)
    finally:
        db.close()


async def _lease_maintenance_loop():
    """Run maintenance at startup and then every 12 hours. Never dies on errors."""
    while True:
        try:
            await asyncio.to_thread(_run_lease_maintenance)
        except Exception:
            logger.exception("Error en el ciclo de mantenimiento de contratos")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        ensure_default_config(db)
        if db.query(Space).count() == 0:
            seed_spaces(db)
    finally:
        db.close()
    # Background task: lease expiry + email reminders (runs immediately, then every 12 h)
    maintenance_task = asyncio.create_task(_lease_maintenance_loop())
    yield
    maintenance_task.cancel()
    try:
        await maintenance_task
    except asyncio.CancelledError:
        pass


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Retail Espacios API", lifespan=lifespan)

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

app.include_router(auth_routes.router,   prefix="/api")
app.include_router(spaces.router,        prefix="/api")
app.include_router(suppliers.router,     prefix="/api")
app.include_router(dashboard.router,     prefix="/api")
app.include_router(layout.router,        prefix="/api")
app.include_router(files.router,         prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(mounts.router,        prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Retail Espacios API"}


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
