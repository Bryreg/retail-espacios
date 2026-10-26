"""Segunda versión de la página «Responsive (para aprobar)»: un solo diseño que se escala.

Reusa los ayudantes de resp_tableros.py (imagen, marco, tabla, tarjeta, «Así está hoy»)
y reemplaza los tableros de pantallas, el del sistema y el de validación.
Uso: python3 resp2_tableros.py <protocap> <aud> <salida_project> <canvas.json> <protocap-v1>
"""
import sys
from pathlib import Path

_src = open(Path(__file__).with_name("resp_tableros.py")).read()
exec(_src[:_src.index("SAL.mkdir(parents=True")])
V1 = Path(sys.argv[5])

ESCRITORIO = [("1024x768", 560 / 1024, "Tableta horizontal · 1024 × 768", "1rem = 14 px (piso de legibilidad)"),
              ("1366x768", 560 / 1366, "Portátil · 1366 × 768", "1rem = 14 px"),
              ("1920x1080", 560 / 1920, "Full HD · 1920 × 1080", "1rem = 18 px"),
              ("2560x1440", 560 / 2560, "Monitor 2K · 2560 × 1440", "1rem = 24 px")]
REACOMODA = [("390x844", .9, "Teléfono · 390 × 844", "Se reacomoda: barra de abajo, una columna, paneles como hojas."),
             ("768x1024", .742, "Tableta vertical · 768 × 1024", "Se reacomoda: riel lateral angosto, cifras 2 × 2.")]

PANTALLAS = [
    ("inicio", "RI1", "Inicio", "Qué hacer hoy, igual en cualquier pantalla.",
     ["Cuatro cifras en fila desde 1024 px; la cifra se achica sola si la tarjeta es angosta.",
      "Pendientes y actividad llenan el alto que queda: más filas a la vista en pantallas altas.",
      "En teléfono y tableta vertical las cifras van 2 × 2 y las listas en una columna."]),
    ("disponibilidad", "RI2", "Contratos · disponibilidad", "Elegir fechas y ver qué está libre.",
     ["El plano ocupa todo el ancho y alto que queda debajo de los filtros.",
      "La lista de libres va al costado desde 1280 px; antes, con el botón «Lista».",
      "En teléfono los filtros se pliegan en un resumen «01/11/2026 → 31/01/2027 · 92 días · Cambiar»."]),
    ("indicadores", "RI3", "Indicadores", "Resumen arriba, detalle en pestañas.",
     ["Los gráficos escalan con su tarjeta, rótulos incluidos; importes completos sin «M».",
      "La última fila de tarjetas crece hasta el borde de abajo.",
      "En teléfono y tableta vertical, una columna."]),
    ("montajes", "RI4", "Montajes", "Contratos y planogramas en una sola lista.",
     ["La tabla usa todo el ancho; el código no se parte («GON-01-PC4» en una línea).",
      "El detalle y la información llenan el alto que queda.",
      "Debajo de 768 px cada montaje es una tarjeta con estado, fecha y acción."]),
    ("plano2d", "RI5", "Plano 2D · editor", "El plano tiene prioridad sobre todo lo demás.",
     ["Catálogo, plano y propiedades en tres columnas que escalan juntas.",
      "Sólo debajo de 1280 px el catálogo pasa a cajón (botón «Catálogo»); debajo de 1024, también las propiedades.",
      "En teléfono el plano se arrastra con el dedo."]),
    ("plano2d-catalogo", "RI6", "Plano 2D · catálogo abierto", "El catálogo se abre encima, sin achicar el plano.",
     ["Cajón lateral en tableta; hoja desde abajo en teléfono.",
      "Se cierra con la ✕, con Esc o tocando fuera."]),
    ("plano2d-propiedades", "RI7", "Plano 2D · propiedades abiertas", "Las propiedades del mueble elegido.",
     ["Fijas a la derecha desde 1024 px y escalan con el resto.",
      "Debajo de 1024, cajón; controles de al menos 44 px."]),
    ("plano3d", "RI8", "Editor 3D", "La escena llena el espacio; nada la tapa.",
     ["El lienzo toma todo el alto disponible; el motor recalcula cámara y búfer al cambiar de tamaño.",
      "En teléfono la escena se arrastra y los paneles no la cubren hasta que se abren.",
      "El dibujo 3D es una ilustración; en el editor real los rótulos serán HTML."]),
    ("plano3d-propiedades", "RI9", "Editor 3D · propiedades", "Propiedades de la cara elegida.",
     ["Columna derecha desde 1024 px; hoja inferior debajo.",
      "La hoja deja ver la escena por encima."]),
    ("tarifas", "RI10", "Tarifas (ventana)", "Una ventana que siempre cabe.",
     ["Alto máximo 92dvh con desplazamiento interno; el ancho escala con la pantalla.",
      "En teléfono es una hoja desde abajo; cada fila de tarifa pasa a 2 columnas con rótulos.",
      "Ningún campo se corta (hoy se corta «80(» en teléfono)."]),
]
W_PANT, H_PANT = 2560, 1560


