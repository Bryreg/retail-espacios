"""Auditoría integral (dimensión 3) — la frontera del operador, ``/plataforma``.

Sucesor de ``tests/test_plataforma_ataques.py`` (Fase 2),
``test_metricas_ataques.py`` (Fase 4), ``test_tendencia_ataques.py`` (Fase 5) y
``test_asesoria_ataques.py`` (Fase 6). Misma disciplina y el mismo compromiso:
**acá no se arregla código de producción**. Un defecto se fija con un test que
lo demuestra —``xfail(strict=True)`` afirmando el comportamiento SEGURO que hoy
no se cumple— y se cuenta en ``features/auditoria/outputs/frontera.md``.

No se repiten los ataques ya escritos (barrido de rutas con cabecera m9/m10,
bitácora m19/a8, motivo del estado m20/a13, caché y atribución m22, K=3 del
spread a16/a17/a18, base rota m18/a12). Se atacan SIETE bordes que las fases
anteriores dejaron sin tocar:

* **f01/f02** — la frontera dura, revisitada con las rutas de las Fases 5 y 6
  adentro y por el camino de la QUERY (``?token=``), no de la cabecera.
* **f03/f04** — el saneo del nombre del proveedor contra la **normalización
  Unicode**: una arroba de ancho completo y un espacio de ancho cero no son los
  caracteres que las dos expresiones regulares esperan.
* **f05** — lo que el saneo NO protege: el nombre CRUDO del proveedor —con su
  correo adentro— queda persistido para siempre en el registro
  (``snapshot_metricas.proveedores_json``), que vive en la base por defecto.
* **f06** — el ``periodo`` como palanca de crecimiento: caché de proceso sin
  tope y filas de snapshot para períodos arbitrarios, futuros incluidos.
* **f07** — ``bitacora_plataforma`` y ``snapshot_metricas`` no se purgan nunca,
  a diferencia de ``AuditEntry`` (``services/bitacora.purgar``, 365 días).
* **f08** — K=3 se despeja por diferencia contra el consolidado: el canon
  EXACTO del contrato único de un cliente suprimido.
* **f09** — caracterización: dos operadores comparten caché en ``/tendencia`` y
  ``/adopcion``, y la bitácora igual atribuye cada consulta a quien la hizo.

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_metricas_ataques import (
    Identidades,
    _cab,
    _consola,
    _fundar,
    _hojas,
    _sembrar_negocio,
    _textos,
)

CORREO_OPERADOR = "op@recabra.example"
CORREO_OPERADOR_2 = "segunda.operadora@recabra.example"

# Contratos vigentes en CUALQUIER mes en que se corra la suite: `/adopcion` y
# `/tendencia` siempre miran el mes en curso.
SIEMPRE = ("2020-01-01", "2035-12-31")

# ── Los contactos ofuscados que se siembran adentro de `Supplier.name` ───────
#
# Ni el correo ni el teléfono usan los caracteres ASCII que las dos expresiones
# regulares de `sanear_nombre_proveedor` esperan, pero los dos se leen —y se
# copian— igual de bien que los normales.
LOCAL_CORREO = "juan.perez.distribuciones"
DOMINIO_CORREO = "correo-personal.example"
ARROBA_ANCHA = "＠"          # FULLWIDTH COMMERCIAL AT
CORREO_ANCHO = f"{LOCAL_CORREO}{ARROBA_ANCHA}{DOMINIO_CORREO}"
NOMBRE_CON_CORREO_ANCHO = f"Distribuciones Norte {CORREO_ANCHO}"

ZWSP = "​"                  # ZERO WIDTH SPACE
TELEFONO_PARTIDO = f"300{ZWSP}555{ZWSP}8899"
NOMBRE_CON_TELEFONO_PARTIDO = f"Lacteos del Valle Cel {TELEFONO_PARTIDO}"

MASCARA_CORREO = "[correo oculto]"
MASCARA_TELEFONO = "[teléfono oculto]"


# ════════════════════════════════════════════════════════════════════════════
# ANDAMIAJE PROPIO
# ════════════════════════════════════════════════════════════════════════════

def _periodo_actual() -> str:
    hoy = datetime.now(timezone.utc).date()
    return f"{hoy.year:04d}-{hoy.month:02d}"


def _limpiar_caches():
    from app import plataforma_estado
    from app.plataforma_metricas import limpiar_cache_metricas

    limpiar_cache_metricas()
    plataforma_estado.limpiar_cache_estado()


def _largos(pares):
    """``(codigo, proveedor, canon)`` → contratos activos en cualquier mes."""
    return [(cod, prov, SIEMPRE[0], SIEMPRE[1], canon, True) for cod, prov, canon in pares]


def _metricas(client, cab, periodo=None):
    r = client.get(
        f"/api/plataforma/metricas?periodo={periodo or _periodo_actual()}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _tendencia(client, cab, cliente="__consolidado__", meses=1):
    r = client.get(
        f"/api/plataforma/tendencia?cliente={cliente}&meses={meses}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _adopcion(client, cab):
    r = client.get("/api/plataforma/adopcion", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _snapshots():
    """Todas las filas de ``snapshot_metricas`` del registro."""
    from app.clientes import sesion_registro
    from app.models.plataforma import SnapshotMetricas

    reg = sesion_registro()
    try:
        return [
            {
                "cliente_slug": f.cliente_slug,
                "periodo": f.periodo,
                "proveedores_json": f.proveedores_json,
                "origen": f.origen,
            }
            for f in reg.query(SnapshotMetricas).all()
        ]
    finally:
        reg.close()


def _bitacora():
    from app.clientes import sesion_registro
    from app.models.plataforma import BitacoraPlataforma

    reg = sesion_registro()
    try:
        return [
            (f.email, f.accion, f.periodo)
            for f in reg.query(BitacoraPlataforma).order_by(BitacoraPlataforma.id).all()
        ]
    finally:
        reg.close()


def _un_cliente_con_proveedor(client, monkeypatch, nombre_proveedor):
    """Un supermercado con TRES contratos (pasa K=3) de un proveedor cuyo
    nombre lleva un contacto ofuscado adentro. Devuelve la cabecera de consola.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena.acme@correo-personal.example", "acme", "Acme")
    _sembrar_negocio(
        "acme",
        {"NAVE": [{"code": f"E-0{i}", "type": "punta", "sede": "NAVE"} for i in (1, 2, 3)]},
        _largos([(f"NAVE-E-0{i}", nombre_proveedor, 100_000.0 + i) for i in (1, 2, 3)]),
    )
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar_caches()
    return _cab(consola["token"])


