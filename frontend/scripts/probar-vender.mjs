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
]);
/** `<X` sólo cuenta como etiqueta JSX si lo que hay delante NO es parte de un
 *  identificador: `Record<DisplayStatus>` y `Partial<FaceData>` son genéricos
 *  de TypeScript, no componentes. */
const etiquetasJsx = (texto) => new Set([...texto.matchAll(/(?:^|[^\w>])<\s*([A-Z][\w$]*)(?=[\s/>])/gm)].map((m) => m[1]));
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
  assert.match(visorCodigo, /const muebles = useMemo\(\(\) => sinDatosComerciales\(storeToFixtures\(/,
    "los muebles del visor no salen de `sinDatosComerciales(storeToFixtures(…))`");
  assert.match(visorCodigo, /<Lienzo\b[^>]*\smuebles=\{muebles\}/, "el lienzo no recibe los muebles saneados");
  // `privadoPara` siempre definido: `undefined` es la pantalla de la dueña y
  // deja pasar las pruebas de todos (`privacidad.ts`).
  assert.match(visorCodigo, /const privadoPara: number \| null = /, "`privadoPara` puede quedar `undefined`");
  assert.match(visorCodigo, /privadoPara: number \| null;/, "el lienzo acepta un `privadoPara` indefinido");
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
  const nav = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

  /** Abre Vender con sesión de administrador ya puesta en localStorage. */
  async function abrir(colorScheme) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, reducedMotion: "reduce" });
    const p = await ctx.newPage();
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
  await ctx.close();
  await nav.close();
}

console.log(`\n${hechas} pruebas de Vender`);
