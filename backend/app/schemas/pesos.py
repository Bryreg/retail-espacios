"""La plata entra en pesos enteros (auditoría P2-11, 2026-10-30).

Las columnas son `Float` y los esquemas aceptaban cualquier decimal: un
`1234.5` tecleado (o mandado por un cliente viejo) quedaba guardado así, y las
cuentas que redondean al peso (Vender, la planilla, el canon del mes) decían
una cifra y la base otra. Cada esquema que recibe plata usa ``Pesos``: se
redondea al peso con los medios hacia arriba (``meses.al_peso``, el
``Math.round`` de Vender), así ``1234.5`` → ``1235`` en todos los caminos. Se
eligió redondear y no rechazar (422) para que un cliente viejo no pierda la
venta por un medio peso.
"""
from typing import Annotated, Optional

from pydantic import AfterValidator

from app.services.meses import al_peso


def _al_peso(v):
    return al_peso(v) if v is not None else v


#: Plata en pesos enteros: lo que llega se redondea al peso.
Pesos = Annotated[float, AfterValidator(_al_peso)]
PesosOpcional = Annotated[Optional[float], AfterValidator(_al_peso)]