# ════════════════════════════════════════════════════════════════════════════
# f01-f02 · LA FRONTERA DURA, CON LAS FASES 5 Y 6 ADENTRO
# ════════════════════════════════════════════════════════════════════════════

def _rutas_de_plataforma(client):
    """``(metodo, path, cuerpo)`` de TODAS las rutas del router de plataforma,
    con los parámetros ya rellenos."""
    from conftest import rutas_planas

    salida = []
    for ruta in rutas_planas(client.app):
        path = ruta.path
        if not path.startswith("/api/plataforma"):
            continue
        concreto = path.replace("{slug}", "galerias").replace("{solicitud_id}", "1")
        for metodo in sorted(ruta.methods - {"HEAD", "OPTIONS"}):
            if metodo == "PATCH" and "supresiones" in path:
                cuerpo = {"estado": "atendida", "nota": "auditoría"}
            elif metodo == "PATCH":
                cuerpo = {"estado": "activo", "motivo": "auditoría"}
            else:
                cuerpo = None
            salida.append((metodo, concreto, cuerpo))
    return salida


def test_f01_solo_metricas_tendencia_y_adopcion_abren_una_base_de_cliente(client, monkeypatch):
    """f01 · Caracterización — la lista taxativa, verificada por barrido.

    Se espía ``app.clientes.sesion_de`` y se golpea CADA ruta del router de
    plataforma (las de la Fase 5 y la Fase 6 incluidas). Ninguna salvo
    ``/metricas``, ``/tendencia`` y ``/adopcion`` puede abrir la sesión de un
    supermercado; el slug sintético ``plataforma`` no cuenta —apunta al
    registro, es lo que ``require_auth`` usa para la época—.
    """
    import app.clientes as clientes

    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")

    abiertas: dict[str, set[str]] = {}
    original = clientes.sesion_de
    actual = {"ruta": None}

    def espia(cliente):
        if cliente.slug != "plataforma":
            abiertas.setdefault(actual["ruta"], set()).add(cliente.slug)
        return original(cliente)

    monkeypatch.setattr(clientes, "sesion_de", espia)

    for metodo, path, cuerpo in _rutas_de_plataforma(client):
        actual["ruta"] = f"{metodo} {path}"
        r = client.request(metodo, path, json=cuerpo, headers=cab)
        assert r.status_code != 500, (actual["ruta"], r.text)
        _limpiar_caches()  # que el caché no esconda el recorrido de la ruta siguiente

    con_base = {ruta for ruta, slugs in abiertas.items() if slugs}
    permitidas = {
        "GET /api/plataforma/metricas",
        "GET /api/plataforma/tendencia",
        "GET /api/plataforma/adopcion",
    }
    assert con_base <= permitidas, f"rutas que abrieron una base de cliente: {abiertas}"
    assert "GET /api/plataforma/metricas" in con_base, abiertas
    # `/tendencia` lee sólo el registro; `/adopcion` reusa el caché de métricas
    # y por eso puede o no recorrer bases según lo encuentre caliente.
    assert "GET /api/plataforma/tendencia" not in con_base, abiertas


