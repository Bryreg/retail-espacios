"""Las fotos duran lo que dura el contrato (`services/fotos_vencidas.py`).

Se guardan mientras dure el contrato; si se renueva, el plazo se alarga; si
termina y no se renueva, a los 5 días se borran las fotos de montaje y las
planometrías de toda la cadena. Lo que se prueba acá es sobre todo lo que NO
se tiene que borrar: borrar es irreversible, y ante la duda se conserva.

Dos partes. La regla pura (`que_se_borra`, sin base, con `hoy` inyectado) y la
capa de base: el borrado de verdad, la bitácora, la API después del borrado y
el ciclo de mantenimiento (interruptor, borde del día de Colombia, aislamiento
entre clientes).

Los datos de base se siembran relativos al día REAL (contratos terminados hace
un mes) o en 2040 con el reloj movido: la pasada de arranque, que corre en un
hilo en paralelo con la prueba, sólo ensaya mientras el interruptor esté
apagado, que es como arranca toda prueba.
"""
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.fechas import ZONA_DEL_NEGOCIO as COL
from app.fechas import hoy as hoy_en_colombia  # el «hoy» del negocio: Colombia

# Los módulos de `app` se importan DENTRO de las pruebas: `conftest` los purga
# de `sys.modules` entre una y otra. `app.fechas`, arriba, es la excepción.

NOMBRES = {1: "Nutresa", 2: "Alpina", 3: "Colanta", 4: "Postobón", 5: "Colombina"}
CODIGOS = {i: f"NAVE-PUN-{i:02d}" for i in range(1, 11)}
JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


def d(s: str) -> date:
    return date.fromisoformat(s)


def col(s: str, h: int = 12, m: int = 0) -> datetime:
    """Un instante de Colombia, a mediodía por defecto."""
    return datetime.combine(d(s), time(h, m), tzinfo=COL)


def medianoche(s: str) -> datetime:
    return datetime.combine(d(s), time.min, tzinfo=COL)


UN_MICRO = timedelta(microseconds=1)


@pytest.fixture()
def fv(client):
    """El servicio de ESTA prueba (conftest purga los módulos entre pruebas)."""
    from app.services import fotos_vencidas
    return fotos_vencidas


def contrato(fv, id, desde, hasta, *, espacio=1, proveedor=1, nombre=None, correo="", marca=""):
    return fv.Contrato(
        id=id, space_id=espacio, supplier_id=proveedor,
        start_date=d(desde) if isinstance(desde, str) else desde,
        end_date=d(hasta) if isinstance(hasta, str) else hasta,
        proveedor=NOMBRES.get(proveedor, "") if nombre is None else nombre,
        correo=correo, marca=marca,
    )


def foto(fv, id, t, *, espacio=1, size=1000, codigo=None, es_cara=False, archivado=None, montajes=None):
    if montajes is None:
        montajes = (fv.Montaje(
            confirmado_en=t, space_code=CODIGOS[espacio] if codigo is None else codigo,
            archivado_en=archivado,
        ),)
    return fv.Foto(id=id, space_id=espacio, size=size, montajes=tuple(montajes), es_cara=es_cara)


def plano(fv, id, lease, *, size=500, kind="planometria", tipo="image/jpeg", subida=None):
    return fv.Planometria(id=id, lease_id=lease, size=size, kind=kind, content_type=tipo, subida_en=subida)


def plan(fv, contratos, fotos=(), planos=(), *, hoy, **kw):
    return fv.que_se_borra(contratos, fotos, planos, hoy=d(hoy), codigos=CODIGOS, **kw)


# ════════════════════════════════════════════════════════════════════════════
# La regla, sin base
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("hoy, borra", [
    ("2026-11-01", False),
    ("2026-11-05", False),  # el último día de gracia
    ("2026-11-06", True),   # la primera pasada del sexto día
    ("2026-12-20", True),
])
def test_cinco_dias_de_gracia_y_se_borra_el_sexto(fv, hoy, borra):
    """El ejemplo de la dueña: vence el 2026-10-31, se conserva todo del 1 al 5
    de noviembre y se borra en la primera pasada del 6."""
    assert fv.DIAS_DE_GRACIA == 5
    p = plan(fv, [contrato(fv, 1, "2026-10-01", "2026-10-31")],
             [foto(fv, 10, col("2026-10-15"))], [plano(fv, 20, 1)], hoy=hoy)
    assert p.fotos == ([10] if borra else [])
    assert p.planometrias == ([20] if borra else [])
    if not borra:
        assert dict(p.conservadas) == {"cadena_viva": 2}


def test_una_renovacion_contigua_conserva_los_dos_periodos_y_despues_borra_toda_la_cadena(fv):
    """Lo que siembra «Renovar»: el mismo proveedor, desde el día siguiente."""
    contratos = [contrato(fv, 1, "2026-10-01", "2026-10-31"), contrato(fv, 2, "2026-11-01", "2026-11-30")]
    fotos = [foto(fv, 10, col("2026-10-02")), foto(fv, 11, col("2026-11-02"))]
    planos = [plano(fv, 20, 1), plano(fv, 21, 2)]

    for hoy in ("2026-11-06", "2026-12-05"):
        p = plan(fv, contratos, fotos, planos, hoy=hoy)
        assert p.vacio, hoy
        assert p.conservadas["cadena_viva"] == 4

    p = plan(fv, contratos, fotos, planos, hoy="2026-12-06")
    assert sorted(p.fotos) == [10, 11]
    assert sorted(p.planometrias) == [20, 21]
    assert [(t.desde, t.hasta) for t in p.terminadas] == [(d("2026-10-01"), d("2026-11-30"))]


