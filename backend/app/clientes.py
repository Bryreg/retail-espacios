"""Un supermercado, una base de datos.

**La idea en una frase:** el programa es uno solo, pero cada cliente tiene su
propia base de datos dentro de la misma instancia de Postgres. Una consulta que
corre contra la base de un supermercado no puede ni nombrar la tabla de otro —
la separación la hace el motor, no la disciplina de quien escribe la consulta.

Se eligió así por tres razones, y la tercera es la que decidió:

1. Cuesta lo mismo que mezclar todo con una columna `tenant_id`: la instancia de
   Postgres es la misma y Render permite crear bases adentro de ella.
2. Aísla por construcción y no por política. Con una columna, una sola consulta
   que se olvide del filtro entrega los contratos de un supermercado a otro, sin
   error y sin aviso.
3. **No necesita migraciones.** La regla de este repositorio es que
   `create_all` crea tablas que faltan pero nunca agrega columnas a una que ya
   existe. Meter `tenant_id` en diez tablas con datos vivos adentro pedía
   adoptar Alembic; armar una base nueva y vacía no pide nada.

**Dónde vive la lista de clientes.** En la base por defecto —la que apunta
`DATABASE_URL`, que además es la de GALERIAS—, en la tabla `clientes`.
`create_all` va a crear esa tabla también dentro de la base de cada cliente,
donde no significa nada: **la única copia que vale es la de la base por
defecto**, y por eso se lee siempre con `sesion_registro()` y nunca con la
sesión de un cliente.
"""
import logging
import os
import re
import threading
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException, Request
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import SQLALCHEMY_DATABASE_URL, Base, engine as motor_por_defecto

# El interruptor de estado de cuenta (Fase 2). El import va ARRIBA, a nivel de
# módulo, por dos motivos: acá se aplica el corte en cada pedido, y de paso
# `plataforma_estado` importa `models/plataforma.py`, con lo que las tablas
# nuevas quedan en `Base.metadata` antes de que el arranque llame a
# `create_all()`. No hay ciclo: `models/plataforma.py` sólo importa
# `app.database`, que no importa este archivo a nivel de módulo.
from app import plataforma_estado

log = logging.getLogger("recabra.clientes")

# Cada cliente abre su propio grupo de conexiones, y Postgres en el plan Basic
# admite 100 en total. Con estos números entran unos quince supermercados antes
# de tener que subir de instancia; los valores de fábrica de SQLAlchemy —5 fijas
# más 10 de desborde— se comerían el límite con siete.
POOL_POR_CLIENTE = 2
DESBORDE_POR_CLIENTE = 3

SLUG_VALIDO = re.compile(r"^[a-z][a-z0-9_]{1,30}$")


@dataclass(frozen=True)
class Cliente:
    """Un supermercado que usa el sistema."""
    slug: str        # "olimpica" — va adentro del token y arma el nombre de la base
    nombre: str      # "Olímpica" — lo que se ve en la pantalla de ingreso
    db_name: str     # el nombre real de la base en Postgres
    activo: bool = True


def nombre_de_base(slug: str) -> str:
    return f"recabra_{slug}"


def url_para(db_name: str) -> str:
    """La URL de conexión de esa base, derivada de la que ya está configurada.

    Es la misma instancia: cambia el último componente, que es justo lo que dice
    la documentación de Render para conectarse a una base adicional.

    Se parsea de verdad en vez de cortar por la última barra porque la URL puede
    traer parámetros —`?sslmode=require` es el caso típico en Postgres
    administrado—. Cortando a mano, el nombre de la base se llevaría el
    `?sslmode=require` puesto y la conexión del cliente nuevo saldría sin TLS o
    directamente no saldría.
    """
    base = SQLALCHEMY_DATABASE_URL
    if base.startswith("sqlite"):
        # En desarrollo y en las pruebas, una base es un archivo. Sirve igual
        # para probar el aislamiento, que es lo que importa.
        cabeza, _, cola = base.rpartition("/")
        sufijo = ".db" if cola.endswith(".db") else ""
        return f"{cabeza}/{db_name}{sufijo}"
    partes = urlsplit(base)
    return urlunsplit(partes._replace(path=f"/{db_name}"))


