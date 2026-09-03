from datetime import date, datetime, timezone
from urllib.parse import quote
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from app.auth import MONTAJE_TTL_DAYS, create_mount_token, require_admin, require_auth
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.models.models import LeaseCancellation, Space, SpaceFile, SpaceLease, Supplier, SpaceStatus
from app.services.bitacora import anotar
from app.schemas.spaces import (
    SpaceOut, SpaceCreate, SpaceStatusUpdate, LeaseCreate, LeaseOut, SpaceMapItem,
    SpaceFindOrCreate, AvisosContrato, SupplierPublicOut,
)
from app.routers.mounts import MOUNT_FILE_PREFIX
from app.services.contacts import recipients_for
from app.services.layout_lookup import describe_location, find_fixture_by_space_code, is_space_rentable
from app.services.mailer import (
    app_base_url, format_cop, html_shell, send_mail_to_bg, correo_configurado,
)
from app.services.ocupacion import occupancy_range, occupancy_today, rate_type_of, reference_rate_for
from app.routers.layout import reference_rates_raw

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
                # La nota del contrato es donde vive lo que no se anima a
                # entrar en un campo con nombre ("descuento del 25% cerrado
                # por teléfono"): la misma plata que negotiated/monthly_rent
                # esconde, con otra forma. Se decide en el servidor —avisar
                # en el formulario no alcanza, un cliente viejo o una llamada
                # directa a la API la siguen mandando igual.
                lease.notes = None
                # El proveedor anidado va por la misma lista blanca que
                # /api/suppliers/: sólo id y nombre para quien no es admin —
                # su email, teléfono, contacto y notas no viajan.
                lease.supplier = SupplierPublicOut.model_validate(lease.supplier, from_attributes=True)
    return out


# ─── Lease expiry helper ──────────────────────────────────────────────────────

def expire_leases(db: Session) -> int:
    """Mark leases whose end_date has passed as inactive and free their spaces.

    Returns the number of leases expired.
    """
    today = date.today()
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


