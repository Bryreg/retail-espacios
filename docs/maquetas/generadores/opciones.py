# -*- coding: utf-8 -*-
"""Cinco formas para «Cuándo se libera cada espacio», en el panel real.

Cada opción entra en la misma caja de 1024×274 que ocupa hoy el bloque en la
pantalla Vender, para que la comparación sea justa. Genera
docs/maquetas/opciones-libera.html.
"""
import io, os
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------- los datos
INICIO, FIN = date(2026, 8, 31), date(2026, 9, 30)
DIAS = (FIN - INICIO).days                                    # 30
MES = ["ene", "feb", "mar", "abr", "may", "jun",
       "jul", "ago", "sep", "oct", "nov", "dic"]
DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

HITOS = [
    (date(2026, 9, 25), ["PUN-03", "PUN-04"], "Punta de góndola"),
    (date(2026, 9, 27), ["PUN-17"],           "Punta de góndola"),
    (date(2026, 9, 29), ["EXP-01", "EXP-02"], "Exhibición de piso"),
]
BASE = 15
TEMP_INI, TEMP_FIN = date(2026, 9, 19), date(2026, 9, 26)

# tipo, libres hoy, [(fecha, código)], tomados todo el periodo  → 23 espacios
TIPOS = [
    ("Góndola, por cara",  5, [], 1),
    ("Punta de góndola",   1, [(date(2026, 9, 25), "PUN-03"),
                               (date(2026, 9, 25), "PUN-04"),
                               (date(2026, 9, 27), "PUN-17")], 0),
    ("Isla",               3, [], 1),
    ("Frutas y verduras",  3, [], 0),
    ("Nevera de bebidas",  2, [], 1),
    ("Exhibición de piso", 0, [(date(2026, 9, 29), "EXP-01"),
                               (date(2026, 9, 29), "EXP-02")], 0),
    ("Cabecera de caja",   1, [], 0),
]


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def dm(d):
    return f"{d.day} {MES[d.month - 1]}"


# ============================================================ A · escalera
def opcion_a():
    X0, X1 = 8.0, 768.0
    P = (X1 - X0) / DIAS
    def x(d): return X0 + (d - INICIO).days * P
    N = [134.0, 114.0, 94.0, 74.0]
    YE, YF, XD, XS = 152.0, 186.0, 800.0, 820.0
    s = []; a = s.append
    a(f'<line x1="{f(X0)}" y1="{f(YE)}" x2="{f(X1)}" y2="{f(YE)}" class="gEje"/>')
    for i, (d, _, _) in enumerate(HITOS):
        a(f'<line x1="{f(x(d))}" y1="{f(N[i+1])}" x2="{f(x(d))}" y2="{f(YE)}" class="gCaida"/>')
    pts, n = [(X0, N[0])], 0
    for d, _, _ in HITOS:
        pts.append((x(d), N[n])); n += 1; pts.append((x(d), N[n]))
    pts.append((X1, N[n]))
    a('<polyline points="' + " ".join(f"{f(p)},{f(q)}" for p, q in pts) + '" class="gPaso"/>')
    a(f'<circle cx="{f(X0)}" cy="{f(N[0])}" r="3.4" class="gPto"/>')
    for i, (d, _, _) in enumerate(HITOS):
        a(f'<circle cx="{f(x(d))}" cy="{f(N[i+1])}" r="3.4" class="gPto"/>')
    a(f'<text x="{f(X0)}" y="18" class="gRot">Espacios libres</text>')
    a(f'<text x="{f(X0+2)}" y="{f(N[0]-10)}" class="gNum">{BASE}</text>')
    a(f'<text x="{f(X0+34)}" y="{f(N[0]-10)}" class="gNota">sin cambios hasta el 25 de sep</text>')
    c = BASE
    tr = [(x(HITOS[0][0]), x(HITOS[1][0])),
          (x(HITOS[1][0]), x(HITOS[2][0])),
          (x(HITOS[2][0]), X1)]
    for i, (xa, xb) in enumerate(tr):
        c += len(HITOS[i][1])
        a(f'<text x="{f((xa+xb)/2)}" y="{f(N[i+1]-10)}" class="gNum" text-anchor="middle">{c}</text>')
    a(f'<rect x="{f(x(TEMP_INI))}" y="154" width="{f(x(TEMP_FIN)-x(TEMP_INI))}" '
      f'height="17" class="gTemp"/>')
    a(f'<text x="{f((x(TEMP_INI)+x(TEMP_FIN))/2)}" y="165.5" class="gTempT">'
      f'AMOR Y AMISTAD · 19 AL 26 SEP</text>')
    a(f'<text x="{f(X0)}" y="{f(YF)}" class="gHoy">hoy · 31 ago</text>')
    for d, _, _ in HITOS:
        a(f'<text x="{f(x(d))}" y="{f(YF)}" class="gFecha" text-anchor="middle">{dm(d)}</text>')
    a(f'<line x1="{f(XD)}" y1="8" x2="{f(XD)}" y2="208" class="gDiv"/>')
    a(f'<text x="{f(XS)}" y="18" class="gRot">Qué entra en cada fecha</text>')
    y = 30.0
    for d, cods, tipo in HITOS:
        a(f'<circle cx="{f(XS+3.5)}" cy="{f(y+8)}" r="3.4" class="gPto"/>')
        a(f'<text x="{f(XS+15)}" y="{f(y+12)}" class="gDia">{d.day} de {MES[d.month-1]}</text>')
        a(f'<text x="{f(XS)}" y="{f(y+27)}" class="gTipo">{tipo.upper()}</text>')
        for j, cod in enumerate(cods):
            cx = XS + j * 62
            a(f'<rect x="{f(cx)}" y="{f(y+34)}" width="56" height="20" rx="2.5" class="gChip"/>')
            a(f'<text x="{f(cx+28)}" y="{f(y+48.5)}" class="gCod" text-anchor="middle">{cod}</text>')
        y += 60
    return ('<div class="graf"><svg viewBox="0 0 1000 216" preserveAspectRatio="xMidYMid meet">'
            + "\n".join(s) + '</svg></div>')


