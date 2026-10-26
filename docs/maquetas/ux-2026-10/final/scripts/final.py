"""Versión final del dibujo: pantallas HTML enlazadas, generadas SÓLO desde modelo.json.

Lo mejor de cada versión:
· el estilo «como la foto» (F) con el plano aireado (lo aprobado el 26/10);
· la escala responsive de un solo diseño (recabra.css, aprobada el 26/10);
· los 4 módulos + barra común + bandeja de Pendientes + ficha única (capas);
· disponibilidad por fechas antes de contratar (Contratos);
· Indicadores combinado: Resumen + detalle + diccionario de métricas.

Relacional y verificable:
· data-v="clave"      → una cifra del modelo (con fuente y fórmula en el diccionario);
· data-campo="t:id:c" → un campo de una fila de la base (lease:2:proveedor…);
· data-ref="CÓDIGO"   → un espacio: siempre enlaza a su ficha;
· data-sec="sección"  → la sección del inventario (pantallas.md) que dibuja.
El verificador recorre todo eso contra la base y la API.

Uso: python3 final.py salida/modelo.json salida/
"""
import contextlib, io, json, math, os, sys
from datetime import date, timedelta
from html import escape

sys.path.insert(0, "/home/user/retail-espacios/backend")
from app.services.meses import meses_entre

ARGS = sys.argv[1:3]
GEN = "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/dib-ux/gen"
_cwd = os.getcwd(); os.chdir(GEN); _argv = sys.argv; sys.path.insert(0, GEN)
sys.argv = ["foto.py", GEN + "/../tmp-resp"]
with contextlib.redirect_stdout(io.StringIO()):
    exec(open("foto.py").read())
sys.argv = _argv; os.chdir(_cwd)
M = json.load(open(ARGS[0])); OUT = ARGS[1]   # después del exec: foto.py tiene nombres propios

HOY = date.fromisoformat(M["hoy"]); D = M["datos"]
I = lambda n, s=18, c="currentColor", w=1.9: ico(n, s, c, w)
plata = lambda v: "$ " + f"{round(v):,}".replace(",", ".")
fecha = lambda d: date.fromisoformat(str(d)[:10]).strftime("%d/%m/%Y") if d else "—"
def V(clave):
    return f'<span data-v="{clave}">{escape(D[clave]["texto"])}</span>'
def C(tabla, ident, campo, texto):
    return f'<span data-campo="{tabla}:{ident}:{campo}">{escape(str(texto))}</span>'
UNI = {u["codigo"]: u for u in M["unidades"]}
CON = {c["lease_id"]: c for c in M["contratos"]}
MUE = {f["code"]: f for f in M["muebles"]}
def unidad_de(codigo):
    """El espacio vendible al que pertenece un código (GON-03-PC1 → GON-03)."""
    if codigo in UNI:
        return codigo
    for c in M["contratos"]:
        if c["codigo"] == codigo:
            return c["cara"] if c["cara"] in UNI else c["codigo"]
    base = codigo.rsplit("-PC", 1)[0]
    return base if base in UNI else None
def R(codigo, texto=None):
    u = unidad_de(codigo)
    destino = f"ficha-{u}.html" if u else (f"planograma-{codigo}.html" if codigo.startswith(("GON-12", "GON-13")) else "plano2d.html")
    return f'<a class="ref" href="{destino}" data-ref="{codigo}">{escape(texto or codigo)}</a>'
NOMBRE = {"punta": "Punta de góndola", "gondola": "Góndola doble", "nevera_puertas": "Nevera de puertas"}
def nombre_unidad(u):
    f = MUE[u["mueble"]]
    if u["forma"] == "cara":
        return f'{NOMBRE[f["type"]]} · cara {"B" if u["codigo"].endswith("-B") else "A"}'
    if u["forma"] == "entrepaño":
        return f'{NOMBRE[f["type"]]} · entrepaño {u["codigo"].rsplit("EN", 1)[1]} de {f["entrepanos"]}'
    return NOMBRE[f["type"]]
ESTADO = {"libre": ("ok", "Disponible"), "parcial": ("warn", "Disponible una parte"), "ocupado": ("crit", "Contratado"),
          "por_vencer": ("warn", "Por vencer"), "proximo": ("neu", "Contratado · arranca después"), "reservado": ("warn", "Reservado")}

# ── El armazón (el aprobado en el responsive) ─────────────────────────────────
NAVR = [("Inicio", "casa", "inicio"), ("Contratos", "contratos", "contratos"), ("Indicadores", "indicadores", "indicadores"),
        ("Montajes", "montajes", "montajes"), ("Plano de la sede", "plano", "plano2d")]
