"""El modelo del dibujo final: TODO sale de la API real de RECABRA.

Pide los endpoints que usa la app, arma las unidades vendibles desde el plano
(GET /api/layout/CENTRO) y calcula cada cifra con una fórmula escrita al lado.
La cuenta de meses es la de la app (``backend/app/services/meses.py``), no una
copia. Escribe ``modelo.json``: cada dato con su valor, su texto, su fuente y
su fórmula, para que el verificador lo vuelva a sacar por otro camino (SQL).

Uso: python3 modelo.py http://127.0.0.1:8744 salida/modelo.json
"""
import json, sys, urllib.request
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, "/home/user/retail-espacios/backend")
from app.services.meses import meses_entre  # la cuenta de la app

API, SALIDA = sys.argv[1], sys.argv[2]


def pedir(ruta, tok=None, cuerpo=None):
    r = urllib.request.Request(API + ruta, data=json.dumps(cuerpo).encode() if cuerpo else None,
                               method="POST" if cuerpo else "GET")
    r.add_header("content-type", "application/json")
    if tok:
        r.add_header("authorization", "Bearer " + tok)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())


TOK = pedir("/api/auth/login", cuerpo={"password": "admin123", "cliente": "galerias"})["token"]
CRUDO = {}
def get(ruta):
    CRUDO[ruta] = pedir(ruta, TOK)
    return CRUDO[ruta]

layout = get("/api/layout/CENTRO")
tarifas = get("/api/layout/rates")
comercial = get("/api/spaces/comercial")
resumen = get("/api/participaciones/resumen?sede=CENTRO")
reservas = get("/api/reservas")
pendientes_m = get("/api/montajes/pendientes")
reportes = get("/api/mounts/")
plan_sup = get("/api/planogramas/supervision?sede=CENTRO")
plan_res = get("/api/planogramas/resumen?sede=CENTRO")
cobros = get("/api/cobros/pendientes")
proveedores = get("/api/suppliers/")
bitacora = get("/api/bitacora/")
impacto = get("/api/layout/CENTRO/impact")
HOY = date.fromisoformat(resumen["hoy"])

M = {}  # clave → {valor, texto, fuente, formula}
def dato(clave, valor, texto, fuente, formula=""):
    M[clave] = {"valor": valor, "texto": texto, "fuente": fuente, "formula": formula}
    return M[clave]

def plata(v):
    return "$ " + f"{round(v):,}".replace(",", ".")
def pct(v, dec=0):
    return (f"{v * 100:.{dec}f}".replace(".", ",")) + " %"
def fecha(d):
    return date.fromisoformat(d).strftime("%d/%m/%Y")

# ── Muebles y unidades vendibles (desde el plano) ─────────────────────────────
TIPO_TARIFA = {"punta": "punta", "gondola": "gondola", "nevera_puertas": "nevera_puertas"}
muebles = layout["fixtures"]
caras_part = {c["codigo_cara"].replace("CENTRO-", ""): c for c in resumen["caras"]}
unidades = []  # cada una: código, mueble, tipo, peso (en caras), tarifa al mes
for f in muebles:
    if f.get("rentable") is False:
        continue
    tarifa = tarifas["default"].get(TIPO_TARIFA[f["type"]], 0)
    division = (f.get("partes") or {}).get("division")
    if division == "participacion":
        for cara in ([f["code"]] + ([f["code"] + "-B"] if f.get("gondolaType") == "double" else [])):
            unidades.append({"codigo": cara, "mueble": f["code"], "forma": "cara", "tipo": f["type"], "peso": 1.0, "tarifa": tarifa})
    elif division == "entrepanos":
        n = f["entrepanos"]
        for i in range(1, n + 1):
            unidades.append({"codigo": f'{f["code"]}-EN{i}', "mueble": f["code"], "forma": "entrepaño", "tipo": f["type"], "peso": 1 / n, "tarifa": tarifa / n})
    else:
        unidades.append({"codigo": f["code"], "mueble": f["code"], "forma": "entera", "tipo": f["type"], "peso": 1.0, "tarifa": tarifa})

