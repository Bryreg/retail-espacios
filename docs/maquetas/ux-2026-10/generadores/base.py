"""Piezas comunes de los tableros del lienzo (HTML estático con estilos en línea)."""
TINTA, GRIS, BORDE, FONDO, BLANCO, AMARILLO = "#141413", "#5E5D59", "#E4E2DC", "#EEEFEA", "#FFFFFF", "#F2B705"
VERDE, AMBAR, ROJO = "#1F7A4D", "#8A5A00", "#B42318"
MODULOS = ["Contratos", "Indicadores", "Montajes", "Plano de la sede"]

ICON = {
 "buscar": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
 "campana": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
 "ajustes": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 "abajo": '<path d="m6 9 6 6 6-6"/>',
 "mas": '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
 "x": '<path d="M18 6 6 18M6 6l12 12"/>',
 "flecha": '<path d="M5 12h14M13 6l6 6-6 6"/>',
 "check": '<path d="M20 6 9 17l-5-5"/>',
 "alerta": '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
 "reloj": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 "mas2": '<path d="M12 5v14M5 12h14"/>',
 "planilla": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 "tabla": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
 "cubo": '<path d="m21 16-9 5-9-5V8l9-5 9 5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
 "tendencia": '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
 "lupa": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
 "teclado": '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
}
def ico(n, size=16, color=TINTA, sw=1.75):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;">{ICON[n]}</svg>'

def boton(txt, tipo="sec", extra="", icono=None, h=40):
    st = {"pri": f"border: 0; background: {AMARILLO}; font-weight: 700;",
          "sec": f"border: 1px solid #DEDBD3; background: {BLANCO}; font-weight: 600;",
          "fan": f"border: 0; background: transparent; font-weight: 600; color: {TINTA};"}[tipo]
    i = ico(icono) if icono else ""
    return f'<button type="button" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: {h}px; padding: 0 14px; border-radius: 10px; {st} font: inherit; font-size: 14px; white-space: nowrap; {extra}">{i}{txt}</button>'

def encabezado(activo, sede="CENTRO", pendientes=14, bandeja_abierta=False, oportunidades=None, abierta=None):
    if bandeja_abierta and abierta is None:
        abierta = "pend"
    nav = "".join(
        f'<a href="#" style="text-decoration: none; padding: 9px 11px; border-radius: 10px; font-size: 14px; font-weight: 600; white-space: nowrap; '
        + (f'background: {TINTA}; color: {BLANCO};' if m == activo else 'color: #3D3D3A;') + f'">{m}</a>' for m in MODULOS)
    def pestana(clave, icono, txt, n, color_n):
        on = abierta == clave
        fg = BLANCO if on else TINTA
        bg = TINTA if on else BLANCO
        insignia = f'<span style="min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: {color_n}; color: {BLANCO}; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;">{n}</span>' if n else ""
        return (f'<button type="button" role="tab" aria-selected="{str(on).lower()}" style="display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 11px; border: 0; background: {bg}; color: {fg}; font: inherit; font-size: 14px; font-weight: 700; white-space: nowrap;">'
                f'{ico(icono, color=fg)}{txt}{insignia}</button>')
    pestanas = (f'<div role="tablist" aria-label="Bandeja" style="display: inline-flex; flex-shrink: 0; border: 1px solid #DEDBD3; border-radius: 10px; overflow: hidden; background: {BLANCO};">'
                + pestana("pend", "campana", "Pendientes", pendientes, ROJO)
                + ('<span style="width: 1px; background: #DEDBD3;"></span>' + pestana("opor", "tendencia", "Oportunidades", oportunidades, VERDE) if oportunidades else "") + '</div>')
    return f'''<header style="display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 20px; background: {BLANCO}; border-bottom: 1px solid {BORDE}; flex-shrink: 0;">
<b style="letter-spacing: .14em; font-size: 15px;">RECABRA</b>
<nav aria-label="Módulos" style="display: flex; gap: 2px; flex-grow: 1; min-width: 0;">{nav}</nav>
<button type="button" aria-label="Buscar función o código (Ctrl K)" style="display: inline-flex; flex-shrink: 0; align-items: center; gap: 8px; height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid #DEDBD3; background: #F6F5F1; font: inherit; font-size: 14px; color: {GRIS}; white-space: nowrap;">{ico("buscar", color=GRIS)}Buscar<kbd style="font: inherit; font-size: 12px; padding: 1px 6px; border-radius: 6px; border: 1px solid #DEDBD3; background: {BLANCO};">Ctrl K</kbd></button>
<button type="button" style="display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; font: inherit; font-size: 14px; font-weight: 600; white-space: nowrap;">{sede if sede.startswith("Todas") else "Sede " + sede}{ico("abajo")}</button>
{pestanas}
<button type="button" aria-label="Ajustes" style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; border: 1px solid #DEDBD3; background: {BLANCO}; display: inline-flex; align-items: center; justify-content: center;">{ico("ajustes")}</button>
</header>'''

def tablero(titulo, w, h, cuerpo, fondo=FONDO, extra_style="display: flex; flex-direction: column;"):
    return f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{titulo}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{{margin:0}}
a{{color:#141413}}a:hover{{color:#3d3d3a}}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; box-sizing: border-box; background: {fondo}; font-family: Inter, system-ui, sans-serif; color: {TINTA}; position: relative; overflow: hidden; {extra_style}">
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
'''
