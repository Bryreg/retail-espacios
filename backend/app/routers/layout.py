import copy
import json
import logging
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.services.contacts import get_contacts, save_contacts
from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.fechas import hoy
from app.models.models import LayoutSnapshot, Space
from app.models.participaciones import Distribucion
from app.services import participaciones as servicio_participaciones
from app.services import reglas_participacion as reglas
from app.services.bitacora import anotar
from app.services.ciclo_participaciones import actor_de, anotar_historial
from app.services.catalogo_muebles import tipo_base
from app.services import papelera
from app.services.sede_archive import archive_sede_spaces, count_commercial_rows
from app.services.renombre_sede import (
    RenombreRechazado,
    plano_de_la_sede,
    renombrar as renombrar_la_sede,
)
from app.services.candado import tomar_candados
from app.services.catalogo_muebles import CAMPOS_DE_PARTES
from app.services.layout_lookup import (
    CAMPOS_DE_CONTRATO,
    CLAVES_DE_FICHA,
    caras_por_participacion,
    choques_nuevos,
    contratos_que_quedarian_sin_mueble,
    espacios_ofrecidos,
    medidas_imposibles,
    nombres_reservados_nuevos,
    normalizar,
    partes_que_se_moverian,
    por_participacion,
    sin_prefijo_de_sede,
)
from app.services.partes import firma_de_partes, partir_codigo
from app.services.renumeracion import (
    InvarianteRoto,
    RenumeracionBloqueada,
    aplicar as aplicar_renumeracion,
    con_candados as renumeracion_con_candados,
    nombres_anteriores,
    planificar,
)
from app.services.superficie import firma as firma_de_cara
from app.services.importar_del_plano import (
    aplicar as aplicar_importacion,
    revisar as revisar_importacion,
)
from app.schemas.layout import (
    ImportacionOut,
    LayoutIn,
    LayoutOut,
    LayoutRevision,
    LayoutSettingsIn,
    LayoutSettingsOut,
    ReferenceRatesIn,
    ReferenceRatesOut,
    RenumeracionIn,
    RenumeracionOut,
    RenumeracionSedeOut,
    SeasonWindow,
    SeasonWindowsIn,
    SeasonWindowsOut,
    nombres_propios_recortados,
)

logger = logging.getLogger(__name__)

# Every route requires a valid token; saving a layout additionally requires admin.
router = APIRouter(prefix="/layout", tags=["layout"], dependencies=[Depends(require_auth)])

# Config keys holding the shared (non-fixture) layout state.
SEDES_KEY = "layout_sedes"
CATALOG_LABELS_KEY = "layout_catalog_labels"
SETTINGS_UPDATED_KEY = "layout_settings_updated_at"
# La generación de los datos (ver `services/traspaso.py`). Se lee acá y se
# escribe sólo allá.
from app.services.traspaso import CLAVE_GENERACION  # noqa: E402
from app.services.meses import al_peso, meses_entre
from app.clientes import Cliente, cliente_del_pedido
from app.models.vender import CondicionesDeContrato
RATES_KEY = "layout_reference_rates"
RATES_UPDATED_KEY = "layout_reference_rates_updated_at"
SEASONS_KEY = "layout_season_windows"
SEASONS_UPDATED_KEY = "layout_season_windows_updated_at"

