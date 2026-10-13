"""La parte de Python de la referencia del «antes» del catálogo de muebles.

    cd frontend && node scripts/capturar-catalogo.mjs            # primero: tipos, plano y la parte ts
    cd backend && python scripts/capturar_catalogo.py              # después: la parte python
    cd backend && python scripts/capturar_catalogo.py --comprobar  # compara, sin escribir

**Sólo llama funciones puras.** No lee ni escribe una fila: el plano es el
sintético que dejó en el archivo ``frontend/scripts/capturar-catalogo.mjs``, y
la base se apunta a una SQLite en memoria antes de importar ``app`` para que ni
por error toque la de desarrollo ni, corrido en Render, la de producción.

── Para qué ─────────────────────────────────────────────────────────────────

El servidor tiene sus propias copias de lo que depende del tipo de mueble: los
prefijos (``renumeracion.py``), lo que nunca se alquila y las frases de
referencia (``layout_lookup.py``), y el tipo de tarifa (``bulk_leases.py`` y
``plataforma_metricas.py``). El catálogo único las va a leer de un archivo
compartido, y la promesa es que un plano viejo dé exactamente lo mismo que hoy.

Esto anota, en ``frontend/scripts/casos/catalogo-antes.json`` y bajo la clave
``python``, qué da hoy cada una: las tablas, la respuesta por tipo y, sobre el
plano sintético, los espacios que se ofrecen, las caras que cuenta la
plataforma, los códigos de la renumeración, los contratos que importaría y los
que vería la auditoría de consola.

El resto del archivo lo escribe el script del frontend; acá se conserva tal
cual, y se escribe con el formato de ``JSON.stringify(…, null, 2)`` para que
los dos scripts dejen exactamente los mismos bytes.
"""
import json
import math
import os
import sys
from decimal import Decimal
from pathlib import Path

# Antes de cualquier `import app…`: `app.database` arma el motor al importarse.
os.environ["DATABASE_URL"] = "sqlite://"

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from app import plataforma_metricas  # noqa: E402
from app.routers import bulk_leases  # noqa: E402
from app.services import importar_del_plano, layout_lookup, renumeracion  # noqa: E402
import auditar_desfase  # noqa: E402

SALIDA = BACKEND.parent / "frontend" / "scripts" / "casos" / "catalogo-antes.json"


def _de(ruta: str, nota: str | None = None) -> str:
    return f"backend/{ruta}" + (f" ({nota})" if nota else "")


def _tabla(ruta: str, valor, nota: str | None = None) -> dict:
    return {"de": _de(ruta, nota), "valor": valor}


# ─── El mismo JSON que escribe el frontend ────────────────────────────────────

def _numero_js(x: float) -> str:
    """Un float como lo escribe ``JSON.stringify``: ``1`` y no ``1.0``,
    ``1e-7`` y no ``1e-07``, ``0`` y no ``-0.0``. Los dígitos son los mismos
    en los dos lenguajes (el más corto que vuelve al mismo número); cambia
    sólo dónde cada uno pasa a notación exponencial."""
    if math.isnan(x) or math.isinf(x):
        raise ValueError(f"{x} no tiene forma en JSON")
    if x == 0:
        return "0"
    signo = "-" if x < 0 else ""
    _, digitos, exponente = Decimal(repr(abs(x))).normalize().as_tuple()
    s = "".join(map(str, digitos))
    k = len(s)
    n = exponente + k            # dónde cae la coma, contando desde el primer dígito
    if k <= n <= 21:
        cuerpo = s + "0" * (n - k)
    elif 0 < n <= 21:
        cuerpo = s[:n] + "." + s[n:]
    elif -6 < n <= 0:
        cuerpo = "0." + "0" * (-n) + s
    else:
        e = n - 1
        cuerpo = (s if k == 1 else s[0] + "." + s[1:]) + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return signo + cuerpo


