/**
 * Pruebas de Ajustes, entrada y ayuda (rediseño UX 2026-10, etapa 8).
 *   npm run probar:ajustes
 *
 *  · El buscador encuentra por nombre y por cómo le dice la gente: «planilla»
 *    → «Cargar contratos desde planilla»; «reno» → «Renovar contrato» y
 *    «Ordenar códigos».
 *  · Quien trabaja en la tienda no encuentra ni fija funciones de
 *    administración.
 *  · Fijar: hasta 3 por persona.
 *  · La configuración inicial dice lo que falta y lo hecho, con los datos.
 *  · Ajustes no perdió ninguna sección del engranaje, y suma Tarifas,
 *    Temporadas, Metas, Sedes, Ordenar códigos, Catálogo y Permisos.
 *  · Un solo botón principal por pantalla.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (...p) => readFileSync(join(raiz, "src", ...p), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

async function cargar(entrada) {
  const salida = join(mkdtempSync(join(tmpdir(), "aj-")), "m.mjs");
  const { outputFiles } = await build({
    entryPoints: [join(raiz, "src", entrada)], bundle: true, format: "esm", write: false, platform: "neutral",
    external: ["react", "react-dom", "react-router-dom", "lucide-react", "zustand", "zustand/*", "axios"],
    loader: { ".css": "empty" },
  });
  writeFileSync(salida, outputFiles[0].text);
  return import(pathToFileURL(salida).href);
}

let fallas = 0, n = 0;
async function prueba(nombre, fn) {
  n++;
  try { await fn(); console.log(`  ok   ${nombre}`); }
  catch (e) { fallas++; console.log(`  FALLA ${nombre}\n         ${e.message.split("\n").join("\n         ")}`); }
}

const A = await cargar("acciones.ts");
console.log("Ajustes, entrada y ayuda");

await prueba("el buscador encuentra por sinónimo («planilla», «reno», «backup»)", () => {
  const ids = (q, adm = true) => A.buscarAcciones(q, adm).map((a) => a.id);
  assert.ok(ids("planilla").includes("planilla"));
  assert.ok(ids("reno").includes("renovar") && ids("reno").includes("renumerar"), ids("reno").join());
  assert.ok(ids("backup").includes("copia"));
  assert.ok(ids("Ordenar códigos").includes("renumerar"));
  assert.ok(ids("TARIFA").includes("tarifas"));
  assert.ok(ids("sucursal").includes("sedes"));
  assert.deepEqual(ids("zzzz"), []);
});

await prueba("quien no administra no encuentra ni ve en «Más» lo de administración", () => {
  const w = A.buscarAcciones("", false);
  assert.ok(w.length > 0 && w.every((a) => !a.admin));
  assert.ok(!A.buscarAcciones("planilla", false).some((a) => a.id === "planilla"));
  for (const m of ["inicio", "contratos", "indicadores", "montajes", "plano", "plano3d"]) {
    assert.ok(A.accionesDeMas(m, false).every((a) => !a.admin), m);
  }
  assert.ok(A.accionesDeMas("contratos", true).some((a) => a.id === "planilla"));
  assert.ok(A.accionesDeMas("plano", true).some((a) => a.id === "renumerar"));
});

await prueba("fijar: hasta 3, y se quita", () => {
  let f = [];
  for (const id of ["planilla", "tarifas", "temporadas", "renumerar"]) f = A.alternarFijada(f, id);
  assert.deepEqual(f, ["planilla", "tarifas", "temporadas"]);
  f = A.alternarFijada(f, "tarifas");
  assert.deepEqual(f, ["planilla", "temporadas"]);
  assert.equal(A.MAXIMO_FIJADAS, 3);
});

await prueba("cada acción tiene qué hacer, y los ids no se repiten", () => {
  const ids = A.ACCIONES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const hechas = [];
  const ctx = new Proxy({}, { get: (_t, k) => (...args) => hechas.push([k, ...args]) });
  for (const a of A.ACCIONES) { const antes = hechas.length; a.hacer(ctx); assert.ok(hechas.length > antes, a.id); }
});

await prueba("la ayuda tiene cada pantalla y el glosario sus términos", () => {
  for (const m of ["inicio", "contratos", "indicadores", "montajes", "plano", "plano3d"]) {
    assert.ok(A.AYUDA_DE_LA_PANTALLA[m]?.que && A.AYUDA_DE_LA_PANTALLA[m].pasos.length > 0, m);
    assert.ok(A.GLOSARIO.some((g) => g.modulos.includes(m)), `sin términos en ${m}`);
  }
  assert.ok(A.buscarEnElGlosario("planometria").some((g) => g.termino === "Planometría"));
});

const C = await cargar("utils/configuracionInicial.ts");

await prueba("la configuración inicial dice lo que falta y lo hecho", () => {
  const f = (id, extra = {}) => ({ id, code: id, type: "gondola_doble", ...extra });
  const pasos = C.pasosIniciales({
    sedes: ["CENTRO", "NORTE"],
    porSede: { CENTRO: [f("GON-01", { faceB: {} }), f("PUN-01", { type: "punta_gondola", status: "occupied", startDate: "2026-01-01", endDate: "2099-12-31" })], NORTE: [] },
    tarifas: 0,
    contactos: { gerente: [], by_sede: { CENTRO: { admin: ["a@x.co"], mercaderista: [] } } },
    usuarios: { miembros: [{}], invitaciones: [] },
  });
  assert.deepEqual(pasos.map((p) => p.hecho), [true, false, false, false, false, true]);
  assert.match(pasos[1].detalle, /CENTRO: 2 muebles, \d+ espacios contratables/);
  assert.match(pasos[1].detalle, /Sin plano: NORTE/);
  assert.match(pasos[3].detalle, /CENTRO: falta montaje · NORTE: falta administración y montaje/);
  assert.match(pasos[3].detalle, /el aviso de montaje no le llega a nadie/);
  assert.equal(pasos[4].detalle, "Sólo estás vos.");
});

const dash = sinComentarios(leer("pages/Dashboard.tsx"));
const modal = dash.slice(dash.indexOf("function SettingsModal("), dash.indexOf("function iniciales("));

await prueba("Ajustes no pierde ninguna sección y suma las nuevas", () => {
  for (const pieza of ["<UsuariosSection />", "<ContactsSection sedes={sedes} />", "<NombresDeMueblesSection />",
    "<SuscripcionSection enfocar={enfocar === \"suscripcion\"} />", "<CopiaSection />", "<TusDatosSection />", "<BitacoraSection />",
    "Guardar notificaciones", "Enviar correo de prueba", "<MetasPorSede", "<SedesDeAjustes />", "<PermisosDePlanogramas",
    "Abrir las tarifas", "Editar las temporadas", 'navigate("/renumerar")', 'navigate("/plano/muebles")', "Volver a mostrarla"]) {
    assert.ok(modal.includes(pieza), `Ajustes no tiene ${pieza}`);
  }
  for (const t of ["comercial", "sede", "avisos", "equipo", "cuenta"]) assert.ok(modal.includes(`tema === "${t}"`), t);
  assert.match(dash, /\{temaAjustes && isAdmin && \(/);
  // Ctrl K abre el buscador desde cualquier pantalla.
  assert.match(dash, /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "k"/);
});

await prueba("un solo botón principal por pantalla", () => {
  const cuenta = (t) => (sinComentarios(t).match(/btn-principal/g) ?? []).length;
  assert.equal(cuenta(leer("components/Inicio/ConfiguracionInicial.tsx")), 1);
  assert.equal(cuenta(leer("components/Inicio/Inicio.tsx")), 1);
  // Mientras se muestra la configuración, «Nuevo contrato» cede el amarillo.
  assert.match(leer("components/Inicio/Inicio.tsx"), /config\.visible \? "ini-nuevo-sec ini-nuevo" : "btn-principal ini-nuevo"/);
  for (const f of ["components/Ajustes/Metas.tsx", "components/Ajustes/Sedes.tsx", "components/Ajustes/Permisos.tsx",
    "components/Armazon/Buscador.tsx", "components/Armazon/Mas.tsx", "components/Armazon/Ayuda.tsx"]) assert.equal(cuenta(leer(f)), 0, f);
});

await prueba("las metas validan antes de guardar (0–100 y 0–200)", () => {
  const m = sinComentarios(leer("components/Ajustes/Metas.tsx"));
  assert.match(m, /entero\(general\.ocupacion, 100\)/);
  assert.match(m, /entero\(general\.canon_tarifa, 200\)/);
  assert.match(m, /disabled=\{guardando \|\| errores\.length > 0\}/);
});

console.log(`\n${n} pruebas · ${fallas ? `${fallas} FALLA(N)` : "ajustes, entrada y ayuda"}`);
process.exit(fallas ? 1 : 0);
