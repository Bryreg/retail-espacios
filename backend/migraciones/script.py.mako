"""${message}

Revisión: ${up_revision}
Anterior: ${down_revision | comma,n}
Creada:   ${create_date}

SÓLO ADITIVO (`tests/test_migraciones.py` lo vigila): tablas, columnas que
aceptan NULL o traen `server_default`, e índices. Nada se borra, se renombra ni
cambia de tipo: el código de la versión anterior tiene que seguir andando
contra la base ya migrada, porque durante el despliegue conviven.

Si agrega una columna, también va en el modelo; y como una base vieja a la que
le faltaba la TABLA la recibe entera de `create_all` (ya con la columna), se
agrega con `agregar_columna_si_falta` de `app.migraciones`, no con
`op.add_column` a secas.
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    # Sólo aditivo: no se vuelve atrás borrando. Un error se corrige con otra
    # migración hacia adelante.
    pass