# ==================================================== B · inventario por tipo
def opcion_b():
    filas = [(nom, hoy, ent, tom, hoy + len(ent)) for nom, hoy, ent, tom in TIPOS]
    filas.sort(key=lambda r: (-r[4], r[0]))
    tot_hoy = sum(r[1] for r in filas)
    tot_ent = sum(len(r[2]) for r in filas)
    o = ['<div class="cuerpo"><table class="inv"><thead><tr>',
         '<th class="izq">Tipo de espacio</th><th class="n">Libres hoy</th>',
         '<th class="izq2">Entran durante el periodo</th><th class="fin">Al cerrar</th>',
         '</tr></thead><tbody>']
    for nom, hoy, ent, tom, fin in filas:
        cl = ' class="mueve"' if ent else ' class="quieta"'
        if ent:
            cuando = " y ".join(dm(d) for d in sorted({d for d, _ in ent}))
            chips = "".join(f'<i>{c}</i>' for _, c in ent)
            entra = (f'<b>+{len(ent)}</b> <span class="cu">{cuando}</span> '
                     f'<span class="ch">{chips}</span>')
        else:
            entra = '<span class="nada">no cambia en el periodo</span>'
        o.append(f'<tr{cl}><td class="izq">{nom}</td><td class="n">{hoy}</td>'
                 f'<td class="izq2">{entra}</td><td class="n fin">{fin}</td></tr>')
    o.append(f'</tbody><tfoot><tr><td class="izq">23 espacios comercializables</td>'
             f'<td class="n">{tot_hoy}</td><td class="izq2"><b>+{tot_ent}</b></td>'
             f'<td class="n fin">{tot_hoy + tot_ent}</td></tr></tfoot></table></div>')
    return "".join(o)


