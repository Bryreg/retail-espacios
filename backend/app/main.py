import asyncio
import threading
import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.auth import ensure_default_config
from app.database import engine, Base
from app.routers import spaces, suppliers, dashboard, layout, files, notifications, mounts, montaje, planograms, bulk_leases, catalogo, muebles
from app.routers import bitacora as bitacora_routes
from app.routers import auth as auth_routes
from app.routers import usuarios as usuarios_routes
from app.routers import alta as alta_routes
from app.routers import derechos as derechos_routes
from app.routers import copia as copia_routes
from app.routers import suscripcion as suscripcion_routes
from app.routers import plataforma as plataforma_routes
from app.routers import participaciones as participaciones_routes
from app.routers import planogramas as planogramas_routes
from app.routers import guia as guia_routes
from app.routers import vender as vender_routes
from app.routers import cobros as cobros_routes
from app.routers import reservas as reservas_routes
from app.routers import montajes as montajes_routes
from app.models.models import Space, SpaceStatus
from app.services.subidas import LimiteDeCuerpo
# Tablas de identidad (Fase 1): archivo nuevo, sin columnas agregadas a nada
# existente. El único propósito de este import es que `Base.metadata` las
# conozca ANTES de que corra `create_all()` en el lifespan de abajo — si no,
# `create_all` nunca se entera de que existen.
from app.models import identidad as identidad_models  # noqa: F401
# Participaciones de cara (cuatro tablas nuevas en la base del supermercado,
# sin columnas agregadas a nada existente). Mismo propósito: que `create_all()`
# del lifespan las conozca.
from app.models import participaciones as participaciones_models  # noqa: F401
# Lo que guarda Vender de un contrato (seis tablas nuevas: cómo se escribió el
# precio, el de una reserva, el cobro por ventas con sus cortes, el aviso de
# montaje que espera zona y la reserva de una cara entera o de una parte).
# Mismo propósito.
from app.models import vender as vender_models  # noqa: F401
# Planogramas con destinos (cinco tablas nuevas: destinos, planogramas, sus
# versiones, sus piezas y quién publica). Mismo propósito.
from app.models import planogramas as planogramas_models  # noqa: F401
# La cola de correos (una tabla nueva por cliente, P1-4) y los índices que
# llegaron con Alembic (`models/indices.py`, P1-8). Mismo propósito.
from app.models import correos as correos_models  # noqa: F401
from app.models import indices as indices_models  # noqa: F401

logger = logging.getLogger("retail.main")


# ─── Seed ─────────────────────────────────────────────────────────────────────

