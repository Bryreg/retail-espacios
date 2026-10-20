"""El panel del Plano (rediseño, PR 3): lo que el servidor tiene que sostener.

· **«Reservado» a mano no se escribe más** (decisión 1 del dueño): `PATCH
  /spaces/{id}/status` lo rechaza con 409 y la frase que lleva a Vender. Los
  espacios que ya estaban así se siguen leyendo igual —`GET /spaces/comercial`
  los da «reserved», al trabajador también, sin nota— para que Supervisar →
  Corregir los liste («Marcado reservado a mano») y se puedan liberar.
· **La «Nota del contrato»** del panel se guarda donde la lee el mapa
  comercial (`PUT /spaces/{id}/nota`): en el contrato que manda, si no en la
  reserva viva, si no en el espacio. Antes se escribía en el JSON del layout,
  que `PUT /layout` descarta: se veía cambiar y no quedaba en ningún lado.
· **Sólo la ven los administradores**: tampoco por `GET /spaces/by-code`.
"""
from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()
FRASE = "Las reservas se hacen desde Vender, con proveedor y fecha."


def _mueble(code, sede="NAVE"):
    return {
        "id": f"f-{code}", "code": code, "sede": sede, "type": "punta",
        "label": code, "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1",
    }


def _plano(client, admin, codes, sede="NAVE"):
    r = client.put(f"/api/layout/{sede}", headers=admin,
                   json={"fixtures": [_mueble(c, sede) for c in codes], "base_updated_at": None})
    assert r.status_code == 200, r.text


