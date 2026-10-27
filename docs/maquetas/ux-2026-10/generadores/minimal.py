import sys
exec(open("tablero.py").read())

def linea_min(w=760, h=190):
    x0, x1, y0, y1 = 10, w - 150, 18, h - 26
    lo, hi = 7, 12.6
    X = lambda i: x0 + i * (x1 - x0) / 11
    Y = lambda v: y1 - (v - lo) / (hi - lo) * (y1 - y0)
    g = f'<line x1="{x0}" x2="{x1}" y1="{y1}" y2="{y1}" stroke="{EJE}" stroke-width="1"/>'
    for i in (0, 11):
        g += f'<text x="{X(i):.1f}" y="{h - 6}" text-anchor="{"start" if i == 0 else "end"}" font-size="12" fill="#52514e">{"nov 2025" if i == 0 else "oct 2026"}</text>'
    g += f'<polyline points="{" ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(POT))}" fill="none" stroke="{GR_DE}" stroke-width="2"/>'
    g += f'<polyline points="{" ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(CANON))}" fill="none" stroke="{AZ}" stroke-width="2.5" stroke-linejoin="round"/>'
    g += f'<circle cx="{X(11):.1f}" cy="{Y(CANON[-1]):.1f}" r="5" fill="{AZ}" stroke="#fff" stroke-width="2"/>'
    g += f'<text x="{X(11) + 14:.1f}" y="{Y(POT[-1]) + 4:.1f}" font-size="13" fill="#52514e">Potencial a tarifa</text>'
    g += f'<text x="{X(11) + 14:.1f}" y="{Y(CANON[-1]) + 4:.1f}" font-size="13" font-weight="600" fill="#0b0b0b">Contratado</text>'
    return f'<svg width="{w}" height="{h}" role="img" aria-label="Canon mensual contratado y potencial a tarifa, últimos 12 meses">{g}</svg>'

def cifra(titulo, valor, pie, est=None):
    e = f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #52514e;">{icono_estado(est) if est else ""}{pie}</span>'
    return (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 0 28px; border-left: 1px solid {BORDE};">'
            f'<span style="font-size: 14px; color: #52514e;">{titulo}</span><b style="font-size: 30px; font-weight: 600; white-space: nowrap;">{valor}</b>{e}</div>')
hacer = "".join(
    f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 14px 0; border-top: 1px solid #ECEAE4;">'
    f'<span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 15px; font-weight: 600;">{t}</span><span style="font-size: 13px; color: {GRIS};">{d}</span></span>{boton(a, h=34, extra="font-size: 13px;")}</div>'
    for t, d, a in [("PUN-07 vence en 4 días", "Galletas Sol · $ 600.000 /mes", "Renovar"),
                    ("PUN-03: montaje no realizado", "El proveedor no entregó el material", "Ver"),
                    ("GON-13: la reserva caduca hoy", "Lácteos Andinos", "Resolver")])
t0 = encabezado("Indicadores", pendientes=14) + f'''
<main style="display: flex; flex-direction: column; gap: 34px; padding: 36px 56px 28px; flex-grow: 1; min-height: 0;">
<div style="display: flex; align-items: center; gap: 12px;"><h1 style="margin: 0; font-size: 24px; font-weight: 600; flex-grow: 1;">Octubre 2026</h1><span style="font-size: 14px; color: {GRIS};">Sede CENTRO · al 26/10/2026</span>{boton("Cambiar período", "fan", icono="abajo")}</div>
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 56px; align-items: start;">
<section style="display: flex; flex-direction: column; gap: 10px;">
<span style="font-size: 14px; color: #52514e;">Canon mensual contratado</span>
<div style="display: flex; align-items: baseline; gap: 16px;"><b style="font-size: 56px; font-weight: 600; letter-spacing: -.01em;">{fmt(9939500)}</b><span style="font-size: 20px; color: #52514e;">/mes</span>{delta("+4,7 %", True)}<span style="font-size: 13px; color: {GRIS};">vs septiembre</span></div>
<div style="display: flex; align-items: center; gap: 12px; padding-top: 4px;"><span style="width: 260px; height: 6px; border-radius: 999px; background: #cde2fb;"><span style="display: block; width: 81%; height: 6px; border-radius: 999px; background: {AZ};"></span></span><span style="font-size: 13px; color: #52514e;">81 % del potencial a tarifa ({fmt(12200000)} /mes)</span></div>
<div style="padding-top: 18px;">{linea_min()}</div>
</section>
<section style="display: flex; flex-direction: column;">
<div style="display: flex; align-items: baseline; padding-bottom: 6px;"><b style="font-size: 16px; flex-grow: 1;">Para hacer hoy</b><a href="#" style="font-size: 13px; font-weight: 600;">Ver los 14</a></div>
{hacer}
</section>
</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-left: -28px;">
{cifra("Ocupación", "86 %", "Meta 90 %", "aten")}
{cifra("Canon ÷ tarifa", "94 %", "Meta 95 %", "aten")}
{cifra("Vence en 90 días sin renovar", fmt(1650000) + " /mes", "3 contratos")}
</div>
<div style="display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 16px; border-top: 1px solid {BORDE};"><span style="font-size: 14px;"><b>Dónde actuar:</b> las puntas de góndola concentran el 81 % de lo no facturado.</span><span style="flex-grow: 1;"></span><a href="#" style="font-size: 14px; font-weight: 600;">Ver el detalle</a></div>
</main>''' + nota("Minimalista: una cifra principal, una línea, tres números y tres tareas. Todo lo demás (tabla por tipo de mueble, vencimientos por semana, montajes) está en «Ver el detalle».")
guardar("T0", "Tablero minimalista", 1280, 860, t0)

# teléfono
t0t = f'''<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0;">
<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 18px; background: {BLANCO}; border-bottom: 1px solid {BORDE};"><b style="font-size: 17px; flex-grow: 1;">Indicadores</b><button type="button" aria-label="Pendientes: 14" style="display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 700;">{ico("campana")}<span style="min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: {ROJO}; color: {BLANCO}; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;">14</span></button></header>
<div style="display: flex; flex-direction: column; gap: 22px; padding: 26px 22px;">
<span style="font-size: 14px; color: {GRIS};">Octubre 2026 · Sede CENTRO</span>
<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-size: 14px; color: #52514e;">Canon mensual contratado</span><b style="font-size: 38px; font-weight: 600;">{fmt(9939500)} <span style="font-size: 18px; font-weight: 500; color: #52514e;">/mes</span></b><span style="display: flex; gap: 8px; align-items: center;">{delta("+4,7 %", True)}<span style="font-size: 13px; color: {GRIS};">vs septiembre · 81 % del potencial</span></span></div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
<div style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 13px; color: #52514e;">Ocupación</span><b style="font-size: 26px; font-weight: 600;">86 %</b><span style="display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: #52514e;">{icono_estado("aten")}Meta 90 %</span></div>
<div style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 13px; color: #52514e;">Canon ÷ tarifa</span><b style="font-size: 26px; font-weight: 600;">94 %</b><span style="display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: #52514e;">{icono_estado("aten")}Meta 95 %</span></div>
</div>
<div style="display: flex; flex-direction: column;"><b style="font-size: 15px; padding-bottom: 4px;">Para hacer hoy</b>{hacer}</div>
<a href="#" style="font-size: 14px; font-weight: 600;">Ver el detalle</a>
</div></div>'''
guardar("T0Tel", "Tablero minimalista en el teléfono", 390, 844, t0t)
print("minimal ok")
