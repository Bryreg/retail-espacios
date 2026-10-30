"""Toda escritura de administración deja rastro en la bitácora (auditoría P2-14).

Varias rutas que modifican —usuarios, tarifas, proveedores, planometría,
avisos, el guardado del plano— no llamaban a `anotar`. Esta prueba recorre las
rutas de la app (las de verdad, `app.routes` aplanado como en
`conftest.rutas_planas`) y, para cada una que MODIFICA (POST, PUT, PATCH,
DELETE) y pide `require_admin`, exige que su función llame a `anotar` —o a una
función del proyecto que lo llame, un nivel más abajo: `_bitacora` de
participaciones, `confirmar_lote` de la planilla—.

Las que no anotan están en ``SIN_BITACORA``, cada una con su porqué. Una ruta
nueva que escribe sin anotar hace fallar esto: o anota, o entra a la lista con
una razón que se pueda leer en una revisión.
"""
import ast
import inspect
import textwrap

#: Rutas de administración que modifican y NO anotan, a propósito.
SIN_BITACORA = {
    # Revisan y no escriben nada: el paso previo a «aplicar» / «confirmar».
    ("POST", "/api/leases/bulk/validar"): "revisa la planilla y no escribe",
    ("POST", "/api/layout/renumeracion/previo"): "muestra la renumeración y no escribe",
    # Manda un correo de prueba y no cambia ningún dato.
    ("POST", "/api/notifications/test"): "manda un correo de prueba; no cambia datos",
    # Crea la fila LIBRE de un espacio (sin contrato) para colgarle algo: lo
    # que importa —el contrato, el estado, la nota— se anota en su ruta.
    ("POST", "/api/spaces/find-or-create"): "crea la fila libre del espacio; el contrato se anota al venderlo",
    # El autoguardado del borrador de distribución (cada pocos segundos):
    # anotarlo enterraría lo que importa. Lo que importa —confirmar o
    # descartar— sí se anota (`distribucion.confirmada` / `.descartada`).
    ("PUT", "/api/participaciones/distribucion/borrador"): "autoguardado del borrador; se anota al confirmar",
}

METODOS_QUE_ESCRIBEN = {"POST", "PUT", "PATCH", "DELETE"}


def _planas(rutas, prefijo=""):
    from fastapi.routing import APIRoute

    for r in rutas:
        original = getattr(r, "original_router", None)
        if original is not None:
            extra = getattr(getattr(r, "include_context", None), "prefix", "") or ""
            yield from _planas(original.routes, prefijo + extra)
        elif isinstance(r, APIRoute):
            yield prefijo + r.path, r


def _dependencias(dependant):
    for d in dependant.dependencies:
        yield d.call
        yield from _dependencias(d)


def _llamadas(funcion) -> set[str]:
    """Los nombres a los que llama ``funcion`` (``f(...)`` y ``x.f(...)``)."""
    try:
        arbol = ast.parse(textwrap.dedent(inspect.getsource(funcion)))
    except (OSError, TypeError, SyntaxError):
        return set()
    nombres = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Call):
            f = nodo.func
            if isinstance(f, ast.Name):
                nombres.add(f.id)
            elif isinstance(f, ast.Attribute):
                nombres.add(f.attr)
    return nombres


def _anota(funcion, profundidad: int = 2) -> bool:
    nombres = _llamadas(funcion)
    if "anotar" in nombres:
        return True
    if profundidad <= 0:
        return False
    globales = getattr(funcion, "__globals__", {})
    for nombre in nombres:
        otra = globales.get(nombre)
        if inspect.isfunction(otra) and (otra.__module__ or "").startswith("app.") and otra is not funcion:
            if _anota(otra, profundidad - 1):
                return True
    return False


def test_toda_ruta_de_administracion_que_escribe_anota(client):
    from app.auth import require_admin
    from app.main import app

    faltan, vistas = [], set()
    for path, ruta in _planas(app.routes):
        metodos = set(ruta.methods or ()) & METODOS_QUE_ESCRIBEN
        if not metodos or require_admin not in set(_dependencias(ruta.dependant)):
            continue
        for metodo in sorted(metodos):
            vistas.add((metodo, path))
            if (metodo, path) in SIN_BITACORA:
                continue
            if not _anota(ruta.endpoint):
                faltan.append(f"{metodo} {path} ({ruta.endpoint.__module__}.{ruta.endpoint.__name__})")
    assert len(vistas) > 40, f"sólo se encontraron {len(vistas)} rutas: ¿cambió cómo se registran?"
    assert not faltan, "escriben sin dejar rastro en la bitácora:\n  " + "\n  ".join(faltan)
    # La lista no guarda rutas que ya no existen: se iría llenando de excusas.
    sobran = sorted(set(SIN_BITACORA) - vistas)
    assert not sobran, f"SIN_BITACORA nombra rutas que ya no existen o ya no son de administración: {sobran}"


def test_tarifas_proveedores_y_avisos_dejan_su_linea(client, admin):
    """Por el camino real: cada una de las escrituras que faltaban deja SU
    línea, con título (no la clave cruda)."""
    def acciones():
        return [l["accion"] for l in client.get("/api/bitacora/", headers=admin, params={"limite": 500}).json()]

    assert client.put("/api/layout/rates", headers=admin, json={"default": {"punta": 600_000}, "by_sede": {}}).status_code == 200
    sid = client.post("/api/suppliers/", headers=admin, json={"name": "Proveedor Bitácora"}).json()["id"]
    assert client.delete(f"/api/suppliers/{sid}", headers=admin).status_code == 204
    assert client.put("/api/notifications/config", headers=admin, json={"reminder_days": "30,15"}).status_code == 200
    assert client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [], "base_updated_at": None}).status_code == 200
    hechas = acciones()
    for accion in ("ajustes.tarifas", "proveedor.alta", "proveedor.baja", "ajustes.avisos", "plano.guardado"):
        assert accion in hechas, f"falta {accion} en la bitácora: {hechas}"
    titulos = client.get("/api/bitacora/acciones", headers=admin).json()
    assert titulos["ajustes.tarifas"] == "Tarifas de referencia cambiadas"
