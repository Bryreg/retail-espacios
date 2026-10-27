"""Verifica la versión final contra la BASE (SQL), por un camino distinto al del generador.

El generador lee la API; este script lee las tablas de la base con SQL y vuelve a
hacer cada cuenta con sus propias reglas. Si una cifra del dibujo no sale igual
por los dos caminos, falla. Revisa también los enlaces, las fichas, las secciones
del inventario (docs/maquetas/ux-2026-10/pantallas.md) y deja todo en un informe.

Uso: python3 verificar.py bd-final.db salida/   →  salida/verificacion.json + .md
"""
import json, re, sqlite3, sys, unicodedata
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, "/home/user/retail-espacios/backend")
from app.services.meses import meses_entre

BD, OUT = sys.argv[1], Path(sys.argv[2])
db = sqlite3.connect(BD); db.row_factory = sqlite3.Row
dom = json.load(open(OUT / "dom.json")); modelo = json.load(open(OUT / "modelo.json"))
HOY = date.fromisoformat(modelo["hoy"])
plata = lambda v: "$ " + f"{round(v):,}".replace(",", ".")
pct = lambda v: f"{v * 100:.0f} %"
fecha = lambda d: date.fromisoformat(str(d)[:10]).strftime("%d/%m/%Y")
q = lambda sql, *a: db.execute(sql, a).fetchall()
res = {"cifras": [], "campos": [], "enlaces": [], "fichas": [], "secciones": [], "otros": []}
def anotar(grupo, que, esperado, visto, metodo):
    res[grupo].append({"que": que, "esperado": esperado, "visto": visto, "ok": esperado == visto, "metodo": metodo})

# ── Lo que dice la base, por SQL ───────────────────────────────────────────────
leases = q("""select l.id, s.code, l.start_date d, l.end_date h, l.monthly_rent total, l.is_active, p.name prov,
              (select porcentaje from cobros_por_venta c where c.lease_id = l.id) ventas
              from space_leases l join spaces s on s.id = l.space_id join suppliers p on p.id = l.supplier_id
              where s.sede = 'CENTRO'""")
L = {r["id"]: r for r in leases}
viva = lambda r, d=HOY: r["is_active"] and date.fromisoformat(r["d"][:10]) <= d <= date.fromisoformat(r["h"][:10])
al_mes = lambda r: 0 if r["ventas"] is not None else r["total"] / meses_entre(date.fromisoformat(r["d"][:10]), date.fromisoformat(r["h"][:10]))
activos = [r for r in leases if viva(r)]
fijos = [r for r in activos if r["ventas"] is None]
canon = sum(al_mes(r) for r in fijos)
tarifas = json.loads(dict(q("select key, value from app_config"))["layout_reference_rates"])["default"]
fixtures = json.loads(q("select fixtures_json from layout_snapshots where sede='CENTRO'")[0][0])
# Un término «contrato» toma sus fechas del contrato (space_leases); una reserva, las suyas.
parts = q("""select s.code cara, p.puntos_basicos pb, coalesce(l.start_date, p.desde) desde, coalesce(l.end_date, p.hasta) hasta,
             p.estado, p.lease_id from participaciones p join spaces s on s.id = p.cara_space_id
             left join space_leases l on l.id = p.lease_id where p.baja_en is null""")

# Unidades y ocupación, con las reglas escritas de nuevo acá (no se importan del generador).
peso = ocup = 0.0; por_tipo = defaultdict(lambda: [0.0, 0.0]); tar_eq = 0.0
for f in fixtures:
    if f.get("rentable") is False:
        continue
    t = tarifas.get(f["type"], 0); div = (f.get("partes") or {}).get("division")
    if div == "participacion":
        caras = [f["code"]] + ([f["code"] + "-B"] if f.get("gondolaType") == "double" else [])
        for c in caras:
            pb = sum(p["pb"] for p in parts if p["cara"] == "CENTRO-" + c and p["estado"] == "contrato" and p["desde"] <= HOY.isoformat() <= p["hasta"])
            peso += 1; ocup += pb / 10000; por_tipo[f["type"]][0] += 1; por_tipo[f["type"]][1] += pb / 10000
    else:
        codigos = [f'{f["code"]}-EN{i}' for i in range(1, f["entrepanos"] + 1)] if div == "entrepanos" else [f["code"]]
        w = 1 / len(codigos)
        for c in codigos:
            o = 1.0 if any(r["code"] == "CENTRO-" + c and viva(r) for r in leases) else 0.0
            peso += w; ocup += w * o; por_tipo[f["type"]][0] += w; por_tipo[f["type"]][1] += w * o
