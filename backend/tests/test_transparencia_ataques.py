"""Fase 7 (Transparencia) — la FRONTERA del reporte y los restos de K=3.

Red team del reporte de transparencia (``app/plataforma_reporte.py``, los dos
endpoints ``GET /api/clientes/mi-reporte-plataforma`` y
``GET /api/plataforma/clientes/{slug}/reporte``) y de la quita del umbral de
celda chica en ``/metricas`` y ``/tendencia``.

Sucesor de ``test_metricas_ataques.py`` (Fase 4), ``test_tendencia_ataques.py``
(Fase 5), ``test_asesoria_ataques.py`` (Fase 6) y ``test_auditoria_frontera.py``
(auditoría integral). **Misma disciplina: acá NO se arregla código de
producción.** Un defecto se fija con un test que lo demuestra —``xfail(strict=
True)`` afirmando el comportamiento SEGURO que hoy no se cumple— y se cuenta en
``features/transparencia/outputs/auditor-frontera.md``. Ninguna aserción se
borra para que la suite quede verde.

Las tres preguntas de frontera que este archivo tiene que poder contestar:

1. **¿El reporte del dueño de A puede ver algo de B?** — ni un número, ni un
   slug, ni un nombre, ni un proveedor, ni una línea de bitácora (t01..t08).
2. **¿El operador puede sacar una fila de contrato o la tarifa de referencia?**
   — claves prohibidas en cualquier nivel, arreglos taxativos, ningún número
   igual a la tarifa sembrada, ninguna arroba fuera de ``accesos.lineas[]
   .operador`` (t20..t28).
3. **¿Quedó algún resto de K=3?** — ``grep`` sobre el código y el
   comportamiento exacto con UN contrato (t40..t46).

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.
"""
import json
import re
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

# ════════════════════════════════════════════════════════════════════════════
# LOS SENTINELAS
# ════════════════════════════════════════════════════════════════════════════

CORREO_OPERADOR = "op@recabra.example"
CORREO_DUENA_A = "duena.alfa@alfa.example"
CORREO_DUENO_B = "dueno.beta@beta.example"
CORREO_ADMIN_A = "gerente.alfa@alfa.example"
CORREO_WORKER_A = "peon.alfa@alfa.example"

SLUG_A = "alfa"
SLUG_B = "beta"
NOMBRE_A = "Alfa Supermercados"
NOMBRE_B = "Beta Market Unico"

# El monto del checklist de la spec: con UN contrato, `/metricas` tiene que
# publicar exactamente esto (ingreso e canon promedio) — es la prueba de que
# K=3 no dejó rastro.
CANON_A = 4_173_919.0
# Único, primo y sin relación aritmética con nada de A: si apareciera un solo
# número igual a éste en el reporte de A, sería una fuga de la base de B.
CANON_B = 8_654_321.0
# La tarifa de referencia de A. NUNCA puede salir al JSON — sólo el spread,
# que es una relación.
TARIFA_A = 3_141_593.0

# El nombre CRUDO del proveedor de A, con un correo y un teléfono adentro: es
# dato de un tercero que puede ser persona natural, y tiene que salir saneado
# en el reporte igual que en `/metricas`.
CORREO_PROVEEDOR_A = "ventas@distribuciones-alfa.example"
TELEFONO_PROVEEDOR_A = "3005558899"
PROVEEDOR_A = f"Distribuciones Alfa {CORREO_PROVEEDOR_A} Cel {TELEFONO_PROVEEDOR_A}"
MASCARA_CORREO = "[correo oculto]"
MASCARA_TELEFONO = "[teléfono oculto]"

# El de B: una cadena única que no aparece en ningún otro lado del sistema.
PROVEEDOR_B = "ZetaUnicaBetaSAS"

# Datos de contacto de la ficha del proveedor: si el endpoint devolviera el
# objeto del ORM en vez del par (nombre, conteo), esto saldría entero.
CONTACTO_PROVEEDOR = "Juan Perez"
NOTA_PROVEEDOR = "Paga tarde, llamar al celular personal"
NOTA_ESPACIO = "Nota interna del espacio: la punta de la entrada"
NOTA_CONTRATO = "Nota interna del contrato: descuento verbal del 12%"
MARCA_CONTRATO = "MarcaSecretaDelContrato"

SIEMPRE = ("2020-01-01", "2035-12-31")

_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# La lista blanca EXACTA del shape VINCULANTE (spec, Parte B).
CLAVES_NIVEL1 = {
    "cliente", "generado_en", "ventana", "politica", "catalogo", "valores",
    "spread_actual", "accesos", "derechos",
}
CLAVES_CLIENTE = {"slug", "nombre"}
CLAVES_VENTANA = {"desde", "hasta", "meses"}
CLAVES_POLITICA = {"version_vigente", "version_aceptada", "aceptada_en", "base_legal", "url"}
CLAVES_CATALOGO = {"clave", "nombre", "definicion", "fuente", "finalidad", "endpoints", "tratamiento"}
CLAVES_VALOR = {
    "periodo", "sin_dato", "origen", "capturado_en", "sedes_con_plano",
    "espacios_comercializables", "ocupadas", "ocupacion_pct", "contratos_activos",
    "canon_total", "canon_promedio_mensual", "usuarios_con_cuenta", "top_proveedores",
}
CLAVES_TOP = {"nombre", "contratos"}
CLAVES_SPREAD = {"periodo", "tarifa_configurada", "spread_pct", "contratos_sin_tarifa"}
CLAVES_ACCESOS = {"total", "lineas"}
CLAVES_LINEA = {"fecha", "operador", "accion", "periodo"}
CLAVES_DERECHOS = {"export", "supresion", "reporte", "contacto"}

# Los ÚNICOS arreglos que el shape admite, por su ruta.
ARREGLOS_PERMITIDOS = {"$.catalogo", "$.valores", "$.accesos.lineas"}

# Claves prohibidas en CUALQUIER nivel (spec: agregados, nunca filas; ninguna
# PII de usuario final; jamás la tarifa ni su suma).
CLAVES_PROHIBIDAS = {
    "monthly_rent", "tarifa", "tarifa_total", "canon_con_tarifa", "rates",
    "by_sede", "default", "usuario_id", "space_id", "supplier_id", "lease_id",
    "notes", "notas", "ip", "hash", "firebase_uid", "marca", "svg_id",
    "fixtures_json", "proveedores_json", "motivo", "cambiado_por",
}

REPO = Path(__file__).resolve().parents[2]


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE (cada archivo de pruebas se sostiene solo)
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
    """Funda un cliente por el alta self-service REAL. Devuelve el cuerpo."""
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _invitar_y_entrar(ids: Identidades, owner_cab, *, uid, email, rol):
    """Invita con ``rol`` sobre el cliente de ``owner_cab`` y hace su oauth."""
    r = ids.client.post("/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=owner_cab)
    assert r.status_code == 200, r.text
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid="uid-op", email=CORREO_OPERADOR):
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías."""
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo.get("plataforma") is True, cuerpo
    return _cab(cuerpo["token"])


def _sembrar(slug, sedes: dict, contratos: list, tarifas: dict | None = None):
    """Layout + proveedores CON ficha completa + espacios y contratos CON notas,
    y opcionalmente la tarifa de referencia. Lo único de este archivo que
    escribe en una base de NEGOCIO: los endpoints atacados no escriben nunca."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de
    from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier
    from app.routers.layout import RATES_KEY

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
                fila = Supplier(
                    name=proveedor, contact_name=CONTACTO_PROVEEDOR,
                    phone=TELEFONO_PROVEEDOR_A, email=CORREO_PROVEEDOR_A,
                    notes=NOTA_PROVEEDOR,
                )
                db.add(fila)
                db.flush()
                proveedores[proveedor] = fila
            if codigo not in espacios:
                espacio = db.query(Space).filter(Space.code == codigo).first()
                if espacio is None:
                    espacio = Space(
                        code=codigo, svg_id=f"svg-{codigo}", name=codigo,
                        zone="Zona", sede=codigo.split("-")[0], area_m2=5.0,
                        notes=NOTA_ESPACIO,
                    )
                    db.add(espacio)
                    db.flush()
                espacios[codigo] = espacio
            db.add(SpaceLease(
                space_id=espacios[codigo].id,
                supplier_id=proveedores[proveedor].id,
                marca=MARCA_CONTRATO,
                start_date=date.fromisoformat(ini),
                end_date=date.fromisoformat(fin),
                monthly_rent=canon,
                is_active=activo,
                notes=NOTA_CONTRATO,
            ))
        if tarifas is not None:
            set_config(db, RATES_KEY, json.dumps(tarifas))
        db.commit()
    finally:
        db.close()


def _romper(slug="roto", nombre="Roto"):
    """Un cliente cuya base NO se deja leer: fila en el registro + basura."""
    from app.clientes import sesion_registro, url_para
    from app.models.models import ClienteRow

    db_name = f"recabra_{slug}"
    reg = sesion_registro()
    try:
        fila = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if fila is None:
            reg.add(ClienteRow(slug=slug, nombre=nombre, db_name=db_name, activo=True))
            reg.commit()
        else:
            db_name = fila.db_name
    finally:
        reg.close()

    ruta = url_para(db_name).split("sqlite:///", 1)[1]
    with open(ruta, "wb") as f:
        f.write(b"esto no es una base de datos, es un archivo cualquiera\n" * 20)
    return db_name, ruta