def test_f02_el_token_de_la_consola_muere_en_todo_el_arbol_tambien_por_query(client, monkeypatch):
    """f02 · Caracterización — ``?token=`` no es una puerta más ancha que la
    cabecera.

    El barrido previo (m10) usó la cabecera; ``_credencial`` acepta además el
    token por la query, que es el camino de la foto de montaje y del plano en
    un ``<iframe>``. Se recorre TODA la aplicación con el token de consola
    metido en la URL: fuera de ``/api/plataforma`` no puede haber un solo 2xx.
    """
    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")
    token = cab["Authorization"].split(" ", 1)[1]

    from conftest import rutas_planas

    fugas = []
    for ruta in rutas_planas(client.app):
        path = ruta.path
        if not path.startswith("/api/") or path.startswith("/api/plataforma"):
            continue
        if "GET" not in ruta.methods:
            continue
        concreto = (path.replace("{slug}", "galerias").replace("{sede}", "NAVE")
                        .replace("{lease_id}", "1").replace("{space_id}", "1")
                        .replace("{file_id}", "1").replace("{mount_id}", "1")
                        .replace("{supplier_id}", "1").replace("{usuario_id}", "1")
                        .replace("{solicitud_id}", "1").replace("{token}", "x")
                        .replace("{planogram_id}", "1").replace("{code}", "NAVE-E-01"))
        if "{" in concreto:
            continue
        con_token = client.get(f"{concreto}?token={token}")
        if not (200 <= con_token.status_code < 300):
            continue
        # Un 2xx que un ANÓNIMO también obtiene no es una fuga del token: es un
        # endpoint público (``/api/health``, la lista de clientes de la pantalla
        # de ingreso). Lo que no puede pasar es que el token ABRA algo.
        anonimo = client.get(concreto)
        if not (200 <= anonimo.status_code < 300):
            fugas.append((concreto, con_token.status_code, anonimo.status_code))

    assert not fugas, f"el token de consola sirvió datos fuera de /api/plataforma: {fugas}"


# ════════════════════════════════════════════════════════════════════════════
# f03-f04 · EL SANEO DEL PROVEEDOR CONTRA LA NORMALIZACIÓN UNICODE
# ════════════════════════════════════════════════════════════════════════════

def test_f03_sonda_el_saneo_conoce_las_seis_formas_de_escribir_el_contacto(client):
    """f03 · Sonda con salida literal — la función, aislada del endpoint.

    Llama a ``sanear_nombre_proveedor`` con seis formas de escribir el mismo
    contacto. Antes del arreglo de frontera-1 documentaba qué reconocía y qué
    no: las tres formas ASCII se enmascaraban y las tres ofuscadas (arroba de
    ancho completo, espacio de ancho cero, barras como separador) salían
    enteras. Con la normalización NFKC, el borrado de los caracteres de formato
    (``Cf``) y la clase de separadores ampliada, las SEIS se enmascaran. La
    sonda queda como caracterización: si alguna vuelve a pasar en claro, cae
    acá y no en producción. Toma el fixture ``client`` sólo para que el import
    de ``app.*`` quede atado a la base descartable de esta prueba (el fixture
    purga ``sys.modules`` al terminar).
    """
    from app.plataforma_metricas import sanear_nombre_proveedor as sanear

    casos = {
        "correo ascii": f"Norte {LOCAL_CORREO}@{DOMINIO_CORREO}",
        "correo ancho": f"Norte {CORREO_ANCHO}",
        "telefono ascii": "Valle Cel 300 555 8899",
        "telefono nbsp": "Valle Cel 300 555 8899",
        "telefono zwsp": f"Valle Cel {TELEFONO_PARTIDO}",
        "telefono barras": "Valle Cel 300/555/8899",
    }
    salida = {k: sanear(v) for k, v in casos.items()}

    # La defensa declarada, intacta.
    assert MASCARA_CORREO in salida["correo ascii"], salida
    assert MASCARA_TELEFONO in salida["telefono ascii"], salida
    assert MASCARA_TELEFONO in salida["telefono nbsp"], salida

    # Y las tres formas ofuscadas, ahora también (arreglo de frontera-1).
    assert salida["correo ancho"] == f"Norte {MASCARA_CORREO}", salida
    assert salida["telefono zwsp"] == f"Valle Cel {MASCARA_TELEFONO}", salida
    assert salida["telefono barras"] == f"Valle Cel {MASCARA_TELEFONO}", salida

    # Ni un resto del contacto en ninguna de las seis salidas.
    for etiqueta, texto in salida.items():
        assert "@" not in texto, (etiqueta, texto)
        assert ARROBA_ANCHA not in texto, (etiqueta, texto)
        assert LOCAL_CORREO not in texto and DOMINIO_CORREO not in texto, (etiqueta, texto)
        assert "8899" not in texto, (etiqueta, texto)

    # Idempotencia: sanear lo ya saneado no vuelve a enmascarar nada. De eso
    # depende que el snapshot pueda guardar el nombre YA saneado (frontera-2) y
    # que `_top` lo siga pasando por acá al leer.
    for texto in salida.values():
        assert sanear(texto) == texto, texto