# Revisions are compared exactly: the client echoes back verbatim the string it
# received, and the JSON round-trip preserves microseconds. Sub-millisecond
# truncation is the only slack allowed, in case a backend ever rounds. An
# earlier version tolerated a whole second, which silently accepted a stale
# write made inside that window — exactly the overwrite this check exists to
# prevent.
def _truncate_ms(value: datetime) -> datetime:
    return value.replace(microsecond=(value.microsecond // 1000) * 1000)


def _to_out(snap: LayoutSnapshot) -> LayoutOut:
    return LayoutOut(
        sede=snap.sede,
        fixtures=json.loads(snap.fixtures_json or "[]"),
        updated_at=snap.updated_at,
    )


def _stored_settings_revision(db: Session) -> datetime | None:
    """The revision currently stored for the shared settings, as aware UTC."""
    raw = get_config(db, SETTINGS_UPDATED_KEY)
    if not raw:
        return None
    try:
        return _as_utc(datetime.fromisoformat(raw))
    except ValueError:
        return None


def _as_utc(value: datetime | None) -> datetime | None:
    """Normalise to aware UTC — SQLite hands back naive datetimes."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _redact_fixtures_for_worker(fixtures: list) -> None:
    """Drop negotiated amounts so non-admin roles never receive them.

    The dicts come fresh from ``json.loads`` in ``_to_out`` — mutating them
    cannot dirty the ORM session (``fixtures_json`` stays untouched).
    """
    for fixture in fixtures:
        if isinstance(fixture, dict):
            fixture.pop("negotiatedValue", None)
            face_b = fixture.get("faceB")
            if isinstance(face_b, dict):
                face_b.pop("negotiatedValue", None)
            for slot in fixture.get("slots") or []:
                if isinstance(slot, dict):
                    slot.pop("negotiatedValue", None)


def _price_map(fixtures: list) -> dict:
    """Index the stored negotiated amounts by fixture id.

    Shape: {fixture_id: {"top": value, "faceB": value, "slots": {slot_id: value}}}
    """
    index: dict = {}
    for fixture in fixtures:
        if not isinstance(fixture, dict) or not fixture.get("id"):
            continue
        entry: dict = {}
        if "negotiatedValue" in fixture:
            entry["top"] = fixture["negotiatedValue"]
        face_b = fixture.get("faceB")
        if isinstance(face_b, dict) and "negotiatedValue" in face_b:
            entry["faceB"] = face_b["negotiatedValue"]
        slots = {}
        for slot in fixture.get("slots") or []:
            if isinstance(slot, dict) and slot.get("id") and "negotiatedValue" in slot:
                slots[slot["id"]] = slot["negotiatedValue"]
        if slots:
            entry["slots"] = slots
        if entry:
            index[fixture["id"]] = entry
    return index


# Qué es «lo comercial» se define en `services/layout_lookup.py`
# (`CAMPOS_DE_CONTRATO`, importado arriba): una sola definición es el punto de
# todo esto.


def _sin_contrato(fixtures: list) -> None:
    """Saca del layout lo que es de la base, en el lugar.

    Se descarta en silencio en vez de rechazar el guardado: un cliente viejo
    —una pestaña abierta desde antes del despliegue— sigue mandando estos
    campos, y trabarle el plano por eso sería romperle el trabajo por una razón
    que no puede entender ni arreglar.
    """
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            continue
        for campo in CAMPOS_DE_CONTRATO:
            fixture.pop(campo, None)
        cara_b = fixture.get("faceB")
        if isinstance(cara_b, dict):
            for campo in CAMPOS_DE_CONTRATO:
                cara_b.pop(campo, None)
            # Una cara B que queda vacía se va: `facesOf` no la mira para saber
            # si la góndola es doble —eso lo dice `gondolaType`— así que un
            # objeto vacío no significa nada y sólo ocupa.
            if not cara_b:
                fixture.pop("faceB", None)


def _restore_missing_slot_prices(incoming: list, stored: list) -> None:
    """Refill the SLOT amounts the client did not send, in place.

    Worker responses have every ``negotiatedValue`` stripped server-side. Sólo
    un admin puede escribir, así que una copia redactada no debería volver
    nunca — pero si volviera, poner en cero la plata de una sede entera no se
    puede deshacer. Una llave AUSENTE se rellena del snapshot guardado; un valor
    explícito (el 0 incluido) es una edición de verdad y siempre manda.

    **Sólo los slots, y es la línea que no se puede mover.** El mueble y su cara
    B ya no llevan precio: ``_sin_contrato`` lo saca porque el contrato es de la
    base. Rellenarlos acá volvería a meter en el JSON justo lo que se acaba de
    cortar, y el desfase entero volvería con ellos. El estado por repisa, en
    cambio, no tiene contraparte en ninguna tabla: tiene UNA fuente, que es
    esta, y por eso hay que cuidarla.
    """
    if not stored:
        return
    index = _price_map(stored)
    if not index:
        return
    for fixture in incoming:
        if not isinstance(fixture, dict):
            continue
        entry = index.get(fixture.get("id"))
        if not entry:
            continue
        for slot in fixture.get("slots") or []:
            if not isinstance(slot, dict):
                continue
            value = (entry.get("slots") or {}).get(slot.get("id"))
            if value is not None and "negotiatedValue" not in slot:
                slot["negotiatedValue"] = value


def _con_la_ficha_de_antes(incoming: list, stored: list) -> None:
    """La ficha del mueble: lo ausente se conserva, el ``null`` se borra.

    ``modelo``, ``partes``, ``entrepanos`` y ``modulo`` (``CLAVES_DE_FICHA``)
    son claves que un editor abierto desde antes de que existieran no conoce:
    hasta el 2026-10-13 la vuelta del plano 2D armaba el mueble con una lista
    fija, y mover una góndola le borraba los entrepaños y el módulo que otra
    pestaña le había puesto. Como ``_restore_missing_slot_prices``, se cuida en
    el servidor, que es el único lugar por el que pasan todos los guardados:

    - **ausente**, en un mueble cuyo ``id`` ya estaba en el plano guardado: se
      rellena con lo guardado. Ausente es «no sé», no «no tiene»;
    - ``null``: es el navegador de hoy diciendo «la borré a propósito» (el
      panel la vació para volver a la cuenta de siempre). Se saca del JSON: un
      ``null`` guardado no significaría nada y el próximo guardado viejo lo
      confundiría con un valor;
    - un **valor**: manda, como cualquier edición;
    - un mueble **nuevo** (un ``id`` que el plano guardado no tiene) no hereda
      nada de nadie, aunque se llame igual que uno borrado;
    - un mueble de **otro tipo** con el ``id`` de uno guardado tampoco: la
      ficha de una góndola no es la de una punta, aunque sus entrepaños entren
      en el rango de la punta y se dibujaran con ellos. Se compara el tipo de
      verdad (``tipo_base``: ``gondola_mural`` es ``gondola``), así que el 2D,
      que guarda los alias, no pierde nada.

    Un plano que no trae ninguna de estas claves y no las tenía guardadas se
    guarda exactamente igual que antes. Sólo el primer nivel del mueble: la
    ficha no vive en la cara B.

    **Y adentro de ``partes``, lo mismo** (vender por partes, 2026-10-14):
    ``partes`` es un objeto, y una pestaña con el código de antes que lo armara
    sólo con lo que conoce (las puertas) borraría ``division`` —y con ella la
    venta por puertas— sin saberlo. Cada clave conocida de ``partes``
    (``CAMPOS_DE_PARTES``) que llega AUSENTE se rellena con la guardada, y un
    ``null`` adentro la borra. ``partes`` que queda vacío se va.
    """
    previos = {
        f.get("id"): f for f in stored
        if isinstance(f, dict) and f.get("id")
    }
    for fixture in incoming:
        if not isinstance(fixture, dict):
            continue
        previo = previos.get(fixture.get("id")) if fixture.get("id") else None
        if previo is not None and tipo_base(str(previo.get("type") or "")) != tipo_base(str(fixture.get("type") or "")):
            previo = None
        for clave in CLAVES_DE_FICHA:
            if clave in fixture:
                if fixture[clave] is None:
                    fixture.pop(clave)
                continue
            if previo is not None and previo.get(clave) is not None:
                fixture[clave] = copy.deepcopy(previo[clave])
        partes = fixture.get("partes")
        if isinstance(partes, dict):
            antes = (previo or {}).get("partes")
            for clave in CAMPOS_DE_PARTES:
                if clave in partes:
                    if partes[clave] is None:
                        partes.pop(clave)
                elif isinstance(antes, dict) and antes.get(clave) is not None:
                    partes[clave] = copy.deepcopy(antes[clave])
            if not partes:
                fixture.pop("partes")


def _candados_del_guardado(db: Session, sede: str, previas: list, nuevas: list) -> None:
    """Toma los candados de los muebles que este guardado retira de la venta o
    cuya forma de venderse por partes cambia. Sin eso, bajar la nevera de 3 a 2
    puertas y vender la puerta 3 al mismo tiempo pasaban los dos: el guardado
    no veía el contrato todavía y la venta no veía el plano todavía.

    **Y las caras que entran o salen de «por participación»** (diseño de
    participaciones §4.4, hallazgo A1 de la crítica): pasar ``partes.division``
    de ``"participacion"`` a entera no cambia lo ofrecido ni la firma de
    partes, así que sin esto el guardado no tomaba candado y un alta de
    participación simultánea pasaba con el plano viejo. Cubre cambiar la
    división, perder la receta por cambio de tipo, dejar de ser
    comercializable, borrar el mueble, renombrarlo y pasar de doble a mural.

    Con candado tomado, ``db.expire_all()``: lo que se lee después (los
    contratos y los términos de participación de las guardas de abajo) es
    fresco, no lo que la sesión ya tenía en memoria."""
    previas = [f for f in previas if isinstance(f, dict)]
    nuevas = [f for f in nuevas if isinstance(f, dict)]
    codigos = set(espacios_ofrecidos(previas, sede) ^ espacios_ofrecidos(nuevas, sede))
    firmas = {normalizar(f.get("code")): firma_de_partes(f) for f in previas if normalizar(f.get("code"))}
    for f in nuevas:
        code = normalizar(f.get("code"))
        if code in firmas and firmas[code] != firma_de_partes(f):
            codigos.add(f"{normalizar(sede)}-{code}" if not code.startswith(f"{normalizar(sede)}-") else code)
    codigos |= caras_por_participacion(previas, sede) ^ caras_por_participacion(nuevas, sede)
    if codigos:
        tomar_candados(db, codigos)
        db.expire_all()


# ─── Participaciones de cara: lo que el guardado del plano no puede romper ────
#
# Diseño de participaciones §4.4. Las tres guardas comparan el plano anterior
# con el nuevo y frenan SÓLO lo que este guardado cambia (un plano que ya venía
# desfasado se sigue guardando), y corren con los candados de
# `_candados_del_guardado` ya tomados. Sus claves (`participaciones_vivas`,
# `slots_vendidos_en_participacion`, `slots_en_participacion`) llevan el mismo
# `{code, message, choques}` que las demás: el navegador las muestra como
# rechazo (`RECHAZOS_CONOCIDOS` de `fixtureStore.ts`).

#: Lo que un espacio interno (slot) da por vendido en el JSON del plano.
_SLOT_VENDIDO = ("occupied", "reserved")


def _cara_corta(cara: str, sede: str) -> str:
    """``NAVE-GON-01-B`` → «GON-01 · cara B»."""
    p = partir_codigo(sin_prefijo_de_sede(cara, sede))
    return f"{p.base} · cara {p.cara}"


def _plural(n: int, uno: str, varios: str) -> str:
    return f"{n} {uno if n == 1 else varios}"


def participaciones_vivas(db: Session, sede: str, previas: list, nuevas: list) -> list[str]:
    """Las caras que este guardado saca de «por participación» y que tienen
    términos VIVOS (contratos o reservas provisionales que cuentan hoy o más
    adelante). Las reservas no son leases: ``contratos_que_quedarian_sin_mueble``
    no las ve. Se define por conjuntos de códigos (``caras_por_participacion``,
    la misma regla que ``ofrece``): cambiar la división, cambiar de tipo, no
    comercializable, borrar, renombrar sin pasar por la renumeración y doble →
    mural (la B sale del conjunto). Lo terminado no frena."""
    salen = caras_por_participacion(previas, sede) - caras_por_participacion(nuevas, sede)
    if not salen:
        return []
    dia = hoy()
    frases = []
    for cara in sorted(salen):
        datos = servicio_participaciones.leer(db, cara)
        vivos = [t for t in datos.todos if reglas.vivo(t, dia)]
        if not vivos:
            continue
        n = len({t["space_id"] for t in vivos})
        contratos = sum(1 for t in vivos if t["estado"] == "contrato")
        reservas = len(vivos) - contratos
        cuales = " y ".join(x for x in (
            _plural(contratos, "contrato", "contratos") if contratos else "",
            _plural(reservas, "reserva provisional", "reservas provisionales") if reservas else "",
        ) if x)
        frases.append(
            f"{_cara_corta(cara, sede)} tiene {_plural(n, 'participación viva', 'participaciones vivas')} "
            f"({cuales}). {'Cancelala o dejá que venza' if len(vivos) == 1 else 'Cancelalas o dejá que venzan'} "
            "antes de cambiar cómo se vende."
        )
    return frases


def _vive(slot: dict, dia: date) -> bool:
    """¿El espacio interno está vendido y vigente (sin fin o con fin hoy o
    después)? Un fin que no se entiende cuenta como vigente: es lo prudente."""
    if slot.get("status") not in _SLOT_VENDIDO:
        return False
    fin = str(slot.get("endDate") or "").strip()
    if not fin:
        return True
    try:
        return date.fromisoformat(fin[:10]) >= dia
    except ValueError:
        return True


def _por_id(fixtures: list) -> dict:
    return {f.get("id"): f for f in fixtures if isinstance(f, dict) and f.get("id")}


def slots_vendidos_en_participacion(previas: list, nuevas: list) -> list[str]:
    """Los muebles que pasan a venderse por participación EN ESTE guardado con
    espacios internos vendidos y vigentes en el JSON: lo vendido así no tiene
    contrato que la capacidad de la cara pueda contar. Un mueble que ya era
    por participación no entra acá (lo cuida ``slots_en_participacion``)."""
    dia = hoy()
    previos = _por_id(previas)
    frases = []
    for f in nuevas:
        if not isinstance(f, dict) or not por_participacion(f):
            continue
        previo = previos.get(f.get("id")) if f.get("id") else None
        if previo is not None and por_participacion(previo):
            continue
        if any(isinstance(x, dict) and _vive(x, dia) for x in f.get("slots") or []):
            frases.append(
                f"«{normalizar(f.get('code'))}» tiene espacios internos vendidos: no pasa a participación "
                "hasta que terminen."
            )
    return sorted(frases)


#: Lo que, cambiado en un espacio interno que ya estaba vendido, es venderlo
#: otra vez: correr el inicio (más días vendidos, como estirar el fin) o
#: pasárselo a otro proveedor. Se comparan sólo si vienen (una pestaña que no
#: los conoce no los está cambiando).
_VENTA_DEL_SLOT = ("startDate", "supplierName")


def slots_en_participacion(previas: list, nuevas: list) -> list[str]:
    """Los muebles por participación en los que este guardado VENDE un espacio
    interno: un slot que pasa a ocupado o reservado, o que siendo vendido
    cambia su fin, su inicio, su proveedor o su valor. Los slots y su precio
    viven en el JSON, sin autoridad del servidor: una pestaña vieja vendía así
    un frente que ya está repartido por participación. Liberar un slot sigue
    permitido, y uno que ya estaba vendido igual se guarda sin tocarlo. Un
    valor AUSENTE no es un cambio: lo rellena ``_restore_missing_slot_prices``."""
    previos = _por_id(previas)
    frases = []
    for f in nuevas:
        if not isinstance(f, dict) or not por_participacion(f):
            continue
        previo = previos.get(f.get("id")) if f.get("id") else None
        antes = {x.get("id"): x for x in ((previo or {}).get("slots") or [])
                 if isinstance(x, dict) and x.get("id")}
        for x in f.get("slots") or []:
            if not isinstance(x, dict) or x.get("status") not in _SLOT_VENDIDO:
                continue
            a = antes.get(x.get("id")) if x.get("id") else None
            if (a is None or a.get("status") not in _SLOT_VENDIDO or a.get("endDate") != x.get("endDate")
                    or any(k in x and a.get(k) != x.get(k) for k in _VENTA_DEL_SLOT)
                    or ("negotiatedValue" in x and a.get("negotiatedValue") != x.get("negotiatedValue"))):
                frases.append(
                    f"«{normalizar(f.get('code'))}» se vende por participación: lo vendido va con contrato desde "
                    "Vender, no como espacio interno."
                )
                break
    return sorted(frases)


#: Lo comercial de una repisa (``slots``): lo que la vende.
_COMERCIAL_DEL_SLOT = ("status", "supplierName", "brandCategory", "negotiatedValue", "startDate", "endDate")


def _slot_con_venta(x: dict) -> bool:
    """¿La repisa dice que está vendida? Ocupada o reservada, o con proveedor o
    con valor."""
    try:
        valor = float(x.get("negotiatedValue") or 0)
    except (TypeError, ValueError):
        valor = 0.0
    return x.get("status") in _SLOT_VENDIDO or bool(str(x.get("supplierName") or "").strip()) or valor > 0


def slots_vendidos_en_el_plano(previas: list, nuevas: list) -> list[str]:
    """Los muebles en los que este guardado VENDE una repisa del 3D (auditoría
    P1-15, decisión del dueño 2026-10-30: «Sólo lectura + pasar a contrato»).

    Las repisas (``slots``) guardaban proveedor, «Valor (COP/mes)» y fechas
    sólo en el JSON del plano: una venta paralela sin contrato, sin candado,
    sin ``contratos_que_chocan``, sin bitácora y fuera del canon y de la
    ocupación. Ahora lo comercial de una repisa es de sólo lectura: se frena
    una repisa NUEVA que trae algo comercial y una que cambia cualquiera de sus
    campos comerciales. Lo que sí pasa: liberarla (pasarla a «Disponible»,
    aunque le quede el proveedor de antes, o todo lo comercial en vacío),
    dejarla como estaba, y un campo AUSENTE (no es un cambio: lo rellena
    ``_restore_missing_slot_prices``). Lo vendido de antes no se pierde: se
    pasa a contrato con «Pasar a contrato» (``POST /layout/{sede}/repisas/…``).
    """
    previos = _por_id(previas)
    frases = []
    for f in nuevas:
        if not isinstance(f, dict):
            continue
        previo = previos.get(f.get("id")) if f.get("id") else None
        antes = {x.get("id"): x for x in ((previo or {}).get("slots") or [])
                 if isinstance(x, dict) and x.get("id")}
        for x in f.get("slots") or []:
            if not isinstance(x, dict) or not _slot_con_venta(x):
                continue
            a = antes.get(x.get("id")) if x.get("id") else None
            # Una libre que conserva lo de antes no vende nada: el estado no cuenta.
            claves = _COMERCIAL_DEL_SLOT if x.get("status") in _SLOT_VENDIDO else _COMERCIAL_DEL_SLOT[1:]
            if a is None or any(k in x and (a.get(k) or None) != (x.get(k) or None) for k in claves):
                frases.append(
                    f"«{normalizar(f.get('code'))}»: lo comercial de una repisa es de sólo lectura. Lo que se "
                    "vende va con contrato, en Vender; una repisa que ya estaba vendida se pasa a contrato "
                    "desde su panel."
                )
                break
    return sorted(frases)


def _caras_pc_con_mueble(fixtures: list, sede: str) -> dict[str, tuple[dict, str]]:
    """``{código completo de la cara: (mueble, letra)}`` de las caras por
    participación, como ``caras_por_participacion`` (con la sede del plano)."""
    caras: dict[str, tuple[dict, str]] = {}
    for f in fixtures:
        if not isinstance(f, dict):
            continue
        for codigo in caras_por_participacion([f], sede):
            caras[codigo] = (f, partir_codigo(codigo).cara)
    return caras


def _historial_del_guardado(db: Session, sede: str, previas: list, nuevas: list, actor: str) -> None:
    """Lo que el guardado le cambia a las caras por participación, en su
    historial (diseño §4.4, §5.6; tipo ``estado``):

    · ``distribucion.division``: la cara pasó a venderse por participación, o
      dejó de venderse así (sólo lo terminado: lo vivo lo frena la guarda);
    · ``distribucion.para_revisar``: cambió la firma de una cara con
      distribución confirmada (la del mismo mueble): queda para revisar, o
      vuelve a coincidir con lo confirmado.

    Sólo para caras que ya tienen su fila en ``spaces`` (vendidas alguna vez o
    con participaciones): el historial se cuelga de esa fila, y una cara que
    nunca se vendió no tiene historia que contar todavía —su primera
    participación la crea—. Barato: las firmas se calculan sólo de los muebles
    que cambiaron, y la base se consulta sólo si hay algo que anotar."""
    antes = _caras_pc_con_mueble(previas, sede)
    despues = _caras_pc_con_mueble(nuevas, sede)
    cambian = set(antes) ^ set(despues)
    firmas: dict[str, tuple] = {}
    for codigo in set(antes) & set(despues):
        (fa, la), (fd, ld) = antes[codigo], despues[codigo]
        if fa == fd:
            continue
        f1, f2 = firma_de_cara(fa, la), firma_de_cara(fd, ld)
        if f1 != f2:
            firmas[codigo] = (f1, f2, fd)
    if not cambian and not firmas:
        return
    filas = {normalizar(s.code): s for s in db.query(Space).filter(Space.code.in_(sorted(cambian | set(firmas))))}
    for codigo in sorted(cambian):
        fila = filas.get(codigo)
        if fila is None:
            continue
        entra = codigo in despues
        firma_antes = firma_de_cara(*antes[codigo]) if codigo in antes else None
        firma_despues = firma_de_cara(*despues[codigo]) if codigo in despues else None
        anotar_historial(
            db, tipo="estado", accion="distribucion.division", actor=actor, cara_space_id=fila.id,
            detalle=(f"{_cara_corta(codigo, sede)} pasó a venderse por participación." if entra
                     else f"{_cara_corta(codigo, sede)} dejó de venderse por participación."),
            antes={"por_participacion": not entra, "firma": firma_antes},
            despues={"por_participacion": entra, "firma": firma_despues},
        )
    con_fila = {codigo: filas[codigo] for codigo in firmas if codigo in filas}
    if not con_fila:
        return
    dists = {d.cara_space_id: d for d in db.query(Distribucion).filter(
        Distribucion.cara_space_id.in_([f.id for f in con_fila.values()]))}
    for codigo in sorted(con_fila):
        d = dists.get(con_fila[codigo].id)
        f1, f2, mueble = firmas[codigo]
        if d is None or d.confirmada_en is None or not d.firma_confirmada:
            continue
        if str(d.fixture_id or "") != str(mueble.get("id") or ""):
            continue  # la dibujaron para otro mueble: no hay qué revisar (`otro_mueble`)
        queda = f2 != d.firma_confirmada
        anotar_historial(
            db, tipo="estado", accion="distribucion.para_revisar", actor=actor,
            cara_space_id=con_fila[codigo].id, distribucion_id=d.id,
            detalle=(f"{_cara_corta(codigo, sede)}: el mueble cambió desde que se confirmó la distribución; "
                     "queda para revisar." if queda else
                     f"{_cara_corta(codigo, sede)}: el mueble vuelve a coincidir con la distribución confirmada."),
            antes={"firma": f1}, despues={"firma": f2, "para_revisar": queda},
        )


# ─── El nombre viejo: se lee del registro, no del mueble ──────────────────────
#
# Después de renumerar, la pantalla necesita poder contestar «¿de qué mueble era
# este contrato?»: la cartelería de la tienda y el papel que firmó el proveedor
# siguen diciendo el nombre viejo. Ese dato existe —lo escribe la renumeración
# en ``renumeracion_nombres``— y viaja hasta el navegador como ``nombreAnterior``.
#
# Va DERIVADO en la respuesta y no guardado en el mueble, y es toda la
# diferencia: el JSON del plano sigue teniendo **un solo nombre**, así que no
# hay un segundo campo que alguien pueda leer como identidad ni que la próxima
# renumeración pueda pisar. El servidor lo agrega al leer (``_con_nombre_viejo``)
# y lo saca al escribir (``_sin_nombre_viejo``), que es lo que lo mantiene de
# sólo lectura aunque el editor lo mande de vuelta.


def _con_nombre_viejo(db: Session, outs: list[LayoutOut]) -> None:
    """Agrega ``nombreAnterior`` a cada mueble que se llamaba distinto.

    Sólo cuando difiere del nombre de hoy: un mueble que salió de la
    renumeración llamándose como entró no tiene nada que recordar, y la clave de
    más sería ruido en cada plano que baja.
    """
    if not outs:
        return
    memoria = nombres_anteriores(db, [o.sede for o in outs])
    if not memoria:
        return
    for out in outs:
        por_id = memoria.get(out.sede) or {}
        if not por_id:
            continue
        for fixture in out.fixtures:
            if not isinstance(fixture, dict):
                continue
            viejo = por_id.get(str(fixture.get("id") or ""))
            if viejo and viejo != normalizar(fixture.get("code")):
                fixture["nombreAnterior"] = viejo


def _sin_nombre_viejo(fixtures: list) -> None:
    """Saca ``nombreAnterior`` de lo que llega a guardarse.

    El editor lo arrastra tal cual —hace bien: no es suyo— y lo devuelve en el
    siguiente guardado. Si se guardara, el mueble volvería a tener dos campos de
    nombre adentro del JSON, que es exactamente lo que esta fase eliminó, y
    además quedaría una copia que la próxima renumeración no actualiza. El
    registro manda; esto es una proyección de lectura.
    """
    for fixture in fixtures:
        if isinstance(fixture, dict):
            fixture.pop("nombreAnterior", None)


def _no_store(response: Response) -> None:
    """Layout reads drive cross-workstation sync — they must never be cached."""
    response.headers["Cache-Control"] = "no-store, max-age=0"


# ─── Reads ────────────────────────────────────────────────────────────────────
# Route-order gotcha (same as spaces.py): every literal path MUST be declared
# above "/{sede}", otherwise Starlette matches the catch-all first.


@router.get("/", response_model=list[LayoutOut])
def get_all_layouts(response: Response, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the saved fixture layout for every sede."""
    _no_store(response)
    outs = [_to_out(s) for s in db.query(LayoutSnapshot).all()]
    _con_nombre_viejo(db, outs)
    if role != "admin":
        for out in outs:
            _redact_fixtures_for_worker(out.fixtures)
    return outs


@router.get("/revisions", response_model=list[LayoutRevision])
def get_revisions(response: Response, db: Session = Depends(get_db)):
    """Return ``{sede, updated_at, count}`` for every sede — no fixture payload.

    Clients poll this to notice another workstation's changes cheaply, and only
    re-download the sedes whose revision actually moved.
    """
    _no_store(response)
    revisions = []
    for snap in db.query(LayoutSnapshot).all():
        try:
            count = len(json.loads(snap.fixtures_json or "[]"))
        except (ValueError, TypeError):
            count = 0
        revisions.append(LayoutRevision(sede=snap.sede, updated_at=snap.updated_at, count=count))
    return revisions


@router.get("/settings", response_model=LayoutSettingsOut)
def get_settings(response: Response, db: Session = Depends(get_db)):
    """Shared sede list and catalog label overrides.

    These used to live only in each browser's localStorage, so renaming or
    adding a sede never reached anyone else's workstation.
    """
    _no_store(response)
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except ValueError:
        sedes = []
    try:
        labels = json.loads(get_config(db, CATALOG_LABELS_KEY) or "{}")
    except ValueError:
        labels = {}
    updated_at = _stored_settings_revision(db)
    return LayoutSettingsOut(
        sedes=[s for s in sedes if isinstance(s, str)],
        catalog_labels=nombres_propios_recortados(labels) if isinstance(labels, dict) else {},
        updated_at=updated_at,
        generacion=get_config(db, CLAVE_GENERACION),
    )


@router.put("/settings", response_model=LayoutSettingsOut)
def save_settings(payload: LayoutSettingsIn, request: Request, rol: str = Depends(require_admin),
                  db: Session = Depends(get_db)):
    """Replace the shared sede list and catalog labels.

    The sede list is a single value replaced whole, so two admins touching
    sedes inside the same poll window used to silently overwrite each other.
    That is worse than it sounds: the list is only ever unioned on pull, never
    trimmed, so a stale copy could put a deleted sede back for everyone with no
    way to remove it again. When the client echoes the revision it read, a
    write made against an older one is rejected instead of applied.
    """
    stored = _stored_settings_revision(db)
    base = _as_utc(payload.base_updated_at)
    # Once the server holds a revision, a write must name it. Treating a missing
    # base as "overwrite unconditionally" left the door open at exactly the
    # point this check exists to close: a workstation that had never read the
    # settings — or had not read them since — published its own list over
    # everyone else's, deleted sedes included. A genuine first publish is the
    # case where the server has no revision either, and that still goes through.
    if stored is not None:
        if base is None or _truncate_ms(stored) != _truncate_ms(base):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "settings_conflict",
                    "message": (
                        "Otro equipo cambió la lista de sedes mientras editabas."
                    ),
                    "server_updated_at": stored.isoformat(),
                },
            )

    now = datetime.now(timezone.utc)
    set_config(db, SEDES_KEY, json.dumps(payload.sedes))
    set_config(db, CATALOG_LABELS_KEY, json.dumps(payload.catalog_labels))
    set_config(db, SETTINGS_UPDATED_KEY, now.isoformat())
    # La bitácora (auditoría P2-14): cuántas sedes quedaron.
    anotar(db, request, rol, "ajustes.sedes", detalle=f"{len(payload.sedes)} sede(s)")
    try:
        db.commit()
    except IntegrityError:
        # Dos «primeras publicaciones» a la vez —al entrar a una base vacía el
        # navegador manda dos (el doble efecto de StrictMode)— leen las dos la
        # base sin revisión e insertan las dos la misma clave: la segunda
        # chocaba con `UNIQUE app_config.key` y salía un 500. Pierde como
        # cualquier escritura vieja: 409, y el navegador relee la lista.
        db.rollback()
        actual = _stored_settings_revision(db)
        raise HTTPException(
            status_code=409,
            detail={
                "code": "settings_conflict",
                "message": "Otro equipo cambió la lista de sedes mientras editabas.",
                "server_updated_at": actual.isoformat() if actual else None,
            },
        )
    return LayoutSettingsOut(
        sedes=payload.sedes,
        catalog_labels=payload.catalog_labels,
        updated_at=now,
        generacion=get_config(db, CLAVE_GENERACION),
    )


