"""Los dos nombres de un mueble, y la planilla que tiene que elegir uno.

Un mueble del plano tiene **código** —la llave con la que se guarda todo— y
**nomenclatura** —texto libre que alguien escribe a mano y que lo reemplaza sólo
en la pantalla—. Nada obliga a que coincidan y nada impedía que el nombre de un
mueble fuera el código de otro: en CIUDAD JARDIN se renumeró a mano una corrida
de impulsadores y, como los números se corrieron dentro de un conjunto cerrado,
**cada nombre nuevo es el código viejo de otro mueble**.

El resultado, reproducido por la pantalla real antes de escribir una línea de
esto: se vendió dos veces el mismo espacio, a dos proveedores, con las mismas
fechas, sin una sola advertencia.

Acá se prueba lo que esta fase hace: que la ambigüedad se rechace nombrando los
dos muebles, que la revisión muestre el nombre que la persona reconoce, y que la
fila sin sede —el segundo agujero, que no tiene nada que ver con los nombres— no
cree un espacio nuevo para un mueble que ya existe.

La siembra es la del investigador (`/tmp/nom-repro/seed.py`, descrita en
`features/nomenclatura/diag-repro.md`): once impulsadores, seis renombrados.
"""

from datetime import date, timedelta

HOY = date.today()
CJ = "CIUDAD JARDIN"

#: Lo que hizo la persona: renumeró los impulsadores para que coincidieran con la
#: cartelería física. Cada nomenclatura es el código de OTRO mueble del plano.
NOMENCLATURAS = {
    "IMP-12": "IMP-08",
    "IMP-13": "IMP-10",
    "IMP-14": "IMP-12",
    "IMP-15": "IMP-14",
    "IMP-11": "IMP-16",
    "IMP-09": "IMP-17",
}


def _impulsador(n: int) -> dict:
    code = f"IMP-{n:02d}"
    f = {
        "id": f"imp{n}", "code": code, "sede": CJ, "type": "impulsador",
        "label": "Impulsador Marca", "cx": 1.2 + n * 1.5, "cz": 8.2, "rotY": 0,
        "w": 0.6, "d": 0.5, "h": 1.5, "color": "#f59e0b", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }
    if code in NOMENCLATURAS:
        f["nomenclatura"] = NOMENCLATURAS[code]
    return f


def _punta(n: int, sede: str = CJ) -> dict:
    return {
        "id": f"pun{n}{sede}", "code": f"PUN-{n:02d}", "sede": sede, "type": "punta",
        "label": "Punta de Góndola", "cx": 3.0 + n, "cz": 6.0, "rotY": 0,
        "w": 1.2, "d": 0.9, "h": 1.8, "color": "#6366f1", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }


#: El plano del dueño: tres puntas y once impulsadores, seis con nombre a mano.
PLANO_CJ = [_punta(n) for n in (6, 8, 10)] + [_impulsador(n) for n in range(7, 18)]
#: Otra tienda, para el caso de la columna Sede escrita con el nombre equivocado.
PLANO_NAVE = [_punta(4, "NAVE"), _punta(5, "NAVE")]


def _planos(client, admin):
    for sede, fixtures in ((CJ, PLANO_CJ), ("NAVE", PLANO_NAVE)):
        r = client.put(f"/api/layout/{sede}",
                       json={"fixtures": fixtures, "base_updated_at": None}, headers=admin)
        assert r.status_code == 200, r.text


def _fila(n=2, **kw):
    base = {
        "fila": n, "espacio": "IMP-08", "proveedor": "CASA LUKER", "marca": "ASEO",
        "valor": 200_000,
        "desde": (HOY + timedelta(days=10)).isoformat(),
        "hasta": (HOY + timedelta(days=20)).isoformat(),
    }
    base.update(kw)
    return base


