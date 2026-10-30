"""Conciliación de las métricas del operador (Fase 4) — auditoría independiente.

**Qué prueba este archivo y por qué existe aparte de ``test_plataforma_metricas.py``.**
Aquel archivo lo escribió quien construyó el endpoint; éste lo escribió quien lo
audita, contra un escenario MULTI-CLIENTE distinto y con los números calculados
A MANO antes de correr nada. La comparación es contra esos números, no contra lo
que devuelva el código: si las dos cuentas coinciden, coinciden porque el negocio
da eso, no porque el test copie la implementación.

**La lección que ordena el archivo** (de la auditoría de vitrinas: tres cifras de
ingreso que no conciliaban entre sí): el peor fallo silencioso de un panel de
métricas es un consolidado que no es la suma de sus partes. Por eso hay una
sección entera de CONCILIACIÓN — ingreso, espacios, sedes y el top de proveedores
del consolidado se comparan contra la suma de las filas legibles del MISMO JSON —
y dos trampas sembradas a propósito:

* el **canon promedio** consolidado ponderado (Σ canones / Σ contratos) da
  $450.000,05 y el promedio de promedios da $411.607,23. Si alguien cambiara la
  cuenta por la equivocada, el test lo dice con los dos números en la mano.
* la **ocupación** consolidada (Σ ocupadas / Σ comercializables) da 82,4 % y el
  promedio de porcentajes da 81,7 %. Mismo truco, misma razón.

**El escenario, en una línea por cliente** (período 2026-09, del 1 al 30):

===========  ==========================================================
``centro``   2 caras, 2 contratos — uno arranca EXACTAMENTE en ``hasta``
``galerias`` el cliente por defecto: sin plano, sin contratos, sin gente
``norte``    2 sedes con plano (+1 sede vacía), góndola doble, columna no
             comercializable, contrato de UN día, contrato que arranca a
             mitad del mes, contrato que TERMINA exactamente en ``desde``,
             contrato sobre un espacio que no está en el plano, y tres que
             no cuentan (vencido, futuro, cancelado)
``roto``     base ilegible: fila con error, fuera de todo agregado
``sur``      7 caras, 7 contratos, 6 proveedores distintos → el top corta
             en 5 y desempata alfabético
``susp``     SUSPENDIDO y adentro del consolidado igual; canon con centavos
===========  ==========================================================

**Fase 7 — agregados EXACTOS, sin umbral, y qué le hace a este archivo.** Hasta
la Fase 6 el backend suprimía ``ingreso_contratado_mes``, ``canon_promedio_mensual``
y ``top_proveedores`` de toda fila con MENOS de 3 contratos activos en el
período. El dueño de la plataforma decidió cambiar el trato (docs/ESTADO.md,
Fase 7): sin umbral, TODAS las filas publican su número exacto — en este
escenario ``centro`` (2 contratos), ``susp`` (2) y ``galerias`` (0) ya no se
suprimen, igual que ``norte`` (4) y ``sur`` (7).

La consecuencia que ordena la sección 6 de este archivo: sin filas suprimidas,
el consolidado vuelve a ser, exactamente, la suma de las filas VISIBLES —lo
que antes de la Fase 7 hacía falta sumarle a mano (``OCULTO_*``) ahora ya está
publicado en cada fila, y la conciliación cierra SIN residuo. Lo que sigue
sin poder promediarse por promedio de promedios (canon consolidado, ocupación
consolidada) no cambió: sigue siendo ponderado, Σ/Σ.

Los HALLAZGOS van al final, marcados ``xfail(strict=True)``: son tests que hoy
fallan a propósito y que se ponen verdes solos el día que el defecto se corrija.
Este archivo NO toca código de producción.

Todo ``import app.*`` va ADENTRO de las funciones — el fixture ``client`` de
``conftest.py`` arma el motor recién cuando corre, y un import de módulo lo
clavaría contra la base equivocada.
"""
from tests.sembrado import total_del_plazo, marcar_cancelados
import json
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from conftest import SEPTIEMBRE_DE_2026

PERIODO = "2026-09"          # 2026-09-01 .. 2026-09-30, ambos inclusive
# Los datos son de ese mes y se piden por la API, que sólo acepta los últimos
# 24: estas pruebas corren con el reloj ahí (`conftest.SEPTIEMBRE_DE_2026`).
pytestmark = SEPTIEMBRE_DE_2026
MES_ANTERIOR = "2026-08"
MES_SIN_NADA = "2026-11"


# ════════════════════════════════════════════════════════════════════════════
# EL ESCENARIO, SEMBRADO A MANO
# ════════════════════════════════════════════════════════════════════════════
#
# Los planos. `sede` va escrito en cada mueble además de en la fila del
# snapshot: es lo que hace `fullSpaceCode(sede, code)` en el frontend y lo que
# espeja `_codigo_completo` server-side.

_NORTE_N1 = [
    # Una punta cualquiera.                                    -> N1-PUN-01
    {"code": "PUN-01", "type": "punta", "sede": "N1"},
    # Góndola DOBLE con `faceB` presente: son DOS espacios.
    #                                        -> N1-GON-01 y N1-GON-01-B
    {
        "code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "N1",
        "faceB": {"supplierName": "", "negotiatedValue": 0, "status": "free"},
    },
    # Columna marcada como infraestructura: NO es inventario.  -> (ninguna)
    {"code": "COL-01", "type": "columna", "sede": "N1", "rentable": False},
    # Sin la bandera `rentable`: ausente significa comercializable (regla
    # retrocompatible de `isRentable`).                        -> N1-BAT-01
    {"code": "BAT-01", "type": "batea", "sede": "N1"},
    # Y un mueble que no se vende NUNCA, aunque tampoco traiga bandera: el TIPO
    # manda antes que la bandera.                              -> (ninguna)
    {"code": "CAJ-01", "type": "checkout", "sede": "N1"},
]
_NORTE_N2 = [{"code": "PUN-01", "type": "punta", "sede": "N2"}]
# Una sede cuyo plano se guardó vacío NO es una "sede con plano".
_NORTE_N0 = []

_CENTRO_C1 = [
    {"code": "E-01", "type": "punta", "sede": "C1"},
    {"code": "E-02", "type": "punta", "sede": "C1"},
]

_SUR_R1 = [{"code": f"R-0{i}", "type": "punta", "sede": "R1"} for i in range(1, 8)]

_SUSP_S1 = [
    {"code": "P-01", "type": "punta", "sede": "S1"},
    {"code": "P-02", "type": "punta", "sede": "S1"},
    # Góndola MURAL: una sola cara, aunque sea góndola.
    {"code": "G-01", "type": "gondola", "gondolaType": "wall", "sede": "S1"},
]

# Los contratos: (codigo_espacio, proveedor, desde, hasta, canon, is_active).
#
# El período de referencia es 2026-09-01 .. 2026-09-30. "Activo" =
# start_date <= hasta AND end_date >= desde, los DOS extremos inclusive, y
# además is_active (no cancelado).

_CONTRATOS_NORTE = [
    # (a) UN SOLO DÍA, adentro del mes. Vale como cualquier otro.
    ("N1-PUN-01",   "Alpina",   "2026-09-15", "2026-09-15", 1_000_000.00, True),
    # (b) arranca a MITAD del período y sigue al mes siguiente.
    ("N1-GON-01-B", "Alpina",   "2026-09-20", "2026-10-31", 2_000_000.00, True),
    # (c) TERMINA exactamente en `desde`: el rango es inclusivo, CUENTA.
    ("N2-PUN-01",   "Bavaria",  "2026-06-01", "2026-09-01",   500_000.00, True),
    # (d) el espacio NO existe en ningún plano: suma canon, ingreso y
    #     proveedor, pero NO puede contar como cara ocupada.
    ("FANTASMA-99", "Alpina",   "2026-09-01", "2026-09-30",   700_000.00, True),
    # (e) vencido: termina el día ANTERIOR a `desde`. En septiembre no cuenta;
    #     en agosto sí (es la mitad de la prueba de período).
    ("N1-BAT-01",   "Bavaria",  "2026-08-01", "2026-08-31",   800_000.00, True),
    # (f) futuro: arranca el día SIGUIENTE a `hasta`.
    ("N1-GON-01",   "Postobon", "2026-10-01", "2026-10-31", 3_000_000.00, True),
    # (g) CANCELADO (is_active=False) aunque las fechas caigan justo adentro.
    ("N1-GON-01",   "Postobon", "2026-09-01", "2026-09-30", 9_000_000.00, False),
    # (h) SÓLO agosto, y sobre un espacio que tampoco está en el plano. Se
    #     eligió un espacio FANTASMA a propósito: si ocupara una cara real,
    #     agosto pasaría a 3/5 = 60,0 % y daría lo mismo que septiembre, que es
    #     justo lo que el test tiene que distinguir (Fase 7: ya no hace falta
    #     para cruzar ningún umbral — agosto se publica exacto con o sin él).
    ("FANTASMA-98", "Colanta",  "2026-08-01", "2026-08-31",   200_000.00, True),
]

_CONTRATOS_CENTRO = [
    ("C1-E-01", "Zenu", "2026-09-01", "2026-09-30", 100_000.00, True),
    # ARRANCA exactamente en `hasta`: inclusive, CUENTA.
    ("C1-E-02", "Zenu", "2026-09-30", "2026-11-30",  50_000.00, True),
]

