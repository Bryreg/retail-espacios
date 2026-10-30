"""La copia de seguridad de un supermercado: todo lo suyo, en un ZIP.

POR QUÉ EXISTE
──────────────
La base vive en Render y, en plan gratuito, Render no hace respaldos. Hasta el
2026-10-01 la copia la bajaba `scripts/respaldo.py`, que entraba con la clave
compartida de admin; ese día la clave se apagó y el script quedó sin puerta
(se borró el 2026-10-02). Ahora la baja el dueño del supermercado desde
Configuración → «Copia de seguridad» (`GET /api/clientes/mi-copia`).

QUÉ TRAE
────────
· `tablas/<tabla>.json`: cada tabla de negocio del supermercado, fila por fila
  y columna por columna, tal como está en la base. Son las de
  `TABLAS_DEL_CLIENTE`, la misma lista que clasifica el traspaso: una tabla
  nueva entra sola, porque el traspaso ya obliga a clasificarla.
· `archivos/<tabla>/<id>-<nombre>`: los binarios —documentos de contrato,
  fotos de montaje, planometrías, artes del catálogo—. En el JSON, la columna
  que los guardaba trae la ruta del archivo adentro del ZIP.
· `personas.json`: quién tenía acceso y con qué rol. Vive en el registro y no
  en la base del supermercado, así que no se restaura: sirve para volver a
  invitar a cada uno.
· `MANIFIESTO.json` (de quién, cuándo, cuántas filas y archivos) y `LEEME.txt`.

QUÉ NO TRAE, A PROPÓSITO
────────────────────────
· Las claves compartidas de `app_config` (el hash y el texto heredado). No
  abren nada desde el 2026-10-01, y un hash en un archivo que anda por correos
  y pendrives es material para adivinarlas.
· `login_attempts`: IPs de intentos de ingreso, que sirven para frenar
  ataques. No hacen falta para volver y son datos de gente que ni siquiera es
  del supermercado.

VOLVER
──────
`restaurar()` carga una copia en una base sin datos de negocio
(`backend/scripts/restaurar_copia.py`). La prueba de ida y vuelta de
`tests/test_copia_de_seguridad.py` es la que asegura que la copia alcanza:
copia, restaura en una base nueva y compara tabla por tabla.

MEMORIA
───────
La instancia tiene 512 MB y un supermercado puede juntar cientos de fotos de
hasta 10 MB. Los binarios se leen DE A UNO —primero las filas sin el binario,
después cada binario por su clave— y el ZIP se escribe donde diga quien llama
(el router usa un archivo temporal que pasa a disco apenas crece).
"""
import enum
import json
import re
import secrets
import zipfile
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum as SAEnum, LargeBinary, and_, func, inspect, select

from app.auth import CLAVES
from app.database import Base
from app.fechas import ahora
# `_reiniciar_secuencias` es la del traspaso a propósito: después de insertar
# filas con su `id`, el contador de Postgres tiene que quedar detrás del último,
# y esa cuenta ya está escrita y probada una vez.
from app.services.traspaso import CLAVE_GENERACION, TABLAS_DEL_CLIENTE, _reiniciar_secuencias

# Sube si cambia la forma del ZIP; `restaurar` no lee una forma que no conoce.
FORMATO = 1

# Lo que no sale, con el porqué que queda escrito en el manifiesto.
TABLAS_QUE_NO_SALEN = {
    "login_attempts": "intentos de ingreso con su IP: frenan ataques, no hacen falta para volver",
    # Restaurada, una cola vieja volvería a mandar avisos de hace semanas.
    "correos_pendientes": "correos en cola: restaurados, se volverían a mandar avisos viejos",
}
# Salen de `CLAVES` y no de una lista aparte: si mañana se agrega un rol con
# clave, su hash tampoco sale.
CONFIG_QUE_NO_SALE = frozenset(clave for par in CLAVES.values() for clave in par)


class ErrorDeCopia(Exception):
    pass


def tablas_de_la_copia() -> list:
    """Las de negocio que salen, padres antes que hijos (el orden de las claves
    foráneas, que es el que necesita `restaurar`)."""
    return [
        t for t in Base.metadata.sorted_tables
        if t.name in TABLAS_DEL_CLIENTE and t.name not in TABLAS_QUE_NO_SALEN
    ]