def test_una_renovacion_ya_cargada_con_hueco_alarga_el_plazo_hasta_sesenta_dias(fv):
    """La renovación tardía se carga a mano (el botón desaparece al vencer) y
    suele arrancar a mitad de mes: si ya está cargada, es renovación."""
    assert fv.HUECO_DE_RENOVACION == 60
    fin = d("2026-10-31")
    fotos = [foto(fv, 10, col("2026-10-15"))]
    planos = [plano(fv, 20, 1)]

    junto = fin + timedelta(days=fv.HUECO_DE_RENOVACION + 1)  # 60 días sin contrato
    contratos = [contrato(fv, 1, "2026-10-01", fin), contrato(fv, 2, junto, junto + timedelta(days=30))]
    assert plan(fv, contratos, fotos, planos, hoy="2026-11-06").vacio

    aparte = junto + timedelta(days=1)  # 61 días sin contrato: otra cadena
    contratos = [contrato(fv, 1, "2026-10-01", fin), contrato(fv, 2, aparte, aparte + timedelta(days=30))]
    p = plan(fv, contratos, fotos, planos, hoy="2026-11-06")
    assert p.fotos == [10]
    assert p.planometrias == [20]


@pytest.mark.parametrize("uno, otro, misma", [
    ("NUTRESA", "Nutresa", True),
    ("Nutresa", "Nutresa S.A.S.", True),
    ("Grupo Nutresa", "NUTRESA S.A.", True),
    ("Alpina", "Alpina Productos Alimenticios S.A. BIC", True),
    ("Lácteos Colanta Ltda.", "LACTEOS COLANTA", True),
    # Nombres cortos, posesivos y siglas que son forma societaria: la revisión
    # adversarial encontró que separaban una renovación y la borraban.
    ("3M", "3M Colombia S.A.S.", True),
    ("P&G", "P&G Colombia Ltda", True),
    ("Kellogg's", "Kellogg de Colombia S.A.", True),
    ("Hershey's", "Hershey Colombia S.A.", True),
    ("Kellogg´s", "KELLOGG", True),
    ("BIC", "Bic", True),
    ("BIC", "Bic Colombia", True),
    # El largo ordena antes que el corto: la contención va en los dos sentidos.
    ("Nutresa", "Comercializadora Nutresa", True),
    # Sin mínimo de letras: puede ser otro proveedor, pero juntar de más sólo
    # conserva más.
    ("Sol", "Sol de Oriente", True),
    ("Nutresa", "Colombina", False),
    ("Bic Colombia", "Kellogg de Colombia", False),
])
def test_el_mismo_proveedor_escrito_distinto_es_renovacion(fv, uno, otro, misma):
    """La planilla crea otro proveedor si el nombre no coincide exacto. Juntar
    de más sólo conserva más; separar de más borraría una renovación."""
    contratos = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1, nombre=uno),
        contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2, nombre=otro),
    ]
    p = plan(fv, contratos, [foto(fv, 10, col("2026-10-15"))], [plano(fv, 20, 1)], hoy="2026-11-06")
    assert p.vacio is misma
    if not misma:
        assert p.fotos == [10] and p.planometrias == [20]


def test_el_mismo_correo_o_la_misma_marca_juntan_proveedores(fv):
    fotos = [foto(fv, 10, col("2026-10-15"))]
    por_correo = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1, nombre="Distribuidora Uno", correo="compras@x.co"),
        contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2, nombre="Comercial Dos", correo=" COMPRAS@x.co "),
    ]
    assert plan(fv, por_correo, fotos, hoy="2026-11-06").vacio
    por_marca = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1, nombre="Distribuidora Uno", marca="Alpina"),
        contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2, nombre="Comercial Dos", marca="ALPINA"),
    ]
    assert plan(fv, por_marca, fotos, hoy="2026-11-06").vacio
    sin_nada = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1, nombre="Distribuidora Uno"),
        contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2, nombre="Comercial Dos"),
    ]
    assert plan(fv, sin_nada, fotos, hoy="2026-11-06").fotos == [10]


def test_la_clave_del_nombre(fv):
    assert fv.clave_de_nombre("Nutresa S.A.S.") == "NUTRESA"
    assert fv.clave_de_nombre("Grupo Nutresa") == "NUTRESA"
    assert fv.clave_de_nombre("  nutresa  ") == "NUTRESA"
    assert fv.clave_de_nombre("Alpina Productos Alimenticios S.A. BIC") == "ALPINA PRODUCTOS ALIMENTICIOS"
    assert fv.clave_de_nombre("Restrepo y Cía. S. en C.") == "RESTREPO"
    assert fv.clave_de_nombre("Postobón") == "POSTOBON"
    assert fv.clave_de_nombre("") == ""
    assert fv.clave_de_nombre(None) == ""
    # El posesivo y los apóstrofos se van antes de partir en palabras.
    assert fv.clave_de_nombre("Kellogg's") == "KELLOGG"
    assert fv.clave_de_nombre("Hershey’s S.A.S.") == "HERSHEY"
    assert fv.clave_de_nombre("D'Onofrio") == fv.clave_de_nombre("Donofrio") == "DONOFRIO"
    assert fv.clave_de_nombre("P&G Colombia Ltda") == "PYG COLOMBIA"
    # Una forma societaria que abre el nombre ES el nombre (salvo «Grupo» y
    # «Cía.»): si no, «Bic Colombia» sería «COLOMBIA» y se juntaría con
    # cualquier «… de Colombia».
    assert fv.clave_de_nombre("Bic Colombia") == "BIC COLOMBIA"
    assert fv.clave_de_nombre("Cía. Nacional de Chocolates") == "NACIONAL DE CHOCOLATES"
    # Si no queda nada, el nombre entero: nunca se ignora.
    assert fv.clave_de_nombre("BIC") == fv.clave_de_nombre("Bic") == "BIC"
    assert fv.clave_de_nombre("S.A.S.") == "SAS"
    assert fv.clave_de_nombre("Grupo") == "GRUPO"
    assert fv.clave_de_nombre("Cía. S.A.S.") == "CIA SAS"


