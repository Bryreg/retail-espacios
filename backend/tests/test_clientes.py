"""Un supermercado, una base. Que la separación sea real y no una intención.

El hallazgo crítico de la auditoría decía que `sede` es un texto en una tabla
común: dos supermercados en esta base comparten tabla, contraseña y archivos.
La respuesta fue darle a cada cliente su propia base de datos dentro de la
misma instancia de Postgres.

Sin estas pruebas, el aislamiento es una intención. Con ellas es una propiedad.
"""
import jwt
import pytest

from conftest import CLAVE_ADMIN, CLAVE_WORKER
from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia


def _crear(slug="olimpica", nombre="Olímpica"):
    from app.clientes import crear_cliente
    return crear_cliente(slug, nombre)


def _entrar(client, clave, cliente=None):
    cuerpo = {"password": clave}
    if cliente is not None:
        cuerpo["cliente"] = cliente
    return client.post("/api/auth/login", json=cuerpo)


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _proveedor(client, cab, nombre):
    r = client.post("/api/suppliers/find-or-create", json={"name": nombre}, headers=cab)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _proveedores(client, cab):
    r = client.get("/api/suppliers/", headers=cab)
    assert r.status_code == 200, r.text
    return [p["name"] for p in r.json()]


# ─── Que no se vean entre sí ──────────────────────────────────────────────────

def test_lo_de_un_supermercado_no_aparece_en_el_otro(client, admin):
    """La prueba que justifica toda la decisión."""
    _crear()

    _proveedor(client, admin, "Alpina")

    r = _entrar(client, CLAVE_ADMIN, "olimpica")
    assert r.status_code == 200, r.text
    otro = _cab(r.json()["token"])
    _proveedor(client, otro, "Nutresa")

    assert _proveedores(client, admin) == ["Alpina"]
    assert _proveedores(client, otro) == ["Nutresa"]


def test_el_token_de_uno_no_alcanza_los_datos_del_otro(client, admin):
    """El token dice de qué cliente es, y eso decide contra qué base corre todo.

    No hay forma de apuntarlo a otra: el nombre va adentro de lo firmado.
    """
    _crear()
    _proveedor(client, admin, "Alpina")

    r = _entrar(client, CLAVE_ADMIN, "olimpica")
    otro = _cab(r.json()["token"])

    # Con el token del segundo cliente, el proveedor del primero no existe.
    assert "Alpina" not in _proveedores(client, otro)


def test_la_misma_clave_en_dos_clientes_no_los_cruza(client, admin):
    """Los dos arrancan con la misma contraseña porque salen del mismo entorno.

    Si el sistema dedujera el cliente de la contraseña, entraría al que se
    revise primero. Por eso el supermercado se manda explícito.
    """
    _crear()
    _proveedor(client, admin, "Alpina")

    r = _entrar(client, CLAVE_ADMIN, "olimpica")
    assert r.status_code == 200, r.text
    assert r.json()["cliente"] == "olimpica"
    assert "Alpina" not in _proveedores(client, _cab(r.json()["token"]))


def test_el_cliente_nuevo_arranca_vacio(client, admin):
    """Sin los pasillos de GALERIAS adentro.

    Sembrarle "Licores 24H" y "Arroz" a otro supermercado sería peor que dejarlo
    vacío: parece que el sistema ya sabe algo de su tienda cuando no sabe nada.
    """
    _crear()
    otro = _cab(_entrar(client, CLAVE_ADMIN, "olimpica").json()["token"])

    r = client.get("/api/spaces/", headers=otro)
    assert r.status_code == 200, r.text
    assert r.json() == []


# ─── Que el token no se pueda torcer ──────────────────────────────────────────

def test_un_token_firmado_con_otra_llave_no_entra(client, admin):
    _crear()
    falso = jwt.encode(
        {"role": "admin", "epoca": 0, "cliente": "olimpica", "exp": 9999999999},
        "otra-llave-cualquiera", algorithm="HS256",
    )
    assert client.get("/api/suppliers/", headers=_cab(falso)).status_code == 401


