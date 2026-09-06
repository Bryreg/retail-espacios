"""Auditoría de frontera de la LANDING pública (Fase 9).

Misma disciplina que ``test_auditoria_frontera.py`` y sus antecesores: **acá no
se arregla código de producción**. Cada borde se ataca con una prueba que
falla si el borde se cruza, y lo que hoy no se puede probar porque el frontend
todavía no existe se declara como hueco (``skip`` con motivo) y se cuenta en
``features/landing/outputs/auditor-frontera.md``.

La landing cambia una propiedad que hasta la Fase 8 era invariante: **hasta
ahora, todo lo que la aplicación pintaba salía de una sesión**. Sin token,
``App.tsx`` devolvía ``<Login />`` y no había nada más que mirar. Desde la
Fase 9 hay una pantalla larga, pública, indexable, con un plano de un
supermercado adentro. Los bordes nuevos son cuatro:

* **L01–L04 — la landing no puede hablar con la API ni con la sesión.** Ni
  ``/api/*``, ni ``authStore``, ni el ``localStorage`` de la sesión
  (``retail-auth-v1``), ni por importar de rebote un módulo que sí lo hace.
* **L05 — cero datos de clientes reales.** El plano es un supermercado
  SEMBRADO. El registro de producción (``galerias`` y sus sedes ``NAVE``,
  ``POBLADO``, ``ciudad jardin``, más ``TERRON``, que tuvo datos reales, y
  ``MercaFresco``, que ya nombra a un cliente en las capturas de la consola
  del operador) no puede aparecer en una página pública.
* **L06–L08 — la CSP de la Fase 3 no se toca.** ``script-src 'self'
  https://apis.google.com`` no tiene ``'unsafe-inline'``: un ``<script>``
  suelto en ``index.html`` para el conmutador de tema, una fuente de un CDN o
  un ``url()`` a un dominio de imágenes rompen la página en producción y no en
  ``npm run dev``.
* **L09–L13 — nada de lo que ya funcionaba se puede caer.** El enlace del
  correo de montaje apunta a la RAÍZ (``/?montar=CODE&t=TOKEN``,
  ``routers/spaces.py:413``) — exactamente la ruta que la landing se queda—,
  el de la invitación a ``/login?invitacion=`` (``routers/usuarios.py:122``) y
  el de vencimientos otra vez a ``/`` (``routers/bulk_leases.py:461``).
  ``/politica-datos`` se resuelve antes que el router. Y el operador sigue
  entrando por ``/plataforma``.

**Todos los ``import app.*`` van adentro de las funciones**: el fixture
``client`` de ``conftest.py`` purga ``sys.modules['app.*']`` entre pruebas.
"""
import re
import subprocess
from pathlib import Path

import pytest

# ════════════════════════════════════════════════════════════════════════════
# DÓNDE MIRAR
# ════════════════════════════════════════════════════════════════════════════

RAIZ = Path(__file__).resolve().parents[2]
FRONT = RAIZ / "frontend"
SRC = FRONT / "src"
DIST = FRONT / "dist"

