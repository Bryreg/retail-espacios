import enum
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Enum as SAEnum, Text, LargeBinary
from sqlalchemy.orm import relationship
from app.database import Base
from app.fechas import hoy


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
        today = hoy()
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
        today = hoy()
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


class RenumeracionNombre(Base):
    """Cómo se llamaba un mueble ANTES de una renumeración. Es historia, no un nombre.

    Un mueble tiene **un** nombre y es su ``code``. Esta tabla no es un segundo
    nombre y no puede llegar a serlo: **nada resuelve contra ella**. Ni la
    planilla (``PlanoIndexado.resolver`` mira ``code``), ni el guardarraíl
    (``choques_nuevos`` mira el nombre dibujado y el código), ni la búsqueda del
    servidor. Lo único que hace es contestar una pregunta que el sistema, hasta
    ahora, no podía contestar: *«¿cómo se llamaba este mueble cuando se negoció
    el contrato que tengo en la mano?»*.

    Hace falta porque la renumeración **cambia el nombre de un mueble sin que
    nadie lo teclee**, y del otro lado quedan dos cosas que no se enteran: el
    papel que firmó el proveedor y el cartel de la góndola. Sin este registro,
    la lista «Contratos para revisar uno por uno» se vacía justo el día en que
    se la necesita —el dueño acaba de renombrar cuarenta muebles y la tienda
    todavía dice los nombres viejos—.

    **Por qué una tabla y no un campo más en el JSON del mueble.** Tres razones,
    y cualquiera alcanza:

    · Un segundo campo de nombre adentro del mueble es exactamente la clase de
      error que la fase 13 eliminó. Estando ahí, tarde o temprano algo lo lee
      como nombre. Acá no puede pasar: para usarlo hay que ir a buscarlo a otra
      tabla, y quien lo haga ve el nombre del módulo.
    · **Sobrevive a la segunda renumeración.** Un campo se pisa: renumerar dos
      veces dejaría al mueble recordando un nombre intermedio que nunca estuvo
      en una pared, y el original —el que dice el papel— perdido para siempre.
      Acá cada renumeración agrega una fila y la cadena entera queda legible.
    · Es el rastro de auditoría que esta operación no tenía: quién se llamaba
      cómo, en qué se convirtió y cuándo. La bitácora anota que se renumeró una
      sede; esto anota qué le pasó a cada mueble.

    ``create_all`` crea tablas que faltan pero nunca agrega una columna a una que
    ya existe, así que una tabla nueva es de lo que sí se puede hacer sin
    migración — la misma razón por la que ``archived_spaces`` es una tabla.

    Las tres columnas de nombre dicen tres cosas distintas y las tres hacen
    falta:

    · ``nombre_anterior`` — lo que el plano **dibujaba** (la ``nomenclatura``
      escrita a mano o, si no había, el código). Es lo que leyó quien negoció y
      lo que sigue diciendo el cartel, así que es el que usa la reconciliación.
    · ``codigo_anterior`` — el código completo que tenía (``NAVE-GON-05``), que
      es lo que dicen ``spaces.code`` y una planilla vieja.
    · ``codigo_nuevo`` — en qué se convirtió, para poder contestar «ese código lo
      retiró la renumeración del <fecha>; ahora se llama así».

    Borrar una sede **no** se lleva sus filas: son historia, igual que
    ``archived_spaces.original_code`` y que la bitácora, y borrarlas no arregla
    nada. Tampoco estorban: se busca por sede **y** por ``fixture_id``, y los
    ``id`` de mueble llevan la hora de creación adentro, así que una sede
    recreada con el mismo nombre no hereda el recuerdo de la anterior.
    """
    __tablename__ = "renumeracion_nombres"

    id = Column(Integer, primary_key=True, index=True)
    sede = Column(String, nullable=False, index=True)
    #: La identidad real del mueble a través de la renumeración: el nombre se
    #: mueve, el ``id`` no. Es la llave con la que se reconstruye la cadena.
    fixture_id = Column(String, nullable=False, index=True)
    nombre_anterior = Column(String, nullable=False)
    codigo_anterior = Column(String, nullable=False, default="")
    codigo_nuevo = Column(String, nullable=False, default="")
    aplicado_en = Column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), index=True,
    )


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


