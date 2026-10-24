"""Planogramas con «destinos» (fase 2 de la distribución, 2026-10-24).

La misma cara de piezas de «Distribuir esta cara», pero las piezas son
DESTINOS —una categoría, la marca propia, una promoción…— con el % que quiera
quien planifica. Sirve para los muebles que no se venden y para lo libre de los
que sí: lo vendido manda. Ningún contrato ficticio: un destino no tiene precio,
proveedor ni fechas; las fechas son de la VERSIÓN que se publica.

Las decisiones del dueño (2026-10-24):

· los tipos de destino: marca propia, categoría, producto o grupo, promoción y
  otro (``models/planogramas.TIPOS_DE_DESTINO``);
· lo libre de un mueble que se vende SÍ se planifica: las piezas con contrato
  vienen bloqueadas (su lugar confirmado no se toca) y lo contratado que todavía
  no se ubicó queda guardado (su % no se usa);
· publica quien administra, con la opción de dejar publicar también al equipo
  (``ajustes_de_planograma.quien_publica``). El equipo planifica sólo muebles
  internos: un mueble que se vende muestra contratos, y el trabajador nunca ve
  lo comercial (D7 de las participaciones);
· al vencer el «hasta» de una versión, sigue vigente la última que se publicó,
  con el recordatorio de cuánto hace que venció.

Lo que NO hace un planograma: no frena una venta. Si después de publicar se
vende la cara entera o se ubica una marca encima de un destino, la versión
vigente lo dice («Lo vendido cambió») y se corrige con la siguiente.

Las cuentas son las de las zonas (``zonas_geometria``: el % sobre lo que se
vende, exacto y gemelo del navegador) y las de la capacidad
(``reglas_participacion``: qué cuenta cada día y el pico de un período).

Ninguna función hace commit: el router anota la bitácora y hace commit.
"""
from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.fechas import hoy
from app.models.models import Supplier
from app.models.planogramas import (
    COLORES_DE_DESTINO, QUIEN_PUBLICA, TIPOS_DE_DESTINO, AjusteDePlanograma, Destino, PiezaDePlanograma,
    Planograma, VersionDePlanograma,
)
from app.services import reglas_participacion as reglas
from app.services import zonas_geometria as geo
from app.services.layout_lookup import PlanoIndexado, caras_de, normalizar, sin_prefijo_de_sede
from app.services.participaciones import Cara, _armar_cara, _error, _iso, fisicos_de, leer

_SIN_FIN = date(9999, 12, 31)
#: Cuántas piezas puede tener una cara (las zonas de una distribución: 60).
MAX_PIEZAS = geo.MAX_ZONAS_POR_CARA
CLAVE_QUIEN_PUBLICA = "quien_publica"

_TIPO_LEGIBLE = {"marca_propia": "Marca propia", "categoria": "Categoría", "producto": "Producto o grupo",
                 "promocion": "Promoción", "otro": "Otro"}


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


# ─── Quién puede ──────────────────────────────────────────────────────────────


def quien_publica(db: Session) -> str:
    fila = db.query(AjusteDePlanograma).filter(AjusteDePlanograma.clave == CLAVE_QUIEN_PUBLICA).first()
    return fila.valor if fila is not None and fila.valor in QUIEN_PUBLICA else "admin"


def poner_quien_publica(db: Session, valor: str, actor: str) -> None:
    if valor not in QUIEN_PUBLICA:
        raise _error(422, "quien_publica", "Elegí «admin» o «equipo».")
    fila = db.query(AjusteDePlanograma).filter(AjusteDePlanograma.clave == CLAVE_QUIEN_PUBLICA).first()
    if fila is None:
        db.add(AjusteDePlanograma(clave=CLAVE_QUIEN_PUBLICA, valor=valor, actualizado_por=actor))
    else:
        fila.valor = valor
        fila.actualizado_en = _ahora()
        fila.actualizado_por = actor
    db.flush()


def puede_planificar(db: Session, rol: str, cara: Optional[Cara] = None) -> bool:
    """Quien administra, siempre. El equipo, sólo si la dueña lo habilitó y
    sólo en un mueble interno (un mueble que se vende muestra contratos)."""
    if rol == "admin":
        return True
    if rol != "worker" or quien_publica(db) != "equipo":
        return False
    return cara is None or not cara.comercializable


