import sys
exec(open("tablero.py").read())

ICON["dinero"] = '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'
ICON["cuadros"] = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
ICON["etiqueta"] = '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'
ICON["calendario"] = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'
ICON["llave"] = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'
ICON["chev"] = '<path d="m9 6 6 6-6 6"/>'

def card(titulo, icono, cuerpo, area, enlace=""):
    enl = f'<span style="display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 600; color: #52514e;">{enlace}{ico("chev", 14, "#52514e", 2)}</span>' if enlace else ico("chev", 16, "#9A978F", 2)
    return (f'<a href="#" style="grid-area: {area}; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; border-radius: 20px; background: {BLANCO}; border: 1px solid #E7E5DF; box-shadow: 0 1px 2px rgba(20,20,19,.04); min-width: 0; min-height: 0;">'
            f'<div style="display: flex; align-items: center; gap: 8px;"><span style="width: 28px; height: 28px; border-radius: 8px; background: #F2F1EC; display: inline-flex; align-items: center; justify-content: center;">{ico(icono, 15, "#3D3D3A", 1.9)}</span>'
            f'<span style="font-size: 14px; font-weight: 600; color: #3D3D3A; flex-grow: 1;">{titulo}</span>{enl}</div>{cuerpo}</a>')
num = lambda v, t=40, extra="": f'<b style="font-size: {t}px; font-weight: 620; letter-spacing: -.015em; line-height: 1; white-space: nowrap; {extra}">{v}</b>'
sub = lambda t: f'<span style="font-size: 13px; color: #6B6A65;">{t}</span>'

# 1 · canon: área suave + línea del potencial
def area_canon(w=520, h=230):
    x0, x1, y0, y1 = 2, w - 2, 10, h - 22
    lo, hi = 7, 12.6
    X = lambda i: x0 + i * (x1 - x0) / 11
    Y = lambda v: y1 - (v - lo) / (hi - lo) * (y1 - y0)
    linea = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(CANON))
    g = (f'<defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{AZ}" stop-opacity=".22"/><stop offset="1" stop-color="{AZ}" stop-opacity="0"/></linearGradient></defs>'
         f'<polygon points="{X(0):.1f},{y1} {linea} {X(11):.1f},{y1}" fill="url(#gc)"/>'
         f'<line x1="{x0}" x2="{x1}" y1="{Y(12.2):.1f}" y2="{Y(12.2):.1f}" stroke="{GR_DE}" stroke-width="1.5"/>'
         f'<text x="{x0 + 2}" y="{Y(12.2) - 7:.1f}" font-size="11.5" fill="#6B6A65">Potencial a tarifa · {fmt(12200000)}</text>'
         f'<polyline points="{linea}" fill="none" stroke="{AZ}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'
         f'<circle cx="{X(11):.1f}" cy="{Y(CANON[-1]):.1f}" r="5" fill="{AZ}" stroke="#fff" stroke-width="2.5"/>'
         f'<text x="{x0}" y="{h - 4}" font-size="11.5" fill="#6B6A65">nov 2025</text><text x="{x1}" y="{h - 4}" text-anchor="end" font-size="11.5" fill="#6B6A65">oct 2026</text>')
    return f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="none" role="img" aria-label="Canon mensual contratado, últimos 12 meses, contra el potencial a tarifa">{g}</svg>'
c_canon = card("Canon mensual contratado", "dinero",
    f'<div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;">{num(fmt(9939500), 46)}<span style="font-size: 18px; color: #6B6A65;">/mes</span></div>'
    f'<div style="display: flex; align-items: center; gap: 10px;"><span style="padding: 3px 9px; border-radius: 999px; background: #E6F2EA; font-size: 12.5px; font-weight: 700; color: #006300; white-space: nowrap;">▲ 4,7 %</span>{sub("vs septiembre 2026 · 81 % del potencial")}</div>'
    f'<div style="margin-top: auto;">{area_canon()}</div>', "canon", "Facturación")

# 2 · ocupación: un cuadrito por espacio
cuadritos = "".join(f'<span style="width: 100%; aspect-ratio: 1; border-radius: 5px; {"background: " + AZ + ";" if i < 19 else "background: transparent; box-shadow: inset 0 0 0 1.5px #B9B7AF;"}"></span>' for i in range(22))
c_ocup = card("Ocupación", "cuadros",
    f'<div style="display: flex; align-items: baseline; gap: 10px;">{num("86 %")}<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #7a5600; font-weight: 600;">{icono_estado("aten")}meta 90 %</span></div>'
    f'<div style="display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 5px;">{cuadritos}</div>'
    f'{sub("19 de 22 espacios contratados · 3 disponibles")}', "ocup")

