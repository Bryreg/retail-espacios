/**
 * Pruebas de src/utils/camaraPlano.ts — la cámara del plano de la sede.
 *   npm run probar:camara
 *
 * El dueño pidió mover el mapa de Vender y de Supervisar «de la misma manera
 * que se mueve en el editor 3D», arrancando desde la vista superior. Lo que se
 * fija acá:
 *
 *  · Los gestos hacen lo mismo que el OrbitControls del editor, con sus
 *    mismas cuentas: cuánto gira un arrastre, cuánto acerca un clic de rueda,
 *    que mover arrastre la sala pegada al puntero.
 *  · La vista con la que abre es el plano 2D: x a la derecha, z hacia abajo, y
 *    sin un solo lado de mueble a la vista.
 *  · Ningún mueble se pinta encima de otro que en realidad lo tapa. Esto se
 *    comprueba como lo vería un ojo: tirando rayos desde la cámara contra los
 *    prismas, en cientos de vistas al azar, y comparando lo que el rayo toca
 *    primero con lo que el pintor dejó arriba.
 *  · Vender y Supervisar muestran el MISMO plano, del mismo alto y con los
 *    mismos colores de rótulo; y la tabla de Supervisar no le regala al
 *    proveedor el ancho que sobra, y filtra con el mismo filtro que el plano.
 *    Eso último lo pidió el dueño en la misma captura que la cámara.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const salida = join(mkdtempSync(join(tmpdir(), "cam-")), "c.mjs");
const { outputFiles } = await build({
  entryPoints: [join(raiz, "src", "utils", "camaraPlano.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);
const C = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};
const cerca = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const GRADO = Math.PI / 180;

let semilla = 7351;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);

console.log("\ncámara · la vista con la que abre");

prueba("la vista superior es el plano 2D: x a la derecha, z hacia abajo", () => {
  const e = C.ejes(C.VISTA_SUPERIOR);
  for (const [x, y, z] of [[0, 0, 0], [3, 1.8, 7], [-4, 0.4, 2.5], [12, 3, -6]]) {
    const [sx, sy] = C.proyectar(e, x, y, z);
    assert.ok(cerca(sx, x) && cerca(sy, z), `(${x}, ${y}, ${z}) cayó en (${sx}, ${sy})`);
  }
});

prueba("desde arriba no se ve ningún lado de ningún mueble", () => {
  assert.deepEqual(C.ladosVisibles(C.ejes(C.VISTA_SUPERIOR)), []);
});

prueba("inclinada se ven los dos lados que dan a la cámara, y ninguno de atrás", () => {
  // Como el isométrico de antes: la cámara del lado de +x y +z.
  assert.deepEqual(C.ladosVisibles(C.ejes({ az: 45 * GRADO, pol: 60 * GRADO })).sort(), ["x+", "z+"]);
  assert.deepEqual(C.ladosVisibles(C.ejes({ az: 225 * GRADO, pol: 60 * GRADO })).sort(), ["x-", "z-"]);
  assert.deepEqual(C.ladosVisibles(C.ejes({ az: 0, pol: 30 * GRADO })), ["z+"]);
});

prueba("con la cámara del isométrico, la luz es la de antes (0,14 izquierda · 0,26 derecha)", () => {
  const e = C.ejes({ az: 45 * GRADO, pol: 60 * GRADO });
  assert.ok(cerca(C.sombraDelLado(e, "z+"), 0.14, 0.002), `izquierda ${C.sombraDelLado(e, "z+")}`);
  assert.ok(cerca(C.sombraDelLado(e, "x+"), 0.26, 0.002), `derecha ${C.sombraDelLado(e, "x+")}`);
});

console.log("\ncámara · los gestos del editor (OrbitControls)");

prueba("arrastrar el ALTO entero del lienzo es una vuelta completa", () => {
  const v = { az: 0.3, pol: 0.5 };
  const vuelta = C.girar(v, 600, 0, 600);
  assert.ok(cerca(Math.cos(vuelta.az), Math.cos(v.az), 1e-9) && cerca(Math.sin(vuelta.az), Math.sin(v.az), 1e-9),
    "una vuelta no volvió al mismo azimut");
  const media = C.girar(v, 300, 0, 600);
  assert.ok(cerca(Math.cos(media.az), Math.cos(v.az - Math.PI), 1e-9), "medio alto no es media vuelta");
});

prueba("hacia la derecha baja el azimut, como en el editor", () => {
  assert.ok(C.girar({ az: 0, pol: 0.5 }, 10, 0, 600).az < 0);
});

prueba("arrastrar hacia abajo sube la cámara hacia la vista superior, y no pasa de ahí", () => {
  const v = C.girar({ az: 0, pol: 0.8 }, 0, 50, 600);
  assert.ok(v.pol < 0.8, "no subió");
  assert.equal(C.girar({ az: 0, pol: 0.1 }, 0, 600, 600).pol, 0, "pasó de la vertical");
});

prueba("hacia arriba baja hasta el tope del editor (π / 2,1), nunca por debajo del piso", () => {
  const v = C.girar({ az: 0, pol: 0 }, 0, -5000, 600);
  assert.ok(cerca(v.pol, Math.PI / 2.1), `quedó en ${v.pol}`);
});

prueba("un clic de rueda acerca 1/0,95 y aleja 0,95, como OrbitControls", () => {
  assert.ok(cerca(C.factorDeRueda(-100), 1 / 0.95, 1e-12));
  assert.ok(cerca(C.factorDeRueda(100), 0.95, 1e-12));
  assert.equal(C.factorDeRueda(0), 1);
});

prueba("la rueda que cuenta líneas y el pellizco del panel táctil se normalizan igual", () => {
  assert.ok(cerca(C.factorDeRueda(3, 1), Math.pow(0.95, 0.48), 1e-12), "líneas × 16");
  assert.ok(cerca(C.factorDeRueda(1, 2), 0.95, 1e-12), "páginas × 100");
  assert.ok(cerca(C.factorDeRueda(-2, 0, true), 1 / Math.pow(0.95, 0.2), 1e-12), "pellizco × 10");
});

prueba("mover arrastra la sala pegada al puntero, con la cámara como esté", () => {
  for (let k = 0; k < 300; k++) {
    const e = C.ejes({ az: (azar() - 0.5) * 2 * Math.PI, pol: azar() * C.POLAR_MAX });
    const sx = (azar() - 0.5) * 40, sy = (azar() - 0.5) * 40;
    const [x, y, z] = C.enElMundo(e, sx, sy);
    const [px, py] = C.proyectar(e, x, y, z);
    assert.ok(cerca(px, sx, 1e-9) && cerca(py, sy, 1e-9), `(${sx}, ${sy}) volvió como (${px}, ${py})`);
  }
});

console.log("\ncámara · nadie se pinta encima de lo que lo tapa");

/** Lo que VE el ojo en un punto de pantalla: el prisma que el rayo toca más
 *  cerca de la cámara, o -1. */