def _espacio(client, admin, code, sede="NAVE"):
    r = client.post("/api/spaces/find-or-create", headers=admin, json={
        "code": f"{sede}-{code}", "sede": sede, "name": code,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _vender(client, admin, code, sede="NAVE"):
    r = client.post("/api/leases/bulk/confirmar", headers=admin, json={
        "sede": sede,
        "filas": [{"fila": 1, "espacio": code, "sede": sede, "proveedor": "MACA MANI",
                   "marca": "Maní", "valor": 200000,
                   "desde": HOY.isoformat(), "hasta": (HOY + timedelta(days=30)).isoformat()}],
    })
    assert r.status_code == 200, r.text


def _comercial(client, headers):
    r = client.get("/api/spaces/comercial", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _marcar_reservado_como_antes(space_id):
    """Lo que dejaba el selector de antes: `spaces.status = reserved`, sin nada."""
    from app.database import SessionLocal
    from app.models.models import Space, SpaceStatus
    db = SessionLocal()
    try:
        db.query(Space).filter(Space.id == space_id).one().status = SpaceStatus.reserved
        db.commit()
    finally:
        db.close()


# ─── «Reservado» a mano ──────────────────────────────────────────────────────

def test_RESERVADO_A_MANO_SE_RECHAZA_CON_LA_FRASE_QUE_LLEVA_A_VENDER(client, admin):
    _plano(client, admin, ["PUN-01"])
    sid = _espacio(client, admin, "PUN-01")
    r = client.patch(f"/api/spaces/{sid}/status", headers=admin, json={"status": "reserved", "notes": "lo quiere Alpina"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == FRASE
    # No escribió nada: ni el estado ni la nota.
    e = client.get(f"/api/spaces/{sid}", headers=admin).json()
    assert e["status"] == "free" and not e["notes"]
    assert _comercial(client, admin) == {}
    # Disponible y Mantenimiento, como siempre.
    for estado in ("maintenance", "free"):
        r = client.patch(f"/api/spaces/{sid}/status", headers=admin, json={"status": estado})
        assert r.status_code == 200, r.text


def test_un_reservado_de_antes_se_sigue_leyendo_y_se_libera(client, admin, worker):
    """Lo que Supervisar → Corregir lista: el trabajador lo ve como hoy (es su
    mapa), sin nota; quien administra lo libera con `PATCH … free`."""
    _plano(client, admin, ["PUN-01"])
    sid = _espacio(client, admin, "PUN-01")
    r = client.patch(f"/api/spaces/{sid}/status", headers=admin, json={"status": "maintenance", "notes": "apartado para Alpina"})
    assert r.status_code == 200, r.text
    _marcar_reservado_como_antes(sid)

    del_admin = _comercial(client, admin)["NAVE-PUN-01"]
    assert del_admin["status"] == "reserved"
    # No es una reserva de Vender: sin `reservado` ni `reservaHasta`.
    assert del_admin["reservado"] is False and del_admin["reservaHasta"] is None
    assert del_admin["observation"] == "apartado para Alpina"
    del_worker = _comercial(client, worker)["NAVE-PUN-01"]
    assert del_worker["status"] == "reserved" and del_worker["observation"] == ""

    # «Liberar».
    r = client.patch(f"/api/spaces/{sid}/status", headers=admin, json={"status": "free"})
    assert r.status_code == 200, r.text
    assert "NAVE-PUN-01" not in _comercial(client, admin)
    # Y no se vuelve a marcar a mano.
    r = client.patch(f"/api/spaces/{sid}/status", headers=admin, json={"status": "reserved"})
    assert r.status_code == 409 and r.json()["detail"] == FRASE


# ─── La nota del panel ───────────────────────────────────────────────────────

def test_la_nota_de_un_espacio_con_contrato_es_la_del_contrato(client, admin, worker):
    _plano(client, admin, ["PUN-01"])
    _vender(client, admin, "PUN-01")
    sid = _espacio(client, admin, "PUN-01")
    r = client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "  trae su exhibidor  "})
    assert r.status_code == 200, r.text
    assert r.json() == {"donde": "contrato", "nota": "trae su exhibidor"}
    # La lee el mapa comercial (la fusión la pone en `observation`)…
    assert _comercial(client, admin)["NAVE-PUN-01"]["observation"] == "trae su exhibidor"
    # …y es la del contrato, la misma de Vender.
    e = client.get(f"/api/spaces/{sid}", headers=admin).json()
    assert e["active_lease"]["notes"] == "trae su exhibidor"
    assert not e["notes"], "la nota del contrato quedó en el espacio"
    # El trabajador no la ve por ningún lado.
    assert _comercial(client, worker)["NAVE-PUN-01"]["observation"] == ""
    assert "exhibidor" not in client.get("/api/spaces/by-code/NAVE-PUN-01", headers=worker).text
    # Vaciarla la borra.
    assert client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": ""}).json()["nota"] == ""
    assert _comercial(client, admin)["NAVE-PUN-01"]["observation"] == ""


def test_by_code_si_existe_contesta_null_sin_crear_la_fila(client, admin, worker):
    """Abrir el panel de un espacio que nunca se vendió no es un error: con
    `si_existe=1`, `null` y 200 (sin el 404 en la consola). Sin el parámetro,
    404 como siempre. Leer no crea la fila, y con fila sale la misma tachadura
    por rol."""
    _plano(client, admin, ["PUN-05"])
    for quien in (admin, worker):
        r = client.get("/api/spaces/by-code/NAVE-PUN-05?si_existe=1", headers=quien)
        assert r.status_code == 200, r.text
        assert r.json() is None
        assert client.get("/api/spaces/by-code/NAVE-PUN-05", headers=quien).status_code == 404
    assert "NAVE-PUN-05" not in client.get("/api/spaces/", headers=admin).text, "leer creó la fila"
    # Sin sesión, nada.
    assert client.get("/api/spaces/by-code/NAVE-PUN-05?si_existe=1").status_code == 401
    # Con fila y nota: el trabajador, sin la nota.
    sid = _espacio(client, admin, "PUN-05")
    assert client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "falta el cartel"}).status_code == 200
    r = client.get("/api/spaces/by-code/NAVE-PUN-05?si_existe=1", headers=worker)
    assert r.status_code == 200 and r.json()["id"] == sid
    assert r.json()["notes"] is None and "cartel" not in r.text
    assert client.get("/api/spaces/by-code/NAVE-PUN-05?si_existe=1", headers=admin).json()["notes"] == "falta el cartel"


def test_sin_contrato_es_la_nota_del_espacio_y_el_trabajador_no_la_ve(client, admin, worker):
    _plano(client, admin, ["PUN-02"])
    sid = _espacio(client, admin, "PUN-02")
    r = client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "la vitrina tiene la luz rota"})
    assert r.status_code == 200, r.text
    assert r.json()["donde"] == "espacio"
    assert client.get("/api/spaces/by-code/NAVE-PUN-02", headers=admin).json()["notes"] == "la vitrina tiene la luz rota"
    # La puerta que se escapaba: `space.notes` por `GET /spaces/by-code` y `/{id}`.
    for url in ("/api/spaces/by-code/NAVE-PUN-02", f"/api/spaces/{sid}"):
        r = client.get(url, headers=worker)
        assert r.status_code == 200, r.text
        assert r.json()["notes"] is None and "luz rota" not in r.text, url
    assert "luz rota" not in client.get("/api/spaces/", headers=worker).text


