"""Fase 8: el detalle de negocio de un cliente, para la asesoría comercial.

``GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM`` es el acceso
más profundo que un operador puede hacer a los datos de un supermercado:
espacio por espacio, con el proveedor y el canon de cada contrato. Lo que se
prueba acá es exactamente eso y su frontera:

* los números contra datos sembrados a mano —cada espacio con su tipo, su
  estado y su contrato, el resumen por tipo, los proveedores, los movimientos
  de 12 meses, las oportunidades y las recomendaciones—, todos calculados a
  mano en los comentarios de abajo;
* lo que el JSON NO puede contener: el correo, el teléfono, el ``contact_name``
  y las ``notes`` sembradas en ``suppliers`` / ``spaces`` / ``space_leases``,
  ningún id de fila, ninguna tarifa que no sea el sí/no;
* que el endpoint no escribe una sola fila en la base del cliente;
* la puerta (401/403/404/422/503), la bitácora y el orden de rutas.

Mismo andamiaje que ``test_plataforma_metricas.py`` (verificador falso por
``dependency_overrides``, ``OPERADOR_EMAILS`` por ``monkeypatch``, todo
``import app.*`` ADENTRO de las funciones): cada archivo de pruebas se sostiene
solo.
"""
import hashlib
import json
from datetime import date
from types import SimpleNamespace

import pytest

from conftest import SEPTIEMBRE_DE_2026

# ─── Datos sembrados ─────────────────────────────────────────────────────────
#
# Cliente `detcli`, período 2026-09 (2026-09-01 .. 2026-09-30):
#
#   sede NAVE  GON-01  góndola DOBLE  -> NAVE-GON-01 (cara A) + NAVE-GON-01-B
#              PUN-01  punta          -> NAVE-PUN-01
#              NEV-01  nevera         -> NAVE-NEV-01
#   sede SUR   PUN-01  punta          -> SUR-PUN-01
#
#   => 2 sedes con plano, 5 espacios comercializables.
#
#   Contratos del período (3):
#     NAVE-GON-01    Alpina    2026-01-01..2026-12-31   1.000.000  -> ocupado
#     NAVE-GON-01-B  Alpina    2026-09-15..2026-11-30     600.000  -> ARRANCA en el período
#     NAVE-PUN-01    Nutresa   2026-05-01..2026-09-20   2.000.000  -> SE LIBERA en el período
#   Fuera del período (histórico, pero vivo para movimientos y "desde"):
#     SUR-PUN-01     Alpina    2025-06-01..2025-12-31     800.000  (vencido)
#     NAVE-NEV-01    Bimbo     2026-03-01..2026-08-31     300.000  (CANCELADO)
#
#   Ingreso del período = 3.600.000. Alpina 2 de 3 contratos = 66,7 %.

PERIODO = "2026-09"
# Los datos son de ese mes y se piden por la API, que sólo acepta los últimos
# 24: estas pruebas corren con el reloj ahí (`conftest.SEPTIEMBRE_DE_2026`).
pytestmark = SEPTIEMBRE_DE_2026

# Un proveedor con el contacto metido adentro del nombre: es texto libre que
# teclea el supermercado y es el único string de negocio que sale al JSON.
CORREO_SEMBRADO = "ventas@nutresa.com.co"
TELEFONO_SEMBRADO = "300 555 8899"
NUTRESA_CRUDO = f"Nutresa {CORREO_SEMBRADO} {TELEFONO_SEMBRADO}"
NUTRESA = "Nutresa [correo oculto] [teléfono oculto]"

CONTACTO_SEMBRADO = "Juan Pérez Contacto"
NOTA_SEMBRADA = "NOTA-SECRETA-DEL-CLIENTE"

_NAVE = [
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE",
     "w": 3.0, "d": 1.0},
    {"code": "PUN-01", "type": "punta", "sede": "NAVE", "w": 2.0, "d": 1.5},
    {"code": "NEV-01", "type": "nevera_refrescos", "sede": "NAVE"},
]
_SUR = [{"code": "PUN-01", "type": "punta", "sede": "SUR", "w": 2.0, "d": 2.0}]

# (codigo, proveedor, marca, desde, hasta, canon, is_active)
_CONTRATOS = [
    ("NAVE-GON-01", "Alpina", "Alpina Kids", "2026-01-01", "2026-12-31", 1_000_000.0, True),
    ("NAVE-GON-01-B", "Alpina", None, "2026-09-15", "2026-11-30", 600_000.0, True),
    ("NAVE-PUN-01", NUTRESA_CRUDO, "Doria", "2026-05-01", "2026-09-20", 2_000_000.0, True),
    ("SUR-PUN-01", "Alpina", None, "2025-06-01", "2025-12-31", 800_000.0, True),
    ("NAVE-NEV-01", "Bimbo", None, "2026-03-01", "2026-08-31", 300_000.0, False),
]

# La cara B lleva fila en `spaces` con área 0 y zona vacía: el área sale
# entonces de la HUELLA del mueble (3,0 × 1,0 = 3,0) y la zona queda en null.
_ESPACIOS_EXTRA = {
    "NAVE-GON-01-B": ("", 0.0),
    "NAVE-GON-01": ("Pasillo central", 4.5),
}

# El otro cliente de la plataforma: sólo neveras, para que el benchmark de ese
# tipo (que `detcli` no tiene contratado) sea un número calculable a mano.
_BENCH = [
    {"code": "NEV-01", "type": "nevera_refrescos", "sede": "BEN"},
    {"code": "NEV-02", "type": "nevera_refrescos", "sede": "BEN"},
]
_CONTRATOS_BENCH = [
    ("BEN-NEV-01", "Colanta", None, "2026-09-01", "2026-09-30", 300_000.0, True),
    ("BEN-NEV-02", "Colanta", None, "2026-09-01", "2026-09-30", 500_000.0, True),
]
BENCH_NEVERA = 400_000.0          # (300.000 + 500.000) / 2
BENCH_GONDOLA = 800_000.0         # (1.000.000 + 600.000) / 2, de detcli
BENCH_PUNTA = 2_000_000.0         # el único contrato de punta de la plataforma

