"""Las reglas de las participaciones de cara: qué término cuenta un día, cuánto
queda para vender, las invariantes de los términos de una participación y el
juicio de una distribución (sus zonas contra lo contratado).

Gemela de ``frontend/src/utils/participaciones.ts``: las dos corren los MISMOS
casos (``frontend/scripts/casos/participaciones.json``, con
``tests/test_participaciones_reglas.py`` de este lado y
``scripts/probar-distribucion.mjs`` del otro) y tienen que dar exactamente lo
mismo, frases incluidas. Lo que la dueña ve mientras carga una participación o
dibuja es lo que este servidor acepta o rechaza con el candado tomado: si las
dos cuentas se separaran, el formulario diría que entra y acá saldría 409.

Pura, sin base y sin reloj: ``hoy`` es SIEMPRE un parámetro (la capa con base
le pasa ``app.fechas.hoy()``, la fecha de Colombia). Las fechas son ``date``
(se aceptan también textos ``YYYY-MM-DD``, como los de los casos) y las que se
devuelven son ``date``, salvo en el ``extra`` de un rechazo, que va listo para
el JSON del 409. Los porcentajes, en puntos básicos enteros (1 pb = 0,01 %;
10 000 = la cara entera). La geometría (validar, medir, lo que se pisan dos
participaciones) es de ``zonas_geometria``; acá sólo se juzga lo medido.

Los términos son diccionarios con las claves de §3.2 del diseño: ``id``,
``space_id``, ``numero``, ``estado``, ``pb``, ``supplier_id``, ``marca``,
``desde``, ``hasta``, ``caduca``, ``baja_fecha`` (el día de la cancelación en
Colombia, ``baja_en`` pasado por ``ZONA_DEL_NEGOCIO``) y ``lease``
(``{"is_active", "start_date", "end_date"}`` o None). En un contrato,
proveedor, marca y fechas son los de su lease (la única verdad): las reglas
leen las fechas de ``lease`` cuando lo hay.

Diseño: §3 de ``participaciones/21-diseno-final.md`` (scratchpad de la etapa).
Sólo importa de ``app`` la geometría pura.
"""
from __future__ import annotations

import math
import re
from datetime import date, timedelta

from app.services.zonas_geometria import AREA_MINIMA_M2

# ── Constantes (§3.1) ────────────────────────────────────────────────────────

CARA_ENTERA_PB = 10000
PB_MIN = 1
PB_MAX = 10000
#: D8: lo dibujado no pasa lo contratado, estricto. «Ajustar al contratado»
#: deja margen por su cuenta (en el navegador).
TOLERANCIA_EXCESO_PB = 0
#: Supervisar avisa de las reservas que caducan dentro de estos días.
DIAS_AVISO_CADUCA = 7

ESTADOS_VISIBLES = (
    "vigente", "firmado", "vencido", "cancelado", "reserva", "reserva_caducada", "reserva_cancelada",
)
ESTADOS_DE_DISTRIBUCION = ("sin_mueble", "sin_distribuir", "borrador", "para_revisar", "confirmada")

# ── Fechas y textos ──────────────────────────────────────────────────────────

_MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
_UN_DIA = timedelta(days=1)


def _d(x):
    """Una fecha: ``date`` tal cual; un texto ``YYYY-MM-DD``, leído; None, None."""
    if x is None or isinstance(x, date):
        return x
    return date.fromisoformat(x)


def _fecha_corta(d: date) -> str:
    """``2026-10-17`` → ``17 oct 2026`` (como ``fechaCorta`` del navegador,
    que copia el año del texto: ``0026`` sale ``0026``, no ``26``)."""
    return f"{d.day} {_MESES[d.month - 1]} {d.year:04d}"


def pct(pb: int) -> str:
    """«25 %», «33,33 %», «12,5 %», «0,01 %»."""
    if pb < 0:
        return "-" + pct(-pb)
    e, c = divmod(pb, 100)
    if c == 0:
        return f"{e} %"
    return f"{e},{f'{c:02d}'.rstrip('0')} %"


def _entero(n: int) -> str:
    """Un entero con punto de miles: ``2500`` → ``2.500``."""
    s = str(n)
    fuera = ""
    for i, ch in enumerate(s):
        if i > 0 and (len(s) - i) % 3 == 0:
            fuera += "."
        fuera += ch
    return fuera


_BLANCO = "[ \t  ]*"
_RE_PORCENTAJE = re.compile(f"{_BLANCO}([0-9]{{1,3}})(?:[.,]([0-9]{{1,2}}))?{_BLANCO}%?{_BLANCO}")


