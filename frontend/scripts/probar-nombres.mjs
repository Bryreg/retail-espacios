/**
 * El nombre propio de cada familia de muebles (`src/catalogo/nombresPropios.ts`).
 *   npm run probar:nombres
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Cada supermercado le dice distinto a sus muebles: en uno la estiba es el
 * «mamut», en otro la punta es el «tope de góndola». Las «etiquetas del
 * catálogo» (`catalogLabels`) existían desde antes, pero sólo las aplicaba la
 * biblioteca del plano 2D: en Vender, Supervisar, Estado por espacio y la
 * lámina del proveedor seguía saliendo el nombre de RECABRA. Ahora salen en
 * todas las pantallas del supermercado y NO en la consola de la plataforma ni
 * en los informes de asesoría, que comparan clientes con el nombre de RECABRA.
 * Las promesas que se vigilan acá:
 *
 *   · **Sin nombre propio, nada cambia.** Para cada tipo, variante, alias y
 *     modelo del catálogo, y para las fichas propias de los casos compartidos
 *     de tarifa, las funciones devuelven exactamente lo de antes
 *     (`rateTypeLabel(rateTypeOf(f))`, el texto de siempre de cada pantalla).
 *   · **Con nombre propio, lo dicen**, salvo donde la ficha tiene tarifa propia
 *     (la media estiba sigue siendo «Media estiba»: es su fila de Tarifas).
 *   · **Cada pantalla del supermercado lo usa** —la paleta y el panel del 2D y
 *     del 3D, Vender (la lista, el visor y la lámina), Supervisar, Estado por
 *     espacio, Montajes, Tarifas—, y ninguna vuelve a escribir el nombre de
 *     RECABRA a mano. Los cálculos que lo usan lo tienen en sus dependencias.
 *   · **La consola no**: ninguna página de la plataforma llega a este módulo
 *     ni lee `catalogLabels`, y la prueba comprueba que el tablero SÍ llega
 *     (si no, no estaría mirando nada).
 *   · **Se edita en Configuración** (sólo administración) y el store no
 *     resucita un nombre borrado al fusionar con otra estación (el 409).
 *
 * Del lado del servidor, `backend/tests/test_nombres_propios.py`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(p, "utf8");
const src = (rel) => leer(join(raiz, "src", rel));

const CATALOGO = JSON.parse(leer(join(raiz, "src", "catalogo", "muebles.json")));
const CASOS_TARIFA = JSON.parse(leer(join(aqui, "casos", "tarifas.json")));

/** La consola de la plataforma y los informes de asesoría: comparan clientes,
 *  así que nombran cada mueble como RECABRA. */
const CONSOLA = [
  "components/plataforma", "pages/Plataforma.tsx", "pages/ReportePlataforma.tsx",
  "pages/DetalleCliente.tsx", "pages/InformeCliente.tsx",
];

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

