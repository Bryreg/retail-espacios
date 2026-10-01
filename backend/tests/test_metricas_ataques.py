"""Red team de la Fase 4 — Métricas del operador: tests de ATAQUE, no de funcionalidad.

Sucesor directo de ``tests/test_plataforma_ataques.py`` (Fase 2, 30 ataques a la
frontera del privilegio de operador). Misma disciplina, mismo contrato de
lectura, y el mismo compromiso: **acá no se arregla código de producción**. Un
defecto encontrado se fija con un test que lo demuestra y se cuenta en
``features/plataforma/outputs/red-team-metricas.md``.

La Fase 4 ENMIENDA la regla dura de la Fase 2 ("ser operador NO abre la base de
negocio de ningún cliente"): ahora la abre, por un solo agujero de alfiler —
``GET /api/plataforma/metricas``, sólo lectura, sólo agregados—. Un agujero de
alfiler es exactamente la clase de cosa que hay que atacar por los bordes,
porque el peor bug posible de esta fase no es un 500: es **una fila de negocio o
un correo de usuario final colándose en el JSON de métricas**.

Seis frentes, uno por sección:

1. **Inspección profunda del JSON real** — se siembran clientes con datos
   jugosos (correos de usuarios finales, ``contact_name``/``phone``/``email``/
   ``notes`` de proveedores, ``notes`` de espacios y contratos, montos
   individuales reconocibles) y se recorre la respuesta ENTERA, hoja por hoja:
   ni un ``@``, ni un monto individual suelto, ni una clave fuera de la lista
   blanca, ni un arreglo que no sea ``clientes`` o ``top_proveedores``.
2. **El token de plataforma contra todo** — el token del operador sin
   membresías contra la lista completa de routers de negocio, y contra TODAS
   las rutas de la aplicación por enumeración automática.
3. **La puerta** — no-operador con membresías, login legado, ``OPERADOR_EMAILS``
   vacía, y quitar el correo de la variable en caliente.
4. **Fugas laterales** — la base rota, la bitácora del registro, el motivo del
   estado de cuenta, las solicitudes de supresión y el caché compartido.
5. **No-escritura** — foto de TODAS las tablas de la base del cliente (y del
   registro) antes y después de dos consultas.
6. **Orden de rutas** — ``/metricas`` contra ``/clientes/{slug}``.

Tres clases de test, igual que en la Fase 2:

* **Defensas que aguantan**: el ataque se ejecuta y falla. Evidencia de que se
  probó, y red que avisa si mañana alguien la afloja.
* **Caracterizaciones**: el sistema hace lo que el contrato dice y esa conducta
  tiene una consecuencia que conviene tener escrita.
* **Hallazgos abiertos**, ``xfail(strict=True)``: afirman el comportamiento
  SEGURO que hoy no se cumple. Con ``strict=True``, el día que se tape el
  agujero el test pasa a XPASS y la suite se pone en rojo.

El identificador (``M-n``) de cada test referencia el informe
``features/plataforma/outputs/red-team-metricas.md``.

**Todos los ``import app.*`` van adentro de las funciones.** El fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas: una
referencia tomada en la colección de pytest apuntaría a un módulo muerto.
"""
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from conftest import CLAVE_ADMIN

NO_OPERADOR = "Solo para operadores de la plataforma."
ERROR_FIJO = "No se pudo leer la base de este cliente."

PERIODO = "2026-09"


# ════════════════════════════════════════════════════════════════════════════
# LOS DATOS JUGOSOS
# ════════════════════════════════════════════════════════════════════════════
#
# Todo lo de acá abajo es lo que un atacante querría sacar del panel del
# operador. Se siembra a propósito en las bases de los clientes y se busca,
# literal, en cada hoja del JSON de respuesta.

# Correos de USUARIOS FINALES (dueños de los supermercados). Son cuentas reales
# del registro: existen en `usuarios`, tienen membresía y `ultimo_login`.
CORREO_DUENA_ACME = "duena.acme@correo-personal.example"
CORREO_DUENO_BETA = "dueno.beta@otro-correo.example"
CORREO_ADMIN_ACME = "admin.acme@correo-personal.example"
CORREO_OPERADOR = "op@recabra.example"
CORREO_OPERADOR_2 = "segunda.operadora@recabra.example"

# Datos de contacto de PROVEEDORES: la tentación más obvia, porque el nombre
# del proveedor SÍ sale en el top-5 y el resto de la fila viaja al lado en el
# mismo objeto del ORM.
CONTACTO_PROVEEDOR = "Juanita Pérez Contacto"
TELEFONO_PROVEEDOR = "+57 300 555 0101"
CORREO_PROVEEDOR = "contacto.comercial@alpina-ejemplo.example"
NOTA_PROVEEDOR = "Nota reservada del proveedor: descuento pactado del 12 por ciento"

# Notas libres de espacios y contratos: campos de texto donde la gente escribe
# cualquier cosa, incluidos datos personales.
NOTA_ESPACIO = "Nota del espacio: la punta de gondola tiene la columna rota"
NOTA_CONTRATO = "Nota del contrato: firmado con adenda 0042 por Juanita"
MARCA_CONTRATO = "MarcaSecretaDeLaAdenda"

# El motivo del corte de cuenta (tabla `estados_cliente`, registro) y el de una
# solicitud de supresión (tabla `solicitudes_supresion`, registro). Los dos los
# ve el operador en OTROS endpoints; ninguno tiene por qué aparecer en métricas.
MOTIVO_ESTADO = "Factura 0001-4517 impaga; contacto duena.beta@otro-correo.example"
MOTIVO_SUPRESION = "Nos vamos de la plataforma, borren todo — pedido por el dueño"

# Los montos. PRIMOS distintos, elegidos para que ninguna suma ni ningún
# promedio de la respuesta coincida con un valor individual: si un monto
# sembrado apareciera "suelto" en el JSON, sería porque se filtró una fila, no
# porque una cuenta dio justo ese número.
CANON_1 = 100_003.0
CANON_2 = 200_003.0
CANON_3 = 300_007.0
CANON_4 = 500_009.0
CANON_5 = 700_001.0
CANON_6 = 1_300_021.0
CANONES_INDIVIDUALES = [CANON_1, CANON_2, CANON_3, CANON_4, CANON_5, CANON_6]

# Las cuentas, hechas a mano:
ACME_INGRESO = CANON_1 + CANON_2 + CANON_3 + CANON_4      # 1.100.022,0
ACME_CANON_PROMEDIO = round(ACME_INGRESO / 4, 2)          #   275.005,5
BETA_INGRESO = CANON_5 + CANON_6                          # 2.000.022,0
BETA_CANON_PROMEDIO = round(BETA_INGRESO / 2, 2)          # 1.000.011,0
CONS_INGRESO = ACME_INGRESO + BETA_INGRESO                # 3.100.044,0
CONS_CANON_PONDERADO = round(CONS_INGRESO / 6, 2)         #   516.674,0

# Ninguno de los agregados puede coincidir con un canon individual — es la
# premisa entera del ataque M-2, así que se afirma acá, en tiempo de importación.
_AGREGADOS = {ACME_INGRESO, ACME_CANON_PROMEDIO, BETA_INGRESO, BETA_CANON_PROMEDIO,
              CONS_INGRESO, CONS_CANON_PONDERADO}
assert not (_AGREGADOS & set(CANONES_INDIVIDUALES)), "los montos sembrados están mal elegidos"

# Todo string jugoso que NO puede aparecer en la respuesta, en ningún nivel.
SENTINELAS = [
    CORREO_DUENA_ACME, CORREO_DUENO_BETA, CORREO_ADMIN_ACME, CORREO_OPERADOR,
    CONTACTO_PROVEEDOR, TELEFONO_PROVEEDOR, CORREO_PROVEEDOR, NOTA_PROVEEDOR,
    NOTA_ESPACIO, NOTA_CONTRATO, MARCA_CONTRATO,
    MOTIVO_ESTADO, MOTIVO_SUPRESION,
]


# ─── El layout sembrado ──────────────────────────────────────────────────────
#
# ACME: sede NAVE con una punta, una góndola DOBLE (dos caras) y una mural;
# sede SUR con una punta. 5 caras comercializables, 4 ocupadas -> 80,0 %.

_NAVE = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE",
     "faceB": {"supplierName": "", "negotiatedValue": 0}},
    {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "sede": "NAVE"},
]
_SUR = [{"code": "PUN-01", "type": "punta", "sede": "SUR"}]
_BETA = [
    {"code": "E-01", "type": "punta", "sede": "BETA"},
    {"code": "E-02", "type": "punta", "sede": "BETA"},
]

# (código, proveedor, desde, hasta, canon, is_active)
_CONTRATOS_ACME = [
    ("NAVE-PUN-01", "Alpina", "2026-09-01", "2026-09-30", CANON_1, True),
    ("NAVE-GON-01", "Alpina", "2026-09-01", "2026-09-30", CANON_2, True),
    ("NAVE-GON-01-B", "Nutresa", "2026-09-01", "2026-09-30", CANON_3, True),
    ("SUR-PUN-01", "Bimbo", "2026-09-01", "2026-09-30", CANON_4, True),
]
_CONTRATOS_BETA = [
    ("BETA-E-01", "Nutresa", "2026-09-01", "2026-09-30", CANON_5, True),
    ("BETA-E-02", "Alpina", "2026-09-01", "2026-09-30", CANON_6, True),
]


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE
# ════════════════════════════════════════════════════════════════════════════

