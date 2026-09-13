/**
 * Pruebas del mobiliario 3D: que la góndola nueva no se lleve puesto el negocio.
 *   npm run probar:muebles
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 *
 * El mobiliario estaba hecho de `boxGeometry`. Reemplazarlo por piezas de
 * lámina plegada es un cambio de geometría, y la geometría de estos muebles
 * carga DOS cosas que no son geometría:
 *
 *   · los paneles de slot — el espacio que se vende, cuya posición está
 *     guardada en los contratos de los clientes; y
 *   · el pintado de caras — la imagen del producto del proveedor.
 *
 * Las dos viven adentro del mismo componente que dibuja el mueble, así que
 * cualquiera que entre a mejorar la forma las tiene delante y las puede borrar
 * sin notarlo. **Ya pasó**: un intento previo de hacer los muebles más reales
 * (PR #62) reescribió `GondolaMesh` entero y se llevó `statusColor`,
 * `facePaint` y los cinco props de slot. La forma mejoraba; el mueble dejaba
 * de poder venderse. Nada lo detectó, porque compila igual.
 *
 * Por eso acá se afirma lo que tiene que SEGUIR estando, no lo que se agregó.
 *
 * ── Y el segundo fantasma: las dos copias de la misma cuenta ────────────────
 *
 * La altura de los entrepaños estaba escrita dos veces —una en el mesh, otra
 * en `getPanelShelfSpan`— con un comentario en cada una pidiendo mantenerlas
 * iguales. Es una petición que ninguna herramienta verifica. Ahora las dos
 * preguntan a `filasDeProducto`, y eso también se afirma: es la clase de
 * unificación que se deshace sola en cuanto alguien necesita "sólo un ajuste
 * chico" de un lado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const leer = (p) => readFileSync(join(raiz, p), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const muebles = join("src", "components", "StoreEditor3D", "muebles");
const editor = leer(join("src", "components", "StoreEditor3D", "StoreEditor3D.tsx"));
const medidas = leer(join(muebles, "medidas.ts"));
const perfiles = leer(join(muebles, "perfiles.ts"));
const gondola = leer(join(muebles, "GondolaReal.tsx"));
const piezas = leer(join(muebles, "piezas.tsx"));

/* Los comentarios de estos archivos explican largo POR QUÉ cada cota es la que
   es, y citan nombres de props y de funciones al hacerlo. Se quitan antes de
   buscar, para no aprobar una prueba con la documentación en vez del código. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const editorCodigo = sinComentarios(editor);
const medidasCodigo = sinComentarios(medidas);
const gondolaCodigo = sinComentarios(gondola);
const piezasCodigo = sinComentarios(piezas);

/** El cuerpo de un mesh del editor, acotado hasta el siguiente.
 *
 *  Los DOS marcadores tienen que existir. Antes, un marcador de cierre que no
 *  aparecía hacía que el corte llegara hasta el final del archivo, y entonces
 *  la prueba medía medio editor en vez del mueble: una afirmación sobre lo que
 *  la ristra NO tiene pasaba a fallar por lo que tiene el impulsador, y una
 *  sobre lo que el exhibidor de cruz SÍ tiene pasaba porque lo tenía
 *  cualquiera. Un anclaje mal escrito no puede quedar mudo. */
function cuerpoDe(desde, hasta) {
  const i = editorCodigo.indexOf(desde);
  assert.ok(i > 0, `no se encontró \`${desde}\``);
  const j = editorCodigo.indexOf(hasta, i);
  assert.ok(j > i, `no se encontró \`${hasta}\` después de \`${desde}\`: el corte mediría el archivo entero`);
  return editorCodigo.slice(i, j);
}

/** El cuerpo de `GondolaMesh`, que es donde puede perderse el negocio. */
const cuerpoGondolaMesh = (() => {
  const i = editorCodigo.indexOf("const GondolaMesh = memo(");
  assert.ok(i > 0, "no se encontró `GondolaMesh`");
  const j = editorCodigo.indexOf("interface PuntaMeshProps", i);
  return editorCodigo.slice(i, j > i ? j : undefined);
})();

// ── Lo que el mueble no puede perder ────────────────────────────────────────

prueba("la góndola sigue recibiendo los cinco props de slot", () => {
  for (const prop of ["slots", "selectedSlotId", "hoveredSlotId", "onSlotClick", "onSlotHover"]) {
    assert.match(
      cuerpoGondolaMesh, new RegExp(`\\b${prop}\\b`),
      `\`GondolaMesh\` ya no usa \`${prop}\`: el espacio vendido dejó de poder marcarse`,
    );
  }
});

prueba("los paneles de slot se siguen dibujando en las dos caras", () => {
  assert.match(cuerpoGondolaMesh, /renderSlotFace\(-1\)/, "falta la cara -Z");
  assert.match(cuerpoGondolaMesh, /renderSlotFace\(1\)/, "falta la cara +Z");
});

prueba("el slot sigue respondiendo al clic y al paso del mouse", () => {
  assert.match(cuerpoGondolaMesh, /onClick=\{[^}]*onSlotClick/, "el slot dejó de ser clickeable");
  assert.match(cuerpoGondolaMesh, /onPointerOver=\{[^}]*onSlotHover/, "el slot dejó de resaltarse");
});

prueba("el slot sigue pintándose con el color de su estado comercial", () => {
  assert.match(
    cuerpoGondolaMesh, /STATUS_COLORS\[slot\.status\]/,
    "el panel del slot dejó de leer el estado: la ocupación no se vería",
  );
});

