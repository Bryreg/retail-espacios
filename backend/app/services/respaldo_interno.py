"""El respaldo de la plataforma, tomado DESDE ADENTRO de Render (auditoría P0-3).

La base de producción no acepta conexiones de afuera («External traffic not
allowed» en Render, y así tiene que quedar), así que el runner de GitHub no
puede hacer el `pg_dump`. Lo hace el servicio, que sí ve la base por la red
interna, y le entrega a GitHub el archivo ya cifrado:

    GitHub (respaldo.yml) ── POST /api/interno/respaldo + token ──▶ servicio
                          ◀── recabra-respaldo-<fecha>.tar.gpg ───

**El mismo formato de siempre.** El volcado lo arma `scripts/respaldar_plataforma.py`
(un `pg_dump -Fc` por base + `MANIFIESTO.json`), se empaqueta en un `.tar` y se
cifra con `gpg --symmetric --cipher-algo AES256` y la frase de
`RESPALDO_PASSPHRASE`. `scripts/restaurar_plataforma.py` y `docs/operacion.md`
no cambian: se descifra, se desarma el `.tar` y se restaura igual que antes.

**Lo que nunca sale sin cifrar.** La frase vive sólo en Render; GitHub recibe y
guarda bytes cifrados. Los archivos intermedios quedan en una carpeta temporal
que se borra apenas termina la respuesta (o si algo falla en el medio).
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "respaldar_plataforma.py"


class SinRespaldo(Exception):
    """El respaldo no se puede tomar en este servidor (falta configuración)."""


@dataclass
class Respaldo:
    carpeta: Path        # la temporal: se borra con `limpiar()`
    archivo: Path        # el .tar.gpg que se entrega
    nombre: str          # recabra-respaldo-<fecha>.tar.gpg
    bases: int
    fallas: list[str] = field(default_factory=list)

    def limpiar(self) -> None:
        shutil.rmtree(self.carpeta, ignore_errors=True)


def _script():
    spec = importlib.util.spec_from_file_location("respaldar_plataforma", _SCRIPT)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)  # type: ignore[union-attr]
    return modulo


def frase() -> str:
    return os.getenv("RESPALDO_PASSPHRASE", "").strip()


def tomar(url: str | None = None) -> Respaldo:
    """Vuelca todas las bases, empaqueta y cifra. Devuelve el archivo listo
    para entregar; quien llama se encarga de `limpiar()` cuando terminó de
    mandarlo. Levanta `SinRespaldo` si falta algo para tomarlo."""
    R = _script()
    url = R.normalizar_url(url if url is not None else os.getenv("DATABASE_URL", ""))
    if not url.startswith("postgresql"):
        raise SinRespaldo("El respaldo de la plataforma es de Postgres; este servidor no usa Postgres.")
    clave = frase()
    if not clave:
        raise SinRespaldo("Falta RESPALDO_PASSPHRASE en el servicio: sin ella el respaldo no se cifra y no se entrega.")
    for binario in ("pg_dump", "gpg"):
        if shutil.which(binario) is None:
            raise SinRespaldo(f"Falta `{binario}` en la imagen del servicio (Dockerfile).")

    carpeta = Path(tempfile.mkdtemp(prefix="recabra-respaldo-"))
    try:
        volcado = carpeta / "respaldo"
        codigo = R.main(["--url", url, "--salida", str(volcado)])
        manifiesto = (volcado / "MANIFIESTO.json")
        if not manifiesto.exists():
            raise RuntimeError("El volcado no dejó MANIFIESTO.json")
        import json

        datos = json.loads(manifiesto.read_text(encoding="utf-8"))
        fallas = list(datos.get("fallas") or [])
        if codigo != 0 and not fallas:
            fallas = ["desconocida"]

        sello = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
        nombre = f"recabra-respaldo-{sello}.tar.gpg"
        tar = carpeta / f"recabra-respaldo-{sello}.tar"
        with tarfile.open(tar, "w") as t:
            # Mismo árbol que armaba el workflow: una carpeta `respaldo/`.
            t.add(volcado, arcname="respaldo")
        shutil.rmtree(volcado, ignore_errors=True)

        cifrado = carpeta / nombre
        gnupg = carpeta / ".gnupg"
        gnupg.mkdir(mode=0o700)
        # La frase entra por stdin, nunca por la línea de comandos (se vería
        # en la lista de procesos).
        subprocess.run(
            ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
             "--symmetric", "--cipher-algo", "AES256", "--output", str(cifrado), str(tar)],
            input=clave.encode("utf-8"), check=True, capture_output=True,
            env={**os.environ, "GNUPGHOME": str(gnupg)},
        )
        tar.unlink(missing_ok=True)
        return Respaldo(carpeta=carpeta, archivo=cifrado, nombre=nombre,
                        bases=len(datos.get("bases") or []), fallas=fallas)
    except BaseException:
        shutil.rmtree(carpeta, ignore_errors=True)
        raise