# ── Contratos vivos (GET /api/spaces/comercial + GET /api/contratos/{id}/edicion) ─
contratos = []
for codigo, c in comercial.items():
    if not c.get("leaseId"):
        continue
    ed = get(f'/api/contratos/{c["leaseId"]}/edicion')
    corto = codigo.replace("CENTRO-", "")
    meses = meses_entre(date.fromisoformat(c["startDate"]), date.fromisoformat(c["endDate"]))
    ventas = bool(ed.get("cobro"))  # la edición trae `cobro` sólo si cobra por % de las ventas
    pb = ed.get("puntos_basicos")
    cara = ed["cara"].replace("CENTRO-", "")
    contratos.append({
        "lease_id": c["leaseId"], "codigo": corto, "cara": cara, "forma": ed["forma"], "pb": pb,
        "proveedor": c["supplierName"], "marca": c["brandCategory"], "desde": c["startDate"], "hasta": c["endDate"],
        "total": c["negotiatedValue"], "meses": meses, "al_mes": 0 if ventas else c["negotiatedValue"] / meses,
        "ventas": ed["cobro"] if ventas else None, "planometria": ed.get("planometria"),
        "activo": date.fromisoformat(c["startDate"]) <= HOY <= date.fromisoformat(c["endDate"]),
        "arranca_en": (date.fromisoformat(c["startDate"]) - HOY).days,
        "vence_en": (date.fromisoformat(c["endDate"]) - HOY).days,
    })
contratos.sort(key=lambda x: x["lease_id"])
activos = [c for c in contratos if c["activo"]]
fijos = [c for c in activos if not c["ventas"]]

# ── Estado de cada unidad hoy ─────────────────────────────────────────────────
reserva_de = {r["espacio"].replace("CENTRO-", ""): r for r in reservas}
for u in unidades:
    if u["forma"] == "cara":
        cp = caras_part.get(u["codigo"], {})
        comp = cp.get("comprometido_dia_pb", 0)
        u["ocupado"] = comp / 10000
        u["disponible_pb"] = cp.get("disponible_pb", 10000)
        u["participaciones"] = cp.get("participaciones", [])
        reservada = any(p["estado_visible"] == "reserva" for p in u["participaciones"])
        u["estado"] = "ocupado" if comp >= 10000 else ("parcial" if comp > 0 else ("reservado" if reservada else "libre"))
        vivos = [c for c in activos if c["cara"] == u["codigo"]]
        u["hasta"] = min((c["hasta"] for c in vivos), default=None)
    else:
        c = next((c for c in contratos if c["codigo"] == u["codigo"]), None)
        r = reserva_de.get(u["codigo"])
        u["contrato"] = c["lease_id"] if c else None
        if c and c["activo"]:
            u["ocupado"], u["estado"] = 1.0, ("por_vencer" if c["vence_en"] <= 30 else "ocupado")
        elif c:
            u["ocupado"], u["estado"] = 0.0, "proximo"
        elif r:
            u["ocupado"], u["estado"] = 0.0, "reservado"
        else:
            u["ocupado"], u["estado"] = 0.0, "libre"
        u["hasta"] = c["hasta"] if c else None

# ── Cifras del Resumen (cada una con su fórmula) ──────────────────────────────
dato("kpi.contratos_activos", len(activos), str(len(activos)), "GET /api/spaces/comercial",
     "contratos con leaseId y startDate ≤ hoy ≤ endDate")
canon = sum(c["al_mes"] for c in fijos)
dato("kpi.canon_mes", round(canon), plata(canon), "GET /api/spaces/comercial + services/meses.py",
     "Σ negotiatedValue ÷ meses_entre(startDate, endDate) de los contratos activos con precio fijo")
venc30 = [c for c in activos if c["vence_en"] <= 30]
dato("kpi.por_vencer_30", len(venc30), str(len(venc30)), "GET /api/spaces/comercial", "contratos activos con endDate − hoy ≤ 30 días")
peso = sum(u["peso"] for u in unidades); ocup = sum(u["peso"] * u["ocupado"] for u in unidades)
dato("kpi.ocupacion", round(ocup / peso, 4), pct(ocup / peso), "GET /api/layout/CENTRO + /api/spaces/comercial + /api/participaciones/resumen",
     "Σ (peso × ocupado) ÷ Σ peso; peso: punta entera 1, entrepaño 1/n, cara 1; ocupado de una cara = comprometido_dia_pb ÷ 10000")
