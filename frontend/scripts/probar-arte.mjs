/**
 * Pruebas del arte del proveedor: la foto sin fondo y las medidas del envase.
 *   npm run probar:arte
 *
 * `muebles/recorte.ts` y `empaqueDeArte` (en `muebles/producto.ts`) son puros:
 * entra una foto como píxeles —o un nombre y una ficha— y sale un recorte o
 * unas medidas. Se compilan con esbuild y se CORREN sobre fotos sintéticas
 * armadas acá, píxel por píxel, porque lo que se quiere afirmar es lo que hacen
 * y no lo que dicen: un recorte que se come el cuerpo blanco de un vaso de
 * yogur compila igual que uno que no.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const muebles = join(raiz, "src", "components", "StoreEditor3D", "muebles");

const cargar = async (archivo) => {
  const r = await build({ entryPoints: [join(muebles, archivo)], bundle: true, write: false, format: "esm", platform: "neutral" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const R = await cargar("recorte.ts");
const P = await cargar("producto.ts");
const T = await cargar("texturas.ts");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

/** Una foto sintética: fondo y una función que pinta cada píxel. */
function foto(w, h, pintar) {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = pintar(x, y);
    const i = (y * w + x) * 4;
    p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a;
  }
  return p;
}
const BLANCO = [255, 255, 255];
const alfaEn = (rec, x, y) => rec.rgba[(y * rec.ancho + x) * 4 + 3];

console.log("\narte · la foto sin fondo");

