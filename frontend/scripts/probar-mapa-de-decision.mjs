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
const P = await cargar("utils/partes.ts");
/** Un componente de pantalla, sin su hoja de estilos: para sus funciones puras. */
async function cargarPantalla(entrada) {
  const salida = join(mkdtempSync(join(tmpdir(), "mapa-")), "m.mjs");
  const { outputFiles } = await build({
    entryPoints: [join(raiz, "src", entrada)], bundle: true, format: "esm", write: false, platform: "browser",
    loader: { ".css": "empty" }, jsx: "automatic", define: { "import.meta.env": "{}" }, logLevel: "error",
  });
  writeFileSync(salida, outputFiles[0].text);
  return import(pathToFileURL(salida).href);
}
const H = await cargarPantalla("components/Indicadores/Historial.tsx");

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

console.log("\nLo que se encontró al hacer los manuales (2026-11-20)");

await prueba("montajes por resolver: la regla de los filtros de Montajes, sin ventana de 30 días y sin lo que no empezó (CENTRO, trabajador)", () => {
  // Lo que Montajes lista en CENTRO para el trabajador: PUN-03-EN2 (desde el
  // 1 sep, sin reporte), GON-02-PC1 (1 oct), PUN-03-EN1 (hoy), PUN-02-EN2 (no
  // se pudo) y el resto montado: «Sin montar 3» + «No realizado 1».
  const c = I.montajesPorResolver([
    { estado: "sin_montar", empezo: true }, { estado: "falta_zona", empezo: true }, { estado: "aviso_enviado", empezo: true },
    { estado: "no_realizado", empezo: true }, { estado: "coincide", empezo: true }, { estado: "sin_verificar", empezo: true },
    { estado: "no_coincide", empezo: true },
  ]);
  assert.deepEqual(c, { sinMontar: 3, noRealizado: 1, total: 4 });
  // Lo que todavía no empieza está en «Sin montar» de Montajes, pero no atrasado.
  assert.deepEqual(I.montajesPorResolver([{ estado: "aviso_enviado", empezo: false }]), { sinMontar: 0, noRealizado: 0, total: 0 });
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /montajesPorResolver: porResolver,/, "el Inicio volvió a contar a mano");
  assert.match(v, /\.\.\.\[\.\.\.montajeDeTodo\.sinMontar, \.\.\.montajeDeTodo\.viejos\]\.map/, "el Inicio dejó afuera lo viejo sin reporte");
  // Todo lo que Montajes lista (`todas=1`), no sólo lo que se revisa: al
  // trabajador le faltaban los planogramas que publica administración.
  assert.match(v, /planogramasPorRevisar\.deMontajes\.map\(\(c\) => \(\{ estado: estadoDelPlanograma\(c\.estado\), empezo: c\.dias_que_rige >= 0 \}\)\)/,
    "el Inicio cuenta sólo los planogramas que se revisan");
  const sup = sinComentarios(leer("api", "supervision.ts"));
  assert.match(sup, /export const leerSupervision = [\s\S]{0,300}params: \{ sede, todas: 1 \}/, "el Inicio pide sin todas=1");
  assert.match(sup, /c\.puede_revisar !== false && c\.estado !== "coincide"/, "«Para revisar» se llena con lo que no se revisa");
  const ini = sinComentarios(leer("components", "Inicio", "Inicio.tsx"));
  assert.match(ini, /valor=\{String\(cifras\.montajesPorResolver\.total\)\}/);
});

await prueba("el chip «Sin montar» de Contratos cuenta las filas que dicen «Sin montar» (decía 1 con dos filas)", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /new Set\(\[\.\.\.montaje\.sinMontar, \.\.\.montaje\.viejos\]\.map\(\(e\) => claveDeFila\(e\)\)\)/);
  assert.match(v, /\{ id: "sin_montar", label: "Sin montar", n: cuantas\("sin_montar"\) \}/, "la cuenta del chip no es la de sus filas");
  // La columna dice «Sin montar» de todo lo que corre sin reporte, sin ventana.
  assert.match(v, /if \(estado === "pendiente" && fase !== "vigente"\) return nada;/);
});

