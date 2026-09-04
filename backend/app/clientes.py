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
    """
    todos = listar()
    return todos[0] if len(todos) == 1 else None


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


def crear_cliente(slug: str, nombre: str) -> Cliente:
    """Crea la base del supermercado nuevo y la deja lista para entrar.

    Arranca **vacía** a propósito. El arranque del sistema siembra los pasillos
    de GALERIAS cuando la base está en cero, y darle esos pasillos a otro
    supermercado sería peor que no darle nada: parece que el sistema ya sabe
    algo de su tienda cuando no sabe nada.
    """
    from app.auth import ensure_default_config
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
    motor = motor_de(cliente)
    Base.metadata.create_all(bind=motor)
    sesion = sesion_de(cliente)
    try:
        # `ensure_default_config` ya llama al arranque de las contraseñas.
        ensure_default_config(sesion)
    finally:
        sesion.close()

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
)

# El panel del operador opera sobre el REGISTRO, no sobre datos de negocio de
# nadie. Si el estado lo cortara, un operador cuyo propio cliente quedó
# degradado no podría destrabar ninguna cuenta — incluida la suya.
_PREFIJO_PLATAFORMA = "/api/plataforma"


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
    if path.startswith(_PREFIJO_PLATAFORMA):
        return cliente

    # Los DERECHOS DEL TITULAR (Ley 1581) no dependen del estado comercial:
    # exportar sus datos, solicitar la supresión y aceptar la política tienen
    # que funcionar aunque la cuenta esté suspendida — cortarlos convertiría
    # el interruptor de cobranza en un bloqueo de habeas data (hallazgo m-3
    # de la verificación de Fase 3). Son owner-only/authenticados por sus
    # propios routers; acá solo se los exime del 402.
    if path.startswith(_EXENTOS_POR_HABEAS_DATA):
        return cliente

    if estado == "solo_lectura":
        if (request.method or "").upper() in _METODOS_DE_LECTURA:
            return cliente
        if path.startswith(_EXENTOS_EN_SOLO_LECTURA):
            return cliente
        raise HTTPException(status_code=402, detail=CUENTA_SOLO_LECTURA)

    if estado == "suspendido":
        # Todo método, GET incluido. Los datos no se borran; se dejan de servir.
        raise HTTPException(status_code=402, detail=CUENTA_SUSPENDIDA)

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
    if not (request.url.path or "").startswith(_PREFIJO_PLATAFORMA):
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
    from app.auth import cliente_del_token

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
        if raw is not None:
            return _aplicar_estado(solo, request)
        # Sin credencial NO se aplica el estado (hallazgo R-1): contestar 402
        # antes de que nadie compruebe un token le contaría a un anónimo si el
        # cliente dejó de pagar — el mismo oráculo que la pantalla de ingreso
        # se cuidó de no construir. El require_auth de más adelante contesta
        # su 401 de siempre y el estado se aplica recién con credencial.
        return solo
    raise HTTPException(status_code=401, detail="No autenticado")


def sesion_para_pedido(request: Request) -> Session:
    return sesion_de(cliente_del_pedido(request))