def pagina(nombre, activo, titulo, cuerpo, main_cls="", extra="", sec=""):
    nav = "".join(f'<a href="{h}.html" {"aria-current=page" if t == activo else ""}>{I(i)}<span>{t}</span></a>' for t, i, h in NAVR)
    abajo = "".join(f'<a href="{h}.html" {"aria-current=page" if t == activo else ""}>{I(i, 20)}<span>{"Plano" if t == "Plano de la sede" else t}</span></a>' for t, i, h in NAVR)
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RECABRA · {escape(titulo)}</title><link rel="stylesheet" href="recabra.css"><link rel="stylesheet" href="final.css"></head><body>
<div class="app" data-sec="barra-superior">
<aside class="lateral" aria-label="Navegación principal"><div class="marca">{I("lista", 20, "#0F172A", 2.2)}<b>RECABRA</b></div><nav class="nav">{nav}</nav>
<nav class="nav ajustes-nav"><a href="ajustes.html" {"aria-current=page" if activo == "Ajustes" else ""}>{I("ajustes")}<span>Ajustes</span></a></nav>
<div class="pie"><b>Supermercado La Esquina</b>Sede: <span data-campo="sede::nombre">CENTRO</span></div></aside>
<header class="superior">
<a class="btn suave menu-btn" href="ajustes.html" aria-label="Abrir el menú">{I("lista", 18)}<span>Menú</span></a>
<span class="marca-movil">RECABRA</span>
<a class="buscar" role="search" href="buscador.html">{I("buscar", 16, "#6B7280")}<span>Buscar espacios, contratos, proveedores… (Ctrl K)</span></a>
<span class="esp"></span>
<span class="guardado">{I("nube", 16, "#067647", 2)}<span class="txt">Guardado</span></span>
<a class="pend" href="pendientes.html">{I("campana", 19)}<span class="txt">Pendientes</span><span class="insignia">{V("pend.total")}</span></a>
<span class="persona"><span class="avatar" aria-label="Administrador">AD</span><span class="quien"><b>Administración</b><small>admin</small></span></span>
</header>
<main class="{main_cls}" data-sec="{sec}">{cuerpo}</main>
<nav class="abajo" aria-label="Módulos">{abajo}</nav>
</div>{extra}<script>if(innerWidth<640)document.querySelectorAll('.escena,.plano-env').forEach(e=>{{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2}})</script></body></html>'''
    open(f"{OUT}/{nombre}.html", "w").write(html)
    return nombre

cab = lambda t, p, acc="": f'<div class="cab"><div class="tit"><h1>{t}</h1><p>{p}</p></div><div class="acciones">{acc}</div></div>'
pil = lambda tono, t: f'<span class="pill {tono}">{escape(t)}</span>'
def ayuda(clave):
    return f'<a class="ayuda" href="diccionario.html#{clave}" title="{escape(D[clave]["formula"])}" aria-label="Cómo se calcula">?</a>'
def kpi(t, clave, linea="", tono="", clase_n=""):
    return f'<div class="tarjeta kpi {tono}"><span class="t">{t} {ayuda(clave)}</span><span class="n {clase_n}">{V(clave)}</span>{linea}</div>'
punto = lambda col: f'<span class="punto" style="background:{col}1F"><i style="background:{col}"></i></span>'
TONO_COL = {"crit": "#F04438", "warn": "#F79009", "neu": "#64748B", "ok": "#12B76A"}
def fila_pend(p):
    acc = (f'<a class="btn suave" href="contrato-{p["lease_id"]}.html">{p["accion"]}</a>' if p.get("lease_id")
           else f'<a class="btn suave" href="{destino_pend(p)}">{p["accion"]}</a>')
    return (f'<div data-pend="{escape(p["tipo"])}|{p["codigo"]}">{punto(TONO_COL[p["tono"]])}<span class="txt"><b>{escape(p["tipo"])}</b>'
            f'<span class="sub">{R(p["codigo"])} · {escape(p["det"])}</span></span><span class="estado {"rojo-t" if p["tono"] == "crit" else "ambar-t"}">{escape(p["estado"])}</span>{acc}</div>')
def destino_pend(p):
    if p["tipo"].startswith("Planograma"):
        return f'planograma-{p["codigo"]}.html'
    if p["tipo"] in ("Montado, sin verificar", "Montaje no realizado"):
        return f'montajes.html#{p["codigo"]}'
    if p["tipo"] == "Contrato por vencer":
        c = next(c for c in M["contratos"] if c["codigo"] == p["codigo"] and c["activo"])
        return f'contrato-{c["lease_id"]}.html'
    u = unidad_de(p["codigo"])
    return f"ficha-{u}.html" if u else "pendientes.html"

# ── El plano 2D desde GET /api/layout/CENTRO (metros → dibujo) ─────────────────
ESC = 25; ANCHO, ALTO = 40, 20
COL = {"libre": ("#ECFDF3", "#12B76A"), "parcial": ("#FFF8EB", "#F79009"), "ocupado": ("#FEF3F2", "#F04438"),
       "por_vencer": ("#FFF1E6", "#EA580C"), "proximo": ("#F4F3FF", "#7A5AF8"), "reservado": ("#FFFBEB", "#D97706"),
       "casa": ("#F2F4F7", "#98A2B3"), "sel": ("#EAF2FF", "#1570EF")}
def huella(f):
    rot = round((f["rotY"] % math.pi) / (math.pi / 2)) % 2 == 1
    w, d = (f["d"], f["w"]) if rot else (f["w"], f["d"])
    return (f["cx"] - w / 2) * ESC, (f["cz"] - d / 2) * ESC, w * ESC, d * ESC, rot
def estado_disp(u, rango=None):
    return u["estado"] if rango is None else disponibilidad(u, *rango)[0]
def plano(sel=None, rango=None, cotas=True, enlaces=True, recorte=False):
    g = [f'<rect x="0" y="0" width="{ANCHO * ESC}" height="{ALTO * ESC}" fill="#fff" stroke="#0F172A" stroke-width="1.6"/>',
         f'<path d="M{440} {ALTO * ESC} h120" stroke="#1570EF" stroke-width="3" stroke-dasharray="6 4"/><text x="500" y="{ALTO * ESC - 8}" text-anchor="middle" font-size="13" fill="#1570EF">Entrada</text>']
    if cotas:
        g.append(f'<text x="{ANCHO * ESC / 2}" y="-8" text-anchor="middle" font-size="13" fill="#667085">{ANCHO},00 m</text>'
                 f'<text x="{ANCHO * ESC + 14}" y="{ALTO * ESC / 2}" font-size="13" fill="#667085" transform="rotate(90 {ANCHO * ESC + 14} {ALTO * ESC / 2})" text-anchor="middle">{ALTO},00 m</text>')
    etiquetas = []
    for f in M["muebles"]:
        x, y, w, h, rot = huella(f)
        us = [u for u in M["unidades"] if u["mueble"] == f["code"]]
        trozos = []
        if not us:
            trozos = [(x, y, w, h, "casa")]
        elif us[0]["forma"] == "entrepaño":
            n = len(us)
            trozos = [(x + i * w / n, y, w / n, h, estado_disp(u, rango)) for i, u in enumerate(us)]
        elif us[0]["forma"] == "cara" and len(us) == 2:
            trozos = ([(x, y, w / 2, h, estado_disp(us[0], rango)), (x + w / 2, y, w / 2, h, estado_disp(us[1], rango))] if rot
                      else [(x, y, w, h / 2, estado_disp(us[0], rango)), (x, y + h / 2, w, h / 2, estado_disp(us[1], rango))])
        else:
            trozos = [(x, y, w, h, estado_disp(us[0], rango))]
        cuerpo = ""
        for (tx, ty, tw, th, est) in trozos:
            fondo, borde = COL["sel"] if sel == f["code"] else COL[est]
            cuerpo += f'<rect x="{tx:.1f}" y="{ty:.1f}" width="{tw:.1f}" height="{th:.1f}" rx="2" fill="{fondo}" stroke="{borde}" stroke-width="{2.4 if sel == f["code"] else 1.2}"/>'
        destino = f'mueble-{f["code"]}.html'
        cuerpo = f'<a href="{destino}" data-ref="{f["code"]}">{cuerpo}</a>' if enlaces else cuerpo
        g.append(cuerpo)
        cx_, cy_ = x + w / 2, y + h / 2
        if rot:
            etiquetas.append(f'<text x="{cx_:.1f}" y="{cy_:.1f}" font-size="19" font-weight="700" fill="#0F172A" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace,monospace" transform="rotate(-90 {cx_:.1f} {cy_:.1f})" paint-order="stroke" stroke="#fff" stroke-width="3">{f["code"]}</text>')
        else:
            dy = -7 if f["code"].startswith("PUN") and f["cz"] < 8 else (h + 19 if f["code"].startswith("PUN") else h / 2 + 6)
            ty = y + dy if f["code"].startswith("PUN") else cy_ + 5
            etiquetas.append(f'<text x="{cx_:.1f}" y="{ty:.1f}" font-size="17" font-weight="700" fill="#0F172A" text-anchor="middle" font-family="ui-monospace,monospace" paint-order="stroke" stroke="#fff" stroke-width="3">{f["code"]}</text>')
    vb = f"-30 -30 {ANCHO * ESC + 60} {ALTO * ESC + 50}"
    if recorte and sel:
        x, y, w, h, _ = huella(MUE[sel]); vb = f"{x + w / 2 - 200:.0f} {y + h / 2 - 125:.0f} 400 250"
    return (f'<svg viewBox="{vb}" role="img" aria-label="Plano de CENTRO desde GET /api/layout/CENTRO" data-fuente="GET /api/layout/CENTRO">'
            + "".join(g) + "".join(etiquetas) + "</svg>")
def leyenda(estados):
    nombres = {"libre": "Disponible", "parcial": "Disponible una parte", "ocupado": "Contratado", "por_vencer": "Por vencer (30 días)",
               "proximo": "Arranca después", "reservado": "Reservado", "casa": "De la casa (planograma)"}
    return '<div class="leyenda">' + "".join(f'<span><i style="background:{COL[e][1]}"></i>{nombres[e]}</span>' for e in estados) + "</div>"

# ── Disponibilidad para un rango de fechas (contratos + reservas + participaciones) ─
def solapa(a, b, c, d):
    return not (b < c or d < a)
def disponibilidad(u, desde, hasta):
    """(estado, desde_cuando_libre, detalle) de una unidad entre desde y hasta (ISO)."""
    if u["forma"] == "cara":
        dias, pico = (date.fromisoformat(hasta) - date.fromisoformat(desde)).days + 1, 0
        terms = [(c["desde"], c["hasta"], c["pb"] or 10000) for c in M["contratos"] if c["cara"] == u["codigo"]]
        terms += [(p["desde"], p["hasta"], p["puntos_basicos"]) for p in u.get("participaciones", []) if p["estado_visible"] == "reserva"]
        for i in range(dias):
            d = (date.fromisoformat(desde) + timedelta(days=i)).isoformat()
            pico = max(pico, sum(pb for a, b, pb in terms if a <= d <= b))
        if pico >= 10000:
            return "ocupado", None, "cara completa en esas fechas"
        return ("parcial" if pico else "libre"), None, f"queda {100 - pico // 100} % en el peor día"
    vivos = [c for c in M["contratos"] if c["codigo"] == u["codigo"] and solapa(c["desde"], c["hasta"], desde, hasta)]
    res = [r for r in M["reservas"] if r["espacio"] == "CENTRO-" + u["codigo"] and solapa(r["desde"], r["hasta"], desde, hasta)]
    if res:
        return "reservado", None, f'reservado por {res[0]["proveedor"]} hasta que caduque el {fecha(res[0]["caduca"])}'
    if not vivos:
        return "libre", None, "libre todas las fechas"
    fin = max(c["hasta"] for c in vivos)
    if fin < hasta and min(c["desde"] for c in vivos) <= desde:
        libre = (date.fromisoformat(fin) + timedelta(days=1)).isoformat()
        return "parcial", libre, f'se libera el {fecha(libre)}'
    return "ocupado", None, f'contratado hasta el {fecha(fin)}'

PAGINAS = []
def P(*a, **k):
    PAGINAS.append(pagina(*a, **k))

# ════════════════════════════ Inicio ══════════════════════════════════════════
act = [b for b in M["bitacora"] if b["accion"] not in ("login.ok",)][:7]
# Títulos legibles que la app todavía no tiene en GET /api/bitacora/acciones (hallazgo: ahí
# devuelven la clave cruda). Se marcan con data-titulo-nuevo para que el verificador los cuente.
TITULOS_NUEVOS = {"planograma.revision": "Planograma revisado", "guia.aviso": "Aviso del encargado", "planograma.publicado": "Planograma publicado",
                  "planograma.borrador": "Borrador de planograma", "destino.creado": "Destino de planograma creado"}
def fila_act(b):
    ent = b.get("detalle") or ""
    cod = next((u for u in sorted(UNI, key=len, reverse=True) if u in ent), None)
    hora = b["at"][11:16]
    return (f'<div>{punto("#12B76A" if "contrato" in b["accion"] or "participacion" in b["accion"] else "#1570EF")}<span class="txt"><b {"data-titulo-nuevo" if b["titulo"] == b["accion"] else ""}>{escape(TITULOS_NUEVOS.get(b["titulo"], b["titulo"]))}</b>'
            f'<span class="sub">{R(cod) + " · " if cod else ""}{escape(ent[:70])}</span></span><span class="sub" data-campo="audit_log:{b["id"]}:at">{hora}</span><span></span></div>')
hoy_p = [p for p in M["pendientes"] if p["grupo"] == "hoy"]
inicio = f'''<div class="contenido">{cab("Hola", "Esto es lo que pide atención hoy en CENTRO.", f'<span class="btn">Hoy, {HOY.strftime("%d/%m/%Y")}</span><a class="btn pri" href="nuevo-contrato.html">Nuevo contrato</a>')}
<div class="kpis">
{kpi("Contratos activos", "kpi.contratos_activos", '<a class="verde" href="contratos-tabla.html">Ver la tabla</a>')}
{kpi("Por vencer (30 días)", "kpi.por_vencer_30", '<span class="rojo-t">Requieren acción</span>', "rojo")}
{kpi("Montajes por resolver", "kpi.montajes", '<a class="rojo-t" href="montajes.html">Ver montajes</a>', "rojo")}
{kpi("Canon del mes", "kpi.canon_mes", '<a class="verde" href="indicadores.html">Ver indicadores</a>')}</div>
<div class="dos llenar">
<section class="tarjeta"><header><h2>Pendientes de hoy · {V("pend.hoy")}</h2><a class="btn enl" href="pendientes.html">Ver los {V("pend.total")}</a></header><div class="lista">
{"".join(fila_pend(p) for p in hoy_p[:7])}</div></section>
<section class="tarjeta"><header><h2>Actividad reciente</h2><a class="btn enl" href="bitacora.html">Bitácora</a></header><div class="lista">
{"".join(fila_act(b) for b in act)}</div></section></div></div>'''
P("inicio", "Inicio", "Inicio", inicio, sec="inicio")

# ════════════════════════════ Bandeja de Pendientes ═══════════════════════════
grupos = [("hoy", "Fecha límite hoy", "pend.hoy"), ("30", "Próximos 30 días", "pend.30"), ("inc", "Inconsistencias", "pend.inc")]
bandeja = cab("Pendientes", "Lo que hay que resolver, de los cuatro módulos. Cada uno lleva a la pantalla que lo resuelve.") + "".join(
    f'<section class="tarjeta" id="{g}" data-sec="bandeja-de-pendientes"><header><h2>{t} · {V(k)}</h2></header><div class="lista">'
    + ("".join(fila_pend(p) for p in M["pendientes"] if p["grupo"] == g) or '<p class="sub">Nada por ahora.</p>') + "</div></section>" for g, t, k in grupos)
P("pendientes", "", "Pendientes", f'<div class="contenido">{bandeja}</div>', sec="bandeja-de-pendientes")

# ════════════════════════════ Contratos · ¿para qué fechas? ═══════════════════
RANGO = ("2026-11-01", "2027-01-31")
meses_rango = meses_entre(date.fromisoformat(RANGO[0]), date.fromisoformat(RANGO[1]))
disp = [(u, *disponibilidad(u, *RANGO)) for u in M["unidades"]]
libres = [d for d in disp if d[1] == "libre"]; parte = [d for d in disp if d[1] == "parcial"]
def tarifa_id(u):
    """La tarifa de la que sale la de una unidad: la del tipo, o la del tipo ÷ n en un entrepaño."""
    return u["tipo"] + (f'/{MUE[u["mueble"]]["entrepanos"]}' if u["forma"] == "entrepaño" else "")
def fila_libre(u, est, desde_l, det):
    tar = u["tarifa"]
    return (f'<div class="registro" data-ref-fila="{u["codigo"]}" style="padding:.75rem 0"><div><b>{R(u["codigo"])}</b> · {escape(nombre_unidad(u))}'
            f'<div class="sub">{escape(det)} · tarifa {C("tarifa", tarifa_id(u), "al_mes", plata(tar))} /mes</div></div></div>')
sel_u = UNI["PUN-08"]
contratos_pg = f'''<div class="contenido">{cab("Contratos: ¿para qué fechas?", "Elegí las fechas: el plano dice qué está libre, hasta cuándo está ocupado y desde cuándo se libera.", '<a class="btn" href="planilla.html">Cargar desde planilla</a><a class="btn" href="linea.html">Línea de tiempo</a><a class="btn pri" href="nuevo-contrato.html">Nuevo contrato</a>')}
<section class="tarjeta resumen-filtros solo-movil-flex"><span class="txt"><b style="display:block">{fecha(RANGO[0])} → {fecha(RANGO[1])}</b><span class="sub" style="display:block">{meses_rango:g} meses · CENTRO · todos los muebles</span></span><span class="btn">Cambiar</span></section>
<section class="tarjeta form-filtros"><div class="form-fila">
<div class="campo"><label>Desde</label><span class="ctl"><span>{fecha(RANGO[0])}</span>{I("calendario", 16, "#667085")}</span></div>
<div class="campo"><label>Hasta</label><span class="ctl"><span>{fecha(RANGO[1])} · {meses_rango:g} meses</span>{I("abajo", 16, "#667085")}</span></div>
<div class="campo"><label>Sede</label><span class="ctl"><span>CENTRO</span>{I("abajo", 16, "#667085")}</span></div>
<div class="campo"><label>Tipo de mueble</label><span class="ctl"><span>Todos</span>{I("abajo", 16, "#667085")}</span></div>
<span class="btn pri grande">{I("buscar", 16, "#fff")}Buscar</span></div></section>
<div class="cab" style="align-items:center"><div class="tit"><b style="display:block;font-size:var(--fs-h2)">{len(disp)} espacios en esas fechas</b><span class="sub" style="display:block" data-calc="disp">{len(libres)} libres todas las fechas · {len(parte)} libres una parte</span></div><div class="acciones"><span class="seg"><span>{I("lista", 15)}Lista</span><span aria-pressed="true">{I("mapa", 15)}Mapa</span></span></div></div>
<div class="disp llenar"><section class="tarjeta" style="padding:.75rem"><div class="plano-env">{plano(sel="PUN-08", rango=RANGO)}</div>
<div class="franja" style="margin-top:.75rem"><span class="txt"><b>{R("PUN-08")}</b> · {nombre_unidad(sel_u)} {pil("ok", "Disponible")}<br><span class="sub">{escape(disponibilidad(sel_u, *RANGO)[2])} · tarifa {C("tarifa", "punta", "al_mes", plata(sel_u["tarifa"]))} al mes</span></span><a class="btn" href="ficha-PUN-08.html">Ver ficha</a><a class="btn pri" href="nuevo-contrato.html">Contratar {fecha(RANGO[0])} → {fecha(RANGO[1])}</a></div>
<div style="margin-top:.75rem">{leyenda(["libre", "parcial", "ocupado", "reservado", "casa"])}</div></section>
<aside class="tarjeta lista-disp"><header><h2>Libres o en parte</h2><span class="sub">{len(libres) + len(parte)} de {len(disp)}</span></header>{"".join(fila_libre(*d) for d in libres + parte)}</aside></div></div>'''
P("contratos", "Contratos", "Contratos", contratos_pg, sec="contratos-para-que-fechas")

# ════════════════════════════ Nuevo contrato (los cuatro pasos) ═══════════════
total_n = round(sel_u["tarifa"] * meses_rango)
pasos = "".join(f'<span class="paso {"on" if i == 0 else ""}"><b>{i + 1}</b>{t}</span>' for i, t in enumerate(["Qué se contrata", "Proveedor y vigencia", "Canon", "Confirmación"]))
nuevo = f'''<div class="contenido">{cab("Nuevo contrato", "Cuatro pasos. Lo que se elige acá es lo que el plano mostró libre para esas fechas.", '<a class="btn" href="contratos.html">Volver a las fechas</a>')}
<div class="pasos">{pasos}</div>
<div class="dos llenar"><section class="tarjeta" data-sec="nuevo-contrato-paso-1-que-se-contrata"><header><h2>1 · Qué se contrata</h2></header>
<div class="dato"><small>Espacio</small><b>{R("PUN-08")} · {nombre_unidad(sel_u)} · entera</b></div>
<div class="dato"><small>Disponibilidad en esas fechas</small><b>{escape(disponibilidad(sel_u, *RANGO)[2])}</b></div>
<div class="dato"><small>Tarifa de referencia</small><b>{C("tarifa", "punta", "al_mes", plata(sel_u["tarifa"]))} al mes</b></div></section>
<section class="tarjeta" data-sec="nuevo-contrato-paso-2-proveedor-y-vigencia"><header><h2>2 · Proveedor y vigencia</h2></header>
<div class="form-fila"><div class="campo"><label>Proveedor</label><span class="ctl"><span>Elegí de los {len(M["proveedores"])} proveedores o escribí uno nuevo</span></span></div>
<div class="campo"><label>Vigencia</label><span class="ctl"><span>{fecha(RANGO[0])} → {fecha(RANGO[1])}</span></span></div></div></section></div>
<div class="dos"><section class="tarjeta" data-sec="nuevo-contrato-paso-3-canon"><header><h2>3 · Canon</h2></header>
<div class="form-fila"><div class="campo"><label>Al mes</label><span class="ctl"><span data-calc="nuevo.al_mes">{plata(sel_u["tarifa"])}</span></span></div>
<div class="campo"><label>Meses</label><span class="ctl"><span data-calc="nuevo.meses">{meses_rango:g}</span></span></div>
<div class="campo"><label>Total del contrato</label><span class="ctl"><span data-calc="nuevo.total">{plata(total_n)}</span></span></div></div>
<p class="sub">Total = al mes × meses (la cuenta de la app, services/meses.py). También se puede cobrar un % de las ventas.</p></section>
<section class="tarjeta" data-sec="nuevo-contrato-paso-4-confirmacion"><header><h2>4 · Confirmación</h2></header>
<p>Se guarda todo junto o nada (POST /api/contratos/vender). Si falta la planometría, el aviso de montaje espera.</p>
<div class="acciones"><span class="btn">Guardar como reserva</span><a class="btn pri" href="contrato-guardado.html">Guardar contrato</a></div></section></div></div>'''
P("nuevo-contrato", "Contratos", "Nuevo contrato", nuevo, sec="nuevo-contrato")

# ════════════════════════════ Tabla de contratos y línea de tiempo ════════════
def fila_contrato(c):
    est = "Activo" if c["activo"] else ("Arranca en %d días" % c["arranca_en"] if c["arranca_en"] > 0 else "Terminado")
    al_mes = (f'{c["ventas"]["porcentaje"]:g} % de las ventas' if c["ventas"] else plata(c["al_mes"]))
    return (f'<tr><td class="cod"><a href="contrato-{c["lease_id"]}.html" data-ref="{c["codigo"]}"><b>{c["codigo"]}</b></a></td>'
            f'<td>{C("lease", c["lease_id"], "proveedor", c["proveedor"])}</td><td>{escape(c["marca"])}</td>'
            f'<td>{C("lease", c["lease_id"], "desde", fecha(c["desde"]))} → {C("lease", c["lease_id"], "hasta", fecha(c["hasta"]))}</td>'
            f'<td>{C("lease", c["lease_id"], "al_mes", al_mes)}</td><td>{C("lease", c["lease_id"], "total", plata(c["total"]))}</td><td>{est}</td></tr>')
tabla_c = (f'<div class="tabla-env"><table><thead><tr><th class="cod">Espacio</th><th>Proveedor</th><th>Marca</th><th>Vigencia</th><th>Al mes</th><th>Total</th><th>Estado</th></tr></thead><tbody>'
           + "".join(fila_contrato(c) for c in M["contratos"]) + "</tbody></table>"
           + '<div class="registros">' + "".join(f'<div class="registro"><b><a href="contrato-{c["lease_id"]}.html">{c["codigo"]}</a></b><span>{escape(c["proveedor"])}</span><dl><dt>Vigencia</dt><dd>{fecha(c["desde"])} → {fecha(c["hasta"])}</dd><dt>Al mes</dt><dd>{plata(c["al_mes"]) if not c["ventas"] else "% ventas"}</dd></dl></div>' for c in M["contratos"]) + "</div></div>")
P("contratos-tabla", "Indicadores", "Tabla de contratos", f'<div class="contenido">{cab("Tabla de contratos", "Todos los contratos vivos de CENTRO, con lo que se escribió al guardarlos.", "")}<section class="tarjeta llenar" style="padding:0;overflow:hidden">{tabla_c}</section></div>', sec="tabla-de-contratos")

M0 = date(2026, 5, 1); MESES12 = [(M0.replace(month=((M0.month - 1 + i) % 12) + 1, year=M0.year + (M0.month - 1 + i) // 12)) for i in range(13)]
def barra_tiempo(u):
    total = (MESES12[-1] - MESES12[0]).days
    tramos, abajo = "", 0.0
    for c in sorted(M["contratos"], key=lambda c: c["desde"]):
        if c["codigo"] == u["codigo"] or c["cara"] == u["codigo"]:
            a = max((date.fromisoformat(c["desde"]) - MESES12[0]).days, 0) / total * 100
            b = min((date.fromisoformat(c["hasta"]) - MESES12[0]).days + 1, total) / total * 100
            alto = (c["pb"] or 10000) / 10000
            abajo = abajo if c["pb"] else 0.0
            tramos += f'<a class="tramo" href="contrato-{c["lease_id"]}.html" style="left:{a:.2f}%;width:{b - a:.2f}%;bottom:{abajo * 100:.0f}%;height:{alto * 100:.0f}%" title="{escape(c["proveedor"])} · {fecha(c["desde"])} → {fecha(c["hasta"])}">{escape(c["proveedor"])}</a>'
            if c["pb"]:
                abajo += alto  # las participaciones de una cara se apilan: suman su %
    for r in M["reservas"]:
        if r["espacio"] == "CENTRO-" + u["codigo"]:
            a = (date.fromisoformat(r["desde"]) - MESES12[0]).days / total * 100; b = ((date.fromisoformat(r["hasta"]) - MESES12[0]).days + 1) / total * 100
            tramos += f'<span class="tramo res" style="left:{a:.2f}%;width:{b - a:.2f}%">Reserva · {escape(r["proveedor"])}</span>'
    hoy_x = (HOY - MESES12[0]).days / total * 100
    alta = " alta" if u["forma"] == "cara" else ""
    return f'<div class="tiempo{alta}"><span class="hoy" style="left:{hoy_x:.2f}%"></span>{tramos}</div>'
cab_t = '<div class="fila-t cab-t"><span></span><div class="meses">' + "".join(f'<span>{m.strftime("%b")}</span>' for m in MESES12[:-1]) + "</div></div>"
linea = (f'<div class="contenido">{cab("Línea de tiempo de la sede", "Hasta cuándo está ocupado cada espacio y desde cuándo queda libre. Cada barra es un contrato.", "")}'
         f'<section class="tarjeta llenar"><div class="gantt">{cab_t}' + "".join(f'<div class="fila-t"><span>{R(u["codigo"])}</span>{barra_tiempo(u)}</div>' for u in M["unidades"]) + "</div></section></div>")
P("linea", "Contratos", "Línea de tiempo", linea, sec="linea-de-tiempo-de-la-sede")

# ════════════════════════════ Indicadores ═════════════════════════════════════
mx = max(v for _, v in M["serie"]) or 1
barras = '<div class="barras">' + "".join(f'<div class="b"><span class="v" data-v="serie.{n}">{escape(D["serie." + n]["texto"])}</span><i style="height:{v / mx * 100:.1f}%" class="{"on" if n == "Oct" else ""}"></i><span class="m">{n}</span></div>' for n, v in M["serie"]) + "</div>"
dona_p = D["kpi.ocupacion"]["valor"]
dona_svg = f'<svg viewBox="0 0 180 180" class="dona"><circle cx="90" cy="90" r="70" fill="none" stroke="#E0EAFF" stroke-width="22"/><circle cx="90" cy="90" r="70" fill="none" stroke="#2F7CF6" stroke-width="22" stroke-dasharray="{2 * math.pi * 70 * dona_p:.1f} 999" transform="rotate(-90 90 90)" stroke-linecap="round"/><text x="90" y="96" text-anchor="middle" font-size="28" font-weight="750">{escape(D["kpi.ocupacion"]["texto"])}</text></svg>'
ley_o = "".join(f'<div class="ley-o"><span>{t}</span><span class="sub">{V(f"ocup.{k}.de")}</span><b>{V(f"ocup.{k}")}</b></div>' for k, t in [("gondola", "Caras de góndola"), ("punta", "Puntas de góndola"), ("nevera_puertas", "Neveras")])
prov_t = ('<div class="tabla-env"><table><thead><tr><th class="cod">Proveedor</th><th>Canon /mes</th><th>Contratos</th><th>% del total</th></tr></thead><tbody>'
          + "".join(f'<tr><td class="cod">{escape(p)}</td><td>{V(f"prov.{p}.canon")}</td><td>{V(f"prov.{p}.espacios")}</td><td>{V(f"prov.{p}.pct")}</td></tr>' for p, _, _ in M["ranking"]) + "</tbody></table></div>")
venc60 = [c for c in M["contratos"] if c["activo"] and c["vence_en"] <= 60]
venc_t = ('<div class="tabla-env"><table><thead><tr><th class="cod">Espacio</th><th>Proveedor</th><th>Vence</th><th></th></tr></thead><tbody>'
          + "".join(f'<tr><td class="cod">{R(c["codigo"])}</td><td>{C("lease", c["lease_id"], "proveedor", c["proveedor"])}</td><td class="{"rojo-t" if c["vence_en"] <= 30 else ""}">{C("lease", c["lease_id"], "hasta", fecha(c["hasta"]))}</td><td><a class="btn suave" href="contrato-{c["lease_id"]}.html">Renovar</a></td></tr>' for c in venc60) + "</tbody></table></div>")
pest = '<div class="chips">' + "".join(f'<a class="btn {"" if on else "suave"}" {"aria-current=page" if on else ""} href="{h}">{t}</a>' for t, h, on in [("Resumen", "indicadores.html", True), ("Tabla de contratos", "contratos-tabla.html", False), ("Participaciones de cara", "participaciones.html", False), ("Todas las sedes", "sedes.html", False), ("Detalle del tablero", "detalle.html", False), ("Diccionario de métricas", "diccionario.html", False)]) + "</div>"
indic = f'''<div class="contenido">{cab("Indicadores", "Cómo va CENTRO hoy. Cada cifra tiene su «?» con la fórmula y la fuente.", '<span class="seg"><span aria-pressed="true">Al mes</span><span>Total del contrato</span></span><span class="btn">CENTRO</span><span class="btn" data-sec="ayuda-y-fijar-en-la-barra" title="Lo raro o peligroso; cada persona fija hasta 3 en su barra">Más ▾</span>')}
{pest}
<div class="kpis">{kpi("Canon del mes", "kpi.canon_mes")}{kpi("Contratos activos", "kpi.contratos_activos")}{kpi("Ocupación", "kpi.ocupacion")}{kpi("Canon ÷ tarifa", "kpi.canon_tarifa")}</div>
<div class="dos"><section class="tarjeta"><header><h2>Canon por mes {ayuda("serie.Oct")}</h2><a class="btn enl" href="contratos-tabla.html">Tabla de contratos</a></header>{barras}</section>
<section class="tarjeta"><header><h2>Ocupación por tipo de mueble</h2></header><div class="dona-env">{dona_svg}<div class="ley-env">{ley_o}</div></div></section></div>
<div class="dos llenar"><section class="tarjeta" data-sec="quien-paga-el-canon"><header><h2>Quién paga el canon</h2></header>{prov_t}</section>
<section class="tarjeta"><header><h2>Contratos por vencer (60 días)</h2></header>{venc_t}</section></div></div>'''
P("indicadores", "Indicadores", "Indicadores", indic, sec="resumen-panel-de-informacion-rapida")
P("tarifas", "Indicadores", "Tarifas", indic, sec="resumen-panel-de-informacion-rapida", extra=(
    '<div class="velo"><div class="modal" role="dialog" aria-modal="true"><header><h2>Tarifas de referencia</h2><a class="btn suave" href="ajustes.html" aria-label="Cerrar">' + I("x", 16) + '</a></header><div class="cuerpo">'
    '<p class="sub" style="margin-top:0">Canon mensual de referencia por tipo de mueble (GET /api/layout/rates).</p>'
    '<div class="tarifa tarifa-cab" style="border-top:0"><span class="sub">Tipo</span><span class="sub">General</span><span class="sub">CENTRO</span></div>'
    + "".join(f'<div class="tarifa"><span class="tipo">{NOMBRE[k]}</span><span><span class="et">General</span><span class="ctl">{C("tarifa", k, "al_mes", plata(v))}</span></span><span><span class="et">CENTRO</span><span class="ctl">{plata(M["tarifas"]["by_sede"].get("CENTRO", {}).get(k, v))}</span></span></div>' for k, v in M["tarifas"]["default"].items())
    + '</div><footer>Los cambios se guardan solos y se comparten con las demás estaciones.</footer></div></div>'))

dic = (f'<div class="contenido">{cab("Diccionario de métricas", "Cada cifra que aparece en el sistema: qué cuenta, de dónde sale y su valor hoy.", "")}{pest}'
       '<section class="tarjeta llenar" style="padding:0;overflow:hidden"><div class="tabla-env"><table><thead><tr><th class="cod">Cifra</th><th>Hoy</th><th>Fórmula</th><th>Fuente</th></tr></thead><tbody>'
       + "".join(f'<tr id="{k}"><td class="cod"><code>{k}</code></td><td>{V(k)}</td><td class="envuelve">{escape(v["formula"])}</td><td class="envuelve"><code>{escape(v["fuente"])}</code></td></tr>' for k, v in D.items())
       + "</tbody></table></div></section></div>")
P("diccionario", "Indicadores", "Diccionario de métricas", dic, sec="diccionario-de-metricas")

def cara_part(u, alto="9rem"):
    """La cara como franjas por participación (lo contratado; sin distribuir en el plano)."""
    tramos, x = "", 0
    for p in u.get("participaciones", []):
        w = p["puntos_basicos"] / 100
        tramos += f'<span class="pc {"res" if p["estado_visible"] == "reserva" else ""}" style="left:{x}%;width:{w}%" title="{escape(p["proveedor"])}"><b>{p["puntos_basicos"] // 100} %</b>{escape(p["proveedor"])}</span>'
        x += w
    return f'<div class="cara-part" style="height:{alto}">{tramos}<span class="queda" style="left:{x}%;width:{100 - x}%">queda {100 - x:g} %</span></div>'
partic = (f'<div class="contenido">{cab("Participaciones de cara", "Cuánto de cada cara está contratado, reservado o libre (GET /api/participaciones/resumen).", "")}{pest}'
          + '<div class="rejilla-caras llenar">' + "".join(f'<section class="tarjeta"><header><h2>{R(u["codigo"])}</h2>{pil(ESTADO[u["estado"]][0], ESTADO[u["estado"]][1])}</header>{cara_part(u)}</section>' for u in M["unidades"] if u["forma"] == "cara") + "</div></div>")
P("participaciones", "Indicadores", "Participaciones de cara", partic, sec="participaciones-de-cara")

# ════════════════════════════ Montajes ════════════════════════════════════════
mont_p = [p for p in M["pendientes"] if p["tipo"] in ("Falta planometría", "Participación sin ubicar", "Montaje no realizado", "Montado, sin verificar") or p["tipo"].startswith("Planograma")]
def fila_m(p):
    return (f'<tr id="{p["codigo"]}"><td class="cod">{R(p["codigo"])}</td><td>{escape(p["tipo"])}</td><td>{escape(p["det"])}</td>'
            f'<td>{pil(p["tono"], p["estado"])}</td><td><a class="btn {"pri" if p["tono"] == "crit" else "suave"}" href="{destino_pend(p)}">{p["accion"]}</a></td></tr>')
tabla_m = ('<div class="tabla-env"><table><thead><tr><th class="cod">Espacio</th><th>Qué falta</th><th>Detalle</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'
           + "".join(fila_m(p) for p in mont_p) + '</tbody></table><div class="registros">'
           + "".join(f'<div class="registro"><b>{R(p["codigo"])}</b><span>{escape(p["tipo"])}</span><dl><dt>Estado</dt><dd>{escape(p["estado"])}</dd></dl><div class="acc"><a class="btn" href="{destino_pend(p)}">{p["accion"]}</a></div></div>' for p in mont_p) + "</div></div>")
cuenta = lambda f: sum(1 for p in mont_p if f(p))
pest_m = '<div class="chips">' + "".join(f'<span class="btn {"suave" if i else ""}">{t} ({n})</span>' for i, (t, n) in enumerate([
    ("Por resolver", len(mont_p)), ("No realizados", cuenta(lambda p: p["tipo"] in ("Montaje no realizado", "Planograma no montado"))),
    ("Por verificar", cuenta(lambda p: p["tipo"] in ("Montado, sin verificar", "Planograma montado, falta revisar"))),
    ("Falta algo", cuenta(lambda p: p["tipo"] in ("Falta planometría", "Participación sin ubicar")))])) + "</div>"
rep_t = "".join(f'<div class="dato"><small>{R(r["space_code"].replace("CENTRO-", ""))} · {C("mount_confirmations", r["id"], "reportado_por", r["reportado_por"])}</small><b>{C("mount_confirmations", r["id"], "estado", "Montado" if r["estado"] == "montado" else "No montado")}{" · " + escape(r["nota"]) if r.get("nota") else ""}</b></div>' for r in M["reportes"])
montajes = f'''<div class="contenido">{cab("Montajes", "Contratos y planogramas en una sola lista: qué falta, quién lo reportó y qué hacer.", '<a class="btn" href="montaje-telefono.html">Así lo ve el encargado</a><a class="btn" href="verificar-montaje.html">Verificar montajes</a>')}
<div class="kpis">{kpi("Por resolver", "kpi.montajes")}<div class="tarjeta kpi"><span class="t">Reportes recibidos</span><span class="n">{len(M["reportes"])}</span></div><div class="tarjeta kpi"><span class="t">Planogramas vigentes</span><span class="n">{len(M["planogramas"])}</span></div><div class="tarjeta kpi"><span class="t">Ventas por cargar</span><span class="n">{len(M["cobros"])}</span></div></div>
{pest_m}<section class="tarjeta" style="padding:0;overflow:hidden">{tabla_m}</section>
<div class="dos llenar"><section class="tarjeta"><header><h2>Últimos reportes del encargado</h2></header>{rep_t}</section>
<section class="tarjeta"><header><h2>Planogramas de la casa</h2></header>{"".join(f'<div class="dato"><small><a href="planograma-{c["codigo"]}-{c["cara"]}.html">{c["nombre"]}</a></small><b>{C("versiones_de_planograma", c["version_id"], "estado", c["estado"].replace("_", " "))}</b></div>' for c in M["planogramas"])}</section></div></div>'''
P("montajes", "Montajes", "Montajes", montajes, sec="lista-de-montajes")

# ════════════════════════════ Plano 2D / 3D y fichas de mueble ════════════════
TIPOS_CAT = {}
for f in M["muebles"]:
    TIPOS_CAT[f["label"]] = TIPOS_CAT.get(f["label"], 0) + 1
catalogo = '<section class="tarjeta catalogo"><header><h2>Catálogo</h2></header>' + "".join(f'<div class="cat-item"><span class="n"><b>{escape(t)}</b><span class="sub" style="display:block">{n} en la sede</span></span></div>' for t, n in TIPOS_CAT.items()) + "</section>"
def props_mueble(code, cerrar=True):
    f = MUE[code]; us = [u for u in M["unidades"] if u["mueble"] == code]
    filas = "".join(f'<div class="dato"><small>{escape(nombre_unidad(u))}</small><b>{R(u["codigo"])} · {ESTADO[u["estado"]][1]}{" hasta el " + fecha(u["hasta"]) if u.get("hasta") else ""}</b></div>' for u in us)
    if not us:
        filas = '<div class="dato"><small>Se vende</small><b>No: es de la casa (planograma)</b></div>' + "".join(f'<div class="dato"><small>Cara {c["cara"]}</small><b><a href="planograma-{code}-{c["cara"]}.html">Planograma · {c["estado"].replace("_", " ")}</a></b></div>' for c in M["planogramas"] if c["codigo"] == code)
    return (f'<section class="tarjeta props"><header><h2>{code}</h2>{"<a class=\"btn enl\" href=\"plano2d.html\" aria-label=\"Cerrar\">" + I("x", 16) + "</a>" if cerrar else ""}</header>'
            f'<span class="sub">{escape(f["label"])}</span><div class="dato"><small>Medidas</small><b data-campo="fixture:{code}:medidas">{f["w"]:g} × {f["d"]:g} × {f["h"]:g} m</b></div>{filas}'
            f'<div class="acciones" style="margin-top:.75rem;flex-direction:column"><a class="btn" href="plano3d.html">Ver en 3D</a></div></section>')
herr = '<div class="herr">' + "".join(f'<span class="{c}">{I(i, 15)}{t}</span>' for t, i, c in [("Catálogo", "cuadros", "cat-btn"), ("Seleccionar", "mano", "on"), ("Rotar", "rotar", ""), ("Duplicar", "copiar", ""), ("Deshacer", "deshacer", ""), ("Rehacer", "rehacer", ""), ("Eliminar", "papelera", "rojo"), ("Propiedades", "info", "props-btn")]) + "</div>"
zoom = '<div class="ctl-mapa"><span class="esp"></span><span class="c">+</span><span class="c">−</span><span class="c">' + I("pin", 17) + "</span></div>"
def editor2d(sel, estado=""):
    return (f'{cab("Plano de la sede — CENTRO", f"{len(M["muebles"])} muebles · {len(M["unidades"])} espacios contratables · lo dibujado es GET /api/layout/CENTRO.", "<a class=\"btn\" href=\"contorno.html\">Contorno de la sede</a><span class=\"seg\"><span aria-pressed=\"true\">2D</span><a href=\"plano3d.html\">3D</a></span>")}'
            f'<div class="editor2d {estado}">{catalogo}<div class="lienzo">{herr}<div class="plano-env">{plano(sel=sel)}{zoom}<span class="pill ok validacion">Validación: sin choques nuevos</span></div>{leyenda(["libre", "parcial", "ocupado", "por_vencer", "proximo", "casa"])}</div>{props_mueble(sel)}</div>')
P("plano2d", "Plano de la sede", "Plano 2D", editor2d("GON-03"), "editor", sec="plano-2d-muebles")
for f in M["muebles"]:
    P(f'mueble-{f["code"]}', "Plano de la sede", f'Mueble {f["code"]}', editor2d(f["code"], "ver-props"), "editor", sec="ficha-del-mueble")

def iso_svg(sel=None):
    """Isométrico simple desde el plano: cada mueble es una caja de su alto real."""
    k, cos30 = 15, math.cos(math.pi / 6)
    pr = lambda x, z, y: ((x - z) * cos30 * k + 420, (x + z) * .5 * k - y * k + 120)
    caras = []
    for f in M["muebles"]:
        x, y, w, h, rot = huella(f); x, z, w, d = x / ESC, y / ESC, w / ESC, h / ESC
        us = [u for u in M["unidades"] if u["mueble"] == f["code"]]
        est = "casa" if not us else ("sel" if f["code"] == sel else min((u["estado"] for u in us), key=lambda e: ["libre", "parcial", "reservado", "proximo", "por_vencer", "ocupado"].index(e)))
        fondo, borde = COL[est]
        H = f["h"]
        p = lambda a, b, c: "%.1f,%.1f" % pr(a, b, c)
        top = f'{p(x, z, H)} {p(x + w, z, H)} {p(x + w, z + d, H)} {p(x, z + d, H)}'
        izq = f'{p(x, z + d, 0)} {p(x + w, z + d, 0)} {p(x + w, z + d, H)} {p(x, z + d, H)}'
        der = f'{p(x + w, z, 0)} {p(x + w, z + d, 0)} {p(x + w, z + d, H)} {p(x + w, z, H)}'
        cx_, cy_ = pr(x + w / 2, z + d / 2, H)
        caras.append((x + z + w + d, f'<a href="mueble-{f["code"]}.html" data-ref="{f["code"]}"><polygon points="{izq}" fill="{borde}" opacity=".55"/><polygon points="{der}" fill="{borde}" opacity=".8"/><polygon points="{top}" fill="{fondo}" stroke="{borde}"/></a>'
                      f'<text x="{cx_:.0f}" y="{cy_ - 6:.0f}" font-size="12" font-weight="700" text-anchor="middle" font-family="ui-monospace,monospace" paint-order="stroke" stroke="#fff" stroke-width="3">{f["code"]}</text>'))
    piso = " ".join("%.1f,%.1f" % pr(a, b, 0) for a, b in [(0, 0), (ANCHO, 0), (ANCHO, ALTO), (0, ALTO)])
    return f'<svg viewBox="-60 40 960 600" role="img" aria-label="Vista 3D desde el plano"><polygon points="{piso}" fill="#F8FAFC" stroke="#CBD5E1"/>' + "".join(s for _, s in sorted(caras)) + "</svg>"
u8 = UNI["PUN-08"]
props3d = (f'<section class="tarjeta props3d"><header><h2>PUN-08</h2>{pil("ok", "Disponible")}</header><span class="sub">Punta de góndola</span>'
           f'<div class="dato"><small>Estado hoy</small><b>{ESTADO[u8["estado"]][1]}</b></div><div class="dato"><small>Tarifa</small><b>{C("tarifa", "punta", "al_mes", plata(u8["tarifa"]))} al mes</b></div>'
           '<div class="acciones" style="flex-direction:column;margin-top:.75rem"><a class="btn pri grande" href="nuevo-contrato.html">Contratar este espacio</a><a class="btn" href="ficha-PUN-08.html">Ver la ficha</a></div></section>')
vistas = '<div class="chips">' + "".join(f'<span class="btn">{t}</span>' for t in ["Orbital", "Primera persona", "Cenital", "Con arte", "Bajar imagen"]) + "</div>"
P("plano3d", "Plano de la sede", "Plano 3D", f'{cab("Vista 3D — CENTRO", "Los mismos muebles del plano, con su alto real y el color de su estado.", "<span class=\"seg\"><a href=\"plano2d.html\">2D</a><span aria-pressed=\"true\">3D</span></span>")}{vistas}<div class="editor3d"><div class="escena">{iso_svg("PUN-08")}</div>{props3d}</div>', "editor", sec="plano-3d")
P("contorno", "Plano de la sede", "Contorno", f'{cab("Contorno de la sede", f"La sala mide {ANCHO} × {ALTO} m. El contorno se dibuja una vez y los muebles se validan contra él.", "")}<section class="tarjeta llenar"><div class="plano-env">{plano(cotas=True)}</div></section>', "editor", sec="contorno-de-la-sede")

# ════════════════════════════ Ficha del espacio (una por unidad) ══════════════
def ficha(u):
    vivos = sorted([c for c in M["contratos"] if c["codigo"] == u["codigo"] or c["cara"] == u["codigo"]], key=lambda c: c["desde"])
    est_t, est_l = ESTADO[u["estado"]]
    accion = {"libre": ('<a class="btn pri grande" href="nuevo-contrato.html">Nuevo contrato</a>'), "parcial": ('<a class="btn pri grande" href="nuevo-contrato.html">Contratar lo disponible</a>'),
              "reservado": ('<a class="btn pri grande" href="pendientes.html">Confirmar la reserva</a>')}.get(u["estado"])
    if not accion and vivos:
        accion = f'<a class="btn pri grande" href="contrato-{vivos[0]["lease_id"]}.html">Renovar contrato</a>'
    datos = "".join(
        f'<div class="dato"><small><a href="contrato-{c["lease_id"]}.html">Contrato {c["codigo"]}</a>{" · " + str((c["pb"] or 0) // 100) + " %" if c["pb"] else ""}</small>'
        f'<b>{C("lease", c["lease_id"], "proveedor", c["proveedor"])} · {escape(c["marca"])} · {C("lease", c["lease_id"], "desde", fecha(c["desde"]))} → {C("lease", c["lease_id"], "hasta", fecha(c["hasta"]))}</b>'
        f'<span class="sub">{C("lease", c["lease_id"], "al_mes", (str(c["ventas"]["porcentaje"]).replace(".0", "") + " % de las ventas") if c["ventas"] else plata(c["al_mes"]))}{"" if c["ventas"] else " al mes"} · total {C("lease", c["lease_id"], "total", plata(c["total"]))} · planometría: {"sí" if c["planometria"] else "falta"}</span></div>' for c in vivos)
    res = [r for r in M["reservas"] if r["espacio"] == "CENTRO-" + u["codigo"]]
    datos += "".join(f'<div class="dato"><small>Reserva provisional</small><b>{C("reservas_de_espacio", r["id"], "proveedor", r["proveedor"])} · caduca el {C("reservas_de_espacio", r["id"], "caduca", fecha(r["caduca"]))}</b></div>' for r in res)
    rep = [r for r in M["reportes"] if r["space_code"] == "CENTRO-" + u["codigo"]]
    datos += "".join(f'<div class="dato"><small>Montaje</small><b>{"Montado" if r["estado"] == "montado" else "No montado"} · reportó {escape(r["reportado_por"])}</b></div>' for r in rep)
    pend_u = [p for p in M["pendientes"] if unidad_de(p["codigo"]) == u["codigo"]]
    cuerpo = f'''<div class="contenido">{cab(f'{u["codigo"]} · {escape(nombre_unidad(u))}', f'{est_l}{" · hasta el " + fecha(u["hasta"]) if u.get("hasta") else ""} · mueble <a href="mueble-{u["mueble"]}.html">{u["mueble"]}</a> · tarifa {plata(u["tarifa"])} al mes', accion or "")}