def test_cambiarle_el_cliente_al_token_lo_rompe(client, admin):
    """La firma cubre el nombre del cliente, así que tocarlo invalida todo."""
    _crear()
    bueno = admin["Authorization"][7:]
    partes = bueno.split(".")
    # Ensuciar la carga útil sin recalcular la firma.
    partes[1] = partes[1][:-4] + "AAAA"
    assert client.get("/api/suppliers/", headers=_cab(".".join(partes))).status_code == 401


def test_un_token_que_nombra_un_cliente_inexistente_no_entra(client):
    fantasma = jwt.encode(
        {"role": "admin", "epoca": 0, "cliente": "no_existe", "exp": 9999999999},
        "test-secret", algorithm="HS256",
    )
    assert client.get("/api/suppliers/", headers=_cab(fantasma)).status_code == 401


# ─── Que nadie se quede afuera el día del despliegue ──────────────────────────

def test_con_un_solo_cliente_se_entra_sin_elegir_nada(client):
    """El despliegue no puede cambiarle la vida a las siete tiendas que ya usan
    esto. Mientras haya un cliente, entrar es exactamente como era ayer."""
    r = _entrar(client, CLAVE_ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"


def test_el_token_viejo_sin_cliente_sigue_valiendo(client):
    """Los que ya estaban adentro cuando se desplegó no traen cliente."""
    viejo = jwt.encode(
        {"role": "admin", "epoca": 0, "exp": 9999999999},
        "test-secret", algorithm="HS256",
    )
    assert client.get("/api/suppliers/", headers=_cab(viejo)).status_code == 200


def test_con_dos_clientes_hay_que_decir_cual(client, admin):
    _crear()
    r = _entrar(client, CLAVE_ADMIN)
    assert r.status_code == 422
    assert "supermercado" in r.json()["detail"].lower()


# ─── La lista del viejo selector ──────────────────────────────────────────────

def test_la_lista_de_supermercados_ya_no_es_publica(client, admin):
    """Era la lista del selector de la pantalla de ingreso con clave compartida.
    Ese selector se fue con la clave, y la lista quedó contándole a cualquiera
    qué supermercados usan el sistema (2026-10-02). El nombre del supermercado
    al que se entra viaja ahora en la respuesta de `/oauth`."""
    _crear()
    assert client.get("/api/auth/clientes").status_code == 404


def test_un_cliente_que_no_existe_responde_como_clave_errada(client):
    """Si dijera «ese supermercado no existe», la pantalla de ingreso serviría
    para averiguar quiénes son los clientes."""
    r = _entrar(client, CLAVE_ADMIN, "no_existe")
    assert r.status_code == 401
    assert r.json()["detail"] == "Contraseña incorrecta"


# ─── El alta ──────────────────────────────────────────────────────────────────

def test_no_se_puede_dar_de_alta_dos_veces_el_mismo(client):
    from app.clientes import ErrorDeAlta
    _crear()
    with pytest.raises(ErrorDeAlta):
        _crear()


def test_el_codigo_del_cliente_tiene_forma(client):
    from app.clientes import ErrorDeAlta
    for malo in ("Olímpica", "con espacio", "1arranca_con_numero", "", "x" * 40):
        with pytest.raises(ErrorDeAlta):
            _crear(malo, "Cualquiera")


# ─── El enlace de montaje ─────────────────────────────────────────────────────

def test_el_enlace_de_montaje_solo_abre_la_base_de_su_cliente(client, admin):
    """El enlace sale por correo y vive un mes. Si no dijera de qué supermercado
    es, el de uno abriría la pantalla del otro.

    Se siembra un contrato de verdad en el primer cliente —proveedor, marca,
    fechas, el mueble en el plano— y después se pide lo mismo con el enlace del
    segundo. Si la separación fallara, acá saldría «Alpina».
    """
    from datetime import timedelta

    from app.auth import create_mount_token

    fixtures = [{
        "id": "f1", "code": "PUN-04", "type": "punta_gondola",
        "cx": 2.0, "cz": 2.0, "rotY": 0, "w": 1.2, "d": 0.6, "h": 1.8,
        "rentable": True, "label": "Punta 4",
    }]
    assert client.put(
        "/api/layout/NAVE", json={"fixtures": fixtures, "base_updated_at": None},
        headers=admin,
    ).status_code == 200

    esp = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-PUN-04", "name": "Punta 4", "zone": "punta",
              "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    ).json()["id"]
    prov = _proveedor(client, admin, "Alpina")
    hoy = hoy_en_colombia()
    assert client.post(
        f"/api/spaces/{esp}/leases",
        json={"supplier_id": prov, "marca": "Yogurt Griego",
              "start_date": (hoy - timedelta(days=1)).isoformat(),
              "end_date": (hoy + timedelta(days=20)).isoformat(),
              "monthly_rent": 1_800_000},
        headers=admin,
    ).status_code == 201

    # Con el enlace del PRIMER cliente se ve todo, como siempre.
    propio = client.get(
        f"/api/montaje/mi-espacio?token={create_mount_token('NAVE-PUN-04', 'galerias')}"
    )
    assert propio.status_code == 200, propio.text
    assert propio.json()["proveedor"] == "Alpina"

    # Con el del segundo, el mismo código no trae nada de nadie.
    _crear()
    ajeno = client.get(
        f"/api/montaje/mi-espacio?token={create_mount_token('NAVE-PUN-04', 'olimpica')}"
    )
    assert ajeno.status_code == 200, ajeno.text
    d = ajeno.json()
    assert d["proveedor"] == ""
    assert d["marca"] == ""
    assert d["sede"] == ""
    assert d["vecinos"] == []
    assert "Alpina" not in ajeno.text


def test_el_trabajador_tampoco_cruza_de_cliente(client, worker, admin):
    _crear()
    _proveedor(client, admin, "Alpina")

    r = _entrar(client, CLAVE_WORKER, "olimpica")
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "worker"
    assert "Alpina" not in _proveedores(client, _cab(r.json()["token"]))


# ─── La URL de la base ────────────────────────────────────────────────────────

def test_la_url_del_cliente_conserva_los_parametros(client, monkeypatch):
    """`?sslmode=require` es lo normal en un Postgres administrado.

    Cortando la URL por la última barra, el nombre de la base se llevaría el
    parámetro puesto y la conexión del cliente nuevo saldría sin TLS — o no
    saldría. Se parsea de verdad.
    """
    import app.clientes as mod

    monkeypatch.setattr(
        mod, "SQLALCHEMY_DATABASE_URL",
        "postgresql://u:p@host.render.com:5432/retail_espacios?sslmode=require",
    )
    assert mod._db_por_defecto() == "retail_espacios"
    assert mod.url_para("recabra_olimpica") == (
        "postgresql://u:p@host.render.com:5432/recabra_olimpica?sslmode=require"
    )


def test_si_la_base_se_muda_el_registro_la_sigue(client):
    """Mudar la base de proveedor no puede romper el sistema.

    El cliente por defecto es, por definición, la base a la que apunta
    `DATABASE_URL`. Si esa variable cambia —de Neon a Render, por decir— el
    nombre guardado deja de coincidir, y sin esto `motor_de` no lo reconocería
    como el de siempre: abriría un motor aparte contra una base que en el
    destino no existe, y la app se caería en la primera petición.
    """
    from app.database import SessionLocal
    from app.models.models import ClienteRow
    from app.clientes import _db_por_defecto, motor_de, registrar_el_de_siempre
    from app.database import engine as motor_por_defecto

    # Simular que la fila quedó apuntando al nombre del proveedor viejo.
    db = SessionLocal()
    try:
        fila = db.query(ClienteRow).first()
        assert fila is not None
        fila.db_name = "neondb"
        db.commit()
    finally:
        db.close()

    cliente = registrar_el_de_siempre()
    assert cliente.db_name == _db_por_defecto()
    # Y vuelve a usar el motor de siempre, sin abrir uno nuevo.
    assert motor_de(cliente) is motor_por_defecto

    # El sistema sigue contestando.
    r = client.post("/api/auth/login", json={"password": CLAVE_ADMIN})
    assert r.status_code == 200, r.text
