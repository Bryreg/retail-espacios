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


# ════════════════════════════════════════════════════════════════════════════
# L18–L26 · SEGUNDA RONDA: LO QUE AGREGA EL VESTIDO «E · LA FUSIÓN»
#
# La landing se re-viste con la opción E
# (`features/landing/outputs/opciones/E-fusion/index.html`), que trae cinco
# cosas que antes no existían y que abren bordes nuevos:
#
# * una **cámara guiada por el scroll** sobre el plano, con nueve encuadres
#   (el mapa `ESC` del prototipo) y capas de prueba ancladas a un mueble;
# * un **titular nuevo** —«Recabrá cada metro.», elegido por el dueño— con el
#   titular viejo bajado a subtítulo;
# * **vidrio** (`backdrop-filter`) en las tarjetas, apagado bajo 720 px;
# * una **barra de progreso** y **conectores** entre secciones;
# * «**Ver en 3D**» resuelto como un parámetro animado en vez de una escena
#   aparte.
#
# El riesgo de todo esto es el mismo y es viejo: una página que se vuelve
# película deja de ser legible para quien no puede —o no quiere— ver la
# película. En A, `prefers-reduced-motion` apagaba las capas con
# `display:none`, y con ellas la PRUEBA: el visitante con movimiento reducido
# se quedaba sin el contrato, sin el −17 % y sin los tres correos. E dice
# haberlo arreglado («cámara quieta, no cámara apagada»). Acá se comprueba.
# ════════════════════════════════════════════════════════════════════════════

# El slogan que el dueño eligió como H1 (commit «landing E: slogan de marca»).
# Es, junto con el subtítulo, la ÚNICA licencia sobre el copy: todo lo demás
# sale literal de `features/landing/outputs/copy.md`.
TITULAR_E = "Recabrá cada metro."

# El titular viejo. No se borra: baja a subtítulo, porque es la línea que
# enseña la leyenda de colores antes de que nadie la lea.
SUBTITULO_E = "Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo."

COPY_MD = RAIZ / "features" / "landing" / "outputs" / "copy.md"
OPCIONES = RAIZ / "features" / "landing" / "outputs"

_ENTIDADES = {
    "&nbsp;": " ", "&#160;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&middot;": "·", "&times;": "×", "&minus;": "−", "&hellip;": "…",
    "&mdash;": "—", "&ndash;": "–", "&quot;": '"', "&#39;": "'",
    "&laquo;": "«", "&raquo;": "»",
}


def _normalizar(texto: str) -> str:
    """El texto tal como lo lee una persona, no como lo escribe el JSX.

    Borra marcas, expresiones ``{…}`` (que en un `.tsx` son código, no
    palabras), entidades, espacios finos y saltos de línea. Así
    ``<h2>Cómo se\n  arranca</h2>`` y ``> Cómo se arranca`` del ``copy.md``
    se pueden comparar de verdad.
    """
    import unicodedata
    t = unicodedata.normalize("NFC", texto)
    for k, v in _ENTIDADES.items():
        t = t.replace(k, v)
    t = t.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    t = re.sub(r"<[^>]*>", " ", t)          # etiquetas (JSX incluido)
    t = re.sub(r"\{[^{}]*\}", " ", t)       # {" "}, {variable}, {/* … */}
    t = re.sub(r"\s+", " ", t)
    # Al sacar las etiquetas queda un espacio donde el JSX no lo tenía:
    # `está <span>libre</span>, quién` → `está libre , quién`. Sin esto, una
    # frase pintada palabra por palabra (que es justo lo que hace el
    # subtítulo del hero con los cuatro estados) nunca coincide con el copy.
    t = re.sub(r"\s+([,.;:!?%)\]»…])", r"\1", t)
    t = re.sub(r"([(\[«¡¿])\s+", r"\1", t)
    return t.strip()


def _copy() -> str:
    """El copy aprobado, normalizado, para buscar frases adentro."""
    if not COPY_MD.is_file():
        pytest.skip(f"HUECO: falta {_rel(COPY_MD)}; sin la fuente del copy no "
                    "hay contra qué comparar los textos de la página.")
    return _normalizar(_texto(COPY_MD))


def _css_de_la_landing() -> list[Path]:
    return sorted(p for p in _paginas_de_la_landing() if p.suffix == ".css")


def _bloques_media(css: str, condicion: re.Pattern) -> list[tuple[str, str]]:
    """``@media`` cuyo texto de condición matchea, con su cuerpo balanceado.

    Con expresión regular sola esto sale mal: un ``@media`` que adentro tiene
    otro ``@media`` (o un ``@supports``) cierra donde no debe y la prueba se
    queda mirando medio bloque. Se cuentan llaves.
    """
    salida: list[tuple[str, str]] = []
    for m in re.finditer(r"@media([^{]*)\{", css):
        cond = m.group(1).strip()
        if not condicion.search(cond):
            continue
        i, prof, n = m.end(), 1, len(css)
        while i < n and prof:
            if css[i] == "{":
                prof += 1
            elif css[i] == "}":
                prof -= 1
            i += 1
        salida.append((cond, css[m.end():i - 1]))
    return salida


