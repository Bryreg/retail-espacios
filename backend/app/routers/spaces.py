from datetime import date
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from app.auth import require_admin, require_auth
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.fechas import hoy
from app.models.models import Space, SpaceFace, SpaceLease, Supplier, SpaceStatus
from app.models.vender import ReservaDeEspacio
from app.services.bitacora import anotar
from app.services.condiciones import ETIQUETA_DEL_VALOR, valor_de_lease
from app.schemas.spaces import (
    SpaceOut, SpaceCreate, SpaceStatusUpdate, LeaseCreate, LeaseOut, SpaceMapItem,
    SpaceFindOrCreate, AvisosContrato,
)
from app.services.contacts import recipients_for
from app.services.candado import tomar_candados
from app.services.layout_lookup import (
    NO_COMERCIALIZABLE, NUNCA_ALQUILABLE, SIN_CARA_B, como_se_venden_sus_piezas, contratos_que_chocan,
    find_fixture_by_space_code, forma_canonica, frase_de_choque, por_que_no_se_vende,
)
from app.services.partes import cantidad_de, es_participacion, partir_codigo, texto_para_montar
from app.services.ciclo_participaciones import actor_de, al_cancelar_contrato
from app.services.montajes_pendientes import dejar_pendiente
from app.services.participaciones import bloqueo_por_participaciones
from app.services.mailer import (
    html_shell, send_mail_to_bg, correo_configurado,
)

# Every route requires a valid token; mutations additionally require admin.
router = APIRouter(prefix="/spaces", tags=["spaces"], dependencies=[Depends(require_auth)])


def _space_out_for_role(space: Space, role: str) -> SpaceOut:
    """Serialize a Space, hiding the lease amount from non-admin roles.

    Redaction happens on the pydantic copy so the ORM objects (and therefore
    the session) are never mutated.
    """
    out = SpaceOut.model_validate(space, from_attributes=True)
    if role != "admin":
        # Las DOS: el contrato próximo lleva el mismo valor negociado, y
        # agregarlo al esquema sin tacharlo acá habría abierto por la ventana
        # justo lo que la app cierra por la puerta.
        for lease in (out.active_lease, out.upcoming_lease):
            if lease is not None:
                lease.monthly_rent = None
                # Y la nota, que es TEXTO LIBRE: ahí es donde alguien escribe
                # «descuento del 25% cerrado por teléfono». Tachar el número y
                # dejar pasar la nota deja la plata fugándose en castellano.
                lease.notes = None
    return out


# ─── Lease expiry helper ──────────────────────────────────────────────────────

def expire_leases(db: Session) -> int:
    """Mark leases whose end_date has passed as inactive and free their spaces.

    Returns the number of leases expired.
    """
    today = hoy()
    expired = (
        db.query(SpaceLease)
        .filter(SpaceLease.is_active == True, SpaceLease.end_date < today)  # noqa: E712
        .all()
    )
    count = 0
    for lease in expired:
        lease.is_active = False
        db.flush()  # ensure the query below sees the updated flag
        # Only set space to free if no other active lease remains
        remaining = (
            db.query(SpaceLease)
            .filter(
                SpaceLease.space_id == lease.space_id,
                SpaceLease.is_active == True,  # noqa: E712
                SpaceLease.id != lease.id,
            )
            .count()
        )
        if remaining == 0:
            space = db.query(Space).filter(Space.id == lease.space_id).first()
            if space and space.status == SpaceStatus.occupied:
                space.status = SpaceStatus.free
        count += 1
    if count:
        db.commit()
    return count


@router.get("/map", response_model=list[SpaceMapItem])
def get_map_status(db: Session = Depends(get_db)):
    # Expire stale leases on every map refresh so the UI always reflects reality
    expire_leases(db)
    spaces = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).all()
    result = []
    for space in spaces:
        # Space.active_lease is date-aware: a lease signed for a future period
        # is deliberately not reported here.
        active_lease = space.active_lease
        result.append(SpaceMapItem(
            svg_id=space.svg_id,
            status=space.status,
            name=space.name,
            supplier_name=active_lease.supplier.name if active_lease else None,
        ))
    return result