INGRESO = 3_600_000.0

CLAVES_NIVEL1 = {
    "cliente", "periodo", "desde", "hasta", "generado_en", "sedes_con_plano",
    "sedes", "espacios", "contratos_fuera_del_plano", "resumen_por_tipo",
    "proveedores", "movimientos", "benchmark_plataforma", "oportunidades",
    "recomendaciones",
}
CLAVES_CLIENTE = {"slug", "nombre", "estado_cuenta"}
CLAVES_SEDE = {"sede", "espacios", "ocupados", "libres", "ocupacion_pct"}
CLAVES_ESPACIO = {
    "codigo", "sede", "codigo_corto", "cara", "tipo", "zona", "area_m2",
    "estado", "contrato",
}
CLAVES_CONTRATO = {
    "proveedor", "marca", "canon_mensual", "inicio", "fin", "dias_para_vencer",
    "arranca_en_periodo",
}
CLAVES_RESUMEN = {
    "tipo", "total", "ocupados", "libres", "canon_promedio", "canon_minimo",
    "canon_maximo", "tarifa_configurada",
}
CLAVES_PROVEEDOR = {
    "nombre", "espacios", "tipos", "sedes", "canon_total", "canon_promedio",
    "participacion_pct", "desde", "contratos_por_vencer_60d",
}
CLAVES_MOVIMIENTO = {"mes", "entradas", "salidas"}
CLAVES_ENTRADA = {"proveedor", "codigo", "tipo", "canon_mensual", "fecha", "cancelado"}
CLAVES_SALIDA = {"proveedor", "codigo", "tipo", "canon_mensual", "fecha", "motivo"}
CLAVES_OPORTUNIDAD = {
    "codigo", "sede", "tipo", "estado", "precio_sugerido", "origen_precio",
    "valor_estimado_mensual", "candidatos",
}
CLAVES_CANDIDATO = {"proveedor", "canon_actual", "mismo_tipo"}
CLAVES_RECOMENDACION = {
    "id", "tipo", "prioridad", "valor_estimado_mensual", "explicacion", "datos",
}

# Ninguna de éstas puede aparecer como CLAVE en ningún nivel del JSON: filas de
# negocio, datos de contacto del proveedor, notas o la tarifa de referencia.
CLAVES_PROHIBIDAS = {
    "contact_name", "phone", "email", "notes", "notas", "tarifa", "rates",
    "by_sede", "default", "space_id", "lease_id", "supplier_id", "id_espacio",
    "svg_id", "foto", "observation", "supplierName", "negotiatedValue",
}


# ─── Andamiaje ───────────────────────────────────────────────────────────────

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
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías."""
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _sembrar(slug, sedes: dict, contratos: list, espacios_extra: dict | None = None):
    """Layout + espacios + proveedores + contratos en la base DEL CLIENTE.

    Siembra A PROPÓSITO todo lo que el JSON no puede devolver: el
    ``contact_name``, el ``phone``, el ``email`` y las ``notes`` del proveedor,
    las ``notes`` del espacio y las del contrato. Es lo único de este archivo
    que escribe en una base de negocio: el endpoint que se prueba no escribe
    nunca.
    """
    from app.clientes import buscar, sesion_de
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    extra = espacios_extra or {}
    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        for sede, fixtures in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures)))
        db.flush()

        proveedores: dict = {}
        espacios: dict = {}
        for codigo, proveedor, marca, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
                fila = Supplier(
                    name=proveedor,
                    contact_name=CONTACTO_SEMBRADO,
                    phone="3005558899",
                    email="contacto@proveedor.example",
                    notes=NOTA_SEMBRADA,
                )
                db.add(fila)
                db.flush()
                proveedores[proveedor] = fila
            if codigo not in espacios:
                espacio = db.query(Space).filter(Space.code == codigo).first()
                if espacio is None:
                    zona, area = extra.get(codigo, ("Zona", 5.0))
                    espacio = Space(
                        code=codigo, svg_id=f"svg-{codigo}", name=codigo,
                        zone=zona, sede=codigo.split("-")[0], area_m2=area,
                        notes=NOTA_SEMBRADA,
                    )
                    db.add(espacio)
                    db.flush()
                espacios[codigo] = espacio
            db.add(SpaceLease(
                space_id=espacios[codigo].id,
                supplier_id=proveedores[proveedor].id,
                marca=marca,
                start_date=date.fromisoformat(ini),
                end_date=date.fromisoformat(fin),
                monthly_rent=canon,
                is_active=activo,
                notes=NOTA_SEMBRADA,
            ))
        db.commit()
    finally:
        db.close()


def _romper(slug="detroto", nombre="Det Roto"):
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
    return ruta


def _limpiar_caches():
    from app.plataforma_detalle import limpiar_cache_detalle
    from app.plataforma_estado import limpiar_cache_estado
    from app.plataforma_metricas import limpiar_cache_metricas

    limpiar_cache_metricas()
    limpiar_cache_detalle()
    limpiar_cache_estado()


def _escenario(client, monkeypatch):
    """`detcli` (la siembra de la spec) + `detbench` (sólo neveras) + operador."""
    ids = Identidades(client)
    _fundar(ids, "uid-detcli", "duena@detcli.co", "detcli", "Detalle Cliente")
    _fundar(ids, "uid-detbench", "dueno@detbench.co", "detbench", "Detalle Bench")
    _sembrar("detcli", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS, _ESPACIOS_EXTRA)
    _sembrar("detbench", {"BEN": _BENCH}, _CONTRATOS_BENCH)
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()
    return ids, cab_op


def _pedir(client, cab, slug="detcli", periodo=PERIODO):
    url = f"/api/plataforma/clientes/{slug}/detalle"
    if periodo is not None:
        url += f"?periodo={periodo}"
    return client.get(url, headers=cab)


def _detalle(client, cab, slug="detcli", periodo=PERIODO):
    r = _pedir(client, cab, slug, periodo)
    assert r.status_code == 200, r.text
    return r.json()


def _espacio(cuerpo, codigo):
    return next(e for e in cuerpo["espacios"] if e["codigo"] == codigo)


def _por(lista, clave, valor):
    return next(x for x in lista if x[clave] == valor)


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


def _claves(nodo):
    """Todas las claves de todos los objetos del JSON, a cualquier nivel."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield k
            yield from _claves(v)
    elif isinstance(nodo, list):
        for v in nodo:
            yield from _claves(v)