# Seis proveedores distintos en siete contratos: el top corta en 5 y el empate
# de los que tienen 1 se desempata alfabéticamente (Familia queda afuera).
_CONTRATOS_SUR = [
    ("R1-R-01", "Alpina",  "2026-09-01", "2026-09-30", 400_000.00, True),
    ("R1-R-02", "Alpina",  "2026-09-01", "2026-09-30", 400_000.00, True),
    ("R1-R-03", "Bavaria", "2026-09-01", "2026-09-30", 300_000.00, True),
    ("R1-R-04", "Colanta", "2026-09-01", "2026-09-30", 200_000.00, True),
    ("R1-R-05", "Diana",   "2026-09-01", "2026-09-30", 200_000.00, True),
    ("R1-R-06", "Exito",   "2026-09-01", "2026-09-30", 200_000.00, True),
    ("R1-R-07", "Familia", "2026-09-01", "2026-09-30", 200_000.00, True),
]

# Con CENTAVOS a propósito: el consolidado suma floats de varias filas, y la
# conciliación tiene que dar exacta igual.
_CONTRATOS_SUSP = [
    ("S1-P-01", "Alpina", "2026-09-10", "2026-09-12", 300_000.33, True),
    ("S1-G-01", "Zenu",   "2026-09-01", "2026-09-30", 200_000.35, True),
]


# ─── LAS CUENTAS, HECHAS A MANO ──────────────────────────────────────────────
#
# Todo lo de acá abajo se calculó con lápiz antes de correr el endpoint. El
# test compara contra estos números; el reporte
# (`features/plataforma/outputs/conciliacion-metricas.md`) muestra la cuenta.

# Fase 7: sin umbral, todas las filas publican su número EXACTO. Se conservan
# los diccionarios `OCULTO_*` con los mismos números que antes de la Fase 7
# había que calcular "por debajo" — ahora son, literalmente, lo que la fila
# publica, y se referencian desde `CENTRO`/`SUSP`/`GALERIAS` para no repetir
# el número dos veces.

# ── norte ── 4 contratos activos en 2026-09, se publica entero (como siempre).
# caras: N1-PUN-01, N1-GON-01, N1-GON-01-B, N1-BAT-01, N2-PUN-01 = 5
#        (COL-01 es `rentable: false`; CAJ-01 es checkout, que no se vende
#         nunca; N0 no tiene muebles)
# activos en 2026-09: (a) (b) (c) (d) = 4   [(h) es de agosto]
# ocupadas: {N1-PUN-01, N1-GON-01-B, N2-PUN-01} = 3   (FANTASMA-99 no está)
NORTE = {
    "sedes_con_plano": 2,                       # N1 y N2; N0 está vacía
    "espacios_comercializables": 5,
    "ocupacion_pct": 60.0,                      # 3/5 * 100
    "canon_promedio_mensual": 1_050_000.00,     # 4.200.000 / 4
    "ingreso_contratado_mes": 4_200_000.00,     # 1.000.000+2.000.000+500.000+700.000
    "top_proveedores": [
        {"nombre": "Alpina", "contratos_activos": 3},    # (a) (b) (d)
        {"nombre": "Bavaria", "contratos_activos": 1},   # (c)
    ],
    "usuarios_con_cuenta": 2,                   # la dueña + la cuenta compartida
    "ultimo_acceso": "2026-09-17",              # la compartida, que es la más nueva
    # Fase 6: sin tarifa de referencia configurada -> spread `null`, los 4
    # contratos activos van a `contratos_sin_tarifa`.
    "spread_pct": None,
    "tarifa_configurada": False,
    "contratos_sin_tarifa": 4,
}

OCULTO_CENTRO = {
    "contratos": 2,
    "ingreso": 150_000.00,                      # 100.000 + 50.000
    "canon": 75_000.00,                         # 150.000 / 2
    "proveedores": {"Zenu": 2},
}

# ── centro ── 2 contratos activos. Hasta la Fase 6 esto suprimía los tres
# campos de plata (2 < K=3); sin umbral, se publica el número exacto: 150.000,00
# de ingreso, 75.000,00 de canon promedio y Zenu con 2 contratos.
CENTRO = {
    "sedes_con_plano": 1,
    "espacios_comercializables": 2,
    "ocupacion_pct": 100.0,                     # 2/2
    "canon_promedio_mensual": OCULTO_CENTRO["canon"],
    "ingreso_contratado_mes": OCULTO_CENTRO["ingreso"],
    "top_proveedores": [{"nombre": "Zenu", "contratos_activos": 2}],
    "usuarios_con_cuenta": 2,                   # el dueño + la cuenta compartida
    "ultimo_acceso": "2026-09-20",              # el dueño, más nuevo que la compartida
    "spread_pct": None,
    "tarifa_configurada": False,
    "contratos_sin_tarifa": 2,
}

# ── sur ── 7 contratos, se publica entero.
# 1.900.000 / 7 = 271.428,571428... -> 271.428,57
SUR = {
    "sedes_con_plano": 1,
    "espacios_comercializables": 7,
    "ocupacion_pct": 100.0,                     # 7/7
    "canon_promedio_mensual": 271_428.57,
    "ingreso_contratado_mes": 1_900_000.00,
    "top_proveedores": [                        # corte en 5; Familia queda afuera
        {"nombre": "Alpina", "contratos_activos": 2},
        {"nombre": "Bavaria", "contratos_activos": 1},
        {"nombre": "Colanta", "contratos_activos": 1},
        {"nombre": "Diana", "contratos_activos": 1},
        {"nombre": "Exito", "contratos_activos": 1},
    ],
    "usuarios_con_cuenta": 1,                   # la compartida está INACTIVA acá
    "ultimo_acceso": None,                      # el dueño nunca entró
    "spread_pct": None,
    "tarifa_configurada": False,
    "contratos_sin_tarifa": 7,
}

OCULTO_SUSP = {
    "contratos": 2,
    "ingreso": 500_000.68,                      # 300.000,33 + 200.000,35
    "canon": 250_000.34,                        # 500.000,68 / 2
    "proveedores": {"Alpina": 1, "Zenu": 1},
}

# ── susp (suspendido, y adentro del consolidado igual) ──
# 2 contratos. Sin umbral se publica el número exacto: 500.000,68 de ingreso y
# 250.000,34 de canon (500.000,68 / 2), con Alpina y Zenu a 1 contrato cada
# uno (empate: alfabético).
SUSP = {
    "sedes_con_plano": 1,
    "espacios_comercializables": 3,
    "ocupacion_pct": 66.7,                      # 2/3 = 66,666... -> 66,7
    "canon_promedio_mensual": OCULTO_SUSP["canon"],
    "ingreso_contratado_mes": OCULTO_SUSP["ingreso"],
    "top_proveedores": [
        {"nombre": "Alpina", "contratos_activos": 1},
        {"nombre": "Zenu", "contratos_activos": 1},
    ],
    "usuarios_con_cuenta": 1,
    "ultimo_acceso": "2026-07-05",
    "spread_pct": None,
    "tarifa_configurada": False,
    "contratos_sin_tarifa": 2,
}

OCULTO_GALERIAS = {"contratos": 0, "ingreso": 0.0, "canon": None, "proveedores": {}}

# ── galerias (el cliente por defecto: existe, y no tiene nada) ──
# CERO contratos. `ingreso_contratado_mes` es SIEMPRE número (Fase 7): con
# cero contratos no facturó nada, y `0.0` es ese dato, no una ausencia.
# `canon_promedio_mensual` sigue en `null` porque no hay ningún contrato del
# que promediar — eso no depende del umbral, nunca dependió.
GALERIAS = {
    "sedes_con_plano": 0,
    "espacios_comercializables": 0,
    "ocupacion_pct": None,                      # sin denominador NO es 0 %
    "canon_promedio_mensual": None,
    "ingreso_contratado_mes": 0.0,
    "top_proveedores": [],
    "usuarios_con_cuenta": 0,
    "ultimo_acceso": None,
    "spread_pct": None,
    "tarifa_configurada": False,
    "contratos_sin_tarifa": 0,
}

POR_CLIENTE = {"norte": NORTE, "centro": CENTRO, "sur": SUR, "susp": SUSP, "galerias": GALERIAS}
LEGIBLES = ("centro", "galerias", "norte", "sur", "susp")   # orden por slug
TODOS = ("centro", "galerias", "norte", "roto", "sur", "susp")

