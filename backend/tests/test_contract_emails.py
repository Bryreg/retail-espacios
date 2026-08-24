"""Los tres correos que salen al guardar un contrato.

La regla dura del proyecto dice que un worker nunca ve plata. El correo se la
saltaba: antes salía UN solo mensaje con el valor negociado a una lista global,
así que el mercaderista que va a montar la exhibición recibía el precio. Estas
pruebas existen para que eso no vuelva a pasar por descuido.

Se capturan los envíos en vez de mandarlos: lo que importa es el CONTENIDO, y
un SMTP de mentira agrega una pieza que se puede romper sola.
"""
import re
from datetime import date, timedelta

import pytest

FIXTURES = [
    {
        "id": "p1", "code": "PUN-01", "nomenclatura": "PUN-01", "sede": "NAVE",
        "type": "punta", "label": "Punta pasillo 1", "cx": 4.0, "cz": 6.4,
        "rotY": 0, "w": 1.0, "d": 0.6, "h": 1.6, "color": "#7c3aed",
        "status": "free", "supplierName": "", "brandCategory": "",
        "negotiatedValue": 0, "startDate": "", "endDate": "", "observation": "",
    },
    {
        "id": "c1", "code": "CAJ-01", "nomenclatura": "CAJ-01", "sede": "NAVE",
        "type": "checkout", "label": "Caja 1", "cx": 4.0, "cz": 2.0,
        "rotY": 0, "w": 1.8, "d": 0.7, "h": 1.1, "color": "#8b5cf6",
        "rentable": False, "status": "free", "supplierName": "",
        "brandCategory": "", "negotiatedValue": 0, "startDate": "",
        "endDate": "", "observation": "",
    },
]


@pytest.fixture()
def enviados(client, admin, monkeypatch):
    """Cada correo que la app intenta mandar, capturado tal cual."""
    import app.routers.spaces as spaces

    capturados: list[dict] = []

    def fake(recipients, subject, html_body):
        capturados.append({"to": recipients, "subject": subject, "html": html_body})

    monkeypatch.setattr(spaces, "send_mail_to_bg", fake)
    return capturados


def _texto(html: str) -> str:
    """El HTML sin etiquetas: así se lee el correo, no como código."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def _contratar(client, admin, code="NAVE-PUN-01", monto=1_800_000):
    client.put(
        "/api/layout/NAVE",
        json={"fixtures": FIXTURES, "base_updated_at": None},
        headers=admin,
    )
    # Los roles de la libreta son los de la organización real —admin de sede y
    # mercaderista—, no los buckets del correo.
    r = client.put(
        "/api/notifications/contacts",
        json={"gerente": [], "by_sede": {"NAVE": {
            "admin": ["jefe@galerias.co"],
            "mercaderista": ["merca@galerias.co"],
        }}},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": code, "name": "Punta pasillo 1", "zone": "Z",
              "sede": "NAVE", "area_m2": 0.6},
        headers=admin,
    )
    space_id = r.json()["id"]
    sup = client.post(
        "/api/suppliers/find-or-create",
        json={"name": "Nutresa", "email": "ventas@nutresa.co"},
        headers=admin,
    ).json()
    hoy = date.today()
    r = client.post(
        f"/api/spaces/{space_id}/leases",
        json={
            "supplier_id": sup["id"], "marca": "Chocolates",
            "start_date": (hoy + timedelta(days=3)).isoformat(),
            "end_date": (hoy + timedelta(days=33)).isoformat(),
            "monthly_rent": monto,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    return r


def _por_destinatario(enviados, correo):
    for m in enviados:
        if correo in m["to"]:
            return m
    return None


def test_a_contract_sends_one_email_per_role(client, admin, enviados):
    _contratar(client, admin)
    destinos = sorted(d for m in enviados for d in m["to"])
    assert destinos == ["jefe@galerias.co", "merca@galerias.co", "ventas@nutresa.co"]


def test_the_merchandiser_email_has_no_money(client, admin, enviados):
    """La prueba que justifica el archivo entero."""
    _contratar(client, admin, monto=1_800_000)
    montaje = _por_destinatario(enviados, "merca@galerias.co")
    assert montaje is not None
    texto = _texto(montaje["html"])
    assert "1.800.000" not in texto
    assert "$" not in texto
    # Ni el número suelto, por si algún día cambia el formato.
    assert "1800000" not in texto.replace(".", "").replace(",", "")


def test_the_commercial_email_does_have_the_money(client, admin, enviados):
    """El otro lado de la misma regla: al comercial sí le sirve el valor."""
    _contratar(client, admin, monto=1_800_000)
    comercial = _por_destinatario(enviados, "jefe@galerias.co")
    assert comercial is not None
    assert "1.800.000" in _texto(comercial["html"])


def test_the_merchandiser_email_says_where_it_is(client, admin, enviados):
    """Saber el código no es saber dónde queda. El correo lleva la ubicación
    escrita porque el texto llega a cualquier cliente; el plano dibujado vive
    del otro lado del enlace."""
    _contratar(client, admin)
    texto = _texto(_por_destinatario(enviados, "merca@galerias.co")["html"])
    assert "Dónde queda" in texto
    # La caja está a 4,4 m de la punta: se redondea a 4.
    assert "4 m de las cajas" in texto


def test_the_merchandiser_email_links_to_the_map(client, admin, enviados):
    _contratar(client, admin)
    html = _por_destinatario(enviados, "merca@galerias.co")["html"]
    assert "?montar=NAVE-PUN-01" in html
    assert "plano" in _texto(html).lower()


def test_the_merchandiser_email_announces_the_photo_is_mandatory(client, admin, enviados):
    """Que se entere en el correo y no parado frente al mueble."""
    _contratar(client, admin)
    texto = _texto(_por_destinatario(enviados, "merca@galerias.co")["html"]).lower()
    assert "foto es obligatoria" in texto


def test_a_space_with_no_fixture_still_sends_the_email(client, admin, enviados):
    """Un contrato sobre un espacio que no está en el plano —sembrado, o
    borrado después— no puede quedarse sin aviso solo porque no hay ubicación
    que calcular."""
    client.put("/api/layout/NAVE", json={"fixtures": FIXTURES, "base_updated_at": None}, headers=admin)
    client.put(
        "/api/notifications/contacts",
        json={"gerente": [], "by_sede": {"NAVE": {"mercaderista": ["merca@galerias.co"]}}},
        headers=admin,
    )
    r = client.post(
        "/api/spaces/find-or-create",
        json={"code": "NAVE-FANTASMA", "name": "No está en el plano",
              "zone": "Z", "sede": "NAVE", "area_m2": 1.0},
        headers=admin,
    )
    sup = client.post("/api/suppliers/find-or-create", json={"name": "X"}, headers=admin).json()
    hoy = date.today()
    r2 = client.post(
        f"/api/spaces/{r.json()['id']}/leases",
        json={"supplier_id": sup["id"], "marca": "M",
              "start_date": hoy.isoformat(),
              "end_date": (hoy + timedelta(days=5)).isoformat(),
              "monthly_rent": 100_000},
        headers=admin,
    )
    assert r2.status_code == 201, r2.text
    montaje = _por_destinatario(enviados, "merca@galerias.co")
    assert montaje is not None
    assert "Dónde queda" not in _texto(montaje["html"])
