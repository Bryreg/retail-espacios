"""Test harness for the API.

Every test gets a throwaway SQLite file. The environment has to be set before
``app.database`` is imported, because it builds the engine from ``DATABASE_URL``
at module level — so nothing from ``app`` may be imported at the top of this
file.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["ENV"] = "test"

    # Imported here, and purged afterwards, so each test builds a fresh engine
    # bound to its own file instead of sharing the first test's database.
    import app.database  # noqa: F401
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c

    import sys
    for name in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[name]
    os.unlink(path)


def _token(client, password: str) -> str:
    r = client.post("/api/auth/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture()
def admin(client):
    """Authorization header for the default admin."""
    return {"Authorization": f"Bearer {_token(client, 'admin123')}"}


@pytest.fixture()
def worker(client):
    """Authorization header for the default worker."""
    return {"Authorization": f"Bearer {_token(client, 'galerias')}"}