# 3 · canon ÷ tarifa: medidor con la marca de la meta
c_ct = card("Canon ÷ tarifa", "etiqueta",
    f'<div style="display: flex; align-items: baseline; gap: 10px;">{num("94 %")}<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #7a5600; font-weight: 600;">{icono_estado("aten")}meta 95 %</span></div>'
    f'<div style="position: relative; height: 10px; border-radius: 999px; background: #E3EEFB;"><span style="position: absolute; left: 0; top: 0; bottom: 0; width: 94%; border-radius: 999px; background: {AZ};"></span><span style="position: absolute; left: 95%; top: -5px; width: 2px; height: 20px; background: {TINTA}; border-radius: 1px;"></span></div>'
    f'{sub("Se contrata a 94 de cada 100 pesos de tarifa")}', "ct")

# 4 · para hacer hoy
tareas = [("PUN-07 vence en 4 días", "Galletas Sol · $ 600.000 /mes", "Renovar", CRIT, "reloj"),
          ("Montaje no realizado", "PUN-03 · faltó el material", "Ver", CRIT, "llave"),
          ("La reserva caduca hoy", "GON-13 · Lácteos Andinos", "Resolver", "#B07A00", "calendario")]
lista_t = "".join(f'<div style="display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px 0; border-top: 1px solid #F0EEE8;">'
                  f'<span style="width: 30px; height: 30px; border-radius: 9px; background: {c}14; display: inline-flex; align-items: center; justify-content: center;">{ico(i, 15, c, 2)}</span>'
                  f'<span style="display: flex; flex-direction: column; gap: 1px; min-width: 0;"><span style="font-size: 14px; font-weight: 600;">{t}</span><span style="font-size: 12.5px; color: #6B6A65;">{d}</span></span>'
                  f'<span style="padding: 6px 11px; border-radius: 9px; border: 1px solid #DEDBD3; font-size: 12.5px; font-weight: 600; white-space: nowrap;">{a}</span></div>' for t, d, a, c, i in tareas)
c_hoy = card("Para hacer hoy", "campana",
    f'<div style="display: flex; align-items: baseline; gap: 8px;">{num("3", 40)}{sub("con fecha límite hoy")}</div><div style="display: flex; flex-direction: column;">{lista_t}</div>'
    f'<span style="margin-top: auto; font-size: 13px; font-weight: 600; color: #3D3D3A;">Ver los 14 pendientes</span>', "hoy")

# 5 · vence en 90 días: puntos sobre un eje
VEN = [(4, "PUN-07", True), (20, "GON-04", False), (35, "PUN-01", True), (49, "PUN-05", False), (66, "PUN-04", False), (76, "GON-01", True)]
def eje90(w=520, h=74):
    x0, x1, y = 8, w - 8, 34
    X = lambda d: x0 + d / 90 * (x1 - x0)
    g = f'<line x1="{x0}" x2="{x1}" y1="{y}" y2="{y}" stroke="#DEDBD3" stroke-width="2" stroke-linecap="round"/>'
    for d, t in [(0, "hoy"), (30, "30 días"), (60, "60 días"), (90, "90 días")]:
        g += f'<line x1="{X(d):.1f}" x2="{X(d):.1f}" y1="{y - 4}" y2="{y + 4}" stroke="#C3C2B7" stroke-width="1.5"/><text x="{X(d):.1f}" y="{h - 4}" text-anchor="{"start" if d == 0 else ("end" if d == 90 else "middle")}" font-size="11.5" fill="#6B6A65">{t}</text>'
    for d, cod, sin in VEN:
        col = NAR if sin else GR_DE
        g += f'<circle cx="{X(d):.1f}" cy="{y}" r="8" fill="{col}" stroke="#fff" stroke-width="2.5"/>'
        if sin:
            g += f'<text x="{X(d):.1f}" y="{y - 15}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0b0b0b">{cod}</text>'
    return f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="none" role="img" aria-label="Contratos que vencen en los próximos 90 días">{g}</svg>'
c_venc = card("Vence en los próximos 90 días", "reloj",
    f'<div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;">{num(fmt(1650000), 32)}<span style="font-size: 15px; color: #6B6A65;">/mes sin renovar</span></div>'
    f'{eje90()}'
    f'<div style="display: flex; gap: 16px; font-size: 12.5px; color: #52514e;"><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 999px; background: {NAR};"></span>3 sin contrato siguiente</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 999px; background: {GR_DE};"></span>3 ya renovados</span></div>', "venc", "Renovar")