# ─── Motores, uno por cliente ─────────────────────────────────────────────────

_motores: dict[str, Engine] = {}
_fabricas: dict[str, sessionmaker] = {}
_candado = threading.Lock()


def _es_sqlite() -> bool:
    return SQLALCHEMY_DATABASE_URL.startswith("sqlite")


def motor_de(cliente: Cliente) -> Engine:
    """El motor de ese cliente, creado la primera vez que hace falta."""
    with _candado:
        motor = _motores.get(cliente.slug)
        if motor is not None:
            return motor
        if cliente.db_name == _db_por_defecto():
            # El cliente que ya existía usa el motor que ya existía: ni una
            # conexión de más, y ningún cambio de comportamiento el día del
            # despliegue.
            motor = motor_por_defecto
        elif _es_sqlite():
            motor = create_engine(
                url_para(cliente.db_name), connect_args={"check_same_thread": False}
            )
        else:
            motor = create_engine(
                url_para(cliente.db_name),
                pool_size=POOL_POR_CLIENTE,
                max_overflow=DESBORDE_POR_CLIENTE,
                # Render corta las conexiones quietas; sin esto la primera
                # consulta de la mañana falla con "server closed the connection".
                pool_pre_ping=True,
                pool_recycle=1800,
            )
        _motores[cliente.slug] = motor
        _fabricas[cliente.slug] = sessionmaker(autocommit=False, autoflush=False, bind=motor)
        return motor


def sesion_de(cliente: Cliente) -> Session:
    motor_de(cliente)
    return _fabricas[cliente.slug]()


def sesion_registro() -> Session:
    """Una sesión contra la base por defecto, que es donde vive la lista.

    **Nunca** se lee la lista de clientes desde la sesión de un cliente: la
    tabla existe ahí, pero está vacía y no significa nada.
    """
    return sessionmaker(autocommit=False, autoflush=False, bind=motor_por_defecto)()


def olvidar_motores() -> None:
    """Suelta todos los motores. Las pruebas arman una base nueva por prueba."""
    with _candado:
        for slug, motor in _motores.items():
            if motor is not motor_por_defecto:
                motor.dispose()
        _motores.clear()
        _fabricas.clear()


def _db_por_defecto() -> str:
    """El nombre de la base a la que apunta `DATABASE_URL`.

    Mismo cuidado que en `url_para`: sin parsear, un `?sslmode=require` quedaría
    pegado al nombre y el cliente de siempre no se reconocería como el de la
    base por defecto — abriría un motor aparte contra la misma base, gastando
    conexiones de a dos.
    """
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        cola = SQLALCHEMY_DATABASE_URL.rpartition("/")[2]
        return cola[:-3] if cola.endswith(".db") else cola
    return urlsplit(SQLALCHEMY_DATABASE_URL).path.lstrip("/")


# ─── La lista ─────────────────────────────────────────────────────────────────

SLUG_POR_DEFECTO = os.getenv("CLIENTE_POR_DEFECTO", "galerias")
NOMBRE_POR_DEFECTO = os.getenv("CLIENTE_POR_DEFECTO_NOMBRE", "Galerías")


def _fila_a_cliente(fila) -> Cliente:
    return Cliente(slug=fila.slug, nombre=fila.nombre, db_name=fila.db_name, activo=fila.activo)


def listar(solo_activos: bool = True) -> list[Cliente]:
    from app.models.models import ClienteRow

    db = sesion_registro()
    try:
        q = db.query(ClienteRow)
        if solo_activos:
            q = q.filter(ClienteRow.activo == True)  # noqa: E712
        return [_fila_a_cliente(f) for f in q.order_by(ClienteRow.nombre).all()]
    finally:
        db.close()