def test_un_cancelado_superpuesto_no_se_lleva_las_fotos_del_vivo(fv):
    """El riesgo del mapa: B (Nutresa, noviembre) se canceló; A (Alpina, octubre
    a diciembre) sigue. La foto de noviembre la reclaman las dos cadenas y se
    queda hasta que termine también A."""
    contratos = [
        contrato(fv, 1, "2026-11-01", "2026-11-30", proveedor=1),  # B, cancelado
        contrato(fv, 2, "2026-10-01", "2026-12-31", proveedor=2),  # A, vivo
    ]
    fotos = [foto(fv, 10, col("2026-11-15"))]
    planos = [plano(fv, 20, 1), plano(fv, 21, 2)]

    p = plan(fv, contratos, fotos, planos, hoy="2026-12-06")
    assert p.fotos == []
    assert p.conservadas["cadena_viva"] == 2  # la foto y la planometría de A
    assert p.planometrias == [20]  # la de B sí: es de SU contrato, y terminó

    p = plan(fv, contratos, fotos, planos, hoy="2027-01-06")
    assert p.fotos == [10]
    assert sorted(p.planometrias) == [20, 21]


def test_un_relevo_al_dia_siguiente_con_otro_proveedor(fv):
    """Nutresa termina el 31 de octubre y Alpina arranca el 1.º de noviembre.
    El 6 de noviembre se va lo de Nutresa anterior a la víspera de Alpina menos
    5 días (26 de octubre, medianoche de Colombia); lo de ahí en adelante lo
    reclama también Alpina, que vive."""
    contratos = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1),
        contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2),
    ]
    fotos = [
        foto(fv, 11, medianoche("2026-10-26") - UN_MICRO),
        foto(fv, 12, medianoche("2026-10-26")),
        foto(fv, 13, col("2026-11-02")),
    ]
    planos = [plano(fv, 21, 1), plano(fv, 22, 2)]
    p = plan(fv, contratos, fotos, planos, hoy="2026-11-06")
    assert p.fotos == [11]
    assert p.planometrias == [21]


def test_un_reporte_adelantado_lo_protege_el_contrato_que_entra(fv):
    """El tablero de Montajes lista los contratos «pendiente» y /mounts no
    controla la víspera. Hasta 5 días antes de la víspera, la foto la reclama el
    contrato que entra; antes de eso, según la regla del sistema, no es suya."""
    contratos = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=1),  # sale, terminado
        contrato(fv, 2, "2026-11-08", "2026-12-07", proveedor=2),  # entra, futuro
    ]
    vispera = d("2026-11-07")
    fotos = [
        foto(fv, 11, col((vispera - timedelta(days=3)).isoformat())),
        foto(fv, 12, col((vispera - timedelta(days=10)).isoformat())),
    ]
    p = plan(fv, contratos, fotos, hoy="2026-11-06")
    assert p.fotos == [12]
    assert p.conservadas["cadena_viva"] == 1


def test_los_bordes_horarios_son_medianoche_de_colombia(fv):
    """La ventana va desde la medianoche de Colombia de la víspera menos 5 días
    hasta el último instante del quinto día después del fin. La hora sin huso
    (SQLite) es UTC: 04:59 UTC todavía es el día anterior en Colombia.

    El contrato de otro proveedor que arranca en enero sigue vivo: lo que la
    cadena de octubre no reclama queda como huérfano, y un huérfano no se borra
    mientras viva una cadena del espacio. Así el borde decide."""
    contratos = [
        contrato(fv, 1, "2026-10-01", "2026-10-31"),
        contrato(fv, 2, "2027-01-01", "2027-01-31", proveedor=2),
    ]
    fotos = [
        foto(fv, 1, medianoche("2026-09-25")),
        foto(fv, 2, medianoche("2026-09-25") - UN_MICRO),
        foto(fv, 3, medianoche("2026-11-06") - UN_MICRO),
        foto(fv, 4, medianoche("2026-11-06")),
        foto(fv, 5, datetime(2026, 9, 25, 4, 59)),
        foto(fv, 6, datetime(2026, 9, 25, 5, 0)),
    ]
    p = plan(fv, contratos, fotos, hoy="2026-11-06")
    assert sorted(p.fotos) == [1, 3, 6]
    assert p.conservadas == {"cadena_viva": 3}


def test_la_foto_que_ninguna_cadena_reclama_se_borra_cuando_termina_todo_el_espacio(fv):
    """Un reporte adelantado: Alpina terminó el 31 de octubre, Nutresa arranca
    el 1.º de diciembre y el mercaderista reportó el montaje de Nutresa desde el
    tablero el 15 de noviembre. Ninguna ventana lo cubre, y no es prueba de
    ningún contrato. Antes quedaba para siempre; ahora se va cuando termina
    también Nutresa (el contrato para el que se adelantó)."""
    contratos = [
        contrato(fv, 1, "2026-10-01", "2026-10-31", proveedor=2),
        contrato(fv, 2, "2026-12-01", "2026-12-31", proveedor=1),
    ]
    fotos = [foto(fv, 10, col("2026-11-15"))]
    for hoy in ("2026-11-20", "2027-01-05"):
        p = plan(fv, contratos, fotos, hoy=hoy)
        assert p.fotos == [] and p.conservadas == {"cadena_viva": 1}, hoy
    p = plan(fv, contratos, fotos, hoy="2027-01-06")
    assert p.fotos == [10]
    # En el ensayo se le cuenta al contrato para el que se adelantó.
    assert [(t.proveedores, t.fotos) for t in p.terminadas] == [(("Nutresa",), 1)]


def test_la_foto_huerfana_tiene_sus_cinco_dias_de_gracia(fv):
    """Un reporte con el espacio libre (la última cadena terminó hace rato): se
    conserva cinco días, el margen para cargar el contrato que vendría, y se
    va en la primera pasada del sexto, a la fecha de Colombia de la foto."""
    contratos = [contrato(fv, 1, "2026-08-01", "2026-08-31")]
    # 03:00 UTC del 21 es todavía el 20 en Colombia.
    fotos = [foto(fv, 10, datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc))]
    p = plan(fv, contratos, fotos, hoy="2026-10-25")
    assert p.fotos == [] and p.conservadas == {"huerfana_reciente": 1}
    assert plan(fv, contratos, fotos, hoy="2026-10-26").fotos == [10]
    # Si se carga un contrato que arranca después, lo protege mientras viva.
    contratos.append(contrato(fv, 2, "2026-11-01", "2026-11-30", proveedor=2))
    p = plan(fv, contratos, fotos, hoy="2026-10-26")
    assert p.fotos == [] and p.conservadas == {"cadena_viva": 1}


