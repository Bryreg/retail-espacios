"""Red team de la Fase 6 — Asesoría: el spread canon/tarifa y ``/adopcion``.

Sucesor directo de ``tests/test_metricas_ataques.py`` (Fase 4) y
``tests/test_tendencia_ataques.py`` (Fase 5). Misma disciplina y el mismo
compromiso: **acá no se arregla código de producción**. Un defecto encontrado
se fija con un test que lo demuestra —``xfail(strict=True)`` afirmando el
comportamiento SEGURO que hoy no se cumple— y se cuenta en
``features/asesoria/outputs/frontera-asesoria.md``.

La Fase 6 mete DOS datos nuevos del otro lado de la frontera del operador, y
los dos son exactamente la clase de cosa que hay que atacar por los bordes:

1. **La tarifa de referencia del supermercado** (``layout_reference_rates``,
   hoy admin-only) entra al cálculo de ``/metricas``. La spec es taxativa: lo
   único que cruza es la RELACIÓN (``spread_pct``); ni la tarifa, ni ``Σ
   tarifa``, ni ningún absoluto derivado. Se ataca sembrando montos de tarifa
   IRREPETIBLES y buscándolos —y a sus múltiplos y sumas— en cada hoja del
   JSON, y despejando la tarifa desde los agregados que sí se publican.
2. **La adopción** (``GET /api/plataforma/adopcion``) lee el REGISTRO entero:
   ``usuarios``, ``membresias``, ``fundaciones``, ``estados_cliente``. Ahí
   viven los correos, los nombres y los ids de las personas. El peor bug
   posible de esta fase no es un 500: es **un correo, un nombre, un id de
   usuario o una fecha de acceso con hora colándose en el JSON de adopción**.

Seis frentes:

* **A. La tarifa no sale** (a1-a4, a16-a18) — hojas, claves, K=3 y despeje.
* **B. Adopción no lleva personas** (a5, a6) — lista blanca, arroba, ids,
  fechas sin hora.
* **C. La puerta** (a7, a11) — autorización de ``/adopcion`` y el token de
  consola contra ``GET /api/layout/rates``, la otra puerta a la tarifa.
* **D. La constancia** (a8) — bitácora.
* **E. La forma del endpoint** (a9, a10) — orden de rutas, variantes de la
  URL, métodos de escritura y no-escritura.
* **F. Fugas laterales y estado** (a12-a14, a19) — base rota, suspendido,
  PATCH de estado y el caché compartido con ``/metricas``.
* **G. La política de datos** (a15).

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.

Los recorredores del JSON (``_hojas``/``_claves``/``_textos``/``_numeros``) y
el andamiaje de identidades se IMPORTAN de ``tests/test_metricas_ataques.py``
en vez de copiarse: si el modelo de ataque de la Fase 4 mejora, esta suite
mejora con él.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone

import pytest

from tests.test_metricas_ataques import (
    ERROR_FIJO,
    Identidades,
    _cab,
    _claves,
    _consola,
    _estado,
    _foto_de,
    _fundar,
    _hojas,
    _numeros,
    _romper,
    _sembrar_negocio,
    _textos,
)
from conftest import CLAVE_ADMIN

PERIODO = "2026-09"
NO_OPERADOR = "Solo para operadores de la plataforma."

CORREO_OPERADOR = "op@recabra.example"
CORREO_OPERADOR_2 = "segunda.operadora@recabra.example"
CORREO_DUENA = "duena.acme@correo-personal.example"


# ════════════════════════════════════════════════════════════════════════════
# LAS TARIFAS JUGOSAS
# ════════════════════════════════════════════════════════════════════════════
#
# Montos IRREPETIBLES y de siete dígitos: si alguno apareciera como subcadena
# del cuerpo serializado sería porque se filtró, no porque una cuenta dio justo
# ese número. Se buscan ellos, sus múltiplos hasta 6 (el nº de contratos
# sembrados) y las sumas por cliente.

T_DEFAULT_GONDOLA = 1_234_567
T_NAVE_GONDOLA = 7_654_321
T_DEFAULT_PUNTA = 2_468_013
TARIFAS_UNITARIAS = (T_DEFAULT_GONDOLA, T_NAVE_GONDOLA, T_DEFAULT_PUNTA)

RATES_ACME = {
    "default": {"gondola": T_DEFAULT_GONDOLA, "punta": T_DEFAULT_PUNTA},
    "by_sede": {"NAVE": {"gondola": T_NAVE_GONDOLA}},
}

# Canones distintos de las tarifas y entre sí, y chicos frente a ellas: el
# supermercado cobra MUY por debajo de su propia tarifa (spread negativo).
C1, C2, C3, C4 = 100_003.0, 200_003.0, 300_007.0, 500_009.0
C5, C6 = 700_001.0, 1_300_021.0

_NAVE = [
    {"code": "PUN-01", "type": "punta", "sede": "NAVE"},
    {"code": "GON-01", "type": "gondola", "gondolaType": "double", "sede": "NAVE",
     "faceB": {"supplierName": "", "negotiatedValue": 0}},
    {"code": "GON-02", "type": "gondola", "gondolaType": "wall", "sede": "NAVE"},
]
_SUR = [{"code": "PUN-01", "type": "punta", "sede": "SUR"}]
_BETA = [{"code": f"E-0{i}", "type": "punta", "sede": "BETA"} for i in (1, 2)]

# (código, proveedor, desde, hasta, canon, activo)
_CONTRATOS_ACME = [
    ("NAVE-PUN-01", "Alpina", "2026-09-01", "2026-09-30", C1, True),
    ("NAVE-GON-01", "Alpina", "2026-09-01", "2026-09-30", C2, True),
    ("NAVE-GON-01-B", "Nutresa", "2026-09-01", "2026-09-30", C3, True),
    ("SUR-PUN-01", "Bimbo", "2026-09-01", "2026-09-30", C4, True),
]
_CONTRATOS_BETA = [
    ("BETA-E-01", "Nutresa", "2026-09-01", "2026-09-30", C5, True),
    ("BETA-E-02", "Alpina", "2026-09-01", "2026-09-30", C6, True),
]

# Σ tarifa de acme, hecha a mano: NAVE-PUN-01 cae en la default de `punta`
# (la sede NAVE sólo tiene tarifa de góndola), las dos caras de la góndola
# doble usan la de la SEDE, y SUR-PUN-01 la default de `punta`.
SUMA_TARIFA_ACME = T_DEFAULT_PUNTA + T_NAVE_GONDOLA + T_NAVE_GONDOLA + T_DEFAULT_PUNTA

# Contratos de LARGO ALIENTO para los tests de adopción: tienen que estar
# activos en el mes calendario en curso, sea cual sea el día en que se corra
# la suite (`/adopcion` no acepta período: siempre es hoy).
_SIEMPRE = ("2020-01-01", "2035-12-31")


def _largos(pares):
    return [(codigo, prov, _SIEMPRE[0], _SIEMPRE[1], canon, True) for codigo, prov, canon in pares]


# ── Personas sembradas: lo que la adopción NO puede dejar salir ──────────────
ID_USUARIO_ALTO = 987_654_321
NOMBRE_USUARIO = "Zutano Improbable"
CORREO_USUARIO = "zutano.improbable@ejemplo.test"
UID_USUARIO = "firebase-uid-zutano-improbable"

MOTIVO_ESTADO = "Factura 0001-4517 impaga; contacto duena.acme@correo-personal.example"

# Claves que la adopción no puede tener en NINGÚN nivel.
CLAVES_PROHIBIDAS_ADOPCION = {
    "ultimo_login", "ultimo_acceso", "email", "correo", "firebase_uid",
    "usuario_id", "usuarios", "motivo", "contratos_activos", "cambiado_por",
    "nombre_usuario", "ids", "logins",
}

# Claves que `/metricas` no puede tener en NINGÚN nivel (Fase 6).
CLAVES_PROHIBIDAS_METRICAS = {
    "rates", "referencia", "tarifa_referencia", "by_sede", "default",
    "tarifa_total", "canon_con_tarifa", "contratos_con_tarifa", "spread_abs",
    "tarifa", "tarifas", "tarifa_promedio",
}
# Las ÚNICAS claves de `/metricas` a las que se les permite la subcadena
# "tarifa": las tres taxativas de la spec.
CLAVES_CON_TARIFA_PERMITIDAS = {
    "tarifa_configurada", "contratos_sin_tarifa", "clientes_con_tarifa",
}

# La lista blanca EXACTA de `/adopcion` (contrato del Maestro).
AD_RAIZ = {"periodo", "generado_en", "cohortes", "clientes"}
AD_COHORTE = {"cohorte", "clientes", "retencion_30d_pct",
              "nueva", "activa", "fantasma", "dormida", "sin_cuentas"}
AD_CLIENTE = {"slug", "nombre", "estado_cuenta", "error", "cohorte", "clasificacion",
              "usuarios_con_cuenta", "usuarios_activos_30d", "dias_sin_acceso",
              "con_contratos_activos"}
AD_CLASIFICACIONES = {"nueva", "activa", "fantasma", "dormida", "sin_cuentas"}
# Las únicas rutas del JSON de adopción donde se admite un string.
AD_RUTAS_DE_TEXTO = re.compile(
    r"^\$\.(periodo|generado_en)$"
    r"|^\$\.cohortes\[\d+\]\.cohorte$"
    r"|^\$\.clientes\[\d+\]\.(slug|nombre|estado_cuenta|error|cohorte|clasificacion)$"
)
_ISO_CON_HORA = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE PROPIO
# ════════════════════════════════════════════════════════════════════════════

def _tarifas(slug, rates: dict):
    """Escribe la tarifa de referencia en la base DEL CLIENTE, por el mismo
    camino que ``PUT /api/layout/rates`` (``set_config`` + ``RATES_KEY``)."""
    from app.auth import set_config
    from app.clientes import buscar, sesion_de
    from app.routers.layout import RATES_KEY

    cliente = buscar(slug)
    assert cliente is not None, slug
    db = sesion_de(cliente)
    try:
        set_config(db, RATES_KEY, json.dumps(rates))
        db.commit()
    finally:
        db.close()


def _usuario_crudo(slug, *, usuario_id=ID_USUARIO_ALTO, email=CORREO_USUARIO,
                   nombre=NOMBRE_USUARIO, uid=UID_USUARIO, dias_desde_login=None):
    """Un usuario con id ALTO y datos jugosos, con membresía activa en ``slug``.

    Se escribe directo en el registro (no por el alta, que asigna ids
    correlativos desde 1): un id alto e irrepetible es la única forma de
    distinguir "el JSON filtró un id" de "un conteo dio 3 por casualidad".
    """
    from app.clientes import sesion_registro
    from app.models.identidad import Membresia, Usuario

    ultimo = None
    if dias_desde_login is not None:
        ultimo = datetime.now(timezone.utc) - timedelta(days=dias_desde_login)

    reg = sesion_registro()
    try:
        reg.add(Usuario(id=usuario_id, firebase_uid=uid, email=email, nombre=nombre,
                        creado_en=datetime.now(timezone.utc), ultimo_login=ultimo))
        reg.flush()
        reg.add(Membresia(usuario_id=usuario_id, cliente_slug=slug, rol="admin", activo=True))
        reg.commit()
    finally:
        reg.close()
    return usuario_id


def _login_hace(email, dias):
    """Mueve el ``ultimo_login`` de un usuario ya existente (el que creó el alta)."""
    from app.clientes import sesion_registro
    from app.models.identidad import Usuario

    reg = sesion_registro()
    try:
        u = reg.query(Usuario).filter(Usuario.email == email).first()
        assert u is not None, email
        u.ultimo_login = (datetime.now(timezone.utc) - timedelta(days=dias)) if dias is not None else None
        reg.commit()
    finally:
        reg.close()


def _alta_hace(slug, dias):
    """Antigua la fecha de alta de un cliente: la ``Fundacion`` (la fuente de la
    cohorte) y el ``ClienteRow.creado`` de respaldo.

    Sin esto TODO cliente recién fundado por el alta self-service clasifica
    ``nueva`` —alta hace menos de 30 días— y los demás estados no se pueden
    probar: la clasificación mira el alta ANTES que el acceso.
    """
    from app.clientes import sesion_registro
    from app.models.models import ClienteRow
    from app.models.plataforma import Fundacion

    cuando = datetime.now(timezone.utc) - timedelta(days=dias)
    reg = sesion_registro()
    try:
        for f in reg.query(Fundacion).filter(Fundacion.cliente_slug == slug).all():
            f.creado_en = cuando
        fila = reg.query(ClienteRow).filter(ClienteRow.slug == slug).first()
        if fila is not None:
            fila.creado = cuando
        reg.commit()
    finally:
        reg.close()


def _periodo_actual():
    from app.plataforma_metricas import periodo_actual

    return periodo_actual()


def _limpiar():
    from app.plataforma_metricas import limpiar_cache_metricas

    limpiar_cache_metricas()


def _metricas(client, cab, periodo=PERIODO):
    r = client.get(f"/api/plataforma/metricas?periodo={periodo}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _adopcion(client, cab):
    r = client.get("/api/plataforma/adopcion", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _fila(cuerpo, slug):
    return next(c for c in cuerpo["clientes"] if c["slug"] == slug)


def _escenario_tarifas(client, monkeypatch):
    """acme (con tarifas jugosas) + beta (sin tarifa) + operador."""
    ids = Identidades(client)
    _fundar(ids, "uid-acme", CORREO_DUENA, "acme", "Acme Supermercados")
    _fundar(ids, "uid-beta", "dueno.beta@otro.example", "beta", "Beta Market")
    _sembrar_negocio("acme", {"NAVE": _NAVE, "SUR": _SUR}, _CONTRATOS_ACME)
    _sembrar_negocio("beta", {"BETA": _BETA}, _CONTRATOS_BETA)
    _tarifas("acme", RATES_ACME)
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()
    return ids, _cab(consola["token"]), consola


def _escenario_adopcion(client, monkeypatch, *, con_roto=True):
    """El campo de batalla de la adopción, con las cuatro clasificaciones.

    * ``fantasma``  — contratos vigentes y nadie entró en 45 días.
    * ``activa``    — alguien entró hace 3 días.
    * ``dormida``   — sin contratos y sin acceso.
    * ``sin_cuentas`` — el cliente roto, al que se le quitan las membresías.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-fant", "duena.fantasma@correo.example", "fantasma", "Fantasma S.A.")
    _fundar(ids, "uid-act", "dueno.activo@correo.example", "activo", "Activo S.A.")
    _fundar(ids, "uid-dor", "duena.dormida@correo.example", "dormida", "Dormida S.A.")

    _sembrar_negocio("fantasma", {"F": [{"code": "E-01", "type": "punta", "sede": "F"}]},
                     _largos([("F-E-01", "Alpina", 111_119.0)]))
    _sembrar_negocio("activo", {"A": [{"code": "E-01", "type": "punta", "sede": "A"}]},
                     _largos([("A-E-01", "Nutresa", 222_227.0)]))

    # El usuario jugoso vive en el fantasma y entró hace 45 días.
    _usuario_crudo("fantasma", dias_desde_login=45)
    _login_hace("duena.fantasma@correo.example", 45)
    _login_hace("dueno.activo@correo.example", 3)
    _login_hace("duena.dormida@correo.example", None)

    # Las altas se antiguan: `nueva` gana a todo lo demás durante 30 días.
    _alta_hace("fantasma", 400)     # cohorte vieja
    _alta_hace("activo", 400)
    _alta_hace("dormida", 200)

    _estado("fantasma", "suspendido", MOTIVO_ESTADO)
    if con_roto:
        _romper()

    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()
    return ids, _cab(consola["token"]), consola


