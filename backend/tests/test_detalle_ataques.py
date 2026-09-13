"""Fase 8 (Detalle por cliente) — la FRONTERA de ``/clientes/{slug}/detalle``.

Red team del endpoint más profundo que existe hoy contra la base de UN cliente:
``GET /api/plataforma/clientes/{slug}/detalle`` (``app/plataforma_detalle.py`` +
``app/routers/plataforma.py``). Es la PRIMERA puerta de la plataforma que
devuelve **filas** —espacio por espacio, contrato por contrato— y no agregados,
así que todo lo que las Fases 4-7 protegían por construcción ("el operador ve
promedios, nunca renglones") acá tiene que protegerse a mano, campo por campo.

Sucesor de ``test_metricas_ataques.py`` (Fase 4), ``test_tendencia_ataques.py``
(Fase 5), ``test_asesoria_ataques.py`` (Fase 6), ``test_auditoria_frontera.py``
(auditoría integral) y ``test_transparencia_ataques.py`` (Fase 7). **Misma
disciplina: acá NO se arregla código de producción.** Un defecto se fija con un
test que lo demuestra —``xfail(strict=True)`` afirmando el comportamiento SEGURO
que hoy no se cumple— y se cuenta en
``features/asesoria-detalle/outputs/auditor-frontera.md``. Ninguna aserción se
ablanda para que la suite quede verde.

Las seis preguntas de frontera que este archivo tiene que poder contestar:

A. **¿Se escapa algo de la propia base de A?** — los contactos y las notas del
   proveedor, las notas del espacio y del contrato, el archivo del espacio, la
   tarifa de referencia, los campos comerciales del JSON del plano (d01..d08).
B. **¿Se escapa algo de B adentro del detalle de A?** — ni el slug, ni el
   nombre, ni el proveedor, ni el canon; el benchmark es UN número por tipo
   (d10..d14).
C. **¿La puerta aguanta?** — 401 / 403 / 404 / 422 / 503, y el 403 del dueño de
   A es indistinguible contra su propio cliente y contra el ajeno (d20..d26).
D. **¿Queda constancia y la constancia no delata?** — una línea por consulta,
   sin dato de negocio, visible en el reporte del titular y sólo en el suyo
   (d30..d33).
E. **¿Es de verdad sólo lectura, y la ruta está donde tiene que estar?**
   (d40..d43).
F. **¿La aritmética interna protege la frontera?** — lo que no cuadra suele ser
   una fuga disfrazada de suma (d50..d54).

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

import pytest

# ════════════════════════════════════════════════════════════════════════════
# LOS SENTINELAS
#
# Todos únicos, todos primos, sin relación aritmética entre sí ni con las
# cuentas que el endpoint hace (promedios, sumas, brechas): si uno aparece
# donde no corresponde, no puede ser una coincidencia de redondeo.
# ════════════════════════════════════════════════════════════════════════════

CORREO_OPERADOR = "op@recabra.example"
CORREO_DUENA_A = "duena.alfa@alfa.example"
CORREO_ADMIN_A = "gerente.alfa@alfa.example"
CORREO_WORKER_A = "peon.alfa@alfa.example"
CORREO_DUENO_B = "dueno.beta@beta.example"
CORREO_DUENO_C = "dueno.gama@gama.example"

UID_A, UID_ADMIN_A, UID_WORKER_A = "uid-alfa-duena", "uid-alfa-admin", "uid-alfa-worker"
UID_B, UID_C, UID_OP = "uid-beta-dueno", "uid-gama-dueno", "uid-operador"

SLUG_A, SLUG_B, SLUG_C = "alfa", "beta", "gama"
NOMBRE_A = "Alfa Supermercados"
NOMBRE_B = "Beta Market Unico"
NOMBRE_C = "Gama Sin Contratos"

# --- Canon: cuatro primos sin relación entre sí ni con la tarifa ------------
CANON_A_PUNTA = 4_111_123.0      # ALFA-PUN-01, el ÚNICO contrato de punta de A
CANON_A_GONDOLA = 5_222_237.0    # ALFA-GON-01-B, vence dentro del período
CANON_A_NEVERA = 6_333_337.0     # ALFA-NEV-01
CANON_A_VIEJO = 7_444_441.0      # vencido: sólo existe para los movimientos
CANON_B = 8_111_123.0            # BETA-E-01, el ÚNICO contrato de punta de B

# El benchmark de plataforma para "punta" con A y B sembrados: el promedio de
# los DOS únicos contratos de punta que hay en toda la instalación.
BENCHMARK_PUNTA = (CANON_A_PUNTA + CANON_B) / 2  # 6.111.123,0

# --- La tarifa de referencia de A: NUNCA sale al JSON ------------------------
# Se carga por el camino real (`PUT /api/layout/rates` con el admin del
# cliente), no escribiendo `app_config` a mano: lo que se prueba es lo que un
# supermercado hace de verdad.
TARIFA_A = 2_555_551.0

# --- El proveedor de A, con un correo y un teléfono adentro del nombre -------
CORREO_PROVEEDOR_A = "ventas@sur.example"
TELEFONO_PROVEEDOR_A = "3005558899"
PROVEEDOR_A = f"Lacteos Sur {CORREO_PROVEEDOR_A} tel 300 555 8899"
PROVEEDOR_A2 = "Nevados del Ruiz SAS"
MASCARA_CORREO = "[correo oculto]"
MASCARA_TELEFONO = "[teléfono oculto]"

# --- La ficha del proveedor: las cuatro columnas que NO se abren -------------
CONTACTO_PROVEEDOR = "Juana Perez Contacto"
CORREO_FICHA_PROVEEDOR = "contacto.ficha@sur.example"
NOTA_PROVEEDOR = "NotaSecretaProveedorAlfa paga tarde"
NOTA_ESPACIO = "NotaSecretaEspacioAlfa la punta de la entrada"
NOTA_CONTRATO = "NotaSecretaContratoAlfa descuento verbal del 12%"
ARCHIVO_ESPACIO = "foto-secreta-alfa.jpg"
ARCHIVO_CONTRATO = "planometria-secreta-alfa.pdf"
BYTES_ARCHIVO = b"BYTESSECRETOSDELARCHIVODEALFA"

MARCA_A = "MarcaVisibleAlfa"

# --- El plano de A trae los campos comerciales del modelo dual ---------------
# Los contratos salen de `space_leases`, NUNCA del JSON del layout: si alguno
# de estos cuatro aparece, el endpoint está leyendo la fuente equivocada.
PLANO_PROVEEDOR = "ProveedorDelPlanoAlfa"
PLANO_OBSERVACION = "ObservacionSecretaDelPlano"
PLANO_NOMENCLATURA = "NomenclaturaSecretaAlfa"
PLANO_ETIQUETA = "EtiquetaSecretaAlfa"
PLANO_VALOR = 9_999_991.0

# --- Lo de B: nada de esto puede asomar en el detalle de A ------------------
PROVEEDOR_B = "ZetaUnicaBetaSAS"
MARCA_B = "MarcaUnicaDeBeta"
TELEFONO_PROVEEDOR_B = "3019998877"
CORREO_PROVEEDOR_B = "ventas.beta@beta.example"

# Los 7 tipos de recomendación que la spec permite, y nada más.
TIPOS_RECOMENDACION = {
    "espacio_libre", "contrato_por_vencer", "precio_bajo_tarifa",
    "concentracion_proveedor", "sede_subutilizada", "sin_tarifa", "arranque",
}
PRIORIDADES = {"alta", "media", "baja"}

# El shape VINCULANTE, clave por clave y nivel por nivel: ni una de más ni una
# de menos.
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

# Claves prohibidas en CUALQUIER nivel del JSON, incluidos los `datos` de una
# recomendación. `tarifa_configurada` es la ÚNICA de la familia "tarifa" que la
# spec deja pasar, y es un booleano.
CLAVES_PROHIBIDAS = {
    "contact_name", "phone", "email", "correo", "telefono", "notes", "nota",
    "notas", "observacion", "filename", "data", "content_type", "space_id",
    "lease_id", "supplier_id", "usuario", "usuarios", "sub", "uid", "tarifa",
    "tarifas", "rates", "by_sede", "default", "reference",
}
# Familias que ninguna clave puede contener como subcadena, con una sola
# excepción declarada.
FAMILIAS_PROHIBIDAS = ("tarifa", "rates", "reference", "by_sede")
CLAVE_TARIFA_PERMITIDA = "tarifa_configurada"

ERROR_404 = "No hay un cliente con ese código."

_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MES_RE = re.compile(r"^\d{4}-\d{2}$")

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
    r = ids.client.post(
        "/api/usuarios/invitar", json={"email": email, "rol": rol}, headers=owner_cab)
    assert r.status_code == 200, r.text
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid, "acepta_politica": True})
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _operador_sin_membresias(ids: Identidades, monkeypatch, uid=UID_OP, email=CORREO_OPERADOR):
    """El dueño del SaaS: correo en ``OPERADOR_EMAILS`` y CERO membresías."""
    monkeypatch.setenv("OPERADOR_EMAILS", email)
    ids.registrar(uid, email)
    r = ids.client.post("/api/auth/oauth", json={"id_token": uid})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo.get("plataforma") is True, cuerpo
    return _cab(cuerpo["token"])


# ─── El plano sembrado ───────────────────────────────────────────────────────
#
# A: sede ALFA -> PUN-01 (punta), PUN-02 (punta), GON-01 (góndola DOBLE: dos
#    caras, A y B), NEV-01 (nevera); sede SUR -> PUN-01 (punta), BAT-01
#    (batea). Siete caras comercializables. Y un CAJ-01 (checkout) que NO
#    cuenta: una caja registradora es un puesto de trabajo de la tienda, y eso
#    lo decide el TIPO — ni siquiera hace falta la bandera `rentable`.
# B: sede BETA -> E-01 (punta). Una sola.
# C: sede GAMA -> G-01 (punta), G-02 (nevera). Sin un solo contrato.
#
# El fixture de ALFA-PUN-01 lleva los campos COMERCIALES del modelo dual
# (`supplierName`, `negotiatedValue`, `observation`, `nomenclatura`, `label`):
# el detalle tiene que sacar los contratos de `space_leases` y no de acá.

_ALFA = [
    {
        "id": "fx-1", "code": "PUN-01", "type": "punta", "sede": "ALFA",
        "cx": 3, "cz": 8, "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8,
        "label": PLANO_ETIQUETA, "nomenclatura": PLANO_NOMENCLATURA,
        "supplierName": PLANO_PROVEEDOR, "negotiatedValue": PLANO_VALOR,
        "observation": PLANO_OBSERVACION, "status": "occupied",
        "startDate": "2020-01-01", "endDate": "2035-12-31",
    },
    {
        "id": "fx-2", "code": "PUN-02", "type": "punta", "sede": "ALFA",
        "cx": 6, "cz": 8, "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8,
        "label": PLANO_ETIQUETA, "observation": PLANO_OBSERVACION,
    },
    {
        "id": "fx-3", "code": "GON-01", "type": "gondola", "gondolaType": "double",
        "sede": "ALFA", "cx": 9, "cz": 8, "rotY": 0, "w": 0.9, "d": 4.0, "h": 1.8,
        "supplierName": PLANO_PROVEEDOR, "negotiatedValue": PLANO_VALOR,
    },
    {
        "id": "fx-4", "code": "NEV-01", "type": "nevera", "sede": "ALFA",
        "cx": 12, "cz": 8, "rotY": 0, "w": 1.5, "d": 0.8, "h": 2.0,
    },
]
_SUR = [
    {
        "id": "fx-5", "code": "PUN-01", "type": "punta", "sede": "SUR",
        "cx": 2, "cz": 2, "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8,
    },
    {
        "id": "fx-6", "code": "BAT-01", "type": "batea", "sede": "SUR",
        "cx": 5, "cz": 2, "rotY": 0, "w": 0.8, "d": 0.6, "h": 0.8,
    },
    {
        "id": "fx-7", "code": "CAJ-01", "type": "checkout", "sede": "SUR",
        "cx": 8, "cz": 2, "rotY": 0, "w": 6.0, "d": 1.2, "h": 1.2,
    },
]
_BETA = [
    {
        "id": "fx-b1", "code": "E-01", "type": "punta", "sede": "BETA",
        "cx": 1, "cz": 1, "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8,
    },
]
_GAMA = [
    {"id": "fx-c1", "code": "G-01", "type": "punta", "sede": "GAMA",
     "cx": 1, "cz": 1, "rotY": 0, "w": 1.2, "d": 0.9, "h": 1.8},
    {"id": "fx-c2", "code": "G-02", "type": "nevera", "sede": "GAMA",
     "cx": 4, "cz": 1, "rotY": 0, "w": 1.5, "d": 0.8, "h": 2.0},
]

# Los siete espacios de A, en el orden en que el endpoint los publica.
ESPACIOS_A = [
    "ALFA-GON-01", "ALFA-GON-01-B", "ALFA-NEV-01", "ALFA-PUN-01", "ALFA-PUN-02",
    "SUR-BAT-01", "SUR-PUN-01",
]


def _periodo():
    from app.plataforma_metricas import periodo_actual

    return periodo_actual()


def _rango(anio_mes=None):
    from app.plataforma_metricas import rango_del_periodo

    return rango_del_periodo(anio_mes or _periodo())


def _contratos_a(desde: date):
    """``(codigo, proveedor, marca, ini, fin, canon, activo)``.

    Tres del período (uno que se libera adentro, con 15 días para vencer) y uno
    histórico ya vencido, que sólo existe para que los movimientos de los 12
    meses tengan algo que contar.
    """
    return [
        (f"{SLUG_A.upper()}-PUN-01".replace(f"{SLUG_A.upper()}-", "ALFA-"),
         PROVEEDOR_A, MARCA_A, desde - timedelta(days=200), desde + timedelta(days=400),
         CANON_A_PUNTA, True),
        ("ALFA-GON-01-B", PROVEEDOR_A, MARCA_A,
         desde - timedelta(days=40), desde + timedelta(days=15), CANON_A_GONDOLA, True),
        ("ALFA-NEV-01", PROVEEDOR_A2, None,
         desde - timedelta(days=100), desde + timedelta(days=300), CANON_A_NEVERA, True),
        # Vencido hace medio año: fuera del período, adentro de los movimientos.
        ("ALFA-PUN-02", PROVEEDOR_A2, None,
         desde - timedelta(days=300), desde - timedelta(days=200), CANON_A_VIEJO, True),
    ]


def _contratos_b(desde: date):
    return [
        ("BETA-E-01", PROVEEDOR_B, MARCA_B,
         desde - timedelta(days=100), desde + timedelta(days=300), CANON_B, True),
    ]


def _sembrar(slug, sedes: dict, contratos: list, *, correo_proveedor, telefono_proveedor,
             con_archivos=False):
    """Layout + proveedores CON ficha completa + espacios y contratos CON notas.

    Es lo único de este archivo que escribe en una base de NEGOCIO: el endpoint
    atacado no escribe nunca (d40 lo mide con el hash del archivo).
    """
    from app.clientes import buscar, sesion_de
    from app.models.models import (
        LayoutSnapshot, LeaseFile, Space, SpaceFile, SpaceLease, Supplier,
    )

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        for sede, fixtures in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(fixtures)))
        db.flush()

        proveedores: dict = {}
        espacios: dict = {}
        primer_lease = None
        primer_espacio = None
        for codigo, proveedor, marca, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
                fila = Supplier(
                    name=proveedor,
                    contact_name=CONTACTO_PROVEEDOR,
                    phone=telefono_proveedor,
                    email=correo_proveedor,
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
                        zone="Zona Fria", sede=codigo.split("-")[0], area_m2=5.0,
                        notes=NOTA_ESPACIO,
                    )
                    db.add(espacio)
                    db.flush()
                espacios[codigo] = espacio
                if primer_espacio is None:
                    primer_espacio = espacio
            lease = SpaceLease(
                space_id=espacios[codigo].id,
                supplier_id=proveedores[proveedor].id,
                marca=marca,
                start_date=ini,
                end_date=fin,
                monthly_rent=canon,
                is_active=activo,
                notes=NOTA_CONTRATO,
            )
            db.add(lease)
            db.flush()
            if primer_lease is None:
                primer_lease = lease

        if con_archivos:
            # La foto del espacio y la planometría del contrato: dos tablas
            # enteras que la spec deja del lado prohibido.
            db.add(SpaceFile(
                space_id=primer_espacio.id, filename=ARCHIVO_ESPACIO,
                content_type="image/jpeg", size=len(BYTES_ARCHIVO), data=BYTES_ARCHIVO,
            ))
            db.add(LeaseFile(
                lease_id=primer_lease.id, kind="planometria", filename=ARCHIVO_CONTRATO,
                content_type="application/pdf", size=len(BYTES_ARCHIVO),
                data=BYTES_ARCHIVO, subido_por=CORREO_ADMIN_A,
            ))
        db.commit()
    finally:
        db.close()


def _cargar_tarifa(client, cab_admin, tarifas: dict):
    """La tarifa de referencia POR EL CAMINO REAL: ``PUT /api/layout/rates`` con
    un admin del cliente. Escribirla a mano en ``app_config`` probaría otra
    cosa."""
    r = client.put(
        "/api/layout/rates",
        json={"default": tarifas, "by_sede": {}},
        headers=cab_admin,
    )
    assert r.status_code == 200, r.text
    return r.json()


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
        reg.commit()
    finally:
        reg.close()
    plataforma_estado.limpiar_cache_estado()


def _lineas_bitacora(accion=None):
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        q = reg.query(BitacoraPlataforma)
        if accion is not None:
            q = q.filter(BitacoraPlataforma.accion == accion)
        return [
            {"email": f.email, "accion": f.accion, "periodo": f.periodo, "en": f.en}
            for f in q.order_by(BitacoraPlataforma.id).all()
        ]
    finally:
        reg.close()


def _campo(client, monkeypatch, *, con_tarifa=True, con_roto=False, con_gama=False,
           con_equipo=False):
    """El campo de batalla: A (con PII por todos lados) + B + el operador.

    Devuelve ``(ids, cab_a, cab_b, cab_op)``.
    """
    from app.plataforma_detalle import limpiar_cache_detalle
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    alta_a = _fundar(ids, UID_A, CORREO_DUENA_A, SLUG_A, NOMBRE_A)
    alta_b = _fundar(ids, UID_B, CORREO_DUENO_B, SLUG_B, NOMBRE_B)
    cab_a, cab_b = _cab(alta_a["token"]), _cab(alta_b["token"])

    desde, _hasta = _rango()
    _sembrar(SLUG_A, {"ALFA": _ALFA, "SUR": _SUR}, _contratos_a(desde),
             correo_proveedor=CORREO_FICHA_PROVEEDOR,
             telefono_proveedor=TELEFONO_PROVEEDOR_A, con_archivos=True)
    _sembrar(SLUG_B, {"BETA": _BETA}, _contratos_b(desde),
             correo_proveedor=CORREO_PROVEEDOR_B,
             telefono_proveedor=TELEFONO_PROVEEDOR_B)

    if con_tarifa:
        # Sólo "nevera": así `tarifa_configurada` sale True en un tipo y False
        # en los otros tres, y la recomendación `sin_tarifa` tiene qué decir.
        _cargar_tarifa(client, cab_a, {"nevera": TARIFA_A})
    if con_gama:
        alta_c = _fundar(ids, UID_C, CORREO_DUENO_C, SLUG_C, NOMBRE_C)
        _sembrar(SLUG_C, {"GAMA": _GAMA}, [],
                 correo_proveedor=CORREO_PROVEEDOR_B,
                 telefono_proveedor=TELEFONO_PROVEEDOR_B)
        assert alta_c["token"]
    if con_equipo:
        _invitar_y_entrar(ids, cab_a, uid=UID_ADMIN_A, email=CORREO_ADMIN_A, rol="admin")
        _invitar_y_entrar(ids, cab_a, uid=UID_WORKER_A, email=CORREO_WORKER_A, rol="worker")
    if con_roto:
        _romper()

    cab_op = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    limpiar_cache_detalle()
    return ids, cab_a, cab_b, cab_op


def _pedir(client, cab, slug=SLUG_A, periodo=None):
    params = {} if periodo is None else {"periodo": periodo}
    return client.get(f"/api/plataforma/clientes/{slug}/detalle", headers=cab, params=params)


def _detalle(client, cab, slug=SLUG_A, periodo=None):
    r = _pedir(client, cab, slug, periodo)
    assert r.status_code == 200, r.text
    return r.json()


# ─── El recorrido recursivo (nada se mira sólo en el primer nivel) ───────────

def _hojas(nodo, ruta="$"):
    """Todos los escalares del JSON con su RUTA: el mensaje de un fallo tiene
    que decir dónde estaba la fuga, no sólo que la hubo."""
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


def _textos(cuerpo):
    return [(ruta, v) for ruta, v in _hojas(cuerpo) if isinstance(v, str)]


def _numeros(cuerpo):
    # `bool` es subclase de `int` en Python: `arranca_en_periodo` no es número.
    return [(ruta, v) for ruta, v in _hojas(cuerpo)
            if isinstance(v, (int, float)) and not isinstance(v, bool)]


def _digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto)


def _nombres_de_proveedor(cuerpo) -> list:
    """Cada lugar del JSON donde viaja un NOMBRE de proveedor, con su ruta.

    La lista es taxativa a propósito: si mañana el shape gana un lugar nuevo
    donde el nombre aparece, este helper no lo cubre y el test d04 deja de
    proteger ese rincón — por eso d04 además exige que el crudo no esté en
    NINGUNA hoja, que sí es exhaustivo.
    """
    salida = []
    for e in cuerpo["espacios"]:
        if e["contrato"] is not None:
            salida.append((f"espacios[{e['codigo']}].contrato", e["contrato"]["proveedor"]))
    for p in cuerpo["proveedores"]:
        salida.append((f"proveedores[{p['nombre']}]", p["nombre"]))
    for m in cuerpo["movimientos"]:
        for lado in ("entradas", "salidas"):
            for mov in m[lado]:
                salida.append((f"movimientos[{m['mes']}].{lado}", mov["proveedor"]))
    for o in cuerpo["oportunidades"]:
        for c in o["candidatos"]:
            salida.append((f"oportunidades[{o['codigo']}].candidatos", c["proveedor"]))
    for r in cuerpo["recomendaciones"]:
        datos = r["datos"]
        if isinstance(datos.get("proveedor"), str):
            salida.append((f"recomendaciones[{r['id']}].datos.proveedor", datos["proveedor"]))
        for c in datos.get("candidatos", []) or []:
            salida.append((f"recomendaciones[{r['id']}].datos.candidatos", c["proveedor"]))
    return salida


# ════════════════════════════════════════════════════════════════════════════
# A. FUGAS DE LA PROPIA BASE
# ════════════════════════════════════════════════════════════════════════════

def test_d01_ninguna_hoja_trae_contactos_notas_ni_archivos(client, monkeypatch):
    """¿El detalle deja salir alguna de las columnas que la spec prohíbe?

    ``Supplier.contact_name/phone/email/notes``, ``Space.notes``,
    ``SpaceLease.notes``, el ``filename`` del ``SpaceFile`` y el del
    ``LeaseFile``: ocho campos sembrados con sentinelas únicos, buscados en
    TODAS las hojas y en el JSON serializado entero.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    prohibidos = {
        "Supplier.contact_name": CONTACTO_PROVEEDOR,
        "Supplier.email": CORREO_FICHA_PROVEEDOR,
        "Supplier.notes": NOTA_PROVEEDOR,
        "Space.notes": NOTA_ESPACIO,
        "SpaceLease.notes": NOTA_CONTRATO,
        "SpaceFile.filename": ARCHIVO_ESPACIO,
        "LeaseFile.filename": ARCHIVO_CONTRATO,
        "SpaceFile.data": BYTES_ARCHIVO.decode(),
    }
    for etiqueta, valor in prohibidos.items():
        assert valor not in crudo, f"{etiqueta} se escapó al JSON del detalle"
        for ruta, texto in _textos(cuerpo):
            assert valor not in texto, f"{etiqueta} apareció en {ruta}: {texto!r}"


