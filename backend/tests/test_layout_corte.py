"""El layout guarda lo que ES el mueble, y nada de lo que se le VENDIÓ.

`PUT /api/layout/{sede}` descarta los siete campos de contrato antes de guardar.
Vivieron mucho tiempo ahí adentro al mismo tiempo que en `space_leases`: dos
lugares para el mismo hecho y nada que los obligara a coincidir. El plano nunca
le escribió a la base —ese camino no existe— así que el desfase se producía solo
y se veía siempre igual: «el espacio está libre y el sistema dice que está
ocupado».

Lo que se prueba acá es el corte y su única excepción: el precio por repisa.
"""

MUEBLE = {
    "id": "f1", "code": "IMP-17", "sede": "NAVE", "type": "punta",
    "label": "IMP-17", "cx": 3, "cz": 8, "rotY": 0,
    "w": 0.9, "d": 0.4, "h": 1.8, "color": "#6366f1",
}

CONTRATO = {
    "status": "occupied", "supplierName": "Colgate", "brandCategory": "Aseo",
    "negotiatedValue": 1_000_000, "startDate": "2026-09-01",
    "endDate": "2026-10-01", "observation": "vitrina",
}


def _guardar(client, headers, fixtures, sede="NAVE", base=None):
    r = client.put(f"/api/layout/{sede}", headers=headers,
                   json={"fixtures": fixtures, "base_updated_at": base})
    assert r.status_code == 200, r.text
    return r.json()


def _leer(client, headers, sede="NAVE"):
    r = client.get(f"/api/layout/{sede}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["fixtures"]


# ─── El corte ────────────────────────────────────────────────────────────────

def test_EL_CONTRATO_NO_ENTRA_AL_PLANO(client, admin):
    _guardar(client, admin, [{**MUEBLE, **CONTRATO}])
    guardado = _leer(client, admin)[0]
    for campo in CONTRATO:
        assert campo not in guardado, f"«{campo}» sobrevivió al corte"
    # Lo que ES el mueble queda intacto.
    assert guardado["code"] == "IMP-17"
    assert guardado["w"] == 0.9


def test_la_cara_B_tampoco_guarda_contrato(client, admin):
    doble = {**MUEBLE, "gondolaType": "double",
             "faceB": {**CONTRATO, "montajeEstado": "montado"}}
    _guardar(client, admin, [doble])
    cara_b = _leer(client, admin)[0]["faceB"]
    for campo in CONTRATO:
        assert campo not in cara_b, f"«{campo}» sobrevivió en la cara B"
    # El montaje NO es comercial: se queda.
    assert cara_b["montajeEstado"] == "montado"


def test_una_cara_B_que_solo_tenia_contrato_desaparece(client, admin):
    """Dejarla como `{}` sería guardar una cara B que no dice nada."""
    _guardar(client, admin, [{**MUEBLE, "gondolaType": "double", "faceB": dict(CONTRATO)}])
    assert "faceB" not in _leer(client, admin)[0]


def test_se_descarta_en_silencio_no_se_rechaza(client, admin):
    """Una pestaña abierta desde antes del despliegue los sigue mandando.

    Trabarle el plano por eso sería romperle el trabajo a alguien por algo que
    no puede ni entender ni arreglar.
    """
    r = client.put("/api/layout/NAVE", headers=admin,
                   json={"fixtures": [{**MUEBLE, **CONTRATO}], "base_updated_at": None})
    assert r.status_code == 200


# ─── La única excepción: la plata por repisa ─────────────────────────────────

def _con_slots(**extra):
    return {**MUEBLE, "slots": [
        {"id": "s1", "x": 0, "w": 0.5, "negotiatedValue": 300_000,
         "status": "occupied", "supplierName": "Fabuloso", **extra},
    ]}


def test_LOS_SLOTS_NO_SE_CORTAN(client, admin):
    """El estado por repisa no tiene contraparte en ninguna tabla: tiene UNA
    fuente y no puede discrepar con nada. El desfase necesita dos verdades."""
    _guardar(client, admin, [_con_slots()])
    slot = _leer(client, admin)[0]["slots"][0]
    assert slot["status"] == "occupied"
    assert slot["supplierName"] == "Fabuloso"
    assert slot["negotiatedValue"] == 300_000


def test_el_mercaderista_no_ve_la_plata_de_los_slots(client, admin, worker):
    _guardar(client, admin, [_con_slots()])
    slot = _leer(client, worker)[0]["slots"][0]
    assert "negotiatedValue" not in slot
    assert slot["supplierName"] == "Fabuloso"


def test_UN_GUARDADO_SIN_PRECIO_NO_BORRA_LA_PLATA_DEL_SLOT(client, admin):
    """La copia redactada de vuelta.

    El mueble y su cara B ya no llevan precio —lo corta el contrato— pero el
    slot sí, y sale redactado para un mercaderista. Si esa copia volviera a
    guardarse, poner en cero la plata de una sede entera no se podría deshacer.
    Una llave AUSENTE se rellena; sólo un admin escribe, pero el seguro se queda.
    """
    _guardar(client, admin, [_con_slots()])
    redactado = {**MUEBLE, "slots": [
        {"id": "s1", "x": 0, "w": 0.5, "status": "occupied", "supplierName": "Fabuloso"},
    ]}
    _guardar(client, admin, [redactado])
    assert _leer(client, admin)[0]["slots"][0]["negotiatedValue"] == 300_000


def test_un_cero_escrito_a_proposito_manda(client, admin):
    """Una llave presente es una edición de verdad, el 0 incluido: liberar la
    repisa (todo lo comercial en vacío) la deja en 0.

    Cambio a propósito (auditoría P1-15, 2026-10-30): lo comercial de una
    repisa vendida es de sólo lectura, así que bajarle el valor y dejarla
    ocupada ya no se guarda (409 `repisas_vendidas`); se pasa a contrato o se
    libera."""
    _guardar(client, admin, [_con_slots()])
    bajado = {**MUEBLE, "slots": [
        {"id": "s1", "x": 0, "w": 0.5, "negotiatedValue": 0,
         "status": "occupied", "supplierName": "Fabuloso"},
    ]}
    r = client.put("/api/layout/NAVE", headers=admin, json={"fixtures": [bajado], "base_updated_at": None})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "repisas_vendidas", r.text
    liberado = {**MUEBLE, "slots": [
        {"id": "s1", "x": 0, "w": 0.5, "negotiatedValue": 0, "status": "free", "supplierName": "",
         "brandCategory": "", "startDate": "", "endDate": ""},
    ]}
    _guardar(client, admin, [liberado])
    assert _leer(client, admin)[0]["slots"][0]["negotiatedValue"] == 0


def test_rellenar_el_slot_NO_resucita_el_precio_del_mueble(client, admin):
    """La línea que no se puede mover.

    El relleno mira el snapshot anterior. Si ese snapshot fuera viejo —de antes
    del corte— y el relleno tocara el mueble, volvería a meter en el JSON justo
    lo que se acaba de sacar, y el desfase entero volvería con él.
    """
    _guardar(client, admin, [{**_con_slots(), **CONTRATO}])
    _guardar(client, admin, [_con_slots()])
    guardado = _leer(client, admin)[0]
    assert "negotiatedValue" not in guardado
    assert "supplierName" not in guardado
    assert guardado["slots"][0]["negotiatedValue"] == 300_000
