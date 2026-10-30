"""El respaldo y la restauración de TODA la plataforma (auditoría P0-3).

`scripts/respaldar_plataforma.py` (lo corre `.github/workflows/respaldo.yml`
cada noche) y `scripts/restaurar_plataforma.py`:

· qué bases baja: el registro, cada `clientes.db_name` y las `recabra_*`
  huérfanas; nunca dos veces la misma, nunca un nombre raro;
· las URLs: la clave no viaja en la línea de comandos ni en el manifiesto;
· la restauración: el registro va a la base del destino, cada cliente a su
  nombre; un `.dump` dañado o una base con tablas frenan antes de escribir;
· y de ida y vuelta contra Postgres de verdad (con `pg_dump`): se respalda un
  registro con dos clientes, se borran las bases, se restaura en otra y los
  datos vuelven.

No importan `app.*`: los scripts corren en el runner de GitHub sin la app.
"""
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import respaldar_plataforma as R  # noqa: E402
import restaurar_plataforma as V  # noqa: E402

PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")


# ─── URLs ─────────────────────────────────────────────────────────────────────

def test_las_urls_cambian_de_base_sin_perder_parametros_ni_mostrar_la_clave():
    url = "postgres://usu:cl%40ve@dpg-x.oregon-postgres.render.com:5432/retail_espacios?sslmode=require"
    assert R.normalizar_url(url).startswith("postgresql://")
    assert R.url_de_base(url, "recabra_olimpica") == (
        "postgresql://usu:cl%40ve@dpg-x.oregon-postgres.render.com:5432/recabra_olimpica?sslmode=require")
    assert R.base_de_url(url) == "retail_espacios"
    assert R.sin_clave(url) == "postgresql://dpg-x.oregon-postgres.render.com:5432/retail_espacios"
    conexion, entorno = R.para_libpq(url)
    assert "cl%40ve" not in conexion and "cl@ve" not in conexion
    assert entorno["PGPASSWORD"] == "cl@ve"
    assert conexion == "postgresql://usu@dpg-x.oregon-postgres.render.com:5432/retail_espacios?sslmode=require"


def test_sin_url_el_respaldo_no_arranca(monkeypatch):
    monkeypatch.delenv("RESPALDO_DATABASE_URL", raising=False)
    with pytest.raises(SystemExit):
        R.argumentos([])
    with pytest.raises(SystemExit):
        R.argumentos(["--url", "sqlite:///x.db"])
    a = R.argumentos(["--url", "postgres://u:p@h/db", "--listar"])
    assert a.url == "postgresql://u:p@h/db" and a.listar is True
    monkeypatch.setenv("RESPALDO_DATABASE_URL", "postgres://u:p@h/otra")
    assert R.argumentos([]).url == "postgresql://u:p@h/otra"


def test_la_restauracion_pide_destino_y_como_va_con_solo(tmp_path):
    with pytest.raises(SystemExit):
        V.argumentos([str(tmp_path)])
    with pytest.raises(SystemExit):
        V.argumentos([str(tmp_path), "--destino", "postgresql://u@h/r", "--como", "x"])
    a = V.argumentos([str(tmp_path), "--destino", "postgres://u@h/r", "--solo", "recabra_a", "--como", "recabra_b"])
    assert a.destino == "postgresql://u@h/r" and a.solo == "recabra_a" and a.como == "recabra_b"


# ─── Qué bases ────────────────────────────────────────────────────────────────

def test_las_bases_salen_del_registro_sin_repetir_ni_nombres_raros(tmp_path):
    from sqlalchemy import create_engine, text

    motor = create_engine(f"sqlite:///{tmp_path / 'registro.db'}")
    with motor.begin() as cx:
        cx.execute(text("CREATE TABLE clientes (slug TEXT, nombre TEXT, db_name TEXT, activo BOOLEAN)"))
        cx.execute(text("INSERT INTO clientes VALUES "
                        "('galerias', 'Galerías', 'retail', 1), ('olimpica', 'O', 'recabra_olimpica', 1), "
                        "('vieja', 'V', 'recabra_vieja', 0), ('doble', 'D', 'recabra_olimpica', 1), "
                        "('mala', 'M', 'recabra_x; DROP DATABASE y', 1)"))
    with motor.connect() as cx:
        bases = R.bases_a_respaldar(cx, "retail")
    motor.dispose()
    assert [(b["base"], b["origen"], b["slug"], b["activo"]) for b in bases] == [
        ("retail", "registro", "galerias", True),
        # Dos filas con la misma base: se baja una vez (la primera por slug).
        ("recabra_olimpica", "cliente", "doble", True),
        ("recabra_vieja", "cliente", "vieja", False),
    ]