def test_d02_ningun_string_del_json_trae_una_arroba(client, monkeypatch):
    """¿Queda algún correo en el detalle?

    A diferencia del reporte de transparencia (que publica
    ``accesos.lineas[].operador``), acá NO hay un solo campo que tenga derecho
    a llevar un correo: la invariante es absoluta, y una arroba en cualquier
    hoja es una fuga sin necesidad de saber de quién.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_equipo=True)
    cuerpo = _detalle(client, cab_op)

    for ruta, texto in _textos(cuerpo):
        assert "@" not in texto, f"arroba en {ruta}: {texto!r}"
    assert "@" not in json.dumps(cuerpo, ensure_ascii=False)


def test_d03_los_digitos_del_telefono_sembrado_no_estan_en_ningun_string(client, monkeypatch):
    """¿El teléfono del proveedor sobrevive en alguna forma —junto o separado?

    Se comparan los DÍGITOS de cada string (así ``300-555-8899``,
    ``300 555 8899`` y ``300·555·8899`` son el mismo ataque), y además se exige
    que ``sanear_nombre_proveedor`` sea IDEMPOTENTE sobre cada nombre publicado:
    si un nombre ya salió saneado, sanearlo otra vez no lo cambia; si cambia, es
    que salió crudo. Ese es el criterio que no confunde un teléfono con un
    ``$ 5.222.237`` —que ``_TELEFONO_RE`` también matchea y que las
    explicaciones traen legítimamente—.
    """
    from app.plataforma_metricas import sanear_nombre_proveedor

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    for ruta, texto in _textos(cuerpo):
        assert TELEFONO_PROVEEDOR_A not in _digitos(texto), \
            f"el teléfono del proveedor está en {ruta}: {texto!r}"
        assert TELEFONO_PROVEEDOR_B not in _digitos(texto), \
            f"el teléfono del proveedor de B está en {ruta}: {texto!r}"

    for ruta, nombre in _nombres_de_proveedor(cuerpo):
        assert sanear_nombre_proveedor(nombre) == nombre, \
            f"el nombre de {ruta} no salió saneado: {nombre!r}"

    for r in cuerpo["recomendaciones"]:
        assert CORREO_PROVEEDOR_A not in r["explicacion"]
        assert TELEFONO_PROVEEDOR_A not in _digitos(r["explicacion"])


def test_d04_el_nombre_del_proveedor_sale_enmascarado_en_todos_los_lugares(client, monkeypatch):
    """¿Hay algún rincón del shape donde el nombre salga sin sanear?

    El nombre crudo trae un correo y un teléfono adentro. Tiene que salir con
    las máscaras EXACTAS en los cinco lugares donde viaja (contrato del
    espacio, proveedores, movimientos, candidatos de una oportunidad y
    recomendaciones), y el crudo no puede estar en ninguna hoja.
    """
    from app.plataforma_metricas import sanear_nombre_proveedor

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)
    esperado = sanear_nombre_proveedor(PROVEEDOR_A)
    assert MASCARA_CORREO in esperado and MASCARA_TELEFONO in esperado, esperado

    lugares = {ruta.split("[")[0] for ruta, nombre in _nombres_de_proveedor(cuerpo)
               if nombre == esperado}
    for esperado_lugar in ("espacios", "proveedores", "movimientos", "oportunidades",
                           "recomendaciones"):
        assert any(l.startswith(esperado_lugar) for l in lugares), \
            f"el nombre enmascarado no aparece en {esperado_lugar}: {sorted(lugares)}"

    # Y en las explicaciones, que son el único texto en prosa del shape.
    explicaciones = [r["explicacion"] for r in cuerpo["recomendaciones"]]
    assert any(esperado in e for e in explicaciones), explicaciones

    crudo = json.dumps(cuerpo, ensure_ascii=False)
    assert PROVEEDOR_A not in crudo
    for ruta, texto in _textos(cuerpo):
        assert PROVEEDOR_A not in texto, f"nombre crudo en {ruta}"
        assert CORREO_PROVEEDOR_A not in texto, f"correo del nombre en {ruta}"


def test_d05_ningun_dato_de_usuario_del_supermercado(client, monkeypatch):
    """¿Se cuela un correo, un nombre o un id de la gente del supermercado?

    A tiene tres cuentas (dueña, admin con membresía y trabajador con
    membresía). El detalle es del NEGOCIO: ninguna de las tres puede asomar,
    ni por su correo, ni por el nombre local del correo, ni por su ``uid``.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_equipo=True)
    cuerpo = _detalle(client, cab_op)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    for valor in (CORREO_DUENA_A, CORREO_ADMIN_A, CORREO_WORKER_A, CORREO_OPERADOR,
                  UID_A, UID_ADMIN_A, UID_WORKER_A, UID_OP,
                  "duena.alfa", "gerente.alfa", "peon.alfa"):
        assert valor not in crudo, f"{valor!r} salió en el detalle"

    # Y tampoco por id: no hay una sola clave de usuario en el shape.
    for _ruta, claves in _claves(cuerpo):
        assert not {"usuario_id", "usuarios_con_cuenta", "firebase_uid"} & claves


