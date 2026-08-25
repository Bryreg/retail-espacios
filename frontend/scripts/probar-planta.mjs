/**
 * Pruebas de src/utils/planta.ts — la extensión real del local y la caminata.
 *
 * El proyecto no tiene runner de pruebas en el frontend y no vale la pena
 * montar uno para un módulo de geometría pura: esto transpila el .ts con el
 * esbuild que ya trae vite y corre las afirmaciones en node.
 *
 *   npm run probar:planta
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const aqui   = dirname(fileURLToPath(import.meta.url));
const salida = join(mkdtempSync(join(tmpdir(), "planta-")), "planta.mjs");

const { outputFiles } = await build({
  entryPoints: [join(aqui, "..", "src", "utils", "planta.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral",
});
writeFileSync(salida, outputFiles[0].text);

const {
  huella, limitesDePlanta, murosDeCaminata, chocaEn,
  puntoDeEntrada, puntoLibreCerca, resolverPaso,
  ALTURA_PISABLE, VEL_CAMINANDO, VEL_APURADA, PASO_MAXIMO, RADIO_PERSONA,
} = await import(pathToFileURL(salida).href);

let hechas = 0;
const prueba = (nombre, fn) => {
  try { fn(); hechas++; console.log("  ok   " + nombre); }
  catch (e) { console.error("  FALLA " + nombre + "\n         " + e.message); process.exitCode = 1; }
};

/** La caja que el editor asumía antes: 30 × 42 m anclada en el origen. */
const CAJA_VIEJA = { minX: -2, maxX: 32, minZ: -2, maxZ: 44 };
const NOMINAL    = { minX: 0, maxX: 30, minZ: 0, maxZ: 42 };
const gondola = (x, z, rotY = 0) => ({ x, z, w: 3.6, d: 0.9, h: 1.8, rotY });

console.log("\nplanta · extensión real del local");

prueba("una planta vacía cae en la caja nominal", () => {
  const l = limitesDePlanta([], 2.5, NOMINAL);
  assert.deepEqual(
    { minX: l.minX, maxX: l.maxX, minZ: l.minZ, maxZ: l.maxZ },
    NOMINAL,
  );
});

prueba("la huella respeta la rotación", () => {
  const derecha = huella(gondola(0, 0, 0));
  assert.equal(+(derecha.maxX - derecha.minX).toFixed(3), 3.6);
  assert.equal(+(derecha.maxZ - derecha.minZ).toFixed(3), 0.9);

  // Girada 90°, la góndola de 3.6 m ocupa el eje contrario. Sin esto una
  // góndola larga se lee como si midiera 0.9 m y se camina a través de ella.
  const girada = huella(gondola(0, 0, Math.PI / 2));
  assert.equal(+(girada.maxX - girada.minX).toFixed(3), 0.9);
  assert.equal(+(girada.maxZ - girada.minZ).toFixed(3), 3.6);
});

prueba("los límites contienen a todos los muebles", () => {
  const plan = [gondola(-20, 3), gondola(15, 8), gondola(0, -3)];
  const l = limitesDePlanta(plan, 2.5, NOMINAL);
  for (const f of plan) {
    const b = huella(f);
    assert.ok(b.minX >= l.minX && b.maxX <= l.maxX, "fuera en X");
    assert.ok(b.minZ >= l.minZ && b.maxZ <= l.maxZ, "fuera en Z");
  }
});

prueba("la mitad izquierda de una sede real ya no queda fuera", () => {
  // NAVE ocupa x −22.9..19.5 · z −5.0..10.8. Contra la caja vieja, 48 de sus
  // 104 muebles tenían el centro fuera y eran inalcanzables a pie.
  const plan = [gondola(-22.0, 0), gondola(18.0, 9), gondola(0, 5)];
  const l = limitesDePlanta(plan, 2.5, NOMINAL);

  assert.ok(-22.0 < CAJA_VIEJA.minX, "el supuesto de la prueba ya no aplica");
  assert.ok(l.minX < -22.0, "el borde izquierdo debe cubrir el mueble más lejano");
  assert.ok(l.maxX > 18.0, "el borde derecho debe cubrir el mueble más lejano");
});

console.log("\nplanta · qué estorba al caminar");

prueba("la Zona Libre se pisa, la góndola no", () => {
  const zonaLibre = { x: 0, z: 0, w: 1, d: 1, h: 0.05 };
  assert.ok(zonaLibre.h < ALTURA_PISABLE);
  assert.equal(murosDeCaminata([zonaLibre]).length, 0);
  assert.equal(murosDeCaminata([gondola(0, 0)]).length, 1);
});

prueba("un mueble sin altura declarada estorba", () => {
  assert.equal(murosDeCaminata([{ x: 0, z: 0, w: 1, d: 1 }]).length, 1);
});

console.log("\nplanta · la caminata");

const unaGondola = [gondola(0, 0)];
const muros      = murosDeCaminata(unaGondola);
const limites    = limitesDePlanta(unaGondola, 2.5, NOMINAL);

const pared = muros[0];

prueba("no se atraviesa una góndola", () => {
  const antes = { x: 0, z: -1.2 };
  assert.ok(!chocaEn(muros, antes.x, antes.z), "el punto de partida debe estar libre");
  const fin = resolverPaso(antes, { x: 0, z: 1.2 }, limites, muros);
  assert.ok(fin.z <= pared.minZ, "quedó dentro de la góndola");
  assert.ok(fin.z > antes.z, "debía poder acercarse hasta la cara");
});

