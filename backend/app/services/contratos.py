"""Cuál de los contratos de un espacio manda hoy.

La pregunta aparece en dos lugares que tienen que responder lo mismo: la
planometría que se abre por código de espacio, y la pantalla del mercaderista.
Si cada uno elige distinto, el enlace del correo muestra "así debe quedar" de un
contrato y los datos del otro.
"""
from datetime import date

from app.fechas import hoy as hoy_en_colombia
from app.models.models import Space, SpaceLease


def contrato_para_montar(space: Space, hoy: date | None = None) -> SpaceLease | None:
    """El contrato vigente sobre ese espacio, o el próximo que arranca.

    Por FECHAS y no sólo por la bandera: ``is_active`` se queda en True desde
    que el contrato se crea, así que un contrato firmado en agosto para
    diciembre respondería "vigente" durante cuatro meses.

    El que corre hoy manda; si no hay, el próximo. Mirar sólo "hoy" dejaba
    afuera al contrato recién vendido para la temporada que viene —que es justo
    cuando se prepara el montaje—. Los vencidos no responden: "así debe quedar"
    de algo que ya se desmontó no es una respuesta.
    """
    hoy = hoy or hoy_en_colombia()
    activos = [l for l in space.leases if l.is_active]
    corriendo = [l for l in activos if l.start_date <= hoy <= l.end_date]
    if corriendo:
        return max(corriendo, key=lambda l: l.start_date)
    proximos = [l for l in activos if l.start_date > hoy]
    if proximos:
        return min(proximos, key=lambda l: l.start_date)
    return None
