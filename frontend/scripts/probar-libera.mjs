/**
 * Pruebas de src/components/Libera/acomodo.ts — que ninguna letra de la
 * escalera pise a otra.
 *   npm run probar:libera
 *
 * Sale de una captura del dueño (TERRON, 2026-09-23): un contrato que arrancaba
 * al día siguiente ponía su fecha y su chip contra el borde izquierdo, donde ya
 * estaban «hoy · 23 sep» y «PUN · PUNTA DE GÓNDOLA». Las tres se dibujaban
 * encimadas. El caso exacto va primero; después, las mismas reglas contra
 * cientos de periodos armados al azar, porque dónde caen los cambios no lo
 * elige nadie.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const salida = join(mkdtempSync(join(tmpdir(), "lib-")), "l.mjs");
const { outputFiles } = await build({
  entryPoints: [join(raiz, "src", "components", "Libera", "acomodo.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const A = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

// Los cuerpos de tema.css: --t-2xs (fechas y chips), --lbl-px (título y
// leyenda), --t-base (cifras).
const PX_FECHA = 11.5, PX_LBL = 10.5, PX_CIFRA = 15;
const CHIP_W = 58;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Un panel como el de la captura: 1317 px de caja, 12 de margen. */
function eje({ ancho = 1317, dias = 30, cambios = [], hoy = new Date(2026, 8, 23) } = {}) {
  const X0 = 12, X1 = ancho - 12;
  const x = (i) => X0 + (i * (X1 - X0)) / dias;
  const fecha = (i) => { const d = new Date(hoy); d.setDate(d.getDate() + i); return `${d.getDate()} ${MES[d.getMonth()]}`; };
  const entrada = {
    X0, X1, x, hoy: fecha(0), pxFecha: PX_FECHA, chipW: CHIP_W,
    cambios: cambios.map((i) => ({ i, fecha: fecha(i) })),
  };
  return { entrada, salida: A.acomodarFechas(entrada), x, X0, X1, fecha };
}

/** Las cajas del renglón de las fechas, tal como se dibujan. */
function cajasDeFechas({ entrada, salida }) {
  const cajas = [];
  if (salida.hoy) {
    // «hoy · 23 sep» lleva el doble de aire detrás: es la única fecha que no
    // cuelga de un escalón, y pegada a la siguiente se leían como una sola.
    cajas.push({ que: salida.hoy, x0: entrada.X0, x1: entrada.X0 + A.anchoMono(salida.hoy, PX_FECHA) + A.AIRE });
  }
  for (const c of salida.columnas) {
    const txt = entrada.cambios.find((k) => k.i === c.i).fecha;
    const w = A.anchoMono(txt, PX_FECHA);
    cajas.push({ que: txt, x0: c.cx - w / 2, x1: c.cx + w / 2, i: c.i, w });
  }
  return cajas;
}

function sinPisarse(cajas, aire) {
  for (let a = 0; a < cajas.length; a++) {
    for (let b = a + 1; b < cajas.length; b++) {
      const p = cajas[a], q = cajas[b];
      assert.ok(p.x1 + aire <= q.x0 + 1e-6 || q.x1 + aire <= p.x0 + 1e-6,
        `«${p.que}» [${p.x0.toFixed(1)}–${p.x1.toFixed(1)}] pisa a «${q.que}» [${q.x0.toFixed(1)}–${q.x1.toFixed(1)}]`);
    }
  }
}

console.log("\nLibera · el caso de la captura");

prueba("un contrato que arranca MAÑANA no pisa a «hoy»", () => {
  // 23 sep → 23 oct; PUN-13 arranca el 24 y PUN-09 / ROB-05 se liberan el 1 oct.
  const e = eje({ cambios: [1, 8] });
  assert.equal(e.salida.columnas.length, 2, "algún cambio se quedó sin columna");
  sinPisarse(cajasDeFechas(e), A.AIRE);
});

prueba("«hoy» no se acorta: pegado a «24 sep» se leía «hoy 24 sep»", () => {
  // La primera versión de este arreglo lo acortaba a «hoy», y la captura
  // decía que hoy era 24. Entra entero, con su fecha, o no se escribe.
  const e = eje({ cambios: [1, 8] });
  assert.equal(e.salida.hoy, null, `quedó «${e.salida.hoy}» al lado de «24 sep»`);
  const lejos = eje({ cambios: [5, 12] });
  assert.equal(lejos.salida.hoy, "hoy · 23 sep", "con lugar de sobra, «hoy» no se escribió entero");
});

