import sys
exec(open("flujos.py").read())

AZ, AZ_CL, NAR, GR_DE = "#2a78d6", "#86b6ef", "#eb6834", "#b9b7af"
OK, ATEN, CRIT = "#0ca30c", "#fab219", "#d03b3b"
GRILLA, EJE = "#e1e0d9", "#c3c2b7"
fmt = lambda n: "$ " + f"{n:,.0f}".replace(",", ".")

def icono_estado(tipo):
    if tipo == "ok":   return f'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="{OK}" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
    if tipo == "aten": return f'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b07a00" stroke-width="2.5" aria-hidden="true"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg>'
    return f'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="{CRIT}" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/></svg>'
def estado(tipo, txt):
    col = {"ok": "#006300", "aten": "#7a5600", "crit": CRIT}[tipo]
    return f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: {col};">{icono_estado(tipo)}{txt}</span>'
def delta(txt, bueno):
    col = "#006300" if bueno else CRIT
    flecha = "▲" if txt.lstrip().startswith("+") else "▼"
    return f'<span style="font-size: 13px; font-weight: 600; color: {col};">{flecha} {txt}</span>'

def chispa(vals, w=150, h=34):
    mn, mx = min(vals), max(vals)
    pts = [(i * (w - 6) / (len(vals) - 1) + 3, h - 4 - (v - mn) / ((mx - mn) or 1) * (h - 8)) for i, v in enumerate(vals)]
    d = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    x, y = pts[-1]
    return f'<svg width="{w}" height="{h}" aria-hidden="true"><polyline points="{d}" fill="none" stroke="{GR_DE}" stroke-width="2" stroke-linejoin="round"/><circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{AZ}" stroke="#fff" stroke-width="2"/></svg>'

def tile(titulo, valor, d_txt, d_bueno, vs, chispas, est=None, sub=""):
    e = f'<div>{estado(*est)}</div>' if est else ""
    s = f'<span style="font-size: 12.5px; color: {GRIS};">{sub}</span>' if sub else ""
    return (f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; background: {BLANCO}; border: 1px solid {BORDE};">'
            f'<div style="display: flex; align-items: flex-start; gap: 8px;"><span style="font-size: 13px; color: #52514e; flex-grow: 1;">{titulo}</span>{chispa(chispas, 110, 28)}</div>'
            f'<b style="font-size: 26px; font-weight: 650; white-space: nowrap;">{valor}</b>{s}'
            f'<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">{delta(d_txt, d_bueno)}<span style="font-size: 12px; color: {GRIS};">{vs}</span></div>{e}</div>')

MESES12 = ["nov", "dic", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct"]
CANON = [8.10, 8.45, 8.20, 8.35, 8.60, 8.90, 9.05, 9.20, 9.10, 9.35, 9.4895, 9.9395]
POT = [12.2] * 12
def linea_tendencia(w=700, h=210):
    x0, x1, y0, y1 = 46, w - 120, 14, h - 26
    lo, hi = 6, 13
    X = lambda i: x0 + i * (x1 - x0) / 11
    Y = lambda v: y1 - (v - lo) / (hi - lo) * (y1 - y0)
    g = ""
    for v in [6, 8, 10, 12]:
        g += f'<line x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRILLA}" stroke-width="1"/><text x="{x0 - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" font-size="11" fill="#52514e">{v} M</text>'
    for i, m in enumerate(MESES12):
        g += f'<text x="{X(i):.1f}" y="{h - 8}" text-anchor="middle" font-size="11" fill="#52514e">{m}</text>'
    area = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(POT)) + " " + " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in reversed(list(enumerate(CANON))))
    g += f'<polygon points="{area}" fill="#f0efec"/>'
    g += f'<polyline points="{" ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(POT))}" fill="none" stroke="{GR_DE}" stroke-width="2"/>'
    g += f'<polyline points="{" ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(CANON))}" fill="none" stroke="{AZ}" stroke-width="2.5" stroke-linejoin="round"/>'
    g += f'<circle cx="{X(11):.1f}" cy="{Y(CANON[-1]):.1f}" r="5" fill="{AZ}" stroke="#fff" stroke-width="2"/>'
    g += f'<text x="{X(11) + 10:.1f}" y="{Y(POT[-1]) + 4:.1f}" font-size="12" fill="#52514e">Potencial a tarifa</text><text x="{X(11) + 10:.1f}" y="{Y(POT[-1]) + 19:.1f}" font-size="12" font-weight="600" fill="#0b0b0b">{fmt(12200000)}</text>'
    g += f'<text x="{X(11) + 10:.1f}" y="{Y(CANON[-1]) + 4:.1f}" font-size="12" fill="#52514e">Contratado</text><text x="{X(11) + 10:.1f}" y="{Y(CANON[-1]) + 19:.1f}" font-size="12" font-weight="600" fill="#0b0b0b">{fmt(9939500)}</text>'
    yb = (Y(POT[-3]) + Y(CANON[-3])) / 2
    g += f'<text x="{X(8):.1f}" y="{yb + 4:.1f}" text-anchor="middle" font-size="11" fill="#52514e">brecha: disponibles + canon bajo la tarifa</text>'
    return f'<svg width="{w}" height="{h}" role="img" aria-label="Canon mensual contratado y potencial a tarifa, noviembre 2025 a octubre 2026">{g}</svg>'

