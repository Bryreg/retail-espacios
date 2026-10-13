/**
 * Pruebas del catálogo de muebles (`src/catalogo/muebles.json`).
 *   npm run probar:catalogo
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * El tipo de mueble estaba escrito a mano en unas veintidós tablas —el
 * catálogo del 3D y el del 2D, los altos y colores con que nace, los prefijos,
 * las tarifas, lo que no se alquila, los nombres de los informes…— y varias ya
 * no decían lo mismo. Ahora hay UN archivo y las tablas se calculan de él,
 * con el mismo nombre y el mismo orden. La promesa es doble:
 *
 *   · **Un plano viejo da exactamente lo mismo que antes.** Se corre la misma
 *     captura que anotó el «antes» (`capturarTS`, de `capturar-catalogo.mjs`)
 *     sobre el código de hoy y se compara contra `casos/catalogo-antes.json`.
 *     Cualquier diferencia falla, salvo las de `CAMBIOS_INTENCIONALES`, que
 *     están escritas acá una por una con su porqué y su valor de antes: si la
 *     referencia no tiene ese valor de antes, también falla.
 *   · **Las tablas salen del archivo, no de una copia.** Se compilan los
 *     módulos con un catálogo adulterado y cada tabla tiene que cambiar con él.
 *     Una tabla escrita a mano que hoy coincide pasaría la comparación de
 *     arriba; ésta no.
 *
 * Y el archivo se valida: prefijos únicos (los alias de la góndola comparten
 * el suyo), cada tipo con rótulos y tarifa o «nunca», medidas positivas, las
 * tres listas de orden completas, y los tipos de TypeScript y `carasDe`
 * diciendo lo mismo que el catálogo. La copia del servidor tiene que ser
 * idéntica byte a byte (también lo exige `tests/test_catalogo_muebles.py`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { armarPlano, capturarTS, TIPOS } from "./capturar-catalogo.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(p, "utf8");

const RUTA_CATALOGO = join(raiz, "src", "catalogo", "muebles.json");
const RUTA_COPIA = join(repo, "backend", "app", "catalogo", "muebles.json");
const CATALOGO = JSON.parse(leer(RUTA_CATALOGO));
const ANTES = JSON.parse(leer(join(aqui, "casos", "catalogo-antes.json")));

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

/** Un módulo de `src`, compilado con esbuild y corrido acá. Con `catalogo`,
 *  el `muebles.json` que importa es ése y no el del disco. */