def _reglas(cuerpo: str) -> list[tuple[str, str]]:
    """(selector, declaraciones) de un cuerpo CSS plano."""
    return [(m.group(1).strip(), m.group(2))
            for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", cuerpo)]


def _declara(decls: str, propiedad: str, valor: str) -> bool:
    return re.search(
        rf"(?:^|;)\s*{re.escape(propiedad)}\s*:\s*{valor}\s*(?:!important)?\s*(?:;|$)",
        decls, re.I,
    ) is not None


# Lo que SÍ se puede apagar con movimiento reducido: adorno puro. Un
# pseudo-elemento no lleva contenido de prueba (no hay forma de que un
# `::after` sea el contrato del proveedor), y estos nombres son los del
# decorado — velo, grilla, destello, estela, cursor.
DECORATIVO = re.compile(
    r"::(?:before|after)|\[aria-hidden|\.deco\b|\.veil\b|\.velo\b|\.grid(?:_|-|\b)|"
    r"\.beam\b|\.pulse\b|\.pulso\b|\.glow\b|\.brillo\b|\.destello\b|\.estela\b|"
    r"\.shine\b|\.spark\b|\.cursor\b|\.particul\w*|\.scan\b|\.ruido\b|\.noise\b",
    re.I,
)


def _hay_camara_de_scroll() -> list[Path]:
    """Archivos de la landing donde vive la cámara guiada por el scroll.

    Se reconoce por la mezcla que sólo tiene ese recurso: escuchar el scroll
    (o un IntersectionObserver de escenas) Y escribir un ``transform`` cuadro
    a cuadro con ``requestAnimationFrame``.
    """
    salida = []
    for p in _componentes_de_la_landing():
        c = _codigo(p)
        mira_scroll = re.search(r"""addEventListener\(\s*["']scroll["']|onScroll|"""
                                r"""IntersectionObserver""", c)
        anima = "requestAnimationFrame" in c
        camara = re.search(r"\bcam(?:ara|era)?\b|\bescena\b|\bencuadre\b|\bsetEscena\b|"
                           r"\btgt\b|\blerp\b", c, re.I)
        if mira_scroll and anima and camara:
            salida.append(p)
    return sorted(salida)


# ── L18 ─────────────────────────────────────────────────────────────────────

def test_l18_el_titular_es_el_slogan_de_marca_y_el_viejo_no_se_perdio():
    """L18. «Recabrá cada metro.» es el H1, y el titular viejo baja a subtítulo.

    Dos cosas, y la segunda importa tanto como la primera.

    **Una.** El H1 es el LCP de la página y es lo que Google publica: tiene
    que ser el slogan que el dueño eligió (`README.md` de E, «Lo que es nuevo
    en E»), en un solo ``<h1>``. Dos ``<h1>`` en una página larga es el error
    clásico del que arma secciones con la misma plantilla, y deja al lector
    de pantalla sin saber cuál es el título del documento.

    **Dos.** «Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo»
    no es una frase que sobre: es la línea donde se ENSEÑA la leyenda de
    colores —*libre* verde, *ocupa* rojo, *a cuánto* amarillo, *hasta cuándo*
    naranja— antes de que nadie lea la leyenda. Si al cambiar el titular esa
    frase se borra en vez de bajar a subtítulo, la página pierde su única
    explicación de por qué el plano está pintado así, y la pierde en silencio:
    nada se rompe, sólo deja de entenderse.
    """
    archivos = _exigir_componentes()
    textos = {p: _codigo(p) for p in sorted(archivos)}

    h1s = [(p, _normalizar(m.group(1)))
           for p, c in textos.items()
           for m in re.finditer(r"<h1[^>]*>(.*?)</h1>", c, re.S | re.I)]
    assert h1s, (
        "la landing no tiene ningún <h1>: el título del documento (y el LCP "
        "de la página pública) no existe"
    )
    assert len(h1s) == 1, (
        "hay más de un <h1> en la landing:\n  "
        + "\n  ".join(f"{_rel(p)}: {t!r}" for p, t in h1s)
    )

    p, titular = h1s[0]
    assert titular == TITULAR_E, (
        f"el <h1> de {_rel(p)} dice {titular!r} y el dueño eligió "
        f"{TITULAR_E!r} (commit «landing E: slogan de marca … como H1»; "
        "`features/landing/outputs/opciones/E-fusion/README.md`, «Lo que es "
        "nuevo en E»). El titular viejo no se borra: baja a subtítulo."
    )

    todo = _normalizar("\n".join(textos.values()))
    assert _normalizar(SUBTITULO_E).rstrip(".") in todo, (
        f"al cambiar el titular se perdió {SUBTITULO_E!r}. Esa frase es la que "
        "enseña la leyenda de colores (libre / ocupa / a cuánto / hasta "
        "cuándo) antes de que nadie lea la leyenda: en E baja a subtítulo del "
        "hero, no se elimina."
    )


# ── L19 ─────────────────────────────────────────────────────────────────────

def test_l19_la_camara_por_scroll_no_traba_el_scroll_ni_repinta_el_arbol():
    """L19. Una cámara que se mueve con el dedo se paga con el dedo.

    Dos trampas concretas, las dos anotadas por el propio E
    (`README.md`, «Cómo está hecho (para el port a React)»):

    * **Escuchar ``scroll`` sin ``{ passive: true }``.** El navegador no puede
      adelantar el desplazamiento hasta saber si el handler va a llamar
      ``preventDefault()``, así que espera al JavaScript en CADA cuadro. En un
      Android de gama media eso es exactamente la sensación de página trabada
      que la fase quiere evitar. La rueda del plano es otra cosa —ahí sí hace
      falta ``passive: false``, porque el plano acerca en vez de scrollear— y
      por eso esta prueba mira sólo ``scroll``.
    * **Poner la cámara en ``useState``.** Serían ~60 renders del árbol por
      segundo, con el plano entero adentro. La cámara es estado derivado del
      scroll, no del render: va en un ``useRef`` y se escribe imperativamente
      sobre un único ``transform``.
    """
    camaras = _hay_camara_de_scroll()
    if not camaras:
        pytest.skip(
            "HUECO: todavía no hay cámara guiada por scroll en la landing "
            "(ningún componente junta scroll/IntersectionObserver + "
            "requestAnimationFrame + encuadres). Es lo que agrega la opción E; "
            "la prueba corre sola en cuanto exista."
        )
    delitos: list[str] = []
    for p in camaras:
        c = _codigo(p)
        for m in re.finditer(
            r"""addEventListener\(\s*["']scroll["']\s*,([^;]{0,240}?)\)\s*;""", c, re.S
        ):
            if not re.search(r"passive\s*:\s*true", m.group(1)):
                linea = c.count("\n", 0, m.start()) + 1
                delitos.append(
                    f"{_rel(p)}:~{linea}: listener de `scroll` sin "
                    "{ passive: true }"
                )
        if "useRef" not in c:
            delitos.append(
                f"{_rel(p)}: la cámara se mueve con requestAnimationFrame pero "
                "el archivo no usa `useRef`; si `cam`/`tgt` viven en `useState` "
                "son ~60 renders por segundo del árbol con el plano adentro"
            )
    assert not delitos, (
        "la cámara por scroll se paga con la fluidez de la página:\n  "
        + "\n  ".join(delitos)
    )


# ── L20 ─────────────────────────────────────────────────────────────────────

def test_l20_movimiento_reducido_deja_la_camara_quieta_no_apagada():
    """L20. Con movimiento reducido nadie puede perder una PRUEBA.

    Es el punto flojo que E dice haber corregido de A y el que más fácil se
    vuelve a romper, porque la forma cómoda de «respetar»
    ``prefers-reduced-motion`` es esconder lo que se movía:

    ```css
    @media (prefers-reduced-motion: reduce) { .capa-prueba { display: none } }
    ```

    Eso no es accesibilidad, es censura selectiva: el visitante que pidió
    menos movimiento —o cuyo sistema lo pide por él— se queda sin la ficha del
    contrato, sin el −17 % y sin los tres correos, que son justamente la
    prueba de que el producto hace lo que dice. La versión correcta es la
    **quieta**: el encuadre cambia de golpe, las capas aparecen sin recorrido,
    los contadores muestran el valor final.

    Se permite apagar adorno puro (un ``::after`` que destella, el velo del
    fondo): nada de eso lleva contenido.
    """
    hojas = _css_de_la_landing()
    if not hojas:
        pytest.skip("HUECO: la landing todavía no tiene hoja de estilo propia.")

    reducido = re.compile(r"prefers-reduced-motion", re.I)
    apagones = [
        ("display", "none"), ("visibility", "hidden"),
        ("content-visibility", "hidden"), ("opacity", "0"),
    ]
    delitos: list[str] = []
    restaura = False

    for hoja in hojas:
        css = _codigo(hoja)
        bloques = [c for _, c in _bloques_media(css, reducido)]
        # La otra forma de escribirlo: una clase en el <body> puesta desde JS
        # cuando `matchMedia` da true.
        fuera = "\n".join(
            m.group(0) for m in re.finditer(r"[^{}]*reduc\w*[^{}]*\{[^{}]*\}", css, re.I)
        )
        for cuerpo in bloques + ([fuera] if fuera.strip() else []):
            for selector, decls in _reglas(cuerpo):
                if _declara(decls, "opacity", "1") or _declara(decls, "transform", "none"):
                    restaura = True
                if DECORATIVO.search(selector):
                    continue
                for prop, val in apagones:
                    if _declara(decls, prop, val):
                        delitos.append(
                            f"{_rel(hoja)}: `{selector}` → {prop}: {val}"
                        )

    assert not delitos, (
        "con `prefers-reduced-motion` la landing ESCONDE contenido en vez de "
        "dejarlo quieto:\n  " + "\n  ".join(sorted(set(delitos)))
        + "\n\nLa regla de E es explícita: «movimiento reducido = cámara "
          "quieta, no cámara apagada; las capas de prueba aparecen igual, "
          "nada de display:none». Si lo que se apaga es adorno, dale un "
          "selector que se lea como adorno (`::after`, `.deco`, `.pulse`, "
          "`[aria-hidden]`)."
    )
    assert restaura, (
        "la landing atiende `prefers-reduced-motion` pero no deja ninguna "
        "regla que DEVUELVA el estado final (`opacity: 1` / `transform: none`) "
        "a lo que entra animado: con la preferencia puesta, todo lo que se "
        "revela al hacer scroll se queda en su estado inicial —invisible o "
        "corrido— y la página no se puede leer. La versión quieta hay que "
        "escribirla; apagar la animación no alcanza."
    )

    # Y del lado del JavaScript: la preferencia no puede borrar una capa.
    componentes = _componentes_de_la_landing()
    gatillos = [
        (re.compile(r"""[!¬]\s*\w*[Rr]educ\w*\s*&&\s*<"""),
         "`{!reducido && <capa/>}`: la capa no se pinta"),
        (re.compile(r"""\w*[Rr]educ\w*\s*\?\s*null\s*:"""),
         "`{reducido ? null : …}`: la capa no se pinta"),
        (re.compile(r"""\w*[Rr]educ\w*\s*\?\s*["']none["']"""),
         "`reducido ? \"none\"`: la capa se esconde con estilo en línea"),
    ]
    ocultos = [
        f"{_rel(p)}:~{_codigo(p).count(chr(10), 0, m.start()) + 1}: {que}"
        for p in sorted(componentes)
        for patron, que in gatillos
        for m in [patron.search(_codigo(p))] if m
    ]
    assert not ocultos, (
        "el movimiento reducido decide en JavaScript que una capa NO se "
        "pinte:\n  " + "\n  ".join(ocultos)
        + "\n\nQuieta sí, ausente no: con la preferencia puesta la capa "
          "aparece igual, sin recorrido."
    )


# ── L21 ─────────────────────────────────────────────────────────────────────

def test_l21_el_vidrio_se_apaga_en_pantallas_chicas():
    """L21. ``backdrop-filter`` es barato de escribir y caro de pintar.

    Cada superficie con ``backdrop-filter: blur()`` obliga al compositor a
    releer y desenfocar lo que hay detrás **en cada cuadro**. Con la cámara de
    E moviéndose con el scroll, eso pasa 60 veces por segundo, y en un Android
    de gama media —que es el teléfono con el que un gerente de supermercado
    va a abrir esta página— tira los fps al piso justo mientras la página
    intenta demostrar que es fluida.

    La regla es de la propia opción E, tomada de C: «el vidrio moderado y
    **apagado bajo 720 px**». Lo que se pide acá es lo mínimo comprobable
    leyendo la hoja: que exista el corte, que ahí el vidrio se apague de
    verdad (``backdrop-filter: none``) y que lo que quede desenfocado no pase
    de un blur liviano. Y que al apagarlo se ponga un fondo sólido: un panel
    que era legible por el desenfoque y se queda sin él ni fondo pasa a ser
    texto sobre el plano.
    """
    hojas = _css_de_la_landing()
    if not hojas:
        pytest.skip("HUECO: la landing todavía no tiene hoja de estilo propia.")

    usa_vidrio = [h for h in hojas if re.search(r"backdrop-filter", _codigo(h), re.I)]
    if not usa_vidrio:
        pytest.skip(
            "HUECO: la landing todavía no usa `backdrop-filter`; el vidrio es "
            "lo que trae el vestido E. Sin vidrio no hay nada que apagar."
        )

    # `(max-width: 720px)`, `(width <= 720px)` y cualquier corte más chico.
    corte = re.compile(r"max-width\s*:\s*(\d+)\s*px|width\s*<=\s*(\d+)\s*px", re.I)
    apaga = False
    fondo = False
    blurs_chicos: list[str] = []

    for hoja in usa_vidrio:
        css = _codigo(hoja)
        for cond, cuerpo in _bloques_media(css, corte):
            anchos = [int(a or b) for a, b in corte.findall(cond)]
            if not anchos or min(anchos) > 720:
                continue
            for selector, decls in _reglas(cuerpo):
                if _declara(decls, "backdrop-filter", "none") or \
                   _declara(decls, "-webkit-backdrop-filter", "none"):
                    apaga = True
                    if re.search(r"(?:^|;)\s*background", decls, re.I):
                        fondo = True
                for m in re.finditer(r"backdrop-filter\s*:[^;]*blur\(\s*([\d.]+)px",
                                     decls, re.I):
                    if float(m.group(1)) > 12:
                        blurs_chicos.append(
                            f"{_rel(hoja)}: `{selector}` conserva "
                            f"blur({m.group(1)}px) bajo {min(anchos)} px"
                        )

    assert apaga, (
        "la landing usa `backdrop-filter` ("
        + ", ".join(_rel(h) for h in usa_vidrio)
        + ") y no lo apaga en ningún corte de 720 px o menos. Con la cámara "
          "de E repintando el plano en cada cuadro, el vidrio se compone 60 "
          "veces por segundo sobre un Android de gama media. La regla es de "
          "la propia opción E («el vidrio moderado y apagado bajo 720 px», "
          "`opciones/E-fusion/README.md`, «Qué tomé de C» §7):\n\n"
          "    @media (max-width: 720px) {\n"
          "      .tarjeta, .panel { backdrop-filter: none; background: var(--panel-solid) }\n"
          "    }"
    )
    assert fondo, (
        "bajo 720 px se apaga `backdrop-filter` pero no se pone `background` "
        "en la misma regla: el panel dejaba de ser legible porque el "
        "desenfoque le daba el contraste, y ahora queda texto directamente "
        "sobre el plano. Hay que darle el fondo sólido."
    )
    assert not blurs_chicos, (
        "bajo 720 px queda vidrio pesado:\n  " + "\n  ".join(blurs_chicos)
        + "\nSi una superficie tiene que seguir con vidrio (la barra "
          "superior, por ejemplo), que sea un blur liviano (≤ 12 px)."
    )


# ── L22 ─────────────────────────────────────────────────────────────────────

def _prototipos_entregados() -> list[Path]:
    """Los `.html` que esta fase dejó en ``features/landing/outputs/``.

    No son código de producción, pero son ENTREGABLES: el dueño los abre con
    doble clic para elegir la dirección, y lo que se elija se porta a React
    tal cual. Un prototipo que baja una fuente de Google decide, sin que nadie
    lo note, que la landing definitiva la baje también — y ahí ya no abre: la
    CSP de la Fase 3 la bloquea en producción y en silencio.
    """
    if not OPCIONES.is_dir():
        return []
    return sorted(p for p in OPCIONES.rglob("*.html") if p.is_file())


def test_l22_los_prototipos_entregados_son_autocontenidos():
    """L22. «Un solo archivo, sin librerías, sin recursos externos, cero red».

    Es lo que promete el README de E, y es la promesa que hay que verificar,
    no creer: un prototipo se escribe rápido, con el navegador abierto y sin
    CSP, que es exactamente la situación en la que una fuente de un CDN entra
    sola. Se mira lo mismo que en L06 (que audita el frontend) más lo que un
    prototipo puede tener y el frontend no: una llamada de red de verdad.
    """
    prototipos = _prototipos_entregados()
    if not prototipos:
        pytest.skip("HUECO: no hay prototipos en features/landing/outputs/.")

    red = [
        (re.compile(r"\bfetch\s*\(", re.I), "fetch()"),
        (re.compile(r"\bXMLHttpRequest\b"), "XMLHttpRequest"),
        (re.compile(r"\bnavigator\.sendBeacon\b"), "sendBeacon"),
        (re.compile(r"\bnew\s+WebSocket\b"), "WebSocket"),
        (re.compile(r"\bnew\s+EventSource\b"), "EventSource"),
        (re.compile(r"""["'`]/api/"""), "una ruta /api/*"),
    ]
    delitos: list[str] = []
    for p in prototipos:
        codigo = _codigo(p)
        for patron, que in SUBRECURSOS_EXTERNOS:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)}: {que} → {m.group(0)[:80]!r}")
        for host in re.findall(r"https?://([A-Za-z0-9._-]+)", codigo):
            if host.lower() not in HOSTS_PERMITIDOS:
                delitos.append(f"{_rel(p)}: host externo {host!r}")
        for patron, que in red:
            m = patron.search(codigo)
            if m:
                delitos.append(f"{_rel(p)}: {que} — el prototipo se promete "
                               "«cero llamadas de red»")
    assert not delitos, (
        "prototipos de la landing que dependen de algo de afuera:\n  "
        + "\n  ".join(sorted(set(delitos)))
    )


