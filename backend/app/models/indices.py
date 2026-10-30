"""Índices que se agregaron DESPUÉS de que sus tablas existían.

Cada uno vive en dos lugares, a propósito:

· acá, colgado de la tabla en ``Base.metadata``: así ``create_all`` lo crea en
  una base NUEVA, que nace sellada en la última migración y nunca las corre;
· en su migración de ``migraciones/versions/``: así llega a las bases que ya
  existían, donde ``create_all`` no toca una tabla que ya está.

Se declaran acá y no adentro de la clase para no tocar los modelos de tablas
existentes (``test_t22``): un índice no es una columna, pero la regla se mira
línea por línea.
"""
from sqlalchemy import Index

from app.models.models import SpaceLease

# `space_leases.space_id` (auditoría P1-8): cada lectura de `/spaces/comercial`
# vence contratos y busca los vivos de cada espacio, y sin índice eso es un
# recorrido entero de la tabla por espacio.
IX_SPACE_LEASES_SPACE_ID = Index("ix_space_leases_space_id", SpaceLease.__table__.c.space_id)
# `space_leases.supplier_id`: la ficha del proveedor, «sus contratos».
IX_SPACE_LEASES_SUPPLIER_ID = Index("ix_space_leases_supplier_id", SpaceLease.__table__.c.supplier_id)