prueba("la geometría del slot NO se movió con el mueble", () => {
  // La posición de cada slot está guardada en los contratos de los clientes.
  // El mueble cambió de forma; el espacio vendido no puede cambiar de lugar,
  // o los contratos vigentes pasan a señalar otro pedazo de góndola.
  assert.match(medidasCodigo, /desde:\s*0\.06/, "cambió dónde arranca la franja de slots");
  assert.match(medidasCodigo, /remate:\s*0\.08/, "cambió cuánto descuenta el remate");
  assert.match(
    medidasCodigo, /altoDeZonaDeSlots[\s\S]{0,140}alto - ZONA_DE_SLOTS\.remate - ZONA_DE_SLOTS\.desde/,
    "cambió el alto útil del slot",
  );
  assert.match(cuerpoGondolaMesh, /slotAreaH\s*=\s*altoDeZonaDeSlots\(h\)/, "el mesh dejó de usar la cuenta compartida");
  assert.match(cuerpoGondolaMesh, /ZONA_DE_SLOTS\.desde \+ \(slot\.y/, "el mesh dejó de usar la base compartida");
  assert.match(cuerpoGondolaMesh, /SLOT_PROTO\s*=\s*0\.12/, "cambió cuánto sobresale el panel");
  assert.match(cuerpoGondolaMesh, /faceSign \* \(d \/ 2 \+ SLOT_PROTO\)/, "cambió el plano del panel");
});

prueba("la góndola sigue pintando el producto del proveedor", () => {
  assert.match(
    cuerpoGondolaMesh, /facePaint/,
    "`GondolaMesh` dejó de usar `facePaint`: el proveedor no vería su marca",
  );
  assert.match(
    cuerpoGondolaMesh, /<LaminaDeProducto(PorFila)?\b/,
    "no se dibuja ninguna lámina de producto",
  );
});

prueba("la góndola mural sólo se vende de un lado", () => {
  assert.match(cuerpoGondolaMesh, /\{!isWall && renderSlotFace\(1\)\}/,
    "la mural mostraría slots contra la pared");
  assert.match(cuerpoGondolaMesh, /doble=\{!isWall\}/,
    "la mural pintaría producto contra la pared");
});

// ── Que los espacios lleguen a dibujarse ────────────────────────────────────
//
// Todo lo de arriba comprueba que `GondolaMesh` SABE dibujar los paneles de
// slot. Durante mucho tiempo eso fue verdad y no servía de nada: la escena
// llamaba a `FixtureMesh` sin `onSlotClick`, que es la condición que enciende
// los paneles, con un comentario que decía «slots disabled». El panel lateral
// invitaba a hacer clic en un slot del panel frontal y ese panel no existía en
// ninguna pantalla. La ocupación por espacio no se podía marcar desde el 3D.
//
// Compilaba, y las pruebas del mesh pasaban.

const cuerpoEscena = (() => {
  const i = editorCodigo.indexOf("function Scene({");
  assert.ok(i > 0, "no se encontró `Scene`");
  return editorCodigo.slice(i, editorCodigo.indexOf("export default function StoreEditor3D", i));
})();

prueba("la escena enciende los paneles de slot de verdad", () => {
  assert.match(
    cuerpoEscena, /onSlotClick=\{conEspacios \? \(slotId\) => onSelectSlot\(fix\.id, slotId\)/,
    "la escena volvió a llamar a `FixtureMesh` sin `onSlotClick`: los paneles no se dibujan",
  );
  assert.match(cuerpoEscena, /onSlotHover=\{conEspacios \? setHoveredSlotId/, "el slot no resalta al pasar el mouse");
});

prueba("los espacios se dibujan sólo sobre el mueble seleccionado", () => {
  // Encendidos en toda la planta, un local de cincuenta muebles queda cubierto
  // de rectángulos de colores y no se ve la tienda.
  assert.match(
    cuerpoEscena, /const conEspacios = hasSlots && fix\.id === selectedId && !placingDef && !firstPerson/,
    "cambió la condición que decide sobre qué mueble se ven los espacios",
  );
});

prueba("la escena recibe y usa el estado de selección de slot", () => {
  assert.match(
    cuerpoEscena, /hoveredSlotId, setHoveredSlotId, onSelectSlot/,
    "`Scene` volvió a recibir los props de slot sin desestructurarlos",
  );
});

// ── Una sola cuenta para los entrepaños ─────────────────────────────────────

prueba("el pintado de filas NO repite la cuenta de los entrepaños", () => {
  const i = editorCodigo.indexOf('case "gondola_doble"');
  const tramo = editorCodigo.slice(i, i + 900);
  assert.match(tramo, /filasDeProducto\(/, "`getPanelShelfSpan` volvió a calcular las filas por su cuenta");
  assert.ok(
    !/Math\.max\(4,\s*Math\.round\(/.test(tramo),
    "reapareció la fórmula duplicada de la cantidad de entrepaños",
  );
});

prueba("las filas salen de los mismos niveles que dibujan los entrepaños", () => {
  assert.match(
    medidasCodigo, /export function filasDeProducto[\s\S]{0,400}nivelesDeEntrepano\(/,
    "`filasDeProducto` dejó de derivar de `nivelesDeEntrepano`",
  );
});

prueba("hay una fila menos que entrepaños", () => {
  // Sobre el último entrepaño no se puede parar nada: la fila es el HUECO.
  assert.match(medidasCodigo, /rows\s*=\s*niveles\.length - 1/, "la fila de arriba quedaría en el aire");
});

prueba("cada fila conoce el fondo de SU entrepaño", () => {
  // La góndola es escalonada. Sin esto el producto de arriba queda flotando
  // varios centímetros por delante del entrepaño que lo sostiene.
  assert.match(medidasCodigo, /fondos:\s*Array\.from/, "`filasDeProducto` ya no devuelve los fondos");
  assert.match(piezasCodigo, /profundidadDeNivel\(/, "el mueble dejó de escalonar el fondo");
});

// ── Las cotas son de catálogo, no fracciones del mueble ─────────────────────

prueba("ninguna cota se deriva del alto o del ancho del mueble", () => {
  // El delator número uno de un mueble inventado: un entrepaño cuyo espesor
  // cambia si la góndola es más alta. Una lámina mide lo que mide.
  const constantes = medidasCodigo.slice(0, medidasCodigo.indexOf("export function"));
  assert.ok(
    !/\b(alto|ancho|fondo|h|w|d)\s*[*/]/.test(constantes),
    "alguna cota de catálogo pasó a calcularse desde el tamaño del mueble",
  );
});

prueba("el paso de ranura del parante es el estándar de 25 mm", () => {
  assert.match(medidasCodigo, /pasoRanura:\s*0\.025/, "cambió el paso de ranura");
  assert.match(medidasCodigo, /export function alRasDeRanura/, "se perdió el redondeo al paso de ranura");
});

prueba("los entrepaños caen en alturas que un parante admite", () => {
  assert.match(
    medidasCodigo, /nivelesDeEntrepano[\s\S]{0,600}alRasDeRanura\(/,
    "los entrepaños volvieron a caer en alturas que ningún parante acepta",
  );
});

prueba("el primer entrepaño se apoya en el zócalo", () => {
  // Arrancar un paso más arriba deja abajo un hueco vacío que ninguna góndola
  // tiene, y es de las cosas que más delatan un modelo inventado.
  assert.match(
    medidasCodigo, /nivelesEntre\(ZOCALO\.alto, alto - 0\.1\)/,
    "volvió el hueco de abajo: el primer entrepaño ya no arranca en el zócalo",
  );
});

// ── Que sigan siendo piezas y no cajas ──────────────────────────────────────

prueba("las piezas son perfiles extruidos y no cajas", () => {
  for (const pieza of ["geometriaEntrepano", "geometriaParante", "geometriaPortaPrecios", "geometriaLama"]) {
    const i = perfiles.indexOf(`export function ${pieza}`);
    assert.ok(i > 0, `falta \`${pieza}\``);
    const cuerpo = perfiles.slice(i, i + 1400);
    assert.match(cuerpo, /new THREE\.ExtrudeGeometry/, `\`${pieza}\` volvió a ser una primitiva`);
  }
});

prueba("el entrepaño conserva el labio y el gancho", () => {
  assert.match(medidasCodigo, /labio:\s*0\.0\d/, "se perdió el labio del entrepaño");
  assert.match(medidasCodigo, /gancho:\s*0\.0\d/, "se perdió el gancho trasero");
});

prueba("el corrido se arma por módulos, con un parante en cada junta", () => {
  // Dos postes en las puntas y nada en el medio es lo que delata un corrido
  // largo: una góndola de 5 m son cuatro módulos, no un mueble de 5 m.
  assert.match(
    medidasCodigo, /Math\.round\(w \/ ANCHO_MODULO_TIPICO\)/,
    "el corrido dejó de partirse en módulos de ancho de catálogo",
  );
  assert.match(gondolaCodigo, /vanosDeCorrido\(w\)/, "la góndola dejó de armarse por vanos");
});

prueba("el fondo es de listones sobre respaldo, no una chapa lisa", () => {
  assert.match(piezasCodigo, /geometriaLama\(/, "volvió el panel liso");
  assert.match(piezasCodigo, /geometriaRespaldo\(/, "no hay respaldo detrás de los listones");
});

// ── Higiene de GPU ──────────────────────────────────────────────────────────

prueba("las geometrías cacheadas se sueltan al salir del editor", () => {
  // Viven en la GPU y se cachean por firma: sin soltarlas, entrar y salir del
  // editor de varias sedes deja una copia de cada mueble en memoria de video.
  assert.match(perfiles, /export function olvidarGeometrias/, "se perdió el liberador");
  assert.match(
    editorCodigo, /useEffect\(\(\) => olvidarGeometrias, \[\]\)/,
    "nadie llama a `olvidarGeometrias`: el caché queda vivo al desmontar",
  );
});

// ── El producto sobre los entrepaños ────────────────────────────────────────

const producto = leer(join(muebles, "producto.ts"));
const enGondola = leer(join(muebles, "ProductoEnGondola.tsx"));
const enMueble = leer(join(muebles, "ProductoEnMueble.tsx"));
const productoCodigo = sinComentarios(producto);
const enGondolaCodigo = sinComentarios(enGondola);
const enMuebleCodigo = sinComentarios(enMueble);

prueba("sólo se llena lo que está vendido", () => {
  // Rellenar la góndola entera "para que se vea linda" miente sobre lo único
  // que este sistema tiene que decir: dónde hay espacio libre.
  assert.match(enMuebleCodigo, /VENDIDO\.has\(slot\.status\)/, "el producto dejó de mirar el estado del slot");
  assert.match(
    enMuebleCodigo, /new Set\(\["occupied", "reserved"\]\)/,
    "cambió qué cuenta como vendido: un reservado también está comprometido",
  );
});

prueba("el producto se para en los mismos entrepaños que se dibujan", () => {
  assert.match(enGondolaCodigo, /filasDeProducto\(/, "el producto calcula las alturas por su cuenta");
  assert.match(enMuebleCodigo, /filas\.alturas\[i\]/, "no usa la altura exacta del entrepaño");
  assert.match(enGondolaCodigo, /vanosDeCorrido\(/, "el producto podría quedar apoyado sobre un parante");
});

prueba("el producto usa la misma franja de slots que los paneles", () => {
  assert.match(enGondolaCodigo, /altoDeZonaDeSlots\(h\)/, "el producto tiene su propia copia de la franja");
  assert.match(enMuebleCodigo, /ZONA_DE_SLOTS\.desde/, "el producto tiene su propia base de la franja");
});

prueba("el empaque va a escala real y no a fracción del mueble", () => {
  // Es lo que hace que la cuenta de frentes sirva para negociar: sobre 1,20 m
  // entran los once frentes que entran.
  const tabla = productoCodigo.slice(
    productoCodigo.indexOf("export const EMPAQUES"),
    productoCodigo.indexOf("] satisfies") + 40 || undefined,
  );
  assert.ok(
    !/[whd]\s*[*/]|ancho\s*\*|alto\s*\*/.test(tabla),
    "alguna medida de empaque pasó a derivarse del tamaño del mueble",
  );
  assert.match(productoCodigo, /export function acomodar/, "se perdió la cuenta de frentes");
});

prueba("el producto se repone al frente del entrepaño", () => {
  // Un lineal con el producto pegado al fondo y el filo vacío es exactamente
  // lo que un supervisor manda a corregir.
  assert.match(
    enMuebleCodigo, /fondoEntrepano - RETIRO_AL_FRENTE/,
    "el producto se paró desde el fondo del entrepaño y no desde su filo",
  );
});

prueba("el color del rubro es estable entre renders", () => {
  // Sin esto la tienda titila cada vez que se mueve la cámara.
  assert.match(productoCodigo, /export function colorDeRubro/, "falta el color por rubro");
  assert.ok(!/Math\.random/.test(productoCodigo), "el color del producto salió al azar");
  assert.ok(!/Math\.random/.test(enMuebleCodigo), "la ubicación del producto salió al azar");
});

prueba("el arte del proveedor le gana a la aproximación por rubro", () => {
  assert.match(
    cuerpoGondolaMesh, /\{!pinta && \(\s*<ProductoEnGondola/,
    "el producto genérico se dibujaría encima del arte que subió el proveedor",
  );
});

// ── Y estas se EJECUTAN ─────────────────────────────────────────────────────
//
// Todo lo de arriba lee el código. Alcanza para lo que se borra de un archivo,
// y no alcanza para lo que se calcula mal: el emparejado de rubros pasó por
// debajo de todas las pruebas de texto porque el código decía exactamente lo
// que tenía que decir — y «Aceites» caía igual en la fila de los cereales,
// porque «te» está adentro de «acei-te-s». El error se veía en pantalla como
// un problema de tamaños.
//
// `producto.ts` son funciones puras sin DOM ni Three, así que se pueden correr.

const { build } = await import("esbuild");
const compilado = await build({
  entryPoints: [join(raiz, muebles, "producto.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
const P = await import(
  "data:text/javascript;base64," +
  Buffer.from(compilado.outputFiles[0].text).toString("base64")
);

const compiladoM = await build({
  entryPoints: [join(raiz, muebles, "medidas.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
const M = await import(
  "data:text/javascript;base64," +
  Buffer.from(compiladoM.outputFiles[0].text).toString("base64")
);

prueba("ninguna altura de mueble pierde su entrepaño de arriba", () => {
  // El último entrepaño cae JUSTO en el límite, y con `y <= hasta` a secas la
  // comparación la decide el último bit del flotante: una góndola de 1,80
  // perdía su entrepaño más alto —y con él una fila entera de producto— y una
  // de 1,85 lo conservaba. No es cosmético: cambia `rows`, y `rows` es lo que
  // alinea las filas del arte que sube el proveedor.
  for (let h = 1.0; h <= 2.4001; h += 0.05) {
    const niveles = M.nivelesDeEntrepano(h);
    const aire = h - niveles[niveles.length - 1];
    assert.ok(
      aire < 0.2,
      `con alto ${h.toFixed(2)} quedan ${aire.toFixed(3)} m de aire arriba: se perdió un entrepaño`,
    );
  }
});

prueba("los entrepaños caen en alturas que el parante admite, de verdad", () => {
  for (let h = 1.0; h <= 2.4001; h += 0.05) {
    for (const y of M.nivelesDeEntrepano(h)) {
      const pasos = y / 0.025;
      assert.ok(
        Math.abs(pasos - Math.round(pasos)) < 1e-6,
        `con alto ${h.toFixed(2)} hay un entrepaño a ${y} m, que no es múltiplo del paso de ranura`,
      );
    }
  }
});

prueba("cada fila tiene un entrepaño arriba donde terminar", () => {
  // `rows` es uno menos que los niveles. Si alguna vez son iguales, la última
  // fila lee `alturas[rows]` y se va afuera del arreglo.
  for (let h = 1.0; h <= 2.4001; h += 0.05) {
    const f = M.filasDeProducto(h, 0.5);
    assert.equal(f.alturas.length, f.rows + 1, `con alto ${h.toFixed(2)} no cierra la última fila`);
    assert.ok(Number.isFinite(f.alturas[f.rows]), "la última fila no tiene techo");
  }
});

prueba("«Aceites» no cae en la fila de los cereales", () => {
  // El rubro se compara contra el COMIENZO de cada palabra. Si alguien vuelve
  // a `texto.includes(prefijo)`, esta prueba cae y sólo ésta.
  assert.equal(P.empaqueDeRubro("Aceites").forma, "botella",
    "«Aceites» emparejó con «te»: el lineal de aceites sale de cajas de cereal");
  assert.equal(P.empaqueDeRubro("Aceite de girasol").ancho, 0.1);
});

prueba("los rubros conocidos caen donde tienen que caer", () => {
  const esperado = [
    ["Gaseosas", "botella"], ["Galletas", "caja"], ["Snacks", "bolsa"],
    ["Atún", "lata"], ["Cerveza", "lata"], ["Leche", "caja"],
    ["Té verde", "caja"], ["Detergente", "botella"],
  ];
  for (const [rubro, forma] of esperado) {
    assert.equal(P.empaqueDeRubro(rubro).forma, forma, `«${rubro}» emparejó mal`);
  }
});

prueba("un rubro vacío o desconocido no rompe", () => {
  for (const r of ["", "   ", null, undefined, "Zzz 123", "!!!"]) {
    const e = P.empaqueDeRubro(r);
    assert.ok(e.ancho > 0 && e.alto > 0, `«${r}» devolvió un empaque inválido`);
  }
});

prueba("el mismo rubro da siempre el mismo color", () => {
  assert.equal(P.colorDeRubro("Gaseosas"), P.colorDeRubro("Gaseosas"));
  assert.equal(P.colorDeRubro("Gaseosas"), P.colorDeRubro("gaseosas"),
    "la mayúscula cambia el color: el mismo rubro titilaría entre muebles");
  assert.notEqual(P.colorDeRubro("Gaseosas"), P.colorDeRubro("Galletas"));
});

prueba("el color se mantiene lejos del verde y del rojo", () => {
  // Verde y rojo son los colores del estado comercial. Si el producto los usa,
  // «disponible» y «ocupado» dejan de significar algo con el mueble lleno.
  for (const r of ["Gaseosas", "Galletas", "Snacks", "Atún", "Aceites", "Leche", "Pastas", "Cafe"]) {
    const tono = Number(/hsl\((\d+)/.exec(P.colorDeRubro(r))[1]);
    assert.ok(
      (tono >= 190 && tono <= 330) || (tono >= 30 && tono <= 60),
      `«${r}» salió en tono ${tono}, que pisa el verde o el rojo del estado`,
    );
  }
});

prueba("el color sale en la sintaxis que THREE.Color entiende", () => {
  // `THREE.Color` NO parsea `hsl(190 40% 50%)` —la sintaxis CSS moderna— y no
  // falla: se queda en blanco. Todo el lineal sale del color del papel.
  assert.match(P.colorDeRubro("Gaseosas"), /^hsl\(\d+, \d+%, \d+%\)$/);
});

prueba("la cuenta de frentes es la que entra de verdad", () => {
  // Sobre 1,20 m de entrepaño con cajas de 11 cm entran once, no diez ni doce.
  const caja = P.empaqueDeRubro("Galletas");        // 0.11 de frente
  const a = P.acomodar(1.20, 0.45, 0.30, caja);
  assert.equal(a.frentes, Math.floor((1.20 + 0.004) / (caja.ancho + 0.004)));
  assert.ok(a.ocupado <= 1.20, "el producto se sale del entrepaño");
});

prueba("lo que no entra parado NO se dibuja aplastado", () => {
  const alto = P.EMPAQUES.cajaAlta;                 // 0.28 de alto
  assert.equal(P.acomodar(1.2, 0.45, 0.20, alto).frentes, 0,
    "se paró un envase de 28 cm bajo un entrepaño a 20 cm");
});

prueba("el formato grande cae al chico antes de dejar el entrepaño vacío", () => {
  // La botella de 1,5 L va abajo y arriba va la personal, como en tienda.
  assert.equal(P.empaqueQueEntra("Gaseosas", 0.40).alto, 0.31);
  assert.equal(P.empaqueQueEntra("Gaseosas", 0.30).alto, 0.23);
  assert.equal(P.empaqueQueEntra("Gaseosas", 0.15).alto, 0.122);
  assert.equal(P.empaqueQueEntra("Gaseosas", 0.05), null,
    "se paró algo bajo un entrepaño de 5 cm");
});

// ── La punta de góndola ─────────────────────────────────────────────────────
//
// Es el espacio más caro de un supermercado. Vale lo mismo acá que en la
// góndola: la forma puede cambiar entera, lo que se vende no.

const punta = leer(join(muebles, "PuntaReal.tsx"));
const enPunta = leer(join(muebles, "ProductoEnPunta.tsx"));
const puntaCodigo = sinComentarios(punta);
const enPuntaCodigo = sinComentarios(enPunta);
const cuerpoPuntaMesh = cuerpoDe("function PuntaMesh(", "function RobatopeMesh(");

prueba("la punta sigue recibiendo los cinco props de slot", () => {
  for (const prop of ["slots", "selectedSlotId", "hoveredSlotId", "onSlotClick", "onSlotHover"]) {
    assert.match(
      cuerpoPuntaMesh, new RegExp(`\\b${prop}\\b`),
      `\`PuntaMesh\` ya no usa \`${prop}\``,
    );
  }
  assert.match(cuerpoPuntaMesh, /STATUS_COLORS\[slot\.status\]/, "el slot dejó de leer su estado");
  assert.match(cuerpoPuntaMesh, /onClick=\{[^}]*onSlotClick/, "el slot dejó de ser clickeable");
});

prueba("la geometría del slot de la punta NO se movió", () => {
  // Su franja se mide sobre el CUERPO y descuenta sólo el remate: no es la
  // misma cuenta que la góndola, y así tiene que seguir siendo.
  assert.match(
    medidasCodigo, /altoDeZonaDeSlotsDePunta[\s\S]{0,160}altoDeCuerpo - ZONA_DE_SLOTS\.remate/,
    "cambió el alto de la franja de slots de la punta",
  );
  assert.match(cuerpoPuntaMesh, /altoDeZonaDeSlotsDePunta\(altoDeCuerpo\)/, "el mesh dejó de usarla");
  assert.match(cuerpoPuntaMesh, /panelZ = -\(d \/ 2 \+ 0\.10\)/, "cambió el plano del panel de slot");
});

prueba("la punta sigue pintando el arte del proveedor", () => {
  assert.match(cuerpoPuntaMesh, /<LaminaDeProductoPorFila/, "no se dibuja el arte");
  assert.match(cuerpoPuntaMesh, /<ProductoEnPunta/, "no se dibuja producto");
  assert.match(
    cuerpoPuntaMesh, /\{!pinta && \(\s*<ProductoEnPunta/,
    "el producto genérico se dibujaría encima del arte que subió el proveedor",
  );
});

prueba("la punta monta atrás y crece hacia el frente", () => {
  // Con el montaje de la góndola —adelante, creciendo hacia afuera— el arte y
  // el producto de la punta aparecen DETRÁS del mueble.
  assert.match(cuerpoPuntaMesh, /montajeA=\{d \/ 2\} haciaA=\{-1\}/, "el arte de la punta se montó al revés");
  assert.match(enPuntaCodigo, /montaje: d \/ 2, hacia: -1/, "el producto de la punta se montó al revés");
  assert.match(puntaCodigo, /position=\{\[0, 0, d \/ 2\]\}/, "el cuerpo de la punta se colgó al revés");
});

prueba("la punta se vende por UNA sola cara", () => {
  // La de atrás da contra el corrido.
  assert.ok(!/doble/.test(cuerpoPuntaMesh), "la punta pintaría su cara trasera");
  assert.match(enPuntaCodigo, /\[\{ montaje: d \/ 2, hacia: -1 \}\]/, "la punta tiene más de una cara de producto");
});

prueba("el pintado de filas de la punta NO repite la cuenta", () => {
  // Desde `getPanelShelfSpan` y no desde el primer `case "punta"` que aparezca:
  // el switch de `FixtureMesh` tiene uno antes y no es el que se mide.
  const span = editorCodigo.slice(editorCodigo.indexOf("function getPanelShelfSpan"));
  const tramo = span.slice(span.indexOf('case "punta"'), span.indexOf('case "robatope"'));
  assert.match(tramo, /filasDePunta\(/, "`getPanelShelfSpan` volvió a calcular las filas por su cuenta");
  assert.ok(!/Math\.max\(3,\s*Math\.round\(/.test(tramo), "reapareció la fórmula duplicada");
});

prueba("la punta tiene tantas filas como entrepaños", () => {
  // El techo de la fila de arriba es el copete, no otro entrepaño: sobre el
  // entrepaño más alto de una punta también se vende.
  for (let h = 1.2; h <= 2.2001; h += 0.05) {
    const cuerpo = Math.max(0.4, h - 0.36);
    const f = M.filasDePunta(cuerpo, 0.4);
    assert.equal(f.rows, M.nivelesDePunta(cuerpo).length || 1,
      `con alto ${h.toFixed(2)} la punta perdió una fila`);
    assert.equal(f.alturas.length, f.rows + 1, "no cierra la última fila");
  }
});

prueba("la punta reusa el herraje del corrido, no una copia", () => {
  // Una punta se arma del mismo catálogo que la góndola. Si alguien vuelve a
  // definirle sus propios entrepaños, vuelven las dos copias.
  assert.match(puntaCodigo, /from "\.\/piezas"/, "la punta dejó de usar las piezas compartidas");
  assert.ok(
    !/geometriaEntrepano|geometriaParante/.test(puntaCodigo),
    "la punta se dibujó sus propios entrepaños en vez de usar `CaraDeEstanteria`",
  );
});

prueba("el copete no se tiñe con el estado comercial", () => {
  // Es el lugar de la marca del proveedor. Pintarlo de verde o rojo lo
  // convierte en un semáforo donde va un logo.
  const tramo = puntaCodigo.slice(puntaCodigo.indexOf("El copete"));
  assert.ok(!/statusColor/.test(tramo), "el copete quedó teñido con el estado del mueble");
});

// ── Los muebles de frío ─────────────────────────────────────────────────────

const nevera = leer(join(muebles, "NeveraReal.tsx"));
const neveraCodigo = sinComentarios(nevera);
const cuerpoNeveraMesh = cuerpoDe("function NeveraRefrescosMesh(", "function StandFrutasMesh(");

prueba("el multideck tiene su cortina de aire", () => {
  // Es lo que hace que el ojo lo lea como mueble de frío abierto: la boca de
  // impulsión bajo el copete y la reja de retorno abajo. Cumplen el mismo
  // papel que la puerta en una nevera cerrada — sin ellas es una estantería
  // pintada de oscuro, que es como se veía.
  assert.match(neveraCodigo, /!conPuertas && \(/, "se perdió la variante de frente abierto");
  assert.match(neveraCodigo, /variante === "puertas"/, "se perdieron las dos variantes de mueble frío");
});

prueba("la nevera de refrescos es de frente ABIERTO", () => {
  // Su ficha del catálogo dice «vitrina multideck abierta para bebidas».
  assert.match(cuerpoNeveraMesh, /variante="multideck"/, "la nevera de refrescos se cerró con puertas");
});

prueba("el relleno mudo se apaga cuando entra el arte del proveedor", () => {
  // Lo que se ve en el mueble tiene que ser SU producto, no uno inventado.
  assert.match(cuerpoNeveraMesh, /conRelleno=\{!pinta\}/, "el relleno taparía el arte del proveedor");
});

prueba("el pintado de la nevera NO repite la cuenta de entrepaños", () => {
  const span = editorCodigo.slice(editorCodigo.indexOf("function getPanelShelfSpan"));
  const tramo = span.slice(span.indexOf('case "nevera_refrescos"'), span.indexOf('case "isla_fria"') + 1 || undefined).slice(0, 900);
  assert.match(tramo, /filasDeNevera\(/, "volvió a calcular las filas por su cuenta");
  assert.ok(!/h \* 0\.14/.test(tramo), "reapareció la cota derivada del alto del mueble");
});

prueba("las cotas del frío son de fabricación, no fracciones del alto", () => {
  // El compresor mide lo que mide: una nevera de 2 m no lo tiene más alto que
  // una de 1,8. Era `h * 0.14`.
  const tabla = medidasCodigo.slice(
    medidasCodigo.indexOf("export const NEVERA"),
    medidasCodigo.indexOf("export function altoUtilDeNevera"),
  );
  assert.ok(!/[whd]\s*[*/]|alto\s*\*/.test(tabla), "alguna cota del frío se derivó del tamaño del mueble");
  assert.match(medidasCodigo, /zocalo: 0\.17/, "cambió el alto del compresor");
});

prueba("un frente ancho se parte en varias puertas", () => {
  // Una hoja de más de 75 cm no la fabrica nadie: no la aguanta la bisagra.
  assert.equal(M.puertasDeNevera(0.6), 1);
  assert.equal(M.puertasDeNevera(1.2), 2);
  assert.equal(M.puertasDeNevera(2.4), 4);
  assert.ok(M.puertasDeNevera(1.2) >= 1 && M.puertasDeNevera(0.01) >= 1, "una puerta como mínimo");
});

prueba("la nevera no pierde entrepaños por redondeo", () => {
  for (let h = 1.2; h <= 2.2001; h += 0.05) {
    const f = M.filasDeNevera(h, 0.5);
    assert.ok(f.rows >= 1, `con alto ${h.toFixed(2)} la nevera quedó sin filas`);
    assert.equal(f.alturas.length, f.rows + 1, "no cierra la última fila");
    const aire = (M.NEVERA.zocalo + M.altoUtilDeNevera(h)) - f.alturas[f.rows - 1];
    assert.ok(aire > 0.05 && aire < 0.45, `con alto ${h.toFixed(2)} la fila de arriba mide ${aire.toFixed(3)} m`);
  }
});

// ── El producto volcado ─────────────────────────────────────────────────────
//
// Media docena de muebles tenían la forma bien —el cajón con sus listones, la
// isla con su guarda de acrílico, el mostrador con su vidrio curvo— y se leían
// como maquetas, porque estaban VACÍOS. Un mostrador de carnes sin carne es un
// mueble; con carne es una carnicería.

const granel = leer(join(muebles, "ProductoAGranel.tsx"));
const batea = leer(join(muebles, "BateaReal.tsx"));
const granelCodigo = sinComentarios(granel);
const bateaCodigo = sinComentarios(batea);

prueba("sin arte del proveedor, los muebles de volcado se llenan solos", () => {
  const volcado = cuerpoDe("function VolcadoDeProducto(", "interface ShelfSlot");
  assert.match(volcado, /<ProductoAGranel/, "sin arte, el mueble vuelve a quedar vacío");
  assert.match(volcado, /if \(!material\)/, "el genérico taparía el arte del proveedor");
});

prueba("lo volcado está ACOSTADO, no parado", () => {
  // Nadie tira cajas a un canasto y quedan paradas. Con el envase de pie, una
  // sola capa llena el cajón y desde arriba se ve una tapa lisa — se veía
  // exactamente como una tela estirada.
  assert.match(productoCodigo, /export function empaqueVolcado/, "se perdió el empaque volcado");
  const e = P.empaqueVolcado("Galletas");
  assert.ok(e.alto < e.ancho && e.alto < e.fondo, "el envase volcado quedó parado");
});

prueba("lo que se vende suelto no se dibuja en caja", () => {
  // Un cajón de frutas lleno de cajas de galletas es lo que salía antes.
  const fruta = P.empaqueVolcado("Frutas y verduras");
  assert.ok(fruta.ancho < 0.1 && fruta.alto < 0.1, "la fruta salió del tamaño de una caja de cereal");
  const carne = P.empaqueVolcado("Carnes");
  assert.ok(carne.alto < 0.06 && carne.ancho > 0.1, "la carne no salió en bandeja");
});

prueba("el color de lo suelto es de producto y no de interfaz", () => {
  // `colorDeRubro` esquiva el verde y el rojo porque son los del estado
  // comercial. Para un envase impreso da igual; para fruta, no: salía magenta.
  for (const r of ["Frutas", "Verduras", "Tomates", "Papas"]) {
    const tono = Number(/hsl\((\d+)/.exec(P.colorVolcado(r))[1]);
    assert.ok(tono >= 20 && tono <= 55, `«${r}» salió en tono ${tono}: la fruta no es magenta`);
  }
  const carne = Number(/hsl\((\d+)/.exec(P.colorVolcado("Carnes"))[1]);
  assert.ok(carne >= 5 && carne <= 20, "la carne no salió en ladrillo apagado");
});

prueba("el desorden del volcado es determinista", () => {
  // Al azar, la fruta se reacomoda sola cada vez que se mueve la cámara.
  assert.ok(!/Math\.random/.test(granelCodigo), "el volcado salió al azar: el plano titilaría");
  assert.match(granelCodigo, /function azarDe\(semilla: string\)/, "se perdió el generador sembrado");
  assert.match(granelCodigo, /semilla/, "el volcado dejó de sembrarse");
});

prueba("cada mueble siembra su propio desorden", () => {
  // Sin esto, dos bateas contiguas salen clonadas.
  for (const marca of ["batea", "stand", "carnes", "isla_fria", "isla"]) {
    assert.match(
      editorCodigo, new RegExp("semilla=\\{`\\$\\{id\\}\\|" + marca),
      `el volcado de \`${marca}\` no se siembra con el id del mueble`,
    );
  }
  // Y dentro de un mismo mueble, cada bandeja lleva la suya: con una sola
  // semilla, las dos bandejas del stand salen clonadas una de la otra y el
  // escalonado se ve como un espejo.
  assert.match(
    editorCodigo, /semilla=\{`\$\{id\}\|stand\$\{i\}`\}/,
    "las dos bandejas del stand comparten semilla y salen clonadas",
  );
});

prueba("el montículo no se come el relleno cuando entran pocas piezas", () => {
  // Multiplicando, una grilla de 2×2 deja todas las celdas en el borde, el
  // factor cae a 0,45 y el canasto entero termina con UNA capa en el fondo.
  // Pasó: la batea se veía vacía.
  // Se afirma la SUMA, no la línea exacta: el montículo ya no se aplica a lo
  // que no se apila, y eso le cambió la forma sin cambiarle la cuenta.
  assert.match(granelCodigo, /const aqui = capas \+ \(/, "volvió el montículo multiplicativo");
  assert.ok(!/const aqui = [^\n]*capas \*/.test(granelCodigo), "el montículo vuelve a multiplicar las capas");
});

prueba("la batea es un canasto y no un carro de reposición", () => {
  // Una jaula de tubos con repisas planas es lo que usa quien repone, no lo
  // que ve el cliente.
  assert.match(bateaCodigo, /geometriaCanasto\(/, "la batea dejó de tener paredes inclinadas");
  assert.match(bateaCodigo, /ESTRECHAMIENTO/, "se perdió la inclinación de las paredes");
  assert.ok(!/repisa|estante/i.test(bateaCodigo), "le volvieron a poner repisas a la batea");
});

prueba("el casco del canasto respeta las cotas del plano", () => {
  // Deformar un cilindro de cuatro lados es el atajo, y mide el radio a los
  // VÉRTICES: las caras planas quedan metidas un 29 % y el mueble sale más
  // chico que lo que pidió el plano.
  assert.ok(
    !/CylinderGeometry/.test(perfiles.slice(perfiles.indexOf("export function geometriaCanasto"), perfiles.indexOf("export function geometriaCanasto") + 2000)),
    "el canasto volvió a salir de un cilindro deformado",
  );
});

// ── Los exhibidores que se venden enteros ───────────────────────────────────

const repisas = leer(join(muebles, "ProductoEnRepisas.tsx"));
const repisasCodigo = sinComentarios(repisas);
const enMuebleCod2 = sinComentarios(leer(join(muebles, "ProductoEnMueble.tsx")));

prueba("un mueble contratado entero se llena entero", () => {
  // La góndola se vende por espacios y el hueco vacío ES el dato. Un
  // exhibidor de cruz o un impulsador se contratan completos: la marca compra
  // el mueble, no un estante, así que un mueble contratado y dibujado vacío no
  // informa nada.
  assert.match(enMuebleCod2, /vendidoEntero/, "se perdió el modo de mueble entero");
  assert.match(
    enMuebleCod2, /if \(!vendidoEntero && \(apoyo </,
    "la franja de slots vuelve a recortar las repisas de un mueble sin slots",
  );
});

prueba("sin contrato, el exhibidor se ve vacío", () => {
  // Que es la verdad: lo contrario pintaría ocupado lo que está libre.
  assert.match(repisasCodigo, /if \(!rubro \|\| filas\.rows === 0\) return null/,
    "un mueble libre se dibujaría lleno");
});

prueba("el producto de las repisas NO recalcula nada", () => {
  // Si esta traducción se volviera un cálculo, ya serían dos formas distintas
  // de acomodar producto en el sistema.
  assert.match(repisasCodigo, /<ProductoEnMueble/, "el producto de repisas se fue por su lado");
  assert.ok(!/acomodar\(|empaqueQueEntra\(/.test(repisasCodigo),
    "`ProductoEnRepisas` volvió a calcular los frentes por su cuenta");
});

prueba("los exhibidores reciben el rubro del contrato", () => {
  for (const comp of ["CrossMesh", "ImpulsadorMesh", "RobatopeMesh", "RistraMesh"]) {
    assert.match(
      editorCodigo, new RegExp("<" + comp + "[^/]*rubro=\\{fixture\\.brandCategory\\}"),
      `\`${comp}\` no recibe el rubro: su producto saldría siempre del mismo color`,
    );
  }
});

prueba("el producto va DENTRO del grupo de la repisa que se inclina", () => {
  // Colgado afuera queda a la altura del eje y la repisa se le va varios
  // centímetros por delante.
  const cruz = cuerpoDe("function CrossMesh(", "function MetroMesh(");
  assert.match(cruz, /rotation=\{\[-0\.09, 0, 0\]\}[\s\S]*<ProductoEnRepisas/,
    "el producto del exhibidor de cruz salió del grupo inclinado");
  // Sin atar el regex a la condición ENTERA: al arte del proveedor se le sumó
  // un `!pinta &&` delante, y eso no afloja lo que esta guarda afirma.
  assert.match(cruz, /i < nLevels - 1 && \(/,
    "la repisa de más arriba es la tapa: lo que se pare encima sobresale del mueble");
});

prueba("un mueble entero se llena también en profundidad", () => {
  // Con dos filas, un exhibidor de 80 cm de fondo muestra siete centímetros de
  // producto y setenta de estante vacío.
  assert.match(enMuebleCod2, /PROFUNDIDAD_DE_MUEBLE_ENTERO/, "el mueble entero volvió a llenarse como una góndola");
});

prueba("la ristra cuelga producto de sus ganchos", () => {
  // Una ristra es una TIRA: unidades colgando una debajo de otra. Con los
  // ganchos pelados no se parece ni a una ristra ni a un estante.
  const ristra = cuerpoDe("function RistraMesh(", "function CrossMesh(");
  assert.match(ristra, /!ghost && rubro &&/, "la ristra dejó de colgar producto");
  assert.match(ristra, /colorDeRubro\(rubro\)/, "el sobre colgado no toma el color del rubro");
});

// ── La silueta del envase ───────────────────────────────────────────────────
//
// Todo el producto se dibujaba como una caja escalada. Con eso, un lineal de
// gaseosas es una pared de ladrillos y una nevera de bebidas se ve como un
// archivador. La silueta es lo PRIMERO que el ojo clasifica —antes que el
// color y mucho antes que la etiqueta—, y `Empaque.forma` traía el dato desde
// que se armó el catálogo: existía y no se usaba.

const mostrador = leer(join(muebles, "MostradorFrioReal.tsx"));
const mural = leer(join(muebles, "ProductoEnMural.tsx"));
const mostradorCodigo = sinComentarios(mostrador);
const muralCodigo = sinComentarios(mural);

prueba("cada envase se dibuja con SU forma, no con una caja", () => {
  assert.match(perfiles, /export function geometriaDeEmpaque/, "se perdió la geometría por forma");
  for (const [llamador, archivo] of [
    ["ProductoEnMueble", enMuebleCod2],
    ["ProductoAGranel", granelCodigo],
    ["NeveraReal", neveraCodigo],
  ]) {
    assert.match(archivo, /geometriaDeEmpaque\(/, `\`${llamador}\` volvió a dibujar cajas`);
    assert.ok(
      !/new THREE\.BoxGeometry\(\s*(pieza|empaque|EMPAQUES)/.test(archivo),
      `\`${llamador}\` volvió a dibujar el producto como caja`,
    );
  }
});

prueba("la botella tiene cuello y la lata es cilíndrica", () => {
  const g = perfiles.slice(perfiles.indexOf("export function geometriaDeEmpaque"));
  assert.match(g, /forma === "botella"[\s\S]{0,1400}LatheGeometry/, "la botella dejó de ser de revolución");
  assert.match(g, /forma === "lata"[\s\S]{0,900}LatheGeometry/, "la lata dejó de ser cilíndrica");
  assert.match(g, /forma === "pieza"[\s\S]{0,500}Icosahedron/, "la fruta dejó de ser una pieza redonda");
});

prueba("una botella acostada se GIRA, no se achata", () => {
  // Dibujada de pie con 9 cm de alto sale un disco.
  assert.match(productoCodigo, /acostado: true/, "`acostar` dejó de marcar el volcado");
  const g = perfiles.slice(perfiles.indexOf("export function geometriaDeEmpaque"));
  assert.match(g, /acostado && \(forma === "botella" \|\| forma === "lata"\)/,
    "el envase acostado vuelve a dibujarse aplastado");
});

prueba("el volcado del rubro trae su forma", () => {
  assert.equal(P.empaqueVolcado("Frutas").forma, "pieza");
  assert.equal(P.empaqueVolcado("Carnes").forma, "bandeja");
  assert.equal(P.empaqueVolcado("Gaseosas").acostado, true, "la gaseosa volcada no quedó acostada");
});

prueba("la geometría cacheada no se muta al reusarla", () => {
  // `geometriaCanasto` la comparten varios muebles. Un `translate` sobre la
  // copia del caché se lo lleva puesto a todos.
  assert.match(perfiles, /function cascoDeTronco/, "se perdió la versión sin cachear del casco");
  const bolsa = perfiles.slice(perfiles.indexOf('forma === "bolsa"'), perfiles.indexOf('forma === "bolsa"') + 400);
  assert.ok(!/geometriaCanasto\(/.test(bolsa), "la bolsa vuelve a mutar la geometría compartida");
});

// ── El mostrador de servicio y el mural de vegetales ────────────────────────

prueba("el mostrador de carnes tiene vidrio CURVO", () => {
  // Una placa plana y vertical lo convierte en una vitrina cualquiera.
  assert.match(perfiles, /export function geometriaVidrioCurvo/, "se perdió el vidrio curvo");
  assert.match(mostradorCodigo, /geometriaVidrioCurvo\(/, "el mostrador volvió al vidrio plano");
});

prueba("el mostrador tiene la bandeja inclinada y su lado de servicio", () => {
  // Sin la caída, lo de atrás queda tapado por lo de adelante; sin el mueble
  // de servicio de atrás el mostrador es simétrico y no se entiende de qué
  // lado se atiende.
  assert.match(mostradorCodigo, /rotation=\{\[CAIDA, 0, 0\]\}/, "la bandeja volvió a ser plana");
  assert.match(mostradorCodigo, /export function bandejaDeMostrador/, "nadie sabe dónde va el producto");
  assert.match(mostradorCodigo, /fondoDeServicio/, "se perdió el mueble de servicio de atrás");
});

// ── Los tres rasgos que la foto de uno real manda ───────────────────────────
// El mostrador ya tenía el vidrio curvo y seguía sin parecerse. Puesto al lado
// de la foto se ve por qué, y las tres diferencias son de FORMA: apoyaba en el
// piso en vez de colgar sobre patas, era casi negro en vez de acero claro, y
// el vidrio colgaba POR DELANTE del mueble como una visera en vez de nacer en
// el filo y tumbarse hacia atrás sobre el producto.

prueba("el mostrador NO apoya en el piso: cuelga sobre patas", () => {
  assert.match(medidas, /export function cotasDeMostrador/, "las cotas del mostrador volvieron al componente");
  assert.match(mostradorCodigo, /cotasDeMostrador\(/, "el mostrador dejó de leer sus cotas");
  assert.match(mostradorCodigo, /xDePatas\.map/, "el mostrador volvió a ser un cajón hasta el piso");

  for (const [w, d, h] of [[1.2, 0.9, 1.15], [2.5, 1.1, 1.3], [0.8, 0.7, 1.0], [4, 1.2, 1.5]]) {
    const c = M.cotasDeMostrador(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.ok(c.altoDePata >= 0.12, `${donde}: sin hueco bajo el mueble`);
    assert.ok(c.filo > c.altoDePata + 0.15, `${donde}: la carrocería no tiene alto`);
    assert.ok(c.filo < h, `${donde}: el filo se comió la bóveda`);
    assert.ok(c.xDePatas.length >= 2, `${donde}: el mueble se cae`);
    for (const x of c.xDePatas) assert.ok(Math.abs(x) <= w / 2, `${donde}: pata fuera del mueble`);
  }
});

prueba("la bóveda nace EN el filo y se tumba hacia ATRÁS", () => {
  // Montada en `zFrente - VUELO` la curva entera quedaba por delante del
  // mueble: una visera colgando en el aire, con el producto afuera de ella.
  assert.match(
    mostradorCodigo, /position=\{\[0, c\.filo, c\.zFrente\]\}/,
    "la bóveda volvió a colgar por delante del filo",
  );
  assert.match(mostradorCodigo, /geometriaTapaDeVidrio\(/, "la bóveda quedó abierta de costado");

  for (const [w, d, h] of [[1.2, 0.9, 1.15], [2.5, 1.1, 1.3], [4, 1.2, 1.5]]) {
    const c = M.cotasDeMostrador(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.ok(c.zRemate > c.zFrente, `${donde}: la bóveda no se tumba hacia atrás`);
    assert.ok(c.zRemate <= d / 2 + 1e-9, `${donde}: la bóveda se sale por el fondo`);
    assert.ok(c.vuelo > d * 0.5, `${donde}: la bóveda no llega a tapar el producto`);
    assert.ok(c.altoDeVidrio > (h - c.altoDePata) * 0.4, `${donde}: el vidrio dejó de ser la pieza dominante`);
  }
});

prueba("la carrocería es acero CLARO, no un cajón negro", () => {
  // El contraste entre la chapa clara y los pocos negros —marco del vidrio,
  // reja, trasero— es la mitad de lo que el ojo reconoce. Pintado todo de
  // casi-negro no queda contraste ninguno y el mueble se lee como un
  // contenedor.
  const cuerpo = /acero: new THREE\.MeshStandardMaterial\(\{\s*color: "(#[0-9a-fA-F]{6})"/.exec(mostradorCodigo);
  assert.ok(cuerpo, "se perdió el material de la carrocería");
  const claro = parseInt(cuerpo[1].slice(1, 3), 16);
  assert.ok(claro > 0x90, `la carrocería volvió a ser oscura (${cuerpo[1]})`);
});

prueba("el producto y el mueble leen la MISMA cuenta", () => {
  // Con dos cuentas la carne flota sobre la cubeta o se hunde adentro de la
  // carrocería, y nadie lo nota hasta que se ve el plano.
  const cuerpo = mostradorCodigo.slice(mostradorCodigo.indexOf("export function bandejaDeMostrador"));
  assert.match(cuerpo, /cotasDeMostrador\(w, d, h\)/, "`bandejaDeMostrador` volvió a tener su propia cuenta");

  for (const [w, d, h] of [[1.2, 0.9, 1.15], [2.5, 1.1, 1.3], [4, 1.2, 1.5]]) {
    const c = M.cotasDeMostrador(w, d, h);
    const fondo = Math.max(0.12, c.vuelo - 0.1);
    const z = c.zFrente + 0.05 + fondo / 2;
    const donde = `${w}×${d}×${h}`;
    assert.ok(z - fondo / 2 >= c.zFrente - 1e-9, `${donde}: la cubeta se sale por el frente`);
    assert.ok(z + fondo / 2 <= d / 2 + 1e-9, `${donde}: la cubeta atraviesa el fondo`);
  }
});

prueba("el espesor entra en la firma del vidrio curvo", () => {
  // Los montantes negros de la bóveda son ESE mismo arco, angosto y grueso.
  // Sin el espesor en la clave, el primero que se dibuja se queda con la
  // ranura del caché y el otro sale con el espesor ajeno.
  const firma = /const firma =?\s*\n?\s*`vidriocurvo:[^`]*`/.exec(perfiles);
  assert.ok(firma, "se perdió la firma del vidrio curvo");
  assert.match(firma[0], /espesor/, "el espesor volvió a quedar fuera de la clave del caché");
});

// ── Lo que la foto de un mueble de verdad corrigió ──────────────────────────
// El mostrador de carnes sólo se arregló cuando hubo una foto delante. Estas
// pruebas fijan lo que salió de mirar las fichas de fábrica del resto: la caja
// registradora, la ristra y la batea.

const checkout = leer(join(muebles, "CheckoutReal.tsx"));
const checkoutCodigo = sinComentarios(checkout);

prueba("la pantalla de la caja se apoya en el poste, no flota", () => {
  // El defecto real: el poste medía `posH * 0.75` y la pantalla se colocaba a
  // `posH`. Veinticinco centímetros de aire entre las dos, y compilaba.
  assert.match(medidas, /export function cotasDeCheckout/, "las cotas de la caja volvieron al componente");
  assert.match(checkoutCodigo, /c\.yPantalla/, "la pantalla volvió a calcular su propia altura");

  for (const [w, d, h] of [[1.8, 0.7, 0.9], [1.2, 0.6, 0.85], [3, 0.8, 1.0]]) {
    const c = M.cotasDeCheckout(w, d, h);
    const donde = `${w}×${d}×${h}`;
    const pieDePantalla = c.yPantalla - M.CHECKOUT.pantalla.alto / 2;
    assert.ok(pieDePantalla <= c.yPoste + 1e-9, `${donde}: la pantalla flota sobre el poste`);
    assert.ok(pieDePantalla > c.yConsola, `${donde}: la pantalla se hundió en la consola`);
    assert.ok(c.yConsola > c.mesa, `${donde}: la consola no se apoya en la mesa`);
    assert.ok(c.cama < c.mesa, `${donde}: la cama dejó de estar hundida`);
  }
});

prueba("la caja tiene los estantes de impulso, que son espacio vendible", () => {
  // Chicles, pilas y revistas: el espacio más caro de la línea de cajas. Un
  // plano que se le muestra a un proveedor no puede no tenerlos.
  assert.match(checkoutCodigo, /yDeImpulso\.map/, "la caja se quedó sin estantes de impulso");
  for (const [w, d, h] of [[1.8, 0.7, 0.9], [1.2, 0.6, 0.85]]) {
    const c = M.cotasDeCheckout(w, d, h);
    assert.ok(c.yDeImpulso.length >= 1, `${w}×${d}×${h}: ningún estante de impulso`);
    for (const y of c.yDeImpulso) {
      assert.ok(y > 0 && y < c.mesa, `${w}×${d}×${h}: estante fuera del cuerpo`);
    }
  }
});

prueba("la ristra es una TIRA angosta, no un panel", () => {
  // La ficha del fabricante: 3,8 cm de ancho y 12 ganchos. Atada al ancho del
  // mueble, una ristra con 40 cm de huella salía de 28 cm de ancho —una
  // tabla— y encima llevaba un respaldo translúcido detrás. Un clip strip no
  // tiene respaldo: cuelga suelto por delante de la mercadería.
  const r = cuerpoDe("function RistraMesh(", "function CrossMesh(");
  assert.match(r, /const TIRA\s*=\s*0\.0[0-9]+/, "el ancho de la tira volvió a ser una fracción del mueble");
  assert.ok(!/args=\{\[w \* 0\.70, h,/.test(r), "volvió el panel de respaldo detrás de la tira");
  assert.match(r, /CABEZAL/, "la ristra perdió el cabezal porta-cartel, que es lo que compra la marca");
});

prueba("lo alto no se apila: una botella parada no va sobre otra", () => {
  // Apilando, salía una torre de botellas en el medio del canasto que no
  // existe en ninguna tienda.
  assert.match(granelCodigo, /const apilable =/, "el volcado vuelve a apilar cualquier cosa");
  assert.match(granelCodigo, /apilable && centro > 0\.45/, "el montículo vuelve a apilar lo que no se apila");
});

prueba("lo que entra parado se para: una batea no es un pozo", () => {
  // Una botella de litro y medio mide 31 cm; acostada mide 30 de largo, así
  // que en una batea de 60 cm de fondo entraba UNA fila y el mueble se veía
  // vacío con producto adentro. Y en la tienda tampoco es cierto: una batea de
  // promoción tiene las botellas paradas.
  assert.equal(P.empaqueVolcadoEn("Gaseosas", 0.42).acostado, undefined,
    "la botella que entra parada se sigue acostando");
  assert.equal(P.empaqueVolcadoEn("Gaseosas", 0.12).acostado, true,
    "la botella que NO entra parada dejó de acostarse");
  // Lo suelto no tiene envase y no cambia nunca.
  assert.equal(P.empaqueVolcadoEn("Frutas", 0.5).forma, "pieza");
  assert.equal(P.empaqueVolcadoEn("Carnes", 0.05).forma, "bandeja");
  // Se EJECUTA la cuenta, no se mira el nombre de la constante: una guarda
  // que sólo verificaba que `REBOSE` existiera dejó pasar una mutación que
  // devolvía la batea a medirse enrasada, porque la constante seguía ahí y la
  // fórmula ya no la usaba.
  assert.match(medidas, /export function cotasDeBatea/, "las cotas de la batea volvieron al componente");
  assert.match(bateaCodigo, /cotasDeBatea\(/, "la batea volvió a tener su propia cuenta");
  const ALTO_DE_BOTELLA = 0.31;   // la de litro y medio, de `EMPAQUES`
  for (const [w, d, h] of [[0.8, 0.6, 0.8], [1.0, 0.7, 0.85], [0.7, 0.5, 0.75]]) {
    const c = M.cotasDeBatea(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.ok(
      c.altoLibre >= ALTO_DE_BOTELLA,
      `${donde}: una botella de litro y medio no entra parada (${c.altoLibre.toFixed(3)} m)`,
    );
    assert.ok(c.piso > h * 0.5, `${donde}: el piso del canasto quedó bajo y el producto se hunde`);
    assert.ok(c.piso < h, `${donde}: el piso se salió por arriba del mueble`);
    assert.ok(c.ancho > 0 && c.fondo > 0, `${donde}: la boca se cerró`);
  }
  // Y la regla que las dos cosas sirven: en esa batea, la gaseosa va PARADA.
  assert.equal(
    P.empaqueVolcadoEn("Gaseosas", M.cotasDeBatea(0.8, 0.6, 0.8).altoLibre).acostado,
    undefined,
    "en una batea de tamaño de catálogo la gaseosa vuelve a acostarse",
  );
});

prueba("el stand de frutas es una ISLA DE DOS CARAS", () => {
  // Primero fue un mesón con un cajón plano —una mesa con cosas encima—, y
  // después un mueble de UNA cara con paneles ciegos de madera mirando al
  // pasillo. La ficha del fabricante da una isla: espina central y, a cada
  // lado, sus dos escalones. Una cara sola desperdicia la mitad del frente
  // vendible, que es exactamente lo que se le está vendiendo al proveedor.
  assert.match(medidas, /export function bandejasDeStand/, "se perdieron las bandejas del stand");
  const mesh = cuerpoDe("function StandFrutasMesh(", "function CheckoutMesh(");
  assert.match(mesh, /<StandFrutasReal/, "el stand volvió a dibujarse dentro del editor");
  assert.match(mesh, /rotation=\{\[b\.caida, 0, 0\]\}/, "los escalones del stand volvieron a ser planos");
  assert.match(mesh, /<VolcadoDeProducto/, "el stand se quedó sin fruta");

  for (const [w, d, h] of [[1.5, 1.2, 0.95], [1.0, 0.8, 0.9], [2.2, 1.4, 1.1]]) {
    const b = M.bandejasDeStand(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.equal(b.length, 4, `${donde}: el stand dejó de tener dos caras con dos escalones`);

    for (const lado of [-1, 1]) {
      const cara = b.filter((t) => t.lado === lado);
      assert.equal(cara.length, 2, `${donde}: la cara ${lado} no tiene sus dos escalones`);
      const [bajo, alto] = cara[0].y < cara[1].y ? cara : [cara[1], cara[0]];
      assert.ok(alto.y > bajo.y, `${donde}: la cara ${lado} no escalona`);
      // El escalón bajo va ADELANTE (más lejos de la espina) y el alto atrás,
      // contra la espina. Al revés, el de atrás tapa al de adelante.
      assert.ok(
        Math.abs(bajo.z) > Math.abs(alto.z),
        `${donde}: en la cara ${lado} el escalón alto se adelantó y tapa al bajo`,
      );
      for (const t of cara) {
        // Cae hacia SU pasillo: con el signo cambiado, la fruta de una cara
        // se derrama hacia adentro del mueble.
        assert.ok(t.caida * lado > 0, `${donde}: la cara ${lado} cae para el lado equivocado`);
        assert.ok(t.cajones >= 1, `${donde}: escalón sin cajones`);
        assert.ok(t.y < h, `${donde}: escalón fuera del mueble por arriba`);
        assert.ok(
          Math.abs(t.z) + t.fondo / 2 <= d / 2 + 1e-9,
          `${donde}: el escalón de la cara ${lado} se sale por el costado`,
        );
        // El cajón va lleno: con una capa en el fondo, la pared lo tapa.
        assert.ok(
          t.altoLibre >= M.STAND_FRUTAS.cajon.alto,
          `${donde}: el cajón de cosecha vuelve a quedar a medio llenar`,
        );
      }
    }
    // Las dos caras son simétricas respecto de la espina.
    const izq = b.filter((t) => t.lado === -1).map((t) => t.y).sort();
    const der = b.filter((t) => t.lado === 1).map((t) => t.y).sort();
    assert.deepEqual(izq, der, `${donde}: las dos caras no están a la misma altura`);
  }
});

prueba("la isla de frutas no se para sobre postes", () => {
  // Cuatro postes asomando por encima de las cubiertas la hacían leer como
  // andamio. En la ficha la estructura es BAJA: zócalo y espina, y nada por
  // arriba salvo el peine de pinzas de precio.
  //
  // La primera versión de esta prueba buscaba las palabras «postes» y
  // «parantes» en el archivo, y una mutación que agregaba cuatro postes de
  // verdad —sin llamarlos así— pasaba en verde. Un poste no es una palabra: es
  // un elemento que sube TODO el alto del mueble. Eso es lo que se afirma.
  const stand = sinComentarios(leer(join(muebles, "StandFrutasReal.tsx")));
  assert.match(stand, /espina/, "se perdió la espina central, que es lo que hace la isla");
  assert.match(stand, /alturaDeEspina\(/, "el stand volvió a calcularse su propia altura de estructura");

  // Nada dimensionado con el alto entero del mueble...
  const conAltoEntero = /args=\{\[[^\]]*(?:^|[,[])\s*h\s*(?:,|\])/m.exec(stand);
  assert.ok(!conAltoEntero, `hay una pieza que mide el alto entero: ${conAltoEntero?.[0]}`);
  // ...ni centrado a media altura, que es cómo se coloca un poste.
  assert.ok(!/position=\{\[[^\]]*\bh \/ 2\b/.test(stand), "hay una pieza centrada a media altura: es un poste");

  // Y la cuenta: la estructura queda por debajo del alto del mueble.
  for (const h of [0.95, 0.8, 1.1, 1.4]) {
    assert.ok(M.alturaDeEspina(h) < h, `la estructura sobresale del mueble con h=${h}`);
    assert.ok(M.alturaDeEspina(h) > h * 0.5, `la espina se hundió con h=${h}`);
  }
});

prueba("el mural hereda el arte del proveedor, no tiene un camino propio", () => {
  // Con un componente propio, el mueble calculaba si el proveedor había subido
  // su arte y después no lo dibujaba en ningún lado: las bandejas quedaban
  // vacías justo cuando había información real que mostrar.
  const mesh = cuerpoDe("function NeveraVegetalesMesh(", "function StandFrutasMesh(");
  assert.match(mesh, /<VolcadoDeProducto/, "el mural volvió a tener su propio dibujo de producto");
  assert.match(mesh, /facePaint\?\.front/, "el mural no mira el arte del proveedor");
  const span = editorCodigo.slice(editorCodigo.indexOf("function getPanelShelfSpan"));
  assert.match(
    span, /case "nevera_vegetales"[\s\S]{0,600}modo: "volcado"/,
    "el arte del mural se compondría como cara vertical y saldría estirada",
  );
});

prueba("el mural de vegetales lleva bandejas inclinadas, no estantes", () => {
  // La fruta suelta rueda y hay que verla desde arriba.
  assert.match(medidasCodigo, /export const MURAL_VEGETALES/, "se perdieron las cotas del mural");
  assert.match(neveraCodigo, /variante === "vegetales"/, "se perdió la variante de vegetales");
  assert.match(neveraCodigo, /MURAL_VEGETALES\.tope/, "las bandejas quedaron sin tope: la fruta se cae");
});

prueba("la bandeja gira sobre SÍ MISMA, no sobre el piso del mueble", () => {
  // Rotando el grupo desde el origen, una bandeja a 1,2 m se corre treinta
  // centímetros en Z y sale por el costado de la carrocería.
  assert.match(
    neveraCodigo, /position=\{\[0, y, NEVERA\.chapa \/ 2\]\}\s*\n\s*rotation=/,
    "la bandeja del mural vuelve a girar desde el origen del mueble",
  );
  // El producto del mural ya no tiene componente propio: lo dibuja el mismo
  // `VolcadoDeProducto` que la batea, adentro del grupo que el mesh pone en la
  // altura de cada bandeja.
  assert.match(
    editorCodigo, /position=\{\[0, b\.y, b\.z\]\}\s*rotation=\{\[b\.caida, 0, 0\]\}/,
    "la fruta del mural vuelve a girar desde el origen del mueble",
  );
});

prueba("la nevera de vegetales está dada de alta en todo el sistema", () => {
  // Un tipo nuevo toca diez lugares. Si falta uno, el mueble se puede colocar
  // y después no tiene código, o no aparece en el plano 2D.
  const donde = [
    ["types/fixtures.ts", "el tipo no existe"],
    ["utils/nomenclatura.ts", "el mueble no tiene prefijo de código"],
    ["components/FloorPlan2D/FloorPlan2D.tsx", "no se puede colocar en el plano 2D"],
    ["components/MiniMapa/MiniMapa.tsx", "no tiene nombre en el minimapa"],
    ["components/plataforma/formato.ts", "no tiene nombre en los informes"],
  ];
  for (const [ruta, porque] of donde) {
    assert.match(leer(join("src", ruta)), /nevera_vegetales/, `${ruta}: ${porque}`);
  }
  assert.match(editorCodigo, /case "nevera_vegetales":/, "el editor 3D no sabe dibujarla");
  assert.match(editorCodigo, /code:"VEG"/, "el mueble no tiene código de espacio");
});

prueba("la ristra NO lleva entrepaño", () => {
  // Una ristra es una TIRA: el producto CUELGA de una varilla por su troquel.
  // Tenía una placa horizontal del ancho del mueble en cada gancho, y eso la
  // convertía en una repisera angosta.
  const ristra = cuerpoDe("function RistraMesh(", "function CrossMesh(");
  assert.match(ristra, /cylinderGeometry args=\{\[0\.0035/, "el gancho volvió a ser una bandeja");
  assert.ok(
    !/boxGeometry args=\{\[w \* 0\.82/.test(ristra),
    "volvió la placa horizontal: la ristra es una repisera otra vez",
  );
});

// ── Ningún mueble mira el arte y después no lo dibuja ───────────────────────
//
// Es un defecto que compila, pasa toda prueba de tipos y sólo se ve cuando un
// proveedor sube su arte a ese mueble concreto — o sea, en producción y
// delante del cliente. La nevera de vegetales nació así: calculaba `pinta` y
// no lo usaba en ningún lado, de modo que las bandejas quedaban vacías justo
// cuando había información real que mostrar.

prueba("ningún mueble dibuja el arte del proveedor Y el relleno a la vez", () => {
  // El defecto, reportado sobre la tienda en producción: el robatope tenía el
  // arte del proveedor colgado de póster por delante Y los estantes llenos de
  // producto genérico por detrás. El mueble mostraba DOS cosas distintas al
  // mismo tiempo, y ninguna de las dos se entendía.
  //
  // La regla ya estaba escrita para la nevera —«el relleno mudo se apaga
  // cuando entra el arte del proveedor», porque el arte es información real y
  // el empaque por rubro es una aproximación— y tres muebles no la cumplían.
  // Se afirma para TODOS, y no mueble por mueble: así el próximo que se agregue
  // tampoco puede saltársela.
  const meshes = [...editorCodigo.matchAll(/\nfunction (\w*Mesh)\(/g)]
    .map((m) => ({ nombre: m[1], desde: m.index }));
  assert.ok(meshes.length > 8, "no se encontraron los meshes del editor");

  for (let i = 0; i < meshes.length; i++) {
    const cuerpo = editorCodigo.slice(meshes[i].desde, meshes[i + 1]?.desde ?? editorCodigo.length);
    const arte = cuerpo.includes("LaminaDeProducto");
    const relleno = cuerpo.includes("ProductoEnRepisas");
    if (!arte || !relleno) continue;
    assert.match(
      cuerpo, /\{!pinta && /,
      `\`${meshes[i].nombre}\` dibuja el arte del proveedor y el relleno por rubro a la vez`,
    );
  }
});

prueba("el arte se rebana POR ENTREPAÑO, no se cuelga de póster", () => {
  // Como lámina entera, el arte es una imagen del alto del mueble colgada por
  // delante de todo: tapa los estantes en vez de pararse sobre ellos. Por fila,
  // cada tramo de la textura se para en su entrepaño, que es donde está el
  // producto de verdad.
  for (const [nombre, desde, hasta] of [
    ["RobatopeMesh", "function RobatopeMesh(", "function RistraMesh("],
    ["CrossMesh", "function CrossMesh(", "function MetroMesh("],
    ["ImpulsadorMesh", "function ImpulsadorMesh(", "function BateaMesh("],
  ]) {
    const cuerpo = cuerpoDe(desde, hasta);
    assert.match(cuerpo, /<LaminaDeProductoPorFila/, `\`${nombre}\` volvió a colgar el arte de póster`);
    // Y la cuenta de entrepaños es UNA: la del pintado de caras.
    assert.match(
      cuerpo, /getPanelShelfSpan\(/,
      `\`${nombre}\` volvió a tener su propia cuenta de entrepaños para el arte`,
    );
  }
});

prueba("todo mueble que lee el arte del proveedor lo dibuja", () => {
  // Los meshes que reciben `facePaint` tienen que hacer algo con él: pintarlo
  // en una lámina, volcarlo sobre una superficie, o decidir con él si va el
  // producto genérico. Leerlo y descartarlo es el defecto.
  const dibuja = /<LaminaDeProducto|<VolcadoDeProducto|<ProductoEn(Gondola|Punta|Mural|Repisas)|facePaint=\{/;
  const meshes = [...editorCodigo.matchAll(/function (\w+Mesh)\(/g)].map((m) => m[1]);
  assert.ok(meshes.length > 10, "no se encontraron los meshes del catálogo");

  // Cada cuerpo se corta en la LLAVE DE CIERRE de su propia función, no en el
  // mueble siguiente. Entre dos meshes hay declaraciones sueltas —entre la
  // columna y el mostrador de servicio vive `interface FixtureMeshProps`, que
  // declara `facePaint`—, y cortando de mueble a mueble la columna heredaba
  // una mención que no es suya y salía señalada sin recibir nada.
  const cuerpoDeMesh = (nombre) => {
    const i = editorCodigo.indexOf(`function ${nombre}(`);
    assert.ok(i > 0, `no se encontró \`${nombre}\``);
    const j = editorCodigo.indexOf("\n}\n", i);
    assert.ok(j > i, `\`${nombre}\` no cierra: el corte mediría el archivo entero`);
    return editorCodigo.slice(i, j);
  };

  for (const nombre of meshes) {
    const cuerpo = cuerpoDeMesh(nombre);
    // Sólo interesan los que RECIBEN el arte.
    if (!/facePaint/.test(cuerpo)) continue;
    assert.match(
      cuerpo, dibuja,
      `\`${nombre}\` recibe \`facePaint\` y no lo dibuja en ningún lado: ` +
      "el arte del proveedor no se vería en ese mueble",
    );
  }
});

console.log(`\n${hechas} pruebas del mobiliario 3D`);