def seed_spaces(db):
    spaces_data = [
        # Row A
        {"code": "A01", "svg_id": "lic-24h", "name": "Licores 24H", "zone": "Pasillo A", "area_m2": 6.5},
        {"code": "A02", "svg_id": "lic-golosinas", "name": "Licores / Golosinas y Nueces", "zone": "Pasillo A", "area_m2": 9.5},
        {"code": "A03", "svg_id": "sal-azucar-granos", "name": "Sal / Panela / Azúcar / Granos", "zone": "Pasillo A", "area_m2": 14.0},
        {"code": "A04", "svg_id": "arroz-centro", "name": "Arroz (3 módulos)", "zone": "Pasillo A", "area_m2": 10.0},
        {"code": "A05", "svg_id": "grano-granel", "name": "Grano a Granel", "zone": "Pasillo A", "area_m2": 7.5},
        {"code": "A06", "svg_id": "desechables-a", "name": "Desechables (sector A)", "zone": "Pasillo A", "area_m2": 6.0},
        {"code": "A07", "svg_id": "vacio-aceites", "name": "Vacío / Aceites", "zone": "Pasillo A", "area_m2": 8.0},
        # Row B
        {"code": "B01", "svg_id": "utensilios-ferreteria", "name": "Utensilios Plásticos / Ferretería / Autos", "zone": "Pasillo B", "area_m2": 16.5},
        {"code": "B02", "svg_id": "mascotas", "name": "Mascotas / Mascotas Granel", "zone": "Pasillo B", "area_m2": 14.0},
        {"code": "B03", "svg_id": "arroz-exhibicion", "name": "Arroz - Exhibición Principal", "zone": "Arroz", "area_m2": 35.0},
        # Row C
        {"code": "C01", "svg_id": "aseo-panales", "name": "Aseo BB / Pañales / Papel Higiénico", "zone": "Pasillo C", "area_m2": 18.0},
        {"code": "C02", "svg_id": "escobas-guantes", "name": "Escobas / Traperos / Guantes / Bolsas", "zone": "Pasillo C", "area_m2": 9.0},
        {"code": "C03", "svg_id": "servilletas-cocina", "name": "Servilletas / Papel Cocina", "zone": "Pasillo C", "area_m2": 7.0},
        {"code": "C04", "svg_id": "mezclas-harinas", "name": "Mezclas / Harinas", "zone": "Pasillo C", "area_m2": 7.5},
        {"code": "C05", "svg_id": "pastas-salsas", "name": "Pastas / Salsas", "zone": "Pasillo C", "area_m2": 7.0},
        {"code": "C06", "svg_id": "aceites-sopas", "name": "Aceites / Mantequilla / Sopas y Cremas", "zone": "Pasillo C", "area_m2": 9.5},
        {"code": "C07", "svg_id": "cereales", "name": "Cereales / Leche Líquida / Pan Dulce", "zone": "Pasillo C", "area_m2": 8.0},
        {"code": "C08", "svg_id": "panaderia-sal", "name": "Panadería / Sal", "zone": "Panadería", "area_m2": 12.0},
        # Zona Promocional
        {"code": "PROMO", "svg_id": "zona-promocional", "name": "Zona Promocional", "zone": "Promocional", "area_m2": 25.0},
        # Row D - Lácteos / Refrigerados
        {"code": "D01", "svg_id": "leche-huevos", "name": "Leche Líquida / Huevos / Condimentos", "zone": "Refrigerados", "area_m2": 22.0},
        # Row D - Cuidado Personal
        {"code": "D02", "svg_id": "cuid-facial-des", "name": "CUD Facial / Desodorantes", "zone": "Pasillo D", "area_m2": 13.0},
        {"code": "D03", "svg_id": "jab-cuid-oral", "name": "JAB Corp / Cuidado Oral / Capilar", "zone": "Pasillo D", "area_m2": 13.0},
        # Row D - Dulces
        {"code": "D04", "svg_id": "gelatinas-aromaticas", "name": "Gelatinas / Aromáticas / Modificadores", "zone": "Pasillo D", "area_m2": 9.0},
        {"code": "D05", "svg_id": "cafes-choco", "name": "Cafés / Chocomesa", "zone": "Pasillo D", "area_m2": 12.0},
        # Row E - Limpieza
        {"code": "E01", "svg_id": "limpiadores-insect", "name": "Limpiadores / Iluminación / Insecticidas", "zone": "Pasillo E", "area_m2": 14.0},
        {"code": "E02", "svg_id": "detergente-polvo", "name": "Detergente Polvo / Limpia Pisos / Lavaloza", "zone": "Pasillo E", "area_m2": 15.0},
        # Row E - Galletería
        {"code": "E03", "svg_id": "galletas", "name": "Galletas", "zone": "Pasillo E", "area_m2": 10.0},
        {"code": "E04", "svg_id": "reposteria", "name": "Repostería", "zone": "Pasillo E", "area_m2": 13.0},
        # Row F
        {"code": "F01", "svg_id": "enlatados-conservas", "name": "Encurtidos / Enlatados", "zone": "Pasillo F", "area_m2": 14.0},
        {"code": "F02", "svg_id": "leche-polvo-bebe", "name": "Leche Polvo / Alimento Bebé / Avenas", "zone": "Pasillo F", "area_m2": 11.5},
        {"code": "F03", "svg_id": "desechables-snack", "name": "Desechables / Snack", "zone": "Pasillo F", "area_m2": 10.5},
        {"code": "F04", "svg_id": "ref-cosmeticos", "name": "REF / Res / Cosméticos", "zone": "Pasillo F", "area_m2": 10.0},
        # Bottom strip
        {"code": "G01", "svg_id": "jabon-blanq", "name": "Bondi / Blanqueadores / Suavizantes / Jabón en Barra", "zone": "Pasillo G", "area_m2": 18.0},
        # Especialidades
        {"code": "SP1", "svg_id": "cantera", "name": "Cantera / En Guaje", "zone": "Especialidades", "area_m2": 8.0},
        {"code": "SP2", "svg_id": "vivero", "name": "Vivero", "zone": "Especialidades", "area_m2": 6.0},
        {"code": "SP3", "svg_id": "decoraciones", "name": "Decoraciones", "zone": "Especialidades", "area_m2": 7.0},
        {"code": "SP4", "svg_id": "zona-azul", "name": "Pasillo Final / Zona Azul", "zone": "Especialidades", "area_m2": 40.0},
        # Refrigeradores derecha
        {"code": "REF1", "svg_id": "ref-col-a", "name": "Refrigerador Columna A", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF2", "svg_id": "ref-col-b", "name": "Refrigerador Columna B", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF3", "svg_id": "ref-col-c", "name": "Refrigerador Columna C", "zone": "Refrigeradores", "area_m2": 8.0},
        {"code": "REF4", "svg_id": "ref-col-d", "name": "Refrigerador Columna D", "zone": "Refrigeradores", "area_m2": 8.0},
    ]
    for s in spaces_data:
        db.add(Space(**s, status=SpaceStatus.free))
    db.commit()


# ─── Lease maintenance loop ───────────────────────────────────────────────────

REMINDER_INTERVAL_SECONDS = 12 * 60 * 60  # every 12 hours

# Corte cooperativo del hilo de mantenimiento. `Task.cancel()` cancela la TASK
# de asyncio pero NO el hilo de SO que `to_thread` ya lanzó: sin esta señal, el
# hilo quedaba huérfano al apagar la app, seguía recorriendo clientes contra
# bases que el teardown de los tests ya había borrado ("database is locked"),
# y —como los hilos del executor por defecto no son daemon— mantenía vivo el
# proceso de pytest después del 100 %. El hilo mira la señal entre cliente y
# cliente y se retira solo.
_stop_mantenimiento = threading.Event()


