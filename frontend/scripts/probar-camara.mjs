/**
 * Pruebas de src/utils/camaraPlano.ts — la cámara del plano de la sede.
 *   npm run probar:camara
 *
 * El dueño pidió mover el mapa de Vender y de Supervisar «de la misma manera
 * que se mueve en el editor 3D», sin que el mapa deje de verse como se veía. Lo
 * que se fija acá:
 *
 *  · Los gestos hacen lo mismo que el OrbitControls del editor, con sus
 *    mismas cuentas: cuánto gira un arrastre, cuánto acerca un clic de rueda,
 *    que mover arrastre la sala pegada al puntero.
 *  · La vista con la que abre es el isométrico que el plano tuvo siempre: la
 *    misma proyección, el mismo achatado de las alturas y el mismo encuadre.
 *    (La primera versión abría desde arriba y el dueño la devolvió: «antes se
 *    veía mejor».) La vista superior sigue estando, arrastrando hacia abajo.
 *  · Ningún mueble se pinta encima de otro que en realidad lo tapa. Esto se
 *    comprueba como lo vería un ojo: tirando rayos desde la cámara contra los
 *    prismas, en cientos de vistas al azar, y comparando lo que el rayo toca
 *    primero con lo que el pintor dejó arriba.
 *  · Vender y Supervisar muestran el MISMO plano, en una celda del mismo tamaño
 *    —Supervisar es una hoja con la rejilla de Vender— y con los mismos colores
 *    de rótulo; y la tabla de Supervisar llena su columna sin huecos y filtra
 *    con el mismo filtro que el plano.
 *  · La cámara del EDITOR 3D (`frenarMira` y `sanearOrbita` de `utils/planta.ts`)
 *    no pasa por debajo del piso: paneando inclinada, la mira bajaba de y = 0
 *    y la cámara la seguía (y se guardaba así). El freno sólo traslada mira y
 *    cámara juntas: no gira nada ni apaga el paneo vertical.
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

/** El isométrico de antes, tal cual estaba escrito en DashboardView. */
const S = 14;
const isoViejo = (x, z, y) => [(x - z) * 0.866 * S, (x + z) * 0.5 * S - y * S * 0.55];

prueba("abre con el isométrico de siempre: la misma proyección que la fórmula vieja", () => {
  const e = C.ejes(C.VISTA_INICIAL);
  for (let k = 0; k < 200; k++) {
    const x = (azar() - 0.5) * 60, z = (azar() - 0.5) * 60, y = azar() * 3;
    const [sx, sy] = C.proyectar(e, x, y * C.ALTURA, z).map((v) => v / C.UNIDAD_ISO);
    const [vx, vy] = isoViejo(x, z, y);
    // 0,866 es √3/2 redondeado: la diferencia es de milésimas por metro.
    assert.ok(Math.abs(sx - vx) < 0.01 * (1 + Math.abs(vx)) && Math.abs(sy - vy) < 0.01 * (1 + Math.abs(vy)),
      `(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}): ahora (${sx.toFixed(2)}, ${sy.toFixed(2)}), antes (${vx.toFixed(2)}, ${vy.toFixed(2)})`);
  }
});

prueba("el encuadre con el que abre es el viewBox de antes: la caja más 26 unidades por lado", () => {
  const puntos = [[-10, 0, -8], [10, 0, -8], [10, 0, 8], [-10, 0, 8], [2, 1, 3]];
  const r = C.encuadreInicial(puntos);
  const viejos = puntos.map(([x, y, z]) => isoViejo(x, z, y / C.ALTURA));
  const ancho = Math.max(...viejos.map((p) => p[0])) - Math.min(...viejos.map((p) => p[0])) + 52;
  const alto = Math.max(...viejos.map((p) => p[1])) - Math.min(...viejos.map((p) => p[1])) + 52;
  assert.ok(Math.abs(r.ancho / C.UNIDAD_ISO - ancho) < 0.5, `ancho ${r.ancho / C.UNIDAD_ISO} contra ${ancho}`);
  assert.ok(Math.abs(r.alto / C.UNIDAD_ISO - alto) < 0.5, `alto ${r.alto / C.UNIDAD_ISO} contra ${alto}`);
});

