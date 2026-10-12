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
  normalDeCara, vistaDeCara, lugarDeLaFigura,
  distanciaLibre, vistaDeVenta, FOV_DE_CERCA,
  ALTO_CIELO_RASO, LUMINARIA, luminariasDeTienda, direccionDeGondolas, ejesDeGrilla,
  proyectar, rayoDeVista, choqueEnElLocal, sombraDeHuellas, sombraEn, SOMBRA_AL_PIE,
  personaYTomaDeVenta, esquinasDeLaFigura, FIGURA_DE_ESCALA, SEPARACIONES_DE_LA_FIGURA,
  LLENADO_DE_PAR, FRANJA_DEL_HUD, libreAlCostado, VECINO_PEGADO, alcanceDeLaFigura, ANGOSTO_ENTRE_MEDIO, AIRE_DE_LA_FIGURA,
  corridaPorVecino, DESCENTRADO_POR_VECINO, fovParaLaCara, FOV_MAXIMO_DE_FRENTE, AIRE_SOBRE_EL_ENTREPANO,
} = await import(pathToFileURL(salida).href);

// Lo que la cámara de venta toma de los muebles (la cuenta de la prueba y el
// copete de la punta): `frentes.ts`, `medidas.ts` y `venta.ts`, compilados
// igual que en probar-muebles (venta despacha a componentes de React).
const deMuebles = async (archivo) => {
  const { outputFiles: o } = await build({
    entryPoints: [join(aqui, "..", "src", "components", "StoreEditor3D", "muebles", archivo)],
    bundle: true, format: "esm", write: false, platform: "node", jsx: "automatic", logLevel: "silent",
  });
  const f = join(dirname(salida), archivo.replace(/\.tsx?$/, ".mjs"));
  writeFileSync(f, o[0].text);
  return import(pathToFileURL(f).href);
};
const FR = await deMuebles("frentes.ts");
const MD = await deMuebles("medidas.ts");
const VT = await deMuebles("venta.ts");

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

console.log("\nplanta · el encuadre de una cara");

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

prueba("sin girar, la cara A mira a −Z y la B a +Z", () => {
  // Es la convención del editor: en la caja de Three.js la cara A se pinta en
  // el índice 5 (−Z) y la B en el 4 (+Z).
  const a = normalDeCara(0, "A"), b = normalDeCara(0, "B");
  assert.ok(cerca(a.x, 0) && cerca(a.z, -1), `cara A dio (${a.x}, ${a.z})`);
  assert.ok(cerca(b.x, 0) && cerca(b.z, 1), `cara B dio (${b.x}, ${b.z})`);
});

prueba("girado 90°, la cara A mira a −X", () => {
  const a = normalDeCara(Math.PI / 2, "A");
  assert.ok(cerca(a.x, -1) && cerca(a.z, 0), `dio (${a.x}, ${a.z})`);
});

prueba("las dos caras son opuestas, gire lo que gire", () => {
  for (const r of [0, 0.7, Math.PI / 2, 2.3, Math.PI, 4.71238898038469]) {
    const a = normalDeCara(r, "A"), b = normalDeCara(r, "B");
    assert.ok(cerca(a.x + b.x, 0) && cerca(a.z + b.z, 0), `en rotY=${r} no son opuestas`);
  }
});

prueba("la cámara se para del lado de la cara que se pide", () => {
  const g = { cx: 0, cz: 0, w: 3.6, d: 0.9, h: 1.8, rotY: 0 };
  const a = vistaDeCara(g, "A"), b = vistaDeCara(g, "B");
  assert.ok(a.posZ < 0, "la cara A debía verse desde −Z");
  assert.ok(b.posZ > 0, "la cara B debía verse desde +Z");
  // Las dos miran al mismo mueble.
  assert.ok(cerca(a.targetX, 0) && cerca(a.targetZ, 0));
  assert.ok(cerca(b.targetX, 0) && cerca(b.targetZ, 0));
});

prueba("un mueble más ancho se mira desde más lejos", () => {
  const base = { cx: 0, cz: 0, d: 0.9, h: 1.8, rotY: 0 };
  const punta   = vistaDeCara({ ...base, w: 0.9 }, "A");
  const gondola = vistaDeCara({ ...base, w: 3.6 }, "A");
  const larga   = vistaDeCara({ ...base, w: 10.0 }, "A");
  assert.ok(Math.abs(larga.posZ) > Math.abs(gondola.posZ), "la góndola larga necesita más aire");
  assert.ok(Math.abs(gondola.posZ) >= Math.abs(punta.posZ), "la punta no debería quedar más lejos");
});

prueba("la cara que se mide es la que se ve, no la del catálogo", () => {
  // Girada 90°, el frente de una góndola de 3,6 × 0,9 sigue siendo el lado
  // largo: la distancia tiene que ser la misma que sin girar.
  const recto  = vistaDeCara({ cx: 0, cz: 0, w: 3.6, d: 0.9, h: 1.8, rotY: 0 }, "A");
  const girado = vistaDeCara({ cx: 0, cz: 0, w: 3.6, d: 0.9, h: 1.8, rotY: Math.PI / 2 }, "A");
  const dRecto  = Math.hypot(recto.posX, recto.posZ);
  const dGirado = Math.hypot(girado.posX, girado.posZ);
  assert.ok(cerca(dRecto, dGirado, 1e-9), `${dRecto} vs ${dGirado}`);
});

prueba("nunca se mira desde el piso", () => {
  // Una batea de 80 cm mirada desde 40 cm parece una foto tomada en el suelo.
  const batea = vistaDeCara({ cx: 0, cz: 0, w: 0.8, d: 0.6, h: 0.8, rotY: 0 }, "A");
  assert.ok(batea.posY >= 1.6, `la cámara quedó a ${batea.posY} m`);
  assert.ok(batea.targetY >= 1.0, "mira demasiado abajo");
});

prueba("el encuadre respeta el desplazamiento del mueble", () => {
  const lejos = vistaDeCara({ cx: -20, cz: 7, w: 3.6, d: 0.9, h: 1.8, rotY: 0 }, "A");
  assert.ok(cerca(lejos.targetX, -20) && cerca(lejos.targetZ, 7));
});

console.log("\nplanta · velocidades");

prueba("la velocidad es de caminata, no de trote", () => {
  // Antes: 0.08 m por frame × 60 fps = 4.8 m/s. Una persona camina a ~1.4.
  assert.ok(VEL_CAMINANDO >= 1.0 && VEL_CAMINANDO <= 1.8, "fuera del paso humano");
  assert.ok(VEL_APURADA > VEL_CAMINANDO && VEL_APURADA < 0.08 * 60);
});

console.log("\nplanta · la figura de escala");

prueba("con lugar a los dos lados se para a la derecha del mueble", () => {
  const f = { x: 0, z: 0, w: 0.9, rotY: 0 };
  const p = lugarDeLaFigura(f, []);
  assert.ok(p, "tendría que haber lugar");
  // Local (+w/2 + 0.45, ·, −0.35) sin rotación = ese mismo punto en mundo.
  assert.ok(cerca(p.x, 0.9), `x=${p.x}`);
  assert.ok(cerca(p.z, -0.35), `z=${p.z}`);
});

prueba("si la derecha está tapada se pasa a la izquierda", () => {
  const f = { x: 0, z: 0, w: 0.9, rotY: 0 };
  // Un mueble pegado al costado derecho: su huella inflada cubre x ≈ 0.9.
  const muros = murosDeCaminata([{ x: 1.6, z: 0, w: 1.0, d: 1.0, h: 1.8, rotY: 0 }]);
  const p = lugarDeLaFigura(f, muros);
  assert.ok(p, "la izquierda seguía libre");
  assert.ok(p.x < 0, `debía irse a la izquierda, quedó en x=${p.x}`);
});

prueba("encajonado por los dos lados NO planta a nadie adentro de un estante", () => {
  const f = { x: 0, z: 0, w: 0.9, rotY: 0 };
  const muros = murosDeCaminata([
    { x:  1.6, z: 0, w: 1.0, d: 1.0, h: 1.8, rotY: 0 },
    { x: -1.6, z: 0, w: 1.0, d: 1.0, h: 1.8, rotY: 0 },
  ]);
  assert.equal(lugarDeLaFigura(f, muros), null);
});

prueba("el costado sigue la rotación del mueble", () => {
  // Girado un cuarto de vuelta, el costado derecho local cae sobre −Z.
  const p = lugarDeLaFigura({ x: 0, z: 0, w: 0.9, rotY: Math.PI / 2 }, []);
  assert.ok(p, "tendría que haber lugar");
  assert.ok(cerca(p.x, -0.35), `x=${p.x}`);
  assert.ok(cerca(p.z, -0.9), `z=${p.z}`);
});