prueba("y su fecha sigue encima de su diente", () => {
  const e = eje({ cambios: [1, 8] });
  for (const c of cajasDeFechas(e).filter((k) => k.i !== undefined)) {
    const xi = e.x(c.i);
    assert.ok(c.x0 <= xi - 2 && c.x1 >= xi + 2,
      `«${c.que}» [${c.x0.toFixed(1)}–${c.x1.toFixed(1)}] ya no tapa su día (x=${xi.toFixed(1)})`);
  }
});

prueba("la leyenda de los tipos va en el renglón del título, a la derecha, sin tocarlo", () => {
  const titulo = "Espacios libres a lo largo del periodo";
  const finTitulo = 12 + A.anchoMono(titulo, PX_LBL, 0.16);
  const r = A.leyendaQueEntra(finTitulo, 1305, ["PUN · PUNTA DE GÓNDOLA", "ROB · ROBATOPE"], PX_LBL, 0.16, 22);
  assert.equal(r.length, 2, "se soltó una entrada que entraba");
  assert.ok(r[0].x >= finTitulo + A.AIRE, "la leyenda se mete en el título");
  const ultimo = r[r.length - 1];
  assert.ok(ultimo.x + A.anchoMono(ultimo.txt, PX_LBL, 0.16) <= 1305 + 1e-6, "se sale por la derecha");
  assert.ok(r[0].x + A.anchoMono(r[0].txt, PX_LBL, 0.16) + 22 <= r[1].x + 1e-6, "las dos entradas se tocan");
});

console.log("\nLibera · las reglas, contra periodos al azar");

// Un generador con semilla: la prueba tiene que fallar igual dos veces.
let semilla = 20260923;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);

const CASOS = Array.from({ length: 600 }, () => {
  const dias = [1, 7, 14, 30, 31, 45, 60, 90, 180, 365][Math.floor(azar() * 10)];
  const ancho = [880, 974, 1100, 1317, 1600][Math.floor(azar() * 5)];
  const n = Math.floor(azar() * Math.min(dias, 14));
  const cambios = [...new Set(Array.from({ length: n }, () => 1 + Math.floor(azar() * dias)))]
    .filter((i) => i >= 1 && i <= dias).sort((a, b) => a - b);
  return { dias, ancho, cambios };
});

prueba("ninguna fecha pisa a otra ni a «hoy»", () => {
  for (const c of CASOS) sinPisarse(cajasDeFechas(eje(c)), A.AIRE - 1e-6);
});

prueba("ninguna columna de chips pisa a la de al lado", () => {
  for (const c of CASOS) {
    const cols = eje(c).salida.columnas;
    for (let k = 1; k < cols.length; k++) {
      assert.ok(cols[k].cx - cols[k - 1].cx >= CHIP_W + 2 - 1e-6,
        `${c.dias} días, ${c.ancho} px: chips a ${(cols[k].cx - cols[k - 1].cx).toFixed(1)} px`);
    }
  }
});

prueba("nada se sale del panel", () => {
  for (const c of CASOS) {
    const e = eje(c);
    for (const k of cajasDeFechas(e)) {
      assert.ok(k.x0 >= e.X0 - 1e-6 && k.x1 <= e.X1 + 1e-6, `«${k.que}» se sale (${k.x0.toFixed(1)}–${k.x1.toFixed(1)})`);
    }
    for (const col of e.salida.columnas) {
      assert.ok(col.cx - CHIP_W / 2 >= e.X0 - 1e-6 && col.cx + CHIP_W / 2 <= e.X1 + 1e-6, "un chip se sale del panel");
    }
  }
});

prueba("una fecha nunca se corre tanto que deje de tapar su día (salvo contra el borde)", () => {
  for (const c of CASOS) {
    const e = eje(c);
    for (const k of cajasDeFechas(e).filter((q) => q.i !== undefined)) {
      const xi = e.x(k.i);
      const contraElBorde = k.x0 <= e.X0 + CHIP_W - k.w / 2 + 1e-6 || k.x1 >= e.X1 - CHIP_W + k.w / 2 - 1e-6;
      if (contraElBorde) continue;
      assert.ok(k.x0 <= xi - 2 + 1e-6 && k.x1 >= xi + 2 - 1e-6,
        `${c.dias} días: «${k.que}» corrida a ${(k.x0 + k.w / 2 - xi).toFixed(1)} px de su día`);
    }
  }
});

prueba("el primer cambio SIEMPRE tiene columna: es el dato del gráfico", () => {
  for (const c of CASOS.filter((k) => k.cambios.length > 0)) {
    const e = eje(c);
    assert.equal(e.salida.columnas[0]?.i, c.cambios[0],
      `${c.dias} días, ${c.ancho} px: el primer cambio (día ${c.cambios[0]}) se quedó sin columna`);
  }
});

