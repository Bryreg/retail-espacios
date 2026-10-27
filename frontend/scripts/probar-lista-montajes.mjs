/**
 * Pruebas de Montajes en una sola lista (rediseño UX 2026-10, etapa 7).
 *   npm run probar:lista-montajes
 *
 *  · El estado PRECISO de un contrato sale de su último reporte, de su
 *    verificación y de si su aviso todavía espera la planometría o la zona;
 *    quien no administra no sabe de avisos y lee «Sin montar».
 *  · Cada estado cae en UN filtro, y la cuenta de cada filtro suma lo mismo
 *    que «Todos».
 *  · Un planograma «por revisar» es «Montado, sin verificar»; «no se pudo» es
 *    «No realizado».
 *  · Quien trabaja en la tienda no verifica ni ve la lista de avisos que
 *    esperan, y la pantalla no lleva plata.
 *  · Lo de antes sigue: el enlace del correo abre el espacio, «Corregir el
 *    reporte» y el formulario con la cámara.
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
  const salida = join(mkdtempSync(join(tmpdir(), "mj-")), "m.mjs");
  const { outputFiles } = await build({ entryPoints: [join(raiz, "src", entrada)], bundle: true, format: "esm", write: false, platform: "neutral" });
  writeFileSync(salida, outputFiles[0].text);
  return import(pathToFileURL(salida).href);
}

let fallas = 0, n = 0;
async function prueba(nombre, fn) {
  n++;
  try { await fn(); console.log(`  ok   ${nombre}`); }
  catch (e) { fallas++; console.log(`  FALLA ${nombre}\n         ${e.message.split("\n").join("\n         ")}`); }
}

const M = await cargar("utils/montajes.ts");
console.log("Montajes en una sola lista");

await prueba("el estado de un contrato: reporte, verificación y aviso", () => {
  const { estadoDelContrato: e } = M;
  const espera = (p, d) => ({ falta_planometria: p, falta_distribucion: d });
  assert.equal(e(undefined, undefined), "sin_montar");        // quien no administra
  assert.equal(e(undefined, null), "aviso_enviado");
  assert.equal(e(undefined, espera(true, false)), "falta_planometria");
  assert.equal(e(undefined, espera(true, true)), "falta_planometria");
  assert.equal(e(undefined, espera(false, true)), "falta_zona");
  assert.equal(e(undefined, espera(false, false)), "sin_montar");
  assert.equal(e({ estado: "montado" }, null), "sin_verificar");
  assert.equal(e({ estado: "montado", verificacion: null }, null), "sin_verificar");
  assert.equal(e({ estado: "montado", verificacion: { resultado: "coincide" } }, null), "coincide");
  assert.equal(e({ estado: "montado", verificacion: { resultado: "no_coincide" } }, null), "no_coincide");
  // El reporte manda sobre el aviso: ya se montó, aunque la planometría falte.
  assert.equal(e({ estado: "no_montado" }, espera(true, false)), "no_realizado");
});

await prueba("el planograma usa las mismas palabras", () => {
  const { estadoDelPlanograma: e } = M;
  assert.deepEqual(["sin_montar", "por_revisar", "no_se_pudo", "no_coincide", "coincide"].map(e),
    ["sin_montar", "sin_verificar", "no_realizado", "no_coincide", "coincide"]);
});

await prueba("cada estado va a un filtro y las cuentas suman «Todos»", () => {
  const todos = Object.keys(M.TEXTO_DEL_ESTADO);
  assert.equal(todos.length, 8);
  const filtros = new Set(M.FILTROS_DE_MONTAJES.map((f) => f.id));
  for (const e of todos) assert.ok(filtros.has(M.filtroDe(e)), e);
  assert.deepEqual(M.FILTROS_DE_MONTAJES.map((f) => f.texto), ["Todos", "Sin montar", "Montado, sin verificar", "No realizado", "Verificado"]);
  const c = M.cuentaPorFiltro(todos);
  assert.deepEqual(c, { todos: 8, sin_montar: 4, sin_verificar: 1, no_realizado: 1, verificado: 2 });
  assert.equal(c.sin_montar + c.sin_verificar + c.no_realizado + c.verificado, c.todos);
});

await prueba("qué hacer con un no realizado, según el motivo", () => {
  assert.match(M.queHacerSegunElMotivo("sin_material"), /Reclamale el material al proveedor/);
  assert.match(M.queHacerSegunElMotivo("sin_producto"), /Reclamale el producto/);
  assert.match(M.queHacerSegunElMotivo("espacio_ocupado"), /Liberá el espacio/);
  assert.match(M.queHacerSegunElMotivo(null), /registrá el montaje de nuevo/);
});

const vista = sinComentarios(leer("pages/MountView.tsx"));
const verificar = sinComentarios(leer("components/Montaje/VerificarMontaje.tsx"));

await prueba("quien no administra: sin verificar y sin la lista de avisos", () => {
  assert.match(vista, /if \(isAdmin\) \{\s*Promise\.all\(sedesALaVista\.map\(\(s\) => montajesPendientes\(s\)/, "la lista de avisos (de administración) se pide sin preguntar el rol");
  assert.match(vista, /puedeVerificar=\{isAdmin\}/);
  assert.match(verificar, /const puede = puedeVerificar && montado;/);
  // Adjuntar la planometría (Pendientes) es de administración.
  assert.match(leer("pages/Dashboard.tsx"), /onAbrirPendientes=\{isAdmin \? /);
});

await prueba("sin plata en Montajes", () => {
  for (const [nombre, t] of [["MountView", vista], ["VerificarMontaje", verificar], ["montajes", sinComentarios(leer("utils/montajes.ts"))]]) {
    for (const p of ["negotiatedValue", "monthly_rent", "valor", "canon", "pesos(", "tarifa"]) {
      assert.ok(!t.includes(p), `${nombre} menciona «${p}»`);
    }
  }
});

await prueba("lo de antes sigue: enlace del correo, corregir el reporte y el formulario", () => {
  assert.match(vista, /const found = pendientes\.find\(\(p\) => p\.code\.toUpperCase\(\) === code\);/);
  assert.match(vista, /Corregir el reporte/);
  assert.match(vista, /<FormularioMontaje/);
  assert.match(vista, /La lista no se pudo actualizar/);
  // El reporte del contrato anterior no cuenta para el de ahora.
  assert.match(vista, /reporteDelContrato\(porCodigo, code, cara\.startDate\)/);
  // El enlace de quien monta muestra qué corregir.
  assert.match(sinComentarios(leer("pages/Montaje.tsx")), /reportado\?\.verificacion\?\.resultado === "no_coincide"/);
});

await prueba("verificar: la planometría al lado de la foto, «no coincide» pide la nota y puede reenviar", () => {
  assert.match(verificar, /Lo pedido · planometría/);
  assert.match(verificar, /Lo que quedó · foto del montaje/);
  assert.match(verificar, /resultado === "no_coincide" && nota\.trim\(\)\.length > 0/);
  assert.match(verificar, /verificarMontaje\(reporte\.id, resultado, resultado === "no_coincide" \? nota\.trim\(\) : undefined, resultado === "no_coincide" && reenviar\)/);
  assert.equal((verificar.match(/btn-principal/g) ?? []).length, 1);
});

console.log(`\n${n} pruebas · ${fallas ? `${fallas} FALLA(N)` : "montajes en una sola lista"}`);
process.exit(fallas ? 1 : 0);