# ─── Season windows (shared, read by anyone authenticated) ────────────────────
# Unlike the rates these are not money — a worker looking at what is free for
# Christmas needs the same season dates the admin sees. Route order: literal
# paths stay above "/{sede}".


# ─── Metas de Indicadores (rediseño UX, etapa 5) ──────────────────────────────
# Cuánta ocupación y cuánto canon contra la tarifa se espera: una meta general
# y, si hace falta, una por sede. Son porcentajes, no plata: las lee cualquiera
# con sesión (el trabajador ve la ocupación contra su meta) y las cambia
# administración. Viven en `app_config` como un JSON (sin tabla ni migración).
# Sin nada guardado valen las propuestas del dibujo aprobado (90 % y 95 %,
# `docs/maquetas/ux-2026-10/pantallas.md`), y la pantalla dice que son ésas.

METAS_KEY = "metas_de_indicadores"
METAS_POR_DEFECTO = {"ocupacion": 90, "canon_tarifa": 95}


class Meta(BaseModel):
    ocupacion: int = Field(ge=0, le=100)
    canon_tarifa: int = Field(ge=0, le=200)


class MetasIn(BaseModel):
    general: Meta
    sedes: dict[str, Meta] = Field(default={}, max_length=100)


def _metas_guardadas(db: Session) -> dict | None:
    try:
        crudo = json.loads(get_config(db, METAS_KEY) or "null")
    except ValueError:
        return None
    return crudo if isinstance(crudo, dict) else None


