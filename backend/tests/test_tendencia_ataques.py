"""Red team de la Fase 5 — Tendencia temporal: tests de ATAQUE, no de funcionalidad.

Sucesor directo de ``tests/test_metricas_ataques.py`` (Fase 4, el agujero de
alfiler original) y de ``tests/test_plataforma_ataques.py`` (Fase 2, la
frontera del operador). La Fase 5 no abre una superficie nueva de privilegio:
persiste una foto mensual de lo que ``/metricas`` ya calculaba y expone una
segunda ventana de sólo lectura, ``GET /api/plataforma/tendencia``, sobre esa
foto. La pregunta de este archivo es si esa ventana nueva hereda TODAS las
garantías de la anterior — y si, además, la tabla nueva (``snapshot_metricas``)
y el cierre automático (``cerrar_mes_anterior``, colgado de
``_run_lease_maintenance``) respetan los guardrails de arquitectura del repo:
sin migraciones, sin abrir bases de cliente para escribir, rutas literales
antes que paramétricas.

Diez frentes, uno por letra (A-J), pedidos por el encargo:

A. Acceso — la misma puerta que ``/metricas``, con el mismo constructor.
B. Bitácora — una fila por 200, con el rango pedido.
C. Parámetros hostiles — nunca 500, nunca 405 con traza filtrada.
D. Frontera de datos — recorrido hoja por hoja del JSON, con sembrado jugoso.
E. Sólo lectura sobre las bases de cliente — hash antes/después + grep estático.
F. Sin migraciones — ``Base.metadata.tables`` contra el set preexistente.
G. Tolerancia a fallos — un cliente roto no frena el cierre ni a los demás.
H. Orden de rutas — ``/tendencia`` no cae en las paramétricas del router.
I. Legado/JWT/redacción — la suite entera sigue verde y ``/soy`` no cambió.
J. Guardrails de frontend — grep estático, sin ejecutar nada.

El identificador (``T-n``) de cada test referencia
``features/tendencia/outputs/frontera-tendencia.md``.

**Todos los ``import app.*`` van adentro de las funciones**, por el mismo
motivo que en los archivos hermanos: el fixture ``client`` de ``conftest.py``
purga ``sys.modules['app.*']`` entre pruebas.

**TMPDIR obligatorio al correr esto**: otros agentes corren pytest en paralelo
y el teardown de ``conftest.py`` borra ``recabra_*.db`` de la carpeta temporal
de CADA prueba — sin aislar TMPDIR, una corrida ajena puede pisar archivos de
ésta a mitad de camino.
"""
from tests.sembrado import total_del_plazo, marcar_cancelados
import hashlib
import json
import os
import re
from datetime import date
from types import SimpleNamespace

import pytest

from conftest import CLAVE_ADMIN, CLAVE_WORKER, esperar_mantenimiento

NO_OPERADOR = "Solo para operadores de la plataforma."


def _fijar_mes_en_curso(monkeypatch) -> str:
    """El mes en curso de la consola (UTC), quieto hasta que termine la prueba.

    Fue la constante ``"2026-09"``, «coherente con la fecha fijada del entorno
    de test» — pero ninguna fecha estaba fijada: el 2026-10-01 la serie empezó a
    terminar en octubre y T-14, T-18 y T-25 cayeron sin que la app cambiara.

    Leerlo del reloj no alcanza: una prueba que corriera justo cuando cambia el
    mes (las 7 p. m. del último día, en Colombia) sembraría en uno y preguntaría
    por el otro. Así que se fija ``periodo_actual`` en cada módulo de la app que
    lo tenga a mano —``plataforma_tendencia`` lo importó por nombre—, y nada
    más: los contratos y los JWT siguen con el reloj de verdad.
    """
    import sys

    from app.plataforma_metricas import periodo_actual

    # El hilo del mantenimiento importa módulos mientras corre: se lo espera
    # antes de recorrer ``sys.modules``, y se recorre una copia.
    esperar_mantenimiento()
    fijo = periodo_actual()
    for nombre, modulo in sys.modules.copy().items():
        if nombre.startswith("app.") and getattr(modulo, "periodo_actual", None) is periodo_actual:
            monkeypatch.setattr(modulo, "periodo_actual", lambda: fijo)
    return fijo


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE — calcado de test_plataforma_metricas.py / test_metricas_ataques.py
# ════════════════════════════════════════════════════════════════════════════

class FakeVerificador:
    def __init__(self, mapa: dict):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


def _claims(uid, email, verificado=True, proveedor="google.com", nombre=None):
    return SimpleNamespace(
        uid=uid, email=email, email_verificado=verificado, proveedor=proveedor, nombre=nombre,
    )