prueba("«hoy» se escribe entero o no se escribe, y sólo cede ante el primer cambio", () => {
  for (const c of CASOS) {
    const e = eje(c);
    if (e.salida.hoy !== null) {
      assert.equal(e.salida.hoy, `hoy · ${e.fecha(0)}`, `quedó «${e.salida.hoy}»`);
      continue;
    }
    // Se fue: tiene que haber un primer cambio que, con «hoy» puesto, no entraba.
    assert.ok(e.salida.columnas.length > 0, `${c.dias} días: «hoy» se fue sin ningún cambio que lo pidiera`);
    // Lo más a la derecha que puede ir su fecha es con el borde izquierdo a
    // 2 px de su diente; si ni así libra a «hoy» y su aire, «hoy» tenía que irse.
    const xi = e.x(e.entrada.cambios[0].i);
    const finHoy = e.X0 + A.anchoMono(`hoy · ${e.fecha(0)}`, PX_FECHA) + 2 * A.AIRE;
    assert.ok(xi - 2 < finHoy + 1e-6,
      `${c.dias} días: «hoy» se fue aunque el primer cambio (día ${e.entrada.cambios[0].i}) entraba con él`);
  }
});

console.log("\nLibera · las cifras y la nota");

prueba("dos escalones a un día de distancia no encima sus cifras", () => {
  const cifras = [
    { x: 14, y: 60, txt: "31" },
    { x: 55, y: 72, txt: "30" },
    { x: 60, y: 60, txt: "31" },
  ];
  const v = A.cifrasQueEntran(cifras, PX_CIFRA, -0.02);
  assert.deepEqual(v, [true, true, false]);
});

prueba("la cifra de partida se dibuja siempre", () => {
  const v = A.cifrasQueEntran([{ x: 14, y: 60, txt: "31" }, { x: 15, y: 60, txt: "30" }], PX_CIFRA);
  assert.equal(v[0], true);
  assert.equal(v[1], false);
});

prueba("la nota del primer tramo usa la versión que entra, o ninguna", () => {
  const largo = "sin cambios durante 25 días", corto = "25 días sin cambios";
  assert.equal(A.notaQueEntra(40, 1000, [largo, corto], PX_FECHA), largo);
  const justo = 40 + A.anchoMono(corto, PX_FECHA) + A.AIRE + 1;
  assert.equal(A.notaQueEntra(40, justo, [largo, corto], PX_FECHA), corto);
  assert.equal(A.notaQueEntra(40, 60, [largo, corto], PX_FECHA), null);
});

prueba("una leyenda que no cabe suelta desde la última entrada, nunca la primera", () => {
  const r = A.leyendaQueEntra(12 + 303, 700, ["PUN · PUNTA DE GÓNDOLA", "ROB · ROBATOPE", "IMP · IMPULSADOR DE MARCA"], PX_LBL, 0.16, 22);
  assert.ok(r.length >= 1 && r[0].txt.startsWith("PUN"), "se soltó la primera");
  assert.ok(r.length < 3, "entraron las tres en 385 px");
});

console.log("\nLibera · el componente usa las reglas");

const libera = readFileSync(join(raiz, "src", "components", "Libera", "Libera.tsx"), "utf8");
const css = readFileSync(join(raiz, "src", "vender.css"), "utf8");

prueba("la leyenda de los tipos no vuelve al renglón de los chips", () => {
  const usos = libera.split("\n").filter((l) => /style=\{tipoT\}/.test(l));
  assert.ok(usos.length > 0, "no se encontró la leyenda");
  for (const l of usos) assert.match(l, /y="13"/, `la leyenda se dibuja fuera del renglón del título: ${l.trim()}`);
});

prueba("las fechas bajo el eje salen de las columnas, no de todos los cambios", () => {
  assert.ok(!/cambios\.map\(\(\[i\]\) => \(\s*<text[^>]*YE \+ 20/.test(libera),
    "vuelve a escribir una fecha por cada cambio, entre en el renglón o no");
  assert.match(libera, /acomodarFechas\(/);
});

prueba("el chip de un contrato que ARRANCA no se pinta como uno que se libera", () => {
  assert.match(libera, /sentido === "sale" \? " sale"/, "el chip no distingue el sentido");
  assert.match(css, /\.gChip\.sale rect\s*\{[^}]*--ocupado/, "el chip que sale no va con el color de «Tomado»");
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? " — HAY FALLAS" : ""}\n`);