def test_con_una_reserva_viva_es_la_nota_de_la_reserva(client, admin, worker):
    from app.database import SessionLocal
    from app.models.models import Supplier
    from app.models.vender import ReservaDeEspacio
    _plano(client, admin, ["PUN-03"])
    sid = _espacio(client, admin, "PUN-03")
    db = SessionLocal()
    try:
        prov = Supplier(name="Alpina")
        db.add(prov)
        db.flush()
        db.add(ReservaDeEspacio(space_id=sid, supplier_id=prov.id, desde=HOY, hasta=HOY + timedelta(days=20),
                                caduca=HOY + timedelta(days=5), estado="viva"))
        db.commit()
    finally:
        db.close()
    r = client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "confirma el lunes"})
    assert r.status_code == 200, r.text
    assert r.json()["donde"] == "reserva"
    assert _comercial(client, admin)["NAVE-PUN-03"]["observation"] == "confirma el lunes"
    # El trabajador ve la cara tomada y nada de la nota: ni en el mapa
    # comercial, ni por `by-code`, ni por `by-svg`.
    del_worker = _comercial(client, worker)["NAVE-PUN-03"]
    assert del_worker["status"] == "occupied" and del_worker["observation"] == ""
    assert del_worker["supplierName"] == "" and del_worker["negotiatedValue"] == 0
    por_codigo = client.get("/api/spaces/by-code/NAVE-PUN-03", headers=worker)
    assert por_codigo.status_code == 200, por_codigo.text
    assert por_codigo.json()["notes"] is None and "confirma el lunes" not in por_codigo.text
    svg_id = por_codigo.json()["svg_id"]
    por_svg = client.get(f"/api/spaces/by-svg/{svg_id}", headers=worker)
    assert por_svg.status_code == 200, por_svg.text
    assert por_svg.json()["notes"] is None and "confirma el lunes" not in por_svg.text


def test_la_nota_es_de_administracion_y_tiene_tope(client, admin, worker):
    _plano(client, admin, ["PUN-04"])
    sid = _espacio(client, admin, "PUN-04")
    assert client.put(f"/api/spaces/{sid}/nota", headers=worker, json={"nota": "x"}).status_code == 403
    assert client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "x" * 501}).status_code == 422
    assert client.put(f"/api/spaces/{sid}/nota", headers=admin, json={"nota": "x" * 500}).status_code == 200
    assert client.put("/api/spaces/999999/nota", headers=admin, json={"nota": "x"}).status_code == 404
    # La bitácora dice dónde, nunca el texto.
    r = client.get("/api/bitacora/?accion=espacio.nota", headers=admin)
    assert r.status_code == 200, r.text
    notas = r.json()
    assert notas and all("xxxx" not in (f["detalle"] or "") for f in notas), notas
    assert notas[0]["titulo"] == "Nota del espacio cambiada"