def pb_de_texto(s) -> int | None:
    """Lo que se escribe en «Porcentaje»: «25», «25,5», «25.5», «25 %» → 2500,
    2550. None si no es un número con hasta dos decimales entre 0,01 y 100.
    (``[0-9]`` y no ``\\d``, que en Python también acepta otras cifras.)"""
    if not isinstance(s, str):
        return None
    m = _RE_PORCENTAJE.fullmatch(s)
    if not m:
        return None
    pb = int(m.group(1)) * 100 + (0 if m.group(2) is None else int(m.group(2).ljust(2, "0")))
    return pb if PB_MIN <= pb <= PB_MAX else None


_ORILLAS = " \t\n\r  "


def _marca_normal(m) -> str:
    """La marca se compara sin mayúsculas ni espacios de los costados (I2)."""
    return (m or "").strip(_ORILLAS).lower()


# ── Qué cuenta un día (§3.3) ─────────────────────────────────────────────────


def _fechas_de(t) -> tuple[date, date]:
    """Las fechas del término: las del lease si es un contrato con lease."""
    L = t.get("lease")
    if t.get("estado") == "contrato" and L:
        return _d(L["start_date"]), _d(L["end_date"])
    return _d(t.get("desde")), _d(t.get("hasta"))


def _se_sostiene(t, hoy: date) -> bool:
    """La reserva se sostiene hoy (compara con HOY, no con el día que se mira)."""
    caduca = _d(t.get("caduca"))
    return caduca is not None and caduca >= hoy


def cuenta_el_dia(t, d, hoy) -> bool:
    """¿El término cuenta en la capacidad el día ``d``? Para ``d ≥ hoy`` es
    «contrato activo que cubre el día» o «reserva no caducada que cubre el
    día»; la rama del pasado (lo vencido contó sus días; lo cancelado, hasta la
    baja) sirve a los informes."""
    d, hoy = _d(d), _d(hoy)
    estado = t.get("estado")
    if estado == "contrato":
        L = t.get("lease")
        if not L:
            return False
        inicio, fin = _d(L["start_date"]), _d(L["end_date"])
        if not (inicio <= d <= fin):
            return False
        if L["is_active"]:
            return True
        baja = _d(t.get("baja_fecha"))
        if baja is None:
            return fin < hoy
        return d < baja
    if estado == "reserva":
        return _se_sostiene(t, hoy) and _d(t["desde"]) <= d <= _d(t["hasta"])
    return False


def cuenta_ese_dia(terminos, d, hoy) -> bool:
    """¿Alguno de los términos cuenta el día ``d``? («Ver al día».)"""
    for t in terminos:
        if cuenta_el_dia(t, d, hoy):
            return True
    return False


def vivo(t, hoy) -> bool:
    """El término cuenta hoy o más adelante."""
    hoy = _d(hoy)
    estado = t.get("estado")
    if estado == "contrato":
        L = t.get("lease")
        return bool(L) and bool(L["is_active"]) and _d(L["end_date"]) >= hoy
    if estado == "reserva":
        return _se_sostiene(t, hoy) and _d(t["hasta"]) >= hoy
    return False


def estado_visible(t, hoy) -> str:
    """El estado que dice la interfaz (``ESTADOS_VISIBLES``). Un contrato sin
    lease (dato roto) se lee como cerrado: «cancelado»."""
    hoy = _d(hoy)
    estado = t.get("estado")
    if estado == "contrato":
        L = t.get("lease")
        if t.get("baja_fecha") is not None or not L:
            return "cancelado"
        if _d(L["end_date"]) < hoy:
            return "vencido"
        if not L["is_active"]:
            return "cancelado"
        if _d(L["start_date"]) > hoy:
            return "firmado"
        return "vigente"
    if estado == "reserva_cancelada":
        return "reserva_cancelada"
    if not _se_sostiene(t, hoy):
        return "reserva_caducada"
    return "reserva"


# ── Capacidad por día y disponible por período (§3.4) ────────────────────────


def intervalos_que_cuentan(terminos, fisicos, hoy, excluir_id=None) -> list[dict]:
    """Lo que cuenta desde hoy: lo físico como la cara entera, los contratos
    activos y las reservas que se sostienen. ``excluir_id``: el término que se
    está cambiando (no compite consigo mismo). Sólo vale para días ≥ hoy.
    Cada intervalo: ``{"desde", "hasta", "pb"}``."""
    hoy = _d(hoy)
    I = [{"desde": _d(f["desde"]), "hasta": _d(f["hasta"]), "pb": CARA_ENTERA_PB} for f in fisicos]
    for t in terminos:
        if excluir_id is not None and t.get("id") == excluir_id:
            continue
        L = t.get("lease")
        if t.get("estado") == "contrato" and L and L["is_active"]:
            I.append({"desde": _d(L["start_date"]), "hasta": _d(L["end_date"]), "pb": t["pb"]})
        elif t.get("estado") == "reserva" and _se_sostiene(t, hoy):
            I.append({"desde": _d(t["desde"]), "hasta": _d(t["hasta"]), "pb": t["pb"]})
    return I