def test_l22b_los_prototipos_no_nombran_a_un_cliente_del_registro():
    """L22b. El plano de ejemplo tampoco puede sonar a un cliente adentro del `.html`.

    Mismo criterio que L05 sobre el frontend, aplicado a los entregables. Con
    una diferencia declarada: **``MercaFresco`` queda fuera de la lista acá**.
    `copy.md` §13 lo propone como el nombre del supermercado inventado y el
    dueño de la fase lo ratificó, así que en estos archivos es ficción
    aprobada. Sigue siendo una observación —el mismo nombre identifica a un
    cliente en las capturas de la consola del operador
    (`features/tendencia/outputs/`)— y por eso E, que es la opción que se
    porta, no lo escribe en ningún lado: rotula «Supermercado de ejemplo».
    Lo que no se negocia es el resto del registro.
    """
    prototipos = _prototipos_entregados()
    if not prototipos:
        pytest.skip("HUECO: no hay prototipos en features/landing/outputs/.")
    lista = [(pat, quien) for pat, quien in CLIENTES_REALES
             if "mercafresco" not in pat.pattern.lower()]
    delitos = [
        f"{_rel(p)}:~{_codigo(p).count(chr(10), 0, m.start()) + 1}: {quien} → {m.group(0)!r}"
        for p in prototipos
        for pat, quien in lista
        for m in [pat.search(_codigo(p))] if m
    ]
    assert not delitos, (
        "nombres del registro de producción en un entregable de la landing:\n  "
        + "\n  ".join(delitos)
    )


