"""Cohortes de adopción, para la consola del operador (Fase 6).

Detecta el disparador clásico de una cancelación silenciosa: un cliente con
contratos activos donde NADIE entra a mirar la plataforma. Todo sale del
**REGISTRO** (``clientes``, ``estados_cliente``, ``membresias``, ``usuarios``,
``fundaciones``) más ``contratos_activos_por_cliente`` de
``plataforma_metricas`` (Fase 6, parte B), que ya lo calculó en el MISMO
recorrido de bases que ``/metricas`` -- **ninguna otra base se abre acá**.

Ningún correo, nombre ni id de usuario sale al JSON. Las fechas van SIN hora
(regla de Fase 4). La clasificación se calcula UNA sola vez, acá, en este
orden:

1. ``sin_cuentas`` — cero membresías activas (cliente legado con claves
   compartidas: el login viejo no deja ``ultimo_login``).
2. ``nueva`` — alta hace menos de 30 días.
3. ``activa`` — algún usuario entró en los últimos 30 días.
4. ``fantasma`` — tiene contratos activos este período y NINGÚN acceso en 30+
   días (o nunca). La señal que la asesoría busca.
5. ``dormida`` — sin contratos activos y sin acceso en 30+ días.

**Fecha de alta** (para la cohorte): ``Fundacion.creado_en`` más antigua del
slug; si no hay fundación (cliente que ya existía antes del alta self-service),
``ClienteRow.creado``; si ninguna de las dos existe, ``cohorte: null`` -- no se
inventa una fecha.
"""
from datetime import date, datetime, timezone

from app.plataforma_metricas import ERROR_BASE_ILEGIBLE, _ahora_iso, periodo_actual

DIAS_RECIENTE = 30

CLASIFICACIONES = ("nueva", "activa", "fantasma", "dormida", "sin_cuentas")
# El orden de la LISTA de clientes: fantasmas primero -- "a quién llamar hoy" --
# y sin_cuentas antes que nueva/activa, que son los estados "todo bien".
_ORDEN_LISTA = {"fantasma": 0, "dormida": 1, "sin_cuentas": 2, "nueva": 3, "activa": 4}


def _hoy() -> date:
    return datetime.now(timezone.utc).date()


def _logins_del_cliente(reg, slug: str) -> list[date | None]:
    """Las fechas de ``ultimo_login`` (o ``None``) de cada usuario con
    membresía ACTIVA en ``slug`` — una entrada por usuario, nunca su id, su
    correo ni su nombre. El ``UNIQUE(usuario_id, cliente_slug)`` de
    ``Membresia`` garantiza que cada usuario aparece a lo sumo una vez.
    """
    from app.models.identidad import Membresia, Usuario

    filas = (
        reg.query(Usuario.ultimo_login)
        .join(Membresia, Membresia.usuario_id == Usuario.id)
        .filter(Membresia.cliente_slug == slug, Membresia.activo == True)  # noqa: E712
        .all()
    )
    return [f[0].date() if f[0] is not None else None for f in filas]


def _alta_por_slug(reg) -> dict[str, date]:
    """``{slug: fecha de alta}`` -- la ``Fundacion.creado_en`` más antigua de
    cada slug. Un slug ausente acá no tiene fundación (cliente pre-alta
    self-service); su fecha, si la hay, sale de ``ClienteRow.creado``."""
    from app.models.plataforma import Fundacion

    altas: dict[str, date] = {}
    for slug, creado_en in reg.query(Fundacion.cliente_slug, Fundacion.creado_en).all():
        if creado_en is None:
            continue
        dia = creado_en.date()
        if slug not in altas or dia < altas[slug]:
            altas[slug] = dia
    return altas


def _clasificar(
    usuarios_con_cuenta: int,
    usuarios_activos_30d: int,
    dias_desde_alta: int | None,
    con_contratos_activos: bool,
) -> str:
    """La clasificación, en el orden VINCULANTE de la spec."""
    if usuarios_con_cuenta == 0:
        return "sin_cuentas"
    if dias_desde_alta is not None and dias_desde_alta < DIAS_RECIENTE:
        return "nueva"
    if usuarios_activos_30d >= 1:
        return "activa"
    if con_contratos_activos:
        return "fantasma"
    return "dormida"


