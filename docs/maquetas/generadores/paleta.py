# -*- coding: utf-8 -*-
"""Antes y después del gris del plano, y por qué había que cambiarlo.

Dibuja los cuatro estados del mapa de la sede como prismas isométricos —con el
mismo darken() que usa DashboardView para las caras y el contorno— y repite las
dos filas pasadas por una simulación de deuteranopía. La cuenta la hace el
validador; esto es para verlo.

Genera docs/maquetas/paleta-plano.html.
"""
import io, os

AQUI = os.path.dirname(os.path.abspath(__file__))

# libre, parcial, tomado — no cambian. Lo que cambia es el cuarto.
LIBRE, TOMADO = "#4CC38A", "#D93A3A"
PARCIAL_ANTES, PARCIAL_DESPUES = "#F0B429", "#F08519"
CUERPO = "#CBD5E1"
GRIS_ANTES, GRIS_DESPUES = "#94A3B8", "#DCE2E8"

def estados(parcial):
    return [("Libre todo el periodo",   LIBRE,   True),
            ("Libre parte del periodo", parcial, True),
            ("Tomado",                  TOMADO,  True),
            ("No comercializable",      None,    False)]   # toma el gris de la fila


def darken(hexa, amt):
    n = int(hexa.lstrip("#"), 16)
    r = round(((n >> 16) & 255) * (1 - amt))
    g = round(((n >> 8) & 255) * (1 - amt))
    b = round((n & 255) * (1 - amt))
    return f"rgb({r},{g},{b})"


def prisma(x, y, tapa, cuerpo, contorno, w=64, d=34, alto=26):
    """Un prisma isométrico simple: tapa, cara izquierda y cara derecha."""
    hx, hy = w / 2, d / 2
    T = [(x, y - hy), (x + hx, y), (x, y + hy), (x - hx, y)]
    def p(pts): return " ".join(f"{a:.1f},{b:.1f}" for a, b in pts)
    izq = [T[3], T[2], (T[2][0], T[2][1] + alto), (T[3][0], T[3][1] + alto)]
    der = [T[2], T[1], (T[1][0], T[1][1] + alto), (T[2][0], T[2][1] + alto)]
    return (f'<polygon points="{p(izq)}" fill="{darken(cuerpo,.14)}" stroke="{contorno}" stroke-width="1"/>'
            f'<polygon points="{p(der)}" fill="{darken(cuerpo,.26)}" stroke="{contorno}" stroke-width="1"/>'
            f'<polygon points="{p(T)}" fill="{tapa}" stroke="{contorno}" stroke-width="1"/>')


def fila(gris, parcial, filtro=""):
    s, x = [], 60.0
    for etq, color, vendible in estados(parcial):
        tapa = color if vendible else gris
        cuerpo = CUERPO if vendible else gris
        contorno = "#8FA0B4" if vendible else darken(gris, .42)
        s.append(prisma(x, 40, tapa, cuerpo, contorno))
        s.append(f'<text x="{x:.0f}" y="102" class="et">{etq}</text>')
        x += 132
    return (f'<svg viewBox="0 0 590 116" width="590" height="116"{filtro}>'
            + "".join(s) + "</svg>")


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#EFF1F1;color:#14181C;font-family:'Chivo',system-ui,sans-serif;
  font-size:13px;-webkit-font-smoothing:antialiased;padding:34px 40px 60px}
