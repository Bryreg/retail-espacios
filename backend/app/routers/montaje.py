"""La pantalla de la mercaderista: un espacio, sin contraseña.

Antes entraba con la contraseña compartida del rol ``worker`` y aterrizaba en
el tablero: desde ahí veía el mapa de la sede completa y la tabla con el
proveedor, el período y el estado de todos los espacios. Nada de eso le hace
falta para armar una exhibición, y la contraseña compartida sobrevive a la
persona que deja de trabajar ahí.

Ahora el correo lleva un enlace firmado —un JWT de rol ``montaje``, acotado a
ESE espacio y con vencimiento— y este router es **todo** lo que ese token
alcanza. ``require_auth`` lo rechaza en el resto de la aplicación, así que un
endpoint que alguien agregue mañana nace cerrado para él sin tener que
acordarse de este archivo.

Tres cosas necesita esa pantalla y tres cosas hay acá: qué montar y dónde
queda, cómo debe quedar armado, y el botón para reportarlo.
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.auth import Quien, require_montaje
from app.database import get_db
from app.models.models import LayoutSnapshot, LeaseFile, MountConfirmation, Space, SpaceFile
from app.routers.mounts import MountOut, registrar_montaje
from app.services.contratos import contrato_para_montar
from app.services.layout_lookup import describe_location

router = APIRouter(prefix="/montaje", tags=["montaje"], dependencies=[Depends(require_montaje)])

KIND_PLANOMETRIA = "planometria"

#: Lo único que se manda de los muebles VECINOS: dónde están y qué son, para
#: dibujar el plano que dice «queda acá». Nada de quién lo alquiló, por cuánto
#: ni hasta cuándo. Es una lista blanca y no una negra a propósito: un campo
#: comercial que se agregue mañana al layout no se filtra por olvido.
_GEOMETRIA = {
    "id", "code", "nomenclatura", "type", "gondolaType", "label",
    "cx", "cz", "rotY", "w", "d", "h", "color", "sede", "rentable",
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class EspacioMontaje(BaseModel):
    """Todo lo que la pantalla muestra, en una sola llamada.

    Una sola llamada y no cuatro porque cada endpoint abierto a este token es
    una superficie más que revisar; y porque del otro lado hay un celular con
    señal de supermercado, donde cuatro viajes son cuatro oportunidades de
    quedarse a mitad de camino.
    """
    #: ``SEDE-CODIGO``, el mismo que viaja en el enlace y el que se reporta.
    code: str
    #: Lo que se le muestra: ``PUN-01``, no ``NAVE-PUN-01``.
    corto: str
    sede: str
    #: El código del MUEBLE en el plano, sin el sufijo de cara: la cara B se
    #: reporta como ``PUN-01-B`` pero en el plano hay un solo mueble.
    fixture_code: str
    label: str = ""
    nomenclatura: Optional[str] = None
    proveedor: str = ""
    marca: str = ""
    desde: Optional[str] = None
    hasta: Optional[str] = None
    #: "A unos 4 m de las cajas". La misma frase que ya iba en el correo.
    donde: Optional[str] = None
    #: Los muebles de la sede, sólo geometría, para dibujar el plano.
    vecinos: list[dict] = []
    #: Hay planometría cargada para el contrato que manda hoy sobre el espacio.
    tiene_planometria: bool = False
    planometria_tipo: Optional[str] = None
    #: El último reporte de este espacio, si ya hubo alguno.
    ultimo: Optional[MountOut] = None
    #: Cuándo se vence el enlace. La pantalla avisa antes de que pase.
    vence: Optional[datetime] = None


# ─── Resolución ───────────────────────────────────────────────────────────────

def _codigo(quien: Quien, code: Optional[str]) -> str:
    """El espacio sobre el que se está pidiendo.

    Con un token de montaje sale del token y no del pedido: si viniera del
    pedido, cambiar el parámetro en la barra de direcciones abriría cualquier
    otro espacio con el mismo enlace. Un admin sí puede nombrarlo —ya ve todo—
    y así esta pantalla se puede revisar desde el tablero.
    """
    if quien.es_montaje:
        return quien.code or ""
    pedido = (code or "").strip().upper()
    if not pedido:
        raise HTTPException(status_code=422, detail="Falta el código del espacio")
    return pedido


def _base(code: str) -> str:
    """El código del espacio sin el sufijo de cara."""
    return code[:-2] if code.endswith("-B") else code


def _fixtures(db: Session, sede: str) -> list[dict]:
    target = (sede or "").strip().upper()
    for snap in db.query(LayoutSnapshot).all():
        if (snap.sede or "").strip().upper() != target:
            continue
        try:
            crudos = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            return []
        return [f for f in crudos if isinstance(f, dict)]
    return []


def _solo_geometria(fixture: dict) -> dict:
    return {k: v for k, v in fixture.items() if k in _GEOMETRIA}


def _sede_de(code: str, db: Session) -> str:
    """La sede a la que pertenece el espacio.

    Sale del prefijo del código, que es como se arma en toda la aplicación, y
    se confirma contra las sedes que existen: un código como ``NAVE-PUN-01``
    tiene sede ``NAVE``, pero uno viejo sin prefijo no tiene ninguna y sacarle
    el primer tramo a ciegas devolvería ``PUN``.
    """
    sedes = {(s.sede or "").strip().upper() for s in db.query(LayoutSnapshot.sede).all()}
    partes = code.split("-")
    for corte in range(len(partes) - 1, 0, -1):
        candidata = "-".join(partes[:corte])
        if candidata in sedes:
            return candidata
    return ""


def _planometria(db: Session, space: Optional[Space]) -> Optional[LeaseFile]:
    """La planometría del contrato que manda hoy sobre ese espacio."""
    if space is None:
        return None
    lease = contrato_para_montar(space)
    if lease is None:
        return None
    return (
        db.query(LeaseFile)
        .options(defer(LeaseFile.data))
        .filter(LeaseFile.lease_id == lease.id, LeaseFile.kind == KIND_PLANOMETRIA)
        .order_by(LeaseFile.id.desc())
        .first()
    )


def _espacio(db: Session, code: str) -> Optional[Space]:
    return db.query(Space).filter(func.upper(func.trim(Space.code)) == code).first()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/mi-espacio", response_model=EspacioMontaje)
def mi_espacio(
    response: Response,
    quien: Quien = Depends(require_montaje),
    code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Qué hay que montar, dónde queda y si ya se reportó."""
    # El enlace se abre, se cierra y se vuelve a abrir con la exhibición ya
    # armada. Una respuesta cacheada diría "pendiente" después de reportar.
    response.headers["Cache-Control"] = "no-store, max-age=0"

    codigo = _codigo(quien, code)
    if not codigo:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    sede = _sede_de(codigo, db)
    base = _base(codigo)
    fixtures = _fixtures(db, sede)

    # El mueble del plano. Se busca por el código corto y por el completo: el
    # editor 3D genera códigos con la sede adentro y el 2D no siempre.
    mueble: dict = {}
    for f in fixtures:
        raw = str(f.get("code") or "").strip().upper()
        if not raw:
            continue
        propia = str(f.get("sede") or sede or "").strip().upper()
        completo = raw if (propia and raw.startswith(f"{propia}-")) else f"{propia}-{raw}" if propia else raw
        if base in (completo, raw):
            mueble = f
            break

    space = _espacio(db, codigo)
    lease = contrato_para_montar(space) if space else None
    plano = _planometria(db, space)

    ultimo = (
        db.query(MountConfirmation)
        .filter(
            MountConfirmation.space_code == codigo,
            MountConfirmation.archivado_en.is_(None),
        )
        .order_by(MountConfirmation.confirmado_en.desc(), MountConfirmation.id.desc())
        .first()
    )
    ultimo_out = None
    if ultimo is not None:
        ultimo_out = MountOut.model_validate(ultimo)
        if ultimo.file_id:
            datos = (
                db.query(SpaceFile.filename, SpaceFile.content_type)
                .filter(SpaceFile.id == ultimo.file_id)
                .first()
            )
            if datos:
                ultimo_out.foto_nombre, ultimo_out.foto_tipo = datos

    corto = str(mueble.get("code") or "") or (base[len(sede) + 1:] if sede and base.startswith(f"{sede}-") else base)
    if codigo.endswith("-B"):
        corto = f"{corto}-B"

    return EspacioMontaje(
        code=codigo,
        corto=corto,
        sede=sede or (space.sede if space else "") or "",
        fixture_code=str(mueble.get("code") or ""),
        label=str(mueble.get("label") or "") or (space.name if space else ""),
        nomenclatura=mueble.get("nomenclatura"),
        proveedor=(lease.supplier.name if lease and lease.supplier else ""),
        marca=(lease.marca if lease else "") or "",
        desde=str(lease.start_date) if lease else None,
        hasta=str(lease.end_date) if lease else None,
        donde=describe_location(db, codigo, sede) if sede else None,
        vecinos=[_solo_geometria(f) for f in fixtures],
        tiene_planometria=plano is not None,
        planometria_tipo=plano.content_type if plano else None,
        ultimo=ultimo_out,
        vence=quien.vence,
    )