def test_d06_claves_prohibidas_en_cualquier_nivel(client, monkeypatch):
    """¿El shape trae, en algún nivel, una clave que nombre lo prohibido?

    Se recorre recursivamente —incluidos los ``datos`` de cada recomendación,
    que son el saco donde es fácil que caiga cualquier cosa— y además se
    afirma el shape EXACTO nivel por nivel: ni una clave de más, ni una de
    menos.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    for ruta, claves in _claves(cuerpo):
        for clave in claves:
            bajo = clave.lower()
            assert bajo not in CLAVES_PROHIBIDAS, f"clave prohibida {clave!r} en {ruta}"
            if bajo != CLAVE_TARIFA_PERMITIDA:
                for familia in FAMILIAS_PROHIBIDAS:
                    assert familia not in bajo, f"clave {clave!r} en {ruta} nombra {familia}"

    # El shape VINCULANTE, clave por clave.
    assert set(cuerpo) == CLAVES_NIVEL1
    assert set(cuerpo["cliente"]) == CLAVES_CLIENTE
    for s in cuerpo["sedes"]:
        assert set(s) == CLAVES_SEDE
    for e in cuerpo["espacios"]:
        assert set(e) == CLAVES_ESPACIO
        if e["contrato"] is not None:
            assert set(e["contrato"]) == CLAVES_CONTRATO
    for f in cuerpo["resumen_por_tipo"]:
        assert set(f) == CLAVES_RESUMEN
    for p in cuerpo["proveedores"]:
        assert set(p) == CLAVES_PROVEEDOR
    for m in cuerpo["movimientos"]:
        assert set(m) == CLAVES_MOVIMIENTO
        for x in m["entradas"]:
            assert set(x) == CLAVES_ENTRADA
        for x in m["salidas"]:
            assert set(x) == CLAVES_SALIDA
    for o in cuerpo["oportunidades"]:
        assert set(o) == CLAVES_OPORTUNIDAD
        for c in o["candidatos"]:
            assert set(c) == CLAVES_CANDIDATO
    for r in cuerpo["recomendaciones"]:
        assert set(r) == CLAVES_RECOMENDACION


def test_d07_la_tarifa_de_referencia_no_sale_ni_como_numero_ni_derivada(client, monkeypatch):
    """¿Se puede despejar la tarifa de referencia desde el detalle?

    La tarifa se carga por el camino real del router de layout. Después: no
    puede aparecer como número, ni como texto, ni multiplicada o dividida por
    1..4 (el desliz típico: publicar "la tarifa de los N espacios"), ni como
    suma de tarifas. Lo único que la spec deja salir es el booleano
    ``tarifa_configurada``.
    """
    _ids, cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_tarifa=True)

    # La tarifa está de verdad cargada: si no, este test pasaría en vacío.
    r = client.get("/api/layout/rates", headers=cab_a)
    assert r.status_code == 200, r.text
    assert r.json()["default"]["nevera"] == TARIFA_A

    cuerpo = _detalle(client, cab_op)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    prohibidos = {TARIFA_A}
    for n in (1, 2, 3, 4):
        prohibidos.add(TARIFA_A * n)
        prohibidos.add(TARIFA_A / n)
    for numero in prohibidos:
        for ruta, valor in _numeros(cuerpo):
            assert abs(float(valor) - numero) > 0.005, \
                f"{ruta} vale {valor}, que se despeja de la tarifa ({numero})"

    for texto in (str(int(TARIFA_A)), f"{TARIFA_A:.0f}", "2.555.551"):
        assert texto not in crudo, f"la tarifa viaja como texto: {texto}"

    por_tipo = {f["tipo"]: f for f in cuerpo["resumen_por_tipo"]}
    for tipo, fila in por_tipo.items():
        assert isinstance(fila["tarifa_configurada"], bool), tipo
    assert por_tipo["nevera"]["tarifa_configurada"] is True
    assert por_tipo["punta"]["tarifa_configurada"] is False


def test_d08_los_campos_comerciales_del_plano_no_viajan(client, monkeypatch):
    """¿De dónde saca el endpoint los contratos: de ``space_leases`` o del JSON
    del plano?

    El modelo es dual (regla dura del repo): el fixture guarda
    ``supplierName``, ``negotiatedValue``, ``observation``, ``nomenclatura`` y
    ``label`` denormalizados, y esa copia NO está saneada ni es la fuente de
    verdad. Ninguno de los cinco puede aparecer.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    for valor in (PLANO_PROVEEDOR, PLANO_OBSERVACION, PLANO_NOMENCLATURA, PLANO_ETIQUETA):
        assert valor not in crudo, f"{valor!r} salió del JSON del plano"
    for _ruta, numero in _numeros(cuerpo):
        assert abs(float(numero) - PLANO_VALOR) > 0.005, \
            "el negotiatedValue del plano salió al detalle"