@router.post("/find-or-create", response_model=SpaceOut, status_code=200, dependencies=[Depends(require_admin)])
def find_or_create_space(payload: SpaceFindOrCreate, db: Session = Depends(get_db)):
    """Return the existing Space whose code matches, or create a new one on the fly.

    Used when fixtures are assigned in the 2D/3D editors without a pre-seeded Space record.
    The generated svg_id is prefixed with "fix-" to avoid conflicts with the seeded SVG IDs.
    """
    space = (
        db.query(Space)
        .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
        .filter(Space.code == payload.code)
        .first()
    )
    if space:
        return space

    space = Space(
        code=payload.code,
        svg_id=f"fix-{payload.code}",
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
        space = (
            db.query(Space)
            .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
            .filter(Space.code == payload.code)
            .first()
        )
        return space

    # Re-query to load relationships (needed for SpaceOut serialization)
    space = (
        db.query(Space)
        .options(joinedload(Space.leases).joinedload(SpaceLease.supplier))
        .filter(Space.code == payload.code)
        .first()
    )
    return space


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
    """Latest image per space: [{code, file_id}] for every space with ≥1 image.

    Single query, no N+1: a window function ranks each space's image files by
    recency (uploaded_at, id as tiebreaker) and the outer join keeps only rank 1.
    Only metadata columns are selected, so the LargeBinary ``data`` column is
    never loaded.
    """
    rn = (
        func.row_number()
        .over(
            partition_by=SpaceFile.space_id,
            order_by=(SpaceFile.uploaded_at.desc(), SpaceFile.id.desc()),
        )
        .label("rn")
    )
    latest_images = (
        db.query(
            SpaceFile.id.label("file_id"),
            SpaceFile.space_id.label("space_id"),
            rn,
        )
        .filter(
            SpaceFile.content_type.like("image/%"),
            # La foto de montaje NO es un planograma. Se guarda contra el mismo
            # espacio pero con un prefijo reservado en el nombre (ver
            # routers/mounts.py); sin excluirla, la última foto del
            # mercaderista se convertía en la textura del mueble en el 3D.
            ~SpaceFile.filename.like(f"{MOUNT_FILE_PREFIX}%"),
        )
        .subquery()
    )
    rows = (
        db.query(Space.code, latest_images.c.file_id)
        .join(latest_images, latest_images.c.space_id == Space.id)
        .filter(latest_images.c.rn == 1)
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


@router.get("/{code}/rates")
def get_space_rates(
    code: str,
    response: Response,
    desde: date | None = None,
    hasta: date | None = None,
    role: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Tarifa de referencia y ocupación de UN espacio, por su código completo.

    ``{code}`` es "SEDE-CODE" en mayúsculas — la cara B de una góndola doble
    lleva el sufijo "-B". La respuesta se arma por LISTA BLANCA: para un rol
    distinto de admin la clave ``reference_rate`` no se agrega al diccionario
    — no viaja en null, no está — porque es plata y acá la exige hasta para
    leer, igual que ``GET /layout/rates``. ``occupancy`` sí es de cualquier
    rol autenticado: son fechas, no dinero.

    Sin ``desde``/``hasta`` contesta el estado de HOY (disponible / contratado
    / vencido / ocupado); con los dos, el estado del período pedido (libre /
    se_libera / tomado) — ninguno de los dos solo no alcanza para pedir la
    otra mitad, así que un solo parámetro puesto es un 422 y no una lectura a
    medias.

    El tipo para la tarifa sale del snapshot del layout (nunca de ``Space``,
    que no tiene columna de tipo de mueble) resuelto vía
    ``find_fixture_by_space_code`` — el mismo helper que ya usa la carga
    masiva y el chequeo de "comercializable" — y normalizado con
    ``rate_type_of`` (espeja ``rateTypeOf`` del cliente: las góndolas legadas
    y la unificada comparten una sola tarifa por cara).
    """
    # Espejo exacto de GET /layout/rates: es plata y ocupación en vivo, nunca
    # una respuesta que el navegador o un proxy intermedio pueda servir de
    # caché mientras el rol o la fecha de la próxima consulta cambian.
    response.headers["Cache-Control"] = "no-store, max-age=0"

    if (desde is None) != (hasta is None):
        raise HTTPException(status_code=422, detail="desde y hasta van juntos")
    if desde is not None and hasta is not None and desde > hasta:
        raise HTTPException(status_code=422, detail="desde no puede ser posterior a hasta")

    code_uc = (code or "").strip().upper()
    fixture = find_fixture_by_space_code(db, code_uc)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    sede = str(fixture.get("sede") or "").strip().upper()
    rate_type = rate_type_of(fixture)

    space = (
        db.query(Space)
        .options(joinedload(Space.leases))
        .filter(Space.code == code_uc)
        .first()
    )

    if desde is not None and hasta is not None:
        occupancy = occupancy_range(space, desde, hasta)
    else:
        occupancy = occupancy_today(space)

    payload = {
        "code": code_uc,
        "sede": sede,
        "type": rate_type,
        "occupancy": occupancy,
    }
    if role == "admin":
        raw_rates = reference_rates_raw(db)
        payload["reference_rate"] = reference_rate_for(raw_rates, sede, rate_type)
    return payload


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

    # The UI hides the contract form for infrastructure, but the rule belongs
    # here too: a stale tab or a direct API call must not create a lease on a
    # fixture the user marked as not for rent.
    if not is_space_rentable(db, space.code):
        raise HTTPException(
            status_code=409,
            detail=(
                f"«{space.code}» está marcado como no comercializable. "
                "Cambiá su destino a «Comercializable» en el plano para poder asignarle un contrato."
            ),
        )

    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Reject if an active lease already overlaps the requested period
    overlapping = (
        db.query(SpaceLease)
        .filter(
            SpaceLease.space_id == space_id,
            SpaceLease.is_active == True,  # noqa: E712
            SpaceLease.start_date <= payload.end_date,
            SpaceLease.end_date >= payload.start_date,
        )
        .first()
    )
    if overlapping:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El espacio ya tiene un contrato activo del {overlapping.start_date}"
                f" al {overlapping.end_date}. Cancelalo primero o ajustá las fechas."
            ),
        )

    lease = SpaceLease(space_id=space_id, **payload.model_dump())
    db.add(lease)
    # Only a contract that is already running makes the space occupied. Signing
    # in August for December used to flip the space to "occupied" on the spot,
    # which hid four sellable months behind a status that was simply wrong.
    if payload.start_date <= date.today():
        space.status = SpaceStatus.occupied
    # `flush` asigna el id sin cerrar la transacción, así que la bitácora puede
    # nombrar el contrato y seguir viajando con el mismo commit.
    db.flush()
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

    # Lo que se va a intentar mandar, para devolvérselo a la pantalla. Antes la
    # confirmación afirmaba «Ya salieron los avisos» pase lo que pase: sin SMTP
    # configurado y sin contactos cargados decía exactamente lo mismo.
    listo = correo_configurado()
    avisos = AvisosContrato(
        smtp_listo=listo,
        comercial=who["comercial"] if listo else [],
        montaje=who["montaje"] if listo else [],
        proveedor=[supplier.email] if (listo and supplier.email) else [],
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
            ("Valor mensual", format_cop(lease.monthly_rent)),
        ]
        background_tasks.add_task(
            send_mail_to_bg, who["comercial"], subject, html_shell(subject, rows)
        )

    # Montaje: orden de trabajo para el mercaderista. SIN valores.
    if who["montaje"]:
        subject = f"Montar {space.code} — {space.sede or 'sede'}"
        # Dónde queda, en palabras. Se calcula ACÁ y no dentro del
        # BackgroundTask: la tarea corre después de que la sesión de la request
        # se cerró y no abre una propia. El plano dibujado vive del otro lado
        # del enlace — Gmail descarta el SVG embebido, así que un mapa dentro
        # del correo llegaría como un hueco.
        ubicacion = describe_location(db, space.code, space.sede or "")
        rows = [
            ("Sede", space.sede or "—"),
            ("Espacio", f"{space.code} — {space.name}"),
            ("Qué va", f"{supplier.name}{f' · {lease.marca}' if lease.marca else ''}"),
            ("Desde", str(lease.start_date)),
            ("Hasta", str(lease.end_date)),
        ]
        if ubicacion:
            rows.insert(2, ("Dónde queda", ubicacion))
        # Enlace directo al espacio, FIRMADO. El token va en el enlace y no hay
        # contraseña de por medio: quien monta abre el correo, toca y está
        # adentro de la pantalla de ese espacio y de ningún otro.
        #
        # Antes el enlace era pelado y del otro lado había un login con la
        # contraseña compartida del rol worker. Eso ponía a la mercaderista
        # dentro del tablero —el mapa de la sede entera, la tabla con el
        # proveedor y el período de cada espacio— para responder una sola
        # pregunta, y dejaba una contraseña compartida circulando por correo
        # que sobrevive a la persona que deja de trabajar ahí.
        # El enlace lleva el cliente adentro del token. Sin eso, el enlace de
        # un supermercado abriría la pantalla de montaje contra la base de otro.
        token = create_mount_token(space.code, cliente.slug)
        link = f"{app_base_url()}/?montar={quote(space.code)}&t={quote(token)}"
        footer = (
            "El enlace abre el espacio señalado en el plano, y ahí mismo se "
            "confirma el montaje — sin contraseña. "
            "<strong>La foto es obligatoria</strong>: es la prueba de que la "
            "exhibición quedó armada.<br><br>"
            f'<a href="{link}" '
            'style="color:#0369A1;font-weight:600;">Ver dónde queda y confirmar</a>'
            f'<br><br><span style="color:#94A3B8;font-size:12px;">'
            f"El enlace es personal y vence en {MONTAJE_TTL_DAYS} días.</span>"
        )
        background_tasks.add_task(
            send_mail_to_bg, who["montaje"], subject, html_shell(subject, rows, footer)
        )

    # Proveedor: constancia de lo acordado. Es el único que sale de la empresa,
    # así que solo se envía si el proveedor tiene correo cargado.
    if supplier.email:
        subject = f"Confirmación de espacio — {space.sede or ''} {space.code}".strip()
        rows = [
            ("Espacio", f"{space.code} — {space.name}"),
            ("Sede", space.sede or "—"),
            ("Marca", lease.marca or "—"),
            ("Periodo", periodo),
            ("Valor mensual", format_cop(lease.monthly_rent)),
        ]
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
    # Cuándo se canceló, no sólo que se canceló: `is_active=False` por sí solo
    # no distingue "corrió hasta el final y venció" de "lo bajaron a mitad de
    # camino" — y sin esa fecha, ocupacion.py no tiene de dónde prorratear lo
    # YA devengado. Misma transacción que el soft-delete: si el commit de
    # abajo no llega a pasar, tampoco debe quedar esta fila suelta.
    db.add(LeaseCancellation(lease_id=lease.id, cancelled_at=datetime.now(timezone.utc)))

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
    db.commit()
