import sys
from datetime import date
exec(open("disponibilidad.py").read())

TOTAL = 12
def campo(l, v, ayuda=""):
    a = f'<span style="font-size: 12px; color: {GRIS};">{ayuda}</span>' if ayuda else ""
    return f'<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-size: 13px; font-weight: 600;">{l}</span>{v}{a}</div>'
inp2 = lambda v, mono=False: f'<span style="display: flex; align-items: center; height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid #C9C6BE; font-size: 15px; {"font-family: ui-monospace, Menlo, monospace;" if mono else ""}">{v}</span>'
def nota_paso(n, cuando, quien, txt):
    return (f'<div style="flex-shrink: 0; display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 24px; background: #2B2B29; color: #F4F2EC; font-size: 13px;">'
            f'<span style="padding: 4px 10px; border-radius: 999px; background: {AMARILLO}; color: {TINTA}; font-weight: 700; white-space: nowrap;">Paso {n} de {TOTAL}</span>'
            f'<span style="white-space: nowrap; color: #C9C6BE;">{cuando} · {quien}</span><span>{txt}</span></div>')

# plano de un supermercado recién armado: 16 muebles, 22 espacios contratables
CODS = [["GON-01", "GON-02", "GON-03", "GON-04"], ["PUN-01", "PUN-02", "PUN-03", "PUN-04", "PUN-05", "PUN-06", "PUN-07", "PUN-08", "PUN-09"], ["GON-05", "GON-06", "NEV-01"]]
def plano_nuevo(estados=None, sel=None, etiquetas=None, fs=12, h1=56, h2=50, gris=False, nuevo=None):
    estados = estados or {}
    etiquetas = etiquetas or {}
    def c(cod, h):
        if gris:
            bg, bc, bs = "#FFFFFF", "#8A867C", "solid"
        else:
            bg, bc, bs = EST[estados.get(cod, "d")]
        ring = f"box-shadow: 0 0 0 3px {TINTA};" if cod == sel else ""
        if cod == nuevo:
            ring = f"box-shadow: 0 0 0 3px {AMARILLO}; outline: 2px dashed {TINTA}; outline-offset: 4px;"
        et = etiquetas.get(cod, "")
        et_html = f'<span style="font-size: {fs - 2}px; font-weight: 600; color: #3D3D3A; text-align: center;">{et}</span>' if et else ""
        return (f'<span style="height: {h}px; border-radius: 8px; background: {bg}; border: 2px {bs} {bc}; {ring} display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; line-height: 1.15;">'
                f'<b style="font-family: ui-monospace, Menlo, monospace; font-size: {fs}px;">{cod}</b>{et_html}</span>')
    f1 = '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px;">' + "".join(c(x, h1) for x in CODS[0]) + "</div>"
    f2 = '<div style="display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 8px;">' + "".join(c(x, h2) for x in CODS[1]) + "</div>"
    f3 = '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px;">' + "".join(c(x, h1) for x in CODS[2]) + "<span></span></div>"
    return f1 + f2 + f3

def pasos_contrato(act):
    ps = ["Espacio", "Proveedor y vigencia", "Canon", "Confirmación"]
    h = '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid #ECEAE4;">'
    for i, p in enumerate(ps, 1):
        hecho, actual = i < act, i == act
        col = VERDE if hecho else (TINTA if actual else GRIS)
        h += (f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; {"background: #FFFBEB; border-bottom: 3px solid " + AMARILLO + ";" if actual else ""}">'
              f'<span style="font-size: 12px; font-weight: 700; color: {col};">{i} · {p}{" ✓" if hecho else ""}</span></div>')
    return h + "</div>"
fila_res = lambda k, v: f'<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid #F0EEE8; font-size: 14px; line-height: 1.45;"><span style="color: {GRIS};">{k}</span><span>{v}</span></div>'
def check_item(t, d, estado):
    marca = {"ok": (VERDE, ico("check", 14, BLANCO, 3)), "act": (AMARILLO, ""), "no": ("#DEDBD3", "")}[estado]
    return (f'<div style="display: flex; gap: 12px; align-items: flex-start; padding: 10px 0;"><span style="width: 24px; height: 24px; border-radius: 999px; background: {marca[0]}; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;">{marca[1]}</span>'
            f'<span style="display: flex; flex-direction: column; gap: 2px;"><b style="font-size: 14px;">{t}</b><span style="font-size: 13px; color: {GRIS}; line-height: 1.45;">{d}</span></span></div>')
