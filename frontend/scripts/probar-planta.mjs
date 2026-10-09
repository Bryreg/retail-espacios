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

console.log("\n" + hechas + " pruebas" + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