# ========================================================= C · tira del mes
def opcion_c():
    W, X0 = 994.0, 6.0
    n = DIAS + 1
    cw = (W - X0 * 2) / n
    mapa = {d: cods for d, cods, _ in HITOS}
    s = []; a = s.append
    YC, HC, YLANE = 50.0, 30.0, 112.0
    a(f'<text x="{f(X0)}" y="13" class="gRot">Los 31 días del periodo</text>')

    # la cifra que va quedando, arriba de la tira
    a(f'<text x="{f(X0)}" y="31" class="gNum">{BASE}</text>')
    a(f'<text x="{f(X0+30)}" y="31" class="gNota">libres hoy · sube en cada entrega</text>')
    c = BASE
    for d, cods, _ in HITOS:
        cx = X0 + (d - INICIO).days * cw + (cw - 1.5) / 2
        c += len(cods)
        a(f'<text x="{f(cx)}" y="31" class="gNum" text-anchor="middle">{c}</text>')

    # la tira de días
    dia, paso = INICIO, 0
    for i in range(n):
        if dia in mapa:
            paso += 1
        x = X0 + i * cw
        a(f'<rect x="{f(x)}" y="{f(YC)}" width="{f(cw-1.5)}" height="{f(HC)}" class="c{paso}"/>')
        cl = "dNum hoy" if i == 0 else ("dNum ent" if dia in mapa else "dNum")
        a(f'<text x="{f(x+(cw-1.5)/2)}" y="{f(YC+19)}" class="{cl}">{dia.day}</text>')
        if dia.weekday() >= 5:
            a(f'<rect x="{f(x)}" y="{f(YC+HC)}" width="{f(cw-1.5)}" height="2" class="finde"/>')
        if dia.day == 1 or i == 0:
            a(f'<text x="{f(x)}" y="{f(YC-6)}" class="gMesR">{MES[dia.month-1].upper()}</text>')
        dia = date.fromordinal(dia.toordinal() + 1)

    bx = X0 + (TEMP_INI - INICIO).days * cw
    bw = ((TEMP_FIN - TEMP_INI).days + 1) * cw - 1.5
    a(f'<rect x="{f(bx)}" y="{f(YC+HC+6)}" width="{f(bw)}" height="15" class="gTemp"/>')
    a(f'<text x="{f(bx+bw/2)}" y="{f(YC+HC+16.5)}" class="gTempT">AMOR Y AMISTAD</text>')

    # los códigos colgando de su casilla
    for d, cods, _ in HITOS:
        cx = X0 + (d - INICIO).days * cw + (cw - 1.5) / 2
        a(f'<line x1="{f(cx)}" y1="{f(YC+HC)}" x2="{f(cx)}" y2="{f(YLANE)}" class="gCaida"/>')
        for j, cod in enumerate(cods):
            a(f'<rect x="{f(cx-28)}" y="{f(YLANE+4+j*24)}" width="56" height="20" '
              f'rx="2.5" class="gChip"/>')
            a(f'<text x="{f(cx)}" y="{f(YLANE+18.5+j*24)}" class="gCod" '
              f'text-anchor="middle">{cod}</text>')
    a(f'<text x="{f(X0)}" y="{f(YLANE+18)}" class="gTipo">PUN · PUNTA DE GÓNDOLA</text>')
    a(f'<text x="{f(X0)}" y="{f(YLANE+34)}" class="gTipo">EXP · EXHIBICIÓN DE PISO</text>')
    return ('<div class="graf"><svg viewBox="0 0 994 216" preserveAspectRatio="xMidYMid meet">'
            + "\n".join(s) + '</svg></div>')


# ============================================================= D · agenda
def opcion_d():
    o = ['<div class="cuerpo ag">',
         '<div class="agCab"><span class="agK"><b>15</b> libres hoy</span>'
         '<span class="agFlecha">→</span>'
         '<span class="agK"><b>20</b> al cerrar el periodo</span>'
         '<span class="agNota">tres entregas, todas en la última semana</span></div>']
    c = BASE
    for d, cods, tipo in HITOS:
        dias = (d - INICIO).days
        c += len(cods)
        if len(cods) == 1:
            cant = f"1 {tipo.lower()}"
        else:
            plural = "puntas de góndola" if "Punta" in tipo else "exhibiciones de piso"
            cant = f"{len(cods)} {plural}"
        chips = "".join(f"<i>{x}</i>" for x in cods)
        o.append(f'<div class="agFila"><div class="agCu"><b>en {dias} días</b>'
                 f'<span>{DIA_LARGO[d.weekday()]} {d.day} de {MES[d.month-1]}</span></div>'
                 f'<div class="agQ"><span class="agTipo">{cant}</span>'
                 f'<span class="agCh">{chips}</span></div>'
                 f'<div class="agTot">quedan <b>{c}</b></div></div>')
    o.append('</div>')
    return "".join(o)


# ================================================== E · un punto por espacio
def opcion_e():
    X0, X1 = 208.0, 900.0
    P = (X1 - X0) / DIAS
    def x(d): return X0 + (d - INICIO).days * P
    s = []; a = s.append
    a('<text x="6" y="16" class="gRot">'
      'Los 5 que se liberan · cada punto es la fecha en que entra</text>')
    a(f'<rect x="{f(x(TEMP_INI))}" y="26" width="{f(x(TEMP_FIN)-x(TEMP_INI))}" '
      f'height="128" class="gTemp"/>')
    a(f'<text x="{f((x(TEMP_INI)+x(TEMP_FIN))/2)}" y="38" class="gTempT">AMOR Y AMISTAD</text>')
    y = 52.0
    for d, cods, tipo in HITOS:
        for cod in cods:
            a(f'<text x="6" y="{f(y+4)}" class="eCod">{cod}</text>')
            a(f'<text x="72" y="{f(y+4)}" class="eTipo">{tipo}</text>')
            a(f'<line x1="{f(X0)}" y1="{f(y)}" x2="{f(x(d))}" y2="{f(y)}" class="eGuia"/>')
            a(f'<line x1="{f(x(d))}" y1="{f(y)}" x2="{f(X1)}" y2="{f(y)}" class="eVend"/>')
            a(f'<circle cx="{f(x(d))}" cy="{f(y)}" r="4.2" class="gPto"/>')
            a(f'<text x="{f(X1+10)}" y="{f(y+4)}" class="eFecha">{dm(d)}</text>')
            y += 21
    a(f'<line x1="{f(X0)}" y1="162" x2="{f(X1)}" y2="162" class="gEje"/>')
    for d in [INICIO, date(2026, 9, 10), date(2026, 9, 20), FIN]:
        a(f'<line x1="{f(x(d))}" y1="162" x2="{f(x(d))}" y2="166" class="gEje"/>')
        an = "start" if d == INICIO else ("end" if d == FIN else "middle")
        etq = "hoy · 31 ago" if d == INICIO else dm(d)
        a(f'<text x="{f(x(d))}" y="178" class="gFecha" text-anchor="{an}">{etq}</text>')
    a('<text x="6" y="200" class="gNota">Los otros <tspan class="gNumS">15</tspan> '
      'están libres todo el periodo</text>')
    a(f'<text x="{f(X1+52)}" y="200" class="gTipo" text-anchor="end">'
      f'LÍNEA GRUESA = VENTANA VENDIBLE</text>')
    return ('<div class="graf"><svg viewBox="0 0 994 216" preserveAspectRatio="xMidYMid meet">'
            + "\n".join(s) + '</svg></div>')


