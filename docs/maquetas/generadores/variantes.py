# -*- coding: utf-8 -*-
"""Cuatro maneras de hacer legible la opción A (escalera sobre el eje de fechas).

La forma no cambia —sigue siendo la disponibilidad en el tiempo, que es la
pregunta «¿cuántos tengo si arranca el día X?»—. Lo que cambia es cómo se lee:
darle un techo (los 23 de la sala) para que el 15 signifique algo, darle peso
con área, hacer que el eje se sienta a días, y mostrar la lectura.

Genera docs/maquetas/variantes-a.html.
"""
import io, os
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))

INICIO, FIN = date(2026, 8, 31), date(2026, 9, 30)
DIAS = (FIN - INICIO).days
MES = ["ene", "feb", "mar", "abr", "may", "jun",
       "jul", "ago", "sep", "oct", "nov", "dic"]
HITOS = [
    (date(2026, 9, 25), ["PUN-03", "PUN-04"], "Punta de góndola"),
    (date(2026, 9, 27), ["PUN-17"],           "Punta de góndola"),
    (date(2026, 9, 29), ["EXP-01", "EXP-02"], "Exhibición de piso"),
]
BASE, TOTAL, TOMADOS = 15, 23, 3
CIERRE = BASE + sum(len(c) for _, c, _ in HITOS)      # 20
TEMP_INI, TEMP_FIN = date(2026, 9, 19), date(2026, 9, 26)
LECTURA = date(2026, 9, 26)                            # la fecha de ejemplo


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def dm(d):
    return f"{d.day} {MES[d.month - 1]}"


def niveles():
    """[(fecha_desde, libres)] — la serie escalonada."""
    out, c = [(INICIO, BASE)], BASE
    for d, cods, _ in HITOS:
        c += len(cods)
        out.append((d, c))
    return out


def libres_en(d):
    c = BASE
    for h, cods, _ in HITOS:
        if d >= h:
            c += len(cods)
    return c


# ---------------------------------------------------------------- piezas
def comb(x, X0, X1, y, alto=5.0):
    """Un diente por día: el tramo plano deja de ser vacío y pasa a ser tiempo."""
    s = []
    for i in range(DIAS + 1):
        d = date.fromordinal(INICIO.toordinal() + i)
        h = alto if (i % 5 == 0 or i == DIAS) else alto * 0.5
        s.append(f'<line x1="{f(x(d))}" y1="{f(y)}" x2="{f(x(d))}" y2="{f(y+h)}" class="vComb"/>')
    return s


def escalon_pts(x, yof):
    pts, ser = [], niveles()
    for i, (d, n) in enumerate(ser):
        pts.append((x(d), yof(n)))
        if i + 1 < len(ser):
            pts.append((x(ser[i + 1][0]), yof(n)))
    pts.append((x(FIN), yof(ser[-1][1])))
    return pts


def poli(pts):
    return " ".join(f"{f(a)},{f(b)}" for a, b in pts)


def codigos_bajo_eje(x, y0, s):
    """Los chips centrados bajo su fecha. A todo el ancho sí caben."""
    for d, cods, _ in HITOS:
        cx = x(d)
        for j, cod in enumerate(cods):
            s.append(f'<rect x="{f(cx-28)}" y="{f(y0+j*24)}" width="56" height="20" '
                     f'rx="2.5" class="gChip"/>')
            s.append(f'<text x="{f(cx)}" y="{f(y0+14.5+j*24)}" class="gCod" '
                     f'text-anchor="middle">{cod}</text>')
    s.append(f'<text x="8" y="{f(y0+14)}" class="gTipo">PUN · PUNTA DE GÓNDOLA</text>')
    s.append(f'<text x="8" y="{f(y0+30)}" class="gTipo">EXP · EXHIBICIÓN DE PISO</text>')