def tablero_pantalla(pag, nombre, titulo, sub, puntos):
    f1 = "".join(marco(PROTO / f"{t}-{pag}.png", *map(int, t.split("x")), e, et, r) for t, e, et, r in ESCRITORIO)
    f2 = "".join(marco(PROTO / f"{t}-{pag}.png", *map(int, t.split("x")), e, et, r) for t, e, et, r in REACOMODA)
    nota = (f'<div style="flex:1;align-self:stretch;display:flex;flex-direction:column;justify-content:center;gap:14px;'
            f'padding:32px 36px;background:#fff;border-radius:14px;font-size:19px;line-height:1.5;color:{GRIS}">'
            f'<b style="font-size:24px;color:{INK}">Arriba: el mismo diseño, cuatro pantallas</b>'
            '<span>Las cuatro capturas de arriba se muestran al mismo ancho. Si el diseño escala bien, se ven casi '
            'iguales: misma proporción de letra, mismos márgenes, el contenido llega a los bordes.</span>'
            '<span>Sólo la tableta horizontal queda un poco más densa: ahí la letra no baja de 14 px para que se pueda '
            'leer y tocar.</span>'
            f'<b style="font-size:24px;color:{INK};margin-top:10px">A la izquierda: cuando ya no entra</b>'
            '<span>Debajo de 1024 px de ancho el diseño de escritorio no cabe, y en vez de achicarse se reacomoda: '
            'riel lateral en tableta vertical, barra de abajo en teléfono.</span></div>')
    cuerpo = (cabecera(titulo, sub, puntos)
              + f'<div style="display:flex;gap:36px;align-items:flex-start">{f1}</div>'
              + f'<div style="display:flex;gap:44px;align-items:flex-start">{f2}{nota}</div>')
    return doc(f"{titulo} · responsive", W_PANT, H_PANT, cuerpo)