# 6 · montajes del mes: barra segmentada
SEG = [("Verificados", 4, "#1c5cab"), ("Sin verificar", 1, "#5598e7"), ("Sin montar", 2, "#E1E0D9"), ("No realizado", 1, CRIT)]
barra_seg = '<div style="display: flex; gap: 3px; height: 12px;">' + "".join(f'<span style="flex: {n}; border-radius: 4px; background: {c};"></span>' for _, n, c in SEG) + "</div>"
ley_seg = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;">' + "".join(f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #3D3D3A;"><span style="width: 9px; height: 9px; border-radius: 3px; background: {c};"></span>{t} <b>{n}</b></span>' for t, n, c in SEG) + "</div>"
c_mont = card("Montajes de octubre", "llave",
    f'<div style="display: flex; align-items: baseline; gap: 8px;">{num("5", 40)}<span style="font-size: 15px; color: #6B6A65;">de 8 en la tienda</span></div>{barra_seg}{ley_seg}', "mont")

# 7 · disponibles hoy
chips_d = "".join(f'<span style="display: inline-flex; flex-direction: column; gap: 1px; padding: 8px 10px; border-radius: 12px; background: #F2F1EC;"><b style="font-family: ui-monospace, Menlo, monospace; font-size: 13px;">{c}</b><span style="font-size: 11.5px; color: #6B6A65;">{d}</span></span>' for c, d in [("PUN-08", "18 días"), ("PUN-09", "56 días"), ("GON-12 A", "14 días")])
c_disp = card("Disponibles hoy", "cuadros",
    f'<div style="display: flex; align-items: baseline; gap: 8px;">{num("3", 40)}<span style="font-size: 15px; color: #6B6A65;">espacios</span></div>'
    f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">{chips_d}</div>{sub("Sin facturar en octubre: " + fmt(1090000))}', "disp", "Contratar")

grid = (f'<div style="display: grid; grid-template-columns: 1.1fr 1.1fr 1fr 1.25fr; grid-template-rows: 1fr 1fr 1fr; gap: 16px; grid-template-areas: \'canon canon ocup hoy\' \'canon canon ct hoy\' \'venc venc mont disp\'; flex-grow: 1; min-height: 0;">'
        f'{c_canon}{c_ocup}{c_ct}{c_hoy}{c_venc}{c_mont}{c_disp}</div>')
seg_periodo = '<span style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px; background: #E7E5DF; font-size: 13px; font-weight: 600;">' + "".join(f'<span style="padding: 7px 14px; border-radius: 9px; {"background: #FFFFFF; box-shadow: 0 1px 2px rgba(20,20,19,.08);" if o == "Octubre" else "color: #52514e;"}">{o}</span>' for o in ["Hoy", "Octubre", "Últimos 12 meses"]) + "</span>"
p1 = encabezado("Indicadores", pendientes=14) + f'''
<main style="display: flex; flex-direction: column; gap: 18px; padding: 26px 28px 24px; flex-grow: 1; min-height: 0; background: #F4F3EF;">
<div style="display: flex; align-items: center; gap: 14px;"><span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1;"><h1 style="margin: 0; font-size: 24px; font-weight: 650; letter-spacing: -.01em;">Resumen de la sede</h1><span style="font-size: 13.5px; color: #6B6A65;">Lunes 26/10/2026 · Sede CENTRO · comparado con septiembre 2026</span></span>{seg_periodo}</div>
{grid}
</main>'''
guardar("PanelR", "Panel de información rápida", 1280, 860, p1, fondo="#F4F3EF")

# teléfono: las mismas tarjetas apiladas, lo primero lo de hoy
pt = f'''<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0; background: #F4F3EF;">
<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 18px; background: {BLANCO}; border-bottom: 1px solid {BORDE};"><b style="font-size: 17px; flex-grow: 1;">Resumen</b><span style="font-size: 13px; color: #6B6A65;">CENTRO · octubre</span></header>
<div style="display: flex; flex-direction: column; gap: 12px; padding: 14px; overflow: hidden;">
{c_canon.replace("grid-area: canon;", "").replace('height="230"', 'height="96"').replace("font-size: 46px", "font-size: 34px").replace('<span style="font-size: 18px; color: #6B6A65;">/mes</span>', '<span style="font-size: 15px; color: #6B6A65;">/mes</span>').replace(" · 81 % del potencial", "")}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
{card("Ocupación", "cuadros", num("86 %", 30) + f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #7a5600; font-weight: 600;">{icono_estado("aten")}meta 90 %</span>', "x").replace("grid-area: x;", "")}
{card("Canon ÷ tarifa", "etiqueta", num("94 %", 30) + f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #7a5600; font-weight: 600;">{icono_estado("aten")}meta 95 %</span>', "x").replace("grid-area: x;", "")}
</div>
{c_hoy.replace("grid-area: hoy;", "").replace('<span style="margin-top: auto; font-size: 13px; font-weight: 600; color: #3D3D3A;">Ver los 14 pendientes</span>', '')}
</div></div>'''
guardar("PanelRTel", "Panel rápido en el teléfono", 390, 844, pt)
print("panel ok")