def test_la_vispera_es_la_del_enlace_de_montaje(fv):
    """Una sola fuente para «desde cuándo un reporte es de este contrato»."""
    from app.routers import montaje

    assert fv._se_confirma_desde is montaje._se_confirma_desde


def test_un_contrato_por_lote_borra_cada_copia_con_la_cadena_de_su_espacio(fv):
    """La misma planometría subida a 5 espacios son 5 filas; se renueva uno solo.
    Los MB cuentan las 4 copias, porque cada una ocupaba lo suyo."""
    contratos = [contrato(fv, i, "2026-10-01", "2026-10-31", espacio=i) for i in range(1, 6)]
    contratos.append(contrato(fv, 6, "2026-11-01", "2026-11-30", espacio=1))
    planos = [plano(fv, 20 + i, i, size=1000) for i in range(1, 6)]
    p = plan(fv, contratos, [], planos, hoy="2026-11-06")
    assert sorted(p.planometrias) == [22, 23, 24, 25]
    assert p.bytes_planometrias == 4000
    assert p.conservadas == {"cadena_viva": 1}
    assert sorted(t.codigo for t in p.terminadas) == [CODIGOS[i] for i in range(2, 6)]


def test_lo_que_no_cierra_se_conserva_y_se_cuenta_por_motivo(fv):
    oct_ = ("2026-10-01", "2026-10-31")
    contratos = [
        contrato(fv, 1, *oct_, espacio=1),
        contrato(fv, 2, *oct_, espacio=2),
        contrato(fv, 3, *oct_, espacio=3),
        contrato(fv, 4, *oct_, espacio=4),
        contrato(fv, 5, *oct_, espacio=5),
        contrato(fv, 55, "2026-12-01", "2026-11-01", espacio=5, proveedor=2),  # al revés
        contrato(fv, 6, *oct_, espacio=6),
        contrato(fv, 8, "2026-09-01", "2026-09-30", espacio=8),
        contrato(fv, 9, *oct_, espacio=9),
        contrato(fv, 99, "2026-11-01", "2026-11-30", espacio=9, proveedor=2),
        contrato(fv, 10, *oct_, espacio=10),
    ]
    t = col("2026-10-15")
    fotos = [
        foto(fv, 101, t, espacio=1),
        foto(fv, 102, t, espacio=2, archivado=col("2026-10-20")),
        foto(fv, 103, t, espacio=3, codigo="NAVE-PUN-99"),
        foto(fv, 113, t, espacio=3, codigo=" nave-pun-03 "),  # el mismo, escrito distinto
        foto(fv, 104, None, espacio=4),
        foto(fv, 105, t, espacio=5),
        foto(fv, 106, t, espacio=6, es_cara=True),
        foto(fv, 107, t, espacio=7),  # espacio sin contratos
        foto(fv, 108, col("2026-10-20"), espacio=8),  # huérfana: terminó todo el espacio
        foto(fv, 109, None, espacio=9, montajes=(  # dos montajes, uno de la cadena viva
            fv.Montaje(confirmado_en=col("2026-10-10"), space_code=CODIGOS[9]),
            fv.Montaje(confirmado_en=col("2026-11-03"), space_code=CODIGOS[9]),
        )),
        foto(fv, 110, t, espacio=10),
    ]
    planos = [
        plano(fv, 201, 1),
        plano(fv, 205, 5),
        plano(fv, 210, 2, kind="contrato_firmado"),
        plano(fv, 211, 999),
        plano(fv, 212, 3, subida=medianoche("2026-11-06")),
        plano(fv, 213, 3, subida=col("2026-11-05", 23)),
    ]
    p = plan(fv, contratos, fotos, planos, hoy="2026-11-06", archivados={1}, en_el_plano={10})
    assert sorted(p.fotos) == [108, 113]
    assert p.planometrias == [213]
    assert dict(p.conservadas) == {
        "espacio_archivado": 2,
        "montaje_archivado": 1,
        "codigo_distinto": 1,
        "montaje_sin_hora": 1,
        "fechas_imposibles": 2,
        "cara_del_3d": 1,
        "espacio_sin_contratos": 1,
        "cadena_viva": 1,
        "contrato_en_el_plano": 1,
        "no_es_planometria": 1,
        "contrato_inexistente": 1,
        "subida_despues_del_fin": 1,
    }


def test_una_fecha_en_el_borde_del_calendario_no_traba_la_limpieza(fv):
    """9999-12-31 es el «indefinido» típico de una planilla: sumarle días
    desborda. Esa cadena no termina nunca, y el resto se limpia igual."""
    contratos = [
        contrato(fv, 1, "2026-10-01", date.max, espacio=1),
        contrato(fv, 2, date.min, "2026-10-31", espacio=2),
        contrato(fv, 3, "2026-10-01", "2026-10-31", espacio=3),
        contrato(fv, 4, date.max - timedelta(days=1), date.max, espacio=3),
    ]
    fotos = [foto(fv, 1, col("2026-10-15"), espacio=1),
             foto(fv, 2, col("2026-10-15"), espacio=2),
             foto(fv, 3, col("2026-10-15"), espacio=3)]
    p = plan(fv, contratos, fotos, [plano(fv, 21, 1)], hoy="2026-11-06")
    assert sorted(p.fotos) == [2, 3]
    assert p.conservadas == {"cadena_viva": 2}


def test_las_planometrias_en_pdf_se_cuentan_aparte(fv):
    """El casillero acepta PDF: el ensayo las muestra para mirarlas antes."""
    p = plan(fv, [contrato(fv, 1, "2026-10-01", "2026-10-31")], [],
             [plano(fv, 20, 1, tipo="application/pdf")], hoy="2026-11-06")
    assert p.planometrias == [20] and p.planometrias_pdf == 1