const cargar = async (rel, catalogo) => {
  const r = await build({
    entryPoints: [join(raiz, rel)],
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: catalogo ? [{
      name: "catalogo-adulterado",
      setup(b) {
        b.onLoad({ filter: /[\\/]catalogo[\\/]muebles\.json$/ },
          () => ({ contents: JSON.stringify(catalogo), loader: "json" }));
      },
    }] : [],
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

// ═══════════════════════════════════════════════════════════════════════════
// 1 · EL ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════

const ALQUILABLE = ["si", "no_por_defecto", "nunca"];
const BANDERAS = ["producto", "prueba3D", "surtido", "frio", "formaCorrida"];
const CLAVES_DE_TIPO = new Set([
  "prefijo", "alquilable", "tarifa", "informe", "informePlural", "categoria", "grupo2D",
  "referencia", "banderas", "legado", "variantes",
  "rotuloEditor", "medidas", "color", "color2D", "emoji", "descripcion",
]);
const CLAVES_DE_FORMA = new Set(["caras", "rotuloEditor", "medidas", "color", "color2D", "emoji", "descripcion"]);
const COLOR = /^#[0-9a-f]{6}$/;
const texto = (x) => typeof x === "string" && x.trim().length > 0;
const positivo = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Lo que está mal en un catálogo, en palabras. Vacío es que está bien. */
function validar(cat) {
  const mal = [];
  const si = (cond, msj) => { if (!cond) mal.push(msj); };
  si(cat.version === 1, "`version` no es 1");
  si(Array.isArray(cat.leeme) && cat.leeme.every(texto), "`leeme` no es una lista de textos");
  si(/^[A-Z]{3}$/.test(cat.prefijoDesconocido ?? ""), "`prefijoDesconocido` no son tres mayúsculas");
  const tipos = cat.tipos ?? {};
  const claves = new Set(["version", "leeme", "prefijoDesconocido", "tipos", "alias", "tarifas", "orden"]);
  for (const k of Object.keys(cat)) si(claves.has(k), `clave desconocida \`${k}\` en el catálogo`);

  const tarifas = new Map((cat.tarifas ?? []).map((t) => [t.clave, t]));
  si((cat.tarifas ?? []).length === tarifas.size, "hay dos tarifas con la misma clave");
  for (const t of cat.tarifas ?? []) si(texto(t.clave) && texto(t.rotulo), `tarifa sin clave o sin rótulo: ${JSON.stringify(t)}`);

  /** La forma con que nace: rótulo, medidas, color, emoji y descripción. */
  const forma = (f, donde, { conCaras }) => {
    for (const k of Object.keys(f)) if (conCaras) si(CLAVES_DE_FORMA.has(k), `${donde}: clave desconocida \`${k}\``);
    si(texto(f.rotuloEditor), `${donde}: sin rótulo de editor`);
    si(f.medidas && ["w", "d", "h"].every((m) => positivo(f.medidas[m])), `${donde}: las medidas tienen que ser w, d y h positivas`);
    si(COLOR.test(f.color ?? ""), `${donde}: color inválido`);
    si(f.color2D === undefined || COLOR.test(f.color2D), `${donde}: color2D inválido`);
    si(texto(f.emoji), `${donde}: sin emoji`);
    si(texto(f.descripcion), `${donde}: sin descripción`);
    if (conCaras) si(f.caras === 1 || f.caras === 2, `${donde}: \`caras\` tiene que ser 1 o 2`);
  };

  const prefijos = new Map();
  for (const [t, d] of Object.entries(tipos)) {
    for (const k of Object.keys(d)) si(CLAVES_DE_TIPO.has(k), `${t}: clave desconocida \`${k}\``);
    si(/^[a-z][a-z0-9_]*$/.test(t), `${t}: la clave del tipo no es un slug`);
    si(/^[A-Z]{3}$/.test(d.prefijo ?? ""), `${t}: el prefijo no son tres mayúsculas`);
    if (prefijos.has(d.prefijo)) mal.push(`${t}: el prefijo ${d.prefijo} ya es de ${prefijos.get(d.prefijo)}`);
    prefijos.set(d.prefijo, t);
    si(d.prefijo !== cat.prefijoDesconocido, `${t}: usa el prefijo de lo desconocido`);
    si(ALQUILABLE.includes(d.alquilable), `${t}: \`alquilable\` no es si, no_por_defecto ni nunca`);
    si(Array.isArray(d.banderas) && d.banderas.every((b) => BANDERAS.includes(b))
      && new Set(d.banderas).size === d.banderas.length, `${t}: banderas inválidas`);
    si(d.referencia === undefined || (texto(d.referencia.corto) && texto(d.referencia.frase)), `${t}: referencia incompleta`);
    if (d.alquilable === "nunca") {
      si(d.tarifa === undefined, `${t}: no se vende nunca y tiene tarifa`);
    } else if (!d.legado) {
      si(texto(d.tarifa) && tarifas.has(d.tarifa), `${t}: se vende y no tiene una tarifa de \`tarifas\``);
      si(texto(d.informe) && texto(d.informePlural), `${t}: se vende y los informes no tienen cómo nombrarlo`);
      si(texto(d.categoria), `${t}: se vende y no tiene categoría`);
    }
    if (d.legado) {
      si(d.tarifa === undefined && d.variantes === undefined, `${t}: un legado no tiene tarifa ni variantes`);
      si(d.medidas === undefined || Object.values(d.medidas).every(positivo), `${t}: medidas no positivas`);
      continue;
    }
    si(texto(d.grupo2D), `${t}: sin grupo en la biblioteca del 2D`);
    if (d.variantes) {
      si(Object.keys(d.variantes).length > 0, `${t}: \`variantes\` vacío`);
      for (const k of CLAVES_DE_FORMA) si(d[k] === undefined, `${t}: \`${k}\` va en cada variante, no en el tipo`);
      for (const [v, f] of Object.entries(d.variantes)) forma(f, `${t}:${v}`, { conCaras: true });
    } else {
      forma(d, t, { conCaras: false });
    }
  }
  for (const t of tarifas.keys()) {
    si(Object.values(tipos).some((d) => d.tarifa === t), `la tarifa \`${t}\` no es de ningún tipo`);
  }
  // Lo que dicen los informes tiene que llevar a la fila de Tarifas de ESE
  // mueble. La sesión le dice a la dueña «dejar la tarifa cargada en
  // <nombre de informe>» y ella busca esas palabras en Tarifas: si están en el
  // rótulo de OTRO tipo y no en el suyo, carga la tarifa equivocada. Pasó:
  // «exhibición de piso» era la cruz en los informes y la estiba en Tarifas, e
  // «isla» llevaba a «Isla de congelados». Un nombre que no aparece en ningún
  // rótulo («stand de frutas») no confunde a nadie.
  for (const [t, d] of Object.entries(tipos)) {
    for (const nombre of [d.informe, d.informePlural].filter(texto)) {
      const n = nombre.toLowerCase();
      const conEsasPalabras = (cat.tarifas ?? [])
        .filter((x) => (x.rotulo ?? "").toLowerCase().includes(n)).map((x) => x.clave);
      si(!conEsasPalabras.length || conEsasPalabras.includes(d.tarifa),
        `${t}: los informes lo llaman «${nombre}» y en Tarifas eso es \`${conEsasPalabras.join("`, `")}\``);
    }
  }

  for (const [a, x] of Object.entries(cat.alias ?? {})) {
    si(!(a in tipos), `alias \`${a}\`: ya es un tipo`);
    si(tipos[x.tipo]?.variantes?.[x.variante] !== undefined, `alias \`${a}\`: no es una variante de un tipo`);
    si(Array.isArray(x.banderas) && x.banderas.every((b) => BANDERAS.includes(b)), `alias \`${a}\`: banderas inválidas`);
  }

  // Las tres listas de orden: completas y sin repetidos.
  const formas3D = [];
  const formas2D = [];
  for (const [t, d] of Object.entries(tipos)) {
    if (d.legado) continue;
    if (d.variantes) {
      for (const v of Object.keys(d.variantes)) {
        formas3D.push(`${t}:${v}`);
        const alias = Object.entries(cat.alias ?? {}).find(([, x]) => x.tipo === t && x.variante === v)?.[0];
        formas2D.push(alias ?? `(${t}:${v} no tiene nombre en el 2D)`);
      }
    } else {
      formas3D.push(t);
      formas2D.push(t);
    }
  }
  const mismaLista = (nombre, lista, esperada) => {
    const l = lista ?? [];
    si(new Set(l).size === l.length, `\`orden.${nombre}\` repite una entrada`);
    const sobran = l.filter((x) => !esperada.includes(x));
    const faltan = esperada.filter((x) => !l.includes(x));
    si(!sobran.length && !faltan.length,
      `\`orden.${nombre}\`: ${faltan.length ? `faltan ${faltan.join(", ")}` : ""}${sobran.length ? ` sobran ${sobran.join(", ")}` : ""}`);
  };
  mismaLista("editor3D", cat.orden?.editor3D, formas3D);
  mismaLista("plano2D", cat.orden?.plano2D, formas2D);
  mismaLista("minimapa", cat.orden?.minimapa,
    Object.entries(tipos).filter(([, d]) => d.referencia).map(([t]) => t));
  return mal;
}

await prueba("el catálogo es válido", () => {
  const mal = validar(CATALOGO);
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
});

await prueba("la validación rechaza lo que tiene que rechazar", () => {
  // Una validación que deja pasar todo es peor que ninguna: se rompe a
  // propósito un catálogo por cada regla y tiene que quejarse.
  const roto = (cambiar) => { const c = structuredClone(CATALOGO); cambiar(c); return validar(c); };
  const casos = [
    // Cuál de los dos se queja depende del orden de las claves: cualquiera vale.
    ["un prefijo repetido", (c) => { c.tipos.punta.prefijo = "GON"; }, /(gondola|punta): el prefijo GON ya es de (punta|gondola)/],
    ["un tipo que se vende sin tarifa", (c) => { delete c.tipos.batea.tarifa; }, /batea: se vende y no tiene una tarifa/],
    ["un tipo que no se vende con tarifa", (c) => { c.tipos.checkout.tarifa = "checkout"; }, /checkout: no se vende nunca y tiene tarifa/],
    ["un tipo que se vende sin nombre de informe", (c) => { delete c.tipos.ristra.informePlural; }, /ristra: se vende y los informes/],
    ["una medida en cero", (c) => { c.tipos.batea.medidas.h = 0; }, /batea: las medidas/],
    ["una medida negativa en una variante", (c) => { c.tipos.gondola.variantes.wall.medidas.d = -0.4; }, /gondola:wall: las medidas/],
    ["un tipo fuera de la paleta del 3D", (c) => { c.orden.editor3D = c.orden.editor3D.filter((t) => t !== "robatope"); },
      /orden\.editor3D`: faltan robatope/],
    ["un alias a una variante que no existe", (c) => { c.alias.gondola_mural.variante = "isla"; }, /gondola_mural`: no es una variante/],
    ["una clave mal escrita", (c) => { c.tipos.punta.prefjio = "PUN"; }, /clave desconocida `prefjio`/],
    ["un nombre de informe que en Tarifas es otro mueble", (c) => { c.tipos.cross.informe = "exhibición de piso"; },
      /cross: los informes lo llaman «exhibición de piso» y en Tarifas eso es `isla`/],
    ["un nombre de informe que lleva a otra fila de Tarifas", (c) => { c.tipos.isla.informe = "isla"; },
      /isla: los informes lo llaman «isla» y en Tarifas eso es `isla_fria`/],
  ];
  for (const [que, cambiar, motivo] of casos) {
    const mal = roto(cambiar);
    assert.ok(mal.some((m) => motivo.test(m)), `no se queja de ${que}: ${JSON.stringify(mal)}`);
  }
});

await prueba("la copia del servidor es idéntica byte a byte", () => {
  // La imagen de Docker lleva `backend/` y `frontend/dist`: el servidor no ve
  // `src/`, así que tiene su copia. Separadas, el servidor renumera, cobra y
  // decide qué se vende con otro catálogo que el de la pantalla.
  assert.ok(readFileSync(RUTA_CATALOGO).equals(readFileSync(RUTA_COPIA)),
    "backend/app/catalogo/muebles.json no es igual a frontend/src/catalogo/muebles.json: copiá el que cambiaste sobre el otro");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · LOS TIPOS DE TYPESCRIPT Y LA REGLA DE LAS CARAS
// ═══════════════════════════════════════════════════════════════════════════

const F = await cargar("src/types/fixtures.ts");

/** Los miembros de un `export type X = "a" | "b" | …;`: es un tipo, no corre. */
const unionDe = (rel, nombre) => {
  const m = new RegExp(`export type ${nombre} =([^;]*);`).exec(leer(join(raiz, rel)));
  assert.ok(m, `no se encontró \`${nombre}\` en ${rel}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
};

await prueba("los tipos de TypeScript son los del catálogo", () => {
  const tipos = Object.keys(CATALOGO.tipos);
  assert.deepEqual(unionDe("src/types/fixtures.ts", "FixType"), [...tipos].sort(),
    "`FixType` no tiene los mismos tipos que el catálogo");
  const legados = tipos.filter((t) => CATALOGO.tipos[t].legado);
  assert.deepEqual(unionDe("src/utils/convertirPlano.ts", "FixType2D"), [...CATALOGO.orden.plano2D, ...legados].sort(),
    "`FixType2D` no es la biblioteca del 2D más los legados");
  const variantes = new Set(Object.values(CATALOGO.tipos).flatMap((d) => Object.keys(d.variantes ?? {})));
  assert.deepEqual(unionDe("src/types/fixtures.ts", "GondolaType"), [...variantes].sort(),
    "`GondolaType` no son las variantes del catálogo");
});

await prueba("`carasDe` dice lo mismo que el catálogo", () => {
  // La regla de la cara B es código (`carasDe`, con sus casos compartidos en
  // `casos/caras.json`); el catálogo anota cuántas caras tiene cada variante.
  // Si dicen otra cosa, uno de los dos miente.
  for (const [t, d] of Object.entries(CATALOGO.tipos)) {
    if (!d.variantes) { assert.equal(F.carasDe({ type: t }), 1, `${t} tiene cara B`); continue; }
    for (const [v, f] of Object.entries(d.variantes)) {
      assert.equal(F.carasDe({ type: t, gondolaType: v }), f.caras, `${t}:${v}`);
    }
  }
  for (const [a, x] of Object.entries(CATALOGO.alias)) {
    assert.equal(F.carasDe({ type: a }), CATALOGO.tipos[x.tipo].variantes[x.variante].caras, a);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · LAS TABLAS SALEN DEL ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════

await prueba("cada tabla cambia cuando cambia el catálogo", async () => {
  const c = structuredClone(CATALOGO);
  const p = c.tipos.punta;
  Object.assign(p, {
    prefijo: "PNX", rotuloEditor: "Punta adulterada", medidas: { w: 0.91, d: 0.41, h: 1.77 },
    color: "#010203", emoji: "X", descripcion: "adulterada", grupo2D: "Grupo adulterado",
    categoria: "Familia adulterada", informe: "puntica", informePlural: "punticas",
    banderas: ["frio", "formaCorrida"], referencia: { corto: "Puntas", frase: "las puntas" },
  });
  c.tipos.metro.alquilable = "nunca";
  c.tipos.batea.alquilable = "no_por_defecto";
  c.tipos.isla.tarifa = "estiba";
  c.tarifas.push({ clave: "estiba", rotulo: "Estiba adulterada" });
  c.tipos.nevera_carnes.color2D = "#0a0b0c";
  c.tipos.exhibicion.medidas.h = 1.23;
  c.tipos.exhibicion.color = "#abcdef";
  c.tipos.gondola.variantes.wall.medidas.h = 2.22;
  c.alias.gondola_mural.banderas.push("producto");
  c.prefijoDesconocido = "ZZZ";
  // Al revés: lo primero pasa a ser lo que hoy es último, sea cual sea.
  const ultimo3D = c.orden.editor3D.at(-1).split(":")[0];
  const ultimo2D = c.orden.plano2D.at(-1);
  c.orden.editor3D.reverse();
  c.orden.plano2D.reverse();
  c.orden.minimapa = ["punta", ...c.orden.minimapa];

  const [Fa, Na, FMTa, Pa, PASa, C3a, C2a, CMa] = await Promise.all([
    "src/types/fixtures.ts", "src/utils/nomenclatura.ts", "src/components/plataforma/formato.ts",
    "src/components/StoreEditor3D/muebles/producto.ts", "src/utils/pasillos.ts",
    "src/catalogo/editor3D.ts", "src/catalogo/plano2D.ts", "src/catalogo/minimapa.ts",
  ].map((rel) => cargar(rel, c)));

  // types/fixtures.ts
  assert.ok(Fa.NUNCA_ALQUILABLE.has("metro"), "NUNCA_ALQUILABLE no sale del catálogo");
  assert.ok(Fa.NON_RENTABLE_BY_DEFAULT.has("batea"), "NON_RENTABLE_BY_DEFAULT no sale del catálogo");
  assert.equal(Fa.rateTypeOf({ type: "isla" }), "estiba", "rateTypeOf no sale del catálogo");
  assert.equal(Fa.rateTypeOf({ type: "gondola_mural" }), "gondola", "rateTypeOf perdió los alias");
  assert.ok(Fa.RATE_TYPES.some((t) => t.type === "estiba" && t.label === "Estiba adulterada"), "RATE_TYPES no sale del catálogo");
  assert.equal(Fa.CATEGORIA_DE_TIPO.punta, "Familia adulterada", "CATEGORIA_DE_TIPO no sale del catálogo");
  // utils/nomenclatura.ts
  assert.equal(Na.PREFIJO_POR_TIPO.punta, "PNX", "PREFIJO_POR_TIPO no sale del catálogo");
  assert.equal(Na.siguienteCodigo("punta", []), "PNX-01");
  assert.equal(Na.prefijoDe("nada"), "ZZZ", "el prefijo de lo desconocido no sale del catálogo");
  // plataforma/formato.ts
  assert.equal(FMTa.tipoN("punta"), "puntica", "los nombres de los informes no salen del catálogo");
  assert.equal(FMTa.tipoP("punta", 2), "punticas");
  assert.equal(FMTa.tipoN("fuera_del_plano"), "fuera del plano", "se perdió `fuera_del_plano`");
  // muebles/producto.ts y utils/pasillos.ts
  assert.ok(Pa.MUEBLES_FRIOS.has("punta"), "MUEBLES_FRIOS no sale del catálogo");
  assert.ok(PASa.FORMAN_CORRIDA.has("punta"), "FORMAN_CORRIDA no sale del catálogo");
  // catalogo/editor3D.ts
  assert.equal(C3a.FIXTURE_DEFS[0].type, ultimo3D, "FIXTURE_DEFS no sigue `orden.editor3D`");
  assert.deepEqual(C3a.FIXTURE_DEFS.find((d) => d.type === "punta"), {
    type: "punta", label: "Punta adulterada", w: 0.91, d: 0.41, h: 1.77,
    color: "#010203", emoji: "X", desc: "adulterada", code: "PNX",
  }, "FIXTURE_DEFS no sale del catálogo");
  assert.equal(C3a.FIXTURE_DEFS.find((d) => d.gondolaType === "wall").h, 2.22, "las variantes no salen del catálogo");
  assert.ok(C3a.TIPOS_CON_PRODUCTO.has("gondola_mural") && !C3a.TIPOS_CON_PRODUCTO.has("punta"), "TIPOS_CON_PRODUCTO no sale del catálogo");
  assert.ok(!C3a.TIPOS_CON_PRUEBA_3D.has("punta"), "TIPOS_CON_PRUEBA_3D no sale del catálogo");
  assert.ok(!C3a.TIPOS_CON_SURTIDO.has("punta"), "TIPOS_CON_SURTIDO no sale del catálogo");
  // catalogo/plano2D.ts
  assert.equal(C2a.CATALOG[0].type, ultimo2D, "CATALOG no sigue `orden.plano2D`");
  assert.deepEqual(C2a.CATALOG.find((x) => x.type === "punta"), {
    type: "punta", label: "Punta adulterada", w: 0.91, h: 0.41, emoji: "X", prefix: "PNX", category: "Grupo adulterado",
  }, "CATALOG no sale del catálogo");
  assert.equal(C2a.H_DEFAULTS.punta, 1.77, "H_DEFAULTS no sale del catálogo");
  assert.equal(C2a.H_DEFAULTS.gondola_mural, 2.22, "H_DEFAULTS no sigue a la variante del alias");
  assert.equal(C2a.H_DEFAULTS.exhibicion, 1.23, "H_DEFAULTS no sigue al legado");
  assert.equal(C2a.COLOR_DEFAULTS.punta, "#010203", "COLOR_DEFAULTS no sale del catálogo");
  assert.equal(C2a.COLOR_DEFAULTS.nevera_carnes, "#0a0b0c", "COLOR_DEFAULTS no usa `color2D`");
  assert.equal(C2a.COLOR_DEFAULTS.exhibicion, "#abcdef", "COLOR_DEFAULTS no sigue al legado");
  // catalogo/minimapa.ts
  assert.equal(Object.keys(CMa.REFERENCIAS)[0], "punta", "REFERENCIAS no sigue `orden.minimapa`");
  assert.deepEqual(CMa.REFERENCIAS.punta, { corto: "Puntas", frase: "las puntas" }, "REFERENCIAS no sale del catálogo");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b · EL CATÁLOGO VIAJA SÓLO DONDE SE USA
// ═══════════════════════════════════════════════════════════════════════════

/** El grafo de lo que se baja: `src/main.tsx` empaquetado como lo parte el
 *  build, con cada `import()` (las pantallas de adentro, `React.lazy`) en su
 *  pedazo. Lo que no es código se reemplaza por nada. */
const vacio = {
  name: "vacio",
  setup(b) {
    b.onResolve({ filter: /\?(raw|worker|url|inline)$/ }, (a) => ({ path: a.path, namespace: "vacio" }));
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({ contents: "export default ''", loader: "js" }));
  },
};
const conCatalogo = (inputs) => Object.entries(inputs)
  .some(([m, x]) => /catalogo[\\/]muebles\.json$/.test(m) && x.bytesInOutput > 0);

await prueba("el catálogo no viaja en lo primero que baja la landing", async () => {
  // El catálogo trae descripciones, emojis, medidas y rótulos que sólo usan los
  // editores, que se cargan aparte. Entró en el pedazo de entrada —el que baja
  // todo visitante anónimo, y lo que más pesa en el LCP de la landing— porque
  // la fusión con la base (`estadoComercial.ts`, que va de entrada) le pedía
  // `carasDe` y `fullSpaceCode` a `types/fixtures.ts`, que calcula sus tablas
  // del catálogo. Ahora salen de `types/espacio.ts`, que no importa nada.
  const r = await build({
    entryPoints: [join(raiz, "src", "main.tsx")], bundle: true, write: false, splitting: true,
    format: "esm", outdir: join(raiz, ".probar-catalogo"), metafile: true, logLevel: "silent", plugins: [vacio],
    loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".jpg": "empty", ".webp": "empty", ".woff2": "empty", ".md": "text" },
  });
  const salidas = r.metafile.outputs;
  const entrada = Object.keys(salidas).find((k) => salidas[k].entryPoint?.endsWith("src/main.tsx"));
  assert.ok(entrada, "no se encontró la salida de `src/main.tsx`");
  const deEntrada = new Set();
  const seguir = (k) => {
    if (deEntrada.has(k)) return;
    deEntrada.add(k);
    for (const i of salidas[k].imports) if (i.kind === "import-statement") seguir(i.path);
  };
  seguir(entrada);
  const mal = [...deEntrada].filter((k) => conCatalogo(salidas[k].inputs));
  assert.deepEqual(mal, [], "el catálogo de muebles entra en lo que se baja de entrada");
  const tarde = Object.keys(salidas).filter((k) => !deEntrada.has(k));
  assert.ok(tarde.some((k) => conCatalogo(salidas[k].inputs)), "el catálogo no aparece en ningún pedazo: la prueba no está mirando lo que cree");
});

await prueba("el catálogo no viaja en el worker del recorte", async () => {
  // El worker importa `muebles/producto.ts` por `empaqueDeArte` y nunca mira el
  // frío; `MUEBLES_FRIOS` lleva las marcas `@__PURE__` para que el empaquetador
  // pueda dejar afuera la tabla y, con ella, el catálogo.
  const r = await build({
    entryPoints: [join(raiz, "src", "components", "StoreEditor3D", "muebles", "recorte.worker.ts")],
    bundle: true, write: false, format: "esm", platform: "browser", metafile: true, logLevel: "silent",
    outdir: join(raiz, ".probar-catalogo"), treeShaking: true,
  });
  const [salida] = Object.values(r.metafile.outputs);
  assert.ok(!conCatalogo(salida.inputs), "el worker del recorte se lleva el catálogo de muebles");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · UN PLANO VIEJO DA LO MISMO QUE ANTES
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que no estaba (o ya no está). */
const AUSENTE = Symbol("ausente");

/**
 * Lo que el catálogo cambió A PROPÓSITO respecto de `catalogo-antes.json`.
 * Cada ruta es dentro de la parte `ts`; `[clave=valor]` elige el elemento de
 * una lista. El primer valor es el de antes —tiene que ser el que dice la
 * referencia—, el segundo el de ahora. Todo lo demás tiene que dar igual.
 *
 * Ninguno toca lo guardado: las medidas, el alto y el color con que nace un
 * mueble se usan al crearlo, y los rótulos de tarifa y de informe no se
 * guardan. Los rótulos que el 2D estampa en `label` no cambian.
 */
const CAMBIOS_INTENCIONALES = [
  {
    porque: "El mostrador de carnes que se dibuja en el 2D nace con el fondo del 3D: 0,90 (era 0,85).",
    cambios: [
      ["tablas.CATALOG_2D.valor[type=nevera_carnes].h", 0.85, 0.9],
      ["nace_en_2D.valor.nevera_carnes.d", 0.85, 0.9],
    ],
  },
  {
    porque: "El servicio al cliente dibujado en el 2D nace con el alto del 3D (1,10) y su color: no estaba en las tablas del 2D y caía en 1,80 y en el color de la góndola.",
    cambios: [
      ["tablas.H_DEFAULTS_2D.valor.servicio_cliente", AUSENTE, 1.1],
      ["tablas.COLOR_DEFAULTS_2D.valor.servicio_cliente", AUSENTE, "#0ea5e9"],
      ["nace_en_2D.valor.servicio_cliente.h", 1.8, 1.1],
      ["nace_en_2D.valor.servicio_cliente.color", "#6366f1", "#0ea5e9"],
    ],
  },
  {
    porque: "Los colores del 2D tenían `nevera_mural`, un tipo que no existe.",
    cambios: [
      ["tablas.COLOR_DEFAULTS_2D.valor.nevera_mural", "#06b6d4", AUSENTE],
    ],
  },
  {
    porque: "Los informes nombran la vitrina, la zona libre y el impulsador (salían «mueble», «metro» e «impulsadors»). La ristra entra al diccionario y se sigue llamando igual.",
    cambios: [
      ["tablas.nombres_de_informe.valor.mueble", { singular: "mueble", plural: "muebles" }, { singular: "vitrina", plural: "vitrinas" }],
      ["tablas.nombres_de_informe.valor.metro", { singular: "metro", plural: "metros" }, { singular: "zona libre", plural: "zonas libres" }],
      ["tablas.nombres_de_informe.valor.impulsador.plural", "impulsadors", "impulsadores"],
      ["por_tipo.mueble.informe", { singular: "mueble", plural: "muebles" }, { singular: "vitrina", plural: "vitrinas" }],
      ["por_tipo.metro.informe", { singular: "metro", plural: "metros" }, { singular: "zona libre", plural: "zonas libres" }],
      ["por_tipo.impulsador.informe.plural", "impulsadors", "impulsadores"],
    ],
  },
  {
    porque: "Las tarifas de la isla y de la cruz se cruzaban con los nombres de los muebles: la `isla` es la estiba de piso y la `cross` el exhibidor en cruz. Las claves no cambian.",
    cambios: [
      ["tablas.RATE_TYPES.valor[type=isla].label", "Isla", "Estiba (exhibición de piso)"],
      ["tablas.RATE_TYPES.valor[type=cross].label", "Exhibición de piso", "Exhibidor cruz"],
      ["por_tipo.isla.rateTypeLabel", "Isla", "Estiba (exhibición de piso)"],
      ["por_tipo.cross.rateTypeLabel", "Exhibición de piso", "Exhibidor cruz"],
    ],
  },
  {
    porque: "Los informes nombran la cruz y la estiba como Tarifas (plan §1.4.3: los nombres nuevos van en el rótulo, el informe y la tarifa). Con sólo las tarifas renombradas, «exhibición de piso» era la cruz en los informes y la estiba en Tarifas, y la sesión mandaba a cargar la tarifa en la fila de otro mueble; «isla» llevaba a «Isla de congelados».",
    cambios: [
      ["tablas.nombres_de_informe.valor.cross", { singular: "exhibición de piso", plural: "exhibiciones de piso" }, { singular: "exhibidor cruz", plural: "exhibidores cruz" }],
      ["tablas.nombres_de_informe.valor.isla", { singular: "isla", plural: "islas" }, { singular: "estiba", plural: "estibas" }],
      ["por_tipo.cross.informe", { singular: "exhibición de piso", plural: "exhibiciones de piso" }, { singular: "exhibidor cruz", plural: "exhibidores cruz" }],
      ["por_tipo.isla.informe", { singular: "isla", plural: "islas" }, { singular: "estiba", plural: "estibas" }],
    ],
  },
];

/**
 * Las tablas que se comparan sin mirar el orden. Los conjuntos se consultan
 * con `.has`, y estos diccionarios por clave: ningún código los recorre, así
 * que el orden en que salen del catálogo no se ve. Las listas que SÍ se
 * recorren —`FIXTURE_DEFS` (`/taller` elige por posición), `CATALOG`,
 * `RATE_TYPES`, `REFERENCIAS` (ante dos etiquetas que chocan gana la
 * primera)— y `PREFIJO_POR_TIPO` se comparan con su orden.
 */
const SIN_ORDEN = {
  conjuntos: ["NUNCA_ALQUILABLE", "NON_RENTABLE_BY_DEFAULT", "TIPOS_CON_PRODUCTO", "TIPOS_CON_PRUEBA_3D",
    "TIPOS_CON_SURTIDO", "MUEBLES_FRIOS", "FORMAN_CORRIDA"],
  diccionarios: ["H_DEFAULTS_2D", "COLOR_DEFAULTS_2D", "CATEGORIA_DE_TIPO"],
};

/** `a.b[k=v].c` → pasos. */
const pasos = (ruta) => [...ruta.matchAll(/([^.[\]]+)|\[([^=\]]+)=([^\]]+)\]/g)]
  .map((m) => (m[1] !== undefined ? { clave: m[1] } : { campo: m[2], valor: m[3] }));

/** El contenedor y la clave final de una ruta. */
function ubicar(raizObj, ruta) {
  const ps = pasos(ruta);
  let actual = raizObj;
  for (const p of ps.slice(0, -1)) {
    if (p.clave !== undefined) actual = actual?.[p.clave];
    else {
      const hallados = (actual ?? []).filter((x) => String(x?.[p.campo]) === p.valor);
      if (hallados.length !== 1) throw new Error(`${ruta}: [${p.campo}=${p.valor}] elige ${hallados.length} elementos`);
      actual = hallados[0];
    }
    if (actual === undefined) throw new Error(`${ruta}: la ruta no existe en la referencia`);
  }
  return { donde: actual, clave: ps[ps.length - 1].clave };
}

const leerRuta = (obj, ruta) => {
  const { donde, clave } = ubicar(obj, ruta);
  return Object.prototype.hasOwnProperty.call(donde, clave) ? donde[clave] : AUSENTE;
};
const escribirRuta = (obj, ruta, valor) => {
  const { donde, clave } = ubicar(obj, ruta);
  if (valor === AUSENTE) delete donde[clave]; else donde[clave] = structuredClone(valor);
};

const mostrar = (v) => (v === AUSENTE ? "(no está)" : JSON.stringify(v)?.slice(0, 160));

/** Las tablas sin orden, ordenadas igual de los dos lados. */
function sinOrden(ts) {
  const out = structuredClone(ts);
  for (const n of SIN_ORDEN.conjuntos) out.tablas[n].valor = [...out.tablas[n].valor].sort();
  for (const n of SIN_ORDEN.diccionarios) {
    const v = out.tablas[n].valor;
    out.tablas[n].valor = Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
  }
  return out;
}

/** Todas las diferencias entre dos valores JSON, con su ruta. El orden de las
 *  claves cuenta: lo que no tiene orden ya pasó por `sinOrden`. */
function diferencias(a, b, ruta = "", out = []) {
  if (Object.is(a, b)) return out;
  const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push({ ruta, antes: a, ahora: b });
    else a.forEach((x, i) => diferencias(x, b[i], `${ruta}[${i}]`, out));
  } else if (esObjeto(a) && esObjeto(b)) {
    const n = out.length;
    const sub = (k) => (ruta ? `${ruta}.${k}` : k);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out.push({ ruta: sub(k), antes: a[k], ahora: AUSENTE });
      else if (!(k in a)) out.push({ ruta: sub(k), antes: AUSENTE, ahora: b[k] });
      else diferencias(a[k], b[k], sub(k), out);
    }
    if (out.length === n && Object.keys(a).join("|") !== Object.keys(b).join("|")) {
      out.push({ ruta: ruta + " (orden de las claves)", antes: Object.keys(a), ahora: Object.keys(b) });
    }
  } else {
    out.push({ ruta, antes: a, ahora: b });
  }
  return out;
}

await prueba("la lista de cambios intencionales es fiel a la referencia", () => {
  // Cada cambio dice qué había antes. Si la referencia dice otra cosa, la
  // lista está mal escrita o alguien recapturó la referencia con el código
  // nuevo (y entonces ya no compara nada).
  for (const { cambios } of CAMBIOS_INTENCIONALES) {
    for (const [ruta, antes] of cambios) {
      assert.deepEqual(leerRuta(ANTES.ts, ruta), antes, `${ruta}: la referencia no dice ${mostrar(antes)}`);
    }
  }
});

await prueba("el plano sintético se arma igual que cuando se capturó", () => {
  assert.deepEqual(TIPOS, ANTES.tipos, "los tipos que se consultan no son los de la referencia");
  assert.deepEqual(JSON.parse(JSON.stringify(armarPlano())), ANTES.plano.muebles,
    "el plano sintético cambió: las medidas, colores o rótulos con que nace un mueble del 3D no son los de antes");
});

await prueba("un plano viejo da lo mismo que antes, salvo los cambios escritos", () => {
  const esperado = structuredClone(ANTES.ts);
  for (const { cambios } of CAMBIOS_INTENCIONALES) {
    for (const [ruta, , ahora] of cambios) escribirRuta(esperado, ruta, ahora);
  }
  const ahora = JSON.parse(JSON.stringify(capturarTS(ANTES.plano.muebles)));
  const difs = diferencias(sinOrden(esperado), sinOrden(ahora));
  assert.equal(difs.length, 0, `${difs.length} diferencia(s) que no están en CAMBIOS_INTENCIONALES:\n`
    + difs.slice(0, 15).map((d) => `${d.ruta}: antes ${mostrar(d.antes)} · ahora ${mostrar(d.ahora)}`).join("\n"));
});

console.log(`\n${hechas} pruebas del catálogo de muebles`);