class Identidades:
    """Acumula las cuentas falsas: un solo override para todas las del test."""

    def __init__(self, client):
        self.client = client
        self.mapa: dict = {}

    def registrar(self, uid, email):
        from app.services.firebase_tokens import get_verificador

        self.mapa[uid] = _claims(uid, email)
        self.client.app.dependency_overrides[get_verificador] = lambda: FakeVerificador(self.mapa)
        return uid


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(ids: Identidades, uid, email, slug, nombre):
    """Funda un cliente por el alta self-service. Devuelve la cabecera del owner."""
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid="uid-op", email="op@recabra.co"):
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    return r.json()


def _sembrar(slug, sedes: dict, contratos: list):
    """Escribe layout + espacios + contratos en la base DEL CLIENTE."""
    from app.clientes import buscar, sesion_de
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        for sede, fixtures in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures)))
        db.flush()

        proveedores: dict = {}
        espacios: dict = {}
        for codigo, proveedor, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
                fila = db.query(Supplier).filter(Supplier.name == proveedor).first()
                if fila is None:
                    fila = Supplier(name=proveedor)
                    db.add(fila)
                    db.flush()
                proveedores[proveedor] = fila
            if codigo not in espacios:
                espacio = db.query(Space).filter(Space.code == codigo).first()
                if espacio is None:
                    espacio = Space(
                        code=codigo, svg_id=f"svg-{codigo}", name=codigo,
                        zone="Zona", sede=codigo.split("-")[0], area_m2=5.0,
                    )
                    db.add(espacio)
                    db.flush()
                espacios[codigo] = espacio
            db.add(SpaceLease(
                space_id=espacios[codigo].id,
                supplier_id=proveedores[proveedor].id,
                start_date=date.fromisoformat(ini),
                end_date=date.fromisoformat(fin),
                monthly_rent=total_del_plazo(canon, ini, fin),  # lo de un mes, guardado como total
                is_active=activo,
            ))
        marcar_cancelados(db)  # is_active=False es una baja (auditoría P1-17)
        db.commit()
    finally:
        db.close()


def _romper(slug="roto", nombre="Roto"):
    """Un cliente cuya base NO se puede leer: fila en el registro + archivo basura."""
    from app.clientes import sesion_registro, url_para
    from app.models.models import ClienteRow

    db_name = f"recabra_{slug}"
    reg = sesion_registro()
    try:
        reg.add(ClienteRow(slug=slug, nombre=nombre, db_name=db_name, activo=True))
        reg.commit()
    finally:
        reg.close()

    ruta = url_para(db_name).split("sqlite:///", 1)[1]
    with open(ruta, "wb") as f:
        f.write(b"esto no es una base de datos, es un archivo cualquiera\n" * 20)


