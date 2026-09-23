/**
 * Pruebas del tema compartido (Fase 10 · PR 1 — «la piel de la landing adentro»).
 *   npm run probar:tema
 *
 * Esto es el red team del PR de piel. No mira si algo «se ve lindo»: mira las
 * seis cosas que, si se rompen, rompen el producto en silencio y meses después.
 *
 *  1. **Cero red.** Ni `fonts.googleapis` ni ningún origen externo nuevo en
 *     `index.html` ni en `src/`. La CSP de Fase 3 no se toca, y el `<link>` a
 *     Google Fonts se va con Chivo y Archivo Narrow.
 *  2. **Ningún token con una sola cara.** `tema.css` publica los nombres viejos
 *     (los que piden treinta archivos) y los nuevos (los de E) en `:root`, y
 *     todo lo que es color semántico tiene también su valor en
 *     `html[data-tema="oscuro"]`. Un token de color definido en un solo modo es
 *     exactamente el bug de «blanco sobre blanco en oscuro», escrito de otra
 *     manera. Además, todo `var(--x)` que se lea desde `src/` tiene que estar
 *     definido en alguna parte: re-tokenizar treinta archivos a mano deja
 *     nombres fantasma.
 *  3. **No quedan colores literales de Tailwind fuera de la landing.** Son los
 *     ~155 usos de `bg-white`, `text-slate-*`, `border-slate-*`, `bg-indigo-*`,
 *     `text-indigo-*`, `text-amber-*`, `bg-gray-*` que en modo oscuro se quedan
 *     blancos. Se reporta el conteo y se falla si no es cero.
 *  4. **Un solo amarillo por pantalla.** La regla del dueño es «amarillo SOLO
 *     en el botón principal de cada pantalla»: la clase del botón aparece a lo
 *     sumo una vez por archivo de pantalla, y `--signal` / `--on-signal` no se
 *     usan fuera de esa clase (ni desde JSX, ni desde otro CSS). Si el amarillo
 *     se derrama, deja de significar «acá está el trabajo».
 *  5. **La landing no se mueve.** `landing.css` sigue colgando entero de `.lp`.
 *     Es el mismo guardarraíl que `probar-landing.mjs`, repetido acá a
 *     propósito: este PR es el que tiene la tentación de romperlo.
 *  6. **Una sola verdad para los hex compartidos.** `tailwind.config.js` y
 *     `tema.css` se parsean y se comparan. Y el corolario que es la trampa real
 *     del PR: un color que cambia entre claro y oscuro NO puede estar en el
 *     config como hex literal, porque `bg-surface` emitiría `#FFFFFF` fijo y no
 *     se enteraría del modo oscuro nunca. Tiene que entrar por la variable
 *     (`var(--x)` o `rgb(var(--x-rgb) / <alpha-value>)`, que es la forma de
 *     Tailwind 3.4 que conserva `bg-accent/20`).
 *
 * Y, de yapa, la cuenta que ningún grep hace: el **contraste WCAG** de los
 * pares texto/fondo principales en los dos modos, calculado acá con la fórmula
 * (luminancia relativa sRGB, alfa compuesto sobre su fondo). Texto normal
 * ≥ 4,5:1; lo que no es texto —rellenos de estado, bordes, foco— ≥ 3:1.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const hay = (p) => existsSync(join(raiz, p));

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/* ── recorrido de archivos ──────────────────────────────────────────────── */
const LANDING = join("src", "pages", "Landing");
function archivos(dir, ext) {
  const abs = join(raiz, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  (function caminar(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) caminar(p);
      else if (ext.some((e) => n.endsWith(e))) out.push(relative(raiz, p));
    }
  })(abs);
  return out.sort();
}
const esLanding = (p) => p.startsWith(LANDING);
/* Los comentarios explican el PR: nombran a Chivo, a Google Fonts y a
   `var(--otro-token)` a propósito. Se quitan antes de buscar, para no fallar
   por la documentación que este mismo PR pide escribir. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  // `//` de línea, cuidando de no comerse el `//` de una URL
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
const FUENTES = archivos("src", [".ts", ".tsx", ".css"]);
const FUERA_LANDING = FUENTES.filter((p) => !esLanding(p));
const CSS_APP = FUERA_LANDING.filter((p) => p.endsWith(".css"));

/* ── CSS: bloques, propiedades, colores ─────────────────────────────────── */
function bloques(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let i = 0;
  while (i < limpio.length) {
    const abre = limpio.indexOf("{", i);
    if (abre < 0) break;
    const sel = limpio.slice(i, abre).split("}").pop().trim();
    let prof = 1, j = abre + 1;
    while (j < limpio.length && prof > 0) {
      if (limpio[j] === "{") prof++;
      else if (limpio[j] === "}") prof--;
      j++;
    }
    out.push({ sel, cuerpo: limpio.slice(abre + 1, j - 1) });
    // dentro de una at-rule hay más bloques: se baja
    i = /^@(media|supports|layer|scope|container)/.test(sel) ? abre + 1 : j;
  }
  return out;
}
function props(cuerpo) {
  const m = {};
  const re = /(--[\w-]+)\s*:\s*([^;}]+)(?:;|$)/g;
  let x;
  while ((x = re.exec(cuerpo))) m[x[1]] = x[2].trim();
  return m;
}
const selectores = (sel) => sel.split(",").map((s) => s.trim()).filter(Boolean);
const esRaiz = (sel) => selectores(sel).some((s) => s === ":root" || s === "html" || s === ":root,html");
const esOscuro = (sel) =>
  selectores(sel).some((s) => /\[data-tema\s*=\s*["']?oscuro["']?\]/.test(s));

function resolver(mapa, valor, prof = 0) {
  if (valor == null || prof > 12) return valor;
  const m = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/.exec(valor);
  if (!m) return valor.trim();
  const reemplazo = mapa[m[1]] !== undefined ? mapa[m[1]] : (m[2] ?? "");
  return resolver(mapa, valor.slice(0, m.index) + reemplazo + valor.slice(m.index + m[0].length), prof + 1);
}
function aRgba(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,/]+([0-9.%]+))?\s*\)$/i.exec(s);
  if (m) {
    const a = m[4] == null ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}
const hex = (c) => c && "#" + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
const sobre = (fg, bg) => (fg.a >= 1 ? fg : {
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
function luminancia({ r, g, b }) {
  const c = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
function contraste(fg, bg) {
  const f = luminancia(sobre(fg, bg)), b = luminancia(bg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}

/* ── el tema, leído ─────────────────────────────────────────────────────── */
const TEMA = "src/tema.css";
const temaCss = hay(TEMA) ? leer(TEMA) : null;
const claro = {}, oscuro = {}, definidos = {};
if (temaCss) {
  for (const b of bloques(temaCss)) {
    if (esRaiz(b.sel)) Object.assign(claro, props(b.cuerpo));
    else if (esOscuro(b.sel)) Object.assign(oscuro, props(b.cuerpo));
  }
}
// todo lo que la app define en CSS propio (tema.css + index.css + los que haya)
for (const p of CSS_APP) {
  for (const b of bloques(leer(p))) Object.assign(definidos, props(b.cuerpo));
}
const modo = { claro: { ...claro }, oscuro: { ...claro, ...oscuro } };
const color = (m, nombre) => aRgba(resolver(modo[m], `var(${nombre})`));

/* Los nombres que la aplicación ya usa hoy: si uno se cae, se caen los treinta
   archivos que lo piden. Sale de `src/index.css` antes del PR. */
const VIEJOS = [
  "--font-sans", "--font-mono",
  "--bg", "--surface", "--surface-2", "--surface-3",
  "--line", "--line-soft", "--line-strong",
  "--ink-1", "--ink-2", "--ink-3", "--ink-4", "--ink-vacio",
  "--accent", "--accent-50", "--accent-100", "--accent-200", "--accent-600", "--accent-700", "--accent-ink",
  "--libre", "--libre-suave", "--libre-borde",
  "--entra", "--entra-txt", "--entra-suave", "--entra-borde",
  "--ocupado", "--ocupado-suave", "--ocupado-borde",
  "--resto",
  "--success", "--success-50", "--success-100",
  "--warning", "--warning-50", "--warning-100",
  "--danger", "--danger-50", "--danger-100",
  "--muted-status",
  "--r-xs", "--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-2xl",
  "--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg",
];
/* Los nombres de E que el PR promete publicar (outputs/tema.md §1). */
const NUEVOS = [
  "--fg", "--fg-2", "--fg-3",
  "--panel", "--panel-solid", "--panel-2",
  "--brd", "--brd-strong",
  "--signal", "--signal-ink", "--on-signal", "--ring",
  "--st-libre", "--st-libera", "--st-tomado", "--st-resto",
  "--f-display", "--f-text", "--f-mono",
  "--sh-1", "--sh-2", "--sh-3", "--blur",
];
/* Primitivos y escalas: no dependen del modo, viven una sola vez en `:root`. */
const SIN_MODO = /^--dark-|^--(n|p|y)-\d|^--st-(libre|libera|tomado|resto)-[ld]$|^--(t|s|r)-|^--s\d|^--dur-|^--ease|^--hair|^--f-|^--font-|^--peso-|^--wrap|^--colw|^--railh/;

console.log("\ntema · cero red");

prueba("index.html no baja fuentes ni ningún otro origen externo", () => {
  const html = sinComentarios(leer("index.html"));
  assert.ok(!/fonts\.googleapis/.test(html), "index.html todavía trae el <link> de Google Fonts");
  assert.ok(!/fonts\.gstatic/.test(html), "index.html todavía preconecta a fonts.gstatic");
  const externos = [...html.matchAll(/<link[^>]*href=["'](https?:\/\/[^"']+)/gi)].map((m) => m[1]);
  assert.deepEqual(externos, [], `index.html enlaza recursos externos: ${externos.join(", ")}`);
  const scripts = [...html.matchAll(/<script[^>]*src=["'](https?:\/\/[^"']+)/gi)].map((m) => m[1]);
  assert.deepEqual(scripts, [], `index.html carga scripts externos: ${scripts.join(", ")}`);
});

prueba("src/ no estrena orígenes externos: sin @import, sin url(http…), sin @font-face", () => {
  const sucios = [];
  for (const p of FUENTES) {
    const t = sinComentarios(leer(p));
    if (/fonts\.googleapis|fonts\.gstatic/.test(t)) sucios.push(`${p}: nombra Google Fonts`);
    if (p.endsWith(".css")) {
      const css = t;
      if (/@import\s+(url\()?["']?https?:/.test(css)) sucios.push(`${p}: @import remoto`);
      if (/url\(\s*["']?https?:/.test(css)) sucios.push(`${p}: url(http…)`);
      if (/@font-face/.test(css)) sucios.push(`${p}: @font-face (fuente empaquetada sin revisar la CSP)`);
    }
  }
  assert.deepEqual(sucios, [], "\n         " + sucios.join("\n         "));
});

prueba("las familias son pilas del sistema: no queda Chivo ni Archivo Narrow", () => {
  const restos = [];
  for (const p of [...FUERA_LANDING, "tailwind.config.js", "index.html"]) {
    if (!hay(p)) continue;
    // ojo: «archivo» contiene «chivo». El límite de palabra no alcanza —
    // `\bChivo\b` casa dentro de «archivo» igual, porque la frontera está
    // entre «ar» y «Chivo». Por eso se exige que no venga pegada a una letra.
    const t = sinComentarios(leer(p));
    if (/(^|[^a-zA-Z])Chivo\b/.test(t) || /Archivo Narrow/.test(t)) restos.push(p);
  }
  assert.deepEqual(restos, [], `todavía piden una fuente web: ${restos.join(", ")}`);
});

console.log("\ntema · ningún token con una sola cara");

prueba("existe src/tema.css y la aplicación lo carga", () => {
  assert.ok(temaCss, "falta frontend/src/tema.css");
  const cargado = /@import\s+["'][^"']*tema\.css/.test(leer("src/index.css"))
    || /["'][^"']*tema\.css["']/.test(leer("src/main.tsx"));
  assert.ok(cargado, "tema.css existe pero nadie lo importa (ni index.css ni main.tsx)");
});

prueba("tema.css publica los nombres VIEJOS: los treinta archivos siguen compilando", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const faltan = VIEJOS.filter((n) => claro[n] === undefined);
  assert.deepEqual(faltan, [], `nombres que la app usa hoy y el tema no define: ${faltan.join(" ")}`);
});

prueba("tema.css publica los nombres NUEVOS de E", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const faltan = NUEVOS.filter((n) => claro[n] === undefined);
  assert.deepEqual(faltan, [], `nombres de E prometidos en outputs/tema.md y sin definir: ${faltan.join(" ")}`);
});

prueba("hay un bloque html[data-tema=\"oscuro\"] y ningún token vive sólo ahí", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const tieneBloque = bloques(temaCss).some((b) => esOscuro(b.sel));
  assert.ok(tieneBloque, "tema.css no define el modo oscuro");
  const soloOscuro = Object.keys(oscuro).filter((n) => claro[n] === undefined);
  assert.deepEqual(soloOscuro, [],
    `definidos SÓLO en oscuro (en claro, que es el modo por defecto, no existen): ${soloOscuro.join(" ")}`);
});

prueba("ningún color semántico se queda sin su valor de oscuro", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const huerfanos = Object.keys(claro).filter((n) => {
    if (SIN_MODO.test(n)) return false;              // primitivo o escala: no depende del modo
    if (oscuro[n] !== undefined) return false;
    const c = aRgba(resolver(modo.claro, claro[n]));
    if (!c) return false;                            // no es un color (sombra, número, string)
    // si resuelve al mismo valor en los dos modos porque su origen ya cambió, está bien
    const d = aRgba(resolver(modo.oscuro, claro[n]));
    return !d || hex(c) === hex(d);
  });
  assert.deepEqual(huerfanos, [],
    `colores con un solo valor: en oscuro quedan igual que en claro (blanco sobre blanco): ${huerfanos.join(" ")}`);
});

prueba("cada triplete --x-rgb sigue a su token --x en el modo oscuro", () => {
  // `tailwind.config.js` lee los colores como `rgb(var(--x-rgb) / <alpha-value>)`
  // — que es lo que hace que `bg-accent/20` siga funcionando y que la clase se
  // entere del modo. Pero eso sólo funciona si el TRIPLETE cambia en oscuro.
  // Si el modo oscuro redefine `--x` con un hex y se olvida de `--x-rgb`,
  // queda un tema partido en dos: el CSS suelto se pone oscuro y todas las
  // clases de Tailwind se quedan claras. Es el bug de «blanco sobre blanco»
  // entrando por la puerta de atrás.
  if (!temaCss) throw new Error("sin tema.css");
  const rotos = [];
  for (const n of Object.keys(claro)) {
    if (!n.endsWith("-rgb")) continue;
    const gemelo = n.slice(0, -4);
    if (claro[gemelo] === undefined) continue;
    const c = color("claro", gemelo), o = color("oscuro", gemelo);
    if (!c || !o || hex(c) === hex(o)) continue;         // no cambia con el modo
    if (oscuro[n] !== undefined) continue;               // el triplete sí sigue
    const t = aRgba(`rgb(${resolver(modo.oscuro, `var(${n})`)})`);
    if (t && hex(t) === hex(o)) continue;                // sigue por herencia
    rotos.push(`${n}: en oscuro ${gemelo} es ${hex(o)} pero el triplete sigue en ${t ? hex(t) : "?"}`);
  }
  assert.deepEqual(rotos, [],
    `tokens partidos en dos (el CSS se pone oscuro, las clases de Tailwind no):\n         ${rotos.join("\n         ")}`);
});

prueba("todo var(--x) que se lee desde src/ está definido en alguna parte", () => {
  const fantasmas = new Map();
  for (const p of FUERA_LANDING) {
    for (const m of sinComentarios(leer(p)).matchAll(/var\(\s*(--[\w-]+)\s*(,|\))/g)) {
      const n = m[1];
      if (definidos[n] !== undefined) continue;
      if (m[2] === ",") continue;                    // tiene respaldo escrito
      if (!fantasmas.has(n)) fantasmas.set(n, p);
    }
  }
  const lista = [...fantasmas].map(([n, p]) => `${n} (${p})`);
  assert.deepEqual(lista, [], `tokens que nadie define: ${lista.join(", ")}`);
});

prueba("la consola de plataforma cambia con el mismo interruptor", () => {
  // El toggle escribe `data-tema` en <html> y borra la llave vieja. Si el CSS
  // de la consola sigue colgado de `data-consola-tema`, su tema oscuro queda
  // huérfano: nadie lo enciende nunca y la consola se queda clara adentro del
  // interior oscuro.
  const viejos = [], oscuros = [];
  for (const p of CSS_APP) {
    for (const b of bloques(leer(p))) {
      if (/data-consola-tema/.test(b.sel)) viejos.push(`${p}: «${b.sel.trim()}»`);
      if (esOscuro(b.sel) && /--con-/.test(b.cuerpo)) oscuros.push(p);
    }
  }
  assert.deepEqual(viejos, [],
    `siguen colgando de la llave vieja, que ya nadie escribe:\n         ${viejos.join("\n         ")}`);
  assert.ok(oscuros.length, "ningún bloque [data-tema=\"oscuro\"] define los --con-* de la consola");
});

console.log("\ntema · no quedan colores literales de Tailwind adentro");

const LITERALES = ["bg-white", "text-slate-", "border-slate-", "bg-indigo-", "text-indigo-", "text-amber-", "bg-gray-"];
prueba("cero usos de la lista fuera de pages/Landing/", () => {
  const porToken = {}, porArchivo = {};
  let total = 0;
  for (const p of FUERA_LANDING) {
    const t = leer(p);
    for (const lit of LITERALES) {
      const re = new RegExp("\\b" + lit.replace(/-$/, "-") + (lit.endsWith("-") ? "[a-z0-9]+" : "") + "\\b", "g");
      const n = (t.match(re) || []).length;
      if (!n) continue;
      porToken[lit] = (porToken[lit] || 0) + n;
      porArchivo[p] = (porArchivo[p] || 0) + n;
      total += n;
    }
  }
  const detalle = Object.entries(porToken).map(([k, v]) => `${k}${v}`).join(" · ");
  const peores = Object.entries(porArchivo).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => `${k} ${v}`).join("\n         ");
  console.log(`       conteo: ${total}` + (total ? ` — ${detalle}` : ""));
  assert.equal(total, 0, `quedan ${total} colores literales de Tailwind fuera de la landing:\n         ${peores}`);
});

prueba("las paletas indigo/teal/coral ya no están en tailwind.config.js", () => {
  const cfg = leer("tailwind.config.js");
  const vivas = ["indigo", "teal", "coral"].filter((n) => new RegExp("^\\s*" + n + "\\s*:", "m").test(cfg));
  assert.deepEqual(vivas, [], `siguen en el config y por eso se pueden seguir escribiendo: ${vivas.join(", ")}`);
});

console.log("\ntema · un solo amarillo por pantalla");

/* La clase del botón principal se descubre, no se adivina: es la que pinta el
   fondo con `--signal` en el CSS de la aplicación. */
const clasesSignal = new Set();
for (const p of CSS_APP) {
  for (const b of bloques(leer(p))) {
    if (esRaiz(b.sel) || esOscuro(b.sel)) continue;
    if (!/background(-color)?\s*:[^;]*var\(\s*--signal\s*[,)]/.test(b.cuerpo)) continue;
    for (const s of selectores(b.sel)) for (const c of s.match(/\.[\w-]+/g) || []) clasesSignal.add(c.slice(1));
  }
}
/* El tope por archivo. Un archivo lleva UN botón amarillo, más dos excepciones
   que no son laxitud sino la misma regla bien contada:

   · `MULTIPASO` — pantallas de varios pasos EXCLUYENTES, que muestran un botón
     por vez. Cada entrada es consciente y se revisa a mano.
   · cada capa de modal del archivo (`data-capa-modal`) suma uno: mientras un
     modal está abierto ÉL es la pantalla, y la regla
     `html[data-modal-abierto]` de `index.css` apaga el amarillo de atrás. O
     sea que el segundo amarillo del archivo no se ve nunca a la vez que el
     primero — pero sólo si el modal marca su raíz, y por eso se cuenta la
     marca y no el botón. */
const MULTIPASO = {
  // Una sola cadena de ternarios, así que se ve uno por vez (2026-09-23: se
  // sumaron «sin acceso» y «el enlace no lleva a ninguna parte»; «entrar con
  // clave» se había ido en la Fase 15):
  // entrar con correo · elegir supermercado · sin acceso · el enlace no lleva · fundar
  "src/pages/Login.tsx": 5,
};

prueba("existe una clase de botón principal y es la única que pinta con --signal", () => {
  assert.ok(clasesSignal.size > 0, "ninguna regla de CSS pinta un fondo con var(--signal): no hay botón principal");
  assert.ok(clasesSignal.size <= 2,
    `hay ${clasesSignal.size} clases distintas pintando con --signal (${[...clasesSignal].join(", ")}): el amarillo tiene que tener un solo dueño`);
  console.log(`       clase del botón principal: ${[...clasesSignal].map((c) => "." + c).join(" ")}`);
});

prueba("la clase aparece a lo sumo una vez por archivo de pantalla", () => {
  if (!clasesSignal.size) throw new Error("sin clase de botón principal");
  const excesos = [];
  for (const p of FUERA_LANDING.filter((f) => f.endsWith(".tsx"))) {
    const t = leer(p);
    let n = 0;
    for (const c of clasesSignal) n += (t.match(new RegExp("[\"'\\s`]" + c + "[\"'\\s`]", "g")) || []).length;
    const capas = (t.match(/data-capa-modal/g) || []).length;
    const techo = (MULTIPASO[p] ?? 1) + capas;
    if (n > techo) excesos.push(`${p}: ${n} usos, tope ${techo} (${MULTIPASO[p] ?? 1} de pantalla + ${capas} de modal)`);
  }
  assert.deepEqual(excesos, [], `hay más de un botón amarillo en la misma pantalla:\n         ${excesos.join("\n         ")}`);
});

prueba("--signal y --on-signal no se usan fuera de esa clase ni de la landing", () => {
  const fugas = [];
  for (const p of FUERA_LANDING) {
    if (p.endsWith(".css")) {
      for (const b of bloques(leer(p))) {
        if (esRaiz(b.sel) || esOscuro(b.sel)) continue;   // la capa de tokens puede aliasear
        if (!/var\(\s*--(signal|on-signal)\s*[,)]/.test(b.cuerpo)) continue;
        const propia = selectores(b.sel).every((s) => [...clasesSignal].some((c) => s.includes("." + c)));
        if (!propia) fugas.push(`${p}: «${b.sel.slice(0, 60)}»`);
      }
    } else if (/var\(\s*--(signal|on-signal)\s*[,)]/.test(leer(p))) {
      fugas.push(`${p}: el amarillo escrito a mano desde JSX/TS`);
    }
  }
  assert.deepEqual(fugas, [], `el amarillo se derrama fuera del botón principal:\n         ${fugas.join("\n         ")}`);
});

console.log("\ntema · la landing no se mueve");

prueba("landing.css sigue colgando entero de .lp", () => {
  const css = leer(join(LANDING, "landing.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const preludios = [];
  css.split("}").forEach((bloque) => {
    const partes = bloque.split("{");
    partes.slice(0, -1).forEach((x) => preludios.push(x.trim()));
  });
  preludios
    .filter((x) => x && !x.startsWith("@") && !/^(from|to|\d+%)/.test(x))
    .forEach((x) => {
      selectores(x).forEach((sel) => {
        assert.ok(sel.startsWith(".lp") || sel.startsWith("html.lp-activa"),
          `selector fuera de la landing: «${sel}»`);
      });
    });
});

prueba("el tema del interior no pisa el de la landing: `.lp` sigue mandando", () => {
  // La landing declara sus propios `--bg`, `--fg`, `--signal`… bajo `.lp`, así
  // que sombrea a los de `:root`. Lo que NO puede pasar es que `tema.css`
  // escriba una regla que gane por especificidad o por `!important`.
  if (!temaCss) throw new Error("sin tema.css");
  for (const b of bloques(temaCss)) {
    assert.ok(!/\.lp\b/.test(b.sel), `tema.css tiene un selector de la landing: «${b.sel}»`);
    assert.ok(!/!important/.test(b.cuerpo), `tema.css usa !important en «${b.sel}»: puede pisar a .lp`);
  }
});

console.log("\ntema · una sola verdad para los hex compartidos");

/* nombre de Tailwind → token del tema. Sólo lo compartido: `dark.*` y lo que
   Tailwind inventa por su cuenta no entra. */
const PUENTE = {
  "bg": "--bg", "surface": "--surface", "surface-2": "--surface-2", "surface-3": "--surface-3",
  "line": "--line", "line-soft": "--line-soft", "line-strong": "--line-strong",
  "ink-1": "--ink-1", "ink-2": "--ink-2", "ink-3": "--ink-3", "ink-4": "--ink-4",
  "accent.DEFAULT": "--accent", "accent.50": "--accent-50", "accent.100": "--accent-100",
  "accent.200": "--accent-200", "accent.600": "--accent-600", "accent.700": "--accent-700",
  "accent.ink": "--accent-ink",
  "libre.DEFAULT": "--libre", "libre.50": "--libre-suave", "libre.100": "--libre-borde",
  "entra.DEFAULT": "--entra", "entra.txt": "--entra-txt", "entra.50": "--entra-suave", "entra.100": "--entra-borde",
  "ocupado.DEFAULT": "--ocupado", "ocupado.50": "--ocupado-suave", "ocupado.100": "--ocupado-borde",
  "resto": "--resto",
  "success.DEFAULT": "--success", "success.50": "--success-50", "success.100": "--success-100",
  "warning.DEFAULT": "--warning", "warning.50": "--warning-50", "warning.100": "--warning-100",
  "danger.DEFAULT": "--danger", "danger.50": "--danger-50", "danger.100": "--danger-100",
  "muted-status": "--muted-status",
  // ojo con el nombre: `accent.ink` quiere decir «la tinta que va ENCIMA del
  // acento» (#FFFFFF), y `signal.ink` quiere decir «la señal ESCRITA»
  // (`--signal-ink`, el ámbar tostado). Mismo sufijo, dos significados —
  // anotado en outputs/auditor.md. Acá se mapea a lo que el config dice.
  "signal.DEFAULT": "--signal", "signal.ink": "--signal-ink",
};
const cfgMod = await import(pathToFileURL(join(raiz, "tailwind.config.js")).href);
const COLORES = cfgMod.default?.theme?.extend?.colors ?? {};
const planos = {};
for (const [k, v] of Object.entries(COLORES)) {
  if (typeof v === "string") planos[k] = v;
  else for (const [k2, v2] of Object.entries(v)) planos[`${k}.${k2}`] = v2;
}

prueba("darkMode del config apunta a [data-tema=\"oscuro\"]", () => {
  const dm = cfgMod.default?.darkMode;
  assert.ok(Array.isArray(dm) && dm[0] === "selector" && /\[data-tema=["']oscuro["']\]/.test(dm[1] ?? ""),
    `darkMode = ${JSON.stringify(dm)}; se esperaba ["selector", '[data-tema="oscuro"]']`);
});

prueba("tailwind.config.js y tema.css dicen lo mismo, token por token", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const malos = [];
  for (const [nombre, token] of Object.entries(PUENTE)) {
    const v = planos[nombre];
    if (v === undefined) {
      // Un token que el config no expone sólo es un problema si alguna clase lo
      // pide: `bg-resto` no tiene por qué existir si nadie lo escribe (el plano
      // pinta con `var(--resto)` desde el CSS). Se falla cuando se usa.
      const clase = nombre.replace(/\.DEFAULT$/, "").replace(/\./g, "-");
      const re = new RegExp("\\b(bg|text|border|ring|fill|stroke|from|to|via)-" + clase + "\\b");
      const usos = FUERA_LANDING.filter((f) => re.test(leer(f)));
      if (usos.length) malos.push(`${nombre}: no está en el config y ${usos[0]} usa la clase`);
      continue;
    }
    const refs = [...String(v).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    if (refs.length) {
      // Entra por la variable, que es la forma correcta. No se exige que el
      // NOMBRE coincida —`--accent-600` es alias de `--accent`, y el config
      // puede leer cualquiera de los dos— pero sí que resuelva al MISMO color
      // en los dos modos. Es lo que importa: que la clase y el CSS suelto
      // pinten igual.
      for (const r of refs) {
        for (const m of ["claro", "oscuro"]) {
          const crudo = resolver(modo[m], `var(${r})`);
          const c = aRgba(crudo) || aRgba(`rgb(${crudo})`);
          const t = color(m, token);
          if (!c || !t) { malos.push(`${nombre}: ${r} no resuelve a un color en ${m}`); continue; }
          if (hex(c) !== hex(t)) malos.push(`${nombre} (${m}): el config lee ${r}=${hex(c)} y el token ${token} es ${hex(t)}`);
        }
      }
      continue;
    }
    const a = aRgba(v), b = color("claro", token);
    if (!a || !b) { malos.push(`${nombre}: valor ilegible (${v})`); continue; }
    if (hex(a) !== hex(b)) malos.push(`${nombre}: config ${hex(a)} vs tema.css ${hex(b)}`);
  }
  assert.deepEqual(malos, [], `\n         ${malos.join("\n         ")}`);
});

prueba("un color que cambia con el modo NO puede ser un hex literal en el config", () => {
  if (!temaCss) throw new Error("sin tema.css");
  const ciegos = [];
  for (const [nombre, token] of Object.entries(PUENTE)) {
    const v = planos[nombre];
    if (v === undefined || /var\(/.test(String(v))) continue;   // ya entra por la variable
    const c = color("claro", token), o = color("oscuro", token);
    if (!c || !o) continue;
    if (hex(c) !== hex(o)) ciegos.push(`${nombre}=${v} (claro ${hex(c)} · oscuro ${hex(o)})`);
  }
  assert.deepEqual(ciegos, [],
    "estas clases de Tailwind emiten el hex claro y no se enteran del modo oscuro nunca:\n         "
    + ciegos.join("\n         "));
});

console.log("\ntema · contraste WCAG, calculado acá");

/* Los pares que de verdad se leen, en tres clases:
     `texto`  — texto normal: 4,5:1 duro (WCAG 1.4.3). Falla la prueba.
     `objeto` — control o dato gráfico cuya identidad depende del contraste:
                3:1 duro (WCAG 1.4.11). Falla la prueba.
     `aviso`  — se mide y se imprime, no falla, y CADA UNO lleva escrito por qué
                se acepta. No es una categoría para esconder lo que molesta: es
                para las tres desviaciones que ya están documentadas y medidas
                en `outputs/tema.md`, y que dependen de un refuerzo NO cromático
                que hay que verificar aparte (la palabra al lado, el borde, la
                línea del piso del plano). Si mañana desaparece el refuerzo,
                esto vuelve a ser `objeto`. */
const PARES = [
  ["texto", "--ink-1", "--bg"], ["texto", "--ink-1", "--surface"], ["texto", "--ink-1", "--surface-2"],
  ["texto", "--ink-1", "--surface-3"],
  ["texto", "--ink-2", "--bg"], ["texto", "--ink-2", "--surface"], ["texto", "--ink-2", "--surface-2"],
  ["texto", "--ink-2", "--surface-3"],
  ["texto", "--ink-3", "--bg"], ["texto", "--ink-3", "--surface"], ["texto", "--ink-3", "--surface-2"],
  // `--surface-3` es el hueco, lo deshabilitado y la pista de una barra: ahí
  // también se escribe (el «sin dato», el rótulo de una fila vacía).
  ["texto", "--ink-3", "--surface-3"],
  ["texto", "--accent-ink", "--accent"],
  ["texto", "--on-signal", "--signal"],
  ["texto", "--signal-ink", "--surface"], ["texto", "--signal-ink", "--bg"],
  ["texto", "--success", "--surface"], ["texto", "--success", "--bg"], ["texto", "--success", "--success-50"],
  ["texto", "--warning", "--surface"], ["texto", "--warning", "--bg"], ["texto", "--warning", "--warning-50"],
  ["texto", "--danger", "--surface"], ["texto", "--danger", "--bg"], ["texto", "--danger", "--danger-50"],
  ["objeto", "--ink-4", "--surface"], ["objeto", "--ink-4", "--bg"],
  ["objeto", "--libre", "--bg"], ["objeto", "--libre", "--surface"],
  ["objeto", "--ocupado", "--bg"], ["objeto", "--ocupado", "--surface"],
  ["objeto", "--ring", "--surface"], ["objeto", "--ring", "--bg"],
  // el relleno del botón principal no llega a 3:1 contra la tarjeta blanca
  // (1,87:1) y no tiene por qué: quien dibuja el contorno del control es
  // `--signal-borde`, y eso se mide aparte, abajo.
  ["aviso", "--signal", "--surface"],
  // el ámbar de relleno: WARN conocido del validador de dataviz («relief
  // required — visible labels»). El refuerzo es regla dura del producto: cada
  // estado va SIEMPRE con su palabra al lado, y el chip lleva `--entra-borde`.
  ["aviso", "--entra", "--bg"], ["aviso", "--entra", "--surface"],
  // el gris de «lo que no se alquila»: su trabajo es leerse apagado. Se
  // distingue por la línea del piso (`--floor-edge`) y por el rótulo, no por
  // el relleno. Aun así mejora respecto de lo que había (#D3D9DB sobre #EFF1F1
  // daba 1,20:1).
  ["aviso", "--resto", "--bg"], ["aviso", "--resto", "--surface"],
  // separadores de 1px: son divisores, no bordes de control (1.4.11 no los
  // alcanza). Se miden para que nadie los use como borde de un input.
  ["aviso", "--line-strong", "--surface"], ["aviso", "--line", "--surface"],
];

for (const m of ["claro", "oscuro"]) {
  prueba(`pares texto/fondo en ${m}`, () => {
    if (!temaCss) throw new Error("sin tema.css");
    const bajos = [], avisos = [], faltan = [];
    for (const [clase, ft, bt] of PARES) {
      const f = color(m, ft), b = color(m, bt);
      if (!f || !b) { faltan.push(`${ft} sobre ${bt}`); continue; }
      const piso = clase === "texto" ? 4.5 : 3;
      const r = contraste(f, b);
      if (r >= piso) continue;
      const linea = `${ft} (${hex(f)}) sobre ${bt} (${hex(b)}): ${r.toFixed(2)}:1 < ${piso}`;
      (clase === "aviso" ? avisos : bajos).push(linea);
    }
    if (faltan.length) console.log(`       sin medir (token ausente o no es color): ${faltan.join(", ")}`);
    for (const a of avisos) console.log(`       aviso · ${a} — desviación documentada, depende del refuerzo no cromático`);
    assert.deepEqual(bajos, [], `\n         ${bajos.join("\n         ")}`);
  });
}

prueba("el botón principal tiene contorno propio contra la tarjeta y contra el papel", () => {
  if (!temaCss) throw new Error("sin tema.css");
  // WCAG 1.4.11: el límite de un control necesita 3:1 contra lo que tiene al
  // lado. En claro el amarillo `#F2B300` da 1,87:1 sobre blanco, así que el
  // contorno lo tiene que poner el borde; en oscuro el propio relleno alcanza
  // y el borde puede ser `transparent`. Vale cualquiera de los dos, pero
  // alguno tiene que dar la cara.
  const flojos = [];
  for (const m of ["claro", "oscuro"]) {
    for (const fondo of ["--surface", "--bg"]) {
      const b = color(m, fondo);
      const relleno = color(m, "--signal");
      const borde = color(m, "--signal-borde");
      if (!b || !relleno) { flojos.push(`${m}: no se pudo leer --signal / ${fondo}`); continue; }
      const mejor = Math.max(contraste(relleno, b), borde && borde.a > 0 ? contraste(borde, b) : 0);
      if (mejor < 3) flojos.push(`${m} sobre ${fondo}: lo mejor entre relleno y borde da ${mejor.toFixed(2)}:1 < 3`);
    }
  }
  assert.deepEqual(flojos, [], `el botón amarillo no tiene contorno:\n         ${flojos.join("\n         ")}`);
});

console.log(`\n${hechas} pruebas del tema`);