SEM = [("26/10", 600, 0), ("02/11", 0, 0), ("09/11", 0, 450), ("16/11", 0, 0), ("23/11", 0, 0), ("30/11", 600, 0), ("07/12", 0, 0), ("14/12", 0, 540), ("21/12", 0, 0), ("28/12", 0, 600), ("04/01", 0, 0), ("11/01", 450, 0), ("18/01", 0, 0)]
def barras_venc(w=700, h=200):
    x0, x1, y0, y1 = 46, w - 10, 14, h - 34
    hi = 800
    n = len(SEM); bw = (x1 - x0) / n
    Y = lambda v: y1 - v / hi * (y1 - y0)
    g = ""
    for v in [0, 200, 400, 600, 800]:
        g += f'<line x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRILLA if v else EJE}" stroke-width="1"/><text x="{x0 - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" font-size="11" fill="#52514e">{v} mil</text>'
    for i, (s, sin, con) in enumerate(SEM):
        cx = x0 + i * bw + bw / 2; ancho = bw - 14
        if con:
            g += f'<path d="M{cx - ancho / 2:.1f},{Y(0):.1f} V{Y(con) + 4:.1f} q0,-4 4,-4 H{cx + ancho / 2 - 4:.1f} q4,0 4,4 V{Y(0):.1f}Z" fill="{GR_DE}"/>'
        if sin:
            g += f'<path d="M{cx - ancho / 2:.1f},{Y(0):.1f} V{Y(sin) + 4:.1f} q0,-4 4,-4 H{cx + ancho / 2 - 4:.1f} q4,0 4,4 V{Y(0):.1f}Z" fill="{NAR}"/>'
            g += f'<text x="{cx:.1f}" y="{Y(sin) - 6:.1f}" text-anchor="middle" font-size="11" font-weight="600" fill="#0b0b0b">{sin} mil</text>'
        if i % 2 == 0:
            g += f'<text x="{cx:.1f}" y="{h - 16}" text-anchor="middle" font-size="11" fill="#52514e">{s}</text>'
    g += f'<text x="{x0}" y="{h - 2}" font-size="11" fill="#52514e">Semana que empieza el · canon mensual que vence</text>'
    return f'<svg width="{w}" height="{h}" role="img" aria-label="Canon mensual que vence por semana, próximos 90 días">{g}</svg>'

DISP = [(0, 3), (5, 4), (36, 5), (77, 6), (90, 6)]  # (día desde hoy, espacios disponibles)
def escalon(w=420, h=170):
    x0, x1, y0, y1 = 30, w - 14, 14, h - 30
    X = lambda d: x0 + d / 90 * (x1 - x0)
    Y = lambda v: y1 - v / 8 * (y1 - y0)
    g = ""
    for v in [0, 2, 4, 6, 8]:
        g += f'<line x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRILLA if v else EJE}" stroke-width="1"/><text x="{x0 - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" font-size="11" fill="#52514e">{v}</text>'
    pts = []
    for (d, v), (d2, _) in zip(DISP, DISP[1:]):
        pts += [(X(d), Y(v)), (X(d2), Y(v))]
    pts.append((X(90), Y(DISP[-1][1])))
    g += f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{AZ}" stroke-width="2.5"/>'
    for d, v in DISP[:-1]:
        g += f'<circle cx="{X(d):.1f}" cy="{Y(v):.1f}" r="4" fill="{AZ}" stroke="#fff" stroke-width="2"/>'
    g += f'<line x1="{X(36):.1f}" x2="{X(36):.1f}" y1="{y0}" y2="{y1}" stroke="#0b0b0b" stroke-width="1"/><text x="{X(36) + 6:.1f}" y="{y0 + 10}" font-size="11" font-weight="600" fill="#0b0b0b">desde el 01/12/2026: 5</text>'
    for d, t in [(0, "hoy"), (36, "01/12"), (77, "11/01"), (90, "24/01")]:
        g += f'<text x="{X(d):.1f}" y="{h - 12}" text-anchor="middle" font-size="11" fill="#52514e">{t}</text>'
    return f'<svg width="{w}" height="{h}" role="img" aria-label="Espacios disponibles por día, próximos 90 días">{g}</svg>'