prueba("se separa lo mismo de un mueble angosto que de uno ancho", () => {
  const angosto = lugarDeLaFigura({ x: 0, z: 0, w: 0.4, rotY: 0 }, []);
  const ancho   = lugarDeLaFigura({ x: 0, z: 0, w: 3.6, rotY: 0 }, []);
  assert.ok(cerca(angosto.x - 0.4 / 2, 0.45));
  assert.ok(cerca(ancho.x   - 3.6 / 2, 0.45));
});

prueba("la figura se para donde podría pararse una persona", () => {
  // El mismo test que usa la caminata: si `chocaEn` la rechaza, no va.
  const muros = murosDeCaminata([{ x: 1.2, z: 0, w: 0.9, d: 0.9, h: 1.8, rotY: 0 }]);
  const p = lugarDeLaFigura({ x: 0, z: 0, w: 0.9, rotY: 0 }, muros);
  assert.ok(p, "quedaba la izquierda");
  assert.ok(!chocaEn(muros, p.x, p.z), "la plantó dentro de un mueble");
});

console.log("\nplanta · la cámara del vendedor");

// La sede sembrada de las capturas: dos góndolas dobles con un pasillo de
// 2 m entre las dos, las puntas en las cabeceras, el robatope y las neveras.
const SEDE = [
  { id: "GON-01", x: 6, z: 4, w: 3.6, d: 0.9, h: 1.8, rotY: 0 },
  { id: "GON-02", x: 6, z: 6.9, w: 3.6, d: 0.9, h: 1.8, rotY: 0 },
  { id: "PUN-01", x: 8, z: 4, w: 0.9, d: 0.4, h: 1.8, rotY: -Math.PI / 2 },
  { id: "PUN-02", x: 8, z: 6.9, w: 0.9, d: 0.4, h: 1.8, rotY: -Math.PI / 2 },
  { id: "PUN-03", x: 4, z: 4, w: 0.9, d: 0.4, h: 1.8, rotY: Math.PI / 2 },
  { id: "ROB-01", x: 8, z: 4.6, w: 0.3, d: 0.4, h: 1.6, rotY: -Math.PI / 2 },
  { id: "NEV-01", x: 11, z: 1.2, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI },
  { id: "NEV-02", x: 12.25, z: 1.2, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI },
];
const LIMITES = limitesDePlanta(SEDE, 2.5);
const otros = (id) => murosDeCaminata(SEDE.filter((f) => f.id !== id));
const comoMueble = (f) => ({ cx: f.x, cz: f.z, w: f.w, d: f.d, h: f.h, rotY: f.rotY });
const FOCO_ENTERO = { yBajo: 0, yAlto: 1.8, yEntrepano: 1.225, libreEntrepano: 0.3 };
const polar = (v) => {
  const dx = v.posX - v.targetX, dy = v.posY - v.targetY, dz = v.posZ - v.targetZ;
  return Math.acos(dy / Math.hypot(dx, dy, dz));
};

prueba("la cara B de GON-01 se mira desde ADENTRO del pasillo, no detrás de GON-02", () => {
  const g = SEDE[0];
  for (const toma of ["frente", "tres_cuartos"]) {
    const v = vistaDeVenta(comoMueble(g), "B", toma, FOCO_ENTERO, otros("GON-01"), LIMITES);
    assert.ok(v.posZ > 4.45 && v.posZ < 6.45, `${toma}: la cámara quedó en z=${v.posZ.toFixed(2)}, fuera del pasillo`);
    assert.ok(!chocaEn(otros("GON-01"), v.posX, v.posZ), `${toma}: la cámara quedó adentro de otro mueble`);
  }
  // Como era antes: el encuadre de la cara se paraba detrás de la vecina.
  assert.ok(vistaDeCara(comoMueble(g), "B").posZ > 6.45, "la prueba ya no muestra el defecto que corrige");
});

prueba("«De cerca» queda a un brazo de la cara", () => {
  for (const f of SEDE) {
    for (const cara of f.id.startsWith("GON") ? ["A", "B"] : ["A"]) {
      const v = vistaDeVenta(comoMueble(f), cara, "cerca", FOCO_ENTERO, otros(f.id), LIMITES);
      const n = normalDeCara(f.rotY, cara);
      const plano = (v.posX - f.x) * n.x + (v.posZ - f.z) * n.z - f.d / 2;
      assert.ok(plano > 0 && plano <= 1.2 + 1e-9, `${f.id} ${cara}: «De cerca» a ${plano.toFixed(2)} m de la cara`);
    }
  }
});

prueba("ninguna toma cae fuera del rango de la órbita ni mira desde abajo", () => {
  for (const f of SEDE) for (const rot of [0, 0.4, Math.PI / 2, 2.5, Math.PI]) {
    for (const toma of ["frente", "tres_cuartos", "cerca"]) {
      for (const foco of [FOCO_ENTERO, { yBajo: 1.3, yAlto: 1.75, yEntrepano: 1.5, libreEntrepano: 0.3 }]) {
        const v = vistaDeVenta({ ...comoMueble(f), rotY: rot }, "A", toma, foco, otros(f.id), LIMITES);
        const a = polar(v);
        assert.ok(a >= Math.PI / 6 - 1e-9 && a <= Math.PI / 2.1 + 1e-9,
          `${f.id} rot ${rot} ${toma}: ángulo polar ${(a * 180 / Math.PI).toFixed(1)}°`);
        assert.ok(v.posY > v.targetY, `${f.id} ${toma}: la cámara mira desde abajo`);
      }
    }
  }
});

prueba("sin nada enfrente, «De frente» se para a la distancia ideal", () => {
  const sola = { cx: 0, cz: 0, w: 0.9, d: 0.4, h: 1.8, rotY: 0 };
  const lejos = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const v = vistaDeVenta(sola, "A", "frente", FOCO_ENTERO, [], lejos);
  const ideal = (1.8 * 1.12) / (2 * Math.tan((25 * Math.PI) / 180));
  assert.ok(Math.abs(-v.posZ - (0.2 + ideal)) < 1e-9, `se paró a ${-v.posZ - 0.2} y no a ${ideal}`);
  // Y el pasillo libre se mide desde la cara, con el cuerpo inflado.
  assert.ok(Math.abs(distanciaLibre({ x: 0, z: 0 }, { x: 0, z: 1 }, murosDeCaminata([{ x: 0, z: 3, w: 1, d: 1, h: 1.8 }]), lejos) - (2.5 - 0.28 - 0.05)) < 0.051);
});

prueba("en la pantalla de venta la persona se para EN EL PLANO de la cara que se muestra", () => {
  const f = { x: 0, z: 0, w: 0.3, rotY: 0 };
  const editor = lugarDeLaFigura(f, []);
  assert.ok(Math.abs(Math.abs(editor.x) - (0.15 + 0.45)) < 1e-9, "cambió dónde se para en el editor");
  assert.ok(Math.abs(editor.z + 0.35) < 1e-9, "cambió dónde se para en el editor");
  // Adelantada, la perspectiva la agrandaba (más alta que la punta de 1,80);
  // del lado A, en la toma de la cara B quedaba detrás del mueble.
  for (const rotY of [0, Math.PI / 2, -Math.PI / 2, 2.5]) {
    for (const cara of ["A", "B"]) {
      const m = { x: 3, z: -2, w: 0.9, rotY };
      const p = lugarDeLaFigura(m, [], 0.3, { d: 0.4, cara });
      const n = normalDeCara(rotY, cara);
      const enNormal = (p.x - m.x) * n.x + (p.z - m.z) * n.z;
      assert.ok(Math.abs(enNormal - 0.2) < 1e-9, `rot ${rotY} ${cara}: a ${enNormal.toFixed(3)} del centro, no en el plano de la cara`);
      const alCostado = Math.hypot(p.x - m.x - n.x * 0.2, p.z - m.z - n.z * 0.2);
      assert.ok(Math.abs(alCostado - (0.45 + 0.3)) < 1e-9, `rot ${rotY} ${cara}: no quedó al costado a 30 cm`);
    }
  }
});

prueba("el robatope arrimado a la punta tiene su pasillo", () => {
  // La huella inflada de PUN-01 cubre el canto de ROB-01 —están pegados—:
  // contándola, el pasillo medía cero y la toma de frente se pegaba a 90 cm,
  // cortándole las repisas de arriba.
  const rob = SEDE.find((f) => f.id === "ROB-01");
  const n = normalDeCara(rob.rotY, "A");
  const centro = { x: rob.x + n.x * rob.d / 2, z: rob.z + n.z * rob.d / 2 };
  assert.ok(chocaEn(otros("ROB-01"), centro.x, centro.z), "la prueba ya no muestra el caso (la punta no rodea el canto)");
  assert.ok(distanciaLibre(centro, n, otros("ROB-01"), LIMITES) > 2, "el pasillo del robatope sigue midiendo cero");
  const foco = { yBajo: 0, yAlto: 1.6, yEntrepano: 0.9, libreEntrepano: 0.37 };
  const v = vistaDeVenta(comoMueble(rob), "A", "frente", foco, otros("ROB-01"), LIMITES);
  const dist = (v.posX - centro.x) * n.x + (v.posZ - centro.z) * n.z;
  assert.ok(dist > 1.5, `la toma de frente del robatope quedó a ${dist.toFixed(2)} m`);
});

