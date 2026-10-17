"""La geometría de las zonas de una cara vendida por participación.

Gemela de ``frontend/src/utils/zonasGeometria.ts``: las dos corren los MISMOS
casos (``frontend/scripts/casos/zonas.json``, con
``tests/test_participaciones_geometria.py`` de este lado y
``scripts/probar-zonas.mjs`` del otro) y tienen que dar EXACTAMENTE el mismo
número, bit a bit. El porcentaje dibujado que ve la dueña en el lienzo es el
que este servidor acepta o rechaza al confirmar: si los dos lados sumaran
distinto, una zona al filo del redondeo pasaría en la pantalla y rebotaría
acá. Por eso, y hay que cuidarlo al tocar:

· **Bucles explícitos, mismo orden de suma.** Nada de ``sum()`` ni
  ``math.fsum`` sobre flotantes (Python 3.12 cambió ``sum()`` de flotantes a
  suma compensada; hoy corre 3.11, y el día que se suba no tiene que cambiar
  nada). Cada cuenta está escrita con las mismas operaciones, en el mismo
  orden, que en el navegador.
· **Cuantización a 1e-6** de todo vértice (y de las exclusiones, en
  ``superficie.py``): ``floor(x·1e6 + 0.5) / 1e6``, escrito igual en los dos.
· **Enteros para la simplicidad y la orientación**: con u,v cuantizados,
  ``round(x·1e6)`` es un entero ≤ 10⁶; acá son ``int`` (exactos) y en el
  navegador float64 (exactos hasta 2⁵³: los productos no pasan de 2·10¹²).
· **Ordenamientos estables con la misma clave**, y el punto medio de una
  franja es ``(x0 + x1) / 2``.

El algoritmo (§6.2 del diseño de participaciones): franjas verticales entre
todas las x de vértices y de cruces entre polígonos distintos; dentro de una
franja ningún borde se cruza con otro, así que cada extremo de intervalo es
lineal en x y el largo en el punto medio por el ancho es la integral exacta,
también con el recorte contra las exclusiones.

u = 0 es el borde izquierdo de quien mira la cara; v = 0, abajo. Todo va
normalizado a [0,1]²: el área de ``area_cubierta`` es una fracción de la cara;
en m² se multiplica por ancho · alto.

Puro: no importa nada de ``app`` (las pruebas lo llaman sin base ni app).
"""
from __future__ import annotations

import math

#: Cuantización de u,v (zonas y exclusiones).
CUANTO = 1e-6
MIN_VERTICES = 3
#: Por zona.
MAX_VERTICES = 24
MAX_ZONAS_POR_CARA = 60
#: La suma de todas las zonas de la capa, enviada y guardada. Con 24/240 el
#: peor caso (estrellas que se cruzan sobre zócalo y parante) tarda ≈ 0,1 s en
#: CPython; con los topes de antes (40/600), 1,3 s.
MAX_VERTICES_POR_CARA = 240
#: 1 cm²: zona mínima, solape mínimo y «sin superficie útil».
AREA_MINIMA_M2 = 1e-4
_CARA_ENTERA_PB = 10000
_EPS = 1e-12

#: Los códigos con que ``validar_zona`` rechaza una zona (§3.7).
#: ``ZONA_MALFORMADA`` es el paso 1 (no es una lista de pares de números
#: finitos): la API lo contesta con 422 y no lo guarda.
CODIGOS_DE_ZONA = (
    "ZONA_MALFORMADA", "ZONA_POCOS_VERTICES", "ZONA_DEMASIADOS_VERTICES",
    "ZONA_FUERA", "ZONA_SE_CRUZA", "ZONA_SIN_AREA",
)


def cuantizar_numero(x: float) -> float:
    """``floor(x·1e6 + 0.5) / 1e6`` (nunca −0: ``floor`` da un ``int``)."""
    return math.floor(x * 1e6 + 0.5) / 1e6


def area_firmada(p) -> float:
    """El área con signo (shoelace), positiva si es antihoraria en u,v."""
    a = 0.0
    n = len(p)
    for i in range(n):
        x1, y1 = p[i][0], p[i][1]
        j = 0 if i + 1 == n else i + 1
        x2, y2 = p[j][0], p[j][1]
        a += x1 * y2 - x2 * y1
    return a / 2


def cuantizar(p) -> list[list[float]]:
    """§3.7 paso 3: cada número a 1e-6."""
    return [[cuantizar_numero(u), cuantizar_numero(v)] for u, v in p]