def _deshacer(db) -> None:
    """Rollback que no puede lanzar: se llama ya dentro de un `except`."""
    try:
        db.rollback()
    except Exception:
        pass


def _run_lease_maintenance():
    """Vence contratos, manda recordatorios, purga la bitácora y borra las fotos
    de los contratos terminados (corre en un hilo aparte).

    Recorre **todos los clientes**. Cada supermercado tiene su propia base, sus
    propios contratos y sus propios destinatarios de correo, así que el
    mantenimiento se hace una vez por cada uno. Si uno falla, los demás siguen:
    un problema en la base de un cliente no puede dejar sin recordatorios a los
    otros.

    Dos bloques por cliente, cada uno con su try: un correo caído no frena la
    limpieza de las fotos, y una limpieza que falla no deja sin recordatorios.
    La limpieza va DESPUÉS de los vencimientos, sobre la base ya al día (igual
    decide por fechas, no por `is_active`), y con `LIMPIAR_FOTOS_VENCIDAS`
    apagado sólo ensaya: ver `services/fotos_vencidas.py`.

    Después del recorrido, dos tareas de la plataforma, una vez por corrida y
    cada una con su try: el cierre del mes de la serie de tendencia y la
    escalera de cobranza (`COBRANZA_AUTOMATICA`, que apagado también ensaya).
    """
    from app.clientes import esta_degradado, listar, reintentar_degradados, sesion_de
    from app.routers.spaces import expire_leases
    from app.services import chequeos_de_despliegue, cola_de_correos, fotos_vencidas, tamano_de_base
    from app.services.bitacora import purgar
    from app.services.papelera import purgar as purgar_papelera
    from app.services.reminders import check_expiring_leases

    resumen = {"clientes": 0, "con_falla": 0, "correos_enviados": 0, "correos_fallidos": 0,
               "correos_pendientes": 0, "recuperados": [], "codigos_pc": 0}

    # Los que no arrancaron (P1-6): se prueba otra vez antes del recorrido.
    try:
        resumen["recuperados"] = reintentar_degradados()
        for slug in resumen["recuperados"]:
            logger.warning("La base del cliente %s volvió: deja de estar degradado", slug)
    except Exception:
        logger.exception("El reintento de los clientes degradados falló")

    for cliente in listar():
        if _stop_mantenimiento.is_set():
            return resumen
        if esta_degradado(cliente.slug):
            resumen["con_falla"] += 1
            continue
        resumen["clientes"] += 1
        db = None
        try:
            # Adentro del try: un cliente cuya base ni abre no corta el recorrido.
            db = sesion_de(cliente)
            try:
                expire_leases(db)
                check_expiring_leases(db)
                # La bitácora no puede crecer para siempre en una base de plan
                # gratuito, y guardar más de lo necesario es su propio riesgo.
                purgar(db)
                # La papelera de sedes: pasados 30 días, lo borrado queda borrado.
                purgar_papelera(db)
            except Exception:
                logger.exception("Mantenimiento falló para el cliente %s", cliente.slug)
                resumen["con_falla"] += 1
                _deshacer(db)
            if _stop_mantenimiento.is_set():
                return resumen
            # Los correos que no salieron (P1-4): reintento con espera creciente
            # y purga de lo viejo. En su try: un proveedor de correo caído no
            # frena la limpieza de abajo.
            try:
                hecho = cola_de_correos.despachar_pendientes(db)
                resumen["correos_enviados"] += hecho["enviados"]
                resumen["correos_fallidos"] += hecho["fallidos"]
                resumen["correos_pendientes"] += cola_de_correos.pendientes(db)
                cola_de_correos.purgar_viejos(db)
            except Exception:
                logger.exception("La cola de correos falló para el cliente %s", cliente.slug)
                _deshacer(db)
            # Lo que antes se corría a mano antes de desplegar (P2-8). Sólo lee.
            try:
                resumen["codigos_pc"] += chequeos_de_despliegue.codigos_pc(db, cliente.slug)
            except Exception:
                logger.exception("El chequeo de códigos …-PC falló para el cliente %s", cliente.slug)
                _deshacer(db)
            try:
                plan = fotos_vencidas.limpiar_fotos_vencidas(db)
                # WARNING y no INFO, y SIEMPRE —también «0 fotos»—. Hasta la
                # auditoría P1-3 la app no configuraba el logging y un INFO no
                # salía nunca en el log de Render; ahora sí sale, pero ésta es la
                # línea que se lee antes de prender el interruptor y tiene que
                # verse aunque se suba `LOG_LEVEL`. Y si sólo saliera cuando hay
                # algo, que falte se leería como «no hay nada que borrar».
                logger.warning("Fotos vencidas, cliente %s: %s", cliente.slug, plan.resumen())
            except Exception:
                logger.exception("La limpieza de fotos vencidas falló para el cliente %s", cliente.slug)
                _deshacer(db)
        except Exception:
            logger.exception("Mantenimiento falló para el cliente %s", cliente.slug)
            resumen["con_falla"] += 1
        finally:
            if db is not None:
                db.close()

    # El tamaño de la instancia contra su cuota (P2-6): una vez por corrida,
    # porque la cuota es de TODAS las bases juntas.
    if _stop_mantenimiento.is_set():
        return resumen
    medida = tamano_de_base.revisar()
    if medida:
        resumen["base_uso"] = medida.get("uso")

    # Cierre automático del mes (Fase 5): snapshotea el MES YA CERRADO si le
    # falta la fila a algún cliente, para que la serie de tendencia no dependa de
    # que alguien haya abierto la consola ese mes. Es una tarea de la PLATAFORMA
    # y no de cada supermercado: se hace una sola vez por corrida. Va DESPUÉS del
    # recorrido y no antes: cuando falta una fila recorre todas las bases por
    # `calcular()`, y hacer eso primero retrasaba vencimientos y recordatorios
    # varios segundos en cada arranque (y volvía intermitentes los tests de
    # recordatorios, que comparten este hilo). En su propio try/except: una falla
    # del histórico no puede dejar sin nada al resto del ciclo. Sólo LEE las
    # bases de cliente; lo que escribe va al registro.
    if _stop_mantenimiento.is_set():
        return resumen
    from app.plataforma_tendencia import cerrar_mes_anterior
    try:
        cerrar_mes_anterior()
    except Exception:
        logger.exception("El cierre mensual de la serie de tendencia falló")

    # La escalera de cobranza (C2): sólo las suscripciones en modo automático de
    # clientes activos —Galerías y todo cliente sin suscripción, nunca—, sólo
    # hasta sólo lectura —suspender lo decide una persona— y sin pisar un estado
    # que puso una persona. Como el cierre del mes, es de la PLATAFORMA y no de
    # cada supermercado: una vez por corrida, sólo sobre el registro, en su
    # propio try. Con `COBRANZA_AUTOMATICA` apagado —el valor por defecto— sólo
    # ENSAYA: ni un estado ni un correo. Y deja SIEMPRE una línea WARNING de
    # resumen, también con «0 cambios»: un INFO no llega al log de Render, y una
    # línea que faltara se leería como «nada que hacer». Ver
    # `services/cobranza_automatica.py`.
    if _stop_mantenimiento.is_set():
        return resumen
    from app.services import cobranza_automatica
    try:
        plan = cobranza_automatica.correr(parar=_stop_mantenimiento.is_set)
        logger.warning("%s", plan.resumen())
    except Exception:
        logger.exception("La cobranza automática falló")
    return resumen


