from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class LayoutIn(BaseModel):
    """El plano de una sede tal como lo manda el editor.

    ``fixtures`` sigue siendo ``list[Any]`` a propósito: el mueble tiene campos
    que sólo el editor conoce —caras, ranuras, el arte probado encima— y
    tipificarlos acá los haría desaparecer del guardado en cuanto el cliente
    agregue uno. Lo que NO puede seguir siendo es «se acepta sin mirar», que es
    el hueco que la fase 12 dejó anotado (F7): la regla de los nombres vivía sólo
    en el navegador.

    La regla que ahora sí aplica el servidor está en
    ``services/layout_lookup.choques_nuevos`` y la llama ``routers/layout.py``
    antes de escribir. No es «rechazar los choques» —eso dejaría a CIUDAD JARDIN
    sin poder guardarse— sino **no aceptar choques nuevos**, comparando contra el
    snapshot anterior.
    """

    fixtures: list[Any] = Field(default=[], max_length=2000)
    # Revision the client started from, echoed back from a previous GET/PUT.
    # When present the server rejects the write if someone else saved in between
    # (optimistic concurrency). Absent means "overwrite unconditionally".
    base_updated_at: datetime | None = None


class LayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sede: str
    fixtures: list[Any]
    updated_at: datetime | None = None


class LayoutRevision(BaseModel):
    """Cheap polling payload — the revision of one sede without its fixtures."""
    model_config = ConfigDict(from_attributes=True)

    sede: str
    updated_at: datetime | None = None
    count: int = 0


class LayoutSettingsIn(BaseModel):
    """Shared, non-fixture layout state that every workstation must agree on."""
    sedes: list[str] = Field(default=[], max_length=100)
    catalog_labels: dict[str, str] = Field(default={})
    # Same optimistic-concurrency contract as LayoutIn: the revision this write
    # is based on. Absent means "overwrite unconditionally", which is what a
    # first-ever publish sends.
    base_updated_at: datetime | None = None


class LayoutSettingsOut(BaseModel):
    sedes: list[str] = Field(default=[], max_length=100)
    catalog_labels: dict[str, str] = Field(default={})
    updated_at: datetime | None = None
    # Cambia cuando los datos de este supermercado se reemplazan enteros
    # (`services/traspaso.py`). El navegador descarta los planos que guardaba de
    # otra generación antes de sincronizar. `None` = nunca se reemplazaron.
    generacion: str | None = None


class SeasonWindow(BaseModel):
    """Días de venta alrededor del ancla de una temporada."""
    before: int = Field(default=0, ge=0, le=180)
    after: int = Field(default=0, ge=0, le=180)


class SeasonWindowsIn(BaseModel):
    """Ventanas de venta por temporada, iguales para todas las sedes.

    El ANCLA (tercer domingo de junio, domingo de pascua…) la calcula el
    cliente porque es un hecho del calendario y no cambia. Acá solo viaja la
    decisión comercial: cuántos días antes y después se vende. No es dinero,
    así que la lectura es para cualquier rol; escribir requiere admin.
    """
    windows: dict[str, SeasonWindow] = Field(default={})


class SeasonWindowsOut(SeasonWindowsIn):
    updated_at: datetime | None = None


class ReferenceRatesIn(BaseModel):
    """Monthly reference rate (COP) per fixture type.

    ``default`` applies everywhere; ``by_sede`` overrides one type's rate for a
    single sede. Rates are money, so unlike the layout settings these are
    admin-only in BOTH directions — a worker must never read them.
    """
    default: dict[str, float] = Field(default={})
    by_sede: dict[str, dict[str, float]] = Field(default={})


class ReferenceRatesOut(ReferenceRatesIn):
    updated_at: datetime | None = None


# ─── Renumerar el plano: el código pasa a ser EL nombre ───────────────────────
#
# Dos pasos como la carga masiva, y por la misma razón: ``previo`` no escribe
# nada y ``aplicar`` escribe. Renumerar toca el nombre de cada mueble de cada
# sede y arrastra los espacios y los montajes; hacerlo a ciegas y mirar después
# no se deshace con un botón.


class RenumeracionIn(BaseModel):
    """Qué sedes renumerar. Vacío = todas, que es lo que el dueño pidió.

    «En todas las sedes, parejo»: se normaliza el plano completo aunque hoy no
    tenga conflicto, para que la numeración quede con la misma lógica en todas.
    """

    sedes: list[str] | None = Field(default=None, max_length=100)


