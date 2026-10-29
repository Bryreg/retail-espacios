"""Planogramas con destinos: la API (fase 2 de la distribución, 2026-10-24).

Rutas efectivas ``/api/planogramas/…``. No confundir con
``routers/planograms.py``: ése es la PLANOMETRÍA de un contrato (un archivo).

· Leer: cualquier sesión del supermercado (``require_auth``). Un mueble que se
  vende sólo lo lee quien administra (trae contratos); el equipo ve los
  internos, que es lo que monta.
· Escribir (borrador, publicar, descartar, destinos): quien administra, y el
  equipo si la dueña lo habilitó (``quien_publica = "equipo"``) y sólo en
  muebles internos. Cambiar quién publica: sólo administración.
· Los GET reciben sus datos por query, nunca por ruta (el barrido del token de
  montaje los cubre, y un código con ``#`` o ``/`` no rompe la URL).
· La lógica vive en ``services/planogramas.py`` (sin commit). Acá se anota la
  bitácora, se hace commit y DESPUÉS se arma la respuesta.
"""
import json
from datetime import date
from html import escape
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy.orm import Session

from app.auth import create_guia_token, dias_del_enlace_de_guia, require_admin, require_auth
from app.clientes import Cliente, cliente_del_pedido
from app.database import get_db
from app.services import guia as guia_servicio
from app.services import planogramas as servicio
from app.services import supervision_planogramas as supervision
from app.routers.montajes import avisar_los_listos
from app.services import montajes_pendientes
from app.services.contacts import recipients_for
from app.services.mailer import app_base_url, clean_recipients, correo_configurado, html_shell, send_mail_to_bg
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de

router = APIRouter(prefix="/planogramas", tags=["planogramas"])


class _Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CaraIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    fixture_id: str = Field(min_length=1, max_length=200)
    cara: Literal["A", "B"]
    version: StrictInt = Field(ge=0)


class PiezaIn(_Estricto):
    destino_id: StrictInt
    pb: StrictInt = Field(ge=1, le=10000)
    #: None: todavía sin ubicar. La estructura la mira el servicio.
    vertices: Optional[list] = None


class BorradorIn(CaraIn):
    piezas: list[PiezaIn] = Field(default_factory=list)
    #: El autoguardado del navegador: sin bitácora.
    automatico: bool = False


class PublicarIn(CaraIn):
    rige_desde: date
    hasta: Optional[date] = None


class DestinoIn(_Estricto):
    sede: str = Field(min_length=1, max_length=120)
    nombre: str = Field(min_length=1, max_length=120)
    tipo: str
    color: str
    como_se_monta: Optional[str] = Field(default=None, max_length=2000)
    codigo_externo: Optional[str] = Field(default=None, max_length=120)
    en_la_sede: bool = False


class CambioDeDestinoIn(_Estricto):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=120)
    tipo: Optional[str] = None
    color: Optional[str] = None
    como_se_monta: Optional[str] = Field(default=None, max_length=2000)
    codigo_externo: Optional[str] = Field(default=None, max_length=120)
    en_la_sede: Optional[bool] = None


class AjustesIn(_Estricto):
    quien_publica: Literal["admin", "equipo"]


def _bloque(db: Session, sede: str, fixture_id: str, cara: str, rol: str) -> dict:
    c = servicio.resolver(db, sede, fixture_id, cara)
    servicio.exigir_lectura(rol, c)
    return servicio.bloque(db, c, rol)


# ─── Lecturas ─────────────────────────────────────────────────────────────────

