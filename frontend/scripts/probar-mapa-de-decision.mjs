/**
 * Indicadores › Mapa de oportunidades y Análisis (versión B, 2026-10-28).
 *   npm run probar:mapa-de-decision
 *
 *  · La brecha del potencial se parte por causa y cierra (el caso de CENTRO).
 *  · Las acciones van por prioridad, después por plata y por plazo.
 *  · Las etiquetas del mapa no se pisan nunca y no se salen del lienzo.
 *  · Cada capa enciende lo suyo; el montaje más urgente manda.
 *  · Las caras de una góndola se parten como en el plano.
 *  · Quien no administra no ve plata, ni en el mapa ni en el Análisis.
 *  · Un botón principal por pantalla y «reducir movimiento» respetado.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (...p) => readFileSync(join(raiz, "src", ...p), "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
async function cargar(entrada) {
  const salida = join(mkdtempSync(join(tmpdir(), "mapa-")), "m.mjs");
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
const M = await cargar("utils/mapaDeDecision.ts");
const I = await cargar("utils/indicadores.ts");

console.log("Mapa de decisión · las reglas");

await prueba("la brecha de CENTRO: vacías + parciales + precio y cobro = lo que falta", () => {
  const b = M.brechaDelPotencial({ potencial: 10_400_000, cobrado: 6_370_000, vacias: 2_100_000, enParciales: 1_805_000 });
  assert.equal(b.falta, 4_030_000);
  assert.equal(b.precioYCobro, 125_000);
  assert.equal(b.vacias + b.enParciales + b.precioYCobro, b.falta);
  assert.equal(b.sobreTarifa, 0);
  assert.deepEqual(M.porcentajesQueSuman([b.vacias, b.enParciales, b.precioYCobro]), [52, 45, 3]);
});

await prueba("cobrando por encima de la tarifa no hay «precio y cobro» negativo", () => {
  const b = M.brechaDelPotencial({ potencial: 1_000_000, cobrado: 950_000, vacias: 100_000, enParciales: 0 });
  assert.equal(b.precioYCobro, 0);
  assert.equal(b.sobreTarifa, 50_000);
  // Lo vacío y lo parcial nunca superan el potencial.
  const c = M.brechaDelPotencial({ potencial: 100, cobrado: 0, vacias: 80, enParciales: 80 });
  assert.equal(c.vacias + c.enParciales, 100);
});

await prueba("los porcentajes suman 100 (resto mayor) y cero da ceros", () => {
  for (const v of [[1, 1, 1], [61, 20, 17.5, 1.5], [7, 0, 3]]) assert.equal(M.porcentajesQueSuman(v).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(M.porcentajesQueSuman([0, 0]), [0, 0]);
});

await prueba("las acciones: prioridad alta primero, después la plata, el tipo y el plazo", () => {
  const a = (tipo, clave, impacto = null, dias = null) => ({ tipo, clave, impacto, dias });
  const o = M.ordenarAcciones([
    a("sin_montar", "s", null, -27), a("renovar", "r60", 450_000, 33), a("planograma_por_revisar", "v"),
    a("renovar", "r3", 600_000, 3), a("ventas", "ve"), a("no_montado", "nm"), a("vencido", "x", 100_000, -2),
  ]);
  assert.deepEqual(o.map((x) => x.clave), ["r3", "x", "ve", "nm", "r60", "s", "v"]);
  assert.equal(M.prioridadDe({ tipo: "renovar", dias: 7 }), "alta");
  assert.equal(M.prioridadDe({ tipo: "renovar", dias: 8 }), "media");
});

await prueba("las etiquetas no se pisan y no se salen del lienzo (siete en el mismo lugar)", () => {
  for (const [W, pedidas] of [
    [680, Array.from({ length: 7 }, () => ({ x: 340, ancho: 150 }))],
    [680, [{ x: 0, ancho: 160 }, { x: 5, ancho: 160 }, { x: 670, ancho: 160 }, { x: 675, ancho: 200 }]],
    [360, Array.from({ length: 9 }, (_, i) => ({ x: 40 * i, ancho: 70 }))],
  ]) {
    const u = M.empacarEtiquetas(pedidas, W, 8, 3);
    assert.equal(u.length, pedidas.length);
    assert.ok(Math.max(...u.map((x) => x.fila)) <= 2, "más de tres filas");
    for (let i = 0; i < u.length; i++) {
      assert.ok(u[i].izq >= 4 - 1e-9, `se sale por la izquierda: ${u[i].izq}`);
      for (let j = i + 1; j < u.length; j++) {
        if (u[i].fila !== u[j].fila) continue;
        const [a, b] = u[i].izq <= u[j].izq ? [i, j] : [j, i];
        assert.ok(u[a].izq + pedidas[a].ancho + 8 <= u[b].izq + 1e-9, `se pisan ${a} y ${b} en la fila ${u[a].fila}`);
      }
    }
    const total = pedidas.reduce((t, p) => t + p.ancho + 8, 0);
    if (total <= 3 * (W - 8)) for (let i = 0; i < u.length; i++) assert.ok(u[i].izq + pedidas[i].ancho <= W - 4 + 1e-9, `se sale por la derecha: ${i}`);
  }
});

await prueba("con muchos espacios, sólo los más importantes llevan globo y queda lugar para «+N más» (TERRON: 42 por vencer)", () => {
  const pedidas = Array.from({ length: 42 }, (_, i) => ({ ancho: 150, peso: -i }));
  const e = M.elegirEtiquetas(pedidas, 1000, { tope: 10 });
  assert.ok(e.length > 0 && e.length <= 10, `eligió ${e.length}`);
  assert.deepEqual(e, Array.from({ length: e.length }, (_, i) => i), "no eligió los de más peso");
  // Lo elegido más «+N más» entra en tres filas.
  assert.ok(M.filasDeEtiquetas([...e.map(() => ({ x: 0, ancho: 150 })), { x: 0, ancho: 120 }], 1000, 8, 4) <= 3);
  // Si entran todas, van todas y no hace falta «+N».
  assert.equal(M.elegirEtiquetas(pedidas.slice(0, 4), 1000).length, 4);
  // En un lienzo angosto, menos.
  assert.ok(M.elegirEtiquetas(pedidas, 360, { tope: 10 }).length < e.length);
  const d = sinComentarios(leer("components", "Indicadores", "MapaDeDecision.tsx"));
  assert.ok(d.includes("en la lista de abajo"), "no dice cuántos quedaron afuera");
  assert.ok(d.includes("data-globo-flotante"), "el espacio señalado no muestra su globo");
  assert.ok(d.includes("conGlobo.has(c.clave) ? (v.dias <= 30 ? 3 : 2) : 0"), "las ondas vuelven a latir en todos");
  assert.ok(d.includes('if (conGlobo.has(c.clave)) suelo.push(<ellipse key={`h${c.clave}`} className="halo"'), "los halos vuelven a respirar en todas las caras vacías");
});

const espacio = (o = {}) => ({
  clave: "f1-A", fixtureId: "f1", cara: "A", codigo: "GON-01·A", comercial: true, estado: "vendida", vendido: 1,
  ingresoAlMes: 450_000, libreAlMes: 0, tarifa: 450_000, clientes: ["Galletas Sol"], vence: null, montaje: null,
  montajeDetalle: null, diasSinContrato: null, nuncaContratada: false, tipo: "Góndola", detalleParcial: null, contratos: [], ...o,
});

await prueba("cada capa enciende lo suyo", () => {
  assert.ok(M.enLaCapa(espacio(), "ingreso"));
  assert.ok(M.enLaCapa(espacio({ ingresoAlMes: 0 }), "ingreso"), "una cara que trabaja sin cobro cargado igual está vigente");
  assert.ok(!M.enLaCapa(espacio({ estado: "libre", ingresoAlMes: 0 }), "ingreso"));
  assert.ok(M.enLaCapa(espacio({ estado: "libre" }), "vacias") && !M.enLaCapa(espacio({ estado: "libre", comercial: false }), "vacias"));
  assert.ok(M.enLaCapa(espacio({ estado: "parcial" }), "parcial"));
  assert.ok(M.enLaCapa(espacio({ vence: { dias: 3 } }), "vence"));
  assert.ok(M.enLaCapa(espacio({ comercial: false, montaje: "guia" }), "montaje"), "un planograma de un mueble que no se vende también se monta");
  assert.ok(M.enLaCapa(espacio(), "cliente", "Galletas Sol") && !M.enLaCapa(espacio(), "cliente", "Otro"));
  assert.ok(!M.enLaCapa(espacio(), "acciones"));
});

await prueba("el montaje más urgente manda; el vencimiento tiene su color con texto", () => {
  assert.equal(M.montajeQueManda(["por_verificar", "sin_montar", "no_realizado"]), "no_realizado");
  assert.equal(M.montajeQueManda(["guia", null, "por_verificar"]), "guia");
  assert.equal(M.montajeQueManda([]), null);
  assert.equal(M.colorDelVencimiento(30), "critico");
  assert.equal(M.colorDelVencimiento(31), "serio");
  assert.equal(M.colorDelVencimiento(61), "aviso");
  for (const e of M.ORDEN_DEL_MONTAJE) assert.ok(M.TEXTO_DEL_MONTAJE[e], `«${e}» sin texto`);
});

await prueba("las caras de la góndola se parten como en el plano; lo vendido va del lado de la cámara", () => {
  const ancha = { x0: 0, x1: 10, z0: 0, z1: 2 };
  const m = M.mitadesDeLaGondola(ancha);
  assert.deepEqual([m.A.z0, m.A.z1, m.B.z0, m.B.z1], [0, 1, 1, 2], "más ancha que honda: A del lado de −z");
  const honda = { x0: 0, x1: 2, z0: 0, z1: 8 };
  const h = M.mitadesDeLaGondola(honda);
  assert.deepEqual([h.A.x1, h.B.x0], [1, 1], "más honda que ancha: A del lado de −x");
  const t = M.tramoDeCaja(ancha, 0.6, 1);
  assert.deepEqual([t.x0, t.x1, t.z0, t.z1], [6, 10, 0, 2]);
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const anchoManda = fp\.w >= fp\.d;/, "el plano cambió cómo parte las caras: el mapa tiene que seguirlo");
});

console.log("\nMapa de oportunidades y Análisis · la pantalla");

await prueba("las pestañas: el Mapa de oportunidades abre; Resumen y Detalle se traducen", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const viejo = v === "resumen" \? "mapa" : v === "detalle" \? "analisis" : v;/);
  assert.match(v, /\.find\(\(x\) => x === viejo\) \?\? "mapa";/);
  assert.match(v, /\["mapa", "Mapa de oportunidades"\], \["analisis", "Análisis"\], \["plano", "Plano"\]/);
  for (const f of ["Resumen.tsx", "Detalle.tsx"]) assert.ok(!existsSync(join(raiz, "src", "components", "Indicadores", f)), `${f} sigue ahí`);
});

await prueba("quien no administra no ve plata: los datos llegan en null", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /const tarifa = isAdmin && u \? tarifaDe\(face\) : null;/);
  assert.match(v, /vendido = isAdmin \? 1 - dp\.quedaPb \/ 10000 : null;/);
  assert.match(v, /ingresoAlMes: isAdmin \? suyos/);
  assert.match(v, /alMes: isAdmin \? alMesDe\(t\.entry\) : null/);
  assert.match(v, /\{negociarDe && isAdmin && tableroB\?\.porClave\.get\(negociarDe\)/, "la ficha de negociación es plata");
  assert.match(v, /const brecha = isAdmin && canonDelMes !== null \?/);
});

await prueba("quien no administra no ve plata: la pantalla no la escribe", () => {
  const m = sinComentarios(leer("components", "Indicadores", "MapaDeOportunidades.tsx"));
  // Cada `pesos(` del tablero va detrás de `plata`.
  const sueltos = m.split("\n").filter((l) => l.includes("pesos(") && !/plata|verPlata/.test(l) && !l.includes("import"));
  assert.deepEqual(sueltos, [], "un monto sin `plata`");
  const d = sinComentarios(leer("components", "Indicadores", "MapaDeDecision.tsx"));
  assert.ok(d.includes("const conPlata = (n: number | null | undefined) => (verPlata &&"));
  const a = sinComentarios(leer("components", "Indicadores", "Analisis.tsx"));
  assert.match(a, /\{plata && datos\.brecha && \(/, "el Resultado (que es plata) sólo para administración");
  assert.ok(a.includes("{plata && (\n          <section className=\"an-card\">\n            <h3>Precio frente a tarifa"), "el precio frente a tarifa sólo para administración");
});

await prueba("cada indicador tiene su definición en el Diccionario", () => {
  const m = sinComentarios(leer("components", "Indicadores", "MapaDeOportunidades.tsx"));
  const ids = [...m.matchAll(/(\w+): "([a-z_0-9]+)"/g)].filter(([, k]) => ["ingreso", "vence", "montaje", "vacias", "parcial", "cliente"].includes(k)).map((x) => x[2]);
  assert.equal(ids.length >= 6, true);
  for (const id of new Set(ids.filter((x) => I.metrica(x) || !/^[a-z]+$/.test(x)))) assert.ok(I.metrica(id), `«${id}» sin definición`);
  for (const id of ["canon", "vence_30", "montajes_pendientes", "caras_sin_contrato", "venta_parcial", "cliente_principal", "brecha"]) assert.ok(I.metrica(id), `«${id}» sin definición`);
  for (const x of I.METRICAS) assert.ok(x.formula && x.periodo && x.origen, `«${x.nombre}» incompleta`);
});

await prueba("un solo botón principal en cada archivo nuevo", () => {
  for (const f of ["MapaDeOportunidades.tsx", "Analisis.tsx", "FichaDeNegociacion.tsx", "MapaDeDecision.tsx"]) {
    const t = leer("components", "Indicadores", f);
    assert.ok((t.match(/["'\s`]btn-principal["'\s`]/g) ?? []).length <= 1, `${f}: más de un botón principal`);
  }
});

await prueba("las capas se mueven, pero no con «reducir movimiento»; nada de rótulos de menos de 9 px", () => {
  const css = leer("components", "Indicadores", "mapaDeDecision.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.md-svg \*, \.md-svg \*::before \{ animation: none !important; \}/);
  for (const k of ["md-subir", "md-onda", "md-halo", "md-hormigas", "md-arco", "md-barrita", "md-chip"]) assert.ok(css.includes(`@keyframes ${k}`), `falta ${k}`);
  for (const [, px] of css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(px) >= 9, `un rótulo de ${px} px`);
  // El oscuro está pensado, no heredado.
  assert.ok(css.includes('html[data-tema="oscuro"] .md-lienzo'));
});

await prueba("el mapa no escribe el código de cada mueble sobre el piso (en TERRON, 159 nombres tapaban el mapa)", () => {
  const d = sinComentarios(leer("components", "Indicadores", "MapaDeDecision.tsx"));
  assert.ok(!/\{m\.f\.code\}<\/text>/.test(d) && !d.includes('className="rot"'), "volvieron los rótulos del piso");
  assert.ok(d.includes("<title>{e?.codigo ?? m.f.code}</title>"), "el mueble apagado perdió su nombre al pasar el mouse");
});

await prueba("las clases no chocan con la hoja de Supervisar (la pantalla vive adentro de `.sup`)", () => {
  const sup = readFileSync(join(raiz, "src", "supervisar.css"), "utf8");
  const deSup = new Set([...sup.matchAll(/\.sup [^{,]*/g)].flatMap((m) => [...m[0].matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1])));
  const peligrosas = ["acc", "cap", "punto", "barrita", "seg", "cifra", "barra"];
  for (const f of ["MapaDeOportunidades.tsx", "Analisis.tsx", "FichaDeNegociacion.tsx", "MapaDeDecision.tsx"]) {
    const t = leer("components", "Indicadores", f);
    for (const c of peligrosas) {
      if (!deSup.has(c)) continue;
      assert.ok(!new RegExp(`className=(?:"|\\{\`)(?:[^"\`]* )?${c}(?: [^"\`]*)?(?:"|\`)`).test(t), `${f} usa «.${c}», que Supervisar ya pinta`);
    }
  }
});

console.log(`\n${n} pruebas · ${fallas ? `${fallas} FALLA(N)` : "el mapa decide con los datos de siempre"}`);
process.exit(fallas ? 1 : 0);