h1{font-family:'Archivo Narrow';font-weight:700;font-size:26px;letter-spacing:-.01em}
.intro{margin:8px 0 26px;max-width:660px;line-height:1.55;color:#4A5459}
.par{display:flex;gap:14px;margin-bottom:14px}
.caja{background:#fff;border:1px solid #DEE2E3;border-radius:3px;padding:14px 16px 10px;
  width:626px}
.caja h2{font-size:14.5px;font-weight:700;margin-bottom:2px}
.caja .q{font-size:12px;color:#6B7479;margin-bottom:8px}
.caja.mal{border-color:#E7C3C9}
.caja.mal h2{color:#8E1226}
.et{font-family:'Archivo Narrow';font-weight:600;font-size:10px;letter-spacing:.07em;
  text-transform:uppercase;fill:#6B7479;text-anchor:middle}
.rot{font-family:'Archivo Narrow';font-weight:600;font-size:9.5px;letter-spacing:.11em;
  text-transform:uppercase;color:#6B7479;margin:14px 0 6px;display:block}
table{border-collapse:collapse;margin-top:24px;font-variant-numeric:tabular-nums}
th{font-family:'Archivo Narrow';font-weight:600;font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:#6B7479;text-align:left;padding:0 20px 5px 0;
  border-bottom:1px solid #DEE2E3}
td{padding:5px 20px 5px 0;border-bottom:1px solid #EEF1F1;font-size:13px}
.mal2{color:#8E1226;font-weight:700}
.bien{color:#00786A;font-weight:700}
"""

FILTRO = '''<svg width="0" height="0" style="position:absolute">
  <filter id="deuteranopia" color-interpolation-filters="linearRGB">
    <feColorMatrix type="matrix" values="
      0.625 0.375 0 0 0
      0.700 0.300 0 0 0
      0     0.300 0.7 0 0
      0     0     0   1 0"/>
  </filter>
</svg>'''

HTML = f"""<meta charset="utf-8">
<title>RECABRA · El gris del plano, antes y después</title>
<link rel="stylesheet" href="fuentes/tipos.css">
<style>{CSS}</style>
{FILTRO}
<h1>Los colores del plano, antes y después</h1>
<p class="intro">Los cuatro colores del mapa de la sede, dibujados como los dibuja
el sistema: tapa, dos caras oscurecidas y contorno. Abajo, las mismas dos filas
vistas por un ojo con deuteranopía —cerca del 6&nbsp;% de los hombres—. Lo que
cambian son dos valores: el gris de «no comercializable», que no se separaba
del verde, y el ámbar de «libre parte del periodo», que tiraba a amarillo y se
leía como una advertencia en vez de como un estado intermedio.</p>

<span class="rot">Como se ve normalmente</span>
<div class="par">
  <div class="caja mal"><h2>Antes · gris #94A3B8 · ámbar #F0B429</h2>
    <p class="q">El gris es la mayor parte del plano.</p>{fila(GRIS_ANTES, PARCIAL_ANTES)}</div>
  <div class="caja"><h2>Después · gris #DCE2E8 · naranja #F08519</h2>
    <p class="q">La infraestructura se va al fondo y el color queda para lo que se vende.</p>{fila(GRIS_DESPUES, PARCIAL_DESPUES)}</div>
</div>

<span class="rot">Con deuteranopía</span>
<div class="par">
  <div class="caja mal"><h2>Antes</h2>
    <p class="q">«Libre» y «no comercializable» quedan casi en el mismo bloque.</p>{fila(GRIS_ANTES, PARCIAL_ANTES, ' filter="url(#deuteranopia)"')}</div>
  <div class="caja"><h2>Después</h2>
    <p class="q">Lo vendible se separa de lo que ni siquiera se alquila.</p>{fila(GRIS_DESPUES, PARCIAL_DESPUES, ' filter="url(#deuteranopia)"')}</div>
</div>

<table>
  <thead><tr><th>Par</th><th>Antes</th><th>Después</th><th>Piso</th></tr></thead>
  <tbody>
    <tr><td>libre ↔ no comercializable · peor caso daltónico</td>
        <td class="mal2">ΔE 8.0</td><td class="bien">ΔE 15.9</td><td>≥ 8</td></tr>
    <tr><td>libre ↔ no comercializable · visión normal</td>
        <td class="mal2">ΔE 14.7</td><td class="bien">ΔE 22.2</td><td>≥ 15</td></tr>
    <tr><td>peor par de los cuatro · daltónico</td>
        <td class="mal2">ΔE 8.0</td><td class="bien">ΔE 10.8</td><td>≥ 8</td></tr>
    <tr><td>peor par de los cuatro · visión normal</td>
        <td class="mal2">ΔE 14.7</td><td class="bien">ΔE 16.7</td><td>≥ 15</td></tr>
  </tbody>
</table>
"""

if __name__ == "__main__":
    io.open(os.path.join(AQUI, "..", "paleta-plano.html"), "w",
            encoding="utf-8").write(HTML)
    print("paleta-plano.html ·", len(HTML), "bytes")
