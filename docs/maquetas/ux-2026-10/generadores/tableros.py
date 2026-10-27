import sys
from base import *
from mapa import MAPA
OUT = sys.argv[1]

def guardar(nombre, titulo, w, h, cuerpo, **kw):
    open(f"{OUT}/{nombre}.dc.html", "w").write(tablero(titulo, w, h, cuerpo, **kw))

# ---------- piezas ----------
EST = {"d": ("#CDE7D6", VERDE, "solid"), "p": ("#F6E3B8", "#C98A0B", "solid"), "c": ("#F5D0CC", ROJO, "solid"), "r": ("#FFFFFF", "#C98A0B", "dashed")}
def celda(cod, e, w=None, h=56, sel=False, marca=False, fs=12):
    bg, bc, bs = EST[e]
    ring = f"box-shadow: 0 0 0 3px {TINTA};" if sel else (f"box-shadow: 0 0 0 3px {AMARILLO};" if marca else "")
    ww = f"width: {w}px;" if w else ""
    return f'<span style="{ww} height: {h}px; border-radius: 8px; background: {bg}; border: 2px {bs} {bc}; {ring} display: flex; align-items: center; justify-content: center; font-family: ui-monospace, Menlo, monospace; font-size: {fs}px; font-weight: 700;">{cod}</span>'

def plano(sel=None, marca=(), fs=12, h1=56, h2=44):
    g = [("GON-01", "p"), ("GON-02", "p"), ("GON-03", "p"), ("GON-04", "c")]
    p = [("PUN-01", "c"), ("PUN-02", "p"), ("PUN-03", "c"), ("PUN-04", "c"), ("PUN-05", "c"), ("PUN-06", "c"), ("PUN-07", "c"), ("PUN-08", "d"), ("PUN-09", "d")]
    t = [("GON-12", "d"), ("GON-13", "r"), ("NEV-01", "p")]
    fila = lambda xs, n, h, gap: f'<div style="display: grid; grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px;">' + "".join(celda(c, e, h=h, sel=(c == sel), marca=(c in marca), fs=fs) for c, e in xs) + "</div>"
    return fila(g, 4, h1, 14) + fila(p, 9, h2, 8) + fila(t + [], 4, h1, 14).replace("</div>", '<span></span></div>', 1)

