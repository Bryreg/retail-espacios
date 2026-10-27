import sys
from datetime import date, timedelta
exec(open("tableros.py").read())

HOY = date(2026, 10, 26)
DESDE, HASTA = date(2026, 11, 1), date(2027, 1, 31)          # las fechas que pidió el proveedor
VI, VF = date(2026, 10, 1), date(2027, 9, 30)                # ventana de la línea de tiempo
MESES = ["oct", "nov", "dic", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep"]
f = lambda d: d.strftime("%d/%m/%Y")
def dias(a, b): return (b - a).days + 1

# contratos de ejemplo por espacio: (desde, hasta, texto, clase)  clase: c contrato · p parcial · r reserva
T = {
 "GON-01 · Góndola 1":          [(date(2026, 6, 1), date(2027, 5, 31), "Café Montaña · sólo cara A", "p")],
 "GON-02 · Góndola 2":          [(date(2026, 2, 1), date(2027, 1, 31), "Aseo Total (A) · Limpio Hogar (B)", "c"), (date(2027, 2, 1), date(2027, 4, 30), "Limpio Hogar · sólo cara B", "p")],
 "GON-03 · Góndola 3":          [(date(2026, 4, 1), date(2027, 3, 31), "Participaciones: 80 % de la cara A", "p")],
 "GON-04 · Góndola 4":          [(date(2026, 5, 16), date(2026, 11, 15), "Aseo Total", "c")],
 "PUN-01 · Punta de góndola 1": [(date(2026, 6, 1), date(2026, 11, 30), "Limpio Hogar", "c")],
 "PUN-02 · Punta de góndola 2": [(date(2026, 7, 1), date(2027, 6, 30), "Café Montaña · parte 1 de 2", "p")],
 "PUN-03 · Punta de góndola 3": [(date(2026, 8, 1), date(2027, 1, 31), "Café Montaña", "c")],
 "PUN-04 · Punta de góndola 4": [(date(2026, 7, 1), date(2026, 12, 31), "Lácteos Andinos", "c")],
 "PUN-05 · Punta de góndola 5": [(date(2026, 9, 15), date(2026, 12, 14), "Galletas Sol", "c"), (date(2027, 4, 1), date(2027, 6, 30), "Snacks Andes", "c")],
 "PUN-06 · Punta de góndola 6": [(date(2026, 9, 1), date(2027, 2, 28), "Bebidas del Valle", "c")],
 "PUN-07 · Punta de góndola 7": [(date(2026, 5, 1), date(2026, 10, 30), "Galletas Sol", "c")],
 "PUN-08 · Punta de góndola 8": [],
 "PUN-09 · Punta de góndola 9": [],
 "GON-12 · Góndola 12":         [],
 "GON-13 · Góndola 13":         [(date(2026, 11, 1), date(2027, 1, 31), "Reserva provisional · Lácteos Andinos", "r")],
 "NEV-01 · Nevera 1":           [(date(2026, 7, 1), date(2026, 12, 31), "Puertas 1 y 3", "p")],
}
# disponibilidad en las fechas pedidas, con la etiqueta corta que va debajo del código en el plano
ESTADO = {"PUN-07": ("d", "disponible"), "PUN-08": ("d", "disponible"), "PUN-09": ("d", "disponible"), "GON-12": ("d", "disponible"),
          "GON-04": ("p", "desde 16/11/2026"), "PUN-01": ("p", "desde 01/12/2026"), "PUN-05": ("p", "desde 15/12/2026"), "PUN-04": ("p", "desde 01/01/2027"),
          "GON-01": ("p", "cara B"), "GON-03": ("p", "20 % cara A"), "PUN-02": ("p", "parte 2"), "NEV-01": ("p", "puertas 2 y 4"),
          "GON-02": ("c", "hasta 31/01/2027"), "PUN-03": ("c", "hasta 31/01/2027"), "PUN-06": ("c", "hasta 28/02/2027"), "GON-13": ("r", "reserva")}

def plano_fechas(sel=None, fs=12, h1=60, h2=62):
    def c(cod):
        e, txt = ESTADO[cod]
        bg, bc, bs = EST[e]
        ring = f"box-shadow: 0 0 0 3px {TINTA};" if cod == sel else ""
        return (f'<span style="height: {h1 if cod[:3] != "PUN" else h2}px; border-radius: 8px; background: {bg}; border: 2px {bs} {bc}; {ring} display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; line-height: 1.15;">'
                f'<b style="font-family: ui-monospace, Menlo, monospace; font-size: {fs}px;">{cod}</b><span style="font-size: {fs - 2}px; font-weight: 600; color: #3D3D3A; text-align: center; padding: 0 2px;">{txt.replace("desde ", "desde<br>").replace("hasta ", "hasta<br>")}</span></span>')
    fila = lambda xs, n, gap: f'<div style="display: grid; grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px;">' + "".join(c(x) for x in xs) + "</div>"
    return (fila(["GON-01", "GON-02", "GON-03", "GON-04"], 4, 14) + fila(["PUN-01", "PUN-02", "PUN-03", "PUN-04", "PUN-05", "PUN-06", "PUN-07", "PUN-08", "PUN-09"], 9, 8)
            + '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px;">' + "".join(c(x) for x in ["GON-12", "GON-13", "NEV-01"]) + "<span></span></div>")

def chips_fechas(act="3 meses"):
    return '<span style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;">' + "".join(
        f'<span style="padding: 6px 10px; border-radius: 8px; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + "; font-weight: 600;" if o == act else ""}">{o}</span>' for o in ["1 mes", "3 meses", "6 meses", "Black Friday 2026", "Navidad 2026"]) + "</span>"
caja_f = lambda v: f'<span style="display: inline-flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 10px; border: 1.5px solid {TINTA}; background: {BLANCO}; font-size: 15px; font-weight: 600; font-family: ui-monospace, Menlo, monospace;">{v}</span>'
def pregunta(extra=""):
    return f'''<div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 18px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; {extra}">
<b style="font-size: 16px;">¿Para qué fechas?</b>
<span style="font-size: 14px; color: {GRIS};">Del</span>{caja_f(f(DESDE))}<span style="font-size: 14px; color: {GRIS};">al</span>{caja_f(f(HASTA))}
<span style="font-size: 14px; color: {GRIS}; white-space: nowrap;">{dias(DESDE, HASTA)} días</span>
<span style="flex-grow: 1;"></span>{chips_fechas()}
</div>'''
def resumen():
    it = [("d", "4 disponibles todas las fechas"), ("p", "8 contratados parcialmente"), ("c", "3 contratados"), ("r", "1 reservado")]
    return '<div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px;">' + "".join(
        f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 14px; height: 14px; border-radius: 4px; background: {EST[e][0]}; border: 2px {EST[e][2]} {EST[e][1]}; box-sizing: border-box;"></span>{t}</span>' for e, t in it) + "</div>"

def casilla(on):
    return (f'<span style="width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; '
            + (f'background: {TINTA};">{ico("check", 14, BLANCO, 3)}</span>' if on else f'border: 2px solid #9A978F;"></span>'))
def item_lista(cod, nombre, det, on=False, check=True):
    return (f'<div style="display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #F0EEE8;">'
            + (casilla(on) if check else "")
            + f'<span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0;"><b style="font-size: 14px;">{cod} · {nombre}</b><span style="font-size: 12.5px; color: {GRIS};">{det}</span></span></div>')
seccion_l = lambda t, n, color: f'<div style="display: flex; align-items: center; gap: 8px; padding: 12px 0 4px;"><span style="width: 10px; height: 10px; border-radius: 3px; background: {color};"></span><b style="font-size: 13px;">{t}</b><span style="font-size: 12px; color: {GRIS};">{n}</span></div>'

# ---------- D1 · Contratos: primero las fechas ----------
lista = (seccion_l("Disponibles todas las fechas", "4", VERDE)
         + item_lista("PUN-07", "Punta de góndola 7", "Libre desde el 31/10/2026 · tarifa $ 600.000 /mes", True)
         + item_lista("PUN-08", "Punta de góndola 8", "Libre desde el 08/10/2026 · tarifa $ 600.000 /mes", True)
         + item_lista("PUN-09", "Punta de góndola 9", "Libre desde el 01/09/2026 · tarifa $ 600.000 /mes")
         + item_lista("GON-12", "Góndola 12", "Libre desde el 01/08/2026 · tarifa $ 450.000 /mes por cara")
         + seccion_l("Disponibles parte de las fechas", "4 en fechas · 4 en superficie", "#C98A0B")
         + item_lista("GON-04", "Góndola 4", "Disponible desde el 16/11/2026 (77 de los 92 días)")
         + '<a href="#" style="display: block; padding: 8px 0 0; font-size: 13px; font-weight: 600;">Ver los 7 restantes</a>')
d1 = encabezado("Contratos") + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla") + boton("Nuevo contrato", icono="mas2"), "") + f'''
<div style="padding: 12px 24px 0;">{pregunta()}</div>
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px;">Del {f(DESDE)} al {f(HASTA)}</b><span style="flex-grow: 1; font-size: 13px; color: {GRIS};">Debajo del código: desde o hasta cuándo.</span>{lente(["Plano", "Línea de tiempo"], "Plano")}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 18px; padding: 20px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_fechas()}</div>{resumen()}')}
{tarjeta(f'<b style="font-size: 16px;">Espacios para esas fechas</b><span style="font-size: 13px; color: {GRIS};">Marcá los que querés contratar juntos.</span><div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">{lista}</div><div style="display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid #ECEAE4;">{boton("Contratar 2 espacios · " + f(DESDE) + " – " + f(HASTA), "pri", "width: 100%;")}<span style="font-size: 12px; color: {GRIS};">Abre el contrato con los espacios y las fechas ya puestos.</span></div>')}
</main>''' + nota("Primero la pregunta del proveedor: ¿para qué fechas? El plano y la lista contestan al instante, y se contrata con las fechas ya puestas. Lo mismo que hoy, en un solo flujo.")
guardar("Disponibilidad", "Contratos: primero las fechas", 1280, 860, d1)

# ---------- línea de tiempo (para la ficha y para la sede) ----------
TOT = (VF - VI).days + 1
pos = lambda d: max(0.0, min(100.0, (d - VI).days / TOT * 100))
COLB = {"c": ("#F5D0CC", ROJO, "solid"), "p": ("#F6E3B8", "#C98A0B", "solid"), "r": ("#FFFFFF", "#C98A0B", "dashed")}
def eje(alto_label=True):
    cols = "".join(f'<span style="flex: 1; padding-left: 6px; font-size: 12px; font-weight: 600; color: {GRIS}; border-left: 1px solid #E4E2DC;">{m}{" 2027" if m == "ene" else (" 2026" if m == "oct" else "")}</span>' for m in MESES)
    return f'<div style="display: flex; height: 22px; align-items: center;">{cols}</div>'
def barra_tl(tramos, h=30, rango=True, hueco_tip=None, etiqueta=True):
    capas = ""
    if rango:
        capas += f'<span style="position: absolute; top: -4px; bottom: -4px; left: {pos(DESDE):.2f}%; width: {pos(HASTA) - pos(DESDE) + 100 / TOT:.2f}%; background: rgba(242,183,5,.16); border-left: 2px solid {AMARILLO}; border-right: 2px solid {AMARILLO};"></span>'
    for a, b, txt, cl in tramos:
        bg, bc, bs = COLB[cl]
        l, w = pos(a), pos(b) - pos(a) + 100 / TOT
        if w <= 0: continue
        capas += (f'<span title="{txt}: {f(a)} – {f(b)}" style="position: absolute; top: 0; bottom: 0; left: {l:.2f}%; width: {w:.2f}%; background: {bg}; border: 1.5px {bs} {bc}; border-radius: 6px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; padding: 0 8px; font-size: 12px; font-weight: 600; white-space: nowrap;">'
                  + (txt if etiqueta else "") + "</span>")
    capas += f'<span style="position: absolute; top: -6px; bottom: -6px; left: {pos(HOY):.2f}%; width: 2px; background: {TINTA};"></span>'
    if hueco_tip:
        capas += hueco_tip
    return f'<div style="position: relative; height: {h}px; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(100%/12 - 1px), #ECEAE4 calc(100%/12 - 1px), #ECEAE4 calc(100%/12));">{capas}</div>'

# ---------- D2 · ficha con su línea de tiempo ----------
p5 = T["PUN-05 · Punta de góndola 5"]
fila_t = lambda k, v: f'<div style="display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; font-size: 14px; line-height: 1.4;"><span style="color: {GRIS};">{k}</span><span>{v}</span></div>'
ficha_tl = f'''<aside aria-label="Ficha de PUN-05" style="display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; min-height: 0;">
<div style="display: flex; align-items: flex-start; gap: 8px;"><span style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1;"><b style="font-size: 18px;">PUN-05 · Punta de góndola 5</b><span style="align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: #F6E3B8; color: {AMBAR}; font-size: 12px; font-weight: 700;">En tus fechas: disponible desde el 15/12/2026</span></span><button type="button" aria-label="Cerrar la ficha" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
{fila_t("Ocupado hasta", "<b>14/12/2026</b> · faltan 49 días · Galletas Sol")}
{fila_t("Disponible", "<b>del 15/12/2026 al 31/03/2027</b> (107 días)")}
{fila_t("Comprometido", "Snacks Andes, del 01/04/2027 al 30/06/2027")}
{fila_t("Disponible", "<b>desde el 01/07/2027</b>, sin fin")}
<div style="display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: #F6F5F1;">
<div style="display: flex; font-size: 11px; font-weight: 600; color: {GRIS};">{"".join(f'<span style="flex: 1;">{m}</span>' for m in MESES)}</div>
{barra_tl([(a, b, "", cl) for a, b, _, cl in p5], h=26, etiqueta=False)}
<span style="font-size: 12px; color: {GRIS};">Banda amarilla: tus fechas. Raya negra: hoy.</span>
</div>
{boton("Contratar del 15/12/2026 al 31/01/2027", "pri", "width: 100%;")}
<span style="font-size: 12px; color: {GRIS}; line-height: 1.45;">Se ajusta a la parte disponible de tus fechas (48 de 92 días). Para las fechas completas, mirá los 4 espacios disponibles todas las fechas.</span>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{boton("Reservar provisionalmente")}{boton("Ver en 3D", icono="cubo")}</div>
</aside>'''
d2 = encabezado("Contratos") + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla") + boton("Nuevo contrato", icono="mas2"), "") + f'''
<div style="padding: 12px 24px 0;">{pregunta()}</div>
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Del {f(DESDE)} al {f(HASTA)}</b>{lente(["Plano", "Línea de tiempo"], "Plano")}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px; padding: 24px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_fechas(sel="PUN-05", fs=11)}</div>{resumen()}')}
{ficha_tl}
</main>''' + nota("Al tocar un espacio: hasta cuándo está ocupado, qué tiene comprometido a futuro y cuándo queda disponible, en palabras y en una línea de tiempo. Si sólo una parte de tus fechas está disponible, lo dice y ofrece contratar esa parte.")
guardar("FichaFechas", "La ficha responde: hasta cuándo y desde cuándo", 1280, 860, d2)

# ---------- D3 · línea de tiempo de la sede ----------
tip = (f'<span style="position: absolute; left: {pos(date(2026,12,15)):.2f}%; top: 34px; z-index: 4; width: 300px; padding: 12px 14px; border-radius: 12px; background: {TINTA}; color: {BLANCO}; font-size: 13px; line-height: 1.45; box-shadow: 0 10px 28px rgba(20,20,19,.3); display: flex; flex-direction: column; gap: 8px;">'
       f'<span><b>PUN-05 disponible</b> del 15/12/2026 al 31/03/2027 · 107 días</span>'
       f'<span style="align-self: flex-start; padding: 7px 12px; border-radius: 8px; background: {AMARILLO}; color: {TINTA}; font-weight: 700;">Contratar estas fechas</span></span>')
filas_tl = ""
for nombre, tramos in T.items():
    sel = nombre.startswith("PUN-05")
    filas_tl += (f'<div style="display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; align-items: center; padding: 4px 0; {"background: #FFFBEB; position: relative; z-index: 5;" if sel else ""} border-top: 1px solid #F0EEE8;">'
                 f'<span style="font-size: 13px; padding-left: 8px;"><b style="font-family: ui-monospace, Menlo, monospace;">{nombre.split(" · ")[0]}</b> <span style="color: {GRIS};">{nombre.split(" · ")[1]}</span></span>'
                 f'{barra_tl(tramos, h=22, hueco_tip=tip if sel else None)}</div>')
leyenda_tl = f'<div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; align-items: center;">' + "".join(
    f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 22px; height: 12px; border-radius: 4px; background: {COLB[k][0]}; border: 1.5px {COLB[k][2]} {COLB[k][1]}; box-sizing: border-box;"></span>{t}</span>' for k, t in [("c", "Contratado"), ("p", "Contratado parcialmente"), ("r", "Reserva provisional")]) + f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 22px; height: 12px; border-radius: 4px; border: 1px solid #DEDBD3; background: {BLANCO};"></span>Disponible (vacío)</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 2px; height: 14px; background: {TINTA};"></span>Hoy</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 22px; height: 12px; background: rgba(242,183,5,.25); border-left: 2px solid {AMARILLO}; border-right: 2px solid {AMARILLO};"></span>Tus fechas</span></div>'
d3 = encabezado("Contratos") + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla") + boton("Nuevo contrato", icono="mas2"), "") + f'''
<div style="padding: 12px 24px 0;">{pregunta()}</div>
<main style="display: flex; flex-direction: column; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Línea de tiempo · octubre 2026 a septiembre 2027</b><span style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px;">{casilla(False)}Sólo los disponibles en tus fechas</span>{lente(["Plano", "Línea de tiempo"], "Línea de tiempo")}</div><div style="display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px;"><span></span>{eje()}</div><div style="display: flex; flex-direction: column;">{filas_tl}</div>{leyenda_tl}', "flex-grow: 1; gap: 8px;")}
</main>''' + nota("Línea de tiempo de la sede: cada espacio en una fila, 12 meses a la vista. Se ve cuánto dura cada contrato y dónde hay huecos. Tocar un hueco ofrece contratar justo esas fechas.")
guardar("LineaTiempo", "Línea de tiempo de la sede", 1280, 900, d3)

# ---------- D4 · teléfono ----------
tel_d = f'''<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0;">
<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 16px; background: {BLANCO}; border-bottom: 1px solid {BORDE}; flex-shrink: 0;"><b style="font-size: 17px; flex-grow: 1;">Contratos</b><button type="button" style="height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 600;">Sede CENTRO</button></header>
<div style="display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: {BLANCO}; border-bottom: 1px solid {BORDE};">
<b style="font-size: 16px;">¿Para qué fechas?</b>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">{caja_f(f(DESDE)).replace("display: inline-flex", "display: flex; min-width: 0; justify-content: center; font-size: 14px")}{caja_f(f(HASTA)).replace("display: inline-flex", "display: flex; min-width: 0; justify-content: center; font-size: 14px")}</div>
<div style="display: flex; gap: 6px; overflow: hidden;">{"".join(f'<span style="padding: 7px 11px; border-radius: 999px; font-size: 13px; font-weight: 600; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + ";" if o == "3 meses" else "border: 1px solid #DEDBD3;"}">{o}</span>' for o in ["1 mes", "3 meses", "6 meses", "Black Friday 2026"])}</div>
</div>
<div style="display: flex; flex-direction: column; padding: 4px 16px; flex-grow: 1; overflow: hidden;">
<span style="padding: 10px 0 0; font-size: 13px; color: {GRIS};">Del {f(DESDE)} al {f(HASTA)} · {dias(DESDE, HASTA)} días · <a href="#" style="font-weight: 600;">Ver en el plano</a></span>
{seccion_l("Disponibles todas las fechas", "4", VERDE)}
{item_lista("PUN-07", "Punta de góndola 7", "Libre desde el 31/10/2026", True)}
{item_lista("PUN-08", "Punta de góndola 8", "Libre desde el 08/10/2026", True)}
{item_lista("PUN-09", "Punta de góndola 9", "Libre desde el 01/09/2026")}
{item_lista("GON-12", "Góndola 12", "Libre desde el 01/08/2026")}
{seccion_l("Disponibles parte de las fechas", "8", "#C98A0B")}
{item_lista("GON-04", "Góndola 4", "Desde el 16/11/2026 · 77 de 92 días")}
{item_lista("PUN-01", "Punta de góndola 1", "Desde el 01/12/2026 · 62 de 92 días")}
</div>
<div style="padding: 12px 16px 18px; background: {BLANCO}; border-top: 1px solid {BORDE};">{boton("Contratar 2 espacios", "pri", "width: 100%; height: 52px; font-size: 16px;", h=52)}</div>
</div>'''
guardar("DisponibilidadTel", "Disponibilidad en el teléfono", 390, 844, tel_d)

# ---------- D0 · el flujo ----------
def paso(n, t, d):
    return f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};"><span style="width: 32px; height: 32px; border-radius: 999px; background: {TINTA}; color: {BLANCO}; display: flex; align-items: center; justify-content: center; font-weight: 700;">{n}</span><b style="font-size: 18px;">{t}</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">{d}</span></div>'
fl = flecha_h
d0 = f'''<div style="display: flex; flex-direction: column; gap: 22px; padding: 40px 48px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 30px;">Consultar la disponibilidad y contratar, en cuatro pasos</h1><span style="font-size: 16px; color: {GRIS};">La pregunta del proveedor es siempre la misma: «¿qué tenés libre para estas fechas?». El sistema la contesta primero, y desde la respuesta se contrata sin volver a escribir nada.</span></div>
<div style="display: grid; grid-template-columns: 1fr 36px 1fr 36px 1fr 36px 1fr;">
{paso(1, "¿Para qué fechas?", "Del / al, o un atajo: 1, 3 o 6 meses, Black Friday, Navidad. Es la primera línea de Contratos.")}{fl}
{paso(2, "El plano y la lista responden", "Verde: disponible todas las fechas. Ámbar: parte (dice desde cuándo o qué parte). Rojo: ocupado (dice hasta cuándo).")}{fl}
{paso(3, "Tocás un espacio", "Su ficha dice hasta cuándo está ocupado, qué tiene comprometido a futuro y cuándo queda disponible, con su línea de tiempo.")}{fl}
{paso(4, "Contratar con las fechas puestas", "Uno o varios espacios a la vez. Si sólo una parte de las fechas está disponible, ofrece contratar esa parte.")}
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">
{tarjeta(f'<b style="font-size: 16px;">Atajo: la línea de tiempo de la sede</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">En vez del plano, cada espacio en una fila y 12 meses a la vista. Se ven de un vistazo la duración de cada contrato y los huecos. Tocar un hueco lleva al paso 4 con esas fechas.</span>')}
{tarjeta(f'<b style="font-size: 16px;">Qué ya existe y qué se suma</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">Ya existen el selector de período, la escalera «Cuándo se libera cada espacio» y el plano por período. Se suman: las fechas como primera pregunta, «hasta / desde» escrito en el plano, la lista de espacios para esas fechas, la línea de tiempo por espacio y de la sede, y contratar con las fechas ya puestas. No hacen falta tablas nuevas: todo sale de contratos, reservas y temporadas.</span>')}
</div>
</div>'''
guardar("FlujoFechas", "Consultar disponibilidad y contratar", 1760, 560, d0)
print("disponibilidad ok")