def _sin_repetidos(p) -> list[list[float]]:
    """Sin vértices consecutivos repetidos ni el de cierre."""
    fuera: list[list[float]] = []
    for q in p:
        if fuera and fuera[-1][0] == q[0] and fuera[-1][1] == q[1]:
            continue
        fuera.append(q)
    while len(fuera) > 1 and fuera[0][0] == fuera[-1][0] and fuera[0][1] == fuera[-1][1]:
        fuera.pop()
    return fuera


def _enteros(p) -> list[tuple[int, int]]:
    """Los vértices en enteros de 1e-6 (ya cuantizados: el redondeo es exacto)."""
    return [(math.floor(u * 1e6 + 0.5), math.floor(v * 1e6 + 0.5)) for u, v in p]


def _doble_area_entera(k) -> int:
    s = 0
    n = len(k)
    for i in range(n):
        j = 0 if i + 1 == n else i + 1
        s += k[i][0] * k[j][1] - k[j][0] * k[i][1]
    return s


def _antihorario(p):
    """Antihoraria conservando el primer vértice: ``[v0, vn-1, …, v1]`` si
    venía horaria. El signo, en enteros: los dos lados dan el mismo."""
    if len(p) < 3 or _doble_area_entera(_enteros(p)) >= 0:
        return p
    return [p[0]] + [p[i] for i in range(len(p) - 1, 0, -1)]


def limpiar(p) -> list[list[float]]:
    """Cuantiza, quita repetidos (y el de cierre) y orienta antihorario
    conservando el primer vértice."""
    return _antihorario(_sin_repetidos(cuantizar(p)))


def _orientacion(a, b, c) -> int:
    o = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return 1 if o > 0 else (-1 if o < 0 else 0)