def clave():
    it = [("d", "Disponible"), ("p", "Contratado parcialmente"), ("c", "Contratado"), ("r", "Reservado")]
    return '<div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px;">' + "".join(
        f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 14px; height: 14px; border-radius: 4px; background: {EST[e][0]}; border: 2px {EST[e][2]} {EST[e][1]}; box-sizing: border-box;"></span>{t}</span>' for e, t in it) + "</div>"

def tarjeta(cuerpo, extra=""):
    return f'<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; min-width: 0; {extra}">{cuerpo}</div>'

def nota(txt):
    return f'<div style="flex-shrink: 0; display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 24px; background: #2B2B29; color: #F4F2EC; font-size: 13px;">{ico("alerta", color=AMARILLO)}<span>{txt}</span></div>'

def velo():
    return '<div style="position: absolute; inset: 0; background: rgba(20,20,19,.38);"></div>'

def barra_modulo(titulo, derecha, sub=""):
    s = f'<span style="font-size: 14px; color: {GRIS};">{sub}</span>' if sub else ""
    return f'<div style="display: flex; align-items: center; gap: 10px; padding: 16px 24px 0;"><h1 style="margin: 0; font-size: 22px;">{titulo}</h1>{s}<span style="flex-grow: 1;"></span>{derecha}</div>'

def boton_mas(abierto=False):
    st = f"background: {TINTA}; color: {BLANCO}; border: 0;" if abierto else f"background: {BLANCO}; border: 1px solid #DEDBD3;"
    return f'<button type="button" aria-expanded="{str(abierto).lower()}" style="display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border-radius: 10px; {st} font: inherit; font-size: 14px; font-weight: 600;">Más{ico("abajo", color=BLANCO if abierto else TINTA)}</button>'

def menu(grupos, left=None, right=None, top=120, w=320):
    pos = f"left: {left}px;" if left is not None else f"right: {right}px;"
    cuerpo = ""
    for i, (tit, items) in enumerate(grupos):
        borde = "" if i == 0 else f"border-top: 1px solid #ECEAE4;"
        cuerpo += f'<div style="display: flex; flex-direction: column; padding: 8px 0; {borde}"><span style="padding: 4px 16px; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">{tit.upper()}</span>'
        for it in items:
            t, d = it if isinstance(it, tuple) else (it, "")
            dd = f'<span style="font-size: 12px; color: {GRIS};">{d}</span>' if d else ""
            cuerpo += f'<a href="#" style="text-decoration: none; display: flex; flex-direction: column; gap: 1px; padding: 7px 16px; font-size: 14px;">{t}{dd}</a>'
        cuerpo += "</div>"
    return f'<div role="menu" style="position: absolute; {pos} top: {top}px; width: {w}px; border-radius: 14px; background: {BLANCO}; border: 1px solid #DEDBD3; box-shadow: 0 12px 32px rgba(20,20,19,.18); z-index: 5;">{cuerpo}</div>'

def grupo_acordeon(tit, n, abierto=False, items=()):
    flecha = ico("abajo") if abierto else '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141413" stroke-width="1.75" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
    cab = f'<button type="button" aria-expanded="{str(abierto).lower()}" style="display: flex; align-items: center; gap: 8px; width: 100%; height: 44px; padding: 0 14px; border: 0; background: transparent; font: inherit; font-size: 14px; font-weight: 700; text-align: left;">{flecha}<span style="flex-grow: 1;">{tit}</span><span style="font-size: 12px; font-weight: 600; color: {GRIS};">{n} acciones</span></button>'
    cuerpo = ""
    if abierto:
        cuerpo = '<div style="display: flex; flex-direction: column; gap: 2px; padding: 0 14px 12px 38px;">' + "".join(items) + "</div>"
    return f'<div style="border-top: 1px solid #ECEAE4;">{cab}{cuerpo}</div>'

def accion(t, d=""):
    dd = f'<span style="font-size: 12px; color: {GRIS};">{d}</span>' if d else ""
    return f'<a href="#" style="text-decoration: none; display: flex; flex-direction: column; gap: 1px; padding: 6px 0; font-size: 14px; font-weight: 600;">{t}{dd}</a>'

# ---------- 1 · Capas ----------
from collections import Counter
cnt = Counter()
for _, capa, _, ns in MAPA: cnt[capa] += len(ns)
def caja_capa(n, titulo, cuanto, que, ejemplos, color):
    ej = "".join(f'<li style="margin: 0 0 4px;">{e}</li>' for e in ejemplos)
    return f'''<div style="display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; border-top: 6px solid {color};">
<span style="font-size: 12px; font-weight: 700; letter-spacing: .08em; color: {color};">CAPA {n}</span>
<b style="font-size: 19px;">{titulo}</b>
<span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">{que}</span>
<span style="font-size: 13px; font-weight: 700;">{cuanto} de las 187 funciones de hoy</span>
<ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #3D3D3A; line-height: 1.45;">{ej}</ul>
</div>'''
COL = {"V": TINTA, "F": "#2F5DA8", "M": AMBAR, "A": "#5E5D59", "P": VERDE}
flecha_h = f'<div style="display: flex; align-items: center; justify-content: center;">{ico("flecha", 28, "#9A978F", 2)}</div>'
capas = f'''<div style="display: flex; flex-direction: column; gap: 22px; padding: 40px 48px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 30px;">Lo que se usa, a la mano. Lo raro, a un clic.</h1>
<span style="font-size: 16px; color: {GRIS};">Regla: <b>todo lo que se usa a diario o de vez en cuando queda a la vista</b>, en el módulo o en la ficha, sin desplegar nada. Un clic más adentro van sólo las funciones raras y peligrosas. La configuración va a Ajustes. Ninguna de las 187 desaparece.</span></div>
<div style="display: grid; grid-template-columns: 1fr 36px 1fr 36px 1fr 36px 1fr; gap: 0; align-items: stretch;">
{caja_capa(1, "A la vista en el módulo", cnt["V"], "La barra y cada módulo. Una sola acción principal (amarilla); el resto, con nombre, nunca sólo un ícono.", ["Nuevo contrato · Ver en 3D con el proveedor", "Ver el plano por disponibilidad, fecha o tarifa", "Presentar al proveedor · Probar un producto", "Bandeja de pendientes"], COL["V"])}
{flecha_h}
{caja_capa(2, "En la ficha, a la vista", cnt["F"], "Al tocar un espacio o un mueble se abre su <b>ficha</b>, con lo que aplica a ese objeto <b>a la vista, sin desplegar</b>.", ["Renovar y editar el contrato", "Planometría y archivos del contrato", "Ver en 3D, distribuir la cara, planograma", "Medidas, código y forma de contratar el mueble"], COL["F"])}
{flecha_h}
{caja_capa(3, "Un clic más: sólo lo raro", cnt["M"], "Lo que casi nunca se usa o borra algo. Plegado en la ficha o en «Más». <b>Cada persona puede fijar en su barra</b> lo que use seguido.", ["Cancelar contrato (con confirmación)", "Limpiar todo el 3D", "Atajos de teclado", "Copiar de la otra cara, historial"], COL["M"])}
{flecha_h}
{caja_capa(4, "Ajustes", cnt["A"], "Configuración: se hace al empezar o cuando algo cambia. <b>Agrupado por tema</b>, detrás del engranaje.", ["Tarifas y temporadas", "Usuarios y permisos", "Avisos y responsables por sede", "Copia de seguridad, bitácora"], COL["A"])}
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">
<div style="display: flex; gap: 14px; align-items: flex-start; padding: 18px 20px; border-radius: 16px; background: {TINTA}; color: {BLANCO};">{ico("buscar", 22, AMARILLO, 2)}<span style="display: flex; flex-direction: column; gap: 4px;"><b style="font-size: 16px;">Buscador (Ctrl K): atraviesa las cuatro capas</b><span style="font-size: 14px; color: #E4E2DC; line-height: 1.5;">Se escribe el nombre de una función («renovar», «tarifa», «renumerar») o un código («PUN-07») y lleva directo, esté en la capa que esté. Entiende sinónimos: «planilla» encuentra «Cargar contratos desde planilla».</span></span></div>
<div style="display: flex; gap: 14px; align-items: flex-start; padding: 18px 20px; border-radius: 16px; background: {BLANCO}; border: 2px solid {ROJO};">{ico("campana", 22, ROJO, 2)}<span style="display: flex; flex-direction: column; gap: 4px;"><b style="font-size: 16px;">Pendientes: aparte, desde cualquier módulo</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">Una bandeja con contador en la barra. No ocupa ninguna pantalla: se abre encima del módulo en que estés y cada fila señala su espacio en el plano. Se abre sola al primer ingreso del día si hay algo con fecha límite hoy.</span></span></div>
</div>
<div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px;">
{tarjeta(f"""<b style="font-size: 15px;">Qué ve cada rol</b>
<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px 14px; font-size: 14px; line-height: 1.45;">
<b>Administrador</b><span>Los 4 módulos, la bandeja completa y Ajustes. Entra al último módulo que usó.</span>
<b>Trabajador</b><span>Montajes e Indicadores, sin importes. En la ficha ve el estado, no las acciones de contrato. Entra a Montajes.</span>
<b>Montador sin cuenta</b><span>Sólo la hoja de montaje que le llega por enlace. Sin cambios.</span>
<b>Operador</b><span>La consola de Plataforma. Sin cambios.</span></div>""")}
{tarjeta(f"""<b style="font-size: 15px;">Lo que cambia para quien usa el sistema</b>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; font-size: 14px; line-height: 1.45;">
<span style="color: {GRIS};">Hoy</span><span style="color: {GRIS};">Propuesta</span>
<span>2 niveles de menú y 9 botones en la barra de Sede</span><span><b>4 módulos</b> en un solo nivel</span>
<span>6 caminos distintos para entrar a Distribución</span><span><b>1 ficha</b>, igual en todos los módulos</span>
<span>Funciones escondidas en clic derecho, teclas o URL</span><span>Todas con nombre, <b>en el buscador</b></span>
<span>«Para revisar 56» dentro de Supervisar</span><span><b>Bandeja aparte</b>, por fecha límite</span></div>""")}
</div>
<span style="font-size: 13px; color: {GRIS};">Quedan sin cambios, con pantalla propia: entrada y cuenta (10 funciones), los enlaces del montador (2) y la consola de plataforma (9). El mapa completo, función por función con su número del inventario, está al final de esta página.</span>
</div>'''
guardar("Capas", "Las cuatro capas", 1760, 900, capas)

# ---------- 2 · Contratos ----------
def lente(op, act):
    return '<span role="tablist" aria-label="Ver el plano por" style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;">' + "".join(
        f'<span style="padding: 6px 10px; border-radius: 8px; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + "; font-weight: 600;" if o == act else ""}">{o}</span>' for o in op) + "</span>"
der = boton("Cargar desde planilla", icono="planilla") + boton("Nuevo contrato", "pri", icono="mas2")
LIB = {"PUN-08": "hoy", "PUN-09": "hoy", "GON-12": "hoy", "PUN-07": "31/10", "GON-04": "16/11", "PUN-01": "01/12", "PUN-03": "01/02", "PUN-04": "01/01", "PUN-05": "15/12", "PUN-06": "01/03"}
plano_fecha = plano(sel="PUN-08")
for c, f in LIB.items():
    plano_fecha = plano_fecha.replace(f">{c}</span>", f'><span style="display: flex; flex-direction: column; align-items: center; line-height: 1.15;">{c}<span style="font-family: Inter, system-ui, sans-serif; font-size: 10px; font-weight: 600; color: #3D3D3A;">{f}</span></span></span>')
contratos_cuerpo = encabezado("Contratos") + barra_modulo("Contratos", der, "Período: 01/11/2026 – 30/11/2026") + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; padding: 16px 24px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Elegí uno o más espacios</b><span style="font-size: 13px; color: {GRIS};">Ver el plano por</span>{lente(["Disponibilidad", "Fecha en que se libera", "Tarifa"], "Fecha en que se libera")}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 28px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_fecha}</div><div style="display: flex; align-items: center; gap: 12px;">{clave()}<span style="flex-grow: 1;"></span><span style="font-size: 13px; color: {GRIS};">Debajo del código: día en que queda disponible.</span></div>')}
{tarjeta(f"""<span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">PASO 1 DE 4 · ESPACIO</span>
<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid {BORDE};"><div style="display: flex; align-items: center; gap: 8px;"><b style="font-size: 15px; flex-grow: 1;">PUN-08 · Punta de góndola 8</b><a href="#" style="font-size: 13px; font-weight: 600;">Quitar</a></div><span style="font-size: 13px; color: #3D3D3A;">Disponible del 01/11/2026 al 30/11/2026</span><span style="font-size: 13px; color: #3D3D3A;">Tarifa de referencia: $ 600.000 /mes</span></div>
<span style="font-size: 13px; color: {GRIS};">Tocá otro espacio en el plano para sumarlo al mismo contrato.</span>
{boton("Ver en 3D con el proveedor", icono="cubo")}
<div style="display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: #F4F2EC; font-size: 13px; color: #3D3D3A;"><b style="color: {TINTA};">Siguen</b><span>2 · Proveedor y vigencia</span><span>3 · Canon</span><span>4 · Confirmación (o reserva provisional)</span></div>
<div style="margin-top: auto; display: flex; align-items: center; gap: 8px;">{boton("Empezar de nuevo", "fan")}<span style="flex-grow: 1;"></span>{boton("Siguiente: proveedor", "pri")}</div>""")}
</main>
'''
contratos = contratos_cuerpo + nota("A la vista lo que se usa al vender: el plano por disponibilidad, por fecha o por tarifa (hoy son paneles diarios), Ver en 3D con el proveedor y Empezar de nuevo. Contratos no necesita «Más».")
guardar("Contratos", "Contratos: lo diario a la vista", 1280, 860, contratos)

# ---------- 3 · Ficha del espacio ----------
kpi = lambda t, v, s, c=TINTA: f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border-radius: 14px; background: {BLANCO}; border: 1px solid {BORDE};"><span style="font-size: 13px; color: {GRIS};">{t}</span><b style="font-size: 22px; color: {c};">{v}</b><span style="font-size: 12px; color: {GRIS};">{s}</span></div>'
fila_dato = lambda k, v: f'<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; font-size: 14px;"><span style="color: {GRIS};">{k}</span><span>{v}</span></div>'
ficha = f'''<aside aria-label="Ficha de PUN-07" style="display: flex; flex-direction: column; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden; min-height: 0;">
<div style="display: flex; flex-direction: column; gap: 10px; padding: 16px;">
<div style="display: flex; align-items: flex-start; gap: 8px;"><span style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1;"><b style="font-size: 18px;">PUN-07 · Punta de góndola 7</b><span style="align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: #F5D0CC; color: {ROJO}; font-size: 12px; font-weight: 700;">Contratado · vence el 30/10/2026</span></span><button type="button" aria-label="Cerrar la ficha" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
{fila_dato("Proveedor", "Galletas Sol · marca Sol")}
{fila_dato("Vigencia", "01/05/2026 – 30/10/2026 · 6 meses")}
{fila_dato("Canon", "$ 600.000 /mes · $ 3.600.000 total del contrato")}
{fila_dato("Montaje", "Verificado: coincide")}
{boton("Renovar contrato", "pri", "width: 100%; margin-top: 4px;")}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{boton("Editar contrato")}{boton("Ver en 3D", icono="cubo")}</div>
</div>
<div style="display: flex; flex-direction: column; gap: 2px; padding: 4px 16px 10px; border-top: 1px solid #ECEAE4;">
<span style="padding: 8px 0 2px; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">MONTAJE Y DOCUMENTOS</span>
<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 14px;">{ico("planilla")}<span style="flex-grow: 1;"><b>Planometría</b> · sol-pun07.pdf</span><a href="#" style="font-size: 13px; font-weight: 600;">Cambiar</a><a href="#" style="font-size: 13px; font-weight: 600;">Quitar</a></div>
<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 14px;">{ico("planilla")}<span style="flex-grow: 1;"><b>Archivos del contrato</b> · 2</span><a href="#" style="font-size: 13px; font-weight: 600;">Ver</a></div>
</div>
{grupo_acordeon("Otras acciones del contrato", 3)}
<div style="margin-top: auto; padding: 12px 16px; border-top: 1px solid #ECEAE4; font-size: 12px; color: {GRIS}; line-height: 1.45;">A la vista, todo lo de uso diario. Plegado, sólo lo raro: contrato con otro proveedor, negociar y cancelar el contrato. Lo que no aplica a este espacio no aparece (una punta entera no tiene participaciones).</div>
</aside>'''
TABS_IND = '<div role="tablist" style="display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: #FFFFFF; border: 1px solid #E4E2DC; font-size: 14px;">' + "".join(f'<span style="padding: 7px 12px; border-radius: 8px; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + "; font-weight: 600;" if o == "Resumen" else "font-weight: 600; color: #3D3D3A;"}">{o}</span>' for o in ["Resumen", "Tabla de contratos", "Quién paga el canon", "Participaciones de cara"]) + "</div>"
IMPORTES = '<span style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #5E5D59;">Importes<span style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #FFFFFF; border: 1px solid #E4E2DC;"><span style="padding: 5px 10px; border-radius: 8px; background: #141413; color: #FFFFFF; font-weight: 600;">Mensual</span><span style="padding: 5px 10px; color: #3D3D3A;">Total</span></span></span>'
indic = encabezado("Indicadores") + barra_modulo("Indicadores", IMPORTES, "Sede CENTRO · octubre 2026") + '<div style="padding: 12px 24px 0;">' + TABS_IND + '</div>' + f'''
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 400px; gap: 14px; padding: 14px 24px 0;">
{kpi("Canon mensual contratado", "$ 2.552.814 /mes", "+ $ 180.000 /mes respecto de septiembre 2026")}
{kpi("Espacios disponibles todo el mes", "3 espacios", "a tarifa: $ 2.793.332 /mes")}
{kpi("Contratos que vencen en 30 días", "1 contrato", "PUN-07 · vence el 30/10/2026", ROJO)}
<span></span>
</div>
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0; margin-top: -112px;">
<div style="margin-top: 112px; display: flex; min-height: 0;">{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Disponibilidad · octubre 2026</b><span style="display: inline-flex; align-items: center; gap: 8px; width: 230px; height: 36px; padding: 0 10px; border-radius: 10px; border: 1px solid #C9C6BE; font-size: 13px; color: {GRIS};">{ico("buscar", color=GRIS)}Filtrar por código o proveedor</span></div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 24px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano(sel="PUN-07")}</div><div style="display: flex; align-items: center; gap: 12px;">{clave()}</div><span style="font-size: 13px; color: {GRIS};">Tocá un espacio para abrir su ficha. Es la misma desde Contratos, Pendientes y Plano de la sede.</span>', "flex-grow: 1;")}</div>
{ficha}
</main>''' + nota("En Indicadores, a la vista: mensual | total, el filtro del plano y las cuatro vistas en pestañas. En la ficha, lo diario sin desplegar; plegado, sólo lo raro.")
guardar("Ficha", "Ficha del espacio", 1280, 860, indic)

# ---------- 4 · Bandeja de pendientes ----------
def pend(titulo, det, acciones, tag, tc):
    return f'''<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 18px; border-top: 1px solid #ECEAE4;">
