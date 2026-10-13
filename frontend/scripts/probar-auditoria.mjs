/**
 * Pruebas de src/utils/auditoriaDesfase.ts — el fantasma, visto desde el navegador.
 *   npm run probar:auditoria
 *
 * Contesta la pregunta del reporte original —«no me deja alquilar la IMP-17 que
 * está libre, el sistema la toma como ocupada»— sin consola, sin credenciales y
 * sin plan pago: el store ya bajó TODOS los planos y el mapa comercial entero,
 * porque los necesita para pintar. La auditoría es una resta entre dos cosas que
 * ya están en memoria.
 *
 * Lo que fijan estas pruebas es lo que no se puede romper sin que el fantasma
 * vuelva a ser invisible:
 *
 *  · Un mueble es único por SEDE + CÓDIGO. Casi todas las tiendas tienen un
 *    IMP-17; buscar por código solo diría «existe» señalando el de otra tienda.
 *  · Las tres puertas son un espacio MENOS: borrar el mueble, pasar la góndola
 *    de doble a simple —desaparece la cara B— y marcarlo no comercializable.
 *  · Y la mitad que se olvida: un auditor que grita siempre se deja de leer.
 *
 * `espaciosOfrecidos` es espejo de `espacios_ofrecidos` en
 * `backend/app/services/layout_lookup.py`. Si las dos se separan, el aviso de la
 * pantalla y el guardarraíl del servidor dejan de hablar del mismo conjunto.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "aud-")), "a.mjs");
const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "auditoriaDesfase.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const { contratosSinMueble } = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const mueble = (code, extra = {}) => ({
  id: `f-${code}`, code, label: code, type: "punta", w: 1, h: 1, d: 1, ...extra,
});

const vendido = (extra = {}) => ({
  status: "occupied", supplierName: "Colgate", brandCategory: "Aseo",
  negotiatedValue: 1_000_000, startDate: "2026-09-01", endDate: "2026-10-01",
  observation: "", ...extra,
});

/** Dos tiendas con un IMP-17 cada una: la situación real que rompía todo. */
const dosSedes = () => ({
  "CIUDAD JARDIN": [mueble("IMP-17"), mueble("IMP-18")],
  "NAVE": [mueble("IMP-17"), mueble("PUN-15")],
});

console.log("\nLa auditoría de desfase, en la pantalla\n");

prueba("un plano al día no reporta nada", () => {
  // La mitad que se olvida: un auditor que grita siempre se deja de leer.
  assert.deepEqual(
    contratosSinMueble(dosSedes(), {
      "NAVE-IMP-17": vendido(), "CIUDAD JARDIN-IMP-18": vendido(),
    }),
    [],
  );
});

prueba("BORRAR EL MUEBLE deja el contrato a la vista", () => {
  // El plano ya no tiene el PUN-01; la base sigue teniendo su contrato.
  const r = contratosSinMueble(dosSedes(), { "NAVE-PUN-01": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].espacio, "NAVE-PUN-01");
  assert.equal(r[0].sede, "NAVE");
  assert.equal(r[0].code, "PUN-01");
  assert.equal(r[0].supplierName, "Colgate");
  assert.equal(r[0].endDate, "2026-10-01");
});

prueba("LA CARA B QUE DESAPARECE también", () => {
  // Una góndola mural no ofrece cara B: pasarla de doble a mural borra un
  // espacio vendible entero sin que nadie borre un mueble.
  const simple = { "NAVE": [mueble("GON-60", { type: "gondola", gondolaType: "wall" })] };
  assert.equal(contratosSinMueble(simple, { "NAVE-GON-60-B": vendido() }).length, 1);
});

prueba("y una góndola doble SÍ ofrece las dos caras", () => {
  const doble = { "NAVE": [mueble("GON-60", { type: "gondola", gondolaType: "double" })] };
  assert.deepEqual(
    contratosSinMueble(doble, { "NAVE-GON-60": vendido(), "NAVE-GON-60-B": vendido() }),
    [],
  );
});

prueba("una góndola SIN `gondolaType` también ofrece la cara B", () => {
  // La regla es una sola (`carasDe`): Vender ofrece esa cara B y la vende, así
  // que su contrato NO es un fantasma. Con la regla estricta de antes, salía
  // en «Para revisar» como contrato sin mueble.
  const vieja = { "NAVE": [mueble("GON-60", { type: "gondola" })] };
  assert.deepEqual(contratosSinMueble(vieja, { "NAVE-GON-60-B": vendido() }), []);
});