class SpaceFace(Base):
    """La imagen DESIGNADA como cara vigente de un espacio (Fase 3, fix H8).

    Reemplaza la heurística vieja ("la imagen más reciente" = la cara) — esa
    heurística no distingue una foto del mueble de un contrato escaneado en
    JPG: si el contrato es la única imagen, o la última subida, la heurística
    lo declaraba cara vigente y ``list_face_images`` lo pintaba como textura
    del 3D para TODOS, y el worker lo bajaba. Acá la designación la hace el
    ADMIN a propósito, en el upload (``uso=cara`` en
    ``POST /spaces/{id}/files``, ver ``routers/files.py``) — nunca se infiere.

    Tabla NUEVA a propósito, mismo patrón que ``MountConfirmation`` y
    ``ArchivedSpace``: ``space_files`` no admite una columna nueva porque
    ``create_all`` crea tablas que faltan pero nunca agrega columnas a una que
    ya existe (regla dura del repo, sin migraciones).

    Una fila por espacio (``space_id`` es la primary key): designar una cara
    nueva REEMPLAZA la anterior in-place — a `list_face_images` y al worker
    sólo les importa la vigente, nunca el historial de cuáles lo fueron.

    Un espacio SIN fila acá no tiene cara vigente para nadie que no sea admin
    — fail closed a propósito: un espacio legado (de antes de este fix) queda
    sin textura en el 3D y sin imagen visible para el worker hasta que un
    admin lo designe de nuevo. Documentado como comportamiento buscado en
    ``docs/ESTADO.md`` y en ``features/compliance/outputs/hardening.md``.
    """
    __tablename__ = "space_faces"

    space_id = Column(Integer, ForeignKey("spaces.id"), primary_key=True)
    file_id = Column(Integer, ForeignKey("space_files.id"), nullable=False)
    designado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


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
    # fotografiar. Y vuelve a NULL cuando la foto se borra —a mano
    # (`routers/files.py::delete_file`) o cinco días después de que termina la
    # cadena de contratos sin renovación (`services/fotos_vencidas.py`)—: el
    # reporte queda, sin la foto.
    file_id = Column(Integer, ForeignKey("space_files.id"), nullable=True)
    # Quién reportó. Con cuenta propia lo pone el servidor —el nombre o el
    # correo de la sesión, desde el 2026-10-02—; por el enlace firmado, que no
    # tiene cuenta detrás, lo escribe quien confirma.
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
    # códigos, y sin esto heredaría los "montado" de la sede anterior. La foto
    # de un montaje archivado tampoco la borra la limpieza de fotos vencidas:
    # ante la duda, se conserva.
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

    El histórico queda mientras dure la relación: cinco días después de que la
    cadena de contratos (el contrato y sus renovaciones) termina sin
    renovación, la limpieza del mantenimiento borra la planometría
    (``services/fotos_vencidas.py``). Sólo las de kind ``planometria``.
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