prueba("una caja roja sobre blanco sale sin fondo y con su forma", () => {
  const p = foto(200, 300, (x, y) => (x >= 50 && x <= 150 && y >= 40 && y <= 260 ? [200, 20, 40] : BLANCO));
  const r = R.recortarFondo(p, 200, 300, "auto");
  assert.equal(r.estado, "fondo-quitado");
  assert.ok(r.relleno > 0.97, `relleno ${r.relleno}`);
  assert.ok(Math.abs(r.aspecto - 101 / 221) <= 0.02, `aspecto ${r.aspecto}`);
  assert.equal(r.ancho, 101, "no se recortó a la caja del producto");
  assert.match(r.colorDominante, /^#[0-9a-f]{6}$/);
  assert.ok(parseInt(r.colorDominante.slice(1, 3), 16) > 150, `la marca no salió roja: ${r.colorDominante}`);
});

prueba("el vaso blanco sobre blanco conserva su cuerpo", () => {
  // El caso del yogur de Alpina, sintético: vaso blanco con contorno gris de
  // 1 px y tapa #f4f4f4 tocando el borde de arriba. El relleno desde el borde
  // se mete por la tapa casi blanca y se come el cuerpo; lo devuelve el tramo
  // de cada fila entre los dos lados del contorno.
  const W = 200, H = 260;
  const bordeDe = (y) => 40 + Math.round(((y - 12) / 238) * 6);   // se angosta 6 px
  const p = foto(W, H, (x, y) => {
    if (y < 12) return x >= 40 && x <= 160 ? [244, 244, 244] : BLANCO;   // tapa #f4f4f4
    if (y > 250) return BLANCO;
    const izq = bordeDe(y), der = 200 - bordeDe(y);
    if (x === izq || x === der || (y === 250 && x >= izq && x <= der)) return [200, 200, 200];
    return BLANCO;
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.estado, "fondo-quitado");
  assert.equal(alfaEn(r, Math.floor(r.ancho / 2), Math.floor(r.alto / 2)), 255, "el cuerpo blanco del vaso se volvió transparente");
  assert.ok(r.relleno > 0.9, `relleno ${r.relleno}: el relleno se comió el vaso`);
});

prueba("el cuerpo blanco vuelve por la columna aunque el contorno tenga un hueco", () => {
  // Como la foto real: tapa de color arriba y borde rosado abajo, y el costado
  // del vaso tan blanco como el fondo, así que el relleno entra por ahí. La
  // fila no lo devuelve —le falta un lado— pero la columna entre la tapa y el
  // borde de abajo sí.
  const W = 200, H = 280;
  const p = foto(W, H, (x, y) => {
    if (x < 40 || x > 160 || y < 20 || y > 260) return BLANCO;
    if (y < 34) return [184, 180, 208];                  // tapa lavanda
    if (y > 248) return [236, 170, 176];                 // borde rosado
    if (x === 40 && !(y > 100 && y < 170)) return [205, 205, 205];   // contorno con hueco
    if (x === 160) return [205, 205, 205];
    if (y > 130 && y < 190 && x > 70 && x < 130) return [40, 34, 90];   // la etiqueta
    return BLANCO;
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.estado, "fondo-quitado");
  assert.equal(r.ancho, 121); assert.equal(r.alto, 241);
  for (const [fx, fy] of [[0.5, 0.3], [0.1, 0.5], [0.9, 0.5], [0.5, 0.85]]) {
    assert.equal(alfaEn(r, Math.floor(r.ancho * fx), Math.floor(r.alto * fy)), 255,
      `en (${fx}, ${fy}) el cuerpo quedó transparente`);
  }
  assert.ok(r.relleno > 0.97, `relleno ${r.relleno}`);
});

prueba("una foto que ya trae transparencia se respeta", () => {
  const p = foto(120, 160, (x, y) => {
    if (x >= 30 && x <= 90 && y >= 20 && y <= 140) return [20, 120, 60, x === 30 ? 128 : 255];
    return [0, 0, 0, 0];
  });
  const r = R.recortarFondo(p, 120, 160, "auto");
  assert.equal(r.estado, "ya-tenia-alfa");
  assert.equal(r.ancho, 61);
  assert.equal(r.alto, 121);
  for (let y = 0; y < r.alto; y++) for (let x = 0; x < r.ancho; x++) {
    assert.equal(alfaEn(r, x, y), p[((y + 20) * 120 + x + 30) * 4 + 3], "se tocó el alfa que traía la foto");
  }
  // Un recorte que toca tres bordes de la foto: sólo arriba queda margen
  // transparente, y alcanza para saber que ya viene sin fondo.
  const alRas = foto(120, 160, (x, y) => (y < 10 ? [0, 0, 0, 0] : [200, 120, 30, 255]));
  const ra = R.recortarFondo(alRas, 120, 160, "auto");
  assert.equal(ra.estado, "ya-tenia-alfa", "un PNG recortado al ras no se reconoció");
  assert.equal(ra.alto, 150);
});

prueba("un producto claro que toca tres bordes queda «dudoso», entero", () => {
  // Del color del estudio, grande, y unido por tiras a tres bordes de la foto:
  // no se sabe qué es producto y qué es estudio.
  const W = 400, H = 400, BEIGE = [232, 228, 220];
  const p = foto(W, H, (x, y) => {
    const centro = x >= 100 && x < 300 && y >= 100 && y < 300;
    const tira = (x >= 190 && x < 215) || (y >= 190 && y < 215 && x >= 200);
    return centro || tira ? BEIGE : BLANCO;
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.estado, "dudoso");
  assert.equal(r.ancho, W, "un recorte dudoso no se recorta");
  for (let i = 3; i < r.rgba.length; i += 4) assert.equal(r.rgba[i], 255, "un recorte dudoso quedó con transparencia");
  assert.ok(r.avisos.some((a) => /Dudoso/.test(a)), "no se avisó");
});

prueba("un fondo gris disparejo no se toca", () => {
  // Ruido determinista: ±40 alrededor de un gris claro, como una foto de
  // celular sobre una mesa.
  let s = 7;
  const azar = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const p = foto(160, 160, (x, y) => {
    if (x > 50 && x < 110 && y > 40 && y < 130) return [40, 40, 160];
    const v = Math.round(215 + (azar() - 0.5) * 80);
    return [v, v, v];
  });
  const r = R.recortarFondo(p, 160, 160, "auto");
  assert.equal(r.estado, "conservado");
  for (let i = 3; i < r.rgba.length; i += 4) assert.equal(r.rgba[i], 255);
  // Pero «quitar» insiste, con tolerancia forzada.
  assert.notEqual(R.recortarFondo(p, 160, 160, "quitar").estado, "conservado");
  // Y «conservar» no toca nada aunque el fondo sea perfecto.
  const limpia = foto(100, 100, (x, y) => (x > 20 && x < 80 && y > 20 && y < 80 ? [10, 10, 10] : BLANCO));
  assert.equal(R.recortarFondo(limpia, 100, 100, "conservar").estado, "conservado");
});

prueba("un estudio con degradé no se quita, pero se recorta al producto", () => {
  // La revisión de la tercera ronda: una botella de 180 × 540 px en una foto
  // de 600 × 600 sobre un degradé 170→240. El fondo no es parejo y no se
  // quita; con la caja de la foto entera la botella salía de 30 cm de
  // diámetro y entraban 2 por entrepaño en vez de 8.
  const W = 600, H = 600;
  const p = foto(W, H, (x, y) => {
    const dentro = x >= 210 && x < 390 && y >= 30 && y < 570;
    const f = 170 + Math.round((70 * x) / W);
    return dentro ? [200, 20, 40] : [f, f, f];
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.estado, "conservado");
  assert.ok(Math.abs(r.aspecto - 180 / 540) < 0.01, `aspecto ${r.aspecto}: la caja trae los márgenes`);
  assert.ok(r.ancho < W * 0.4, `no se recortó: ${r.ancho} px`);
  for (let i = 3; i < r.rgba.length; i += 4) assert.equal(r.rgba[i], 255, "conservado quedó con transparencia");
  // Con el alto de la ficha, el ancho es el de la botella.
  const ficha = { forma: "botella", alto_mm: 300, ancho_mm: null, fondo_mm: null, apilable: false, acostado: false, fondo_foto: "auto" };
  const e = P.empaqueDeArte({ nombre: "Gaseosa 1,5 L", categoria: "Bebidas" }, ficha, r);
  assert.ok(Math.abs(e.ancho - 0.1) < 0.005, `la botella salió de ${e.ancho} m de ancho`);
  assert.equal(e.anchoEstimado, true, "el ancho de una foto con fondo no se rotula «≈»");
  // Con el ancho en la ficha, manda la ficha y ya no es estimado.
  const conAncho = P.empaqueDeArte({ nombre: "Gaseosa" }, { ...ficha, ancho_mm: 95 }, r);
  assert.equal(conAncho.ancho, 0.095);
  assert.equal(conAncho.anchoEstimado, false);
  // El fondo gris disparejo de siempre también se recorta al producto.
  let s2 = 7;
  const azar = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
  const mesa = foto(160, 160, (x, y) => {
    if (x > 50 && x < 110 && y > 40 && y < 130) return [40, 40, 160];
    const v = Math.round(215 + (azar() - 0.5) * 80);
    return [v, v, v];
  });
  const rm = R.recortarFondo(mesa, 160, 160, "auto");
  assert.ok(Math.abs(rm.aspecto - 59 / 89) < 0.03, `aspecto en la mesa ${rm.aspecto}`);
});

prueba("si el aspecto de una foto con fondo falla, el ancho se acota a su forma", () => {
  // Un vaso blanco que toca los bordes queda «dudoso» y sin recortar: su
  // aspecto es el de la foto. Con un aspecto de 1 una botella de 30 cm no
  // puede salir de 30 cm de ancho.
  const ficha = { forma: "botella", alto_mm: 300, ancho_mm: null, fondo_mm: null, apilable: false, acostado: false, fondo_foto: "auto" };
  const e = P.empaqueDeArte({ nombre: "x" }, ficha, { aspecto: 1, relleno: 1, simetria: 0, estado: "dudoso" });
  assert.ok(e.ancho <= 0.3 * (0.09 / 0.31) * 1.6 + 1e-9, `la botella dudosa salió de ${e.ancho} m`);
  assert.equal(e.anchoEstimado, true);
  // Sin el fondo puesto (recortada de verdad), el aspecto se cree.
  const limpia = P.empaqueDeArte({ nombre: "x" }, ficha, { aspecto: 0.5, relleno: 0.9, simetria: 0, estado: "fondo-quitado" });
  assert.ok(Math.abs(limpia.ancho - 0.15) < 1e-9);
  assert.equal(limpia.anchoEstimado, false);
});

prueba("la misma foto da siempre los mismos bytes", () => {
  const p = foto(180, 240, (x, y) => (Math.abs(x - 90) < 20 + y / 8 && y > 20 && y < 220 ? [180, 30 + (x % 40), 60] : BLANCO));
  const original = Buffer.from(p);
  const a = R.recortarFondo(p, 180, 240, "auto");
  assert.deepEqual(Buffer.from(p), original, "el recorte modificó la foto que recibió");
  const b = R.recortarFondo(p, 180, 240, "auto");
  assert.deepEqual(Buffer.from(a.rgba), Buffer.from(b.rgba));
  assert.deepEqual(a.perfil, b.perfil);
  assert.equal(a.colorDominante, b.colorDominante);
});

prueba("el perfil de un vaso se angosta hacia abajo", () => {
  // Un trapecio: 120 px arriba, 70 abajo.
  const W = 200, H = 240;
  const p = foto(W, H, (x, y) => {
    if (y < 20 || y > 219) return BLANCO;
    const medio = 60 - ((y - 20) / 199) * 25;
    return Math.abs(x - 100) <= medio ? [220, 90, 120] : BLANCO;
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.perfil.length, R.PUNTOS_DE_PERFIL);
  assert.ok(r.perfil[0] < r.perfil[r.perfil.length - 1] - 0.3, `perfil ${r.perfil}`);
  for (let k = 1; k < r.perfil.length; k++) {
    assert.ok(r.perfil[k] >= r.perfil[k - 1] - 0.02, `el perfil no crece hacia arriba en ${k}: ${r.perfil}`);
  }
  assert.ok(r.simetria < 0.02, `un trapecio centrado salió asimétrico: ${r.simetria}`);
});

console.log("\narte · las medidas del envase");

const FICHA_VASO = {
  forma: "vaso", alto_mm: 90, ancho_mm: 75, fondo_mm: 75, apilable: true, acostado: false, fondo_foto: "auto",
};
const VASO_FOTO = { aspecto: 0.81, relleno: 0.78, simetria: 0.01 };

prueba("con ficha manda la ficha", () => {
  const e = P.empaqueDeArte({ nombre: "Finesse yogurt fresa 200 g", categoria: "Lácteos" }, FICHA_VASO, VASO_FOTO);
  assert.equal(e.de, "ficha");
  assert.equal(e.estimado, false);
  assert.equal(e.alto, 0.09); assert.equal(e.ancho, 0.075); assert.equal(e.fondo, 0.075);
  assert.equal(e.envase, "revolucion", "un vaso simétrico no se torneó");
  assert.equal(e.apilable, true);
  // Una botella fotografiada torcida no se tornea: sale deforme.
  assert.equal(P.empaqueDeArte({ nombre: "x" }, { ...FICHA_VASO, forma: "botella" }, { ...VASO_FOTO, simetria: 0.2 }).envase, "recorte");
  assert.equal(P.empaqueDeArte({ nombre: "x" }, { ...FICHA_VASO, forma: "caja" }, VASO_FOTO).envase, "caja");
  assert.equal(P.empaqueDeArte({ nombre: "x" }, { ...FICHA_VASO, forma: "bolsa" }, VASO_FOTO).envase, "almohada");
});

prueba("sin ficha, el yogur de 200 g mide lo que dice su contenido", () => {
  // Por rubro solo, «yogur» cae en un tetra de 20 cm contra los ~9 cm del vaso.
  const e = P.empaqueDeArte(
    { nombre: "Yogurt Finesse fresa 200 g", categoria: "Lácteos" }, null,
    { aspecto: 0.8, relleno: 0.78, simetria: 0.01 },
  );
  assert.equal(e.de, "contenido");
  assert.equal(e.estimado, true);
  assert.ok(e.alto >= 0.07 && e.alto <= 0.09, `el vaso salió de ${e.alto} m`);
  assert.ok(Math.abs(e.ancho / e.alto - 0.8) < 0.05, "el ancho no salió del aspecto de la foto");
});

prueba("sin ficha ni contenido líquido, el arroz mide lo que su rubro", () => {
  const e = P.empaqueDeArte({ nombre: "Arroz Diana 1 kg", categoria: "Arroz" }, null, { aspecto: 0.59, relleno: 0.94, simetria: 0.01 });
  assert.equal(e.de, "rubro");
  assert.equal(e.alto, 0.19);
  assert.equal(e.estimado, true);
  // El ancho por el aspecto, acotado entre la mitad y el doble del rubro.
  const angosta = P.empaqueDeArte({ nombre: "Arroz Diana 1 kg" }, null, { aspecto: 0.05, relleno: 0.94, simetria: 0.01 });
  assert.ok(Math.abs(angosta.ancho - 0.11 * 0.5) < 1e-12, "el ancho estimado no se acotó");
});

prueba("el contenido se lee del texto", () => {
  assert.deepEqual(P.contenidoDelTexto("Manzana Postobón 2 L"), { cm3: 2000, unidad: "volumen" });
  assert.deepEqual(P.contenidoDelTexto("Manzana 1,5 L"), { cm3: 1500, unidad: "volumen" });
  assert.deepEqual(P.contenidoDelTexto("Agua 600 ml"), { cm3: 600, unidad: "volumen" });
  assert.deepEqual(P.contenidoDelTexto("Müsli 410 g"), { cm3: 410, unidad: "masa" });
  assert.deepEqual(P.contenidoDelTexto("Arroz 1 kg"), { cm3: 1000, unidad: "masa" });
  assert.equal(P.contenidoDelTexto("Galletas surtidas"), null);
  // Acá el punto separa los miles: «1.000 g» es un kilo, no un gramo (el
  // envase caía al mínimo de 4 cm y el entrepaño se llenaba de juguetes).
  assert.deepEqual(P.contenidoDelTexto("Yogurt Alpina 1.000 g"), { cm3: 1000, unidad: "masa" });
  assert.deepEqual(P.contenidoDelTexto("Leche entera 1.100 ml"), { cm3: 1100, unidad: "volumen" });
  assert.deepEqual(P.contenidoDelTexto("Bolsa 1.000,5 g"), { cm3: 1000.5, unidad: "masa" });
  // Con una cifra, el punto sigue siendo decimal; y en litros o kilos un
  // «1.250» no es un envase de 1.250 L.
  assert.deepEqual(P.contenidoDelTexto("Gaseosa 1.5 L"), { cm3: 1500, unidad: "volumen" });
  assert.deepEqual(P.contenidoDelTexto("Queso 1.250 kg"), { cm3: 1250, unidad: "masa" });
  const kilo = P.empaqueDeArte({ nombre: "Yogurt Alpina 1.000 g", categoria: "Lácteos" }, null, { aspecto: 0.38, relleno: 0.8, simetria: 0.01 });
  assert.ok(kilo.alto > 0.2, `el yogur de 1.000 g salió de ${kilo.alto} m`);
});

prueba("la gaseosa es transparente y el vaso se apila de a tres", () => {
  const f = (forma, extra = {}) => ({ forma, alto_mm: 100, ancho_mm: 70, fondo_mm: 70, apilable: true, acostado: false, fondo_foto: "auto", ...extra });
  const rec = { aspecto: 0.3, relleno: 0.86, simetria: 0.02 };
  assert.equal(P.empaqueDeArte({ nombre: "Manzana 2 L" }, f("botella"), rec).transparente, true);
  assert.equal(P.empaqueDeArte({ nombre: "Finesse" }, f("vaso"), rec).transparente, false, "el vaso se tiñe como una botella");
  assert.equal(P.empaqueDeArte({ nombre: "Lata" }, f("lata"), rec).transparente, false);
  assert.equal(P.empaqueDeArte({ nombre: "Müsli" }, f("caja"), { ...rec, relleno: 0.95 }).transparente, false);
  // Sin ficha, el rubro: una gaseosa es botella transparente.
  assert.equal(P.empaqueDeArte({ nombre: "Gaseosa Manzana 1,5 L", categoria: "Gaseosas" }, null, rec).transparente, true);
  // De a tres también el vaso: de a dos la punta quedaba medio surtida.
  assert.equal(P.empaqueDeArte({ nombre: "Finesse" }, f("vaso"), rec).pisosMaximos, 3, "el vaso deja la punta medio surtida");
  assert.equal(P.empaqueDeArte({ nombre: "Lata" }, f("lata"), rec).pisosMaximos, 3);
});

prueba("lo que va refrigerado se sabe por su rubro y su nombre", () => {
  // Sí: el yogur de Alpina (lo que la crítica marcó en la punta seca), kumis,
  // queso, carne, un lácteo fresco.
  assert.equal(P.vaRefrigerado("Lácteos", "Finesse yogurt fresa 200 g"), true);
  assert.equal(P.vaRefrigerado("Lácteos", "Kumis Alpina 1 L"), true);
  assert.equal(P.vaRefrigerado("Quesos", "Queso campesino 500 g"), true);
  assert.equal(P.vaRefrigerado("Carnes", "Carne molida 500 g"), true);
  assert.equal(P.vaRefrigerado("Lácteos frescos", "Leche entera 1 L"), true);
  // No: la larga vida, la UHT y el arequipe van en seco aunque sean lácteos,
  // y le GANAN al rubro: un supermercado que archiva toda la leche en
  // «Lácteos frescos» no avisa por la de larga vida.
  assert.equal(P.vaRefrigerado("Lácteos frescos", "Leche Alpina larga vida 1 L"), false);
  assert.equal(P.vaRefrigerado("Lácteos frescos", "Leche entera UHT 1,1 L"), false);
  assert.equal(P.vaRefrigerado("Lácteos frescos", "Arequipe Alpina 250 g"), false);
  assert.equal(P.vaRefrigerado("Lácteos frescos", "Leche Alpina larga  vida"), false, "dos espacios");
  // «Lácteos» solo no dice nada: la leche condensada va en seco.
  assert.equal(P.vaRefrigerado("Lácteos", "Leche condensada Alpina 395 g"), false);
  assert.equal(P.vaRefrigerado("Cereales", "Müsli arándanos 410 g"), false);
  assert.equal(P.vaRefrigerado(null, null), false);
});

prueba("el aviso de frío sale en la punta seca y no en la nevera", () => {
  assert.equal(P.avisoDeFrio("punta", "Lácteos", "Finesse yogurt fresa 200 g"), true);
  assert.equal(P.avisoDeFrio("gondola", "Lácteos", "Finesse yogurt fresa 200 g"), true);
  for (const frio of ["nevera_refrescos", "nevera_carnes", "isla_fria", "nevera_vegetales"]) {
    assert.equal(P.avisoDeFrio(frio, "Lácteos", "Finesse yogurt fresa 200 g"), false, `avisa en ${frio}`);
  }
  // Lo seco no avisa en ningún lado.
  assert.equal(P.avisoDeFrio("punta", "Lácteos", "Leche Alpina larga vida 1 L"), false);
  // Los muebles fríos son los que existen en el editor: si se renombra uno,
  // el aviso empezaría a salir en la nevera.
  const fuente = readFileSync(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"), "utf8");
  for (const frio of P.MUEBLES_FRIOS) assert.match(fuente, new RegExp(`type:\\s*"${frio}"`), `${frio} no es un mueble del editor`);
});

prueba("el vaso de yogur sin ficha no se apila: sólo la ficha lo dice", () => {
  const e = P.empaqueDeArte(
    { nombre: "Finesse yogurt fresa 200 g", categoria: "Lácteos" }, null,
    { aspecto: 0.81, relleno: 0.78, simetria: 0.01 },
  );
  assert.equal(e.apilable, false, "un vaso de frío sin ficha se apiló de a tres");
  assert.equal(P.empaqueDeArte({ nombre: "Finesse" }, FICHA_VASO, VASO_FOTO).apilable, true);
});

prueba("acostada, la botella gira y no se achata", () => {
  const ficha = { ...FICHA_VASO, forma: "botella", alto_mm: 330, ancho_mm: 105, fondo_mm: 105, apilable: false };
  const e = P.empaqueDeArte({ nombre: "Manzana Postobón 2 L", categoria: "Gaseosas" }, ficha, { aspecto: 0.27, relleno: 0.86, simetria: 0.02 }, { acostado: true });
  assert.equal(e.acostado, true);
  assert.equal(e.envase, "revolucion");
  assert.equal(e.ancho, 0.33); assert.equal(e.alto, 0.105); assert.equal(e.fondo, 0.105);
  // La caja, con la regla de siempre: lo más corto pasa a ser el alto.
  const caja = P.empaqueDeArte({ nombre: "x" }, { ...ficha, forma: "caja", alto_mm: 270, ancho_mm: 190, fondo_mm: 65 }, null, { acostado: true });
  assert.deepEqual([caja.ancho, caja.alto, caja.fondo], [0.27, 0.065, 0.19]);
});

prueba("la ficha «va acostado» se aplica si en la sesión no se tocó nada", () => {
  const ficha = { ...FICHA_VASO, forma: "botella", alto_mm: 330, ancho_mm: 105, fondo_mm: 105, apilable: false, acostado: true };
  const rec = { aspecto: 0.27, relleno: 0.86, simetria: 0.02 };
  assert.equal(P.empaqueDeArte({ nombre: "Vino" }, ficha, rec).acostado, true, "la ficha acostada no se aplica");
  assert.equal(P.empaqueDeArte({ nombre: "Vino" }, ficha, rec, { acostado: undefined }).acostado, true);
  assert.notEqual(P.empaqueDeArte({ nombre: "Vino" }, ficha, rec, { acostado: false }).acostado, true, "«Volver a pararla» no manda");
  // Y el editor no la pisa con un `false` de arranque: el único `?? false`
  // que había hacía que la ficha nunca se aplicara.
  const editor = readFileSync(join(raiz, "src", "components", "StoreEditor3D", "StoreEditor3D.tsx"), "utf8");
  assert.ok(!/acostado:\s*como\??\.acostado\s*\?\?\s*false/.test(editor), "construirPrueba vuelve a pisar la ficha con `?? false`");
  assert.ok(!/\{\s*donde:\s*"todas",\s*acostado:\s*false\s*\}/.test(editor), "una prueba nueva vuelve a arrancar con `acostado: false`");
});

prueba("el producto concreto nunca se cambia por uno más chico del rubro", () => {
  const codigo = readFileSync(join(muebles, "producto.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const cuerpo = codigo.slice(codigo.indexOf("export function empaqueDeArte"));
  assert.ok(cuerpo.length > 100, "no se encontró empaqueDeArte");
  assert.ok(!/empaqueQueEntra\(|MAS_CHICO/.test(cuerpo),
    "`empaqueDeArte` achica el producto: en la prueba se vería otro producto que el del proveedor");
});

// La caja en tres cuartos: el aviso «la foto parece en perspectiva» es lo que
// evita llevar a la reunión una caja con doble lomo. Vive en EditorDeFicha
// (React), así que se compila para Node con React adentro.
const ficha = await (async () => {
  const r = await build({
    entryPoints: [join(raiz, "src", "components", "StoreEditor3D", "EditorDeFicha.tsx")],
    bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
})();

prueba("una caja fotografiada en tres cuartos se avisa; de frente, no", () => {
  const de = (relleno, simetria, estado = "fondo-quitado") => ficha.pareceEnPerspectiva({ estado, relleno, simetria });
  assert.equal(de(0.98, 0.01), false, "una caja de frente se marcó en perspectiva");
  assert.equal(de(0.90, 0.068), true, "la Müsli de prueba (relleno 0,90) no se avisa");
  assert.equal(de(0.96, 0.068), true, "una caja asimétrica no se avisa");
  assert.equal(de(0.93, 0.01), true, "una caja con las esquinas vacías no se avisa");
  assert.equal(de(0.80, 0.2, "conservado"), false, "se avisa sobre un fondo que no se quitó");
});

prueba("los campos de la ficha siguen a la ficha cuando cambia desde afuera", () => {
  // Otra foto en el alta vacía la ficha, y «Medidas» de otro producto la
  // reemplaza sin desmontar el editor: el «9» viejo quedaba escrito con la
  // ficha vacía (campo en rojo, «Poné el alto» con el campo lleno).
  const src = readFileSync(join(raiz, "src", "components", "StoreEditor3D", "EditorDeFicha.tsx"), "utf8");
  assert.match(src, /useEffect\(\(\) => \{\s*setTextos\(\(t\) => \{[\s\S]{0,400}\}, \[ficha\.alto_mm, ficha\.ancho_mm, ficha\.fondo_mm\]\);/,
    "los textos de la ficha no se sincronizan con la ficha");
  // Lo tecleado a medias no se pisa: «7,» ya vale lo mismo que la ficha.
  assert.match(src, /const sigue = \(texto: string, mm: number \| null\) => \(aMm\(texto\) === mm \? texto : mmACm\(mm\)\);/);
  // La foto con fondo pide el ancho; y «va acostado» se puede marcar.
  assert.match(src, /const pideAncho = !!estimado\?\.anchoEstimado;/);
  assert.match(src, /checked=\{ficha\.acostado\}/, "la ficha no tiene la casilla «va acostado»");
});

prueba("el precio al público: pesos enteros o nada, con los mismos topes que el servidor", () => {
  for (const [texto, pesos] of [["4.900", 4900], ["$ 4900", 4900], ["4 900", 4900], ["4900,00", 4900], ["1.234", 1234]]) {
    assert.equal(ficha.aPesos(texto), pesos, `«${texto}»`);
  }
  // Lo que no es un precio no se guarda como uno: el hablador va sin cifra.
  for (const texto of ["", "  ", "abc", "4,9", "49", "-4900", "20.000.000", "4900 pesos"]) {
    assert.equal(ficha.aPesos(texto), null, `«${texto}» se guardó como precio`);
  }
  const back = readFileSync(join(raiz, "..", "backend", "app", "routers", "catalogo.py"), "utf8");
  assert.match(back, new RegExp(`precio_publico: Optional\\[int\\] = Field\\(None, ge=${ficha.PRECIO_MINIMO}, le=${ficha.PRECIO_MAXIMO.toLocaleString("en-US").replace(/,/g, "_")}\\)`),
    "los topes del precio en la ficha y en el servidor no son los mismos");
  const src = readFileSync(join(raiz, "src", "components", "StoreEditor3D", "EditorDeFicha.tsx"), "utf8");
  assert.match(src, /cambiar\(\{ precio_publico: aPesos\(e\.target\.value\) \}\);/, "el campo del precio no guarda lo que se tecleó");
});

// ── La textura de cada envase (texturas.ts) ─────────────────────────────────

console.log("\narte · la textura de cada envase");

const px = (img, x, y) => Array.from(img.rgba.slice((y * img.ancho + x) * 4, (y * img.ancho + x) * 4 + 4));
const claroNeutro = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b >= 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 30;

prueba("el borde se encoge 2 px y lo de afuera toma el color de adentro", () => {
  // Un producto rojo con un contorno de 1 px casi blanco —el blanco del
  // estudio mezclado en el borde—, sobre transparente.
  const W = 60, H = 80;
  const img = { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    const dentro = x >= 10 && x <= 49 && y >= 10 && y <= 69;
    const borde = dentro && (x === 10 || x === 49 || y === 10 || y === 69);
    return dentro ? (borde ? [235, 225, 225, 200] : [200, 20, 40, 255]) : [250, 250, 250, 0];
  }) };
  const e = T.erosionarYSangrar(img, 2, 8);
  assert.equal(px(e, 11, 30)[3], 0, "el borde no se encogió");
  assert.equal(px(e, 13, 30)[3], 255, "se comió el interior");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = px(e, x, y);
    if (p[3] > 0) assert.ok(!claroNeutro(p), `queda un halo blanco opaco en (${x}, ${y})`);
  }
  // Lo que quedó afuera —hasta 8 px— tiene el rojo de adentro, no el blanco.
  for (const [x, y] of [[11, 30], [8, 30], [30, 6]]) {
    const [r, g] = px(e, x, y);
    assert.ok(r > 150 && g < 80, `(${x}, ${y}) no tomó el color de adentro: ${px(e, x, y)}`);
  }
  // Determinista.
  assert.deepEqual(Array.from(T.erosionarYSangrar(img, 2, 8).rgba), Array.from(e.rgba));
});

/** Una caja en tres cuartos dibujada en perspectiva: el frente (de x0 a xc)
 *  con su arista lejana de alto h0 y la cercana de alto h1, y el costado (de
 *  xc a xr). Una franja azul en el CENTRO del frente en 3D, dibujada donde la
 *  proyecta la perspectiva. */
function cajaEnTresCuartos() {
  const W = 400, H = 460, x0 = 20, xc = 300, xr = 380, h0 = 300, h1 = 420, h2 = 360, cy = 230;
  const centro = (x0 * h1 + xc * h0) / (h1 + h0);   // u = 0,5 proyectado
  const altoEn = (x) => (x <= xc ? h0 + ((x - x0) / (xc - x0)) * (h1 - h0) : h1 + ((x - xc) / (xr - xc)) * (h2 - h1));
  const rgba = foto(W, H, (x, y) => {
    if (x < x0 || x > xr) return [255, 255, 255, 0];
    const a = altoEn(x);
    if (Math.abs(y - cy) > a / 2) return [255, 255, 255, 0];
    if (x > xc) return [150, 150, 155, 255];                 // el costado, gris
    return Math.abs(x - centro) <= 3 ? [20, 40, 220, 255] : [210, 30, 40, 255];
  });
  return { img: { ancho: W, alto: H, rgba }, xc, h1 };
}

prueba("la caja en tres cuartos se endereza al frente, con su perspectiva", () => {
  const { img, h1 } = cajaEnTresCuartos();
  const r = T.rectificarCaja(img);
  assert.ok(r, "no encontró la arista de una caja en tres cuartos");
  assert.equal(r.costado, "derecha");
  assert.ok(Math.abs(r.arista - 300) <= 3, `arista en ${r.arista}`);
  assert.ok(Math.abs(r.alto - h1) <= 4, `alto ${r.alto}`);
  // Sin un píxel del costado gris ni transparente: es el frente solo.
  for (let y = 0; y < r.alto; y += 3) for (let x = 0; x < r.ancho; x += 3) {
    const [cr, , cb, a] = px(r, x, y);
    assert.equal(a, 255, "el frente enderezado tiene agujeros");
    assert.ok(cr > 150 || cb > 150, `quedó costado en (${x}, ${y}): ${px(r, x, y)}`);
  }
  // El centro del frente en 3D cae en el centro de la textura: la mitad
  // lejana se des-comprime, no se estira parejo.
  const azules = [];
  for (let x = 0; x < r.ancho; x++) if (px(r, x, Math.round(r.alto / 2))[2] > 150) azules.push(x);
  const medio = azules.reduce((a, b) => a + b, 0) / azules.length;
  assert.ok(Math.abs(medio / r.ancho - 0.5) <= 0.02, `el centro del frente quedó en ${(medio / r.ancho).toFixed(3)}`);
});

prueba("una caja de frente, una botella o una bolsa no se enderezan", () => {
  const caja = { ancho: 200, alto: 300, rgba: foto(200, 300, (x, y) =>
    (x >= 20 && x < 180 && y >= 20 && y < 280 ? [200, 30, 40, 255] : [255, 255, 255, 0])) };
  assert.equal(T.rectificarCaja(caja), null, "enderezó una caja que ya estaba de frente");
  // Un cilindro: contorno curvo arriba y abajo, sin quiebre.
  const cil = { ancho: 200, alto: 400, rgba: foto(200, 400, (x, y) => {
    const s = (x - 100) / 80;
    if (Math.abs(s) > 1) return [255, 255, 255, 0];
    const e = 18 * Math.sqrt(1 - s * s);
    return y >= 30 - e && y <= 370 + e ? [30, 90, 200, 255] : [255, 255, 255, 0];
  }) };
  assert.equal(T.rectificarCaja(cil), null, "enderezó un cilindro");
});

prueba("el costado de la caja es un color del borde, sin los blancos", () => {
  const img = { ancho: 100, alto: 150, rgba: foto(100, 150, (x, y) =>
    (x < 8 || x > 91 || y < 12 ? [190, 25, 35, 255] : [250, 250, 250, 255])) };
  const c = T.colorDeCostado(img);
  assert.ok(parseInt(c.slice(1, 3), 16) > 150 && parseInt(c.slice(3, 5), 16) < 60, `costado ${c}`);
  const blanca = { ancho: 100, alto: 150, rgba: foto(100, 150, () => [245, 244, 240, 255]) };
  const b = T.colorDeCostado(blanca);
  assert.ok(parseInt(b.slice(1, 3), 16) > 220, `una caja blanca dio un costado ${b}`);
});

/** Una gaseosa de frente: tapa naranja arriba, PET claro (el fondo visto a
 *  través), la etiqueta rosa con letra blanca y el líquido rojo abajo. */
function botella(liquido = [140, 38, 40]) {
  const W = 80, H = 300;
  return { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    if (x < 10 || x > 69) return [255, 255, 255, 0];
    if (y < 15) return [235, 110, 40, 255];                              // tapa
    if (y < 110) return (x + y) % 9 === 0 ? [190, 185, 180, 255] : [232, 230, 226, 255]; // PET claro
    if (y < 180) return x % 7 < 2 && y % 11 < 6 ? [248, 248, 248, 255] : [225, 70, 140, 255]; // etiqueta
    return liquido.concat(255);
  }) };
}

prueba("la botella transparente se llena del color de su líquido", () => {
  const b = botella();
  const l = T.llenarBotella(b);
  assert.ok(l.liquido, "no encontró el líquido");
  assert.ok(parseInt(l.liquido.slice(1, 3), 16) > 110 && parseInt(l.liquido.slice(3, 5), 16) < 70, `líquido ${l.liquido}`);
  // El PET claro de arriba ahora es líquido.
  const [r, g] = px(l, 40, 60);
  assert.ok(r > g + 50, `el tramo transparente sigue blanco: ${px(l, 40, 60)}`);
  // La letra blanca de la etiqueta NO se tiñe, ni la tapa.
  for (let y = 110; y < 180; y++) for (let x = 10; x < 70; x++) {
    if (x % 7 < 2 && y % 11 < 6) assert.deepEqual(px(l, x, y), [248, 248, 248, 255], "se tiñó la letra de la etiqueta");
  }
  assert.deepEqual(px(l, 40, 5), [235, 110, 40, 255], "se tiñó la tapa");
  // Sin un líquido de color (agua, una botella blanca) no se toca nada.
  const agua = botella([200, 205, 210]);
  const a = T.llenarBotella(agua);
  assert.equal(a.liquido, null);
  assert.deepEqual(Array.from(a.rgba), Array.from(agua.rgba), "tiñó una botella de agua");
});

prueba("los hombros de la botella, claros apenas teñidos, también se llenan", () => {
  // El brillo del PET en los hombros toma el rosa de la etiqueta (croma de
  // 30 a 60): quedaba como manchas blancas triangulares que de cerca se
  // leían como suciedad.
  const W = 80, H = 300;
  const b = { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    if (x < 10 || x > 69) return [255, 255, 255, 0];
    if (y < 15) return [235, 110, 40, 255];
    if (y < 110) return x < 18 ? [250, 214, 226, 255] : [232, 230, 226, 255];   // hombro rosado
    if (y < 180) return [225, 70, 140, 255];
    return [140, 38, 40, 255];
  }) };
  const l = T.llenarBotella(b);
  const [r, g] = px(l, 12, 60);
  assert.ok(r > g + 50, `el hombro sigue blanco: ${px(l, 12, 60)}`);
  assert.deepEqual(px(l, 40, 140), [225, 70, 140, 255], "se tiñó la etiqueta");
});

/** Un vaso de frente: arriba el foil (lavanda) de punta a punta con el
 *  reborde (rosa) asomando en las puntas, abajo la etiqueta. */
function vaso({ franja = 0.04 } = {}) {
  const W = 100, H = 200;
  return { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    if (y < H * 0.02 && (x < 20 || x >= 80)) return [235, 150, 160, 255];         // reborde
    if (y < H * franja) return [176, 170, 200, 255];                               // foil
    return x < 30 ? [40, 40, 90, 255] : (x + y) % 5 ? [245, 245, 245, 255] : [200, 40, 50, 255];
  }) };
}

prueba("la tapa del vaso se lee de su foto: franja, foil y reborde", () => {
  const t = T.tapaDeFoto(vaso());
  // La franja de arriba que es tapa (4 %, con un 1 % de tolerancia). El foil
  // se lee de lo de MÁS arriba: un poco más abajo ya es etiqueta.
  assert.ok(Math.abs(t.franja - 0.04) <= 0.011, `franja ${t.franja}`);
  assert.equal(t.tapa, "#b0aac8", "el foil no sale del medio de arriba");
  assert.equal(t.borde, "#eb96a0", "el reborde no sale de las puntas de arriba");
  // Nunca más del 12 %: lo de abajo es etiqueta aunque se parezca.
  assert.ok(T.tapaDeFoto(vaso({ franja: 0.4 })).franja <= 0.12 + 1e-9, "se comió la etiqueta");
  // Un vaso sin franja de tapa (una lata de frente pareja) no recorta.
  const lata = { ancho: 60, alto: 120, rgba: foto(60, 120, (x, y) => (y % 7 ? [200, 30, 30, 255] : [250, 250, 250, 255])) };
  assert.ok(T.tapaDeFoto(lata).franja <= 0.02, `recortó una lata pareja: ${T.tapaDeFoto(lata).franja}`);
});

prueba("los cantos de la caja se oscurecen y el centro no se toca", () => {
  const W = 200, H = 40;
  const img = { ancho: W, alto: H, rgba: foto(W, H, () => [200, 100, 50, 255]) };
  const o = T.oscurecerCantos(img);
  assert.ok(px(o, 0, 10)[0] < 200 * 0.7, `el canto no se oscurece: ${px(o, 0, 10)}`);
  assert.ok(px(o, W - 1, 10)[0] < 200 * 0.7);
  assert.deepEqual(px(o, W / 2, 10), [200, 100, 50, 255], "se oscureció el frente");
  assert.deepEqual(px(img, 0, 10), [200, 100, 50, 255], "mutó la entrada");
});

prueba("los costados de la bolsa toman el color del plástico", () => {
  const W = 100, H = 40;
  const img = { ancho: W, alto: H, rgba: foto(W, H, (x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])) };
  const t = T.tenirCantos(img, "#c81e1e");
  const borde = px(t, 0, 5);
  assert.ok(Math.abs(borde[0] - 0xc8) < 70 && borde[1] < 90, `el canto no tomó el color: ${borde}`);
  assert.deepEqual(px(t, 50, 5), px(img, 50, 5), "se tiñó el frente");
  // Sin color dominante válido, no se toca nada.
  assert.deepEqual(Array.from(T.tenirCantos(img, "").rgba), Array.from(img.rgba));
});

// ── La botella llena hasta el borde (ronda 2 de la dueña) ───────────────────
//
// La crítica midió en la 2 L dos bandas crema de ~10 px en los hombros: p95
// 240 contra 37 del cuerpo, «un arnés blanco». Dos causas: el tinte decidía
// por fila y en el hombro la fila mezcla líquido oscuro con el anillo claro
// de la refracción, y el torno era más ancho que la foto en el hombro.

const G = await (async () => {
  const r = await build({ entryPoints: [join(muebles, "perfiles.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
})();
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const percentil95 = (vs) => { const v = vs.slice().sort((a, b) => a - b); return v[Math.floor(v.length * 0.95)]; };

/** Una 2 L de frente con HOMBRO: la tapa, el cuello, el hombro que se abre
 *  y el cuerpo; el líquido rojo, la etiqueta rosa con letra blanca y, en el
 *  hombro, el anillo claro de 10 px que la refracción deja en el borde. */
const SEMI = (y) => (y < 20 ? 14 : y < 40 ? 16 : y < 140 ? 16 + 34 * Math.sin(((y - 40) / 100) * Math.PI / 2) : 50);
function botellaConHombro({ fondo = [255, 255, 255, 0] } = {}) {
  const W = 120, H = 400;
  return { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    const d = SEMI(y) - Math.abs(x + 0.5 - W / 2);
    if (y < 4 || y > 395 || d < 0) return fondo;
    if (y < 20) return [235, 110, 40, 255];                                        // tapa
    if (y >= 200 && y < 280) return x % 7 < 2 && y % 11 < 6 ? [248, 248, 248, 255] : [225, 70, 140, 255]; // etiqueta
    if (y >= 40 && y < 140 && d < 10) return [205, 200, 194, 255];                // el anillo claro
    return [140, 38, 40, 255];                                                     // el líquido
  }) };
}

prueba("el hombro de la botella queda lleno: sin el anillo claro (p95 < 150)", () => {
  const b = botellaConHombro();
  // El mismo camino que la etiqueta: el borde encogido 4 px y después llena.
  const l = T.llenarBotella(T.erosionarYSangrar(b, 4, 10));
  assert.ok(l.liquido, "no encontró el líquido");
  const hombro = [], antes = [];
  for (let y = 45; y < 135; y++) for (let x = 0; x < b.ancho; x++) {
    if (b.rgba[(y * b.ancho + x) * 4 + 3] < 128) continue;
    hombro.push(lum(px(l, x, y)));
    antes.push(lum(px(b, x, y)));
  }
  assert.ok(percentil95(antes) > 180, "la botella de prueba no tiene el anillo: la prueba no prueba nada");
  assert.ok(percentil95(hombro) < 150, `el hombro sigue con el anillo claro: p95 ${percentil95(hombro)}`);
  // Lo de AFUERA de la silueta (el sangrado, que se ve si el torno queda un
  // pelo más ancho) también es líquido oscuro, no crema.
  const afuera = [];
  for (let y = 45; y < 135; y++) {
    const x = Math.round(b.ancho / 2 + SEMI(y) + 1);
    if (x < b.ancho) afuera.push(lum(px(l, x, y)));
  }
  assert.ok(percentil95(afuera) < 150, `el sangrado del hombro sigue claro: p95 ${percentil95(afuera)}`);
  // La letra blanca y el rosa de la etiqueta siguen intactos, y la tapa.
  for (let y = 200; y < 280; y++) for (let x = 40; x < 80; x++) {
    if (x % 7 < 2 && y % 11 < 6) assert.deepEqual(px(l, x, y), [248, 248, 248, 255], "se tiñó la letra de la etiqueta");
    else assert.deepEqual(px(l, x, y), [225, 70, 140, 255], "se tiñó la etiqueta");
  }
  assert.deepEqual(px(l, 60, 10), [235, 110, 40, 255], "se tiñó la tapa");
  // La pared de canto, más oscura que el centro; y el reflejo, más claro.
  const centro = lum(px(l, 60, 100)), canto = lum(px(l, 60 - SEMI(100) + 1, 100));
  assert.ok(canto < centro, `el canto no se oscurece: ${canto} contra ${centro}`);
});

prueba("la clasificación de la botella es por cromaticidad: el rosa no es líquido", () => {
  // Con la cubeta de tono, el líquido [140,38,40] y el rosa [225,70,140]
  // caían en la misma y la letra blanca de la etiqueta se teñía.
  const L = [140, 38, 40];
  assert.equal(T.claseDePixel(140, 38, 40, L), "liquido");
  assert.equal(T.claseDePixel(110, 30, 32, L), "liquido");
  assert.equal(T.claseDePixel(225, 70, 140, L), "otro");
  assert.equal(T.claseDePixel(235, 110, 40, L), "otro", "la tapa naranja pasa por líquido");
  // Tan oscuros como el líquido: los separa el COLOR, no la luz (el rosa y la
  // tapa de arriba ya caían afuera por claros).
  assert.equal(T.claseDePixel(150, 40, 90, L), "otro", "un rosa oscuro pasa por líquido");
  assert.equal(T.claseDePixel(150, 60, 20, L), "otro", "un marrón anaranjado pasa por líquido");
  assert.equal(T.claseDePixel(248, 248, 248, L), "claro");
  assert.equal(T.claseDePixel(205, 200, 194, L), "claro");
  assert.equal(T.claseDePixel(250, 214, 226, L), "claro", "el claro apenas rosado del hombro no es claro");
  const filas = T.filasDeEtiqueta(botellaConHombro(), L);
  assert.ok(filas[10] && filas[240], "la tapa o la etiqueta no son filas de etiqueta");
  assert.ok(!filas[100] && !filas[330], "el hombro o el cuerpo quedaron como etiqueta");
});

prueba("el perfil de 64 bandas: el torno no queda más ancho que la foto (+1 px)", () => {
  const W = 160, H = 440;
  // La misma botella, sobre blanco, para que el recorte saque su perfil.
  const b = botellaConHombro();
  const p = foto(W, H, (x, y) => {
    const xx = x - 20, yy = y - 20;
    if (xx < 0 || xx >= b.ancho || yy < 0 || yy >= b.alto) return BLANCO;
    const i = (yy * b.ancho + xx) * 4;
    return b.rgba[i + 3] ? [b.rgba[i], b.rgba[i + 1], b.rgba[i + 2]] : BLANCO;
  });
  const r = R.recortarFondo(p, W, H, "auto");
  assert.equal(r.perfil.length, 64, `el perfil tiene ${r.perfil.length} bandas`);
  assert.equal(R.PUNTOS_DE_PERFIL, 64);
  const ancho = 0.105, alto = 0.33;
  const g = G.geometriaDeEtiqueta("revolucion", ancho, alto, ancho, r.perfil, false, true);
  // La silueta del torno vista de frente: los vértices del meridiano +X.
  const pos = g.attributes.position;
  const mer = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) > 0 && Math.abs(pos.getZ(i)) < 1e-6 * ancho) mer.push([pos.getY(i), pos.getX(i)]);
  }
  mer.sort((a, c) => a[0] - c[0]);
  assert.ok(mer.length > 20, "no se encontró el meridiano del torno");
  let peor = -Infinity, donde = -1;
  for (let y = 0; y < r.alto; y++) {
    const f = 1 - (y + 0.5) / r.alto;
    // El pie se redondea a propósito y la tapa termina en su labio.
    if (f < 0.08 || f > 0.95) continue;
    let l = -1, d = -1;
    for (let x = 0; x < r.ancho; x++) if (r.rgba[(y * r.ancho + x) * 4 + 3] >= 128) { if (l < 0) l = x; d = x; }
    if (l < 0) continue;
    const yy = alto / 2 - ((y + 0.5) / r.alto) * alto;
    let rad = 0;
    for (let k = 0; k < mer.length - 1; k++) {
      const [y0, r0] = mer[k], [y1, r1] = mer[k + 1];
      if (yy >= y0 && yy <= y1 && y1 > y0) { rad = r0 + ((r1 - r0) * (yy - y0)) / (y1 - y0); break; }
    }
    const exceso = (rad / ancho) * r.ancho - (d - l + 1) / 2;
    if (exceso > peor) { peor = exceso; donde = y; }
  }
  if (process.env.VER) console.log("    exceso máximo", peor.toFixed(2), "px en", donde);
  assert.ok(peor <= 1, `el torno sale ${peor.toFixed(2)} px más ancho que la foto en la fila ${donde}`);
});

prueba("la botella de frente: 2.200 triángulos o menos; el vaso recto no cambia", () => {
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  // Un hombro brusco: el ajuste suma filas, pero hasta el tope.
  const brusco = Array.from({ length: 64 }, (_, k) => (k < 40 ? 1 : k < 48 ? 1 - (k - 39) * 0.08 : 0.35));
  const b = G.geometriaDeEtiqueta("revolucion", 0.105, 0.33, 0.105, brusco, false, true);
  assert.ok(tris(b) <= 2200, `la botella pesa ${tris(b)} triángulos`);
  assert.ok(tris(b) > 1664, "el hombro no ganó filas");
  assert.equal(G.TOPE_DE_BOTELLA, 2200);
  // Lo de atrás no cambia (12 lados, 8 filas): 312.
  assert.equal(tris(G.geometriaDeEtiqueta("revolucion", 0.105, 0.33, 0.105, brusco, false, true, 0, "bajo")), 312);
  // El vaso recto sigue con 4 filas: 512 con la tapa aparte.
  const recto = Array.from({ length: 64 }, (_, k) => 0.8 + 0.2 * (k / 63));
  assert.equal(tris(G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, recto, false, false, 0.04)), 512);
  // Con 64 bandas la de abajo es el canto redondeado de la base (el Finesse:
  // 0,49 contra 0,60): el vaso sigue recto, con UNA fila más para ese canto,
  // y no se va a las dieciséis (1.280 triángulos por vaso del frente).
  const conCanto = recto.map((v, k) => (k === 0 ? v - 0.12 : v));
  assert.equal(tris(G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, conCanto, false, false, 0.04)), 576,
    "el canto de la base manda el vaso a dieciséis filas");
  assert.equal(tris(G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, conCanto, false, false, 0.04, "bajo")), 192);
  // Un vaso con un escalón (un reborde a media altura) sigue con sus dieciséis:
  // cuatro filas no lo siguen.
  const curvo = Array.from({ length: 64 }, (_, k) => (k < 40 ? 0.7 : 1));
  assert.equal(tris(G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, curvo, false, false, 0.04)), 1280);
  // Las filas adaptadas: una de más donde el salto pasa del 4 %, ninguna
  // donde la silueta es pareja.
  const parejo = G.filasAdaptadas([0, 0.5, 1], () => 1, 32, 2200);
  assert.deepEqual(parejo, [0, 0.5, 1]);
  const conSalto = G.filasAdaptadas([0, 0.5, 1], (f) => (f < 0.75 ? 1 : 0.5), 32, 2200);
  assert.ok(conSalto.length > 3 && conSalto.every((f, i) => i === 0 || f > conSalto[i - 1]), `${conSalto}`);
});