def buscar(slug: str) -> Cliente | None:
    from app.models.models import ClienteRow

    slug = (slug or "").strip().lower()
    if not slug:
        return None
    db = sesion_registro()
    try:
        fila = db.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if fila is None or not fila.activo:
            return None
        return _fila_a_cliente(fila)
    finally:
        db.close()


def unico() -> Cliente | None:
    """El cliente, cuando hay uno solo.

    Mientras haya uno solo la pantalla de ingreso no pregunta nada y los enlaces
    viejos siguen sirviendo. El selector aparece recién con el segundo.

    **Y ese uno tiene que ser el de siempre** (2026-09-23). Lo que se resuelve
    con esto son credenciales SIN claim `cliente` —tokens y enlaces de montaje
    emitidos antes del multi-tenant, un login legado sin `cliente`—, y todas
    nacieron en la instalación original, la de la base por defecto. Desde que
    la consola puede archivar clientes, «queda uno solo» dejó de querer decir
    «es el de siempre»: con GALERIAS archivado y otro cliente activo, un
    enlace viejo de montaje se habría resuelto contra la base del OTRO, con
    el mismo código de espacio. Ahora no se cae a nadie.
    """
    todos = listar()
    if len(todos) == 1 and es_el_de_siempre(todos[0]):
        return todos[0]
    return None


def es_el_de_siempre(cliente) -> bool:
    """¿Este cliente (o fila de `clientes`) vive en la base por defecto?

    Es el cliente de la instalación original, y su base es además la del
    REGISTRO —usuarios, membresías, la lista de clientes—: se puede archivar,
    pero borrarla sería borrar el sistema entero. Se decide por la base y no por
    el slug porque `registrar_el_de_siempre` sigue a `DATABASE_URL`, no a un
    nombre.
    """
    return cliente.db_name == _db_por_defecto()


def nombre_normalizado(nombre: str) -> str:
    """El nombre para COMPARAR, no para mostrar: sin tildes, sin mayúsculas y
    sin nada que no sea letra o número.

    «Galerías», «GALERIAS» y «galerías.» son el mismo supermercado para quien
    los lee en un selector, y dos clientes con el mismo nombre visible son
    justo la confusión que hace entrar a alguien al supermercado equivocado.
    """
    import unicodedata

    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", nombre or "") if not unicodedata.combining(c)
    )
    return "".join(c for c in sin_tildes.casefold() if c.isalnum())


def nombre_ocupado(reg: Session, nombre: str, excepto: str | None = None):
    """La fila de un cliente ACTIVO que ya se llama así (ver
    `nombre_normalizado`), o `None`.

    Sólo los activos: un cliente archivado no aparece en ningún selector, así
    que su nombre no confunde a nadie — y archivar el viejo es justamente cómo
    se libera un nombre para dárselo a otro.
    """
    from app.models.models import ClienteRow

    buscado = nombre_normalizado(nombre)
    if not buscado:
        return None
    for fila in reg.query(ClienteRow).filter(ClienteRow.activo == True).all():  # noqa: E712
        if fila.slug != excepto and nombre_normalizado(fila.nombre) == buscado:
            return fila
    return None


