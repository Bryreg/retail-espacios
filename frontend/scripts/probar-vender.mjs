/**
 * Red team del modo Vender (Fase 10 · PR 2 — «Vender con la forma de E»).
 *   npm run probar:vender
 *
 * Vender la ve EL PROVEEDOR: el administrador gira el portátil y del otro lado
 * de la mesa hay alguien que no puede ver a los demás. Esa frase de la spec
 * (`features/diseno-interior/spec-vender.md` §0) no es una preferencia de
 * diseño: es la frontera del producto, y una frontera que sólo existe en la
 * cabeza de quien escribió la pantalla se cae en el primer refactor. Acá se
 * escribe.
 *
 * Cinco guardarraíles, y ninguno mira si algo «se ve lindo»:
 *
 *  1. **Confidencialidad, estática.** En lo que PINTA Vender no puede aparecer
 *     ni un ranking, ni «bajo tarifa», ni el canon, ni la plata del periodo, ni
 *     el vencimiento o el nombre de un proveedor ajeno. Lo prohibido se
 *     renderiza SÓLO bajo Supervisar, y el guarda tiene que estar en el sitio
 *     donde se pinta —no a tres mil líneas, en un `setState` que hoy deja el
 *     dato en `null`—. Además, la lista de componentes que Vender dibuja es
 *     cerrada: meter uno nuevo obliga a pasar por acá.
 *  2. **Un amarillo por pantalla.** Un `.btn-principal` en toda la superficie
 *     de Vender, y cero referencias a `--signal` fuera de esa clase. Si el
 *     amarillo se derrama deja de significar «acá está el trabajo».
 *  3. **La letra sale de la escala.** Los cuerpos del modo Vender salen de los
 *     pasos `--t-*` de `tema.css`. Un `fontSize: 12.5` escrito a mano es un
 *     paso que nadie declaró y que el modo oscuro, el apretón de ventana baja
 *     y la próxima pantalla no van a respetar.
 *  4. **El rótulo del plano no tiene ancho fijo.** Es el pendiente escrito del
 *     PR 1 (7,6 px de desborde con la mono) y la razón por la que D lo resolvió
 *     con halo y sin caja: un `rect` de ancho en px desborda con el código de
 *     ocho caracteres y pinta blanco en oscuro. Y el cuerpo tiene que ser
 *     constante EN PANTALLA (dividido por el acercamiento), que es lo que D
 *     mide con `getScreenCTM`.
 *  5. **`StoreView` y `Legend` no existen o no los importa nadie.** Código
 *     muerto anotado en `docs/ESTADO.md` «Pendientes para el PR 2».
 *
 * Y con `PROBAR_VENDER_URL=http://localhost:5210` (más `PROBAR_VENDER_TOKEN`)
 * corre además la parte que ningún grep hace: abre Vender de verdad con
 * Playwright, con datos sembrados que incluyen DOS proveedores, hace el grep de
 * confidencialidad sobre el `innerText` renderizado (y sobre los `<text>` del
 * SVG y los `aria-label`, que no están en `innerText`), y mide el contraste
 * WCAG de los pares principales en claro y en oscuro. Sin esas variables esa
 * parte se salta y se dice que se saltó: `npm run probar` no necesita
 * navegador ni servidor.
 *
 * Variables:
 *   PROBAR_VENDER_URL         servidor de dev con Vender servido (activa el navegador)
 *   PROBAR_VENDER_TOKEN       JWT de admin del cliente que se va a mirar
 *   PROBAR_VENDER_CLIENTE     slug del cliente (por defecto «galerias»)
 *   PROBAR_VENDER_SEDE        sede a elegir en el selector (la app abre en la primera)
 *   PROBAR_VENDER_AJENOS      los DOS proveedores sembrados, separados por coma
 *   PROBAR_VENDER_CHROME      ruta al Chromium (por defecto el de /opt/pw-browsers)
 *   PROBAR_VENDER_PLAYWRIGHT  ruta a playwright-core si no está en node_modules
 *   PROBAR_VENDER_PESO_BASE   gzip (de Node: `zlib.gzipSync`, nivel por defecto) del archivo
 *                             de Vender en la línea base; el visor 3D no puede sumarle más de 3 KB
 *   PROBAR_VENDER_PROVEEDOR   el proveedor del contrato del visor 3D (por defecto «Alpina»: con artes)
 *   PROBAR_VENDER_PROVEEDOR_2 otro proveedor con artes (por defecto «Postobón»)
 *   PROBAR_VENDER_CARAS       las caras del contrato del visor, como las rotula el plano
 *                             (por defecto «PUN-03,GON-02·B,NEV-01»; la primera, libre en el periodo)
 *   PROBAR_VENDER_EDITA       el renglón de Supervisar → Corregir cuyo «Editar contrato» se mide
 *                             (por ej. «PUN-03·EN1»); sin ella, el primero que lo tenga. Tiene
 *                             que haber uno: el pie en edición también va ≤ 200 px
 *   PROBAR_VENDER_REGIONES    imprime qué entra en la superficie de Vender y por qué
 *                             (útil cuando una falla parece venir de un archivo ajeno)
 *
 * LÍMITE DECLARADO. La parte estática lee texto, no un AST. Poda las líneas
 * guardadas por modo (`=== "supervisar"`, `!== "vender"`, y la rama falsa de
 * `modo === "vender" ? … : …`) y falla si no encuentra los anclajes que
 * necesita para recortar la superficie de Vender: un test que no puede afirmar
 * nada falla, no pasa.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { revisarAvisos } from "./casos/avisos-de-revision.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const hay = (p) => existsSync(join(raiz, p));

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const aviso = (t) => console.log("       aviso · " + t);

/* ── quitar comentarios ───────────────────────────────────────────────────
   Los comentarios de este repo explican el porqué y nombran a propósito lo
   que el código no hace («acá había un ranking», «la plata sólo para quien la
   maneja»). Fallar por la documentación que el propio PR pide escribir sería
   el peor test posible. Se quitan antes de buscar. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));

/* ── la superficie de Vender ──────────────────────────────────────────────
   Lo que PINTA el modo. Los tipos y el store quedan afuera a propósito: ahí
   `supplierName` es el nombre de un campo del modelo, no una letra en
   pantalla. Lo que entra son los archivos que el modo dibuja entero, más la
   parte de `DashboardView` a la que se llega desde la rama de Vender. */
const VISTA = "src/pages/DashboardView.tsx";
const ARCHIVOS_VENDER = [
  "src/components/Contrato/ModoVender.tsx",
  "src/components/Contrato/Contrato.tsx",
  "src/components/Libera/Libera.tsx",
  // El visor 3D que se abre ENCIMA de la ficha (la fila de cada cara), y la
  // prueba de producto que vive en la ficha. Se dibujan dentro de Vender: los
  // mira el proveedor, así que pasan por todas las guardas de este archivo.
  "src/components/Contrato/VisorDeVenta.tsx",
  "src/components/Contrato/sesionDeVenta.ts",
  // Rediseño de Vender (PR 1): las piezas de cada línea (cómo se vende, las
  // partes, el porcentaje, el precio, el 409), los campos nuevos (el proveedor
  // que se completa, los atajos de fecha, el cobro) y el ÚNICO módulo con que
  // Vender escribe. Los mira el proveedor: pasan por todas las guardas.
  "src/components/Contrato/LineaDelContrato.tsx",
  "src/components/Contrato/CamposDelContrato.tsx",
  "src/api/vender.ts",
  // «Editar contrato» (2026-10-22): la confirmación antes de guardar y
  // reenviar, que se abre ENCIMA de la ficha (la mira el proveedor), y las
  // cuentas puras de la edición (lo que cambia, los cortes vencidos, el
  // propio contrato que no está tomado contra sí mismo). Pasan por todas las
  // guardas de este archivo.
  "src/components/Contrato/ConfirmarEdicion.tsx",
  "src/utils/edicionDeContrato.ts",
];
/** Los estilos que bajan con el visor (`VisorDeVenta.tsx` los importa): la
 *  misma escala de letra y el mismo rótulo que `vender.css`. */
const CSS_VENDER = ["src/vender.css", "src/components/Contrato/visor.css"];

assert.ok(hay(VISTA), `no está ${VISTA}`);
const vistaCruda = leer(VISTA);
const vista = sinComentarios(vistaCruda);
const lineasVista = vista.split("\n");
const lineasCrudas = vistaCruda.split("\n");

/* ── la rama de Vender del ternario de modo ──────────────────────────────
   `… : modoEfectivo === "vender" ? ( …ACÁ… ) : ( …Supervisar… )`.
   Se recorta contando paréntesis desde la apertura. Si el ternario no está,
   el test no sabe qué es Vender y lo dice. */
function recorteVender() {
  const i = lineasVista.findIndex((l) => /===\s*"vender"\s*\?\s*\($/.test(l.trim()));
  if (i < 0) return null;
  let prof = 0, arranco = false;
  for (let j = i; j < lineasVista.length; j++) {
    let l = lineasVista[j].replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "");
    // La línea de apertura empieza cerrando la rama anterior (`) : modo === …`):
    // contar desde su primer carácter dejaría la profundidad en −1 y el recorte
    // terminaría en la misma línea en que empieza.
    if (j === i) l = l.slice(l.lastIndexOf("("));
    for (const c of l) {
      if (c === "(") { prof++; arranco = true; }
      else if (c === ")") {
        prof--;
        if (arranco && prof === 0) return { desde: i, hasta: j, texto: lineasVista.slice(i, j + 1).join("\n") };
      }
    }
  }
  return null;
}
const RAMA = recorteVender();

/* ── definiciones del archivo ─────────────────────────────────────────────
   Las de nivel 0 (`function X`, `const X`) van de su línea a la siguiente
   definición de nivel 0. Las de adentro del componente de pantalla (indentadas
   dos espacios: `tarjetaMapa`, `panelTarifas`, `panelCodigos`, `kpis`…) van de
   su línea a la siguiente sentencia de ese mismo nivel. Es recorte por
   indentación, no por AST: el archivo está formateado así y el test falla —no
   pasa— si deja de estarlo. */
function defsDe(lineas, re, reFin) {
  const marcas = [];
  lineas.forEach((l, i) => { const m = l.match(re); if (m) marcas.push({ nombre: m[1], i }); });
  const out = new Map();
  marcas.forEach(({ nombre, i }, k) => {
    let fin = lineas.length;
    for (let j = i + 1; j < lineas.length; j++) if (reFin.test(lineas[j])) { fin = j; break; }
    if (marcas[k + 1] && marcas[k + 1].i < fin) fin = marcas[k + 1].i;
    out.set(nombre, { desde: i, hasta: fin, texto: lineas.slice(i, fin).join("\n") });
  });
  return out;
}
const DEF_TOP = defsDe(
  lineasVista,
  /^(?:export\s+)?(?:default\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:default\s+)?(?:function|const|let|class|type|interface)\s+[A-Za-z_$]/,
);
const DEF_INT = defsDe(
  lineasVista,
  /^ {2}(?:const|function)\s+([A-Za-z_$][\w$]*)/,
  /^ {2}(?:const|function|return|if|useEffect|use[A-Z])/,
);

/* Identificadores de una región, ya podada por modo. */
const GUARDA_SUPERVISAR = /===\s*"supervisar"|!==\s*"vender"|isAdmin\s*\?\s*/;
function podar(texto) {
  return texto.split("\n").map((l) => {
    if (GUARDA_SUPERVISAR.test(l)) return "";
    // `modo === "vender" ? A : B` — B es la rama de Supervisar: se descarta.
    const m = l.match(/===\s*"vender"\s*\?/);
    if (m) {
      const tras = l.slice(m.index + m[0].length);
      const corte = tras.indexOf(":");
      return corte < 0 ? tras : tras.slice(0, corte);
    }
    return l;
  }).join("\n");
}
const identificadores = (t) => new Set((t.match(/\b[A-Za-z_$][\w$]*\b/g) || []));

/* Una misma línea puede caer en dos regiones (una definición y la de adentro
   que la contiene). Se reporta una vez: lo que importa es el sitio. */
function unicasPorSitio(hits) {
  const vistas = new Set(), out = [];
  for (const h of hits) { const k = (h.match(/^\S+?:\d+/) || [h])[0] + h.slice(h.indexOf(" — ")); if (!vistas.has(k)) { vistas.add(k); out.push(h); } }
  return out;
}

function superficieVender() {
  if (!RAMA) return null;
  const vistos = new Set();
  const regiones = [{ archivo: VISTA, desde: RAMA.desde, texto: podar(RAMA.texto) }];
  const cola = [...identificadores(regiones[0].texto)];
  while (cola.length) {
    const n = cola.pop();
    if (vistos.has(n)) continue;
    vistos.add(n);
    const d = DEF_TOP.get(n) ?? DEF_INT.get(n);
    if (!d) continue;
    const t = podar(d.texto);
    regiones.push({ archivo: VISTA, desde: d.desde, texto: t, nombre: n });
    for (const x of identificadores(t)) if (!vistos.has(x)) cola.push(x);
  }
  for (const f of ARCHIVOS_VENDER) {
    // Un archivo que falta no se saltea en silencio: lo hace FALLAR la prueba
    // «los archivos de Vender existen». Acá sólo se deja de leer para que el
    // resto del archivo pueda decir qué más está mal.
    if (!hay(f)) continue;
    regiones.push({ archivo: f, desde: 0, texto: podar(sinComentarios(leer(f))) });
  }
  return { regiones, alcanzados: vistos };
}
const SUP = superficieVender();
if (process.env.PROBAR_VENDER_REGIONES && SUP) {
  console.log("regiones de la superficie de Vender:\n  " + SUP.regiones.map((r) => `${r.archivo}${r.nombre ? "#" + r.nombre : ""}@${r.desde + 1}`).join("\n  "));
}

console.log("\nvender · la frontera (confidencialidad)");

prueba("los archivos de Vender existen: un renombre falla, no se saltea", () => {
  // Antes un archivo de la lista que no estaba (renombrado, movido) se
  // salteaba sin decir nada, y sus guardas dejaban de correr con todo verde.
  const faltan = [...ARCHIVOS_VENDER, ...CSS_VENDER].filter((f) => !hay(f));
  assert.deepEqual(faltan, [], `no están: ${faltan.join(", ")}. Si se movieron, actualizá ARCHIVOS_VENDER / CSS_VENDER`);
});

prueba("el test sabe qué es Vender: la rama del ternario de modo está donde dice", () => {
  assert.ok(RAMA, `no se encontró \`modoEfectivo === "vender" ? (\` en ${VISTA}. `
    + "Sin ese anclaje el recorte de la superficie de Vender es una adivinanza y "
    + "este archivo no puede afirmar nada: arreglá el anclaje o reescribí el recorte.");
  assert.ok(DEF_TOP.size > 20, `sólo ${DEF_TOP.size} definiciones de nivel 0: cambió el formato del archivo`);
  assert.ok(SUP.regiones.length > 5, "la superficie de Vender salió vacía");
});

/* Lo que no puede leerse del otro lado de la mesa. Dos clases:
   campos del modelo que traen dato ajeno, y texto que se pinta. */
const CAMPOS_AJENOS = [
  ["supplierName", "el nombre del proveedor que ocupa el espacio"],
  ["supplierEmail", "el correo del proveedor ajeno"],
  ["brandName", "la marca del proveedor ajeno"],
  ["brandCategory", "la categoría de marca del proveedor ajeno"],
  ["negotiatedValue", "el canon pactado con otro"],
];
const TEXTOS_PROHIBIDOS = [
  [/ranking|los que m[áa]s pagan|qui[ée]n paga/i, "ranking de proveedores"],
  [/bajo (?:la )?tarifa/i, "quién está bajo tarifa"],
  // Cuánto se aparta un precio de la tarifa de referencia («38 % bajo la
  // referencia», «por debajo de la tarifa», «12 % menos que la tarifa»): es
  // información de la negociación de la casa, y Vender lo ve el proveedor.
  // (La tarifa sola, sin comparar, sí se ve: «tarifa $ 800.000 al mes».)
  [/(?:\bbajo|debajo|encima|\bsobre|\bcontra|menos que|m[áa]s que|m[áa]s barat\w*|m[áa]s car\w*)\s+(?:de\s+|que\s+)?(?:la\s+|el\s+)?(?:referencia|tarifa|precio de lista)|%\s*(?:menos|m[áa]s)\b|descuento (?:sobre|de) (?:la\s+)?(?:tarifa|referencia)/i,
    "cuánto se aparta el precio de la tarifa de referencia"],
  [/canon/i, "el canon de la sede"],
  [/vencid|por vencer|vence (?:en|dentro)/i, "el vencimiento de un contrato ajeno"],
  [/facturaci[óo]n|recaudo|ingresos del periodo|plata del periodo/i, "la plata del periodo"],
];

/* Un campo del modelo no es una fuga por estar nombrado: `facesOf` lo copia,
   `kpis` lo suma y `Contrato` lo ESCRIBE con el proveedor que está sentado
   enfrente. La fuga es cuando el valor sale a la PANTALLA. Tres formas, y las
   tres se buscan: interpolado en una plantilla, con un texto de respaldo
   (`x || "Sin proveedor"`, que es una cadena para leer), o metido como hijo de
   JSX. Las claves de objeto (`supplierName:`) quedan fuera a propósito: eso es
   construir el dato, no pintarlo. */
function fugasDeCampo(linea, campo) {
  const sinClave = linea.replace(new RegExp(`\\b${campo}\\s*:`, "g"), " ");
  const out = [];
  if (new RegExp(`\\$\\{[^}]*\\b${campo}\\b`).test(sinClave)) out.push("interpolado en una plantilla");
  if (new RegExp(`\\b${campo}\\b[^;]{0,40}(?:\\?\\?|\\|\\|)\\s*["'\`]`).test(sinClave)) out.push("con texto de respaldo: es una cadena para leer");
  if (/[<>]|\/>/.test(sinClave) && new RegExp(`\\{[^{}]*\\b${campo}\\b[^{}]*\\}`).test(sinClave)) out.push("como hijo de JSX");
  return out;
}

prueba("ningún campo de proveedor ajeno LLEGA A PANTALLA en Vender", () => {
  if (!SUP) throw new Error("sin superficie (ver la prueba del anclaje)");
  const hits = [];
  for (const r of SUP.regiones) {
    r.texto.split("\n").forEach((l, k) => {
      for (const [campo, que] of CAMPOS_AJENOS) {
        for (const como of fugasDeCampo(l, campo)) {
          hits.push(`${r.archivo}:${r.desde + k + 1}${r.nombre ? ` (${r.nombre})` : ""} — ${campo} ${como}; es ${que}\n           ${l.trim().slice(0, 130)}`);
        }
      }
    });
  }
  const u = unicasPorSitio(hits);
  assert.deepEqual(u, [], `\n         ${u.join("\n         ")}`);
});

