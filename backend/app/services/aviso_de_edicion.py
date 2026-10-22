"""Los correos de «Editar contrato»: «Contrato modificado», a TODOS y SIEMPRE
(decisión del dueño, 2026-10-22; ``services/editar_contrato.py``).

Salen después del commit, como los de Vender (``bulk_leases._avisar``), y por
los mismos caños: ``correo_configurado`` y ``send_mail_to_bg`` se llaman por
``bulk_leases`` para que una prueba los intercepte en un solo lugar.

· **Comercial** (el gerente y el administrador de la sede): «Contrato
  modificado — PUN-04 · POBLADO», con cada campo Antes → Ahora (o «igual») y
  quién lo cambió y cuándo. Con la plata entera.
· **El proveedor** (el correo del proveedor del contrato que queda): «Tu
  contrato cambió: PUN-04 — <supermercado>», Antes → Ahora sólo de lo suyo. Si
  el contrato pasó a OTRO proveedor, el nuevo recibe sólo lo de ahora (lo de
  antes era de otro) y el de antes no recibe nada: no se le cuenta a quién se
  le dio.
· **Montaje** (la mercaderista de la sede): «Contrato modificado — PUN-04 ·
  POBLADO», sin plata, con el enlace firmado de montaje del contrato que queda.
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
from app.services.layout_lookup import describe_location, sin_prefijo_de_sede
from app.services.mailer import app_base_url, html_shell
from app.services.montajes_pendientes import ids_pendientes


def _antes_ahora(antes: str, ahora: str, cambio: bool) -> str:
    if not cambio:
        return f'{escape(ahora)} <span style="color:#6b7280;font-weight:400;">(igual)</span>'
    return (f'<span style="color:#6b7280;font-weight:400;text-decoration:line-through;">{escape(antes)}</span>'
            f' → {escape(ahora)}')


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
        rows = [(escape(c), _antes_ahora(a, b, cambio)) for c, a, b, cambio in filas]
        rows.append(("Lo cambió", f"{escape(actor or '—')} · {_cuando(datetime.now(timezone.utc))}"))
        pie = f"Se modificó un contrato de {escape(sede)} en RECABRA ({escape(cliente.nombre)})."
        if reemplazo:
            pie += (" El contrato anterior se cerró como <strong>reemplazado</strong> (no cancelado): su "
                    "planometría y su montaje quedan con él, y los de los contratos nuevos se piden en "
                    "Supervisar → «Para revisar».")
        background_tasks.add_task(bl.send_mail_to_bg, who["comercial"], asunto, html_shell(asunto, rows, pie))

    # ── El proveedor: sólo lo suyo ──────────────────────────────────────────
    lease = db.get(SpaceLease, despues[0].lease_id)
    supplier: Supplier | None = lease.supplier if lease is not None else None
    if listo and supplier is not None and supplier.email:
        encolados.proveedor.append(supplier.email)
        mismo = antes.supplier_id == despues[0].supplier_id
        asunto = f"Tu contrato cambió: {codigo} — {cliente.nombre}"
        rows = [("Supermercado", escape(cliente.nombre))]
        if mismo:
            rows += [(escape(c), _antes_ahora(a, b, cambio)) for c, a, b, cambio in filas]
        else:
            # Lo de antes era de otro proveedor: a éste, sólo lo de ahora.
            rows += [(escape(c), escape(b)) for c, _a, b, _cambio in filas]
        background_tasks.add_task(
            bl.send_mail_to_bg, [supplier.email], asunto,
            html_shell(asunto, rows,
                       f"Actualizamos tu contrato. Cualquier ajuste sobre lo acordado, comunicate con "
                       f"{escape(cliente.nombre)}."),
        )

    # ── Montaje: sin plata, con su enlace ───────────────────────────────────
    a_montar = [d for d in despues if d.lease_id not in pendientes]
    if who["montaje"] and listo and a_montar:
        encolados.montaje.extend(who["montaje"])
        asunto = f"Contrato modificado — {codigo} · {sede or 'sede'}"
        rows = []
        for d in a_montar:
            fila = fila_para_montar(db, db.get(SpaceLease, d.lease_id))
            donde = describe_location(db, fila.codigo or "", fila.sede or sede)
            rows.append((
                escape(sin_prefijo_de_sede(fila.codigo or "", sede)),
                (f"<strong>{escape(fila.parte)}</strong><br>" if fila.parte else "")
                + (f"Dónde queda: {escape(donde)}<br>" if donde else "")
                + f"{escape(fila.proveedor or '')}{f' · {escape(fila.marca)}' if fila.marca else ''}<br>"
                f"Desde el {escape(reglas._fecha_corta(d.desde))} hasta el {escape(reglas._fecha_corta(d.hasta))}<br>"
                f'<a href="{bl._enlace_de_montaje(fila, cliente)}" style="color:#0369A1;font-weight:600;">'
                "Abrir el montaje</a>",
            ))
        pie = ("Cambió el contrato de un espacio que montás: revisá lo de arriba. Sin precios. "
               f'Quien tenga cuenta en RECABRA también lo ve en <a href="{app_base_url()}/" '
               'style="color:#0369A1;">Montajes</a>.<br><br><span style="color:#94A3B8;font-size:12px;">'
               "Los enlaces son personales: no los reenvíes.</span>")
        background_tasks.add_task(bl.send_mail_to_bg, who["montaje"], asunto, html_shell(asunto, rows, pie))
    return encolados