#: Cómo terminó la última vuelta que corrió de verdad (la consola la muestra).
ultimo_mantenimiento: dict | None = None


def correr_mantenimiento(origen: str) -> dict:
    """Una vuelta de mantenimiento con el candado de líder (P1-5).

    La piden el hilo de fondo (al arrancar y cada 12 h) y el cron de GitHub
    (`POST /api/interno/mantenimiento`). Si otra vuelta está corriendo —en esta
    instancia o en otra—, ésta no hace nada y lo dice: dos vueltas a la vez
    mandarían dos veces el mismo recordatorio.
    """
    global ultimo_mantenimiento
    import time
    from datetime import datetime, timezone

    from app.services.lider import ser_lider

    with ser_lider("mantenimiento") as soy_lider:
        if not soy_lider:
            logger.warning("Mantenimiento (%s): ya hay otra vuelta corriendo; ésta no hace nada", origen)
            return {"corrio": False, "motivo": "ya_corriendo"}
        inicio = time.monotonic()
        resumen = _run_lease_maintenance() or {}
        segundos = round(time.monotonic() - inicio, 1)
        ultimo_mantenimiento = {
            "origen": origen,
            "terminado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "segundos": segundos,
            **resumen,
        }
        # WARNING y no INFO: es la línea que dice que el cron anduvo, y tiene
        # que verse aunque alguien suba el nivel del log.
        logger.warning("Mantenimiento (%s) terminado en %.1f s: %s", origen, segundos, resumen)
        return {"corrio": True, **ultimo_mantenimiento}


# La vuelta de mantenimiento que está corriendo AHORA en el hilo de fondo, para
# que el apagado pueda esperarla. Cancelar la tarea asyncio corta el `await`,
# no el hilo: sin esto, el hilo seguía vivo después del shutdown y —en los
# tests, que levantan y bajan la app cientos de veces— terminaba escribiendo en
# la base del test SIGUIENTE (mismo proceso, `DATABASE_URL` ya cambiado).
_mantenimiento_en_vuelo: "asyncio.Future | None" = None


async def _lease_maintenance_loop():
    """Run maintenance at startup and then every 12 hours. Never dies on errors."""
    global _mantenimiento_en_vuelo
    loop = asyncio.get_running_loop()
    while True:
        try:
            # Con el candado de líder (P1-5): si el cron de GitHub está corriendo
            # una vuelta en este momento, ésta no hace nada.
            _mantenimiento_en_vuelo = loop.run_in_executor(None, correr_mantenimiento, "hilo")
            # `shield`: la cancelación de esta tarea no toca al hilo (no se puede
            # matar un hilo); quien lo espera hasta el final es el lifespan.
            await asyncio.shield(_mantenimiento_en_vuelo)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en el ciclo de mantenimiento de contratos")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