<span style="align-self: flex-start; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {tc};">{tag}</span>
<b style="font-size: 15px; line-height: 1.35;">{titulo}</b><span style="font-size: 13px; color: {GRIS}; line-height: 1.45;">{det}</span>
<div style="display: flex; gap: 8px;">{acciones}</div></div>'''
fondo_plano = encabezado("Plano de la sede", bandeja_abierta=True) + barra_modulo("Plano de la sede", boton("Editar") + boton_mas()) + f'''
<main style="padding: 16px 24px; flex-grow: 1; display: flex; min-height: 0;">{tarjeta(f'<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 32px; border-radius: 12px; background: #F6F5F1;">{plano(marca=("PUN-03",))}</div>', "flex-grow: 1;")}</main>'''
bandeja = fondo_plano + velo() + f'''
<aside aria-label="Pendientes" style="position: absolute; top: 60px; right: 0; bottom: 44px; width: 470px; display: flex; flex-direction: column; background: {BLANCO}; border-left: 1px solid #DEDBD3; box-shadow: -12px 0 32px rgba(20,20,19,.16);">
<div style="display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px;"><b style="font-size: 18px; flex-grow: 1;">Pendientes · Sede CENTRO</b><button type="button" aria-label="Cerrar" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
<div style="display: flex; gap: 4px; margin: 0 18px 12px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;"><span style="flex: 1; text-align: center; padding: 7px 4px; border-radius: 8px; background: {TINTA}; color: {BLANCO}; font-weight: 600;">Fecha límite hoy · 3</span><span style="flex: 1; text-align: center; padding: 7px 4px;">Próximos 30 días · 6</span><span style="flex: 1; text-align: center; padding: 7px 4px;">Inconsistencias · 5</span></div>
{pend("PUN-03 · Punta de góndola 3: montaje no realizado", "Registrado hoy 26/10/2026 a las 09:40. Motivo: el proveedor no entregó el exhibidor. Hay foto.", boton("Ver registro y foto", "pri", h=36), "MONTAJE", AMBAR)}
{pend("GON-02 · Góndola 2, cara A: falta planometría", "Contrato con Aseo Total; empieza el 27/10/2026. Sin planometría no se envía el aviso de montaje.", boton("Adjuntar planometría", h=36), "MONTAJE", AMBAR)}
{pend("GON-13 · Góndola 13: la reserva provisional caduca hoy", "A nombre de Lácteos Andinos, del 01/11/2026 al 31/01/2027.", boton("Confirmar como contrato", h=36) + boton("Cancelar reserva", "fan", h=36), "RESERVA", "#2F5DA8")}
<div style="margin-top: auto; padding: 12px 18px; border-top: 1px solid #ECEAE4; font-size: 12px; color: {GRIS}; line-height: 1.45;">Pasar el mouse por una fila marca el espacio en el plano (PUN-03, contorno amarillo). Al resolver un pendiente, sale de la lista y aparece un aviso con «Deshacer».</div>
</aside>''' + nota("Pendientes aparte: la bandeja se abre encima de cualquier módulo (acá, Plano de la sede) y se cierra sin perder lo que estabas haciendo.")
guardar("Bandeja", "Bandeja de pendientes", 1280, 860, bandeja)

# ---------- 5 · Buscador ----------
def res(t, d, tag, sel=False):
    bg = "background: #F4F2EC;" if sel else ""
    return f'<a href="#" style="text-decoration: none; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 16px; border-radius: 10px; {bg}"><span style="display: flex; flex-direction: column; gap: 1px;"><b style="font-size: 14px;">{t}</b><span style="font-size: 12px; color: {GRIS};">{d}</span></span><span style="font-size: 11px; font-weight: 700; color: {GRIS}; padding: 2px 8px; border-radius: 999px; border: 1px solid #DEDBD3;">{tag}</span></a>'
seccion = lambda t: f'<span style="padding: 10px 16px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">{t}</span>'
buscador = contratos.replace(menu([("Consultar", [("Disponibilidad por fecha", "Cuándo se libera cada espacio"), ("Tarifa de referencia por tipo", "Canon mensual sugerido")]), ("Para el proveedor", [("Propuesta en 3D", "Visor, producto de prueba y lámina para descargar")]), ("Planilla", [("Descargar la plantilla", ".xlsx con las columnas y las instrucciones")]), ("Contrato en curso", [("Empezar de nuevo", "Descarta lo elegido en este contrato")])], right=24, top=114), "")
buscador = buscador[:buscador.rfind('<div style="flex-shrink: 0; display: flex; align-items: center; gap: 10px; height: 44px;')] + velo() + f'''
<div role="dialog" aria-label="Buscar" style="position: absolute; left: 50%; top: 96px; width: 660px; margin-left: -330px; display: flex; flex-direction: column; border-radius: 16px; background: {BLANCO}; box-shadow: 0 24px 60px rgba(20,20,19,.3); overflow: hidden;">
<div style="display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 18px; border-bottom: 1px solid #ECEAE4;">{ico("buscar", 20)}<span style="font-size: 18px; flex-grow: 1;">reno<span style="display: inline-block; width: 2px; height: 20px; background: {TINTA}; vertical-align: middle; margin-left: 1px;"></span></span><kbd style="font: inherit; font-size: 12px; padding: 2px 8px; border-radius: 6px; border: 1px solid #DEDBD3;">Esc</kbd></div>
<div style="display: flex; flex-direction: column; padding: 6px 8px 10px;">
{seccion("ACCIONES")}
{res("Renovar contrato", "Elegí el espacio; se abre con proveedor, canon y vigencia del contrato actual", "Contratos", True)}
{res("Ordenar códigos (renumerar)", "Recalcula los códigos de los muebles de una sede o de todas", "Ajustes")}
{seccion("ESPACIOS")}
{res("PUN-07 · Punta de góndola 7", "Contratado · vence el 30/10/2026 · Galletas Sol → Renovar contrato", "Ficha")}
{res("GON-04 · Góndola 4, cara B", "Contratado · vence el 15/11/2026 · Aseo Total → Renovar contrato", "Ficha")}
{seccion("GLOSARIO")}
{res("Renovar contrato", "Crea el contrato siguiente para el mismo espacio y proveedor, con los datos del actual como punto de partida", "Definición")}
</div>
<div style="display: flex; align-items: center; gap: 16px; padding: 10px 18px; border-top: 1px solid #ECEAE4; font-size: 12px; color: {GRIS};"><span>↑ ↓ para moverte · Enter para abrir</span><span style="flex-grow: 1;"></span><a href="#" style="font-weight: 600; color: {TINTA};">Ver el mapa de todas las funciones</a></div>
</div>''' + nota("Buscador (Ctrl K o la lupa): encuentra funciones de cualquier capa, espacios por código y definiciones del glosario. Ninguna función queda escondida.")
guardar("Buscador", "Buscador de funciones", 1280, 860, buscador)

# ---------- 6 · Ajustes ----------
def nav_aj(grupos, activo):
    h = ""
    for g, items in grupos:
        h += f'<span style="padding: 14px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">{g.upper()}</span>'
        for it in items:
            on = f"background: {TINTA}; color: {BLANCO};" if it == activo else ""
            h += f'<a href="#" style="text-decoration: none; padding: 8px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; {on}">{it}</a>'
    return h
GR = [("Comercial", ["Tarifas", "Temporadas"]), ("Sede y plano", ["Sedes", "Nombres de los muebles", "Ordenar códigos", "Catálogo de muebles propios"]), ("Avisos", ["Destinatarios y recordatorios", "Responsables por sede"]), ("Equipo", ["Usuarios", "Permisos"]), ("Cuenta", ["Suscripción y facturación", "Copia de seguridad", "Mis datos", "Reporte de transparencia", "Bitácora"])]
filat = lambda a, b, c, hd=False: f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 200px 200px; gap: 14px; align-items: center; padding: 10px 16px; {"background: #F4F2EC; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: " + GRIS + ";" if hd else "border-top: 1px solid #ECEAE4; font-size: 14px;"}">{a}{b}{c}</div>'
inp = lambda v: f'<span style="display: flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid #C9C6BE; font-family: ui-monospace, Menlo, monospace; font-size: 14px;">{v}</span>'
ajustes = encabezado("—").replace('aria-label="Ajustes" style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; border: 1px solid #DEDBD3; background: #FFFFFF;', 'aria-label="Ajustes" style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; border: 0; background: #141413;').replace(ico("ajustes"), ico("ajustes", color=BLANCO)) + f'''
<main style="display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; padding: 16px 24px; flex-grow: 1; min-height: 0;">
<nav aria-label="Ajustes" style="display: flex; flex-direction: column; padding: 4px 8px 12px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};">{nav_aj(GR, "Tarifas")}</nav>
<section style="display: flex; flex-direction: column; gap: 14px; min-width: 0;">
<div style="display: flex; align-items: flex-end; gap: 10px;"><span style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1;"><h1 style="margin: 0; font-size: 22px;">Tarifas</h1><span style="font-size: 14px; color: {GRIS};">Canon mensual de referencia por tipo de mueble. Al contratar se compara el canon con la tarifa y se avisa si queda por debajo.</span></span><span style="display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: {VERDE};"><span style="width: 8px; height: 8px; border-radius: 999px; background: {VERDE};"></span>Guardado</span></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
{filat("<span>TIPO DE MUEBLE</span>", "<span>GENERAL · /MES</span>", "<span>SEDE CENTRO · /MES</span>", True)}
{filat("<b>Góndola (por cara)</b>", inp("$ 450.000"), inp("$ 480.000"))}
{filat("<b>Punta de góndola</b>", inp("$ 600.000"), f'<span style="font-size: 13px; color: {GRIS};">usa la general</span>')}
{filat("<b>Nevera (por puerta)</b>", inp("$ 350.000"), f'<span style="font-size: 13px; color: {GRIS};">usa la general</span>')}
{filat("<b>Exhibidor</b>", inp("$ 250.000"), f'<span style="font-size: 13px; color: {GRIS};">usa la general</span>')}
</div>
<span style="font-size: 13px; color: {GRIS};">Cada cambio se guarda solo. La tarifa de una sede reemplaza a la general sólo en esa sede.</span>
</section>
</main>''' + nota("Capa 4: Ajustes agrupa por tema lo que hoy está en el engranaje, en botones de la barra de Sede, en el Plano y en URL sin enlace (/taller, /renumerar).")
guardar("Ajustes", "Ajustes agrupados", 1280, 860, ajustes)

# ---------- 7 · Plano de la sede con la ficha del mueble ----------
tabs = lambda act: '<div role="tablist" style="display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;">' + "".join(f'<span style="flex: 1; text-align: center; padding: 7px 4px; border-radius: 8px; {"background: " + TINTA + "; color: " + BLANCO + "; font-weight: 600;" if t == act else ""}">{t}</span>' for t in ["Mueble", "Contratación", "Medidas", "Documentos"]) + "</div>"
campo = lambda l, v: f'<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-size: 13px; font-weight: 600;">{l}</span>{v}</div>'
opcion = lambda t, on: f'<span style="flex: 1; display: flex; align-items: center; justify-content: center; height: 40px; border-radius: 10px; font-size: 14px; {"border: 2px solid " + TINTA + "; font-weight: 700;" if on else "border: 1px solid #DEDBD3;"}">{t}</span>'
herr = "".join(boton(t, "sec", h=36) for t in ["Deshacer", "Rehacer", "Rotar", "Duplicar"])
tog = f'<span style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;"><span style="padding: 7px 14px; border-radius: 8px; background: {TINTA}; color: {BLANCO}; font-weight: 600;">2D</span><span style="padding: 7px 14px;">3D</span></span>'
catal = "".join(f'<button type="button" style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 600; text-align: left;"><span style="width: {w}px; height: 12px; border-radius: 3px; background: #DCD8CE;"></span>{t}</button>' for t, w in [("Góndola", 26), ("Punta de góndola", 14), ("Nevera", 22), ("Exhibidor", 12)])
planos = encabezado("Plano de la sede") + barra_modulo("Plano de la sede", tog + boton("Validación del plano · 1", icono="alerta") + boton_mas(), "Sede CENTRO · editando") + f'''
<main style="display: grid; grid-template-columns: 200px minmax(0, 1fr) 360px; gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<b style="font-size: 15px;">Catálogo</b><span style="font-size: 12px; color: {GRIS};">Arrastrá un mueble al plano.</span>{catal}<a href="#" style="font-size: 13px; font-weight: 600;">Ver el catálogo completo</a>')}
{tarjeta(f'<div style="display: flex; gap: 6px; flex-wrap: wrap;">{herr}<span style="flex-grow: 1;"></span>{boton("Eliminar", "fan", "color: " + ROJO + ";", h=36)}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 24px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano(sel="GON-03", fs=11, h2=40)}</div><span style="font-size: 12px; color: {GRIS};">Mover: arrastrar · Zoom: rueda o + / − · Elegir varios: Shift + clic · Atajos en «Más»</span>')}
<aside aria-label="Ficha de GON-03" style="display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; min-height: 0;">
<div style="display: flex; flex-direction: column; gap: 4px;"><b style="font-size: 18px;">GON-03 · Góndola 3</b><span style="font-size: 13px; color: {GRIS};">Pasillo 2 · 2,00 m × 0,90 m · caras A y B</span></div>
{tabs("Contratación")}
{campo("¿Se puede contratar?", '<div style="display: flex; gap: 8px;">' + opcion("Sí", True) + opcion("No", False) + "</div>")}
{campo("Cómo se contrata cada cara", '<div style="display: flex; gap: 8px;">' + opcion("Entera", False) + opcion("Por partes", False) + opcion("Participación", True) + "</div>")}
<div style="display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: #F4F2EC; font-size: 13px; line-height: 1.45;"><b>Cara A: 80 % contratado</b><span style="color: #3D3D3A;">2 participaciones: Aseo Total 50 %, Lácteos Andinos 30 %. Disponible: 20 % de la cara A.</span></div>
<div style="display: flex; flex-direction: column; gap: 8px;">{boton("Distribuir la cara A", "pri")}{boton("Planograma de la cara A")}</div>
<span style="margin-top: auto; font-size: 12px; color: {GRIS}; line-height: 1.45;">Las 4 pestañas reemplazan el panel largo de hoy: Mueble (código, cara, duplicar), Contratación, Medidas y Documentos (archivos y notas).</span>
</aside>
</main>''' + nota("La ficha del mueble, en 4 pestañas, con lo de uso diario a la vista. En «Más» quedan sólo los atajos de teclado y «Limpiar todo el 3D».")
guardar("PlanoSede", "Plano de la sede con la ficha del mueble", 1280, 860, planos)

# ---------- 8 · Teléfono ----------
nav_tel = '<nav aria-label="Módulos" style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); height: 68px; background: #FFFFFF; border-top: 1px solid #E4E2DC; flex-shrink: 0; position: relative; z-index: 3;">' + "".join(
    f'<a href="#" style="text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 11px; {"font-weight: 700; color: " + TINTA if on else "color: " + GRIS}; text-align: center; line-height: 1.15;">{ico(i, 20, TINTA if on else GRIS)}{t}</a>'
    for t, i, on in [("Contratos", "planilla", False), ("Indicadores", "tabla", True), ("Montajes", "check", False), ("Plano", "cubo", False), ("Ajustes", "ajustes", False)]) + "</nav>"
tel = f'''<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 16px; background: {BLANCO}; border-bottom: 1px solid {BORDE}; flex-shrink: 0;">
<b style="font-size: 17px; flex-grow: 1;">Indicadores</b>
<button type="button" aria-label="Buscar" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("buscar")}</button>
<button type="button" aria-label="Pendientes: 14" style="display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 700;">{ico("campana")}<span style="min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: {ROJO}; color: {BLANCO}; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;">14</span></button>
</header>
<div style="display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; opacity: .5;">{plano(sel="PUN-07", fs=8, h1=34, h2=26)}</div>
<section aria-label="Ficha de PUN-07" style="position: absolute; left: 0; right: 0; bottom: 68px; height: 500px; display: flex; flex-direction: column; background: {BLANCO}; border-radius: 20px 20px 0 0; border-top: 1px solid #DEDBD3; box-shadow: 0 -12px 32px rgba(20,20,19,.14); z-index: 2;">
<span style="align-self: center; width: 40px; height: 4px; border-radius: 999px; background: #C9C6BE; margin-top: 10px;"></span>
<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 18px 14px;">
<b style="font-size: 18px;">PUN-07 · Punta de góndola 7</b>
<span style="align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: #F5D0CC; color: {ROJO}; font-size: 12px; font-weight: 700;">Contratado · vence el 30/10/2026</span>
<span style="font-size: 14px;">Galletas Sol · $ 600.000 /mes</span>
<span style="font-size: 14px; color: {GRIS};">01/05/2026 – 30/10/2026 · 6 meses</span>
{boton("Renovar contrato", "pri", "height: 52px; font-size: 16px;", h=52)}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{boton("Editar contrato", h=44)}{boton("Ver en 3D", icono="cubo", h=44)}</div>
</div>
<div style="display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid #ECEAE4; font-size: 14px;">{ico("planilla")}<span style="flex-grow: 1;"><b>Planometría</b> · sol-pun07.pdf</span><a href="#" style="font-size: 14px; font-weight: 600;">Cambiar</a></div>
<div style="display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid #ECEAE4; font-size: 14px;">{ico("planilla")}<span style="flex-grow: 1;"><b>Archivos del contrato</b> · 2</span><a href="#" style="font-size: 14px; font-weight: 600;">Ver</a></div>
{grupo_acordeon("Otras acciones del contrato", 3)}
</section>
{nav_tel}'''
guardar("Telefono2", "La ficha en el teléfono", 390, 844, tel.replace("<header", '<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0;"><header', 1).replace(nav_tel, "</div>" + nav_tel))

# ---------- 9 · Mapa de funciones ----------
NOMBRE_CAPA = {"V": "1 · A la vista", "F": "2 · En la ficha", "M": "3 · Un clic más", "A": "4 · Ajustes", "P": "Pantalla propia"}
orden = []
for d, *_ in MAPA:
    if d not in orden: orden.append(d)
bloques = ""
for d in orden:
    filas = [(c, t, ns) for dd, c, t, ns in MAPA if dd == d]
    n = sum(len(ns) for _, _, ns in filas)
    items = "".join(
        f'<div style="display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-top: 1px solid #F0EEE8; font-size: 12.5px; line-height: 1.4;"><span style="align-self: start; padding: 1px 6px; border-radius: 6px; background: {COL[c]}; color: {BLANCO}; font-size: 10.5px; font-weight: 700; text-align: center;">{NOMBRE_CAPA[c]}</span><span>{t} <span style="color: #9A978F; font-family: ui-monospace, Menlo, monospace; font-size: 11px;">{" ".join("#" + str(x) for x in ns) if ns else "nuevo"}</span></span></div>'
        for c, t, ns in filas)
    bloques += f'<div style="break-inside: avoid; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; margin: 0 0 14px; border-radius: 14px; background: {BLANCO}; border: 1px solid {BORDE};"><div style="display: flex; align-items: baseline; gap: 8px;"><b style="font-size: 15px; flex-grow: 1;">{d}</b><span style="font-size: 12px; color: {GRIS};">{n} funciones</span></div>{items}</div>'
leyenda = "".join(f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="padding: 1px 6px; border-radius: 6px; background: {COL[c]}; color: {BLANCO}; font-size: 11px; font-weight: 700;">{NOMBRE_CAPA[c]}</span>{cnt[c]}</span>' for c in "VFMAP")
mapa = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 36px 40px;">
<div style="display: flex; align-items: flex-end; gap: 20px;"><span style="display: flex; flex-direction: column; gap: 6px; flex-grow: 1;"><h1 style="margin: 0; font-size: 26px;">Mapa de funciones: las 187, una por una</h1><span style="font-size: 14px; color: {GRIS};">Cada fila dice dónde queda y en qué capa. Los números (#) son los del inventario de lo que existe hoy; se verificó que los 187 aparecen una sola vez.</span></span><div style="display: flex; gap: 14px; font-size: 13px;">{leyenda}</div></div>
<div style="column-count: 4; column-gap: 14px;">{bloques}</div>
</div>'''
guardar("Mapa", "Mapa de funciones", 1760, 1800, mapa)

