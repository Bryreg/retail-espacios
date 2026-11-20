"""Lo que el manual del DUEÑO necesita encima de la siembra de siempre
(`herramientas/sembrar.py`), contra `servidor-duenio.py` (tokens de prueba):

- La dueña de Galerías («Diana Prueba», cuenta propia, membresía `owner`): la
  invita el ingreso por clave —que, sin persona, puede invitar dueños— y ella
  acepta con su cuenta.
- Su equipo: una administradora y un trabajador que ya entraron, un trabajador
  desactivado (se fue) y una invitación pendiente.
- Un segundo supermercado de la misma dueña, dado de alta por ella, con su
  suscripción y una cuenta de cobro: así se ven «Suscripción» y el elegir
  supermercado al entrar.

Todo por la API. Correos inventados (`.example`). Deja `sesion-duenia-<puerto>.json`
con los ingresos que usan las capturas.

    python sembrar-duenio.py http://127.0.0.1:8793 <ruta de manual.db>
"""
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

API = sys.argv[1]
BD = sys.argv[2]
AQUI = Path(__file__).resolve().parent
PUERTO = API.rsplit(":", 1)[-1].strip("/")


def pedir(metodo, ruta, cuerpo=None, token=None, ok=(200, 201, 204)):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    r = urllib.request.Request(API + ruta, data=datos, method=metodo)
    if datos is not None:
        r.add_header("content-type", "application/json")
    if token:
        r.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{metodo} {ruta} → {e.code} {e.read().decode()[:600]}")


def token_de_invitacion(correo):
    with sqlite3.connect(BD) as cx:
        fila = cx.execute("SELECT token FROM invitaciones WHERE email=? AND usada_en IS NULL "
                          "ORDER BY id DESC LIMIT 1", (correo,)).fetchone()
    return fila[0]


def entrar(correo, nombre, invitacion=None, cliente=None):
    cuerpo = {"id_token": f"prueba:{correo}:{nombre}", "acepta_politica": True}
    if invitacion:
        cuerpo["invitacion"] = invitacion
    if cliente:
        cuerpo["cliente"] = cliente
    s = pedir("POST", "/api/auth/oauth", cuerpo)
    if s.get("token") and s.get("pedir_consentimiento"):
        pedir("POST", "/api/auth/aceptar-politica", {}, s["token"])
    return s


LEGADO = pedir("POST", "/api/auth/login", {"password": "admin-manual"})["token"]
DUENIA = ("diana.duena@supermercado.example", "Diana Prueba")

# 1. La dueña, invitada por la clave maestra de la instalación.
pedir("POST", "/api/usuarios/invitar", {"email": DUENIA[0], "rol": "owner"}, LEGADO)
duenia = entrar(*DUENIA, invitacion=token_de_invitacion(DUENIA[0]))
TOK = duenia["token"]

# 2. El equipo: invita la dueña, y entran.
equipo = [("ana.admin@supermercado.example", "Ana Prueba", "admin"),
          ("luis.tienda@supermercado.example", "Luis Prueba", "worker"),
          ("marta.tienda@supermercado.example", "Marta Prueba", "worker")]
for correo, nombre, rol in equipo:
    pedir("POST", "/api/usuarios/invitar", {"email": correo, "rol": rol}, TOK)
    entrar(correo, nombre, invitacion=token_de_invitacion(correo))
# Marta se fue: desactivada.
miembros = pedir("GET", "/api/usuarios", None, TOK)["miembros"]
marta = next(m for m in miembros if m["email"].startswith("marta"))
pedir("PATCH", f"/api/usuarios/{marta['id']}", {"activo": False}, TOK)
# Una invitación que todavía nadie aceptó.
pedir("POST", "/api/usuarios/invitar", {"email": "pedro.nuevo@supermercado.example", "rol": "worker"}, TOK)

# 3. El segundo supermercado de la dueña, con su suscripción.
alta = pedir("POST", "/api/clientes/alta", {
    "id_token": f"prueba:{DUENIA[0]}:{DUENIA[1]}", "slug": "norte_prueba",
    "nombre": "Supermercado Norte (prueba)", "acepta_politica": True, "acepta_terminos": True})
op = entrar("operador@recabra.example", "Operador de prueba")
hoy = date.today()
pedir("PUT", "/api/plataforma/clientes/norte_prueba/suscripcion", {
    "modo": "manual", "valor_cop": 450000, "plazo_pago_dias": 30,
    "razon_social": "Supermercado Norte de Prueba S.A.S.", "nit": "900000000-1",
    "correo_facturacion": DUENIA[0], "municipio": "Bogotá D.C.",
    "retefuente_pct": 4.0, "reteica_pct": 0.966}, op["token"])
mes = hoy.replace(day=1)
pedir("POST", "/api/plataforma/clientes/norte_prueba/facturas", {
    "periodo": mes.strftime("%Y-%m"), "numero": "PRUEBA-0001",
    "emitida_el": mes.isoformat(), "vence_el": (mes + timedelta(days=30)).isoformat()}, op["token"])

# El supermercado nuevo, en gracia por la cuenta de cobro: así se ve la franja
# de «pago pendiente» (el motivo lo ve sólo la dueña).
pedir("PATCH", "/api/plataforma/clientes/norte_prueba",
      {"estado": "gracia", "motivo": "Cuenta de cobro PRUEBA-0001 por pagar"}, op["token"])

# 4. La dueña vuelve a entrar en Galerías (ya tiene dos supermercados).
final = entrar(*DUENIA, cliente="galerias")
(AQUI / f".sesion-duenia-{PUERTO}.json").write_text(json.dumps(
    {"galerias": final, "norte": entrar(*DUENIA, cliente="norte_prueba")}, ensure_ascii=False, indent=1))
print("listo: dueña, equipo de 4, invitación pendiente, segundo supermercado con suscripción")
