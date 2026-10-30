/**
 * Red team de los dibujos de la Plataforma (Fase 11 · la forma de A).
 *   npm run probar:graficos
 *
 * Los diez componentes de `src/components/plataforma/graficos.tsx` son SVG
 * dibujado a mano: no hay librería que garantice que un rótulo entra, que dos
 * etiquetas no se pisan, o que un cuerpo de 10 px sigue midiendo 10 px cuando
 * el `viewBox` se escala. Eso no se mira: se mide, y se mide en las dos
 * temperaturas, porque el oscuro cambia los tokens y no la geometría — pero
 * cambia el ancho de los textos que dependen del contenido.
 *
 * Cinco guardarraíles:
 *
 *  1. **Ningún `<text>` por debajo de 10 px reales en pantalla.** El contrato
 *     de tamaño (`width:100% · min-width:W · height:H` + `xMinYMin meet`) fija
 *     el factor de escala en 1; si alguien lo rompe, un rótulo de 10,5 px se
 *     hunde y el gráfico deja de leerse. Se mide el `font-size` computado por
 *     el factor real de la matriz de pantalla, no el atributo.
 *  2. **Ningún `<text>` por encima de 30 px reales.** El otro extremo del
 *     mismo contrato: si el `viewBox` se pudiera inflar, la escala tipográfica
 *     de la pantalla dejaría de significar nada adentro de los dibujos.
 *  3. **Cero pares de `<text>` pisados** dentro de un mismo `<svg>`
 *     (solapamiento de más de 1,5 px en los dos ejes a la vez).
 *  4. **Ningún `<text>` fuera de la caja de su `<svg>`.** Un rótulo que se
 *     sale se recorta o se superpone con el bloque de al lado.
 *  5. **Cero errores de consola** en las cuatro pasadas.
 *
 * Y dos afirmaciones estáticas, que no necesitan navegador:
 *  6. `graficos.tsx` no escribe un `font-size` fuera de la tabla `VOZ`, ni
 *     usa `--ink-4` para pintar texto (3,98:1 sobre el papel).
 *  7. `plataforma.css` no pinta un fondo amarillo: el único amarillo de la
 *     pantalla es `.btn-principal`, que vive en `index.css`.
 *
 * Levanta su propio servidor de Vite en un puerto propio (5211 por defecto) y
 * lo mata al terminar. Sin `playwright-core` alcanzable, las partes 1-5 se
 * saltan y se dice que se saltaron; 6 y 7 corren siempre.
 *
 * ── Sobre el servidor de dev, que es la parte que ya se rompió una vez ────
 *
 * Este archivo prometía dos cosas sobre el 5211 y las dos fallaron en la
 * verificación del port. Ahora las dos están sostenidas por código:
 *
 *   · **lo mata SIEMPRE.** Antes se lanzaba `npx vite`: `npx` es un proceso
 *     intermedio, y matarlo a él deja al `vite` de verdad huérfano y vivo.
 *     Encima la limpieza colgaba de `process.on("exit")`, que corre síncrono
 *     y no puede esperar a que un hijo se muera. Medido: `npm run probar`
 *     cerraba con exit 0 y el `vite --port 5211 --strictPort` seguía
 *     corriendo. Ahora se lanza el binario local (`node_modules/.bin/vite`)
 *     en su PROPIO grupo de procesos (`detached: true`) y se mata el GRUPO
 *     entero (`process.kill(-pid)`): SIGTERM, se ESPERA el cierre, y si no
 *     cerró en 5 s, SIGKILL. Eso cuelga de un `try/finally` que cubre el
 *     camino feliz y la excepción, más handlers de SIGINT y SIGTERM, más un
 *     `process.on("exit")` de último recurso que manda un SIGKILL síncrono
 *     al grupo por si algo se sale por una puerta que nadie previó.
 *   · **si el puerto está tomado, lo dice.** Con `--strictPort` —— que es lo
 *     correcto: sin él Vite se muda de puerto y el test mediría otra cosa,
 *     o peor, la corrida anterior —— una corrida sobre un puerto ocupado se
 *     quedaba 60 s en la espera activa antes de escupir un log. Ahora el
 *     puerto se prueba ANTES de lanzar nada y el script sale diciéndolo.
 *
 * Variables:
 *   PROBAR_GRAFICOS_PUERTO      puerto del servidor de dev (5211)
 *   PROBAR_GRAFICOS_CHROME      ruta al Chromium (por defecto el de /opt/pw-browsers)
 *   PROBAR_GRAFICOS_PLAYWRIGHT  ruta a playwright-core si no está en node_modules
 *   PROBAR_GRAFICOS_EJEMPLO     ruta al ejemplo.json del analista
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");

const PUERTO = Number(process.env.PROBAR_GRAFICOS_PUERTO || 5211);
const CHROME =
  process.env.PROBAR_GRAFICOS_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EJEMPLO =
  process.env.PROBAR_GRAFICOS_EJEMPLO ||
  resolve(raiz, "../features/plataforma-asesoria/outputs/ejemplo.json");

let fallas = 0;
const ok = (t) => console.log("  ✓ " + t);
const mal = (t, d) => {
  fallas++;
  console.log("  ✗ " + t + (d ? "\n      " + d : ""));
};

// ═══ 6 · La letra sale de la tabla VOZ, y --ink-4 no escribe ═══════════════
console.log("\n[estático] graficos.tsx");
{
  const src = leer("src/components/plataforma/graficos.tsx");

  /* Un `font-size` suelto es un paso que nadie declaró: el modo oscuro, el
     apretón de ventana y la próxima figura no lo van a respetar. */
  const cuerpos = [...src.matchAll(/fontSize\s*:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
  const fuera = cuerpos.filter((c) => !/^VOZ\[[^\]]+\]\.css$/.test(c));
  if (fuera.length === 0) ok("todos los `fontSize` salen de la tabla VOZ");
  else mal("hay `fontSize` fuera de la tabla VOZ", fuera.join(" · "));

  const vozBloque = src.match(/const VOZ = \{[\s\S]*?\} as const;/);
  assert.ok(vozBloque, "no se encontró la tabla VOZ: el test no puede afirmar nada");
  const pasos = [...vozBloque[0].matchAll(/px:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(pasos.length >= 3, "la tabla VOZ quedó vacía");
  if (Math.min(...pasos) >= 10 && Math.max(...pasos) <= 30)
    ok(`los ${pasos.length} pasos de VOZ están entre 10 y 30 px (${Math.min(...pasos)}–${Math.max(...pasos)})`);
  else mal("un paso de VOZ se salió del rango 10–30 px", pasos.join(" · "));

  /* `--ink-4` da 3,98:1 sobre el papel `--bg`. Es trazo, no texto. */
  const textosConInk4 = [...src.matchAll(/<T\b[^>]*fill="var\(--ink-4\)"/g)];
  if (textosConInk4.length === 0) ok("ningún `<T>` (texto) usa `--ink-4`");
  else mal(`${textosConInk4.length} textos usan --ink-4 (3,98:1 sobre el papel)`);

  /* Sin dos ejes: ni un solo componente puede declarar dos escalas. */
  if (!/dual|segundoEje|ejeDerecho/i.test(src)) ok("ningún componente declara un segundo eje");
  else mal("aparece algo que huele a segundo eje");
}

// ═══ 7 · El amarillo no vive en esta hoja ═════════════════════════════════
console.log("\n[estático] plataforma.css");
{
  const css = leer("src/plataforma.css");
  const amarillos = css
    .split("\n")
    .filter((l) => /background[^;]*var\(--signal\)/.test(l) && !l.trim().startsWith("*"));
  if (amarillos.length === 0) ok("`plataforma.css` no pinta un solo fondo con `--signal`");
  else mal("hay fondo amarillo en plataforma.css", amarillos.join(" | "));

  if (/^\.plat\s*\{/m.test(css)) ok("existe la clase raíz `.plat`");
  else mal("no existe la clase raíz `.plat`");

  const sueltas = css
    .split("\n")
    .filter((l) => /^\.(?!plat)[a-z]/.test(l.trim()) && !l.includes("{") === false)
    .filter((l) => !/^\.plat/.test(l.trim()));
  if (sueltas.length === 0) ok("todas las reglas cuelgan de `.plat`");
  else mal("hay reglas fuera de `.plat`", sueltas.slice(0, 5).join(" | "));

  /* Los tres estados de espacio no pueden codificar nada más. La única
     excepción declarada es `--entra` en el chip «parcial» y en la franja del
     mes en curso, que no comparten figura con ningún estado de espacio. */
  const chips = css.match(/\.plat-chip--(fuerte|medio|suave)[^}]*\}/g) || [];
  const conColorDeEstado = chips.filter((c) => /--(ocupado|entra|libre)/.test(c));
  if (conColorDeEstado.length === 0) ok("los chips de señal/estado/prioridad van en tinta gris");
  else mal("un chip de señal usa un color de estado de espacio", conColorDeEstado.join(" | "));
}

// La plata completa, nunca «M» (regla del negocio; auditoría P3-5): ni en los
// ejes ni en los rótulos de la consola. `platM` se fue; todo monto sale por `plata`.
{
  const { readdirSync } = await import("node:fs");
  const dirPlat = join(raiz, "src", "components", "plataforma");
  const archivos = [
    ...readdirSync(dirPlat).filter((f) => /\.tsx?$/.test(f)).map((f) => join(dirPlat, f)),
    join(raiz, "src", "pages", "DetalleCliente.tsx"),
  ];
  const conM = archivos.filter((f) => /\bplatM\(|["'`] M["'`]|\+ " M"/.test(readFileSync(f, "utf8")));
  if (conM.length === 0) ok("la consola dice la plata completa: sin «M»");
  else mal("la consola abrevia plata con «M»", conM.join(", "));
}

// ═══ 1-5 · El navegador ════════════════════════════════════════════════════
let chromium = null;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  const alt = process.env.PROBAR_GRAFICOS_PLAYWRIGHT;
  if (alt) ({ chromium } = await import(alt));
}
if (!chromium) {
  console.log("\n[navegador] SALTADO: no se pudo cargar playwright-core (pasá PROBAR_GRAFICOS_PLAYWRIGHT=/ruta).");
  console.log(fallas ? `\n${fallas} falla(s).` : "\nSin fallas en lo estático.");
  process.exit(fallas ? 1 : 0);
}
if (!existsSync(CHROME)) {
  console.log(`\n[navegador] SALTADO: no existe el Chromium en ${CHROME}.`);
  process.exit(fallas ? 1 : 0);
}
if (!existsSync(EJEMPLO)) {
  console.log(`\n[navegador] SALTADO: no existe el ejemplo del analista en ${EJEMPLO}.`);
  process.exit(fallas ? 1 : 0);
}

// ═══ El servidor de dev: se prueba el puerto, se lanza en su propio grupo,
//     y se mata el grupo pase lo que pase ═══════════════════════════════════

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** ¿Está libre el puerto? Se intenta escuchar en él y se suelta. Un test que
 *  arranca sobre un puerto ajeno mide la corrida de otro —— o, con
 *  `--strictPort`, no mide nada y se cuelga esperando. */
const puertoLibre = (puerto) =>
  new Promise((resolve_) => {
    const s = createServer();
    s.once("error", () => resolve_(false));
    s.once("listening", () => s.close(() => resolve_(true)));
    s.listen(puerto, "127.0.0.1");
  });

if (!(await puertoLibre(PUERTO))) {
  console.log(
    `\n[navegador] el puerto ${PUERTO} ya está tomado: este test lo pide con \`--strictPort\`` +
      ` porque medir sobre otro puerto sería medir otra cosa.\n` +
      `            Quién lo tiene:  ss -lptn 'sport = :${PUERTO}'   (o  lsof -ti :${PUERTO} )\n` +
      `            Si es un Vite huérfano de una corrida anterior:  kill $(lsof -ti :${PUERTO})\n` +
      `            O corré este test en otro puerto:  PROBAR_GRAFICOS_PUERTO=5212 npm run probar:graficos`
  );
  process.exit(1);
}

mkdirSync(join(raiz, "pruebas"), { recursive: true });
const copia = join(raiz, "pruebas", "ejemplo.json");
copyFileSync(EJEMPLO, copia);

/* El binario local, no `npx`: `npx` es un proceso intermedio y matarlo a él
   deja al Vite de verdad vivo —— que es exactamente lo que pasó. Si por lo
   que sea no está, se cae a `npx`, y el kill de grupo lo cubre igual. */
const binVite = join(raiz, "node_modules", ".bin", "vite");
const [cmd, args] = existsSync(binVite)
  ? [binVite, ["--port", String(PUERTO), "--strictPort", "--host", "127.0.0.1"]]
  : ["npx", ["vite", "--port", String(PUERTO), "--strictPort", "--host", "127.0.0.1"]];

const vite = spawn(cmd, args, {
  cwd: raiz,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // grupo propio: `kill(-pid)` se lleva a Vite y a sus hijos
});
let salidaVite = "";
vite.stdout.on("data", (b) => (salidaVite += b));
vite.stderr.on("data", (b) => (salidaVite += b));

let muerto = false;
vite.on("exit", () => { muerto = true; });

/** Mata el GRUPO. Idempotente: se puede llamar dos veces sin ruido. */
const matarGrupo = (senal) => {
  if (muerto || vite.pid == null) return;
  try { process.kill(-vite.pid, senal); }
  catch { try { vite.kill(senal); } catch { /* ya no está */ } }
};

let limpiado = false;
/** La única salida. SIGTERM al grupo, se ESPERA de verdad el cierre (hasta
 *  5 s) y si no cerró, SIGKILL. Después borra la copia del ejemplo. */
const limpiar = async () => {
  if (limpiado) return;
  limpiado = true;
  matarGrupo("SIGTERM");
  for (let i = 0; i < 50 && !muerto; i++) await dormir(100);
  if (!muerto) {
    matarGrupo("SIGKILL");
    for (let i = 0; i < 20 && !muerto; i++) await dormir(100);
  }
  /* Y la prueba de que se murió: el puerto vuelve a estar libre. Si no lo
     está, no se calla —— es justo la falla que este arreglo persigue. */
  let libre = false;
  for (let i = 0; i < 20 && !libre; i++) {
    libre = await puertoLibre(PUERTO);
    if (!libre) await dormir(100);
  }
  if (!libre) console.log(`  ⚠ el puerto ${PUERTO} sigue tomado después de matar el grupo del Vite (pid ${vite.pid}).`);
  try { rmSync(copia); } catch { /* nunca se copió */ }
};

/** Salida ordenada: limpia y recién ahí sale. */
const salir = async (codigo) => {
  await limpiar();
  process.exit(codigo);
};

/* Tres puertas más, para que no quede ninguna sin cerrar:
   señales (alguien apretó Ctrl-C o el `npm run probar` fue interrumpido),
   una excepción que se escapó de todos los `try`, y `exit` como último
   recurso —— ahí sólo cabe algo síncrono, así que va un SIGKILL a secas. */
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { matarGrupo("SIGKILL"); try { rmSync(copia); } catch { /* ya no está */ } process.exit(130); });
process.on("uncaughtException", async (e) => { console.log("\n[navegador] excepción: " + String(e).slice(0, 400)); await salir(1); });
process.on("unhandledRejection", async (e) => { console.log("\n[navegador] rechazo sin atender: " + String(e).slice(0, 400)); await salir(1); });
process.on("exit", () => { matarGrupo("SIGKILL"); });

const base = `http://127.0.0.1:${PUERTO}`;
let vivo = false;
for (let i = 0; i < 120 && !muerto; i++) {
  try {
    const r = await fetch(base + "/pruebas/graficos.html");
    if (r.ok) { vivo = true; break; }
  } catch { /* todavía no levanta */ }
  await dormir(500);
}
if (!vivo) {
  console.log("\n[navegador] no levantó el servidor de dev:\n" + salidaVite.slice(-2000));
  await salir(1);
}

/* Desde acá y hasta el `finally`, todo lo que pase —— una falla de
   Playwright, un `assert` roto, un timeout —— pasa por la limpieza. */
let nav = null;
try {
  nav = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

  /** Mide un `<text>` por lo que ocupa EN PANTALLA, no por su atributo: el
   *  `font-size` computado va en unidades del `viewBox` y el factor de la
   *  matriz de pantalla es el que lo lleva a píxeles CSS. */
  const MEDIR = () => {
    const svgs = [...document.querySelectorAll(".plat-fig svg")];
    const textos = [];
    const desbordes = [];
    const cruces = [];
    for (const svg of svgs) {
      const cajaSvg = svg.getBoundingClientRect();
      const míos = [...svg.querySelectorAll("text")].filter((t) => (t.textContent || "").trim().length > 0);
      const cajas = [];
      for (const t of míos) {
        const ctm = t.getScreenCTM();
        const escala = ctm ? Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) : 1;
        const px = parseFloat(getComputedStyle(t).fontSize) * escala;
        const r = t.getBoundingClientRect();
        const etiqueta = (svg.getAttribute("aria-label") || "").slice(0, 48) + " :: " + (t.textContent || "").slice(0, 42);
        textos.push({ px: Math.round(px * 100) / 100, etiqueta });
        if (r.width > 0 && (r.left < cajaSvg.left - 1 || r.right > cajaSvg.right + 1 || r.top < cajaSvg.top - 1 || r.bottom > cajaSvg.bottom + 1))
          desbordes.push(etiqueta);
        cajas.push({ r, etiqueta });
      }
      for (let i = 0; i < cajas.length; i++)
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i].r, b = cajas[j].r;
          const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ow > 1.5 && oh > 1.5) cruces.push(cajas[i].etiqueta + "  ⨯  " + cajas[j].etiqueta);
        }
    }
    return { svgs: svgs.length, textos, desbordes, cruces };
  };

  const pasadas = [
    { tema: "claro", w: 1440, h: 900 },
    { tema: "oscuro", w: 1440, h: 900 },
    { tema: "claro", w: 1366, h: 768 },
    { tema: "oscuro", w: 1366, h: 768 },
  ];

  console.log("\n[navegador] " + pasadas.length + " pasadas sobre el banco de pruebas");
  for (const p of pasadas) {
    const ctx = await nav.newContext({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
    const pag = await ctx.newPage();
    const errores = [];
    pag.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    pag.on("pageerror", (e) => errores.push(String(e)));
    await pag.goto(base + "/pruebas/graficos.html", { waitUntil: "networkidle" });
    await pag.evaluate((t) => {
      if (t === "oscuro") document.documentElement.setAttribute("data-tema", "oscuro");
      else document.documentElement.removeAttribute("data-tema");
    }, p.tema);
    await pag.waitForSelector('[data-listo="si"]', { timeout: 20000 });
    await pag.waitForSelector(".plat-fig svg", { timeout: 20000 });
    await pag.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const m = await pag.evaluate(MEDIR);
    const et = `${p.tema} @${p.w}×${p.h}`;
    const chicos = m.textos.filter((t) => t.px < 9.99);
    const grandes = m.textos.filter((t) => t.px > 30.01);

    console.log(`  · ${et}: ${m.svgs} svg · ${m.textos.length} textos medidos`);
    if (chicos.length === 0) ok(`${et} — 0 textos por debajo de 10 px`);
    else mal(`${et} — ${chicos.length} textos por debajo de 10 px`, chicos.slice(0, 6).map((c) => `${c.px}px ${c.etiqueta}`).join("\n      "));
    if (grandes.length === 0) ok(`${et} — 0 textos por encima de 30 px`);
    else mal(`${et} — ${grandes.length} textos por encima de 30 px`, grandes.slice(0, 6).map((c) => `${c.px}px ${c.etiqueta}`).join("\n      "));
    if (m.cruces.length === 0) ok(`${et} — 0 pares de texto pisados`);
    else mal(`${et} — ${m.cruces.length} pares pisados`, m.cruces.slice(0, 8).join("\n      "));
    if (m.desbordes.length === 0) ok(`${et} — 0 textos fuera de la caja de su svg`);
    else mal(`${et} — ${m.desbordes.length} textos desbordados`, m.desbordes.slice(0, 8).join("\n      "));
    if (errores.length === 0) ok(`${et} — 0 errores de consola`);
    else mal(`${et} — ${errores.length} errores de consola`, errores.slice(0, 4).join("\n      "));

    /* El rótulo del último mes de las barras divergentes.
       Se rotulaba con las ENTRADAS del último mes y un «+» forzado: con una
       entrada de $ 600.000 contra una salida de $ 2.000.000 la figura decía
       «+$ 0,6 M» a diez píxeles de su propia anotación, que sobre ese MISMO
       mes decía «el peor saldo de la ventana: −$ 1,4 M». El caso 17 fija que
       cuando el último mes ES el peor lo dice la anotación y nada más; el 18,
       que cuando no lo es se rotula con su SALDO y con su signo. */
    const div = await pag.evaluate(() => {
      /* Sin la escala del eje, que vive a la izquierda de la grilla y sí lleva
         su «+$» a propósito («+$ 2.000.000» arriba del cero, «−$ 2.000.000»
         abajo): acá se juzga lo que se dibuja SOBRE los meses. El borde es el
         x1 de la grilla, que crece con el rótulo más ancho (plata completa,
         nunca «M»). */
      const leer = (id) => {
        const caso = document.querySelector(`[data-caso="${id}"] svg`);
        if (!caso) return [];
        const borde = Math.min(...[...caso.querySelectorAll("line")].map((l) => parseFloat(l.getAttribute("x1") || "0")));
        return [...caso.querySelectorAll("text")]
          .map((t) => ({ t: (t.textContent || "").trim(), x: parseFloat(t.getAttribute("x") || "0") }))
          .filter((o) => o.x > borde)
          .map((o) => o.t);
      };
      return { peor: leer("17"), noPeor: leer("18") };
    });
    const sueltos = div.peor.filter((t) => /\$/.test(t) && !/peor saldo/.test(t));
    if (sueltos.length === 0) ok(`${et} — divergentes: el último mes peor no lleva un segundo rótulo`);
    else mal(`${et} — divergentes: rótulo suelto sobre el último mes`, sueltos.join(" · "));

    const saldo = div.noPeor.find((t) => /^saldo\s/.test(t));
    if (saldo && /\u2212/.test(saldo)) ok(`${et} — divergentes: el último mes se rotula «${saldo}»`);
    else mal(`${et} — divergentes: falta el rótulo de saldo con signo en el último mes`, "textos: " + div.noPeor.join(" · "));

    const masForzado = div.peor.concat(div.noPeor).filter((t) => /^\+\s*\$/.test(t));
    void masForzado;
    if (masForzado.length === 0) ok(`${et} — divergentes: ningún «+$» forzado`);
    else mal(`${et} — divergentes: ${masForzado.length} rótulo(s) «+$» forzado(s)`, masForzado.join(" · "));

    await ctx.close();
  }
} finally {
  if (nav) { try { await nav.close(); } catch { /* ya cerró */ } }
  await limpiar();
}

console.log(fallas ? `\n${fallas} falla(s).` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