def _prohibidos_numericos():
    """Los dígitos que NO pueden estar en el cuerpo: cada tarifa, sus múltiplos
    hasta 6 (los contratos sembrados) y la Σ de acme."""
    valores = set()
    for t in TARIFAS_UNITARIAS:
        for n in range(1, 7):
            valores.add(t * n)
    valores.add(SUMA_TARIFA_ACME)
    return valores


def _contiene_alguno(crudo: str, valores) -> list:
    return [v for v in sorted(valores) if str(v) in crudo or f"{float(v):.1f}" in crudo]


# ════════════════════════════════════════════════════════════════════════════
# A. LA TARIFA NO SALE
# ════════════════════════════════════════════════════════════════════════════

def test_a1_ningun_monto_de_tarifa_ni_derivado_aparece_en_ningun_endpoint(client, monkeypatch):
    """a1 — La invariante central de la fase, sobre los TRES endpoints.

    Se siembran tarifas de siete dígitos irrepetibles (default góndola
    1.234.567, NAVE góndola 7.654.321, default punta 2.468.013) y contratos a
    montos completamente distintos. Ni la tarifa, ni ``tarifa × n``, ni la
    ``Σ tarifa`` pueden aparecer: ni como hoja numérica, ni como subcadena del
    cuerpo serializado (que atrapa también el número escondido adentro de un
    string compuesto).

    Y se ataca el despeje evidente: ``ingreso / (1 + spread/100)`` reconstruye
    una Σ de tarifas; se exige que ese valor no coincida con ninguna tarifa
    UNITARIA sembrada (que sería el dato individual del supermercado).
    """
    _ids, cab, _ = _escenario_tarifas(client, monkeypatch)

    cuerpos = {
        "/metricas": _metricas(client, cab),
        "/adopcion": _adopcion(client, cab),
    }
    r = client.get("/api/plataforma/tendencia", headers=cab)
    assert r.status_code == 200, r.text
    cuerpos["/tendencia"] = r.json()

    prohibidos = _prohibidos_numericos()
    for nombre, cuerpo in cuerpos.items():
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        filtrados = _contiene_alguno(crudo, prohibidos)
        assert filtrados == [], f"{nombre} lleva un valor de tarifa: {filtrados}"
        sueltos = [(ruta, v) for ruta, v in _numeros(cuerpo) if float(v) in prohibidos]
        assert sueltos == [], f"{nombre}: hojas numéricas con valor de tarifa: {sueltos}"

    # El despeje: la tarifa UNITARIA no se cae de la relación publicada.
    cuerpo = cuerpos["/metricas"]
    acme = _fila(cuerpo, "acme")["metricas"]
    assert acme["spread_pct"] is not None, "el escenario tiene que publicar spread"
    despejado = acme["ingreso_contratado_mes"] / (1 + acme["spread_pct"] / 100.0)
    for t in TARIFAS_UNITARIAS:
        assert abs(despejado - t) > 1.0, f"ingreso/(1+spread) reconstruye la tarifa {t}"