# ================================================================== página
OPCIONES = [
    ("A", "Escalera sobre el eje de fechas", "la que está hoy",
     "¿Cuántos tengo si el cliente arranca el día X?",
     "Serie en el tiempo. La disponibilidad sólo sube, así que el escalón muestra el "
     "ritmo: 25 días quietos y tres entregas en cinco. Los códigos van aparte porque "
     "no caben sobre el eje.", opcion_a),
    ("B", "Inventario por tipo", "tabla, con énfasis en lo que se mueve",
     "¿Tenés una punta de góndola?",
     "Cubre los 23 espacios, no sólo los 5 que se mueven. Es la pregunta que hace el "
     "proveedor: pide un tipo, no un código. Las dos filas que cambian están "
     "resaltadas; las otras cinco se apagan.", opcion_b),
    ("C", "Tira del mes", "el calendario como eje",
     "¿Qué pasa en el mes, día por día?",
     "Las fechas mandan literalmente. El tono del día sube en cada entrega y los "
     "códigos cuelgan de su casilla. Es la que más se parece a como habla la gente "
     "de temporadas.", opcion_c),
    ("D", "Agenda de entregas", "sin gráfico",
     "¿Qué es lo próximo que se libera?",
     "Cinco datos en tres fechas no necesitan un gráfico. Ordenado por cercanía, que "
     "es como se negocia: «en 25 días entran dos puntas».", opcion_d),
    ("E", "Un punto por espacio", "gráfico de puntos sobre el eje",
     "¿Desde cuándo puedo vender este espacio?",
     "Una fila por espacio, así que no hay choques posibles. La línea gruesa es la "
     "ventana que sí se puede vender; la fina, lo que todavía está ocupado.", opcion_e),
]


def pagina():
    p = []
    for letra, nom, forma, preg, por, fn in OPCIONES:
        p.append(f'''<section class="op">
  <div class="cab"><span class="letra">{letra}</span>
    <div><h3>{nom} <em>· {forma}</em></h3>
      <p class="preg">{preg}</p><p class="por">{por}</p></div></div>
  <div class="panel"><section class="t">
    <header><h2>Cuándo se libera cada espacio</h2>
      <span class="sub">de 15 disponibles hoy a 20 al cerrar el periodo</span>
      <div class="der">31 ago → 30 sep 2026</div></header>
    {fn()}
  </section></div>
</section>''')
    return "\n".join(p)


CSS = io.open(os.path.join(AQUI, "opciones.css"), encoding="utf-8").read()
HTML = f'''<meta charset="utf-8">
<title>RECABRA · Cinco formas para «cuándo se libera cada espacio»</title>
<link rel="stylesheet" href="fuentes/tipos.css">
<style>{CSS}</style>
<div class="hoja">
<header class="tope"><h1>Cuándo se libera cada espacio</h1>
<p>Cinco formas, cada una dentro de la caja real que ocupa el bloque en la
pantalla Vender (1024×274). Los datos son los mismos en las cinco: 15 espacios
libres todo el periodo, 5 que entran en tres fechas y 3 tomados. Ninguna muestra
precios ni proveedores —esta pantalla la ve el cliente.</p></header>
{pagina()}
</div>'''

io.open(os.path.join(AQUI, "..", "opciones-libera.html"), "w",
        encoding="utf-8").write(HTML)
print("opciones-libera.html ·", len(HTML), "bytes")