function loQueSeVe(huellas, e, sx, sy) {
  const [vx, vy, vz] = C.enElMundo(e, sx, sy);
  const o = [e.sp * e.sa, e.cp, e.sp * e.ca];   // hacia la cámara
  let mejor = -1, lam = -Infinity, empate = false;
  huellas.forEach((h, i) => {
    let lo = -Infinity, hi = Infinity;
    for (const [v, d, a, b] of [[vx, o[0], h.x0, h.x1], [vy, o[1], 0, h.h], [vz, o[2], h.z0, h.z1]]) {
      if (Math.abs(d) < 1e-12) { if (v < a || v > b) { lo = Infinity; } continue; }
      let t0 = (a - v) / d, t1 = (b - v) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    }
    if (lo > hi) return;
    if (hi > lam + 1e-7) { mejor = i; lam = hi; empate = false; }
    else if (Math.abs(hi - lam) <= 1e-7) empate = true;
  });
  return { i: mejor, empate };
}

/** Lo que dejó el PINTOR en ese punto: el último de la lista que lo cubre. */
function loQuePinto(huellas, e, orden, sx, sy) {
  for (let k = orden.length - 1; k >= 0; k--) {
    const r = loQueSeVe([huellas[orden[k]]], e, sx, sy);
    if (r.i === 0) return orden[k];
  }
  return -1;
}

