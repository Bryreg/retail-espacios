from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.auth import require_admin, require_auth
from app.database import get_db
from app.fechas import hoy
from app.models.models import Space, SpaceLease
from app.routers.spaces import expire_leases

# Read-only router: any authenticated role may consult the dashboard.
router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_auth)])


# `GET /dashboard/kpis` y `GET /dashboard/spaces` se fueron el 2026-10-30
# (auditoría P1-16 y P2-12): nada los llamaba, y el primero era una tercera
# versión del canon del mes (contaba por `Space.status`). El canon de un mes es
# UNO: `services/canon.py`, que sirve `/dashboard/serie`.


def _meses_hasta(hoy_, n: int) -> list[tuple[int, int]]:
    """Los ``n`` meses que terminan en el de ``hoy_``, del más viejo al actual."""
    y, m = hoy_.year, hoy_.month
    fuera = []
    for _ in range(n):
        fuera.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return fuera[::-1]


@router.get("/serie")
def serie_mensual(meses: int = 12, role: str = Depends(require_admin), db: Session = Depends(get_db)):
    """El canon de cada mes, por sede (rediseño UX, etapa 5: la curva de 12
    meses de Indicadores, la variación contra el mes anterior y «Todas las
    sedes»).

    El canon de un mes es lo DEVENGADO en ese mes, al peso
    (`services/canon.py`, la MISMA cuenta que hace el navegador para Inicio con
    su gemela `utils/canon.ts`): cada contrato aporta su canon al mes por los
    días del mes que corre —uno que arranca el 16 aporta la mitad; uno
    cancelado, hasta el día anterior a su baja—, y los que se cobran por un % de
    las ventas, lo cobrado en sus cortes de ese mes. El mes en curso cuenta
    entero, con lo firmado.

    ``del_mes``: por sede, los contratos y cortes con que se sacó el canon del
    mes en curso. Inicio los pasa por la gemela y muestra la misma cifra que
    «Todas las sedes» (auditoría P1-16). ``hoy``: el día de Colombia, para que
    el navegador no use el suyo (P3-8).

    También dice, por espacio, cuándo terminó su último contrato (`ultimo_fin`):
    «días sin contrato» de lo que hoy está disponible. Plata: sólo
    administración.
    """
    from app.models.vender import CorteDeVenta
    from app.services.canon import canon_del_mes, limites_del_mes
    from app.services.historial import bajas_efectivas, cerrados_a_mano, fue_canon, tramo_devengado

    expire_leases(db)
    n = max(1, min(int(meses or 12), 24))
    hoy_ = hoy()
    lista = _meses_hasta(hoy_, n)
    primero = limites_del_mes(*lista[0])[0]
    ultimo = limites_del_mes(*lista[-1])[1]

    crudas = (db.query(SpaceLease, Space.sede, Space.code)
              .join(Space, Space.id == SpaceLease.space_id)
              .filter(SpaceLease.start_date <= ultimo, SpaceLease.end_date >= primero)
              .all())
    # Lo que terminó por fecha fue canon; lo reemplazado, no; lo cancelado,
    # hasta su baja (`is_active` en falso no los distingue: `services/historial.py`).
    ids = [l.id for l, _s, _c in crudas]
    cerrados = cerrados_a_mano(db, ids)
    bajas = bajas_efectivas(db, [i for i in ids if cerrados.get(i) == "cancelado"])
    sedes: dict[str, dict] = {}
    #: Por sede: las filas de contratos y de cortes que entran en la cuenta.
    contratos: dict[str, list[dict]] = {}
    cortes: dict[str, list[dict]] = {}

    def clave_de(sede):
        return (sede or "").strip().upper() or "SIN SEDE"

    def de(sede):
        return sedes.setdefault(clave_de(sede), {"canon": [0] * n, "contratos": [0] * n, "ultimo_fin": {}})

    sede_de: dict[int, str] = {}
    for l, sede, _code in crudas:
        tramo = tramo_devengado(l, cerrados, bajas, hoy_)
        if tramo is None:
            continue
        sede_de[l.id] = clave_de(sede)
        de(sede)
        contratos.setdefault(clave_de(sede), []).append({
            "valor": float(l.monthly_rent or 0), "desde": l.start_date, "hasta": l.end_date,
            "corta": tramo[1] if tramo[1] < l.end_date else None,
        })
    for c in (db.query(CorteDeVenta)
              .filter(CorteDeVenta.periodo_desde <= ultimo, CorteDeVenta.periodo_hasta >= primero).all()):
        if c.lease_id in sede_de:
            cortes.setdefault(sede_de[c.lease_id], []).append(
                {"monto": float(c.monto or 0), "desde": c.periodo_desde, "hasta": c.periodo_hasta})
    for clave, s in sedes.items():
        filas, del_corte = contratos.get(clave, []), cortes.get(clave, [])
        for i, (y, m) in enumerate(lista):
            ini, fin = limites_del_mes(y, m)
            s["canon"][i] = int(canon_del_mes(filas, del_corte, y, m))
            s["contratos"][i] = sum(1 for f in filas
                                    if f["desde"] <= fin and min(f["hasta"], f["corta"] or f["hasta"]) >= ini)
    # El último fin de cada espacio: lo que ya terminó por fecha (no lo
    # cancelado ni lo reemplazado).
    terminados = (db.query(SpaceLease, Space.sede, Space.code)
                  .join(Space, Space.id == SpaceLease.space_id)
                  .filter(SpaceLease.end_date < hoy_).all())
    cerrados_t = cerrados_a_mano(db, [l.id for l, _s, _c in terminados])
    for l, sede, code in terminados:
        if not fue_canon(l, cerrados_t, hoy_):
            continue
        k = (code or "").strip().upper()
        previo = de(sede)["ultimo_fin"].get(k)
        if previo is None or l.end_date.isoformat() > previo:
            de(sede)["ultimo_fin"][k] = l.end_date.isoformat()
    # Lo del mes en curso, tal cual entró en la cuenta, para la gemela del navegador.
    ini_hoy, fin_hoy = limites_del_mes(hoy_.year, hoy_.month)

    def iso(d):
        return d.isoformat() if d else None

    del_mes = {
        clave: {
            "contratos": [{"valor": f["valor"], "desde": iso(f["desde"]), "hasta": iso(f["hasta"]),
                           "corta": iso(f["corta"])}
                          for f in contratos.get(clave, [])
                          if f["desde"] <= fin_hoy and min(f["hasta"], f["corta"] or f["hasta"]) >= ini_hoy],
            "cortes": [{"monto": c["monto"], "desde": iso(c["desde"]), "hasta": iso(c["hasta"])}
                       for c in cortes.get(clave, []) if c["desde"] <= fin_hoy and c["hasta"] >= ini_hoy],
        }
        for clave in sedes
    }
    return {"meses": [f"{y:04d}-{m:02d}" for y, m in lista], "sedes": sedes, "del_mes": del_mes,
            "hoy": hoy_.isoformat()}
