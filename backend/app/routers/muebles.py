"""Las fichas propias de los muebles de un supermercado: ``/api/muebles``.

Existe para que cada supermercado arme sus muebles sin pedirnos un cambio. Los
modelos que trae RECABRA están en ``muebles.json`` y cambian sólo con un
despliegue; los de cada supermercado —la nevera de dos puertas que tiene
Cañaveral y el catálogo no— se guardan en su base (``modelos_mueble``) y se
colocan como cualquier modelo: el plano guarda ``cli:<clave>`` en el ``modelo``
del mueble y le ESTAMPA sus medidas y su geometría.

El prefijo es ``/muebles`` porque ``/catalogo`` ya es el catálogo de ARTES de
los proveedores (``routers/catalogo.py``).

· ``GET /modelos``: cualquier sesión del supermercado. Una ficha no lleva plata
  (la tarifa es la CLAVE de una fila de Tarifas, nunca un valor), y el editor
  la necesita para nombrar lo que está colocado.
· ``POST /modelos`` y ``PUT /modelos/{clave}``: sólo administración. La
  validación es UNA, la del catálogo (``catalogo_muebles.problemas_de_la_ficha``),
  con las mismas reglas que los modelos de ``muebles.json``. La clave, la
  familia y la tarifa no se editan: lo colocado busca la tarifa por la clave y
  compara la familia con la del mueble.
· ``POST /modelos/{clave}/retirar`` y ``/reactivar``: la baja es lógica. Nada se
  borra, y retirar no cambia ningún plano: lo colocado tiene la ficha estampada.

Alta, cambio, retiro y reactivación quedan en la bitácora del supermercado.
Las rutas literales van antes que las paramétricas.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_admin, require_auth
from app.database import get_db
from app.models.models import ModeloMueble
from app.services.bitacora import anotar
from app.services.catalogo_muebles import ficha_normalizada, problemas_de_la_ficha
from app.services.fichas_propias import datos_de, id_de, salida

router = APIRouter(prefix="/muebles", tags=["muebles"])

#: Cómo se nombra en la bitácora.
ENTIDAD = "ficha de mueble"

#: Lo que dice la bitácora que cambió, por grupo de campos.
_GRUPOS = (
    ("nombre", ("nombre",)),
    ("variante", ("variante",)),
    ("medidas", ("w", "d", "h")),
    ("geometría", ("entrepanos", "modulo", "partes")),
    ("fuente", ("fuente",)),
)


def _rechazo(problemas: list[tuple[str, str]]) -> HTTPException:
    """422 con la forma de los errores de validación de FastAPI (``loc``,
    ``msg``): ``describeError`` del navegador ya la sabe leer, y el formulario
    puede marcar cada campo."""
    return HTTPException(
        status_code=422,
        detail=[{"loc": ["body", *campo.split(".")], "msg": msg, "type": "ficha"} for campo, msg in problemas],
    )


def _quien(request: Request, rol: str) -> str:
    return getattr(request.state, "actor_email", None) or rol


def _fila(db: Session, clave: str) -> ModeloMueble:
    fila = db.query(ModeloMueble).filter(ModeloMueble.clave == clave).first()
    if fila is None:
        raise HTTPException(status_code=404, detail="No hay una ficha con esa clave.")
    return fila


# ─── Las literales ────────────────────────────────────────────────────────────

@router.get("/modelos")
def listar(rol: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Todas las fichas del supermercado, retiradas incluidas (con
    ``retirado: true``): el editor tiene que poder nombrar lo que ya está
    colocado con una ficha retirada. Las paletas muestran sólo las vigentes."""
    filas = db.query(ModeloMueble).order_by(ModeloMueble.tipo, ModeloMueble.nombre, ModeloMueble.id).all()
    return [salida(f, con_autor=rol == "admin") for f in filas]