def test_a2_lista_blanca_y_negra_de_claves_de_metricas(client, monkeypatch):
    """a2 — El contrato del Maestro, exacto, con los campos nuevos de la fase.

    Lista blanca: cada objeto tiene EXACTAMENTE sus claves —``spread_pct``,
    ``tarifa_configurada`` y ``contratos_sin_tarifa`` por cliente;
    ``spread_pct`` y ``clientes_con_tarifa`` en el consolidado— y nada más.

    Lista negra, por si la blanca se relaja algún día: ninguna clave que
    contenga "tarifa" salvo las tres taxativas, y ninguna de las claves
    internas del cálculo (``tarifa_total``, ``canon_con_tarifa``,
    ``contratos_con_tarifa``, ``by_sede``, ``default``, ``rates``).
    """
    from tests.test_metricas_ataques import _validar_contrato

    _ids, cab, _ = _escenario_tarifas(client, monkeypatch)
    cuerpo = _metricas(client, cab)

    assert _validar_contrato(cuerpo) == []

    todas = set()
    for _ruta, claves in _claves(cuerpo):
        todas |= claves
    prohibidas = todas & CLAVES_PROHIBIDAS_METRICAS
    assert prohibidas == set(), f"claves internas del cálculo en el JSON: {sorted(prohibidas)}"

    con_tarifa = {k for k in todas if "tarifa" in k.lower()}
    assert con_tarifa <= CLAVES_CON_TARIFA_PERMITIDAS, (
        f"claves de tarifa fuera de la lista taxativa: {sorted(con_tarifa)}"
    )

    # Y los tipos del contrato, hoja por hoja.
    acme = _fila(cuerpo, "acme")["metricas"]
    assert isinstance(acme["spread_pct"], float)
    assert acme["tarifa_configurada"] is True
    assert isinstance(acme["contratos_sin_tarifa"], int)
    beta = _fila(cuerpo, "beta")["metricas"]
    assert beta["spread_pct"] is None and beta["tarifa_configurada"] is False
    assert isinstance(cuerpo["consolidado"]["clientes_con_tarifa"], int)