def registrar_el_de_siempre() -> Cliente:
    """Le pone nombre a la base que ya existe, sin mover un solo dato.

    La instalación que está viva hoy tiene siete tiendas adentro. Pasa a ser el
    cliente por defecto apuntando a la MISMA base: no se copia, no se migra, no
    se toca.

    **Y sigue a `DATABASE_URL` si la base se muda.** El cliente por defecto es,
    por definición, la base a la que apunta esa variable; si mañana el sistema
    cambia de proveedor —de Neon a Render, por decir— el nombre guardado deja de
    coincidir y el arranque lo corrige solo.

    Sin eso, mudar la base rompía todo en la primera petición: la fila seguiría
    diciendo el nombre viejo, `motor_de` no lo reconocería como el de siempre y
    abriría un motor aparte contra una base que en el destino no existe.
    """
    from app.models.models import ClienteRow

    db = sesion_registro()
    try:
        if db.query(ClienteRow).count() > 0:
            fila = db.query(ClienteRow).filter(ClienteRow.slug == SLUG_POR_DEFECTO).first()
            if fila is None:
                fila = db.query(ClienteRow).order_by(ClienteRow.slug).first()
            actual = _db_por_defecto()
            if fila.db_name != actual:
                log.warning(
                    "La base del cliente %s se mudó: %s -> %s. Se actualiza el registro.",
                    fila.slug, fila.db_name, actual,
                )
                fila.db_name = actual
                db.commit()
            return _fila_a_cliente(fila)
        fila = ClienteRow(
            slug=SLUG_POR_DEFECTO, nombre=NOMBRE_POR_DEFECTO,
            db_name=_db_por_defecto(), activo=True,
        )
        db.add(fila)
        db.commit()
        log.info("Cliente por defecto registrado: %s -> base %s", fila.slug, fila.db_name)
        return _fila_a_cliente(fila)
    finally:
        db.close()


# ─── Dar de alta un cliente ───────────────────────────────────────────────────

class ErrorDeAlta(Exception):
    pass


def preparar_esquema(cliente: Cliente) -> None:
    """Las tablas que falten y la configuración por defecto, en la base del
    cliente: lo que hace el arranque con cada cliente ACTIVO.

    Lo usan el alta y la reactivación. Un cliente que estaba archivado cuando
    se desplegó una tabla nueva no la recibió (el arranque sólo recorre los
    activos): reactivado, cada pantalla que la tocaba —el catálogo con
    `supplier_asset_specs`— daba 500 hasta el próximo reinicio. `create_all`
    no toca lo que ya existe.
    """
    from app.auth import ensure_default_config

    Base.metadata.create_all(bind=motor_de(cliente))
    sesion = sesion_de(cliente)
    try:
        # `ensure_default_config` ya llama al arranque de las contraseñas.
        ensure_default_config(sesion)
    finally:
        sesion.close()


def crear_cliente(slug: str, nombre: str) -> Cliente:
    """Crea la base del supermercado nuevo y la deja lista para entrar.

    Arranca **vacía** a propósito. El arranque del sistema siembra los pasillos
    de GALERIAS cuando la base está en cero, y darle esos pasillos a otro
    supermercado sería peor que no darle nada: parece que el sistema ya sabe
    algo de su tienda cuando no sabe nada.
    """
    from app.models.models import ClienteRow

    slug = (slug or "").strip().lower()
    if not SLUG_VALIDO.match(slug):
        raise ErrorDeAlta(
            "El código del cliente va en minúsculas, sin espacios ni tildes, "
            "y arranca con una letra."
        )
    if buscar(slug) is not None:
        raise ErrorDeAlta(f"Ya hay un cliente con el código «{slug}».")

    db_name = nombre_de_base(slug)

    if not _es_sqlite():
        # CREATE DATABASE no corre adentro de una transacción, de ahí el
        # autocommit. Si el usuario de Postgres no tiene permiso para crear
        # bases, falla ACÁ —al dar de alta— y no al arrancar: el sistema sigue
        # andando para todos los demás.
        try:
            with motor_por_defecto.connect().execution_options(
                isolation_level="AUTOCOMMIT"
            ) as cx:
                cx.execute(text(f'CREATE DATABASE "{db_name}"'))
        except Exception as e:  # noqa: BLE001
            if "already exists" not in str(e).lower():
                raise ErrorDeAlta(
                    f"No se pudo crear la base del cliente: {e}. "
                    "Suele ser que el usuario de Postgres no tiene permiso para crear bases."
                ) from e

    cliente = Cliente(slug=slug, nombre=nombre.strip() or slug, db_name=db_name, activo=True)

    # Las tablas, la configuración y la contraseña inicial, adentro de la base
    # nueva. Es exactamente lo que hace el arranque, pero para un cliente.
    preparar_esquema(cliente)

    registro = sesion_registro()
    try:
        registro.add(ClienteRow(
            slug=cliente.slug, nombre=cliente.nombre,
            db_name=cliente.db_name, activo=True,
        ))
        registro.commit()
    finally:
        registro.close()

    log.warning("Cliente nuevo dado de alta: %s (base %s)", cliente.slug, cliente.db_name)
    return cliente


