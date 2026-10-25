"""La guía de montaje de una versión publicada (fase 3 de la distribución, 2026-10-24).

Una hoja por cara (decisión del dueño), sacada de la VERSIÓN publicada del
planograma: la cara a escala, cada destino con su número, su lugar y cómo se
monta, lo que cambia contra la versión anterior y, en una cara que se vende,
lo ya asignado como «no tocar». **Sin precios ni nombres de proveedores**:
la abre quien monta, con o sin cuenta (el enlace firmado de
``auth.create_guia_token``), así que acá no entra nada comercial.

Las decisiones del dueño: se ofrece mandarla a quien corresponde (no sale
sola al publicar); los estantes se cuentan desde arriba (lo hace el
navegador con las guías del mueble); la foto al terminar no es obligatoria;
una guía por cara.

Ninguna función hace commit.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.planogramas import FotoDeGuia, Planograma, VersionDePlanograma
from app.routers.montaje import _solo_geometria
from app.services import planogramas as pg
from app.services.participaciones import _error, _iso
from app.services.layout_lookup import sin_prefijo_de_sede


def version_o_404(db: Session, version_id: int) -> tuple[VersionDePlanograma, Planograma]:
    v = db.get(VersionDePlanograma, version_id)
    pl = db.get(Planograma, v.planograma_id) if v is not None else None
    if v is None or pl is None:
        raise _error(404, "sin_version", "Esa versión no existe.")
    return v, pl


def _orden_de_la_hoja(p: dict) -> tuple:
    """El orden de los números de la hoja: de izquierda a derecha y, en la
    misma franja, de arriba abajo; lo que no tiene lugar, al final. El mismo
    orden que ``destinosDeLaGuia`` del navegador (que conserva éste en los
    empates): el número del correo y el de la revisión son los de la hoja."""
    vs = p["vertices"]
    if not vs:
        return (1, 0.0, 0.0)
    return (0, min(u for u, _v in vs), -max(v for _u, v in vs))


def _piezas(db: Session, pl: Planograma, v: VersionDePlanograma) -> list[dict]:
    fuera = []
    for p in pg._piezas_de(db, pl, v.id):
        foto = json.loads(p.foto_json) if p.foto_json else {}
        fuera.append({
            "destino_id": p.destino_id, "pb": p.puntos_basicos,
            "vertices": json.loads(p.vertices_json) if p.vertices_json else None,
            # Lo que la guía puede decir del destino: nada comercial.
            "nombre": foto.get("nombre") or "Destino", "tipo": foto.get("tipo") or "otro",
            "color": foto.get("color") or "d1", "como_se_monta": foto.get("como_se_monta"),
            "codigo_externo": foto.get("codigo_externo"),
        })
    fuera.sort(key=_orden_de_la_hoja)
    return fuera


def fotos_de(db: Session, version_id: int) -> list[dict]:
    filas = (db.query(FotoDeGuia.id, FotoDeGuia.subida_en, FotoDeGuia.subida_por)
             .filter(FotoDeGuia.version_id == version_id).order_by(FotoDeGuia.id).all())
    return [{"id": i, "subida_en": _iso(en), "por_enlace": por == "enlace"} for i, en, por in filas]


def guia(db: Session, version_id: int) -> dict:
    """Todo lo de la hoja, en una llamada (del otro lado puede haber un
    celular con la señal de un supermercado)."""
    v, pl = version_o_404(db, version_id)
    cara = pg.resolver(db, pl.sede, pl.fixture_id, pl.cara)
    dia = hoy()
    versiones = db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id).all()
    _vig, estados = pg._estados(versiones, dia)
    anterior = max((x for x in versiones if x.numero < v.numero), key=lambda x: x.numero, default=None)
    posterior = [x.numero for x in versiones if x.numero > v.numero]
    # Lo ya asignado en las fechas de la versión: sólo dónde, nunca de quién.
    desde = max(v.rige_desde, dia)
    fin = v.hasta or date(9999, 12, 31)
    vendido = pg.vendido_de(db, cara, dia)
    asignado = [poly for p in vendido.participaciones if pg._cruza(p["intervalos"], desde, fin) for poly in p["poligonos"]]
    entera = any(e["desde"] <= fin and desde <= e["hasta"] for e in vendido.entera)
    f = cara.fixture or {}
    return {
        "sede": cara.sede, "hoy": dia, "cara": cara.letra,
        "codigo": sin_prefijo_de_sede(cara.codigo, cara.sede),
        "fixture": {**_solo_geometria(f), "id": cara.fixture_id, "code": f.get("code"), "label": f.get("label")},
        "superficie": {k: cara.superficie[k] for k in ("orientacion", "ancho", "alto", "exclusiones")},
        "version": {"id": v.id, "numero": v.numero, "rige_desde": v.rige_desde, "hasta": v.hasta,
                    "estado": estados[v.id],
                    "vencida_hace_dias": (dia - v.hasta).days if (estados[v.id] == "vigente" and v.hasta and v.hasta < dia) else None,
                    "hay_una_mas_nueva": bool(posterior),
                    "para_revisar": v.firma is not None and v.firma != cara.firma},
        "piezas": _piezas(db, pl, v),
        "anterior": None if anterior is None else {"numero": anterior.numero, "piezas": _piezas(db, pl, anterior)},
        "asignado": asignado,
        "vendida_entera": entera,
        "fotos": fotos_de(db, v.id),
    }


def titulo(db: Session, version_id: int) -> tuple[str, str, VersionDePlanograma, Planograma]:
    """«GON-12 · cara A» y la sede, para el asunto del correo."""
    v, pl = version_o_404(db, version_id)
    cara = pg.resolver(db, pl.sede, pl.fixture_id, pl.cara)
    return pg._nombre_de_cara(cara), cara.sede, v, pl


def puede_leer(db: Session, rol: str, version_id: int) -> None:
    """Abrir la guía con sesión: lo mismo que leer el planograma de esa cara."""
    v, pl = version_o_404(db, version_id)
    pg.exigir_lectura(rol, pg.resolver(db, pl.sede, pl.fixture_id, pl.cara))


def puede_compartir(db: Session, rol: str, version_id: int) -> None:
    """Sacar el enlace o mandar la guía: quien planifica esa cara."""
    v, pl = version_o_404(db, version_id)
    cara = pg.resolver(db, pl.sede, pl.fixture_id, pl.cara)
    pg.exigir_que_puede(db, rol, cara)


def fecha_corta(d: Optional[date]) -> str:
    from app.services.reglas_participacion import _fecha_corta

    return _fecha_corta(d) if d else ""
