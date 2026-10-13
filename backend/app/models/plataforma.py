"""Plataforma (Fase 2): estado de cuenta por cliente y frenos del alta self-service.

Tablas NUEVAS de la base por defecto (el registro) — ``create_all()`` las crea sin
migración, igual que las de identidad. **FILA AUSENTE en ``estados_cliente`` =
cliente activo**: galerias y todo cliente existente quedan activos sin backfill.
Se leen y escriben SOLO con ``clientes.sesion_registro()``.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, UniqueConstraint

from app.database import Base

# El slug reservado de la fila consolidada de ``snapshot_metricas``. Se define en
# ``app/plataforma_tendencia.py`` —que es quien la escribe y quien la lee— y se
# reexporta acá para que el modelo se pueda entender sin saltar de archivo. Los
# guiones bajos de los extremos lo dejan fuera del alcance de ``SLUG_VALIDO``
# (``clientes.py`` exige empezar por letra): ningún cliente real puede llamarse
# así, ni siquiera por accidente, así que la fila consolidada nunca colisiona.
from app.plataforma_tendencia import CONSOLIDADO_SLUG  # noqa: F401


class EstadoCliente(Base):
    """El interruptor de estado de cuenta, movido a mano por un operador.

    Una fila con estado "activo" también es activo: el PATCH del operador deja la
    fila puesta para conservar quién cambió qué por última vez.

    Desde C1 (2026-10-13) la escribe un solo camino, ``services/cobranza.py``
    (``mover_estado``), que además deja cada cambio en ``cambios_estado_cuenta``.
    ``cambiado_por`` es el correo de la operadora o, cuando el sistema levanta
    el estado tras un pago que ella registró, ``sistema:cobranza``: todo lo que
    empieza con ``sistema:`` lo puso una máquina. Sin cambiar el esquema.
    """

    __tablename__ = "estados_cliente"

    slug = Column(String, primary_key=True)
    estado = Column(String, nullable=False)  # activo | gracia | solo_lectura | suspendido
    motivo = Column(String, nullable=False)
    cambiado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    cambiado_por = Column(String, nullable=False)  # email del operador (cuenta con sub)


class IntentoAlta(Base):
    """Fallos de ``POST /api/clientes/alta`` — tabla propia estilo ``IntentoOauth``.

    Misma forma que ``LoginAttempt``/``IntentoOauth`` a propósito: sirven las mismas
    tres funciones de freno de ``routers/auth.py``, parametrizadas por el modelo.
    Tabla aparte para no contaminar los frenos del login legado ni los de /oauth.
    """

    __tablename__ = "alta_attempts"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)


class Fundacion(Base):
    """Quién fundó qué cliente por el alta self-service — para el tope de 2."""

    __tablename__ = "fundaciones"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cliente_slug", name="uq_fundacion_usuario_cliente"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, nullable=False, index=True)
    cliente_slug = Column(String, nullable=False)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class BitacoraPlataforma(Base):
    """Cada vez que un operador MIRÓ datos de negocio agregados de los clientes.

    Es la contrapartida de la enmienda de la regla dura de la Fase 4: el
    operador puede ver métricas agregadas de todos los clientes, y a cambio
    **cada consulta deja constancia** con su correo y el período que pidió.

    Tres decisiones que la definen:

    · **Vive en el REGISTRO, no en la base de ningún cliente.** El acceso es
      del operador a la plataforma, no de nadie a un supermercado; anotarlo en
      la bitácora de cada cliente (``audit_log``) además obligaría a ESCRIBIR
      en bases que este camino abre en sólo lectura por diseño.
    · **Tabla nueva y no ``audit_log``.** Esa tabla existe adentro de cada
      cliente y sus filas hablan de acciones sobre datos de ese cliente; ésta
      habla de un actor que está por encima de todos. Mezclarlas haría
      imposible contestar «¿qué miró el operador?» sin recorrer N bases.
    · **Se anota el ACCESO, no el cálculo.** Una respuesta servida desde el
      caché de 5 minutos deja línea igual: lo que la bitácora tiene que poder
      reconstruir es quién vio qué y cuándo, y eso pasó aunque los números ya
      estuvieran calculados.

    ``create_all()`` la crea, sin migración — la misma regla de siempre.
    """

    __tablename__ = "bitacora_plataforma"

    id = Column(Integer, primary_key=True, index=True)
    # El correo del operador (cuenta con `sub`; el legado jamás es operador).
    email = Column(String, nullable=False, index=True)
    # Código estable, como en `audit_log`: "metricas" | "tendencia" | "adopcion"
    # | "clientes" | "supresiones" | "reporte" | "detalle" | y, sobre un cliente
    # desde la consola (2026-09-23): "renombre" | "archivo" | "reactivacion" |
    # "borrado" | "traspaso". La cobranza a mano (C1): "cobros" (la cartera,
    # barre a todos) | "suscripcion" | "factura" | "pago_manual" | "anulacion" |
    # "disputa". Toda acción nueva necesita su rama en
    # `plataforma_reporte._accesos_del_cliente`.
    accion = Column(String, nullable=False, default="metricas")
    # El período consultado, "YYYY-MM". Es el QUÉ de la línea: sin él, saber
    # que alguien miró no dice qué miró.
    periodo = Column(String, nullable=False)
    en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


class SnapshotMetricas(Base):
    """La foto mensual de los agregados CRUDOS de un cliente — el histórico (Fase 5).

    El endpoint de métricas de la Fase 4 es una foto del mes que se le pida, y el
    sistema no guardaba historia: no había forma de contestar «¿estamos mejorando
    o empeorando?», que es la primera pregunta de una asesoría recurrente. Esta
    tabla persiste, mes a mes, los SUMANDOS con los que ``plataforma_metricas``
    arma sus números publicados.

    Cuatro decisiones que la definen:

    · **Guarda CRUDOS, nunca públicos.** ``ocupadas``, ``contratos_activos``,
      ``canon_total`` y el conteo por proveedor son los mismos ``crudos`` que
      ``_metricas_de_un_cliente`` ya calcula. La supresión de celda chica (K=3) y
      el saneo del nombre del proveedor se aplican AL LEER la serie, reusando la
      MISMA lógica de ``plataforma_metricas`` — así la regla de privacidad vive
      en un solo lugar y el histórico no queda congelado con una supresión vieja
      (ni con un saneo viejo, el día que el saneo mejore).

    · **Ni un id, ni un correo, ni un nombre de persona.** ``usuarios`` es un
      CONTEO, no una lista: el cálculo en vivo sí maneja ids para poder
      deduplicar a la misma persona con cuenta en dos supermercados, pero eso se
      resuelve en memoria al capturar y a disco baja sólo el número. Un
      histórico es justamente lo que no conviene que acumule identificadores.

    · **Vive en el REGISTRO, tabla nueva, sin migración.** ``create_all()`` la
      crea igual que ``estados_cliente`` y ``bitacora_plataforma``: cero columnas
      agregadas a ninguna tabla existente, y jamás se escribe en la base de un
      cliente —el camino de métricas la abre en sólo lectura por diseño—.

    · **Idempotente por ``(cliente_slug, periodo)``.** El mes en curso converge
      (se sobreescribe en cada vista, hasta que el mes cierra); un mes ya pasado
      se congela la primera vez que se lo captura, porque volver a calcularlo
      hoy daría los contratos vigentes HOY, no los de aquel mes. El ``UNIQUE``
      es lo que hace del upsert una operación segura de repetir.

    La fila con ``cliente_slug == CONSOLIDADO_SLUG`` es el total de la plataforma
    de ese mes: se guarda calculada, y no se suma al vuelo al leer, porque la
    lista de clientes de hace seis meses no es la de hoy — un cliente dado de
    baja seguiría restando de su propio pasado.
    """

    __tablename__ = "snapshot_metricas"
    __table_args__ = (
        UniqueConstraint("cliente_slug", "periodo", name="uq_snapshot_cliente_periodo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    # El slug del cliente, o `CONSOLIDADO_SLUG` para la fila del total.
    cliente_slug = Column(String, nullable=False, index=True)
    # "YYYY-MM" del período capturado.
    periodo = Column(String, nullable=False, index=True)

    # ── Los crudos ────────────────────────────────────────────────────────────
    sedes_con_plano = Column(Integer, nullable=False, default=0)
    espacios_comercializables = Column(Integer, nullable=False, default=0)
    ocupadas = Column(Integer, nullable=False, default=0)
    contratos_activos = Column(Integer, nullable=False, default=0)
    canon_total = Column(Float, nullable=False, default=0.0)
    # Un CONTEO. Por cliente, cuántas cuentas tienen membresía activa; en la fila
    # consolidada, cuántas personas DISTINTAS hay en toda la plataforma (la misma
    # persona con cuenta en dos supermercados es una sola). Ver arriba: los ids
    # se usan para deduplicar al capturar y no se persisten.
    usuarios = Column(Integer, nullable=False, default=0)
    # JSON: {nombre_SANEADO_del_proveedor: nº de contratos activos}, recortado a
    # las 5 entradas top. El top se elige con el nombre original (para no fundir
    # dos proveedores distintos al contar) y el nombre baja ya SANEADO
    # (`sanear_nombre_proveedor`: correos y teléfonos enmascarados) — un nombre
    # de proveedor es texto libre del cliente y suele traer datos de contacto
    # de una persona; en reposo en el registro no puede quedar crudo (auditoría
    # integral, compliance-1). Se guardan sólo 5 porque es lo máximo que el JSON
    # público puede mostrar y el resto sería histórico que nadie va a ver.
    proveedores_json = Column(Text, nullable=False, default="{}")

    # ── Cuántos clientes hay detrás del número (sólo tienen sentido en el
    #    consolidado; por cliente, `clientes_incluidos` es 1 y el otro es NULL) ──
    clientes_incluidos = Column(Integer, nullable=True)
    clientes_con_error = Column(Integer, nullable=True)

    # "vista" (write-through al mirar las métricas) | "cierre" (ciclo de
    # mantenimiento). Es lo que permite distinguir un mes que alguien miró de uno
    # que el sistema cerró solo, sin tener que adivinarlo por la hora.
    origen = Column(String, nullable=False, default="vista")
    capturado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