# ── consolidado ──
# Se calcula con los datos SUBYACENTES de TODOS los legibles — esto no cambió
# con la Fase 7, el consolidado siempre sumó los crudos de todos. Lo que
# cambió es que ahora coincide, al centavo, con la suma de las filas VISIBLES:
# sin supresión no hay nada que el consolidado sepa y una fila no publique.
# Σ caras      = 5 + 2 + 7 + 3 + 0 = 17
# Σ ocupadas   = 3 + 2 + 7 + 2 + 0 = 14      -> 14/17 = 82,352...  -> 82,4
# Σ canones    = 4.200.000 + 150.000 + 1.900.000 + 500.000,68 = 6.750.000,68
# Σ contratos  = 4 + 2 + 7 + 2 + 0 = 15      -> 450.000,0453...    -> 450.000,05
CONSOLIDADO = {
    "clientes_total": 6,
    "clientes_con_error": 1,
    "sedes_con_plano": 5,                       # 2 + 1 + 1 + 1 + 0
    "espacios_comercializables": 17,
    "ocupacion_pct": 82.4,
    "canon_promedio_mensual": 450_000.05,
    "ingreso_contratado_mes": 6_750_000.68,
    "top_proveedores": [
        {"nombre": "Alpina", "contratos_activos": 6},    # 3 norte + 2 sur + 1 susp
        {"nombre": "Zenu", "contratos_activos": 3},      # 2 centro + 1 susp
        {"nombre": "Bavaria", "contratos_activos": 2},   # 1 norte + 1 sur
        {"nombre": "Colanta", "contratos_activos": 1},   # empate a 1: alfabético,
        {"nombre": "Diana", "contratos_activos": 1},     # Exito y Familia quedan afuera
    ],
    "usuarios_con_cuenta": 5,   # 4 dueños + 1 compartida (DISTINTOS, no Σ de filas)
    # Fase 6 (spread): ningún cliente de este escenario tiene tarifa de
    # referencia configurada -> 0 clientes con tarifa, 0 contratos con tarifa
    # -> spread consolidado `null` (Fase 7: por ausencia de tarifa, sin umbral).
    "spread_pct": None,
    "clientes_con_tarifa": 0,
}

# Las dos cuentas EQUIVOCADAS, con nombre y número, para que el test las nombre.
# Las dos se calculan sobre los promedios REALES de las cuatro filas con
# contratos —los de `centro` y `susp` incluidos, que ahora también publican—: la
# cuenta equivocada que hay que descartar es la que haría alguien con los
# números del negocio en la mano, no la que sale de mirar sólo lo visible.
OCUPACION_PROMEDIO_DE_PORCENTAJES = 81.7      # (60,0 + 100,0 + 100,0 + 66,7) / 4
CANON_PROMEDIO_DE_PROMEDIOS = 411_607.23      # (1.050.000 + 75.000 + 271.428,57 + 250.000,34)/4
CANON_POR_FILA = (1_050_000.00, 75_000.00, 271_428.57, 250_000.34)   # norte, centro, sur, susp

# Σ de `usuarios_con_cuenta` de las filas = 2 + 2 + 1 + 1 + 0 = 6, y el
# consolidado dice 5: la cuenta compartida es UNA persona con cuenta en dos
# supermercados. Es la única cifra del panel que a propósito NO concilia.
SUMA_DE_USUARIOS_POR_FILA = 6

# ── agosto, sólo norte ──
# Activos del 1 al 31 de agosto: (c) 06-01..09-01 = 500.000, (e) 08-01..08-31 =
# 800.000 y (h) 08-01..08-31 = 200.000. Sin umbral, agosto se publica exacto.
# Ocupadas: N2-PUN-01 por (c) y N1-BAT-01 por (e). (h) es sobre FANTASMA-98, que
# no está en el plano: suma plata, no ocupación.
NORTE_AGOSTO = {
    "espacios_comercializables": 5,
    "ocupacion_pct": 40.0,                      # 2/5 (N2-PUN-01 y N1-BAT-01)
    "canon_promedio_mensual": 500_000.00,       # 1.500.000 / 3
    "ingreso_contratado_mes": 1_500_000.00,     # 500.000 + 800.000 + 200.000
    "top_proveedores": [                        # empate 2-1, sin empate real
        {"nombre": "Bavaria", "contratos_activos": 2},
        {"nombre": "Colanta", "contratos_activos": 1},
    ],
}


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE
# ════════════════════════════════════════════════════════════════════════════

class _Verificador:
    def __init__(self, mapa):
        self.mapa = mapa

    def verificar(self, id_token):
        return self.mapa.get(id_token)


class Identidades:
    """Un solo ``dependency_overrides`` para todas las cuentas falsas del test."""

    def __init__(self, client):
        self.client = client
        self.mapa = {}

    def registrar(self, uid, email):
        from app.services.firebase_tokens import get_verificador

        self.mapa[uid] = SimpleNamespace(
            uid=uid, email=email, email_verificado=True, proveedor="google.com", nombre=None,
        )
        self.client.app.dependency_overrides[get_verificador] = lambda: _Verificador(self.mapa)
        return uid


def _cab(token):
    return {"Authorization": f"Bearer {token}"}


def _fundar(ids, uid, email, slug, nombre):
    ids.registrar(uid, email)
    r = ids.client.post(
        "/api/clientes/alta",
        json={"id_token": uid, "slug": slug, "nombre": nombre, "acepta_politica": True},
    )
    assert r.status_code == 200, r.text
    return _cab(r.json()["token"])


