"""Los contratos que viven SÓLO en el JSON del layout, y cómo pasarlos a la base.

Es la otra mitad del desfase, y la que no se puede ver desde el navegador: la
fusión del store REEMPLAZA lo comercial con lo que dice la base, así que un
contrato que sólo está en el JSON desaparece antes de que ninguna pantalla lo
mire. Sólo se ve desde acá, leyendo el snapshot crudo.

── De dónde salen ───────────────────────────────────────────────────────────

El panel del plano 2D tuvo campos de contrato editables que escribían el JSON
sin tocar la base. Se quitaron justamente por esto, pero lo que se cargó así
sigue ahí: no sale en ningún reporte, no genera aviso de vencimiento y no existe
para nada que consulte la base. Es plata y es un compromiso con un proveedor que
el sistema no sabe que tiene.

── Qué NO hace ──────────────────────────────────────────────────────────────

**No inventa lo que el JSON no tiene.** Un contrato del plano sin fechas o sin
proveedor no se puede volver una fila de ``space_leases`` —esas columnas son
obligatorias— así que se REPORTA y se deja afuera. Son casos para mirar a mano;
rellenarlos con un valor plausible sería fabricar un contrato.

**No borra nada del JSON.** Eso pasa solo, en el primer guardado de esa sede:
el servidor ya no acepta esos campos.

**Es idempotente.** Un espacio que ya tiene contrato vivo en la base no se toca,
así que correrlo dos veces no duplica nada.
"""
import json
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from app.fechas import hoy as hoy_en_colombia
from app.models.models import (
    LayoutSnapshot, Space, SpaceLease, SpaceStatus, Supplier,
)
from app.services.layout_lookup import _full_code, caras_de, es_comercializable


@dataclass
class ContratoDelPlano:
    """Uno que se puede importar tal como está."""
    espacio: str
    sede: str
    code: str
    proveedor: str
    marca: str
    desde: str
    hasta: str
    valor: float
    observacion: str


@dataclass
class Incompleto:
    """Uno que el plano da por vendido y que la base no puede aceptar."""
    espacio: str
    sede: str
    code: str
    proveedor: str
    desde: str
    hasta: str
    motivo: str
    #: Lo que sí tiene, para poder juzgarlo sin abrir el plano.
    marca: str = ""
    valor: float = 0
    #: **No es un contrato a medias: es un «Ocupado» puesto a mano.**
    #:
    #: El plano tuvo un selector de estado que dejaba marcar un mueble como
    #: ocupado sin contrato, sin proveedor, sin fechas y sin valor. Se quitó
    #: —un espacio se ocupa vendiéndolo— pero lo que se marcó así sigue escrito
    #: en el JSON.
    #:
    #: Importa distinguirlo porque el consejo es el contrario: a un contrato a
    #: medias hay que completarle lo que falta; a esto no hay nada que
    #: completarle. Se va solo la próxima vez que se guarde ese plano, porque
    #: el servidor ya no acepta `status`. Mandar a alguien a «cargar el
    #: contrato» de esto es mandarlo a inventar nueve contratos que no existen.
    residuo: bool = False


@dataclass
class Importacion:
    importables: list[ContratoDelPlano] = field(default_factory=list)
    incompletos: list[Incompleto] = field(default_factory=list)
    #: Cuántos ya tenían su contrato en la base. Es lo que hace visible que
    #: correrlo de nuevo no duplica nada.
    ya_estaban: int = 0


def caras_vendidas(fixtures: list[dict]) -> list[tuple[str, dict]]:
    """Los espacios que el plano da por vendidos, con su contrato.

    Una góndola doble son dos espacios (``caras_de``): la cara A vive en el
    mueble y la B en ``faceB``. Un mueble que no se alquila no cuenta — y se
    pregunta con ``es_comercializable``, que mira primero el TIPO y después la
    bandera: una caja registradora marcada «ocupada» en un plano viejo no es un
    contrato, y crearle uno haría una fila que después la propia aplicación
    rechaza.
    """
    out: list[tuple[str, dict]] = []
    for f in fixtures:
        if not isinstance(f, dict):
            continue
        code = (f.get("code") or "").strip().upper()
        if not code or not es_comercializable(f):
            continue
        if (f.get("status") or "free") == "occupied":
            out.append((code, f))
        if caras_de(f) == 2:
            b = f.get("faceB") or {}
            if (b.get("status") or "free") == "occupied":
                out.append((f"{code}-B", b))
    return out


def _fecha(v) -> date | None:
    try:
        return date.fromisoformat((v or "")[:10])
    except ValueError:
        return None


def _es_residuo(cara: dict, proveedor: str, desde, hasta) -> bool:
    """¿Está marcado ocupado y no hay NADA más? Entonces no es un contrato.

    Se exige que falte todo —proveedor, las dos fechas, el valor y la marca—
    porque con cualquiera de esos datos hubo una negociación de por medio y sí
    hay algo que completar.
    """
    return (
        not proveedor
        and desde is None
        and hasta is None
        and not float(cara.get("negotiatedValue") or 0)
        and not (cara.get("brandCategory") or "").strip()
    )


