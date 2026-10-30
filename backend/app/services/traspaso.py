"""Pasar los datos de un cliente a la base principal.

**El caso que lo pidió (2026-09-23).** El supermercado real del dueño de la
plataforma —Galerías— vivía con el código `pepito`, en su propia base
(`recabra_pepito`), porque así lo bautizó el alta self-service el día que se
estrenó el login. El código `galerias`, el de la base principal, tenía los datos
de práctica de la instalación original. Renombrar el nombre visible no alcanzaba:
el dueño quiere que su supermercado SEA `galerias`, desde el código.

Cambiar el slug de un cliente no sirve: `galerias` es el cliente de la base por
defecto, y su base es también la del registro de todos los demás — no se puede
apuntar a otra. Lo que se mueve son los DATOS: las tablas de negocio del origen
reemplazan a las de la base principal, y todo lo que en el registro cuelga del
slug del origen (membresías, invitaciones, estado de cuenta, fundación, fotos
mensuales, supresiones, bitácora) pasa a colgar de `galerias`.

**Qué se pierde y qué no.** Se pierden los datos de negocio que la base
principal tenía antes (los de práctica, en el caso que lo pidió), y sus
membresías, invitaciones y estado. El origen NO se toca: queda archivado, con
su base intacta, como respaldo — se borra desde la consola cuando se confirma
que todo pasó bien.

**Todo o nada.** Las tablas de negocio de la base principal y las del registro
viven en la MISMA base, así que el reemplazo y el cambio del registro van en una
sola transacción: si algo falla a la mitad, no cambió nada. El origen sólo se
lee.

**Las tablas se clasifican a mano, y lo que no está clasificado frena todo.**
Borrar una tabla del registro en la base principal —usuarios, membresías— sería
borrar el sistema entero. Por eso las tablas de negocio son una lista EXPLÍCITA
(`TABLAS_DEL_CLIENTE`) y no «todo lo que no es registro»: una tabla nueva que
nadie clasificó hace que el traspaso se niegue a correr
(`tablas_sin_clasificar`), en vez de borrarla o dejarla atrás en silencio.
"""
import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy import Integer, func, inspect, literal, select, text

from app.auth import clave_epoca, invalidar_cache_membresia
from app.clientes import (
    Cliente, es_el_de_siempre, motor_de, sesion_registro,
)
from app.database import Base, engine as motor_por_defecto

log = logging.getLogger("recabra.traspaso")

# Las del REGISTRO: viven en la base por defecto y son de todos los clientes.
# `create_all` las crea también en la base de cada cliente, donde quedan vacías
# y no significan nada. Nunca se copian ni se vacían como datos de negocio.
TABLAS_DEL_REGISTRO = frozenset({
    "clientes", "usuarios", "membresias", "oauth_attempts", "invitaciones",
    "consentimientos", "estados_cliente", "alta_attempts", "fundaciones",
    "bitacora_plataforma", "snapshot_metricas", "ajustes_de_snapshot", "solicitudes_supresion",
    "export_attempts",
    # El cobro de la suscripción (C1): lo que RECABRA le cobra a cada cliente.
    # Es de la plataforma, no del supermercado: ni se copia ni se vacía. Y los
    # correos de la escalera que ya salieron (C2).
    "suscripciones", "facturas_cobro", "pagos_cobro", "cambios_estado_cuenta",
    "avisos_cobro",
})