# Los correos que no salieron no esperan las 12 horas de la vuelta grande: cada
# tanto, mientras el servicio está despierto, se reintenta lo vencido (P1-4).
INTERVALO_CORREOS_S = 5 * 60


def _despachar_correos() -> None:
    from app.clientes import esta_degradado, listar, sesion_de
    from app.services import cola_de_correos
    from app.services.lider import ser_lider

    with ser_lider("correos") as soy_lider:
        if not soy_lider:
            return
        for cliente in listar():
            if _stop_mantenimiento.is_set():
                return
            if esta_degradado(cliente.slug):
                continue
            db = None
            try:
                db = sesion_de(cliente)
                cola_de_correos.despachar_pendientes(db)
            except Exception:
                logger.exception("La cola de correos falló para el cliente %s", cliente.slug)
            finally:
                if db is not None:
                    db.close()


async def _bucle_de_correos():
    loop = asyncio.get_running_loop()
    while True:
        await asyncio.sleep(INTERVALO_CORREOS_S)
        try:
            await asyncio.shield(loop.run_in_executor(None, _despachar_correos))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en el ciclo de la cola de correos")


# ─── Lifespan ─────────────────────────────────────────────────────────────────

def _preparar_bases() -> None:
    """El registro y cada cliente activo, con sus tablas y su esquema al día.

    · **El registro primero, y sin red**: es donde vive la lista de clientes; si
      su base no responde, no hay nada que servir y el arranque falla (Render
      deja la versión anterior atendiendo).
    · **Cada cliente en su propio try** (P1-6): uno con la base caída queda
      DEGRADADO —sus pedidos reciben 503 y el mantenimiento lo reintenta— y los
      demás arrancan. Antes, uno solo dejaba afuera a todos.
    · Todo bajo el candado de migración (P1-8): con dos instancias arrancando a
      la vez, una migra y la otra espera.
    """
    from app.clientes import (
        listar, marcar_degradado, preparar_esquema, registrar_el_de_siempre, sesion_de,
    )
    from app.database import SQLALCHEMY_DATABASE_URL
    from app.migraciones import candado_de_migracion, preparar_base

    with candado_de_migracion():
        # La base por defecto primero: es donde vive la lista de clientes, así
        # que tiene que tener sus tablas antes de poder preguntarle quiénes son.
        preparar_base(SQLALCHEMY_DATABASE_URL)
        por_defecto = registrar_el_de_siempre()

        for cliente in listar():
            try:
                preparar_esquema(cliente)
                db = sesion_de(cliente)
                try:
                    # Los pasillos de ejemplo se siembran SÓLO en la base de
                    # siempre. Darle "Licores 24H" y "Arroz" a un supermercado
                    # nuevo sería peor que dejarlo vacío: parece que el sistema
                    # ya sabe algo de su tienda cuando no sabe nada.
                    if cliente.slug == por_defecto.slug and db.query(Space).count() == 0:
                        seed_spaces(db)
                finally:
                    db.close()
            except Exception as e:
                # El texto del driver va al log (trae servidor y usuario), no a
                # la respuesta: el pedido ve `CLIENTE_DEGRADADO`.
                logger.exception("La base del cliente %s no se pudo preparar: queda degradado", cliente.slug)
                marcar_degradado(cliente.slug, f"{type(e).__name__}: {e}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.observabilidad import configurar_logging, configurar_sentry

    configurar_logging()
    configurar_sentry()
    _preparar_bases()
    # Background task: lease expiry + email reminders (runs immediately, then every 12 h)
    _stop_mantenimiento.clear()  # los tests abren y cierran la app muchas veces
    maintenance_task = asyncio.create_task(_lease_maintenance_loop())
    correos_task = asyncio.create_task(_bucle_de_correos())
    yield
    _stop_mantenimiento.set()  # el hilo en vuelo se retira en el próximo cliente
    maintenance_task.cancel()  # y esto corta el sleep de 12 horas
    correos_task.cancel()
    for tarea in (maintenance_task, correos_task):
        try:
            await tarea
        except asyncio.CancelledError:
            pass
    # Y se espera al hilo hasta que de verdad termine: la app no está apagada
    # mientras un hilo suyo siga leyendo bases. Con tope, para que un cliente
    # con la base colgada no deje al proceso sin poder salir.
    en_vuelo = _mantenimiento_en_vuelo
    if en_vuelo is not None and not en_vuelo.done():
        try:
            await asyncio.wait_for(asyncio.shield(en_vuelo), timeout=30)
        except asyncio.TimeoutError:
            logger.warning("El mantenimiento de fondo no terminó en 30 s; se lo abandona")
        except Exception:
            pass  # su error ya quedó en el log del ciclo


# ─── App ──────────────────────────────────────────────────────────────────────

# /docs, /redoc y /openapi.json sólo en desarrollo (auditoría pre-lanzamiento,
# P3-1): en producción el mapa entero de la API no tiene por qué ser público.
_DOCS = os.getenv("ENV", os.getenv("APP_ENV", "")).strip().lower() in ("dev", "test", "desarrollo")
app = FastAPI(
    title="RECABRA API",
    lifespan=lifespan,
    docs_url="/docs" if _DOCS else None,
    redoc_url="/redoc" if _DOCS else None,
    openapi_url="/openapi.json" if _DOCS else None,
)

# CORS: set ALLOWED_ORIGINS env var in production (comma-separated).
# Falls back to localhost dev ports so the app works out of the box.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    # `allow_headers` es lo que el navegador puede MANDAR; para leer una
    # cabecera de la respuesta hace falta declararla acá. Hoy el SPA lo sirve
    # esta misma app (y en dev lo proxea Vite), así que es mismo origen y esto
    # no haría falta — pero el día que el front se sirva de otro dominio, sin
    # esta línea el interceptor vería el 402 y no el motivo, y el corte de
    # servicio volvería a leerse como una falla de red.
    expose_headers=["X-Estado-Cuenta"],
)