prueba("ni un texto de ranking, canon, vencimiento ajeno o plata del periodo en Vender", () => {
  if (!SUP) throw new Error("sin superficie (ver la prueba del anclaje)");
  const hits = [];
  for (const r of SUP.regiones) {
    r.texto.split("\n").forEach((l0, k) => {
      let l = l0;
      // Los miembros de una unión de tipos (`| "vencido"`) son valores del
      // modelo, no letras: nunca se pintan.
      if (/^\s*\|\s*"/.test(l) || /^\s*type\s+\w+\s*=/.test(l)) return;
      // Comparar contra un valor del dominio (`phase === "vencido"`) no es
      // pintarlo: se quita antes de mirar qué cadenas quedan.
      l = l.replace(/[!=]==?\s*"[^"]*"/g, " ").replace(/"[^"]*"\s*[!=]==?/g, " ");
      // Sólo lo que se PINTA: literales de cadena y texto suelto de JSX.
      const cadenas = [...l.matchAll(/"([^"]{2,})"|'([^']{2,})'|`([^`]{2,})`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
      const jsx = l.replace(/<[^>]*>/g, " ").replace(/[{}]/g, " ");
      for (const [re, que] of TEXTOS_PROHIBIDOS) {
        const donde = cadenas.find((c) => re.test(c)) ?? (re.test(jsx) ? jsx.trim() : null);
        if (donde) hits.push(`${r.archivo}:${r.desde + k + 1}${r.nombre ? ` (${r.nombre})` : ""} — ${que}\n           «${donde.trim().slice(0, 110)}»`);
      }
    });
  }
  const u = unicasPorSitio(hits);
  assert.deepEqual(u, [], `\n         ${u.join("\n         ")}`);
});

/* La lista de componentes que Vender dibuja es CERRADA. No es burocracia: es la
   única manera de que meter en la rama de Vender un panel escrito para
   Supervisar cueste una línea de este archivo y una lectura, en vez de pasar
   sin que nadie lo mire. */
const COMPONENTES_VENDER = new Set([
  // La rama de Vender de `DashboardView`.
  "ModoVender", "Libera", "Card", "CardHeader", "IsoMap", "MapLegend",
  "ChipEspacio", "SeasonPicker", "Fragment", "Search", "X", "EmptyDashboard",
  "CancelarContrato",
  // La ficha (`ModoVender.tsx`): sus piezas, los íconos y el aviso de a quién
  // se le escribe (el personal de la sede, no otro proveedor).
  "Panel", "Fila", "NoComercializable", "Cerrado", "Ficha", "NotifyPreview",
  "Box", "Lock", "Check", "AlertTriangle", "Loader2",
  // Rediseño de Vender (PR 1): el ícono de la tarjeta y los de cada línea y
  // campo (lucide, de la hoja de piezas aprobada), las piezas de la línea
  // —cómo se vende, las partes para elegir, el porcentaje con lo que queda,
  // «Total | Al mes», el 409, la oferta de cambiar cómo se vende— y los
  // campos —el proveedor que completa UN nombre, los atajos de fecha, el
  // cobro—. Y `Avisos` (a quién se le escribió: el personal de la sede).
  "FilePenLine", "Square", "Columns3", "Rows3", "Percent", "Building2", "BadgeCheck", "Calendar", "Tag",
  "Pencil", "Hourglass", "Mail", "StickyNote", "Receipt", "RotateCcw", "TriangleAlert",
  "IconoDeLinea", "FormasDeLaLinea", "ElegirPartes", "Porcentaje", "PrecioDeLinea",
  "RechazoDeLinea", "CampoProveedor", "AtajosDeFecha", "ComoSeCobra", "Avisos",
  // Lo que rodea al visor 3D: el límite de errores, la espera y el aviso.
  // «Aire y pines» (después del PR 3): el contrato en tres bloques numerados
  // (`Bloque`: un número, un título y lo suyo, sin datos propios), la pista
  // punteada de «Sumar otro espacio» (`Plus`), lo que falta en el pie
  // (`CircleAlert`) y el chevron de la fila plegable del correo y la nota.
  "Bloque", "Plus", "CircleAlert", "ChevronDown",
  // «Editar contrato» (2026-10-22): la confirmación (`ConfirmarEdicion`: a
  // quiénes se reenvía —comercial y montaje por su rol, el proveedor con SU
  // correo— y lo que cambia de ESTE contrato; nada de la nota ni de otros) y
  // sus íconos: la flecha de «Qué cambia» (`ArrowRight`), el aviso del
  // reemplazo (`FileWarning`), el de los cortes vencidos (`CalendarClock`),
  // «Qué cambia» (`GitCompareArrows`), «Guardar cambios y reenviar» (`Send`),
  // los tres destinatarios (`Users`, `Wrench`; `Building2` ya estaba) y
  // «Volver a Supervisar» (`ArrowLeft`).
  "ConfirmarEdicion", "ArrowRight", "ArrowLeft", "FileWarning", "CalendarClock", "GitCompareArrows", "Send",
  "Users", "Wrench",
  "LimiteDelVisor", "Suspense", "AbriendoEl3D", "FallaDelVisor", "VisorDeVenta",
  // El visor (`VisorDeVenta.tsx`). Las piezas del editor que usa —la escena,
  // el panel «Cómo va», el HUD y la ficha del envase— se leen abajo
  // (PIEZAS_DEL_VISOR) con las mismas guardas que el resto de Vender.
  "Canvas", "CanvasErrorBoundary", "Scene", "Lienzo", "HudQueSeEsconde", "PanelDePrueba",
  "EditorDeFicha", "SubirProducto", "Upload",
  // Íconos del visor: «Ocultar ›» del cajón y los dos botones de la lámina
  // («Bajar la propuesta», «Usarla como planometría»). Sólo dibujan un ícono.
  "ChevronRight", "Download", "FileCheck",
  // `<RellenoNeutro.Provider>` alrededor de la escena del visor: sólo pone en
  // grises la mercadería de los demás (`luzDeVenta.ts`). No pinta nada.
  "RellenoNeutro",
]);
/** `<X` sólo cuenta como etiqueta JSX si lo que hay delante NO es parte de un
 *  identificador: `Record<DisplayStatus>` y `Partial<FaceData>` son genéricos
 *  de TypeScript, no componentes. */
// También `<X.Provider>`: un contexto alrededor de algo es un componente más.
const etiquetasJsx = (texto) => new Set([...texto.matchAll(/(?:^|[^\w>])<\s*([A-Z][\w$]*)(?=[\s/>.])/gm)].map((m) => m[1]));
prueba("Vender no dibuja ningún componente fuera de la lista revisada", () => {
  if (!RAMA) throw new Error("sin rama de Vender");
  // La rama de `DashboardView` Y cada archivo de Vender: un componente nuevo
  // dibujado desde la ficha (o desde el visor) no pasaba por esta lista.
  const fuentes = [["la rama de Vender", podar(RAMA.texto)],
    ...ARCHIVOS_VENDER.filter(hay).map((f) => [f, sinComentarios(leer(f))])];
  const nuevos = [];
  for (const [donde, texto] of fuentes) {
    for (const c of etiquetasJsx(texto)) if (!COMPONENTES_VENDER.has(c)) nuevos.push(`${c} (${donde})`);
  }
  assert.deepEqual(nuevos, [], `componentes nuevos en Vender, sin revisar la frontera: ${nuevos.join(", ")}. `
    + "Si de verdad van, agregalos a COMPONENTES_VENDER después de leer qué pintan.");
});

/* El guarda tiene que estar donde se pinta. `FixturePopover` hoy no sale en
   Vender porque `selectFixture` deja `anchor` en null en ese modo — un guarda
   de DATO, a tres mil líneas del sitio del render. El día que alguien quiera
   el globito en Vender «para ver el código», el nombre del proveedor ajeno
   sale con él y nadie se entera. */
prueba("el guarda de modo está en el sitio del render, no en un setState lejano", () => {
  if (!SUP) throw new Error("sin superficie");
  const flojos = [];
  for (const nombre of ["FixturePopover", "FixtureDetailCard", "AtencionSection", "SpacesTable", "SupplierRow", "SupplierLine", "Cifra"]) {
    for (const r of SUP.regiones) {
      r.texto.split("\n").forEach((l, k) => {
        if (new RegExp(`<\\s*${nombre}\\b`).test(l)) flojos.push(`${nombre} en ${r.archivo}:${r.desde + k + 1}${r.nombre ? ` (${r.nombre})` : ""}`);
      });
    }
  }
  assert.deepEqual([...new Set(flojos)], [], "componentes de Supervisar alcanzables desde Vender sin guarda de modo "
    + `en el sitio del render:\n         ${[...new Set(flojos)].join("\n         ")}`);
});

console.log("\nvender · el amarillo");

const CSS_SISTEMA = ["src/index.css", "src/tema.css"];
/* «Un amarillo por pantalla» es una regla sobre lo que se ve A LA VEZ, y eso
   sólo lo sabe el DOM (más abajo, con navegador). Estáticamente se comprueba lo
   que sí es comprobable: que ningún componente pinte dos, y que haya al menos
   uno. Dos botones en dos estados excluyentes del mismo archivo se reportan
   como aviso — pero cada uno diluye el «acá está el trabajo» del otro, así que
   quedan escritos. */
prueba("ningún componente de Vender pinta dos botones principales", () => {
  if (!SUP) throw new Error("sin superficie");
  const donde = [];
  for (const r of SUP.regiones) {
    r.texto.split("\n").forEach((l, k) => {
      if (/className\s*=\s*[{"'`][^"'`}]*\bbtn-principal\b/.test(l)) donde.push({ a: r.archivo, n: r.desde + k + 1 });
    });
  }
  const unicos = [...new Map(donde.map((d) => [`${d.a}:${d.n}`, d])).values()];
  assert.ok(unicos.length >= 1, "Vender no tiene botón principal: «Guardar contrato» es el amarillo de esta pantalla");
  if (unicos.length > 1) {
    aviso(`${unicos.length} botones principales en la superficie de Vender: ${unicos.map((d) => `${d.a}:${d.n}`).join(" · ")}. `
      + "Si son estados excluyentes no hay dos amarillos a la vez —lo confirma el conteo del DOM, más abajo— "
      + "pero sí hay dos acciones distintas pintadas con la señal que significa «acá está el trabajo».");
  }
  // Dos en el MISMO componente sí es siempre un error: se ven juntos.
  const porComponente = new Map();
  for (const f of [...new Set(unicos.map((d) => d.a))]) {
    const txt = sinComentarios(leer(f));
    const arranques = [...txt.matchAll(/^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_$][\w$]*)/gm)]
      .map((m) => ({ n: m[1], i: txt.slice(0, m.index).split("\n").length }));
    for (const d of unicos.filter((x) => x.a === f)) {
      const comp = [...arranques].reverse().find((a) => a.i <= d.n);
      const clave = `${f} · ${comp ? comp.n : "(nivel de archivo)"}`;
      porComponente.set(clave, (porComponente.get(clave) ?? 0) + 1);
    }
  }
  const dobles = [...porComponente].filter(([, n]) => n > 1).map(([k, n]) => `${k}: ${n}`);
  assert.deepEqual(dobles, [], `dos amarillos en el mismo componente: ${dobles.join(" · ")}`);
});

prueba("`--signal` no se usa fuera de `.btn-principal` en los archivos del modo", () => {
  if (!SUP) throw new Error("sin superficie");
  const hits = [];
  for (const r of SUP.regiones) {
    r.texto.split("\n").forEach((l, k) => {
      const m = l.match(/--(?:on-)?signal(?:-ink|-rgb|-borde)?\b/);
      if (m) hits.push(`${r.archivo}:${r.desde + k + 1} — ${m[0]}\n           ${l.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], `el amarillo se derramó fuera del botón principal:\n         ${hits.join("\n         ")}`);
});

console.log("\nvender · la escala de letra");

/* Los pasos declarados salen de `tema.css`: si el port mueve la escala, el
   test la sigue. No hay una lista de números escrita acá. */
const temaCss = hay("src/tema.css") ? leer("src/tema.css") : "";
const ESCALA = new Map();
for (const m of temaCss.matchAll(/--(t-[\w-]+)\s*:\s*([\d.]+)px/g)) ESCALA.set(Number(m[2]), "--" + m[1]);

const ARCHIVOS_LETRA = [VISTA, ...ARCHIVOS_VENDER, ...CSS_VENDER].filter(hay);
function literalesDeLetra() {
  const out = [];
  for (const f of ARCHIVOS_LETRA) {
    sinComentarios(leer(f)).split("\n").forEach((l, k) => {
      for (const m of l.matchAll(/fontSize\s*:\s*"?(\d+(?:\.\d+)?)(?:px)?"?/g)) out.push({ f, k, v: Number(m[1]), l });
      for (const m of l.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) out.push({ f, k, v: Number(m[1]), l });
      for (const m of l.matchAll(/fontSize=\{(\d+(?:\.\d+)?)\s*(?:\/\s*\w+)?\}/g)) out.push({ f, k, v: Number(m[1]), l });
    });
  }
  return out;
}
const LIT = literalesDeLetra();
/* Cuánto de lo que falta cae DENTRO de lo que Vender pinta: el resto es
   Supervisar, que es el PR 3 y no bloquea a nadie. */
const enSuperficie = (x) => {
  if (x.f !== VISTA) return true;
  return SUP ? SUP.regiones.some((r) => r.archivo === VISTA && x.k >= r.desde && x.k < r.desde + r.texto.split("\n").length) : true;
};
/* Se asevera sólo sobre lo que pinta Vender: los literales de Supervisar son
   del PR 3 (el aviso de abajo los cuenta aparte). */
const fuera = LIT.filter(enSuperficie).filter((x) => !ESCALA.has(x.v));
const dentro = LIT.filter(enSuperficie).filter((x) => ESCALA.has(x.v));

if (process.env.PROBAR_VENDER_REGIONES) {
  console.log("literales DENTRO de la superficie:\n  " + LIT.filter(enSuperficie).map((x) => `${x.f}:${x.k + 1} ${x.v}px  ${x.l.trim().slice(0, 70)}`).join("\n  "));
}
aviso(`cuerpos literales: ${LIT.length} en total · ${LIT.filter(enSuperficie).length} dentro de lo que pinta Vender `
  + `· ${LIT.length - LIT.filter(enSuperficie).length} sólo en Supervisar (PR 3)`);

prueba("cero cuerpos de letra fuera de la escala `--t-*` en Vender", () => {
  assert.ok(ESCALA.size >= 6, `la escala de tema.css tiene ${ESCALA.size} pasos: no se pudo leer`);
  const lista = fuera.map((x) => `${x.f}:${x.k + 1} — ${x.v}px  ${x.l.trim().slice(0, 90)}`);
  assert.equal(lista.length, 0, `${fuera.length} cuerpos inventados (pasos declarados: ${[...ESCALA.keys()].sort((a, b) => a - b).join(" · ")})`
    + `\n         ${lista.slice(0, 40).join("\n         ")}${fuera.length > 40 ? `\n         … y ${fuera.length - 40} más` : ""}`);
});

prueba("los cuerpos que SÍ caen en un paso están escritos con el token, no con el número", () => {
  const lista = dentro.map((x) => `${x.f}:${x.k + 1} — ${x.v}px = ${ESCALA.get(x.v)}`);
  assert.equal(lista.length, 0, `${dentro.length} números a mano que ya tienen nombre:\n         ${lista.slice(0, 25).join("\n         ")}`);
});

console.log("\nvender · el rótulo del plano");

prueba("el rótulo sobre el mueble no tiene caja de ancho fijo en px", () => {
  const iso = DEF_TOP.get("IsoMap");
  assert.ok(iso, "no se encontró la definición de IsoMap: cambió el nombre o el formato");
  const hits = [];
  const t = iso.texto;
  // Un `<rect>` en el plano NO es de por sí un problema: D usa uno transparente
  // como caja de impacto del rótulo (README §3). Molesta el que PINTA —una
  // cajita blanca detrás del código, que desborda y que en oscuro es una
  // mancha— o el que trae un ancho literal en px.
  for (const m of t.matchAll(/<\s*rect\b[\s\S]{0,400}?\/>/g)) {
    const r = m[0];
    const linea = t.slice(0, m.index).split("\n").length;
    const pinta = /fill\s*=\s*[{"']?(?!none|transparent)[^\s}"']+/.test(r);
    const anchoFijo = /width\s*=\s*[{"']?\s*(\d*\.?\d+)/.exec(r);
    if (pinta) hits.push(`${VISTA}:${iso.desde + linea} — <rect> con relleno en el plano: el rótulo de D no lleva caja, lleva halo (paint-order:stroke)`);
    if (anchoFijo && Number(anchoFijo[1]) > 0) hits.push(`${VISTA}:${iso.desde + linea} — <rect> con ancho literal ${anchoFijo[1]}px`);
  }
  if (/textLength\s*=/.test(t)) hits.push(`${VISTA} (IsoMap) — textLength fija el ancho del rótulo`);
  for (const f of [...CSS_VENDER, "src/index.css"].filter(hay)) {
    sinComentarios(leer(f)).split("\n").forEach((l, k) => {
      if (/rotulo|\.rot\b|--lbl/.test(l) && /\b(?:width|min-width|max-width)\s*:\s*\d+(?:\.\d+)?px/.test(l)) {
        hits.push(`${f}:${k + 1} — ancho fijo en px sobre el rótulo: ${l.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
});

prueba("el rótulo mide lo mismo en pantalla a todo acercamiento", () => {
  const iso = DEF_TOP.get("IsoMap");
  assert.ok(iso, "no se encontró IsoMap");
  // Dos maneras válidas, las dos de D: publicar `--lbl` (px / escala) en el
  // grupo de la escena, o escribir el cuerpo dividido por el acercamiento.
  const porToken = /--lbl/.test(iso.texto);
  const porDivision = iso.texto.split("\n").some((l) => /fontSize/.test(l) && /\/\s*[a-zA-Z]/.test(l));
  assert.ok(porToken || porDivision,
    "el cuerpo del rótulo no sale de `--lbl` ni está dividido por el acercamiento: crece y se encoge "
    + "con el zoom, que es justo lo que D resolvió (README §2.3)");
  if (porToken) {
    const css = ["src/vender.css", "src/index.css"].filter(hay).map(leer).join("\n");
    assert.ok(/font-size\s*:\s*var\(--lbl\)/.test(css),
      "`--lbl` se publica pero ningún `font-size: var(--lbl)` lo consume");
  }
});

console.log("\nvender · el visor 3D (encima de la ficha)");

/* El visor (`VisorDeVenta.tsx`) dibuja la tienda con la MISMA escena del
   editor. Esa escena sabe leer contratos, fotos de caras y la cámara del
   editor; el visor tiene que llegarle sin nada de eso. Estas guardas leen el
   CÓDIGO del visor: no alcanza con que no pinte un dato ajeno, no puede ni
   nombrarlo. */
const RUTA_VISOR = "src/components/Contrato/VisorDeVenta.tsx";
const RUTA_SESION = "src/components/Contrato/sesionDeVenta.ts";
const RUTA_MODO = "src/components/Contrato/ModoVender.tsx";
const codigo = (f) => (hay(f) ? sinComentarios(leer(f)) : "");
const visorCodigo = codigo(RUTA_VISOR);
const sesionCodigo = codigo(RUTA_SESION);
const modoCodigo = codigo(RUTA_MODO);

/** Lo que el visor no puede pedir: la lista de proveedores, el catálogo
 *  entero, las fotos de las caras (las marcas de los que ocupan los
 *  espacios), el alta de un arte con proveedor elegido de una lista. */
const LLAMADAS_AJENAS = [
  [/\bgetSuppliers\s*\(/, "getSuppliers( — la lista de todos los proveedores"],
  [/\bgetFaceImages\s*\(/, "getFaceImages( — las fotos de las caras de otros"],
  [/\blistarCatalogo\s*\(/, "listarCatalogo( — el catálogo entero (va `listarDelProveedor`)"],
  [/\bsubirArte\s*\(/, "subirArte( — el alta con proveedor de una lista (va `subirArteDelProveedor`)"],
  // Sólo `/suppliers/completar` (UN nombre: `api/vender.ts`). Cualquier otra
  // ruta de proveedores es la lista.
  [/["'`]\/suppliers(?!\/completar["'`])/, "'/suppliers' — la lista de proveedores"],
  [/face-images/, "'face-images' — las fotos de las caras de otros"],
];
/** Lo que el visor no puede escribir: el plano, el store, la cámara del
 *  Editor 3D, el pedido que cambia de pestaña (y desmonta Vender), la sede. */
const ESCRITURAS = [
  [/\bpedirEnfoque3D\b/, "pedirEnfoque3D — cambia de pestaña y desmonta Vender: se pierde el contrato"],
  [/\bsetCamera3D\b/, "setCamera3D — la cámara guardada del Editor 3D"],
  [/\bguardarVista3D\b/, "guardarVista3D — escribe el layout"],
  [/\bborrarVista3D\b/, "borrarVista3D — escribe el layout"],
  [/\bcommit\s*\(/, "commit( — escribe el plano"],
  [/\bsetFixtures\b/, "setFixtures — escribe el plano"],
  [/\bfixturesToStore\b/, "fixturesToStore — arma el plano para escribirlo"],
  [/\bitemsToStore\b/, "itemsToStore — arma el plano para escribirlo (utils/convertirPlano.ts)"],
  [/\.getState\s*\(\s*\)/, ".getState() — una lectura del store fuera de un selector"],
  [/\buseFixtureStore\s*\(\s*\)/, "useFixtureStore() sin selector — todo el store (y cada escritura redibuja)"],
  [/\bsetSede\s*\(/, "setSede( — vacía el contrato y remonta la ficha"],
];
const llamadasEn = (texto, lista) => {
  const out = [];
  texto.split("\n").forEach((l, k) => { for (const [re, que] of lista) if (re.test(l)) out.push(`:${k + 1} — ${que}`); });
  return out;
};

prueba("el visor no LEE datos comerciales: ni los nombra", () => {
  const PROHIBIDOS = /\b(supplierName|supplierEmail|brandName|brandCategory|negotiatedValue|startDate|endDate|observation|faceB)\b/;
  const hits = [];
  for (const [f, txt] of [[RUTA_VISOR, visorCodigo], [RUTA_SESION, sesionCodigo]]) {
    assert.ok(txt.length > 200, `no se pudo leer ${f}`);
    txt.split("\n").forEach((l, k) => { const m = l.match(PROHIBIDOS); if (m) hits.push(`${f}:${k + 1} — ${m[1]}`); });
  }
  assert.deepEqual(hits, [], `el visor nombra campos del contrato de otro (los muebles tienen que llegar por \`sinDatosComerciales\`):\n         ${hits.join("\n         ")}`);
});

prueba("Vender pide SÓLO lo del proveedor del contrato: ni proveedores, ni catálogo entero, ni fotos de caras", () => {
  const hits = [];
  for (const f of ARCHIVOS_VENDER.filter(hay)) for (const h of llamadasEn(codigo(f), LLAMADAS_AJENAS)) hits.push(f + h);
  assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  assert.match(visorCodigo, /\blistarDelProveedor\(/, "el visor no pide el catálogo por el nombre del proveedor");
});

prueba("Vender no escribe nada desde el visor: ni plano, ni store, ni cámara del editor, ni enfoque3D, ni sede", () => {
  const hits = [];
  for (const f of ARCHIVOS_VENDER.filter(hay)) for (const h of llamadasEn(codigo(f), ESCRITURAS)) hits.push(f + h);
  assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  // La única lectura del store en el visor: los muebles de la sede.
  const lecturas = [...visorCodigo.matchAll(/\buseFixtureStore\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(lecturas, ["selectFixtures"], `el visor lee del store: ${lecturas.join(", ")}`);
  assert.ok(!/useFixtureStore/.test(sesionCodigo), "la sesión de la prueba lee el store");
});

prueba("la escena del visor va en modo venta, con los muebles saneados y para alguien", () => {
  const escenas = visorCodigo.match(/<Scene\b/g) || [];
  assert.equal(escenas.length, 1, `el visor dibuja ${escenas.length} escenas`);
  const tag = (visorCodigo.match(/<Scene\b[^]*?\/>/) || [""])[0];
  for (const [re, que] of [
    [/\n\s*soloVenta\s*\n|\ssoloVenta(?:=\{true\})?[\s/]/, "`soloVenta` (sin fotos de caras, sin la cámara del editor, sin enfoque3D)"],
    [/\spresentationMode(?:=\{true\})?[\s/]/, "`presentationMode` (sin arrastre, sin paneles de slot ni insignias)"],
    [/\sselectedId=\{null\}/, "`selectedId={null}` (sin caja de selección ni gizmo)"],
    [/\sfixtures=\{SIN_UNIFICADOS\}/, "`fixtures={SIN_UNIFICADOS}` (ningún contrato llega a la escena)"],
    [/\splacedFixtures=\{muebles\}/, "`placedFixtures={muebles}` (los saneados)"],
  ]) assert.match(tag, re, `la escena del visor no lleva ${que}`);
  assert.match(visorCodigo, /const SIN_UNIFICADOS(?:\s*:\s*\[\])?\s*=\s*\[\s*\];/, "`SIN_UNIFICADOS` no es una constante vacía");
  assert.match(visorCodigo, /const muebles = useMemo\(\s*\(\) => sinRepisasVendidas\(sinDatosComerciales\(storeToFixtures\(unificados\)\), /,
    "los muebles del visor no salen de `sinRepisasVendidas(sinDatosComerciales(storeToFixtures(…)), …)`");
  assert.match(visorCodigo, /<Lienzo\b[^>]*\smuebles=\{muebles\}/, "el lienzo no recibe los muebles saneados");
  // `privadoPara` siempre definido: `undefined` es la pantalla de la dueña y
  // deja pasar las pruebas de todos (`privacidad.ts`).
  assert.match(visorCodigo, /const privadoPara: number \| null = /, "`privadoPara` puede quedar `undefined`");
  assert.match(visorCodigo, /privadoPara: number \| null;/, "el lienzo acepta un `privadoPara` indefinido");
});

prueba("el visor no le pasa la capa Distribución a la escena: nunca delante de un proveedor", () => {
  // La capa Distribución (participaciones de cara, §10.9) desnuda el mueble y
  // dibuja las zonas de cada proveedor con su porcentaje. Sólo la pasa el
  // Editor 3D, con su condición única; el visor de Vender lo mira un
  // proveedor y no la nombra ni lee el store de edición.
  const tag = (visorCodigo.match(/<Scene\b[^]*?\/>/) || [""])[0];
  assert.ok(tag.length > 50, "no se encontró la escena del visor");
  assert.ok(!/\bdistribucion\b/.test(tag), "el visor le pasa `distribucion` a la escena: saldrían el mueble desnudo y las zonas de otros proveedores");
  assert.ok(!/distribucionStore|ZonasDelMueble|DesnudoDelMueble|\bdistribucion=/.test(visorCodigo),
    "el visor lee el store de edición de Distribución o monta sus zonas");
});

prueba("Vender no baja el 3D al entrar: el visor entra SÓLO por el import perezoso", () => {
  const archivos = [RUTA_MODO, "src/components/Contrato/Contrato.tsx", RUTA_SESION,
    "src/components/Contrato/LineaDelContrato.tsx", "src/components/Contrato/CamposDelContrato.tsx", "src/api/vender.ts",
    "src/components/Contrato/Planometria.tsx", "src/components/Libera/Libera.tsx", VISTA];
  const hits = [];
  for (const f of archivos) {
    const txt = codigo(f);
    assert.ok(txt.length > 100, `no se pudo leer ${f}`);
    if (/from\s+["']three["']/.test(txt)) hits.push(`${f} — importa three`);
    if (/@react-three/.test(txt)) hits.push(`${f} — importa @react-three`);
    for (const m of txt.matchAll(/^\s*import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
      if (/StoreEditor3D\/|\.\/VisorDeVenta$/.test(m[3]) && !m[1]) hits.push(`${f} — \`import ${m[2].replace(/\s+/g, " ")} from "${m[3]}"\` no es \`import type\``);
    }
    for (const m of txt.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
      if (/StoreEditor3D|VisorDeVenta|three/.test(m[1])) hits.push(`${f} — \`import "${m[1]}"\``);
    }
  }
  assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  // La sesión usa `normalizarProveedor` de `utils/proveedor.ts`, que no
  // importa nada: importada de `privacidad.ts` arrastraba medio 3D al paquete.
  assert.ok(hay("src/utils/proveedor.ts") && !/^\s*import\b/m.test(codigo("src/utils/proveedor.ts")),
    "`utils/proveedor.ts` importa algo: entra al paquete de Vender");
  assert.match(modoCodigo, /const VisorDeVenta = lazy\(\(\) => import\("\.\/VisorDeVenta"\)\);/, "el visor no es perezoso");
  // Cada `<VisorDeVenta` adentro de un `<Suspense` adentro de un `<LimiteDelVisor`.
  const usos = [...modoCodigo.matchAll(/<VisorDeVenta\b/g)].map((m) => m.index);
  assert.ok(usos.length >= 1, "ModoVender no dibuja el visor");
  for (const i of usos) {
    const antes = modoCodigo.slice(0, i);
    const s = antes.lastIndexOf("<Suspense"), l = antes.lastIndexOf("<LimiteDelVisor");
    assert.ok(s > l && l >= 0, "`<VisorDeVenta` no está adentro de `<Suspense` adentro de `<LimiteDelVisor`");
    assert.ok(!antes.slice(s).includes("</Suspense>") && !antes.slice(l).includes("</LimiteDelVisor>"),
      "`<VisorDeVenta` quedó afuera de su `<Suspense` o de su `<LimiteDelVisor`");
  }
  assert.match(modoCodigo, /class LimiteDelVisor extends Component[^]*?static getDerivedStateFromError\(/,
    "`LimiteDelVisor` no ataja el error: un archivo que no baja desmonta la app y se pierde el contrato");
});

prueba("el visor: sin amarillo propio, capa modal, y la letra de la escala", () => {
  assert.ok(!/btn-principal/.test(visorCodigo), "el visor pinta un `.btn-principal`: con la ficha atrás son dos amarillos");
  assert.match(visorCodigo, /createPortal\(\s*<div\b[^>]*className="visor-venta"[^>]*\sdata-capa-modal\b/,
    "la raíz del visor no marca `data-capa-modal`");
  assert.match(visorCodigo, /\buseModalAbierto\(\)/, "el visor no apaga el amarillo de la ficha de atrás");
  assert.match(visorCodigo, /const app = document\.getElementById\("root"\);\s*app\?\.setAttribute\("inert", ""\);/, "la app de atrás sigue recibiendo el Tab");
  assert.match(visorCodigo, /return \(\) => app\?\.removeAttribute\("inert"\);/, "al cerrar, la app de atrás queda `inert`");
  const tw = [...visorCodigo.matchAll(/\btext-\[\d[^\]]*\]|\btext-(?:xs|sm|base|lg|xl)\b/g)].map((m) => m[0]);
  assert.deepEqual(tw, [], `cuerpos de Tailwind en el visor (van \`var(--t-*)\` en visor.css): ${tw.join(", ")}`);
});

prueba("el «Ver en 3D» va en la cabecera del contrato, no en cada fila, y el choque a todo el ancho", () => {
  // En la fila le comía ~50 px a la descripción: a 1366 la góndola desbordaba
  // la tarjeta y el choque salía con una palabra por renglón (la crítica).
  const fila = (modoCodigo.match(/function Fila\([^]*?\n\}\n/) || [""])[0];
  assert.ok(fila.length > 500, "no se encontró la fila del contrato");
  assert.ok(!/data-ver-3d|ver3d/.test(fila), "la fila del contrato volvió a llevar el botón del 3D");
  assert.equal((modoCodigo.match(/\sdata-ver-3d\b/g) || []).length, 1, "tiene que haber UN «Ver en 3D»");
  assert.match(modoCodigo, /<Panel\s+pie=\{pie\}\s+derecha=\{[^]*?className="ver3d"[^]*?<span className="vpill">\{c\.reservando \? "Reservando" : "Sin firmar"\}<\/span>/,
    "el «Ver en 3D» no está en la cabecera del panel, junto a «Sin firmar»");
  // La tarjeta lleva su ícono (FilePenLine, 16 px, trazo 1,75, en --ink-2),
  // y el pie con el total va AFUERA del cuerpo que rueda.
  assert.match(modoCodigo, /<FilePenLine size=\{16\} strokeWidth=\{1\.75\} color="var\(--ink-2\)"/, "la tarjeta del contrato no lleva su ícono");
  const panel = (modoCodigo.match(/function Panel\([^]*?\n\}\n/) || [""])[0];
  assert.match(panel, /\{children\}\s*\{pie\}\s*<\/section>/, "el pie del contrato no queda afuera del cuerpo que rueda");
  // El choque, fuera de la columna del tipo y a todo el ancho.
  assert.ok(!/className="choque"/.test(fila), "el choque volvió a la columna angosta del tipo");
  assert.match(fila, /className="aviso choque"/, "el choque no es un aviso de la fila");
  assert.match(leer("src/vender.css"), /\.eitem > \.aviso \{\s*flex: 0 0 100%;/, "el aviso de la fila no ocupa todo el ancho");
  // Las caras que chocan no van al visor: no se le muestra al proveedor un
  // espacio que no se le puede vender.
  assert.match(modoCodigo, /\.filter\(\(l\) => l\.disponibilidad === "libre" && l\.choqueServidor\.length === 0\)/,
    "el visor recibe caras que ya están vendidas en el periodo");
});

prueba("la lámina del visor: del proveedor de los artes, sin período ni valor, y sólo para bajarla (nunca al contrato)", () => {
  const datos = (visorCodigo.match(/const datos: DatosPropuesta = \{[^]*?\n\s*\};/) || [""])[0];
  assert.ok(datos, "el visor no arma el pie de la lámina");
  for (const [re, que] of [
    [/\bvalorMensual: null,/, "sin valor: el visor no conoce el canon, y no se inventa"],
    [/\bdesde: "",/, "sin «desde»: lo que se propone no está acordado"],
    [/\bhasta: "",/, "sin «hasta»"],
    [/\bproveedor: arte\.proveedor,/, "el proveedor sale del arte que se mira, no del contrato ni de otro"],
    [/\bmueble: cara\.tipo,/, "el mueble por su tipo, no por su rótulo (texto libre)"],
  ]) assert.match(datos, re, `el pie de la lámina: ${que}`);
  assert.equal((visorCodigo.match(/\bcomponerPropuesta\(/g) || []).length, 1, "el visor compone la lámina en más de un lugar");
  // La lámina se BAJA para el proveedor y nada más: adjuntarla al contrato
  // como planometría se fue de Vender (la dueña, 2026-10-20: la planometría
  // se carga sólo en Supervisar). Ni el camino, ni el botón, ni la prop.
  for (const [re, que] of [
    [/\bonPlanometria\b/, "`onPlanometria`"], [/usarComoPlanometria/, "`usarComoPlanometria`"],
    [/Usarla como planometría|Reemplazar la planometría/, "el botón de adjuntarla"], [/\bplanometria\b/, "la prop `planometria`"],
  ]) assert.doesNotMatch(visorCodigo, re, `el visor sigue teniendo ${que}`);
  assert.match(visorCodigo, /onClick=\{bajarLamina\}/, "el visor ya no deja bajar la lámina");
  assert.doesNotMatch(modoCodigo, /adjuntarLamina|marcarLamina|laminaQuitada|proveedorVigente/, "la ficha sigue adjuntando la lámina al contrato");
});

prueba("la prueba del 3D se va con el proveedor y con «Empezar de nuevo»; la sesión no guarda ninguna lámina", () => {
  // Con la planometría fuera de Vender, la sesión no recuerda láminas: lo que
  // se probó en el 3D se olvida al cambiar de proveedor y al empezar de nuevo.
  assert.match(sesionCodigo, /if \(ahora === anterior\.current\) return;\s*anterior\.current = ahora;\s*vaciar\(\);/,
    "cambiar de proveedor no vacía la sesión");
  assert.doesNotMatch(sesionCodigo, /lamina|Lamina|File\b/, "la sesión de la prueba guarda una lámina o un archivo");
  assert.match(modoCodigo, /const empezarDeNuevo = \(\) => \{\s*sesion\.vaciar\(\);\s*onCancelar\(\);\s*\};/,
    "«Empezar de nuevo» no olvida la prueba del 3D");
  assert.match(modoCodigo, /onClick=\{empezarDeNuevo\}/, "«Empezar de nuevo» no pasa por `empezarDeNuevo`");
});

prueba("lo que llega tarde no pisa lo vigente: el catálogo, la subida y la lámina", () => {
  // El catálogo: otro nombre vacía la lista YA (si no, mientras llega la
  // nueva, el cajón decía «Productos de Alpina» con «Postobón» escrito), y
  // una respuesta vieja se descarta.
  assert.match(visorCodigo, /useEffect\(\(\) => \{\s*setCatalogo\(CATALOGO_VACIO\);[^}]*?return traer\(nombreRef\.current, [^}]*\}, \[proveedorNormal, traer\]\);/,
    "el efecto del proveedor no vacía la lista del anterior antes de pedir la del nuevo");
  // Y la lista sabe de quién es: en el render con el nombre nuevo (antes de
  // que corra el efecto) la del anterior ya no se muestra.
  assert.match(visorCodigo, /setCatalogo\(\{ de: normalizarProveedor\(quien\), lista \}\);/, "la lista del catálogo no recuerda para qué nombre se pidió");
  assert.match(visorCodigo, /const artes = catalogo\.de === proveedorNormal \? catalogo\.lista : SIN_ARTES;/,
    "el visor muestra la lista del catálogo aunque sea de otro nombre");
  assert.ok(!/useState<Arte\[\]>/.test(visorCodigo), "hay una lista de artes guardada sin el nombre de su proveedor");
  assert.match(visorCodigo, /if \(mio !== pedidoDelCatalogo\.current\) return;/, "una respuesta vieja del catálogo pisa la del proveedor de ahora");
  // Y el servidor recibe el nombre: el catálogo entero filtrado en el
  // navegador es la lista de clientes de la tienda delante de uno de ellos.
  const api = codigo("src/api/catalogo.ts");
  const delProveedor = (api.match(/export const listarDelProveedor = [^]*?\n\};/) || [""])[0];
  assert.match(delProveedor, /client\.get<Arte\[\]>\("\/catalogo\/", \{ params: \{ proveedor: n \} \}\)/,
    "`listarDelProveedor` no le pide al servidor sólo el catálogo de ese nombre");
  assert.ok(!/\.filter\(/.test(delProveedor), "`listarDelProveedor` filtra en el navegador: bajó más de lo que tenía que bajar");
  // Lo que termina después de un `await` lee el nombre VIGENTE (un ref), no
  // el del render del clic: «Subir» volvía a pedir el catálogo de Alpina con
  // Postobón escrito, y le probaba el producto de Alpina a la cara.
  assert.match(visorCodigo, /const nombreRef = useRef\(nombre\);\s*nombreRef\.current = nombre;/, "no hay un ref con el nombre vigente");
  assert.match(visorCodigo, /const recargar = useCallback\(\(\) => \{ traer\(nombreRef\.current, 0\); \}, \[traer\]\);/,
    "`recargar` pide el catálogo con el nombre del render en que se armó");
  const alSubir = (visorCodigo.match(/const alSubir = \([^]*?\n {2}\};/) || [""])[0];
  assert.ok(alSubir, "no se encontró `alSubir`");
  assert.match(alSubir, /^[^]*?\{\s*if \(!vivo\.current\) return;/, "la subida que termina con el visor cerrado toca la ficha");
  assert.match(alSubir, /if \(normalizarProveedor\(desde\.proveedor\) !== normalizarProveedor\(nombreRef\.current\)\) \{\s*recargar\(\);\s*return;\s*\}/,
    "un producto subido a nombre del proveedor anterior entra a la lista o a la cara del nuevo");
  assert.match(alSubir, /if \(desde\.cara === claveRef\.current\) elegir\(nuevo\);/, "el producto subido se prueba en otra cara que la del alta");
  assert.match(visorCodigo, /<SubirProducto\b[^>]*\sonListo=\{alSubir\}/, "el alta no termina en `alSubir`");
  assert.match(visorCodigo, /const desde = \{ proveedor, cara \};[^]*?onListo\(nuevo, desde\);/, "el alta no dice a nombre de quién y para qué cara se subió");
  // Mientras sube, el proveedor no se cambia desde el cajón.
  assert.match(visorCodigo, /className="visor-enlace" onClick=\{\(\) => setEditandoProveedor\(true\)\} disabled=\{enviandoAlta\}/,
    "«cambiar» el proveedor sigue activo mientras se sube un producto");
  assert.match(visorCodigo, /onEnviando=\{setEnviandoAlta\}/, "el visor no se entera de que un producto va camino al servidor");
  // La lámina: atada a lo que se mostraba al empezar (cara, proveedor, visor
  // abierto), mirada después de cada `await`, y con el visor quieto.
  assert.match(visorCodigo, /useEffect\(\(\) => \{ vigencia\.current\+\+; \}, \[clave, proveedorNormal\]\);/, "la lámina no se entera de que cambió la cara o el proveedor");
  assert.match(visorCodigo, /useEffect\(\(\) => \(\) => \{ vigencia\.current\+\+; \}, \[\]\);/, "la lámina no se entera de que se cerró el visor");
  const arma = (visorCodigo.match(/const armarLamina = async[^]*?\n {2}\};/) || [""])[0];
  assert.match(arma, /const mia = vigencia\.current;/, "la lámina no recuerda qué se mostraba al empezar");
  assert.match(arma, /const sigue = \(\) => vigencia\.current === mia;\s*const vigente = \(\) => \{ if \(!sigue\(\)\) throw INTERRUMPIDA; \};/,
    "`vigente()` no corta la lámina cuando cambió lo que se mostraba");
  const vigentes = (arma.match(/\bvigente\(\);/g) || []).length;
  assert.ok(vigentes >= 4, `la lámina mira si sigue vigente en ${vigentes} lugares (entre tomas, después de cada toma y del armado)`);
  assert.match(arma, /const blob = await componerPropuesta\(tomas, datos\);\s*vigente\(\);/, "la lámina compuesta no se vuelve a mirar antes de devolverse");
  assert.match(arma, /proveedor: quien, sigue/, "la lámina no dice con qué proveedor se armó");
  const bajar = (visorCodigo.match(/const bajarLamina = async[^]*?\n {2}\};/) || [""])[0];
  assert.match(bajar, /if \(!r\.sigue\(\)\) throw INTERRUMPIDA;\s*descargar\(/, "«Bajar la propuesta» baja una lámina interrumpida");
  // Quieto mientras se arma: ni otra cara, ni otra toma, ni el cajón, ni el
  // proveedor, ni otro producto, ni la órbita.
  const pestana = (visorCodigo.match(/className="visor-pestana"[^]*?<\/button>/) || [""])[0];
  assert.match(pestana, /\sdisabled=\{armando\}/, "la chapa deja saltar de cara mientras se arma la lámina");
  const hud = (visorCodigo.match(/<HudQueSeEsconde\b[^]*?<\/HudQueSeEsconde>/) || [""])[0];
  const botonesHud = (hud.match(/<button\b/g) || []).length;
  const apagados = (hud.match(/disabled=\{armando\}/g) || []).length;
  assert.ok(botonesHud >= 5 && apagados === botonesHud, `el HUD tiene ${botonesHud} botones y ${apagados} se apagan mientras se arma la lámina`);
  const ocultar = (visorCodigo.match(/className="visor-cajon-cerrar"[^]*?<\/button>/) || [""])[0];
  assert.match(ocultar, /\sdisabled=\{armando\}/, "«Ocultar» cambia el ancho del lienzo mientras se arma la lámina");
  assert.match(visorCodigo, /<fieldset className="visor-quieto" disabled=\{armando\}/, "el proveedor, los productos y «Cómo va» siguen activos mientras se arma la lámina");
  const quieto = (visorCodigo.match(/<fieldset className="visor-quieto"[^]*?<\/fieldset>/) || [""])[0];
  for (const [re, que] of [[/data-proveedor-del-contrato/, "el proveedor"], [/className="visor-producto"/, "los productos"], [/<PanelDePrueba\b/, "«Cómo va»"]]) {
    assert.match(quieto, re, `${que} no está adentro de lo que se apaga mientras se arma la lámina`);
  }
  assert.ok(!/aria-label="La lámina"/.test(quieto), "«Para llevarse» se apaga con lo demás: no se vería qué pasó");
  assert.match(visorCodigo, /\{armando && <div className="visor-tapa"/, "la órbita se mueve mientras se arma la lámina");
});

prueba("el visor vende la cara entera, con lo ajeno en grises; la isla muestra el lugar; la lámina, sólo su cara", () => {
  // Los espacios internos del plano (sin contrato) no van vendidos al visor.
  assert.match(visorCodigo, /sinRepisasVendidas\(sinDatosComerciales\(storeToFixtures\(unificados\)\), new Set\(idsDelContrato\.split\(","\)\)\)/,
    "los muebles del contrato llegan al visor con espacios internos vendidos");
  // Lo ajeno en grises: el proveedor de `RellenoNeutro` envuelve la escena.
  assert.match(visorCodigo, /<RellenoNeutro\.Provider value>\s*(?:\{\/\*[^]*?\*\/\}\s*)?<Scene\b/, "el relleno de los demás va con sus colores en el visor");
  // Sin envases (isla, batea, cruz): ni producto, ni «De cerca», ni lámina.
  assert.match(visorCodigo, /const clavesDeCaras = caras\s*\.filter\(\(c\) => TIPOS_CON_PRUEBA_3D\.has\(/, "el visor dibuja pruebas en muebles sin envases");
  assert.match(visorCodigo, /TOMAS\.filter\(\(\[toma\]\) => conCuenta \|\| toma !== "cerca"\)/, "«De cerca» se ofrece en un mueble sin envases");
  assert.match(visorCodigo, /\) : !conCuenta \? \(/, "el cajón ofrece productos en un mueble sin envases");
  assert.match(visorCodigo, /\{arteDeLaCara && conCuenta && !subiendo && \(\s*<section className="visor-como" aria-label="La lámina">/, "la lámina se ofrece en un mueble sin envases");
  // La lámina: sólo la prueba de su cara, con el cuadro quieto y de vuelta a la toma de antes.
  const arma = (visorCodigo.match(/const armarLamina = async[^]*?\n {2}\};/) || [""])[0];
  assert.ok(arma, "no se encontró `armarLamina`");
  assert.match(arma, /setCongelado\(capturar\(\)\)[^]*setSoloLaCara\(clave\);\s*try \{/, "las tomas de la lámina se ven en pantalla, o con las pruebas de otras caras");
  assert.match(arma, /finally \{\s*(?:\/\/[^\n]*\s*)*setSoloLaCara\(null\);\s*setCongelado\(null\);/,
    "después de la lámina quedan las pruebas filtradas o el cuadro congelado");
  // La toma de antes, sólo si sigue siendo la misma cara: si no, el 3D
  // quedaba en una cara y la chapa en otra (la crítica: saltar a mitad).
  assert.match(arma, /if \(vivo\.current && claveRef\.current === clave\) \{\s*setSinArte\(sinArteAntes\);\s*pedirToma\(activa\.fixtureId, activa\.face, tomaAntes\);\s*\}/,
    "después de la lámina no se vuelve a la toma de antes, o se repone aunque la cara haya cambiado");
  assert.match(visorCodigo, /prueba=\{pruebaDibujada\}/, "el lienzo no dibuja la prueba filtrada de la lámina");
});

/* Las piezas del EDITOR que el visor dibuja adentro de Vender. No están en
   ARCHIVOS_VENDER (el editor entero pinta contratos y precios), así que se
   recortan y se les pasan las mismas guardas: lo que pintan, lo que piden y
   lo que escriben. La escala de letra NO: es el cajón del editor. */
const editorCodigoV = codigo("src/components/StoreEditor3D/StoreEditor3D.tsx");
const recortarDelEditor = (desde, hasta) => {
  const i = editorCodigoV.indexOf(desde);
  const j = editorCodigoV.indexOf(hasta, i + 1);
  assert.ok(i > 0 && j > i, `no se encontró ${desde} … ${hasta} en StoreEditor3D.tsx: el recorte mediría otra cosa`);
  return editorCodigoV.slice(i, j);
};
const PIEZAS_DEL_VISOR = [
  ["PanelDePrueba", () => recortarDelEditor("function PanelDePrueba(", "function VistaProveedor(")],
  ["BloqueDeRejillas", () => recortarDelEditor("function BloqueDeRejillas(", "function useEtiquetas(")],
  ["HudQueSeEsconde", () => recortarDelEditor("function HudQueSeEsconde(", "interface CommercialPanelProps")],
  ["EditorDeFicha", () => codigo("src/components/StoreEditor3D/EditorDeFicha.tsx")],
];
/** Un texto prohibido que se PINTA en una línea (la misma regla que arriba). */
function textosProhibidosEn(l0) {
  if (/^\s*\|\s*"/.test(l0) || /^\s*type\s+\w+\s*=/.test(l0)) return [];
  const l = l0.replace(/[!=]==?\s*"[^"]*"/g, " ").replace(/"[^"]*"\s*[!=]==?/g, " ");
  const cadenas = [...l.matchAll(/"([^"]{2,})"|'([^']{2,})'|`([^`]{2,})`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const jsx = l.replace(/<[^>]*>/g, " ").replace(/[{}]/g, " ");
  const out = [];
  for (const [re, que] of TEXTOS_PROHIBIDOS) if (cadenas.some((c) => re.test(c)) || re.test(jsx)) out.push(que);
  return out;
}

prueba("las piezas del editor que se ven en Vender: ni datos ajenos, ni textos prohibidos, ni llamadas ajenas", () => {
  const hits = [];
  for (const [nombre, cortar] of PIEZAS_DEL_VISOR) {
    const txt = cortar();
    assert.ok(txt.length > 200, `la pieza ${nombre} salió vacía`);
    txt.split("\n").forEach((l, k) => {
      for (const [campo, que] of CAMPOS_AJENOS) for (const como of fugasDeCampo(l, campo)) hits.push(`${nombre}:${k + 1} — ${campo} ${como}; es ${que}`);
      // `proveedor` también, sólo acá: el nombre que se pinta tiene que salir
      // del arte que se está mirando (`arte.proveedor`, que el visor sólo
      // recibe del catálogo del proveedor del contrato), nunca de otro lado.
      for (const como of fugasDeCampo(l.replace(/\barte\.proveedor\b/g, "arte.suyo"), "proveedor")) {
        hits.push(`${nombre}:${k + 1} — proveedor ${como}: el nombre que se pinta no sale del arte que se mira`);
      }
      for (const que of textosProhibidosEn(l)) hits.push(`${nombre}:${k + 1} — ${que}`);
    });
    for (const h of llamadasEn(txt, [...LLAMADAS_AJENAS, ...ESCRITURAS])) hits.push(nombre + h);
  }
  assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
});

prueba("el visor no contradice a Vender: sin «la prueba los tapa», y el alta de un proveedor nuevo se confirma", () => {
  // Las repisas vendidas aparte no tienen contrato: Vender ofrece la cara
  // entera, y el panel le decía al proveedor «esta cara tiene 5 entrepaños
  // vendidos». En el visor va `paraElProveedor`; el aviso, a la dueña, en la
  // fila del contrato.
  const tag = (visorCodigo.match(/<PanelDePrueba\b[^]*?\/>/) || [""])[0];
  assert.match(tag, /\sparaElProveedor[\s/]/, "el panel «Cómo va» del visor no sabe que lo lee el proveedor");
  const panel = recortarDelEditor("function PanelDePrueba(", "function VistaProveedor(");
  assert.match(panel, /\{vendidosTapados > 0 && !paraElProveedor && \(/, "el aviso de entrepaños vendidos le llega al proveedor");
  assert.match(modoCodigo, /data-repisas-vendidas=\{repisasVendidas\}/, "la fila no le avisa a la dueña de las repisas vendidas aparte");
  // El alta por nombre no crea un proveedor sin preguntar: sólo con la
  // confirmación del 409 (`esProveedorNuevo`).
  assert.match(visorCodigo, /if \(esProveedorNuevo\(e\)\) setNombreNuevo\(true\);/, "el 409 del proveedor nuevo no se pregunta");
  assert.equal((visorCodigo.match(/\benviar\(true\)/g) || []).length, 1, "el alta del proveedor nuevo se dispara desde otro lado que la confirmación");
  assert.ok(!/\bcrearProveedor: true\b/.test(visorCodigo), "el visor da de alta proveedores sin preguntar");
  // Y la órbita del visor no se mete en el mueble.
  assert.match(visorCodigo, /ctrl\.minAzimuthAngle = frente - giro;\s*ctrl\.maxAzimuthAngle = frente \+ giro;\s*ctrl\.enablePan = false;/,
    "la órbita del visor gira sin límites");
});

console.log("\nvender · código muerto");

prueba("StoreView y Legend están borrados, o al menos nadie los importa", () => {
  const vivos = [];
  for (const [dir, comp] of [["src/components/StoreView", "StoreView"], ["src/components/Legend", "Legend"]]) {
    if (!hay(dir)) continue;
    const usos = [];
    (function caminar(d) {
      for (const n of readdirSync(join(raiz, d))) {
        const p = join(d, n);
        if (statSync(join(raiz, p)).isDirectory()) { caminar(p); continue; }
        if (!/\.tsx?$/.test(n)) continue;
        if (p.startsWith(dir)) continue;
        if (new RegExp(`from\\s+["'][^"']*${comp}(?:/${comp})?["']`).test(leer(p))) usos.push(p);
      }
    })("src");
    if (usos.length) vivos.push(`${comp} lo importan: ${usos.join(", ")}`);
    else aviso(`${dir} sigue en el árbol y no lo importa nadie: es el borrado que pide «Pendientes para el PR 2»`);
  }
  assert.deepEqual(vivos, [], vivos.join(" · "));
});

/* ── el visor ve el mueble de verdad (ejecutado) ──────────────────────────
   El visor de Vender dibuja con la misma escena que el editor, sobre
   `sinRepisasVendidas(sinDatosComerciales(storeToFixtures(…)))`. Si la lista
   blanca de `sinDatosComerciales` dejara afuera los entrepaños, el módulo o
   las puertas que guardó el mueble, al proveedor se le mostraría OTRA góndola
   u otra nevera que la que se le vende —con el producto parado en otros
   entrepaños—. Se arma el mismo plano por los dos caminos y se comparan las
   filas y los vanos que cada uno le pide a `ventaDeTipo` (la cuenta que usan
   el dibujo, el relleno, la prueba, los habladores y la cámara). */
{
  const { build } = await import("esbuild");
  const cargar = async (rel, opciones = {}) => {
    const r = await build({
      entryPoints: [join(raiz, rel)], bundle: true, write: false, format: "esm",
      platform: "neutral", logLevel: "silent", ...opciones,
    });
    return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
  };
  const Pl = await cargar("src/utils/convertirPlano.ts");
  const Pr = await cargar("src/components/StoreEditor3D/muebles/privacidad.ts");
  const Me = await cargar("src/components/StoreEditor3D/muebles/medidas.ts");
  const Ve = await cargar("src/components/StoreEditor3D/muebles/venta.ts", { platform: "node", jsx: "automatic" });
  const E3 = await cargar("src/catalogo/editor3D.ts");
  const CATALOGO = { defs: E3.FIXTURE_DEFS, slotsPorDefecto: () => [] };

  const CONTRATO = {
    status: "occupied", supplierName: "POSTOBÓN", brandCategory: "Gaseosas", negotiatedValue: 2_500_000,
    startDate: "2026-10-01", endDate: "2026-12-31", observation: "pago por adelantado",
  };
  const unificados = [
    { id: "g", code: "GON-02", sede: "NAVE", type: "gondola", gondolaType: "double", label: "Góndola Doble",
      cx: 4, cz: 6, rotY: 0, w: 3.0, d: 0.9, h: 2.0, color: "#6366f1", ...CONTRATO,
      modelo: "base:gondola-central-200-m100", entrepanos: 4, modulo: 1.0,
      faceB: { ...CONTRATO, supplierName: "NUTRESA" },
      slots: [{ id: "s1", x: 0, y: 0, w: 1, h: 1, status: "occupied", supplierName: "NUTRESA",
        brandCategory: "Café", negotiatedValue: 900_000, startDate: "2026-10-01", endDate: "2026-12-31" }] },
    { id: "p", code: "PUN-03", sede: "NAVE", type: "punta", label: "Punta Góndola",
      cx: 6, cz: 6, rotY: 0, w: 0.9, d: 0.4, h: 1.8, color: "#7c3aed", ...CONTRATO, entrepanos: 3, modulo: 0.45 },
    { id: "n", code: "NEV-01", sede: "NAVE", type: "nevera_puertas", label: "Nevera de Puertas",
      // 2,30 de frente con 3 puertas: la cuenta de siempre (`puertasDeNevera`)
      // le daría 4, así que sin su ficha el visor la dibujaría distinta.
      cx: 9, cz: 2, rotY: 0, w: 2.3, d: 0.7, h: 2.1, color: "#1e293b", ...CONTRATO,
      modelo: "base:nevera-3p-frigomaster", partes: { puertas: 3, proveedor: "POSTOBÓN", valor: 2_500_000 } },
  ];
  // Los dos caminos: el del editor (`FixtureMesh` dibuja con `geometriaDe`)
  // y el del visor.
  const delEditor = Pl.storeToFixtures(unificados, CATALOGO);
  const delVisor = Pr.sinRepisasVendidas(Pr.sinDatosComerciales(Pl.storeToFixtures(unificados, CATALOGO)), new Set(["g"]));
  const venta = (f) => Ve.ventaDeTipo(f.type, f.w, f.d, f.h, f.gondolaType, Me.geometriaDe(f));

  prueba("el visor de Vender ve las MISMAS filas y vanos que el editor: góndola con su ficha, punta y nevera de 3 puertas (ejecutado)", () => {
    for (const f of delEditor) {
      const v = delVisor.find((x) => x.id === f.id);
      assert.ok(v, `${f.code} no llegó al visor`);
      const [a, b] = [venta(f), venta(v)];
      assert.deepEqual(b.filas.alturas, a.filas.alturas, `${f.code}: el visor le muestra al proveedor otras filas que las del editor`);
      assert.equal(b.filas.rows, a.filas.rows, `${f.code}: otra cantidad de filas en el visor`);
      assert.deepEqual(b.vanos, a.vanos, `${f.code}: el visor le muestra al proveedor otros módulos (o puertas) que los del editor`);
    }
    // Y la prueba prueba algo: sin la ficha, cada uno se vería distinto.
    const g = delEditor.find((f) => f.id === "g"), p = delEditor.find((f) => f.id === "p"), n = delEditor.find((f) => f.id === "n");
    assert.notDeepEqual(venta(g).filas.alturas, Ve.ventaDeTipo("gondola", g.w, g.d, g.h, "double").filas.alturas, "la góndola de prueba se dibuja igual sin su ficha");
    assert.equal(venta(g).vanos.length, 3, "la góndola de 3,00 con módulo de 1,00 no tiene 3 módulos");
    assert.equal(venta(p).vanos.length, 2, "la punta con módulo de 0,45 no tiene 2 módulos");
    assert.equal(venta(n).vanos.length, 3, "la nevera de 3 puertas no tiene un vano por puerta");
    assert.equal(Ve.ventaDeTipo("nevera_puertas", n.w, n.d, n.h).vanos.length, 4, "sin sus puertas la nevera de 2,30 también tendría 3: la prueba no prueba nada");
    assert.notDeepEqual(venta(p).filas.alturas, Ve.ventaDeTipo("punta", p.w, p.d, p.h).filas.alturas, "la punta de prueba se dibuja igual sin sus entrepaños");
  });

  prueba("el visor de Vender no recibe NI UNA clave comercial, tampoco colada en `partes` (ejecutado)", () => {
    const json = JSON.stringify(delVisor);
    for (const fuga of ["POSTOB", "NUTRESA", "Gaseosas", "Café", "2500000", "900000", "2026-", "adelantado", "faceB", "proveedor", "valor"]) {
      assert.ok(!json.includes(fuga), `«${fuga}» llega al visor de Vender`);
    }
    for (const v of delVisor) {
      assert.deepEqual([v.supplierName, v.brandCategory, v.negotiatedValue, v.startDate, v.endDate, v.observation],
        ["", "", 0, "", "", ""], `${v.code}: llegó un dato del contrato`);
      for (const s of v.slots ?? []) assert.equal(s.status, "free", `${v.code}: el visor ve un espacio interno vendido`);
    }
    assert.deepEqual(delVisor.find((v) => v.id === "n").partes, { puertas: 3 }, "de `partes` pasó algo más que sus números");
  });
}

/* ── las participaciones de cara en Vender (§4.8, §9.9) ─────────────────────
   Una cara POR PARTICIPACIÓN se vende en el Editor 3D → Distribución, nunca
   desde Vender: ni entera ni la participación (`…-PC3`). Vender la muestra
   con su ocupación ANÓNIMA —«Por participación · queda 40 %»—: sin nombres,
   sin montos, sin números de participación. Y lo que la vuelve «libre» o
   «tomada» en el plano, la tarifa y «Cuándo se libera» es la misma cuenta
   pura (`dispoPorParticipacion`) que usan Supervisar y el plano 2D. */
console.log("\nvender · las participaciones de cara");
{
  const { build, transformSync } = await import("esbuild");
  const r = await build({
    stdin: { contents: 'export * from "./src/utils/partes.ts";', resolveDir: raiz, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  });
  const P = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
  const d = (s) => new Date(`${s}T00:00:00`);
  const HOY = "2026-10-17";
  const gon = { id: "g1", code: "GON-01", sede: "NAVE", type: "gondola", gondolaType: "double", partes: { division: "participacion" } };
  const entera = { id: "g2", code: "GON-02", sede: "NAVE", type: "gondola", gondolaType: "double" };
  const ocup = (intervalos, fisicos = []) => ({ ocupacion: { intervalos, fisicos }, hoy: HOY });
  const iv = (desde, hasta, pb) => ({ desde, hasta, pb });
  const nov = [d("2026-11-01"), d("2026-11-30")];
  const ix = P.indiceDePartes({});
  const dispo = (f, par) => P.disponibilidadDeCara(f, "A", {}, ix, "NAVE", nov[0], nov[1], par);
  const como = (f, par, conPorcentaje) => P.comoSeLiberaLaCara(f, "A", {}, ix, "NAVE", nov[0], nov[1], par && { ...par, conPorcentaje });

  /* Rediseño de Vender (PR 1, decisión del dueño 2026-10-19): una cara por
     participación SE VENDE en Vender, como una línea de PORCENTAJE de esa
     cara. La guarda de antes fijaba que tocarla no sumaba nada; ésta fija lo
     nuevo con la misma dureza: suma su porcentaje y NUNCA la cara entera ni un
     `…-PC3` escrito a mano (el número lo pone el servidor), sin vaciar lo
     armado, y tocada de nuevo sale sólo esa cara. */
  prueba("una cara por participación se vende en Vender como su PORCENTAJE: nunca entera, nunca un `PC` a mano (ejecutado)", () => {
    assert.equal(P.porParticipacion(gon), true, "la góndola de prueba no se vende por participación: la prueba no prueba nada");
    assert.deepEqual(P.alTocarEnVender([], gon, "A", () => true), [{ id: "g1", face: "A", pc: true }]);
    const armado = [{ id: "g2", face: "B" }];
    assert.deepEqual(P.alTocarEnVender(armado, gon, "B", () => true), [{ id: "g2", face: "B" }, { id: "g1", face: "B", pc: true }],
      "tocarla vació (o cambió) lo que ya se había armado");
    assert.deepEqual(P.alTocarEnVender([{ id: "g1", face: "A", pc: true }, { id: "g1", face: "B", pc: true }], gon, "A", () => true),
      [{ id: "g1", face: "B", pc: true }], "tocarla de nuevo no la saca, o saca la otra cara");
    for (const x of P.alTocarEnVender([], gon, "B", () => true)) {
      assert.equal(x.parte, undefined, "tocarla suma una parte (o un `PC` escrito a mano)");
      assert.equal(x.pc, true, "tocarla suma la cara entera");
    }
    // Y la entera de al lado sigue sumándose como siempre.
    assert.deepEqual(P.alTocarEnVender([], entera, "B", () => true), [{ id: "g2", face: "B" }]);
    // No ofrece la cara entera ni las participaciones como interruptores del renglón.
    assert.deepEqual(P.interruptoresDeLaCara(gon, "A"), []);
    assert.deepEqual(P.partesDe(gon), []);
    // La forma de una línea, y lo que queda del contrato cuando el mueble
    // cambia cómo se vende (las dos caras de una doble).
    assert.deepEqual(P.conLaForma([{ id: "g2", face: "A" }, { id: "x", face: "A" }], "g2", "A", "participacion"),
      [{ id: "x", face: "A" }, { id: "g2", face: "A", pc: true }]);
    assert.deepEqual(P.conLaForma([], "p1", "A", "entrepanos"), [{ id: "p1", face: "A", porPartes: "entrepanos" }]);
    // Cambiar cómo se vende el mueble deja TODAS sus líneas en el estado vacío
    // de la forma nueva (las dos caras), nunca con la forma de antes.
    assert.deepEqual(P.aLaFormaNueva([{ id: "g1", face: "A" }, { id: "x", face: "A" }, { id: "g1", face: "B", parte: "EN2" }], "g1", "A", "participacion"),
      [{ id: "x", face: "A" }, { id: "g1", face: "A", pc: true }, { id: "g1", face: "B", pc: true }],
      "una línea del mueble quedó con la forma de antes");
    assert.deepEqual(P.aLaFormaNueva([{ id: "g2", face: "B", pc: true }], "g2", "B", "entrepanos"), [{ id: "g2", face: "B", porPartes: "entrepanos" }]);
    // La primera parte marcada reemplaza a la cara «por partes» sin elegir.
    assert.deepEqual(P.alternarParte([{ id: "p1", face: "A", porPartes: "entrepanos" }], { id: "p1", face: "A", parte: "EN1" }),
      [{ id: "p1", face: "A", parte: "EN1" }]);
  });

  // `prueba` es sincrónica: el módulo se arma antes.
  const rM = await build({
    stdin: { contents: 'export * from "./src/utils/partesDelMueble.ts";', resolveDir: raiz, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  });
  const M = await import("data:text/javascript;base64," + Buffer.from(rM.outputFiles[0].text).toString("base64"));
  prueba("lo que se toca en el plano llega ENTERO a la ficha: el % (`pc`) y la cara por partes sin elegir (`porPartes`), no sólo cara y parte (ejecutado)", () => {
    const i = vista.indexOf("const espaciosDelContrato = useMemo(");
    assert.ok(i >= 0, "no está espaciosDelContrato");
    // Los muebles del contrato: los del plano con la forma PENDIENTE de una
    // edición encima (`fixturesDelContrato`, «Editar contrato»).
    const bloque = vista.slice(i, vista.indexOf("[enContrato, fixturesDelContrato],", i));
    assert.ok(bloque.length > 100, "espaciosDelContrato no depende de los muebles del contrato");
    assert.match(bloque, /\.map\(\(\{ id, face, parte, pc, porPartes \}\): CaraElegida \| null =>/, "espaciosDelContrato pierde `pc` o `porPartes`");
    assert.match(bloque, /\.filter\(\(x\): x is CaraElegida => x !== null\)/);
    // Ejecutado: la función del map, con dos muebles.
    const a = bloque.indexOf(".map(") + 5, b = bloque.indexOf(")\n        .filter(");
    assert.ok(a > 5 && b > a, "no se pudo leer el map de espaciosDelContrato");
    const js = transformSync(`const f = ${bloque.slice(a, b)};`, { loader: "ts" }).code;
    const fixtures = [{ id: "g1" }, { id: "p2" }];
    const map = new Function("fixturesDelContrato", `${js}\nreturn f;`)(fixtures);
    assert.deepEqual(map({ id: "g1", face: "B", pc: true }), { fixture: fixtures[0], face: "B", pc: true }, "un % entra como «Entera»");
    assert.deepEqual(map({ id: "p2", face: "A", porPartes: "entrepanos" }), { fixture: fixtures[1], face: "A", porPartes: "entrepanos" }, "«Por entrepaños» no llega a la ficha");
    assert.deepEqual(map({ id: "p2", face: "A", parte: "EN1" }), { fixture: fixtures[1], face: "A", parte: "EN1" });
    assert.equal(map({ id: "x", face: "A" }), null);
    // Y la lista de partes de esa línea sigue abierta al tildar la primera:
    // la clave (\`…-EN*\`) es la misma con o sin partes, y queda abierta.
    const mv = codigo("src/components/Contrato/ModoVender.tsx");
    assert.match(mv, /const sinElegir = c\.lineas\.find\(\(l\) => l\.sinElegir\)\?\.clave \?\? null;\s*useEffect\(\(\) => \{\s*if \(sinElegir\) setAbierta\(sinElegir\);\s*\}, \[sinElegir\]\);/,
      "la lista de entrepaños se cierra al tildar EN1");
  });

  prueba("cambiar cómo se vende desde Vender: las guardas del Plano, las dos caras, y el porqué sin nombres (ejecutado y leído)", () => {
    const g = { id: "g9", code: "GON-09", sede: "NAVE", type: "gondola", gondolaType: "double", w: 3, h: 2, d: 0.9, entrepanos: 4 };
    const vivo = { status: "occupied", supplierName: "", brandCategory: "", startDate: "2026-10-01", endDate: "2026-12-31" };
    // Libre: se puede, y es lo que escribe el Plano.
    const libre = M.cambioDesdeVender(g, "entrepanos", {}, "NAVE");
    assert.deepEqual(libre, { cambio: { division: "entrepanos" }, aviso: null });
    assert.deepEqual(M.cambioDesdeVender(g, "entera", {}, "NAVE"), { listo: true });
    // Algo vendido en la OTRA cara también frena: la forma es del mueble.
    const enLaB = M.cambioDesdeVender(g, "entrepanos", { "NAVE-GON-09-B": vivo }, "NAVE");
    // Lo lee el proveedor: sin qué cara, qué parte ni qué participación.
    assert.equal(enLaB.problema, "Tiene algo vendido hasta el 31 dic: no se puede cambiar cómo se vende.");
    const parte = M.porQueNoSeCambia({ ...g, partes: { division: "entrepanos" } }, { "NAVE-GON-09-EN4": vivo }, "NAVE");
    assert.equal(parte, "Tiene algo vendido hasta el 31 dic: no se puede cambiar cómo se vende.");
    const pc1 = M.porQueNoSeCambia({ ...g, partes: { division: "participacion" } }, { "NAVE-GON-09-PC1": { ...vivo, endDate: "2027-03-31" } }, "NAVE");
    assert.equal(pc1, "Tiene algo vendido hasta el 31 mar: no se puede cambiar cómo se vende.");
    const aMano = M.porQueNoSeCambia(g, { "NAVE-GON-09": { ...vivo, status: "reserved" } }, "NAVE");
    assert.equal(aMano, "Tiene algo tomado hasta el 31 dic: no se puede cambiar cómo se vende.");
    // Un porcentaje o una reserva de participación vivos (la ocupación anónima).
    const pcViva = M.porQueNoSeCambia({ ...g, partes: { division: "participacion" } }, {}, "NAVE",
      { ocupacion: { "NAVE-GON-09": { intervalos: [{ desde: "2026-10-01", hasta: "2026-11-30", pb: 2500 }], fisicos: [] } }, hoy: "2026-10-19" });
    assert.equal(pcViva, "Tiene porcentajes vendidos o tomados hasta el 30 nov: no se puede cambiar cómo se vende.");
    for (const t of [enLaB.problema, parte, pc1, aMano, pcViva]) {
      assert.doesNotMatch(t, /proveedor|marca|POSTOB|\$|%/i, "el porqué nombra a alguien o dice un %");
      assert.doesNotMatch(t, /reserv|contrato|\bPC\d|\b(EN|PU|TR|BI)\d|\bcara [AB]\b|B·/i, "el porqué dice qué es (reserva, contrato), qué parte o qué participación");
    }
    // Leído: las guardas son las del Plano, y el cambio va por el store.
    const pdm = codigo("src/utils/partesDelMueble.ts");
    const cdv = (pdm.match(/export function cambioDesdeVender\([^]*?\n\}/) || [""])[0];
    for (const t of ["porQueNoSeCambia(", "cambioParaDividir(f, forma)", "revisarCambioDePartes(f, r.cambio, estado, sede, participacion)"]) {
      assert.ok(cdv.includes(t), `cambiar desde Vender no pasa por ${t}`);
    }
    const va = DEF_INT.get("venderAsi")?.texto ?? "";
    assert.match(va, /await fs\.flushPending\(\);\s*const antes = useFixtureStore\.getState\(\);\s*antes\.commit\(conPartes\(selectFixtures\(antes\), id, cambio\)\);\s*await useFixtureStore\.getState\(\)\.flushPending\(\);/,
      "el cambio no guarda primero lo pendiente del plano, o no va por el store y `PUT /layout`");
    assert.match(va, /setEnContrato\(\(lista\) => aLaFormaNueva\(lista, id, face, forma\)\);/, "las líneas del mueble se quedan con la forma de antes");
    // El rechazo del servidor puede nombrar a otro proveedor y la fecha de su
    // reserva: en Vender, una frase genérica y nunca su texto.
    assert.doesNotMatch(va, /rechazo\.(message|choques)|\.message\b|choques|describeError/, "Vender muestra el texto del rechazo del plano");
    assert.match(va, /if \(useFixtureStore\.getState\(\)\.rechazos\[sede\]\) return NO_SE_CAMBIO_LA_FORMA;/);
    assert.match(codigo("src/pages/DashboardView.tsx"), /const NO_SE_CAMBIO_LA_FORMA = "No se pudo cambiar cómo se vende: tiene algo vendido o tomado\. Revisalo en el Plano\.";/);
    const linea = codigo("src/components/Contrato/LineaDelContrato.tsx");
    assert.match(linea, /Cambia cómo se vende \{l\.fixture\.code\} en toda la tienda\{l\.doble \? " \(las dos caras\)" : ""\}\./, "no se confirma en la línea");
    // (Rediseño de Supervisar, PR 2: apagada con `aria-disabled` y su porqué
    // en el `title`; el aviso de una línea sale SÓLO al tocar la que no se
    // puede —antes estaba siempre arriba de la barra—, y tocarla no la elige.)
    assert.match(linea, /aria-disabled=\{"problema" in rr \|\| undefined\}/, "la forma que no se puede no se ve apagada");
    assert.match(linea, /title=\{"problema" in rr \? rr\.problema : undefined\}/, "la forma apagada no dice por qué");
    assert.match(linea, /if \("problema" in rr\) \{ setPedida\(null\); setProbada\(\(x\) => \(x === forma \? null : forma\)\); return; \}/,
      "tocar la forma que no se puede la elige, o no dice por qué");
    assert.match(linea, /\{porque && !pedida && \(\s*<span className="oferta no" role="note" data-no-se-cambia>/, "el porqué sale sin que nadie lo pida");
    assert.doesNotMatch(linea, /porques\.join/, "volvió el aviso de siempre arriba de la barra");
    assert.match(sinComentarios(leer("src/vender.css")), /\.vender \.seg\.seg-linea \{ flex-wrap: wrap; overflow: visible; \}/, "a 390 px la cuarta forma queda escondida");
    assert.doesNotMatch(linea, /window\.confirm|createPortal|role="dialog"/, "la confirmación es un diálogo");
  });

  prueba("los entrepaños se eligen de arriba a abajo: EN5 · arriba … EN1 · la base (ejecutado)", () => {
    const punta = { id: "p1", code: "PUN-02", sede: "NAVE", type: "punta", entrepanos: 4, partes: { division: "entrepanos" } };
    assert.deepEqual(P.partesParaElegir(punta, "A", "entrepanos").map((x) => x.texto),
      ["EN5 · arriba", "EN4", "EN3", "EN2", "EN1 · la base"]);
    const nev = { id: "n1", code: "NEV-03", sede: "NAVE", type: "nevera_puertas", partes: { division: "puertas", puertas: 3 } };
    assert.deepEqual(P.partesParaElegir(nev, "A", "puertas").map((x) => x.sufijo), ["PU1", "PU2", "PU3"], "las puertas no van de izquierda a derecha");
  });

  prueba("una participación (`…-PC3`) nunca está «libre» en Vender, y no tiene tarifa propia (ejecutado)", () => {
    const pc = P.partirCodigo("NAVE-GON-01-PC3").parte;
    assert.equal(P.esParticipacion(pc), true);
    assert.equal(P.disponibilidadDeEspacio(gon, "A", pc, {}, ix, "NAVE", nov[0], nov[1]), "tomado");
    assert.equal(P.disponibilidadDeEspacio(entera, "A", pc, {}, ix, "NAVE", nov[0], nov[1]), "tomado");
    assert.deepEqual(P.tarifaDeEspacio(null, "NAVE", gon, pc), { valor: null, origen: "" });
  });

  prueba("la cara por participación se pinta con su ocupación: libre, parcial o tomada; sin ocupación, como antes (ejecutado)", () => {
    assert.equal(dispo(gon, ocup([])), "libre", "sin nada comprometido");
    assert.equal(dispo(gon, ocup([iv("2026-10-01", "2026-12-31", 3000)])), "parcial", "con un 30 % vendido");
    assert.equal(dispo(gon, ocup([iv("2026-10-01", "2026-12-31", 6000), iv("2026-11-10", "2026-11-20", 4000)])), "tomado",
      "un día del periodo sin lugar: no se puede vender por TODO el periodo");
    assert.equal(dispo(gon, ocup([], [{ desde: "2026-10-01", hasta: "2026-12-31" }])), "tomado", "vendida entera");
    assert.equal(dispo(gon, ocup([iv("2027-01-10", "2027-03-31", 9000)])), "libre", "lo de después del periodo no cuenta");
    // Sin la ocupación (todavía no llegó), todo como antes: la cara sola.
    assert.equal(dispo(gon, undefined), "libre");
    // Y a un mueble que se vende entero la ocupación no le cambia nada.
    assert.equal(dispo(entera, ocup([iv("2026-10-01", "2026-12-31", 10000)])), "libre");
  });

  prueba("el rótulo dice «Por participación · queda X %» (el % sólo a quien vende) y nunca un nombre ni un monto (ejecutado)", () => {
    const parcial = ocup([iv("2026-10-01", "2026-12-31", 2500), iv("2026-11-05", "2026-11-25", 3500)]);
    assert.deepEqual(como(gon, parcial, true), { porPartes: "Por participación · queda 40 %" });
    assert.deepEqual(como(gon, parcial, false), { porPartes: "Por participación" }, "el trabajador ve un %");
    assert.deepEqual(como(gon, ocup([iv("2026-10-01", "2026-12-31", 10000)]), true), { porPartes: "Por participación · tomada" });
    // Sin nada comprometido, lo de siempre: libre desde el arranque del periodo.
    const libre = como(gon, ocup([]), true);
    assert.equal(libre.porPartes, undefined);
    assert.equal(libre.diasLibres, 30);
    // Lo que llega es la ocupación anónima: el texto no puede decir otra cosa
    // que la palabra y el porcentaje.
    // (El aviso al tocarla en Vender cambió de frase con la revisión final:
    // va aparte, en la prueba siguiente, igual de fijado —de punta a punta—.)
    for (const t of [P.textoDeParticipacion({ dispo: "parcial", quedaPb: 3333 }, true)]) {
      assert.match(t, /^Por participación · queda 33,33 %(\. Se carga en el Editor 3D → Distribución\.)?$/);
    }
    assert.doesNotMatch(P.textoDeParticipacion({ dispo: "parcial", quedaPb: 3333 }, false), /%|\d/);
  });

  /* Lo que la línea de porcentaje dice de la cara: SU % y lo que queda en
     las fechas DEL CONTRATO (no del periodo de la barra), y desde qué día.
     Nunca lo comprometido de otro, nombres ni montos. Reemplaza a la guarda
     del aviso «se cargan en el Editor 3D → Distribución», igual de fijada. */
  prueba("la línea de porcentaje dice sólo lo que queda, en las fechas del contrato, y desde cuándo (ejecutado)", () => {
    assert.equal(P.textoAlTocarEnVender({ dispo: "parcial", quedaPb: 3333 }, true), "Por porcentaje · queda 33,33 %");
    assert.equal(P.textoAlTocarEnVender({ dispo: "tomado", quedaPb: 0 }, true), "Por porcentaje · no queda nada en estas fechas");
    for (const t of [P.textoAlTocarEnVender(null, true), P.textoAlTocarEnVender({ dispo: "parcial", quedaPb: 3333 }, false)]) {
      assert.equal(t, "Por porcentaje");
    }
    const parcial = ocup([iv("2026-10-01", "2026-12-31", 2500), iv("2026-11-05", "2026-11-25", 3500)]);
    const nov = P.quedaEnLaCara(gon, parcial, "2026-11-01", "2026-11-30");
    assert.deepEqual(nov, { quedaPb: 4000, dia: "2026-11-05" }, "lo que queda o el día en que queda eso");
    assert.deepEqual(Object.keys(nov).sort(), ["dia", "quedaPb"], "la cuenta de Vender devuelve algo más que lo que queda");
    assert.equal(nov.quedaPb, P.dispoDeParticipacion(gon, parcial, "2026-11-01", "2026-11-30").quedaPb, "la línea y el rótulo del plano dicen números distintos");
    // Las fechas cambian, la cuenta también.
    assert.deepEqual(P.quedaEnLaCara(gon, parcial, "2026-12-01", "2026-12-31"), { quedaPb: 7500, dia: "2026-12-01" });
    // Lo vendido entero cuenta como la cara entera; un mueble que no se
    // vende así, o sin la ocupación, no dice nada.
    assert.equal(P.quedaEnLaCara(gon, ocup([], [{ desde: "2026-10-01", hasta: "2026-12-31" }]), "2026-11-01", "2026-11-30").quedaPb, 0);
    assert.equal(P.quedaEnLaCara(entera, parcial, "2026-11-01", "2026-11-30"), null);
    assert.equal(P.quedaEnLaCara(gon, undefined, "2026-11-01", "2026-11-30"), null);
    for (const t of [P.textoAlTocarEnVender({ dispo: "parcial", quedaPb: 4000 }, true), P.textoAlTocarEnVender(null, true)]) {
      assert.doesNotMatch(t, /\$|COP|proveedor|marca|Distribuci|comprometid/i);
    }
  });

  prueba("Vender arma el % con la ocupación ANÓNIMA que ya tiene, y no lee nada de lo de otros", () => {
    if (!RAMA) throw new Error("sin rama de Vender");
    assert.match(podar(RAMA.texto), /ocupacionDe=\{participacionDe\}/, "Vender no le pasa la ocupación anónima a la ficha");
    assert.doesNotMatch(vista, /avisoDeParticipacion/, "volvió el aviso que mandaba a Distribución");
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /const par = tipo === "pc" \? ocupacionDe\?\.\(fixture, face\) : undefined;/, "el % no sale de la ocupación de esa cara");
    assert.match(contratoTs, /const queda = tipo === "pc" \? quedaEnLaCara\(fixture, par, f0, t0\) : null;/,
      "lo que queda no se cuenta en las fechas del contrato");
    // Nada de lo que dice lo comprometido de otro, ni la reserva de otro
    // proveedor (`reservaHasta`, que el mapa trae para Supervisar).
    const AJENO = /\b(revisarCapacidad|comprometido|contratadoPb|loDelProveedor|useLoSuyo|textoDeLoComprometido|reservaHasta|reservado|intervalosQueCuentan|leerCara|cargarResumen)\b/;
    const hits = [];
    for (const f of ARCHIVOS_VENDER.filter(hay)) {
      codigo(f).split("\n").forEach((l, k) => { const m = l.match(AJENO); if (m) hits.push(`${f}:${k + 1} — ${m[1]}`); });
    }
    assert.deepEqual(hits, [], `Vender lee lo de otros:\n         ${hits.join("\n         ")}`);
    // La barra: este contrato, lo libre y lo rayado «no disponible», sin dueño.
    const linea = codigo("src/components/Contrato/LineaDelContrato.tsx");
    const por = (linea.match(/export function Porcentaje\([^]*?\n\}\n/) || [""])[0];
    assert.ok(por.length > 300, "no se encontró el porcentaje de la línea");
    for (const t of ['className="suyo"', 'className="queda"', 'className="no"', "en este contrato", "sigue libre", "lo rayado no está disponible", "Todo lo que queda"]) {
      assert.ok(por.includes(t), `al porcentaje le falta ${t}`);
    }
    assert.doesNotMatch(por, /proveedor|marca|zona|supplier|comprometid/i, "el porcentaje habla de alguien o de una forma");
    assert.match(linea, /const RAPIDOS = \[1000, 2500, 5000\];/, "los botones rápidos no son 10 · 25 · 50 %");
    assert.match(por, /\{RAPIDOS\.map\(/, "el porcentaje no dibuja los botones rápidos");
    const noEntra = (linea.match(/export function textoDeNoEntra\([^]*?\n\}/) || [""])[0];
    assert.match(noEntra, /Ya no entra el \$\{pct\(l\.pb\)\}/, "la línea no avisa antes de guardar que el % ya no entra");
    assert.doesNotMatch(noEntra, /proveedor|marca|nombre/i);
  });

  prueba("la ocupación que lee Vender es anónima: intervalos y fechas, sin proveedor, marca, valor ni número", () => {
    const api = sinComentarios(leer("src/api/participaciones.ts"));
    const tipo = (api.match(/export interface OcupacionOut \{[\s\S]*?\n\}/) || [""])[0];
    assert.ok(tipo, "no se encontró OcupacionOut en api/participaciones.ts");
    assert.match(tipo, /intervalos: \{ desde: string; hasta: string; pb: number \}\[\]/);
    assert.doesNotMatch(tipo, /proveedor|supplier|marca|valor|numero|nombre/i, "la ocupación trae algo que no es anónimo");
  });

  prueba("Vender cuenta la cara por participación con la ocupación, y el trabajador nunca ve el %", () => {
    const dispoDef = DEF_INT.get("dispoDeCara")?.texto ?? "";
    assert.match(dispoDef, /disponibilidadDeCara\(f, face\.face, estadoComercial, indicePartes, sede, mapRange\.from, mapRange\.to, participacionDe\(f, face\.face\)\)/,
      "el plano, la tarifa y los contadores de Vender no miran la ocupación de la cara por participación");
    const comoDef = DEF_INT.get("comoSeLibera")?.texto ?? "";
    assert.match(comoDef, /comoSeLiberaPorParticipacion\(f, participacionDe\(f, face\.face\), mapRange\.from, mapRange\.to, isAdmin\)\s*\?\? comoSeLiberaLaCara\(/,
      "el rótulo de la cara por participación no sale de la ocupación, o el % no depende de quién mira");
    const carasDef = DEF_INT.get("carasConSusPartes")?.texto ?? "";
    assert.match(carasDef, /ocupadoPorParticipacion\(participacionDe\(f, c\.face\)\)/, "«Cuándo se libera» da libre una cara por participación con algo comprometido");
    assert.match(sinComentarios(leer("src/utils/partes.ts")),
      /if \(porParticipacion\(f\)\) \{\s*return lista\.some\(\(x\) => x\.id === f\.id && x\.face === cara\)\s*\? lista\.filter\(\(x\) => !\(x\.id === f\.id && x\.face === cara\)\)\s*: \[\.\.\.lista, \{ id: f\.id, face: cara, pc: true \}\];\s*\}\s*if \(!seVendeAlgo\(f\)\) return \[\];/,
      "tocar en Vender una cara por participación hace otra cosa que sumar (o sacar) su porcentaje");
  });

  prueba("la pastilla de la tarifa y «Negociar» meten una cara por participación como su PORCENTAJE, nunca entera", () => {
    const alternar = DEF_INT.get("alternarCara")?.texto ?? "";
    assert.match(alternar, /if \(f && porParticipacion\(f\)\) return \[\.\.\.lista, \{ id, face, pc: true \}\];/,
      "la pastilla suma entera una cara por participación");
    assert.match(vista, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); destacar\(null\); alternarCara\(d\.fixture\.id, d\.face\); \}\}/,
      "la pastilla de una cara por participación no la suma al contrato");
    assert.doesNotMatch(vista, /aria-disabled=\{d\.porParticipacion/, "la pastilla sigue diciendo que no se suma");
    assert.match(vista, /\{!entra && d\.porParticipacion && <span className="chip__f">por porcentaje<\/span>\}/,
      "la pastilla de una cara por participación no dice que entra como porcentaje");
    const negociar = DEF_INT.get("negociar")?.texto ?? "";
    assert.match(negociar, /setEnContrato\(\[porParticipacion\(f\) \? \{ id: f\.id, face, pc: true \}/,
      "«Negociar» vende entera una cara por participación");
  });

  prueba("renovar una participación abre Vender con el contrato armado (su %, el término que renueva), no Distribución", () => {
    const renovar = DEF_INT.get("renovar")?.texto ?? "";
    assert.match(renovar, /if \(entry\.parte && esParticipacion\(entry\.parte\)\) \{\s*void renovarParticipacion\(entry\);\s*return;\s*\}/,
      "renovar una participación no pasa por su semilla");
    const rp = DEF_INT.get("renovarParticipacion")?.texto ?? "";
    assert.match(rp, /negociar\(f, entry\.face, semillaPc\);/, "renovar una participación no abre Vender");
    assert.doesNotMatch(rp, /abrirEnDistribucion|pedirEnfoque3D/, "renovar una participación sigue yendo a Distribución");
    assert.match(rp, /if \(t && t\.estado === "contrato" && \(t\.estado_visible === "vigente" \|\| t\.estado_visible === "firmado"\)\) termino = t\.id;/,
      "renovar marca para renovar una reserva, un vencido o un cancelado");
    assert.match(rp, /porcentajes: \{ \[caraCompleta\]: t\.puntos_basicos \},/, "la semilla no trae el % que se renueva");
    assert.match(rp, /renueva: termino \? \{ \[caraCompleta\]: termino \} : \{\},/, "la semilla no dice qué término renueva");
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /participacion: \{ cara: l\.codigoCara, puntos_basicos: l\.pb, renueva: l\.renueva \},/,
      "el guardado no manda el término que se renueva");
    const comp = sinComentarios(leer("src/components/Distribucion/ParticipacionesDeLaCara.tsx"));
    assert.match(comp, /pedir\(fixtureId, cara, \{ distribucion: renovar \? \{ renovar \} : \{\} \}\)/,
      "«Abrir en Distribución» de Supervisar no pide entrar a Distribución (`pedirEnfoque3D` con `distribucion`)");
  });

  prueba("lo de las participaciones que es de administración no se alcanza desde Vender", () => {
    if (!SUP) throw new Error("sin superficie");
    const hits = [];
    for (const r of SUP.regiones) {
      r.texto.split("\n").forEach((l, k) => {
        const m = l.match(/<\s*(RevisarParticipaciones|ParticipacionesDeLaCara|TablaDeParticipaciones)\b|\b(leerCara|cargarResumen|useRevisionDeParticipaciones|revisionPc|renovarParticipacion)\b/);
        if (m) hits.push(`${r.archivo}:${r.desde + k + 1}${r.nombre ? ` (${r.nombre})` : ""} — ${m[1] ?? m[2]}`);
      });
    }
    assert.deepEqual([...new Set(hits)], [], `Vender alcanza datos de participaciones con nombres o montos:\n         ${[...new Set(hits)].join("\n         ")}`);
  });
}

/* ── fase 2 · I6 — G2: delante del proveedor, ninguna forma ─────────────────
   Decisión de la dueña (2026-10-18, «sólo lo suyo y lo libre»): delante del
   proveedor, ninguna zona dibujada —ni la suya— y nada de otros. Hoy se
   cumple: las zonas se dibujan sólo en el Editor 3D → Distribución, que no
   entra en Presentar, en el visor ni en Vender (la guarda «el visor no le pasa
   la capa Distribución a la escena», arriba). Esto fija el resto: lo que
   Vender dice de una cara por participación no recibe proveedor ni nombre
   —no puede decir de quién es nada, sólo lo libre— y ningún archivo de Vender
   importa la API ni el store de las participaciones, ni lo que dibuja zonas. */
console.log("\nvender · delante del proveedor, ninguna forma (fase 2)");
{
  const partesTs = sinComentarios(leer("src/utils/partes.ts"));
  /** La firma (sus paréntesis) y el cuerpo (sus llaves) de una función exportada. */
  const funcionTs = (nombre) => {
    const i = partesTs.indexOf(`export function ${nombre}(`);
    assert.ok(i >= 0, `no está ${nombre} en utils/partes.ts: un renombre falla, no se saltea`);
    const desde = i + `export function ${nombre}`.length;
    let j = desde, prof = 0;
    for (; j < partesTs.length; j++) {
      if (partesTs[j] === "(") prof++;
      else if (partesTs[j] === ")" && --prof === 0) break;
    }
    const k = partesTs.indexOf("{", j);
    let fin = k, llaves = 0;
    for (; fin < partesTs.length; fin++) {
      if (partesTs[fin] === "{") llaves++;
      else if (partesTs[fin] === "}" && --llaves === 0) break;
    }
    return { firma: partesTs.slice(desde, j + 1), cuerpo: partesTs.slice(k, fin + 1) };
  };

  prueba("lo que Vender dice de una cara por participación no recibe proveedor ni nombre: sólo lo libre", () => {
    for (const nombre of ["textoAlTocarEnVender", "textoDeParticipacion"]) {
      const { firma, cuerpo } = funcionTs(nombre);
      assert.ok(firma.startsWith("(") && firma.endsWith(")"), `no se pudo leer la firma de ${nombre}`);
      assert.doesNotMatch(firma, /proveedor|supplier|marca|nombre|termino|zona|participaciones/i,
        `${nombre} recibe algo con nombre o con formas: ${firma}`);
      assert.doesNotMatch(cuerpo, /proveedor|supplier|marca|\bzonas?\b|vertices/i, `${nombre} habla de alguien o de una forma`);
    }
  });

  prueba("ningún archivo de Vender importa la API ni el store de las participaciones, ni lo que dibuja zonas", () => {
    const prohibido = /api\/participaciones|store\/distribucionStore|components\/Distribucion\/|\.\.\/Distribucion\/|ZonasDelMueble|zonas3d|edicionDeZonas|edicionEnElMueble|zonasGeometria/;
    let leidos = 0;
    for (const f of ARCHIVOS_VENDER) {
      if (!hay(f)) continue; // lo hace fallar «los archivos de Vender existen»
      leidos++;
      const t = sinComentarios(leer(f));
      const rutas = [
        ...[...t.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]),
        ...[...t.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
      ];
      assert.ok(rutas.length > 0, `no se leyó ningún import de ${f}: la guarda no prueba nada`);
      for (const ruta of rutas) assert.doesNotMatch(ruta, prohibido, `${f} importa ${ruta}`);
    }
    assert.ok(leidos >= 2, "no se leyó ModoVender ni VisorDeVenta");
  });
}

/* ── rediseño de Vender (PR 1): el contrato que se guarda todo junto ────────
   Reemplazan, más estrictas, a las de antes: «Vender no toca
   /api/participaciones» sigue (arriba) y además Vender ESCRIBE por un solo
   módulo; «prohibido /suppliers» pasa a «sólo la ruta que completa UN
   nombre»; y lo que la línea dice de un % es sólo lo suyo y lo que queda. */
console.log("\nvender · el contrato del rediseño (todo o nada)");
{
  const CONTRATO_ARCHIVOS = [
    "src/components/Contrato/Contrato.tsx", "src/components/Contrato/ModoVender.tsx",
    "src/components/Contrato/LineaDelContrato.tsx", "src/components/Contrato/CamposDelContrato.tsx",
  ];
  const apiVender = codigo("src/api/vender.ts");

  prueba("el contrato escribe por UN módulo (`api/vender.ts`) y ese módulo sólo habla con sus dos rutas", () => {
    const hits = [];
    for (const f of CONTRATO_ARCHIVOS) {
      const t = codigo(f);
      assert.ok(t.length > 200, `no se pudo leer ${f}`);
      for (const m of t.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+["']([^"']+)["']/g)) {
        if (/\/api\//.test(m[1]) && !/\/api\/(vender|client)$/.test(m[1])) hits.push(`${f} importa ${m[1]}`);
      }
    }
    for (const f of ARCHIVOS_VENDER.filter(hay)) if (/api\/bulkLeases|confirmarLote|validarLote/.test(codigo(f))) hits.push(`${f} usa la tanda de la planilla (no es todo o nada)`);
    assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
    const rutas = [...apiVender.matchAll(/client\s*\.\s*(get|post|put|patch|delete)\s*<[^>]*>\s*\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(rutas.sort(), ["get /suppliers/completar", "post /contratos/vender", "post /contratos/vender"], `api/vender.ts habla con: ${rutas.join(", ")}`);
    const reexportes = [...apiVender.matchAll(/export\s*(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    assert.deepEqual(reexportes, [], "api/vender.ts pasa otro módulo de escritura");
    assert.match(apiVender, /params: \{ validar: 1 \}/, "la vista previa no es `?validar=1` (escribiría)");
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /const resp = await guardarContrato\(lo\);/, "el contrato no se guarda con `guardarContrato`");
    assert.equal((contratoTs.match(/\bguardarContrato\(/g) || []).length, 1, "el contrato se guarda por más de un camino");
  });

  prueba("el proveedor se completa con UN nombre: nunca una lista", () => {
    const comp = (apiVender.match(/export const completarProveedor = [^]*?;\n/) || [""])[0];
    assert.match(comp, /Promise<string \| null>/, "completar el proveedor devuelve algo más que un nombre");
    assert.match(comp, /client\s*\.get<\{ nombre: string \| null \}>\("\/suppliers\/completar"/, "completar el proveedor no pide UN nombre");
    const campos = codigo("src/components/Contrato/CamposDelContrato.tsx");
    const campo = (campos.match(/export function CampoProveedor\([^]*?\n\}\n/) || [""])[0];
    assert.ok(campo.length > 300, "no se encontró el campo del proveedor");
    assert.match(campo, /completarProveedor\(escrito\)/, "el campo no completa desde lo escrito");
    assert.match(campo, /plano\(escrito\)\.length < 3/, "el campo pregunta antes de la tercera letra");
    assert.match(campo, /e\.key === "Tab"/, "Tab no acepta el nombre");
    assert.doesNotMatch(campo, /\.map\(|<li\b|<ul\b|listbox|<option\b|datalist/, "el campo del proveedor dibuja una lista");
    // En toda la superficie de Vender, `/suppliers` sólo para completar.
    const rutas = [];
    for (const f of ARCHIVOS_VENDER.filter(hay)) for (const m of codigo(f).matchAll(/["'`](\/suppliers[^"'`]*)["'`]/g)) rutas.push(m[1]);
    assert.deepEqual(rutas, ["/suppliers/completar"], `Vender pide: ${rutas.join(", ")}`);
  });

  prueba("un 409 se dice en la línea —«Ya no entra… No se guardó nada.»— con «Bajar a X %» y «Cambiar fechas»", () => {
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /const filas = filasRechazadas\(e\);/, "el guardado no lee el 409 por línea");
    assert.match(apiVender, /d\.code !== "contrato_invalido"/, "el 409 que se lee no es `contrato_invalido`");
    assert.match(contratoTs, /titulo: pbPedido \? `Ya no entra el \$\{pct\(pbPedido\)\}\.` : /, "el rechazo no dice qué % ya no entra");
    assert.match(contratoTs, /detalle: `\$\{f\.desde_dia \? `Desde el \$\{diaCorto\(f\.desde_dia\)\} queda` : "Queda"\} \$\{pct\(f\.queda_pb\)\}\.`/,
      "el rechazo no dice cuánto queda y desde cuándo");
    const linea = codigo("src/components/Contrato/LineaDelContrato.tsx");
    const rech = (linea.match(/export function RechazoDeLinea\([^]*?\n\}\n/) || [""])[0];
    for (const t of ["No se guardó nada.", "Bajar a {pct(queda)}", "Cambiar fechas", 'role="alert"']) assert.ok(rech.includes(t), `al rechazo le falta ${t}`);
    assert.doesNotMatch(rech, /proveedor|marca|supplier/i, "el rechazo habla de alguien");
  });

  prueba("«Total | Al mes»: la línea entrega siempre el total (× los meses de `utils/meses.ts`)", () => {
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /const nMeses = fechasEnOrden \? meses\(desde, hasta\) : 0;/, "los meses no salen de `utils/meses.ts`");
    assert.match(contratoTs, /: modo === "mensual" \? redondear\(numero \* nMeses\) : numero;/, "«al mes» no se convierte en el total de la línea");
    assert.match(contratoTs, /valor: conVentas \? 0 : relleno \? \(l\.monto > 0 \? l\.monto : 1\) : l\.monto,/, "un % manda otra cosa que el total");
    assert.match(contratoTs, /modo_precio: l\.modo, valor_tecleado:/, "el servidor no se entera de cómo se escribió el precio");
  });

  prueba("«Reservar hasta…»: para cualquier línea, la fecha arranca vacía y el amarillo es uno solo", () => {
    const contratoTs = codigo("src/components/Contrato/Contrato.tsx");
    assert.match(contratoTs, /const \[caduca, setCaduca\] = useState\(""\);/, "la reserva arranca con una fecha");
    assert.match(contratoTs, /const faltaReserva = !caduca\s*\? "Elegí hasta cuándo se sostiene la reserva\."/, "sin fecha, la reserva no lo dice");
    assert.match(contratoTs, /caduca > hasta\s*\? "La reserva no puede durar más que el contrato\."/, "la reserva puede durar más que el contrato");
    // Para cualquier línea y con cualquier cobro (el dueño, 2026-10-19 y
    // 2026-10-20): lo mismo que pide el contrato, ni más ni menos.
    assert.match(contratoTs, /const puedeReservar = puedeGuardar;/, "la reserva pide otra cosa que el contrato");
    assert.doesNotMatch(contratoTs, /every\(\(l\) => l\.tipo === "pc"\)/, "la reserva quedó sólo para porcentajes (el dueño la abrió a todo)");
    assert.match(contratoTs, /tipo,\s*caduca: tipo === "reserva" \? caduca \|\| null : null,\s*cobro: conVentas && !relleno \? cobro :/,
      "la reserva no manda su cobro (el % de las ventas y el corte)");
    // Lo guardado dice, una vez y sin alarma, dónde se carga la planometría.
    assert.match(modoCodigo, /data-planometria-en-supervisar>La planometría se carga en Supervisar, en la ficha del espacio\.<\/p>/,
      "lo guardado no dice dónde se carga la planometría");
    assert.doesNotMatch(contratoTs, /avisoPlanometria|subirPlanometria/, "el guardado de Vender sigue subiendo la planometría");
    assert.equal((modoCodigo.match(/className="btn-principal"/g) || []).length, 1, "ModoVender pinta más de un botón principal");
    assert.match(modoCodigo, /<Hourglass \{\.\.\.ICONO\} \/> Reservar hasta…/, "falta «Reservar hasta…»");
    assert.match(modoCodigo, /<Check \{\.\.\.ICONO\} \/> Guardar contrato/, "el principal no dice «Guardar contrato»");
    assert.match(modoCodigo, /`Reservado hasta el \$\{diaCorto\(datos\.caduca\)\}\$\{porVentas \? ` · \$\{porVentas\}` : ""\}`/,
      "lo guardado no dice hasta cuándo se reservó, o calla que cobra por ventas");
  });
}

/* ── rediseño 2026-10 (PR 1): las barras, los íconos, la plata entera ───────
   La hoja de piezas aprobada (`docs/maquetas/rediseno-2026-10/hoja-iconos-y-piezas.html`)
   escribe cinco reglas que un refactor rompe sin que nada falle: un juego de
   íconos con UN tamaño y UN trazo, ningún ícono en pestañas ni pastillas, la
   plata siempre entera, la fila de la tarifa que también se toca (con el
   dedo no hay mouse que pase) y lo de Supervisar que Vender no puede ni
   importar: los cobros por ventas y las reservas llevan proveedores y plata. */
console.log("\nvender · rediseño 2026-10: barras, íconos, plata entera y lo que Vender no alcanza");
{
  const RUTA_DASH = "src/pages/Dashboard.tsx";
  const RUTA_COBROS_RESERVAS = "src/components/Supervisar/CobrosYReservas.tsx";
  const dashCodigo = codigo(RUTA_DASH);
  const supCodigo = codigo(RUTA_COBROS_RESERVAS);
  /** Los nombres que el archivo trae de lucide (con su alias, si lo tiene). */
  const deLucide = (t) => {
    const m = t.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/);
    if (!m) return new Set();
    return new Set(m[1].split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.split(/\s+as\s+/).pop().trim()));
  };
  /** Cada ícono de lucide dibujado en `texto` que NO va con la medida de todos:
   *  una de las constantes de 16 × 1,75 o `size={16} strokeWidth={1.75}`. */
  const ICONO_OK = /\{\.\.\.(?:ICONO_TARJETA|ICONO_BARRA|ICONO)\}|size=\{16\}\s+strokeWidth=\{1\.75\}/;
  const fueraDeMedida = (texto, lucide, donde) => {
    const out = [];
    for (const m of texto.matchAll(/<([A-Z][A-Za-z0-9]*)\b([^<>]*?)\/>/g)) {
      if (!lucide.has(m[1])) continue;
      if (!ICONO_OK.test(m[2])) out.push(`${donde}: <${m[1]}${m[2]}/>`);
    }
    return out;
  };
  const entre = (t, desde, hasta) => {
    const i = t.indexOf(desde);
    const j = i < 0 ? -1 : t.indexOf(hasta, i + desde.length);
    return i < 0 || j < 0 ? "" : t.slice(i, j);
  };

  prueba("un tamaño y un trazo: los íconos de las dos barras, las tarjetas, las cifras, el plano y «Para revisar» miden 16 con trazo 1,75", () => {
    const UNA_MEDIDA = /\{ size: 16, strokeWidth: 1\.75, "aria-hidden": true \} as const;/;
    assert.match(vista, new RegExp(`const ICONO_TARJETA = ${UNA_MEDIDA.source}`), "`ICONO_TARJETA` no es 16 × 1,75");
    assert.match(dashCodigo, new RegExp(`const ICONO_BARRA = ${UNA_MEDIDA.source}`), "`ICONO_BARRA` no es 16 × 1,75");
    assert.match(supCodigo, new RegExp(`const ICONO = ${UNA_MEDIDA.source}`), "el `ICONO` de «Para revisar» no es 16 × 1,75");
    const lucideVista = deLucide(vista);
    const regiones = [
      [`${RUTA_DASH} (Topbar)`, entre(dashCodigo, "function Topbar(", "export default function Dashboard("), deLucide(dashCodigo)],
      [`${VISTA} (la barra de la sede)`, entre(vista, '<div className="barra-pantalla">', "{periodoAbierto && ("), lucideVista],
      [`${VISTA} (las herramientas del plano)`, entre(vista, '<div className="herr">', "<svg"), lucideVista],
      [`${VISTA} (las tarjetas de Vender)`, ["panelPlano", "panelEscalera", "panelTarifas"].map((n) => DEF_INT.get(n)?.texto ?? "").join("\n"), lucideVista],
      [`${VISTA} (CardHeader y Cifra)`, [...vista.matchAll(/<(?:CardHeader|Cifra)\b[\s\S]{0,260}/g)].map((m) => m[0]).join("\n"), lucideVista],
      [RUTA_COBROS_RESERVAS, supCodigo, deLucide(supCodigo)],
      ["src/components/Distribucion/RevisarParticipaciones.tsx", entre(codigo("src/components/Distribucion/RevisarParticipaciones.tsx"), "export default function RevisarParticipaciones(", "\nconst celda"), deLucide(codigo("src/components/Distribucion/RevisarParticipaciones.tsx"))],
      ["src/tema.tsx (TemaToggle)", entre(codigo("src/tema.tsx"), "export function TemaToggle(", "\n}\n"), deLucide(codigo("src/tema.tsx"))],
      // Rediseño de Supervisar (PR 2): «Falta planometría», la ficha de una
      // cara por participación, la chincheta del plano y la ficha del espacio.
      ["src/components/Supervisar/FaltaPlanometria.tsx", codigo("src/components/Supervisar/FaltaPlanometria.tsx"), deLucide(codigo("src/components/Supervisar/FaltaPlanometria.tsx"))],
      ["src/components/Distribucion/ParticipacionesDeLaCara.tsx", codigo("src/components/Distribucion/ParticipacionesDeLaCara.tsx"), deLucide(codigo("src/components/Distribucion/ParticipacionesDeLaCara.tsx"))],
      [`${VISTA} (la ficha del espacio)`, entre(vista, '<div className="ficha-cab">', "{double && ("), lucideVista],
    ];
    const vacias = regiones.filter(([, t]) => t.length < 80).map(([d]) => d);
    assert.deepEqual(vacias, [], `no se encontraron estas regiones (cambió el anclaje): ${vacias.join(", ")}`);
    const mal = regiones.flatMap(([d, t, l]) => fueraDeMedida(t, l, d));
    assert.deepEqual(mal, [], `íconos fuera de la medida de la hoja de piezas:\n         ${mal.join("\n         ")}`);
    // Cada región dibuja al menos un ícono: un test que no mira nada no pasa.
    const sinIconos = regiones.filter(([, t, l]) => ![...t.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].some((m) => l.has(m[1]))).map(([d]) => d);
    assert.deepEqual(sinIconos, [], `regiones sin un solo ícono: ${sinIconos.join(", ")}`);
    // Los botones de ícono de la barra miden 32, y el sol/luna también.
    assert.match(entre(dashCodigo, "function Topbar(", "export default function Dashboard("), /width: 32, height: 32, borderRadius: "var\(--r-md\)"/, "los botones de ícono de la barra no miden 32");
    assert.match(entre(codigo("src/tema.tsx"), "export function TemaToggle(", "\n}\n"), /width: 32, height: 32/, "el sol/luna no mide 32");
    // La sincronización es un punto y su palabra: sin nube, sin ícono.
    assert.equal(deLucide(codigo("src/components/SyncStatus/SyncStatus.tsx")).size, 0, "la sincronización volvió a llevar ícono (va punto y palabra)");
    // «Aire y pines»: los puntos del plano de Supervisar NO llevan ícono —ni
    // globo ni palito—: un botón vacío que el CSS pinta como un punto. (Antes
    // esta región estaba en la lista de arriba, que exige 16 × 1,75; ahora no
    // puede dibujar ningún ícono, de ningún tamaño.)
    const puntos = entre(vista, '<div className="chinchetas">', "</div>");
    assert.ok(puntos.length > 80, "no se encontraron los puntos del plano");
    const iconosEnPuntos = [...puntos.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]).filter((n) => lucideVista.has(n));
    assert.deepEqual(iconosEnPuntos, [], "un punto del plano volvió a llevar ícono");
    assert.match(puntos, /<button\s+key=\{k\}\s+type="button"\s+className="punto-revisar"/, "el punto del plano no es un botón");
    assert.doesNotMatch(puntos, /<\/button>/, "el punto del plano no es un botón vacío: lleva algo adentro");
    // «Tarifas» lleva la etiqueta (`Tag`), la misma de la tarjeta: un concepto, un ícono.
    assert.doesNotMatch(vista, /SlidersHorizontal/, "«Tarifas» volvió a `SlidersHorizontal`");
  });

  prueba("sin ícono en las pestañas ni en las pastillas: la de la app, Vender | Supervisar y la cuenta roja dicen sólo la palabra o el número", () => {
    const topbar = entre(dashCodigo, "function Topbar(", "export default function Dashboard(");
    const tab = entre(topbar, "onClick={() => setViewMode(id)}", "</button>");
    assert.ok(tab.length > 50, "no se encontró el botón de la pestaña");
    assert.match(tab, />\s*\{label\}\s*$/, "la pestaña de la app dibuja algo más que su palabra");
    const barra = entre(vista, '<div className="barra-pantalla">', "{periodoAbierto && (");
    const modo = entre(barra, "onClick={() => setModo(id)}", "</button>");
    assert.ok(modo.length > 30, "no se encontró el botón de Vender | Supervisar");
    assert.match(modo, /\{label\}\s*\{badge > 0 && \(\s*<span className="cuenta" aria-label=\{`\$\{badge\} para revisar`\}>\{badge\}<\/span>\s*\)\}/,
      "Vender | Supervisar lleva algo más que la palabra y la cuenta, o la cuenta lleva algo más que el número");
    // La pastilla roja de la cuenta: fondo rojo, número en mono, sin ícono.
    const css = sinComentarios(leer("src/vender.css"));
    const cuenta = (css.match(/\.barra-pantalla \.cuenta \{([^}]*)\}/) || [, ""])[1];
    assert.match(cuenta, /background: var\(--ocupado\);/, "la cuenta de Supervisar no es la pastilla roja");
    // Las tres piezas, en su orden: dónde, qué y de qué fechas; a la derecha, hoy y lo de la sede.
    const orden = ["<MapPin", 'className="sede-sel"', 'className="cuantos"', 'className="pieza modos"', 'className="pieza periodo"', "<CalendarRange",
      'className="hoy"', "<FileSpreadsheet", "<Tag", "<RefreshCw"].map((t) => [t, barra.indexOf(t)]);
    for (const [t, k] of orden) assert.ok(k >= 0, `a la barra de la sede le falta ${t}`);
    assert.deepEqual(orden.map(([, k]) => k), [...orden.map(([, k]) => k)].sort((a, b) => a - b),
      `la barra de la sede no va en el orden de la hoja de piezas: ${orden.map(([t]) => t).join(" → ")}`);
    // A lo angosto envuelve, sin empujar la página de costado.
    assert.match((css.match(/\.barra-pantalla \{([^}]*)\}/) || [, ""])[1], /flex-wrap: wrap;/, "la barra de la sede no envuelve");
    assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.barra-pantalla \.hoy, \.barra-pantalla \.cuantos, \.btn-barra \.txt \{ display: none; \}/,
      "a lo angosto la barra de la sede no se aprieta");
    for (const etiqueta of ["Planilla", "Tarifas", "Actualizar"]) {
      assert.match(barra, new RegExp(`aria-label="${etiqueta}"`), `«${etiqueta}» pierde su nombre cuando a lo angosto queda sólo el ícono`);
    }
  });

  prueba("cada tarjeta lleva su ícono antes del título: el piso, cuándo se libera y la tarifa en Vender; la franja, «Para revisar», la tabla, el canon y las participaciones en Supervisar", () => {
    // CardHeader dibuja el ícono ANTES del título.
    const cab = DEF_TOP.get("CardHeader")?.texto ?? "";
    assert.ok(cab.indexOf("{icon}") > 0 && cab.indexOf("{icon}") < cab.indexOf("{title}"), "CardHeader no dibuja el ícono antes del título");
    // (Rediseño de Supervisar, PR 2: el piso de Supervisar es el MISMO panel
    // que el de Vender —`vp vp-plano`, con su `MapIcon`—, para que el plano
    // mida lo mismo; ya no es un `CardHeader`. Se exige abajo, en las dos.)
    const ESPERADO = [
      ["title={sede}", "Gauge"], ['title="Para revisar"', "ClipboardCheck"],
      ["title={titulo}", "Table2"], ['title="Quién paga el canon"', "Building2"], ['title="Participaciones de cara"', "Percent"],
    ];
    const tags = [...vista.matchAll(/<CardHeader\b[\s\S]{0,260}/g)].map((m) => m[0]);
    for (const [titulo, icono] of ESPERADO) {
      const t = tags.find((x) => x.slice(0, x.indexOf(titulo) + 1).length && x.includes(titulo) && x.indexOf(titulo) < 200);
      assert.ok(t, `no hay una tarjeta con ${titulo}`);
      assert.match(t.slice(0, t.indexOf(titulo)), new RegExp(`icon=\\{<${icono} \\{\\.\\.\\.ICONO_TARJETA\\} />\\}`), `la tarjeta ${titulo} no lleva el ícono ${icono}`);
    }
    assert.equal(tags.length, ESPERADO.length, `hay ${tags.length} encabezados de tarjeta y se esperaban ${ESPERADO.length}: una tarjeta nueva tiene que decir su ícono acá`);
    // Vender: el ícono donde iba el número del panel.
    assert.equal((vista.match(/<MapIcon \{\.\.\.ICONO_TARJETA\} className="ico-tarjeta" \/>\s*<h2>Piso de \{sede\}<\/h2>/g) ?? []).length, 2,
      "el piso no lleva su ícono (MapIcon) antes del título en las DOS pantallas");
    for (const [icono, titulo] of [["MapIcon", "Piso de {sede}"], ["Clock", "Cuándo se libera cada espacio"], ["Tag", "Tarifa de referencia"]]) {
      assert.match(vista, new RegExp(`<${icono} \\{\\.\\.\\.ICONO_TARJETA\\} className="ico-tarjeta" />\\s*<h2>${titulo.replace(/[{}]/g, "\\$&")}</h2>`),
        `la tarjeta «${titulo}» de Vender no lleva su ícono (${icono}) antes del título`);
    }
    assert.doesNotMatch(vista, /className="ojo"/, "volvió el número de panel");
    // Las cifras de Supervisar: su ícono al lado del rótulo; rojo sólo en la alarma.
    const CIFRAS = [["Canon vigente", "Banknote"], ["Sin alquilar", "CircleDashed"], ["Vence en 30 días", "AlarmClock"],
      ["Libres", "CircleDashed"], ["Ocupación", "PieChart"], ["Sin montar", "Hammer"]];
    for (const [rotulo, icono] of CIFRAS) {
      assert.match(vista, new RegExp(`<Cifra\\s+icono=\\{<${icono} \\{\\.\\.\\.ICONO_TARJETA\\} />\\}\\s+rotulo="${rotulo}"`), `la cifra «${rotulo}» no lleva ${icono}`);
    }
    assert.equal((vista.match(/<Cifra\b/g) || []).length, 7, "una cifra nueva tiene que decir su ícono acá");
    const cifra = DEF_TOP.get("Cifra")?.texto ?? "";
    assert.match(cifra, /color: alarma \? "var\(--ocupado-txt\)" : "var\(--ink-3\)",/, "el ícono de la cifra no es gris en reposo y rojo en la alarma");
    for (const m of vista.matchAll(/<Cifra\s+icono=\{<AlarmClock[\s\S]*?\/>\s*\n/g)) assert.match(m[0], /\balarma\b/, "«Vence en 30 días» dejó de ser una alarma");
    // La pista del plano lleva el mouse, y el ícono no va en la ayuda del dedo.
    assert.match(vista, /<span className="con-mouse"><Mouse \{\.\.\.ICONO_TARJETA\} \/>Arrastrá para girar/, "la pista del plano no lleva el ícono `Mouse`");
  });

  prueba("la plata se escribe entera en Vender y en Supervisar: ni «M», ni «k», ni `compactCOP`", () => {
    const ARCHIVOS_PLATA = [VISTA, ...ARCHIVOS_VENDER, RUTA_COBROS_RESERVAS, "src/components/Distribucion/RevisarParticipaciones.tsx",
      "src/components/Distribucion/ParticipacionesDeLaCara.tsx",
      // Rediseño de Supervisar (PR 2): la plata en una unidad y sus piezas.
      "src/components/Supervisar/plata.ts", "src/components/Supervisar/FaltaPlanometria.tsx", "src/components/Supervisar/piezas.tsx"].filter(hay);
    const ABREVIA = /compactCOP|notation\s*:\s*["']compact|\/\s*1e[36]\b|\/\s*1_?000(?:_?000)?\b|["'`]\s*(?:M|k|mil|millones|mill\.?)\s*["'`]/;
    const hits = [];
    for (const f of ARCHIVOS_PLATA) codigo(f).split("\n").forEach((l, k) => { if (ABREVIA.test(l)) hits.push(`${f}:${k + 1} ${l.trim().slice(0, 100)}`); });
    assert.deepEqual(hits, [], `plata abreviada:\n         ${hits.join("\n         ")}`);
    assert.match(vista, /function formatCOP\(n: number\): string \{\s*if \(!n\) return "—";\s*return money\(n\);\s*\}/, "`formatCOP` no es la plata entera de `money`");
    assert.match(codigo("src/components/Contrato/Contrato.tsx"), /export const money = \(n: number\) => "\$ " \+ Math\.round\(n\)\.toLocaleString\("es-CO"\);/);
    assert.match(supCodigo, /import \{ money \} from "\.\.\/Contrato\/Contrato";/, "«Para revisar» escribe la plata con otra cuenta");
    assert.equal((1400000).toLocaleString("es-CO"), "1.400.000", "este Node no tiene el formato de Colombia: la prueba de la plata no puede afirmar nada");
  });

  prueba("la fila de la tarifa se FIJA con un clic o un toque (y con Enter), y las pastillas siguen sumando al contrato", () => {
    const panel = DEF_INT.get("panelTarifas")?.texto ?? "";
    assert.ok(panel.length > 500, "no se encontró `panelTarifas`");
    const tr = entre(panel, "<tr\n", ">\n                <td>{nombreDeTarifa(cat, nombresPropios)}</td>");
    assert.ok(tr.length > 100, "no se encontró la fila del tipo");
    assert.match(tr, /onClick=\{\(\) => setTipoFijado\(\(x\) => \(x === cat \? null : cat\)\)\}/, "tocar la fila no la fija (con el dedo no hay mouse que pase)");
    assert.match(tr, /onKeyDown=\{\(e\) => \{\s*if \(e\.key !== "Enter" && e\.key !== " "\) return;\s*e\.preventDefault\(\);\s*setTipoFijado\(\(x\) => \(x === cat \? null : cat\)\);/, "la fila no se fija con el teclado");
    assert.match(tr, /tabIndex=\{0\}/, "la fila no entra en el orden del teclado");
    assert.match(tr, /onMouseEnter=\{\(\) => destacar\(claves\)\}\s*onMouseLeave=\{\(\) => destacar\(null\)\}/, "pasar el mouse dejó de encender los muebles");
    assert.match(tr, /tipoFijado === cat \? "fijada" : ""/, "la fila fijada no se distingue");
    // Apagar vuelve a lo fijado, no a la sala entera; y lo fijado sigue a las caras del tipo.
    const dest = DEF_INT.get("destacar")?.texto ?? "";
    assert.match(dest, /const claves = claves0 \?\? fijadoEnPlano\.current;/, "apagar el resaltado suelta lo fijado");
    assert.match(vista, /fijadoEnPlano\.current = fila \? fila\.claves : null;\s*destacar\(null\);/, "lo fijado no enciende las caras de su tipo");
    assert.match(vista, /if \(tipoFijado && !fila\) \{ setTipoFijado\(null\); return; \}/, "un tipo que se fue de la tabla queda fijado");
    // La pastilla: un clic la suma al contrato (y no fija la fila de abajo).
    assert.match(panel, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); destacar\(null\); alternarCara\(d\.fixture\.id, d\.face\); \}\}/, "la pastilla dejó de sumar al contrato con un clic");
    const css = sinComentarios(leer("src/vender.css"));
    assert.match(css, /\.vender \.tabla tr\.fijada td,[\s\S]*?\{ background: var\(--libre-suave\); \}/, "la fila fijada no se pinta");
  });

  prueba("el mínimo para el dedo: cada mueble que vende algo se toca en por lo menos 44 × 44 px de pantalla, sin cambiar lo dibujado ni el deschoque", () => {
    const iso = DEF_TOP.get("IsoMap")?.texto ?? "";
    assert.match(vista, /const MINIMO_AL_TOCAR = 44;/, "el mínimo para tocar no es 44 px");
    const ajuste = entre(iso, "const ajustarMinimos = useCallback(", "}, [encuadre]);");
    assert.match(ajuste, /const lado = MINIMO_AL_TOCAR \/ c\.k;/, "el mínimo no se mide en píxeles de PANTALLA (no divide por la escala)");
    assert.match(ajuste, /if \(w \* c\.k >= MINIMO_AL_TOCAR && h \* c\.k >= MINIMO_AL_TOCAR\) \{\s*el\.setAttribute\("width", "0"\);/, "un mueble que ya mide eso igual lleva la caja");
    // (Rediseño de Supervisar, PR 2: con cada acercamiento también se ubican
    // las chinchetas, que Vender no recibe.)
    assert.match(iso, /const aplicar = useCallback\(\(\) => \{ escribir\(\); ajustarMinimos\(\); acomodar\(\); ubicarChinchetas\(\); \}/, "el mínimo no se recalcula con cada acercamiento");
    const capa = entre(iso, '<g className="impactos">', "</g>");
    const min = capa.indexOf('className="pl-hit pl-min"'), rot = capa.indexOf('className="pl-hit"\n');
    assert.ok(min > 0 && rot > min, "las cajas mínimas no van debajo de las de los rótulos (que tienen que seguir cobrando su clic)");
    assert.match(capa, /scene\.prisms\.filter\(\(p\) => seVendeAlgo\(p\.f\)\)/, "una columna o una caja que no vende nada roba el toque de al lado");
    // No entra al deschoque: `acomodar` mide sólo las herramientas y los rótulos.
    assert.match(iso, /querySelectorAll\("\.herr, \.herr-ayuda"\)/);
    assert.doesNotMatch(entre(iso, "const acomodar = useCallback(", "}, [aPantalla, encuadre]);"), /pl-min|minRefs/, "el deschoque de los rótulos mira las cajas mínimas");
  });

  /** Lo que un archivo importa (relativo, dentro de `src`), de punta a punta. */
  const cierreDeImportes = (archivo) => {
    const vistos = new Set();
    const cola = [archivo];
    while (cola.length) {
      const f = cola.pop();
      if (vistos.has(f) || !hay(f)) continue;
      vistos.add(f);
      const t = leer(f);
      for (const m of t.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
        const base = join(dirname(f), m[1]);
        const cand = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
          .map((x) => relative(raiz, join(raiz, x)));
        const ok = cand.find((x) => hay(x) && statSync(join(raiz, x)).isFile());
        if (ok) cola.push(ok);
      }
    }
    return vistos;
  };
  const DE_SUPERVISAR = ["src/api/cobros.ts", "src/api/reservas.ts", "src/api/montajesPendientes.ts"];

  prueba("`api/cobros` y `api/reservas` no se alcanzan desde Vender: ni un archivo de Vender los importa, ni la parte de DashboardView que Vender dibuja, ni se piden con Vender abierto", () => {
    for (const f of DE_SUPERVISAR) assert.ok(hay(f), `no está ${f}`);
    const malos = [];
    for (const f of ARCHIVOS_VENDER.filter(hay)) {
      const cierre = cierreDeImportes(f);
      for (const api of DE_SUPERVISAR) if (cierre.has(api)) malos.push(`${f} → … → ${api}`);
    }
    assert.deepEqual(malos, [], `Vender llega a lo de Supervisar:\n         ${malos.join("\n         ")}`);
    // En DashboardView: los nombres que vienen de un módulo que llega a esas
    // APIs no pueden aparecer en lo que Vender dibuja.
    const crudo = leer(VISTA);
    const nombres = new Set();
    for (const m of crudo.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = relative(raiz, join(raiz, dirname(VISTA), m[2]));
      const archivo = [`${base}.ts`, `${base}.tsx`, base].find((x) => hay(x) && statSync(join(raiz, x)).isFile());
      if (!archivo) continue;
      const cierre = cierreDeImportes(archivo);
      if (!DE_SUPERVISAR.some((api) => cierre.has(api))) continue;
      for (const n of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean)) nombres.add(n);
    }
    assert.ok(nombres.has("VentasPorCargar") && nombres.has("ReservasSinConfirmar"), "no se encontraron los bloques de Supervisar que leen cobros y reservas");
    const usados = [...nombres, "cortesSinCargar", "reservasSinConfirmar"];
    const hits = [];
    for (const r of SUP.regiones.filter((x) => x.archivo === VISTA)) {
      const ids = identificadores(r.texto);
      for (const n of usados) if (ids.has(n)) hits.push(`${n} en ${VISTA}:${r.desde + 1}${r.nombre ? ` (${r.nombre})` : ""}`);
    }
    assert.deepEqual([...new Set(hits)], [], `Vender alcanza lo de los cobros o las reservas:\n         ${[...new Set(hits)].join("\n         ")}`);
    // Y en Supervisar, sólo para quien administra: en Vender ni se piden.
    assert.match(vista, /const cortesSinCargar = useCobrosPorVentas\(\{ sede, activo: isAdmin && modoEfectivo === "supervisar" \}\);/,
      "los cortes por ventas se piden también en Vender");
    assert.match(vista, /const reservasSinConfirmar = useReservasDeEspacio\(\{ sede, activo: isAdmin && modoEfectivo === "supervisar" \}\);/,
      "las reservas de espacio se piden también en Vender");
    assert.match(vista, /\{isAdmin && cortesSinCargar\.pendientes\.length > 0 && \(\s*<VentasPorCargar\b/, "«Ventas por cargar» se monta sin `isAdmin`");
    // (Rediseño de Supervisar, PR 2: las reservas van en «Hoy» las que caducan
    // hoy y en «30 días» las demás, las dos con `isAdmin`; la cuenta es la de
    // los avisos, que corta para el trabajador ANTES de los cortes, las
    // reservas y lo que falta de planometría. Más estricto que la suma de antes:
    // `probar-comercial` corre la regla de los grupos.)
    for (const g of ["hoy", "dias30"]) {
      assert.match(vista, new RegExp(`\\{isAdmin && reservasPorGrupo\\.${g}\\.length > 0 && \\(\\s*<ReservasSinConfirmar\\b`), `«Reservas» (${g}) se monta sin \`isAdmin\``);
      assert.match(vista, new RegExp(`\\{isAdmin && planometriaPorGrupo\\.${g}\\.length > 0 && \\(\\s*<FaltaPlanometria\\b`), `«Falta planometría» (${g}) se monta sin \`isAdmin\``);
    }
    // La MISMA lista que `probar-comercial` (`casos/avisos-de-revision.mjs`):
    // todo lo de administración —bajo tarifa, lo que sólo vive en el plano, los
    // montajes, los cortes, las reservas, la planometría, las participaciones—
    // después del corte, y nada que no esté en la lista.
    const avisosDef = entre(vista, "const avisos = useMemo(", "const cuentasDeRevision = useMemo(");
    assert.ok(avisosDef.length > 200, "no está `const avisos = useMemo(`");
    assert.deepEqual(revisarAvisos(avisosDef), [], "«Para revisar» le suma al trabajador lo de administración");
    assert.match(vista, /const attentionCount = cuentaDelBadge\(cuentasDeRevision\);/, "la pastilla roja no es la suma de los tres grupos");
    // «Falta planometría» sólo se pide en Supervisar y para quien administra.
    assert.match(vista, /const faltaPlanometria = useFaltaPlanometria\(\{ sede, activo: isAdmin && modoEfectivo === "supervisar" \}\);/,
      "«Falta planometría» se pide también en Vender");
    // La cuenta roja de «Supervisar» mezcla vencimientos, bajo tarifa, reservas
    // y cortes de ventas: con Vender abierto no se dibuja.
    assert.match(vista, /\{ id: "supervisar", label: "Supervisar", badge: modoEfectivo === "supervisar" \? attentionCount : 0 \}/,
      "la pastilla roja de «Supervisar» se dibuja en Vender");
    assert.match(vista, /\{badge > 0 && \(\s*<span className="cuenta"/, "la pastilla roja se dibuja aunque la cuenta sea cero");
    // Las rutas de cada módulo, y nada más.
    const rutas = (f) => [...codigo(f).matchAll(/client\s*\.(get|post|delete|put|patch)(?:<[^>]*>)?\(\s*[`"']([^`"']+)[`"']/g)].map((m) => `${m[1]} ${m[2]}`).sort();
    assert.deepEqual(rutas("src/api/cobros.ts"), ["get /cobros", "get /cobros/pendientes", "post /cobros/${leaseId}/cortes"]);
    assert.deepEqual(rutas("src/api/reservas.ts"), ["delete /reservas/${id}", "get /reservas", "post /reservas/${id}/confirmar"]);
    // Confirmar usa el precio guardado: el cuerpo va vacío.
    assert.match(codigo("src/api/reservas.ts"), /client\.post\(`\/reservas\/\$\{id\}\/confirmar`, \{\}\)/, "confirmar una reserva manda otro precio que el guardado");
    assert.deepEqual(rutas("src/api/montajesPendientes.ts"), ["get /montajes/pendientes"]);
  });

  /* Rediseño de Supervisar (PR 2): sus módulos nuevos —la plata en una unidad,
     los tres grupos de «Para revisar», sus piezas y «Falta planometría»— no se
     alcanzan desde Vender: ni un archivo de Vender los importa, ni la parte de
     `DashboardView` que Vender dibuja usa un nombre que venga de ellos. */
  prueba("los módulos de Supervisar (PR 2) no se alcanzan desde Vender", () => {
    const MODULOS = ["src/components/Supervisar/plata.ts", "src/components/Supervisar/useUnidadDePlata.ts",
      "src/components/Supervisar/paraRevisar.ts", "src/components/Supervisar/piezas.tsx",
      "src/components/Supervisar/FaltaPlanometria.tsx", "src/components/Supervisar/CobrosYReservas.tsx",
      // «Editar contrato» (2026-10-22): lo que Supervisar lee de UN contrato
      // para reabrirlo (con plata) no se alcanza desde Vender; Vender guarda
      // la edición con su propio módulo (`api/vender.ts`, `edita`).
      "src/api/edicionDeContrato.ts"];
    for (const f of MODULOS) assert.ok(hay(f), `no está ${f}`);
    const malos = [];
    for (const f of ARCHIVOS_VENDER.filter(hay)) {
      const cierre = cierreDeImportes(f);
      for (const m of MODULOS) if (cierre.has(m)) malos.push(`${f} → … → ${m}`);
    }
    assert.deepEqual(malos, [], `Vender llega a Supervisar:\n         ${malos.join("\n         ")}`);
    const crudo = leer(VISTA);
    const nombres = new Set();
    for (const m of crudo.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = relative(raiz, join(raiz, dirname(VISTA), m[2]));
      const archivo = [`${base}.ts`, `${base}.tsx`, base].find((x) => hay(x) && statSync(join(raiz, x)).isFile());
      if (!archivo || !MODULOS.includes(archivo)) continue;
      for (const n of m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean)) nombres.add(n);
    }
    assert.ok(nombres.has("useUnidadDePlata") && nombres.has("puntosDelPlano") && nombres.has("avisoPorClave") && nombres.has("FaltaPlanometria"), "no se encontraron los módulos de Supervisar en DashboardView");
    // «Aire y pines»: los puntos del plano, su botón y el renglón que señala su
    // mueble son de Supervisar: ninguno se alcanza desde Vender.
    const usados = [...nombres, "setUnidad", "plata", "avisos", "chinchetasDeRevision", "faltaPlanometria", "cuentasDeRevision",
      "pendientesEnElPlano", "setPendientesEnElPlano", "senalarEnElPlano", "senalarFila", "avisosPorClave",
      // «Editar contrato»: el botón y lo que abre son de Supervisar.
      "editarContrato", "editarFila", "accionEditar", "contratoParaEditar", "avisoDeEdicion"];
    const hits = [];
    for (const r of SUP.regiones.filter((x) => x.archivo === VISTA)) {
      const ids = identificadores(r.texto);
      for (const n of usados) if (ids.has(n)) hits.push(`${n} en ${VISTA}:${r.desde + 1}${r.nombre ? ` (${r.nombre})` : ""}`);
    }
    assert.deepEqual([...new Set(hits)], [], `Vender alcanza lo de Supervisar:\n         ${[...new Set(hits)].join("\n         ")}`);
  });
}

/* ── «Editar contrato»: Vender sólo conoce el contrato que se edita ─────────
   Vender reabre UN contrato guardado (`semilla.edita`). El `leaseId` del mapa
   comercial es de administración: en los archivos que dibujan Vender sólo se
   nombra el de la edición (`edita.leaseId`), nunca el de otro espacio, y
   nunca se pinta como texto. La exclusión del propio contrato vive en
   `utils/edicionDeContrato.ts` (pura). */
prueba("Vender sólo usa el `leaseId` del contrato que se edita, y nunca lo pinta", () => {
  const hits = [];
  for (const f of ["src/components/Contrato/ModoVender.tsx", "src/components/Contrato/Contrato.tsx",
    "src/components/Contrato/LineaDelContrato.tsx", "src/components/Contrato/CamposDelContrato.tsx",
    "src/components/Contrato/ConfirmarEdicion.tsx", "src/components/Contrato/VisorDeVenta.tsx"].filter(hay)) {
    sinComentarios(leer(f)).split("\n").forEach((l, k) => {
      if (/leaseId|lease_id/.test(l) && !/edita\??\.leaseId|lease_id: edita\.leaseId/.test(l)) hits.push(`${f}:${k + 1} — ${l.trim().slice(0, 110)}`);
      if (/>\s*\{[^}]*leaseId[^}]*\}\s*</.test(l)) hits.push(`${f}:${k + 1} pinta el leaseId`);
    });
  }
  assert.deepEqual(hits, [], `Vender nombra otros contratos:\n         ${hits.join("\n         ")}`);
  // La nota interna no se carga ni se manda editando, ni se ofrece el campo.
  const contrato = sinComentarios(leer("src/components/Contrato/Contrato.tsx"));
  assert.match(contrato, /nota: edita \? undefined : nota\.trim\(\) \|\| undefined,/);
  assert.doesNotMatch(sinComentarios(leer("src/utils/edicionDeContrato.ts")), /\bnota\b|notes|observation/);
});

/* ── la planometría no es de Vender (decisión de la dueña, 2026-10-20) ──────
   Se carga SÓLO en Supervisar, en la ficha del espacio, con el contrato ya
   hecho. Reemplaza, más estricta, a las guardas de la lámina adjunta y de la
   subida después de guardar: ni Vender ni nada de lo que Vender importa
   (siguiendo los imports, de verdad) llega al módulo de planometrías ni a una
   ruta `/planometria`, y ninguna ficha de Vender tiene un campo de archivo
   para ella. */
console.log("\nvender · la planometría se carga en Supervisar, nunca en Vender");
{
  const resolver = (desde, ruta) => {
    if (!ruta.startsWith(".")) return null;
    const base = join(dirname(join(raiz, desde)), ruta);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(c) && statSync(c).isFile()) return relative(raiz, c).split("\\").join("/");
    }
    return null;
  };
  /** Lo que un archivo importa de VERDAD (sin los `import type`, que no bajan
   *  código), también lo perezoso y lo reexportado. */
  const importsDe = (f) => {
    const t = sinComentarios(leer(f));
    return [
      ...[...t.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...t.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...t.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
      ...[...t.matchAll(/(?:^|\n)\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]),
    ];
  };
  const alcanzados = new Set();
  const cola = ARCHIVOS_VENDER.filter(hay);
  while (cola.length) {
    const f = cola.pop();
    if (alcanzados.has(f) || !/\.(ts|tsx)$/.test(f)) continue;
    alcanzados.add(f);
    for (const r of importsDe(f)) { const x = resolver(f, r); if (x && !alcanzados.has(x)) cola.push(x); }
  }

  prueba(`Vender y todo lo que importa (${alcanzados.size} archivos) no llegan a las planometrías`, () => {
    assert.ok(alcanzados.size > ARCHIVOS_VENDER.length, "no se siguió ningún import: la guarda no prueba nada");
    assert.ok(alcanzados.has("src/components/StoreEditor3D/StoreEditor3D.tsx"), "no se siguió el import perezoso del visor");
    const hits = [];
    for (const f of alcanzados) {
      const t = sinComentarios(leer(f));
      for (const r of importsDe(f)) if (/api\/planograms|\/Planometria$/.test(r)) hits.push(`${f} importa ${r}`);
      if (/["'`][^"'`]*\/planometria/.test(t)) hits.push(`${f} llama a una ruta /planometria`);
    }
    assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  });

  prueba("ninguna ficha de Vender tiene un campo para la planometría, y Vender no dibuja la de Supervisar", () => {
    const hits = [];
    for (const f of ARCHIVOS_VENDER.filter(hay)) {
      const t = sinComentarios(leer(f));
      for (const m of t.matchAll(/type=["']file["']/g)) {
        const cerca = t.slice(Math.max(0, m.index - 600), m.index + 300);
        if (/planometr/i.test(cerca)) hits.push(`${f}: un campo de archivo para la planometría`);
      }
      if (/Adjuntar cómo debe quedar|Planometría ·/.test(t)) hits.push(`${f}: el campo de planometría`);
    }
    for (const f of ["src/components/Contrato/Contrato.tsx", "src/components/Contrato/ModoVender.tsx",
      "src/components/Contrato/LineaDelContrato.tsx", "src/components/Contrato/CamposDelContrato.tsx"]) {
      if (/type=["']file["']/.test(sinComentarios(leer(f)))) hits.push(`${f}: un campo de archivo en el contrato`);
    }
    if (SUP) for (const r of SUP.regiones) if (/<\s*Planometria\b/.test(r.texto)) hits.push(`${r.archivo}${r.nombre ? ` (${r.nombre})` : ""}: dibuja <Planometria> en Vender`);
    // «Aire y pines»: lo que era «+ Correo y nota» es una fila plegable que dice
    // exactamente eso, y lo que abre no menciona la planometría.
    assert.match(modoCodigo, /<span>Correo y nota para el proveedor <span className="opc">· opcional<\/span><\/span>/, "el desplegable sigue ofreciendo la planometría");
    const plegado = modoCodigo.slice(modoCodigo.indexOf("{masDatos && ("), modoCodigo.indexOf("</Bloque>", modoCodigo.indexOf("{masDatos && (")));
    assert.ok(plegado.length > 200, "no se encontró lo que abre «Correo y nota»");
    assert.doesNotMatch(plegado, /planometr/i, "lo que abre «Correo y nota» habla de la planometría");
    assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  });
}

/* ── «aire y pines» (el dibujo aprobado después del PR 3): el contrato ──────
   El contrato al 40 % de la hoja (la proporción la guarda `probar-camara`, en
   las dos hojas), en TRES bloques numerados en el orden en que se negocia y
   con el pie FIJO: el cuerpo rueda, el total, lo que falta y «Guardar» no.
   Nada de lo que había se fue: cada pieza de antes está en su bloque. */
console.log("\nvender · aire y pines: tres bloques y el pie fijo");
{
  const entre = (t, desde, hasta, i0 = 0) => {
    const i = t.indexOf(desde, i0);
    const j = i < 0 ? -1 : t.indexOf(hasta, i + desde.length);
    return i < 0 || j < 0 ? "" : t.slice(i, j);
  };
  const ficha = entre(modoCodigo, "function Ficha(", "\nfunction porQueNoSeVe(");
  const cuerpo = entre(ficha, '<div className="cuerpo">', "{en3D && (");
  const pie = entre(ficha, "const pie = (", "\n  );\n");
  const bloques = [...cuerpo.matchAll(/<Bloque n=\{(\d)\} titulo="([^"]+)">/g)].map((m) => [Number(m[1]), m[2]]);
  const deBloque = (n) => {
    const i = cuerpo.indexOf(`<Bloque n={${n}}`);
    return i < 0 ? "" : cuerpo.slice(i, cuerpo.indexOf("</Bloque>", i));
  };

  prueba("el contrato son TRES bloques numerados, en este orden: 1 «Qué se vende», 2 «A quién y cuándo», 3 «Cómo se cobra»", () => {
    assert.ok(ficha.length > 2000 && cuerpo.length > 1500 && pie.length > 800, "no se encontró la ficha, su cuerpo o su pie");
    assert.deepEqual(bloques, [[1, "Qué se vende"], [2, "A quién y cuándo"], [3, "Cómo se cobra"]]);
    // El bloque: su número, su título (un h3, nombre del grupo para el lector) y lo suyo.
    const b = entre(modoCodigo, "function Bloque(", "\n}\n");
    assert.match(b, /<section className="bloque" data-bloque=\{n\} aria-labelledby=\{id\}>/);
    assert.match(b, /<span className="bloque-n" aria-hidden>\{n\}<\/span>\s*<h3 id=\{id\}>\{titulo\}<\/h3>/);
    // La línea fina entre bloques, y ninguna arriba del primero.
    const css = sinComentarios(leer("src/vender.css"));
    assert.match(css, /\.bloque \{[^}]*border-top: var\(--hair\) solid var\(--line-soft\);/);
    assert.match(css, /\.bloque:first-child \{ border-top: 0;/);
  });

  prueba("1 «Qué se vende»: las líneas, con «Se vende» y «El precio es» arriba de su botonera, y la pista «Sumar otro espacio» sin duplicar la del contrato vacío", () => {
    const b1 = deBloque(1);
    assert.match(b1, /\{c\.lineas\.map\(\(l\) => \(\s*<Fila\b/, "las líneas no están en el bloque 1");
    assert.match(b1, /<NoComercializable fixture=\{ultimo\} \/>/);
    // Vacío: la pista de siempre; con algo: la punteada. Nunca las dos.
    assert.match(b1, /\{c\.lineas\.length === 0 \? \(\s*<p className="pista">Elegí el primer espacio <b>tocándolo en el plano<\/b><\/p>\s*\) : \(/);
    assert.match(b1, /<p className="sumar-otro" data-pista-sumar>\s*<Plus \{\.\.\.ICONO\} \/> Sumar otro espacio: tocalo en el plano\s*<\/p>/);
    assert.ok(b1.indexOf("Elegí el primer espacio") < b1.indexOf("data-pista-sumar"), "la pista punteada no es la rama de un contrato con algo");
    // Una pista, no un control: ni botón ni `onClick`.
    assert.doesNotMatch(entre(b1, '<p className="sumar-otro"', "</p>"), /<button|onClick/);
    assert.equal((modoCodigo.match(/Agregá otro espacio/g) || []).length, 0, "quedó la pista vieja además de la nueva");
    // Lo que falta ya no va en el cuerpo (va en el pie, sobre el botón).
    assert.doesNotMatch(cuerpo, /c\.falta\b/, "lo que falta sigue arriba, en el cuerpo");
    // Cada botonera de la línea con su rótulo arriba.
    const fila = entre(modoCodigo, "function Fila(", "\n}\n");
    assert.match(fila, /<span className="rotulo-l">Se vende<\/span>\s*<FormasDeLaLinea\b/, "«Cómo se vende» sin su rótulo");
    assert.match(fila, /<span className="rotulo-l">Se vende<\/span>\s*<span className="partes"/, "las piezas (BI1 · BI2) sin su rótulo");
    assert.match(fila, /<span className="rotulo-l">El precio es<\/span>\s*<PrecioDeLinea l=\{l\} c=\{c\} \/>/, "«Total | Al mes» sin su rótulo");
  });

  prueba("2 «A quién y cuándo»: proveedor y marca (opcional), desde y hasta en dos columnas con el rótulo arriba, y los atajos debajo", () => {
    const b2 = deBloque(2);
    const orden = ['<div className="campos2">', '<span className="rotulo">Proveedor</span>', "<CampoProveedor ",
      '<span className="rotulo">Marca <i>opcional</i></span>', 'aria-label="Marca"', '<span className="rotulo">Desde</span>',
      'id="contrato-desde"', '<span className="rotulo">Hasta</span>', 'aria-label="Hasta"', "<AtajosDeFecha c={c} />"];
    const pos = orden.map((t) => b2.indexOf(t));
    assert.ok(pos.every((k) => k >= 0), `falta en el bloque 2: ${orden.filter((_, i) => pos[i] < 0).join(", ")}`);
    assert.deepEqual(pos, [...pos].sort((a, b) => a - b), "el bloque 2 no va en el orden del dibujo");
    assert.ok(b2.indexOf("<AtajosDeFecha") > b2.lastIndexOf("</div>", b2.indexOf("<AtajosDeFecha")), "los atajos no van debajo de los campos");
    const css = sinComentarios(leer("src/vender.css"));
    assert.match(css, /\.campos2 \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(css, /@media \(max-width: 520px\) \{\s*\.campos2 \{ grid-template-columns: minmax\(0, 1fr\); \}/, "a 390 px los campos no van en una columna");
  });

  prueba("3 «Cómo se cobra»: «Precio fijo | % de las ventas» a todo el ancho y «Correo y nota para el proveedor · opcional» plegable, que abre lo de siempre", () => {
    const b3 = deBloque(3);
    assert.match(b3, /^<Bloque n=\{3\} titulo="Cómo se cobra">\s*<ComoSeCobra c=\{c\} \/>/);
    assert.match(sinComentarios(leer("src/components/Contrato/CamposDelContrato.tsx")), /<span className="seg seg-ancho" role="group" aria-label="Cómo se cobra">/);
    // `aria-controls` sólo con lo plegado abierto: cerrado, el id no existe.
    assert.match(b3, /<button\s+type="button"\s+className="plegable"\s+onClick=\{\(\) => setMasDatos\(\(v\) => !v\)\}\s+aria-expanded=\{masDatos\}\s+(?:\/\*[^*]*\*\/\s*)?aria-controls=\{masDatos \? idMasDatos : undefined\}\s*>/);
    // Al abrirlo, lo abierto queda a la vista arriba del pie pegado (rodando
    // la pantalla, suave salvo «menos animaciones»).
    assert.match(ficha, /const masDatosRef = useRef<HTMLDivElement>\(null\);\s*useEffect\(\(\) => \{[\s\S]{0,1400}scrollBy\(\{ top: cuanto, behavior: suave \? "smooth" : "auto" \}\);\s*\}, \[masDatos\]\);/, "al abrir «Correo y nota» lo abierto no se trae a la vista");
    assert.match(ficha, /prefers-reduced-motion: reduce/);
    assert.match(b3, /<div className="mas-datos" id=\{idMasDatos\} ref=\{masDatosRef\}>/);
    assert.match(b3, /<ChevronDown \{\.\.\.ICONO\} className="chev" \/>/);
    const abre = entre(b3, "{masDatos && (", "</Bloque>") || b3.slice(b3.indexOf("{masDatos && ("));
    for (const t of ['aria-label="Correo para la constancia"', 'aria-label="Nota"', "<NotifyPreview sede={c.sede} />", "id={idMasDatos}"]) {
      assert.ok(abre.includes(t), `lo que abre «Correo y nota» perdió ${t}`);
    }
    assert.doesNotMatch(modoCodigo, /extra=\{/, "«Correo y nota» volvió al renglón del cobro");
  });

  prueba("el pie es FIJO: el total con su plazo y lo que cubre, lo que falta, «Guardar contrato» a todo el ancho y, debajo, «Reservar hasta…» y «Empezar de nuevo»", () => {
    // El pie va afuera del cuerpo que rueda: es un hermano, después.
    assert.match(modoCodigo, /<Panel\s+pie=\{pie\}/);
    const panel = entre(modoCodigo, "function Panel(", "\n}\n");
    assert.match(panel, /\{children\}\s*\{pie\}\s*<\/section>/, "el pie no va después del cuerpo, afuera de él");
    assert.doesNotMatch(pie, /className="cuerpo"/);
    assert.doesNotMatch(cuerpo, /btn-principal|Guardar contrato|Reservar hasta…|Empezar de nuevo|Total del contrato/, "algo del pie quedó adentro del cuerpo que rueda");
    const orden = ['data-pie-fijo', "Total del contrato", 'className="total-sub"', 'className="sello"', "{c.reservando && (",
      "c.lineas.length > 0 && c.falta", 'className="btn-principal"', "Guardar contrato", "Reservar hasta…", "Empezar de nuevo"];
    const pos = orden.map((t) => pie.indexOf(t));
    assert.ok(pos.every((k) => k >= 0), `falta en el pie: ${orden.filter((_, i) => pos[i] < 0).join(", ")}`);
    assert.deepEqual(pos, [...pos].sort((a, b) => a - b), "el pie no va en el orden del dibujo");
    assert.match(pie, /<p className="falta" data-falta role="status">\s*<CircleAlert \{\.\.\.ICONO\} \/> \{c\.falta\}\s*<\/p>/);
    // El CSS («aire y pines», la corrección): el cuerpo NO rueda —mide lo
    // suyo y rueda la pantalla—; el pie no se encoge y va PEGADO al borde de
    // abajo de la ventana (`sticky`, con la tarjeta sin recortar, que si no
    // sería ella el contenedor del `sticky`); apilado (≤ 1100) vuelve al final
    // de su tarjeta. El principal ocupa las dos columnas de los botones.
    const css = sinComentarios(leer("src/vender.css"));
    const reglaDe = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === sel).map((m) => m[2]);
    assert.match(reglaDe(".vender .cuerpo")[0] ?? "", /flex: 1 0 auto;/, "el cuerpo no mide lo suyo");
    for (const r of [...reglaDe(".vender .cuerpo"), ...reglaDe(".vp.contrato .cuerpo")]) assert.doesNotMatch(r, /overflow|max-height/, "el cuerpo del contrato rueda");
    assert.doesNotMatch(css, /\.cuerpo \{[^}]*overflow-y: (?:auto|scroll)/, "el cuerpo del contrato rueda en algún lado");
    assert.match(reglaDe(".vender")[0] ?? "", /overflow-y: auto;/, "la pantalla de Vender no rueda");
    assert.match(css, /\.pie-contrato \{\s*flex: none;/);
    assert.match(css, /\.vp\.contrato \{ overflow: visible; \}/, "la tarjeta del contrato recorta: el pie no se puede pegar");
    assert.match(css, /\.vp\.contrato > \.pie-contrato \{ position: sticky; bottom: -12px; z-index: 2; \}/, "el pie no va pegado abajo");
    // Apilado vuelve al final de su tarjeta: la regla va DESPUÉS de la que lo
    // pega (misma especificidad: si va antes, no hace nada y el pie tapa medio
    // teléfono — pasó).
    const pegado = css.indexOf(".vp.contrato > .pie-contrato { position: sticky;");
    const suelto = css.search(/@media \(max-width: 1100px\) \{\s*\.vp\.contrato > \.pie-contrato \{ position: static; \}\s*\}/);
    assert.ok(pegado > 0 && suelto > pegado, "apilado, el pie sigue pegado (la regla que lo suelta no está, o va antes de la que lo pega)");
    assert.match(css, /\.vp \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden;/);
    assert.match(css, /\.acciones2 \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    assert.match(css, /\.acciones2 \.btn-principal \{ grid-column: 1 \/ -1;/);
    // A 390 px el total pasa a una columna (nada se sale de la tarjeta).
    assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*?\.pie-contrato \.total \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
}

/* ── avisos: reglas de D que no están en el encargo de estas cinco pruebas ── */
console.log("\nvender · avisos (no fallan, pero están medidos)");
if (/--ring\s*:\s*var\(--signal/.test(temaCss)) {
  aviso("`--ring: var(--signal-ink)` en tema.css. En la referencia aprobada (D §5.6) el anillo "
    + "de foco va en tinta —`--ring: var(--ink-1)`— justamente para que «ni con foco de teclado haya "
    + "un segundo amarillo». Con el foco de teclado, hoy Vender tiene dos amarillos. Decisión del dueño.");
}
{
  const bloque = (vista.match(/DISPLAY_TOP_CLARO[\s\S]*?\n\};/) || [""])[0];
  const pares = [...bloque.matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)];
  const colores = new Set(pares.map((m) => m[2]));
  if (pares.length > colores.size) {
    aviso(`DISPLAY_TOP: ${pares.length} clases sobre ${colores.size} colores validados (pendiente escrito `
      + "del PR 1). O una paleta de siete validada, o se borra el respaldo: el mapa siempre tiene periodo.");
  }
}

/* ── la parte con navegador ───────────────────────────────────────────── */
const URL_VENDER = process.env.PROBAR_VENDER_URL;
if (!URL_VENDER) {
  console.log("\nvender · navegador: SALTADO (sin PROBAR_VENDER_URL). "
    + "Con servidor propio y sesión:\n  PROBAR_VENDER_URL=http://localhost:5210 PROBAR_VENDER_TOKEN=… npm run probar:vender");
} else {
  /* `playwright-core` NO es dependencia del frontend a propósito: `npm run
     probar` tiene que correr sin navegador. Se busca donde esté, y si no está
     se dice dónde ponerla en vez de reventar con un stack. */
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch {
    const alt = process.env.PROBAR_VENDER_PLAYWRIGHT;
    if (!alt) throw new Error("falta playwright-core: instalala o pasá PROBAR_VENDER_PLAYWRIGHT=/ruta/a/playwright-core/index.js");
    ({ chromium } = await import(alt.startsWith("file:") ? alt : "file://" + alt));
  }
  const CHROME = process.env.PROBAR_VENDER_CHROME
    ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  // WebGL por software: el visor 3D de Vender dibuja con three.js, y un
  // Chromium sin placa de video no da contexto WebGL sin SwiftShader.
  const nav = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  /** Abre Vender con sesión de administrador ya puesta en localStorage.
   *  `antes` corre con la página creada y antes de navegar (oyentes de red,
   *  rutas cortadas). */
  async function abrir(colorScheme, { antes } = {}) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    if (antes) await antes(p, ctx);
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e).split("\n")[0]));
    p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().split("\n")[0].slice(0, 160)); });
    p.__errores = errores;
    await p.addInitScript(([t, tema, cliente]) => {
      // La sesión se pone en localStorage, igual que la deja el login: el
      // Dashboard es de un CLIENTE (no de la plataforma), y con
      // `plataforma: true` la app manda a /plataforma y nunca monta Vender.
      localStorage.setItem("retail-auth-v1", JSON.stringify({
        state: {
          token: t, role: "admin", cliente, clienteNombre: cliente,
          email: null, nombre: "Auditor",
          avisoCuenta: null, pedirConsentimiento: false, plataforma: false,
        },
        version: 0,
      }));
      localStorage.setItem("recabra-tema", tema);
    }, [process.env.PROBAR_VENDER_TOKEN ?? "", colorScheme === "dark" ? "oscuro" : "claro",
        process.env.PROBAR_VENDER_CLIENTE ?? "galerias"]);
    // `networkidle` no llega nunca: la app sincroniza sola cada tanto. Se
    // espera a que la pantalla exista, que es lo que interesa.
    await p.goto(URL_VENDER, { waitUntil: "domcontentloaded", timeout: 60000 });
    // La sede que se quiere mirar (la app abre en la primera de la lista, que
    // puede ser una sede de ejemplo sin muebles).
    const sede = process.env.PROBAR_VENDER_SEDE;
    if (sede) {
      await p.waitForSelector('select[aria-label="Sede"]', { timeout: 45000 }).catch(() => {});
      await p.selectOption('select[aria-label="Sede"]', sede).catch(() => {});
      await p.waitForTimeout(1500);
    }
    await p.waitForFunction(() => /Tarifa de referencia|Piso de/i.test(document.body.innerText),
      null, { timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(1200);
    return { ctx, p, errores };
  }

  /** Todo el texto que se ve: `innerText` + los `<text>` del SVG (que no
   *  entran en `innerText`) + los `title`, `aria-label` y `placeholder`. */
  const TEXTO_VISIBLE = `(() => {
    const t = [document.body.innerText];
    for (const n of document.querySelectorAll("svg text, svg title")) t.push(n.textContent);
    for (const n of document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")) {
      t.push(n.getAttribute("aria-label"), n.getAttribute("title"), n.getAttribute("placeholder"), n.getAttribute("alt"));
    }
    return t.filter(Boolean).join("\\n");
  })()`;

  const AJENOS = (process.env.PROBAR_VENDER_AJENOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const { ctx, p, errores } = await abrir("light");
  const texto = await p.evaluate(TEXTO_VISIBLE);
  const amarillos = await p.evaluate(() => [...document.querySelectorAll(".btn-principal")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((el) => (el.textContent || "").trim().slice(0, 40)));

  prueba("navegador · Vender se dibuja sin un solo error", () => {
    const u = [...new Set(errores)].filter((e) => !/404 \(Not Found\)|favicon/i.test(e));
    assert.deepEqual(u, [], `\n         ${u.join("\n         ")}`);
  });

  /* Sin pantalla no hay medición: un grep que da 0 sobre una página en blanco
     es la peor clase de verde. Las pruebas de abajo se niegan a opinar. */
  const pantallaLista = /Piso de|Tarifa de referencia/i.test(texto);
  const exigirPantalla = () => {
    if (!pantallaLista) throw new Error("Vender no llegó a dibujarse: este resultado NO vale como medición. "
      + "Arreglá el render y volvé a correr.");
  };
  prueba("navegador · Vender abrió de verdad (hay plano y contrato en pantalla)", () => {
    assert.ok(pantallaLista, "no se reconoce la pantalla de Vender:\n         " + texto.slice(0, 400).replace(/\n/g, " ⏎ "));
  });

  prueba("navegador · ningún proveedor ajeno en el texto renderizado", () => {
    exigirPantalla();
    assert.ok(AJENOS.length >= 2, "sembrá DOS proveedores y pasalos en PROBAR_VENDER_AJENOS=A,B");
    const salen = AJENOS.filter((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(texto));
    assert.deepEqual(salen, [], `el proveedor que ocupa el espacio se lee en Vender: ${salen.join(", ")}`);
  });

  prueba("navegador · ni ranking, ni canon, ni «bajo tarifa», ni vencimiento en pantalla", () => {
    exigirPantalla();
    const hits = [];
    for (const [re, que] of TEXTOS_PROHIBIDOS) {
      const m = texto.match(re);
      if (m) {
        const i = texto.indexOf(m[0]);
        hits.push(`${que}: «${texto.slice(Math.max(0, i - 40), i + 60).replace(/\n/g, " ⏎ ")}»`);
      }
    }
    assert.deepEqual(hits, [], `\n         ${hits.join("\n         ")}`);
  });

  prueba("navegador · un solo botón amarillo a la vista en Vender", () => {
    exigirPantalla();
    assert.equal(amarillos.length, 1, `${amarillos.length} \`.btn-principal\` visibles: ${amarillos.join(" · ") || "ninguno"}`);
  });

  /* Pasar el mouse por un mueble tomado: es el sitio donde hoy sale el nombre
     ajeno («tomado · ALPINA») y donde ningún grep estático lo ve, porque el
     texto no existe hasta el `mousemove`. */
  {
    const piezas = await p.$$("svg g[opacity] , svg g");
    let conTip = "";
    for (const g of piezas.slice(0, 200)) {
      try {
        await g.hover({ timeout: 400 });
        await p.waitForTimeout(90);
        const t = await p.evaluate(TEXTO_VISIBLE);
        if (AJENOS.some((n) => new RegExp(n, "i").test(t))) { conTip = t; break; }
      } catch { /* fuera de pantalla */ }
    }
    prueba("navegador · pasar el mouse por el plano no revela al proveedor ajeno", () => {
      exigirPantalla();
      assert.equal(conTip, "", "el globito del plano nombró a un proveedor ajeno al pasar el mouse:\n         "
        + conTip.split("\n").filter((l) => AJENOS.some((n) => new RegExp(n, "i").test(l))).join(" · "));
    });
  }

  /* Con la ficha del contrato abierta hay MÁS texto en pantalla —campos,
     renglones, la barra del pie— y es el estado en que el portátil está girado
     hacia el proveedor. El grep se repite ahí. */
  {
    let conFicha = "";
    try {
      const piezas = await p.$$("svg g.pz, svg g[data-id], svg g");
      for (const g of piezas.slice(0, 120)) {
        try { await g.click({ timeout: 300 }); } catch { continue; }
        await p.waitForTimeout(400);
        const t = await p.evaluate(TEXTO_VISIBLE);
        if (/Guardar contrato/i.test(t)) { conFicha = t; break; }
      }
    } catch { /* nada */ }
    prueba("navegador · con el contrato armado tampoco se lee un proveedor ajeno", () => {
      exigirPantalla();
      assert.ok(conFicha, "no se pudo abrir la ficha del contrato tocando el plano: la prueba no midió nada");
      const salen = AJENOS.filter((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(conFicha));
      assert.deepEqual(salen, [], `con la ficha abierta se lee: ${salen.join(", ")}`);
      const malos = [];
      for (const [re, que] of TEXTOS_PROHIBIDOS) if (re.test(conFicha)) malos.push(que);
      assert.deepEqual(malos, [], `con la ficha abierta aparece: ${malos.join(" · ")}`);
    });
  }

  /* ── el rótulo sobre el mueble, medido ────────────────────────────────
     Las tres promesas de D (README §2.3 y §4): cuerpo constante en pantalla a
     todo acercamiento, cero cruces entre rótulos (y contra los textos que
     flotan encima), y «el que choca o se sale cede». Se mide con
     `getBoundingClientRect`, y siempre un cuadro DESPUÉS de tocar el zoom:
     el navegador necesita ese cuadro para dibujar lo que ya está decidido. */
  async function medirRotulos() {
    return p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      // El plano es el SVG grande de la pantalla, no el primer ícono que
      // aparezca en el encabezado.
      const svg = [...document.querySelectorAll("svg")]
        .map((n) => ({ n, r: n.getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]?.n;
      if (!svg) return res(null);
      const lienzo = svg.getBoundingClientRect();
      const cajas = [];
      for (const t of svg.querySelectorAll("text")) {
        const r = t.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        cajas.push({ t: (t.textContent || "").trim().replace(/\s+/g, " ").slice(0, 20),
          x: r.x, y: r.y, w: r.width, h: r.height,
          // El cuerpo EN PANTALLA, no en unidades del plano: dentro de un SVG
          // escalado, `getComputedStyle().fontSize` devuelve unidades de
          // usuario. Se multiplica por la escala real, que es lo que hace D
          // con `getScreenCTM` (README §2.3).
          px: parseFloat(getComputedStyle(t).fontSize) * (t.getScreenCTM()?.a ?? 1) });
      }
      // Lo que flota encima del plano y con lo que también hay que no chocar.
      for (const n of document.querySelectorAll(".hud, .herramientas, .pill, [data-hud]")) {
        for (const el of [n, ...n.querySelectorAll("*")]) {
          if (el.children.length) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          cajas.push({ t: "HUD:" + (el.textContent || "").trim().slice(0, 14), x: r.x, y: r.y, w: r.width, h: r.height, px: 0, hud: true });
        }
      }
      const cruces = [], cortados = [];
      for (let i = 0; i < cajas.length; i++) {
        const a = cajas[i];
        if (a.x < lienzo.x - 0.5 || a.y < lienzo.y - 0.5
            || a.x + a.w > lienzo.x + lienzo.width + 0.5 || a.y + a.h > lienzo.y + lienzo.height + 0.5) {
          if (!a.hud) cortados.push(a.t);
        }
        for (let j = i + 1; j < cajas.length; j++) {
          const b = cajas[j];
          // D cuenta como pisadas las cajas que se cruzan Y las que quedan a
          // menos de 2 px: un rótulo pegado a otra letra se lee mal aunque no
          // la toque (README §4.3).
          const M = 2;
          if (a.x - M < b.x + b.w && b.x - M < a.x + a.w && a.y - M < b.y + b.h && b.y - M < a.y + a.h) {
            cruces.push(`${a.t} × ${b.t}`);
          }
        }
      }
      const cuerpos = [...new Set(cajas.filter((c) => !c.hud && c.px).map((c) => c.px.toFixed(2)))];
      res({ n: cajas.length, cruces, cortados, cuerpos });
    }))));
  }
  const encuadres = [];
  encuadres.push(["inicial", await medirRotulos()]);
  for (const [etiqueta, sel, veces] of [["+ ×2", "+", 2], ["+ ×2 más", "+", 2], ["− ×3", "−", 3]]) {
    const btn = await p.$(`button:text-is("${sel}")`).catch(() => null);
    if (!btn) continue;
    for (let i = 0; i < veces; i++) { await btn.click().catch(() => {}); await p.waitForTimeout(220); }
    encuadres.push([etiqueta, await medirRotulos()]);
  }
  prueba("navegador · cero cruces y cero rótulos cortados en el plano, a todo acercamiento", () => {
    exigirPantalla();
    const malos = [];
    for (const [etiqueta, m] of encuadres) {
      if (!m) { malos.push(`${etiqueta}: no se pudo medir el plano`); continue; }
      if (m.cruces.length) malos.push(`${etiqueta}: ${m.cruces.length} cruces — ${[...new Set(m.cruces)].slice(0, 6).join(" · ")}`);
      if (m.cortados.length) malos.push(`${etiqueta}: ${m.cortados.length} rótulos cortados por el borde del lienzo — ${[...new Set(m.cortados)].slice(0, 6).join(" · ")}`);
    }
    for (const [etiqueta, m] of encuadres) if (m) aviso(`${etiqueta}: ${m.n} textos · cuerpos ${m.cuerpos.join(" / ")} px`);
    assert.deepEqual(malos, [], `\n         ${malos.join("\n         ")}`);
  });
  prueba("navegador · el rótulo del plano mide lo mismo en pantalla en todos los encuadres", () => {
    exigirPantalla();
    const todos = [...new Set(encuadres.filter(([, m]) => m).flatMap(([, m]) => m.cuerpos))];
    assert.ok(todos.length > 0, "no se midió ningún cuerpo en el plano");
    assert.ok(todos.length <= 3, `el plano dibuja ${todos.length} cuerpos distintos entre encuadres (${todos.join(" / ")}): `
      + "si el rótulo fuera constante en pantalla habría uno solo (más, a lo sumo, los nombres de sala que escalan a propósito)");
    const minimo = Math.min(...todos.map(Number));
    assert.ok(minimo >= 8, `el texto más chico del plano queda en ${minimo}px: por debajo de 8 px D lo hace ceder en vez de dibujarlo`);
  });

  /* ── contraste de los pares principales, en los dos modos ─────────────── */
  const canal = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * canal(r / 255) + 0.7152 * canal(g / 255) + 0.0722 * canal(b / 255);
  const razon = (a, b) => { const [x, y] = [lum(a) + 0.05, lum(b) + 0.05]; return x > y ? x / y : y / x; };
  const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

  for (const [modo, scheme] of [["claro", "light"], ["oscuro", "dark"]]) {
    const s = modo === "claro" ? { p, ctx } : await abrir("dark");
    const medidas = await s.p.evaluate(() => {
      const out = [];
      const fondoDe = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length) continue;
        const t = (el.textContent || "").trim();
        if (t.length < 2) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.opacity === "0") continue;
        // WCAG 1.4.3 exime los controles inactivos. Se miden igual, pero
        // aparte: un botón principal deshabilitado a 3,6:1 es un aviso, no
        // una falla de norma.
        const apagado = !!el.closest("[disabled],[aria-disabled='true']");
        out.push({ t: t.slice(0, 30), fg: cs.color, bg: fondoDe(el), px: parseFloat(cs.fontSize), peso: cs.fontWeight, apagado });
      }
      return out;
    });
    prueba(`navegador · contraste del texto de Vender en ${modo}`, () => {
      exigirPantalla();
      assert.ok(medidas.length > 20, `sólo ${medidas.length} textos medidos: la pantalla no está completa`);
      const bajos = [], apagados = [];
      for (const m of medidas) {
        const grande = m.px >= 24 || (m.px >= 18.66 && Number(m.peso) >= 700);
        const piso = grande ? 3 : 4.5;
        const r = razon(rgb(m.fg), rgb(m.bg));
        if (r >= piso) continue;
        const linea = `«${m.t}» ${m.fg} sobre ${m.bg} a ${m.px}px: ${r.toFixed(2)}:1 < ${piso}`;
        (m.apagado ? apagados : bajos).push(linea);
      }
      for (const a of [...new Set(apagados)]) aviso(`control inactivo (exento de 1.4.3, pero se lee) en ${modo}: ${a}`);
      const unicos = [...new Set(bajos)];
      assert.deepEqual(unicos, [], `${unicos.length} pares por debajo del piso:\n         ${unicos.slice(0, 20).join("\n         ")}`);
    });
    if (modo === "oscuro") await s.ctx.close();
  }
  /* ── El visor 3D, encima de la ficha ─────────────────────────────────
     La dueña toca «3D» en la fila de una cara del contrato y la tienda se abre
     ENCIMA de la ficha. Lo que se mide acá es lo que ningún grep ve: qué se
     pide a la red, qué se escribe, qué texto queda en pantalla, y que al
     volver el contrato esté exactamente como quedó. */
  {
    const PROVEEDOR = process.env.PROBAR_VENDER_PROVEEDOR ?? "Alpina";
    const OTRO = process.env.PROBAR_VENDER_PROVEEDOR_2 ?? "Postobón";
    const CARAS = (process.env.PROBAR_VENDER_CARAS ?? "PUN-03,GON-02·B,NEV-01").split(",").map((s) => s.trim()).filter(Boolean);
    const TOKEN = process.env.PROBAR_VENDER_TOKEN ?? "";
    const ORIGEN = new URL(URL_VENDER).origin;
    const mismo = (a, b) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
    // El catálogo ENTERO, pedido acá afuera con la sesión (no desde la
    // página): de ahí sale de quién es cada arte.
    const catalogo = await fetch(ORIGEN + "/api/catalogo/", { headers: { Authorization: "Bearer " + TOKEN } })
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const idsDe = (n) => new Set(catalogo.filter((a) => mismo(a.proveedor, n)).map((a) => a.id));
    const supplierDe = (n) => catalogo.find((a) => mismo(a.proveedor, n))?.supplier_id ?? null;
    const esLista = (u) => new URL(u).pathname === "/api/catalogo/";
    const imagenDe = (u) => { const m = new URL(u).pathname.match(/^\/api\/catalogo\/(\d+)\/imagen$/); return m ? Number(m[1]) : null; };

    const pedidos = [];
    const listas = [];
    const pesosVender = [];
    const erroresDePagina = [];
    const errores3D = [];
    const { ctx: cv, p: pv } = await abrir("light", { antes: async (pg) => {
      pg.on("request", (r) => pedidos.push({ m: r.method(), u: r.url() }));
      pg.on("pageerror", (e) => erroresDePagina.push(String(e).split("\n")[0]));
      pg.on("console", (m) => { if (m.type() === "error" && /WebGL|context/i.test(m.text())) errores3D.push(m.text().slice(0, 160)); });
      pg.on("response", async (r) => {
        try {
          if (esLista(r.url()) && r.request().method() === "GET") listas.push({ u: r.url(), json: await r.json() });
          else if (/\.js(\?|$)/.test(r.url())) {
            const b = await r.body();
            if (b.includes("Correo y nota")) pesosVender.push(gzipSync(b).length);
          }
        } catch { /* una respuesta sin cuerpo */ }
      });
    } });

    const tocar = async (pg, cod) => {
      const r = await pg.evaluate((c) => {
        const t = [...document.querySelectorAll("text.p-cod")].find((n) => n.getAttribute("data-cod") === c);
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
      }, cod);
      if (!r || r.w < 1) throw new Error(`no está el rótulo ${cod} en el plano (PROBAR_VENDER_CARAS)`);
      await pg.mouse.click(r.x, r.y);
      await pg.waitForTimeout(500);
    };
    const PANEL = `[...document.querySelectorAll(".vp")].find((s) => (s.querySelector("h2")?.textContent || "").trim() === "Contrato")`;
    const contrato = (pg) => pg.evaluate(`(() => {
      const panel = ${PANEL};
      if (!panel) return null;
      return {
        filas: [...panel.querySelectorAll(".eitem")].map((e) => [e.querySelector(".cod")?.textContent, e.querySelector(".m input")?.value]),
        campos: [...panel.querySelectorAll(".entrada input, .entrada textarea, input.entrada")].map((i) => i.value),
        // La planometría no se carga en Vender: cualquier campo de archivo en
        // la ficha es una falla (ver «la planometría se carga en Supervisar»).
        archivos: panel.querySelectorAll('input[type="file"]').length,
      };
    })()`);
    const almacen = (pg) => pg.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("retail-fixtures-v1") || "{}")?.state ?? {};
      return { camara: JSON.stringify(s.camera3D ?? null), planos: JSON.stringify(s.fixturesBySede ?? null) };
    });
    const visorListo = async (pg) => {
      await pg.waitForSelector(".visor-venta canvas", { timeout: 90000 });
      await pg.waitForSelector(".visor-venta[data-toma-lista]", { timeout: 90000 });
      await pg.waitForTimeout(800);
    };
    /** El HUD se esconde a los 2 s sin mover el mouse (y escondido no recibe
     *  clics): se lo despierta, se espera a que esté a la vista y recién ahí
     *  se toca. Con SwiftShader el hilo principal se traba mientras se
     *  precalientan las etiquetas, y un intento solo a veces llegaba tarde. */
    const tocarHud = async (pg, texto) => {
      const caja = await pg.locator(".visor-escena").boundingBox();
      for (let i = 0; i < 12; i++) {
        await pg.mouse.move(caja.x + caja.width * (0.35 + 0.03 * i), caja.y + caja.height * 0.55);
        const despierto = await pg.waitForFunction(() => !document.querySelector(".visor-hud")?.hasAttribute("data-hud-escondido"),
          null, { timeout: 2000 }).then(() => true).catch(() => false);
        if (!despierto) continue;
        try { await pg.locator(".visor-hud-boton", { hasText: texto }).click({ timeout: 2000 }); return; } catch { /* se escondió en el medio */ }
      }
      throw new Error(`no se pudo tocar «${texto}» en el HUD`);
    };
    /** «Ver en 3D» está en la cabecera del contrato y abre la ÚLTIMA cara
     *  tocada; si se pide otra, se salta con la chapa del visor. */
    const abrirVisor = async (pg, cara = CARAS[0]) => {
      await pg.locator("[data-ver-3d]").click();
      await visorListo(pg);
      const activa = (await pg.locator(".visor-chapa-cod").textContent())?.trim();
      if (cara && activa !== cara) {
        const n = Number(await pg.locator(".visor-venta").getAttribute("data-toma-lista"));
        await pg.locator(".visor-pestana", { hasText: cara }).click();
        await pg.waitForFunction((m) => Number(document.querySelector(".visor-venta")?.getAttribute("data-toma-lista") || 0) > m, n, { timeout: 90000 });
        await pg.waitForTimeout(800);
      }
    };
    /** El amarillo vuelve con una transición, y al cerrar el visor el hilo
     *  principal está ocupado soltando la memoria de video (SwiftShader): se
     *  le dan hasta 3 s antes de contar. Si no vuelve, la prueba falla igual. */
    const amarilloDeVuelta = (pg) => pg.waitForFunction(() => {
      const sonda = document.createElement("i");
      sonda.style.background = "var(--signal)";
      document.body.appendChild(sonda);
      const amarillo = getComputedStyle(sonda).backgroundColor;
      sonda.remove();
      return [...document.querySelectorAll(".btn-principal")].some((el) => getComputedStyle(el).backgroundColor === amarillo);
    }, null, { timeout: 3000 }).catch(() => {});
    const cerrado = (pg) => pg.evaluate(() => ({
      visor: !!document.querySelector(".visor-venta"),
      inerte: document.getElementById("root")?.hasAttribute("inert") ?? null,
      modal: document.documentElement.hasAttribute("data-modal-abierto"),
      pantallaCompleta: !!document.fullscreenElement,
      foco: document.activeElement?.hasAttribute("data-ver-3d") ? "Ver en 3D" : `(${document.activeElement?.tagName} ${document.activeElement?.className ?? ""})`,
      amarillos: [...document.querySelectorAll(".btn-principal")].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const sonda = document.createElement("i");
        sonda.style.background = "var(--signal)";
        document.body.appendChild(sonda);
        const amarillo = getComputedStyle(sonda).backgroundColor;
        sonda.remove();
        return getComputedStyle(el).backgroundColor === amarillo;
      }).length,
    }));
    const textoDelVisor = (pg) => pg.evaluate(() => {
      const v = document.querySelector(".visor-venta");
      if (!v) return "";
      const t = [v.innerText];
      for (const n of v.querySelectorAll("[aria-label],[title],[placeholder],[alt]")) {
        t.push(n.getAttribute("aria-label"), n.getAttribute("title"), n.getAttribute("placeholder"), n.getAttribute("alt"));
      }
      return t.filter(Boolean).join("\n");
    });

    // ── La hoja, con tres espacios y el contrato completo ──────────────
    // Al revés: «Ver en 3D» abre la ÚLTIMA cara tocada, y las pruebas miran
    // la primera de la lista (la punta).
    const alReves = [...CARAS].reverse();
    await tocar(pv, alReves[0]);
    await pv.mouse.move(5, 5);
    await pv.waitForTimeout(600);
    // «Aire y pines», la corrección (el dibujo aprobado después del PR 3):
    // la columna derecha es una PILA —el contrato de su alto natural y la
    // tarifa debajo— y si el contrato es más alto que la ventana rueda LA
    // PANTALLA, no el cuerpo del contrato; su pie (el total, lo que falta y
    // «Guardar») queda pegado abajo. Reemplaza a «cada campo a un rodar del
    // cuerpo» (que hacía `scrollIntoView` del cuerpo y pasaba siempre) por lo
    // que el dibujo promete, medido SIN RODAR NADA: a 1440×900 con una línea
    // el campo Proveedor está entero en la ventana y el pie no lo tapa.
    const AREA = `document.querySelector(".vender")`;
    const medirContrato = (pg) => pg.evaluate(`(() => {
      const panel = ${PANEL};
      const area = ${AREA};
      const cuerpo = panel.querySelector(".cuerpo"), pie = panel.querySelector(".pie-contrato");
      const r = panel.getBoundingClientRect(), pr = pie.getBoundingClientRect();
      const hoja = panel.closest(".vender-hoja").getBoundingClientRect();
      /** Entero en la ventana, arriba del pie y sin nada encima (lo que hay en
       *  su centro es él o algo suyo). */
      const aLaVista = (el, conPie = true) => {
        if (!el) return "no está";
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return "no se ve";
        if (b.top < -0.5 || b.left < -0.5 || b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5) return "se sale de la ventana";
        if (conPie && b.bottom > pr.top + 0.5) return "lo tapa el pie";
        const enMedio = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!enMedio || !(el === enMedio || el.contains(enMedio) || enMedio.contains(el))) return "algo lo tapa (" + (enMedio?.className || enMedio?.tagName) + ")";
        return "";
      };
      return {
        ancho: innerWidth, alto: innerHeight, rodado: area.scrollTop, bloques: panel.querySelectorAll(".bloque").length,
        proveedor: aLaVista(panel.querySelector('input[aria-label="Proveedor"]')),
        guardar: aLaVista(pie.querySelector(".btn-principal"), false),
        fecha: aLaVista(pie.querySelector('input[aria-label="Reservar hasta"]'), false),
        pieAlto: pr.height, pieAbajo: innerHeight - pr.bottom,
        pegado: getComputedStyle(pie).position === "sticky",
        cuerpoRueda: cuerpo.scrollHeight > cuerpo.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(cuerpo).overflowY),
        proporcion: r.width / hoja.width,
        pagina: document.scrollingElement.scrollHeight > innerHeight + 1,
        ancha: document.documentElement.scrollWidth > innerWidth,
        desborda: panel.scrollWidth > panel.clientWidth + 0.5,
      };
    })()`);
    /** Rueda LA PANTALLA (no el cuerpo) hasta que cada campo quede a la vista
     *  arriba del pie, y en cada paso «Guardar» sigue a la vista y el plano
     *  sigue en su lugar (pegado). Vuelve arriba al terminar. */
    const rodandoLaPantalla = (pg) => pg.evaluate(`(async () => {
      const panel = ${PANEL};
      const area = ${AREA};
      const cuerpo = panel.querySelector(".cuerpo"), pie = panel.querySelector(".pie-contrato");
      const plano = document.querySelector(".vender .vp-plano");
      const cuadro = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const malas = [];
      const campos = { linea: ".eitem", proveedor: 'input[aria-label="Proveedor"]', marca: 'input[aria-label="Marca"]',
        desde: 'input[aria-label="Desde"]', hasta: 'input[aria-label="Hasta"]', atajos: ".atajos",
        cobro: '[aria-label="Cómo se cobra"]', correo: ".plegable" };
      for (const [k, sel] of Object.entries(campos)) {
        const el = panel.querySelector(sel);
        if (!el) { malas.push(k + ": no está"); continue; }
        // Lo que hay que rodar para que el campo quede a 140 px del borde de arriba.
        area.scrollTop += el.getBoundingClientRect().top - 140;
        await cuadro();
        const b = el.getBoundingClientRect(), pr = pie.getBoundingClientRect(), g = pie.querySelector(".btn-principal").getBoundingClientRect();
        if (b.top < 0 || b.bottom > pr.top + 0.5) malas.push(k + ": rodando la pantalla no queda a la vista arriba del pie");
        if (g.top < 0 || g.bottom > innerHeight + 0.5) malas.push(k + ": rodando, «Guardar» se fue de la ventana");
        // El plano, pegado arriba del área que rueda (a lo sumo su relleno y
        // el hueco entre paneles) y entero a la vista.
        const p = plano.getBoundingClientRect(), a = area.getBoundingClientRect();
        if (area.scrollTop > 40 && innerWidth > 1100 && (p.top < a.top - 0.5 || p.top > a.top + 30 || p.bottom > innerHeight + 0.5)) malas.push(k + ": rodando, el plano no quedó quieto y entero arriba (" + (p.top - a.top).toFixed(0) + " px debajo del borde del área)");
        if (cuerpo.scrollTop !== 0) malas.push(k + ": rodó el cuerpo del contrato");
      }
      area.scrollTop = 0;
      await cuadro();
      return malas;
    })()`);
    await pv.evaluate(`${AREA}.scrollTop = 0`);
    const unaLinea = await medirContrato(pv);
    const unaLineaRodando = await rodandoLaPantalla(pv);
    prueba("navegador · con UNA línea a 1440×900, SIN RODAR: Proveedor entero en la ventana y sin el pie encima, «Guardar» a la vista, el pie pegado abajo (≤ 200 px), el cuerpo sin rodar, el contrato al 40 %", () => {
      const malas = [];
      if (unaLinea.ancho !== 1440 || unaLinea.alto !== 900) malas.push(`la ventana mide ${unaLinea.ancho}×${unaLinea.alto}, no 1440×900`);
      if (unaLinea.rodado !== 0) malas.push(`la pantalla ya estaba rodada ${unaLinea.rodado} px`);
      if (unaLinea.bloques !== 3) malas.push(`el contrato tiene ${unaLinea.bloques} bloques`);
      if (unaLinea.proveedor) malas.push(`Proveedor: ${unaLinea.proveedor}`);
      if (unaLinea.guardar) malas.push(`«Guardar»: ${unaLinea.guardar}`);
      if (!unaLinea.pegado) malas.push("el pie no está pegado abajo (`position: sticky`)");
      if (unaLinea.pieAbajo > 0.5) malas.push(`el pie no llega al borde de la ventana (quedan ${unaLinea.pieAbajo.toFixed(1)} px debajo)`);
      if (unaLinea.pieAlto > 200.5) malas.push(`el pie mide ${unaLinea.pieAlto.toFixed(1)} px (tope: 200)`);
      if (unaLinea.cuerpoRueda) malas.push("el cuerpo del contrato rueda (tiene que rodar la pantalla)");
      // 2 de 5 de la hoja, menos la mitad del hueco entre columnas.
      if (Math.abs(unaLinea.proporcion - 0.4) > 0.01) malas.push(`el contrato mide el ${(unaLinea.proporcion * 100).toFixed(1)} % de la hoja (40 %)`);
      if (unaLinea.pagina) malas.push("rueda el documento (tiene que rodar el área de la pantalla)");
      if (unaLinea.ancha) malas.push("la página se sale a lo ancho");
      if (unaLinea.desborda) malas.push("algo se sale de la tarjeta del contrato");
      malas.push(...unaLineaRodando);
      assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
    });
    // A 1366×768 reservando: la fecha de la reserva va en el pie pegado, y el
    // pie entero (con «Guardar» y la fecha) se ve sin rodar; Proveedor se
    // alcanza rodando la pantalla.
    await pv.setViewportSize({ width: 1366, height: 768 });
    await pv.waitForTimeout(700);
    await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
    await pv.mouse.move(5, 5);
    await pv.waitForTimeout(500);
    const reservar = pv.locator(".vender .pie-contrato button", { hasText: "Reservar hasta…" });
    const sePuedeReservar = await reservar.isEnabled();
    if (sePuedeReservar) await reservar.click();
    else console.log(`       aviso · «Reservar hasta…» apagado con ${alReves[0]}: ${await reservar.getAttribute("title")} (la primera cara que se toca, la última de PROBAR_VENDER_CARAS, tiene que poder reservarse sola)`);
    await pv.waitForTimeout(500);
    await pv.evaluate(`${AREA}.scrollTop = 0`);
    const reservando = await medirContrato(pv);
    const reservandoRodando = await rodandoLaPantalla(pv);
    prueba("navegador · reservando a 1366×768: «Guardar» y la fecha de la reserva a la vista sin rodar, el pie ≤ 200 px, y cada campo se alcanza rodando la pantalla", () => {
      const malas = [];
      if (!sePuedeReservar) malas.push(`no se pudo reservar ${alReves[0]} sola (ver el aviso de arriba)`);
      if (reservando.ancho !== 1366 || reservando.alto !== 768) malas.push(`la ventana mide ${reservando.ancho}×${reservando.alto}`);
      if (reservando.guardar) malas.push(`«Guardar»: ${reservando.guardar}`);
      if (reservando.fecha) malas.push(`la fecha de la reserva: ${reservando.fecha}`);
      if (!reservando.pegado) malas.push("el pie no está pegado abajo");
      if (reservando.pieAlto > 200.5) malas.push(`el pie mide ${reservando.pieAlto.toFixed(1)} px (tope: 200)`);
      if (reservando.cuerpoRueda) malas.push("el cuerpo del contrato rueda");
      if (reservando.pagina) malas.push("rueda el documento");
      if (reservando.ancha) malas.push("la página se sale a lo ancho");
      malas.push(...reservandoRodando);
      assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
    });
    // «Editar contrato» (la corrección tras la ronda de prueba): el pie en
    // edición tampoco pasa de 200 px —con cuatro cambios medía 320 a 1366×768
    // y tapaba el % y el corte—, «Guardar cambios y reenviar» se ve sin rodar,
    // y el % de las ventas se alcanza rodando la pantalla, arriba del pie.
    {
      const { ctx: ce, p: pe } = await abrir("light");
      const EDITA = process.env.PROBAR_VENDER_EDITA ?? "";
      let abierta = "";
      try {
        if (!(await pe.getByRole("button", { name: /^Supervisar/ }).count())) await pe.getByRole("button", { name: /^Sede$/ }).first().click();
        await pe.getByRole("button", { name: /^Supervisar/ }).first().click();
        await pe.waitForTimeout(2500);
        await pe.locator('.sup button[data-grupo="corregir"][aria-pressed]').first().click();
        await pe.waitForTimeout(800);
        const filas = pe.locator("[data-fila-revisar]", EDITA ? { hasText: EDITA } : {}).filter({ has: pe.locator("[data-editar-contrato]") });
        if (await filas.count()) {
          await filas.first().locator("[data-editar-contrato]").first().click();
          await pe.waitForSelector("[data-editando]", { timeout: 20000 });
          abierta = "sí";
        }
      } catch (e) { abierta = ""; console.log(`       aviso · no se pudo abrir «Editar contrato»: ${String(e).split("\n")[0]}`); }
      const medidas = [];
      if (abierta) {
        // Cuatro cambios: proveedor, marca, «Hasta» y el cobro (% de las ventas).
        await pe.locator('.vender input[aria-label="Proveedor"]').fill("Proveedor de prueba del pie");
        await pe.locator('.vender input[aria-label="Marca"]').fill("Marca del pie");
        const hasta = pe.locator('.vender input[aria-label="Hasta"]');
        const h = await hasta.inputValue();
        await hasta.fill(`${Number(h.slice(0, 4)) + 1}${h.slice(4)}`);
        await pe.getByRole("button", { name: "% de las ventas" }).click();
        await pe.getByLabel("Porcentaje de las ventas").fill("7,5");
        await pe.mouse.move(5, 5);
        await pe.waitForTimeout(900);
        for (const [ancho, alto] of [[1366, 768], [1440, 900]]) {
          await pe.setViewportSize({ width: ancho, height: alto });
          await pe.waitForTimeout(600);
          await pe.evaluate(`${AREA}.scrollTop = 0`);
          const m = await medirContrato(pe);
          const rueda = await rodandoLaPantalla(pe);
          const linea = await pe.evaluate(() => document.querySelector("[data-que-cambia]")?.innerText.replace(/\s+/g, " ").trim() ?? "");
          const lineaAlto = await pe.evaluate(() => document.querySelector("[data-que-cambia]")?.getBoundingClientRect().height ?? 0);
          // Un contrato que ya arrancó no ofrece los atajos de fecha (moverían el «Desde»).
          const arranco = await pe.evaluate(() => !!document.querySelector("[data-desde-bloqueado]"));
          // El % de las ventas, rodando la pantalla, entero y arriba del pie.
          const pct = await pe.evaluate(`(async () => {
            const panel = ${PANEL}, area = ${AREA}, pie = panel.querySelector(".pie-contrato");
            const el = panel.querySelector('input[aria-label="Porcentaje de las ventas"]');
            if (!el) return "no está";
            area.scrollTop += el.getBoundingClientRect().top - 140;
            await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
            const b = el.getBoundingClientRect(), pr = pie.getBoundingClientRect();
            area.scrollTop = 0;
            return b.top < 0 || b.bottom > pr.top + 0.5 ? "rodando, lo tapa el pie" : "";
          })()`);
          medidas.push({ ancho, alto, m, rueda: rueda.filter((x) => !(arranco && x === "atajos: no está")), linea, lineaAlto, pct });
        }
      }
      await ce.close();
      prueba("navegador · «Editar contrato» con cuatro cambios a 1366×768 y 1440×900: el pie ≤ 200 px, «Qué cambia» en una línea, «Guardar cambios y reenviar» a la vista y el % de las ventas alcanzable arriba del pie", () => {
        assert.ok(abierta, `no se pudo abrir «Editar contrato» desde Corregir${EDITA ? ` (${EDITA})` : ""}: sembrá un contrato con el botón y pasá PROBAR_VENDER_EDITA`);
        const malas = [];
        for (const { ancho, alto, m, rueda, linea, lineaAlto, pct } of medidas) {
          const t = `${ancho}×${alto}`;
          if (m.pieAlto > 200.5) malas.push(`${t}: el pie mide ${m.pieAlto.toFixed(1)} px en edición (tope: 200)`);
          if (m.guardar) malas.push(`${t}: «Guardar cambios y reenviar»: ${m.guardar}`);
          if (!m.pegado) malas.push(`${t}: el pie no está pegado abajo`);
          if (m.ancha) malas.push(`${t}: la página se sale a lo ancho`);
          if (!/^Qué cambia: \d+ cambios/.test(linea) || lineaAlto > 24) malas.push(`${t}: «Qué cambia» no está plegado a una línea («${linea.slice(0, 80)}», ${lineaAlto.toFixed(0)} px)`);
          if (pct) malas.push(`${t}: el % de las ventas: ${pct}`);
          malas.push(...rueda.map((x) => `${t}: ${x}`));
        }
        assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
      });
    }
    if (sePuedeReservar) await pv.locator(".vender .pie-contrato button", { hasText: "Volver" }).click();
    await pv.setViewportSize({ width: 1440, height: 900 });
    await pv.waitForTimeout(700);
    await pv.evaluate(`${AREA}.scrollTop = 0`);
    for (const c of alReves.slice(1)) await tocar(pv, c);
    await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
    await pv.locator('.vender input[aria-label="Marca"]').fill("Finesse");
    const valores = pv.locator(".eitem .m input");
    for (let i = 0; i < await valores.count(); i++) await valores.nth(i).fill(String(1_200_000 + i * 100_000));
    await pv.mouse.move(5, 5);
    await pv.waitForTimeout(900);
    const hoja = await pv.evaluate(`(() => {
      const panel = ${PANEL};
      const r = panel.getBoundingClientRect();
      // Los botones viven en el PIE (\`.pie-contrato\`), que no rueda.
      const acc = panel.querySelector(".pie-contrato .acciones").getBoundingClientRect();
      const cab = panel.querySelector("header").getBoundingClientRect();
      const v = panel.querySelectorAll("[data-ver-3d]");
      const vb = v[0]?.getBoundingClientRect();
      return {
        filas: [...panel.querySelectorAll(".eitem")].map((e) => {
          const b = e.getBoundingClientRect(), cod = e.querySelector(".cod");
          return { cod: cod.firstChild?.textContent?.trim(), alto: b.height, entero: cod.scrollWidth <= cod.clientWidth,
            desborda: e.scrollWidth > e.clientWidth + 0.5, aviso: !!e.querySelector(".aviso"), abierta: e.classList.contains("abierta"),
            tipo: e.dataset.linea, partes: e.querySelectorAll(".repisas-lista .repisa").length };
        }),
        botones: v.length,
        boton: !!vb && vb.left >= cab.left && vb.right <= cab.right && vb.top >= cab.top - 5 && vb.bottom <= cab.bottom + 5,
        cabecera: cab.height,
        aire: r.bottom - acc.bottom,
        rueda: document.scrollingElement.scrollHeight > innerHeight + 1,
      };
    })()`);
    const botonClaro = await pv.evaluate(() => [...document.querySelectorAll("[data-ver-3d]")].map((b) => {
      const fondo = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255,255,255)"; };
      return { fg: getComputedStyle(b).color, bg: fondo(b), px: parseFloat(getComputedStyle(b).fontSize), peso: getComputedStyle(b).fontWeight, t: "Ver en 3D", apagado: false };
    }));
    prueba("navegador · visor: la hoja sigue cerrando con tres espacios, y «Ver en 3D» en la cabecera", () => {
      assert.equal(hoja.filas.length, CARAS.length, `filas en el contrato: ${hoja.filas.map((f) => f.cod).join(", ")}`);
      const malas = [];
      for (const f of hoja.filas) {
        // Cerrada, una línea sigue siendo un renglón de dos líneas; la abierta
        // (la última que se tocó) muestra sus botoneras con su rótulo.
        if (!f.aviso && !f.abierta && f.alto > 46.5) malas.push(`${f.cod}: la fila mide ${f.alto.toFixed(1)} px (dos renglones son 46)`);
        // La ABIERTA también tiene tope (ya no está exenta): su cabecera, «Se
        // vende» y «El precio es» (medida: 176 px entera, 200 un porcentaje a
        // 1440), más un renglón por cada parte de la lista y el aviso, si hay.
        const tope = 210 + 34 * f.partes + (f.aviso ? 40 : 0);
        if (f.abierta && f.alto > tope) malas.push(`${f.cod}: la línea abierta mide ${f.alto.toFixed(1)} px (tope: ${tope}, ${f.tipo}${f.partes ? `, ${f.partes} partes` : ""})`);
        if (!f.entero) malas.push(`${f.cod}: el código se corta`);
        if (f.desborda) malas.push(`${f.cod}: la fila desborda su tarjeta`);
      }
      if (hoja.filas.filter((f) => f.abierta).length > 1) malas.push("hay más de una línea abierta");
      if (hoja.botones !== 1) malas.push(`hay ${hoja.botones} «Ver en 3D» (tiene que haber uno, en la cabecera)`);
      if (!hoja.boton) malas.push("«Ver en 3D» no está entero adentro de la cabecera del contrato");
      if (hoja.aire < 12) malas.push(`la ficha cierra con ${hoja.aire.toFixed(1)} px de aire (piso: 12)`);
      if (hoja.rueda) malas.push("la página rueda");
      assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
    });


    // ── Supervisar: el señalado con la página rodada, y los puntos ────────
    // («Aire y pines», la corrección.) Pasar por un renglón de «Para revisar»
    // pone un punto con anillo ARRIBA del rótulo de su mueble. Las cajas de
    // los rótulos se guardaban en coordenadas de pantalla y, con la página
    // rodada, el punto caía corrido lo que se hubiera rodado: se mide con la
    // pantalla quieta Y rodada. Y prender los puntos no esconde ningún rótulo
    // que apagados se ve, ni un punto tapa un código.
    {
      const { ctx: cs, p: ps } = await abrir("light");
      await ps.locator("button", { hasText: /^Supervisar/ }).first().click();
      await ps.waitForSelector(".sup .lista-r [data-aviso]", { timeout: 45000 }).catch(() => {});
      await ps.waitForTimeout(2500);
      const ocultos = () => ps.evaluate(() => [...document.querySelectorAll(".vp-plano text.p-cod")]
        .filter((t) => getComputedStyle(t).display === "none" || t.getBoundingClientRect().width === 0).map((t) => t.getAttribute("data-cod")).sort());
      /** Pasa el mouse por cada renglón hasta encontrar uno que señale, y mide
       *  el punto contra el rótulo visible de su mueble. */
      const senalado = async () => {
        const filas = await ps.locator(".sup .lista-r [data-aviso] .dat").all();
        for (const f of filas.slice(0, 12)) {
          if (!(await f.isVisible())) continue;
          await f.hover();
          await ps.waitForTimeout(250);
          const m = await ps.evaluate(() => {
            const marca = document.querySelector(".foco-marca");
            if (!marca || getComputedStyle(marca).display === "none" || marca.dataset.sobre !== "rotulo") return null;
            const fila = document.querySelector(".sup [data-senalada]");
            const cod = fila?.querySelector(".dat b")?.textContent?.trim() ?? "";
            const base = cod.replace(/·[AB]$/, "");
            const rotulos = [...document.querySelectorAll(".vp-plano text.p-cod")]
              .filter((t) => getComputedStyle(t).display !== "none" && (t.getAttribute("data-cod") === cod || t.getAttribute("data-cod")?.replace(/·[AB]$/, "") === base))
              .map((t) => t.getBoundingClientRect());
            const b = marca.getBoundingClientRect();
            const cx = b.left + b.width / 2;
            // Arriba del rótulo (a 2 px), centrado: el de su cara o el de la otra.
            const junto = rotulos.some((r) => Math.abs(cx - (r.left + r.width / 2)) < 3 && Math.abs(b.bottom - (r.top - 2)) < 4);
            const ir = fila?.querySelector(".ir"), mira = fila?.querySelector(".mira");
            return { cod, junto, rotulos: rotulos.length, grupo: fila?.dataset.senalada ?? "",
              mira: !!mira && getComputedStyle(mira).display !== "none" && (!ir || getComputedStyle(ir).display === "none") };
          });
          if (m && m.rotulos > 0) return m;
        }
        return null;
      };
      await ps.evaluate(() => { document.querySelector(".sup").scrollTop = 0; });
      const quieto = await senalado();
      await ps.mouse.move(2, 2);
      await ps.waitForTimeout(300);
      const rodo = await ps.evaluate(() => { const s = document.querySelector(".sup"); s.scrollTop = 120; return s.scrollTop; });
      await ps.waitForTimeout(300);
      const rodado = await senalado();
      await ps.mouse.move(2, 2);
      await ps.evaluate(() => { document.querySelector(".sup").scrollTop = 0; });
      await ps.waitForTimeout(300);
      prueba("navegador · Supervisar: el punto con anillo del señalado cae arriba del rótulo de su mueble, con la página quieta y RODADA, y el renglón lleva la mira", () => {
        const malas = [];
        if (!quieto) malas.push("ningún renglón de «Para revisar» señaló un mueble con su rótulo a la vista");
        else {
          if (!quieto.junto) malas.push(`quieta: el punto de ${quieto.cod} no está arriba de su rótulo`);
          if (!quieto.mira) malas.push(`quieta: el renglón de ${quieto.cod} no cambió el chevron por la mira`);
          if (!/^(hoy|dias30|corregir)$/.test(quieto.grupo)) malas.push(`quieta: el renglón señalado no lleva el tono de su grupo («${quieto.grupo}»)`);
        }
        if (rodo < 60) malas.push(`la página de Supervisar no rodó (${rodo} px): no se puede medir el caso rodado`);
        else if (!rodado) malas.push("rodada: ningún renglón señaló un mueble con su rótulo a la vista");
        else if (!rodado.junto) malas.push(`rodada ${rodo} px: el punto de ${rodado.cod} no está arriba de su rótulo (quedó corrido)`);
        assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
      });
      const apagados = await ocultos();
      const boton = ps.locator(".clave-pin");
      const habia = await boton.count();
      if (habia) { await boton.first().click(); await ps.waitForTimeout(1200); }
      const prendidos = await ocultos();
      const pisan = await ps.evaluate(() => {
        const rot = [...document.querySelectorAll(".vp-plano text.p-cod")].filter((t) => getComputedStyle(t).display !== "none").map((t) => [t.getAttribute("data-cod"), t.getBoundingClientRect()]);
        const out = [];
        for (const p of document.querySelectorAll(".chinchetas button")) {
          if (getComputedStyle(p).display === "none") continue;
          const b = p.getBoundingClientRect();
          // El punto pintado (10 px y su aro de 2) dentro del blanco de 16.
          const c = { l: b.left + b.width / 2 - 7, r: b.left + b.width / 2 + 7, t: b.top + b.height / 2 - 7, b: b.top + b.height / 2 + 7 };
          for (const [cod, r] of rot) if (c.l < r.right && r.left < c.r && c.t < r.bottom && r.top < c.b) out.push(`${p.getAttribute("aria-label")?.slice(0, 40)} tapa ${cod}`);
        }
        return { out, n: document.querySelectorAll(".chinchetas button").length };
      });
      if (habia) { await boton.first().click(); await ps.waitForTimeout(400); }
      prueba("navegador · Supervisar: prender los puntos no esconde ningún rótulo que apagados se ve, y ningún punto tapa un código", () => {
        const malas = [];
        if (!habia) malas.push("no está el botón «Para revisar N» en la clave");
        if (habia && pisan.n === 0) malas.push("prendidos, no hay ningún punto");
        const nuevos = prendidos.filter((c) => !apagados.includes(c));
        if (nuevos.length) malas.push(`prendidos ceden ${nuevos.join(", ")} (apagados se ven)`);
        malas.push(...pisan.out);
        assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
      });
      await cs.close();
    }

    // Lo opcional, que también tiene que sobrevivir al 3D.
    await pv.locator("button.plegable", { hasText: "Correo y nota para el proveedor" }).click();
    await pv.locator('.vender input[inputmode="email"]').fill("compras@proveedor.example");
    await pv.locator('.vender textarea[aria-label="Nota"]').fill("Probar la punta con el yogur");
    await pv.waitForTimeout(400);
    const antes = await contrato(pv);
    prueba("navegador · la ficha de Vender no tiene campo para la planometría (se carga en Supervisar)", () => {
      assert.equal(antes.archivos, 0, "la ficha del contrato tiene un campo de archivo");
    });

    prueba("navegador · visor: antes de abrirlo, Vender no bajó nada del 3D", () => {
      const del3D = pedidos.filter((x) => /StoreEditor3D-|three\.module-|VisorDeVenta-/.test(x.u)).map((x) => x.u.replace(ORIGEN, ""));
      assert.deepEqual(del3D, [], "Vender bajó el 3D al entrar");
      assert.ok(pesosVender.length >= 1, "no se encontró el archivo de Vender entre lo que bajó la página");
      const base = Number(process.env.PROBAR_VENDER_PESO_BASE || 0);
      if (base > 0) {
        assert.ok(pesosVender[0] - base <= 3072,
          `el archivo de Vender pesa ${pesosVender[0]} B gzip: ${pesosVender[0] - base} B más que la base (${base}); el tope es 3 KB`);
      } else aviso(`archivo de Vender: ${pesosVender[0]} B gzip (PROBAR_VENDER_PESO_BASE compara contra la línea base)`);
    });

    const almacenAntes = await almacen(pv);
    const desde = pedidos.length;
    await abrirVisor(pv);
    await pv.waitForSelector(".visor-producto", { timeout: 60000 });
    await pv.locator(".visor-producto").first().click();
    await pv.waitForSelector(".visor-como", { timeout: 60000 });
    await pv.waitForTimeout(6000);   // la etiqueta del envase (recorte en el worker)
    const textoAbierto = await pv.evaluate(TEXTO_VISIBLE);

    prueba("navegador · visor: ni proveedores ajenos ni textos prohibidos, con el producto y «Cómo va» a la vista", () => {
      assert.ok(AJENOS.length >= 2, "sembrá DOS proveedores y pasalos en PROBAR_VENDER_AJENOS=A,B");
      const salen = AJENOS.filter((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(textoAbierto));
      assert.deepEqual(salen, [], `con el visor abierto se lee: ${salen.join(", ")}`);
      const malos = TEXTOS_PROHIBIDOS.filter(([re]) => re.test(textoAbierto)).map(([, q]) => q);
      assert.deepEqual(malos, [], `con el visor abierto aparece: ${malos.join(" · ")}`);
    });

    prueba("navegador · visor: a la red sólo va lo del proveedor del contrato", () => {
      const desdeAbrir = pedidos.slice(desde);
      const malos = [];
      for (const x of pedidos) {
        const ruta = new URL(x.u).pathname;
        // Sólo la ruta que completa UN nombre (`/suppliers/completar`, exacta);
        // cualquier otra de proveedores es la lista.
        if (/^\/api\/suppliers/.test(ruta) && ruta !== "/api/suppliers/completar") malos.push(`pidió ${ruta}: la lista de proveedores`);
        // Los cobros por ventas y las reservas son de Supervisar: en Vender ni se piden.
        if (/^\/api\/(cobros|reservas)\b/.test(ruta)) malos.push(`pidió ${ruta}: plata o reservas de otros`);
        if (/face-images/.test(ruta)) malos.push(`pidió ${ruta}: las fotos de las caras de otros`);
      }
      for (const x of desdeAbrir.filter((y) => esLista(y.u) && y.m === "GET")) {
        const q = new URL(x.u).searchParams.get("proveedor");
        if (!q || !q.trim()) malos.push(`pidió el catálogo sin proveedor: ${x.u.replace(ORIGEN, "")}`);
      }
      const suyo = supplierDe(PROVEEDOR);
      assert.ok(suyo != null, `${PROVEEDOR} no tiene artes en el catálogo sembrado`);
      for (const l of listas) {
        const ids = [...new Set((l.json || []).map((a) => a.supplier_id))];
        if (ids.length > 1 || (ids.length === 1 && ids[0] !== suyo)) malos.push(`la lista trajo artes de ${ids.join(", ")}: ${l.u.replace(ORIGEN, "")}`);
      }
      const propios = idsDe(PROVEEDOR);
      for (const x of desdeAbrir) {
        const id = imagenDe(x.u);
        if (id != null && !propios.has(id)) malos.push(`pidió la imagen del arte ${id}, que no es de ${PROVEEDOR}`);
      }
      assert.ok(listas.length >= 1, "el visor no pidió el catálogo del proveedor");
      assert.deepEqual([...new Set(malos)], [], `\n         ${[...new Set(malos)].join("\n         ")}`);
    });

    // Girar y acercar en el lienzo: la cámara es local.
    const lienzo = await pv.locator(".visor-escena canvas").boundingBox();
    await pv.mouse.move(lienzo.x + lienzo.width * 0.3, lienzo.y + lienzo.height * 0.5);
    await pv.mouse.down();
    await pv.mouse.move(lienzo.x + lienzo.width * 0.45, lienzo.y + lienzo.height * 0.45, { steps: 12 });
    await pv.mouse.up();
    for (let i = 0; i < 4; i++) { await pv.mouse.wheel(0, -120); await pv.waitForTimeout(80); }
    await pv.waitForTimeout(800);
    const almacenDespues = await almacen(pv);
    const escritos = pedidos.slice(desde).filter((x) => x.m !== "GET"
      && !(x.m === "POST" && esLista(x.u)) && !(x.m === "PUT" && /^\/api\/catalogo\/\d+\/ficha$/.test(new URL(x.u).pathname)));
    const pestana = await pv.evaluate(() => ({
      cajones: document.querySelectorAll("[data-cajon-oscuro]").length,
      hoja: !!document.querySelector(".vender-hoja"),
      boton: /Guardar contrato/.test(document.body.textContent || ""),
    }));
    prueba("navegador · visor: nada se escribe — ni la cámara del editor, ni el plano, ni otra pestaña", () => {
      assert.equal(almacenDespues.camara, almacenAntes.camara, "girar en el visor movió la cámara guardada del Editor 3D");
      assert.equal(almacenDespues.planos, almacenAntes.planos, "el visor tocó el plano guardado");
      assert.deepEqual(escritos.map((x) => `${x.m} ${x.u.replace(ORIGEN, "")}`), [], "el visor escribió en el servidor");
      assert.ok(pestana.hoja && pestana.boton, "Vender ya no está debajo del visor: cambió de pestaña");
      assert.equal(pestana.cajones, 1, "hay otro cajón oscuro además del visor (¿el Editor 3D?)");
    });

    const foco = [];
    await pv.locator(".visor-volver").focus();
    for (let i = 0; i < 20; i++) {
      await pv.keyboard.press("Tab");
      foco.push(await pv.evaluate(() => !!document.activeElement?.closest(".visor-venta")));
    }
    const capa = await pv.evaluate(() => {
      const sonda = document.createElement("i");
      sonda.style.background = "var(--signal)";
      document.body.appendChild(sonda);
      const amarillo = getComputedStyle(sonda).backgroundColor;
      sonda.remove();
      const conAmarillo = [...document.querySelectorAll("body *")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).backgroundColor === amarillo;
      }).map((el) => (el.textContent || el.tagName).trim().slice(0, 30));
      return {
        modal: document.documentElement.hasAttribute("data-modal-abierto"),
        inerte: document.getElementById("root")?.hasAttribute("inert"),
        conAmarillo,
      };
    });
    prueba("navegador · visor: el amarillo de la ficha se apaga, la app de atrás queda inerte y el Tab no se escapa", () => {
      assert.ok(capa.modal, "sin `data-modal-abierto`: el amarillo de la ficha sigue encendido detrás");
      assert.deepEqual(capa.conAmarillo, [], `amarillo a la vista con el visor abierto: ${capa.conAmarillo.join(" · ")}`);
      assert.ok(capa.inerte, "la app de atrás no está `inert`: el Tab cae en los campos del contrato");
      assert.ok(foco.every(Boolean), `el Tab salió del visor en el paso ${foco.indexOf(false) + 1}`);
    });

    // El contraste del chrome del visor (chapa, HUD, cajón), con el HUD despierto.
    const contrasteDelVisor = async (pg) => {
      await pg.mouse.move(400, 400);
      await pg.waitForTimeout(300);
      return pg.evaluate(() => {
        const out = [];
        const fondoDe = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        for (const el of document.querySelectorAll(".visor-venta *")) {
          if (el.children.length || el.closest("canvas")) continue;
          const t = (el.textContent || "").trim();
          if (t.length < 2) continue;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
          const apagado = !!el.closest("[disabled],[aria-disabled='true']") || Number(cs.opacity) < 1;
          out.push({ t: t.slice(0, 30), fg: cs.color, bg: fondoDe(el), px: parseFloat(cs.fontSize), peso: cs.fontWeight, apagado });
        }
        return out;
      });
    };
    const bajosDe = (medidas) => {
      const bajos = [];
      for (const m of medidas) {
        if (m.apagado) continue;
        const grande = m.px >= 24 || (m.px >= 18.66 && Number(m.peso) >= 700);
        const r = razon(rgb(m.fg), rgb(m.bg));
        if (r < (grande ? 3 : 4.5)) bajos.push(`«${m.t}» ${m.fg} sobre ${m.bg} a ${m.px}px: ${r.toFixed(2)}:1`);
      }
      return [...new Set(bajos)];
    };
    const medidasClaro = await contrasteDelVisor(pv);
    prueba("navegador · visor: contraste de «Ver en 3D» y de la chapa, el HUD y el cajón (claro)", () => {
      assert.ok(medidasClaro.length > 10, `sólo ${medidasClaro.length} textos medidos en el visor`);
      const b = bajosDe([...botonClaro, ...medidasClaro]);
      assert.deepEqual(b, [], `${b.length} pares por debajo del piso:\n         ${b.slice(0, 20).join("\n         ")}`);
    });

    // ── Volver, dos veces: con el botón y con Esc ──────────────────────
    await pv.locator(".visor-volver").click();
    await pv.waitForTimeout(700);
    await amarilloDeVuelta(pv);
    const trasBoton = { contrato: await contrato(pv), estado: await cerrado(pv) };
    await abrirVisor(pv);
    const sesion = await pv.evaluate(() => ({
      conProveedor: [...document.querySelectorAll(".visor-hud-boton")].map((b) => b.textContent.trim()),
    }));
    // El cajón puede venir abierto: «Ver en 3D» abre la última cara tocada
    // (sin producto, con el cajón abierto) y de ahí se saltó a la primera.
    if (!(await pv.locator(".visor-cajon").count())) await tocarHud(pv, "Producto");
    await pv.waitForSelector(".visor-producto", { timeout: 30000 });
    const marcado = await pv.locator('.visor-producto[aria-pressed="true"]').count();
    await pv.locator(".visor-volver").focus();
    await pv.keyboard.press("Escape");
    await pv.waitForTimeout(700);
    await amarilloDeVuelta(pv);
    const trasEsc = { contrato: await contrato(pv), estado: await cerrado(pv) };
    for (const [como, r] of [["con «Volver al contrato»", trasBoton], ["con Esc", trasEsc]]) {
      prueba(`navegador · visor: cerrar ${como} deja el contrato exactamente como estaba`, () => {
        assert.deepEqual(r.contrato, antes, "el contrato cambió al pasar por el 3D");
        assert.ok(!r.estado.visor, "el visor quedó en pantalla");
        assert.equal(r.estado.inerte, false, "la app quedó `inert`");
        assert.ok(!r.estado.modal, "`data-modal-abierto` quedó puesto: el amarillo no vuelve");
        assert.equal(r.estado.amarillos, 1, `${r.estado.amarillos} botones amarillos a la vista`);
        assert.ok(!r.estado.pantallaCompleta, "la pantalla completa quedó puesta");
      });
    }
    prueba("navegador · visor: el foco vuelve a «Ver en 3D»", () => {
      for (const r of [trasBoton, trasEsc]) assert.equal(r.estado.foco, "Ver en 3D", `el foco quedó en ${r.estado.foco}`);
    });
    prueba("navegador · visor: al reabrir, la cara conserva su producto", () => {
      assert.ok(sesion.conProveedor.some((t) => mismo(t, `Con ${PROVEEDOR}`)), `el HUD no ofrece «Con ${PROVEEDOR}»: ${sesion.conProveedor.join(" · ")}`);
      assert.equal(marcado, 1, "el cajón no marca el producto puesto");
    });

    // ── Otro proveedor: la prueba se va, y sólo se piden SUS imágenes ───
    // Una falla acá (un selector que no llega) se cuenta como FALLA de esta
    // prueba y las de abajo siguen corriendo.
    const seccion = async (nombre, fn) => { try { await fn(); } catch (e) { prueba(nombre, () => { throw e; }); } };
    const hudDelVisor = (pg) => pg.evaluate(() => [...document.querySelectorAll(".visor-hud-boton")].map((b) => b.textContent.trim()));
    await seccion("navegador · visor: cambiar de proveedor se lleva la prueba del anterior", async () => {
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(OTRO);
      await pv.waitForTimeout(500);
      const desdeOtro = pedidos.length;
      await abrirVisor(pv);
      await pv.waitForTimeout(2500);   // la lista del proveedor nuevo
      const conOtro = {
        cajon: await pv.locator(".visor-cajon").count(),
        texto: await textoDelVisor(pv),
        marcados: await pv.locator('.visor-producto[aria-pressed="true"]').count(),
        hud: await hudDelVisor(pv),
        imagenes: pedidos.slice(desdeOtro).map((x) => imagenDe(x.u)).filter((id) => id != null),
      };
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(500);
      // Y de vuelta al primero: la prueba no reaparece, se olvidó al cambiar.
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
      await pv.waitForTimeout(500);
      await abrirVisor(pv);
      await pv.waitForTimeout(2500);
      const deVuelta = { cajon: await pv.locator(".visor-cajon").count(), hud: await hudDelVisor(pv) };
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(500);
      prueba("navegador · visor: cambiar de proveedor se lleva la prueba del anterior", () => {
        assert.equal(conOtro.cajon, 1, `con ${OTRO} la cara no llega vacía (el cajón no se abre solo): la prueba del anterior sigue en la sesión`);
        assert.equal(conOtro.marcados, 0, "la cara sigue con el producto del proveedor anterior");
        assert.ok(!conOtro.hud.some((x) => /^Con /.test(x)), `el HUD ofrece «${conOtro.hud.find((x) => /^Con /.test(x))}» con ${OTRO}`);
        assert.ok(!new RegExp(PROVEEDOR, "i").test(conOtro.texto), `«${PROVEEDOR}» se lee en el visor de ${OTRO}`);
        const ajenas = conOtro.imagenes.filter((id) => !idsDe(OTRO).has(id));
        assert.deepEqual(ajenas, [], `con ${OTRO} se pidieron imágenes de otros: ${ajenas.join(", ")}`);
        assert.ok(deVuelta.cajon === 1 && !deVuelta.hud.some((x) => /^Con /.test(x)),
          `volviendo a ${PROVEEDOR}, su prueba reapareció: no se olvidó al cambiar de proveedor`);
      });
    });

    // ── Sin proveedor: se pregunta, y no se pide nada ───────────────────
    await seccion("navegador · visor: sin proveedor, el cajón lo pregunta y no se pide ningún catálogo ni imagen", async () => {
    await pv.locator('.vender input[aria-label="Proveedor"]').fill("");
    await pv.waitForTimeout(500);
    const desdeNadie = pedidos.length;
    await abrirVisor(pv);
    await pv.waitForTimeout(1500);
    const sinNadie = {
      pregunta: /¿Con qué proveedor estás armando este contrato\?/.test(await textoDelVisor(pv)),
      pedidos: pedidos.slice(desdeNadie).filter((x) => esLista(x.u) || imagenDe(x.u) != null).map((x) => x.u.replace(ORIGEN, "")),
    };
    await pv.locator(".visor-volver").click();
    await pv.waitForTimeout(500);
    prueba("navegador · visor: sin proveedor, el cajón lo pregunta y no se pide ningún catálogo ni imagen", () => {
      assert.ok(sinNadie.pregunta, "el cajón no pregunta por el proveedor");
      assert.deepEqual(sinNadie.pedidos, [], "sin proveedor se pidió el catálogo o una imagen");
    });
    });

    // ── Abrir y cerrar cinco veces: sin contextos perdidos ni lienzo en blanco
    await seccion("navegador · visor: abrir y cerrar cinco veces no pierde el contexto de WebGL ni deja el lienzo en blanco", async () => {
    await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
    await pv.waitForTimeout(500);
    let varianza = 0;
    for (let i = 0; i < 5; i++) {
      await abrirVisor(pv);
      if (i === 4) {
        await pv.waitForTimeout(1500);
        varianza = await pv.evaluate(() => new Promise((res) => {
          const c = document.querySelector(".visor-escena canvas");
          const img = new Image();
          img.onload = () => {
            const k = document.createElement("canvas");
            k.width = 160; k.height = 90;
            const g = k.getContext("2d");
            g.drawImage(img, 0, 0, 160, 90);
            const d = g.getImageData(0, 0, 160, 90).data;
            let s = 0, s2 = 0, n = 0;
            for (let j = 0; j < d.length; j += 4) { const y = (d[j] + d[j + 1] + d[j + 2]) / 3; s += y; s2 += y * y; n++; }
            res(s2 / n - (s / n) ** 2);
          };
          img.onerror = () => res(0);
          img.src = c.toDataURL("image/png");
        }));
      }
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
    }
    prueba("navegador · visor: abrir y cerrar cinco veces no pierde el contexto de WebGL ni deja el lienzo en blanco", () => {
      assert.deepEqual(errores3D, [], `\n         ${errores3D.join("\n         ")}`);
      assert.ok(varianza > 1, `el quinto lienzo salió plano (varianza ${varianza.toFixed(2)})`);
      assert.deepEqual(erroresDePagina, [], `errores de la página: ${erroresDePagina.join(" · ")}`);
    });
    });
    // ── La fila en conflicto: el aviso a todo el ancho, y esa cara no va al 3D
    await seccion("navegador · la fila en conflicto: el aviso a todo el ancho, y esa cara no va al 3D", async () => {
      const CHOQUE = process.env.PROBAR_VENDER_CHOQUE ?? "PUN-01";
      const cods = await pv.evaluate(() => [...document.querySelectorAll("text.p-cod")].map((n) => n.getAttribute("data-cod")));
      if (!cods.includes(CHOQUE)) { aviso(`no está ${CHOQUE} en el plano (PROBAR_VENDER_CHOQUE): no se prueba la fila en conflicto`); return; }
      await tocar(pv, CHOQUE);
      await pv.mouse.move(5, 5);
      await pv.waitForTimeout(1800);
      const fila = await pv.evaluate((c) => {
        const e = [...document.querySelectorAll(".eitem")].find((x) => x.querySelector(".cod")?.firstChild?.textContent?.trim() === c);
        if (!e) return null;
        const a = e.querySelector(".aviso.choque");
        const r = e.getBoundingClientRect();
        return {
          alto: r.height, desborda: e.scrollWidth > e.clientWidth + 0.5,
          aviso: a ? a.getBoundingClientRect().width / (r.width - 22) : 0,
          boton: document.querySelector("[data-ver-3d]")?.getAttribute("aria-label") ?? "",
        };
      }, CHOQUE);
      await pv.locator("[data-ver-3d]").click();
      await visorListo(pv);
      const enVisor = await pv.evaluate(() => [document.querySelector(".visor-chapa-cod")?.textContent,
        ...[...document.querySelectorAll(".visor-pestana")].map((b) => b.textContent)].map((t) => (t ?? "").trim()));
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      await pv.locator(`.eitem .x[aria-label="Quitar ${CHOQUE} del contrato"]`).click();
      await pv.waitForTimeout(600);
      prueba("navegador · la fila en conflicto: el aviso a todo el ancho, y esa cara no va al 3D", () => {
        assert.ok(fila, `${CHOQUE} no entró al contrato`);
        if (fila.aviso === 0) { aviso(`${CHOQUE} no choca en el periodo de la base: no se mide el aviso`); return; }
        assert.ok(fila.aviso >= 0.95, `el aviso de choque ocupa el ${(fila.aviso * 100).toFixed(0)} % de la fila (va a todo el ancho)`);
        assert.ok(fila.alto <= 100, `la fila con el choque mide ${fila.alto.toFixed(0)} px (antes: 255 a 1440)`);
        assert.ok(!fila.desborda, "la fila en conflicto desborda su tarjeta");
        assert.ok(!fila.boton.includes(CHOQUE), `«Ver en 3D» abre ${CHOQUE}, que ya está vendida: ${fila.boton}`);
        assert.ok(!enVisor.includes(CHOQUE), `el visor ofrece ${CHOQUE}, que no se puede vender: ${enVisor.join(", ")}`);
      });
    });

    // ── Las repisas vendidas aparte: a la dueña en la fila; al proveedor, no
    await seccion("navegador · visor: las repisas vendidas aparte se le avisan a la dueña y no se le contradicen al proveedor", async () => {
      const conRepisas = await pv.evaluate(() => [...document.querySelectorAll(".eitem [data-repisas-vendidas]")]
        .map((n) => n.closest(".eitem").querySelector(".cod").firstChild.textContent.trim()));
      if (!conRepisas.length) { aviso("ninguna cara del contrato tiene repisas vendidas aparte en el plano: no se prueba"); return; }
      const cara = conRepisas[0];
      await abrirVisor(pv, cara);
      await pv.waitForSelector(".visor-producto", { timeout: 60000 });
      if (!(await pv.locator('.visor-producto[aria-pressed="true"]').count())) await pv.locator(".visor-producto").first().click();
      await pv.waitForSelector("[data-panel-prueba]", { timeout: 60000 });
      await pv.waitForTimeout(4000);
      const todaLaCara = await textoDelVisor(pv);
      await pv.locator("[data-panel-prueba] button", { hasText: "Por entrepaño" }).click();
      await pv.waitForTimeout(1000);
      const porEntrepano = await pv.evaluate(() => {
        const v = document.querySelector(".visor-venta");
        const sonda = document.createElement("span");
        sonda.className = "text-warning";
        v.appendChild(sonda);
        const naranja = getComputedStyle(sonda).color;
        sonda.remove();
        const chips = [...v.querySelectorAll("[data-entrepano-vendido]")].map((n) => getComputedStyle(n).color);
        return { texto: v.innerText, chips, naranja, tapados: v.querySelectorAll("[data-vendidos-tapados]").length };
      });
      await pv.locator(".visor-boton-linea", { hasText: "Quitar el producto" }).click();
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      prueba("navegador · visor: las repisas vendidas aparte se le avisan a la dueña y no se le contradicen al proveedor", () => {
        assert.ok(!/los tapa/.test(todaLaCara), `con «Toda la cara» el visor dice que la prueba tapa entrepaños vendidos (${cara})`);
        assert.ok(!/los tapa|elegidos est[aá] vendido/.test(porEntrepano.texto), "con «Por entrepaño» el visor avisa entrepaños vendidos");
        assert.equal(porEntrepano.tapados, 0, "el aviso de entrepaños vendidos está en el DOM del visor");
        const naranjas = porEntrepano.chips.filter((c) => c === porEntrepano.naranja);
        assert.deepEqual(naranjas, [], "la marca «vendido» de los entrepaños va en naranja delante del proveedor");
        // Y ni en gris: Vender vende la cara ENTERA (`sinRepisasVendidas`), y
        // el visor la muestra así —la fila de la dueña cuenta 3 espacios y el
        // visor marcaba 5 entrepaños, de las dos caras—.
        assert.equal(porEntrepano.chips.length, 0, `el visor marca ${porEntrepano.chips.length} entrepaños vendidos en una cara que Vender ofrece entera`);
      });
    });

    // ── La lámina: se baja para el proveedor, y nada más ─────────────────
    // (Adjuntarla al contrato se fue de Vender: la planometría se carga sólo
    // en Supervisar.)
    await seccion("navegador · visor: la lámina se baja, sin escribir nada y sin adjuntarse al contrato", async () => {
      const antesL = await contrato(pv);
      const almacenL0 = await almacen(pv);
      await abrirVisor(pv);
      await pv.waitForSelector(".visor-producto", { timeout: 60000 });
      if (!(await pv.locator('.visor-producto[aria-pressed="true"]').count())) await pv.locator(".visor-producto").first().click();
      await pv.waitForSelector("[data-bajar-lamina]", { timeout: 60000 });
      await pv.waitForTimeout(4000);
      const desdeLamina = pedidos.length;
      const [descarga] = await Promise.all([
        pv.waitForEvent("download", { timeout: 180000 }),
        pv.locator("[data-bajar-lamina]").click(),
      ]);
      const nombre = descarga.suggestedFilename();
      const bytes = readFileSync(await descarga.path());
      await pv.waitForFunction(() => !document.querySelector("[data-bajar-lamina]")?.disabled, null, { timeout: 60000 });
      const adjuntar = await pv.locator("[data-lamina-planometria], [data-lamina-adjunta]").count();
      const textoL = await textoDelVisor(pv);
      const escritos = pedidos.slice(desdeLamina).filter((x) => x.m !== "GET").map((x) => `${x.m} ${x.u.replace(ORIGEN, "")}`);
      const almacenL1 = await almacen(pv);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      const despuesL = await contrato(pv);
      prueba("navegador · visor: la lámina se baja, sin escribir nada y sin adjuntarse al contrato", () => {
        assert.match(nombre, /\.png$/, `la lámina bajó como ${nombre}`);
        assert.ok(nombre.toLowerCase().includes(PROVEEDOR.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()), `la lámina no es la de ${PROVEEDOR}: ${nombre}`);
        assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", "la lámina no es un PNG");
        assert.ok(bytes.length > 20_000, `la lámina pesa ${bytes.length} B: no trae las tomas`);
        assert.equal(adjuntar, 0, "el visor sigue ofreciendo «Usarla como planometría»");
        assert.deepEqual(escritos, [], "armar la lámina escribió en el servidor");
        assert.equal(almacenL1.camara, almacenL0.camara, "la lámina movió la cámara guardada del Editor 3D");
        assert.equal(almacenL1.planos, almacenL0.planos, "la lámina tocó el plano guardado");
        const salen = AJENOS.filter((n) => new RegExp(n, "i").test(textoL));
        assert.deepEqual(salen, [], `con la lámina se lee: ${salen.join(", ")}`);
        assert.equal(despuesL.archivos, 0, "después de la lámina, la ficha tiene un campo de archivo");
        assert.deepEqual(despuesL.filas, antesL.filas, "bajar la lámina cambió las filas del contrato");
      });
    });

    // ── Otro proveedor: la ficha no nombra al anterior ───────────────────
    await seccion("navegador · visor: cambiar de proveedor no deja al anterior nombrado en la ficha", async () => {
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(OTRO);
      await pv.waitForTimeout(700);
      const ficha = await pv.evaluate(`(() => {
        const panel = ${PANEL};
        const t = [panel.innerText];
        for (const n of panel.querySelectorAll("[title],[aria-label]")) t.push(n.getAttribute("title"), n.getAttribute("aria-label"));
        return { texto: t.filter(Boolean).join("\\n") };
      })()`);
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: cambiar de proveedor no deja al anterior nombrado en la ficha", () => {
        assert.ok(!new RegExp(PROVEEDOR, "i").test(ficha.texto), `con ${OTRO}, la ficha nombra a ${PROVEEDOR}`);
      });
    });

    // ── El proveedor mal escrito: ni «no tiene productos» ni un alta muda ─
    await seccion("navegador · visor: el proveedor sin tilde no dice «no tiene productos» ni da de alta sin preguntar", async () => {
      const sinTilde = OTRO.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (sinTilde === OTRO) { aviso(`«${OTRO}» no tiene tildes: no se prueba el nombre mal escrito`); return; }
      const contar = () => fetch(ORIGEN + "/api/suppliers/", { headers: { Authorization: "Bearer " + TOKEN } })
        .then((r) => r.json()).then((l) => (Array.isArray(l) ? l.length : -1)).catch(() => -1);
      // Una foto de verdad, del catálogo del primero (la ficha del envase la mide).
      const unArte = [...idsDe(PROVEEDOR)][0];
      const foto = Buffer.from(await fetch(`${ORIGEN}/api/catalogo/${unArte}/imagen?token=${encodeURIComponent(TOKEN)}`).then((r) => r.arrayBuffer()));
      const antesN = await contar();
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(sinTilde);
      await pv.waitForTimeout(600);
      await abrirVisor(pv);
      await pv.waitForSelector("[data-sin-productos]", { timeout: 30000 });
      const texto = await textoDelVisor(pv);
      await pv.locator(".visor-cajon-pie button", { hasText: "Subir un producto" }).click();
      await pv.locator('[data-subir-producto] input[aria-label="Nombre del producto"]').fill("Prueba 2 L");
      await pv.locator('[data-subir-producto] input[type="file"]').setInputFiles({ name: "prueba.jpg", mimeType: "image/jpeg", buffer: foto });
      await pv.waitForSelector('input[aria-label="Alto del envase en centímetros"]', { timeout: 30000 });
      await pv.locator('input[aria-label="Alto del envase en centímetros"]').fill("30");
      await pv.waitForTimeout(1500);
      await pv.locator("[data-subir-producto] .visor-boton", { hasText: "Subir" }).click();
      const pregunta = await pv.waitForSelector("[data-proveedor-nuevo]", { timeout: 60000 }).then(() => true).catch(() => false);
      const textoPregunta = await textoDelVisor(pv);
      if (pregunta) await pv.locator("[data-proveedor-nuevo] button", { hasText: "Revisar el nombre" }).click();
      const despuesN = await contar();
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(500);
      await pv.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: el proveedor sin tilde no dice «no tiene productos» ni da de alta sin preguntar", () => {
        assert.ok(texto.includes(`No encontré productos a nombre de «${sinTilde}»`), "el cajón no dice que no encontró productos con ESE nombre");
        assert.ok(!/todavía no tiene productos/.test(texto), "el cajón afirma que el proveedor no tiene productos");
        assert.ok(pregunta, "subir con un nombre que no está no pidió confirmar el alta");
        assert.equal(despuesN, antesN, "subir con un nombre que no está dio de alta un proveedor sin preguntar");
        for (const t of [texto, textoPregunta]) assert.ok(!t.includes(OTRO), `el visor nombra a «${OTRO}» (un parecido es el nombre de otro)`);
      });
    });

    /* ── Lo que llega tarde no pisa lo vigente (la tercera crítica) ─────────
       Las carreras: el proveedor que se cambia DESDE EL CAJÓN mientras llega
       una lista, mientras sube un producto o mientras se arma la lámina. Un
       vigía (`MutationObserver`) mira el cajón y el HUD en cada cambio del
       DOM, no cada tanto: un parpadeo de «Productos de Alpina» delante de
       Postobón también es una fuga. */
    const productosDe = (n) => catalogo.filter((a) => mismo(a.proveedor, n)).map((a) => a.nombre).filter((x) => x && x.length > 3);
    const vigiar = (pg, prohibidos) => pg.evaluate((lista) => {
      const bajos = lista.map((t) => t.toLowerCase());
      window.__vigia = [];
      const mirar = () => {
        const v = document.querySelector(".visor-venta");
        if (!v) return;
        const partes = [
          ["título del cajón", v.querySelector(".visor-cajon h2")?.textContent ?? ""],
          ...[...v.querySelectorAll(".visor-producto-nombre")].map((n) => ["producto", n.textContent ?? ""]),
          ...[...v.querySelectorAll(".visor-hud-boton")].map((n) => ["HUD", n.textContent ?? ""]),
          ...[...v.querySelectorAll('[aria-label="Cómo va"], [aria-label="La lámina"]')].map((n) => ["panel", n.textContent ?? ""]),
        ];
        for (const [donde, t] of partes) {
          const b = t.toLowerCase();
          if (bajos.some((x) => b.includes(x))) window.__vigia.push(`${donde}: «${t.trim().slice(0, 70)}»`);
        }
      };
      mirar();
      window.__vigiaObs?.disconnect();
      window.__vigiaObs = new MutationObserver(mirar);
      window.__vigiaObs.observe(document.body, { subtree: true, childList: true, characterData: true });
    }, prohibidos);
    const leerVigia = (pg) => pg.evaluate(() => { window.__vigiaObs?.disconnect(); return [...new Set(window.__vigia || [])]; });
    const tituloDelCajon = (pg) => pg.evaluate(() => document.querySelector(".visor-cajon h2")?.textContent?.trim() ?? "");
    const conCajon = async (pg) => { if (!(await pg.locator(".visor-cajon").count())) await tocarHud(pg, "Producto"); };
    const cambiarEnElCajon = async (pg, nombre) => {
      await pg.locator("[data-proveedor-del-contrato] .visor-enlace").click();
      const campo = pg.locator(".visor-cajon input.visor-entrada").first();
      await campo.fill(nombre);
      await campo.press("Enter");
    };
    const proveedorDeLaFicha = (pg, nombre) => pg.locator('.vender input[aria-label="Proveedor"]').fill(nombre);

    await seccion("navegador · visor: cambiar el proveedor desde el cajón, letra por letra, no deja a la vista la lista del anterior", async () => {
      await abrirVisor(pv);
      await conCajon(pv);
      await pv.waitForSelector(".visor-producto", { timeout: 60000 });
      const alEmpezar = await tituloDelCajon(pv);
      await pv.locator("[data-proveedor-del-contrato] .visor-enlace").click();
      const campo = pv.locator(".visor-cajon input.visor-entrada").first();
      await campo.click();
      await campo.press("Control+A");
      await campo.press("Backspace");
      // Desde acá el contrato ya no es de PROVEEDOR: nada suyo puede verse.
      await vigiar(pv, [PROVEEDOR, ...productosDe(PROVEEDOR)]);
      for (const letra of OTRO) {
        await pv.keyboard.type(letra);
        await pv.waitForTimeout(250);
      }
      await campo.press("Enter");
      await pv.waitForFunction((n) => (document.querySelector(".visor-cajon h2")?.textContent ?? "").toLowerCase().includes(n.toLowerCase()),
        OTRO, { timeout: 20000 }).catch(() => {});
      const vistos = await leerVigia(pv);
      const alTerminar = await tituloDelCajon(pv);
      await cambiarEnElCajon(pv, PROVEEDOR);
      await pv.waitForTimeout(1500);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      prueba("navegador · visor: cambiar el proveedor desde el cajón, letra por letra, no deja a la vista la lista del anterior", () => {
        assert.ok(mismo(alEmpezar, `Productos de ${PROVEEDOR}`), `antes de cambiar el cajón no mostraba la lista de ${PROVEEDOR} («${alEmpezar}»): la prueba no mide nada`);
        assert.ok(mismo(alTerminar, `Productos de ${OTRO}`), `al terminar de escribir, el cajón no llegó a la lista de ${OTRO} («${alTerminar}»)`);
        assert.deepEqual(vistos, [], `mientras se escribía «${OTRO}» el visor mostró lo de ${PROVEEDOR}:\n         ${vistos.join("\n         ")}`);
      });
    });

    await seccion("navegador · visor: la lista del proveedor anterior que llega tarde no pisa la del nuevo", async () => {
      await proveedorDeLaFicha(pv, OTRO);
      await pv.waitForTimeout(500);
      await abrirVisor(pv);
      await conCajon(pv);
      await pv.waitForSelector(".visor-producto", { timeout: 60000 });
      // La lista de PROVEEDOR tarda 6 s, como una red lenta.
      const tarde = (u) => u.pathname === "/api/catalogo/" && mismo(u.searchParams.get("proveedor"), PROVEEDOR);
      const demorar = async (r) => { await new Promise((ok) => setTimeout(ok, 6000)); await r.continue().catch(() => {}); };
      await pv.route(tarde, demorar);
      const desdeTarde = pedidos.length;
      await cambiarEnElCajon(pv, PROVEEDOR);
      await pv.waitForTimeout(1200);   // ya salió el pedido (espera 400 ms a que se deje de teclear)
      const salio = pedidos.slice(desdeTarde).some((x) => esLista(x.u) && mismo(new URL(x.u).searchParams.get("proveedor"), PROVEEDOR));
      await cambiarEnElCajon(pv, OTRO);
      await vigiar(pv, [PROVEEDOR, ...productosDe(PROVEEDOR)]);
      await pv.waitForTimeout(8000);   // la de PROVEEDOR llega en el medio
      const vistos = await leerVigia(pv);
      const alTerminar = await tituloDelCajon(pv);
      await pv.unroute(tarde, demorar);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      await proveedorDeLaFicha(pv, PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: la lista del proveedor anterior que llega tarde no pisa la del nuevo", () => {
        assert.ok(salio, `no salió el pedido de la lista de ${PROVEEDOR}: la prueba no mide nada`);
        assert.ok(mismo(alTerminar, `Productos de ${OTRO}`), `el cajón terminó en «${alTerminar}» y no en la lista de ${OTRO}`);
        assert.deepEqual(vistos, [], `la respuesta tardía de ${PROVEEDOR} pisó la lista de ${OTRO}:\n         ${vistos.join("\n         ")}`);
      });
    });

    await seccion("navegador · visor: un producto que termina de subir después de cambiar de proveedor no entra al contrato del nuevo", async () => {
      const NUEVO = "Kumis de la carrera (prueba)";
      const unArte = [...idsDe(PROVEEDOR)][0];
      const foto = Buffer.from(await fetch(`${ORIGEN}/api/catalogo/${unArte}/imagen?token=${encodeURIComponent(TOKEN)}`).then((r) => r.arrayBuffer()));
      await abrirVisor(pv);
      await conCajon(pv);
      await pv.waitForSelector(".visor-producto", { timeout: 60000 });
      await pv.locator(".visor-cajon-pie button", { hasText: "Subir un producto" }).click();
      await pv.locator('[data-subir-producto] input[aria-label="Nombre del producto"]').fill(NUEVO);
      await pv.locator('[data-subir-producto] input[type="file"]').setInputFiles({ name: "kumis.jpg", mimeType: "image/jpeg", buffer: foto });
      await pv.waitForSelector('input[aria-label="Alto del envase en centímetros"]', { timeout: 30000 });
      await pv.locator('input[aria-label="Alto del envase en centímetros"]').fill("12");
      await pv.waitForTimeout(1500);
      // La subida tarda 6 s, como una foto pesada en Render.
      const alta = (u) => u.pathname === "/api/catalogo/";
      const demorarAlta = async (r) => {
        if (r.request().method() === "POST") await new Promise((ok) => setTimeout(ok, 6000));
        await r.continue().catch(() => {});
      };
      await pv.route(alta, demorarAlta);
      const respuesta = pv.waitForResponse((r) => alta(new URL(r.url())) && r.request().method() === "POST", { timeout: 60000 });
      await pv.locator("[data-subir-producto] .visor-boton", { hasText: "Subir" }).click();
      await pv.waitForTimeout(600);
      const apagadoAlSubir = await pv.locator("[data-proveedor-del-contrato] .visor-enlace").isDisabled();
      // El alta se va de la pantalla en medio del envío (se oculta el cajón) y
      // el proveedor se cambia: es la puerta que queda abierta.
      await pv.locator(".visor-cajon-cerrar").click();
      await pv.waitForTimeout(400);
      await tocarHud(pv, "Producto");
      await pv.waitForSelector("[data-proveedor-del-contrato] .visor-enlace", { timeout: 10000 });
      await cambiarEnElCajon(pv, OTRO);
      const desdeOtro = pedidos.length;
      await vigiar(pv, [PROVEEDOR, NUEVO, ...productosDe(PROVEEDOR)]);
      const r = await respuesta.catch(() => null);
      await pv.waitForTimeout(3500);
      const vistos = await leerVigia(pv);
      const alTerminar = await tituloDelCajon(pv);
      const hud = await hudDelVisor(pv);
      const imagenes = pedidos.slice(desdeOtro).map((x) => imagenDe(x.u)).filter((id) => id != null && !idsDe(OTRO).has(id));
      await pv.unroute(alta, demorarAlta);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      await proveedorDeLaFicha(pv, PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: un producto que termina de subir después de cambiar de proveedor no entra al contrato del nuevo", () => {
        assert.ok(r && r.ok(), `la subida no terminó bien (${r ? r.status() : "sin respuesta"}): la prueba no mide nada`);
        assert.ok(apagadoAlSubir, "«cambiar» el proveedor sigue activo mientras sube el producto");
        assert.ok(mismo(alTerminar, `Productos de ${OTRO}`), `al terminar la subida el cajón dice «${alTerminar}» y no «Productos de ${OTRO}»`);
        assert.ok(!hud.some((x) => /^Con /.test(x)), `el HUD ofrece «${hud.find((x) => /^Con /.test(x))}»: el producto del anterior quedó probado en la cara`);
        assert.deepEqual(vistos, [], `con ${OTRO} en el contrato, el visor mostró lo de ${PROVEEDOR}:\n         ${vistos.join("\n         ")}`);
        assert.deepEqual(imagenes, [], `con ${OTRO} en el contrato se pidieron imágenes de otros: ${imagenes.join(", ")}`);
      });
    });

    /** El visor en PUN-03 con un producto puesto y «Para llevarse» a la vista. */
    const conLamina = async (pg) => {
      await abrirVisor(pg);
      await conCajon(pg);
      await pg.waitForSelector(".visor-producto", { timeout: 60000 });
      if (!(await pg.locator('.visor-producto[aria-pressed="true"]').count())) await pg.locator(".visor-producto").first().click();
      await pg.waitForSelector("[data-bajar-lamina]", { timeout: 60000 });
      await pg.waitForTimeout(4000);
    };
    /** Cambia el proveedor de la ficha desde afuera de la pantalla: la ficha
     *  está `inert` detrás del visor y el cajón apaga «cambiar» mientras se
     *  arma la lámina, así que ningún gesto llega. Es lo que haría una puerta
     *  nueva que alguien abra mañana; las dos defensas tienen que aguantarla. */
    const proveedorPorDetras = (pg, nombre) => pg.evaluate(`(() => {
      const panel = ${PANEL};
      const inp = panel.querySelector('input[aria-label="Proveedor"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inp, ${JSON.stringify(nombre)});
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return inp.value;
    })()`);

    await seccion("navegador · visor: mientras se arma la lámina el visor queda quieto, y si cambia el proveedor no se baja", async () => {
      await conLamina(pv);
      const bajadas = [];
      const oyente = (d) => bajadas.push(d.suggestedFilename());
      pv.on("download", oyente);
      await pv.locator("[data-bajar-lamina]").click();
      await pv.waitForSelector("[data-armando]", { timeout: 30000 });
      const quieto = await pv.evaluate(() => ({
        pestanas: [...document.querySelectorAll(".visor-pestana")].map((b) => b.disabled),
        hud: [...document.querySelectorAll(".visor-hud-boton")].map((b) => b.disabled),
        ocultar: document.querySelector(".visor-cajon-cerrar")?.disabled ?? null,
        cajon: document.querySelector("[data-visor-quieto]")?.disabled ?? null,
        cambiar: document.querySelector("[data-proveedor-del-contrato] .visor-enlace")?.matches(":disabled") ?? null,
        productos: [...document.querySelectorAll(".visor-producto")].map((b) => b.matches(":disabled")),
      }));
      const escrito = await proveedorPorDetras(pv, OTRO);
      await pv.waitForSelector("[data-armando]", { state: "detached", timeout: 180000 });
      await pv.waitForTimeout(800);
      pv.off("download", oyente);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      const despuesQ = await contrato(pv);
      const fichaQ = await pv.evaluate(`(() => { const p = ${PANEL}; return { texto: p.innerText }; })()`);
      await proveedorDeLaFicha(pv, PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: mientras se arma la lámina el visor queda quieto, y si cambia el proveedor no se baja", () => {
        const sueltos = [];
        if (!quieto.pestanas.length || quieto.pestanas.some((d) => !d)) sueltos.push(`la chapa deja saltar de cara (${quieto.pestanas.join(",")})`);
        if (!quieto.hud.length || quieto.hud.some((d) => !d)) sueltos.push(`el HUD sigue activo (${quieto.hud.join(",")})`);
        if (quieto.ocultar !== true) sueltos.push("«Ocultar» sigue activo");
        if (quieto.cajon !== true || quieto.cambiar !== true) sueltos.push("el proveedor del cajón se puede cambiar");
        if (quieto.productos.some((d) => !d)) sueltos.push("se puede elegir otro producto");
        assert.deepEqual(sueltos, [], `mientras se arma la lámina:\n         ${sueltos.join("\n         ")}`);
        assert.ok(mismo(escrito, OTRO), "no se pudo cambiar el proveedor de la ficha: la prueba no mide nada");
        assert.deepEqual(bajadas, [], `con el proveedor cambiado en el medio, se bajó la lámina del anterior: ${bajadas.join(", ")}`);
        assert.equal(despuesQ.archivos, 0, "la ficha tiene un campo de archivo");
        assert.ok(!new RegExp(PROVEEDOR, "i").test(fichaQ.texto), `la ficha de ${OTRO} nombra a ${PROVEEDOR}`);
      });
    });

    await seccion("navegador · visor: cerrar a mitad de la lámina no baja ni adjunta nada después", async () => {
      await conLamina(pv);
      const bajadas = [];
      const oyente = (d) => bajadas.push(d.suggestedFilename());
      pv.on("download", oyente);
      await pv.locator("[data-bajar-lamina]").click();
      await pv.waitForSelector("[data-armando]", { timeout: 30000 });
      await pv.waitForTimeout(1000);
      await pv.locator(".visor-volver").click();
      // Sin el arreglo, la lámina terminaba sola unos 25 s después.
      await pv.waitForTimeout(35000);
      pv.off("download", oyente);
      const despuesC = await contrato(pv);
      prueba("navegador · visor: cerrar a mitad de la lámina no baja ni adjunta nada después", () => {
        assert.deepEqual(bajadas, [], `después de cerrar, se bajó ${bajadas.join(", ")} sin que nadie lo pidiera`);
        assert.equal(despuesC.archivos, 0, "la ficha tiene un campo de archivo");
        assert.deepEqual(erroresDePagina, [], `errores de la página: ${erroresDePagina.join(" · ")}`);
      });
    });

    await seccion("navegador · visor: «Empezar de nuevo» olvida la prueba del 3D y deja el proveedor", async () => {
      await conLamina(pv);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      await pv.locator(".vender button", { hasText: "Empezar de nuevo" }).click();
      await pv.waitForTimeout(600);
      await tocar(pv, CARAS[0]);
      await pv.waitForTimeout(600);
      const deNuevo = await contrato(pv);
      await abrirVisor(pv);
      await conCajon(pv);
      const probado = await pv.locator('.visor-producto[aria-pressed="true"]').count();
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(600);
      prueba("navegador · visor: «Empezar de nuevo» olvida la prueba del 3D y deja el proveedor", () => {
        assert.equal(probado, 0, "después de «Empezar de nuevo», el visor sigue con el producto probado");
        assert.ok(mismo(deNuevo.campos[0], PROVEEDOR), `el proveedor quedó en «${deNuevo.campos[0]}»`);
      });
    });

    await cv.close();

    // ── Si el 3D no baja: se dice, y el contrato sigue ──────────────────
    await seccion("navegador · visor: si el archivo del 3D no baja, se avisa y el contrato queda intacto", async () => {
      const caidas = [];
      const { ctx: cf, p: pf } = await abrir("light", { antes: async (pg) => {
        pg.on("pageerror", (e) => caidas.push(String(e).split("\n")[0]));
        await pg.route("**/VisorDeVenta-*.js", (r) => r.abort());
      } });
      await tocar(pf, CARAS[0]);
      await pf.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
      await pf.locator(".eitem .m input").first().fill("1500000");
      await pf.waitForTimeout(400);
      const antesFalla = await contrato(pf);
      await pf.locator("[data-ver-3d]").click();
      const aviso3D = await pf.waitForSelector("text=No se pudo abrir el 3D", { timeout: 30000 }).then(() => true).catch(() => false);
      const sigue = await pf.evaluate(() => /Guardar contrato/.test(document.body.textContent || ""));
      await pf.locator(".visor-volver").click().catch(() => {});
      await pf.waitForTimeout(500);
      const despuesFalla = await contrato(pf);
      prueba("navegador · visor: si el archivo del 3D no baja, se avisa y el contrato queda intacto", () => {
        assert.ok(aviso3D, "no apareció «No se pudo abrir el 3D»");
        assert.ok(sigue, "Vender se desmontó: no está «Guardar contrato»");
        assert.deepEqual(despuesFalla, antesFalla, "el contrato cambió después de la falla");
        assert.deepEqual(caidas, [], `la página se cayó: ${caidas.join(" · ")}`);
      });
      await cf.close();
    });

    // ── El contraste del botón «3D» y del visor, en oscuro ───────────────
    await seccion("navegador · visor: contraste de «Ver en 3D» y del visor (oscuro)", async () => {
      const { ctx: co, p: po } = await abrir("dark");
      await tocar(po, CARAS[0]);
      await po.locator('.vender input[aria-label="Proveedor"]').fill(PROVEEDOR);
      await po.mouse.move(5, 5);
      await po.waitForTimeout(500);
      const botonOscuro = await po.evaluate(() => {
        const b = document.querySelector("[data-ver-3d]");
        const fondo = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255,255,255)"; };
        return { fg: getComputedStyle(b).color, bg: fondo(b), px: parseFloat(getComputedStyle(b).fontSize), peso: "600", t: "Ver en 3D", apagado: false };
      });
      await abrirVisor(po);
      await po.waitForTimeout(1500);
      const medidasOscuro = await contrasteDelVisor(po);
      prueba("navegador · visor: contraste de «Ver en 3D» y del visor (oscuro)", () => {
        const b = bajosDe([botonOscuro, ...medidasOscuro]);
        assert.deepEqual(b, [], `${b.length} pares por debajo del piso:\n         ${b.slice(0, 20).join("\n         ")}`);
      });
      await co.close();
    });
  }

  await ctx.close();
  await nav.close();
}

console.log(`\n${hechas} pruebas de Vender`);
