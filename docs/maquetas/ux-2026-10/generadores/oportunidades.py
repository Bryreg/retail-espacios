import sys
exec(open("tableros.py").read())   # regenera los tableros anteriores con la barra nueva y deja las piezas a mano

# ---------- datos de ejemplo de las oportunidades (orden: valor en juego, de mayor a menor) ----------
OPS = [
 dict(tipo="TEMPORADA", color="#6B3FA0", titulo="Black Friday 2026: 4 espacios sin contrato",
      det="Temporada del 20/11/2026 al 30/11/2026 (11 días). Espacios: PUN-08, PUN-09, GON-12 y NEV-01 puerta 2.",
      valor="$ 2.000.000 /mes en tarifas", sub="total de la temporada: $ 733.333",
      acciones=[("Ofrecer la temporada", "pri")]),
 dict(tipo="DISPONIBLE", color=VERDE, titulo="PUN-08 · Punta de góndola 8",
      det="Disponible desde el 08/10/2026: 18 días sin contrato, $ 360.000 sin facturar a tarifa.",
      valor="$ 600.000 /mes", sub="tarifa · $ 20.000 por día disponible",
      acciones=[("Ofrecer", "pri"), ("Ver en 3D", "sec")]),
 dict(tipo="VENCE EN 4 DÍAS · SIN RENOVACIÓN", color=ROJO, titulo="PUN-07 · Punta de góndola 7 · Galletas Sol",
      det="El contrato vence el 30/10/2026. Oferta de renovación registrada el 20/10/2026; volver a llamar el 27/10/2026.",
      valor="$ 600.000 /mes", sub="canon actual",
      acciones=[("Renovar contrato", "pri"), ("Ofrecer a otro proveedor", "sec")]),
 dict(tipo="NO RENOVÓ", color=AMBAR, titulo="Snacks Andes",
      det="Su contrato de PUN-05 terminó el 31/08/2026 y no tiene contrato posterior en la sede.",
      valor="$ 550.000 /mes", sub="canon que pagaba",
      acciones=[("Ofrecer un espacio", "sec")]),
 dict(tipo="TEMPORADA ANTERIOR", color="#6B3FA0", titulo="Bebidas del Valle",
      det="Contrató Black Friday 2025 (GON-12) y todavía no tiene contrato para Black Friday 2026.",
      valor="$ 500.000 /mes", sub="canon de Black Friday 2025",
      acciones=[("Ofrecer la temporada", "sec")]),
 dict(tipo="CANON BAJO LA TARIFA", color="#2F5DA8", titulo="GON-02 · Góndola 2, cara A · Aseo Total",
      det="Canon $ 380.000 /mes; tarifa $ 450.000 /mes. Vence el 31/01/2027: la renovación es la oportunidad de ajustarlo.",
      valor="$ 70.000 /mes", sub="diferencia con la tarifa",
      acciones=[("Preparar renovación a tarifa", "sec")]),
]
def fila_op(o, compacto=False):
    o = {k: (v.replace("$ ", "$&nbsp;") if isinstance(v, str) else v) for k, v in o.items()}
    acc = "".join(boton(t, "sec", h=34, extra="font-size: 13px;") for t, k in o["acciones"])
    return f'''<div style="display: grid; grid-template-columns: minmax(0, 1fr) {"" if compacto else "150px"}; gap: 12px; padding: 13px 18px; border-top: 1px solid #ECEAE4;">
<div style="display: flex; flex-direction: column; gap: 5px; min-width: 0;">
<span style="font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {o["color"]};">{o["tipo"]}</span>
<b style="font-size: 15px; line-height: 1.35;">{o["titulo"]}</b>
<span style="font-size: 13px; color: {GRIS}; line-height: 1.45;">{o["det"]}</span>
{f'<span style="font-size: 14px; font-weight: 700;">{o["valor"]} <span style="font-weight: 400; font-size: 12px; color: {GRIS};">{o["sub"]}</span></span>' if compacto else ""}
<div style="display: flex; gap: 8px; flex-wrap: wrap; padding-top: 2px;">{acc}</div>
</div>
{"" if compacto else f'<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right;"><b style="font-size: 15px; white-space: nowrap;">{o["valor"]}</b><span style="font-size: 12px; color: {GRIS}; line-height: 1.35;">{o["sub"]}</span></div>'}
</div>'''
FILTROS = [("Todas", 11), ("Disponibles", 3), ("Vencen en 90 días", 3), ("Temporada", 2), ("Proveedores", 2), ("Bajo la tarifa", 1)]
def filtros(fs=12):
    return '<div style="display: flex; flex-wrap: wrap; gap: 6px;">' + "".join(
        f'<span style="padding: 5px 10px; border-radius: 999px; font-size: {fs}px; font-weight: 600; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + ";" if i == 0 else "border: 1px solid #DEDBD3;"}">{t} · {n}</span>' for i, (t, n) in enumerate(FILTROS)) + "</div>"