def exigir_que_puede(db: Session, rol: str, cara: Optional[Cara] = None) -> None:
    if puede_planificar(db, rol, cara):
        return
    if rol == "worker" and cara is not None and cara.comercializable:
        raise _error(403, "solo_administracion", "Un mueble que se vende lo planifica sólo quien administra.")
    raise _error(403, "solo_administracion", "Sólo quien administra planifica y publica.")


def exigir_lectura(rol: str, cara: Cara) -> None:
    """El equipo ve los planogramas de los muebles internos (lo que hay que
    montar); los de un mueble que se vende llevan contratos: sólo
    administración."""
    if rol != "admin" and cara.comercializable:
        raise _error(403, "solo_administracion", "Un mueble que se vende lo planifica sólo quien administra.")


# ─── La cara ──────────────────────────────────────────────────────────────────


def resolver(db: Session, sede: str, fixture_id: str, letra: str, plano: Optional[PlanoIndexado] = None) -> Cara:
    """La cara por el mueble del plano (su ``id``, que no cambia al
    renombrarlo) y la letra."""
    s = normalizar(sede)
    if not s or not fixture_id:
        raise _error(422, "cara_vacia", "Falta la sede o el mueble.")
    if letra not in ("A", "B"):
        raise _error(422, "cara_vacia", "La cara es A o B.")
    plano = plano or PlanoIndexado(db)
    f = next((x for x in plano.de_sede(s) if str(x.get("id")) == str(fixture_id)), None)
    if f is None:
        raise _error(404, "sin_mueble", f"Ese mueble ya no está en el plano de {s}.")
    if letra == "B" and caras_de(f) != 2:
        raise _error(409, "sin_cara_b", "Este mueble tiene una sola cara.")
    cara = _armar_cara(s, f, letra)
    if cara.superficie is None:
        raise _error(409, "sin_superficie", "Este tipo de mueble todavía no tiene una cara para planificar.")
    return cara


def _nombre_de_cara(cara: Cara) -> str:
    """«GON-12 · cara A» (sin la sede ni la «-B» del código)."""
    base = cara.corto[:-2] if cara.letra == "B" and cara.corto.endswith("-B") else cara.corto
    return f"{base} · cara {cara.letra}"


# ─── Lo vendido de la cara ────────────────────────────────────────────────────


@dataclass
class Vendido:
    """Lo comercial de la cara desde hoy: lo vendido ENTERO (o por partes, o
    reservado entero) con sus fechas, y las participaciones que cuentan, cada
    una con su lugar confirmado (si tiene) y sus intervalos."""
    entera: list            # [{"desde", "hasta"}]
    participaciones: list   # [{"space_id", "nombre", "pb", "intervalos", "poligonos"}]

    @property
    def vacio(self) -> bool:
        return not self.entera and not self.participaciones


def _cruza(intervalos: list, desde: date, hasta: date) -> bool:
    return any(i["desde"] <= hasta and desde <= i["hasta"] for i in intervalos)


def vendido_de(db: Session, cara: Cara, dia: date) -> Vendido:
    if not cara.comercializable:
        return Vendido([], [])
    entera = [{"desde": max(f["desde"], dia), "hasta": f["hasta"]} for f in fisicos_de(db, cara, dia, _SIN_FIN)]
    participaciones = []
    if cara.por_participacion:
        datos = leer(db, cara.codigo)
        zonas_por_s: dict = {}
        dist = datos.distribucion
        if dist is not None and dist.fixture_id == cara.fixture_id:
            for z in datos.capas.get("confirmada", []):
                zonas_por_s.setdefault(z.participacion_space_id, []).append(json.loads(z.vertices_json))
        ids = {t.get("supplier_id") for ts in datos.por_s.values() for t in ts if t.get("supplier_id")}
        proveedores = {s.id: s.name for s in db.query(Supplier).filter(Supplier.id.in_(ids or [-1])).all()}
        for s, ts in sorted(datos.por_s.items()):
            I = reglas.intervalos_que_cuentan(ts, [], dia)
            I = [i for i in I if i["hasta"] >= dia]
            if not I:
                continue
            t = max(ts, key=lambda x: (x.get("desde") or dia, x["id"]))
            prov = proveedores.get(t.get("supplier_id")) or "Sin proveedor"
            marca = (t.get("marca") or "").strip()
            participaciones.append({
                "space_id": s, "nombre": f"{prov} · {marca}" if marca else prov,
                "pb": max(i["pb"] for i in I),
                "intervalos": [{"desde": max(i["desde"], dia), "hasta": i["hasta"], "pb": i["pb"]} for i in I],
                "poligonos": zonas_por_s.get(s, []),
            })
    return Vendido(entera, participaciones)