def _textos(cuerpo):
    return [v for v in _hojas(cuerpo) if isinstance(v, str)]


# ════════════════════════════════════════════════════════════════════════════
# (1) Cada espacio, con su tipo, su estado y su contrato
# ════════════════════════════════════════════════════════════════════════════

def test_cabecera_y_orden_de_los_espacios(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)

    assert set(cuerpo.keys()) == CLAVES_NIVEL1
    assert cuerpo["cliente"] == {
        "slug": "detcli", "nombre": "Detalle Cliente", "estado_cuenta": "activo",
    }
    assert cuerpo["periodo"] == PERIODO
    assert cuerpo["desde"] == "2026-09-01"
    assert cuerpo["hasta"] == "2026-09-30"
    assert cuerpo["generado_en"].endswith("Z")
    assert cuerpo["sedes_con_plano"] == 2
    # Orden: sede, y dentro de la sede el código completo.
    assert [e["codigo"] for e in cuerpo["espacios"]] == [
        "NAVE-GON-01", "NAVE-GON-01-B", "NAVE-NEV-01", "NAVE-PUN-01", "SUR-PUN-01",
    ]
    for e in cuerpo["espacios"]:
        assert set(e.keys()) == CLAVES_ESPACIO
        if e["contrato"] is not None:
            assert set(e["contrato"].keys()) == CLAVES_CONTRATO