@router.get("/metas")
def get_metas(response: Response, db: Session = Depends(get_db)):
    _no_store(response)
    guardadas = _metas_guardadas(db)
    if not guardadas:
        return {"general": dict(METAS_POR_DEFECTO), "sedes": {}, "por_defecto": True}
    return {"general": guardadas.get("general", dict(METAS_POR_DEFECTO)),
            "sedes": guardadas.get("sedes", {}), "por_defecto": False}


@router.put("/metas")
def put_metas(payload: MetasIn, request: Request, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    datos = {"general": payload.general.model_dump(),
             "sedes": {k.strip().upper(): v.model_dump() for k, v in payload.sedes.items() if k.strip()}}
    set_config(db, METAS_KEY, json.dumps(datos))
    anotar(db, request, rol, "ajustes.metas", detalle=f"Ocupación {datos['general']['ocupacion']} % · canon ÷ tarifa {datos['general']['canon_tarifa']} %")
    db.commit()
    return {**datos, "por_defecto": False}


@router.get("/seasons", response_model=SeasonWindowsOut)
def get_season_windows(response: Response, db: Session = Depends(get_db)):
    """Días de venta antes y después del ancla, por temporada."""
    _no_store(response)
    try:
        stored = json.loads(get_config(db, SEASONS_KEY) or "{}")
    except ValueError:
        stored = {}
    windows: dict[str, SeasonWindow] = {}
    if isinstance(stored, dict):
        for key, value in stored.items():
            if not isinstance(key, str) or not isinstance(value, dict):
                continue
            try:
                windows[key] = SeasonWindow(
                    before=int(value.get("before", 0)),
                    after=int(value.get("after", 0)),
                )
            except (TypeError, ValueError):
                continue
    raw_updated = get_config(db, SEASONS_UPDATED_KEY)
    updated_at = None
    if raw_updated:
        try:
            updated_at = datetime.fromisoformat(raw_updated)
        except ValueError:
            updated_at = None
    return SeasonWindowsOut(windows=windows, updated_at=updated_at)


@router.put("/seasons", response_model=SeasonWindowsOut)
def save_season_windows(payload: SeasonWindowsIn, request: Request, rol: str = Depends(require_admin),
                        db: Session = Depends(get_db)):
    """Replace the season windows. Same for every sede — they are not per-store."""
    now = datetime.now(timezone.utc)
    clean = {
        key.strip(): {"before": w.before, "after": w.after}
        for key, w in payload.windows.items()
        if key.strip()
    }
    set_config(db, SEASONS_KEY, json.dumps(clean))
    set_config(db, SEASONS_UPDATED_KEY, now.isoformat())
    anotar(db, request, rol, "ajustes.temporadas", detalle=f"{len(clean)} temporada(s)")
    db.commit()
    return SeasonWindowsOut(
        windows={k: SeasonWindow(**v) for k, v in clean.items()},
        updated_at=now,
    )


# ─── Reference rates (admin-only, both directions) ────────────────────────────
# Rates are money: they never travel to a worker, so unlike /settings even the
# GET requires admin. Stored in app_config — the schema rule of this project is
# "no migrations", and a key/value row is how non-fixture state gets persisted.


def _clean_rates(raw: dict) -> dict[str, float]:
    """Keep only {type: positive amount} pairs — sending 0 clears a rate."""
    clean: dict[str, float] = {}
    if not isinstance(raw, dict):
        return clean
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number != number or number in (float("inf"), float("-inf")):
            continue
        if number > 0:
            # En pesos enteros (auditoría P2-11): `1234.5` queda `1235`.
            clean[key.strip()] = al_peso(number)
    return clean


def reference_rates_raw(db: Session) -> dict:
    """Las tarifas como están guardadas: ``{"default": {...}, "by_sede": {...}}``.

    Sin el envoltorio del endpoint, para que otros módulos —la carga masiva, por
    ejemplo— puedan comparar contra la referencia sin volver a leer la config a
    mano y sin arrastrarse el `Response` de FastAPI.
    """
    try:
        stored = json.loads(get_config(db, RATES_KEY) or "{}")
    except ValueError:
        stored = {}
    return stored if isinstance(stored, dict) else {}


@router.get("/rates", response_model=ReferenceRatesOut, dependencies=[Depends(require_admin)])
def get_reference_rates(response: Response, db: Session = Depends(get_db)):
    """Monthly reference rate per fixture type, with per-sede overrides."""
    _no_store(response)
    try:
        stored = json.loads(get_config(db, RATES_KEY) or "{}")
    except ValueError:
        stored = {}
    if not isinstance(stored, dict):
        stored = {}
    by_sede_raw = stored.get("by_sede")
    by_sede = (
        {sede: _clean_rates(rates) for sede, rates in by_sede_raw.items() if isinstance(sede, str)}
        if isinstance(by_sede_raw, dict)
        else {}
    )
    raw_updated = get_config(db, RATES_UPDATED_KEY)
    updated_at = None
    if raw_updated:
        try:
            updated_at = datetime.fromisoformat(raw_updated)
        except ValueError:
            updated_at = None
    return ReferenceRatesOut(
        default=_clean_rates(stored.get("default")),
        by_sede={sede: rates for sede, rates in by_sede.items() if rates},
        updated_at=updated_at,
    )


def _revision_de_las_tarifas(db: Session) -> datetime | None:
    raw = get_config(db, RATES_UPDATED_KEY)
    if not raw:
        return None
    try:
        return _as_utc(datetime.fromisoformat(raw))
    except ValueError:
        return None


@router.put("/rates", response_model=ReferenceRatesOut)
def save_reference_rates(payload: ReferenceRatesIn, request: Request, rol: str = Depends(require_admin),
                         db: Session = Depends(get_db)):
    """Replace the reference rates. Sede keys are normalised like sede names.

    **Gana la primera, no la última** (auditoría P2-17). Las tarifas son un
    solo valor que se reemplaza entero: dos personas con Ajustes abierto se
    pisaban sin enterarse. Como en el layout y en los settings, quien manda
    ``base_updated_at`` (la pantalla, siempre) escribe sólo si nadie guardó
    después de lo que leyó; si no, 409 ``rates_conflict`` con la revisión del
    servidor, y la pantalla relee.
    """
    if "base_updated_at" in payload.model_fields_set:
        guardada = _revision_de_las_tarifas(db)
        base = _as_utc(payload.base_updated_at)
        distinta = (guardada is None) != (base is None) or (
            guardada is not None and base is not None and _truncate_ms(guardada) != _truncate_ms(base))
        if distinta:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "rates_conflict",
                    "message": "Otra persona cambió las tarifas mientras editabas.",
                    "server_updated_at": guardada.isoformat() if guardada else None,
                },
            )
    now = datetime.now(timezone.utc)
    default = _clean_rates(payload.default)
    by_sede: dict[str, dict[str, float]] = {}
    for sede, rates in payload.by_sede.items():
        # Same normalisation as the client's normalizeSede — "Nave" and "NAVE"
        # must not accumulate as two different override sets.
        name = sede.strip().upper()
        clean = _clean_rates(rates)
        if name and clean:
            by_sede[name] = clean
    set_config(db, RATES_KEY, json.dumps({"default": default, "by_sede": by_sede}))
    set_config(db, RATES_UPDATED_KEY, now.isoformat())
    # La bitácora (auditoría P2-14): cuántas tarifas quedaron, sin los montos.
    anotar(db, request, rol, "ajustes.tarifas",
           detalle=f"{len(default)} general(es) · {sum(len(v) for v in by_sede.values())} por sede")
    db.commit()
    return ReferenceRatesOut(default=default, by_sede=by_sede, updated_at=now)