# Tope de tamaño del cuerpo del pedido (hallazgo hardening-1c). Va acá, entre
# los middlewares, porque tiene que correr ANTES de cualquier autenticación:
# hasta ahora `POST /api/auth/login` con 5 MB de "contraseña" se parseaba
# entero para terminar contestando 401, y para eso no hace falta cuenta.
# `add_middleware` apila del último al primero, así que este queda por DENTRO
# de `cabeceras_de_seguridad` (registrado más abajo) y su 413 sale con CSP y
# el resto de las cabeceras, como cualquier otra respuesta.
app.add_middleware(LimiteDeCuerpo)

# Compresión (P2-5): el sondeo de cada pestaña y los planos son JSON que se
# achican diez veces. Desde 1 KB: lo más chico no vale la cuenta. Va por DENTRO
# de las cabeceras de seguridad (registradas más abajo), que siguen saliendo en
# toda respuesta. Una respuesta que ya viene comprimida (`Content-Encoding`) no
# se toca, ni las fotos ni el ZIP de la copia (la lista de Starlette). Nivel 6:
# casi lo mismo que el 9 por mucha menos CPU, con un solo worker.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

# ─── Cabeceras de seguridad ──────────────────────────────────────────────────
#
# La misma aplicación sirve la API y el frontend, así que estas cabeceras cubren
# las dos cosas. La política de contenido está escrita contra lo que la app
# realmente usa, medido archivo por archivo (Fase 3, `features/compliance/`) y
# no un origen más:
#
#   style-src  https://fonts.googleapis.com  — frontend/index.html:15, <link
#              rel="stylesheet"> de Geist/Archivo Narrow.
#   font-src   https://fonts.gstatic.com      — los .woff2 que baja ese CSS.
#   connect-src https://identitytoolkit.googleapis.com
#               https://securetoken.googleapis.com
#              — frontend/src/api/firebase.ts: signInWithPopup,
#              signInWithEmailAndPassword, createUserWithEmailAndPassword,
#              sendPasswordResetEmail y el refresh de ID token, TODOS vía el
#              SDK de Firebase Auth (`@firebase/auth`), pegan a estos dos
#              hosts. `grep -n "identitytoolkit\|securetoken"
#              node_modules/@firebase/auth/dist/esm/index-*.js` los confirma
#              como los ÚNICOS hosts de red que arma el SDK (apiHost /
#              tokenApiHost, ver esa misma búsqueda). El resto de la app
#              (axios en frontend/src/api/client.ts) sólo pega a `/api`,
#              mismo origen — cubierto por 'self'.
#   script-src https://apis.google.com
#              — SOLO por signInWithPopup: `Login.tsx` usa el popup de
#              Google (no signInWithRedirect), y el propio SDK, antes de
#              abrir el popup, instancia `BrowserPopupRedirectResolver`
#              (@firebase/auth/dist/esm/index-*.js:10709 en adelante), que
#              carga `gapi.iframes` bajando
#              `DEFAULT_CDNDOMAIN.gapiScript = "https://apis.google.com/js/api.js"`
#              (misma fuente, línea ~11263) SI `window.gapi.iframes.Iframe`
#              no está ya presente. Sin este origen el popup de Google se
#              rompe (el listener de eventos entre ventanas no arranca);
#              login por correo/contraseña (`signInWithEmailAndPassword`,
#              `createUserWithEmailAndPassword`) no lo necesita, pero
#              Login.tsx ofrece las dos vías en la misma pantalla.
#   frame-src https://*.firebaseapp.com
#              — el mismo `BrowserPopupRedirectResolver._openIframe` abre un
#              iframe OCULTO en `https://${authDomain}/__/auth/iframe`
#              (índice ~10461) para escuchar el resultado del popup vía
#              postMessage — es la pieza que faltaba junto al script de
#              arriba. `authDomain` es `VITE_FIREBASE_AUTH_DOMAIN`
#              (`render.yaml`: `recabra.firebaseapp.com`); el wildcard de
#              subdominio cubre ese valor sin clavar el nombre del proyecto
#              acá adentro, para el día que cambie.
#   img-src / worker-src  data: blob:
#              — Three.js (`@react-three/fiber`) texturiza las caras de los
#              muebles con `blob:` (fotos de proveedor bajadas por
#              `fileUrl()`) y usa Web Workers también por blob; sin cambios,
#              ya alcanzaba.
#
# `unsafe-inline` en los estilos es inevitable hoy: media aplicación pinta con
# `style={{...}}` de React, que son atributos inline. En los SCRIPTS no está, que
# es donde de verdad importa — el único origen externo que se sumó ahí
# (`apis.google.com`) es un script CONCRETO de Google, no un comodín.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://*.firebaseapp.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