prueba("por entrepaño, «De frente» mira lo elegido de frente y no desde arriba", () => {
  const sola = { cx: 0, cz: 0, w: 0.9, d: 0.4, h: 1.8, rotY: 0 };
  const lejos = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const foco = { yBajo: 0.375, yAlto: 0.8, yEntrepano: 0.59, libreEntrepano: 0.33 };
  const entero = vistaDeVenta(sola, "A", "frente", foco, [], lejos);
  const elegido = vistaDeVenta(sola, "A", "frente", { ...foco, porEntrepano: true }, [], lejos);
  assert.ok(entero.posY >= 1.2 - 1e-9, "la cara entera dejó de mirarse a la altura de un comprador");
  const picado = Math.atan2(elegido.posY - elegido.targetY, Math.hypot(elegido.posX - elegido.targetX, elegido.posZ - elegido.targetZ));
  assert.ok(picado <= (10 * Math.PI) / 180, `por entrepaño mira con ${(picado * 180 / Math.PI).toFixed(1)}° de picado`);
  assert.ok(Math.abs(elegido.posX) < 1e-9 && Math.abs(elegido.targetY - 0.5875) < 1e-9, "no quedó centrada en lo elegido");
});

prueba("el tres cuartos no pone a la persona en primer plano", () => {
  // Una punta sola en el medio del local: hay pasillo de los dos lados, así
  // que el tres cuartos tiene que girar para el lado CONTRARIO a la persona.
  const sola = { cx: 0, cz: 0, w: 0.9, d: 0.4, h: 1.8, rotY: 0 };
  const lejos = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  for (const lado of [1, -1]) {
    const persona = { x: lado * (0.45 + 0.45), z: -0.35 };
    const v = vistaDeVenta(sola, "A", "tres_cuartos", FOCO_ENTERO, [], lejos, 50, 16 / 9, persona);
    assert.ok(Math.sign(v.posX) === -lado, `con la persona en x=${persona.x} la cámara giró a x=${v.posX.toFixed(2)}`);
  }
  // Si del otro lado no hay pasillo, queda del lado que hay: con una columna a
  // medio metro de ese lado, la cámara del otro lado no tiene que pararse
  // DETRÁS de la columna (su lugar no choca, pero la columna tapa el cuadro).
  const pared = [{ minX: -3, maxX: -0.3, minZ: -3, maxZ: 3 }];
  const v = vistaDeVenta(sola, "A", "tres_cuartos", FOCO_ENTERO, pared, lejos, 50, 16 / 9, { x: 0.9, z: -0.35 });
  assert.ok(v.posX > 0, "giró contra la pared por esquivar a la persona");
  const columna = [{ minX: -0.4, maxX: -0.25, minZ: -0.75, maxZ: -0.55 }];
  const c = vistaDeVenta(sola, "A", "tres_cuartos", FOCO_ENTERO, columna, lejos, 50, 16 / 9, { x: 0.9, z: -0.35 });
  assert.ok(c.posX > 0, `se paró detrás de la columna por esquivar a la persona (x=${c.posX.toFixed(2)})`);
  // Sin punto a evitar, nada cambia: la toma «De frente» lo ignora siempre.
  const f1 = vistaDeVenta(sola, "A", "frente", FOCO_ENTERO, [], lejos);
  const f2 = vistaDeVenta(sola, "A", "frente", FOCO_ENTERO, [], lejos, 50, 16 / 9, { x: 0.9, z: -0.35 });
  assert.deepEqual(f1, f2);
});

prueba("«De cerca» con teleobjetivo: el entrepaño llena el cuadro, de frente", () => {
  // Con 50° la cámara se pegaba a 60 cm y miraba desde 1,6 m para abajo: un
  // tercio del cuadro era metal y el copete, y dominaban las tapas.
  assert.ok(FOV_DE_CERCA >= 30 && FOV_DE_CERCA <= 35, `campo visual de ${FOV_DE_CERCA}°`);
  const sola = { cx: 0, cz: 0, w: 0.9, d: 0.4, h: 1.8, rotY: 0 };
  const lejos = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const foco = { yBajo: 0, yAlto: 1.8, yEntrepano: 1.225, libreEntrepano: 0.3 };
  const v = vistaDeVenta(sola, "A", "cerca", foco, [], lejos, FOV_DE_CERCA);
  const dist = Math.hypot(v.posX - v.targetX, v.posZ - v.targetZ);
  const visible = 2 * dist * Math.tan((FOV_DE_CERCA * Math.PI) / 360);
  const llena = (0.3 + 0.06) / visible;
  assert.ok(llena >= 0.7 && llena <= 0.8, `el entrepaño llena el ${(llena * 100).toFixed(0)} % del cuadro`);
  // Casi a la altura del entrepaño: ni picado ni las tapas dominando.
  const picado = Math.atan2(v.posY - v.targetY, dist);
  assert.ok(picado <= (10 * Math.PI) / 180, `«De cerca» mira con ${(picado * 180 / Math.PI).toFixed(1)}° de picado`);
  // Un mueble angosto (el robatope de 30 cm, una bolsa por repisa) encuadra
  // dos repisas y media, no una sola con el costado del vecino.
  const rob = { cx: 0, cz: 0, w: 0.3, d: 0.4, h: 1.6, rotY: 0 };
  const r = vistaDeVenta(rob, "A", "cerca", { ...foco, libreEntrepano: 0.33 }, [], lejos, FOV_DE_CERCA);
  const dr = Math.hypot(r.posX - r.targetX, r.posZ - r.targetZ);
  const repisas = (2 * dr * Math.tan((FOV_DE_CERCA * Math.PI) / 360)) / 0.36;
  assert.ok(repisas >= 2.4 && repisas <= 2.8, `el robatope de cerca muestra ${repisas.toFixed(1)} repisas`);
  assert.ok(dr <= 1.8 + 1e-9);
  // En la sede sembrada, «De cerca» sigue dentro del pasillo y en rango.
  for (const f of SEDE) {
    const w = vistaDeVenta(comoMueble(f), "A", "cerca", FOCO_ENTERO, otros(f.id), LIMITES, FOV_DE_CERCA);
    assert.ok(!chocaEn(otros(f.id), w.posX, w.posZ), `${f.id}: «De cerca» se para adentro de otro mueble`);
    const a = polar(w);
    assert.ok(a >= Math.PI / 6 - 1e-9 && a <= Math.PI / 2.1 + 1e-9, `${f.id}: ángulo polar ${(a * 180 / Math.PI).toFixed(1)}°`);
  }
});

// ── Los encuadres de venta con la persona (tanda 3, paso 16) ──────────────────

console.log("\nplanta · la persona entera en la toma, y «De cerca» sin medio copete");

/** La toma de venta de un mueble de la sede, como la arma la escena. */
const tomaConPersona = (id, t, aspecto = 16 / 9) => {
  const f = SEDE.find((x) => x.id === id);
  return { f, ...personaYTomaDeVenta(comoMueble(f), "A", t, { yBajo: 0, yAlto: f.h }, otros(id), LIMITES, 50, aspecto) };
};
/** El rango horizontal (−1…1) de la cara del mueble en el cuadro. */
const caraEnCuadro = (vista, f, fov = 50, asp = 16 / 9) => {
  const n = normalDeCara(f.rotY, "A"), t = { x: -n.z, z: n.x };
  const xs = [];
  for (const lado of [-1, 1]) for (const y of [0, f.h]) {
    const p = { x: f.x + n.x * f.d / 2 + t.x * lado * f.w / 2, y, z: f.z + n.z * f.d / 2 + t.z * lado * f.w / 2 };
    xs.push(proyectar(vista, fov, asp, p).x);
  }
  return [Math.min(...xs), Math.max(...xs)];
};