def _binarias(tabla) -> list:
    return [c for c in tabla.columns if isinstance(c.type, LargeBinary)]


def _a_json(valor):
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, enum.Enum):
        # SQLAlchemy guarda el NOMBRE del miembro, no su valor.
        return valor.name
    return valor


def _nombre_seguro(nombre: str | None) -> str:
    """El nombre del archivo sin nada que, al descomprimir, lo saque de su
    carpeta: ni barras, ni `..`, ni un punto adelante."""
    limpio = re.sub(r"[^\w.\-]+", "_", nombre or "").strip("._")
    return limpio[:80] or "archivo"


def _leeme(m: dict) -> str:
    c = m["cliente"]
    return f"""Copia de seguridad de RECABRA: {c['nombre']} ({c['slug']})
Tomada el {m['tomada_en']} (hora de Colombia).

Qué hay adentro
  · tablas/     cada tabla del supermercado en JSON, tal como está en la base.
  · archivos/   documentos de contrato, fotos de montaje, planometrías y artes
                del catálogo. En el JSON, la columna `data` dice cuál es.
  · personas.json   quién tenía acceso y con qué rol, para volver a invitarlos.
  · MANIFIESTO.json cuántas filas y archivos hay de cada cosa.

Qué no trae, a propósito: las claves compartidas, que ya no abren nada, y los
intentos de ingreso con su IP.

Guardala fuera de RECABRA: en tu computador, en Drive, en un disco aparte.
Para volver a cargarla en una base nueva, quien administra la plataforma usa
backend/scripts/restaurar_copia.py.
"""


def armar_copia(cliente, motor, destino, personas: list[dict]) -> dict:
    """Escribe en `destino` (abierto en binario) el ZIP con todo lo de
    `cliente`, leyendo de `motor`. Devuelve el manifiesto."""
    manifiesto = {
        "formato": FORMATO,
        "cliente": {"slug": cliente.slug, "nombre": cliente.nombre},
        "tomada_en": ahora().isoformat(timespec="seconds"),
        "tablas": {},
        "no_trae": {
            **TABLAS_QUE_NO_SALEN,
            "app_config": "las claves compartidas: " + ", ".join(sorted(CONFIG_QUE_NO_SALE)),
        },
        # Una base vieja a la que le falta algo que el modelo tiene: se copia lo
        # que hay y se dice qué faltaba, en vez de fallar entera.
        "faltaba_en_la_base": [],
    }

    with zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_DEFLATED) as zf, motor.connect() as cx:
        inspector = inspect(cx)
        hay = set(inspector.get_table_names())
        for tabla in tablas_de_la_copia():
            if tabla.name not in hay:
                manifiesto["faltaba_en_la_base"].append(tabla.name)
                continue
            reales = {c["name"] for c in inspector.get_columns(tabla.name)}
            manifiesto["faltaba_en_la_base"] += [
                f"{tabla.name}.{c.name}" for c in tabla.columns if c.name not in reales
            ]
            columnas = [c for c in tabla.columns if c.name in reales]
            binarias = [c for c in _binarias(tabla) if c.name in reales]
            clave = list(tabla.primary_key.columns)

            consulta = select(*[c for c in columnas if c not in binarias]).order_by(*clave)
            if tabla.name == "app_config":
                consulta = consulta.where(tabla.c.key.not_in(sorted(CONFIG_QUE_NO_SALE)))
            filas = [dict(f) for f in cx.execute(consulta).mappings().all()]

            archivos = peso = 0
            for fila in filas:
                for col in binarias:
                    dato = cx.execute(
                        select(col).where(and_(*(c == fila[c.name] for c in clave)))
                    ).scalar()
                    if dato is None:
                        fila[col.name] = None
                        continue
                    dato = bytes(dato)
                    id_ = "-".join(str(fila[c.name]) for c in clave)
                    ruta = f"archivos/{tabla.name}/{id_}-{_nombre_seguro(fila.get('filename'))}"
                    # Fotos y PDF ya vienen comprimidos: guardarlos tal cual.
                    zf.writestr(ruta, dato, compress_type=zipfile.ZIP_STORED)
                    fila[col.name] = ruta
                    archivos += 1
                    peso += len(dato)

            zf.writestr(
                f"tablas/{tabla.name}.json",
                json.dumps(
                    [{k: _a_json(v) for k, v in fila.items()} for fila in filas],
                    ensure_ascii=False, indent=1,
                ),
            )
            entrada = {"filas": len(filas)}
            if binarias:
                entrada.update(archivos=archivos, bytes=peso)
            manifiesto["tablas"][tabla.name] = entrada

        zf.writestr("personas.json", json.dumps(personas, ensure_ascii=False, indent=1))
        zf.writestr("LEEME.txt", _leeme(manifiesto))
        zf.writestr("MANIFIESTO.json", json.dumps(manifiesto, ensure_ascii=False, indent=1))

    return manifiesto


