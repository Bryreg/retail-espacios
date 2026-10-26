"""Nuestras pantallas con el estilo de la referencia: barra lateral, tarjetas blancas sobre gris claro.
Se conservan las reglas: amarillo sólo en la acción principal, ningún ícono sin nombre, voseo,
importes completos, estado con ícono y texto, disponibilidad en el tiempo."""
import sys
exec(open("combinado.py").read())

# ---------- tokens ----------
# ---------- tokens: calcados de la foto de referencia ----------
INK, TXT2, TXT3 = "#0F172A", "#475467", "#7A8394"
LINEA, LINEA2, FONDO_E, BLANCO_E = "#EEF0F4", "#E3E6EB", "#F6F7F9", "#FFFFFF"
AZUL, AZUL_CL, AZUL_TX = "#1570EF", "#EAF2FF", "#1366D6"
AMA = AMARILLO
OKC, OKF = "#079455", "#E7F8EF"
ATC, ATF = "#C4690A", "#FFF6E5"
CRC, CRF = "#D92D20", "#FFF1F0"
NEU, NEUF = "#475467", "#F2F4F7"
SOMBRA = "box-shadow: 0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.03);"

ICON.update({
 "contratos": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
 "indicadores": '<path d="M3 3v18h18"/><path d="M8 16v-5M13 16V8M18 16v-3"/>',
 "montajes": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
 "plano": '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
 "filtro": '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
 "lista": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 "linea": '<path d="M3 6h10M7 12h12M5 18h8"/>',
 "ojo": '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 "camara": '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
 "descargar": '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
 "subir": '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
 "imprimir": '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/>',
 "enviar": '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
 "deshacer": '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
 "rehacer": '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
 "rotar": '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
 "copiar": '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
 "papelera": '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
 "lapiz": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 "usuario": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 "archivo": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
 "pin": '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
 "capas": '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
 "mano": '<path d="M7 11V5a2 2 0 0 1 4 0v5M11 10V3a2 2 0 0 1 4 0v7M15 10V5a2 2 0 0 1 4 0v9a8 8 0 0 1-8 8h-1a7 7 0 0 1-5.6-2.8L2.5 16a2 2 0 0 1 3-2.6L7 15"/>',
 "estantes": '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16M4 15h16"/>',
 "franja": '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16"/>',
 "puerta": '<path d="M3 21h18M6 21V3h12v18"/><path d="M14 12h.01"/>',
 "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
 "ok": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 "error": '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
 "triangulo": '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
 "sede": '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
 "mas3": '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
 "producto": '<path d="M6 2h12l2 6H4z"/><path d="M4 8h16v13H4z"/><path d="M10 12h4"/>',
 "presentar": '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
 "pregunta": '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
 "mapa": '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
 "casa": '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
 "actividad": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
 "nube": '<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 6.5 19z"/>',
})
ic = lambda n, s=16, c=INK, w=1.8: ico(n, s, c, w)
fmt = lambda n: "$\u00a0" + f"{n:,.0f}".replace(",", ".")

# ---------- componentes, con el aire de la foto ----------
def btn(txt, tipo="sec", icono=None, h=38, extra=""):
    st = {"pri": f"background: {AZUL}; color: #FFFFFF; border: 0; font-weight: 600; box-shadow: 0 1px 2px rgba(21,112,239,.25);",
          "sec": f"background: {BLANCO_E}; color: #1F2937; border: 1px solid {LINEA2}; font-weight: 600; {SOMBRA}",
          "enl": f"background: transparent; color: {AZUL_TX}; border: 0; font-weight: 600; padding: 0 4px;",
          "suave": f"background: {NEUF}; color: #1F2937; border: 0; font-weight: 600;",
          "azulsuave": f"background: {AZUL_CL}; color: {AZUL_TX}; border: 0; font-weight: 600;",
          "peligro": f"background: {BLANCO_E}; color: {CRC}; border: 1px solid #FECDCA; font-weight: 600;"}[tipo]
    col = {"pri": "#FFFFFF", "enl": AZUL_TX, "azulsuave": AZUL_TX, "peligro": CRC}.get(tipo, "#344054")
    i = ic(icono, 16, col, 2) if icono else ""
    return (f'<span role="button" style="display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: {h}px; padding: 0 15px; '
            f'border-radius: 10px; {st} font-size: 13.5px; white-space: nowrap; box-sizing: border-box; flex-shrink: 0; {extra}">{i}{txt}</span>')

def pill(tipo, txt, icono=None):
    c, bg = {"ok": (OKC, OKF), "aten": (ATC, ATF), "crit": (CRC, CRF), "neu": (NEU, NEUF), "info": (AZUL_TX, AZUL_CL), "res": (ATC, "#FFFFFF")}[tipo]
    borde = f"border: 1px dashed {ATC};" if tipo == "res" else ""
    i = ic(icono, 12, c, 2.2) if icono else ""
    return (f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 7px; background: {bg}; {borde} '
            f'color: {c}; font-size: 12px; font-weight: 600; white-space: nowrap; box-sizing: border-box;">{i}{txt}</span>')

def tarjeta(cuerpo, pad="18px 20px", extra=""):
    return f'<div style="background: {BLANCO_E}; border: 1px solid #F1F3F6; border-radius: 14px; {SOMBRA} padding: {pad}; box-sizing: border-box; min-width: 0; {extra}">{cuerpo}</div>'

def tit_tarjeta(t, der="", sub_=""):
    s = f'<span style="font-size: 12.5px; color: {TXT3};">{sub_}</span>' if sub_ else ""
    return f'<div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;"><span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;"><b style="font-size: 15px; font-weight: 650;">{t}</b>{s}</span>{der}</div>'

def campo(etq, valor, ancho="auto", icono="abajo", mono=False, act=False):
    fam = "font-family: ui-monospace, Menlo, monospace;" if mono else ""
    b = f"border: 1.5px solid {AZUL};" if act else f"border: 1px solid {LINEA2};"
    e = f'<span style="font-size: 12px; font-weight: 500; color: {TXT3};">{etq}</span>' if etq else ""
    return (f'<label style="display: flex; flex-direction: column; gap: 6px; width: {ancho}; min-width: 0;">{e}'
            f'<span style="display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 10px; {b} background: {BLANCO_E}; font-size: 13.5px; font-weight: 500; {fam} box-sizing: border-box; {SOMBRA}">'
            f'<span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{valor}</span>{ic(icono, 15, TXT3) if icono else ""}</span></label>')

def segmentado(opts, act, chico=False):
    h = 32 if chico else 38
    return (f'<span style="display: inline-flex; gap: 6px; flex-shrink: 0;">' + "".join(
        f'<span style="display: inline-flex; align-items: center; gap: 6px; height: {h}px; padding: 0 13px; border-radius: 10px; font-size: 13px; font-weight: 600; white-space: nowrap; box-sizing: border-box; '
        + (f'background: {AZUL_CL}; color: {AZUL_TX};' if (o if isinstance(o, str) else o[0]) == act else f'background: {BLANCO_E}; color: #344054; border: 1px solid {LINEA2};')
        + '">' + ((ic(o[1], 15, AZUL_TX if o[0] == act else TXT2, 2) + o[0]) if not isinstance(o, str) else o) + "</span>" for o in opts) + "</span>")

def pestanas_e(opts, act, gap=10):
    return (f'<div role="tablist" style="display: flex; gap: {gap}px;">' + "".join(
        f'<span role="tab" style="display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 16px; border-radius: 10px 10px 0 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; box-sizing: border-box; '
        + (f'background: {AZUL_CL}; color: {AZUL_TX}; box-shadow: inset 0 -2px 0 {AZUL};' if (o[0] if isinstance(o, tuple) else o) == act else f'background: {NEUF}; color: {TXT2};') + '">'
        + (f'{o[0]} ({o[1]})' if isinstance(o, tuple) else o) + "</span>" for o in opts) + "</div>")

def casilla_e(on):
    return (f'<span style="width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; '
            + (f'background: {AZUL};">{ic("check", 13, BLANCO_E, 3)}</span>' if on else f'border: 1.5px solid {LINEA2}; background: {BLANCO_E};"></span>'))

def tabla(cols, encab, filas, sel=None):
    h = (f'<div style="display: grid; grid-template-columns: {cols}; gap: 12px; padding: 12px 18px; background: #F9FAFB; border-bottom: 1px solid {LINEA}; font-size: 12px; font-weight: 500; color: {TXT3};">'
         + "".join(f"<span>{x}</span>" for x in encab) + "</div>")
    cuerpo = "".join(f'<div style="display: grid; grid-template-columns: {cols}; gap: 12px; align-items: center; padding: 10px 18px; min-height: 56px; box-sizing: border-box; border-bottom: 1px solid {LINEA}; font-size: 13px; '
                     + (f"background: #F5F9FF;" if i == sel else "") + '">' + "".join(f'<span style="min-width: 0;">{c}</span>' for c in fila) + "</div>" for i, fila in enumerate(filas))
    return h + cuerpo

cod = lambda c, s=13: f'<b style="font-size: {s}px; font-weight: 650; white-space: nowrap; letter-spacing: .01em;">{c}</b>'
gris = lambda t, s=12.5: f'<span style="font-size: {s}px; color: {TXT3};">{t}</span>'

# miniatura del mueble, como las fotos chiquitas de la referencia
def mini(tipo="gondola", s=38):
    cols = ["#E15B4F", "#F4B740", "#3B82F6", "#22A06B", "#8B5CF6"]
    g = f'<rect x="5" y="3" width="28" height="32" rx="2" fill="#E5E7EB" stroke="#9CA3AF" stroke-width="1"/>'
    filas = 4 if tipo != "nevera" else 3
    for r in range(filas):
        y = 6 + r * 7.5
        for k in range(5):
            g += f'<rect x="{7 + k * 5.2:.1f}" y="{y:.1f}" width="4.2" height="5.6" rx=".8" fill="{cols[(r + k) % 5]}"/>'
        g += f'<rect x="6" y="{y + 6:.1f}" width="26" height="1.2" fill="#6B7280"/>'
    if tipo == "nevera":
        g += f'<rect x="5" y="3" width="28" height="32" rx="2" fill="#DBEAFE" fill-opacity=".35" stroke="#60A5FA"/>'
    return f'<span style="display: inline-flex; width: {s}px; height: {s}px; border-radius: 8px; background: #F8FAFC; border: 1px solid {LINEA}; align-items: center; justify-content: center; flex-shrink: 0;"><svg width="{s - 6}" height="{s - 6}" viewBox="0 0 38 38">{g}</svg></span>'

# círculo de color con ícono blanco (listas de Inicio)
punto = lambda icono, col: f'<span style="width: 30px; height: 30px; border-radius: 99px; background: {col}1F; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;"><span style="width: 20px; height: 20px; border-radius: 99px; background: {col}; display: inline-flex; align-items: center; justify-content: center;">{ic(icono, 11, "#FFFFFF", 2.6)}</span></span>'

# ---------- armazón: barra lateral + barra superior, como en la foto ----------
NAV = [("Inicio", "casa"), ("Contratos", "contratos"), ("Indicadores", "indicadores"), ("Montajes", "montajes"), ("Plano de la sede", "plano")]
def lateral(activo):
    item = lambda t, i, on: (f'<a href="#" style="display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 14px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: {600 if on else 500}; '
                             + (f'background: {AZUL_CL}; color: {AZUL_TX};">{ic(i, 18, AZUL_TX, 2)}' if on else f'color: #374151;">{ic(i, 18, "#4B5563", 1.8)}') + f'{t}</a>')
    return (f'<aside style="width: 236px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 22px 16px 22px; background: #FBFCFD; border-right: 1px solid {LINEA}; box-sizing: border-box;">'
            f'<div style="display: flex; align-items: center; gap: 14px; height: 36px; padding: 0 12px; margin-bottom: 22px;">{ic("lista", 20, INK, 2.2)}<b style="font-size: 17px; font-weight: 800; letter-spacing: .04em;">RECABRA</b></div>'
            + "".join(item(t, i, t == activo) for t, i in NAV)
            + f'<span style="flex-grow: 1;"></span>'
            + item("Ajustes", "ajustes", activo == "Ajustes")
            + f'<span style="height: 70px;"></span>'
            f'<div style="display: flex; flex-direction: column; gap: 3px; padding: 0 12px;"><b style="font-size: 13px; font-weight: 650;">Supermercado La Esquina</b><span style="font-size: 12.5px; color: {TXT3};">Sede: CENTRO</span></div></aside>')

def superior(sede="Sede CENTRO", pend=14, pend_abierta=False):
    pc = AZUL_TX if pend_abierta else "#374151"
    return (f'<header style="display: flex; align-items: center; gap: 16px; height: 66px; padding: 0 28px; background: {BLANCO_E}; border-bottom: 1px solid {LINEA}; flex-shrink: 0; box-sizing: border-box;">'
            f'{ic("buscar", 19, INK, 2)}'
            f'<span style="display: flex; align-items: center; gap: 9px; width: 470px; height: 42px; padding: 0 14px; border-radius: 12px; background: #F3F4F6; color: #9CA3AF; font-size: 13.5px; box-sizing: border-box;">'
            f'{ic("buscar", 16, "#9CA3AF")}Buscar espacios, contratos, proveedores… (Ctrl K)</span>'
            f'<span style="flex-grow: 1;"></span>'
            f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: {OKC}; white-space: nowrap;">{ic("nube", 16, OKC, 2)}Guardado</span>'
            f'<span style="display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 10px; {"background: " + AZUL_CL + ";" if pend_abierta else ""} font-size: 13.5px; font-weight: 600; color: {pc}; position: relative;">'
            f'<span style="position: relative; display: inline-flex;">{ic("campana", 20, pc, 2)}<span style="position: absolute; top: -7px; right: -9px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: #F04438; color: #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border: 2px solid #fff;">{pend}</span></span>Pendientes</span>'
            f'<span style="display: inline-flex; align-items: center; gap: 10px; padding-left: 8px;"><span style="width: 38px; height: 38px; border-radius: 99px; background: linear-gradient(135deg, #C7D7FE, #A5B4FC); color: #1E3A8A; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;">BM</span>'
            f'<span style="display: flex; flex-direction: column; line-height: 1.25;"><b style="font-size: 13.5px; font-weight: 650;">Brayan Moreno</b><span style="font-size: 12px; color: {TXT3};">Administrador</span></span>{ic("abajo", 16, TXT2, 2)}</span>'
            f'</header>')

def cabecera(titulo, sub_, der="", migas=None):
    m = (f'<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: {TXT3}; margin-bottom: 10px;">{ic("chev", 13, TXT3, 2).replace("m9 6 6 6-6 6", "m15 6-6 6 6 6")}' + f' <span style="color: #C0C5CE;">›</span> '.join(migas) + "</div>") if migas else ""
    return (f'<div style="display: flex; align-items: flex-end; gap: 12px;"><span style="display: flex; flex-direction: column; gap: 5px; flex-grow: 1; min-width: 0;">{m}'
            f'<h1 style="margin: 0; font-size: 23px; font-weight: 700; letter-spacing: -.015em;">{titulo}</h1><span style="font-size: 13.5px; color: {TXT3};">{sub_}</span></span>'
            f'<div style="display: flex; align-items: flex-end; gap: 10px;">{der}</div></div>')

def shell(activo, cuerpo, sede="Sede CENTRO", pend=14, pend_abierta=False, capa="", pad="26px 30px 26px"):
    return (f'<div style="display: flex; width: 100%; height: 100%; background: {FONDO_E}; font-family: Inter, system-ui, sans-serif; color: {INK};">'
            f'{lateral(activo)}<div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0; position: relative;">{superior(sede, pend, pend_abierta)}'
            f'<main style="display: flex; flex-direction: column; gap: 20px; padding: {pad}; flex-grow: 1; min-height: 0; box-sizing: border-box;">{cuerpo}</main>{capa}</div></div>')

def guardar_e(nombre, titulo, cuerpo, w=1440, h=900):
    guardar(nombre, titulo, w, h, cuerpo, fondo=FONDO_E, extra_style="display: flex;")

# ---------- el plano de CENTRO (vista de arriba) ----------
EST_E = {"d": ("#ECFDF3", "#12B76A", ""), "p": ("#FFF8EB", "#F79009", ""), "c": ("#FEF3F2", "#F04438", ""),
         "r": ("#FFFFFF", "#F79009", "5 3"), "n": ("#F8FAFC", "#94A3B8", ""), "x": ("#F8FAFC", "#CBD5E1", ""), "m": ("#F5F3FF", "#7A5AF8", "")}
MUEBLES = [  # código, x, y, w, h, vertical — pasillos anchos, muebles finos
 ("GON-12", 150, 52, 290, 30, False), ("GON-13", 560, 52, 290, 30, False),
 ("GON-01", 210, 168, 40, 180, True), ("GON-02", 370, 168, 40, 180, True), ("GON-03", 530, 168, 40, 180, True), ("GON-04", 690, 168, 40, 180, True),
 ("PUN-01", 210, 136, 40, 26, False), ("PUN-02", 210, 354, 40, 26, False), ("PUN-03", 370, 136, 40, 26, False), ("PUN-04", 370, 354, 40, 26, False),
 ("PUN-05", 530, 136, 40, 26, False), ("PUN-06", 530, 354, 40, 26, False), ("PUN-07", 690, 136, 40, 26, False), ("PUN-08", 690, 354, 40, 26, False),
 ("PUN-09", 800, 440, 64, 26, False), ("NEV-01", 922, 140, 32, 260, True)]
def plano_svg(estados, etiquetas=None, sel=None, w="100%", h="100%", vb=(0, 0, 1000, 520), cotas=False, atenuado=False, tam=1.0):
    etiquetas = etiquetas or {}
    g = (f'<defs><pattern id="cuad" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#E9EDF2" stroke-width="1"/></pattern></defs>'
         f'<rect x="-200" y="-200" width="1400" height="920" fill="url(#cuad)"/>'
         f'<rect x="20" y="20" width="960" height="480" rx="2" fill="#FFFFFF" fill-opacity=".55" stroke="#64748B" stroke-width="1.8"/>'
         f'<rect x="420" y="494" width="120" height="12" fill="#FCFCFD"/><path d="M430 500h100" stroke="{AZUL}" stroke-width="3" stroke-dasharray="6 5"/>'
         f'<text x="480" y="488" text-anchor="middle" font-size="12" font-weight="600" fill="{AZUL_TX}">Entrada</text>')
    if cotas:
        g += (f'<path d="M20 12h960" stroke="#98A2B3" stroke-width="1"/><text x="500" y="10" text-anchor="middle" font-size="12" fill="{TXT3}">40,00 m</text>'
              f'<path d="M990 20v480" stroke="#98A2B3" stroke-width="1"/><text x="996" y="262" font-size="12" fill="{TXT3}" transform="rotate(90 996 262)" text-anchor="middle">20,00 m</text>')
    for c, x, y, ww, hh, vert in MUEBLES:
        e = estados.get(c, "n")
        fill, st, dash = EST_E[e]
        sw = 2.4 if c == sel else 1.1
        stc = INK if c == sel else st
        g += f'<rect x="{x}" y="{y}" width="{ww}" height="{hh}" rx="3" fill="{fill}" stroke="{stc}" stroke-width="{sw + .6}" {"stroke-dasharray=" + chr(34) + dash + chr(34) if dash else ""}/>'
        if vert and ww >= 40:
            g += f'<line x1="{x + ww / 2}" x2="{x + ww / 2}" y1="{y + 6}" y2="{y + hh - 6}" stroke="{stc}" stroke-opacity=".35" stroke-width="1.2"/>'
        sub_ = etiquetas.get(c, "")
        cx, cy = x + ww / 2, y + hh / 2
        if vert:
            g += f'<text x="{cx}" y="{cy}" transform="rotate(-90 {cx} {cy})" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="16" font-weight="700" fill="{INK}" dy="{-1 if sub_ else 5}">{c}</text>'
            if sub_:
                g += f'<text x="{cx}" y="{cy}" transform="rotate(-90 {cx} {cy})" text-anchor="middle" font-size="13" font-weight="500" fill="{TXT2}" dy="15">{sub_}</text>'
        elif ww > 100:
            g += f'<text x="{cx}" y="{cy + 5.5}" text-anchor="middle" font-size="15" fill="{INK}"><tspan font-family="ui-monospace, Menlo, monospace" font-weight="700">{c}</tspan>{"  · " + sub_ if sub_ else ""}</text>'
        else:
            # las puntas son chicas: el código va afuera, arriba o abajo, a tamaño legible
            arriba = y < 300 and c != "PUN-09"
            ty = y - 8 if arriba else y + hh + 18
            g += f'<text x="{cx}" y="{ty}" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="14" font-weight="700" fill="{INK}">{c}</text>'
            if sub_:
                ty2 = ty - 17 if arriba else ty + 16
                g += f'<text x="{cx}" y="{ty2}" text-anchor="middle" font-size="12.5" font-weight="600" fill="{TXT2}">{sub_}</text>'
    if tam != 1.0:
        import re as _re
        g = _re.sub(r'font-size="([0-9.]+)"', lambda m: f'font-size="{float(m.group(1)) * tam:.1f}"', g)
    op = 'opacity="0.45"' if atenuado else ""
    return f'<svg style="flex-grow: 1; min-height: 0; display: block;" width="{w}" height="{h}" viewBox="{" ".join(map(str, vb))}" role="img" aria-label="Plano de la sede CENTRO"><g {op}>{g}</g></svg>'

# estados por fechas (01/11/2026 – 31/01/2027), del juego de datos de siempre
EST_FECHAS = {k: v[0] for k, v in ESTADO.items()}
ETQ_FECHAS = {k: v[1] for k, v in ESTADO.items()}