@router.post("/modelos", status_code=201)
def crear(
    request: Request,
    ficha: dict = Body(...),
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    problemas = problemas_de_la_ficha(ficha, nueva=True)
    if problemas:
        raise _rechazo(problemas)
    clave = ficha["clave"]
    existente = db.query(ModeloMueble).filter(ModeloMueble.clave == clave).first()
    if existente is not None:
        retirada = " (retirada)" if existente.retirado_en is not None else ""
        raise HTTPException(
            status_code=409,
            detail=f"Ya hay una ficha con la clave «{clave}»{retirada}. Las claves no se reutilizan: "
                   "los muebles colocados la guardan y buscan su tarifa por ella.",
        )
    datos = ficha_normalizada(ficha)
    ahora = datetime.now(timezone.utc)
    fila = ModeloMueble(
        clave=clave,
        tipo=datos.pop("tipo"),
        nombre=datos.pop("nombre"),
        datos_json=json.dumps(datos, ensure_ascii=False),
        creado_en=ahora,
        actualizado_en=ahora,
        creado_por=_quien(request, rol),
    )
    db.add(fila)
    anotar(db, request, rol, "ficha_mueble.alta", entidad=ENTIDAD, entidad_id=id_de(clave), detalle=fila.nombre)
    try:
        db.commit()
    except IntegrityError:
        # Dos altas con la misma clave a la vez: la segunda choca con el UNIQUE.
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Ya hay una ficha con la clave «{clave}».")
    db.refresh(fila)
    return salida(fila, con_autor=True)


# ─── Las paramétricas ─────────────────────────────────────────────────────────

@router.put("/modelos/{clave}")
def cambiar(
    clave: str,
    request: Request,
    ficha: dict = Body(...),
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reemplaza la ficha entera. No mueve nada de ningún plano: lo colocado
    tiene la ficha estampada. La clave, la familia y la tarifa no cambian."""
    fila = _fila(db, clave)
    problemas = problemas_de_la_ficha(ficha, nueva=False)
    if "clave" in ficha and ficha["clave"] != clave:
        problemas.append(("clave", "la clave no se edita: es lo que guarda el plano"))
    if problemas:
        raise _rechazo(problemas)

    datos = ficha_normalizada(ficha)
    antes = datos_de(fila)
    fijos = []
    if datos["tipo"] != fila.tipo:
        fijos.append(("tipo", "la familia de una ficha no cambia: retirala y armá otra"))
    if datos.get("tarifa") != antes.get("tarifa"):
        fijos.append(("tarifa", "la tarifa de una ficha no cambia: lo colocado la busca por la clave. "
                                "Retirala y armá otra"))
    if fijos:
        raise _rechazo(fijos)

    nombre = datos.pop("nombre")
    datos.pop("tipo")
    viejo = {"nombre": fila.nombre, **antes}
    nuevo = {"nombre": nombre, **datos}
    cambios = [g for g, campos in _GRUPOS if any(viejo.get(c) != nuevo.get(c) for c in campos)]
    if not cambios:
        return salida(fila, con_autor=True)

    fila.nombre = nombre
    fila.datos_json = json.dumps(datos, ensure_ascii=False)
    fila.actualizado_en = datetime.now(timezone.utc)
    anotar(db, request, rol, "ficha_mueble.cambio", entidad=ENTIDAD, entidad_id=id_de(clave),
           detalle=f"{nombre} · {', '.join(cambios)}")
    db.commit()
    db.refresh(fila)
    return salida(fila, con_autor=True)


@router.post("/modelos/{clave}/retirar")
def retirar(clave: str, request: Request, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Saca la ficha de las paletas. No borra nada, y lo ya colocado con ella
    sigue igual, con su tarifa. Retirar una retirada no hace nada."""
    fila = _fila(db, clave)
    if fila.retirado_en is None:
        ahora = datetime.now(timezone.utc)
        fila.retirado_en = ahora
        fila.actualizado_en = ahora
        anotar(db, request, rol, "ficha_mueble.retiro", entidad=ENTIDAD, entidad_id=id_de(clave), detalle=fila.nombre)
        db.commit()
        db.refresh(fila)
    return salida(fila, con_autor=True)


@router.post("/modelos/{clave}/reactivar")
def reactivar(clave: str, request: Request, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """La vuelve a las paletas. Reactivar una vigente no hace nada."""
    fila = _fila(db, clave)
    if fila.retirado_en is not None:
        fila.retirado_en = None
        fila.actualizado_en = datetime.now(timezone.utc)
        anotar(db, request, rol, "ficha_mueble.reactivacion", entidad=ENTIDAD, entidad_id=id_de(clave),
               detalle=fila.nombre)
        db.commit()
        db.refresh(fila)
    return salida(fila, con_autor=True)