EXTENSIONES = {".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".svg"}

# La llave con la que `store/authStore.ts` persiste la sesión (zustand
# `persist`, `{ name: "retail-auth-v1" }`). Una landing que la lea está
# mirando la sesión de quien pasa por ahí.
LLAVE_SESION = "retail-auth-v1"


def _sin_comentarios(texto: str) -> str:
    """El texto que de verdad llega al navegador.

    Este repositorio comenta MUCHO y en español: un comentario que diga «la
    landing no llama a /api/*» o «nada de datos de galerias» dispararía todas
    las alarmas de este archivo sin que exista el problema. Vite/esbuild los
    borra al empaquetar, así que se borran también acá antes de buscar.

    Se recorre carácter por carácter y no con tres expresiones regulares,
    porque con regex esto sale mal de una forma que además pasa
    DESAPERCIBIDA: ``App.tsx`` tiene el texto ``/api/plataforma/*`` adentro de
    un comentario de línea, y ese ``/*`` abre un bloque que la regex cierra
    cincuenta líneas más abajo — borrando, entre otras cosas, la guarda
    ``if (TOKEN_MONTAJE) return <Montaje />`` que esta auditoría vigila. Una
    prueba que se come su propia evidencia es peor que no tenerla.
    """
    salida: list[str] = []
    i, n = 0, len(texto)
    while i < n:
        c = texto[i]
        dos = texto[i:i + 2]
        if c in "\"'`":                                   # literal de cadena
            comilla = c
            salida.append(c)
            i += 1
            while i < n:
                if texto[i] == "\\":
                    salida.append(texto[i:i + 2])
                    i += 2
                    continue
                salida.append(texto[i])
                if texto[i] == comilla:
                    i += 1
                    break
                i += 1
            continue
        if dos == "//":                                   # comentario de línea
            while i < n and texto[i] != "\n":
                i += 1
            continue
        if dos == "/*":                                   # comentario de bloque
            fin = texto.find("*/", i + 2)
            i = n if fin == -1 else fin + 2
            salida.append(" ")
            continue
        if dos == "<!":                                   # <!-- … --> del HTML
            if texto[i:i + 4] == "<!--":
                fin = texto.find("-->", i + 4)
                i = n if fin == -1 else fin + 3
                salida.append(" ")
                continue
        salida.append(c)
        i += 1
    return "".join(salida)


def _texto(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:                                            # pragma: no cover
        return ""


def _codigo(p: Path) -> str:
    return _sin_comentarios(_texto(p))


def _rel(p: Path) -> str:
    try:
        return str(p.relative_to(RAIZ))
    except ValueError:                                         # pragma: no cover
        return str(p)


def _git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, timeout=30)
    return r.stdout.strip() if r.returncode == 0 else ""


def _base_de_la_rama() -> str:
    """Desde dónde empezó esta rama.

    ``main`` local puede estar viejísimo (en esta copia apunta a la Fase 4):
    tomarlo como base metería en el «núcleo de la landing» media aplicación,
    y la auditoría fallaría contra código que no es de esta fase. Se prueban
    varias referencias y se elige la base MÁS NUEVA (la que no es antepasada
    de ninguna otra).
    """
    bases: list[str] = []
    for ref in ("origin/main", "main", "origin/HEAD"):
        b = _git("merge-base", "HEAD", ref)
        if b and b not in bases:
            bases.append(b)
    if not bases:
        return ""
    mejor = bases[0]
    for otra in bases[1:]:
        # `mejor` es antepasado de `otra` → `otra` es más nueva.
        r = subprocess.run(["git", "merge-base", "--is-ancestor", mejor, otra],
                           cwd=RAIZ, capture_output=True, timeout=30)
        if r.returncode == 0:
            mejor = otra
    return mejor


def _archivos_nuevos_del_frontend() -> set[Path]:
    """Lo que esta rama agregó o tocó bajo ``frontend/`` — commiteado o no.

    No se adivina el nombre de los archivos de la landing (``Landing.tsx``,
    ``PlanoIso/``, ``landing.css``, …): se le pregunta a git. Si git no
    contesta (tarball sin ``.git``, rama sin base común) la prueba cae en la
    heurística por nombre de más abajo y lo dice.
    """
    salida: set[Path] = set()
    try:
        nombres: list[str] = []
        base = _base_de_la_rama()
        if base:
            # `--diff-filter=A`: sólo lo AGREGADO. Un archivo viejo que esta
            # fase tocó —`App.tsx`, que ahora monta la landing— sigue siendo
            # el armazón de la aplicación con sesión: auditarlo con la vara de
            # la landing daría una alarma por cada `useAuthStore`, que es
            # exactamente lo que ese archivo tiene que hacer. El cableado se
            # audita aparte, en L11 y L12a.
            diff = subprocess.run(
                ["git", "diff", "--name-only", "--diff-filter=A", base, "--", "frontend"],
                cwd=RAIZ, capture_output=True, text=True, timeout=30,
            )
            if diff.returncode == 0:
                nombres += diff.stdout.split()
        estado = subprocess.run(
            ["git", "status", "--porcelain", "--", "frontend"],
            cwd=RAIZ, capture_output=True, text=True, timeout=30,
        )
        if estado.returncode == 0:
            for linea in estado.stdout.splitlines():
                # Sin seguir: `?? ` (sin rastrear) y `A ` (agregado en el
                # índice). Un ` M ` es un archivo viejo modificado.
                if len(linea) > 3 and linea[:2].strip() in {"??", "A"}:
                    nombres.append(linea[3:].strip().strip('"'))
        for nombre in nombres:
            p = RAIZ / nombre
            if p.is_file() and p.suffix in EXTENSIONES and DIST not in p.parents:
                salida.add(p.resolve())
    except Exception:                                          # pragma: no cover
        return set()
    return salida


def _por_nombre() -> set[Path]:
    """Todo lo que se llame «landing» bajo ``frontend/src``."""
    if not SRC.exists():
        return set()
    return {
        p.resolve()
        for p in SRC.rglob("*")
        if p.is_file() and p.suffix in EXTENSIONES and "landing" in str(p).lower()
    }


def _resolver_import(desde: Path, especificador: str) -> Path | None:
    """``./PlanoIso`` visto desde ``pages/Landing.tsx`` → el archivo real."""
    if not especificador.startswith("."):
        return None                                            # paquete de node_modules
    destino = (desde.parent / especificador).resolve()
    candidatos = [destino]
    for ext in (".tsx", ".ts", ".jsx", ".js", ".css"):
        candidatos.append(destino.with_suffix(destino.suffix + ext) if destino.suffix
                          else Path(str(destino) + ext))
        candidatos.append(destino / f"index{ext}")
    for c in candidatos:
        if c.is_file():
            return c
    return None


_IMPORTS = re.compile(
    r"""(?:from\s*|import\s*\(\s*|require\(\s*)["'`]([^"'`]+)["'`]"""
)


def _grafo_landing() -> tuple[set[Path], set[Path]]:
    """(núcleo, heredados).

    *Núcleo*: los archivos de la landing — los que esta rama agregó bajo
    ``frontend/src`` más cualquiera que se llame «landing».
    *Heredados*: módulos que YA existían y que el núcleo importa. No se les
    exige el estilo de la landing, pero sí lo único que no se negocia: que no
    arrastren la API ni la sesión adentro de una página pública.
    """
    nucleo = {p for p in (_archivos_nuevos_del_frontend() | _por_nombre())
              if SRC in p.parents}
    heredados: set[Path] = set()
    pendientes = list(nucleo)
    vistos: set[Path] = set()
    while pendientes:
        actual = pendientes.pop()
        if actual in vistos:
            continue
        vistos.add(actual)
        for espec in _IMPORTS.findall(_codigo(actual)):
            destino = _resolver_import(actual, espec)
            if destino is None or SRC not in destino.parents:
                continue
            if destino in nucleo:
                if destino not in vistos:
                    pendientes.append(destino)
            else:
                heredados.add(destino)
    return nucleo, heredados


def _paginas_de_la_landing() -> set[Path]:
    """Sólo los ``.tsx``/``.ts``/``.css`` del núcleo (fuera imágenes y HTML)."""
    nucleo, _ = _grafo_landing()
    return {p for p in nucleo if p.suffix in {".ts", ".tsx", ".jsx", ".js", ".css"}}


def _componentes_de_la_landing() -> set[Path]:
    """Sólo los componentes (``.tsx``/``.jsx``): lo que de verdad pinta JSX.

    Mientras el frontend construye, el núcleo puede tener ya los datos
    sembrados y la hoja de estilo pero ningún componente: las pruebas que
    leen JSX se declaran hueco en vez de fallar contra una obra a medio
    hacer.
    """
    return {p for p in _paginas_de_la_landing() if p.suffix in {".tsx", ".jsx"}}


def _exigir_componentes() -> set[Path]:
    componentes = _componentes_de_la_landing()
    if not componentes:
        pytest.skip(
            "HUECO: hay archivos de landing pero todavía ningún componente "
            f".tsx ({sorted(_rel(p) for p in _paginas_de_la_landing())}). "
            "Esta prueba lee JSX; corre sola en cuanto el componente exista."
        )
    return componentes


def _exigir_landing() -> set[Path]:
    archivos = _paginas_de_la_landing()
    if not archivos:
        pytest.skip(
            "HUECO: todavía no hay archivos de landing bajo frontend/src "
            "(ni por git diff contra `main` ni por nombre). Esta prueba "
            "empieza a correr sola en cuanto el frontend los cree; hasta "
            "entonces el borde queda declarado en "
            "features/landing/outputs/auditor-frontera.md."
        )
    return archivos


# ════════════════════════════════════════════════════════════════════════════
# L01–L04 · LA LANDING ES PÚBLICA: NI API NI SESIÓN
# ════════════════════════════════════════════════════════════════════════════

# Lo que no puede aparecer en el código que se sirve a un anónimo, y por qué.
CONTACTOS_PROHIBIDOS = [
    (re.compile(r"""["'`]/api/"""), "una ruta /api/* escrita a mano"),
    (re.compile(r"""["'`]/?api/(?:auth|spaces|dashboard|plataforma|layout|files|"""
                r"""mounts|montaje|planograms|suppliers|clientes|notifications|"""
                r"""catalogo|bitacora)"""), "una ruta concreta de la API"),
    (re.compile(r"\buseAuthStore\b"), "el store de sesión (useAuthStore)"),
    (re.compile(r"\buseFixtureStore\b"), "el store de planos del cliente (useFixtureStore)"),
    (re.compile(r"\bAuthorization\b|\bBearer\b"), "una credencial en una cabecera"),
    (re.compile(r"withCredentials"), "una llamada con credenciales"),
    (re.compile(re.escape(LLAVE_SESION)), f"la llave de sesión «{LLAVE_SESION}»"),
]

# Importar cualquiera de estos módulos mete la API (y su interceptor de 401,
# que borra la sesión) adentro de una página que no tiene sesión.
IMPORTS_PROHIBIDOS = re.compile(
    r"""["'`][^"'`]*(?:/|^)(?:api/(?:client|auth|montaje|plataforma|spaces|"""
    r"""dashboard|files|layout|mounts|catalogo|bitacora|planograms)|"""
    r"""store/authStore|store/fixtureStore)(?:["'`]|/)"""
)


def test_l00_las_alarmas_de_este_archivo_suenan():
    """L00. La prueba de la prueba.

    Toda esta auditoría es estática: si un patrón se escribe mal —o si el
    borrador de comentarios se come el código que hay que mirar— el archivo
    entero pasa en verde sin comprobar nada, que es el peor resultado
    posible. Acá se le pasa a cada detector una muestra que TIENE que
    encender, y un par que NO.
    """
    # (1) El borrador de comentarios no se come el código. La trampa real:
    #     `App.tsx` tiene `/api/plataforma/*` adentro de un comentario de
    #     línea, y ese `/*` abría un bloque que se tragaba las guardas.
    trampa = (
        '// sólo mira `/api/plataforma/*` y nada más\n'
        'if (TOKEN_MONTAJE) return <Montaje />;\n'
        '// un comentario que nombra galerias y /api/spaces\n'
        'const url = "https://retail-espacios.onrender.com";\n'
    )
    limpio = _sin_comentarios(trampa)
    assert "if (TOKEN_MONTAJE) return <Montaje />;" in limpio
    assert "https://retail-espacios.onrender.com" in limpio, "se partió un https://"
    assert "galerias" not in limpio and "/api/spaces" not in limpio

    # (2) Cada contacto prohibido enciende con su muestra.
    muestras = [
        'axios.get("/api/dashboard")',
        'client.get("/api/plataforma/clientes")',
        'const token = useAuthStore((s) => s.token);',
        'const planos = useFixtureStore((s) => s.fixtures);',
        'headers: { Authorization: `Bearer ${t}` }',
        'withCredentials: true',
        f'localStorage.getItem("{LLAVE_SESION}")',
    ]
    for patron, _que in CONTACTOS_PROHIBIDOS:
        assert any(patron.search(m) for m in muestras), f"nadie enciende: {patron.pattern}"
    assert IMPORTS_PROHIBIDOS.search('import client from "../../api/client";')
    assert IMPORTS_PROHIBIDOS.search('import { useAuthStore } from "../../store/authStore";')

    # (3) Los nombres del registro, con y sin tilde, y lo que NO tiene que
    #     encender: «navegador» contiene «nave», y una galería de fotos no es
    #     el cliente `galerias`.
    for patron, quien in CLIENTES_REALES:
        assert patron.search({
            "Galerías Plaza": "Supermercado Galerías Plaza",
            "galerias (cliente por defecto del registro)": "slug: galerias",
            "TERRON (sede con datos reales)": "sede TERRON",
            "MercaFresco (ya nombra a un cliente en la consola del operador)": "MercaFresco",
            "POBLADO (sede real)": "sede POBLADO",
            "ciudad jardin (sede real)": "ciudad jardín",
            "NAVE (sede real)": "sede NAVE",
        }[quien]), f"no enciende con su propia muestra: {quien}"
    inocentes = "el navegador del gerente abre la galería de fotos del montaje"
    encendidas = [q for pat, q in CLIENTES_REALES if pat.search(inocentes)]
    assert not encendidas, f"falso positivo sobre texto inocente: {encendidas}"

    # (4) Subrecursos externos.
    externos = [
        '<script src="https://cdn.tailwindcss.com"></script>',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X" />',
        '@import url("https://fonts.googleapis.com/css2");',
        'background-image: url(https://images.example.com/hero.jpg);',
        '<img src="https://images.example.com/hero.jpg" alt="x" />',
        'import("https://esm.sh/three")',
        '@font-face { font-family: X; src: url("https://cdn.example.com/x.woff2"); }',
    ]
    for patron, que in SUBRECURSOS_EXTERNOS:
        assert any(patron.search(m) for m in externos), f"nadie enciende: {que}"

    # (5) Y el descubrimiento de archivos no puede quedar mudo en silencio:
    #     si hay landing, hay archivos; si no, las pruebas se saltan solas.
    nucleo, _ = _grafo_landing()
    if (SRC / "pages" / "Landing").exists():
        assert nucleo, (
            "existe frontend/src/pages/Landing pero el descubrimiento de "
            "archivos devolvió vacío: la auditoría estaría pasando en verde "
            "sin mirar nada"
        )


def test_l01_ningun_archivo_de_la_landing_llama_a_la_api_ni_lee_la_sesion():
    """L01. La landing se pinta con lo que trae adentro. Nada más.

    Una sola llamada autenticada desde acá tiene dos costos, no uno: el
    obvio —datos de un cliente en una página pública— y el silencioso: el
    interceptor de ``api/client.ts`` borra la sesión ante cualquier 401, así
    que un ``fetch`` fallido en la landing DESLOGUEA al gerente que además
    tenía la pestaña de su tablero abierta.
    """
    archivos = _exigir_landing()
    delitos: list[str] = []
    for p in sorted(archivos):
        codigo = _codigo(p)
        for patron, que in CONTACTOS_PROHIBIDOS:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)}: {que} → {m.group(0)!r}")
        m = IMPORTS_PROHIBIDOS.search(codigo)
        if m:
            delitos.append(f"{_rel(p)}: importa {m.group(0)!r}")
    assert not delitos, (
        "la landing es pública y no puede hablar con la API ni con la sesión:\n  "
        + "\n  ".join(delitos)
    )


