"""La supervisión de los planogramas (fase 4 de la distribución, 2026-10-25).

Igual que el montaje de los contratos, pero para la cara planificada: quien
monta avisa desde el enlace de la guía «quedó montada» (con foto si quiere) o
«no se pudo» (con el motivo), y una persona pone lo planificado al lado de la
foto y dice si coincide. **Nada se decide solo**: el sistema junta las dos
cosas y lleva la cuenta.

Las decisiones del dueño:

1. Revisa quien puede publicar esa cara (``planogramas.puede_planificar``):
   quien administra siempre; el equipo en los muebles internos si la dueña lo
   habilitó.
2. Una versión sin aviso entra en «Para revisar» → Hoy **el mismo día** que
   empieza a regir.
3. Sin foto (no es obligatoria) se puede dar por buena: «Lo vi en la tienda»,
   y queda quién y cuándo.
4. Si no coincide, se marcan los números de la guía que quedaron mal y se
   ofrece —marcado, se puede desmarcar— mandarle la guía de nuevo a quien
   monta, con la nota.

El estado de una versión sale del último aviso y la última revisión: la
revisión apunta al aviso que revisó (``montaje_id``), así que un aviso con id
mayor es posterior a la revisión, sin comparar relojes.

Ninguna función hace commit.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.planogramas import (
    ESTADOS_DE_MONTAJE, MOTIVOS_DE_NO_MONTAJE, RESULTADOS_DE_REVISION, FotoDeGuia, MontajeDePlanograma,
    Planograma, RevisionDePlanograma, VersionDePlanograma,
)
from app.services import guia as guia_servicio
from app.services import planogramas as pg
from app.services.layout_lookup import PlanoIndexado, normalizar
from app.services.participaciones import _armar_cara, _error, _iso

#: Lo que entra en «Para revisar» (las cuatro van en «Hoy»).
PARA_REVISAR = ("por_revisar", "no_coincide", "no_se_pudo", "sin_montar")

MOTIVO_LEGIBLE = {
    "sin_producto": "No llegó el producto",
    "ocupado": "El lugar está ocupado por otra cosa",
    "falta_material": "Falta material (separadores, cenefas)",
    "otro": "Otro motivo",
}

MAX_NOTA = 1000


def _texto(v: Optional[str]) -> Optional[str]:
    t = (v or "").strip()
    if len(t) > MAX_NOTA:
        raise _error(422, "nota_larga", f"La nota pasa de {MAX_NOTA} letras.")
    return t or None


# ─── Lo que hay de cada versión ───────────────────────────────────────────────


def aviso_out(a: Optional[MontajeDePlanograma]) -> Optional[dict]:
    if a is None:
        return None
    return {"id": a.id, "estado": a.estado, "motivo": a.motivo,
            "motivo_legible": MOTIVO_LEGIBLE.get(a.motivo) if a.motivo else None,
            "nota": a.nota, "por_enlace": a.avisado_por == "enlace",
            "por": None if a.avisado_por == "enlace" else a.avisado_por, "en": _iso(a.avisado_en)}


def revision_out(r: Optional[RevisionDePlanograma]) -> Optional[dict]:
    if r is None:
        return None
    return {"id": r.id, "montaje_id": r.montaje_id, "resultado": r.resultado,
            "numeros": json.loads(r.numeros_json or "[]"), "otra_cosa": bool(r.otra_cosa), "nota": r.nota,
            "en_la_tienda": bool(r.en_la_tienda), "guia_reenviada": bool(r.guia_reenviada),
            "por": r.revisada_por, "en": _iso(r.revisada_en)}


def _ultimos(db: Session, ids: list[int]) -> tuple[dict, dict]:
    """El último aviso y la última revisión de cada versión (por id)."""
    avisos: dict = {}
    for a in (db.query(MontajeDePlanograma).filter(MontajeDePlanograma.version_id.in_(ids or [-1]))
              .order_by(MontajeDePlanograma.id).all()):
        avisos[a.version_id] = a
    revisiones: dict = {}
    for r in (db.query(RevisionDePlanograma).filter(RevisionDePlanograma.version_id.in_(ids or [-1]))
              .order_by(RevisionDePlanograma.id).all()):
        revisiones[r.version_id] = r
    return avisos, revisiones


def _aviso_es_posterior(aviso: Optional[MontajeDePlanograma], rev: Optional[RevisionDePlanograma]) -> bool:
    return aviso is not None and (rev is None or (rev.montaje_id or 0) < aviso.id)


def estado_de(aviso: Optional[MontajeDePlanograma], rev: Optional[RevisionDePlanograma], estado_version: str) -> str:
    """no_rige · sin_montar · por_revisar · no_se_pudo · coincide · no_coincide
    · sin_registro (una reemplazada de la que nunca se supo nada)."""
    if _aviso_es_posterior(aviso, rev):
        return "por_revisar" if aviso.estado == "montada" else "no_se_pudo"
    if rev is not None:
        return rev.resultado
    if estado_version == "programada":
        return "no_rige"
    if estado_version == "vigente":
        return "sin_montar"
    return "sin_registro"


def montaje_de_versiones(db: Session, versiones: list[VersionDePlanograma], estados: dict) -> dict:
    """{version_id: {"estado", "aviso", "revision"}} para «Versiones»."""
    avisos, revisiones = _ultimos(db, [v.id for v in versiones])
    return {v.id: {"estado": estado_de(avisos.get(v.id), revisiones.get(v.id), estados[v.id]),
                   "aviso": aviso_out(avisos.get(v.id)), "revision": revision_out(revisiones.get(v.id))}
            for v in versiones}


def correccion_pendiente(db: Session, version_id: int) -> Optional[dict]:
    """Si la última palabra es «no coincide» (y nadie volvió a avisar), lo que
    hay que corregir: lo ve quien monta en el enlace de la guía."""
    avisos, revisiones = _ultimos(db, [version_id])
    a, r = avisos.get(version_id), revisiones.get(version_id)
    if r is None or r.resultado != "no_coincide" or _aviso_es_posterior(a, r):
        return None
    return {"numeros": json.loads(r.numeros_json or "[]"), "otra_cosa": bool(r.otra_cosa), "nota": r.nota,
            "en": _iso(r.revisada_en)}


def ultimo_aviso(db: Session, version_id: int) -> Optional[dict]:
    a = (db.query(MontajeDePlanograma).filter(MontajeDePlanograma.version_id == version_id)
         .order_by(MontajeDePlanograma.id.desc()).first())
    return aviso_out(a)


# ─── «Para revisar» ───────────────────────────────────────────────────────────


def para_revisar(db: Session, sede: str, rol: str, con_las_que_coinciden: bool = False) -> list[dict]:
    """Las caras de la sede cuya versión vigente está sin montar, montada y
    falta revisar, no se pudo montar o no coincide. Sólo las que ese rol
    puede revisar (las mismas que puede publicar)."""
    s = normalizar(sede)
    dia = hoy()
    plano = PlanoIndexado(db)
    muebles = {str(f.get("id")): f for f in plano.de_sede(s)}
    candidatos = []
    for pl in db.query(Planograma).filter(Planograma.sede == s).order_by(Planograma.id).all():
        f = muebles.get(pl.fixture_id)
        if f is None:
            continue
        cara = _armar_cara(s, f, pl.cara)
        if not pg.puede_planificar(db, rol, cara):
            continue
        versiones = db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id).all()
        vigente, _estados = pg._estados(versiones, dia)
        if vigente is not None:
            candidatos.append((pl, cara, vigente))
    avisos, revisiones = _ultimos(db, [v.id for _pl, _c, v in candidatos])
    fuera = []
    for pl, cara, v in candidatos:
        a, r = avisos.get(v.id), revisiones.get(v.id)
        estado = estado_de(a, r, "vigente")
        # La lista de Montajes (rediseño UX, etapa 7) pide también las que
        # coinciden: el filtro «Verificado»; «Para revisar» no las quiere.
        if estado not in PARA_REVISAR and not (con_las_que_coinciden and estado == "coincide"):
            continue
        fotos = 0
        if estado == "por_revisar":
            q = db.query(FotoDeGuia.id).filter(FotoDeGuia.version_id == v.id)
            if r is not None:
                q = q.filter(FotoDeGuia.subida_en > r.revisada_en)
            fotos = q.count()
        fuera.append({
            "version_id": v.id, "numero": v.numero, "fixture_id": pl.fixture_id, "cara": pl.cara,
            "codigo": guia_servicio.codigo_del_mueble(cara), "nombre": pg._nombre_de_cara(cara),
            "estado": estado, "rige_desde": v.rige_desde, "dias_que_rige": (dia - v.rige_desde).days,
            "aviso": aviso_out(a) if _aviso_es_posterior(a, r) else None,
            "revision": revision_out(r) if estado in ("no_coincide", "coincide") else None,
            "fotos_nuevas": fotos,
        })
    return fuera


# ─── La ficha ─────────────────────────────────────────────────────────────────


def ficha(db: Session, version_id: int) -> dict:
    """Lo planificado (la guía) al lado de lo montado (los avisos y las fotos),
    con la historia de la versión."""
    datos = guia_servicio.guia(db, version_id)
    avisos = (db.query(MontajeDePlanograma).filter(MontajeDePlanograma.version_id == version_id)
              .order_by(MontajeDePlanograma.id.desc()).all())
    revisiones = (db.query(RevisionDePlanograma).filter(RevisionDePlanograma.version_id == version_id)
                  .order_by(RevisionDePlanograma.id.desc()).all())
    a = avisos[0] if avisos else None
    r = revisiones[0] if revisiones else None
    desde = r.revisada_en if r is not None else None
    fotos = []
    for f in (db.query(FotoDeGuia.id, FotoDeGuia.subida_en, FotoDeGuia.subida_por)
              .filter(FotoDeGuia.version_id == version_id).order_by(FotoDeGuia.id.desc()).all()):
        fotos.append({"id": f[0], "subida_en": _iso(f[1]), "por_enlace": f[2] == "enlace",
                      "nueva": desde is None or _utc(f[1]) > _utc(desde)})
    return {
        **datos,
        "fotos": fotos,
        "montaje": {
            "estado": estado_de(a, r, datos["version"]["estado"]),
            "aviso": aviso_out(a), "revision": revision_out(r),
            "avisos": [aviso_out(x) for x in avisos], "revisiones": [revision_out(x) for x in revisiones],
        },
    }


def _utc(d: datetime) -> datetime:
    """SQLite devuelve las fechas sin zona: se leen como UTC."""
    return d if d.tzinfo is not None else d.replace(tzinfo=timezone.utc)


# ─── Escribir ─────────────────────────────────────────────────────────────────


def _estado_de_la_version(db: Session, version_id: int) -> tuple[VersionDePlanograma, Planograma, str]:
    v, pl = guia_servicio.version_o_404(db, version_id)
    versiones = db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id).all()
    _vig, estados = pg._estados(versiones, hoy())
    return v, pl, estados[v.id]


def avisar(db: Session, version_id: int, e: dict, avisado_por: str) -> MontajeDePlanograma:
    """El aviso de quien monta. Una versión ya reemplazada no se monta: se
    pide la guía nueva."""
    _v, _pl, estado_version = _estado_de_la_version(db, version_id)
    if estado_version == "reemplazada":
        raise _error(409, "reemplazada", "Ya hay una versión más nueva de esta cara: pedí la guía nueva antes de montar.")
    estado = e.get("estado")
    if estado not in ESTADOS_DE_MONTAJE:
        raise _error(422, "estado_invalido", "El aviso es «quedó montada» o «no se pudo».")
    motivo = e.get("motivo") if estado == "no_se_pudo" else None
    if estado == "no_se_pudo" and motivo not in MOTIVOS_DE_NO_MONTAJE:
        raise _error(422, "sin_motivo", "Elegí por qué no se pudo, así queda claro qué resolver.")
    a = MontajeDePlanograma(version_id=version_id, estado=estado, motivo=motivo, nota=_texto(e.get("nota")),
                            avisado_por=avisado_por)
    db.add(a)
    db.flush()
    return a


def revisar(db: Session, version_id: int, e: dict, actor: str) -> RevisionDePlanograma:
    """Lo que dice quien revisó. «No coincide» pide al menos un número (o
    «otra cosa», que pide la nota); «coincide» sin foto nueva pide haberla
    visto en la tienda."""
    _v, pl, estado_version = _estado_de_la_version(db, version_id)
    if estado_version == "reemplazada":
        raise _error(409, "reemplazada", "Esta versión ya fue reemplazada: se revisa la que rige.")
    resultado = e.get("resultado")
    if resultado not in RESULTADOS_DE_REVISION:
        raise _error(422, "resultado_invalido", "La revisión es «coincide» o «no coincide».")
    nota = _texto(e.get("nota"))
    otra_cosa = bool(e.get("otra_cosa")) and resultado == "no_coincide"
    numeros: list[int] = []
    if resultado == "no_coincide":
        total = len(pg._piezas_de(db, pl, version_id))
        crudos = e.get("numeros") or []
        if any(not isinstance(n, int) or isinstance(n, bool) or n < 1 or n > total for n in crudos):
            raise _error(422, "numero_invalido", f"Los números van del 1 al {total}, como en la guía.")
        numeros = sorted(set(crudos))
        if not numeros and not otra_cosa:
            raise _error(422, "sin_numeros", "Tocá los números que quedaron mal (o «Otra cosa»).")
        if otra_cosa and not nota:
            raise _error(422, "sin_nota", "Con «Otra cosa», escribí qué hay que corregir.")
    avisos, revisiones = _ultimos(db, [version_id])
    a, r = avisos.get(version_id), revisiones.get(version_id)
    en_la_tienda = bool(e.get("en_la_tienda"))
    if resultado == "coincide" and not en_la_tienda:
        q = db.query(FotoDeGuia.id).filter(FotoDeGuia.version_id == version_id)
        if r is not None:
            q = q.filter(FotoDeGuia.subida_en > r.revisada_en)
        if q.count() == 0:
            raise _error(422, "sin_foto", "No hay foto nueva: sólo se da por buena si la viste en la tienda.")
    rev = RevisionDePlanograma(
        version_id=version_id, montaje_id=a.id if a is not None else None, resultado=resultado,
        numeros_json=json.dumps(numeros), otra_cosa=int(otra_cosa), nota=nota, en_la_tienda=int(en_la_tienda),
        guia_reenviada=0, revisada_por=actor,
    )
    db.add(rev)
    db.flush()
    return rev


def texto_de_la_correccion(numeros: list[int], otra_cosa: bool, nota: Optional[str]) -> str:
    """«Los números 2 y 3 · Halloween va a la derecha…» (para el correo)."""
    partes = []
    if numeros:
        if len(numeros) == 1:
            partes.append(f"El número {numeros[0]}")
        else:
            partes.append("Los números " + ", ".join(str(n) for n in numeros[:-1]) + f" y {numeros[-1]}")
    elif otra_cosa:
        partes.append("Otra cosa")
    if nota:
        partes.append(nota)
    return " · ".join(partes)
