"""``JWT_SECRET`` es obligatorio fuera de desarrollo (auditoría pre-lanzamiento,
P1-10).

Antes la app sólo exigía el secreto si veía ``RENDER`` o una URL de Postgres:
el despliegue VPS (SQLite, sin ``JWT_SECRET``) arrancaba con el secreto de
desarrollo, que está en el repo, y cualquiera podía firmarse un token de admin.
Se prueba en un proceso aparte porque el chequeo corre al importar ``app.auth``.
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _importar(env_extra: dict) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k not in ("JWT_SECRET", "ENV", "APP_ENV", "RENDER")}
    env.update({"DATABASE_URL": "sqlite:///:memory:", **env_extra})
    return subprocess.run([sys.executable, "-c", "import app.auth as a; print('ok', len(a.JWT_SECRET))"],
                          cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)


def test_sin_secreto_y_sin_modo_desarrollo_no_arranca():
    r = _importar({})
    assert r.returncode != 0
    assert "Falta JWT_SECRET" in r.stderr


def test_sin_secreto_en_desarrollo_o_pruebas_arranca():
    for modo in ("dev", "test"):
        r = _importar({"ENV": modo})
        assert r.returncode == 0, r.stderr
        assert r.stdout.startswith("ok")


def test_un_secreto_corto_arranca_pero_lo_dice():
    r = _importar({"JWT_SECRET": "corto"})
    assert r.returncode == 0, r.stderr
    assert "JWT_SECRET tiene 5 bytes" in r.stderr


def test_un_secreto_largo_arranca_callado():
    r = _importar({"JWT_SECRET": "x" * 64})
    assert r.returncode == 0, r.stderr
    assert "JWT_SECRET tiene" not in r.stderr
