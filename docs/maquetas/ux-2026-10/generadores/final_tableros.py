"""Tableros del lienzo para la página «Versión final (para aprobar)».

Toma las capturas de las pantallas finales (final/protocap), el informe de la
verificación (final/salida/verificacion.json, tamanos.json) y el modelo.
Uso: python3 final_tableros.py <final> <salida_project> <canvas.json>
"""
import json, sys
from pathlib import Path

FIN, SAL, CANVAS = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
_src = open(Path(__file__).with_name("resp_tableros.py")).read()
sys.argv = [sys.argv[0], str(FIN / "protocap"), str(FIN / "protocap"), str(SAL), str(CANVAS)]
exec(_src[:_src.index("SAL.mkdir(parents=True")])
CAP = FIN / "protocap"
ver = json.load(open(FIN / "salida/verificacion.json")); tam = json.load(open(FIN / "salida/tamanos.json"))
mod = json.load(open(FIN / "salida/modelo.json"))

def par(titulo, sub, puntos, a, b):
    figs = "".join(marco(CAP / f"1440x900-{pg}.png", 1440, 900, .8, et, r) for pg, et, r in (a, b))
    return doc(titulo, 2436, 1010, cabecera(titulo, sub, puntos) + f'<div style="display:flex;gap:44px">{figs}</div>')

PARES = [
    ("FV1", "Inicio y Pendientes", "Lo que pide atención hoy, y la bandeja de los cuatro módulos.",
     ["Las cuatro cifras salen de la base: cada una con su «?».", "Cada pendiente lleva a la pantalla que lo resuelve.", "Pendientes: hoy · próximos 30 días · inconsistencias."],
     ("inicio", "Inicio", "Cifras, pendientes de hoy y actividad (bitácora real)."), ("pendientes", "Bandeja de Pendientes", "26 pendientes: cada fila es una fila de la base.")),
    ("FV2", "Contratos por fechas y Nuevo contrato", "Disponibilidad primero; después se contrata en cuatro pasos.",
     ["El plano se pinta con lo libre ENTRE esas fechas.", "Total = al mes × meses (la cuenta de la app).", "Guardar: POST /api/contratos/vender, todo o nada."],
     ("contratos", "¿Para qué fechas?", "01/11/2026 → 31/01/2027: libres, en parte, ocupados, reservados."), ("nuevo-contrato", "Nuevo contrato", "PUN-08 con su tarifa real; los 4 pasos a la vista.")),
    ("FV3", "Ficha del espacio y contrato", "La misma ficha desde cualquier módulo; el contrato con lo que se guardó.",
     ["Una ficha por espacio vendible (25).", "Una página por contrato (19), con sus campos de la base.", "Distribución de la cara y línea de 12 meses."],
     ("ficha-GON-03", "Ficha · GON-03 cara A", "Tres participaciones (80 %), queda 20 %."), ("contrato-2", "Contrato PUN-07", "Vence el 31/10/2026: renovar, editar, cancelar.")),
    ("FV4", "Indicadores y diccionario de métricas", "Resumen rápido y, detrás, cada fórmula con su fuente.",
     ["Canon del mes = Σ total ÷ meses de los contratos activos.", "Ocupación por peso: cara 1, entrepaño 1/n.", "Importes completos, sin «M»."],
     ("indicadores", "Indicadores · Resumen", "Canon, contratos, ocupación, canon ÷ tarifa, quién paga."), ("diccionario", "Diccionario de métricas", "43 cifras: valor, fórmula y endpoint.")),
    ("FV5", "Montajes y verificación", "Contratos y planogramas en una sola lista.",
     ["Lo que falta: planometría, zona, reporte, revisión.", "La verificación de un contrato es nueva.", "El encargado nunca ve montos."],
     ("montajes", "Montajes", "21 por resolver, con su acción."), ("verificar-montaje", "Verificar · Resolver", "Planometría al lado de la foto; no realizado con motivo.")),
    ("FV6", "Plano 2D y 3D", "El plano es el de la base: GET /api/layout/CENTRO.",
     ["Pasillos anchos y muebles finos (lo aprobado).", "Cada mueble pintado por su estado de hoy.", "El 3D usa el alto real de cada mueble."],
     ("plano2d", "Plano 2D", "Catálogo, plano y propiedades del mueble elegido."), ("plano3d", "Plano 3D", "Los mismos 16 muebles, en volumen.")),
    ("FV7", "Planograma y distribución de cara", "Las piezas guardadas, dibujadas tal como están en la base.",
     ["Vértices (u, v) de cada pieza sobre la cara real con sus parantes.", "Revisión «no coincide» con su nota.", "Distribuir: arrastrar, franja, estantes, a mano."],
     ("planograma-GON-13-B", "Planograma · GON-13 cara B", "No coincide: «Granos va a la derecha de Arroz»."), ("distribucion-GON-03", "Distribuir GON-03 cara A", "Tres participaciones sin ubicar todavía.")),
]