# ─── Borrar un cliente ────────────────────────────────────────────────────────

class ErrorDeBaja(Exception):
    pass


def soltar_motor(slug: str) -> None:
    """Cierra las conexiones de ese cliente y olvida su motor.

    Postgres no borra una base con alguien conectado, y el grupo de conexiones
    de este proceso deja algunas abiertas aunque nadie esté pidiendo nada.
    """
    with _candado:
        motor = _motores.pop(slug, None)
        _fabricas.pop(slug, None)
    if motor is not None and motor is not motor_por_defecto:
        motor.dispose()


def borrar_base(slug: str, db_name: str) -> None:
    """Borra la base de un supermercado. **No hay vuelta atrás.**

    Tres candados antes del paso irreversible, y ninguno confía en el llamador:

    · la base tiene que llamarse exactamente como la que `crear_cliente` le
      armó a ESE slug (`recabra_<slug>`) — una fila que apuntara a otra base,
      escrita a mano o corrida de lugar, no se lleva puesta una base ajena;
    · nunca la base por defecto: es la del cliente de siempre y también la del
      registro de todos los demás;
    · el slug pasa por `SLUG_VALIDO`, así que el nombre que va entre comillas
      en el `DROP` no puede traer nada más que minúsculas, dígitos y `_`.

    `WITH (FORCE)` (Postgres 13+) corta las conexiones que otro proceso tenga
    abiertas; en un Postgres más viejo se intenta sin él.
    """
    if not SLUG_VALIDO.match(slug or ""):
        raise ErrorDeBaja("El código del cliente no es válido.")
    if db_name != nombre_de_base(slug) or db_name == _db_por_defecto():
        raise ErrorDeBaja(
            "La base de este cliente no es una base propia: no se borra desde acá."
        )

    soltar_motor(slug)

    if _es_sqlite():
        ruta = url_para(db_name)[len("sqlite:///"):]
        if os.path.exists(ruta):
            os.remove(ruta)
        return

    # El texto del driver va al log y no a la respuesta: suele traer el nombre
    # del servidor y del usuario de Postgres.
    no_se_pudo = "No se pudo borrar la base del cliente. El detalle quedó en el log del servidor."
    with motor_por_defecto.connect().execution_options(isolation_level="AUTOCOMMIT") as cx:
        try:
            cx.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
        except Exception as e:  # noqa: BLE001
            if "syntax" not in str(e).lower():
                log.exception("DROP DATABASE %s falló", db_name)
                raise ErrorDeBaja(no_se_pudo) from e
            try:
                cx.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
            except Exception as e2:  # noqa: BLE001
                log.exception("DROP DATABASE %s (sin FORCE) falló", db_name)
                raise ErrorDeBaja(no_se_pudo) from e2
    log.warning("Base del cliente %s borrada: %s", slug, db_name)


# ─── A qué base se conecta este pedido ────────────────────────────────────────

def _credencial(request: Request) -> str | None:
    """El token del pedido, venga por cabecera o por `?token=`.

    Por query también, porque la foto de montaje y la planometría se abren en un
    `<img>` o un `<iframe>`, que no mandan cabeceras.
    """
    cabecera = request.headers.get("authorization") or ""
    if cabecera.lower().startswith("bearer "):
        return cabecera[7:].strip() or None
    return (request.query_params.get("token") or "").strip() or None


# ─── El interruptor de estado de cuenta ───────────────────────────────────────

CUENTA_SOLO_LECTURA = "Cuenta en solo lectura por pago pendiente."
CUENTA_SUSPENDIDA = "La cuenta de este cliente está suspendida."