@router.get("/planometria")
def planometria(
    quien: Quien = Depends(require_montaje),
    code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """El archivo de "así debe quedar", del espacio del propio enlace.

    Se sirve desde acá y no por ``/planometrias/{id}`` para no tener que abrir
    ese endpoint: allá el id es del pedido, así que habría que confiar en una
    comprobación; acá el archivo se resuelve DESDE el token y no hay id que
    cambiar en la barra de direcciones.
    """
    codigo = _codigo(quien, code)
    row = _planometria(db, _espacio(db, codigo))
    if row is None:
        raise HTTPException(status_code=404, detail="Ese espacio no tiene planometría cargada")
    # `_planometria` difiere el binario para el listado; acá sí hace falta.
    completo = db.query(LeaseFile).filter(LeaseFile.id == row.id).first()
    if completo is None:
        raise HTTPException(status_code=404, detail="Ese espacio no tiene planometría cargada")

    nombre = (completo.filename or "planometria").replace('"', "'")
    try:
        nombre.encode("latin-1")
    except UnicodeEncodeError:
        nombre = nombre.encode("latin-1", "replace").decode("latin-1")

    return Response(
        content=completo.data,
        media_type=completo.content_type,
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


@router.post("/reportar", response_model=MountOut, status_code=201)
async def reportar(
    estado: str = Form(...),
    motivo: Optional[str] = Form(None),
    nota: Optional[str] = Form(None),
    reportado_por: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(None),
    space_code: Optional[str] = Form(None),
    quien: Quien = Depends(require_montaje),
    db: Session = Depends(get_db),
):
    """Reporta el montaje del espacio del enlace.

    El código NO se toma del formulario cuando quien reporta es un enlace de
    montaje: sale del token. Un campo del formulario lo elige el cliente, y con
    un enlace repartido por correo eso alcanza para escribir sobre el espacio
    de cualquier otro proveedor.
    """
    codigo = _codigo(quien, space_code)
    if not codigo:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return await registrar_montaje(
        db,
        space_code=codigo,
        estado=estado,
        rol=quien.role,
        sede=_sede_de(codigo, db) or None,
        motivo=motivo,
        nota=nota,
        reportado_por=reportado_por,
        foto=foto,
    )