# ─── Renumerar: el código pasa a ser EL nombre ────────────────────────────────
# Rutas literales, declaradas ANTES de "/{sede}" como manda la regla de este
# router. Dos pasos, como la carga masiva: "previo" no escribe una sola fila y
# "aplicar" escribe todo dentro de una transacción.


def _a_salida(planes, aplicado: bool) -> RenumeracionOut:
    return RenumeracionOut(
        aplicado=aplicado,
        sedes=[RenumeracionSedeOut.model_validate(p) for p in planes],
        muebles=sum(p.muebles for p in planes),
        cambian=sum(p.cambian for p in planes),
    )


def _planificar(db: Session, payload: RenumeracionIn):
    try:
        return planificar(db, payload.sedes)
    except RenumeracionBloqueada as e:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "renumeracion_bloqueada",
                "message": f"No se puede renumerar «{e.sede}» sin romper algo.",
                "motivos": e.motivos,
            },
        )
    except InvarianteRoto as e:
        # Nunca debería pasar: significa que el cálculo perdió, agregó o movió un
        # mueble. Se corta acá, con la sesión intacta y sin haber escrito nada,
        # porque la promesa al dueño fue justamente ésa.
        logger.error("renumeración: invariante roto en %s — %s", e.sede, e.fallas)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "renumeracion_invariante",
                "message": (
                    f"La renumeración de «{e.sede}» no conserva el plano; no se "
                    "escribió nada."
                ),
                "fallas": e.fallas,
            },
        )


# ─── Los contratos que viven sólo en el JSON del layout ───────────────────────
#
# La otra mitad del desfase, y la que NO se puede ver desde el navegador: la
# fusión del store reemplaza lo comercial con lo que dice la base, así que un
# contrato que sólo está en el JSON desaparece antes de que ninguna pantalla lo
# mire. Sólo se ve leyendo el snapshot crudo, que es lo que pasa acá.
#
# Los dos pasos son la misma forma que la renumeración y por la misma razón: lo
# que escribe contratos se mira antes de escribirlo. El previo no toca una fila.
#
# Admin-only los dos: esto lleva plata, y el de aplicar además CREA contratos.


def _a_importacion(plan, aplicado: bool) -> ImportacionOut:
    return ImportacionOut(
        importables=[vars(x) for x in plan.importables],
        incompletos=[vars(x) for x in plan.incompletos],
        ya_estaban=plan.ya_estaban,
        aplicado=aplicado,
    )


@router.get("/importacion/previo", response_model=ImportacionOut,
            dependencies=[Depends(require_admin)])
def importacion_previo(db: Session = Depends(get_db)) -> ImportacionOut:
    """Qué contratos hay en los planos que la base no tiene. **No escribe.**

    Es un GET porque no cambia nada y porque así la pantalla lo puede pedir sola
    al abrir Supervisar, sin que nadie tenga que acordarse de ir a buscarlo.
    """
    return _a_importacion(revisar_importacion(db), aplicado=False)


@router.post("/importacion/aplicar", response_model=ImportacionOut,
             dependencies=[Depends(require_admin)])
def importacion_aplicar(
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ImportacionOut:
    """Crear en la base los contratos que hoy sólo existen en el JSON.

    Idempotente: lo que ya tiene contrato vivo no se toca, así que apretarlo dos
    veces no duplica nada. Lo que no se puede importar —sin proveedor o sin
    fechas— se devuelve igual, para mirarlo a mano.

    Queda en la bitácora: esto crea contratos, que es plata.
    """
    plan = aplicar_importacion(db)
    if plan.importables:
        anotar(
            db, request, rol,
            accion="contrato.importado",
            detalle=(
                f"{len(plan.importables)} contrato(s) importados del JSON del "
                f"layout: " + ", ".join(x.espacio for x in plan.importables)
            ),
        )
        # `anotar` no hace commit —lo hace quien llama— y el servicio ya cerró
        # su transacción con los contratos adentro. Sin esta línea la bitácora
        # se perdería en silencio, que es la peor forma de no tener bitácora.
        db.commit()
    return _a_importacion(plan, aplicado=True)


@router.post("/renumeracion/previo", response_model=RenumeracionOut,
             dependencies=[Depends(require_admin)])
def renumeracion_previo(
    payload: RenumeracionIn, db: Session = Depends(get_db)
) -> RenumeracionOut:
    """El antes → después de cada sede, sin escribir NADA.

    Es el informe que el dueño imprime y camina con la tienda al lado: cada
    mueble con el nombre que tenía, el que el plano dibujaba y el que va a
    tener. Renumerar sin ese papel le deja el plano y la cartelería hablando
    idiomas distintos.
    """
    return _a_salida(_planificar(db, payload), aplicado=False)


@router.post("/renumeracion/aplicar", response_model=RenumeracionOut,
             dependencies=[Depends(require_admin)])
def renumeracion_aplicar(
    payload: RenumeracionIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RenumeracionOut:
    """Escribe la renumeración: el plano, los espacios y los montajes, de una vez.

    Todo en UNA transacción, con la bitácora adentro: o cae todo o no cae nada.
    Y es idempotente — una segunda corrida vuelve a calcular lo mismo, no
    encuentra nada que cambiar y no escribe.
    """
    planes = _planificar(db, payload)
    try:
        # Los candados de los muebles que se mudan, y el plan otra vez con
        # ellos puestos: un alta de participación no puede crear su espacio con
        # el código que se está yendo (diseño de participaciones §2.5).
        planes = renumeracion_con_candados(db, planes)
        aplicar_renumeracion(db, planes)
    except RenumeracionBloqueada as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "renumeracion_bloqueada",
                "message": f"No se puede renumerar «{e.sede}» sin romper algo.",
                "motivos": e.motivos,
            },
        )
    except InvarianteRoto as e:
        db.rollback()
        logger.error("renumeración: invariante roto al aplicar %s — %s", e.sede, e.fallas)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "renumeracion_invariante",
                "message": (
                    f"La renumeración de «{e.sede}» no conserva el plano; no se "
                    "escribió nada."
                ),
                "fallas": e.fallas,
            },
        )
    except Exception:
        db.rollback()
        raise

    for plan in planes:
        if plan.cambian == 0:
            continue
        anotar(
            db, request, rol, "sede.renumerar", entidad="sede", entidad_id=plan.sede,
            detalle=(
                f"{plan.cambian} de {plan.muebles} muebles renombrados · "
                f"{len(plan.espacios)} espacios · {plan.montajes} montajes"
            ),
        )
    db.commit()
    return _a_salida(planes, aplicado=True)


# ─── Renombrar una sede (fase 2 · I5) ─────────────────────────────────────────
#
# Dos segmentos con la cola literal: no choca con "/{sede}" (un segmento) y se
# declara antes de las rutas paramétricas de un segmento, como manda la regla
# de este router. Los modelos viven acá: son de este endpoint y de nadie más.


class RenombreSedeIn(BaseModel):
    nuevo: str = Field(max_length=200)
    #: La revisión del plano que el navegador tenía, como en `PUT /layout`: si
    #: otro equipo guardó en el medio, 409 y no se renombra.
    base_updated_at: datetime | None = None


class RenombreSedeOut(BaseModel):
    sede: str
    fixtures: list[Any] = Field(default=[])
    updated_at: datetime | None = None
    #: La revisión nueva de la lista de sedes (el renombre la cambió).
    settings_updated_at: datetime | None = None
    espacios: int = 0
    contratos: int = 0
    montajes: int = 0
    avisos: list[str] = Field(default=[])