def test_l02_lo_que_la_landing_importa_de_la_app_vieja_tampoco_arrastra_la_api():
    """L02. El camino de rebote.

    Reusar un componente que ya existe es lo natural y lo barato — y es
    exactamente por donde se cuela la API: un ``<Leyenda/>`` que adentro
    llama a ``getClientes()``, un ``<MiniMapa/>`` colgado de
    ``useFixtureStore``. Se auditan los módulos VIEJOS que el núcleo de la
    landing importa, con la misma vara de L01.
    """
    nucleo, heredados = _grafo_landing()
    if not nucleo:
        pytest.skip("HUECO: no hay archivos de landing todavía (ver L01).")
    if not heredados:
        pytest.skip(
            "La landing no importa (todavía) ningún módulo preexistente de "
            "frontend/src: no hay rebote que auditar."
        )
    delitos: list[str] = []
    for p in sorted(heredados):
        codigo = _codigo(p)
        for patron, que in CONTACTOS_PROHIBIDOS:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)} (importado por la landing): {que} → {m.group(0)!r}")
    assert not delitos, (
        "la landing importa módulos de la app con sesión adentro; reusarlos "
        "arrastra la API a una página pública:\n  " + "\n  ".join(delitos)
    )


def test_l03_la_landing_no_pide_nada_por_red_ni_a_su_propio_origen():
    """L03. Ni siquiera al mismo origen.

    ``connect-src 'self'`` deja pasar un ``fetch('/algo.json')``, así que la
    CSP no atajaría un plano servido por archivo. Pero la spec es explícita:
    el supermercado de ejemplo va **sembrado en el código**. Un archivo
    aparte es un lugar más donde mañana alguien vuelca un export real.
    """
    archivos = _exigir_landing()
    red = re.compile(r"\b(?:fetch|XMLHttpRequest|EventSource|WebSocket|navigator\.sendBeacon)\s*\(")
    delitos = [
        f"{_rel(p)}: {m.group(0)!r}"
        for p in sorted(archivos)
        for m in [red.search(_codigo(p))] if m
    ]
    assert not delitos, (
        "la landing no pide nada por red: el plano de ejemplo va sembrado en "
        "el código (spec §«El plano isométrico»). Encontrado:\n  " + "\n  ".join(delitos)
    )