def _validar(client, admin, filas, sede=CJ):
    r = client.post("/api/leases/bulk/validar",
                    json={"sede": sede, "filas": filas}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _confirmar(client, admin, filas, sede=CJ):
    r = client.post("/api/leases/bulk/confirmar",
                    json={"sede": sede, "filas": filas}, headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def _espacios(client, admin):
    return {s["code"] for s in client.get("/api/spaces/", headers=admin).json()}


# ─── La ambigüedad: el corazón de la fase ─────────────────────────────────────

def test_la_fila_ambigua_no_entra_y_el_mensaje_nombra_los_dos_muebles(client, admin):
    """«IMP-08» es el código de un mueble y el nombre dibujado de otro.

    Las dos lecturas son defendibles —quien mira el plano señala el mueble
    renombrado, quien mira la base señala el que se llama así— y elegir en
    silencio es lo que mandó el contrato al mueble equivocado. Se rechaza, y el
    mensaje nombra a los dos: sin el código del otro, la persona no tiene con qué
    corregir.
    """
    _planos(client, admin)
    body = _validar(client, admin, [_fila(espacio="IMP-08")])
    fila = body["filas"][0]
    assert fila["estado"] == "error"
    assert (body["ok"], body["errores"]) == (0, 1)

    mensaje = fila["mensajes"][0]
    assert "ambiguo" in mensaje
    assert "IMP-08" in mensaje                      # lo que se tecleó
    assert f"{CJ}-IMP-12" in mensaje                # el mueble que se DIBUJA así
    assert CJ in mensaje                            # en qué sede


def test_la_ambigüedad_tambien_frena_al_que_escribio_el_codigo_correcto(client, admin):
    """El caso simétrico, que es el más frecuente: la fila dice «IMP-12».

    El contrato cae en el mueble correcto, pero el plano lo dibuja «IMP-08», y
    existe otro mueble que se dibuja «IMP-12» (código IMP-14). Escrito corto, el
    texto sigue calzando dos muebles: no se puede saber cuál se quiso.
    """
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio="IMP-12")])["filas"][0]
    assert fila["estado"] == "error"
    assert f"{CJ}-IMP-14" in fila["mensajes"][0]


def test_el_mensaje_ambiguo_ofrece_los_dos_caminos_con_su_codigo_completo(client, admin):
    """El rechazo no puede pedir que la persona adivine, que es lo que hacía.

    Terminaba en «Escribí el código completo del que quisiste», y ese consejo era
    una trampa: quien mira la cajita que el plano rotula «IMP-08» escribe
    `CIUDAD JARDIN-IMP-08`, que es el OTRO mueble, y el contrato entraba callado
    en el equivocado. Ahora el mensaje pone LOS DOS caminos con su código
    completo, y **primero el que la persona probablemente quiso**: el que el
    plano dibuja con el texto que tecleó, que es el que estaba mirando.
    """
    _planos(client, admin)
    mensaje = _validar(client, admin, [_fila(espacio="IMP-08")])["filas"][0]["mensajes"][0]

    # Los dos caminos, cada uno con su código completo: un código corto acá sería
    # otra vez el texto ambiguo del que estamos tratando de salir.
    assert f"{CJ}-IMP-12" in mensaje
    assert f"{CJ}-IMP-08" in mensaje
    # El orden: primero el que el plano DIBUJA «IMP-08».
    assert mensaje.index(f"{CJ}-IMP-12") < mensaje.index(f"{CJ}-IMP-08")
    # Y cada camino dice a qué mueble lleva, no sólo su código.
    assert "dibuja «IMP-08»" in mensaje
    assert "se dibuja con su propio código" in mensaje
    # Lo que ya no se dice, porque mandaba al mueble equivocado.
    assert "del que quisiste" not in mensaje


def test_el_mensaje_ambiguo_no_miente_sobre_el_mueble_que_tiene_ese_codigo(client, admin):
    """El segundo camino no siempre es «el que se dibuja con su propio código».

    Con la fila «IMP-12», el mueble que TIENE ese código es el que el plano
    dibuja «IMP-08». Describirlo como «el que se dibuja con su propio código»
    sería una segunda trampa dentro del mismo mensaje.
    """
    _planos(client, admin)
    mensaje = _validar(client, admin, [_fila(espacio="IMP-12")])["filas"][0]["mensajes"][0]
    assert f"{CJ}-IMP-14" in mensaje                       # el que el plano dibuja «IMP-12»
    assert f"{CJ}-IMP-12" in mensaje                       # el que tiene ese código
    assert mensaje.index(f"{CJ}-IMP-14") < mensaje.index(f"{CJ}-IMP-12")
    assert "aunque el plano lo dibuje «IMP-08»" in mensaje
    assert "se dibuja con su propio código" not in mensaje