class FakeVerificador:
    """Traduce un ``id_token`` de mentira (clave del diccionario) a claims."""

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
    """Funda un cliente por el alta self-service real. Devuelve el cuerpo."""
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _consola(ids: Identidades, monkeypatch, uid="uid-op", email=CORREO_OPERADOR,
             otros=()):
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías.

    ``otros`` suma más correos a la variable sin sacar el primero — se usa para
    el ataque del segundo operador contra el caché compartido.
    """
    monkeypatch.setenv("OPERADOR_EMAILS", ",".join([email, *otros]))
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo.get("plataforma") is True, cuerpo
    return cuerpo


def _sembrar_negocio(slug, sedes: dict, contratos: list):
    """Layout + proveedores CON datos de contacto + espacios y contratos CON notas.

    Es lo único de este archivo que escribe en una base de negocio; el endpoint
    atacado no escribe nunca (ataque M-24).
    """
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
                fila = Supplier(
                    name=proveedor,
                    # Toda la ficha del proveedor, cargada: si el endpoint
                    # devolviera el objeto del ORM en vez del par
                    # (nombre, conteo), esto saldría al JSON entero.
                    contact_name=CONTACTO_PROVEEDOR,
                    phone=TELEFONO_PROVEEDOR,
                    email=CORREO_PROVEEDOR,
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
        db.commit()
    finally:
        db.close()


def _romper(slug="roto", nombre="Roto"):
    """Un cliente cuya base NO se deja leer: fila en el registro + archivo basura."""
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
    return db_name, ruta


def _estado(slug, estado, motivo):
    """Escribe ``estados_cliente`` a mano y tira el cache (patrón de la Fase 2)."""
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


def _supresion(slug, usuario_id, email, motivo=MOTIVO_SUPRESION):
    """Una solicitud de supresión pendiente, escrita directo en el registro."""
    from app.clientes import sesion_registro
    from app.models.supresion import SolicitudSupresion

    reg = sesion_registro()
    try:
        reg.add(SolicitudSupresion(
            cliente_slug=slug, usuario_id=usuario_id, email=email,
            motivo=motivo, estado="pendiente",
            creado_en=datetime.now(timezone.utc),
        ))
        reg.commit()
    finally:
        reg.close()


def _escenario(client, monkeypatch, *, con_supresion=True, con_roto=True):
    """El campo de batalla: acme + beta (suspendido) + galerias + roto + operador.

    Devuelve ``(ids, cabecera_de_la_consola, cuerpo_del_login)``.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    acme = _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    beta = _fundar(ids, "uid-beta", CORREO_DUENO_BETA, "beta", "Beta Market")

    _sembrar_negocio("acme", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS_ACME)
    _sembrar_negocio("beta", {"BETA": _BETA}, _CONTRATOS_BETA)

    # Beta cortado, con un motivo que lleva adentro un correo de usuario final.
    _estado("beta", "suspendido", MOTIVO_ESTADO)
    if con_supresion:
        _supresion("acme", acme.get("usuario_id") or 1, CORREO_DUENA_ACME)
    if con_roto:
        _romper()

    consola = _consola(ids, monkeypatch)
    limpiar_cache_metricas()
    assert beta is not None
    return ids, _cab(consola["token"]), consola


def _pedir(client, cab, periodo=PERIODO):
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


# ─── El recorrido recursivo ──────────────────────────────────────────────────

