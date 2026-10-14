"""La copia de seguridad del dueño: `GET /api/clientes/mi-copia`.

Dos preguntas importan: ¿la baja sólo el dueño?, y ¿alcanza para volver? La
segunda se contesta de ida y vuelta: se copia un supermercado con un poco de
todo, se restaura en una base nueva y se compara tabla por tabla.

Todo `import app.*` va ADENTRO de las funciones: el fixture `client` de
`conftest.py` purga `sys.modules['app.*']` entre pruebas.
"""
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace

NO_OWNER = "Solo el owner del cliente puede hacer esto."
SLUG = "superprueba"
CORREO_DUENA = "duena@super.co"

FOTO = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + bytes(range(256)) * 8 + b"\xff\xd9"
ARTE = b"\x89PNG\r\n\x1a\n" + bytes(range(255, -1, -1)) * 4
PDF = b"%PDF-1.4\n" + b"contrato firmado\n" * 40 + b"%%EOF"


class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _usar_verificador(client, uid, email):
    from app.services.firebase_tokens import get_verificador

    claims = SimpleNamespace(uid=uid, email=email, email_verificado=True,
                             proveedor="google.com", nombre=None)
    client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador({uid: claims})


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(client, slug=SLUG, email=CORREO_DUENA):
    """Funda un supermercado por el alta self-service: quien lo funda nace dueño."""
    _usar_verificador(client, f"uid-{slug}", email)
    r = client.post("/api/clientes/alta",
                    json={"id_token": f"uid-{slug}", "slug": slug, "nombre": "Super Prueba",
                          "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _invitar_y_entrar(client, duena, email, rol):
    r = client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=duena)
    assert r.status_code == 200, r.text
    _usar_verificador(client, f"uid-{email}", email)
    r = client.post("/api/auth/oauth", json={"id_token": f"uid-{email}", "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _llenar(client, cab):
    """Un poco de todo: plano, espacio, proveedor, contrato con documento y
    planometría, montaje con foto y un arte del catálogo."""
    r = client.put("/api/layout/NAVE", headers=cab,
                   json={"fixtures": [{"id": "m1", "code": "PUN-01", "type": "punta"}],
                         "base_updated_at": None})
    assert r.status_code == 200, r.text

    r = client.post("/api/spaces/find-or-create", headers=cab,
                    json={"code": "NAVE-PUN-01", "name": "Punta 1", "zone": "punta",
                          "sede": "NAVE", "area_m2": 1.5})
    assert r.status_code == 200, r.text
    espacio = r.json()["id"]

    r = client.post("/api/suppliers/find-or-create", json={"name": "Alpina"}, headers=cab)
    assert r.status_code in (200, 201), r.text
    proveedor = r.json()["id"]

    from app.fechas import hoy
    from datetime import timedelta

    r = client.post(f"/api/spaces/{espacio}/leases", headers=cab, json={
        "supplier_id": proveedor, "monthly_rent": 1_234_567,
        "start_date": (hoy() - timedelta(days=3)).isoformat(),
        "end_date": (hoy() + timedelta(days=60)).isoformat(),
    })
    assert r.status_code == 201, r.text
    contrato = r.json()["id"]

    r = client.post(f"/api/spaces/{espacio}/files", headers=cab,
                    files={"file": ("contrato firmado.pdf", io.BytesIO(PDF), "application/pdf")})
    assert r.status_code in (200, 201), r.text

    r = client.post(f"/api/leases/{contrato}/planometria", headers=cab,
                    files={"file": ("plano.jpg", io.BytesIO(FOTO), "image/jpeg")})
    assert r.status_code in (200, 201), r.text

    r = client.post("/api/mounts/", headers=cab,
                    data={"space_code": "NAVE-PUN-01", "estado": "montado", "sede": "NAVE"},
                    files={"foto": ("montaje.jpg", FOTO, "image/jpeg")})
    assert r.status_code == 201, r.text

    r = client.post("/api/catalogo/", headers=cab,
                    data={"supplier_id": proveedor, "nombre": "Arte Alpina"},
                    files={"file": ("arte.png", io.BytesIO(ARTE), "image/png")})
    assert r.status_code == 201, r.text

    # La ficha del arte vive en su propia tabla: sin una fila, la ida y
    # vuelta pasaría con `supplier_asset_specs` vacía. Con el precio al
    # público del hablador, que también tiene que viajar.
    r = client.put(f"/api/catalogo/{r.json()['id']}/ficha", headers=cab, json={
        "forma": "vaso", "alto_mm": 90, "ancho_mm": 75, "fondo_mm": 75,
        "apilable": True, "acostado": False, "fondo_foto": "auto", "precio_publico": 4900,
    })
    assert r.status_code == 200, r.text
    assert r.json()["ficha"]["precio_publico"] == 4900

    # La ficha propia de un mueble (`modelos_mueble`), sin archivos: tiene que
    # volver igual, con su JSON de medidas y fuente.
    r = client.post("/api/muebles/modelos", headers=cab, json={
        "clave": "nevera-2p", "tipo": "nevera_puertas", "nombre": "Nevera de 2 puertas",
        "w": 1.445, "d": 0.74, "h": 2.1, "partes": {"puertas": 2},
        "fuente": {"confiabilidad": "ficha", "url": "https://inducol.com.co/ficha/"},
    })
    assert r.status_code == 201, r.text


def _bajar(client, cab):
    r = client.get("/api/clientes/mi-copia", headers=cab)
    assert r.status_code == 200, r.text
    return r


def _zip(r):
    return zipfile.ZipFile(io.BytesIO(r.content))


def _tabla(zf, nombre):
    return json.loads(zf.read(f"tablas/{nombre}.json"))


def _filas(motor, tabla):
    from sqlalchemy import select

    with motor.connect() as cx:
        return [dict(f) for f in cx.execute(select(tabla).order_by(*tabla.primary_key.columns)).mappings()]


def _motor_del_cliente(slug=SLUG):
    from app.clientes import buscar, motor_de

    return motor_de(buscar(slug))


def _estado(slug, estado):
    """Escribe ``estados_cliente`` a mano y tira el caché (patrón de la Fase 2)."""
    from app import plataforma_estado
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        if fila is None:
            fila = EstadoCliente(slug=slug, estado=estado, motivo="Prueba",
                                 cambiado_por="op@recabra.co")
            reg.add(fila)
        else:
            fila.estado = estado
        fila.cambiado_en = datetime.now(timezone.utc)
        reg.commit()
    finally:
        reg.close()
    plataforma_estado.limpiar_cache_estado()


# ─── Quién la baja ──────────────────────────────────────────────────────────

def test_la_baja_solo_el_dueno(client, admin, worker):
    """Lleva todo —plata y contactos de proveedores incluidos—: ni el admin de
    la clave vieja, ni un admin invitado, ni un trabajador."""
    for cab in (admin, worker):
        r = client.get("/api/clientes/mi-copia", headers=cab)
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == NO_OWNER

    duena = _fundar(client)
    gerente = _invitar_y_entrar(client, duena, "gerente@super.co", "admin")
    mercaderista = _invitar_y_entrar(client, duena, "mario@super.co", "worker")
    for cab in (gerente, mercaderista):
        r = client.get("/api/clientes/mi-copia", headers=cab)
        assert r.status_code == 403, r.text

    assert client.get("/api/clientes/mi-copia").status_code == 401
    r = _bajar(client, duena)
    assert r.headers["content-type"] == "application/zip"


# ─── Qué trae ───────────────────────────────────────────────────────────────

def test_trae_cada_tabla_del_supermercado_con_sus_archivos(client):
    from app.services.copia import tablas_de_la_copia

    duena = _fundar(client)
    _llenar(client, duena)
    zf = _zip(_bajar(client, duena))
    nombres = set(zf.namelist())

    for tabla in tablas_de_la_copia():
        assert f"tablas/{tabla.name}.json" in nombres, f"falta {tabla.name}"
    assert "tablas/login_attempts.json" not in nombres
    assert {"MANIFIESTO.json", "LEEME.txt", "personas.json"} <= nombres

    manifiesto = json.loads(zf.read("MANIFIESTO.json"))
    assert manifiesto["cliente"]["slug"] == SLUG
    assert manifiesto["faltaba_en_la_base"] == []

    # El contrato sale con su plata: la copia es del dueño.
    (contrato,) = _tabla(zf, "space_leases")
    assert contrato["monthly_rent"] == 1_234_567

    # Cada binario sale como archivo, con el MISMO contenido, y el JSON dice cuál.
    documentos = {f["filename"]: f for f in _tabla(zf, "space_files")}
    pdf = documentos["contrato firmado.pdf"]
    assert pdf["data"].startswith("archivos/space_files/")
    assert " " not in pdf["data"]
    assert zf.read(pdf["data"]) == PDF

    (montaje,) = _tabla(zf, "mount_confirmations")
    foto = next(f for f in _tabla(zf, "space_files") if f["id"] == montaje["file_id"])
    assert zf.read(foto["data"]) == FOTO

    (planometria,) = _tabla(zf, "lease_files")
    assert zf.read(planometria["data"]) == FOTO
    (arte,) = _tabla(zf, "supplier_assets")
    assert zf.read(arte["data"]) == ARTE
    (ficha,) = _tabla(zf, "supplier_asset_specs")
    assert ficha["asset_id"] == arte["id"] and ficha["precio_publico"] == 4900
    assert manifiesto["tablas"]["supplier_assets"] == {"filas": 1, "archivos": 1, "bytes": len(ARTE)}

    (plano,) = _tabla(zf, "layout_snapshots")
    assert "PUN-01" in plano["fixtures_json"]

    personas = json.loads(zf.read("personas.json"))
    assert {"email": CORREO_DUENA, "rol": "owner", "activo": True}.items() <= personas[0].items()
    assert all("firebase_uid" not in p for p in personas)


def test_no_trae_ninguna_clave(client):
    """Con el ingreso por clave prendido (como en esta suite), el alta le puso
    clave compartida al supermercado: está en su base y NO sale en la copia."""
    from app.models.models import AppConfig
    from app.services.copia import CONFIG_QUE_NO_SALE

    duena = _fundar(client)
    en_la_base = {f["key"] for f in _filas(_motor_del_cliente(), AppConfig.__table__)}
    assert "admin_password_hash" in en_la_base, "la prueba no tendría qué buscar"

    zf = _zip(_bajar(client, duena))
    claves = {f["key"] for f in _tabla(zf, "app_config")}
    assert not claves & CONFIG_QUE_NO_SALE
    for nombre in zf.namelist():
        assert b"$argon2" not in zf.read(nombre), f"un hash de clave quedó en {nombre}"


def test_toda_tabla_de_negocio_sale_o_dice_por_que(client):
    """Una tabla nueva entra sola (el traspaso obliga a clasificarla en
    `TABLAS_DEL_CLIENTE`); dejarla afuera tiene que ser una decisión escrita."""
    from app.services.copia import TABLAS_QUE_NO_SALEN, tablas_de_la_copia
    from app.services.traspaso import TABLAS_DEL_CLIENTE

    salen = {t.name for t in tablas_de_la_copia()}
    assert salen | set(TABLAS_QUE_NO_SALEN) == set(TABLAS_DEL_CLIENTE)
    assert not salen & set(TABLAS_QUE_NO_SALEN)


def test_un_nombre_de_archivo_no_sale_de_su_carpeta(client):
    from app.services.copia import _nombre_seguro

    for malo in ("../../etc/passwd", "..\\..\\boot.ini", "/abs/olu.ta", ".oculto", "", None):
        limpio = _nombre_seguro(malo)
        assert "/" not in limpio and "\\" not in limpio and not limpio.startswith("."), limpio
        assert limpio
    assert _nombre_seguro("Planometría Éxito.pdf") == "Planometría_Éxito.pdf"


# ─── Volver ─────────────────────────────────────────────────────────────────

def test_ida_y_vuelta_deja_todo_igual(client, tmp_path):
    """La que de verdad importa: con la copia sola, una base nueva queda igual
    a la de origen en cada tabla, binarios incluidos."""
    from sqlalchemy import create_engine

    from app.models.models import AppConfig
    from app.services.copia import CONFIG_QUE_NO_SALE, restaurar, tablas_de_la_copia
    from app.services.traspaso import CLAVE_GENERACION

    duena = _fundar(client)
    _llenar(client, duena)
    copia = tmp_path / "copia.zip"
    copia.write_bytes(_bajar(client, duena).content)

    origen = _motor_del_cliente()
    destino = create_engine(f"sqlite:///{tmp_path / 'vuelta.db'}")
    try:
        cuantas = restaurar(copia, destino)
        for nombre in ("spaces", "space_leases", "suppliers", "layout_snapshots", "space_files",
                       "lease_files", "supplier_assets", "supplier_asset_specs",
                       "mount_confirmations", "audit_log", "modelos_mueble"):
            assert cuantas.get(nombre), f"la prueba no llenó {nombre}"

        for tabla in tablas_de_la_copia():
            antes, despues = _filas(origen, tabla), _filas(destino, tabla)
            if tabla is AppConfig.__table__:
                fuera = CONFIG_QUE_NO_SALE | {CLAVE_GENERACION}
                generacion = [f["value"] for f in despues if f["key"] == CLAVE_GENERACION]
                assert generacion and generacion != [f["value"] for f in antes if f["key"] == CLAVE_GENERACION]
                antes = [f for f in antes if f["key"] not in fuera]
                despues = [f for f in despues if f["key"] not in fuera]
            if tabla.name == "audit_log":
                # La descarga se anota DESPUÉS de armar la copia: esa línea no
                # puede estar adentro de la copia que registra.
                antes = [f for f in antes if f["accion"] != "copia.descarga"]
            assert despues == antes, f"{tabla.name} no volvió igual"
    finally:
        destino.dispose()


def test_restaurar_no_mezcla_con_una_base_con_datos(client, tmp_path):
    import pytest
    from sqlalchemy import create_engine, func, select

    from app.models.models import Space
    from app.services.copia import ErrorDeCopia, restaurar

    duena = _fundar(client)
    _llenar(client, duena)
    copia = tmp_path / "copia.zip"
    copia.write_bytes(_bajar(client, duena).content)

    destino = create_engine(f"sqlite:///{tmp_path / 'vuelta.db'}")
    try:
        restaurar(copia, destino)
        with pytest.raises(ErrorDeCopia, match="ya tiene datos"):
            restaurar(copia, destino)
        with destino.connect() as cx:
            assert cx.execute(select(func.count()).select_from(Space.__table__)).scalar() == 1
    finally:
        destino.dispose()


def test_restaurar_no_acepta_cualquier_zip(client, tmp_path):
    import pytest
    from sqlalchemy import create_engine

    from app.services.copia import ErrorDeCopia, restaurar

    otro = tmp_path / "otro.zip"
    with zipfile.ZipFile(otro, "w") as zf:
        zf.writestr("fotos/vacaciones.jpg", FOTO)
    destino = create_engine(f"sqlite:///{tmp_path / 'vuelta.db'}")
    try:
        with pytest.raises(ErrorDeCopia, match="MANIFIESTO"):
            restaurar(otro, destino)
    finally:
        destino.dispose()


# ─── La puerta ──────────────────────────────────────────────────────────────

def test_queda_en_la_bitacora_con_quien_la_bajo(client):
    duena = _fundar(client)
    _bajar(client, duena)

    r = client.get("/api/bitacora/", params={"accion": "copia.descarga"}, headers=duena)
    assert r.status_code == 200, r.text
    (linea,) = r.json()
    assert linea["titulo"] == "Copia de seguridad descargada"
    assert CORREO_DUENA in linea["detalle"]
    assert "copia.descarga" in client.get("/api/bitacora/acciones", headers=duena).json()


def test_la_cuarta_en_una_hora_espera(client):
    duena = _fundar(client)
    for _ in range(3):
        _bajar(client, duena)
    r = client.get("/api/clientes/mi-copia", headers=duena)
    assert r.status_code == 429, r.text
    assert "tres copias" in r.json()["detail"]


def test_sale_con_nombre_y_sin_cache(client):
    duena = _fundar(client)
    r = _bajar(client, duena)
    assert r.headers["cache-control"] == "no-store"
    assert int(r.headers["content-length"]) == len(r.content)
    assert re.fullmatch(
        rf'attachment; filename="recabra-copia-{SLUG}-\d{{4}}-\d{{2}}-\d{{2}}-\d{{4}}\.zip"',
        r.headers["content-disposition"],
    ), r.headers["content-disposition"]


def test_suspendida_no_sale_y_en_solo_lectura_si(client):
    """Con la cuenta suspendida no se sirve ningún dato, y la copia es el más
    grande de todos; para el derecho del titular está «Descargar mis datos»."""
    duena = _fundar(client)

    _estado(SLUG, "suspendido")
    assert client.get("/api/clientes/mi-copia", headers=duena).status_code == 402
    assert client.get("/api/clientes/mi-export", headers=duena).status_code == 200

    _estado(SLUG, "solo_lectura")
    _bajar(client, duena)