def test_la_linea_de_la_bitacora(fv):
    p = fv.Plan(hoy=d("2026-11-06"), fotos=[1, 2], planometrias=[3],
                bytes_fotos=3 * 1024 * 1024, bytes_planometrias=512 * 1024)
    assert p.detalle() == (
        "2 fotos de montaje · 1 planometría · 3,5 MB liberados para lo que se suba · "
        "contratos terminados hasta el 2026-10-31"
    )
    uno = fv.Plan(hoy=d("2026-11-06"), fotos=[1], planometrias=[], bytes_fotos=100)
    assert uno.detalle().startswith("1 foto de montaje · 0 planometrías · 0,0 MB")


# ════════════════════════════════════════════════════════════════════════════
# Contra la base
# ════════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def db(client):
    from app.database import SessionLocal, engine
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def _sembrar(db, *, codigo="NAVE-PUN-01", fin, proveedor="Alpina", activo=False,
             dias=29, foto_kb=768, extras=True):
    """Un espacio con un contrato que terminó en ``fin`` y lo que cuelga de él.

    Devuelve los ids. Con ``extras``, además de las dos fotos de montaje y la
    planometría, lo que NO se puede tocar: un PDF del espacio, un
    «montaje--x.jpg» sin montaje, la foto de un montaje designada cara del 3D y
    el arte de catálogo del proveedor.
    """
    from app.models.models import (
        LeaseFile, MountConfirmation, Space, SpaceFace, SpaceFile, SpaceLease,
        Supplier, SupplierAsset,
    )

    desde = fin - timedelta(days=dias)
    t = datetime.combine(desde + timedelta(days=1), time(15, 0), tzinfo=COL).astimezone(timezone.utc)
    space = Space(code=codigo, svg_id=f"svg-{codigo}", name=codigo, zone="punta", sede="NAVE", area_m2=1.0)
    prov = db.query(Supplier).filter(Supplier.name == proveedor).first() or Supplier(name=proveedor)
    db.add_all([space, prov])
    db.flush()
    lease = SpaceLease(space_id=space.id, supplier_id=prov.id, start_date=desde, end_date=fin,
                       monthly_rent=1_000_000, is_active=activo)
    db.add(lease)
    db.flush()

    def archivo(nombre, kb, tipo="image/jpeg"):
        f = SpaceFile(space_id=space.id, filename=nombre, content_type=tipo,
                      size=kb * 1024, data=b"\xff" * (kb * 1024))
        db.add(f)
        db.flush()
        return f

    ids = {"space": space.id, "lease": lease.id}
    montado = archivo(f"montaje--{codigo}--armado.jpg", foto_kb)
    vacio = archivo(f"montaje--{codigo}--vacio.jpg", 256)
    m1 = MountConfirmation(space_code=codigo, sede="NAVE", estado="montado", file_id=montado.id,
                           reportado_por="Ana", rol="worker", confirmado_en=t)
    m2 = MountConfirmation(space_code=codigo, sede="NAVE", estado="no_montado", motivo="sin_material",
                           nota="no llegó", file_id=vacio.id, reportado_por="Ana", rol="worker",
                           confirmado_en=t + timedelta(hours=2))
    db.add_all([m1, m2])
    db.flush()
    # Se sube al cerrar el trato, no hoy: una subida posterior al fin de la
    # cadena se conserva a propósito (`subida_despues_del_fin`).
    plano_ = LeaseFile(lease_id=lease.id, kind="planometria", filename="plano.jpg",
                       content_type="image/jpeg", size=512 * 1024, data=b"\x00" * (512 * 1024),
                       uploaded_at=t)
    db.add(plano_)
    db.flush()
    ids.update(montado=montado.id, vacio=vacio.id, m1=m1.id, m2=m2.id, plano=plano_.id,
               bytes=montado.size + vacio.size + plano_.size)

    if extras:
        pdf = archivo("contrato.pdf", 4, "application/pdf")
        suelto = archivo("montaje--x.jpg", 4)
        cara = archivo(f"montaje--{codigo}--cara.jpg", 4)
        m3 = MountConfirmation(space_code=codigo, sede="NAVE", estado="montado", file_id=cara.id,
                               reportado_por="Ana", rol="worker", confirmado_en=t)
        db.add(m3)
        db.add(SpaceFace(space_id=space.id, file_id=cara.id))
        asset = SupplierAsset(supplier_id=prov.id, nombre="Yogurt", filename="yogurt.png",
                              content_type="image/png", size=len(JPG), data=JPG)
        db.add(asset)
        db.flush()
        ids.update(pdf=pdf.id, suelto=suelto.id, cara=cara.id, m3=m3.id, asset=asset.id)
    db.commit()
    return ids


def _lineas(db):
    from app.models.models import AuditEntry
    return db.query(AuditEntry).filter(AuditEntry.accion == "archivo.vencido").all()


def test_borra_las_fotos_y_la_planometria_y_nada_mas(client, db, fv):
    from app.models.models import (
        LeaseFile, MountConfirmation, SpaceFace, SpaceFile, SpaceLease, SupplierAsset,
    )

    ids = _sembrar(db, fin=hoy_en_colombia() - timedelta(days=30))
    plan_ = fv.limpiar_fotos_vencidas(db, ensayo=False)

    assert sorted(plan_.fotos) == sorted([ids["montado"], ids["vacio"]])
    assert plan_.planometrias == [ids["plano"]]
    assert plan_.bytes == ids["bytes"]
    assert plan_.conservadas["cara_del_3d"] == 1

    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is None
    assert db.get(SpaceFile, ids["vacio"]) is None
    assert db.get(LeaseFile, ids["plano"]) is None
    # Lo que queda: el contrato, los documentos, la cara, el arte, el suelto.
    assert db.get(SpaceLease, ids["lease"]) is not None
    for clave in ("pdf", "suelto", "cara"):
        assert db.get(SpaceFile, ids[clave]) is not None, clave
    assert db.query(SpaceFace).filter(SpaceFace.file_id == ids["cara"]).count() == 1
    assert db.get(SupplierAsset, ids["asset"]) is not None
    # El montaje queda —pasó, y es la prueba— sin la foto.
    m1, m2, m3 = (db.get(MountConfirmation, ids[k]) for k in ("m1", "m2", "m3"))
    assert m1.file_id is None and m1.estado == "montado" and m1.reportado_por == "Ana"
    assert m1.confirmado_en is not None
    assert m2.file_id is None and m2.motivo == "sin_material" and m2.nota == "no llegó"
    assert m3.file_id == ids["cara"]

    lineas = _lineas(db)
    assert len(lineas) == 1
    assert lineas[0].rol == "sistema" and lineas[0].ip == "desconocida"
    assert lineas[0].detalle == plan_.detalle()
    assert lineas[0].detalle.startswith("2 fotos de montaje · 1 planometría · 1,5 MB")