# ---------- 10 · Plano de la sede en 3D ----------
def chip_tog(op, act):
    return '<span style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;">' + "".join(f'<span style="padding: 6px 10px; border-radius: 8px; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + "; font-weight: 600;" if o == act else ""}">{o}</span>' for o in op) + "</span>"
ICON["pin"] = '<path d="M12 17v5M9 10.8V4h6v6.8l3 3.2H6z"/>'
def item_pin(t, d, fijado=False, peligro=False):
    col = ROJO if peligro else TINTA
    pin = ico("pin", 16, TINTA if fijado else "#9A978F", 2 if fijado else 1.5)
    etiqueta = "Fijado en la barra" if fijado else "Fijar en la barra"
    boton_pin = "" if peligro else f'<button type="button" aria-label="{etiqueta}" aria-pressed="{str(fijado).lower()}" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{pin}</button>'
    return f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 16px;"><a href="#" style="text-decoration: none; display: flex; flex-direction: column; gap: 1px; font-size: 14px; color: {col};">{t}<span style="font-size: 12px; color: {GRIS};">{d}</span></a>{boton_pin}</div>'
menu3d = f'''<div role="menu" style="position: absolute; right: 24px; top: 114px; width: 340px; border-radius: 14px; background: {BLANCO}; border: 1px solid #DEDBD3; box-shadow: 0 12px 32px rgba(20,20,19,.18); z-index: 5; padding: 6px 0;">
<span style="display: block; padding: 8px 16px 6px; font-size: 12px; color: {GRIS}; line-height: 1.4;">Sólo lo que se usa muy de vez en cuando. Con el alfiler lo fijás en tu barra (hasta 3).</span>
{item_pin("Atajos de teclado", "R rota, F espeja, Supr elimina, WASD camina", fijado=True)}
<div style="border-top: 1px solid #ECEAE4; margin-top: 4px; padding-top: 4px;">{item_pin("Limpiar todo el 3D", "Quita todos los muebles del 3D. Pide confirmación.", peligro=True)}</div>
</div>'''
vista3d = f'''<div role="img" aria-label="Vista 3D de la sede" style="flex-grow: 1; position: relative; border-radius: 12px; background: linear-gradient(180deg, #DCD9D0 0%, #F4F2EC 55%, #E8E5DC 100%); overflow: hidden;">
<div style="position: absolute; left: 12%; top: 30%; width: 30%; height: 24%; background: #C98A0B; opacity: .55; transform: skewX(-18deg); border-radius: 4px;"></div>
<div style="position: absolute; left: 50%; top: 30%; width: 30%; height: 24%; background: {ROJO}; opacity: .45; transform: skewX(-18deg); border-radius: 4px;"></div>
<div style="position: absolute; left: 18%; top: 62%; width: 14%; height: 16%; background: {VERDE}; opacity: .5; transform: skewX(-18deg); border-radius: 4px; box-shadow: 0 0 0 3px {TINTA};"></div>
<div style="position: absolute; left: 38%; top: 62%; width: 14%; height: 16%; background: {ROJO}; opacity: .45; transform: skewX(-18deg); border-radius: 4px;"></div>
<span style="position: absolute; left: 16px; bottom: 12px; font-size: 12px; color: {GRIS};">[Vista 3D de la sede] · arrastrar gira · rueda acerca</span>
</div>'''
fijado = f'<button type="button" style="display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px dashed #141413; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 600; white-space: nowrap;">{ico("pin")}Atajos de teclado</button>'
der3d = chip_tog(["2D", "3D"], "3D") + fijado + boton_mas(True)
barra3d = f'<div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">{chip_tog(["Cenital", "Primera persona", "Orbital"], "Orbital")}{chip_tog(["Con arte", "Sin arte"], "Con arte")}<span style="flex-grow: 1;"></span><span style="display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: {VERDE};"><span style="width: 8px; height: 8px; border-radius: 999px; background: {VERDE};"></span>Guardado</span></div>'
pie3d = f'<div style="display: flex; gap: 8px;">{boton("Presentar al proveedor", "pri")}{boton("Probar un producto")}{boton("Bajar imagen o propuesta")}<span style="flex-grow: 1;"></span>{boton("Terminar reunión", "fan")}</div>'
ficha3d = f'''<aside aria-label="Ficha de PUN-08" style="display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};">
<b style="font-size: 18px;">PUN-08 · Punta de góndola 8</b><span style="align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: #CDE7D6; color: {VERDE}; font-size: 12px; font-weight: 700;">Disponible del 01/11/2026 al 30/11/2026</span>
{boton("Nuevo contrato", "pri")}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{boton("Encuadrar")}{boton("Rotar")}</div>
<span style="margin-top: auto; font-size: 12px; color: {GRIS}; line-height: 1.45;">Es la misma ficha del espacio que en los otros módulos, con las acciones propias del 3D: encuadrar y rotar.</span>
</aside>'''
p3d = (encabezado("Plano de la sede") + barra_modulo("Plano de la sede", der3d, "Sede CENTRO · 3D")
       + f'<main style="display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">'
       + tarjeta(barra3d + vista3d + pie3d, "flex-grow: 1;") + ficha3d + "</main>" + menu3d
       + nota("En 3D, a la vista: tipo de vista, con o sin arte, Guardado, Presentar al proveedor, Probar un producto y Bajar imagen o propuesta. «Atajos de teclado» lo fijó esta persona en su barra (borde punteado)."))