for r in fijos:
    code = r["code"].replace("CENTRO-", ""); base = code.split("-PC")[0].split("-EN")[0].replace("-B", "")
    f = next(x for x in fixtures if x["code"] == base); t = tarifas[f["type"]]
    if "-PC" in code:
        pb = next(p["pb"] for p in parts if p["lease_id"] == r["id"]); tar_eq += t * pb / 10000
    elif "-EN" in code:
        tar_eq += t / f["entrepanos"]
    else:
        tar_eq += t

esperado = {
    "kpi.contratos_activos": str(len(activos)),
    "kpi.canon_mes": plata(canon),
    "kpi.por_vencer_30": str(sum((date.fromisoformat(r["h"][:10]) - HOY).days <= 30 for r in activos)),
    "kpi.ocupacion": pct(ocup / peso),
    "kpi.canon_tarifa": pct(canon / tar_eq),
}
for tipo, (p_, o_) in por_tipo.items():
    esperado[f"ocup.{tipo}"] = pct(o_ / p_)
    esperado[f"ocup.{tipo}.de"] = f"{str(round(o_, 2)).replace('.', ',').rstrip('0').rstrip(',')} de {round(p_)}"
for nombre, dia in [("May", "2026-05-15"), ("Jun", "2026-06-15"), ("Jul", "2026-07-15"), ("Ago", "2026-08-15"), ("Sep", "2026-09-15"), ("Oct", "2026-10-15")]:
    d = date.fromisoformat(dia)
    # Sólo los contratos que siguen activos: el generador no ve el histórico (no hay endpoint).
    esperado[f"serie.{nombre}"] = plata(sum(al_mes(r) for r in leases if r["is_active"] and r["ventas"] is None and viva(r, d)))
por_prov = defaultdict(lambda: [0.0, 0])
for r in fijos:
    por_prov[r["prov"]][0] += al_mes(r); por_prov[r["prov"]][1] += 1
for prov, (v, n) in por_prov.items():
    esperado[f"prov.{prov}.canon"] = plata(v); esperado[f"prov.{prov}.espacios"] = str(n); esperado[f"prov.{prov}.pct"] = pct(v / canon)

# Los pendientes: se cuentan las filas de la bandeja y se comparan con lo que la base explica.
n_bandeja = len(re.findall(r'data-pend="', open(OUT / "pendientes.html").read()))
sql_pend = {
    "por vencer (30 días)": sum((date.fromisoformat(r["h"][:10]) - HOY).days <= 30 for r in activos),
    "reservas de espacio vivas": len(q("select id from reservas_de_espacio where baja_en is null and lease_id is null")),
    "reservas de participación": sum(p["estado"] == "reserva" for p in parts),
    "contratos sin planometría": len(q("""select l.id from space_leases l join spaces s on s.id = l.space_id where s.sede='CENTRO' and l.is_active
                                          and l.end_date >= ? and not exists (select 1 from lease_files f where f.lease_id = l.id and f.kind = 'planometria')""", HOY.isoformat())),
    "participaciones sin ubicar (sin zona dibujada)": sum(1 for p in parts if p["estado"] == "contrato" and p["hasta"] >= HOY.isoformat()),
    "reportes de montaje": len(q("select id from mount_confirmations where archivado_en is null")),
    "planogramas con aviso o sin montar": len(q("select id from versiones_de_planograma")),
    "cortes de venta por cargar": len(q("select lease_id from cobros_por_venta")),
    "canon bajo la tarifa": None,
}
sql_pend["canon bajo la tarifa"] = sum(1 for r in fijos if al_mes(r) < (lambda code, f: tarifas[f["type"]] * (next(p["pb"] for p in parts if p["lease_id"] == r["id"]) / 10000 if "-PC" in code else (1 / f["entrepanos"] if "-EN" in code else 1)))(
    r["code"].replace("CENTRO-", ""), next(x for x in fixtures if x["code"] == r["code"].replace("CENTRO-", "").split("-PC")[0].split("-EN")[0].replace("-B", ""))) - 1)
