import sys
exec(open("panel.py").read())

PEST = ["Resumen", "Tabla de contratos", "Quién paga el canon", "Participaciones de cara"]
def pestanas(act):
    return ('<div role="tablist" style="display: flex; gap: 2px; border-bottom: 1px solid #E1DFD8;">' + "".join(
        f'<span role="tab" style="padding: 10px 14px; font-size: 14px; font-weight: 600; {"color: #141413; box-shadow: inset 0 -2px 0 #141413;" if p == act else "color: #6B6A65;"}">{p}</span>' for p in PEST) + "</div>")
def cabeza(act, sede="Sede CENTRO", derecha=None):
    der = derecha if derecha is not None else seg_periodo
    return (f'<div style="display: flex; align-items: center; gap: 14px;"><span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1;"><h1 style="margin: 0; font-size: 24px; font-weight: 650; letter-spacing: -.01em;">Indicadores</h1>'
            f'<span style="font-size: 13.5px; color: #6B6A65;">Lunes 26/10/2026 · {sede} · comparado con septiembre 2026</span></span>{der}</div>{pestanas(act)}')
def pantalla(act, cuerpo, sede="CENTRO", derecha=None, sede_txt="Sede CENTRO"):
    return encabezado("Indicadores", sede=sede, pendientes=14 if sede == "CENTRO" else 21) + f'''
<main style="display: flex; flex-direction: column; gap: 16px; padding: 22px 28px 24px; flex-grow: 1; min-height: 0; background: #F4F3EF;">
{cabeza(act, sede_txt, derecha)}
{cuerpo}
</main>'''

# ---------- K1 · Resumen (el panel B) con la definición abierta ----------
c_ct_q = c_ct.replace('<span style="font-size: 14px; font-weight: 600; color: #3D3D3A; flex-grow: 1;">Canon ÷ tarifa</span>',
                      '<span style="font-size: 14px; font-weight: 600; color: #3D3D3A;">Canon ÷ tarifa</span><span aria-label="Qué es" style="width: 18px; height: 18px; border-radius: 999px; background: #141413; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;">?</span><span style="flex-grow: 1;"></span>')
pop = (f'<div role="tooltip" style="position: absolute; left: 330px; top: 420px; width: 300px; z-index: 6; padding: 14px 16px; border-radius: 14px; background: #141413; color: #F4F2EC; font-size: 13px; line-height: 1.5; box-shadow: 0 14px 34px rgba(20,20,19,.3); display: flex; flex-direction: column; gap: 6px;">'
       f'<b style="color: #fff; font-size: 14px;">Canon ÷ tarifa</b><span>Canon mensual vigente ÷ tarifa mensual de esos mismos espacios.</span>'
       f'<span style="color: #C9C6BE;">Período: hoy · Comparación: septiembre 2026 · Meta: 95 % (Ajustes › Metas)</span>'
       f'<a href="#" style="color: {AMARILLO}; font-weight: 600;">Ver el diccionario de métricas</a></div>')
grid_k1 = grid.replace(c_ct, c_ct_q).replace("grid-template-rows: 1fr 1fr 1fr;", "grid-template-rows: 1fr 1fr .95fr;")
k1 = pantalla("Resumen", grid_k1) + pop
guardar("K1", "Indicadores combinado: Resumen", 1280, 900, k1, fondo="#F4F3EF")

