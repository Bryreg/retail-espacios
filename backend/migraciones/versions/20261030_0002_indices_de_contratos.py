"""Índices de `space_leases` por espacio y por proveedor (auditoría P1-8).

Revisión: 0002_indices_de_contratos
Anterior: 0001_linea_base
Creada:   2026-10-30

La primera migración de verdad, y sólo aditiva: dos índices sobre claves
foráneas que se consultan en cada lectura del plano (`expire_leases`, los
contratos vivos de cada espacio en `/spaces/comercial`) y en la ficha del
proveedor. Los mismos índices están colgados del modelo en
`app/models/indices.py`, así una base nueva los recibe de `create_all`.

`if_not_exists`: una base vieja a la que le faltaba la tabla `space_leases`
entera la recibió de `create_all` con los índices puestos.
"""
from alembic import op

revision = "0002_indices_de_contratos"
down_revision = "0001_linea_base"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_space_leases_space_id", "space_leases", ["space_id"], if_not_exists=True)
    op.create_index("ix_space_leases_supplier_id", "space_leases", ["supplier_id"], if_not_exists=True)


def downgrade() -> None:
    # Sólo aditivo: no se vuelve atrás borrando.
    pass