<div class="dos"><section class="tarjeta"><header><h2>Datos</h2>{pil(est_t, est_l)}</header>{datos or '<p class="sub">Sin contratos ni reservas.</p>'}</section>
<section class="tarjeta"><header><h2>Pendientes de este espacio · {len(pend_u)}</h2></header><div class="lista">{"".join(fila_pend(p) for p in pend_u) or '<p class="sub">Nada pendiente.</p>'}</div></section></div>
{f'<section class="tarjeta"><header><h2>Distribución de la cara</h2><a class="btn enl" href="distribucion-GON-03.html">Distribuir</a><a class="btn enl" href="participaciones.html">Todas las caras</a></header>{cara_part(u)}</section>' if u["forma"] == "cara" else ""}
<section class="tarjeta llenar"><header><h2>Línea de tiempo (12 meses)</h2></header><div class="gantt">{cab_t}<div class="fila-t"><span>{u["codigo"]}</span>{barra_tiempo(u)}</div></div>
<div class="acciones" style="margin-top:1rem"><a class="btn" href="plano3d.html">Ver en 3D</a><a class="btn" href="mueble-{u["mueble"]}.html">Ver en el plano</a>{"".join(f'<a class="btn" href="contrato-{c["lease_id"]}.html">Editar {c["codigo"]}</a>' for c in vivos)}</div></section></div>'''
    P(f'ficha-{u["codigo"]}', "Contratos", f'Ficha {u["codigo"]}', cuerpo, sec="ficha-del-espacio")
for u in M["unidades"]:
    ficha(u)

# ════════════════════════════ Editar, renovar y cancelar (uno por contrato) ═══
for c in M["contratos"]:
    u = unidad_de(c["codigo"])
    cuerpo = f'''<div class="contenido">{cab(f'Contrato {c["codigo"]}', f'{escape(c["proveedor"])} · {escape(c["marca"])} · <a href="ficha-{u}.html">ficha del espacio {u}</a>', '<span class="btn peligro">Cancelar contrato</span><span class="btn">Editar</span><span class="btn pri">Renovar</span>')}
