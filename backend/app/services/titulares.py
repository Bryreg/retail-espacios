"""Los derechos de UNA persona, en todas las bases donde aparece (auditoría
pre-lanzamiento, P1-14; Ley 1581 de 2012, arts. 8, 14 y 15).

Hasta acá los derechos del titular eran del SUPERMERCADO (el export y la
solicitud de supresión de la dueña, ``routers/derechos.py``): no había forma de
contestarle a una persona concreta —una administradora que se fue, el contacto
de una marca— qué datos suyos hay ni de borrárselos. Esto lo hace, en dos
caminos:

* **el operador** (``POST /api/plataforma/titulares/exportar`` y ``…/suprimir``)
  busca a la persona por su correo (o por su teléfono, o por el proveedor del
  que es contacto) en el REGISTRO y en la base de CADA supermercado;
* **la persona misma** (``GET /api/auth/mis-datos``) baja lo suyo: su cuenta y
  lo que la menciona en los supermercados donde tiene acceso hoy.

── Cómo se busca ────────────────────────────────────────────────────────────

Por columnas, no por una lista de campos: cada columna de texto (``String`` o
``Text``; nunca un archivo) de cada tabla clasificada en
``traspaso.TABLAS_DEL_REGISTRO`` / ``TABLAS_DEL_CLIENTE``. Un correo se busca
DENTRO del texto (una nota, el JSON de la libreta de avisos, el «· correo» que
la bitácora agrega al detalle); el nombre de la cuenta, sólo donde la columna
ES el nombre de quien hizo algo (``…_por``: ``reportado_por``, ``creado_por``),
y entero: un «Ana» suelto en una nota no es esta Ana. Así, una tabla nueva queda
cubierta sin tocar este archivo.

── Qué hace la supresión ────────────────────────────────────────────────────

Anonimiza; no borra lo que la ley obliga a conservar:

* donde aparece el correo, el teléfono o el nombre se escribe
  ``titular-suprimido-<huella>`` (sin ``@``: ninguna libreta de avisos lo
  vuelve a tomar como dirección, ``mailer.clean_recipients``). Los contratos,
  los montajes, la bitácora y la facturación quedan, sin la persona;
* la cuenta (``usuarios``) queda con correo e identificador ``suprimido-<id>``
  y sin nombre, y sus membresías apagadas: no vuelve a entrar con esa fila (si
  vuelve con la misma cuenta de Google, nace una cuenta nueva, sin acceso a
  nada);
* el contacto de un proveedor pierde nombre de contacto, teléfono y correo (el
  NOMBRE del proveedor queda: es la contraparte del contrato);
* lo que no es constancia de nada se borra: las invitaciones sin usar, el alta
  en espera, los intentos de export, y la dirección dentro de un correo en cola
  (si era la única, el correo en cola se va);
* las constancias de consentimiento y de términos quedan: son la prueba de que
  se tuvo autorización mientras se trataron los datos, y ya no están unidas a
  ningún correo.

Queda una línea en la bitácora de la plataforma (``titular_export`` /
``titular_supresion``, con el supermercado en el ``periodo``: la ve después en
su reporte de transparencia), otra en la bitácora de cada supermercado tocado
(``titular.exportado`` / ``titular.suprimido``), y la constancia en
``derechos_de_titulares`` — con la HUELLA de la persona, nunca su correo.

Lo que esto NO alcanza, y por eso lo dice el procedimiento
(``docs/operacion.md`` §11): la cuenta en Firebase (se borra en su consola), los
respaldos cifrados (vencen solos a los 30 días), los logs de Render y los
buzones de quien ya recibió un correo.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import LargeBinary, String, Text, and_, func, or_, select

log = logging.getLogger("recabra.titulares")

#: Columnas que sólo se cuentan cuando la persona baja lo suyo: el cuerpo de un
#: correo en cola es el aviso entero (a otra gente, con montos), y el detalle de
#: la bitácora es de administración. El operador sí las ve.
CONTENIDO_DE_OTROS = {("correos_pendientes", "cuerpo_html"), ("audit_log", "detalle")}

#: Tablas con plata: a quien es mercaderista en ese supermercado sólo se le
#: dice cuántas veces aparece, nunca el texto (el worker nunca ve plata).
TABLAS_CON_PLATA = frozenset({
    "space_leases", "layout_snapshots", "condiciones_de_contrato", "precios_corregidos",
    "precios_de_reserva", "cobros_por_venta", "cortes_de_venta", "reservas_de_espacio",
    "participaciones", "historial_participaciones", "contratos_reemplazados", "correos_pendientes",
    "sedes_en_papelera", "supplier_asset_specs",
})

#: Largo máximo de lo que se devuelve de una columna: lo que rodea a la
#: coincidencia, no un plano entero.
_LARGO = 240
_ALREDEDOR = 90


class ErrorDeTitular(Exception):
    def __init__(self, codigo: str, texto: str, extra: Optional[dict] = None):
        super().__init__(texto)
        self.codigo = codigo
        self.texto = texto
        self.extra = extra or {}


def normalizar_correo(correo: Optional[str]) -> str:
    return (correo or "").strip().lower()


def digitos(texto: Optional[str]) -> str:
    return re.sub(r"\D", "", texto or "")


def huella(texto: str) -> str:
    """Los primeros 16 hexadecimales del SHA-256: identifica a la persona en la
    constancia sin guardar su dato."""
    return hashlib.sha256((texto or "").encode("utf-8")).hexdigest()[:16]


@dataclass
class Persona:
    """A quién se busca. ``correos`` en minúsculas; ``telefonos`` como se
    escribieron y sus dígitos; ``nombre`` sólo para las columnas de actor."""

    sujeto: str = "persona"                     # persona | contacto
    correos: list[str] = field(default_factory=list)
    telefonos: list[str] = field(default_factory=list)
    nombre: Optional[str] = None
    usuario_id: Optional[int] = None
    cliente: Optional[str] = None               # limitar a un supermercado
    proveedor_id: Optional[int] = None

    @property
    def huella(self) -> str:
        if self.sujeto == "contacto" and self.proveedor_id is not None:
            return huella(f"{self.cliente}:{self.proveedor_id}")
        base = self.correos[0] if self.correos else (digitos(self.telefonos[0]) if self.telefonos else "")
        return huella(base)

    @property
    def seudonimo(self) -> str:
        return f"titular-suprimido-{self.huella[:8]}"

    def vacia(self) -> bool:
        return not (self.correos or self.telefonos or self.usuario_id or self.proveedor_id)


# ─── Columnas y coincidencias ────────────────────────────────────────────────

def _columnas_de_texto(tabla) -> list:
    return [
        c for c in tabla.columns
        if isinstance(c.type, (String, Text)) and not isinstance(c.type, LargeBinary)
    ]


def _es_de_actor(columna) -> bool:
    return columna.name.endswith("_por")


def _condiciones(columna, persona: Persona) -> list:
    conds = [func.lower(columna).contains(c, autoescape=True) for c in persona.correos if c]
    conds += [columna.contains(t, autoescape=True) for t in persona.telefonos if len(digitos(t)) >= 7]
    if persona.nombre and len(persona.nombre.strip()) >= 3 and _es_de_actor(columna):
        conds.append(func.lower(func.trim(columna)) == persona.nombre.strip().lower())
    return conds


def _coincide(valor: str, persona: Persona, columna) -> bool:
    if not isinstance(valor, str):
        return False
    bajo = valor.lower()
    if any(c and c in bajo for c in persona.correos):
        return True
    if any(len(digitos(t)) >= 7 and t in valor for t in persona.telefonos):
        return True
    return bool(
        persona.nombre and _es_de_actor(columna)
        and bajo.strip() == persona.nombre.strip().lower()
    )


def _fragmento(valor: str, persona: Persona) -> str:
    if len(valor) <= _LARGO:
        return valor
    bajo = valor.lower()
    pos = min(
        [bajo.find(c) for c in persona.correos if c and c in bajo]
        + [valor.find(t) for t in persona.telefonos if t and t in valor]
        or [0]
    )
    desde, hasta = max(0, pos - _ALREDEDOR), pos + _ALREDEDOR
    return ("…" if desde else "") + valor[desde:hasta] + ("…" if hasta < len(valor) else "")


def _reemplazar(valor: str, persona: Persona, columna) -> str:
    nuevo = valor
    for c in persona.correos:
        if c:
            nuevo = re.sub(re.escape(c), persona.seudonimo, nuevo, flags=re.IGNORECASE)
    for t in persona.telefonos:
        if len(digitos(t)) >= 7:
            nuevo = nuevo.replace(t, persona.seudonimo)
    if (persona.nombre and _es_de_actor(columna)
            and nuevo.strip().lower() == persona.nombre.strip().lower()):
        nuevo = persona.seudonimo
    return nuevo


def _pk(tabla) -> list:
    return list(tabla.primary_key.columns)


def _id_de(fila, pks) -> object:
    valores = [fila._mapping[c] for c in pks]
    return valores[0] if len(valores) == 1 else valores


def ocurrencias(cx, tablas: Iterable, persona: Persona, *, saltear=frozenset()) -> list[dict]:
    """``[{tabla, columna, id, valor}]``: cada columna de cada fila donde aparece
    la persona. ``valor`` es lo que rodea a la coincidencia."""
    fuera = []
    for tabla in tablas:
        if tabla.name in saltear:
            continue
        pks = _pk(tabla)
        if not pks:
            continue
        for col in _columnas_de_texto(tabla):
            conds = _condiciones(col, persona)
            if not conds:
                continue
            for fila in cx.execute(select(*pks, col).where(or_(*conds))):
                valor = fila._mapping[col]
                if not _coincide(valor, persona, col):
                    continue  # el LIKE es más ancho que la coincidencia de verdad
                fuera.append({
                    "tabla": tabla.name, "columna": col.name, "id": _id_de(fila, pks),
                    "valor": _fragmento(valor, persona),
                })
    return fuera


def _anonimizar(cx, tablas: Iterable, persona: Persona, *, saltear=frozenset()) -> dict:
    """Reemplaza a la persona en cada columna de texto. ``{tabla: filas}``."""
    tocadas: dict[str, int] = {}
    for tabla in tablas:
        if tabla.name in saltear:
            continue
        pks = _pk(tabla)
        if not pks:
            continue
        for col in _columnas_de_texto(tabla):
            if col in pks:
                continue  # una clave no se reescribe (jti, slug, key)
            conds = _condiciones(col, persona)
            if not conds:
                continue
            for fila in list(cx.execute(select(*pks, col).where(or_(*conds)))):
                valor = fila._mapping[col]
                if not _coincide(valor, persona, col):
                    continue
                nuevo = _reemplazar(valor, persona, col)
                if nuevo == valor:
                    continue
                donde = and_(*[c == fila._mapping[c] for c in pks])
                cx.execute(tabla.update().where(donde).values({col.name: nuevo}))
                tocadas[tabla.name] = tocadas.get(tabla.name, 0) + 1
    return tocadas


def _tablas(nombres: Iterable[str]) -> list:
    from app.database import Base

    return [Base.metadata.tables[n] for n in sorted(nombres) if n in Base.metadata.tables]


# ─── La cuenta, en el registro ────────────────────────────────────────────────

def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _cuenta(reg, usuario_id: int) -> Optional[dict]:
    from app.models.consentimiento import Consentimiento
    from app.models.identidad import Membresia, Usuario
    from app.models.plataforma import Fundacion
    from app.models.terminos import AceptacionDeTerminos

    u = reg.get(Usuario, usuario_id)
    if u is None:
        return None
    return {
        "id": u.id,
        "correo": u.email,
        "nombre": u.nombre,
        "identificador_de_cuenta": u.firebase_uid,
        "creada_en": _iso(u.creado_en),
        "ultimo_ingreso": _iso(u.ultimo_login),
        "membresias": [
            {"supermercado": m.cliente_slug, "rol": m.rol, "activa": m.activo, "desde": _iso(m.creado_en)}
            for m in reg.query(Membresia).filter(Membresia.usuario_id == u.id).order_by(Membresia.id)
        ],
        "aceptaciones_de_la_politica": [
            {"version": c.version, "en": _iso(c.aceptado_en), "ip": c.ip, "origen": c.origen}
            for c in reg.query(Consentimiento).filter(Consentimiento.usuario_id == u.id).order_by(Consentimiento.id)
        ],
        "aceptaciones_de_los_terminos": [
            {"supermercado": a.cliente_slug, "version": a.version_terminos,
             "version_de_la_politica": a.version_politica, "en": _iso(a.aceptado_en), "ip": a.ip,
             "origen": a.origen}
            for a in reg.query(AceptacionDeTerminos).filter(AceptacionDeTerminos.usuario_id == u.id)
            .order_by(AceptacionDeTerminos.id)
        ],
        "supermercados_fundados": [
            {"supermercado": f.cliente_slug, "en": _iso(f.creado_en)}
            for f in reg.query(Fundacion).filter(Fundacion.usuario_id == u.id).order_by(Fundacion.id)
        ],
    }


def persona_por_correo(correo: str, telefono: Optional[str] = None, cliente: Optional[str] = None) -> Persona:
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    c = normalizar_correo(correo)
    p = Persona(sujeto="persona", correos=[c] if c else [], cliente=cliente)
    if telefono and len(digitos(telefono)) >= 7:
        p.telefonos = [telefono.strip()]
    if c:
        reg = sesion_registro()
        try:
            u = reg.query(Usuario).filter(func.lower(Usuario.email) == c).first()
            if u is not None:
                p.usuario_id, p.nombre = u.id, (u.nombre or None)
        finally:
            reg.close()
    return p


def persona_por_usuario(usuario_id: int) -> Optional[Persona]:
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        u = reg.get(Usuario, usuario_id)
        if u is None:
            return None
        return Persona(sujeto="persona", correos=[normalizar_correo(u.email)], nombre=u.nombre or None,
                       usuario_id=u.id)
    finally:
        reg.close()


def persona_por_proveedor(slug: str, proveedor_id: int) -> Persona:
    """El contacto de un proveedor de UN supermercado: se lo busca por su correo
    y su teléfono, sólo en esa base."""
    from app.clientes import buscar, sesion_de
    from app.models.models import Supplier

    cliente = buscar(slug)
    if cliente is None:
        raise ErrorDeTitular("sin_cliente", "No hay un supermercado con ese código.")
    db = sesion_de(cliente)
    try:
        s = db.get(Supplier, proveedor_id)
        if s is None:
            raise ErrorDeTitular("sin_proveedor", "Ese supermercado no tiene un proveedor con ese número.")
        p = Persona(sujeto="contacto", cliente=cliente.slug, proveedor_id=s.id)
        if normalizar_correo(s.email):
            p.correos = [normalizar_correo(s.email)]
        if s.phone and len(digitos(s.phone)) >= 7:
            p.telefonos = [s.phone.strip()]
        return p
    finally:
        db.close()


# ─── Los supermercados ────────────────────────────────────────────────────────

def _clientes_para(persona: Persona, solo: Optional[set[str]] = None) -> list:
    from app.clientes import listar

    todos = listar(solo_activos=False)
    if persona.cliente:
        todos = [c for c in todos if c.slug == persona.cliente]
    if solo is not None:
        todos = [c for c in todos if c.slug in solo]
    return todos


def _proveedores_de_la_persona(cx, persona: Persona) -> list[dict]:
    """Las filas de ``suppliers`` cuyo CONTACTO es esta persona: por el número
    pedido, o porque su correo es el de la persona."""
    from app.models.models import Supplier

    t = Supplier.__table__
    conds = []
    if persona.proveedor_id is not None:
        conds.append(t.c.id == persona.proveedor_id)
    conds += [func.lower(func.trim(t.c.email)) == c for c in persona.correos if c]
    if not conds:
        return []
    return [
        {"id": f.id, "proveedor": f.name, "contacto": f.contact_name, "telefono": f.phone,
         "correo": f.email, "notas": f.notes}
        for f in cx.execute(select(t).where(or_(*conds)))
    ]


def _sin_contenido_de_otros(lista: list[dict], *, plata: bool) -> list[dict]:
    """Lo que ve la persona misma: el cuerpo de los correos y el detalle de la
    bitácora, contados; y si es mercaderista, las tablas con plata, contadas."""
    fuera = []
    for o in lista:
        oculto = (o["tabla"], o["columna"]) in CONTENIDO_DE_OTROS or (plata and o["tabla"] in TABLAS_CON_PLATA)
        fuera.append({**o, "valor": None, "nota": "Aparece acá; el texto es de otras personas o lleva montos."}
                     if oculto else o)
    return fuera


def _lineas_de_bitacora(cx, persona: Persona) -> list[dict]:
    """Las líneas de la bitácora del supermercado que hizo esta persona (su
    correo va al final del detalle): cuándo, qué, con qué rol y desde qué IP."""
    from app.models.models import AuditEntry

    t = AuditEntry.__table__
    conds = [func.lower(t.c.detalle).contains(c, autoescape=True) for c in persona.correos if c]
    if not conds:
        return []
    return [
        {"en": _iso(f.at), "accion": f.accion, "rol": f.rol, "ip": f.ip,
         "entidad": f.entidad, "entidad_id": f.entidad_id}
        for f in cx.execute(select(t).where(or_(*conds)).order_by(t.c.at))
    ]


def exportar(persona: Persona, *, para_la_persona: bool = False,
             membresias: Optional[dict[str, str]] = None) -> dict:
    """Todo lo que hay de la persona. ``para_la_persona``: lo baja ella misma
    (``membresias`` = {slug: rol} de los supermercados donde tiene acceso hoy:
    sólo esos se recorren)."""
    from app.clientes import esta_degradado, motor_de
    from app.database import engine as motor_registro
    from app.services.traspaso import TABLAS_DEL_CLIENTE, TABLAS_DEL_REGISTRO

    if persona.vacia():
        raise ErrorDeTitular("sin_persona", "Hace falta el correo, el teléfono o el proveedor de la persona.")

    cuerpo: dict = {
        "generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sujeto": persona.sujeto,
        "huella": persona.huella,
        "cuenta": None,
        "registro": [],
        "supermercados": {},
        "no_revisados": [],
        "fuera_de_esta_descarga": [
            "La cuenta de inicio de sesión en Google/Firebase (correo, nombre, contraseña): la guarda Google.",
            "Los respaldos cifrados de la plataforma: tienen todo lo de esta descarga y vencen solos a los 30 días.",
            "Los registros técnicos del servidor (Render): dirección IP y ruta de cada pedido, por el plazo del plan.",
            "Los correos que ya se entregaron: están en los buzones de quien los recibió.",
        ],
    }

    from app.clientes import sesion_registro

    if persona.usuario_id is not None:
        reg = sesion_registro()
        try:
            cuerpo["cuenta"] = _cuenta(reg, persona.usuario_id)
        finally:
            reg.close()

    if persona.sujeto == "persona" and not persona.cliente:
        with motor_registro.connect() as cx:
            lista = ocurrencias(cx, _tablas(TABLAS_DEL_REGISTRO), persona, saltear={"usuarios"})
        cuerpo["registro"] = _sin_contenido_de_otros(lista, plata=False) if para_la_persona else lista

    solo = set(membresias) if para_la_persona and membresias is not None else None
    for cliente in _clientes_para(persona, solo):
        if esta_degradado(cliente.slug):
            cuerpo["no_revisados"].append(cliente.slug)
            continue
        try:
            with motor_de(cliente).connect() as cx:
                lista = ocurrencias(cx, _tablas(TABLAS_DEL_CLIENTE), persona)
                proveedores = _proveedores_de_la_persona(cx, persona)
                bitacora = _lineas_de_bitacora(cx, persona)
        except Exception:  # noqa: BLE001 — una base rota no deja sin respuesta al resto
            log.exception("No se pudo revisar la base del cliente %s para un titular", cliente.slug)
            cuerpo["no_revisados"].append(cliente.slug)
            continue
        if not (lista or proveedores or bitacora):
            continue
        if para_la_persona:
            plata = (membresias or {}).get(cliente.slug) == "worker"
            lista = _sin_contenido_de_otros(lista, plata=plata)
            if plata:
                proveedores = []
        cuerpo["supermercados"][cliente.slug] = {
            "nombre": cliente.nombre,
            "contacto_de_proveedor": proveedores,
            "acciones_en_la_bitacora": bitacora,
            "ocurrencias": lista,
        }
    return cuerpo


def resumen_de(cuerpo: dict) -> dict:
    """Los conteos, sin valores: lo que va a la constancia."""
    return {
        "cuenta": cuerpo.get("cuenta") is not None,
        "registro": len(cuerpo.get("registro") or []),
        "supermercados": {
            slug: len(datos["ocurrencias"]) + len(datos["contacto_de_proveedor"])
            for slug, datos in (cuerpo.get("supermercados") or {}).items()
        },
        "no_revisados": list(cuerpo.get("no_revisados") or []),
    }


# ─── La supresión ─────────────────────────────────────────────────────────────

def unica_duena_de(usuario_id: int) -> list[str]:
    """Los supermercados ACTIVOS donde esta cuenta es la única dueña activa."""
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia
    from app.models.models import ClienteRow

    reg = sesion_registro()
    try:
        suyos = [
            m.cliente_slug for m in reg.query(Membresia)
            .filter(Membresia.usuario_id == usuario_id, Membresia.rol == "owner", Membresia.activo.is_(True))
        ]
        fuera = []
        for slug in suyos:
            activo = reg.query(ClienteRow.activo).filter(ClienteRow.slug == slug).scalar()
            otras = (
                reg.query(Membresia.id)
                .filter(Membresia.cliente_slug == slug, Membresia.rol == "owner",
                        Membresia.activo.is_(True), Membresia.usuario_id != usuario_id)
                .count()
            )
            if activo and otras == 0:
                fuera.append(slug)
        return fuera
    finally:
        reg.close()


def _suprimir_en_el_registro(cx, persona: Persona) -> tuple[dict, list[str]]:
    """Devuelve las filas tocadas por tabla y los supermercados cuyas membresías
    se apagaron."""
    from app.models.identidad import Invitacion, Membresia, Usuario
    from app.models.plataforma import AltaEnEspera
    from app.models.supresion import IntentoExport
    from app.services.traspaso import TABLAS_DEL_REGISTRO

    tocadas: dict[str, int] = {}
    apagadas: list[str] = []

    def sumar(tabla, n):
        if n:
            tocadas[tabla] = tocadas.get(tabla, 0) + n

    if persona.usuario_id is not None:
        u = Usuario.__table__
        sumar("usuarios", cx.execute(
            u.update().where(u.c.id == persona.usuario_id).values(
                email=f"suprimido-{persona.usuario_id}", firebase_uid=f"suprimido-{persona.usuario_id}",
                nombre=None, ultimo_login=None,
            )
        ).rowcount)
        m = Membresia.__table__
        apagadas = [f.cliente_slug for f in cx.execute(
            select(m.c.cliente_slug).where(m.c.usuario_id == persona.usuario_id, m.c.activo.is_(True)))]
        sumar("membresias", cx.execute(
            m.update().where(m.c.usuario_id == persona.usuario_id, m.c.activo.is_(True)).values(activo=False)
        ).rowcount)
        e = IntentoExport.__table__
        sumar("export_attempts", cx.execute(e.delete().where(e.c.usuario_id == persona.usuario_id)).rowcount)

    for c in persona.correos:
        i = Invitacion.__table__
        sumar("invitaciones", cx.execute(
            i.delete().where(func.lower(i.c.email) == c, i.c.usada_en.is_(None))
        ).rowcount)
        a = AltaEnEspera.__table__
        sumar("altas_en_espera", cx.execute(a.delete().where(func.lower(a.c.email) == c)).rowcount)

    for tabla, n in _anonimizar(cx, _tablas(TABLAS_DEL_REGISTRO), persona, saltear={"usuarios"}).items():
        sumar(tabla, n)
    return tocadas, apagadas


def _suprimir_en_el_cliente(cx, persona: Persona) -> dict:
    from app.models.correos import CorreoPendiente
    from app.models.models import Supplier
    from app.services.traspaso import TABLAS_DEL_CLIENTE

    tocadas: dict[str, int] = {}

    def sumar(tabla, n):
        if n:
            tocadas[tabla] = tocadas.get(tabla, 0) + n

    # El contacto del proveedor: fuera nombre, teléfono y correo. El proveedor
    # (la empresa, la contraparte del contrato) queda.
    s = Supplier.__table__
    for p in _proveedores_de_la_persona(cx, persona):
        sumar("suppliers", cx.execute(
            s.update().where(s.c.id == p["id"]).values(contact_name=None, phone=None, email=None)
        ).rowcount)
        if p["telefono"] and p["telefono"] not in persona.telefonos and len(digitos(p["telefono"])) >= 7:
            persona.telefonos.append(p["telefono"])

    # Los correos en cola: la dirección sale de la lista; si era la única, el
    # correo ya no tiene a quién ir.
    q = CorreoPendiente.__table__
    for fila in list(cx.execute(select(q.c.id, q.c.destinatarios_json))):
        try:
            lista = json.loads(fila.destinatarios_json or "[]")
        except ValueError:
            continue
        if not isinstance(lista, list):
            continue
        quedan = [d for d in lista if not (isinstance(d, str) and normalizar_correo(d) in persona.correos)]
        if len(quedan) == len(lista):
            continue
        if quedan:
            cx.execute(q.update().where(q.c.id == fila.id).values(destinatarios_json=json.dumps(quedan)))
        else:
            cx.execute(q.delete().where(q.c.id == fila.id))
        sumar("correos_pendientes", 1)

    for tabla, n in _anonimizar(cx, _tablas(TABLAS_DEL_CLIENTE), persona).items():
        sumar(tabla, n)
    return tocadas


def suprimir(persona: Persona, *, aunque_sea_la_unica_duena: bool = False) -> dict:
    """Anonimiza a la persona en el registro y en cada supermercado. Devuelve
    el resumen (conteos, sin valores). No anota bitácoras: eso es del router."""
    from app.auth import invalidar_cache_membresia
    from app.clientes import esta_degradado, motor_de
    from app.database import engine as motor_registro

    if persona.vacia():
        raise ErrorDeTitular("sin_persona", "Hace falta el correo, el teléfono o el proveedor de la persona.")

    if persona.usuario_id is not None and not aunque_sea_la_unica_duena:
        unica = unica_duena_de(persona.usuario_id)
        if unica:
            raise ErrorDeTitular(
                "unica_duena",
                "Esta persona es la única dueña de un supermercado activo: si se la suprime, nadie "
                "queda a cargo. Pasá la dueña a otra persona, o tramitá la supresión del supermercado; "
                "si igual corresponde, confirmalo.",
                {"supermercados": unica},
            )

    resumen: dict = {"registro": {}, "supermercados": {}, "no_revisados": []}
    apagadas: list[str] = []
    if persona.sujeto == "persona" and not persona.cliente:
        with motor_registro.begin() as cx:
            resumen["registro"], apagadas = _suprimir_en_el_registro(cx, persona)

    for cliente in _clientes_para(persona):
        if esta_degradado(cliente.slug):
            resumen["no_revisados"].append(cliente.slug)
            continue
        try:
            with motor_de(cliente).begin() as cx:
                tocadas = _suprimir_en_el_cliente(cx, persona)
        except Exception:  # noqa: BLE001
            log.exception("No se pudo anonimizar en la base del cliente %s", cliente.slug)
            resumen["no_revisados"].append(cliente.slug)
            continue
        if tocadas:
            resumen["supermercados"][cliente.slug] = tocadas

    for slug in apagadas:
        invalidar_cache_membresia(persona.usuario_id, slug)
    resumen["membresias_apagadas"] = apagadas
    return resumen
