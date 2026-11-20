"""La copia de prueba del manual del DUEÑO: el mismo backend de `servidor.sh`,
sobre la MISMA base que dejó `levantar.sh` (no la borra), con una sola
diferencia: el ingreso con Google/correo acepta tokens de prueba.

Firebase no se puede usar en una copia descartable, así que acá el verificador
de tokens se reemplaza (con `dependency_overrides` de FastAPI, sin tocar el
código de la app) por uno que acepta `prueba:<correo>:<nombre>`. Con eso la
dueña entra de verdad —con su cuenta, su membresía `owner` y su `sub`— y se ven
las pantallas que el ingreso por clave no abre (Suscripción, Copia, Tus datos,
Reporte de transparencia).

Uso (lo arranca `capturas.cjs`; a mano):
    MANUAL_TMP=<carpeta de levantar.sh> MANUAL_PUERTO=8793 python servidor-duenio.py
"""
import os
import sys
from pathlib import Path

PUERTO = int(os.environ.get("MANUAL_PUERTO", "8790"))
BASE = Path(os.environ.get("MANUAL_TMP", "/tmp")) / f"bd-{PUERTO}"
RAIZ = Path(__file__).resolve().parents[3]

os.environ.update({
    "ENV": "test", "LOGIN_LEGADO": "1",
    "DATABASE_URL": f"sqlite:///{BASE}/manual.db",
    "JWT_SECRET": "manual-solo-para-la-base-descartable-de-las-capturas-xxxxxxxxxxxx",
    "ADMIN_PASSWORD": "admin-manual", "WORKER_PASSWORD": "trabajador-manual",
    "EMAIL_PROVIDER": "smtp", "SMTP_HOST": "127.0.0.1", "SMTP_PORT": "9",
    "SMTP_USER": "avisos@supermercado.example", "SMTP_PASSWORD": "nada",
    "EMAIL_API_KEY": "", "SENTRY_DSN": "", "LOG_FORMAT": "texto",
    "APP_URL": f"http://127.0.0.1:{PUERTO}",
    "FIREBASE_PROJECT_ID": "manual-de-prueba",
    "OPERADOR_EMAILS": "operador@recabra.example",
})
os.chdir(RAIZ / "backend")
sys.path.insert(0, str(RAIZ / "backend"))

from app.main import app  # noqa: E402
from app.services.firebase_tokens import ClaimsVerificadas, get_verificador  # noqa: E402


class VerificadorDePrueba:
    def verificar(self, id_token: str):
        partes = (id_token or "").split(":")
        if len(partes) < 2 or partes[0] != "prueba":
            return None
        correo = partes[1].strip().lower()
        nombre = partes[2] if len(partes) > 2 else None
        return ClaimsVerificadas(uid="uid-" + correo, email=correo, email_verificado=True,
                                 proveedor="password", nombre=nombre)


app.dependency_overrides[get_verificador] = lambda: VerificadorDePrueba()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PUERTO, log_level="warning")
