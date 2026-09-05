"""Filtra el JSON de `pip-audit` por severidad HIGH/CRITICAL.

`pip-audit` devuelve exit code 1 apenas encuentra UNA vulnerabilidad, sin
importar la severidad -- por eso el workflow lo corre con `|| true` y deja
que ESTE script sea el que decide si el job falla. pip-audit no expone la
severidad en su propio JSON, así que se consulta OSV.dev -- la misma base de
la que pip-audit ya lee -- por cada id encontrado.

OSV publica la severidad casi siempre como VECTOR CVSS, no como número, así
que este script CALCULA el score base a partir del vector (spec CVSS v3.1
§7.1, sin librerías nuevas). Antes hacía `float()` sobre el vector entero, lo
que fallaba siempre y dejaba al gate incapaz de confirmar un HIGH/CRITICAL:
era un adorno (hallazgo hardening-8 de la auditoría integral).

Uso: `python3 pip_audit_severity.py audit-python.json`
Exit 0: sin vulnerabilidades, o ninguna HIGH/CRITICAL confirmada.
Exit 1: al menos una HIGH/CRITICAL confirmada.

`python3 pip_audit_severity.py --self-test` comprueba la fórmula contra
vectores de score conocido, sin red.
"""
import json
import sys
import urllib.request


# ─── CVSS v3.x: del vector al score base ─────────────────────────────────────
#
# OSV publica la severidad de la mayoría de los avisos como VECTOR
# ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"), no como número. El script
# anterior hacía `float(vector.rsplit("/", 1)[-1])` sobre eso: el último
# segmento es "A:H", `float()` levanta ValueError y el `continue` se comía la
# entrada. Resultado: el gate NUNCA podía confirmar un HIGH/CRITICAL a partir
# de un vector, que es la forma en que vienen casi todos (hallazgo
# hardening-8).
#
# La fórmula es la de la especificación CVSS v3.1 §7.1, sin librerías nuevas.

_AV = {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2}
_AC = {"L": 0.77, "H": 0.44}
# Privilegios requeridos: el peso cambia si el alcance (Scope) cambió.
_PR_SIN_CAMBIO = {"N": 0.85, "L": 0.62, "H": 0.27}
_PR_CON_CAMBIO = {"N": 0.85, "L": 0.68, "H": 0.50}
_UI = {"N": 0.85, "R": 0.62}
_CIA = {"H": 0.56, "L": 0.22, "N": 0.0}


