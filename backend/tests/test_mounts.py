"""Confirmación de montaje: quién puede reportar, qué exige y qué pasa al borrar la sede.

El caso que motiva el archivo es el último: montaje y borrado de sede se
construyeron por separado, y juntos dejan un estado que se ve bien y miente —
una sede recreada con el mismo nombre reusa los mismos códigos, así que sus
espacios nuevos aparecían montados por reportes de la sede anterior.
"""

FIXTURE = {
    "id": "f1", "code": "GON-01", "sede": "NAVE", "type": "gondola",
    "label": "GON-01", "cx": 3, "cz": 8, "rotY": 0,
    "w": 0.9, "d": 4.0, "h": 1.8, "color": "#6366f1", "status": "free",
    "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
    "startDate": "", "endDate": "", "observation": "",
}


def _put(client, admin, sede, fixtures):
    return client.put(
        f"/api/layout/{sede}",
        json={"fixtures": fixtures, "base_updated_at": None},
        headers=admin,
    )


def _confirm(client, headers, code, sede="NAVE", estado="montado", **extra):
    data = {"space_code": code, "estado": estado, "sede": sede, **extra}
    return client.post("/api/mounts/", data=data, headers=headers)


def test_worker_can_report_a_mount(client, worker):
    """Es el único punto donde un worker escribe. Si esto se cierra, el
    mercaderista queda sin forma de confirmar desde el celular."""
    r = _confirm(client, worker, "NAVE-GON-01", reportado_por="Andrés")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "montado"
    assert body["rol"] == "worker"
    assert body["reportado_por"] == "Andrés"
    # La hora la pone el servidor, no el dispositivo.
    assert body["confirmado_en"]


def test_the_code_is_normalised(client, worker):
    assert _confirm(client, worker, " nave-gon-01 ").json()["space_code"] == "NAVE-GON-01"


def test_not_mounted_needs_a_reason(client, worker):
    """Un "no pude" sin motivo no le sirve a nadie: no se sabe a quién reclamarle."""
    assert _confirm(client, worker, "NAVE-GON-01", estado="no_montado").status_code == 422
    ok = _confirm(client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_material")
    assert ok.status_code == 201, ok.text


def test_an_invented_estado_is_rejected(client, worker):
    assert _confirm(client, worker, "NAVE-GON-01", estado="a_medias").status_code == 422


def test_anonymous_cannot_report(client):
    assert client.post(
        "/api/mounts/", data={"space_code": "NAVE-GON-01", "estado": "montado"}
    ).status_code == 401


def test_history_is_kept_newest_first(client, worker):
    """Se guarda una fila por reporte, no una por espacio: el histórico de quién
    dijo qué es justamente lo que sirve cuando el proveedor reclama."""
    _confirm(client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_material")
    _confirm(client, worker, "NAVE-GON-01")

    rows = client.get("/api/mounts/", headers=worker).json()
    assert len(rows) == 2
    assert rows[0]["estado"] == "montado", "el más reciente no quedó primero"


def test_deleting_a_sede_archives_its_mounts(client, admin, worker):
    """Sin esto, una sede recreada con el mismo nombre nacía montada."""
    _put(client, admin, "NAVE", [FIXTURE])
    _confirm(client, worker, "NAVE-GON-01")
    assert len(client.get("/api/mounts/", headers=admin).json()) == 1

    assert client.delete("/api/layout/NAVE", headers=admin).status_code == 204
    assert client.get("/api/mounts/", headers=admin).json() == []

    # Y la sede vuelve: los códigos son los mismos, el montaje no.
    _put(client, admin, "NAVE", [FIXTURE])
    assert client.get("/api/mounts/", headers=admin).json() == []


def test_archiving_reaches_reports_that_never_created_a_space(client, admin, worker):
    """Un "no pude montar" no crea fila en spaces — solo la foto la crea. Si el
    archivado se cuelga de los espacios, estos reportes sobreviven al borrado."""
    _put(client, admin, "NAVE", [FIXTURE])
    _confirm(client, worker, "NAVE-GON-01", estado="no_montado", motivo="sin_producto")

    client.delete("/api/layout/NAVE", headers=admin)
    assert client.get("/api/mounts/", headers=admin).json() == []


def test_deleting_a_sede_leaves_the_others_alone(client, admin, worker):
    _put(client, admin, "NAVE", [FIXTURE])
    _put(client, admin, "TERRON", [dict(FIXTURE, id="t1", sede="TERRON")])
    _confirm(client, worker, "NAVE-GON-01", sede="NAVE")
    _confirm(client, worker, "TERRON-GON-01", sede="TERRON")

    client.delete("/api/layout/NAVE", headers=admin)

    rows = client.get("/api/mounts/", headers=admin).json()
    assert [r["space_code"] for r in rows] == ["TERRON-GON-01"]


def test_a_mount_without_sede_is_matched_by_its_code(client, admin, worker):
    """El campo sede es opcional en el formulario; el prefijo del código es la
    segunda señal, igual que para los espacios."""
    _put(client, admin, "NAVE", [FIXTURE])
    r = client.post(
        "/api/mounts/",
        data={"space_code": "NAVE-GON-01", "estado": "montado"},
        headers=worker,
    )
    assert r.status_code == 201, r.text
    assert r.json()["sede"] is None

    client.delete("/api/layout/NAVE", headers=admin)
    assert client.get("/api/mounts/", headers=admin).json() == []