# ── L23 ─────────────────────────────────────────────────────────────────────

# Las dos licencias que la ronda E se tomó sobre el copy, y ninguna más.
LICENCIAS_DE_COPY = {_normalizar(TITULAR_E), _normalizar(SUBTITULO_E)}

# Dónde vive un texto que la persona lee como TÍTULO o como PROMESA. El
# cuerpo de las tarjetas no se audita acá: son párrafos largos, se cortan
# distinto en JSX y su fidelidad se mira a ojo. Los títulos, no: son cortos,
# son los que la gente recuerda, y son los que se inventan solos.
_TITULARES = [
    (re.compile(r"<h2[^>]*>(.*?)</h2>", re.S | re.I), "un <h2>"),
    (re.compile(r"<h3[^>]*>(.*?)</h3>", re.S | re.I), "un <h3>"),
    (re.compile(r"""<(?:a|span|p|div)[^>]*class[Nn]ame?\s*=\s*[{"'][^"'}]*"""
                r"""(?:hook|gancho|conector|eyebrow|sec__num|cejilla)[^"'}]*["'}][^>]*>(.*?)</\w+>""",
                re.S), "un conector o cejilla"),
]


def test_l23_los_titulos_y_los_conectores_no_inventan_copy():
    """L23. Los conectores nombran el título literal de la sección siguiente.

    El recurso que E toma de C —una tarjeta entre secciones con el número y
    el título de la que viene— es el lugar donde el copy se inventa solo. Es
    una tentación real y honesta: el conector queda mejor con un gancho
    («Y ahora, lo que de verdad importa»), y nadie lo va a revisar contra el
    documento. Pero `copy.md` es la fuente única —«si un texto no entra, se
    pide el recorte en copy.md; no se reescribe en el .tsx»— y una promesa
    escrita en un conector es una promesa igual: la lee un cliente, y no pasó
    por la regla de §14 («Lo que NO prometemos»).

    Se comparan los TÍTULOS y los conectores contra el copy aprobado, con dos
    licencias declaradas: el H1 nuevo y el subtítulo que trae E.
    """
    archivos = _exigir_componentes()
    copy = _copy()
    delitos: list[str] = []
    mirados = 0
    for p in sorted(archivos):
        codigo = _codigo(p)
        for patron, que in _TITULARES:
            for m in patron.finditer(codigo):
                texto = _normalizar(m.group(1))
                # «01 / LO QUE HACE» → «LO QUE HACE»: el número de sección y
                # la versalita son tipografía, no copy.
                texto = re.sub(r"^\d{1,2}\s*[/·—–|-]\s*", "", texto).strip()
                if len(texto) < 4:              # «01», «→», un ícono suelto
                    continue
                mirados += 1
                if texto in LICENCIAS_DE_COPY or texto.lower() in copy.lower():
                    continue
                linea = codigo.count("\n", 0, m.start()) + 1
                delitos.append(f"{_rel(p)}:~{linea}: {que} dice {texto!r}")
    if not mirados:
        pytest.skip(
            "HUECO: no se encontró ningún título ni conector legible en el "
            "JSX de la landing (los textos pueden estar saliendo de una "
            "constante). Esta prueba lee el texto escrito en el JSX."
        )
    assert not delitos, (
        f"textos que no están en {_rel(COPY_MD)}:\n  " + "\n  ".join(delitos)
        + "\n\nEl copy tiene una sola fuente. Si el texto hace falta, se "
          "agrega allá y se copia acá; las únicas licencias de esta ronda son "
          f"el H1 {TITULAR_E!r} y el subtítulo que baja del titular viejo."
    )