def _roundup(x: float) -> float:
    """El "Roundup" de CVSS 3.1: redondea SIEMPRE hacia arriba a un decimal,
    con la aritmética entera que la spec define para no arrastrar el error del
    punto flotante."""
    entero = int(round(x * 100_000))
    if entero % 10_000 == 0:
        return entero / 100_000.0
    return (entero // 10_000 + 1) / 10.0


def score_de_vector(vector: str) -> float | None:
    """El score base CVSS v3.x del vector, o None si no es un vector v3 válido.

    Sólo mira las ocho métricas base; las temporales/ambientales, si vienen, se
    ignoran (no cambian el score BASE, que es el que usa este gate)."""
    partes = [p for p in (vector or "").strip().split("/") if p]
    if not partes or not partes[0].upper().startswith("CVSS:3"):
        return None
    m: dict[str, str] = {}
    for parte in partes[1:]:
        if ":" not in parte:
            continue
        k, _, v = parte.partition(":")
        m[k.strip().upper()] = v.strip().upper()

    try:
        alcance_cambiado = m["S"] == "C"
        av = _AV[m["AV"]]
        ac = _AC[m["AC"]]
        pr = (_PR_CON_CAMBIO if alcance_cambiado else _PR_SIN_CAMBIO)[m["PR"]]
        ui = _UI[m["UI"]]
        c, i, a = _CIA[m["C"]], _CIA[m["I"]], _CIA[m["A"]]
    except KeyError:
        return None

    iss = 1.0 - ((1.0 - c) * (1.0 - i) * (1.0 - a))
    if alcance_cambiado:
        impacto = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    else:
        impacto = 6.42 * iss
    if impacto <= 0:
        return 0.0

    explotabilidad = 8.22 * av * ac * pr * ui
    bruto = impacto + explotabilidad
    if alcance_cambiado:
        bruto *= 1.08
    return _roundup(min(bruto, 10.0))


def severidad_de_score(score: float) -> str:
    """Los cortes cualitativos de la spec (§5)."""
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def _score_de_entrada(entry: dict) -> float | None:
    """El score de una entrada de `severity[]` de OSV.

    Vienen de dos formas: el vector completo (lo normal) o, en algunas
    fuentes, el número pelado. Se aceptan las dos."""
    crudo = (entry.get("score") or "").strip()
    if not crudo:
        return None
    directo = score_de_vector(crudo)
    if directo is not None:
        return directo
    try:
        return float(crudo)
    except ValueError:
        return None


def _consultar_osv(vuln_id: str) -> dict | None:
    try:
        req = urllib.request.Request(
            f"https://api.osv.dev/v1/vulns/{vuln_id}",
            headers={"User-Agent": "recabra-deps-audit"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except Exception as exc:  # red caída, id no encontrado en OSV, etc.
        print(f"::warning::{vuln_id}: no se pudo consultar OSV.dev ({exc}) -- "
              "severidad sin determinar, revisar a mano")
        return None


def _severidad_de_aviso(info: dict) -> str | None:
    """La severidad que se puede sacar de UN documento de OSV, o None.

    Dos fuentes, en orden: `database_specific.severity` (texto
    LOW/MODERATE/HIGH/CRITICAL, el campo que traen los avisos GHSA) y, si
    falta, el vector CVSS de `severity[]`, del que se CALCULA el score base.

    Un score base 0.0 se trata como "no determinable" y NO como LOW: un aviso
    publicado con impacto nulo en las tres métricas es un vector marcador de
    posición, no una vulnerabilidad inofensiva. Los `PYSEC-*` de starlette y
    python-multipart son exactamente eso -- traen
    `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N` (=0.0) junto a un vector v4
    que sí declara `VA:H`. Devolver LOW ahí sería peor que abstenerse: sería
    un falso negativo con cara de dato.
    """
    db_sev = (info.get("database_specific") or {}).get("severity")
    if db_sev:
        return str(db_sev).upper()

    mejor: float | None = None
    for entry in info.get("severity", []) or []:
        # CVSS v4 tiene otra fórmula (macrovector + tabla de búsqueda); no se
        # implementa acá. Se lo deja pasar: si el aviso SÓLO trae v4, se
        # abstiene y avisa, que es el comportamiento honesto.
        if entry.get("type") != "CVSS_V3":
            continue
        score = _score_de_entrada(entry)
        if score is not None and (mejor is None or score > mejor):
            mejor = score
    if mejor is not None and mejor > 0.0:
        return severidad_de_score(mejor)
    return None


def severidad_de(vuln_id: str) -> str | None:
    """La severidad del aviso, buscándola también en sus ALIAS.

    Los ids `PYSEC-*` que devuelve pip-audit casi nunca traen severidad
    utilizable; el mismo aviso publicado como `GHSA-*` sí trae
    `database_specific.severity`. Consultar los alias es lo que convierte a
    este gate en algo que de verdad puede confirmar un HIGH/CRITICAL.

    None NO cuenta como high/critical -- "no llorar lobo" corta para los dos
    lados: no se bloquea un PR por algo que no se pudo confirmar. Pero ya no
    queda en un log silencioso: sale como `::warning::` de GitHub Actions, que
    el resumen del job muestra en amarillo con el id adentro.
    """
    info = _consultar_osv(vuln_id)
    if info is None:
        return None

    sev = _severidad_de_aviso(info)
    if sev:
        return sev

    # Los GHSA primero: son los que llevan la severidad cualitativa.
    alias = [a for a in (info.get("aliases") or []) if a != vuln_id]
    alias.sort(key=lambda a: (not a.startswith("GHSA-"), a))
    for otro in alias:
        otra_info = _consultar_osv(otro)
        if otra_info is None:
            continue
        sev = _severidad_de_aviso(otra_info)
        if sev:
            print(f"    ({vuln_id} sin severidad propia; se toma la de {otro})")
            return sev

    print(f"::warning::{vuln_id}: OSV.dev no trae severidad utilizable "
          f"(ni en el aviso ni en sus alias {alias or '[]'}) -- "
          "revisar a mano antes de mergear")
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


def _self_test() -> int:
    """`python3 .github/scripts/pip_audit_severity.py --self-test`.

    Sin red y sin dependencias: comprueba la fórmula contra vectores cuyo score
    está calculado a mano con la spec (no de memoria). Si esto se rompe, el
    gate vuelve a ser el adorno que era antes del hallazgo hardening-8.
    """
    casos = [
        # (vector, score esperado, severidad esperada)
        # ISS=1-0.44³=0.914816 · Impacto=6.42·ISS=5.8731 ·
        # Explotabilidad=8.22·0.85·0.77·0.85·0.85=3.8870 · suma=9.7601 -> 9.8
        ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8, "CRITICAL"),
        # ISS=0.56 · Impacto=3.5952 · misma explotabilidad · suma=7.4822 -> 7.5
        ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H", 7.5, "HIGH"),
        # ISS=0.22 · Impacto=1.4124 ·
        # Explotabilidad=8.22·0.85·0.44·0.85·0.62=1.6201 · suma=3.0325 -> 3.1
        ("CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N", 3.1, "LOW"),
        # Alcance CAMBIADO: Impacto=7.52(ISS-0.029)-3.25(ISS-0.02)^15=6.0478 ·
        # (6.0478+3.8870)·1.08=10.73 -> tope 10.0
        ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0, "CRITICAL"),
        # Sin impacto: score 0 aunque sea trivial de explotar.
        ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", 0.0, "LOW"),
    ]
    fallas = 0
    for vector, esperado, sev_esperada in casos:
        obtenido = score_de_vector(vector)
        sev = severidad_de_score(obtenido) if obtenido is not None else None
        ok = obtenido == esperado and sev == sev_esperada
        print(f"  [{'ok ' if ok else 'MAL'}] {vector} -> {obtenido} ({sev}), "
              f"esperado {esperado} ({sev_esperada})")
        fallas += 0 if ok else 1

    # Lo que NO es un vector v3 no se inventa un score.
    for basura in ("", "A:H", "CVSS:2.0/AV:N/AC:L/Au:N/C:P/I:P/A:P",
                   "CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"):
        if score_de_vector(basura) is not None:
            print(f"  [MAL] {basura!r} debió dar None y dio {score_de_vector(basura)}")
            fallas += 1
    # Y el número pelado, que algunas fuentes de OSV sí mandan, se acepta.
    if _score_de_entrada({"score": "7.5"}) != 7.5:
        print("  [MAL] un score numérico directo dejó de aceptarse")
        fallas += 1

    # Sin red: la lectura de un documento de OSV ya armado.
    avisos = [
        ({"database_specific": {"severity": "high"}}, "HIGH", "texto de GHSA"),
        ({"severity": [{"type": "CVSS_V3",
                        "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"}]},
         "HIGH", "vector v3"),
        # El marcador de posición de los PYSEC-*: score 0.0 + un v4 con VA:H.
        # No puede salir LOW; tiene que abstenerse para que se busque el alias.
        ({"severity": [
            {"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N"},
            {"type": "CVSS_V4",
             "score": "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N"},
        ]}, None, "vector v3 marcador de posición + v4"),
        ({}, None, "aviso sin severidad"),
    ]
    for aviso, esperado, etiqueta in avisos:
        obtenido = _severidad_de_aviso(aviso)
        ok = obtenido == esperado
        print(f"  [{'ok ' if ok else 'MAL'}] {etiqueta} -> {obtenido}, esperado {esperado}")
        fallas += 0 if ok else 1

    print("self-test OK" if not fallas else f"self-test: {fallas} caso(s) mal")
    return 0 if not fallas else 1


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(_self_test())
    sys.exit(main())
