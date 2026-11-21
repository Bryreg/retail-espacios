"""La sede de prueba de los manuales de RECABRA, sembrada SÓLO con la API real.

Nada se escribe en la base a mano: el plano, las tarifas, los contratos, las
reservas, las participaciones, los planogramas y los montajes entran por los
mismos endpoints que usa la app. Las fechas salen de HOY (el mes en curso y los
de alrededor), así que el manual se puede volver a capturar cualquier día y las
pantallas dicen lo mismo: algo vence este mes, algo ya terminó, algo se monta hoy.

Todo es de prueba: proveedores, marcas, correos y personas inventados
(«Ana Prueba», «Luis Prueba»), sin datos personales reales.

Uso (con el servidor de `servidor.sh` arriba):
    python3 sembrar.py http://127.0.0.1:8790
"""
import calendar
import json
import math
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790"
CLAVE_ADMIN = sys.argv[2] if len(sys.argv) > 2 else "admin-manual"
SEDE = "CENTRO"
AQUI = Path(__file__).resolve().parent


def pedir(metodo, ruta, cuerpo=None, token=None, crudo=None, tipo="application/json"):
    datos = crudo if crudo is not None else (json.dumps(cuerpo).encode() if cuerpo is not None else None)
    r = urllib.request.Request(API + ruta, data=datos, method=metodo)
    if datos is not None:
        r.add_header("content-type", tipo)
    if token:
        r.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{metodo} {ruta} → {e.code} {e.read().decode()[:600]}")


TOK = pedir("POST", "/api/auth/login", {"password": CLAVE_ADMIN})["token"]
api = lambda m, ruta, c=None: pedir(m, ruta, c, TOK)  # noqa: E731

# ── Fechas: todo relativo a hoy ────────────────────────────────────────────────
# El servidor trabaja con el día de Colombia; con date.today() en UTC, entre
# las 19:00 y las 24:00 de Colombia la siembra pedía fechas de «mañana».
HOY = datetime.now(ZoneInfo("America/Bogota")).date()