def test_l04_la_landing_no_inyecta_html_crudo():
    """L04. ``dangerouslySetInnerHTML`` en la pantalla más pública que hay.

    Es el único camino de la landing hacia un XSS y, de paso, hacia un
    ``<script>`` inline que la CSP (``script-src`` sin ``'unsafe-inline'``)
    bloquearía en producción y no en ``npm run dev``.
    """
    archivos = _exigir_landing()
    delitos = [
        _rel(p) for p in sorted(archivos)
        if "dangerouslySetInnerHTML" in _codigo(p) or re.search(r"\.innerHTML\s*=", _codigo(p))
    ]
    assert not delitos, (
        "HTML crudo inyectado en la landing (XSS + `script-src` sin "
        "'unsafe-inline'): " + ", ".join(delitos)
    )


# ════════════════════════════════════════════════════════════════════════════
# L05 · CERO DATOS DE CLIENTES REALES
# ════════════════════════════════════════════════════════════════════════════

# El registro de producción, tal como lo describen `docs/ESTADO.md`
# («Sedes reales: NAVE, POBLADO, ciudad jardin»), `app/clientes.py`
# (`SLUG_POR_DEFECTO = "galerias"`) y las capturas de la consola del operador
# (`features/tendencia/outputs/ENTREGA.md`, cliente `MercaFresco`).
#
# `TERRON` está en la lista aunque hoy sea también una sede por defecto de la
# app: `docs/ESTADO.md` §«Pendiente urgente: datos de TERRON» dice que tuvo
# datos reales. En una página pública no se distingue una cosa de la otra.
CLIENTES_REALES = [
    (re.compile(r"galer[ií]as?\s+plaza", re.I), "Galerías Plaza"),
    (re.compile(r"\bgaler[ií]as\b", re.I), "galerias (cliente por defecto del registro)"),
    (re.compile(r"\bterr[oó]n\b", re.I), "TERRON (sede con datos reales)"),
    (re.compile(r"\bmercafresco\b", re.I), "MercaFresco (ya nombra a un cliente en la consola del operador)"),
    (re.compile(r"\bpoblado\b", re.I), "POBLADO (sede real)"),
    (re.compile(r"\bciudad\s*jard[ií]n\b", re.I), "ciudad jardin (sede real)"),
    (re.compile(r"\bnave\b", re.I), "NAVE (sede real)"),
]


def test_l05_el_supermercado_de_ejemplo_no_se_llama_como_ningun_cliente_real():
    """L05. El plano de la landing es ficción, y tiene que sonar a ficción.

    Publicar un plano con góndolas, proveedores y cánones bajo el nombre de
    un cliente del registro afirma en una página indexable una relación
    comercial y unos precios que no son los suyos. Da igual que los números
    estén inventados: el nombre es el dato.

    ``MercaFresco`` entra en la lista aunque ``outputs/copy.md`` §13 lo
    proponga como marca de ejemplo — ya identifica a un cliente en las
    capturas de la consola del operador (``features/tendencia/outputs/``), y
    un nombre que ya está en uso adentro del producto no sirve como ficción
    afuera. Elegí uno que no aparezca en ningún otro lado del repositorio.
    """
    archivos = _exigir_landing()
    delitos: list[str] = []
    for p in sorted(archivos):
        codigo = _codigo(p)
        for patron, quien in CLIENTES_REALES:
            for m in patron.finditer(codigo):
                linea = codigo.count("\n", 0, m.start()) + 1
                delitos.append(f"{_rel(p)}:~{linea}: {quien} → {m.group(0)!r}")
    assert not delitos, (
        "nombres del registro de producción en una página pública:\n  "
        + "\n  ".join(delitos)
    )


def test_l05b_el_plano_de_ejemplo_no_sale_de_un_export_de_cliente():
    """L05b. La otra forma de filtrar: pegar un JSON de verdad.

    Un ``UnifiedFixture`` exportado de una sede real trae campos que ningún
    plano escrito a mano tendría: ``clienteSlug``, ``updatedAt`` del
    servidor, ``supplierId``, ``leaseId``, ``sedeId`` en UUID. Se busca la
    forma, no el contenido.
    """
    archivos = _exigir_landing()
    huellas = [
        (re.compile(r"\bcliente(?:Slug|_slug)\b"), "clienteSlug de un export real"),
        (re.compile(r"\b(?:lease_?[Ii]d|supplier_?[Ii]d)\b"), "identificadores de la base"),
        (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"), "un UUID"),
        (re.compile(r"@(?!recabra\.example|ejemplo|example)[a-z0-9.-]+\.(?:com|co|net|org)\b", re.I),
         "un correo de dominio real"),
    ]
    delitos: list[str] = []
    for p in sorted(archivos):
        codigo = _codigo(p)
        for patron, que in huellas:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)}: {que} → {m.group(0)!r}")
    assert not delitos, (
        "el plano de la landing parece venir de una base y no de una "
        "constante escrita a mano:\n  " + "\n  ".join(delitos)
    )


# ════════════════════════════════════════════════════════════════════════════
# L06–L08 · LA CSP DE LA FASE 3 NO SE TOCA
# ════════════════════════════════════════════════════════════════════════════

# Hosts que pueden aparecer escritos en el frontend sin que nadie baje nada de
# ellos: el propio despliegue (enlaces de correo, canonical) y los namespaces
# de SVG/XML, que son identificadores, no descargas.
HOSTS_PERMITIDOS = {
    "retail-espacios.onrender.com",
    "www.w3.org",
    "www.w3.org.",
    "localhost",
}