@app.middleware("http")
async def cabeceras_de_seguridad(request, call_next):
    respuesta = await call_next(request)
    respuesta.headers["Content-Security-Policy"] = CSP
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    # Redundante con frame-ancestors, para navegadores que no la apliquen.
    respuesta.headers["X-Frame-Options"] = "DENY"
    respuesta.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    respuesta.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS sólo donde hubo TLS de verdad. `request.url.scheme` no alcanza
    # detrás del proxy de Render: la conexión entre el proxy y este proceso
    # es SIEMPRE http, así que Starlette arma la URL con scheme "http" aun
    # cuando el navegador entró por https — con sólo esa condición, HSTS
    # jamás se hubiera mandado en producción. Render (como cualquier proxy
    # estándar) agrega `X-Forwarded-Proto: https` en ese caso; en desarrollo
    # directo (uvicorn sin proxy) el header no existe y gana la condición de
    # siempre.
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        respuesta.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return respuesta


app.include_router(auth_routes.router,   prefix="/api")
# Alta, listado y activación de miembros de un cliente. Todo detrás de
# `require_admin` (ver `routers/usuarios.py`), sobre el cliente del token.
app.include_router(usuarios_routes.router, prefix="/api")
# Derechos del titular (Fase 3): export owner-only y solicitud de supresión.
# Mismo prefix "/clientes" que alta_routes, ambos con rutas literales -- el
# orden entre los dos no cambia ningún resultado, pero va ANTES por el
# contrato de esta fase. Registra `solicitudes_supresion`/`export_attempts` en
# Base.metadata al importar `app/models/supresion.py`.
app.include_router(derechos_routes.router,   prefix="/api")
# La copia de seguridad del dueño (`GET /clientes/mi-copia`). Mismo prefix y
# mismo `require_owner` que los derechos, también ruta literal.
app.include_router(copia_routes.router,      prefix="/api")
# La suscripción vista por la dueña del supermercado (`/clientes/mi-suscripcion`,
# C2): qué debe y cómo pagarlo. Mismo prefix y mismo `require_owner`, rutas
# literales; exenta del corte por estado de cuenta en `clientes.py`.
app.include_router(suscripcion_routes.router, prefix="/api")
# Alta self-service (funda su cliente y nace owner) y panel del operador de
# plataforma (estado de cuenta por cliente). Fase 2 -- las tablas nuevas ya
# quedan registradas en Base.metadata porque `app/plataforma_estado.py` las
# importa a nivel de módulo, y estos dos routers importan ese módulo.
app.include_router(alta_routes.router,       prefix="/api")
app.include_router(plataforma_routes.router, prefix="/api")
app.include_router(spaces.router,        prefix="/api")
app.include_router(suppliers.router,     prefix="/api")
app.include_router(dashboard.router,     prefix="/api")
app.include_router(layout.router,        prefix="/api")
app.include_router(files.router,         prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(mounts.router,        prefix="/api")
# El enlace firmado de la mercaderista. Es lo ÚNICO que alcanza ese token: el
# resto de la app lo rechaza en `require_auth`.
app.include_router(montaje.router,       prefix="/api")
app.include_router(planograms.router,    prefix="/api")
app.include_router(bulk_leases.router,   prefix="/api")
# Las artes de los proveedores: qué producto se le prueba a un mueble en el 3D.
app.include_router(catalogo.router,      prefix="/api")
# Las fichas propias de los muebles de cada supermercado (`cli:<clave>`). Su
# prefijo es `/muebles` porque `/catalogo` ya es el de las artes.
app.include_router(muebles.router,       prefix="/api")
# Participaciones de cara: el porcentaje de una cara vendido a un proveedor y
# sus zonas (`routers/participaciones.py`). Todo de administrador salvo la
# ocupación anónima, que leen Vender, Supervisar y el plano.
app.include_router(participaciones_routes.router, prefix="/api")
# Planogramas con destinos: repartir una cara entre categorías, marca propia o
# promociones y publicarlo por versiones (`routers/planogramas.py`). No es la
# planometría de un contrato (`routers/planograms.py`).
app.include_router(planogramas_routes.router, prefix="/api")
# La guía de montaje de una versión (fase 3): la abre una sesión o el enlace
# firmado de ESA versión, sin contraseña y sin nada comercial.
app.include_router(guia_routes.router, prefix="/api")
# Guardar un contrato de Vender de una vez, todo o nada
# (`routers/vender.py`, `docs/rediseno/vender-api.md`).
app.include_router(vender_routes.router, prefix="/api")
# Los contratos que se cobran por un % de lo vendido: sus cortes. Sólo
# administración.
app.include_router(cobros_routes.router, prefix="/api")
# La reserva de una cara entera o de una parte: listar, confirmar y cancelar
# (`routers/reservas.py`). Sólo administración.
app.include_router(reservas_routes.router, prefix="/api")
# Los avisos de montaje que esperan la planometría o la zona («Falta
# planometría» de Supervisar, `routers/montajes.py`). Sólo administración.
app.include_router(montajes_routes.router, prefix="/api")
# Quién hizo qué. Sólo la lee el administrador.
app.include_router(bitacora_routes.router, prefix="/api")


@app.get("/api/health")
def health():
    """Liveness: el proceso está vivo y atiende. No toca ninguna base, a
    propósito: si la base se cae, reiniciar el proceso no la arregla."""
    return {"status": "ok", "app": "RECABRA API"}


@app.get("/api/health/ready")
def health_ready():
    """Readiness (P1-3): ¿puede atender de verdad? `SELECT 1` contra el
    registro —sin él no se resuelve ningún pedido—. 503 si no contesta. Es el
    `healthCheckPath` de Render: un deploy cuya instancia nueva no llega a la
    base no recibe tráfico, y la anterior sigue atendiendo.

    No dice qué falló ni qué clientes están degradados: es público. Eso está en
    el log y en `GET /api/plataforma/salud` (operadores)."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.clientes import degradados

    try:
        with engine.connect() as cx:
            cx.execute(text("SELECT 1"))
    except Exception:
        logger.warning("Health ready: el registro no responde", exc_info=True)
        return JSONResponse(status_code=503, content={"status": "error", "app": "RECABRA API"})
    return {"status": "ok", "app": "RECABRA API", "clientes_degradados": len(degradados())}


@app.post("/api/interno/mantenimiento", include_in_schema=False)
def mantenimiento_por_cron(request: Request):
    """La vuelta de mantenimiento, pedida desde afuera (P1-5): el cron de
    GitHub (`.github/workflows/mantenimiento.yml`) la llama a hora fija, y de
    paso despierta al servicio si el plan gratuito lo durmió.

    **La puerta:** la cabecera `X-Mantenimiento-Token` tiene que ser igual a
    `MANTENIMIENTO_TOKEN`, comparada en tiempo constante. Sin la variable
    puesta el endpoint no existe (404): no hay token por defecto que adivinar.
    Corre en un hilo del pool (endpoint `def`), con el mismo candado de líder
    que el hilo de fondo: si ya hay una vuelta corriendo, contesta
    `corrio: false` y no hace nada."""
    import hmac

    esperado = os.getenv("MANTENIMIENTO_TOKEN", "").strip()
    if not esperado:
        raise HTTPException(status_code=404, detail="Not Found")
    dado = (request.headers.get("x-mantenimiento-token") or "").strip()
    if not hmac.compare_digest(dado.encode("utf-8"), esperado.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Token de mantenimiento inválido")
    return correr_mantenimiento("cron")


# ─── Static frontend (production only) ───────────────────────────────────────
# In Docker the build copies frontend/dist next to the backend directory.
# Path from /app/backend/app/main.py → /app/frontend/dist
_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"


def archivo_de_la_spa(dist: Path, full_path: str) -> Path:
    """Qué archivo sirve el catch-all del SPA para ``full_path``.

    Sólo un archivo que está DIRECTAMENTE en la raíz de ``dist`` (``robots.txt``,
    ``_redirects``, el favicon…) y se pide por su nombre exacto; todo lo demás es
    ``index.html``. Lo de ``assets/`` lo sirve su propio ``StaticFiles``.

    Antes era ``dist / full_path`` sin más (auditoría pre-lanzamiento, P0-1):
    uvicorn decodifica ``%2e``/``%2F`` antes de rutear y ``Path / "/etc/x"``
    descarta la base, así que ``GET /../../backend/app/main.py`` o
    ``/%2e%2e/…`` devolvían cualquier archivo legible del contenedor —el código,
    y en un despliegue con SQLite la base entera—. Por eso no se arma ninguna
    ruta con lo que llega: se compara el nombre contra la lista de la raíz.
    """
    indice = dist / "index.html"
    if not full_path or "/" in full_path or "\\" in full_path or full_path in (".", ".."):
        return indice
    candidato = dist / full_path
    try:
        raiz = dist.resolve()
        real = candidato.resolve()
    except (OSError, RuntimeError):
        return indice
    if real.parent != raiz or not real.is_file():
        return indice
    return real

def montar_spa(destino: FastAPI, dist: Path) -> None:
    """Sirve el frontend compilado: ``/assets`` y el catch-all del SPA. Aparte
    para que las pruebas lo monten sobre un ``dist`` de mentira sin depender del
    build (antes los casos de ataque se saltaban en el job de backend de CI)."""
    destino.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @destino.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve SPA index.html for any path not matched by an API route."""
        # Don't serve the SPA for unknown /api/* paths — return a proper 404 instead
        # so clients get JSON errors rather than the HTML shell.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(archivo_de_la_spa(dist, full_path))


if _DIST.exists():
    montar_spa(app, _DIST)