def tablero_sistema():
    regla = tabla([
        ["Escritorio y tableta horizontal (≥ 1024 px)", "1rem = el menor entre 1,0417 % del ancho y 1,6667 % del alto", "Piso 14 px · techo 26 px"],
        ["Tableta vertical (640–1023 px)", "1rem = 15 px", "Se reacomoda: riel lateral, cifras 2 × 2, una columna"],
        ["Teléfono (< 640 px)", "1rem = 15 px", "Se reacomoda: barra de abajo, hojas, tablas como tarjetas"],
    ], ["Pantalla", "Cómo se calcula el rem", "Límites / qué cambia"])
    por_tam = tabla([
        ["1024 × 768", "14 px", "14", "28", "30", "40 px"],
        ["1280 × 720", "14 px", "14", "28", "30", "40 px"],
        ["1366 × 768", "14 px", "14", "28", "30", "40 px"],
        ["1440 × 900", "15 px", "15", "30", "32", "40 px"],
        ["1920 × 1080", "18 px", "18", "36", "38", "45 px"],
        ["2560 × 1440", "24 px", "24", "48", "51", "60 px"],
        ["Teléfono / tableta vertical", "15 px", "15", "22,5 / 26", "22,5 / 28", "40 px (44 los principales)"],
    ], ["Pantalla", "1rem", "Texto", "Título", "Cifras", "Alto de botón"])
    escala = tabla([
        ["Texto · botones", "1rem"], ["Secundario · etiquetas · tablas", "0,9375rem"],
        ["Pies de dato", "0,875rem (nunca menos de 12 px)"], ["Título de sección", "1,3125rem"],
        ["Título de pantalla", "2rem"], ["Cifras de las tarjetas", "2,125rem, o menos si la tarjeta es angosta (14 % de su ancho)"],
        ["Márgenes · separación", "2rem · 1,25rem (1,5 / 1 en tableta vertical, 1 / 0,75 en teléfono)"],
        ["Controles", "2,75rem, nunca menos de 44 px (40 px los compactos)"],
    ], ["Uso", "Medida"])
    cuerpo = (cabecera("Un solo diseño que se escala",
                       "No hay un diseño por resolución. Todo —letra, márgenes, tarjetas, paneles, iconos— se mide en rem, y el rem sale del tamaño de la pantalla. Cambia la pantalla, cambia el rem, y todo crece o se achica junto.",
                       ["Sin ancho máximo: el contenido llega a los bordes.",
                        "La última fila de cada pantalla crece hasta abajo.",
                        "Sólo dos reacomodos: tableta vertical y teléfono.",
                        "En el editor, el catálogo pasa a cajón recién debajo de 1280 px."])
              + '<div style="display:flex;gap:24px;align-items:flex-start">' + tarjeta("La regla", regla) + tarjeta("Qué da en cada pantalla", por_tam) + '</div>'
              + '<div style="display:flex;gap:24px;align-items:flex-start">' + tarjeta("Escala (proporciones fijas del rem)", escala) + '</div>')
    return doc("Un solo diseño que se escala", 2560, 1180, cuerpo)


def tablero_antes():
    figs = ""
    for ruta, et, r in [(V1 / "2560x1440-inicio.png", "Antes · 2560 × 1440", "Letra de 15 px fija y ancho máximo: el contenido queda chico, con bandas vacías a los costados y la mitad de abajo sin usar."),
                        (PROTO / "2560x1440-inicio.png", "Ahora · 2560 × 1440", "El rem pasa a 24 px: todo crece en proporción, llega a los bordes y la lista de pendientes ocupa hasta abajo."),
                        (V1 / "1024x768-inicio.png", "Antes · 1024 × 768", "La letra quedaba relativamente grande y las cifras se partían."),
                        (PROTO / "1024x768-inicio.png", "Ahora · 1024 × 768", "El mismo diseño que en el portátil, con la cifra que se ajusta a su tarjeta.")]:
        w, h = (2560, 1440) if "2560" in str(ruta) else (1024, 768)
        figs += marco(ruta, w, h, 1180 / w, et, r)
    cuerpo = (cabecera("Antes y ahora", "Lo que marcaste: espacios vacíos y letra que no acompaña a la pantalla.",
                       ["Mismo contenido, mismas pantallas.", "Medido en el navegador, no a ojo (ver «Qué se probó»)."])
              + f'<div style="display:flex;flex-wrap:wrap;gap:30px 44px">{figs}</div>')
    return doc("Antes y ahora", 2500, 1990, cuerpo)