def meter(p, tipo):
    col = {"ok": AZ, "aten": ATEN, "crit": CRIT}[tipo]
    ic = icono_estado(tipo) if tipo != "ok" else ""
    return f'<span style="display: inline-flex; align-items: center; gap: 8px;"><span style="width: 90px; height: 8px; border-radius: 999px; background: #cde2fb; overflow: hidden;"><span style="display: block; width: {p}%; height: 8px; border-radius: 999px; background: {col};"></span></span><b style="font-variant-numeric: tabular-nums; white-space: nowrap;">{p} %</b>{ic}</span>'
TIPOS = [("Góndola (por cara)", 12, 11, 92, "ok", "9 días", "97 %", "ok", 210000),
         ("Punta de góndola", 9, 7, 78, "crit", "31 días", "89 %", "aten", 880000),
         ("Nevera (entera)", 1, 1, 100, "ok", "0 días", "100 %", "ok", 0)]
def tabla_tipos():
    cab = f'<div style="display: grid; grid-template-columns: 1.4fr .7fr .8fr 1.3fr 1fr 1fr 1.1fr; gap: 12px; padding: 10px 16px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .05em; color: #52514e;"><span>TIPO DE MUEBLE</span><span style="text-align: right;">ESPACIOS</span><span style="text-align: right;">CONTRATADOS</span><span>OCUPACIÓN · META 90 %</span><span style="text-align: right;">DÍAS DISPONIBLES ENTRE CONTRATOS</span><span style="text-align: right;">CANON ÷ TARIFA</span><span style="text-align: right;">SIN FACTURAR EN OCTUBRE</span></div>'
    filas = "".join(f'<div style="display: grid; grid-template-columns: 1.4fr .7fr .8fr 1.3fr 1fr 1fr 1.1fr; gap: 12px; align-items: center; padding: 11px 16px; border-top: 1px solid #ECEAE4; font-size: 14px; font-variant-numeric: tabular-nums; {"background: #FFF8F0;" if oc < 90 else ""}"><b>{t}</b><span style="text-align: right;">{e}</span><span style="text-align: right;">{c}</span>{meter(oc, et)}<span style="text-align: right;">{d}</span><span style="text-align: right; display: inline-flex; justify-content: flex-end; align-items: center; gap: 6px;">{icono_estado(ct) if ct != "ok" else ""}{ct_v}</span><span style="text-align: right; font-weight: 600;">{fmt(sf) if sf else "—"}</span></div>'
                    for t, e, c, oc, et, d, ct_v, ct, sf in TIPOS)
    tot = f'<div style="display: grid; grid-template-columns: 1.4fr .7fr .8fr 1.3fr 1fr 1fr 1.1fr; gap: 12px; align-items: center; padding: 11px 16px; border-top: 2px solid #c3c2b7; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;"><span>Sede CENTRO</span><span style="text-align: right;">22</span><span style="text-align: right;">19</span>{meter(86, "aten")}<span style="text-align: right;">18 días</span><span style="text-align: right;">94 %</span><span style="text-align: right;">{fmt(1090000)}</span></div>'
    return f'<div style="border-radius: 12px; border: 1px solid {BORDE}; overflow: hidden; background: {BLANCO};">{cab}{filas}{tot}</div>'

ETAPAS = [("Empiezan en octubre", 8, "#86b6ef"), ("Aviso de montaje enviado", 7, "#5598e7"), ("Montaje registrado", 6, "#2a78d6"), ("Montado", 5, "#1c5cab"), ("Verificado", 4, "#104281")]
def embudo():
    filas = ""
    for t, n, c in ETAPAS:
        filas += (f'<div style="display: grid; grid-template-columns: 190px minmax(0, 1fr) 70px; gap: 10px; align-items: center; font-size: 13.5px;"><span>{t}</span>'
                  f'<span style="height: 18px; background: #f0efec; border-radius: 4px;"><span style="display: block; width: {n / 8 * 100:.0f}%; height: 18px; border-radius: 0 4px 4px 0; background: {c};"></span></span>'
                  f'<b style="text-align: right; font-variant-numeric: tabular-nums;">{n} de 8</b></div>')
    return filas