@router.post("/{sede}/renombrar", response_model=RenombreSedeOut)
def renombrar_sede(
    sede: str,
    payload: RenombreSedeIn,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RenombreSedeOut:
    """Renombra la sede de verdad: sus códigos pasan al nombre nuevo y lo
    vendido sigue vivo (``services/renombre_sede.py``). Antes el navegador lo
    hacía borrando la sede y creándola de nuevo, y el borrado cerraba los
    contratos, cancelaba las reservas de participación y archivaba los
    montajes.

    Todo en UNA transacción, con la lista de sedes, las tarifas ``by_sede`` y
    la bitácora adentro: o cae todo o no cae nada."""
    snap = plano_de_la_sede(db, sede)
    leido = snap.updated_at if snap else None
    snap_id = snap.id if snap else None
    if payload.base_updated_at is not None:
        if snap is None:
            raise HTTPException(
                status_code=409,
                detail={"code": "layout_deleted", "message": f"«{sede}» fue eliminada desde otro equipo."},
            )
        guardada, base = _as_utc(leido), _as_utc(payload.base_updated_at)
        if guardada and base and _truncate_ms(guardada) != _truncate_ms(base):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "layout_conflict",
                    "message": (
                        f"Otro equipo guardó cambios en «{sede}» mientras editabas. "
                        "Actualizá para ver la versión del servidor antes de renombrar."
                    ),
                    "server_updated_at": guardada.isoformat(),
                },
            )
    try:
        hecho = renombrar_la_sede(db, snap.sede if snap else sede, payload.nuevo, leido, snap_id)
    except RenombreRechazado as e:
        db.rollback()
        raise HTTPException(
            status_code=e.status, detail={"code": e.code, "message": e.mensaje, "motivos": e.motivos},
        )
    except IntegrityError:
        # Otro equipo creó en el medio el plano o un código con el nombre nuevo:
        # la escritura de `renombrar_la_sede` choca con un UNIQUE antes del commit.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": "renombre_bloqueado",
                    "message": f"Otro equipo creó algo con el nombre «{payload.nuevo}» mientras renombrabas: "
                               "actualizá y volvé a intentar.",
                    "motivos": []},
        )
    except Exception:
        db.rollback()
        raise

    ahora = datetime.now(timezone.utc)
    # La lista de sedes: el nombre nuevo en el lugar del viejo (o al final, si
    # la sede tenía plano y no estaba en la lista).
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except (ValueError, TypeError):
        sedes = []
    lista: list[str] = []
    for nombre in sedes if isinstance(sedes, list) else []:
        if not isinstance(nombre, str):
            continue
        if normalizar(nombre) == hecho.viejo:
            nombre = hecho.nuevo
        if nombre not in lista:
            lista.append(nombre)
    if hecho.nuevo not in lista:
        lista.append(hecho.nuevo)
    set_config(db, SEDES_KEY, json.dumps(lista))
    set_config(db, SETTINGS_UPDATED_KEY, ahora.isoformat())

    # Las tarifas de la sede: sin esto quedaban huérfanas en `by_sede[VIEJO]` y
    # la sede renombrada caía a la tarifa general.
    tarifas = reference_rates_raw(db)
    por_sede = tarifas.get("by_sede")
    if isinstance(por_sede, dict):
        suyas = [k for k in por_sede if isinstance(k, str) and normalizar(k) == hecho.viejo]
        if suyas:
            nuevas = {k: v for k, v in por_sede.items() if k not in suyas}
            nuevas[hecho.nuevo] = por_sede[suyas[0]]
            set_config(db, RATES_KEY, json.dumps({**tarifas, "by_sede": nuevas}))
            set_config(db, RATES_UPDATED_KEY, ahora.isoformat())

    # La libreta de contactos de la sede: igual que las tarifas, está escrita con
    # el nombre. Sin esto el admin y la mercaderista de la sede dejaban de recibir
    # los avisos comerciales y las órdenes de montaje.
    libreta = get_contacts(db)
    de_la_vieja = [k for k in libreta["by_sede"] if normalizar(k) == hecho.viejo]
    if de_la_vieja:
        por_sede_c = {k: v for k, v in libreta["by_sede"].items() if k not in de_la_vieja}
        destino = por_sede_c.get(normalizar(hecho.nuevo), {})
        for k in de_la_vieja:
            for rol_c, correos in libreta["by_sede"][k].items():
                destino[rol_c] = list(dict.fromkeys([*destino.get(rol_c, []), *correos]))
        por_sede_c[normalizar(hecho.nuevo)] = destino
        save_contacts(db, libreta["gerente"], por_sede_c)

    anotar(
        db, request, rol, "sede.renombrar", entidad="sede", entidad_id=hecho.nuevo,
        detalle=f"{hecho.viejo} → {hecho.nuevo} · {hecho.espacios} espacios · {hecho.montajes} montajes",
    )
    try:
        db.commit()
    except IntegrityError:
        # Otra sede con el nombre nuevo nació en el medio (`UNIQUE sede`).
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": "sede_existe", "message": f"Ya hay una sede «{hecho.nuevo}»: elegí otro nombre.",
                    "motivos": []},
        )
    fila = db.get(LayoutSnapshot, snap_id) if snap_id is not None else None
    out = _to_out(fila) if fila is not None else LayoutOut(sede=hecho.nuevo, fixtures=[])
    _con_nombre_viejo(db, [out])
    return RenombreSedeOut(
        sede=hecho.nuevo, fixtures=out.fixtures, updated_at=out.updated_at, settings_updated_at=ahora,
        espacios=hecho.espacios, contratos=hecho.contratos, montajes=hecho.montajes, avisos=hecho.avisos,
    )


# ─── Las repisas del 3D: pasar a contrato (auditoría P1-15) ───────────────────
# Tres segmentos y más: no las traga "/{sede}".


class RepisaAContratoIn(BaseModel):
    #: La cara o la parte del mueble donde queda el contrato («GON-03»,
    #: «GON-03-B», «GON-03-TR2»), con o sin la sede.
    espacio: str = Field(min_length=1, max_length=200)


def _repisa(db: Session, sede: str, fixture_id: str, slot_id: str):
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if snap is None:
        raise HTTPException(status_code=404, detail=f"«{sede}» no tiene plano guardado.")
    try:
        fixtures = json.loads(snap.fixtures_json or "[]")
    except (ValueError, TypeError):
        fixtures = []
    mueble = next((f for f in fixtures if isinstance(f, dict) and f.get("id") == fixture_id), None)
    if mueble is None:
        raise HTTPException(status_code=404, detail="Ese mueble no está en el plano guardado: guardá el plano y volvé a intentar.")
    repisa = next((x for x in mueble.get("slots") or [] if isinstance(x, dict) and x.get("id") == slot_id), None)
    if repisa is None:
        raise HTTPException(status_code=404, detail="Esa repisa no está en el plano guardado.")
    return snap, fixtures, mueble, repisa


def _repisa_limpia(repisa: dict) -> None:
    """Lo comercial de la repisa, en vacío (la geometría queda)."""
    repisa.update({"status": "free", "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
                   "startDate": "", "endDate": ""})


@router.post("/{sede}/repisas/{fixture_id}/{slot_id}/contrato")
def repisa_a_contrato(
    sede: str, fixture_id: str, slot_id: str, cuerpo: RepisaAContratoIn, request: Request,
    background_tasks: BackgroundTasks, rol: str = Depends(require_admin),
    cliente: Cliente = Depends(cliente_del_pedido), db: Session = Depends(get_db),
):
    """«Pasar a contrato»: lo vendido en una repisa del 3D (proveedor, «Valor
    (COP/mes)» y fechas, que vivían sólo en el JSON) pasa a ser un contrato de
    verdad de la cara o la parte ``espacio`` de ese mueble, y la repisa queda
    libre. Todo en una transacción.

    Es la revisión y el alta de Vender (``bulk_leases.confirmar_lote`` sin las
    reglas de la planilla): los candados del mueble, ``contratos_que_chocan``,
    las participaciones, la regla «entera o por partes» y la bitácora
    (``contrato.alta`` · «repisa del 3D»). El valor de la repisa era AL MES:
    el total es ese valor × los meses del plazo, al peso, y se guarda la forma
    «mensual». Si el plano cambió entre que se leyó y se escribe, 409 y no queda
    nada. Sólo administración.
    """
    snap, _fixtures, mueble, repisa = _repisa(db, sede, fixture_id, slot_id)
    leido = snap.updated_at
    proveedor = str(repisa.get("supplierName") or "").strip()
    if not proveedor:
        raise HTTPException(status_code=409, detail="La repisa no tiene proveedor: no hay qué pasar a contrato. Liberala.")
    desde = _fecha_iso(repisa.get("startDate"))
    hasta = _fecha_iso(repisa.get("endDate"))
    if desde is None or hasta is None or hasta < desde:
        raise HTTPException(status_code=409, detail=(
            "A la repisa le faltan las fechas (o están al revés): así no es un contrato. Liberala y vendé "
            "lo suyo en Vender."))
    try:
        al_mes = al_peso(float(repisa.get("negotiatedValue") or 0))
    except (TypeError, ValueError):
        al_mes = 0.0
    total = al_peso(al_mes * meses_entre(desde, hasta)) if al_mes > 0 else 0.0

    from app.routers.bulk_leases import FilaIn, LoteIn, confirmar_lote, validar_lote
    from app.services.layout_lookup import PlanoIndexado

    resuelto = PlanoIndexado(db).resolver(sede, cuerpo.espacio)
    if resuelto is None or (resuelto.fixture or {}).get("id") != fixture_id:
        raise HTTPException(status_code=409, detail=f"«{cuerpo.espacio}» no es una cara ni una parte de este mueble.")
    lote = LoteIn(sede=sede, filas=[FilaIn(
        fila=1, espacio=cuerpo.espacio, sede=sede, proveedor=proveedor,
        marca=str(repisa.get("brandCategory") or "").strip() or None, valor=total,
        desde=desde.isoformat(), hasta=hasta.isoformat(),
    )])
    previa = validar_lote(db, lote, planilla=False).filas[0]
    if previa.estado == "error":
        raise HTTPException(status_code=409, detail={
            "code": "repisa_no_pasa", "message": "La repisa no se puede pasar a contrato así.",
            "choques": previa.mensajes})

    def limpiar_la_repisa(creados):
        if not creados:
            raise HTTPException(status_code=409, detail={
                "code": "repisa_no_pasa", "message": "Otra persona vendió ese espacio mientras tanto.",
                "choques": []})
        if al_mes > 0:
            db.add(CondicionesDeContrato(lease_id=creados[0].lease_id, modo_precio="mensual", valor_tecleado=al_mes))
        # Se relee el plano DESPUÉS de los candados (`confirmar_lote` venció la
        # sesión) y se escribe sólo si sigue en la revisión que se leyó.
        fresco, fixtures, _m, la_repisa = _repisa(db, sede, fixture_id, slot_id)
        _repisa_limpia(la_repisa)
        escritas = (db.query(LayoutSnapshot)
                    .filter(LayoutSnapshot.id == fresco.id, LayoutSnapshot.updated_at == leido)
                    .update({LayoutSnapshot.fixtures_json: json.dumps(fixtures),
                             LayoutSnapshot.updated_at: datetime.now(timezone.utc)}, synchronize_session=False))
        if escritas == 0:
            raise HTTPException(status_code=409, detail=(
                f"El plano de «{sede}» cambió mientras se pasaba la repisa: recargá y volvé a intentar."))

    try:
        hecho = confirmar_lote(db, lote, background_tasks, cliente, planilla=False, request=request, rol=rol,
                               origen="repisa del 3D", antes_del_commit=limpiar_la_repisa)
    except Exception:
        db.rollback()
        raise
    fila = next((f for f in hecho.filas if f.lease_id), None)
    db.refresh(snap)
    return {"lease_id": fila.lease_id if fila else None, "espacio": fila.codigo if fila else None,
            "valor_total": total, "valor_al_mes": al_mes, "layout": _to_out(snap).model_dump(mode="json"),
            "avisos": hecho.avisos.model_dump() if hecho.avisos else None}