# ─── La revisión de unas piezas ───────────────────────────────────────────────


def _problema(codigo: str, frase: str, destinos: list) -> dict:
    return {"codigo": codigo, "frase": frase, "destinos": destinos}


def revisar(cara: Cara, piezas: list[dict], destinos: dict, vendido: Vendido, desde: date,
            hasta: Optional[date], *, para_publicar: bool) -> dict:
    """Qué está mal en estas piezas para regir de ``desde`` a ``hasta`` (None:
    sin fin). ``piezas``: ``[{"destino_id", "pb", "vertices"}]`` (vertices None:
    sin ubicar). Devuelve ``{"errores", "dibujado"}``: los problemas en
    castellano (con los ``destino_id`` que nombran) y el % dibujado de cada
    destino. En un borrador (``para_publicar`` False) que falte ubicar una
    pieza no es un error: es trabajo pendiente."""
    sup = cara.superficie
    W, H, E = sup["ancho"], sup["alto"], sup["exclusiones"]
    fin = hasta or _SIN_FIN
    nombre = lambda d: destinos[d]["nombre"] if d in destinos else "Un destino"  # noqa: E731
    errores = []
    dibujado = {}
    limpias = {}
    vistos = set()
    for p in piezas:
        d = p["destino_id"]
        if d in vistos:
            errores.append(_problema("DESTINO_REPETIDO", f"{nombre(d)} está dos veces en la cara: dejá una sola pieza.", [d]))
            continue
        vistos.add(d)
        if p.get("vertices") is None:
            dibujado[d] = 0
            if para_publicar:
                errores.append(_problema("SIN_UBICAR", f"Falta ubicar {nombre(d)} en la cara.", [d]))
            continue
        v, codigo = geo.validar_zona(p["vertices"], W, H)
        if codigo is not None:
            dibujado[d] = 0
            errores.append(_problema(codigo, f"La pieza de {nombre(d)} no tiene una forma que sirva: volvé a ubicarla.", [d]))
            continue
        limpias[d] = v
        dibujado[d] = geo.dibujado_pb([v], E)
        if dibujado[d] != p["pb"]:
            falta = p["pb"] - dibujado[d]
            errores.append(_problema(
                "PIEZA_FALTA" if falta > 0 else "PIEZA_SOBRA",
                f"{nombre(d)} es de {reglas.pct(p['pb'])} y tiene {reglas.pct(dibujado[d])} dibujado "
                f"({'le falta' if falta > 0 else 'sobra'} {reglas.pct(abs(falta))}).", [d]))
    # Dos destinos no se pisan (más de 1 cm², como dos marcas).
    ds = sorted(limpias)
    for i in range(len(ds)):
        for j in range(i + 1, len(ds)):
            a, b = ds[i], ds[j]
            if geo.area_cubierta([limpias[a]], E, [limpias[b]]) * W * H > geo.AREA_MINIMA_M2:
                errores.append(_problema("SOLAPE", f"{nombre(a)} y {nombre(b)} se pisan.", [a, b]))
    # Lo vendido manda: una venta entera en esas fechas no deja lugar.
    enteras = [e for e in vendido.entera if e["desde"] <= fin and desde <= e["hasta"]]
    if enteras:
        e = min(enteras, key=lambda x: x["desde"])
        a = max(e["desde"], desde)
        errores.append(_problema(
            "VENDIDA_ENTERA",
            f"La cara está vendida entera desde el {reglas._fecha_corta(a)} (hasta el {reglas._fecha_corta(e['hasta'])}): "
            f"en esas fechas no hay lugar para planificar. Ponele «hasta» antes de esa fecha.", []))
    # Las piezas no pisan el lugar confirmado de una marca que rige en esas fechas.
    cuentan = [p for p in vendido.participaciones if _cruza(p["intervalos"], desde, fin)]
    for pv in cuentan:
        if not pv["poligonos"]:
            continue
        for d in ds:
            if geo.area_cubierta([limpias[d]], E, pv["poligonos"]) * W * H > geo.AREA_MINIMA_M2:
                errores.append(_problema("PISA_LO_VENDIDO", f"{nombre(d)} pisa el lugar de {pv['nombre']}.", [d]))
    # Lo vendido y lo planificado no pasan de la cara entera (el pico del período).
    if cuentan:
        I = [i for pv in cuentan for i in pv["intervalos"]]
        pico, dia_pico = reglas.pico(I, desde, fin)
        suma = sum(p["pb"] for p in piezas if p["destino_id"] in vistos)
        if pico + suma > reglas.CARA_ENTERA_PB:
            errores.append(_problema(
                "NO_ALCANZA",
                f"Lo vendido ({reglas.pct(pico)}"
                f"{f', el {reglas._fecha_corta(dia_pico)}' if dia_pico else ''}) y los destinos ({reglas.pct(suma)}) "
                f"pasan de la cara entera: queda {reglas.pct(max(0, reglas.CARA_ENTERA_PB - pico))} para planificar.", []))
    elif not enteras:
        suma = sum(p["pb"] for p in piezas if p["destino_id"] in vistos)
        if suma > reglas.CARA_ENTERA_PB:
            errores.append(_problema("NO_ALCANZA", f"Los destinos suman {reglas.pct(suma)}: pasan de la cara entera.", []))
    return {"errores": errores, "dibujado": dibujado}