def _signo(x: int) -> int:
    return -1 if x < 0 else (1 if x > 0 else 0)


def _eventos(I, desde: date, hasta: date) -> list[tuple[date, int]]:
    """Los eventos de la suma diaria recortados a [desde, hasta], ordenados por
    fecha y, en la misma fecha, primero las salidas: un intervalo que termina
    el 30 y otro que empieza el 1 no se suman. La salida de lo que llega hasta
    el final del período no se anota (después de ``hasta`` no se mira nada):
    así un contrato «hasta el 31 dic 9999» no pide ``date.max + 1 día``
    (OverflowError, un 500)."""
    ev = []
    for it in I:
        a, b = max(_d(it["desde"]), desde), min(_d(it["hasta"]), hasta)
        if a > b:
            continue
        ev.append((a, it["pb"]))
        if b < hasta:
            ev.append((b + _UN_DIA, -it["pb"]))
    ev.sort(key=lambda e: (e[0], _signo(e[1])))
    return ev


def pico(I, desde, hasta) -> tuple[int, date]:
    """El máximo de la suma diaria en [desde, hasta] y el primer día en que se
    alcanza (``desde`` si no hay nada)."""
    desde, hasta = _d(desde), _d(hasta)
    suma = mejor = 0
    dia = desde
    for f, delta in _eventos(I, desde, hasta):
        suma += delta
        if suma > mejor:
            mejor, dia = suma, f
    return mejor, dia


def comprometido(I, d) -> int:
    """Lo comprometido el día ``d``."""
    return pico(I, d, d)[0]


def disponible(I, desde, hasta, hoy) -> int:
    """Lo que se puede vender en TODO el período (el pasado no se vende). Lo
    dibujado no lo cambia."""
    a, hasta = max(_d(desde), _d(hoy)), _d(hasta)
    if a > hasta:
        return 0
    return max(0, CARA_ENTERA_PB - pico(I, a, hasta)[0])


def _primer_dia_con_lugar(I, desde: date, hasta: date):
    """El primer día de [desde, hasta] en que queda algo para vender, o None."""
    if desde > hasta:
        return None
    suma = 0
    desde_aca = desde
    ev = _eventos(I, desde, hasta)
    i = 0
    while i < len(ev):
        f = ev[i][0]
        if desde_aca < f and suma < CARA_ENTERA_PB:
            return desde_aca
        while i < len(ev) and ev[i][0] == f:
            suma += ev[i][1]
            i += 1
        desde_aca = f
    return desde_aca if desde_aca <= hasta and suma < CARA_ENTERA_PB else None


def revisar_capacidad(I, fisicos, pb, desde, hasta, cara, hoy):
    """La regla de capacidad (§3.4), con el candado tomado: ``None`` o
    ``(codigo, frase, extra)``. Mira sólo [max(desde, hoy), hasta]: el pasado
    no se valida. ``I`` sin el término propio. Las frases no nombran
    proveedores ni montos (las puede ver Vender en vivo). ``extra`` va listo
    para el JSON: ``disponible_pb`` y ``dia`` (texto ISO)."""
    a, hasta = max(_d(desde), _d(hoy)), _d(hasta)
    if a > hasta:
        return None
    for f in fisicos:
        f_desde, f_hasta = _d(f["desde"]), _d(f["hasta"])
        if f_desde <= hasta and a <= f_hasta:
            cuando = f"del {_fecha_corta(f_desde)} al {_fecha_corta(f_hasta)}"
            if f.get("huerfano"):
                frase = (f"La cara {cara} tiene un contrato de participación sin término {cuando}, que cuenta como la "
                         "cara entera hasta que se aclare (Supervisar → «Para revisar»): en esas fechas no se vende "
                         "por participación.")
            else:
                frase = (f"La cara {cara} está vendida entera o por partes {cuando}: en esas fechas no se vende por "
                         "participación.")
            return "cara_vendida_entera", frase, {}
    p, dia = pico(I, a, hasta)
    if p + pb > CARA_ENTERA_PB:
        queda = max(0, CARA_ENTERA_PB - p)
        return ("capacidad_excedida",
                f"No entra: el {_fecha_corta(dia)} la cara {cara} ya tiene {pct(p)} comprometido; "
                f"queda {pct(queda)} y pediste {pct(pb)}.",
                {"disponible_pb": queda, "dia": dia.isoformat()})
    return None