def test_f04_hallazgo_un_correo_con_arroba_ancha_cruza_la_frontera(client, monkeypatch):
    """f04 · frontera-1 — El comportamiento SEGURO que hoy no se cumple.

    ``Supplier.name`` con ``juan.perez.distribuciones＠correo-personal.example``
    (U+FF20, la arroba que teclea cualquier teclado asiático y que sobrevive a
    un copy-paste desde un PDF o un Excel). ``_CORREO_RE`` pide un ``@`` ASCII,
    y la red de seguridad declarada —"ningún string del JSON trae una arroba",
    ``limpio.replace("@", " ")``— también. El correo de un TERCERO sale entero
    al panel del operador, en ``/metricas`` y en ``/tendencia``.

    Se exige que ningún string del JSON del operador contenga el buzón ni una
    arroba de ninguna de sus formas.
    """
    cab = _un_cliente_con_proveedor(client, monkeypatch, NOMBRE_CON_CORREO_ANCHO)

    cuerpos = {
        "metricas": _metricas(client, cab),
        "tendencia": _tendencia(client, cab, cliente="acme"),
    }
    for etiqueta, cuerpo in cuerpos.items():
        crudo = json.dumps(cuerpo, ensure_ascii=False)
        assert LOCAL_CORREO not in crudo, f"{etiqueta}: el buzón del proveedor salió entero"
        assert DOMINIO_CORREO not in crudo, f"{etiqueta}: el dominio del correo salió"
        for _ruta, valor in _hojas(cuerpo):
            if isinstance(valor, str):
                assert ARROBA_ANCHA not in valor, f"{etiqueta}: arroba de ancho completo en {valor!r}"


def test_f05_hallazgo_un_telefono_con_espacio_de_ancho_cero_cruza_la_frontera(
        client, monkeypatch):
    """f05 · frontera-1 (segundo vector) — El mismo agujero, por el teléfono.

    ``_TELEFONO_RE`` admite espacio, guion, punto y paréntesis entre los
    dígitos, pero ``\\s`` no incluye U+200B (categoría ``Cf``, no espacio):
    ``300​555​8899`` se lee como tres números de tres y cuatro dígitos, ninguno
    llega al umbral de 7 y el celular del proveedor sale entero. El ZWSP viaja
    solo en cualquier copy-paste desde una web o un WhatsApp.
    """
    cab = _un_cliente_con_proveedor(client, monkeypatch, NOMBRE_CON_TELEFONO_PARTIDO)

    crudo = json.dumps(_metricas(client, cab), ensure_ascii=False)
    solo_digitos = "".join(c for c in crudo if c.isdigit() or c == ZWSP)
    assert TELEFONO_PARTIDO not in crudo, "el celular del proveedor salió entero"
    assert "3005558899" not in solo_digitos.replace(ZWSP, ""), (
        "el celular del proveedor salió, sólo que partido por caracteres invisibles")


# ════════════════════════════════════════════════════════════════════════════
# f06 · LO QUE EL SANEO NO ALCANZA: EL CRUDO PERSISTIDO EN EL REGISTRO
# ════════════════════════════════════════════════════════════════════════════

def test_f06_hallazgo_el_nombre_crudo_del_proveedor_queda_guardado_en_el_registro(
        client, monkeypatch):
    """f06 · frontera-2 — El saneo se aplica al LEER, así que el disco guarda
    el original.

    ``persistir_snapshots`` escribe ``proveedores_json`` con el nombre ORIGINAL
    (lo dice su propio comentario: agrupar por el saneado fundiría proveedores).
    Consecuencia: el correo o el teléfono que un supermercado tecleó adentro de
    ``Supplier.name`` queda copiado, en claro y sin plazo de retención, en
    ``snapshot_metricas`` — una tabla del REGISTRO, que es la base por defecto,
    o sea la base de negocio de GALERIAS. El dato de un tercero de un cliente
    termina en reposo adentro de la base de OTRO cliente.

    Se exige que lo que se persiste ya esté saneado (o que no se persista el
    nombre en absoluto).
    """
    correo_ascii = f"{LOCAL_CORREO}@{DOMINIO_CORREO}"
    cab = _un_cliente_con_proveedor(client, monkeypatch, f"Distribuciones Norte {correo_ascii}")
    _metricas(client, cab)

    guardados = [f["proveedores_json"] for f in _snapshots()]
    assert guardados, "la prueba necesita al menos una fila de snapshot"
    for crudo in guardados:
        assert correo_ascii not in crudo, (
            f"el correo del proveedor quedó en el registro, en claro: {crudo!r}")
        assert "@" not in crudo, f"una arroba quedó persistida en el registro: {crudo!r}"