def test_el_codigo_completo_desempata(client, admin):
    """El mensaje pide el código completo, así que el código completo tiene que
    entrar: los nombres dibujados son cortos —es lo que cabe en una cajita del
    plano—, de modo que «CIUDAD JARDIN-IMP-08» calza una llave y ningún nombre.
    Sin esta salida el rechazo sería un callejón: los seis códigos pisados
    quedarían imposibles de contratar por planilla.

    Y es, además, lo que manda **vender de a uno desde el mapa**: el contrato
    multiespacio entra por este mismo endpoint con
    ``espacio: fullSpaceCode(...)`` (``Contrato.tsx:329``). Ahí no hay nada que
    desempatar —se señaló el mueble con el dedo— y tiene que seguir andando.
    """
    _planos(client, admin)
    body = _validar(client, admin, [
        _fila(2, espacio=f"{CJ}-IMP-08"),
        _fila(3, espacio=f"{CJ}-IMP-12"),
    ])
    # ENTRAN las dos, que es lo que este test fija. Entran **con aviso**: los dos
    # muebles tienen un gemelo de nombre en el plano y eso hay que decirlo (ver
    # los tests de la colisión, más abajo). Lo que no pueden ser es «error»: ahí
    # los seis códigos pisados quedarían imposibles de contratar y se rompería
    # Vender, que manda siempre el código completo.
    assert [f["estado"] for f in body["filas"]] == ["aviso", "aviso"]
    assert [f["codigo"] for f in body["filas"]] == [f"{CJ}-IMP-08", f"{CJ}-IMP-12"]
    assert body["errores"] == 0


# ─── El aviso: la fila entra, pero el mueble tiene un gemelo de nombre ────────
#
# Rechazar el código completo no es una opción: los dos muebles son FÍSICAMENTE
# DISTINTOS, contratar los dos es legítimo, y Vender manda siempre el código
# completo. Entonces no se rechaza: se avisa, y se avisa de manera imposible de
# pasar por alto, que es la categoría que esta pantalla ya tiene.

def test_el_codigo_completo_del_mueble_pisado_entra_con_aviso_y_nombra_al_otro(client, admin):
    """El residuo que dejaba viva la doble venta, medido por el verificador.

    `CIUDAD JARDIN-IMP-08` es el mueble que el plano NO rotula «IMP-08» —lo
    rotula con su propio código— mientras otro, el de código `IMP-12`, sí se
    dibuja así. Quien leyó el plano y siguió el consejo del rechazo llegaba acá,
    al mueble que no estaba mirando, y la fila entraba sin una palabra: dos
    cajas «IMP-08 · libre 16 sep», dos proveedores, el mismo periodo.

    Ahora entra —tiene que entrar— pero **con aviso**, y el aviso dice qué se
    está por contratar y cuál es el otro, los dos con su código completo.
    """
    _planos(client, admin)
    body = _confirmar(client, admin, [_fila(espacio=f"{CJ}-IMP-08")])

    # Entra: el mueble existe, se alquila, y el contrato se crea.
    assert body["creados"] == 1
    fila = body["filas"][0]
    assert fila["estado"] == "aviso"          # ni "ok" callado ni "error" que lo prohíbe
    assert fila["codigo"] == f"{CJ}-IMP-08"

    aviso = " ".join(fila["mensajes"])
    assert f"{CJ}-IMP-08" in aviso            # a qué mueble va el contrato
    assert f"{CJ}-IMP-12" in aviso            # cuál es el OTRO, con su código completo
    assert "«IMP-08»" in aviso                # el rótulo que los confunde
    assert "se dibuja con su propio código" in aviso


def test_el_mueble_renombrado_avisa_con_que_nombre_lo_dibuja_el_plano(client, admin):
    """El caso simétrico: la fila cae bien, pero el plano lo dibuja «IMP-08».

    `CIUDAD JARDIN-IMP-12` es el mueble correcto para quien leyó el plano, y el
    contrato entra donde se pidió. Igual merece su aviso: ese nombre dibujado es
    el código de OTRO mueble de la sede, así que cualquiera que después lea
    «IMP-08» —en el plano, en la planilla, en el correo de montaje— va a creer
    que se contrató el otro.

    Este mueble choca por las dos puntas a la vez: se dibuja «IMP-08», que es el
    código de otro, y su propio código «IMP-12» es el nombre dibujado de un
    tercero (el de código IMP-14). Los dos avisos salen, y el segundo no repite
    el encabezado porque la pantalla los junta en un solo párrafo.
    """
    _planos(client, admin)
    body = _confirmar(client, admin, [_fila(espacio=f"{CJ}-IMP-12")])
    assert body["creados"] == 1
    fila = body["filas"][0]
    assert fila["estado"] == "aviso"
    assert fila["nombre_dibujado"] == "IMP-08"

    aviso = " ".join(fila["mensajes"])
    assert f"{CJ}-IMP-12" in aviso                      # a qué mueble va
    assert "que el plano dibuja «IMP-08»" in aviso      # con qué nombre lo dibuja
    assert f"{CJ}-IMP-08" in aviso                      # de quién es ese nombre
    assert f"{CJ}-IMP-14" in aviso                      # y quién se dibuja «IMP-12»