# ---------- K2 · Tabla de contratos ----------
CONT = [("PUN-07", "Galletas Sol", "01/05/2026 – 30/10/2026", 600000, "100 %", "Verificado: coincide", VERDE, "4 días", True),
        ("PUN-01", "Limpio Hogar", "01/06/2026 – 30/11/2026", 600000, "100 %", "Verificado: coincide", VERDE, "35 días", True),
        ("PUN-05", "Galletas Sol", "15/09/2026 – 14/12/2026", 540000, "90 %", "Montado, sin verificar", AMBAR, "49 días", False),
        ("PUN-04", "Lácteos Andinos", "01/07/2026 – 31/12/2026", 600000, "100 %", "Verificado: coincide", VERDE, "66 días", False),
        ("GON-01 A", "Café Montaña", "11/07/2026 – 10/01/2027", 450000, "100 %", "Verificado: coincide", VERDE, "76 días", True),
        ("PUN-03", "Café Montaña", "01/08/2026 – 31/01/2027", 480000, "80 %", "No realizado · sin material", CRIT, "97 días", False),
        ("GON-02 A", "Aseo Total", "01/02/2026 – 31/01/2027", 380000, "84 %", "Sin montar · falta planometría", GRIS, "97 días", False),
        ("PUN-06", "Bebidas del Valle", "01/09/2026 – 28/02/2027", 510000, "85 %", "Verificado: coincide", VERDE, "125 días", False),
        ("NEV-01", "Lácteos Andinos", "01/03/2026 – 28/02/2027", 1400000, "100 %", "Verificado: coincide", VERDE, "125 días", False)]
colsK = "1fr 1.3fr 1.7fr 1fr .7fr 1.6fr 1.25fr"
cabK = f'<div style="display: grid; grid-template-columns: {colsK}; gap: 12px; padding: 11px 18px; font-size: 11px; font-weight: 700; letter-spacing: .05em; color: #6B6A65; border-bottom: 1px solid #ECEAE4;"><span>ESPACIO</span><span>PROVEEDOR</span><span>VIGENCIA</span><span style="text-align: right;">CANON /MES</span><span style="text-align: right;">÷ TARIFA</span><span>MONTAJE</span><span style="text-align: right;">VENCE EN ↑</span></div>'
filK = "".join(f'<div style="display: grid; grid-template-columns: {colsK}; gap: 12px; align-items: center; padding: 11px 18px; border-top: 1px solid #F2F0EB; font-size: 13.5px; font-variant-numeric: tabular-nums;">'
               f'<b style="font-family: ui-monospace, Menlo, monospace; font-size: 13px;">{e}</b><span>{p}</span><span style="color: #52514e;">{v}</span><span style="text-align: right;">{fmt(c)}</span>'
               f'<span style="text-align: right; display: inline-flex; justify-content: flex-end; align-items: center; gap: 5px;">{icono_estado("aten") if int(ct.split()[0]) < 95 else ""}{ct}</span>'
               f'<span style="display: inline-flex; align-items: center; gap: 7px; color: #3D3D3A;"><span style="width: 8px; height: 8px; border-radius: 999px; background: {mc}; flex-shrink: 0;"></span>{m}</span>'
               f'<span style="text-align: right; font-weight: 600; color: {CRIT if (sin and int(ven.split()[0]) <= 30) else ("#B4531F" if sin else "#3D3D3A")};">{ven}{" · sin renovar" if sin else ""}</span></div>' for e, p, v, c, ct, m, mc, ven, sin in CONT)
chipsK = '<div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">' + "".join(f'<span style="padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; {"background: #141413; color: #fff;" if i == 0 else "background: #fff; border: 1px solid #DEDBD3;"}">{t}</span>' for i, t in enumerate(["Vigentes · 19", "Vencen en 90 días · 6", "Próximos · 3", "Vencidos · 4", "Cerrados · 1"])) + f'<span style="flex-grow: 1;"></span><span style="display: inline-flex; align-items: center; gap: 8px; width: 240px; height: 36px; padding: 0 12px; border-radius: 10px; background: #fff; border: 1px solid #DEDBD3; font-size: 13px; color: #6B6A65;">{ico("buscar", color="#6B6A65")}Buscar espacio o proveedor</span>{boton("Exportar CSV", icono="planilla", h=36)}</div>'
k2 = pantalla("Tabla de contratos", chipsK + f'<div style="border-radius: 18px; background: #fff; border: 1px solid #E7E5DF; overflow: hidden;">{cabK}{filK}<div style="padding: 12px 18px; border-top: 1px solid #F2F0EB; font-size: 13px; color: #6B6A65;">9 de 19 contratos vigentes · ordenados por «vence en» · tocá una fila para abrir la ficha del espacio</div></div>', derecha="")
guardar("K2", "Indicadores combinado: Tabla de contratos", 1280, 860, k2, fondo="#F4F3EF")