def mes(k: int) -> date:
    """El primer día del mes ``k`` meses desde el actual."""
    t = HOY.month - 1 + k
    return date(HOY.year + t // 12, t % 12 + 1, 1)


def fin(k: int) -> date:
    d = mes(k)
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


iso = lambda d: d.isoformat()  # noqa: E731

# ── 1. El plano de CENTRO (metros; rotY en radianes) ───────────────────────────
V = math.pi / 2


def m(code, tipo, label, cx, cz, w, d, h, rot=0.0, **extra):
    return {"id": f"f-{code}", "code": code, "sede": SEDE, "type": tipo, "label": label,
            "cx": cx, "cz": cz, "rotY": rot, "w": w, "d": d, "h": h, **extra}


GON = dict(gondolaType="double", partes={"division": "participacion"}, color="#818cf8")
fixtures = [
    m("GON-12", "gondola", "Góndola de la casa", 11.8, 2.7, 11.6, 1.2, 1.8, gondolaType="double", rentable=False, entrepanos=5),
    m("GON-13", "gondola", "Góndola de la casa", 28.2, 2.7, 11.6, 1.2, 1.8, gondolaType="double", rentable=False, entrepanos=4),
]
for i, x in enumerate([9.2, 15.6, 22.0, 28.4]):
    fixtures.append(m(f"GON-0{i + 1}", "gondola", "Góndola doble", x, 10.32, 7.2, 1.6, 1.8, V, **GON))
for i, x in enumerate([9.2, 15.6, 22.0, 28.4]):
    arriba, abajo = f"PUN-0{2 * i + 1}", f"PUN-0{2 * i + 2}"
    extra_a = {"entrepanos": 5, "partes": {"division": "entrepanos"}} if arriba == "PUN-03" else {}
    extra_b = {"entrepanos": 4, "partes": {"division": "entrepanos"}} if abajo == "PUN-02" else {}
    fixtures.append(m(arriba, "punta", "Punta de góndola", x, 5.96, 1.6, 1.0, 1.8, **extra_a))
    fixtures.append(m(abajo, "punta", "Punta de góndola", x, 14.68, 1.6, 1.0, 1.8, **extra_b))
fixtures.append(m("PUN-09", "punta", "Punta de góndola", 33.3, 18.1, 1.6, 1.0, 1.8))
fixtures.append(m("NEV-01", "nevera_puertas", "Nevera de puertas", 37.5, 10.8, 10.4, 1.3, 2.1, V,
                  partes={"division": "participacion"}))
api("PUT", f"/api/layout/{SEDE}", {"fixtures": fixtures})
ajustes = api("GET", "/api/layout/settings")
api("PUT", "/api/layout/settings", {"sedes": sorted(set((ajustes.get("sedes") or []) + [SEDE])),
                                     "catalog_labels": ajustes.get("catalog_labels") or {},
                                     "base_updated_at": ajustes.get("updated_at")})

# Quién recibe los avisos de la sede (correos inventados): así el servidor arma
# el correo «por montar» como en la tienda y queda en la cola de correos.
api("PUT", "/api/notifications/contacts", {
    "gerente": ["gerencia@supermercado.example"],
    "by_sede": {SEDE: {"admin": ["admin.centro@supermercado.example"],
                       "mercaderista": ["montaje.centro@supermercado.example"]}}})

# ── 2. Tarifas de referencia (canon mensual por tipo de mueble) ────────────────
api("PUT", "/api/layout/rates", {"default": {"gondola": 450000, "punta": 600000, "nevera_puertas": 1400000}, "by_sede": {}})

# ── 3. Contratos, participaciones y reservas por «Vender» ──────────────────────
P = {  # proveedor → (correo, marca); todo inventado
    "Galletas Sol": ("compras@galletassol.example", "Galletas Sol Clásicas"),
    "Lácteos Andinos": ("comercial@lacteosandinos.example", "Yogur Andino"),
    "Café Montaña": ("ventas@cafemontana.example", "Café Montaña Tostado"),
    "Aseo Total": ("trade@aseototal.example", "Aseo Total Hogar"),
    "Snacks Norte": ("mercadeo@snacksnorte.example", "Papitas Norte"),
    "Limpio Hogar": ("compras@limpiohogar.example", "Limpio Hogar"),
    "Bebidas del Valle": ("trade@bebidasvalle.example", "Agua del Valle"),
}


def meses_enteros(desde: date, hasta: date) -> int:
    b = hasta + timedelta(days=1)
    return (b.year - desde.year) * 12 + (b.month - desde.month)


def entero(espacio, al_mes, desde, hasta):
    return {"espacio": f"{SEDE}-{espacio}", "valor": al_mes * meses_enteros(desde, hasta),
            "modo_precio": "mensual", "valor_tecleado": al_mes}


def parte(cara, pb, al_mes, desde, hasta):
    return {"participacion": {"cara": f"{SEDE}-{cara}", "puntos_basicos": pb, "renueva": None},
            "valor": al_mes * meses_enteros(desde, hasta), "modo_precio": "mensual", "valor_tecleado": al_mes}


def contrato(prov, desde, hasta, linea, tipo="contrato", caduca=None, cobro=None):
    correo, marca = P[prov]
    cuerpo = {"sede": SEDE, "proveedor": prov, "correo": correo, "marca": marca,
              "desde": iso(desde), "hasta": iso(hasta), "tipo": tipo, "lineas": [linea]}
    if caduca:
        cuerpo["caduca"] = iso(caduca)
    if cobro:
        cuerpo["cobro"] = cobro
    return api("POST", "/api/contratos/vender", cuerpo)


def c(prov, k0, k1, espacio, al_mes, **kw):
    """Un espacio entero del mes ``k0`` al fin del mes ``k1``."""
    return contrato(prov, mes(k0), fin(k1), entero(espacio, al_mes, mes(k0), fin(k1)), **kw)


def pc(prov, k0, k1, cara, pb, al_mes, **kw):
    return contrato(prov, mes(k0), fin(k1), parte(cara, pb, al_mes, mes(k0), fin(k1)), **kw)


# Lo que ya terminó: el historial (PUN-08 y PUN-07 quedan libres).
c("Café Montaña", -8, -3, "PUN-08", 580000)
c("Galletas Sol", -14, -9, "PUN-08", 550000)
c("Galletas Sol", -7, -1, "PUN-07", 600000)
c("Snacks Norte", -13, -8, "PUN-07", 560000)
# Espacios enteros vivos. PUN-01 vence este mes (sale en «Por vencer»).
c("Limpio Hogar", -5, 0, "PUN-01", 600000)
c("Galletas Sol", -1, 4, "PUN-05", 650000)
c("Snacks Norte", -2, 3, "PUN-04", 600000)
c("Bebidas del Valle", -3, 2, "PUN-06", 550000)
# Entrepaños de las puntas PUN-02 y PUN-03.
c("Snacks Norte", -1, 1, "PUN-02-EN1", 150000)
c("Café Montaña", -1, 1, "PUN-02-EN2", 150000)
# Uno que arranca HOY: lo que se monta hoy.
contrato("Café Montaña", HOY, fin(2), {"espacio": f"{SEDE}-PUN-03-EN1", "valor": 300000,
                                         "modo_precio": "total", "valor_tecleado": 300000})
# Por % de las ventas (5 %, corte mensual).
correo, marca = P["Bebidas del Valle"]
api("POST", "/api/contratos/vender", {
    "sede": SEDE, "proveedor": "Bebidas del Valle", "correo": correo, "marca": marca,
    "desde": iso(mes(-2)), "hasta": iso(fin(3)), "tipo": "contrato",
    "lineas": [{"espacio": f"{SEDE}-PUN-03-EN2", "valor": 0}],
    "cobro": {"modo": "ventas", "porcentaje": 5, "corte": "mensual"}})
# Participaciones de cara.
pc("Café Montaña", -5, 6, "GON-03-B", 10000, 450000)
pc("Lácteos Andinos", -1, 4, "GON-03", 2500, 120000)
pc("Snacks Norte", -2, 3, "GON-03", 3000, 140000)
pc("Aseo Total", -4, 1, "GON-03", 2500, 115000)
pc("Aseo Total", -6, 0, "GON-04", 10000, 450000)
pc("Aseo Total", -1, 4, "GON-02", 5000, 225000)
pc("Lácteos Andinos", -3, 2, "GON-01", 6000, 270000)
pc("Galletas Sol", -2, 3, "GON-01-B", 4000, 180000)
pc("Lácteos Andinos", -4, 7, "NEV-01", 5000, 700000)
pc("Bebidas del Valle", -2, 3, "NEV-01", 3000, 420000)
# Reservas provisionales: una caduca hoy, otra en cinco días.
c("Lácteos Andinos", 1, 3, "PUN-09", 600000, tipo="reserva", caduca=HOY)
pc("Snacks Norte", 1, 6, "GON-02-B", 3000, 135000, tipo="reserva", caduca=HOY + timedelta(days=5))

# Un contrato cancelado (para el historial): se vende y se da de baja.
cancelado = c("Limpio Hogar", 2, 4, "PUN-08", 590000)
cid = cancelado["contratos"][0]["lease_id"]
espacio = api("GET", f"/api/spaces/by-code/{SEDE}-PUN-08")
api("DELETE", f"/api/spaces/{espacio['id']}/leases/{cid}")

# ── 4. Planogramas de las góndolas de la casa (GON-12 y GON-13) ────────────────
destinos = {}
for nombre, tipo, color in [("Arroz La Esquina", "marca_propia", "d2"), ("Aceites", "categoria", "d1"),
                            ("Pastas", "categoria", "d4"), ("Granos 2×1", "promocion", "d3")]:
    destinos[nombre] = api("POST", "/api/planogramas/destinos",
                           {"sede": SEDE, "nombre": nombre, "tipo": tipo, "color": color})["id"]


def u_util(cara, frac):
    par = sorted((e["u0"], e["u1"]) for e in cara["superficie"]["exclusiones"] if e["por"] == "parante")
    util_total = 1 - sum(b - a for a, b in par)
    falta, u = frac * util_total, 0.0
    for a, b in par + [(1.0, 1.0)]:
        tramo = a - u
        if falta <= tramo:
            return round(u + falta, 6)
        falta -= tramo
        u = b
    return 1.0


def publicar(fixture, cara, piezas_pb):
    cc = api("GET", f"/api/planogramas/cara?sede={SEDE}&fixture_id={fixture}&cara={cara}")
    v0_, v1_ = 0.066667, 0.944444
    piezas, desde = [], 0
    for destino_id, pb in piezas_pb:
        a, b = u_util(cc, desde / 10000), u_util(cc, (desde + pb) / 10000)
        piezas.append({"destino_id": destino_id, "pb": pb, "vertices": [[a, v0_], [b, v0_], [b, v1_], [a, v1_]]})
        desde += pb
    base = {"sede": SEDE, "fixture_id": fixture, "cara": cara}
    v0 = cc["planograma"]["version"]
    api("PUT", "/api/planogramas/borrador", {**base, "version": v0, "piezas": piezas})
    return api("POST", "/api/planogramas/publicar",
               {**base, "version": v0 + 1, "rige_desde": iso(HOY)})["planograma"]["vigente"]["id"]


def piezas(*pares):
    return [(destinos[nombre], pb) for nombre, pb in pares]


v12a = publicar("f-GON-12", "A", piezas(("Arroz La Esquina", 3000), ("Aceites", 2500), ("Pastas", 2500), ("Granos 2×1", 2000)))
v12b = publicar("f-GON-12", "B", piezas(("Arroz La Esquina", 5000), ("Granos 2×1", 3000)))
v13a = publicar("f-GON-13", "A", piezas(("Pastas", 6000)))
v13b = publicar("f-GON-13", "B", piezas(("Granos 2×1", 3000), ("Arroz La Esquina", 4000)))


def enlace_guia(vid):
    return api("POST", "/api/planogramas/guia/enlace", {"version_id": vid})["url"]


def avisar(vid, cuerpo):
    pedir("POST", f"/api/guia/aviso?token={enlace_guia(vid).split('t=')[1]}", cuerpo)


avisar(v13a, {"estado": "no_se_pudo", "motivo": "sin_producto", "nota": "La marca propia llega el lunes"})
avisar(v13b, {"estado": "montada"})

# ── 5. Planometrías y reportes de montaje de los contratos ─────────────────────


def multipart(campos, archivo=None):
    limite = uuid.uuid4().hex
    partes_ = []
    for k, v in campos.items():
        partes_.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    if archivo:
        nombre, campo, datos, tipo = archivo
        partes_.append(f'--{limite}\r\nContent-Disposition: form-data; name="{campo}"; filename="{nombre}"\r\n'
                       f'Content-Type: {tipo}\r\n\r\n'.encode() + datos + b"\r\n")
    partes_.append(f"--{limite}--\r\n".encode())
    return b"".join(partes_), f"multipart/form-data; boundary={limite}"


FOTO = (AQUI / "foto-de-prueba.jpg").read_bytes()
comercial = api("GET", "/api/spaces/comercial")
lease_de = {k.replace(f"{SEDE}-", ""): v["leaseId"] for k, v in comercial.items() if v.get("leaseId")}


def planometria(codigo):
    cuerpo, tipo = multipart({"subido_por": "Ana Prueba"}, ("planometria.jpg", "file", FOTO, "image/jpeg"))
    pedir("POST", f"/api/leases/{lease_de[codigo]}/planometria", crudo=cuerpo, token=TOK, tipo=tipo)


# Todos con planometría menos dos: así hay «falta planometría» en Montajes.
for codigo in lease_de:
    if codigo not in ("GON-02-PC1", "PUN-03-EN2"):
        planometria(codigo)


def reportar(codigo, estado, motivo=None, nota=None, foto=True):
    campos = {"estado": estado, "space_code": f"{SEDE}-{codigo}", "reportado_por": "Luis Prueba"}
    if motivo:
        campos["motivo"] = motivo
    if nota:
        campos["nota"] = nota
    cuerpo, tipo = multipart(campos, ("montaje.jpg", "foto", FOTO, "image/jpeg") if foto else None)
    pedir("POST", "/api/montaje/reportar", crudo=cuerpo, token=TOK, tipo=tipo)


# Lo que ya arrancó hace rato quedó montado y verificado; PUN-05 y PUN-04,
# montados sin verificar; PUN-02-EN2, no se pudo; PUN-03-EN1 arranca hoy (sin
# montar) y GON-02-PC1 y PUN-03-EN2 esperan su planometría.
SIN_TOCAR = {"PUN-03-EN1", "GON-02-PC1", "PUN-03-EN2", "PUN-02-EN2", "PUN-05", "PUN-04"}
for codigo in sorted(lease_de):
    if codigo not in SIN_TOCAR:
        reportar(codigo, "montado")
reportar("PUN-05", "montado")
reportar("PUN-04", "montado")
reportar("PUN-02-EN2", "no_montado", "sin_material", "El exhibidor del proveedor no llegó", foto=False)
for fila in api("GET", "/api/mounts/"):
    codigo = (fila.get("space_code") or "").replace(f"{SEDE}-", "")
    if fila.get("estado") == "montado" and codigo not in SIN_TOCAR and not fila.get("verificacion"):
        if codigo == "PUN-06":
            # Uno que hay que corregir: quien monta lo ve al abrir su enlace.
            api("POST", f"/api/mounts/{fila['id']}/verificar",
                {"resultado": "no_coincide", "nota": "Falta el cabezote con el logo arriba de la punta."})
        else:
            api("POST", f"/api/mounts/{fila['id']}/verificar", {"resultado": "coincide"})

# Lo que necesitan las capturas: el contrato de hoy (enlace de montaje) y la
# guía de un planograma sin aviso todavía (enlace de la guía).
salida = {
    "hoy": iso(HOY),
    "leases": lease_de,
    "guia_gon12a": enlace_guia(v12a),
    "guia_gon12b": enlace_guia(v12b),
}
(AQUI / f"datos-de-la-siembra-{API.rsplit(':', 1)[-1].strip('/')}.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1))
print("listo:", len(fixtures), "muebles ·", len(lease_de), "contratos vivos con mueble")
