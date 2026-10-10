"""Carga masiva: qué acepta, qué rechaza y por qué.

Una planilla de cuarenta filas se escribe a mano en una reunión, así que trae
errores humanos: códigos que no existen, un espacio vendido dos veces en el mismo
archivo, fechas al revés. El valor de esta función no es crear contratos rápido
—eso es fácil— sino **decir qué está mal antes de crear nada**.
"""

from datetime import timedelta

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

HOY = hoy_en_colombia()

FIXTURES = [
    {
        "id": "f1", "code": "PUN-04", "sede": "NAVE", "type": "punta",
        "label": "Punta Góndola", "cx": 3, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    },
    {
        "id": "f2", "code": "PUN-05", "sede": "NAVE", "type": "punta",
        "label": "Punta Góndola", "cx": 6, "cz": 8, "rotY": 0,
        "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    },
    {
        "id": "f3", "code": "CAJ-01", "sede": "NAVE", "type": "checkout",
        "label": "Caja", "cx": 1, "cz": 1, "rotY": 0, "rentable": False,
        "w": 1.8, "d": 0.7, "h": 0.9, "color": "#94a3b8", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    },
]


def _plano(client, admin):
    r = client.put("/api/layout/NAVE",
                   json={"fixtures": FIXTURES, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text


def _fila(n=2, **kw):
    base = {
        "fila": n, "espacio": "PUN-04", "proveedor": "Nutresa",
        "valor": 1_800_000,
        "desde": (HOY + timedelta(days=10)).isoformat(),
        "hasta": (HOY + timedelta(days=20)).isoformat(),
    }
    base.update(kw)
    return base


def _validar(client, admin, filas, sede="NAVE"):
    return client.post("/api/leases/bulk/validar",
                       json={"sede": sede, "filas": filas}, headers=admin)


def _confirmar(client, admin, filas, sede="NAVE"):
    return client.post("/api/leases/bulk/confirmar",
                       json={"sede": sede, "filas": filas}, headers=admin)


def _codigos_nave(client, admin):
    """Sólo los de NAVE: la base de pruebas arranca con espacios de demo
    sembrados, y afirmar sobre el conjunto completo probaría la semilla."""
    return {s["code"] for s in client.get("/api/spaces/", headers=admin).json()
            if s["code"].startswith("NAVE-")}


def _proveedores(client, admin):
    return {s["name"] for s in client.get("/api/suppliers/", headers=admin).json()}


# ─── Lo que pasa ──────────────────────────────────────────────────────────────

def test_una_fila_limpia_pasa_y_se_resuelve_el_codigo(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [_fila()])
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["ok"], body["avisos"], body["errores"]) == (1, 0, 0)
    fila = body["filas"][0]
    # "Proveedor nuevo" se dice pero NO tiñe la fila — ver el test de abajo.
    assert fila["estado"] == "ok"
    assert fila["proveedor_nuevo"] is True
    assert "Proveedor nuevo" in fila["mensajes"][0]
    # La planilla trae el código corto; la base guarda el completo.
    assert fila["codigo"] == "NAVE-PUN-04"
    assert fila["nombre"] == "Punta Góndola"
    assert fila["dias"] == 11  # los dos extremos cuentan


def test_el_codigo_completo_no_se_duplica(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [_fila(espacio="NAVE-PUN-04")])
    assert r.json()["filas"][0]["codigo"] == "NAVE-PUN-04"


def test_validar_no_escribe_nada(client, admin):
    """El paso entero existe para poder revisar sin consecuencias."""
    _plano(client, admin)
    _validar(client, admin, [_fila()])
    assert _codigos_nave(client, admin) == set()
    assert "Nutresa" not in _proveedores(client, admin)


def test_confirmar_crea_espacio_proveedor_y_contrato(client, admin):
    _plano(client, admin)
    filas = [_fila(), _fila(3, espacio="PUN-05", proveedor="Alpina", valor=1_200_000)]
    r = _confirmar(client, admin, filas)
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 2

    assert _codigos_nave(client, admin) == {"NAVE-PUN-04", "NAVE-PUN-05"}
    espacios = {s["code"]: s for s in client.get("/api/spaces/", headers=admin).json()}
    assert espacios["NAVE-PUN-04"]["sede"] == "NAVE"
    # El área sale de las medidas del mueble en el plano.
    assert espacios["NAVE-PUN-04"]["area_m2"] == 0.36
    assert {"Nutresa", "Alpina"} <= _proveedores(client, admin)


def test_el_correo_del_proveedor_se_guarda(client, admin):
    _plano(client, admin)
    _confirmar(client, admin, [_fila(correo="ventas@nutresa.com.co")])
    prov = next(s for s in client.get("/api/suppliers/", headers=admin).json()
                if s["name"] == "Nutresa")
    assert prov["email"] == "ventas@nutresa.com.co"


def test_confirmar_devuelve_el_id_del_contrato_de_cada_fila(client, admin):
    """La planometría cuelga del contrato, así que la pantalla necesita su id.

    El contrato multiespacio de Vender entra por acá: crea las N filas y
    después le sube la lámina a cada una. Sin el id en la respuesta habría que
    salir a buscar el contrato por código, que es una consulta de más y una
    carrera con quien esté vendiendo el mismo espacio.
    """
    _plano(client, admin)
    filas = [_fila(), _fila(3, espacio="PUN-05", valor=1_200_000)]
    cuerpo = _confirmar(client, admin, filas).json()
    ids = [f["lease_id"] for f in cuerpo["filas"]]
    assert all(isinstance(i, int) for i in ids), cuerpo["filas"]
    assert len(set(ids)) == 2          # dos contratos distintos, no el mismo dos veces


def test_una_fila_con_error_no_trae_id(client, admin):
    _plano(client, admin)
    filas = [_fila(), _fila(3, espacio="NO-EXISTE")]
    cuerpo = _confirmar(client, admin, filas).json()
    por_fila = {f["fila"]: f for f in cuerpo["filas"]}
    assert isinstance(por_fila[2]["lease_id"], int)
    assert por_fila[3]["lease_id"] is None


def test_confirmar_dice_a_quien_se_le_avisó(client, admin):
    """No es adorno: la pantalla lo muestra al cerrar la negociación.

    Antes decía «ya salieron los avisos» como frase fija. Sin SMTP configurado
    —que es como corre esta prueba— no sale ni un correo, y afirmar lo
    contrario es el modo de falla que vuelve inútil la herramienta.
    """
    _plano(client, admin)
    cuerpo = _confirmar(client, admin, [_fila()]).json()
    avisos = cuerpo["avisos"]
    assert avisos is not None
    assert avisos["smtp_listo"] is False
    assert avisos["comercial"] == [] and avisos["montaje"] == [] and avisos["proveedor"] == []


def test_sin_nada_creado_no_hay_avisos(client, admin):
    _plano(client, admin)
    cuerpo = _confirmar(client, admin, [_fila(espacio="NO-EXISTE")]).json()
    assert cuerpo["creados"] == 0
    assert cuerpo["avisos"] is None


# ─── Lo que se rechaza ────────────────────────────────────────────────────────

def test_un_codigo_que_no_esta_en_el_plano_es_error(client, admin):
    """Acá se es MÁS estricto que en el alta de a uno.

    De a uno un código huérfano se acepta —hay filas sembradas y muebles
    borrados después del contrato—, pero en una planilla es un tipeo, y crearlo
    callado deja un contrato colgado de un espacio que nadie va a montar.
    """
    _plano(client, admin)
    r = _validar(client, admin, [_fila(espacio="PUN-99")])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "error"
    assert "NAVE-PUN-99" in fila["mensajes"][0]


def test_un_mueble_no_comercializable_es_error(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [_fila(espacio="CAJ-01")])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "error"
    assert "no comercializable" in fila["mensajes"][0]


def test_falta_proveedor_valor_o_fechas(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [
        _fila(2, proveedor=""),
        _fila(3, valor=0),
        _fila(4, desde=None),
        _fila(5, desde=(HOY + timedelta(days=20)).isoformat(),
              hasta=(HOY + timedelta(days=10)).isoformat()),
    ])
    filas = r.json()["filas"]
    assert [f["estado"] for f in filas] == ["error"] * 4
    assert "proveedor" in filas[0]["mensajes"][0].lower()
    assert "valor" in filas[1]["mensajes"][0].lower()
    assert "fechas" in filas[2]["mensajes"][0].lower()
    assert "anterior" in filas[3]["mensajes"][0]


def test_dos_filas_del_mismo_archivo_no_pueden_pisarse(client, admin):
    """El error más fácil de cometer en una planilla y el más difícil de ver
    leyéndola: el mismo espacio vendido dos veces en fechas que se solapan."""
    _plano(client, admin)
    r = _validar(client, admin, [
        _fila(2),
        _fila(7, proveedor="Alpina",
              desde=(HOY + timedelta(days=15)).isoformat(),
              hasta=(HOY + timedelta(days=25)).isoformat()),
    ])
    filas = r.json()["filas"]
    assert filas[0]["estado"] == "ok"
    assert filas[1]["estado"] == "error"
    assert "fila 2" in filas[1]["mensajes"][0]


def test_dos_filas_del_mismo_espacio_en_fechas_distintas_pasan(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [
        _fila(2),
        _fila(3, proveedor="Alpina",
              desde=(HOY + timedelta(days=21)).isoformat(),
              hasta=(HOY + timedelta(days=30)).isoformat()),
    ])
    assert [f["estado"] for f in r.json()["filas"]] == ["ok", "ok"]


def test_choque_contra_un_contrato_que_ya_existe(client, admin):
    _plano(client, admin)
    _confirmar(client, admin, [_fila()])
    r = _validar(client, admin, [_fila(9, proveedor="Alpina")])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "error"
    assert "ya tiene un contrato" in fila["mensajes"][0]


def test_confirmar_omite_las_filas_con_error_y_crea_el_resto(client, admin):
    """Una fila mala no puede tirar abajo las treinta y nueve buenas."""
    _plano(client, admin)
    r = _confirmar(client, admin, [
        _fila(2),
        _fila(3, espacio="PUN-99"),          # no existe
        _fila(4, espacio="PUN-05", proveedor="Alpina"),
    ])
    body = r.json()
    assert body["creados"] == 2
    assert body["omitidos"] == 1
    assert _codigos_nave(client, admin) == {"NAVE-PUN-04", "NAVE-PUN-05"}


def test_confirmar_vuelve_a_validar(client, admin):
    """Entre la revisión y el botón alguien pudo vender ese espacio desde el
    mapa. Crear igual dejaría dos proveedores en la misma punta."""
    _plano(client, admin)
    filas = [_fila()]
    assert _validar(client, admin, filas).json()["errores"] == 0
    # Alguien lo vende por el camino de a uno, con las mismas fechas.
    espacio = client.post("/api/spaces/find-or-create",
                          json={"code": "NAVE-PUN-04", "name": "Punta", "zone": "punta",
                                "sede": "NAVE", "area_m2": 0.36}, headers=admin).json()
    prov = client.post("/api/suppliers/find-or-create", json={"name": "Otro"}, headers=admin).json()
    client.post(f"/api/spaces/{espacio['id']}/leases",
                json={"supplier_id": prov["id"], "start_date": filas[0]["desde"],
                      "end_date": filas[0]["hasta"], "monthly_rent": 1},
                headers=admin)

    r = _confirmar(client, admin, filas)
    assert r.json()["creados"] == 0
    assert r.json()["filas"][0]["estado"] == "error"


# ─── Avisos: no bloquean, pero se dicen ───────────────────────────────────────

def test_avisa_cuando_el_valor_va_muy_por_debajo_de_la_referencia(client, admin):
    _plano(client, admin)
    client.put("/api/layout/rates",
               json={"default": {"punta": 2_000_000}, "by_sede": {}}, headers=admin)
    r = _validar(client, admin, [_fila(valor=1_000_000)])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "aviso"
    assert any("por debajo" in m for m in fila["mensajes"])
    assert fila["referencia"] == 2_000_000


def test_un_correo_torcido_avisa_y_no_se_guarda(client, admin):
    _plano(client, admin)
    r = _validar(client, admin, [_fila(correo="no-es-un-correo")])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "aviso"
    assert any("no parece válido" in m for m in fila["mensajes"])
    assert fila["correo"] is None


def test_un_proveedor_nuevo_se_dice_pero_no_tine_la_fila(client, admin):
    """En una planilla de temporada casi todos los proveedores son nuevos.

    Si eso pintara la fila de amarillo, cuarenta filas saldrían en amarillo y la
    gente aprendería a ignorar el amarillo — que es justo el color reservado
    para lo que sí hay que mirar, como un valor muy por debajo de la tarifa.
    """
    _plano(client, admin)
    r = _validar(client, admin, [_fila()])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "ok"
    assert fila["proveedor_nuevo"] is True
    assert any("Proveedor nuevo" in m for m in fila["mensajes"])


def test_un_proveedor_que_ya_existe_no_avisa_de_nuevo(client, admin):
    _plano(client, admin)
    client.post("/api/suppliers/find-or-create", json={"name": "Nutresa"}, headers=admin)
    r = _validar(client, admin, [_fila()])
    fila = r.json()["filas"][0]
    assert fila["estado"] == "ok"
    assert fila["proveedor_nuevo"] is False


def test_confirmar_reusa_el_proveedor_que_la_revision_reconocio(client, admin, monkeypatch):
    """La revisión compara sin mayúsculas y no avisó «Proveedor nuevo» para
    «Bic» porque ya existe «BIC»: confirmar no puede crear otro en silencio.
    Dos proveedores para el mismo parten el historial, y la limpieza de fotos
    tomaría la renovación por otro proveedor. La constancia va al correo del
    que ya existía."""
    import app.routers.bulk_leases as bulk

    _plano(client, admin)
    bic = client.post("/api/suppliers/find-or-create",
                      json={"name": "BIC", "email": "trade@bic.co"}, headers=admin).json()
    fila = _fila(proveedor="  Bic ")
    assert _validar(client, admin, [fila]).json()["filas"][0]["proveedor_nuevo"] is False

    enviados: list = []
    monkeypatch.setattr(bulk, "correo_configurado", lambda: True)
    monkeypatch.setattr(bulk, "send_mail_to_bg", lambda to, *a, **kw: enviados.append(list(to)))
    cuerpo = _confirmar(client, admin, [fila]).json()
    assert cuerpo["creados"] == 1

    nombres = [s["name"] for s in client.get("/api/suppliers/", headers=admin).json()]
    assert "Bic" not in nombres and nombres.count("BIC") == 1
    from app.database import SessionLocal
    from app.models.models import SpaceLease

    db = SessionLocal()
    try:
        lease = db.get(SpaceLease, cuerpo["filas"][0]["lease_id"])
        assert lease.supplier_id == bic["id"]
    finally:
        db.close()
    assert cuerpo["avisos"]["proveedor"] == ["trade@bic.co"]
    assert ["trade@bic.co"] in enviados


# ─── Permisos y límites ───────────────────────────────────────────────────────

def test_el_mercaderista_no_carga_planillas(client, admin, worker):
    _plano(client, admin)
    assert _validar(client, worker, [_fila()]).status_code == 403
    assert _confirmar(client, worker, [_fila()]).status_code == 403


def test_sin_sesion_tampoco(client, admin):
    _plano(client, admin)
    assert client.post("/api/leases/bulk/validar",
                       json={"sede": "NAVE", "filas": [_fila()]}).status_code == 401


def test_una_planilla_enorme_se_rechaza_entera(client, admin):
    """No es un límite técnico: una planilla que no se puede revisar en pantalla
    no se puede aprobar con criterio, y aprobar a ciegas es lo que los dos pasos
    existen para evitar."""
    _plano(client, admin)
    r = _validar(client, admin, [_fila(n) for n in range(2, 400)])
    assert r.status_code == 400
    assert "tope" in r.json()["detail"]