def columna_codigos(s, XD=800.0, XS=820.0):
    s.append(f'<line x1="{f(XD)}" y1="8" x2="{f(XD)}" y2="208" class="gDiv"/>')
    s.append(f'<text x="{f(XS)}" y="18" class="gRot">Qué entra en cada fecha</text>')
    y = 30.0
    for d, cods, tipo in HITOS:
        s.append(f'<circle cx="{f(XS+3.5)}" cy="{f(y+8)}" r="3.4" class="gPto"/>')
        s.append(f'<text x="{f(XS+15)}" y="{f(y+12)}" class="gDia">{d.day} de {MES[d.month-1]}</text>')
        s.append(f'<text x="{f(XS)}" y="{f(y+27)}" class="gTipo">{tipo.upper()}</text>')
        for j, cod in enumerate(cods):
            cx = XS + j * 62
            s.append(f'<rect x="{f(cx)}" y="{f(y+34)}" width="56" height="20" rx="2.5" class="gChip"/>')
            s.append(f'<text x="{f(cx+28)}" y="{f(y+48.5)}" class="gCod" text-anchor="middle">{cod}</text>')
        y += 60


def temporada_bajo_eje(x, s, y, alto=17.0):
    s.append(f'<rect x="{f(x(TEMP_INI))}" y="{f(y)}" width="{f(x(TEMP_FIN)-x(TEMP_INI))}" '
             f'height="{f(alto)}" class="gTemp"/>')
    s.append(f'<text x="{f((x(TEMP_INI)+x(TEMP_FIN))/2)}" y="{f(y+alto*0.68)}" '
             f'class="gTempT">AMOR Y AMISTAD · 19 AL 26 SEP</text>')


def fechas(x, s, y, corto=False):
    s.append(f'<text x="8" y="{f(y)}" class="gHoy">hoy · 31 ago</text>')
    for d, _, _ in HITOS:
        s.append(f'<text x="{f(x(d))}" y="{f(y)}" class="gFecha" text-anchor="middle">{dm(d)}</text>')


# ================================================= V1 · sobre el total
def v1():
    X0, X1 = 8.0, 768.0
    P = (X1 - X0) / DIAS
    def x(d): return X0 + (d - INICIO).days * P
    YB, S = 148.0, 118.0 / TOTAL                    # y de 0 espacios, px por espacio
    def yof(n): return YB - n * S
    s = []; a = s.append

    a(f'<text x="{f(X0)}" y="17" class="gRot">Los 23 espacios comercializables de NAVE</text>')
    # banda 3 · tomados todo el periodo (arriba, la más pálida)
    a(f'<rect x="{f(X0)}" y="{f(yof(TOTAL))}" width="{f(X1-X0)}" '
      f'height="{f(TOMADOS*S)}" class="vTomado"/>')
    # banda 2 · lo que va a entrar (entre el escalón y el techo de 20)
    pts = escalon_pts(x, yof)
    a('<polygon points="' + poli([(X0, yof(CIERRE))] + pts + [(X1, yof(CIERRE))]) +
      '" class="vEntra"/>')
    # banda 1 · libres, bajo el escalón
    a('<polygon points="' + poli([(X0, YB)] + pts + [(X1, YB)]) + '" class="vLibre"/>')
    # separadores de 2 px y el escalón encima
    a(f'<line x1="{f(X0)}" y1="{f(yof(CIERRE))}" x2="{f(X1)}" y2="{f(yof(CIERRE))}" class="vSep"/>')
    a('<polyline points="' + poli(pts) + '" class="vSepG"/>')
    a('<polyline points="' + poli(pts) + '" class="gPaso"/>')

    a(f'<text x="{f(X0+10)}" y="{f(YB-8)}" class="vDentro">15 libres hoy</text>')
    a(f'<text x="{f(X1-10)}" y="{f(YB-8)}" class="vDentro" text-anchor="end">20 al cerrar</text>')
    a(f'<text x="{f(X0+10)}" y="{f(yof(CIERRE)+16)}" class="vEnc">5 entran durante el periodo</text>')
    a(f'<text x="{f(X0+10)}" y="{f(yof(TOTAL)+11)}" class="vTom">3 TOMADOS TODO EL PERIODO</text>')

    a(f'<line x1="{f(X0)}" y1="{f(YB)}" x2="{f(X1)}" y2="{f(YB)}" class="gEje"/>')
    fechas(x, s, YB + 18)
    temporada_bajo_eje(x, s, YB + 26)
    columna_codigos(s)
    return svg(s, 1000)