# La cabecera que le dice al navegador POR QUÉ es este 402.
#
# El corte del servidor ya funcionaba; lo que faltaba era que la pantalla se
# enterara. `aviso_cuenta` viaja UNA sola vez, en la respuesta del login, y se
# guarda en el store — así que una cuenta suspendida MIENTRAS alguien ya está
# adentro seguía viéndose entera: cada pedido daba 402, pero el interceptor de
# `api/client.ts` sólo miraba el 401, y la app quedaba dibujada con lo que ya
# tenía cargado. Reproducido por la pantalla real: barra de navegación
# completa, pestañas, botones — todo, con un chip de "Sin conexión" como único
# síntoma, que se lee como un problema de red y no como un corte de servicio.
#
# El estado va en una CABECERA y no adentro del `detail` porque el `detail` es
# el texto que la pantalla le muestra a la persona: meterle un código lo
# volvería un formato que alguien tiene que parsear, y todo lo que hoy lo
# muestra tal cual tendría que aprender a desarmarlo. La cabecera es el canal
# de la máquina; el `detail`, el de la persona. Los dos estados que cortan
# viajan distinto a propósito: `suspendido` reemplaza la app entera y
# `solo_lectura` sólo pone el banner, así que un 402 pelado no alcanza para
# saber cuál de los dos dibujar.
CABECERA_ESTADO_CUENTA = "X-Estado-Cuenta"

# Un pedido que sólo lee no mueve el negocio de nadie: en `solo_lectura` pasa.
_METODOS_DE_LECTURA = frozenset({"GET", "HEAD", "OPTIONS"})

# Spec, decisión 3: en `solo_lectura` el owner tiene que poder seguir entrando y
# administrando a su gente —justamente para poder pagar—, así que el login y la
# gestión de usuarios quedan exentos aunque muten.
_EXENTOS_EN_SOLO_LECTURA = ("/api/auth", "/api/usuarios")
_EXENTOS_POR_HABEAS_DATA = (
    "/api/clientes/mi-export",
    "/api/clientes/solicitar-supresion",
    "/api/auth/aceptar-politica",
    # Fase 7, Parte B: el reporte de transparencia es tan derecho del titular
    # como el export -- un cliente suspendido tiene que poder seguir auditando
    # qué le tomó la plataforma.
    "/api/clientes/mi-reporte-plataforma",
)

# Ponerse al día (C2, cobranza). Una cuenta en sólo lectura o suspendida tiene
# que poder ver QUÉ debe y cómo pagarlo, y su gente tiene que poder enterarse de
# que ya se pagó sin volver a entrar:
#   · `/api/clientes/mi-suscripcion` (y `/facturacion`): lo que debe, cómo
#     transferir y sus datos de facturación. Sólo la dueña: `require_owner`.
#   · `/api/auth/estado-cuenta`: el estado de cuenta en vivo, para cualquier
#     rol; el motivo, sólo para la dueña. Es lo que consultan `BloqueoCuenta` y
#     la franja cada pocos minutos.
# Nada de negocio: ni planos, ni contratos, ni proveedores.
_EXENTOS_PARA_PONERSE_AL_DIA = (
    "/api/clientes/mi-suscripcion",
    "/api/auth/estado-cuenta",
)

# El panel del operador opera sobre el REGISTRO, no sobre datos de negocio de
# nadie. Si el estado lo cortara, un operador cuyo propio cliente quedó
# degradado no podría destrabar ninguna cuenta — incluida la suya.
_PREFIJO_PLATAFORMA = "/api/plataforma"


def _path_bajo(path: str, prefijos: tuple[str, ...]) -> bool:
    """¿`path` ES uno de esos prefijos, o cuelga de él, CON frontera de segmento?

    Un `startswith` suelto no distingue `/api/auth` de `/api/authorizaciones`:
    el router que alguien monte mañana con ese nombre heredaría la exención del
    interruptor de cobranza sin que nadie lo decida (hallazgos H-3 e
    ingresos-2). La comparación correcta es «igualdad o prefijo + barra», y
    vive en UN solo lugar para que no se pueda arreglar la mitad de las veces.
    """
    return any(path == p or path.startswith(p + "/") for p in prefijos)