SUBRECURSOS_EXTERNOS = [
    (re.compile(r"<script[^>]*\ssrc\s*=\s*[\"'{]?\s*https?://", re.I), "<script src> externo"),
    (re.compile(r"<link[^>]*\shref\s*=\s*[\"'{]?\s*https?://", re.I), "<link href> externo"),
    (re.compile(r"@import\s+(?:url\()?\s*[\"']?https?://", re.I), "@import externo"),
    (re.compile(r"url\(\s*[\"']?\s*https?://", re.I), "url() externo (CSS)"),
    (re.compile(r"<(?:img|iframe|video|audio|source|track|embed|object)[^>]*\s"
                r"(?:src|data)\s*=\s*[\"'{]?\s*https?://", re.I), "subrecurso externo"),
    (re.compile(r"\bimport\(\s*[\"'`]https?://", re.I), "import() de un CDN"),
    (re.compile(r"@font-face[^}]*url\(\s*[\"']?\s*https?://", re.I | re.S), "@font-face externa"),
]


def test_l06_la_landing_no_baja_nada_de_afuera():
    """L06. ``default-src 'self'``: lo externo no falla feo, falla mudo.

    Un ``<link>`` a un CDN de fuentes o un ``url()`` a un banco de imágenes
    no rompe la página en desarrollo (``npm run dev`` no manda la cabecera):
    rompe en producción, en silencio, con la tipografía o el fondo caídos y
    un renglón en la consola que nadie mira.
    """
    archivos = _exigir_landing()
    delitos: list[str] = []
    for p in sorted(archivos):
        codigo = _codigo(p)
        for patron, que in SUBRECURSOS_EXTERNOS:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)}: {que} → {m.group(0)[:80]!r}")
        for host in re.findall(r"https?://([A-Za-z0-9._-]+)", codigo):
            if host.lower() not in HOSTS_PERMITIDOS:
                delitos.append(
                    f"{_rel(p)}: host externo {host!r} — si es un enlace de "
                    "navegación, agregalo a HOSTS_PERMITIDOS con su motivo; "
                    "si es un recurso, no entra bajo la CSP de la Fase 3"
                )
    assert not delitos, (
        "recursos u orígenes externos nuevos en la landing (CSP de la Fase 3, "
        "backend/app/main.py):\n  " + "\n  ".join(sorted(set(delitos)))
    )


def test_l07_el_html_que_sirve_la_app_no_gana_un_script_inline():
    """L07. ``script-src 'self' https://apis.google.com`` — sin ``'unsafe-inline'``.

    El conmutador claro/oscuro del prototipo
    (``features/landing/outputs/prototipo/index.html``) vive en un
    ``<script>`` inline y en manejadores ``onclick=``. Copiado tal cual a
    ``frontend/index.html``, el navegador lo bloquea en producción: el tema
    queda clavado y nadie se entera hasta que un cliente lo cuenta.
    """
    indice = FRONT / "index.html"
    assert indice.is_file(), "falta frontend/index.html"
    html = _sin_comentarios(_texto(indice))

    inline = [
        m.group(0)[:60]
        for m in re.finditer(r"<script(?![^>]*\ssrc\s*=)[^>]*>\s*[^<\s]", html, re.I)
    ]
    assert not inline, (
        "frontend/index.html tiene un <script> inline y la CSP no permite "
        f"'unsafe-inline' en script-src: {inline}"
    )

    manejadores = sorted(set(re.findall(r"\son(?:click|load|error|change|input|"
                                        r"mouseover|submit)\s*=\s*[\"']", html, re.I)))
    assert not manejadores, (
        f"manejadores de evento inline en frontend/index.html: {manejadores}"
    )

    # Y el HTML sigue declarando el idioma (SEO + lectores de pantalla).
    assert re.search(r"<html[^>]*\slang\s*=\s*[\"']es", html, re.I), (
        'frontend/index.html perdió lang="es"'
    )


def test_l08_la_csp_del_backend_no_se_aflojo_para_la_landing():
    """L08. La tentación: «agrego el CDN de la fuente y listo».

    La política de la Fase 3 está medida archivo por archivo y cada origen
    tiene su párrafo de justificación en ``app/main.py``. Esta prueba clava
    la lista: sumar un origen para que la landing se vea linda obliga a
    tocar acá y a explicar por qué.
    """
    import app.main as m  # adentro de la función: conftest purga app.* entre pruebas

    csp = {
        d.split(" ")[0]: set(d.split(" ")[1:])
        for d in (x.strip() for x in m.CSP.split(";")) if d
    }
    assert csp["script-src"] == {"'self'", "https://apis.google.com"}, (
        f"script-src cambió: {sorted(csp['script-src'])}")
    assert "'unsafe-inline'" not in csp["script-src"], "apareció 'unsafe-inline' en script-src"
    assert csp["style-src"] == {"'self'", "'unsafe-inline'", "https://fonts.googleapis.com"}, (
        f"style-src cambió: {sorted(csp['style-src'])}")
    assert csp["font-src"] == {"'self'", "https://fonts.gstatic.com", "data:"}, (
        f"font-src cambió: {sorted(csp['font-src'])}")
    assert csp["img-src"] == {"'self'", "data:", "blob:"}, (
        f"img-src cambió — una landing NO necesita un banco de imágenes: "
        f"{sorted(csp['img-src'])}")
    assert csp["connect-src"] == {
        "'self'",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
    }, f"connect-src cambió: {sorted(csp['connect-src'])}"
    assert csp["frame-ancestors"] == {"'none'"}, "la app dejó de prohibir ser enmarcada"
    assert csp["object-src"] == {"'none'"} and csp["base-uri"] == {"'self'"}


def test_l08b_la_cabecera_viaja_en_la_pagina_publica(client):
    """L08b. Y viaja en la respuesta de ``/``, que ahora es la landing.

    La CSP la pone un middleware, no la ruta; pero ``/`` pasó a ser la
    pantalla más visitada por gente sin sesión, así que se comprueba ahí.
    """
    if not DIST.exists():
        pytest.skip("HUECO: no hay frontend/dist en esta copia; el catch-all del SPA no se monta.")
    r = client.get("/")
    assert r.status_code == 200, r.text
    assert "Content-Security-Policy" in r.headers
    assert "script-src 'self' https://apis.google.com" in r.headers["Content-Security-Policy"]
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert not r.headers.get("set-cookie"), "la landing no puede sembrar cookies"


# ════════════════════════════════════════════════════════════════════════════
# L09–L13 · LO QUE YA FUNCIONABA
# ════════════════════════════════════════════════════════════════════════════

def _es_el_cascaron(r) -> bool:
    return (
        r.status_code == 200
        and "text/html" in r.headers.get("content-type", "")
        and 'id="root"' in r.text
    )