prueba("se gira alrededor del punto del PISO que cae en el centro del encuadre", () => {
  const puntos = [[-12, 0, -3], [7, 0, -3], [7, 0, 15], [-12, 0, 15], [0, 1.5, 0]];
  const r = C.encuadreInicial(puntos);
  assert.equal(r.mira[1], 0, "el punto de mira quedó en el aire");
  const e = C.ejes(C.VISTA_INICIAL);
  const ps = puntos.map(([x, y, z]) => C.proyectar(e, x, y, z));
  const cx = (Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2;
  const cy = (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2;
  const [mx, my] = C.proyectar(e, ...r.mira);
  assert.ok(cerca(mx, cx, 1e-9) && cerca(my, cy, 1e-9), `mira en (${mx}, ${my}), centro (${cx}, ${cy})`);
});

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

prueba("abre con el isométrico de siempre y «Centrar» vuelve a él", () => {
  assert.match(iso, /useState<Vista>\(VISTA_INICIAL\)/, "no abre con el isométrico de siempre");
  assert.match(iso, /\* ALTURA/, "las alturas no se achatan como en el isométrico de siempre");
  assert.match(iso, /encuadreInicial\(/, "no encuadra como encuadraba el isométrico de siempre");
  const i = iso.indexOf("const centrar = useCallback(");
  assert.ok(i > 0, "no se encontró `centrar`");
  const cuerpo = iso.slice(i, iso.indexOf("}, [", i));
  assert.match(cuerpo, /setVista\(VISTA_INICIAL\)/, "«Centrar» no vuelve a la vista de siempre");
  assert.match(cuerpo, /zoom: 1/, "«Centrar» no vuelve a encuadrar la sede entera");
  // «Centrar» es un botón de ícono (`Focus`, hoja de piezas del rediseño): la
  // palabra vive en el `aria-label`. Se busca ESE botón —el que se llama
  // «Centrar el plano»— y tiene que llamar a `centrar()` y dibujar el ícono;
  // acercar y alejar, lo mismo con `Plus` y `Minus` y su cuenta.
  const botonDe = (etiqueta) => {
    const i = iso.indexOf(`aria-label="${etiqueta}"`);
    assert.ok(i > 0, `no está el botón «${etiqueta}» del plano`);
    const desde = iso.lastIndexOf("<button", i);
    return iso.slice(desde, iso.indexOf("</button>", i));
  };
  const centrarB = botonDe("Centrar el plano");
  assert.match(centrarB, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); centrar\(\); \}\}/, "el botón «Centrar» no llama a `centrar()`");
  assert.match(centrarB, /<Focus \{\.\.\.ICONO_TARJETA\} \/>/, "«Centrar» no dibuja el ícono `Focus` con la medida de todos");
  assert.match(centrarB, /title="Centrar[^"]*"/, "«Centrar» perdió la palabra también en el `title`");
  const mas = botonDe("Acercar el plano");
  assert.match(mas, /ponerZoom\(cam\.current\.zoom \* 1\.25\)/, "«+» no acerca");
  assert.match(mas, /<Plus \{\.\.\.ICONO_TARJETA\} \/>/, "«+» no es el ícono `Plus`");
  const menos = botonDe("Alejar el plano");
  assert.match(menos, /ponerZoom\(cam\.current\.zoom \/ 1\.25\)/, "«−» no aleja");
  assert.match(menos, /<Minus \{\.\.\.ICONO_TARJETA\} \/>/, "«−» no es el ícono `Minus`");
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

prueba("Supervisar es una hoja con las columnas y el alto de fila de Vender", () => {
  const css = readFileSync(join(raiz, "src", "vender.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const regla = (sel) => new RegExp(`${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const vender = regla(".vender-hoja");
  const supervisar = regla(".supervisar-hoja");
  assert.ok(supervisar, "no hay `.supervisar-hoja`");
  assert.match(vender, /1004fr 402fr/, "cambió la proporción de la hoja de Vender: ajustar las dos");
  assert.match(supervisar, /minmax\(0, 1004fr\) minmax\(0, 402fr\)/, "Supervisar no usa las columnas de Vender");
  assert.match(supervisar, /grid-auto-rows:\s*var\(--alto-plano\)/, "las filas de Supervisar no miden lo que el plano de Vender");
  assert.match(css, /--alto-plano:\s*max\(448px/, "falta `--alto-plano` (con el piso de la fila 1 de Vender)");
  assert.match(css, /550 \/ 804/, "`--alto-plano` ya no reparte como la hoja de Vender (550 : 254)");
  assert.match(vista, /className="supervisar-hoja"/, "Supervisar no arma su hoja");
});

prueba("en la hoja, la tabla va debajo del plano y «Quién paga el canon» debajo de «Para revisar»", () => {
  const i = vista.indexOf('className="supervisar-hoja"');
  const trozo = vista.slice(i, vista.indexOf("── Overlays", i));
  const orden = ["{tarjetaMapa}", 'title="Para revisar"', "<SpacesTable", 'title="Quién paga el canon"']
    .map((t) => [t, trozo.indexOf(t)]);
  for (const [t, k] of orden) assert.ok(k >= 0, `falta ${t} en la hoja`);
  const posiciones = orden.map(([, k]) => k);
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), `las tarjetas no van en el orden de la rejilla: ${orden.map(([t]) => t).join(" → ")}`);
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

prueba("el proveedor mide su nombre más largo y lo que sobra se reparte, no se lo lleva él", () => {
  assert.ok(inicioTabla > 0, "no se encontró SpacesTable");
  assert.match(tabla, /etiqueta: "Proveedor", ancho: anchos\.proveedor/, "Proveedor volvió a no tener ancho");
  assert.match(tabla, /repartirAnchos\(/, "la tabla no reparte el ancho sobrante");
  assert.ok(!/width: "100%"/.test(tabla), "la tabla volvió al 100 % del ancho: el navegador reparte a ojo");
});

prueba("los títulos de las columnas quedan fijos al desplazar la tabla", () => {
  assert.match(tabla, /position: "sticky", top: 0/, "los títulos de las columnas se van con el desplazamiento");
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

console.log("\nsupervisar · cuánto mide cada columna");

const salidaA = join(mkdtempSync(join(tmpdir(), "anc-")), "a.mjs");
const { outputFiles: oa } = await build({
  entryPoints: [join(raiz, "src", "utils", "anchosTabla.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salidaA, oa[0].text);
const T = await import(pathToFileURL(salidaA).href);

const COLS = [
  { ancho: 104, minimo: 104 },
  { ancho: 141, minimo: 104, cede: 2 },
  { ancho: 323, minimo: 150, cede: 1 },
  { ancho: 100, minimo: 100 },
  { ancho: 100, minimo: 100 },
  { ancho: 88, minimo: 88 },
  { ancho: 88, minimo: 88 },
  { ancho: 56, minimo: 56 },
  { ancho: 112, minimo: 112 },
];
const suma = (xs) => xs.reduce((t, v) => t + v, 0);

prueba("con lugar de sobra, la tabla llena su caja y el sobrante va parejo a todas", () => {
  const r = T.repartirAnchos(COLS, 1310);
  assert.ok(cerca(suma(r), 1310, 1e-6), `mide ${suma(r)} en una caja de 1310`);
  const extras = r.map((v, i) => v - COLS[i].ancho);
  assert.ok(extras.every((x) => cerca(x, extras[0], 1e-9)), `el sobrante no es parejo: ${extras.map((x) => x.toFixed(1)).join(" ")}`);
});

prueba("con poco lugar cede primero el proveedor, después el tipo, y las cifras nunca", () => {
  const r = T.repartirAnchos(COLS, 919);
  assert.ok(cerca(suma(r), 919, 1e-6), `mide ${suma(r)} en una caja de 919`);
  assert.equal(r[2], 150, "el proveedor no cedió hasta su mínimo antes que el tipo");
  assert.ok(r[1] < 141 && r[1] >= 104, "el tipo no cedió lo que faltaba");
  for (const i of [0, 3, 4, 5, 6, 7, 8]) assert.equal(r[i], COLS[i].ancho, `la columna ${i} se achicó`);
});

prueba("si ni con los mínimos entra, mide la suma de los mínimos y se desliza", () => {
  const r = T.repartirAnchos(COLS, 600);
  assert.deepEqual(r, COLS.map((c) => c.minimo));
});

prueba("sin medida todavía (primer pintado), cada columna mide lo que quiere", () => {
  assert.deepEqual(T.repartirAnchos(COLS, 0), COLS.map((c) => c.ancho));
});

console.log("\ncámara del editor 3D · no pasa por debajo del piso (utils/planta.ts)");

const salidaP = join(mkdtempSync(join(tmpdir(), "cam-planta-")), "p.mjs");
const planta = await build({
  entryPoints: [join(raiz, "src", "utils", "planta.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salidaP, planta.outputFiles[0].text);
const P = await import(pathToFileURL(salidaP).href);

prueba("frenarMira: con la mira sobre el piso no toca nada; debajo, sube mira y cámara lo mismo (la orientación no cambia)", () => {
  assert.equal(P.frenarMira({ x: 1, y: 0, z: 2 }, { x: 5, y: 3, z: 6 }), null);
  assert.equal(P.frenarMira({ x: 1, y: 0.4, z: 2 }, { x: 5, y: 3, z: 6 }), null);
  const f = P.frenarMira({ x: 1, y: -0.75, z: 2 }, { x: 5, y: 0.5, z: 6 });
  assert.deepEqual(f, { target: { x: 1, y: 0, z: 2 }, position: { x: 5, y: 1.25, z: 6 } });
  assert.equal(P.frenarMira({ x: 0, y: NaN, z: 0 }, { x: 0, y: 1, z: 0 }), null, "inventó una cámara con números rotos");
});

prueba("con el freno, paneos y giros al azar nunca dejan la mira ni la cámara bajo el piso (polar ≤ π/2,1)", () => {
  const POLAR_MAX = Math.PI / 2.1, POLAR_MIN = Math.PI / 6;
  let frenadas = 0;
  for (let k = 0; k < 4000; k++) {
    let target = { x: (azar() - 0.5) * 40, y: azar() * 2, z: (azar() - 0.5) * 40 };
    const r = 1.2 + azar() * 78;
    const phi = POLAR_MIN + azar() * (POLAR_MAX - POLAR_MIN), theta = azar() * 2 * Math.PI;
    const off = { x: r * Math.sin(phi) * Math.sin(theta), y: r * Math.cos(phi), z: r * Math.sin(phi) * Math.cos(theta) };
    let pos = { x: target.x + off.x, y: target.y + off.y, z: target.z + off.z };
    // Paneo en el plano de la pantalla (`screenSpacePanning`): derecha y arriba de la cámara.
    const f = { x: -off.x / r, y: -off.y / r, z: -off.z / r };
    const der = { x: -f.z, y: 0, z: f.x };
    const ld = Math.hypot(der.x, der.z) || 1;
    der.x /= ld; der.z /= ld;
    const arr = { x: der.y * f.z - der.z * f.y, y: der.z * f.x - der.x * f.z, z: der.x * f.y - der.y * f.x };
    const a = (azar() - 0.5) * 30, b = (azar() - 0.2) * -30;   // sobre todo hacia abajo
    const pan = { x: der.x * a + arr.x * b, y: der.y * a + arr.y * b, z: der.z * a + arr.z * b };
    target = { x: target.x + pan.x, y: target.y + pan.y, z: target.z + pan.z };
    pos = { x: pos.x + pan.x, y: pos.y + pan.y, z: pos.z + pan.z };
    const frenada = P.frenarMira(target, pos);
    if (frenada) { ({ target, position: pos } = frenada); frenadas++; }
    assert.ok(target.y >= 0, `vuelta ${k}: la mira quedó en ${target.y}`);
    assert.ok(pos.y >= target.y + r * Math.cos(POLAR_MAX) - 1e-9, `vuelta ${k}: la cámara quedó bajo la mira`);
    assert.ok(pos.y > 0, `vuelta ${k}: la cámara quedó bajo el piso (${pos.y})`);
    // La orientación es la misma: el freno sólo traslada.
    assert.ok(cerca(pos.x - target.x, off.x, 1e-9) && cerca(pos.y - target.y, off.y, 1e-9) && cerca(pos.z - target.z, off.z, 1e-9), `vuelta ${k}: el freno giró la cámara`);
  }
  assert.ok(frenadas > 1000, `el azar casi no bajó la mira del piso (${frenadas} de 4000)`);
});

prueba("sanearOrbita: la cámara guardada bajo el piso vuelve sana; una sana sale igual", () => {
  assert.deepEqual(P.sanearOrbita({ position: { x: 3, y: -2, z: 4 }, target: { x: 1, y: -3, z: 1 } }),
    { position: { x: 3, y: 0.3, z: 4 }, target: { x: 1, y: 0, z: 1 } });
  assert.deepEqual(P.sanearOrbita({ position: { x: 3, y: 0.1, z: 4 }, target: { x: 1, y: 0, z: 1 } }),
    { position: { x: 3, y: 0.3, z: 4 }, target: { x: 1, y: 0, z: 1 } });
  const sana = { position: { x: 15, y: 28, z: 50 }, target: { x: 15, y: 0, z: 21 } };
  assert.deepEqual(P.sanearOrbita(sana), sana);
  const subida = { position: { x: 0, y: 3, z: 5 }, target: { x: 0, y: 1.6, z: 0 } };
  assert.deepEqual(P.sanearOrbita(subida), subida, "bajó la mira que miraba un copete");
  assert.deepEqual(P.sanearOrbita({ position: { x: 0, y: NaN, z: 5 }, target: { x: 0, y: NaN, z: 0 } }),
    { position: { x: 0, y: 0.3, z: 5 }, target: { x: 0, y: 0, z: 0 } });
});

console.log(`\n${hechas} pruebas pasaron${process.exitCode ? " — HAY FALLAS" : ""}\n`);