/** Un módulo armado con esbuild desde `src`, corrido acá. */
const armar = async (contents) => {
  const r = await build({
    stdin: { contents, resolveDir: raiz, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

const J = await armar(
  'export * as N from "./src/catalogo/nombresPropios.ts"; export * as F from "./src/types/fixtures.ts"; export * as P from "./src/catalogo/propias.ts";',
);
const { N, F, P } = J;

/** Las fichas propias de los casos compartidos de tarifa, como las manda la API. */
const PROPIAS = CASOS_TARIFA.propias.map((p) => ({
  id: `cli:${p.clave}`, clave: p.clave, tipo: p.tipo, ...(p.variante ? { variante: p.variante } : {}),
  nombre: p.clave, w: 1, d: 1, h: 1, ...(p.tarifa ? { tarifa: p.tarifa } : {}),
  fuente: { confiabilidad: "estimado", nota: "caso" }, retirado: p.retirado,
}));

/** Todos los muebles que se pueden encontrar: cada tipo, la góndola con y sin
 *  variante, los alias del 2D, cada modelo del catálogo y los de los casos de
 *  tarifa (fichas propias incluidas). */
function muebles() {
  const out = [];
  for (const t of Object.keys(CATALOGO.tipos)) out.push({ type: t, label: `rótulo de ${t}` });
  out.push({ type: "gondola", gondolaType: "double" }, { type: "gondola", gondolaType: "wall" });
  for (const a of Object.keys(CATALOGO.alias)) out.push({ type: a });
  for (const m of CATALOGO.modelos) out.push({ type: m.tipo, ...(m.variante ? { gondolaType: m.variante } : {}), modelo: m.id });
  for (const c of CASOS_TARIFA.casos) out.push(c.mueble);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · LAS FUNCIONES
// ═══════════════════════════════════════════════════════════════════════════

await prueba("sin nombre propio, cada mueble se nombra exactamente como antes", () => {
  P.fijarFichasPropias(PROPIAS);
  try {
    const mal = [];
    for (const f of muebles()) {
      const fam = N.familiaDe(f);
      const otra = fam === "punta" ? "columna" : "punta";
      // Sin nada, con el de OTRA familia, y con el suyo vacío o de espacios.
      for (const nombres of [{}, null, undefined, { [otra]: "Pilar" }, { [fam]: "" }, { [fam]: "   " }]) {
        // Salvo la caja y la columna: sin tarifa, decían su clave («checkout»)
        // en la fila de una bahía o un forro vendidos; ahora, su nombre de
        // RECABRA. Ninguna otra familia cambia.
        const conPiezas = (CATALOGO.tipos[f.type]?.partes?.piezas ?? []).length > 0;
        const antes = conPiezas ? N.rotuloDeRecabra(fam) : F.rateTypeLabel(F.rateTypeOf(f));
        const hoy = N.tipoDelMueble(f, nombres);
        if (hoy !== antes) mal.push(`${JSON.stringify(f)} con ${JSON.stringify(nombres)}: tipo «${hoy}», era «${antes}»`);
        const rot = N.conNombrePropio(f, nombres, "lo de siempre");
        if (rot !== "lo de siempre") mal.push(`${JSON.stringify(f)} con ${JSON.stringify(nombres)}: nombre «${rot}»`);
      }
    }
    for (const { type } of F.RATE_TYPES) {
      // El de una familia sin tarifa ni partes (el servicio al cliente) no
      // cambia ninguna fila. La columna, desde vender por partes, sí cambia
      // UNA: la de su forro («Forro de Pilar»); ninguna más.
      for (const nombres of [{}, { servicio_cliente: "Atención" }, { columna: "Pilar" }]) {
        if (nombres.columna && type === "parte_forro") continue;
        if (N.nombreDeTarifa(type, nombres) !== F.rateTypeLabel(type)) mal.push(`tarifa ${type}: «${N.nombreDeTarifa(type, nombres)}»`);
      }
    }
    assert.deepEqual(mal, [], "\n" + mal.join("\n"));
    assert.ok(muebles().length > 60, "la prueba no está recorriendo el catálogo");
  } finally {
    P.olvidarFichasPropias();
  }
});

await prueba("con nombre propio, lo dice (y la ficha con tarifa propia sigue con la suya)", () => {
  const n = {
    punta: "Tope de góndola", isla: "Mamut", gondola_doble: "Góndola de centro",
    impulsador: "Exhibición especial", columna: "  Pilar  ",
  };
  P.fijarFichasPropias(PROPIAS);
  try {
    assert.equal(N.tipoDelMueble({ type: "punta" }, n), "Tope de góndola");
    // La caja y la columna venden sus piezas: su fila dice la familia, nunca
    // la clave; con nombre propio, el propio.
    assert.equal(N.tipoDelMueble({ type: "checkout" }, {}), "Checkout / Caja");
    assert.equal(N.tipoDelMueble({ type: "columna" }, n), "Pilar");
    assert.equal(N.tipoDelMueble({ type: "servicio_cliente" }, {}), "servicio_cliente", "cambió lo que no vende nada");
    assert.equal(N.conNombrePropio({ type: "punta" }, n, "Punta Góndola"), "Tope de góndola");
    // La góndola: la central (con su variante, sin ella y como la llama el 2D)
    // y la de pared, que no tiene nombre propio, se quedan cada una con lo suyo.
    for (const f of [{ type: "gondola", gondolaType: "double" }, { type: "gondola" }, { type: "gondola_doble" }]) {
      assert.equal(N.tipoDelMueble(f, n), "Góndola de centro", JSON.stringify(f));
      assert.equal(N.conNombrePropio(f, n, "x"), "Góndola de centro", JSON.stringify(f));
    }
    for (const f of [{ type: "gondola", gondolaType: "wall" }, { type: "gondola_mural" }]) {
      assert.equal(N.tipoDelMueble(f, n), F.rateTypeLabel("gondola"), JSON.stringify(f));
      assert.equal(N.conNombrePropio(f, n, "Góndola Mural"), "Góndola Mural", JSON.stringify(f));
    }
    // La estiba entera es «Mamut»; la media y el cuarto, del catálogo o
    // propios, siguen diciendo su tarifa: es la fila de Tarifas que les pone precio.
    assert.equal(N.tipoDelMueble({ type: "isla" }, n), "Mamut");
    assert.equal(N.tipoDelMueble({ type: "isla", modelo: "base:estiba-completa" }, n), "Mamut");
    assert.equal(N.tipoDelMueble({ type: "isla", modelo: "base:estiba-media" }, n), F.rateTypeLabel("estiba_media"));
    assert.equal(N.tipoDelMueble({ type: "isla", modelo: "cli:media-estiba-bodega" }, n), F.rateTypeLabel("estiba_media"));
    assert.equal(N.tipoDelMueble({ type: "isla", modelo: "cli:estiba-entera-propia" }, n), "Mamut");
    assert.equal(N.tipoDelMueble({ type: "impulsador", modelo: "base:exhibidor-carton" }, n), F.rateTypeLabel("exhibidor_carton"));
    assert.equal(N.tipoDelMueble({ type: "impulsador" }, n), "Exhibición especial");
    // Pero el NOMBRE del mueble es el de la familia, tenga la tarifa que tenga.
    assert.equal(N.conNombrePropio({ type: "isla", modelo: "base:estiba-media" }, n, "Exhib. de Piso"), "Mamut");
    // Sin espacios a los costados; lo que no se vende también tiene nombre.
    assert.equal(N.conNombrePropio({ type: "columna" }, n, "Columna"), "Pilar");
    assert.equal(N.tipoDelMueble({ type: "columna" }, n), "Pilar");
    // Las filas de tarifa: una familia por fila, o las dos de la góndola.
    assert.equal(N.nombreDeTarifa("punta", n), "Tope de góndola");
    assert.equal(N.nombreDeTarifa("isla", n), "Mamut");
    assert.equal(N.nombreDeTarifa("gondola", n), "Góndola de centro · Góndola Mural");
    assert.equal(N.nombreDeTarifa("gondola", { gondola_doble: "Góndola", gondola_mural: "Góndola" }), "Góndola");
    assert.equal(N.nombreDeTarifa("estiba_media", n), F.rateTypeLabel("estiba_media"));
  } finally {
    P.olvidarFichasPropias();
  }
});

await prueba("el nombre propio de la familia llega al nombre de sus partes, donde la parte la nombra", () => {
  // Vender por partes: la fila de Tarifas de la puerta dice la nevera; donde a
  // la nevera de puertas le dicen «Enfriador vertical», la puerta es la del
  // enfriador. Lo mismo la bahía de la caja y el forro de la columna.
  const n = { nevera_puertas: "Enfriador vertical", checkout: "Registradora", columna: "  Pilar  ", gondola_doble: "Góndola de centro", punta: "Tope" };
  assert.equal(N.nombreDeTarifa("parte_puerta", n), "Puerta de Enfriador vertical (cada una)");
  assert.equal(N.nombreDeTarifa("parte_bahia", n), "Bahía de impulso de Registradora (cada una)");
  assert.equal(N.nombreDeTarifa("parte_forro", n), "Forro de Pilar");
  // El tramo y el entrepaño son de varias familias y no nombran ninguna: no cambian.
  assert.equal(N.nombreDeTarifa("parte_tramo", n), F.rateTypeLabel("parte_tramo"));
  assert.equal(N.nombreDeTarifa("parte_entrepano", n), F.rateTypeLabel("parte_entrepano"));
  // Sin el nombre de SU familia, la de siempre (el de otra no se cuela).
  for (const clave of ["parte_puerta", "parte_bahia", "parte_forro", "parte_tramo", "parte_entrepano"]) {
    assert.equal(N.nombreDeTarifa(clave, {}), F.rateTypeLabel(clave), clave);
    assert.equal(N.nombreDeTarifa(clave, { isla: "Mamut", nevera_refrescos: "Multideck" }), F.rateTypeLabel(clave), clave);
  }
  // Y Tarifas lo muestra con el de RECABRA debajo (la fila ya lo hace con
  // cualquier nombre distinto del rótulo).
  assert.notEqual(N.nombreDeTarifa("parte_puerta", n), F.rateTypeLabel("parte_puerta"));
});

await prueba("las claves raras no son nombres, y lo que se guarda se limpia y se corta", () => {
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(N.nombrePropio(k, {}), undefined, k);
    assert.equal(N.conNombrePropio({ type: k }, {}, "igual"), "igual", k);
  }
  assert.equal(N.nombrePropio("punta", { punta: 7 }), undefined, "un número no es un nombre");
  assert.equal(N.LARGO_DEL_NOMBRE_PROPIO, CATALOGO.fichas.largoMaximo.nombre);
  assert.equal(N.nombreParaGuardar("punta", "  Tope de góndola  "), "Tope de góndola");
  assert.equal(N.nombreParaGuardar("punta", "Punta Góndola"), "", "el de RECABRA no es un nombre propio");
  assert.equal(N.nombreParaGuardar("gondola_mural", "Góndola Mural"), "");
  assert.equal(N.nombreParaGuardar("punta", "   "), "");
  // Contado en letras de verdad, como el servidor: 🛒 son dos unidades UTF-16.
  const largo = N.nombreParaGuardar("punta", "🛒".repeat(N.LARGO_DEL_NOMBRE_PROPIO + 5));
  assert.equal([...largo].length, N.LARGO_DEL_NOMBRE_PROPIO);
  // Las filas de Configuración son las familias de la biblioteca del 2D, todas.
  assert.deepEqual(N.familiasConNombre().map((f) => f.clave), CATALOGO.orden.plano2D);
  assert.ok(N.familiasConNombre().every((f) => f.rotulo && f.rotulo !== f.clave));
  // El servidor corta en el mismo largo, leído del mismo archivo.
  assert.match(leer(join(repo, "backend", "app", "schemas", "layout.py")),
    /LARGO_DEL_NOMBRE_PROPIO: int = REGLAS_DE_FICHA\["largoMaximo"\]\["nombre"\]/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · LAS PANTALLAS DEL SUPERMERCADO LO USAN
// ═══════════════════════════════════════════════════════════════════════════

/** Cada lugar donde sale el nombre de la familia, y cómo tiene que salir. */
const SITIOS = [
  ["pages/DashboardView.tsx", "el encabezado del espacio en el plano y el panel de detalle (Supervisar y Vender)",
    /\{conNombrePropio\(fixture, nombresPropios, fixture\.label \|\| fixture\.code\)\}[\s\S]*\{conNombrePropio\(fixture, nombresPropios, fixture\.label \|\| fixture\.code\)\}/],
  ["pages/DashboardView.tsx", "el cartel del mouse sobre el plano",
    /handleMove\(e, conNombrePropio\(f, nombresPropios, f\.label \|\| f\.code\), tooltipSub\)/],
  ["pages/DashboardView.tsx", "«Para revisar» de Supervisar",
    /entry\.supplierName \|\| conNombrePropio\(entry\.fixture, nombresPropios, entry\.fixture\.label \|\| entry\.fixture\.code\)/],
  ["pages/DashboardView.tsx", "la columna «Tipo» de Estado por espacio (y su ancho)",
    /const tipos = rows\.map\(\(e\) => tipoDelMueble\(e\.fixture, nombresPropios\)\)[\s\S]*\{tipoDelMueble\(entry\.fixture, nombresPropios\)\}/],
  ["pages/DashboardView.tsx", "«Cuándo se libera»", /tipoDe=\{\(f\) => tipoDelMueble\(f, nombresPropios\)\}/],
  ["pages/DashboardView.tsx", "«Tarifa de referencia» de Vender", /<td>\{nombreDeTarifa\(cat, nombresPropios\)\}<\/td>/],
  ["pages/DashboardView.tsx", "la búsqueda (por el nombre propio y por el tipo)",
    /function faceMatchesQuery\(entry: FaceEntry, q: string, nombres: NombresPropios\)[\s\S]*?conNombrePropio\(entry\.fixture, nombres, ""\)[\s\S]*?tipoDelMueble\(entry\.fixture, nombres\)/],
  ["components/Contrato/ModoVender.tsx", "la lista del contrato en Vender",
    // Un porcentaje dice «…, por participación» con el MISMO nombre propio.
    /const tipo = tipoDelMueble\(l\.fixture, nombresPropios\);\s*const tipoDeLaLinea = l\.tipo === "pc" \? `\$\{tipo\.replace\([^`]*\}, por participación` : tipo;[\s\S]*?\{tipoDeLaLinea\}<\/span>/],
  ["components/Contrato/ModoVender.tsx", "el visor 3D y la lámina de Vender (la chapa de cada cara)",
    // Por cara del visor (las puertas vendidas de una nevera son una cara).
    /const carasDelVisor = useMemo<CaraDelVisor\[\]>\(\(\) => \{[\s\S]*?tipo: tipoDelMueble\(l\.fixture, nombresPropios\),[\s\S]*?\}, \[c\.lineas, fichasPropias, nombresPropios\]\);/],
  ["components/Contrato/ModoVender.tsx", "el aviso de lo que no se alquila",
    /<b>\{conNombrePropio\(fixture, nombresPropios, fixture\.label \|\| fixture\.code\)\}<\/b>/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "la paleta del Editor 3D", /\{conNombrePropio\(def, nombresPropios, def\.label\)\}/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "el panel del Editor 3D", /font-bold text-dark-ink-1">\{conNombrePropio\(fix, nombresPropios, fix\.label\)\}/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "el cartel del mouse del Editor 3D", /text-dark-ink-1">\{conNombrePropio\(fix, nombresPropios, fix\.label\)\}<\/p>/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "«Colocando …»", /conNombrePropio\(placingDef, nombresPropios, placingDef\.label\)/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "la lámina del proveedor", /mueble: conNombrePropio\(uf, nombresPropios, uf\.label \|\| uf\.code\),/],
  ["components/FloorPlan2D/FloorPlan2D.tsx", "la biblioteca del plano 2D", /const displayLabel = nombrePropio\(def\.type, catalogLabels\) \?\? def\.label;/],
  // Rediseño, PR 3: el emoji se fue (ícono del tipo, `FloorPlan2D/iconos.ts`) y
  // el nombre va en la línea «tipo · sede · pasillo» del panel B.
  ["components/FloorPlan2D/FloorPlan2D.tsx", "el panel del plano 2D", /<span data-tipo-del-mueble>\{conNombrePropio\(item, nombresPropios, catDef\?\.label \?\? ""\)\}<\/span>/],
  ["components/FloorPlan2D/FloorPlan2D.tsx", "la búsqueda del plano 2D", /matchesQuery\(it, normalizedQuery, catalogLabels\)/],
  ["pages/MountView.tsx", "Montajes", /label: conNombrePropio\(f, nombresPropios, f\.label \|\| f\.code\),[\s\S]*label: conNombrePropio\(f, nombresPropios, f\.label \|\| f\.code\),/],
  ["components/RatesModal/RatesModal.tsx", "Tarifas (con el de RECABRA debajo)", /const dicho = nombreDeTarifa\(type, nombresPropios\);[\s\S]*\{dicho\}[\s\S]*\{label\} en RECABRA/],
  ["components/FloorPlan2D/FloorPlan2D.tsx", "«ese nombre ya lo tiene otro mueble» del plano 2D (la caja y el panel)",
    /textoDelChoque\(val, rechazo, \(m\) => conNombrePropio\(m, catalogLabels, ""\)\)[\s\S]*textoDelChoque\(nombreBorrador, rechazo, \(m\) => conNombrePropio\(m, nombresPropios, ""\)\)[\s\S]*textoDelChoque\(nombreBorrador, choqueEscrito, \(m\) => conNombrePropio\(m, nombresPropios, ""\)\)/],
  ["components/StoreEditor3D/StoreEditor3D.tsx", "«ese nombre ya lo tiene otro mueble» del Editor 3D",
    /textoDelChoque\(nombreBorrador, rechazo, \(m\) => conNombrePropio\(m, nombresPropios, ""\)\)[\s\S]*textoDelChoque\(nombreBorrador, choqueEscrito, \(m\) => conNombrePropio\(m, nombresPropios, ""\)\)/],
  ["components/taller/PanelDeFichas.tsx", "la familia de una ficha nueva en el taller",
    /const propio = conNombrePropio\(\{ type: f\.tipo, gondolaType: f\.variante \}, nombresPropios, ""\);/],
];

await prueba("«ese nombre ya lo tiene otro mueble» nombra al otro como le dicen acá", async () => {
  const { T } = await armar('export * as T from "./src/utils/nomenclatura.ts";');
  const rechazo = { razon: "ocupado", ocupa: { id: "x", code: "PUN-01", label: "Punta Góndola", type: "punta" } };
  assert.match(T.textoDelChoque("pun-01", rechazo, (m) => N.conNombrePropio(m, { punta: "Tope de góndola" }, "")), /\(Tope de góndola\)/);
  // Sin nombre propio, el de siempre.
  assert.match(T.textoDelChoque("pun-01", rechazo, (m) => N.conNombrePropio(m, {}, "")), /\(Punta Góndola\)/);
  assert.match(T.textoDelChoque("pun-01", rechazo), /\(Punta Góndola\)/);
});

await prueba("cada pantalla del supermercado dice el nombre propio de la familia", () => {
  const mal = SITIOS.filter(([rel, , re]) => !re.test(src(rel))).map(([rel, que]) => `${rel}: ${que}`);
  assert.deepEqual(mal, [], "\nno usan el nombre propio:\n" + mal.join("\n"));
  // Y lo leen del store, el mismo valor que edita Configuración.
  for (const rel of new Set(SITIOS.map(([r]) => r))) {
    if (rel.endsWith("FloorPlan2D.tsx")) continue;
    assert.match(src(rel), /const nombresPropios = useFixtureStore\(\(s\) => s\.catalogLabels\);/, `${rel}: no lee los nombres del store`);
  }
});

await prueba("cada componente que nombra lee los nombres del store, no uno por archivo", () => {
  // La de arriba se conforma con UNA lectura por archivo, y ModoVender tiene
  // tres componentes que nombran (y DashboardView seis): con la lectura de la
  // fila del contrato cambiada por `{}`, la lista de Vender volvía al nombre de
  // RECABRA y todo pasaba. Ningún `nombresPropios` de las pantallas del
  // supermercado sale de otro lado que no sea el store.
  const mal = [];
  for (const { rel, texto } of archivosDelSupermercado()) {
    for (const m of texto.matchAll(/\b(const|let|var)\s+nombresPropios\b(?!\s*=\s*useFixtureStore\(\(s\) => s\.catalogLabels\);)/g)) {
      mal.push(`${rel}:${texto.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(mal, [], "\nun `nombresPropios` que no es la lectura del store:\n" + mal.join("\n"));
  const lecturas = archivosDelSupermercado().reduce((n, { texto }) =>
    n + (texto.match(/const nombresPropios = useFixtureStore\(\(s\) => s\.catalogLabels\);/g) ?? []).length, 0);
  assert.ok(lecturas >= 15, `se esperaban las lecturas de cada componente que nombra; hay ${lecturas}`);
});

/** Los archivos de `src` (sin la consola, la landing ni este módulo). */
function archivosDelSupermercado() {
  const out = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.tsx?$/.test(n)) out.push(p);
    }
  };
  recorrer(join(raiz, "src"));
  const rel = (p) => p.slice(join(raiz, "src").length + 1).replace(/\\/g, "/");
  return out.map((p) => ({ rel: rel(p), texto: leer(p) }))
    .filter(({ rel: r }) => !CONSOLA.some((c) => r === c || r.startsWith(c + "/"))
      && !r.startsWith("pages/Landing/") && r !== "catalogo/nombresPropios.ts" && r !== "types/fixtures.ts");
}

await prueba("ninguna pantalla vuelve a escribir el nombre de RECABRA a mano", () => {
  const mal = [];
  for (const { rel, texto } of archivosDelSupermercado()) {
    // El tipo de una cara, a mano: tiene que ser `tipoDelMueble`. La búsqueda
    // es la única que lo sigue mirando (además del propio): buscar «estiba»
    // encuentra el mamut.
    for (const m of texto.matchAll(/rateTypeLabel\(rateTypeOf\(/g)) {
      const fn = [...texto.slice(0, m.index).matchAll(/\nfunction (\w+)\(/g)].pop()?.[1];
      if (!(rel === "pages/DashboardView.tsx" && fn === "faceMatchesQuery")) mal.push(`${rel}:${texto.slice(0, m.index).split("\n").length} rateTypeLabel(rateTypeOf(…))`);
    }
    // El rótulo guardado en el mueble, dibujado tal cual.
    for (const m of texto.matchAll(/\{\s*(fix|fixture|uf|def|placingDef|catDef\??|l\.fixture|entry\.fixture)\.label\s*\}/g)) {
      mal.push(`${rel}:${texto.slice(0, m.index).split("\n").length} {${m[1]}.label}`);
    }
    // «label || code» fuera de `conNombrePropio`.
    for (const m of texto.matchAll(/\b(f|fix|fixture|uf|l\.fixture|entry\.fixture)\.label \|\| \1\.code\b/g)) {
      const linea = texto.slice(texto.lastIndexOf("\n", m.index) + 1, m.index);
      if (!/conNombrePropio\(/.test(linea)) mal.push(`${rel}:${texto.slice(0, m.index).split("\n").length} ${m[0]}`);
    }
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
});

await prueba("los cálculos que usan el nombre propio lo tienen en sus dependencias", () => {
  const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  let vistos = 0;
  const mal = [];
  for (const { rel, texto } of archivosDelSupermercado()) {
    if (!rel.endsWith(".tsx")) continue;
    const t = sinComent(texto);
    for (const m of t.matchAll(/\b(useMemo|useCallback)(<[^>]*>)?\(/g)) {
      let i = m.index + m[0].length, prof = 1;
      while (prof > 0 && i < t.length) { if (t[i] === "(") prof++; else if (t[i] === ")") prof--; i++; }
      const cuerpo = t.slice(m.index, i);
      const deps = cuerpo.slice(cuerpo.lastIndexOf("["), cuerpo.lastIndexOf("]") + 1);
      const adentro = cuerpo.slice(0, cuerpo.lastIndexOf("["));
      if (!/\b(nombresPropios|catalogLabels)\b|\b(conNombrePropio|tipoDelMueble|nombreDeTarifa|nombrePropio)\(/.test(adentro)) continue;
      vistos++;
      if (!/\b(nombresPropios|catalogLabels)\b/.test(deps)) mal.push(`${rel}:${t.slice(0, m.index).split("\n").length}: un ${m[1]} usa el nombre propio y no depende de él`);
    }
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
  assert.ok(vistos >= 8, `se esperaban la búsqueda, la tabla, el visor de Vender, Montajes y la lámina; hay ${vistos}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · LA CONSOLA NO
// ═══════════════════════════════════════════════════════════════════════════

const vacio = {
  name: "vacio",
  setup(b) {
    b.onResolve({ filter: /\?(raw|worker|url|inline)$/ }, (a) => ({ path: a.path, namespace: "vacio" }));
    b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({ contents: "export default ''", loader: "js" }));
  },
};
const grafo = async (rel) => {
  const r = await build({
    entryPoints: [join(raiz, "src", rel)], bundle: true, write: false, format: "esm", metafile: true,
    outdir: join(raiz, ".probar-nombres"), logLevel: "silent", plugins: [vacio],
    loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".jpg": "empty", ".webp": "empty", ".woff2": "empty", ".md": "text" },
  });
  return Object.keys(r.metafile.inputs).map((m) => m.replace(/\\/g, "/"));
};

await prueba("la consola de la plataforma y los informes de asesoría siguen con el nombre de RECABRA", async () => {
  const mal = [];
  for (const pagina of CONSOLA.filter((c) => c.endsWith(".tsx"))) {
    const entradas = await grafo(pagina);
    if (entradas.some((m) => m.endsWith("src/catalogo/nombresPropios.ts"))) mal.push(`${pagina} llega a catalogo/nombresPropios.ts`);
  }
  // Y ninguno de sus archivos lee los nombres por su cuenta.
  const recorrer = (p, out) => {
    if (statSync(p).isDirectory()) for (const n of readdirSync(p)) recorrer(join(p, n), out);
    else if (/\.tsx?$/.test(p)) out.push(p);
    return out;
  };
  for (const c of CONSOLA) {
    for (const a of recorrer(join(raiz, "src", c), [])) {
      if (/catalogLabels|catalog_labels|nombresPropios|layout\/settings/.test(leer(a))) mal.push(`${a.slice(raiz.length + 1)} lee los nombres propios`);
    }
  }
  assert.deepEqual(mal, [], "\n" + mal.join("\n"));
  // Los informes nombran con el catálogo de RECABRA (`nombresDeInforme`).
  assert.match(src("components/plataforma/formato.ts"), /const NOMBRES = nombresDeInforme\(\);/);
  // El tablero sí llega: si no, esta prueba no estaría mirando nada.
  assert.ok((await grafo("pages/Dashboard.tsx")).some((m) => m.endsWith("src/catalogo/nombresPropios.ts")),
    "el tablero no llega a catalogo/nombresPropios.ts: la prueba no mira lo que cree");
});

await prueba("el catálogo sigue fuera de lo que baja la landing", async () => {
  // El store va de entrada (lo importa `App.tsx`): no puede importar este
  // módulo, que trae el catálogo entero. Lo limpia quien llama
  // (`nombreParaGuardar`) y el store sólo recorta espacios.
  assert.ok(!/from\s+["'][^"']*nombresPropios["']/.test(src("store/fixtureStore.ts")),
    "el store importa catalogo/nombresPropios.ts: el catálogo entraría en lo que baja la landing");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · DÓNDE SE EDITA, Y QUE NO SE PIERDA
// ═══════════════════════════════════════════════════════════════════════════

await prueba("Configuración tiene una fila por familia, sólo para administración", () => {
  const t = src("pages/Dashboard.tsx");
  const modal = t.slice(t.indexOf("function SettingsModal("), t.indexOf("// ─── Topbar"));
  assert.match(modal, /<NombresDeMueblesSection \/>/, "Configuración no tiene la sección de los nombres");
  assert.match(t, /\{settingsOpen && isAdmin && \(/, "Configuración se abre sin ser administración");
  const seccion = t.slice(t.indexOf("function NombresDeMueblesSection("), t.indexOf("function rolLabelUsuario("));
  assert.match(seccion, /const familias = familiasConNombre\(\);/);
  assert.match(seccion, /\{familia\.rotulo\}/, "la fila no dice el nombre de RECABRA");
  assert.match(seccion, /setCatalogLabel\(f\.clave, nombreParaGuardar\(f\.clave, texto\)\)/);
  assert.match(seccion, /maxLength=\{LARGO_DEL_NOMBRE_PROPIO\}/);
  // El lápiz de la biblioteca del 2D guarda lo mismo, por el mismo camino.
  assert.equal((src("components/FloorPlan2D/FloorPlan2D.tsx").match(/setCatalogLabel\(def\.type, nombreParaGuardar\(def\.type, editingCatalogVal\)\)/g) ?? []).length, 2);
});

await prueba("sólo administración los cambia, y un nombre borrado no vuelve al fusionar con otra estación", async () => {
  const r = await build({
    stdin: {
      contents: 'export { useFixtureStore } from "./src/store/fixtureStore.ts"; export { useAuthStore } from "./src/store/authStore.ts";',
      resolveDir: raiz, loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
    plugins: [{
      name: "sin-red",
      setup(b) {
        b.onResolve({ filter: /api[\\/](layout|spaces|firebase)$/ }, (a) => ({ path: a.path, namespace: "sin-red" }));
        b.onLoad({ filter: /layout$/, namespace: "sin-red" }, () => ({ contents: `
          const no = () => Promise.reject(new Error("sin red"));
          export const deleteLayout = no, fetchReferenceRates = no, fetchRevisions = no,
            fetchSeasonWindows = no, saveLayout = no, saveReferenceRates = no, saveSeasonWindows = no;
          export const fetchAllLayouts = () => (globalThis.__ajustes?.planos ? globalThis.__ajustes.planos() : no());
          export const fetchLayoutSettings = () => globalThis.__ajustes.leer();
          export const saveLayoutSettings = (sedes, labels, rev) => globalThis.__ajustes.guardar(sedes, labels, rev);`, loader: "js" }));
        b.onLoad({ filter: /spaces$/, namespace: "sin-red" }, () => ({ contents:
          "export const fetchEstadoComercial = () => (globalThis.__ajustes?.comercial ? globalThis.__ajustes.comercial() : Promise.reject(new Error('sin red')));", loader: "js" }));
        b.onLoad({ filter: /firebase$/, namespace: "sin-red" }, () => ({ contents: "export const signOutFirebase = async () => {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "nombres-"));
  const archivo = join(dir, "store.mjs");
  writeFileSync(archivo, r.outputFiles[0].text);
  const guardado = new Map();
  const habiaWindow = "window" in globalThis;
  if (!habiaWindow) globalThis.window = { localStorage: {
    getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => { guardado.set(k, String(v)); },
    removeItem: (k) => { guardado.delete(k); },
  } };
  let S;
  try { S = await import(pathToFileURL(archivo).href); } finally { rmSync(dir, { recursive: true, force: true }); }
  try {
    const store = S.useFixtureStore;
    // Un trabajador no los cambia (el PUT exige admin: se vería cambiado sin
    // haberse guardado).
    S.useAuthStore.getState().setAuth("token-w", "worker", "galerias");
    store.getState().setCatalogLabel("punta", "Tope de góndola");
    assert.deepEqual(store.getState().catalogLabels, {}, "un trabajador cambió un nombre propio");

    S.useAuthStore.getState().setAuth("token-a", "admin", "galerias");
    store.setState({ catalogLabels: { punta: "Tope de góndola", isla: "Mamut" }, settingsRev: "r1" });
    store.getState().setCatalogLabel("punta", "");
    assert.deepEqual(store.getState().catalogLabels, { isla: "Mamut" });
    // Otra estación guardó mientras tanto (el servidor todavía tiene la punta
    // y le sumó un nombre a la batea): 409, se fusiona y se escribe una vez.
    const escritos = [];
    globalThis.__ajustes = {
      leer: async () => ({ sedes: ["NAVE"], catalog_labels: { punta: "Tope de góndola", isla: "Mamut", batea: "Canasta" }, updated_at: "r2" }),
      guardar: async (sedes, labels, rev) => {
        escritos.push({ labels: { ...labels }, rev });
        if (escritos.length === 1) throw Object.assign(new Error("409"), { response: { status: 409 } });
        return { sedes, catalog_labels: labels, updated_at: "r3" };
      },
    };
    await store.getState().pushSettings();
    assert.equal(escritos.length, 2, "el 409 no se fusionó");
    assert.equal(escritos[1].rev, "r2");
    assert.deepEqual(escritos[1].labels, { isla: "Mamut", batea: "Canasta" }, "el nombre borrado volvió desde la copia del servidor");
    assert.deepEqual(store.getState().catalogLabels, { isla: "Mamut", batea: "Canasta" });
    // Volver a ponerle nombre lo saca de los borrados.
    store.getState().setCatalogLabel("punta", "Cabecera");
    escritos.length = 0;
    await store.getState().pushSettings();
    assert.deepEqual(escritos.at(-1).labels, { isla: "Mamut", batea: "Canasta", punta: "Cabecera" });
    // Con los datos de otro supermercado, lo borrado acá no borra lo de allá.
    store.getState().setCatalogLabel("isla", "");
    store.getState().scopeToCliente("canaveral");
    store.setState({ catalogLabels: { isla: "Exhibición especial" }, settingsRev: "c1" });
    escritos.length = 0;
    globalThis.__ajustes.leer = async () => ({ sedes: ["SUR"], catalog_labels: { isla: "Exhibición especial" }, updated_at: "c2" });
    let primera = true;
    globalThis.__ajustes.guardar = async (sedes, labels, rev) => {
      escritos.push({ labels: { ...labels }, rev });
      if (primera) { primera = false; throw Object.assign(new Error("409"), { response: { status: 409 } }); }
      return { sedes, catalog_labels: labels, updated_at: "c3" };
    };
    await store.getState().pushSettings();
    assert.deepEqual(escritos.at(-1).labels, { isla: "Exhibición especial" }, "un nombre borrado en otro supermercado se borró acá");

    // Al abrir la sesión se BAJAN del servidor: es lo que hace que la
    // trabajadora en Vender, otra computadora o un navegador nuevo digan
    // «Mamut» y no el nombre de RECABRA. Sin esto los nombres se veían sólo en
    // el navegador donde la dueña los escribió (vienen de su `localStorage`).
    await store.getState().flushPending(); // lo que quedó esperando su debounce
    S.useAuthStore.getState().setAuth("token-w2", "worker", "canaveral");
    store.setState({ catalogLabels: {} });
    Object.assign(globalThis.__ajustes, {
      planos: async () => [], comercial: async () => ({}),
      leer: async () => ({ sedes: ["SUR"], catalog_labels: { isla: "Mamut", punta: "Tope de góndola" }, updated_at: "c4" }),
    });
    await store.getState().syncFromServer();
    assert.deepEqual(store.getState().catalogLabels, { isla: "Mamut", punta: "Tope de góndola" },
      "los nombres propios no bajan del servidor al abrir la sesión");
    // Pero no pisan lo que esta estación está por guardar.
    S.useAuthStore.getState().setAuth("token-a2", "admin", "canaveral");
    store.getState().setCatalogLabel("punta", "Cabecera");
    await store.getState().syncFromServer();
    assert.equal(store.getState().catalogLabels.punta, "Cabecera", "bajar del servidor pisó un nombre que se estaba guardando");
  } finally {
    delete globalThis.__ajustes;
    S.useFixtureStore.getState().stopAutoSync?.();
    if (!habiaWindow) delete globalThis.window;
  }
});

console.log(`\n${hechas} pruebas de los nombres propios${process.exitCode ? " — HAY FALLAS" : ""}`);
// Los guardados del store esperan su debounce: no hay nada más que mirar.
process.exit(process.exitCode ?? 0);