guardar("Plano3D", "Plano de la sede en 3D", 1280, 860, p3d)

# ---------- 11 · Qué pasó a estar a la mano ----------
SUBEN = [
 ("Ver el plano por fecha en que se libera", "«Más» de Contratos", "A la vista: el plano se ve por fecha", "Diario: hoy es un panel fijo de Vender"),
 ("Ver el plano por tarifa de referencia", "«Más» de Contratos", "A la vista: el plano se ve por tarifa", "Diario: hoy es un panel fijo de Vender"),
 ("Ver en 3D con el proveedor", "«Más» de Contratos", "A la vista al elegir espacios", "Se usa delante del proveedor"),
 ("Empezar de nuevo", "«Más» de Contratos", "Pie del contrato", "Hoy está a la vista"),
 ("Descargar la plantilla", "«Más» de Contratos", "Dentro de «Cargar desde planilla»", "Donde se necesita"),
 ("Importes mensual | total", "«Más» de Indicadores", "A la vista", "Cambia cómo se leen todas las cifras"),
 ("Filtrar el plano", "«Más» de Indicadores", "A la vista, sobre el plano", "Hoy está a la vista"),
 ("Quién paga el canon", "«Más» de Indicadores", "Pestaña de Indicadores", "Hoy es una tarjeta visible"),
 ("Participaciones de cara", "«Más» de Indicadores", "Pestaña de Indicadores", "Hoy es una tarjeta visible"),
 ("Planometría y archivos del contrato", "Plegado en la ficha", "A la vista en la ficha", "Diario"),
 ("Ver en 3D, distribuir, planograma", "Plegado en la ficha", "Botones en la ficha", "Centrales en la venta"),
 ("Presentar al proveedor, terminar reunión", "«Más» del 3D", "A la vista en el 3D", "Reunión con el proveedor"),
 ("Probar un producto, bajar imagen o propuesta", "«Más» del 3D", "A la vista en el 3D", "Reunión con el proveedor"),
 ("Con arte | sin arte", "«Más» del 3D", "A la vista en el 3D", "Cambia lo que se ve"),
 ("Guardar el 3D", "«Más» del 3D", "Estado «Guardado» a la vista", "Nunca debe quedar escondido"),
 ("Versiones del planograma", "«Más» de Planificar", "Botón en Planificar", "Se consulta al revisar montajes"),
 ("Persona y rol de la cuenta", "Menú de la cuenta", "A la vista en la barra", "Hoy está a la vista"),
]
def fila_s(a, b, c, d, hd=False):
    if hd:
        return f'<div style="display: grid; grid-template-columns: 1.3fr 1fr 1.2fr 1.2fr; gap: 12px; padding: 10px 16px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>{a}</span><span>{b}</span><span>{c}</span><span>{d}</span></div>'
    return f'<div style="display: grid; grid-template-columns: 1.3fr 1fr 1.2fr 1.2fr; gap: 12px; padding: 9px 16px; border-top: 1px solid #ECEAE4; font-size: 13.5px; line-height: 1.4;"><span>{a}</span><span style="color: {GRIS}; text-decoration: line-through;">{b}</span><b>{c}</b><span style="color: {GRIS};">{d}</span></div>'