def test_una_fila_sin_colisiones_no_gana_ningun_aviso_nuevo(client, admin):
    """Lo que hay que cuidar: los avisos que salen en TODAS las filas se ignoran.

    Es la regla que `docs/ESTADO.md` §«Carga masiva» ya escribe para «proveedor
    nuevo», que se dice sin pintar la fila justo por esto. Un mueble sin gemelo
    de nombre —el caso de casi todas las filas de casi todas las planillas— entra
    exactamente como antes: verde, y sin una línea de más.
    """
    _planos(client, admin)

    # `IMP-07` no tiene nomenclatura y nadie se dibuja «IMP-07», aunque esté en el
    # mismo plano sucio donde seis muebles sí chocan.
    fila = _validar(client, admin, [_fila(espacio=f"{CJ}-IMP-07")])["filas"][0]
    assert fila["estado"] == "ok"
    assert not [m for m in fila["mensajes"] if "Ojo" in m]

    # Y el plano limpio: las mismas filas que arriba avisan, acá no dicen nada.
    limpio = [{k: v for k, v in f.items() if k != "nomenclatura"} for f in PLANO_CJ]
    r = client.put(f"/api/layout/{CJ}",
                   json={"fixtures": limpio, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    body = _validar(client, admin, [
        _fila(2, espacio=f"{CJ}-IMP-08"),
        _fila(3, espacio=f"{CJ}-IMP-12"),
        _fila(4, espacio="IMP-07"),
    ])
    assert [f["estado"] for f in body["filas"]] == ["ok", "ok", "ok"]
    assert body["avisos"] == 0
    assert not [m for f in body["filas"] for m in f["mensajes"] if "Ojo" in m]


def test_un_nombre_a_mano_que_no_pisa_ningun_codigo_no_molesta(client, admin):
    """La validación es contra la AMBIGÜEDAD, no contra renombrar.

    Un mueble llamado «Punta del pan» no le quita el nombre a nadie, y su código
    se sigue contratando como siempre. Si esto fallara, la regla estaría
    prohibiendo la nomenclatura entera en vez del choque.
    """
    fixtures = [dict(f) for f in PLANO_CJ]
    for f in fixtures:
        if f["code"] == "PUN-06":
            f["nomenclatura"] = "Punta del pan"
    r = client.put(f"/api/layout/{CJ}",
                   json={"fixtures": fixtures, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text
    fila = _validar(client, admin, [_fila(espacio="PUN-06")])["filas"][0]
    assert fila["estado"] == "ok"
    assert fila["codigo"] == f"{CJ}-PUN-06"
    assert fila["nombre_dibujado"] == "Punta del pan"


def test_la_cara_b_de_la_gondola_doble_conserva_su_sufijo(client, admin):
    """Las dos caras comparten fixture y son espacios distintos: si al rearmar el
    código completo se perdiera el «-B», las dos caras caerían en el mismo
    espacio y una taparía el contrato de la otra."""
    gondola = {
        "id": "gon1", "code": "GON-01", "sede": CJ, "type": "gondola_doble",
        "label": "Góndola Doble", "cx": 9.0, "cz": 3.0, "rotY": 0,
        "w": 3.6, "d": 0.9, "h": 1.8, "color": "#64748b", "status": "free",
        "supplierName": "", "brandCategory": "", "negotiatedValue": 0,
        "startDate": "", "endDate": "", "observation": "",
    }
    r = client.put(f"/api/layout/{CJ}",
                   json={"fixtures": PLANO_CJ + [gondola], "base_updated_at": None},
                   headers=admin)
    assert r.status_code == 200, r.text

    body = _confirmar(client, admin, [
        _fila(2, espacio="GON-01"),
        _fila(3, espacio=f"{CJ}-GON-01-B", proveedor="COLGATE"),
    ])
    assert body["creados"] == 2
    assert {f"{CJ}-GON-01", f"{CJ}-GON-01-B"} <= _espacios(client, admin)


# ─── El eco de la revisión: el nombre que la persona reconoce ─────────────────

def test_nombre_dibujado_viaja_con_la_nomenclatura_puesta_a_mano(client, admin):
    """Sin este campo la revisión no puede mostrar el desvío: `codigo` repite lo
    que la persona tecleó con la sede antepuesta y `nombre` es el label del tipo
    —«Impulsador Marca» para los once impulsadores—, así que los dos campos son
    idénticos para el mueble correcto y para el equivocado."""
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio=f"{CJ}-IMP-12")])["filas"][0]
    assert fila["codigo"] == f"{CJ}-IMP-12"
    assert fila["nombre"] == "Impulsador Marca"      # el label, como antes
    assert fila["nombre_dibujado"] == "IMP-08"       # lo que se lee en el plano


def test_nombre_dibujado_es_none_cuando_el_mueble_se_dibuja_con_su_codigo(client, admin):
    """El caso normal. Que sea None y no el código repetido importa: la pantalla
    de revisión muestra la columna sólo cuando hay algo distinto que mostrar."""
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio=f"{CJ}-IMP-07")])["filas"][0]
    assert fila["estado"] == "ok"
    assert fila["nombre_dibujado"] is None


