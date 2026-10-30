"""Etapa 0 del rediseño UX (2026-10-26): lo que encontró la verificación de la
versión final del dibujo (`docs/maquetas/ux-2026-10/final/README.md`).

· El canon del mes del tablero sumaba el TOTAL de cada contrato como si fuera
  el mes (era `GET /dashboard/kpis`, que se fue el 2026-10-30: hoy lo dice
  `GET /dashboard/serie`).
· `GET /participaciones/cara` llama `valor_mensual` al total: ahora trae al
  lado `valor_total` y `valor_al_mes` (y no cambia lo de antes).
· Las acciones de planogramas se anotaban sin título y la bitácora mostraba la
  clave cruda.
· No había cómo leer los contratos terminados de un espacio: `GET
  /spaces/by-code/{code}/historial`.
· La verificación del montaje de un contrato no se guardaba: tabla nueva
  `verificaciones_de_montaje` y `POST /mounts/{id}/verificar`.

«Hoy» es el 17 de octubre de 2026 en Colombia (marca ``reloj``).
"""
import io
import re
from pathlib import Path

from tests import test_participaciones as tp
from tests.test_vender_contrato import _entera, _pct, _pedido, _vender

RELOJ = tp.RELOJ
D = tp.D


@RELOJ
def test_el_canon_del_mes_reparte_el_total_en_sus_meses(client, admin, worker):
    tp._plano(client, admin)
    # Octubre–diciembre: tres meses por $ 3.000.000 → $ 1.000.000 al mes.
    _vender(client, admin, _pedido(_entera("GON-02", 3_000_000), proveedor="Tres Meses SA",
                                   desde=D(2026, 10, 1), hasta=D(2026, 12, 31)))
    s = client.get("/api/dashboard/serie", headers=admin).json()
    assert dict(zip(s["meses"], s["sedes"]["NAVE"]["canon"]))["2026-10"] == 1_000_000
    # Al trabajador, sin plata, como siempre.
    assert client.get("/api/dashboard/serie", headers=worker).status_code == 403


@RELOJ
def test_la_cara_trae_el_total_y_el_al_mes_con_su_nombre(client, admin):
    tp._plano(client, admin)
    # 25 % de GON-01 de noviembre a enero (3 meses) por $ 1.200.000 en total.
    tp._alta(client, admin, valor=1_200_000)
    (t,) = [t for p in tp._cara(client, admin)["participaciones"] for t in p["terminos"]]
    assert t["valor_mensual"] == 1_200_000          # lo de antes, igual (es el total)
    assert t["valor_total"] == 1_200_000
    assert t["valor_al_mes"] == 400_000


def test_toda_accion_que_se_anota_tiene_titulo():
    """Ninguna línea de la bitácora sale con la clave cruda."""
    from app.services.bitacora import ACCIONES

    raiz = Path(__file__).resolve().parents[1] / "app"
    usadas = set()
    for archivo in raiz.rglob("*.py"):
        usadas |= set(re.findall(r'anotar\([^"]*"([a-z_]+\.[a-z_.]+)"', archivo.read_text()))
    assert usadas, "no encontró ninguna acción: cambió la forma de anotar"
    sin_titulo = sorted(usadas - set(ACCIONES))
    assert sin_titulo == [], sin_titulo
    assert ACCIONES["planograma.revision"] == "Montaje de planograma revisado"