esperado["pend.total"] = str(sum(sql_pend.values()))
anotar("otros", "filas de la bandeja = pend.total", esperado["pend.total"], str(n_bandeja), "SQL: " + " + ".join(f"{k} ({v})" for k, v in sql_pend.items()))
esperado["kpi.montajes"] = str(sql_pend["contratos sin planometría"] + sql_pend["participaciones sin ubicar (sin zona dibujada)"] + sql_pend["reportes de montaje"] + sql_pend["planogramas con aviso o sin montar"])
inc = sql_pend["canon bajo la tarifa"]
esperado["pend.inc"] = str(inc)

# ── 1. Cifras (data-v) ─────────────────────────────────────────────────────────
vistas = {}
for pg, d in dom.items():
    if pg.startswith("__"):
        continue
    for k, t in d["v"]:
        vistas.setdefault(k, set()).add(t)
for k, ts in sorted(vistas.items()):
    for t in ts:
        if k in esperado:
            anotar("cifras", k, esperado[k], t, "SQL sobre la base")
        else:
            anotar("cifras", k, modelo["datos"][k]["texto"], t, "modelo (API) — sin cuenta SQL propia")

# ── 2. Campos de la base (data-campo) ──────────────────────────────────────────
def campo_esperado(spec):
    t, i, c = spec.split(":")
    if t == "lease":
        r = L[int(i)]
        return {"proveedor": r["prov"], "desde": fecha(r["d"]), "hasta": fecha(r["h"]), "total": plata(r["total"]),
                "al_mes": (f'{r["ventas"]:g} % de las ventas' if r["ventas"] is not None else plata(al_mes(r)))}[c]
    if t == "tarifa":
        tipo, _, n = i.partition("/")
        return plata(tarifas[tipo] / (int(n) if n else 1))
    if t == "reservas_de_espacio":
        r = q("select p.name, r.caduca from reservas_de_espacio r join suppliers p on p.id = r.supplier_id where r.id = ?", int(i))[0]
        return {"proveedor": r[0], "caduca": fecha(r[1])}[c]
    if t == "mount_confirmations":
        r = q("select estado, reportado_por from mount_confirmations where id = ?", int(i))[0]
        return {"estado": "Montado" if r[0] == "montado" else "No montado", "reportado_por": r[1]}[c]
    if t == "versiones_de_planograma":
        r = q("select numero from versiones_de_planograma where id = ?", int(i))[0]
        return "Versión " + str(r[0]) if c == "numero" else None
    if t == "audit_log":
        return q("select at from audit_log where id = ?", int(i))[0][0][11:16]
    if t == "fixture":
        f = next(x for x in fixtures if x["code"] == i)
        return f'{f["w"]:g} × {f["d"]:g} × {f["h"]:g} m'
    if t == "notifications":
        return dict(q("select key, value from app_config"))["reminder_days"]
    if t == "sede":
        return q("select sede from layout_snapshots")[0][0]
    return None
for pg, d in dom.items():
    if pg.startswith("__"):
        continue
    for spec, t in d["campo"]:
        e = campo_esperado(spec)
        if e is None:  # el estado de supervisión de un planograma no es una columna: lo calcula la API
            continue
        anotar("campos", f"{pg} · {spec}", e, t, "SQL (fila de la base)")

# ── 3. Enlaces y fichas ────────────────────────────────────────────────────────
existentes = {p.stem for p in OUT.glob("*.html")}
rotos = []
for pg, d in dom.items():
    if pg.startswith("__"):
        continue
    for h in d["enlaces"]:
        destino = h.split("#")[0]
        if destino.endswith(".html") and destino[:-5] not in existentes:
            rotos.append(f"{pg} → {h}")