# ============================================ V2 · con la lectura de la fecha
def v2():
    X0, X1 = 8.0, 768.0
    P = (X1 - X0) / DIAS
    def x(d): return X0 + (d - INICIO).days * P
    N = {15: 134.0, 17: 114.0, 18: 94.0, 20: 74.0}
    def yof(n): return N[n]
    YE = 152.0
    s = []; a = s.append

    a(f'<text x="{f(X0)}" y="18" class="gRot">Espacios libres</text>')
    a(f'<line x1="{f(X0)}" y1="{f(YE)}" x2="{f(X1)}" y2="{f(YE)}" class="gEje"/>')
    s.extend(comb(x, X0, X1, YE, 5.0))
    pts = escalon_pts(x, yof)
    a('<polygon points="' + poli([(X0, YE)] + pts + [(X1, YE)]) + '" class="vSuave"/>')
    a('<polyline points="' + poli(pts) + '" class="gPaso"/>')
    for d, n in niveles():
        a(f'<circle cx="{f(x(d))}" cy="{f(yof(n))}" r="3.4" class="gPto"/>')
    c = BASE
    a(f'<text x="{f(X0+2)}" y="{f(yof(15)-10)}" class="gNum">{BASE}</text>')
    ser = niveles()
    for i in range(1, len(ser)):
        c = ser[i][1]
        xa = x(ser[i][0]); xb = x(ser[i+1][0]) if i + 1 < len(ser) else X1
        a(f'<text x="{f((xa+xb)/2)}" y="{f(yof(c)-10)}" class="gNum" text-anchor="middle">{c}</text>')

    # la lectura: una vertical parada en una fecha, con su resultado
    lx, ly = x(LECTURA), yof(libres_en(LECTURA))
    a(f'<line x1="{f(lx)}" y1="46" x2="{f(lx)}" y2="{f(YE)}" class="vCruz"/>')
    a(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="6" class="vAnillo"/>')
    a(f'<rect x="{f(lx-150)}" y="42" width="144" height="48" rx="3" class="vCaja"/>')
    a(f'<text x="{f(lx-139)}" y="60" class="vCajaT">si arranca el 26 de sep</text>')
    a(f'<text x="{f(lx-139)}" y="82" class="vCajaN">17 <tspan class="vCajaS">libres</tspan></text>')

    fechas(x, s, YE + 18)
    temporada_bajo_eje(x, s, YE + 26)
    columna_codigos(s)
    return svg(s, 1000)


# ================================================= V3 · a todo el ancho
def v3():
    X0, X1 = 8.0, 986.0
    P = (X1 - X0) / DIAS
    def x(d): return X0 + (d - INICIO).days * P
    YB, S = 130.0, 12.0
    def yof(n): return YB - (n - BASE + 2) * S       # 15 → 106, 20 → 46
    YE = 130.0
    s = []; a = s.append

    a(f'<text x="{f(X0)}" y="17" class="gRot">Espacios libres a lo largo del periodo</text>')
    a(f'<rect x="{f(x(TEMP_INI))}" y="30" width="{f(x(TEMP_FIN)-x(TEMP_INI))}" '
      f'height="{f(YE-30)}" class="vTempV"/>')
    a(f'<text x="{f((x(TEMP_INI)+x(TEMP_FIN))/2)}" y="41" class="gTempT">AMOR Y AMISTAD</text>')
    pts = escalon_pts(x, yof)
    a('<polygon points="' + poli([(X0, YE)] + pts + [(X1, YE)]) + '" class="vSuave"/>')
    a(f'<line x1="{f(X0)}" y1="{f(YE)}" x2="{f(X1)}" y2="{f(YE)}" class="gEje"/>')
    s.extend(comb(x, X0, X1, YE, 5.0))
    a('<polyline points="' + poli(pts) + '" class="gPaso"/>')
    ser = niveles()
    for d, n in ser:
        a(f'<circle cx="{f(x(d))}" cy="{f(yof(n))}" r="3.4" class="gPto"/>')
    a(f'<text x="{f(X0+2)}" y="{f(yof(BASE)-10)}" class="gNum">{BASE}</text>')
    a(f'<text x="{f(X0+34)}" y="{f(yof(BASE)-10)}" class="gNota">'
      f'sin cambios durante 25 días</text>')
    for i in range(1, len(ser)):
        n = ser[i][1]
        xa = x(ser[i][0]); xb = x(ser[i+1][0]) if i + 1 < len(ser) else X1
        a(f'<text x="{f((xa+xb)/2)}" y="{f(yof(n)-10)}" class="gNum" text-anchor="middle">{n}</text>')
    fechas(x, s, YE + 22)
    codigos_bajo_eje(x, YE + 32, s)
    return svg(s, 994)


# ================================ V4 · a todo el ancho + la lectura (la mezcla)
# La elegida. Vive en riel.py, que es de donde la toma la maqueta, para que no
# haya dos copias que se puedan desincronizar.
from riel import svg_a4


def v4():
    return svg(svg_a4().split("\n"), 994)


def svg(s, w):
    return (f'<div class="graf"><svg viewBox="0 0 {w} 216" preserveAspectRatio="xMidYMid meet">'
            + "\n".join(s) + '</svg></div>')


# ================================================================== página
VARIANTES = [
    ("A·1", "Sobre el total de la sala", "área apilada, techo en 23",
     "Que el 15 signifique algo.",
     "Hoy «15» flota sobre una línea a una altura cualquiera. Acá la sala entera es "
     "el techo: se ve qué parte de NAVE es vendible, cómo la franja de lo que va a "
     "entrar se vacía dentro de la verde, y que 3 quedan tomados haga lo que haga. "
     "Los 25 días planos dejan de ser un vacío y pasan a ser un bloque que se lee.", v1),
    ("A·2", "Con la lectura de la fecha", "peine de días y cursor",
     "Que se vea para qué sirve.",
     "El eje gana un diente por día, así que el tramo plano se lee como tiempo que "
     "pasa y no como espacio sobrante. Y el cursor —que en el sistema se mueve con "
     "el mouse— muestra la respuesta escrita: «si arranca el 26 de sep, 17 libres».", v2),
    ("A·3", "A todo el ancho", "sin columna al costado",
     "Que los códigos estén bajo su fecha.",
     "El gráfico se queda con los 1024 px enteros. A ese ancho los chips sí caben "
     "debajo de su día sin pisarse, que era lo que obligaba a mandarlos a una "
     "columna aparte. Un solo bloque en vez de dos que hay que juntar con la vista.", v3),
    ("A·4", "A todo el ancho, con la lectura", "la recomendada",
     "La 3 más lo único que le falta.",
     "El ancho entero, los códigos bajo su fecha, el peine de días y el cursor con "
     "la respuesta escrita. Es la misma pregunta de siempre —cuántos tengo si "
     "arranca el día X— contestada sin que haya que descifrar nada. La 1 se queda "
     "afuera a propósito: darle techo de 23 hace legible la proporción pero aplasta "
     "el escalón, que es el dato que se está negociando.", v4),
]


def pagina():
    p = []
    for cod, nom, forma, tesis, por, fn in VARIANTES:
        p.append(f'''<section class="op">
  <div class="cab"><span class="letra chico">{cod}</span>
    <div><h3>{nom} <em>· {forma}</em></h3>
      <p class="preg">{tesis}</p><p class="por">{por}</p></div></div>
  <div class="panel"><section class="t">
    <header><h2>Cuándo se libera cada espacio</h2>
      <span class="sub">de 15 disponibles hoy a 20 al cerrar el periodo</span>
      <div class="der">31 ago → 30 sep 2026</div></header>
    {fn()}
  </section></div>
</section>''')
    return "\n".join(p)


CSS = io.open(os.path.join(AQUI, "opciones.css"), encoding="utf-8").read()
EXTRA = io.open(os.path.join(AQUI, "variantes.css"), encoding="utf-8").read()
HTML = f'''<meta charset="utf-8">
<title>RECABRA · Cuatro maneras de leer la escalera</title>
<link rel="stylesheet" href="fuentes/tipos.css">
<style>{CSS}{EXTRA}</style>
<div class="hoja">
<header class="tope"><h1>Cuatro maneras de leer la escalera</h1>
<p>La forma no cambia: sigue siendo la disponibilidad en el tiempo, que contesta
«¿cuántos tengo si el cliente arranca el día X?». Lo que cambia es cómo se
entiende. Cada una en la caja real de la pantalla Vender (1024×274), con los
mismos datos y sin precios ni proveedores.</p></header>
{pagina()}
</div>'''
io.open(os.path.join(AQUI, "..", "variantes-a.html"), "w",
        encoding="utf-8").write(HTML)
print("variantes-a.html ·", len(HTML), "bytes")
