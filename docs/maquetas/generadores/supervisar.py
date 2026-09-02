# -*- coding: utf-8 -*-
"""Pantalla Supervisar, con el mismo sistema que Vender.

Los datos son los de la sede desplegada, leídos de la tabla «Estado por
espacio» de retail-espacios.onrender.com. Los ocho contratos vigentes suman
exactamente $5.300.001, que es el canon que muestra el sistema: la tabla está
completa, no es una muestra.

Una salvedad honesta: los CÓDIGOS son los del plano de esta maqueta —que es un
layout sintético— y los CONTRATOS son los reales. Donde el código coincide
(PUN-03, PUN-04, PUN-17, EXP-01, EXP-02) no hay traducción; los tres activos
(RECAMIER, COCA COLA, COLOMBIANA DE COMERCIO) se colgaron de los tres muebles
que la maqueta tiene tomados.

Genera docs/maquetas/elegida-supervisar.html.
"""
import io, os, re
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))
HOY = date(2026, 8, 31)
MES = ["ene", "feb", "mar", "abr", "may", "jun",
       "jul", "ago", "sep", "oct", "nov", "dic"]

CARAS = 23
DIAS_PERIODO = 31
PERIODO = (date(2026, 8, 31), date(2026, 9, 30))

# código, tipo, proveedor, ¿montado?, desde, hasta, renta mensual
CONTRATOS = [
    ("PUN-03", "Punta de góndola",   "comercializadora nutresa", True,
     date(2026, 8, 25), date(2026, 9, 24),    800_000),
    ("PUN-04", "Punta de góndola",   "brayan", False,
     date(2026, 8, 27), date(2026, 9, 24),  1_000_000),
    ("PUN-17", "Punta de góndola",   "ALPINA", False,
     date(2026, 8, 26), date(2026, 9, 26),    800_000),
    ("EXP-01", "Exhibición de piso", "camilop", False,
     date(2026, 8, 29), date(2026, 9, 28),  1_000_000),
    ("EXP-02", "Exhibición de piso", "nutresa", False,
     date(2026, 8, 29), date(2026, 9, 28),    100_000),
    ("ISL-03", "Isla",               "RECAMIER", True,
     date(2026, 8, 13), date(2026, 10, 15),   400_000),
    ("BEB-01", "Nevera de bebidas",  "COCA COLA", False,
     date(2026, 8, 30), date(2026, 11, 30), 1_200_000),
    ("GON-60·A", "Góndola, por cara", "COLOMBIANA DE COMERCIO", False,
     date(2026, 1, 1), date(2026, 12, 31),          1),
]

# tipo → tarifa mensual de referencia, y los códigos libres de ese tipo
LIBRES = [
    ("Isla",               1_200_000, ["ISL-04", "ISL-05", "ISL-06"]),
    ("Punta de góndola",   1_150_000, ["PUN-05"]),
    ("Cabecera de caja",     850_000, ["CAR-01"]),
    ("Nevera de bebidas",    420_000, ["BEB-02", "BEB-03"]),
    ("Frutas y verduras",    380_000, ["FRU-01", "FRU-04", "FRU-05"]),
    ("Góndola, por cara",    230_000, ["GON-60·B", "GON-61·A", "GON-61·B",
                                       "GON-67·A", "GON-67·B"]),
]

CANON = sum(r for *_, r in CONTRATOS)
POR_VENCER = [c for c in CONTRATOS if (c[5] - HOY).days <= 30]
VENCE = sum(c[6] for c in POR_VENCER)
PCT_VENCE = round(VENCE * 100 / CANON)
SIN_MONTAR = [c for c in CONTRATOS if not c[3]]
CARAS_LIBRES = sum(len(cods) for _, _, cods in LIBRES)
SIN_ALQUILAR = sum(tar * len(cods) for _, tar, cods in LIBRES)
POR_DIA = round(SIN_ALQUILAR / DIAS_PERIODO)
OCUPADAS = len(CONTRATOS)
SELECCIONADO = "PUN-03"


def pesos(n):
    return f"${n:,}".replace(",", ".")


def dm(d):
    return f"{d.day} {MES[d.month - 1]}"


def dias(d):
    return (d - HOY).days


