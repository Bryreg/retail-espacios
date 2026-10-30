"""Siembra la base con la que corre la parte de navegador de `probar-plataforma.mjs`.

NO toca el backend: lo IMPORTA (solo lectura del código, escritura sólo en su
propia base `frontera.db`, que está en `.gitignore`). Se corre desde
`backend/` porque las bases de cliente (`recabra_<slug>.db`) se crean
relativas al directorio actual.

Lo que planta, y por qué cada cosa:

  · la TARIFA DE REFERENCIA de `mercafresco` es **987654** —— un valor de seis
    cifras que no puede salir de ninguna otra cuenta del sistema. Si aparece
    en el innerText de la cartera, del detalle o del informe, es una fuga y
    se ve a simple vista. El backend ya no la publica; el test afirma que el
    frontend tampoco la reconstruye, y que sigue siendo así mañana;
  · un SEGUNDO cliente con nombre inconfundible («Zafiro Nocturno») para
    poder afirmar que el informe de Mercafresco no nombra a nadie más —— el
    test se los pide al registro, no a una variable de entorno;
  · cada proveedor lleva correo, teléfono, contacto y una nota interna en su
    fila, para grepear las otras fugas de la frontera del brief §4. Uno de
    ellos trae el correo y el teléfono METIDOS EN EL NOMBRE, que es el caso
    que `sanear_nombre_proveedor` tiene que resolver;
  · usuarios, membresías y fundaciones, para que `/adopcion` clasifique y la
    cola de llamadas de la cartera tenga filas;
  · un contrato que vence dentro del periodo (riel de 60 días), uno que
    arranca dentro, una salida por vencimiento del mes pasado, y espacios
    libres de sobra: sin eso, media pantalla no se dibuja y el grep no puede
    afirmar nada sobre lo que no se pintó.

Uso:
    cd backend
    SP=/tmp/sp PYTHONPATH=$PWD python3 ../frontend/scripts/sembrar-plataforma.py

Deja el token del operador en `$SP/token-frontera.txt` y la base en
`frontera.db` del directorio desde donde se corre.
"""
import glob
import json
import os
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

SP = os.environ.get("SP", ".")

os.environ.update(DATABASE_URL="sqlite:///./frontera.db", JWT_SECRET="dev-frontera",
                  ADMIN_PASSWORD="admin123", WORKER_PASSWORD="galerias",
                  OPERADOR_EMAILS="operador@ejemplo.com")
for f in ["frontera.db"] + glob.glob("recabra_*.db"):
    if os.path.exists(f):
        os.remove(f)

from app.database import engine, Base, SessionLocal  # noqa: E402
import app.main as main  # noqa: E402,F401

Base.metadata.create_all(bind=engine)

from app.auth import create_token, epoca_de, set_config  # noqa: E402
from app.clientes import (registrar_el_de_siempre, crear_cliente, buscar,  # noqa: E402
                          sesion_de, sesion_registro)
from app.models.identidad import Membresia, Usuario  # noqa: E402
from app.models.models import LayoutSnapshot, Space, SpaceLease, Supplier  # noqa: E402
from app.models.plataforma import Fundacion  # noqa: E402
from app.plataforma_metricas import periodo_actual  # noqa: E402
from app.routers.layout import RATES_KEY  # noqa: E402

registrar_el_de_siempre()

# ── La tarifa que NUNCA puede salir ───────────────────────────────────────
TARIFA_SECRETA = 987654.0

HOY = datetime.now(timezone.utc)
P = periodo_actual()
Y, M = map(int, P.split("-"))
ULT = monthrange(Y, M)[1]
INI_MES = f"{Y:04d}-{M:02d}-01"
FIN_MES = f"{Y:04d}-{M:02d}-{ULT:02d}"
VENCE = f"{Y:04d}-{M:02d}-{min(20, ULT):02d}"
ARRANCA = f"{Y:04d}-{M:02d}-15"
FIN_LARGO = f"{Y + 1:04d}-{M:02d}-{min(28, ULT):02d}"

NOTA = "NOTA-INTERNA-QUE-NO-DEBE-SALIR"
CONTACTO = "Juan Perez"
TELEFONO = "3005558899"
CORREO = "contacto@proveedor.example"


def fx(code, tipo, sede, **kw):
    d = {"code": code, "type": tipo, "sede": sede, "label": code, "cx": 1, "cz": 1,
         "rotY": 0, "w": 3.0, "d": 1.0, "h": 1.8, "color": "#6366f1"}
    d.update(kw)
    return d


# ── Mercafresco: dos sedes, cuatro tipos, libres de sobra ─────────────────
NAVE = ([fx(f"GON-{i:02d}", "gondola", "NAVE", gondolaType="double") for i in range(1, 9)]
        + [fx(f"PUN-{i:02d}", "punta", "NAVE", w=2.0, d=1.5) for i in range(1, 5)]
        + [fx("NEV-01", "nevera_refrescos", "NAVE")])
SUR = ([fx(f"PUN-{i:02d}", "punta", "SUR", w=2.0, d=2.0) for i in range(1, 7)]
       + [fx(f"GON-{i:02d}", "gondola", "SUR", gondolaType="double") for i in range(1, 4)])