prueba("gondola_doble por tipo cuenta igual", () => {
  const doble = { "NAVE": [mueble("GON-60", { type: "gondola_doble" })] };
  assert.deepEqual(contratosSinMueble(doble, { "NAVE-GON-60-B": vendido() }), []);
});

prueba("MARCARLO NO COMERCIALIZABLE lo saca de la venta y se ve", () => {
  const planos = { "NAVE": [mueble("IMP-17", { rentable: false })] };
  const r = contratosSinMueble(planos, { "NAVE-IMP-17": vendido() });
  assert.equal(r.length, 1, "un mueble no comercializable no ofrece su espacio");
});

prueba("un tipo que NUNCA se alquila tampoco ofrece", () => {
  // La caja registradora es puesto de trabajo de la tienda, no espacio vendible.
  const planos = { "NAVE": [mueble("CAJ-01", { type: "checkout" })] };
  assert.equal(contratosSinMueble(planos, { "NAVE-CAJ-01": vendido() }).length, 1);
});

prueba("EL IMP-17 DE LA OTRA TIENDA NO LO TAPA", () => {
  // El bug entero en una línea: `PUN-15` existe en NAVE, no en CIUDAD JARDIN.
  const r = contratosSinMueble(dosSedes(), { "CIUDAD JARDIN-PUN-15": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].sede, "CIUDAD JARDIN");
  assert.equal(r[0].code, "PUN-15");
});

prueba("la grafía de la sede no inventa un fantasma", () => {
  // El store conserva la sede como se cargó: «Nave», no «NAVE».
  const planos = { "Ciudad Jardin": [mueble("IMP-17")] };
  assert.deepEqual(contratosSinMueble(planos, { "CIUDAD JARDIN-IMP-17": vendido() }), []);
});

prueba("el mueble con sede propia ofrece para SU sede", () => {
  // Un plano copiado de otra tienda dibuja muebles que no son de la abierta.
  const planos = { "CIUDAD JARDIN": [mueble("PUN-15", { sede: "NAVE" })] };
  assert.deepEqual(contratosSinMueble(planos, { "NAVE-PUN-15": vendido() }), []);
  assert.equal(contratosSinMueble(planos, { "CIUDAD JARDIN-PUN-15": vendido() }).length, 1);
});

prueba("un código que ya trae la sede adentro no se prefija dos veces", () => {
  // El editor 3D los genera así.
  const planos = { "NAVE": [mueble("NAVE-IMP-17")] };
  assert.deepEqual(contratosSinMueble(planos, { "NAVE-IMP-17": vendido() }), []);
});

prueba("gana el prefijo de sede MÁS LARGO", () => {
  // Con «NAVE» y «NAVE 2» cargadas, el código de la segunda no se puede leer
  // como el de la primera.
  const planos = { "NAVE": [mueble("IMP-17")], "NAVE 2": [mueble("IMP-99")] };
  const r = contratosSinMueble(planos, { "NAVE 2-PUN-01": vendido() });
  assert.equal(r[0].sede, "NAVE 2");
  assert.equal(r[0].code, "PUN-01");
});

prueba("RESERVADO Y MANTENIMIENTO NO SON FANTASMAS", () => {
  // Los pone una persona a propósito y no tienen contrato detrás: que no haya
  // mueble es raro, pero no es plata en el aire, y mezclarlos apaga el aviso.
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-ZZZ-01": { ...vendido(), status: "maintenance" },
    "NAVE-ZZZ-02": { ...vendido(), status: "reserved" },
    "NAVE-ZZZ-03": { ...vendido(), status: "free" },
  });
  assert.deepEqual(r, []);
});

prueba("se ordenan por sede y después por código", () => {
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-ZZZ-01": vendido(), "NAVE-AAA-02": vendido(),
    "CIUDAD JARDIN-MMM-03": vendido(),
  });
  assert.deepEqual(r.map((x) => x.espacio), [
    "CIUDAD JARDIN-MMM-03", "NAVE-AAA-02", "NAVE-ZZZ-01",
  ]);
});