# ---------- O1 · la bandeja en Oportunidades ----------
fondo = encabezado("Contratos", abierta="opor") + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla") + boton("Nuevo contrato", "pri", icono="mas2"), "Período: 01/11/2026 – 30/11/2026") + f'''
<main style="padding: 16px 24px; flex-grow: 1; display: flex; min-height: 0;">{tarjeta(f'<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 32px; border-radius: 12px; background: #F6F5F1;">{plano(marca=("PUN-08",))}</div>', "flex-grow: 1;")}</main>'''
cajon = f'''<aside aria-label="Oportunidades" style="position: absolute; top: 60px; right: 0; bottom: 44px; width: 580px; display: flex; flex-direction: column; background: {BLANCO}; border-left: 1px solid #DEDBD3; box-shadow: -12px 0 32px rgba(20,20,19,.16);">
<div style="display: flex; flex-direction: column; gap: 10px; padding: 16px 18px 12px;">
<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 18px; flex-grow: 1;">Oportunidades · Sede CENTRO</b><button type="button" aria-label="Cerrar" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
<div style="display: flex; align-items: baseline; gap: 8px;"><span style="font-size: 13px; color: {GRIS};">Ordenadas por valor en juego, de mayor a menor.</span><span style="flex-grow: 1;"></span><span style="font-size: 13px; color: {GRIS};">Sin facturar este mes por espacios disponibles:</span><b style="font-size: 14px; color: {ROJO}; white-space: nowrap;">$ 1.093.332</b></div>
{filtros()}
</div>
<div style="overflow: hidden; flex-grow: 1;">{"".join(fila_op(o) for o in OPS)}</div>
</aside>'''
op1 = fondo + velo() + cajon + nota("Oportunidades es la pestaña al lado de Pendientes: la misma bandeja, encima de cualquier módulo. Pendientes dice qué está mal; Oportunidades, dónde hay plata para ganar.")
guardar("Oportunidades", "Bandeja: Oportunidades", 1280, 860, op1)

# ---------- O2 · Ofrecer (registrar la oferta) ----------
campo2 = lambda l, v, ayuda="": f'<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-size: 13px; font-weight: 600;">{l}</span>{v}{f"<span style=\'font-size: 12px; color: {GRIS};\'>{ayuda}</span>" if ayuda else ""}</div>'
inp2 = lambda v, mono=False: f'<span style="display: flex; align-items: center; height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid #C9C6BE; font-size: 15px; {"font-family: ui-monospace, Menlo, monospace;" if mono else ""}">{v}</span>'
dialogo = f'''<div role="dialog" aria-label="Ofrecer PUN-08" style="position: absolute; left: 50%; top: 84px; width: 680px; margin-left: -340px; display: flex; flex-direction: column; border-radius: 18px; background: {BLANCO}; box-shadow: 0 24px 60px rgba(20,20,19,.3); overflow: hidden;">
<div style="display: flex; align-items: flex-start; gap: 10px; padding: 18px 22px 12px;"><span style="display: flex; flex-direction: column; gap: 3px; flex-grow: 1;"><span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {VERDE};">OFRECER</span><b style="font-size: 20px;">PUN-08 · Punta de góndola 8</b><span style="font-size: 13px; color: {GRIS};">Disponible desde el 08/10/2026 · tarifa $ 600.000 /mes</span></span><button type="button" aria-label="Cerrar" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; padding: 6px 22px 16px;">
{campo2("Proveedor", inp2("Bebidas del Valle"), "Contrató Black Friday 2025 en GON-12")}
{campo2("Canon ofrecido", inp2("$ 600.000 /mes", True), "Igual a la tarifa de referencia")}
{campo2("Vigencia propuesta", inp2("01/11/2026 – 31/01/2027"), "3 meses · valor total del contrato: $ 1.800.000")}
{campo2("Oferta válida hasta", inp2("05/11/2026"))}
{campo2("Volver a llamar el", inp2("30/10/2026"), "Ese día aparece en Pendientes de quien registra la oferta")}
{campo2("Nota interna", inp2("Pidió ver la propuesta en 3D"), "No se envía al proveedor")}
</div>
<div style="display: flex; align-items: center; gap: 8px; padding: 14px 22px; border-top: 1px solid #ECEAE4; background: #FAF9F6;">{boton("Ver en 3D con el proveedor", icono="cubo")}{boton("Reservar provisionalmente")}<span style="flex-grow: 1;"></span>{boton("Registrar oferta", "pri")}</div>
<div style="padding: 10px 22px 14px; font-size: 12px; color: {GRIS}; line-height: 1.5; background: #FAF9F6;">Estados de una oferta: <b>Abierta</b> · <b>Aceptada</b> (abre Nuevo contrato con estos datos) · <b>Rechazada</b> (con motivo) · <b>Vencida</b> (pasó «válida hasta» sin respuesta). Ofertas anteriores de este espacio: ninguna.</div>
</div>'''
op2 = encabezado("Contratos", abierta="opor") + barra_modulo("Contratos", "", "") + f'<main style="padding: 16px 24px; flex-grow: 1; display: flex; min-height: 0;">{tarjeta(plano(sel="PUN-08"), "flex-grow: 1; padding: 32px;")}</main>' + velo() + dialogo + nota("«Ofrecer» registra la oferta: a quién, qué espacio, por cuánto, hasta cuándo y cuándo volver a llamar. Así se sabe qué se ofreció, a quién y qué falta cerrar.")
guardar("Ofrecer", "Ofrecer: registrar la oferta", 1280, 860, op2)

# ---------- O3 · Indicadores comerciales ----------
def kpi2(t, v, s, def_, c=TINTA):
    return f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 14px; background: {BLANCO}; border: 1px solid {BORDE};"><span style="font-size: 13px; color: {GRIS};">{t}</span><b style="font-size: 26px; color: {c};">{v}</b><span style="font-size: 13px; color: #3D3D3A;">{s}</span><span style="font-size: 12px; color: {GRIS}; line-height: 1.45; padding-top: 6px; border-top: 1px solid #ECEAE4; margin-top: 4px;">{def_}</span></div>'
ind2 = encabezado("Indicadores") + barra_modulo("Indicadores", IMPORTES, "Sede CENTRO · octubre 2026") + '<div style="padding: 12px 24px 0;">' + TABS_IND + '</div>' + f'''
<main style="display: flex; flex-direction: column; gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
<span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">HOY</span>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
{kpi2("Canon mensual contratado", "$ 2.552.814 /mes", "+ $ 180.000 /mes respecto de septiembre 2026", "Suma del canon mensual de los contratos vigentes hoy.")}
{kpi2("Ocupación", "83 %", "15 de 18 espacios contratables", "Espacios con contrato vigente hoy ÷ espacios contratables.")}
{kpi2("Sin facturar por espacios disponibles", "$ 1.093.332", "en octubre 2026, a tarifa", "Tarifa diaria × días sin contrato en el mes, sumado por espacio.", ROJO)}
{kpi2("Contratos que vencen en 90 días", "3 contratos", "$ 1.650.000 /mes · 1 con oferta registrada", "Vigentes con fin ≤ 90 días y sin contrato siguiente.")}
</div>
<span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {GRIS}; padding-top: 4px;">ÚLTIMOS 12 MESES · NOVIEMBRE 2025 – OCTUBRE 2026</span>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
{kpi2("Tasa de renovación", "72 %", "18 de 25 contratos vencidos", "Contratos vencidos con un contrato siguiente del mismo proveedor en el mismo espacio, que empieza ≤ 30 días después del fin ÷ contratos vencidos.")}
{kpi2("Días disponibles entre contratos", "23 días", "promedio por espacio", "Días entre el fin de un contrato y el inicio del siguiente en el mismo espacio, promediados.")}
{kpi2("Canon contratado ÷ tarifa", "94 %", "$ 2.552.814 de $ 2.715.000 /mes", "Canon mensual vigente ÷ tarifa mensual de esos mismos espacios.")}
{kpi2("Ofertas cerradas", "42 %", "5 aceptadas de 12 resueltas", "Ofertas aceptadas ÷ ofertas aceptadas, rechazadas o vencidas en el período.")}
</div>
</main>''' + nota("Indicadores comerciales: miden si se está vendiendo mejor. Cada tarjeta dice debajo exactamente cómo se calcula.")
guardar("IndicadoresVenta", "Indicadores comerciales", 1280, 860, ind2)

# ---------- O4 · teléfono ----------
tel_op = f'''<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0;">
<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 16px; background: {BLANCO}; border-bottom: 1px solid {BORDE}; flex-shrink: 0;">
<button type="button" aria-label="Volver" style="width: 40px; height: 40px; border-radius: 10px; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; transform: rotate(180deg);">{ico("flecha")}</button>
<b style="font-size: 17px; flex-grow: 1;">Bandeja</b></header>
<div role="tablist" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 12px 16px 0; padding: 4px; border-radius: 12px; background: #F4F2EC; font-size: 14px;"><span style="text-align: center; padding: 9px 4px; font-weight: 600;">Pendientes · 14</span><span style="text-align: center; padding: 9px 4px; border-radius: 9px; background: {TINTA}; color: {BLANCO}; font-weight: 700;">Oportunidades · 11</span></div>
<div style="padding: 12px 16px 6px; display: flex; flex-direction: column; gap: 8px;"><span style="font-size: 13px; color: {GRIS};">Sin facturar en octubre por espacios disponibles: <b style="color: {ROJO}; white-space: nowrap;">$&nbsp;1.093.332</b></span><div style="display: flex; gap: 6px; overflow: hidden;">{"".join(f'<span style="padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; {"background: " + TINTA + "; color: " + BLANCO + ";" if i == 0 else "border: 1px solid #DEDBD3; background: " + BLANCO + ";"}">{t} · {n}</span>' for i, (t, n) in enumerate(FILTROS[:4]))}</div></div>
<div style="background: {BLANCO}; border-top: 1px solid #ECEAE4; overflow: hidden; flex-grow: 1;">{"".join(fila_op(o, compacto=True) for o in OPS[:3])}</div>
</div>'''
guardar("OportunidadesTel", "Oportunidades en el teléfono", 390, 844, tel_op)

# ---------- O5 · reglas exactas ----------
REG = [
 ("Disponible", "Espacio contratable sin contrato ni reserva provisional vigente hoy.", "Tarifa mensual del espacio. Debajo: días sin contrato y lo no facturado a tarifa.", "Ofrecer · Ver en 3D", "Se registra un contrato o una reserva provisional.", "Existe: contratos, reservas, tarifas"),
 ("Vence en 90 días, sin renovación", "Contrato vigente con fin ≤ 90 días y sin contrato siguiente en el mismo espacio. Marca 90 / 60 / 30 días.", "Canon mensual actual.", "Renovar contrato · Ofrecer a otro proveedor", "Hay contrato siguiente, o vence.", "Existe: contratos"),
 ("Temporada sin vender", "Temporada que empieza en ≤ 60 días con espacios contratables sin contrato en sus fechas.", "Suma de las tarifas mensuales de esos espacios; debajo, el total de la temporada.", "Ofrecer la temporada", "Todos los espacios tienen contrato, o empieza la temporada.", "Existe: temporadas, contratos, tarifas"),
 ("Temporada anterior", "Proveedor con contrato en la misma temporada del año anterior y sin contrato en la de este año.", "Canon mensual que pagó esa temporada.", "Ofrecer la temporada", "Contrata la temporada, rechaza la oferta, o empieza la temporada.", "Existe: temporadas, contratos"),
 ("No renovó", "Proveedor cuyo último contrato en la sede terminó hace ≤ 180 días, sin contrato posterior.", "Canon mensual que pagaba.", "Ofrecer un espacio", "Firma otro contrato, rechaza la oferta, o pasan 180 días.", "Existe: contratos"),
 ("Canon bajo la tarifa", "Contrato vigente con canon mensual < tarifa vigente y fin ≤ 120 días.", "Diferencia mensual entre tarifa y canon.", "Preparar renovación a tarifa", "Se renueva, o vence.", "Existe: hoy es «Bajo tarifa» en Supervisar"),
]
fila_r = lambda c, hd=False: f'<div style="display: grid; grid-template-columns: 170px 1.5fr 1.2fr 1fr 1.1fr 1fr; gap: 14px; padding: {"10px" if hd else "12px"} 18px; {"background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: " + GRIS + ";" if hd else "border-top: 1px solid #ECEAE4; font-size: 13.5px; line-height: 1.45;"}">' + "".join(f"<b>{x}</b>" if (k == 0 and not hd) else f'<span style="{"color: " + GRIS + ";" if k == 5 and not hd else ""}">{x}</span>' for k, x in enumerate(c)) + "</div>"
reglas = f'''<div style="display: flex; flex-direction: column; gap: 18px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 26px;">Oportunidades: cuándo entra cada una y cuándo sale</h1><span style="font-size: 15px; color: {GRIS};">Cada tipo tiene una regla exacta. Nada entra a la lista por criterio de alguien; todo sale de los contratos, reservas, tarifas y temporadas que ya existen.</span></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">{fila_r(["TIPO", "ENTRA A LA LISTA CUANDO", "VALOR EN JUEGO", "ACCIONES", "SALE DE LA LISTA CUANDO", "DE DÓNDE SALE EL DATO"], True)}{"".join(fila_r(r) for r in REG)}</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;">
{tarjeta(f'<b style="font-size: 15px;">Orden</b><span style="font-size: 14px; line-height: 1.5; color: #3D3D3A;">Por valor en juego, de mayor a menor. A igual valor, primero la de fecha más cercana (vencimiento, inicio de temporada).</span>')}
{tarjeta(f'<b style="font-size: 15px;">Lo único nuevo: las ofertas</b><span style="font-size: 14px; line-height: 1.5; color: #3D3D3A;">Una tabla nueva, sin tocar las existentes: proveedor, espacio o temporada, canon ofrecido, vigencia propuesta, válida hasta, volver a llamar el, nota interna, estado (abierta, aceptada, rechazada, vencida) y quién la registró.</span>')}
{tarjeta(f'<b style="font-size: 15px;">Quién la ve</b><span style="font-size: 14px; line-height: 1.5; color: #3D3D3A;">Sólo el administrador: tiene importes. El trabajador no ve la pestaña. En el modo presentación del 3D la bandeja no se abre, para no mostrar tarifas ni precios delante del proveedor.</span>')}
</div>
</div>'''
guardar("ReglasOportunidades", "Reglas de las oportunidades", 1760, 860, reglas)
print("oportunidades ok")