def _manifiesto(tmp_path, bases):
    (tmp_path / "MANIFIESTO.json").write_text(json.dumps({
        "formato": 1, "tomado_en": "2026-10-30T06:41:00+00:00", "servidor": "postgresql://h/retail",
        "registro": "retail", "bases": bases,
    }), encoding="utf-8")


def _dump(tmp_path, nombre, contenido=b"PGDMP..."):
    import hashlib

    (tmp_path / f"{nombre}.dump").write_bytes(contenido)
    return {"base": nombre, "archivo": f"{nombre}.dump", "sha256": hashlib.sha256(contenido).hexdigest(),
            "origen": "registro" if nombre == "retail" else "cliente", "slug": None, "bytes": len(contenido)}


def test_el_plan_manda_el_registro_al_destino_y_cada_cliente_a_su_nombre(tmp_path):
    _manifiesto(tmp_path, [_dump(tmp_path, "recabra_a"), _dump(tmp_path, "retail")])
    m = V.leer_manifiesto(tmp_path)
    plan = V.plan(m, "postgresql://u@nuevo/retail_nueva")
    assert [(b["base"], b["hacia"]) for b in plan] == [("retail", "retail_nueva"), ("recabra_a", "recabra_a")]
    solo = V.plan(m, "postgresql://u@nuevo/retail_nueva", solo="recabra_a", como="recabra_a_revision")
    assert [(b["base"], b["hacia"]) for b in solo] == [("recabra_a", "recabra_a_revision")]
    with pytest.raises(V.ErrorDeRestauracion):
        V.plan(m, "postgresql://u@nuevo/r", solo="recabra_no_esta")
    with pytest.raises(V.ErrorDeRestauracion):
        V.plan(m, "postgresql://u@nuevo/r", solo="recabra_a", como="mal nombre; DROP")
    V.verificar(tmp_path, m, plan)


def test_un_dump_danado_frena_antes_de_escribir(tmp_path):
    _manifiesto(tmp_path, [_dump(tmp_path, "retail")])
    (tmp_path / "retail.dump").write_bytes(b"otra cosa")
    m = V.leer_manifiesto(tmp_path)
    with pytest.raises(V.ErrorDeRestauracion, match="dañado"):
        V.verificar(tmp_path, m, V.plan(m, "postgresql://u@h/r"))
    # Y por la línea de comandos sale con 2, sin conectarse a nada.
    assert V.main([str(tmp_path), "--destino", "postgresql://u@127.0.0.1:1/r"]) == 2


def test_sin_manifiesto_dice_que_falta_descifrar(tmp_path):
    with pytest.raises(V.ErrorDeRestauracion, match="descifrado"):
        V.leer_manifiesto(tmp_path)


# ─── De ida y vuelta, contra Postgres ─────────────────────────────────────────

@pytest.mark.xdist_group("postgres")
@pytest.mark.skipif(not PG.startswith("postgresql"), reason="el respaldo de verdad se prueba contra un Postgres descartable")
@pytest.mark.skipif(shutil.which("pg_dump") is None or shutil.which("pg_restore") is None,
                    reason="sin pg_dump/pg_restore en esta máquina")