def test_a3_k3_del_spread_no_deja_despejar_la_tarifa(client, monkeypatch):
    """a3 — La supresión de celda chica, atacada por sus tres bordes.

    Con DOS contratos con tarifa el spread y el canon promedio publicado
    despejarían la tarifa individual; con UNO, la despejarían exactamente. Los
    dos casos tienen que dar ``null``. Y el consolidado, que suma sobre todos
    los clientes legibles, tiene que aplicar la MISMA regla sobre su propia Σ
    de contratos con tarifa: con menos de tres en toda la plataforma, ``null``.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-dos", "d@dos.example", "dos", "Dos Contratos")
    _sembrar_negocio(
        "dos",
        {"D": [{"code": f"E-0{i}", "type": "punta", "sede": "D"} for i in (1, 2)]},
        [("D-E-01", "Alpina", "2026-09-01", "2026-09-30", 900_000.0, True),
         ("D-E-02", "Alpina", "2026-09-01", "2026-09-30", 900_000.0, True)],
    )
    _tarifas("dos", {"default": {"punta": 1_000_000}, "by_sede": {}})
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()
    cab = _cab(consola["token"])

    cuerpo = _metricas(client, cab)
    dos = _fila(cuerpo, "dos")["metricas"]
    assert dos["spread_pct"] is None, "con 2 contratos con tarifa el spread se publicó"
    assert dos["tarifa_configurada"] is True
    # El consolidado tiene Σ = 2 contratos con tarifa: también por debajo de K.
    assert cuerpo["consolidado"]["spread_pct"] is None, (
        "el consolidado publicó un spread con menos de 3 contratos con tarifa"
    )
    assert cuerpo["consolidado"]["clientes_con_tarifa"] == 1

    # Y con UNO: el caso donde el despeje sería exacto.
    from app.clientes import buscar, sesion_de
    from app.models.models import SpaceLease

    cliente = buscar("dos")
    db = sesion_de(cliente)
    try:
        fila = db.query(SpaceLease).order_by(SpaceLease.id.desc()).first()
        fila.is_active = False
        db.commit()
    finally:
        db.close()
    _limpiar()

    cuerpo = _metricas(client, cab)
    uno = _fila(cuerpo, "dos")["metricas"]
    assert uno["spread_pct"] is None, "con 1 contrato con tarifa el spread se publicó"
    assert cuerpo["consolidado"]["spread_pct"] is None


def test_a4_tarifa_configurada_sin_contratos_aplicables_no_revela_nada_mas(client, monkeypatch):
    """a4 — El estado intermedio: hay tarifa, pero no aplica a ningún contrato.

    El supermercado configuró tarifa de góndola y todos sus contratos son de
    punta. La spec: esos contratos **no entran en la cuenta** y se reportan en
    ``contratos_sin_tarifa``. Lo que sale tiene que ser exactamente eso —
    ``spread_pct: null`` y ``tarifa_configurada: true``— y nada que permita
    inferir el VALOR de la tarifa configurada.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-sin", "d@sin.example", "sinaplica", "Sin Aplica")
    _sembrar_negocio(
        "sinaplica",
        {"S": [{"code": f"E-0{i}", "type": "punta", "sede": "S"} for i in (1, 2, 3)]},
        [(f"S-E-0{i}", "Alpina", "2026-09-01", "2026-09-30", 100_000.0 + i, True)
         for i in (1, 2, 3)],
    )
    _tarifas("sinaplica", {"default": {"gondola": T_DEFAULT_GONDOLA}, "by_sede": {}})
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()
    cab = _cab(consola["token"])

    cuerpo = _metricas(client, cab)
    m = _fila(cuerpo, "sinaplica")["metricas"]
    assert m["spread_pct"] is None
    assert m["tarifa_configurada"] is True
    assert m["contratos_sin_tarifa"] == 3
    # Ni la tarifa de góndola configurada ni su múltiplo aparecen en ningún lado.
    crudo = json.dumps(cuerpo, ensure_ascii=False)
    assert _contiene_alguno(crudo, {T_DEFAULT_GONDOLA * n for n in range(1, 7)}) == []
    # Y el consolidado tampoco inventa un spread con cero contratos con tarifa.
    assert cuerpo["consolidado"]["spread_pct"] is None
    assert cuerpo["consolidado"]["clientes_con_tarifa"] == 1


# ════════════════════════════════════════════════════════════════════════════
# B. ADOPCIÓN NO LLEVA PERSONAS
# ════════════════════════════════════════════════════════════════════════════

def _validar_contrato_adopcion(cuerpo) -> list[str]:
    """Violaciones de la lista blanca EXACTA de ``/adopcion``. Vacía = legal."""
    malas: list[str] = []

    def exigir(ruta, obtenidas, esperadas):
        if obtenidas != esperadas:
            malas.append(f"{ruta}: de más={sorted(obtenidas - esperadas)} "
                         f"de menos={sorted(esperadas - obtenidas)}")

    exigir("$", set(cuerpo.keys()), AD_RAIZ)
    for i, c in enumerate(cuerpo["cohortes"]):
        exigir(f"$.cohortes[{i}]", set(c.keys()), AD_COHORTE)
    for i, c in enumerate(cuerpo["clientes"]):
        exigir(f"$.clientes[{i}]", set(c.keys()), AD_CLIENTE)
    return malas


def test_a5_lista_blanca_exacta_de_adopcion_en_todos_los_niveles(client, monkeypatch):
    """a5 — Cada objeto de ``/adopcion`` tiene EXACTAMENTE las claves del
    contrato, y cada hoja el TIPO del contrato.

    Ni una clave de más (un dato nuevo que nadie auditó) ni una de menos. Los
    tipos importan tanto como las claves: ``dias_sin_acceso`` es un ENTERO de
    días —no una fecha—, ``con_contratos_activos`` es un BOOLEANO —no el
    conteo de contratos, que no cruza la frontera— y ``clasificacion`` es uno
    de los cinco valores cerrados.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    assert _validar_contrato_adopcion(cuerpo) == []

    assert re.fullmatch(r"\d{4}-\d{2}", cuerpo["periodo"]), cuerpo["periodo"]
    assert cuerpo["periodo"] == _periodo_actual()

    for c in cuerpo["clientes"]:
        assert c["clasificacion"] in AD_CLASIFICACIONES, c
        assert isinstance(c["con_contratos_activos"], bool), c
        assert isinstance(c["usuarios_con_cuenta"], int) and not isinstance(
            c["usuarios_con_cuenta"], bool), c
        assert isinstance(c["usuarios_activos_30d"], int)
        assert c["dias_sin_acceso"] is None or (
            isinstance(c["dias_sin_acceso"], int) and not isinstance(c["dias_sin_acceso"], bool)
        ), c
        assert c["cohorte"] is None or re.fullmatch(r"\d{4}-\d{2}", c["cohorte"]), c
        assert c["error"] in (None, ERROR_FIJO), c

    for k in cuerpo["cohortes"]:
        assert k["cohorte"] is None or re.fullmatch(r"\d{4}-\d{2}", k["cohorte"]), k
        assert isinstance(k["clientes"], int)
        assert k["retencion_30d_pct"] is None or isinstance(k["retencion_30d_pct"], float)
        for clasif in AD_CLASIFICACIONES:
            assert isinstance(k[clasif], int)

    # Los únicos arreglos son `cohortes` y `clientes`.
    from tests.test_metricas_ataques import _arreglos
    rutas = {ruta for ruta, _n in _arreglos(cuerpo)}
    assert rutas == {"$.cohortes", "$.clientes"}, rutas


def test_a6_adopcion_no_deja_salir_a_ninguna_persona(client, monkeypatch):
    """a6 — El peor bug posible de la fase, atacado por sus cinco caminos.

    ``/adopcion`` lee ``usuarios`` y ``membresias``: los correos, los nombres,
    los ids y los ``ultimo_login`` están literalmente en la mano de la
    consulta. Se siembra una persona con nombre y correo irrepetibles y un id
    ALTO (987.654.321, que ningún conteo puede dar por casualidad) y se exige:

    1. Ni una arroba en ningún string del JSON.
    2. Ni el correo, ni el nombre, ni el ``firebase_uid`` sembrados.
    3. Ningún número igual al id del usuario.
    4. Ninguna fecha con hora salvo ``generado_en``.
    5. Ninguna clave prohibida (``ultimo_login``, ``email``, ``usuario_id``,
       ``motivo``, ``contratos_activos``…) en ningún nivel.
    6. Ningún string fuera de las rutas donde el contrato admite texto.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)
    crudo = json.dumps(cuerpo, ensure_ascii=False)

    con_arroba = [(r, v) for r, v in _textos(cuerpo) if "@" in v]
    assert con_arroba == [], f"hay correos en el JSON de adopción: {con_arroba}"

    sentinelas = [CORREO_USUARIO, NOMBRE_USUARIO, UID_USUARIO, MOTIVO_ESTADO,
                  "duena.fantasma@correo.example", "dueno.activo@correo.example",
                  CORREO_OPERADOR]
    filtrados = [s for s in sentinelas if s in crudo]
    assert filtrados == [], f"datos de personas en el JSON de adopción: {filtrados}"
    assert str(ID_USUARIO_ALTO) not in crudo, "el id del usuario aparece en el cuerpo"

    ids_sueltos = [(r, v) for r, v in _numeros(cuerpo) if float(v) == float(ID_USUARIO_ALTO)]
    assert ids_sueltos == [], f"hojas numéricas con el id de un usuario: {ids_sueltos}"

    con_hora = [(r, v) for r, v in _textos(cuerpo)
                if _ISO_CON_HORA.search(v) and r != "$.generado_en"]
    assert con_hora == [], f"fechas con hora fuera de generado_en: {con_hora}"

    todas = set()
    for _ruta, claves in _claves(cuerpo):
        todas |= claves
    prohibidas = todas & CLAVES_PROHIBIDAS_ADOPCION
    assert prohibidas == set(), f"claves prohibidas en adopción: {sorted(prohibidas)}"

    fuera = [r for r, _v in _textos(cuerpo) if not AD_RUTAS_DE_TEXTO.match(r)]
    assert fuera == [], f"strings en rutas que el contrato no admite: {fuera}"

    # Y el dato SÍ está: la lectura sirve para algo (un endpoint roto no es seguro).
    fant = _fila(cuerpo, "fantasma")
    assert fant["clasificacion"] == "fantasma", cuerpo["clientes"]
    assert fant["usuarios_con_cuenta"] == 2 and fant["usuarios_activos_30d"] == 0
    assert fant["dias_sin_acceso"] == 45 and fant["con_contratos_activos"] is True
    assert _fila(cuerpo, "activo")["clasificacion"] == "activa"