<div class="dos llenar"><section class="tarjeta"><header><h2>Lo guardado</h2></header>
<div class="dato"><small>Proveedor</small><b>{C("lease", c["lease_id"], "proveedor", c["proveedor"])}</b></div>
<div class="dato"><small>Vigencia</small><b>{C("lease", c["lease_id"], "desde", fecha(c["desde"]))} → {C("lease", c["lease_id"], "hasta", fecha(c["hasta"]))} · {c["meses"]:g} meses</b></div>
<div class="dato"><small>Canon</small><b>{C("lease", c["lease_id"], "al_mes", (str(c["ventas"]["porcentaje"]).replace(".0", "") + " % de las ventas") if c["ventas"] else plata(c["al_mes"]))}{"" if c["ventas"] else " al mes"} · total {C("lease", c["lease_id"], "total", plata(c["total"]))}</b></div>
{f'<div class="dato"><small>Participación</small><b>{c["pb"] // 100} % de la cara {c["cara"]}</b></div>' if c["pb"] else ""}
<div class="dato"><small>Planometría</small><b>{escape(c["planometria"] or "Falta: el aviso de montaje espera")}</b></div></section>
<section class="tarjeta"><header><h2>Renovar</h2></header><p>La renovación arranca el {fecha((date.fromisoformat(c["hasta"]) + timedelta(days=1)).isoformat())}, con el mismo proveedor{", marca y %" if c["pb"] else " y marca"}.</p>
<p><a class="btn" href="ver3d-proveedor.html">Ver en 3D con el proveedor</a></p><p class="sub">Editar guarda una versión nueva y avisa si cambió algo que el proveedor ya vio (GET /api/contratos/{c["lease_id"]}/edicion).</p></section></div></div>'''
    P(f'contrato-{c["lease_id"]}', "Contratos", f'Contrato {c["codigo"]}', cuerpo, sec="editar-renovar-y-cancelar")

# ════════════════════════════ Planogramas de la casa ══════════════════════════
def cara_plan(cp):
    """Las piezas guardadas (vértices u,v) dibujadas sobre la cara con sus parantes."""
    W, H = 1000, 240
    sup = cp["superficie"]; pl = cp["planograma"]["vigente"] or {}
    piezas = pl.get("piezas") or (cp["planograma"].get("borrador") or {}).get("piezas") or []
    dest = cp.get("destinos", {})
    cols = ["#A5B4FC", "#86EFAC", "#FCA5A5", "#FDE68A", "#93C5FD"]
    g = f'<rect width="{W}" height="{H}" fill="#F8FAFC" stroke="#0F172A"/>'
    for e in sup["exclusiones"]:
        g += f'<rect x="{e["u0"] * W:.1f}" y="{(1 - e["v1"]) * H:.1f}" width="{(e["u1"] - e["u0"]) * W:.1f}" height="{(e["v1"] - e["v0"]) * H:.1f}" fill="#CBD5E1"/>'
    for i, p in enumerate(piezas):
        us = [v[0] for v in p["vertices"]]; vs = [v[1] for v in p["vertices"]]
        nombre = dest.get(str(p["destino_id"]), {}).get("nombre", f'destino {p["destino_id"]}')
        g += (f'<rect x="{min(us) * W:.1f}" y="{(1 - max(vs)) * H:.1f}" width="{(max(us) - min(us)) * W:.1f}" height="{(max(vs) - min(vs)) * H:.1f}" fill="{cols[i % 5]}" opacity=".85"/>'
              f'<text x="{(min(us) + max(us)) / 2 * W:.1f}" y="{H / 2:.0f}" text-anchor="middle" font-size="18" font-weight="700">{i + 1} · {p["pb"] // 100} %</text>'
              f'<text x="{(min(us) + max(us)) / 2 * W:.1f}" y="{H / 2 + 22:.0f}" text-anchor="middle" font-size="15">{escape(nombre)}</text>')
    return f'<div class="cara-env"><svg viewBox="-4 -4 {W + 8} {H + 8}" role="img" aria-label="Piezas guardadas de la cara">{g}</svg></div>', piezas
for c in M["planogramas"]:
    clave = f'{c["codigo"]}-{c["cara"]}'
    cp = M["caras_plan"][clave]
    dib, piezas = cara_plan(cp)
    aviso = c.get("aviso") or {}
    rev = c.get("revision") or {}
    cuerpo = f'''<div class="contenido">{cab(f'Planograma · {escape(c["nombre"])}', f'Versión {c["numero"]} · rige desde el {fecha(c["rige_desde"])} · mueble <a href="mueble-{c["codigo"]}.html">{c["codigo"]}</a>', '<span class="btn">Previsualizar</span><a class="btn" href="guia-enlace.html">Guía de montaje</a><a class="btn pri" href="publicar-GON-12-A.html">Publicar versión</a>')}