function comparar(huellas, vista, muestras = 70) {
  const e = C.ejes(vista);
  const orden = C.ordenDePintado(huellas, e);
  assert.equal(new Set(orden).size, huellas.length, "el orden perdió o repitió muebles");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const h of huellas) for (const x of [h.x0, h.x1]) for (const z of [h.z0, h.z1]) for (const y of [0, h.h]) {
    const [sx, sy] = C.proyectar(e, x, y, z);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  for (let a = 0; a < muestras; a++) {
    for (let b = 0; b < muestras; b++) {
      const sx = x0 + ((a + 0.37) / muestras) * (x1 - x0);
      const sy = y0 + ((b + 0.61) / muestras) * (y1 - y0);
      const ojo = loQueSeVe(huellas, e, sx, sy);
      if (ojo.i < 0 || ojo.empate) continue;
      const pintor = loQuePinto(huellas, e, orden, sx, sy);
      if (pintor !== ojo.i) {
        return `en (${sx.toFixed(2)}, ${sy.toFixed(2)}) se ve el ${ojo.i} y quedó pintado el ${pintor}`
          + ` — vista az=${(vista.az / GRADO).toFixed(0)}° pol=${(vista.pol / GRADO).toFixed(0)}°`;
      }
    }
  }
  return null;
}

prueba("la góndola larga con un mueble chico detrás de su punta: el orden por centro fallaba", () => {
  // El caso de libro: la góndola está DELANTE, pero su centro queda lejos, en
  // la otra punta, y el chico parece más cercano. `cx + cz` lo pintaba encima.
  const gondola = { x0: 0, x1: 10, z0: 1, z1: 2, h: 2 };
  const chico = { x0: 9, x1: 9.5, z0: 0.3, z1: 0.8, h: 1.8 };
  const vista = { az: 45 * GRADO, pol: 60 * GRADO };
  const porCentro = [gondola, chico].map((h, i) => [i, (h.x0 + h.x1) / 2 + (h.z0 + h.z1) / 2])
    .sort((a, b) => a[1] - b[1]).map(([i]) => i);
  assert.deepEqual(porCentro, [0, 1], "el ejemplo ya no reproduce la falla del orden por centro");
  const orden = C.ordenDePintado([gondola, chico], C.ejes(vista));
  assert.deepEqual(orden, [1, 0], "la góndola que está delante quedó pintada debajo");
  assert.equal(comparar([gondola, chico], vista), null);
});

/** Una sala al azar: muebles sobre una grilla, sin encimarse, algunos largos. */
function salaAlAzar() {
  const huellas = [];
  const ocupado = (h) => huellas.some((o) => h.x0 < o.x1 && o.x0 < h.x1 && h.z0 < o.z1 && o.z0 < h.z1);
  for (let k = 0; k < 60 && huellas.length < 18; k++) {
    const largo = azar() < 0.3;
    const w = largo ? 3 + azar() * 7 : 0.3 + azar() * 1.5;
    const d = largo ? 0.4 + azar() * 0.6 : 0.3 + azar() * 1.2;
    const girado = azar() < 0.5;
    const [ww, dd] = girado ? [d, w] : [w, d];
    const x0 = Math.round(azar() * 20 * 10) / 10, z0 = Math.round(azar() * 14 * 10) / 10;
    const h = { x0, x1: x0 + ww, z0, z1: z0 + dd, h: 0.4 + azar() * 2.4 };
    if (!ocupado(h)) huellas.push(h);
  }
  return huellas;
}