# ── Invariantes de término (§3.5) ────────────────────────────────────────────


def _el_mas_nuevo(vivos):
    """El término vivo más nuevo (el de inicio más tarde; a igual inicio, el de
    id mayor)."""
    mejor = None
    for t in vivos:
        if mejor is None:
            mejor = t
            continue
        a, b = _fechas_de(t)[0], _fechas_de(mejor)[0]
        if a > b or (a == b and t["id"] > mejor["id"]):
            mejor = t
    return mejor


_YA_NO_RIGE = "Esa participación ya no rige: cargala de nuevo con «Nueva participación» (se prellena)."
_NO_EDITABLE = "Sólo se cambia una reserva provisional viva: un contrato se cancela o se renueva."
_NO_CONFIRMABLE = "Sólo se confirma una reserva provisional viva."


def revisar_terminos(de, cambio, hoy):
    """Las tres invariantes de los términos de UNA participación (§3.5), más el
    estado del término que se toca (§4.7, §5.3): renovar sólo el contrato vivo
    más nuevo, cambiar o confirmar sólo una reserva viva. ``None`` o
    ``(codigo, frase, {})``.

    Orden: el estado, I2 (proveedor y marca, contra TODOS los otros términos),
    I3 (porcentaje, contra los otros vivos) e I1 (fechas, contra los otros
    vivos): primero lo que sólo se arregla con «Nueva participación», después
    lo que se arregla con otras fechas. En un cambio, I2 e I3 se miran sólo si
    el cambio toca la marca o el porcentaje: un dato viejo desparejo no frena
    cambiar otra cosa.

    ``cambio``: ``{"tipo": "alta"}``; ``{"tipo": "renovar", "renueva_a",
    "desde", "hasta", "pb", "supplier_id", "marca"}`` (proveedor, marca y pb
    copiados del término renovado); ``{"tipo": "editar" | "confirmar", "id"}``
    con las claves que cambian (``pb``, ``desde``, ``hasta``, ``marca``).
    """
    hoy = _d(hoy)
    tipo = cambio["tipo"]
    if tipo == "alta":
        return None
    vivos = [t for t in de if vivo(t, hoy)]
    renovar = tipo == "renovar"
    if renovar:
        t = next((x for x in de if x["id"] == cambio["renueva_a"]), None)
        if t is None or not vivo(t, hoy):
            return "no_renovable", _YA_NO_RIGE, {}
        if t["estado"] != "contrato":
            return ("no_renovable", "Una reserva provisional no se renueva: confirmala como contrato o cambiá sus "
                    "fechas.", {})
        ultimo = _el_mas_nuevo(vivos)
        if ultimo is not None and ultimo["id"] != t["id"]:
            a, b = _fechas_de(ultimo)
            cuando = f"(del {_fecha_corta(a)} al {_fecha_corta(b)})"
            # Una reserva no se renueva: decirle «renová ése» la mandaba a otro «no».
            if ultimo["estado"] == "reserva":
                return ("no_renovable", f"La participación {t['numero']} ya tiene una reserva provisional más nueva "
                        f"{cuando}: confirmala como contrato y renová ése.", {})
            return ("no_renovable", f"La participación {t['numero']} ya tiene un término más nuevo {cuando}: "
                    "renová ése.", {})
        nuevo = {"desde": _d(cambio["desde"]), "hasta": _d(cambio["hasta"]), "pb": cambio["pb"],
                 "supplier_id": cambio["supplier_id"], "marca": cambio.get("marca")}
        otros = list(de)
        mira_marca = mira_pb = True
    else:
        t = next((x for x in de if x["id"] == cambio["id"]), None)
        if tipo == "editar":
            if t is None or t["estado"] != "reserva" or not vivo(t, hoy):
                return "no_editable", _NO_EDITABLE, {}
        else:
            if t is None or t["estado"] != "reserva":
                return "no_editable", _NO_CONFIRMABLE, {}
            if not _se_sostiene(t, hoy):
                caduca = _d(t.get("caduca"))
                return ("reserva_caducada", f"La reserva caducó el {_fecha_corta(caduca)}: cargá una nueva."
                        if caduca is not None else "La reserva caducó: cargá una nueva.", {})
            if not vivo(t, hoy):
                return "no_editable", _NO_CONFIRMABLE, {}
        d0, h0 = _fechas_de(t)
        nuevo = {
            "desde": _d(cambio["desde"]) if cambio.get("desde") is not None else d0,
            "hasta": _d(cambio["hasta"]) if cambio.get("hasta") is not None else h0,
            "pb": cambio["pb"] if cambio.get("pb") is not None else t["pb"],
            "supplier_id": t.get("supplier_id"),
            "marca": cambio["marca"] if "marca" in cambio else t.get("marca"),
        }
        otros = [x for x in de if x["id"] != t["id"]]
        mira_marca = "marca" in cambio and _marca_normal(cambio["marca"]) != _marca_normal(t.get("marca"))
        mira_pb = cambio.get("pb") is not None and cambio["pb"] != t["pb"]
    # I2: el mismo proveedor y la misma marca que todos los otros términos.
    if mira_marca:
        for o in otros:
            if o.get("supplier_id") != nuevo["supplier_id"] or _marca_normal(o.get("marca")) != _marca_normal(nuevo["marca"]):
                return ("otro_proveedor", "Otro proveedor u otra marca es otra participación: cargala con «Nueva "
                        "participación».", {})
    # I3: el mismo porcentaje que los otros vivos.
    if mira_pb:
        for o in otros:
            if vivo(o, hoy) and o["pb"] != nuevo["pb"]:
                return ("otro_porcentaje", "Con otro porcentaje es una participación nueva: cargala con «Nueva "
                        "participación» (podés dibujarla en el mismo lugar desde que empiece).", {})
    # I1: los vivos no se pisan en fechas. Al renovar, el nuevo empieza después
    # de todos (§4.7).
    n = de[0]["numero"] if de else None
    if renovar:
        ultimo = None
        for o in vivos:
            if ultimo is None or _fechas_de(o)[1] > _fechas_de(ultimo)[1]:
                ultimo = o
        if ultimo is not None and nuevo["desde"] <= _fechas_de(ultimo)[1]:
            a, b = _fechas_de(ultimo)
            return ("termino_superpuesto", f"La participación {n} ya tiene un término del {_fecha_corta(a)} al "
                    f"{_fecha_corta(b)}: el nuevo tiene que empezar después.", {})
    else:
        pisan = []
        for o in otros:
            if not vivo(o, hoy):
                continue
            a, b = _fechas_de(o)
            if a <= nuevo["hasta"] and nuevo["desde"] <= b:
                pisan.append(o)
        if pisan:
            primero = pisan[0]
            for o in pisan:
                if _fechas_de(o)[0] < _fechas_de(primero)[0]:
                    primero = o
            a, b = _fechas_de(primero)
            return ("termino_superpuesto", f"La participación {n} ya tiene otro término del {_fecha_corta(a)} al "
                    f"{_fecha_corta(b)}: las fechas no pueden pisarse.", {})
    return None