# ============================================================ [1] la franja
def franja():
    ocup = round(OCUPADAS * 100 / CARAS)
    return f'''<section class="t" style="height:118px;flex-shrink:0">
  <header><h2>NAVE</h2>
    <span class="sub">{dm(PERIODO[0])} → {dm(PERIODO[1])} 2026</span>
    <div class="der">{OCUPADAS} contratos · {CARAS} caras</div></header>
  <div class="franja">
    <div class="fnum">
      <span class="rotulo">Canon vigente</span>
      <b class="cifra">{pesos(CANON)}</b><i>al mes</i></div>
    <div class="fsep"></div>
    <div class="fnum">
      <span class="rotulo">Sin alquilar</span>
      <b class="cifra">{pesos(SIN_ALQUILAR)}</b>
      <i>al mes a tarifa · {CARAS_LIBRES} caras</i>
      <i class="tasa">{pesos(POR_DIA)} por día vacío</i></div>
    <div class="fsep"></div>
    <div class="fnum al">
      <span class="rotulo av">Vence en 30 días</span>
      <b class="cifra">{pesos(VENCE)}</b>
      <i>{PCT_VENCE}% del canon · {len(POR_VENCER)} espacios</i></div>
    <div class="fsep"></div>
    <div class="fnum">
      <span class="rotulo">Ocupación</span>
      <b class="cifra">{ocup}%</b><i>{OCUPADAS} de {CARAS} caras</i>
      <div class="barrita"><span style="width:{ocup}%"></span></div></div>
    <div class="fsep"></div>
    <div class="fnum">
      <span class="rotulo">Sin montar</span>
      <b class="cifra">{len(SIN_MONTAR)}</b><i>contratados y sin armar</i></div>
  </div>
</section>'''


# ============================================================== [2] el plano
def plano():
    svg = io.open(os.path.join(AQUI, "plano.svg"), encoding="utf-8").read()
    svg = svg.replace('rx="2" fill="#14181C" stroke="#14181C"',
                      'rx="2" fill="#FFFFFF" stroke="rgba(20,24,28,.13)"')
    svg = svg.replace('text-anchor="middle" fill="#FFFFFF" font-family="Archivo Narrow, sans-serif">PUN-05',
                      'text-anchor="middle" fill="#14181C" font-family="Archivo Narrow, sans-serif">PUN-05')
    for negro, verde in [("#4A555C", "#17A18C"), ("#2A333A", "#00786A"),
                         ("#191F24", "#005C51")]:
        svg = svg.replace(f'fill="{negro}"', f'fill="{verde}"')
    svg = svg.replace('stroke="#14181C"', 'stroke="#005C51"')

    # En Supervisar el plano no es un directorio: la tabla de al lado ya lista
    # los 23 códigos. Acá el plano UBICA, así que se queda sólo el rótulo de la
    # fila abierta. Además, a 700 px de ancho los 23 rótulos caían a 6,4 px
    # reales —ilegibles— y quitarlos deja espacio para agrandar el que importa.
    ROTULO = re.compile(
        r'<line[^>]*stroke="rgba\(20,24,28,\.34\)"[^>]*/>'
        r'<circle[^>]*fill="rgba\(20,24,28,\.55\)"[^>]*/>'
        r'<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="2"'
        r'[^>]*/>((?:<text[^>]*>[^<]*</text>)+)')
    texto = re.compile(r'<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)</text>')

    def f(v):
        return f"{v:.1f}".rstrip("0").rstrip(".")

    def quedarse(m):
        if SELECCIONADO not in m.group(5):
            return ""                      # los otros 22 rótulos se van
        # el que queda se agranda 1.7x sobre su propio centro, para que a 700 px
        # llegue al piso de la escala, y se pone en tinta
        K = 1.7
        x, y, w, h = map(float, m.group(1, 2, 3, 4))
        cx, cy = x + w / 2, y + h / 2
        nw, nh = w * K, h * K
        nx, ny = cx - nw / 2, cy - nh / 2

        def t(mt):
            ty, fs = float(mt.group(2)), float(mt.group(3))
            color = "#FFFFFF" if SELECCIONADO in mt.group(5) else "#F79E45"
            resto = re.sub(r'fill="#[0-9A-Fa-f]+"', f'fill="{color}"', mt.group(4))
            return (f'<text x="{f(cx)}" y="{f(ny + (ty - y) * K)}" '
                    f'font-size="{f(fs * K)}"{resto}>{mt.group(5)}</text>')

        return (f'<rect x="{f(nx)}" y="{f(ny)}" width="{f(nw)}" height="{f(nh)}" '
                f'rx="3" fill="#14181C" stroke="#14181C" stroke-width="1"/>'
                + texto.sub(t, m.group(5)))

    svg = ROTULO.sub(quedarse, svg)
    tomados = OCUPADAS - len(POR_VENCER)
    return f'''<section class="t" style="height:732px;flex-shrink:0">
  <header><h2>Piso de NAVE</h2>
    <div class="der clave">
      <span><i style="background:var(--libre)"></i>Libre <b>{CARAS_LIBRES}</b></span>
      <span><i style="background:var(--entra)"></i>Vence dentro <b>{len(POR_VENCER)}</b></span>
      <span><i style="background:var(--ocupado)"></i>Tomado <b>{tomados}</b></span>
    </div></header>
  <div class="lienzo">{svg}</div>
</section>'''