# ─── Destinos ─────────────────────────────────────────────────────────────────


def destino_out(d: Destino) -> dict:
    return {"id": d.id, "sede": d.sede, "nombre": d.nombre, "tipo": d.tipo, "color": d.color,
            "como_se_monta": d.como_se_monta, "codigo_externo": d.codigo_externo, "en_la_sede": bool(d.en_la_sede)}


def _foto(d: Destino) -> dict:
    return {k: v for k, v in destino_out(d).items() if k not in ("sede", "en_la_sede")}


def _texto(v: Optional[str], tope: int) -> Optional[str]:
    limpio = (v or "").strip()
    return limpio[:tope] or None


def _validar_destino(e: dict, parcial: bool = False) -> dict:
    fuera = {}
    if "nombre" in e or not parcial:
        nombre = _texto(e.get("nombre"), 120)
        if not nombre:
            raise _error(422, "destino_sin_nombre", "Ponele un nombre al destino.")
        fuera["nombre"] = nombre
    if "tipo" in e or not parcial:
        if e.get("tipo") not in TIPOS_DE_DESTINO:
            raise _error(422, "destino_tipo", "Elegí qué es: marca propia, categoría, producto o grupo, promoción u otro.")
        fuera["tipo"] = e["tipo"]
    if "color" in e or not parcial:
        if e.get("color") not in COLORES_DE_DESTINO:
            raise _error(422, "destino_color", "Elegí un color de la lista.")
        fuera["color"] = e["color"]
    if "como_se_monta" in e:
        fuera["como_se_monta"] = _texto(e.get("como_se_monta"), 2000)
    if "codigo_externo" in e:
        fuera["codigo_externo"] = _texto(e.get("codigo_externo"), 120)
    if "en_la_sede" in e:
        fuera["en_la_sede"] = 1 if e.get("en_la_sede") else 0
    return fuera


def crear_destino(db: Session, e: dict, actor: str) -> Destino:
    s = normalizar(e.get("sede"))
    if not s:
        raise _error(422, "cara_vacia", "Falta la sede.")
    campos = _validar_destino(e)
    d = Destino(sede=s, creado_por=actor, actualizado_por=actor, **{"en_la_sede": 0, **campos})
    db.add(d)
    db.flush()
    return d


def cambiar_destino(db: Session, destino_id: int, e: dict, actor: str) -> Destino:
    d = db.get(Destino, destino_id)
    if d is None:
        raise _error(404, "sin_destino", "Ese destino ya no existe.")
    for k, v in _validar_destino(e, parcial=True).items():
        setattr(d, k, v)
    d.actualizado_en = _ahora()
    d.actualizado_por = actor
    db.flush()
    return d