def test_la_cara_A_de_la_gondola_doble(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    e = _espacio(_detalle(client, cab), "NAVE-GON-01")

    assert e["sede"] == "NAVE"
    assert e["codigo_corto"] == "GON-01"
    assert e["cara"] == "A"
    assert e["tipo"] == "gondola"
    assert e["zona"] == "Pasillo central"
    assert e["area_m2"] == 4.5
    assert e["estado"] == "ocupado"
    assert e["contrato"] == {
        "proveedor": "Alpina",
        "marca": "Alpina Kids",
        "canon_mensual": 1_000_000.0,
        "inicio": "2026-01-01",
        "fin": "2026-12-31",
        # 2026-12-31 menos el primer día del período.
        "dias_para_vencer": 121,
        "arranca_en_periodo": False,
    }


def test_la_cara_B_hereda_tipo_y_area_del_mueble(client, monkeypatch):
    """La cara B es el mismo mueble: mismo tipo y misma huella.

    Su fila en ``spaces`` se sembró sin zona y con área 0 —lo que deja el alta
    de un contrato sobre una cara que nadie midió—, así que el área sale de la
    huella del fixture (3,0 × 1,0) y la zona queda en ``null``.
    """
    _ids, cab = _escenario(client, monkeypatch)
    e = _espacio(_detalle(client, cab), "NAVE-GON-01-B")

    assert e["codigo_corto"] == "GON-01"
    assert e["cara"] == "B"
    assert e["tipo"] == "gondola"
    assert e["zona"] is None
    assert e["area_m2"] == 3.0
    assert e["estado"] == "ocupado"
    assert e["contrato"]["canon_mensual"] == 600_000.0
    assert e["contrato"]["inicio"] == "2026-09-15"
    assert e["contrato"]["arranca_en_periodo"] is True
    assert e["contrato"]["marca"] is None


def test_el_contrato_que_vence_dentro_del_periodo_se_libera(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    e = _espacio(_detalle(client, cab), "NAVE-PUN-01")

    assert e["tipo"] == "punta"
    assert e["cara"] is None
    assert e["estado"] == "se_libera"
    assert e["contrato"]["fin"] == "2026-09-20"
    assert e["contrato"]["dias_para_vencer"] == 19
    assert e["contrato"]["canon_mensual"] == 2_000_000.0


def test_el_nombre_del_proveedor_sale_enmascarado(client, monkeypatch):
    """El correo y el teléfono que el supermercado tecleó ADENTRO del nombre."""
    from app.plataforma_metricas import MASCARA_CORREO, MASCARA_TELEFONO

    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)
    nombre = _espacio(cuerpo, "NAVE-PUN-01")["contrato"]["proveedor"]

    assert nombre == NUTRESA
    assert MASCARA_CORREO in nombre and MASCARA_TELEFONO in nombre
    assert CORREO_SEMBRADO not in json.dumps(cuerpo, ensure_ascii=False)
    assert TELEFONO_SEMBRADO not in json.dumps(cuerpo, ensure_ascii=False)


def test_los_espacios_libres_no_traen_contrato(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)

    for codigo in ("NAVE-NEV-01", "SUR-PUN-01"):
        e = _espacio(cuerpo, codigo)
        assert e["estado"] == "libre", codigo
        assert e["contrato"] is None, codigo
    # El contrato CANCELADO de la nevera no la ocupa: `is_active=False` es lo
    # que dice que alguien lo dio de baja, y las fechas por sí solas no bastan.
    assert _espacio(cuerpo, "NAVE-NEV-01")["tipo"] == "nevera_refrescos"


# ════════════════════════════════════════════════════════════════════════════
# (2) y (3) Resumen por tipo, sedes y contratos fuera del plano
# ════════════════════════════════════════════════════════════════════════════

def test_resumen_por_tipo_cuadra_a_mano(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    resumen = _detalle(client, cab)["resumen_por_tipo"]

    assert [r["tipo"] for r in resumen] == ["gondola", "nevera_refrescos", "punta"]
    for r in resumen:
        assert set(r.keys()) == CLAVES_RESUMEN
        assert r["ocupados"] + r["libres"] == r["total"]

    assert _por(resumen, "tipo", "gondola") == {
        "tipo": "gondola", "total": 2, "ocupados": 2, "libres": 0,
        "canon_promedio": 800_000.0, "canon_minimo": 600_000.0,
        "canon_maximo": 1_000_000.0, "tarifa_configurada": False,
    }
    assert _por(resumen, "tipo", "punta") == {
        "tipo": "punta", "total": 2, "ocupados": 1, "libres": 1,
        "canon_promedio": 2_000_000.0, "canon_minimo": 2_000_000.0,
        "canon_maximo": 2_000_000.0, "tarifa_configurada": False,
    }
    # Sin un solo contrato de ese tipo: no hay promedio de cero términos.
    assert _por(resumen, "tipo", "nevera_refrescos")["canon_promedio"] is None
    assert _por(resumen, "tipo", "nevera_refrescos")["canon_minimo"] is None


def test_sedes_con_su_ocupacion(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)

    assert cuerpo["sedes"] == [
        {"sede": "NAVE", "espacios": 4, "ocupados": 3, "libres": 1, "ocupacion_pct": 75.0},
        {"sede": "SUR", "espacios": 1, "ocupados": 0, "libres": 1, "ocupacion_pct": 0.0},
    ]
    for s in cuerpo["sedes"]:
        assert set(s.keys()) == CLAVES_SEDE
    assert cuerpo["contratos_fuera_del_plano"] == 0


def test_contrato_sin_mueble_en_el_plano_no_es_un_espacio(client, monkeypatch):
    """Cuenta en ``contratos_fuera_del_plano``, en proveedores y en la
    recomendación de vencimiento —la plata existe—, pero no inventa un espacio.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-detf", "duena@detf.co", "detfuera", "Detalle Fuera")
    _sembrar(
        "detfuera",
        {"UNO": [{"code": "PUN-01", "type": "punta", "sede": "UNO"}]},
        [
            ("UNO-PUN-01", "Alpina", None, "2026-09-01", "2026-12-31", 1_000_000.0, True),
            ("FANTASMA-01", "Bimbo", None, "2026-01-01", "2026-09-30", 400_000.0, True),
        ],
    )
    cab = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()

    cuerpo = _detalle(client, cab, "detfuera")
    assert [e["codigo"] for e in cuerpo["espacios"]] == ["UNO-PUN-01"]
    assert cuerpo["contratos_fuera_del_plano"] == 1
    assert [r["tipo"] for r in cuerpo["resumen_por_tipo"]] == ["punta"]
    assert [o["codigo"] for o in cuerpo["oportunidades"]] == []

    bimbo = _por(cuerpo["proveedores"], "nombre", "Bimbo")
    assert bimbo["tipos"] == ["fuera_del_plano"]
    assert bimbo["sedes"] == []          # un contrato sin mueble no tiene sede
    assert bimbo["espacios"] == 1

    por_vencer = _por(cuerpo["recomendaciones"], "id", "contrato_por_vencer:FANTASMA-01")
    assert por_vencer["datos"]["tipo"] == "fuera_del_plano"
    assert por_vencer["datos"]["dias_para_vencer"] == 29


# ════════════════════════════════════════════════════════════════════════════
# (4) Proveedores
# ════════════════════════════════════════════════════════════════════════════

def test_proveedores_con_desde_participacion_y_por_vencer(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    proveedores = _detalle(client, cab)["proveedores"]

    for p in proveedores:
        assert set(p.keys()) == CLAVES_PROVEEDOR
    # Orden: canon total descendente.
    assert [p["nombre"] for p in proveedores] == [NUTRESA, "Alpina"]

    assert _por(proveedores, "nombre", "Alpina") == {
        "nombre": "Alpina",
        "espacios": 2,
        "tipos": ["gondola"],
        "sedes": ["NAVE"],
        "canon_total": 1_600_000.0,
        "canon_promedio": 800_000.0,
        "participacion_pct": 66.7,          # 2 de 3 contratos del período
        # El primer contrato de la relación, aunque esté vencido hace nueve
        # meses: la antigüedad no empieza el día del contrato vigente.
        "desde": "2025-06-01",
        "contratos_por_vencer_60d": 0,
    }
    assert _por(proveedores, "nombre", NUTRESA) == {
        "nombre": NUTRESA,
        "espacios": 1,
        "tipos": ["punta"],
        "sedes": ["NAVE"],
        "canon_total": 2_000_000.0,
        "canon_promedio": 2_000_000.0,
        "participacion_pct": 33.3,
        "desde": "2026-05-01",
        "contratos_por_vencer_60d": 1,      # vence el 20 de septiembre
    }


# ════════════════════════════════════════════════════════════════════════════
# (5) Movimientos
# ════════════════════════════════════════════════════════════════════════════

def test_movimientos_doce_meses_con_entrada_vencimiento_y_cancelacion(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    movimientos = _detalle(client, cab)["movimientos"]

    assert [m["mes"] for m in movimientos] == [
        "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]
    for m in movimientos:
        assert set(m.keys()) == CLAVES_MOVIMIENTO
        for e in m["entradas"]:
            assert set(e.keys()) == CLAVES_ENTRADA
        for s in m["salidas"]:
            assert set(s.keys()) == CLAVES_SALIDA

    septiembre = _por(movimientos, "mes", "2026-09")
    assert septiembre["entradas"] == [{
        "proveedor": "Alpina", "codigo": "NAVE-GON-01-B", "tipo": "gondola",
        "canon_mensual": 600_000.0, "fecha": "2026-09-15", "cancelado": False,
    }]
    assert septiembre["salidas"] == [{
        "proveedor": NUTRESA, "codigo": "NAVE-PUN-01", "tipo": "punta",
        "canon_mensual": 2_000_000.0, "fecha": "2026-09-20", "motivo": "vencimiento",
    }]

    # La cancelación: `is_active=False` con la fecha de fin intacta es lo único
    # que el modelo guarda de una baja (no hay tabla de cancelaciones).
    agosto = _por(movimientos, "mes", "2026-08")
    assert agosto["entradas"] == []
    assert agosto["salidas"] == [{
        "proveedor": "Bimbo", "codigo": "NAVE-NEV-01", "tipo": "nevera_refrescos",
        "canon_mensual": 300_000.0, "fecha": "2026-08-31", "motivo": "cancelacion",
    }]
    assert _por(movimientos, "mes", "2026-03")["entradas"] == [{
        "proveedor": "Bimbo", "codigo": "NAVE-NEV-01", "tipo": "nevera_refrescos",
        "canon_mensual": 300_000.0, "fecha": "2026-03-01", "cancelado": True,
    }]
    # El contrato que arrancó en junio de 2025 queda FUERA de la ventana de 12
    # meses; su vencimiento de diciembre, adentro.
    assert _por(movimientos, "mes", "2025-12")["salidas"][0]["codigo"] == "SUR-PUN-01"


# ════════════════════════════════════════════════════════════════════════════
# (6) Oportunidades y benchmark
# ════════════════════════════════════════════════════════════════════════════

def test_benchmark_es_un_numero_por_tipo(client, monkeypatch):
    """Promedio de TODOS los clientes legibles, sin desglose ni nombres."""
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)

    assert cuerpo["benchmark_plataforma"] == {
        "gondola": BENCH_GONDOLA,
        "nevera_refrescos": BENCH_NEVERA,
        "punta": BENCH_PUNTA,
    }
    # Ni el otro cliente ni su proveedor aparecen por ningún lado.
    crudo = json.dumps(cuerpo, ensure_ascii=False)
    assert "detbench" not in crudo
    assert "Colanta" not in crudo
    assert "BEN-" not in crudo


def test_oportunidades_precio_del_cliente_y_candidatos(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    oportunidades = _detalle(client, cab)["oportunidades"]

    for o in oportunidades:
        assert set(o.keys()) == CLAVES_OPORTUNIDAD
        for c in o["candidatos"]:
            assert set(c.keys()) == CLAVES_CANDIDATO
            assert len(o["candidatos"]) <= 3
    # Orden: valor estimado descendente, luego código.
    assert [o["codigo"] for o in oportunidades] == [
        "NAVE-PUN-01", "SUR-PUN-01", "NAVE-NEV-01",
    ]

    sur = _por(oportunidades, "codigo", "SUR-PUN-01")
    assert sur["estado"] == "libre"
    assert sur["precio_sugerido"] == 2_000_000.0    # el promedio de puntas del cliente
    assert sur["origen_precio"] == "cliente"
    assert sur["valor_estimado_mensual"] == 2_000_000.0
    # Primero el que ya compra puntas, después el resto; dentro de cada grupo,
    # el que más canon promedio paga hoy.
    assert sur["candidatos"] == [
        {"proveedor": NUTRESA, "canon_actual": 2_000_000.0, "mismo_tipo": True},
        {"proveedor": "Alpina", "canon_actual": 800_000.0, "mismo_tipo": False},
    ]

    # El espacio que se libera: su ocupante actual NO es candidato a ocuparlo.
    nave = _por(oportunidades, "codigo", "NAVE-PUN-01")
    assert nave["estado"] == "se_libera"
    assert [c["proveedor"] for c in nave["candidatos"]] == ["Alpina"]


def test_oportunidad_de_un_tipo_que_el_cliente_no_cobra_usa_el_benchmark(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    nevera = _por(_detalle(client, cab)["oportunidades"], "codigo", "NAVE-NEV-01")

    # `detcli` no tiene un solo contrato de nevera: el precio sale del promedio
    # de la plataforma, que es el de `detbench` — (300.000 + 500.000) / 2.
    assert nevera["precio_sugerido"] == BENCH_NEVERA
    assert nevera["origen_precio"] == "benchmark"
    assert nevera["valor_estimado_mensual"] == BENCH_NEVERA
    assert [c["mismo_tipo"] for c in nevera["candidatos"]] == [False, False]


# ════════════════════════════════════════════════════════════════════════════
# (7) Recomendaciones
# ════════════════════════════════════════════════════════════════════════════

def test_recomendaciones_de_la_siembra_ordenadas_por_prioridad_y_valor(client, monkeypatch):
    """Las siete que salen de la siembra, en el orden en que se leen.

    Ingreso contratado del período = 3.600.000 -> alta desde 540.000 (15 %),
    media desde 180.000 (5 %).
    """
    _ids, cab = _escenario(client, monkeypatch)
    recomendaciones = _detalle(client, cab)["recomendaciones"]

    for r in recomendaciones:
        assert set(r.keys()) == CLAVES_RECOMENDACION

    assert [(r["id"], r["prioridad"], r["valor_estimado_mensual"]) for r in recomendaciones] == [
        ("espacio_libre:punta", "alta", 4_000_000.0),            # 2 puntas × 2.000.000
        ("contrato_por_vencer:NAVE-PUN-01", "alta", 2_000_000.0),  # vence en 19 días
        ("sede_subutilizada:SUR", "alta", 2_000_000.0),
        ("concentracion_proveedor:Alpina", "alta", 1_600_000.0),   # 66,7 % >= 60
        ("espacio_libre:nevera_refrescos", "media", BENCH_NEVERA),
        ("precio_bajo_tarifa:gondola", "media", 200_000.0),
        ("sin_tarifa:todos", "baja", 0.0),
    ]


def test_los_datos_que_sustentan_cada_recomendacion(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    recomendaciones = _detalle(client, cab)["recomendaciones"]

    punta = _por(recomendaciones, "id", "espacio_libre:punta")
    assert punta["datos"] == {
        "tipo": "punta",
        "espacios": ["NAVE-PUN-01", "SUR-PUN-01"],
        "libres": 2,
        "precio_sugerido": 2_000_000.0,
        "origen_precio": "cliente",
        "candidatos": [{"proveedor": "Alpina", "canon_actual": 800_000.0, "mismo_tipo": False}],
    }

    vence = _por(recomendaciones, "id", "contrato_por_vencer:NAVE-PUN-01")
    assert vence["datos"] == {
        "codigo": "NAVE-PUN-01", "tipo": "punta", "proveedor": NUTRESA,
        "canon_mensual": 2_000_000.0, "fin": "2026-09-20", "dias_para_vencer": 19,
    }

    # El promedio del propio cliente para ese tipo, nunca la tarifa de
    # referencia: 600.000 está 200.000 por debajo de 800.000.
    bajo = _por(recomendaciones, "id", "precio_bajo_tarifa:gondola")
    assert bajo["datos"] == {
        "tipo": "gondola", "canon_promedio": 800_000.0, "contratos_bajo_promedio": 1,
        "codigos": ["NAVE-GON-01-B"], "brecha_total": 200_000.0,
    }

    concentracion = _por(recomendaciones, "id", "concentracion_proveedor:Alpina")
    assert concentracion["datos"] == {
        "proveedor": "Alpina", "contratos": 2, "contratos_activos_total": 3,
        "participacion_pct": 66.7, "canon_total": 1_600_000.0,
    }

    sede = _por(recomendaciones, "id", "sede_subutilizada:SUR")
    assert sede["datos"] == {
        "sede": "SUR", "ocupacion_pct": 0.0, "ocupacion_promedio_cliente_pct": 60.0,
        "libres": 1, "espacios_libres": ["SUR-PUN-01"],
    }

    sin_tarifa = _por(recomendaciones, "id", "sin_tarifa:todos")
    assert sin_tarifa["datos"] == {"tipos": ["gondola", "nevera_refrescos", "punta"]}


def test_las_explicaciones_son_texto_corto_sin_PII(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    recomendaciones = _detalle(client, cab)["recomendaciones"]

    textos = {r["id"]: r["explicacion"] for r in recomendaciones}
    assert textos["espacio_libre:punta"] == (
        "2 espacio(s) de tipo punta libre(s) (NAVE-PUN-01, SUR-PUN-01): ofrecerlos a "
        "Alpina a unos $ 2.000.000 mensuales cada uno (promedio que ya cobra este "
        "cliente)."
    )
    assert textos["espacio_libre:nevera_refrescos"].endswith(
        "a unos $ 400.000 mensuales cada uno (promedio de la plataforma).")
    assert textos["contrato_por_vencer:NAVE-PUN-01"] == (
        f"El contrato de {NUTRESA} en NAVE-PUN-01 (punta) vence el 2026-09-20 "
        "(en 19 días): renovar o reasignar; canon en juego $ 2.000.000."
    )
    assert textos["precio_bajo_tarifa:gondola"] == (
        "1 contrato(s) de gondola cobran por debajo del promedio del cliente para ese "
        "tipo ($ 800.000): subir el canon en la próxima renovación; brecha $ 200.000 "
        "mensuales."
    )
    assert textos["concentracion_proveedor:Alpina"] == (
        "2 de 3 contratos activos (66.7 %) dependen de Alpina: diversificar; canon en "
        "juego $ 1.600.000."
    )
    assert textos["sede_subutilizada:SUR"] == (
        "SUR está al 0.0 % de ocupación, 60.0 puntos por debajo del promedio del "
        "cliente (60.0 %): concentrar la venta ahí; 1 espacios libres por $ 2.000.000 "
        "mensuales."
    )
    assert textos["sin_tarifa:todos"] == (
        "Sin tarifa de referencia para gondola, nevera_refrescos, punta: cargar "
        "tarifas para medir el spread."
    )

    for id_, texto in textos.items():
        assert "@" not in texto, id_
        assert "3005558899" not in texto.replace(" ", ""), id_
        assert CONTACTO_SEMBRADO not in texto, id_
        assert NOTA_SEMBRADA not in texto, id_


def test_cliente_sin_contratos_recibe_una_sola_recomendacion_de_arranque(client, monkeypatch):
    """Sin contratos no hay promedio propio, ni concentración, ni renovación:
    la única recomendación honesta es cuánto hay para vender."""
    ids = Identidades(client)
    _fundar(ids, "uid-detcli", "duena@detcli.co", "detcli", "Detalle Cliente")
    _fundar(ids, "uid-detbench", "dueno@detbench.co", "detbench", "Detalle Bench")
    _fundar(ids, "uid-detvac", "duena@detvac.co", "detvacio", "Detalle Vacío")
    _sembrar("detcli", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS, _ESPACIOS_EXTRA)
    _sembrar("detbench", {"BEN": _BENCH}, _CONTRATOS_BENCH)
    _sembrar("detvacio", {"VAC": [
        {"code": "PUN-01", "type": "punta", "sede": "VAC"},
        {"code": "NEV-01", "type": "nevera_refrescos", "sede": "VAC"},
    ]}, [])
    cab = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()

    cuerpo = _detalle(client, cab, "detvacio")
    assert len(cuerpo["espacios"]) == 2
    assert cuerpo["proveedores"] == []
    assert [r["id"] for r in cuerpo["recomendaciones"]] == ["arranque:todos"]

    arranque = cuerpo["recomendaciones"][0]
    assert arranque["prioridad"] == "alta"
    # Una punta al promedio de la plataforma + una nevera al promedio.
    assert arranque["valor_estimado_mensual"] == BENCH_PUNTA + BENCH_NEVERA
    assert arranque["datos"]["espacios_por_tipo"] == [
        {"tipo": "nevera_refrescos", "total": 1}, {"tipo": "punta", "total": 1},
    ]
    assert arranque["datos"]["benchmark_plataforma"] == cuerpo["benchmark_plataforma"]
    assert arranque["explicacion"] == (
        "Sin contratos activos en el período: 2 espacios comercializables "
        "(nevera_refrescos: 1, punta: 1) por un potencial de $ 2.400.000 mensuales "
        "al promedio de la plataforma."
    )


# ════════════════════════════════════════════════════════════════════════════
# (8) y (9) La puerta y la bitácora
# ════════════════════════════════════════════════════════════════════════════

def test_401_sin_token(client, monkeypatch):
    _ids, _cab_op = _escenario(client, monkeypatch)
    assert client.get("/api/plataforma/clientes/detcli/detalle").status_code == 401


def test_403_admin_legado_y_worker(client, monkeypatch, admin, worker):
    _ids, _cab_op = _escenario(client, monkeypatch)
    assert _pedir(client, admin).status_code == 403
    assert _pedir(client, worker).status_code == 403


def test_403_para_el_dueno_del_propio_cliente(client, monkeypatch):
    """El detalle es del OPERADOR: el dueño mira su negocio por su propia app."""
    ids = Identidades(client)
    owner = _fundar(ids, "uid-detcli", "duena@detcli.co", "detcli", "Detalle Cliente")
    _sembrar("detcli", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS, _ESPACIOS_EXTRA)
    _limpiar_caches()
    assert _pedir(client, owner).status_code == 403


def test_404_con_slug_inexistente(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    r = _pedir(client, cab, "no-existe-este-cliente")
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "No hay un cliente con ese código."


def test_422_con_periodo_invalido_o_fuera_de_ventana(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    assert _pedir(client, cab, periodo="2026-13").status_code == 422
    assert _pedir(client, cab, periodo="septiembre").status_code == 422
    assert _pedir(client, cab, periodo="1999-01").status_code == 422
    # Sin parámetro se cae al mes en curso, nunca a un 422.
    assert _pedir(client, cab, periodo=None).status_code == 200


def test_base_ilegible_da_503_con_el_texto_fijo(client, monkeypatch):
    from app.plataforma_metricas import ERROR_BASE_ILEGIBLE

    _ids, cab = _escenario(client, monkeypatch)
    ruta = _romper()
    _limpiar_caches()

    r = _pedir(client, cab, "detroto")
    assert r.status_code == 503, r.text
    assert r.json()["detail"] == ERROR_BASE_ILEGIBLE
    # Ni la ruta de la base ni el mensaje del driver salen al JSON.
    assert ruta not in r.text
    assert "sqlite" not in r.text.lower()


def test_cliente_sin_plano_responde_200_vacio(client, monkeypatch):
    ids = Identidades(client)
    _fundar(ids, "uid-detsp", "duena@detsp.co", "detsinplano", "Det Sin Plano")
    cab = _operador_sin_membresias(ids, monkeypatch)
    _limpiar_caches()

    cuerpo = _detalle(client, cab, "detsinplano")
    assert cuerpo["sedes_con_plano"] == 0
    assert cuerpo["espacios"] == []
    assert cuerpo["sedes"] == []
    assert cuerpo["resumen_por_tipo"] == []
    assert cuerpo["oportunidades"] == []
    arranque = cuerpo["recomendaciones"]
    assert [r["id"] for r in arranque] == ["arranque:todos"]
    assert arranque[0]["valor_estimado_mensual"] == 0.0


def test_la_bitacora_anota_cada_consulta(client, monkeypatch):
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    _ids, cab = _escenario(client, monkeypatch)
    _detalle(client, cab)
    _detalle(client, cab, periodo="2026-08")

    reg = sesion_registro()
    try:
        filas = (
            reg.query(BitacoraPlataforma)
            .filter(BitacoraPlataforma.accion == "detalle")
            .order_by(BitacoraPlataforma.id)
            .all()
        )
        lineas = [(f.email, f.accion, f.periodo) for f in filas]
    finally:
        reg.close()

    assert lineas == [
        ("op@recabra.co", "detalle", "detcli:2026-09"),
        ("op@recabra.co", "detalle", "detcli:2026-08"),
    ]


def test_el_404_no_deja_linea_de_acceso(client, monkeypatch):
    """Se anota el acceso a datos, y un slug que no existe no tuvo ninguno."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    _ids, cab = _escenario(client, monkeypatch)
    assert _pedir(client, cab, "no-existe").status_code == 404

    reg = sesion_registro()
    try:
        cuantas = (
            reg.query(BitacoraPlataforma)
            .filter(BitacoraPlataforma.accion == "detalle")
            .count()
        )
    finally:
        reg.close()
    assert cuantas == 0


# ════════════════════════════════════════════════════════════════════════════
# (10) La frontera: qué no puede contener el JSON
# ════════════════════════════════════════════════════════════════════════════

def test_ninguna_clave_prohibida_en_ningun_nivel(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)

    claves = set(_claves(cuerpo))
    assert claves & CLAVES_PROHIBIDAS == set(), claves & CLAVES_PROHIBIDAS
    # La única clave que puede nombrar la tarifa es el sí/no.
    con_tarifa = {k for k in claves if "tarifa" in k.lower()}
    assert con_tarifa == {"tarifa_configurada"}


def test_ningun_dato_de_contacto_ni_nota_ni_correo_de_usuario(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)
    cuerpo = _detalle(client, cab)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    for prohibido in (
        CONTACTO_SEMBRADO, NOTA_SEMBRADA, "contacto@proveedor.example",
        "3005558899", "duena@detcli.co", "op@recabra.co",
    ):
        assert prohibido not in crudo, prohibido
    # Ni una arroba en ningún string del JSON.
    assert all("@" not in t for t in _textos(cuerpo))


def test_la_tarifa_de_referencia_nunca_sale_ni_por_diferencia(client, monkeypatch):
    """Con tarifas cargadas, lo único que cambia es el sí/no por tipo."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de
    from app.routers.layout import RATES_KEY

    _ids, cab = _escenario(client, monkeypatch)
    cliente = buscar("detcli")
    db = sesion_de(cliente)
    try:
        set_config(db, RATES_KEY, json.dumps(
            {"default": {"punta": 3_333_333.0}, "by_sede": {}}))
        db.commit()
    finally:
        db.close()
    _limpiar_caches()

    cuerpo = _detalle(client, cab)
    resumen = cuerpo["resumen_por_tipo"]
    assert _por(resumen, "tipo", "punta")["tarifa_configurada"] is True
    assert _por(resumen, "tipo", "gondola")["tarifa_configurada"] is False
    assert "3333333" not in json.dumps(cuerpo)
    assert 3_333_333.0 not in list(_hojas(cuerpo))
    # Y el tipo con tarifa desaparece de la recomendación de "sin tarifa".
    sin_tarifa = _por(cuerpo["recomendaciones"], "id", "sin_tarifa:todos")
    assert sin_tarifa["datos"]["tipos"] == ["gondola", "nevera_refrescos"]


# ════════════════════════════════════════════════════════════════════════════
# (11) y (12) Orden de rutas y que el endpoint no escribe
# ════════════════════════════════════════════════════════════════════════════

def test_ruta_declarada_despues_de_todas_las_literales(client):
    from conftest import rutas_planas

    orden = [r.path for r in rutas_planas(client.app)]
    objetivo = "/api/plataforma/clientes/{slug}/detalle"
    assert objetivo in orden

    for literal in (
        "/api/plataforma/metricas",
        "/api/plataforma/tendencia",
        "/api/plataforma/adopcion",
        "/api/plataforma/supresiones",
        "/api/plataforma/soy",
        "/api/plataforma/clientes",
    ):
        assert literal in orden, literal
        assert orden.index(literal) < orden.index(objetivo), literal


def _huella_de_la_base(slug):
    """(sha256 del archivo, conteo de filas) de la base de negocio del cliente."""
    from app.clientes import buscar, sesion_de, url_para
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier

    cliente = buscar(slug)
    db = sesion_de(cliente)
    try:
        conteos = tuple(
            db.query(modelo).count()
            for modelo in (Space, SpaceLease, Supplier, LayoutSnapshot)
        )
    finally:
        db.close()
    ruta = url_para(cliente.db_name).split("sqlite:///", 1)[1]
    with open(ruta, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest(), conteos


def test_el_endpoint_no_escribe_en_la_base_del_cliente(client, monkeypatch):
    """La garantía es por construcción (sólo ``query`` y ``close``); esto la
    comprueba desde afuera, contra el archivo."""
    _ids, cab = _escenario(client, monkeypatch)
    antes = _huella_de_la_base("detcli")

    _detalle(client, cab)
    _detalle(client, cab, periodo="2026-10")

    assert _huella_de_la_base("detcli") == antes


# ════════════════════════════════════════════════════════════════════════════
# Determinismo
# ════════════════════════════════════════════════════════════════════════════

def test_dos_consultas_seguidas_devuelven_lo_mismo(client, monkeypatch):
    """Sin caché del detalle: se calcula de nuevo y tiene que dar idéntico —
    los órdenes con empate están todos desempatados a propósito."""
    _ids, cab = _escenario(client, monkeypatch)
    uno = _detalle(client, cab)
    dos = _detalle(client, cab)
    uno.pop("generado_en")
    dos.pop("generado_en")
    assert uno == dos


# ════════════════════════════════════════════════════════════════════════════
# El nombre propio de cada familia
# ════════════════════════════════════════════════════════════════════════════

def test_la_consola_no_usa_el_nombre_propio_del_supermercado(client, monkeypatch):
    """Cada supermercado le pone su nombre a cada familia («mamut», «tope de
    góndola»: ``catalog_labels``), y sus pantallas lo muestran. La consola y los
    informes de asesoría comparan clientes, así que nombran con la clave de
    RECABRA: ni el detalle, ni el reporte, ni las métricas lo devuelven."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de

    _ids, cab = _escenario(client, monkeypatch)
    propio = "TOPE-DE-GONDOLA-DE-DETCLI"
    db = sesion_de(buscar("detcli"))
    try:
        set_config(db, "layout_catalog_labels", json.dumps({
            "punta": propio, "gondola_doble": propio + "-G", "nevera_refrescos": propio + "-N",
        }))
        db.commit()
    finally:
        db.close()
    _limpiar_caches()

    detalle = _pedir(client, cab)
    assert detalle.status_code == 200, detalle.text
    assert propio not in detalle.text
    # El tipo sigue siendo la clave de RECABRA.
    assert _espacio(detalle.json(), "NAVE-PUN-01")["tipo"] == "punta"
    for url in (
        f"/api/plataforma/clientes/detcli/reporte?periodo={PERIODO}",
        f"/api/plataforma/metricas?periodo={PERIODO}",
    ):
        r = client.get(url, headers=cab)
        assert r.status_code == 200, (url, r.text)
        assert propio not in r.text, url