await prueba("el mapa cuenta caras y lo dice; lo del mes dice que es del mes", () => {
  const m = sinComentarios(leer("components", "Indicadores", "MapaDeOportunidades.tsx"));
  assert.match(m, /montaje: "Caras con montaje pendiente"/);
  assert.match(m, /Contratos que empiezan en \{datos\.montajesDelMes\.mes\}/);
  assert.equal(I.metrica("montajes_pendientes").nombre, "Caras con montajes pendientes");
  assert.ok(!I.metrica("montajes_pendientes").formula.includes("30 días"), "la definición sigue con la ventana de 30 días");
});

await prueba("con 1 no dice «Ver los 1»", () => {
  assert.equal(I.verEnPendientes(1), "Ver 1 en Pendientes ›");
  assert.equal(I.verEnPendientes(24), "Ver los 24 en Pendientes ›");
  for (const f of ["MapaDeOportunidades.tsx", "Analisis.tsx"]) {
    assert.ok(!/Ver (los|las) \{datos\.pendientes/.test(sinComentarios(leer("components", "Indicadores", f))), `${f} volvió a «Ver los {n}»`);
  }
  const ini = sinComentarios(leer("components", "Inicio", "Inicio.tsx"));
  assert.ok(ini.includes('totalPendientes === 1 ? "Ver el pendiente" : `Ver los ${totalPendientes}`'));
  const dc = sinComentarios(leer("pages", "DetalleCliente.tsx"));
  assert.ok(dc.includes('media.length === 1 ? "Ver la de prioridad media"') && dc.includes('baja.length === 1 ? "Ver la de prioridad baja"'));
});

await prueba("Capacidad por vender nombra a los clientes de las participaciones también para el trabajador", () => {
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.ok(v.includes("if (!isAdmin) for (const f of fixtures) for (const p of partesVendidasDe(f).map((x) => conLaReserva(x, estadoComercial, sede))) {"));
  assert.ok(v.includes("...(deParticipaciones.get(clave) ?? [])"), "los clientes no suman las participaciones");
});

await prueba("la ficha de una cara con entrepaños contratados dice la verdad arriba", () => {
  assert.equal(P.resumenDeLasPartes("entrepanos", ["libre", "libre", "libre", "libre", "libre"]), null);
  const r = P.resumenDeLasPartes("entrepanos", ["corre", "corre", "libre", "libre", "libre"]);
  assert.equal(r.titulo, "Vendido en parte");
  assert.equal(r.texto, "De 5 entrepaños, 2 con contrato: quedan 3 libres para vender. La cara entera no tiene contrato.");
  const p = P.resumenDeLasPartes("puertas", ["corre", "firmada", "libre"]);
  assert.equal(p.texto, "De 3 puertas, 1 con contrato y 1 firmada que todavía no empieza: queda 1 libre para vender. La cara entera no tiene contrato.");
  const t = P.resumenDeLasPartes("entrepanos", ["corre", "corre"]);
  assert.equal(t.titulo, "Vendido por entrepaños");
  assert.match(t.texto, /no queda ninguno libre/);
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  assert.match(v, /\) : !hasContract && enPartes \? \(\s*<div data-vendido-en-parte/, "la ficha volvió a «Disponible para vender» con partes tomadas");
});

await prueba("Historial: el código corto, y lo cancelado dura hasta que dejó de correr (en la tabla y en el Excel)", () => {
  assert.equal(H.codigoCorto("CENTRO-PUN-08", "CENTRO"), "PUN-08");
  assert.equal(H.codigoCorto("NAVE-PUN-08", "CENTRO"), "NAVE-PUN-08", "otra sede no se recorta");
  const noCorrio = { estado: "cancelado", desde: "2027-01-01", hasta: "2027-03-31", cancelado_desde: "2026-11-20" };
  assert.equal(H.hastaQueCorrio(noCorrio), null);
  assert.equal(H.mesesQueDuro(noCorrio), 0, "lo que no llegó a correr no «duró 3 meses»");
  const corrio = { estado: "cancelado", desde: "2026-09-01", hasta: "2027-02-28", cancelado_desde: "2026-11-01" };
  assert.equal(H.hastaQueCorrio(corrio), "2026-10-31");
  assert.equal(H.mesesQueDuro(corrio), 2);
  assert.equal(H.mesesQueDuro({ estado: "terminado", desde: "2026-04-01", hasta: "2026-10-31", cancelado_desde: null }), 7);
  const x = H.filasDelExcel([
    { lease_id: 1, espacio: "CENTRO-PUN-08", proveedor: "Limpio Hogar", marca: null, ...noCorrio },
    { lease_id: 2, espacio: "CENTRO-PUN-07", proveedor: "Galletas Sol", marca: null, ...corrio },
  ], false, "CENTRO");
  assert.deepEqual(x.slice(1).map((f) => [f[0], f[5], f[7]]), [["PUN-08", null, "no llegó a correr"], ["PUN-07", 2, "corrió hasta el 31/10/2026"]]);
  const t = sinComentarios(leer("components", "Indicadores", "Historial.tsx"));
  assert.ok(t.includes("{codigoCorto(f.espacio, sede)}</button>"), "la tabla volvió a la sede adelante");
});

await prueba("el trabajador no ve tareas de administración ni consejos de negociación", () => {
  const m = sinComentarios(leer("components", "Indicadores", "MapaDeOportunidades.tsx"));
  for (const r of ["Gestionar renovación", "Mandar la guía", "Ver detalle"]) {
    for (const l of m.split("\n").filter((x) => x.includes(`"${r}"`))) assert.match(l, /deAdmin\(/, `«${r}» sin deAdmin: ${l.trim()}`);
  }
  assert.ok(m.includes('{plata ? "Plano para contratar" : "Ver el plano"}'));
  assert.ok(m.includes('plata ? "Requieren gestión" : "Avisale a quien administra"'));
  const v = sinComentarios(leer("pages", "DashboardView.tsx"));
  const b = v.slice(v.indexOf("const acciones: AccionDelTablero[] = [];"), v.indexOf("const cartera = new Map"));
  const sueltas = b.split("\n").filter((x) => /boton: "(Gestionar renovación|Ver detalle|Ver ficha)"/.test(x) && !x.includes("planograma"));
  assert.deepEqual(sueltas, [], "una acción de contrato sin botonDe");
  const a = sinComentarios(leer("components", "Indicadores", "Analisis.tsx"));
  const op = a.slice(a.indexOf("const oportunidad = (e: EspacioDelMapa): string => {"));
  assert.match(op, /^const oportunidad = \(e: EspacioDelMapa\): string => \{\s*if \(!plata\) \{/, "el consejo de negociación le llega al trabajador");
  assert.ok(a.includes('{plata ? "Renovar" : "Ver la ficha"}'));
  assert.ok(a.includes('const gestionarRenovaciones = plata ? "Gestionar renovaciones" : "Ver los contratos por vencer";'));
  assert.ok(!a.includes(">Gestionar renovaciones<"), "un «Gestionar renovaciones» suelto");
  const ini = sinComentarios(leer("components", "Inicio", "Inicio.tsx"));
  assert.ok(ini.includes('esAdmin ? "Requieren acción" : "Avisale a quien administra"'));
});

console.log(`\n${n} pruebas · ${fallas ? `${fallas} FALLA(N)` : "el mapa decide con los datos de siempre"}`);
process.exit(fallas ? 1 : 0);
