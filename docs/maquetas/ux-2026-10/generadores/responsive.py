"""Prototipo responsive del rediseño: páginas HTML reales que usan proto/recabra.css."""
import sys, os
SALIDA_R = sys.argv[1]
os.makedirs("/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/dib-ux/tmp-resp", exist_ok=True)
sys.argv = ["foto.py", "/tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/dib-ux/tmp-resp"]
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(open("foto.py").read())

I = lambda n, s=18, c="currentColor", w=1.9: ico(n, s, c, w)
NAVR = [("Inicio", "casa", "inicio"), ("Contratos", "contratos", "disponibilidad"), ("Indicadores", "indicadores", "indicadores"), ("Montajes", "montajes", "montajes"), ("Plano de la sede", "plano", "plano2d")]
import re
# el gráfico de barras con margen izquierdo para «$ 12.000.000» completo
_src = open("foto.py").read(); _i = _src.index("def barras_f("); _j = _src.index("def dona(")
exec(_src[_i:_j].replace("x0, x1, y0, y1 = 84,", "x0, x1, y0, y1 = 118,"))
# todo lo que venía en px (miniaturas, leyendas, gráficos) pasa a rem: escala con la pantalla
rem = lambda h: re.sub(r'(?<![\w.])(\d+(?:\.\d+)?)px', lambda m: f'{float(m.group(1)) / 15:.4g}rem', h)
def pagina(nombre, activo, cuerpo, main_cls="", extra=""):
    cuerpo, extra = rem(cuerpo), rem(extra)
    nav = "".join(f'<a href="{h}.html" {"aria-current=page" if t == activo else ""}>{I(i)}<span>{t}</span></a>' for t, i, h in NAVR)
    abajo = "".join(f'<a href="{h}.html" {"aria-current=page" if t == activo else ""}>{I(i, 20)}<span>{"Plano" if t == "Plano de la sede" else t}</span></a>' for t, i, h in NAVR)
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RECABRA · {activo}</title><link rel="stylesheet" href="recabra.css"></head><body>
<div class="app">
<aside class="lateral" aria-label="Navegación principal"><div class="marca">{I("lista", 20, "#0F172A", 2.2)}<b>RECABRA</b></div><nav class="nav">{nav}</nav>
<nav class="nav ajustes-nav"><a href="#">{I("ajustes")}<span>Ajustes</span></a></nav>
<div class="pie"><b>Supermercado La Esquina</b>Sede: CENTRO</div></aside>
<header class="superior">
<button class="btn suave menu-btn" aria-label="Abrir el menú">{I("lista", 18)}<span>Menú</span></button>
<span class="marca-movil">RECABRA</span>
<span class="buscar" role="search">{I("buscar", 16, "#6B7280")}<span>Buscar espacios, contratos, proveedores… (Ctrl K)</span></span>
<span class="esp"></span>
<span class="guardado">{I("nube", 16, "#067647", 2)}<span class="txt">Guardado</span></span>
<span class="pend">{I("campana", 19)}<span class="txt">Pendientes</span><span class="insignia">14</span></span>
<span class="persona"><span class="avatar" aria-label="Brayan Moreno, Administrador">BM</span><span class="quien"><b>Brayan Moreno</b><small>Administrador</small></span></span>
</header>
<main class="{main_cls}">{cuerpo}</main>
<nav class="abajo" aria-label="Módulos">{abajo}</nav>
</div>{extra}<script>if(innerWidth<640)document.querySelectorAll('.escena,.plano-env').forEach(e=>{{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;e.scrollTop=(e.scrollHeight-e.clientHeight)/2}})</script></body></html>'''
    open(f"{SALIDA_R}/{nombre}.html", "w").write(html)

ptn = lambda col: f'<span class="punto" style="background:{col}1F"><i style="background:{col}"></i></span>'
def fila(col, t, d, est, cls, acc):
    return f'<div>{ptn(col)}<span class="txt"><b>{t}</b><span class="sub">{d}</span></span><span class="estado {cls}">{est}</span><span class="btn suave">{acc}</span></div>'
def act(col, t, d, h):
    return f'<div>{ptn(col)}<span class="txt"><b>{t}</b><span class="sub">{d}</span></span><span class="sub">{h}</span><span></span></div>'
cab = lambda t, p, acc="": f'<div class="cab"><div class="tit"><h1>{t}</h1><p>{p}</p></div><div class="acciones">{acc}</div></div>'

# ---------- Inicio ----------
inicio = f'''<div class="contenido">{cab("Hola, Brayan", "Acá tenés un resumen de la operación en CENTRO.", '<span class="btn">Hoy, 26 oct 2026</span><span class="btn pri">Nuevo contrato</span>')}
<div class="kpis">
<div class="tarjeta kpi"><span class="t">Contratos activos</span><span class="n" style="color:#0B3B2E">19</span><span class="verde">↑ 2 vs. mes anterior</span></div>
<div class="tarjeta kpi rojo"><span class="t">Por vencer (30 días)</span><span class="n">2</span><span class="rojo-t">Requieren acción</span></div>
<div class="tarjeta kpi rojo"><span class="t">Montajes por resolver</span><span class="n">4</span><span class="rojo-t">1 con fecha límite hoy</span></div>
<div class="tarjeta kpi"><span class="t">Canon del mes</span><span class="n">{fmt(9939500)}</span><span class="verde">↑ 4,7 % vs. mes anterior</span></div></div>
<div class="dos llenar">
<section class="tarjeta"><header><h2>Pendientes de hoy</h2><span class="btn enl">Ver los 14</span></header><div class="lista">
{fila("#F04438", "Contrato por vencer", "PUN-07 · Galletas Sol", "Vence en 4 días", "rojo-t", "Renovar")}
{fila("#F04438", "Montaje no realizado", "PUN-03 · Café Montaña", "Faltó el material", "rojo-t", "Ver detalle")}
{fila("#F79009", "Planograma sin publicar", "GON-05 · cara A · versión 3", "Borrador", "ambar-t", "Publicar")}
{fila("#F79009", "Reserva por confirmar", "GON-13 · Lácteos Andinos", "Caduca hoy", "rojo-t", "Confirmar")}
{fila("#F79009", "Contrato sin planometría", "GON-02 · Aseo Total", "Desde el 20/10", "ambar-t", "Adjuntar")}
{fila("#64748B", "Participación sin ubicar", "GON-03 cara A · Lácteos Andinos", "25 % de la cara", "sub", "Ubicar")}</div></section>
<section class="tarjeta"><header><h2>Actividad reciente</h2><span class="btn enl">Bitácora</span></header><div class="lista">
{act("#12B76A", "Planograma publicado", "GON-12 · cara A · versión 1", "10:24 a. m.")}
{act("#12B76A", "Montaje registrado", "PUN-05 · con foto", "9:15 a. m.")}
{act("#1570EF", "Contrato creado", "PUN-08 · Galletas Sol", "8:40 a. m.")}
{act("#64748B", "Distribución actualizada", "GON-03 · 4 zonas", "8:20 a. m.")}
{act("#1570EF", "Reserva provisional", "GON-13 · Lácteos Andinos", "ayer, 5:10 p. m.")}
{act("#12B76A", "Contrato renovado", "PUN-02 · Snacks Norte", "ayer, 3:42 p. m.")}</div></section></div></div>'''
pagina("inicio", "Inicio", inicio)

# ---------- Disponibilidad ----------
leyenda = '<div class="leyenda">' + "".join(f'<span><i style="background:{c}"></i>{t}</span>' for c, t in [("#12B76A", "Disponible"), ("#F79009", "Se libera en tus fechas"), ("#F04438", "Ocupado"), ("#F79009;outline:1.5px dashed #F79009;background:#fff", "Reservado"), ("#94A3B8", "No comercializable")]) + "</div>"
lista_d = "".join(f'<div class="registro" style="padding:.75rem 0">{mini(t, 36)}<div><b>{c}</b> · {n}<div class="sub">{d}</div></div></div>' for t, c, n, d in [("punta", "PUN-07", "Punta de góndola 7", "Libre desde el 31/10/2026 · tarifa " + fmt(600000) + " /mes"), ("punta", "PUN-08", "Punta de góndola 8", "Libre desde el 08/10/2026 · tarifa " + fmt(600000) + " /mes"), ("punta", "PUN-09", "Punta de góndola 9", "Libre desde el 01/09/2026"), ("gondola", "GON-12", "Góndola 12", "Libre desde el 01/08/2026 · " + fmt(450000) + " /mes por cara"), ("gondola", "GON-04", "Góndola 4", "Desde el 16/11/2026 · cubre 77 de 92 días")])
ctl_mapa = '<div class="ctl-mapa"><span class="c on">2D</span><span class="c">3D</span><span class="esp"></span><span class="c" aria-label="Acercar">+</span><span class="c" aria-label="Alejar">−</span><span class="c" aria-label="Centrar">' + I("pin", 17) + '</span></div>'
disp = f'''<div class="contenido">{cab("Disponibilidad de espacios", "Elegí las fechas: el plano dice qué está libre, hasta cuándo está ocupado y desde cuándo se libera.", '<span class="btn">Cargar desde planilla</span><span class="btn">Nuevo contrato</span>')}
<section class="tarjeta resumen-filtros solo-movil-flex"><span class="txt"><b style="display:block">01/11/2026 → 31/01/2027</b><span class="sub" style="display:block">92 días · CENTRO · todos los muebles</span></span><span class="btn">Cambiar</span></section>
<section class="tarjeta form-filtros"><div class="form-fila">
<div class="campo"><label>Fecha de inicio</label><span class="ctl"><span>01/11/2026</span>{I("calendario", 16, "#667085")}</span></div>
<div class="campo"><label>Duración</label><span class="ctl"><span>3 meses · hasta 31/01/2027</span>{I("abajo", 16, "#667085")}</span></div>
<div class="campo"><label>Sede</label><span class="ctl"><span>CENTRO</span>{I("abajo", 16, "#667085")}</span></div>
<div class="campo"><label>Tipo de mueble</label><span class="ctl"><span>Todos</span>{I("abajo", 16, "#667085")}</span></div>
<span class="btn pri grande">{I("buscar", 16, "#fff")}Buscar</span></div></section>
<div class="cab" style="align-items:center"><div class="tit"><b style="display:block;font-size:var(--fs-h2)">16 espacios para esas fechas</b><span class="sub" style="display:block">4 libres todas las fechas · 8 libres una parte</span></div><div class="acciones"><span class="seg"><span>{I("lista", 15)}Lista</span><span aria-pressed="true">{I("mapa", 15)}Mapa</span></span><span class="btn">{I("filtro", 15)}Filtros</span></div></div>
<div class="disp llenar"><section class="tarjeta" style="padding:.75rem"><div class="plano-env">{plano_svg(EST_F2, {}, sel="GON-04", vb=(-40, -20, 1080, 560), tam=1.25)}{ctl_mapa}</div>
<div class="franja" style="margin-top:.75rem"><span class="txt"><b>GON-04</b> · Góndola 4 <span class="pill warn">Se libera</span><br><span class="sub">Ocupada por Aseo Total hasta el 15/11/2026 · disponible desde el 16/11/2026 · cubre 77 de tus 92 días</span></span><span class="btn">Ver ficha</span><span class="btn pri">Contratar desde el 16/11/2026</span></div>
<div style="margin-top:.75rem">{leyenda}</div></section>
<aside class="tarjeta lista-disp"><header><h2>Espacios libres</h2><span class="sub">5 de 16</span></header>{lista_d}</aside></div></div>'''
pagina("disponibilidad", "Contratos", disp)

# ---------- Indicadores ----------
filas_prov = [("LA", "#2563EB", "Lácteos Andinos", 2600000, "4", "26 %"), ("GS", "#E11D48", "Galletas Sol", 1740000, "3", "18 %"), ("CM", "#92400E", "Café Montaña", 1380000, "3", "14 %"), ("AT", "#0891B2", "Aseo Total", 1130000, "2", "11 %")]
lg = lambda a, b: f'<span class="mini" style="background:{b};color:#fff;font-weight:800;font-size:var(--fs-xs);border:0;width:1.875rem;height:1.875rem">{a}</span>'
tabla_prov = ('<div class="tabla-env"><table><thead><tr><th class="cod">Proveedor</th><th>Canon /mes</th><th>Espacios</th><th>% del total</th></tr></thead><tbody>'
              + "".join(f'<tr><td class="cod"><span style="display:inline-flex;align-items:center;gap:.6rem">{lg(a, b)}{c}</span></td><td>{fmt(d)}</td><td>{e}</td><td>{f_}</td></tr>' for a, b, c, d, e, f_ in filas_prov) + "</tbody></table>"
              + '<div class="registros">' + "".join(f'<div class="registro">{lg(a, b)}<b>{c}</b><dl><dt>Canon /mes</dt><dd>{fmt(d)}</dd><dt>Espacios</dt><dd>{e}</dd><dt>% del total</dt><dd>{f_}</dd></dl></div>' for a, b, c, d, e, f_ in filas_prov) + "</div></div>")
venc_f = [("Galletas Sol", "PUN-07", "30/10/2026", True), ("Aseo Total", "GON-04", "15/11/2026", True), ("Limpio Hogar", "PUN-01", "30/11/2026", False)]
tabla_ven = ('<div class="tabla-env"><table><thead><tr><th class="cod">Proveedor</th><th>Espacio</th><th>Vence</th><th>Acción</th></tr></thead><tbody>'
             + "".join(f'<tr><td class="cod">{a}</td><td><b>{b}</b></td><td class="{"rojo-t" if u else ""}">{c}</td><td><span class="btn suave" style="color:var(--blue-ink)">Renovar</span></td></tr>' for a, b, c, u in venc_f) + "</tbody></table>"
             + '<div class="registros">' + "".join(f'<div class="registro"><b style="grid-column:1/-1">{a} · {b}</b><dl><dt>Vence</dt><dd class="{"rojo-t" if u else ""}">{c}</dd></dl><div class="acc"><span class="btn">Renovar</span></div></div>' for a, b, c, u in venc_f) + "</div></div>")
indic = f'''<div class="contenido">{cab("Indicadores comerciales", "Resumen del desempeño de la sede · comparado con septiembre 2026.", '<span class="seg"><span aria-pressed="true">Al mes</span><span>Total del contrato</span></span><span class="btn">CENTRO</span><span class="btn">Octubre 2026</span>')}
<div class="kpis">
<div class="tarjeta kpi"><span class="t">Canon del mes</span><span class="n">{fmt(9939500)}</span><span class="verde">↑ 4,7 % · 81 % del potencial</span></div>
<div class="tarjeta kpi"><span class="t">Contratos activos</span><span class="n">19</span><span class="verde">↑ 2 vs. septiembre</span></div>
<div class="tarjeta kpi"><span class="t">Ocupación</span><span class="n">86 %</span><span><span class="pill warn">Bajo la meta de 90 %</span></span></div>
<div class="tarjeta kpi"><span class="t">Canon ÷ tarifa</span><span class="n">94 %</span><span><span class="pill warn">Bajo la meta de 95 %</span></span></div></div>
<div class="dos"><section class="tarjeta"><header><h2>Canon por mes</h2><span class="btn enl">Tabla de contratos</span></header>{barras_f().replace('<svg width="100%" height="230"', '<svg style="width:100%;height:auto;display:block"').replace('font-size="11.5"', 'font-size="13.5"').replace('font-size="12"', 'font-size="15"').replace('font-size="11"', 'font-size="14"').replace('font-size="12.5"', 'font-size="15"')}</section>
<section class="tarjeta"><header><h2>Ocupación por tipo de mueble</h2></header><div style="display:flex;flex-wrap:wrap;align-items:center;gap:1rem 1.5rem">{dona().replace('<svg width="180" height="180"', '<svg style="width:12rem;height:12rem;flex:none"')}<div style="flex:1 1 12rem;min-width:0">{ley_d}</div></div></section></div>
<div class="dos llenar"><section class="tarjeta"><header><h2>Proveedores que más pagan</h2><span class="btn enl">Quién paga el canon</span></header>{tabla_prov}</section>
<section class="tarjeta"><header><h2>Contratos por vencer (60 días)</h2></header>{tabla_ven}</section></div></div>'''
pagina("indicadores", "Indicadores", indic)

# ---------- Montajes ----------
MR = [("gondola", "GON-05 A", "Arroz La Esquina y 3 más", "Planograma", "Hoy 3:00 p. m.", True, ("warn", "Montada, falta revisar"), "Revisar", True),
      ("punta", "PUN-05", "Galletas Sol", "Contrato", "Hoy 5:00 p. m.", False, ("warn", "Montado, sin verificar"), "Verificar", True),
      ("punta", "PUN-08", "Galletas Sol", "Contrato", "01/11/2026", False, ("neu", "Aviso enviado"), "Ver", False),
      ("gondola", "GON-03 A", "Lácteos Andinos · 25 %", "Participación", "28/10/2026", False, ("warn", "Falta ubicar la zona"), "Ubicar", False),
      ("gondola", "GON-02 A", "Aseo Total", "Contrato", "30/10/2026", False, ("neu", "Falta planometría"), "Adjuntar", False)]
tabla_m = ('<div class="tabla-env"><table><thead><tr><th></th><th class="cod">Espacio</th><th>Proveedor o destino</th><th>Tipo</th><th>Fecha límite</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'
           + "".join(f'<tr><td>{mini(t)}</td><td class="cod"><b>{c}</b></td><td>{p}</td><td>{tp}</td><td class="{"rojo-t" if u else ""}">{f_}</td><td><span class="pill {e[0]}">{e[1]}</span></td><td><span class="btn {"pri" if pr else "suave"}">{a}</span></td></tr>' for t, c, p, tp, f_, u, e, a, pr in MR) + "</tbody></table>"
           + '<div class="registros">' + "".join(f'<div class="registro">{mini(t)}<div><b>{c}</b> · {tp}<div class="sub">{p}</div></div><dl><dt>Fecha límite</dt><dd class="{"rojo-t" if u else ""}">{f_}</dd><dt>Estado</dt><dd><span class="pill {e[0]}">{e[1]}</span></dd></dl><div class="acc"><span class="btn {"pri" if pr else ""}">{a}</span></div></div>' for t, c, p, tp, f_, u, e, a, pr in MR) + "</div></div>")
pest = '<div class="chips">' + "".join(f'<span class="btn {"suave" if not on else ""}" style="{"background:var(--blue-50);color:var(--blue-ink);border-color:transparent" if on else ""}">{t}</span>' for t, on in [("Pendientes (5)", True), ("No realizados (1)", False), ("Verificados (3)", False), ("Requieren corrección (1)", False)]) + "</div>"
mont = f'''<div class="contenido">{cab("Montajes", "Seguimiento de los montajes de contratos y planogramas.", '<span class="btn">Sede: CENTRO</span><span class="btn">Responsable: todos</span><span class="btn">Hoy, 26 oct 2026</span>')}
{pest}<section class="tarjeta" style="padding:0;overflow:hidden">{tabla_m}</section>
<div class="dos llenar"><section class="tarjeta"><header><h2>Detalle · GON-05 cara A · versión 2</h2><span class="pill warn">Montada, falta revisar</span></header>
<div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;align-items:center"><div style="flex:1 1 16rem;height:14rem">{cara_zonas([(0, .3, 0, 5, ROJO_Z, "1|30 %"), (.3, .55, 0, 5, AZUL_Z, "2|25 %"), (.55, .8, 0, 5, VERDE_Z, "3|25 %"), (.8, 1, 0, 5, AMA_Z, "4|20 %")], w=420, h=280)}</div>
<div style="flex:1 1 14rem;display:flex;flex-direction:column;gap:.5rem"><span><b>Zona 1 · 30 %</b> <span class="sub">Arroz La Esquina</span></span><span><b>Zona 2 · 25 %</b> <span class="sub">Aceites</span></span><span><b>Zona 3 · 25 %</b> <span class="sub">Pastas</span></span><span><b>Zona 4 · 20 %</b> <span class="sub">2×1 granos</span></span>
<span class="acciones" style="margin-top:.5rem"><span class="btn pri">Ver guía de montaje</span><span class="btn">Revisar el montaje</span></span></div></div></section>
<section class="tarjeta"><header><h2>Información</h2></header>{"".join(f'<div class="dato"><small>{a}</small><b>{b}</b></div>' for a, b in [("Sede", "CENTRO"), ("Pasillo", "5"), ("Mueble", "Góndola doble · 1,20 m · 5 estantes"), ("Fecha límite", "26/10/2026 · 3:00 p. m."), ("Responsable", "Luis Pérez")])}</section></div></div>'''
pagina("montajes", "Montajes", mont)

# ---------- Plano 2D ----------
cat = '<section class="tarjeta catalogo"><header><h2>Catálogo</h2></header><span class="buscar" style="max-width:none;margin-bottom:.5rem">' + I("buscar", 15, "#6B7280") + '<span>Buscar mueble</span></span>' + "".join(f'<div class="cat-item">{mini(t, 32)}<span class="n">{n}</span><span class="sub">{k}</span></div>' for t, n, k in [("gondola", "Góndola doble", "3"), ("gondola", "Góndola sencilla", "2"), ("punta", "Punta de góndola", "2"), ("nevera", "Nevera", "4"), ("punta", "Exhibidor", "3"), ("gondola", "Isla", "1")]) + '<span class="btn enl" style="margin-top:.5rem">Ver el catálogo completo</span></section>'
props = '<section class="tarjeta props"><header><h2>GON-03</h2><span class="btn enl" aria-label="Cerrar">' + I("x", 16) + '</span></header><span class="sub">Góndola doble · pasillo 2</span>' + "".join(f'<div class="dato"><small>{a}</small><b>{b}</b></div>' for a, b in [("Medidas", "1,20 × 0,60 × 1,80 m"), ("Caras", "A y B · 5 estantes"), ("¿Se contrata?", "Sí"), ("Cara A", "Por participación · queda 20 %"), ("Cara B", "Entera · Café Montaña hasta 31/05/2027")]) + '<div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.75rem"><span class="btn">Distribuir la cara A</span><span class="btn">Planograma de la cara B</span><span class="btn enl">Ficha completa del mueble</span></div></section>'
herr = '<div class="herr">' + "".join(f'<span class="{c}">{I(i, 15)}{t}</span>' for t, i, c in [("Catálogo", "cuadros", "cat-btn"), ("Seleccionar", "mano", "on"), ("Rotar", "rotar", ""), ("Duplicar", "copiar", ""), ("Deshacer", "deshacer", ""), ("Rehacer", "rehacer", ""), ("Eliminar", "papelera", "rojo"), ("Propiedades", "info", "props-btn")]) + "</div>"
zoom = '<div class="ctl-mapa"><span class="esp"></span><span class="c" aria-label="Acercar">+</span><span class="c" aria-label="Alejar">−</span><span class="c" aria-label="Centrar en todo">' + I("pin", 17) + "</span></div>"
def plano2d(estado, nombre):
    cuerpo = f'''{cab("Plano de la sede — CENTRO", "Dibujá y ordená los muebles · 16 muebles · 22 espacios contratables.", '<span class="btn">Contorno de la sede</span><span class="btn">Capas</span><span class="seg"><span aria-pressed="true">2D</span><span>3D</span></span>')}