class MuebleRenumeradoOut(BaseModel):
    """Una línea del antes → después. Es lo que se imprime y se camina."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tipo: str
    etiqueta: str
    #: Corrida del recorrido a la que pertenece: 1, 2, 3… en el sentido en que
    #: se camina la tienda.
    banda: int
    antes: str
    #: El nombre que el plano DIBUJABA antes: la nomenclatura escrita a mano o,
    #: si no había, el código. Es el que el dueño reconoce de la cartelería.
    se_leia: str
    ahora: str
    codigo_antes: str
    codigo_ahora: str
    cambia: bool
    cx: float
    cz: float


class EspacioArrastradoOut(BaseModel):
    """Una fila de ``spaces`` que se muda con su mueble."""

    model_config = ConfigDict(from_attributes=True)

    space_id: int
    antes: str
    ahora: str
    svg_antes: str
    svg_ahora: str
    contratos: int


class RenumeracionSedeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sede: str
    #: Eje que se camina ("z" o "x") y el perpendicular, sobre el que se cuentan
    #: las bandas.
    eje_recorrido: str
    eje_bandas: str
    #: Por qué se eligió ese eje, medido sobre la geometría de ESTE plano.
    motivo_eje: str
    bandas: int
    muebles: int
    cambian: int
    nomenclaturas_borradas: int
    filas: list[MuebleRenumeradoOut] = Field(default=[])
    espacios: list[EspacioArrastradoOut] = Field(default=[])
    montajes: int = 0
    avisos: list[str] = Field(default=[])
    #: El informe en texto plano, listo para imprimir y llevar a la tienda. Va
    #: acá y no sólo en la tabla porque es lo que el dueño usa para reconciliar
    #: con la cartelería: sin ese papel, renumerar deja el plano y el local
    #: hablando idiomas distintos.
    texto: str = ""


class RenumeracionOut(BaseModel):
    #: False en ``previo``, True en ``aplicar``. Que viaje en la respuesta evita
    #: la peor confusión posible de esta pantalla: creer que ya se aplicó.
    aplicado: bool
    sedes: list[RenumeracionSedeOut] = Field(default=[])
    muebles: int = 0
    cambian: int = 0


# ─── Los contratos que viven sólo en el JSON ─────────────────────────────────
#
# Lleva PLATA (`valor`), así que sus dos endpoints son admin-only. No hay
# variante redactada: un mercaderista no tiene nada que hacer con esto.


class ContratoDelPlanoOut(BaseModel):
    """Uno que se puede importar tal como está."""
    espacio: str
    sede: str
    code: str
    proveedor: str
    marca: str = ""
    desde: str
    hasta: str
    valor: float = 0
    observacion: str = ""


class IncompletoOut(BaseModel):
    """Uno que el plano da por vendido y que la base no puede aceptar.

    Se reporta en vez de inventarle lo que falta: `space_leases` exige
    proveedor y fechas, y rellenarlas con algo plausible sería fabricar un
    contrato que nadie firmó.
    """
    espacio: str
    sede: str
    code: str
    proveedor: str = ""
    desde: str = ""
    hasta: str = ""
    #: Dicho para que se pueda arreglar: «le falta el proveedor».
    motivo: str
    #: Lo que sí tiene, para poder juzgarlo sin abrir el plano.
    marca: str = ""
    valor: float = 0
    #: No es un contrato a medias: es un «Ocupado» que alguien puso a mano en el
    #: plano cuando el selector todavía lo permitía. No hay nada que completarle
    #: y se va solo al guardar ese plano. El consejo es el contrario, así que la
    #: pantalla los muestra aparte.
    residuo: bool = False


class ImportacionOut(BaseModel):
    importables: list[ContratoDelPlanoOut] = []
    incompletos: list[IncompletoOut] = []
    #: Cuántos ya tenían contrato en la base. Es lo que hace visible que
    #: correrlo de nuevo no duplica nada.
    ya_estaban: int = 0
    #: `false` en el previo, `true` cuando ya se escribió.
    aplicado: bool = False


# ─── Empezar de cero ─────────────────────────────────────────────────────────


class BarridoOut(BaseModel):
    """Qué hay para barrer, o qué se barrió."""
    contratos: int = 0
    planometrias: int = 0
    avisos: int = 0
    espacios_ocupados: int = 0
    muebles_con_residuo: int = 0
    sedes_con_residuo: list[str] = []
    #: Lo que se deja en pie, para que se vea que se deja.
    proveedores_intactos: int = 0
    espacios_intactos: int = 0
    montajes_intactos: int = 0
    aplicado: bool = False


class BarridoIn(BaseModel):
    """El seguro: hay que decir CUÁNTOS contratos se van a barrer.

    No es burocracia. Un botón que se lleva todos los contratos con un clic se
    aprieta sin querer, y esto no se deshace. Mandar el número obliga a leer el
    previo; y si la cuenta cambió entre que se miró y se apretó —alguien vendió
    algo en otra pestaña— el servidor se niega en vez de llevárselo también.
    """
    contratos_esperados: int