# ================================================== [3] estado por espacio
def filas():
    """Las 23 caras, las que piden acción primero."""
    f = []
    for cod, tipo, prov, montado, desde, hasta, renta in CONTRATOS:
        vence = (hasta - HOY).days <= 30
        f.append(dict(cod=cod, tipo=tipo, prov=prov,
                      estado="vence" if vence else "activo", montado=montado,
                      desde=desde, hasta=hasta, dias=dias(hasta), renta=renta,
                      orden=(0 if vence else 1, dias(hasta))))
    for tipo, tar, cods in LIBRES:
        for cod in cods:
            f.append(dict(cod=cod, tipo=tipo, prov=None, estado="libre",
                          montado=None, desde=None, hasta=None, dias=None,
                          renta=tar, orden=(2, cod)))
    return sorted(f, key=lambda r: r["orden"])


ETIQUETA = {"vence": "Por vencer", "activo": "Activo", "libre": "Libre"}


def tabla():
    """A todo el ancho hay lugar para el detalle completo: estado escrito,
    montaje, y el desde y el hasta en columnas separadas."""
    tr = []
    for r in filas():
        sel = " sel" if r["cod"] == SELECCIONADO else ""
        if r["estado"] == "libre":
            prov = mont = desde = hasta = dd = '<span class="vacio">—</span>'
            renta = f'<span class="tarifa">{pesos(r["renta"])}</span>'
        else:
            prov = r["prov"]
            mont = ('<span class="m-ok">Montado</span>' if r["montado"]
                    else '<span class="m-no">Pendiente</span>')
            desde, hasta = dm(r["desde"]), dm(r["hasta"])
            dd = f'{r["dias"]}<i>d</i>'
            renta = pesos(r["renta"])
        tr.append(f'''<tr class="e-{r["estado"]}{sel}"><td class="cod"><i class="pt"></i>{r["cod"]}</td>
      <td class="tip">{r["tipo"]}</td><td class="pro">{prov}</td>
      <td class="est"><span class="pin">{ETIQUETA[r["estado"]]}</span></td>
      <td class="mon">{mont}</td>
      <td class="fec cifra">{desde}</td><td class="fec cifra">{hasta}</td>
      <td class="dd cifra">{dd}</td><td class="ren cifra">{renta}</td></tr>''')
    return f'''<section class="t">
  <header><h2>Estado por espacio</h2>
    <span class="sub">NAVE · {CARAS} espacios</span>
    <div class="der filtros">
      <a href="#" class="on">Todas {CARAS}</a><a href="#">Por vencer {len(POR_VENCER)}</a>
      <a href="#">Sin montar {len(SIN_MONTAR)}</a><a href="#">Libres {CARAS_LIBRES}</a>
    </div></header>
  <div class="tablaWrap"><table class="esp">
    <thead><tr><th class="cod">Código</th><th class="tip">Tipo</th>
      <th>Proveedor</th><th class="est">Estado</th><th class="mon">Montaje</th>
      <th class="fec">Desde</th><th class="fec">Hasta</th>
      <th class="dd der2">Días</th><th class="ren der2">Renta / mes</th></tr></thead>
    <tbody>{"".join(tr)}</tbody>
  </table></div>
</section>'''