# ════════════════════════════════════════════════════════════════════════════
# f07 · EL PERÍODO COMO PALANCA DE CRECIMIENTO
# ════════════════════════════════════════════════════════════════════════════

def test_f07_hallazgo_cada_periodo_pedido_agranda_el_cache_y_el_registro(client, monkeypatch):
    """f07 · frontera-3 — Un GET de sólo lectura hacía crecer memoria y disco
    sin techo, y escribía historia de meses que no existieron.

    ``/metricas?periodo=YYYY-MM`` aceptaba cualquier mes entre 1900-01 y 9999-12
    (≈97.000 valores). Cada uno que no estuviera en el caché:

    1. recorría las N bases de negocio (trabajo real por pedido),
    2. dejaba una entrada NUEVA en ``_cache`` y otra en ``_cache_contratos``,
       que no tenían tope ni desalojo por tamaño —sólo TTL, y el TTL no libera
       nada mientras el operador siga pidiendo—, y
    3. **escribía filas de ``snapshot_metricas``** para ese período, incluidos
       meses FUTUROS que el mes que viene se leerían como historia real.

    Las tres cosas, arregladas y verificadas acá:

    · La ventana de ``normalizar_periodo`` (24 meses atrás, 12 adelante): un mes
      fuera de ella es 422. Se pide con ``client.get`` directo y no con
      ``_metricas``, que asserta 200.
    · El caché es un LRU acotado: se piden los 37 períodos de la ventana entera
      —más que el tope— y quedan a lo sumo 24.
    · No se persiste una sola fila de un mes que todavía no pasó. Los futuros
      DENTRO de la ventana siguen consultándose (un contrato que arranca el mes
      que viene se mira preguntando por ese mes): lo que no hacen es dejar
      historia.
    """
    from app import plataforma_metricas
    from app.plataforma_metricas import TOPE_CACHE_PERIODOS, ventana_de_periodos

    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")

    # 1) Fuera de la ventana: 422, sin reflejar lo tecleado ni filtrar una traza.
    for fuera in ("1900-01", "9999-12"):
        r = client.get(f"/api/plataforma/metricas?periodo={fuera}", headers=cab)
        assert r.status_code == 422, f"{fuera} -> {r.status_code}: {r.text[:200]}"
        detalle = json.dumps(r.json(), ensure_ascii=False)
        assert "Traceback" not in detalle and fuera not in detalle, detalle

    # 2) Toda la ventana, que es más ancha que el tope del caché.
    mas_viejo, mas_nuevo = ventana_de_periodos()
    anio, mes = int(mas_viejo[:4]), int(mas_viejo[5:7])
    periodos = []
    while True:
        periodo = f"{anio:04d}-{mes:02d}"
        periodos.append(periodo)
        if periodo == mas_nuevo:
            break
        anio, mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)
    assert len(periodos) > TOPE_CACHE_PERIODOS, periodos

    for periodo in periodos:
        _metricas(client, cab, periodo=periodo)

    entradas = len(plataforma_metricas._cache)
    assert entradas <= TOPE_CACHE_PERIODOS, (
        f"el caché de métricas guarda {entradas} períodos distintos, sin tope ni desalojo")
    assert len(plataforma_metricas._cache_contratos) <= TOPE_CACHE_PERIODOS

    # 3) Y ni una fila de historia de un mes que todavía no pasó.
    futuros = sorted({f["periodo"] for f in _snapshots() if f["periodo"] > _periodo_actual()})
    assert not futuros, f"se persistió historia de meses futuros: {futuros}"
    # El mes en curso sí quedó capturado: la prueba no vale si no se escribió nada.
    assert any(f["periodo"] == _periodo_actual() for f in _snapshots())


# ════════════════════════════════════════════════════════════════════════════
# f08 · LO QUE CRECE EN EL REGISTRO NO SE PURGA NUNCA
# ════════════════════════════════════════════════════════════════════════════