# ── L24 ─────────────────────────────────────────────────────────────────────

def test_l24_la_barra_de_progreso_no_le_habla_al_lector_de_pantalla():
    """L24. Una barra de progreso de scroll es decorado, y tiene que decirlo.

    La barra que cruza la barra superior mide cuánto de la página bajaste. No
    es una tarea que avanza, no es una carga, no es información que alguien
    necesite oír: es una ayuda visual. Si se deja expuesta al árbol de
    accesibilidad, un lector de pantalla anuncia un `progressbar` sin nombre
    ni valor; si además alguien le pone `aria-live` —que es el reflejo cuando
    un número cambia—, **la barra habla en cada cuadro del scroll** y vuelve
    la página inusable con lector.

    Dos salidas correctas y ninguna más: `aria-hidden="true"` (lo que hace E)
    o un `role="progressbar"` con su `aria-valuenow`. Nunca `aria-live`.
    """
    archivos = _exigir_componentes()
    etiquetas: list[tuple[Path, str]] = []
    for p in sorted(archivos):
        codigo = _codigo(p)
        for m in re.finditer(r"<\w+[^>]*>", codigo):
            t = m.group(0)
            if re.search(r"""(?:class[Nn]ame?|id)\s*=\s*[{"'][^"'}]*"""
                         r"""(?:prog(?:reso|ress)?|barra-?scroll|scroll-?bar)""", t):
                etiquetas.append((p, t))
    if not etiquetas:
        pytest.skip(
            "HUECO: la landing todavía no tiene barra de progreso de scroll "
            "(la agrega el vestido E, `.rail__prog` / `#prog`)."
        )
    plano = " ".join(t for _, t in etiquetas)
    hablador = [f"{_rel(p)}: {t[:90]}" for p, t in etiquetas
                if re.search(r"aria-live", t)]
    assert not hablador, (
        "la barra de progreso del scroll lleva `aria-live`: con lector de "
        "pantalla anuncia el porcentaje en cada cuadro mientras la persona "
        "baja.\n  " + "\n  ".join(hablador)
    )
    assert re.search(r"""aria-hidden\s*=\s*[{"']?\s*(?:true|\{true\})""", plano) or \
        re.search(r"""role\s*=\s*[{"']progressbar""", plano), (
        "la barra de progreso del scroll queda expuesta al árbol de "
        "accesibilidad sin ser nada:\n  "
        + "\n  ".join(f"{_rel(p)}: {t[:90]}" for p, t in etiquetas)
        + "\n\nO `aria-hidden=\"true\"` (es decorado, que es lo que hace E) o "
          "`role=\"progressbar\"` con `aria-valuenow`."
    )