tar_eq = 0.0
for c in fijos:
    u = next(u for u in unidades if u["codigo"] in (c["codigo"], c["cara"]))
    tar_eq += u["tarifa"] * ((c["pb"] or 10000) / 10000 if u["forma"] == "cara" else 1)
dato("kpi.canon_tarifa", round(canon / tar_eq, 4), pct(canon / tar_eq), "GET /api/layout/rates + /api/spaces/comercial",
     "canon del mes ÷ Σ tarifa de referencia de lo contratado (cara: tarifa × pb ÷ 10000; entrepaño: tarifa ÷ n)")
for tipo, nombre in [("gondola", "Caras de góndola"), ("punta", "Puntas de góndola"), ("nevera_puertas", "Neveras")]:
    us = [u for u in unidades if u["tipo"] == tipo]
    p_, o_ = sum(u["peso"] for u in us), sum(u["peso"] * u["ocupado"] for u in us)
    dato(f"ocup.{tipo}", round(o_ / p_, 4), pct(o_ / p_), "GET /api/layout/CENTRO + /api/participaciones/resumen", f"ocupación de {nombre.lower()}")
    dato(f"ocup.{tipo}.de", [round(o_, 2), round(p_, 2)], f"{str(round(o_, 2)).replace('.', ',').rstrip('0').rstrip(',')} de {round(p_)}", "ídem", "caras ocupadas de caras")

# Canon por mes (mayo–octubre 2026): contratos vivos el día 15 de cada mes.
MESES = [("May", "2026-05-15"), ("Jun", "2026-06-15"), ("Jul", "2026-07-15"), ("Ago", "2026-08-15"), ("Sep", "2026-09-15"), ("Oct", "2026-10-15")]
serie = []
for nombre, dia in MESES:
    d = date.fromisoformat(dia)
    v = sum(c["al_mes"] for c in contratos if not c["ventas"] and date.fromisoformat(c["desde"]) <= d <= date.fromisoformat(c["hasta"]))
    serie.append([nombre, round(v)])
    dato(f"serie.{nombre}", round(v), plata(v), "GET /api/spaces/comercial", f"Σ al mes de los contratos vivos el {fecha(dia)} (sólo los que siguen vivos o arrancaron: el histórico terminado no tiene endpoint)")

# Quién paga el canon.
por_prov = defaultdict(lambda: [0.0, 0])
for c in fijos:
    por_prov[c["proveedor"]][0] += c["al_mes"]; por_prov[c["proveedor"]][1] += 1
ranking = sorted(por_prov.items(), key=lambda x: -x[1][0])
for i, (prov, (v, n)) in enumerate(ranking):
    dato(f"prov.{prov}.canon", round(v), plata(v), "GET /api/spaces/comercial", f"Σ al mes de los contratos activos de {prov}")
    dato(f"prov.{prov}.espacios", n, str(n), "GET /api/spaces/comercial", "contratos activos con precio fijo")
    dato(f"prov.{prov}.pct", round(v / canon, 4), pct(v / canon), "ídem", "canon del proveedor ÷ canon del mes")

# ── Pendientes (lo que arma la bandeja) ───────────────────────────────────────
pend = []
for c in venc30:
    pend.append({"tipo": "Contrato por vencer", "codigo": c["codigo"], "det": f'{c["proveedor"]} · vence el {fecha(c["hasta"])}', "estado": f'Vence en {c["vence_en"]} días', "tono": "crit", "accion": "Renovar", "fuente": "GET /api/spaces/comercial", "grupo": "hoy" if c["vence_en"] <= 7 else "30"})
for r in reservas:
    dias = (date.fromisoformat(r["caduca"]) - HOY).days
    pend.append({"tipo": "Reserva por confirmar", "codigo": r["espacio"].replace("CENTRO-", ""), "det": f'{r["proveedor"]} · caduca el {fecha(r["caduca"])}', "estado": "Caduca hoy" if dias == 0 else f"Caduca en {dias} días", "tono": "crit" if dias == 0 else "warn", "accion": "Confirmar", "fuente": "GET /api/reservas", "grupo": "hoy" if dias == 0 else "30"})