prueba("en 150 salas al azar y vistas al azar, el pintor deja arriba lo que el ojo ve", () => {
  for (let k = 0; k < 150; k++) {
    const sala = salaAlAzar();
    const vista = { az: (azar() - 0.5) * 2 * Math.PI, pol: azar() * C.POLAR_MAX };
    const falla = comparar(sala, vista, 45);
    assert.equal(falla, null, falla ?? "");
  }
});

prueba("con la cámara casi al ras del piso también", () => {
  for (let k = 0; k < 40; k++) {
    const falla = comparar(salaAlAzar(), { az: (azar() - 0.5) * 2 * Math.PI, pol: C.POLAR_MAX }, 45);
    assert.equal(falla, null, falla ?? "");
  }
});

prueba("muebles encimados (un plano con errores) no cuelgan el orden: salen todos", () => {
  const encimados = [
    { x0: 0, x1: 2, z0: 0, z1: 1, h: 1 },
    { x0: 1, x1: 3, z0: 0.5, z1: 1.5, h: 2 },
    { x0: 0.5, x1: 2.5, z0: 0.2, z1: 1.2, h: 1.5 },
  ];
  const orden = C.ordenDePintado(encimados, C.ejes({ az: 0.4, pol: 0.9 }));
  assert.deepEqual([...orden].sort(), [0, 1, 2]);
});

console.log("\ncámara · el mapa usa la cámara");

const vista = readFileSync(join(raiz, "src", "pages", "DashboardView.tsx"), "utf8");
const inicioIso = vista.indexOf("function IsoMap(");
const iso = vista.slice(inicioIso, vista.indexOf("\nfunction ", inicioIso + 10));