prueba("la persona sale ENTERA en De frente y Tres cuartos de PUN-01, NEV-01 y ROB-01, del lado libre y sin tapar el mueble", () => {
  for (const id of ["PUN-01", "NEV-01", "ROB-01"]) for (const t of ["frente", "tres_cuartos"]) {
    for (const aspecto of [16 / 9, 4 / 3]) {
      const { f, vista, persona, extremo } = tomaConPersona(id, t, aspecto);
      assert.ok(persona, `${id} ${t} (${aspecto.toFixed(2)}): la toma salió sin persona`);
      // Las cuatro esquinas, con la MISMA cámara que encuadra.
      const q = esquinasDeLaFigura(persona).map((e) => proyectar(vista, 50, aspecto, e));
      for (const e of q) {
        assert.ok(e.profundidad > 0 && Math.abs(e.x) <= 0.98 && Math.abs(e.y) <= 0.98,
          `${id} ${t}: una esquina de la persona cae en (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`);
      }
      assert.ok(Math.abs(extremo - Math.max(...q.map((e) => Math.abs(e.x)))) < 1e-9, "el extremo no es el de las esquinas");
      // Donde podría pararse alguien, y dentro del local.
      assert.ok(!chocaEn(otros(id), persona.x, persona.z), `${id} ${t}: la persona quedó adentro de otro mueble`);
      // Del lado libre: el robatope está pegado a PUN-01 (z menor), la nevera a NEV-02 (x mayor).
      if (id === "ROB-01") assert.ok(persona.z > f.z, "la persona del robatope quedó del lado de la punta");
      if (id === "NEV-01") assert.ok(persona.x < f.x, "la persona de la nevera quedó del lado de NEV-02");
      // Al costado: su rango en el cuadro no se mete en el de la CAJA del
      // mueble (el costado que da a la cámara también), con 30 px de aire.
      const c = Math.cos(f.rotY), sn = Math.sin(f.rotY);
      const xs = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [0, f.h].map((y) => proyectar(vista, 50, aspecto,
        { x: f.x + a * f.w / 2 * c + b * f.d / 2 * sn, y, z: f.z - a * f.w / 2 * sn + b * f.d / 2 * c }).x)));
      const [a, b] = [Math.min(...xs) - AIRE_DE_LA_FIGURA, Math.max(...xs) + AIRE_DE_LA_FIGURA];
      const [pa, pb] = [Math.min(...q.map((e) => e.x)), Math.max(...q.map((e) => e.x))];
      assert.ok(pb < a || pa > b, `${id} ${t}: la persona tapa el mueble (${pa.toFixed(2)}…${pb.toFixed(2)} contra ${a.toFixed(2)}…${b.toFixed(2)})`);
      assert.ok(AIRE_DE_LA_FIGURA >= 0.03, "menos de 30 px de aire");
      // El centro del cuadro sigue en el mueble: se abre, no se corre; salvo
      // «De frente» con un vecino pegado, que se corre `DESCENTRADO_POR_VECINO`
      // hacia el costado libre (la cámara con la mira).
      const n = normalDeCara(f.rotY, "A");
      const corrida = t === "frente" ? corridaPorVecino(comoMueble(f), "A", otros(id), LIMITES) : null;
      const cx = f.x + n.x * f.d / 2 + (corrida?.x ?? 0), cz = f.z + n.z * f.d / 2 + (corrida?.z ?? 0);
      assert.ok(Math.hypot(vista.targetX - cx, vista.targetZ - cz) < 1e-9, `${id} ${t}: la toma se descentró del mueble`);
    }
  }
  // «De frente» no abre el cuadro por la persona: el mueble lleno de alto, y
  // ella por el borde, a la mayor separación que entra así (pegada a 30 cm
  // competía con el mueble). Abriéndolo hasta una persona a 1,2 m, la nevera
  // ocupaba el 26 % del ancho y el resto era muro.
  for (const id of ["PUN-01", "NEV-01", "ROB-01"]) {
    const { f, vista, persona } = tomaConPersona(id, "frente");
    const sin = vistaDeVenta(comoMueble(f), "A", "frente", { yBajo: 0, yAlto: Math.max(f.h + 0.06, 1.75) }, otros(id), LIMITES, 50, 16 / 9,
      undefined, undefined, corridaPorVecino(comoMueble(f), "A", otros(id), LIMITES));
    assert.deepEqual(vista, sin, `${id}: «De frente» abrió el cuadro por la persona`);
    assert.ok(persona.separacion >= 0.6, `${id}: la persona pegada al mueble (${persona.separacion} m)`);
    const mayores = SEPARACIONES_DE_LA_FIGURA.filter((x) => x > persona.separacion);
    // Su costado, en el eje X local del mueble.
    const lado = (persona.x - f.x) * Math.cos(f.rotY) - (persona.z - f.z) * Math.sin(f.rotY) >= 0 ? 1 : -1;
    for (const sep of mayores) {
      const p = lugarDeLaFigura({ x: f.x, z: f.z, w: f.w, rotY: f.rotY }, otros(id), sep, { d: f.d, cara: "A" }, [lado]);
      if (!p) continue;
      const q = esquinasDeLaFigura(p).map((e) => proyectar(vista, 50, 16 / 9, e));
      assert.ok(q.some((e) => Math.abs(e.x) > 0.98 || Math.abs(e.y) > 0.98), `${id}: a ${sep} m también entraba sin abrir el cuadro`);
    }
  }
  // La nevera de frente llena el alto del cuadro (con su aire) y la vecina
  // no pasa del 25 %.
  {
    const { f, vista } = tomaConPersona("NEV-01", "frente");
    const ys = [0, f.h].map((y) => proyectar(vista, 50, 16 / 9, { x: f.x, y, z: f.z - f.d / 2 * Math.cos(f.rotY) }).y);
    assert.ok(Math.abs(ys[1] - ys[0]) / 2 >= 0.8, `la nevera llena el ${(Math.abs(ys[1] - ys[0]) * 50).toFixed(0)} % del alto`);
    const vecina = visibleEnCuadro(vista, f, SEDE.find((x) => x.id === "NEV-02"));
    assert.ok(vecina <= 0.25, `NEV-02 se ve en el ${(vecina * 100).toFixed(0)} % del cuadro de NEV-01`);
  }
  assert.deepEqual([...SEPARACIONES_DE_LA_FIGURA], [1.2, 1.1, 1.0, 0.8, 0.6, 0.45, 0.3]);
  // La figura es la de la silueta: 1,70 m.
  assert.equal(FIGURA_DE_ESCALA.alto, 1.7);
});

/** La fracción del cuadro que ocupa la caja de un mueble de la sede: el casco
 *  convexo de sus ocho esquinas proyectadas, recortado al cuadro. Una cota
 *  (no cuenta lo que tapa otro mueble), suficiente para comparar. */
function areaEnCuadro(v, f, asp = 16 / 9) {
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY), pts = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, f.h]) {
    const lx = a * f.w / 2, lz = b * f.d / 2;
    const q = proyectar(v, 50, asp, { x: f.x + lx * c + lz * s, y, z: f.z - lx * s + lz * c });
    if (q.profundidad > 0) pts.push([q.x, q.y]);
  }
  if (pts.length < 3) return 0;
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...pts].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  let poly = lo.slice(0, -1).concat(up.slice(0, -1));
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const dentro = (p) => sg * p[ax] <= 1;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      if (dentro(A)) out.push(A);
      if (dentro(A) !== dentro(B)) { const t = (sg - A[ax]) / (B[ax] - A[ax]); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
    }
    poly = out;
    if (!poly.length) return 0;
  }
  let ar = 0;
  for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length]; ar += A[0] * B[1] - B[0] * A[1]; }
  return Math.abs(ar) / 8;
}

prueba("«Tres cuartos» gira hacia el costado libre: el vecino pegado no queda en primer plano", () => {
  // NEV-01 y NEV-02 van pegadas: girando hacia NEV-02 (para esquivar a la
  // persona, parada del lado libre), la vecina —libre, con sus botellas
  // mudas— ocupaba casi la mitad del cuadro y la nevera vendida quedaba chica
  // y al fondo. Lo mismo el robatope contra la punta.
  for (const [id, vecino, libre] of [["NEV-01", "NEV-02", (v, f) => v.posX < f.x], ["ROB-01", "PUN-01", (v, f) => v.posZ > f.z],
    ["NEV-02", "NEV-01", (v, f) => v.posX > f.x]]) {
    const f = SEDE.find((x) => x.id === id), g = SEDE.find((x) => x.id === vecino);
    for (const r of [tomaConPersona(id, "tres_cuartos"), { vista: vistaDeVenta(comoMueble(f), "A", "tres_cuartos", { yBajo: 0, yAlto: f.h }, otros(id), LIMITES) }]) {
      assert.ok(libre(r.vista, f), `${id}: «Tres cuartos» giró hacia ${vecino} (cámara en ${r.vista.posX.toFixed(2)}, ${r.vista.posZ.toFixed(2)})`);
      const av = areaEnCuadro(r.vista, g), am = areaEnCuadro(r.vista, f);
      assert.ok(av <= 0.2, `${id}: ${vecino} ocupa ${(av * 100).toFixed(0)} % del cuadro en «Tres cuartos»`);
      if (id.startsWith("NEV")) assert.ok(av < am, `${id}: la vecina (${(av * 100).toFixed(0)} %) pesa más que la nevera (${(am * 100).toFixed(0)} %)`);
    }
  }
  // Sin vecino pegado (una punta sola), sigue esquivando a la persona: lo
  // prueba «el tres cuartos no pone a la persona en primer plano».
  assert.ok(VECINO_PEGADO >= 0.6 && VECINO_PEGADO <= 1.2);
});