# ─── El estado comercial, que es de la BASE ───────────────────────────────────


class EstadoComercial(BaseModel):
    """Lo que la base sabe de un espacio hoy. La forma es la que ya usa el
    plano, a propósito: así el navegador lo fusiona sin traducir nada."""
    status: str
    supplierName: str = ""
    brandCategory: str = ""
    negotiatedValue: float = 0
    startDate: str = ""
    endDate: str = ""
    observation: str = ""
    #: Hasta cuándo se sostiene una reserva viva de la cara o de la parte
    #: (``models/vender.ReservaDeEspacio``): sólo para quien administra. El
    #: trabajador ve la cara tomada y nada más.
    reservaHasta: Optional[str] = None


@router.get("/comercial", response_model=dict[str, EstadoComercial])
def estado_comercial(
    sede: str | None = None,
    role: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Quién tiene vendido cada espacio, por código completo.

    **Es la única verdad sobre lo comercial.** El JSON del layout guarda la
    geometría —dónde está el mueble, cuánto mide, cómo se llama— y nada más.

    Existió mucho tiempo al revés: el JSON guardaba también el contrato, así que
    el mismo hecho estaba escrito dos veces y podían discrepar. Se rompía de tres
    maneras distintas, todas con el mismo síntoma («está libre y el sistema dice
    que está ocupado»), porque el plano no le escribe a la base y el parche del
    navegador se puede perder. Con una sola verdad no hay nada que sincronizar.

    **Un espacio sin fila es libre.** No hace falta pre-crear nada: la fila
    aparece cuando se vende. Por eso la respuesta sólo trae lo que tiene algo que
    decir, y todo lo que no está es libre.

    **Cuál contrato manda.** El que corre hoy; si no hay, el que ya está firmado
    y todavía no arranca —eso es «comprometido», no «libre», y venderlo encima
    sería venderlo dos veces—. Un vencido no manda: es historia.

    La plata no sale para un mercaderista, como en todas partes.
    """
    # Los vencidos se cierran al leer: así el mapa nunca muestra como ocupado
    # algo que la base ya considera libre.
    expire_leases(db)

    q = db.query(Space).options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
    if sede:
        q = q.filter(Space.sede == sede.strip().upper())

    admin = role == "admin"
    # Las reservas vivas de una cara entera o de una parte (§8 de
    # docs/rediseno/vender-api.md): la cara sale TOMADA en sus fechas, como con
    # un contrato. Por espacio, la que corre hoy o, si no, la próxima.
    dia = hoy()
    reservas: dict[int, ReservaDeEspacio] = {}
    for r in (db.query(ReservaDeEspacio)
              .filter(ReservaDeEspacio.estado == "viva", ReservaDeEspacio.caduca >= dia,
                      ReservaDeEspacio.hasta >= dia)
              .order_by(ReservaDeEspacio.desde, ReservaDeEspacio.id).all()):
        reservas.setdefault(r.space_id, r)
    salida: dict[str, EstadoComercial] = {}
    for space in q.all():
        lease = space.active_lease or space.upcoming_lease
        reserva = reservas.get(space.id)
        if lease is None and reserva is not None:
            # Tomada. Quién, hasta cuándo y por cuánto, sólo para quien
            # administra: delante del proveedor (Vender) y del trabajador una
            # cara reservada se ve tomada, sin decir que es una reserva.
            salida[(space.code or "").strip().upper()] = EstadoComercial(
                status="occupied",
                supplierName=(reserva.supplier.name if reserva.supplier else "") if admin else "",
                brandCategory=(reserva.marca or "") if admin else "",
                negotiatedValue=float(reserva.valor or 0) if admin else 0,
                startDate=reserva.desde.isoformat() if admin else "",
                endDate=reserva.hasta.isoformat() if admin else "",
                observation=(reserva.notas or "") if admin else "",
                reservaHasta=reserva.caduca.isoformat() if admin else None,
            )
            continue
        if lease is None:
            # Sin contrato vivo no se dice nada… salvo que el espacio esté
            # retirado a mano: «reservado» o «en mantenimiento» no es plata pero
            # tampoco es libre, y también vive acá, no en el plano. Es lo que
            # pone el panel de espacios con `PATCH /spaces/{id}/status`.
            propio = getattr(space.status, "value", space.status) or "free"
            if propio not in ("free", "occupied"):
                salida[(space.code or "").strip().upper()] = EstadoComercial(
                    status=propio,
                    observation=(space.notes or "") if admin else "",
                )
            continue
        salida[(space.code or "").strip().upper()] = EstadoComercial(
            status="occupied",
            supplierName=lease.supplier.name if lease.supplier else "",
            brandCategory=lease.marca or "",
            negotiatedValue=(lease.monthly_rent or 0) if admin else 0,
            startDate=lease.start_date.isoformat(),
            endDate=lease.end_date.isoformat(),
            # La nota del contrato es TEXTO LIBRE, y ahí es donde alguien
            # escribe «descuento del 25% cerrado por teléfono». Redactar sólo
            # el número y dejar pasar la nota es dejar la puerta de al lado
            # abierta: la plata se fuga igual, escrita en castellano.
            observation=(lease.notes or "") if admin else "",
        )
    return salida


@router.post("/find-or-create", response_model=SpaceOut, status_code=200, dependencies=[Depends(require_admin)])
def find_or_create_space(payload: SpaceFindOrCreate, db: Session = Depends(get_db)):
    """Return the existing Space whose code matches, or create a new one on the fly.

    Used when fixtures are assigned in the 2D/3D editors without a pre-seeded Space record.
    The generated svg_id is prefixed with "fix-" to avoid conflicts with the seeded SVG IDs.

    **Sin distinguir mayúsculas** (fase 2 · I5): comparaba y guardaba el código
    tal cual, así que ``nave-imp-05`` creaba una segunda fila junto a
    ``NAVE-IMP-05`` —el mismo espacio, dos veces— y la renumeración reventaba
    al mandar las dos al mismo destino. Ahora busca primero el código exacto,
    después el mismo en mayúsculas y sin espacios a los costados, y crea en
    esa forma (la de ``normalizar``, la que arma el plano).
    """
    def buscar(filtro):
        return (
            db.query(Space)
            .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
            .filter(filtro)
            .order_by(Space.id)
            .first()
        )

    codigo = (payload.code or "").strip().upper()
    space = buscar(Space.code == payload.code) or buscar(func.upper(func.trim(Space.code)) == codigo)
    if space:
        return space

    space = Space(
        code=codigo,
        svg_id=f"fix-{codigo}",
        name=payload.name or payload.code,
        zone=payload.zone or "Sin zona",
        sede=payload.sede,
        area_m2=payload.area_m2 or 4.0,
        status=SpaceStatus.free,
    )
    db.add(space)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent insert (race condition): roll back and fetch the winner's row.
        db.rollback()
        return buscar(Space.code == codigo)

    # Re-query to load relationships (needed for SpaceOut serialization)
    return buscar(Space.code == codigo)


@router.post("/", response_model=SpaceOut, status_code=201, dependencies=[Depends(require_admin)])
def create_space(payload: SpaceCreate, db: Session = Depends(get_db)):
    existing = db.query(Space).filter(Space.svg_id == payload.svg_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe un espacio con ese svg_id")
    space = Space(**payload.model_dump(), status=SpaceStatus.free)
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


@router.get("/", response_model=list[SpaceOut])
def list_spaces(role: str = Depends(require_auth), db: Session = Depends(get_db)):
    spaces = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).order_by(Space.zone, Space.code).all()
    return [_space_out_for_role(space, role) for space in spaces]


class FaceImageOut(BaseModel):
    code: str
    file_id: int


# Route-order gotcha: this literal path MUST be declared ABOVE "/{space_id}".
# Starlette matches routes in registration order, so the catch-all would
# otherwise swallow "/spaces/face-images" (422 "space_id must be int").
@router.get("/face-images", response_model=list[FaceImageOut])
def list_face_images(db: Session = Depends(get_db)):
    """The DESIGNATED face image per space: [{code, file_id}] for every space
    with one.

    Fase 3 / fix H8-B2: this used to be "the most recent image per space" — a
    window function ranking by ``uploaded_at``. That heuristic could not tell
    a gondola photo from a contract scanned as JPG: if the contract was the
    only image (or the newest one), it became the "face" and got painted as
    the 3D texture for every viewer, admin and worker alike. The face is now
    an explicit designation (``uso=cara`` on upload, see
    ``routers/files.py::upload_space_file``), stored in ``models.SpaceFace`` —
    the SAME table ``routers/files.py`` reads for the worker's per-file gate,
    so the 3D texture and what the worker is allowed to download can never
    disagree.

    A space with no designation simply does not appear here — fail closed on
    purpose: a legacy space (uploaded before this fix) loses its 3D texture
    until an admin re-designates a face. Documented in
    ``docs/ESTADO.md``/``features/compliance/outputs/hardening.md``.

    Only metadata columns are selected, so the LargeBinary ``data`` column is
    never loaded.
    """
    rows = (
        db.query(Space.code, SpaceFace.file_id)
        .join(SpaceFace, SpaceFace.space_id == Space.id)
        .all()
    )
    return [FaceImageOut(code=code, file_id=file_id) for code, file_id in rows]


@router.get("/{space_id}", response_model=SpaceOut)
def get_space(space_id: int, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    space = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return _space_out_for_role(space, role)


@router.get("/by-svg/{svg_id}", response_model=SpaceOut)
def get_space_by_svg(svg_id: str, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    space = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).filter(Space.svg_id == svg_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return _space_out_for_role(space, role)


@router.get("/by-code/{code}", response_model=SpaceOut)
def get_space_by_code(code: str, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    space = db.query(Space).options(
        joinedload(Space.leases).joinedload(SpaceLease.supplier)
    ).filter(Space.code == code).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return _space_out_for_role(space, role)


@router.patch("/{space_id}/status", response_model=SpaceOut)
def update_status(
    space_id: int,
    payload: SpaceStatusUpdate,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    # «Reservado» a mano sobre una participación serían dos nociones de reserva
    # sobre lo mismo (la provisional de Distribución tiene caducidad y cuenta
    # en la capacidad de la cara; ésta no). Su estado lo llevan sus términos.
    if es_participacion(partir_codigo(space.code).parte):
        raise HTTPException(
            status_code=409,
            detail="Una participación no se marca a mano: su reserva provisional se carga en Distribución.",
        )
    antes = space.status.value if space.status else "—"
    space.status = payload.status
    if payload.notes is not None:
        space.notes = payload.notes
    anotar(
        db, request, rol, "espacio.estado",
        entidad="espacio", entidad_id=space.code,
        detalle=f"{antes} → {payload.status.value}",
    )
    db.commit()
    db.refresh(space)
    return space


@router.post("/{space_id}/leases", response_model=LeaseOut, status_code=201)
def create_lease(
    space_id: int,
    payload: LeaseCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    # Date sanity check. Equal dates are VALID: a one-day rental is a real
    # product here — Black Friday is a single Friday — and rejecting it made
    # the shortest, best-paid periods impossible to record. Everything else in
    # this file treats ranges as inclusive on both ends, so this must too.
    if payload.start_date > payload.end_date:
        raise HTTPException(
            status_code=422,
            detail="La fecha de inicio no puede ser posterior a la de fin",
        )

    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    # La nevera entera y su puerta 2 son dos filas de `spaces`: sin candado,
    # dos sesiones que venden a la vez pasan las dos la revisión de abajo
    # (`services/candado.py`). Va antes de revisar, y se suelta en el commit.
    codigo_del_candado = space.code
    tomar_candados(db, [codigo_del_candado])
    # Lectura fresca después del candado (regla dura de participaciones): la
    # sesión ya tiene `space` en memoria, y SQLAlchemy no refresca un objeto
    # que vuelve a consultar. Sin esto, lo que otra sesión escribió mientras se
    # esperaba el candado (una reserva de participación que subió, una puerta
    # vendida) se leería viejo en la revisión de abajo.
    db.expire_all()
    # El candado es del CÓDIGO: si mientras se esperaba un renombre de sede o una
    # renumeración le cambió el código a la fila, este candado ya no serializa con
    # quien venda el código nuevo, y los dos pasarían la revisión (fase 2).
    if (space.code or "").strip().upper() != (codigo_del_candado or "").strip().upper():
        raise HTTPException(
            status_code=409,
            detail=(f"«{codigo_del_candado}» cambió de código mientras se guardaba (ahora es «{space.code}»): "
                    "recargá y volvé a intentar."),
        )

    # The UI hides the contract form for infrastructure, but the rule belongs
    # here too: a stale tab or a direct API call must not create a lease on a
    # fixture the user marked as not for rent.
    #
    # Un texto por motivo (2026-10-14): todo lo que no era la cara B salía como
    # «cambiá su destino a Comercializable», que es imposible para una caja y
    # no dice nada de una puerta que no existe.
    motivo = por_que_no_se_vende(db, space.code)
    if motivo and motivo[0] == SIN_CARA_B:
        # El plano no la ofrece: venderla dejaba un contrato que Supervisar
        # daba enseguida por «Contrato sin mueble».
        raise HTTPException(
            status_code=409,
            detail=(
                f"«{space.code}» no existe: ese mueble tiene una sola cara, "
                "no hay cara B que vender."
            ),
        )
    if motivo and motivo[0] == NO_COMERCIALIZABLE:
        mueble = find_fixture_by_space_code(db, space.code) or {}
        tipo = str(mueble.get("type") or "")
        if tipo in NUNCA_ALQUILABLE:
            detalle = (
                f"«{space.code}» es operación de la tienda (una caja, una columna o el servicio "
                "al cliente): nunca se alquila."
            )
            # La caja y la columna no se venden, pero sus piezas sí (la bahía
            # de impulso, el forro): se dice cómo se ponen a la venta.
            piezas = como_se_venden_sus_piezas(mueble)
            if piezas:
                detalle = f"{detalle} {piezas}"
        else:
            detalle = (
                f"«{space.code}» está marcado como no comercializable. "
                "Cambiá su destino a «Comercializable» en el plano para poder asignarle un contrato."
            )
        raise HTTPException(status_code=409, detail=detalle)
    if motivo:
        # Una parte que el plano no ofrece: la frase de la compuerta dice qué hacer.
        # También la cara entera de una cara que se vende por participación, y
        # una participación de una cara que no se vende así.
        raise HTTPException(status_code=409, detail=motivo[1])
    # Una participación (`…-PC3`) de una cara que sí se vende así EXISTE (la
    # compuerta la deja pasar), pero no se escribe por acá: su contrato lleva
    # el porcentaje, la capacidad de la cara y la distribución, que viven en
    # Distribución (`/api/participaciones`). Un contrato suelto sobre ella
    # sería un lease sin término, que cuenta como la cara entera.
    if es_participacion(partir_codigo(space.code).parte):
        raise HTTPException(
            status_code=409,
            detail=(
                f"«{space.code}» es una participación: se carga y se renueva en el Editor 3D → "
                "Distribución."
            ),
        )
    # Un mueble que se vende por partes se reconoce por su código COMPLETO: la
    # regla «entera o por partes, nunca las dos» compara códigos, y una puerta
    # guardada como `NEV-03-PU2` (sin sede) o ` NAVE-NEV-03-PU2` (con un
    # espacio) no la veía la nevera entera, ni la guarda de `PUT /layout`.
    # La planilla y Vender ya lo arman así (`PlanoIndexado.resolver`).
    canonico = forma_canonica(db, space.sede or "", space.code)
    if canonico is not None and space.code != canonico:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Escribilo «{canonico}», con la sede y sin espacios: un mueble que se vende "
                "por partes se reconoce por su código completo, y así nunca se vende entero "
                "y por partes a la vez."
            ),
        )

    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Reject if an active lease already overlaps the requested period: on this
    # space, and —vender por partes— on what it shares the fixture with (the
    # whole fridge for a door, its doors for the whole fridge).
    choques = contratos_que_chocan(db, space.code, payload.start_date, payload.end_date, space_id=space.id,
                                   sede=space.sede)
    if choques:
        overlapping, otro_space, _ = choques[0]
        if otro_space.id == space.id and getattr(overlapping, "es_reserva", False):
            # Una reserva viva del espacio (§8 de docs/rediseno/vender-api.md).
            detalle = frase_de_choque(space.code, space.code, overlapping)
        elif otro_space.id == space.id:
            detalle = (
                f"El espacio ya tiene un contrato activo del {overlapping.start_date}"
                f" al {overlapping.end_date}. Cancelalo primero o ajustá las fechas."
            )
        else:
            detalle = frase_de_choque(space.code, otro_space.code or "", overlapping)
        raise HTTPException(status_code=409, detail=detalle)
    # Defensa en profundidad: la cara entera (o una división física suya) de
    # una cara que tiene reservas o contratos de participación que cuentan en
    # esas fechas. La compuerta ya frena la de una cara POR participación; esto
    # cubre la que dejó de serlo con términos vivos (un plano escrito a mano).
    # `forma_canonica` ya exigió el código completo: la misma clave de candado
    # que las participaciones de esa cara.
    bloqueo = bloqueo_por_participaciones(
        db, space.sede or "", space.code, payload.start_date, payload.end_date,
    )
    if bloqueo:
        raise HTTPException(status_code=409, detail=bloqueo)

    lease = SpaceLease(space_id=space_id, **payload.model_dump())
    db.add(lease)
    # Only a contract that is already running makes the space occupied. Signing
    # in August for December used to flip the space to "occupied" on the spot,
    # which hid four sellable months behind a status that was simply wrong.
    if payload.start_date <= hoy():
        space.status = SpaceStatus.occupied
    # `flush` asigna el id sin cerrar la transacción, así que la bitácora puede
    # nombrar el contrato y seguir viajando con el mismo commit.
    db.flush()
    # El aviso de montaje espera la planometría (decisión del dueño,
    # 2026-10-20): sale al cargarla, una vez (`services/montajes_pendientes.py`).
    dejar_pendiente(db, lease)
    anotar(
        db, request, rol, "contrato.alta",
        entidad="contrato", entidad_id=lease.id,
        detalle=f"{space.code} · {supplier.name} · {payload.start_date}→{payload.end_date}",
    )
    db.commit()
    db.refresh(lease)

    # ── Avisos, uno por rol ───────────────────────────────────────────────────
    # Antes salía UN correo con el valor negociado a una lista global, así que
    # el mercaderista que va a montar el espacio recibía el precio. Toda la app
    # está construida para que un worker nunca vea plata; el correo se saltaba
    # esa regla. Ahora cada rol recibe lo que le corresponde.
    #
    # Inclusive en ambos extremos, como el resto del archivo: un contrato que
    # empieza y termina el mismo día dura un día, no cero.
    duration_days = (lease.end_date - lease.start_date).days + 1
    who = recipients_for(db, space.sede)
    periodo = f"{lease.start_date} → {lease.end_date}"
    # Si es una parte (`NEV-03-PU2`), cuál, contada desde dónde: va en los tres
    # correos. Se calcula acá, con la sesión abierta.
    parte = partir_codigo(space.code).parte
    fila_parte = None
    if parte is not None:
        mueble = find_fixture_by_space_code(db, space.code) or {}
        fila_parte = ("Parte", texto_para_montar(parte, cantidad_de(mueble, parte.clase)))

    # Lo que se va a intentar mandar, para devolvérselo a la pantalla. Antes la
    # confirmación afirmaba «Ya salieron los avisos» pase lo que pase: sin SMTP
    # configurado y sin contactos cargados decía exactamente lo mismo.
    listo = correo_configurado()
    avisos = AvisosContrato(
        smtp_listo=listo,
        comercial=who["comercial"] if listo else [],
        montaje=[],
        proveedor=[supplier.email] if (listo and supplier.email) else [],
        montaje_pendiente=[lease.id],
    )

    # Comercial: gerente operacional + administrador de la sede.
    if who["comercial"]:
        subject = f"Nuevo contrato — {space.code}"
        rows = [
            ("Sede", space.sede or "—"),
            ("Espacio", f"{space.code} — {space.name}"),
            ("Proveedor", supplier.name),
            ("Marca", lease.marca or "—"),
            ("Periodo", periodo),
            ("Duración", f"{duration_days} día{'s' if duration_days != 1 else ''}"),
            (ETIQUETA_DEL_VALOR, valor_de_lease(db, lease)),
        ]
        if fila_parte:
            rows.insert(2, fila_parte)
        background_tasks.add_task(
            send_mail_to_bg, who["comercial"], subject, html_shell(subject, rows)
        )

    # Montaje: la orden de trabajo para el mercaderista (SIN valores) ya no sale
    # acá. Espera a que el contrato tenga su planometría y sale entonces, una
    # vez, por el mismo correo que la planilla (`routers/montajes.py` →
    # `bulk_leases._avisar`, que dice también dónde queda).

    # Proveedor: constancia de lo acordado. Es el único que sale de la empresa,
    # así que solo se envía si el proveedor tiene correo cargado.
    if supplier.email:
        subject = f"Confirmación de espacio — {space.sede or ''} {space.code}".strip()
        rows = [
            ("Espacio", f"{space.code} — {space.name}"),
            ("Sede", space.sede or "—"),
            ("Marca", lease.marca or "—"),
            ("Periodo", periodo),
            (ETIQUETA_DEL_VALOR, valor_de_lease(db, lease)),
        ]
        if fila_parte:
            rows.insert(1, fila_parte)
        footer = "Cualquier ajuste sobre lo acordado, respondé este correo."
        background_tasks.add_task(
            send_mail_to_bg, [supplier.email], subject, html_shell(subject, rows, footer)
        )

    # `avisos` no es una columna: se cuelga del objeto para que Pydantic lo
    # serialice en ESTA respuesta. Al listar contratos no aparece.
    lease.avisos = avisos  # type: ignore[attr-defined]
    return lease


@router.delete("/{space_id}/leases/{lease_id}", status_code=204)
def cancel_lease(
    space_id: int,
    lease_id: int,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lease = db.query(SpaceLease).filter(
        SpaceLease.id == lease_id,
        SpaceLease.space_id == space_id,
    ).first()
    if not lease:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if not lease.is_active:
        raise HTTPException(status_code=409, detail="El contrato ya estaba cancelado")

    lease.is_active = False

    # Only mark the space free when no other active lease remains
    remaining = (
        db.query(SpaceLease)
        .filter(
            SpaceLease.space_id == space_id,
            SpaceLease.is_active == True,  # noqa: E712
            SpaceLease.id != lease_id,
        )
        .count()
    )
    space = db.query(Space).filter(Space.id == space_id).first()
    if space and remaining == 0:
        space.status = SpaceStatus.free

    anotar(
        db, request, rol, "contrato.baja",
        entidad="contrato", entidad_id=lease.id,
        detalle=f"{space.code if space else space_id} · {lease.marca or '—'}",
    )
    # Si es el contrato de una participación de cara, su término queda
    # «cancelado» (`baja_en`) con su historia; si ya había vencido por fecha,
    # «vencido». Nada para cualquier otro contrato. Misma transacción.
    al_cancelar_contrato(db, lease, actor_de(request, rol))
    db.commit()