def rige(terminos, hoy) -> bool:
    """¿Rige la participación (tiene algún término vivo)? Sin ninguno, sus
    zonas son historia (D19): no cuentan, no chocan y se dibujan en gris."""
    for t in terminos:
        if vivo(t, hoy):
            return True
    return False


def contratado_pb(terminos, hoy) -> tuple[int, bool]:
    """Lo contratado de una participación (§3.5): el pb de sus vivos (todos
    iguales por I3; si un dato viejo los trae distintos, el menor y
    ``desiguales``); sin vivos, el del último término, para la historia (por
    fecha de inicio y, a igual inicio, el de id mayor; un contrato sin lease,
    dato roto sin fechas, cuenta como el más viejo: comparar None con una
    fecha sería un TypeError, un 500). Devuelve ``(pb, desiguales)``."""
    hoy = _d(hoy)
    pb = None
    desiguales = False
    for t in terminos:
        if not vivo(t, hoy):
            continue
        if pb is None:
            pb = t["pb"]
        elif t["pb"] != pb:
            desiguales = True
            if t["pb"] < pb:
                pb = t["pb"]
    if pb is not None:
        return pb, desiguales
    ultimo = None
    for t in terminos:
        if ultimo is None:
            ultimo = t
            continue
        a, b = _fechas_de(t)[0] or date.min, _fechas_de(ultimo)[0] or date.min
        if a > b or (a == b and t["id"] > ultimo["id"]):
            ultimo = t
    return (ultimo["pb"] if ultimo is not None else 0), False


# ── Solape (§3.6) ────────────────────────────────────────────────────────────


def _ventanas(terminos, hoy: date) -> list[tuple[date, date]]:
    """Los períodos en que rige la participación desde hoy."""
    w = []
    for t in terminos:
        if not vivo(t, hoy):
            continue
        a, b = _fechas_de(t)
        a2 = max(a, hoy)
        if a2 <= b:
            w.append((a2, b))
    return w


