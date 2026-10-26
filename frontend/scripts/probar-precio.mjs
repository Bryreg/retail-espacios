/**
 * El valor de un contrato: ¿al mes o total? (2026-10-25)
 *   npm run probar:precio
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * Los contratos de GALERÍAS se cargaron antes de Vender con el valor del MES
 * en el campo que desde la «fase 17» es el TOTAL, y el sistema los leía como
 * total. Dos arreglos, con decisiones del dueño:
 *
 *   · «Editar contrato»: «Total | Al mes» NO convierte el número —queda el
 *     escrito y cambia cómo se lee—, y si eso es lo único que cambia, no se
 *     reenvía a los correos (`soloLaFormaDelPrecio`, gemela de
 *     `solo_la_forma_del_precio` del servidor). Un contrato nuevo sigue
 *     convirtiendo, para que el total no salte.
 *   · «Para revisar» → Corregir: los contratos de antes sin forma, con «Es al
 *     mes», «Es el total» y «Todos son al mes»; sólo administración, sin
 *     correos, UN aviso en la pastilla.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");
const leerPy = (p) => readFileSync(join(raiz, "../backend/app", p), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let hechas = 0;
const prueba = async (n, fn) => {
  try { await fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message.split("\n").join("\n         ")); process.exitCode = 1; }
};

const r = await build({
  stdin: { contents: 'export * as ED from "./src/utils/edicionDeContrato.ts";\nexport * as PR from "./src/components/Supervisar/paraRevisar.ts";', resolveDir: raiz, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const { ED, PR } = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));

const foto = (extra = {}) => ({
  forma: "entera", visibleCara: "GON-02·A", partes: [], proveedor: "Valle", marca: "Yogur", desde: "2026-08-01", hasta: "2027-01-31",
  valor: 800_000, modoPrecio: null, valorTecleado: null, cobro: null, pb: null, ...extra,
});

console.log("precio · editar un contrato de antes");

await prueba("pasar a «al mes» con el mismo número es sólo la forma: no se reenvía", () => {
  const antes = foto();
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ valor: 4_800_000, modoPrecio: "mensual", valorTecleado: 800_000 })), true);
  // Y de vuelta a total con el mismo número.
  assert.equal(ED.soloLaFormaDelPrecio(foto({ valor: 4_800_000, modoPrecio: "mensual", valorTecleado: 800_000 }), foto({ modoPrecio: "total", valorTecleado: 800_000 })), true);
  // Otro número, otra fecha, otro proveedor o con ventas: es una edición de verdad.
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ valor: 5_400_000, modoPrecio: "mensual", valorTecleado: 900_000 })), false);
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ valor: 4_800_000, modoPrecio: "mensual", valorTecleado: 800_000, hasta: "2027-02-28" })), false);
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ valor: 4_800_000, modoPrecio: "mensual", valorTecleado: 800_000, proveedor: "Otro" })), false);
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ valor: 0, cobro: { porcentaje: 8, corte: "mensual" } })), false);
  // Sin cambiar la forma no es «sólo la forma».
  assert.equal(ED.soloLaFormaDelPrecio(antes, foto({ modoPrecio: "total", valorTecleado: 800_000 })), false);
});

await prueba("la gemela del servidor existe y el router no avisa cuando es sólo la forma", () => {
  const s = leerPy("services/editar_contrato.py");
  assert.ok(/def solo_la_forma_del_precio\(/.test(s) && s.includes("sin_reenvio=solo_la_forma_del_precio("));
  const router = leerPy("routers/vender.py");
  assert.ok(/if hecho\.sin_reenvio:[\s\S]{0,400}else:\s*\n\s*avisos = avisar_edicion\(/.test(router), "con sin_reenvio no se llama a avisar_edicion");
});

await prueba("editando, «Total | Al mes» no convierte; un contrato nuevo sí", () => {
  const c = sinComentarios(leer("src/components/Contrato/Contrato.tsx"));
  const cambiar = c.slice(c.indexOf("const cambiarModo = useCallback("), c.indexOf("const escribirPorcentaje"));
  assert.ok(/setModos\([^;]+;\s*if \(semilla\?\.edita\) return;/.test(cambiar), "editando tiene que volver antes de convertir");
  assert.ok(cambiar.includes("redondear(l.numero / nMeses)"), "un contrato nuevo sigue convirtiendo");
  const v = sinComentarios(leer("src/components/Contrato/ModoVender.tsx"));
  assert.ok(v.includes("onClick={edita && !c.soloForma ? () => setConfirmando(true) : c.guardar}"), "sólo la forma: se guarda sin el diálogo de reenvío");
  assert.ok(v.includes("no se envía de nuevo a los correos"));
  assert.ok(v.includes('conPrecio && (abierta || l.modo === "mensual" || !!c.edita) && ('), "editando, «Total | Al mes» está a la vista sin abrir la línea");
});

console.log("\nprecio · los contratos de antes, en «Para revisar»");

await prueba("una sección de Corregir que cuenta UNO, sólo para administración", () => {
  assert.equal(PR.grupoDelAviso("precio_sin_forma"), "corregir");
  const t = leer("src/pages/DashboardView.tsx");
  assert.ok(/usePrecioSinForma\(\{ sede, activo: isAdmin && modoEfectivo === "supervisar" \}\)/.test(t), "el hook no pide nada si no es administración en Supervisar");
  assert.ok(/for \(const _c of precioSinForma\.unoSiHay\)/.test(t), "cuenta un aviso, no uno por contrato");
  assert.ok(/\{isAdmin && \(\s*<PrecioSinForma\b/.test(t), "la sección se monta sin isAdmin");
  const h = sinComentarios(leer("src/components/Supervisar/PrecioSinForma.tsx"));
  assert.ok(h.includes("const unoSiHay = filas.slice(0, 1);"));
  assert.equal((h.match(/btn-principal/g) ?? []).length, 0, "Para revisar no lleva amarillo");
  assert.ok(!/sombra/i.test(h));
});

await prueba("las rutas del cliente existen y son de administración; corregir no manda correos", () => {
  const api = sinComentarios(leer("src/api/precioSinForma.ts"));
  const router = leerPy("routers/vender.py");
  for (const [m, ruta] of [...api.matchAll(/client\.(get|post)<[^>]*>\("\/contratos([^"]+)"/g)].map((x) => [x[1], x[2]])) {
    assert.ok(router.includes(`@router.${m}("${ruta}")`), `no existe ${m} /contratos${ruta}`);
  }
  const bloque = router.slice(router.indexOf('@router.get("/precio-sin-forma")'));
  assert.equal((bloque.match(/Depends\(require_admin\)/g) ?? []).length, 3, "las tres rutas, sólo administración");
  assert.ok(!/avisar|send_mail|_avisar\(/.test(bloque), "corregir cómo se lee un valor no manda correos");
  const servicio = leerPy("services/precio_sin_forma.py");
  assert.ok(servicio.includes("meses_entre(") && !/send_mail|correo/.test(servicio.replace(/"""[\s\S]*?"""/g, "")));
});

await prueba("Vender no alcanza la corrección de Supervisar", () => {
  for (const a of ["src/components/Contrato/Contrato.tsx", "src/components/Contrato/ModoVender.tsx", "src/api/vender.ts"]) {
    assert.ok(!leer(a).includes("precioSinForma"), `${a} importa la corrección de Supervisar`);
  }
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? ", hay fallas" : ""}.`);
