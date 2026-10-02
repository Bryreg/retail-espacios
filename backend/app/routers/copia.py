"""La copia de seguridad, para el dueño: `GET /api/clientes/mi-copia`.

Qué trae y qué no, en `services/copia.py`. Acá, la puerta:

* **Sólo el dueño** —la membresía `owner`, no el rol del token— con el mismo
  `require_owner` de los derechos del titular. La copia lleva todo, plata y
  datos de contacto incluidos: un admin invitado no la baja.
* **Queda en la bitácora** (`copia.descarga`), con el correo de quien la bajó.
  Es la salida más grande que tiene el sistema; que se pueda ver quién la hizo
  es lo mínimo.
* **Tres por hora por persona.** Armarla lee la base entera, fotos incluidas,
  en una instancia de 512 MB. El freno vive en memoria: corre un solo proceso
  (`--workers 1`) y lo que protege es la máquina, no un secreto —que se
  reinicie con un despliegue no abre nada.
* **Con la cuenta suspendida no sale**, como cualquier otra lectura de datos:
  `/mi-copia` no está entre los exentos por habeas data de `clientes.py`. Para
  ese derecho está «Descargar mis datos». En sólo lectura sí sale (es un GET).
"""
import tempfile
import threading
import time
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.clientes import Cliente, motor_de, sesion_de, sesion_registro
from app.fechas import ahora
from app.routers.derechos import require_owner
from app.services.bitacora import anotar
from app.services.copia import armar_copia

router = APIRouter(prefix="/clientes", tags=["copia"])

COPIAS_POR_HORA = 3
_VENTANA_SEGUNDOS = 3600
# Hasta acá en memoria; de ahí en más, a un archivo temporal en disco.
_EN_MEMORIA_HASTA = 8 * 1024 * 1024
_TROZO = 256 * 1024

_pedidos: dict[int, deque] = {}
_candado = threading.Lock()


def _frenar(usuario_id: int) -> None:
    with _candado:
        ya = time.time()
        cola = _pedidos.setdefault(usuario_id, deque())
        while cola and ya - cola[0] >= _VENTANA_SEGUNDOS:
            cola.popleft()
        if len(cola) >= COPIAS_POR_HORA:
            raise HTTPException(
                status_code=429,
                detail="Ya bajaste tres copias en la última hora. Probá de nuevo más tarde.",
            )
        cola.append(ya)


def _personas(cliente: Cliente) -> list[dict]:
    """Quién tiene o tuvo acceso. Correo, nombre y rol: nada del proveedor de
    identidad (ni el uid de Firebase) ni de las invitaciones, que llevan token."""
    from app.models.identidad import Membresia, Usuario

    reg = sesion_registro()
    try:
        filas = (
            reg.query(Membresia, Usuario)
            .join(Usuario, Usuario.id == Membresia.usuario_id)
            .filter(Membresia.cliente_slug == cliente.slug)
            .order_by(Membresia.id)
            .all()
        )
        return [
            {
                "email": u.email,
                "nombre": u.nombre,
                "rol": m.rol,
                "activo": bool(m.activo),
                "desde": m.creado_en.isoformat() if m.creado_en else None,
            }
            for m, u in filas
        ]
    finally:
        reg.close()


def _peso(n: int) -> str:
    if n < 1024 * 1024:
        return f"{max(1, round(n / 1024))} KB"
    return f"{n / (1024 * 1024):.1f} MB".replace(".", ",")


def _en_trozos(archivo):
    try:
        while trozo := archivo.read(_TROZO):
            yield trozo
    finally:
        archivo.close()


@router.get("/mi-copia")
def mi_copia(request: Request, dueno: tuple = Depends(require_owner)):
    """El ZIP con todo lo del supermercado del dueño que la pide."""
    cliente, usuario_id, _email = dueno
    _frenar(usuario_id)

    destino = tempfile.SpooledTemporaryFile(max_size=_EN_MEMORIA_HASTA)
    try:
        manifiesto = armar_copia(cliente, motor_de(cliente), destino, _personas(cliente))
        tamano = destino.tell()

        filas = sum(t["filas"] for t in manifiesto["tablas"].values())
        archivos = sum(t.get("archivos", 0) for t in manifiesto["tablas"].values())
        db = sesion_de(cliente)
        try:
            anotar(
                db, request, "admin", "copia.descarga",
                detalle=f"{filas} filas · {archivos} archivos · {_peso(tamano)}",
            )
            db.commit()
        finally:
            db.close()
    except BaseException:
        destino.close()
        raise

    destino.seek(0)
    nombre = f"recabra-copia-{cliente.slug}-{ahora():%Y-%m-%d-%H%M}.zip"
    return StreamingResponse(
        _en_trozos(destino),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "Content-Length": str(tamano),
            # Todo el supermercado en un archivo: que no quede en ninguna caché.
            "Cache-Control": "no-store",
        },
    )