def tarjeta_sec(titulo, pregunta, cuerpo, extra=""):
    return (f'<section style="display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; min-width: 0; {extra}">'
            f'<div style="display: flex; flex-direction: column; gap: 2px;"><b style="font-size: 16px;">{titulo}</b><span style="font-size: 12.5px; color: #52514e;">{pregunta}</span></div>{cuerpo}</section>')
lectura = lambda txt: f'<div style="display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: #F4F2EC; font-size: 13.5px; line-height: 1.45;"><b style="white-space: nowrap;">Lectura:</b><span>{txt}</span></div>'

filtros_t = (f'<div style="display: flex; align-items: center; gap: 10px; padding: 12px 24px 0; flex-wrap: wrap;">'
             f'{boton("Período: octubre 2026 · al 26/10/2026", icono="abajo")}{boton("Comparar con: septiembre 2026", icono="abajo")}'
             f'<span style="flex-grow: 1;"></span>{boton("Ver como tabla", icono="tabla")}{boton("Exportar CSV", icono="planilla")}</div>')
alerta = (f'<div style="margin: 12px 24px 0; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; background: {BLANCO}; border: 1px solid {BORDE}; border-left: 4px solid {CRIT};">'
          f'{icono_estado("crit")}<b style="font-size: 14px;">Hoy: 3 pendientes con fecha límite hoy</b><span style="font-size: 13.5px; color: #3D3D3A;">1 montaje no realizado (PUN-03) · 1 contrato vence el 30/10/2026 (PUN-07) · 1 reserva provisional caduca hoy (GON-13)</span><span style="flex-grow: 1;"></span>{boton("Abrir Pendientes", h=34)}</div>')
heroe = tarjeta_sec("Canon mensual contratado", "¿Cuánto factura la sede por mes y cuánto podría facturar a tarifa?",
    f'<div style="display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;"><b style="font-size: 44px; font-weight: 650;">{fmt(9939500)} <span style="font-size: 22px; font-weight: 500;">/mes</span></b>{delta("+ $ 450.000 (+4,7 %)", True)}<span style="font-size: 12.5px; color: {GRIS};">vs septiembre 2026</span></div>'
    f'{linea_tendencia()}'
    f'{lectura("La sede factura el <b>81 %</b> de su potencial a tarifa ($ 9.939.500 de $ 12.200.000 /mes). La brecha de $ 2.260.500 /mes se reparte entre espacios disponibles y canon por debajo de la tarifa.")}', "grid-row: span 3;")
lado = (tile("Ocupación", "86 %", "+4,5 pp", True, "vs septiembre 2026", [80, 80, 77, 77, 82, 82, 86, 86, 82, 82, 82, 86], ("aten", "Bajo la meta de 90 %"), "19 de 22 espacios contratables")
        + tile("Canon ÷ tarifa", "94 %", "−1 pp", False, "vs septiembre 2026", [96, 96, 95, 95, 95, 96, 95, 95, 95, 95, 95, 94], ("aten", "Bajo la meta de 95 %"), "$ 9.939.500 de $ 10.550.000 /mes")
        + tile("Sin facturar por espacios disponibles", fmt(1090000), "−$ 240.000", True, "vs septiembre 2026 al mismo día", [1.9, 1.7, 1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.4, 1.3, 1.33, 1.09], None, "en octubre 2026, a tarifa diaria"))
