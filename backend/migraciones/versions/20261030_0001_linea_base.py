"""La línea base: el esquema tal como lo deja `create_all` el día que llegó Alembic.

Revisión: 0001_linea_base
Anterior: (ninguna)
Creada:   2026-10-30

No hace nada, a propósito. Hasta acá el esquema lo armaba
`Base.metadata.create_all()` y nada más («sin migraciones»): cada base que ya
existía tiene lo que `create_all` le fue creando, y eso ES la línea base. No se
enumeran tablas: mientras esta revisión se escribía, otros cambios agregaban
tablas nuevas que `create_all` también crea, y una lista acá envejecería el
mismo día.

`app/migraciones.py` sella con esta revisión toda base que ya tenía tablas y no
tenía `alembic_version`, y después la lleva hasta la última. Una base nueva nace
entera de `create_all` y se sella directamente en la última.
"""

revision = "0001_linea_base"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
