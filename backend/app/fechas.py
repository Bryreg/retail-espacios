"""La fecha del negocio: la de Colombia, no la del servidor.

Render corre en UTC, cinco horas adelante de Colombia, y el código preguntaba
`date.today()`: desde las 7 p. m. el servidor ya vivía en el día siguiente. Un
contrato que vencía hoy se liberaba a esa hora —y se podía volver a vender esa
misma noche—, uno que arrancaba mañana ya figuraba vigente, y los recordatorios
de vencimiento salían con un día corrido (2026-10-02).

Toda decisión del negocio que dependa de «qué día es hoy» —vigencia de un
contrato, vencimientos, recordatorios, montajes— pregunta acá.

Lo que NO pasa por acá, a propósito: las marcas de tiempo (`datetime.now(
timezone.utc)`), que son instantes y no días; y el mes de la consola de la
plataforma (`plataforma_metricas.periodo_actual`), que se fijó en UTC como
decisión propia (ver docs/ESTADO.md).

Colombia no tiene horario de verano desde 1993: es UTC−5 todo el año, así que
no hace falta la base de husos horarios (que la imagen `slim` ni trae).
"""
from datetime import date, datetime, timedelta, timezone

ZONA_DEL_NEGOCIO = timezone(timedelta(hours=-5), "America/Bogota")


def ahora() -> datetime:
    """El instante actual, con la hora de Colombia."""
    return datetime.now(ZONA_DEL_NEGOCIO)


def hoy() -> date:
    """El día de hoy en Colombia."""
    return ahora().date()


_MESES_CORTOS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def dia_corto(d: date) -> str:
    """«3 nov»; con el año si no es el de hoy («3 ene 2027»). Es como se dicen
    las fechas delante del proveedor, en Vender (nunca ISO)."""
    texto = f"{d.day} {_MESES_CORTOS[d.month - 1]}"
    return texto if d.year == hoy().year else f"{texto} {d.year}"
