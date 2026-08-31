#!/usr/bin/env python3
"""Copia completa de los datos de RECABRA, por la API.

POR QUÉ EXISTE
──────────────
La base vive en Render y, en plan gratuito, Render NO hace respaldos: sin
copias automáticas y sin recuperación a un punto en el tiempo. Y adentro del
sistema tampoco hay historia: `layout_snapshots` guarda UNA fila por sede y se
sobreescribe en cada guardado, así que un plano mal subido pisa al anterior y
no queda de dónde sacarlo.

Este script baja todo por HTTPS con la clave de admin — no necesita
credenciales de la base ni acceso al servidor. Sirve para correrlo antes de
cada despliegue, o dejarlo programado.

QUÉ COPIA
─────────
  · Los planos de cada sede (lo más frágil: es lo que se sobreescribe)
  · Tarifas, temporadas y ajustes
  · Espacios con sus contratos, y proveedores
  · Reportes de montaje
  · Catálogo de artes
  · Configuración y libreta de correos
  · Los binarios: adjuntos de contrato, fotos de montaje y planometrías

QUÉ NO COPIA
────────────
  · La clave de admin ni el JWT_SECRET (viven en el panel de Render)
  · Nada que la API no exponga

UN SUPERMERCADO, UNA BASE
─────────────────────────
Cada cliente tiene su propia base y su propia clave de admin, así que una sola
clave no abre a todos. El script recorre todos los clientes por defecto y busca
la clave de cada uno en su propia variable de entorno:

    RECABRA_CLAVE_GALERIAS, RECABRA_CLAVE_OLIMPICA, ...

Con un solo cliente alcanza `RECABRA_CLAVE` a secas, que es como venía siendo.

**Si falta la clave de algún cliente, ese cliente NO se copia y el script
termina con error diciendo cuál.** Copiar a la mitad y no avisar es la peor
forma de fallar: deja una carpeta con fecha de hoy que parece completa.

USO
───
    export RECABRA_CLAVE='...'          # nunca como argumento: queda en el historial
    python3 scripts/respaldo.py --base https://tu-app.onrender.com

    # un cliente puntual, con `RECABRA_CLAVE` o `RECABRA_CLAVE_OLIMPICA`
    python3 scripts/respaldo.py --base https://... --cliente olimpica

Deja una carpeta `respaldos/AAAA-MM-DD-HHMM/<cliente>/` por cada supermercado y
un MANIFIESTO.json arriba que dice qué se bajó, de quién y cuánto pesa.

Si algún cliente quedó afuera, la carpeta se llama `...-INCOMPLETO`. Y si no se
copió ninguno, no queda carpeta: en una urgencia uno agarra la de fecha más
nueva, y una carpeta vacía con la fecha de hoy es la peor cosa que puede
encontrar ahí.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import pathlib
import shutil
import sys
import urllib.error
import urllib.request

TIEMPO_ESPERA = 60


class ErrorDeIngreso(Exception):
    """No se pudo entrar como ese cliente. No corta el respaldo de los demás."""


class Api:
    def __init__(self, base: str, clave: str, cliente: str | None = None):
        self.base = base.rstrip("/") + "/api"
        self.cliente = cliente
        self.op = urllib.request.build_opener()
        self.token = self._entrar(clave)

    def _pedir(self, ruta: str, cuerpo=None, crudo=False):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        pet = urllib.request.Request(
            self.base + ruta, data=datos, method="POST" if datos else "GET"
        )
        if datos is not None:
            pet.add_header("Content-Type", "application/json")
        if getattr(self, "token", None):
            pet.add_header("Authorization", f"Bearer {self.token}")
        with self.op.open(pet, timeout=TIEMPO_ESPERA) as r:
            bruto = r.read()
        return bruto if crudo else (json.loads(bruto) if bruto else None)

    def _entrar(self, clave: str) -> str:
        cuerpo = {"password": clave}
        if self.cliente:
            cuerpo["cliente"] = self.cliente
        try:
            return self._pedir("/auth/login", cuerpo)["token"]
        except urllib.error.HTTPError as e:
            quien = f" de {self.cliente}" if self.cliente else ""
            if e.code in (401, 403):
                raise ErrorDeIngreso(f"la clave de admin{quien} no fue aceptada") from e
            if e.code == 429:
                raise ErrorDeIngreso(
                    "demasiados intentos de ingreso; esperá 15 minutos"
                ) from e
            raise

    def json(self, ruta: str):
        return self._pedir(ruta)

    def binario(self, ruta: str) -> bytes:
        return self._pedir(ruta, crudo=True)


# Las tablas, en orden de importancia. El nombre es el del archivo que sale.
TABLAS = [
    ("planos-por-sede", "/layout/"),
    ("ajustes", "/layout/settings"),
    ("temporadas", "/layout/seasons"),
    ("tarifas-de-referencia", "/layout/rates"),
    ("espacios", "/spaces/"),
    ("imagenes-de-cara", "/spaces/face-images"),
    ("proveedores", "/suppliers/"),
    ("montajes", "/mounts/"),
    ("catalogo-de-artes", "/catalogo/"),
    ("config-de-correo", "/notifications/config"),
    ("libreta-de-correos", "/notifications/contacts"),
    ("kpis", "/dashboard/kpis"),
]


def guardar_json(carpeta: pathlib.Path, nombre: str, dato) -> int:
    ruta = carpeta / f"{nombre}.json"
    texto = json.dumps(dato, ensure_ascii=False, indent=2)
    ruta.write_text(texto, encoding="utf-8")
    return len(texto.encode("utf-8"))


def cuantos(dato) -> str:
    if isinstance(dato, list):
        return f"{len(dato)} registro{'' if len(dato) == 1 else 's'}"
    if isinstance(dato, dict):
        return f"{len(dato)} clave{'' if len(dato) == 1 else 's'}"
    return "—"


def descubrir_clientes(base: str) -> list[dict]:
    """Los supermercados que hay, preguntándoselo al servidor.

    La lista es pública —la pantalla de ingreso la muestra antes de que nadie se
    identifique—, así que se puede pedir sin token. Un servidor viejo, de antes
    de que hubiera más de un cliente, contesta 404: ahí se copia como siempre.
    """
    pet = urllib.request.Request(base.rstrip("/") + "/api/auth/clientes")
    try:
        with urllib.request.urlopen(pet, timeout=TIEMPO_ESPERA) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise


def clave_de(slug: str, hay_uno_solo: bool) -> str | None:
    """La clave de ese cliente. Nunca por argumento: quedaría en el historial."""
    propia = os.environ.get(f"RECABRA_CLAVE_{slug.upper()}")
    if propia:
        return propia
    # Con un cliente solo, `RECABRA_CLAVE` a secas — que es como venía siendo y
    # es lo que hace que nada cambie para quien ya tenía el respaldo programado.
    return os.environ.get("RECABRA_CLAVE") if hay_uno_solo else None


def respaldar_cliente(api: Api, carpeta: pathlib.Path, sin_binarios: bool) -> dict:
    """Baja todo lo de UN cliente a su carpeta. Devuelve su parte del manifiesto."""
    carpeta.mkdir(parents=True, exist_ok=True)
    parte = {"tablas": {}, "archivos": {}, "fallas": []}
    fallas = parte["fallas"]

    # ── Las tablas ────────────────────────────────────────────────────────
    for nombre, ruta in TABLAS:
        try:
            dato = api.json(ruta)
        except Exception as e:                                  # noqa: BLE001
            fallas.append(f"{nombre} ({ruta}): {e}")
            print(f"    ✗ {nombre:24s} {e}")
            continue
        peso = guardar_json(carpeta, nombre, dato)
        parte["tablas"][nombre] = {"ruta": ruta, "cuenta": cuantos(dato), "bytes": peso}
        print(f"    · {nombre:24s} {cuantos(dato)}")

    # ── Los binarios: adjuntos, fotos y planometrías ──────────────────────
    if not sin_binarios:
        bin_dir = carpeta / "archivos"
        bin_dir.mkdir(exist_ok=True)
        espacios = []
        try:
            espacios = api.json("/spaces/") or []
        except Exception as e:                                  # noqa: BLE001
            fallas.append(f"espacios para binarios: {e}")

        bajados = 0
        for esp in espacios:
            eid, codigo = esp.get("id"), esp.get("code") or f"esp-{esp.get('id')}"
            # Adjuntos del espacio: contratos, fotos de montaje
            try:
                lista = api.json(f"/spaces/{eid}/files") or []
            except Exception:                                   # noqa: BLE001
                lista = []
            for f in lista:
                try:
                    crudo = api.binario(f"/files/{f['id']}")
                except Exception as e:                          # noqa: BLE001
                    fallas.append(f"archivo {f.get('id')} de {codigo}: {e}")
                    continue
                destino = bin_dir / f"{codigo}__{f['id']}__{f.get('filename', 'archivo')}"
                destino.write_bytes(crudo)
                parte["archivos"][destino.name] = len(crudo)
                bajados += 1
            # Planometría del contrato vigente de ese espacio
            try:
                plano = api.json(f"/planometrias/por-espacio/{codigo}")
            except Exception:                                   # noqa: BLE001
                plano = None
            if plano and plano.get("file_id"):
                try:
                    crudo = api.binario(f"/planometrias/{plano['file_id']}")
                except Exception as e:                          # noqa: BLE001
                    fallas.append(f"planometría de {codigo}: {e}")
                    continue
                destino = bin_dir / f"{codigo}__plano__{plano.get('filename', 'planometria')}"
                destino.write_bytes(crudo)
                parte["archivos"][destino.name] = len(crudo)
                bajados += 1
        print(f"    · {'archivos binarios':24s} {bajados} bajado{'' if bajados == 1 else 's'}")

    # Una copia vacía es peor que ninguna, porque da tranquilidad falsa.
    planos = parte["tablas"].get("planos-por-sede")
    parte["sirve_para_volver"] = bool(planos) and not planos["cuenta"].startswith("0 ")
    return parte


def main() -> int:
    p = argparse.ArgumentParser(description="Copia completa de los datos de RECABRA.")
    p.add_argument("--base", default="http://127.0.0.1:8000",
                   help="URL del servidor, sin /api al final.")
    p.add_argument("--destino", default="respaldos",
                   help="Dónde dejar la carpeta con la copia.")
    p.add_argument("--sin-binarios", action="store_true",
                   help="Saltear adjuntos, fotos y planometrías. Más rápido, menos completo.")
    p.add_argument("--cliente", default=None,
                   help="Copiar sólo ese supermercado. Sin esto se copian todos.")
    args = p.parse_args()

    try:
        clientes = descubrir_clientes(args.base)
    except Exception as e:                                      # noqa: BLE001
        print(f"No se pudo preguntar qué clientes hay: {e}", file=sys.stderr)
        return 1

    # Un servidor de antes del aislamiento no tiene lista: se copia como siempre.
    if not clientes:
        clientes = [{"slug": "", "nombre": "(cliente único)"}]

    if args.cliente:
        elegidos = [c for c in clientes if c["slug"] == args.cliente]
        if not elegidos:
            hay = ", ".join(c["slug"] for c in clientes) or "ninguno"
            print(f"No existe el cliente «{args.cliente}». Hay: {hay}", file=sys.stderr)
            return 2
        clientes = elegidos

    hay_uno_solo = len(clientes) == 1
    sin_clave = [c for c in clientes if not clave_de(c["slug"], hay_uno_solo)]
    if sin_clave and len(sin_clave) == len(clientes):
        print("Falta la clave. Poné:  export RECABRA_CLAVE='...'", file=sys.stderr)
        if not hay_uno_solo:
            for c in sin_clave:
                print(f"  export RECABRA_CLAVE_{c['slug'].upper()}='...'", file=sys.stderr)
        print("No la pases como argumento: queda escrita en el historial del shell.",
              file=sys.stderr)
        return 2

    sello = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
    carpeta = pathlib.Path(args.destino) / sello
    carpeta.mkdir(parents=True, exist_ok=True)

    print(f"Servidor  {args.base}")
    print(f"Destino   {carpeta}")
    print(f"Clientes  {len(clientes)}\n")

    manifiesto = {
        "tomado_en": datetime.datetime.now().isoformat(timespec="seconds"),
        "servidor": args.base,
        "clientes": {},
        "sin_copiar": [],
    }
    inservibles = []

    for c in clientes:
        slug, nombre = c["slug"], c.get("nombre") or c["slug"]
        clave = clave_de(slug, hay_uno_solo)
        etiqueta = nombre if slug else "(cliente único)"
        if not clave:
            print(f"  ✗ {etiqueta}: falta RECABRA_CLAVE_{slug.upper()}")
            manifiesto["sin_copiar"].append(
                {"slug": slug, "motivo": f"falta RECABRA_CLAVE_{slug.upper()}"}
            )
            continue

        print(f"  {etiqueta}")
        try:
            api = Api(args.base, clave, slug or None)
        except ErrorDeIngreso as e:
            print(f"    ✗ {e}")
            manifiesto["sin_copiar"].append({"slug": slug, "motivo": str(e)})
            continue

        # Sin slug hay una sola carpeta; con slug, una por supermercado. Siempre
        # la misma forma, para que restaurar no dependa de cuántos clientes había
        # el día que se tomó la copia.
        parte = respaldar_cliente(api, carpeta / (slug or "datos"), args.sin_binarios)
        manifiesto["clientes"][slug or "datos"] = parte
        if not parte["sirve_para_volver"]:
            inservibles.append(etiqueta)
        print()

    copiados = len(manifiesto["clientes"])

    # Si no se copió NADA, la carpeta se borra en vez de quedar ahí pesando 0 KB.
    # Alguien buscando "el último respaldo" en una urgencia agarra la de fecha
    # más nueva, y ésa sería una carpeta vacía con la fecha de hoy.
    if copiados == 0:
        shutil.rmtree(carpeta, ignore_errors=True)
        print("No se copió ningún cliente, así que no queda carpeta.")
        for c in manifiesto["sin_copiar"]:
            print(f"  · {c['slug'] or '(único)'}: {c['motivo']}")
        return 1

    # Y si se copió a medias, la carpeta lo dice en el nombre. El MANIFIESTO
    # también, pero el nombre es lo que se ve cuando hay que restaurar apurado.
    incompleta = bool(manifiesto["sin_copiar"]) or bool(inservibles)
    if incompleta:
        marcada = carpeta.with_name(carpeta.name + "-INCOMPLETO")
        carpeta.rename(marcada)
        carpeta = marcada

    guardar_json(carpeta, "MANIFIESTO", manifiesto)

    total = sum(f.stat().st_size for f in carpeta.rglob("*") if f.is_file())
    print(f"Listo · {total / 1024:.0f} KB · {copiados} de {len(clientes)} cliente(s) "
          f"en {carpeta}")

    # ── Fallar fuerte, y decir exactamente qué ────────────────────────────
    salida = 0
    if manifiesto["sin_copiar"]:
        print("\n⚠  NO se copiaron: " +
              ", ".join(c["slug"] or "(único)" for c in manifiesto["sin_copiar"]))
        print("   Está anotado en MANIFIESTO.json y en el nombre de la carpeta.")
        salida = 1
    if inservibles:
        # Una copia vacía es peor que ninguna, porque da tranquilidad falsa.
        print("\n⚠  Sin ningún plano: " + ", ".join(inservibles))
        print("   Esa copia NO sirve para volver: revisá el servidor y la clave.")
        salida = 1
    fallas = sum(len(v["fallas"]) for v in manifiesto["clientes"].values())
    if fallas:
        print(f"\n⚠  {fallas} cosa(s) fallaron; están listadas en MANIFIESTO.json.")
        salida = 1
    return salida


if __name__ == "__main__":
    raise SystemExit(main())