// ── La espalda del envase torneado ──────────────────────────────────────────
//
// La UV del frente es plana: la mitad de atrás recibía la foto espejada, y a
// ~70° la columna de la punta repetía «esse» y las fresas comprimidas.

/** Un vaso con silueta (cono truncado) y «texto»: trazos verticales de
 *  colores distintos en cada columna, como letras, sobre fondo transparente. */
function vasoConTexto() {
  const W = 120, H = 200;
  return { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    const semi = 45 + (y / H) * 12;                          // más ancho abajo
    if (Math.abs(x + 0.5 - W / 2) > semi) return [255, 255, 255, 0];
    if (y < 6) return [176, 170, 200, 255];                  // el foil
    if (y > 186) return [90, 60, 140, 255];                  // el pie
    if (x < 30) return [210, 40, 90, 255];                   // el costado izquierdo, fresa
    if (x > 92) return [60, 30, 120, 255];                   // el derecho, morado
    return (x * 7 + y * 3) % 11 < 3 ? [30, 30, 30, 255] : [240, 236, 230, 255];  // «finesse»
  }) };
}

prueba("la espalda no repite el frente: los costados, interpolados, y la tabla sin texto", () => {
  const v = vasoConTexto();
  const e = T.espaldaDeEtiqueta(v);
  const W = v.ancho, H = v.alto;
  assert.equal(e.ancho, W); assert.equal(e.alto, H);
  // Opaca: es la textura de un envase sólido.
  for (let i = 3; i < e.rgba.length; i += 4) assert.equal(e.rgba[i], 255);
  // Ninguna columna de la espalda es una columna del frente (filas 7 %-97 %).
  const desde = Math.ceil(H * 0.03), hasta = Math.floor(H * 0.93);
  const col = (img, x) => { const c = []; for (let y = desde; y < hasta; y++) c.push(...px(img, x, y).slice(0, 3)); return c; };
  const dif = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
  // Las columnas con «texto» del frente (las de los costados son lisas, del
  // color del cuerpo, que la espalda sí repite a propósito).
  const frente = Array.from({ length: 92 - 30 + 1 }, (_, k) => col(v, 30 + k));
  for (let x = Math.round(W * 0.15); x < Math.round(W * 0.85); x++) {
    const c = col(e, x);
    const min = Math.min(...frente.map((f) => dif(c, f)));
    assert.ok(min > 8, `la columna ${x} de la espalda es una columna del frente (diferencia ${min.toFixed(1)})`);
  }
  // Empalma en ±90°: la columna 0 es el promedio de los 3 px de adentro del
  // borde izquierdo de la silueta, y la última el del derecho (±2 niveles).
  for (let y = desde; y < hasta; y += 7) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (v.rgba[(y * W + x) * 4 + 3] >= 128) { if (l < 0) l = x; r = x; }
    for (const [xe, x0] of [[0, l], [W - 1, r - 2]]) {
      for (let c = 0; c < 3; c++) {
        const esperado = (px(v, x0, y)[c] + px(v, x0 + 1, y)[c] + px(v, x0 + 2, y)[c]) / 3;
        assert.ok(Math.abs(px(e, xe, y)[c] - esperado) <= 2, `fila ${y}: no empalma en ${xe === 0 ? "+X" : "−X"} (${px(e, xe, y)} contra ${esperado})`);
      }
    }
  }
  // La tabla nutricional: en el 35 % central, cada fila pareja (sin trazos de
  // texto) donde no hay borde suave.
  let filasDeTabla = 0;
  for (let y = Math.round(H * 0.33); y < Math.round(H * 0.67); y++) {
    const ls = [];
    for (let x = Math.round(W * 0.36); x <= Math.round(W * 0.64); x++) ls.push(lum(px(e, x, y)));
    assert.ok(Math.max(...ls) - Math.min(...ls) <= 3, `fila ${y} de la tabla con trazos: ${Math.min(...ls)}–${Math.max(...ls)}`);
    if (ls[0] > 200 || ls[0] < 190) filasDeTabla++;
  }
  assert.ok(filasDeTabla > 0, "no hay tabla");
  // La tabla es más clara que los costados, y tiene renglones.
  const enTabla = [...Array(Math.round(H * 0.3)).keys()].map((k) => lum(px(e, W / 2, Math.round(H * 0.35) + k)));
  assert.ok(Math.max(...enTabla) > 225 && Math.min(...enTabla) < 200, "la tabla no tiene papel claro con renglones");
  // Las filas de la tapa (arriba del 97 %) y del pie (abajo del 7 %) son las
  // del frente: ahí muestrean las tapas del torno de la botella.
  for (const y of [0, 2, H - 1, H - 5]) for (let x = 0; x < W; x += 3) {
    assert.deepEqual(px(e, x, y).slice(0, 3), px(v, x, y).slice(0, 3), `la fila ${y} no es la del frente`);
  }
  // `banda` dice en qué filas puede ir la tabla: en la botella, sólo sobre la
  // etiqueta (sobre el líquido sería un parche blanco).
  const sinTabla = T.espaldaDeEtiqueta(v, Array.from({ length: H }, () => false));
  assert.ok(lum(px(sinTabla, W / 2, H / 2)) < 200, "la tabla salió en filas que no son de etiqueta");
  // Pura: no toca la entrada.
  assert.deepEqual(Array.from(vasoConTexto().rgba), Array.from(v.rgba));
});