def tablero_telefono():
    figs = "".join(marco(CAP / f"390x844-{pg}.png", 390, 844, .9, et, r) for pg, et, r in [
        ("inicio", "Inicio", "Barra de abajo, cifras 2 × 2."), ("contratos", "Contratos", "Filtros plegados en un resumen."),
        ("ficha-PUN-07", "Ficha", "La misma ficha, en una columna."), ("montaje-telefono", "Encargado de montaje", "Sin montos; el mueble señalado.")])
    return doc("En el teléfono", 1860, 1000, cabecera("En el teléfono", "El mismo diseño, reacomodado (lo aprobado en el responsive).", ["Un solo archivo de estilos para todas las pantallas.", "Medido en 12 tamaños."]) + f'<div style="display:flex;gap:44px">{figs}</div>')

def tablero_que_es():
    mejor = tabla([
        ["Capas y 4 módulos", "Contratos · Indicadores · Montajes · Plano de la sede, barra común, bandeja de Pendientes, ficha única, Ajustes por tema"],
        ["Disponibilidad", "Primero las fechas; el plano y la lista dicen qué está libre, hasta cuándo y desde cuándo"],
        ["Indicadores combinado", "Resumen rápido + tabla de contratos + participaciones + todas las sedes + detalle + diccionario"],
        ["Estilo «como la foto»", "Azul como acción principal, tarjetas blancas, menú lateral, plano aireado (pasillos anchos, muebles finos)"],
        ["Responsive", "Un solo diseño que escala con la pantalla; teléfono y tableta vertical se reacomodan"],
    ], ["De la versión", "Qué se queda"])
    como = tabla([
        ["1 · Base nueva", "bd-final.db, sembrada SÓLO por la API real (sembrar.py): plano, tarifas, 20 contratos, reservas, participaciones, planogramas, planometrías y reportes"],
        ["2 · Modelo", f"modelo.py hace {len(mod["fuentes"])} pedidos a la API de la app y calcula cada cifra con fórmula y fuente; la cuenta de meses es la de la app (services/meses.py)"],
        ["3 · Pantallas", f"final.py dibuja {len(json.load(open(FIN / 'salida/paginas.json')))} páginas enlazadas: cada cifra lleva data-v, cada dato de contrato data-campo (tabla:id:campo), cada espacio enlaza a su ficha"],
        ["4 · Verificación", "verificar.py rehace cada cuenta con SQL directo a la base (otro camino), revisa enlaces, fichas y las 47 secciones del inventario"],
    ], ["Paso", "Qué hace"])
    hall = tabla([
        ["GET /api/dashboard/kpis", f'«monthly_revenue» suma el TOTAL de cada contrato, no el mes: da $ 44.670.000 contra $ 6.370.000 de canon real del mes. Además cuenta los 41 espacios del mapa viejo.'],
        ["GET /api/participaciones/cara", "El campo «valor_mensual» trae el total del contrato (720.000 en una participación de 120.000 al mes)."],
        ["GET /api/bitacora/acciones", f'Las acciones de planogramas no tienen título legible (devuelve la clave cruda): {ver["titulos_nuevos"]} filas del dibujo usan un título nuevo, marcado.'],
        ["Historial de contratos", "No hay endpoint para los contratos terminados: «libre desde» y el canon de meses pasados sólo salen por SQL."],
        ["Verificación de montajes de contratos", "No se guarda quién verificó ni cuándo: es nuevo en el diseño (los planogramas sí lo tienen)."],
    ], ["Dónde", "Qué encontró la verificación"])
    cuerpo = (cabecera("Versión final · relacional y verificable", "Lo mejor de cada versión, con datos de verdad: todo sale de una base cargada por la API de la app y se comprueba contra la base por SQL.",
                       ["Nada inventado en las pantallas: cada cifra tiene fórmula y fuente.", "Cada código lleva a su ficha; cada contrato, a su página.", "Sin migraciones: el diseño usa lo que la base ya guarda."])
              + '<div style="display:flex;gap:24px;align-items:flex-start">' + tarjeta("Lo que se queda de cada versión", mejor) + tarjeta("Cómo se arma", como) + "</div>"
              + tarjeta("Hallazgos en la app de hoy (para corregir al implementar)", hall))
    return doc("Versión final", 2560, 1080, cuerpo)