# Las de NEGOCIO de un supermercado: lo que se copia. Incluye la configuración
# (`app_config`: sedes, rótulos, temporadas, tarifas, contactos, claves
# compartidas y épocas de sesión), los archivos —que viven en la base, porque el
# disco de Render se borra— y la bitácora del supermercado.
TABLAS_DEL_CLIENTE = frozenset({
    "suppliers", "spaces", "space_leases", "layout_snapshots",
    "renumeracion_nombres", "app_config", "space_files", "space_faces",
    "mount_confirmations", "archived_spaces", "notification_logs",
    "lease_files", "supplier_assets", "supplier_asset_specs", "login_attempts", "audit_log",
    # Las fichas propias de sus muebles (`cli:<clave>`): las colocan sus planos,
    # que viajan con ellas. Sin archivos: una ficha no lleva foto.
    "modelos_mueble",
    # Las participaciones de cara (`models/participaciones.py`): los términos,
    # las distribuciones, sus zonas y el historial, que nunca se purga. Cuelgan
    # de `spaces`, `space_leases` y `suppliers`, que viajan con ellas; el orden
    # lo da `sorted_tables` y ninguna se apunta a sí misma (`renueva_a` es un
    # entero sin clave foránea), así que copiar sin `ORDER BY` no rompe nada.
    "participaciones", "distribuciones", "zonas", "historial_participaciones",
    # Lo que guarda Vender de un contrato (`models/vender.py`): cómo se
    # escribió el precio, el de una reserva, el cobro por ventas con sus cortes
    # el aviso de montaje que espera zona y la reserva de una cara entera o de
    # una parte. Cuelgan de `space_leases`, `participaciones`, `spaces` y
    # `suppliers`, que viajan con ellas.
    "condiciones_de_contrato", "precios_de_reserva", "cobros_por_venta", "cortes_de_venta",
    "montajes_pendientes", "reservas_de_espacio",
    # «Editar contrato» (2026-10-22): el contrato que se cerró porque otro lo
    # reemplazó. Cuelga de `space_leases`, que viaja con ella.
    "contratos_reemplazados",
    # Un contrato de antes de Vender al que se le dijo cómo se lee su valor
    # (al mes o total), con lo de antes para deshacerlo. Cuelga de `space_leases`.
    "precios_corregidos",
    # Los planogramas con destinos (`models/planogramas.py`): los destinos de
    # cada sede, el planograma de cada cara, sus versiones publicadas, sus
    # piezas y quién publica. Ninguna se apunta a sí misma.
    "destinos", "planogramas", "versiones_de_planograma", "piezas_de_planograma", "ajustes_de_planograma",
    # La foto de cómo quedó una cara, desde su guía de montaje (fase 3), y la
    # supervisión (fase 4): el aviso de quien monta y la revisión, que apunta
    # al aviso.
    "fotos_de_guia", "montajes_de_planograma", "revisiones_de_planograma",
    # La verificación del montaje de un contrato (rediseño UX, 2026-10-26).
    # Cuelga de `mount_confirmations`, que viaja con ella.
    "verificaciones_de_montaje",
    # Auditoría 2026-10-30: el día efectivo de la baja de un contrato (P2-13;
    # cuelga de `space_leases`) y la papelera de sedes borradas (P2-18; guarda
    # el plano y ids de lo cerrado, sin claves foráneas).
    "bajas_de_contrato", "sedes_en_papelera",
})

# Las que guardan archivos enteros: se copian de a pocas filas para no cargar
# decenas de fotos en la memoria de una instancia de 512 MB.
_TABLAS_CON_ARCHIVOS = frozenset({"space_files", "lease_files", "supplier_assets", "fotos_de_guia"})
_LOTE_CON_ARCHIVOS = 10
_LOTE = 500

# Cambia en cada traspaso. `GET /api/layout/settings` la devuelve y el
# navegador descarta los planos que tenía guardados de OTRA generación antes de
# sincronizar: sin esto, un equipo que conservaba en `localStorage` los planos
# de práctica bajo el mismo código `galerias` podía subirlos encima de los
# datos reales (ver `fixtureStore.syncFromServer`).
CLAVE_GENERACION = "generacion_datos"


class ErrorDeTraspaso(Exception):
    pass


def tablas_sin_clasificar() -> set[str]:
    """Las tablas del esquema que no son ni de negocio ni del registro."""
    return set(Base.metadata.tables) - TABLAS_DEL_REGISTRO - TABLAS_DEL_CLIENTE


def _tablas_del_cliente() -> list:
    """Las de negocio, padres antes que hijos (el orden de las claves foráneas)."""
    return [t for t in Base.metadata.sorted_tables if t.name in TABLAS_DEL_CLIENTE]


def _faltan_columnas(motor, tablas) -> list[str]:
    """`tabla.columna` que el modelo tiene y la base no. `create_all` nunca
    agrega columnas: una base vieja sin una columna nueva perdería ese dato."""
    inspector = inspect(motor)
    faltan = []
    for tabla in tablas:
        reales = {c["name"] for c in inspector.get_columns(tabla.name)}
        faltan += [f"{tabla.name}.{c.name}" for c in tabla.columns if c.name not in reales]
    return faltan