prueba("la franja de la etiqueta cae en las filas rosas de la botella; sin líquido, la del medio", () => {
  const b = botella();
  const L = T.liquidoDe(b);
  assert.ok(L, "no encontró el líquido");
  const f = T.franjaDeEtiqueta(b, L);
  // Las filas rosas son de la 110 a la 179 de 300.
  assert.ok(Math.abs(f.desde - 110 / 300) <= 0.01 && Math.abs(f.hasta - 180 / 300) <= 0.01, `franja ${f.desde}–${f.hasta}`);
  // Las columnas, las de la silueta (10 a 69 de 80), sin el aire de afuera.
  assert.ok(Math.abs(f.x0 - 10 / 80) <= 0.0001 && Math.abs(f.x1 - 70 / 80) <= 0.0001, `columnas ${f.x0}–${f.x1}`);
  // Con la marca en letra clara en una banda de la etiqueta, el cabezote va
  // a esa banda: la etiqueta entera de una 2 L es casi cuadrada y al alto
  // del cabezote quedaba un sello chico en un aviso de 1,1 m.
  const W = 80, H = 300;
  const conMarca = { ancho: W, alto: H, rgba: foto(W, H, (x, y) => {
    if (x < 10 || x > 69) return [255, 255, 255, 0];
    if (y < 15) return [235, 110, 40, 255];
    if (y < 110) return [140, 38, 40, 255];
    if (y < 180) return y >= 125 && y < 150 && x % 4 < 2 ? [248, 248, 248, 255] : [225, 70, 140, 255];
    return [140, 38, 40, 255];
  }) };
  const fm = T.franjaDeEtiqueta(conMarca, T.liquidoDe(conMarca));
  assert.ok(fm.desde * H >= 110 - 1 && fm.hasta * H <= 180 + 1, `la franja se sale de la etiqueta: ${fm.desde * H}–${fm.hasta * H}`);
  assert.ok(fm.desde * H <= 126 && fm.hasta * H >= 149, `la franja no toma la marca: ${fm.desde * H}–${fm.hasta * H}`);
  assert.ok((fm.hasta - fm.desde) * H < 60, "la franja no se acotó a la marca");
  // Sin líquido (un vaso, una caja), la del medio de siempre.
  const m = T.franjaDeEtiqueta(b, null);
  assert.ok(Math.abs(m.desde - 0.34) < 0.005 && Math.abs(m.hasta - 0.66) < 0.005);
});

console.log(`\n${hechas} pruebas del arte del proveedor` + (process.exitCode ? " · CON FALLAS" : " · todo en orden") + "\n");