def _bitacora(email, accion, periodo, cuando=None):
    """Una línea de ``bitacora_plataforma`` escrita a mano en el registro."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        reg.add(BitacoraPlataforma(
            email=email, accion=accion, periodo=periodo,
            en=cuando or datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()


def _soltar_freno():
    """Vacía ``export_attempts``: el freno de 3/hora es COMPARTIDO entre
    ``/mi-export`` y el reporte, así que una prueba que hace cuatro pedidos
    seguidos chocaría contra él por su propio andamiaje. Se vacía la tabla del
    registro entre intentos — nunca se toca el código de producción."""
    from app.clientes import sesion_registro
    from app.models.supresion import IntentoExport

    reg = sesion_registro()
    try:
        reg.query(IntentoExport).delete(synchronize_session=False)
        reg.commit()
    finally:
        reg.close()


def _supresion(slug, usuario_id, email, motivo="Nos vamos, borren todo"):
    from app.clientes import sesion_registro
    from app.models.supresion import SolicitudSupresion

    reg = sesion_registro()
    try:
        reg.add(SolicitudSupresion(
            cliente_slug=slug, usuario_id=usuario_id, email=email,
            motivo=motivo, estado="pendiente", creado_en=datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()


def _estado(slug, estado, motivo="Sin pagar hace 90 dias"):
    from app import plataforma_estado
    from app.clientes import sesion_registro
    from app.models.plataforma import EstadoCliente

    reg = sesion_registro()
    try:
        fila = reg.query(EstadoCliente).filter(EstadoCliente.slug == slug).first()
        if fila is None:
            fila = EstadoCliente(slug=slug, estado=estado, motivo=motivo,
                                 cambiado_por=CORREO_OPERADOR)
            reg.add(fila)
        else:
            fila.estado, fila.motivo = estado, motivo
        fila.cambiado_en = datetime.now(timezone.utc)
        reg.commit()
    finally:
        reg.close()
    plataforma_estado.limpiar_cache_estado()


# ─── El layout sembrado ──────────────────────────────────────────────────────
#
# A: sede ALFA con TRES puntas, UNA ocupada -> 33,3 % y UN contrato.
# B: sede BETA con UNA punta, ocupada -> 100 % y UN contrato.

_ALFA = [
    {"code": "P-01", "type": "punta", "sede": "ALFA"},
    {"code": "P-02", "type": "punta", "sede": "ALFA"},
    {"code": "P-03", "type": "punta", "sede": "ALFA"},
]
_BETA = [{"code": "E-01", "type": "punta", "sede": "BETA"}]

_CONTRATOS_A = [("ALFA-P-01", PROVEEDOR_A, SIEMPRE[0], SIEMPRE[1], CANON_A, True)]
_CONTRATOS_B = [("BETA-E-01", PROVEEDOR_B, SIEMPRE[0], SIEMPRE[1], CANON_B, True)]


def _campo(client, monkeypatch, *, con_tarifa=True, con_roto=False):
    """El campo de batalla: A + B + el operador, con snapshots ya publicados.

    Devuelve ``(ids, cab_a, cab_b, cab_op, alta_a, alta_b)``.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    alta_a = _fundar(ids, "uid-a", CORREO_DUENA_A, SLUG_A, NOMBRE_A)
    alta_b = _fundar(ids, "uid-b", CORREO_DUENO_B, SLUG_B, NOMBRE_B)

    _sembrar(SLUG_A, {"ALFA": _ALFA}, _CONTRATOS_A,
             tarifas={"default": {"punta": TARIFA_A}} if con_tarifa else None)
    _sembrar(SLUG_B, {"BETA": _BETA}, _CONTRATOS_B)
    if con_roto:
        _romper()

    cab_op = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()

    # Un pase por `/metricas` persiste `snapshot_metricas` del mes en curso
    # (write-through de la Fase 5) -- es lo que llena `valores` del reporte.
    r = client.get("/api/plataforma/metricas", headers=cab_op)
    assert r.status_code == 200, r.text

    return ids, _cab(alta_a["token"]), _cab(alta_b["token"]), cab_op, alta_a, alta_b


def _reporte_dueno(client, cab, meses=None):
    params = {} if meses is None else {"meses": meses}
    return client.get("/api/clientes/mi-reporte-plataforma", headers=cab, params=params)


def _reporte_operador(client, cab, slug, meses=None):
    params = {} if meses is None else {"meses": meses}
    return client.get(f"/api/plataforma/clientes/{slug}/reporte", headers=cab, params=params)


def _ok(r):
    assert r.status_code == 200, r.text
    return r.json()


# ─── El recorrido recursivo (nada se mira sólo en el primer nivel) ───────────