class SupplierAssetSpec(Base):
    """La ficha del arte: qué forma tiene el envase y cuánto mide.

    Es lo que decide la ESCALA del producto en el 3D y cuántos frentes entran
    por entrepaño, que es justamente la cuenta que se negocia. Sin dato propio,
    la estimación por rubro se equivoca mucho —«yogur» cae en un tetra de 20 cm
    contra los 9 cm de un vaso de 200 g— y una corrección hecha sólo en la
    sesión se pierde en cada reunión. ``fondo_foto`` (auto / quitar / conservar)
    es la única red cuando el recorte automático del fondo falla.

    Tabla NUEVA a propósito, mismo patrón 1:1 que ``SpaceFace``:
    ``supplier_assets`` no admite una columna nueva porque ``create_all`` crea
    tablas que faltan pero nunca agrega columnas a una que ya existe (regla dura
    del repo, sin migraciones). Por lo mismo, ``extra_json`` queda de reserva —
    lateral, tapa, lo que venga—: una vez desplegada, ESTA tabla tampoco va a
    poder ganar columnas.

    ``forma`` y ``fondo_foto`` son String y no ``SAEnum``: en Postgres sumar un
    valor a un enum es un ``ALTER TYPE``, que es una migración. La lista
    cerrada la hace cumplir ``FichaIn`` en ``routers/catalogo.py``.

    Un arte SIN fila acá no está roto: el navegador estima las medidas por el
    contenido escrito en el nombre o por el rubro, y lo rotula «≈ estimado».
    """
    __tablename__ = "supplier_asset_specs"

    asset_id = Column(Integer, ForeignKey("supplier_assets.id"), primary_key=True)
    # auto | caja | botella | lata | vaso | frasco | bolsa | otro
    forma = Column(String, nullable=False, default="auto")
    alto_mm = Column(Integer, nullable=True)
    ancho_mm = Column(Integer, nullable=True)
    fondo_mm = Column(Integer, nullable=True)
    apilable = Column(Boolean, nullable=False, default=False)
    acostado = Column(Boolean, nullable=False, default=False)
    # auto | quitar | conservar
    fondo_foto = Column(String, nullable=False, default="auto")
    # El precio al público, en pesos enteros, OPCIONAL: lo que dice el hablador
    # del porta-precios en la pantalla de venta. Sin cargar, el hablador va sin
    # cifra — el sistema nunca inventa un precio. Entró antes del primer
    # despliegue de esta tabla (después ya no podría ganar la columna); en una
    # base local creada desde la rama hace falta el ALTER que dice ESTADO.md.
    precio_publico = Column(Integer, nullable=True)
    extra_json = Column(Text, nullable=True)
    actualizado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ModeloMueble(Base):
    """La ficha propia de un mueble del supermercado: familia, nombre, medidas,
    geometría y de dónde salieron.

    Existe para que cada supermercado arme sus muebles sin pedirnos un cambio.
    Los modelos que trae RECABRA viven en ``muebles.json`` (``base:…``) y cambian
    sólo con un despliegue; los de un supermercado —la nevera de dos puertas que
    tiene Cañaveral y no está en el catálogo— viven acá, en la base de cada
    uno, y viajan en el plano como ``cli:<clave>`` en el ``modelo`` del mueble.

    **Colocar una ficha la ESTAMPA**, como un modelo del catálogo: el mueble
    guarda sus medidas y su geometría, y lo colocado no se vuelve a leer de acá.
    Cambiar o retirar la ficha no mueve nada de ningún plano. Lo único que se
    busca por la clave es su tarifa propia (``catalogo_muebles.tarifa_del_mueble``
    con ``services/fichas_propias.tarifas_propias``), y por eso la clave, la
    familia y la tarifa no cambian nunca.

    · ``id`` entero con ``sqlite_autoincrement`` (en Postgres, la secuencia nunca
      retrocede): no se reutiliza. Es la clave primaria a propósito, y no la
      ``clave``: la copia de seguridad arma rutas con la clave primaria, y un
      entero no lleva «:», «/» ni «..».
    · ``clave``: ``^[a-z0-9-]{1,60}$``, única y para siempre. Una ficha retirada
      conserva la suya: otra con la misma clave le cambiaría la tarifa a lo que
      ya está colocado.
    · ``tipo`` es la familia del catálogo, String y no ``SAEnum``: en Postgres
      sumar un valor a un enum es un ``ALTER TYPE``, que es una migración.
    · ``datos_json``: casi todo —variante, medidas, entrepaños, módulo, puertas,
      tarifa, fuente— lo valida ``catalogo_muebles.problemas_de_la_ficha``.
      Va en JSON porque, una vez desplegada, esta tabla tampoco va a poder ganar
      columnas (la lección de ``supplier_asset_specs``).
    · ``retirado_en``: la baja lógica. Retirar la saca de las paletas; no borra
      nada, y lo ya colocado sigue igual, con su tarifa.

    Sin foto: la dueña no tiene fotos propias de sus muebles y ninguna imagen de
    terceros entra al sistema. Es de NEGOCIO (``TABLAS_DEL_CLIENTE``): viaja en
    el traspaso y en la copia de seguridad.
    """
    __tablename__ = "modelos_mueble"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    clave = Column(String, nullable=False, unique=True)
    tipo = Column(String, nullable=False)
    nombre = Column(String, nullable=False)
    datos_json = Column(Text, nullable=False)
    retirado_en = Column(DateTime(timezone=True), nullable=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    actualizado_en = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    # El correo de quien la creó si entró con su cuenta, o su rol. Nunca una clave.
    creado_por = Column(String, nullable=True)


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


class SedeEnPapelera(Base):
    """Una sede borrada, por 30 días (auditoría P2-18).

    Borrar una sede se llevaba el plano (``db.delete(snap)``) y cerraba sus
    contratos vivos sin vuelta atrás: un clic equivocado en Ajustes › Sedes era
    rehacer el plano entero y volver a cargar lo vendido. Ahora el borrado deja
    acá el plano tal como estaba y QUÉ cerró (los espacios archivados, los
    contratos cerrados y los montajes archivados, por id), y quien administra
    la restaura desde Ajustes › Sedes dentro de los 30 días
    (``services/papelera.py``). Pasado el plazo la purga el mantenimiento.

    Tabla nueva a propósito: ``create_all`` no agrega columnas a una existente.
    """
    __tablename__ = "sedes_en_papelera"

    id = Column(Integer, primary_key=True, index=True)
    sede = Column(String, nullable=False, index=True)
    #: El plano como estaba (``layout_snapshots.fixtures_json``); ``[]`` si la
    #: sede no tenía plano guardado.
    fixtures_json = Column(Text, nullable=False, default="[]")
    #: ``{"espacios": [ids], "contratos": [ids], "montajes": [ids], "en_la_lista": bool}``.
    cerrado_json = Column(Text, nullable=False, default="{}")
    borrada_en = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc), index=True)
    borrada_por = Column(String, nullable=True)
    restaurada_en = Column(DateTime(timezone=True), nullable=True)
    restaurada_por = Column(String, nullable=True)