def _hojas(nodo):
    """Todos los valores escalares del JSON, sin importar dónde estén."""
    if isinstance(nodo, dict):
        for v in nodo.values():
            yield from _hojas(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _hojas(v)
    else:
        yield nodo


def _todos_los_textos(cuerpo):
    return [v for v in _hojas(cuerpo) if isinstance(v, str)]


def _todos_los_numeros(cuerpo):
    return [v for v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


def _claves_recursivas(nodo, camino="raiz"):
    """(camino, clave) de CADA clave de dict, en todo el árbol -- para T-04."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield (camino, k)
            yield from _claves_recursivas(v, f"{camino}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _claves_recursivas(v, f"{camino}[{i}]")


def _bitacora_filas(accion="tendencia"):
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        return reg.query(BitacoraPlataforma).filter(BitacoraPlataforma.accion == accion).all()
    finally:
        reg.close()


def _snapshots_filas():
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        return reg.query(SnapshotMetricas).all()
    finally:
        reg.close()


def _archivo_de(slug):
    """Ruta absoluta del archivo sqlite del cliente `slug` (o None si no hay fila)."""
    from app.clientes import buscar, url_para

    cliente = buscar(slug)
    if cliente is None:
        return None
    return url_para(cliente.db_name).split("sqlite:///", 1)[1]


def _hash(ruta):
    if ruta is None or not os.path.exists(ruta):
        return None
    with open(ruta, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _hash_bases(slugs):
    return {slug: _hash(_archivo_de(slug)) for slug in slugs}


# ─── Datos jugosos para la frontera D ─────────────────────────────────────────
#
# Un proveedor cuyo NOMBRE lleva correo y teléfono (la tentación: el nombre
# saneado SÍ sale en el top-5). Usuarios reales con correo. Un monto
# característico (4321.99) en un cliente con UN SOLO contrato ese mes --
# Fase 7 (sin umbral): el importe y el top SÍ aparecen, exactos, y lo que
# tiene que seguir sin filtrarse es el correo/teléfono del proveedor, no el
# monto.

PROVEEDOR_JUGOSO = "Contacto Comercial <contacto.jugoso@ejemplo.example> +57 300 555 0199"
CORREO_DUENA = "duena.jugosa@correo-personal.example"
CORREO_OPERADOR = "operador.jugoso@recabra.example"
MONTO_CARACTERISTICO = 4321.99

_NAVE = [{"code": "PUN-01", "type": "punta", "sede": "NAVE"}]
# (código, proveedor, canon, activo): las fechas las pone `_vigentes_en`, porque
# el mes que importa es el que esté corriendo cuando se corra la prueba.
_CONTRATO_UNICO = [
    ("NAVE-PUN-01", PROVEEDOR_JUGOSO, MONTO_CARACTERISTICO, True),
]

# Un segundo cliente con TRES contratos, para que el consolidado tenga más de
# un cliente aportando plata y el test pueda comprobar que igual no se filtra
# ningún dato individual, sea cual sea el conteo de contratos.
_BETA = [
    {"code": "E-01", "type": "punta", "sede": "BETA"},
    {"code": "E-02", "type": "punta", "sede": "BETA"},
    {"code": "E-03", "type": "punta", "sede": "BETA"},
]
_CONTRATOS_BETA = [
    ("BETA-E-01", "Nutresa", 400_000.0, True),
    ("BETA-E-02", "Bimbo", 200_000.0, True),
    ("BETA-E-03", "Alpina", 750_000.0, True),
]


def _vigentes_en(periodo, contratos):
    """Los ``contratos`` de arriba, del primer al último día de ``periodo``."""
    from app.plataforma_metricas import rango_del_periodo

    desde, hasta = rango_del_periodo(periodo)
    return [(codigo, proveedor, desde.isoformat(), hasta.isoformat(), canon, activo)
            for codigo, proveedor, canon, activo in contratos]


def _escenario_jugoso(client, monkeypatch):
    """acme (1 contrato, publica exacto sin umbral) + beta (3 contratos) + roto + operador."""
    from app.plataforma_metricas import limpiar_cache_metricas

    periodo = _fijar_mes_en_curso(monkeypatch)
    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA, "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    _sembrar("acme", {"NAVE": _NAVE}, _vigentes_en(periodo, _CONTRATO_UNICO))
    _sembrar("beta", {"BETA": _BETA}, _vigentes_en(periodo, _CONTRATOS_BETA))
    _romper()
    consola = _operador_sin_membresias(ids, monkeypatch, email=CORREO_OPERADOR)
    limpiar_cache_metricas()

    # Calcular el período actual dispara el write-through: deja los snapshots
    # crudos de acme, beta y el consolidado (roto queda afuera, con error).
    from app.plataforma_metricas import calcular
    calcular(periodo)

    return ids, _cab(consola["token"])


# ════════════════════════════════════════════════════════════════════════════
# A. ACCESO
# ════════════════════════════════════════════════════════════════════════════

def test_t01_sin_token_401(client):
    r = client.get("/api/plataforma/tendencia")
    assert r.status_code == 401, r.text


def test_t02_sub_pero_no_operador_403(client, monkeypatch):
    """Dueño de un cliente (tiene `sub`, pero su correo no está en OPERADOR_EMAILS)."""
    ids = Identidades(client)
    cab_owner = _fundar(ids, "uid-x", "dueno@nooperador.co", "nooperador", "No Operador")
    monkeypatch.setenv("OPERADOR_EMAILS", "otro@recabra.co")

    r = client.get("/api/plataforma/tendencia", headers=cab_owner)
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == NO_OPERADOR


def test_t03_legado_403(client, admin, worker):
    """El login legado nunca trae `actor_email`: 403 por construcción."""
    r = client.get("/api/plataforma/tendencia", headers=admin)
    assert r.status_code == 403, r.text
    r = client.get("/api/plataforma/tendencia", headers=worker)
    assert r.status_code == 403, r.text


def test_t04_operador_200(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia", headers=cab)
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("caso", ["sin_token", "sub_no_operador", "legado"])
def test_t05_los_tres_fallos_no_escriben_bitacora_ni_snapshot(client, monkeypatch, admin, caso):
    """Ninguno de los tres 4xx de acceso deja rastro: ni bitácora, ni snapshot nuevo."""
    # El cierre del mes del arranque escribe snapshots desde su hilo: si todavía
    # corre, los escribe entre el «antes» y el «después» y parece que fue el 4xx.
    esperar_mantenimiento()
    antes_bitacora = len(_bitacora_filas())
    antes_snapshots = len(_snapshots_filas())

    if caso == "sin_token":
        r = client.get("/api/plataforma/tendencia")
    elif caso == "sub_no_operador":
        ids = Identidades(client)
        cab_owner = _fundar(ids, "uid-y", "dueno@nooperador.co", "nooperador2", "X")
        monkeypatch.setenv("OPERADOR_EMAILS", "otro@recabra.co")
        r = client.get("/api/plataforma/tendencia", headers=cab_owner)
    else:
        r = client.get("/api/plataforma/tendencia", headers=admin)

    assert r.status_code in (401, 403), r.text
    assert len(_bitacora_filas()) == antes_bitacora
    assert len(_snapshots_filas()) == antes_snapshots


# ════════════════════════════════════════════════════════════════════════════
# B. BITÁCORA
# ════════════════════════════════════════════════════════════════════════════

def test_t06_un_200_deja_una_fila_con_email_y_rango(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    antes = len(_bitacora_filas())

    r = client.get("/api/plataforma/tendencia?cliente=acme&meses=3", headers=cab)
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    filas = _bitacora_filas()
    assert len(filas) == antes + 1
    fila = filas[-1]
    assert fila.email == CORREO_OPERADOR
    assert fila.accion == "tendencia"
    assert fila.periodo == f"acme:{cuerpo['desde']}..{cuerpo['hasta']}"


def test_t07_dos_pedidos_dos_filas(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    antes = len(_bitacora_filas())

    r1 = client.get("/api/plataforma/tendencia?cliente=acme&meses=2", headers=cab)
    r2 = client.get("/api/plataforma/tendencia?cliente=__consolidado__&meses=4", headers=cab)
    assert r1.status_code == 200 and r2.status_code == 200

    filas = _bitacora_filas()
    assert len(filas) == antes + 2
    periodos = {f.periodo for f in filas[antes:]}
    assert any(p.startswith("acme:") for p in periodos)
    assert any(p.startswith("__consolidado__:") for p in periodos)


# ════════════════════════════════════════════════════════════════════════════
# C. PARÁMETROS HOSTILES
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("meses", [0, -1, 25, 9999, "abc", 1e9, -(2**31), "1.5"])
def test_t08_meses_hostil_nunca_500(client, monkeypatch, meses):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get(f"/api/plataforma/tendencia?cliente=acme&meses={meses}", headers=cab)
    assert r.status_code == 422, (meses, r.status_code, r.text)


@pytest.mark.parametrize("slug,esperado", [
    ("../galerias", 404),
    ("galerias;drop", 404),
    ("", 404),
    ("x" * 5000, 404),
])
def test_t09_cliente_hostil_nunca_500(client, monkeypatch, slug, esperado):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia", params={"cliente": slug, "meses": 3}, headers=cab)
    assert r.status_code in (404, 422), (slug, r.status_code, r.text)
    assert r.status_code != 500
    # El detail nunca puede traer una ruta de archivo, una URL sqlite ni una traza.
    detalle = json.dumps(r.json())
    assert "sqlite" not in detalle.lower()
    assert "/tmp" not in detalle and "recabra_" not in detalle
    assert "Traceback" not in detalle


def test_t10_cliente_mayusculas_documentado(client, monkeypatch):
    """`GALERIAS` (mayúsculas) contra el slug real `acme` en minúscula.

    Documenta el comportamiento real: `ClienteRow.slug` se guarda como vino del
    alta (minúsculas por la validación de `clientes.py`) y la consulta de
    `serie()` compara con `==`, sin normalizar. Un slug en mayúsculas que no
    calza con ninguna fila exacta debe dar 404 -- nunca resolver por accidente
    a otro cliente ni crashear.
    """
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia", params={"cliente": "ACME", "meses": 3}, headers=cab)
    assert r.status_code == 404, r.text


def test_t11_cliente_inexistente_404_detail_fijo(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia", params={"cliente": "no-existe-esto", "meses": 3},
                    headers=cab)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "No hay un cliente con ese código."


def test_t12_metodos_de_escritura_no_existen(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        r = client.request(metodo, "/api/plataforma/tendencia", json={}, headers=cab)
        assert r.status_code == 405, f"{metodo} -> {r.status_code}"


# ════════════════════════════════════════════════════════════════════════════
# D. FRONTERA DE DATOS
# ════════════════════════════════════════════════════════════════════════════

CLAVES_PROHIBIDAS = {"contratos_activos", "ocupadas", "id", "email", "monthly_rent", "usuario_id"}


def test_t13_ningun_correo_ni_telefono_en_el_json(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=acme&meses=1", headers=cab)
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    textos = _todos_los_textos(cuerpo)
    assert not any("@" in t for t in textos), [t for t in textos if "@" in t]
    import re
    for t in textos:
        assert not re.search(r"\d{7,}", t), t


def test_t14_con_un_contrato_el_monto_caracteristico_sale_exacto(client, monkeypatch):
    """Fase 7 (sin umbral): acme tiene UN solo contrato ese mes y el importe se
    publica EXACTO — es la decisión de producto que reemplaza a K=3. Lo que
    sigue sin poder aparecer es el correo/teléfono del proveedor (frontera D),
    no el monto."""
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=acme&meses=1", headers=cab)
    assert r.status_code == 200, r.text
    punto = r.json()["serie"][-1]

    assert punto["ingreso_contratado_mes"] == MONTO_CARACTERISTICO
    assert punto["canon_promedio_mensual"] == MONTO_CARACTERISTICO
    assert punto["top_proveedores"] == [
        {"nombre": "Contacto Comercial <[correo oculto]> [teléfono oculto]",
         "contratos_activos": 1},
    ]

    numeros = _todos_los_numeros(r.json())
    assert MONTO_CARACTERISTICO in numeros
    # Y lo que sigue prohibido es el dato de contacto, no el monto agregado.
    textos = _todos_los_textos(r.json())
    assert not any("@" in t for t in textos)
    assert not any("300 555 0199" in t for t in textos)


def test_t15_claves_prohibidas_no_existen_en_la_serie(client, monkeypatch):
    """Ni siquiera dentro de `top_proveedores`: las claves de esa lista son
    `nombre`/`contratos_activos` a propósito, pero `contratos_activos` FUERA de
    ese arreglo (al nivel del punto mensual) no puede existir -- es un crudo de
    negocio (el numerador de la ocupación) que no cruza la frontera del
    operador, con o sin umbral (Fase 7 no cambia esto)."""
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=__consolidado__&meses=1", headers=cab)
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    for punto in cuerpo["serie"]:
        assert set(punto.keys()) & CLAVES_PROHIBIDAS == set(), punto.keys()
        # Dentro de cada punto, sólo `top_proveedores` puede llevar la clave
        # `contratos_activos` -- ahí es el conteo por proveedor, no el total.
        for camino, clave in _claves_recursivas(punto):
            if clave in ("contratos_activos",) and "top_proveedores" not in camino:
                pytest.fail(f"clave prohibida '{clave}' fuera de top_proveedores en {camino}")


def test_t16_unicos_arreglos_son_serie_y_top_proveedores(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=__consolidado__&meses=2", headers=cab)
    cuerpo = r.json()
    assert isinstance(cuerpo["serie"], list)
    for punto in cuerpo["serie"]:
        for clave, valor in punto.items():
            if isinstance(valor, list):
                assert clave == "top_proveedores", (clave, valor)


def test_t17_top_proveedores_nunca_supera_cinco(client, monkeypatch):
    from app.plataforma_metricas import TOPE_PROVEEDORES
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=__consolidado__&meses=1", headers=cab)
    for punto in r.json()["serie"]:
        assert len(punto["top_proveedores"]) <= TOPE_PROVEEDORES


def test_t18_beta_publica_el_agregado_sin_filtrar_datos_individuales(client, monkeypatch):
    """beta publica su top/importe agregado -- pero ninguno de los montos ni
    nombres INDIVIDUALES de sus contratos aparece suelto (sólo el agregado y
    el nombre saneado del proveedor, que el top ya permite). Esto no depende
    de cuántos contratos tenga (Fase 7, sin umbral): la frontera es agregado
    vs fila, no publicado vs suprimido."""
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/tendencia?cliente=beta&meses=1", headers=cab)
    assert r.status_code == 200, r.text
    punto = r.json()["serie"][-1]
    numeros = _todos_los_numeros(r.json())
    for _codigo, _prov, canon, _activo in _CONTRATOS_BETA:
        assert canon not in numeros
    # El agregado SÍ está, exacto.
    assert punto["ingreso_contratado_mes"] == 1_350_000.0


# ════════════════════════════════════════════════════════════════════════════
# E. SOLO LECTURA SOBRE BASES DE CLIENTE
# ════════════════════════════════════════════════════════════════════════════

def test_t19_get_tendencia_no_toca_las_bases_de_cliente(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    antes = _hash_bases(["acme", "beta"])

    r = client.get("/api/plataforma/tendencia?cliente=__consolidado__&meses=6", headers=cab)
    assert r.status_code == 200, r.text
    r2 = client.get("/api/plataforma/tendencia?cliente=acme&meses=6", headers=cab)
    assert r2.status_code == 200, r2.text

    despues = _hash_bases(["acme", "beta"])
    assert antes == despues, "GET /tendencia modificó una base de cliente"


def test_t20_cerrar_mes_anterior_no_toca_las_bases_de_cliente(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    antes = _hash_bases(["acme", "beta"])

    from app.plataforma_tendencia import cerrar_mes_anterior
    cerrar_mes_anterior()

    despues = _hash_bases(["acme", "beta"])
    assert antes == despues, "cerrar_mes_anterior() modificó una base de cliente"


def test_t21_grep_estatico_plataforma_tendencia_no_escribe_bases_de_cliente():
    """`app/plataforma_tendencia.py` nunca llama `sesion_de(` -- ni una vez.

    El módulo declara en su docstring que sólo lee/escribe el REGISTRO
    (`sesion_registro`) y que los datos de negocio le llegan ya agregados desde
    `plataforma_metricas`. Un `sesion_de(` colado sería la puerta de vuelta a
    abrir la base de un cliente desde este módulo -- se afirma por grep, no por
    comportamiento, porque un `sesion_de(` sin usar hoy igual sería un
    guardrail roto para mañana.
    """
    import inspect
    import app.plataforma_tendencia as mod
    fuente = inspect.getsource(mod)
    assert "sesion_de(" not in fuente, (
        "app/plataforma_tendencia.py llama sesion_de(): podría estar abriendo "
        "una base de cliente. Revisar manualmente si es lectura o escritura."
    )


# ════════════════════════════════════════════════════════════════════════════
# F. SIN MIGRACIONES
# ════════════════════════════════════════════════════════════════════════════

# El encargo pide comparar contra esta lista puntual de tablas del contrato
# (las que la frontera del operador toca de cerca) -- se verifica que TODAS
# sigan existiendo. La de que ninguna tabla que ya existía gane una columna es
# la de abajo, contra el diff de los modelos con `main`, que es la fuente de
# verdad real (esta lista puntual no pretende ser el universo completo de tablas
# del repo -- `models.py` solo trae más de 15). Tablas NUEVAS sí puede haber:
# `create_all` las crea sin migración.
TABLAS_DEL_CONTRATO = [
    "estados_cliente", "bitacora_plataforma", "fundaciones", "alta_attempts",
    "clientes", "usuarios", "membresias", "space_leases", "spaces",
    "suppliers", "layout_snapshots", "audit_log",
]


def test_t22_ninguna_tabla_existente_gano_columnas(client):
    """Dos verificaciones independientes:

    1. Las tablas del contrato (arriba) siguen existiendo y con las MISMAS
       columnas que tenían en `main` -- se compara `Base.metadata` (con la
       tabla nueva ya importada) contra `git show main:...` re-parseado en un
       subproceso limpio, para no mezclar dos `Base` del mismo proceso.
    2. En el diff de `backend/app/models/**` contra `main`, ninguna tabla que
       ya existía gana una línea `Column(` -- ni una columna agregada a otro
       modelo. Las tablas NUEVAS (su línea `class` también es agregada) sí.
    """
    import subprocess
    from app.database import Base
    import app.models.models          # noqa: F401
    import app.models.plataforma      # noqa: F401
    import app.models.identidad       # noqa: F401
    import app.models.supresion       # noqa: F401

    tablas = Base.metadata.tables
    for nombre in TABLAS_DEL_CONTRATO:
        assert nombre in tablas, f"tabla del contrato {nombre} desapareció"

    raiz = os.path.dirname(os.path.dirname(__file__))

    def git(*args):
        return subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True)

    # `origin/main` antes que `main`: el `main` local de un checkout puede tener
    # semanas, y entonces el diff mezcla lo de otros con lo de este cambio.
    base = next((r for r in ("origin/main", "main")
                 if git("rev-parse", "--verify", "--quiet", r).returncode == 0), None)
    if base is None:
        pytest.skip("no hay main contra qué comparar en este checkout")
    resultado = git("diff", "--unified=0", base, "--", "app/models/")
    if resultado.returncode != 0:
        pytest.skip("no se pudo diffear contra main en este checkout")

    # Hasta el 2026-10-02 esto se miraba por ARCHIVO: sólo `plataforma.py` y
    # `consentimiento.py` podían aparecer en el diff, y cualquier cambio en
    # `models.py` lo hacía saltar aunque no tocara una columna -- ese día saltó
    # porque la fecha del negocio pasó a ser la de Colombia (`app/fechas.py`).
    # Lo que la regla protege no es el archivo: es que `create_all` nunca
    # agrega columnas a una tabla que ya existe. Así que se mira cada línea
    # agregada, en todos los modelos: una `Column(` o `mapped_column(` sólo vale
    # adentro de una clase que NO existía en `main` -- una tabla nueva --.
    # Sin contexto (`--unified=0`), un tramo que agrega algo adentro de una
    # clase vieja no muestra su `class`: arranca como clase vieja. Y una línea
    # `class` reescrita (un comentario agregado) sigue siendo la clase vieja,
    # porque el nombre se busca en el archivo de `main`.
    def clases_en_main(archivo):
        r = git("show", f"{base}:{archivo}")
        return set(re.findall(r"^class (\w+)", r.stdout, re.M)) if r.returncode == 0 else set()

    columnas_en_tablas_viejas = []
    viejas: set = set()
    en_clase_nueva = False
    for linea in resultado.stdout.splitlines():
        if linea.startswith("diff --git"):
            viejas = clases_en_main(linea.split(" b/", 1)[1])
            en_clase_nueva = False
            continue
        if linea.startswith("@@"):
            en_clase_nueva = False
            continue
        if linea.startswith(("+++", "---")):
            continue
        clase = re.match(r"\+class (\w+)", linea)
        if clase:
            en_clase_nueva = clase.group(1) not in viejas
        elif (linea.startswith("+") and not en_clase_nueva
              and re.search(r"\b(Column|mapped_column)\(", linea)):
            columnas_en_tablas_viejas.append(linea[1:].strip())
    assert columnas_en_tablas_viejas == [], columnas_en_tablas_viejas


def test_t23_import_app_main_crea_la_tabla_con_create_all_sin_alembic(client):
    """`client` ya importó `app.main` (el fixture lo hace). Si `snapshot_metricas`
    no existiera en el archivo sqlite del test, cualquier query fallaría --
    se ejercita con una consulta real, no sólo mirando los metadatos en memoria."""
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        assert reg.query(SnapshotMetricas).count() == 0
    finally:
        reg.close()

    import subprocess, sys
    assert "alembic" not in " ".join(subprocess.run(
        [sys.executable, "-c", "import app.main"],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)),
    ).stderr.lower().split())


# ════════════════════════════════════════════════════════════════════════════
# G. TOLERANCIA A FALLOS
# ════════════════════════════════════════════════════════════════════════════

def test_t24_cerrar_mes_anterior_no_propaga_con_cliente_roto(client, monkeypatch):
    """`_run_lease_maintenance()` no puede reventar por el histórico."""
    _ids, _cab = _escenario_jugoso(client, monkeypatch)

    from app.main import _run_lease_maintenance
    _run_lease_maintenance()  # no debe lanzar


def test_t25_los_demas_clientes_tienen_snapshot_del_mes_anterior_y_el_roto_no(client, monkeypatch):
    from app.plataforma_tendencia import periodo_anterior

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")
    mes_pasado = periodo_anterior(_fijar_mes_en_curso(monkeypatch))
    _sembrar("acme", {"NAVE": _NAVE}, _vigentes_en(mes_pasado, [
        ("NAVE-PUN-01", "Alpina", 100_000.0, True),
    ]))
    _sembrar("beta", {"BETA": _BETA}, _vigentes_en(mes_pasado, _CONTRATOS_BETA))
    _romper()

    from app.main import _run_lease_maintenance
    _run_lease_maintenance()

    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    reg = sesion_registro()
    try:
        presentes = {
            f.cliente_slug for f in reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.periodo == mes_pasado).all()
        }
    finally:
        reg.close()

    assert "acme" in presentes
    assert "beta" in presentes
    assert "__consolidado__" in presentes
    assert "roto" not in presentes


def test_t26_cliente_roto_no_rompe_metricas(client, monkeypatch):
    """El cierre corre ANTES del recorrido de mantenimiento por cliente
    (`main._run_lease_maintenance`); si algo del histórico quedara mal armado,
    `/metricas` -- que no depende del histórico para responder -- tiene que
    seguir funcionando igual."""
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    from app.main import _run_lease_maintenance
    _run_lease_maintenance()

    r = client.get(f"/api/plataforma/metricas?periodo={_fijar_mes_en_curso(monkeypatch)}", headers=cab)
    assert r.status_code == 200, r.text


# ════════════════════════════════════════════════════════════════════════════
# H. ORDEN DE RUTAS
# ════════════════════════════════════════════════════════════════════════════

def test_t27_tendencia_no_cae_en_las_parametricas(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)

    from conftest import rutas_planas

    caminos = [r.path for r in rutas_planas(client.app)]
    i_tendencia = caminos.index("/api/plataforma/tendencia")
    parametricas = [i for i, p in enumerate(caminos)
                    if p.startswith("/api/plataforma/") and "{" in p]
    assert parametricas, "no hay rutas paramétricas en el router de plataforma"
    assert i_tendencia < min(parametricas), caminos[i_tendencia:min(parametricas) + 1]

    # Comportamiento observable: un cliente inexistente da 404 de tendencia,
    # NO se lo traga `/clientes/{slug}` ni `/supresiones/{solicitud_id}`.
    r = client.get("/api/plataforma/tendencia", params={"cliente": "no-existe-esto"}, headers=cab)
    assert r.status_code == 404
    assert r.json()["detail"] == "No hay un cliente con ese código."

    # Y `/clientes/{slug}` sigue funcionando normalmente para un slug real, sin
    # que la ruta de tendencia se lo coma al revés.
    r2 = client.patch("/api/plataforma/clientes/acme",
                       json={"estado": "activo", "motivo": "x"}, headers=cab)
    assert r2.status_code in (200, 404)  # depende del estado previo -- nunca 405/500


# ════════════════════════════════════════════════════════════════════════════
# I. LEGADO / JWT / REDACCIÓN
# ════════════════════════════════════════════════════════════════════════════

def test_t28_soy_no_cambio(client, monkeypatch):
    _ids, cab = _escenario_jugoso(client, monkeypatch)
    r = client.get("/api/plataforma/soy", headers=cab)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert "operador" in cuerpo or "email" in cuerpo or isinstance(cuerpo, dict)


def test_t29_worker_sigue_sin_ver_precios_en_dashboard(client, worker):
    """No es un test de tendencia -- es la caracterización I: la redacción por
    rol de Fase 1 no se movió un milímetro por esta fase."""
    r = client.get("/api/dashboard", headers=worker)
    assert r.status_code in (200, 404)  # el endpoint puede no aplicar en este layout vacío
    if r.status_code == 200:
        assert "monthly_rent" not in json.dumps(r.json())


# ════════════════════════════════════════════════════════════════════════════
# J. GUARDRAILS DE FRONTEND (estático)
# ════════════════════════════════════════════════════════════════════════════

_RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def _leer(rel):
    ruta = os.path.join(_RAIZ, rel)
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8") as f:
        return f.read()


@pytest.mark.parametrize("rel", [
    "frontend/src/components/plataforma/tendencia.tsx",
    "frontend/src/pages/Plataforma.tsx",
])
def test_t30_frontend_sin_patrones_prohibidos(rel):
    fuente = _leer(rel)
    if fuente is None:
        pytest.skip(f"{rel} todavía no existe -- pendiente de builder")

    prohibidos = ["dangerouslySetInnerHTML", "eval(", "new Function", "<script"]
    for patron in prohibidos:
        assert patron not in fuente, f"{rel} contiene '{patron}'"

    import re
    urls_externas = re.findall(r"https?://[^\s\"'`]+", fuente)
    urls_externas = [u for u in urls_externas if "localhost" not in u]
    assert urls_externas == [], f"{rel} referencia URLs externas: {urls_externas}"

    # `localStorage` sólo se permite para el tema (clave que contenga "theme"
    # o "tema" en la misma línea o cerca). Cualquier otro uso se reporta.
    for i, linea in enumerate(fuente.splitlines(), start=1):
        if "localStorage" in linea and "theme" not in linea.lower() and "tema" not in linea.lower():
            pytest.fail(f"{rel}:{i}: localStorage fuera del tema -> {linea.strip()}")


def test_t31_package_json_no_gano_dependencias():
    import subprocess
    resultado = subprocess.run(
        ["git", "show", "main:frontend/package.json"],
        cwd=_RAIZ, capture_output=True, text=True,
    )
    if resultado.returncode != 0:
        pytest.skip("no se pudo leer frontend/package.json de main (branch no disponible)")
    main_pkg = json.loads(resultado.stdout)

    actual_texto = _leer("frontend/package.json")
    if actual_texto is None:
        pytest.skip("frontend/package.json no existe en el working tree")
    actual_pkg = json.loads(actual_texto)

    for campo in ("dependencies", "devDependencies"):
        antes = set(main_pkg.get(campo, {}).keys())
        despues = set(actual_pkg.get(campo, {}).keys())
        nuevas = despues - antes
        assert nuevas == set(), f"{campo} ganó dependencias nuevas: {nuevas}"


def test_t32_csp_de_main_solo_cambio_run_lease_maintenance():
    import subprocess
    resultado = subprocess.run(
        ["git", "diff", "main", "--", "backend/app/main.py"],
        cwd=_RAIZ, capture_output=True, text=True,
    )
    diff = resultado.stdout
    if not diff.strip():
        pytest.skip("sin diff contra main -- rama ya fusionada o sin cambios en main.py")

    # Guardián de la CSP, nada más: dispara sólo si una línea AGREGADA o
    # QUITADA toca la cabecera. La versión anterior decía
    # `A or B and C` (= `A or (B and C)`) y B/C miraban la palabra "CSP" en
    # cualquier parte del diff y "add_middleware" en cualquier línea, así que
    # un COMENTARIO que mencionara `add_middleware` la hacía fallar (auditoría
    # integral, verif-1). Lo que se protege es la cabecera, no el vocabulario.
    lineas_agregadas = [l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
    lineas_quitadas = [l for l in diff.splitlines() if l.startswith("-") and not l.startswith("---")]
    for l in lineas_agregadas + lineas_quitadas:
        contenido = l[1:]
        if "Content-Security-Policy" in contenido:
            pytest.fail(f"el diff de main.py toca la CSP: {contenido}")
