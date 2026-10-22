"""Los correos de «Editar contrato»: «Contrato modificado», a TODOS y SIEMPRE
(decisión del dueño, 2026-10-22; ``services/editar_contrato.py``).

Salen después del commit, como los de Vender (``bulk_leases._avisar``), y por
los mismos caños: ``correo_configurado`` y ``send_mail_to_bg`` se llaman por
``bulk_leases`` para que una prueba los intercepte en un solo lugar.

· **Comercial** (el gerente y el administrador de la sede): «Contrato
  modificado — PUN-04 · POBLADO», una tabla «Antes | Ahora» con cada campo
  (lo que no cambió dice «igual») y quién lo cambió y cuándo. Con la plata
  entera.
· **El proveedor** (el correo del proveedor del contrato que queda): «Tu
  contrato cambió: PUN-04 — <supermercado>», «Hola, <proveedor>.» y la tabla
  «Antes | Ahora» sólo de lo suyo. Si
  el contrato pasó a OTRO proveedor, el nuevo recibe sólo lo de ahora (lo de
  antes era de otro) y el de antes no recibe nada: no se le cuenta a quién se
  le dio.
· **Montaje** (la mercaderista de la sede): «Contrato modificado — PUN-04 ·
  POBLADO», sin plata, con el espacio como lo escribe la app («PUN-03 · EN1»)
  y el enlace firmado de montaje del contrato que queda.
  Si ese contrato todavía espera su planometría (``montajes_pendientes``: uno
  nuevo de un reemplazo, o uno en su lugar que todavía no la tiene), su aviso
  espera como cualquier otro y sale al cargarla, con los datos de ese momento.
"""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.clientes import Cliente
from app.fechas import ZONA_DEL_NEGOCIO
from app.models.models import SpaceLease, Supplier
from app.schemas.spaces import AvisosContrato
from app.services import reglas_participacion as reglas
from app.services.contacts import recipients_for
from app.services.editar_contrato import Editado, cambios
from app.services.layout_lookup import describe_location
from app.services.mailer import app_base_url, html_shell
from app.services.montajes_pendientes import ids_pendientes


_GRIS = "#6b7280"
_TINTA = "#111827"
_CELDA = "padding:6px 12px;font-size:13px;vertical-align:top;"


def _tabla_antes_ahora(filas: list[tuple[str, str, str, bool]], con_antes: bool = True) -> str:
    """La tabla del dibujo aprobado: «Antes | Ahora», un renglón por campo. Lo
    que no cambió dice «igual» en «Ahora»; lo que cambió, lo de antes tachado y
    lo nuevo en negrita. ``con_antes=False`` (el proveedor nuevo de un contrato
    que pasó a otro): sólo «Ahora», porque lo de antes era de otro."""
    cabeza = (f'<tr><th style="{_CELDA}text-align:left;"></th>'
              + (f'<th style="{_CELDA}text-align:left;color:{_GRIS};font-weight:600;">Antes</th>' if con_antes else "")
              + f'<th style="{_CELDA}text-align:left;color:{_GRIS};font-weight:600;">Ahora</th></tr>')
    cuerpo = []
    for campo, antes, ahora, cambio in filas:
        celda_campo = f'<td style="{_CELDA}color:{_GRIS};white-space:nowrap;">{escape(campo)}</td>'
        if not con_antes:
            cuerpo.append(f"<tr>{celda_campo}"
                          f'<td style="{_CELDA}color:{_TINTA};font-weight:600;">{escape(ahora)}</td></tr>')
            continue
        if cambio:
            celda_antes = f'<td style="{_CELDA}color:{_GRIS};text-decoration:line-through;">{escape(antes)}</td>'
            celda_ahora = f'<td style="{_CELDA}color:{_TINTA};font-weight:600;">{escape(ahora)}</td>'
        else:
            celda_antes = f'<td style="{_CELDA}color:{_TINTA};">{escape(antes)}</td>'
            celda_ahora = f'<td style="{_CELDA}color:{_GRIS};">igual</td>'
        cuerpo.append(f"<tr>{celda_campo}{celda_antes}{celda_ahora}</tr>")
    return (f'<table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:6px;">'
            f"{cabeza}{''.join(cuerpo)}</table>")


def _correo(titulo: str, intro: str, cuerpo: str, pie: str = "") -> str:
    """La misma carcasa de ``mailer.html_shell`` (el título, el papel, la
    firma), con una introducción y una tabla propia. ``titulo`` es TEXTO (se
    escapa acá); ``intro``, ``cuerpo`` y ``pie`` son HTML que quien llama ya
    escapó."""
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;'
        'padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">'
        f'<h2 style="margin:0 0 12px;font-size:18px;color:{_TINTA};">{escape(titulo)}</h2>'
        f'<p style="margin:0 0 12px;font-size:14px;color:#374151;">{intro}</p>'
        f"{cuerpo}"
        + (f'<p style="margin:16px 0 0;font-size:13px;color:#374151;">{pie}</p>' if pie else "")
        + '<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">'
        "Mensaje automático del sistema de gestión de espacios — RECABRA.</p>"
        "</div>"
    )


def _cuando(dt: datetime) -> str:
    local = dt.astimezone(ZONA_DEL_NEGOCIO)
    return f"{reglas._fecha_corta(local.date())}, {local:%H:%M}"