/** Lo que se VE de un vecino en el cuadro: los puntos de una grilla de
 *  96 × 54 que caen en el casco de su caja y no en el del mueble que se
 *  muestra (que está delante). */
function visibleEnCuadro(v, f, g, asp = 16 / 9) {
  const casco = (m) => {
    const c = Math.cos(m.rotY), s = Math.sin(m.rotY), pts = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const y of [0, m.h]) {
      const q = proyectar(v, 50, asp, { x: m.x + a * m.w / 2 * c + b * m.d / 2 * s, y, z: m.z - a * m.w / 2 * s + b * m.d / 2 * c });
      if (q.profundidad > 0) pts.push([q.x, q.y]);
    }
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of [...pts].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const adentro = (poly, x, y) => poly.length >= 3 && poly.every((A, i) => {
    const B = poly[(i + 1) % poly.length];
    return (B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]) >= 0;
  });
  const pm = casco(f), pv = casco(g);
  let n = 0;
  for (let i = 0; i < 96; i++) for (let j = 0; j < 54; j++) {
    const x = -1 + (i + 0.5) / 48, y = -1 + (j + 0.5) / 27;
    if (adentro(pv, x, y) && !adentro(pm, x, y)) n++;
  }
  return n / (96 * 54);
}

prueba("«De frente» se corre hacia el costado libre cuando hay un vecino pegado, y sólo entonces", () => {
  // NEV-01 tiene a NEV-02 pegada del lado de x mayor: se corre hacia x menor,
  // 18 cm, y la vecina queda cortada por el borde.
  const nev = SEDE.find((x) => x.id === "NEV-01");
  const c = corridaPorVecino(comoMueble(nev), "A", otros("NEV-01"), LIMITES);
  assert.ok(c && c.x < 0 && Math.abs(Math.hypot(c.x, c.z) - DESCENTRADO_POR_VECINO) < 1e-9, `corrida ${JSON.stringify(c)}`);
  assert.ok(DESCENTRADO_POR_VECINO > 0.1 && DESCENTRADO_POR_VECINO <= 0.25, "más de 25 cm ya no es «de frente»");
  // Una nevera suelta, sin vecinos: centrada.
  const sola = { cx: 0, cz: 0, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI };
  const lim = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  assert.equal(corridaPorVecino(sola, "A", [], lim), null);
  // Encerrada de los dos lados: tampoco (no hay costado libre adonde correrse).
  const muros = murosDeCaminata([{ x: -1.25, z: 0, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI }, { x: 1.25, z: 0, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI }]);
  assert.equal(corridaPorVecino(sola, "A", muros, lim), null);
  // Por entrepaño, nunca (mira lo elegido de frente); y el editor (sin
  // corrida), centrado como siempre.
  const n = normalDeCara(nev.rotY, "A");
  const centrada = (v) => Math.hypot(v.targetX - (nev.x + n.x * nev.d / 2), v.targetZ - (nev.z + n.z * nev.d / 2)) < 1e-9;
  assert.ok(centrada(vistaDeVenta(comoMueble(nev), "A", "frente", { yBajo: 0.5, yAlto: 0.9, porEntrepano: true }, otros("NEV-01"), LIMITES, 50, 16 / 9, undefined, undefined, c)), "por entrepaño se corrió");
  assert.ok(centrada(vistaDeVenta(comoMueble(nev), "A", "frente", { yBajo: 0, yAlto: 1.8 }, otros("NEV-01"), LIMITES)), "el editor se corrió");
  // La de venta, sí.
  assert.ok(!centrada(tomaConPersona("NEV-01", "frente").vista), "la toma de venta de NEV-01 no se corrió");
});