# ════════════════════════════════════════════════════════════════════════════
# C. LA PUERTA
# ════════════════════════════════════════════════════════════════════════════

def test_a7_solo_el_operador_entra_a_adopcion(client, admin, monkeypatch):
    """a7 — La frontera del privilegio, atacada por sus cinco bordes.

    Sin token 401; el token del login LEGADO (que no trae correo, así que
    ``require_operador`` no puede convertirlo en operador ni por accidente)
    403; un dueño CON membresías 403; el operador sin membresías 200; y con
    ``OPERADOR_EMAILS`` vacía, 403 para todos —incluido el que era operador
    hace un segundo—.
    """
    ids, cab, _ = _escenario_adopcion(client, monkeypatch, con_roto=False)

    assert client.get("/api/plataforma/adopcion").status_code == 401
    r = client.get("/api/plataforma/adopcion", headers=admin)
    assert r.status_code == 403 and r.json()["detail"] == NO_OPERADOR, r.text

    # El dueño de un cliente: cuenta real, con membresías, pero no operador.
    r = client.post("/api/auth/oauth", json={"id_token": "uid-fant"})
    assert r.status_code == 200, r.text
    duena = _cab(r.json()["token"])
    assert client.get("/api/plataforma/adopcion", headers=duena).status_code == 403

    assert client.get("/api/plataforma/adopcion", headers=cab).status_code == 200

    # Con la variable vacía nadie entra. Al token de la CONSOLA le toca 401 y no
    # 403 —``decode_token`` lo mata antes del router, porque lo único que lo
    # mantenía vivo era ese correo—; cierra de más, que es el lado correcto
    # (matiz ya escrito en m15).
    monkeypatch.setenv("OPERADOR_EMAILS", "")
    for cabecera in (cab, duena, admin):
        assert client.get("/api/plataforma/adopcion",
                          headers=cabecera).status_code in (401, 403)
    assert client.get("/api/plataforma/adopcion", headers=duena).status_code == 403
    assert client.get("/api/plataforma/adopcion", headers=admin).status_code == 403

    # Un correo "casi igual" (el borde de m17) tampoco llega a tener token.
    monkeypatch.setenv("OPERADOR_EMAILS", CORREO_OPERADOR)
    ids.registrar("uid-casi", "evil." + CORREO_OPERADOR)
    r = client.post("/api/auth/oauth", json={"id_token": "uid-casi"})
    assert r.status_code == 403, r.text


def test_a11_el_token_de_consola_no_lee_la_tarifa_por_la_otra_puerta(client, admin, monkeypatch):
    """a11 — La tarifa tiene DOS puertas; la segunda también tiene que estar cerrada.

    ``GET /api/layout/rates`` es admin-only y devuelve la tarifa ENTERA
    (``{default, by_sede}``). Si el token de la consola la abriera, todo el
    trabajo del spread sería decorativo: el operador leería el valor directo.
    La defensa no es un guard en ese endpoint sino ``_cliente_de_la_consola``
    —el slug ``plataforma`` sólo resuelve bajo ``/api/plataforma``—, así que se
    ataca por la cabecera, por ``?token=`` y con el resto de la superficie de
    negocio que toca la tarifa.
    """
    _ids, cab, consola = _escenario_tarifas(client, monkeypatch)
    token = consola["token"]

    for metodo, ruta, cuerpo in (
        ("GET", "/api/layout/rates", None),
        ("PUT", "/api/layout/rates", {"default": {}, "by_sede": {}}),
        ("GET", "/api/layout/NAVE", None),
        ("GET", "/api/dashboard/kpis", None),
        ("GET", "/api/dashboard/spaces", None),
        ("GET", "/api/suppliers/", None),
    ):
        r = client.request(metodo, ruta, json=cuerpo, headers=cab)
        assert r.status_code in (401, 403), f"{metodo} {ruta} -> {r.status_code}: {r.text[:120]}"

    r = client.get(f"/api/layout/rates?token={token}")
    assert r.status_code in (401, 403), r.text

    # Y el admin del CLIENTE sí la ve: la tarifa no desapareció, cambió de lado.
    # (Si esta línea diera 401/403 el test de arriba pasaría por un motivo
    # equivocado — el endpoint roto para todos, no cerrado para la consola.)
    r = client.get("/api/layout/rates", headers=admin)
    assert r.status_code == 200, r.text
    assert {"default", "by_sede"} <= set(r.json()), r.text


# ════════════════════════════════════════════════════════════════════════════
# D. LA CONSTANCIA
# ════════════════════════════════════════════════════════════════════════════