def _hojas(nodo, ruta="$"):
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield from _hojas(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _hojas(v, f"{ruta}[{i}]")
    else:
        yield ruta, nodo


def _claves(nodo, ruta="$"):
    if isinstance(nodo, dict):
        yield ruta, set(nodo.keys())
        for k, v in nodo.items():
            yield from _claves(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _claves(v, f"{ruta}[{i}]")


def _arreglos(nodo, ruta="$"):
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield from _arreglos(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        yield ruta, len(nodo)
        for i, v in enumerate(nodo):
            yield from _arreglos(v, f"{ruta}[{i}]")


def _textos(cuerpo):
    return [(r, v) for r, v in _hojas(cuerpo) if isinstance(v, str)]


def _numeros(cuerpo):
    # `bool` es subclase de `int` en Python: `sin_dato` no es un número.
    return [(r, v) for r, v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


def _ruta_generica(ruta: str) -> str:
    """``$.valores[3].top_proveedores[0]`` -> ``$.valores[].top_proveedores[]``."""
    return re.sub(r"\[\d+\]", "[]", ruta)


# ════════════════════════════════════════════════════════════════════════════
# 1. CROSS-TENANT — el reporte del dueño de A no puede ver NADA de B
# ════════════════════════════════════════════════════════════════════════════

def test_t01_el_reporte_de_a_no_trae_ni_un_rastro_de_b(client, monkeypatch):
    """Vector: el reporte lee del REGISTRO, donde conviven las filas de TODOS
    los clientes (``snapshot_metricas``, ``bitacora_plataforma``). Un filtro
    que se olvide del ``cliente_slug`` —o que se cuele la fila
    ``__consolidado__``, que es la suma de todos— pondría el canon de B en el
    reporte de A. Se barren TODAS las hojas del JSON contra los sentinelas
    únicos de B."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    cuerpo = _ok(_reporte_dueno(client, cab_a))

    crudo = json.dumps(cuerpo, ensure_ascii=False)
    for sentinela in (SLUG_B, NOMBRE_B, PROVEEDOR_B, CORREO_DUENO_B, "Beta", "BETA"):
        assert sentinela not in crudo, f"sentinela de B en el reporte de A: {sentinela!r}"

    for ruta, valor in _numeros(cuerpo):
        assert valor != CANON_B, f"el canon de B apareció en {ruta}"
        assert valor != CANON_A + CANON_B, f"el consolidado (A+B) apareció en {ruta}"


def test_t02_valores_sale_solo_de_snapshots_del_propio_slug(client, monkeypatch):
    """Vector: ``snapshot_metricas`` guarda una fila por cliente Y la fila
    ``__consolidado__``. Si ``valores`` la tomara —o tomara la de otro slug—,
    el dueño de A vería el negocio entero de la plataforma. Se comprueba contra
    lo que la tabla tiene de verdad, no contra un número escrito a mano."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    cuerpo = _ok(_reporte_dueno(client, cab_a))

    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import periodo_actual

    reg = sesion_registro()
    try:
        propias = {
            f.periodo: f for f in reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug == SLUG_A).all()
        }
        ajenas = (
            reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug != SLUG_A).all()
        )
    finally:
        reg.close()

    assert propias, "el escenario no publicó ningún snapshot de A: la prueba no probó nada"
    assert ajenas, "el escenario no publicó snapshots ajenos: la prueba no probó nada"

    actual = periodo_actual()
    con_dato = {v["periodo"] for v in cuerpo["valores"] if not v["sin_dato"]}
    assert con_dato == set(propias), con_dato

    fila = next(v for v in cuerpo["valores"] if v["periodo"] == actual)
    assert fila["canon_total"] == CANON_A
    assert fila["contratos_activos"] == 1
    assert fila["ocupadas"] == 1
    assert fila["espacios_comercializables"] == 3


def test_t03_el_slug_no_sale_de_un_parametro_de_query(client, monkeypatch):
    """Vector: el clásico ``?slug=otro``. El endpoint del dueño toma el cliente
    de ``cliente_del_pedido`` (token FIRMADO); un parámetro suelto no puede
    moverlo. Cualquiera de las dos respuestas seguras sirve —ignorarlo o
    rechazarlo— pero NUNCA devolver el reporte de B."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    for query in ({"slug": SLUG_B}, {"cliente": SLUG_B}, {"cliente_slug": SLUG_B}):
        _soltar_freno()
        r = client.get("/api/clientes/mi-reporte-plataforma", headers=cab_a, params=query)
        assert r.status_code in (200, 403, 404, 422), r.text
        if r.status_code == 200:
            assert r.json()["cliente"]["slug"] == SLUG_A, query
            assert PROVEEDOR_B not in json.dumps(r.json(), ensure_ascii=False)


def test_t04_cabeceras_de_otro_cliente_no_mueven_el_reporte(client, monkeypatch):
    """Vector: el cliente se resuelve por el token, pero un middleware o un
    router futuro podría empezar a mirar una cabecera. Se prueban las que un
    atacante intentaría antes de rendirse."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    for extra in (
        {"X-Cliente": SLUG_B}, {"X-Client": SLUG_B}, {"X-Tenant": SLUG_B},
        {"X-Cliente-Slug": SLUG_B}, {"Host": f"{SLUG_B}.recabra.co"},
        {"Cookie": f"cliente={SLUG_B}"},
    ):
        cabeceras = dict(cab_a)
        cabeceras.update(extra)
        _soltar_freno()   # el freno compartido es de 3/hora; acá se prueban 6
        r = client.get("/api/clientes/mi-reporte-plataforma", headers=cabeceras)
        assert r.status_code == 200, (extra, r.text)
        assert r.json()["cliente"]["slug"] == SLUG_A, extra
        assert PROVEEDOR_B not in json.dumps(r.json(), ensure_ascii=False), extra


def test_t05_el_slug_en_el_path_del_dueno_no_existe(client, monkeypatch):
    """Vector: adivinar una ruta paramétrica hermana del endpoint literal del
    dueño (``/mi-reporte-plataforma/beta``, ``/beta/mi-reporte-plataforma``).
    Ninguna puede existir, y el 404/405 tiene que ser idéntico exista o no el
    slug: si contestara distinto para ``beta`` que para ``nadie``, sería un
    oráculo de qué clientes hay en la plataforma."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    respuestas = {}
    for slug in (SLUG_B, "clientequenoexiste"):
        for camino in (
            f"/api/clientes/mi-reporte-plataforma/{slug}",
            f"/api/clientes/{slug}/mi-reporte-plataforma",
            f"/api/clientes/{slug}/reporte",
        ):
            r = client.get(camino, headers=cab_a)
            assert r.status_code != 200, camino
            assert PROVEEDOR_B not in r.text, camino
            respuestas.setdefault(camino.replace(slug, "<slug>"), []).append(
                (r.status_code, r.text))

    for camino, pares in respuestas.items():
        estados = {p[0] for p in pares}
        textos = {p[1] for p in pares}
        assert len(estados) == 1, f"{camino}: el estado distingue el slug existente: {estados}"
        assert len(textos) == 1, f"{camino}: el texto distingue el slug existente"


def test_t06_el_operador_pide_a_y_no_ve_b_ni_al_reves(client, monkeypatch):
    """Vector: el endpoint del operador SÍ toma el slug del path. Que resuelva
    el slug pedido no puede significar que mezcle: el reporte de A no puede
    traer nada de B, y el de B nada de A."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    de_a = _ok(_reporte_operador(client, cab_op, SLUG_A))
    de_b = _ok(_reporte_operador(client, cab_op, SLUG_B))

    assert de_a["cliente"]["slug"] == SLUG_A
    assert de_b["cliente"]["slug"] == SLUG_B

    crudo_a = json.dumps(de_a, ensure_ascii=False)
    assert PROVEEDOR_B not in crudo_a and NOMBRE_B not in crudo_a
    assert all(v != CANON_B for _r, v in _numeros(de_a))

    crudo_b = json.dumps(de_b, ensure_ascii=False)
    assert PROVEEDOR_A.split()[0] not in crudo_b or NOMBRE_A not in crudo_b
    assert all(v != CANON_A for _r, v in _numeros(de_b))
    assert all(v != TARIFA_A for _r, v in _numeros(de_b))


def test_t07_los_dos_endpoints_devuelven_el_mismo_cuerpo(client, monkeypatch):
    """Vector: dos caminos que se separan. Si el del operador enriqueciera el
    JSON (o el del dueño lo recortara), la frontera se estaría definiendo dos
    veces y una de las dos se va a olvidar. Se comparan salvo lo que depende
    del reloj y de la bitácora que el propio pedido del operador anota."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    del_dueno = _ok(_reporte_dueno(client, cab_a))
    del_operador = _ok(_reporte_operador(client, cab_op, SLUG_A))

    for cuerpo in (del_dueno, del_operador):
        cuerpo.pop("generado_en")
        cuerpo.pop("accesos")
    assert del_dueno == del_operador


def test_t08_el_reporte_de_a_no_lista_accesos_que_no_lo_alcanzaron(client, monkeypatch):
    """Vector: ``bitacora_plataforma`` es UNA tabla para toda la plataforma.
    Una línea de ``tendencia`` sobre B —cuyo ``periodo`` es ``"beta:..."``—
    en el reporte de A le contaría a A que existe un cliente llamado beta y
    cuándo lo miraron. La de ``__consolidado__`` sí alcanza a A (A es uno de
    los sumandos), y la de ``reporte`` de B no."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    _bitacora(CORREO_OPERADOR, "tendencia", f"{SLUG_B}:2026-01..2026-09")
    _bitacora(CORREO_OPERADOR, "reporte", f"{SLUG_B}:2026-01..2026-09")
    _bitacora(CORREO_OPERADOR, "tendencia", "__consolidado__:2026-01..2026-09")
    _bitacora(CORREO_OPERADOR, "tendencia", f"{SLUG_A}:2026-01..2026-09")

    cuerpo = _ok(_reporte_dueno(client, cab_a))
    periodos = [l["periodo"] for l in cuerpo["accesos"]["lineas"]]

    assert f"{SLUG_B}:2026-01..2026-09" not in periodos, "la tendencia de B se filtró"
    assert "__consolidado__:2026-01..2026-09" in periodos
    assert f"{SLUG_A}:2026-01..2026-09" in periodos
    assert periodos.count(f"{SLUG_B}:2026-01..2026-09") == 0
    assert cuerpo["accesos"]["total"] == len(cuerpo["accesos"]["lineas"])
    assert SLUG_B not in json.dumps(cuerpo, ensure_ascii=False)


def test_t09_supresiones_solo_si_el_cliente_tiene_solicitud(client, monkeypatch):
    """Vector: ``/plataforma/supresiones`` lista las solicitudes de TODOS. Si
    su línea de bitácora apareciera en el reporte de un cliente que no pidió
    nada, le estaría contando que alguien más ejerció habeas data."""
    _ids, cab_a, cab_b, _cab_op, alta_a, _b = _campo(client, monkeypatch)

    _bitacora(CORREO_OPERADOR, "supresiones", "2026-09")

    sin_solicitud = _ok(_reporte_dueno(client, cab_a))
    assert "supresiones" not in [l["accion"] for l in sin_solicitud["accesos"]["lineas"]]

    _supresion(SLUG_A, alta_a.get("usuario_id") or 1, CORREO_DUENA_A)
    con_solicitud = _ok(_reporte_dueno(client, cab_a))
    assert "supresiones" in [l["accion"] for l in con_solicitud["accesos"]["lineas"]]

    # Y B, que no pidió nada, sigue sin verla.
    de_b = _ok(_reporte_dueno(client, cab_b))
    assert "supresiones" not in [l["accion"] for l in de_b["accesos"]["lineas"]]


# ════════════════════════════════════════════════════════════════════════════
# 2. ROLES — quién puede pedir qué
# ════════════════════════════════════════════════════════════════════════════

def test_t10_sin_token_401_en_los_dos_endpoints(client):
    assert client.get("/api/clientes/mi-reporte-plataforma").status_code == 401
    assert client.get("/api/plataforma/clientes/alfa/reporte").status_code == 401


def test_t11_admin_legado_y_worker_legado_403(client, admin, worker):
    """Vector: el login legado (clave compartida) firma un JWT con rol
    ``admin`` pero SIN ``sub``. ``require_owner`` no puede buscarle membresía
    a nadie: por construcción nunca es owner."""
    r = _reporte_dueno(client, admin)
    assert r.status_code == 403, r.text
    assert _reporte_dueno(client, worker).status_code == 403
    assert client.get("/api/plataforma/clientes/alfa/reporte", headers=admin).status_code == 403
    assert client.get("/api/plataforma/clientes/alfa/reporte", headers=worker).status_code == 403


def test_t12_membresia_admin_y_worker_no_owner_403(client, monkeypatch):
    """Vector: el JWT dice ``rol: admin`` tanto para un owner como para un
    admin invitado (Fase 1, decisión 5). Si ``require_owner`` mirara el rol del
    token en vez de la membresía, el gerente invitado se llevaría el reporte."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    ids = Identidades(client)
    ids.mapa["uid-a"] = _claims("uid-a", CORREO_DUENA_A)
    gerente = _invitar_y_entrar(ids, cab_a, uid="uid-ger", email=CORREO_ADMIN_A, rol="admin")
    peon = _invitar_y_entrar(ids, cab_a, uid="uid-peon", email=CORREO_WORKER_A, rol="worker")

    for cabecera in (gerente, peon):
        r = _reporte_dueno(client, cabecera)
        assert r.status_code == 403, r.text
        assert PROVEEDOR_A not in r.text
        assert str(CANON_A) not in r.text


def test_t13_el_operador_sin_membresias_no_entra_por_el_endpoint_del_dueno(client, monkeypatch):
    """Vector: el token de la consola (``cliente == "plataforma"``) contra la
    ruta del dueño. Tiene que rebotar sin devolver un solo dato — 401 o 403,
    nunca 200. Y el mismo token SÍ abre el endpoint del operador."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    r = _reporte_dueno(client, cab_op)
    assert r.status_code in (401, 403), r.text
    assert PROVEEDOR_A not in r.text and str(CANON_A) not in r.text

    assert _reporte_operador(client, cab_op, SLUG_A).status_code == 200


def test_t14_el_owner_que_no_es_operador_no_entra_por_el_endpoint_del_operador(client, monkeypatch):
    """Vector: el owner de A pidiendo su PROPIO reporte por la puerta del
    operador. Aunque el dato sea suyo, esa puerta es la del panel: dársela
    sería darle también la de B en el pedido siguiente."""
    _ids, cab_a, cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    r_propio = _reporte_operador(client, cab_a, SLUG_A)
    assert r_propio.status_code == 403, r_propio.text
    r_ajeno = _reporte_operador(client, cab_a, SLUG_B)
    assert r_ajeno.status_code == 403, r_ajeno.text
    # Indistinguible: mismo estado y mismo texto para el propio y el ajeno.
    assert r_propio.status_code == r_ajeno.status_code
    assert r_propio.text == r_ajeno.text
    assert _reporte_operador(client, cab_b, SLUG_A).status_code == 403


def test_t15_403_y_404_del_operador_no_son_un_oraculo_de_clientes(client, monkeypatch):
    """Vector: contar clientes por diferencia de respuesta. Para el NO operador
    el 403 tiene que ser idéntico exista o no el slug (si no, cualquier owner
    enumera la cartera entera de la plataforma)."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    existe = _reporte_operador(client, cab_a, SLUG_B)
    no_existe = _reporte_operador(client, cab_a, "nooooexiste")
    assert existe.status_code == no_existe.status_code == 403
    assert existe.text == no_existe.text


def test_t16_un_operador_que_deja_de_serlo_pierde_el_reporte(client, monkeypatch):
    """Vector: ``OPERADOR_EMAILS`` se lee en cada pedido (``es_operador``). Un
    token ya emitido no puede sobrevivir a que le saquen el correo de la lista."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    assert _reporte_operador(client, cab_op, SLUG_A).status_code == 200

    monkeypatch.setenv("OPERADOR_EMAILS", "otro@recabra.example")
    from app import plataforma_estado
    if hasattr(plataforma_estado, "limpiar_cache_estado"):
        plataforma_estado.limpiar_cache_estado()

    r = _reporte_operador(client, cab_op, SLUG_A)
    # 401 y no 403: el token de la consola deja de resolver cliente en cuanto
    # el correo sale de `OPERADOR_EMAILS`, así que muere antes de llegar a
    # `require_operador`. Cualquiera de los dos es una negación limpia; lo que
    # NO puede pasar es un 200.
    assert r.status_code in (401, 403), r.text
    assert PROVEEDOR_A not in r.text and str(CANON_A) not in r.text


# ════════════════════════════════════════════════════════════════════════════
# 3. BITÁCORA — el reporte del operador es un acceso; el del dueño no
# ════════════════════════════════════════════════════════════════════════════

def _lineas_bitacora():
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        return [
            (f.email, f.accion, f.periodo)
            for f in reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        ]
    finally:
        reg.close()


def test_t17_el_reporte_del_operador_deja_exactamente_una_linea(client, monkeypatch):
    """Vector: la constancia. Una consulta del operador que no deje línea rompe
    la contrapartida entera de la Fase 7 (frontera-6). Dos líneas por pedido
    también es un defecto: el conteo del reporte del cliente mentiría."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    antes = [l for l in _lineas_bitacora() if l[1] == "reporte"]
    assert antes == []

    cuerpo = _ok(_reporte_operador(client, cab_op, SLUG_A))
    despues = [l for l in _lineas_bitacora() if l[1] == "reporte"]

    assert len(despues) == 1, despues
    email, accion, periodo = despues[0]
    assert email == CORREO_OPERADOR
    assert accion == "reporte"
    v = cuerpo["ventana"]
    assert periodo == f"{SLUG_A}:{v['desde']}..{v['hasta']}"


def test_t18_el_periodo_de_la_bitacora_no_lleva_ningun_dato_de_negocio(client, monkeypatch):
    """Vector: ``periodo`` es texto libre en la tabla. Si alguien metiera ahí el
    nombre del cliente, un correo o una cifra, la bitácora —que se le muestra
    al titular en su propio reporte— se volvería un canal de fuga."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    _ok(_reporte_operador(client, cab_op, SLUG_A))
    _ok(_reporte_operador(client, cab_op, SLUG_B))

    for _email, accion, periodo in _lineas_bitacora():
        assert re.fullmatch(r"[A-Za-z0-9_\-]+(:\d{4}-\d{2}\.\.\d{4}-\d{2})?", periodo or ""), (
            accion, periodo)
        assert "@" not in (periodo or "")
        assert NOMBRE_A not in (periodo or "") and NOMBRE_B not in (periodo or "")
        assert str(int(CANON_A)) not in (periodo or "")


def test_t19_el_reporte_del_dueno_no_deja_linea_y_si_lista_la_del_operador(client, monkeypatch):
    """Vector doble: (a) el dueño mirando LO SUYO no es un acceso del operador,
    anotarlo desvirtuaría la tabla; (b) el acceso del operador tiene que
    aparecer después en el reporte del dueño, con el correo del operador — es
    exactamente lo que el cliente compra a cambio de que le saquen el umbral."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    antes = _lineas_bitacora()
    _ok(_reporte_dueno(client, cab_a))
    assert _lineas_bitacora() == antes, "el reporte del dueño anotó bitácora"

    _ok(_reporte_operador(client, cab_op, SLUG_A))
    cuerpo = _ok(_reporte_dueno(client, cab_a))

    lineas = [l for l in cuerpo["accesos"]["lineas"] if l["accion"] == "reporte"]
    assert len(lineas) == 1, lineas
    assert lineas[0]["operador"] == CORREO_OPERADOR
    assert _FECHA_RE.match(lineas[0]["fecha"]), lineas[0]["fecha"]
    # Y el del dueño sigue sin anotar: el conteo no crece por mirarse a sí mismo.
    de_nuevo = _ok(_reporte_dueno(client, cab_a))
    assert de_nuevo["accesos"]["total"] == cuerpo["accesos"]["total"]


# ════════════════════════════════════════════════════════════════════════════
# 4. CLAVES PROHIBIDAS, PII Y LA TARIFA — en CUALQUIER nivel
# ════════════════════════════════════════════════════════════════════════════

def _los_dos_reportes(client, monkeypatch):
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    return [
        ("dueño", _ok(_reporte_dueno(client, cab_a))),
        ("operador", _ok(_reporte_operador(client, cab_op, SLUG_A))),
    ]


def test_t20_ninguna_clave_prohibida_en_ningun_nivel(client, monkeypatch):
    """Vector: una fila de contrato que se cuela adentro de un objeto anidado.
    Se recorre el JSON entero, no el primer nivel."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        vistas = 0
        for ruta, claves in _claves(cuerpo):
            vistas += 1
            sucias = claves & CLAVES_PROHIBIDAS
            assert not sucias, f"[{quien}] clave prohibida {sucias} en {ruta}"
        assert vistas > 5, "el recorrido no encontró objetos: la prueba no probó nada"


def test_t21_email_solo_como_valor_de_accesos_lineas_operador(client, monkeypatch):
    """Vector: la clave ``email``. El único correo que el reporte puede llevar
    es el del OPERADOR que consultó, y sólo bajo ``accesos.lineas[].operador``.
    Ningún correo de usuario final, en ninguna forma."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        for ruta, claves in _claves(cuerpo):
            assert "email" not in claves, f"[{quien}] clave email en {ruta}"
            assert "correo" not in claves, f"[{quien}] clave correo en {ruta}"


def test_t22_ninguna_arroba_fuera_de_accesos_lineas_operador(client, monkeypatch):
    """Vector: la invariante más simple y más difícil de burlar — "ningún
    string del JSON trae una arroba", salvo el correo del operador que el
    titular tiene derecho a ver. Cubre el correo de un usuario final, el de un
    proveedor mal saneado y el que alguien meta en un nombre de cliente."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    _ok(_reporte_operador(client, cab_op, SLUG_A))  # que HAYA una línea con correo

    for quien, cuerpo in (
        ("dueño", _ok(_reporte_dueno(client, cab_a))),
        ("operador", _ok(_reporte_operador(client, cab_op, SLUG_A))),
    ):
        con_arroba = [(r, v) for r, v in _textos(cuerpo) if "@" in v]
        assert con_arroba, "no hay ninguna línea de acceso: la prueba no probó nada"
        for ruta, valor in con_arroba:
            assert _ruta_generica(ruta) == "$.accesos.lineas[].operador", (
                f"[{quien}] arroba fuera de la bitácora, en {ruta}: {valor!r}")
            assert valor == CORREO_OPERADOR, valor
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        for correo in (CORREO_DUENA_A, CORREO_DUENO_B, CORREO_PROVEEDOR_A):
            assert correo not in crudo, f"[{quien}] {correo} en el JSON"


def test_t23_la_tarifa_de_referencia_no_sale_nunca(client, monkeypatch):
    """Vector: la tarifa de referencia es el precio de lista del supermercado.
    Sólo puede salir el spread (una relación). Ni el valor, ni su suma, ni
    ningún múltiplo evidente."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        assert cuerpo["spread_actual"] is not None, quien
        assert cuerpo["spread_actual"]["spread_pct"] is not None, quien
        for ruta, valor in _numeros(cuerpo):
            assert valor != TARIFA_A, f"[{quien}] la tarifa apareció en {ruta}"
            assert valor != TARIFA_A * 1, f"[{quien}] la tarifa apareció en {ruta}"
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        for forma in (str(TARIFA_A), str(int(TARIFA_A)), "3141593"):
            assert forma not in crudo, f"[{quien}] la tarifa en texto: {forma}"


def test_t24_ninguna_nota_marca_ni_ficha_de_proveedor(client, monkeypatch):
    """Vector: el objeto del ORM devuelto entero. Si en vez del par
    (nombre, conteo) saliera el ``Supplier``, la nota interna y el teléfono
    viajarían con él."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        for sentinela in (NOTA_PROVEEDOR, NOTA_ESPACIO, NOTA_CONTRATO,
                          MARCA_CONTRATO, CONTACTO_PROVEEDOR, TELEFONO_PROVEEDOR_A):
            assert sentinela not in crudo, f"[{quien}] {sentinela!r} en el JSON"