<div class="editor2d {estado}">{cat}<div class="lienzo">{herr}<div class="plano-env">{plano_svg({c: "n" for c, *_ in MUEBLES}, {}, sel="GON-03", vb=(-30, -24, 1060, 560), cotas=True, tam=1.45)}{zoom}<span class="pill ok validacion">Validación: sin inconsistencias</span></div></div>{props}</div>'''
    pagina(nombre, "Plano de la sede", cuerpo, "editor")
plano2d("", "plano2d")
plano2d("ver-props", "plano2d-propiedades")
plano2d("ver-cat", "plano2d-catalogo")

# ---------- Plano 3D ----------
props3d = '<section class="tarjeta props3d"><header><h2>PUN-08</h2><span class="pill ok">Disponible</span></header><span class="sub">Punta de góndola · pasillo 4</span>' + "".join(f'<div class="dato"><small>{a}</small><b>{b}</b></div>' for a, b in [("Dimensiones", "0,90 × 0,60 × 1,60 m"), ("Cómo se vende", "Entera"), ("Estado", "Disponible desde el 08/10/2026")]) + '<div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.75rem"><span class="btn pri grande">Contratar este espacio</span><span class="btn">Probar un producto</span><span class="btn">Presentar al proveedor</span></div></section>'
vistas = '<div class="chips">' + "".join(f'<span class="btn {"" if t != "Orbital" else ""}" style="{"background:var(--blue-50);color:var(--blue-ink);border-color:transparent" if t == "Orbital" else ""}">{I(i, 15)}{t}</span>' for t, i in [("Orbital", "rotar"), ("Primera persona", "usuario"), ("Cenital", "mapa"), ("Con arte", "producto"), ("Bajar imagen", "descargar"), ("Propiedades", "info")]) + "</div>"
def plano3d(estado, nombre):
    cuerpo = f'''{cab("Vista 3D — CENTRO", "Recorré la tienda en tres dimensiones.", '<span class="seg"><span>2D</span><span aria-pressed="true">3D</span></span>')}{vistas}