def _fecha_iso(valor):
    try:
        return date.fromisoformat(str(valor or "").strip()[:10])
    except ValueError:
        return None


# ─── La papelera de sedes (auditoría P2-18) ───────────────────────────────────
# Literal antes de "/{sede}", como manda la regla de este router.


@router.get("/papelera")
def papelera_de_sedes(response: Response, rol: str = Depends(require_admin), db: Session = Depends(get_db)):
    """Las sedes borradas que todavía se pueden restaurar (30 días). Sólo
    administración: dice cuántos contratos cerró cada borrado."""
    _no_store(response)
    return {"dias": papelera.DIAS_EN_LA_PAPELERA, "sedes": papelera.listar(db)}


@router.post("/papelera/{papelera_id}/restaurar")
def restaurar_sede(papelera_id: int, request: Request, rol: str = Depends(require_admin),
                   db: Session = Depends(get_db)):
    """Devuelve una sede borrada: el plano, sus espacios con sus códigos y los
    contratos que el borrado cerró y siguen en fecha (``services/papelera.py``).
    Todo o nada, con la bitácora adentro."""
    try:
        hecho = papelera.restaurar(db, papelera_id, actor_de(request, rol))
        anotar(db, request, rol, "sede.restaurada", entidad="sede", entidad_id=hecho["sede"],
               detalle=f"{hecho['espacios']} espacios · {hecho['contratos']} contratos vuelven a correr")
        db.commit()
    except Exception:
        db.rollback()
        raise
    return hecho


@router.get("/{sede}", response_model=LayoutOut)
def get_layout(sede: str, response: Response, role: str = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the fixture layout for a single sede (empty list if none saved yet)."""
    _no_store(response)
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    out = _to_out(snap) if snap else LayoutOut(sede=sede, fixtures=[])
    _con_nombre_viejo(db, [out])
    if role != "admin":
        _redact_fixtures_for_worker(out.fixtures)
    return out


# ─── Write ────────────────────────────────────────────────────────────────────


def _escritura_perdida(db: Session, sede: str) -> HTTPException:
    """El 409 de un guardado que llegó tarde (fase 2 · I5): la fila del plano
    ya no está en la revisión que se leyó al empezar —otro equipo guardó, una
    renumeración o un renombre la movió— o ya no existe. Con la sesión ya
    deshecha: lo que se lee acá es lo que hay."""
    actual = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    if actual is None:
        return HTTPException(
            status_code=409,
            detail={"code": "layout_deleted", "message": f"«{sede}» fue eliminada desde otro equipo."},
        )
    guardada = _as_utc(actual.updated_at)
    return HTTPException(
        status_code=409,
        detail={
            "code": "layout_conflict",
            "message": (
                f"Otro equipo guardó cambios en «{sede}» mientras editabas. "
                "Actualizá para ver la versión del servidor antes de volver a guardar."
            ),
            "server_updated_at": guardada.isoformat() if guardada else None,
        },
    )


@router.put("/{sede}", response_model=LayoutOut, dependencies=[Depends(require_admin)])
def save_layout(sede: str, payload: LayoutIn, request: Request, db: Session = Depends(get_db)):
    """Upsert the fixture layout for a sede — creates or replaces atomically.

    When the client sends ``base_updated_at`` the write is rejected with 409 if
    another workstation saved this sede in the meantime, so a client holding a
    stale copy can no longer silently wipe someone else's work.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    # La revisión que se leyó, ANTES de cualquier candado (fase 2 · I5). El
    # `expire_all` de `_candados_del_guardado` relee `snap` de la base: lo que
    # se compara al escribir es lo que se leyó acá, no lo que haya después.
    # Ver la escritura condicional al final.
    leido = snap.updated_at if snap else None
    snap_id = snap.id if snap else None

    # The row is gone but this client is saving on top of a revision it once
    # read: the sede was deleted from another workstation while it held a copy.
    # Falling through would upsert the row back — the deletion undone silently,
    # on every workstation, by whoever happened to have unsaved edits. Only a
    # genuine first write (no base revision: bootstrap or an explicit force)
    # may create a snapshot.
    if snap is None and payload.base_updated_at is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "layout_deleted",
                "message": f"«{sede}» fue eliminada desde otro equipo.",
            },
        )

    if snap and payload.base_updated_at is not None:
        stored = _as_utc(snap.updated_at)
        base = _as_utc(payload.base_updated_at)
        if stored and base and _truncate_ms(stored) != _truncate_ms(base):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "layout_conflict",
                    "message": (
                        f"Otro equipo guardó cambios en «{sede}» mientras editabas. "
                        "Actualizá para ver la versión del servidor antes de volver a guardar."
                    ),
                    "server_updated_at": stored.isoformat(),
                },
            )

    fixtures = payload.fixtures
    # El nombre viejo es del servidor: viaja en la respuesta y no se guarda.
    _sin_nombre_viejo(fixtures)
    # El contrato es de la base. Ver `CAMPOS_DE_CONTRATO`.
    _sin_contrato(fixtures)
    if snap:
        try:
            previous = json.loads(snap.fixtures_json or "[]")
        except (ValueError, TypeError):
            previous = []
        if not isinstance(previous, list):
            previous = []

        # Una pestaña de antes no borra la ficha que escribió una de ahora; un
        # `null` sí la borra. Antes de las guardas de abajo: miran el plano tal
        # como va a quedar. Ver `CLAVES_DE_FICHA`.
        _con_la_ficha_de_antes(fixtures, previous)

        # ── El guardarraíl que faltaba (fase 12, F7) ──────────────────────────
        #
        # Un mueble tiene UN nombre y es su código, así que la regla es «no dos
        # muebles con el mismo nombre en la sede». Pero aplicada a secas dejaría
        # sin poder guardarse a un plano que YA está mal —CIUDAD JARDIN tiene
        # seis nombres que pisan el código de otro— y eso rompería la regla que
        # no se negocia: el plano roto se abre, se mira, se mueve y se guarda.
        #
        # Entonces se rechaza sólo lo que este guardado CREA, comparando contra
        # el snapshot anterior. Un intercambio de nombres entre dos muebles, o
        # una cadena de renombres, no sube la cuenta de ningún nombre y pasa.
        #
        # Un plano que entra por primera vez (``snap`` es None) no se compara con
        # nada y entra: es como llega un plano existente —el arranque, la
        # sincronización desde otro equipo, una restauración— y trabarlo ahí
        # sería hacerlo inimportable, no más seguro.
        choques = choques_nuevos(
            [f for f in previous if isinstance(f, dict)],
            [f for f in fixtures if isinstance(f, dict)],
        )
        if choques:
            # Los ``id`` internos no van en el mensaje: no aparecen en ninguna
            # pantalla y nombrar con ellos es tan útil como no nombrar. Y no
            # hay que consolarse pensando que quedan en el registro — acá se
            # escriben las mismas frases, sin ids, y este proyecto no configura
            # logging, así que bajo uvicorn esta línea puede no salir a ningún
            # lado. El mensaje del 409 es lo que la persona ve y tiene que
            # bastarse solo: por eso nombra a los muebles por su nombre.
            logger.info(
                "layout %s: guardado rechazado por nombres repetidos — %s",
                sede, " · ".join(choques),
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "nombres_repetidos",
                    "message": (
                        f"Este guardado dejaría nombres repetidos en «{sede}» que "
                        "antes no estaban."
                    ),
                    "choques": choques,
                },
            )

        # ── Un nombre que se lee como una parte ───────────────────────────────
        #
        # Con la venta por partes, `NEV-03-PU2` es la puerta 2 de `NEV-03`. Un
        # mueble que se llamara así —o `GON-01-B`, o `GON-01-TR2`, el token de
        # lo que viene— tendría un código que se lee como una parte de otro.
        # Sólo lo que este guardado agrega: un plano viejo con un nombre así se
        # sigue guardando.
        reservados = nombres_reservados_nuevos(
            [f for f in previous if isinstance(f, dict)],
            [f for f in fixtures if isinstance(f, dict)],
        )
        if reservados:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "nombre_reservado",
                    "message": (
                        f"Este guardado le pondría a {len(reservados)} mueble(s) de «{sede}» un "
                        "nombre que se lee como el código de una parte."
                    ),
                    "choques": reservados,
                },
            )

        # ── Medidas que no se pueden dibujar (fase 2 · I5) ───────────────────
        #
        # Un ancho infinito o un módulo de 1e-9 colgaban el 3D de quien abriera
        # el plano. Sólo lo que este guardado crea o cambia: un plano que ya
        # traía una medida rota se sigue guardando. Ver `medidas_imposibles`.
        imposibles = medidas_imposibles(
            [f for f in previous if isinstance(f, dict)],
            [f for f in fixtures if isinstance(f, dict)],
        )
        if imposibles:
            logger.info(
                "layout %s: guardado rechazado por medidas imposibles — %s",
                sede, " · ".join(imposibles),
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "medidas_imposibles",
                    "message": (
                        f"Este guardado le pondría a {len(imposibles)} mueble(s) de «{sede}» "
                        "medidas que no se pueden dibujar."
                    ),
                    "choques": imposibles,
                },
            )

        # Los candados de los muebles que este guardado retira, cuya forma de
        # venderse por partes cambia o cuya cara entra o sale de «por
        # participación»: una venta que confirma al mismo tiempo espera, y las
        # guardas de abajo leen los contratos y los términos ya con el
        # candado puesto y la sesión fresca (`services/candado.py`).
        _candados_del_guardado(db, sede, previous, fixtures)

        # ── La tercera puerta: sacar de circulación algo que está vendido ────
        #
        # Borrar el mueble, pasar la góndola de doble a simple o marcarlo «no
        # comercializable» retira el espacio de la venta — y dejaba su contrato
        # vivo en la base, sin nada en pantalla que lo mostrara. Ése es el caso
        # que se reportó: «está libre y el sistema dice que está ocupado».
        #
        # Se frena acá porque es el único lugar por el que pasan las tres
        # puertas y los cuatro caminos de borrado. Y se frena en vez de cancelar
        # solo: cancelar un contrato es plata y un compromiso con un proveedor,
        # no lo decide un guardado del plano. Se dice cuál, y el guardado queda
        # pendiente hasta que la persona cancele o devuelva el mueble.
        huerfanos = contratos_que_quedarian_sin_mueble(
            db, sede,
            [f for f in previous if isinstance(f, dict)],
            [f for f in fixtures if isinstance(f, dict)],
        )
        if huerfanos:
            logger.info(
                "layout %s: guardado rechazado por contratos sin mueble — %s",
                sede, " · ".join(huerfanos),
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "contratos_vivos",
                    "message": (
                        f"Este guardado sacaría de «{sede}» {len(huerfanos)} "
                        f"espacio(s) que tienen contrato vivo."
                    ),
                    "choques": huerfanos,
                },
            )

        # ── La cuarta: mover una parte vendida ───────────────────────────────
        #
        # La puerta vendida que sigue existiendo pero en otro lugar: con la
        # puerta 1 vendida, pasar la nevera de 3 a 2 puertas convierte la
        # «puerta 1» en otra hoja, y lo que firmó el proveedor ya no es lo que
        # se monta. Lo que desaparece lo frenó la de arriba.
        movidas = partes_que_se_moverian(
            db, sede,
            [f for f in previous if isinstance(f, dict)],
            [f for f in fixtures if isinstance(f, dict)],
        )
        if movidas:
            logger.info(
                "layout %s: guardado rechazado por partes vendidas — %s",
                sede, " · ".join(movidas),
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "partes_vendidas",
                    "message": (
                        f"Este guardado movería {len(movidas)} parte(s) que tienen contrato "
                        f"vivo o firmado en «{sede}»."
                    ),
                    "choques": movidas,
                },
            )

        # ── Participaciones de cara (diseño §4.4) ─────────────────────────────
        #
        # Una cara que deja de venderse por participación con términos vivos
        # (las reservas provisionales no son leases: la de contratos vivos no
        # las ve); un mueble que pasa a participación con espacios internos
        # vendidos; y un espacio interno que se vende en un mueble por
        # participación. Sólo lo que este guardado cambia.
        previas = [f for f in previous if isinstance(f, dict)]
        nuevas = [f for f in fixtures if isinstance(f, dict)]
        for code, frases, mensaje in (
            ("participaciones_vivas", participaciones_vivas(db, sede, previas, nuevas),
             "Este guardado cambiaría cómo se vende(n) {n} cara(s) de «{sede}» con participaciones vivas."),
            ("slots_vendidos_en_participacion", slots_vendidos_en_participacion(previas, nuevas),
             "Este guardado pasaría a participación {n} mueble(s) de «{sede}» con espacios internos vendidos."),
            ("slots_en_participacion", slots_en_participacion(previas, nuevas),
             "Este guardado vendería espacios internos en {n} mueble(s) de «{sede}» que se venden por "
             "participación."),
            # Auditoría P1-15: la venta paralela por repisa, en cualquier mueble.
            ("repisas_vendidas", slots_vendidos_en_el_plano(previas, nuevas),
             "Este guardado vendería repisas del 3D en {n} mueble(s) de «{sede}»: lo vendido va con contrato."),
        ):
            if frases:
                logger.info("layout %s: guardado rechazado (%s) — %s", sede, code, " · ".join(frases))
                raise HTTPException(
                    status_code=409,
                    detail={"code": code, "message": mensaje.format(n=len(frases), sede=sede),
                            "choques": frases},
                )

        # La historia de las caras por participación que este guardado cambia
        # (pasó a / dejó de venderse así; una confirmada que queda para revisar).
        _historial_del_guardado(db, sede, previas, nuevas, actor_de(request, "admin"))

        # El precio del MUEBLE ya no viaja en el layout —es de la base— pero el
        # de cada repisa sí, y sigue saliendo redactado para un mercaderista.
        # Sin esto, un guardado hecho desde una copia redactada borraría la
        # plata de todos los slots de la sede sin manera de recuperarla.
        _restore_missing_slot_prices(fixtures, previous)
        # ── La escritura condicional (fase 2 · I5) ────────────────────────────
        #
        # `base_updated_at` se comparó arriba, ANTES de los candados: dos
        # guardados con la misma base pasaban los dos, y uno podía pisar una
        # renumeración (o un renombre de sede) que entró en el medio —con
        # `previous` viejo, los códigos viejos volvían y los contratos quedaban
        # sin mueble—. Ahora la fila se escribe SÓLO si sigue en la revisión
        # que se leyó al empezar: si otra escritura la movió, cero filas, nada
        # escrito y 409. No es un `FOR UPDATE` arriba a propósito: invertiría
        # el orden candado → fila de la renumeración y del archivo de la sede,
        # y se abrazarían (`sede_archive._tomar_candados_de_participaciones`).
        # Con éxito, `previous` era el vigente: las guardas leyeron lo correcto.
        #
        # `updated_at` se pone siempre: con el mismo JSON, SQLAlchemy no
        # escribiría nada y la revisión quedaría vieja.
        escritas = (
            db.query(LayoutSnapshot)
            .filter(LayoutSnapshot.id == snap_id, LayoutSnapshot.updated_at == leido)
            .update(
                {LayoutSnapshot.fixtures_json: json.dumps(fixtures),
                 LayoutSnapshot.updated_at: datetime.now(timezone.utc)},
                synchronize_session=False,
            )
        )
        if escritas == 0:
            db.rollback()
            raise _escritura_perdida(db, sede)
    else:
        # Primer guardado de la sede: nada que conservar, pero un `null` de la
        # ficha tampoco se guarda.
        _con_la_ficha_de_antes(fixtures, [])
        snap = LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures))
        db.add(snap)
    # Una línea de resumen por guardado (auditoría P2-14): la sede y cuántos
    # muebles quedaron; el detalle del plano está en sus revisiones.
    anotar(db, request, "admin", "plano.guardado", entidad="sede", entidad_id=sede,
           detalle=f"{len([f for f in fixtures if isinstance(f, dict)])} mueble(s)")
    try:
        db.commit()
    except IntegrityError:
        # Dos «primeros guardados» de la misma sede a la vez: los dos leyeron
        # que no había fila e insertaron, y el segundo chocaba con `UNIQUE
        # sede` → 500. Pierde como cualquier escritura vieja: 409.
        db.rollback()
        raise _escritura_perdida(db, sede)
    # El `commit` vence lo que la sesión tenía; esto relee la fila escrita
    # (la escritura condicional no tocó el objeto en memoria).
    db.refresh(snap)
    out = _to_out(snap)
    # La respuesta del guardado tiene la misma forma que la de una lectura: el
    # recuerdo vuelve puesto aunque el guardado lo haya sacado. Así ningún
    # cliente que se quede con lo que le contesta el PUT pierde el nombre viejo
    # hasta la próxima bajada completa.
    _con_nombre_viejo(db, [out])
    return out