# ════════════════════════════════════════════════════════════════════════════
# B. CROSS-TENANT
# ════════════════════════════════════════════════════════════════════════════

def test_d10_el_detalle_de_a_no_trae_nada_de_b(client, monkeypatch):
    """¿El detalle de A deja ver algo del negocio de B?

    Slug, nombre, proveedor, marca, canon (número exacto y como subcadena) y
    los correos de B. El canon de B se busca de las dos maneras porque una fuga
    puede llegar como número (una suma mal filtrada) o como texto (una
    explicación mal armada).
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op, SLUG_A)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    for valor in (SLUG_B, NOMBRE_B, PROVEEDOR_B, MARCA_B, CORREO_DUENO_B,
                  CORREO_PROVEEDOR_B, "BETA-E-01", "8.111.123", "8111123"):
        assert valor not in crudo, f"{valor!r} de B apareció en el detalle de A"

    for ruta, numero in _numeros(cuerpo):
        assert abs(float(numero) - CANON_B) > 0.005, \
            f"{ruta} vale el canon exacto de B"


def test_d11_el_benchmark_es_un_numero_por_tipo_y_nada_mas(client, monkeypatch):
    """¿El benchmark de plataforma se puede desagregar hasta un cliente?

    Con A (un solo contrato de punta, canon a) y B (un solo contrato de punta,
    canon b), el valor tiene que ser EXACTAMENTE ``_plata((a+b)/2)``: un
    número, sin conteos, sin nombres, sin slugs, y con las claves acotadas a
    tipos de espacio que existen en A ∪ B.
    """
    from app.plataforma_metricas import _plata

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op, SLUG_A)
    bench = cuerpo["benchmark_plataforma"]

    assert isinstance(bench, dict)
    for tipo, valor in bench.items():
        assert isinstance(tipo, str), tipo
        assert isinstance(valor, float) and not isinstance(valor, bool), (tipo, valor)

    tipos_a_y_b = {"punta", "gondola", "nevera", "batea"}
    assert set(bench) <= tipos_a_y_b, set(bench)
    assert bench["punta"] == _plata(BENCHMARK_PUNTA), bench
    # El promedio de A solo, y el de B solo, NO son el benchmark: si alguno de
    # los dos apareciera, el promedio estaría calculado sobre un cliente.
    assert bench["punta"] != CANON_A_PUNTA and bench["punta"] != CANON_B
    # Y los tipos que sólo tiene A salen con el promedio de A, sin desglose.
    assert bench["gondola"] == _plata(CANON_A_GONDOLA)
    assert bench["nevera"] == _plata(CANON_A_NEVERA)
    assert "batea" not in bench  # nadie tiene un contrato de batea


def test_d12_ninguna_cabecera_ni_query_cambia_de_base(client, monkeypatch):
    """¿El slug de la ruta se puede sobreescribir desde afuera?

    El detalle de B pedido con ``X-Cliente: alfa`` o ``?cliente=alfa`` tiene que
    seguir siendo el de B: el slug de la RUTA manda, y ``cliente_del_pedido``
    nunca deduce el inquilino de un parámetro que elige el navegador.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    limpio = _detalle(client, cab_op, SLUG_B)

    con_cabecera = client.get(
        f"/api/plataforma/clientes/{SLUG_B}/detalle",
        headers={**cab_op, "X-Cliente": SLUG_A, "X-Tenant": SLUG_A},
    )
    assert con_cabecera.status_code == 200, con_cabecera.text
    assert con_cabecera.json()["cliente"]["slug"] == SLUG_B

    con_query = client.get(
        f"/api/plataforma/clientes/{SLUG_B}/detalle?cliente={SLUG_A}&slug={SLUG_A}",
        headers=cab_op,
    )
    assert con_query.status_code == 200, con_query.text
    assert con_query.json()["cliente"]["slug"] == SLUG_B

    for cuerpo in (con_cabecera.json(), con_query.json()):
        assert cuerpo["cliente"]["nombre"] == NOMBRE_B
        assert [e["codigo"] for e in cuerpo["espacios"]] == ["BETA-E-01"]
        assert NOMBRE_A not in json.dumps(cuerpo, ensure_ascii=False)
    assert limpio["cliente"]["slug"] == SLUG_B


def test_d13_el_dueno_de_a_recibe_el_mismo_403_contra_a_y_contra_b(client, monkeypatch):
    """¿El 403 delata si el cliente existe o si es el suyo?

    El dueño de A no es operador. Contra su propio detalle y contra el de B
    tiene que recibir respuestas INDISTINGUIBLES: mismo código y mismo texto.
    Si el de su cliente dijera otra cosa, el error sería un oráculo de a qué
    clientes alcanza su cuenta.
    """
    _ids, cab_a, _cab_b, _cab_op = _campo(client, monkeypatch)

    propio = _pedir(client, cab_a, SLUG_A)
    ajeno = _pedir(client, cab_a, SLUG_B)
    inexistente = _pedir(client, cab_a, "no-existe-este-cliente")

    assert propio.status_code == 403, propio.text
    assert ajeno.status_code == 403, ajeno.text
    assert inexistente.status_code == 403, inexistente.text
    assert propio.json() == ajeno.json() == inexistente.json()


