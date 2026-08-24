"""Libreta de contactos: quién se entera de qué, por sede y por rol.

Vive en ``app_config`` bajo ``notify_contacts`` porque la regla del proyecto es
que no hay migraciones, y porque no amerita una tabla: son unas pocas
direcciones que cambian una vez al año.

La estructura refleja la organización real del cliente — un administrador
distinto por sede y un gerente operacional que los supervisa — y NO se modela
como usuarios del sistema: nadie de estos inicia sesión por recibir un correo.
"""
import json

from sqlalchemy.orm import Session

from app.auth import get_config, set_config
from app.services.mailer import clean_recipients

CONTACTS_KEY = "notify_contacts"

# Roles que reciben aviso. El mercaderista es el único que NO recibe dinero:
# es quien va a montar el espacio, y en toda la app un worker jamás ve precios.
ROLES = ("admin", "mercaderista")


def get_contacts(db: Session) -> dict:
    """Devuelve ``{"gerente": [...], "by_sede": {SEDE: {"admin": [...], "mercaderista": [...]}}}``."""
    try:
        stored = json.loads(get_config(db, CONTACTS_KEY) or "{}")
    except ValueError:
        stored = {}
    if not isinstance(stored, dict):
        stored = {}

    by_sede_raw = stored.get("by_sede")
    by_sede: dict[str, dict[str, list[str]]] = {}
    if isinstance(by_sede_raw, dict):
        for sede, roles in by_sede_raw.items():
            if not isinstance(sede, str) or not isinstance(roles, dict):
                continue
            entry = {role: clean_recipients(roles.get(role)) for role in ROLES}
            if any(entry.values()):
                by_sede[sede.strip().upper()] = entry

    return {"gerente": clean_recipients(stored.get("gerente")), "by_sede": by_sede}


def save_contacts(db: Session, gerente, by_sede) -> dict:
    """Reemplaza la libreta completa. El llamador hace commit."""
    clean_by_sede: dict[str, dict[str, list[str]]] = {}
    for sede, roles in (by_sede or {}).items():
        name = str(sede).strip().upper()
        if not name:
            continue
        entry = {role: clean_recipients((roles or {}).get(role)) for role in ROLES}
        if any(entry.values()):
            clean_by_sede[name] = entry

    payload = {"gerente": clean_recipients(gerente), "by_sede": clean_by_sede}
    set_config(db, CONTACTS_KEY, json.dumps(payload))
    return payload


def recipients_for(db: Session, sede: str | None) -> dict[str, list[str]]:
    """Quién recibe qué para una sede concreta.

    ``comercial`` reúne a quienes pueden ver plata: el gerente operacional y el
    administrador de esa sede. ``montaje`` es el mercaderista, que recibe una
    orden de trabajo sin valores.

    Cuando la libreta está vacía se cae a ``notify_emails``, que es la lista
    global de siempre — así una instalación que todavía no cargó contactos
    sigue avisando a alguien en vez de quedarse muda.
    """
    book = get_contacts(db)
    key = (sede or "").strip().upper()
    per_sede = book["by_sede"].get(key, {})

    comercial = clean_recipients([*book["gerente"], *per_sede.get("admin", [])])
    montaje = clean_recipients(per_sede.get("mercaderista", []))

    if not comercial and not montaje:
        legacy = (get_config(db, "notify_emails", "") or "").split(",")
        comercial = clean_recipients(legacy)

    return {"comercial": comercial, "montaje": montaje}