# ==================================================== [3b] para revisar
def atender():
    """Lo accionable, corto: lo que vence y lo que se cobra sin estar armado.
    La tabla de abajo es el libro entero; esto es la lista de tareas."""
    ven = []
    for cod, tipo, prov, _, _, hasta, _ in sorted(POR_VENCER, key=lambda c: c[5]):
        sel = " sel" if cod == SELECCIONADO else ""
        ven.append(f'''<a href="#" class="pfila{sel}">
        <span class="pdias">{dias(hasta)}<i>d</i></span>
        <span class="pcod">{cod}</span>
        <span class="pque">{prov}</span>
        <span class="pfecha cifra">{dm(hasta)}</span></a>''')
    mon = []
    for cod, _, prov, _, desde, _, _ in sorted(SIN_MONTAR, key=lambda c: c[4]):
        d = (HOY - desde).days
        # más de dos meses cobrando algo que nadie reportó armado deja de ser
        # un pendiente y pasa a ser un problema
        alarma = "" if d <= 60 else " grave"
        mon.append(f'''<a href="#" class="pfila">
        <span class="pdias sm{alarma}">{d}<i>d</i></span>
        <span class="pcod">{cod}</span>
        <span class="pque">{prov}</span>
        <span class="pfecha">sin montar</span></a>''')
    return f'''<section class="t" style="height:490px;flex-shrink:0">
  <header><h2>Para revisar</h2>
    <div class="der">{len(POR_VENCER) + len(SIN_MONTAR)}</div></header>
  <div class="pend">
    <div class="pgrupo">
      <div class="pcab"><span class="rotulo av">Por vencer en 30 días</span>
        <span class="pmonto cifra">{pesos(VENCE)}</span></div>
      {"".join(ven)}
    </div>
    <div class="pgrupo">
      <div class="pcab"><span class="rotulo">Contratado sin montar</span>
        <span class="pmonto">{len(SIN_MONTAR)}</span></div>
      {"".join(mon)}
    </div>
  </div>
</section>'''


# ========================================================= [4] los proveedores
def proveedores():
    """Agrupa la misma tabla por proveedor: quién se cae si no se renueva."""
    por = {}
    for _, _, prov, _, _, hasta, renta in CONTRATOS:
        p = por.setdefault(prov, {"canon": 0, "n": 0, "vence": False})
        p["canon"] += renta
        p["n"] += 1
        if (hasta - HOY).days <= 30:
            p["vence"] = True
    fil = []
    for nom, d in sorted(por.items(), key=lambda kv: -kv[1]["canon"]):
        marca = '<span class="pv">vence</span>' if d["vence"] else '<span></span>'
        fil.append(f'''<div class="qfila"><span class="qnom">{nom}</span>{marca}
        <span class="qcanon cifra">{pesos(d["canon"])}</span>
        <span class="qpct cifra">{round(d["canon"]*100/CANON)}%</span></div>''')
    return f'''<section class="t" style="height:232px;flex-shrink:0">
  <header><h2>Quién paga el canon</h2><div class="der">al mes</div></header>
  <div class="quien">{"".join(fil)}</div>
</section>'''


# =================================================================== la página
def pagina():
    css = io.open(os.path.join(AQUI, "sistema.css"), encoding="utf-8").read()
    return f'''<!-- Supervisar. «Estado por espacio» pasa a ser el panel principal: la
     lista de pendientes era un filtro de esta tabla, así que se unificaron.
     Datos reales de la sede desplegada; los ocho contratos suman el canon
     exacto. Lo genera generadores/supervisar.py. -->
<meta charset="utf-8">
<title>RECABRA · NAVE · Supervisar</title>
<link rel="stylesheet" href="fuentes/tipos.css">
<style>{css}
/* esta pantalla es larga: la tabla completa va debajo del plano */
html,body{{height:auto;overflow:visible}}</style>
<div class="barra">
 <div class="marca"><b>RECABRA</b><span>Galerías</span></div>
 <div class="sede"><span class="rot">Sede</span><span class="val">NAVE</span>
   <span class="cnt">de 7</span></div>
 <nav class="modos"><a href="#">Vender</a><a href="#" class="on">Supervisar</a></nav>
 <div class="fecha"><span class="dia">lunes 31 de agosto de 2026</span></div>
</div>
<div class="hoja larga">
  {franja()}
  <div class="fila" style="margin:10px 0">
    <div class="col" style="width:1024px">{plano()}</div>
    <div class="col" style="width:382px">{atender()}{proveedores()}</div>
  </div>
  {tabla()}
</div>'''


if __name__ == "__main__":
    io.open(os.path.join(AQUI, "..", "elegida-supervisar.html"), "w",
            encoding="utf-8").write(pagina())
    print("elegida-supervisar.html · canon", pesos(CANON),
          "· vence", pesos(VENCE), f"({PCT_VENCE}%) · sin montar", len(SIN_MONTAR))