def _copiar(origen, destino, tabla) -> int:
    lote = _LOTE_CON_ARCHIVOS if tabla.name in _TABLAS_CON_ARCHIVOS else _LOTE
    filas = origen.execution_options(stream_results=True).execute(select(tabla))
    total = 0
    while True:
        tanda = filas.fetchmany(lote)
        if not tanda:
            return total
        destino.execute(tabla.insert(), [dict(f._mapping) for f in tanda])
        total += len(tanda)


def _reiniciar_secuencias(cx, tablas) -> None:
    """En Postgres, las filas se insertaron con su `id`: el contador de cada
    tabla tiene que quedar después del último, o el próximo alta choca."""
    if cx.dialect.name != "postgresql":
        return
    for tabla in tablas:
        pk = list(tabla.primary_key.columns)
        if len(pk) != 1 or not isinstance(pk[0].type, Integer):
            continue
        col = pk[0].name
        cx.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{tabla.name}', '{col}'), "
            f"COALESCE((SELECT MAX({col}) FROM {tabla.name}), 0) + 1, false)"
        ))


def _epoca(cx, rol: str) -> int:
    from app.models.models import AppConfig

    ac = AppConfig.__table__
    valor = cx.execute(select(ac.c.value).where(ac.c.key == clave_epoca(rol))).scalar()
    try:
        return int(valor or 0)
    except ValueError:
        return 0


def _poner_config(cx, clave: str, valor: str) -> None:
    from app.models.models import AppConfig

    ac = AppConfig.__table__
    cx.execute(ac.delete().where(ac.c.key == clave))
    cx.execute(ac.insert().values(key=clave, value=valor))


def _mover_registro(cx, origen: str, principal: str) -> None:
    """Lo que en el registro colgaba del origen pasa a colgar del principal; lo
    que colgaba del principal (los datos que se reemplazan) se va."""
    from app.models.identidad import Invitacion, Membresia
    from app.models.plataforma import BitacoraPlataforma, EstadoCliente, Fundacion, SnapshotMetricas
    from app.models.supresion import SolicitudSupresion

    for modelo, columna in (
        (Membresia, "cliente_slug"),
        (Invitacion, "cliente_slug"),
        (EstadoCliente, "slug"),
        (Fundacion, "cliente_slug"),
        (SnapshotMetricas, "cliente_slug"),
    ):
        tabla = modelo.__table__
        col = tabla.c[columna]
        cx.execute(tabla.delete().where(col == principal))
        cx.execute(tabla.update().where(col == origen).values({columna: principal}))

    # Las solicitudes de supresión son constancia legal: las del principal se
    # quedan, y las del origen lo siguen a donde van sus datos.
    s = SolicitudSupresion.__table__
    cx.execute(s.update().where(s.c.cliente_slug == origen).values(cliente_slug=principal))

    # La bitácora del operador: lo que se consultó del origen se consultó de
    # estos datos, que ahora son del principal — y su reporte lo tiene que ver.
    b = BitacoraPlataforma.__table__
    viejo = f"{origen}:"
    cx.execute(
        b.update()
        .where(b.c.periodo.startswith(viejo, autoescape=True))
        .values(periodo=literal(f"{principal}:") + func.substr(b.c.periodo, len(viejo) + 1))
    )