@RELOJ
def test_el_historial_trae_lo_terminado_y_las_partes(client, admin, worker):
    tp._plano(client, admin)
    viejo = _vender(client, admin, _pedido(_entera("GON-02", 900_000), proveedor="Antes SA",
                                           desde=D(2026, 7, 1), hasta=D(2026, 9, 30)))
    nuevo = _vender(client, admin, _pedido(_entera("GON-02", 600_000), proveedor="Ahora SA",
                                           desde=D(2026, 10, 1), hasta=D(2026, 11, 30)))
    r = client.get("/api/spaces/by-code/NAVE-GON-02/historial", headers=admin)
    assert r.status_code == 200, r.text
    filas = r.json()
    assert [(f["proveedor"], f["estado"]) for f in filas] == [("Ahora SA", "vigente"), ("Antes SA", "terminado")]
    assert filas[0]["lease_id"] == nuevo["contratos"][0]["lease_id"]
    assert filas[1]["lease_id"] == viejo["contratos"][0]["lease_id"]
    assert (filas[0]["valor_total"], filas[0]["valor_al_mes"]) == (600_000, 300_000)
    # El trabajador ve las fechas y el proveedor, nunca la plata.
    w = client.get("/api/spaces/by-code/NAVE-GON-02/historial", headers=worker).json()
    assert [f["proveedor"] for f in w] == ["Ahora SA", "Antes SA"]
    assert all("valor_total" not in f and "valor_al_mes" not in f for f in w)
    # Un código sin contratos no es un error: lista vacía.
    assert client.get("/api/spaces/by-code/NAVE-PUN-99/historial", headers=admin).json() == []


def _reportar(client, headers, code="NAVE-GON-02", estado="montado"):
    datos = {"space_code": code, "estado": estado, "sede": "NAVE"}
    archivos = {"foto": ("montaje.jpg", io.BytesIO(b"\xff\xd8\xff\xe0jpeg"), "image/jpeg")} if estado == "montado" else None
    if estado != "montado":
        datos["motivo"] = "sin_material"
    r = client.post("/api/mounts/", headers=headers, data=datos, files=archivos)
    assert r.status_code == 201, r.text
    return r.json()


@RELOJ
def test_verificar_el_montaje_de_un_contrato(client, admin, worker):
    tp._plano(client, admin)
    m = _reportar(client, worker)
    assert m["verificacion"] is None

    # «No coincide» sin decir qué corregir no sirve.
    assert client.post(f"/api/mounts/{m['id']}/verificar", headers=admin,
                       json={"resultado": "no_coincide"}).status_code == 422
    # El trabajador no verifica.
    assert client.post(f"/api/mounts/{m['id']}/verificar", headers=worker,
                       json={"resultado": "coincide"}).status_code == 403
    r = client.post(f"/api/mounts/{m['id']}/verificar", headers=admin,
                    json={"resultado": "no_coincide", "nota": "Falta el cabezote"})
    assert r.status_code == 200, r.text
    assert r.json()["verificacion"]["resultado"] == "no_coincide"
    # Una segunda verificación no pisa la primera: vale la última.
    client.post(f"/api/mounts/{m['id']}/verificar", headers=admin, json={"resultado": "coincide"})
    (fila,) = [x for x in client.get("/api/mounts/", headers=worker).json() if x["id"] == m["id"]]
    assert fila["verificacion"]["resultado"] == "coincide"

    # Un «no se pudo» se resuelve, no se verifica.
    n = _reportar(client, worker, code="NAVE-GON-03", estado="no_montado")
    assert client.post(f"/api/mounts/{n['id']}/verificar", headers=admin,
                       json={"resultado": "coincide"}).status_code == 409
    assert client.post("/api/mounts/99999/verificar", headers=admin, json={"resultado": "coincide"}).status_code == 404

    # Queda en la bitácora, con título.
    lineas = client.get("/api/bitacora/", headers=admin, params={"accion": "montaje.verificado"}).json()
    assert len(lineas) == 2 and lineas[0]["titulo"] == "Montaje de contrato verificado"


def test_la_tabla_nueva_viaja_con_el_supermercado():
    from app.services.traspaso import TABLAS_DEL_CLIENTE, tablas_sin_clasificar

    assert "verificaciones_de_montaje" in TABLAS_DEL_CLIENTE
    assert tablas_sin_clasificar() == set()


def test_la_plata_de_la_cara_entra_en_el_barrido():
    from app.services.ciclo_participaciones import _CLAVES_CON_PLATA

    assert {"valor_total", "valor_al_mes"} <= _CLAVES_CON_PLATA