def destinos_de_la_sede(db: Session, sede: str) -> list[dict]:
    s = normalizar(sede)
    filas = db.query(Destino).filter(Destino.sede == s, Destino.en_la_sede == 1).all()
    filas.sort(key=lambda d: (_para_ordenar(d.nombre), d.id))
    return [destino_out(d) for d in filas]


def _para_ordenar(texto: str) -> str:
    """«Éxito» va con la E, no después de la Z."""
    return "".join(c for c in unicodedata.normalize("NFKD", texto or "") if not unicodedata.combining(c)).casefold()


# ─── El planograma de una cara ────────────────────────────────────────────────


def _planograma(db: Session, cara: Cara) -> Optional[Planograma]:
    return (db.query(Planograma)
            .filter(Planograma.sede == cara.sede, Planograma.fixture_id == cara.fixture_id,
                    Planograma.cara == cara.letra).first())


def _version_vieja(actual: Optional[int]) -> Exception:
    return _error(409, "version_vieja",
                  "Otra sesión cambió este planograma mientras lo editabas: traé lo nuevo y volvé a intentar.",
                  version_actual=actual)


def _para_escribir(db: Session, cara: Cara, version: int, actor: str) -> Planograma:
    """El planograma de la cara con la versión optimista comprobada (0: todavía
    no hay) y ya subida en uno."""
    pl = _planograma(db, cara)
    if pl is None:
        if version != 0:
            raise _version_vieja(0)
        pl = Planograma(sede=cara.sede, fixture_id=cara.fixture_id, cara=cara.letra, codigo=cara.codigo,
                        version=1, actualizado_por=actor)
        db.add(pl)
        try:
            db.flush()
        except IntegrityError:
            raise _error(409, "reintentar", "Otra sesión empezó este planograma al mismo tiempo. Probá de nuevo.")
        return pl
    r = db.execute(
        update(Planograma)
        .where(Planograma.id == pl.id, Planograma.version == version)
        .values(version=Planograma.version + 1, actualizado_en=_ahora(), actualizado_por=actor, codigo=cara.codigo)
        .execution_options(synchronize_session=False)
    )
    if r.rowcount != 1:
        raise _version_vieja(db.query(Planograma.version).filter(Planograma.id == pl.id).scalar())
    db.refresh(pl)
    return pl


def _piezas_de(db: Session, pl: Planograma, version_id: Optional[int]) -> list[PiezaDePlanograma]:
    q = db.query(PiezaDePlanograma).filter(PiezaDePlanograma.planograma_id == pl.id)
    q = q.filter(PiezaDePlanograma.version_id.is_(None)) if version_id is None else \
        q.filter(PiezaDePlanograma.version_id == version_id)
    return q.order_by(PiezaDePlanograma.orden, PiezaDePlanograma.id).all()


def pieza_out(p: PiezaDePlanograma) -> dict:
    return {"destino_id": p.destino_id, "pb": p.puntos_basicos,
            "vertices": json.loads(p.vertices_json) if p.vertices_json else None,
            "destino": json.loads(p.foto_json) if p.foto_json else None}


def _crudas(piezas: list[PiezaDePlanograma]) -> list[dict]:
    return [{"destino_id": p.destino_id, "pb": p.puntos_basicos,
             "vertices": json.loads(p.vertices_json) if p.vertices_json else None} for p in piezas]


def _validar_entrada(db: Session, cara: Cara, piezas: list[dict]) -> dict:
    """Lo estructural de unas piezas que llegan (los topes, los destinos de la
    sede); lo geométrico lo dice ``revisar``. Devuelve los destinos por id."""
    if len(piezas) > MAX_PIEZAS:
        raise _error(422, "demasiadas_piezas", f"Una cara tiene hasta {MAX_PIEZAS} piezas.")
    if not geo.dentro_de_los_topes([{"vertices": p.get("vertices") or []} for p in piezas]):
        raise _error(422, "demasiados_puntos", "Las piezas tienen demasiados puntos.")
    ids = {p["destino_id"] for p in piezas}
    destinos = {d.id: d for d in db.query(Destino).filter(Destino.id.in_(ids or [-1])).all()}
    for i in ids:
        d = destinos.get(i)
        if d is None or d.sede != cara.sede:
            raise _error(422, "destino_ajeno", "Uno de los destinos no es de esta sede.")
    for p in piezas:
        if p.get("vertices") is not None and not geo._son_pares_finitos(p["vertices"]):
            raise _error(422, "ZONA_MALFORMADA", "Una pieza llegó con una forma rota.")
    return destinos


