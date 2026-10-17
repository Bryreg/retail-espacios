"""Renumerar el plano: el código pasa a ser EL nombre del mueble.

Hasta la fase 12 un mueble tenía **dos** nombres —el ``code``, que es la llave
con la que se guarda todo, y la ``nomenclatura``, texto libre que lo reemplazaba
en la pantalla— y nada obligaba a que coincidieran. Esa fase administró el
problema: rechazó el texto ambiguo, avisó del gemelo, pintó la colisión en el
plano. No lo eliminó, porque mover el ``code`` arrastra ``spaces.code`` y
``spaces.svg_id`` (los dos UNIQUE), ``mount_confirmations.space_code`` y el
histórico, y no había con qué pagar esa mudanza.

El dueño dijo que **los contratos cargados son de prueba**, así que la mudanza
ya no cuesta lo que costaba. Entonces se hace lo otro: el ``code`` pasa a ser EL
nombre y la ``nomenclatura`` deja de existir como segundo nombre. Con un solo
campo, «el nombre que se lee» y «la llave que une» no se pueden separar, y toda
la clase de error desaparece en vez de quedar vigilada.

Lo que el dueño eligió, con sus palabras: «Podemos renumerar, no hay problema,
porque los contratos cargados son de prueba. Lo único es **no eliminar ni
agregar ningún mueble**. Los planos ya están completos en todas las sedes.» Y
entre las opciones: que **el sistema renumere de cero** —se descartan los
nombres escritos a mano y cada tipo se numera siguiendo el recorrido del plano,
para que caminar la tienda y leer los números vaya en el mismo orden— y **en
todas las sedes, parejo**.

────────────────────────────────────────────────────────────────────────────────
LA REGLA DE RECORRIDO, y de dónde sale

No es una corazonada: sale de la geometría de los planos reales y de una medida
que ya está hecha. ``utils/pasillos.ts`` deduce las corridas de NAVE agrupando
por la coordenada **perpendicular** al eje largo de los muebles, y el resultado
**coincide con lo que hizo a mano quien numeró el plano**: nueve de las diez
corridas calzan exactamente con los códigos existentes (``docs/ESTADO.md``
§«Pasillos»). O sea: la persona que numeró caminó pasillo por pasillo. Esa es la
regla que hay que copiar, no inventar otra.

1. **El eje del recorrido.** Un supermercado tiene muebles alargados y todos
   apuntan para el mismo lado: las góndolas de una corrida corren a lo largo del
   pasillo. Se cuenta, con la huella YA GIRADA (``rotY`` aplicado, igual que
   ``_huella``), cuántos muebles se estiran sobre X y cuántos sobre Z; gana la
   mayoría, y ése es el eje que se camina. Si no hay ninguno alargado o hay
   empate, se mira el recinto: se camina la dimensión MENOR. En NAVE (42,4 × 15,8
   m) las diez corridas están repartidas sobre los 42,4 m de X y cada una se
   recorre sobre los 15,8 m de Z — los dos criterios dan lo mismo, que es la
   señal de que el criterio no es arbitrario.

2. **Las bandas.** Perpendicular al eje que se camina: si los pasillos corren
   sobre Z, la banda es el ``cx`` compartido. Se agrupan los muebles cuyo ``cx``
   difiere en menos de ``TOLERANCIA_BANDA`` del anterior — el mismo encadenado y
   la misma tolerancia de ``detectarCorridas``, que es la que se midió contra
   NAVE. Las bandas se numeran de menor a mayor.

3. **Adentro de la banda**, de menor a mayor sobre el eje que se camina. Empates
   —una fila de impulsadores comparte ``cz``— se desempatan por la coordenada de
   banda y, si aún empatan, por ``id``: dos corridas sobre el mismo plano dan
   exactamente lo mismo, siempre.

4. **La numeración es por tipo.** Se recorre el plano UNA vez y cada prefijo
   lleva su propio contador: ``GON-01``, ``GON-02``… ``PUN-01``… El prefijo sale
   de ``PREFIJO_POR_TIPO``, que sale del catálogo de muebles, igual que el de
   ``frontend/src/utils/nomenclatura.ts``.
   Un solo recorrido para todos los tipos y no uno por tipo: la promesa es que
   caminando la tienda los números suban, y eso sólo vale si hay UN recorrido.

────────────────────────────────────────────────────────────────────────────────
LOS INVARIANTES, que no se negocian y que se afirman ACÁ, no sólo en las pruebas

· Ningún mueble se agrega ni se borra: el conteo por sede es el mismo y el
  conjunto de ``fixture.id`` es EL MISMO conjunto. El ``id`` es la identidad real
  a través de la renumeración; el nombre es lo único que se mueve.
· No cambia una sola coordenada: ``cx``, ``cz``, ``w``, ``d``, ``rotY``,
  ``type``, ``rentable`` y todo lo demás quedan intactos. Los únicos dos campos
  que esta operación puede tocar son ``code`` y ``nomenclatura``.
· Nada queda huérfano: la renumeración arrastra ``spaces.code`` y
  ``spaces.svg_id`` —los dos UNIQUE, así que una permutación choca a mitad de
  camino y se resuelve con valores temporales en dos pasadas— y
  ``mount_confirmations.space_code``, todo dentro de UNA transacción.
· Es idempotente: la segunda corrida no escribe nada.

Si cualquiera de los tres primeros no se cumple, la operación **falla entera y no
escribe nada**. Es la promesa que se le hizo al dueño: no se elimina ni se
agrega ningún mueble.

────────────────────────────────────────────────────────────────────────────────
LA MEMORIA: el sistema recuerda cómo se llamaba cada mueble

Renumerar es lo único que cambia el nombre de un mueble **sin que nadie lo
teclee**, y hay dos cosas que no se enteran: el papel que firmó el proveedor y
el cartel de la góndola. Por eso cada corrida deja escrito, mueble por mueble,
cómo se llamaba antes (``_anotar_nombres`` → tabla ``renumeracion_nombres``), y
con eso la reconciliación —«Contratos para revisar uno por uno»— sigue
funcionando justo después de aplicar, que es el único momento en que hace falta.

**No es un segundo nombre**: vive en su propia tabla, nada resuelve contra ella
y se lee para contar, nunca para elegir un mueble. El porqué de la tabla —en vez
de un campo más en el JSON del mueble— está en el docstring de
``models.RenumeracionNombre``: un campo se pisa en la segunda renumeración y una
fila no, y un segundo campo de nombre adentro del mueble es exactamente la clase
de error que esta fase eliminó.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import (
    LayoutSnapshot,
    MountConfirmation,
    RenumeracionNombre,
    Space,
)
from app.services import catalogo_muebles
from app.services.candado import tomar_candados
from app.services.partes import partir_codigo
from app.services.layout_lookup import (
    _full_code,
    _huella,
    _y,
    nombre_de_mueble,
    normalizar,
)

# ─── El prefijo de cada tipo ──────────────────────────────────────────────────
#
# Sale del catálogo de muebles (``app/catalogo/muebles.json``, ver
# ``services/catalogo_muebles.py``), el mismo archivo del que sale
# ``PREFIJO_POR_TIPO`` en ``frontend/src/utils/nomenclatura.ts``. Si los dos
# lados se separan, el sistema vuelve a mentir: el servidor renumeraría un
# mueble a ``EXP-03`` y el editor, al agregar el siguiente, seguiría la serie de
# otro prefijo. Por eso ``tests/test_catalogo_muebles.py`` exige que las dos
# copias del archivo sean idénticas y ``tests/test_renumeracion.py`` compara
# esta tabla contra la copia que lee el editor.

PREFIJO_POR_TIPO: dict[str, str] = catalogo_muebles.PREFIJO_POR_TIPO

#: Lo desconocido cae en SPC, como hace ``prefijoDe`` del frontend.
PREFIJO_DESCONOCIDO: str = catalogo_muebles.PREFIJO_DESCONOCIDO

#: Dos muebles a menos de esto sobre la coordenada perpendicular están en la
#: misma banda. Es la tolerancia de ``detectarCorridas`` (``utils/pasillos.ts``),
#: la que se midió contra las diez corridas reales de NAVE.
TOLERANCIA_BANDA = 0.6  # m

#: Cuánto más largo que ancho tiene que ser un mueble para que su orientación
#: cuente como voto. Un impulsador de 0,60 × 0,50 no apunta a ningún lado; una
#: góndola de 3,60 × 0,90 sí.
RATIO_ALARGADO = 1.5

#: Los dos únicos campos que la renumeración puede tocar. El invariante se
#: afirma contra esta lista: cualquier otra diferencia entre el plano de antes y
#: el de después es un mueble movido, y eso aborta la operación entera.
CAMPOS_QUE_PUEDEN_CAMBIAR = ("code", "nomenclatura")

#: Prefijo de los valores temporales de la pasada 1. ``spaces.code`` y
#: ``spaces.svg_id`` son UNIQUE: renombrar A→B y B→A de a una fila choca a mitad
#: de camino, así que primero todas las filas afectadas van a un valor imposible
#: y recién después al definitivo, dentro de la MISMA transacción.
TEMPORAL = "~renum~"


def prefijo_de(tipo) -> str:
    """El prefijo de un tipo de mueble. Espeja ``prefijoDe`` del frontend."""
    return PREFIJO_POR_TIPO.get(str(tipo or ""), PREFIJO_DESCONOCIDO)


# ─── Errores ──────────────────────────────────────────────────────────────────


class RenumeracionBloqueada(Exception):
    """No se puede renumerar esta sede, y hace falta que alguien lo arregle.

    No es un fallo del cálculo: es el plano o la base que no permiten hacerlo
    sin romper algo. El mensaje dice qué, con nombre y apellido, porque el
    remedio lo tiene que aplicar una persona.
    """

    def __init__(self, sede: str, motivos: list[str]):
        self.sede = sede
        self.motivos = motivos
        super().__init__(f"{sede}: " + " · ".join(motivos))


class InvarianteRoto(Exception):
    """El resultado calculado viola una promesa. Nunca debería pasar.

    Existe para que, si alguna vez pasa, no se escriba NADA: es la diferencia
    entre un error y un plano con un mueble de menos.
    """

    def __init__(self, sede: str, fallas: list[str]):
        self.sede = sede
        self.fallas = fallas
        super().__init__(f"{sede}: " + " · ".join(fallas))


# ─── El recorrido ─────────────────────────────────────────────────────────────


def eje_de_recorrido(fixtures: list[dict]) -> tuple[str, str]:
    """Sobre qué eje se camina la tienda, y por qué. Devuelve ``("z"|"x", motivo)``.

    Primero el voto de los muebles alargados, que es evidencia directa de cómo
    están puestos: una corrida de góndolas apunta a lo largo del pasillo. Si no
    hay ninguno alargado —una sede de puro impulsador— se mira el recinto y se
    camina la dimensión menor, que es la forma que tiene un supermercado: muchos
    pasillos repartidos a lo ancho, cada uno recorrido a lo largo del lado corto.
    """
    largos_x = largos_z = 0
    for f in fixtures:
        w, d = _huella(f)
        if w >= d * RATIO_ALARGADO:
            largos_x += 1
        elif d >= w * RATIO_ALARGADO:
            largos_z += 1

    if largos_z > largos_x:
        return "z", (
            f"{largos_z} muebles alargados corren sobre Z y {largos_x} sobre X: "
            "los pasillos van sobre Z"
        )
    if largos_x > largos_z:
        return "x", (
            f"{largos_x} muebles alargados corren sobre X y {largos_z} sobre Z: "
            "los pasillos van sobre X"
        )

    xs = [_coord(f, "cx") for f in fixtures]
    zs = [_coord(f, "cz") for f in fixtures]
    ancho_x = (max(xs) - min(xs)) if xs else 0.0
    ancho_z = (max(zs) - min(zs)) if zs else 0.0
    empate = f"{largos_x} muebles alargados sobre cada eje" if largos_x else "ningún mueble alargado"
    if ancho_z <= ancho_x:
        return "z", (
            f"{empate}: se camina la dimensión menor del recinto "
            f"(Z mide {ancho_z:.1f} m contra {ancho_x:.1f} m de X)"
        )
    return "x", (
        f"{empate}: se camina la dimensión menor del recinto "
        f"(X mide {ancho_x:.1f} m contra {ancho_z:.1f} m de Z)"
    )


def _coord(fixture: dict, clave: str) -> float:
    try:
        return float(fixture.get(clave) or 0)
    except (TypeError, ValueError):
        return 0.0


def recorrido(fixtures: list[dict], eje: str | None = None) -> list[tuple[int, dict]]:
    """Los muebles en el orden en que se caminan, cada uno con su banda.

    Banda = coordenada perpendicular al eje que se camina, agrupada con
    ``TOLERANCIA_BANDA``. Adentro de la banda, de menor a mayor sobre el eje que
    se camina. Determinista y estable: los empates se rompen por la coordenada
    de banda y después por ``id``, así que dos corridas sobre el mismo plano dan
    exactamente el mismo orden.
    """
    if not fixtures:
        return []
    if eje is None:
        eje, _ = eje_de_recorrido(fixtures)

    # Sobre Z se camina: la banda la marca cx. Sobre X: la marca cz.
    clave_banda = "cx" if eje == "z" else "cz"
    clave_largo = "cz" if eje == "z" else "cx"

    def banda(f: dict) -> float:
        return _coord(f, clave_banda)

    def largo(f: dict) -> float:
        return _coord(f, clave_largo)

    def ident(f: dict) -> str:
        return str(f.get("id") or "")

    ordenados = sorted(fixtures, key=lambda f: (banda(f), largo(f), ident(f)))

    grupos: list[list[dict]] = []
    for f in ordenados:
        if grupos and abs(banda(f) - banda(grupos[-1][-1])) <= TOLERANCIA_BANDA:
            grupos[-1].append(f)
        else:
            grupos.append([f])

    salida: list[tuple[int, dict]] = []
    for i, grupo in enumerate(grupos, start=1):
        for f in sorted(grupo, key=lambda f: (largo(f), banda(f), ident(f))):
            salida.append((i, f))
    return salida


def codigos_nuevos(fixtures: list[dict], eje: str | None = None) -> list[tuple[int, dict, str]]:
    """``(banda, mueble, código nuevo)`` para cada mueble, en orden de recorrido.

    Un solo recorrido para toda la sede y un contador por prefijo: los GON suben
    caminando, los PUN suben caminando, y los dos suben en el mismo sentido.
    """
    contador: dict[str, int] = defaultdict(int)
    salida: list[tuple[int, dict, str]] = []
    for banda, f in recorrido(fixtures, eje):
        p = prefijo_de(f.get("type"))
        contador[p] += 1
        salida.append((banda, f, f"{p}-{contador[p]:02d}"))
    return salida


# ─── Los invariantes, afirmados ──────────────────────────────────────────────


def verificar_invariantes(sede: str, antes: list[dict], despues: list[dict]) -> None:
    """Compara el plano de antes con el de después y falla si algo se movió.

    Se corre ANTES de escribir una sola fila, en el paso previo y otra vez en el
    aplicar. Lo que afirma es exactamente lo que se le prometió al dueño:
    ningún mueble de más, ninguno de menos, ninguna coordenada movida.
    """
    fallas: list[str] = []

    if len(antes) != len(despues):
        fallas.append(
            f"el plano tenía {len(antes)} muebles y quedaría con {len(despues)}"
        )

    ids_antes = [str(f.get("id") or "") for f in antes]
    ids_despues = [str(f.get("id") or "") for f in despues]
    if set(ids_antes) != set(ids_despues):
        perdidos = sorted(set(ids_antes) - set(ids_despues))
        nuevos = sorted(set(ids_despues) - set(ids_antes))
        if perdidos:
            fallas.append(f"desaparecen los muebles {', '.join(perdidos[:5])}")
        if nuevos:
            fallas.append(f"aparecen muebles que no estaban: {', '.join(nuevos[:5])}")

    por_id = {str(f.get("id") or ""): f for f in antes}
    for nuevo in despues:
        viejo = por_id.get(str(nuevo.get("id") or ""))
        if viejo is None:
            continue
        claves = set(viejo) | set(nuevo)
        for clave in sorted(claves):
            if clave in CAMPOS_QUE_PUEDEN_CAMBIAR:
                continue
            if viejo.get(clave) != nuevo.get(clave):
                fallas.append(
                    f"el mueble {nuevo.get('id')} cambió «{clave}»: "
                    f"{viejo.get(clave)!r} → {nuevo.get(clave)!r}"
                )

    vistos: dict[str, str] = {}
    for f in despues:
        c = normalizar(f.get("code"))
        if c in vistos:
            fallas.append(
                f"el nombre {c} le tocaría a dos muebles ({vistos[c]} y {f.get('id')})"
            )
        vistos[c] = str(f.get("id") or "")

    if fallas:
        raise InvarianteRoto(sede, fallas)


# ─── El plan de una sede ──────────────────────────────────────────────────────


@dataclass
class MuebleRenumerado:
    """Una línea del informe antes → después. Es lo que el dueño imprime."""

    id: str
    tipo: str
    etiqueta: str
    banda: int
    antes: str
    se_leia: str
    ahora: str
    codigo_antes: str
    codigo_ahora: str
    cambia: bool
    cx: float
    cz: float


@dataclass
class EspacioArrastrado:
    """Una fila de ``spaces`` que se muda con su mueble, con lo que cuelga."""

    space_id: int
    antes: str
    ahora: str
    svg_antes: str
    svg_ahora: str
    contratos: int


@dataclass
class PlanSede:
    sede: str
    eje_recorrido: str
    eje_bandas: str
    motivo_eje: str
    bandas: int
    muebles: int
    cambian: int
    nomenclaturas_borradas: int
    filas: list[MuebleRenumerado]
    espacios: list[EspacioArrastrado]
    montajes: int
    avisos: list[str]
    texto: str = ""
    #: El plano ya renumerado. No viaja en la respuesta: lo usa ``aplicar``.
    fixtures_nuevas: list[dict] = field(default_factory=list, repr=False)
    #: ``{código completo viejo: código completo nuevo}``, sin las caras B.
    mapa: dict[str, str] = field(default_factory=dict, repr=False)


def _corto(codigo: str, sede: str) -> str:
    """``NAVE-GON-01`` en la sede NAVE es ``GON-01``; ``GON-01`` ya es corto."""
    c = normalizar(codigo)
    s = normalizar(sede)
    return c[len(s) + 1:] if s and c.startswith(f"{s}-") else c


def _fixtures_de(snap: LayoutSnapshot | None) -> list[dict]:
    if snap is None:
        return []
    try:
        cargado = json.loads(snap.fixtures_json or "[]")
    except (ValueError, TypeError):
        return []
    return [f for f in cargado if isinstance(f, dict)] if isinstance(cargado, list) else []


def planificar_sede(db: Session, sede: str) -> PlanSede:
    """Calcula la renumeración de UNA sede sin escribir nada.

    Es el paso «previo» de los dos: el dueño lo lee, lo imprime y lo reconcilia
    con la cartelería de la tienda antes de que nada cambie. Sin ese papel,
    renumerar le deja el plano y el local hablando idiomas distintos.
    """
    snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == sede).first()
    fixtures = _fixtures_de(snap)

    bloqueos: list[str] = []
    sin_id = [f for f in fixtures if not str(f.get("id") or "").strip()]
    if sin_id:
        bloqueos.append(
            f"{len(sin_id)} muebles no tienen identidad (`id`): sin ella no se puede "
            "afirmar que después de renumerar siguen siendo los mismos"
        )
    cuenta: dict[str, int] = defaultdict(int)
    for f in fixtures:
        cuenta[str(f.get("id") or "")] += 1
    repetidos = sorted(i for i, n in cuenta.items() if n > 1 and i)
    if repetidos:
        bloqueos.append(
            "hay muebles que comparten `id` (" + ", ".join(repetidos[:5]) + "): "
            "la identidad tiene que ser única para poder arrastrar el nombre"
        )
    if bloqueos:
        raise RenumeracionBloqueada(sede, bloqueos)

    eje, motivo = eje_de_recorrido(fixtures)
    eje_bandas = "x" if eje == "z" else "z"
    calculado = codigos_nuevos(fixtures, eje)

    filas: list[MuebleRenumerado] = []
    nuevas: list[dict] = []
    mapa: dict[str, str] = {}
    nomenclaturas = 0
    for banda, f, nuevo in calculado:
        propia = str(f.get("sede") or sede or "").strip()
        viejo_corto = normalizar(f.get("code"))
        viejo_completo = _full_code(viejo_corto, propia) if viejo_corto else ""
        nuevo_completo = _full_code(nuevo, propia)
        tenia_nomenclatura = bool(str(f.get("nomenclatura") or "").strip())
        if tenia_nomenclatura:
            nomenclaturas += 1
        cambia = viejo_corto != nuevo or tenia_nomenclatura

        copia = dict(f)
        copia["code"] = nuevo
        # El segundo nombre deja de existir. No se vacía: se saca, para que no
        # quede un campo muerto invitando a que alguien lo vuelva a llenar.
        copia.pop("nomenclatura", None)
        nuevas.append(copia)

        if viejo_completo and viejo_completo != nuevo_completo:
            mapa[viejo_completo] = nuevo_completo

        filas.append(
            MuebleRenumerado(
                id=str(f.get("id") or ""),
                tipo=str(f.get("type") or ""),
                etiqueta=str(f.get("label") or ""),
                banda=banda,
                antes=viejo_corto,
                se_leia=nombre_de_mueble(f),
                ahora=nuevo,
                codigo_antes=viejo_completo,
                codigo_ahora=nuevo_completo,
                cambia=cambia,
                cx=_coord(f, "cx"),
                cz=_coord(f, "cz"),
            )
        )

    # Antes de mirar la base: que el resultado sea el mismo plano con otros
    # nombres. Si esto falla, no se sigue.
    verificar_invariantes(sede, fixtures, nuevas)

    # Un plano sucio puede tener DOS muebles con el mismo código, y entonces el
    # espacio que cuelga de ese código no se puede repartir: no hay forma de
    # saber a cuál de los dos pertenece el contrato. Se detecta acá y se bloquea
    # más adelante, pero sólo si ese espacio existe: si no existe, renumerar es
    # justamente lo que arregla el duplicado.
    por_codigo_viejo: dict[str, list[str]] = defaultdict(list)
    for fila in filas:
        if fila.codigo_antes:
            por_codigo_viejo[fila.codigo_antes].append(fila.id)
    duplicados = {c: ids for c, ids in por_codigo_viejo.items() if len(ids) > 1}
    for c in duplicados:
        mapa.pop(c, None)

    espacios, montajes, avisos = _arrastre(db, sede, mapa, duplicados)

    plan = PlanSede(
        sede=sede,
        eje_recorrido=eje,
        eje_bandas=eje_bandas,
        motivo_eje=motivo,
        bandas=max((b for b, _, _ in calculado), default=0),
        muebles=len(fixtures),
        cambian=sum(1 for f in filas if f.cambia),
        nomenclaturas_borradas=nomenclaturas,
        filas=filas,
        espacios=espacios,
        montajes=montajes,
        avisos=avisos,
        fixtures_nuevas=nuevas,
        mapa=mapa,
    )
    plan.texto = informe_texto(plan)
    return plan


def _base_y_cara(codigo: str) -> tuple[str, str]:
    """``NAVE-GON-01-B`` → ``("NAVE-GON-01", "-B")``. La cara B comparte mueble.

    Y la parte también (vender por partes): ``NAVE-NEV-03-PU2`` →
    ``("NAVE-NEV-03", "-PU2")``, ``NAVE-GON-05-B-PU1`` → ``("NAVE-GON-05",
    "-B-PU1")``. Renumerar la nevera muda sus puertas vendidas, sus montajes y
    su ``svg_id`` con ella: el sufijo viaja tal cual."""
    c = normalizar(codigo)
    partido = partir_codigo(c)
    return partido.base, c[len(partido.base):]


def _svg_nuevo(svg: str, viejo: str, nuevo: str) -> str:
    """El ``svg_id`` que le corresponde al espacio después de la mudanza.

    En el repo hay dos formas de fabricarlo: el código pelado
    (``bulk_leases.py``) y ``fix-CODIGO`` (``spaces.py``, ``mounts.py``).
    Cualquier otra cosa es un id sembrado a mano —``lic-24h``, ``arroz-centro``—
    que no se deriva del código y no se toca.
    """
    actual = normalizar(svg)
    if actual == normalizar(viejo):
        return nuevo
    if actual == f"FIX-{normalizar(viejo)}":
        return f"fix-{nuevo}"
    return svg or ""


def _arrastre(
    db: Session,
    sede: str,
    mapa: dict[str, str],
    duplicados: dict[str, list[str]] | None = None,
) -> tuple[list[EspacioArrastrado], int, list[str]]:
    """Qué se mueve con los muebles, y qué bloquea la mudanza.

    ``spaces.code`` y ``spaces.svg_id`` son UNIQUE. Acá sólo se CALCULA el
    destino de cada fila y se detecta el choque que la haría fallar a mitad de
    camino; escribir es tarea de ``aplicar``, que lo hace en dos pasadas dentro
    de una transacción.
    """
    avisos: list[str] = []
    duplicados = duplicados or {}
    if not mapa and not duplicados:
        return [], 0, avisos

    todos = db.query(Space).all()
    bloqueos: list[str] = []

    # El destino de cada nombre, y de dónde viene. Un nombre que alguien deja
    # libre lo puede tomar otro: eso es una permutación y es lo normal.
    destinos = {nuevo: viejo for viejo, nuevo in mapa.items()}

    arrastrados: list[EspacioArrastrado] = []
    ids_que_se_mudan: set[int] = set()
    for space in todos:
        base, cara = _base_y_cara(space.code)

        # Dos muebles con el mismo código y un solo espacio colgando: no hay
        # forma honesta de decir de cuál de los dos es el contrato.
        if base in duplicados:
            bloqueos.append(
                f"el código {base} lo comparten {len(duplicados[base])} muebles "
                f"({', '.join(sorted(duplicados[base]))}) y hay un espacio colgando "
                "de él: arreglá el código repetido antes de renumerar"
            )
            continue

        destino_base = mapa.get(base)
        if not destino_base:
            # El nombre al que llega otro mueble ya lo tiene ESTE espacio, que no
            # se mueve porque su mueble no está en el plano: la fila quedó de un
            # mueble borrado después del contrato. Darle su nombre a otro dejaría
            # el contrato viejo colgado del mueble nuevo.
            if base in destinos:
                bloqueos.append(
                    f"el código {base} ya lo tiene el espacio #{space.id}, que no "
                    "corresponde a ningún mueble del plano: archivalo o borralo "
                    "antes de renumerar"
                )
            continue

        nuevo = destino_base + cara
        arrastrados.append(
            EspacioArrastrado(
                space_id=space.id,
                antes=normalizar(space.code),
                ahora=nuevo,
                svg_antes=space.svg_id or "",
                svg_ahora=_svg_nuevo(space.svg_id or "", normalizar(space.code), nuevo),
                contratos=sum(1 for l in space.leases if l.is_active),
            )
        )
        ids_que_se_mudan.add(space.id)

    # El otro UNIQUE. Un ``svg_id`` sembrado a mano no se deriva del código y no
    # se toca, así que puede quedar pisando el destino de otro.
    svg_quietos = {
        normalizar(s.svg_id): s.id
        for s in todos
        if s.id not in ids_que_se_mudan and (s.svg_id or "").strip()
    }
    for mudanza in arrastrados:
        if not (mudanza.svg_ahora or "").strip():
            continue
        duenio = svg_quietos.get(normalizar(mudanza.svg_ahora))
        if duenio is not None:
            bloqueos.append(
                f"el svg_id {mudanza.svg_ahora} ya lo tiene el espacio #{duenio}, "
                f"que no se mueve: el espacio #{mudanza.space_id} no puede tomarlo"
            )

    if bloqueos:
        raise RenumeracionBloqueada(sede, sorted(set(bloqueos)))

    # Los códigos cortos sueltos —el agujero que la fase 12 tapó hacia adelante—
    # NO se arrastran: un código sin sede no identifica una tienda, y moverlo
    # sería mandar un contrato al supermercado equivocado. Se avisan para que se
    # vean.
    for space in todos:
        base, _ = _base_y_cara(space.code)
        if base in mapa:
            continue
        for viejo, nuevo in mapa.items():
            if viejo.endswith(f"-{base}"):
                avisos.append(
                    f"El espacio «{space.code}» tiene el código corto de un mueble que "
                    f"se renumera ({viejo} → {nuevo}); no se arrastra porque un "
                    "código sin sede no dice de qué tienda es. Revisalo a mano."
                )
                break

    montajes = 0
    for conf in db.query(MountConfirmation).filter(
        MountConfirmation.archivado_en.is_(None)
    ).all():
        base, _ = _base_y_cara(conf.space_code)
        if base in mapa:
            montajes += 1

    return arrastrados, montajes, avisos


# ─── El paso que sí escribe ───────────────────────────────────────────────────


def codigos_del_candado(planes: list[PlanSede]) -> set[str]:
    """Los códigos COMPLETOS, viejos y nuevos, de cada mueble que cambia de
    código: con la sede del mueble (como se mudan sus espacios, ``mapa``) y con
    la del plano (como arman la cara las participaciones, ``codigo_cara``).

    Son las claves del candado del mueble (``services/candado.py``: la base del
    código), las mismas que toman la venta de la cara entera, de sus partes y
    de sus participaciones, y el guardado del plano. Un mueble que sólo pierde
    la nomenclatura no muda nada y no entra."""
    codigos: set[str] = set()
    for plan in planes:
        for fila in plan.filas:
            if not fila.antes or fila.antes == fila.ahora:
                continue
            codigos.update(c for c in (
                fila.codigo_antes, fila.codigo_ahora,
                _full_code(fila.antes, plan.sede), _full_code(fila.ahora, plan.sede),
            ) if c)
    return codigos


def con_candados(db: Session, planes: list[PlanSede]) -> list[PlanSede]:
    """Toma los candados de los muebles que se renumeran y devuelve el plan
    vuelto a calcular con ellos puestos (y la sesión leída de nuevo).

    Sin esto, un alta de participación que buscaba la cara por el código viejo
    mientras la renumeración la mudaba podía crear su espacio ``…-PC2`` con el
    nombre que se estaba yendo: la mudanza sólo arrastra lo que vio al
    planificar, y la participación quedaba colgada de un mueble que ya no se
    llama así. Con el candado, el alta espera (o la renumeración la ve).

    Es el patrón de la planilla (``bulk_leases.confirmar``): mirar, tomar el
    candado, ``expire_all`` (SQLAlchemy no refresca lo que ya tiene en memoria)
    y volver a mirar; lo que se escribe es lo que pasó la segunda mirada. Si el
    plano cambió en el medio y la segunda mirada renombra otros muebles, se
    frena (``RenumeracionBloqueada``): esos no tienen el candado."""
    codigos = codigos_del_candado(planes)
    if not codigos:
        return planes
    tomar_candados(db, codigos)
    db.expire_all()
    frescos = [planificar_sede(db, plan.sede) for plan in planes]
    for plan in frescos:
        nuevos = codigos_del_candado([plan]) - codigos
        if nuevos:
            raise RenumeracionBloqueada(plan.sede, [
                "el plano cambió mientras se renumeraba (" + ", ".join(sorted(nuevos)[:5]) + "): "
                "mirá el previo otra vez"])
    return frescos


def aplicar(db: Session, planes: list[PlanSede]) -> None:
    """Escribe la renumeración de todas las sedes en UNA transacción.

    No hace commit: lo hace el endpoint, para que la bitácora viaje en la misma
    transacción y las dos cosas caigan juntas o no caiga ninguna. El endpoint
    pasa el plan de ``con_candados``: los muebles que se mudan ya tienen su
    candado.

    Idempotente: una sede donde nada cambia no se toca —ni el plano ni su
    ``updated_at``—, así que correrla dos veces deja todo exactamente igual.
    """
    for plan in planes:
        if plan.cambian == 0:
            continue

        snap = db.query(LayoutSnapshot).filter(LayoutSnapshot.sede == plan.sede).first()
        if snap is None:
            continue
        # Última afirmación contra lo que hay guardado AHORA, no contra lo que se
        # leyó al planificar: si algo cambió en el medio, esto lo caza y aborta.
        verificar_invariantes(plan.sede, _fixtures_de(snap), plan.fixtures_nuevas)

        _mudar_espacios(db, plan)
        _mudar_montajes(db, plan)
        _anotar_nombres(db, plan)

        snap.fixtures_json = json.dumps(plan.fixtures_nuevas)
        snap.updated_at = _ahora()


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _mudar_espacios(db: Session, plan: PlanSede) -> None:
    """Las dos pasadas, que es lo que un UNIQUE obliga a hacer.

    Renumerar es casi siempre una PERMUTACIÓN: el nombre que deja uno lo toma
    otro. Escribiéndolo fila por fila, la primera choca contra la que todavía no
    se movió. Entonces primero todas van a un valor imposible —``~renum~…``, con
    el id de la fila adentro, que no puede existir como código— y recién después
    al definitivo. Las dos pasadas viven en la misma transacción: nadie ve nunca
    el estado intermedio.
    """
    if not plan.espacios:
        return
    por_id = {s.id: s for s in db.query(Space).filter(
        Space.id.in_([e.space_id for e in plan.espacios])
    ).all()}

    for e in plan.espacios:
        space = por_id.get(e.space_id)
        if space is None:
            continue
        space.code = f"{TEMPORAL}{space.id}~code"
        space.svg_id = f"{TEMPORAL}{space.id}~svg"
    db.flush()

    for e in plan.espacios:
        space = por_id.get(e.space_id)
        if space is None:
            continue
        # ``name`` es el rótulo del espacio, pero hay caminos que lo llenan con
        # el propio código (``mounts.py`` crea el espacio con ``name=code``).
        # Cuando es el código, se muda; cuando es un rótulo de verdad —«Punta
        # Góndola»— no se toca, que es lo que alguien quiso escribir ahí.
        nombre = normalizar(space.name)
        corto_viejo = _corto(e.antes, plan.sede)
        if nombre == e.antes:
            space.name = e.ahora
        elif nombre == corto_viejo:
            space.name = _corto(e.ahora, plan.sede)
        space.code = e.ahora
        space.svg_id = e.svg_ahora or e.ahora
    db.flush()


def _mudar_montajes(db: Session, plan: PlanSede) -> None:
    """``mount_confirmations.space_code`` guarda el código como texto suelto.

    Se guarda así a propósito —un montaje se puede confirmar antes de que exista
    la fila en ``spaces``— y por eso hay que arrastrarlo a mano: es la prueba de
    que la exhibición se armó, y con el código viejo quedaría colgada de un
    mueble que ya no se llama así.

    Una sola pasada alcanza porque ``space_code`` no es UNIQUE, y el destino de
    cada fila se calcula contra el mapa —nunca contra un valor ya escrito—, así
    que una permutación no se pisa a sí misma.

    Lo archivado no se toca: pertenece a una sede borrada y es historia
    congelada.
    """
    if not plan.mapa:
        return
    for conf in db.query(MountConfirmation).filter(
        MountConfirmation.archivado_en.is_(None)
    ).all():
        base, cara = _base_y_cara(conf.space_code)
        destino = plan.mapa.get(base)
        if destino:
            conf.space_code = destino + cara


# ─── La memoria: cómo se llamaba antes cada mueble ────────────────────────────
#
# La renumeración es la única operación del sistema que **cambia el nombre de un
# mueble sin que nadie lo teclee**, y del otro lado quedan dos cosas que no se
# enteran: el papel que firmó el proveedor y el cartel de la góndola. Si el
# nombre viejo no queda escrito en ningún lado, la lista «Contratos para revisar
# uno por uno» se apaga exactamente el día para el que existe.
#
# Se guarda en su propia tabla (``RenumeracionNombre``) y NO como un campo más
# del mueble. El porqué está entero en el docstring del modelo; en una línea:
# un segundo campo de nombre adentro del mueble es la clase de error que esta
# fase eliminó, un campo se pisa en la segunda renumeración y una tabla no, y
# esto además es el rastro de auditoría que la operación no tenía.
#
# Nada resuelve contra esto. Es historia: se lee para contar, nunca para elegir
# un mueble.


def _anotar_nombres(db: Session, plan: PlanSede) -> None:
    """Una fila por mueble que deja de llamarse como se llamaba.

    Se anota el nombre **dibujado** (``se_leia``), no el código: es lo que leyó
    quien negoció el contrato y lo que sigue diciendo el cartel de la góndola.
    En CIUDAD JARDIN esos dos no coincidían —el mueble ``imp12`` se dibujaba
    «IMP-08»— y es justo el caso que hay que poder reconciliar.

    Un mueble que sale llamándose igual que entró no deja fila: no hay nada que
    recordar, y una fila de más ensuciaría la respuesta de la reconciliación.
    """
    momento = _ahora()
    for fila in plan.filas:
        viejo = normalizar(fila.se_leia)
        if not fila.id or not viejo or viejo == normalizar(fila.ahora):
            continue
        db.add(
            RenumeracionNombre(
                sede=plan.sede,
                fixture_id=fila.id,
                nombre_anterior=viejo,
                codigo_anterior=fila.codigo_antes,
                codigo_nuevo=fila.codigo_ahora,
                aplicado_en=momento,
            )
        )


def nombres_anteriores(
    db: Session, sedes: list[str] | None = None
) -> dict[str, dict[str, str]]:
    """``{sede: {id del mueble: cómo se llamaba antes}}``.

    Es la consulta que la reconciliación necesita: «para esta sede, cómo se
    llamaba antes cada mueble». Sigue contestando después de renumerar dos
    veces, que es lo que un campo pisado no podría hacer.

    De la cadena se devuelve **la punta más vieja** —el nombre con el que el
    mueble entró a la PRIMERA renumeración— y no la penúltima. Es una decisión,
    y ésta es la razón: lo que esto contesta no es «cómo se llamaba ayer» sino
    «qué dice el papel que tengo en la mano», y el papel y el cartel de la
    tienda traen el nombre de antes de que el sistema empezara a moverlo. El
    nombre intermedio de una segunda corrida hecha la misma semana no estuvo
    nunca en una pared. La cadena completa queda igual en la tabla, para quien
    algún día quiera mostrarla entera.
    """
    consulta = db.query(RenumeracionNombre)
    if sedes is not None:
        claves = [s for s in sedes if s]
        if not claves:
            return {}
        consulta = consulta.filter(RenumeracionNombre.sede.in_(claves))

    salida: dict[str, dict[str, str]] = {}
    # Por ``id`` ascendente: la fila más vieja de cada mueble es la que manda, y
    # ``setdefault`` deja que la primera gane.
    for fila in consulta.order_by(RenumeracionNombre.id.asc()).all():
        salida.setdefault(fila.sede, {}).setdefault(
            fila.fixture_id, fila.nombre_anterior
        )
    return salida


@dataclass
class RastroDeNombre:
    """Un nombre que la renumeración retiró, y en qué se convirtió."""

    #: El nombre retirado, corto y normalizado: ``IMP-17``.
    nombre: str
    fixture_id: str
    #: Cómo se llama HOY ese mueble, leído del plano —no de la tabla—, o ``None``
    #: si el mueble ya no está en el plano.
    ahora: str | None
    #: Cuándo se aplicó la renumeración que retiró ese nombre.
    cuando: datetime | None


class Rastreador:
    """El registro de renumeraciones, leído UNA vez por planilla.

    Una planilla trae hasta trescientas filas y cada fila que no resuelve
    pregunta lo mismo: «¿este nombre lo retiró una renumeración?». Con una
    consulta por fila serían seiscientas, que es exactamente lo que
    ``PlanoIndexado`` existe para no hacer. Se lee todo la primera vez que hace
    falta —una planilla sin errores no paga nada— y de ahí en adelante se
    contesta de memoria.
    """

    def __init__(self, db: Session):
        self._db = db
        self._filas: dict[str, list[RenumeracionNombre]] | None = None
        self._planos: dict[str, dict[str, str]] | None = None

    def _de_sede(self, sede: str) -> list[RenumeracionNombre]:
        """Las filas de esa sede, en orden. La sede se compara normalizada, como
        en ``PlanoIndexado``: acá «Nave» y «NAVE» son la misma tienda."""
        if self._filas is None:
            agrupadas: dict[str, list[RenumeracionNombre]] = defaultdict(list)
            for fila in (
                self._db.query(RenumeracionNombre)
                .order_by(RenumeracionNombre.id.asc())
                .all()
            ):
                agrupadas[normalizar(fila.sede)].append(fila)
            self._filas = agrupadas
        return self._filas.get(normalizar(sede), [])

    def _plano(self, sede: str) -> dict[str, str]:
        """``{id del mueble: cómo se llama HOY}``, del plano guardado.

        Sólo se lee cuando alguna fila encontró rastro, que es lo raro: una
        planilla que resuelve entera no llega nunca hasta acá.
        """
        if self._planos is None:
            self._planos = {
                normalizar(snap.sede): {
                    str(f.get("id") or ""): normalizar(f.get("code"))
                    for f in _fixtures_de(snap)
                    if str(f.get("id") or "")
                }
                for snap in self._db.query(LayoutSnapshot).all()
            }
        return self._planos.get(normalizar(sede), {})

    def rastro(self, sede: str, texto: str) -> list[RastroDeNombre]:
        """Qué muebles se llamaron así en esta sede, y cómo se llaman ahora.

        Se busca por los DOS nombres viejos —el código y el que el plano
        dibujaba—, porque una planilla vieja puede traer cualquiera de los dos:
        el de la base o el del cartel. Acepta el código completo
        (``CIUDAD JARDIN-IMP-17``), el corto (``IMP-17``) y la cara B.

        El «ahora» sale del **plano de hoy**, siguiendo al mueble por su
        ``fixture_id``, y no de la última fila de la tabla. Así la respuesta
        sigue siendo cierta cuando el mueble se renumeró dos veces o cuando
        alguien lo renombró a mano después, y dice la verdad —«ya no está en el
        plano»— cuando el mueble se borró.
        """
        buscado, _ = _base_y_cara(normalizar(texto))
        if not buscado:
            return []
        corto = _corto(buscado, sede)
        completo = _full_code(corto, sede) if corto else ""

        candidatos: dict[str, RenumeracionNombre] = {}
        for fila in self._de_sede(sede):
            vistos = {
                normalizar(fila.nombre_anterior),
                normalizar(fila.codigo_anterior),
                _corto(fila.codigo_anterior or "", sede),
            }
            if buscado in vistos or corto in vistos or completo in vistos:
                candidatos.setdefault(fila.fixture_id, fila)
        if not candidatos:
            return []

        hoy = self._plano(sede)
        return [
            RastroDeNombre(
                nombre=corto or buscado,
                fixture_id=ident,
                ahora=hoy.get(ident) or None,
                cuando=fila.aplicado_en,
            )
            for ident, fila in candidatos.items()
        ]

    def pista(self, sede: str, texto: str) -> str | None:
        """La frase para el rechazo. Ver ``pista_de_renumeracion``."""
        return _frase_de_pista(self.rastro(sede, texto))


def rastro_de_nombre(db: Session, sede: str, texto: str) -> list[RastroDeNombre]:
    """Ver ``Rastreador.rastro``. Para una sola pregunta suelta."""
    return Rastreador(db).rastro(sede, texto)


_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def _fecha_larga(cuando) -> str:
    """``9 de septiembre de 2026``. Sin librerías: el locale del servidor no está
    puesto en castellano y no se va a poner por una frase."""
    try:
        return f"{cuando.day} de {_MESES[cuando.month - 1]} de {cuando.year}"
    except (AttributeError, IndexError, TypeError):
        return ""


def pista_de_renumeracion(db: Session, sede: str, texto: str) -> str | None:
    """«Ese plano se renumeró el <fecha>; «IMP-17» ahora se llama «IMP-09»».

    El servidor SABE en qué se convirtió un nombre que retiró. Decir sólo «no
    hay ningún mueble con ese código» es cierto y es seco: después de renumerar,
    **cada planilla vieja de la casa** va a dar ese mensaje, y sin esta línea
    nadie tiene por qué adivinar por qué.

    Es una PISTA y no una resolución: la fila sigue en error y sigue sin
    entrar. Adivinar el mueble es exactamente el error que la fase 13 eliminó —
    quien mande la planilla tiene que escribir el nombre de hoy a propósito.

    Para una planilla entera se usa ``Rastreador``, que lee el registro una sola
    vez; esto es el atajo de una pregunta suelta.
    """
    return _frase_de_pista(rastro_de_nombre(db, sede, texto))


def _frase_de_pista(rastros: list[RastroDeNombre]) -> str | None:
    if not rastros:
        return None

    fechas = {_fecha_larga(r.cuando) for r in rastros if _fecha_larga(r.cuando)}
    cuando = f"el {fechas.pop()}" if len(fechas) == 1 else "en una renumeración anterior"
    nombre = rastros[0].nombre

    vivos = sorted({r.ahora for r in rastros if r.ahora})
    if len(rastros) == 1 and not vivos:
        return (
            f"Ese plano se renumeró {cuando}: «{nombre}» era el nombre de un mueble "
            "que ya no está en el plano."
        )
    if len(vivos) == 1 and len(rastros) == 1:
        return f"Ese plano se renumeró {cuando}: «{nombre}» ahora se llama «{vivos[0]}»."
    if vivos:
        # Más de un mueble se llamó así —un plano que ya tenía el nombre
        # repetido— y no hay una sola respuesta. Se dicen las dos: elegir por
        # ellos sería mandar el contrato al mueble equivocado, otra vez.
        lista = _y([f"«{n}»" for n in vivos])
        # La cuenta que se dice es la de los que SIGUEN en el plano, no la de
        # los rastros: si el nombre lo llevaban dos muebles y uno se borró
        # después de renumerar, decir «lo llevaban 2 muebles, que ahora se
        # llaman «IMP-03»» se lee como un error de la aplicación. Los que ya no
        # están se cuentan aparte, que es la verdad y además es un dato útil.
        idos = len(rastros) - len(vivos)
        frase = (
            f"Ese plano se renumeró {cuando}: «{nombre}» lo llevaban "
            f"{len(vivos)} muebles, que ahora se llaman {lista}"
            if len(vivos) > 1
            else f"Ese plano se renumeró {cuando}: «{nombre}» lo llevaba el mueble "
            f"que ahora se llama {lista}"
        )
        if idos > 0:
            frase += (
                f", y otro más que ya no está en el plano" if idos == 1
                else f", y otros {idos} que ya no están en el plano"
            )
        return frase + ". Escribí el que corresponda."
    return (
        f"Ese plano se renumeró {cuando}: «{nombre}» era el nombre de muebles que "
        "ya no están en el plano."
    )


# ─── El informe, que es lo que el dueño imprime ───────────────────────────────


def informe_texto(plan: PlanSede) -> str:
    """El antes → después de una sede, en texto plano y listo para imprimir.

    Va en texto y no en una tabla del navegador porque es lo que se lleva a la
    tienda: se imprime, se camina el local y se tacha. Sin este papel, renumerar
    deja el plano y la cartelería hablando idiomas distintos.
    """
    eje = plan.eje_recorrido.upper()
    banda = plan.eje_bandas.upper()
    lineas = [
        f"RENUMERACIÓN · {plan.sede}",
        "",
        f"Recorrido: {plan.bandas} bandas sobre {banda}, y dentro de cada banda "
        f"de menor a mayor {eje}.",
        f"Eje elegido: {plan.motivo_eje}.",
        f"{plan.muebles} muebles · {plan.cambian} cambian de nombre · "
        f"0 se agregan · 0 se borran.",
        "",
        f"{'BANDA':>5}  {'ANTES':<14} {'SE LEÍA':<14} {'AHORA':<14} "
        f"{'X':>7} {'Z':>7}  MUEBLE",
        "-" * 86,
    ]
    for f in plan.filas:
        marca = "" if f.cambia else "  (igual)"
        lineas.append(
            f"{f.banda:>5}  {f.antes:<14} {f.se_leia:<14} {f.ahora:<14} "
            f"{f.cx:>7.2f} {f.cz:>7.2f}  {f.etiqueta or f.tipo}{marca}"
        )

    if plan.espacios:
        lineas += ["", f"ESPACIOS QUE SE MUDAN CON SU MUEBLE ({len(plan.espacios)})", "-" * 86]
        for e in plan.espacios:
            contratos = f" · {e.contratos} contrato(s) vigente(s)" if e.contratos else ""
            lineas.append(f"  {e.antes}  →  {e.ahora}{contratos}")
    if plan.montajes:
        lineas += ["", f"Confirmaciones de montaje que se mudan: {plan.montajes}."]
    if plan.nomenclaturas_borradas:
        lineas += [
            "",
            f"Se descartan {plan.nomenclaturas_borradas} nombres escritos a mano: "
            "el nombre del mueble pasa a ser su código, y hay uno solo.",
        ]
    for aviso in plan.avisos:
        lineas += ["", f"AVISO: {aviso}"]
    return "\n".join(lineas)


def planificar(db: Session, sedes: list[str] | None = None) -> list[PlanSede]:
    """El plan de cada sede. Sin ``sedes``, TODAS: el dueño pidió parejo.

    «En todas las sedes, parejo» fue una decisión suya, no una comodidad: se
    normaliza el plano completo aunque hoy no tenga conflicto, para que la
    numeración quede con la misma lógica en todas y caminar cualquiera de las
    tiendas se lea igual.
    """
    if sedes is None:
        objetivo = [s.sede for s in db.query(LayoutSnapshot).all()]
    else:
        objetivo = [s for s in sedes if s]
    return [planificar_sede(db, sede) for sede in sorted(set(objetivo))]
