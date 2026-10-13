"""La suscripción, vista por la dueña del supermercado (C2):
`GET /api/clientes/mi-suscripcion` y `PUT /api/clientes/mi-suscripcion/facturacion`.

Lo que RECABRA le cobra: el estado de su cuenta con el motivo, lo pactado, la
próxima cuenta de cobro (total, retenciones estimadas, neto y vencimiento), el
historial de un año de cuentas de cobro, pagos y cambios de estado, sus datos
de facturación —que puede corregir— y cómo transferir. La lógica vive en
`services/cobranza.py` (`mi_suscripcion`, `actualizar_facturacion`).

* **Sólo la dueña** —la membresía `owner`, no el rol del token— con el mismo
  `require_owner` de los derechos del titular y de la copia de seguridad. Su
  gente (admin no dueña, worker) recibe 403: la plata no le llega jamás.
* **Exento del corte por estado de cuenta** (`clientes.py`,
  `_EXENTOS_PARA_PONERSE_AL_DIA`): en sólo lectura y suspendida la dueña tiene
  que poder ver qué debe y corregir a dónde le llegan las cuentas de cobro. Es
  lo ÚNICO del supermercado que se le abre en ese estado, además de los
  derechos del titular: nada de negocio.
* **Del registro**, no de la base del supermercado: lo que RECABRA cobra es de
  la plataforma. No pasa por la bitácora de la consola: no es una consulta de
  la operadora.

Mismo prefijo `/clientes` que `alta`, `derechos` y `copia`, con rutas literales.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.derechos import require_owner

router = APIRouter(prefix="/clientes", tags=["suscripcion"])


class FacturacionIn(BaseModel):
    razon_social: str | None = None
    nit: str | None = None
    correo_facturacion: str | None = None
    municipio: str | None = None


@router.get("/mi-suscripcion")
def mi_suscripcion(duena: tuple = Depends(require_owner)):
    """Lo que debe y cómo pagarlo. Un supermercado sin suscripción (Galerías)
    recibe ``suscripcion: null``: está exento, no hay nada que pagar."""
    from app.services.cobranza import mi_suscripcion as armar

    cliente, _usuario_id, _email = duena
    return armar(cliente.slug)


@router.put("/mi-suscripcion/facturacion")
def guardar_facturacion(payload: FacturacionIn, duena: tuple = Depends(require_owner)):
    """Sus datos de facturación, para las cuentas de cobro que vengan. Sin
    suscripción, 409."""
    from app.services.cobranza import ErrorDeCobranza, actualizar_facturacion

    cliente, _usuario_id, email = duena
    try:
        return actualizar_facturacion(cliente.slug, payload.model_dump(), email or "duena")
    except ErrorDeCobranza as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e