def test_t25_el_proveedor_sale_saneado_en_todas_las_hojas(client, monkeypatch):
    """Vector: el saneo aplicado en ``/metricas`` pero olvidado en el reporte.
    El nombre crudo del proveedor de A lleva un correo y un teléfono adentro;
    tiene que salir con las dos máscaras, en ``valores[].top_proveedores`` y en
    cualquier otro lugar donde aparezca."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        tops = [p for v in cuerpo["valores"] for p in v["top_proveedores"]]
        assert tops, f"[{quien}] ningún proveedor en valores: la prueba no probó nada"
        for p in tops:
            assert set(p.keys()) == CLAVES_TOP, p
            assert MASCARA_CORREO in p["nombre"], p["nombre"]
            assert MASCARA_TELEFONO in p["nombre"], p["nombre"]
            assert "@" not in p["nombre"]
            assert not re.search(r"\d{7,}", p["nombre"]), p["nombre"]
            assert p["contratos"] == 1

        for ruta, valor in _textos(cuerpo):
            if _ruta_generica(ruta) == "$.accesos.lineas[].operador":
                continue
            assert TELEFONO_PROVEEDOR_A not in valor, f"[{quien}] teléfono crudo en {ruta}"
            assert CORREO_PROVEEDOR_A not in valor, f"[{quien}] correo crudo en {ruta}"


def test_t26_todas_las_fechas_van_sin_hora(client, monkeypatch):
    """Vector: una hora es un dato de comportamiento (a qué hora trabaja quién).
    La spec exige día pelado en ``aceptada_en``, ``capturado_en`` y
    ``accesos.lineas[].fecha``."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    _ok(_reporte_operador(client, cab_op, SLUG_A))

    for quien, cuerpo in (
        ("dueño", _ok(_reporte_dueno(client, cab_a))),
        ("operador", _ok(_reporte_operador(client, cab_op, SLUG_A))),
    ):
        assert _FECHA_RE.match(cuerpo["politica"]["aceptada_en"] or ""), quien
        vistas = 0
        for v in cuerpo["valores"]:
            if v["capturado_en"] is not None:
                assert _FECHA_RE.match(v["capturado_en"]), (quien, v["capturado_en"])
                vistas += 1
        assert vistas >= 1, f"[{quien}] ningún capturado_en: la prueba no probó nada"
        assert cuerpo["accesos"]["lineas"], quien
        for l in cuerpo["accesos"]["lineas"]:
            assert _FECHA_RE.match(l["fecha"]), (quien, l["fecha"])
        # `generado_en` SÍ lleva hora: es el sello del documento, no un dato
        # tomado de nadie.
        assert cuerpo["generado_en"].endswith("Z")


