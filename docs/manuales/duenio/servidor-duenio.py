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
    MANUAL_TMP=<carpeta de levantar.sh> python servidor-duenio.py 8793

El puerto va también en la línea de comandos (no sólo en MANUAL_PUERTO) para
que `levantar-duenio.sh` apague sólo el servidor de SU puerto (`pkill -f
"servidor-duenio.py <puerto>$"`), sin tocar las copias de otros puertos.
"""
import os
import sys
from pathlib import Path

PUERTO = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MANUAL_PUERTO", "8790"))
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


# El correo de invitación no pasa por la cola de correos (sale directo con
# `send_mail_to_bg`), así que `correoReal()` no lo encuentra. Acá, sólo en la
# copia de prueba, se guarda tal como lo armó el servidor —asunto, destinatario
# y HTML— en `<MANUAL_TMP>/correos-directos-<puerto>/` para capturarlo, y no
# sale ninguno (como con el SMTP cortado de `servidor.sh`).
import json  # noqa: E402

import app.routers.usuarios as _usuarios  # noqa: E402

CORREOS_DIRECTOS = BASE.parent / f"correos-directos-{PUERTO}"


def _guardar_correo_directo(destinatarios, asunto, html):
    CORREOS_DIRECTOS.mkdir(parents=True, exist_ok=True)
    n = len(list(CORREOS_DIRECTOS.glob("*.json"))) + 1
    (CORREOS_DIRECTOS / f"{n:03d}.json").write_text(json.dumps(
        {"asunto": asunto, "para": list(destinatarios), "html": html}, ensure_ascii=False), encoding="utf-8")
    return False


_usuarios.send_mail_to_bg = _guardar_correo_directo

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PUERTO, log_level="warning")