def test_la_segunda_pasada_no_borra_ni_anota_y_el_ensayo_no_escribe(client, db, fv):
    from app.models.models import SpaceFile

    ids = _sembrar(db, fin=hoy_en_colombia() - timedelta(days=30), extras=False)
    ensayo = fv.limpiar_fotos_vencidas(db, ensayo=True)
    assert ensayo.ensayo is True
    assert sorted(ensayo.fotos) == sorted([ids["montado"], ids["vacio"]])
    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is not None
    assert _lineas(db) == []

    real = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert sorted(real.fotos) == sorted(ensayo.fotos) and real.planometrias == ensayo.planometrias
    assert real.bytes == ensayo.bytes

    otra = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert otra.vacio
    assert len(_lineas(db)) == 1


def test_sin_el_interruptor_la_limpieza_sola_ensaya(client, db, fv, monkeypatch):
    from app.models.models import SpaceFile

    monkeypatch.delenv(fv.INTERRUPTOR, raising=False)
    ids = _sembrar(db, fin=hoy_en_colombia() - timedelta(days=30), extras=False)
    p = fv.limpiar_fotos_vencidas(db)
    assert p.ensayo and len(p.fotos) == 2
    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is not None

    monkeypatch.setenv(fv.INTERRUPTOR, "1")
    p = fv.limpiar_fotos_vencidas(db)
    assert not p.ensayo and len(p.fotos) == 2


def test_con_una_fecha_futura_solo_se_ensaya(client, db, fv):
    """Borrar con el reloj adelantado daría por terminados contratos vigentes."""
    ids = _sembrar(db, fin=hoy_en_colombia() + timedelta(days=30), extras=False)
    futuro = hoy_en_colombia() + timedelta(days=60)
    with pytest.raises(ValueError):
        fv.limpiar_fotos_vencidas(db, futuro, ensayo=False)
    p = fv.limpiar_fotos_vencidas(db, futuro, ensayo=True)
    assert ids["montado"] in p.fotos
    assert fv.limpiar_fotos_vencidas(db, ensayo=False).vacio


def test_un_cancelado_cuenta_hasta_su_fin_original(client, db, fv):
    """No hay fecha de baja: un contrato cancelado (is_active=False) con fin
    futuro conserva sus fotos hasta ese fin más la gracia."""
    from app.models.models import SpaceFile

    ids = _sembrar(db, fin=hoy_en_colombia() + timedelta(days=100), dias=160, activo=False, extras=False)
    p = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert p.vacio
    assert p.conservadas["cadena_viva"] == 3
    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is not None


def test_una_renovacion_tardia_no_resucita_nada_ni_falla(client, db, fv):
    from app.models.models import LeaseFile, SpaceLease

    fin = hoy_en_colombia() - timedelta(days=30)
    ids = _sembrar(db, fin=fin, extras=False)
    assert len(fv.limpiar_fotos_vencidas(db, ensayo=False).fotos) == 2
    lease = db.get(SpaceLease, ids["lease"])
    db.add(SpaceLease(space_id=ids["space"], supplier_id=lease.supplier_id,
                      start_date=fin + timedelta(days=1), end_date=fin + timedelta(days=60),
                      monthly_rent=1, is_active=True))
    db.commit()
    assert fv.limpiar_fotos_vencidas(db, ensayo=False).vacio
    db.expire_all()
    assert db.get(LeaseFile, ids["plano"]) is None
    assert len(_lineas(db)) == 1


def test_un_contrato_que_vive_solo_en_el_plano_bloquea_su_espacio(client, db, fv):
    """Puede ser la renovación de la cadena de la base: hasta que se importe,
    ese espacio no se toca."""
    import json

    from app.models.models import LayoutSnapshot

    hoy = hoy_en_colombia()
    ids = _sembrar(db, fin=hoy - timedelta(days=30), extras=False)
    db.add(LayoutSnapshot(sede="NAVE", fixtures_json=json.dumps([{
        "id": "f1", "code": "PUN-01", "type": "punta", "status": "occupied", "sede": "NAVE",
        "supplierName": "Alpina", "startDate": (hoy - timedelta(days=29)).isoformat(),
        "endDate": (hoy + timedelta(days=30)).isoformat(),
    }])))
    db.commit()
    p = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert p.vacio
    assert p.conservadas["contrato_en_el_plano"] == 3


def _plano_con(db, proveedor, desde, hasta):
    import json

    from app.models.models import LayoutSnapshot

    db.add(LayoutSnapshot(sede="NAVE", fixtures_json=json.dumps([{
        "id": "f1", "code": "PUN-01", "type": "punta", "status": "occupied", "sede": "NAVE",
        "supplierName": proveedor, "startDate": desde.isoformat(), "endDate": hasta.isoformat(),
    }])))
    db.commit()


def test_la_renovacion_del_plano_bloquea_aunque_haya_otro_contrato_futuro_en_la_base(client, db, fv):
    """`importar_del_plano.revisar` da el contrato del plano por importado si el
    espacio tiene CUALQUIER contrato próximo en la base. Acá ése es de otro
    proveedor y arranca en tres meses: la renovación de Alpina, que vive sólo
    en el plano, tiene que seguir protegiendo lo de su cadena."""
    from app.models.models import SpaceLease, Supplier

    hoy = hoy_en_colombia()
    fin = hoy - timedelta(days=30)
    ids = _sembrar(db, fin=fin, extras=False)
    nutresa = Supplier(name="Nutresa")
    db.add(nutresa)
    db.flush()
    db.add(SpaceLease(space_id=ids["space"], supplier_id=nutresa.id, start_date=hoy + timedelta(days=90),
                      end_date=hoy + timedelta(days=120), monthly_rent=1, is_active=True))
    db.commit()
    _plano_con(db, "Alpina", fin + timedelta(days=1), hoy + timedelta(days=60))

    p = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert p.vacio
    assert p.conservadas["contrato_en_el_plano"] == 3