def test_a8_cada_consulta_de_adopcion_deja_una_linea_y_ninguna_lleva_negocio(client, monkeypatch):
    """a8 — La contrapartida de la frontera: una línea por CADA consulta.

    Tres cosas a la vez, porque son la misma promesa por sus tres lados:
    completitud (una fila por GET, con ``accion="adopcion"`` y el período del
    mes en curso), atribución (dos operadores distintos dejan dos filas con SU
    correo cada una — el caché compartido de ``/metricas`` no le puede
    atribuir la segunda consulta al primero) y minimalidad (ninguna columna
    lleva un dato de negocio ni el nombre de un cliente).
    """
    from app.models.plataforma import BitacoraPlataforma

    ids, cab, _ = _escenario_adopcion(client, monkeypatch)
    _consola(ids, monkeypatch, uid="uid-op2", email=CORREO_OPERADOR_2,
             otros=(CORREO_OPERADOR,))
    monkeypatch.setenv("OPERADOR_EMAILS", f"{CORREO_OPERADOR},{CORREO_OPERADOR_2}")
    r = client.post("/api/auth/oauth", json={"id_token": "uid-op2"})
    assert r.status_code == 200, r.text
    cab2 = _cab(r.json()["token"])

    _adopcion(client, cab)     # cálculo real
    _adopcion(client, cab)     # el segundo reusa el caché de contratos y anota igual
    _adopcion(client, cab2)    # otro operador

    from app.clientes import sesion_registro
    reg = sesion_registro()
    try:
        filas = [
            {c.name: getattr(f, c.name) for c in BitacoraPlataforma.__table__.columns}
            for f in reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        ]
    finally:
        reg.close()

    de_adopcion = [f for f in filas if f["accion"] == "adopcion"]
    assert len(de_adopcion) == 3, f"la bitácora no anotó una línea por consulta: {filas}"
    assert [f["email"] for f in de_adopcion] == [
        CORREO_OPERADOR, CORREO_OPERADOR, CORREO_OPERADOR_2]
    for f in de_adopcion:
        assert f["periodo"] == _periodo_actual(), f
        assert isinstance(f["en"], datetime)

    texto = json.dumps(filas, ensure_ascii=False, default=str)
    for dato in (CORREO_USUARIO, NOMBRE_USUARIO, MOTIVO_ESTADO, "fantasma", "activo",
                 "Alpina", "Nutresa"):
        assert dato not in texto, f"la bitácora lleva un dato de negocio: {dato!r}"


# ════════════════════════════════════════════════════════════════════════════
# E. LA FORMA DEL ENDPOINT
# ════════════════════════════════════════════════════════════════════════════

def test_a9_orden_de_rutas_y_variantes_de_la_url(client, monkeypatch):
    """a9 — ``/adopcion`` es LITERAL y va antes que las paramétricas.

    Se comprueba de las dos maneras: el índice en la tabla de rutas real de
    FastAPI (para que el día que alguien agregue ``/{algo}`` la ruta ya esté a
    salvo) y el comportamiento observable. Después se atacan las variantes de
    la URL: la barra final, un ``?periodo=`` que el endpoint NO acepta (el
    período es siempre el actual y el parámetro tiene que ser ignorado, no
    obedecido), el sufijo ``/adopcionx`` y la caja distinta ``/ADOPCION``.
    Ninguna puede servir datos a quien no debe ni cambiar la respuesta del
    operador.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)

    caminos = [getattr(r, "path", "") for r in client.app.routes]
    i_adopcion = caminos.index("/api/plataforma/adopcion")
    parametricas = [i for i, p in enumerate(caminos)
                    if p.startswith("/api/plataforma/") and "{" in p]
    assert parametricas, "no hay rutas paramétricas en el router de plataforma"
    assert i_adopcion < min(parametricas), caminos[i_adopcion:min(parametricas) + 1]

    base = _adopcion(client, cab)

    # El parámetro se IGNORA: el período sigue siendo el mes en curso.
    r = client.get("/api/plataforma/adopcion?periodo=2020-01", headers=cab)
    assert r.status_code == 200, r.text
    assert r.json()["periodo"] == _periodo_actual() == base["periodo"]
    assert r.json()["clientes"] == base["clientes"]

    # Ni la paramétrica se come `/adopcion` ni al revés.
    r = client.patch("/api/plataforma/clientes/adopcion",
                     json={"estado": "suspendido", "motivo": "x"}, headers=cab)
    assert r.status_code == 404, r.text
    r = client.patch("/api/plataforma/supresiones/adopcion", json={"estado": "atendida"},
                     headers=cab)
    assert r.status_code in (404, 422), r.text

    # Variantes que no existen: nunca 200, y nunca datos para un anónimo.
    for ruta in ("/api/plataforma/adopcion/", "/api/plataforma/adopcionx",
                 "/api/plataforma/ADOPCION"):
        r = client.get(ruta, headers=cab)
        assert r.status_code != 200 or r.json() == base, f"{ruta} -> {r.status_code}"
        assert client.get(ruta).status_code in (401, 403, 404, 405, 307), ruta


def test_a10_adopcion_no_acepta_escritura_y_no_escribe_nada(client, monkeypatch):
    """a10 — De lectura, por sus dos lados.

    Los verbos de escritura sobre ``/adopcion`` son 405. Y dos consultas
    seguidas no escriben una sola fila en NINGUNA tabla: ni en las bases de
    negocio (foto completa por el inspector, patrón de m24) ni en el registro,
    salvo ``bitacora_plataforma`` — y ``snapshot_metricas`` sólo si la
    consulta disparó un cálculo real de métricas, que es el caché que
    ``/adopcion`` reusa (m25). Se calienta el caché antes de la foto para que
    lo único que se mueva sea la bitácora.
    """
    from sqlalchemy import inspect, text

    from app.database import engine as motor_registro

    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)

    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        r = client.request(metodo, "/api/plataforma/adopcion", json={}, headers=cab)
        assert r.status_code == 405, f"{metodo} /adopcion -> {r.status_code}"

    _adopcion(client, cab)   # calienta el caché de métricas (y su snapshot)

    def foto_registro():
        tablas = sorted(inspect(motor_registro).get_table_names())
        with motor_registro.connect() as con:
            return {t: con.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar() for t in tablas}

    antes_negocio = {slug: _foto_de(slug) for slug in ("fantasma", "activo")}
    antes_registro = foto_registro()

    _adopcion(client, cab)
    _adopcion(client, cab)

    despues_negocio = {slug: _foto_de(slug) for slug in ("fantasma", "activo")}
    assert despues_negocio == antes_negocio, (
        f"la adopción escribió en una base de negocio: {antes_negocio} -> {despues_negocio}")

    despues_registro = foto_registro()
    crecieron = {t: (antes_registro[t], despues_registro[t])
                 for t in antes_registro if antes_registro[t] != despues_registro[t]}
    assert set(crecieron) <= {"bitacora_plataforma", "snapshot_metricas"}, crecieron
    assert crecieron["bitacora_plataforma"][1] - crecieron["bitacora_plataforma"][0] == 2


# ════════════════════════════════════════════════════════════════════════════
# F. FUGAS LATERALES Y ESTADO
# ════════════════════════════════════════════════════════════════════════════

def test_a12_el_cliente_roto_no_filtra_la_base_ni_el_driver(client, monkeypatch):
    """a12 — El mensaje del driver trae la URL de la base y a veces la clave.

    Un cliente cuya base no se deja leer aparece en ``/adopcion`` con el TEXTO
    FIJO en ``error`` y ``con_contratos_activos: false`` (no se puede saber si
    tiene contratos, y la adopción no puede inventarlo). Se barre la respuesta
    ENTERA contra el nombre de la base, la ruta del archivo, el esquema de
    conexión y las palabras del driver.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    roto = _fila(cuerpo, "roto")
    assert roto["error"] == ERROR_FIJO, roto
    assert roto["con_contratos_activos"] is False, roto
    assert set(roto.keys()) == AD_CLIENTE

    crudo = json.dumps(cuerpo, ensure_ascii=False)
    for veneno in ("recabra_roto", "sqlite", "sqlalchemy", "Traceback", ".db",
                   "OperationalError", "DatabaseError", "file is not a database"):
        assert veneno.lower() not in crudo.lower(), f"la respuesta filtra {veneno!r}"