def guardar_borrador(db: Session, e: dict, actor: str, rol: str) -> tuple[Cara, Planograma]:
    cara = resolver(db, e["sede"], e["fixture_id"], e["cara"])
    exigir_que_puede(db, rol, cara)
    _validar_entrada(db, cara, e["piezas"])
    pl = _para_escribir(db, cara, e["version"], actor)
    db.query(PiezaDePlanograma).filter(PiezaDePlanograma.planograma_id == pl.id,
                                       PiezaDePlanograma.version_id.is_(None)).delete(synchronize_session=False)
    for k, p in enumerate(e["piezas"]):
        v = p.get("vertices")
        if v is not None:
            limpio, codigo = geo.validar_zona(v, cara.superficie["ancho"], cara.superficie["alto"])
            v = limpio if codigo is None else geo.cuantizar(v)
        db.add(PiezaDePlanograma(planograma_id=pl.id, version_id=None, destino_id=p["destino_id"],
                                 puntos_basicos=p["pb"], vertices_json=json.dumps(v) if v is not None else None,
                                 orden=k))
    pl.borrador_en = _ahora()
    pl.borrador_por = actor
    db.flush()
    return cara, pl


def descartar_borrador(db: Session, e: dict, actor: str, rol: str) -> tuple[Cara, Planograma]:
    cara = resolver(db, e["sede"], e["fixture_id"], e["cara"])
    exigir_que_puede(db, rol, cara)
    pl = _para_escribir(db, cara, e["version"], actor)
    db.query(PiezaDePlanograma).filter(PiezaDePlanograma.planograma_id == pl.id,
                                       PiezaDePlanograma.version_id.is_(None)).delete(synchronize_session=False)
    pl.borrador_en = None
    pl.borrador_por = None
    db.flush()
    return cara, pl


@dataclass
class Publicada:
    cara: Cara
    planograma: Planograma
    version: VersionDePlanograma
    detalle: str


def publicar(db: Session, e: dict, actor: str, rol: str) -> Publicada:
    """El borrador pasa a ser la versión siguiente: la instrucción oficial de
    montaje desde ``rige_desde``. Se revisa estricto (todo ubicado, cada pieza
    con su % justo, sin pisarse, sin pisar lo vendido en esas fechas); con un
    problema, 409 ``planograma_invalido`` y el borrador queda como estaba."""
    dia = hoy()
    cara = resolver(db, e["sede"], e["fixture_id"], e["cara"])
    exigir_que_puede(db, rol, cara)
    desde, hasta = e["rige_desde"], e.get("hasta")
    if desde < dia:
        raise _error(422, "rige_desde_pasado", "«Rige desde» no puede ser antes de hoy.")
    if hasta is not None and hasta < desde:
        raise _error(422, "hasta_antes", "«Hasta» no puede ser antes de «Rige desde».")
    pl = _planograma(db, cara)
    if pl is None or pl.borrador_en is None:
        raise _error(409, "sin_borrador", "No hay nada nuevo para publicar: cambiá algo de la cara primero.")
    if pl.version != e["version"]:
        raise _version_vieja(pl.version)
    piezas = _piezas_de(db, pl, None)
    if not piezas:
        raise _error(409, "sin_piezas", "Agregá al menos un destino antes de publicar.")
    destinos = {d.id: d for d in db.query(Destino).filter(Destino.id.in_([p.destino_id for p in piezas])).all()}
    juicio = revisar(cara, _crudas(piezas), {i: destino_out(d) for i, d in destinos.items()},
                     vendido_de(db, cara, dia), desde, hasta, para_publicar=True)
    if juicio["errores"]:
        n = len(juicio["errores"])
        raise _error(409, "planograma_invalido",
                     f"El planograma tiene {n} problema{'' if n == 1 else 's'}: corregilo antes de publicar.",
                     errores=juicio["errores"])
    pl = _para_escribir(db, cara, e["version"], actor)
    numero = (db.query(VersionDePlanograma.numero).filter(VersionDePlanograma.planograma_id == pl.id)
              .order_by(VersionDePlanograma.numero.desc()).limit(1).scalar() or 0) + 1
    v = VersionDePlanograma(planograma_id=pl.id, numero=numero, rige_desde=desde, hasta=hasta, firma=cara.firma,
                            publicada_por=actor)
    db.add(v)
    db.flush()
    for p in piezas:
        p.version_id = v.id
        p.foto_json = json.dumps(_foto(destinos[p.destino_id]), ensure_ascii=False)
    pl.borrador_en = None
    pl.borrador_por = None
    db.flush()
    nombres = ", ".join(f"{destinos[p.destino_id].nombre} {reglas.pct(p.puntos_basicos)}" for p in piezas)
    vigencia = f"desde el {reglas._fecha_corta(desde)}" + (f" hasta el {reglas._fecha_corta(hasta)}" if hasta else "")
    detalle = f"{_nombre_de_cara(cara)} · versión {numero} · {vigencia} · {nombres}"
    return Publicada(cara, pl, v, detalle)


