"""Términos versionados y derechos de cada persona (auditoría pre-lanzamiento:
P0-2, la parte de producto, y P1-14).

Rutas literales con su camino entero (este router no tiene prefijo propio):

* ``GET  /api/auth/terminos`` — pública. Los términos vigentes, o que no hay.
  Mientras ``TERMINOS_VIGENTES`` no esté puesta —o el texto siga siendo el
  borrador— dice ``vigente: false`` y nada más (``services/terminos.py``).
* ``POST /api/auth/aceptar-terminos`` — la dueña acepta la versión vigente para
  su supermercado (lo llama el aviso que aparece al entrar).
* ``GET  /api/auth/mis-datos`` — «Descargar mis datos»: cualquier persona con
  cuenta propia baja lo suyo. No la corta el estado de cuenta (habeas data).
* ``POST /api/plataforma/titulares/exportar`` y ``…/suprimir`` — el operador
  atiende la solicitud de una persona concreta: por correo, por teléfono o por
  el proveedor del que es contacto. ``GET /api/plataforma/titulares`` lista las
  constancias. Es la excepción declarada a «la consola no abre datos de
  personas» (política §5.3 b y §7.1 d): sólo para atender un derecho, con
  constancia y con línea en las dos bitácoras.

**POST y no GET para buscar a alguien**: el correo de la persona va en el
cuerpo, nunca en la URL, que el registro de accesos del hosting escribe entera.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_auth, sub_y_email_de_la_sesion
from app.clientes import Cliente, buscar, cliente_del_pedido, sesion_de, sesion_registro
from app.database import get_db
# Registra `aceptaciones_de_terminos` y `derechos_de_titulares` en
# `Base.metadata` antes de `create_all()`.
from app.models import terminos as _tablas_de_terminos  # noqa: F401
from app.red import ip_del_cliente
from app.routers.plataforma import _anotar_consulta, require_operador
from app.services import terminos as terminos_srv
from app.services import titulares as titulares_srv
from app.services.bitacora import anotar

router = APIRouter(tags=["titulares"])
log = logging.getLogger("recabra.titulares.router")

#: El «supermercado» de la línea de bitácora cuando lo que se tocó es el
#: registro (la cuenta): empieza con guion bajo, así que ningún slug real
#: (`clientes.SLUG_VALIDO` arranca con letra) coincide.
PERIODO_DEL_REGISTRO = "_registro_"


# ─── Términos ────────────────────────────────────────────────────────────────

@router.get("/auth/terminos")
def terminos_vigentes():
    """Pública, sin sesión: la página ``/terminos`` y el alta la leen. Va bajo
    ``/auth`` porque es parte del ingreso, como ``/auth/invitacion/{token}``:
    no dice nada de ningún supermercado ni de nadie."""
    vigentes = terminos_srv.vigentes()
    if vigentes is None:
        return {"vigente": False, "version": None, "texto": None}
    return {"vigente": True, "version": vigentes["version"], "texto": vigentes["texto"]}


class AceptarTerminosIn(BaseModel):
    version: str = Field(min_length=1, max_length=40)


def _rol_de_membresia(usuario_id: int, slug: str) -> Optional[str]:
    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        m = (
            reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario_id, Membresia.cliente_slug == slug,
                    Membresia.activo.is_(True))
            .first()
        )
        return m.rol if m else None
    finally:
        reg.close()


@router.post("/auth/aceptar-terminos", status_code=204)
def aceptar_terminos(
    body: AceptarTerminosIn,
    request: Request,
    db: Session = Depends(get_db),
    role: str = Depends(require_auth),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
    cliente: Cliente = Depends(cliente_del_pedido),
):
    """La dueña acepta los términos vigentes para SU supermercado. 409 si no
    hay términos vigentes o si la versión no es la que rige (la pantalla
    quedó vieja: que relea); 403 si no es la dueña. Idempotente."""
    sub, _email = identidad
    if sub is None:
        raise HTTPException(status_code=403, detail="Los términos los acepta la dueña, con su cuenta.")
    vigente = terminos_srv.version_vigente()
    if vigente is None:
        raise HTTPException(status_code=409, detail="No hay términos del servicio vigentes para aceptar.")
    if body.version.strip() != vigente:
        raise HTTPException(
            status_code=409,
            detail="Los términos cambiaron mientras leías: volvé a abrirlos y aceptá la versión nueva.",
        )
    if _rol_de_membresia(sub, cliente.slug) != "owner":
        raise HTTPException(status_code=403, detail="Los términos del servicio los acepta la dueña del supermercado.")

    reg = sesion_registro()
    try:
        if not terminos_srv.acepto(reg, sub, cliente.slug, vigente):
            terminos_srv.registrar(reg, sub, cliente.slug, vigente, ip_del_cliente(request), origen="login")
            try:
                reg.commit()
            except IntegrityError:
                reg.rollback()  # dos toques del botón: la fila ya está
                return
            anotar(db, request, role, "terminos.aceptados", detalle=f"versión {vigente}")
            db.commit()
    finally:
        reg.close()


# ─── Descargar mis datos ─────────────────────────────────────────────────────

@router.get("/auth/mis-datos")
def mis_datos(
    request: Request,
    db: Session = Depends(get_db),
    role: str = Depends(require_auth),
    identidad: tuple = Depends(sub_y_email_de_la_sesion),
):
    """Lo que RECABRA tiene de quien pide: su cuenta (membresías, aceptaciones
    de la política y de los términos) y lo que la menciona en los
    supermercados donde tiene acceso hoy. El mismo freno que el export de la
    dueña (3 por hora, por cuenta). Deja línea en la bitácora del
    supermercado de la sesión."""
    from app.models.identidad import Membresia
    from app.routers.derechos import _chequear_y_anotar_freno_export

    sub, _email = identidad
    if sub is None:
        raise HTTPException(status_code=403, detail="Esta sesión no es de una cuenta personal.")
    persona = titulares_srv.persona_por_usuario(sub)
    if persona is None:
        raise HTTPException(status_code=404, detail="No encontramos tu cuenta.")
    _chequear_y_anotar_freno_export(sub)

    reg = sesion_registro()
    try:
        membresias = {
            m.cliente_slug: m.rol
            for m in reg.query(Membresia).filter(Membresia.usuario_id == sub, Membresia.activo.is_(True))
        }
    finally:
        reg.close()

    cuerpo = titulares_srv.exportar(persona, para_la_persona=True, membresias=membresias)
    anotar(db, request, role, "titular.descarga", detalle="la persona bajó sus datos")
    db.commit()

    fecha = datetime.now(timezone.utc).date().isoformat()
    return Response(
        content=json.dumps(cuerpo, ensure_ascii=False, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="recabra-mis-datos-{fecha}.json"'},
    )


# ─── El operador atiende a una persona ───────────────────────────────────────

class TitularIn(BaseModel):
    """A quién: ``correo`` (y/o ``telefono``), o ``cliente`` + ``proveedor_id``
    para el contacto de un proveedor. ``cliente`` solo limita la búsqueda a
    ese supermercado (la instrucción vino de él)."""

    correo: Optional[str] = Field(default=None, max_length=254)
    telefono: Optional[str] = Field(default=None, max_length=40)
    cliente: Optional[str] = Field(default=None, max_length=40)
    proveedor_id: Optional[int] = None
    #: El radicado o la referencia de la solicitud. Obligatoria para suprimir.
    referencia: Optional[str] = Field(default=None, max_length=200)


class SuprimirIn(TitularIn):
    #: Suprimir a la única dueña de un supermercado activo deja el supermercado
    #: sin nadie a cargo: hay que decirlo.
    aunque_sea_la_unica_duena: bool = False


def _persona(body: TitularIn) -> titulares_srv.Persona:
    cliente = (body.cliente or "").strip().lower() or None
    if cliente is not None and buscar(cliente) is None:
        # `buscar` deja afuera a los archivados: se mira la lista entera.
        from app.clientes import listar

        if all(c.slug != cliente for c in listar(solo_activos=False)):
            raise HTTPException(status_code=404, detail="No hay un supermercado con ese código.")
    try:
        if body.proveedor_id is not None:
            if cliente is None:
                raise HTTPException(status_code=422, detail="Para el contacto de un proveedor hace falta el supermercado.")
            return titulares_srv.persona_por_proveedor(cliente, body.proveedor_id)
        persona = titulares_srv.persona_por_correo(body.correo or "", body.telefono, cliente)
    except titulares_srv.ErrorDeTitular as e:
        raise HTTPException(status_code=404, detail=e.texto) from e
    if persona.vacia():
        raise HTTPException(status_code=422, detail="Escribí el correo o el teléfono de la persona, o el proveedor.")
    return persona


def _constancia(tipo: str, persona: titulares_srv.Persona, operador: str, referencia: Optional[str],
                resumen: dict) -> int:
    from app.models.terminos import DerechoDeTitular

    reg = sesion_registro()
    try:
        fila = DerechoDeTitular(
            tipo=tipo, sujeto=persona.sujeto, huella=persona.huella, cliente_slug=persona.cliente,
            atendido_por=operador, referencia=(referencia or "").strip() or None,
            resumen_json=json.dumps(resumen, ensure_ascii=False, default=str),
        )
        reg.add(fila)
        reg.commit()
        return fila.id
    finally:
        reg.close()


def _anotar_en_las_bitacoras(request: Request, operador: str, accion_plataforma: str,
                             accion_cliente: str, slugs: list[str], registro: bool, constancia: int) -> None:
    """Una línea en la bitácora de la plataforma por cada supermercado tocado
    (la ve en su reporte de transparencia) y otra en la de ese supermercado."""
    from app.plataforma_metricas import periodo_actual

    mes = periodo_actual()
    if registro:
        _anotar_consulta(operador, accion_plataforma, f"{PERIODO_DEL_REGISTRO}:{mes}")
    for slug in slugs:
        _anotar_consulta(operador, accion_plataforma, f"{slug}:{mes}")
        cliente = buscar(slug)
        if cliente is None:
            from app.clientes import listar

            cliente = next((c for c in listar(solo_activos=False) if c.slug == slug), None)
        if cliente is None:
            continue
        db = sesion_de(cliente)
        try:
            anotar(db, request, "plataforma", accion_cliente, detalle=f"constancia #{constancia}")
            db.commit()
        except Exception:  # noqa: BLE001 — la constancia ya quedó en el registro
            log.exception("No se pudo anotar %s en la bitácora de %s", accion_cliente, slug)
            db.rollback()
        finally:
            db.close()


@router.post("/plataforma/titulares/exportar")
def exportar_titular(body: TitularIn, request: Request,
                     operador: str = Depends(require_operador)):
    """Todo lo que hay de UNA persona en el registro y en cada supermercado,
    para contestar una consulta (art. 14: 10 días hábiles)."""
    persona = _persona(body)
    try:
        cuerpo = titulares_srv.exportar(persona)
    except titulares_srv.ErrorDeTitular as e:
        raise HTTPException(status_code=422, detail=e.texto) from e
    resumen = titulares_srv.resumen_de(cuerpo)
    constancia = _constancia("export", persona, operador, body.referencia, resumen)
    _anotar_en_las_bitacoras(
        request, operador, "titular_export", "titular.exportado",
        sorted(cuerpo["supermercados"]), registro=persona.sujeto == "persona" and not persona.cliente,
        constancia=constancia,
    )
    cuerpo["constancia"] = constancia
    return cuerpo


@router.post("/plataforma/titulares/suprimir")
def suprimir_titular(body: SuprimirIn, request: Request,
                     operador: str = Depends(require_operador)):
    """Anonimiza a UNA persona en todas las bases (art. 15: 15 días hábiles).
    Lo que la ley obliga a conservar —contratos, bitácora, facturación,
    constancias de autorización— queda, sin la persona."""
    if not (body.referencia or "").strip():
        raise HTTPException(status_code=422, detail="Escribí la referencia de la solicitud (el radicado o la fecha del correo).")
    persona = _persona(body)
    try:
        resumen = titulares_srv.suprimir(persona, aunque_sea_la_unica_duena=body.aunque_sea_la_unica_duena)
    except titulares_srv.ErrorDeTitular as e:
        if e.codigo == "unica_duena":
            raise HTTPException(status_code=409, detail={"codigo": e.codigo, "mensaje": e.texto, **e.extra}) from e
        raise HTTPException(status_code=422, detail=e.texto) from e
    constancia = _constancia("supresion", persona, operador, body.referencia, resumen)
    tocados = sorted(set(resumen["supermercados"]) | set(resumen.get("membresias_apagadas") or []))
    _anotar_en_las_bitacoras(
        request, operador, "titular_supresion", "titular.suprimido", tocados,
        registro=persona.sujeto == "persona" and not persona.cliente, constancia=constancia,
    )
    return {"constancia": constancia, "huella": persona.huella, **resumen}


@router.get("/plataforma/titulares")
def constancias(operador: str = Depends(require_operador)):
    """Las solicitudes atendidas, más nuevas primero (sin datos de personas:
    la huella, los conteos y la referencia)."""
    from app.models.terminos import DerechoDeTitular
    from app.plataforma_metricas import periodo_actual

    reg = sesion_registro()
    try:
        filas = reg.query(DerechoDeTitular).order_by(DerechoDeTitular.id.desc()).limit(200).all()
        fuera = [
            {"id": f.id, "tipo": f.tipo, "sujeto": f.sujeto, "huella": f.huella, "supermercado": f.cliente_slug,
             "atendido_por": f.atendido_por, "atendido_en": f.atendido_en.isoformat() if f.atendido_en else None,
             "referencia": f.referencia, "resumen": json.loads(f.resumen_json or "{}")}
            for f in filas
        ]
    finally:
        reg.close()
    _anotar_consulta(operador, "titulares", periodo_actual())
    return fuera