def test_la_copia_de_un_contrato_de_la_base_en_el_plano_no_bloquea(client, db, fv):
    """Antes de que lo comercial viviera sólo en la base, el plano guardaba una
    copia de cada contrato. Esa copia —mismas fechas, el mismo proveedor— no
    agrega nada a la cadena y no frena la limpieza."""
    fin = hoy_en_colombia() - timedelta(days=30)
    ids = _sembrar(db, fin=fin, extras=False)
    _plano_con(db, "Nutresa", fin - timedelta(days=29), fin)
    # Las mismas fechas con OTRO proveedor no es la copia: bloquea.
    p = fv.limpiar_fotos_vencidas(db, ensayo=True)
    assert p.vacio and p.conservadas["contrato_en_el_plano"] == 3

    from app.models.models import LayoutSnapshot

    db.query(LayoutSnapshot).delete()
    db.commit()
    _plano_con(db, "ALPINA S.A.", fin - timedelta(days=29), fin)
    p = fv.limpiar_fotos_vencidas(db, ensayo=False)
    assert sorted(p.fotos) == sorted([ids["montado"], ids["vacio"]])
    assert p.planometrias == [ids["plano"]]


def test_la_api_despues_del_borrado(client, admin, db, fv):
    ids = _sembrar(db, fin=hoy_en_colombia() - timedelta(days=30), extras=False)
    fv.limpiar_fotos_vencidas(db, ensayo=False)

    montajes = {m["id"]: m for m in client.get("/api/mounts/", headers=admin).json()}
    assert montajes[ids["m1"]]["file_id"] is None
    assert montajes[ids["m1"]]["foto_nombre"] is None
    assert montajes[ids["m1"]]["estado"] == "montado"
    assert client.get(f"/api/files/{ids['montado']}", headers=admin).status_code == 404
    listados = {f["id"] for f in client.get(f"/api/spaces/{ids['space']}/files", headers=admin).json()}
    assert not listados & {ids["montado"], ids["vacio"]}
    assert client.get(f"/api/planometrias/{ids['plano']}", headers=admin).status_code == 404

    lineas = client.get("/api/bitacora/", headers=admin, params={"accion": "archivo.vencido"}).json()
    assert len(lineas) == 1
    assert lineas[0]["titulo"] == "Fotos y planometrías vencidas, borradas"
    assert "archivo.vencido" in client.get("/api/bitacora/acciones", headers=admin).json()


# ── El ciclo de mantenimiento ─────────────────────────────────────────────────

@pytest.mark.reloj("2040-02-06T04:30:00+00:00")  # 23:30 del día 5 en Colombia
def test_el_quinto_dia_de_colombia_todavia_no_se_borra(client, db, monkeypatch):
    from app.main import _run_lease_maintenance
    from app.models.models import SpaceFile
    from app.services.fotos_vencidas import INTERRUPTOR

    monkeypatch.setenv(INTERRUPTOR, "1")
    assert hoy_en_colombia() == d("2040-02-05")
    ids = _sembrar(db, fin=d("2040-01-31"), extras=False)
    _run_lease_maintenance()
    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is not None
    assert _lineas(db) == []


@pytest.mark.reloj("2040-02-06T05:30:00+00:00")  # 00:30 del día 6 en Colombia
def test_el_sexto_dia_de_colombia_se_borra_con_una_sola_linea(client, db, monkeypatch):
    """Aunque el hilo de arranque corra a la vez: lo que se anota es lo que se
    borró de verdad, así que no puede quedar una segunda línea."""
    from app.main import _run_lease_maintenance
    from app.models.models import MountConfirmation, SpaceFile
    from app.services.fotos_vencidas import INTERRUPTOR

    monkeypatch.setenv(INTERRUPTOR, "1")
    assert hoy_en_colombia() == d("2040-02-06")
    ids = _sembrar(db, fin=d("2040-01-31"), extras=False)
    _run_lease_maintenance()
    _run_lease_maintenance()
    db.expire_all()
    assert db.get(SpaceFile, ids["montado"]) is None
    assert db.get(MountConfirmation, ids["m1"]).file_id is None
    assert len(_lineas(db)) == 1


@contextmanager
def _logging_de_produccion():
    """El logging como queda bajo ``uvicorn app.main:app`` (el CMD del
    Dockerfile): uvicorn aplica su ``LOGGING_CONFIG``, que configura sólo sus
    propios loggers, y el raíz queda en WARNING y sin handlers. Lo que pytest le
    cuelga al raíz se saca mientras dura, y todo vuelve como estaba."""
    import logging
    import logging.config

    from uvicorn.config import LOGGING_CONFIG

    raiz = logging.getLogger()
    antes_raiz = (raiz.level, raiz.handlers[:])
    antes = {}
    for nombre in LOGGING_CONFIG["loggers"]:
        lg = logging.getLogger(nombre)
        antes[nombre] = (lg.level, lg.handlers[:], lg.propagate, lg.disabled)
    raiz.handlers = []
    raiz.setLevel(logging.WARNING)
    logging.config.dictConfig(LOGGING_CONFIG)
    try:
        yield
    finally:
        raiz.setLevel(antes_raiz[0])
        raiz.handlers = antes_raiz[1]
        for nombre, (nivel, handlers, propaga, apagado) in antes.items():
            lg = logging.getLogger(nombre)
            lg.setLevel(nivel)
            lg.handlers = handlers
            lg.propagate = propaga
            lg.disabled = apagado