def a_json(v, nivel: int = 0) -> str:
    """``JSON.stringify(v, null, 2)``, carácter por carácter."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return _numero_js(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    sangria = "  " * (nivel + 1)
    cierre = "  " * nivel
    if isinstance(v, (list, tuple)):
        if not v:
            return "[]"
        return "[\n" + ",\n".join(sangria + a_json(x, nivel + 1) for x in v) + "\n" + cierre + "]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "{\n" + ",\n".join(
            sangria + json.dumps(str(k), ensure_ascii=False) + ": " + a_json(x, nivel + 1)
            for k, x in v.items()
        ) + "\n" + cierre + "}"
    raise TypeError(f"{type(v).__name__} no tiene forma en JSON")


# ─── La captura ───────────────────────────────────────────────────────────────

def capturar(tipos: list[str], sede: str, muebles: list[dict]) -> dict:
    tablas = {
        "PREFIJO_POR_TIPO": _tabla("app/services/renumeracion.py", dict(renumeracion.PREFIJO_POR_TIPO)),
        "PREFIJO_DESCONOCIDO": _tabla("app/services/renumeracion.py", renumeracion.PREFIJO_DESCONOCIDO),
        "NUNCA_ALQUILABLE": _tabla("app/services/layout_lookup.py", sorted(layout_lookup.NUNCA_ALQUILABLE),
                                   "es un frozenset: ordenado"),
        "_REFERENCIAS": _tabla("app/services/layout_lookup.py", dict(layout_lookup._REFERENCIAS)),
    }

    por_tipo = {
        t: {
            "prefijo_de": renumeracion.prefijo_de(t),
            "es_comercializable": layout_lookup.es_comercializable({"type": t}),
            "caras_de": layout_lookup.caras_de({"type": t}),
            "tipo_de_tarifa_bulk_leases": bulk_leases._tipo_de_tarifa(t),
            "tipo_de_tarifa_plataforma_metricas": plataforma_metricas._tipo_de_tarifa(t),
            "referencia": layout_lookup._REFERENCIAS.get(t),
        }
        for t in tipos
    }

    por_mueble = {
        f["id"]: {
            "es_comercializable": layout_lookup.es_comercializable(f),
            "caras_de": layout_lookup.caras_de(f),
            "es_gondola_doble_plataforma": plataforma_metricas._es_gondola_doble(f),
        }
        for f in muebles
    }

    eje, motivo = renumeracion.eje_de_recorrido(muebles)
    # La importación sólo mira caras marcadas «ocupado»: con todo ocupado, lo
    # que devuelve es qué caras de cada tipo cuenta como contrato del plano.
    todo_ocupado = [{**f, "status": "occupied", "faceB": {"status": "occupied"}} for f in muebles]
    mapa = plataforma_metricas._mapa_tipos_de_sede(muebles, sede)

    plano = {
        "espacios_ofrecidos": _tabla("app/services/layout_lookup.py",
                                     sorted(layout_lookup.espacios_ofrecidos(muebles, sede)), "ordenado"),
        "caras_comercializables": _tabla("app/plataforma_metricas.py",
                                         sorted(plataforma_metricas._caras_comercializables(muebles, sede)),
                                         "ordenado"),
        "mapa_tipos_de_sede": _tabla("app/plataforma_metricas.py",
                                     {k: list(mapa[k]) for k in sorted(mapa)}, "código → [sede, tipo de tarifa]"),
        "eje_de_recorrido": _tabla("app/services/renumeracion.py", {"eje": eje, "motivo": motivo}),
        "codigos_nuevos": _tabla("app/services/renumeracion.py", [
            {"id": f["id"], "banda": banda, "codigo": codigo}
            for banda, f, codigo in renumeracion.codigos_nuevos(muebles)
        ], "la renumeración por recorrido"),
        "caras_vendidas_con_todo_ocupado": _tabla("app/services/importar_del_plano.py", [
            codigo for codigo, _ in importar_del_plano.caras_vendidas(todo_ocupado)
        ], "status 'occupied' en la cara A y en faceB de cada mueble"),
        "caras_del_plano_auditoria": _tabla("scripts/auditar_desfase.py",
                                            sorted(auditar_desfase.caras_del_plano(muebles)), "ordenado"),
    }

    return {
        "fuente": "backend/scripts/capturar_catalogo.py",
        "tablas": tablas,
        "por_tipo": por_tipo,
        "por_mueble": por_mueble,
        "plano": plano,
    }


def main() -> int:
    comprobar = "--comprobar" in sys.argv[1:]
    if not SALIDA.is_file():
        print(f"falta {SALIDA}: correr primero `node scripts/capturar-catalogo.mjs` en frontend", file=sys.stderr)
        return 1
    datos = json.loads(SALIDA.read_text(encoding="utf-8"))
    if "plano" not in datos or "tipos" not in datos:
        print("el archivo no tiene `tipos` y `plano`: correr primero el script del frontend", file=sys.stderr)
        return 1

    nuevo = capturar(datos["tipos"], datos["plano"]["sede"], datos["plano"]["muebles"])

    if comprobar:
        if a_json(datos.get("python")) != a_json(nuevo):
            print("  FALLA catalogo-antes.json no es lo que da el servidor hoy: cambió la parte python",
                  file=sys.stderr)
            return 1
        print("  ok   catalogo-antes.json (parte python) es lo que da el servidor hoy")
        return 0

    datos["python"] = nuevo
    SALIDA.write_text(a_json(datos) + "\n", encoding="utf-8")
    print(f"catalogo-antes.json: parte python con {len(nuevo['tablas'])} tablas, "
          f"{len(nuevo['por_tipo'])} tipos y {len(nuevo['por_mueble'])} muebles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