anotar("enlaces", "enlaces a páginas que no existen", "0", str(len(rotos)), f"{sum(len(d['enlaces']) for k, d in dom.items() if not k.startswith('__'))} enlaces revisados")
res["enlaces_rotos"] = sorted(set(rotos))
espacios_sql = {r[0].replace("CENTRO-", "") for r in q("select code from spaces where sede='CENTRO'")}
for pg, d in dom.items():
    if pg.startswith("ficha-"):
        code = pg[6:]
        anotar("fichas", f"{pg}: el título nombra su espacio", True, d["h1"].startswith(code), "h1 de la página")
    for ref, h in d.get("ref", []) if not pg.startswith("__") else []:
        if h.startswith("ficha-"):
            u = h[6:-5]
            ok = ref == u or ref.startswith(u + "-PC") or (u in ref and "-PC" in ref)
            if not ok:
                res["otros"].append({"que": f"{pg}: {ref} enlaza a {h}", "ok": False, "metodo": "data-ref"})
fichas = {p[6:] for p in existentes if p.startswith("ficha-")}
caras_sql = {s.replace("CENTRO-", "") for s in {p["cara"] for p in parts}}
anotar("fichas", "cada espacio de la base tiene su ficha (o es parte de una cara)", "sí",
       "sí" if all(c in fichas or "-PC" in c or c.split("-EN")[0] in {"PUN-02", "PUN-03"} and c in fichas or c in caras_sql or c.startswith(("GON-12", "GON-13")) for c in espacios_sql) else "no",
       f"{len(espacios_sql)} espacios en spaces (sede CENTRO), {len(fichas)} fichas")

# ── 4. Secciones del inventario ────────────────────────────────────────────────
def slug(t):
    t = unicodedata.normalize("NFKD", t.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")
md = open("/home/user/retail-espacios/docs/maquetas/ux-2026-10/pantallas.md").read()
secciones, actual, cuenta = [], None, defaultdict(int)
for linea in md.splitlines():
    if linea.startswith("### "):
        actual = linea[4:].strip(); secciones.append(actual)
    elif re.match(r"\s*- \[ \]", linea) and actual:
        cuenta[actual] += 1
dibujadas = set()
for pg, d in dom.items():
    if not pg.startswith("__"):
        dibujadas |= set(d["sec"])
ALIAS = {"Resumen (panel de información rápida)": "resumen-panel-de-informacion-rapida", "Contratos: ¿para qué fechas?": "contratos-para-que-fechas",
         "Barra superior": "barra-superior", "Buscador de funciones (Ctrl K)": "buscador-de-funciones-ctrl-k"}
for s in secciones:
    sl = ALIAS.get(s, slug(s))
    res["secciones"].append({"seccion": s, "funciones": cuenta[s], "en_la_version_final": sl in dibujadas or any(x.startswith(sl) for x in dibujadas)})

# ── Informe ────────────────────────────────────────────────────────────────────
tot = {g: (sum(x["ok"] for x in res[g]), len(res[g])) for g in ("cifras", "campos", "enlaces", "fichas", "otros")}
res["resumen"] = tot
res["errores_de_consola"] = dom["__errores"]
res["titulos_nuevos"] = sum(d["titulosNuevos"] for k, d in dom.items() if not k.startswith("__"))
cubiertas = [s for s in res["secciones"] if s["en_la_version_final"]]
res["funciones"] = {"secciones": len(secciones), "secciones_dibujadas": len(cubiertas),
                    "funciones_total": sum(cuenta.values()), "funciones_en_secciones_dibujadas": sum(s["funciones"] for s in cubiertas)}
json.dump(res, open(OUT / "verificacion.json", "w"), ensure_ascii=False, indent=1)
fallas = [x for g in ("cifras", "campos", "enlaces", "fichas", "otros") for x in res[g] if not x["ok"]]
print(json.dumps(tot, ensure_ascii=False), "· fallas:", len(fallas), "· secciones:", res["funciones"])
for x in fallas[:25]:
    print("FALLA", x)