def test_d14_ninguna_ruta_fuera_de_plataforma_devuelve_el_detalle(client, monkeypatch):
    """¿Hay otra puerta por la que el detalle salga?

    Se barre el OpenAPI entero con el token del DUEÑO de A y se exige que
    ninguna ruta GET fuera de ``/api/plataforma`` devuelva un cuerpo con las
    claves del detalle. Una lista escrita a mano envejece; el barrido no.
    """
    from app.main import app

    _ids, cab_a, _cab_b, _cab_op = _campo(client, monkeypatch)

    relleno = {
        "sede": "ALFA", "space_code": "ALFA-PUN-01", "code": "ALFA-PUN-01",
        "space_id": "1", "lease_id": "1", "file_id": "1", "supplier_id": "1",
        "id": "1", "svg_id": "fx-1", "key": "reminder_days", "arte_id": "1",
        "slug": SLUG_A, "solicitud_id": "1",
    }
    esquema = app.openapi()
    revisadas = 0
    for path, ops in sorted(esquema.get("paths", {}).items()):
        metodos = {m.upper() for m in ops}
        if not path.startswith("/api/") or "GET" not in metodos:
            continue
        if path.startswith("/api/plataforma"):
            continue
        url = path
        for nombre, valor in relleno.items():
            url = url.replace("{" + nombre + "}", valor)
        if "{" in url:
            continue
        r = client.get(url, headers=cab_a)
        revisadas += 1
        if r.status_code != 200:
            continue
        try:
            cuerpo = r.json()
        except ValueError:
            continue
        if not isinstance(cuerpo, dict):
            continue
        assert not {"recomendaciones", "oportunidades"} <= set(cuerpo), \
            f"{url} devolvió el shape del detalle"
    assert revisadas >= 20, f"sólo se barrieron {revisadas} rutas"


# ════════════════════════════════════════════════════════════════════════════
# C. AUTENTICACIÓN Y ERRORES
# ════════════════════════════════════════════════════════════════════════════

def test_d20_sin_token_401(client, monkeypatch):
    """¿La puerta pide credencial antes de mirar el slug?

    Sin cabecera, con basura y con un slug inexistente: 401 siempre. Un 404
    ante un anónimo ya diría qué slugs existen.
    """
    _ids, _cab_a, _cab_b, _cab_op = _campo(client, monkeypatch)

    for cab in ({}, {"Authorization": "Bearer basura"}, {"Authorization": "Bearer "}):
        for slug in (SLUG_A, "no-existe-este-cliente"):
            r = client.get(f"/api/plataforma/clientes/{slug}/detalle", headers=cab)
            assert r.status_code == 401, f"{slug} con {cab}: {r.status_code} {r.text}"


def test_d21_las_cinco_credenciales_que_no_son_operador_reciben_403(client, monkeypatch):
    """¿Alguien que no es operador entra por alguna variante?

    Admin legado, worker legado, dueño del cliente, admin CON membresía (rol
    alto adentro del supermercado, cero derechos en la plataforma) y el propio
    operador con ``OPERADOR_EMAILS`` vaciado: los cinco, 403.
    """
    from tests.conftest import CLAVE_ADMIN, CLAVE_WORKER

    ids, cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_equipo=True)

    cab_admin_membresia = _invitar_y_entrar(
        ids, cab_a, uid="uid-alfa-admin-2", email="segundo.gerente@alfa.example", rol="admin")

    for clave in (CLAVE_ADMIN, CLAVE_WORKER):
        # Con varios clientes en la instalación, el login legado exige el slug
        # (`_cliente_para_entrar`): se entra POR A, que es el cliente cuyo
        # detalle se va a pedir — el caso más favorable para el atacante.
        r = client.post("/api/auth/login", json={"password": clave, "cliente": SLUG_A})
        assert r.status_code == 200, r.text
        legado = _cab(r.json()["token"])
        assert _pedir(client, legado).status_code == 403, "el legado entró al detalle"

    assert _pedir(client, cab_a).status_code == 403
    assert _pedir(client, cab_admin_membresia).status_code == 403

    # El operador de verdad, con la env vaciada: la lista se lee en cada
    # llamada, así que dejar de ser operador corta el acceso al instante.
    #
    # Y corta con 401, no con 403: el token de la consola lleva
    # `cliente == "plataforma"`, y lo ÚNICO que lo mantiene vivo es que su
    # correo siga en `OPERADOR_EMAILS` (`auth.py`, Fase 4). Sacarlo de la
    # variable no lo deja adentro sin permisos: lo mata. Es más estricto que el
    # 403 que reciben las credenciales que nunca fueron operador, así que se
    # afirma lo que el sistema hace de verdad — bajarlo a "403 o 401" sería
    # ablandar la aserción.
    assert _pedir(client, cab_op).status_code == 200
    monkeypatch.setenv("OPERADOR_EMAILS", "")
    assert _pedir(client, cab_op).status_code == 401


def test_d22_slug_inexistente_404_con_texto_fijo_y_slug_normalizado(client, monkeypatch):
    """¿El 404 dice de más, y el slug se normaliza como en el resto de la
    plataforma?

    Texto FIJO (el mismo de ``/tendencia`` y ``/reporte``), que no repite lo
    que el operador tecleó —repetirlo es un reflejo XSS y además confirma la
    forma del slug buscado—; y `" ALFA "` con espacios y mayúsculas resuelve al
    cliente ``alfa``.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)

    r = _pedir(client, cab_op, "no-existe-este-cliente")
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == ERROR_404
    assert "no-existe-este-cliente" not in r.text

    for crudo in (" ALFA ", "Alfa", "ALFA", "  alfa"):
        url = f"/api/plataforma/clientes/{quote(crudo, safe='')}/detalle"
        r = client.get(url, headers=cab_op)
        assert r.status_code == 200, f"{crudo!r}: {r.status_code} {r.text}"
        assert r.json()["cliente"]["slug"] == SLUG_A


def test_d23_la_ventana_de_periodo_es_la_misma_que_la_de_metricas(client, monkeypatch):
    """¿El período del detalle abre una ventana más ancha que la de
    ``/metricas``?

    La ventana (24 meses atrás, 12 adelante) es una decisión de frontera
    (hallazgo frontera-3): un período arbitrario deja recorrer la historia
    entera del cliente. Se comparan los DOS endpoints con los MISMOS valores;
    lo que uno acepte, el otro también, y viceversa.
    """
    from app.plataforma_metricas import _corrido, periodo_actual

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    actual = periodo_actual()

    valores = [
        "", "   ", "2026-13", "0000-00", "abc", "2026", "2026-1", "26-09",
        _corrido(actual, -25), _corrido(actual, -24), _corrido(actual, 12),
        _corrido(actual, 13), "1900-01", "2999-12", "2026-09-01",
    ]
    for valor in valores:
        det = _pedir(client, cab_op, SLUG_A, valor)
        met = client.get("/api/plataforma/metricas", headers=cab_op, params={"periodo": valor})
        assert det.status_code == met.status_code, (
            f"periodo {valor!r}: detalle {det.status_code} vs metricas {met.status_code}")
        if det.status_code == 422:
            assert det.json()["detail"] == met.json()["detail"], valor
        else:
            assert det.json()["periodo"] == met.json()["periodo"]["anio_mes"], valor

    # Y sin parámetro, el mes en curso.
    assert _detalle(client, cab_op)["periodo"] == actual


def test_d24_base_ilegible_503_con_texto_fijo_y_sin_linea_de_bitacora(client, monkeypatch):
    """¿Una base rota delata la ruta del archivo, y deja constancia de un acceso
    que no ocurrió?

    503 con el texto fijo de ``ERROR_BASE_ILEGIBLE`` (sin la URL de la base ni
    el mensaje del driver) y —porque la bitácora se escribe DESPUÉS de armar—
    sin línea: la constancia es de un acceso a datos, y acá no hubo datos.
    """
    from app.plataforma_metricas import ERROR_BASE_ILEGIBLE

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_roto=True)
    antes = len(_lineas_bitacora("detalle"))

    r = _pedir(client, cab_op, "roto")
    assert r.status_code == 503, r.text
    assert r.json()["detail"] == ERROR_BASE_ILEGIBLE
    assert "sqlite" not in r.text.lower() and ".db" not in r.text

    assert len(_lineas_bitacora("detalle")) == antes, \
        "quedó constancia de un acceso que nunca leyó un dato"


def test_d25_un_cliente_suspendido_se_ve_completo(client, monkeypatch):
    """¿El interruptor de cobranza le tapa el negocio al operador?

    No: el estado de cuenta corta a la GENTE del supermercado, no al dueño de la
    plataforma —que necesita justamente ver ese negocio para cobrarlo—. 200, con
    el estado declarado en el cuerpo.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)

    for estado in ("gracia", "solo_lectura", "suspendido"):
        _estado(SLUG_A, estado)
        cuerpo = _detalle(client, cab_op, SLUG_A)
        assert cuerpo["cliente"]["estado_cuenta"] == estado
        assert len(cuerpo["espacios"]) == len(ESPACIOS_A)
        # Y el motivo del corte —que sólo el owner puede ver— no viaja.
        assert "Sin pagar" not in json.dumps(cuerpo, ensure_ascii=False)


def test_d26_el_token_de_montaje_no_abre_el_detalle(client, monkeypatch):
    """¿El enlace de la mercaderista alcanza al endpoint nuevo?

    ``require_auth`` no reconoce el token de montaje, así que la respuesta es
    401 y no 403: para el sistema es un anónimo con algo escrito en el header.
    ``test_montaje_enlace.py`` barre la API entera; acá se fija el caso puntual
    del endpoint de esta fase, con su slug rellenado.
    """
    from app.auth import create_mount_token

    _ids, _cab_a, _cab_b, _cab_op = _campo(client, monkeypatch)
    cab = _cab(create_mount_token("ALFA-PUN-01", days=30))

    for slug in (SLUG_A, SLUG_B, "no-existe-este-cliente"):
        r = client.get(f"/api/plataforma/clientes/{slug}/detalle", headers=cab)
        assert r.status_code == 401, f"{slug}: {r.status_code} {r.text}"


# ════════════════════════════════════════════════════════════════════════════
# D. BITÁCORA Y REPORTE DE TRANSPARENCIA
# ════════════════════════════════════════════════════════════════════════════

