"""Guardar un contrato de Vender de una vez: todo o nada
(``docs/rediseno/vender-api.md`` §1).

Un contrato de la pantalla de Vender puede llevar varias líneas: caras enteras
o partes (``CENTRO-PUN-02-EN1``) y porcentajes de caras que se venden por
participación (``CENTRO-GON-02`` al 75 %). Hasta el rediseño eran dos llamadas
—la planilla para lo entero y una por porcentaje— y si la tercera fallaba
quedaban las dos primeras escritas, con sus correos. Ahora es UNA: o se
escriben todas las líneas o ninguna.

**Cómo revisa.** No inventa reglas: cada línea pasa por la revisión que ya
tenía su camino. Lo entero y las partes, por la de la planilla
(``bulk_leases._revisar``: el plano, la compuerta, los choques —también entre
líneas del mismo pedido— y las participaciones vivas). Los porcentajes, por la
de participaciones (``revisar_alta``: la compuerta, las fechas, las
invariantes de una renovación y la capacidad con lo físico de la cara). Lo que
se agrega acá es lo que ningún camino podía ver solo: **dos porcentajes de la
misma cara en el mismo pedido se suman entre sí** antes de compararlos con la
capacidad.

**El orden que no se negocia**, el de participaciones pero para TODO el
pedido: revisar → ``tomar_candados`` de todos los muebles juntos, UNA vez y en
orden (dos pedidos con muebles cruzados no se traban) → ``db.expire_all()`` →
revisar otra vez → escribir. Lo que vale es la revisión de adentro.

**Los mensajes no nombran a nadie** ni dicen el porcentaje de otro: lo lee
Vender en vivo, delante del proveedor. Sólo lo que queda y desde cuándo.

Nada de acá hace commit: el router anota la bitácora, hace commit (o rollback)
y recién después manda los correos.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.fechas import dia_corto, hoy
from app.models.models import Supplier
from app.models.participaciones import Participacion
from app.models.vender import CobroPorVenta, CondicionesDeContrato, PrecioDeReserva, ReservaDeEspacio
from app.routers.bulk_leases import ERROR, FilaIn, FilaOut, LoteIn, MAX_FILAS, _codigo_completo, _revisar
from app.services import participaciones as part
from app.services import reglas_participacion as reglas
from app.services.alta_de_contrato import (
    cache_de_proveedores, clave_de_proveedor, escribir_contrato, espacio_para, proveedor_por_nombre,
)
from app.services.candado import clave_de_candado, tomar_candados
from app.services.layout_lookup import PlanoIndexado, normalizar
from app.services.meses import meses_entre


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _dia_corto(d: date) -> str:
    """«3 nov»; con el año si no es el de hoy («3 ene 2027»)."""
    return dia_corto(d)


# ─── Lo que se revisó de cada línea ───────────────────────────────────────────


@dataclass
class Linea:
    """Una línea del pedido, revisada."""
    indice: int
    entrada: dict
    #: Una cara entera o una parte: lo que resolvió la planilla.
    fila: Optional[FilaOut] = None
    #: Un porcentaje: la cara, sus datos y (si renueva) el término renovado.
    cara: Optional[part.Cara] = None
    datos: Optional[part.Datos] = None
    renovado: Optional[Participacion] = None
    pb: int = 0


@dataclass
class Revision:
    lineas: list[Linea] = field(default_factory=list)
    filas: list[dict] = field(default_factory=list)

    @property
    def codigos(self) -> set[str]:
        """Los códigos de los muebles que el pedido toca: los de las caras y
        partes (resueltos y tecleados) y los de las caras de los porcentajes."""
        fuera = set()
        for x in self.lineas:
            if x.fila is not None and x.fila.codigo:
                fuera.add(x.fila.codigo)
            if x.cara is not None:
                fuera.add(x.cara.codigo)
        return fuera


def _fila_de_error(indice: int, espacio: Optional[str], code: str, mensaje: str, **extra) -> dict:
    return {"indice": indice, "espacio": espacio, "code": code, "mensaje": mensaje, **extra}


def _fila_de_rechazo(indice: int, espacio: str, pb: int, e: HTTPException) -> dict:
    """Un rechazo de participaciones como fila del 409. El de capacidad se dice
    con lo que queda y desde cuándo, nunca con lo que tienen los demás."""
    d = e.detail if isinstance(e.detail, dict) else {"code": "linea_invalida", "message": str(e.detail)}
    if d.get("code") == "capacidad_excedida":
        queda = int(d.get("disponible_pb") or 0)
        desde_dia = d.get("dia")
        cuando = _dia_corto(date.fromisoformat(desde_dia)) if desde_dia else ""
        return _fila_de_error(indice, espacio, "capacidad_excedida",
                              f"Ya no entra el {reglas.pct(pb)}: desde el {cuando} queda {reglas.pct(queda)}.",
                              queda_pb=queda, desde_dia=desde_dia)
    if d.get("code") == "rompe_distribucion":
        # La frase de Distribución nombra participaciones («las zonas de la
        # participación 3 pisan las de la 2»): delante del proveedor, no.
        return _fila_de_error(indice, espacio, "rompe_distribucion",
                              "Con esas fechas no entra: revisá la distribución en Supervisar.")
    return _fila_de_error(indice, espacio, d.get("code") or "linea_invalida", d.get("message") or "No entra.")


# ─── La revisión del pedido entero ────────────────────────────────────────────


def _validar_pedido(p: dict) -> None:
    """Lo que vale para todo el pedido (422, antes de mirar ninguna línea)."""
    dia = hoy()
    if not normalizar(p.get("sede")):
        raise _error(422, "sede", "Falta la sede.")
    if not (p.get("proveedor") or "").strip():
        raise _error(422, "proveedor", "Falta el proveedor.")
    lineas = p.get("lineas") or []
    if not lineas:
        raise _error(422, "sin_lineas", "El contrato no tiene ningún espacio.")
    if len(lineas) > MAX_FILAS:
        raise _error(422, "demasiadas_lineas", f"Un contrato lleva hasta {MAX_FILAS} espacios.")
    tipo = p["tipo"]
    part.validar_fechas(tipo, p["desde"], p["hasta"], p.get("caduca"), dia)
    if tipo == "contrato" and p.get("caduca") is not None:
        raise _error(422, "caduca", "Un contrato no caduca: la caducidad es de la reserva.")
    cobro = p.get("cobro") or {"modo": "fijo"}
    if cobro.get("modo") == "ventas":
        # Una reserva también puede cobrar por ventas (decisión del dueño,
        # 2026-10-20): guarda el cobro y su contrato nace cobrando así.
        porcentaje = cobro.get("porcentaje")
        if porcentaje is None or not (0 < porcentaje <= 100):
            raise _error(422, "cobro", "Escribí el porcentaje de las ventas (más de 0 y hasta 100).")
        if cobro.get("corte") not in ("mensual", "al_final"):
            raise _error(422, "cobro", "Elegí cada cuánto se carga lo vendido: cada mes o al final.")
    for i, linea in enumerate(lineas):
        if bool((linea.get("espacio") or "").strip()) == bool(linea.get("participacion")):
            raise _error(422, "linea", f"La línea {i + 1} tiene que ser un espacio o un porcentaje, no las dos.")


def _errores_de_valor(p: dict, linea: dict) -> Optional[str]:
    """El valor de una línea: el total por todo el plazo (§1)."""
    ventas = (p.get("cobro") or {}).get("modo") == "ventas"
    valor = linea.get("valor")
    if ventas:
        if valor not in (None, 0):
            return "Con cobro por ventas el valor va en 0: lo que se cobra sale de los cortes."
        return None
    if valor is not None and valor < 0:
        return "El valor no puede ser negativo."
    if p["tipo"] == "contrato" and not valor:
        return "Falta el valor, o quedó en cero."
    if linea.get("modo_precio") == "mensual" and valor:
        tecleado = linea.get("valor_tecleado")
        if not tecleado or tecleado <= 0:
            return "Falta el valor de cada mes."
        meses = meses_entre(p["desde"], p["hasta"])
        if abs(round(tecleado * meses) - valor) > 1:
            return "El total no coincide con el valor de cada mes por la duración: volvé a escribirlo."
    return None


def revisar(db: Session, p: dict, excluir_lease: Optional[int] = None,
            excluir_termino: Optional[int] = None) -> Revision:
    """Revisa TODO el pedido sin escribir nada. Devuelve las líneas revisadas
    y las filas con error (vacías: entra todo).

    ``excluir_lease`` / ``excluir_termino``: SÓLO «Editar contrato»
    (``services/editar_contrato.py``): el contrato que se edita no choca ni
    ocupa capacidad contra sí mismo. El guardado de Vender nunca los pasa."""
    _validar_pedido(p)
    dia = hoy()
    sede = normalizar(p["sede"])
    rev = Revision()

    # ── Caras enteras y partes: la revisión de la planilla, en una tanda ─────
    enteras = [(i, x) for i, x in enumerate(p["lineas"]) if (x.get("espacio") or "").strip()]
    if enteras:
        lote = LoteIn(sede=sede, filas=[
            FilaIn(fila=i, espacio=x["espacio"], sede=sede, proveedor=p["proveedor"], correo=p.get("correo"),
                   marca=p.get("marca"), valor=x.get("valor") or 0, desde=p["desde"].isoformat(),
                   hasta=p["hasta"].isoformat(), nota=p.get("nota"))
            for i, x in enteras
        ])
        # El valor lo mira `_errores_de_valor` (un contrato por ventas va en 0).
        # Delante del proveedor: un choque se dice «tomado», sea contrato o reserva.
        por_fila = {f.fila: f for f in _revisar(db, lote, exigir_valor=False, delante_del_proveedor=True,
                                                excluir_lease=excluir_lease, excluir_termino=excluir_termino)}
        for i, x in enteras:
            f = por_fila[i]
            linea = Linea(indice=i, entrada=x, fila=f)
            rev.lineas.append(linea)
            if f.estado == ERROR:
                rev.filas.append(_fila_de_error(i, f.codigo or x["espacio"], "linea_invalida", f.mensajes[0],
                                                mensajes=f.mensajes))
                continue
            malo = _errores_de_valor(p, x)
            if malo:
                rev.filas.append(_fila_de_error(i, f.codigo, "valor", malo))

    # ── Porcentajes: la revisión de participaciones, y la suma entre líneas ──
    plano = PlanoIndexado(db)
    datos_por_cara: dict[str, part.Datos] = {}
    #: Lo que ya pidieron las líneas anteriores del pedido en cada cara.
    pedidos: dict[str, list[dict]] = {}
    renovados: set[int] = set()
    supplier_clave = clave_de_proveedor(p["proveedor"])
    for i, x in enumerate(p["lineas"]):
        pc = x.get("participacion")
        if not pc:
            continue
        pb = int(pc["puntos_basicos"])
        linea = Linea(indice=i, entrada=x, pb=pb)
        rev.lineas.append(linea)
        espacio = pc["cara"]
        try:
            cara = part.resolver_cara(db, sede, pc["cara"], plano)
            linea.cara = cara
            espacio = cara.codigo
            datos = datos_por_cara.get(cara.codigo)
            if datos is None:
                datos = datos_por_cara[cara.codigo] = part.leer(db, cara.codigo)
            linea.datos = datos
            malo = _errores_de_valor(p, x)
            if malo:
                rev.filas.append(_fila_de_error(i, espacio, "valor", malo))
                continue
            if pc.get("renueva") is not None:
                _revisar_renovacion(db, p, linea, supplier_clave, renovados)
            else:
                part.revisar_alta(db, cara, datos, {"tipo": "alta", "pb": pb, "desde": p["desde"],
                                                    "hasta": p["hasta"]},
                                  excluir_lease=excluir_lease, excluir_termino=excluir_termino)
            antes = pedidos.setdefault(cara.codigo, [])
            if antes:
                # Las líneas anteriores de ESTA cara en este pedido todavía no
                # están en la base: se suman a lo que cuenta.
                fisicos = part.fisicos_de(db, cara, p["desde"], p["hasta"], excluir_lease=excluir_lease)
                I = reglas.intervalos_que_cuentan(datos.todos, fisicos, dia, excluir_id=excluir_termino) + antes
                part._rechazo(reglas.revisar_capacidad(I, fisicos, pb, p["desde"], p["hasta"], cara.letra, dia))
            antes.append({"desde": p["desde"], "hasta": p["hasta"], "pb": pb})
        except HTTPException as e:
            rev.filas.append(_fila_de_rechazo(i, espacio, pb, e))
    rev.lineas.sort(key=lambda x: x.indice)
    rev.filas.sort(key=lambda f: f["indice"])
    return rev


def _revisar_renovacion(db: Session, p: dict, linea: Linea, supplier_clave: str, renovados: set[int]) -> None:
    """Las invariantes de ``POST /api/participaciones/{id}/renovar``: la misma
    cara, el mismo proveedor, la misma marca y el mismo porcentaje, y que
    empiece después de lo vivo (``revisar_alta`` con ``renovar``)."""
    tid = int(linea.entrada["participacion"]["renueva"])
    if tid in renovados:
        raise _error(409, "renovacion_repetida", "Esa participación ya se renueva en otra línea.")
    renovados.add(tid)
    t = db.get(Participacion, tid)
    if t is None:
        raise _error(404, "sin_participacion", "Esa participación no existe.")
    if part.cara_del_termino(db, t).codigo != linea.cara.codigo:
        raise _error(409, "otra_cara", "La participación que se renueva es de otra cara.")
    regla = next(x for x in linea.datos.por_s[t.space_id] if x["id"] == t.id)
    proveedor = db.get(Supplier, regla["supplier_id"]) if regla.get("supplier_id") is not None else None
    if proveedor is None or clave_de_proveedor(proveedor.name) != supplier_clave:
        raise _error(409, "otro_proveedor", "Una renovación sigue con el mismo proveedor.")
    if reglas._marca_normal(regla.get("marca")) != reglas._marca_normal(p.get("marca")):
        raise _error(409, "otra_marca", "Una renovación sigue con la misma marca.")
    if regla["pb"] != linea.pb:
        raise _error(409, "otro_porcentaje", f"Una renovación sigue con el mismo porcentaje ({reglas.pct(regla['pb'])}).")
    linea.renovado = t
    medidas = part.medidas_de_capas(linea.cara, linea.datos)
    part.revisar_alta(db, linea.cara, linea.datos, {
        "tipo": "renovar", "renueva_a": t.id, "version": t.version, "tipo_nuevo": p["tipo"],
        "desde": p["desde"], "hasta": p["hasta"], "caduca": p.get("caduca")}, medidas)


def _rechazar(rev: Revision) -> None:
    if rev.filas:
        n = len(rev.filas)
        raise HTTPException(status_code=409, detail={
            "code": "contrato_invalido",
            "message": f"{n} línea{'' if n == 1 else 's'} no entra{'' if n == 1 else 'n'}: no se guardó nada.",
            "filas": rev.filas,
        })


# ─── Escribir ─────────────────────────────────────────────────────────────────


@dataclass
class Hecho:
    """Lo que escribió el pedido, para la respuesta, la bitácora y los correos."""
    contratos: list[dict] = field(default_factory=list)
    participaciones: list[dict] = field(default_factory=list)
    reservas: list[dict] = field(default_factory=list)
    #: ``(accion, entidad, entidad_id, detalle)`` para la bitácora.
    bitacora: list[tuple] = field(default_factory=list)
    #: Las filas de los correos (sólo contratos). El de montaje de todas
    #: espera su planometría (``services/montajes_pendientes.py``).
    filas: list[FilaOut] = field(default_factory=list)
    #: Lo que el router arma con ``fila_de_participacion`` después del commit:
    #: ``(lease, termino, letra, supplier)``.
    de_participacion: list[tuple] = field(default_factory=list)


def _cobro_de_reserva(cobro: dict) -> dict:
    """Las columnas del cobro en una tabla de reserva."""
    ventas = cobro.get("modo") == "ventas"
    return {"cobro_modo": "ventas" if ventas else "fijo",
            "cobro_porcentaje": float(cobro["porcentaje"]) if ventas else None,
            "cobro_corte": cobro.get("corte") if ventas else None}


def _condiciones(db: Session, lease_id: int, linea: dict, cobro: dict, actor: str) -> None:
    if linea.get("modo_precio") in ("mensual", "total"):
        db.add(CondicionesDeContrato(lease_id=lease_id, modo_precio=linea["modo_precio"],
                                     valor_tecleado=linea.get("valor_tecleado")))
    if cobro.get("modo") == "ventas":
        db.add(CobroPorVenta(lease_id=lease_id, porcentaje=float(cobro["porcentaje"]), corte=cobro["corte"],
                             creado_por=actor))


def guardar(db: Session, p: dict, actor: str, validar: bool = False) -> Optional[Hecho]:
    """Revisa y, sin ``validar``, escribe todo el pedido. ``None`` al validar.
    Levanta 422 (el pedido), 409 ``contrato_invalido`` (alguna línea) o 409
    ``plano_cambio`` (el plano cambió entre las dos revisiones)."""
    rev = revisar(db, p)
    _rechazar(rev)
    if validar:
        return None
    codigos = rev.codigos | {
        _codigo_completo(x["espacio"], normalizar(p["sede"])) for x in p["lineas"] if (x.get("espacio") or "").strip()
    }
    tomados = set(tomar_candados(db, codigos))
    # Lectura fresca (regla dura de participaciones): lo que la primera
    # revisión cargó en la sesión no se refresca solo al volver a consultarlo.
    db.expire_all()
    rev = revisar(db, p)
    _rechazar(rev)
    if any(clave_de_candado(c) not in tomados for c in rev.codigos):
        raise _error(409, "plano_cambio", "El plano cambió mientras guardabas: recargá y volvé a intentar.")
    return _escribir(db, p, rev, actor)


def _escribir(db: Session, p: dict, rev: Revision, actor: str, nota_de: Optional[str] = None) -> Hecho:
    """``nota_de``: «Editar contrato» cuando reemplaza un contrato por otra
    forma de venderlo: los nuevos se quedan con la nota interna del viejo (que
    Vender no muestra ni manda, porque lo mira el proveedor)."""
    hecho = Hecho()
    tipo = p["tipo"]
    cobro = p.get("cobro") or {"modo": "fijo"}
    ventas = cobro.get("modo") == "ventas"
    marca = (p.get("marca") or "").strip() or None
    nota = (p.get("nota") or "").strip() or None
    if nota_de is not None:
        nota = nota_de.strip() or None
    correo = part._correo(p.get("correo"))
    supplier = proveedor_por_nombre(db, p["proveedor"], correo, cache_de_proveedores(db))
    plano = PlanoIndexado(db)

    for linea in rev.lineas:
        x = linea.entrada
        valor = 0.0 if ventas else (float(x["valor"]) if x.get("valor") is not None else None)
        if linea.fila is not None:
            v = linea.fila
            resuelto = plano.resolver(v.sede or "", v.codigo or "")
            space = espacio_para(db, v.codigo, v.nombre, v.sede, resuelto.fixture if resuelto else None,
                                 resuelto.parte if resuelto else None)
            if tipo == "contrato":
                lease = escribir_contrato(db, space, supplier, marca, p["desde"], p["hasta"], valor, nota)
                _condiciones(db, lease.id, x, cobro, actor)
                v.lease_id = lease.id
                v.valor = valor
                v.proveedor = supplier.name
                hecho.filas.append(v)
                hecho.contratos.append({"espacio": v.codigo, "lease_id": lease.id})
                hecho.bitacora.append(("contrato.alta", "contrato", lease.id,
                                       f"{space.code} · {supplier.name} · {p['desde']}→{p['hasta']}"))
            else:
                r = ReservaDeEspacio(
                    space_id=space.id, supplier_id=supplier.id, marca=marca, desde=p["desde"], hasta=p["hasta"],
                    caduca=p["caduca"], valor=valor, modo_precio=x.get("modo_precio"),
                    valor_tecleado=x.get("valor_tecleado"), correo=correo, notas=nota, estado="viva",
                    creado_por=actor, **_cobro_de_reserva(cobro),
                )
                db.add(r)
                db.flush()
                hecho.reservas.append({"espacio": v.codigo, "reserva_id": r.id})
                hecho.bitacora.append(("reserva_espacio.alta", "reserva", r.id,
                                       f"{space.code} · {supplier.name} · {p['desde']}→{p['hasta']} · "
                                       f"caduca {p['caduca']}"))
            continue

        e = {"tipo": tipo, "proveedor": p["proveedor"], "correo": p.get("correo"), "marca": marca,
             "puntos_basicos": linea.pb, "desde": p["desde"], "hasta": p["hasta"], "caduca": p.get("caduca"),
             "valor_mensual": valor if tipo == "contrato" else None, "notas": nota}
        if linea.renovado is not None:
            t = linea.renovado
            h = part.escribir_renovacion(db, linea.cara, linea.datos, t, {**e, "version": t.version}, actor)
        else:
            h = part.escribir_alta(db, linea.cara, linea.datos, e, actor, supplier)
        if h.lease is not None:
            _condiciones(db, h.lease.id, x, cobro, actor)
            hecho.de_participacion.append((h.lease, h.termino, h.cara.letra, h.supplier))
        elif valor is not None or ventas:
            db.add(PrecioDeReserva(participacion_id=h.termino.id, valor=None if ventas else valor,
                                   modo_precio=None if ventas else x.get("modo_precio"),
                                   valor_tecleado=None if ventas else x.get("valor_tecleado"), creado_por=actor,
                                   **_cobro_de_reserva(cobro)))
        # `lease_id` para colgarle la planometría al contrato; una reserva
        # lleva su id (`reserva_id`, que en un porcentaje es el del término).
        hecho.participaciones.append({
            "cara": h.cara.codigo, "espacio": h.entidad, "termino_id": h.termino.id, "tipo": tipo,
            "lease_id": h.lease.id if h.lease is not None else None,
            "reserva_id": h.termino.id if h.lease is None else None,
        })
        hecho.bitacora.append((h.accion, "participacion", h.entidad, h.detalle))
    db.flush()
    return hecho