def _motivo(proveedor: str, desde: date | None, hasta: date | None) -> str | None:
    """Por qué éste no se puede importar, dicho para que se pueda arreglar."""
    if not proveedor and not (desde and hasta):
        return "le falta el proveedor y las fechas"
    if not proveedor:
        return "le falta el proveedor"
    if not desde and not hasta:
        return "le faltan las dos fechas"
    if not desde:
        return "le falta la fecha de inicio"
    if not hasta:
        return "le falta la fecha de fin"
    if desde > hasta:
        return "las fechas están al revés: termina antes de empezar"
    return None


def _caras_de_los_planos(db: Session):
    """Cada cara que el JSON de algún plano da por vendida, leída del snapshot
    crudo: ``(sede, corto, completo, cara, proveedor, desde, hasta)``."""
    for snap in db.query(LayoutSnapshot).all():
        sede = (snap.sede or "").strip().upper()
        try:
            fixtures = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(fixtures, list):
            continue
        for corto, cara in caras_vendidas(fixtures):
            desde, hasta = _fecha(cara.get("startDate")), _fecha(cara.get("endDate"))
            proveedor = (cara.get("supplierName") or "").strip()
            yield sede, corto, _full_code(corto, sede), cara, proveedor, desde, hasta


def contratos_en_el_plano(db: Session) -> list[tuple[str, str, date | None, date | None]]:
    """TODOS los contratos que viven en el JSON de los planos, crudos:
    ``(código completo, proveedor, desde, hasta)``. Sin los «Ocupado» puestos a
    mano (residuo: ahí no hay contrato) y **sin** el filtro de ``revisar``, que
    da uno por importado apenas el espacio tiene en la base CUALQUIER contrato
    vivo o próximo, sin mirar de quién es ni sus fechas. Para la limpieza de
    fotos (``services/fotos_vencidas.py``) eso no alcanza: la renovación que
    vive sólo en el plano no puede quedar tapada por el contrato futuro de otro
    proveedor."""
    return [
        (completo, proveedor, desde, hasta)
        for _, _, completo, cara, proveedor, desde, hasta in _caras_de_los_planos(db)
        if not _es_residuo(cara, proveedor, desde, hasta)
    ]


def revisar(db: Session) -> Importacion:
    """Qué habría para importar. **No escribe una sola fila.**"""
    salida = Importacion()

    for sede, corto, completo, cara, proveedor, desde, hasta in _caras_de_los_planos(db):
        motivo = _motivo(proveedor, desde, hasta)
        if motivo:
            residuo = _es_residuo(cara, proveedor, desde, hasta)
            salida.incompletos.append(Incompleto(
                espacio=completo, sede=sede, code=corto,
                proveedor=proveedor,
                desde=(cara.get("startDate") or ""),
                hasta=(cara.get("endDate") or ""),
                motivo=(
                    "marcado «Ocupado» a mano en el plano, sin contrato detrás"
                    if residuo else motivo
                ),
                marca=(cara.get("brandCategory") or "").strip(),
                valor=float(cara.get("negotiatedValue") or 0),
                residuo=residuo,
            ))
            continue

        space = db.query(Space).filter(Space.code == completo).first()
        if space and (space.active_lease or space.upcoming_lease):
            salida.ya_estaban += 1
            continue

        salida.importables.append(ContratoDelPlano(
            espacio=completo, sede=sede, code=corto,
            proveedor=proveedor,
            marca=(cara.get("brandCategory") or "").strip(),
            desde=desde.isoformat(), hasta=hasta.isoformat(),
            valor=float(cara.get("negotiatedValue") or 0),
            observacion=(cara.get("observation") or "").strip(),
        ))

    return salida


def aplicar(db: Session) -> Importacion:
    """Escribir lo que `revisar` encontró. Todo en una transacción.

    Crea el `Space` y el `Supplier` que falten: un contrato del plano puede
    apuntar a un espacio que nunca tuvo fila, que es justamente por qué se
    perdería si nadie lo importa.
    """
    plan = revisar(db)
    if not plan.importables:
        return plan

    hoy = hoy_en_colombia()
    for fila in plan.importables:
        space = db.query(Space).filter(Space.code == fila.espacio).first()
        if space is None:
            space = Space(
                code=fila.espacio, svg_id=f"fix-{fila.espacio}",
                name=fila.code, zone="Sin zona",
                sede=fila.sede, area_m2=4.0, status=SpaceStatus.free,
            )
            db.add(space)
            db.flush()

        prov = db.query(Supplier).filter(Supplier.name == fila.proveedor).first()
        if prov is None:
            prov = Supplier(name=fila.proveedor)
            db.add(prov)
            db.flush()

        desde = date.fromisoformat(fila.desde)
        hasta = date.fromisoformat(fila.hasta)
        db.add(SpaceLease(
            space_id=space.id, supplier_id=prov.id,
            marca=fila.marca or None,
            start_date=desde, end_date=hasta,
            monthly_rent=fila.valor,
            is_active=True,
            notes=fila.observacion or None,
        ))
        if desde <= hoy <= hasta:
            space.status = SpaceStatus.occupied

    db.commit()
    return plan