def test_d30_cada_consulta_deja_una_linea(client, monkeypatch):
    """¿Dos consultas dejan dos líneas, o el caché ahorra una?

    El detalle no se cachea a propósito: lo que la bitácora tiene que
    reconstruir es quién vio qué y cuándo, y eso pasó las dos veces.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    periodo = _periodo()

    assert _lineas_bitacora("detalle") == []
    _detalle(client, cab_op, SLUG_A)
    _detalle(client, cab_op, SLUG_A)
    _detalle(client, cab_op, SLUG_B)

    lineas = _lineas_bitacora("detalle")
    assert len(lineas) == 3, lineas
    assert [l["periodo"] for l in lineas] == [
        f"{SLUG_A}:{periodo}", f"{SLUG_A}:{periodo}", f"{SLUG_B}:{periodo}"]
    assert {l["email"] for l in lineas} == {CORREO_OPERADOR}
    assert {l["accion"] for l in lineas} == {"detalle"}


def test_d31_la_linea_no_lleva_ningun_dato_de_negocio(client, monkeypatch):
    """¿La bitácora se convierte en una copia de lo que se miró?

    La constancia dice QUIÉN, QUÉ endpoint y SOBRE QUÉ período. Ni un canon, ni
    un proveedor, ni un código de espacio: la tabla del registro no puede
    volverse un espejo del negocio de los clientes.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    _detalle(client, cab_op, SLUG_A)

    linea = _lineas_bitacora("detalle")[0]
    texto = f"{linea['email']}|{linea['accion']}|{linea['periodo']}"
    prohibidos = (
        PROVEEDOR_A, PROVEEDOR_A2, MARCA_A, CONTACTO_PROVEEDOR, NOTA_CONTRATO,
        "4111123", "4.111.123", "5222237", "ALFA-PUN-01", "Lacteos",
    )
    for valor in prohibidos:
        assert valor not in texto, f"la bitácora guardó {valor!r}"
    assert linea["periodo"] == f"{SLUG_A}:{_periodo()}"
    assert set(linea) == {"email", "accion", "periodo", "en"}


def test_d32_el_dueno_ve_el_acceso_en_su_reporte_y_el_otro_no(client, monkeypatch):
    """¿El titular se entera de la consulta más profunda que existe sobre su
    negocio — y sólo él?

    Depende de que ``_accesos_del_cliente`` tenga la rama ``detalle`` (trabajo
    del agente legal-catalogo). Si falta, el acceso queda sin declarar en el
    reporte del titular, que es exactamente lo que el reporte existe para
    impedir.
    """
    _ids, cab_a, cab_b, cab_op = _campo(client, monkeypatch)
    periodo = _periodo()
    _detalle(client, cab_op, SLUG_A)

    r = client.get("/api/clientes/mi-reporte-plataforma", headers=cab_a)
    assert r.status_code == 200, r.text
    lineas_a = r.json()["accesos"]["lineas"]
    detalles_a = [l for l in lineas_a if l["accion"] == "detalle"]
    assert len(detalles_a) == 1, lineas_a
    assert detalles_a[0]["periodo"] == f"{SLUG_A}:{periodo}"
    assert detalles_a[0]["operador"] == CORREO_OPERADOR

    r = client.get("/api/clientes/mi-reporte-plataforma", headers=cab_b)
    assert r.status_code == 200, r.text
    lineas_b = r.json()["accesos"]["lineas"]
    assert [l for l in lineas_b if l["accion"] == "detalle"] == [], lineas_b
    assert SLUG_A not in json.dumps(lineas_b, ensure_ascii=False)


def test_d33_el_catalogo_declara_el_detalle(client, monkeypatch):
    """¿Lo que el detalle publica está DECLARADO en el catálogo del reporte?

    La contrapartida entera de la Fase 8 es que el trato se declare: entradas
    con ``endpoints == ["detalle"]``, y el nombre del proveedor con
    ``tratamiento == "saneado"`` (es dato de un tercero que puede ser persona
    natural).
    """
    _ids, cab_a, _cab_b, _cab_op = _campo(client, monkeypatch)
    from app.plataforma_reporte import CATALOGO

    del_detalle = [e for e in CATALOGO if e["endpoints"] == ["detalle"]]
    assert del_detalle, "el catálogo no declara una sola entrada del detalle"
    assert any(e["tratamiento"] == "saneado" for e in del_detalle), \
        "ninguna entrada del detalle declara el saneo del nombre del proveedor"

    # Y el catálogo que viaja al titular es el mismo objeto, no una copia
    # recortada: lo que el operador ve tiene que estar declarado donde el
    # cliente lo lee.
    r = client.get("/api/clientes/mi-reporte-plataforma", headers=cab_a)
    assert r.status_code == 200, r.text
    publicado = [e for e in r.json()["catalogo"] if e["endpoints"] == ["detalle"]]
    assert len(publicado) == len(del_detalle)
    assert any(e["tratamiento"] == "saneado" for e in publicado)


# ════════════════════════════════════════════════════════════════════════════
# E. SÓLO LECTURA Y ORDEN DE RUTAS
# ════════════════════════════════════════════════════════════════════════════

def test_d40_tres_consultas_no_cambian_un_byte_de_la_base(client, monkeypatch):
    """¿"Solo lectura" es una promesa del docstring o una propiedad medible?

    Conteo de filas de las cuatro tablas que el detalle toca y **hash sha256
    del archivo sqlite** antes y después de tres consultas seguidas. El hash es
    la parte que no se puede engañar: una escritura silenciosa (marcar un
    contrato vencido, tocar un ``updated_at``) mueve el archivo aunque los
    conteos queden iguales.
    """
    import hashlib

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)

    from app.clientes import buscar, sesion_de, url_para
    from app.models.models import Space, SpaceFile, SpaceLease, Supplier

    cliente = buscar(SLUG_A)
    ruta = url_para(cliente.db_name).split("sqlite:///", 1)[1]

    def _conteos():
        db = sesion_de(cliente)
        try:
            return {
                "suppliers": db.query(Supplier).count(),
                "spaces": db.query(Space).count(),
                "space_leases": db.query(SpaceLease).count(),
                "space_files": db.query(SpaceFile).count(),
            }
        finally:
            db.close()

    def _hash():
        return hashlib.sha256(Path(ruta).read_bytes()).hexdigest()

    conteos_antes, hash_antes = _conteos(), _hash()
    for _ in range(3):
        _detalle(client, cab_op, SLUG_A)
    conteos_despues, hash_despues = _conteos(), _hash()

    assert conteos_antes == conteos_despues, (conteos_antes, conteos_despues)
    assert hash_antes == hash_despues, "el archivo de la base cambió tras leer el detalle"


def test_d41_el_modulo_del_detalle_no_tiene_una_sola_escritura(client):
    """¿La garantía de "solo lectura" está en el código o sólo en el docstring?

    ``grep`` estático sobre ``app/plataforma_detalle.py``: ni ``commit``, ni
    ``delete``, ni ``flush``, ni ``execute``, ni ``bulk_``, y ningún ``.add(``
    sobre una SESIÓN (los ``.add(`` que hay son de ``set`` de Python —
    ``plataforma_metricas.py``, el módulo de referencia de esta disciplina,
    tiene exactamente los mismos—). La comprobación mira el receptor a
    propósito: prohibir el texto ``.add(`` a secas daría verde o rojo por el
    motivo equivocado.
    """
    ruta = REPO / "backend" / "app" / "plataforma_detalle.py"
    assert ruta.exists(), f"{ruta} no existe todavía"
    fuente = ruta.read_text(encoding="utf-8")
    codigo = [l for l in fuente.splitlines()
              if not l.lstrip().startswith("#")]

    escritura = re.compile(
        r"\b(db|reg|sesion|session|s|conn|connection)\s*\.\s*"
        r"(add|add_all|delete|commit|flush|execute|merge|bulk_save_objects|"
        r"bulk_insert_mappings|bulk_update_mappings)\s*\(")
    for linea in codigo:
        assert not escritura.search(linea), f"escritura contra una sesión: {linea.strip()}"

    for patron in (".commit(", ".delete(", ".flush(", ".execute(", "bulk_",
                   "set_config(", "INSERT ", "UPDATE ", "DELETE "):
        assert patron not in fuente, f"{patron!r} aparece en plataforma_detalle.py"

    # Los `.add(` que quedan son todos sobre estructuras de Python.
    set_de_python = re.compile(r"(set\(\)\s*\)|\]|\bcaras|\btipos|\bsedes)\s*\.add\(")
    for linea in codigo:
        if ".add(" in linea:
            assert set_de_python.search(linea), \
                f"un .add( que no se ve como un set de Python: {linea.strip()}"


def test_d42_la_ruta_del_detalle_va_despues_de_todas_las_literales(client):
    """¿La ruta paramétrica se traga alguna literal de ``/api/plataforma``?

    Regla dura del repo: las literales van declaradas ANTES que las
    paramétricas. ``/clientes/{slug}/detalle`` tiene que estar después de
    ``/metricas``, ``/tendencia``, ``/adopcion``, ``/supresiones``, ``/soy`` y
    ``/clientes``, y después de ``/clientes/{slug}/reporte``.
    """
    from app.main import app
    from tests.conftest import rutas_planas

    rutas = [r for r in rutas_planas(app) if r.path.startswith("/api/plataforma")]
    paths = [r.path for r in rutas]
    assert "/api/plataforma/clientes/{slug}/detalle" in paths, paths

    i_detalle = paths.index("/api/plataforma/clientes/{slug}/detalle")
    literales = [i for i, p in enumerate(paths) if "{" not in p]
    assert literales, paths
    assert i_detalle > max(literales), \
        f"el detalle ({i_detalle}) se declaró antes de una literal: {paths}"
    assert i_detalle > paths.index("/api/plataforma/clientes/{slug}/reporte")


def test_d43_el_endpoint_solo_expone_get(client, monkeypatch):
    """¿La URL del detalle acepta algo más que leer?

    El OpenAPI declara sólo ``GET``, y los cuatro verbos de escritura contestan
    405 — no 401 ni 403: la ausencia del método se resuelve antes de mirar la
    credencial, así que ni siquiera hace falta ser operador para que la puerta
    esté cerrada.
    """
    from app.main import app

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    esquema = app.openapi()
    path = "/api/plataforma/clientes/{slug}/detalle"
    assert path in esquema["paths"], sorted(esquema["paths"])
    assert {m.lower() for m in esquema["paths"][path]} == {"get"}

    url = f"/api/plataforma/clientes/{SLUG_A}/detalle"
    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        r = client.request(metodo, url, headers=cab_op, json={})
        assert r.status_code == 405, f"{metodo} devolvió {r.status_code}"