def _sembrar(slug, sedes, contratos):
    """Layout + espacios + proveedores + contratos, en la base DEL CLIENTE.

    Es lo ÚNICO de este archivo que escribe en una base de negocio; el endpoint
    auditado no escribe nunca (y hay una prueba que lo fija).
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

        proveedores, espacios = {}, {}
        for codigo, proveedor, ini, fin, canon, activo in contratos:
            if proveedor not in proveedores:
                fila = Supplier(name=proveedor)
                db.add(fila)
                db.flush()
                proveedores[proveedor] = fila
            if codigo not in espacios:
                espacio = Space(
                    code=codigo, svg_id=f"svg-{slug}-{codigo}", name=codigo,
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
    """Fila en el registro + un archivo que NO es una base de datos."""
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
        f.write(b"no soy una base de datos\n" * 40)


def _utc(anio, mes, dia, hora=12, minuto=0):
    return datetime(anio, mes, dia, hora, minuto, tzinfo=timezone.utc)


def _fijar_ultimo_acceso(email, cuando):
    """El ``ultimo_login`` del registro, puesto a mano: el alta lo pisa con
    ``now()`` y entonces la fecha esperada dependería del día que corra el test."""
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = reg.query(Usuario).filter(Usuario.email == email).first()
        assert usuario is not None, email
        usuario.ultimo_login = cuando
        reg.commit()
    finally:
        reg.close()


def _usuario_suelto(email, uid, cuando):
    """Una persona con cuenta, SIN fundar nada. Devuelve su id."""
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        usuario = Usuario(firebase_uid=uid, email=email, nombre=None, ultimo_login=cuando)
        reg.add(usuario)
        reg.commit()
        return usuario.id
    finally:
        reg.close()


def _membresia(usuario_id, slug, rol="worker", activo=True):
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia

    reg = sesion_registro()
    try:
        reg.add(Membresia(usuario_id=usuario_id, cliente_slug=slug, rol=rol, activo=activo))
        reg.commit()
    finally:
        reg.close()


def _escenario(client, monkeypatch, email_operador="auditor@recabra.co"):
    """Siembra el escenario entero y devuelve la cabecera del operador."""
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-norte",  "duena@norte.co",  "norte",  "Norte")
    _fundar(ids, "uid-centro", "dueno@centro.co", "centro", "Centro")
    _fundar(ids, "uid-sur",    "dueno@sur.co",    "sur",    "Sur")
    _fundar(ids, "uid-susp",   "duena@susp.co",   "susp",   "Suspendida")

    _sembrar("norte",  {"N1": _NORTE_N1, "N2": _NORTE_N2, "N0": _NORTE_N0}, _CONTRATOS_NORTE)
    _sembrar("centro", {"C1": _CENTRO_C1}, _CONTRATOS_CENTRO)
    _sembrar("sur",    {"R1": _SUR_R1}, _CONTRATOS_SUR)
    _sembrar("susp",   {"S1": _SUSP_S1}, _CONTRATOS_SUSP)
    _romper()

    # La gente. Fechas fijas para que `ultimo_acceso` no dependa de hoy.
    _fijar_ultimo_acceso("duena@norte.co",  _utc(2026, 9, 1, 8, 0))
    _fijar_ultimo_acceso("dueno@centro.co", _utc(2026, 9, 20, 10, 0))
    _fijar_ultimo_acceso("duena@susp.co",   _utc(2026, 7, 5, 9, 0))
    _fijar_ultimo_acceso("dueno@sur.co",    None)          # nunca entró

    # UNA persona con cuenta en DOS supermercados (y una membresía dada de baja
    # en un tercero, que no tiene que contar en ninguna parte).
    compartida = _usuario_suelto("compartida@x.co", "uid-compartida", _utc(2026, 9, 17, 23, 30))
    _membresia(compartida, "norte")
    _membresia(compartida, "centro")
    _membresia(compartida, "sur", activo=False)

    # El operador: correo en OPERADOR_EMAILS y CERO membresías.
    monkeypatch.setenv("OPERADOR_EMAILS", email_operador)
    ids.registrar("uid-auditor", email_operador)
    r = client.post("/api/auth/oauth", json={"id_token": "uid-auditor"})
    assert r.status_code == 200, r.text

    limpiar_cache_metricas()
    return ids, _cab(r.json()["token"])


def _suspender(client, cab, slug="susp"):
    from app.plataforma_metricas import limpiar_cache_metricas

    r = client.patch(
        f"/api/plataforma/clientes/{slug}",
        json={"estado": "suspendido", "motivo": "impago de agosto"},
        headers=cab,
    )
    assert r.status_code == 200, r.text
    limpiar_cache_metricas()


def _pedir(client, cab, periodo=PERIODO):
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


def _m(cuerpo, slug):
    return _fila(cuerpo, slug)["metricas"]


@pytest.fixture()
def panel(client, monkeypatch):
    """El escenario completo, con ``susp`` ya suspendido, y el JSON de 2026-09.

    Devuelve ``(client, cab, cuerpo)`` — casi todos los tests miran el mismo
    cuerpo, y recalcularlo por test multiplicaría por N la vuelta a las bases.
    """
    _ids, cab = _escenario(client, monkeypatch)
    _suspender(client, cab)
    return client, cab, _pedir(client, cab)


# ════════════════════════════════════════════════════════════════════════════
# 1. EL CONTRATO DEL JSON — la lista de la spec es TAXATIVA
# ════════════════════════════════════════════════════════════════════════════

CLAVES_RAIZ = {"periodo", "generado_en", "de_cache", "consolidado", "clientes"}
CLAVES_CONSOLIDADO = {
    "clientes_total", "clientes_con_error", "sedes_con_plano",
    "espacios_comercializables", "ocupacion_pct", "canon_promedio_mensual",
    "ingreso_contratado_mes", "top_proveedores", "usuarios_con_cuenta",
    # Fase 6 (spread): consolidado.
    "spread_pct", "clientes_con_tarifa",
}
CLAVES_FILA = {"slug", "nombre", "estado_cuenta", "error", "metricas"}
CLAVES_METRICAS = {
    "sedes_con_plano", "espacios_comercializables", "ocupacion_pct",
    "canon_promedio_mensual", "ingreso_contratado_mes", "top_proveedores",
    "usuarios_con_cuenta", "ultimo_acceso",
    # Fase 6 (spread): por cliente. Ninguno de estos clientes tiene tarifa de
    # referencia configurada en este escenario, así que `spread_pct` es
    # siempre `null` y `contratos_sin_tarifa` son todos los activos.
    "spread_pct", "tarifa_configurada", "contratos_sin_tarifa",
}


def test_las_claves_del_json_son_exactamente_las_de_la_spec(panel):
    """Un campo de más o de menos ES un hallazgo: la lista de la spec es taxativa."""
    _client, _cab, cuerpo = panel

    assert set(cuerpo) == CLAVES_RAIZ
    assert set(cuerpo["periodo"]) == {"anio_mes", "desde", "hasta"}
    assert set(cuerpo["consolidado"]) == CLAVES_CONSOLIDADO
    # `ultimo_acceso` es de la FILA, no del consolidado: la fecha del último
    # acceso de "todos los clientes juntos" no significaría nada.
    assert "ultimo_acceso" not in cuerpo["consolidado"]

    for fila in cuerpo["clientes"]:
        assert set(fila) == CLAVES_FILA, fila["slug"]
        if fila["metricas"] is not None:
            assert set(fila["metricas"]) == CLAVES_METRICAS, fila["slug"]
        # error y metricas nunca a la vez, y nunca ninguno de los dos.
        assert (fila["error"] is None) != (fila["metricas"] is None), fila["slug"]

    for top in [cuerpo["consolidado"]["top_proveedores"]] + [
        f["metricas"]["top_proveedores"] for f in cuerpo["clientes"] if f["metricas"]
    ]:
        assert len(top) <= 5
        for p in top:
            assert set(p) == {"nombre", "contratos_activos"}


def test_el_periodo_y_el_orden_de_las_filas(panel):
    _client, _cab, cuerpo = panel

    assert cuerpo["periodo"] == {
        "anio_mes": "2026-09", "desde": "2026-09-01", "hasta": "2026-09-30",
    }
    assert cuerpo["de_cache"] is False
    assert cuerpo["generado_en"].endswith("Z")
    assert [c["slug"] for c in cuerpo["clientes"]] == list(TODOS)


def test_el_json_no_trae_filas_de_negocio_ni_gente(panel):
    """La frontera dura de la enmienda, verificada sobre el JSON REAL."""
    _client, _cab, cuerpo = panel

    def recorrer(nodo, camino="raiz"):
        if isinstance(nodo, dict):
            for k, v in nodo.items():
                yield f"{camino}.{k}", k, v
                yield from recorrer(v, f"{camino}.{k}")
        elif isinstance(nodo, list):
            for i, v in enumerate(nodo):
                yield from recorrer(v, f"{camino}[{i}]")

    prohibidas = {
        "leases", "space_leases", "spaces", "espacios", "contratos", "suppliers",
        "proveedores", "layout", "fixtures", "fixtures_json", "monthly_rent",
        "canon", "start_date", "end_date", "marca", "supplier_id", "space_id",
        "code", "svg_id", "email", "correo", "usuarios", "firebase_uid",
        "ultimo_login", "notas", "notes", "fotos", "files", "bitacora",
        "audit_log", "motivo", "cambiado_por", "ip",
    }
    arreglos = []
    for camino, clave, valor in recorrer(cuerpo):
        assert clave not in prohibidas, f"clave prohibida en {camino}"
        if isinstance(valor, list):
            arreglos.append((camino, clave))

    # Los ÚNICOS arreglos posibles son `clientes` y `top_proveedores`: cualquier
    # otro sería una lista de filas de negocio.
    assert arreglos, "el recorrido no encontró un solo arreglo: no probó nada"
    for camino, clave in arreglos:
        assert clave in ("clientes", "top_proveedores"), camino

    crudo = json.dumps(cuerpo)
    for correo in ("duena@norte.co", "dueno@centro.co", "dueno@sur.co",
                   "duena@susp.co", "compartida@x.co"):
        assert correo not in crudo


# ════════════════════════════════════════════════════════════════════════════
# 2. LOS AGREGADOS POR CLIENTE, CONTRA LAS CUENTAS A MANO
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("slug", LEGIBLES)
def test_los_agregados_de_cada_cliente_legible(panel, slug):
    """Los ocho agregados de cada fila, completos, contra el número de lápiz."""
    _client, _cab, cuerpo = panel

    fila = _fila(cuerpo, slug)
    assert fila["error"] is None
    assert fila["metricas"] == POR_CLIENTE[slug], slug


def test_ocupacion_por_cliente_es_ocupadas_sobre_comercializables(panel):
    """La definición, aplicada fila por fila y con un decimal."""
    _client, _cab, cuerpo = panel

    esperado = {"norte": (3, 5, 60.0), "centro": (2, 2, 100.0),
                "sur": (7, 7, 100.0), "susp": (2, 3, 66.7)}
    for slug, (ocupadas, caras, pct) in esperado.items():
        m = _m(cuerpo, slug)
        assert m["espacios_comercializables"] == caras, slug
        assert m["ocupacion_pct"] == round(ocupadas * 100 / caras, 1) == pct, slug


def test_ocupacion_es_null_y_el_ingreso_es_0_0_con_denominador_cero(panel):
    """galerias no tiene 0 % de ocupación: no tiene ocupación.

    El `null` de `ocupacion_pct` es del CÁLCULO (no hay denominador). Fase 7:
    `ingreso_contratado_mes` SIEMPRE es un número — con cero contratos vale
    `0.0`, porque no facturó nada y eso es un dato, no una ausencia (hasta la
    Fase 6 esto salía `null` por la supresión de celda chica, hallazgo `m-5`
    de `conciliacion-metricas.md`, ya resuelto). `canon_promedio_mensual`
    sigue en `null`, pero por un motivo distinto: no hay ningún contrato del
    que promediar.
    """
    _client, _cab, cuerpo = panel
    m = _m(cuerpo, "galerias")

    assert m["espacios_comercializables"] == 0
    assert m["ocupacion_pct"] is None
    assert m["canon_promedio_mensual"] is None
    assert m["ingreso_contratado_mes"] == 0.0
    assert m["top_proveedores"] == []


def test_gondola_doble_dos_caras_no_comercializable_ninguna_y_mural_una(panel):
    """El inventario de norte, cara por cara: es lo que decide la ocupación."""
    from app.plataforma_metricas import _caras_comercializables

    _client, _cab, cuerpo = panel

    caras = _caras_comercializables(_NORTE_N1, "N1") | _caras_comercializables(_NORTE_N2, "N2")
    assert caras == {
        "N1-PUN-01",
        "N1-GON-01", "N1-GON-01-B",     # góndola doble: cara A y cara B (sufijo -B)
        "N1-BAT-01",                    # `rentable` ausente = comercializable
        "N2-PUN-01",
    }
    assert "N1-COL-01" not in caras     # `rentable: false` explícito
    # El TIPO manda antes que la bandera: una caja registradora es un puesto de
    # trabajo de la tienda y no entra al inventario ni sin bandera.
    assert "N1-CAJ-01" not in caras
    assert _m(cuerpo, "norte")["espacios_comercializables"] == len(caras) == 5

    # La góndola MURAL de susp aporta UNA sola cara.
    assert _caras_comercializables(_SUSP_S1, "S1") == {"S1-P-01", "S1-P-02", "S1-G-01"}


def test_contrato_sobre_espacio_sin_mueble_factura_pero_no_ocupa(panel):
    """FANTASMA-99 tiene contrato y no existe en ningún plano.

    Suma canon, ingreso y proveedor —la plata existe aunque el plano no la
    muestre— pero no puede contar como cara ocupada: inflaría un numerador
    contra un denominador que no lo incluye y el porcentaje pasaría de 100.
    """
    _client, _cab, cuerpo = panel
    m = _m(cuerpo, "norte")

    # 4 contratos activos y sólo 3 caras ocupadas.
    assert sum(p["contratos_activos"] for p in m["top_proveedores"]) == 4
    assert m["ocupacion_pct"] == 60.0                    # 3/5, no 4/5 (= 80,0)
    assert m["ocupacion_pct"] != 80.0
    # Y los 700.000 del fantasma SÍ están en el ingreso.
    assert m["ingreso_contratado_mes"] == 4_200_000.00
    assert m["ingreso_contratado_mes"] - 700_000.00 == 3_500_000.00


def test_canon_promedio_por_cliente_es_ingreso_sobre_contratos(panel):
    """En TODAS las filas con contratos, el promedio es exactamente
    ingreso / contratos — sin umbral, esto ya no distingue publicadas de
    suprimidas: todas lo son."""
    _client, _cab, cuerpo = panel

    contratos = {"norte": 4, "sur": 7, "centro": 2, "susp": 2}
    for slug, cuantos in contratos.items():
        m = _m(cuerpo, slug)
        assert m["canon_promedio_mensual"] == round(m["ingreso_contratado_mes"] / cuantos, 2), slug
        assert sum(p["contratos_activos"] for p in m["top_proveedores"]) <= cuantos, slug

    # galerias: cero contratos, nada de qué dividir.
    m = _m(cuerpo, "galerias")
    assert (m["canon_promedio_mensual"], m["ingreso_contratado_mes"],
            m["top_proveedores"]) == (None, 0.0, [])


# ════════════════════════════════════════════════════════════════════════════
# 3. RANGOS INCLUSIVOS EN LOS DOS EXTREMOS
# ════════════════════════════════════════════════════════════════════════════

def test_los_extremos_del_periodo_cuentan_y_un_dia_afuera_no(panel):
    """Cuatro contratos de borde, uno por uno:

    * (c) termina EXACTAMENTE en `desde` (2026-09-01)  -> cuenta
    * (k) arranca EXACTAMENTE en `hasta` (2026-09-30)  -> cuenta
    * (a) dura UN SOLO DÍA adentro del mes             -> cuenta
    * (e) termina el día anterior a `desde`            -> NO cuenta
    * (f) arranca el día siguiente a `hasta`           -> NO cuenta
    """
    _client, _cab, cuerpo = panel

    norte = _m(cuerpo, "norte")
    centro = _m(cuerpo, "centro")

    # (c): sin él, Bavaria no estaría en el top de norte ni sus 500.000 en el
    # ingreso. Está.
    assert {"nombre": "Bavaria", "contratos_activos": 1} in norte["top_proveedores"]
    # (k): con el borde adentro, centro tiene 2 caras ocupadas de 2 (100,0 %) y
    # 150.000,00 de ingreso EXACTO (Fase 7, sin umbral). Sin (k) sería 1 de 2
    # caras (50,0 %) y 100.000,00 de ingreso.
    assert centro["ocupacion_pct"] == 100.0
    assert centro["ocupacion_pct"] != 50.0
    assert centro["ingreso_contratado_mes"] == 150_000.00
    assert OCULTO_CENTRO["ingreso"] == 150_000.00
    # (a) el de un día: sus 1.000.000 están adentro.
    assert norte["ingreso_contratado_mes"] == 4_200_000.00
    # (e) y (f) afuera: con ellos el ingreso sería 4.200.000 + 800.000 + 3.000.000.
    assert norte["ingreso_contratado_mes"] != 8_000_000.00
    # (g) cancelado, afuera: Postobon no aparece por ninguna parte.
    assert "Postobon" not in [p["nombre"] for p in norte["top_proveedores"]]


def test_rango_del_periodo_es_el_mes_entero_inclusive():
    from app.plataforma_metricas import rango_del_periodo

    assert rango_del_periodo("2026-09") == (date(2026, 9, 1), date(2026, 9, 30))
    assert rango_del_periodo("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))
    assert rango_del_periodo("2028-02") == (date(2028, 2, 1), date(2028, 2, 29))  # bisiesto
    assert rango_del_periodo("2026-12") == (date(2026, 12, 1), date(2026, 12, 31))


# ════════════════════════════════════════════════════════════════════════════
# 4. PERÍODO: el mismo cliente en tres meses da tres números distintos
# ════════════════════════════════════════════════════════════════════════════

def test_mes_con_contrato_vigente_vs_mes_anterior_vs_mes_vacio(panel):
    client, cab, septiembre = panel

    agosto = _m(_pedir(client, cab, MES_ANTERIOR), "norte")
    noviembre = _m(_pedir(client, cab, MES_SIN_NADA), "norte")
    sept = _m(septiembre, "norte")

    # Agosto: (c), (e) y (h), sin umbral que cruzar (Fase 7) — los dos meses se
    # pueden comparar peso contra peso.
    for clave, valor in NORTE_AGOSTO.items():
        assert agosto[clave] == valor, clave
    # El inventario no cambia con el mes; lo que cambia es lo contratado.
    assert agosto["espacios_comercializables"] == sept["espacios_comercializables"] == 5
    assert agosto["ingreso_contratado_mes"] == 1_500_000.00
    assert sept["ingreso_contratado_mes"] == 4_200_000.00
    assert agosto["canon_promedio_mensual"] == 500_000.00
    assert sept["canon_promedio_mensual"] == 1_050_000.00
    assert agosto["ocupacion_pct"] == 40.0 and sept["ocupacion_pct"] == 60.0
    # Y ni un contrato en común: los proveedores de agosto no son los de sept.
    assert {p["nombre"] for p in agosto["top_proveedores"]} == {"Bavaria", "Colanta"}
    assert {p["nombre"] for p in sept["top_proveedores"]} == {"Alpina", "Bavaria"}

    # Noviembre: ni un contrato. Ocupación 0,0 (hay caras, ninguna ocupada) —
    # que NO es lo mismo que el `null` de un cliente sin inventario. El ingreso
    # es `0.0` (Fase 7: siempre número, no factura nada y eso es el dato); el
    # canon promedio sigue en `null` porque no hay ningún contrato del que
    # promediar.
    assert noviembre["ingreso_contratado_mes"] == 0.0
    assert noviembre["canon_promedio_mensual"] is None
    assert noviembre["top_proveedores"] == []
    assert noviembre["ocupacion_pct"] == 0.0
    assert noviembre["espacios_comercializables"] == 5


# ════════════════════════════════════════════════════════════════════════════
# 5. EL CONSOLIDADO: las dos cuentas que no se pueden promediar
# ════════════════════════════════════════════════════════════════════════════

def test_el_consolidado_completo_contra_las_cuentas_a_mano(panel):
    _client, _cab, cuerpo = panel
    assert cuerpo["consolidado"] == CONSOLIDADO


def test_ocupacion_consolidada_es_suma_sobre_suma_no_promedio_de_porcentajes(panel):
    """Σ ocupadas / Σ comercializables = 14/17 = 82,4 %.

    El promedio de los porcentajes de las filas da 81,7 %: una sede chica al
    100 % no compensa a una grande al 60 %.
    """
    _client, _cab, cuerpo = panel
    c = cuerpo["consolidado"]

    pcts = [f["metricas"]["ocupacion_pct"] for f in cuerpo["clientes"]
            if f["metricas"] and f["metricas"]["ocupacion_pct"] is not None]
    assert len(pcts) == 4
    promedio_de_porcentajes = round(sum(pcts) / len(pcts), 1)

    assert promedio_de_porcentajes == OCUPACION_PROMEDIO_DE_PORCENTAJES == 81.7
    assert c["ocupacion_pct"] == 82.4
    assert c["ocupacion_pct"] != promedio_de_porcentajes
    assert c["ocupacion_pct"] == round(14 * 100 / 17, 1)
    assert c["espacios_comercializables"] == 17


def test_canon_consolidado_es_ponderado_no_promedio_de_promedios(panel):
    """Σ canones / Σ contratos = 6.750.000,68 / 15 = 450.000,05.

    El promedio de los promedios de las filas da 411.607,23 — y el operador que
    mira este número está mirando su negocio.
    """
    _client, _cab, cuerpo = panel
    c = cuerpo["consolidado"]

    # Los cuatro promedios por fila, de las cuentas a mano: las cuatro se
    # publican (Fase 7, sin umbral), pero la cuenta equivocada que hay que
    # descartar es la de los CUATRO promedios — el consolidado los pondera,
    # no los promedia.
    assert _m(cuerpo, "norte")["canon_promedio_mensual"] == CANON_POR_FILA[0]
    assert _m(cuerpo, "sur")["canon_promedio_mensual"] == CANON_POR_FILA[2]
    assert _m(cuerpo, "centro")["canon_promedio_mensual"] == OCULTO_CENTRO["canon"] == CANON_POR_FILA[1]
    assert _m(cuerpo, "susp")["canon_promedio_mensual"] == OCULTO_SUSP["canon"] == CANON_POR_FILA[3]
    promedio_de_promedios = round(sum(CANON_POR_FILA) / len(CANON_POR_FILA), 2)

    assert promedio_de_promedios == CANON_PROMEDIO_DE_PROMEDIOS == 411_607.23
    assert c["canon_promedio_mensual"] == 450_000.05
    assert c["canon_promedio_mensual"] != promedio_de_promedios
    assert c["canon_promedio_mensual"] == round(6_750_000.68 / 15, 2)


# ════════════════════════════════════════════════════════════════════════════
# 6. CONCILIACIÓN — el consolidado ES la suma de sus partes
# ════════════════════════════════════════════════════════════════════════════
#
# La lección de vitrinas, entera: acá el peor fallo silencioso es un consolidado
# que no cuadra con las filas del mismo JSON.
#
# Fase 7: sin umbral, la conciliación tiene un solo nivel — el consolidado
# tiene que ser, exactamente, la suma de TODAS las filas legibles (conteos,
# plata y proveedores por igual). Hasta la Fase 6 esto tenía dos niveles (una
# "cuenta cerrada" para lo que nunca se suprimía y una "cuenta con lo oculto"
# para plata y proveedores, que había que reconstruir a mano); sin supresión
# ya no hay nada oculto que reconstruir, así que un residuo distinto de cero
# en cualquier campo SÍ sería un defecto de verdad, y es lo que estos tests
# atrapan.

def _legibles(cuerpo):
    return [f["metricas"] for f in cuerpo["clientes"] if f["metricas"] is not None]


def _visible(cuerpo, clave):
    """Σ de una clave sobre las filas legibles que la publican (no `null`)."""
    return round(sum(m[clave] for m in _legibles(cuerpo) if m[clave] is not None), 2)


def test_conciliacion_ingreso_contratado(panel):
    """Consolidado = Σ EXACTA de las filas visibles. Fase 7, sin residuo.

    Hasta la Fase 6 esto era una NO-conciliación esperada: la suma de lo que
    el panel mostraba daba 6.100.000,00 (sólo norte y sur publicaban) contra
    6.750.000,68 del consolidado, con 650.000,68 de diferencia que eran centro,
    susp y galerias sin publicar. Sin umbral, esa diferencia desaparece: cada
    fila publica su número exacto (galerias incluido, con `0.0`) y el
    consolidado es, literalmente, la suma de la columna que ve el operador.
    """
    _client, _cab, cuerpo = panel

    visible = _visible(cuerpo, "ingreso_contratado_mes")
    assert visible == 6_750_000.68           # las cinco filas publican, galerias con 0.0
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == 6_750_000.68
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == visible

    # Sin residuo: lo que antes había que reconstruir a mano (OCULTO_*) ahora
    # está en las propias filas.
    assert CENTRO["ingreso_contratado_mes"] == OCULTO_CENTRO["ingreso"] == 150_000.00
    assert SUSP["ingreso_contratado_mes"] == OCULTO_SUSP["ingreso"] == 500_000.68
    assert GALERIAS["ingreso_contratado_mes"] == OCULTO_GALERIAS["ingreso"] == 0.0


def test_conciliacion_espacios_comercializables_y_sedes(panel):
    """El consolidado tiene que ser exactamente la suma de las filas visibles
    — sin residuo, ya sin umbral que suprima nada."""
    _client, _cab, cuerpo = panel
    filas = _legibles(cuerpo)

    assert cuerpo["consolidado"]["espacios_comercializables"] == sum(
        m["espacios_comercializables"] for m in filas) == 17
    assert cuerpo["consolidado"]["sedes_con_plano"] == sum(
        m["sedes_con_plano"] for m in filas) == 5
    # centro, susp y galerias aportan sus conteos como cualquier otra fila.
    assert [_m(cuerpo, s)["espacios_comercializables"] for s in ("centro", "susp", "galerias")] == [2, 3, 0]
    assert [_m(cuerpo, s)["ocupacion_pct"] for s in ("centro", "susp", "galerias")] == [100.0, 66.7, None]


def test_conciliacion_del_top_de_proveedores(panel):
    """Conteo consolidado de cada proveedor = Σ de las filas visibles.

    Una sola fuente de diferencia posible, y conocida: el **corte en 5** —
    Familia, sexto proveedor de sur, no está en el top de su cliente ni en el
    consolidado. Consecuencia sabida de un "top 5". Sin umbral, ya no hay una
    segunda fuente: centro y susp publican su propio top, así que Zenu (de
    centro y susp) SÍ aparece en una fila del panel.
    """
    _client, _cab, cuerpo = panel

    por_cliente = {}
    for fila in cuerpo["clientes"]:
        if not fila["metricas"]:
            continue
        for p in fila["metricas"]["top_proveedores"]:
            por_cliente.setdefault(p["nombre"], {})[fila["slug"]] = p["contratos_activos"]

    # Las CINCO filas legibles aportan al desglose visible; Zenu ya aparece
    # (viene de centro y susp, que antes de la Fase 7 no publicaban su top).
    assert por_cliente == {
        "Alpina": {"norte": 3, "sur": 2, "susp": 1},
        "Bavaria": {"norte": 1, "sur": 1},
        "Colanta": {"sur": 1},
        "Diana": {"sur": 1},
        "Exito": {"sur": 1},
        "Zenu": {"centro": 2, "susp": 1},
    }

    for p in cuerpo["consolidado"]["top_proveedores"]:
        visible = sum(por_cliente.get(p["nombre"], {}).values())
        assert visible == p["contratos_activos"], (p["nombre"], visible)

    # Sin residuo: cada proveedor del consolidado cierra exactamente con la
    # suma de sus filas.
    top_c = {p["nombre"]: p["contratos_activos"] for p in cuerpo["consolidado"]["top_proveedores"]}
    assert top_c["Bavaria"] == 2 == sum(por_cliente["Bavaria"].values())
    assert top_c["Zenu"] == 3 == sum(por_cliente["Zenu"].values())
    assert top_c["Alpina"] == 6 == sum(por_cliente["Alpina"].values())

    assert "Familia" not in por_cliente
    assert "Familia" not in top_c


def test_conciliacion_contratos_activos_totales(panel):
    """Σ contratos = Σ ingreso / canon ponderado, y coincide con los 15 sembrados."""
    _client, _cab, cuerpo = panel
    c = cuerpo["consolidado"]

    contratos = round(c["ingreso_contratado_mes"] / c["canon_promedio_mensual"])
    assert contratos == 15


def test_usuarios_consolidados_son_personas_distintas_no_la_suma_de_filas(panel):
    """La ÚNICA cifra que a propósito no concilia, y por qué.

    La cuenta compartida tiene membresía activa en norte y en centro: es una
    persona con cuenta en dos supermercados, no dos usuarios de la plataforma.
    Σ de las filas da 6; el consolidado dice 5.
    """
    _client, _cab, cuerpo = panel
    filas = _legibles(cuerpo)

    assert sum(m["usuarios_con_cuenta"] for m in filas) == SUMA_DE_USUARIOS_POR_FILA == 6
    assert cuerpo["consolidado"]["usuarios_con_cuenta"] == 5


# ════════════════════════════════════════════════════════════════════════════
# 7. CLIENTE ROTO Y CLIENTE SUSPENDIDO
# ════════════════════════════════════════════════════════════════════════════

def test_el_cliente_roto_queda_fuera_de_todo_agregado_y_se_cuenta_aparte(panel):
    """Sumarlo como un cliente con todo en cero mentiría todos los porcentajes."""
    _client, _cab, cuerpo = panel

    roto = _fila(cuerpo, "roto")
    assert roto["metricas"] is None
    assert roto["error"] == "No se pudo leer la base de este cliente."
    assert roto["estado_cuenta"] == "activo"

    c = cuerpo["consolidado"]
    assert c["clientes_total"] == 6            # la fila SÍ existe y se cuenta
    assert c["clientes_con_error"] == 1
    # Y las dos cifras cierran con las filas: total - con_error = filas con números.
    assert c["clientes_total"] - c["clientes_con_error"] == len(_legibles(cuerpo)) == 5
    assert c["clientes_total"] == len(cuerpo["clientes"])
    # ...y no aporta ni un cero a ningún denominador.
    assert c["espacios_comercializables"] == 17
    assert c["ingreso_contratado_mes"] == 6_750_000.68


def test_el_error_del_cliente_roto_no_filtra_la_base_ni_el_driver(panel):
    _client, _cab, cuerpo = panel
    texto = _fila(cuerpo, "roto")["error"].lower()

    for prohibido in ("sqlite", "recabra_roto", ".db", "/", "database", "file is not"):
        assert prohibido not in texto


def test_el_cliente_suspendido_entra_entero_en_el_consolidado(panel):
    """El operador necesita ver el negocio COMPLETO: una cuenta cortada por
    impago es justamente la que hay que poder mirar."""
    _client, _cab, cuerpo = panel

    fila = _fila(cuerpo, "susp")
    assert fila["estado_cuenta"] == "suspendido"
    assert fila["error"] is None
    assert fila["metricas"] == SUSP

    # Sin susp, el consolidado sería 6.250.000,00 y 14 caras. La plata de susp
    # está publicada en su fila Y presente en el consolidado — suspender una
    # cuenta no puede cambiar el total del negocio, y sin umbral tampoco hace
    # falta esconder el número de la fila para que eso sea cierto.
    assert fila["metricas"]["ingreso_contratado_mes"] == 500_000.68
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == 6_750_000.68
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] - 500_000.68 == 6_250_000.00
    assert cuerpo["consolidado"]["espacios_comercializables"] == 17


# ════════════════════════════════════════════════════════════════════════════
# 8. USUARIOS Y ÚLTIMO ACCESO
# ════════════════════════════════════════════════════════════════════════════

def test_usuarios_con_cuenta_cuenta_membresias_activas_y_distintas(panel):
    _client, _cab, cuerpo = panel

    # norte y centro: dueño + compartida. sur: sólo el dueño, porque la
    # membresía de la compartida está dada de baja (activo=False).
    assert _m(cuerpo, "norte")["usuarios_con_cuenta"] == 2
    assert _m(cuerpo, "centro")["usuarios_con_cuenta"] == 2
    assert _m(cuerpo, "sur")["usuarios_con_cuenta"] == 1
    assert _m(cuerpo, "susp")["usuarios_con_cuenta"] == 1
    assert _m(cuerpo, "galerias")["usuarios_con_cuenta"] == 0


def test_ultimo_acceso_es_la_fecha_del_login_mas_reciente_del_cliente(panel):
    """La FECHA, sin hora y sin quién — y la del cliente, no la global."""
    _client, _cab, cuerpo = panel

    # norte: dueña 2026-09-01, compartida 2026-09-17 -> gana la compartida.
    assert _m(cuerpo, "norte")["ultimo_acceso"] == "2026-09-17"
    # centro: dueño 2026-09-20, compartida 2026-09-17 -> gana el dueño.
    assert _m(cuerpo, "centro")["ultimo_acceso"] == "2026-09-20"
    assert _m(cuerpo, "susp")["ultimo_acceso"] == "2026-07-05"
    # sur: su único usuario nunca entró.
    assert _m(cuerpo, "sur")["ultimo_acceso"] is None
    assert _m(cuerpo, "galerias")["ultimo_acceso"] is None

    # Sin hora: exactamente diez caracteres, YYYY-MM-DD.
    for slug in ("norte", "centro", "susp"):
        valor = _m(cuerpo, slug)["ultimo_acceso"]
        assert len(valor) == 10 and valor.count("-") == 2
        assert date.fromisoformat(valor)


# ════════════════════════════════════════════════════════════════════════════
# 9. DETALLES QUE FIJAN COMPORTAMIENTO CONOCIDO
# ════════════════════════════════════════════════════════════════════════════

def test_el_porcentaje_redondea_a_la_mitad_par(panel):
    """Comportamiento FIJADO, no elegido: ``round`` de Python redondea la
    mitad exacta al par más cercano.

    13/16 = 81,25 % sale como **81,2** y no como 81,3. Está pineado acá porque
    es la única forma de que un cambio de criterio (media hacia arriba) no pase
    inadvertido: en el consolidado un 0,1 de diferencia es lo que separa el
    número del panel del que el operador saca con la calculadora.
    Ver el hallazgo `m-2` de `conciliacion-metricas.md`.
    """
    from app.plataforma_metricas import _pct

    assert _pct(13, 16) == 81.2          # 81,25 -> par
    assert _pct(3, 16) == 18.8           # 18,75 -> par
    assert _pct(0, 5) == 0.0
    assert _pct(5, 5) == 100.0
    assert _pct(1, 3) == 33.3
    assert _pct(0, 0) is None
    assert _pct(3, 0) is None


def test_las_metricas_no_escriben_una_sola_fila_en_la_base_del_cliente(panel):
    """Read-only de verdad: ni un espacio, ni un contrato, ni una línea de
    ``audit_log`` en la base de nadie."""
    from app.clientes import buscar, sesion_de
    from app.models.models import AuditEntry, LayoutSnapshot, Space, SpaceLease, Supplier

    client, cab, _cuerpo = panel

    def foto(slug):
        db = sesion_de(buscar(slug))
        try:
            return tuple(db.query(m).count() for m in
                         (Space, SpaceLease, Supplier, LayoutSnapshot, AuditEntry))
        finally:
            db.close()

    antes = {slug: foto(slug) for slug in ("norte", "centro", "sur", "susp")}
    _pedir(client, cab)
    _pedir(client, cab, MES_ANTERIOR)
    _pedir(client, cab, MES_SIN_NADA)
    assert {slug: foto(slug) for slug in antes} == antes


def test_el_cache_no_cambia_los_numeros_ni_el_generado_en(panel):
    """Un acierto de caché tiene que devolver EXACTAMENTE lo mismo, marcado."""
    client, cab, primera = panel

    segunda = _pedir(client, cab)
    assert primera["de_cache"] is False
    assert segunda["de_cache"] is True
    assert segunda["generado_en"] == primera["generado_en"]
    assert segunda["consolidado"] == primera["consolidado"]
    assert segunda["clientes"] == primera["clientes"]


def test_cada_consulta_deja_linea_en_la_bitacora_del_registro(panel):
    """La bitácora anota el ACCESO, no el cálculo: el acierto de caché también."""
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    client, cab, _cuerpo = panel      # la del fixture ya dejó una línea

    _pedir(client, cab)               # caché
    _pedir(client, cab, MES_ANTERIOR)

    reg = sesion_registro()
    try:
        filas = reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        lineas = [(f.email, f.accion, f.periodo) for f in filas]
        assert all(f.en is not None for f in filas)
    finally:
        reg.close()

    assert lineas == [
        ("auditor@recabra.co", "metricas", "2026-09"),
        ("auditor@recabra.co", "metricas", "2026-09"),
        ("auditor@recabra.co", "metricas", "2026-08"),
    ]


# ════════════════════════════════════════════════════════════════════════════
# 10. FASE 7 — SIN UMBRAL: 2 y 3 contratos publican igual, y el consolidado
#     NUNCA se suprime a sí mismo
# ════════════════════════════════════════════════════════════════════════════
#
# Hasta la Fase 6 esta sección probaba la frontera de K=3 (2 contratos
# suprimidos, 3 publicados). El dueño de la plataforma quitó el umbral
# (docs/ESTADO.md, Fase 7): ya no hay una frontera que cruzar, y estos dos
# tests se convierten en la prueba de que 2 y 3 contratos publican EXACTO por
# igual, fila y consolidado.

def test_con_2_o_3_contratos_la_fila_publica_el_numero_exacto_por_igual(client, monkeypatch):
    """Dos clientes gemelos, uno con 2 contratos y otro con 3, en el mismo JSON.

    Cuentas a mano:

    * ``dos``  — 2 caras, 2 contratos de 100.000 y 300.000. Publicado: ingreso
      400.000,00 y canon 200.000,00.
    * ``tres`` — 3 caras, 3 contratos de 100.000, 200.000 y 600.000. Publicado:
      ingreso 900.000,00, canon 300.000,00, top con Alpina 2 y Bavaria 1. Es el
      mismo cliente que ``dos`` más un contrato: la única diferencia es esa,
      ya no cruzar ningún umbral.
    * consolidado — 5 contratos: ingreso 1.300.000,00 (los 400.000 de ``dos``
      incluidos) y canon ponderado 1.300.000 / 5 = 260.000,00. El promedio de
      los dos promedios daría 250.000,00: ponderado, no promedio de promedios.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-dos", "duena@dos.co", "dos", "Dos")
    _fundar(ids, "uid-tres", "dueno@tres.co", "tres", "Tres")
    _sembrar(
        "dos",
        {"D1": [{"code": "P-01", "type": "punta", "sede": "D1"},
                {"code": "P-02", "type": "punta", "sede": "D1"}]},
        [("D1-P-01", "Alpina",  "2026-09-01", "2026-09-30", 100_000.00, True),
         ("D1-P-02", "Bavaria", "2026-09-01", "2026-09-30", 300_000.00, True)],
    )
    _sembrar(
        "tres",
        {"T1": [{"code": "P-01", "type": "punta", "sede": "T1"},
                {"code": "P-02", "type": "punta", "sede": "T1"},
                {"code": "P-03", "type": "punta", "sede": "T1"}]},
        [("T1-P-01", "Alpina",  "2026-09-01", "2026-09-30", 100_000.00, True),
         ("T1-P-02", "Bavaria", "2026-09-01", "2026-09-30", 200_000.00, True),
         ("T1-P-03", "Alpina",  "2026-09-01", "2026-09-30", 600_000.00, True)],
    )
    monkeypatch.setenv("OPERADOR_EMAILS", "auditor@recabra.co")
    ids.registrar("uid-auditor", "auditor@recabra.co")
    r = client.post("/api/auth/oauth", json={"id_token": "uid-auditor"})
    assert r.status_code == 200, r.text
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(r.json()["token"]))

    # 2 contratos: número exacto, no `null`.
    dos = _m(cuerpo, "dos")
    assert dos["ingreso_contratado_mes"] == 400_000.00
    assert dos["canon_promedio_mensual"] == 200_000.00
    assert dos["top_proveedores"] == [       # empate a 1: alfabético
        {"nombre": "Alpina", "contratos_activos": 1},
        {"nombre": "Bavaria", "contratos_activos": 1},
    ]
    assert dos["espacios_comercializables"] == 2
    assert dos["ocupacion_pct"] == 100.0
    assert dos["sedes_con_plano"] == 1

    # 3 contratos: exactamente el mismo cliente, un contrato más.
    tres = _m(cuerpo, "tres")
    assert tres["ingreso_contratado_mes"] == 900_000.00
    assert tres["canon_promedio_mensual"] == 300_000.00
    assert tres["top_proveedores"] == [
        {"nombre": "Alpina", "contratos_activos": 2},
        {"nombre": "Bavaria", "contratos_activos": 1},
    ]
    assert tres["ocupacion_pct"] == 100.0

    # El consolidado suma los 5, los 400.000 de `dos` incluidos — y como `dos`
    # también los publica, la conciliación cierra sin residuo.
    c = cuerpo["consolidado"]
    assert c["ingreso_contratado_mes"] == 1_300_000.00
    assert c["canon_promedio_mensual"] == 260_000.00          # 1.300.000 / 5
    assert c["canon_promedio_mensual"] != 250_000.00          # (200.000+300.000)/2
    assert c["ingreso_contratado_mes"] - tres["ingreso_contratado_mes"] == dos["ingreso_contratado_mes"]
    assert c["top_proveedores"] == [
        {"nombre": "Alpina", "contratos_activos": 3},         # 2 de tres + 1 de dos
        {"nombre": "Bavaria", "contratos_activos": 2},        # 1 y 1
    ]


