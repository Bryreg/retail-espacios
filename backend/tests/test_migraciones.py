"""Alembic, sólo aditivo (auditoría P1-8).

· **La regla**: ninguna migración borra, renombra ni cambia el tipo de nada, y
  una columna nueva acepta NULL o trae `server_default`. Se mira el `upgrade()`
  de cada archivo de `migraciones/versions/` con `ast`, y el detector se prueba
  contra migraciones de mentira que la rompen.
· **Una sola cabeza**: dos ramas sueltas dejarían a la mitad de las bases sin
  una de las dos.
· **Todas las bases**: al arrancar, el registro y cada cliente quedan en la
  última revisión, con el índice de `space_leases.space_id` puesto.
· **Una base de antes de Alembic** (tablas sin `alembic_version`) se sella en la
  línea base y recibe las migraciones; una base nueva nace en la última.
"""
import ast
import os
from pathlib import Path

import pytest

VERSIONES = Path(__file__).resolve().parents[1] / "migraciones" / "versions"

# Lo que una migración no puede hacer en su `upgrade()`.
PROHIBIDAS = {
    "drop_table", "drop_column", "drop_index", "drop_constraint", "drop_table_comment",
    "drop_column_comment", "rename_table", "alter_column",
}
_SQL_PROHIBIDO = ("DROP ", "RENAME ", "ALTER COLUMN", " TYPE ", "TRUNCATE ", "DELETE FROM")


def violaciones(codigo: str) -> list[str]:
    """Lo que el `upgrade()` de esa migración hace y no puede hacer."""
    arbol = ast.parse(codigo)
    upgrade = next((n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == "upgrade"), None)
    if upgrade is None:
        return ["no tiene upgrade()"]
    malas = []
    for nodo in ast.walk(upgrade):
        if not isinstance(nodo, ast.Call):
            continue
        nombre = nodo.func.attr if isinstance(nodo.func, ast.Attribute) else getattr(nodo.func, "id", "")
        if nombre in PROHIBIDAS:
            malas.append(nombre)
        if nombre == "execute":
            for arg in nodo.args:
                texto = ast.unparse(arg).upper()
                if any(p in texto for p in _SQL_PROHIBIDO):
                    malas.append(f"execute({ast.unparse(arg)[:60]})")
        if nombre in ("add_column", "agregar_columna_si_falta"):
            # La columna: `sa.Column(...)` como segundo argumento.
            columna = nodo.args[1] if len(nodo.args) > 1 else None
            if isinstance(columna, ast.Call):
                kw = {k.arg: k.value for k in columna.keywords}
                no_nula = isinstance(kw.get("nullable"), ast.Constant) and kw["nullable"].value is False
                if no_nula and "server_default" not in kw:
                    malas.append("add_column NOT NULL sin server_default")
    return malas


def _migraciones() -> list[Path]:
    return sorted(p for p in VERSIONES.glob("*.py") if not p.name.startswith("_"))


def test_hay_migraciones_y_todas_son_aditivas():
    archivos = _migraciones()
    assert archivos, "no hay migraciones en migraciones/versions/"
    malas = {p.name: violaciones(p.read_text(encoding="utf-8")) for p in archivos}
    assert {k: v for k, v in malas.items() if v} == {}


@pytest.mark.parametrize("cuerpo, esperado", [
    ("op.drop_table('spaces')", "drop_table"),
    ("op.drop_column('spaces', 'notes')", "drop_column"),
    ("op.alter_column('spaces', 'code', type_=sa.Text())", "alter_column"),
    ("op.alter_column('spaces', 'code', new_column_name='codigo')", "alter_column"),
    ("op.rename_table('spaces', 'espacios')", "rename_table"),
    ("op.drop_index('ix_x')", "drop_index"),
    ("op.execute('DROP TABLE spaces')", "execute("),
    ("op.execute('ALTER TABLE spaces RENAME COLUMN a TO b')", "execute("),
    ("op.execute(\"ALTER TABLE s ALTER COLUMN a TYPE text\")", "execute("),
    ("op.add_column('spaces', sa.Column('x', sa.Integer(), nullable=False))", "add_column NOT NULL"),
    ("with op.batch_alter_table('spaces') as b:\n        b.drop_column('notes')", "drop_column"),
])
def test_el_detector_rechaza_lo_que_no_es_aditivo(cuerpo, esperado):
    codigo = f"from alembic import op\nimport sqlalchemy as sa\n\ndef upgrade():\n    {cuerpo}\n\ndef downgrade():\n    pass\n"
    assert any(esperado in v for v in violaciones(codigo)), violaciones(codigo)


@pytest.mark.parametrize("cuerpo", [
    "op.create_table('nueva', sa.Column('id', sa.Integer(), primary_key=True))",
    "op.create_index('ix_a', 'spaces', ['sede'], if_not_exists=True)",
    "op.add_column('spaces', sa.Column('x', sa.Integer(), nullable=True))",
    "op.add_column('spaces', sa.Column('x', sa.Integer(), nullable=False, server_default='0'))",
    "pass",
])
def test_el_detector_deja_pasar_lo_aditivo(cuerpo):
    codigo = f"from alembic import op\nimport sqlalchemy as sa\n\ndef upgrade():\n    {cuerpo}\n\ndef downgrade():\n    op.drop_table('x')\n"
    assert violaciones(codigo) == []


def test_una_sola_cabeza_y_la_linea_base_es_la_raiz():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config()
    cfg.set_main_option("script_location", str(VERSIONES.parent))
    guion = ScriptDirectory.from_config(cfg)
    assert len(guion.get_heads()) == 1, guion.get_heads()
    assert list(guion.get_bases()) == ["0001_linea_base"]