def test_a13_el_cliente_suspendido_aparece_sin_su_motivo(client, monkeypatch):
    """a13 — El guardrail de la Fase 2 y su límite, en la puerta nueva.

    Un cliente suspendido TIENE que aparecer en la adopción —una cuenta
    cortada por impago es justamente la que hay que poder mirar— con todos sus
    datos de adopción. Lo que no puede aparecer es POR QUÉ está cortado: el
    ``motivo`` es texto libre del operador (acá lleva adentro un correo de
    usuario final) y vive en ``/plataforma/clientes``, no acá.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)
    cuerpo = _adopcion(client, cab)

    fant = _fila(cuerpo, "fantasma")
    assert fant["estado_cuenta"] == "suspendido"
    assert fant["error"] is None
    assert fant["clasificacion"] == "fantasma"
    assert fant["con_contratos_activos"] is True
    assert set(fant.keys()) == AD_CLIENTE          # ni un campo para el motivo
    assert MOTIVO_ESTADO not in json.dumps(cuerpo, ensure_ascii=False)
    assert "impaga" not in json.dumps(cuerpo, ensure_ascii=False).lower()


def test_a14_el_patch_de_estado_se_refleja_en_la_siguiente_adopcion(client, monkeypatch):
    """a14 — La adopción no tiene caché propio: lee el estado en cada consulta.

    Un ``PATCH /plataforma/clientes/{slug}`` limpia el caché de métricas
    (``limpiar_cache_metricas``) e invalida el de estado; la adopción lee
    ``estados_cliente`` de frente. La consulta siguiente tiene que mostrar el
    estado NUEVO — un panel que muestre el estado viejo por cinco minutos hace
    que el operador corte a quien ya pagó.
    """
    _ids, cab, _ = _escenario_adopcion(client, monkeypatch)

    antes = _fila(_adopcion(client, cab), "activo")
    assert antes["estado_cuenta"] == "activo"

    r = client.patch("/api/plataforma/clientes/activo",
                     json={"estado": "suspendido", "motivo": "prueba de caché"}, headers=cab)
    assert r.status_code == 200, r.text

    despues = _fila(_adopcion(client, cab), "activo")
    assert despues["estado_cuenta"] == "suspendido", despues
    assert "prueba de caché" not in json.dumps(despues, ensure_ascii=False)


# ════════════════════════════════════════════════════════════════════════════
# G. LA POLÍTICA DE DATOS
# ════════════════════════════════════════════════════════════════════════════

def test_a15_la_politica_declara_los_campos_nuevos_y_la_copia_es_identica():
    """a15 — Si el JSON del operador gana campos, la política los declara.

    El §5.3 tiene que nombrar las dos lecturas nuevas —la relación
    canon/tarifa de referencia y la lectura de adopción con su clasificación—
    en los mismos términos que los campos de la Fase 4, con la marca
    ``[VALIDAR CON ABOGADO]``, y la copia que sirve la página pública
    (``frontend/src/legal/``) tiene que ser byte-idéntica a la fuente. Lo
    último ya lo exige X-21 de ``test_compliance_ataques.py``; se afirma acá
    también porque el motivo es distinto: allá la página pública no puede
    mentir, acá el campo nuevo no puede quedar sin declarar.
    """
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    politica = raiz / "docs" / "legal" / "politica-datos.md"
    copia = raiz / "frontend" / "src" / "legal" / "politica-datos.md"

    texto = politica.read_text(encoding="utf-8")
    inicio = texto.index("### 5.3")
    seccion = texto[inicio:texto.index("## 6.", inicio)]

    assert "[VALIDAR CON ABOGADO]" in seccion

    bajo = seccion.lower()
    # (i) la relación canon / tarifa de referencia.
    assert "tarifa de referencia" in bajo
    assert "relación" in bajo or "spread" in bajo
    assert "3 contratos" in bajo or "tres contratos" in bajo
    # (ii) la lectura de adopción y su clasificación derivada.
    assert "adopción" in bajo, "el §5.3 no declara la lectura de adopción"
    assert "clasificación" in bajo, "el §5.3 no declara la clasificación derivada"
    assert "membresía activa" in bajo or "membresía" in bajo
    assert "30 días" in bajo
    assert "mes de alta" in bajo
    assert "bitácora" in bajo

    assert politica.read_bytes() == copia.read_bytes(), (
        "la copia del frontend divergió de docs/legal/politica-datos.md")


# ════════════════════════════════════════════════════════════════════════════
# H. HALLAZGOS
# ════════════════════════════════════════════════════════════════════════════
#
# Lo que NO aguantó, con la disciplina del precedente de las Fases 2 y 4:
#
# * `xfail(strict=True)` afirma el comportamiento SEGURO que hoy no se cumple.
#   La suite sigue verde y el hallazgo no se pierde; el día que se tape el
#   agujero el test pasa a XPASS y la suite se pone en rojo.
# * Las CARACTERIZACIONES afirman lo que el sistema hace hoy, porque la
#   conducta se sigue de la spec pero tiene una consecuencia que conviene
#   tener escrita y vigilada.
#
# El detalle, la severidad y el arreglo propuesto están en
# `features/asesoria/outputs/frontera-asesoria.md`.


def _dos_clientes_uno_suprimido(client, monkeypatch):
    """A (3 contratos con tarifa, spread publicado) + B (2, spread SUPRIMIDO).

    Todos los contratos de los dos clientes tienen tarifa aplicable, así que
    ``Σ canon_con_tarifa`` coincide con el ``ingreso_contratado_mes`` que el
    panel publica — la condición que abre el despeje por diferencia.

    Números elegidos para que la aritmética sea exacta y el test no dependa de
    tolerancias: A cobra 900.000 sobre una tarifa de 1.000.000 (spread −10,0),
    B cobra 400.000 sobre 500.000 (spread real −20,0), consolidado −12,5.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-a", "d@a.example", "aaa", "A")
    _fundar(ids, "uid-b", "d@b.example", "bbb", "B")
    _sembrar_negocio(
        "aaa", {"A": [{"code": f"E-0{i}", "type": "punta", "sede": "A"} for i in (1, 2, 3)]},
        [(f"A-E-0{i}", "Alpina", "2026-09-01", "2026-09-30", 900_000.0, True) for i in (1, 2, 3)],
    )
    _sembrar_negocio(
        "bbb", {"B": [{"code": f"E-0{i}", "type": "punta", "sede": "B"} for i in (1, 2)]},
        [(f"B-E-0{i}", "Nutresa", "2026-09-01", "2026-09-30", 400_000.0, True) for i in (1, 2)],
    )
    _tarifas("aaa", {"default": {"punta": 1_000_000}, "by_sede": {}})
    _tarifas("bbb", {"default": {"punta": 500_000}, "by_sede": {}})
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()
    return _cab(consola["token"])


