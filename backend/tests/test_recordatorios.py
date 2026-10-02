"""Los avisos de que un contrato se cae: 30, 15 y 6 días.

Lo que se prueba no es que se mande un correo. Es que el aviso NO SE PIERDA
cuando el servidor estuvo dormido el día justo, que no salgan tres de golpe por
eso mismo, y que llegue a la libreta de contactos de la sede y no a una lista
global que hoy está vacía — que es la razón por la que estos correos existían y
no llegaban.
"""
from datetime import timedelta

import pytest

from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

# Los módulos de `app` se importan DENTRO de las fixtures, nunca arriba:
# `conftest` los purga de `sys.modules` entre pruebas para que cada una arme su
# propio motor contra su propio archivo. Un import de módulo se resolvería una
# sola vez, en la carga, y todas las pruebas quedarían hablándole a la base de
# la primera — que para entonces ya está borrada. `app.fechas`, arriba, es la
# excepción: es sólo el reloj de Colombia, sin motor ni variables.


@pytest.fixture()
def rem(client):
    """El módulo de recordatorios de ESTA prueba."""
    from app.services import reminders
    return reminders


@pytest.fixture()
def db(client):
    """Una sesión contra la base de ESTA prueba.

    Al terminar se cierra la sesión Y se suelta el motor. Cerrar sola no
    alcanza: el pool se queda con la conexión abierta contra un archivo que
    `conftest` borra enseguida, y la prueba SIGUIENTE falla por un motivo que no
    tiene nada que ver con ella. Es la misma razón por la que `conftest` llama a
    `olvidar_motores()` antes de purgar los módulos.
    """
    from app.database import SessionLocal, engine
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def _log():
    from app.models.models import NotificationLog
    return NotificationLog


_n = 0


def _contrato(db, dias, sede="NAVE", code=None):
    """Un contrato activo que vence dentro de `dias` (negativo = ya venció).

    El código se genera para no chocar con los espacios que la base de pruebas
    ya trae sembrados.
    """
    from app.models.models import Space, SpaceLease, Supplier, SpaceStatus
    global _n
    _n += 1
    code = code or f"NAVE-TEST-{_n:02d}"
    # La base de pruebas ya viene con proveedores sembrados: se reusa el que
    # esté, que además es lo que pasa en la vida real.
    prov = db.query(Supplier).filter(Supplier.name == "ALPINA").first()
    if prov is None:
        prov = Supplier(name="ALPINA")
        db.add(prov)
        db.flush()
    espacio = Space(
        code=code, svg_id=f"fix-{code}", name="Punta 03", zone="Pasillo 3",
        sede=sede, area_m2=1.2, status=SpaceStatus.occupied,
    )
    db.add(espacio)
    db.flush()
    contrato = SpaceLease(
        space_id=espacio.id, supplier_id=prov.id,
        start_date=hoy_en_colombia() - timedelta(days=60),
        end_date=hoy_en_colombia() + timedelta(days=dias),
        monthly_rent=800_000, is_active=True,
    )
    db.add(contrato)
    db.commit()
    return contrato


@pytest.fixture()
def correos(rem, monkeypatch):
    """Intercepta los envíos. Devuelve la lista de (destinatarios, asunto)."""
    salidos = []
    monkeypatch.setattr(
        rem, "send_mail_to",
        lambda dest, asunto, _html: (salidos.append((dest, asunto)), True)[1],
    )
    return salidos


def _con_contactos(db, correo="comercial@galerias.co"):
    from app.auth import set_config
    import json
    set_config(db, "notify_contacts", json.dumps({
        "gerente": [correo], "by_sede": {"NAVE": {"admin": [], "mercaderista": []}},
    }))
    db.commit()


# ─── Los hitos ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("dias,hito", [
    (40, None), (31, None),          # todavía no entra en el primero
    (30, 30), (29, 30), (16, 30),    # el de 30 cubre hasta que entra el de 15
    (15, 15), (14, 15), (7, 15),
    (6, 6), (5, 6), (0, 6), (-3, 6), # el último cubre hasta después de vencido
])
def test_a_cada_contrato_le_toca_un_solo_hito(rem, dias, hito):
    assert rem._hito(dias, [30, 15, 6]) == hito