def test_t27_el_shape_es_exactamente_el_del_contrato(client, monkeypatch):
    """Vector: una clave de más. El shape es VINCULANTE y el frontend lo
    consume tal cual; cualquier campo extra es superficie nueva sin auditar."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        assert set(cuerpo) == CLAVES_NIVEL1, quien
        assert set(cuerpo["cliente"]) == CLAVES_CLIENTE, quien
        assert set(cuerpo["ventana"]) == CLAVES_VENTANA, quien
        assert set(cuerpo["politica"]) == CLAVES_POLITICA, quien
        assert set(cuerpo["accesos"]) == CLAVES_ACCESOS, quien
        assert set(cuerpo["derechos"]) == CLAVES_DERECHOS, quien
        assert set(cuerpo["spread_actual"]) == CLAVES_SPREAD, quien
        for it in cuerpo["catalogo"]:
            assert set(it) == CLAVES_CATALOGO, it
        for v in cuerpo["valores"]:
            assert set(v) == CLAVES_VALOR, v
        for l in cuerpo["accesos"]["lineas"]:
            assert set(l) == CLAVES_LINEA, l


def test_t28_los_unicos_arreglos_son_los_del_contrato(client, monkeypatch):
    """Vector: un arreglo nuevo es, casi siempre, una lista de filas. Se
    enumeran TODOS los del JSON por su ruta genérica."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        rutas = {_ruta_generica(r) for r, _n in _arreglos(cuerpo)}
        assert rutas, "el recorrido no encontró arreglos: la prueba no probó nada"
        permitidas = ARREGLOS_PERMITIDOS | {
            "$.valores[].top_proveedores", "$.catalogo[].endpoints"}
        assert rutas <= permitidas, f"[{quien}] arreglos inesperados: {rutas - permitidas}"


# ════════════════════════════════════════════════════════════════════════════
# 5. SÓLO LECTURA Y AISLAMIENTO DE BASES
# ════════════════════════════════════════════════════════════════════════════

def _foto_de_la_base(slug):
    """Conteo de filas de las tablas de negocio + ``audit_log`` de un cliente."""
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry, LayoutSnapshot, Space, SpaceLease, Supplier

    db = sesion_de(buscar(slug))
    try:
        return {
            "spaces": db.query(Space).count(),
            "leases": db.query(SpaceLease).count(),
            "suppliers": db.query(Supplier).count(),
            "layouts": db.query(LayoutSnapshot).count(),
            "audit": db.query(AuditEntry).count(),
        }
    finally:
        db.close()


def test_t29_el_reporte_no_escribe_en_la_base_del_cliente(client, monkeypatch):
    """Vector: ``spread_actual`` abre la base de negocio de A. Abrirla para
    leer no puede dejar rastro — ni una fila nueva, ni una línea de
    ``audit_log`` (que es la bitácora del CLIENTE, no la de la plataforma)."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    antes = _foto_de_la_base(SLUG_A)
    _ok(_reporte_dueno(client, cab_a))
    _ok(_reporte_operador(client, cab_op, SLUG_A))
    _ok(_reporte_dueno(client, cab_a, meses=24))
    assert _foto_de_la_base(SLUG_A) == antes


def test_t30_el_spread_de_a_no_abre_la_base_de_b(client, monkeypatch):
    """Vector: ``spread_actual`` calculado con ``metricas_del_periodo`` (que
    recorre TODAS las bases) en vez de ``_metricas_de_un_cliente``. Con la base
    de un tercero ROTA, el reporte de A tiene que seguir dando 200 y con
    ``spread_actual`` NO nulo: si se cayera, es que estaba abriendo bases que
    no le corresponden."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch, con_roto=True)
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    # Y encima rompemos la de B, que sí existía cuando se publicó el snapshot.
    _romper(SLUG_B, NOMBRE_B)

    cuerpo = _ok(_reporte_dueno(client, cab_a))
    assert cuerpo["spread_actual"] is not None, "la base rota de un tercero tumbó el spread de A"
    assert cuerpo["spread_actual"]["spread_pct"] is not None
    assert cuerpo["spread_actual"]["tarifa_configurada"] is True


def test_t31_el_reporte_de_un_cliente_roto_no_filtra_el_mensaje_del_driver(client, monkeypatch):
    """Vector: la excepción de SQLite con la RUTA del archivo adentro. Con la
    base de B rota, su propio reporte tiene que dar 200 con
    ``spread_actual: null`` y sin una sola palabra del driver."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    _romper(SLUG_B, NOMBRE_B)
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    cuerpo = _ok(_reporte_operador(client, cab_op, SLUG_B))
    assert cuerpo["spread_actual"] is None, cuerpo["spread_actual"]

    crudo = json.dumps(cuerpo, ensure_ascii=False).lower()
    for veneno in ("sqlite", "traceback", "operationalerror", "sqlalchemy",
                   ".db", "/tmp", "no such table", "file is not a database"):
        assert veneno not in crudo, f"el driver se filtró: {veneno}"


# ════════════════════════════════════════════════════════════════════════════
# 6. FRENO, VALIDACIÓN Y EL INTERRUPTOR DE COBRANZA
# ════════════════════════════════════════════════════════════════════════════

def test_t32_el_freno_es_compartido_entre_export_y_reporte(client, monkeypatch):
    """Vector: dos endpoints owner-only que devuelven todo lo del cliente, con
    contadores separados, son 6 descargas por hora disfrazadas de 3. La spec
    manda el MISMO freno: el 4.º pedido de la hora, mezclando los dos, es 429."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    assert client.get("/api/clientes/mi-export", headers=cab_a).status_code == 200
    assert _reporte_dueno(client, cab_a).status_code == 200
    assert client.get("/api/clientes/mi-export", headers=cab_a).status_code == 200

    cuarto = _reporte_dueno(client, cab_a)
    assert cuarto.status_code == 429, cuarto.text
    # Y el export tampoco, en el mismo cupo.
    assert client.get("/api/clientes/mi-export", headers=cab_a).status_code == 429


def test_t33_el_endpoint_del_operador_no_tiene_el_freno_del_dueno(client, monkeypatch):
    """Caracterización: el freno de 3/hora vive en ``export_attempts``, que es
    por ``usuario_id`` del DUEÑO. El del operador no lo comparte (es otra
    puerta, con bitácora). Se documenta el comportamiento REAL para que un
    cambio futuro no pase inadvertido."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    for _ in range(5):
        assert _reporte_operador(client, cab_op, SLUG_A).status_code == 200
    assert len([l for l in _lineas_bitacora() if l[1] == "reporte"]) == 5


@pytest.mark.parametrize("meses", [0, 25, -1, "abc", "1e3", "", "12.5", "٣"])
def test_t34_meses_invalido_es_422_y_no_deja_bitacora(client, monkeypatch, meses):
    """Vector: ``meses`` es lo único que el atacante controla en los dos
    endpoints. Fuera de 1..24 → 422, sin caerse al default en silencio y sin
    anotar un acceso que no ocurrió."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    antes = _lineas_bitacora()

    r_op = _reporte_operador(client, cab_op, SLUG_A, meses=meses)
    assert r_op.status_code == 422, (meses, r_op.status_code, r_op.text)
    assert _lineas_bitacora() == antes, f"meses={meses!r} anotó bitácora"

    r_du = _reporte_dueno(client, cab_a, meses=meses)
    assert r_du.status_code == 422, (meses, r_du.status_code, r_du.text)
    assert _lineas_bitacora() == antes


def test_t35_meses_valido_manda_la_ventana(client, monkeypatch):
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    for meses in (1, 12, 24):
        cuerpo = _ok(_reporte_dueno(client, cab_a, meses=meses))
        assert cuerpo["ventana"]["meses"] == meses
        assert len(cuerpo["valores"]) == meses