prueba("«De frente» de una góndola larga en un pasillo angosto abre el campo visual hasta que la cara entra", () => {
  // GON-01 B (3,6 m) da a un pasillo de 2 m: con 50° la cámara no puede
  // alejarse lo suficiente y la lámina de Kellogg's cortaba el bloque de Müsli.
  const g = SEDE.find((x) => x.id === "GON-01");
  const fov = fovParaLaCara(comoMueble(g), "B", otros("GON-01"), LIMITES);
  assert.ok(fov > 50 && fov <= FOV_MAXIMO_DE_FRENTE, `fov ${fov.toFixed(1)}°`);
  const v = vistaDeVenta(comoMueble(g), "B", "frente", { yBajo: 0, yAlto: g.h, alFondo: true }, otros("GON-01"), LIMITES, fov);
  const n = normalDeCara(g.rotY, "B"), t = { x: -n.z, z: n.x };
  for (const lado of [-1, 1]) for (const y of [0, g.h]) {
    const q = proyectar(v, fov, 16 / 9, { x: g.x + n.x * g.d / 2 + t.x * lado * g.w / 2, y, z: g.z + n.z * g.d / 2 + t.z * lado * g.w / 2 });
    assert.ok(Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1, `una esquina de la cara queda afuera (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
  }
  // Con 50° no entraba (si entrara, la prueba no probaría nada).
  const v50 = vistaDeVenta(comoMueble(g), "B", "frente", { yBajo: 0, yAlto: g.h }, otros("GON-01"), LIMITES, 50);
  const q50 = proyectar(v50, 50, 16 / 9, { x: g.x + n.x * g.d / 2 + t.x * g.w / 2, y: 0, z: g.z + n.z * g.d / 2 + t.z * g.w / 2 });
  assert.ok(Math.abs(q50.x) > 1, "con 50° la góndola ya entraba");
  // Un mueble que entra con 50° (la nevera, la punta) queda con 50°.
  for (const id of ["NEV-01", "PUN-01"]) {
    const f = SEDE.find((x) => x.id === id);
    assert.equal(fovParaLaCara(comoMueble(f), "A", otros(id), LIMITES), 50, `${id} abrió el campo visual sin necesidad`);
  }
  assert.ok(FOV_MAXIMO_DE_FRENTE <= 75, "más de 75° estira las cajas de los bordes");
});

prueba("en «Tres cuartos» de la punta la góndola libre de la que es cabecera no se come el cuadro", () => {
  // La crítica de la demo (ronda 2): la góndola libre de la derecha pesaba lo
  // mismo que la punta vendida. Lo que la hacía pesar era la LUZ (ahora se
  // atenúa: `EXPOSICION_DEL_VECINO`); de área, lo que se ve de ella es poco.
  // Que siga así: lo visible de GON-01 a lo sumo el 15 % del cuadro, y la
  // cota sin tapar a lo sumo el 20 %.
  for (const aspecto of [16 / 9, 4 / 3]) {
    const { f, vista } = tomaConPersona("PUN-01", "tres_cuartos", aspecto);
    const gon = SEDE.find((x) => x.id === "GON-01");
    const vis = visibleEnCuadro(vista, f, gon, aspecto), cota = areaEnCuadro(vista, gon, aspecto);
    assert.ok(vis <= 0.15, `GON-01 se ve en el ${(vis * 100).toFixed(0)} % del cuadro (${aspecto.toFixed(2)})`);
    assert.ok(cota <= 0.2 + 1e-9 || aspecto !== 16 / 9, `la caja de GON-01 cubre el ${(cota * 100).toFixed(0)} % del cuadro`);
    // Ningún otro vecino pesa más que la punta.
    const am = visibleEnCuadro(vista, { ...f, x: 1e6 }, f, aspecto);
    for (const g of SEDE.filter((x) => x.id !== "PUN-01")) {
      assert.ok(visibleEnCuadro(vista, f, g, aspecto) < am, `${g.id} pesa más que la punta en «Tres cuartos»`);
    }
  }
});

prueba("la persona se para al costado del mueble: nunca más allá de otro mueble entero, ni en primer plano", () => {
  // A 1,2 m del canto del robatope, del lado de la punta, quedaba más allá de
  // la punta, junto a otro mueble: la escala era la de otro mueble. Más allá
  // de un exhibidor angosto (el robatope pegado a la punta) sí: es alguien
  // parado en el pasillo.
  for (const id of ["PUN-01", "ROB-01", "NEV-01", "NEV-02"]) for (const t of ["frente", "tres_cuartos"]) {
    const { f, persona, vista } = tomaConPersona(id, t);
    if (!persona) continue;
    const ex = { x: Math.cos(f.rotY), z: -Math.sin(f.rotY) };
    const lado = (persona.x - f.x) * ex.x + (persona.z - f.z) * ex.z > 0 ? 1 : -1;
    const alcance = alcanceDeLaFigura(comoMueble(f), "A", lado, otros(id), LIMITES);
    assert.ok(persona.separacion <= alcance + 1e-9, `${id} ${t}: la persona a ${persona.separacion} m del canto, con piso sólo hasta ${alcance.toFixed(2)} m`);
    // Ni en primer plano: no más cerca de la cámara que el 80 % del centro de la cara.
    const dp = Math.hypot(vista.posX - persona.x, vista.posZ - persona.z), dc = Math.hypot(vista.posX - vista.targetX, vista.posZ - vista.targetZ);
    assert.ok(dp >= 0.8 * dc - 1e-9, `${id} ${t}: la persona a ${dp.toFixed(2)} m de la cámara, la cara a ${dc.toFixed(2)}: primer plano`);
  }
  // Del robatope, del lado de la punta (0,9 m entre medio), nunca; de la
  // punta, del lado del robatope (0,3 m), sí.
  const rob = SEDE.find((x) => x.id === "ROB-01"), pun = SEDE.find((x) => x.id === "PUN-01");
  assert.ok(alcanceDeLaFigura(comoMueble(rob), "A", -1, otros("ROB-01"), LIMITES) < 0.3, "el robatope deja pararse más allá de la punta");
  assert.ok(alcanceDeLaFigura(comoMueble(pun), "A", 1, otros("PUN-01"), LIMITES) >= 1.2, "la punta no deja pararse más allá del robatope");
  assert.ok(ANGOSTO_ENTRE_MEDIO >= 0.5 && ANGOSTO_ENTRE_MEDIO <= 0.9);
  // En «Tres cuartos» de la punta, la persona del lado CONTRARIO a la cámara.
  const { vista, persona } = tomaConPersona("PUN-01", "tres_cuartos");
  assert.ok(persona && Math.sign(persona.z - pun.z) !== Math.sign(vista.posZ - pun.z), "en «Tres cuartos» la persona quedó del lado de la cámara habiendo lugar del otro");
});

prueba("sin lugar para la persona entera, la toma de siempre y sin persona", () => {
  // Un robatope en un pasillo de 1 m: ninguna separación la deja entera.
  const rob = { cx: 0, cz: 0, w: 0.3, d: 0.4, h: 1.6, rotY: 0 };
  const angosto = { minX: -0.6, maxX: 0.6, minZ: -1.4, maxZ: 0.4 };
  const r = personaYTomaDeVenta(rob, "A", "frente", { yBajo: 0, yAlto: 1.6 }, [], angosto);
  assert.equal(r.persona, null, "con media persona afuera igual la planta");
  assert.deepEqual(r.vista, vistaDeVenta(rob, "A", "frente", { yBajo: 0, yAlto: 1.6 }, [], angosto), "sin persona no es la toma de siempre");
  assert.equal(r.extremo, 0);
  // El robatope de la sede, en cambio, la tiene entera (antes la toma
  // cubría ~1,8 m centrado en 0,8 y la cabeza quedaba afuera).
  const { vista, persona } = tomaConPersona("ROB-01", "frente");
  const vieja = vistaDeVenta(comoMueble(SEDE.find((x) => x.id === "ROB-01")), "A", "frente", { yBajo: 0, yAlto: 1.6 }, otros("ROB-01"), LIMITES);
  const cabeza = proyectar(vieja, 50, 16 / 9, { x: persona.x, y: 1.7, z: persona.z });
  assert.ok(Math.abs(cabeza.x) > 0.98 || Math.abs(cabeza.y) > 0.98, "la prueba ya no muestra por qué el robatope salía sin persona");
  assert.ok(vista.posY > 0);
});

/** El foco de «De cerca» de un mueble de catálogo con su empaque, como lo
 *  arma la escena (con el copete de la punta). */
const focoDeCerca = (tipo, f, empaque, donde = "todas") => {
  const v = VT.ventaDeTipo(tipo, f.w, f.d, f.h);
  const foco = FR.focoDeLaPrueba(v, f.h, donde, empaque);
  return tipo === "punta" ? { ...foco, techoDeCara: MD.techoDeCara(f.h), altoDeCopete: MD.COPETE.alto } : foco;
};
/** La altura a la que el borde de arriba del cuadro corta el plano de la cara. */
const bordeDeArriba = (vista, f, fov) => {
  const n = normalDeCara(f.rotY, "A");
  const c = { x: f.x + n.x * f.d / 2, z: f.z + n.z * f.d / 2 };
  const dist = (vista.posX - c.x) * n.x + (vista.posZ - c.z) * n.z;
  const r = rayoDeVista(vista, fov, 16 / 9, 0, 1);
  return vista.posY + (r.y * dist) / -(r.x * n.x + r.z * n.z);
};
const VASO_ = { ancho: 0.075, alto: 0.09, fondo: 0.075, forma: "caja" };
const CAJA_LECHE = { ancho: 0.07, alto: 0.2, fondo: 0.07, forma: "caja", envase: "caja" };
const BOLSA_ARROZ = { ancho: 0.14, alto: 0.23, fondo: 0.06, forma: "bolsa", envase: "bolsa" };

prueba("«De cerca» de la punta no corta el copete: el borde de arriba queda en la cenefa", () => {
  const f = SEDE.find((x) => x.id === "PUN-01");
  const techo = MD.techoDeCara(f.h);
  assert.equal(techo, Math.max(0.4, f.h - MD.COPETE.alto), "techoDeCara no es el cuerpo de la punta");
  for (const [empaque, donde] of [[VASO_, "todas"], [CAJA_LECHE, "todas"], [VASO_, [3]], [CAJA_LECHE, [2]]]) {
    const foco = focoDeCerca("punta", f, empaque, donde);
    const v = vistaDeVenta(comoMueble(f), "A", "cerca", foco, otros("PUN-01"), LIMITES, FOV_DE_CERCA);
    const b = bordeDeArriba(v, f, FOV_DE_CERCA);
    assert.ok(!(b > techo && b < techo + MD.COPETE.alto), `el borde de arriba corta el copete a ${b.toFixed(3)} m (copete de ${techo} a ${techo + MD.COPETE.alto})`);
    // Y el entrepaño elegido sigue entero en el cuadro.
    const y = (h) => proyectar(v, FOV_DE_CERCA, 16 / 9, { x: v.targetX, y: h, z: v.targetZ }).y;
    assert.ok(y(foco.yEntrepano + foco.libreEntrepano / 2) <= 1 && y(foco.yEntrepano - foco.libreEntrepano / 2) >= -1, "el entrepaño elegido quedó cortado");
  }
  // El cartel empieza en la CENEFA cuando el hueco de arriba no sirve para
  // producto: la cenefa baja del copete hasta el último entrepaño, y con sólo
  // el copete en la cuenta el borde caía en ella (la franja de color de la
  // marca arriba del cuadro, con la chapa del visor encima).
  const niveles = MD.nivelesDePunta(techo);
  const ultimo = niveles[niveles.length - 1];
  const piso = MD.pisoDelCartelDePunta(f.h);
  assert.equal(piso, techo - ultimo < MD.HUECO_SIN_PRODUCTO ? ultimo : techo, "el piso del cartel no es la cenefa ni el copete");
  for (const [empaque, donde] of [[VASO_, "todas"], [CAJA_LECHE, "todas"], [VASO_, [3]]]) {
    const v0 = vistaDeVenta(comoMueble(f), "A", "cerca", focoDeCerca("punta", f, empaque, donde), otros("PUN-01"), LIMITES, FOV_DE_CERCA);
    const foco = { ...focoDeCerca("punta", f, empaque, donde), techoDeCara: piso, altoDeCopete: f.h - piso };
    const v = vistaDeVenta(comoMueble(f), "A", "cerca", foco, otros("PUN-01"), LIMITES, FOV_DE_CERCA);
    const b = bordeDeArriba(v, f, FOV_DE_CERCA);
    assert.ok(b <= piso - 0.009, `el borde de arriba corta la cenefa a ${b.toFixed(3)} m (cartel desde ${piso.toFixed(3)})`);
    assert.ok(Number.isFinite(bordeDeArriba(v0, f, FOV_DE_CERCA)));
  }
});

prueba("«De cerca» deja afuera lo de arriba del entrepaño elegido, sin cabecear", () => {
  // Con el 75 % de llenado centrado quedaban 9 cm de la repisa de arriba: su
  // producto cortado por la mitad, o en «Por entrepaño» una banda de cajas de
  // relleno sobre lo que se vende (GON-02·B, la crítica de la revisión).
  for (const [id, tipo, empaque, donde] of [
    ["GON-02", "gondola", VASO_, "todas"], ["GON-02", "gondola", CAJA_LECHE, [2]], ["GON-02", "gondola", BOLSA_ARROZ, [1]],
    ["GON-01", "gondola", CAJA_LECHE, [3]], ["PUN-03", "punta", VASO_, [1]],
  ]) {
    const f = SEDE.find((x) => x.id === id);
    const foco = focoDeCerca(tipo, f, empaque, donde);
    if (foco.yEntrepano == null) continue;
    const v = vistaDeVenta(comoMueble(f), "A", "cerca", foco, otros(f.id), LIMITES, FOV_DE_CERCA);
    const tope = foco.yEntrepano + foco.libreEntrepano / 2 + AIRE_SOBRE_EL_ENTREPANO;
    const b = bordeDeArriba(v, f, FOV_DE_CERCA);
    assert.ok(b <= tope + 1e-6, `${f.id}: el borde de arriba muestra ${((b - tope + AIRE_SOBRE_EL_ENTREPANO) * 100).toFixed(1)} cm sobre el entrepaño`);
    // El entrepaño elegido, entero en el cuadro; y la cámara no cabecea: se
    // bajó entera.
    const y = (h) => proyectar(v, FOV_DE_CERCA, 16 / 9, { x: v.targetX, y: h, z: v.targetZ }).y;
    assert.ok(y(foco.yEntrepano - foco.libreEntrepano / 2) >= -1, `${f.id}: el pie del entrepaño elegido quedó afuera`);
    const dist = Math.hypot(v.posX - v.targetX, v.posZ - v.targetZ);
    const picado = Math.atan2(v.posY - v.targetY, dist);
    assert.ok(picado <= (10 * Math.PI) / 180, `${f.id}: «De cerca» mira con ${(picado * 180 / Math.PI).toFixed(1)}° de picado`);
  }
});

prueba("el robatope de cerca: dos repisas al 75-85 % del alto en el plano de la mira (66-70 % en la captura)", () => {
  const f = SEDE.find((x) => x.id === "ROB-01");
  const foco = focoDeCerca("robatope", f, BOLSA_ARROZ);
  assert.equal(foco.parDeRepisas, true, "el robatope no encuadra un par de repisas");
  const v = VT.ventaDeTipo("robatope", f.w, f.d, f.h);
  // El par: dos repisas vecinas, con producto, de la de abajo al techo de la de arriba.
  const apoyos = v.filas.alturas;
  const i = apoyos.findIndex((a) => Math.abs(a - (foco.yEntrepano - foco.libreEntrepano / 2)) < 0.02);
  assert.ok(i >= 0 && i + 2 < apoyos.length + 1, "el par no arranca en una repisa");
  const vista = vistaDeVenta(comoMueble(f), "A", "cerca", foco, otros("ROB-01"), LIMITES, FOV_DE_CERCA);
  const y = (h) => proyectar(vista, FOV_DE_CERCA, 16 / 9, { x: vista.targetX, y: h, z: vista.targetZ }).y;
  const llena = (y(foco.yEntrepano + foco.libreEntrepano / 2) - y(foco.yEntrepano - foco.libreEntrepano / 2)) / 2;
  // En el plano de la mira 75-85 %: en la captura, de la bolsa de arriba al
  // riel de abajo, eso es el 66-70 % que pide la crítica (las repisas se
  // inclinan y el producto queda adelante).
  assert.ok(llena >= 0.75 && llena <= 0.85, `las dos repisas llenan el ${(llena * 100).toFixed(0)} % del alto`);
  assert.ok(Math.abs(LLENADO_DE_PAR - 0.8) < 1e-9);
  // Un mueble ancho sigue con UN entrepaño.
  assert.ok(!focoDeCerca("punta", SEDE.find((x) => x.id === "PUN-01"), VASO_).parDeRepisas, "la punta encuadra dos entrepaños");
});

prueba("en «De cerca» el producto del entrepaño elegido queda por encima de la franja del HUD", () => {
  assert.ok(Math.abs(FRANJA_DEL_HUD * 1080 - 110) < 1e-9);
  const linea = -1 + 2 * FRANJA_DEL_HUD;
  const casos = [
    ["PUN-01", "punta", VASO_], ["PUN-01", "punta", CAJA_LECHE], ["ROB-01", "robatope", BOLSA_ARROZ],
    ["NEV-01", "nevera_refrescos", { ancho: 0.09, alto: 0.3, fondo: 0.09, forma: "botella" }],
    ["GON-01", "gondola", { ancho: 0.19, alto: 0.27, fondo: 0.065, forma: "caja", envase: "caja" }],
  ];
  for (const [id, tipo, empaque] of casos) {
    const f = SEDE.find((x) => x.id === id);
    const foco = focoDeCerca(tipo, f, empaque);
    const v = vistaDeVenta(comoMueble(f), "A", "cerca", foco, otros(id), LIMITES, FOV_DE_CERCA);
    const pie = proyectar(v, FOV_DE_CERCA, 16 / 9, { x: v.targetX, y: foco.yEntrepano - foco.libreEntrepano / 2, z: v.targetZ }).y;
    assert.ok(pie >= linea - 1e-6, `${id}: el pie del producto cae a ${(((1 - pie) / 2) * 1080).toFixed(0)} px, en la franja del HUD`);
  }
});

// ── El cielo raso de la pantalla de venta ─────────────────────────────────────

console.log("\nplanta · el cielo raso y sus luminarias");

/** Si (x, z) cae en alguna tira, con la grilla (la cuenta del shader). */
const enGrilla = (g, x, z) => {
  const { u, v } = ejesDeGrilla(g.giro);
  const rx = x - g.origen.x, rz = z - g.origen.z;
  const cu = rx * u.x + rz * u.z, cv = rx * v.x + rz * v.z;
  const i = Math.max(0, Math.min(g.cuantas.u - 1, Math.floor(cu / g.paso.u + 0.5)));
  const j = Math.max(0, Math.min(g.cuantas.v - 1, Math.floor(cv / g.paso.v + 0.5)));
  return Math.abs(cu - i * g.paso.u) <= g.tamano.u / 2 + 1e-9 && Math.abs(cv - j * g.paso.v) <= g.tamano.v / 2 + 1e-9;
};
/** Las cuatro puntas de una tira. */
const puntas = (l, g) => {
  const { u, v } = ejesDeGrilla(l.rotY);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: l.x + u.x * a * g.tamano.u / 2 + v.x * b * g.tamano.v / 2,
    z: l.z + u.z * a * g.tamano.u / 2 + v.z * b * g.tamano.v / 2,
  }));
};

prueba("las luminarias quedan dentro de la planta, con su margen, y la grilla las reproduce", () => {
  for (const sede of [SEDE, [gondola(0, 0, Math.PI / 2), gondola(3, 0, Math.PI / 2), gondola(6, 0, Math.PI / 2)], [gondola(-20, 3), gondola(15, 8)]]) {
    const L = limitesDePlanta(sede, 2.5);
    const { instancias, grilla } = luminariasDeTienda(L, sede);
    assert.ok(instancias.length >= 4, `sólo ${instancias.length} luminarias`);
    assert.equal(instancias.length, grilla.cuantas.u * grilla.cuantas.v);
    for (const l of instancias) for (const p of puntas(l, grilla)) {
      assert.ok(p.x >= L.minX + LUMINARIA.margen - 1e-6 && p.x <= L.maxX - LUMINARIA.margen + 1e-6
        && p.z >= L.minZ + LUMINARIA.margen - 1e-6 && p.z <= L.maxZ - LUMINARIA.margen + 1e-6,
        `una luminaria se sale de la planta (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
    }
    // La grilla (lo que lee el shader) reproduce cada instancia, y nada más.
    const { u, v } = ejesDeGrilla(grilla.giro);
    let k = 0;
    for (let j = 0; j < grilla.cuantas.v; j++) for (let i = 0; i < grilla.cuantas.u; i++, k++) {
      const x = grilla.origen.x + u.x * i * grilla.paso.u + v.x * j * grilla.paso.v;
      const z = grilla.origen.z + u.z * i * grilla.paso.u + v.z * j * grilla.paso.v;
      assert.ok(Math.hypot(x - instancias[k].x, z - instancias[k].z) < 1e-9, "la grilla no reproduce la instancia");
      assert.ok(enGrilla(grilla, instancias[k].x, instancias[k].z), "el centro de una tira no cae en la grilla");
    }
    // Entre dos tiras de una fila hay techo, no luz; y dos tiras no se tocan.
    assert.ok(grilla.paso.u >= LUMINARIA.largo + 0.2 - 1e-9 && grilla.paso.v >= LUMINARIA.ancho + 0.2);
    if (grilla.cuantas.u > 1) {
      const a = instancias[0];
      assert.ok(!enGrilla(grilla, a.x + u.x * grilla.paso.u / 2, a.z + u.z * grilla.paso.u / 2), "entre tira y tira la grilla da luz");
    }
    assert.ok(Math.abs(grilla.y - (ALTO_CIELO_RASO - 0.005)) < 1e-9, "las luminarias no van embutidas en el cielo raso");
  }
});

prueba("las filas de luminarias corren paralelas a las góndolas", () => {
  const enX = [gondola(0, 0, 0), gondola(0, 3, 0), { x: 5, z: 0, w: 0.9, d: 0.4, h: 1.8, rotY: Math.PI / 2 }];
  const enZ = [gondola(0, 0, Math.PI / 2), gondola(3, 0, -Math.PI / 2), { x: 0, z: 5, w: 0.9, d: 0.4, h: 1.8, rotY: 0 }];
  assert.equal(direccionDeGondolas(enX, limitesDePlanta(enX)), 0);
  assert.equal(direccionDeGondolas(enZ, limitesDePlanta(enZ)), Math.PI / 2);
  // Con la sede sembrada: las góndolas (3,6 m) le ganan a las tres puntas.
  const { grilla, instancias } = luminariasDeTienda(LIMITES, SEDE);
  assert.equal(grilla.giro, 0);
  // Y la tira tiene el largo a lo largo de la góndola.
  const giradas = luminariasDeTienda(limitesDePlanta(enZ), enZ);
  const p = puntas(giradas.instancias[0], giradas.grilla);
  assert.ok(Math.abs(p[1].z - p[0].z) > 2 && Math.abs(p[1].x - p[0].x) < 1e-9, "la tira no va a lo largo de la góndola girada");
  assert.ok(instancias.length > 0);
});

prueba("una sede vacía o diminuta no rompe las luminarias", () => {
  const vacia = limitesDePlanta([], 2.5, NOMINAL);
  const r = luminariasDeTienda(vacia, []);
  assert.ok(r.instancias.length > 0 && r.instancias.every((l) => Number.isFinite(l.x) && Number.isFinite(l.z)));
  const chica = { minX: 0, maxX: 2, minZ: 0, maxZ: 2, cx: 1, cz: 1, w: 2, d: 2 };
  assert.deepEqual(luminariasDeTienda(chica, []).instancias, [], "en un local de 2 m entra una tira de 2,4 m");
});

/** Las luminarias que se ven en una toma: alguna muestra de la tira dentro del
 *  cuadro, delante de la cámara y antes que el muro en ese rayo. */
function luminariasEnCuadro(v, L, sede, fov = 50, asp = 16 / 9) {
  const { instancias, grilla } = luminariasDeTienda(L, sede);
  const o = { x: v.posX, y: v.posY, z: v.posZ };
  return instancias.filter((l) => {
    const { u } = ejesDeGrilla(l.rotY);
    for (let k = -1; k <= 1.0001; k += 0.125) {
      const p = { x: l.x + u.x * k * grilla.tamano.u / 2, y: grilla.y, z: l.z + u.z * k * grilla.tamano.u / 2 };
      const q = proyectar(v, fov, asp, p);
      if (q.profundidad <= 0 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
      const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
      const dist = Math.hypot(d.x, d.y, d.z);
      const choque = choqueEnElLocal(o, { x: d.x / dist, y: d.y / dist, z: d.z / dist }, L, ALTO_CIELO_RASO + 0.01);
      if (choque.t >= dist - 1e-6) return true;
    }
    return false;
  }).length;
}

prueba("proyectar y rayoDeVista son la misma cámara (ida y vuelta)", () => {
  const v = { posX: 1, posY: 1.4, posZ: 5, targetX: -2, targetY: 0.8, targetZ: 1 };
  for (const [nx, ny] of [[0, 0], [0.7, -0.3], [-1, 1], [0.2, 0.9]]) {
    const d = rayoDeVista(v, 50, 16 / 9, nx, ny);
    const q = proyectar(v, 50, 16 / 9, { x: v.posX + d.x * 4, y: v.posY + d.y * 4, z: v.posZ + d.z * 4 });
    assert.ok(Math.abs(q.x - nx) < 1e-9 && Math.abs(q.y - ny) < 1e-9 && q.profundidad > 0, `(${nx}, ${ny}) → (${q.x}, ${q.y})`);
  }
  // Lo que está detrás tiene profundidad negativa.
  assert.ok(proyectar(v, 50, 16 / 9, { x: 4, y: 1.4, z: 9 }).profundidad < 0);
});

prueba("en las tomas de venta se ven el cielo raso y al menos dos luminarias", () => {
  // La toma que arma la escena: con la persona de escala (paso 16).
  const toma = (id, t) => tomaConPersona(id, t).vista;
  for (const [id, t] of [["PUN-01", "frente"], ["PUN-01", "tres_cuartos"], ["ROB-01", "tres_cuartos"], ["ROB-01", "frente"]]) {
    const n = luminariasEnCuadro(toma(id, t), LIMITES, SEDE);
    assert.ok(n >= 2, `${id} ${t}: ${n} luminarias en el cuadro`);
  }
  // La columna del medio de la toma de frente de la punta: filas de cielo
  // raso (de 1080) antes del muro. Con el techo a 4,5 m eran cero.
  const v = toma("PUN-01", "frente");
  const filas = (techo) => {
    let n = 0;
    for (let py = 0; py < 1080; py++) {
      const d = rayoDeVista(v, 50, 16 / 9, 0, 1 - (py + 0.5) / 540);
      if (choqueEnElLocal({ x: v.posX, y: v.posY, z: v.posZ }, d, LIMITES, techo).que === "techo") n++;
    }
    return n;
  };
  assert.ok(filas(ALTO_CIELO_RASO) >= 60, `sólo ${filas(ALTO_CIELO_RASO)} filas de cielo raso`);
  assert.equal(filas(4.5), 0, "la prueba ya no muestra por qué el techo va a 3,2 m");
});

prueba("una góndola girada en el borde de la planta queda dentro del muro", () => {
  // El muro sale de `limites` (con la rotación). Con la caja vieja de
  // StoreRoom —`f.x ± f.w/2`, sin girar— la góndola de 3,6 m girada 90°
  // asomaba 1,35 m del lado del muro.
  const sede = [gondola(0, 0, 0), gondola(10, 0, Math.PI / 2)];
  const L = limitesDePlanta(sede, 2.5);
  const h = huella(sede[1]);
  assert.ok(h.maxZ <= L.maxZ - 2.5 + 1e-9 && h.minZ >= L.minZ + 2.5 - 1e-9, "la huella girada no entra en los límites");
  const vieja = { minZ: Math.min(...sede.map((f) => f.z - f.d / 2)) - 2.5, maxZ: Math.max(...sede.map((f) => f.z + f.d / 2)) + 2.5 };
  assert.ok(h.maxZ > vieja.maxZ - 2.5 + 1, "la prueba ya no muestra el defecto de la caja sin rotación");
});

console.log("\nplanta · el piso de la pantalla de venta");

prueba("la sombra al pie: oscura junto al mueble, nada a un metro, con la rotación", () => {
  for (const rotY of [0, Math.PI / 2]) {
    const sede = [gondola(5, 5, rotY)];
    const L = limitesDePlanta(sede, 2.5);
    const m = sombraDeHuellas(sede, L);
    assert.ok(m.datos.length === m.ancho * m.alto && m.paso === SOMBRA_AL_PIE.paso);
    const h = huella(sede[0]);
    // A 5 cm del canto largo (el que mira al pasillo), y a 1 m.
    const [pie, lejos] = rotY === 0
      ? [{ x: 5, z: h.maxZ + 0.05 }, { x: 5, z: h.maxZ + 1 }]
      : [{ x: h.maxX + 0.05, z: 5 }, { x: h.maxX + 1, z: 5 }];
    const a = sombraEn(m, pie.x, pie.z), b = sombraEn(m, lejos.x, lejos.z);
    // El piso al pie, al menos un 10 % más oscuro que a 1 m.
    assert.ok(SOMBRA_AL_PIE.maximo * a >= 0.10, `rot ${rotY}: al pie sólo oscurece ${(SOMBRA_AL_PIE.maximo * a * 100).toFixed(0)} %`);
    assert.equal(b, 0, `rot ${rotY}: a 1 m el piso sigue sombreado`);
    assert.equal(sombraEn(m, 5, 5), 1, "bajo el mueble no hay sombra");
    // La rotación cuenta: con la huella sin girar, a 1 m del lado largo
    // GIRADO estaría la góndola.
    if (rotY !== 0) assert.ok(sombraEn(m, 5, h.maxZ + 0.05) > 0.5, "la sombra no sigue la huella girada");
  }
  // Una sede vacía no rompe; un mueble pisable no hace sombra.
  const v = sombraDeHuellas([], limitesDePlanta([], 2.5, NOMINAL));
  assert.ok(v.datos.every((x) => x === 0));
  const plano = sombraDeHuellas([{ x: 1, z: 1, w: 1, d: 1, h: 0.05 }], { minX: -2, maxX: 4, minZ: -2, maxZ: 4 });
  assert.ok(plano.datos.every((x) => x === 0), "una zona libre de 5 cm hace sombra");
  // 40 × 30 m son unos 120 KB.
  const grande = sombraDeHuellas([gondola(0, 0)], { minX: 0, maxX: 40, minZ: 0, maxZ: 30 });
  assert.ok(grande.datos.length <= 121000, `${grande.datos.length} bytes`);
});

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