def test_el_hito_es_el_mas_chico_que_todavia_cubre(rem):
    """Es lo que evita que un contrato que aparece a 5 días reciba los tres
    correos de una vez: le toca el de 6 y nada más."""
    assert rem._hito(5, [30, 15, 6]) == 6


# ─── Que el aviso no se pierda ───────────────────────────────────────────────

def test_un_dia_perdido_no_pierde_el_aviso(client, db, rem, correos):
    """El bicho de fondo: se comparaba por igualdad exacta.

    En Render un servicio sin tráfico se apaga, y el día que despierta rara vez
    es exactamente el día 30. Con `days_left in reminder_days`, ese aviso no
    salía nunca. Ahora sale tarde, que es infinitamente mejor que no salir.
    """
    _con_contactos(db)
    _contrato(db, dias=28)

    assert rem.check_expiring_leases(db) == 1
    assert "28 días" in correos[0][1], "el asunto dice los días reales, no el hito"


def test_no_se_repite_aunque_el_hito_cubra_varios_dias(client, db, rem, correos):
    """El de 30 cubre de 30 a 16. Un correo, no quince."""
    _con_contactos(db)
    _contrato(db, dias=25)

    assert rem.check_expiring_leases(db) == 1
    assert rem.check_expiring_leases(db) == 0
    assert len(correos) == 1


def test_un_contrato_que_aparece_tarde_recibe_UNO_solo(client, db, rem, correos):
    """Con `<=` a secas saldrían los tres de golpe. Sale el de 6."""
    _con_contactos(db)
    _contrato(db, dias=4)

    assert rem.check_expiring_leases(db) == 1
    kinds = [n.kind for n in db.query(_log()).all()]
    assert kinds == ["expiry_6"]


def test_la_marca_lleva_el_hito_y_no_los_dias(client, db, rem, correos):
    """Si llevara los días, el aviso de «30» mandado el día 28 dejaría el hito
    sin marcar y volvería a salir el 27, y el 26, y el 25."""
    _con_contactos(db)
    _contrato(db, dias=28)
    rem.check_expiring_leases(db)

    assert [n.kind for n in db.query(_log()).all()] == ["expiry_30"]


# ─── A quién le llega ────────────────────────────────────────────────────────

def test_va_a_la_libreta_de_la_sede(client, db, rem, correos):
    """Iba a `notify_emails`, la lista global vieja, mientras los correos de
    contrato ya iban por la libreta. Con la libreta cargada y esa lista vacía
    —la instalación normal hoy— el aviso no le llegaba a NADIE."""
    _con_contactos(db, "gerente@galerias.co")
    _contrato(db, dias=30)

    assert rem.check_expiring_leases(db) == 1
    assert correos[0][0] == ["gerente@galerias.co"]


def test_sin_contactos_no_se_manda_y_no_se_marca(client, db, rem, correos):
    """Y sobre todo NO se marca: marcarlo daría por avisado algo que no salió,
    y el aviso se perdería para siempre cuando alguien cargue los contactos."""
    _contrato(db, dias=30)

    assert rem.check_expiring_leases(db) == 0
    assert db.query(_log()).count() == 0


def test_cargar_los_contactos_despues_recupera_el_aviso(client, db, rem, correos):
    _contrato(db, dias=30)
    assert rem.check_expiring_leases(db) == 0

    _con_contactos(db)
    assert rem.check_expiring_leases(db) == 1


# ─── El contenido ────────────────────────────────────────────────────────────

def test_el_asunto_no_miente_sobre_los_dias(client, db, rem, correos):
    _con_contactos(db)
    _contrato(db, dias=0)
    rem.check_expiring_leases(db)
    assert "vence hoy" in correos[0][1]


def test_un_vencido_lo_dice_como_vencido(client, db, rem, correos):
    _con_contactos(db)
    _contrato(db, dias=-3)
    rem.check_expiring_leases(db)
    assert "venció hace 3 días" in correos[0][1]