prueba("un paso largo no salta por encima del mueble", () => {
  // El choque se mide punto a punto: sin partir el paso en tramos, de un lado
  // al otro los dos extremos están libres y la góndola nunca se toca.
  const antes = { x: 0, z: -20 };
  const fin   = resolverPaso(antes, { x: 0, z: 20 }, limites, muros);
  assert.ok(fin.z <= pared.minZ, "atravesó la góndola de un tirón");
});

prueba("el tramo es más corto que el obstáculo más delgado", () => {
  // Una columna de 30 cm, inflada por el radio del cuerpo, es lo más angosto
  // que puede haber en una planta. Si un tramo la supera, se puede saltar.
  const masDelgado = 0.30 + 2 * RADIO_PERSONA;
  assert.ok(PASO_MAXIMO < masDelgado, "un tramo podría atravesar una columna");
});

prueba("se resbala a lo largo de la cara en vez de clavarse", () => {
  // Caminando en diagonal contra la cara larga: la componente paralela pasa.
  const antes = { x: -1.0, z: -1.2 };
  const fin   = resolverPaso(antes, { x: -0.3, z: 1.2 }, limites, muros);
  assert.ok(fin.z <= pared.minZ, "quedó dentro de la góndola");
  assert.ok(fin.x > antes.x + 0.5, "la componente paralela debía seguir avanzando");
});

prueba("quien queda dentro de un mueble puede salir", () => {
  // Alguien coloca una góndola encima mientras se camina.
  const adentro = { x: 0, z: 0 };
  assert.ok(chocaEn(muros, adentro.x, adentro.z));
  const fin = resolverPaso(adentro, { x: 0.2, z: 0 }, limites, muros);
  assert.notDeepEqual(fin, adentro, "quedaría atrapado para siempre");
});

prueba("el paso se recorta contra los límites del local", () => {
  const antes = { x: limites.maxX - 0.1, z: limites.cz };
  const fin   = resolverPaso(antes, { x: limites.maxX + 50, z: limites.cz }, limites, muros);
  assert.equal(fin.x, limites.maxX);
});

prueba("nadie aparece dentro de una góndola", () => {
  // Planta cuyo centro cae justo dentro de un mueble.
  const plan = [gondola(0, 0), gondola(-10, 0), gondola(10, 0)];
  const m = murosDeCaminata(plan);
  const l = limitesDePlanta(plan, 2.5, NOMINAL);
  assert.ok(chocaEn(m, l.cx, l.cz), "el supuesto de la prueba ya no aplica");

  const e = puntoDeEntrada(l, m);
  assert.ok(!chocaEn(m, e.x, e.z), "la entrada cayó dentro de un mueble");
  assert.ok(e.x > l.minX && e.x < l.maxX && e.z > l.minZ && e.z < l.maxZ);
});

prueba("la entrada de una planta despejada es el centro", () => {
  const l = limitesDePlanta([gondola(-10, 0), gondola(10, 0)], 2.5, NOMINAL);
  const m = murosDeCaminata([gondola(-10, 0), gondola(10, 0)]);
  assert.deepEqual(puntoDeEntrada(l, m), { x: l.cx, z: l.cz });
});

console.log("\nplanta · el teletransporte");

prueba("apuntar al medio de una góndola aterriza al lado, no adentro", () => {
  // Quien toca una góndola en el plano quiere el pasillo de al lado.
  const centro = { x: 0, z: 0 };
  assert.ok(chocaEn(muros, centro.x, centro.z), "el supuesto de la prueba ya no aplica");
  const d = puntoLibreCerca(limites, muros, centro.x, centro.z);
  assert.ok(!chocaEn(muros, d.x, d.z), "aterrizó dentro del mueble");
});

prueba("apuntar a un pasillo libre aterriza exactamente ahí", () => {
  const libre = { x: 0, z: limites.maxZ - 0.5 };
  assert.ok(!chocaEn(muros, libre.x, libre.z), "el supuesto de la prueba ya no aplica");
  assert.deepEqual(puntoLibreCerca(limites, muros, libre.x, libre.z), libre);
});

prueba("apuntar fuera del local aterriza dentro", () => {
  const d = puntoLibreCerca(limites, muros, limites.maxX + 40, limites.maxZ + 40);
  assert.ok(d.x <= limites.maxX && d.z <= limites.maxZ, "quedó fuera del local");
  assert.ok(d.x >= limites.minX && d.z >= limites.minZ, "quedó fuera del local");
});

prueba("el aterrizaje cae cerca de donde se apuntó", () => {
  // No sirve un salto que te deje en la otra punta de la tienda.
  const d = puntoLibreCerca(limites, muros, 0, 0);
  assert.ok(Math.hypot(d.x, d.z) < 3, "aterrizó demasiado lejos del punto tocado");
});

console.log("\nplanta · velocidades");

prueba("la velocidad es de caminata, no de trote", () => {
  // Antes: 0.08 m por frame × 60 fps = 4.8 m/s. Una persona camina a ~1.4.
  assert.ok(VEL_CAMINANDO >= 1.0 && VEL_CAMINANDO <= 1.8, "fuera del paso humano");
  assert.ok(VEL_APURADA > VEL_CAMINANDO && VEL_APURADA < 0.08 * 60);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