def _es_path_de_plataforma(path: str) -> bool:
    """Con frontera de segmento (hallazgo H-3): ``startswith`` a secas también
    aceptaba ``/api/plataformazo`` — un router futuro con ese prefijo heredaría
    la resolución de consola sin que nadie lo decidiera."""
    return _path_bajo(path, (_PREFIJO_PLATAFORMA,))


def _aplicar_estado(cliente: Cliente, request: Request) -> Cliente:
    """El corte por estado de cuenta, en el ÚNICO lugar donde se aplica.

    Todo pedido que toca una base de cliente pasa por `cliente_del_pedido`, así
    que acá alcanza: ningún router repite el chequeo y por lo tanto ninguno
    puede olvidárselo.

    **El corte es al pedido HTTP, no a la sesión de base.** Es la diferencia que
    decide el caso raro: `expire_leases()` ESCRIBE adentro de
    `GET /api/spaces/map`. Si el bloqueo viviera en la sesión —una sesión de
    sólo lectura, digamos—, ese GET permitido se caería al intentar vencer un
    contrato. Bloqueando el pedido, un GET que pasó sigue pudiendo escribir todo
    lo que la mecánica interna necesite.

    Un estado desconocido (una fila escrita a mano fuera del PATCH, que valida
    contra `ESTADOS_CUENTA`) se deja pasar a propósito: el interruptor corta
    servicio, y ante una fila que no entiende prefiere no cortarle el suyo a un
    cliente que paga.
    """
    estado, _motivo = plataforma_estado.estado_de(cliente.slug)
    if estado in ("activo", "gracia"):
        return cliente

    path = request.url.path or ""
    if _es_path_de_plataforma(path):
        return cliente

    # Los DERECHOS DEL TITULAR (Ley 1581) no dependen del estado comercial:
    # exportar sus datos, solicitar la supresión y aceptar la política tienen
    # que funcionar aunque la cuenta esté suspendida — cortarlos convertiría
    # el interruptor de cobranza en un bloqueo de habeas data (hallazgo m-3
    # de la verificación de Fase 3). Son owner-only/authenticados por sus
    # propios routers; acá solo se los exime del 402.
    if _path_bajo(path, _EXENTOS_POR_HABEAS_DATA):
        return cliente

    # Saber qué se debe y enterarse de que ya se pagó tampoco: cortarlo dejaría
    # a la dueña sin forma de ponerse al día (C2). Con frontera de segmento,
    # como todas: `/api/clientes/mi-suscripcionX` no se cuela.
    if _path_bajo(path, _EXENTOS_PARA_PONERSE_AL_DIA):
        return cliente

    if estado == "solo_lectura":
        if (request.method or "").upper() in _METODOS_DE_LECTURA:
            return cliente
        if _path_bajo(path, _EXENTOS_EN_SOLO_LECTURA):
            return cliente
        raise HTTPException(
            status_code=402,
            detail=CUENTA_SOLO_LECTURA,
            headers={CABECERA_ESTADO_CUENTA: "solo_lectura"},
        )

    if estado == "suspendido":
        # Todo método, GET incluido. Los datos no se borran; se dejan de servir.
        raise HTTPException(
            status_code=402,
            detail=CUENTA_SUSPENDIDA,
            headers={CABECERA_ESTADO_CUENTA: "suspendido"},
        )

    return cliente


