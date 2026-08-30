"""La bitácora: quién hizo qué.

Dos reglas, y las dos importan más de lo que parece.

**`anotar` no hace commit.** Se agrega a la sesión que ya trae el endpoint y
viaja con su transacción, así que el registro y el cambio caen juntos o no cae
ninguno. Una bitácora que dice que se borró un contrato que en realidad no se
borró es peor que no tener bitácora: manda a buscar donde no hay nada.

**Nunca entra un secreto.** El detalle es para reconocer la línea —"Alpina ·
NAVE-PUN-01"—, no para reconstruir el dato. Una contraseña, el contenido de un
contrato o un token no se anotan: la bitácora la va a leer más gente que la
base, y es justo lo que un atacante buscaría primero.
"""
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.models import AuditEntry
from app.red import ip_del_cliente

# Los códigos que se usan hoy. Están acá juntos a propósito: es la lista de lo
# que el sistema considera digno de recordar, y conviene poder leerla de un
# vistazo antes de agregar el siguiente.
ACCIONES = {
    "login.ok": "Ingreso",
    "login.fallo": "Intento fallido",
    "clave.cambio": "Cambio de contraseña",
    "contrato.alta": "Contrato creado",
    "contrato.baja": "Contrato cancelado",
    "espacio.estado": "Estado de espacio cambiado",
    "archivo.alta": "Documento subido",
    "archivo.baja": "Documento borrado",
    "archivo.descarga": "Documento descargado",
    "sede.baja": "Sede borrada",
}

# Un año. Suficiente para cualquier reclamo de un proveedor sobre un contrato
# de temporada, y corto para que la tabla no crezca sin techo en una base de
# plan gratuito.
DIAS_QUE_SE_GUARDA = 365


def anotar(
    db: Session,
    request: Request | None,
    rol: str,
    accion: str,
    *,
    entidad: str | None = None,
    entidad_id: str | int | None = None,
    detalle: str | None = None,
) -> None:
    """Agrega una línea a la bitácora. **No hace commit**: lo hace quien llama."""
    db.add(
        AuditEntry(
            at=datetime.now(timezone.utc),
            rol=rol or "desconocido",
            ip=ip_del_cliente(request),
            accion=accion,
            entidad=entidad,
            entidad_id=str(entidad_id) if entidad_id is not None else None,
            detalle=detalle,
        )
    )


def purgar(db: Session, dias: int = DIAS_QUE_SE_GUARDA) -> int:
    """Borra lo más viejo que el plazo de guarda. Devuelve cuántas líneas se fueron."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    borradas = db.query(AuditEntry).filter(AuditEntry.at < corte).delete(synchronize_session=False)
    db.commit()
    return borradas