# H-1 de Fase 7 (mayor), RESUELTO en `routers/derechos.py::mi_reporte_plataforma`:
# el freno de 3/hora se cobraba ANTES de validar `meses`, así que tres pedidos
# que igual iban a terminar en 422 dejaban al titular sin derecho de acceso por
# una hora (y el cupo lo comparte con /mi-export). Ahora
# `1 <= meses <= MESES_MAXIMO` se chequea antes de
# `_chequear_y_anotar_freno_export`. El test queda como guardián de regresión.
def test_t36_un_meses_invalido_no_consume_el_freno_del_dueno(client, monkeypatch):
    """Vector: quemar el cupo del dueño con pedidos que igual van a fallar. Si
    el freno se cobra ANTES de validar ``meses``, tres 422 dejan al titular sin
    poder ejercer su derecho durante una hora — un bloqueo de habeas data
    disparable por él mismo (o por cualquier XSS en su sesión)."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    # Fuera de rango por ABAJO.
    for _ in range(3):
        assert _reporte_dueno(client, cab_a, meses=0).status_code == 422

    r = _reporte_dueno(client, cab_a)
    assert r.status_code == 200, (
        "tres pedidos INVÁLIDOS (meses=0) agotaron el cupo de 3/hora del "
        f"titular: {r.status_code} {r.text}")

    # Y fuera de rango por ARRIBA: el mismo vector con `meses=25` tampoco puede
    # cobrar cupo. Van 1 de 3 consumidos; estos tres 422 no pueden sumar y el
    # que sigue tiene que ser el 2.º válido, no un 429.
    for _ in range(3):
        assert _reporte_dueno(client, cab_a, meses=25).status_code == 422

    r = _reporte_dueno(client, cab_a)
    assert r.status_code == 200, (
        "tres pedidos INVÁLIDOS (meses=25) agotaron el cupo de 3/hora del "
        f"titular: {r.status_code} {r.text}")


def test_t37_el_cliente_suspendido_conserva_el_reporte(client, monkeypatch):
    """Vector: el interruptor de cobranza como bloqueo de habeas data. Un
    cliente suspendido tiene que poder seguir auditando qué le tomaron — igual
    que el export y la supresión."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    _estado(SLUG_A, "suspendido")

    # El resto de la app sí está cortada: si no, la prueba no probó nada.
    assert client.get("/api/spaces/map", headers=cab_a).status_code == 402

    cuerpo = _ok(_reporte_dueno(client, cab_a))
    assert cuerpo["cliente"]["slug"] == SLUG_A

    from app.clientes import _EXENTOS_POR_HABEAS_DATA
    assert "/api/clientes/mi-reporte-plataforma" in _EXENTOS_POR_HABEAS_DATA


def test_t38_la_exencion_tiene_frontera_de_segmento(client, monkeypatch):
    """Vector: hallazgo H-3 revisitado. ``/api/clientes/mi-reporte-plataformaX``
    no puede heredar la exención de ``/api/clientes/mi-reporte-plataforma`` por
    un ``startswith`` suelto."""
    from app.clientes import _EXENTOS_POR_HABEAS_DATA, _path_bajo

    assert _path_bajo("/api/clientes/mi-reporte-plataforma", _EXENTOS_POR_HABEAS_DATA)
    assert not _path_bajo("/api/clientes/mi-reporte-plataformaX", _EXENTOS_POR_HABEAS_DATA)
    assert not _path_bajo("/api/clientes/mi-reporte-plataforma-privado", _EXENTOS_POR_HABEAS_DATA)


def test_t39_orden_de_rutas_literal_antes_de_parametrica(client):
    """Vector: la regla dura de FastAPI. ``/clientes/{slug}/reporte`` declarada
    antes que ``/clientes`` o ``/metricas`` se las tragaría."""
    from conftest import rutas_planas

    caminos = [r.path for r in rutas_planas(client.app)]
    assert "/api/plataforma/clientes/{slug}/reporte" in caminos, caminos
    i_param = caminos.index("/api/plataforma/clientes/{slug}/reporte")

    for literal in ("/api/plataforma/metricas", "/api/plataforma/tendencia",
                    "/api/plataforma/adopcion", "/api/plataforma/supresiones",
                    "/api/plataforma/soy", "/api/plataforma/clientes"):
        assert literal in caminos, literal
        assert caminos.index(literal) < i_param, f"{literal} declarada DESPUÉS de la paramétrica"

    # Y la del dueño es literal, sin ningún segmento variable.
    assert "/api/clientes/mi-reporte-plataforma" in caminos
    assert "{" not in "/api/clientes/mi-reporte-plataforma"


# ════════════════════════════════════════════════════════════════════════════
# 7. LOS RESTOS DE K=3
# ════════════════════════════════════════════════════════════════════════════

def test_t40_no_queda_ni_una_mencion_de_la_supresion_de_celda_chica(client):
    """Vector: media quita. Un ``K_MINIMO`` olvidado en un helper o un
    ``Suprimido`` en un componente del frontend deja la regla vieja viva en
    algún camino. La política (``docs/legal``, ``src/legal``) sí puede
    mencionarla: cuenta la historia del trato."""
    salida = subprocess.run(
        ["grep", "-rn", "-E", r"K_MINIMO|_suprimir_celda_chica|Suprimido|suprimido por privacidad",
         str(REPO / "backend" / "app"), str(REPO / "frontend" / "src")],
        capture_output=True, text=True,
    ).stdout
    restos = [
        l for l in salida.splitlines()
        if l.strip() and "/legal/" not in l and "__pycache__" not in l
    ]
    assert restos == [], "\n".join(restos)


def test_t41_con_un_contrato_las_metricas_salen_exactas(client, monkeypatch):
    """El checklist de la spec, al peso: un cliente con UN contrato de
    4.173.919 publica ingreso 4.173.919, canon promedio 4.173.919 y el
    proveedor — sin un solo ``null`` por umbral."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    cuerpo = _ok(client.get("/api/plataforma/metricas", headers=cab_op))
    fila = next(c for c in cuerpo["clientes"] if c["slug"] == SLUG_A)
    m = fila["metricas"]

    assert m["ingreso_contratado_mes"] == CANON_A
    assert m["canon_promedio_mensual"] == CANON_A
    assert len(m["top_proveedores"]) == 1
    assert m["top_proveedores"][0]["contratos_activos"] == 1
    assert MASCARA_CORREO in m["top_proveedores"][0]["nombre"]
    assert m["spread_pct"] is not None, "spread con 1 contrato con tarifa: número, no null"
    assert m["spread_pct"] == round((CANON_A / TARIFA_A - 1) * 100, 1)


def test_t42_el_consolidado_suma_a_todos_los_legibles(client, monkeypatch):
    """Vector: el consolidado que excluía a los suprimidos (Fase 6). Sin
    umbral, tiene que ser la Σ EXACTA de todos los legibles — ingreso, canon
    ponderado (Σ/Σ, nunca promedio de promedios) y spread Σ/Σ."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    cuerpo = _ok(client.get("/api/plataforma/metricas", headers=cab_op))
    cons = cuerpo["consolidado"]
    legibles = [c for c in cuerpo["clientes"] if c["metricas"] is not None]
    suma = sum(c["metricas"]["ingreso_contratado_mes"] for c in legibles)
    contratos = sum(
        1 for c in legibles for p in c["metricas"]["top_proveedores"] for _ in range(p["contratos_activos"])
    )

    assert cons["ingreso_contratado_mes"] == suma == CANON_A + CANON_B
    assert cons["canon_promedio_mensual"] == round((CANON_A + CANON_B) / contratos, 2)
    # Sólo A tiene tarifa: el spread consolidado es Σ/Σ y coincide con el suyo.
    assert cons["spread_pct"] == round((CANON_A / TARIFA_A - 1) * 100, 1)
    assert cons["clientes_con_tarifa"] == 1


def test_t43_con_cero_contratos_el_ingreso_es_cero_y_el_canon_null(client, monkeypatch):
    """Vector: el ``null`` por ausencia de dato confundido con el ``null`` por
    umbral. Con 0 contratos el ingreso es 0.0 (un número real) y el promedio es
    ``null`` (no existe el promedio de cero términos)."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    cuerpo = _ok(client.get("/api/plataforma/metricas", headers=cab_op))
    vacio = next(c for c in cuerpo["clientes"] if c["slug"] == "galerias")
    m = vacio["metricas"]

    assert m["ingreso_contratado_mes"] == 0.0
    assert isinstance(m["ingreso_contratado_mes"], float)
    assert m["canon_promedio_mensual"] is None
    assert m["top_proveedores"] == []
    assert m["spread_pct"] is None
    assert m["contratos_sin_tarifa"] == 0


def test_t44_la_tendencia_publica_el_mes_exacto(client, monkeypatch):
    """Vector: ``publicar_fila`` era el otro lugar donde vivía el umbral. La
    serie de A tiene que publicar el mes en curso con el número exacto."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import periodo_actual

    cuerpo = _ok(client.get(f"/api/plataforma/tendencia?cliente={SLUG_A}&meses=3", headers=cab_op))
    punto = next(p for p in cuerpo["serie"] if p["periodo"] == periodo_actual())

    assert punto["sin_dato"] is False
    assert punto["ingreso_contratado_mes"] == CANON_A
    assert punto["canon_promedio_mensual"] == CANON_A
    assert punto["top_proveedores"][0]["contratos_activos"] == 1
    assert MASCARA_CORREO in punto["top_proveedores"][0]["nombre"]
    # Ninguno de los agregados de negocio sale `null`: eso era el umbral.
    for clave in ("sedes_con_plano", "espacios_comercializables", "ocupacion_pct",
                  "canon_promedio_mensual", "ingreso_contratado_mes", "usuarios_con_cuenta"):
        assert punto[clave] is not None, f"{clave} salió null"


def test_t45_la_tendencia_consolidada_tambien_suma_a_todos(client, monkeypatch):
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import periodo_actual

    cuerpo = _ok(client.get("/api/plataforma/tendencia?meses=3", headers=cab_op))
    punto = next(p for p in cuerpo["serie"] if p["periodo"] == periodo_actual())
    assert punto["ingreso_contratado_mes"] == CANON_A + CANON_B
    assert punto["canon_promedio_mensual"] == round((CANON_A + CANON_B) / 2, 2)


def test_t46_el_reporte_tampoco_suprime_celdas_chicas(client, monkeypatch):
    """Vector: la supresión reintroducida "por las dudas" en el reporte. Es la
    auditoría del cliente sobre SUS PROPIOS datos: suprimirle su único contrato
    sería negarle el derecho que la Fase 7 le acaba de dar."""
    for quien, cuerpo in _los_dos_reportes(client, monkeypatch):
        from app.plataforma_metricas import periodo_actual

        fila = next(v for v in cuerpo["valores"] if v["periodo"] == periodo_actual())
        assert fila["sin_dato"] is False, quien
        assert fila["canon_total"] == CANON_A, quien
        assert fila["canon_promedio_mensual"] == CANON_A, quien
        assert fila["contratos_activos"] == 1, quien
        assert len(fila["top_proveedores"]) == 1, quien
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        assert "Suprimido" not in crudo and "suprimid" not in crudo.lower(), quien