# ════════════════════════════════════════════════════════════════════════════
# F. COHERENCIA INTERNA QUE PROTEGE LA FRONTERA
# ════════════════════════════════════════════════════════════════════════════

def test_d50_el_resumen_por_tipo_cuadra_con_los_espacios(client, monkeypatch):
    """¿Los agregados por tipo cuadran con las filas que el mismo JSON publica?

    Una suma que no cierra es, casi siempre, una fila que entró de donde no
    debía (un contrato de otro cliente, un código fuera del plano contado como
    espacio). ``ocupados + libres == total == nº de espacios de ese tipo``, y
    ``ocupados`` es exactamente el número de espacios con contrato.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    espacios = cuerpo["espacios"]
    assert [e["codigo"] for e in espacios] == ESPACIOS_A

    por_tipo: dict = {}
    for e in espacios:
        por_tipo.setdefault(e["tipo"], []).append(e)

    assert {f["tipo"] for f in cuerpo["resumen_por_tipo"]} == set(por_tipo)
    for fila in cuerpo["resumen_por_tipo"]:
        del_tipo = por_tipo[fila["tipo"]]
        con_contrato = [e for e in del_tipo if e["contrato"] is not None]
        assert fila["ocupados"] + fila["libres"] == fila["total"], fila
        assert fila["total"] == len(del_tipo), fila
        assert fila["ocupados"] == len(con_contrato), fila
        if con_contrato:
            canones = [e["contrato"]["canon_mensual"] for e in con_contrato]
            assert fila["canon_minimo"] == min(canones)
            assert fila["canon_maximo"] == max(canones)
            assert abs(fila["canon_promedio"] - sum(canones) / len(canones)) < 0.01
        else:
            assert fila["canon_promedio"] is None
            assert fila["canon_minimo"] is None and fila["canon_maximo"] is None

    # Y las sedes cuadran con lo mismo.
    total_ocupados = sum(s["ocupados"] for s in cuerpo["sedes"])
    assert total_ocupados == sum(1 for e in espacios if e["contrato"] is not None)
    assert sum(s["espacios"] for s in cuerpo["sedes"]) == len(espacios)


def test_d51_los_candidatos_son_proveedores_del_cliente_y_nunca_el_ocupante(client, monkeypatch):
    """¿Un candidato puede ser un proveedor que no es de este cliente?

    Ahí estaría la fuga cross-tenant más apetecible del shape: "a quién
    ofrecerle este espacio" es justo el campo donde tentaría traer proveedores
    de otros supermercados. Todo candidato tiene que estar en ``proveedores[]``
    de ESTE cliente, no puede ser el que ocupa el espacio, y son a lo sumo 3.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    del_cliente = {p["nombre"] for p in cuerpo["proveedores"]}
    assert del_cliente, "el cliente sembrado tiene proveedores"
    ocupante = {e["codigo"]: (e["contrato"] or {}).get("proveedor") for e in cuerpo["espacios"]}

    assert cuerpo["oportunidades"], "hay espacios libres sembrados"
    for o in cuerpo["oportunidades"]:
        assert len(o["candidatos"]) <= 3, o
        nombres = [c["proveedor"] for c in o["candidatos"]]
        assert len(nombres) == len(set(nombres)), o
        for nombre in nombres:
            assert nombre in del_cliente, f"{nombre!r} no es proveedor de este cliente"
            assert nombre != ocupante.get(o["codigo"]), \
                f"se propone al que ya ocupa {o['codigo']}"
        for c in o["candidatos"]:
            assert isinstance(c["mismo_tipo"], bool)
            assert isinstance(c["canon_actual"], float)

    # Lo mismo dentro de las recomendaciones, que repiten los candidatos.
    for r in cuerpo["recomendaciones"]:
        for c in r["datos"].get("candidatos", []) or []:
            assert c["proveedor"] in del_cliente


def test_d52_las_recomendaciones_son_del_vocabulario_y_sin_pii(client, monkeypatch):
    """¿La ``explicacion`` —el único texto en prosa del shape— arrastra PII?

    Es el campo más peligroso de la fase: lo arma el backend interpolando datos,
    y una interpolación de más mete un correo o un teléfono en una frase donde
    ningún test de claves lo vería. Además, el vocabulario de ``tipo`` y
    ``prioridad`` es cerrado: un tipo nuevo sin declarar es un dato nuevo sin
    declarar.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_equipo=True)
    cuerpo = _detalle(client, cab_op)

    assert cuerpo["recomendaciones"], "la siembra tiene que producir recomendaciones"
    for r in cuerpo["recomendaciones"]:
        assert r["tipo"] in TIPOS_RECOMENDACION, r["tipo"]
        assert r["prioridad"] in PRIORIDADES, r["prioridad"]
        assert isinstance(r["explicacion"], str) and r["explicacion"].strip(), r
        assert "@" not in r["explicacion"]
        assert TELEFONO_PROVEEDOR_A not in _digitos(r["explicacion"])
        for prohibido in (CONTACTO_PROVEEDOR, NOTA_PROVEEDOR, NOTA_ESPACIO,
                          NOTA_CONTRATO, CORREO_DUENA_A, CORREO_ADMIN_A,
                          CORREO_WORKER_A, PROVEEDOR_A, PROVEEDOR_B):
            assert prohibido not in r["explicacion"], (prohibido, r["explicacion"])
        for _ruta, hoja in _hojas(r["datos"]):
            if isinstance(hoja, str):
                assert "@" not in hoja
                assert TELEFONO_PROVEEDOR_A not in _digitos(hoja)

    tipos = {r["tipo"] for r in cuerpo["recomendaciones"]}
    assert {"espacio_libre", "contrato_por_vencer", "concentracion_proveedor",
            "sin_tarifa"} <= tipos, tipos

    # Orden: prioridad primero, valor después. Un orden roto no es una fuga,
    # pero es la lista que el asesor lee de arriba hacia abajo.
    orden = {"alta": 0, "media": 1, "baja": 2}
    claves = [(orden[r["prioridad"]], -r["valor_estimado_mensual"], r["id"])
              for r in cuerpo["recomendaciones"]]
    assert claves == sorted(claves), claves


def test_d52b_un_cliente_sin_contratos_recibe_solo_arranque(client, monkeypatch):
    """¿Y el cliente que todavía no vendió nada?

    Exactamente UNA recomendación (``arranque``): sin contratos no hay promedio
    propio, ni concentración, ni renovación. Y su ``datos`` lleva el benchmark
    de plataforma — que sigue siendo un número por tipo, sin nombres de nadie.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_gama=True)
    cuerpo = _detalle(client, cab_op, SLUG_C)

    assert [r["tipo"] for r in cuerpo["recomendaciones"]] == ["arranque"]
    unica = cuerpo["recomendaciones"][0]
    assert unica["prioridad"] in PRIORIDADES
    assert unica["explicacion"].strip()
    bench = unica["datos"]["benchmark_plataforma"]
    assert all(isinstance(v, float) for v in bench.values()), bench

    crudo = json.dumps(cuerpo, ensure_ascii=False)
    for ajeno in (SLUG_A, SLUG_B, NOMBRE_A, NOMBRE_B, PROVEEDOR_B, "Lacteos"):
        assert ajeno not in crudo, f"{ajeno!r} en el detalle de un cliente vacío"


def test_d53_las_fechas_no_llevan_hora(client, monkeypatch):
    """¿Alguna fecha viaja con hora?

    Una marca de tiempo al segundo dice cuándo trabaja la gente del
    supermercado — es la misma razón por la que ``ultimo_acceso`` de
    ``/metricas`` sale sin hora. La única excepción declarada es
    ``generado_en``, que es de la plataforma y no del cliente.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    assert cuerpo["generado_en"].endswith("Z")
    claves_fecha = {"desde", "hasta", "inicio", "fin", "fecha"}
    claves_mes = {"periodo", "mes"}
    vistas = 0
    for ruta, valor in _hojas(cuerpo):
        if not isinstance(valor, str) or ruta == "$.generado_en":
            continue
        clave = ruta.rsplit(".", 1)[-1]
        if clave in claves_fecha and valor:
            assert _FECHA_RE.match(valor), f"{ruta} = {valor!r} no es YYYY-MM-DD"
            vistas += 1
        elif clave in claves_mes and valor:
            assert _MES_RE.match(valor), f"{ruta} = {valor!r} no es YYYY-MM"
            vistas += 1
        assert "T" not in valor or not re.search(r"\d{2}:\d{2}", valor), \
            f"{ruta} lleva hora: {valor!r}"
    assert vistas >= 10, f"el barrido de fechas sólo miró {vistas} valores"


def test_d54_la_cara_b_es_un_espacio_con_el_tipo_de_su_gondola(client, monkeypatch):
    """¿La cara B sale como el espacio que es?

    Regla dura del repo: una góndola doble son DOS espacios, la B lleva el
    sufijo ``-B`` y **el mismo tipo** que la A; el código corto es el del
    plano, sin sede y sin sufijo. Si la B se perdiera o cambiara de tipo, la
    ocupación y el benchmark del detalle dejarían de ser el mismo negocio que
    el cliente ve en su plano.
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)
    por_codigo = {e["codigo"]: e for e in cuerpo["espacios"]}

    cara_a = por_codigo["ALFA-GON-01"]
    cara_b = por_codigo["ALFA-GON-01-B"]
    assert cara_a["cara"] == "A" and cara_b["cara"] == "B"
    assert cara_a["tipo"] == cara_b["tipo"] == "gondola"
    assert cara_a["codigo_corto"] == cara_b["codigo_corto"] == "GON-01"
    assert cara_a["sede"] == cara_b["sede"] == "ALFA"

    # La B es la que tiene contrato en la siembra; la A está libre.
    assert cara_a["contrato"] is None and cara_a["estado"] == "libre"
    assert cara_b["contrato"] is not None and cara_b["estado"] == "se_libera"
    assert cara_b["contrato"]["canon_mensual"] == CANON_A_GONDOLA
    assert cara_b["contrato"]["marca"] == MARCA_A

    # Un mueble de una sola cara no inventa una cara.
    assert por_codigo["ALFA-NEV-01"]["cara"] is None
    assert por_codigo["SUR-BAT-01"]["cara"] is None