def test_f08_hallazgo_la_bitacora_del_operador_no_se_purga_nunca(client, monkeypatch):
    """f08 · frontera-4 — ``AuditEntry`` se purga a los 365 días; la bitácora
    del operador y el snapshot, jamás.

    El ciclo de mantenimiento (``main._run_lease_maintenance``, cada 12 h)
    llama a ``services.bitacora.purgar`` **por cada base de cliente**
    (``DIAS_QUE_SE_GUARDA = 365``). Las tres tablas que crecen en el REGISTRO
    —``bitacora_plataforma``, ``snapshot_metricas``, ``intentos_alta``— no
    tienen ningún equivalente: nadie las borra nunca. Es a la vez un problema
    de retención (Ley 1581: dato conservado sin plazo) y de disponibilidad en
    un disco de plan chico.

    La prueba siembra una línea de CADA una con tres años de antigüedad, corre
    una vuelta de mantenimiento y exige que las dos desaparezcan igual que la
    del cliente. Y la contracara, que es lo que hace que la purga sea una purga
    y no un borrado: lo de ayer, lo de hace seis meses y la serie
    ``__consolidado__`` vieja —el histórico largo del negocio, sin nombre de
    proveedor ni dato de nadie— siguen ahí.
    """
    from app.clientes import buscar, sesion_de, sesion_registro
    from app.models.models import AuditEntry
    from app.models.plataforma import BitacoraPlataforma, IntentoAlta, SnapshotMetricas
    from app.plataforma_tendencia import CONSOLIDADO_SLUG
    import app.main as main
    import app.services.reminders as reminders

    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")
    _metricas(client, cab)  # deja bitácora y snapshot de verdad

    ahora = datetime.now(timezone.utc)
    viejo = ahora - timedelta(days=3 * 365)
    ayer = ahora - timedelta(days=1)

    def _hace_meses(cuantos: int) -> str:
        anio, mes = int(_periodo_actual()[:4]), int(_periodo_actual()[5:7])
        total = anio * 12 + (mes - 1) - cuantos
        return f"{total // 12:04d}-{total % 12 + 1:02d}"

    PERIODO_VIEJISIMO = "2019-01"      # muy anterior a la ventana: se purga
    PERIODO_RECIENTE = _hace_meses(6)  # adentro de la ventana: sobrevive

    reg = sesion_registro()
    try:
        reg.add(BitacoraPlataforma(
            email=CORREO_OPERADOR, accion="metricas", periodo=PERIODO_VIEJISIMO, en=viejo))
        # Lo de ayer NO se toca: el plazo es de un año, no "todo lo que no es de hoy".
        reg.add(BitacoraPlataforma(
            email=CORREO_OPERADOR, accion="metricas", periodo=_periodo_actual(), en=ayer))
        reg.add(IntentoAlta(ip="10.9.9.9", at=viejo))
        # Un snapshot POR CLIENTE de un mes prehistórico: se purga.
        reg.add(SnapshotMetricas(
            cliente_slug="acme", periodo=PERIODO_VIEJISIMO, sedes_con_plano=1,
            espacios_comercializables=1, ocupadas=0, contratos_activos=0,
            canon_total=0.0, usuarios=0, proveedores_json="{}", clientes_incluidos=1,
            origen="cierre", capturado_en=viejo))
        # …y el CONSOLIDADO del mismo mes prehistórico, que se conserva.
        reg.add(SnapshotMetricas(
            cliente_slug=CONSOLIDADO_SLUG, periodo=PERIODO_VIEJISIMO, sedes_con_plano=1,
            espacios_comercializables=1, ocupadas=0, contratos_activos=0,
            canon_total=0.0, usuarios=0, proveedores_json="{}", clientes_incluidos=1,
            clientes_con_error=0, origen="cierre", capturado_en=viejo))
        # Un snapshot por cliente de hace seis meses: adentro del plazo.
        reg.add(SnapshotMetricas(
            cliente_slug="acme", periodo=PERIODO_RECIENTE, sedes_con_plano=1,
            espacios_comercializables=1, ocupadas=0, contratos_activos=0,
            canon_total=0.0, usuarios=0, proveedores_json="{}", clientes_incluidos=1,
            origen="cierre", capturado_en=ahora - timedelta(days=180)))
        reg.commit()
    finally:
        reg.close()

    db = sesion_de(buscar("acme"))
    try:
        db.add(AuditEntry(at=viejo, rol="admin", ip="10.0.0.9", accion="login.ok",
                          detalle="viejo"))
        db.commit()
    finally:
        db.close()

    # El correo de recordatorios no es lo que se está probando.
    monkeypatch.setattr(reminders, "check_expiring_leases", lambda db: None)
    main._run_lease_maintenance()

    db = sesion_de(buscar("acme"))
    try:
        quedan_cliente = db.query(AuditEntry).filter(AuditEntry.at < viejo + timedelta(days=1)).count()
    finally:
        db.close()
    assert quedan_cliente == 0, "la purga de la base de cliente no corrió: la prueba no vale"

    reg = sesion_registro()
    try:
        quedan_plataforma = (
            reg.query(BitacoraPlataforma)
            .filter(BitacoraPlataforma.en < viejo + timedelta(days=1))
            .count()
        )
        quedan_intentos = reg.query(IntentoAlta).count()
        snapshots = {
            (f.cliente_slug, f.periodo)
            for f in reg.query(SnapshotMetricas).all()
        }
        bitacora_de_ayer = (
            reg.query(BitacoraPlataforma)
            .filter(BitacoraPlataforma.en > ahora - timedelta(days=2))
            .count()
        )
    finally:
        reg.close()

    assert quedan_plataforma == 0, (
        "la bitácora del operador de hace tres años sigue entera: la tabla no se purga nunca")
    assert quedan_intentos == 0, "los intentos de alta de hace tres años siguen ahí"
    assert ("acme", PERIODO_VIEJISIMO) not in snapshots, (
        "el snapshot por cliente de un mes prehistórico no se purgó")

    # Y lo que la purga NO puede tocar.
    assert bitacora_de_ayer >= 1, "la purga se llevó una línea de bitácora de ayer"
    assert ("acme", PERIODO_RECIENTE) in snapshots, (
        "la purga se llevó un snapshot de hace seis meses, adentro del plazo")
    assert (CONSOLIDADO_SLUG, PERIODO_VIEJISIMO) in snapshots, (
        "la purga se llevó la serie larga del consolidado, que se conserva por diseño")


