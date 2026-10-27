"""Confirmación de montaje: la prueba de que lo que se cobró se armó.

Es el único punto de la aplicación donde un worker escribe algo, y está
deliberadamente acotado: puede reportar el montaje de un espacio y adjuntar una
foto, nada más. No toca el layout, no toca contratos y no ve valores.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_admin, require_auth, sub_y_email_de_la_sesion
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.models.models import MountConfirmation, Space, SpaceFile
from app.models.vender import RESULTADOS_DE_VERIFICACION, VerificacionDeMontaje
from app.services.bitacora import anotar
from app.services.subidas import leer_con_tope

router = APIRouter(prefix="/mounts", tags=["mounts"], dependencies=[Depends(require_auth)])

MAX_PHOTO = 10 * 1024 * 1024
# Los tres primeros son lo que manda un navegador. HEIC/HEIF es lo que sale de
# un iPhone cuando iOS NO convierte al subir — pasa según versión y según si la
# foto se toma o se elige de la galería. Rechazarlo dejaría al mercaderista sin
# poder reportar desde su propio teléfono, que es peor que guardar un archivo
# que el navegador no previsualiza: el archivo igual queda como prueba y se
# abre desde el celular que lo tomó.
PHOTO_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".heic": "image/heic", ".heif": "image/heif",
}

#: Marca en el nombre del archivo que separa la foto-prueba del montaje de las
#: artes que el proveedor manda para el planograma. Va en el nombre porque la
#: regla del proyecto prohíbe columnas nuevas en tablas existentes.
MOUNT_FILE_PREFIX = "montaje--"

ESTADOS = ("montado", "no_montado")
MOTIVOS = ("sin_material", "sin_producto", "espacio_ocupado", "otro")


class MountOut(BaseModel):
    id: int
    space_code: str
    sede: Optional[str] = None
    estado: str
    motivo: Optional[str] = None
    nota: Optional[str] = None
    file_id: Optional[int] = None
    # Nombre y tipo de la foto. Van acá para que el tablero pueda abrirla sin
    # una segunda llamada: el visor necesita el tipo para saber cómo pintarla,
    # y la prueba no sirve de nada si cuesta trabajo mirarla.
    foto_nombre: Optional[str] = None
    foto_tipo: Optional[str] = None
    reportado_por: Optional[str] = None
    rol: Optional[str] = None
    confirmado_en: Optional[datetime] = None
    # La última verificación del reporte (rediseño UX, 2026-10-26): quien
    # administra miró la foto al lado de la planometría y dijo si coincide.
    # `None` mientras nadie lo verificó. No lleva plata.
    verificacion: Optional[dict] = None

    model_config = {"from_attributes": True}


def _con_foto(conf: MountConfirmation, archivo: Optional[SpaceFile]) -> MountOut:
    salida = MountOut.model_validate(conf)
    if archivo is not None:
        salida.foto_nombre = archivo.filename
        salida.foto_tipo = archivo.content_type
    return salida


@router.get("/", response_model=list[MountOut])
def list_mounts(sede: Optional[str] = None, db: Session = Depends(get_db)):
    """Confirmaciones, la más reciente primero.

    Sin paginar a propósito: son tres tiendas y un puñado de espacios, y el
    cliente necesita el historial completo para saber cuál fue el último
    reporte de cada uno.
    """
    # Lo archivado no sale: pertenece a una sede que ya se borró, y su código
    # puede estar en uso otra vez por una sede recreada con el mismo nombre.
    q = db.query(MountConfirmation).filter(MountConfirmation.archivado_en.is_(None))
    if sede:
        q = q.filter(MountConfirmation.sede == sede.strip().upper())
    filas = q.order_by(
        MountConfirmation.confirmado_en.desc(), MountConfirmation.id.desc()
    ).all()

    # Los datos de las fotos en UNA consulta, sin traer los binarios: son
    # megabytes por fila y acá solo hace falta el nombre y el tipo.
    ids = [f.file_id for f in filas if f.file_id]
    archivos = {}
    if ids:
        archivos = {
            fid: SpaceFile(id=fid, filename=nombre, content_type=tipo)
            for fid, nombre, tipo in db.query(
                SpaceFile.id, SpaceFile.filename, SpaceFile.content_type
            ).filter(SpaceFile.id.in_(ids)).all()
        }
    salida = [_con_foto(f, archivos.get(f.file_id)) for f in filas]
    ultimas = _ultimas_verificaciones(db, [f.id for f in filas])
    for m in salida:
        m.verificacion = ultimas.get(m.id)
    return salida


def _verificacion_out(v: VerificacionDeMontaje) -> dict:
    return {"id": v.id, "resultado": v.resultado, "nota": v.nota, "por": v.verificada_por,
            "en": v.verificada_en.isoformat() if v.verificada_en else None}


def _ultimas_verificaciones(db: Session, ids: list[int]) -> dict[int, dict]:
    """La última verificación de cada reporte, en UNA consulta."""
    if not ids:
        return {}
    fuera: dict[int, dict] = {}
    for v in (db.query(VerificacionDeMontaje).filter(VerificacionDeMontaje.montaje_id.in_(ids))
              .order_by(VerificacionDeMontaje.id.asc()).all()):
        fuera[v.montaje_id] = _verificacion_out(v)
    return fuera


class VerificacionIn(BaseModel):
    model_config = {"extra": "forbid"}
    resultado: str
    nota: Optional[str] = Field(default=None, max_length=2000)
    #: Con «no coincide»: mandarle el aviso de montaje de nuevo a quien monta
    #: (rediseño UX, etapa 7). Su enlace muestra la nota de qué corregir.
    reenviar: bool = False


@router.post("/{montaje_id}/verificar", response_model=MountOut, dependencies=[Depends(require_admin)])
def verificar_montaje(
    montaje_id: int,
    cuerpo: VerificacionIn,
    request: Request,
    background_tasks: BackgroundTasks,
    role: str = Depends(require_auth),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """«Verificar el montaje de un contrato» (rediseño UX): coincide o no
    coincide con la planometría. Sólo administración. «No coincide» pide la
    nota de qué corregir: sin ella, quien monta no sabe qué arreglar. Sólo se
    verifica un reporte de «montado»: el «no se pudo» se resuelve, no se
    verifica."""
    conf = (db.query(MountConfirmation)
            .filter(MountConfirmation.id == montaje_id, MountConfirmation.archivado_en.is_(None)).first())
    if conf is None:
        raise HTTPException(status_code=404, detail="Ese reporte de montaje no existe")
    if conf.estado != "montado":
        raise HTTPException(status_code=409, detail="Sólo se verifica un montaje que se reportó como montado")
    if cuerpo.resultado not in RESULTADOS_DE_VERIFICACION:
        raise HTTPException(status_code=422, detail=f"resultado debe ser uno de {RESULTADOS_DE_VERIFICACION}")
    nota = (cuerpo.nota or "").strip() or None
    if cuerpo.resultado == "no_coincide" and not nota:
        raise HTTPException(status_code=422, detail="Escribí qué hay que corregir: quien monta lo necesita")
    v = VerificacionDeMontaje(montaje_id=conf.id, resultado=cuerpo.resultado, nota=nota,
                              verificada_por=_quien_es(identidad) or role)
    db.add(v)
    anotar(db, request, role, "montaje.verificado", entidad="espacio", entidad_id=conf.space_code,
           detalle=f"{conf.space_code} · {'coincide' if cuerpo.resultado == 'coincide' else 'no coincide'}")
    db.commit()
    db.refresh(v)
    archivo = None
    if conf.file_id:
        fila = db.query(SpaceFile.id, SpaceFile.filename, SpaceFile.content_type).filter(SpaceFile.id == conf.file_id).first()
        if fila:
            archivo = SpaceFile(id=fila[0], filename=fila[1], content_type=fila[2])
    salida = _con_foto(conf, archivo)
    salida.verificacion = _verificacion_out(v)
    if cuerpo.reenviar and cuerpo.resultado == "no_coincide":
        salida.verificacion["aviso_reenviado"] = _reenviar_aviso(db, background_tasks, conf, cliente)
    return salida


def _reenviar_aviso(db: Session, background_tasks: BackgroundTasks, conf: MountConfirmation,
                    cliente: Cliente) -> bool:
    """El correo de montaje del contrato que manda hoy (o el próximo) sobre ese
    espacio, sólo a quien monta. False si no hay contrato o no hay correo."""
    from app.fechas import hoy
    from app.models.models import SpaceLease
    from app.routers.bulk_leases import _avisar
    from app.routers.montajes import fila_para_montar

    space = db.query(Space).filter(Space.code == conf.space_code).first()
    if space is None:
        return False
    lease = (db.query(SpaceLease)
             .filter(SpaceLease.space_id == space.id, SpaceLease.is_active.is_(True),
                     SpaceLease.end_date >= hoy())
             .order_by(SpaceLease.start_date.asc()).first())
    if lease is None:
        return False
    avisos = _avisar(db, background_tasks, space.sede, [fila_para_montar(db, lease)], cliente, roles=("montaje",))
    return bool(avisos and avisos.smtp_listo and avisos.montaje)


async def registrar_montaje(
    db: Session,
    *,
    space_code: str,
    estado: str,
    rol: str,
    sede: Optional[str] = None,
    motivo: Optional[str] = None,
    nota: Optional[str] = None,
    reportado_por: Optional[str] = None,
    foto: Optional[UploadFile] = None,
) -> MountOut:
    """Guarda un reporte de montaje. Sin auth: la decide quien llama.

    Vive afuera del endpoint porque hay dos puertas al mismo acto —el tablero,
    con sesión, y el enlace firmado del correo, sin contraseña— y las reglas de
    qué es un reporte válido tienen que ser una sola. Duplicadas, la que se
    olvide de exigir la foto es justo la que usa quien monta.
    """
    code = (space_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=422, detail="Falta el código del espacio")
    if estado not in ESTADOS:
        raise HTTPException(status_code=422, detail=f"estado debe ser uno de {ESTADOS}")
    if motivo and motivo not in MOTIVOS:
        raise HTTPException(status_code=422, detail=f"motivo debe ser uno de {MOTIVOS}")
    if estado == "no_montado" and not motivo:
        raise HTTPException(
            status_code=422,
            detail="Un espacio sin montar necesita motivo: sirve para saber a quién reclamarle",
        )
    # "Montado" sin foto es una afirmación sin respaldo, y es exactamente lo que
    # el proveedor discute meses después. La regla vive acá y no solo en la
    # pantalla: el endpoint queda abierto a cualquier cliente.
    #
    # Al "no pude" NO se le exige: si el material nunca llegó puede no haber
    # nada que fotografiar, y dejar sin reportar un problema es peor que
    # quedarse sin la foto. El campo sigue disponible para quien quiera
    # mostrar el espacio vacío.
    if estado == "montado" and not (foto is not None and foto.filename):
        raise HTTPException(
            status_code=422,
            detail="La foto del montaje es obligatoria: es la prueba de que la exhibición quedó armada",
        )

    file_id = None
    row = None
    if foto is not None and foto.filename:
        # La extensión es la primera señal, pero no siempre viene: hay cámaras
        # y navegadores que mandan el archivo con un nombre sin punto. Cuando
        # falta, vale el tipo que declara el navegador. Si tampoco es una
        # imagen, ahí sí se rechaza — pero nunca por un nombre raro.
        ext = Path(foto.filename).suffix.lower()
        declarado = (foto.content_type or "").lower().split(";")[0].strip()
        if ext in PHOTO_TYPES:
            content_type = PHOTO_TYPES[ext]
        elif declarado in set(PHOTO_TYPES.values()):
            # Se compara contra la lista de arriba y NO contra "image/*": un
            # SVG es una imagen para el navegador y un documento con scripts
            # para todo lo demás. Guardado como foto y servido inline desde el
            # mismo origen que la aplicación, ejecutaría JavaScript con la
            # sesión del admin que lo abra.
            content_type = declarado
        else:
            raise HTTPException(
                status_code=422,
                detail="El archivo tiene que ser una imagen (JPG, PNG, WEBP o HEIC)",
            )
        # Mismo corte que en `files.py` (hardening-1): se deja de leer apenas
        # se pasa del tope, en vez de bufferizar la foto entera para después
        # rechazarla.
        data = await leer_con_tope(foto, MAX_PHOTO, "La foto supera el límite de 10 MB")

        # La foto se cuelga del Space para que aparezca junto al resto de los
        # archivos del espacio. Si el espacio todavía no existe como fila —
        # solo se crea al guardar un contrato — se crea acá, porque tener la
        # evidencia importa más que el orden en que se cargaron las cosas.
        space = db.query(Space).filter(Space.code == code).first()
        if not space:
            space = Space(
                code=code, svg_id=f"fix-{code}", name=code,
                zone="montaje", sede=(sede or "").strip().upper() or None, area_m2=0.0,
            )
            db.add(space)
            db.flush()
        # El nombre lleva un prefijo reservado, y no es cosmético: la foto se
        # cuelga del mismo Space que las artes del proveedor, y
        # `list_face_images` toma la imagen MÁS RECIENTE de cada espacio para
        # usarla como planograma en el editor 3D. Sin esta marca, la foto del
        # montaje —un anaquel fotografiado de costado, con medio pasillo
        # adentro— reemplazaba la textura de la góndola en la pantalla del
        # comercial, y con la foto obligatoria eso pasaría en cada contrato.
        row = SpaceFile(
            space_id=space.id,
            filename=f"{MOUNT_FILE_PREFIX}{code}--{foto.filename}",
            content_type=content_type,
            size=len(data),
            data=data,
        )
        db.add(row)
        db.flush()
        file_id = row.id

    conf = MountConfirmation(
        space_code=code,
        sede=(sede or "").strip().upper() or None,
        estado=estado,
        motivo=motivo,
        nota=(nota or "").strip() or None,
        file_id=file_id,
        reportado_por=(reportado_por or "").strip() or None,
        rol=rol,
        # Hora del servidor, no del dispositivo.
        confirmado_en=datetime.now(timezone.utc),
    )
    db.add(conf)
    db.commit()
    db.refresh(conf)
    return _con_foto(conf, row)


@router.post("/", response_model=MountOut, status_code=201)
async def confirm_mount(
    space_code: str = Form(...),
    estado: str = Form(...),
    sede: Optional[str] = Form(None),
    motivo: Optional[str] = Form(None),
    nota: Optional[str] = Form(None),
    reportado_por: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(None),
    role: str = Depends(require_auth),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
    db: Session = Depends(get_db),
):
    """Reporta el montaje de un espacio. Abierto a worker: es su trabajo.

    Con sesión de cuenta propia, quién reportó es ESA cuenta, no lo que se
    tecleó (2026-10-02). El campo «Tu nombre» viene de cuando todos entraban
    con la misma clave de trabajador y no había otra forma de saberlo; queda
    sólo para el enlace del correo, que no tiene cuenta detrás.
    """
    return await registrar_montaje(
        db,
        space_code=space_code,
        estado=estado,
        rol=role,
        sede=sede,
        motivo=motivo,
        nota=nota,
        reportado_por=_quien_es(identidad) or reportado_por,
        foto=foto,
    )


def _quien_es(identidad: tuple) -> Optional[str]:
    """El nombre de la cuenta de la sesión (o su correo), o None sin cuenta."""
    sub, email = identidad
    if sub is None:
        return None
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.get(Usuario, sub)
        nombre = (usuario.nombre or "").strip() if usuario else ""
    finally:
        reg.close()
    return nombre or email


@router.get("/files/{file_id}/exists", response_model=dict)
def photo_exists(file_id: int, db: Session = Depends(get_db)):
    """Chequeo barato para la interfaz — no descarga el binario."""
    # Se selecciona SOLO la columna id: eso ya deja el binario fuera del SELECT.
    # El defer() que había acá además reventaba — SQLAlchemy no acepta opciones
    # de carga de atributos sobre una consulta que no trae la entidad — así que
    # este endpoint devolvía 500 en cada llamada.
    found = db.query(SpaceFile.id).filter(SpaceFile.id == file_id).first()
    return {"exists": bool(found)}