def test_l09_la_raiz_sin_sesion_contesta_el_spa(client):
    """L09. ``/`` anónimo: 200 con el cascarón del SPA, sin tocar la sesión.

    Es la prueba que el checklist del Verificador pide («`/` sin sesión
    muestra la landing»). Del lado del servidor, «mostrar la landing» es
    exactamente esto: el mismo ``index.html`` de siempre, sin autenticar, sin
    cookie y sin ninguna llamada previa — el resto lo decide ``App.tsx`` en
    el navegador (ver L11).
    """
    if not DIST.exists():
        pytest.skip("HUECO: no hay frontend/dist en esta copia.")
    r = client.get("/")
    assert _es_el_cascaron(r), (r.status_code, r.headers.get("content-type"))
    assert "Authorization" not in r.request.headers


@pytest.mark.parametrize(
    "ruta",
    [
        "/login",
        "/login?invitacion=abc123",                 # routers/usuarios.py:122
        "/?montar=GON-60-A&t=eyJhbGciOi.fake.token",  # routers/spaces.py:413
        "/politica-datos",
        "/plataforma",
        "/plataforma/reporte/alguien",
        "/plataforma/clientes/alguien",
        "/reporte-plataforma",
    ],
)
def test_l10_los_enlaces_que_ya_circulan_siguen_llegando_al_spa(client, ruta):
    """L10. Los enlaces que YA están en la bandeja de entrada de alguien.

    El correo de invitación apunta a ``/login?invitacion=…``, el de montaje a
    la RAÍZ con ``?montar=&t=`` —la ruta que la landing se queda— y el de
    vencimientos otra vez a ``/``. Ninguno se puede volver un 404 ni un
    redirect: el servidor tiene que seguir devolviendo el mismo cascarón para
    todos, y la decisión de qué pintar sigue siendo del navegador.
    """
    if not DIST.exists():
        pytest.skip("HUECO: no hay frontend/dist en esta copia.")
    r = client.get(ruta)
    assert _es_el_cascaron(r), f"{ruta} → {r.status_code} {r.headers.get('content-type')}"


def test_l10b_todas_las_rutas_publicas_sirven_el_mismo_cascaron(client):
    """L10b. Y es el MISMO cascarón: la landing no introduce render en el servidor.

    Si mañana ``/`` devolviera un HTML propio (por SEO, por LCP, por lo que
    sea), habría dos plantillas que mantener y un lugar nuevo donde imprimir
    datos. La spec lo prohíbe: «SIN MIGRACIONES; nada de backend salvo, si
    hace falta, servir la ruta».
    """
    if not DIST.exists():
        pytest.skip("HUECO: no hay frontend/dist en esta copia.")
    raiz = client.get("/")
    for otra in ("/login", "/politica-datos", "/plataforma"):
        assert client.get(otra).content == raiz.content, (
            f"{otra} devuelve un HTML distinto de `/`: apareció render en el servidor"
        )


def test_l11_app_tsx_resuelve_montaje_y_politica_ANTES_que_la_landing():
    """L11. El orden de las guardas en ``App.tsx`` es el contrato.

    ``TOKEN_MONTAJE`` se lee al cargar el módulo y limpia la URL
    (``?t=`` → ``?montaje=1``); ``/politica-datos`` se resuelve mirando el
    ``pathname`` porque el ``<BrowserRouter>`` sólo se monta con sesión. Si
    la landing se pinta antes que cualquiera de las dos, el enlace de la
    mercaderista termina en una página de marketing con el token ya
    consumido de la barra de direcciones — y no hay forma de volver atrás.
    """
    app_tsx = SRC / "App.tsx"
    codigo = _codigo(app_tsx)

    assert "params.get(\"t\")" in codigo or "params.get('t')" in codigo, (
        "App.tsx dejó de leer el `?t=` del enlace de montaje")
    assert 'searchParams.set("montaje"' in codigo or "params.get(\"montaje\")" in codigo, (
        "App.tsx dejó de marcar/leer la URL con `?montaje=1`, que es lo que "
        "hace que una recarga de la pantalla de montaje no caiga en la landing")
    i_montaje = codigo.find("TOKEN_MONTAJE) return")
    i_politica = codigo.find("/politica-datos")
    assert i_montaje > 0, "desapareció la guarda `if (TOKEN_MONTAJE) return <Montaje />`"
    assert i_politica > 0, "desapareció la guarda de /politica-datos"

    # El USO, no el `import` de arriba de todo: lo que importa es en qué
    # orden se decide qué se pinta.
    landing = re.search(r"<Landing\w*\b|element=\{<Landing", codigo)
    if landing is None:
        pytest.skip(
            "HUECO: App.tsx todavía no monta la landing. Cuando lo haga, esta "
            "prueba exige que las guardas de montaje y de /politica-datos "
            "queden ANTES."
        )
    assert landing.start() > i_montaje, (
        "la landing se resuelve ANTES que el enlace de montaje: "
        "`/?montar=…&t=…` (routers/spaces.py:413) caería en la página pública"
    )
    assert landing.start() > i_politica, (
        "la landing se resuelve ANTES que /politica-datos, que tiene que "
        "andar sin sesión y sin router"
    )


def test_l12a_la_landing_se_queda_con_la_raiz_y_nada_mas():
    """L12a. La landing se lleva ``/``. No se puede llevar el resto.

    Hoy el enlace de la invitación (``/login?invitacion=…``) funciona por un
    accidente feliz: sin sesión, ``App.tsx`` devuelve ``<Login />`` para
    CUALQUIER path. Cuando ``/`` pasa a ser la landing hay dos formas
    legítimas de no romper ese correo —una ruta ``/login`` explícita, o
    acotar la landing a la raíz y dejar el login como fondo— y una forma de
    romperlo: que la landing sea el destino por defecto. Se exige que la
    pantalla de ingreso siga existiendo en el camino sin sesión y que la
    portada esté acotada.
    """
    codigo = _codigo(SRC / "App.tsx")
    if not re.search(r"<Landing\w*\b|element=\{<Landing", codigo):
        pytest.skip(
            "HUECO: App.tsx todavía no monta la landing, así que `/login` "
            "sigue funcionando por el camino viejo (sin sesión, cualquier "
            "path devuelve <Login/>). La prueba corre sola cuando se monte."
        )
    assert re.search(r"<Login\b", codigo), (
        "App.tsx monta la landing y ya no monta <Login/>: el correo de "
        "invitación (`/login?invitacion=…`, routers/usuarios.py:122) y el "
        "CTA «Ya tengo cuenta» se quedaron sin pantalla"
    )
    acotada = re.search(
        r"""path\s*=\s*["']/login["']"""              # una <Route path="/login">
        r"""|pathname[^;\n]{0,60}===\s*["']/["']"""    # o una guarda por pathname
        r"""|===\s*["']/["']\s*\|\|""",
        codigo,
    )
    assert acotada, (
        "no se ve qué acota la landing a la raíz: si es el destino por "
        "defecto sin sesión, `/login?invitacion=…`, el deep link de montaje "
        "recargado y `/reporte-plataforma` terminan todos en la portada"
    )