prueba("el mapa proyecta con la cámara y no con el isométrico fijo", () => {
  assert.ok(inicioIso > 0, "no se encontró IsoMap");
  assert.match(iso, /ordenDePintado\(/, "el mapa no ordena con ordenDePintado");
  assert.match(iso, /proyectar\(/, "el mapa no proyecta con la cámara");
  assert.ok(!/\biso\(/.test(iso), "quedó una llamada al isométrico fijo");
  assert.ok(!/cx \+ a\.cz|a\.cx \+ a\.cz/.test(iso), "volvió el orden por centro");
});

prueba("abre en la vista superior y «Centrar» vuelve a ella", () => {
  assert.match(iso, /useState<Vista>\(VISTA_SUPERIOR\)/, "no abre en la vista superior");
  const i = iso.indexOf("const centrar = useCallback(");
  assert.ok(i > 0, "no se encontró `centrar`");
  const cuerpo = iso.slice(i, iso.indexOf("}, [", i));
  assert.match(cuerpo, /setVista\(VISTA_SUPERIOR\)/, "«Centrar» no vuelve a la vista superior");
  assert.match(cuerpo, /zoom: 1/, "«Centrar» no vuelve a encuadrar la sede entera");
  const boton = iso.slice(iso.lastIndexOf("<button", iso.indexOf(">\n          Centrar")), iso.indexOf(">\n          Centrar"));
  assert.match(boton, /centrar\(\)/, "el botón «Centrar» no llama a `centrar()`");
});

prueba("los gestos son los del editor: izquierdo gira, derecho o Shift mueve, rueda acerca", () => {
  assert.match(iso, /girar\(/, "el arrastre no gira");
  assert.match(iso, /button === 2/, "el botón derecho no mueve");
  assert.match(iso, /shiftKey/, "Shift + arrastre no mueve");
  assert.match(iso, /factorDeRueda\(/, "la rueda no usa la cuenta del editor");
  assert.match(iso, /onContextMenu/, "el menú del botón derecho tapa el arrastre");
});

console.log("\ncámara · el mismo plano en Vender y en Supervisar");

prueba("las dos pantallas usan el plano sin opciones propias de encuadre", () => {
  // Supervisar pasaba `rotulos="elegido"` y se medía con la proporción del
  // dibujo: el mismo plano salía mucho más grande que en Vender.
  const usos = [...vista.matchAll(/<IsoMap\b[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.equal(usos.length, 2, `se esperaban dos planos (Vender y Supervisar), hay ${usos.length}`);
  for (const u of usos) {
    assert.ok(!/\b(rotulos|enfocar|llenar|herramientas)\b/.test(u), `un plano con opciones propias:\n${u}`);
  }
});

prueba("la tarjeta del plano de Supervisar mide lo mismo que el panel de Vender", () => {
  const i = vista.indexOf("const tarjetaMapa = ");
  assert.ok(i > 0, "no se encontró la tarjeta del plano de Supervisar");
  assert.match(vista.slice(i, i + 400), /height: "var\(--alto-plano\)"/, "Supervisar no usa `--alto-plano`");
  const css = readFileSync(join(raiz, "src", "vender.css"), "utf8");
  assert.match(css, /--alto-plano:\s*max\(448px/, "falta `--alto-plano` (con el piso de la fila 1 de Vender)");
  assert.match(css, /550 \/ 804/, "`--alto-plano` ya no reparte como la hoja de Vender (550 : 254)");
});

prueba("los colores del rótulo cuelgan del lienzo, que está en las dos pantallas", () => {
  // Vivían en `.vender`: en Supervisar el rótulo salía negro y sin halo, y en
  // oscuro no se leía.
  const css = readFileSync(join(raiz, "src", "vender.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const bloque = (sel) => {
    const m = new RegExp(`(^|\\n)${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
    return m ? m[2] : "";
  };
  const lienzo = bloque(".plano-lienzo");
  for (const v of ["--pl-cod", "--pl-piso", "--pl-codsel", "--pl-halosel"]) {
    assert.match(lienzo, new RegExp(`${v}\\s*:`), `\`${v}\` no está en \`.plano-lienzo\``);
  }
  assert.ok(!/--pl-cod\s*:/.test(bloque(".vender")), "`--pl-cod` volvió a `.vender`: Supervisar se queda sin él");
});

console.log("\nsupervisar · «Estado por espacio»");

const inicioTabla = vista.indexOf("function SpacesTable(");
const tabla = vista.slice(inicioTabla, vista.indexOf("\nfunction ", inicioTabla + 10));

prueba("el proveedor mide su nombre más largo y no se lleva el ancho que sobra", () => {
  assert.ok(inicioTabla > 0, "no se encontró SpacesTable");
  assert.match(tabla, /etiqueta: "Proveedor", ancho: anchos\.proveedor/, "Proveedor volvió a no tener ancho");
  assert.match(tabla, /width: anchoDatos/, "la tabla volvió al 100 % del ancho: el sobrante cae entre columnas");
  assert.ok(!/width: "100%"/.test(tabla), "la tabla volvió al 100 % del ancho");
});

prueba("la tabla tiene su filtro, y es el mismo del plano", () => {
  assert.match(vista, /<FiltroTexto valor=\{mapQuery\} onCambio=\{setMapQuery\} etiqueta="Filtrar la tabla"/,
    "la tabla no tiene filtro, o filtra con otro valor que el plano");
  assert.match(vista, /<FiltroTexto valor=\{mapQuery\} onCambio=\{setMapQuery\} etiqueta="Filtrar el plano"/,
    "el plano perdió su filtro");
});

prueba("filtrar encuentra también por el tipo del espacio", () => {
  const i = vista.indexOf("function faceMatchesQuery(");
  assert.ok(i > 0, "no se encontró faceMatchesQuery");
  assert.match(vista.slice(i, vista.indexOf("\n}\n", i)), /rateTypeLabel\(rateTypeOf\(entry\.fixture\)\)/,
    "«punta» o «impulsador» ya no filtran");
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? " — HAY FALLAS" : ""}\n`);