# ════════════════════════════════════════════════════════════════════════════
# G. SEGUNDA VUELTA — los textos libres que el shape publica SIN sanear
#
# `proveedor` y `marca` pasan por `sanear_nombre_proveedor`. `zona`, `sede` y
# `codigo` NO: son texto que teclea el cliente y que el detalle publica tal
# cual. La spec los declara ("zona y área si existen"), pero declararlos no los
# limpia — y la invariante de la frontera es "ningún string del JSON trae una
# arroba ni un teléfono", no "ningún string DE LOS QUE ME ACORDÉ".
# ════════════════════════════════════════════════════════════════════════════

ZONA_CON_PII = "Zona Fria contacto ventas@sur.example tel 300 555 8899"
SEDE_CON_PII = "NAVE ventas@sur.example"

# El mismo proveedor, escrito como lo escupe un copy-paste desde un PDF o un
# WhatsApp: arroba de ancho completo y el teléfono partido por espacios de
# ancho cero. Es el ataque del hallazgo frontera-1 de la auditoría integral.
PROVEEDOR_UNICODE = "Lacteos Sur ventas＠sur.example tel 300​555​8899"


def _campo_con_zona_sucia(client, monkeypatch, zona=ZONA_CON_PII, proveedor=PROVEEDOR_A):
    """A, sembrado con la zona (o el proveedor) envenenados. Devuelve cab_op."""
    from app.clientes import buscar, sesion_de
    from app.models.models import Space
    from app.plataforma_detalle import limpiar_cache_detalle
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    alta_a = _fundar(ids, UID_A, CORREO_DUENA_A, SLUG_A, NOMBRE_A)
    desde, _hasta = _rango()
    contratos = [
        (codigo, proveedor if p == PROVEEDOR_A else p, marca, ini, fin, canon, activo)
        for codigo, p, marca, ini, fin, canon, activo in _contratos_a(desde)
    ]
    _sembrar(SLUG_A, {"ALFA": _ALFA, "SUR": _SUR}, contratos,
             correo_proveedor=CORREO_FICHA_PROVEEDOR,
             telefono_proveedor=TELEFONO_PROVEEDOR_A)

    cliente = buscar(SLUG_A)
    db = sesion_de(cliente)
    try:
        for fila in db.query(Space).all():
            fila.zone = zona
        db.commit()
    finally:
        db.close()

    cab_op = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    limpiar_cache_detalle()
    assert alta_a["token"]
    return cab_op


# detalle-1 (arreglado en el cierre de la fase): `espacios[].zona` pasa por
# `sanear_nombre_proveedor` como el proveedor y la marca. Este test lo fija.
def test_d09_la_zona_del_espacio_tambien_tiene_que_salir_saneada(client, monkeypatch):
    """¿Qué pasa con los textos libres que el shape publica y NADIE sanea?

    ``proveedor`` y ``marca`` pasan por ``sanear_nombre_proveedor``; ``zona``
    no. Es la misma clase de dato (texto que teclea el cliente, que puede
    traer el contacto de un tercero adentro) y sale por la misma puerta al
    mismo operador. Este test afirma el comportamiento SEGURO: las máscaras
    también acá.
    """
    from app.plataforma_metricas import sanear_nombre_proveedor

    cab_op = _campo_con_zona_sucia(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)

    zonas = {e["zona"] for e in cuerpo["espacios"] if e["zona"]}
    assert zonas, "la siembra puso zona en todos los espacios con fila en `spaces`"
    for zona in zonas:
        assert "@" not in zona, f"la zona viaja con un correo adentro: {zona!r}"
        assert TELEFONO_PROVEEDOR_A not in _digitos(zona), \
            f"la zona viaja con un teléfono adentro: {zona!r}"
        assert sanear_nombre_proveedor(zona) == zona, \
            f"la zona no pasó por el saneo: {zona!r}"


def test_d09b_el_saneo_del_proveedor_aguanta_el_unicode_del_copy_paste(client, monkeypatch):
    """¿El endpoint sanea de verdad, o sólo contra un nombre "de laboratorio"?

    Arroba de ancho completo (``＠``) y teléfono partido por espacios de ancho
    cero: las dos formas que sobreviven a un copy-paste real y que el hallazgo
    frontera-1 arregló en ``sanear_nombre_proveedor``. Si el detalle llama al
    saneo en todos los lugares donde publica el nombre, este ataque muere solo.
    """
    cab_op = _campo_con_zona_sucia(
        client, monkeypatch, zona="Zona Fria", proveedor=PROVEEDOR_UNICODE)
    cuerpo = _detalle(client, cab_op)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    assert "@" not in crudo and "＠" not in crudo
    assert "​" not in crudo
    for _ruta, texto in _textos(cuerpo):
        assert TELEFONO_PROVEEDOR_A not in _digitos(texto), texto
    # El proveedor limpio de la siembra sigue saliendo limpio; el envenenado
    # sale con las DOS máscaras dondequiera que viaje.
    nombres = _nombres_de_proveedor(cuerpo)
    enmascarados = [n for _r, n in nombres if MASCARA_CORREO in n]
    assert enmascarados, nombres
    for nombre in enmascarados:
        assert MASCARA_TELEFONO in nombre, nombre
    assert PROVEEDOR_A2 in [n for _r, n in nombres], nombres


def test_d15_una_base_rota_no_contamina_ni_tumba_el_detalle_de_otro(client, monkeypatch):
    """¿Qué hace el benchmark cuando una de las N bases que recorre está rota?

    Es la única parte del detalle que abre bases ajenas. Una base ilegible en
    la instalación no puede tumbar el detalle de A (denegación de servicio
    cruzada) ni asomar en su cuerpo (ni el slug del roto, ni un error con la
    ruta del archivo).
    """
    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch, con_roto=True)
    cuerpo = _detalle(client, cab_op, SLUG_A)

    assert cuerpo["benchmark_plataforma"], "el benchmark se calculó igual"
    crudo = json.dumps(cuerpo, ensure_ascii=False)
    for valor in ("roto", "sqlite", ".db", "Traceback", "OperationalError"):
        assert valor not in crudo, f"{valor!r} salió en el detalle de A"


# detalle-2 (arreglado en el cierre de la fase): el CATALOGO declara
# `contrato_marca` como "saneado", que es lo que `_contrato_publico` hace.
def test_d34_el_catalogo_declara_el_tratamiento_que_el_codigo_aplica(client, monkeypatch):
    """¿El catálogo describe lo que el código HACE, o lo que alguien creyó?

    La Fase 7 existe para que el titular pueda auditar el trato. Un catálogo que
    no coincide con el código no es una imprecisión de redacción: es la única
    fuente que el cliente tiene, diciéndole otra cosa. Se comparan las dos
    entradas de texto libre del contrato —proveedor y marca— contra lo que el
    JSON devuelve de verdad.
    """
    from app.plataforma_metricas import sanear_nombre_proveedor
    from app.plataforma_reporte import CATALOGO

    _ids, _cab_a, _cab_b, cab_op = _campo(client, monkeypatch)
    cuerpo = _detalle(client, cab_op)
    por_clave = {e["clave"]: e for e in CATALOGO if e["endpoints"] == ["detalle"]}

    marcas = [e["contrato"]["marca"] for e in cuerpo["espacios"]
              if e["contrato"] is not None and e["contrato"]["marca"]]
    assert marcas, "la siembra pone marca en dos contratos"
    saneada = all(sanear_nombre_proveedor(m) == m for m in marcas)
    assert saneada, "la marca sale sin sanear (sería otro hallazgo, peor)"

    assert por_clave["contrato_proveedor"]["tratamiento"] == "saneado"
    assert por_clave["contrato_marca"]["tratamiento"] == "saneado", (
        "el código sanea la marca; el catálogo dice "
        f"{por_clave['contrato_marca']['tratamiento']!r}")


def test_d55_un_contrato_fuera_del_plano_no_inventa_un_espacio(client, monkeypatch):
    """¿Un código de contrato que no está en el plano se cuela como espacio?

    Es el camino por el que una fila de ``space_leases`` podría entrar a
    ``espacios[]`` sin pasar por el universo de caras del layout — y con él,
    cualquier código que alguien haya escrito a mano en la base. El universo de
    ``espacios[]`` son las claves de ``mapa_tipos`` y nada más; el contrato
    huérfano se cuenta aparte, en ``contratos_fuera_del_plano``.
    """
    from app.plataforma_detalle import limpiar_cache_detalle
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    alta_a = _fundar(ids, UID_A, CORREO_DUENA_A, SLUG_A, NOMBRE_A)
    assert alta_a["token"]
    desde, _hasta = _rango()
    contratos = _contratos_a(desde) + [
        ("FANTASMA-01", PROVEEDOR_A2, None,
         desde - timedelta(days=10), desde + timedelta(days=10), CANON_A_VIEJO, True),
    ]
    _sembrar(SLUG_A, {"ALFA": _ALFA, "SUR": _SUR}, contratos,
             correo_proveedor=CORREO_FICHA_PROVEEDOR,
             telefono_proveedor=TELEFONO_PROVEEDOR_A)
    cab_op = _operador_sin_membresias(ids, monkeypatch)
    limpiar_cache_metricas()
    limpiar_cache_detalle()

    cuerpo = _detalle(client, cab_op)
    assert [e["codigo"] for e in cuerpo["espacios"]] == ESPACIOS_A
    assert cuerpo["contratos_fuera_del_plano"] == 1
    assert all(o["codigo"] != "FANTASMA-01" for o in cuerpo["oportunidades"])
    # Los tipos publicados siguen siendo los del plano más el marcador
    # explícito: nunca un `None` ni un tipo inventado.
    tipos = {e["tipo"] for e in cuerpo["espacios"]}
    assert tipos == {"punta", "gondola", "nevera", "batea"}, tipos
    for m in cuerpo["movimientos"]:
        for mov in m["entradas"] + m["salidas"]:
            assert isinstance(mov["tipo"], str) and mov["tipo"], mov