# ─── La sede: el segundo agujero, sin nomenclatura de por medio ───────────────

def test_la_fila_sin_sede_no_entra(client, admin):
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio="IMP-07")], sede=None)["filas"][0]
    assert fila["estado"] == "error"
    assert "Falta la sede" in fila["mensajes"][0]


def test_el_codigo_corto_nunca_crea_un_espacio_nuevo(client, admin):
    """Era una doble venta literal, sin ningún renombre de por medio.

    Sin sede el código quedaba corto —«IMP-07»— y el plano lo resolvía igual,
    porque se comparaba también contra el código pelado. La fila pasaba y creaba
    una SEGUNDA fila de `spaces` para el mismo mueble físico, con su propio
    contrato y ciega al choque del otro.
    """
    _planos(client, admin)
    antes = _espacios(client, admin)
    body = _confirmar(client, admin, [_fila(espacio="IMP-07")], sede=None)
    assert body["creados"] == 0
    assert _espacios(client, admin) == antes
    assert "IMP-07" not in _espacios(client, admin)


def test_el_espacio_se_crea_con_la_sede_del_fixture(client, admin):
    """Lo que se guarda es el código completo del plano, no el texto de la fila."""
    _planos(client, admin)
    body = _confirmar(client, admin, [_fila(espacio="IMP-07")])
    assert body["creados"] == 1
    assert f"{CJ}-IMP-07" in _espacios(client, admin)
    espacios = {s["code"]: s for s in client.get("/api/spaces/", headers=admin).json()}
    assert espacios[f"{CJ}-IMP-07"]["sede"] == CJ


def test_la_sede_de_otra_tienda_avisa_donde_si_existe(client, admin):
    """Un tipeo en la columna Sede mandaba el contrato a otro supermercado sin un
    aviso. Decir dónde sí está es la diferencia entre corregirlo y salir a buscar
    un error de tipeo que no existe."""
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio="IMP-07")], sede="NAVE")["filas"][0]
    assert fila["estado"] == "error"
    mensaje = fila["mensajes"][0]
    assert "IMP-07" in mensaje and "no existe en NAVE" in mensaje
    assert CJ in mensaje
    assert "NAVE-IMP-07" not in _espacios(client, admin)


def test_un_codigo_que_no_existe_en_ninguna_sede_sigue_diciendo_lo_de_siempre(client, admin):
    _planos(client, admin)
    fila = _validar(client, admin, [_fila(espacio="IMP-99")])["filas"][0]
    assert fila["estado"] == "error"
    assert f"{CJ}-IMP-99" in fila["mensajes"][0]


# ─── El que cierra la fase ────────────────────────────────────────────────────