def tablero_verificacion():
    r = ver["resumen"]
    tot = tabla([[k, f"{v[0]} de {v[1]}", "✓" if v[0] == v[1] else "✗"] for k, v in [
        ("Cifras (data-v) contra SQL", r["cifras"]), ("Campos de la base (data-campo)", r["campos"]), ("Enlaces a páginas que existen", r["enlaces"]),
        ("Fichas con su espacio", r["fichas"]), ("Filas de la bandeja contra SQL", r["otros"])]], ["Comprobación", "Resultado", ""])
    fn = ver["funciones"]
    secs = tabla([[s["seccion"], s["funciones"], "✓" if s["en_la_version_final"] else "—"] for s in ver["secciones"]], ["Sección del inventario", "Funciones", "Con pantalla"])
    t = tabla([[f'{tam["combinaciones"]} combinaciones (93 páginas × 12 tamaños)', f'scroll horizontal {tam["desborde"]} · errores {tam["errores"]} · textos que se pisan {tam["solapes"]} · controles < 40 px {tam["controles_bajos"]} · ventanas que no caben {tam["modal"]}'],
               ["Letra mínima fuera de dibujos", f'{tam["letra_min"]} px'],
               ["Rótulos de dibujos (plano, 3D, caras) bajo 10 px", f'{len(tam["rotulos_chicos"])} combinaciones: el dibujo entero se achica; en la app los rótulos tienen que contra-escalar']], ["Prueba de tamaños", "Resultado"])
    cuerpo = (cabecera("Qué se verificó", "Todo con scripts que quedan en el repo (docs/maquetas/ux-2026-10/final/).",
                       [f'{fn["secciones_dibujadas"]} de {fn["secciones"]} secciones del inventario con pantalla ({fn["funciones_en_secciones_dibujadas"]} de {fn["funciones_total"]} funciones en esas secciones).',
                        "La cobertura es por sección: cada función no tiene todavía su propio marcador.", "Sólo Chromium; falta Safari de iPhone y Firefox."])
              + '<div style="display:flex;gap:24px;align-items:flex-start"><div style="flex:1;display:flex;flex-direction:column;gap:24px">' + tarjeta("Relacional", tot) + tarjeta("Tamaños", t) + "</div>"
              + tarjeta("Secciones del inventario", secs, 1100) + "</div>")
    return doc("Qué se verificó", 2560, 2560, cuerpo)

SAL.mkdir(parents=True, exist_ok=True)
tableros = [("FV0", "Versión final", tablero_que_es(), 2560, 1080)]
for nom, tit, sub, pts, a, b in PARES:
    tableros.append((nom, tit, par(tit, sub, pts, a, b), 2436, 1010))
tableros += [("FV8", "En el teléfono", tablero_telefono(), 1860, 1000), ("FV9", "Qué se verificó", tablero_verificacion(), 2560, 2560)]
c = json.load(open(CANVAS))
if not any(p["id"] == "final" for p in c["pages"]):
    c["pages"].append({"id": "final", "name": "Versión final (para aprobar)"})
y = 0
for nom, tit, contenido, w, h in tableros:
    (SAL / f"{nom}.dc.html").write_text(contenido)
    clave = f"{nom}.dc.html"
    c["boards"][clave] = {"x": 0, "y": y, "w": w, "h": h, "title": tit, "page": "final"}
    if clave not in c["order"]:
        c["order"].append(clave)
    y += h + 160
    print(clave, round(len(contenido) / 1e6, 2), "MB")
json.dump(c, open(CANVAS, "w"), ensure_ascii=False, indent=1)