def _primer_cruce(t1, t2, hoy: date):
    """El primer día (desde hoy) en que rigen las dos participaciones, o None."""
    primero = None
    for a1, b1 in _ventanas(t1, hoy):
        for a2, b2 in _ventanas(t2, hoy):
            if a1 <= b2 and a2 <= b1:
                d = max(a1, a2)
                if primero is None or d < primero:
                    primero = d
    return primero


def se_cruzan_en_fechas(t1, t2, hoy) -> bool:
    """¿Hay algún día, desde hoy, en que rigen las dos? Si no, pueden ocupar la
    misma región (D19)."""
    return _primer_cruce(t1, t2, _d(hoy)) is not None


# ── El juicio de una distribución (§3.8) ─────────────────────────────────────


def _frase_de_zona(codigo: str, k: int, superficie: str) -> str:
    """«La zona 1…»: a la persona se le cuenta desde 1 (``zona`` sigue 0-based)."""
    z = f"La zona {k + 1}"
    return {
        "ZONA_MALFORMADA": f"{z} no es una lista de puntos: borrala y dibujala de nuevo.",
        "ZONA_POCOS_VERTICES": f"{z} tiene menos de tres puntos: agregale puntos o borrala.",
        "ZONA_DEMASIADOS_VERTICES": f"{z} tiene más de 24 puntos: simplificala o partila en dos.",
        "ZONA_FUERA": f"{z} se sale de {superficie}: tiene que quedar adentro.",
        "ZONA_SE_CRUZA": f"{z} se cruza consigo misma: dibujala sin que sus bordes se crucen.",
        "ZONA_SIN_AREA": f"{z} es demasiado chica (menos de 1 cm²).",
    }[codigo]


_PARA_REVISAR_FRASE = ("El mueble cambió desde que se confirmó esta distribución (medidas, entrepaños o tipo): "
                       "revisala y volvé a confirmar.")


def _problema(codigo, frase, zona, participaciones) -> dict:
    """= ``ProblemaOut`` (§5.3): ``zona`` es el índice 0-based en la lista
    enviada o guardada; ``participaciones``, los NÚMEROS, de menor a mayor."""
    return {"codigo": codigo, "frase": frase, "zona": zona, "participaciones": participaciones}