def _fila_cliente(reg, cliente_row, estado: str, contratos_por_slug: dict[str, int],
                   alta_por_slug: dict[str, date], hoy: date) -> dict:
    slug = cliente_row.slug

    logins = _logins_del_cliente(reg, slug)
    usuarios_con_cuenta = len(logins)
    usuarios_activos_30d = sum(
        1 for d in logins if d is not None and (hoy - d).days <= DIAS_RECIENTE
    )
    vistos = [d for d in logins if d is not None]
    dias_sin_acceso = (hoy - max(vistos)).days if vistos else None

    alta = alta_por_slug.get(slug) or cliente_row.creado
    # `datetime` es subclase de `date`: `isinstance(alta, date)` da `True` para
    # las dos, así que hay que preguntar por `datetime` explícitamente o la
    # fecha de `ClienteRow.creado` (un `datetime`) nunca se reduce a día.
    if isinstance(alta, datetime):
        alta = alta.date()
    cohorte = f"{alta.year:04d}-{alta.month:02d}" if alta is not None else None
    dias_desde_alta = (hoy - alta).days if alta is not None else None

    error = None
    conteo = contratos_por_slug.get(slug)
    if conteo is None and slug in contratos_por_slug:
        # Base rota este período: `/metricas` la intentó leer y no pudo. No se
        # puede saber si tiene contratos; el resto de la fila (registro puro)
        # se calcula igual.
        con_contratos_activos = False
        error = ERROR_BASE_ILEGIBLE
    elif conteo is None:
        # El slug no está en el mapa porque NACIÓ después de que se calculó el
        # caché de 5 minutos de `/metricas` (un alta self-service reciente).
        # No es un error: es un cliente sano sin contratos todavía. Antes se
        # reportaba como "base ilegible" (hallazgo H-3 de la fase).
        con_contratos_activos = False
    else:
        con_contratos_activos = conteo > 0

    clasificacion = _clasificar(
        usuarios_con_cuenta, usuarios_activos_30d, dias_desde_alta, con_contratos_activos,
    )

    return {
        "slug": slug,
        "nombre": cliente_row.nombre,
        "estado_cuenta": estado,
        "error": error,
        "cohorte": cohorte,
        "clasificacion": clasificacion,
        "usuarios_con_cuenta": usuarios_con_cuenta,
        "usuarios_activos_30d": usuarios_activos_30d,
        "dias_sin_acceso": dias_sin_acceso,
        "con_contratos_activos": con_contratos_activos,
    }


def _cohortes(clientes: list[dict]) -> list[dict]:
    """Agregado por mes de alta, ascendente y con la ``null`` al final."""
    por_cohorte: dict[str | None, list[dict]] = {}
    for c in clientes:
        por_cohorte.setdefault(c["cohorte"], []).append(c)

    claves = sorted(k for k in por_cohorte if k is not None)
    if None in por_cohorte:
        claves.append(None)

    salida = []
    for clave in claves:
        grupo = por_cohorte[clave]
        total = len(grupo)
        activos_30d = sum(1 for c in grupo if c["usuarios_activos_30d"] >= 1)
        fila = {
            "cohorte": clave,
            "clientes": total,
            "retencion_30d_pct": round(activos_30d * 100.0 / total, 1) if total else None,
        }
        for clasif in CLASIFICACIONES:
            fila[clasif] = sum(1 for c in grupo if c["clasificacion"] == clasif)
        salida.append(fila)
    return salida


def calcular_adopcion() -> dict:
    """El cuerpo completo de ``GET /api/plataforma/adopcion``.

    Todo del registro (``sesion_registro()``) más
    ``contratos_activos_por_cliente`` de ``plataforma_metricas``, que reusa el
    caché de 5 minutos de ``/metricas`` en vez de recorrer las N bases de
    negocio otra vez.
    """
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import EstadoCliente
    from app.plataforma_metricas import contratos_activos_por_cliente

    periodo = periodo_actual()
    hoy = _hoy()

    reg = sesion_registro()
    try:
        filas = reg.query(ClienteRow).order_by(ClienteRow.slug).all()
        estados = {e.slug: e.estado for e in reg.query(EstadoCliente).all()}
        alta_por_slug = _alta_por_slug(reg)
        contratos_por_slug = contratos_activos_por_cliente(periodo)

        clientes = [
            _fila_cliente(
                reg, f, estados.get(f.slug) or "activo", contratos_por_slug, alta_por_slug, hoy,
            )
            for f in filas
        ]
    finally:
        reg.close()

    clientes.sort(key=lambda c: (_ORDEN_LISTA[c["clasificacion"]], c["slug"]))

    return {
        "periodo": periodo,
        "generado_en": _ahora_iso(),
        "cohortes": _cohortes(clientes),
        "clientes": clientes,
    }
