"""Tablero FV10 «El plano con más espacio»: antes y ahora del editor 2D, con lo medido.

Uso: python3 plano_tablero.py <final> <salida_project> <canvas.json>
"""
import json, sys
from pathlib import Path

FIN, SAL, CANVAS = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
_src = open(Path(__file__).with_name("resp_tableros.py")).read()
sys.argv = [sys.argv[0], str(FIN / "protocap"), str(FIN / "protocap"), str(SAL), str(CANVAS)]
exec(_src[:_src.index("SAL.mkdir(parents=True")])
CAP = FIN / "protocap"
antes = json.load(open(FIN / "plano2d-antes.json"))
r = {(x["tam"], x["pagina"]): x for x in json.load(open(CAP / "resultados.json"))}

fila1 = (marco(FIN / "antes/1440x900-plano2d.png", 1440, 900, .78, "Antes · 1440 × 900", "El plano ocupaba el 30 % de la pantalla: menú ancho, cabecera alta, catálogo y leyenda fuera del plano.")
         + marco(CAP / "1440x900-plano2d.png", 1440, 900, .78, "Ahora · 1440 × 900", "59 % con un mueble elegido; 74 % sin elegir. Las herramientas, el zoom y la leyenda flotan sobre el plano."))
fila2 = (marco(CAP / "1440x900-plano2d-completa.png", 1440, 900, .78, "Pantalla completa", "85 %: sólo el plano, la tira de muebles y las herramientas. Las propiedades se abren con su botón.")
         + marco(CAP / "390x844-plano2d.png", 390, 844, .83, "Teléfono", "62 %: el plano se arrastra; la tira de muebles va abajo.")
         + marco(CAP / "1024x768-plano2d-libre.png", 1024, 768, .55, "Tableta horizontal", "66 % sin elegir; las herramientas quedan como íconos."))
filas = []
for t in ["1024x768", "1280x720", "1366x768", "1440x900", "1920x1080", "2560x1440", "768x1024", "390x844"]:
    a = antes[t][0][0]
    ahora = [r[(t, p)]["areaTrabajo"][0] for p in ("plano2d", "plano2d-libre", "plano2d-completa")]
    filas.append([t.replace("x", " × "), f"{a} %", f"{ahora[0]} %", f"{ahora[1]} %", f"{ahora[2]} %", f'{antes[t][1]:g} → {r[(t, "plano2d-libre")]["minFuente"]:g} px'])
med = tabla(filas, ["Pantalla", "Antes", "Ahora · mueble elegido", "Ahora · sin elegir", "Pantalla completa", "Rótulo más chico del plano"])
cambios = tabla([
    ["Menú", "Pasa a riel angosto con nombres (4,75rem) sólo en el editor del plano"],
    ["Cabecera", "Una sola línea: título, medidas de la sala, Contorno, 2D/3D y Pantalla completa"],
    ["Catálogo", "Tira de muebles para arrastrar con su cantidad; «Más» abre el catálogo entero en un cajón"],
    ["Herramientas", "Flotan arriba del plano; debajo de 1280 px quedan sólo los íconos"],
    ["Zoom, validación y leyenda", "Flotan sobre el plano, en las esquinas"],
    ["Propiedades", "Aparecen al elegir un mueble y se cierran con la ✕; en pantalla completa, con su botón"],
], ["Qué", "Cómo queda"])
cuerpo = (cabecera("El plano con más espacio", "El editor 2D, donde se arma el supermercado, como mesa de trabajo: el plano se queda con casi toda la pantalla.",
                   ["Medido en el navegador: % de la pantalla que ocupa el plano.", "Mismos datos y mismos enlaces: la verificación relacional sigue en 43/43 y 504/504."])
          + f'<div style="display:flex;gap:44px;align-items:flex-start">{fila1}</div>'
          + f'<div style="display:flex;gap:44px;align-items:flex-start">{fila2}</div>'
          + '<div style="display:flex;gap:24px;align-items:flex-start">' + tarjeta("Lo que cambió", cambios) + tarjeta("Lo medido", med) + "</div>")
W, H = 2420, 2200
(SAL / "FV10.dc.html").write_text(doc("El plano con más espacio", W, H, cuerpo))
c = json.load(open(CANVAS))
ys = [b["y"] + b["h"] for b in c["boards"].values() if b.get("page") == "final" and b is not c["boards"].get("FV10.dc.html")]
c["boards"]["FV10.dc.html"] = {"x": 0, "y": -H - 160, "w": W, "h": H, "title": "El plano con más espacio", "page": "final"}
if "FV10.dc.html" not in c["order"]:
    c["order"].append("FV10.dc.html")
json.dump(c, open(CANVAS, "w"), ensure_ascii=False, indent=1)
print("FV10 listo")