prueba("un espacio de una sede que el store no conoce se reporta igual", () => {
  // Sin plano no hay dónde verlo: es el caso más fuerte, no el más débil.
  const r = contratosSinMueble(dosSedes(), { "TERRON-IMP-17": vendido() });
  assert.equal(r.length, 1);
  assert.equal(r[0].sede, "", "no se inventa una sede que no está cargada");
  assert.equal(r[0].code, "TERRON-IMP-17");
});

prueba("un mapa vacío no reporta nada", () => {
  assert.deepEqual(contratosSinMueble(dosSedes(), {}), []);
});

prueba("un plano que no es un arreglo no rompe la cuenta", () => {
  const planos = { "NAVE": null, "CIUDAD JARDIN": [mueble("IMP-17")] };
  const r = contratosSinMueble(planos, {
    "NAVE-IMP-17": vendido(), "CIUDAD JARDIN-IMP-17": vendido(),
  });
  assert.deepEqual(r.map((x) => x.espacio), ["NAVE-IMP-17"]);
});

prueba("la plata viaja tal como la mandó el servidor", () => {
  // Para un mercaderista el servidor manda 0, y acá no se inventa nada.
  const r = contratosSinMueble(dosSedes(), {
    "NAVE-PUN-01": vendido({ negotiatedValue: 0 }),
  });
  assert.equal(r[0].negotiatedValue, 0);
});

// ─── El espejo con el servidor ───────────────────────────────────────────────

/* `espaciosOfrecidos` acá y `espacios_ofrecidos` en el servidor tienen que
   contestar lo mismo: el primero decide qué se AVISA en la pantalla y el
   segundo qué se FRENA al guardar. Si se separan, el aviso y el guardarraíl
   dejan de hablar del mismo conjunto — y la forma en que eso se nota es la
   peor: alguien borra un mueble, el servidor lo deja pasar porque cree que su
   espacio ya no se ofrecía, y el contrato se vuelve invisible.

   No se puede correr el Python desde acá, así que se afirma que las tres
   decisiones siguen escritas en los dos lados. Es poco, y es más que nada. */
import { readFileSync, readdirSync } from "node:fs";
import { relative } from "node:path";
const servidor = readFileSync(
  join(aqui, "..", "..", "backend", "app", "services", "layout_lookup.py"), "utf8",
);

prueba("el servidor sigue saltándose lo no comercializable", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.ok(m, "no se encontró `espacios_ofrecidos` en el servidor");
  assert.match(m[0], /es_comercializable\(fixture\)/,
    "el servidor dejó de mirar si el mueble se alquila: un mueble marcado no " +
    "comercializable volvería a poder sacarse del plano con un contrato vivo");
});

prueba("el servidor sigue contando la cara B como un espacio aparte, con `caras_de`", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.match(m[0], /if caras_de\(fixture\) == 2:\s*\n\s*ofrecidos\.add\(f"\{completo\}-B"\)/,
    "el servidor dejó de preguntarle a `caras_de` si el mueble tiene cara B");
});

// ─── Una sola regla de caras ─────────────────────────────────────────────────

/* «¿Esta góndola tiene cara B?» tuvo dos respuestas: Vender contaba como doble
   la góndola sin `gondolaType` y la fusión, esta auditoría y el servidor
   exigían `"double"` escrito. La cara B de una góndola vieja se vendía, el
   plano no la pintaba vendida, borrar la góndola no frenaba y «Para revisar»
   la daba por contrato sin mueble. Ahora la respuesta es `carasDe` acá y
   `caras_de` en el servidor, y los dos corren los MISMOS casos
   (`scripts/casos/caras.json`; el servidor, en `tests/test_caras.py`). */