# ─── Lo que se lee ────────────────────────────────────────────────────────────


def _estados(versiones: list[VersionDePlanograma], dia: date) -> tuple[Optional[VersionDePlanograma], dict]:
    """La vigente (la última publicada que ya rige; si venció su «hasta», sigue
    siendo ella) y el estado de cada versión: vigente, programada (rige más
    adelante y nada posterior la tapa) o reemplazada."""
    vigente = None
    for v in sorted(versiones, key=lambda x: x.numero):
        if v.rige_desde <= dia:
            vigente = v
    estados = {}
    for v in versiones:
        if vigente is not None and v.id == vigente.id:
            estados[v.id] = "vigente"
        elif v.rige_desde > dia and (vigente is None or v.numero > vigente.numero) and not any(
                o.numero > v.numero and o.rige_desde <= v.rige_desde for o in versiones):
            estados[v.id] = "programada"
        else:
            estados[v.id] = "reemplazada"
    return vigente, estados


def version_out(v: VersionDePlanograma, estado: str, dia: date, cara: Cara,
                piezas: Optional[list[PiezaDePlanograma]] = None) -> dict:
    vencida = (dia - v.hasta).days if (estado == "vigente" and v.hasta is not None and v.hasta < dia) else None
    fuera = {"id": v.id, "numero": v.numero, "rige_desde": v.rige_desde, "hasta": v.hasta, "estado": estado,
             "publicada_en": _iso(v.publicada_en), "publicada_por": v.publicada_por,
             "vencida_hace_dias": vencida,
             "para_revisar": estado == "vigente" and v.firma is not None and v.firma != cara.firma}
    if piezas is not None:
        fuera["piezas"] = [pieza_out(p) for p in piezas]
    return fuera