for u in unidades:
    for p in u.get("participaciones", []):
        if p["estado_visible"] == "reserva":
            dias = (date.fromisoformat(p["caduca"]) - HOY).days if p.get("caduca") else None
            pend.append({"tipo": "Reserva de participación", "codigo": u["codigo"], "det": f'{p["proveedor"]} · {p["puntos_basicos"] // 100} % · caduca el {fecha(p["caduca"])}', "estado": f"Caduca en {dias} días", "tono": "warn", "accion": "Confirmar", "fuente": "GET /api/participaciones/resumen", "grupo": "30"})
for m in pendientes_m:
    cod = m["espacio"].replace("CENTRO-", "")
    if m["falta_planometria"]:
        pend.append({"tipo": "Falta planometría", "codigo": cod, "det": m["proveedor"], "estado": "Sin archivo", "tono": "warn", "accion": "Adjuntar", "fuente": "GET /api/montajes/pendientes", "grupo": "hoy" if m["dias_para_empezar"] <= 0 else "30"})
    if m["falta_distribucion"]:
        pend.append({"tipo": "Participación sin ubicar", "codigo": cod, "det": f'{m["proveedor"]} · {m["cara"].replace("CENTRO-", "")}', "estado": "Falta ubicar la zona", "tono": "warn", "accion": "Ubicar", "fuente": "GET /api/montajes/pendientes", "grupo": "30"})
for r in reportes:
    cod = r["space_code"].replace("CENTRO-", "")
    if r["estado"] == "no_montado":
        pend.append({"tipo": "Montaje no realizado", "codigo": cod, "det": f'{r["nota"]}', "estado": "Faltó el material", "tono": "crit", "accion": "Resolver", "fuente": "GET /api/mounts/", "grupo": "hoy"})
    else:
        pend.append({"tipo": "Montado, sin verificar", "codigo": cod, "det": f'Reportó {r["reportado_por"]} · con foto', "estado": "Por verificar", "tono": "warn", "accion": "Verificar", "fuente": "GET /api/mounts/ (la verificación del contrato es nueva)", "grupo": "hoy"})
EST_PLAN = {"por_revisar": ("Planograma montado, falta revisar", "Revisar", "warn"), "sin_montar": ("Planograma sin montar", "Enviar guía", "neu"),
            "no_se_pudo": ("Planograma no montado", "Resolver", "crit"), "no_coincide": ("Planograma que no coincide", "Ver revisión", "crit")}
for c in plan_sup["caras"]:
    if c["estado"] in EST_PLAN:
        t, a, tono = EST_PLAN[c["estado"]]
        det = c["aviso"]["motivo_legible"] if c.get("aviso") and c["aviso"].get("motivo_legible") else (c["revision"]["nota"] if c.get("revision") else f'Rige desde el {fecha(c["rige_desde"])}')
        pend.append({"tipo": t, "codigo": f'{c["codigo"]}-{c["cara"]}', "det": det, "estado": c["estado"].replace("_", " "), "tono": tono, "accion": a, "fuente": "GET /api/planogramas/supervision", "grupo": "hoy"})
for c in cobros:
    pend.append({"tipo": "Ventas por cargar", "codigo": c["espacio"].replace("CENTRO-", ""), "det": f'{c["proveedor"]} · {str(c["porcentaje"]).replace(".0", "")} % · {fecha(c["periodo_desde"])} a {fecha(c["periodo_hasta"])}', "estado": "Período cerrado", "tono": "warn", "accion": "Cargar ventas", "fuente": "GET /api/cobros/pendientes", "grupo": "hoy"})
# Inconsistencias: canon bajo la tarifa (contrato fijo por debajo de su tarifa de referencia),
# precio sin forma (GET /api/contratos/precio-sin-forma) y contratos que sólo viven en el plano.
inconsistencias = []
for c in fijos:
    u = next(u for u in unidades if u["codigo"] in (c["codigo"], c["cara"]))
    ref = u["tarifa"] * ((c["pb"] or 10000) / 10000 if u["forma"] == "cara" else 1)
    if c["al_mes"] < ref - 1:
        inconsistencias.append({"tipo": "Canon bajo la tarifa", "codigo": c["codigo"], "lease_id": c["lease_id"],
            "det": f'{c["proveedor"]} paga {plata(c["al_mes"])} al mes; la tarifa es {plata(ref)}', "accion": "Editar contrato", "fuente": "GET /api/spaces/comercial + /api/layout/rates"})