def leyenda_e(items):
    return '<div style="display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: #344054;">' + "".join(
        f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 13px; height: 13px; border-radius: 4px; background: {EST_E[e][0]}; border: 1.6px {"dashed" if EST_E[e][2] else "solid"} {EST_E[e][1]}; box-sizing: border-box;"></span>{t}</span>' for e, t in items) + "</div>"
LEY_FECHAS = [("d", "Disponible todas las fechas · 4"), ("p", "Disponible parte · 8"), ("c", "Contratado · 3"), ("r", "Reservado · 1")]
print("estilo: base ok")

# =====================================================================
# E02 · Contratos: ¿para qué fechas?
# =====================================================================
def fila_disp(c, nombre, det, on=False, est="d"):
    return (f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid {LINEA};">{casilla_e(on)}'
            f'<span style="width: 10px; height: 10px; border-radius: 3px; background: {EST_E[est][0]}; border: 1.6px solid {EST_E[est][1]}; flex-shrink: 0;"></span>'
            f'<span style="display: flex; flex-direction: column; gap: 1px; min-width: 0; flex-grow: 1;"><span style="font-size: 13.5px;">{cod(c)} · {nombre}</span>{gris(det)}</span></div>')
sec_disp = lambda t, n: f'<div style="display: flex; align-items: center; gap: 8px; padding: 12px 0 6px;"><b style="font-size: 12.5px; color: #344054;">{t}</b>{gris(n, 12)}</div>'
lista_d = (sec_disp("Disponibles todas las fechas", "4")
           + fila_disp("PUN-07", "Punta de góndola 7", "Libre desde el 31/10/2026 · tarifa $ 600.000 /mes", True)
           + fila_disp("PUN-08", "Punta de góndola 8", "Libre desde el 08/10/2026 · tarifa $ 600.000 /mes", True)
           + fila_disp("PUN-09", "Punta de góndola 9", "Libre desde el 01/09/2026 · tarifa $ 600.000 /mes")
           + fila_disp("GON-12", "Góndola 12", "Libre desde el 01/08/2026 · $ 450.000 /mes por cara")
           + sec_disp("Disponibles parte de las fechas", "8")
           + fila_disp("GON-04", "Góndola 4", "Desde el 16/11/2026 · cubre 77 de los 92 días", est="p")
           + f'<div style="padding: 10px 0 0; border-top: 1px solid {LINEA}; font-size: 12.5px; font-weight: 600; color: {AZUL_TX};">Ver los 6 restantes</div>')
filtros = tarjeta(
    f'<div style="display: flex; align-items: flex-end; gap: 14px;">'
    f'{campo("Desde", "01/11/2026", "150px", "calendario", True, True)}{campo("Hasta", "31/01/2027", "150px", "calendario", True, True)}'
    f'<span style="display: flex; flex-direction: column; gap: 5px;"><span style="font-size: 12px; font-weight: 600; color: {TXT2};">Atajos</span>{segmentado(["1 mes", "3 meses", "6 meses", "Black Friday 2026", "Navidad 2026"], "3 meses")}</span>'
    f'{campo("Tipo de mueble", "Todos", "170px")}<span style="flex-grow: 1;"></span>'
    f'<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding-bottom: 2px;"><b style="font-size: 20px;">92 días</b>{gris("del 01/11/2026 al 31/01/2027")}</span></div>', pad="16px 18px")
plano_card = tarjeta(
    tit_tarjeta("Plano · disponibilidad en esas fechas", segmentado(["Disponibilidad", "Se libera", "Tarifa"], "Disponibilidad", True), "Debajo de cada código: desde cuándo, hasta cuándo o qué parte queda libre.")
    + plano_svg(EST_FECHAS, ETQ_FECHAS, vb=(10, 16, 985, 500))
    + f'<div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">{leyenda_e(LEY_FECHAS)}<span style="flex-grow: 1;"></span>{gris("Arrastrá para mover · rueda para acercar")}</div>',
    extra="flex: 2.2; display: flex; flex-direction: column;")
lista_card = tarjeta(
    tit_tarjeta("Espacios para esas fechas", btn("Filtrar", "sec", "filtro", 32), "16 espacios · 2 elegidos")
    + f'<div style="flex-grow: 1; min-height: 0; overflow: hidden;">{lista_d}</div>'
    + f'<div style="display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid {LINEA};">'
    + btn("Contratar 2 espacios", "pri", "flecha", 42, "width: 100%;")
    + f'<span style="text-align: center;">{gris("Del 01/11/2026 al 31/01/2027 · las fechas pasan al contrato ya puestas.")}</span></div>',
    extra="flex: 1; display: flex; flex-direction: column;")
e02 = shell("Contratos",
    cabecera("Contratos", "Elegí las fechas: el plano y la lista dicen qué está libre, hasta cuándo está ocupado y desde cuándo se libera.",
             btn("Cargar desde planilla", "sec", "planilla") + btn("Nuevo contrato sin fechas", "sec", "mas2"))
    + pestanas_e(["Disponibilidad", "Línea de tiempo"], "Disponibilidad")
    + filtros
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">{plano_card}{lista_card}</div>')
guardar_e("F02", "Contratos · ¿para qué fechas?", e02)
print("E02 ok")

# =====================================================================
# E01 · Indicadores · Resumen
# =====================================================================
def kpi(titulo, valor, unidad, linea, estado_html="", enlace=""):
    enl = f'<span style="font-size: 12.5px; font-weight: 600; color: {AZUL_TX}; white-space: nowrap;">{enlace}</span>' if enlace else ""
    return tarjeta(f'<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;"><span style="font-size: 13px; font-weight: 600; color: {TXT2}; flex-grow: 1;">{titulo}</span>'
                   f'<span aria-label="Qué es" style="width: 16px; height: 16px; border-radius: 999px; border: 1.5px solid {TXT3}; color: {TXT3}; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;">?</span></div>'
                   f'<div style="display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;"><b style="font-size: 27px; font-weight: 650; letter-spacing: -.015em; white-space: nowrap;">{valor}</b><span style="font-size: 13.5px; color: {TXT3};">{unidad}</span></div>'
                   f'<div style="display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;">{estado_html}<span style="font-size: 12.5px; color: {TXT3};">{linea}</span><span style="flex-grow: 1;"></span>{enl}</div>', extra="flex: 1;")
sube = lambda t: f'<span style="display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 999px; background: {OKF}; color: {OKC}; font-size: 12px; font-weight: 700;">▲ {t}</span>'
fila_kpi = (f'<div style="display: flex; gap: 16px;">'
            + kpi("Canon mensual contratado", fmt(9939500), "/mes", "vs septiembre 2026", sube("4,7 %"))
            + kpi("Ocupación", "86 %", "19 de 22 espacios", "", pill("aten", "Bajo la meta de 90 %"))
            + kpi("Canon ÷ tarifa", "94 %", "", "", pill("aten", "Bajo la meta de 95 %"))
            + kpi("Vence en 90 días sin renovar", fmt(1650000), "/mes", "3 contratos", pill("crit", "Sin contrato siguiente"))
            + "</div>")
# barras del canon: un eje, la última resaltada, línea del potencial
def barras_canon(w=640, h=210):
    x0, x1, y0, y1 = 92, w - 6, 14, h - 24
    hi = 13.0
    Y = lambda v: y1 - v / hi * (y1 - y0)
    bw = (x1 - x0) / 12 * .62
    meses = ["nov", "dic", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct"]
    g = ""
    for v in [0, 4, 8, 12]:
        g += f'<line x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{LINEA}" stroke-width="1"/><text x="{x0 - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" font-size="11" fill="{TXT3}">{"$ " + str(v) + ".000.000" if v else "$ 0"}</text>'
    for i, v in enumerate(CANON):
        x = x0 + (i + .19) * (x1 - x0) / 12
        g += f'<rect x="{x:.1f}" y="{Y(v):.1f}" width="{bw:.1f}" height="{y1 - Y(v):.1f}" rx="3" fill="{AZUL if i == 11 else AZ_CL}"/>'
        g += f'<text x="{x + bw / 2:.1f}" y="{h - 6}" text-anchor="middle" font-size="11" fill="{TXT3}">{meses[i]}</text>'
    g += f'<line x1="{x0}" x2="{x1}" y1="{Y(12.2):.1f}" y2="{Y(12.2):.1f}" stroke="{INK}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="{x1}" y="{Y(12.2) - 6:.1f}" text-anchor="end" font-size="11.5" fill="{INK}">Potencial a tarifa · {fmt(12200000)}</text>'
    xl = x0 + 11.19 * (x1 - x0) / 12 + bw / 2
    g += f'<text x="{xl:.1f}" y="{Y(CANON[-1]) - 8:.1f}" text-anchor="end" font-size="12" font-weight="700" fill="{AZUL_TX}">{fmt(9939500)}</text>'
    return f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Canon mensual contratado por mes">{g}</svg>'
c_canon_e = tarjeta(tit_tarjeta("Canon mensual contratado · últimos 12 meses", btn("Tabla de contratos", "enl", "chev", 28), "Cada barra es el canon vigente al cierre del mes.") + barras_canon(), extra="flex: 1.45;")
tareas_e = [("PUN-07 vence en 4 días", "Galletas Sol · " + fmt(600000) + " /mes", "Renovar", "crit", "reloj"),
            ("Montaje no realizado", "PUN-03 · faltó el material", "Ver", "crit", "llave"),
            ("La reserva caduca hoy", "GON-13 · Lácteos Andinos", "Resolver", "aten", "calendario")]
lista_hoy = "".join(f'<div style="display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid {LINEA};">'
                    f'<span style="width: 32px; height: 32px; border-radius: 8px; background: {CRF if t == "crit" else ATF}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{ic(i, 16, CRC if t == "crit" else ATC, 2)}</span>'
                    f'<span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0;"><b style="font-size: 13.5px; font-weight: 600;">{a}</b>{gris(b)}</span>{btn(c, "sec", None, 32)}</div>' for a, b, c, t, i in tareas_e)
c_hoy_e = tarjeta(tit_tarjeta("Para hacer hoy", btn("Ver los 14 pendientes", "enl", "chev", 28), "3 con fecha límite hoy") + lista_hoy, extra="flex: 1;")
def eje90_e(w=560, h=70):
    x0, x1, y = 10, w - 10, 30
    X = lambda d: x0 + d / 90 * (x1 - x0)
    g = f'<line x1="{x0}" x2="{x1}" y1="{y}" y2="{y}" stroke="{LINEA2}" stroke-width="2"/>'
    for d, t in [(0, "hoy"), (30, "30 días"), (60, "60 días"), (90, "90 días")]:
        g += f'<text x="{X(d):.1f}" y="{h - 4}" text-anchor="{"start" if d == 0 else ("end" if d == 90 else "middle")}" font-size="11" fill="{TXT3}">{t}</text>'
    for d, c, sin in VEN:
        g += f'<circle cx="{X(d):.1f}" cy="{y}" r="7.5" fill="{NAR if sin else GR_DE}" stroke="#fff" stroke-width="2"/>'
        if sin:
            g += f'<text x="{X(d):.1f}" y="{y - 13}" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}">{c}</text>'
    return f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Vencimientos en 90 días">{g}</svg>'
c_venc_e = tarjeta(tit_tarjeta("Vence en los próximos 90 días", btn("Renovar", "enl", "chev", 28), "6 contratos · 3 sin contrato siguiente") + eje90_e()
                   + f'<div style="display: flex; gap: 16px; font-size: 12px; color: {TXT2}; margin-top: 6px;"><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 9px; height: 9px; border-radius: 99px; background: {NAR};"></span>Sin contrato siguiente</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 9px; height: 9px; border-radius: 99px; background: {GR_DE};"></span>Ya renovado</span></div>', extra="flex: 1.45;")
SEG_E = [("Verificados", 4, AZ_CL.replace("86b6ef", "1c5cab")), ("Sin verificar", 1, "#5598e7"), ("Sin montar", 2, "#D0D5DD"), ("No realizado", 1, "#D92D20")]
c_mont_e = tarjeta(tit_tarjeta("Montajes de octubre", btn("Montajes", "enl", "chev", 28), "5 de 8 en la tienda")
                   + '<div style="display: flex; gap: 3px; height: 12px; margin: 4px 0 12px;">' + "".join(f'<span style="flex: {n}; border-radius: 4px; background: {c};"></span>' for _, n, c in SEG_E) + "</div>"
                   + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px;">' + "".join(f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #344054;"><span style="width: 9px; height: 9px; border-radius: 3px; background: {c};"></span>{t} <b>{n}</b></span>' for t, n, c in SEG_E) + "</div>", extra="flex: .8;")
chips_e = "".join(f'<span style="display: inline-flex; flex-direction: column; gap: 1px; padding: 8px 11px; border-radius: 8px; background: #F9FAFB; border: 1px solid {LINEA};">{cod(c)}{gris(d, 11.5)}</span>' for c, d in [("PUN-08", "18 días libre"), ("PUN-09", "56 días libre"), ("GON-12 A", "14 días libre")])
c_disp_e = tarjeta(tit_tarjeta("Disponibles hoy", btn("Contratar", "enl", "chev", 28), "3 espacios · sin facturar en octubre " + fmt(1090000))
                   + f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">{chips_e}</div>', extra="flex: .8;")
def barra_tipo(t, n, de):
    p = round(n / de * 100)
    est = pill("ok", "En la meta") if p >= 90 else pill("aten", "Bajo la meta")
    return (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid {LINEA};"><div style="display: flex; align-items: center; gap: 8px;"><b style="font-size: 13.5px; font-weight: 600; flex-grow: 1;">{t}</b>{gris(f"{n} de {de}", 12.5)}<b style="font-size: 13.5px; width: 46px; text-align: right;">{p} %</b>{est}</div>'
            f'<div style="position: relative; height: 10px; border-radius: 99px; background: {AZUL_CL};"><span style="position: absolute; left: 0; top: 0; bottom: 0; width: {p}%; border-radius: 99px; background: {AZUL};"></span><span style="position: absolute; left: 90%; top: -4px; width: 2px; height: 18px; background: {INK};"></span></div></div>')
c_tipo = tarjeta(tit_tarjeta("Ocupación por tipo de mueble", btn("Ver el plano", "enl", "chev", 28), "Espacios contratados hoy · la raya negra es la meta de 90 %")
                 + barra_tipo("Caras de góndola", 11, 12) + barra_tipo("Puntas de góndola", 7, 9) + barra_tipo("Neveras", 1, 1), extra="flex: 1;")
e01 = shell("Indicadores",
    cabecera("Indicadores", "Lunes 26/10/2026 · Sede CENTRO · comparado con septiembre 2026", segmentado(["Al mes", "Total del contrato"], "Al mes") + segmentado(["Hoy", "Octubre", "Últimos 12 meses"], "Octubre") + btn("Exportar CSV", "sec", "descargar"))
    + pestanas_e(["Resumen", "Tabla de contratos", "Quién paga el canon", "Participaciones de cara"], "Resumen")
    + fila_kpi
    + f'<div style="display: flex; gap: 16px;">{c_canon_e}{c_tipo}</div>'
    + f'<div style="display: flex; gap: 16px;">{c_venc_e}{c_mont_e}{c_disp_e}</div>')
guardar_e("F01", "Indicadores · Resumen", e01)

# =====================================================================
# E03 · Contratos · Línea de tiempo
# =====================================================================
def gantt(w=1120):
    lab = 210
    tot = (VF - VI).days + 1
    X = lambda d: lab + max(0, (d - VI).days) / tot * (w - lab)
    filas = list(T.items())
    rh = 30
    h = 34 + rh * len(filas)
    g = ""
    for i, m in enumerate(MESES):
        d0 = date(2026 + (1 if i >= 3 else 0), (10 + i - 1) % 12 + 1, 1)
        g += f'<text x="{X(d0) + 4:.1f}" y="16" font-size="11.5" fill="{TXT3}">{m} {str(d0.year)[2:]}</text><line x1="{X(d0):.1f}" x2="{X(d0):.1f}" y1="22" y2="{h}" stroke="{LINEA}" stroke-width="1"/>'
    g += f'<rect x="{X(DESDE):.1f}" y="22" width="{X(HASTA) - X(DESDE):.1f}" height="{h - 22}" fill="{AZUL}" opacity=".07"/>'
    for i, (k, cs) in enumerate(filas):
        y = 28 + i * rh
        c, n = k.split(" · ")
        g += f'<text x="0" y="{y + 19}" font-size="12.5"><tspan font-family="ui-monospace, Menlo, monospace" font-weight="700" fill="{INK}">{c}</tspan><tspan fill="{TXT3}"> {n}</tspan></text>'
        g += f'<line x1="{lab}" x2="{w}" y1="{y + rh - 1}" y2="{y + rh - 1}" stroke="#F2F4F7"/>'
        for a, b, t, cl in cs:
            xa, xb = X(max(a, VI)), X(min(b, VF))
            fill, st, dash = EST_E[{"c": "c", "p": "p", "r": "r"}[cl]]
            g += f'<rect x="{xa:.1f}" y="{y + 4}" width="{xb - xa:.1f}" height="{rh - 9}" rx="5" fill="{fill}" stroke="{st}" stroke-width="1.4" {"stroke-dasharray=" + chr(34) + dash + chr(34) if dash else ""}/>'
            corto = t if len(t) * 6.6 < xb - xa - 14 else t.split(" · ")[0]
            if len(corto) * 6.6 < xb - xa - 14:
                g += f'<text x="{xa + 8:.1f}" y="{y + 19}" font-size="11.5" font-weight="600" fill="{INK}">{corto}</text>'
    xh = X(HOY)
    g += f'<line x1="{xh:.1f}" x2="{xh:.1f}" y1="22" y2="{h}" stroke="{CRC}" stroke-width="1.6"/><rect x="{xh - 15:.1f}" y="20" width="30" height="16" rx="4" fill="{CRC}"/><text x="{xh:.1f}" y="32" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">hoy</text>'
    # hueco elegido de PUN-05
    yi = 28 + [k for k, _ in filas].index("PUN-05 · Punta de góndola 5") * rh
    xa, xb = X(date(2026, 12, 15)), X(date(2027, 3, 31))
    g += f'<rect x="{xa:.1f}" y="{yi + 4}" width="{xb - xa:.1f}" height="{rh - 9}" rx="5" fill="#DCFAE6" stroke="{INK}" stroke-width="2"/>'
    return f'<svg width="100%" viewBox="0 0 {w} {h}" role="img" aria-label="Línea de tiempo de la sede">{g}</svg>', xa, yi, xb
svg_g, gxa, gyi, gxb = gantt()
pop_g = (f'<div style="position: absolute; left: {int(gxa * 1092 / 1120) + 300}px; top: {int(gyi * 1092 / 1120) + 400}px; width: 300px; padding: 14px 16px; border-radius: 12px; background: {BLANCO_E}; border: 1px solid {LINEA}; box-shadow: 0 12px 24px rgba(16,24,40,.14); display: flex; flex-direction: column; gap: 8px; z-index: 5;">'
         f'<span style="display: flex; align-items: center; gap: 8px;">{cod("PUN-05")}{pill("ok", "Disponible")}</span>'
         f'<span style="font-size: 13.5px;">Del <b>15/12/2026</b> al <b>31/03/2027</b> · 107 días</span>{gris("Antes: Galletas Sol hasta el 14/12/2026 · después: Snacks Andes desde el 01/04/2027")}'
         + btn("Contratar estas fechas", "pri", "flecha", 36, "width: 100%;") + "</div>")
e03 = shell("Contratos",
    cabecera("Contratos", "Cada espacio en una fila y 12 meses a la vista: cuánto dura cada contrato y dónde hay huecos.",
             btn("Cargar desde planilla", "sec", "planilla") + btn("Nuevo contrato sin fechas", "sec", "mas2"))
    + pestanas_e(["Disponibilidad", "Línea de tiempo"], "Línea de tiempo")
    + tarjeta(f'<div style="display: flex; align-items: center; gap: 14px;">{campo("Tus fechas", "01/11/2026 – 31/01/2027", "250px", "calendario", True)}'
              f'<label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; padding-top: 18px;">{casilla_e(False)}Sólo los disponibles en tus fechas</label><span style="flex-grow: 1;"></span>'
              f'<span style="padding-top: 18px;">{leyenda_e([("c", "Contratado"), ("p", "Contratado en parte"), ("r", "Reserva provisional"), ("d", "Hueco elegido")])}</span></div>', pad="14px 18px")
    + tarjeta(svg_g, pad="16px 18px", extra="flex-grow: 1; overflow: hidden;"),
    capa=pop_g)
guardar_e("F03", "Contratos · línea de tiempo", e03)
print("E01 E03 ok")

# =====================================================================
# E04 · Nuevo contrato · paso 1: qué se contrata (los tres casos en un contrato)
# =====================================================================
PASOS = ["Qué se contrata", "Proveedor y vigencia", "Canon", "Confirmación"]
def stepper(act):
    out = '<div style="display: flex; align-items: center; gap: 10px;">'
    for i, p in enumerate(PASOS, 1):
        hecho, on = i < act, i == act
        circ = (f'background: {AZUL}; color: #fff;' if on else (f'background: {OKF}; color: {OKC}; border: 1.5px solid {OKC};' if hecho else f'background: {BLANCO_E}; color: {TXT3}; border: 1.5px solid {LINEA2};'))
        out += (f'<span style="display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;"><span style="width: 26px; height: 26px; border-radius: 999px; {circ} font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;">{ic("check", 14, OKC, 3) if hecho else i}</span>'
                f'<span style="font-size: 13.5px; font-weight: {700 if on else 600}; color: {INK if on else TXT2}; white-space: nowrap;">{p}</span></span>')
        if i < 4:
            out += f'<span style="flex-grow: 1; height: 2px; border-radius: 2px; background: {OKC if hecho else LINEA};"></span>'
    return out + "</div>"
def modo(opts, act):
    return segmentado(opts, act, True)
def linea_contrato(c, nombre, modo_html, cuerpo, tarifa):
    return tarjeta(f'<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;"><span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1;"><span style="font-size: 14.5px;">{cod(c, 14.5)} · <b style="font-weight: 600;">{nombre}</b></span>{gris("01/11/2026 – 31/01/2027 · 92 días")}</span>'
                   f'{modo_html}<span style="display: flex; flex-direction: column; align-items: flex-end; min-width: 130px;"><b style="font-size: 14px;">{tarifa}</b>{gris("tarifa de referencia", 11.5)}</span>{btn("Quitar", "enl", "x", 28, "color: " + TXT3 + ";")}</div>{cuerpo}', pad="16px 18px")
entrepanos = "".join(
    f'<span style="display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 12px; border-radius: 8px; border: 1.5px solid {AZUL if on else (LINEA if libre else LINEA)}; background: {AZUL_CL if on else (BLANCO_E if libre else NEUF)}; font-size: 13px; color: {INK if libre else TXT3};">'
    f'{casilla_e(on) if libre else ic("x", 14, TXT3)}<b style="font-family: ui-monospace, Menlo, monospace;">EN{n}</b><span style="flex-grow: 1;">{d}</span></span>'
    for n, d, libre, on in [(5, "Disponible", True, False), (4, "Disponible", True, True), (3, "Disponible", True, True), (2, "Café Montaña hasta 31/05/2027", False, False), (1, "Disponible", True, False)])
caso_entera = linea_contrato("PUN-08", "Punta de góndola 8", modo(["Entera"], "Entera"),
    f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: #F9FAFB; font-size: 13px;">{ic("info", 15, TXT3)}Este mueble se vende entero. Se contrata la punta completa.</div>', fmt(600000) + " /mes")
caso_partes = linea_contrato("GON-01 B", "Góndola 1 · cara B", modo(["Entera", "Por entrepaño", "Por participación"], "Por entrepaño"),
    f'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;"><div style="display: flex; flex-direction: column; gap: 6px;">{gris("Entrepaños de la cara B, contados desde la base (EN1):")}{entrepanos}</div>'
    f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 8px; background: #F9FAFB; font-size: 13px;"><b>2 entrepaños elegidos: EN3 y EN4</b>'
    f'{gris("Tarifa por entrepaño: la de la cara ÷ 5 entrepaños = " + fmt(90000) + " /mes")}{gris("La cara A la tiene Café Montaña: no se nombra en lo que ve el proveedor.")}</div></div>', fmt(180000) + " /mes")
caso_pct = linea_contrato("GON-03 A", "Góndola 3 · cara A", modo(["Entera", "Por entrepaño", "Por participación"], "Por participación"),
    f'<div style="display: flex; align-items: center; gap: 18px;"><div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px;">'
    f'<div style="display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: {NEUF};"><span style="width: 80%; background: #D0D5DD;"></span><span style="width: 20%; background: {AZUL};"></span></div>'
    f'<div style="display: flex; justify-content: space-between; font-size: 12.5px; color: {TXT3};"><span>80 % contratado por otros</span><span style="color: {AZUL_TX}; font-weight: 600;">Queda 20 % de la cara A</span></div></div>'
    f'{campo("Participación", "20 %", "120px", None, True, True)}</div>', fmt(90000) + " /mes")
resumen_c = tarjeta(tit_tarjeta("Este contrato", "", "3 líneas · 01/11/2026 – 31/01/2027")
    + "".join(f'<div style="display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid {LINEA}; font-size: 13px;"><span>{cod(a)} {gris(b)}</span><b>{c}</b></div>' for a, b, c in [("PUN-08", "entera", fmt(600000)), ("GON-01 B", "EN3 y EN4", fmt(180000)), ("GON-03 A", "20 %", fmt(90000))])
    + f'<div style="display: flex; justify-content: space-between; padding: 12px 0 4px; border-top: 1.5px solid {INK}; font-size: 14px;"><b>Tarifa de referencia</b><b>{fmt(870000)} /mes</b></div>'
    + gris("El canon se escribe en el paso 3; acá es sólo la referencia.")
    + f'<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">{btn("Sumar otro espacio", "sec", "mas2", 36, "width: 100%;")}{btn("Ver en 3D con el proveedor", "sec", "cubo", 36, "width: 100%;")}</div>', extra="width: 330px; flex-shrink: 0;")
e04 = shell("Contratos",
    cabecera("Nuevo contrato", "Paso 1 de 4 · Lo que se contrata depende de cómo está configurado cada mueble en el plano.", "", ["Contratos", "Nuevo contrato"])
    + tarjeta(stepper(1), pad="14px 20px")
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;"><div style="display: flex; flex-direction: column; gap: 14px; flex-grow: 1; min-width: 0;">{caso_entera}{caso_partes}{caso_pct}</div>{resumen_c}</div>'
    + f'<div style="display: flex; align-items: center; gap: 10px;">{btn("Cancelar", "sec")}<span style="flex-grow: 1;"></span>{gris("Las fechas vienen de la búsqueda; se cambian en el paso 2.")}{btn("Siguiente: proveedor y vigencia", "pri", "flecha", 40)}</div>')
guardar_e("F04", "Nuevo contrato · paso 1: qué se contrata", e04)

# =====================================================================
# E05 · Nuevo contrato · paso 4: confirmación
# =====================================================================
dest = lambda q, d, ok=True: (f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid {LINEA};">{casilla_e(ok)}'
                              f'<span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1;"><b style="font-size: 13.5px; font-weight: 600;">{q}</b>{gris(d)}</span></div>')
e05 = shell("Contratos",
    cabecera("Nuevo contrato", "Paso 4 de 4 · Revisá el contrato leído como una frase antes de guardarlo.", "", ["Contratos", "Nuevo contrato"])
    + tarjeta(stepper(4), pad="14px 20px")
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(f'<span style="font-size: 12px; font-weight: 700; color: {TXT3}; letter-spacing: .06em;">EL CONTRATO</span>'
              f'<p style="margin: 10px 0 18px; font-size: 21px; line-height: 1.45; font-weight: 500;"><b>Galletas Sol</b> contrata <b>PUN-08 · Punta de góndola 8</b> de la sede CENTRO del <b>01/11/2026</b> al <b>31/01/2027</b>, por un canon de <b>{fmt(600000)} /mes</b> ({fmt(1800000)} en total).</p>'
              f'<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px;">'
              + "".join(f'<span style="display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 10px; background: #F9FAFB; border: 1px solid {LINEA};">{gris(a, 12)}<b style="font-size: 14px;">{b}</b></span>' for a, b in [("Proveedor", "Galletas Sol"), ("Marca", "Sol"), ("Vigencia", "92 días"), ("Canon ÷ tarifa", "100 % · igual a la tarifa")])
              + f'</div><b style="font-size: 14px;">Planometría</b><div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 12px 14px; border-radius: 10px; border: 1px dashed {LINEA2};">'
              f'<span style="width: 40px; height: 40px; border-radius: 8px; background: {CRF}; display: inline-flex; align-items: center; justify-content: center;">{ic("archivo", 18, CRC)}</span>'
              f'<span style="display: flex; flex-direction: column; flex-grow: 1;"><b style="font-size: 13.5px;">sol-punta-navidad.pdf</b>{gris("1,2 MB · adjuntada")}</span>{btn("Cambiar", "sec", None, 32)}</div>', extra="flex: 1.5;")
    + tarjeta(tit_tarjeta("A quién se avisa", "", "Al guardar salen los correos.")
              + dest("Galletas Sol · ventas@galletassol.co", "Confirmación del contrato, sin tarifas")
              + dest("Ana Gómez · responsable comercial", "Copia del contrato")
              + dest("Luis Pérez · responsable de montaje", "Aviso de montaje con la planometría, sin montos")
              + f'<div style="margin-top: 12px;">{campo("Nota para el proveedor (opcional)", "El material llega el 30/10 por la puerta de carga.", "100%", None)}</div>', extra="flex: 1;")
    + "</div>"
    + f'<div style="display: flex; align-items: center; gap: 10px;">{btn("Atrás", "sec", "deshacer")}{btn("Empezar de nuevo", "enl")}<span style="flex-grow: 1;"></span>{btn("Reservar provisionalmente hasta…", "sec", "calendario", 40)}{btn("Guardar contrato", "pri", "check", 40)}</div>')
guardar_e("F05", "Nuevo contrato · paso 4: confirmación", e05)

# =====================================================================
# E06 · Ficha del espacio (sobre el plano de Contratos)
# =====================================================================
def tl12():
    # línea de 12 meses de PUN-05
    w = 380
    X = lambda d: (d - VI).days / ((VF - VI).days + 1) * w
    g = f'<rect x="0" y="6" width="{w}" height="20" rx="5" fill="{NEUF}"/>'
    for a, b, t, e in [(date(2026, 10, 1), date(2026, 12, 14), "Galletas Sol", "c"), (date(2026, 12, 15), date(2027, 3, 31), "Disponible", "d"), (date(2027, 4, 1), date(2027, 6, 30), "Snacks Andes", "c"), (date(2027, 7, 1), date(2027, 9, 30), "Disponible", "d")]:
        fl, st, _ = EST_E[e]
        g += f'<rect x="{X(a):.1f}" y="6" width="{X(b) - X(a):.1f}" height="20" rx="4" fill="{fl}" stroke="{st}" stroke-width="1.2"/>'
    g += f'<line x1="{X(HOY):.1f}" x2="{X(HOY):.1f}" y1="0" y2="32" stroke="{CRC}" stroke-width="1.6"/>'
    for i, m in enumerate(["oct", "ene", "abr", "jul"]):
        g += f'<text x="{i * w / 4 + 2:.1f}" y="44" font-size="11" fill="{TXT3}">{m}</text>'
    return f'<svg width="100%" viewBox="0 0 {w} 48" role="img" aria-label="Línea de 12 meses de PUN-05">{g}</svg>'
dato = lambda a, b: f'<div style="display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid {LINEA}; font-size: 13px;"><span style="color: {TXT3};">{a}</span><b style="font-weight: 600; text-align: right;">{b}</b></div>'
ficha = (f'<aside style="position: absolute; right: 0; top: 64px; bottom: 0; width: 470px; background: {BLANCO_E}; border-left: 1px solid {LINEA}; box-shadow: -12px 0 32px rgba(16,24,40,.12); display: flex; flex-direction: column; z-index: 5;">'
         f'<div style="display: flex; align-items: flex-start; gap: 10px; padding: 20px 22px 14px; border-bottom: 1px solid {LINEA};"><span style="display: flex; flex-direction: column; gap: 6px; flex-grow: 1;">'
         f'<span style="font-size: 18px;">{cod("PUN-05", 18)} · <b style="font-weight: 650;">Punta de góndola 5</b></span><span style="display: flex; gap: 8px;">{pill("crit", "Contratado · hasta 14/12/2026", "archivo")}</span></span>{btn("Cerrar", "sec", "x", 32)}</div>'
         f'<div style="display: flex; flex-direction: column; gap: 16px; padding: 16px 22px; overflow: hidden; flex-grow: 1;">'
         f'<div>{dato("Proveedor y marca", "Galletas Sol · Sol")}{dato("Vigencia", "15/09/2026 – 14/12/2026")}{dato("Canon", fmt(540000) + " /mes · " + fmt(1620000) + " total")}{dato("Montaje", "Montado, sin verificar")}</div>'
         f'<div style="display: flex; flex-direction: column; gap: 6px;"><b style="font-size: 13.5px;">Próximos 12 meses</b>{tl12()}'
         f'<div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; background: {OKF}; font-size: 13px; color: {OKC};">{ic("ok", 16, OKC, 2)}<span><b>Disponible del 15/12/2026 al 31/03/2027</b> · 107 días. Después, Snacks Andes desde el 01/04/2027.</span></div></div>'
         + btn("Contratar del 15/12/2026 al 31/03/2027", "pri", "flecha", 40, "width: 100%;")
         + f'<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">{btn("Renovar", "sec", "rotar", 36)}{btn("Editar contrato", "sec", "lapiz", 36)}{btn("Ver en 3D", "sec", "cubo", 36)}</div>'
         f'<div><b style="font-size: 13.5px;">Montaje y documentos</b>'
         f'<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">'
         + "".join(f'<span style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid {LINEA}; font-size: 13px;">{ic(i, 16, TXT2)}<span style="flex-grow: 1;">{t}</span>{btn(a, "enl", None, 24)}</span>' for i, t, a in [("archivo", "Planometría · sol-punta.pdf", "Cambiar"), ("camara", "Foto del montaje · 16/09/2026", "Verificar"), ("planilla", "Contrato firmado.pdf", "Descargar")])
         + f'</div></div><div><b style="font-size: 13.5px;">Exhibición</b><div style="display: flex; gap: 8px; margin-top: 8px;">{btn("Planograma de la cara", "sec", "estantes", 34)}{btn("Distribuir la cara", "sec", "franja", 34)}</div></div>'
         f'<div style="display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid {LINEA}; font-size: 13px; font-weight: 600; color: {TXT2};">{ic("abajo", 15, TXT2, 2)}Otras acciones del contrato: con otro proveedor · negociar · cancelar</div>'
         f'</div></aside>')
e06 = shell("Contratos",
    cabecera("Contratos", "Tocá un espacio en el plano para ver su ficha.", btn("Cargar desde planilla", "sec", "planilla"))
    + pestanas_e(["Disponibilidad", "Línea de tiempo"], "Disponibilidad")
    + tarjeta(plano_svg(EST_FECHAS, ETQ_FECHAS, sel="PUN-05", vb=(130, 20, 640, 470)), extra="flex-grow: 1; display: flex; flex-direction: column; margin-right: 470px;"),
    capa=ficha)
guardar_e("F06", "Ficha del espacio", e06)

# =====================================================================
# E07 · Bandeja de Pendientes
# =====================================================================
def pend(icono, tipo, t, d, acciones):
    c, bg = (CRC, CRF) if tipo == "crit" else ((ATC, ATF) if tipo == "aten" else (AZUL_TX, AZUL_CL))
    return (f'<div style="display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid {LINEA};"><span style="width: 34px; height: 34px; border-radius: 8px; background: {bg}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{ic(icono, 17, c, 2)}</span>'
            f'<span style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(d)}<span style="display: flex; gap: 8px; margin-top: 6px;">{acciones}</span></span></div>')
bandeja = (f'<aside style="position: absolute; right: 24px; top: 72px; width: 500px; bottom: 24px; background: {BLANCO_E}; border: 1px solid {LINEA}; border-radius: 14px; box-shadow: 0 20px 40px rgba(16,24,40,.18); display: flex; flex-direction: column; z-index: 6;">'
           f'<div style="display: flex; align-items: center; gap: 10px; padding: 18px 20px 12px;"><b style="font-size: 17px; flex-grow: 1;">Pendientes · Sede CENTRO</b>{btn("Cerrar", "sec", "x", 32)}</div>'
           f'<div style="padding: 0 20px;">{pestanas_e([("Fecha límite hoy", 3), ("Próximos 30 días", 8), ("Inconsistencias", 3)], "Fecha límite hoy")}</div>'
           f'<div style="padding: 4px 20px; overflow: hidden; flex-grow: 1;">'
           + pend("reloj", "crit", "PUN-07 vence en 4 días, sin renovación", "Galletas Sol · " + fmt(600000) + " /mes · vence el 30/10/2026", btn("Renovar contrato", "sec", "rotar", 32) + btn("No renovar", "enl", None, 32))
           + pend("montajes", "crit", "Montaje no realizado · PUN-03", "Luis Pérez · 25/10/2026 · «El proveedor no entregó el material»", btn("Ver registro y foto", "sec", "camara", 32) + btn("Reclamar al proveedor", "enl", None, 32))
           + pend("calendario", "aten", "La reserva provisional caduca hoy · GON-13", "Lácteos Andinos · 01/11/2026 – 31/01/2027", btn("Confirmar como contrato", "sec", "check", 32) + btn("Cancelar reserva", "enl", None, 32))
           + f'<div style="margin-top: 10px; padding: 12px 14px; border-radius: 10px; background: #F9FAFB; font-size: 12.5px; color: {TXT2};">Al resolver un pendiente sale de la lista y aparece «Deshacer» por unos segundos. Pasá el mouse sobre uno para ver el espacio marcado en el plano.</div>'
           + "</div></aside>")
e07 = shell("Contratos",
    cabecera("Contratos", "La bandeja se abre encima de cualquier módulo, sin perder lo que estabas haciendo.", btn("Cargar desde planilla", "sec", "planilla"))
    + pestanas_e(["Disponibilidad", "Línea de tiempo"], "Disponibilidad")
    + tarjeta(plano_svg(EST_FECHAS, ETQ_FECHAS, sel="PUN-07", vb=(10, 16, 985, 500)), extra="flex-grow: 1; display: flex; flex-direction: column;"),
    pend_abierta=True,
    capa=f'<div style="position: absolute; inset: 64px 0 0 0; background: rgba(16,24,40,.25); z-index: 4;"></div>' + bandeja)
guardar_e("F07", "Bandeja de Pendientes", e07)
print("E04-E07 ok")

# ---------- dibujo de una punta con producto (planometría o foto) ----------
PROD = ["#C2410C", "#F59E0B", "#7C2D12", "#FBBF24", "#B45309"]
def punta_svg(foto=False, w=300, h=400, faltan=False):
    g = ""
    if foto:
        g += f'<defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B7E6A"/><stop offset="1" stop-color="#3E3529"/></linearGradient></defs><rect width="{w}" height="{h}" fill="url(#fg)"/>'
        g += f'<g transform="translate(18 10) skewX(-2)">'
    else:
        g += f'<rect width="{w}" height="{h}" fill="#FFFFFF"/><g transform="translate(18 10)">'
    W, H = w - 36, h - 20
    g += f'<rect x="0" y="0" width="{W}" height="{H}" rx="4" fill="{"#D9D4CB" if foto else "#F9FAFB"}" stroke="{"#2B2620" if foto else "#98A2B3"}" stroke-width="2"/>'
    if not (foto and faltan):
        g += f'<rect x="8" y="8" width="{W - 16}" height="44" rx="4" fill="#F2B705"/><text x="{W / 2}" y="36" text-anchor="middle" font-size="16" font-weight="800" fill="#101828">GALLETAS SOL · NAVIDAD</text>'
    else:
        g += f'<rect x="8" y="8" width="{W - 16}" height="44" rx="4" fill="none" stroke="#8B7E6A" stroke-dasharray="5 4"/>'
    for i in range(4):
        y = 64 + i * (H - 72) / 4
        sh = (H - 72) / 4
        g += f'<rect x="6" y="{y + sh - 8:.1f}" width="{W - 12}" height="6" fill="{"#5B5246" if foto else "#D0D5DD"}"/>'
        n = 6
        for j in range(n):
            if foto and faltan and i == 2 and j in (3, 4):
                continue
            bx = 14 + j * (W - 28) / n
            col = PROD[(i + j) % len(PROD)]
            g += f'<rect x="{bx + 3:.1f}" y="{y + 10:.1f}" width="{(W - 28) / n - 6:.1f}" height="{sh - 22:.1f}" rx="3" fill="{col}" opacity="{.82 if foto else 1}"/>'
    g += "</g>"
    if not foto:
        g += f'<text x="{w - 10}" y="{h - 6}" text-anchor="end" font-size="11" fill="{TXT3}">planometría</text>'
    return f'<svg width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="{"Foto del montaje" if foto else "Planometría"}" style="display: block;">{g}</svg>'

# =====================================================================
# E08 · Montajes
# =====================================================================
clase = lambda t: f'<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; background: {NEUF}; font-size: 12px; font-weight: 600; color: #344054;">{t}</span>'
MONT = [("PUN-08", "Contrato", "Galletas Sol", "01/11/2026", pill("neu", "Aviso enviado · sin montar"), btn("Ver aviso", "enl", None, 26)),
        ("PUN-05", "Contrato", "Galletas Sol", "15/09/2026", pill("aten", "Montado, sin verificar"), btn("Verificar montaje", "enl", None, 26)),
        ("PUN-03", "Contrato", "Café Montaña", "01/08/2026", pill("crit", "No realizado · sin material"), btn("Resolver", "enl", None, 26)),
        ("GON-02 A", "Contrato", "Aseo Total", "01/02/2026", pill("neu", "Sin montar · falta planometría"), btn("Adjuntar planometría", "enl", None, 26)),
        ("GON-03 A", "Participación", "Lácteos Andinos · 25 %", "01/10/2026", pill("aten", "Falta ubicar la zona"), btn("Ubicar la zona", "enl", None, 26)),
        ("GON-05 A", "Planograma", "Versión 2", "24/10/2026", pill("aten", "Montada, falta revisar"), btn("Revisar", "enl", None, 26)),
        ("GON-12 A", "Planograma", "Versión 1", "15/10/2026", pill("ok", "Verificado: coincide"), btn("Ver historial", "enl", None, 26)),
        ("PUN-06", "Contrato", "Bebidas del Valle", "01/09/2026", pill("ok", "Verificado: coincide"), btn("Ver historial", "enl", None, 26)),
        ("NEV-01", "Contrato", "Lácteos Andinos", "01/03/2026", pill("ok", "Verificado: coincide"), btn("Ver historial", "enl", None, 26))]
tabla_m = tabla("0.8fr 1fr 1.5fr 0.9fr 1.9fr 1.3fr", ["Espacio o cara", "Clase", "Proveedor o versión", "Inicio", "Estado", "Acción"],
                [(cod(a), clase(b), c, d, e, f_) for a, b, c, d, e, f_ in MONT], sel=1)
detalle_m = tarjeta(
    f'<div style="display: flex; gap: 18px; height: 100%;">'
    f'<div style="display: flex; flex-direction: column; gap: 10px; width: 340px; flex-shrink: 0;"><span style="display: flex; align-items: center; gap: 8px;">{cod("PUN-05", 15)}<b style="font-size: 15px;">· Galletas Sol</b></span>{pill("aten", "Montado, sin verificar")}'
    f'{dato("Registró", "Luis Pérez · 16/09/2026 9:12")}{dato("Nota", "Quedó con la cenefa navideña")}{dato("Vigencia", "15/09/2026 – 14/12/2026")}'
    f'<span style="flex-grow: 1;"></span>{btn("Verificar montaje", "pri", "check", 38, "width: 100%;")}</div>'
    f'<div style="flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0;"><b style="font-size: 12.5px; color: {TXT2};">Cómo debía quedar</b><div style="flex-grow: 1; min-height: 0; border: 1px solid {LINEA}; border-radius: 8px; overflow: hidden;">{punta_svg(False, 300, 400)}</div></div>'
    f'<div style="flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0;"><b style="font-size: 12.5px; color: {TXT2};">Cómo quedó · foto</b><div style="flex-grow: 1; min-height: 0; border: 1px solid {LINEA}; border-radius: 8px; overflow: hidden; background: #3E3529;">{punta_svg(True, 300, 400, True)}</div></div></div>',
    pad="16px 18px", extra="height: 290px; flex-shrink: 0;")
e08 = shell("Montajes",
    cabecera("Montajes", "Contratos y planogramas en una sola lista, por fecha de inicio. Tocá una fila para ver el detalle.", segmentado([("Lista", "lista"), ("En el plano", "mapa")], "Lista") + btn("Responsable: todos", "sec", "usuario"))
    + pestanas_e([("Todos", 9), ("Sin montar", 3), ("Montado, sin verificar", 2), ("No realizado", 1), ("Verificado", 3)], "Todos")
    + tarjeta(tabla_m, pad="0", extra="overflow: hidden; flex-grow: 1;")
    + detalle_m)
guardar_e("F08", "Montajes", e08)

# =====================================================================
# E09 · Verificar el montaje de un contrato
# =====================================================================
opcion = lambda t, d, on, icono, c: (f'<span style="display: flex; align-items: flex-start; gap: 12px; flex: 1; padding: 14px 16px; border-radius: 10px; border: {"2px solid " + AZUL if on else "1px solid " + LINEA2}; background: {AZUL_CL if on else BLANCO_E};">'
                                     f'<span style="width: 18px; height: 18px; border-radius: 99px; border: {"5px solid " + AZUL if on else "1.5px solid " + LINEA2}; box-sizing: border-box; flex-shrink: 0; margin-top: 2px; background: #fff;"></span>'
                                     f'<span style="display: flex; flex-direction: column; gap: 3px;"><b style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px;">{ic(icono, 16, c, 2.2)}{t}</b>{gris(d)}</span></span>')
e09 = shell("Montajes",
    cabecera("Verificar montaje · PUN-05", "Galletas Sol · registrado el 16/09/2026 a las 9:12 por Luis Pérez · «Quedó con la cenefa navideña»", btn("Ver historial", "sec", "reloj"), ["Montajes", "Verificar montaje"])
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(tit_tarjeta("Cómo debía quedar · planometría", btn("Abrir PDF", "enl", "archivo", 26), "sol-punta-navidad.pdf · adjuntada al contrato") + f'<div style="flex-grow: 1; min-height: 0; border: 1px solid {LINEA}; border-radius: 8px; overflow: hidden;">{punta_svg(False)}</div>', extra="flex: 1; display: flex; flex-direction: column;")
    + tarjeta(tit_tarjeta("Cómo quedó · foto del montaje", btn("Ampliar", "enl", "ojo", 26), "16/09/2026 9:12 · Luis Pérez") + f'<div style="flex-grow: 1; min-height: 0; border-radius: 8px; overflow: hidden; background: #3E3529;">{punta_svg(True, faltan=True)}</div>', extra="flex: 1; display: flex; flex-direction: column;")
    + "</div>"
    + tarjeta(f'<div style="display: flex; gap: 14px; align-items: stretch;">'
              + opcion("Coincide", "Queda verificado con tu nombre y la fecha.", False, "ok", OKC)
              + opcion("No coincide", "Escribí qué hay que corregir; se reenvía el aviso de montaje.", True, "error", CRC)
              + f'<div style="flex: 1.4; display: flex; flex-direction: column; gap: 8px;">{campo("Qué hay que corregir", "Falta la cenefa superior y hay un hueco en el tercer estante.", "100%", None)}'
              f'<label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px;">{casilla_e(True)}Reenviar el aviso a Luis Pérez para el 28/10/2026</label></div></div>', pad="16px 18px")
    + f'<div style="display: flex; align-items: center; gap: 10px;">{btn("Volver a Montajes", "sec", "deshacer")}<span style="flex-grow: 1;"></span>{btn("Confirmar: no coincide", "pri", "check", 40)}</div>')
guardar_e("F09", "Verificar el montaje de un contrato", e09)

# =====================================================================
# E10 · Plano de la sede (2D) con la ficha del mueble
# =====================================================================
fam = lambda i, t, n: f'<span style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid {LINEA}; font-size: 13px;">{ic(i, 16, TXT2)}<span style="flex-grow: 1;">{t}</span>{gris(n, 11.5)}</span>'
catalogo = tarjeta(f'<b style="font-size: 14px; display: block;">Catálogo</b>{gris("Arrastrá un mueble al plano.")}'
                   f'<div style="margin: 10px 0;">{campo("", "Buscar mueble", "100%", "buscar")}</div>'
                   f'<div style="display: flex; flex-direction: column; gap: 6px;">'
                   + fam("franja", "Góndola doble", "3") + fam("estantes", "Góndola sencilla", "2") + fam("cuadros", "Punta de góndola", "2") + fam("puerta", "Nevera", "4")
                   + fam("producto", "Exhibidor", "3") + fam("capas", "Isla", "1") + fam("sede", "Cabecera de caja", "1")
                   + f'</div><div style="margin-top: 10px;">{btn("Ver el catálogo completo", "enl", "chev", 26)}</div>', pad="14px", extra="width: 200px; flex-shrink: 0;")
herram = (f'<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">{segmentado(["Ver", "Editar"], "Editar", True)}'
          f'<span style="width: 1px; height: 24px; background: {LINEA};"></span>'
          + "".join(btn(t, "sec", i, 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") for t, i in [("Deshacer", "deshacer"), ("Rehacer", "rehacer"), ("Rotar", "rotar"), ("Duplicar", "copiar")]) + btn("Eliminar", "peligro", "papelera", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;")
          + "</div>")
plano_n = {c: "n" for c, *_ in MUEBLES}
centro = tarjeta(herram + plano_svg(plano_n, {}, sel="GON-03", vb=(0, 0, 1000, 520), cotas=True)
                 + f'<div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">{pill("ok", "Validación: sin inconsistencias")}{gris("16 muebles · 22 espacios contratables")}<span style="flex-grow: 1;"></span>{segmentado(["−", "100 %", "+"], "100 %", True)}</div>',
                 pad="14px 16px", extra="flex-grow: 1; display: flex; flex-direction: column;")
ficha_m = tarjeta(f'<span style="font-size: 16px;">{cod("GON-03", 16)} · <b style="font-weight: 650;">Góndola 3</b></span>'
                  f'<div style="margin: 4px 0 12px;">{gris("Góndola doble · pasillo 2 · 1,20 × 0,60 × 1,80 m · 2 caras")}</div>'
                  + pestanas_e(["Mueble", "Contratación", "Medidas", "Documentos"], "Contratación", 11)
                  + f'<div style="display: flex; flex-direction: column; gap: 14px; margin-top: 14px;">'
                  f'<div style="display: flex; align-items: center; justify-content: space-between;"><b style="font-size: 13px;">¿Se puede contratar?</b>{segmentado(["Sí", "No"], "Sí", True)}</div>'
                  f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid {LINEA};"><b style="font-size: 13px;">Cara A · cómo se contrata</b>{segmentado(["Entera", "Por partes", "Participación"], "Participación", True)}'
                  f'<div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: {NEUF};"><span style="width: 80%; background: #D0D5DD;"></span></div>{gris("80 % contratado · queda 20 %")}{btn("Distribuir la cara A", "sec", "franja", 32)}</div>'
                  f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid {LINEA};"><b style="font-size: 13px;">Cara B · cómo se contrata</b>{segmentado(["Entera", "Por partes", "Participación"], "Entera", True)}'
                  f'{gris("Café Montaña hasta el 31/05/2027")}{btn("Planograma de la cara B", "sec", "estantes", 32)}</div>'
                  f'<label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px;">{casilla_e(False)}Aplicar a todas las góndolas dobles de la sede</label>'
                  f'</div>', pad="16px", extra="width: 318px; flex-shrink: 0;")
e10 = shell("Plano de la sede",
    cabecera("Plano de la sede", "CENTRO · 40,00 × 20,00 m · entrada en el lado sur", pill("ok", "Guardado", "check") + btn("Contorno de la sede", "sec", "lapiz") + segmentado(["2D", "3D"], "2D"))
    + f'<div style="display: flex; gap: 16px; flex-grow: 1; min-height: 0;">{catalogo}{centro}{ficha_m}</div>')
guardar_e("F10", "Plano de la sede · 2D y ficha del mueble", e10)

# =====================================================================
# E11 · Plano de la sede en 3D (isométrico)
# =====================================================================
ALTO = {"GON": 75, "PUN": 62, "NEV": 95}
EST_3D = {"PUN-08": "d", "PUN-09": "d", "GON-12": "d", "GON-13": "r", "GON-04": "p", "GON-01": "p", "GON-03": "p", "NEV-01": "p", "PUN-02": "p"}
def iso(w=960, h=600, sel="PUN-08"):
    k, ox, oy = .62, 330, 40
    P = lambda x, y, z=0: (ox + (x - y) * .866 * k, oy + (x + y) * .5 * k - z * k)
    pts = lambda L: " ".join(f"{a:.1f},{b:.1f}" for a, b in L)
    g = f'<polygon points="{pts([P(20, 20), P(980, 20), P(980, 500), P(20, 500)])}" fill="#EEF0F3" stroke="#98A2B3" stroke-width="1.5"/>'
    for i in range(0, 1000, 80):
        g += f'<polyline points="{pts([P(i if i > 20 else 20, 20), P(i if i > 20 else 20, 500)])}" stroke="#E4E7EC" stroke-width="1"/>'
    g += f'<polygon points="{pts([P(20, 20, 0), P(980, 20, 0), P(980, 20, 110), P(20, 20, 110)])}" fill="#F9FAFB" stroke="#D0D5DD"/>'
    g += f'<polygon points="{pts([P(20, 20, 0), P(20, 500, 0), P(20, 500, 110), P(20, 20, 110)])}" fill="#F2F4F7" stroke="#D0D5DD"/>'
    ex, ey = P(480, 505)
    g += f'<text x="{ex:.1f}" y="{ey + 20:.1f}" text-anchor="middle" font-size="14" font-weight="600" fill="{AZUL_TX}">Entrada</text>'
    for c, x, y, ww, hh, _ in sorted(MUEBLES, key=lambda m: (m[1] + m[3]) + (m[2] + m[4])):
        z = ALTO[c[:3]] if c[:3] in ALTO else 60
        if c == "PUN-09":
            z = 45
        e = EST_3D.get(c, "c")
        fill, st, _d = EST_E[e]
        top = pts([P(x, y, z), P(x + ww, y, z), P(x + ww, y + hh, z), P(x, y + hh, z)])
        front = pts([P(x, y + hh, 0), P(x + ww, y + hh, 0), P(x + ww, y + hh, z), P(x, y + hh, z)])
        side = pts([P(x + ww, y, 0), P(x + ww, y + hh, 0), P(x + ww, y + hh, z), P(x + ww, y, z)])
        swc = INK if c == sel else st
        sw = 2.6 if c == sel else 1.2
        g += f'<polygon points="{side}" fill="{st}" fill-opacity=".55" stroke="{swc}" stroke-width="{sw}"/><polygon points="{front}" fill="{st}" fill-opacity=".35" stroke="{swc}" stroke-width="{sw}"/><polygon points="{top}" fill="{fill}" stroke="{swc}" stroke-width="{sw}"/>'
        # estantes en la cara frontal
        for t in (0.33, 0.66):
            a, b = P(x, y + hh, z * t), P(x + ww, y + hh, z * t)
            g += f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>'
        tx, ty = P(x + ww / 2, y + hh / 2, z)
        g += f'<text x="{tx:.1f}" y="{ty + 4:.1f}" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="11" font-weight="700" fill="{INK}">{c}</text>'
    return f'<svg width="100%" height="100%" viewBox="0 0 {w} {h}" role="img" aria-label="Sede CENTRO en 3D" style="display: block;">{g}</svg>'
panel3d = tarjeta(f'<span style="font-size: 16px;">{cod("PUN-08", 16)} · <b style="font-weight: 650;">Punta de góndola 8</b></span><div style="margin: 6px 0 12px;">{pill("ok", "Disponible desde el 08/10/2026")}</div>'
                  f'{dato("Medidas", "0,90 × 0,60 × 1,60 m")}{dato("Tarifa", fmt(600000) + " /mes")}{dato("Pasillo", "4 · frente a la entrada")}'
                  f'<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">{btn("Probar un producto", "sec", "producto", 36, "width: 100%;")}{btn("Encuadrar", "sec", "ojo", 36, "width: 100%;")}{btn("Rotar (R)", "sec", "rotar", 36, "width: 100%;")}{btn("Ver la ficha completa", "enl", "chev", 30)}</div>'
                  f'<div style="margin-top: 16px; padding: 12px; border-radius: 8px; background: #F9FAFB; font-size: 12.5px; color: {TXT2};">En la reunión, «Presentar al proveedor» oculta tarifas, precios y nombres de otros proveedores.</div>', pad="16px", extra="width: 300px; flex-shrink: 0;")
barra3d = (f'<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">{segmentado([("Cenital", "mapa"), ("Primera persona", "usuario"), ("Orbital", "rotar")], "Orbital", True)}'
           f'{segmentado(["Con arte", "Sin arte"], "Con arte", True)}<span style="flex-grow: 1;"></span>{btn("Bajar imagen", "sec", "descargar", 32)}{btn("Más", "sec", "mas", 32)}</div>')
e11 = shell("Plano de la sede",
    cabecera("Plano de la sede", "CENTRO en 3D · arrastrá para girar, rueda para acercar, WASD para caminar en primera persona.", pill("ok", "Guardado", "check") + segmentado(["2D", "3D"], "3D") + btn("Presentar al proveedor", "pri", "presentar"))
    + f'<div style="display: flex; gap: 16px; flex-grow: 1; min-height: 0;">'
    + tarjeta(barra3d + f'<div style="flex-grow: 1; min-height: 0; border-radius: 8px; background: linear-gradient(#FBFCFD, #F2F4F7); overflow: hidden;">{iso()}</div>'
              + f'<div style="margin-top: 8px;">{leyenda_e([("d", "Disponible"), ("p", "Contratado en parte"), ("c", "Contratado"), ("r", "Reservado")])}</div>', pad="14px 16px", extra="flex-grow: 1; display: flex; flex-direction: column;")
    + panel3d + "</div>")
guardar_e("F11", "Plano de la sede · 3D", e11)
print("E08-E11 ok")

# ---------- una cara de mueble con zonas (franjas) ----------
def cara_svg(zonas, estantes=5, w=760, h=540, marca_hueco=None, gris_vendido=None):
    """zonas: [(desde %, hasta %, etiqueta, color, rayado)] en franjas verticales."""
    X0, Y0, W, H = 30, 16, w - 60, h - 52
    g = f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" rx="4" fill="#FFFFFF" stroke="#98A2B3" stroke-width="2"/>'
    g += f'<defs><pattern id="ray" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#F2F4F7"/><line x1="0" y1="0" x2="0" y2="8" stroke="#D0D5DD" stroke-width="3"/></pattern></defs>'
    for a, b, t, col, ray in zonas:
        x, ww = X0 + a / 100 * W, (b - a) / 100 * W
        if ray:
            g += f'<rect x="{x + 3:.1f}" y="{Y0 + 3}" width="{ww - 6:.1f}" height="{H - 6}" rx="4" fill="url(#ray)" stroke="#98A2B3" stroke-dasharray="6 4"/>'
        else:
            g += f'<rect x="{x + 3:.1f}" y="{Y0 + 3}" width="{ww - 6:.1f}" height="{H - 6}" rx="4" fill="{col}" fill-opacity=".18" stroke="{col}" stroke-width="2"/>'
        lines = t.split("|")
        for i, ln in enumerate(lines):
            g += f'<text x="{x + ww / 2:.1f}" y="{Y0 + H / 2 - 8 + i * 20:.1f}" text-anchor="middle" font-size="{15 if i == 0 else 13.5}" font-weight="{700 if i == 0 else 600}" fill="{INK if i == 0 else TXT2}">{ln}</text>'
    for i in range(1, estantes):
        y = Y0 + i * H / estantes
        g += f'<line x1="{X0}" x2="{X0 + W}" y1="{y:.1f}" y2="{y:.1f}" stroke="#98A2B3" stroke-width="1.5" stroke-dasharray="2 3"/>'
    for i in range(estantes):
        y = Y0 + (i + .5) * H / estantes
        g += f'<circle cx="{X0 - 14}" cy="{y:.1f}" r="9" fill="#fff" stroke="#98A2B3"/><text x="{X0 - 14}" y="{y + 4:.1f}" text-anchor="middle" font-size="11" fill="{TXT2}">{i + 1}</text>'
    for p in (0, 25, 50, 75, 100):
        x = X0 + p / 100 * W
        g += f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{Y0 + H + 4}" y2="{Y0 + H + 10}" stroke="#98A2B3"/><text x="{x:.1f}" y="{Y0 + H + 24}" text-anchor="middle" font-size="11.5" fill="{TXT3}">{int(p * 1.2)} cm</text>'
    return f'<svg width="100%" height="100%" viewBox="0 0 {w} {h}" role="img" aria-label="Cara del mueble" style="display: block;">{g}</svg>'
C1, C2, C3 = "#2a78d6", "#7A5AF8", "#DD2590"

# =====================================================================
# E12 · Distribuir una cara por participación
# =====================================================================
zon12 = [(0, 40, "Café Montaña|40 %", C1, False), (40, 65, "Lácteos Andinos|25 %", C2, False), (65, 100, "Sin dibujar|35 % libre", None, True)]
part = lambda col, t, pct, est: (f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid {LINEA};"><span style="width: 12px; height: 12px; border-radius: 3px; background: {col}; flex-shrink: 0;"></span>'
                                  f'<span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(pct)}</span>{est}</div>')
herr12 = (f'<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">'
          f'<span style="font-size: 12.5px; color: {TXT2}; font-weight: 600;">Forma</span>{segmentado([("Franja", "franja"), ("Estantes", "estantes"), ("A mano", "mano")], "Franja", True)}'
          + btn("Acomodar solas", "sec", "cuadros", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + btn("Deshacer", "sec", "deshacer", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + btn("Rehacer", "sec", "rehacer", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + f'<span style="flex-grow: 1;"></span>{btn("Ver en 3D", "sec", "cubo", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;")}</div>')
e12 = shell("Plano de la sede",
    cabecera("Distribuir la cara · GON-03 · cara A", "Ubicá la zona de cada marca contratada por porcentaje. El dibujo no cambia el porcentaje del contrato.", segmentado(["Cara A", "Cara B"], "Cara A") + btn("Más", "sec", "mas") + btn("Salir", "sec", "x") + btn("Listo, guardar la cara", "pri", "check"), ["Plano de la sede", "GON-03", "Distribuir la cara A"])
    + f'<div style="display: flex; gap: 16px; flex-grow: 1; min-height: 0;">'
    + tarjeta(herr12 + f'<div style="flex-grow: 1; min-height: 0;">{cara_svg(zon12)}</div>', pad="14px 16px", extra="flex-grow: 1; display: flex; flex-direction: column;")
    + tarjeta(tit_tarjeta("Participaciones de la cara A", "", "1,20 m · 5 estantes")
              + f'<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;"><div style="display: flex; height: 10px; border-radius: 4px; overflow: hidden; background: {NEUF};"><span style="width: 40%; background: {C1};"></span><span style="width: 25%; background: {C2};"></span><span style="width: 15%; background: {C3}; opacity: .35;"></span></div>'
              f'<div style="display: flex; justify-content: space-between; font-size: 12px; color: {TXT2};"><span>Contratado 80 %</span><span>Dibujado 65 %</span><span>Falta ubicar 15 %</span></div></div>'
              + part(C1, "Café Montaña", "40 % · hasta 31/03/2027", pill("ok", "Ubicada"))
              + part(C2, "Lácteos Andinos", "25 % · hasta 31/03/2027", pill("ok", "Ubicada"))
              + part(C3, "Galletas Sol", "15 % · desde 01/11/2026", btn("Ubicar", "sec", "pin", 30))
              + part("#D0D5DD", "Disponible", "20 % · sin contrato", btn("Contratar", "enl", None, 26))
              + f'<div style="margin-top: 12px; padding: 12px; border-radius: 8px; background: {ATF}; font-size: 12.5px; color: {ATC}; display: flex; gap: 8px;">{ic("triangulo", 15, ATC, 2)}<span>Galletas Sol no recibe el aviso de montaje hasta que su zona quede ubicada.</span></div>', extra="width: 360px; flex-shrink: 0;")
    + "</div>")
guardar_e("F12", "Distribuir la cara por participación", e12)

# =====================================================================
# E13 · Planograma · planificar la cara de un mueble que no se vende
# =====================================================================
zon13 = [(0, 30, "1 · Arroz La Esquina|30 %", C1, False), (30, 55, "2 · Aceites|25 %", C2, False), (55, 80, "3 · Pastas|25 %", C3, False), (80, 100, "4 · 2×1 granos|20 %", "#0E9384", False)]
destino = lambda n, col, t, tipo, pct: (f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid {LINEA}; background: {BLANCO_E};">'
                                        f'<span style="width: 24px; height: 24px; border-radius: 99px; background: {col}; color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{n}</span>'
                                        f'<span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(tipo, 12)}</span><b style="font-size: 13.5px; white-space: nowrap;">{pct}</b>{ic("mas3", 15, TXT3)}</div>')
check = lambda t: f'<div style="display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 13px;">{ic("ok", 17, OKC, 2)}{t}</div>'
e13 = shell("Plano de la sede",
    cabecera("Planificar la cara · GON-05 · cara A", "Góndola 5 · no se vende · 1,20 m · 5 estantes · Editando el borrador · guardado hace 20 s", btn("Versiones", "sec", "reloj") + btn("Vista previa de la guía", "sec", "ojo") + btn("Guardar borrador", "sec", "check") + btn("Publicar versión 3", "pri", "enviar"), ["Plano de la sede", "GON-05", "Planograma de la cara A"])
    + f'<div style="display: flex; gap: 16px; flex-grow: 1; min-height: 0;">'
    + tarjeta(tit_tarjeta("Destinos de la cara", "", "Arrastrá cada uno a la cara.") + f'<div style="display: flex; flex-direction: column; gap: 8px;">'
              + destino(1, C1, "Arroz La Esquina", "Marca propia", "30 %") + destino(2, C2, "Aceites", "Categoría", "25 %") + destino(3, C3, "Pastas", "Categoría", "25 %") + destino(4, "#0E9384", "2×1 granos", "Promoción · hasta 30/11/2026", "20 %")
              + f'</div><div style="margin-top: 12px;">{btn("Agregar destino", "sec", "mas2", 36, "width: 100%;")}</div>', extra="width: 270px; flex-shrink: 0;")
    + tarjeta(f'<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">{segmentado([("Franja", "franja"), ("Estantes", "estantes"), ("A mano", "mano")], "Franja", True)}'
              + btn("Acomodar solos", "sec", "cuadros", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + btn("Deshacer", "sec", "deshacer", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + btn("Rehacer", "sec", "rehacer", 30, "padding: 0 9px; font-size: 12.5px; gap: 5px;") + "</div>"
              + f'<div style="flex-grow: 1; min-height: 0;">{cara_svg(zon13)}</div>', pad="14px 16px", extra="flex-grow: 1; display: flex; flex-direction: column;")
    + tarjeta(tit_tarjeta("Revisión antes de publicar", "", "Todo en orden para publicar.") + check("100 % de la cara asignado") + check("Sin superposiciones") + check("Cada destino con su % exacto")
              + f'<div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid {LINEA};"><b style="font-size: 13px;">Qué cambia contra la versión 2</b>'
              f'<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px; font-size: 13px;"><span>+ Entra «2×1 granos» con 20 %</span><span>− Pastas pasa de 45 % a 25 %</span></div></div>', extra="width: 250px; flex-shrink: 0;")
    + "</div>")
guardar_e("F13", "Planograma · planificar la cara", e13)

# =====================================================================
# E14 · Ajustes · Tarifas
# =====================================================================
GRUPOS = [("Comercial", ["Tarifas", "Temporadas", "Metas por sede"]), ("Sede y plano", ["Sedes", "Nombres de los muebles", "Ordenar códigos", "Catálogo de muebles"]),
          ("Avisos", ["Destinatarios y recordatorios", "Responsables por sede"]), ("Equipo", ["Usuarios", "Permisos"]),
          ("Cuenta", ["Suscripción y facturación", "Copia de seguridad", "Mis datos", "Reporte de transparencia", "Bitácora", "Configuración inicial"])]
menu_aj = tarjeta("".join(f'<div style="font-size: 11.5px; font-weight: 700; color: {TXT3}; letter-spacing: .06em; margin: {0 if i == 0 else 14}px 0 6px;">{g.upper()}</div>'
                          + "".join(f'<div style="padding: 7px 10px; border-radius: 7px; font-size: 13.5px; {"background: " + AZUL_CL + "; color: " + AZUL_TX + "; font-weight: 600;" if o == "Tarifas" else "color: #344054;"}">{o}</div>' for o in ops)
                          for i, (g, ops) in enumerate(GRUPOS)), pad="16px 12px", extra="width: 250px; flex-shrink: 0;")
celda = lambda v, act=False: f'<span style="display: inline-flex; align-items: center; height: 34px; padding: 0 10px; border-radius: 7px; border: {"1.5px solid " + AZUL if act else "1px solid " + LINEA2}; font-size: 13px; font-family: ui-monospace, Menlo, monospace; width: 100%; box-sizing: border-box;">{v}</span>'
TAR = [("Punta de góndola", "por mueble", 600000, 600000, 550000), ("Góndola", "por cara", 450000, 450000, 420000), ("Nevera", "por mueble", 1400000, 1400000, 1300000),
       ("Exhibidor", "por mueble", 350000, 350000, 350000), ("Isla", "por mueble", 500000, 500000, 480000), ("Cabecera de caja", "por mueble", 300000, 300000, 300000)]
tabla_t = tabla("1.4fr 1fr 1.1fr 1.1fr 1.1fr", ["Tipo de mueble", "Unidad", "General", "CENTRO", "PALMAS"],
                [(f'<b style="font-weight: 600;">{a}</b>', gris(b, 13), celda(fmt(c)), celda(fmt(d), a == "Góndola"), celda(fmt(e))) for a, b, c, d, e in TAR])
e14 = shell("Ajustes",
    cabecera("Ajustes", "La configuración del supermercado, agrupada por tema.", "")
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">{menu_aj}<div style="display: flex; flex-direction: column; gap: 16px; flex-grow: 1; min-width: 0;">'
    + tarjeta(tit_tarjeta("Tarifas", pill("ok", "Se guarda solo", "check"), "Canon mensual de referencia por tipo de mueble, general y por sede. Última modificación: Ana Gómez, 20/10/2026.") + tarjeta(tabla_t, pad="0", extra="overflow: hidden; box-shadow: none;"))
    + tarjeta(f'<div style="display: flex; gap: 10px; font-size: 13px; color: {TXT2};">{ic("info", 17, AZUL_TX)}<span>La tarifa es de referencia: cada contrato puede tener otro canon. Indicadores compara el canon con esta tarifa (canon ÷ tarifa). Las temporadas suben o bajan la tarifa sugerida en sus fechas.</span></div>', pad="14px 16px")
    + "</div></div>")
guardar_e("F14", "Ajustes · Tarifas", e14)

# =====================================================================
# E15 · Configuración inicial
# =====================================================================
def paso_ci(n, t, d, est, accion=""):
    if est == "hecho":
        circ = f'<span style="width: 32px; height: 32px; border-radius: 99px; background: {OKF}; border: 1.5px solid {OKC}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box;">{ic("check", 16, OKC, 3)}</span>'
    elif est == "ahora":
        circ = f'<span style="width: 32px; height: 32px; border-radius: 99px; background: {AZUL}; color: #fff; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{n}</span>'
    else:
        circ = f'<span style="width: 32px; height: 32px; border-radius: 99px; border: 1.5px solid {LINEA2}; color: {TXT3}; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box;">{n}</span>'
    bg = f"background: {AZUL_CL}; border: 1.5px solid {AZUL};" if est == "ahora" else f"border: 1px solid {LINEA};"
    return (f'<div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; {bg}">{circ}'
            f'<span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1;"><b style="font-size: 14.5px; {"color: " + TXT2 + ";" if est == "hecho" else ""}">{t}</b>{gris(d, 13)}</span>{accion}</div>')
e15 = shell("",
    cabecera("Configuración inicial · Supermercado La Esquina", "Seis pasos para empezar a operar. Podés ocultarla y volver desde Ajustes.", btn("Ocultar por ahora", "sec", "x"))
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(f'<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;"><b style="font-size: 15px;">2 de 6 pasos</b><div style="flex-grow: 1; height: 8px; border-radius: 99px; background: {NEUF};"><div style="width: 33%; height: 100%; border-radius: 99px; background: {AZUL};"></div></div></div>'
              f'<div style="display: flex; flex-direction: column; gap: 10px;">'
              + paso_ci(1, "Crear las sedes", "CENTRO y PALMAS", "hecho", btn("Editar", "enl", None, 26))
              + paso_ci(2, "Dibujar el plano de cada sede", "CENTRO: 16 muebles, 22 espacios contratables · PALMAS: falta el plano", "hecho", btn("Dibujar PALMAS", "sec", "plano", 32))
              + paso_ci(3, "Definir las tarifas", "Canon mensual de referencia por tipo de mueble. Faltan 4 de 6.", "ahora", btn("Completar las tarifas", "pri", "flecha", 36))
              + paso_ci(4, "Definir los responsables por sede", "Comercial, administración y montaje. Sin responsable de montaje no salen los avisos.", "", btn("Definir", "sec", None, 32))
              + paso_ci(5, "Invitar al equipo", "Por correo y con rol: Trabajador, Administrador o Dueño.", "", btn("Invitar", "sec", None, 32))
              + paso_ci(6, "Registrar el primer contrato", "Uno a mano, o los que ya existen desde una planilla.", "", btn("Cargar planilla", "sec", "planilla", 32))
              + "</div>", pad="20px 22px", extra="flex-grow: 1;")
    + tarjeta(tit_tarjeta("Por qué este orden") + f'<div style="display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; color: {TXT2}; line-height: 1.5;">'
              f'<span><b style="color: {INK};">El plano primero:</b> los contratos se hacen sobre espacios que existen en el plano.</span>'
              f'<span><b style="color: {INK};">Las tarifas antes de vender:</b> así cada contrato se compara con su referencia.</span>'
              f'<span><b style="color: {INK};">Los responsables antes del primer contrato:</b> el aviso de montaje sale al guardar.</span></div>', extra="width: 340px; flex-shrink: 0;")
    + "</div>")
guardar_e("F15", "Configuración inicial", e15)

# =====================================================================
# E16 · Teléfono: aviso de montaje y registro
# =====================================================================
def tel(cuerpo, titulo):
    return (f'<div style="width: 390px; height: 844px; border-radius: 36px; border: 10px solid #101828; background: {FONDO_E}; overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box; flex-shrink: 0;">'
            f'<div style="display: flex; align-items: center; gap: 10px; height: 58px; padding: 0 16px; background: {BLANCO_E}; border-bottom: 1px solid {LINEA}; flex-shrink: 0;"><span style="width: 24px; height: 24px; border-radius: 6px; background: {INK}; display: inline-flex; align-items: center; justify-content: center;">{ic("cuadros", 13, AMA, 2.2)}</span><b style="font-size: 15px;">{titulo}</b></div>'
            f'<div style="display: flex; flex-direction: column; gap: 12px; padding: 14px; flex-grow: 1; min-height: 0;">{cuerpo}</div></div>')
t1 = tel(tarjeta(f'<span style="font-size: 12px; font-weight: 700; color: {TXT3}; letter-spacing: .06em;">SUPERMERCADO LA ESQUINA · CENTRO</span>'
                 f'<div style="font-size: 18px; margin: 6px 0 4px;">{cod("PUN-08", 18)} · <b>Punta de góndola 8</b></div>{gris("Galletas Sol · montar desde el 01/11/2026", 13.5)}', pad="14px 16px")
         + tarjeta(f'<b style="font-size: 13.5px;">Dónde queda</b>{gris(" · pasillo 4, frente a la entrada")}<div style="height: 150px; margin-top: 8px;">{plano_svg(EST_FECHAS and {c: ("d" if c == "PUN-08" else "x") for c, *_ in MUEBLES}, {}, sel="PUN-08", vb=(150, 96, 610, 330))}</div>', pad="12px 14px")
         + tarjeta(f'<b style="font-size: 13.5px;">Cómo tiene que quedar</b><div style="height: 190px; margin-top: 8px; border: 1px solid {LINEA}; border-radius: 8px; overflow: hidden;">{punta_svg(False)}</div>', pad="12px 14px")
         + f'<span style="flex-grow: 1;"></span>' + btn("Registrar montaje (tomar foto)", "pri", "camara", 48, "width: 100%; font-size: 15px;") + btn("No se pudo montar", "sec", None, 44, "width: 100%;"), "Aviso de montaje")
mot = lambda t, on=False: f'<span style="display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 10px; border: {"2px solid " + AZUL if on else "1px solid " + LINEA2}; background: {AZUL_CL if on else BLANCO_E}; font-size: 13.5px;"><span style="width: 16px; height: 16px; border-radius: 99px; border: {"5px solid " + AZUL if on else "1.5px solid " + LINEA2}; box-sizing: border-box; background: #fff;"></span>{t}</span>'
t2 = tel(tarjeta(f'<div style="font-size: 16px;">{cod("PUN-08", 16)} · <b>No se pudo montar</b></div>{gris("El motivo es obligatorio; llega al administrador.", 13)}', pad="14px 16px")
         + tarjeta(f'<b style="font-size: 13.5px;">Motivo</b><div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">'
                   + mot("El proveedor no entregó el material", True) + mot("No llegó el producto") + mot("El espacio está ocupado por otra cosa") + mot("Otro motivo") + "</div>", pad="12px 14px")
         + tarjeta(f'{campo("Nota (opcional)", "Llamé a Galletas Sol: llega el martes.", "100%", None)}<div style="margin-top: 10px;">{btn("Agregar foto", "sec", "camara", 38, "width: 100%;")}</div>', pad="12px 14px")
         + f'<span style="flex-grow: 1;"></span>' + btn("Confirmar registro", "pri", "check", 48, "width: 100%; font-size: 15px;") + f'<span style="text-align: center;">{gris("Registra: Luis Pérez · sin montos ni tarifas")}</span>', "Registrar montaje")
e16 = (f'<div style="display: flex; gap: 40px; align-items: center; justify-content: center; width: 100%; height: 100%; background: {FONDO_E}; font-family: Inter, system-ui, sans-serif; color: {INK};">{t1}{t2}</div>')
guardar("F16", "Teléfono · aviso y registro de montaje", 900, 900, e16, fondo=FONDO_E, extra_style="display: flex;")

# =====================================================================
# E00 · El sistema visual: qué se toma de la referencia y qué se conserva
# =====================================================================
item_v = lambda ok, t, d: (f'<div style="display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid {LINEA};">{ic("ok" if ok else "info", 18, OKC if ok else AZUL_TX, 2)}'
                           f'<span style="display: flex; flex-direction: column; gap: 2px;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(d, 12.5)}</span></div>')
tomado = tarjeta(tit_tarjeta("Lo que se toma de la foto") + "".join(item_v(True, a, b) for a, b in [
    ("Barra lateral liviana y barra superior limpia", "☰ RECABRA, módulos con ícono y nombre; buscador gris redondeado, Pendientes con contador y la persona con su rol."),
    ("Tarjetas sin bordes marcados, sombra muy suave", "Cifras grandes; las que piden atención, con fondo y número en rojo."),
    ("Listas con círculo de color y botón gris", "Pendientes y actividad reciente como en la foto."),
    ("Tablas con miniatura del mueble y botón azul por fila", "Seleccionar, Revisar, Verificar: la acción de cada fila, a la vista."),
    ("Plano sobre papel cuadriculado", "Muebles con el contorno del color de su estado; 2D, 3D y zoom a la derecha."),
    ("Dona, barras con globo y bloques de color", "Indicadores, Distribución y Planograma con el mismo lenguaje visual.")]), extra="flex: 1;")
conservado = tarjeta(tit_tarjeta("Lo que se conserva de RECABRA") + "".join(item_v(False, a, b) for a, b in [
    ("Ninguna función se pierde", "Cada pestaña, botón y dirección de hoy tiene su lugar (ver el mapa de navegación)."),
    ("Disponibilidad en el tiempo", "Hasta cuándo está ocupado y desde cuándo se libera: en el plano, la lista y la línea de tiempo."),
    ("Importes completos y voseo", "$ 9.939.500, nunca «9,9 M». «Elegí las fechas», «Ubicá las participaciones»."),
    ("Estados con palabra", "Disponible, Se libera, Ocupado, Reservado: siempre escritos, no sólo el color."),
    ("Lo que el sistema hace de verdad", "Distribución por participación, planograma por destinos, montajes de contrato y de planograma."),
    ("Sin «Oportunidades»", "Inicio para el día, Indicadores para analizar.")]), extra="flex: 1;")
muestras = tarjeta(tit_tarjeta("Piezas") + f'<div style="display: flex; flex-direction: column; gap: 14px;">'
                   f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">{btn("Acción principal", "pri", "check")}{btn("Secundaria", "sec", "descargar")}{btn("Enlace", "enl", "chev")}{btn("Peligrosa", "peligro", "papelera")}</div>'
                   f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">{pill("ok", "Verificado: coincide")}{pill("aten", "Bajo la meta")}{pill("crit", "No realizado")}{pill("neu", "Sin montar")}{pill("res", "Reserva provisional")}</div>'
                   f'<div style="display: flex; gap: 10px;">{campo("Desde", "01/11/2026", "150px", "calendario", True, True)}{campo("Tipo de mueble", "Todos", "170px")}</div>'
                   f'{segmentado(["Hoy", "Octubre", "Últimos 12 meses"], "Octubre")}'
                   f'{leyenda_e([("d", "Disponible"), ("p", "En parte"), ("c", "Contratado"), ("r", "Reservado")])}'
                   f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">' + "".join(f'<span style="display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: {TXT3};"><span style="width: 44px; height: 30px; border-radius: 6px; background: {c}; border: 1px solid {LINEA};"></span>{n}</span>' for c, n in [(INK, "tinta"), (FONDO_E, "fondo"), (AZUL, "azul"), (AZUL_CL, "elegido"), (AZUL, "principal"), (OKC, "bien"), ("#DC6803", "atención"), (CRC, "crítico")])
                   + "</div></div>", extra="width: 420px; flex-shrink: 0;")
e00 = shell("Indicadores",
    cabecera("El estilo de la foto, con las funciones de RECABRA", "Qué se toma de la imagen de referencia y qué se conserva del sistema actual.", "")
    + f'<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">{tomado}{conservado}{muestras}</div>')
guardar_e("F00", "El estilo de la referencia, con nuestras reglas", e00)
print("E12-E16 E00 ok")

# =====================================================================
# NIN · Inicio: qué hacer hoy
# =====================================================================
act = lambda h, i, t, d, c=TXT2: (f'<div style="display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid {LINEA};"><span style="width: 30px; height: 30px; border-radius: 99px; background: {NEUF}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{ic(i, 15, c, 2)}</span>'
                                   f'<span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0;"><span style="font-size: 13.5px; font-weight: 600;">{t}</span>{gris(d)}</span>{gris(h, 12)}</div>')
venc = lambda c, p, f_, txt: (f'<div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid {LINEA};">{cod(c)}<span style="flex-grow: 1; font-size: 13px;">{p}</span>{gris(f_)}{btn(txt, "sec", None, 30)}</div>')
nin = shell("Inicio",
    cabecera("Hola, Ana", "Lunes 26/10/2026 · Sede CENTRO · esto es lo que pide atención hoy.", btn("Consultar disponibilidad", "sec", "calendario") + btn("Nuevo contrato", "pri", "mas2"))
    + f'<div style="display: flex; gap: 16px;">'
    + kpi("Canon mensual contratado", fmt(9939500), "/mes", "vs septiembre 2026", sube("4,7 %"), "Indicadores")
    + kpi("Ocupación", "86 %", "19 de 22 espacios", "", pill("aten", "Bajo la meta de 90 %"), "Ver el plano")
    + kpi("Vencen en 30 días", "2", "contratos", "sin renovar", pill("crit", "PUN-07 en 4 días"), "Renovar")
    + kpi("Montajes por resolver", "4", "", "", pill("aten", "1 no realizado · 2 sin verificar"), "Montajes")
    + "</div>"
    + f'<div style="display: flex; gap: 16px; flex-grow: 1; min-height: 0;">'
    + tarjeta(tit_tarjeta("Para hacer hoy", btn("Ver los 14 pendientes", "enl", "chev", 28), "3 con fecha límite hoy") + lista_hoy
              + f'<div style="margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #F9FAFB; display: flex; align-items: center; gap: 10px; font-size: 13px;">{ic("info", 16, AZUL_TX)}<span style="flex-grow: 1;">Los pendientes también se abren desde la barra de arriba, en cualquier pantalla.</span></div>', extra="flex: 1.25;")
    + tarjeta(tit_tarjeta("Actividad reciente", btn("Ver bitácora", "enl", "chev", 28), "Lo último que pasó en la sede")
              + act("10:24", "estantes", "Planograma publicado · GON-05 cara A", "Versión 2 · Ana Gómez")
              + act("9:12", "camara", "Montaje registrado · PUN-05", "Luis Pérez · con foto")
              + act("ayer 17:40", "contratos", "Contrato guardado · PUN-08", "Galletas Sol · 01/11/2026 – 31/01/2027")
              + act("ayer 15:02", "calendario", "Reserva provisional · GON-13", "Lácteos Andinos · caduca hoy", ATC)
              + act("ayer 11:30", "franja", "Distribución guardada · GON-03 cara A", "Café Montaña 40 % · Lácteos Andinos 25 %"), extra="flex: 1;")
    + tarjeta(tit_tarjeta("Disponibles hoy", btn("Contratar", "enl", "chev", 28), "3 espacios sin contrato") + f'<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">{chips_e}</div>'
              + f'<b style="font-size: 13.5px;">Próximos vencimientos</b>'
              + venc("PUN-07", "Galletas Sol", "30/10/2026", "Renovar") + venc("GON-04", "Aseo Total", "15/11/2026", "Renovar") + venc("PUN-01", "Limpio Hogar", "30/11/2026", "Renovar"), extra="flex: .95;")
    + "</div>")
guardar_e("FIN", "Inicio: qué hacer hoy", nin)

# =====================================================================
# NSC · Sistema de componentes
# =====================================================================
sec = lambda t, cuerpo, ext="": f'<div style="display: flex; flex-direction: column; gap: 10px; {ext}"><span style="font-size: 11.5px; font-weight: 700; color: {TXT3}; letter-spacing: .07em;">{t.upper()}</span>{cuerpo}</div>'
menu_mas = (f'<div style="position: relative; height: 210px;">{btn("Más", "sec", "mas")}'
            f'<div style="position: absolute; top: 44px; left: 0; width: 250px; padding: 6px; border-radius: 10px; background: #fff; border: 1px solid {LINEA}; box-shadow: 0 12px 24px rgba(16,24,40,.14);">'
            + "".join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 13px; {"color: " + CRC + ";" if r else ""} {"background: " + NEUF + ";" if i == 0 else ""}">{ic(ic_, 15, CRC if r else TXT2)}{t}</div>' + (f'<div style="height: 1px; background: {LINEA}; margin: 4px 0;"></div>' if i == 2 else "")
                      for i, (t, ic_, r) in enumerate([("Copiar de la otra cara", "copiar", False), ("Qué pasó con esta cara", "reloj", False), ("Atajos de teclado", "teclado", False), ("Sacar todas las piezas", "papelera", True)]))
            + "</div></div>")
campo_err = (f'<label style="display: flex; flex-direction: column; gap: 5px; width: 240px;"><span style="font-size: 12px; font-weight: 600; color: {TXT2};">Canon mensual</span>'
             f'<span style="display: flex; align-items: center; height: 38px; padding: 0 11px; border-radius: 8px; border: 1.5px solid {CRC}; background: #fff; font-size: 13.5px; box-sizing: border-box;">$ 0</span>'
             f'<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: {CRC};">{ic("error", 13, CRC, 2)}Escribí un valor mayor que cero.</span></label>')
alerta = lambda tipo, t, d: (lambda c, bg, i: f'<div style="display: flex; gap: 10px; padding: 11px 14px; border-radius: 10px; background: {bg}; border: 1px solid {c}33;">{ic(i, 17, c, 2)}<span style="display: flex; flex-direction: column; gap: 2px;"><b style="font-size: 13px; color: {c};">{t}</b><span style="font-size: 12.5px; color: #344054;">{d}</span></span></div>')(*{"ok": (OKC, OKF, "ok"), "aten": (ATC, ATF, "triangulo"), "crit": (CRC, CRF, "error"), "info": (AZUL_TX, AZUL_CL, "info")}[tipo])
mini_tabla = tarjeta(f'<div style="display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid {LINEA};">{campo("", "Buscar espacio o proveedor", "220px", "buscar")}{btn("Filtros · 2", "sec", "filtro", 38)}<span style="flex-grow: 1;"></span>{btn("Exportar CSV", "sec", "descargar", 38)}</div>'
                     + tabla("0.8fr 1.3fr 1.2fr 1.4fr", ["Espacio", "Proveedor", "Canon /mes", "Montaje"], [(cod("PUN-07"), "Galletas Sol", fmt(600000), pill("ok", "Verificado")), (cod("PUN-03"), "Café Montaña", fmt(480000), pill("crit", "No realizado"))], sel=0), pad="0", extra="overflow: hidden;")
modal = (f'<div style="width: 380px; padding: 20px; border-radius: 14px; background: #fff; border: 1px solid {LINEA}; box-shadow: 0 20px 40px rgba(16,24,40,.18); display: flex; flex-direction: column; gap: 10px;">'
         f'<span style="width: 40px; height: 40px; border-radius: 99px; background: {CRF}; display: inline-flex; align-items: center; justify-content: center;">{ic("triangulo", 20, CRC, 2)}</span>'
         f'<b style="font-size: 16px;">¿Cancelar el contrato de PUN-05?</b><span style="font-size: 13px; color: {TXT2};">Galletas Sol deja de ocupar el espacio desde hoy y se le avisa por correo. No se puede deshacer.</span>'
         f'<div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">{btn("Volver", "sec")}{btn("Cancelar contrato", "peligro", "papelera")}</div></div>')
panel_l = (f'<div style="width: 300px; height: 230px; border-radius: 12px; background: #fff; border: 1px solid {LINEA}; box-shadow: -8px 0 24px rgba(16,24,40,.08); padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;">'
           f'<div style="display: flex; align-items: center;"><span style="font-size: 14px; flex-grow: 1;">{cod("GON-03")} · <b>Góndola 3</b></span>{ic("x", 16, TXT3)}</div>{pestanas_e(["Mueble", "Contratación", "Medidas"], "Mueble", 14)}'
           f'{dato("Código", "GON-03")}{dato("Pasillo", "2")}{dato("Caras", "A y B")}</div>')
vacio = (f'<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px; border-radius: 12px; border: 1px dashed {LINEA2}; background: #fff; text-align: center;">'
         f'<span style="width: 40px; height: 40px; border-radius: 10px; background: {NEUF}; display: inline-flex; align-items: center; justify-content: center;">{ic("montajes", 20, TXT2)}</span>'
         f'<b style="font-size: 14px;">No hay montajes sin verificar</b><span style="font-size: 12.5px; color: {TXT3}; max-width: 260px;">Cuando alguien registre un montaje con foto, aparece acá para que lo compares con la planometría.</span>{btn("Ver todos los montajes", "sec", None, 32)}</div>')
carga = (f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 12px; background: #fff; border: 1px solid {LINEA};">'
         + "".join(f'<span style="height: {h}px; width: {w}; border-radius: 6px; background: linear-gradient(90deg, #F2F4F7, #E4E7EC, #F2F4F7);"></span>' for h, w in [(12, "40%"), (26, "60%"), (10, "80%"), (10, "70%")]) + f'{gris("Cargando los contratos de CENTRO…")}</div>')
error_c = (f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 18px; border-radius: 12px; background: #fff; border: 1px solid {LINEA};">'
           f'<span style="display: flex; align-items: center; gap: 8px;">{ic("nube", 18, CRC, 2)}<b style="font-size: 14px;">No pudimos traer los contratos</b></span>'
           f'<span style="font-size: 12.5px; color: {TXT2};">Sin conexión con el servidor. Lo que cambies en el plano se guarda en este equipo y se sube cuando vuelva la conexión.</span><span style="display: flex; gap: 8px;">{btn("Reintentar", "sec", "rotar", 32)}{btn("Ver qué quedó sin subir", "enl", None, 32)}</span></div>')
nsc = (f'<div style="display: flex; flex-direction: column; gap: 22px; width: 100%; height: 100%; padding: 36px 44px; box-sizing: border-box; background: {FONDO_E}; font-family: Inter, system-ui, sans-serif; color: {INK};">'
       f'<div><h1 style="margin: 0; font-size: 26px; font-weight: 650;">Sistema de componentes</h1><span style="font-size: 14px; color: {TXT3};">Una sola pieza por problema. Todas las pantallas se arman con estas.</span></div>'
       f'<div style="display: grid; grid-template-columns: 300px 1fr 1fr; gap: 26px;">'
       + sec("Navegación", f'<div style="border-radius: 12px; overflow: hidden; border: 1px solid {LINEA}; height: 360px; display: flex;">{lateral("Contratos").replace("width: 228px", "width: 100%")}</div>')
       + sec("Encabezado de página y pestañas", tarjeta(cabecera("Nuevo contrato", "Paso 1 de 4 · lo que se contrata.", btn("Cancelar", "sec") + btn("Siguiente", "pri", "flecha"), ["Contratos", "Nuevo contrato"]) + '<div style="height: 14px;"></div>' + pestanas_e([("Todos", 9), ("Sin montar", 3), ("Verificado", 3)], "Todos"))
             + sec("Botones", f'<div style="display: flex; gap: 8px; flex-wrap: wrap;">{btn("Guardar contrato", "pri", "check")}{btn("Exportar CSV", "sec", "descargar")}{btn("Ver historial", "enl", "chev")}{btn("Eliminar", "peligro", "papelera")}{btn("Guardando…", "sec", "reloj", 38, "opacity: .6;")}</div>')
             + sec("Campos y selectores", f'<div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start;">{campo("Desde", "01/11/2026", "150px", "calendario", True)}{campo("Tipo de mueble", "Todos", "170px")}{campo_err}</div>'), "")
       + sec("Menú de acciones «Más»", menu_mas + sec("Estados", f'<div style="display: flex; gap: 6px; flex-wrap: wrap;">{pill("ok", "Disponible")}{pill("crit", "Contratado")}{pill("res", "Reserva provisional")}{pill("aten", "En parte")}{pill("neu", "Sin montar")}{pill("info", "Programada")}</div>'))
       + "</div>"
       f'<div style="display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 26px;">'
       + sec("Tabla con búsqueda y filtros", mini_tabla) + sec("Alertas", alerta("info", "Se guarda solo", "Cada cambio queda guardado al instante.") + alerta("aten", "Bajo la meta de 90 %", "Ocupación 86 % en CENTRO.") + alerta("crit", "No se pudo guardar", "Revisá la conexión y reintentá.")) + sec("Tarjeta de indicador", kpi("Canon mensual contratado", fmt(9939500), "/mes", "vs septiembre 2026", sube("4,7 %"), "Ver"))
       + "</div>"
       f'<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 26px; align-items: start;">'
       + sec("Confirmación de algo destructivo", modal) + sec("Panel lateral de propiedades", panel_l) + sec("Vacío · carga", vacio + carga) + sec("Error con salida", error_c)
       + "</div></div>")
guardar("FSC", "Sistema de componentes", 1440, 1340, nsc, fondo=FONDO_E)

# =====================================================================
# NRS · Pantallas más chicas: tableta y teléfono
# =====================================================================
def lateral_compacta(activo):
    it = lambda t, i, on: (f'<span style="display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px; border-radius: 8px; font-size: 10.5px; font-weight: 600; text-align: center; '
                           + (f'background: {AZUL_CL}; color: {AZUL_TX};">{ic(i, 18, AZUL_TX, 2)}' if on else f'color: #344054;">{ic(i, 18, TXT3, 1.9)}') + f'{t}</span>')
    return (f'<aside style="width: 84px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; padding: 14px 6px; background: #fff; border-right: 1px solid {LINEA}; box-sizing: border-box;">'
            f'<span style="width: 30px; height: 30px; margin: 0 auto 14px; border-radius: 7px; background: {INK}; display: inline-flex; align-items: center; justify-content: center;">{ic("cuadros", 15, AMA, 2.2)}</span>'
            + "".join(it(t, i, t == activo) for t, i in NAV + [("Ajustes", "ajustes")]) + "</aside>")
tableta = (f'<div style="width: 1024px; height: 768px; display: flex; background: {FONDO_E}; border-radius: 20px; overflow: hidden; border: 10px solid #101828; box-sizing: border-box;">{lateral_compacta("Contratos")}'
           f'<div style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0;">'
           f'<header style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 14px; background: #fff; border-bottom: 1px solid {LINEA};">{btn("Buscar", "sec", "buscar", 36)}<span style="flex-grow: 1;"></span>{btn("CENTRO", "sec", "sede", 36)}{btn("Pendientes · 14", "sec", "campana", 36)}</header>'
           f'<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px; flex-grow: 1; min-height: 0;">'
           f'<div style="display: flex; align-items: center; gap: 8px;"><b style="font-size: 19px; flex-grow: 1;">Contratos</b>{btn("Más", "sec", "mas", 34)}</div>'
           + tarjeta(f'<div style="display: flex; gap: 10px; align-items: flex-end;">{campo("Desde", "01/11/2026", "140px", "calendario", True, True)}{campo("Hasta", "31/01/2027", "140px", "calendario", True, True)}{segmentado(["1 mes", "3 meses", "6 meses"], "3 meses", True)}</div>', pad="12px 14px")
           + tarjeta(plano_svg(EST_FECHAS, ETQ_FECHAS, vb=(10, 16, 985, 500)), pad="10px", extra="flex-grow: 1; display: flex; flex-direction: column;")
           + btn("Elegí espacios en el plano para contratar", "sec", None, 42, "width: 100%; color: " + TXT3 + ";")
           + "</div></div></div>")
abajo = lambda: (f'<div style="display: flex; justify-content: space-around; padding: 8px 4px 12px; background: #fff; border-top: 1px solid {LINEA};">'
                 + "".join(f'<span style="display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 600; color: {AZUL_TX if t == "Inicio" else TXT3};">{ic(i, 19, AZUL_TX if t == "Inicio" else TXT3, 2)}{t}</span>' for t, i in [("Inicio", "casa"), ("Contratos", "contratos"), ("Indicadores", "indicadores"), ("Montajes", "montajes"), ("Plano", "plano")]) + "</div>")
telefono_i = (f'<div style="width: 390px; height: 844px; border-radius: 36px; border: 10px solid #101828; background: {FONDO_E}; overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box;">'
              f'<div style="display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 14px; background: #fff; border-bottom: 1px solid {LINEA};"><b style="font-size: 17px; flex-grow: 1;">Hola, Ana</b>{btn("Pendientes · 14", "sec", "campana", 34)}</div>'
              f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 12px; flex-grow: 1; min-height: 0; overflow: hidden;">{campo("", "Buscar función, espacio o proveedor", "100%", "buscar")}'
              + f'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">{tarjeta(gris("Canon mensual", 12) + f"<b style=\"display: block; font-size: 19px; margin-top: 4px;\">{fmt(9939500)}</b>", pad="12px")}{tarjeta(gris("Ocupación", 12) + "<b style=\"display: block; font-size: 19px; margin-top: 4px;\">86 %</b>" + pill("aten", "meta 90 %"), pad="12px")}</div>'
              + tarjeta(tit_tarjeta("Para hacer hoy", "", "3 con fecha límite hoy") + lista_hoy, pad="12px 14px")
              + btn("Nuevo contrato", "pri", "mas2", 46, "width: 100%;")
              + f'</div>{abajo()}</div>')
nrs = (f'<div style="display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; padding: 30px 40px; box-sizing: border-box; background: #E4E7EC; font-family: Inter, system-ui, sans-serif; color: {INK};">'
       f'<div><h1 style="margin: 0; font-size: 24px; font-weight: 650;">En pantallas más chicas</h1><span style="font-size: 14px; color: {TXT2};">Tableta: la barra lateral se angosta pero cada ícono conserva su nombre. Teléfono: barra de abajo con los módulos, y la misma acción principal.</span></div>'
       f'<div style="display: flex; gap: 40px; align-items: flex-start;">'
       f'<div style="width: 870px; height: 653px; flex-shrink: 0;"><div style="transform: scale(.85); transform-origin: top left;">{tableta}</div></div>'
       f'<div style="width: 332px; height: 718px; flex-shrink: 0;"><div style="transform: scale(.85); transform-origin: top left;">{telefono_i}</div></div></div></div>')
guardar("FRS", "Tableta y teléfono", 1440, 900, nrs, fondo="#E4E7EC")
print("NIN NSC NRS ok")

# =====================================================================
# NMA · De las pantallas de hoy a la navegación nueva
# =====================================================================
MAPA_NAV = [
 ("Pestaña Sede › Vender", "Plano para elegir, la escalera «se libera», contrato nuevo, editar y renovar, ver en 3D con el proveedor", "Contratos", "Primero las fechas; contrato en 4 pasos; la ficha del espacio es la misma en todos lados"),
 ("Sede: botones Planilla · Tarifas · Período · Actualizar", "Carga masiva, tarifas y temporadas, período del plano, sincronizar", "Contratos · Ajustes › Comercial · barra de arriba", "Planilla queda en Contratos; tarifas en Ajustes; «Actualizar» pasa a «Todo guardado» arriba"),
 ("Pestaña Sede › Supervisar › cifras y plano", "Canon, ocupación, vencimientos, plano con pendientes, «Al mes | Total»", "Inicio · Indicadores › Resumen", "Lo del día en Inicio; el análisis en Indicadores"),
 ("Supervisar › Para revisar (Hoy · 30 días · Corregir)", "Cada pendiente con su acción", "Pendientes (barra de arriba)", "Se abre encima de cualquier módulo, con contador"),
 ("Supervisar › Estado por espacio · Quién paga · Participaciones", "Tabla con filtros y las dos vistas de análisis", "Indicadores › pestañas", "Búsqueda, filtros y exportar CSV"),
 ("Globo · ficha de Supervisar · panel del Plano", "Datos y acciones de un espacio", "Ficha del espacio (panel lateral)", "Una sola ficha, en los cuatro módulos"),
 ("Pestaña Montajes (y el enlace ?montar=)", "Montajes sin realizar, registrar, corregir", "Montajes", "Contratos y planogramas en una lista; verificar el montaje de un contrato es nuevo"),
 ("Pestaña Plano (+ botón Renumerar)", "Editor 2D: catálogo, muebles, validación, ordenar códigos", "Plano de la sede › 2D", "Catálogo, plano y ficha del mueble; ordenar códigos pasa a Ajustes"),
 ("Pestaña Editor 3D", "Vista 3D, reunión con el proveedor, probar producto, bajar imagen", "Plano de la sede › 3D", "Mismo motor 3D; barra con nombres y panel del mueble"),
 ("Distribuir la cara · Planograma de la cara", "Zonas por participación; destinos, versiones, publicar, guía", "Plano de la sede › Distribuir · Planograma", "Editar, guardar borrador, vista previa y publicar, separados"),
 ("Selector de sede de cada pestaña", "Hoy hay uno en Sede, otro en Plano y otro en el 3D", "Un solo selector en la barra de arriba", "Agregar y renombrar sedes pasa a Ajustes › Sedes"),
 ("Engranaje (panel de Configuración)", "Usuarios, notificaciones, contactos, nombres de muebles, suscripción, copia, tus datos, bitácora", "Ajustes por tema", "Comercial, Sede y plano, Avisos, Equipo, Cuenta"),
 ("/taller (sin enlace hoy)", "Catálogo de muebles propios", "Ajustes › Catálogo de muebles", "Deja de ser una dirección que hay que saberse"),
 ("Quién soy · tema · salir", "Nombre, rol, claro u oscuro, cerrar sesión", "Tarjeta de la cuenta (abajo a la izquierda)", "Cambiar de supermercado sigue en el ingreso"),
 ("Plataforma (botón del operador)", "Consola, cartera, cobros, sesión de asesoría, informe", "Plataforma (sólo operador)", "Sin cambios de flujo; toma el estilo nuevo"),
 ("Enlaces de montaje y de guía · portada · ingreso · política", "Teléfono de quien monta sin contraseña; entrada", "Igual, con el estilo nuevo", "La configuración inicial en 6 pasos es nueva"),
]
filas_m = [(f'<b style="font-weight: 600;">{a}</b>', gris(b, 12.5), f'<span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: {AZUL_TX};">{ic("flecha", 14, AZUL_TX, 2)}{c}</span>', gris(d, 12.5)) for a, b, c, d in MAPA_NAV]
nma = shell("Inicio",
    cabecera("De las pantallas de hoy a la navegación nueva", "Cada pantalla y función de hoy tiene un lugar. Nada se elimina: cambia dónde está y cómo se ve.", pill("ok", "Ninguna se pierde", "check"))
    + tarjeta(tabla("1.25fr 1.6fr 1.15fr 1.6fr", ["Hoy", "Qué hace", "Queda en", "Qué cambia"], filas_m), pad="0", extra="overflow: hidden;")
    + tarjeta(f'<div style="display: flex; gap: 22px; font-size: 13px;"><b style="white-space: nowrap;">Qué ve cada rol</b>'
              f'<span><b>Trabajador:</b> lo mismo que hoy (Supervisar sin importes y Montajes), repartido en Inicio, Indicadores y Montajes.</span>'
              f'<span><b>Administrador:</b> todo, más Ajustes.</span><span><b>Dueño:</b> además Suscripción y Copia de seguridad.</span><span><b>Operador:</b> además Plataforma.</span></div>', pad="14px 18px"),
    pad="22px 28px 24px")
guardar_e("FMA", "De las pantallas de hoy a la navegación nueva", nma, h=1200)
print("NMA ok")

# #####################################################################
# LAS NUEVE PANTALLAS DE LA FOTO, CALCADAS (sobrescriben las anteriores)
# #####################################################################
def kpi_f(titulo, valor, linea, tono="neutro", col_valor=None, enlace=""):
    bg = {"neutro": "#FFFFFF", "rojo": "#FFF7F6", "verde": "#F6FEF9", "ambar": "#FFFBF2"}[tono]
    bd = {"neutro": "#F1F3F6", "rojo": "#FDE4E1", "verde": "#DDF5E7", "ambar": "#FCEBC7"}[tono]
    cv = col_valor or INK
    return (f'<div style="flex: 1; min-width: 0; padding: 20px 22px; border-radius: 14px; background: {bg}; border: 1px solid {bd}; {SOMBRA} box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;">'
            f'<span style="font-size: 13.5px; color: #344054; font-weight: 500;">{titulo}</span><b style="font-size: 30px; font-weight: 750; letter-spacing: -.02em; color: {cv}; line-height: 1;">{valor}</b><div style="display: flex;">{linea}</div></div>')
up = lambda t, c=OKC: f'<span style="font-size: 12.5px; font-weight: 600; color: {c};">↑ {t}</span>'
txtc = lambda t, c: f'<span style="font-size: 12.5px; font-weight: 600; color: {c};">{t}</span>'

# ---------- FIN · Inicio ----------
def fila_pend(icono, col, t, d, est, est_c, accion):
    return (f'<div style="display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid {LINEA};">{punto(icono, col)}'
            f'<span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(d)}</span>'
            f'<span style="width: 150px; font-size: 13px; font-weight: 600; color: {est_c};">{est}</span>{btn(accion, "suave", None, 36, "width: 118px;")}</div>')
def fila_act(icono, col, t, d, h):
    return (f'<div style="display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid {LINEA};">{punto(icono, col)}'
            f'<span style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;"><b style="font-size: 13.5px; font-weight: 600;">{t}</b>{gris(d)}</span>{gris(h, 12)}</div>')
fin = shell("Inicio",
    cabecera("Hola, Brayan", "Acá tenés un resumen de la operación en CENTRO.", campo("", "Hoy, 26 oct 2026", "190px"))
    + '<div style="display: flex; gap: 18px;">'
    + kpi_f("Contratos activos", "19", up("2 vs. mes anterior"), "neutro", "#0B3B2E")
    + kpi_f("Por vencer (30 días)", "2", txtc("Requieren acción", CRC), "rojo", CRC)
    + kpi_f("Montajes por resolver", "4", txtc("1 con fecha límite hoy", CRC), "rojo", CRC)
    + kpi_f("Canon del mes", fmt(9939500), up("4,7 % vs. mes anterior"), "neutro")
    + "</div>"
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(tit_tarjeta("Pendientes de hoy", btn("Ver los 14", "enl", None, 28))
              + fila_pend("reloj", "#F04438", "Contrato por vencer", "PUN-07 · Galletas Sol", "Vence en 4 días", CRC, "Renovar")
              + fila_pend("montajes", "#F04438", "Montaje no realizado", "PUN-03 · Café Montaña", "Faltó el material", CRC, "Ver detalle")
              + fila_pend("estantes", "#F79009", "Planograma sin publicar", "GON-05 · cara A · versión 3", "Borrador", ATC, "Publicar")
              + fila_pend("calendario", "#F79009", "Reserva por confirmar", "GON-13 · Lácteos Andinos", "Caduca hoy", CRC, "Confirmar"),
              pad="20px 22px", extra="flex: 1.55;")
    + tarjeta(tit_tarjeta("Actividad reciente", btn("Bitácora", "enl", None, 28))
              + fila_act("check", "#12B76A", "Planograma publicado", "GON-12 · cara A · versión 1", "10:24 a. m.")
              + fila_act("camara", "#12B76A", "Montaje registrado", "PUN-05 · con foto", "9:15 a. m.")
              + fila_act("contratos", "#1570EF", "Contrato creado", "PUN-08 · Galletas Sol", "8:40 a. m.")
              + fila_act("franja", "#64748B", "Distribución actualizada", "GON-03 · 4 zonas", "8:20 a. m."),
              pad="20px 22px", extra="flex: 1;")
    + "</div>")
guardar_e("FIN", "Inicio (resumen general)", fin)

# ---------- F02 · Contratos: disponibilidad y búsqueda ----------
def controles_mapa(dos_d=True):
    cuadro = lambda c, on=False, txt=False: (f'<span style="width: 44px; height: 44px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; box-sizing: border-box; '
                                             + (f'background: {AZUL}; color: #fff;' if on else f'background: #fff; color: #344054; border: 1px solid {LINEA}; {SOMBRA}') + f'">{c}</span>')
    return (f'<div style="position: absolute; right: 16px; top: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px;">{cuadro("2D", dos_d)}{cuadro("3D", not dos_d)}<span style="flex-grow: 1;"></span>'
            f'{cuadro(ic("mas2", 18, "#344054", 2))}{cuadro("<span style=\'font-size: 20px; font-weight: 500;\'>−</span>")}{cuadro(ic("pin", 17, "#344054", 2))}</div>')
pop_d = (f'<div style="position: absolute; left: 790px; top: 330px; width: 250px; padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid {LINEA}; box-shadow: 0 16px 32px rgba(16,24,40,.14); display: flex; flex-direction: column; gap: 6px; z-index: 3;">'
         f'<span style="display: flex; align-items: center; gap: 8px;">{cod("GON-04", 14)}{gris("Góndola 4")}<span style="flex-grow: 1;"></span>{pill("aten", "Se libera")}</span>'
         f'<span style="font-size: 13px;">Ocupada por Aseo Total hasta el <b>15/11/2026</b>.</span><span style="font-size: 13px;">Disponible desde el <b>16/11/2026</b> · cubre 77 de tus 92 días.</span>'
         + btn("Contratar desde el 16/11/2026", "pri", None, 36, "width: 100%; margin-top: 4px;") + "</div>")
EST_F2 = {k: {"d": "d", "p": "p", "c": "c", "r": "r"}[v] for k, v in EST_FECHAS.items()}
f02 = shell("Contratos",
    cabecera("Disponibilidad de espacios", "Elegí las fechas: el plano dice qué está libre, hasta cuándo está ocupado y desde cuándo se libera.", btn("Cargar desde planilla", "sec", "planilla") + btn("Nuevo contrato", "sec", "mas2"))
    + tarjeta(f'<div style="display: flex; align-items: flex-end; gap: 16px;">{campo("Fecha de inicio", "01/11/2026", "200px", "calendario")}{campo("Duración", "3 meses · hasta 31/01/2027", "230px")}'
              f'{campo("Sede", "CENTRO", "180px")}{campo("Tipo de mueble", "Todos", "200px")}<span style="flex-grow: 1;"></span>{btn("Buscar", "pri", "buscar", 42, "padding: 0 22px;")}</div>', pad="18px 20px")
    + f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 15px;">16 espacios para esas fechas</b>{gris("· 4 libres todas las fechas · 8 libres una parte")}<span style="flex-grow: 1;"></span>'
    + segmentado([("Lista", "lista"), ("Mapa", "mapa")], "Mapa") + btn("Filtros", "sec", "filtro") + "</div>"
    + tarjeta(f'<div style="position: relative; flex-grow: 1; min-height: 0; display: flex;">{plano_svg(EST_F2, {}, sel="GON-04", vb=(-90, -30, 1180, 580))}{controles_mapa()}</div>'
              + f'<div style="display: flex; align-items: center; gap: 14px; margin: 10px 4px 0; padding: 12px 16px; border-radius: 12px; background: #F8FAFC; border: 1px solid {LINEA};">'
              + f'{cod("GON-04", 14)}{gris("Góndola 4")}{pill("aten", "Se libera")}<span style="font-size: 13px; color: #344054;">Ocupada por Aseo Total hasta el <b>15/11/2026</b> · disponible desde el <b>16/11/2026</b> · cubre 77 de tus 92 días</span>'
              + f'<span style="flex-grow: 1;"></span>{btn("Ver ficha", "sec", None, 36)}{btn("Contratar desde el 16/11/2026", "pri", None, 36)}</div>'
              + f'<div style="display: flex; gap: 22px; padding: 12px 4px 0; font-size: 13px; color: #344054;">' + "".join(f'<span style="display: inline-flex; align-items: center; gap: 7px;"><span style="width: 10px; height: 10px; border-radius: 99px; background: {c};"></span>{t}</span>' for c, t in [("#12B76A", "Disponible"), ("#F79009", "Se libera en tus fechas"), ("#F04438", "Ocupado"), ("#F79009;outline: 1.5px dashed #F79009; background: #fff", "Reservado"), ("#94A3B8", "No comercializable")]) + "</div>",
              pad="14px", extra="flex-grow: 1; min-height: 0; display: flex; flex-direction: column;"))
guardar_e("F02", "Contratos · disponibilidad y búsqueda", f02)

# ---------- F04 · Nuevo contrato (4 pasos) ----------
def stepper_f(act):
    pasos = ["Espacio", "Proveedor y marca", "Condiciones", "Confirmar"]
    out = '<div style="display: flex; align-items: center; gap: 14px; padding: 4px 30px;">'
    for i, p in enumerate(pasos, 1):
        on, hecho = i == act, i < act
        c = (f"background: {AZUL}; color: #fff;" if on else (f"background: {OKF}; color: {OKC};" if hecho else f"background: #EEF0F4; color: {TXT2};"))
        out += (f'<span style="display: inline-flex; align-items: center; gap: 10px; flex-shrink: 0;"><span style="width: 32px; height: 32px; border-radius: 99px; {c} font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;">{ic("check", 15, OKC, 3) if hecho else i}</span>'
                f'<span style="font-size: 13.5px; font-weight: {650 if on else 500}; color: {INK if on else TXT2};">{p}</span></span>')
        if i < 4:
            out += f'<span style="flex-grow: 1; height: 1.5px; background: {"#A6F4C5" if hecho else LINEA2};"></span>'
    return out + "</div>"
segsolido = lambda opts, act: '<span style="display: inline-flex; gap: 8px;">' + "".join(
    f'<span style="display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600; box-sizing: border-box; '
    + (f'background: {AZUL}; color: #fff;">{ic(i, 15, "#fff", 2)}' if t == act else f'background: #fff; color: #344054; border: 1px solid {LINEA2}; {SOMBRA}">{ic(i, 15, TXT2, 2)}') + f'{t}</span>' for t, i in opts) + "</span>"
FILAS_C = [("PUN-08", "Punta de góndola", "Pasillo 4", "Entera", pill("ok", "Disponible"), "100 %", "punta"),
           ("GON-01 B", "Góndola doble · cara B", "Pasillo 1", "Por entrepaño", pill("ok", "4 de 5 entrepaños"), "80 %", "gondola"),
           ("GON-03 A", "Góndola doble · cara A", "Pasillo 2", "Por participación", pill("aten", "Queda 20 %"), "20 %", "gondola"),
           ("NEV-01", "Nevera de 4 puertas", "Fondo", "Por puertas", pill("aten", "Puertas 2 y 4"), "50 %", "nevera"),
           ("GON-04", "Góndola doble", "Pasillo 3", "Entera", pill("aten", "Desde 16/11/2026"), "77 de 92 días", "gondola"),
           ("PUN-09", "Punta de góndola", "Entrada", "Entera", pill("ok", "Disponible"), "100 %", "punta")]
f04 = shell("Contratos",
    cabecera("", "", "", ["Contratos", "Nuevo contrato"]).replace('<h1 style="margin: 0; font-size: 23px; font-weight: 700; letter-spacing: -.015em;"></h1><span style="font-size: 13.5px; color: #7A8394;"></span>', "")
    + stepper_f(1)
    + cabecera("1. Elegí el espacio", "Elegí el mueble, la parte o la participación que querés contratar · del 01/11/2026 al 31/01/2027.",
               f'<span style="font-size: 13.5px; color: {TXT2}; padding-bottom: 10px;">Vista</span>' + segsolido([("Lista", "lista"), ("Mapa", "mapa")], "Lista"))
    + tarjeta(tabla("54px 0.9fr 1.5fr 0.9fr 1.1fr 1.3fr 1fr 120px", ["", "Código", "Tipo", "Ubicación", "Cómo se vende", "Estado", "Qué queda", "Acción"],
                    [(mini(t), cod(c), f'<span style="color: {TXT2};">{tp}</span>', f'<span style="color: {TXT2};">{u}</span>', f'<span style="color: {TXT2};">{m}</span>', e, f'<b style="font-weight: 600;">{q}</b>', btn("Seleccionar", "pri", None, 36, "width: 110px;"))
                     for c, tp, u, m, e, q, t in FILAS_C]), pad="0", extra="overflow: hidden;"))
guardar_e("F04", "Contratos · nuevo contrato (4 pasos)", f04)

# ---------- F01 · Indicadores: tablero ejecutivo ----------
def barras_f(w=600, h=230):
    datos = [("May", 9.05), ("Jun", 9.20), ("Jul", 9.10), ("Ago", 9.35), ("Sep", 9.49), ("Oct", 9.94)]
    x0, x1, y0, y1 = 84, w - 10, 16, h - 26
    Y = lambda v: y1 - v / 12 * (y1 - y0)
    g = ""
    for v in (0, 4, 8, 12):
        g += f'<line x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#F1F3F6"/><text x="{x0 - 10}" y="{Y(v) + 4:.1f}" text-anchor="end" font-size="11.5" fill="{TXT3}">$ {v}.000.000</text>'.replace("$ 0.000.000", "$ 0")
    bw = (x1 - x0) / 6 * .5
    for i, (m, v) in enumerate(datos):
        x = x0 + (i + .25) * (x1 - x0) / 6
        g += f'<rect x="{x:.1f}" y="{Y(v):.1f}" width="{bw:.1f}" height="{y1 - Y(v):.1f}" rx="6" fill="{"#3B82F6" if i == 5 else "#93C5FD"}"/><text x="{x + bw / 2:.1f}" y="{h - 6}" text-anchor="middle" font-size="12" fill="{TXT3}">{m}</text>'
    xo = x0 + 5.25 * (x1 - x0) / 6 + bw / 2
    g += f'<rect x="{xo - 62:.1f}" y="{Y(9.94) - 52:.1f}" width="124" height="42" rx="8" fill="#0F172A"/><text x="{xo:.1f}" y="{Y(9.94) - 35:.1f}" text-anchor="middle" font-size="11" fill="#CBD5E1">Oct 2026</text><text x="{xo:.1f}" y="{Y(9.94) - 18:.1f}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#fff">{fmt(9939500)}</text>'
    return f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Canon por mes">{g}</svg>'
def dona(p=86):
    import math
    r, cx, cy, sw = 70, 90, 90, 22
    L = 2 * math.pi * r
    g = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#E0EAFF" stroke-width="{sw}"/>'
    g += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#2F7CF6" stroke-width="{sw}" stroke-dasharray="{L * p / 100:.1f} {L:.1f}" transform="rotate(-90 {cx} {cy})" stroke-linecap="round"/>'
    g += f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="26" font-weight="750" fill="{INK}">{p} %</text><text x="{cx}" y="{cy + 24}" text-anchor="middle" font-size="12" fill="{TXT3}">ocupación</text>'
    return f'<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Ocupación {p} %">{g}</svg>'
ley_d = "".join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13.5px;"><span style="width: 10px; height: 10px; border-radius: 3px; background: {c};"></span><span style="flex-grow: 1;">{t}</span>{gris(n, 12.5)}<b style="width: 48px; text-align: right;">{p}</b></div>'
                for c, t, n, p in [("#1E5BD8", "Caras de góndola", "11 de 12", "92 %"), ("#4F8EF7", "Puntas de góndola", "7 de 9", "78 %"), ("#93C5FD", "Neveras", "1 de 1", "100 %")])
logo = lambda t, c: f'<span style="width: 24px; height: 24px; border-radius: 7px; background: {c}; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">{t}</span>'
PROV = [("LA", "#2563EB", "Lácteos Andinos", 2600000, "4", "26 %"), ("GS", "#E11D48", "Galletas Sol", 1740000, "3", "18 %"), ("CM", "#92400E", "Café Montaña", 1380000, "3", "14 %"), ("AT", "#0891B2", "Aseo Total", 1130000, "2", "11 %"), ("BV", "#16A34A", "Bebidas del Valle", 510000, "1", "5 %")]
VEN_F = [("GS", "#E11D48", "Galletas Sol", "PUN-07", "30/10/2026", True), ("AT", "#0891B2", "Aseo Total", "GON-04", "15/11/2026", True), ("LH", "#7C3AED", "Limpio Hogar", "PUN-01", "30/11/2026", False)]
f01 = shell("Indicadores",
    cabecera("Indicadores comerciales", "Resumen del desempeño de la sede · comparado con septiembre 2026.",
             segmentado(["Al mes", "Total del contrato"], "Al mes", True).replace('gap: 6px; flex-shrink: 0;', 'gap: 6px; flex-shrink: 0; padding-bottom: 4px;') + campo("Sede", "CENTRO", "170px") + campo("Período", "Octubre 2026", "190px"))
    + '<div style="display: flex; gap: 18px;">'
    + kpi_f("Canon del mes", fmt(9939500), f'<span style="display: flex; gap: 14px;">{up("4,7 %")}{gris("81 % del potencial", 12)}</span>')
    + kpi_f("Contratos activos", "19", f'<span style="display: flex; gap: 14px;">{up("2")}{gris("vs. septiembre", 12)}</span>')
    + kpi_f("Ocupación", "86 %", pill("aten", "Bajo la meta de 90 %"))
    + kpi_f("Canon ÷ tarifa", "94 %", pill("aten", "Bajo la meta de 95 %"))
    + "</div>"
    + '<div style="display: flex; gap: 18px;">'
    + tarjeta(tit_tarjeta("Canon por mes", btn("Tabla de contratos", "enl", None, 26)) + barras_f(), extra="flex: 1.25;")
    + tarjeta(tit_tarjeta("Ocupación por tipo de mueble", btn("Ver el plano", "enl", None, 26)) + f'<div style="display: flex; align-items: center; gap: 26px;">{dona()}<div style="flex-grow: 1;">{ley_d}</div></div>', extra="flex: 1;")
    + "</div>"
    + '<div style="display: flex; gap: 18px;">'
    + tarjeta(tit_tarjeta("Proveedores que más pagan", btn("Quién paga el canon", "enl", None, 26))
              + tabla("1.6fr 1fr .7fr .7fr", ["Proveedor", "Canon /mes", "Espacios", "% del total"], [(f'<span style="display: inline-flex; align-items: center; gap: 10px;">{logo(a, b)}{c}</span>', fmt(d), e, f_) for a, b, c, d, e, f_ in PROV]), pad="18px 18px 6px", extra="flex: 1.25;")
    + tarjeta(tit_tarjeta("Contratos por vencer (60 días)")
              + tabla("1.5fr .8fr 1fr .8fr", ["Proveedor", "Espacio", "Vence", "Acción"], [(f'<span style="display: inline-flex; align-items: center; gap: 10px;">{logo(a, b)}{c}</span>', cod(e), f'<span style="color: {CRC if u else TXT2}; font-weight: 600;">{f_}</span>', btn("Renovar", "azulsuave", None, 30)) for a, b, c, e, f_, u in VEN_F]), pad="18px 18px 6px", extra="flex: 1;")
    + "</div>", pad="26px 30px 30px")
guardar_e("F01", "Indicadores · tablero ejecutivo", f01, h=1140)
print("FIN F02 F04 F01 ok")

# ---------- dibujo frontal de una cara con zonas de color (Montajes, Distribución) ----------
def cara_zonas(zonas, estantes=5, w=560, h=330, etiquetas=True, productos=False):
    """zonas: (col0, col1 en 0..1, est0, est1 en 0..estantes, color, texto)."""
    X0, Y0, W, H = 26, 12, w - 52, h - 30
    g = f'<rect x="{X0 - 12}" y="{Y0 - 6}" width="10" height="{H + 22}" rx="2" fill="#9CA3AF"/><rect x="{X0 + W + 2}" y="{Y0 - 6}" width="10" height="{H + 22}" rx="2" fill="#9CA3AF"/>'
    g += f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" fill="#F3F4F6"/>'
    sh = H / estantes
    etq = ""
    for c0, c1, e0, e1, col, t in zonas:
        x, y, ww, hh = X0 + c0 * W + 3, Y0 + e0 * sh + 3, (c1 - c0) * W - 6, (e1 - e0) * sh - 10
        g += f'<rect x="{x:.1f}" y="{y:.1f}" width="{ww:.1f}" height="{hh:.1f}" rx="5" fill="{col}" fill-opacity="{.55 if not productos else .14}" stroke="{col}" stroke-width="2"/>'
        if productos:
            n = max(3, int(ww / 26))
            for r in range(int(e1 - e0)):
                yy = Y0 + (e0 + r) * sh + 8
                for k in range(n):
                    xx = x + 4 + k * (ww - 8) / n
                    bw = (ww - 8) / n - 4
                    g += f'<rect x="{xx:.1f}" y="{yy + 6:.1f}" width="{bw:.1f}" height="{sh - 22:.1f}" rx="3" fill="{col}"/><rect x="{xx + bw * .25:.1f}" y="{yy + 1:.1f}" width="{bw * .5:.1f}" height="6" rx="1.5" fill="{col}" opacity=".7"/>'
                    g += f'<rect x="{xx + 2:.1f}" y="{yy + sh * .38:.1f}" width="{bw - 4:.1f}" height="{sh * .16:.1f}" rx="1" fill="#FFFFFF" opacity=".75"/>'
        if etiquetas and t:
            a, b = (t.split("|") + [""])[:2]
            cy = y + hh / 2
            bwl = min(140, ww - 10)
            etq += f'<rect x="{x + ww / 2 - bwl / 2:.1f}" y="{cy - 20:.1f}" width="{bwl:.1f}" height="44" rx="8" fill="#FFFFFF" fill-opacity=".72"/><text x="{x + ww / 2:.1f}" y="{cy - 2:.1f}" text-anchor="middle" font-size="15" font-weight="700" fill="#111827">{a}</text><text x="{x + ww / 2:.1f}" y="{cy + 16:.1f}" text-anchor="middle" font-size="13" font-weight="600" fill="#1F2937">{b}</text>'
    for i in range(1, estantes + 1):
        y = Y0 + i * sh - 4
        g += f'<rect x="{X0 - 4}" y="{y:.1f}" width="{W + 8}" height="5" rx="1.5" fill="#D1D5DB" stroke="#9CA3AF" stroke-width=".8"/>'
    g += etq
    return f'<svg width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cara del mueble" style="display: block;">{g}</svg>'
ROJO_Z, VERDE_Z, AZUL_Z, AMA_Z, VIO_Z = "#EF6461", "#4CC38A", "#5B8DEF", "#F5C451", "#B18CF0"

# ---------- F08 · Montajes: tareas y ejecución ----------
MONT_F = [("gondola", "GON-05 A", "Arroz La Esquina y 3 más", "Planograma", ("Hoy 3:00 p. m.", CRC), pill("aten", "Montada, falta revisar"), btn("Revisar", "pri", None, 32, "width: 92px;")),
          ("punta", "PUN-05", "Galletas Sol", "Contrato", ("Hoy 5:00 p. m.", TXT2), pill("aten", "Montado, sin verificar"), btn("Verificar", "pri", None, 32, "width: 92px;")),
          ("punta", "PUN-08", "Galletas Sol", "Contrato", ("01/11/2026", TXT2), pill("neu", "Aviso enviado"), btn("Ver", "suave", None, 32, "width: 92px;")),
          ("gondola", "GON-03 A", "Lácteos Andinos · 25 %", "Participación", ("28/10/2026", TXT2), pill("aten", "Falta ubicar la zona"), btn("Ubicar", "suave", None, 32, "width: 92px;")),
          ("gondola", "GON-02 A", "Aseo Total", "Contrato", ("30/10/2026", TXT2), pill("neu", "Falta planometría"), btn("Adjuntar", "suave", None, 32, "width: 92px;"))]
info = lambda i, a, b: f'<div style="display: flex; gap: 12px; padding: 8px 0;">{ic(i, 17, TXT3, 1.8)}<span style="display: flex; flex-direction: column; gap: 1px;">{gris(a, 11.5)}<b style="font-size: 13px; font-weight: 600;">{b}</b></span></div>'
f08 = shell("Montajes",
    cabecera("Montajes", "Seguimiento de los montajes de contratos y planogramas.", campo("Sede", "CENTRO", "160px") + campo("Responsable", "Todos", "170px") + campo("Fecha", "Hoy, 26 oct 2026", "190px"))
    + pestanas_e([("Pendientes", 5), ("No realizados", 1), ("Verificados", 3), ("Requieren corrección", 1)], "Pendientes")
    + tarjeta(tabla("54px .9fr 1.5fr 1fr 1fr 1.4fr 110px", ["", "Espacio", "Proveedor o destino", "Tipo", "Fecha límite", "Estado", "Acción"],
                    [(mini(t), cod(c), p, f'<span style="color: {TXT2};">{tp}</span>', f'<span style="color: {fc[1]}; font-weight: 600;">{fc[0]}</span>', e, a) for t, c, p, tp, fc, e, a in MONT_F], sel=0), pad="0", extra="overflow: hidden; margin-top: -20px; border-top-left-radius: 0;")
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(f'<div style="display: flex; align-items: flex-start; gap: 10px;"><span style="display: flex; flex-direction: column; gap: 3px; flex-grow: 1;"><b style="font-size: 15px;">Detalle del montaje</b><b style="font-size: 16px;">GON-05 · cara A · versión 2</b></span>{pill("aten", "Montada, falta revisar")}</div>'
              f'<div style="display: flex; gap: 22px; flex-grow: 1; min-height: 0; margin-top: 10px;"><div style="flex: 1.2; min-height: 0;">{cara_zonas([(0, .3, 0, 5, ROJO_Z, "1|30 %"), (.3, .55, 0, 5, AZUL_Z, "2|25 %"), (.55, .8, 0, 5, VERDE_Z, "3|25 %"), (.8, 1, 0, 5, AMA_Z, "4|20 %")], w=400, h=300)}</div>'
              f'<div style="flex: 1; display: flex; flex-direction: column; gap: 10px; justify-content: center;">' + "".join(f'<span style="display: flex; align-items: center; gap: 10px; font-size: 13px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: {c};"></span><b>Zona {n} · {p}</b>{gris(t)}</span>' for n, p, t, c in [(1, "30 %", "Arroz La Esquina", ROJO_Z), (2, "25 %", "Aceites", AZUL_Z), (3, "25 %", "Pastas", VERDE_Z), (4, "20 %", "2×1 granos", AMA_Z)])
              + f'<span style="height: 8px;"></span><span style="display: flex; gap: 8px;">{btn("Ver guía de montaje", "pri", "archivo", 40)}{btn("Revisar el montaje", "sec", "camara", 40)}</span></div></div>',
              pad="20px 22px", extra="flex: 2; display: flex; flex-direction: column;")
    + tarjeta(tit_tarjeta("Información") + info("sede", "Sede", "CENTRO") + info("pin", "Pasillo", "5") + info("estantes", "Mueble", "Góndola doble · 1,20 m · 5 estantes") + info("calendario", "Fecha límite", "26/10/2026 · 3:00 p. m.") + info("usuario", "Responsable", "Luis Pérez") + info("archivo", "Nota", "Montada con foto a las 11:02"),
              pad="20px 22px", extra="flex: 1;")
    + "</div>", pad="26px 30px 26px")
guardar_e("F08", "Montajes · tareas y ejecución", f08, h=1000)

# ---------- F10 · Plano de la sede: editor 2D ----------
flot = lambda html, pos: f'<div style="position: absolute; {pos} background: #fff; border: 1px solid {LINEA}; border-radius: 12px; box-shadow: 0 8px 24px rgba(16,24,40,.08); z-index: 2;">{html}</div>'
herr_f = "".join(f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 8px; border-radius: 8px; font-size: 12.5px; font-weight: 600; {"background: " + AZUL_CL + "; color: " + AZUL_TX + ";" if t == "Seleccionar" else "color: #344054;"}">{ic(i, 15, AZUL_TX if t == "Seleccionar" else TXT2, 2)}{t}</span>'
                 for t, i in [("Seleccionar", "mano"), ("Rotar", "rotar"), ("Duplicar", "copiar"), ("Deshacer", "deshacer"), ("Rehacer", "rehacer")]) + f'<span style="width: 1px; height: 22px; background: {LINEA};"></span><span style="display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 8px; font-size: 12.5px; font-weight: 600; color: {CRC};">{ic("papelera", 15, CRC, 2)}Eliminar</span>'
cat_f = (f'<div style="width: 210px; padding: 14px;"><b style="font-size: 14px;">Catálogo</b><div style="margin: 10px 0 8px; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border-radius: 9px; background: #F3F4F6; color: #9CA3AF; font-size: 13px;">{ic("buscar", 15, "#9CA3AF")}Buscar mueble</div>'
         + "".join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-radius: 8px; font-size: 13px;">{mini(t, 30)}<span style="flex-grow: 1;">{n}</span>{gris(k, 12)}</div>' for t, n, k in [("gondola", "Góndola doble", "3"), ("gondola", "Góndola sencilla", "2"), ("punta", "Punta de góndola", "2"), ("nevera", "Nevera", "4"), ("punta", "Exhibidor", "3"), ("gondola", "Isla", "1")])
         + f'<div style="padding: 8px 6px 0; font-size: 12.5px; font-weight: 600; color: {AZUL_TX};">Ver el catálogo completo</div></div>')
prop_f = (f'<div style="width: 280px; padding: 18px;"><div style="display: flex; align-items: center;"><b style="font-size: 20px; flex-grow: 1;">GON-03</b>{ic("x", 16, TXT3)}</div>{gris("Góndola doble · pasillo 2", 13)}'
          + "".join(f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 9px 0; border-bottom: 1px solid {LINEA};">{gris(a, 11.5)}<b style="font-size: 13.5px; font-weight: 600;">{b}</b></div>' for a, b in [("Medidas", "1,20 × 0,60 × 1,80 m"), ("Caras", "A y B · 5 estantes"), ("¿Se contrata?", "Sí"), ("Cara A", "Por participación · queda 20 %"), ("Cara B", "Entera · Café Montaña hasta 31/05/2027")])
          + f'<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">{btn("Distribuir la cara A", "sec", "franja", 38, "width: 100%;")}{btn("Planograma de la cara B", "sec", "estantes", 38, "width: 100%;")}{btn("Ficha completa del mueble", "enl", "chev", 30)}</div></div>')
zoom_f = (f'<div style="position: absolute; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 2;">' + "".join(f'<span style="width: 42px; height: 42px; border-radius: 10px; background: #fff; border: 1px solid {LINEA}; {SOMBRA} display: inline-flex; align-items: center; justify-content: center; font-size: 18px; color: #344054;">{x}</span>' for x in ["+", "−", ic("pin", 17, "#344054", 2)]) + "</div>")
barra_f10 = (f'<div style="display: flex; align-items: center; gap: 4px; padding: 6px; margin-bottom: 10px; border-radius: 12px; background: #F8FAFC; border: 1px solid {LINEA};">{herr_f}</div>')
f10 = shell("Plano de la sede",
    cabecera("Plano de la sede — CENTRO", "Dibujá y ordená los muebles de la tienda · 16 muebles · 22 espacios contratables.",
             btn("Contorno de la sede", "sec", "lapiz") + btn("Capas", "sec", "capas") + segsolido([("2D", "mapa"), ("3D", "cubo")], "2D"))
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + tarjeta(cat_f.replace('width: 210px; padding: 14px;', 'padding: 0;'), pad="16px", extra="width: 200px; flex-shrink: 0;")
    + tarjeta(barra_f10 + f'<div style="position: relative; flex-grow: 1; min-height: 0; display: flex; border-radius: 10px; overflow: hidden; border: 1px solid {LINEA};">{plano_svg({c: "n" for c, *_ in MUEBLES}, {}, sel="GON-03", vb=(-30, -24, 1060, 560), cotas=True, tam=1.45)}{zoom_f}<div style="position: absolute; left: 12px; bottom: 12px;">{pill("ok", "Validación: sin inconsistencias", "ok")}</div></div>',
              pad="10px", extra="flex-grow: 1; min-height: 0; display: flex; flex-direction: column;")
    + tarjeta(prop_f.replace('width: 280px; padding: 18px;', 'padding: 0;'), pad="18px", extra="width: 280px; flex-shrink: 0;")
    + "</div>")
guardar_e("F10", "Plano de la sede · editor 2D", f10)
print("F08 F10 ok")

# ---------- F11 · Vista 3D (isométrica con producto en los estantes) ----------
PALETAS = [["#E5484D", "#F2C94C", "#F2994A", "#EB5757"], ["#2F80ED", "#56CCF2", "#F2F2F2", "#2D9CDB"], ["#27AE60", "#6FCF97", "#F2C94C", "#219653"],
           ["#9B51E0", "#BB6BD9", "#F2994A", "#EB5757"], ["#F2994A", "#F2C94C", "#E5484D", "#F2994A"]]
def iso3d(w=1000, h=640, sel="PUN-08"):
    k, ox, oy = .66, 360, 30
    P = lambda x, y, z=0: (ox + (x - y) * .866 * k, oy + (x + y) * .5 * k - z * k)
    pts = lambda L: " ".join(f"{a:.1f},{b:.1f}" for a, b in L)
    g = (f'<defs><linearGradient id="piso" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F5F7"/><stop offset="1" stop-color="#E7E9EE"/></linearGradient></defs>'
         f'<polygon points="{pts([P(20, 20), P(980, 20), P(980, 500), P(20, 500)])}" fill="url(#piso)"/>')
    for i in range(20, 981, 60):
        g += f'<polyline points="{pts([P(i, 20), P(i, 500)])}" stroke="#E2E5EA" stroke-width="1"/>'
    for j in range(20, 501, 60):
        g += f'<polyline points="{pts([P(20, j), P(980, j)])}" stroke="#E2E5EA" stroke-width="1"/>'
    g += f'<polygon points="{pts([P(20, 20, 0), P(980, 20, 0), P(980, 20, 130), P(20, 20, 130)])}" fill="#F8F9FB" stroke="#E5E7EB"/>'
    g += f'<polygon points="{pts([P(20, 20, 0), P(20, 500, 0), P(20, 500, 130), P(20, 20, 130)])}" fill="#EFF1F4" stroke="#E5E7EB"/>'
    orden = sorted(MUEBLES, key=lambda m: (m[1] + m[3] / 2) + (m[2] + m[4] / 2))
    for idx, (c, x, y, ww, hh, vert) in enumerate(orden):
        z = {"GON": 82, "PUN": 70, "NEV": 100}.get(c[:3], 70)
        if c == "PUN-09":
            z = 50
        pal = PALETAS[idx % len(PALETAS)]
        cuerpo = "#2B3A55" if c[:3] == "NEV" else "#D7DBE2"
        # caras laterales
        este = [P(x + ww, y, 0), P(x + ww, y + hh, 0), P(x + ww, y + hh, z), P(x + ww, y, z)]
        sur = [P(x, y + hh, 0), P(x + ww, y + hh, 0), P(x + ww, y + hh, z), P(x, y + hh, z)]
        g += f'<polygon points="{pts(este)}" fill="{cuerpo}"/><polygon points="{pts(sur)}" fill="#C3C8D1"/>'
        # producto en los estantes de la cara larga
        largo_este = hh >= ww
        niveles = 4
        for n in range(niveles):
            z0, z1 = z * (n + .12) / niveles, z * (n + .86) / niveles
            if largo_este:
                seg = max(3, int(hh / 22))
                for s in range(seg):
                    y0, y1 = y + s * hh / seg + 1, y + (s + 1) * hh / seg - 1
                    g += f'<polygon points="{pts([P(x + ww, y0, z0), P(x + ww, y1, z0), P(x + ww, y1, z1), P(x + ww, y0, z1)])}" fill="{pal[(s + n) % 4]}" opacity=".92"/>'
            else:
                seg = max(3, int(ww / 22))
                for s in range(seg):
                    x0, x1 = x + s * ww / seg + 1, x + (s + 1) * ww / seg - 1
                    g += f'<polygon points="{pts([P(x0, y + hh, z0), P(x1, y + hh, z0), P(x1, y + hh, z1), P(x0, y + hh, z1)])}" fill="{pal[(s + n) % 4]}" opacity=".92"/>'
            # baldas
            if largo_este:
                g += f'<polyline points="{pts([P(x + ww, y, z * n / niveles), P(x + ww, y + hh, z * n / niveles)])}" stroke="#9CA3AF" stroke-width="1.6"/>'
            else:
                g += f'<polyline points="{pts([P(x, y + hh, z * n / niveles), P(x + ww, y + hh, z * n / niveles)])}" stroke="#9CA3AF" stroke-width="1.6"/>'
        tope = [P(x, y, z), P(x + ww, y, z), P(x + ww, y + hh, z), P(x, y + hh, z)]
        g += f'<polygon points="{pts(tope)}" fill="#F3F4F6" stroke="#CBD2DC" stroke-width="1"/>'
        if c == sel:
            for poly in (este, sur, tope):
                g += f'<polygon points="{pts(poly)}" fill="none" stroke="{AZUL}" stroke-width="3"/>'
            tx, ty = P(x + ww / 2, y + hh / 2, z + 22)
            g += f'<rect x="{tx - 34:.1f}" y="{ty - 16:.1f}" width="68" height="24" rx="7" fill="{AZUL}"/><text x="{tx:.1f}" y="{ty:.1f}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">{c}</text>'
    ex, ey = P(480, 520)
    g += f'<text x="{ex:.1f}" y="{ey + 14:.1f}" text-anchor="middle" font-size="14" font-weight="600" fill="{AZUL_TX}">Entrada</text>'
    return f'<svg width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Sede CENTRO en 3D" style="display: block;">{g}</svg>'
vista = "".join(f'<span title="{t}" style="display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border-radius: 10px; background: {AZUL_CL if t == "Orbital" else "#fff"}; {"" if t == "Orbital" else "border: 1px solid " + LINEA2 + ";"} font-size: 12.5px; font-weight: 600; color: {AZUL_TX if t == "Orbital" else "#344054"}; box-sizing: border-box;">{ic(i, 15, AZUL_TX if t == "Orbital" else TXT2, 2)}{t}</span>'
                for t, i in [("Orbital", "rotar"), ("Primera persona", "usuario"), ("Cenital", "mapa"), ("Con arte", "producto"), ("Bajar imagen", "descargar")])
panel_3d = tarjeta(f'<div style="display: flex; align-items: center;"><b style="font-size: 22px; flex-grow: 1;">PUN-08</b>{ic("abajo", 16, TXT3)}</div>{gris("Punta de góndola", 13.5)}'
                   + "".join(f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-bottom: 1px solid {LINEA};">{gris(a, 11.5)}<b style="font-size: 14px; font-weight: 600;">{b}</b></div>' for a, b in [("Ubicación", "Pasillo 4 · frente a la entrada"), ("Dimensiones", "0,90 × 0,60 × 1,60 m"), ("Cómo se vende", "Entera"), ("Estado", "Disponible desde el 08/10/2026")])
                   + f'<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">{btn("Contratar este espacio", "pri", None, 44, "width: 100%;")}{btn("Probar un producto", "sec", "producto", 40, "width: 100%;")}{btn("Presentar al proveedor", "sec", "presentar", 40, "width: 100%;")}</div>'
                   + f'<div style="display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 12.5px; color: {TXT2};">{ic("abajo", 14, TXT2)}Más: encuadrar, rotar (R), espejar (F), quitar</div>', pad="20px", extra="width: 300px; flex-shrink: 0;")
f11 = shell("Plano de la sede",
    cabecera("Vista 3D — CENTRO", "Recorré la tienda en tres dimensiones.", vista + segsolido([("2D", "mapa"), ("3D", "cubo")], "3D"))
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + f'<div style="flex-grow: 1; min-width: 0; border-radius: 14px; overflow: hidden; border: 1px solid #F1F3F6; {SOMBRA} background: #EEF0F3;">{iso3d()}</div>'
    + panel_3d + "</div>")
guardar_e("F11", "Plano de la sede · vista 3D", f11)

# ---------- F12 · Distribución: editor de zonas ----------
riel = lambda items, act: (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 12px; background: #fff; border: 1px solid {LINEA}; {SOMBRA}">' + "".join(
    f'<span title="{t}" style="width: 56px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 0; border-radius: 9px; font-size: 10.5px; font-weight: 600; {"background: " + AZUL_CL + "; color: " + AZUL_TX + ";" if t == act else "color: " + TXT2 + ";"}">{ic(i, 18, AZUL_TX if t == act else TXT2, 2)}{t}</span>' for t, i in items) + "</div>")
Z12 = [(0, .5, 0, 2, ROJO_Z, "Café Montaña|20 %"), (.5, 1, 0, 2, VERDE_Z, "Lácteos Andinos|20 %"), (0, .5, 2, 4, AZUL_Z, "Galletas Sol|20 %"), (.5, 1, 2, 4, AMA_Z, "Snacks Andes|20 %"), (0, 1, 4, 5, VIO_Z, "Disponible|20 %")]
zona_l = lambda col, t, p, extra="": f'<div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid {LINEA};"><span style="width: 14px; height: 14px; border-radius: 4px; background: {col};"></span><span style="flex-grow: 1; font-size: 13.5px; font-weight: 500;">{t}</span>{extra}<b style="font-size: 13.5px;">{p}</b></div>'
f12 = shell("Plano de la sede",
    cabecera("Distribución de la cara", "Ubicá las participaciones contratadas en la cara del mueble. El dibujo no cambia el porcentaje del contrato.",
             btn("Deshacer", "sec", "deshacer") + btn("Guardar borrador", "sec", "check") + btn("Guardar la cara", "pri", None))
    + f'<div style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: {TXT2}; margin-top: -6px;"><span style="font-size: 16px;">‹</span> GON-03 · Góndola 3 · <b style="color: {INK};">Cara A</b>{segmentado(["Cara A", "Cara B"], "Cara A", True)}</div>'
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0;">'
    + riel([("Elegir", "mano"), ("Franja", "franja"), ("Estantes", "estantes"), ("A mano", "lapiz"), ("Acomodar", "cuadros"), ("Ver 3D", "cubo"), ("Más", "mas")], "Estantes")
    + tarjeta(cara_zonas(Z12, 5, 760, 470), pad="22px", extra="flex-grow: 1; display: flex; align-items: center; justify-content: center;")
    + tarjeta(f'<div style="display: flex; align-items: center; margin-bottom: 6px;"><b style="font-size: 15px; flex-grow: 1;">Zonas</b>{btn("Nueva participación", "pri", "mas2", 34)}</div>'
              + zona_l(ROJO_Z, "Café Montaña", "20 %") + zona_l(VERDE_Z, "Lácteos Andinos", "20 %") + zona_l(AZUL_Z, "Galletas Sol", "20 %") + zona_l(AMA_Z, "Snacks Andes", "20 %") + zona_l(VIO_Z, "Disponible", "20 %", btn("Contratar", "enl", None, 24))
              + f'<div style="margin-top: 14px; padding: 14px; border-radius: 12px; background: #F9FAFB; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px;">'
              f'<div style="display: flex; justify-content: space-between;"><span style="color: {TXT2};">Contratado</span><b>80 %</b></div><div style="display: flex; justify-content: space-between;"><span style="color: {TXT2};">Dibujado</span><b>80 %</b></div><div style="display: flex; justify-content: space-between;"><span style="color: {TXT2};">Disponible</span><b>20 %</b></div></div>',
              pad="20px", extra="width: 320px; flex-shrink: 0;")
    + "</div>")
guardar_e("F12", "Distribución · editor de zonas", f12)

# ---------- F13 · Planograma: crear y publicar ----------
Z13 = [(0, .3, 0, 5, "#E5484D", ""), (.3, .55, 0, 5, "#F2B705", ""), (.55, .8, 0, 5, "#2F80ED", ""), (.8, 1, 0, 5, "#27AE60", "")]
dest_l = lambda col, t, tipo, p: f'<div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid {LINEA};"><span style="width: 14px; height: 14px; border-radius: 4px; background: {col};"></span><span style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1;"><span style="font-size: 13.5px; font-weight: 600;">{t}</span>{gris(tipo, 12)}</span><b style="font-size: 13.5px;">{p}</b></div>'
f13 = shell("Plano de la sede",
    cabecera("Planograma · GON-05 cara A", "Planificá qué va en cada lugar de la cara · este mueble no se vende · borrador guardado hace 20 s.",
             btn("Guardar borrador", "sec", "check") + btn("Publicar versión 3", "pri", "enviar"))
    + pestanas_e(["Diseño", "Información", "Vista 3D", "Vista previa de la guía", "Historial de versiones"], "Diseño", 6)
    + '<div style="display: flex; gap: 18px; flex-grow: 1; min-height: 0; margin-top: -8px;">'
    + riel([("Elegir", "mano"), ("Franja", "franja"), ("Estantes", "estantes"), ("A mano", "lapiz"), ("Acomodar", "cuadros"), ("Deshacer", "deshacer"), ("Rehacer", "rehacer")], "Franja")
    + tarjeta(cara_zonas(Z13, 5, 760, 470, etiquetas=False, productos=True)
              + f'<div style="display: flex; gap: 18px; justify-content: center; margin-top: 8px; font-size: 12px; color: {TXT3};">Ilustración del destino de cada zona · 1,20 m · 5 estantes contados desde arriba</div>', pad="22px", extra="flex-grow: 1; display: flex; flex-direction: column; justify-content: center;")
    + tarjeta(f'<div style="display: flex; align-items: center; margin-bottom: 6px;"><b style="font-size: 15px; flex-grow: 1;">Destinos</b>{btn("Nuevo destino", "pri", "mas2", 34)}</div>'
              + dest_l("#E5484D", "Arroz La Esquina", "Marca propia", "30 %") + dest_l("#F2B705", "Aceites", "Categoría", "25 %") + dest_l("#2F80ED", "Pastas", "Categoría", "25 %") + dest_l("#27AE60", "2×1 granos", "Promoción · hasta 30/11/2026", "20 %")
              + f'<div style="margin-top: 14px; padding: 14px; border-radius: 12px; background: {OKF}; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: {OKC};"><b>Lista para publicar</b><span>100 % asignado · sin superposiciones · cada destino con su % exacto</span></div>',
              pad="20px", extra="width: 320px; flex-shrink: 0;")
    + "</div>")
guardar_e("F13", "Planogramas · crear y publicar", f13)
print("F11 F12 F13 ok")