tabla_s = f'<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">' + fila_s("FUNCIÓN", "ANTES (DIBUJO ANTERIOR)", "AHORA", "POR QUÉ", True) + "".join(fila_s(*x) for x in SUBEN) + "</div>"
raras = [(d, tt, ns) for d, c, tt, ns in MAPA if c == "M"]
lista_r = "".join(f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-top: 1px solid #ECEAE4; font-size: 13.5px; line-height: 1.4;"><span>{tt}</span><span style="font-size: 12px; color: {GRIS};">{d}</span></div>' for d, tt, ns in raras)
n_raras = sum(len(ns) for _, _, ns in raras)
cuerpo_c = f'''<div style="display: flex; flex-direction: column; gap: 18px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 26px;">Lo que pasó a estar a la mano</h1><span style="font-size: 15px; color: {GRIS};">Regla nueva: lo diario y lo ocasional, a la vista, sin desplegar nada. En el dibujo anterior, {len(SUBEN)} funciones de uso frecuente quedaban un clic más adentro; ahora ninguna.</span></div>
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 18px; align-items: start;">
{tabla_s}
<div style="display: flex; flex-direction: column; gap: 14px;">
{tarjeta(f'<b style="font-size: 16px;">Lo único que queda a un clic: {n_raras} de 187</b><span style="font-size: 13px; color: {GRIS}; line-height: 1.45;">Funciones raras o que borran algo. Igual aparecen en el buscador.</span>{lista_r}')}
{tarjeta(f'<div style="display: flex; align-items: center; gap: 8px;">{ico("pin", 18)}<b style="font-size: 16px;">Nuevo: fijar en la barra</b></div><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">Si alguien usa a diario algo que para el resto es raro, lo fija con el alfiler y le queda como botón en su barra (hasta 3 por módulo). Es por persona: no cambia lo que ven los demás.</span>')}
</div>
</div>
</div>'''
guardar("Cambios", "Lo que pasó a estar a la mano", 1760, 1000, cuerpo_c)
print("ok")