const { outputFiles: tipos } = await build({
  entryPoints: [join(aqui, "..", "src", "types", "fixtures.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
const salidaTipos = join(dirname(salida), "t.mjs");
writeFileSync(salidaTipos, tipos[0].text);
const { carasDe, isDoubleGondola } = await import(pathToFileURL(salidaTipos).href);
const { casos } = JSON.parse(readFileSync(join(aqui, "casos", "caras.json"), "utf8"));

prueba("`carasDe` contesta los casos que también corre el servidor", () => {
  assert.ok(casos.length >= 10, "faltan los casos compartidos");
  const mal = casos.filter((c) => carasDe(c.mueble) !== c.caras)
    .map((c) => `${c.por}: ${JSON.stringify(c.mueble)} → ${carasDe(c.mueble)}, se esperaba ${c.caras}`);
  assert.deepEqual(mal, []);
  for (const c of casos) assert.equal(isDoubleGondola(c.mueble), c.caras === 2, c.por);
});

/* Lo que dice el código, sin comentarios ni docstrings: los comentarios de la
   regla citan `"double"` al explicarla, y no son copias. */
const enBlanco = (m) => m.replace(/[^\n]/g, " "); // conserva las líneas: el aviso dice `archivo:línea`
const codigoTS = (t) => t.replace(/\/\*[\s\S]*?\*\//g, enBlanco).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const codigoPy = (t) => t.replace(/("""|''')[\s\S]*?\1/g, enBlanco).replace(/#.*$/gm, "");

/** ¿Este `"double"` PREGUNTA algo? Se deja pasar sólo lo que no pregunta: un
 *  tipo (`"double" | "wall"`), un valor que se asigna o se pasa (`= "double"`,
 *  `value="double"`, `?? "double"`, `c ? … : "double"`, `{ gondolaType:
 *  "double" }`) o el estado inicial de un `useState`. Todo lo demás —`===`,
 *  `["double"].includes(…)`, `case "double":`, `in ("double", None)`, un
 *  `Set`— es una comparación, y una comparación con "double" es la regla. */
const pregunta = (antes, despues) => !(
  /\|\s*$/.test(antes) || /^\s*\|/.test(despues)
  || /(?<![=!<>])=\s*$/.test(antes)
  || /\?\?\s*$/.test(antes)
  || /(?<!\?)\?\s*$/.test(antes) || /(?<!:):\s*$/.test(antes)
  || /useState(<[^>]*>)?\(\s*$/.test(antes)
);

const raizRepo = join(aqui, "..", "..");
/** Cada archivo de código de los dos lados, con su texto sin comentarios. */
const archivosDeCodigo = () => {
  const out = [];
  const recorrer = (dir, ext, limpiar) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__pycache__") recorrer(ruta, ext, limpiar); continue; }
      if (!ext.some((x) => e.name.endsWith(x))) continue;
      out.push({ rel: relative(raizRepo, ruta), codigo: limpiar(readFileSync(ruta, "utf8")) });
    }
  };
  recorrer(join(raizRepo, "frontend", "src"), [".ts", ".tsx"], codigoTS);
  recorrer(join(raizRepo, "backend", "app"), [".py"], codigoPy);
  recorrer(join(raizRepo, "backend", "scripts"), [".py"], codigoPy);
  return out;
};

/** Las líneas donde un `"double"` pregunta algo, como `archivo:línea`. */
const comparacionesConDouble = (archivos) => {
  const copias = [];
  for (const { rel, codigo } of archivos) {
    codigo.split("\n").forEach((l, k) => {
      const enLaLinea = [...l.matchAll(/["']double["']/g)]
        .some((m) => pregunta(l.slice(0, m.index), l.slice(m.index + m[0].length)));
      if (enLaLinea) copias.push(`${rel}:${k + 1}`);
    });
  }
  return copias;
};

prueba("la regla vive en DOS lugares, uno por lado, y en ningún otro", () => {
  // Una comparación con "double" fuera de `carasDe` / `caras_de` es otra copia
  // de la regla, y las copias se separan. Buscar sólo `=== "double"` no
  // alcanzaba: `["double"].includes(f.gondolaType)` en DashboardView traía de
  // vuelta la regla estricta —la que dejaba afuera la cara B de una góndola
  // vieja sin `gondolaType`— y todas las guardas pasaban.
  const copias = comparacionesConDouble(archivosDeCodigo());
  assert.deepEqual(copias.map((c) => c.replace(/:\d+$/, "")).sort(), [
    "backend/app/services/layout_lookup.py",
    "frontend/src/types/espacio.ts",
  ], `copias de la regla de la cara B:\n         ${copias.join("\n         ")}`);
  const py = servidor.match(/def caras_de[\s\S]*?\n(?=\S)/);
  assert.ok(py, "no se encontró `caras_de` en layout_lookup.py");
  assert.match(py[0], /variante == "double"/, "la comparación de layout_lookup.py no es la de `caras_de`");
});

prueba("la guarda de la regla ve las copias escritas de otra forma", () => {
  // Una guarda que deja pasar todo es peor que ninguna: cada forma de escribir
  // la regla tiene que saltar, y lo que no pregunta nada tiene que pasar.
  const ver = (rel, texto) => comparacionesConDouble([{ rel, codigo: rel.endsWith(".py") ? codigoPy(texto) : codigoTS(texto) }]);
  const copias = [
    'return f.gondolaType === "double";',
    'return "double" !== f.gondolaType;',
    'return ["double"].includes(f.gondolaType as string) || f.type === "gondola_doble";',
    'switch (f.gondolaType) { case "double": return 2; }',
    'const DOBLES = new Set(["double", undefined]);',
    'if (f.gondolaType?.startsWith("double")) return 2;',
    'const CARAS = { "double": 2, wall: 1 };',
  ];
  for (const c of copias) assert.equal(ver("x.ts", c).length, 1, `no ve la copia: ${c}`);
  for (const c of ['return 2 if f.get("gondolaType") in ("double", None) else 1', 'CARAS = {"double": 2, "wall": 1}']) {
    assert.equal(ver("x.py", c).length, 1, `no ve la copia: ${c}`);
  }
  const noPreguntan = [
    'export type GondolaType = "double" | "wall";',
    '  gondolaType = "double",',
    '<GondolaReal gondolaType={isWall ? "wall" : "double"} />',
    'gondolaType={fixture.gondolaType ?? "double"}',
    'if (item.type === "gondola_doble") { type = "gondola"; gondolaType = "double"; }',
    'const [tipo, setTipo] = useState<"double" | "wall">("double");',
    '<option value="double">góndola doble</option>',
    'const nueva = { type: "gondola", gondolaType: "double" };',
    '// la regla vieja exigía `=== "double"` escrito',
  ];
  for (const c of noPreguntan) assert.deepEqual(ver("x.tsx", c), [], `confunde con una copia: ${c}`);
  assert.deepEqual(ver("x.py", '"""Exigía ``== "double"`` escrito."""\nx = "double"'), [], "confunde un docstring con una copia");
});

prueba("quien pregunta por la cara B usa `carasDe` / `caras_de`, no una propia", () => {
  // La otra forma de copiar la regla es con el mismo nombre: sacar
  // `isDoubleGondola` del import de `types/fixtures` y definir una propia.
  // Vive en `types/espacio.ts` y `types/fixtures.ts` la reexporta: se puede
  // importar de cualquiera de los dos.
  const mal = [];
  for (const { rel, codigo } of archivosDeCodigo()) {
    if (rel.endsWith(".py")) {
      if (rel === "backend/app/services/layout_lookup.py") continue;
      if (/^\s*def caras_de\b/m.test(codigo)) mal.push(`${rel}: define su propia \`caras_de\``);
      const importa = [...codigo.matchAll(/from\s+app\.services\.layout_lookup\s+import\s+(\([^)]*\)|[^\n]*)/g)]
        .some((m) => /\bcaras_de\b/.test(m[1]));
      if (/(?<![.\w])caras_de\(/.test(codigo) && !importa) mal.push(`${rel}: llama a \`caras_de\` sin importarla de layout_lookup`);
      continue;
    }
    if (rel === "frontend/src/types/espacio.ts") continue;
    for (const nombre of ["carasDe", "isDoubleGondola"]) {
      if (new RegExp(`\\b(?:function|const|let|var)\\s+${nombre}\\b`).test(codigo)) mal.push(`${rel}: define su propia \`${nombre}\``);
      if (!new RegExp(`(?<![.\\w])${nombre}\\(`).test(codigo)) continue;
      const importa = [...codigo.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)]
        .some((m) => /(^|\/)types\/(fixtures|espacio)$/.test(m[2]) && new RegExp(`\\b${nombre}\\b`).test(m[1]));
      if (!importa) mal.push(`${rel}: llama a \`${nombre}\` sin importarla de types/espacio o types/fixtures`);
    }
  }
  assert.deepEqual(mal, []);
});

prueba("el servidor sigue armando el código con la sede", () => {
  const m = servidor.match(/def espacios_ofrecidos[\s\S]*?\n    return ofrecidos/);
  assert.match(m[0], /_full_code\(code, sede\)/,
    "el servidor dejó de usar `_full_code`: indexar por el código corto mezcla " +
    "tiendas, que es el bug original");
});

console.log(`\n${hechas} pruebas · el fantasma tiene nombre\n`);
