"""Tableros del lienzo para la página «Responsive (para aprobar)».

Lee las capturas del prototipo (verif18/protocap) y de la app de hoy
(verif18/aud) y escribe un .dc.html por tablero, con las imágenes embebidas.
Uso: python3 resp_tableros.py <protocap> <aud> <salida_project> <canvas.json>
"""
import base64, io, json, sys, html
from pathlib import Path
from PIL import Image

PROTO, AUD, SAL, CANVAS = (Path(a) for a in sys.argv[1:5])
INK, AZUL, GRIS, FONDO = "#0F172A", "#1570EF", "#475467", "#E4E7EC"


def img(ruta, ancho, alto):
    im = Image.open(ruta).convert("RGB")
    im = im.resize((ancho * 2 if ancho * 2 <= im.width else im.width,
                    round(im.height * (min(ancho * 2, im.width) / im.width))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=80, optimize=True)
    return (f'<img src="data:image/jpeg;base64,{base64.b64encode(b.getvalue()).decode()}" '
            f'style="display:block;width:{ancho}px;height:{alto}px;border-radius:6px;'
            f'box-shadow:0 1px 3px rgba(16,24,40,.12),0 0 0 1px rgba(16,24,40,.08);background:#fff" alt="">')


def marco(ruta, w, h, escala, etiqueta, regla):
    ancho, alto = round(w * escala), round(h * escala)
    return (f'<figure style="margin:0;display:flex;flex-direction:column;gap:8px;width:{max(ancho, 300)}px">'
            f'<figcaption style="display:flex;flex-direction:column;gap:2px">'
            f'<b style="font-size:17px">{etiqueta}</b>'
            f'<span style="font-size:14px;color:{GRIS};line-height:1.35">{regla}</span></figcaption>'
            f'{img(ruta, ancho, alto)}</figure>')


def doc(titulo, w, h, cuerpo):
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{html.escape(titulo)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{{margin:0}}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; box-sizing: border-box; background: {FONDO}; font-family: Inter, system-ui, sans-serif; color: {INK}; position: relative; overflow: hidden; padding: 36px 44px; display: flex; flex-direction: column; gap: 22px;">
{cuerpo}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


def cabecera(titulo, sub, puntos):
    li = "".join(f'<li style="margin:0 0 4px">{p}</li>' for p in puntos)
    return (f'<div style="display:flex;gap:48px;align-items:flex-start">'
            f'<div style="flex:0 0 640px"><h1 style="margin:0 0 6px;font-size:30px;font-weight:700">{titulo}</h1>'
            f'<p style="margin:0;font-size:17px;color:{GRIS};line-height:1.4">{sub}</p></div>'
            f'<ul style="margin:4px 0 0;padding-left:20px;font-size:16px;line-height:1.45;columns:2;column-gap:40px;flex:1">{li}</ul></div>')


FILA1 = [("390x844", .9, "Teléfono · 390 × 844", "Barra de abajo con 5 accesos; paneles como hojas."),
         ("768x1024", .742, "Tableta vertical · 768 × 1024", "Riel lateral compacto con nombres."),
         ("1366x768", .9, "Portátil · 1366 × 768", "Menú lateral; paneles secundarios en cajón.")]
FILA2 = [("320x568", 1.0, "Teléfono chico · 320 × 568", "Lo mínimo: sin nombre de persona."),
         ("1024x768", .74, "Tableta horizontal · 1024 × 768", "Menú lateral completo."),
         ("2560x1440", .3945, "Monitor grande · 2560 × 1440", "Contenido con ancho máximo; no se estira.")]

PANTALLAS = [
    ("inicio", "RI1", "Inicio", "Qué hacer hoy, en cualquier pantalla.",
     ["Tarjetas de cifras: 4 en fila, 2 × 2 o 1 por fila según el ancho (auto-fit, mínimo 15rem).",
      "Las listas de pendientes pasan a una columna debajo de 64rem.",
      "En teléfono el buscador ocupa todo el ancho y el menú va abajo."]),
    ("disponibilidad", "RI2", "Contratos · disponibilidad", "Elegir fechas y ver qué está libre.",
     ["En teléfono los filtros se pliegan en un resumen «01/11/2026 → 31/01/2027 · 92 días · Cambiar».",
      "El plano se puede arrastrar; la lista va debajo.",
      "Debajo de 48rem la tabla se vuelve tarjetas de registro."]),
    ("indicadores", "RI3", "Indicadores", "Resumen arriba, detalle en pestañas.",
     ["Cifras con escala fluida (24–34 px), importes completos sin «M».",
      "Los gráficos ocupan el ancho disponible; dos columnas se vuelven una debajo de 64rem.",
      "Las pestañas de detalle se desplazan en horizontal si no caben."]),
    ("montajes", "RI4", "Montajes", "Contratos y planogramas en una sola lista.",
     ["Tabla con la columna del código fija y sin cortes («GON-01-PC4» en una línea).",
      "Debajo de 48rem, cada montaje es una tarjeta con estado, fecha y acción.",
      "En monitor grande la lista no pasa de 100rem de ancho."]),
    ("plano2d", "RI5", "Plano 2D · editor", "El plano tiene prioridad sobre todo lo demás.",
     ["Catálogo en cajón debajo de 90rem; propiedades en cajón debajo de 80rem.",
      "Barra de herramientas compacta encima del plano; zoom abajo a la derecha.",
      "En teléfono el plano es arrastrable y los botones «Catálogo» y «Propiedades» abren hojas."]),
    ("plano2d-catalogo", "RI6", "Plano 2D · catálogo abierto", "El catálogo se abre encima, sin achicar el plano.",
     ["Cajón lateral en portátil y tableta; hoja desde abajo en teléfono.",
      "Se cierra con la ✕, con Esc o tocando fuera."]),
    ("plano2d-propiedades", "RI7", "Plano 2D · propiedades abiertas", "Las propiedades del mueble elegido.",
     ["Fijas a la derecha desde 80rem (1280 px); antes, cajón.",
      "Campos a una columna en cajón; controles de 44 px."]),
    ("plano3d", "RI8", "Editor 3D", "La escena llena el espacio; nada la tapa.",
     ["El lienzo se redimensiona con el contenedor (el motor ya recalcula cámara y búfer).",
      "En teléfono la escena se arrastra; los paneles no la cubren hasta que se abren.",
      "El dibujo 3D es una ilustración; en el editor real los rótulos serán HTML."]),
    ("plano3d-propiedades", "RI9", "Editor 3D · propiedades", "Propiedades de la cara elegida.",
     ["Columna derecha en escritorio; hoja inferior debajo de 64rem.",
      "La hoja deja ver la escena por encima."]),
    ("tarifas", "RI10", "Tarifas (ventana)", "Una ventana que siempre cabe.",
     ["Alto máximo 92dvh con desplazamiento interno; botones siempre visibles abajo.",
      "En teléfono es una hoja desde abajo; cada fila de tarifa pasa a 2 columnas con rótulos.",
      "Ningún campo se corta (hoy se corta «80(» en teléfono)."]),
]

ALTO_F1, ALTO_F2 = 760, 568
W_PANT, H_PANT = 2400, 1660


def tablero_pantalla(pag, nombre, titulo, sub, puntos):
    f1 = "".join(marco(PROTO / f"{t}-{pag}.png", *map(int, t.split("x")), e, et, r) for t, e, et, r in FILA1)
    f2 = "".join(marco(PROTO / f"{t}-{pag}.png", *map(int, t.split("x")), e, et, r) for t, e, et, r in FILA2)
    cuerpo = (cabecera(titulo, sub, puntos)
              + f'<div style="display:flex;gap:44px;align-items:flex-start">{f1}</div>'
              + f'<div style="display:flex;gap:44px;align-items:flex-start">{f2}</div>')
    return doc(f"{titulo} · responsive", W_PANT, H_PANT, cuerpo)


def tabla(filas, cab):
    th = "".join(f'<th style="text-align:left;padding:10px 14px;font-size:14px;color:{GRIS};font-weight:600;border-bottom:1px solid #D0D5DD">{c}</th>' for c in cab)
    tr = "".join("<tr>" + "".join(f'<td style="padding:10px 14px;font-size:16px;border-bottom:1px solid #EAECF0;vertical-align:top">{c}</td>' for c in f) + "</tr>" for f in filas)
    return f'<table style="border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;width:100%"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def tarjeta(t, contenido, ancho=None):
    w = f"width:{ancho}px;" if ancho else "flex:1;"
    return (f'<section style="{w}background:#fff;border-radius:14px;padding:22px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgba(16,24,40,.06)">'
            f'<h2 style="margin:0;font-size:20px;font-weight:650">{t}</h2>{contenido}</section>')


def tablero_sistema():
    cortes = tabla([
        ["≥ 100rem (1600 px)", "Menú lateral de 16rem; contenido hasta 100rem, centrado"],
        ["90–100rem", "Menú lateral; catálogo y propiedades del editor fijos"],
        ["80–90rem (1280–1439)", "El catálogo del editor pasa a cajón"],
        ["64–80rem (1024–1279)", "También las propiedades pasan a cajón; se oculta el nombre de la persona"],
        ["40–64rem (640–1023)", "Riel lateral de 5,5rem con nombres; dos columnas → una; propiedades 3D como hoja"],
        ["30–48rem (… –767)", "Tablas → tarjetas de registro; filas de tarifas a 2 columnas con rótulos"],
        ["< 40rem (< 640)", "Teléfono: barra de abajo, «Menú», filtros plegados, ventanas como hojas"],
        ["< 22,5rem (< 360)", "Teléfono chico: se oculta la persona"],
    ], ["Ancho", "Qué cambia"])
    letra = tabla([
        ["Texto", "14 → 15 px", "clamp(.875rem, .84rem + .12vw, .9375rem)"],
        ["Rótulos de campo", "13 → 14 px", "clamp(.8125rem, .8rem + .06vw, .875rem)"],
        ["Botones", "14 → 15 px", "clamp(.875rem, .86rem + .06vw, .9375rem)"],
        ["Secundario / tablas", "13 px", ".8125rem"],
        ["Título de sección", "17 → 22 px", "clamp(1.0625rem, .95rem + .45vw, 1.375rem)"],
        ["Título de página", "22 → 32 px", "clamp(1.375rem, 1.1rem + 1.1vw, 2rem)"],
        ["Cifras grandes", "24 → 34 px", "clamp(1.5rem, 1.2rem + 1.1vw, 2.125rem)"],
        ["Mínimo absoluto", "12 px", "notas y fechas chicas; nada por debajo"],
    ], ["Uso", "Tamaño", "Token"])
    espacio = tabla([
        ["--s1 … --s10", "4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 px"],
        ["--pad-page", "16 → 32 px fluido: clamp(1rem, .6rem + 1.6vw, 2rem)"],
        ["--ctl", "44 px de alto en controles (40 px los compactos de tablas)"],
        ["Toques", "44 × 44 px mínimos en teléfono"],
        ["Rejillas", "auto-fit + minmax(min(100%, Xrem), 1fr) — no hace falta un corte por cada tarjeta"],
        ["Hijos flex/grid", "min-width: 0 siempre; los textos largos hacen salto o se acortan con «…» y tooltip"],
        ["Alto de app", "100dvh (la barra del navegador del teléfono no tapa nada)"],
    ], ["Token", "Valor"])
    cuerpo = (cabecera("Cómo se adapta: cortes, letra y espacio",
                       "Los cortes salen del contenido, no de modelos de teléfono. Todo en rem: si la persona agranda la letra del navegador, la interfaz acompaña.",
                       ["Un solo archivo de tokens (tema.css) con la escala fluida.",
                        "Nada de anchos fijos en px para contenedores.",
                        "La acción principal sigue siendo una por zona.",
                        "Prioridad al área de trabajo en el editor 2D y 3D."])
              + '<div style="display:flex;gap:24px;align-items:flex-start">'
              + tarjeta("Cortes", cortes) + tarjeta("Escala de letra", letra) + '</div>'
              + '<div style="display:flex;gap:24px;align-items:flex-start">' + tarjeta("Espacio y controles", espacio) + '</div>')
    return doc("Sistema responsive", 2400, 1080, cuerpo)


HALLAZGOS = [
    ("390x844", "4-plano", "Plano 2D en teléfono", "La barra y los filtros se comen el alto; el plano queda chico. 14 controles de menos de 32 px."),
    ("390x844", "5-editor3d", "Editor 3D en teléfono", "El catálogo ocupa ~55 % del ancho; el lienzo 3D queda en 180 px. Rótulos de 9,5–10 px."),
    ("390x844", "6-tarifas-modal", "Tarifas en teléfono", "Columnas recortadas sin desplazamiento: el campo muestra «80(». 34 controles chicos."),
    ("390x844", "1-sede-vender", "Vender en teléfono", "Los rótulos del mapa se pisan; el gráfico «Cuándo se libera» se corta («BLACK FRI»)."),
    ("768x1024", "3-montajes", "Montajes en tableta", "Los códigos se parten mal («GON-01-↵PC4»)."),
    ("2560x1440", "3-montajes", "Montajes en monitor grande", "Sin ancho máximo: una sola columna enorme."),
    ("2560x1440", "4-plano", "Plano en monitor grande", "Queda al 100 % de zoom con mucho espacio vacío."),
    ("2560x1440", "6-tarifas-modal", "Tarifas en monitor grande", "77 controles de menos de 32 px; letra de 9,5 px."),
]


def tablero_hoy():
    figs = []
    for t, p, et, txt in HALLAZGOS:
        w, h = map(int, t.split("x"))
        e = (700 / h) if h > w else .38
        figs.append(marco(AUD / f"{t}-{p}.png", w, h, e, et, txt))
    fila1 = "".join(figs[:5]); fila2 = "".join(figs[5:])
    cuerpo = (cabecera("Así está hoy: auditoría de la app real",
                       "Medido en el navegador con la app levantada en local (base de prueba), en los 10 tamaños pedidos y 7 pantallas: 70 combinaciones.",
                       ["Ninguna pantalla desborda en horizontal: no hay scroll lateral de página.",
                        "El 3D sí se redimensiona bien (búfer = tamaño CSS en 1440 → 768 → 390 → 1920).",
                        "Configuración da errores 403 en consola (pide datos sólo del dueño a un admin).",
                        "Mucho estilo en línea: 1203 «style={{…}}» en 70 archivos; el cambio va por tokens."])
              + f'<div style="display:flex;gap:40px;align-items:flex-start">{fila1}</div>'
              + f'<div style="display:flex;gap:40px;align-items:flex-start">{fila2}</div>')
    return doc("Así está hoy", 3080, 1640, cuerpo)


def tablero_validacion():
    datos = json.load(open(PROTO / "resultados.json"))
    tams = ["320x568", "375x667", "390x844", "844x390", "768x1024", "1024x768", "1024x1366",
            "1280x720", "1366x768", "1440x900", "1920x1080", "2560x1440"]
    pags = [p[0] for p in PANTALLAS]
    idx = {(r["tam"], r["pagina"]): r for r in datos}
    filas = []
    for p in pags:
        celdas = [p]
        for t in tams:
            r = idx[(t, p)]
            ok = not r["desborde"] and not r["errores"] and r["solapes"] == 0 and r["controlesBajos"] == 0 \
                and all(r["modalCabe"])
            celdas.append(f'<span style="color:{"#067647" if ok else "#B42318"};font-weight:700">{"✓" if ok else "✗"}</span>')
        filas.append(celdas)
    t1 = tabla(filas, ["Pantalla"] + [t.replace("x", " × ") for t in tams])
    pend = tabla([
        ["Rótulos dentro de dibujos SVG (plano, gráficos, 3D ilustrado)", "Bajan a 7,2–11 px porque el dibujo entero se achica. En la app, los rótulos del plano tienen que contra-escalar con el zoom para no bajar de 11–12 px."],
        ["El 3D del prototipo es una ilustración", "El redimensionado real de WebGL sólo se midió en la app de hoy (funciona). Hay que volver a medirlo con el editor nuevo."],
        ["Prototipo, no la app", "Lo validado es el HTML estático del dibujo. La app hay que medirla otra vez, pantalla por pantalla, al implementar."],
        ["Teléfono horizontal (844 × 390)", "Pasa las pruebas pero el plano queda con poco alto; conviene ocultar la barra de abajo al editar."],
        ["Navegadores", "Sólo Chromium. Falta Safari de iPhone (100dvh, hojas inferiores) y Firefox."],
    ], ["Pendiente", "Detalle"])
    cuerpo = (cabecera("Qué se probó en el prototipo",
                       "120 combinaciones (10 pantallas × 12 tamaños) con un script de Playwright que mide cada página.",
                       ["0 páginas con scroll horizontal.", "0 ventanas que no caben.",
                        "0 textos que se pisan.", "0 controles de menos de 40 px.",
                        "0 errores de consola.", "Letra mínima fuera de dibujos: 12 px."])
              + tarjeta("Resultado por pantalla y tamaño", t1)
              + tarjeta("Lo que queda pendiente (dicho sin maquillar)", pend))
    return doc("Qué se probó", 2400, 1080, cuerpo)


SAL.mkdir(parents=True, exist_ok=True)
tableros = [("RS0", "Cómo se adapta", tablero_sistema(), 2400, 1080),
            ("RS1", "Así está hoy", tablero_hoy(), 3080, 1640)]
for pag, nom, tit, sub, pts in PANTALLAS:
    tableros.append((nom, tit, tablero_pantalla(pag, nom, tit, sub, pts), W_PANT, H_PANT))
tableros.append(("RS2", "Qué se probó", tablero_validacion(), 2400, 1080))

c = json.load(open(CANVAS))
if not any(p["id"] == "responsive" for p in c["pages"]):
    c["pages"].append({"id": "responsive", "name": "Responsive (para aprobar)"})
y = 0
for nom, tit, contenido, w, h in tableros:
    (SAL / f"{nom}.dc.html").write_text(contenido)
    clave = f"{nom}.dc.html"
    c["boards"][clave] = {"x": 0, "y": y, "w": w, "h": h, "title": tit, "page": "responsive"}
    if clave not in c["order"]:
        c["order"].append(clave)
    y += h + 160
    print(clave, round(len(contenido) / 1e6, 2), "MB")
json.dump(c, open(CANVAS, "w"), ensure_ascii=False, indent=1)