# ════════════════════════════════════════════════════════════════════════════
# 8. POLÍTICA Y CONSENTIMIENTO
# ════════════════════════════════════════════════════════════════════════════

def test_t47_la_politica_dice_lo_que_la_fase_7_cambio(client):
    """Vector: el trato nuevo sin respaldo escrito. §5.3 tiene que nombrar los
    agregados exactos, la falta de umbral, el reporte, su endpoint y la
    bitácora — es la base legal que el propio reporte cita."""
    texto = (REPO / "docs" / "legal" / "politica-datos.md").read_text(encoding="utf-8")
    for frase in ("agregados exactos", "sin umbral", "reporte de transparencia",
                  "mi-reporte-plataforma", "bitácora"):
        assert frase in texto, f"la política no dice {frase!r}"


def test_t48_la_copia_del_frontend_es_byte_identica(client):
    a = (REPO / "docs" / "legal" / "politica-datos.md").read_bytes()
    b = (REPO / "frontend" / "src" / "legal" / "politica-datos.md").read_bytes()
    assert a == b, "las dos copias de la política divergieron"


def test_t49_la_version_subio_y_la_cabecera_la_dice(client):
    from app.models.consentimiento import VERSION_POLITICA

    assert VERSION_POLITICA == "2026-09-v2", VERSION_POLITICA
    texto = (REPO / "docs" / "legal" / "politica-datos.md").read_text(encoding="utf-8")
    cabecera = "\n".join(texto.splitlines()[:12])
    assert VERSION_POLITICA in cabecera, cabecera


def test_t50_un_consentimiento_viejo_dispara_el_re_consentimiento(client, monkeypatch):
    """Vector: subir la versión sin que el flujo se dispare. Un usuario con fila
    SÓLO para ``2026-09-v1`` tiene que recibir ``pedir_consentimiento: true`` al
    entrar; y el reporte tiene que decir que no aceptó la vigente."""
    _ids, cab_a, _cab_b, _cab_op, alta_a, _b = _campo(client, monkeypatch)

    from app.clientes import sesion_registro
    from app.models.consentimiento import Consentimiento

    reg = sesion_registro()
    try:
        filas = reg.query(Consentimiento).all()
        assert filas, "el alta no dejó consentimiento: la prueba no probó nada"
        for f in filas:
            f.version = "2026-09-v1"
        reg.commit()
    finally:
        reg.close()

    r = client.post("/api/auth/oauth", json={"id_token": "uid-a"})
    assert r.status_code == 200, r.text
    assert r.json().get("pedir_consentimiento") is True, r.json()

    cuerpo = _ok(_reporte_dueno(client, _cab(r.json()["token"])))
    assert cuerpo["politica"]["version_aceptada"] is None
    assert cuerpo["politica"]["aceptada_en"] is None
    assert cuerpo["politica"]["version_vigente"] == "2026-09-v2"


def test_t51_el_login_legado_sigue_funcionando_tras_subir_la_version(client):
    """Vector: el re-consentimiento rompiendo la puerta que no tiene identidad.
    La clave compartida no tiene ``sub`` contra el cual guardar una aceptación:
    tiene que seguir entrando igual."""
    from tests.conftest import CLAVE_ADMIN, CLAVE_WORKER

    for clave in (CLAVE_ADMIN, CLAVE_WORKER):
        r = client.post("/api/auth/login", json={"password": clave})
        assert r.status_code == 200, r.text
        assert r.json().get("pedir_consentimiento") in (None, False), r.json()


# ════════════════════════════════════════════════════════════════════════════
# 9. SEGUNDA VUELTA — los bordes que la primera dejó abiertos
# ════════════════════════════════════════════════════════════════════════════

def test_t52_un_slug_que_es_prefijo_de_otro_no_cruza_la_bitacora(client, monkeypatch):
    """Vector: el filtro de accesos compara con ``periodo.startswith(slug + ":")``.
    Si alguien sacara los dos puntos —o el slug tuviera una forma que los
    admita—, ``alfa`` se llevaría los accesos de ``alfa2``. Se funda un cliente
    cuyo slug EMPIEZA por el de A y se comprueba que no se mezclan en ninguna
    de las dos direcciones."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    ids = Identidades(client)
    ids.mapa["uid-a"] = _claims("uid-a", CORREO_DUENA_A)
    alta_a2 = _fundar(ids, "uid-a2", "duena@alfados.example", f"{SLUG_A}dos", "Alfa Dos")

    _bitacora(CORREO_OPERADOR, "tendencia", f"{SLUG_A}dos:2026-01..2026-09")
    _bitacora(CORREO_OPERADOR, "reporte", f"{SLUG_A}dos:2026-01..2026-09")
    _bitacora(CORREO_OPERADOR, "tendencia", f"{SLUG_A}:2026-01..2026-09")

    de_a = _ok(_reporte_dueno(client, cab_a))
    periodos_a = [l["periodo"] for l in de_a["accesos"]["lineas"]]
    assert f"{SLUG_A}dos:2026-01..2026-09" not in periodos_a
    assert f"{SLUG_A}:2026-01..2026-09" in periodos_a

    de_a2 = _ok(_reporte_dueno(client, _cab(alta_a2["token"])))
    periodos_a2 = [l["periodo"] for l in de_a2["accesos"]["lineas"]]
    assert f"{SLUG_A}:2026-01..2026-09" not in periodos_a2
    assert f"{SLUG_A}dos:2026-01..2026-09" in periodos_a2


@pytest.mark.parametrize("veneno", [
    "../../etc/passwd", "..%2F..%2Fetc", "alfa:2020-01..2020-02",
    "ALFA", "alfa ", "alfa%00", "alfa'--", "a" * 300, "__consolidado__",
])
def test_t53_un_slug_veneno_no_abre_nada_ni_ensucia_la_bitacora(client, monkeypatch, veneno):
    """Vector doble: (a) recorrer el disco o inyectar por el segmento del path;
    (b) envenenar el ``periodo`` de la bitácora —que después se le MUESTRA al
    titular en su reporte— con una cadena arbitraria. Un slug que no existe
    tiene que dar 404 con texto fijo y NO dejar línea; ``ALFA``/``alfa `` sí
    resuelven (el router normaliza) y por eso dejan la línea normalizada."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    antes = _lineas_bitacora()

    r = _reporte_operador(client, cab_op, veneno)
    assert r.status_code in (200, 404, 422), (veneno, r.status_code, r.text)

    nuevas = _lineas_bitacora()[len(antes):]
    if r.status_code != 200:
        # O el 404 con texto FIJO del router, o el 404 genérico de Starlette
        # cuando la cadena ni siquiera llega a matchear la ruta (barras
        # adentro del segmento). Ninguno de los dos puede filtrar nada.
        # «Not found» es el del catch-all de la SPA; «Not Found» el de Starlette
        # cuando ninguna ruta matchea (httpx 0.27 no normaliza los `..`, 0.28 sí).
        assert r.json()["detail"] in ("No hay un cliente con ese código.", "Not found", "Not Found"), r.text
        assert veneno not in r.text or r.json()["detail"] in ("Not found", "Not Found")
        for pista in ("passwd", "sqlite", "/tmp", "Traceback", NOMBRE_A):
            assert pista not in r.text, (veneno, r.text)
        assert nuevas == [], (veneno, nuevas)
    else:
        # Resolvió: el slug de la línea es el NORMALIZADO, no lo que se tecleó.
        assert r.json()["cliente"]["slug"] == SLUG_A
        assert len(nuevas) == 1
        assert nuevas[0][2].startswith(f"{SLUG_A}:"), nuevas
        assert veneno.strip().lower() == SLUG_A


def test_t54_un_proveedores_json_ilegible_no_tumba_ni_filtra(client, monkeypatch):
    """Vector: ``snapshot_metricas.proveedores_json`` es TEXTO. Una fila
    corrupta —o una que alguien escriba a mano con una lista adentro— no puede
    tumbar el reporte ni dejar salir el crudo tal cual."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import periodo_actual

    veneno = '["no soy un dict", "' + CORREO_PROVEEDOR_A + '"]'
    reg = sesion_registro()
    try:
        fila = (
            reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug == SLUG_A,
                    SnapshotMetricas.periodo == periodo_actual())
            .first()
        )
        assert fila is not None
        fila.proveedores_json = veneno
        reg.commit()
    finally:
        reg.close()

    cuerpo = _ok(_reporte_dueno(client, cab_a))
    actual = next(v for v in cuerpo["valores"] if v["periodo"] == periodo_actual())
    assert actual["top_proveedores"] == []
    crudo = json.dumps(cuerpo, ensure_ascii=False)
    assert CORREO_PROVEEDOR_A not in crudo
    assert "no soy un dict" not in crudo


def test_t55_un_nombre_crudo_persistido_sale_saneado_al_leer(client, monkeypatch):
    """Vector: frontera-2 aplicado al reporte. El snapshot guarda el nombre ya
    saneado, pero una fila vieja (o escrita por otro camino) puede tener el
    crudo. El reporte sanea AL LEER, así que ni una fila histórica sucia puede
    devolver el correo de un proveedor al JSON."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas
    from app.plataforma_metricas import periodo_actual

    crudo_sucio = f"Panaderia Sur contacto@panaderia-sur.example tel 3011234567"
    reg = sesion_registro()
    try:
        fila = (
            reg.query(SnapshotMetricas)
            .filter(SnapshotMetricas.cliente_slug == SLUG_A,
                    SnapshotMetricas.periodo == periodo_actual())
            .first()
        )
        fila.proveedores_json = json.dumps({crudo_sucio: 2}, ensure_ascii=False)
        reg.commit()
    finally:
        reg.close()

    cuerpo = _ok(_reporte_dueno(client, cab_a))
    actual = next(v for v in cuerpo["valores"] if v["periodo"] == periodo_actual())
    assert len(actual["top_proveedores"]) == 1
    nombre = actual["top_proveedores"][0]["nombre"]
    assert MASCARA_CORREO in nombre and MASCARA_TELEFONO in nombre, nombre
    texto = json.dumps(cuerpo, ensure_ascii=False)
    assert "contacto@panaderia-sur.example" not in texto
    assert "3011234567" not in texto


