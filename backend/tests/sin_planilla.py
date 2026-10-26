"""La revisión y el alta comunes de ``routers/bulk_leases.py``, SIN las reglas
de la planilla.

Desde el 2026-10-26 la planilla es sólo para muebles que se venden ENTEROS y
con el valor POR MES (decisión del dueño): las partes y los porcentajes se
venden en Vender. Las pruebas de la venta por partes —la compuerta, los choques
entre la nevera y su puerta, la tarifa de un tramo, el enlace de montaje de una
bahía— usaban la planilla como la manera de vender una parte. Lo que prueban
es la revisión común (``_revisar``, la misma que usa Vender) y no la planilla,
así que siguen ahí, en el mismo proceso y con la misma base, con el valor como
el total de siempre.

``post`` imita la respuesta de ``client.post`` para que las pruebas no cambien
más que la línea que llama: ``sin_planilla.post("/api/leases/bulk/confirmar",
json={...})``. Los correos se mandan en el acto (las tareas de fondo corren
antes de devolver), como hace el cliente de pruebas.
"""
import json as _json


class Respuesta:
    def __init__(self, cuerpo: dict, status_code: int = 200):
        self._cuerpo = cuerpo
        self.status_code = status_code
        self.text = _json.dumps(cuerpo, default=str)

    def json(self):
        return _json.loads(self.text)


def post(ruta: str, json: dict) -> Respuesta:
    from fastapi import BackgroundTasks

    from app.clientes import unico
    from app.database import SessionLocal
    from app.routers.bulk_leases import LoteIn, confirmar_lote, validar_lote

    lote = LoteIn(**json)
    db = SessionLocal()
    try:
        if ruta.endswith("/validar"):
            return Respuesta(validar_lote(db, lote, planilla=False).model_dump())
        assert ruta.endswith("/confirmar"), ruta
        tareas = BackgroundTasks()
        hecho = confirmar_lote(db, lote, tareas, unico(), planilla=False).model_dump()
    finally:
        db.close()
    for t in tareas.tasks:
        t.func(*t.args, **t.kwargs)
    return Respuesta(hecho)