def avisar_edicion(db: Session, background_tasks: BackgroundTasks, cliente: Cliente, hecho: Editado,
                   actor: str) -> AvisosContrato:
    """Un correo por rol. Devuelve a quién se encoló (lo ENCOLADO, no lo
    entregado), como Vender."""
    from app.routers import bulk_leases as bl
    from app.routers.montajes import fila_para_montar

    listo = bl.correo_configurado()
    encolados = AvisosContrato(smtp_listo=listo, comercial=[], montaje=[], proveedor=[])
    antes, despues = hecho.antes, hecho.despues
    if not despues:
        return encolados
    sede = despues[0].sede or antes.sede
    who = recipients_for(db, sede)
    filas = cambios(antes, despues)
    # El espacio como se lee («GON-02·A», «PUN-03·EN1»); de un porcentaje, su
    # cara (el `…-PC<n>` es un número interno).
    codigo = antes.nombre
    reemplazo = hecho.modo == "reemplazo"
    pendientes = ids_pendientes(db, [d.lease_id for d in despues])
    encolados.montaje_pendiente = sorted(pendientes)

    # ── Comercial ───────────────────────────────────────────────────────────
    if who["comercial"] and listo:
        encolados.comercial.extend(who["comercial"])
        asunto = f"Contrato modificado — {codigo} · {sede or 'sede'}"
        cuerpo = _tabla_antes_ahora(filas)
        cuerpo += (f'<p style="margin:12px 0 0;font-size:13px;color:#374151;">Lo cambió: '
                   f"<strong>{escape(actor or '—')}</strong> · {_cuando(datetime.now(timezone.utc))}</p>")
        pie = f"RECABRA · {escape(cliente.nombre)}."
        if reemplazo:
            nuevos = ("los del contrato nuevo se piden" if len(despues) == 1
                      else "los de los contratos nuevos se piden")
            pie = (f"El contrato anterior se cerró como <strong>reemplazado</strong> (no cancelado): su "
                   f"planometría y su montaje quedan con él, y {nuevos} en Supervisar → «Para revisar». " + pie)
        background_tasks.add_task(
            bl.send_mail_to_bg, who["comercial"], asunto,
            _correo(asunto, f"Se modificó un contrato de {escape(sede or 'la sede')}:", cuerpo, pie))

    # ── El proveedor: sólo lo suyo ──────────────────────────────────────────
    # Al correo del proveedor del contrato QUE QUEDA, y a ningún otro: si el
    # contrato pasó a otro proveedor, el de antes no recibe nada (no se le
    # cuenta a quién se le dio) y el correo del de antes nunca le llegó al
    # nuevo (``editar_contrato._sin_el_correo_del_anterior``).
    lease = db.get(SpaceLease, despues[0].lease_id)
    supplier: Supplier | None = lease.supplier if lease is not None else None
    if listo and supplier is not None and supplier.email:
        encolados.proveedor.append(supplier.email)
        mismo = antes.supplier_id == despues[0].supplier_id
        asunto = f"Tu contrato cambió: {codigo} — {cliente.nombre}"
        # Lo de antes era de otro proveedor: al nuevo, sólo lo de ahora.
        cuerpo = _tabla_antes_ahora(filas, con_antes=mismo)
        background_tasks.add_task(
            bl.send_mail_to_bg, [supplier.email], asunto,
            _correo(asunto, f"Hola, {escape(supplier.name or despues[0].proveedor)}. Actualizamos tu contrato con "
                            f"{escape(cliente.nombre)}:", cuerpo,
                    f"Cualquier ajuste sobre lo acordado, comunicate con {escape(cliente.nombre)}."),
        )

    # ── Montaje: sin plata, con su enlace ───────────────────────────────────
    a_montar = [d for d in despues if d.lease_id not in pendientes]
    if who["montaje"] and listo and a_montar:
        encolados.montaje.extend(who["montaje"])
        asunto = f"Contrato modificado — {codigo} · {sede or 'sede'}"
        rows: list[tuple[str, str]] = []
        for d in a_montar:
            fila = fila_para_montar(db, db.get(SpaceLease, d.lease_id))
            donde = describe_location(db, fila.codigo or "", fila.sede or sede)
            # El código como lo escribe la app («PUN-03 · EN1»), no con guion.
            rows += [
                ("Espacio", escape(d.rotulo) + (f" · {escape(donde)}" if donde else "")),
                ("Proveedor · marca", f"{escape(fila.proveedor or '')}{f' · {escape(fila.marca)}' if fila.marca else ''}"),
                ("Fechas", f"{escape(reglas._fecha_corta(d.desde))} → {escape(reglas._fecha_corta(d.hasta))}"),
                ("", f'<a href="{bl._enlace_de_montaje(fila, cliente)}" style="color:#0369A1;font-weight:600;">'
                     "Abrir el montaje</a>"),
            ]
        pie = (f'Quien tenga cuenta en RECABRA también lo ve en <a href="{app_base_url()}/" '
               'style="color:#0369A1;">Montajes</a>.<br><br><span style="color:#94A3B8;font-size:12px;">'
               "Los enlaces son personales: no los reenvíes.</span>")
        cuerpo = html_shell(asunto, rows)
        # La tabla de `html_shell` (sin su carcasa: va en la de `_correo`).
        tabla = cuerpo[cuerpo.index("<table"):cuerpo.index("</table>") + len("</table>")]
        background_tasks.add_task(
            bl.send_mail_to_bg, who["montaje"], asunto,
            _correo(asunto, "Cambió el contrato de un espacio que montás. Sin precios.", tabla, pie))
    return encolados