def test_el_consolidado_publica_exacto_aunque_toda_la_plataforma_tenga_pocos_contratos(
    client, monkeypatch,
):
    """Sin umbral, el consolidado tampoco se suprime a su propio nivel.

    Un solo cliente con 2 contratos (más `galerias`, que no tiene ninguno):
    el CONSOLIDADO publica el número exacto — antes de la Fase 7, con 2 < K=3
    en toda la plataforma, esto salía `null`.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-chico", "duena@chico.co", "chico", "Chico")
    _sembrar(
        "chico",
        {"K1": [{"code": "P-01", "type": "punta", "sede": "K1"},
                {"code": "P-02", "type": "punta", "sede": "K1"}]},
        [("K1-P-01", "Alpina", "2026-09-01", "2026-09-30", 900_000.00, True),
         ("K1-P-02", "Alpina", "2026-09-01", "2026-09-30", 100_000.00, True)],
    )
    monkeypatch.setenv("OPERADOR_EMAILS", "auditor@recabra.co")
    ids.registrar("uid-auditor", "auditor@recabra.co")
    r = client.post("/api/auth/oauth", json={"id_token": "uid-auditor"})
    assert r.status_code == 200, r.text
    limpiar_cache_metricas()

    cuerpo = _pedir(client, _cab(r.json()["token"]))
    c = cuerpo["consolidado"]

    assert c["ingreso_contratado_mes"] == 1_000_000.00
    assert c["canon_promedio_mensual"] == 500_000.00
    assert c["top_proveedores"] == [{"nombre": "Alpina", "contratos_activos": 2}]
    assert c["espacios_comercializables"] == 2
    assert c["ocupacion_pct"] == 100.0
    assert c["clientes_total"] == 2 and c["clientes_con_error"] == 0
    assert _m(cuerpo, "chico")["ingreso_contratado_mes"] == 1_000_000.00


# ════════════════════════════════════════════════════════════════════════════
# 11. DEFENSAS QUE AGUANTAN — los hallazgos b-1 y m-1, ya corregidos
# ════════════════════════════════════════════════════════════════════════════
#
# Los tres tests de acá abajo nacieron `xfail(strict=True)` como hallazgos de la
# primera pasada (b-1 bloqueante y m-1 menor: el denominador de la ocupación se
# encogía en el mueble más común del negocio). El backend los corrigió —
# `_caras_comercializables` suma la cara B por el TIPO del mueble, sin exigir la
# clave `faceB`, y `_es_gondola_doble` reconoce el tipo legado— y los tests
# pasaron a XPASS, que con `strict=True` rompe la suite. Se les sacó la marca:
# de acá en adelante son la red que impide que el defecto vuelva.

def test_gondola_doble_sin_faceB_cuenta_dos_caras():
    """Una góndola doble recién dibujada son DOS espacios vendibles.

    El editor 3D la guarda con `faceB: undefined` —la clave sólo aparece cuando
    esa cara tuvo datos comerciales alguna vez—, y `facesOf` (DashboardView.tsx)
    hace `f.faceB ?? EMPTY_FACE` y devuelve dos caras igual. Exigir `faceB`
    contaba UNA: era el hallazgo `b-1`, y valía 1 donde tenía que valer 2.
    """
    from app.plataforma_metricas import _caras_comercializables

    fixtures = [{"code": "GON-77", "type": "gondola", "gondolaType": "double", "sede": "N1"}]
    assert _caras_comercializables(fixtures, "N1") == {"N1-GON-77", "N1-GON-77-B"}

    # Y el default indefinido también es doble, en los dos editores.
    sin_tipo = [{"code": "GON-79", "type": "gondola", "sede": "N1"}]
    assert _caras_comercializables(sin_tipo, "N1") == {"N1-GON-79", "N1-GON-79-B"}
    # La mural sigue siendo UNA cara: el arreglo no barrió con la distinción.
    mural = [{"code": "GON-80", "type": "gondola", "gondolaType": "wall", "sede": "N1"}]
    assert _caras_comercializables(mural, "N1") == {"N1-GON-80"}


def test_un_contrato_sobre_la_cara_B_ocupa_y_el_denominador_la_cuenta(client, monkeypatch):
    """El mismo arreglo, por la puerta del endpoint: 2 caras y 50,0 %.

    Antes del arreglo la cara B era invisible: el contrato REAL sobre `-B` no
    contaba como ocupación y el denominador se encogía, así que el panel decía
    1 cara y 0,0 % sobre un mueble medio vendido.
    """
    from app.plataforma_metricas import limpiar_cache_metricas

    ids = Identidades(client)
    _fundar(ids, "uid-dob", "duena@dob.co", "dob", "Doble")
    _sembrar(
        "dob",
        {"D1": [{"code": "GON-77", "type": "gondola", "gondolaType": "double", "sede": "D1"}]},
        [("D1-GON-77-B", "Alpina", "2026-09-01", "2026-09-30", 100_000.00, True)],
    )
    monkeypatch.setenv("OPERADOR_EMAILS", "auditor@recabra.co")
    ids.registrar("uid-auditor", "auditor@recabra.co")
    r = client.post("/api/auth/oauth", json={"id_token": "uid-auditor"})
    assert r.status_code == 200, r.text
    limpiar_cache_metricas()

    m = _m(_pedir(client, _cab(r.json()["token"])), "dob")
    assert m["espacios_comercializables"] == 2
    assert m["ocupacion_pct"] == 50.0
    # Un contrato solo: sin umbral (Fase 7), el ingreso sale exacto igual que
    # la ocupación —que es lo que este test mira.
    assert m["ingreso_contratado_mes"] == 100_000.00


def test_el_tipo_legado_gondola_doble_cuenta_dos_caras():
    """`type: "gondola_doble"` de los layouts viejos ya persistidos.

    `DashboardView.tsx` conserva a propósito `|| f.type === "gondola_doble"`
    ("kept for old persisted layouts"). Sin esa rama, un cliente antiguo
    aparecía con la mitad del inventario: era el hallazgo `m-1`.
    """
    from app.plataforma_metricas import _caras_comercializables

    fixtures = [{"code": "GON-88", "type": "gondola_doble", "sede": "N1"}]
    assert _caras_comercializables(fixtures, "N1") == {"N1-GON-88", "N1-GON-88-B"}
    # Y un `rentable: false` sobre el tipo legado sigue excluyendo las DOS caras.
    apagada = [{"code": "GON-89", "type": "gondola_doble", "sede": "N1", "rentable": False}]
    assert _caras_comercializables(apagada, "N1") == set()


# ════════════════════════════════════════════════════════════════════════════
# 12. HALLAZGOS ABIERTOS — tests que fallan A PROPÓSITO
# ════════════════════════════════════════════════════════════════════════════
#
# `xfail(strict=True)`: hoy la suite queda verde con ellos rojos, y el día que
# el defecto se corrija el test pasa a "XPASS" y ROMPE la suite, obligando a
# sacarle la marca. Un hallazgo así no se puede olvidar.

# Hallazgo CERRADO en el cierre de fase — el test ahora afirma el arreglo.
def test_hallazgo_M1_el_estado_del_json_de_metricas_queda_viejo_tras_el_patch(client, monkeypatch):
    _ids, cab = _escenario(client, monkeypatch)

    assert _fila(_pedir(client, cab), "centro")["estado_cuenta"] == "activo"

    r = client.patch(
        "/api/plataforma/clientes/centro",
        json={"estado": "suspendido", "motivo": "impago"},
        headers=cab,
    )
    assert r.status_code == 200, r.text

    # El otro endpoint de la misma consola ya lo dice bien...
    listado = client.get("/api/plataforma/clientes", headers=cab).json()["clientes"]
    assert next(c for c in listado if c["slug"] == "centro")["estado"] == "suspendido"

    # ...y el JSON de métricas, no.
    assert _fila(_pedir(client, cab), "centro")["estado_cuenta"] == "suspendido"