def mini_tl(tramos, rango=None, h=26, meses=("oct", "nov", "dic", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep")):
    capas = ""
    if rango:
        a, b = rango
        capas += f'<span style="position: absolute; top: -4px; bottom: -4px; left: {pos(a):.2f}%; width: {pos(b) - pos(a) + 100 / TOT:.2f}%; background: rgba(242,183,5,.18); border-left: 2px solid {AMARILLO}; border-right: 2px solid {AMARILLO};"></span>'
    for a, b, txt, cl in tramos:
        bg, bc, bs = COLB[cl]
        capas += (f'<span style="position: absolute; top: 0; bottom: 0; left: {pos(a):.2f}%; width: {pos(b) - pos(a) + 100 / TOT:.2f}%; background: {bg}; border: 1.5px {bs} {bc}; border-radius: 6px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; padding: 0 6px; font-size: 11px; font-weight: 600; white-space: nowrap;">{txt}</span>')
    capas += f'<span style="position: absolute; top: -6px; bottom: -6px; left: {pos(HOY):.2f}%; width: 2px; background: {TINTA};"></span>'
    cab = '<div style="display: flex; font-size: 11px; font-weight: 600; color: ' + GRIS + ';">' + "".join(f'<span style="flex: 1;">{m}</span>' for m in meses) + "</div>"
    return cab + f'<div style="position: relative; height: {h}px; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(100%/12 - 1px), #ECEAE4 calc(100%/12 - 1px), #ECEAE4 calc(100%/12));">{capas}</div>'

W, H = 1280, 820
def pantalla(nombre, titulo, cuerpo):
    guardar(nombre, titulo, W, H, cuerpo)

# ---------- R1 · Configuración inicial ----------
r1 = encabezado("—", pendientes=0) + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 28px; padding: 32px 28px; flex-grow: 1;">
<section style="display: flex; flex-direction: column; gap: 16px; min-width: 0;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Configuración inicial · Supermercado La Esquina</h1><p style="margin: 0; font-size: 15px; color: {GRIS}; line-height: 1.5;">Cinco pasos para habilitar la sede y registrar el primer contrato. Se pueden hacer en cualquier orden; el avance queda guardado.</p></div>
<div style="display: flex; align-items: center; gap: 12px;"><div style="flex-grow: 1; height: 8px; border-radius: 999px; background: #DEDBD3; overflow: hidden;"><div style="width: 20%; height: 8px; background: {VERDE};"></div></div><b style="font-size: 14px;">1 de 5</b></div>
{tarjeta(check_item("Crear la sede", "CENTRO · creada el 26/10/2026", "ok") + check_item("Dibujar el plano de la sede", "Contorno con medidas y los muebles en su lugar. Cada mueble y cada cara quedan como espacios contratables.", "act") + '<div style="padding: 0 0 8px 36px;">' + boton("Dibujar el plano", "pri") + "</div>" + check_item("Definir las tarifas", "Canon mensual de referencia por tipo de mueble.", "no") + check_item("Definir destinatarios de avisos", "Correo del responsable comercial y del responsable de montaje de CENTRO.", "no") + check_item("Registrar el primer contrato", "O cargar los contratos existentes desde una planilla.", "no"), "gap: 0; padding: 8px 18px;")}
</section>
{tarjeta(f'<b style="font-size: 16px;">Cómo sigue</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.55;">Con el plano dibujado, Contratos ya muestra la disponibilidad de cada espacio. Al registrar un contrato, el responsable de montaje recibe el aviso de montaje; al verificar el montaje, el espacio queda listo para contratarse en las fechas siguientes.</span>', "align-self: start;")}
</main>''' + nota_paso(1, "Lunes 26/10/2026", "Ana, administradora", "Entra por primera vez: RECABRA le muestra la configuración inicial, con un solo paso marcado como siguiente.")
pantalla("R01", "Configuración inicial", r1)

# ---------- R2 · Contorno ----------
inp_m = lambda v: f'<span style="display: flex; align-items: center; height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #C9C6BE; font-family: ui-monospace, Menlo, monospace; font-size: 15px;">{v}</span>'
r2 = encabezado("Plano de la sede", pendientes=0) + barra_modulo("Plano de la sede", "", "Sede CENTRO · paso 1: contorno") + f'''
<main style="display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 16px; padding: 16px 24px; flex-grow: 1; min-height: 0;">
{tarjeta(f"""<b style="font-size: 17px;">Contorno de la sede</b><span style="font-size: 13px; color: {GRIS}; line-height: 1.5;">Medidas interiores del salón de ventas, en metros. Se pueden corregir después.</span>
{campo("Ancho (m)", inp_m("40,00"))}{campo("Largo (m)", inp_m("25,00"))}
{campo("Entrada", '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">' + opcion("Norte", False) + opcion("Sur", True) + opcion("Este", False) + opcion("Oeste", False) + "</div>")}
{campo("Distancia de la entrada a la esquina izquierda (m)", inp_m("5,00"))}
<div style="margin-top: auto;">{boton("Guardar contorno y seguir con los muebles", "pri", "width: 100%;")}</div>""")}
{tarjeta(f'<b style="font-size: 15px;">Vista previa · 40,00 m × 25,00 m</b><div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #F6F5F1;"><div style="position: relative; width: 640px; height: 400px; border: 3px solid {TINTA}; background: {BLANCO};"><span style="position: absolute; bottom: -3px; left: 80px; width: 64px; height: 3px; background: {AMARILLO};"></span><span style="position: absolute; bottom: -26px; left: 70px; font-size: 12px; font-weight: 700;">Entrada</span><span style="position: absolute; top: -24px; left: 50%; transform: translateX(-50%); font-size: 12px; color: {GRIS};">40,00 m</span><span style="position: absolute; right: -54px; top: 50%; font-size: 12px; color: {GRIS};">25,00 m</span></div></div>', "flex-grow: 1;")}
</main>''' + nota_paso(2, "Lunes 26/10/2026", "Ana", "Arma el supermercado: primero el contorno con medidas reales y la entrada. Sin dibujar a mano alzada.")
pantalla("R02", "Plano: contorno", r2)

# ---------- R3 · Muebles ----------
cat3 = "".join(f'<button type="button" style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px; border-radius: 10px; border: {"2px solid " + TINTA if t == "Punta de góndola" else "1px solid #DEDBD3"}; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 600; text-align: left;"><span style="width: {w}px; height: 12px; border-radius: 3px; background: #DCD8CE;"></span>{t}</button>' for t, w in [("Góndola", 26), ("Punta de góndola", 14), ("Nevera", 22), ("Exhibidor", 12)])
r3 = encabezado("Plano de la sede", pendientes=0) + barra_modulo("Plano de la sede", tog + f'<span style="display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: {VERDE}; padding: 0 6px;"><span style="width: 8px; height: 8px; border-radius: 999px; background: {VERDE};"></span>Guardado</span>', "Sede CENTRO · paso 2: muebles") + f'''
<main style="display: grid; grid-template-columns: 200px minmax(0, 1fr) 340px; gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<b style="font-size: 15px;">Catálogo</b><span style="font-size: 12px; color: {GRIS};">Arrastrá un mueble al plano. El código se asigna solo.</span>{cat3}')}
{tarjeta(f'<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 22px; padding: 26px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_nuevo(gris=True, nuevo="PUN-08", fs=11)}</div><div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; background: #E6F2EA; font-size: 14px;">{ico("check", 18, VERDE, 2.5)}<span><b>Validación del plano: sin inconsistencias.</b> 16 muebles · 22 espacios contratables (6 góndolas × 2 caras, 9 puntas de góndola, 1 nevera).</span></div>')}
<aside aria-label="Ficha de PUN-08" style="display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};">
<div style="display: flex; flex-direction: column; gap: 4px;"><b style="font-size: 18px;">PUN-08 · Punta de góndola 8</b><span style="font-size: 13px; color: {GRIS};">Recién colocada en el plano</span></div>
{tabs("Mueble")}
{campo("Código", inp_m("PUN-08"))}
{campo("Medidas (m)", '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' + inp_m("1,20 ancho") + inp_m("0,60 prof.") + "</div>")}
{campo("Cómo se contrata", '<div style="display: flex; gap: 8px;">' + opcion("Entera", True) + opcion("Por partes", False) + opcion("Participación", False) + "</div>")}
<div style="margin-top: auto;">{boton("Volver a la configuración inicial", "sec", "width: 100%;")}</div>
</aside>
</main>''' + nota_paso(3, "Lunes 26/10/2026", "Ana", "Arrastra los muebles del catálogo. Cada uno recibe su código y queda contratable. La validación confirma que no hay muebles superpuestos ni códigos repetidos.")
pantalla("R03", "Plano: muebles", r3)

# ---------- R4 · Contratos: fechas → PUN-08 ----------
lista4 = (seccion_l("Disponibles todas las fechas", "22", VERDE)
          + item_lista("PUN-08", "Punta de góndola 8", "Tarifa $ 600.000 /mes", True)
          + item_lista("PUN-07", "Punta de góndola 7", "Tarifa $ 600.000 /mes")
          + item_lista("PUN-09", "Punta de góndola 9", "Tarifa $ 600.000 /mes")
          + item_lista("GON-01", "Góndola 1, cara A", "Tarifa $ 450.000 /mes")
          + '<a href="#" style="display: block; padding: 8px 0 0; font-size: 13px; font-weight: 600;">Ver los 18 restantes</a>')
r4 = encabezado("Contratos", pendientes=0) + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla"), "") + f'''
<div style="padding: 12px 24px 0;">{pregunta()}</div>
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px;">Del {f(DESDE)} al {f(HASTA)}</b><span style="flex-grow: 1;"></span>{lente(["Plano", "Línea de tiempo"], "Plano")}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px; padding: 22px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_nuevo(sel="PUN-08", etiquetas={c: "disponible" for fila in CODS for c in fila}, fs=11)}</div><span style="font-size: 13px; color: {GRIS};">Sede recién armada: los 22 espacios están disponibles todas las fechas.</span>')}
{tarjeta(f'<b style="font-size: 16px;">Espacios para esas fechas</b><div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">{lista4}</div><div style="padding-top: 10px; border-top: 1px solid #ECEAE4;">{boton("Contratar 1 espacio · " + f(DESDE) + " – " + f(HASTA), "pri", "width: 100%;")}</div>')}
</main>''' + nota_paso(4, "Lunes 26/10/2026", "Ana", "Galletas Sol pide una punta de góndola de noviembre a enero. Ana escribe las fechas, ve qué está disponible y marca PUN-08.")
pantalla("R04", "Contratar: fechas y espacio", r4)

# ---------- R5 · Proveedor, vigencia y canon ----------
r5 = encabezado("Contratos", pendientes=0) + barra_modulo("Contratos", "", "Nuevo contrato · PUN-08") + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
<section style="display: flex; flex-direction: column; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
{pasos_contrato(3)}
<div style="display: flex; flex-direction: column; gap: 16px; padding: 20px 22px; flex-grow: 1;">
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
{campo("Proveedor", inp2("Galletas Sol"), "Nuevo · correo de avisos: ventas@galletassol.co")}
{campo("Marca", inp2("Sol"), "Opcional")}
</div>
{campo("Vigencia", inp2(f"{f(DESDE)} – {f(HASTA)}"), "92 días · 3 meses")}
<div style="height: 1px; background: #ECEAE4;"></div>
<b style="font-size: 17px;">Canon</b>
<div style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 13px; color: {GRIS};">El valor que escribís es</span>{lente(["Canon mensual", "Valor total del contrato"], "Canon mensual")}</div>
{campo("Canon mensual", inp2("$ 600.000 /mes", True))}
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
<div style="padding: 12px 14px; border-radius: 12px; background: #F4F2EC;"><span style="font-size: 12px; color: {GRIS};">Tarifa de referencia</span><br><b>$ 600.000 /mes</b></div>
<div style="padding: 12px 14px; border-radius: 12px; background: #E6F2EA;"><span style="font-size: 12px; color: {GRIS};">Canon contra tarifa</span><br><b style="color: {VERDE};">Igual a la tarifa</b></div>
<div style="padding: 12px 14px; border-radius: 12px; background: #F4F2EC;"><span style="font-size: 12px; color: {GRIS};">Valor total del contrato</span><br><b>$ 1.800.000</b></div>
</div>
<a href="#" style="font-size: 13px; font-weight: 600;">Otra forma de cobro: % de las ventas</a>
</div>
<div style="display: flex; gap: 8px; padding: 14px 22px; border-top: 1px solid #ECEAE4;">{boton("Atrás")}<span style="flex-grow: 1;"></span>{boton("Siguiente: confirmación", "pri")}</div>
</section>
{tarjeta(f'<b style="font-size: 15px;">PUN-08 · Punta de góndola 8</b><span style="font-size: 13px; color: {GRIS};">Disponible del {f(DESDE)} al {f(HASTA)}</span><div style="display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: #F6F5F1;">{mini_tl([], rango=(DESDE, HASTA))}<span style="font-size: 12px; color: {GRIS};">Banda amarilla: la vigencia de este contrato.</span></div>{boton("Ver en 3D con el proveedor", icono="cubo")}')}
</main>''' + nota_paso(5, "Lunes 26/10/2026", "Ana", "Proveedor y vigencia, y el canon: se escribe mensual (o total) y el sistema muestra la tarifa, la comparación y el valor total.")
pantalla("R05", "Contratar: proveedor, vigencia y canon", r5)

# ---------- R6 · Confirmación ----------
r6 = encabezado("Contratos", pendientes=0) + barra_modulo("Contratos", "", "Nuevo contrato · PUN-08") + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
<section style="display: flex; flex-direction: column; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
{pasos_contrato(4)}
<div style="display: flex; flex-direction: column; gap: 4px; padding: 18px 22px; flex-grow: 1;">
<b style="font-size: 18px; line-height: 1.45; padding-bottom: 8px;">Galletas Sol contrata PUN-08 · Punta de góndola 8 del {f(DESDE)} al {f(HASTA)}, por un canon de $ 600.000 /mes.</b>
{fila_res("Vigencia", "92 días · 3 meses")}
{fila_res("Canon", "$ 600.000 /mes · valor total del contrato $ 1.800.000")}
{fila_res("Marca", "Sol")}
{fila_res("Planometría", f'<span style="display: inline-flex; align-items: center; gap: 8px;">{ico("planilla")}<b>sol-pun08.pdf</b> adjunta · <a href="#" style="font-weight: 600;">Cambiar</a></span>')}
<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding: 14px; border-radius: 12px; background: #F4F2EC; font-size: 14px; line-height: 1.5;"><b>Al guardar se envían dos avisos</b><span>• Al proveedor (ventas@galletassol.co): confirmación del contrato, sin tarifas de referencia.</span><span>• Al responsable de montaje de CENTRO (Luis Pérez): aviso de montaje con la planometría, para el {f(DESDE)}.</span></div>
</div>
<div style="display: flex; gap: 8px; padding: 14px 22px; border-top: 1px solid #ECEAE4;">{boton("Atrás")}{boton("Reservar provisionalmente")}<span style="flex-grow: 1;"></span>{boton("Guardar contrato", "pri")}</div>
</section>
{tarjeta(f'<b style="font-size: 15px;">Sin planometría, el aviso de montaje espera</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.5;">Si no se adjunta acá, el contrato se guarda igual y aparece en Pendientes como «Falta planometría». El aviso al responsable de montaje sale cuando se adjunta.</span>', "align-self: start;")}
</main>''' + nota_paso(6, "Lunes 26/10/2026", "Ana", "La confirmación se lee como una frase, con la planometría adjunta y a quién se avisa. Un botón: Guardar contrato.")
pantalla("R06", "Contratar: confirmación", r6)

# ---------- R7 · Contrato guardado ----------
r7 = encabezado("Contratos", pendientes=0) + barra_modulo("Contratos", "", "") + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f"""<div style="display: flex; align-items: center; gap: 12px;"><span style="width: 44px; height: 44px; border-radius: 999px; background: {VERDE}; display: inline-flex; align-items: center; justify-content: center;">{ico("check", 24, BLANCO, 3)}</span><span style="display: flex; flex-direction: column;"><b style="font-size: 20px;">Contrato guardado</b><span style="font-size: 14px; color: {GRIS};">Galletas Sol · PUN-08 · {f(DESDE)} – {f(HASTA)} · $ 600.000 /mes</span></span></div>
<b style="font-size: 15px; padding-top: 6px;">Qué pasa ahora</b>
{check_item("Confirmación enviada al proveedor", "ventas@galletassol.co · 26/10/2026 10:42", "ok")}
{check_item("Aviso de montaje enviado a Luis Pérez", "Responsable de montaje de CENTRO · inicio del montaje: " + f(DESDE), "ok")}
{check_item("Registro del montaje", "Luis Pérez saca la foto al terminar. Si no lo registra el " + f(DESDE) + ", aparece en Pendientes.", "act")}
{check_item("Verificación del montaje", "Se compara la foto con la planometría desde Pendientes.", "no")}
<div style="display: flex; gap: 8px; margin-top: auto;">{boton("Contratar otro espacio", "pri")}{boton("Ver la ficha de PUN-08")}</div>""")}
{tarjeta(f'<b style="font-size: 15px;">PUN-08 · línea de tiempo</b><div style="display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: #F6F5F1;">{mini_tl([(DESDE, HASTA, "Galletas Sol", "c")])}</div>{fila_res("Contratado", "del " + f(DESDE) + " al " + f(HASTA) + " · Galletas Sol")}{fila_res("Disponible", "<b>desde el 01/02/2027</b>, sin fin")}<span style="font-size: 13px; color: {GRIS}; line-height: 1.5;">El mueble sigue contratable para cualquier fecha fuera de esta vigencia.</span>', "align-self: start;")}
</main>''' + nota_paso(7, "Lunes 26/10/2026", "Ana", "El contrato queda guardado y la pantalla dice qué sigue. La línea de tiempo de PUN-08 ya muestra desde cuándo vuelve a estar disponible.")
pantalla("R07", "Contrato guardado", r7)

# ---------- R8 · teléfono del montador (dos pantallas) ----------
def tel(cuerpo):
    return f'<div style="width: 390px; height: 760px; flex-shrink: 0; border-radius: 28px; border: 8px solid {TINTA}; background: {FONDO}; overflow: hidden; display: flex; flex-direction: column;">{cuerpo}</div>'
cab_tel = lambda t, s: f'<header style="display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; background: {BLANCO}; border-bottom: 1px solid {BORDE};"><span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">{s}</span><b style="font-size: 18px;">{t}</b></header>'
hoja = tel(cab_tel("Aviso de montaje", "SUPERMERCADO LA ESQUINA · CENTRO") + f'''<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px;">
<div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 12px; font-weight: 700; color: {AMBAR};">INICIO {f(DESDE)}</span><b style="font-size: 18px;">PUN-08 · Punta de góndola 8</b><span style="font-size: 14px; color: #3D3D3A;">Proveedor Galletas Sol · marca Sol</span></div>
<div style="display: flex; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #F4F2EC; font-size: 14px; line-height: 1.45;">{ico("alerta")}<span><b>Ubicación:</b> pasillo 3, extremo frente a las cajas. Octava punta de góndola desde la entrada.</span></div>
<span style="font-size: 14px; font-weight: 600;">Planometría del contrato</span>
<div role="img" aria-label="Planometría" style="height: 210px; border-radius: 10px; background: #F6F5F1; border: 1px dashed #C9C6BE; display: flex; align-items: center; justify-content: center; font-size: 13px; color: {GRIS};">[sol-pun08.pdf]</div>
{boton("Registrar montaje (tomar foto)", "pri", "height: 54px; font-size: 16px;", h=54)}
{boton("Registrar montaje no realizado", h=46)}
</div>''')
reg = tel(cab_tel("Registrar montaje", "PUN-08 · PUNTA DE GÓNDOLA 8") + f'''<div style="display: flex; flex-direction: column; gap: 14px; padding: 16px;">
<div role="img" aria-label="Foto del montaje" style="height: 260px; border-radius: 12px; background: linear-gradient(160deg, #C9B48A, #8C6F3E); display: flex; align-items: flex-end; padding: 10px; color: {BLANCO}; font-size: 12px;">Foto · 01/11/2026 09:12</div>
<div style="display: flex; gap: 8px;">{opcion("Montaje realizado", True)}{opcion("No realizado", False)}</div>
{campo("Nota (opcional)", inp2("Exhibidor armado con 4 entrepaños"))}
<span style="font-size: 13px; color: {GRIS};">Registra: Luis Pérez · responsable de montaje</span>
{boton("Confirmar registro", "pri", "height: 54px; font-size: 16px;", h=54)}
</div>''')
r8 = f'<div style="display: flex; gap: 40px; align-items: center; justify-content: center; padding: 24px 40px; flex-grow: 1;">{hoja}<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: {GRIS}; font-size: 13px;">{ico("flecha", 32, "#9A978F", 2)}<span>saca la foto</span></div>{reg}</div>' + nota_paso(8, "Domingo 01/11/2026", "Luis Pérez, responsable de montaje", "Abre el enlace del correo, sin contraseña. Ve dónde va y cómo debe quedar, monta, saca la foto y confirma.")
guardar("R08", "Montaje en el teléfono", W, H, r8)

# ---------- R9 · Pendientes: montado, sin verificar ----------
fondo9 = encabezado("Indicadores", pendientes=1, bandeja_abierta=True) + barra_modulo("Indicadores", "", "Sede CENTRO · noviembre 2026") + f'<main style="padding: 16px 24px; flex-grow: 1; display: flex; min-height: 0;">{tarjeta(plano_nuevo(estados={"PUN-08": "c"}, sel=None, fs=11), "flex-grow: 1; padding: 28px; gap: 22px;")}</main>'
r9 = fondo9 + velo() + f'''<aside aria-label="Pendientes" style="position: absolute; top: 60px; right: 0; bottom: 48px; width: 470px; display: flex; flex-direction: column; background: {BLANCO}; border-left: 1px solid #DEDBD3; box-shadow: -12px 0 32px rgba(20,20,19,.16);">
<div style="display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px;"><b style="font-size: 18px; flex-grow: 1;">Pendientes · Sede CENTRO</b><button type="button" aria-label="Cerrar" style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("x")}</button></div>
<div style="display: flex; gap: 4px; margin: 0 18px 12px; padding: 4px; border-radius: 10px; background: #F4F2EC; font-size: 13px;"><span style="flex: 1; text-align: center; padding: 7px 4px; border-radius: 8px; background: {TINTA}; color: {BLANCO}; font-weight: 600;">Fecha límite hoy · 1</span><span style="flex: 1; text-align: center; padding: 7px 4px;">Próximos 30 días · 0</span><span style="flex: 1; text-align: center; padding: 7px 4px;">Inconsistencias · 0</span></div>
<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 18px; border-top: 1px solid #ECEAE4;"><span style="font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {AMBAR};">MONTAJE</span><b style="font-size: 15px;">PUN-08 · Punta de góndola 8: montado, sin verificar</b><span style="font-size: 13px; color: {GRIS}; line-height: 1.45;">Registrado el 01/11/2026 a las 09:12 por Luis Pérez. Contrato de Galletas Sol.</span><div>{boton("Verificar montaje", "pri", h=36)}</div></div>
</aside>''' + nota_paso(9, "Domingo 01/11/2026", "Ana", "Pendientes avisa con el contador de la barra. El montaje registrado espera la verificación.")
pantalla("R09", "Pendientes: verificar montaje", r9)

# ---------- R10 · Verificar montaje ----------
r10 = encabezado("Indicadores", pendientes=1) + barra_modulo("Verificar montaje · PUN-08", "", "Galletas Sol · registrado el 01/11/2026 09:12 por Luis Pérez") + f'''
<main style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 14px 24px 0; flex-grow: 1; min-height: 0;">
{tarjeta(f'<b style="font-size: 15px;">Cómo debía quedar · planometría</b><div role="img" aria-label="Planometría" style="flex-grow: 1; border-radius: 12px; background: #F6F5F1; border: 1px dashed #C9C6BE; display: flex; align-items: center; justify-content: center; color: {GRIS}; font-size: 13px;">[sol-pun08.pdf]</div>')}
{tarjeta(f'<b style="font-size: 15px;">Cómo quedó · foto del montaje</b><div role="img" aria-label="Foto" style="flex-grow: 1; border-radius: 12px; background: linear-gradient(160deg, #C9B48A, #8C6F3E); display: flex; align-items: flex-end; padding: 12px; color: {BLANCO}; font-size: 12px;">Foto · 01/11/2026 09:12 · nota: «Exhibidor armado con 4 entrepaños»</div>')}
</main>
<div style="display: flex; align-items: center; gap: 10px; padding: 14px 24px 16px;"><span style="font-size: 14px; color: #3D3D3A; flex-grow: 1;">¿El montaje coincide con la planometría?</span>{boton("No coincide: marcar qué y reenviar el aviso")}{boton("Coincide", "pri")}</div>''' + nota_paso(10, "Domingo 01/11/2026", "Ana", "Planometría y foto lado a lado. «Coincide» cierra el montaje; «No coincide» marca qué corregir y reenvía el aviso a Luis Pérez.")
pantalla("R10", "Verificar montaje", r10)

# ---------- R11 · seguir vendiendo PUN-08 para otras fechas ----------
D2a, D2b = date(2027, 2, 1), date(2027, 4, 30)
pregunta2 = pregunta().replace(f(DESDE), f(D2a)).replace(f(HASTA), f(D2b)).replace(f"{dias(DESDE, HASTA)} días", f"{dias(D2a, D2b)} días")
est11 = {"PUN-08": "d"}
fila_t2 = lambda k, v: f'<div style="display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; font-size: 14px; line-height: 1.4;"><span style="color: {GRIS};">{k}</span><span>{v}</span></div>'
ficha11 = f'''<aside aria-label="Ficha de PUN-08" style="display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};">
<b style="font-size: 18px;">PUN-08 · Punta de góndola 8</b><span style="align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: #CDE7D6; color: {VERDE}; font-size: 12px; font-weight: 700;">En tus fechas: disponible todas</span>
{fila_t2("Contratado", "hasta el <b>31/01/2027</b> · Galletas Sol · montaje verificado: coincide")}
{fila_t2("Disponible", "<b>desde el 01/02/2027</b>, sin fin")}
<div style="display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: #F6F5F1;">{mini_tl([(DESDE, HASTA, "Galletas Sol", "c")], rango=(D2a, D2b))}<span style="font-size: 12px; color: {GRIS};">Banda amarilla: las fechas que pide Café Montaña.</span></div>
{boton("Contratar del " + f(D2a) + " al " + f(D2b), "pri", "width: 100%;")}
<div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; background: #F4F2EC; font-size: 13px; line-height: 1.45;"><b>Si pidiera del 15/01/2027 al 15/03/2027</b><span style="color: #3D3D3A;">PUN-08 saldría ámbar: «disponible desde el 01/02/2027 (43 de 60 días)», con la opción de contratar esa parte.</span></div>
</aside>'''
r11 = encabezado("Contratos", pendientes=0) + barra_modulo("Contratos", boton("Cargar desde planilla", icono="planilla"), "") + f'''
<div style="padding: 12px 24px 0;">{pregunta2}</div>
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px;">Del {f(D2a)} al {f(D2b)}</b><span style="flex-grow: 1;"></span>{lente(["Plano", "Línea de tiempo"], "Plano")}</div><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px; padding: 22px; border-radius: 12px; background: #F6F5F1; border: 1px solid #ECEAE4;">{plano_nuevo(estados=est11, sel="PUN-08", etiquetas={"PUN-08": "disponible"}, fs=11)}</div><span style="font-size: 13px; color: {GRIS};">PUN-08 tiene contrato hasta el 31/01/2027; en estas fechas está disponible.</span>')}
{ficha11}
</main>''' + nota_paso(11, "Lunes 02/11/2026", "Ana", "Café Montaña pide una punta de febrero a abril. Ana escribe esas fechas: PUN-08 aparece disponible, aunque hoy esté contratado por Galletas Sol.")
pantalla("R11", "Seguir contratando PUN-08", r11)

# ---------- R12 · el mueble con dos contratos seguidos ----------
contratos12 = f'''<div style="display: flex; flex-direction: column; border-radius: 12px; border: 1px solid {BORDE}; overflow: hidden;">
<div style="display: grid; grid-template-columns: 1.2fr 1.4fr 1fr 1.6fr; gap: 12px; padding: 10px 14px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>PROVEEDOR</span><span>VIGENCIA</span><span>CANON</span><span>MONTAJE</span></div>
<div style="display: grid; grid-template-columns: 1.2fr 1.4fr 1fr 1.6fr; gap: 12px; padding: 12px 14px; border-top: 1px solid #ECEAE4; font-size: 14px;"><b>Galletas Sol</b><span>{f(DESDE)} – {f(HASTA)}</span><span>$ 600.000 /mes</span><span style="color: {VERDE}; font-weight: 600;">Verificado: coincide</span></div>
<div style="display: grid; grid-template-columns: 1.2fr 1.4fr 1fr 1.6fr; gap: 12px; padding: 12px 14px; border-top: 1px solid #ECEAE4; font-size: 14px;"><b>Café Montaña</b><span>{f(D2a)} – {f(D2b)}</span><span>$ 600.000 /mes</span><span style="color: {AMBAR}; font-weight: 600;">Sin montar · inicia {f(D2a)} · falta planometría</span></div>
</div>'''
r12 = encabezado("Plano de la sede", pendientes=1) + barra_modulo("PUN-08 · Punta de góndola 8", boton("Adjuntar planometría de Café Montaña", "pri"), "Ficha del espacio") + f'''
<main style="display: flex; flex-direction: column; gap: 16px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<b style="font-size: 16px;">Línea de tiempo · octubre 2026 a septiembre 2027</b><div style="display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 12px; background: #F6F5F1;">{mini_tl([(DESDE, HASTA, "Galletas Sol", "c"), (D2a, D2b, "Café Montaña", "c")], h=34)}</div><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">{fila_t2("Contratado", f(DESDE) + " – " + f(D2b) + ", sin huecos")}{fila_t2("Disponible", "<b>desde el 01/05/2027</b>")}{fila_t2("Tarifa", "$ 600.000 /mes")}</div>')}
{tarjeta(f'<b style="font-size: 16px;">Contratos de este espacio</b>{contratos12}<span style="font-size: 13px; color: {GRIS}; line-height: 1.5;">El segundo contrato repite el ciclo: con la planometría adjunta, Luis Pérez recibe el aviso de montaje para el {f(D2a)}; al registrar y verificar, PUN-08 queda listo para las fechas siguientes.</span>')}
</main>''' + nota_paso(12, "Lunes 02/11/2026", "Ana", "Mismo mueble, dos contratos seguidos y sin huecos. Desde el 01/05/2027 vuelve a estar disponible: el ciclo empieza otra vez desde el paso 4.")
pantalla("R12", "PUN-08 con dos contratos seguidos", r12)

# ---------- R0 · mapa del recorrido ----------
ETAPAS = [
 ("Entrar", "Ana · administradora", "Configuración inicial", "1", "La sede creada y el siguiente paso marcado."),
 ("Armar el plano", "Ana", "Plano de la sede", "2 · 3", "16 muebles, 22 espacios contratables, validación sin inconsistencias."),
 ("Contratar", "Ana", "Contratos", "4 · 5 · 6 · 7", "Contrato de Galletas Sol; avisos al proveedor y a montaje."),
 ("Montar y verificar", "Luis Pérez (teléfono) y Ana", "Enlace del correo y Pendientes", "8 · 9 · 10", "Foto registrada y montaje verificado: coincide."),
 ("Seguir contratando", "Ana", "Contratos", "11 · 12", "Segundo contrato para otras fechas; el ciclo vuelve a montaje."),
]
def col_etapa(i, e):
    t, quien, donde, pasos, resultado = e
    return f'''<div style="display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; border-top: 6px solid {TINTA if i < 4 else AMARILLO};">
<span style="font-size: 12px; font-weight: 700; letter-spacing: .08em; color: {GRIS};">ETAPA {i + 1}</span><b style="font-size: 19px;">{t}</b>
<div style="display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 6px 10px; font-size: 13.5px; line-height: 1.45;"><span style="color: {GRIS};">Quién</span><span>{quien}</span><span style="color: {GRIS};">Dónde</span><span>{donde}</span><span style="color: {GRIS};">Pasos</span><b>{pasos}</b><span style="color: {GRIS};">Queda</span><span>{resultado}</span></div></div>'''
cols = ""
for i, e in enumerate(ETAPAS):
    cols += col_etapa(i, e) + (flecha_h if i < 4 else "")
r0 = f'''<div style="display: flex; flex-direction: column; gap: 22px; padding: 40px 48px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 30px;">El recorrido completo, con un mismo mueble: PUN-08</h1><span style="font-size: 16px; color: {GRIS};">Supermercado La Esquina, sede CENTRO. Ana administra; Luis Pérez monta. Doce pantallas, de entrar por primera vez a contratar el mismo mueble para otras fechas.</span></div>
<div style="display: grid; grid-template-columns: 1fr 30px 1fr 30px 1fr 30px 1fr 30px 1fr;">{cols}</div>
<div style="display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 16px; background: {TINTA}; color: {BLANCO};">{ico("flecha", 22, AMARILLO, 2)}<span style="font-size: 15px; line-height: 1.5;"><b>El ciclo se repite por cada contrato:</b> Contratar → aviso de montaje → registro con foto → verificación → el espacio sigue disponible para las fechas siguientes. Las etapas 1 y 2 se hacen una vez (y cuando cambia la sede).</span></div>
</div>'''
guardar("R00", "El recorrido completo", 1760, 480, r0)
print("recorrido ok")
