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

**El email del actor, cuando hay cuenta real.** Con las cuentas individuales
de Fase 1, ``app.auth.require_auth`` deja el correo de quien pide en
``request.state.actor_email`` para los tokens que lo traen (los de
``/oauth`` — el login legado no tiene con qué). Acá se agrega al ``detalle``
si está, así "quién" deja de ser sólo un rol y pasa a ser una persona en TODA
la bitácora —incluida la de contratos, archivos y demás acciones de negocio—
sin tener que tocar esos routers uno por uno: todos ya reciben el mismo
``Request`` y ya llaman a ``anotar``.
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
    "sede.renumerar": "Plano renumerado",
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
    # `request.state` no tiene `actor_email` salvo que `require_auth` (o
    # `require_auth_or_query_token`) lo haya puesto — que es exactamente
    # cuándo el token trae uno. Sin eso, `getattr` con default deja `detalle`
    # intacto: ningún llamador existente cambia de comportamiento.
    email_actor = getattr(getattr(request, "state", None), "actor_email", None) if request is not None else None
    detalle_final = f"{detalle} · {email_actor}" if (detalle and email_actor) else (detalle or email_actor)
    db.add(
        AuditEntry(
            at=datetime.now(timezone.utc),
            rol=rol or "desconocido",
            ip=ip_del_cliente(request),
            accion=accion,
            entidad=entidad,
            entidad_id=str(entidad_id) if entidad_id is not None else None,
            detalle=detalle_final,
        )
    )


def purgar(db: Session, dias: int = DIAS_QUE_SE_GUARDA) -> int:
    """Borra lo más viejo que el plazo de guarda. Devuelve cuántas líneas se fueron."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    borradas = db.query(AuditEntry).filter(AuditEntry.at < corte).delete(synchronize_session=False)
    db.commit()
    return borradas