# ── L25 ─────────────────────────────────────────────────────────────────────

# El microcopy de `copy.md` §11.1 para el control del 3D. Los tres textos
# tienen que existir: sin el de «cargando», el botón se queda mudo los
# segundos que tarda el chunk en bajar y la persona lo toca dos veces.
MICROCOPY_3D = ["Ver en 3D", "Volver al plano"]

# Éste es condicional, y con motivo: hace falta cuando el 3D es un chunk que
# BAJA (`lazy(() => import("./Vista3D"))`, que es como está hoy). Si el port
# adopta la solución de E —una sola proyección con un parámetro animado, sin
# motor y sin descarga— el botón cambia al instante y anunciar «Cargando…»
# sería mentir sobre una espera que no existe.
MICROCOPY_3D_PEREZOSO = "Cargando la vista 3D"


def test_l25_ver_en_3d_existe_y_sigue_siendo_un_chunk_aparte():
    """L25. El botón del 3D es el único permiso que tiene three.js para entrar.

    L14 y L17 vigilan el grafo; esto vigila el botón, que es la otra mitad
    del mismo guardrail. Tres cosas:

    1. **El control existe y se llama como dice el copy** (§11.1: `Ver en 3D`,
       `Volver al plano`, `Cargando la vista 3D…`).
    2. **El archivo que lo pinta no importa ``three`` de forma estática.** Si
       lo hiciera, el botón sería decorativo: el motor ya bajó con la página.
    3. **Si algún archivo de la landing toca ``three``, alguien lo carga con
       ``import()``.** E resuelve el 3D sin motor —mueve un parámetro de la
       proyección—, y eso también está bien: entonces no hay ``three`` en
       ninguna parte y esta condición se cumple sola. Lo que no puede pasar es
       el punto medio: importar el motor y no partir el chunk.
    """
    archivos = _exigir_componentes()
    textos = {p: _codigo(p) for p in sorted(archivos)}
    todo = _normalizar("\n".join(textos.values()))

    # Se busca en el CÓDIGO, no en el texto renderizado: el rótulo del botón
    # sale de una expresión (`{cargando ? … : en3d ? … : …}`) y `_normalizar`
    # se come las llaves justamente porque adentro suele haber código.
    crudo = "\n".join(textos.values())
    def _dice(t: str) -> bool:
        return t in crudo or _normalizar(t) in todo

    faltan = [t for t in MICROCOPY_3D if not _dice(t)]
    assert not faltan, (
        f"falta el microcopy del control 3D ({faltan}) — `copy.md` §11.1. El "
        "botón tiene que decir en qué vista estás y a cuál vas; «3D» a secas "
        "no dice ninguna de las dos."
    )

    # Si el 3D se BAJA, la espera se anuncia.
    baja_algo = any(_DINAMICO.search(c) or re.search(r"\blazy\s*\(", c)
                    for c in textos.values())
    if baja_algo and not _dice(MICROCOPY_3D_PEREZOSO):
        raise AssertionError(
            f"la landing carga la vista 3D con `import()` y el botón no dice "
            f"{MICROCOPY_3D_PEREZOSO + '…'!r} mientras el chunk baja "
            "(`copy.md` §11.1): en 4G son segundos con el botón mudo, y la "
            "persona lo toca de nuevo."
        )

    pesado = re.compile(
        r"""^\s*import\s[^;]*?from\s*["'`](three|@react-three/[\w-]+)["'`]""", re.M
    )
    duenos = [p for p, c in textos.items() if "Ver en 3D" in c]
    culpables = [f"{_rel(p)}: {pesado.search(c).group(0).strip()[:70]!r}"
                 for p, c in textos.items() if p in duenos and pesado.search(c)]
    assert not culpables, (
        "el archivo que pinta el botón «Ver en 3D» importa el motor 3D de "
        "forma estática, así que el motor baja con la página y el botón no "
        "ahorra nada:\n  " + "\n  ".join(culpables)
    )

    con_three = [p for p, c in textos.items() if pesado.search(c)]
    if con_three:
        dinamicos = {
            _resolver_import(p, espec)
            for p in _paginas_de_la_landing()
            for espec in _DINAMICO.findall(_codigo(p))
        }
        assert set(con_three) & dinamicos, (
            f"{[_rel(p) for p in con_three]} importa three.js y nadie lo carga "
            "con `import()`: el chunk no se parte y `/` —que es pública— baja "
            "el motor entero antes de pintar el titular"
        )


