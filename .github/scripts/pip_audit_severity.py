"""Filtra el JSON de `pip-audit` por severidad HIGH/CRITICAL.

`pip-audit` devuelve exit code 1 apenas encuentra UNA vulnerabilidad, sin
importar la severidad -- por eso el workflow lo corre con `|| true` y deja
que ESTE script sea el que decide si el job falla. pip-audit no expone la
severidad en su propio JSON, así que se consulta OSV.dev -- la misma base de
la que pip-audit ya lee -- por cada id encontrado.

Uso: `python3 pip_audit_severity.py audit-python.json`
Exit 0: sin vulnerabilidades, o ninguna HIGH/CRITICAL confirmada.
Exit 1: al menos una HIGH/CRITICAL confirmada.
"""
import json
import sys
import urllib.request


def severidad_de(vuln_id: str) -> str | None:
    """OSV.dev sí trae severidad para la mayoría de los avisos:
    `database_specific.severity` (texto LOW/MODERATE/HIGH/CRITICAL, el campo
    que usan los avisos GHSA) o, si falta, un vector CVSS_V3 en `severity[]`
    del que se puede leer el score base al final del string
    ("CVSS:3.1/.../S:U/C:H/I:H/A:H" no trae el número solo, pero el campo
    "score" de OSV para esas entradas SÍ es el vector completo con el score
    como último segmento en algunas fuentes -- se intenta leer y si no se
    puede, se abstiene).

    None si no se pudo determinar. Un None NO cuenta como high/critical --
    "no llorar lobo" corta para los dos lados: no se bloquea un PR por algo
    que no se pudo confirmar, pero queda impreso en el log para que alguien
    lo mire a mano.
    """
    try:
        req = urllib.request.Request(
            f"https://api.osv.dev/v1/vulns/{vuln_id}",
            headers={"User-Agent": "recabra-deps-audit"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            info = json.load(r)
    except Exception as exc:  # red caída, id no encontrado en OSV, etc.
        print(f"  ! no se pudo consultar {vuln_id}: {exc}")
        return None

    db_sev = (info.get("database_specific") or {}).get("severity")
    if db_sev:
        return str(db_sev).upper()

    for entry in info.get("severity", []) or []:
        if entry.get("type") == "CVSS_V3":
            vector = entry.get("score", "")
            try:
                base = float(vector.rsplit("/", 1)[-1])
            except (ValueError, IndexError):
                continue
            if base >= 9.0:
                return "CRITICAL"
            if base >= 7.0:
                return "HIGH"
            if base >= 4.0:
                return "MODERATE"
            return "LOW"
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print("uso: pip_audit_severity.py <audit.json>", file=sys.stderr)
        return 2

    with open(sys.argv[1]) as f:
        data = json.load(f)

    # El JSON de pip-audit trae, según versión, {"dependencies": [...]} o
    # directamente una lista -- las dos formas conviven acá.
    deps = data.get("dependencies", []) if isinstance(data, dict) else data

    vuln_ids: set[str] = set()
    por_paquete: list[tuple[str, str, str]] = []
    for dep in deps:
        for v in dep.get("vulns") or []:
            vuln_ids.add(v["id"])
            por_paquete.append((dep.get("name"), dep.get("version"), v["id"]))

    if not vuln_ids:
        print("pip-audit: sin vulnerabilidades reportadas.")
        return 0

    print(
        f"pip-audit reportó {len(vuln_ids)} vulnerabilidad(es); "
        "consultando severidad en OSV.dev:\n"
    )

    altas = []
    for vid in sorted(vuln_ids):
        sev = severidad_de(vid)
        print(f"  {vid}: {sev or 'severidad desconocida'}")
        if sev in ("HIGH", "CRITICAL"):
            altas.append((vid, sev))

    if altas:
        altos_ids = {v for v, _ in altas}
        print(f"\n{len(altas)} vulnerabilidad(es) HIGH/CRITICAL -- el job falla.")
        for paquete, version, vid in por_paquete:
            if vid in altos_ids:
                print(f"  - {paquete} {version}: {vid}")
        return 1

    print(
        f"\n{len(vuln_ids)} vulnerabilidad(es) reportada(s) por pip-audit, "
        "ninguna HIGH/CRITICAL confirmada -- no se falla el job."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