def _hojas(nodo, ruta="$"):
    """``(ruta, valor)`` de cada HOJA del JSON — recursivo, sin excepciones.

    Un ataque que mire sólo el primer nivel no sirve: lo que se filtra se filtra
    adentro de ``clientes[3].metricas.top_proveedores[0]``, no en la raíz.
    """
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            yield from _hojas(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _hojas(v, f"{ruta}[{i}]")
    else:
        yield ruta, nodo


def _claves(nodo, ruta="$"):
    """``(ruta_del_contenedor, conjunto_de_claves)`` de cada objeto del JSON."""
    if isinstance(nodo, dict):
        yield ruta, set(nodo.keys())
        for k, v in nodo.items():
            yield from _claves(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from _claves(v, f"{ruta}[{i}]")


def _arreglos(nodo, ruta="$"):
    """``(ruta, longitud)`` de cada arreglo del JSON."""
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
    # `bool` es subclase de `int` en Python: `de_cache` no es un número.
    return [(r, v) for r, v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


# ─── La lista blanca EXACTA del contrato ─────────────────────────────────────

RAIZ = {"periodo", "generado_en", "de_cache", "consolidado", "clientes"}
PERIODO_KEYS = {"anio_mes", "desde", "hasta"}
METRICAS = {
    "sedes_con_plano", "espacios_comercializables", "ocupacion_pct",
    "canon_promedio_mensual", "ingreso_contratado_mes", "top_proveedores",
    "usuarios_con_cuenta",
}
# Fase 6 (spread): el consolidado gana `spread_pct` y `clientes_con_tarifa`; la
# fila por cliente gana `spread_pct`, `tarifa_configurada` y `contratos_sin_tarifa`.
CONSOLIDADO = METRICAS | {"clientes_total", "clientes_con_error", "spread_pct", "clientes_con_tarifa"}
METRICAS_CLIENTE = METRICAS | {
    "ultimo_acceso", "spread_pct", "tarifa_configurada", "contratos_sin_tarifa",
}
CLIENTE = {"slug", "nombre", "estado_cuenta", "error", "metricas"}
PROVEEDOR = {"nombre", "contratos_activos"}


def _validar_contrato(cuerpo) -> list[str]:
    """Devuelve la lista de violaciones del contrato. Vacía = el JSON es legal."""
    malas: list[str] = []

    def exigir(ruta, obtenidas, esperadas):
        if obtenidas != esperadas:
            de_mas = sorted(obtenidas - esperadas)
            de_menos = sorted(esperadas - obtenidas)
            malas.append(f"{ruta}: de más={de_mas} de menos={de_menos}")

    exigir("$", set(cuerpo.keys()), RAIZ)
    exigir("$.periodo", set(cuerpo["periodo"].keys()), PERIODO_KEYS)
    exigir("$.consolidado", set(cuerpo["consolidado"].keys()), CONSOLIDADO)
    for i, p in enumerate(cuerpo["consolidado"]["top_proveedores"]):
        exigir(f"$.consolidado.top_proveedores[{i}]", set(p.keys()), PROVEEDOR)
    for i, c in enumerate(cuerpo["clientes"]):
        exigir(f"$.clientes[{i}]", set(c.keys()), CLIENTE)
        m = c["metricas"]
        if m is None:
            continue
        exigir(f"$.clientes[{i}].metricas", set(m.keys()), METRICAS_CLIENTE)
        for j, p in enumerate(m["top_proveedores"]):
            exigir(f"$.clientes[{i}].metricas.top_proveedores[{j}]", set(p.keys()), PROVEEDOR)
    return malas


# ════════════════════════════════════════════════════════════════════════════
# 1. INSPECCIÓN PROFUNDA DEL JSON REAL
# ════════════════════════════════════════════════════════════════════════════

def test_m1_ni_un_solo_arroba_en_toda_la_respuesta(client, monkeypatch):
    """M-1 — Ningún string del JSON contiene ``@``. **Ni el del operador.**

    El corte es deliberadamente brutal: no "ningún correo de usuario final",
    sino NINGUNA arroba. El contrato de la spec no tiene un solo campo que deba
    llevar un correo —ni el del operador, que ya queda en la bitácora del
    registro—, así que cualquier arroba en la respuesta es, por definición, algo
    que se coló. Un test que buscara sólo los correos sembrados se dejaría
    afuera el correo que siembre el usuario mañana.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    con_arroba = [(r, v) for r, v in _textos(cuerpo) if "@" in v]
    assert con_arroba == [], f"hay correos en el JSON de métricas: {con_arroba}"


def test_m2_ningun_dato_jugoso_sembrado_aparece_en_el_json(client, monkeypatch):
    """M-2 — Ningún sentinela sembrado aparece, ni entero ni como fragmento.

    Se busca contra el JSON SERIALIZADO además de hoja por hoja: si algo se
    colara adentro de un string compuesto (un mensaje de error que concatene, un
    nombre que arrastre la nota), la búsqueda por hoja exacta no lo vería.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    filtrados = [s for s in SENTINELAS if s in crudo]
    assert filtrados == [], f"datos jugosos en el JSON de métricas: {filtrados}"


def test_m3_ningun_monto_individual_aparece_suelto(client, monkeypatch):
    """M-3 — Ningún canon sembrado sale como número del JSON.

    Los canones son primos distintos elegidos para que NINGUNA suma ni promedio
    de la respuesta coincida con uno de ellos (se afirma en tiempo de
    importación, arriba). Así, un monto individual en la respuesta sólo puede
    venir de una fila filtrada.

    Los agregados que SÍ tienen que estar se verifican de frente en el mismo
    test: no alcanza con que no aparezcan los individuales si tampoco aparecen
    las sumas —eso sería un endpoint roto pasando por seguro—.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    sueltos = [(r, v) for r, v in _numeros(cuerpo) if float(v) in set(CANONES_INDIVIDUALES)]
    assert sueltos == [], f"montos individuales sueltos en el JSON: {sueltos}"

    # Y las cuentas que SÍ van, verificadas a mano:
    assert _fila(cuerpo, "acme")["metricas"]["ingreso_contratado_mes"] == ACME_INGRESO
    assert _fila(cuerpo, "acme")["metricas"]["canon_promedio_mensual"] == ACME_CANON_PROMEDIO
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == CONS_INGRESO
    assert cuerpo["consolidado"]["canon_promedio_mensual"] == CONS_CANON_PONDERADO


def test_m4_lista_blanca_exacta_de_claves_en_todos_los_niveles(client, monkeypatch):
    """M-4 — Cada objeto del JSON tiene EXACTAMENTE las claves del contrato.

    Ni una de más (una clave nueva es un dato nuevo que nadie auditó) ni una de
    menos (un campo faltante es el panel roto). Se recorre todo el árbol, no la
    raíz.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    assert _validar_contrato(cuerpo) == []


def test_m5_no_hay_ninguna_clave_de_negocio_prohibida_en_ningun_nivel(client, monkeypatch):
    """M-5 — La lista negra, por si la blanca se relaja algún día.

    Es redundante con M-4 a propósito: M-4 se rompe si alguien agrega una clave
    y actualiza el contrato de arriba sin pensar; M-5 nombra explícitamente lo
    que jamás puede estar, y esa lista es más difícil de aflojar sin darse
    cuenta de lo que se está haciendo.
    """
    prohibidas = {
        "email", "correo", "contact_name", "phone", "telefono", "notes", "notas",
        "motivo", "marca", "monthly_rent", "canon", "supplier_id", "space_id",
        "lease_id", "leases", "contratos", "spaces", "espacios", "suppliers",
        "proveedores", "usuarios", "usuario_id", "layouts", "fixtures",
        "solicitudes", "supresiones", "bitacora", "audit_log", "db_name",
        "start_date", "end_date", "cambiado_por", "cambiado_en", "atendido_por",
        "id", "ip",
    }
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    encontradas = [
        (ruta, sorted(claves & prohibidas))
        for ruta, claves in _claves(cuerpo)
        if claves & prohibidas
    ]
    assert encontradas == [], f"claves prohibidas en el JSON: {encontradas}"


def test_m6_los_unicos_arreglos_son_clientes_y_top_proveedores(client, monkeypatch):
    """M-6 — Un arreglo inesperado es, casi siempre, una lista de filas.

    El contrato tiene exactamente tres FORMAS de arreglo: ``$.clientes``,
    ``$.consolidado.top_proveedores`` y ``$.clientes[i].metricas.top_proveedores``.
    Cualquier otro arreglo en cualquier profundidad es un hallazgo.
    """
    import re

    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    permitidos = (
        r"^\$\.clientes$",
        r"^\$\.consolidado\.top_proveedores$",
        r"^\$\.clientes\[\d+\]\.metricas\.top_proveedores$",
    )
    intrusos = [
        (ruta, largo) for ruta, largo in _arreglos(cuerpo)
        if not any(re.match(p, ruta) for p in permitidos)
    ]
    assert intrusos == [], f"arreglos fuera del contrato: {intrusos}"


def test_m7_el_nombre_del_proveedor_sale_pero_su_ficha_no(client, monkeypatch):
    """M-7 — Caracterización de la frontera exacta del top-5.

    El nombre del proveedor SÍ sale (la spec lo autoriza: nombre + conteo). Lo
    que viaja al lado en el mismo objeto del ORM —contacto, teléfono, correo,
    notas— no. Este test es el que separa "el endpoint devuelve un agregado" de
    "el endpoint devuelve una fila recortada": ambos se verían parecidos en la
    pantalla, y sólo uno es legal.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    top = cuerpo["consolidado"]["top_proveedores"]
    assert [p["nombre"] for p in top] == ["Alpina", "Nutresa", "Bimbo"]
    assert [p["contratos_activos"] for p in top] == [3, 2, 1]
    for p in top:
        assert set(p.keys()) == PROVEEDOR

    crudo = json.dumps(cuerpo, ensure_ascii=False)
    for dato in (CONTACTO_PROVEEDOR, TELEFONO_PROVEEDOR, CORREO_PROVEEDOR, NOTA_PROVEEDOR):
        assert dato not in crudo


def test_m8_los_valores_del_json_son_solo_numeros_fechas_y_nombres(client, monkeypatch):
    """M-8 — Perfil de tipos de TODA la respuesta.

    El contrato admite: números, ``null``, un booleano (``de_cache``), fechas
    ISO, cuatro slugs/estados y los nombres (del cliente y de los proveedores).
    Cualquier string que no encaje en ese molde es texto libre —y el texto libre
    es donde vive lo que la gente escribe—.
    """
    import re

    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    esperados = {
        "$.periodo.anio_mes", "$.periodo.desde", "$.periodo.hasta", "$.generado_en",
    }
    fecha_ish = re.compile(r"^\d{4}-\d{2}(-\d{2}(T[\d:]+Z)?)?$")
    nombres_legales = {"Acme Supermercados", "Beta Market", "Roto",
                       "Alpina", "Nutresa", "Bimbo"}
    estados = set(("activo", "gracia", "solo_lectura", "suspendido"))
    slugs = {"acme", "beta", "galerias", "roto"}

    raros = []
    for ruta, valor in _textos(cuerpo):
        if ruta in esperados or fecha_ish.match(valor):
            continue
        if valor in nombres_legales or valor in estados or valor in slugs:
            continue
        if valor == ERROR_FIJO:
            continue
        # `galerias` se registra con el nombre que traiga el entorno.
        if ruta.endswith(".nombre") and len(valor) < 60:
            continue
        raros.append((ruta, valor))
    assert raros == [], f"texto libre inesperado en el JSON: {raros}"


# ════════════════════════════════════════════════════════════════════════════
# 2. EL TOKEN DE PLATAFORMA CONTRA TODO
# ════════════════════════════════════════════════════════════════════════════
#
# La lista TAXATIVA de la misión, un endpoint por router de negocio. Cada tupla
# es (método, ruta, cuerpo json). Ninguno puede dar 200 ni 402: 200 sería el
# token abriendo una base ajena; 402 sería el token llegando hasta el
# interruptor de estado de cuenta, es decir habiendo RESUELTO un cliente.

NEGOCIO = [
    # spaces
    ("GET", "/api/spaces/", None),
    ("GET", "/api/spaces/map", None),
    ("GET", "/api/spaces/face-images", None),
    ("GET", "/api/spaces/1", None),
    ("GET", "/api/spaces/by-code/NAVE-PUN-01", None),
    ("POST", "/api/spaces/", {"svg_id": "s1", "code": "A-1", "name": "A", "zone": "Z", "area_m2": 1.0}),
    ("POST", "/api/spaces/find-or-create", {"svg_id": "s1", "code": "A-1", "name": "A", "zone": "Z", "area_m2": 1.0}),
    ("PATCH", "/api/spaces/1/status", {"status": "occupied"}),
    ("POST", "/api/spaces/1/leases", {"supplier_id": 1}),
    ("DELETE", "/api/spaces/1/leases/1", None),
    # layout — incluido /layout/rates, que es la tarifa de referencia
    ("GET", "/api/layout/", None),
    ("GET", "/api/layout/rates", None),
    ("PUT", "/api/layout/rates", {}),
    ("GET", "/api/layout/settings", None),
    ("PUT", "/api/layout/settings", {}),
    ("GET", "/api/layout/seasons", None),
    ("GET", "/api/layout/revisions", None),
    ("GET", "/api/layout/NAVE", None),
    ("GET", "/api/layout/NAVE/impact", None),
    ("PUT", "/api/layout/NAVE", {}),
    ("DELETE", "/api/layout/NAVE", None),
    # dashboard
    ("GET", "/api/dashboard/kpis", None),
    ("GET", "/api/dashboard/spaces", None),
    # suppliers
    ("GET", "/api/suppliers/", None),
    ("GET", "/api/suppliers/1", None),
    ("POST", "/api/suppliers/", {"name": "X"}),
    ("POST", "/api/suppliers/find-or-create", {"name": "X"}),
    ("PUT", "/api/suppliers/1", {"name": "Y"}),
    ("DELETE", "/api/suppliers/1", None),
    # files
    ("GET", "/api/spaces/1/files", None),
    ("GET", "/api/files/1", None),
    ("DELETE", "/api/files/1", None),
    # montaje
    ("GET", "/api/montaje/mi-espacio", None),
    ("GET", "/api/montaje/planometria", None),
    ("POST", "/api/montaje/reportar", {"estado": "ok"}),
    # planogramas
    ("GET", "/api/leases/1/planometria", None),
    ("GET", "/api/planometrias/por-espacio/NAVE-PUN-01", None),
    ("GET", "/api/planometrias/1", None),
    # carga masiva
    ("POST", "/api/leases/bulk/validar", {"filas": []}),
    ("POST", "/api/leases/bulk/confirmar", {"filas": []}),
    # usuarios del cliente
    ("GET", "/api/usuarios", None),
    ("POST", "/api/usuarios/invitar", {"email": "colado@ejemplo.example", "rol": "admin"}),
    ("PATCH", "/api/usuarios/1", {"activo": False}),
    # derechos del titular
    ("GET", "/api/clientes/mi-export", None),
    ("POST", "/api/clientes/solicitar-supresion", {"motivo": "x"}),
    # resto de la superficie de negocio
    ("GET", "/api/bitacora/", None),
    ("GET", "/api/bitacora/acciones", None),
    ("GET", "/api/catalogo/", None),
    ("GET", "/api/notifications/config", None),
    ("GET", "/api/notifications/contacts", None),
    ("GET", "/api/mounts/", None),
]


def _golpear(client, metodo, ruta, cuerpo, cab):
    return client.request(metodo, ruta, json=cuerpo, headers=cab)


def test_m9_el_token_de_la_consola_no_abre_ningun_router_de_negocio(client, monkeypatch):
    """M-9 — El ataque central de la fase: 51 endpoints de negocio, todos cerrados.

    La defensa no es un guard por router (que habría que acordarse de poner en
    cada endpoint nuevo) sino ``cliente_del_pedido``: el slug ``plataforma``
    sólo resuelve a un cliente bajo ``/api/plataforma``, así que fuera de ahí el
    pedido ni siquiera llega a tener sesión de base. Este test es la prueba de
    que esa construcción cubre la superficie ENTERA y no los siete endpoints que
    el builder eligió.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    abiertos = []
    for metodo, ruta, cuerpo in NEGOCIO:
        r = _golpear(client, metodo, ruta, cuerpo, cab)
        if r.status_code not in (401, 403):
            abiertos.append((metodo, ruta, r.status_code, r.text[:120]))
    assert abiertos == [], f"endpoints de negocio que no cerraron con 401/403: {abiertos}"


def test_m10_barrido_automatico_de_todas_las_rutas_de_la_aplicacion(client, monkeypatch):
    """M-10 — La lista curada envejece; la aplicación no.

    Se enumeran TODAS las rutas registradas en FastAPI, se descartan las que la
    consola sí puede usar (``/api/plataforma/*``) y las que no son de negocio
    (``/api/auth/*``, el alta, los estáticos), se rellenan los parámetros de
    ruta con valores inocuos y se golpea cada una con el token de la consola.

    El listón acá es más bajo a propósito —**nunca 200, nunca 402**— porque una
    ruta puede contestar 404 o 422 por motivos legítimos; lo que no puede es
    servir datos ni llegar al interruptor de estado de cuenta, que sólo se
    consulta una vez que hay cliente resuelto.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    # `/api/health` queda afuera con nombre y apellido, no por comodín: es
    # público, no lleva dependencias y devuelve una constante. Se verifica que
    # SIGA siendo esa constante — el día que alguien le agregue "clientes: 7" o
    # "ingreso del mes", la exención deja de ser inocua y este assert lo dice.
    r = client.get("/api/health")
    assert r.json() == {"status": "ok", "app": "RECABRA API"}, r.text

    saltar = ("/api/plataforma", "/api/auth", "/api/clientes/alta", "/api/health")
    relleno = {"space_id": "1", "supplier_id": "1", "file_id": "1", "lease_id": "1",
               "arte_id": "1", "usuario_id": "1", "solicitud_id": "1", "sede": "NAVE",
               "space_code": "NAVE-PUN-01", "svg_id": "s1", "code": "NAVE-PUN-01",
               "slug": "acme", "mount_id": "1", "id": "1"}

    from conftest import rutas_planas

    servidos = []
    for ruta in rutas_planas(client.app):
        path = ruta.path
        metodos = ruta.methods
        if not path.startswith("/api/") or path.startswith(saltar):
            continue
        concreta = path
        for nombre, valor in relleno.items():
            concreta = concreta.replace("{" + nombre + "}", valor)
        if "{" in concreta:
            continue  # un parámetro que no sabemos rellenar: no se golpea a ciegas
        for metodo in sorted(metodos - {"HEAD", "OPTIONS"}):
            r = client.request(metodo, concreta, json={}, headers=cab)
            if r.status_code in (200, 201, 204, 402):
                servidos.append((metodo, concreta, r.status_code))
    assert servidos == [], f"rutas que el token de la consola pudo usar: {servidos}"


def test_m11_el_token_de_la_consola_tampoco_entra_por_la_query(client, monkeypatch):
    """M-11 — El camino lateral de la Fase 2: ``?token=`` en vez de la cabecera.

    ``require_auth_or_query_token`` existe para las descargas en ``<iframe>``.
    Si la frontera estuviera en la cabecera y no en ``cliente_del_pedido``, esta
    puerta se saltaría el guard entero.
    """
    _ids, cab, consola = _escenario(client, monkeypatch)
    token = consola["token"]

    for ruta in ("/api/files/1", "/api/planometrias/1", "/api/catalogo/1/imagen"):
        r = client.get(f"{ruta}?token={token}")
        assert r.status_code in (401, 403), f"{ruta} -> {r.status_code}: {r.text[:120]}"


def test_m12_el_slug_plataforma_no_se_puede_fundar_ni_disfrazado(client, monkeypatch):
    """M-12 — Si alguien pudiera fundar ``plataforma``, el token abriría una base real.

    Se prueban las variantes que un normalizador flojo dejaría pasar: mayúsculas,
    espacios alrededor, y el slug con acento o guiones que podría normalizar a lo
    mismo. Ninguna puede terminar en una fila ``clientes.slug == "plataforma"``.
    """
    ids = Identidades(client)
    ids.registrar("uid-atacante", "atacante@ejemplo.example")

    for candidato in ("plataforma", "Plataforma", "PLATAFORMA", "  plataforma  ", "plataforma "):
        r = client.post("/api/clientes/alta", json={
            "id_token": "uid-atacante", "slug": candidato,
            "nombre": "Suplantador", "acepta_politica": True,
        })
        assert r.status_code in (409, 422), f"{candidato!r} -> {r.status_code}: {r.text[:160]}"

    from app.clientes import sesion_registro
    from app.models.models import ClienteRow

    reg = sesion_registro()
    try:
        assert reg.query(ClienteRow).filter(ClienteRow.slug == "plataforma").first() is None
    finally:
        reg.close()


# ════════════════════════════════════════════════════════════════════════════
# 3. LA PUERTA
# ════════════════════════════════════════════════════════════════════════════

def test_m13_no_operador_con_membresias_no_entra_a_metricas(client, monkeypatch):
    """M-13 — Tener cuenta, cliente y rol de owner NO es ser operador.

    Es la escalada horizontal más obvia: el dueño de un supermercado pidiendo
    las métricas de todos los supermercados. El 403 tiene que ser del
    ``require_operador``, con su texto, y no un 404 ni un 200 vacío.
    """
    ids = Identidades(client)
    duena = _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    monkeypatch.setenv("OPERADOR_EMAILS", CORREO_OPERADOR)

    for ruta in ("/api/plataforma/metricas", "/api/plataforma/metricas?periodo=2026-09",
                 "/api/plataforma/clientes", "/api/plataforma/supresiones"):
        r = client.get(ruta, headers=_cab(duena["token"]))
        assert r.status_code == 403, f"{ruta} -> {r.status_code}"
        assert r.json()["detail"] == NO_OPERADOR

    # Y `/soy` le dice la verdad: no es operador (no es un 403, es un `false`).
    r = client.get("/api/plataforma/soy", headers=_cab(duena["token"]))
    assert r.status_code == 200 and r.json() == {"operador": False}


def test_m14_el_login_legado_nunca_llega_a_metricas(client, admin, monkeypatch):
    """M-14 — El token legado no trae ``email``: no hay correo que comparar.

    Se prueba incluso con ``OPERADOR_EMAILS`` conteniendo TODO lo imaginable —
    un comodín, la cadena vacía, ``None`` en texto—: el legado no tiene identidad
    de persona, así que ninguna lista puede incluirlo.
    """
    for lista in (CORREO_OPERADOR, "*", "admin", "", "None,*,admin@admin"):
        monkeypatch.setenv("OPERADOR_EMAILS", lista)
        r = client.get("/api/plataforma/metricas", headers=admin)
        assert r.status_code == 403, f"OPERADOR_EMAILS={lista!r} -> {r.status_code}"
        assert r.json()["detail"] == NO_OPERADOR


def test_m15_operador_emails_vacia_cierra_metricas_para_todos(client, admin, monkeypatch):
    """M-15 — Sin la variable, el panel no existe para nadie.

    Es el caso del despliegue nuevo, y el del día en que alguien la borra por
    error: la ausencia de configuración tiene que ser el estado MÁS cerrado, no
    el más abierto.

    Dos matices que quedan escritos:

    * Al token de la CONSOLA (``cliente == "plataforma"``) la variable vacía le
      da **401**, no 403: ``decode_token`` lo mata antes de llegar al router,
      porque lo único que lo mantenía vivo era ese correo. Cierra de más, que es
      el lado correcto.
    * Al operador CON membresías le da 403 en el router, porque su token sigue
      siendo válido para su cliente.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    consola = _consola(ids, monkeypatch, uid="uid-op")
    cab_consola = _cab(consola["token"])

    # Con la variable puesta, entra.
    assert client.get("/api/plataforma/metricas", headers=cab_consola).status_code == 200

    for vacia in ("", "   ", ",,,"):
        monkeypatch.setenv("OPERADOR_EMAILS", vacia)
        r = client.get("/api/plataforma/metricas", headers=cab_consola)
        assert r.status_code in (401, 403), f"{vacia!r} -> {r.status_code}"
        assert client.get("/api/plataforma/metricas", headers=admin).status_code == 403
        # Nadie es operador, ni siquiera para preguntarlo.
        r = client.get("/api/plataforma/soy", headers=admin)
        assert r.status_code == 200 and r.json() == {"operador": False}

    monkeypatch.delenv("OPERADOR_EMAILS", raising=False)
    assert client.get("/api/plataforma/metricas", headers=cab_consola).status_code in (401, 403)


def test_m16_quitar_el_correo_mata_el_token_en_el_pedido_siguiente(client, monkeypatch):
    """M-16 — Revocar es sacar el correo de la variable, y tiene que ser INMEDIATO.

    No hay tabla de sesiones que invalidar: si el token siguiera sirviendo hasta
    su ``exp``, revocar a un operador sería imposible sin rotar el
    ``JWT_SECRET`` de todo el mundo. Se prueba el pedido inmediatamente
    siguiente, sin dormir nada, en los tres endpoints de la consola — y también
    que poner OTRO correo en la variable no lo revive.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    consola = _consola(ids, monkeypatch, uid="uid-op")
    cab = _cab(consola["token"])

    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 200

    # Revocado: la variable ahora nombra a otra persona.
    monkeypatch.setenv("OPERADOR_EMAILS", CORREO_OPERADOR_2)
    for ruta in ("/api/plataforma/metricas", "/api/plataforma/clientes",
                 "/api/plataforma/supresiones", "/api/plataforma/soy"):
        r = client.get(ruta, headers=cab)
        assert r.status_code in (401, 403), f"{ruta} sobrevivió a la revocación: {r.status_code}"

    # Y el PATCH del interruptor, que es el que MUTA, tampoco.
    r = client.patch("/api/plataforma/clientes/acme",
                     json={"estado": "suspendido", "motivo": "x"}, headers=cab)
    assert r.status_code in (401, 403)

    # Devolverle el correo lo revive: la fuente de verdad es la variable, no una
    # marca en el token (caracterización — es lo que hace que revocar funcione).
    monkeypatch.setenv("OPERADOR_EMAILS", f"{CORREO_OPERADOR_2},{CORREO_OPERADOR}")
    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 200


def test_m17_los_correos_que_casi_matchean_no_son_operadores(client, monkeypatch):
    """M-17 — La frontera es un ``in`` sobre un conjunto; se ataca por los bordes.

    Sufijos, prefijos, subdominios, el mismo correo con un punto de más: todos
    son correos DISTINTOS y ninguno puede entrar. Lo único que sí tiene que
    entrar es la variante en mayúsculas, porque los correos no distinguen caja
    y el propio ``es_operador`` normaliza — se afirma para que quede escrito
    cuál de las dos cosas es intencional.
    """
    ids = Identidades(client)
    monkeypatch.setenv("OPERADOR_EMAILS", CORREO_OPERADOR)

    casi = [
        "op@recabra.example.evil.co",
        "evil.op@recabra.example",
        "op@recabra.example ",   # con espacio: `es_operador` hace strip -> SÍ entra
        "op@RECABRA.example",    # caja distinta -> SÍ entra
        "o.p@recabra.example",
        "op@recabra.exampl",
        "op@sub.recabra.example",
        "op+alias@recabra.example",
    ]
    entran = {"op@recabra.example ", "op@RECABRA.example"}

    for i, correo in enumerate(casi):
        uid = f"uid-casi-{i}"
        ids.registrar(uid, correo)
        r = client.post("/api/auth/oauth", json={"id_token": uid})
        if correo in entran:
            assert r.status_code == 200 and r.json().get("plataforma") is True, correo
        else:
            assert r.status_code == 403, f"{correo!r} entró con {r.status_code}"


# ════════════════════════════════════════════════════════════════════════════
# 4. FUGAS LATERALES
# ════════════════════════════════════════════════════════════════════════════

def test_m18_la_fila_del_cliente_roto_no_filtra_nada_del_entorno(client, monkeypatch):
    """M-18 — Un mensaje de error de driver trae la URL de la base y, a veces, la clave.

    No se mira sólo el campo ``error``: se barre la RESPUESTA ENTERA contra el
    nombre de la base, la ruta del archivo en disco, el esquema de conexión y el
    vocabulario típico de una traza. Un builder que hubiera puesto el detalle en
    otro campo (``nombre``, un ``detalle`` nuevo) pasaría un test que sólo mire
    ``error``.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    _sembrar_negocio("acme", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS_ACME)
    db_name, ruta_en_disco = _romper()
    consola = _consola(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    roto = _fila(cuerpo, "roto")
    assert roto["error"] == ERROR_FIJO
    assert roto["metricas"] is None

    veneno = [
        db_name, ruta_en_disco, "sqlite", "postgres", "postgresql", ".db",
        "Traceback", "OperationalError", "DatabaseError", "sqlalchemy",
        "password", "passwd", "://", "/tmp", "file is not a database",
    ]
    filtrado = [v for v in veneno if v.lower() in crudo.lower()]
    assert filtrado == [], f"la respuesta filtra detalles del entorno: {filtrado}"

    # Y el resto del panel sigue funcionando: una base rota no tumba nada.
    assert _fila(cuerpo, "acme")["metricas"]["ingreso_contratado_mes"] == ACME_INGRESO
    assert cuerpo["consolidado"]["clientes_con_error"] == 1


def test_m19_la_bitacora_anota_cada_consulta_y_no_lleva_datos_de_negocio(client, monkeypatch):
    """M-19 — La contrapartida de la enmienda: una línea por CADA consulta.

    Dos cosas se atacan a la vez, porque son la misma promesa por sus dos lados:

    * **Completitud**: tres consultas (cálculo, acierto de caché, otro período)
      dejan TRES líneas, cada una con correo, período y fecha. Si la cacheada no
      dejara línea, la bitácora contaría cálculos y no accesos, y un operador
      podría mirar el panel cuatro veces en cinco minutos dejando una sola
      marca.
    * **Minimalidad**: ninguna columna de ninguna línea contiene un dato de
      negocio. Se barren TODAS las columnas de la tabla, no las que uno se
      acuerda de mirar.
    """
    from app.models.plataforma import BitacoraPlataforma

    _ids, cab, _ = _escenario(client, monkeypatch)

    _pedir(client, cab, "2026-09")          # cálculo
    _pedir(client, cab, "2026-09")          # acierto de caché
    _pedir(client, cab, "2026-10")          # otro período

    from app.clientes import sesion_registro
    reg = sesion_registro()
    try:
        filas = reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        volcado = [
            {c.name: getattr(f, c.name) for c in BitacoraPlataforma.__table__.columns}
            for f in filas
        ]
    finally:
        reg.close()

    assert len(volcado) == 3, f"la bitácora no anotó una línea por consulta: {volcado}"
    assert [f["email"] for f in volcado] == [CORREO_OPERADOR] * 3
    assert [f["periodo"] for f in volcado] == ["2026-09", "2026-09", "2026-10"]
    for f in volcado:
        assert f["accion"] == "metricas"
        assert isinstance(f["en"], datetime)

    texto = json.dumps(volcado, ensure_ascii=False, default=str)
    for dato in SENTINELAS:
        if dato == CORREO_OPERADOR:
            continue  # el correo del operador es EL dato de la bitácora
        assert dato not in texto, f"la bitácora lleva un dato de negocio: {dato!r}"
    for canon in CANONES_INDIVIDUALES:
        assert str(canon) not in texto
    for slug in ("acme", "beta", "Alpina", "Nutresa", "Bimbo"):
        assert slug not in texto, f"la bitácora nombra un cliente/proveedor: {slug!r}"


def test_m20_el_motivo_del_estado_de_cuenta_no_se_cuela_en_metricas(client, monkeypatch):
    """M-20 — ``estados_cliente.motivo`` es texto libre que escribe el operador.

    El endpoint LEE esa tabla (necesita ``estado_cuenta``) y tiene el objeto
    entero a mano. El contrato deja pasar el estado y nada más: el motivo, quién
    lo cambió y cuándo se quedan en ``/plataforma/clientes``, donde ya viven.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    beta = _fila(cuerpo, "beta")
    assert beta["estado_cuenta"] == "suspendido"
    assert MOTIVO_ESTADO not in crudo
    assert "Factura" not in crudo and "impaga" not in crudo
    assert CORREO_OPERADOR not in crudo   # `cambiado_por` tampoco viaja

    # El mismo motivo SÍ está donde corresponde — la fuga sería que estuviera
    # en los DOS lados, no que exista.
    r = client.get("/api/plataforma/clientes", headers=cab)
    assert r.status_code == 200
    assert MOTIVO_ESTADO in r.text


def test_m21_las_solicitudes_de_supresion_no_se_cuelan_en_metricas(client, monkeypatch):
    """M-21 — ``solicitudes_supresion`` guarda el CORREO de quien pidió el borrado.

    Es el dato personal más sensible que el registro tiene junto al de
    ``usuarios``, y vive en la misma base que el endpoint de métricas abre para
    leer ``clientes`` y ``estados_cliente``. No puede rozar el JSON.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    assert MOTIVO_SUPRESION not in crudo
    assert CORREO_DUENA_ACME not in crudo
    assert "supresion" not in crudo.lower() and "solicitud" not in crudo.lower()

    # Y está donde tiene que estar, con su correo, en el endpoint de la Fase 3.
    r = client.get("/api/plataforma/supresiones", headers=cab)
    assert r.status_code == 200 and CORREO_DUENA_ACME in r.text


def test_m22_el_json_cacheado_no_le_atribuye_la_bitacora_al_primer_operador(client, monkeypatch):
    """M-22 — Dos operadores, una sola respuesta calculada: dos líneas distintas.

    El caché es COMPARTIDO y no está indexado por persona. El riesgo es que la
    constancia siga al cálculo en vez de al acceso: si la línea se escribiera
    junto al cálculo, el segundo operador miraría el negocio de todos los
    clientes sin dejar rastro, y la bitácora diría que quien miró fue el
    primero.
    """
    from app.models.plataforma import BitacoraPlataforma

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    _sembrar_negocio("acme", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS_ACME)

    primera = _consola(ids, monkeypatch, uid="uid-op", email=CORREO_OPERADOR,
                       otros=(CORREO_OPERADOR_2,))
    ids.registrar("uid-op2", CORREO_OPERADOR_2)
    r = client.post("/api/auth/oauth", json={"id_token": "uid-op2"})
    assert r.status_code == 200, r.text
    segunda = r.json()

    from app.plataforma_metricas import limpiar_cache_metricas
    limpiar_cache_metricas()

    uno = _pedir(client, _cab(primera["token"]))
    dos = _pedir(client, _cab(segunda["token"]))

    assert uno["de_cache"] is False
    assert dos["de_cache"] is True                 # salió del caché del primero
    assert dos["generado_en"] == uno["generado_en"]

    from app.clientes import sesion_registro
    reg = sesion_registro()
    try:
        lineas = [(f.email, f.periodo) for f in
                  reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()]
    finally:
        reg.close()

    assert lineas == [(CORREO_OPERADOR, PERIODO), (CORREO_OPERADOR_2, PERIODO)], lineas


def test_m23_un_periodo_hostil_no_ejecuta_nada_ni_filtra_el_error(client, monkeypatch):
    """M-23 — El único parámetro que el operador controla, atacado.

    ``periodo`` viaja crudo hasta un ``re.match`` y de ahí a ``date(...)``. Se
    prueban inyección SQL, recorrido de rutas, ``%s``/``{}`` de formateo, y
    tamaños absurdos: todos tienen que morir en 422 con el mismo mensaje corto,
    sin devolver el valor recibido (que sería un reflejo listo para XSS en la
    consola del operador) ni una traza.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    hostiles = [
        "2026-09' OR '1'='1",
        "2026-13", "2026-00", "0000-01", "9999-99", "26-9", "2026/09",
        "../../etc/passwd", "%2e%2e%2f", "{periodo}", "%s", "$(whoami)",
        "<script>alert(1)</script>", "2026-09\x00", "2026-09;DROP TABLE clientes",
        "9" * 500,
    ]
    for malo in hostiles:
        r = client.get("/api/plataforma/metricas", params={"periodo": malo}, headers=cab)
        assert r.status_code == 422, f"{malo!r} -> {r.status_code}: {r.text[:160]}"
        detalle = json.dumps(r.json(), ensure_ascii=False)
        assert "Traceback" not in detalle and "sqlite" not in detalle.lower()
        assert malo not in detalle, f"el 422 refleja el valor recibido: {malo!r}"

    # Y las tablas siguen ahí: nada de lo anterior ejecutó nada.
    assert client.get("/api/plataforma/clientes", headers=cab).status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# 5. NO-ESCRITURA
# ════════════════════════════════════════════════════════════════════════════

def _foto_de(cliente_slug):
    """``{tabla: cantidad_de_filas}`` de TODAS las tablas de la base del cliente.

    Se enumeran con el inspector, no a mano: un test que mire tres tablas
    elegidas no ve la cuarta que alguien empiece a escribir mañana.
    """
    from sqlalchemy import inspect, text

    from app.clientes import buscar, motor_de

    cliente = buscar(cliente_slug)
    assert cliente is not None, cliente_slug
    motor = motor_de(cliente)
    tablas = sorted(inspect(motor).get_table_names())
    with motor.connect() as con:
        return {t: con.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar() for t in tablas}


def test_m24_dos_consultas_no_escriben_una_sola_fila_en_ninguna_tabla(client, monkeypatch):
    """M-24 — La promesa "solo lectura", verificada sobre TODAS las tablas.

    Foto completa de las dos bases de negocio (todas sus tablas, contadas por el
    inspector) antes y después de dos consultas de métricas. Incluye
    ``audit_log``: el camino del operador no puede escribir ni siquiera su
    propia constancia adentro de la base de un cliente — para eso está
    ``bitacora_plataforma``, en el registro.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    antes = {slug: _foto_de(slug) for slug in ("acme", "beta")}
    assert antes["acme"]["audit_log"] >= 0        # la tabla existe, o el test miente

    _pedir(client, cab, "2026-09")
    _pedir(client, cab, "2026-10")

    despues = {slug: _foto_de(slug) for slug in ("acme", "beta")}
    assert despues == antes, f"las métricas escribieron: {antes} -> {despues}"


def test_m25_lo_unico_que_crece_en_el_registro_es_la_bitacora_y_el_snapshot(client, monkeypatch):
    """M-25 — La otra mitad de M-24: el registro tampoco se mueve, salvo lo que
    la spec autoriza a escribir: la bitácora, y desde la Fase 5 el snapshot de
    tendencia (write-through, tabla nueva del registro).

    Si una consulta de métricas tocara ``usuarios``, ``membresias`` o
    ``estados_cliente`` —por ejemplo "marcando" al cliente visitado— la promesa
    de solo lectura sería falsa aunque las bases de negocio quedaran intactas.
    """
    from sqlalchemy import inspect, text

    from app.database import engine as motor_registro
    from app.plataforma_metricas import periodo_actual

    _ids, cab, _ = _escenario(client, monkeypatch)

    def foto():
        tablas = sorted(inspect(motor_registro).get_table_names())
        with motor_registro.connect() as con:
            return {t: con.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar() for t in tablas}

    # El mes EN CURSO, no `PERIODO`: de un mes ya pasado el write-through sólo
    # completa las filas que falten, y el arranque de la app ya cerró el mes
    # anterior con las que había. Con `PERIODO` fijo, la cuenta de abajo dependía
    # del día en que se corriera.
    periodo = periodo_actual()
    antes = foto()
    _pedir(client, cab, periodo)
    _pedir(client, cab, periodo)   # la segunda sale del caché y anota igual
    despues = foto()

    crecieron = {t: (antes[t], despues[t]) for t in antes if antes[t] != despues[t]}
    assert set(crecieron) == {"bitacora_plataforma", "snapshot_metricas"}, crecieron
    assert crecieron["bitacora_plataforma"][1] - crecieron["bitacora_plataforma"][0] == 2
    # El write-through sólo corre en el CÁLCULO real: la primera consulta deja
    # una fila por cliente LEGIBLE (acme, beta, galerias -- "roto" no) más la
    # consolidada; la segunda sale del caché de 5 min y no recalcula nada, así
    # que no vuelve a escribir el snapshot.
    assert crecieron["snapshot_metricas"][1] - crecieron["snapshot_metricas"][0] == 4


def test_m26_el_cliente_suspendido_aparece_con_sus_metricas_y_sin_su_motivo(client, monkeypatch):
    """M-26 — El guardrail de la spec, y su límite.

    Un cliente suspendido TIENE que aparecer (el operador necesita ver el
    negocio completo, y una cuenta cortada por impago es justamente la que hay
    que poder mirar). Lo que no puede aparecer es POR QUÉ está cortado: eso es
    texto libre del operador y vive en otro endpoint.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)
    cuerpo = _pedir(client, cab)

    beta = _fila(cuerpo, "beta")
    assert beta["estado_cuenta"] == "suspendido"
    assert beta["error"] is None
    # Fase 7 (sin umbral, docs/ESTADO.md): BETA tiene DOS contratos y su plata
    # sale EXACTA igual que la de cualquier otro cliente — suspendido no
    # cambia esa regla, la visibilidad completa (plata incluida) es el punto.
    assert beta["metricas"]["ingreso_contratado_mes"] == BETA_INGRESO
    assert beta["metricas"]["canon_promedio_mensual"] == BETA_CANON_PROMEDIO
    assert beta["metricas"]["ocupacion_pct"] == 100.0
    assert set(beta.keys()) == CLIENTE            # ni un campo para el motivo
    assert MOTIVO_ESTADO not in json.dumps(beta, ensure_ascii=False)

    # Y su plata cuenta en el consolidado: suspendido no es invisible.
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == CONS_INGRESO


# ════════════════════════════════════════════════════════════════════════════
# 6. ORDEN DE RUTAS
# ════════════════════════════════════════════════════════════════════════════

def test_m27_metricas_no_lo_captura_la_ruta_parametrica_ni_al_reves(client, monkeypatch):
    """M-27 — La regla dura de FastAPI, verificada sobre la tabla de rutas real.

    Hoy no chocarían (primer segmento distinto: ``/metricas`` vs
    ``/clientes/{slug}``), pero el orden se afirma igual, porque el día que
    alguien agregue ``/{algo}`` en este router la única defensa va a ser que
    ``/metricas`` ya esté declarada antes. Se comprueba de las dos maneras: el
    índice en ``app.routes`` y el comportamiento observable.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    from conftest import rutas_planas

    caminos = [r.path for r in rutas_planas(client.app)]
    i_metricas = caminos.index("/api/plataforma/metricas")
    parametricas = [i for i, p in enumerate(caminos)
                    if p.startswith("/api/plataforma/") and "{" in p]
    assert parametricas, "no hay rutas paramétricas en el router de plataforma"
    assert i_metricas < min(parametricas), caminos[i_metricas:min(parametricas) + 1]

    # Comportamiento: `/metricas` da métricas, no un cliente llamado "metricas".
    cuerpo = _pedir(client, cab)
    assert set(cuerpo.keys()) == RAIZ

    # Y la paramétrica no se come `/metricas`: un PATCH sobre el slug "metricas"
    # es un 404 de cliente inexistente, no un 405 ni un cambio de estado.
    r = client.patch("/api/plataforma/clientes/metricas",
                     json={"estado": "suspendido", "motivo": "x"}, headers=cab)
    assert r.status_code == 404, r.text

    # Al revés: `/clientes` (literal) sigue listando y no se confunde con `{slug}`.
    r = client.get("/api/plataforma/clientes", headers=cab)
    assert r.status_code == 200 and "clientes" in r.json()


def test_m28_metricas_no_acepta_metodos_de_escritura(client, monkeypatch):
    """M-28 — El endpoint es de lectura; los demás verbos no existen.

    Un ``POST /metricas`` que devolviera 200 (o que cayera en otra ruta) sería
    una escritura disfrazada de consulta. 405 es la respuesta correcta.
    """
    _ids, cab, _ = _escenario(client, monkeypatch)

    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        r = client.request(metodo, "/api/plataforma/metricas", json={}, headers=cab)
        assert r.status_code == 405, f"{metodo} /metricas -> {r.status_code}"


# ════════════════════════════════════════════════════════════════════════════
# 7. HALLAZGOS
# ════════════════════════════════════════════════════════════════════════════
#
# Las secciones 1-6 son defensas que aguantan. Ésta es lo que NO aguantó, y
# está escrita con la disciplina del precedente de la Fase 2:
#
# * `xfail(strict=True)` afirma el comportamiento SEGURO que hoy no se cumple.
#   La suite sigue verde y el hallazgo no se pierde; el día que se tape el
#   agujero el test pasa a XPASS y la suite se pone en rojo, que es el
#   recordatorio de sacarle el marcador.
# * Las CARACTERIZACIONES afirman lo que el sistema hace hoy, porque la
#   conducta es defendible pero tiene una consecuencia que conviene tener
#   escrita y vigilada.
#
# El detalle, la severidad y el arreglo propuesto de cada uno están en
# `features/plataforma/outputs/red-team-metricas.md`.


# Hallazgo CERRADO en ronda 2 (el test pasó a XPASS y se destapó): ahora es la red.
def test_m29_hallazgo_un_proveedor_con_correo_en_el_nombre_filtra_el_correo(client, monkeypatch):
    """M-29 · H-1 — La invariante de M-1 depende de lo que teclee el cliente.

    ``top_proveedores`` devuelve ``Supplier.name`` **verbatim**, y ese campo es
    texto libre que carga el supermercado. En retail colombiano un proveedor es
    muy seguido una persona natural, y la gente escribe el contacto adentro del
    nombre porque es el único campo que se ve en las listas.

    Sembrado ``"Juan Pérez Distribuciones (juan.perez@gmail.example)"``, el
    correo aparece tal cual en el JSON de métricas. No es un correo de un
    usuario final del cliente —por eso no lo marco bloqueante— pero es un dato
    personal de un tercero cruzando una frontera que la spec describe como
    "sólo números y el top de proveedores".

    Este test afirma el comportamiento SEGURO: que ningún string del JSON tenga
    ``@`` **también** cuando el nombre del proveedor trae uno.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    _sembrar_negocio("acme", {"NAVE": _NAVE}, [
        ("NAVE-PUN-01", "Juan Pérez Distribuciones (juan.perez@gmail.example)",
         "2026-09-01", "2026-09-30", CANON_1, True),
    ])
    consola = _consola(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    con_arroba = [(r, v) for r, v in _textos(cuerpo) if "@" in v]
    assert con_arroba == [], f"el nombre del proveedor filtró un correo: {con_arroba}"


# Hallazgo M-30 · H-2, RESUELTO por decisión de producto (Fase 7,
# docs/ESTADO.md): el dueño de la plataforma decidió que el operador vea los
# agregados EXACTOS de todos los clientes, sin umbral — la "celda de uno" ya
# no se protege escondiendo el número. La contrapartida es el reporte de
# transparencia del cliente (`app/plataforma_reporte.py`,
# `GET /api/clientes/mi-reporte-plataforma`), que documenta exactamente qué
# se tomó y quién lo consultó. Este test afirma el comportamiento NUEVO.
def test_m30_con_un_solo_contrato_el_canon_sale_exacto_por_decision_de_producto(client, monkeypatch):
    """M-30 · H-2 — Ya no es un hallazgo: es la regla.

    Hasta la Fase 6, un cliente con **un** contrato activo hacía que
    ``ingreso_contratado_mes`` y ``canon_promedio_mensual`` fueran,
    exactamente, el ``monthly_rent`` de ese contrato, y eso se consideraba un
    riesgo a mitigar (supresión de celda chica, K=3). El dueño de la
    plataforma decidió lo contrario (docs/ESTADO.md, Fase 7): sin umbral,
    ESO es justamente lo que tiene que pasar — el operador ve el negocio
    exacto, incluido el de un cliente en su primer mes con un solo contrato.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    _sembrar_negocio("acme", {"NAVE": _NAVE}, [
        ("NAVE-PUN-01", "Alpina", "2026-09-01", "2026-09-30", CANON_1, True),
    ])
    consola = _consola(ids, monkeypatch)
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(consola["token"]))
    m = _fila(cuerpo, "acme")["metricas"]
    assert m["ingreso_contratado_mes"] == CANON_1
    assert m["canon_promedio_mensual"] == CANON_1
    assert m["top_proveedores"] == [{"nombre": "Alpina", "contratos_activos": 1}]


# Hallazgo CERRADO en el cierre de fase — el test ahora afirma el arreglo.
def test_m31_hallazgo_el_prefijo_de_plataforma_no_tiene_frontera_de_segmento(client, monkeypatch):
    """M-31 · H-3 — ``startswith("/api/plataforma")`` también acepta ``/api/plataformazo``.

    ``clientes._cliente_de_la_consola`` es la defensa POR CONSTRUCCIÓN de la
    fase: el token de la consola sólo resuelve un cliente bajo
    ``/api/plataforma``. La comparación es un ``startswith`` sobre el path
    completo, sin exigir que el prefijo termine en ``/`` o en fin de cadena, así
    que ``/api/plataformazo/robar`` y ``/api/plataforma-publica/x`` también
    resuelven el cliente sintético.

    **Hoy no es explotable**: no existe ninguna ruta con ese prefijo. Es un
    hallazgo latente, y latente es el peor momento para no anotarlo, porque la
    promesa que el builder escribió es literalmente «aunque mañana alguien monte
    un endpoint nuevo sin pensar en esto, el pedido no llega a tener sesión de
    base» — y para un endpoint que empiece con esas catorce letras, sí llega.

    El mismo ``_PREFIJO_PLATAFORMA`` gobierna la EXENCIÓN del interruptor de
    estado de cuenta en ``_aplicar_estado``: una ruta futura
    ``/api/plataforma-publica`` quedaría además exenta del 402 para clientes
    suspendidos. Un solo carácter arregla los dos: comparar contra
    ``"/api/plataforma/"`` o exigir igualdad con ``"/api/plataforma"``.
    """
    from fastapi import HTTPException

    from app.clientes import _cliente_de_la_consola

    class PedidoFalso:
        def __init__(self, path):
            self.url = SimpleNamespace(path=path)

    vecinos = ("/api/plataformazo/robar", "/api/plataforma-publica/x", "/api/plataformaX")
    colados = []
    for path in vecinos:
        try:
            cliente = _cliente_de_la_consola(PedidoFalso(path))
        except HTTPException as e:
            assert e.status_code == 401, (path, e.status_code)
        else:
            colados.append((path, cliente.slug, cliente.db_name))

    assert colados == [], f"paths vecinos que resuelven cliente: {colados}"

    # Y lo que SÍ tiene que resolver, resuelve (el test no está midiendo un
    # 401 universal, que sería un falso verde).
    assert _cliente_de_la_consola(PedidoFalso("/api/plataforma/metricas")).slug == "plataforma"


def test_m32_caracterizacion_el_nombre_del_cliente_viaja_crudo_y_sin_tope(client, monkeypatch):
    """M-32 · H-4 — ``clientes.nombre`` es texto libre sin filtro ni largo máximo.

    El alta sólo le hace ``strip()`` y le exige no estar vacío. Ese string
    aparece ahora en ``$.clientes[i].nombre`` de un endpoint que recorre TODOS
    los clientes y **cachea la respuesta cinco minutos en memoria del proceso**.
    Dos consecuencias, las dos nuevas de esta fase:

    * lo que un cliente escriba —un correo, un ``<script>``— llega al JSON del
      operador (la consola es React y escapa, pero la invariante «ni una arroba»
      de M-1 no es estructural: depende de lo que tecleó el cliente);
    * sin tope de largo, un nombre de decenas de miles de caracteres infla la
      respuesta y el caché de todos los operadores.

    Se caracteriza —no se marca ``xfail``— porque el operador ya veía ese mismo
    nombre en ``/plataforma/clientes`` desde la Fase 2: el dato no es nuevo, el
    canal sí. Severidad baja; el arreglo (un tope de largo en el alta) es de una
    línea y está en el informe.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    hostil = "Acme <script>alert(1)</script> contacto@acme.example " + ("A" * 5_000)

    ids = Identidades(client)
    ids.registrar("uid-acme", CORREO_DUENA_ACME)
    r = client.post("/api/clientes/alta", json={
        "id_token": "uid-acme", "slug": "acme", "nombre": hostil, "acepta_politica": True,
    })
    assert r.status_code == 200, r.text   # el alta lo acepta tal cual

    consola = _consola(ids, monkeypatch)
    limpiar_cache_metricas()
    cuerpo = _pedir(client, _cab(consola["token"]))

    # La conducta de HOY, fijada para que un cambio se note:
    assert _fila(cuerpo, "acme")["nombre"] == hostil
    assert len(_fila(cuerpo, "acme")["nombre"]) > 5_000
    # Y la consecuencia: M-1 sólo aguanta mientras nadie escriba una arroba.
    assert any("@" in v for _r, v in _textos(cuerpo))


def test_m33_caracterizacion_el_admin_del_cliente_por_defecto_corta_la_consola(client, admin, monkeypatch):
    """M-33 · H-5 — Un cliente puede desloguear al dueño del SaaS.

    La época del token de la consola se emite contra la base POR DEFECTO, que en
    producción es la de ``galerias``. Cambiar ahí la contraseña de ``worker``
    sube ``token_epoch_worker`` y el token del operador muere en el pedido
    siguiente: **el administrador de un cliente puede cerrarle la consola al
    operador de la plataforma**, sin ser operador ni saber que lo hizo.

    Es una influencia entre inquilinos que no debería existir, aunque su efecto
    máximo sea un re-login. Se caracteriza porque el builder la eligió a
    conciencia y la documentó (la alternativa era no comprobar época para este
    token, que sería quitar una defensa): el test la deja fijada para que si
    mañana se resuelve con una época propia del registro, alguien lo note.
    """
    ids = Identidades(client)
    consola = _consola(ids, monkeypatch)
    cab = _cab(consola["token"])
    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 200

    r = client.put("/api/auth/passwords",
                   json={"worker_password": "otra-clave-larga-123"}, headers=admin)
    assert r.status_code == 200, r.text

    # El pedido siguiente, sin dormir nada:
    assert client.get("/api/plataforma/metricas", headers=cab).status_code == 401
    assert client.get("/api/plataforma/soy", headers=cab).status_code == 401


def test_m34_el_patch_de_estado_refresca_tambien_el_cache_de_metricas(client, monkeypatch):
    """M-34 · H-6 — CERRADO: el PATCH invalida también el caché de métricas.

    Nació como caracterización del defecto (el panel decía "activo" hasta 5
    minutos después de que el propio operador suspendiera al cliente en la
    misma pantalla). El arreglo fue el que este mismo test proponía: llamar a
    ``limpiar_cache_metricas()`` desde el PATCH, al lado del
    ``invalidar_cache_estado`` que ya estaba. Ahora afirma la conducta buena.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    consola = _consola(ids, monkeypatch)
    cab = _cab(consola["token"])
    limpiar_cache_metricas()

    assert _fila(_pedir(client, cab), "acme")["estado_cuenta"] == "activo"

    r = client.patch("/api/plataforma/clientes/acme",
                     json={"estado": "suspendido", "motivo": "impago"}, headers=cab)
    assert r.status_code == 200 and r.json()["estado"] == "suspendido"

    # El endpoint que NO cachea ya lo dice; el de métricas todavía no.
    listado = client.get("/api/plataforma/clientes", headers=cab).json()["clientes"]
    assert next(c for c in listado if c["slug"] == "acme")["estado"] == "suspendido"

    # ...y el de métricas AHORA TAMBIÉN: el PATCH limpió su caché, así que la
    # respuesta se recalcula (de_cache False) y trae el estado recién puesto.
    cuerpo = _pedir(client, cab)
    assert cuerpo["de_cache"] is False
    assert _fila(cuerpo, "acme")["estado_cuenta"] == "suspendido"


def test_m35_las_rutas_deformadas_no_le_sirven_datos_a_la_consola(client, monkeypatch):
    """M-35 — Normalización de path: doble barra, caja, ``..`` y ``%2f``.

    Si el guard mira ``request.url.path`` y el router normaliza distinto, hay un
    hueco entre los dos. Se prueban las deformaciones clásicas contra un router
    de negocio. Lo único que puede volver 200 es el ``index.html`` de la SPA
    (el catch-all del frontend, que no lleva datos): se exige explícitamente que
    cualquier 200 sea HTML y no JSON de negocio.
    """
    _ids, cab, _ = _escenario(client, monkeypatch, con_supresion=False, con_roto=False)

    deformadas = [
        "/api/plataforma/../spaces/", "/api/plataforma/..%2fspaces/",
        "/api/plataforma%2f../spaces/", "//api/spaces/", "/api//spaces/",
        "/api/Spaces/", "/api/spaces/./", "/api/plataforma/./../suppliers/",
    ]
    for ruta in deformadas:
        r = client.get(ruta, headers=cab)
        if r.status_code == 200:
            tipo = r.headers.get("content-type", "")
            assert tipo.startswith("text/html"), f"{ruta} devolvió {tipo}: {r.text[:120]}"
        else:
            assert r.status_code in (401, 403, 404, 405), f"{ruta} -> {r.status_code}"


def test_m36_ningun_endpoint_de_plataforma_salvo_metricas_abre_una_base_de_cliente(client, monkeypatch):
    """M-36 — La enmienda es QUIRÚRGICA: un solo endpoint, y se verifica que sea uno.

    Se rompen las bases de TODOS los clientes y se pide cada endpoint de
    ``/api/plataforma``. El único que puede acusar el golpe es ``/metricas``
    (que marca ``error`` en las filas y sigue); todos los demás tienen que
    contestar 200 como si nada, porque no abren ninguna base de negocio.

    Es el test que detecta la regresión que más cara sale: alguien que, para
    "mejorar" el listado de clientes, le agregue un conteo leído de la base de
    cada uno. Ese cambio pasaría todos los tests de contrato del JSON de
    métricas y rompería la enmienda igual.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA_ACME, "acme", "Acme Supermercados")
    _sembrar_negocio("acme", {"NAVE": _NAVE}, _CONTRATOS_ACME[:1])
    consola = _consola(ids, monkeypatch)
    cab = _cab(consola["token"])
    limpiar_cache_metricas()

    # Se destruye la base de acme DESPUÉS de sembrarla y de soltar los motores.
    from app.clientes import olvidar_motores, url_para
    olvidar_motores()
    with open(url_para("recabra_acme").split("sqlite:///", 1)[1], "wb") as f:
        f.write(b"ya no soy una base de datos\n" * 50)

    for ruta in ("/api/plataforma/soy", "/api/plataforma/clientes",
                 "/api/plataforma/supresiones"):
        r = client.get(ruta, headers=cab)
        assert r.status_code == 200, f"{ruta} tocó la base del cliente: {r.status_code} {r.text[:120]}"

    # El interruptor tampoco la abre.
    r = client.patch("/api/plataforma/clientes/acme",
                     json={"estado": "gracia", "motivo": "revisión"}, headers=cab)
    assert r.status_code == 200, r.text

    # Y métricas, que sí la abre, se lo banca y lo dice en la fila.
    limpiar_cache_metricas()
    cuerpo = _pedir(client, cab)
    assert _fila(cuerpo, "acme")["error"] == ERROR_FIJO