def test_l12b_la_landing_ofrece_el_camino_de_vuelta_a_login():
    """L12b. Los dos CTA de la spec §1, y el correo de vencimientos.

    ``routers/bulk_leases.py:461`` manda «Abrir RECABRA» a la RAÍZ. Quien
    abre ese correo sin sesión ahora aterriza en una página de marketing: si
    no hay un «Ya tengo cuenta» a la vista, se quedó afuera de su propio
    sistema.
    """
    if "Landing" not in _codigo(SRC / "App.tsx"):
        pytest.skip(
            "HUECO: App.tsx todavía no monta la landing; la página de "
            "aterrizaje (con sus CTA) no está terminada."
        )
    archivos = _exigir_componentes()
    textos = "\n".join(_codigo(p) for p in archivos)
    assert "/login" in textos, (
        "la landing no tiene ningún enlace a `/login`: quien ya tiene cuenta "
        "—y quien llega por el correo de vencimientos, que apunta a `/`— se "
        "queda encerrado en la página de marketing"
    )
    assert "#registro" in textos, (
        "falta el CTA primario `/login#registro` de la spec §1"
    )


def test_l13_la_landing_no_agrego_superficie_publica_en_la_api(client):
    """L13. Lo que un anónimo puede pedirle a la API sigue siendo lo de antes.

    Se recorre la tabla de rutas entera y se pide cada GET sin token. Sólo
    dos contestan 200 y las dos son deliberadas (``/api/health`` y la lista
    de supermercados del selector de ingreso, que es pública por diseño).
    Un ``/api/landing/demo`` para alimentar el plano —o cualquier otro
    endpoint público nuevo— hace fallar esta prueba.
    """
    from tests.conftest import rutas_planas
    from app.main import app as fastapi_app

    PUBLICAS = {"/api/health", "/api/auth/clientes"}
    filtradas: list[str] = []
    for ruta in rutas_planas(fastapi_app):
        if not ruta.path.startswith("/api/") or "GET" not in ruta.methods:
            continue
        concreta = re.sub(r"\{[^}]+\}", "zzz-inexistente", ruta.path)
        r = client.get(concreta)
        if r.status_code == 200 and ruta.path not in PUBLICAS:
            filtradas.append(f"{ruta.path} → 200 sin token")
    assert not filtradas, (
        "superficie pública nueva en la API:\n  " + "\n  ".join(filtradas)
    )


# ════════════════════════════════════════════════════════════════════════════
# L14–L16 · PESO, 3D BAJO DEMANDA Y ACCESIBILIDAD
# ════════════════════════════════════════════════════════════════════════════

_ESTATICO = re.compile(
    r"""^\s*(?:import|export)\s[^;]*?from\s*["'`]([^"'`]+)["'`]|^\s*import\s*["'`]([^"'`]+)["'`]""",
    re.M,
)
_DINAMICO = re.compile(r"""\bimport\(\s*["'`]([^"'`]+)["'`]""")


def _grafo_estatico_de_la_landing() -> tuple[set[Path], set[Path]]:
    """(lo que entra en el primer pintado, lo que se baja después).

    Un módulo al que sólo se llega por ``import()`` es un *chunk* aparte: que
    ÉL importe ``three`` es justamente lo que se quiere. Lo que no puede
    pasar es que se llegue a él —o a ``three``— por una cadena de ``import``
    estáticos desde la página.
    """
    nucleo = _paginas_de_la_landing()
    if not nucleo:
        return set(), set()
    importados_estaticos: set[Path] = set()
    bajados_bajo_demanda: set[Path] = set()
    aristas: dict[Path, set[Path]] = {}
    for p in nucleo:
        codigo = _codigo(p)
        destinos = set()
        for a, b in _ESTATICO.findall(codigo):
            d = _resolver_import(p, a or b)
            if d is not None:
                destinos.add(d)
        aristas[p] = destinos
        importados_estaticos |= destinos & nucleo
        for espec in _DINAMICO.findall(codigo):
            d = _resolver_import(p, espec)
            if d is not None:
                bajados_bajo_demanda.add(d)
    # Un módulo que sólo se alcanza por `import()` NO es una raíz aunque nadie
    # lo importe estáticamente: es precisamente el chunk perezoso.
    raices = {p for p in nucleo
              if p not in importados_estaticos and p not in bajados_bajo_demanda}
    eager: set[Path] = set()
    pendientes = list(raices)
    while pendientes:
        actual = pendientes.pop()
        if actual in eager:
            continue
        eager.add(actual)
        pendientes += [d for d in aristas.get(actual, set()) if d in nucleo]
    return eager, nucleo - eager


def test_l14_three_js_no_entra_en_el_camino_de_la_landing():
    """L14. «Ver en 3D» carga three.js; la landing, no.

    ``StoreEditor3D.tsx`` importa ``three``, ``@react-three/fiber`` y
    ``@react-three/drei`` de forma estática, y hasta esta fase **no había un
    solo ``React.lazy`` en todo el frontend**. Si la vista 3D de la landing
    cuelga de un ``import`` normal, el primer pintado de una página de
    marketing arrastra el motor 3D entero y el LCP de 2,5 s en 4G no se
    cumple. Se audita el grafo ESTÁTICO: lo que se alcanza sólo por
    ``import()`` puede importar three.js todo lo que quiera.
    """
    _exigir_landing()
    eager, lazy = _grafo_estatico_de_la_landing()
    pesado = re.compile(
        r"""^\s*import\s[^;]*?from\s*["'`](three|@react-three/[\w-]+|"""
        r"""[^"'`]*StoreEditor3D[^"'`]*)["'`]""",
        re.M,
    )
    delitos = [
        f"{_rel(p)}: {m.group(0).strip()[:80]!r}"
        for p in sorted(eager) for m in [pesado.search(_codigo(p))] if m
    ]
    assert not delitos, (
        "three.js entra en el bundle inicial de la landing (módulos "
        "alcanzables por `import` estático desde la página):\n  "
        + "\n  ".join(delitos)
    )

    # Y al revés: si hay un módulo 3D, alguien tiene que bajarlo con `import()`.
    hay_3d = [p for p in _paginas_de_la_landing() if pesado.search(_codigo(p))]
    if hay_3d:
        dinamicos = {
            _resolver_import(p, espec)
            for p in _paginas_de_la_landing()
            for espec in _DINAMICO.findall(_codigo(p))
        }
        assert set(hay_3d) & (dinamicos | lazy), (
            f"{[_rel(p) for p in hay_3d]} importa three.js pero nadie lo carga "
            "con `import()`: revisá que la vista 3D sea de verdad bajo demanda"
        )


