import copy
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import get_config, require_admin, require_auth, set_config
from app.database import get_db
from app.models.models import LayoutSnapshot
from app.services.bitacora import anotar
from app.services.catalogo_muebles import tipo_base
from app.services.sede_archive import archive_sede_spaces, count_commercial_rows
from app.services.candado import tomar_candados
from app.services.catalogo_muebles import CAMPOS_DE_PARTES
from app.services.layout_lookup import (
    CAMPOS_DE_CONTRATO,
    CLAVES_DE_FICHA,
    choques_nuevos,
    contratos_que_quedarian_sin_mueble,
    espacios_ofrecidos,
    nombres_reservados_nuevos,
    normalizar,
    partes_que_se_moverian,
)
from app.services.partes import firma_de_partes
from app.services.renumeracion import (
    InvarianteRoto,
    RenumeracionBloqueada,
    aplicar as aplicar_renumeracion,
    nombres_anteriores,
    planificar,
)
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
    no veía el contrato todavía y la venta no veía el plano todavía."""
    previas = [f for f in previas if isinstance(f, dict)]
    nuevas = [f for f in nuevas if isinstance(f, dict)]
    codigos = set(espacios_ofrecidos(previas, sede) ^ espacios_ofrecidos(nuevas, sede))
    firmas = {normalizar(f.get("code")): firma_de_partes(f) for f in previas if normalizar(f.get("code"))}
    for f in nuevas:
        code = normalizar(f.get("code"))
        if code in firmas and firmas[code] != firma_de_partes(f):
            codigos.add(f"{normalizar(sede)}-{code}" if not code.startswith(f"{normalizar(sede)}-") else code)
    if codigos:
        tomar_candados(db, codigos)


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


@router.put("/settings", response_model=LayoutSettingsOut, dependencies=[Depends(require_admin)])
def save_settings(payload: LayoutSettingsIn, db: Session = Depends(get_db)):
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


@router.put("/seasons", response_model=SeasonWindowsOut, dependencies=[Depends(require_admin)])
def save_season_windows(payload: SeasonWindowsIn, db: Session = Depends(get_db)):
    """Replace the season windows. Same for every sede — they are not per-store."""
    now = datetime.now(timezone.utc)
    clean = {
        key.strip(): {"before": w.before, "after": w.after}
        for key, w in payload.windows.items()
        if key.strip()
    }
    set_config(db, SEASONS_KEY, json.dumps(clean))
    set_config(db, SEASONS_UPDATED_KEY, now.isoformat())
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
        if number > 0:
            clean[key.strip()] = number
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


@router.put("/rates", response_model=ReferenceRatesOut, dependencies=[Depends(require_admin)])
def save_reference_rates(payload: ReferenceRatesIn, db: Session = Depends(get_db)):
    """Replace the reference rates. Sede keys are normalised like sede names."""
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
        aplicar_renumeracion(db, planes)
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


@router.put("/{sede}", response_model=LayoutOut, dependencies=[Depends(require_admin)])
def save_layout(sede: str, payload: LayoutIn, db: Session = Depends(get_db)):
    """Upsert the fixture layout for a sede — creates or replaces atomically.

    When the client sends ``base_updated_at`` the write is rejected with 409 if
    another workstation saved this sede in the meantime, so a client holding a
    stale copy can no longer silently wipe someone else's work.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()

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

        # Los candados de los muebles que este guardado retira o cuya forma de
        # venderse por partes cambia: una venta que confirma al mismo tiempo
        # espera, y la guarda de abajo lee los contratos ya con el candado
        # puesto (`services/candado.py`).
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

        # El precio del MUEBLE ya no viaja en el layout —es de la base— pero el
        # de cada repisa sí, y sigue saliendo redactado para un mercaderista.
        # Sin esto, un guardado hecho desde una copia redactada borraría la
        # plata de todos los slots de la sede sin manera de recuperarla.
        _restore_missing_slot_prices(fixtures, previous)
        snap.fixtures_json = json.dumps(fixtures)
        # fixtures_json is unchanged when a client re-saves identical data, and
        # SQLAlchemy would then skip the UPDATE and leave updated_at stale.
        snap.updated_at = datetime.now(timezone.utc)
    else:
        # Primer guardado de la sede: nada que conservar, pero un `null` de la
        # ficha tampoco se guarda.
        _con_la_ficha_de_antes(fixtures, [])
        snap = LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures))
        db.add(snap)
    db.commit()
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
    if snap:
        db.delete(snap)

    # Close the sede's commercial rows in the same transaction. They are not
    # deleted — they are billing history — but leaving them live meant expiry
    # emails for a sede nobody could open, and a sede recreated under the same
    # name inheriting the old one's contracts through find_or_create_space.
    archived = archive_sede_spaces(db, sede)

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

    # Es el borrado más grande que ofrece el sistema —se lleva el plano, y con
    # él la sede de la lista— así que va a la bitácora con el estropicio contado.
    anotar(
        db, request, rol, "sede.baja", entidad="sede", entidad_id=sede,
        detalle=(
            f"{archived['spaces']} espacios archivados · "
            f"{archived['leases_closed']} contratos cerrados"
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