# ════════════════════════════════════════════════════════════════════════════
# f09 · K=3 SE DESPEJA POR DIFERENCIA CONTRA EL CONSOLIDADO
# ════════════════════════════════════════════════════════════════════════════

CANON_UNICO = 4_173_919.0   # irrepetible: si aparece, se filtró


def _dos_clientes_uno_de_un_solo_contrato(client, monkeypatch):
    """A publica (3 contratos) y B queda suprimido por K=3 (1 contrato)."""
    ids = Identidades(client)
    _fundar(ids, "uid-a", "duena@a.example", "aaa", "A")
    _fundar(ids, "uid-b", "dueno@b.example", "bbb", "B")
    _sembrar_negocio(
        "aaa", {"A": [{"code": f"E-0{i}", "type": "punta", "sede": "A"} for i in (1, 2, 3)]},
        _largos([(f"A-E-0{i}", "Alpina", 1_000_000.0) for i in (1, 2, 3)]),
    )
    _sembrar_negocio(
        "bbb", {"B": [{"code": "E-01", "type": "punta", "sede": "B"}]},
        _largos([("B-E-01", "Nutresa", CANON_UNICO)]),
    )
    consola = _consola(ids, monkeypatch, email=CORREO_OPERADOR)
    _limpiar_caches()
    return _cab(consola["token"])


@pytest.mark.xfail(strict=True, reason="frontera-5: el consolidado despeja la celda suprimida")
def test_f09_hallazgo_el_consolidado_despeja_el_contrato_unico_del_cliente_suprimido(
        client, monkeypatch):
    """f09 · frontera-5 — K=3 no protege nada cuando los demás clientes publican.

    B tiene UN contrato: su ``ingreso_contratado_mes`` y su
    ``canon_promedio_mensual`` van en ``null`` y su top de proveedores vacío,
    exactamente como manda ``_suprimir_celda_chica``. Pero el consolidado sí
    publica el ingreso (4 contratos ≥ K) e incluye a B —decisión declarada, m26
    de la Fase 4—, así que::

        canon del contrato de B = ingreso_consolidado − ingreso_de_A

    devuelve el monto EXACTO del contrato individual que la regla escondió. Con
    N clientes es lo mismo: alcanza con que N−1 publiquen. El fix de a17 tapó
    esta aritmética para el *spread* pero no para el *ingreso*, que es la cifra
    que la spec nombra primero ("nunca valores de contratos individuales").

    Se exige que el monto despejado no coincida con el canon real.
    """
    cab = _dos_clientes_uno_de_un_solo_contrato(client, monkeypatch)
    cuerpo = _metricas(client, cab)

    b = next(c for c in cuerpo["clientes"] if c["slug"] == "bbb")["metricas"]
    a = next(c for c in cuerpo["clientes"] if c["slug"] == "aaa")["metricas"]
    assert b["ingreso_contratado_mes"] is None, "el escenario exige que B esté suprimido"

    despejado = cuerpo["consolidado"]["ingreso_contratado_mes"] - a["ingreso_contratado_mes"]
    assert abs(despejado - CANON_UNICO) > 1.0, (
        f"el canon del contrato único de B se despejó del consolidado: {despejado}")


# ════════════════════════════════════════════════════════════════════════════
# f10 · CACHÉ COMPARTIDO Y ATRIBUCIÓN, EN TENDENCIA Y ADOPCIÓN
# ════════════════════════════════════════════════════════════════════════════

