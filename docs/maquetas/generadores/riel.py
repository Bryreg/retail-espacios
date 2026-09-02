# -*- coding: utf-8 -*-
"""«Cuándo se libera cada espacio» — la forma elegida (A·4).

Escalera sobre un eje de fechas proporcional, a todo el ancho del panel. La
disponibilidad sólo sube dentro del periodo, así que la serie es monótona y el
escalón dice de un vistazo lo que importa al negociar una fecha de inicio: no
se mueve nada durante 25 días y después caen tres entregas en cinco.

Cuatro decisiones que conviene no deshacer:

  · **A todo el ancho.** A 1024 px quedan 66 px entre el 25 y el 27 de sep, y
    un chip mide 56: los códigos caben debajo de su fecha sin pisarse. Eso es
    lo que permite sacar la columna lateral y dejar un solo bloque. Si el panel
    se angosta, los chips vuelven a chocar y hay que reponerla.
  · **Sin eje vertical.** El rango es 15 a 20; una escala completa sería
    adorno. Cada tramo va rotulado con su cifra.
  · **Peine de días.** Un diente por día bajo el eje: el tramo plano se lee
    como tiempo que pasa y no como espacio sobrante.
  · **El cursor con la lectura.** En la maqueta está parado en una fecha de
    ejemplo; en el sistema sigue al mouse y escribe la respuesta, que es la
    pregunta que el bloque contesta.

Al correrlo escribe libera.svg, que se pega dentro de <div class="graf">.
"""
import io, os
from datetime import date

INICIO, FIN = date(2026, 8, 31), date(2026, 9, 30)
DIAS = (FIN - INICIO).days                                   # 30
MES = ["ene", "feb", "mar", "abr", "may", "jun",
       "jul", "ago", "sep", "oct", "nov", "dic"]

HITOS = [
    (date(2026, 9, 25), ["PUN-03", "PUN-04"], "Punta de góndola"),
    (date(2026, 9, 27), ["PUN-17"],           "Punta de góndola"),
    (date(2026, 9, 29), ["EXP-01", "EXP-02"], "Exhibición de piso"),
]
BASE = 15
TEMP_INI, TEMP_FIN, TEMP = date(2026, 9, 19), date(2026, 9, 26), "Amor y Amistad"
LECTURA = date(2026, 9, 26)          # dónde queda parado el cursor en la maqueta

ANCHO = 994.0
X0, X1 = 8.0, 986.0
YE, ESCALA = 130.0, 12.0             # eje, y px por espacio libre


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def dm(d):
    return f"{d.day} {MES[d.month - 1]}"


def x(d):
    return X0 + (d - INICIO).days * (X1 - X0) / DIAS


def yof(n):
    return YE - (n - BASE + 2) * ESCALA


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


def escalon():
    pts, ser = [], niveles()
    for i, (d, n) in enumerate(ser):
        pts.append((x(d), yof(n)))
        if i + 1 < len(ser):
            pts.append((x(ser[i + 1][0]), yof(n)))
    pts.append((x(FIN), yof(ser[-1][1])))
    return pts


def poli(pts):
    return " ".join(f"{f(a)},{f(b)}" for a, b in pts)


def svg_a4():
    s = []
    a = s.append
    ser = niveles()
    pts = escalon()

    a(f'<text x="{f(X0)}" y="17" class="gRot">Espacios libres a lo largo del periodo</text>')

    # la temporada, detrás: explica por qué las tres entregas caen juntas
    a(f'<rect x="{f(x(TEMP_INI))}" y="30" width="{f(x(TEMP_FIN)-x(TEMP_INI))}" '
      f'height="{f(YE-30)}" class="vTempV"/>')
    a(f'<text x="{f((x(TEMP_INI)+x(TEMP_FIN))/2)}" y="41" class="gTempT">'
      f'{TEMP.upper()}</text>')

    a('<polygon points="' + poli([(X0, YE)] + pts + [(X1, YE)]) + '" class="vSuave"/>')
    a(f'<line x1="{f(X0)}" y1="{f(YE)}" x2="{f(X1)}" y2="{f(YE)}" class="gEje"/>')

    # peine: un diente por día, más largo cada cinco
    for i in range(DIAS + 1):
        d = date.fromordinal(INICIO.toordinal() + i)
        h = 5.0 if (i % 5 == 0 or i == DIAS) else 2.5
        a(f'<line x1="{f(x(d))}" y1="{f(YE)}" x2="{f(x(d))}" y2="{f(YE+h)}" class="vComb"/>')

    a('<polyline points="' + poli(pts) + '" class="gPaso"/>')
    for d, n in ser:
        a(f'<circle cx="{f(x(d))}" cy="{f(yof(n))}" r="3.4" class="gPto"/>')

    # la cifra de cada tramo, en vez de un eje vertical
    a(f'<text x="{f(X0+2)}" y="{f(yof(BASE)-10)}" class="gNum">{BASE}</text>')
    a(f'<text x="{f(X0+34)}" y="{f(yof(BASE)-10)}" class="gNota">'
      f'sin cambios durante {(HITOS[0][0]-INICIO).days} días</text>')
    # cada cifra arranca donde arranca su tramo: así queda pegada a su escalón
    # y no al medio de la meseta, donde chocaría con el cursor
    for i in range(1, len(ser)):
        n = ser[i][1]
        a(f'<text x="{f(x(ser[i][0]) + 7)}" y="{f(yof(n)-11)}" class="gNum">{n}</text>')

    # el cursor: la respuesta escrita
    lx, ly = x(LECTURA), yof(libres_en(LECTURA))
    a(f'<line x1="{f(lx)}" y1="26" x2="{f(lx)}" y2="{f(YE)}" class="vCruz"/>')
    a(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="6" class="vAnillo"/>')
    a(f'<text x="{f(lx)}" y="17" class="vCruzT" text-anchor="middle">'
      f'si arranca el {LECTURA.day} de {MES[LECTURA.month-1]} → '
      f'{libres_en(LECTURA)} libres</text>')

    # las fechas y, debajo, los códigos que entran en cada una
    a(f'<text x="{f(X0)}" y="{f(YE+22)}" class="gHoy">hoy · {dm(INICIO)}</text>')
    for d, _, _ in HITOS:
        a(f'<text x="{f(x(d))}" y="{f(YE+22)}" class="gFecha" '
          f'text-anchor="middle">{dm(d)}</text>')
    y0 = YE + 32
    for d, cods, _ in HITOS:
        cx = x(d)
        for j, cod in enumerate(cods):
            a(f'<rect x="{f(cx-28)}" y="{f(y0+j*24)}" width="56" height="20" '
              f'rx="2.5" class="gChip"/>')
            a(f'<text x="{f(cx)}" y="{f(y0+14.5+j*24)}" class="gCod" '
              f'text-anchor="middle">{cod}</text>')
    tipos, vistos = [], set()
    for _, cods, tipo in HITOS:
        pre = cods[0].split("-")[0]
        if pre not in vistos:
            vistos.add(pre)
            tipos.append((pre, tipo))
    for i, (pre, tipo) in enumerate(tipos):
        a(f'<text x="{f(X0)}" y="{f(y0+14+i*16)}" class="gTipo">'
          f'{pre} · {tipo.upper()}</text>')

    return "\n".join(s)


if __name__ == "__main__":
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "libera.svg")
    io.open(destino, "w", encoding="utf-8").write(svg_a4())
    print(f"libera.svg · viewBox 0 0 {ANCHO:.0f} 216")