def test_la_linea_del_ensayo_sale_en_el_log_de_produccion(client, db, capsys, monkeypatch):
    """ESTADO.md promete que, con el interruptor apagado, la pasada deja en el
    log lo que borraría. Con un INFO no salía nunca en Render (nadie configura
    el logging), y como sólo se escribía con algo para borrar, que faltara se
    leía como «nada que borrar». Sale siempre, también con cero."""
    from app.main import _run_lease_maintenance
    from app.services.fotos_vencidas import INTERRUPTOR

    monkeypatch.delenv(INTERRUPTOR, raising=False)
    with _logging_de_produccion():
        capsys.readouterr()
        _run_lease_maintenance()
        vacio = capsys.readouterr().err
        _sembrar(db, fin=hoy_en_colombia() - timedelta(days=30), extras=False)
        _run_lease_maintenance()
        con_algo = capsys.readouterr().err
    assert "Fotos vencidas, cliente" in vacio
    assert "se borrarían: 0 fotos" in vacio and "LIMPIAR_FOTOS_VENCIDAS apagado" in vacio
    assert "se borrarían: 2 fotos, 1 planometrías" in con_algo


def _sembrar_en(slug, **kw):
    from app.clientes import buscar, sesion_de

    s = sesion_de(buscar(slug))
    try:
        return _sembrar(s, **kw)
    finally:
        s.close()


def _en(slug, fn):
    from app.clientes import buscar, sesion_de

    s = sesion_de(buscar(slug))
    try:
        return fn(s)
    finally:
        s.close()


def _sigue(slug, modelo, id_):
    return _en(slug, lambda s: s.get(modelo, id_) is not None)


def _clientes(client):
    from tests.test_tendencia_ataques import Identidades, _fundar

    ids = Identidades(client)
    _fundar(ids, "uid-acme", "duena@acme.co", "acme", "Acme")
    _fundar(ids, "uid-beta", "dueno@beta.co", "beta", "Beta")


def _vencido_y_viejo(slug):
    """Un contrato activo que ya venció y una línea de bitácora de hace 400
    días: lo que el resto del mantenimiento tiene que limpiar igual."""
    from app.models.models import AuditEntry, Space, SpaceLease, Supplier

    def sembrar(s):
        sp = Space(code="NAVE-GON-09", svg_id="svg-g9", name="g9", zone="z", sede="NAVE", area_m2=1)
        pr = Supplier(name="Colanta")
        s.add_all([sp, pr])
        s.flush()
        l = SpaceLease(space_id=sp.id, supplier_id=pr.id, start_date=hoy_en_colombia() - timedelta(days=10),
                       end_date=hoy_en_colombia() - timedelta(days=1), monthly_rent=1, is_active=True)
        s.add(l)
        s.add(AuditEntry(at=datetime.now(timezone.utc) - timedelta(days=400), rol="admin", ip="x",
                         accion="contrato.alta"))
        s.commit()
        return l.id
    return _en(slug, sembrar)


def test_si_la_limpieza_de_un_cliente_falla_los_demas_se_limpian_y_el_resto_corre(client, monkeypatch):
    from app.main import _run_lease_maintenance
    from app.models.models import AuditEntry, SpaceFile, SpaceLease
    from app.services import fotos_vencidas

    monkeypatch.setenv(fotos_vencidas.INTERRUPTOR, "1")
    _clientes(client)
    fin = hoy_en_colombia() - timedelta(days=30)
    acme = _sembrar_en("acme", fin=fin, extras=False)
    beta = _sembrar_en("beta", fin=fin, extras=False)
    lease_acme = _vencido_y_viejo("acme")

    original = fotos_vencidas.limpiar_fotos_vencidas

    def falla_en_acme(db, *a, **kw):
        if "recabra_acme" in str(db.get_bind().url):
            raise RuntimeError("se cayó la limpieza")
        return original(db, *a, **kw)

    monkeypatch.setattr(fotos_vencidas, "limpiar_fotos_vencidas", falla_en_acme)
    _run_lease_maintenance()  # no lanza

    assert _sigue("acme", SpaceFile, acme["montado"])
    assert not _sigue("beta", SpaceFile, beta["montado"])
    # Los vencimientos y la purga de acme corrieron igual.
    assert _en("acme", lambda s: s.get(SpaceLease, lease_acme).is_active) is False
    assert _en("acme", lambda s: s.query(AuditEntry).filter(AuditEntry.accion == "contrato.alta").count()) == 0


@pytest.mark.parametrize("falla", ["de_python", "de_la_base"])
def test_si_los_vencimientos_fallan_la_limpieza_corre_igual(client, monkeypatch, falla):
    """Una falla de Python deja la sesión limpia; una de la BASE —un flush que
    viola una restricción— la deja con la transacción caída, y sin el rollback
    entre los dos bloques la limpieza cae con ``PendingRollbackError`` (en
    Postgres, ``InFailedSqlTransaction``). Las dos tienen que dejarla correr."""
    from app.main import _run_lease_maintenance
    from app.models.models import Space, SpaceFile
    from app.routers import spaces
    from app.services import fotos_vencidas

    monkeypatch.setenv(fotos_vencidas.INTERRUPTOR, "1")
    _clientes(client)
    acme = _sembrar_en("acme", fin=hoy_en_colombia() - timedelta(days=30), extras=False)

    def explota(db):
        if falla == "de_la_base":
            # El código ya existe: IntegrityError en el flush.
            db.add(Space(code="NAVE-PUN-01", svg_id="svg-repetido", name="x", zone="z",
                         sede="NAVE", area_m2=1.0))
            db.flush()
        raise RuntimeError("se cayó expire_leases")

    monkeypatch.setattr(spaces, "expire_leases", explota)
    _run_lease_maintenance()
    assert not _sigue("acme", SpaceFile, acme["montado"])


def test_un_cliente_con_la_base_rota_no_frena_a_los_demas(client, monkeypatch):
    from tests.test_tendencia_ataques import _romper

    from app.main import _run_lease_maintenance
    from app.models.models import SpaceFile
    from app.services import fotos_vencidas

    monkeypatch.setenv(fotos_vencidas.INTERRUPTOR, "1")
    _clientes(client)
    _romper()
    beta = _sembrar_en("beta", fin=hoy_en_colombia() - timedelta(days=30), extras=False)
    _run_lease_maintenance()  # no lanza
    assert not _sigue("beta", SpaceFile, beta["montado"])