def _de_json(col, valor, zf):
    if valor is None:
        return None
    if isinstance(col.type, LargeBinary):
        return zf.read(valor)
    if isinstance(col.type, DateTime):
        return datetime.fromisoformat(valor)
    if isinstance(col.type, Date):
        return date.fromisoformat(valor)
    if isinstance(col.type, SAEnum) and col.type.enum_class is not None:
        return col.type.enum_class[valor]
    return valor


def restaurar(archivo, motor) -> dict[str, int]:
    """Carga la copia `archivo` (ruta o archivo abierto) en la base de `motor`.
    Devuelve cuántas filas entraron por tabla.

    **Sólo en una base sin datos de negocio**: volver es para una base nueva, no
    para mezclar dos historias, y se niega antes de escribir nada. `app_config`
    es la excepción —toda base arranca con la configuración por defecto—: las
    claves que trae la copia pisan a las de la base.

    Todo o nada: una sola transacción.
    """
    with zipfile.ZipFile(archivo) as zf:
        try:
            manifiesto = json.loads(zf.read("MANIFIESTO.json"))
        except KeyError as e:
            raise ErrorDeCopia("Ese archivo no es una copia de RECABRA: le falta MANIFIESTO.json.") from e
        if manifiesto.get("formato") != FORMATO:
            raise ErrorDeCopia(
                f"La copia está en el formato {manifiesto.get('formato')!r} y esta versión lee el {FORMATO}."
            )

        tablas = tablas_de_la_copia()
        Base.metadata.create_all(bind=motor, tables=tablas)
        nombres = set(zf.namelist())
        cuantas: dict[str, int] = {}

        with motor.begin() as cx:
            ocupadas = [
                t.name for t in tablas
                if t.name != "app_config" and cx.execute(select(func.count()).select_from(t)).scalar()
            ]
            if ocupadas:
                raise ErrorDeCopia(
                    "La base ya tiene datos en " + ", ".join(ocupadas)
                    + ". Una copia se carga en una base vacía."
                )

            for tabla in tablas:
                ruta = f"tablas/{tabla.name}.json"
                if ruta not in nombres:
                    continue
                filas = json.loads(zf.read(ruta))
                columnas = {c.name: c for c in tabla.columns}
                if tabla.name == "app_config" and filas:
                    cx.execute(tabla.delete().where(tabla.c.key.in_([f["key"] for f in filas])))
                convertidas = (
                    {k: _de_json(columnas[k], v, zf) for k, v in fila.items() if k in columnas}
                    for fila in filas
                )
                if _binarias(tabla):
                    # De a una: cada fila trae su archivo entero.
                    for valores in convertidas:
                        cx.execute(tabla.insert().values(valores))
                else:
                    lote = list(convertidas)
                    if lote:
                        cx.execute(tabla.insert(), lote)
                cuantas[tabla.name] = len(filas)

            # Generación nueva, como en el traspaso: un navegador que guardaba
            # planos en `localStorage` los tira y toma los de la copia, en vez
            # de subir encima lo que tenía de antes (`fixtureStore.syncFromServer`).
            config = Base.metadata.tables["app_config"]
            cx.execute(config.delete().where(config.c.key == CLAVE_GENERACION))
            cx.execute(config.insert().values(key=CLAVE_GENERACION, value=secrets.token_hex(8)))

            _reiniciar_secuencias(cx, tablas)

    return cuantas