def juzgar(medidas, terminos_por_s, hoy, *, confirmada=False, firma_cambio=False, orientacion="frente") -> dict:
    """Juzga lo medido (``zonas_geometria.medir``) con los términos: barato, así
    corre adentro del candado con los términos frescos.

    1. por zona, en orden: su código de validación (error); una zona que no es
       de ninguna participación de la cara, o de una sin términos
       (``ZONA_AJENA``, error: sin término no hay número que nombrar); la de una
       participación que ya no rige (error al mandarla; con ``confirmada``, la
       capa confirmada guardada, es historia y no dice nada); si no,
       ``ZONA_SIN_SUPERFICIE_UTIL`` (aviso). Un aviso nunca tapa un error.
    2. por participación viva con zonas: ``EXCESO`` si dibujado > contratado.
    3. por par que se pisa más de 1 cm² y cuyas fechas se cruzan: ``SOLAPE``.
    4. por participación viva: ``TERMINOS_DESIGUALES`` (dato viejo) y
       ``PENDIENTE`` si falta dibujar.
    5. ``PARA_REVISAR`` si la firma cambió.

    ``terminos_por_s``: ``{space_id de la participación: [términos]}`` (todas
    las de la cara). ``orientacion="arriba"`` (el metro): las frases dicen «la
    tapa». Devuelve ``{"errores", "avisos", "cuentas"}``; ``cuentas`` por
    participación, de menor a mayor id: ``numero``, ``viva``, ``contratado``,
    ``dibujado``, ``pendiente``, ``exceso``. Una que ya no rige no debe ni le
    sobra nada: ``pendiente`` y ``exceso`` en 0 (su ``contratado`` es el del
    último término, para la historia).
    """
    hoy = _d(hoy)
    superficie = "la tapa" if orientacion == "arriba" else "la cara"
    dibujado_pb = medidas["dibujado_pb"]
    errores, avisos = [], []
    cuentas: dict[int, dict] = {}
    desiguales = set()
    for s in sorted(set(terminos_por_s) | set(dibujado_pb)):
        ts = terminos_por_s.get(s)
        dibujado = dibujado_pb.get(s, 0)
        if not ts:
            cuentas[s] = {"numero": None, "viva": False, "contratado": 0, "dibujado": dibujado,
                          "pendiente": 0, "exceso": 0}
            continue
        viva = rige(ts, hoy)
        c, desparejos = contratado_pb(ts, hoy)
        if desparejos:
            desiguales.add(s)
        cuentas[s] = {"numero": ts[0]["numero"], "viva": viva, "contratado": c,
                      "dibujado": dibujado, "pendiente": max(0, c - dibujado) if viva else 0,
                      "exceso": dibujado - c if viva else 0}
    con_lugar = set(medidas["sin_superficie_util"])
    # 1. Cada zona.
    for v in medidas["validaciones"]:
        s = v["participacion_space_id"]
        cu = cuentas.get(s)
        conocida = bool(terminos_por_s.get(s))
        if confirmada and conocida and cu is not None and not cu["viva"]:
            continue  # historia (D19)
        ns = [cu["numero"]] if cu is not None and cu["numero"] is not None else []
        k = v["k"]
        if v["codigo"] is not None:
            errores.append(_problema(v["codigo"], _frase_de_zona(v["codigo"], k, superficie), k, ns))
        elif not conocida:
            errores.append(_problema("ZONA_AJENA", f"La zona {k + 1} no es de ninguna participación de esta cara: "
                                     "borrala.", k, []))
        elif cu is not None and not cu["viva"]:
            errores.append(_problema(
                "ZONA_DE_PARTICIPACION_TERMINADA",
                f"La zona {k + 1} es de la participación {cu['numero']}, que ya no rige (vencida, cancelada o "
                "caducada): borrala; queda en el historial.", k, ns))
        elif k in con_lugar:
            avisos.append(_problema(
                "ZONA_SIN_SUPERFICIE_UTIL",
                f"La zona {k + 1} cae entera sobre lo que no se vende (zócalo, parantes, copete): no suma.", k, ns))
    # 2. Más dibujado que contratado.
    for s, cu in cuentas.items():
        if not cu["viva"] or s not in dibujado_pb or cu["numero"] is None:
            continue
        if cu["exceso"] > TOLERANCIA_EXCESO_PB:
            errores.append(_problema(
                "EXCESO",
                f"La participación {cu['numero']} tiene dibujado {pct(cu['dibujado'])} y contratado "
                f"{pct(cu['contratado'])}: achicá sus zonas (o usá «Ajustar al contratado»).",
                None, [cu["numero"]]))
    # 3. Dos participaciones que se pisan y rigen a la vez.
    for p in medidas["pisadas"]:
        if not p["m2"] > AREA_MINIMA_M2:
            continue
        t1, t2 = terminos_por_s.get(p["s1"]), terminos_por_s.get(p["s2"])
        if t1 is None or t2 is None or not se_cruzan_en_fechas(t1, t2, hoy):
            continue
        n1, n2 = cuentas[p["s1"]]["numero"], cuentas[p["s2"]]["numero"]
        ns = [n1, n2] if n1 < n2 else [n2, n1]
        errores.append(_problema(
            "SOLAPE",
            f"Las zonas de las participaciones {ns[0]} y {ns[1]} se pisan "
            f"({_entero(math.floor(p['m2'] * 10000 + 0.5))} cm²) y sus fechas se cruzan: separalas.",
            None, ns))
    # 4. Lo que falta dibujar (y los datos viejos desparejos).
    for s, cu in cuentas.items():
        if not cu["viva"] or cu["numero"] is None:
            continue
        if s in desiguales:
            avisos.append(_problema(
                "TERMINOS_DESIGUALES",
                f"La participación {cu['numero']} tiene términos con porcentajes distintos (dato viejo): se toma el "
                "menor.", None, [cu["numero"]]))
        if cu["pendiente"] > 0:
            avisos.append(_problema(
                "PENDIENTE",
                f"A la participación {cu['numero']} le falta dibujar {pct(cu['pendiente'])} de "
                f"{pct(cu['contratado'])}.", None, [cu["numero"]]))
    # 5. El mueble cambió desde la confirmación.
    if firma_cambio:
        avisos.append(_problema("PARA_REVISAR", _PARA_REVISAR_FRASE, None, []))
    return {"errores": errores, "avisos": avisos, "cuentas": cuentas}


# ── Un cambio de término no puede romper la confirmada (§3.11) ───────────────


def _clave(p) -> tuple:
    return p["codigo"], tuple(sorted(p["participaciones"]))


def _los_que_rompen(juicio) -> list[dict]:
    return [p for p in juicio["errores"] if p["codigo"] in ("SOLAPE", "EXCESO")]