<div class="editor3d {estado}"><div class="escena">{iso3d()}</div>{props3d}</div>'''
    pagina(nombre, "Plano de la sede", cuerpo, "editor")
plano3d("", "plano3d")
plano3d("ver-props", "plano3d-propiedades")

# ---------- Modal de tarifas sobre Indicadores ----------
TT = [("Punta de góndola", 600000, 600000), ("Góndola, por cara", 450000, 450000), ("Nevera", 1400000, 1400000), ("Exhibidor", 350000, 350000), ("Isla", 500000, 480000), ("Cabecera de caja", 300000, 300000), ("Robatope", None, None), ("Ristra", None, None)]
modal = ('<div class="velo"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="tt"><header><h2 id="tt">Tarifas de referencia</h2><span class="btn suave" aria-label="Cerrar">' + I("x", 16) + '</span></header><div class="cuerpo">'
         '<p class="sub" style="margin-top:0">Canon mensual de referencia por tipo de mueble. La columna de la sede la ajusta sólo ahí.</p>'
         '<div class="tarifa tarifa-cab" style="border-top:0"><span class="sub">Tipo</span><span class="sub">General</span><span class="sub">CENTRO</span></div>'
         + "".join(f'<div class="tarifa"><span class="tipo">{t}</span><span><span class="et">General</span><span class="ctl">{fmt(g) if g else "—"}</span></span><span><span class="et">CENTRO</span><span class="ctl">{fmt(c) if c else "—"}</span></span></div>' for t, g, c in TT)
         + '</div><footer>Los cambios se guardan solos y se comparten con las demás estaciones.</footer></div></div>')
pagina("tarifas", "Indicadores", indic, extra=modal)
print("prototipo ok")
