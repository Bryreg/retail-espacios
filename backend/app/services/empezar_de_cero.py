"""Borrar todos los contratos y dejar los planos limpios para volver a cargar.

Existe para un momento puntual y no para el uso diario: el sistema estuvo en
prueba, se cargaron contratos por varios caminos que ya no existen, y quedó
mezcla —contratos de prueba en la base, y en el JSON de los planos muebles
marcados «Ocupado» a mano cuando el selector todavía lo permitía—.

Ahora que lo comercial tiene UNA sola verdad, conviene barrer eso de una vez:
lo que se cargue después queda derecho, porque ya no hay otro camino por donde
entre. Ésta es la escoba.

── Qué borra ────────────────────────────────────────────────────────────────

Los contratos (`space_leases`) y lo que cuelga de ellos y quedaría apuntando al
vacío: las planometrías (`lease_files`) y los avisos enviados
(`notification_log`). Los espacios que estaban ocupados vuelven a libre.

Y limpia el JSON de TODOS los planos: los siete campos de contrato salen de
cada mueble y de cada cara B. Sin eso, el plano seguiría diciendo «ocupado» de
espacios que ya no tienen contrato, que es el desfase que todo esto vino a
eliminar.

── Qué NO borra, y por qué ──────────────────────────────────────────────────

**Los planos.** La geometría es trabajo dibujado a mano, sede por sede. Acá se
le quita lo comercial y no se toca un solo mueble.

**Los proveedores.** Son contactos reales de gente real. Un proveedor sin
contratos no molesta a nadie y volver a escribirlos es trabajo perdido.

**Los espacios.** Sin contrato vivo un espacio está libre, que es justo lo que
se busca. Borrar la fila además arrastraría sus archivos y su planometría.

**Los reportes de montaje.** Son la prueba de lo que un mercaderista armó, con
su foto. Se informan pero no se tocan: borrar la evidencia de trabajo hecho es
una decisión que no toma una escoba.
"""
import json
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.models import (
    LayoutSnapshot, LeaseFile, MountConfirmation, NotificationLog,
    Space, SpaceLease, SpaceStatus, Supplier,
)
from app.services.layout_lookup import CAMPOS_DE_CONTRATO


@dataclass
class Barrido:
    """Qué hay para borrar, o qué se borró. La misma forma en los dos pasos."""
    contratos: int = 0
    planometrias: int = 0
    avisos: int = 0
    espacios_ocupados: int = 0
    #: Muebles del JSON que traen estado comercial escrito.
    muebles_con_residuo: int = 0
    sedes_con_residuo: list[str] = field(default_factory=list)
    #: Lo que se deja en pie, para que se vea que se deja.
    proveedores_intactos: int = 0
    espacios_intactos: int = 0
    montajes_intactos: int = 0
    aplicado: bool = False


def _residuo_en(fixtures: list) -> int:
    """Cuántos muebles del plano traen algo comercial escrito."""
    n = 0
    for f in fixtures:
        if not isinstance(f, dict):
            continue
        if any(c in f for c in CAMPOS_DE_CONTRATO):
            n += 1
            continue
        cara_b = f.get("faceB")
        if isinstance(cara_b, dict) and any(c in cara_b for c in CAMPOS_DE_CONTRATO):
            n += 1
    return n


def revisar(db: Session) -> Barrido:
    """Qué se borraría. **No escribe una sola fila.**"""
    salida = Barrido(
        contratos=db.query(SpaceLease).count(),
        planometrias=db.query(LeaseFile).count(),
        avisos=db.query(NotificationLog).count(),
        espacios_ocupados=(
            db.query(Space).filter(Space.status == SpaceStatus.occupied).count()
        ),
        proveedores_intactos=db.query(Supplier).count(),
        espacios_intactos=db.query(Space).count(),
        montajes_intactos=db.query(MountConfirmation).count(),
    )

    for snap in db.query(LayoutSnapshot).all():
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(fixtures, list):
            continue
        n = _residuo_en(fixtures)
        if n:
            salida.muebles_con_residuo += n
            salida.sedes_con_residuo.append((snap.sede or "").strip().upper())

    salida.sedes_con_residuo.sort()
    return salida


def aplicar(db: Session) -> Barrido:
    """Barrer. Todo en una transacción: o cae todo o no cae nada."""
    plan = revisar(db)

    # Primero lo que cuelga, o el borrado del contrato choca contra su clave
    # foránea. `synchronize_session=False` porque no se vuelve a usar la sesión
    # para esas filas: se van enteras.
    db.query(LeaseFile).delete(synchronize_session=False)
    db.query(NotificationLog).delete(synchronize_session=False)
    db.query(SpaceLease).delete(synchronize_session=False)

    # Los espacios vuelven a libre. «Reservado» y «en mantenimiento» se
    # respetan: los puso una persona a propósito y no son contratos.
    for space in db.query(Space).filter(Space.status == SpaceStatus.occupied).all():
        space.status = SpaceStatus.free

    # Y el plano deja de opinar. Se reescribe sólo lo que cambió: un snapshot
    # sin residuo no se toca, así su `updated_at` no se mueve y las pestañas
    # abiertas no se creen desactualizadas.
    for snap in db.query(LayoutSnapshot).all():
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(fixtures, list) or not _residuo_en(fixtures):
            continue
        for f in fixtures:
            if not isinstance(f, dict):
                continue
            for campo in CAMPOS_DE_CONTRATO:
                f.pop(campo, None)
            cara_b = f.get("faceB")
            if isinstance(cara_b, dict):
                for campo in CAMPOS_DE_CONTRATO:
                    cara_b.pop(campo, None)
                if not cara_b:
                    f.pop("faceB", None)
        snap.fixtures_json = json.dumps(fixtures)

    db.commit()
    plan.aplicado = True
    return plan
