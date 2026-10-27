import sys, base64, io
exec(open("panel.py").read())
from PIL import Image
def datauri(p, w=820):
    im = Image.open(p).convert("RGB"); im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=86); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
A = datauri(sys.argv[2] + "/Ficha.png"); B = datauri(sys.argv[2] + "/PanelR.png")
FILAS = [
 ("Pregunta que contesta", "¿Cómo está cada espacio? (mirar y tocar)", "¿Cómo va la sede y qué hago hoy? (leer y actuar)"),
 ("Lo primero que se ve", "Tres cifras y el plano de disponibilidad", "El canon del mes contra su potencial y las tareas de hoy"),
 ("Cifras", "Canon, disponibles y vencimientos a 30 días, sin meta ni tendencia", "Canon, ocupación, canon ÷ tarifa, vencimientos a 90 días, montajes y disponibles; con comparación y meta"),
 ("Gráficos", "Ninguno: el plano hace de gráfico", "Uno pequeño por tarjeta: curva de 12 meses, un cuadro por espacio, barra con meta, eje de 90 días"),
 ("Acción", "Al tocar un espacio, su ficha: renovar, editar, ver en 3D", "Cada tarjeta lleva a su acción: Renovar, Contratar, Ver; las tareas de hoy con botón"),
 ("Lo que hace mejor", "Ubicar: ver dónde está cada espacio y abrir su contrato", "Decidir: si va bien o mal, qué está en riesgo y qué hacer primero"),
 ("Lo que le falta", "Tendencia, metas, riesgo futuro, montajes", "El plano y la ficha del espacio (están en Contratos y en Plano de la sede)"),
 ("Pestañas", "Resumen · Tabla de contratos · Quién paga el canon · Participaciones", "No tiene: el período (Hoy · Octubre · 12 meses) arriba"),
]
cols = "200px minmax(0, 1fr) minmax(0, 1fr)"
tabla = (f'<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;"><div style="display: grid; grid-template-columns: {cols}; gap: 18px; padding: 10px 18px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span></span><span>A · «TODAS LAS FUNCIONES, SIN AGOBIAR»</span><span>B · PANEL DE INFORMACIÓN RÁPIDA</span></div>'
         + "".join(f'<div style="display: grid; grid-template-columns: {cols}; gap: 18px; padding: 11px 18px; border-top: 1px solid #ECEAE4; font-size: 14px; line-height: 1.45;"><b>{a}</b><span style="color: #3D3D3A;">{b}</span><span>{c}</span></div>' for a, b, c in FILAS) + "</div>")
img = lambda src, t: f'<figure style="margin: 0; display: flex; flex-direction: column; gap: 8px;"><figcaption style="font-size: 14px; font-weight: 700;">{t}</figcaption><img src="{src}" alt="{t}" style="width: 100%; border-radius: 12px; border: 1px solid {BORDE};"></figure>'
cuerpo = f'''<div style="display: flex; flex-direction: column; gap: 20px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Dos diseños de Indicadores, lado a lado</h1><span style="font-size: 15px; color: {GRIS};">A se pensó para ubicar y tocar espacios; B, para leer cómo va la sede y actuar. No compiten: contestan preguntas distintas.</span></div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">{img(A, "A · Indicadores en «Todas las funciones, sin agobiar»")}{img(B, "B · Panel de información rápida")}</div>
{tabla}
{tarjeta(f'<b style="font-size: 16px;">Propuesta: B es Indicadores; lo mejor de A se queda donde se usa</b><span style="font-size: 14px; line-height: 1.55; color: #3D3D3A;">El panel B es la pantalla de entrada de Indicadores. Las tres vistas de A que no están en B siguen como pestañas: <b>Tabla de contratos · Quién paga el canon · Participaciones de cara</b>. El plano con la ficha del espacio, que es lo fuerte de A, vive en Contratos y en Plano de la sede, donde se toca un espacio para hacer algo con él. Así no hay dos pantallas que muestren lo mismo de dos formas.</span>')}
</div>'''
guardar("Comparacion", "Dos diseños de Indicadores", 1760, 1290, cuerpo)
print("comparación ok")