# ---------- K3 · Quién paga el canon ----------
PROV = [("Lácteos Andinos", 2000000, 2, "31/12/2026"), ("Aseo Total", 1690000, 4, "15/11/2026"), ("Café Montaña", 1380000, 3, "10/01/2027"), ("Bebidas del Valle", 1260000, 2, "28/02/2027"),
        ("Galletas Sol", 1140000, 2, "30/10/2026"), ("Limpio Hogar", 1050000, 2, "30/11/2026"), ("Snacks Andes", 870000, 2, "31/03/2027"), ("Otros 3 proveedores", 549500, 3, "—")]
tot = sum(p[1] for p in PROV)
filP = "".join(f'<div style="display: grid; grid-template-columns: 190px minmax(0, 1fr) 130px 70px 90px 120px; gap: 14px; align-items: center; padding: 10px 18px; border-top: 1px solid #F2F0EB; font-size: 13.5px; font-variant-numeric: tabular-nums;">'
               f'<b style="{"color: #6B6A65; font-weight: 600;" if n.startswith("Otros") else ""}">{n}</b>'
               f'<span style="height: 14px;"><span style="display: block; width: {c / PROV[0][1] * 100:.1f}%; height: 14px; border-radius: 0 4px 4px 0; background: {GR_DE if n.startswith("Otros") else AZ};"></span></span>'
               f'<span style="text-align: right;">{fmt(c)}</span><span style="text-align: right; color: #52514e;">{c / tot * 100:.1f} %</span><span style="text-align: right; color: #52514e;">{k} contr.</span><span style="text-align: right; color: #52514e;">{v}</span></div>' for n, c, k, v in PROV).replace(".", ",", 0)
filP = filP.replace(" %</span>", " %</span>")
cabP = f'<div style="display: grid; grid-template-columns: 190px minmax(0, 1fr) 130px 70px 90px 120px; gap: 14px; padding: 11px 18px; font-size: 11px; font-weight: 700; letter-spacing: .05em; color: #6B6A65; border-bottom: 1px solid #ECEAE4;"><span>PROVEEDOR</span><span>CANON MENSUAL</span><span style="text-align: right;">/MES</span><span style="text-align: right;">% DEL TOTAL</span><span style="text-align: right;">CONTRATOS</span><span style="text-align: right;">PRÓXIMO FIN</span></div>'
dest = (f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">'
        + card("Proveedores con contrato vigente", "cuadros", f'{num("10", 36)}{sub("en Sede CENTRO")}', "a").replace("grid-area: a;", "")
        + card("Los 3 primeros pagan", "dinero", f'{num("51 %", 36)}{sub("del canon mensual · " + fmt(5070000) + " de " + fmt(9939500))}', "b").replace("grid-area: b;", "")
        + card("El que más paga", "etiqueta", f'{num("Lácteos Andinos", 26)}{sub(fmt(2000000) + " /mes · 20,1 % del total")}', "c").replace("grid-area: c;", "") + "</div>")
k3 = pantalla("Quién paga el canon", dest + f'<div style="border-radius: 18px; background: #fff; border: 1px solid #E7E5DF; overflow: hidden;">{cabP}{filP}</div>', derecha="")
k3 = k3.replace(">20.1 %<", ">20,1 %<")
for a in ["17.0", "13.9", "12.7", "11.5", "10.6", "8.8", "5.5", "20.1"]:
    k3 = k3.replace(f">{a} %<", f">{a.replace('.', ',')} %<")
guardar("K3", "Indicadores combinado: Quién paga el canon", 1280, 860, k3, fondo="#F4F3EF")

# ---------- K4 · Participaciones de cara ----------
COLP = {"Aseo Total": ("#2a78d6", "#fff"), "Lácteos Andinos": ("#eb6834", "#fff"), "Café Montaña": ("#1baf7a", "#fff"), "Snacks Andes": ("#eda100", "#141413"), "Bebidas del Valle": ("#e87ba4", "#141413")}
CARAS = [("GON-03 · cara A", [("Aseo Total", 50), ("Lácteos Andinos", 30)], 20, "Ubicadas en la cara"),
         ("GON-03 · cara B", [("Café Montaña", 40)], 60, "Ubicada en la cara"),
         ("GON-06 · cara A", [("Snacks Andes", 25), ("Bebidas del Valle", 25), ("Lácteos Andinos", 25)], 25, "Falta ubicar 25 % (Lácteos Andinos)")]