<section class="tarjeta" data-sec="planificar-la-cara"><header><h2>La cara</h2>{pil("warn" if c["estado"] in ("por_revisar", "sin_montar") else "crit", c["estado"].replace("_", " "))}</header>{dib}
<div class="leyenda">{"".join(f'<span>{i + 1} · {escape(cp["destinos"].get(str(p["destino_id"]), {}).get("nombre", ""))} · {p["pb"] // 100} %</span>' for i, p in enumerate(piezas))}</div></section>
<div class="dos llenar"><section class="tarjeta" data-sec="versiones"><header><h2>Versiones</h2></header><div class="dato"><small>Vigente</small><b>{C("versiones_de_planograma", c["version_id"], "numero", "Versión " + str(c["numero"]))} · publicada el {fecha(c["rige_desde"])}</b></div></section>
<section class="tarjeta" data-sec="verificar-el-montaje-de-un-planograma"><header><h2>Montaje</h2></header>
<div class="dato"><small>Aviso del encargado</small><b>{escape(aviso.get("estado", "Sin aviso todavía").replace("_", " "))}{" · " + escape(aviso["motivo_legible"]) if aviso.get("motivo_legible") else ""}{" · " + escape(aviso["nota"]) if aviso.get("nota") else ""}</b></div>
{f'<div class="dato"><small>Revisión</small><b>{escape(rev.get("resultado", "").replace("_", " "))} · {escape(rev.get("nota") or "")}</b></div>' if rev else ""}
<div class="acciones" style="margin-top:.75rem"><span class="btn">Coincide</span><span class="btn peligro">No coincide</span></div></section></div></div>'''
    P(f"planograma-{clave}", "Montajes", f"Planograma {clave}", cuerpo, sec="planificar-la-cara")

# ════════════════════════════ Buscador, bitácora y Ajustes ════════════════════
res_b = [u for u in M["unidades"] if u["codigo"].startswith("PUN")][:6]
buscador = (f'<div class="velo"><div class="modal" role="dialog" aria-modal="true"><header><h2>Buscar · «PUN»</h2><a class="btn suave" href="inicio.html" aria-label="Cerrar">{I("x", 16)}</a></header><div class="cuerpo">'
            '<p class="sub" style="margin-top:0">Acciones · Espacios · Glosario. ↑ ↓ para moverse, Enter para abrir, Esc para cerrar.</p><h3>Espacios</h3>'
            + "".join(f'<div class="dato"><small>{escape(nombre_unidad(u))}</small><b>{R(u["codigo"])} · {ESTADO[u["estado"]][1]}{" · vence el " + fecha(u["hasta"]) if u.get("hasta") else ""}</b></div>' for u in res_b)
            + '<h3>Acciones</h3><div class="dato"><b><a href="nuevo-contrato.html">Nuevo contrato</a> · <a href="planilla.html">Cargar contratos desde planilla</a> · <a href="tarifas.html">Tarifas</a></b></div></div></div></div>')
P("buscador", "Inicio", "Buscador", inicio, extra=buscador, sec="buscador-de-funciones-ctrl-k")
bit = (f'<div class="contenido">{cab("Bitácora", "Todo lo que se hizo, en orden (GET /api/bitacora).", "")}<section class="tarjeta llenar"><div class="lista">'
       + "".join(fila_act(b) for b in M["bitacora"] if b["accion"] != "login.ok") + "</div></section></div>")
P("bitacora", "Inicio", "Bitácora", bit, sec="bitacora")
P("planilla", "Contratos", "Cargar desde planilla", f'<div class="contenido">{cab("Cargar contratos desde planilla", "Se valida todo antes de guardar (POST /api/bulk-leases/validar) y se guarda de una vez (POST /api/bulk-leases/confirmar).", "")}<section class="tarjeta llenar"><p>Arrastrá la planilla acá. La revisión muestra cada fila con su espacio, su proveedor y su canon al mes, igual que el paso 3 de Nuevo contrato.</p></section></div>', sec="cargar-contratos-desde-planilla")


exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "final2.py")).read())
PAGINAS = list(dict.fromkeys(PAGINAS))
json.dump(PAGINAS, open(f"{OUT}/paginas.json", "w"), ensure_ascii=False)
print(len(PAGINAS), "páginas")
