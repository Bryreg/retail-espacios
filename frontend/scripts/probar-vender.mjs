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
  "src/components/Contrato/Planometria.tsx",
  "src/components/Libera/Libera.tsx",
  // El visor 3D que se abre ENCIMA de la ficha (la fila de cada cara), y la
  // prueba de producto que vive en la ficha. Se dibujan dentro de Vender: los
  // mira el proveedor, así que pasan por todas las guardas de este archivo.
  "src/components/Contrato/VisorDeVenta.tsx",
  "src/components/Contrato/sesionDeVenta.ts",
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
  "Planometria", "CancelarContrato",
  // La ficha (`ModoVender.tsx`): sus piezas, los íconos y el aviso de a quién
  // se le escribe (el personal de la sede, no otro proveedor).
  "Panel", "Fila", "NoComercializable", "Cerrado", "Ficha", "NotifyPreview",
  "Box", "Lock", "Check", "ImageUp", "AlertTriangle", "Loader2",
  // Lo que rodea al visor 3D: el límite de errores, la espera y el aviso.
  "LimiteDelVisor", "Suspense", "AbriendoEl3D", "FallaDelVisor", "VisorDeVenta",
  // La planometría adjunta.
  "ImageIcon", "FileText", "Trash2",
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
  assert.ok(unicos.length >= 1, "Vender no tiene botón principal: «Guardar contrato y avisar» es el amarillo de esta pantalla");
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
  [/["'`]\/suppliers/, "'/suppliers' — la lista de proveedores"],
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
  assert.match(modoCodigo, /<Panel\s+derecha=\{[^]*?className="ver3d"[^]*?<span className="vpill">sin firmar<\/span>/,
    "el «Ver en 3D» no está en la cabecera del panel, junto a «sin firmar»");
  // El choque, fuera de la columna del tipo y a todo el ancho.
  assert.ok(!/className="choque"/.test(fila), "el choque volvió a la columna angosta del tipo");
  assert.match(fila, /className="aviso choque"/, "el choque no es un aviso de la fila");
  assert.match(leer("src/vender.css"), /\.eitem > \.aviso \{\s*flex: 0 0 100%;/, "el aviso de la fila no ocupa todo el ancho");
  // Las caras que chocan no van al visor: no se le muestra al proveedor un
  // espacio que no se le puede vender.
  assert.match(modoCodigo, /\.filter\(\(l\) => l\.disponibilidad === "libre" && l\.choqueServidor\.length === 0\)/,
    "el visor recibe caras que ya están vendidas en el periodo");
});

prueba("la lámina del visor: del proveedor de los artes, sin período ni valor, y a la planometría de la FICHA", () => {
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
  // La planometría: SÓLO el archivo de la lámina, y sólo al campo de la ficha.
  const llamadas = [...visorCodigo.matchAll(/\bonPlanometria\(([^;]*)\);/g)].map((m) => m[1]);
  assert.deepEqual(llamadas.map((x) => x.startsWith("new File([jpg.blob]")), [true], `onPlanometria recibe otra cosa: ${llamadas.join(" · ")}`);
  assert.match(modoCodigo, /const adjuntarLamina = useCallback\(\(archivo: File, cara: string, proveedor: string\) => \{\s*if \(normalizarProveedor\(proveedor\) !== normalizarProveedor\(proveedorVigente\.current\)\) return false;\s*setPlanometria\(archivo\);\s*marcarLamina\(\{ archivo, cara \}\);\s*setMasDatos\(true\);\s*return true;\s*\}, \[setPlanometria, marcarLamina\]\);/,
    "la lámina adjunta escribe algo más que el campo de planometría de la ficha (y la marca de la sesión), o entra aunque el contrato ya sea de otro proveedor");
  assert.match(modoCodigo, /const proveedorVigente = useRef\(c\.proveedor\);\s*proveedorVigente\.current = c\.proveedor;/,
    "la ficha compara la lámina con el proveedor del render del clic, no con el vigente");
  assert.match(modoCodigo, /onPlanometria=\{adjuntarLamina\}/, "el visor no recibe el adjuntar de la ficha");
});

prueba("la lámina adjunta se va con el proveedor: cambiarlo la saca de la planometría", () => {
  // La crítica: con Alpina se adjuntaba la lámina, se escribía «Postobón» y el
  // contrato de Postobón salía con la lámina de Alpina («PROVEEDOR Alpina» y
  // su producto), que viaja por correo y guía al mercaderista.
  assert.match(sesionCodigo, /const vaciar = useCallback\(\(\) => \{[^}]*marcarLamina\(null\);[^}]*\}, \[\]\);/,
    "vaciar la sesión no olvida la lámina adjunta");
  assert.match(sesionCodigo, /if \(ahora === anterior\.current\) return;\s*anterior\.current = ahora;\s*vaciar\(\);/,
    "cambiar de proveedor no vacía la sesión");
  assert.match(modoCodigo, /if \(antes && !sesion\.lamina && c\.planometria === antes\.archivo\) \{\s*setPlanometria\(null\);/,
    "cuando la lámina se olvida, la planometría de la ficha sigue siendo la lámina del proveedor anterior");
  // Y lo que el visor dice de la planometría: la lámina (de qué cara) u «otra»,
  // sin el nombre del archivo, que puso la dueña y puede ser de cualquiera.
  assert.match(modoCodigo, /planometria=\{!c\.planometria \? null\s*: sesion\.lamina && c\.planometria === sesion\.lamina\.archivo \? \{ lamina: sesion\.lamina\.cara \} : "otra"\}/,
    "el visor no sabe de quién es la planometría que ya tiene el contrato");
  assert.ok(!/planometria\.name|planometria\?\.name/.test(visorCodigo), "el visor nombra el archivo de la planometría");
  // El aviso de que se quitó, sin decir POR QUÉ: la ficha la mira el
  // proveedor, y «era de otro proveedor» le contaba que el espacio se le
  // estuvo ofreciendo a otro (la tercera crítica).
  const quitada = (modoCodigo.match(/data-lamina-quitada>([^<]*)</) || [, ""])[1];
  assert.ok(quitada.trim().length > 10, "no se encontró el aviso de la lámina quitada");
  assert.ok(!/proveedor|otr[oa]s?\b/i.test(quitada), `el aviso de la lámina quitada sugiere otra negociación: «${quitada.trim()}»`);
  // «Empezar de nuevo» saca la lámina él mismo, sin aviso.
  assert.match(modoCodigo, /const empezarDeNuevo = \(\) => \{\s*if \(sesion\.lamina && c\.planometria === sesion\.lamina\.archivo\) setPlanometria\(null\);\s*setLaminaQuitada\(false\);\s*sesion\.vaciar\(\);\s*onCancelar\(\);\s*\};/,
    "«Empezar de nuevo» deja el aviso de la lámina quitada en una ficha que empieza de cero");
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
  const usar = (visorCodigo.match(/const usarComoPlanometria = async[^]*?\n {2}\};/) || [""])[0];
  assert.match(usar, /const jpg = await aJpeg\(r\.blob\);[^]*?if \(!r\.sigue\(\)\) throw INTERRUMPIDA;[^]*?onPlanometria\(/,
    "«Usarla como planometría» adjunta sin volver a mirar después del JPG");
  assert.match(usar, /, r\.cara, r\.proveedor\);\s*if \(!adjunta\) throw INTERRUMPIDA;/, "la ficha no recibe el proveedor de la lámina, o el visor no se entera de que la rechazó");
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
  const { build } = await import("esbuild");
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

  prueba("una cara por participación no se vende desde Vender: tocarla no suma nada ni vacía el contrato (ejecutado)", () => {
    assert.equal(P.porParticipacion(gon), true, "la góndola de prueba no se vende por participación: la prueba no prueba nada");
    const vacia = [];
    assert.equal(P.alTocarEnVender(vacia, gon, "A", () => true), vacia, "tocarla cambió el contrato");
    const armado = [{ id: "g2", face: "B" }];
    assert.equal(P.alTocarEnVender(armado, gon, "B", () => true), armado, "tocarla vació (o cambió) lo que ya se había armado");
    // Y la entera de al lado sigue sumándose como siempre.
    assert.deepEqual(P.alTocarEnVender([], entera, "B", () => true), [{ id: "g2", face: "B" }]);
    // No ofrece la cara entera ni las participaciones como interruptores del renglón.
    assert.deepEqual(P.interruptoresDeLaCara(gon, "A"), []);
    assert.deepEqual(P.partesDe(gon), []);
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
    for (const t of [P.textoDeParticipacion({ dispo: "parcial", quedaPb: 3333 }, true), P.textoAlTocarEnVender({ dispo: "parcial", quedaPb: 3333 }, true)]) {
      assert.match(t, /^Por participación · queda 33,33 %(\. Se carga en el Editor 3D → Distribución\.)?$/);
    }
    assert.doesNotMatch(P.textoDeParticipacion({ dispo: "parcial", quedaPb: 3333 }, false), /%|\d/);
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
    assert.match(sinComentarios(leer("src/utils/partes.ts")), /if \(porParticipacion\(f\)\) return lista;\s*if \(!seVendeAlgo\(f\)\) return \[\];/,
      "tocar en Vender una cara por participación hace otra cosa que dejar el contrato como estaba");
  });

  prueba("ni una pastilla de la tarifa ni «Negociar» meten una cara por participación al contrato", () => {
    const alternar = DEF_INT.get("alternarCara")?.texto ?? "";
    assert.match(alternar, /if \(f && porParticipacion\(f\)\) return lista;/, "alternarCara suma una cara por participación");
    assert.match(vista, /if \(!d\.porParticipacion\) alternarCara\(d\.fixture\.id, d\.face\);/, "la pastilla de una cara por participación la suma al contrato");
    // Y se VE que no se suma (verificación del paso 7: aria-disabled sin nada
    // a la vista, con el puntero de siempre, invitaba a tocarla), con un rótulo
    // aunque la cara no tenga nada comprometido (antes lo decía sólo el title).
    assert.match(vista, /aria-disabled=\{d\.porParticipacion \? true : undefined\}/, "la pastilla de una cara por participación no dice que está deshabilitada");
    assert.match(vista, /style=\{d\.porParticipacion \? \{ cursor: "not-allowed", borderStyle: "dashed" \} : undefined\}/,
      "la pastilla de una cara por participación se ve igual a las que se suman");
    assert.match(vista, /\{!entra && d\.porParticipacion && <span className="chip__f">por participación<\/span>\}/,
      "la pastilla de una cara por participación libre no dice por qué no entra");
    const negociar = DEF_INT.get("negociar")?.texto ?? "";
    assert.match(negociar, /if \(porParticipacion\(f\)\) return;/, "«Negociar este espacio» vende entera una cara por participación");
  });

  prueba("renovar una participación manda a Distribución con su formulario, no al contrato de Vender", () => {
    const renovar = DEF_INT.get("renovar")?.texto ?? "";
    assert.match(renovar, /if \(entry\.parte && esParticipacion\(entry\.parte\)\) \{\s*void renovarParticipacion\(entry\);\s*return;\s*\}/,
      "renovar una participación arma un contrato de Vender");
    const rp = DEF_INT.get("renovarParticipacion")?.texto ?? "";
    assert.match(rp, /abrirEnDistribucion\(f\.id, entry\.face, termino\)/, "renovar una participación no abre Distribución");
    const comp = sinComentarios(leer("src/components/Distribucion/ParticipacionesDeLaCara.tsx"));
    assert.match(comp, /pedir\(fixtureId, cara, \{ distribucion: renovar \? \{ renovar \} : \{\} \}\)/,
      "«Abrir en Distribución» no pide entrar a Distribución (`pedirEnfoque3D` con `distribucion`)");
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
            if (b.includes("Guardar contrato y avisar")) pesosVender.push(gzipSync(b).length);
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
        campos: [...panel.querySelectorAll("input.entrada, textarea.entrada")].map((i) => i.value),
        planometria: [...panel.querySelectorAll("div.entrada span")].map((s) => s.textContent).join("|"),
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
    for (const c of [...CARAS].reverse()) await tocar(pv, c);
    const campos = pv.locator(".vender input.entrada");
    await campos.nth(0).fill(PROVEEDOR);
    await campos.nth(1).fill("Finesse");
    const valores = pv.locator(".eitem .m input");
    for (let i = 0; i < await valores.count(); i++) await valores.nth(i).fill(String(1_200_000 + i * 100_000));
    await pv.mouse.move(5, 5);
    await pv.waitForTimeout(900);
    const hoja = await pv.evaluate(`(() => {
      const panel = ${PANEL};
      const r = panel.getBoundingClientRect();
      const acc = panel.querySelector(".acciones").getBoundingClientRect();
      const cab = panel.querySelector("header").getBoundingClientRect();
      const v = panel.querySelectorAll("[data-ver-3d]");
      const vb = v[0]?.getBoundingClientRect();
      return {
        filas: [...panel.querySelectorAll(".eitem")].map((e) => {
          const b = e.getBoundingClientRect(), cod = e.querySelector(".cod");
          return { cod: cod.firstChild?.textContent?.trim(), alto: b.height, entero: cod.scrollWidth <= cod.clientWidth,
            desborda: e.scrollWidth > e.clientWidth + 0.5, aviso: !!e.querySelector(".aviso") };
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
        if (!f.aviso && f.alto > 46.5) malas.push(`${f.cod}: la fila mide ${f.alto.toFixed(1)} px (dos renglones son 46)`);
        if (!f.entero) malas.push(`${f.cod}: el código se corta`);
        if (f.desborda) malas.push(`${f.cod}: la fila desborda su tarjeta`);
      }
      if (hoja.botones !== 1) malas.push(`hay ${hoja.botones} «Ver en 3D» (tiene que haber uno, en la cabecera)`);
      if (!hoja.boton) malas.push("«Ver en 3D» no está entero adentro de la cabecera del contrato");
      if (hoja.aire < 12) malas.push(`la ficha cierra con ${hoja.aire.toFixed(1)} px de aire (piso: 12)`);
      if (hoja.rueda) malas.push("la página rueda");
      assert.deepEqual(malas, [], `\n         ${malas.join("\n         ")}`);
    });

    // Lo opcional, que también tiene que sobrevivir al 3D.
    await pv.locator("button", { hasText: "Correo, nota y planometría" }).click();
    await pv.locator('.vender input[inputmode="email"]').fill("compras@proveedor.example");
    await pv.locator(".vender textarea.entrada").fill("Probar la punta con el yogur");
    await pv.locator('.vender input[type="file"]').setInputFiles({
      name: "planometria-de-prueba.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    await pv.waitForTimeout(400);
    const antes = await contrato(pv);

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
        if (/^\/api\/suppliers/.test(ruta)) malos.push(`pidió ${ruta}: la lista de proveedores`);
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
      boton: /Guardar contrato y avisar/.test(document.body.textContent || ""),
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
      await pv.locator(".vender input.entrada").nth(0).fill(OTRO);
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
      await pv.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
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
    await pv.locator(".vender input.entrada").nth(0).fill("");
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
    await pv.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
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

    // ── La lámina: se baja y se adjunta como planometría DEL CONTRATO ────
    await seccion("navegador · visor: la lámina se baja y se adjunta como planometría de la ficha, sin escribir nada", async () => {
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
      await pv.locator("[data-lamina-planometria]").click();
      const adjunta = await pv.waitForSelector("[data-lamina-adjunta]", { timeout: 180000 }).then(() => true).catch(() => false);
      const textoL = await textoDelVisor(pv);
      const escritos = pedidos.slice(desdeLamina).filter((x) => x.m !== "GET").map((x) => `${x.m} ${x.u.replace(ORIGEN, "")}`);
      const almacenL1 = await almacen(pv);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      const despuesL = await contrato(pv);
      prueba("navegador · visor: la lámina se baja y se adjunta como planometría de la ficha, sin escribir nada", () => {
        assert.match(nombre, /\.png$/, `la lámina bajó como ${nombre}`);
        assert.ok(nombre.toLowerCase().includes(PROVEEDOR.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()), `la lámina no es la de ${PROVEEDOR}: ${nombre}`);
        assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", "la lámina no es un PNG");
        assert.ok(bytes.length > 20_000, `la lámina pesa ${bytes.length} B: no trae las tomas`);
        assert.ok(adjunta, "«Usarla como planometría» no confirmó");
        assert.deepEqual(escritos, [], "armar la lámina escribió en el servidor");
        assert.equal(almacenL1.camara, almacenL0.camara, "la lámina movió la cámara guardada del Editor 3D");
        assert.equal(almacenL1.planos, almacenL0.planos, "la lámina tocó el plano guardado");
        const salen = AJENOS.filter((n) => new RegExp(n, "i").test(textoL));
        assert.deepEqual(salen, [], `con la lámina se lee: ${salen.join(", ")}`);
        assert.match(despuesL.planometria, /\.jpg/, `la planometría de la ficha no es la lámina: «${despuesL.planometria}»`);
        assert.deepEqual(despuesL.filas, antesL.filas, "adjuntar la lámina cambió las filas del contrato");
      });
    });

    // ── La lámina adjunta se va con su proveedor ─────────────────────────
    // La crítica: con Alpina se adjuntaba la lámina y se escribía «Postobón»;
    // el contrato de Postobón salía con la lámina de Alpina y su nombre a la
    // vista en la ficha.
    await seccion("navegador · visor: cambiar de proveedor saca su lámina de la planometría, sin nombrarlo", async () => {
      const conLamina = await contrato(pv);
      await pv.locator(".vender input.entrada").nth(0).fill(OTRO);
      await pv.waitForTimeout(700);
      const conOtro = await contrato(pv);
      const ficha = await pv.evaluate(`(() => {
        const panel = ${PANEL};
        const t = [panel.innerText];
        for (const n of panel.querySelectorAll("[title],[aria-label]")) t.push(n.getAttribute("title"), n.getAttribute("aria-label"));
        const q = panel.querySelector("[data-lamina-quitada]");
        return { texto: t.filter(Boolean).join("\\n"), quitada: !!q, quitadaTexto: q?.textContent ?? "" };
      })()`);
      await pv.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
      await pv.waitForTimeout(500);
      const deVuelta = await contrato(pv);
      prueba("navegador · visor: cambiar de proveedor saca su lámina de la planometría, sin nombrarlo", () => {
        const plano = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        assert.ok(plano(conLamina.planometria).includes(plano(PROVEEDOR)), `antes de cambiar, la planometría no es la lámina de ${PROVEEDOR}: «${conLamina.planometria}»`);
        assert.equal(conOtro.planometria, "", `con ${OTRO} el contrato sigue con la planometría «${conOtro.planometria}»`);
        assert.ok(!new RegExp(PROVEEDOR, "i").test(ficha.texto), `con ${OTRO}, la ficha nombra a ${PROVEEDOR}`);
        assert.ok(ficha.quitada, "la ficha no dice que se quitó la lámina del 3D");
        // Y sin decir por qué: «era de otro proveedor» le contaba al que mira
        // que ese espacio se le estuvo ofreciendo a otro.
        assert.ok(!/proveedor|\botr[oa]s?\b/i.test(ficha.quitadaTexto), `el aviso de la lámina quitada sugiere otra negociación: «${ficha.quitadaTexto}»`);
        assert.equal(deVuelta.planometria, "", "volver al proveedor anterior trajo de vuelta su lámina");
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
      await pv.locator(".vender input.entrada").nth(0).fill(sinTilde);
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
      await pv.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
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
    const proveedorDeLaFicha = (pg, nombre) => pg.locator(".vender input.entrada").nth(0).fill(nombre);

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

    /** La ficha sin el aviso de «se quitó la lámina» que dejó una prueba de
     *  arriba (queda hasta que se adjunta otra planometría): se adjunta un
     *  archivo y se quita a mano, que es lo que lo apaga. */
    const sinAvisoDeLamina = async (pg) => {
      const desplegable = pg.locator("button", { hasText: "Correo, nota y planometría" });
      if ((await desplegable.getAttribute("aria-expanded")) !== "true") await desplegable.click();
      if (!(await pg.locator("[data-lamina-quitada]").count())) return;
      await pg.locator('.vender input[type="file"]').setInputFiles({
        name: "otra.png", mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
      });
      await pg.waitForTimeout(300);
      await pg.locator('[aria-label="Quitar la planometría"]').click();
      await pg.waitForTimeout(300);
    };
    /** El visor en PUN-03 con un producto puesto y «Para llevarse» a la vista. */
    const conLamina = async (pg) => {
      await abrirVisor(pg);
      await conCajon(pg);
      await pg.waitForSelector(".visor-producto", { timeout: 60000 });
      if (!(await pg.locator('.visor-producto[aria-pressed="true"]').count())) await pg.locator(".visor-producto").first().click();
      await pg.waitForSelector("[data-lamina-planometria]", { timeout: 60000 });
      await pg.waitForTimeout(4000);
    };
    /** Cambia el proveedor de la ficha desde afuera de la pantalla: la ficha
     *  está `inert` detrás del visor y el cajón apaga «cambiar» mientras se
     *  arma la lámina, así que ningún gesto llega. Es lo que haría una puerta
     *  nueva que alguien abra mañana; las dos defensas tienen que aguantarla. */
    const proveedorPorDetras = (pg, nombre) => pg.evaluate(`(() => {
      const panel = ${PANEL};
      const inp = panel.querySelector("input.entrada");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inp, ${JSON.stringify(nombre)});
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return inp.value;
    })()`);

    await seccion("navegador · visor: mientras se arma la lámina el visor queda quieto, y si cambia el proveedor no se adjunta", async () => {
      await sinAvisoDeLamina(pv);
      const antesQ = await contrato(pv);
      await conLamina(pv);
      await pv.locator("[data-lamina-planometria]").click();
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
      const visor = { adjunta: await pv.locator("[data-lamina-adjunta]").count(), texto: await textoDelVisor(pv) };
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      const despuesQ = await contrato(pv);
      const fichaQ = await pv.evaluate(`(() => { const p = ${PANEL}; return { texto: p.innerText, quitada: !!p.querySelector("[data-lamina-quitada]") }; })()`);
      await proveedorDeLaFicha(pv, PROVEEDOR);
      await pv.waitForTimeout(500);
      prueba("navegador · visor: mientras se arma la lámina el visor queda quieto, y si cambia el proveedor no se adjunta", () => {
        const sueltos = [];
        if (!quieto.pestanas.length || quieto.pestanas.some((d) => !d)) sueltos.push(`la chapa deja saltar de cara (${quieto.pestanas.join(",")})`);
        if (!quieto.hud.length || quieto.hud.some((d) => !d)) sueltos.push(`el HUD sigue activo (${quieto.hud.join(",")})`);
        if (quieto.ocultar !== true) sueltos.push("«Ocultar» sigue activo");
        if (quieto.cajon !== true || quieto.cambiar !== true) sueltos.push("el proveedor del cajón se puede cambiar");
        if (quieto.productos.some((d) => !d)) sueltos.push("se puede elegir otro producto");
        assert.deepEqual(sueltos, [], `mientras se arma la lámina:\n         ${sueltos.join("\n         ")}`);
        assert.ok(mismo(escrito, OTRO), "no se pudo cambiar el proveedor de la ficha: la prueba no mide nada");
        assert.equal(antesQ.planometria, "", `la ficha ya tenía planometría («${antesQ.planometria}»): la prueba no mide nada`);
        assert.equal(visor.adjunta, 0, "con el proveedor cambiado en el medio, el visor dice que la lámina quedó adjunta");
        assert.equal(despuesQ.planometria, "", `el contrato de ${OTRO} quedó con la planometría «${despuesQ.planometria}»`);
        assert.ok(!new RegExp(PROVEEDOR, "i").test(fichaQ.texto), `la ficha de ${OTRO} nombra a ${PROVEEDOR}`);
        assert.ok(!fichaQ.quitada, "la ficha avisa que se quitó una lámina que nunca entró");
      });
    });

    await seccion("navegador · visor: cerrar a mitad de la lámina no adjunta nada después", async () => {
      await sinAvisoDeLamina(pv);
      const antesC = await contrato(pv);
      await conLamina(pv);
      await pv.locator("[data-lamina-planometria]").click();
      await pv.waitForSelector("[data-armando]", { timeout: 30000 });
      await pv.waitForTimeout(1000);
      await pv.locator(".visor-volver").click();
      // Sin el arreglo, la lámina aparecía sola en la ficha unos 25 s después.
      let despuesC = await contrato(pv);
      for (let i = 0; i < 35 && !despuesC.planometria; i++) { await pv.waitForTimeout(1000); despuesC = await contrato(pv); }
      const quitada = await pv.locator("[data-lamina-quitada]").count();
      prueba("navegador · visor: cerrar a mitad de la lámina no adjunta nada después", () => {
        assert.equal(antesC.planometria, "", `la ficha ya tenía planometría («${antesC.planometria}»): la prueba no mide nada`);
        assert.equal(despuesC.planometria, "", `después de cerrar, la ficha recibió la planometría «${despuesC.planometria}» sin que nadie la pidiera`);
        assert.equal(quitada, 0, "la ficha avisa que se quitó una lámina");
        assert.deepEqual(erroresDePagina, [], `errores de la página: ${erroresDePagina.join(" · ")}`);
      });
    });

    await seccion("navegador · visor: «Empezar de nuevo» con la lámina adjunta la saca sin avisar nada", async () => {
      await conLamina(pv);
      await pv.locator("[data-lamina-planometria]").click();
      const adjunta = await pv.waitForSelector("[data-lamina-adjunta]", { timeout: 180000 }).then(() => true).catch(() => false);
      await pv.locator(".visor-volver").click();
      await pv.waitForTimeout(800);
      const conL = await contrato(pv);
      await pv.locator(".vender button", { hasText: "Empezar de nuevo" }).click();
      await pv.waitForTimeout(600);
      await tocar(pv, CARAS[0]);
      await pv.waitForTimeout(600);
      const deNuevo = await contrato(pv);
      const quitada = await pv.locator("[data-lamina-quitada]").count();
      prueba("navegador · visor: «Empezar de nuevo» con la lámina adjunta la saca sin avisar nada", () => {
        assert.ok(adjunta && /\.jpg/.test(conL.planometria), `la lámina no quedó adjunta antes de empezar de nuevo («${conL.planometria}»): la prueba no mide nada`);
        assert.equal(deNuevo.planometria, "", `después de «Empezar de nuevo» la ficha sigue con «${deNuevo.planometria}»`);
        assert.equal(quitada, 0, "«Empezar de nuevo» deja el aviso de la lámina quitada");
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
      await pf.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
      await pf.locator(".eitem .m input").first().fill("1500000");
      await pf.waitForTimeout(400);
      const antesFalla = await contrato(pf);
      await pf.locator("[data-ver-3d]").click();
      const aviso3D = await pf.waitForSelector("text=No se pudo abrir el 3D", { timeout: 30000 }).then(() => true).catch(() => false);
      const sigue = await pf.evaluate(() => /Guardar contrato y avisar/.test(document.body.textContent || ""));
      await pf.locator(".visor-volver").click().catch(() => {});
      await pf.waitForTimeout(500);
      const despuesFalla = await contrato(pf);
      prueba("navegador · visor: si el archivo del 3D no baja, se avisa y el contrato queda intacto", () => {
        assert.ok(aviso3D, "no apareció «No se pudo abrir el 3D»");
        assert.ok(sigue, "Vender se desmontó: no está «Guardar contrato y avisar»");
        assert.deepEqual(despuesFalla, antesFalla, "el contrato cambió después de la falla");
        assert.deepEqual(caidas, [], `la página se cayó: ${caidas.join(" · ")}`);
      });
      await cf.close();
    });

    // ── El contraste del botón «3D» y del visor, en oscuro ───────────────
    await seccion("navegador · visor: contraste de «Ver en 3D» y del visor (oscuro)", async () => {
      const { ctx: co, p: po } = await abrir("dark");
      await tocar(po, CARAS[0]);
      await po.locator(".vender input.entrada").nth(0).fill(PROVEEDOR);
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
