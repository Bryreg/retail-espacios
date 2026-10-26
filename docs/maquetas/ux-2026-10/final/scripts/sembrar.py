"""Siembra la base del dibujo final SÓLO con la API real de RECABRA.

Nada se escribe en la base a mano: el plano, las tarifas, los contratos, las
reservas, las participaciones, los planogramas y los avisos de montaje entran
por los mismos endpoints que usa la app (POST /api/contratos/vender, PUT
/api/layout/CENTRO, …). Así cada fila del dibujo es una fila de verdad, con
sus llaves foráneas, y la app la ve igual.

Uso: python3 sembrar.py http://127.0.0.1:8744
"""
import json, math, sys, urllib.request, urllib.error
from datetime import date

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8744"


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


TOK = pedir("POST", "/api/auth/login", {"password": "admin123", "cliente": "galerias"})["token"]
api = lambda m, ruta, c=None: pedir(m, ruta, c, TOK)

# ── 1. El plano de CENTRO (metros; rotY en radianes) ───────────────────────────
#   Sala de 40 × 20 m. Cuatro góndolas dobles en vertical con sus puntas arriba y
#   abajo, dos góndolas de la casa arriba, una punta junto a la entrada y la nevera
#   contra la pared derecha. Pasillos anchos (lo que pediste del plano).
V = math.pi / 2
def m(code, tipo, label, cx, cz, w, d, h, rot=0.0, **extra):
    return {"id": f"f-{code}", "code": code, "sede": "CENTRO", "type": tipo, "label": label,
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
api("PUT", "/api/layout/CENTRO", {"fixtures": fixtures})

# ── 2. Tarifas de referencia (canon mensual por tipo de mueble) ────────────────
api("PUT", "/api/layout/rates", {"default": {"gondola": 450000, "punta": 600000, "nevera_puertas": 1400000}, "by_sede": {}})

# ── 3. Contratos, participaciones y reservas por «Vender» ──────────────────────
def meses(desde, hasta):
    from datetime import timedelta
    a, b = date.fromisoformat(desde), date.fromisoformat(hasta) + timedelta(days=1)
    return (b.year - a.year) * 12 + (b.month - a.month)          # sólo plazos de meses enteros

def vender(proveedor, correo, marca, desde, hasta, lineas, tipo="contrato", caduca=None, cobro=None):
    cuerpo = {"sede": "CENTRO", "proveedor": proveedor, "correo": correo, "marca": marca,
              "desde": desde, "hasta": hasta, "tipo": tipo, "lineas": lineas}
    if caduca:
        cuerpo["caduca"] = caduca
    if cobro:
        cuerpo["cobro"] = cobro
    return api("POST", "/api/contratos/vender", cuerpo)

def entero(espacio, al_mes, desde, hasta):
    return {"espacio": f"CENTRO-{espacio}", "valor": al_mes * meses(desde, hasta), "modo_precio": "mensual", "valor_tecleado": al_mes}

def parte(cara, pb, al_mes, desde, hasta):
    return {"participacion": {"cara": f"CENTRO-{cara}", "puntos_basicos": pb, "renueva": None},
            "valor": al_mes * meses(desde, hasta), "modo_precio": "mensual", "valor_tecleado": al_mes}

P = {  # proveedor → (correo, marca)
    "Galletas Sol": ("compras@galletassol.co", "Galletas Sol Clásicas"),
    "Lácteos Andinos": ("comercial@lacteosandinos.co", "Yogur Andino"),
    "Café Montaña": ("ventas@cafemontana.co", "Café Montaña Tostado"),
    "Aseo Total": ("trade@aseototal.co", "Aseo Total Hogar"),
    "Snacks Norte": ("mercadeo@snacksnorte.co", "Papitas Norte"),
    "Limpio Hogar": ("compras@limpiohogar.co", "Limpio Hogar"),
    "Bebidas del Valle": ("trade@bebidasvalle.co", "Agua del Valle"),
}
def contrato(prov, desde, hasta, *lineas, **kw):
    correo, marca = P[prov]
    return vender(prov, correo, marca, desde, hasta, list(lineas), **kw)

# Un contrato que ya terminó (PUN-08 queda libre desde el 01/10/2026).
contrato("Café Montaña", "2026-04-01", "2026-09-30", entero("PUN-08", 600000, "2026-04-01", "2026-09-30"))
# Espacios enteros.
contrato("Galletas Sol", "2026-05-01", "2026-10-31", entero("PUN-07", 600000, "2026-05-01", "2026-10-31"))
contrato("Limpio Hogar", "2026-06-01", "2026-11-30", entero("PUN-01", 600000, "2026-06-01", "2026-11-30"))
contrato("Galletas Sol", "2026-10-01", "2027-03-31", entero("PUN-05", 650000, "2026-10-01", "2027-03-31"))
contrato("Snacks Norte", "2026-09-01", "2027-02-28", entero("PUN-04", 600000, "2026-09-01", "2027-02-28"))
contrato("Bebidas del Valle", "2026-08-01", "2027-01-31", entero("PUN-06", 550000, "2026-08-01", "2027-01-31"))
# Entrepaños de las puntas PUN-02 y PUN-03.
contrato("Snacks Norte", "2026-10-01", "2026-12-31", entero("PUN-02-EN1", 150000, "2026-10-01", "2026-12-31"))
contrato("Café Montaña", "2026-10-01", "2026-12-31", entero("PUN-02-EN2", 150000, "2026-10-01", "2026-12-31"))
contrato("Café Montaña", "2026-11-01", "2027-01-31", entero("PUN-03-EN1", 130000, "2026-11-01", "2027-01-31"))
# Por % de las ventas (5 %, corte mensual): queda «Ventas por cargar».
correo, marca = P["Bebidas del Valle"]
vender("Bebidas del Valle", correo, marca, "2026-09-01", "2027-02-28",
       [{"espacio": "CENTRO-PUN-03-EN2", "valor": 0}], cobro={"modo": "ventas", "porcentaje": 5, "corte": "mensual"})
# Participaciones de cara.
contrato("Café Montaña", "2026-06-01", "2027-05-31", parte("GON-03-B", 10000, 450000, "2026-06-01", "2027-05-31"))
contrato("Lácteos Andinos", "2026-10-01", "2027-03-31", parte("GON-03", 2500, 120000, "2026-10-01", "2027-03-31"))
contrato("Snacks Norte", "2026-09-01", "2027-02-28", parte("GON-03", 3000, 140000, "2026-09-01", "2027-02-28"))
contrato("Aseo Total", "2026-07-01", "2026-12-31", parte("GON-03", 2500, 115000, "2026-07-01", "2026-12-31"))
contrato("Aseo Total", "2026-05-01", "2026-11-30", parte("GON-04", 10000, 450000, "2026-05-01", "2026-11-30"))
contrato("Aseo Total", "2026-10-01", "2027-03-31", parte("GON-02", 5000, 225000, "2026-10-01", "2027-03-31"))
contrato("Lácteos Andinos", "2026-08-01", "2027-01-31", parte("GON-01", 6000, 270000, "2026-08-01", "2027-01-31"))
contrato("Galletas Sol", "2026-09-01", "2027-02-28", parte("GON-01-B", 4000, 180000, "2026-09-01", "2027-02-28"))
contrato("Lácteos Andinos", "2026-07-01", "2027-06-30", parte("NEV-01", 5000, 700000, "2026-07-01", "2027-06-30"))
contrato("Bebidas del Valle", "2026-09-01", "2027-02-28", parte("NEV-01", 3000, 420000, "2026-09-01", "2027-02-28"))
# Reservas provisionales: una caduca hoy, otra en 10 días.
hoy = date.today().isoformat()
contrato("Lácteos Andinos", "2026-11-01", "2027-01-31", entero("PUN-09", 600000, "2026-11-01", "2027-01-31"),
         tipo="reserva", caduca=hoy)
contrato("Snacks Norte", "2026-11-01", "2027-04-30", parte("GON-02-B", 3000, 135000, "2026-11-01", "2027-04-30"),
         tipo="reserva", caduca="2026-11-05")

# ── 4. Planogramas de las góndolas de la casa (GON-12 y GON-13) ────────────────
destinos = {}
for nombre, tipo, color in [("Arroz La Esquina", "marca_propia", "d2"), ("Aceites", "categoria", "d1"),
                            ("Pastas", "categoria", "d4"), ("Granos 2×1", "promocion", "d3")]:
    destinos[nombre] = api("POST", "/api/planogramas/destinos", {"sede": "CENTRO", "nombre": nombre, "tipo": tipo, "color": color})["id"]
def u_util(c, frac):
    """La u (0–1 a lo ancho de la cara) donde se junta ``frac`` del ancho ÚTIL:
    los parantes que informa el servidor (``superficie.exclusiones``) no cuentan."""
    par = sorted((e["u0"], e["u1"]) for e in c["superficie"]["exclusiones"] if e["por"] == "parante")
    util_total = 1 - sum(b - a for a, b in par)
    falta, u = frac * util_total, 0.0
    for a, b in par + [(1.0, 1.0)]:
        tramo = a - u
        if falta <= tramo:
            return round(u + falta, 6)
        falta -= tramo; u = b
    return 1.0
def publicar(fixture, cara, piezas_pb):
    c = api("GET", f"/api/planogramas/cara?sede=CENTRO&fixture_id={fixture}&cara={cara}")
    v0_, v1_ = 0.066667, 0.944444
    piezas, desde = [], 0
    for destino_id, pb in piezas_pb:
        a, b = u_util(c, desde / 10000), u_util(c, (desde + pb) / 10000)
        piezas.append({"destino_id": destino_id, "pb": pb, "vertices": [[a, v0_], [b, v0_], [b, v1_], [a, v1_]]}); desde += pb
    base = {"sede": "CENTRO", "fixture_id": fixture, "cara": cara}
    v0 = c["planograma"]["version"]
    api("PUT", "/api/planogramas/borrador", {**base, "version": v0, "piezas": piezas})
    return api("POST", "/api/planogramas/publicar", {**base, "version": v0 + 1, "rige_desde": hoy})["planograma"]["vigente"]["id"]
def piezas(*pares):
    return [(destinos[nombre], pb) for nombre, pb in pares]
v12a = publicar("f-GON-12", "A", piezas(("Arroz La Esquina", 3000), ("Aceites", 2500), ("Pastas", 2500), ("Granos 2×1", 2000)))
v12b = publicar("f-GON-12", "B", piezas(("Arroz La Esquina", 5000), ("Granos 2×1", 3000)))
v13a = publicar("f-GON-13", "A", piezas(("Pastas", 6000)))
v13b = publicar("f-GON-13", "B", piezas(("Granos 2×1", 3000), ("Arroz La Esquina", 4000)))

# Avisos del encargado por el enlace de la guía (el mismo camino que el teléfono).
def enlace(vid):
    url = api("POST", "/api/planogramas/guia/enlace", {"version_id": vid})["url"]
    return url.split("t=")[1]
def avisar(vid, cuerpo):
    pedir("POST", f"/api/guia/aviso?token={enlace(vid)}", cuerpo)
avisar(v12a, {"estado": "montada"})
avisar(v13a, {"estado": "no_se_pudo", "motivo": "sin_producto", "nota": "La marca propia llega el lunes"})
avisar(v13b, {"estado": "montada"})
api("POST", "/api/planogramas/supervision/revisar",
    {"version_id": v13b, "resultado": "no_coincide", "numeros": [1], "nota": "Granos va a la derecha de Arroz", "reenviar": False})

print("listo:", len(fixtures), "muebles ·", json.dumps({k: v for k, v in destinos.items()}, ensure_ascii=False))

# ── 5. Planometrías y reportes de montaje de los contratos ─────────────────────
import uuid
def multipart(campos, archivo=None):
    limite = uuid.uuid4().hex; partes = []
    for k, v in campos.items():
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    if archivo:
        nombre, campo, datos, tipo = archivo
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{campo}"; filename="{nombre}"\r\nContent-Type: {tipo}\r\n\r\n'.encode() + datos + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    return b"".join(partes), f"multipart/form-data; boundary={limite}"
FOTO = open(__file__.replace("sembrar.py", "foto-montada.jpg"), "rb").read()
comercial = api("GET", "/api/spaces/comercial")
lease_de = {k.replace("CENTRO-", ""): v["leaseId"] for k, v in comercial.items() if v.get("leaseId")}
def planometria(codigo):
    cuerpo, tipo = multipart({"subido_por": "Brayan Moreno"}, ("planometria.jpg", "file", FOTO, "image/jpeg"))
    pedir("POST", f"/api/leases/{lease_de[codigo]}/planometria", crudo=cuerpo, token=TOK, tipo=tipo)
con_planometria = [c for c in lease_de if c not in ("GON-02-PC1", "PUN-03-EN1", "PUN-03-EN2")]
for c in con_planometria:
    planometria(c)
def reportar(codigo, estado, motivo=None, nota=None, foto=True):
    campos = {"estado": estado, "space_code": f"CENTRO-{codigo}", "reportado_por": "Luis Pérez"}
    if motivo: campos["motivo"] = motivo
    if nota: campos["nota"] = nota
    cuerpo, tipo = multipart(campos, ("montaje.jpg", "foto", FOTO, "image/jpeg") if foto else None)
    pedir("POST", "/api/montaje/reportar", crudo=cuerpo, token=TOK, tipo=tipo)
reportar("PUN-05", "montado")
reportar("PUN-04", "montado")
reportar("PUN-07", "montado")
reportar("PUN-02-EN2", "no_montado", "sin_material", "El exhibidor del proveedor no llegó", foto=False)
print("planometrías:", len(con_planometria), "· reportes: 4 ·", sorted(lease_de))