def test_de_ida_y_vuelta_el_registro_y_dos_clientes(tmp_path):
    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    sufijo = uuid.uuid4().hex[:8]
    registro, destino_reg = f"resp_reg_{sufijo}", f"resp_dest_{sufijo}"
    clientes = [f"recabra_rt{sufijo}_a", f"recabra_rt{sufijo}_b"]
    servidor = create_engine(PG, poolclass=NullPool, isolation_level="AUTOCOMMIT")

    def ejecutar(base, *sentencias):
        motor = create_engine(R.url_de_base(PG, base), poolclass=NullPool)
        with motor.begin() as cx:
            for s in sentencias:
                cx.execute(text(s))
        motor.dispose()

    def leer(base, sql):
        motor = create_engine(R.url_de_base(PG, base), poolclass=NullPool)
        with motor.connect() as cx:
            valor = cx.execute(text(sql)).all()
        motor.dispose()
        return valor

    todas = [registro, destino_reg, *clientes]
    try:
        with servidor.connect() as cx:
            for b in todas:
                cx.execute(text(f'DROP DATABASE IF EXISTS "{b}"'))
            for b in [registro, *clientes]:
                cx.execute(text(f'CREATE DATABASE "{b}"'))
        ejecutar(registro,
                 "CREATE TABLE clientes (slug TEXT, nombre TEXT, db_name TEXT, activo BOOLEAN)",
                 f"INSERT INTO clientes VALUES ('galerias', 'G', '{registro}', true), "
                 f"('a', 'A', '{clientes[0]}', true), ('b', 'B', '{clientes[1]}', false)",
                 "CREATE TABLE usuarios (id serial PRIMARY KEY, email TEXT)",
                 "INSERT INTO usuarios (email) VALUES ('duena@a.co')")
        for i, b in enumerate(clientes):
            ejecutar(b, "CREATE TABLE space_files (id serial PRIMARY KEY, data bytea)",
                     f"INSERT INTO space_files (data) VALUES (decode('{'ab' * (i + 1)}', 'hex'))")

        salida = tmp_path / "respaldo"
        assert R.main(["--url", R.url_de_base(PG, registro), "--salida", str(salida)]) == 0
        manifiesto = json.loads((salida / "MANIFIESTO.json").read_text())
        nombres = [b["base"] for b in manifiesto["bases"]]
        assert nombres[:3] == [registro, *clientes], nombres
        assert "@" not in manifiesto["servidor"]  # ni usuario ni clave
        assert manifiesto["bases"][0]["slug"] == "galerias"

        # El desastre: se pierden las bases de los clientes.
        with servidor.connect() as cx:
            for b in clientes:
                cx.execute(text(f'DROP DATABASE "{b}" WITH (FORCE)'))
            cx.execute(text(f'CREATE DATABASE "{destino_reg}"'))

        solo_nuestras = [b for b in manifiesto["bases"] if b["base"] in (registro, *clientes)]
        manifiesto["bases"] = solo_nuestras
        (salida / "MANIFIESTO.json").write_text(json.dumps(manifiesto))
        destino = R.url_de_base(PG, destino_reg)
        assert V.main([str(salida), "--destino", destino, "--ensayo"]) == 0
        assert V.main([str(salida), "--destino", destino]) == 0
        assert leer(destino_reg, "SELECT email FROM usuarios") == [("duena@a.co",)]
        assert leer(destino_reg, "SELECT slug FROM clientes ORDER BY slug") == [("a",), ("b",), ("galerias",)]
        assert leer(clientes[0], "SELECT encode(data, 'hex') FROM space_files") == [("ab",)]
        assert leer(clientes[1], "SELECT encode(data, 'hex') FROM space_files") == [("abab",)]

        # Otra vez encima: ya tienen tablas, no se tocan sin --reemplazar…
        assert V.main([str(salida), "--destino", destino]) == 3
        # …y con --reemplazar, un cliente suelto vuelve a como estaba en el respaldo.
        ejecutar(clientes[0], "INSERT INTO space_files (data) VALUES ('\\x00')")
        assert V.main([str(salida), "--destino", destino, "--solo", clientes[0], "--reemplazar"]) == 0
        assert leer(clientes[0], "SELECT count(*) FROM space_files") == [(1,)]
    finally:
        with servidor.connect() as cx:
            for b in todas:
                cx.execute(text(f'DROP DATABASE IF EXISTS "{b}" WITH (FORCE)'))
        servidor.dispose()
