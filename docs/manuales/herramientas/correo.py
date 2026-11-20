"""Saca de la cola de correos de la copia de prueba un correo REAL, tal como lo
armó el servidor, y lo deja en un HTML con la cabecera de un buzón (para la
captura del manual). Busca el último cuyo asunto contiene ``asunto`` y cuyo
cuerpo contiene ``texto``.

Uso: python3 correo.py <base.db> "<asunto>" "<texto>" <salida.html>
"""
import json
import sqlite3
import sys
from html import escape

base, asunto, texto, salida = sys.argv[1:5]
c = sqlite3.connect(base)
fila = c.execute(
    "select asunto, cuerpo_html, destinatarios_json from correos_pendientes "
    "where asunto like ? and cuerpo_html like ? order by id desc limit 1",
    (f"%{asunto}%", f"%{texto}%")).fetchone()
if not fila:
    raise SystemExit(f"No hay un correo «{asunto}» con «{texto}» en la cola.")
titulo, cuerpo, para = fila
para = ", ".join(json.loads(para or "[]"))
with open(salida, "w", encoding="utf-8") as f:
    f.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif">'
            '<div style="background:#fff;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151">'
            f'<b style="font-size:15px;color:#111827">{escape(titulo)}</b><br>'
            f'<span style="color:#6b7280">De: RECABRA · Para: {escape(para)}</span></div>'
            f'<div style="padding:10px">{cuerpo}</div></body>')
print(salida)