def traspasar_al_principal(slug_origen: str) -> dict:
    """Los datos de `slug_origen` pasan a la base principal. Ver el docstring del
    módulo. Devuelve el resumen: principal, origen y filas copiadas por tabla."""
    from app.models.identidad import Membresia
    from app.models.models import ClienteRow

    sin_clasificar = tablas_sin_clasificar()
    if sin_clasificar:
        raise ErrorDeTraspaso(
            "Hay tablas que nadie clasificó como de negocio o de registro "
            f"({', '.join(sorted(sin_clasificar))}): el traspaso no corre hasta que se clasifiquen."
        )

    reg = sesion_registro()
    try:
        filas = reg.query(ClienteRow).all()
        principal = next((f for f in filas if es_el_de_siempre(f)), None)
        origen = next((f for f in filas if f.slug == (slug_origen or "").strip().lower()), None)
        if origen is None:
            raise LookupError("No hay un cliente con ese código.")
        if principal is None:
            raise ErrorDeTraspaso("No hay un cliente en la base principal.")
        if origen.slug == principal.slug or es_el_de_siempre(origen):
            raise ErrorDeTraspaso("Ese cliente ya es el de la base principal.")
        if not origen.activo:
            # Después de un traspaso, el origen queda archivado de RESPALDO.
            # Pasarlo otra vez pisaría todo lo que se trabajó desde entonces en
            # el principal; para usar el respaldo hay que reactivarlo antes, a
            # propósito.
            raise ErrorDeTraspaso(
                "Ese cliente está archivado: si es el respaldo de un traspaso, pasarlo otra vez "
                "pisaría todo lo que se trabajó desde entonces en el principal. Reactivalo primero "
                "si de verdad querés usarlo."
            )
        cliente_origen = Cliente(
            slug=origen.slug, nombre=origen.nombre, db_name=origen.db_name, activo=origen.activo,
        )
        slug_principal = principal.slug
        miembros = [
            (m.usuario_id, m.cliente_slug)
            for m in reg.query(Membresia)
            .filter(Membresia.cliente_slug.in_([origen.slug, principal.slug]))
            .all()
        ]

        # Primero se archiva el origen, en su propio commit: nadie escribe en
        # él mientras se copia, y sus sesiones mueren en el pedido siguiente.
        origen.activo = False
        reg.commit()
    finally:
        reg.close()
    for usuario_id, slug in miembros:
        invalidar_cache_membresia(usuario_id, slug)

    try:
        motor_origen = motor_de(cliente_origen)
        # Las tablas que falten se crean (una base vieja puede no tener una
        # tabla nueva); las columnas no se pueden crear, así que se exigen.
        Base.metadata.create_all(bind=motor_origen)
        Base.metadata.create_all(bind=motor_por_defecto)
        tablas = _tablas_del_cliente()
        faltan = _faltan_columnas(motor_origen, tablas) + _faltan_columnas(motor_por_defecto, tablas)
        if faltan:
            raise ErrorDeTraspaso(
                "Las dos bases no tienen las mismas columnas (" + ", ".join(sorted(set(faltan)))
                + "): copiar perdería datos, así que no se copia nada."
            )

        copiadas: dict[str, int] = {}
        with motor_origen.connect() as src, motor_por_defecto.begin() as cx:
            epocas_antes = {rol: _epoca(cx, rol) for rol in ("admin", "worker")}
            for tabla in reversed(tablas):
                cx.execute(tabla.delete())
            for tabla in tablas:
                copiadas[tabla.name] = _copiar(src, cx, tabla)
            _reiniciar_secuencias(cx, tablas)

            # Ninguna sesión de antes sobrevive al cambio de contenido: la época
            # queda por encima de la del principal Y de la del origen. Sin esto,
            # copiar una época más baja resucitaría tokens ya revocados.
            for rol, antes in epocas_antes.items():
                _poner_config(cx, clave_epoca(rol), str(max(antes, _epoca(cx, rol)) + 1))
            _poner_config(cx, CLAVE_GENERACION, secrets.token_hex(8))

            _mover_registro(cx, cliente_origen.slug, slug_principal)
            c = ClienteRow.__table__
            cx.execute(c.update().where(c.c.slug == slug_principal).values(activo=True))
    except Exception:
        # No se hizo: el origen vuelve a quedar como estaba, activo.
        reg = sesion_registro()
        try:
            fila = reg.query(ClienteRow).filter(ClienteRow.slug == cliente_origen.slug).first()
            if fila is not None:
                fila.activo = True
                reg.commit()
        finally:
            reg.close()
        raise

    for usuario_id, slug in miembros:
        invalidar_cache_membresia(usuario_id, slug)
        invalidar_cache_membresia(usuario_id, slug_principal)
    log.warning(
        "Traspaso: los datos de %s pasaron a la base principal (%s). Filas: %s",
        cliente_origen.slug, slug_principal, copiadas,
    )
    return {"principal": slug_principal, "origen": cliente_origen.slug, "filas": copiadas}