def barra100(segs, libre):
    h = '<div style="display: flex; gap: 2px; height: 34px;">'
    for n, p in segs:
        bg, fg = COLP[n]
        h += f'<span style="flex: {p}; background: {bg}; color: {fg}; border-radius: 6px; display: flex; align-items: center; padding: 0 10px; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden;">{n} · {p} %</span>'
    h += f'<span style="flex: {libre}; border-radius: 6px; box-shadow: inset 0 0 0 1.5px #B9B7AF; display: flex; align-items: center; padding: 0 10px; font-size: 12.5px; color: #52514e; white-space: nowrap;">Disponible · {libre} %</span></div>'
    return h
filC = "".join(f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 16px 20px; border-top: 1px solid #F2F0EB;"><div style="display: flex; align-items: baseline; gap: 10px;"><b style="font-size: 15px; font-family: ui-monospace, Menlo, monospace;">{c}</b><span style="font-size: 13px; color: {CRIT if "Falta" in est else "#52514e"}; display: inline-flex; align-items: center; gap: 5px;">{icono_estado("crit") if "Falta" in est else icono_estado("ok")}{est}</span><span style="flex-grow: 1;"></span><span style="font-size: 13px; font-weight: 600;">Abrir en Distribución</span></div>{barra100(s, l)}</div>' for c, s, l, est in CARAS)
k4 = pantalla("Participaciones de cara", f'<div style="display: flex; gap: 10px; align-items: center;">{boton("Proveedor: todos", icono="abajo", h=36)}{boton("Día del informe: 26/10/2026", icono="abajo", h=36)}<span style="flex-grow: 1;"></span>{boton("Exportar CSV", icono="planilla", h=36)}</div>'
              + f'<div style="border-radius: 18px; background: #fff; border: 1px solid #E7E5DF; overflow: hidden;"><div style="padding: 14px 20px; font-size: 13px; color: #6B6A65;">3 caras que se contratan por participación · cada proveedor conserva su color en todas las caras · el 100 % es la cara entera</div>{filC}</div>', derecha="")
guardar("K4", "Indicadores combinado: Participaciones de cara", 1280, 760, k4, fondo="#F4F3EF")

# ---------- K5 · Todas las sedes ----------
def card_sede(nombre, canon, d, db, oc, oe, ct, cte, sinr, ch):
    cuerpo = (f'<div style="display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;">{num(fmt(canon), 34)}<span style="font-size: 15px; color: #6B6A65;">/mes</span>'
              f'<span style="padding: 3px 9px; border-radius: 999px; background: {"#E6F2EA" if db else "#FBE7E7"}; font-size: 12.5px; font-weight: 700; color: {"#006300" if db else CRIT}; white-space: nowrap;">{d}</span></div>'
              f'{chispa(ch, 340, 46)}'
              f'<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; padding-top: 6px; border-top: 1px solid #F0EEE8;">'
              f'<span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; color: #6B6A65;">Ocupación</span><b style="font-size: 20px; display: inline-flex; align-items: center; gap: 5px;">{oc}{icono_estado(oe) if oe != "ok" else ""}</b></span>'
              f'<span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; color: #6B6A65;">Canon ÷ tarifa</span><b style="font-size: 20px; display: inline-flex; align-items: center; gap: 5px;">{ct}{icono_estado(cte) if cte != "ok" else ""}</b></span>'
              f'<span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; color: #6B6A65;">Sin renovar · 90 días</span><b style="font-size: 20px;">{sinr}</b></span></div>')
    return card(nombre, "cuadros", cuerpo, "x", "Abrir").replace("grid-area: x;", "")
k5c = (f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">'
       + card_sede("Todas las sedes", 17359500, "▲ 2,1 %", True, "84 %", "aten", "91 %", "aten", "5", [15.1, 15.55, 15.5, 15.75, 16.2, 16.4, 16.65, 16.9, 16.7, 16.9, 17.0, 17.36])
       + card_sede("Sede CENTRO", 9939500, "▲ 4,7 %", True, "86 %", "aten", "94 %", "aten", "3", CANON)
       + card_sede("Sede PALMAS", 7420000, "▼ 1,2 %", False, "80 %", "aten", "88 %", "aten", "2", [7.0, 7.1, 7.3, 7.4, 7.6, 7.5, 7.6, 7.7, 7.6, 7.55, 7.51, 7.42]) + "</div>")
k5 = pantalla("Resumen", k5c + f'<div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 16px; background: #fff; border: 1px solid #E7E5DF; font-size: 14px;">{icono_estado("aten")}<span><b>PALMAS</b> es la única sede que factura menos que en septiembre y la más lejos de las metas.</span><span style="flex-grow: 1;"></span><b style="font-size: 13px;">Abrir PALMAS</b></div>', sede="Todas las sedes", sede_txt="Todas las sedes")
guardar("K5", "Indicadores combinado: todas las sedes", 1280, 640, k5, fondo="#F4F3EF")

# ---------- K0 · el mapa del combinado ----------
DEST = [("Canon mensual contratado", "Tabla de contratos, ordenada por canon"), ("Ocupación", "Contratos: el plano por disponibilidad"), ("Canon ÷ tarifa", "Tabla de contratos, ordenada por ÷ tarifa"),
        ("Para hacer hoy", "Pendientes"), ("Vence en 90 días", "Tabla de contratos, filtro «Vencen en 90 días»"), ("Montajes de octubre", "Montajes"), ("Disponibles hoy", "Contratos, con los espacios ya elegidos")]
filas0 = "".join(f'<div style="display: grid; grid-template-columns: 1fr 40px 1.3fr; align-items: center; padding: 9px 0; border-top: 1px solid #F0EEE8; font-size: 14px;"><b>{a}</b>{ico("flecha", 18, "#9A978F", 2)}<span>{b}</span></div>' for a, b in DEST)
k0 = f'''<div style="display: flex; flex-direction: column; gap: 18px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Indicadores, combinado</h1><span style="font-size: 15px; color: {GRIS};">El panel rápido es la pestaña «Resumen». Las vistas del primer diseño siguen como pestañas. El plano con la ficha del espacio vive en Contratos y en Plano de la sede.</span></div>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
{tarjeta(f'<b style="font-size: 16px;">Las cuatro pestañas</b>' + "".join(f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 9px 0; border-top: 1px solid #F0EEE8;"><b style="font-size: 14px;">{a}</b><span style="font-size: 13px; color: #52514e;">{b}</span></div>' for a, b in [("Resumen", "El panel rápido: 7 tarjetas, una pantalla"), ("Tabla de contratos", "Del primer diseño: todos los contratos, con filtros y exportar"), ("Quién paga el canon", "Del primer diseño: proveedores por canon y su peso"), ("Participaciones de cara", "Del primer diseño: cómo se reparte cada cara")]))}
{tarjeta(f'<b style="font-size: 16px;">Cada tarjeta lleva a su detalle</b>{filas0}')}
{tarjeta(f'<b style="font-size: 16px;">Lo que se mueve</b>' + "".join(f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 9px 0; border-top: 1px solid #F0EEE8;"><b style="font-size: 14px;">{a}</b><span style="font-size: 13px; color: #52514e;">{b}</span></div>' for a, b in [("Plano de disponibilidad + ficha", "De Indicadores a Contratos y Plano de la sede"), ("Todas las sedes", "El selector de sede de la barra: «Todas las sedes»"), ("Diccionario de métricas", "El «?» de cada tarjeta abre su definición"), ("Mensual | total", "Se va: el panel muestra canon mensual y la tabla, ambos")]))}
</div>
</div>'''
guardar("K0", "Indicadores combinado: el mapa", 1760, 600, k0)
print("combinado ok")
