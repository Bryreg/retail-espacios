import enum
from datetime import date, datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Enum as SAEnum, Text, LargeBinary
from sqlalchemy.orm import relationship
from app.database import Base


class SpaceStatus(str, enum.Enum):
    free = "free"
    occupied = "occupied"
    reserved = "reserved"
    maintenance = "maintenance"


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    contact_name = Column(String)
    phone = Column(String)
    email = Column(String)
    notes = Column(Text)

    leases = relationship("SpaceLease", back_populates="supplier")


class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    svg_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    zone = Column(String, nullable=False)
    sede = Column(String, nullable=True, index=True)
    area_m2 = Column(Float, nullable=False)
    status = Column(SAEnum(SpaceStatus), default=SpaceStatus.free, nullable=False)
    notes = Column(Text)

    leases = relationship("SpaceLease", back_populates="space")

    @property
    def active_lease(self):
        """The lease RUNNING TODAY, or None.

        ``is_active`` alone is not enough: it stays True from the moment a
        lease is created, so a contract signed in August for December used to
        answer here and the space read as occupied for four months it was
        actually free. The dates are the truth; the flag only says the lease
        was not cancelled.
        """
        today = date.today()
        for lease in self.leases:
            if lease.is_active and lease.start_date <= today <= lease.end_date:
                return lease
        return None

    @property
    def upcoming_lease(self):
        """The next lease already signed but not yet started — earliest first.

        Kept separate from ``active_lease`` so "committed" never gets counted
        as "earning". Callers that need to know the space is not sellable for
        that period must consult both.
        """
        today = date.today()
        future = [
            lease for lease in self.leases
            if lease.is_active and lease.start_date > today
        ]
        return min(future, key=lambda x: x.start_date) if future else None


class SpaceLease(Base):
    __tablename__ = "space_leases"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    marca = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    monthly_rent = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    notes = Column(Text)

    space = relationship("Space", back_populates="leases")
    supplier = relationship("Supplier", back_populates="leases")


class LayoutSnapshot(Base):
    """Persists the full fixture layout for one sede.

    One row per sede — upserted on every save so the table never grows unbounded.
    ``fixtures_json`` stores the UnifiedFixture array serialised as a JSON string.
    """
    __tablename__ = "layout_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    sede = Column(String, unique=True, nullable=False, index=True)
    fixtures_json = Column(Text, nullable=False, default="[]")
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AppConfig(Base):
    """Key/value application configuration (passwords, notification settings).

    Seeded at startup with defaults — see ``app.auth.ensure_default_config``.
    """
    __tablename__ = "app_config"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)


class SpaceFile(Base):
    """Binary attachment (contract PDF / Excel / CSV) linked to a Space.

    Stored in the database because Render's disk is ephemeral.
    """
    __tablename__ = "space_files"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MountConfirmation(Base):
    """Prueba de que el espacio contratado se montó — o de por qué no.

    Tabla NUEVA a propósito. La regla del proyecto prohíbe columnas nuevas en
    tablas existentes porque ``create_all`` no las agrega, pero sí crea tablas
    que no existían; y guardar esto acá evita lo alternativo, que era darle al
    mercaderista permiso de escritura sobre el JSON del layout para marcar un
    par de campos.

    Se guarda una fila por confirmación, no una por espacio: el histórico de
    quién dijo qué y cuándo es justamente lo que sirve cuando el proveedor
    reclama que su exhibición nunca se armó.
    """
    __tablename__ = "mount_confirmations"

    id = Column(Integer, primary_key=True, index=True)
    # Se guarda el CÓDIGO y no un FK a spaces: un espacio solo existe en esa
    # tabla si alguna vez se le guardó un contrato, y el montaje puede
    # confirmarse antes de eso.
    space_code = Column(String, nullable=False, index=True)
    sede = Column(String, nullable=True, index=True)
    # "montado" | "no_montado"
    estado = Column(String, nullable=False)
    # Por qué no se pudo, cuando aplica: el proveedor no entregó material, no
    # llegó producto, se cayó por operación de la tienda.
    motivo = Column(String, nullable=True)
    nota = Column(Text, nullable=True)
    # Foto en space_files. Opcional: un "no montado" no siempre tiene qué
    # fotografiar.
    file_id = Column(Integer, ForeignKey("space_files.id"), nullable=True)
    # Rol que reportó. No hay tabla de usuarios; el nombre lo escribe quien
    # confirma, para que el registro diga algo más que "worker".
    reportado_por = Column(String, nullable=True)
    rol = Column(String, nullable=True)
    # La pone el SERVIDOR al recibir, nunca el dispositivo: el EXIF de un
    # celular se edita y no defiende nada ante un reclamo.
    confirmado_en = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    # Se llena cuando se borra la sede. La fila no se elimina — es la prueba de
    # que algo se montó, y sirve meses después ante un reclamo — pero deja de
    # contar: una sede recreada con el mismo nombre vuelve a usar los mismos
    # códigos, y sin esto heredaría los "montado" de la sede anterior.
    archivado_en = Column(DateTime(timezone=True), nullable=True, index=True)


