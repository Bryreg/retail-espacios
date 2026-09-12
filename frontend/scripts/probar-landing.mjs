/**
 * Pruebas de la landing pública (`src/pages/Landing/`).
 *   npm run probar:landing
 *
 * Tres cosas se comprueban, y las tres son guardarraíles de la Fase 9, no
 * decoración:
 *
 *  1. **La página se dibuja.** Se renderiza `<Landing />` de verdad con
 *     `react-dom/server` y se busca el texto del copy en la salida. Si alguien
 *     rompe un hook, borra un bloque o cambia una frase, esto lo dice acá y no
 *     en producción.
 *  2. **Es pública de verdad.** Ni una llamada a `/api/*`, ni un recurso
 *     externo, ni un dato de cliente real: el plano es MercaFresco, sembrado en
 *     `datos.ts`, y los proveedores son inventados.
 *  3. **No se derrama sobre la aplicación.** Todo `landing.css` cuelga de `.lp`
 *     (o del `html.lp-activa` que pinta el fondo). Los tokens de la landing se
 *     llaman igual que varios de `src/index.css`; si un selector se escapara,
 *     repintaría el tablero.
 *
 * También se verifica que three.js siga entrando SÓLO por el `import()`
 * perezoso de «Ver en 3D» — la spec pide que el bundle inicial de `/` no lo
 * lleve. La separación real del chunk la confirma el build del Verificador.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const dir = join(aqui, "..", "src", "pages", "Landing");
const leer = (f) => readFileSync(join(dir, f), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/* ── el DOM mínimo que pide el render (no hay navegador acá) ─────────────── */
const mq = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.window = {
  matchMedia: mq,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { pathname: "/", hash: "" },
  addEventListener() {},
  removeEventListener() {},
  scrollY: 0,
};
globalThis.document = {
  documentElement: { classList: { add() {}, remove() {} }, dataset: {} },
  addEventListener() {},
  removeEventListener() {},
};

/* ── se bundlea la landing; `Vista3D` (el chunk de three.js) queda afuera ── */
const sinCssNiTres = {
  name: "sin-css-ni-tres",
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: "vacio" }));
    b.onResolve({ filter: /\.\/Vista3D$/ }, (a) => ({ path: a.path, namespace: "vacio" }));
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({
      contents: "export default function Vacio(){ return null; }", loader: "js",
    }));
  },
};