def rompe_distribucion(medidas, antes, despues, hoy) -> list[dict]:
    """Los SOLAPE y EXCESO que la capa medida tiene con los términos de
    ``despues`` y no tenía con los de ``antes`` (clave: código y números de
    participación). Lo que ya estaba roto no frena. Con algo nuevo, el
    servidor contesta 409 ``rompe_distribucion`` sobre la confirmada (y lo pone
    en ``avisos`` sobre el borrador). Las frases dicen qué rompe el cambio."""
    hoy = _d(hoy)
    ya = {_clave(p) for p in _los_que_rompen(juzgar(medidas, antes, hoy, confirmada=True))}
    juicio = juzgar(medidas, despues, hoy, confirmada=True)
    por_numero = {cu["numero"]: s for s, cu in juicio["cuentas"].items() if cu["numero"] is not None}
    nuevos = []
    for p in _los_que_rompen(juicio):
        if _clave(p) in ya:
            continue
        if p["codigo"] == "SOLAPE":
            n1, n2 = p["participaciones"]
            dia = _primer_cruce(despues[por_numero[n1]], despues[por_numero[n2]], hoy)
            nuevos.append({**p, "frase": f"Con esas fechas, las zonas de la participación {n1} pisan las de la {n2} "
                           f"desde el {_fecha_corta(dia)}: corregí la distribución (o elegí otras fechas) y volvé a "
                           "intentar."})
        else:
            cu = juicio["cuentas"][por_numero[p["participaciones"][0]]]
            nuevos.append({**p, "frase": f"Con ese porcentaje, la participación {cu['numero']} queda con "
                           f"{pct(cu['dibujado'])} dibujado y {pct(cu['contratado'])} contratado: achicá sus zonas "
                           "(o elegí otro porcentaje) y volvé a intentar."})
    return nuevos


def mensaje_de_rompe(problemas) -> str:
    """El ``message`` del 409 ``rompe_distribucion``: el primer problema y
    cuántos más."""
    if not problemas:
        return ""
    mas = len(problemas) - 1
    if mas == 0:
        return problemas[0]["frase"]
    return f"{problemas[0]['frase']} Además hay {mas} problema{'' if mas == 1 else 's'} más."


# ── Estados derivados de la distribución (§3.9, §3.10) ───────────────────────


def para_revisar(distribucion, firma_actual) -> bool:
    """La confirmada quedó vieja: el mueble cambió (firma distinta, o sin
    firma). ``distribucion``: ``{"fixture_id", "confirmada_en",
    "firma_confirmada", "borrador_en"}`` (las fechas sólo se miran como
    presentes o ausentes) o None."""
    return (distribucion is not None and distribucion.get("confirmada_en") is not None
            and distribucion.get("firma_confirmada") != firma_actual)


def estado_distribucion(por_participacion, fixture_id, distribucion, firma_actual) -> str:
    """§3.10. ``por_participacion``: el mueble está en el plano y esta cara se
    vende por participación. ``fixture_id``: el id del mueble del plano que
    tiene hoy el código (una distribución dibujada para otro mueble no vale,
    §2.5)."""
    if not por_participacion:
        return "sin_mueble"
    d = distribucion
    if (d is None or (d.get("confirmada_en") is None and d.get("borrador_en") is None)
            or d.get("fixture_id") != fixture_id):
        return "sin_distribuir"
    if d.get("confirmada_en") is None:
        return "borrador"
    if para_revisar(d, firma_actual):
        return "para_revisar"
    return "confirmada"


# ── La ocupación anónima (Vender, Supervisar, plano 2D, banda 3D: §4.8, §10.8)


def dispo_por_participacion(ocupacion, desde, hasta, hoy) -> dict:
    """Cómo se pinta y se rotula una cara por participación en el período, sin
    nombres: ``tomado`` si no queda nada para vender en todo el período,
    ``libre`` si no hay nada comprometido, ``parcial`` si no. ``queda_pb`` =
    ``disponible``; ``libre_desde``: el primer día del período (desde hoy) en
    que queda algo para vender, o None. ``ocupacion``: ``{"intervalos":
    [{"desde", "hasta", "pb"}], "fisicos": [{"desde", "hasta"}]}``."""
    hoy, desde, hasta = _d(hoy), _d(desde), _d(hasta)
    I = [{"desde": f["desde"], "hasta": f["hasta"], "pb": CARA_ENTERA_PB} for f in ocupacion.get("fisicos") or []]
    I += [{"desde": it["desde"], "hasta": it["hasta"], "pb": it["pb"]} for it in ocupacion.get("intervalos") or []]
    queda = disponible(I, desde, hasta, hoy)
    libre_desde = _primer_dia_con_lugar(I, max(desde, hoy), hasta)
    dispo = "tomado" if queda == 0 else ("libre" if queda == CARA_ENTERA_PB else "parcial")
    return {"dispo": dispo, "queda_pb": queda, "libre_desde": libre_desde}