class ArchivedSpace(Base):
    """A Space whose sede was deleted from the floor plan.

    Deleting a sede drops its layout, but the rows in ``spaces`` and
    ``space_leases`` are commercial history and are not deleted with it. They
    are archived instead, which does three things the plain delete did not:

    · the active lease is closed, so expiry reminder emails stop going out for
      a sede nobody can see any more;
    · the space's unique ``code`` is freed, so a sede recreated under the same
      name starts clean instead of inheriting the previous one's contracts
      through ``find_or_create_space``, which matches on code alone;
    · ``original_code`` keeps the name the space had, so the history stays
      readable.

    This is a new table on purpose. The schema is created with
    ``Base.metadata.create_all()``, which creates missing tables but never adds
    a column to an existing one, so an ``archived`` flag on ``spaces`` would
    silently never appear on the deployed database.
    """
    __tablename__ = "archived_spaces"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, unique=True, index=True)
    sede = Column(String, nullable=False, index=True)
    original_code = Column(String, nullable=False)
    archived_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class NotificationLog(Base):
    """Deduplication log for sent notifications (one row per lease + kind)."""
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LeaseFile(Base):
    """La planometría de UN contrato: cómo debe quedar armada esa exhibición.

    Cuelga del CONTRATO y no del mueble a propósito. La misma punta de góndola
    recibe una planometría distinta cada vez que se alquila —cambia con el
    proveedor y con la temporada—, así que guardarla en el mueble dejaría un
    solo casillero que se sobreescribe: al entrar Nutresa se pierde la de
    Alpina, y con ella la única prueba de qué se acordó armar.

    Tabla nueva y no ``space_files`` con una marca en el nombre, aunque eso ya
    se hizo una vez para las fotos de montaje: ``list_face_images`` toma la
    imagen más reciente de un espacio para pintar el panel del 3D, y una
    planometría ahí adentro volvería a secuestrar las artes del proveedor. Con
    tabla propia eso es imposible por construcción, no por convención de
    nombres.

    ``create_all`` crea tablas que faltan pero nunca agrega columnas a una que
    ya existe, así que esto es de las cosas que sí se pueden hacer sin
    migración.
    """
    __tablename__ = "lease_files"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, index=True)
    # Por ahora sólo "planometria". La columna existe para no necesitar otra
    # tabla el día que el contrato cargue también el PDF firmado.
    kind = Column(String, nullable=False, default="planometria")
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    # Quién la cargó, para que el histórico diga algo más que "admin".
    subido_por = Column(String, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SupplierAsset(Base):
    """El arte de UN producto de un proveedor: la imagen que se le pone al mueble.

    Existe para poder responder en la reunión «¿y cómo se vería mi producto
    acá?» sin ir a buscar un archivo. El arte se carga UNA vez contra el
    proveedor y desde ahí se le prueba a cualquier mueble.

    Antes esto viajaba por ``space_files``: se subía una imagen al espacio y
    ``list_face_images`` tomaba la MÁS RECIENTE para pintar la cara en el 3D.
    Dos problemas de fondo. Uno, el arte quedaba atada al espacio, así que el
    mismo producto había que resubirlo en cada punta que se quisiera mostrar.
    Dos, cualquier imagen que alguien subiera al espacio —el contrato escaneado
    en JPG, una foto del pasillo— se convertía en el producto del mueble; ya
    hubo que reservar el prefijo ``montaje--`` para que la foto de la
    mercaderista dejara de secuestrar la textura, y ese parche sólo tapa un
    caso de los muchos posibles.

    Con tabla propia el arte comercial y los archivos del espacio dejan de
    pisarse por construcción, no por convención de nombres.

    ``create_all`` crea tablas que faltan pero nunca agrega columnas a una que
    ya existe, así que esto es de lo que sí se puede hacer sin migración.
    """
    __tablename__ = "supplier_assets"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    # Cómo se llama el producto para quien lo elige de la lista: "Yogurt Griego
    # 150g". No es la marca —esa es el proveedor— ni el archivo.
    nombre = Column(String, nullable=False)
    # Opcional, para agrupar cuando un proveedor tiene muchos productos.
    categoria = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LeaseCancellation(Base):
    """Cuándo se canceló un contrato — para prorratear el ingreso hasta ahí.

    ``DELETE /spaces/{id}/leases/{id}`` ya hacía un soft-delete
    (``is_active = False``), pero eso borra el CORTE sin decir CUÁNDO pasó.
    Sin esto, un contrato cancelado a mitad de un mes reportaba $0 de ingreso
    para ese mes en vez de lo YA devengado hasta que se canceló — ver
    ``services/ocupacion.py``, que es quien lee esta tabla.

    Tabla NUEVA a propósito: ``Base.metadata.create_all()`` crea tablas que
    faltan pero nunca agrega una columna a ``space_leases``, así que un
    ``cancelled_at`` ahí habría quedado sin efecto en cualquier base ya
    desplegada.

    Un contrato cancelado ANTES de que esta tabla existiera no tiene fila acá
    — eso es una limitación aceptada, no un bug: ``ocupacion.py`` documenta
    cómo se trata ese caso.
    """
    __tablename__ = "lease_cancellations"

    id = Column(Integer, primary_key=True, index=True)
    lease_id = Column(Integer, ForeignKey("space_leases.id"), nullable=False, unique=True, index=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class LoginAttempt(Base):
    """Un intento de entrar que falló, con la IP y la hora.

    El freno a la fuerza bruta vivía en un diccionario en memoria. Se borraba
    entero en cada despliegue y en cada reinicio —y Render reinicia el servicio
    gratuito cuando se queda quieto—, así que bastaba con esperar, o con
    provocar el reinicio, para volver a tener los diez intentos. En la base
    sobrevive a los dos.

    Sólo se anotan los FALLOS: contar también los aciertos castigaba a quien
    entra y sale varias veces en la mañana, que es exactamente lo que hace un
    administrador. Un acierto borra los fallos de esa IP.

    ``create_all`` crea tablas que faltan pero nunca agrega columnas, así que
    una tabla nueva es de lo que sí se puede hacer sin migración.
    """
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)


class AuditEntry(Base):
    """Quién hizo qué, cuándo y desde dónde.

    No había ninguna. Si mañana falta un contrato o cambia un valor, hoy no hay
    forma de saber quién ni cuándo — y un supermercado que maneja contratos lo
    va a pedir, con razón.

    Con contraseñas compartidas el "quién" es un rol, no una persona, así que
    esto no reemplaza a las cuentas de usuario: **es lo que las cuentas van a
    llenar**. Aun así el rol, la IP y la hora ya contestan la mayoría de las
    preguntas que se hacen cuando algo se pierde.

    Se anota **sólo lo que cambia algo o abre una puerta**: contratos,
    documentos, borrados, ingresos y cambios de contraseña. Los listados y las
    consultas no, o el ruido se come lo que importa.

    ``create_all`` crea tablas que faltan pero nunca agrega columnas, así que
    una tabla nueva es de lo que sí se puede hacer sin migración.
    """
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    at = Column(DateTime(timezone=True), nullable=False, index=True)
    # "admin", "worker", "montaje" o "anónimo" en un intento de login fallido.
    rol = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    # Código estable, tipo `contrato.alta`. El texto se arma al mostrarlo: si se
    # guardara la frase, cambiar la redacción reescribiría el pasado.
    accion = Column(String, nullable=False, index=True)
    entidad = Column(String, nullable=True)
    entidad_id = Column(String, nullable=True)
    # Lo mínimo para entender la línea sin ir a buscar: "Alpina · NAVE-PUN-01".
    # Nunca una contraseña, ni el contenido de un archivo.
    detalle = Column(Text, nullable=True)


class ClienteRow(Base):
    """Un supermercado que usa el sistema, y en qué base viven sus datos.

    **Sólo vale la copia que está en la base por defecto.** `create_all` crea
    esta tabla dentro de la base de cada cliente también, donde queda vacía y no
    significa nada — por eso se lee siempre con `clientes.sesion_registro()`,
    que apunta a la base por defecto, y nunca con la sesión del cliente que está
    pidiendo.

    ``create_all`` crea tablas que faltan pero nunca agrega columnas, así que
    una tabla nueva es de lo que sí se puede hacer sin migración — y es la razón
    entera por la que se eligió una base por cliente en vez de un `tenant_id`.
    """
    __tablename__ = "clientes"

    # "olimpica". Va adentro del token, así que cambiarlo cierra las sesiones
    # de ese cliente. Se elige una vez.
    slug = Column(String, primary_key=True)
    nombre = Column(String, nullable=False)
    # El nombre real de la base en Postgres. Se guarda en vez de derivarlo para
    # que el cliente que ya existía pueda seguir apuntando a la base de siempre.
    db_name = Column(String, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    creado = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