def bloque(db: Session, cara: Cara, rol: str) -> dict:
    """Todo lo de la cara para planificarla: la superficie, lo vendido (sólo a
    quien administra), el borrador, la versión vigente, la programada, la
    lista de versiones y los destinos que se nombran."""
    dia = hoy()
    pl = _planograma(db, cara)
    vendido = vendido_de(db, cara, dia)
    versiones = (db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id)
                 .order_by(VersionDePlanograma.numero.desc()).all()) if pl is not None else []
    vigente, estados = _estados(versiones, dia)
    borrador = None
    usados: set = set()
    if pl is not None and pl.borrador_en is not None:
        piezas = _piezas_de(db, pl, None)
        usados |= {p.destino_id for p in piezas}
        borrador = {"en": _iso(pl.borrador_en), "por": pl.borrador_por, "piezas": [pieza_out(p) for p in piezas]}
    vig_out = None
    if vigente is not None:
        pv = _piezas_de(db, pl, vigente.id)
        usados |= {p.destino_id for p in pv}
        vig_out = version_out(vigente, "vigente", dia, cara, pv)
        # Lo vendido cambió después de publicar: se dice, no se frena la venta.
        fotos = {p.destino_id: (json.loads(p.foto_json) if p.foto_json else {"nombre": "Un destino"}) for p in pv}
        desde = max(vigente.rige_desde, dia)
        if vigente.hasta is None or vigente.hasta >= dia:
            j = revisar(cara, _crudas(pv), fotos, vendido, desde, vigente.hasta, para_publicar=True)
            vig_out["choca_con_lo_vendido"] = [p["frase"] for p in j["errores"]
                                              if p["codigo"] in ("VENDIDA_ENTERA", "PISA_LO_VENDIDO", "NO_ALCANZA")]
        else:
            vig_out["choca_con_lo_vendido"] = []
    programadas = []
    for v in versiones:
        if estados[v.id] == "programada":
            pv = _piezas_de(db, pl, v.id)
            usados |= {p.destino_id for p in pv}
            programadas.append(version_out(v, "programada", dia, cara, pv))
    destinos = {d.id: destino_out(d) for d in db.query(Destino).filter(Destino.id.in_(usados or [-1])).all()}
    revision = None
    if borrador is not None:
        revision = revisar(cara, [{k: p[k] for k in ("destino_id", "pb", "vertices")} for p in borrador["piezas"]],
                           destinos, vendido, dia, None, para_publicar=False)
    f = cara.fixture or {}
    admin = rol == "admin"
    return {
        "sede": cara.sede, "hoy": dia, "cara": cara.letra, "codigo_cara": cara.codigo,
        "fixture": {"id": cara.fixture_id, "code": f.get("code"), "label": f.get("label"), "type": f.get("type"),
                    "caras": caras_de(f)},
        "comercializable": cara.comercializable, "por_participacion": cara.por_participacion,
        "superficie": cara.superficie, "firma": cara.firma,
        "permisos": {"planificar": puede_planificar(db, rol, cara), "quien_publica": quien_publica(db)},
        "vendido": {
            "entera": vendido.entera,
            "participaciones": [{
                "space_id": p["space_id"], "nombre": p["nombre"] if admin else "Vendido", "pb": p["pb"],
                "intervalos": p["intervalos"], "poligonos": p["poligonos"],
            } for p in vendido.participaciones],
        },
        "planograma": {
            "version": pl.version if pl is not None else 0,
            "borrador": borrador,
            "vigente": vig_out,
            "programadas": programadas,
            "versiones": [version_out(v, estados[v.id], dia, cara) for v in versiones],
        },
        "destinos": destinos,
        "biblioteca": destinos_de_la_sede(db, cara.sede),
        "revision": revision,
    }


def leer_version(db: Session, version_id: int, rol: str) -> dict:
    v = db.get(VersionDePlanograma, version_id)
    if v is None:
        raise _error(404, "sin_version", "Esa versión no existe.")
    pl = db.get(Planograma, v.planograma_id)
    cara = resolver(db, pl.sede, pl.fixture_id, pl.cara)
    exigir_lectura(rol, cara)
    versiones = db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id).all()
    _vig, estados = _estados(versiones, hoy())
    return version_out(v, estados[v.id], hoy(), cara, _piezas_de(db, pl, v.id))


def resumen(db: Session, sede: str, rol: str) -> list[dict]:
    """El estado del planograma de cada cara de la sede que tiene uno (para el
    plano): borrador, vigente (o vencida), programada, y si el mueble cambió."""
    s = normalizar(sede)
    dia = hoy()
    plano = PlanoIndexado(db)
    muebles = {str(f.get("id")): f for f in plano.de_sede(s)}
    fuera = []
    for pl in db.query(Planograma).filter(Planograma.sede == s).order_by(Planograma.id).all():
        f = muebles.get(pl.fixture_id)
        if f is None:
            continue
        cara = _armar_cara(s, f, pl.cara)
        if rol != "admin" and cara.comercializable:
            continue
        versiones = db.query(VersionDePlanograma).filter(VersionDePlanograma.planograma_id == pl.id).all()
        vigente, estados = _estados(versiones, dia)
        programada = min((v for v in versiones if estados[v.id] == "programada"), key=lambda v: v.rige_desde,
                         default=None)
        fuera.append({
            "fixture_id": pl.fixture_id, "cara": pl.cara, "codigo": sin_prefijo_de_sede(cara.codigo, s),
            "borrador": pl.borrador_en is not None,
            "vigente": version_out(vigente, "vigente", dia, cara) if vigente is not None else None,
            "programada": version_out(programada, "programada", dia, cara) if programada is not None else None,
        })
    return fuera


def tipo_legible(tipo: str) -> str:
    return _TIPO_LEGIBLE.get(tipo, "Otro")
