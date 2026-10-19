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
    "contrato.importado": "Contratos importados del plano",
    "contrato.barrido": "Empezar de cero: contratos y planos limpiados",
    "copia.descarga": "Copia de seguridad descargada",
    # La escribe el mantenimiento, sin usuario (sale «sistema · desconocida»):
    # las fotos de montaje y las planometrías de contratos terminados hace más
    # de 5 días sin renovación. No termina en «.baja» a propósito: es una tarea
    # esperada y la pantalla pinta de rojo lo que termina así. Ver
    # `services/fotos_vencidas.py`.
    "archivo.vencido": "Fotos y planometrías vencidas, borradas",
    # Las fichas propias de los muebles (`routers/muebles.py`). Retirar no es
    # borrar —lo colocado sigue igual—, así que no termina en «.baja».
    "ficha_mueble.alta": "Ficha de mueble creada",
    "ficha_mueble.cambio": "Ficha de mueble cambiada",
    "ficha_mueble.retiro": "Ficha de mueble retirada",
    "ficha_mueble.reactivacion": "Ficha de mueble reactivada",
    # Participaciones de cara (`routers/participaciones.py`). La cancelación de una
    # reserva termina en «.baja» como la de un contrato: la pantalla la pinta igual.
    # La cancelación de un contrato de participación sigue anotando `contrato.baja`
    # (el camino de siempre). El autoguardado del borrador no anota nada.
    "participacion.reserva": "Reserva provisional de participación creada",
    "participacion.contrato": "Contrato de participación creado",
    "participacion.confirmada": "Reserva provisional confirmada como contrato",
    "participacion.renovada": "Participación renovada",
    "participacion.editada": "Reserva provisional cambiada",
    "reserva.baja": "Reserva provisional cancelada",
    "distribucion.borrador": "Borrador de distribución guardado",
    "distribucion.confirmada": "Distribución confirmada",
    "distribucion.descartada": "Borrador de distribución descartado",
    # fase 2 · I1 · «Copiar zonas de otra cara»: las zonas llegan como borrador
    # (no se copia ningún contrato ni reserva) y hay que confirmarlas.
    "distribucion.copiada": "Zonas copiadas de otra cara (borrador)",
}

# fase 2 · I5 · El renombre de una sede (`POST /layout/{sede}/renombrar`,
# `services/renombre_sede.py`): sus códigos pasan al nombre nuevo y lo vendido
# sigue vivo. No termina en «.baja» a propósito: no se pierde nada, y la
# pantalla pinta de rojo lo que termina así.
ACCIONES["sede.renombrar"] = "Sede renombrada"

# Lo que ya no puede pasar (2026-10-02) y por eso el filtro de la pantalla no lo
# ofrece. El título se queda en ACCIONES: las filas viejas, de hasta un año, se
# siguen leyendo con su nombre.
#
# · `login.fallo` y `clave.cambio` los escribían el ingreso y el cambio de las
#   claves compartidas, apagados desde el 2026-10-01 (sólo vuelven con el
#   interruptor de emergencia `LOGIN_LEGADO`).
# · `contrato.barrido` lo escribía «Empezar de cero», que salió de producción.
RETIRADAS = {"login.fallo", "clave.cambio", "contrato.barrido"}

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