const { outputFiles } = await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import { createElement } from "react";
      import Landing from "../src/pages/Landing/Landing";
      import * as datos from "../src/pages/Landing/datos";
      export const html = renderToStaticMarkup(createElement(Landing));
      export const D = datos;
    `,
    resolveDir: aqui,
    loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", write: false,
  jsx: "automatic", plugins: [sinCssNiTres], logLevel: "silent",
  // `react-dom/server` es CommonJS y pide `stream`: sin este puente, el bundle
  // ESM se cae con «Dynamic require of "stream" is not supported».
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
const salida = join(mkdtempSync(join(tmpdir(), "landing-")), "landing.mjs");
writeFileSync(salida, outputFiles[0].text);
const { html, D } = await import(pathToFileURL(salida).href);

console.log("\nlanding · datos de ejemplo");

prueba("16 espacios alquilables, 10 en CENTRO y 6 en PALMAS", () => {
  assert.equal(D.ALQUILABLES.length, 16);
  assert.equal(D.ALQUILABLES.filter((p) => p.sede === "CENTRO").length, 10);
  assert.equal(D.ALQUILABLES.filter((p) => p.sede === "PALMAS").length, 6);
});

prueba("la proporción de estados es la elegida: 7 libres, 3 que se liberan, 6 tomados", () => {
  const c = (e) => D.ALQUILABLES.filter((p) => p.e === e).length;
  assert.equal(c("libre"), 7);
  assert.equal(c("libera"), 3);
  assert.equal(c("tomado"), 6);
});

prueba("el gris es mayoría: más muebles de contexto que alquilables", () => {
  const resto = D.PIEZAS.filter((p) => p.e === "resto").length;
  assert.ok(resto > D.ALQUILABLES.length, `contexto ${resto} vs alquilables ${D.ALQUILABLES.length}`);
});

prueba("los prefijos son los del código real, sin inventar ninguno", () => {
  const validos = ["GON", "PUN", "EXP", "ISL", "CRS", "BEB", "FRU", "BAT", "CAJ", "SAC", "COL"];
  D.ALQUILABLES.forEach((p) => {
    const pre = p.code.slice(0, 3);
    assert.ok(validos.includes(pre), `prefijo desconocido: ${p.code}`);
  });
});

prueba("las dos caras de la misma góndola pueden tener estados distintos", () => {
  const a = D.ALQUILABLES.find((p) => p.code === "GON-04·A");
  const b = D.ALQUILABLES.find((p) => p.code === "GON-04·B");
  assert.ok(a && b, "faltan las dos caras de GON-04");
  assert.notEqual(a.e, b.e);
});

prueba("cada espacio con proveedor lleva plata y fecha; los libres, tarifa", () => {
  D.ALQUILABLES.forEach((p) => {
    if (p.e === "libre") {
      assert.ok(p.tarifa, `${p.code} sin tarifa de referencia`);
      assert.ok(!p.prov, `${p.code} está libre y tiene proveedor`);
    } else {
      assert.ok(p.prov && p.canon && p.fecha, `${p.code} incompleto`);
    }
  });
});

prueba("NINGÚN proveedor real, ninguna sede de un cliente real", () => {
  const inventados = new Set([
    "Lácteos Monteverde", "Bebidas Zafiro", "Galletas Doña Rita", "Café Alto Bosque",
    "Cárnicos San Isidro", "Aseo Rocío", "Confites Milagro", "Frutas del Ocaso",
  ]);
  D.ALQUILABLES.filter((p) => p.prov).forEach((p) => {
    assert.ok(inventados.has(p.prov), `proveedor fuera de la lista inventada: ${p.prov}`);
  });
  const prohibido = /galerias|gal[ée]r[íi]as|POBLADO|ciudad jard[íi]n|Alpina|Postob[óo]n|Nutresa|Colanta/i;
  const fuentes = ["datos.ts", "Landing.tsx", "PlanoIsometrico.tsx", "Vista3D.tsx"].map(leer).join("\n");
  assert.ok(!prohibido.test(fuentes), "hay un nombre de cliente o de marca real en la landing");
});

console.log("\nlanding · la página se dibuja con el copy");

const contiene = (t) => assert.ok(html.includes(t), `falta en la página: «${t.slice(0, 60)}»`);

prueba("el titular, la frase de qué es y el problema que resuelve", () => {
  contiene("Recabre cada metro.");
  contiene("Qué mueble está");
  contiene("RECABRA es el sistema con el que un supermercado administra y comercializa sus");
  contiene("deja de ser administrable.");
});

prueba("los dos CTA apuntan al login, y el de registro al ancla", () => {
  contiene('href="/login#registro"');
  contiene('href="/login"');
  contiene("Crear mi cuenta");
  contiene("Ya tengo cuenta");
});

prueba("las seis funciones, con la cuenta del plazo verificada", () => {
  contiene("El inventario como plano, no como lista de códigos");
  contiene("El contrato se registra sobre el mueble");
  contiene("Disponibilidad por temporada comercial");
  contiene("Tarifa de referencia y desviación");
  contiene("Notificaciones automáticas");
  contiene("Confirmación de montaje con evidencia fotográfica");
  contiene("$ 3.050.000");   // el total es la SUMA de lo acordado, no un prorrateo (fase 17)
});

prueba("los tres perfiles y las tres etapas de implementación", () => {
  contiene("Tres perfiles, tres vistas distintas del mismo sistema");
  contiene("Creación de la cuenta y del supermercado");
  contiene("Levantamiento del plano de cada sede");
  contiene("Comercialización sobre el plano");
});

/* Las secciones de ASESORÍA y de DATOS se quitaron de la landing por decisión
   del dueño (Fase 16). No alcanza con haberlas borrado: el copy de las dos
   vivía en `copy.md` y volver a pegarlo es exactamente el movimiento que hace
   una sesión futura que lee el documento y no el historial. Se afirma la
   ausencia, y con las frases que sólo existían ahí. */
prueba("la asesoría y el bloque de datos NO volvieron a la página", () => {
  const fuera = [
    "Además del sistema, le decimos qué proponer",
    "Recomendaciones ordenadas por lo que hay en juego",
    "Oportunidades espacio por espacio",
    "Tendencia mes a mes",
    "Dónde quedan sus datos",
    "Cada supermercado, en su propia base",
    "Puede auditar qué se mira de usted",
    "#asesoria",
    "#confianza",
  ];
  const colados = fuera.filter((f) => html.includes(f));
  assert.deepEqual(colados, [], "volvieron a la landing: " + colados.join(" · "));
});

prueba("el precio y el pie legal, con los [COMPLETAR] a la vista", () => {
  contiene("Ley 1581 de 2012");
  contiene("[COMPLETAR: precio]");
  contiene("[COMPLETAR: razón social]");
  contiene('href="/politica-datos"');
  contiene('href="/politica-datos#derechos"');
});

/* Quitar el bloque de datos NO puede llevarse el acceso a la política: es
   obligación de Ley 1581, y hasta la Fase 16 el enlace vivía en dos lugares.
   Ahora vive sólo en el pie, así que se afirma que el pie lo tiene. */
prueba("el enlace a la política sobrevive en el pie, que es su único lugar", () => {
  const pie = html.slice(html.indexOf("<footer"));
  assert.ok(pie.includes('href="/politica-datos"'),
    "el pie perdió el enlace a la Política de Tratamiento de Datos");
});

prueba("el plano se rotula como ejemplo, en texto visible", () => {
  contiene("Supermercado de ejemplo · Toque un mueble");
  contiene("Los datos del plano son ilustrativos");
  contiene("El plano de esta página corresponde a un supermercado ficticio");
});

prueba("la leyenda escribe los cuatro estados: el color nunca va solo", () => {
  contiene("Libre todo el periodo");
  contiene("Se libera en el periodo");
  contiene(">Tomado<");
  contiene("Resto de la sala");
});

prueba("la tabla equivalente trae los 16 espacios, con sus seis columnas", () => {
  ["Código", "Tipo", "Sede", "Estado", "Proveedor de ejemplo", "Canon mensual"]
    .forEach((c) => contiene("<th>" + c + "</th>"));
  D.ALQUILABLES.forEach((p) => contiene("<td>" + p.code + "</td>"));
});

prueba("accesibilidad: enlace de salto, un solo h1 y el plano descrito", () => {
  contiene('href="#contenido"');   // E llama "contenido" al <main>
  contiene("Plano interactivo de un supermercado de ejemplo");
  contiene("Plano isométrico de un supermercado de ejemplo");
  assert.equal((html.match(/<h1/g) || []).length, 1, "tiene que haber exactamente un h1");
});

console.log("\nlanding · es pública y no se derrama");

prueba("la página dibujada no trae ni una URL de /api/ ni un origen externo", () => {
  assert.ok(!html.includes("/api/"), "la landing renderizada nombra /api/");
  assert.ok(!/https?:\/\//.test(html), "la landing renderizada trae un enlace externo");
});

prueba("el código de la landing no llama al servidor ni importa el cliente HTTP", () => {
  const fuentes = ["datos.ts", "Landing.tsx", "PlanoIsometrico.tsx", "Vista3D.tsx"].map(leer).join("\n");
  assert.ok(!/\bfetch\s*\(/.test(fuentes), "hay un fetch en la landing");
  assert.ok(!/from\s+"[^"]*api\//.test(fuentes), "la landing importa algo de src/api");
  assert.ok(!/XMLHttpRequest|axios/.test(fuentes), "la landing arma una llamada HTTP");
});

prueba("three.js entra SÓLO por el import perezoso de «Ver en 3D»", () => {
  const plano = leer("PlanoIsometrico.tsx");
  assert.ok(/lazy\(\(\)\s*=>\s*import\("\.\/Vista3D"\)\)/.test(plano), "Vista3D no se carga con React.lazy");
  assert.ok(/await import\("\.\/Vista3D"\)/.test(plano), "el botón no dispara el import() dinámico");
  ["datos.ts", "Landing.tsx", "PlanoIsometrico.tsx"].forEach((f) => {
    assert.ok(!/from\s+"three"/.test(leer(f)), `${f} importa three.js fuera del chunk perezoso`);
  });
  assert.ok(/from\s+"three"/.test(leer("Vista3D.tsx")), "Vista3D dejó de usar three.js");
});

prueba("todo landing.css cuelga de .lp: no toca ni un pixel de la aplicación", () => {
  const css = leer("landing.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const preludios = [];
  css.split("}").forEach((bloque) => {
    const partes = bloque.split("{");
    partes.slice(0, -1).forEach((p) => preludios.push(p.trim()));
  });
  preludios
    .filter((p) => p && !p.startsWith("@") && !/^(from|to|\d+%)/.test(p))
    .forEach((p) => {
      p.split(",").map((s) => s.trim()).filter(Boolean).forEach((sel) => {
        assert.ok(
          sel.startsWith(".lp") || sel.startsWith("html.lp-activa"),
          `selector fuera de la landing: «${sel}»`,
        );
      });
    });
});

prueba("landing.css no baja nada de la red: sin @import y sin url(http…)", () => {
  const css = leer("landing.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/@import/.test(css), "hay un @import");
  assert.ok(!/url\(\s*["']?https?:/.test(css), "hay un recurso externo");
  assert.ok(!/@font-face/.test(css), "hay una fuente empaquetada sin revisar la CSP");
});

console.log(`\n${hechas} pruebas de la landing`);
