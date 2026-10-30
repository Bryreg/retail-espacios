"""El respaldo tomado desde adentro del servicio (auditoría P0-3).

La base de producción no acepta conexiones de afuera, así que el cron de GitHub
le pide el archivo ya cifrado al servicio: `POST /api/interno/respaldo`, con la
misma puerta que el mantenimiento. Acá: la puerta, lo que falta configurar, que
la carpeta temporal se borre, y una ida y vuelta real contra Postgres (descifrar
con la frase y leer el manifiesto).
"""
import json
import os
import shutil
import subprocess
import tarfile
import uuid

import pytest

PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")
TOKEN = "token-de-prueba-del-respaldo"
CAB = {"X-Mantenimiento-Token": TOKEN}


def test_sin_token_configurado_la_ruta_no_existe(client, monkeypatch):
    monkeypatch.delenv("MANTENIMIENTO_TOKEN", raising=False)
    assert client.post("/api/interno/respaldo", headers=CAB).status_code == 404


def test_con_otro_token_401(client, monkeypatch):
    monkeypatch.setenv("MANTENIMIENTO_TOKEN", TOKEN)
    assert client.post("/api/interno/respaldo", headers={"X-Mantenimiento-Token": "otro"}).status_code == 401
    assert client.post("/api/interno/respaldo").status_code == 401


def test_sin_postgres_o_sin_frase_lo_dice(client, monkeypatch):
    monkeypatch.setenv("MANTENIMIENTO_TOKEN", TOKEN)
    monkeypatch.setenv("RESPALDO_PASSPHRASE", "una frase")
    # Las pruebas corren en SQLite: no hay pg_dump que valga.
    r = client.post("/api/interno/respaldo", headers=CAB)
    assert r.status_code == 409 and "Postgres" in r.json()["detail"]

    # En Postgres, pero sin la frase: no se entrega nada sin cifrar.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/r")
    monkeypatch.delenv("RESPALDO_PASSPHRASE", raising=False)
    r = client.post("/api/interno/respaldo", headers=CAB)
    assert r.status_code == 409 and "RESPALDO_PASSPHRASE" in r.json()["detail"]


def test_entrega_el_archivo_y_borra_la_carpeta(client, monkeypatch, tmp_path):
    from app.services import respaldo_interno

    carpeta = tmp_path / "temporal"
    carpeta.mkdir()
    archivo = carpeta / "recabra-respaldo-2026-10-30-0641.tar.gpg"
    archivo.write_bytes(b"\x8c\x0d bytes cifrados")
    hecho = respaldo_interno.Respaldo(carpeta=carpeta, archivo=archivo, nombre=archivo.name, bases=3, fallas=["recabra_x"])
    monkeypatch.setattr(respaldo_interno, "tomar", lambda: hecho)
    monkeypatch.setenv("MANTENIMIENTO_TOKEN", TOKEN)

    r = client.post("/api/interno/respaldo", headers=CAB)
    assert r.status_code == 200
    assert r.content == b"\x8c\x0d bytes cifrados"
    assert archivo.name in r.headers["content-disposition"]
    assert r.headers["x-respaldo-bases"] == "3"
    assert r.headers["x-respaldo-fallas"] == "1"
    assert not carpeta.exists()  # lo intermedio no queda en el disco del servicio


@pytest.mark.xdist_group("postgres")
@pytest.mark.skipif(not PG.startswith("postgresql"), reason="el respaldo de verdad se prueba contra un Postgres descartable")
@pytest.mark.skipif(shutil.which("pg_dump") is None or shutil.which("gpg") is None, reason="sin pg_dump o gpg en esta máquina")
def test_de_verdad_en_postgres_se_descifra_con_la_frase(client, monkeypatch, tmp_path):
    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    from app.services.respaldo_interno import _script

    R = _script()
    sufijo = uuid.uuid4().hex[:8]
    registro, cliente = f"resp_int_{sufijo}", f"recabra_ri{sufijo}"
    servidor = create_engine(PG, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        with servidor.connect() as cx:
            for b in (registro, cliente):
                cx.execute(text(f'DROP DATABASE IF EXISTS "{b}"'))
                cx.execute(text(f'CREATE DATABASE "{b}"'))
        motor = create_engine(R.url_de_base(PG, registro), poolclass=NullPool)
        with motor.begin() as cx:
            cx.execute(text("CREATE TABLE clientes (slug TEXT, nombre TEXT, db_name TEXT, activo BOOLEAN)"))
            cx.execute(text(f"INSERT INTO clientes VALUES ('galerias', 'G', '{registro}', true), ('a', 'A', '{cliente}', true)"))
        motor.dispose()

        monkeypatch.setenv("DATABASE_URL", R.url_de_base(PG, registro))
        monkeypatch.setenv("RESPALDO_PASSPHRASE", "la frase del dueño")
        monkeypatch.setenv("MANTENIMIENTO_TOKEN", TOKEN)
        r = client.post("/api/interno/respaldo", headers=CAB)
        assert r.status_code == 200, r.text
        assert r.headers["x-respaldo-fallas"] == "0"
        cifrado = tmp_path / "r.tar.gpg"
        cifrado.write_bytes(r.content)
        assert b"MANIFIESTO" not in r.content  # va cifrado de verdad

        # Con la frase se abre; sin ella, no.
        casa = tmp_path / ".gnupg"
        casa.mkdir(mode=0o700)
        entorno = {**os.environ, "GNUPGHOME": str(casa)}
        mal = subprocess.run(["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
                              "--decrypt", str(cifrado)], input=b"otra frase", capture_output=True, env=entorno)
        assert mal.returncode != 0
        tar = tmp_path / "r.tar"
        subprocess.run(["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
                        "--output", str(tar), "--decrypt", str(cifrado)],
                       input="la frase del dueño".encode(), check=True, capture_output=True, env=entorno)
        with tarfile.open(tar) as t:
            t.extractall(tmp_path / "abierto")
        manifiesto = json.loads((tmp_path / "abierto" / "respaldo" / "MANIFIESTO.json").read_text())
        nombres = [b["base"] for b in manifiesto["bases"]]
        assert nombres[:2] == [registro, cliente]
        assert all((tmp_path / "abierto" / "respaldo" / f"{b}.dump").exists() for b in nombres[:2])
    finally:
        with servidor.connect() as cx:
            for b in (registro, cliente):
                cx.execute(text(f'DROP DATABASE IF EXISTS "{b}" WITH (FORCE)'))
        servidor.dispose()