def _cliente_de_la_consola(request: Request) -> Cliente:
    """El "cliente" sintético del token de plataforma. **No es un supermercado.**

    Un operador que entra sin membresías se lleva un token con
    ``cliente == "plataforma"`` (Fase 4). Ese slug no tiene fila en
    ``clientes`` y no puede tenerla —está reservado en el alta—, así que
    `buscar` daría `None` y el token moriría en el primer pedido. Acá se le
    devuelve un cliente armado a mano que apunta a la BASE POR DEFECTO, que es
    la del registro: es la única base que ese token necesita, porque
    ``require_auth`` la usa para comprobar la época y porque los endpoints de
    ``/api/plataforma`` leen el registro.

    **Y sólo resuelve adentro de ``/api/plataforma``.** En cualquier otro path
    esto contesta 401 -- el mismo 401 que un token que nombra un cliente que no
    existe, que es exactamente lo que este token es para el resto del sistema.
    Así el token de la consola no puede abrir la base de negocio de nadie POR
    CONSTRUCCIÓN, y no por acordarse de poner un guard en cada router: aunque
    mañana alguien monte un endpoint nuevo sin pensar en esto, el pedido no
    llega a tener sesión de base.

    Ojo con lo que NO hace: no pasa por `_aplicar_estado`. Daría el mismo
    resultado —`plataforma` no tiene fila de estado, y además `/api/plataforma`
    está exento del interruptor— pero preguntarlo sugeriría que este slug es
    una cuenta que se puede cortar, y no lo es.
    """
    if not _es_path_de_plataforma(request.url.path or ""):
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return Cliente(
        slug=plataforma_estado.SLUG_PLATAFORMA,
        nombre=plataforma_estado.NOMBRE_PLATAFORMA,
        db_name=_db_por_defecto(),
        activo=True,
    )


def cliente_del_pedido(request: Request) -> Cliente:
    """Qué supermercado está pidiendo. **Nunca se deduce de la contraseña.**

    Sale del token, que está firmado, o del único cliente que haya. Un
    parámetro suelto en la URL no sirve: el navegador lo elige, y con eso
    cualquiera se pararía adelante de la base de otro.

    Los DOS caminos que devuelven un cliente pasan por `_aplicar_estado`: el del
    token y el del cliente único. Con uno solo alcanzaría para que una
    instalación de un cliente —la de hoy, sin ir más lejos, donde los enlaces
    viejos entran sin slug en el token— se saltee el interruptor entero.
    """
    from app.auth import cliente_del_token, token_verifica

    raw = _credencial(request)
    if raw:
        slug = cliente_del_token(raw)
        if slug:
            if slug == plataforma_estado.SLUG_PLATAFORMA:
                return _cliente_de_la_consola(request)
            cliente = buscar(slug)
            if cliente is None:
                # El token está bien firmado pero nombra un cliente que ya no
                # existe o quedó inactivo. Se cierra, no se cae a otro.
                raise HTTPException(status_code=401, detail="Token inválido o expirado")
            return _aplicar_estado(cliente, request)
        # Token viejo, de antes de que hubiera más de un cliente.

    solo = unico()
    if solo is not None:
        # Tres situaciones distintas, y el estado de cuenta sólo se aplica en
        # una (hallazgos R-1 e ingresos-1). Con UN solo cliente en la
        # instalación —producción hoy— el 402 es un oráculo: contestarlo antes
        # de que nadie valide la credencial le cuenta a cualquiera si ese
        # supermercado dejó de pagar, que es justo lo que la pantalla de
        # ingreso se cuidó de no construir.
        #
        # 1. SIN credencial: no se aplica nada. `require_auth` contesta su 401
        #    de siempre.
        # 2. Credencial BASURA (texto que no firmamos nosotros, o vencido):
        #    tampoco. Para el sistema es tan anónimo como el caso 1 — sólo que
        #    escribió algo en el header. Mismo 401.
        # 3. Token NUESTRO, válido, pero sin claim `cliente` (emitido antes del
        #    multi-tenant): ahí sí. Es un usuario legítimo de este único
        #    cliente y le corresponde el 402 si la cuenta está degradada.
        if raw is not None and token_verifica(raw):
            return _aplicar_estado(solo, request)
        return solo
    raise HTTPException(status_code=401, detail="No autenticado")


def sesion_para_pedido(request: Request) -> Session:
    return sesion_de(cliente_del_pedido(request))