@router.get("/{sede}/impact", dependencies=[Depends(require_admin)])
def delete_impact(sede: str, db: Session = Depends(get_db)):
    """What deleting this sede would close on the commercial side.

    The confirmation dialog counts fixtures and shelves out of the layout
    snapshot, which is a different set from the normalised spaces: only a
    fixture someone pressed "Guardar contrato" on has rows here. Both numbers
    matter, and only the server knows this one.

    Two segments, so unlike ``/revisions`` and ``/settings`` this one does not
    have to be declared before the ``/{sede}`` catch-all: that route matches a
    single segment and cannot swallow this path.
    """
    return count_commercial_rows(db, sede)


@router.delete("/{sede}", status_code=204)
def delete_layout(
    sede: str,
    request: Request,
    rol: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Drop a sede's snapshot entirely.

    Without this, removing a sede only took it out of the shared list while its
    snapshot lived on, so every other workstation kept downloading the fixtures
    of a sede that no longer exists.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    # Antes de borrar: el plano como estaba va a la papelera (P2-18, abajo).
    plano_de_antes = LayoutSnapshot(sede=snap.sede, fixtures_json=snap.fixtures_json) if snap else None
    if snap:
        db.delete(snap)

    # Close the sede's commercial rows in the same transaction. They are not
    # deleted — they are billing history — but leaving them live meant expiry
    # emails for a sede nobody could open, and a sede recreated under the same
    # name inheriting the old one's contracts through find_or_create_space.
    # Quien borra queda en `baja_por` de las reservas y los contratos de
    # participación que el archivo cancela, y en su historial.
    archived = archive_sede_spaces(db, sede, actor=actor_de(request, rol))

    # Drop the name from the shared list too, in the same commit. Leaving that
    # to a separate settings PUT from the client made the deletion two
    # independent writes that could half-land: the snapshot gone but the name
    # still listed (a phantom sede nobody can remove, since the sede list is
    # only ever unioned, never trimmed), or the name gone but the snapshot
    # alive, which the next pull re-adopts and re-publishes.
    try:
        sedes = json.loads(get_config(db, SEDES_KEY) or "[]")
    except (ValueError, TypeError):
        sedes = []
    remaining = [s for s in sedes if s != sede]
    if remaining != sedes:
        set_config(db, SEDES_KEY, json.dumps(remaining))
        set_config(db, SETTINGS_UPDATED_KEY, datetime.now(timezone.utc).isoformat())

    # La papelera (auditoría P2-18): el plano y lo que se cerró, por 30 días,
    # para restaurarlo desde Ajustes › Sedes. En la misma transacción.
    if plano_de_antes is not None or archived["space_ids"] or remaining != sedes:
        papelera.guardar(db, sede, plano_de_antes, archived, remaining != sedes, actor_de(request, rol))

    # Es el borrado más grande que ofrece el sistema —se lleva el plano, y con
    # él la sede de la lista— así que va a la bitácora con el estropicio contado.
    anotar(
        db, request, rol, "sede.baja", entidad="sede", entidad_id=sede,
        detalle=(
            f"{archived['spaces']} espacios archivados · "
            f"{archived['leases_closed']} contratos cerrados"
            + (" · " + _plural(archived["reservas_canceladas"],
                               "reserva provisional de participación cancelada",
                               "reservas provisionales de participación canceladas")
               if archived.get("reservas_canceladas") else "")
        ),
    )
    db.commit()
    if archived["spaces"] or archived["mounts_archived"]:
        logger.info(
            "sede %s eliminada: %s espacios archivados, %s contratos cerrados, "
            "%s montajes archivados",
            sede, archived["spaces"], archived["leases_closed"],
            archived["mounts_archived"],
        )
    return Response(status_code=204)