def test_f10_dos_operadores_comparten_los_numeros_pero_no_la_linea_de_bitacora(
        client, monkeypatch):
    """f10 · Caracterización — el precedente m22, extendido a las Fases 5 y 6.

    Dos operadores distintos consultan ``/tendencia`` y ``/adopcion``. Ven los
    MISMOS números (``/adopcion`` reusa el caché de 5 minutos de ``/metricas``,
    que es del proceso y no del operador) y aun así cada consulta queda anotada
    con el correo de quien la hizo, acierto de caché incluido.
    """
    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena.acme@correo-personal.example", "acme", "Acme")
    _sembrar_negocio(
        "acme",
        {"NAVE": [{"code": f"E-0{i}", "type": "punta", "sede": "NAVE"} for i in (1, 2, 3)]},
        _largos([(f"NAVE-E-0{i}", "Alpina", 100_000.0 + i) for i in (1, 2, 3)]),
    )
    primera = _consola(ids, monkeypatch, email=CORREO_OPERADOR, otros=(CORREO_OPERADOR_2,))
    segunda = _consola(ids, monkeypatch, uid="uid-op2", email=CORREO_OPERADOR_2,
                       otros=(CORREO_OPERADOR,))
    cab1, cab2 = _cab(primera["token"]), _cab(segunda["token"])
    _limpiar_caches()

    a1 = _adopcion(client, cab1)
    a2 = _adopcion(client, cab2)
    t1 = _tendencia(client, cab1)
    t2 = _tendencia(client, cab2)

    assert a1["clientes"] == a2["clientes"], "el caché compartido debería dar los mismos números"
    assert t1["serie"] == t2["serie"]

    lineas = _bitacora()
    acciones = [(email, accion) for email, accion, _p in lineas]
    assert (CORREO_OPERADOR, "adopcion") in acciones
    assert (CORREO_OPERADOR_2, "adopcion") in acciones
    assert (CORREO_OPERADOR, "tendencia") in acciones
    assert (CORREO_OPERADOR_2, "tendencia") in acciones
    # Y ninguna línea lleva un dato de negocio adentro.
    for email, accion, periodo in lineas:
        assert "@" not in periodo, periodo
        assert accion in ("metricas", "tendencia", "adopcion"), accion


def test_f12_hallazgo_leer_las_supresiones_no_deja_una_sola_linea(client, monkeypatch):
    """f12 · frontera-6 — La bitácora del operador cubre los agregados, no la PII.

    ``bitacora_plataforma`` la escriben EXACTAMENTE tres endpoints:
    ``/metricas``, ``/tendencia`` y ``/adopcion``. ``GET /supresiones`` devuelve
    el **correo, el id de usuario y el motivo** de cada titular que ejerció
    habeas data, y ``GET /clientes`` devuelve el motivo del corte de cada
    cuenta — los dos datos más sensibles que el panel maneja — y ninguno de los
    dos deja rastro de quién los leyó ni cuándo. Los PATCH sí quedan
    (``atendido_por``/``cambiado_por`` en la fila), pero la LECTURA no: la
    constancia que la Fase 4 construyó para los agregados no cubre a la PII.

    Se exige que toda consulta del operador quede anotada.
    """
    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")

    antes = len(_bitacora())
    r = client.get("/api/plataforma/supresiones", headers=cab)
    assert r.status_code == 200, r.text
    r = client.get("/api/plataforma/clientes", headers=cab)
    assert r.status_code == 200, r.text
    despues = _bitacora()

    acciones = {accion for _e, accion, _p in despues}
    assert len(despues) == antes + 2, (
        f"leer supresiones y clientes no dejó ninguna línea: {antes} -> {len(despues)}")
    assert "supresiones" in acciones and "clientes" in acciones, acciones


def test_f11_el_motivo_del_patch_no_vuelve_por_ningun_agregado(client, monkeypatch):
    """f11 · Caracterización — el motivo del corte es del registro y se queda ahí.

    Se corta una cuenta por el PATCH real (no sembrando la fila a mano) con un
    motivo que lleva adentro el correo de la dueña, y se comprueba que ni
    ``/metricas`` ni ``/tendencia`` ni ``/adopcion`` lo devuelven — y que el
    PATCH invalidó el caché de métricas (M-1), o sea que el estado nuevo se ve
    en el acto.
    """
    motivo = "Factura 0001-4517 impaga; contacto duena.acme@correo-personal.example"
    cab = _un_cliente_con_proveedor(client, monkeypatch, "Alpina")
    _metricas(client, cab)  # calienta el caché ANTES del PATCH

    r = client.patch("/api/plataforma/clientes/acme",
                     json={"estado": "suspendido", "motivo": motivo}, headers=cab)
    assert r.status_code == 200, r.text

    cuerpos = {
        "metricas": _metricas(client, cab),
        "tendencia": _tendencia(client, cab, cliente="acme"),
        "adopcion": _adopcion(client, cab),
    }
    for etiqueta, cuerpo in cuerpos.items():
        for texto in _textos(cuerpo):
            assert "0001-4517" not in texto, f"{etiqueta}: el motivo se coló"
            assert "duena.acme" not in texto, f"{etiqueta}: el correo del motivo se coló"

    fila = next(c for c in cuerpos["metricas"]["clientes"] if c["slug"] == "acme")
    assert fila["estado_cuenta"] == "suspendido", (
        "el caché de métricas no se invalidó con el PATCH (M-1)")
    assert cuerpos["metricas"]["de_cache"] is False
