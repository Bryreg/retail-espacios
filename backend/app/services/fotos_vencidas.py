"""Las fotos de montaje y las planometrías duran lo que dura el contrato.

La dueña lo decidió así (2026-10-10): se guardan mientras dure el contrato; si
se renueva, el plazo se alarga; si termina y NO se renueva, se borran para
liberar espacio. Son lo que más pesa de cada base —una foto de montaje ronda los
megas, y hay una por reporte— y en el plan de Render la base es lo que se paga.

── Qué se borra y qué no ─────────────────────────────────────────────────────

Se borra, y nada más:

· la **foto de un montaje**: la fila de ``space_files`` con el prefijo
  ``montaje--`` que apunta un ``mount_confirmations.file_id``;
· la **planometría** del contrato: las filas de ``lease_files`` de kind
  ``planometria``.

No se toca: el montaje (la fila queda, con quién, cuándo, montado o no y el
motivo; sólo pierde la foto), el contrato, la bitácora, los demás archivos del
espacio (PDF, Excel, CSV: son documentos), la cara designada del 3D, el arte de
catálogo del proveedor (``supplier_assets``) y el layout.

── Qué es «renovar» ──────────────────────────────────────────────────────────

En el sistema no existe como entidad: renovar es cargar otro contrato del MISMO
espacio con el MISMO proveedor. El botón «Renovar» lo siembra arrancando el día
después de que termina el anterior, pero la renovación tardía se carga a mano
—el botón desaparece apenas vence el contrato— y suele dejar un hueco. Por eso
la cadena tolera **hasta 60 días sin contrato** (``HUECO_DE_RENOVACION``, los
mismos 60 con los que el tablero ofrece «Renovar»): si la renovación ya está
cargada, el plazo se alarga aunque arranque a mitad de mes.

«El mismo proveedor» se mira con generosidad, porque juntar de más sólo
conserva más: el mismo ``supplier_id``; o el mismo nombre sin tildes, sin
puntos y sin la forma societaria («Nutresa S.A.S.» = «NUTRESA» = «Grupo
Nutresa»), que es lo que crea la planilla cuando alguien escribe el nombre
distinto; o un nombre contenido en el otro («Alpina» y «Alpina Productos
Alimenticios»); o el mismo correo; o la misma marca en el mismo espacio.

── Cuándo ────────────────────────────────────────────────────────────────────

Una cadena de contratos renovados termina cuando su último eslabón termina sin
renovación. Desde ese fin hay **5 días de gracia** (``DIAS_DE_GRACIA``) y en la
primera pasada del mantenimiento del sexto día —al arrancar y cada 12 horas—
se borra lo de TODA la cadena. Ejemplo: un contrato que vence el 2026-10-31
conserva todo del 1 al 5 de noviembre y se borra en la primera pasada del 6.

Un contrato cancelado cuenta hasta su fecha de fin ORIGINAL: no existe fecha de
baja (``DELETE /spaces/{id}/leases/{id}`` sólo apaga ``is_active``), y adivinarla
borraría antes. ``is_active`` no se mira para nada: mandan las fechas.

── De qué contrato es una foto ───────────────────────────────────────────────

``mount_confirmations`` no tiene columna de contrato (y no se agregan columnas):
la foto se ata al ESPACIO (``space_files.space_id``, que no cambia al renumerar)
y a la hora en que el servidor la recibió. Una cadena reclama las fotos desde la
víspera de su primer arranque menos 5 días —el tablero de Montajes deja reportar
un contrato «pendiente» antes de la víspera— hasta el último instante del quinto
día después de su fin. La víspera es la de ``routers/montaje.py``
(``_se_confirma_desde``), importada y no copiada: la regla de qué reporte cuenta
para qué contrato tiene que ser una sola.

Una foto se borra sólo si la reclama AL MENOS una cadena y TODAS las que la
reclaman, de cualquier proveedor, terminaron. Eso cierra el caso feo: un
contrato cancelado que se superpone en fechas con el vivo de otro proveedor no
se lleva las fotos del vivo.

── Ante la duda, no se borra ─────────────────────────────────────────────────

Borrar no tiene vuelta atrás, así que todo lo que no cierra se conserva y se
cuenta por motivo (``Plan.conservadas``): el espacio de una sede borrada, un
montaje archivado, un código de montaje que no es el del espacio, una hora que
falta, un contrato del espacio con fechas imposibles (bloquea el espacio
entero), un contrato que vive sólo en el JSON del plano (bloquea el espacio
hasta que se importe), la foto que ninguna cadena reclama, la planometría de un
contrato que no existe o subida a propósito después de que la cadena terminó.

── El interruptor ────────────────────────────────────────────────────────────

Con ``LIMPIAR_FOTOS_VENCIDAS`` apagado —el valor por defecto— la pasada del
mantenimiento sólo ENSAYA: calcula y deja en el log lo que borraría. Se prende
en el servicio de Render cuando la dueña y el abogado ajusten la política de
datos publicada (hoy dice que estas fotos no se borran) y la copia de
seguridad de cada supermercado esté bajada, que es la única marcha atrás. Y
una copia restaurada en local, con el interruptor apagado, no se borra sola al
levantar la app.
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from app.fechas import ZONA_DEL_NEGOCIO, hoy as hoy_en_colombia
from app.routers.montaje import _se_confirma_desde
from app.routers.mounts import MOUNT_FILE_PREFIX
from app.routers.planograms import KIND as KIND_PLANOMETRIA

logger = logging.getLogger("retail.fotos_vencidas")

#: Días que se conserva todo después de que termina el último contrato de la
#: cadena. Es el margen para cargar una renovación que se negoció tarde —el
#: botón «Renovar» desaparece apenas vence el contrato y la renovación se carga
#: a mano— y para el desmontaje, que se reporta después del fin. Es la ÚNICA
#: constante que hay que tocar para cambiar el plazo.
DIAS_DE_GRACIA = 5

#: Días sin contrato que puede haber entre un eslabón y el siguiente para que
#: cuente como renovación. Los mismos 60 con los que el tablero ofrece
#: «Renovar» (``DIAS_PARA_RENOVAR`` en ``DashboardView``): una renovación ya
#: cargada que arranca el 15 en vez del 1 sigue siendo una renovación.
HUECO_DE_RENOVACION = 60

#: Prendido, la pasada del mantenimiento BORRA; apagado (por defecto), ensaya.
INTERRUPTOR = "LIMPIAR_FOTOS_VENCIDAS"

#: El código de la bitácora. No termina en «.baja» a propósito: es una tarea
#: esperada y la pantalla pinta de rojo lo que termina así.
ACCION = "archivo.vencido"

_TANDA = 500
_MB = 1024 * 1024


def borrado_prendido() -> bool:
    """¿La pasada del mantenimiento borra de verdad? Se lee en cada pasada."""
    return (os.getenv(INTERRUPTOR) or "").strip().lower() in ("1", "true", "si", "sí", "on")


# ─── Lo que la regla necesita saber (sin base) ───────────────────────────────

@dataclass(frozen=True)
class Contrato:
    """Una fila de ``space_leases``, vigente, vencida o cancelada: da igual."""
    id: int
    space_id: int
    supplier_id: Optional[int]
    start_date: Optional[date]
    end_date: Optional[date]
    proveedor: str = ""
    correo: str = ""
    marca: str = ""


@dataclass(frozen=True)
class Montaje:
    """Un reporte que apunta a la foto (normalmente uno por foto)."""
    confirmado_en: Optional[datetime]
    space_code: Optional[str]
    archivado_en: Optional[datetime] = None


@dataclass(frozen=True)
class Foto:
    id: int
    space_id: int
    size: int
    montajes: tuple = ()
    es_cara: bool = False


@dataclass(frozen=True)
class Planometria:
    id: int
    lease_id: int
    size: int
    kind: str = KIND_PLANOMETRIA
    content_type: str = ""
    subida_en: Optional[datetime] = None


@dataclass
class Cadena:
    """Contratos renovados del mismo espacio con el mismo proveedor."""
    space_id: int
    contratos: list

    @property
    def desde(self) -> date:
        return min(c.start_date for c in self.contratos)

    @property
    def hasta(self) -> date:
        return max(c.end_date for c in self.contratos)

    @property
    def primero(self) -> Contrato:
        return min(self.contratos, key=lambda c: (c.start_date, c.id))

    def terminada(self, hoy: date) -> bool:
        """Pasaron los días de gracia: ``hoy >= fin + 6``. Una cadena con un
        contrato vigente o futuro está viva por construcción."""
        corte = _sumar(self.hasta, DIAS_DE_GRACIA + 1)
        return corte is not None and hoy >= corte

    def ventana(self) -> tuple:
        """Desde y hasta qué instante reclama las fotos del espacio.

        Desde la medianoche de Colombia de la víspera del primer arranque menos
        los días de gracia; hasta el último instante del día fin + gracia
        (el extremo de arriba es abierto). ``None`` es «sin borde»: sólo pasa
        con fechas en los extremos del calendario.
        """
        try:
            desde = _instante(_se_confirma_desde(self.primero) - timedelta(days=DIAS_DE_GRACIA))
        except (OverflowError, ValueError):
            desde = None
        fin = _sumar(self.hasta, DIAS_DE_GRACIA + 1)
        hasta = _instante(fin) if fin is not None else None
        return desde, hasta

    def reclama(self, t: datetime) -> bool:
        desde, hasta = self.ventana()
        return (desde is None or t >= desde) and (hasta is None or t < hasta)


@dataclass
class Terminada:
    """Una cadena terminada que deja algo para borrar (para el ensayo)."""
    codigo: str
    proveedores: tuple
    desde: date
    hasta: date
    fotos: int = 0
    planometrias: int = 0


@dataclass
class Plan:
    hoy: date
    fotos: list = field(default_factory=list)
    planometrias: list = field(default_factory=list)
    bytes_fotos: int = 0
    bytes_planometrias: int = 0
    #: Cuántas de las planometrías a borrar son PDF: el casillero acepta PDF y
    #: alguien pudo haber adjuntado ahí el contrato firmado. El ensayo las
    #: muestra aparte para mirarlas antes de prender el borrado.
    planometrias_pdf: int = 0
    conservadas: Counter = field(default_factory=Counter)
    terminadas: list = field(default_factory=list)
    ensayo: bool = True

    @property
    def bytes(self) -> int:
        return self.bytes_fotos + self.bytes_planometrias

    @property
    def vacio(self) -> bool:
        return not self.fotos and not self.planometrias

    def detalle(self) -> str:
        """La línea de la bitácora. Sin nombres de proveedor: la bitácora la lee
        más gente que la base."""
        return (
            f"{_cuantas(len(self.fotos), 'foto de montaje', 'fotos de montaje')} · "
            f"{_cuantas(len(self.planometrias), 'planometría', 'planometrías')} · "
            f"{_mb(self.bytes)} MB liberados para lo que se suba · "
            f"contratos terminados hasta el {(self.hoy - timedelta(days=DIAS_DE_GRACIA + 1)).isoformat()}"
        )

    def resumen(self) -> str:
        """La línea del log: lo borrado (o lo que se borraría) y lo conservado."""
        verbo = "se borrarían" if self.ensayo else "borradas"
        conservadas = ", ".join(f"{k}={v}" for k, v in sorted(self.conservadas.items())) or "ninguna"
        pdf = f" ({self.planometrias_pdf} en PDF)" if self.planometrias_pdf else ""
        return (
            f"{verbo}: {len(self.fotos)} fotos, {len(self.planometrias)} planometrías{pdf}, "
            f"{_mb(self.bytes)} MB · conservadas: {conservadas}"
            + (f" · ensayo: {INTERRUPTOR} apagado" if self.ensayo else "")
        )


def _cuantas(n: int, uno: str, varios: str) -> str:
    return f"{n} {uno if n == 1 else varios}"


def _mb(n: int) -> str:
    return f"{n / _MB:.1f}".replace(".", ",")


def _sumar(d: date, dias: int) -> Optional[date]:
    """``d + dias``, o ``None`` si se sale del calendario (9999-12-31 es el
    «indefinido» típico de una planilla)."""
    try:
        return d + timedelta(days=dias)
    except OverflowError:
        return None


def _instante(d: date) -> datetime:
    """La medianoche de Colombia del día ``d``."""
    return datetime.combine(d, time.min, tzinfo=ZONA_DEL_NEGOCIO)


def _utc(t: datetime) -> datetime:
    """SQLite devuelve la hora sin huso; lo guardado es UTC (igual que
    ``routers/montaje.py::_utc``)."""
    return t if t.tzinfo is not None else t.replace(tzinfo=timezone.utc)


def _codigo(c: Optional[str]) -> str:
    return (c or "").strip().upper()


# ─── El mismo proveedor ──────────────────────────────────────────────────────

#: Formas societarias y relleno que no distinguen a un proveedor de otro.
_SOCIETARIAS = {"SAS", "SA", "LTDA", "LIMITADA", "CIA", "BIC", "SENC", "SCA", "EU", "GRUPO"}


def clave_de_nombre(nombre: Optional[str]) -> str:
    """«Nutresa S.A.S.», «NUTRESA» y «Grupo Nutresa» dan lo mismo: «NUTRESA».

    Sin tildes, en mayúsculas, sólo letras y dígitos, con las siglas partidas
    por puntos vueltas a juntar («S.A.S.» → SAS) y sin la forma societaria.
    """
    s = unicodedata.normalize("NFKD", nombre or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).upper().replace("&", " Y ")
    crudos = re.findall(r"[A-Z0-9]+", s)
    tokens: list = []
    suelta = False
    for t in crudos:
        if len(t) == 1 and suelta:
            tokens[-1] += t
        else:
            tokens.append(t)
            suelta = len(t) == 1
    texto = re.sub(r"\bS EN C\b", "SENC", " ".join(tokens))
    tokens = [t for t in texto.split() if t not in _SOCIETARIAS]
    while tokens and tokens[-1] == "Y":  # «Restrepo y Cía.» → «RESTREPO»
        tokens.pop()
    return " ".join(tokens)


def _mismo_nombre(a: str, b: str) -> bool:
    """Igual, o uno contenido en el otro con al menos 4 letras: «ALPINA» y
    «ALPINA PRODUCTOS ALIMENTICIOS»."""
    if not a or not b:
        return False
    if a == b:
        return True
    corto, largo = (a, b) if len(a) <= len(b) else (b, a)
    return len(corto) >= 4 and set(corto.split()) <= set(largo.split())


class _Uniones:
    def __init__(self):
        self.padre: dict = {}

    def raiz(self, x):
        self.padre.setdefault(x, x)
        while self.padre[x] != x:
            self.padre[x] = self.padre[self.padre[x]]
            x = self.padre[x]
        return x

    def unir(self, a, b) -> None:
        ra, rb = self.raiz(a), self.raiz(b)
        if ra != rb:
            self.padre[rb] = ra


def _grupos_de_proveedor(contratos: list) -> dict:
    """Los contratos de UN espacio, agrupados por proveedor (generoso)."""
    u = _Uniones()
    nombres = set()
    for c in contratos:
        yo = ("proveedor", c.supplier_id) if c.supplier_id is not None else ("contrato", c.id)
        u.raiz(yo)
        nombre = clave_de_nombre(c.proveedor)
        if nombre:
            nombres.add(nombre)
            u.unir(yo, ("nombre", nombre))
        correo = (c.correo or "").strip().lower()
        if correo:
            u.unir(yo, ("correo", correo))
        marca = clave_de_nombre(c.marca)
        if marca:
            u.unir(yo, ("marca", marca))
    lista = sorted(nombres)
    for i, a in enumerate(lista):
        for b in lista[i + 1:]:
            if _mismo_nombre(a, b):
                u.unir(("nombre", a), ("nombre", b))
    grupos: dict = {}
    for c in contratos:
        yo = ("proveedor", c.supplier_id) if c.supplier_id is not None else ("contrato", c.id)
        grupos.setdefault(u.raiz(yo), []).append(c)
    return grupos


def cadenas(contratos: Iterable[Contrato]) -> list:
    """Las cadenas de renovación. Recibe contratos con fechas válidas.

    Por espacio y proveedor, ordenados por arranque: uno se suma a la cadena en
    curso si arranca a más tardar ``HUECO_DE_RENOVACION`` días después del
    mayor fin de la cadena (superpuesto, contiguo o con hueco); si no, abre
    otra.
    """
    por_espacio: dict = {}
    for c in contratos:
        por_espacio.setdefault(c.space_id, []).append(c)
    salida: list = []
    for space_id, del_espacio in por_espacio.items():
        for grupo in _grupos_de_proveedor(del_espacio).values():
            actual: Optional[Cadena] = None
            fin_actual: Optional[date] = None
            for c in sorted(grupo, key=lambda x: (x.start_date, x.end_date, x.id)):
                tope = _sumar(fin_actual, HUECO_DE_RENOVACION + 1) if fin_actual else None
                if actual is not None and (tope is None or c.start_date <= tope):
                    actual.contratos.append(c)
                    fin_actual = max(fin_actual, c.end_date)
                else:
                    actual = Cadena(space_id=space_id, contratos=[c])
                    salida.append(actual)
                    fin_actual = c.end_date
    return salida


# ─── La regla ────────────────────────────────────────────────────────────────

def _fechas_raras(c: Contrato) -> bool:
    return c.start_date is None or c.end_date is None or c.start_date > c.end_date


def que_se_borra(
    contratos: Iterable[Contrato],
    fotos: Iterable[Foto],
    planometrias: Iterable[Planometria],
    *,
    hoy: date,
    codigos: dict,
    archivados: Iterable[int] = (),
    en_el_plano: Iterable[int] = (),
) -> Plan:
    """Qué fotos y qué planometrías se borran hoy. No toca ninguna base.

    ``codigos``: space_id → código actual del espacio. ``archivados``: los
    espacios de sedes borradas. ``en_el_plano``: los espacios con un contrato
    que vive sólo en el JSON del layout.
    """
    plan = Plan(hoy=hoy)
    contratos = list(contratos)
    archivados = set(archivados)
    en_el_plano = set(en_el_plano)

    # Los espacios que no se tocan, con su motivo.
    bloqueados: dict = {}
    for sid in archivados:
        bloqueados[sid] = "espacio_archivado"
    for c in contratos:
        if _fechas_raras(c):
            bloqueados.setdefault(c.space_id, "fechas_imposibles")
    for sid in en_el_plano:
        bloqueados.setdefault(sid, "contrato_en_el_plano")

    validos = [c for c in contratos if c.space_id not in bloqueados]
    try:
        todas = cadenas(validos)
    except (OverflowError, ValueError, TypeError):
        logger.exception("No se pudieron armar las cadenas de contratos: no se borra nada")
        plan.conservadas["error_de_fechas"] += 1
        return plan

    por_espacio: dict = {}
    cadena_de: dict = {}
    for cad in todas:
        por_espacio.setdefault(cad.space_id, []).append(cad)
        for c in cad.contratos:
            cadena_de[c.id] = cad
    contrato_por_id = {c.id: c for c in contratos}

    terminadas: dict = {}  # id(cadena) → Terminada

    def anotar(cad: Cadena, *, foto: int = 0, plano: int = 0) -> None:
        t = terminadas.get(id(cad))
        if t is None:
            nombres = tuple(sorted({c.proveedor for c in cad.contratos if c.proveedor}))
            t = terminadas[id(cad)] = Terminada(
                codigo=codigos.get(cad.space_id, f"#{cad.space_id}"),
                proveedores=nombres, desde=cad.desde, hasta=cad.hasta,
            )
        t.fotos += foto
        t.planometrias += plano

    # ── Fotos de montaje
    for f in fotos:
        try:
            motivo = _motivo_para_conservar_foto(f, bloqueados, codigos)
            if motivo is None:
                reclamantes_de_todas: list = []
                for m in f.montajes:
                    t = _utc(m.confirmado_en)
                    reclamantes = [c for c in por_espacio.get(f.space_id, []) if c.reclama(t)]
                    if not reclamantes:
                        motivo = "ninguna_cadena_la_reclama"
                        break
                    if any(not c.terminada(hoy) for c in reclamantes):
                        motivo = "cadena_viva"
                        break
                    reclamantes_de_todas.extend(reclamantes)
            if motivo is not None:
                plan.conservadas[motivo] += 1
                continue
        except (OverflowError, ValueError, TypeError):
            logger.exception("Foto %s: fechas que no se pueden comparar, se conserva", f.id)
            plan.conservadas["error_de_fechas"] += 1
            continue
        plan.fotos.append(f.id)
        plan.bytes_fotos += int(f.size or 0)
        # Para el ensayo, la foto se le cuenta a la cadena que arrancó último
        # antes de ella: la misma que la reclamaría según el tablero.
        anotar(max(reclamantes_de_todas, key=lambda c: c.desde), foto=1)

    # ── Planometrías
    for p in planometrias:
        if p.kind != KIND_PLANOMETRIA:
            # La columna existe para un futuro PDF firmado: un documento.
            plan.conservadas["no_es_planometria"] += 1
            continue
        contrato = contrato_por_id.get(p.lease_id)
        if contrato is None:
            plan.conservadas["contrato_inexistente"] += 1
            continue
        if contrato.space_id in bloqueados:
            plan.conservadas[bloqueados[contrato.space_id]] += 1
            continue
        if contrato.space_id not in codigos:
            plan.conservadas["espacio_inexistente"] += 1
            continue
        cad = cadena_de.get(contrato.id)
        if cad is None:
            plan.conservadas["ninguna_cadena_la_reclama"] += 1
            continue
        try:
            if not cad.terminada(hoy):
                plan.conservadas["cadena_viva"] += 1
                continue
            # Subida a propósito DESPUÉS de que la cadena terminó (POST
            # /leases/{id}/planometria acepta un contrato vencido): quien la
            # cargó quería dejarla, no se borra en la pasada siguiente.
            _, fin = cad.ventana()
            if p.subida_en is not None and fin is not None and _utc(p.subida_en) >= fin:
                plan.conservadas["subida_despues_del_fin"] += 1
                continue
        except (OverflowError, ValueError, TypeError):
            logger.exception("Planometría %s: fechas que no se pueden comparar, se conserva", p.id)
            plan.conservadas["error_de_fechas"] += 1
            continue
        plan.planometrias.append(p.id)
        plan.bytes_planometrias += int(p.size or 0)
        if (p.content_type or "").lower() == "application/pdf":
            plan.planometrias_pdf += 1
        anotar(cad, plano=1)

    plan.terminadas = sorted(terminadas.values(), key=lambda t: (t.codigo, t.desde))
    return plan


def _motivo_para_conservar_foto(f: Foto, bloqueados: dict, codigos: dict) -> Optional[str]:
    """Lo que hace que una foto ni se considere. ``None``: sigue la regla."""
    if f.es_cara:
        return "cara_del_3d"
    if f.space_id in bloqueados:
        return bloqueados[f.space_id]
    if f.space_id not in codigos:
        return "espacio_inexistente"
    if not f.montajes:
        return "sin_montaje"
    codigo = _codigo(codigos[f.space_id])
    for m in f.montajes:
        if m.archivado_en is not None:
            return "montaje_archivado"
        if m.confirmado_en is None:
            return "montaje_sin_hora"
        if _codigo(m.space_code) != codigo:
            return "codigo_distinto"
    return None


# ─── Contra la base ──────────────────────────────────────────────────────────

def _leer(db) -> dict:
    """Sólo metadatos: ningún binario sale de la base para decidir."""
    from app.models.models import (
        ArchivedSpace, LeaseFile, MountConfirmation, Space, SpaceFace, SpaceFile,
        SpaceLease, Supplier,
    )
    from app.services.importar_del_plano import revisar

    contratos = [
        Contrato(
            id=lid, space_id=sid, supplier_id=prov, start_date=desde, end_date=hasta,
            proveedor=nombre or "", correo=correo or "", marca=marca or "",
        )
        for lid, sid, prov, desde, hasta, marca, nombre, correo in (
            db.query(
                SpaceLease.id, SpaceLease.space_id, SpaceLease.supplier_id,
                SpaceLease.start_date, SpaceLease.end_date, SpaceLease.marca,
                Supplier.name, Supplier.email,
            )
            .outerjoin(Supplier, Supplier.id == SpaceLease.supplier_id)
            .all()
        )
    ]
    codigos = {sid: code for sid, code in db.query(Space.id, Space.code).all()}
    archivados = {sid for (sid,) in db.query(ArchivedSpace.space_id).all()}
    caras = {fid for (fid,) in db.query(SpaceFace.file_id).all()}

    fotos: dict = {}
    for fid, sid, size, nombre, confirmado, codigo, archivado in (
        db.query(
            SpaceFile.id, SpaceFile.space_id, SpaceFile.size, SpaceFile.filename,
            MountConfirmation.confirmado_en, MountConfirmation.space_code,
            MountConfirmation.archivado_en,
        )
        .join(MountConfirmation, MountConfirmation.file_id == SpaceFile.id)
        .filter(SpaceFile.filename.startswith(MOUNT_FILE_PREFIX))
        .all()
    ):
        # LIKE de SQLite no distingue mayúsculas: el prefijo se vuelve a mirar.
        if not (nombre or "").startswith(MOUNT_FILE_PREFIX):
            continue
        previa = fotos.get(fid)
        montaje = Montaje(confirmado_en=confirmado, space_code=codigo, archivado_en=archivado)
        fotos[fid] = Foto(
            id=fid, space_id=sid, size=size or 0,
            montajes=(previa.montajes if previa else ()) + (montaje,),
            es_cara=fid in caras,
        )

    planometrias = [
        Planometria(id=pid, lease_id=lid, size=size or 0, kind=kind or "",
                    content_type=tipo or "", subida_en=subida)
        for pid, lid, size, kind, tipo, subida in db.query(
            LeaseFile.id, LeaseFile.lease_id, LeaseFile.size, LeaseFile.kind,
            LeaseFile.content_type, LeaseFile.uploaded_at,
        ).all()
    ]

    # Un contrato que vive sólo en el JSON del plano puede ser la renovación de
    # una cadena de la base, u otro proveedor que reclamaría las fotos: hasta
    # que se importe (Supervisar → «Contrato que sólo vive en el plano»), ese
    # espacio no se toca.
    por_codigo = {_codigo(code): sid for sid, code in codigos.items()}
    importacion = revisar(db)
    en_el_plano = set()
    for fila in list(importacion.importables) + [x for x in importacion.incompletos if not x.residuo]:
        sid = por_codigo.get(_codigo(fila.espacio))
        if sid is not None:
            en_el_plano.add(sid)

    return {
        "contratos": contratos, "fotos": list(fotos.values()), "planometrias": planometrias,
        "codigos": codigos, "archivados": archivados, "en_el_plano": en_el_plano,
    }


def _tandas(ids: list, n: int = _TANDA):
    for i in range(0, len(ids), n):
        yield ids[i:i + n]


def _borrar_filas(db, tabla, ids: list, *condiciones) -> list:
    """DELETE en bloque por id, sin cargar binarios. Devuelve (id, size) de lo
    que de verdad se borró: si otra pasada se adelantó, lo suyo no se cuenta."""
    where = [tabla.c.id.in_(ids), *condiciones]
    if db.get_bind().dialect.delete_returning:
        return [tuple(r) for r in db.execute(tabla.delete().where(*where).returning(tabla.c.id, tabla.c.size))]
    from sqlalchemy import select

    filas = [tuple(r) for r in db.execute(select(tabla.c.id, tabla.c.size).where(*where))]
    if filas:
        db.execute(tabla.delete().where(tabla.c.id.in_([f[0] for f in filas])))
    return filas


def _borrar(db, plan: Plan) -> Plan:
    """Borra lo del plan en UNA transacción y anota UNA línea en la bitácora."""
    from sqlalchemy import select

    from app.models.models import LeaseFile, MountConfirmation, SpaceFace, SpaceFile
    from app.services.bitacora import anotar

    archivos = SpaceFile.__table__
    montajes = MountConfirmation.__table__
    caras = SpaceFace.__table__
    planos = LeaseFile.__table__

    def sigue_siendo_foto():
        # Las mismas condiciones en cada sentencia: prefijo y no designada cara.
        return (
            archivos.c.filename.startswith(MOUNT_FILE_PREFIX),
            archivos.c.id.not_in(select(caras.c.file_id)),
        )

    fotos_borradas: list = []
    for tanda in _tandas(plan.fotos):
        # En Postgres, las filas quedan tomadas hasta el commit: una pasada
        # que corra a la vez espera acá y después ya no las encuentra.
        vigentes = [
            fid for (fid,) in db.execute(
                select(archivos.c.id).where(archivos.c.id.in_(tanda), *sigue_siendo_foto()).with_for_update()
            )
        ]
        if not vigentes:
            continue
        # El montaje se queda —pasó, y es la prueba— sin la foto. Primero esto:
        # `mount_confirmations.file_id` es una clave foránea sin regla de
        # borrado y Postgres no deja borrar el archivo con el montaje
        # apuntándole (lo mismo que hace `routers/files.py::delete_file`).
        db.execute(
            montajes.update()
            .where(montajes.c.file_id.in_(
                select(archivos.c.id).where(archivos.c.id.in_(vigentes), *sigue_siendo_foto())
            ))
            .values(file_id=None)
        )
        fotos_borradas += _borrar_filas(db, archivos, vigentes, *sigue_siendo_foto())

    planos_borrados: list = []
    for tanda in _tandas(plan.planometrias):
        planos_borrados += _borrar_filas(db, planos, tanda, planos.c.kind == KIND_PLANOMETRIA)

    hecho = Plan(
        hoy=plan.hoy,
        fotos=[f[0] for f in fotos_borradas],
        planometrias=[p[0] for p in planos_borrados],
        bytes_fotos=sum(int(f[1] or 0) for f in fotos_borradas),
        bytes_planometrias=sum(int(p[1] or 0) for p in planos_borrados),
        planometrias_pdf=plan.planometrias_pdf if len(planos_borrados) == len(plan.planometrias) else 0,
        conservadas=plan.conservadas,
        terminadas=plan.terminadas,
        ensayo=False,
    )
    if hecho.vacio:
        # Otra pasada se adelantó: no hubo cambios y no hay nada que anotar.
        db.rollback()
        return hecho
    anotar(db, None, "sistema", ACCION, entidad="archivo", detalle=hecho.detalle())
    db.commit()
    return hecho


def limpiar_fotos_vencidas(db, hoy: Optional[date] = None, *, ensayo: Optional[bool] = None) -> Plan:
    """Calcula y, si corresponde, borra. Devuelve el plan (lo borrado de verdad).

    ``ensayo=None`` hace lo que diga el interruptor (``LIMPIAR_FOTOS_VENCIDAS``);
    ``True`` nunca escribe; ``False`` borra. ``hoy`` sirve para ensayar: con una
    fecha futura sólo se puede ensayar, porque borrar con el reloj adelantado
    daría por terminadas cadenas que hoy están vigentes.
    """
    real = hoy_en_colombia()
    hoy = hoy or real
    if ensayo is None:
        ensayo = not borrado_prendido()
    if not ensayo and hoy > real:
        raise ValueError(
            f"Con una fecha futura ({hoy.isoformat()}) sólo se puede ensayar: "
            "borraría las fotos de contratos que hoy están vigentes."
        )
    datos = _leer(db)
    plan = que_se_borra(
        datos["contratos"], datos["fotos"], datos["planometrias"],
        hoy=hoy, codigos=datos["codigos"], archivados=datos["archivados"],
        en_el_plano=datos["en_el_plano"],
    )
    plan.ensayo = ensayo
    if ensayo or plan.vacio:
        return plan
    return _borrar(db, plan)