def _despejar_al_cliente_suprimido(cuerpo):
    """La aritmética del atacante. Devuelve ``(Σ tarifa de B, spread de B)``."""
    cons = cuerpo["consolidado"]
    a = _fila(cuerpo, "aaa")["metricas"]
    canon_b = cons["ingreso_contratado_mes"] - a["ingreso_contratado_mes"]
    tarifa_total = cons["ingreso_contratado_mes"] / (1 + cons["spread_pct"] / 100.0)
    tarifa_a = a["ingreso_contratado_mes"] / (1 + a["spread_pct"] / 100.0)
    tarifa_b = tarifa_total - tarifa_a
    return tarifa_b, (canon_b / tarifa_b - 1) * 100.0


def test_a16_caracterizacion_el_consolidado_no_despeja_al_cliente_suprimido(client, monkeypatch):
    """a16 · H-1 (evidencia del arreglo) — El spread suprimido ya no se recupera.

    Antes del cierre de la fase el consolidado sumaba a TODOS los legibles con
    tarifa, suprimidos incluidos, y con dos clientes el operador resolvía:

        Σtarifa_total = ingreso_consolidado / (1 + spread_consolidado)
        Σtarifa_A     = ingreso_A          / (1 + spread_A)
        Σtarifa_B     = Σtarifa_total − Σtarifa_A

    …y obtenía EXACTAMENTE la Σ de tarifas de B (1.000.000) y su spread
    (−20,0), que el JSON había puesto en ``null`` a propósito. Ahora el spread
    consolidado suma sólo a los clientes con spread PUBLICADO: con A solo, el
    consolidado es −10,0 (el de A) y la misma aritmética devuelve basura. El
    ingreso consolidado sigue incluyendo a B (ese sí es "el total del negocio",
    precedente m26 de la Fase 4) — pero sin el spread de B en el total ya no
    hay segunda ecuación.
    """
    cab = _dos_clientes_uno_suprimido(client, monkeypatch)
    cuerpo = _metricas(client, cab)

    b = _fila(cuerpo, "bbb")["metricas"]
    assert b["spread_pct"] is None, "el escenario exige que B esté suprimido"
    assert b["ingreso_contratado_mes"] is None, "y que su plata también lo esté"
    assert cuerpo["consolidado"]["spread_pct"] == -10.0
    assert cuerpo["consolidado"]["ingreso_contratado_mes"] == 3_500_000.0

    tarifa_b, spread_b = _despejar_al_cliente_suprimido(cuerpo)
    assert abs(tarifa_b - 1_000_000) > 50_000, tarifa_b
    assert abs(spread_b - (-20.0)) > 1.0, spread_b


# H-1 (arreglado en el cierre de la fase): el spread consolidado ahora suma
# SÓLO a los clientes cuyo propio spread se publica (≥ K contratos con
# tarifa), así que un cliente suprimido no se despeja por diferencia.
def test_a17_hallazgo_la_suma_de_tarifas_de_un_cliente_suprimido_no_deberia_despejarse(
        client, monkeypatch):
    """a17 · H-1 — El comportamiento SEGURO que hoy no se cumple.

    Si K=3 suprime el spread de un cliente, ese spread no puede quedar
    reconstruible desde el consolidado con un margen mejor que el ruido. Se
    exige que el despeje de a16 NO acierte.
    """
    cab = _dos_clientes_uno_suprimido(client, monkeypatch)
    cuerpo = _metricas(client, cab)
    assert _fila(cuerpo, "bbb")["metricas"]["spread_pct"] is None

    _tarifa_b, spread_b = _despejar_al_cliente_suprimido(cuerpo)
    assert abs(spread_b - (-20.0)) > 1.0, (
        f"el spread suprimido de B se despejó desde el consolidado: {spread_b}")


def test_a18_caracterizacion_con_tres_contratos_homogeneos_la_tarifa_se_estima(
        client, monkeypatch):
    """a18 · H-2 — El residual que la propia spec acepta, medido.

    Con exactamente K=3 contratos, todos del mismo tipo y sede, y
    ``contratos_sin_tarifa == 0``, el ``ingreso_contratado_mes`` publicado ES
    ``Σ canon_con_tarifa``, así que ``ingreso / (3 × (1 + spread/100))``
    devuelve la tarifa UNITARIA del supermercado. El único límite es el
    redondeo del spread a un decimal: el error relativo queda por debajo del
    0,05 %.

    La spec eligió K=3 sabiendo esto ("con 1 o 2 contratos el spread y el canon
    promedio dejan despejar la tarifa") — con 3 también se despeja, sólo que el
    valor despejado es un promedio de tres posiciones idénticas, que es
    exactamente la tarifa. No se marca ``xfail`` porque el arreglo (subir K, o
    redondear el spread a entero) es una decisión de producto, no un bug; queda
    medido y escrito.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-h", "d@h.example", "homo", "Homogéneo")
    _sembrar_negocio(
        "homo", {"H": [{"code": f"E-0{i}", "type": "punta", "sede": "H"} for i in (1, 2, 3)]},
        [(f"H-E-0{i}", "Alpina", "2026-09-01", "2026-09-30", 900_000.0, True) for i in (1, 2, 3)],
    )
    _tarifas("homo", {"default": {"punta": 1_000_000}, "by_sede": {}})
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar()

    cuerpo = _metricas(client, _cab(consola["token"]))
    m = _fila(cuerpo, "homo")["metricas"]
    assert m["contratos_sin_tarifa"] == 0 and m["spread_pct"] == -10.0

    estimada = m["ingreso_contratado_mes"] / (3 * (1 + m["spread_pct"] / 100.0))
    assert abs(estimada - 1_000_000) / 1_000_000 < 0.0005, estimada


# H-3 (arreglado en el cierre de la fase): el mapa de contratos guarda `None`
# para las bases que se intentaron leer y no se pudo; un slug AUSENTE es un
# cliente que nació después del caché, y ya no se reporta como ilegible.
def test_a19_hallazgo_un_cliente_sano_no_deberia_salir_como_base_ilegible(client, monkeypatch):
    """a19 · H-3 — El caché compartido inventa un error que no existe.

    ``contratos_activos_por_cliente`` devuelve el dict del caché de
    ``/metricas``, que se llenó con los clientes que existían en ese momento.
    ``_fila_cliente`` interpreta "el slug no está en el dict" como "la base no
    se dejó leer" y estampa ``ERROR_BASE_ILEGIBLE``. Un cliente que se dio de
    alta hace treinta segundos —el caso más común el día de una demo— aparece
    en el panel como roto.

    No es una fuga: es una MENTIRA del panel, y del lado peligroso (el operador
    llama a un cliente sano para avisarle que su base está caída).
    """
    ids = Identidades(client)
    _fundar(ids, "uid-viejo", "d@viejo.example", "viejo", "Viejo")
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    cab = _cab(consola["token"])
    _limpiar()

    # Calienta el caché de métricas del MES EN CURSO (el que usa /adopcion).
    _metricas(client, cab, periodo=_periodo_actual())

    # Y recién ahora nace el cliente nuevo.
    _fundar(ids, "uid-tardio", "d@tardio.example", "tardio", "Tardío")

    fila = _fila(_adopcion(client, cab), "tardio")
    assert fila["error"] is None, (
        "un cliente sano recién fundado se reporta como base ilegible: "
        f"{fila['error']!r}")