@pytest.mark.parametrize("metodo", ["post", "put", "patch", "delete"])
def test_t56_los_dos_endpoints_son_solo_lectura(client, monkeypatch, metodo):
    """Vector: el reporte es informativo. Ningún verbo que mute puede existir,
    y un intento no puede dejar línea de bitácora (sería una constancia de un
    acceso que no ocurrió)."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    antes = _lineas_bitacora()

    r1 = getattr(client, metodo)("/api/clientes/mi-reporte-plataforma", headers=cab_a)
    r2 = getattr(client, metodo)(f"/api/plataforma/clientes/{SLUG_A}/reporte", headers=cab_op)
    assert r1.status_code in (404, 405), (metodo, r1.status_code)
    assert r2.status_code in (404, 405), (metodo, r2.status_code)
    assert _lineas_bitacora() == antes


def test_t57_el_panel_del_operador_no_se_corta_por_el_estado_de_cuenta(client, monkeypatch):
    """Vector: el interruptor de cobranza aplicado al panel. El reporte del
    OPERADOR sobre un cliente suspendido tiene que seguir dando 200 —el panel
    opera sobre el registro— y el del DUEÑO también (habeas data)."""
    _ids, cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    _estado(SLUG_A, "suspendido")

    assert _reporte_operador(client, cab_op, SLUG_A).status_code == 200
    assert _reporte_dueno(client, cab_a).status_code == 200


def test_t58_la_tarifa_se_puede_despejar_del_spread_riesgo_ACEPTADO(client, monkeypatch):
    """CARACTERIZACIÓN de un riesgo YA ACEPTADO y documentado (``docs/ESTADO.md``,
    "Riesgo residual aceptado ... vigente tras Fase 7").

    Con UN contrato con tarifa aplicable y ``contratos_sin_tarifa == 0``, el
    ingreso publicado y el ``spread_pct`` despejan la tarifa de referencia
    unitaria: ``ingreso / (1 + spread/100)``. Hasta la Fase 6 K=3 lo acotaba a
    la frontera de tres contratos; sin umbral no tiene frontera. **No se afirma
    que esté bien**: se MIDE la precisión para que un cambio futuro que la
    empeore (más decimales en el spread) no pase inadvertido, y para que el
    informe pueda contestar "¿el operador puede obtener la tarifa?" con un
    número en vez de una opinión."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)
    cuerpo = _ok(_reporte_operador(client, cab_op, SLUG_A))
    spread = cuerpo["spread_actual"]
    assert spread["contratos_sin_tarifa"] == 0 and spread["tarifa_configurada"] is True

    despejada = CANON_A / (1 + spread["spread_pct"] / 100)
    error_relativo = abs(despejada - TARIFA_A) / TARIFA_A

    # El redondeo a 1 decimal del spread es lo ÚNICO que separa al operador de
    # la tarifa exacta: hoy le deja ~3 cifras significativas.
    assert error_relativo < 0.01, error_relativo
    assert error_relativo > 0.0, "el spread publicado despeja la tarifa EXACTA"


def test_t59_la_ventana_de_accesos_sigue_a_meses(client, monkeypatch):
    """Vector: una ventana de accesos que no respeta ``meses`` mostraría (o
    escondería) accesos fuera del rango que el titular pidió."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)

    viejo = datetime.now(timezone.utc) - timedelta(days=200)
    _bitacora(CORREO_OPERADOR, "metricas", "2026-01", cuando=viejo)

    de_un_mes = _ok(_reporte_dueno(client, cab_a, meses=1))
    de_doce = _ok(_reporte_dueno(client, cab_a, meses=12))

    assert "2026-01" not in [l["periodo"] for l in de_un_mes["accesos"]["lineas"]]
    assert "2026-01" in [l["periodo"] for l in de_doce["accesos"]["lineas"]]
    assert de_doce["accesos"]["total"] > de_un_mes["accesos"]["total"]


def test_t60_la_ventana_de_valores_es_consecutiva_y_termina_hoy(client, monkeypatch):
    """Vector: una ventana corrida deja al titular auditando meses que no pidió
    —o le esconde el mes en curso, que es el que el operador está mirando."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    from app.plataforma_metricas import periodo_actual
    from app.plataforma_tendencia import MESES_MAXIMO

    for meses in (1, 6, 24):
        cuerpo = _ok(_reporte_dueno(client, cab_a, meses=meses))
        periodos = [v["periodo"] for v in cuerpo["valores"]]
        assert len(periodos) == meses <= MESES_MAXIMO
        assert periodos == sorted(periodos)
        assert periodos[-1] == periodo_actual() == cuerpo["ventana"]["hasta"]
        assert periodos[0] == cuerpo["ventana"]["desde"]
        assert len(set(periodos)) == meses


def test_t61_el_catalogo_declara_todo_lo_que_metricas_y_adopcion_publican(client, monkeypatch):
    """Vector: la plataforma toma un dato que el catálogo no declara. El
    catálogo ES la justificación de la toma; un agregado publicado y no
    declarado convierte el reporte en un documento que miente por omisión."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    metricas = _ok(client.get("/api/plataforma/metricas", headers=cab_op))
    fila = next(c for c in metricas["clientes"] if c["slug"] == SLUG_A)
    publicadas_metricas = set(fila["metricas"]) | {"estado_cuenta"}

    adopcion = _ok(client.get("/api/plataforma/adopcion", headers=cab_op))
    fila_ad = next(c for c in adopcion["clientes"] if c["slug"] == SLUG_A)
    publicadas_adopcion = set(fila_ad) - {"slug", "nombre", "error"}

    cuerpo = _ok(_reporte_operador(client, cab_op, SLUG_A))
    catalogo = {i["clave"]: i for i in cuerpo["catalogo"]}

    faltan_m = publicadas_metricas - set(catalogo)
    assert not faltan_m, f"/metricas publica sin declarar: {faltan_m}"
    faltan_a = publicadas_adopcion - set(catalogo)
    assert not faltan_a, f"/adopcion publica sin declarar: {faltan_a}"

    # Y al revés: nada declarado que no exista (un catálogo inflado también
    # desinforma).
    for clave, item in catalogo.items():
        if "metricas" in item["endpoints"]:
            assert clave in publicadas_metricas, f"{clave} dice salir en /metricas y no sale"
        if "adopcion" in item["endpoints"]:
            assert clave in publicadas_adopcion, f"{clave} dice salir en /adopcion y no sale"


# H-2 de Fase 7 (menor), RESUELTO en `app/plataforma_reporte.py::CATALOGO`:
# `valores[]` publicaba `ocupadas`, `contratos_activos` y `canon_total` sin
# ninguna entrada que las declarara -- el titular veía el número sin definición,
# fuente ni finalidad. Se agregaron esas tres más `origen` y `capturado_en`
# (`endpoints: ["reporte"]`), y por eso `metadatos` acá se estrechó a las dos
# claves que son ESTRUCTURA del reporte y no dato tomado del cliente.
def test_t62_cada_cifra_de_valores_tiene_su_entrada_en_el_catalogo(client, monkeypatch):
    """Vector: el reporte muestra un número que su propio catálogo no explica.
    Es la promesa central de la Fase 7 —"cada dato que la plataforma tomó de
    él, cómo lo calculó, de dónde y para qué"— aplicada a la letra."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    cuerpo = _ok(_reporte_dueno(client, cab_a))

    # Sólo `periodo` (el eje de la ventana) y `sin_dato` (el marcador de fila
    # vacía) son estructura; todo lo demás, `origen` y `capturado_en` incluidos,
    # tiene que estar declarado en el catálogo.
    metadatos = {"periodo", "sin_dato"}
    declaradas = {i["clave"] for i in cuerpo["catalogo"]}
    for valor in cuerpo["valores"]:
        sin_declarar = set(valor) - metadatos - declaradas
        assert not sin_declarar, f"cifras sin entrada en el catálogo: {sorted(sin_declarar)}"


def test_t63_el_ultimo_acceso_declarado_sin_hora_sale_sin_hora(client, monkeypatch):
    """Vector: el catálogo dice ``tratamiento: "sin_hora"`` para
    ``ultimo_acceso``. Si ``/metricas`` publicara el timestamp, el reporte
    estaría certificando algo falso — y el operador tendría un reloj de a qué
    hora trabaja la gente del supermercado."""
    _ids, _cab_a, _cab_b, cab_op, _a, _b = _campo(client, monkeypatch)

    metricas = _ok(client.get("/api/plataforma/metricas", headers=cab_op))
    fila = next(c for c in metricas["clientes"] if c["slug"] == SLUG_A)
    ultimo = fila["metricas"]["ultimo_acceso"]
    assert ultimo is not None, "nadie entró: la prueba no probó nada"
    assert _FECHA_RE.match(ultimo), ultimo

    cuerpo = _ok(_reporte_operador(client, cab_op, SLUG_A))
    item = next(i for i in cuerpo["catalogo"] if i["clave"] == "ultimo_acceso")
    assert item["tratamiento"] == "sin_hora"
    assert item["endpoints"] == ["metricas"]


def test_t64_el_reporte_no_deja_ver_cuantos_clientes_tiene_la_plataforma(client, monkeypatch):
    """Vector: el reporte del dueño como censo. Nada del cuerpo puede contar
    cuántos clientes hay ni cuánto factura la plataforma — eso es negocio del
    operador y de los otros supermercados, no del titular."""
    _ids, cab_a, _cab_b, _cab_op, _a, _b = _campo(client, monkeypatch)
    cuerpo = _ok(_reporte_dueno(client, cab_a))

    for _ruta, claves in _claves(cuerpo):
        for prohibida in ("clientes_total", "clientes_con_error", "clientes_incluidos",
                          "clientes_con_tarifa", "consolidado"):
            assert prohibida not in claves, prohibida
    for ruta, valor in _numeros(cuerpo):
        assert valor != CANON_A + CANON_B, ruta