sin_forma = get("/api/contratos/precio-sin-forma?sede=CENTRO")["contratos"]
solo_plano = get("/api/layout/importacion/previo")
for c in sin_forma:
    inconsistencias.append({"tipo": "Canon sin base", "codigo": str(c), "det": "", "accion": "Es al mes / Es el total", "fuente": "GET /api/contratos/precio-sin-forma"})
for c in solo_plano.get("importables", []):
    inconsistencias.append({"tipo": "Contrato que sólo vive en el plano", "codigo": str(c), "det": "", "accion": "Pasarlo a la base", "fuente": "GET /api/layout/importacion/previo"})
for i in inconsistencias:
    pend.append({**i, "estado": "Inconsistencia", "tono": "crit", "grupo": "inc"})
dato("pend.inc", len(inconsistencias), str(len(inconsistencias)), "ver cada una", "canon bajo la tarifa + precio sin forma + contratos sólo en el plano")
dato("pend.30", sum(p["grupo"] == "30" for p in pend), str(sum(p["grupo"] == "30" for p in pend)), "ídem", "pendientes de los próximos 30 días")
# Caras de planograma (las piezas, para dibujarlas tal como están guardadas).
caras_plan = {}
for c in plan_sup["caras"]:
    caras_plan[f'{c["codigo"]}-{c["cara"]}'] = get(f'/api/planogramas/cara?sede=CENTRO&fixture_id={c["fixture_id"]}&cara={c["cara"]}')
caras_part_det = {}
for u in unidades:
    if u["forma"] == "cara":
        caras_part_det[u["codigo"]] = get(f'/api/participaciones/cara?sede=CENTRO&espacio=CENTRO-{u["codigo"]}')
notif = get("/api/notifications/config"); equipo = get("/api/usuarios")
dato("pend.total", len(pend), str(len(pend)), "suma de las listas de abajo", "contratos por vencer + reservas + montajes pendientes + reportes + planogramas + cobros")
dato("pend.hoy", sum(p["grupo"] == "hoy" for p in pend), str(sum(p["grupo"] == "hoy" for p in pend)), "ídem", "pendientes con fecha límite hoy o ya vencida")
mont_tipos = {"Falta planometría", "Participación sin ubicar", "Montaje no realizado", "Montado, sin verificar", "Planograma montado, falta revisar", "Planograma sin montar", "Planograma no montado", "Planograma que no coincide"}
mont = [p for p in pend if p["tipo"] in mont_tipos]
dato("kpi.montajes", len(mont), str(len(mont)), "GET /api/montajes/pendientes + /api/mounts/ + /api/planogramas/supervision", "montajes y planogramas que piden una acción")

modelo = {"hoy": HOY.isoformat(), "sede": "CENTRO", "muebles": muebles, "unidades": unidades, "contratos": contratos,
          "reservas": reservas, "pendientes": pend, "serie": serie, "ranking": [[p, round(v), n] for p, (v, n) in ranking],
          "planogramas": plan_sup["caras"], "planogramas_resumen": plan_res, "reportes": reportes, "cobros": cobros,
          "tarifas": tarifas, "proveedores": proveedores, "bitacora": bitacora[:40], "impacto": impacto,
          "participaciones": resumen["caras"], "inconsistencias": inconsistencias, "caras_plan": caras_plan,
          "caras_part": caras_part_det, "avisos": notif, "equipo": equipo, "datos": M, "fuentes": sorted(CRUDO)}
json.dump(modelo, open(SALIDA, "w"), ensure_ascii=False, indent=1)
json.dump(CRUDO, open(SALIDA.replace("modelo.json", "api-crudo.json"), "w"), ensure_ascii=False)
print(f"{len(unidades)} unidades · {len(contratos)} contratos ({len(activos)} activos) · {len(pend)} pendientes · {len(M)} datos con fuente")
for k in ["kpi.contratos_activos", "kpi.canon_mes", "kpi.por_vencer_30", "kpi.ocupacion", "kpi.canon_tarifa", "kpi.montajes", "pend.total", "pend.hoy"]:
    print(k, M[k]["texto"])