def test_el_mismo_espacio_del_plano_no_queda_contratado_dos_veces(client, admin):
    """El escenario del dueño, en una sola planilla.

    Para quien mira el plano, la fila «IMP-12» y la fila «IMP-08» son el MISMO
    espacio: el mueble de código IMP-12 se dibuja «IMP-08» y no hay ninguna otra
    cajita rotulada así (la del código IMP-08 no dibuja nombre alguno). Antes las
    dos entraban con las mismas fechas y el mapa quedaba con dos cajas rotuladas
    igual, con dos proveedores.
    """
    _planos(client, admin)
    body = _confirmar(client, admin, [
        _fila(2, espacio="IMP-12", proveedor="CASA LUKER"),
        _fila(3, espacio="IMP-08", proveedor="COLGATE"),
    ])
    assert body["creados"] == 0
    assert [f["estado"] for f in body["filas"]] == ["error", "error"]
    assert _espacios(client, admin) & {f"{CJ}-IMP-08", f"{CJ}-IMP-12"} == set()


def test_vendido_el_mueble_por_su_codigo_completo_la_segunda_venta_se_frena(client, admin):
    """La misma doble venta, en dos cargas distintas y por el camino que sí entra.

    Primero se contrata de verdad el mueble que el plano dibuja «IMP-08», con su
    código completo. Después llega la fila que escribiría quien lee el plano y
    quiere vender «el IMP-08», con las mismas fechas. Antes se guardaba sin una
    sola advertencia; ahora no entra, y el mueble no queda vendido dos veces.
    """
    _planos(client, admin)
    primero = _confirmar(client, admin, [_fila(2, espacio=f"{CJ}-IMP-12")])
    assert primero["creados"] == 1

    body = _confirmar(client, admin, [_fila(3, espacio="IMP-08", proveedor="COLGATE")])
    assert body["creados"] == 0
    fila = body["filas"][0]
    assert fila["estado"] == "error"
    assert "ambiguo" in fila["mensajes"][0]
    assert f"{CJ}-IMP-08" not in _espacios(client, admin)

    # Y el que sí quedó vendido se puede reconocer: la revisión dice con qué
    # nombre lo dibuja el plano.
    assert primero["filas"][0]["nombre_dibujado"] == "IMP-08"


# ─── La regla que no se negocia ───────────────────────────────────────────────

def test_un_plano_que_ya_esta_mal_se_guarda_y_se_sigue_usando(client, admin):
    """En CIUDAD JARDIN hay seis muebles cuya nomenclatura pisa el código de otro.

    La validación nueva impide CREAR casos nuevos; los que ya existen tienen que
    poder abrirse, mirarse y guardarse. Si un arreglo dejara un plano existente
    sin poder guardarse, el arreglo está mal.
    """
    _planos(client, admin)
    r = client.get(f"/api/layout/{CJ}", headers=admin)
    assert r.status_code == 200
    fixtures = r.json()["fixtures"]
    assert len(fixtures) == len(PLANO_CJ)

    # Se vuelve a guardar tal cual, con los seis nombres que pisan códigos ajenos.
    r = client.put(f"/api/layout/{CJ}",
                   json={"fixtures": fixtures, "base_updated_at": None}, headers=admin)
    assert r.status_code == 200, r.text

    # Y los espacios de ese plano se siguen contratando por su código completo.
    body = _confirmar(client, admin, [_fila(espacio=f"{CJ}-IMP-09")])
    assert body["creados"] == 1


# ─── La regla del nombre, sin base de datos de por medio ──────────────────────

def test_el_nombre_efectivo_es_el_mismo_que_dibuja_el_plano():
    """`nombre_de_mueble` espeja `nombreDeMueble` de `utils/nomenclatura.ts:150`.

    Si las dos reglas se separan, el backend rechaza ambigüedades que el plano no
    dibuja —o deja pasar las que sí—, y el sistema vuelve a mentir.
    """
    from app.services.layout_lookup import nombre_de_mueble, nombre_propio

    assert nombre_de_mueble({"code": "IMP-12", "nomenclatura": "IMP-08"}) == "IMP-08"
    assert nombre_de_mueble({"code": "IMP-12", "nomenclatura": "  "}) == "IMP-12"
    assert nombre_de_mueble({"code": "IMP-12", "nomenclatura": None}) == "IMP-12"
    assert nombre_de_mueble({"code": "IMP-12"}) == "IMP-12"

    assert nombre_propio({"code": "IMP-12", "nomenclatura": "IMP-08"}) is True
    assert nombre_propio({"code": "IMP-12", "nomenclatura": "imp-12"}) is False
    assert nombre_propio({"code": "IMP-12"}) is False