def _version(url: str) -> str | None:
    from sqlalchemy import create_engine

    from app.migraciones import version_de

    motor = create_engine(url)
    try:
        with motor.connect() as cx:
            return version_de(cx)
    finally:
        motor.dispose()


def _indices(url: str, tabla: str) -> set[str]:
    from sqlalchemy import create_engine, inspect

    motor = create_engine(url)
    try:
        return {i["name"] for i in inspect(motor).get_indexes(tabla)}
    finally:
        motor.dispose()


def test_al_arrancar_el_registro_y_cada_cliente_quedan_en_la_ultima(client):
    from app.clientes import crear_cliente, listar, motor_de
    from app.database import SQLALCHEMY_DATABASE_URL
    from app.migraciones import cabeza, url_de_motor

    crear_cliente("olimpica", "Olímpica")
    nuevo = crear_cliente("exito", "Éxito")
    head = cabeza()
    assert _version(SQLALCHEMY_DATABASE_URL) == head
    for cliente in listar():
        url = url_de_motor(motor_de(cliente))
        assert _version(url) == head, cliente.slug
        assert {"ix_space_leases_space_id", "ix_space_leases_supplier_id"} <= _indices(url, "space_leases")
    # Y una base nueva no corrió migraciones: nació entera y sellada.
    assert _version(url_de_motor(motor_de(nuevo))) == head


def test_una_base_de_antes_de_alembic_se_sella_y_recibe_el_indice(tmp_path, monkeypatch):
    """Una base como las de producción el día del despliegue: todas sus tablas
    (las de `create_all`), datos adentro, sin `alembic_version` y sin el índice."""
    from sqlalchemy import create_engine, text

    archivo = tmp_path / "vieja.db"
    url = f"sqlite:///{archivo}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    import sys
    for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[m]
    try:
        import app.main  # noqa: F401 — todas las tablas
        from app.database import Base
        from app.migraciones import LINEA_BASE, cabeza, preparar_base

        motor = create_engine(url)
        Base.metadata.create_all(motor)
        with motor.begin() as cx:
            cx.execute(text("DROP INDEX ix_space_leases_space_id"))
            cx.execute(text("DROP INDEX ix_space_leases_supplier_id"))
            cx.execute(text("INSERT INTO suppliers (id, name) VALUES (1, 'Alpina')"))
        motor.dispose()
        assert _version(url) is None
        assert "ix_space_leases_space_id" not in _indices(url, "space_leases")

        assert preparar_base(url) == "sellada"
        assert _version(url) == cabeza() != LINEA_BASE
        assert {"ix_space_leases_space_id", "ix_space_leases_supplier_id"} <= _indices(url, "space_leases")
        # No tocó los datos, y la segunda vez no hace nada.
        motor = create_engine(url)
        with motor.connect() as cx:
            assert cx.execute(text("SELECT name FROM suppliers")).scalar() == "Alpina"
        motor.dispose()
        assert preparar_base(url) == "al_dia"
    finally:
        for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
            del sys.modules[m]


def test_una_base_vacia_nace_sellada_en_la_ultima(tmp_path, monkeypatch):
    import sys

    url = f"sqlite:///{tmp_path / 'nueva.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[m]
    try:
        from app.migraciones import cabeza, preparar_base

        assert preparar_base(url) == "nueva"
        assert _version(url) == cabeza()
        assert "ix_space_leases_space_id" in _indices(url, "space_leases")
    finally:
        for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
            del sys.modules[m]


PG = os.environ.get("DATABASE_URL_PG_PRUEBA", "")


@pytest.mark.xdist_group("postgres")
@pytest.mark.skipif(not PG.startswith("postgresql"), reason="la migración en Postgres se prueba contra un Postgres descartable")
def test_en_postgres_la_linea_base_y_el_indice(monkeypatch):
    """Lo mismo contra Postgres de verdad: DDL transaccional, `if_not_exists`
    y el candado de migración (advisory lock) que se toma y se suelta."""
    import sys

    from sqlalchemy import create_engine, text

    monkeypatch.setenv("DATABASE_URL", PG)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[m]
    try:
        import app.main  # noqa: F401
        from app.database import Base, engine
        from app.migraciones import cabeza, candado_de_migracion, preparar_base

        Base.metadata.drop_all(engine)
        with engine.begin() as cx:
            cx.execute(text("DROP TABLE IF EXISTS alembic_version"))
        Base.metadata.create_all(engine)
        with engine.begin() as cx:
            cx.execute(text("DROP INDEX ix_space_leases_space_id"))
        with candado_de_migracion():
            assert preparar_base(PG) == "sellada"
        with engine.connect() as cx:
            assert cx.execute(text("SELECT version_num FROM alembic_version")).scalar() == cabeza()
            assert cx.execute(text(
                "SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_space_leases_space_id'")).scalar() == 1
        # El candado se soltó: otra conexión lo toma sin esperar.
        from app.services.lider import clave
        otro = create_engine(PG)
        with otro.connect() as cx:
            assert cx.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": clave("migraciones")}).scalar()
            cx.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": clave("migraciones")})
        otro.dispose()
        engine.dispose()
        Base.metadata.drop_all(engine)
        with engine.begin() as cx:
            cx.execute(text("DROP TABLE IF EXISTS alembic_version"))
        engine.dispose()
    finally:
        for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
            del sys.modules[m]