# ── L26 ─────────────────────────────────────────────────────────────────────

_CLAVE_ESCENA = re.compile(r"""["'`]([A-ZÁÉÍÓÚÑ]{4,10})/([A-Z]{2,4}-\d{1,2}(?:·[A-Z])?)["'`]""")


def test_l26_las_escenas_de_la_camara_apuntan_a_muebles_que_existen():
    """L26. Un encuadre que apunta a un mueble que no existe no rompe: no pasa nada.

    El mapa de escenas de E (`ESC`) ancla seis de los nueve encuadres a un
    mueble por su clave —`CENTRO/GON-04·A`, `CENTRO/PUN-01`, `CENTRO/CRS-01`—
    y las capas de prueba se posicionan sobre ese mismo mueble. Si al portar
    a React una clave se escribe mal —`GON-04·A` con guion normal en vez de
    `·`, `PUN-1` en vez de `PUN-01`, la pieza renombrada en `datos.ts` y el
    mapa sin tocar— **no hay error en consola**: el lookup devuelve
    `undefined`, la cámara se queda donde estaba y la ficha del contrato
    aparece flotando sobre el piso vacío. Es un defecto que se ve sólo si
    alguien mira esa sección en ese ancho de pantalla, y por eso sobrevive.

    Se comprueba lo único que se puede comprobar sin navegador: que el código
    del mueble que nombra la escena esté escrito en algún lado de los datos
    sembrados.
    """
    archivos = _paginas_de_la_landing()
    if not archivos:
        pytest.skip("HUECO: no hay archivos de landing.")
    codigos = {p: _codigo(p) for p in sorted(archivos)}
    todo = "\n".join(codigos.values())

    claves = [(p, m) for p, c in codigos.items() for m in _CLAVE_ESCENA.finditer(c)]
    if not claves:
        pytest.skip(
            "HUECO: la landing no usa claves `SEDE/CODIGO` para anclar los "
            "encuadres de la cámara (la opción E las trae en su mapa `ESC`). "
            "Si el port ancla las escenas de otra forma, esta prueba no "
            "aplica y hay que escribir la equivalente."
        )

    # Los códigos que de verdad existen: cualquier `code: "GON-04·A"` o
    # `"GON-04·A"` suelto en los datos sembrados, y las sedes declaradas.
    codigos_existentes = set(re.findall(r"""["'`]([A-Z]{2,4}-\d{1,2}(?:·[A-Z])?)["'`]""", todo))
    sedes = set(re.findall(r"""["'`](CENTRO|PALMAS)["'`]""", todo))

    delitos = []
    for p, m in claves:
        sede, code = m.group(1), m.group(2)
        linea = codigos[p].count("\n", 0, m.start()) + 1
        if sedes and sede not in sedes:
            delitos.append(f"{_rel(p)}:~{linea}: la escena mira la sede {sede!r}, "
                           f"y las sedes sembradas son {sorted(sedes)}")
        if code not in codigos_existentes:
            delitos.append(f"{_rel(p)}:~{linea}: la escena mira el mueble "
                           f"{code!r}, que no está en los datos sembrados")
    assert not delitos, (
        "encuadres de la cámara anclados a un mueble que no existe (falla "
        "muda: la cámara no se mueve y la capa de prueba queda sobre el "
        "piso):\n  " + "\n  ".join(sorted(set(delitos)))
    )