def tablero_validacion():
    datos = json.load(open(PROTO / "resultados.json"))
    tams = ["320x568", "375x667", "390x844", "844x390", "768x1024", "1024x768", "1024x1366",
            "1280x720", "1366x768", "1440x900", "1920x1080", "2560x1440"]
    idx = {(r["tam"], r["pagina"]): r for r in datos}
    filas = []
    for p in [x[0] for x in PANTALLAS]:
        celdas = [p]
        for t in tams:
            r = idx[(t, p)]
            ok = not r["desborde"] and not r["errores"] and r["solapes"] == 0 and r["controlesBajos"] == 0 and all(r["modalCabe"])
            celdas.append(f'<span style="color:{"#067647" if ok else "#B42318"};font-weight:700">{"✓" if ok else "✗"}</span>')
        filas.append(celdas)
    t1 = tabla(filas, ["Pantalla"] + [t.replace("x", " × ") for t in tams])
    escala = tabla([
        ["1024 × 768", "14,3 ‰ · 100 %", "13,7 ‰ · 100 %"],
        ["1280 × 720", "11,7 ‰ · 100 %", "10,9 ‰ · 100 %"],
        ["1366 × 768", "11,0 ‰ · 91–100 %", "10,2 ‰ · 100 %"],
        ["1440 × 900", "10,4 ‰ · 77–100 %", "10,4 ‰ · 96–100 %"],
        ["1920 × 1080", "7,8 ‰ · 64–100 %", "9,4 ‰ · 96–100 %"],
        ["2560 × 1440", "5,9 ‰ · 47–89 % (ancho usado 69 %)", "9,4 ‰ · 96–100 % (ancho usado 96 %)"],
    ], ["Pantalla", "Antes: letra ÷ ancho · alto usado", "Ahora: letra ÷ ancho · alto usado"])
    pend = tabla([
        ["Tableta horizontal más densa", "En 1024 × 768 la letra queda en 14 px (13,7 ‰ contra 9,4–10,9 ‰ en el resto) para no bajar de lo legible y tocable."],
        ["Rótulos dentro de dibujos SVG en teléfono", "El gráfico de barras y el 3D ilustrado bajan a 7,2 px en 320–390 px porque el dibujo entero se achica. En la app, los rótulos de gráficos y del plano tienen que ser de tamaño fijo en pantalla."],
        ["Prototipo, no la app", "Lo validado es el HTML del dibujo. La app hay que medirla otra vez, pantalla por pantalla, al implementar."],
        ["El 3D del prototipo es una ilustración", "El redimensionado real de WebGL sólo se midió en la app de hoy (funciona)."],
        ["Navegadores", "Sólo Chromium. Falta Safari de iPhone y Firefox."],
    ], ["Pendiente", "Detalle"])
    cuerpo = (cabecera("Qué se probó",
                       "120 combinaciones (10 pantallas × 12 tamaños) con un script de Playwright que mide cada página, y una medición aparte de la escala en las 6 pantallas de escritorio.",
                       ["0 páginas con scroll horizontal.", "0 ventanas que no caben.", "0 textos que se pisan.",
                        "0 controles de menos de 40 px.", "0 errores de consola.", "Letra mínima fuera de dibujos: 12 px."])
              + '<div style="display:flex;gap:24px;align-items:flex-start">'
              + tarjeta("Escala medida (Inicio, Indicadores, Montajes, Disponibilidad)", escala, 1000)
              + tarjeta("Resultado por pantalla y tamaño", t1) + '</div>'
              + tarjeta("Lo que queda pendiente", pend))
    return doc("Qué se probó", 2560, 1180, cuerpo)


SAL.mkdir(parents=True, exist_ok=True)
tableros = [("RS0", "Un solo diseño que se escala", tablero_sistema(), 2560, 1180),
            ("RS3", "Antes y ahora", tablero_antes(), 2500, 1990)]
for pag, nom, tit, sub, pts in PANTALLAS:
    tableros.append((nom, tit, tablero_pantalla(pag, nom, tit, sub, pts), W_PANT, H_PANT))
tableros += [("RS2", "Qué se probó", tablero_validacion(), 2560, 1180),
             ("RS1", "Así está hoy", tablero_hoy(), 3080, 1640)]

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