@router.get("/cara")
def leer_cara(
    sede: str = Query(..., min_length=1),
    fixture_id: str = Query(..., min_length=1),
    cara: Literal["A", "B"] = "A",
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Todo lo de una cara para planificarla."""
    return _bloque(db, sede, fixture_id, cara, rol)


@router.get("/resumen")
def leer_resumen(
    sede: str = Query(..., min_length=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """El estado del planograma de cada cara de la sede que tiene uno."""
    return {"caras": servicio.resumen(db, sede, rol), "quien_publica": servicio.quien_publica(db),
            "puede_planificar": servicio.puede_planificar(db, rol)}


@router.get("/caras")
def leer_caras(
    sede: str = Query(..., min_length=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Plano › Caras: todas las caras de la sede con el estado de su planograma
    y de su montaje, primero las que piden algo."""
    return {"caras": servicio.caras_de_la_sede(db, sede, rol), "puede_planificar": servicio.puede_planificar(db, rol)}


@router.get("/version")
def leer_version(
    id: int = Query(..., ge=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Una versión publicada con sus piezas («Ver» en Versiones)."""
    return servicio.leer_version(db, id, rol)


@router.get("/destinos")
def leer_destinos(
    sede: str = Query(..., min_length=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Los destinos guardados de la sede, para reusar."""
    return servicio.destinos_de_la_sede(db, sede)


# ─── Escrituras ───────────────────────────────────────────────────────────────

@router.put("/borrador")
def guardar_borrador(
    cuerpo: BorradorIn,
    request: Request,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Guardar el borrador de la cara (con sus problemas marcados: un borrador
    nunca es una instrucción de montaje)."""
    e = {**cuerpo.model_dump(exclude={"piezas"}), "piezas": [p.model_dump() for p in cuerpo.piezas]}
    cara, _pl = servicio.guardar_borrador(db, e, actor_de(request, rol), rol)
    if not cuerpo.automatico:
        anotar(db, request, rol, "planograma.borrador", entidad="planograma", entidad_id=cara.codigo,
               detalle=f"{len(cuerpo.piezas)} pieza(s)")
    db.commit()
    return servicio.bloque(db, cara, rol)


@router.post("/publicar")
def publicar(
    cuerpo: PublicarIn,
    request: Request,
    background_tasks: BackgroundTasks,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
    cliente: Cliente = Depends(cliente_del_pedido),
):
    """El borrador pasa a ser la versión siguiente (409 ``planograma_invalido``
    con los problemas si no se puede). Un planograma publicado cuenta como la
    planometría de los contratos enteros o por partes de esa cara (2026-10-29):
    los que sólo esperaban eso reciben su aviso de montaje."""
    hecho = servicio.publicar(db, cuerpo.model_dump(), actor_de(request, rol), rol)
    anotar(db, request, rol, "planograma.publicado", entidad="planograma", entidad_id=hecho.cara.codigo,
           detalle=hecho.detalle)
    db.commit()
    avisar_los_listos(db, background_tasks, montajes_pendientes.listos_de_la_cara(db, hecho.cara.sede, hecho.cara.codigo),
                      cliente, sede=hecho.cara.sede)
    return {**servicio.bloque(db, hecho.cara, rol), "publicada": hecho.version.numero}


@router.post("/descartar")
def descartar(
    cuerpo: CaraIn,
    request: Request,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Borrar el borrador (las versiones publicadas quedan)."""
    cara, _pl = servicio.descartar_borrador(db, cuerpo.model_dump(), actor_de(request, rol), rol)
    anotar(db, request, rol, "planograma.descartado", entidad="planograma", entidad_id=cara.codigo,
           detalle="Se descartó el borrador")
    db.commit()
    return servicio.bloque(db, cara, rol)


@router.post("/destinos", status_code=201)
def crear_destino(
    cuerpo: DestinoIn,
    request: Request,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    servicio.exigir_que_puede(db, rol)
    d = servicio.crear_destino(db, cuerpo.model_dump(), actor_de(request, rol))
    anotar(db, request, rol, "destino.creado", entidad="destino", entidad_id=d.id,
           detalle=f"{d.nombre} · {servicio.tipo_legible(d.tipo)}")
    db.commit()
    return servicio.destino_out(d)


@router.patch("/destinos/{destino_id}")
def cambiar_destino(
    destino_id: int,
    cuerpo: CambioDeDestinoIn,
    request: Request,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    servicio.exigir_que_puede(db, rol)
    d = servicio.cambiar_destino(db, destino_id, cuerpo.model_dump(exclude_unset=True), actor_de(request, rol))
    anotar(db, request, rol, "destino.cambiado", entidad="destino", entidad_id=d.id, detalle=d.nombre)
    db.commit()
    return servicio.destino_out(d)


@router.put("/ajustes")
def poner_ajustes(
    cuerpo: AjustesIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Quién publica: sólo administración, o también el equipo."""
    servicio.poner_quien_publica(db, cuerpo.quien_publica, actor_de(request, rol))
    anotar(db, request, rol, "planograma.quien_publica", entidad="ajuste", entidad_id="quien_publica",
           detalle="Publica también el equipo" if cuerpo.quien_publica == "equipo" else "Publica sólo administración")
    db.commit()
    return {"quien_publica": cuerpo.quien_publica}


# ─── La guía de montaje (fase 3) ──────────────────────────────────────────────

class GuiaIn(_Estricto):
    version_id: StrictInt = Field(ge=1)


class EnviarGuiaIn(GuiaIn):
    #: A quién: los contactos de la sede que se eligieron y los que se escribieron.
    correos: list[str] = Field(min_length=1, max_length=20)


def _enlace(db: Session, version_id: int, cliente: Cliente) -> tuple[str, int]:
    _nombre, _sede, v, _pl = guia_servicio.titulo(db, version_id)
    dias = dias_del_enlace_de_guia(v.rige_desde, v.hasta)
    token = create_guia_token(v.id, cliente.slug, days=dias)
    return f"{app_base_url()}/?guia={v.id}&t={quote(token)}", dias


@router.post("/guia/enlace")
def enlace_de_la_guia(
    cuerpo: GuiaIn,
    rol: str = Depends(require_auth),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """El enlace sin contraseña de la guía de esa versión («Copiar el
    enlace»). Lo saca quien planifica esa cara."""
    guia_servicio.puede_compartir(db, rol, cuerpo.version_id)
    url, dias = _enlace(db, cuerpo.version_id, cliente)
    return {"url": url, "dias": dias}


@router.get("/guia/destinatarios")
def destinatarios_de_la_guia(
    version: int = Query(..., ge=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """A quién corresponde mandarla: quien monta en la sede (el mercaderista
    de la libreta de contactos) y, para quien administra, la administración de
    la sede. Más los que se escriban a mano."""
    guia_servicio.puede_compartir(db, rol, version)
    _nombre, sede, _v, _pl = guia_servicio.titulo(db, version)
    quienes = recipients_for(db, sede)
    return {"sede": sede, "montaje": quienes["montaje"], "comercial": quienes["comercial"] if rol == "admin" else [],
            "correo_listo": correo_configurado()}


@router.post("/guia/enviar")
def enviar_la_guia(
    cuerpo: EnviarGuiaIn,
    request: Request,
    background_tasks: BackgroundTasks,
    rol: str = Depends(require_auth),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """Manda la guía (su enlace sin contraseña y lo que va dónde, sin precios)
    a quien corresponde. No sale sola al publicar: se elige a quién."""
    guia_servicio.puede_compartir(db, rol, cuerpo.version_id)
    correos = clean_recipients(cuerpo.correos)
    if not correos:
        raise servicio._error(422, "sin_correos", "Escribí al menos un correo válido.")
    if not correo_configurado():
        raise servicio._error(409, "sin_correo", "El correo de RECABRA no está configurado: copiá el enlace y mandalo vos.")
    nombre, _sede, v, _pl = guia_servicio.titulo(db, cuerpo.version_id)
    asunto, html = _correo_de_la_guia(db, cuerpo.version_id, cliente)
    background_tasks.add_task(send_mail_to_bg, correos, asunto, html)
    anotar(db, request, rol, "guia.enviada", entidad="planograma", entidad_id=nombre,
           detalle=f"Versión {v.numero} a {len(correos)} correo(s)")
    db.commit()
    return {"enviados": correos}


def _correo_de_la_guia(db: Session, version_id: int, cliente: Cliente, corregir: Optional[str] = None) -> tuple[str, str]:
    """El asunto y el cuerpo del correo de la guía: el enlace sin contraseña y
    lo que va dónde (con los números de la hoja), sin precios. Con
    ``corregir`` (fase 4), arriba va lo que quien revisó pidió corregir."""
    nombre, sede, v, _pl = guia_servicio.titulo(db, version_id)
    url, _dias = _enlace(db, version_id, cliente)
    datos = guia_servicio.guia(db, version_id)
    asunto = (f"Corregir el montaje · {nombre} · versión {v.numero} — {sede}" if corregir
              else f"Guía de montaje · {nombre} · versión {v.numero} — {sede}")
    vigencia = f"desde el {guia_servicio.fecha_corta(v.rige_desde)}" + (
        f" hasta el {guia_servicio.fecha_corta(v.hasta)}" if v.hasta else "")
    from app.services.reglas_participacion import pct
    rows = ([("Hay que corregir", escape(corregir))] if corregir else []) + [
        ("Mueble", escape(nombre)), ("Versión", f"{v.numero} · rige {escape(vigencia)}")] + [
        (f"{i}", f"{escape(p['nombre'])} · {pct(p['pb'])}") for i, p in enumerate(datos["piezas"], start=1)
    ]
    pie = (f'<a href="{url}" style="color:#0369A1;font-weight:600;">Abrir la guía</a> — se abre sin contraseña, '
           "para imprimir o para seguirla en el teléfono. Al terminar, avisá cómo quedó (la foto no es obligatoria).<br><br>"
           '<span style="color:#94A3B8;font-size:12px;">Si en el mueble hay otra versión impresa, vale ésta. '
           "El enlace es para quien monta: no lo reenvíes.</span>")
    return asunto, html_shell(asunto, rows, pie)


# ─── La supervisión (fase 4, 2026-10-25) ──────────────────────────────────────
# Revisa quien puede publicar esa cara (decisión del dueño): la lista sólo trae
# esas caras y la ficha y la revisión piden el mismo permiso que publicar.


class RevisarIn(GuiaIn):
    resultado: Literal["coincide", "no_coincide"]
    #: Los números de la guía que quedaron mal.
    numeros: list[StrictInt] = Field(default_factory=list, max_length=60)
    otra_cosa: bool = False
    nota: Optional[str] = Field(default=None, max_length=1000)
    #: «Lo vi en la tienda»: sin foto nueva, la dio por buena mirándola.
    en_la_tienda: bool = False
    #: Mandarle la guía de nuevo a quien monta, con la nota (sólo «no coincide»).
    reenviar: bool = False


@router.get("/supervision")
def leer_supervision(
    sede: str = Query(..., min_length=1),
    todas: bool = False,
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Las caras de la sede para «Para revisar»: sin montar, montadas que falta
    revisar, las que no se pudieron montar y las que no coinciden. Con
    ``todas=1`` (la lista de Montajes), también las que coinciden."""
    from app.fechas import hoy

    return {"caras": supervision.para_revisar(db, sede, rol, con_las_que_coinciden=todas), "hoy": hoy()}


@router.get("/supervision/version")
def leer_ficha(
    id: int = Query(..., ge=1),
    rol: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """La ficha de la revisión: lo planificado, los avisos, las fotos y la historia."""
    guia_servicio.puede_compartir(db, rol, id)
    return supervision.ficha(db, id)


@router.post("/supervision/revisar")
def revisar_montaje(
    cuerpo: RevisarIn,
    request: Request,
    background_tasks: BackgroundTasks,
    rol: str = Depends(require_auth),
    cliente: Cliente = Depends(cliente_del_pedido),
    db: Session = Depends(get_db),
):
    """«Coincide» o «no coincide» (con los números que quedaron mal). Con
    ``reenviar``, a quien monta en la sede le llega la guía de nuevo con la
    nota; si no hay a quién o el correo no está configurado, la revisión se
    guarda igual y la respuesta lo dice."""
    guia_servicio.puede_compartir(db, rol, cuerpo.version_id)
    actor = actor_de(request, rol)
    rev = supervision.revisar(db, cuerpo.version_id, cuerpo.model_dump(), actor)
    nombre, sede, v, _pl = guia_servicio.titulo(db, cuerpo.version_id)
    reenvio = None
    if cuerpo.reenviar and rev.resultado == "no_coincide":
        correos = clean_recipients(recipients_for(db, sede)["montaje"])
        if not correos:
            reenvio = "sin_contactos"
        elif not correo_configurado():
            reenvio = "sin_correo"
        else:
            numeros = json.loads(rev.numeros_json or "[]")
            asunto, html = _correo_de_la_guia(
                db, cuerpo.version_id, cliente, supervision.texto_de_la_correccion(numeros, bool(rev.otra_cosa), rev.nota))
            background_tasks.add_task(send_mail_to_bg, correos, asunto, html)
            rev.guia_reenviada = 1
            reenvio = "enviada"
    detalle = (f"Versión {v.numero}: coincide" + (" (la vio en la tienda)" if rev.en_la_tienda else "")
               if rev.resultado == "coincide" else
               f"Versión {v.numero}: no coincide" + (" · guía reenviada" if rev.guia_reenviada else ""))
    anotar(db, request, rol, "planograma.revision", entidad="planograma", entidad_id=nombre, detalle=detalle)
    db.commit()
    return {"revision": supervision.revision_out(rev), "reenvio": reenvio,
            "reenviada_a": correos if reenvio == "enviada" else []}

