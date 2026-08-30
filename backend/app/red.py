"""De qué dirección viene una petición, cuando hay un proxy en el medio.

Vive aparte porque lo necesitan dos cosas que no se pueden importar entre sí:
el freno de intentos del login y la bitácora.
"""
import ipaddress

from fastapi import Request


def parsear_ip(bruto: str):
    """Una IP de la cadena `X-Forwarded-For`, con o sin puerto, o None."""
    bruto = bruto.strip().strip('"')
    try:
        return ipaddress.ip_address(bruto)
    except ValueError:
        pass
    # "1.2.3.4:5678" y "[::1]:5678"
    if bruto.startswith("[") and "]" in bruto:
        bruto = bruto[1:bruto.index("]")]
    elif bruto.count(":") == 1:
        bruto = bruto.rsplit(":", 1)[0]
    try:
        return ipaddress.ip_address(bruto)
    except ValueError:
        return None


def es_interna(ip) -> bool:
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved


def ip_del_cliente(request: Request | None) -> str:
    """La IP real de quien pide, detrás del proxy de Render.

    Sin esto el freno de intentos era decorativo en producción: todas las
    peticiones llegan desde la misma dirección interna del balanceador, así que
    o se contaban todas juntas —y el primer atacante dejaba afuera a los
    supermercados— o se contaba una sola IP para todo el mundo.

    `X-Forwarded-For` es una lista y **el cliente puede inventar el principio**:
    manda `X-Forwarded-For: 1.2.3.4` y el proxy le agrega atrás la dirección
    desde la que realmente se conectó. Por eso se lee de derecha a izquierda y
    se toma la primera pública: las de la izquierda son las que se pueden
    falsificar, las internas son saltos del propio proxy.

    Y si la conexión llega directa —el peer ya es una dirección pública, no hay
    proxy adelante— la cabecera se ignora entera, porque ahí sí sería puro
    invento del cliente.
    """
    if request is None:
        return "desconocida"

    peer = parsear_ip(request.client.host) if request.client else None
    if peer is not None and not es_interna(peer):
        return str(peer)

    cadena = request.headers.get("x-forwarded-for", "")
    candidatos = [p for p in (t.strip() for t in cadena.split(",")) if p]
    for bruto in reversed(candidatos):
        ip = parsear_ip(bruto)
        if ip is not None and not es_interna(ip):
            return str(ip)

    # Todo interno: red privada o desarrollo. Sirve igual para separar máquinas.
    for bruto in reversed(candidatos):
        ip = parsear_ip(bruto)
        if ip is not None:
            return str(ip)
    return str(peer) if peer is not None else "desconocida"