CONTRATOS = [
    ("NAVE-GON-01", "Alpina", "Alpina Kids", f"{Y:04d}-01-01", FIN_LARGO, 1_000_000.0, True),
    ("NAVE-GON-01-B", "Alpina", "Alpina Yogurt", ARRANCA, FIN_LARGO, 600_000.0, True),
    ("NAVE-GON-02", "Postobón", "Colombiana", f"{Y:04d}-02-01", FIN_LARGO, 750_000.0, True),
    ("NAVE-GON-03", "Alpina", "Alpina Leche", f"{Y:04d}-02-01", FIN_LARGO, 820_000.0, True),
    ("NAVE-GON-04", "Alpina", "Alpina Queso", f"{Y:04d}-02-01", FIN_LARGO, 780_000.0, True),
    # el que vence dentro del periodo — riel de 60 días
    ("NAVE-PUN-01", "Nutresa ventas@nutresa.com.co 300 555 8899", "Doria",
     f"{Y:04d}-05-01", VENCE, 2_000_000.0, True),
    ("NAVE-NEV-01", "Bimbo", None, f"{Y:04d}-03-01", FIN_LARGO, 300_000.0, True),
    ("SUR-PUN-01", "Colanta", None, f"{Y:04d}-04-01", FIN_LARGO, 900_000.0, True),
    ("SUR-GON-01", "Ramo", None, f"{Y:04d}-04-01", FIN_LARGO, 640_000.0, True),
    # histórico: salida por vencimiento el mes pasado
    ("SUR-PUN-02", "Zenu", None, f"{Y - 1:04d}-06-01", f"{Y:04d}-{max(1, M - 1):02d}-28",
     800_000.0, False),
]
EXTRA = {"NAVE-GON-01": ("Pasillo central", 4.5), "NAVE-PUN-01": ("Entrada", 3.0)}

# ── Zafiro Nocturno: el otro cliente, para el benchmark y para el grep ────
ZAF = [fx("NEV-01", "nevera_refrescos", "ZAF"), fx("NEV-02", "nevera_refrescos", "ZAF"),
       fx("GON-01", "gondola", "ZAF", gondolaType="double")]
CONTRATOS_ZAF = [
    ("ZAF-NEV-01", "Colanta", None, INI_MES, FIN_MES, 300_000.0, True),
    ("ZAF-NEV-02", "Colanta", None, INI_MES, FIN_MES, 500_000.0, True),
    ("ZAF-GON-01", "Postobón", None, INI_MES, FIN_MES, 1_400_000.0, True),
]


def sembrar(slug, sedes, contratos, extra=None, tarifa=None):
    extra = extra or {}
    db = sesion_de(buscar(slug))
    try:
        for sede, f in sedes.items():
            db.add(LayoutSnapshot(sede=sede, fixtures_json=json.dumps(f)))
        db.flush()
        provs, sps = {}, {}
        for codigo, prov, marca, ini, fin, canon, activo in contratos:
            if prov not in provs:
                r = Supplier(name=prov, contact_name=CONTACTO, phone=TELEFONO,
                             email=CORREO, notes=NOTA)
                db.add(r); db.flush(); provs[prov] = r
            if codigo not in sps:
                e = db.query(Space).filter(Space.code == codigo).first()
                if e is None:
                    zona, area = extra.get(codigo, ("Zona", 5.0))
                    e = Space(code=codigo, svg_id=f"svg-{codigo}", name=codigo, zone=zona,
                              sede=codigo.split("-")[0], area_m2=area, notes=NOTA)
                    db.add(e); db.flush()
                sps[codigo] = e
            db.add(SpaceLease(space_id=sps[codigo].id, supplier_id=provs[prov].id, marca=marca,
                              start_date=date.fromisoformat(ini), end_date=date.fromisoformat(fin),
                              monthly_rent=canon, is_active=activo, notes=NOTA))
        if tarifa is not None:
            set_config(db, RATES_KEY, json.dumps(
                {"default": {"gondola": tarifa, "punta": tarifa, "nevera_refrescos": tarifa},
                 "by_sede": {}}))
        db.commit()
    finally:
        db.close()


for slug, nombre in [("mercafresco", "MercaFresco"), ("zafironoct", "Zafiro Nocturno")]:
    if buscar(slug) is None:
        crear_cliente(slug, nombre)

sembrar("mercafresco", {"NAVE": NAVE, "SUR": SUR}, CONTRATOS, EXTRA, tarifa=TARIFA_SECRETA)
sembrar("zafironoct", {"ZAF": ZAF}, CONTRATOS_ZAF)

# ── Usuarios, membresías y fundaciones: para /adopcion y la cola ──────────
reg = sesion_registro()
try:
    for slug, login_hace, alta_hace in [("mercafresco", 2, 400), ("zafironoct", 95, 20)]:
        u = Usuario(firebase_uid=f"uid-{slug}", email=f"duena@{slug}.example", nombre=None,
                    ultimo_login=None if login_hace is None else HOY - timedelta(days=login_hace))
        reg.add(u); reg.flush()
        reg.add(Membresia(usuario_id=u.id, cliente_slug=slug, rol="owner", activo=True))
        reg.add(Fundacion(usuario_id=u.id, cliente_slug=slug,
                          creado_en=HOY - timedelta(days=alta_hace)))
    reg.commit()
finally:
    reg.close()

db = SessionLocal()
tok = create_token("worker", epoca_de(db, "worker"), "plataforma", sub=1,
                   email="operador@ejemplo.com")
db.close()
with open(os.path.join(SP, "token-frontera.txt"), "w") as fh:
    fh.write(tok)
print("PERIODO:", P, "· TARIFA SECRETA:", int(TARIFA_SECRETA), "· TOKEN OK")