def _grafo_estatico_de_la_app() -> tuple[set[Path], set[str]]:
    """Lo que el navegador baja ANTES de pintar cualquier cosa en ``/``.

    Vite parte el bundle sólo donde hay un ``import()`` dinámico. Todo lo
    demás —lo que se alcanza desde ``main.tsx`` por ``import`` normales— entra
    en el mismo archivo, lo mire quien lo mire. Devuelve (módulos locales,
    paquetes de node_modules).
    """
    entrada = SRC / "main.tsx"
    if not entrada.is_file():                                  # pragma: no cover
        return set(), set()
    locales: set[Path] = set()
    paquetes: set[str] = set()
    pendientes = [entrada]
    while pendientes:
        actual = pendientes.pop()
        if actual in locales or not actual.is_file():
            continue
        locales.add(actual)
        codigo = _codigo(actual)
        perezosos = {_resolver_import(actual, e) for e in _DINAMICO.findall(codigo)}
        for a, b in _ESTATICO.findall(codigo):
            espec = a or b
            destino = _resolver_import(actual, espec)
            if destino is None:
                if not espec.startswith("."):
                    paquetes.add(espec)
            elif destino not in perezosos:
                pendientes.append(destino)
    return locales, paquetes


def test_l17_el_primer_pintado_de_la_portada_no_arrastra_three_js():
    """L17. El 3D bajo demanda se decide en ``main.tsx``, no en la landing.

    ``PlanoIsometrico.tsx`` hace lo correcto: ``lazy(() => import("./Vista3D"))``,
    y ``Vista3D`` es el único archivo de la landing que importa ``three``.
    Pero el bundle no se arma por página: se arma por grafo. Si ``App.tsx``
    importa el tablero de forma estática —y el tablero importa
    ``StoreEditor3D``, que importa ``three``, ``@react-three/fiber`` y
    ``@react-three/drei``—, entonces **el visitante anónimo de `/` baja el
    motor 3D entero antes de ver el titular**, y el ``import()`` de la vista
    3D no ahorra un solo byte porque three ya vino en el chunk principal.

    Es el guardrail de la fase («three.js se carga SOLO bajo demanda para
    "Ver en 3D"») y el LCP < 2,5 s en 4G de la spec. Se arregla del lado del
    armazón, con un ``React.lazy`` sobre el tablero (y, si se quiere, sobre
    ``Login``, que arrastra el SDK de Firebase): la landing ya está lista.
    """
    locales, paquetes = _grafo_estatico_de_la_app()
    if not locales:
        pytest.skip("HUECO: no hay frontend/src/main.tsx.")
    if not any("Landing" in str(p) for p in locales):
        pytest.skip(
            "HUECO: la landing todavía no cuelga de main.tsx; sin ella, el "
            "peso del bundle no es una cuestión de la página pública."
        )
    pesados = sorted(x for x in paquetes
                     if x == "three" or x.startswith("@react-three/"))
    culpables = sorted(_rel(p) for p in locales if "StoreEditor3D" in str(p))
    assert not pesados, (
        "`/` es ahora una página pública y su bundle inicial trae "
        f"{pesados} por el camino de {culpables or 'el tablero'}: el 3D deja "
        "de ser «bajo demanda» y el LCP en 4G no se sostiene. Falta un "
        "`React.lazy` sobre el tablero en App.tsx (la landing ya carga su "
        "Vista3D con `import()`)."
    )


def test_l15_accesibilidad_minima_de_la_landing():
    """L15. Lo que se puede comprobar leyendo el archivo.

    Tres cosas, las tres de la spec: toda imagen con alternativa textual, los
    controles del plano con nombre accesible (``+``, ``−`` y «centrar» son
    glifos: sin ``aria-label`` un lector de pantalla lee «botón») y
    ``prefers-reduced-motion`` atendido en algún lado — la landing es la
    única pantalla del producto con animación de entrada.
    """
    archivos = _exigir_componentes() | {p for p in _paginas_de_la_landing() if p.suffix == ".css"}
    textos = {p: _codigo(p) for p in sorted(archivos)}
    todo = "\n".join(textos.values())

    sin_alt = [
        f"{_rel(p)}: {m.group(0)[:70]!r}"
        for p, c in textos.items()
        for m in re.finditer(r"<img(?![^>]*\balt\s*=)[^>]*>", c, re.I)
    ]
    assert not sin_alt, "imágenes sin `alt` en la landing:\n  " + "\n  ".join(sin_alt)

    # Un botón queda señalado cuando (a) no tiene nombre accesible en el
    # atributo y (b) lo que muestra no tiene una sola letra: `+`, `−`, `×`, un
    # icono suelto. Un `{en3d ? "Ver el plano" : "Ver en 3D"}` SÍ tiene nombre
    # —lo da el texto— y no se cuenta.
    mudos = []
    for p, c in textos.items():
        for m in re.finditer(r"<button([^>]*)>(.*?)</button>", c, re.I | re.S):
            atributos, contenido = m.group(1), m.group(2)
            if re.search(r"aria-label|aria-labelledby|\btitle\s*=", atributos, re.I):
                continue
            visible = re.sub(r"<[^>]*>", "", contenido)
            if not re.search(r"[0-9A-Za-zÀ-ÿ]", visible):
                mudos.append(f"{_rel(p)}: <button{atributos[:60]}> con {visible.strip()[:20]!r}")
    assert not mudos, (
        "botones sin nombre accesible (los del plano son glifos):\n  " + "\n  ".join(mudos)
    )

    assert "prefers-reduced-motion" in todo, (
        "la landing no atiende `prefers-reduced-motion` en ningún archivo "
        "(spec §«El plano isométrico»: accesible, movimiento reducido respetado)"
    )
    assert re.search(r"role\s*=\s*[\"'{]?\s*(?:img|group|application)", todo) or \
        re.search(r"aria-label", todo), (
        "el plano isométrico no expone ni `role` ni `aria-label`: para un "
        "lector de pantalla es un SVG vacío"
    )


def test_l16_el_plano_se_puede_usar_sin_mouse():
    """L16. Rueda y arrastre son gestos de mouse. El teclado tiene que existir.

    No se comprueba que funcione —eso es del navegador— sino que el código
    lo contemple: foco (``tabIndex``) y teclas (``onKeyDown``/``keydown``) en
    el mismo archivo donde vive el plano.
    """
    archivos = _exigir_componentes()
    candidatos = [p for p, c in ((p, _codigo(p)) for p in archivos)
                  if re.search(r"onWheel|wheel|pointerdown|onPointerDown", c, re.I)]
    if not candidatos:
        pytest.skip(
            "HUECO: todavía no hay ningún archivo de la landing con gestos de "
            "rueda/arrastre (el plano isométrico no está construido)."
        )
    delitos = []
    for p in candidatos:
        c = _codigo(p)
        if not re.search(r"tabIndex|tabindex", c) or not re.search(r"onKeyDown|keydown", c, re.I):
            delitos.append(_rel(p))
    assert not delitos, (
        "el plano se maneja con rueda/arrastre pero no toma foco ni escucha "
        "el teclado: " + ", ".join(delitos)
    )
