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

USO
───
    export RECABRA_CLAVE='...'          # nunca como argumento: queda en el historial
    python3 scripts/respaldo.py --base https://tu-app.onrender.com

Deja una carpeta `respaldos/AAAA-MM-DD-HHMM/` con todo adentro y un
MANIFIESTO.json que dice qué se bajó y cuánto pesa.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

TIEMPO_ESPERA = 60


class Api:
    def __init__(self, base: str, clave: str):
        self.base = base.rstrip("/") + "/api"
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
        try:
            return self._pedir("/auth/login", {"password": clave})["token"]
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit("La clave de admin no fue aceptada. Revisá RECABRA_CLAVE.")
            if e.code == 429:
                sys.exit("Demasiados intentos de ingreso. Esperá 15 minutos.")
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


def main() -> int:
    p = argparse.ArgumentParser(description="Copia completa de los datos de RECABRA.")
    p.add_argument("--base", default="http://127.0.0.1:8000",
                   help="URL del servidor, sin /api al final.")
    p.add_argument("--destino", default="respaldos",
                   help="Dónde dejar la carpeta con la copia.")
    p.add_argument("--sin-binarios", action="store_true",
                   help="Saltear adjuntos, fotos y planometrías. Más rápido, menos completo.")
    args = p.parse_args()

    clave = os.environ.get("RECABRA_CLAVE")
    if not clave:
        print("Falta la clave. Poné:  export RECABRA_CLAVE='...'", file=sys.stderr)
        print("No la pases como argumento: queda escrita en el historial del shell.",
              file=sys.stderr)
        return 2

    sello = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
    carpeta = pathlib.Path(args.destino) / sello
    carpeta.mkdir(parents=True, exist_ok=True)

    print(f"Servidor  {args.base}")
    print(f"Destino   {carpeta}\n")

    api = Api(args.base, clave)
    manifiesto = {"tomado_en": datetime.datetime.now().isoformat(timespec="seconds"),
                  "servidor": args.base, "tablas": {}, "archivos": {}}
    fallas = []

    # ── Las tablas ────────────────────────────────────────────────────────
    for nombre, ruta in TABLAS:
        try:
            dato = api.json(ruta)
        except Exception as e:                                  # noqa: BLE001
            fallas.append(f"{nombre} ({ruta}): {e}")
            print(f"  ✗ {nombre:24s} {e}")
            continue
        peso = guardar_json(carpeta, nombre, dato)
        manifiesto["tablas"][nombre] = {"ruta": ruta, "cuenta": cuantos(dato), "bytes": peso}
        print(f"  · {nombre:24s} {cuantos(dato)}")

    # ── Los binarios: adjuntos, fotos y planometrías ──────────────────────
    if not args.sin_binarios:
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
                manifiesto["archivos"][destino.name] = len(crudo)
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
                manifiesto["archivos"][destino.name] = len(crudo)
                bajados += 1
        print(f"  · {'archivos binarios':24s} {bajados} bajado{'' if bajados == 1 else 's'}")

    manifiesto["fallas"] = fallas
    guardar_json(carpeta, "MANIFIESTO", manifiesto)

    total = sum(f.stat().st_size for f in carpeta.rglob("*") if f.is_file())
    print(f"\nListo · {total / 1024:.0f} KB en {carpeta}")

    # Una copia vacía es peor que ninguna, porque da tranquilidad falsa.
    planos = manifiesto["tablas"].get("planos-por-sede")
    if not planos or planos["cuenta"].startswith("0 "):
        print("\n⚠  No se bajó ningún plano. La copia NO sirve para volver: revisá "
              "el servidor y la clave antes de confiar en ella.")
        return 1
    if fallas:
        print(f"\n⚠  {len(fallas)} cosa(s) fallaron; están listadas en MANIFIESTO.json.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
