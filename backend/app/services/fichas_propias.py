"""Las fichas propias de los muebles de un supermercado, leídas de su base.

La tabla es ``modelos_mueble`` (``models/models.py``) y la API,
``routers/muebles.py``. Acá queda lo que usan también otros: la tarifa propia
de cada ficha, que necesitan la planilla (``bulk_leases``) y la consola de la
plataforma (``plataforma_metricas``, que alimenta también el detalle por
cliente), y cómo se arma la salida de una fila.

**Una consulta por pedido, no por mueble.** ``tarifas_propias`` lee de una vez
las fichas que tienen tarifa (unas pocas por supermercado) y quien llama se la
pasa a ``catalogo_muebles.tarifa_del_mueble`` en cada mueble. Una planilla trae
hasta trescientas filas y la consola recorre todos los planos de todos los
clientes: una consulta por mueble serían miles.

**Las retiradas también cuentan.** Retirar una ficha la saca de las paletas,
pero lo ya colocado con ella sigue igual, con su tarifa.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.models import ModeloMueble
from app.services.catalogo_muebles import PREFIJO_PROPIO


def id_de(clave: str) -> str:
    """Cómo se llama la ficha en el ``modelo`` de un mueble del plano."""
    return f"{PREFIJO_PROPIO}{clave}"


def datos_de(fila: ModeloMueble) -> dict:
    """Lo que guarda ``datos_json``. Lo escribe sólo ``routers/muebles.py``,
    ya validado; un JSON ilegible da una ficha sin datos en vez de tumbar la
    lista entera."""
    try:
        datos = json.loads(fila.datos_json or "{}")
    except (TypeError, ValueError):
        return {}
    return datos if isinstance(datos, dict) else {}


def tarifas_propias(db: Session) -> dict[str, tuple[str, str]]:
    """``cli:<clave>`` → ``(tipo, tarifa)`` de las fichas que tienen tarifa
    propia, retiradas incluidas. Lo que espera ``tarifa_del_mueble``."""
    salida: dict[str, tuple[str, str]] = {}
    for clave, tipo, datos_json in db.query(
        ModeloMueble.clave, ModeloMueble.tipo, ModeloMueble.datos_json
    ).all():
        try:
            tarifa = json.loads(datos_json or "{}").get("tarifa")
        except (TypeError, ValueError, AttributeError):
            continue
        if isinstance(tarifa, str) and tarifa:
            salida[id_de(clave)] = (tipo, tarifa)
    return salida


def salida(fila: ModeloMueble, *, con_autor: bool = False) -> dict:
    """La ficha como la ve el navegador: con la MISMA forma que un modelo de
    ``muebles.json`` (``id``, ``tipo``, ``variante``, ``nombre``, ``w``/``d``/``h``,
    geometría, ``tarifa``, ``fuente``), más la clave, si está retirada y las
    fechas. Quién la creó, sólo para un administrador."""
    datos = datos_de(fila)
    out = {
        "id": id_de(fila.clave),
        "clave": fila.clave,
        "tipo": fila.tipo,
        "nombre": fila.nombre,
        **{k: v for k, v in datos.items() if k not in ("tipo", "nombre", "clave", "id")},
        "retirado": fila.retirado_en is not None,
        "retirado_en": fila.retirado_en,
        "creado_en": fila.creado_en,
        "actualizado_en": fila.actualizado_en,
    }
    if con_autor:
        out["creado_por"] = fila.creado_por
    return out