def _en_segmento(a, b, c) -> bool:
    return (min(a[0], b[0]) <= c[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= c[1] <= max(a[1], b[1]))


def _se_tocan(p1, p2, p3, p4) -> bool:
    d1, d2 = _orientacion(p3, p4, p1), _orientacion(p3, p4, p2)
    d3, d4 = _orientacion(p1, p2, p3), _orientacion(p1, p2, p4)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True
    if d1 == 0 and _en_segmento(p3, p4, p1):
        return True
    if d2 == 0 and _en_segmento(p3, p4, p2):
        return True
    if d3 == 0 and _en_segmento(p1, p2, p3):
        return True
    if d4 == 0 and _en_segmento(p1, p2, p4):
        return True
    return False


def es_simple(p) -> bool:
    """Polígono simple ESTRICTO (§3.7 paso 6), en enteros: dos aristas no
    adyacentes no se tocan ni en un punto, y dos adyacentes colineales no
    vuelven sobre sí mismas. Con vértices consecutivos repetidos o menos de
    tres, no es simple."""
    n = len(p)
    if n < 3:
        return False
    k = _enteros(p)
    for i in range(n):
        j = 0 if i + 1 == n else i + 1
        if k[i] == k[j]:
            return False
    for i in range(n):
        a, b = k[i], k[0 if i + 1 == n else i + 1]
        for j in range(i + 1, n):
            c, d = k[j], k[0 if j + 1 == n else j + 1]
            if j == i + 1 or (i == 0 and j == n - 1):
                # Adyacentes: comparten un vértice. Sólo se pisan si son
                # colineales y la segunda vuelve sobre la primera.
                x, y, z = (a, b, d) if j == i + 1 else (c, a, b)
                cruz = (y[0] - x[0]) * (z[1] - y[1]) - (y[1] - x[1]) * (z[0] - y[0])
                punto = (y[0] - x[0]) * (z[0] - y[0]) + (y[1] - x[1]) * (z[1] - y[1])
                if cruz == 0 and punto < 0:
                    return False
                continue
            if _se_tocan(a, b, c, d):
                return False
    return True


def _es_numero(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _son_pares_finitos(x) -> bool:
    if not isinstance(x, (list, tuple)):
        return False
    for q in x:
        if not isinstance(q, (list, tuple)) or len(q) != 2:
            return False
        if not _es_numero(q[0]) or not _es_numero(q[1]):
            return False
    return True


def validar_zona(vertices, ancho: float, alto: float) -> tuple[list | None, str | None]:
    """§3.7, los pasos que son de la geometría (1, 3 a 8), en ese orden: el
    primero que falla da el código. El 2 (que la participación sea de esta
    cara) lo mira el servicio; el 9 (``ZONA_SIN_SUPERFICIE_UTIL``, un aviso)
    necesita las exclusiones y lo da ``medir``.

    Devuelve ``(vertices, codigo)``. Con ``codigo is None`` los vértices son
    los limpios: cuantizados, sin repetidos y antihorarios conservando el
    primero. Es ``validarZona`` del navegador (allá, ``{vertices, codigo}``).
    """
    if not _son_pares_finitos(vertices):
        return None, "ZONA_MALFORMADA"
    p = _sin_repetidos(cuantizar(vertices))
    if len(p) < MIN_VERTICES:
        return p, "ZONA_POCOS_VERTICES"
    if len(p) > MAX_VERTICES:
        return p, "ZONA_DEMASIADOS_VERTICES"
    for u, v in p:
        if u < 0 or u > 1 or v < 0 or v > 1:
            return p, "ZONA_FUERA"
    if not es_simple(p):
        return p, "ZONA_SE_CRUZA"
    if abs(_doble_area_entera(_enteros(p))) / 2e12 * ancho * alto < AREA_MINIMA_M2:
        return p, "ZONA_SIN_AREA"
    return _antihorario(p), None


def dentro_de_los_topes(zonas) -> bool:
    """Las zonas que se mandan entran en los topes (§3.8 paso 0): ≤ 60 zonas,
    ≤ 240 vértices en total y ≤ 24 por zona, contados CRUDOS (antes de
    limpiar). Fuera de los topes, la API contesta 422 y no guarda. Cada zona
    es un ``dict`` con ``vertices``."""
    if len(zonas) > MAX_ZONAS_POR_CARA:
        return False
    total = 0
    for z in zonas:
        vs = z.get("vertices") if isinstance(z, dict) else None
        n = len(vs) if isinstance(vs, (list, tuple)) else 0
        if n > MAX_VERTICES:
            return False
        total += n
    return total <= MAX_VERTICES_POR_CARA


# ── Franjas verticales con barrido (§6.2) ────────────────────────────────────
#
# Una arista no vertical es la tupla (xmin, xmax, ax, ay, bx, by, pid, fam):
# su rango en x, sus extremos, de qué polígono y de qué familia (0 = P,
# 1 = exclusiones, 2 = Q). Un intervalo es la lista [y0, y1].


def _rectangulo(e) -> list[list[float]]:
    return [[e["u0"], e["v0"]], [e["u1"], e["v0"]], [e["u1"], e["v1"]], [e["u0"], e["v1"]]]


def _aristas_de(familias) -> list[tuple]:
    fuera = []
    pid = 0
    for fi, f in enumerate(familias):
        for p in f:
            n = len(p)
            for i in range(n):
                a = p[i]
                b = p[0 if i + 1 == n else i + 1]
                if abs(a[0] - b[0]) > _EPS:
                    fuera.append((min(a[0], b[0]), max(a[0], b[0]), a[0], a[1], b[0], b[1], pid, fi))
            pid += 1
    return fuera


def _cruce_x(e, f):
    """La x de un cruce PROPIO (t, u ∈ (0,1)) entre dos aristas, o None."""
    ax, ay, bx, by = e[2], e[3], e[4], e[5]
    cx, cy, dx, dy = f[2], f[3], f[4], f[5]
    rx, ry = bx - ax, by - ay
    sx, sy = dx - cx, dy - cy
    den = rx * sy - ry * sx
    if abs(den) < _EPS:
        return None
    t = ((cx - ax) * sy - (cy - ay) * sx) / den
    u = ((cx - ax) * ry - (cy - ay) * rx) / den
    if t <= 0 or t >= 1 or u <= 0 or u >= 1:
        return None
    return ax + t * rx


def _xmin(e) -> float:
    return e[0]


def _eventos(familias, aristas) -> list[float]:
    """Las x donde cambia algo: los bordes de la cara, todos los vértices y
    los cruces entre aristas de polígonos DISTINTOS cuyos rangos en x y en y
    se pisan (barrido por xmin; dentro de un polígono simple no hay cruces)."""
    xs = {0.0, 1.0}
    for f in familias:
        for p in f:
            for q in p:
                xs.add(q[0] + 0.0)
    activas: list[tuple] = []
    for e in sorted(aristas, key=_xmin):
        activas = [f for f in activas if f[1] > e[0]]
        ylo, yhi = min(e[3], e[5]), max(e[3], e[5])
        for f in activas:
            if f[6] == e[6]:
                continue
            if max(f[3], f[5]) < ylo or min(f[3], f[5]) > yhi:
                continue
            x = _cruce_x(e, f)
            if x is not None:
                xs.add(x + 0.0)
        activas.append(e)
    return sorted(xs)


def _intervalos_de(activas, xm: float) -> list[list[float]]:
    """Par-impar POR POLÍGONO en la vertical xm, con las aristas activas de UNA
    familia (todas cumplen xmin < xm < xmax: así las mantiene el barrido)."""
    por_poligono: dict[int, list[float]] = {}
    for e in activas:
        y = e[3] + (xm - e[2]) * (e[5] - e[3]) / (e[4] - e[2])
        ys = por_poligono.get(e[6])
        if ys is None:
            por_poligono[e[6]] = [y]
        else:
            ys.append(y)
    fuera = []
    for ys in por_poligono.values():
        ys.sort()
        for i in range(0, len(ys) - 1, 2):
            fuera.append([ys[i], ys[i + 1]])
    return fuera


def _unir(ints) -> list[list[float]]:
    """Ordena por inicio (y por fin) y funde los que se pisan o se tocan."""
    fuera: list[list[float]] = []
    for a, b in sorted(ints):
        if fuera and a <= fuera[-1][1]:
            if b > fuera[-1][1]:
                fuera[-1][1] = b
        else:
            fuera.append([a, b])
    return fuera


def _cortar(A, B) -> list[list[float]]:
    """A ∩ B, las dos ya unidas (dos punteros)."""
    fuera = []
    i = j = 0
    while i < len(A) and j < len(B):
        a = A[i][0] if A[i][0] > B[j][0] else B[j][0]
        b = A[i][1] if A[i][1] < B[j][1] else B[j][1]
        if b > a:
            fuera.append([a, b])
        if A[i][1] < B[j][1]:
            i += 1
        else:
            j += 1
    return fuera


def _restar(A, B) -> list[list[float]]:
    """A − B, las dos ya unidas."""
    fuera = []
    for a0, a1 in A:
        cur = a0
        for b0, b1 in B:
            if b1 <= cur or b0 >= a1:
                continue
            if b0 > cur:
                fuera.append([cur, b0])
            if b1 > cur:
                cur = b1
        if cur < a1:
            fuera.append([cur, a1])
    return fuera


def _rango_x(F) -> tuple[float, float]:
    lo, hi = math.inf, -math.inf
    for p in F:
        for q in p:
            if q[0] < lo:
                lo = q[0]
            if q[0] > hi:
                hi = q[0]
    return lo, hi


def area_cubierta(P, E=(), Q=None) -> float:
    """El área de ∪P ∩ U [∩ ∪Q], normalizada (fracción de la cara), con
    U = [0,1]² − ∪E. Unión de las zonas de una participación:
    ``area_cubierta(zonas, E)``; lo que se pisan dos:
    ``area_cubierta(zonas_a, E, zonas_b)``; el área útil: ``area_util(E)``.
    Las exclusiones son ``dict`` con ``u0, u1, v0, v1``. Exacta para polígonos
    simples (los que deja pasar ``validar_zona``): los cruces de un polígono
    consigo mismo no son eventos."""
    if not P:
        return 0.0
    if Q is not None and not Q:
        return 0.0
    familias = [P, [_rectangulo(e) for e in E]]
    if Q is not None:
        familias.append(Q)
    aristas = _aristas_de(familias)
    xs = _eventos(familias, aristas)
    # Fuera de la cara y del rango de P (y de Q) no hay nada que sumar. La
    # cara la recortan también los intervalos: defensivo, las zonas válidas ya
    # están adentro.
    lo, hi = _rango_x(P)
    if Q is not None:
        q0, q1 = _rango_x(Q)
        lo, hi = max(lo, q0), min(hi, q1)
    lo, hi = max(lo, 0.0), min(hi, 1.0)
    # Las aristas de P y de Q, por xmin; las activas de cada familia, aparte
    # (las exclusiones se cortan por su rectángulo, no por sus aristas).
    sin_e = sorted([e for e in aristas if e[7] != 1], key=_xmin)
    k = 0
    activas_p: list[tuple] = []
    activas_q: list[tuple] = []
    A = 0.0
    for idx in range(len(xs) - 1):
        x0, x1 = xs[idx], xs[idx + 1]
        if x1 - x0 < _EPS or x1 <= lo or x0 >= hi:
            continue
        xm = (x0 + x1) / 2
        while k < len(sin_e) and sin_e[k][0] < xm:
            (activas_p if sin_e[k][7] == 0 else activas_q).append(sin_e[k])
            k += 1
        activas_p = [e for e in activas_p if e[1] > xm]
        I = _cortar(_unir(_intervalos_de(activas_p, xm)), [[0.0, 1.0]])
        I = _restar(I, _unir([[e["v0"], e["v1"]] for e in E if e["u0"] < xm < e["u1"]]))
        if Q is not None:
            activas_q = [e for e in activas_q if e[1] > xm]
            I = _cortar(I, _unir(_intervalos_de(activas_q, xm)))
        s = 0.0
        for a, b in I:
            s += b - a
        A += (x1 - x0) * s
    return A


_CARA_UNITARIA = [[0, 0], [1, 0], [1, 1], [0, 1]]


def area_util(E) -> float:
    """La fracción de la cara que se vende: [0,1]² menos las exclusiones."""
    return area_cubierta([_CARA_UNITARIA], E)


def dibujado_pb(zonas, E) -> int:
    """§3.5: ``redondear(10000 · área(∪zonas ∩ U) / área_U)``; 0 sin zonas (o
    sin área útil, que en una superficie de verdad no pasa: ``superficie``
    da None)."""
    if not zonas:
        return 0
    util = area_util(E)
    if not util > 0:
        return 0
    return math.floor(_CARA_ENTERA_PB * area_cubierta(zonas, E) / util + 0.5)


def cajas(P) -> tuple[float, float, float, float]:
    """La caja de todos los vértices: (u0, v0, u1, v1)."""
    u0 = v0 = math.inf
    u1 = v1 = -math.inf
    for p in P:
        for u, v in p:
            if u < u0:
                u0 = u
            if v < v0:
                v0 = v
            if u > u1:
                u1 = u
            if v > v1:
                v1 = v
    return u0, v0, u1, v1


# ── Medir una distribución (§3.8) ────────────────────────────────────────────


def medir(zonas, sup) -> dict:
    """Lo caro de la revisión, sin mirar términos (así corre ANTES del candado,
    §5.4): valida cada zona, suma lo dibujado por participación y mide lo que
    se pisan dos participaciones si sus cajas se tocan. Lo juzga
    ``reglas_participacion.juzgar``, que sabe de fechas y porcentajes.

    ``zonas``: lista de ``{"participacion_space_id", "vertices"}`` (crudos);
    ``sup``: ``{"exclusiones", "ancho", "alto"}`` (la de ``superficie``).
    Devuelve, como ``medir`` del navegador:

    · ``validaciones``: una por zona, en el orden enviado, con ``k`` (índice
      0-based: el ``zona`` de los problemas), ``participacion_space_id``,
      ``vertices`` (limpios si es válida) y ``codigo`` (None = válida);
    · ``dibujado_pb``: por participación con alguna zona válida, de menor a
      mayor id;
    · ``pisadas``: ``{"s1", "s2", "m2"}`` (s1 < s2) por par cuyas cajas se
      pisan (los demás pares: 0);
    · ``sin_superficie_util``: las ``k`` de las zonas válidas con menos de
      1 cm² útil (aviso ``ZONA_SIN_SUPERFICIE_UTIL``);
    · ``area_util``: la fracción útil de la cara.
    """
    W, H, E = sup["ancho"], sup["alto"], sup["exclusiones"]
    validaciones = []
    por_s: dict[int, list] = {}
    for k, z in enumerate(zonas):
        vertices, codigo = validar_zona(z.get("vertices"), W, H)
        s = z.get("participacion_space_id")
        validaciones.append({"k": k, "participacion_space_id": s, "vertices": vertices, "codigo": codigo})
        if codigo is None:
            por_s.setdefault(s, []).append(vertices)
    util = area_util(E)
    sin_superficie_util = [
        v["k"] for v in validaciones
        if v["codigo"] is None and area_cubierta([v["vertices"]], E) * W * H < AREA_MINIMA_M2
    ]
    ss = sorted(por_s)
    dibujado = {
        s: (math.floor(_CARA_ENTERA_PB * area_cubierta(por_s[s], E) / util + 0.5) if util > 0 else 0)
        for s in ss
    }
    caja = {s: cajas(por_s[s]) for s in ss}
    pisadas = []
    for i in range(len(ss)):
        for j in range(i + 1, len(ss)):
            a, b = caja[ss[i]], caja[ss[j]]
            if not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]):
                continue
            pisadas.append({"s1": ss[i], "s2": ss[j],
                            "m2": area_cubierta(por_s[ss[i]], E, por_s[ss[j]]) * W * H})
    return {"validaciones": validaciones, "dibujado_pb": dibujado, "pisadas": pisadas,
            "sin_superficie_util": sin_superficie_util, "area_util": util}