viene_izq = tarjeta_sec("Canon que vence en los próximos 90 días", "¿Qué facturación está en riesgo y cuándo?",
    f'<div style="display: flex; gap: 16px; font-size: 13px; align-items: center;"><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: {NAR};"></span>Sin contrato siguiente · {fmt(1650000)} /mes · 3 contratos</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: {GR_DE};"></span>Con contrato siguiente · {fmt(1590000)} /mes · 3 contratos</span></div>'
    f'{barras_venc()}'
    + "".join(f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 120px 110px auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid #F0EEE8; font-size: 13.5px;"><b>{a}</b><span style="font-variant-numeric: tabular-nums;">{b}</span><span style="color: {CRIT if int(c.split()[0]) <= 30 else "#52514e"}; font-weight: 600;">{c}</span>{boton("Renovar contrato", h=30, extra="font-size: 12.5px;")}</div>' for a, b, c in [("PUN-07 · Galletas Sol", fmt(600000) + " /mes", "4 días"), ("PUN-01 · Limpio Hogar", fmt(600000) + " /mes", "35 días"), ("GON-01 cara A · Café Montaña", fmt(450000) + " /mes", "76 días")]))
viene_der = tarjeta_sec("Espacios disponibles por día", "¿Qué puedo ofrecer y desde cuándo?", f'{escalon()}{lectura("Hoy hay 3 disponibles. Si no se renueva nada, el 24/01/2027 serán 6.")}')
porque = tarjeta_sec("Ocupación y precio por tipo de mueble", "¿Dónde está la brecha y qué hay que corregir?", f'{tabla_tipos()}{lectura("Las <b>puntas de góndola</b> concentran el <b>81 %</b> de lo no facturado ($ 880.000 de $ 1.090.000), están 31 días disponibles entre contratos y se contratan al 89 % de la tarifa. Es el primer lugar para actuar: renovar a tiempo y revisar la tarifa.")}')
oper_izq = tarjeta_sec("Montajes de los contratos que empiezan en octubre", "¿Lo contratado está en la tienda como se pidió?", f'<div style="display: flex; flex-direction: column; gap: 8px;">{embudo()}</div>{lectura("1 contrato sin aviso por falta de planometría, 1 montaje no realizado y 1 sin verificar. Del inicio del contrato al montaje: 1,4 días en promedio.")}')
oper_der = tarjeta_sec("Pendientes por fecha límite", "¿Cuánto trabajo hay y de qué tipo?", "".join(f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 40px; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid #F0EEE8; font-size: 14px;"><span>{t}</span><b style="text-align: right; font-variant-numeric: tabular-nums;">{n}</b></div>' for t, n in [("Fecha límite hoy", 3), ("Próximos 30 días", 6), ("Inconsistencias de datos", 5)]) + f'<a href="#" style="font-size: 13px; font-weight: 600; padding-top: 6px;">Abrir Pendientes</a>')
seccion_t = lambda n, t: f'<div style="display: flex; align-items: baseline; gap: 10px; padding: 18px 24px 0;"><span style="font-size: 12px; font-weight: 700; letter-spacing: .08em; color: {AZ};">{n}</span><b style="font-size: 17px;">{t}</b></div>'
tab_cuerpo = (encabezado("Indicadores", pendientes=14) + barra_modulo("Indicadores", "", "el tablero diario") + filtros_t + alerta
  + seccion_t("1 · RESULTADO", "Cómo cerró hasta hoy el mes")
  + f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: auto auto auto; gap: 12px; padding: 10px 24px 0;">{heroe}{lado}</div>'
  + seccion_t("2 · LO QUE VIENE", "Próximos 90 días: del 27/10/2026 al 24/01/2027")
  + f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 12px; padding: 10px 24px 0;">{viene_izq}{viene_der}</div>'
  + seccion_t("3 · POR QUÉ", "Dónde se gana y dónde se pierde")
  + f'<div style="padding: 10px 24px 0;">{porque}</div>'
  + seccion_t("4 · OPERACIÓN", "Si lo contratado se cumple")
  + f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 12px; padding: 10px 24px 24px;">{oper_izq}{oper_der}</div>')
guardar("T1", "Tablero diario rediseñado", 1280, 2050, tab_cuerpo, extra_style="display: flex; flex-direction: column; overflow: visible;")

# ---------- T2 · todas las sedes ----------
SEDES = [("CENTRO", 22, 19, 86, "aten", 9939500, "+4,7 %", True, "94 %", "aten", 1090000, "3 · $ 1.650.000", 1, [8.1, 8.45, 8.2, 8.35, 8.6, 8.9, 9.05, 9.2, 9.1, 9.35, 9.49, 9.94]),
         ("PALMAS", 15, 12, 80, "aten", 7420000, "−1,2 %", False, "88 %", "aten", 1410000, "2 · $ 980.000", 0, [7.0, 7.1, 7.3, 7.4, 7.6, 7.5, 7.6, 7.7, 7.6, 7.55, 7.51, 7.42])]
cols = "1fr 1.3fr 1fr 1.6fr 1.1fr 1.2fr 1.6fr 1fr"
cab_s = f'<div style="display: grid; grid-template-columns: {cols}; gap: 12px; padding: 10px 16px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .05em; color: #52514e;"><span>SEDE</span><span>OCUPACIÓN · META 90 %</span><span style="text-align: right;">CANON ÷ TARIFA</span><span style="text-align: right;">CANON MENSUAL CONTRATADO</span><span style="text-align: right;">VS SEPTIEMBRE</span><span style="text-align: right;">SIN FACTURAR EN OCTUBRE</span><span style="text-align: right;">VENCEN EN 90 DÍAS SIN RENOVAR</span><span style="text-align: right;">NO REALIZADOS</span></div>'
filas_s = "".join(f'<div style="display: grid; grid-template-columns: {cols}; gap: 12px; align-items: center; padding: 14px 16px; border-top: 1px solid #ECEAE4; font-size: 14px; font-variant-numeric: tabular-nums;"><span style="display: flex; flex-direction: column; gap: 4px;"><b>{s}</b>{chispa(ch, 90, 22)}</span>{meter(oc, et)}<span style="text-align: right; display: inline-flex; justify-content: flex-end; gap: 6px; align-items: center;">{icono_estado(ct)}{ctv}</span><b style="text-align: right;">{fmt(cn)} /mes</b><span style="text-align: right;">{delta(dv, db)}</span><span style="text-align: right;">{fmt(sf)}</span><span style="text-align: right;">{vr} /mes</span><span style="text-align: right;">{nr}</span></div>'
                  for s, e, c, oc, et, cn, dv, db, ctv, ct, sf, vr, nr, ch in SEDES)
tot_s = f'<div style="display: grid; grid-template-columns: {cols}; gap: 12px; align-items: center; padding: 14px 16px; border-top: 2px solid #c3c2b7; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;"><span>Total · 2 sedes</span>{meter(84, "aten")}<span style="text-align: right; display: inline-flex; justify-content: flex-end; gap: 6px; align-items: center;">{icono_estado("aten")}91 %</span><span style="text-align: right;">{fmt(17359500)} /mes</span><span style="text-align: right;">{delta("+2,1 %", True)}</span><span style="text-align: right;">{fmt(2500000)}</span><span style="text-align: right;">5 · $ 2.630.000 /mes</span><span style="text-align: right;">1</span></div>'
t2 = (encabezado("Indicadores", sede="Todas las sedes", pendientes=21) + barra_modulo("Indicadores", "", "todas las sedes")
      + f'<div style="display: flex; align-items: center; gap: 10px; padding: 12px 24px 0;">{boton("Período: octubre 2026 · al 26/10/2026", icono="abajo")}{boton("Comparar con: septiembre 2026", icono="abajo")}<span style="flex-grow: 1;"></span>{boton("Exportar CSV", icono="planilla")}</div>'
      + f'<main style="display: flex; flex-direction: column; gap: 14px; padding: 14px 24px 24px;">'
      + f'<div style="border-radius: 16px; border: 1px solid {BORDE}; overflow: hidden; background: {BLANCO};">{cab_s}{filas_s}{tot_s}</div>'
      + lectura("Las dos sedes están bajo las metas. PALMAS es la más lejana (ocupación 80 %, canon ÷ tarifa 88 %) y la única que factura menos que en septiembre (−1,2 %). Tocá una sede para abrir su tablero con los mismos cuatro bloques.")
      + "</main>" + nota("Para un supermercado con varias sedes: una fila por sede con las mismas métricas, metas y comparación. La diferencia se ve sin abrir cada sede."))
guardar("T2", "Tablero: todas las sedes", 1280, 560, t2)

# ---------- T3 · revisión como analista ----------
HALLAZGOS = [
 ("Cifras sin comparación", "«Ocupación 86 %» sin meta ni mes anterior.", "No se sabe si 86 % está bien o mal.", "Cada cifra con comparación (vs el mes anterior), tendencia de 12 meses y meta explícita."),
 ("Ventanas de tiempo mezcladas", "Hoy, octubre, 30 días y 90 días en la misma pantalla, sin filtro común.", "Las cifras no se pueden sumar ni comparar entre sí.", "Una fila de filtros arriba: sede, período y comparación. Todo el tablero responde a esa selección."),
 ("Sólo indicadores de resultado", "Canon y ocupación dicen lo que ya pasó.", "Se reacciona cuando el espacio ya quedó vacío.", "Bloque «Lo que viene»: canon que vence en 90 días, separado en con y sin contrato siguiente, y disponibilidad futura."),
 ("Sin diagnóstico", "El total no dice dónde está el problema.", "No se sabe qué tipo de mueble corregir.", "Tabla por tipo de mueble: ocupación, días disponibles, canon ÷ tarifa y lo no facturado, con la fila bajo meta marcada."),
 ("Sin potencial", "«$ 2.552.814» sin referencia de cuánto podría ser.", "No se ve el tamaño de la oportunidad.", "Canon contratado contra potencial a tarifa en la misma escala; la brecha queda a la vista."),
 ("El plano como gráfico principal", "Un mapa espacial ocupa medio tablero.", "Sirve para ubicar, no para decidir: baja densidad de información.", "El plano queda en Contratos y en la ficha; el tablero usa tablas y gráficos de una sola escala."),
 ("Escalera sin ejes", "Barras de disponibilidad sin valores ni eje.", "No se puede leer cuántos espacios hay en una fecha.", "Línea escalonada con eje, puntos en cada cambio y una lectura escrita."),
 ("Rojo para todo", "Rojo en «3 espacios» y en un vencimiento.", "El color pierde significado y alarma sin razón.", "Color de estado sólo contra un umbral definido, siempre con ícono y texto («Bajo la meta de 90 %»)."),
 ("Tareas en una columna fija", "La lista de «Hoy» ocupa un tercio del tablero.", "Mezcla operación con análisis.", "Una franja de alerta arriba con el conteo y un botón a Pendientes."),
 ("Números abreviados", "La tentación de «$ 2,5 M».", "En Colombia «M» se lee como miles o como millones.", "Importes completos en las tarjetas; en ejes, «mil» y «M» escritos con su unidad."),
]
fila_h = lambda a, b, c, dd: f'<div style="display: grid; grid-template-columns: 1fr 1.3fr 1.2fr 1.8fr; gap: 16px; padding: 12px 18px; border-top: 1px solid #ECEAE4; font-size: 14px; line-height: 1.45;"><b>{a}</b><span style="color: #3D3D3A;">{b}</span><span style="color: {CRIT};">{c}</span><span>{dd}</span></div>'
t3 = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Revisión del tablero como analista de datos</h1><span style="font-size: 15px; color: {GRIS}; line-height: 1.5;">El tablero anterior mostraba datos; el nuevo tiene que llevar a decisiones. Se ordena como se lee un informe: resultado → lo que viene → por qué → operación. Cada bloque contesta una pregunta y termina en una lectura escrita.</span></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;"><div style="display: grid; grid-template-columns: 1fr 1.3fr 1.2fr 1.8fr; gap: 16px; padding: 10px 18px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>HALLAZGO</span><span>EN EL TABLERO ANTERIOR</span><span>EFECTO EN LA DECISIÓN</span><span>CAMBIO</span></div>{"".join(fila_h(*h) for h in HALLAZGOS)}</div>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px;">
{"".join(tarjeta(f'<span style="font-size: 12px; font-weight: 700; letter-spacing: .08em; color: {AZ};">{n}</span><b style="font-size: 16px;">{t}</b><span style="font-size: 13.5px; line-height: 1.5; color: #3D3D3A;">{d}</span>') for n, t, d in [("1 · RESULTADO", "¿Cómo va el mes?", "Canon contratado contra potencial, ocupación, canon ÷ tarifa y lo no facturado. Comparado con el mes anterior y con meta."), ("2 · LO QUE VIENE", "¿Qué está en riesgo?", "Canon que vence en 90 días, con y sin contrato siguiente; espacios disponibles por día."), ("3 · POR QUÉ", "¿Dónde actuar?", "Por tipo de mueble (y por sede): dónde está la brecha de ocupación y de precio."), ("4 · OPERACIÓN", "¿Se cumple lo contratado?", "Embudo de montajes de los contratos del mes y pendientes por fecha límite.")])}
</div>
</div>'''
guardar("T3", "Revisión del tablero como analista", 1760, 960, t3)

# ---------- T4 · diccionario de métricas ----------
MET = [
 ("Canon mensual contratado", "Suma del canon mensual de los contratos vigentes en el período.", "Mes elegido", "Mes anterior · 12 meses", "—", "Contratos", "E"),
 ("Potencial a tarifa", "Suma de la tarifa mensual vigente de todos los espacios contratables.", "Mes elegido", "—", "—", "Tarifas, plano", "N"),
 ("Ocupación", "Espacios contratables con contrato vigente hoy ÷ espacios contratables.", "Hoy", "Mismo día del mes anterior", "Meta 90 % · ámbar < 90 % · rojo < 80 %", "Contratos, plano", "C"),
 ("Canon ÷ tarifa", "Canon mensual vigente ÷ tarifa mensual de esos mismos espacios.", "Hoy", "Mes anterior", "Meta 95 % · ámbar < 95 % · rojo < 85 %", "Contratos, tarifas", "N"),
 ("Sin facturar por espacios disponibles", "Tarifa diaria × días sin contrato en el período, sumado por espacio.", "Mes elegido, hasta hoy", "Mes anterior al mismo día", "—", "Contratos, tarifas", "N"),
 ("Canon que vence en 90 días", "Canon mensual de los contratos con fin en los próximos 90 días, separado en con y sin contrato siguiente.", "Próximos 90 días", "—", "Rojo si vence en ≤ 30 días sin contrato siguiente", "Contratos", "C"),
 ("Espacios disponibles por día", "Cantidad de espacios contratables sin contrato ni reserva, cada día.", "Próximos 90 días", "—", "—", "Contratos, reservas", "E"),
 ("Días disponibles entre contratos", "Promedio de días entre el fin de un contrato y el inicio del siguiente en el mismo espacio.", "Últimos 12 meses", "—", "—", "Contratos", "N"),
 ("Montajes del mes", "Contratos que empiezan en el mes → aviso enviado → registrado → montado → verificado.", "Mes elegido", "—", "Rojo si hay no realizados", "Contratos, montajes", "C"),
 ("Pendientes por fecha límite", "Conteo de pendientes: hoy, próximos 30 días, inconsistencias.", "Hoy", "—", "—", "Pendientes", "E"),
]
fila_m2 = lambda a, b, c, dd, e, f2, k: f'<div style="display: grid; grid-template-columns: 1.1fr 2fr .9fr 1fr 1.3fr .9fr 100px; gap: 14px; padding: 11px 18px; border-top: 1px solid #ECEAE4; font-size: 13.5px; line-height: 1.45;"><b>{a}</b><span>{b}</span><span style="color: #3D3D3A;">{c}</span><span style="color: #3D3D3A;">{dd}</span><span style="color: #3D3D3A;">{e}</span><span style="color: {GRIS};">{f2}</span>{chip_tag(k)}</div>'
t4 = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Diccionario de métricas del tablero</h1><span style="font-size: 15px; color: {GRIS};">Cada cifra con su fórmula, su período, su comparación y su umbral. Lo que dice el tablero es exactamente esto, en todas las sedes.</span></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;"><div style="display: grid; grid-template-columns: 1.1fr 2fr .9fr 1fr 1.3fr .9fr 100px; gap: 14px; padding: 10px 18px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>MÉTRICA</span><span>DEFINICIÓN</span><span>PERÍODO</span><span>COMPARACIÓN</span><span>UMBRAL (PROPUESTO)</span><span>DATOS</span><span>HOY</span></div>{"".join(fila_m2(*m) for m in MET)}</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;">
{tarjeta(f'<b style="font-size: 15px;">Las metas son tuyas</b><span style="font-size: 13.5px; line-height: 1.5; color: #3D3D3A;">90 % de ocupación y 95 % de canon ÷ tarifa son una propuesta. Se definirían en Ajustes, por sede. Sin meta, la tarjeta muestra la comparación pero no el estado.</span>')}
{tarjeta(f'<b style="font-size: 15px;">Un límite de los datos</b><span style="font-size: 13.5px; line-height: 1.5; color: #3D3D3A;">Las tarifas no guardan historia: el potencial y canon ÷ tarifa de meses pasados se calculan con la tarifa vigente. El canon y la ocupación de cada mes sí salen exactos de las fechas de los contratos.</span>')}
{tarjeta(f'<b style="font-size: 15px;">Cada gráfico tiene su tabla</b><span style="font-size: 13.5px; line-height: 1.5; color: #3D3D3A;">«Ver como tabla» y «Exportar CSV» muestran los mismos números del filtro elegido. Ningún dato vive sólo en un color o en un tooltip.</span>')}
</div>
</div>'''
guardar("T4", "Diccionario de métricas", 1760, 940, t4)
print("tablero ok")
