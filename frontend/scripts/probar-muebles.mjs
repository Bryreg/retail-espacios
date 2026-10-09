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
    cuerpoEscena, /const conEspacios = hasSlots && fix\.id === selectedId && !placingDef && !firstPerson && !presentationMode;/,
    "cambió la condición que decide sobre qué mueble se ven los espacios (o volvieron a Presentar)",
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
// La cuenta del relleno —qué es vendido, a qué altura, desde el filo— se mudó
// de `ProductoEnMueble` a `frentes.ts`, que es pura. Las guardas la siguen.
const frentesCodigo = sinComentarios(leer(join(muebles, "frentes.ts")));

prueba("sólo se llena lo que está vendido", () => {
  // Rellenar la góndola entera "para que se vea linda" miente sobre lo único
  // que este sistema tiene que decir: dónde hay espacio libre.
  assert.match(frentesCodigo, /VENDIDO\.has\(slot\.status\)/, "el producto dejó de mirar el estado del slot");
  assert.match(
    frentesCodigo, /new Set\(\["occupied", "reserved"\]\)/,
    "cambió qué cuenta como vendido: un reservado también está comprometido",
  );
});

prueba("el producto se para en los mismos entrepaños que se dibujan", () => {
  assert.match(enGondolaCodigo, /filasDeProducto\(/, "el producto calcula las alturas por su cuenta");
  assert.match(frentesCodigo, /filas\.alturas\[i\]/, "no usa la altura exacta del entrepaño");
  assert.match(enGondolaCodigo, /vanosDeCorrido\(/, "el producto podría quedar apoyado sobre un parante");
});

prueba("el producto usa la misma franja de slots que los paneles", () => {
  assert.match(enGondolaCodigo, /altoDeZonaDeSlots\(h\)/, "el producto tiene su propia copia de la franja");
  assert.match(frentesCodigo, /ZONA_DE_SLOTS\.desde/, "el producto tiene su propia base de la franja");
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
    frentesCodigo, /fondoEntrepano - RETIRO_AL_FRENTE/,
    "el producto se paró desde el fondo del entrepaño y no desde su filo",
  );
});

prueba("el color del rubro es estable entre renders", () => {
  // Sin esto la tienda titila cada vez que se mueve la cámara.
  assert.match(productoCodigo, /export function colorDeRubro/, "falta el color por rubro");
  assert.ok(!/Math\.random/.test(productoCodigo), "el color del producto salió al azar");
  assert.ok(!/Math\.random/.test(enMuebleCodigo), "la ubicación del producto salió al azar");
  // Y nada del producto de prueba: el mismo mueble se ve igual siempre.
  for (const f of ["frentes.ts", "recorte.ts", "etiqueta.ts", "ProductoDePrueba.tsx", "pop.ts", "texturas.ts", "privacidad.ts"]) {
    let codigo;
    try { codigo = sinComentarios(leer(join(muebles, f))); } catch { continue; }
    assert.ok(!/Math\.random/.test(codigo), `\`${f}\` usa Math.random: el producto titilaría`);
  }
  assert.match(
    enMuebleCodigo, /import \{[^}]*\brellenoPorRubro\b[^}]*\} from "\.\/frentes"/,
    "`ProductoEnMueble` volvió a acomodar el producto por su cuenta",
  );
  assert.ok(!/acomodar\(|empaqueQueEntra\(/.test(enMuebleCodigo),
    "`ProductoEnMueble` calcula frentes en vez de dibujar los de `rellenoPorRubro`");
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
  // Desde la chapa impresa hasta el final: el copete y su marca. (Antes se
  // cortaba desde un comentario que `sinComentarios` borra, y la prueba
  // miraba un solo carácter.)
  const desde = puntaCodigo.indexOf("const chapa = useMemo(");
  assert.ok(desde > 0, "no se encontró la chapa impresa del copete");
  const tramo = puntaCodigo.slice(desde);
  assert.ok(!/statusColor/.test(tramo), "el copete quedó teñido con el estado del mueble");
  // La marca del producto en prueba va sólo en la cara que mira al pasillo.
  assert.match(tramo, /materiales\.precios, copete\] : materiales\.precios/);
  assert.match(tramo, /material=\{chapa\}/);
});

prueba("la marca del copete sale sólo del arte en prueba, sin texto inventado", () => {
  const pop = sinComentarios(leer(join(muebles, "pop.ts")));
  assert.ok(!/fillText|strokeText|\.font\s*=/.test(pop), "el copete escribe texto que el proveedor no puso");
  assert.match(pop, /et\.recorte\.colorDominante/, "el degradé no sale del color de la foto");
  assert.match(pop, /g\.drawImage\(p, /, "el copete no lleva el producto");
  // Sólo con la cara entera, si no se apagó, y nunca sin la prueba.
  assert.match(cuerpoPuntaMesh,
    /const conMarca = enPrueba && pa\?\.etiqueta && pa\.donde === "todas" && pa\.copete !== false;/,
    "la marca va al copete aunque se pruebe un solo entrepaño");
  assert.match(cuerpoPuntaMesh, /const copete = conMarca && pa\?\.etiqueta\s*\? materialDeCopete\(/);
  assert.match(cuerpoPuntaMesh, /const cenefa = conMarca && pa\?\.etiqueta \? materialDeCenefa\(/,
    "la cenefa va sin la marca en el copete");
  assert.match(cuerpoPuntaMesh, /<PuntaReal w=\{w\} d=\{d\} h=\{h\} ghost=\{ghost\} copete=\{copete\} cenefa=\{cenefa\} \/>/);
  // Segunda ronda: un héroe al centro (no dos recortes en las puntas con el
  // centro vacío) y sin la raya blanca que cruzaba la base de los vasos.
  assert.match(pop, /pegar\(W \/ 2, heroe\)/, "el copete no lleva el producto al centro");
  assert.ok(!/fillRect\(0, Math\.round\(H \* 0\.86\)/.test(pop), "volvió la raya blanca del copete");
  // La cenefa tapa SÓLO el hueco que no sirve para producto.
  const punta = sinComentarios(leer(join(muebles, "PuntaReal.tsx")));
  assert.match(punta, /\{cenefa && altoDeCuerpo - niveles\[niveles\.length - 1\] < 0\.12 && \(/,
    "la cenefa tapa un entrepaño donde entra producto");
  // El cabezote de la nevera, con la misma regla que el copete.
  assert.match(cuerpoDe("function NeveraRefrescosMesh(", "function StandFrutasMesh("),
    /const cabezote = enPrueba && pa\?\.etiqueta && pa\.donde === "todas" && pa\.copete !== false\s*\? materialDeCopete\(/);
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
  // Lo que se ve en el mueble tiene que ser SU producto, no uno inventado:
  // ni con su arte pintado ni con su producto en prueba.
  assert.match(cuerpoNeveraMesh, /conRelleno=\{!pinta && !enPrueba\}/, "el relleno taparía el arte del proveedor");
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
  // El marcador se ANCLA con lo que puede venir después —el cierre de la
  // plantilla o un `${i}`—, o un prefijo satisface la guarda de otro: con
  // «isla» a secas, `${id}|isla_fria` la daba por cumplida, y el exhibidor de
  // piso podía quedarse sin semilla sin que nada lo dijera. Ya no es mueble de
  // volcado —tiene bandejas y el producto se para en ellas—, así que sale.
  for (const marca of ["batea", "stand", "carnes", "isla_fria"]) {
    assert.match(
      editorCodigo, new RegExp("semilla=\\{`\\$\\{id\\}\\|" + marca + "[`$]"),
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
  assert.match(frentesCodigo, /vendidoEntero/, "se perdió el modo de mueble entero");
  assert.match(
    frentesCodigo, /if \(!vendidoEntero && \(apoyo </,
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
  assert.match(frentesCodigo, /PROFUNDIDAD_DE_MUEBLE_ENTERO/, "el mueble entero volvió a llenarse como una góndola");
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

prueba("el exhibidor de piso es una ESTIBA con la mercancía apilada encima", () => {
  // Tres formas tuvo este mueble y las tres estaban mal, cada una por su lado:
  //
  //   1. una pirámide de cajones macizos, que además dibujaba producto sobre la
  //      tapa de TODOS los niveles —también los que tenían otro nivel encima—,
  //      así que el producto quedaba adentro de la caja de arriba;
  //   2. un mueble impreso con bandejas, cenefa y header de marca;
  //   3. la tarima correcta, pero con la torre FLOTANDO: las capas se repartían
  //      en pasos nominales de 30 cm y encima de cada una se paraba el empaque
  //      que entrara, así que una caja de galletas de 19 cm dejaba 11 cm de
  //      aire y la torre salía en pisos separados.
  //
  // No es un mueble. La huella del tipo —1,20 × 0,80 m— es exactamente la de
  // una estiba estándar: es una TARIMA plantada en el pasillo con la mercancía
  // apilada arriba, y lo que se le alquila a la marca es la posición.
  assert.match(medidas, /export function cotasDeEstiba/, "se perdieron las cotas de la estiba");
  const mesh = cuerpoDe("function IslaMesh(", "function ImpulsadorMesh(");
  assert.match(mesh, /<EstibaReal/, "el exhibidor volvió a dibujarse dentro del editor");
  assert.ok(!/<VolcadoDeProducto/.test(mesh), "el exhibidor volvió a volcar producto sobre cajones");
  assert.match(mesh, /<ProductoEnRepisas/, "la estiba se quedó sin mercancía encima");
  // Y el relleno se apaga con el arte, como todos los demás.
  assert.match(mesh, /\{!pinta && /, "el exhibidor dibuja el arte y el relleno a la vez");
  // El paso de la torre lo pone el EMPAQUE. Sin ese dato vuelve al paso
  // nominal de 30 cm, que es el defecto 3: la torre flota.
  assert.match(
    mesh, /cotasDeEstiba\(w, d, h, empaque\?\.alto\)/,
    "la torre volvió al paso nominal: la mercancía queda flotando en pisos",
  );

  const estiba = sinComentarios(leer(join(muebles, "EstibaReal.tsx")));
  // Una tarima es ABIERTA: piso, travesaños y cubierta. El hueco que dejan los
  // travesaños es por donde entra la uña del montacargas, y es lo que hace que
  // se lea «estiba» y no «cajón de madera».
  for (const [pieza, que] of [
    ["c.zDePiso.map", "el piso"], ["c.xDeTravesanos.map", "los travesaños"],
    ["c.zDeTablas.map", "la cubierta"],
  ]) {
    assert.ok(estiba.includes(pieza), `la tarima se quedó sin ${que}`);
  }
  // Ninguna pieza de madera se dimensiona con el alto del mueble: la tarima
  // mide 144 mm y todo lo que hay arriba es producto. Con una caja de alto `h`
  // esto vuelve a ser un mueble macizo.
  for (const args of estiba.match(/<boxGeometry args=\{\[[^\]]*\]/g) ?? []) {
    assert.ok(
      !/\bh\b/.test(args.replace(/\w+\.h\b/g, "")),
      `la tarima creció hasta el alto del mueble: \`${args}\``,
    );
  }

  // La huella chica está a propósito: es donde el enlistonado de la tarima
  // de catálogo no entra y hay que recortarlo.
  for (const [w, d, h] of [
    [1.2, 0.8, 1.4], [1.0, 0.8, 1.1], [1.6, 1.2, 1.8], [0.9, 0.6, 1.2], [0.7, 0.45, 1.0],
  ]) {
    // La cubierta deja pasar la uña del montacargas y no se come el mueble.
    const cero = M.cotasDeEstiba(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.ok(cero.cubierta > 0 && cero.cubierta < h, `${donde}: la cubierta no está entre el piso y el tope`);
    assert.ok(
      cero.cubierta - M.ESTIBA.tabla * 2 > 0.04,
      `${donde}: se cerró el hueco de los travesaños, esto es un cajón de madera`,
    );
    // El enlistonado deja luz: sin luz la cubierta es una tapa.
    for (const tablas of [cero.zDeTablas, cero.zDePiso]) {
      assert.ok(tablas.length >= 2, `${donde}: enlistonado de una sola tabla`);
      assert.ok(
        tablas.length * M.ESTIBA.anchoDeTabla < d,
        `${donde}: las tablas cubren el fondo entero, la cubierta quedó maciza`,
      );
      for (let i = 1; i < tablas.length; i++) {
        assert.ok(
          tablas[i] - tablas[i - 1] >= M.ESTIBA.anchoDeTabla - 1e-9,
          `${donde}: dos tablas se pisan`,
        );
      }
      assert.ok(
        Math.abs(tablas[0]) + M.ESTIBA.anchoDeTabla / 2 <= d / 2 + 1e-9,
        `${donde}: la tabla del filo se sale de la tarima`,
      );
    }

    for (const rubro of ["Galletas", "Gaseosas", "Atún", "Snacks", undefined]) {
      const e = P.empaqueQueEntra(rubro, Math.max(0.05, h - M.ESTIBA.alto));
      assert.ok(e, `${donde}: no entra ningún empaque sobre la tarima`);
      const c = M.cotasDeEstiba(w, d, h, e.alto);
      const caso = `${donde} ${rubro ?? "sin rubro"}`;

      // La mercancía se apila AL RAS: el primer tendido apoya en la cubierta.
      assert.equal(c.capas[0], c.cubierta, `${caso}: el primer tendido no apoya en la tarima`);
      assert.ok(c.capas.length >= 1, `${caso}: la estiba se quedó sin tendidos`);
      // La torre no pasa el alto del espacio contratado: ese alto es el que
      // mira el chequeo de choques y el que se le cobra a la marca.
      assert.ok(c.techo <= h + 1e-9, `${caso}: la torre sobresale del espacio (${c.techo} > ${h})`);

      for (let i = 0; i < c.capas.length; i++) {
        const arriba = c.capas[i + 1] ?? c.techo;
        const libre = arriba - c.capas[i];
        assert.ok(libre > 0, `${caso}: el tendido ${i} no deja alto libre`);
        if (i + 1 < c.capas.length) {
          assert.ok(
            Math.abs(libre - c.paso) < 1e-9,
            `${caso}: los tendidos no suben de a un paso parejo`,
          );
        }
        // Y acá está el defecto que se vio en pantalla: lo que se para encima
        // del tendido es lo que `ProductoEnMueble` elige para ESE alto libre,
        // y si sobra aire la torre sale flotando en pisos separados.
        const puesto = P.empaqueQueEntra(rubro, libre);
        assert.ok(puesto, `${caso}: sobre el tendido ${i} no entra nada`);
        assert.ok(
          libre - puesto.alto <= 0.02,
          `${caso}: sobre el tendido ${i} quedan ${((libre - puesto.alto) * 100).toFixed(1)} cm de aire: la torre flota`,
        );
      }

      // Cargada hasta el filo, y sin pasarse de la tarima: una estiba de
      // promoción no viene con una cajita en el centro.
      assert.ok(c.ancho <= w && c.fondo <= d, `${caso}: la mercancía se sale de la tarima`);
      assert.ok(c.ancho > w * 0.9 && c.fondo > d * 0.9, `${caso}: la mercancía no llega al filo`);
    }
  }

  // Una estiba de catálogo lleva VARIOS tendidos: con uno solo esto es una
  // tarima con una caja encima.
  const galletas = M.cotasDeEstiba(1.2, 0.8, 1.4, P.empaqueDeRubro("Galletas").alto);
  assert.ok(galletas.capas.length >= 3, "la estiba de catálogo se quedó en un tendido");
});

prueba("el mostrador de servicio tiene DOS NIVELES", () => {
  // Era una tapa lisa sobre un cajón con un cartel colgado de dos postes: ese
  // mueble no existe en ninguna tienda. Lo que identifica un mostrador de
  // atención es el escalón — abajo el plano de trabajo del que atiende, encima
  // y volando hacia el cliente la repisa donde el cliente apoya y firma. Sin
  // ese escalón esto es un podio.
  assert.match(medidas, /export function cotasDeServicio/, "se perdieron las cotas del mostrador");
  const mesh = cuerpoDe("function ServicioClienteMesh(", "function FixtureMesh(");
  assert.match(mesh, /<ServicioClienteReal/, "el mostrador volvió a dibujarse dentro del editor");

  for (const [w, d, h] of [[1.6, 0.7, 1.1], [1.2, 0.6, 1.0], [2.4, 0.9, 1.25]]) {
    const c = M.cotasDeServicio(w, d, h);
    const donde = `${w}×${d}×${h}`;
    assert.ok(c.repisa > c.trabajo, `${donde}: se perdió el escalón, quedó una tapa lisa`);
    assert.ok(c.trabajo < h, `${donde}: el plano de trabajo llegó al tope del mueble`);
    // La repisa vuela hacia el CLIENTE, que es -Z. Del otro lado le queda la
    // espalda al pasillo y el cliente apoya sobre el hombro del que atiende.
    assert.ok(c.zDeRepisa < 0, `${donde}: la repisa quedó del lado del que atiende`);
    assert.ok(
      Math.abs(c.zDeRepisa) + c.fondoDeRepisa / 2 <= d / 2 + 1e-9,
      `${donde}: la repisa se sale por el frente`,
    );
    // El tramo bajo es BAJO respecto de la REPISA DE ATENCIÓN, que es el
    // mostrador contra el que se atiende de pie. No respecto del plano de
    // trabajo del que atiende, que es un escritorio y siempre va más abajo:
    // esa comparación era una afirmación mal planteada de esta misma prueba.
    assert.ok(c.altoAccesible < c.repisa, `${donde}: el tramo accesible dejó de ser bajo`);
    assert.ok(c.altoAccesible < h, `${donde}: el tramo accesible pasó el alto del mueble`);
    assert.ok(c.anchoAccesible > 0 && c.anchoAlto > 0, `${donde}: uno de los dos tramos desapareció`);
    assert.ok(
      Math.abs(c.anchoAccesible + c.anchoAlto - w) < 1e-9,
      `${donde}: los dos tramos no cubren el frente`,
    );
  }
  // La altura del tramo accesible sale de la norma —0,86 m para atender a
  // alguien sentado—, no de una fracción inventada del mueble.
  assert.equal(M.SERVICIO.accesible.alto, 0.86, "el tramo accesible dejó de tener la altura de norma");
  assert.equal(
    M.cotasDeServicio(1.6, 0.7, 1.1).altoAccesible, 0.86,
    "el tramo accesible dejó de respetar la norma en un mueble de tamaño de catálogo",
  );
});

prueba("la fruta va DENTRO del cajón, no encima de la bandeja", () => {
  // El cajón no cubre la bandeja entera —queda una banda de madera a la vista
  // delante de la fila— y está corrido hacia el fondo. Esas dos cotas estaban
  // repetidas: en el componente y, mal, en el volcado del editor, que seguía
  // usando el fondo ENTERO de la bandeja y sin correr. La fruta se salía del
  // cajón por el borde de abajo, y así se vio en la tienda.
  const mesh = cuerpoDe("function StandFrutasMesh(", "function CheckoutMesh(");
  assert.match(mesh, /b\.cajonFondo/, "el volcado del stand volvió a medirse con el fondo de la bandeja");
  assert.match(mesh, /b\.cajonZ/, "el volcado del stand volvió a ir sin correr");
  const stand = sinComentarios(leer(join(muebles, "StandFrutasReal.tsx")));
  assert.match(stand, /b\.cajonFondo/, "el cajón volvió a calcular su propio fondo");
  assert.match(stand, /b\.cajonZ/, "el cajón volvió a calcular su propio corrimiento");

  for (const [w, d, h] of [[1.5, 1.2, 0.95], [1.0, 0.8, 0.9], [2.2, 1.4, 1.1]]) {
    for (const b of M.bandejasDeStand(w, d, h)) {
      const donde = `${w}×${d}×${h} cara ${b.lado}`;
      assert.ok(b.cajonFondo > 0, `${donde}: cajón sin fondo`);
      assert.ok(b.cajonFondo < b.fondo, `${donde}: el cajón tapa la banda de madera entera`);
      // El cajón, corrido y todo, entra completo dentro de la bandeja.
      assert.ok(
        Math.abs(b.cajonZ) + b.cajonFondo / 2 <= b.fondo / 2 + 1e-9,
        `${donde}: el cajón se sale de su bandeja`,
      );
    }
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

// ── Una sola cuenta para lo que la prueba de producto necesita ──────────────
//
// El producto de prueba del proveedor se para SOBRE los entrepaños del mueble,
// y eso pide saber cuatro cosas que vivían escritas adentro de cada componente:
// cuánto se inclina un entrepaño alto, dónde van las repisas del robatope, a
// qué altura se apoya algo en la rejilla de la nevera y dónde vende cada
// mueble. Con una copia en el mueble y otra en el producto, el día que se toque
// una el envase queda flotando o enterrado. Se ejecutan.

const grados = (r) => Math.round((r * 180) / Math.PI * 1000) / 1000;

prueba("la inclinación de los entrepaños es UNA cuenta, y la usan las piezas", () => {
  // La punta de catálogo: 0,9 × 0,4 × 1,8, con su cuerpo de 1,44 bajo el copete.
  const cuerpo = 1.8 - M.COPETE.alto;
  const punta = M.filasDePunta(cuerpo, 0.4 - M.PANEL_FONDO.espesor);
  assert.deepEqual(punta.alturas.slice(0, 5).map((y) => +y.toFixed(3)), [0.125, 0.425, 0.75, 1.075, 1.375]);
  assert.deepEqual(punta.giros.map(grados), [0, 0, 0, -5, -5],
    "la punta inclina otras filas que las que dibuja inclinadas");
  // La góndola de 1,80: sólo la fila de 1,375 cae por encima del 60 % del alto.
  const gon = M.filasDeProducto(1.8, M.fondoPorCara(0.9, false));
  assert.deepEqual(gon.giros.map(grados), [0, 0, 0, 0, -5], "la góndola inclina otra fila");
  // La rejilla del multideck va plana.
  assert.ok(M.filasDeNevera(1.8, 0.687).giros.every((g) => g === 0), "la nevera inclinó una rejilla");
  // El entrepaño y la fila preguntan lo mismo: para cada nivel, el giro de la
  // fila es el que la pieza le da al entrepaño que la sostiene.
  for (let h = 1.2; h <= 2.4001; h += 0.05) {
    const f = M.filasDeProducto(h, 0.44);
    f.giros.forEach((g, i) => assert.equal(g, M.inclinacionDeNivel(f.alturas[i], h)));
  }
  assert.match(piezasCodigo, /inclinacionDeNivel\(y, alto\)/, "el entrepaño calcula su giro por su cuenta");
  assert.ok(!/ENTREPANO\.desdeFraccionDeAlto/.test(piezasCodigo),
    "las piezas volvieron a comparar la fracción del alto por su lado");
});

prueba("las repisas del robatope salen de UNA cuenta, la de siempre", () => {
  // La fórmula vieja, escrita acá a mano: es la tabla contra la que se mide.
  // Si alguien «mejora» el reparto, el arte y el producto ya vendidos se corren.
  for (let h = 1.2; h <= 2.2001; h += 0.05) {
    const cuerpo = h - 0.055;
    const n = Math.max(2, Math.round(cuerpo / 0.40));
    const esperadas = Array.from({ length: n }, (_, i) => 0.12 + (i + 1) * (cuerpo - 0.16) / (n + 1) + 0.011);
    const c = M.cotasDeRobatope(0.3, 0.4, h);
    assert.equal(c.n, n, `con alto ${h.toFixed(2)} cambió la cantidad de repisas`);
    c.apoyos.forEach((y, i) => assert.ok(Math.abs(y - esperadas[i]) < 1e-12,
      `con alto ${h.toFixed(2)} la repisa ${i} se corrió de ${esperadas[i]} a ${y}`));
    assert.ok(Math.abs(c.paso - (cuerpo - 0.16) / (n + 1)) < 1e-12, "cambió el paso");
    assert.ok(Math.abs(c.cuerpo - cuerpo) < 1e-12 && Math.abs(c.fondo - 0.39) < 1e-12);
    // Y la venta que se arma con eso cierra la última fila contra el cuerpo.
    const v = M.ventaDeRobatope(0.3, 0.4, h);
    assert.equal(v.filas.alturas.length, v.filas.rows + 1);
    assert.equal(v.filas.alturas[v.filas.rows], c.cuerpo);
    assert.equal(v.grupoGiro, -0.06, "el producto no gira con el juego de repisas");
  }
  const robatope = cuerpoDe("function RobatopeMesh(", "function RistraMesh(");
  assert.ok(!/Math\.round\(bodyH \/ 0\.40\)/.test(robatope), "el robatope volvió a repartir sus repisas a mano");
  assert.match(robatope, /cotasDeRobatope\(/, "el robatope no pregunta sus cotas");
  const span = editorCodigo.slice(editorCodigo.indexOf("function getPanelShelfSpan"));
  const tramo = span.slice(span.indexOf('case "robatope"'), span.indexOf('case "mueble"'));
  assert.match(tramo, /cotasDeRobatope\(/, "el pintado del robatope volvió a tener su propia cuenta");
  assert.ok(!/keep in sync/i.test(robatope + tramo), "volvió el «keep in sync»: dos copias de la misma cuenta");
});

prueba("la nevera apoya sobre la rejilla con UNA cota", () => {
  assert.match(neveraCodigo, /apoyo \+ e\.alto \/ 2 \+ SOBRE_REJILLA/, "el relleno mudo volvió a su número a mano");
  const v = M.ventaDeNevera(1.2, 0.75, 1.8);
  assert.equal(v.sobreApoyo, M.SOBRE_REJILLA);
  // El canto de atrás de la rejilla: grupo en z = chapa/2 con el fondo interior.
  const fondoInterior = 0.75 - M.NEVERA.chapa - M.NEVERA.fondoPuerta;
  assert.ok(Math.abs(v.caras[0].montaje - (M.NEVERA.chapa / 2 + fondoInterior / 2)) < 1e-12,
    "el producto de la nevera se montó fuera de la rejilla");
  assert.ok(Math.abs(v.vanos[0].ancho - (1.2 - 2 * M.NEVERA.chapa - 0.03)) < 1e-12);
});

prueba("la góndola y la punta dicen dónde venden desde su propio archivo", () => {
  assert.match(enGondolaCodigo, /export function ventaDeGondola/, "la góndola perdió su venta");
  assert.match(enPuntaCodigo, /export function ventaDePunta/, "la punta perdió su venta");
  const venta = sinComentarios(leer(join(muebles, "venta.ts")));
  for (const f of ["ventaDeGondola(", "ventaDePunta(", "ventaDeNevera(", "ventaDeRobatope("]) {
    assert.ok(venta.includes(f), `\`ventaDeTipo\` no despacha a \`${f.slice(0, -1)}\``);
  }
  assert.ok(!/filasDe|vanosDeCorrido|nivelesDe/.test(venta), "`ventaDeTipo` calcula en vez de despachar");
});

// ── Dónde va cada unidad: el relleno y la prueba, ejecutados ────────────────
//
// `frentes.ts` es puro: se compila y se corre. `venta.ts` trae la góndola y la
// punta, que viven en archivos de React; se compilan con React y three
// adentro, que en Node se importan bien.

const compiladoF = await build({
  entryPoints: [join(raiz, muebles, "frentes.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
const F = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoF.outputFiles[0].text).toString("base64")
);
const compiladoX = await build({
  entryPoints: [join(raiz, muebles, "privacidad.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
const X = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoX.outputFiles[0].text).toString("base64")
);
const compiladoV = await build({
  entryPoints: [join(raiz, muebles, "venta.ts")],
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  logLevel: "silent",
});
const V = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoV.outputFiles[0].text).toString("base64")
);

prueba("el relleno por rubro cuenta lo que entra, y cada cara lo suyo", () => {
  // Una góndola doble de catálogo con UN espacio vendido que toma la cara
  // entera. El total tiene que ser, entrepaño por entrepaño y vano por vano,
  // los frentes que entran por dos de fondo por las dos caras.
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  const slot = { id: "g", x: 0, w: 1, y: 0, h: 1, status: "occupied", brandCategory: "Galletas" };
  const base = { anchoTotal: 3.6, filas: v.filas, vanos: v.vanos, caras: v.caras, franja: v.franja, slots: [slot] };
  let esperado = 0;
  for (let i = 0; i < v.filas.rows; i++) {
    const libre = v.filas.alturas[i + 1] - v.filas.alturas[i];
    const e = P.empaqueQueEntra("Galletas", libre);
    if (!e) continue;
    for (const vano of v.vanos) {
      const a = P.acomodar(vano.ancho, v.filas.fondos[i], libre, e);
      esperado += a.frentes * Math.min(a.filas, 2) * 2;
    }
  }
  const total = (g) => g.reduce((n, x) => n + x.posiciones.length, 0);
  assert.ok(esperado > 100, "la cuenta esperada salió vacía");
  assert.equal(total(F.rellenoPorRubro(base)), esperado);

  // La prueba del proveedor tapa los entrepaños 1 y 2 de la cara A: ahí no
  // va relleno, y la cara B conserva lo suyo.
  const cubierto = F.rellenoPorRubro({ ...base, cubiertas: [[1, 2], null] }).flatMap((g) => g.posiciones);
  assert.ok(!cubierto.some((p) => p.cara === 0 && (p.fila === 1 || p.fila === 2)),
    "el relleno se dibuja debajo del producto de prueba");
  assert.ok(cubierto.some((p) => p.cara === 1 && p.fila === 1), "la cara B perdió su slot vendido");
  assert.ok(cubierto.some((p) => p.cara === 0 && p.fila === 0), "se tapó un entrepaño que no se eligió");
  const toda = F.rellenoPorRubro({ ...base, cubiertas: ["todas"] }).flatMap((g) => g.posiciones);
  assert.ok(toda.length > 0 && toda.every((p) => p.cara === 1), "«Toda la cara» dejó relleno en la cara A");
  assert.equal(F.claveDeCubiertas(["todas", null]), "0:todas|1:-");
});

prueba("la regla de qué entrepaño es de qué espacio es la del relleno", () => {
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  // Los cuatro de una góndola recién colocada (`defaultSlots`), y dos que
  // terminan y empiezan JUSTO sobre un entrepaño: ahí se decide el ±1 mm.
  const justo = (y) => (y - M.ZONA_DE_SLOTS.desde) / v.franja;
  const bordes = [
    { y: 0, h: justo(0.75) },
    { y: justo(0.75), h: 1 - justo(0.75) },
  ];
  const cuartos = [0, 0.25, 0.5, 0.75].map((y) => ({ y, h: 0.25 }));
  for (const slot of [{ y: 0, h: 0.5 }, { y: 0.5, h: 0.5 }, { y: 0, h: 1 }, ...cuartos, ...bordes]) {
    const s = { id: "s", x: 0, w: 1, status: "occupied", brandCategory: "Galletas", ...slot };
    const dibujadas = new Set(F.rellenoPorRubro({
      anchoTotal: 3.6, filas: v.filas, vanos: v.vanos, caras: v.caras, franja: v.franja, slots: [s],
    }).flatMap((g) => g.posiciones.map((p) => p.fila)));
    assert.deepEqual(
      F.entrepanosDelEspacio(s, v.filas, v.franja),
      [...dibujadas].sort((a, b) => a - b),
      `el espacio ${slot.y}–${slot.y + slot.h} no marca los mismos entrepaños que llena`,
    );
  }
});

const VASO = { ancho: 0.075, alto: 0.09, fondo: 0.075, forma: "caja" };
const enMetros = (n) => +n.toFixed(4);

prueba("el vaso en la punta: diez por entrepaño y el hueco del copete vacío", () => {
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const r = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: "todas", semilla: "PUN-01|A|1" });
  assert.deepEqual(r.porFila.map((f) => f.frentes), [10, 10, 10, 10, 0]);
  assert.equal(r.porFila[4].motivo, "no-entra-alto", "el hueco bajo el copete no dice por qué quedó vacío");
  assert.equal(r.frentesALaVista, 40);
  r.porFila.forEach((f, i) => {
    assert.equal(f.apoyo, v.filas.alturas[i], `la fila ${i} no apoya en su entrepaño`);
    assert.equal(f.giro, v.filas.giros[i], `la fila ${i} no gira con su entrepaño`);
  });
  for (const u of r.unidades) {
    const piso = u.y - VASO.alto / 2;
    assert.ok(piso >= -1e-9, `una unidad de la fila ${u.fila} se hunde en el entrepaño`);
    const tope = r.porFila[u.fila].apoyo + u.y + VASO.alto / 2;
    assert.ok(tope <= v.filas.alturas[u.fila + 1] + 1e-9, `una unidad de la fila ${u.fila} atraviesa el de arriba`);
    // Dentro del entrepaño, de adelante hacia atrás, y en la mitad que mira al pasillo.
    assert.ok(u.z < 0 && -u.z <= v.filas.fondos[u.fila], `una unidad de la fila ${u.fila} quedó fuera del entrepaño`);
  }
  // Tres de fondo, y la de adelante al filo.
  assert.ok(r.porFila.slice(0, 4).every((f) => f.fondoVisible === 3));

  const dos = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: [1, 2], semilla: "PUN-01|A|1" });
  assert.deepEqual([...new Set(dos.unidades.map((u) => u.fila))].sort(), [1, 2], "«Por entrepaño» llenó otros");
  assert.equal(dos.porFila[0].motivo, "no-elegida");
  assert.equal(dos.frentesALaVista, 20);

  const apilable = F.unidadesDePrueba({ venta: v, empaque: { ...VASO, apilable: true }, donde: "todas", semilla: "x" });
  assert.deepEqual(apilable.porFila.map((f) => f.pisos), [3, 3, 3, 3, 0], "el vaso que se apila no se apiló de a tres");
  for (const u of apilable.unidades) {
    const tope = apilable.porFila[u.fila].apoyo + u.y + VASO.alto / 2;
    assert.ok(tope <= v.filas.alturas[u.fila + 1] + 1e-9, "la pila atraviesa el entrepaño de arriba");
  }
  // Y la pila deja 2 cm arriba: sin ese aire la mano que repone no entra. En
  // la nevera, con 27,5 cm libres, van DOS vasos y no tres.
  const nev = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
  const enNevera = F.unidadesDePrueba({ venta: nev, empaque: { ...VASO, apilable: true }, donde: "todas", semilla: "x" });
  assert.deepEqual(enNevera.porFila.map((f) => f.pisos), [3, 2, 2, 3, 3], "la pila no deja aire arriba");
  for (const u of enNevera.unidades) {
    const tope = nev.filas.alturas[u.fila] + u.y + VASO.alto / 2;
    assert.ok(tope + 0.02 <= nev.filas.alturas[u.fila + 1] + 1e-9, "la pila toca el entrepaño de arriba");
  }
});

prueba("un envase que no entra de FONDO se dice así, no como ancho", () => {
  // La punta tiene 40 cm de fondo (y bandejas más bajas de fondo arriba): un
  // envase de 45 cm de hondo no entra en ninguna, aunque de ancho sobra.
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const hondo = { ancho: 0.1, alto: 0.09, fondo: 0.45, forma: "caja" };
  const r = F.unidadesDePrueba({ venta: v, empaque: hondo, donde: "todas", semilla: "x" });
  const conAlto = r.porFila.filter((f) => f.motivo !== "no-entra-alto");
  assert.ok(conAlto.length > 0 && conAlto.every((f) => f.motivo === "no-entra-fondo"),
    `el entrepaño dice ${conAlto.map((f) => f.motivo)}: se busca el problema en el ancho`);
  assert.ok(r.porFila.every((f, i) => f.fondo === v.filas.fondos[i]), "la fila no lleva su fondo para decirlo");
  // Y uno ancho de verdad sigue diciendo «ancho».
  const ancho = F.unidadesDePrueba({ venta: v, empaque: { ...hondo, ancho: 1.2, fondo: 0.1 }, donde: "todas", semilla: "x" });
  assert.ok(ancho.porFila.filter((f) => f.motivo !== "no-entra-alto").every((f) => f.motivo === "no-entra-ancho"));
});

prueba("la botella en la nevera: entra donde entra y el resto lo dice", () => {
  const v = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
  const libres = v.filas.alturas.slice(1).map((y, i) => enMetros(y - v.filas.alturas[i]));
  assert.deepEqual(libres, [0.3, 0.275, 0.275, 0.3, 0.31]);
  const dos = { ancho: 0.105, alto: 0.33, fondo: 0.105, forma: "botella" };
  const r = F.unidadesDePrueba({ venta: v, empaque: dos, donde: "todas", semilla: "s" });
  assert.deepEqual(r.porFila.map((f) => f.frentes), [0, 0, 0, 0, 0]);
  assert.ok(r.porFila.every((f) => f.motivo === "no-entra-alto"));
  assert.equal(r.unidades.length, 0, "se paró una botella de 33 cm en 31 cm");
  // Acostada —la opción que ofrece el panel— entran tres por rejilla.
  const ficha = { forma: "botella", alto_mm: 330, ancho_mm: 105, fondo_mm: 105, apilable: false, acostado: false, fondo_foto: "auto" };
  const acostada = P.empaqueDeArte({ nombre: "Manzana Postobón 2 L", categoria: "Gaseosas" }, ficha,
    { aspecto: 0.27, relleno: 0.86, simetria: 0.02 }, { acostado: true });
  const ac = F.unidadesDePrueba({ venta: v, empaque: acostada, donde: "todas", semilla: "s" });
  assert.deepEqual(ac.porFila.map((f) => f.frentes), [3, 3, 3, 3, 3], "acostada no entran tres por rejilla");
  const litro = { ancho: 0.09, alto: 0.3, fondo: 0.09, forma: "botella" };
  const l = F.unidadesDePrueba({ venta: v, empaque: litro, donde: "todas", semilla: "s" });
  assert.deepEqual(l.porFila.map((f) => f.frentes), [11, 0, 0, 11, 11]);
  // Y apoyada en la rejilla, no en el plano del entrepaño.
  assert.ok(l.porFila.every((f, i) => Math.abs(f.apoyo - (v.filas.alturas[i] + M.SOBRE_REJILLA)) < 1e-12));
  // La de 30 cm en 30 cm libres no asoma la tapa por la rejilla de arriba:
  // se hunde en el alambre lo justo, y nunca por debajo del plano del estante.
  for (const u of l.unidades) {
    const f = l.porFila[u.fila];
    const base = f.apoyo + u.y - litro.alto / 2, tope = f.apoyo + u.y + litro.alto / 2;
    assert.ok(tope <= v.filas.alturas[u.fila + 1] + 1e-9, `fila ${u.fila}: la tapa asoma ${((tope - v.filas.alturas[u.fila + 1]) * 1000).toFixed(1)} mm`);
    assert.ok(base >= v.filas.alturas[u.fila] - 1e-9, `fila ${u.fila}: la botella atraviesa su estante`);
  }
  // Con aire de sobra, sigue parada sobre el alambre.
  const chica = F.unidadesDePrueba({ venta: v, empaque: { ...litro, alto: 0.2 }, donde: "todas", semilla: "s" });
  assert.ok(chica.unidades.every((u) => Math.abs(u.y - 0.1) < 1e-12), "una botella chica se hundió en la rejilla");
});

prueba("la bolsa en el robatope: una por repisa, tres de fondo", () => {
  const v = V.ventaDeTipo("robatope", 0.3, 0.4, 1.6);
  const bolsa = { ancho: 0.14, alto: 0.23, fondo: 0.06, forma: "bolsa" };
  const r = F.unidadesDePrueba({ venta: v, empaque: bolsa, donde: "todas", semilla: "ROB-01|A|4" });
  assert.deepEqual(r.porFila.map((f) => f.frentes), [1, 1, 1, 1]);
  assert.ok(r.porFila.every((f) => f.fondoVisible === 3));
  // Centrada en la repisa: ya no hay media bolsa cortada al borde.
  for (const u of r.unidades) assert.ok(Math.abs(u.x) + bolsa.ancho / 2 <= v.vanos[0].ancho / 2 + 0.002);
});

prueba("acostadas, dos botellas vecinas no se meten una en otra", () => {
  const v = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
  const ficha = { forma: "botella", alto_mm: 330, ancho_mm: 105, fondo_mm: 105, apilable: false, acostado: false, fondo_foto: "auto" };
  const e = P.empaqueDeArte({ nombre: "Manzana Postobón 2 L", categoria: "Gaseosas" }, ficha,
    { aspecto: 0.27, relleno: 0.86, simetria: 0.02 }, { acostado: true });
  const r = F.unidadesDePrueba({ venta: v, empaque: e, donde: "todas", semilla: "NEV-01|A|2" });
  assert.ok(r.unidades.length > 0);
  // Por fila, profundidad y piso, las cajas a lo ancho no se tocan: el pico
  // de una no entra en la base de la otra (1 cm de aire, al menos).
  const grupos = new Map();
  for (const u of r.unidades) {
    const k = `${u.fila}|${u.prof}|${u.piso}`;
    grupos.set(k, [...(grupos.get(k) ?? []), u]);
  }
  for (const [k, us] of grupos) {
    us.sort((a, b) => a.x - b.x);
    for (let i = 1; i < us.length; i++) {
      // Con el giro, la caja que ocupa a lo ancho crece cos·largo + sen·diámetro.
      const ocupa = (u) => e.ancho * Math.cos(u.giroY) + e.fondo * Math.abs(Math.sin(u.giroY));
      const aire = us[i].x - us[i - 1].x - (ocupa(us[i]) + ocupa(us[i - 1])) / 2;
      assert.ok(aire >= 0.008, `${k}: dos botellas acostadas a ${(aire * 1000).toFixed(1)} mm`);
    }
  }
  // Y casi derechas: girarlas las cruza en la rejilla.
  assert.ok(r.unidades.every((u) => Math.abs(u.giroY) <= (0.5 * Math.PI) / 180 + 1e-12));
});

prueba("el vaso se apila de a tres y la botella parada gira como en la tienda", () => {
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const ficha = { forma: "vaso", alto_mm: 90, ancho_mm: 75, fondo_mm: 75, apilable: true, acostado: false, fondo_foto: "auto" };
  const vaso = P.empaqueDeArte({ nombre: "Finesse", categoria: "Lácteos" }, ficha, { aspecto: 0.81, relleno: 0.78, simetria: 0.01 });
  const r = F.unidadesDePrueba({ venta: v, empaque: vaso, donde: "todas", semilla: "PUN-01|A|1" });
  // De a tres (segunda ronda): de a dos la punta quedaba con un 35 % de aire
  // sobre cada entrepaño, medio surtida. 3 × 9 cm entran en 30 cm con el
  // aire de la mano.
  assert.deepEqual(r.porFila.map((f) => f.pisos), [3, 3, 3, 3, 0], "el vaso no llena el entrepaño");
  // Redondo parado: hasta 5° de frente y 8° atrás —cuarenta etiquetas
  // mirando exactamente al frente se leen como un lineal clonado—, con los
  // ±2 mm a lo ancho que no lo meten en el de al lado.
  const grados = r.unidades.map((u) => (Math.abs(u.giroY) * 180) / Math.PI);
  assert.ok(r.unidades.every((u, i) => grados[i] <= (u.prof === 0 ? 5 : 8) + 1e-9));
  assert.ok(Math.max(...grados.filter((_, i) => r.unidades[i].prof === 0)) > 2.5, "la botella sigue sin girar");
  // Los huecos de reposición son sólo atrás: el frente está completo.
  for (let i = 0; i < 4; i++) {
    const frente = r.unidades.filter((u) => u.fila === i && u.prof === 0 && u.piso === 0).length;
    assert.equal(frente, r.porFila[i].frentes, `al frente del entrepaño ${i} falta producto`);
  }
  // Ninguna unidad se mete en la de adelante o la de atrás: una columna
  // corrida se corre entera.
  const vano = v.vanos[0];
  const ac = P.acomodar(vano.ancho, v.filas.fondos[0], v.filas.alturas[1] - v.filas.alturas[0], vaso);
  const columnas = new Map();
  for (const u of r.unidades.filter((x) => x.piso === 0)) {
    const k = `${u.fila}|${Math.round((u.x - vano.x) / ac.pasoX * 2)}`;
    columnas.set(k, [...(columnas.get(k) ?? []), u]);
  }
  for (const [k, us] of columnas) {
    us.sort((a, b) => a.prof - b.prof);
    for (let i = 1; i < us.length; i++) {
      assert.ok(us[i].z - us[i - 1].z >= vaso.fondo - 0.001, `${k}: dos vasos uno dentro del otro`);
    }
    for (const u of us) assert.ok(-u.z + vaso.fondo / 2 <= v.filas.fondos[u.fila] + 1e-9, `${k}: se sale por atrás`);
  }
});

prueba("la nevera acomoda sus rejillas para el producto, sin inventar ninguna", () => {
  const v = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
  const libresDe = (f) => f.alturas.slice(1).map((y, i) => y - f.alturas[i]);
  // La de 2 L no entraba parada en ninguna: con las rejillas acomodadas, en todas.
  const dos = F.rejillasParaProducto(v.filas, 0.33);
  assert.ok(dos, "no ofrece acomodar las rejillas para la de 2 L");
  assert.ok(dos.rows >= 1 && dos.rows <= v.filas.rows, `inventó rejillas: ${dos.rows}`);
  assert.ok(libresDe(dos).every((l) => l >= 0.33 + 0.005), `no entra en ${libresDe(dos)}`);
  assert.equal(dos.alturas[0], v.filas.alturas[0], "movió la primera rejilla");
  assert.equal(dos.alturas[dos.rows], v.filas.alturas[v.filas.rows], "movió el techo");
  const botella = { ancho: 0.105, alto: 0.33, fondo: 0.105, forma: "botella" };
  const r = F.unidadesDePrueba({ venta: { ...v, filas: dos }, empaque: botella, donde: "todas", semilla: "s" });
  assert.ok(r.porFila.every((f) => f.frentes > 0 && f.motivo === null), "con las rejillas acomodadas sigue sin entrar");
  // La de 1,5 L dejaba vacías las del medio: ahora van todas.
  const litro = F.rejillasParaProducto(v.filas, 0.30);
  assert.ok(litro && libresDe(litro).every((l) => l >= 0.305));
  // Si ya entra en todas no se toca nada; si ni así entra, tampoco.
  assert.equal(F.rejillasParaProducto(v.filas, 0.09), null);
  assert.equal(F.rejillasParaProducto(v.filas, 2), null);
  // La nevera dibuja ESAS rejillas, y el producto apoya en ellas.
  const nevera = cuerpoDe("function NeveraRefrescosMesh(", "function StandFrutasMesh(");
  assert.match(nevera, /niveles=\{enPrueba && facePaint\?\.pruebaA\?\.filas\s*\? facePaint\.pruebaA\.filas\.alturas\.slice\(0, -1\) : undefined\}/);
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /venta: p\.filas \? \{ \.\.\.venta, filas: p\.filas \} : venta/);
  const fp = cuerpoDe("const facePaintById = useMemo(", "const handleOrbitReady");
  assert.match(fp, /como\?\.rejillas && empaque && !empaque\.acostado && fix\.type === "nevera_refrescos"/);
});

prueba("el desorden de la prueba es determinista y chico", () => {
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const a = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: "todas", semilla: "PUN-01|A|1" });
  const b = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: "todas", semilla: "PUN-01|A|1" });
  const c = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: "todas", semilla: "PUN-01|A|2" });
  assert.deepEqual(a.unidades, b.unidades, "la misma semilla dio otro acomodo: el mueble titilaría");
  assert.notDeepEqual(a.unidades, c.unidades, "otra semilla dio el mismo acomodo");
  // Contra la grilla sin desorden: ±2 mm a lo ancho (menos que la luz de
  // 4 mm entre dos: no se tocan) y ±2° de giro.
  const vano = v.vanos[0];
  for (const u of a.unidades) {
    const ac = P.acomodar(vano.ancho, v.filas.fondos[u.fila], v.filas.alturas[u.fila + 1] - v.filas.alturas[u.fila], VASO);
    const desde = vano.x - ac.ocupado / 2 + VASO.ancho / 2;
    const f = Math.round((u.x - desde) / ac.pasoX);
    assert.ok(Math.abs(u.x - (desde + f * ac.pasoX)) <= 0.002 + 1e-12, `dx = ${u.x - (desde + f * ac.pasoX)}`);
    assert.ok(Math.abs(u.giroY) <= (2 * Math.PI) / 180 + 1e-12, `giro de ${(u.giroY * 180) / Math.PI}°`);
    if (u.prof === 0) assert.ok(Math.abs(u.giroY) <= (0.9 * Math.PI) / 180 + 1e-12, "el frente gira más que lo de atrás");
    const base = F.TONO_POR_FONDO[Math.min(u.prof, 2)];
    assert.ok(u.tono <= base * 1.03 + 1e-12 && u.tono >= base * 0.97 - 1e-12, `tono ${u.tono} en la fila ${u.prof}`);
  }
  // Lo de atrás se lee atrás: la segunda un 18 % y la tercera un 32 % más
  // oscuras (con un 12 % por fila la crítica midió las tapas de atrás casi
  // iguales a las del frente).
  assert.deepEqual([...F.TONO_POR_FONDO], [1, 0.82, 0.68]);
  assert.ok(F.TONO_POR_FONDO[2] <= 0.85 * F.TONO_POR_FONDO[0], "la tercera fila no cae ni un 15 %");
});

// ── El envase 3D con etiqueta ───────────────────────────────────────────────
//
// La geometría se compila con three adentro y se CORRE: lo que importa es dónde
// cae la foto en cada vértice, y eso no se lee del código.

const compiladoG = await build({
  entryPoints: [join(raiz, muebles, "perfiles.ts")],
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
});
const G = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoG.outputFiles[0].text).toString("base64")
);

const compiladoLV = await build({
  entryPoints: [join(raiz, muebles, "luzDeVenta.ts")],
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
});
const LV = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoLV.outputFiles[0].text).toString("base64")
);

/** Los vértices de una geometría con su posición, normal y uv. */
function vertices(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  return Array.from({ length: p.count }, (_, i) => ({
    x: p.getX(i), y: p.getY(i), z: p.getZ(i),
    nx: n?.getX(i) ?? 0, ny: n?.getY(i) ?? 0, nz: n?.getZ(i) ?? 0,
    u: uv.getX(i), v: uv.getY(i),
  }));
}

prueba("la caja lleva la foto derecha en el frente y su borde en los costados", () => {
  const W = 0.19, H = 0.27, D = 0.065;
  const vs = vertices(G.geometriaDeEtiqueta("caja", W, H, D));
  const frente = vs.filter((v) => v.nz < -0.5);
  assert.ok(frente.length >= 4, "la caja no tiene cara −Z");
  // Quien mira desde −Z tiene la derecha en −X: ahí va el borde derecho de la foto.
  for (const v of frente) {
    if (Math.abs(v.x + W / 2) < 1e-9) assert.ok(Math.abs(v.u - 1) < 1e-6, `u=${v.u} en x=−ancho/2`);
    if (Math.abs(v.x - W / 2) < 1e-9) assert.ok(Math.abs(v.u) < 1e-6, `u=${v.u} en x=+ancho/2`);
    assert.ok(Math.abs(v.v - (0.5 + v.y / H)) < 1e-6, "la v del frente no crece con la altura");
  }
  // Los costados toman una franja del 2 % del borde de la foto, no la foto entera.
  for (const v of vs.filter((x) => Math.abs(x.nx) > 0.5)) {
    assert.ok(v.nx < 0 ? v.u >= 0.98 - 1e-6 : v.u <= 0.02 + 1e-6, `costado con u=${v.u}`);
  }
  for (const v of vs.filter((x) => Math.abs(x.ny) > 0.5)) {
    assert.ok(v.ny > 0 ? v.v >= 0.98 - 1e-6 : v.v <= 0.02 + 1e-6, `tapa o base con v=${v.v}`);
  }
});

prueba("la botella torneada mira a −Z con el centro de la foto adelante", () => {
  const perfil = Array.from({ length: 24 }, (_, k) => (k > 18 ? 0.4 : 1));
  const g = G.geometriaDeEtiqueta("revolucion", 0.105, 0.33, 0.105, perfil, false, true);
  const vs = vertices(g);
  const zMin = Math.min(...vs.map((v) => v.z));
  const adelante = vs.filter((v) => Math.abs(v.z - zMin) < 1e-6 && Math.abs(v.x) < 1e-4);
  assert.ok(adelante.length > 0, "no hay vértice adelante en el eje");
  for (const v of adelante) assert.ok(Math.abs(v.u - 0.5) < 1e-3, `el frente de la botella tiene u=${v.u}`);
  // Torneada con la silueta: arriba (el cuello) es más angosta que el cuerpo.
  const ancho = (desde, hasta) => Math.max(...vs.filter((v) => v.y > desde && v.y < hasta).map((v) => Math.abs(v.x)));
  assert.ok(ancho(0.12, 0.164) < ancho(-0.1, 0) * 0.6, "el perfil de la foto no torneó el cuello");
  // 32 lados (16 se veían facetados de cerca): unos 1.700 triángulos.
  assert.ok(g.index ? g.index.count / 3 < 1800 : vs.length / 3 < 1800, "la botella pesa demasiado para instanciarse");
  // Las tapas van de UN color (un solo punto de la foto): con la proyección
  // plana repetían la primera fila estirada y salían rayadas.
  const tapa = vs.filter((v) => Math.abs(v.y - 0.165) < 1e-6 && Math.hypot(v.x, v.z) < 0.4 * 0.0525 * 0.99);
  assert.ok(tapa.length > 0, "la botella no tiene tapa");
  for (const v of tapa) assert.ok(Math.abs(v.u - 0.5) < 1e-6 && Math.abs(v.v - 0.985) < 1e-6, `tapa rayada: ${v.u},${v.v}`);
  // El costado no llega al borde exacto de la silueta (contorno y sangrado).
  const costado = vs.filter((v) => Math.abs(v.y) < 0.16);
  assert.ok(costado.every((v) => v.u > 0.02 && v.u < 0.98), "el costado toma el contorno de la foto");
});

prueba("la bolsa tiene el frente abombado y el recorte mira a −Z", () => {
  const W = 0.14, H = 0.23, D = 0.06;
  const vs = vertices(G.geometriaDeEtiqueta("almohada", W, H, D));
  const zCentro = Math.min(...vs.filter((v) => Math.abs(v.x) < 0.01 && Math.abs(v.y) < 0.01).map((v) => v.z));
  const zCanto = Math.min(...vs.filter((v) => Math.abs(Math.abs(v.x) - W / 2) < 1e-9).map((v) => v.z));
  assert.ok(zCentro <= -D / 2 + 1e-9, `el centro no llega al fondo de la bolsa: ${zCentro}`);
  assert.ok(zCentro < zCanto - D * 0.15, `la bolsa salió plana: centro ${zCentro} contra canto ${zCanto}`);
  // Los costados se afinan a CERO (la costura): con espesor, de tres cuartos
  // la bolsa era un ladrillo con un lomo de libro.
  const costados = vs.filter((v) => Math.abs(Math.abs(v.x) - W / 2) < 1e-6);
  assert.ok(costados.length > 0 && costados.every((v) => Math.abs(v.z) < 1e-6), "la bolsa tiene costados con espesor");
  // El sello de arriba es fino; el fondo, apoyado (con espesor). La posición
  // es Float32: se compara con tolerancia, o el filtro queda vacío y la
  // afirmación pasa sola.
  const arriba = vs.filter((v) => Math.abs(v.y - H / 2) < 1e-6).map((v) => Math.abs(v.z));
  const abajo = vs.filter((v) => Math.abs(v.y + H / 2) < 1e-6).map((v) => Math.abs(v.z));
  assert.ok(arriba.length > 0 && abajo.length > 0, "no se encontraron el sello ni el fondo");
  assert.ok(Math.max(...arriba) <= D * 0.04, "el sello de arriba es grueso");
  assert.ok(Math.max(...abajo) >= D * 0.3, "la bolsa se para sobre un filo");
  const recorte = vertices(G.geometriaDeEtiqueta("recorte", 0.1, 0.2, 0.05));
  assert.ok(recorte.every((v) => v.nz < -0.99), "el recorte no mira al pasillo");
  for (const v of recorte) assert.ok(Math.abs(v.u - (0.5 - v.x / 0.1)) < 1e-6, "el recorte salió espejado");
});

prueba("la etiqueta va por el caché y no se muta", () => {
  const a = G.geometriaDeEtiqueta("caja", 0.11, 0.19, 0.07);
  assert.equal(G.geometriaDeEtiqueta("caja", 0.11, 0.19, 0.07), a, "dos pedidos iguales dieron dos geometrías");
  // La firma no choca con la del relleno por rubro.
  assert.notEqual(G.geometriaDeEmpaque("caja", 0.11, 0.19, 0.07), a);
  // La acostada se arma de una COPIA de la de pie: la de pie queda igual.
  const perfil = Array.from({ length: 24 }, () => 1);
  const dePie = G.geometriaDeEtiqueta("revolucion", 0.105, 0.33, 0.105, perfil);
  const antes = Float32Array.from(dePie.attributes.position.array);
  const acostada = G.geometriaDeEtiqueta("revolucion", 0.33, 0.105, 0.105, perfil, true);
  assert.notEqual(acostada, dePie);
  assert.deepEqual(Float32Array.from(dePie.attributes.position.array), antes, "acostarla movió la de pie del caché");
  const xs = vertices(acostada).map((v) => v.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.32, "la botella acostada no quedó horizontal");
});

prueba("el tono neutro de la etiqueta se apoya en nombres de three que siguen ahí", () => {
  // `etiqueta.ts` reemplaza dos `#include` del shader del material estándar.
  // Si three los renombra, el parche deja de aplicarse en silencio: esto lo
  // dice antes de que se vea en una reunión.
  const shaders = join(raiz, "node_modules", "three", "src", "renderers", "shaders");
  const fisico = readFileSync(join(shaders, "ShaderLib", "meshphysical.glsl.js"), "utf8");
  assert.ok(fisico.includes("#include <tonemapping_fragment>"), "three ya no incluye tonemapping_fragment");
  assert.ok(fisico.includes("#include <emissivemap_fragment>"), "three ya no incluye emissivemap_fragment");
  const tono = readFileSync(join(shaders, "ShaderChunk", "tonemapping_pars_fragment.glsl.js"), "utf8");
  assert.match(tono, /vec3 NeutralToneMapping\(/, "three ya no define NeutralToneMapping");
  const color = readFileSync(join(shaders, "ShaderChunk", "color_pars_fragment.glsl.js"), "utf8");
  assert.match(color, /USE_COLOR[\s\S]*varying vec4 vColor/, "three cambió cómo llega el color de instancia");

  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(etiqueta, /customProgramCacheKey/, "el parche del shader no tiene clave de programa propia");
  assert.match(etiqueta, /#include <tonemapping_fragment>/);
  assert.ok(!/scene\.environment\s*=/.test(etiqueta), "la etiqueta cambia el entorno de TODA la tienda");
  assert.ok(!/\.toneMapping\s*=/.test(etiqueta), "la etiqueta cambia el tone mapping de TODA la tienda");
  assert.match(etiqueta, /envMap: entorno/, "el entorno del producto no va en su material");
});

prueba("en la pantalla de venta el mueble toma la luz del cuarto del producto, y sólo ahí", () => {
  // Medido en la segunda ronda: el blanco del envase en 232-240 sRGB contra
  // 97-112 del porta-precios. Con la luz del cuarto el mueble queda a la par.
  const shaders = join(raiz, "node_modules", "three", "src", "renderers", "shaders");
  const fisico = readFileSync(join(shaders, "ShaderLib", "meshphysical.glsl.js"), "utf8");
  // El parche usa `normal` ya en espacio de vista: el trozo de la emisión va
  // DESPUÉS del de la normal.
  assert.ok(fisico.indexOf("#include <normal_fragment_begin>") < fisico.indexOf("#include <emissivemap_fragment>"),
    "three mueve la emisión antes de la normal: el parche de la luz de venta lee una normal sin definir");
  const luz = sinComentarios(leer(join(muebles, "luzDeVenta.ts")));
  assert.match(luz, /#include <emissivemap_fragment>/);
  assert.match(luz, /customProgramCacheKey: \(\) => clave/, "el parche no tiene programa propio: se mezcla con el del editor");
  // Ni entorno de escena ni luz global: la tienda del editor no cambia, y el
  // mapa de entorno en cada mueble hacía cada cuadro 25 veces más caro.
  for (const [n, t] of [["luzDeVenta.ts", luz], ["piezas.tsx", piezasCodigo], ["NeveraReal.tsx", neveraCodigo]]) {
    assert.ok(!/scene\.environment\s*=|hemisphereLight|envMap:\s*luz/.test(t), `${n} ilumina toda la escena o muestrea un mapa de entorno por mueble`);
  }
  assert.match(piezasCodigo, /\.\.\.conLuzDeVenta\(luz\),/, "el herraje de la góndola y la punta no recibe la luz de venta");
  assert.match(piezasCodigo, /\}, \[ghost, statusColor, luz\]\);/, "los materiales no se rearman al entrar o salir de la pantalla de venta");
  // La escena la prende sólo para quien mira (Presentar y la lámina).
  assert.match(cuerpoEscena, /<LuzDeVenta\.Provider value=\{privadoPara !== undefined\}>/);
  // Ejecutado: en el editor no agrega nada; en venta, el parche suma la luz
  // después de la emisión, y sin el trozo no rompe el shader.
  assert.deepEqual(LV.conLuzDeVenta(false), {}, "el editor recibe la luz de venta");
  const venta = LV.conLuzDeVenta(true);
  const conTrozo = { fragmentShader: "a\n#include <emissivemap_fragment>\nb" };
  venta.onBeforeCompile(conTrozo);
  assert.match(conTrozo.fragmentShader, /#include <emissivemap_fragment>\n\{[\s\S]*totalEmissiveRadiance \+= diffuseColor\.rgb \* mix\(/);
  const sinTrozo = { fragmentShader: "a\nb" };
  venta.onBeforeCompile(sinTrozo);
  assert.equal(sinTrozo.fragmentShader, "a\nb");
  assert.notEqual(venta.customProgramCacheKey(), LV.conLuzDeVenta(true, 0.5).customProgramCacheKey());
});

prueba("el vaso lleva su tapa aparte y el costado sin la franja de tapa de la foto", () => {
  const perfil = Array.from({ length: 24 }, (_, k) => 0.8 + 0.2 * (k / 23));
  const ancho = 0.075, alto = 0.09, franja = 0.08;
  const g = G.geometriaDeEtiqueta("revolucion", ancho, alto, ancho, perfil, false, false, franja);
  assert.equal(g.groups.length, 2, "el vaso no separa costado y tapa");
  const [lado, tapa] = g.groups;
  assert.equal(lado.materialIndex, 0);
  assert.equal(tapa.materialIndex, 1);
  const vs = vertices(g);
  // Los grupos cuentan ÍNDICES: los vértices de cada uno, por el índice.
  const idx = g.index ? Array.from(g.index.array) : vs.map((_, i) => i);
  const deGrupo = (gr) => [...new Set(idx.slice(gr.start, gr.start + gr.count))].map((i) => vs[i]);
  const delLado = deGrupo(lado);
  const deLaTapa = deGrupo(tapa);
  // El costado no llega a la franja de tapa de la foto.
  assert.ok(Math.max(...delLado.map((v) => v.v)) <= 1 - franja + 1e-6, "el costado lleva pintada la tapa de la foto: doble tapa");
  // La tapa: sólo arriba y abajo, proyectada desde arriba dentro de la textura.
  assert.ok(deLaTapa.every((v) => Math.abs(Math.abs(v.y) - alto / 2) < 1e-6), "la tapa se mete en el costado");
  assert.ok(deLaTapa.every((v) => v.u >= -1e-6 && v.u <= 1 + 1e-6 && v.v >= -1e-6 && v.v <= 1 + 1e-6));
  // 32 lados: a 150 px el borde se aparta del círculo menos de medio píxel
  // (con 16 se veían las facetas).
  const borde = delLado.filter((v) => Math.abs(v.y - alto / 2) < 1e-6);
  const angulos = new Set(borde.map((v) => Math.round((Math.atan2(v.z, v.x) * 180) / Math.PI)));
  assert.ok(angulos.size >= 32, `el vaso tiene ${angulos.size} lados`);
  // Y liviano, con índice: 360 vasos en una punta se dibujan de una vez, y
  // sin índice cada cuadro triplicaba los vértices.
  assert.ok(g.index, "el vaso va sin índice");
  assert.ok(g.index.count / 3 < 1300, `el vaso pesa ${g.index.count / 3} triángulos`);
  // El canto del reborde, vivo: la tapa mira derecho para arriba.
  assert.ok(deLaTapa.filter((v) => v.y > 0).every((v) => Math.abs(v.ny - 1) < 1e-6), "la tapa promedia su normal con el costado");
  // El caché distingue la franja; la botella no lleva tapa aparte.
  assert.notEqual(G.geometriaDeEtiqueta("revolucion", ancho, alto, ancho, perfil, false, false, 0.02), g);
  assert.equal(G.geometriaDeEtiqueta("revolucion", 0.1, 0.3, 0.1, perfil, false, true).groups.length, 0);
  // Y quien dibuja le pasa la franja de la foto y los dos materiales.
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /vaso \? p\.etiqueta!\.tapa\(\)\.franja : 0/);
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(etiqueta, /if \(envase === "revolucion" && !transparente\) \{\s*lista\.push\(materialConLuz\(envase, entorno, \{\s*map: et\.texturaDeTapa\(\)/,
    "la tapa del vaso no tiene su material");
});

prueba("lo de atrás va con pocas facetas, y un mueble lleno tiene tope de triángulos", () => {
  // La revisión de la tercera ronda: una góndola doble de 3,6 m con un vaso
  // apilable eran 3.708 envases y 4,7 M de triángulos —sólo 1.260 al
  // frente—. Una PC con video integrado que comparte pantalla giraba a tirones.
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const recto = Array.from({ length: 24 }, (_, k) => 0.8 + 0.2 * (k / 23));
  const curvo = Array.from({ length: 24 }, (_, k) => (k < 14 ? 1 : k < 18 ? 1 - (k - 13) * 0.15 : 0.35));
  const vasoAlto = G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, recto, false, false, 0.04);
  const vasoBajo = G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, recto, false, false, 0.04, "bajo");
  assert.notEqual(vasoBajo, vasoAlto, "el caché confunde el detalle");
  assert.equal(vasoBajo.groups.length, 2, "el vaso de atrás perdió la tapa aparte");
  assert.ok(tris(vasoBajo) <= 200, `el vaso de atrás pesa ${tris(vasoBajo)} triángulos`);
  // Un vaso de perfil recto (un cono truncado) no necesita dieciséis filas.
  assert.ok(tris(vasoAlto) <= 520, `el vaso recto del frente pesa ${tris(vasoAlto)}`);
  const vasoCurvo = G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, curvo, false, false, 0.04);
  const botAlta = G.geometriaDeEtiqueta("revolucion", 0.1, 0.31, 0.1, curvo, false, true);
  const botBaja = G.geometriaDeEtiqueta("revolucion", 0.1, 0.31, 0.1, curvo, false, true, 0, "bajo");
  assert.ok(tris(botBaja) <= 320, `la botella de atrás pesa ${tris(botBaja)}`);
  // La botella de atrás llega hasta el pico como la del frente: arriba, el
  // borde del pico, el labio y el centro de la tapa.
  const radiosArriba = (g) => {
    const p = g.attributes.position, r = new Set();
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getY(i) - 0.155) < 1e-6) r.add(Math.hypot(p.getX(i), p.getZ(i)).toFixed(5));
    }
    return r.size;
  };
  assert.equal(radiosArriba(botBaja), radiosArriba(botAlta), "la botella de atrás quedó sin pico");
  // El tope, con la cuenta que dibuja: al frente el detalle alto, atrás el bajo.
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  const vaso = { forma: "botella", ancho: 0.075, alto: 0.09, fondo: 0.075, apilable: true, pisosMaximos: 3 };
  const r = F.unidadesDePrueba({ venta: v, empaque: vaso, donde: "todas", semilla: "x" });
  const frente = r.unidades.filter((u) => u.prof === 0).length * v.caras.length;
  const atras = r.unidades.filter((u) => u.prof > 0).length * v.caras.length;
  assert.ok(frente + atras > 3000, "la góndola de 3,6 m ya no es el peor caso");
  const conRecto = frente * tris(vasoAlto) + atras * tris(vasoBajo);
  const conCurvo = frente * tris(vasoCurvo) + atras * tris(vasoBajo);
  assert.ok(conRecto <= 1.2e6, `la góndola de 3,6 m con vasos rectos pesa ${(conRecto / 1e6).toFixed(2)} M de triángulos`);
  assert.ok(conCurvo <= 2.2e6, `con vasos de perfil curvo pesa ${(conCurvo / 1e6).toFixed(2)} M`);
  // Y quien dibuja usa la geometría baja para lo de atrás.
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /<Unidades\s*unidades=\{f\.atras\}\s*geometria=\{c\.geometriaAtras\}/, "lo de atrás se dibuja con el detalle del frente");
  assert.match(dp, /const geometriaAtras = e\.envase === "revolucion" \? geometriaCon\("bajo"\) : geometria;/);
  assert.match(dp, /atras: unidades\.filter\(\(u\) => u\.prof > 0\)/);
});

prueba("entrar y salir de Presentar no deja materiales ni texturas sin soltar", () => {
  // Cada entrada y salida rehacía los materiales de cada mueble y, en cada
  // nevera, una textura de alambre nueva: 20 neveras y diez entradas eran
  // 200 texturas y ~1.800 materiales vivos en la GPU.
  const nevera = sinComentarios(leer(join(muebles, "NeveraReal.tsx")));
  const luz = sinComentarios(leer(join(muebles, "luzDeVenta.ts")));
  assert.match(luz, /export function useSoltarMateriales[\s\S]{0,160}?\{\s*useEffect\(\(\) => \(\) => \{ for \(const x of Object\.values\(m\)\) x\?\.dispose\(\); \}, \[m\]\);/,
    "los materiales viejos no se sueltan");
  assert.match(nevera, /useSoltarMateriales\(m\);/, "la nevera no suelta sus materiales");
  assert.match(piezas, /useSoltarMateriales\(m\);/, "la góndola y la punta no sueltan sus materiales");
  assert.match(nevera, /const ya = alambres\.get\(varillas\);\s*if \(ya\) return ya;/, "cada nevera crea su textura de alambre");
  assert.match(nevera, /alambre: luz && !ghost && multideck \?/, "la nevera de puertas arma la rejilla de alambre que no usa");
});

prueba("cada fila del producto apoya en una sombra de contacto", () => {
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  // Dentro del grupo de la fila (se inclina con el entrepaño), bajo las
  // unidades del frente y del piso de abajo.
  assert.match(dp, /<TiraDeFila\s*unidades=\{f\.delFrente\}/, "la fila no lleva su sombra de contacto");
  assert.match(dp, /delFrente: unidades\.filter\(\(u\) => u\.piso === 0 && u\.prof === 0\)/);
  const i = dp.indexOf("<group key={f.fila} position={[0, f.apoyo, 0]} rotation={[f.giro, 0, 0]}>");
  const j = dp.indexOf("</group>", i);
  assert.ok(i > 0 && dp.slice(i, j).includes("<TiraDeFila"), "la sombra de la fila no es hija de la fila");
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  const tira = etiqueta.slice(etiqueta.indexOf("export function tiraDeContacto"));
  assert.match(tira, /depthWrite: false/);
  assert.match(tira, /opacity: 0\.36/);
});

prueba("la lámina usa las tomas de venta, con fondo de sala, y deja la cámara donde estaba", () => {
  const lamina = cuerpoDe("const exportarPropuesta = useCallback(", "const selectedSlot = selectedFix");
  // «Hoy» y «Con …» desde la toma de frente con aire, y una tercera «De cerca».
  const frente = lamina.indexOf('pedirToma(fix.id, cara, "frente", HOLGURA_DE_LAMINA)');
  assert.ok(frente > 0 && frente < lamina.indexOf("setSinArte(true);"), "la lámina saca «Hoy» con la cámara que haya quedado");
  assert.match(lamina, /pedirToma\(fix\.id, cara, "cerca"\)/, "la lámina no lleva la toma de cerca");
  assert.match(lamina, /\{ titulo: "De cerca", dataUrl: deCerca \}/);
  // Cada toma espera a que la escena la confirme: con dos cuadros fijos
  // «Con Alpina» salía sin el producto.
  assert.match(lamina, /await esperarEscena\(\(e\) => !e\.sinArte\);/, "«Con …» se saca antes de que el producto llegue a la escena");
  assert.match(lamina, /await esperarEscena\(\(e\) => e\.toma === n\);/);
  assert.match(editorCodigo, /estadoDeEscena\.current\.sinArte = sinArte;/);
  assert.match(editorCodigo, /estadoDeEscena\.current\.toma = pedidoDeToma\.n;/);
  // El fondo: el lienzo es transparente y el PNG salía con cielo blanco.
  assert.match(lamina, /prepararToma\(dataUrl, aspecto, FONDO_DE_SALA\)/);
  assert.match(editorCodigo, /style=\{\{ background:FONDO_DE_SALA,/, "la sala de la pantalla y la de la lámina no son la misma");
  // La cámara vuelve.
  assert.match(lamina, /finally \{[\s\S]*ctrl\.object\.position\.copy\(camaraDeAntes\.pos\);[\s\S]*ctrl\.target\.copy\(camaraDeAntes\.mira\);/,
    "la lámina deja la cámara en la toma de cerca");
});

prueba("la etiqueta opaca sale del rgba del recorte, no del lienzo", () => {
  // El canvas 2D guarda el color premultiplicado: releer un lienzo con alfa
  // devuelve NEGRO en lo transparente, que es justo donde el recorte dejó el
  // sangrado y el color de la marca. Así salían negras las tapas de las
  // cajas y la base de las botellas.
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  // Se lee UNA vez: la foto recién dibujada, sin alfa todavía.
  // (La otra lectura es la tapa del vaso, un lienzo opaco recién dibujado.)
  assert.deepEqual(etiqueta.match(/\w+\.getImageData\([^)]*\)/g), ["g.getImageData(0, 0, N, N)", "g.getImageData(0, 0, w, h)"],
    "una textura relee un lienzo premultiplicado");
  assert.match(etiqueta, /function dibujarTapa\([\s\S]*?g\.fillRect\(0, 0, N, N\);[\s\S]*?g\.getImageData\(0, 0, N, N\)/,
    "la tapa relee un lienzo que no pintó entero");
  // Todas las variantes salen del rgba del recorte, con el borde encogido.
  assert.match(etiqueta, /const conBorde = \(\) => \(borde \?\?= erosionarYSangrar\(recorte, 2, 8\)\)/,
    "las texturas no salen del rgba del recorte con el borde limpio");
  assert.match(etiqueta, /texturaOpaca: \(\) => una\("opaca", \(\) => aplanar\(conBorde\(\)\)\)/);
  assert.match(etiqueta, /texturaConAlfa: \(\) => una\("alfa", conBorde\)/);
  // La botella encoge 4 px: con 2 quedaba un serrucho blanco en la base.
  assert.match(etiqueta, /texturaDeBotella: \(\) => una\("botella", \(\) => aplanar\(llenarBotella\(erosionarYSangrar\(recorte, 4, 10\)\)\)\)/);
  assert.match(etiqueta, /const r = rectificarCaja\(conBorde\(\)\);/, "la caja no endereza la foto en tres cuartos");
});

prueba("cada envase lleva su textura: la caja con costado liso, la bolsa con alfa", () => {
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  const mat = etiqueta.slice(etiqueta.indexOf("export function materialDeEtiqueta("));
  assert.match(mat, /const conAlfa = envase === "recorte" \|\| envase === "almohada";/,
    "la bolsa no recorta la silueta de la foto");
  assert.match(mat, /envase === "caja" \? et\.texturaDeCaja\(\)/, "la caja no usa el frente enderezado");
  assert.match(mat, /transparente \? et\.texturaDeBotella\(\) : et\.texturaOpaca\(\)/);
  // El costado de la caja: un color con degradé, NO el borde de la foto.
  assert.match(mat, /new THREE\.Color\(et\.colorDeCostado\(\)\)/);
  assert.match(mat, /\{ color, emissive: color, vertexColors: true \}/);
  // La caja parada tiene los dos grupos; la lista sin grupos no dibuja nada.
  const caja = G.geometriaDeEtiqueta("caja", 0.19, 0.27, 0.065);
  assert.deepEqual(caja.groups.map((g) => [g.start, g.count, g.materialIndex]), [[0, 24, 1], [24, 12, 0]],
    "la foto se estira otra vez sobre los costados de la caja");
  assert.ok(caja.attributes.color, "el costado no se oscurece hacia atrás");
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /geometria\.groups\.length > 0 \? materiales : materiales\[0\]/);
});

prueba("el producto de prueba cuelga del mueble y gira con sus entrepaños", () => {
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /unidadesDePrueba\(/, "el producto de prueba acomoda por su cuenta");
  assert.match(dp, /position=\{\[0, 0, c\.cara\.montaje\]\}/, "la cara no se cuelga de su montaje");
  assert.match(dp, /rotation=\{\[0, c\.cara\.hacia === 1 \? Math\.PI : 0, 0\]\}/, "la cara B no se gira");
  assert.match(dp, /position=\{\[0, f\.apoyo, 0\]\} rotation=\{\[f\.giro, 0, 0\]\}/,
    "la fila no gira con su entrepaño");
  assert.match(dp, /venta\.grupoGiro/, "el robatope no gira el producto con sus repisas");
  assert.ok(!/Math\.(sin|cos)\(/.test(dp), "el producto de prueba replica la matemática de ubicación");
  assert.ok(!/castShadow(?!=\{false\})/.test(dp), "el envase tira sombras que el mapa de la tienda no resuelve");
});

prueba("cada mueble con prueba la dibuja y le apaga el relleno donde va", () => {
  const gon = cuerpoGondolaMesh;
  assert.match(gon, /<ProductoDePrueba[\s\S]{0,120}venta=\{ventaGondola\}/, "la góndola no dibuja la prueba");
  assert.match(gon, /\{!pinta && \(\s*<ProductoEnGondola[\s\S]{0,200}cubiertas=\{cubiertasDe\(/,
    "la góndola dibuja el relleno debajo de la prueba");
  const pun = cuerpoPuntaMesh;
  assert.match(pun, /<ProductoDePrueba venta=\{ventaPunta\}/, "la punta no dibuja la prueba");
  assert.match(pun, /\{!pinta && \(\s*<ProductoEnPunta[\s\S]{0,200}cubiertas=\{cubiertasDe\(/,
    "la punta dibuja el relleno debajo de la prueba");
  const rob = cuerpoDe("function RobatopeMesh(", "function RistraMesh(");
  assert.match(rob, /<ProductoDePrueba venta=\{ventaRobatope\}/, "el robatope no dibuja la prueba");
  assert.match(rob, /\{!pinta && !enPrueba && \(\s*<ProductoEnRepisas/, "el robatope dibuja la prueba y el relleno");
  assert.match(cuerpoNeveraMesh, /<ProductoDePrueba venta=\{ventaNevera\}/, "la nevera no dibuja la prueba");
});

// «Arte o relleno, nunca las dos cosas», CORRIDO: la guarda de arriba sólo
// buscaba el texto `cubiertas={cubiertasDe(`, y con `cubiertasDe` devolviendo
// siempre [null, null] —o con ProductoEnMueble sin pasarle `cubiertas` a
// `rellenoPorRubro`— seguía en verde mientras el relleno de Nutresa se
// dibujaba debajo de los vasos de Alpina. Se compilan ProductoEnGondola y
// ProductoEnPunta con un React mínimo (los componentes se llaman como
// funciones) y se cuentan las instancias que dibujarían, cara por cara.
const compiladoPM = await build({
  stdin: {
    contents: `export { ProductoEnGondola } from "./ProductoEnGondola"; export { ProductoEnPunta } from "./ProductoEnPunta";`,
    resolveDir: join(raiz, muebles), loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "react-minimo",
    setup(b) {
      b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (a) => ({ path: a.path, namespace: "react-minimo" }));
      b.onLoad({ filter: /.*/, namespace: "react-minimo" }, (a) => ({
        contents: a.path === "react"
          ? "export const memo = (f) => f; export const useMemo = (f) => f(); export const useEffect = () => {};" +
            "export const createContext = (v) => ({ v }); export const useContext = (c) => c.v;"
          : "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = 'frag';",
        loader: "js",
      }));
    },
  }],
});
const PM = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoPM.outputFiles[0].text).toString("base64")
);
/** Las instancias que dibujaría un árbol: llama los componentes y, en cada
 *  `instancedMesh`, su `ref` con un nodo falso que anota las matrices. */
function instanciasDe(el) {
  if (el == null || typeof el !== "object") return [];
  if (Array.isArray(el)) return el.flatMap(instanciasDe);
  if (typeof el.type === "function") return instanciasDe(el.type(el.props));
  const propias = [];
  if (el.type === "instancedMesh" && typeof el.props.ref === "function") {
    el.props.ref({
      setMatrixAt: (i, mat) => propias.push({ x: mat.elements[12], y: mat.elements[13], z: mat.elements[14] }),
      instanceMatrix: {}, computeBoundingSphere() {},
    });
  }
  return [...propias, ...instanciasDe(el.props?.children)];
}

prueba("arte o relleno, CORRIDO: la cara probada no lleva relleno y la otra sí", () => {
  // cubiertasDe, de la pintura de la cara a lo que se tapa.
  assert.deepEqual(F.cubiertasDe({ pruebaA: { donde: [1, 2] }, pruebaB: null }, false), [[1, 2], null]);
  assert.deepEqual(F.cubiertasDe({ pruebaA: { donde: "todas" }, pruebaB: { donde: [0] } }, false), ["todas", [0]]);
  assert.deepEqual(F.cubiertasDe({ pruebaA: { donde: [3] }, pruebaB: { donde: [0] } }, true), [[3], null], "el mural tapa una cara que no tiene");
  assert.deepEqual(F.cubiertasDe(null, false), [null, null]);
  // GON-01 con su cara A entera vendida a Nutresa (y la B también), probada
  // con Alpina en «Toda la cara» de la A: en la A, cero relleno; en la B, el
  // de siempre.
  const slots = [
    { id: "a", x: 0, w: 1, y: 0, h: 1, status: "occupied", brandCategory: "Galletas" },
  ];
  const base = { w: 1.2, d: 0.9, h: 1.8, esMural: false, slots };
  const sinPrueba = instanciasDe(PM.ProductoEnGondola(base));
  const conPrueba = instanciasDe(PM.ProductoEnGondola({ ...base, cubiertas: F.cubiertasDe({ pruebaA: { donde: "todas" } }, false) }));
  const caraA = (l) => l.filter((p) => p.z < 0).length, caraB = (l) => l.filter((p) => p.z > 0).length;
  assert.ok(caraA(sinPrueba) > 0 && caraB(sinPrueba) > 0, "sin prueba la góndola vendida no tiene relleno");
  assert.equal(caraA(conPrueba), 0, "el relleno de Nutresa se dibuja debajo de los vasos de Alpina");
  assert.equal(caraB(conPrueba), caraB(sinPrueba), "la prueba de la cara A le sacó el relleno a la B");
  // Por entrepaño: sólo esos se apagan.
  const filas = [...new Set(sinPrueba.filter((p) => p.z < 0).map((p) => p.y.toFixed(3)))].sort();
  const dos = instanciasDe(PM.ProductoEnGondola({ ...base, cubiertas: F.cubiertasDe({ pruebaA: { donde: [1, 2] } }, false) }));
  const filasDos = [...new Set(dos.filter((p) => p.z < 0).map((p) => p.y.toFixed(3)))].sort();
  assert.equal(filasDos.length, filas.length - 2, "«Por entrepaño» no apaga justo los elegidos");
  // La punta, igual (una sola cara).
  const pBase = { w: 0.9, d: 0.4, h: 1.8, slots };
  assert.ok(instanciasDe(PM.ProductoEnPunta(pBase)).length > 0);
  assert.equal(instanciasDe(PM.ProductoEnPunta({ ...pBase, cubiertas: F.cubiertasDe({ pruebaA: { donde: "todas" } }, true) })).length, 0,
    "la punta dibuja relleno debajo de la prueba");
});

// ── La prueba enchufada al editor (pasos 9 a 11) ────────────────────────────
//
// Lo que se afirma acá es lo que se pierde sin ruido: que la prueba no escriba
// el plano, que le gane a la foto en su cara, que Presentar no le muestre a un
// proveedor nada de los otros, y que la cámara de venta use la misma cuenta
// que dibuja el producto.

prueba("la prueba 3D le gana a la foto y al patrón en su cara, y sólo en ella", () => {
  assert.match(editorCodigo,
    /const TIPOS_CON_PRUEBA_3D = new Set<string>\(\["gondola", "punta", "nevera_refrescos", "robatope"\]\)/,
    "cambió en qué muebles se para el producto de prueba");
  const fp = cuerpoDe("const facePaintById = useMemo(", "const handleOrbitReady");
  assert.match(fp, /const en3D = TIPOS_CON_PRUEBA_3D\.has\(type\)/, "facePaintById no pregunta si el mueble lleva prueba 3D");
  assert.match(fp, /const pruebaA = en3D && arteA != null \? construirPrueba\(fix, "A", arteA\) : null/);
  assert.match(fp, /const pruebaB = en3D && arteB != null \? construirPrueba\(fix, "B", arteB\) : null/);
  assert.match(fp, /const front = pruebaA \? null : caraPintada\(arteA, fullCode, codeUC, fix\.brandCategory\)/,
    "la cara probada sigue pintando la foto del espacio debajo del producto");
  assert.match(fp, /const back = isDouble && !pruebaB\s*\? caraPintada\(arteB,/,
    "la cara B probada sigue pintando la foto del espacio");
  // En una pantalla privada la cara pinta SU arte o nada: ni el código del
  // espacio (su foto es la marca del que hoy lo tiene) ni el rubro.
  assert.match(fp, /\(privado\s*\? \(arte != null\s*\? resolveFaceMaterial\(arte, null, type, "",/,
    "una pantalla privada puede caer a la foto del espacio, que es de otro proveedor");
  // La foto que no cargó, o el arte que ya no está, no dejan la cara vacía:
  // `construirPrueba` devuelve null y la cara cae a la lámina de siempre.
  assert.match(fp, /if \(!arte\) return null;/, "un arte borrado deja la cara vacía");
  assert.match(fp, /if \(!etiqueta && \(estado === "error" \|\| estado === "reintentando"\)\) return null;/,
    "una foto que no cargó deja la cara vacía, sin producto ni lámina");
  // En una pantalla privada, sólo las pruebas del que mira.
  assert.match(fp, /const arteA = arteALaVista\(prueba\.get\(`\$\{fix\.id\}\|A`\), catalogo, privadoPara\);/,
    "Presentar dibuja las pruebas de otros proveedores");
  assert.match(fp, /const arteB = isDouble \? arteALaVista\(prueba\.get\(`\$\{fix\.id\}\|B`\), catalogo, privadoPara\) : null;/);
  assert.match(fp, /const privado = privadoPara !== undefined;/);
  assert.match(fp, /if \(front \|\| back \|\| pruebaA \|\| pruebaB\) map\.set\(fix\.id, \{ front, back, pruebaA, pruebaB \}\)/,
    "un mueble con sólo prueba se queda sin pintar");
  assert.match(fp, /marcarEnUso\(enUso\)/, "las etiquetas en prueba se pueden desalojar del caché");
  assert.match(fp, /etiquetaDeArte\(clave, arteUrl\(arteId\), modo, notifyTexLoaded\)/);
  // Sin `?? false`: hasta que la dueña toca «Mostrarla acostada», decide la
  // ficha del arte (`ficha.acostado`).
  assert.match(fp, /\{ acostado: como\?\.acostado \}/, "«acostada» no llega al envase");
  assert.match(fp, /catalogo, comoSePrueba, privadoPara\]\)/, "el memo no se rehace al cambiar la prueba o quién mira");
  assert.match(fp, /if \(sinArte\) return map;/, "el «Hoy» de la propuesta mostraría la prueba");
});

prueba("la pantalla que mira un proveedor muestra SÓLO lo suyo", () => {
  // Dos pruebas de dos proveedores en la misma sesión: Alpina en la punta y
  // Diana en el robatope. En Presentar para Diana se dibuja una sola.
  const catalogo = [
    { id: 1, supplier_id: 10, proveedor: "Alpina" },
    { id: 4, supplier_id: 70, proveedor: "Arroz Diana" },
  ];
  const prueba_ = new Map([["PUN-01|A", 1], ["ROB-01|A", 4]]);
  const vistas = (para) => [...prueba_.values()].map((id) => X.arteALaVista(id, catalogo, para)).filter((a) => a != null);
  assert.deepEqual(vistas(70), [4], "en la pantalla de Diana se ve el producto de Alpina");
  assert.deepEqual(vistas(10), [1]);
  assert.deepEqual(vistas(undefined), [1, 4], "la pantalla de la dueña perdió las pruebas");
  assert.deepEqual(vistas(null), [], "Presentar sin proveedor muestra pruebas de alguien");
  assert.equal(X.arteALaVista(99, catalogo, 70), null, "un arte que no está en el catálogo se muestra");
  // A quién se le presenta: el de la REUNIÓN primero. Con la reunión de
  // Diana, un arrastre que empezó sobre la punta de Alpina la elige, y
  // «Presentar» le pasaba la pantalla a Alpina delante de Diana.
  assert.equal(X.proveedorParaPresentar({ prueba: prueba_, catalogo, muebleId: "PUN-01", proveedorDeReunion: "Arroz Diana" }), 70,
    "con la reunión de Diana, «Presentar» muestra la punta de Alpina");
  assert.equal(X.proveedorParaPresentar({ prueba: prueba_, catalogo, muebleId: "ROB-01", proveedorDeReunion: "Alpina" }), 10);
  assert.equal(X.proveedorParaPresentar({ prueba: prueba_, catalogo, muebleId: "GON-02", proveedorDeReunion: "alpina " }), 10);
  // Sin reunión, el del mueble elegido.
  assert.equal(X.proveedorParaPresentar({ prueba: prueba_, catalogo, muebleId: "ROB-01", proveedorDeReunion: null }), 70);
  // La prueba de otro en el mueble elegido se avisa (sin nombres).
  assert.deepEqual(X.pruebaAjenaDelMueble(prueba_, catalogo, "PUN-01", 70), { fixtureId: "PUN-01", cara: "A", supplierId: 10 });
  assert.equal(X.pruebaAjenaDelMueble(prueba_, catalogo, "ROB-01", 70), null);
  // En la pantalla de la dueña con reunión fijada, sólo las de ese proveedor.
  assert.deepEqual([...X.pruebasDeLaReunion(prueba_, catalogo, 70).keys()], ["ROB-01|A"],
    "con la reunión de Diana el editor dibuja los vasos de Alpina");
  assert.equal(X.pruebasDeLaReunion(prueba_, catalogo, null), prueba_, "sin reunión se pierden pruebas");
  assert.equal(X.supplierPorNombre(" arroz DIANA", catalogo), 70);
  assert.equal(X.supplierPorNombre("Nutresa", catalogo), null);
  // Reunión es reunión aunque no quede ninguna prueba puesta.
  assert.equal(X.hayReunion({ pruebas: 0, proveedorDeReunion: "Alpina" }), true,
    "con la prueba quitada, el cartel vuelve a decir quién paga qué");
  assert.equal(X.hayReunion({ pruebas: 0, proveedorDeReunion: null, eligiendo: true }), true);
  assert.equal(X.hayReunion({ pruebas: 0, proveedorDeReunion: null }), false);
  // Sin mueble ni reunión: con pruebas de DOS proveedores no se adivina…
  assert.equal(X.proveedorParaPresentar({ prueba: prueba_, catalogo, muebleId: null, proveedorDeReunion: null }), null);
  // …pero si todas son de uno, es a él (la punta de Alpina no puede salir
  // vacía delante de Alpina porque la dueña apretó el botón de siempre).
  assert.equal(X.proveedorParaPresentar({ prueba: new Map([["PUN-01|A", 1]]), catalogo, muebleId: null, proveedorDeReunion: null }), 10);
  assert.equal(X.proveedorParaPresentar({ prueba: new Map(), catalogo, muebleId: null, proveedorDeReunion: null }), null);
  // La última prueba puesta, para el aviso sin nombres.
  assert.deepEqual(X.ultimaPrueba(prueba_, catalogo), { fixtureId: "ROB-01", cara: "A", supplierId: 70 });
  assert.equal(X.ultimaPrueba(new Map(), catalogo), null);

  // Y el editor lo usa en los tres lugares que ve el proveedor.
  const mostrar = cuerpoDe("const mostrarAlProveedor = useCallback(", "const caraConPrueba");
  assert.match(mostrar, /setProveedorEnPantalla\(catalogo\.find\(a => a\.id === arteId\)\?\.supplier_id \?\? null\)/,
    "«Mostrar al proveedor» no fija quién mira");
  assert.match(mostrar, /setProveedorEnPantalla\(proveedorParaPresentar\(\{/, "el botón «Presentar» no fija quién mira");
  assert.match(editorCodigo, /const privadoPara: PrivadoPara = laminaPara !== undefined\s*\? laminaPara\s*: presentationMode \? proveedorEnPantalla : undefined;/);
  assert.match(editorCodigo, /privadoPara=\{privadoPara\}/, "la escena no se entera de quién mira");
  // La lámina: las DOS tomas con el filtro, puesto ANTES de la primera.
  const lamina = cuerpoDe("const exportarPropuesta = useCallback(", "const selectedSlot = selectedFix");
  const fija = lamina.indexOf("setLaminaPara(para);");
  assert.ok(fija > 0 && fija < lamina.indexOf("setSinArte(true);"), "la lámina saca el «Hoy» sin el filtro del proveedor");
  // Sin producto en prueba también es privada: para el del contrato o nadie.
  assert.match(lamina, /const para = arte \? arte\.supplier_id : delContrato;\s*setLaminaPara\(para\);/,
    "la lámina sin prueba lleva las de toda la sesión");
  // Y la vista general sin mueble elegido, para el proveedor de la reunión.
  assert.match(lamina, /if \(!fix \|\| !uf\) \{\s*setLaminaPara\(supplierDeReunion\);/, "el PNG sin selección sale con la pantalla de la dueña");
  // En la caminata, se sale de la caminata ANTES de pedir las tomas.
  const sale = lamina.indexOf("setFirstPerson(false);");
  assert.ok(sale > 0 && sale < lamina.indexOf("pedirToma("), "«Propuesta» en la caminata saca las tomas desde la cámara de la caminata");
  assert.match(lamina, /await esperarEscena\(\(e\) => !e\.primeraPersona\)/, "no espera a que la escena salga de la caminata");
  assert.match(lamina, /finally \{[\s\S]*setLaminaPara\(undefined\);/, "la lámina deja el filtro puesto");
  // El HUD sólo ofrece tomas de lo que se ve.
  assert.match(editorCodigo, /arteALaVista\(prueba\.get\(`\$\{fix\.id\}\|\$\{cara\}`\), catalogo, privadoPara\) != null/);
  // El botón «Presentar» con el mueble elegido probado es «Mostrar al proveedor».
  const presentar = cuerpoDe("const alternarPresentar = useCallback(", "const caraVisible = ");
  assert.match(presentar, /if \(cara\) \{ mostrarAlProveedor\(selectedId, cara\); return; \}/,
    "«Presentar» con la punta probada la muestra vacía");
  // El aviso de una prueba oculta no nombra a nadie.
  const hud = editorCodigo.slice(editorCodigo.indexOf("data-hud-presentar"), editorCodigo.indexOf("data-prueba-oculta") + 400);
  assert.match(hud, /pruebaOculta \? \(/, "Presentar sin proveedor no avisa la prueba oculta");
  assert.ok(!/proveedor|supplierName|\.nombre/.test(hud.slice(hud.indexOf("pruebaOculta ? ("))), "el aviso nombra a un proveedor");
  assert.match(editorCodigo, /: privadoPara === null \? ultimaPrueba\(prueba, catalogo\)\s*: privadoPara !== undefined \? pruebaAjenaDelMueble\(prueba, catalogo, selectedId, privadoPara\) : null;/);
  // El botón «Presentar» sólo pasa la pantalla al dueño de la prueba elegida
  // si es el de la reunión.
  assert.match(presentar, /supplierDeReunion == null\s*\|\| catalogo\.find\(a => a\.id === id\)\?\.supplier_id === supplierDeReunion/,
    "«Presentar» le muestra a Diana la punta de Alpina");
  // La escena de la dueña recibe sólo las pruebas de la reunión.
  assert.match(editorCodigo, /prueba=\{pruebaEnEscena\}/, "el editor dibuja las pruebas de otros proveedores en plena reunión");
  assert.match(editorCodigo, /privadoPara !== undefined \? prueba : pruebasDeLaReunion\(prueba, catalogo, supplierDeReunion\)/);
  // Y el cartel del mouse se vuelve discreto con la misma cuenta que el panel.
  assert.match(editorCodigo, /const discreto = hayReunion\(\{ pruebas: prueba\.size, proveedorDeReunion \}\);/,
    "el cartel del mouse nombra al proveedor con la reunión en curso");
  // El selector: el nombre del grupo no tapa la prop (elegir no fijaba al
  // proveedor de la reunión, y «Presentar» salía vacío).
  const sel = cuerpoDe("function SelectorDeProducto(", "function FormularioDeArte(");
  assert.ok(!/porProveedor\.map\(\(\[proveedor,/.test(sel), "el grupo del selector vuelve a llamarse `proveedor`");
});

prueba("con reunión en curso, el contrato de otro no se lee en el panel", () => {
  const panel = cuerpoDe("function CommercialPanel(", "class CanvasErrorBoundary");
  assert.match(panel, /const enReunion = hayReunion\(\{ pruebas: prueba\.size, proveedorDeReunion, eligiendo \}\);/);
  // La prueba de otro proveedor en la cara elegida no se nombra.
  const vista = cuerpoDe("function VistaProveedor(", "function FirstPersonControls(");
  assert.match(vista, /const ajena = !!probando && deReunion != null && probando\.supplier_id !== deReunion;/);
  const i0 = vista.indexOf("{ajena ? (");
  const i1 = vista.indexOf(") : probando ? (", i0);
  assert.ok(i0 > 0 && i1 > i0, "la prueba ajena no tiene versión discreta");
  assert.ok(!/probando\.(nombre|proveedor)|arteUrl/.test(vista.slice(i0, i1)), "la prueba ajena se nombra o se muestra");
  assert.match(vista, /\{probando && !ajena && \(\s*<button\s*onClick=\{\(\) => onMostrar/, "«Mostrar al proveedor» se ofrece con la prueba de otro");
  assert.match(panel, /const contratoDiscreto = enReunion && !verContrato;/);
  const i = panel.indexOf("fix.supplierName && contratoDiscreto ? (");
  const j = panel.indexOf(") : fix.supplierName ? (", i);
  assert.ok(i > 0 && j > i, "el bloque «Contratado» no tiene versión discreta");
  const discreto = panel.slice(i, j);
  assert.ok(!/supplierName\}|negotiatedValue|brandCategory/.test(discreto), "la versión discreta nombra al proveedor o su precio");
  assert.match(discreto, /Ocupado hasta \$\{mesYAnio\(fix\.endDate\)\}/);
  // El selector abierto también cuenta: su estado vive en el panel.
  assert.match(panel, /eligiendo=\{eligiendo\}\s*setEligiendo=\{setEligiendo\}/);
});

prueba("probar y ajustar la prueba no escriben el plano", () => {
  const probar = cuerpoDe("const probarProducto = useCallback(", "const ajustarPrueba = useCallback(");
  const ajustar = cuerpoDe("const ajustarPrueba = useCallback(", "const [proveedorDeReunion");
  for (const [nombre, cuerpo] of [["probarProducto", probar], ["ajustarPrueba", ajustar]]) {
    assert.ok(!/setPlacedFixtures|pushToStore|commit\(/.test(cuerpo), `\`${nombre}\` escribe el layout`);
  }
  assert.match(probar, /\{ donde: "todas" \}/, "un producto nuevo no arranca en «Toda la cara»");
  assert.ok(!/acostado: false/.test(probar), "un producto nuevo pisa la ficha «va acostado» con un `false`");
  assert.match(probar, /if \(arteId == null\) siguiente\.delete\(`\$\{fixtureId\}\|\$\{cara\}`\);[\s\S]*if \(arteId == null\) siguiente\.delete/,
    "quitar el producto deja el «cómo» colgado");
  assert.match(ajustar, /new Map\(prev\)/, "ajustar muta el mapa y el memo no se entera");
});

prueba("los paneles de slot no salen en las capturas y se velan con la prueba", () => {
  for (const [nombre, cuerpo] of [["GondolaMesh", cuerpoGondolaMesh], ["PuntaMesh", cuerpoPuntaMesh]]) {
    assert.match(cuerpo, /userData=\{CHROME\}/, `los paneles de \`${nombre}\` salen en la lámina del proveedor`);
    assert.match(cuerpo, /opacity=\{enPrueba \? \(isSel \? 0\.22 : isHov \? 0\.12 : 0\) : \(isSel \? 0\.94 : isHov \? 0\.80 : 0\.72\)\}/,
      `los paneles de \`${nombre}\` tiñen el producto en prueba`);
    assert.match(cuerpo, /emissiveIntensity=\{enPrueba \? 0 :/, `los paneles de \`${nombre}\` brillan sobre la prueba`);
    assert.match(cuerpo, /\{enPrueba && \(\s*<ContornoDeSlot /, `los paneles de \`${nombre}\` desaparecen del todo con la prueba`);
  }
});

prueba("Presentar: sin cromo, sin estado y sin nada de otros proveedores", () => {
  assert.match(cuerpoEscena, /!selectedSlotId && !presentationMode && <SelectionBox/, "la caja de selección sale en Presentar");
  assert.match(cuerpoEscena, /\{!presentationMode && \(\(\) => \{\s*const unifiedFix = unifiedById\.get\(fix\.id\);/,
    "la insignia «sin contrato» sale en Presentar");
  assert.match(cuerpoEscena,
    /selectedId && !placingDef && !firstPerson && !presentationMode && \(\(\) => \{\s*const fix = placedFixtures\.find\(f => f\.id === selectedId\);\s*return fix \? \(\s*<FixtureTransformControls/,
    "el gizmo sale en Presentar");
  assert.match(cuerpoEscena, /neutro=\{privadoPara !== undefined\}/, "las tiras de estado salen en Presentar o en la lámina");
  assert.match(editorCodigo, /const sc = neutro\s*\? COLOR_NEUTRO/, "`neutro` no apaga el color de estado");
  assert.match(cuerpoEscena, /onSelectFixture\(fix\.id\);\s*if \(presentationMode\) return;\s*draggingId\.current=fix\.id;/,
    "en Presentar un clic arrastra el mueble");
  // La persona de 1,70 m es la escala: sigue en Presentar, como silueta
  // plana parada EN EL PLANO de la cara que se muestra (adelantada, la
  // perspectiva la agrandaba), y no en «De cerca».
  const desde = cuerpoEscena.indexOf("{!firstPerson && (() => {");
  const hasta = cuerpoEscena.indexOf("<primitive object={gridMinor} />", desde);
  assert.ok(desde > 0 && hasta > desde, "no se encontró dónde se dibuja la persona");
  const bloque = cuerpoEscena.slice(desde, hasta);
  assert.match(bloque, /const pantallaDeVenta = presentationMode \|\| privadoPara !== undefined;/,
    "la lámina sale con el muñeco del editor");
  // En el editor también la silueta, en el plano de la cara: el muñeco de
  // cápsulas quedaba en primer plano con «Encuadrar esta cara».
  assert.ok(!/FiguraHumana/.test(editorCodigo), "volvió el muñeco de cápsulas");
  // Al lado del mueble de la toma, no del último que eligió un arrastre.
  assert.match(bloque, /const enVenta = pantallaDeVenta && pedidoDeToma \? pedidoDeToma\.fixtureId : null;/);
  // Opaca, no un fantasma.
  const silueta = cuerpoDe("function SiluetaDeEscala(", "const CHROME = ");
  assert.match(silueta, /alphaTest=\{0\.5\}/, "la silueta es translúcida");
  assert.ok(!/transparent|opacity=/.test(silueta), "la silueta es translúcida");
  assert.match(bloque, /lugarDeLaFigura\(sel, muros, SEPARACION_EN_VENTA, \{ d: sel\.d, cara \}\)/,
    "la persona no se para en el plano de la cara");
  assert.match(bloque, /<SiluetaDeEscala /, "la persona desapareció de Presentar");
  assert.match(bloque, /if \(toma\?\.toma === "cerca"\) return null;/, "la persona sale cortada en «De cerca»");
  assert.match(editorCodigo, /const SEPARACION_EN_VENTA = 0\.3;/);
  // El tooltip: nunca en Presentar, y sin proveedor ni $ mientras se prueba.
  assert.match(editorCodigo, /\{hoveredFixtureId && !presentationMode && \(\(\) => \{/, "el tooltip sale en Presentar");
  assert.match(editorCodigo, /const discreto = hayReunion\(\{ pruebas: prueba\.size, proveedorDeReunion \}\);/);
  assert.match(editorCodigo, /\{!discreto && fix\.supplierName && /, "el tooltip nombra al proveedor del espacio en plena prueba");
  assert.match(editorCodigo, /\{!discreto && fix\.negotiatedValue > 0 && /, "el tooltip dice cuánto paga otro");
});

prueba("el selector de productos no abre el catálogo entero en la reunión", () => {
  const sel = cuerpoDe("function SelectorDeProducto(", "function FormularioDeArte(");
  assert.match(sel, /if \(proveedor\) \{\s*return catalogo\.filter\(a => a\.proveedor === proveedor/,
    "con el proveedor fijado se ven productos de otros");
  assert.match(sel, /if \(q\.length < 3\) return \[\];/, "sin proveedor fijado, el selector lista todo");
  assert.match(sel, /return catalogo\.filter\(a => a\.proveedor\.toLowerCase\(\)\.includes\(q\)\)/,
    "la búsqueda sin proveedor encuentra por nombre de producto y muestra marcas de otros");
  assert.match(sel, /for \(const a of filtrado\)/, "la grilla no sale de lo filtrado");
  assert.match(sel, /if \(!proveedor\) onProveedor\(a\.proveedor\)/, "elegir un producto no fija al proveedor");
  assert.match(sel, /Productos de \$\{proveedor\}/);
  assert.match(sel, /Cambiar de proveedor/);
  assert.match(sel, /proveedorInicial=\{proveedor\}/, "el alta no llega con el proveedor de la reunión");
});

prueba("el panel de la prueba dice la cuenta, lo que no entra y la foto en perspectiva", () => {
  const panel = cuerpoDe("function PanelDePrueba(", "function VistaProveedor(");
  assert.match(panel, /unidadesDePrueba\(\{ venta: ventaUsada, empaque, donde: como\.donde/, "el resumen no sale de la cuenta que dibuja");
  // Las rejillas reacomodadas: las MISMAS que dibuja la nevera.
  assert.match(panel, /rejillasParaProducto\(venta\.filas, empaque\.alto\)/);
  assert.match(panel, /onAjustar\(\{ rejillas: true, acostado: false \}\)/, "acomodar rejillas deja la botella acostada");
  assert.match(panel, /entrepanosDelEspacio\(slot, venta\.filas, venta\.franja\)/, "«vendido» no usa la regla del relleno");
  assert.match(panel, /`No entra \$\{empaque\.acostado \? "acostada" : "parada"\}: \$\{enCm\(empaque\.alto\)\} cm en \$\{enCm\(maxLibre\)\} cm libres\.`/);
  // Por el EMPAQUE y no por la sesión: con la ficha «va acostado» la sesión
  // no dice nada y el botón tiene que ser «Volver a pararla».
  assert.match(panel, /empaque\.envase === "revolucion" && !empaque\.acostado/, "«Mostrarla acostada» se ofrece a una caja");
  assert.match(panel, /\{empaque\?\.acostado && \(/, "«Volver a pararla» no sigue a la ficha acostada");
  // Y lo que no entra de fondo se dice con el fondo.
  assert.match(panel, /No entra de fondo: \$\{enCm\(empaque\.fondo\)\} cm/, "el fondo que no entra se dice como ancho");
  assert.match(panel, /empaque\?\.envase === "caja" && etiqueta && pareceEnPerspectiva\(etiqueta\.recorte\)/,
    "el panel no avisa la caja fotografiada en tres cuartos");
  // Sin nombres: el panel no lee de quién es el slot vendido.
  assert.ok(!/supplierName|negotiatedValue/.test(panel), "el panel de la prueba nombra a otro proveedor o su precio");
});

prueba("«Mostrar al proveedor» abre Presentar con la toma de frente", () => {
  const mostrar = cuerpoDe("const mostrarAlProveedor = useCallback(", "const caraConPrueba");
  assert.match(mostrar, /setPresentationMode\(true\)/);
  assert.match(mostrar, /setFirstPerson\(false\)/);
  assert.match(mostrar, /pedirToma\(fixtureId, cara, "frente"\)/);
  assert.ok(!/setPlacedFixtures/.test(mostrar), "mostrar escribe el plano");
  const vista = cuerpoDe("function VistaProveedor(", "function FixtureTransformControls(");
  assert.match(vista, /onClick=\{\(\) => onMostrar\(fix\.id, caraUsada\)\}/);
  assert.match(editorCodigo,
    /\(\[\["frente", "De frente"\], \["tres_cuartos", "Tres cuartos"\], \["cerca", "De cerca"\]\] as const\)/,
    "faltan las tres tomas en el HUD de Presentar");
});

prueba("la cámara de venta encuadra con la cuenta de la prueba, dentro del pasillo", () => {
  const toma = cuerpoDe("const tomaDeVenta = useCallback(", "function handleSceneDoubleClick");
  assert.match(toma, /ventaDeTipo\(fix\.type, fix\.w, fix\.d, fix\.h, fix\.gondolaType\)/);
  assert.match(toma, /focoDeLaPrueba\(venta, fix\.h, enCara \? \(como\?\.donde \?\? "todas"\) : "todas", enCara\?\.empaque \?\? null\)/,
    "la cámara calcula sus alturas por su cuenta");
  // «De cerca» con teleobjetivo, y el campo visual vuelve a 50° fuera de ella.
  assert.match(toma, /const fov = toma === "cerca" \? FOV_DE_CERCA : FOV_DEL_EDITOR;/);
  assert.match(toma, /if \(pedidoDeToma\?\.toma !== "cerca"\) ponerCampoVisual\(FOV_DEL_EDITOR\);/,
    "el teleobjetivo de «De cerca» se queda puesto");
  // «Encuadrar esta cara» sin vista guardada es la toma de frente, dentro del
  // pasillo: el encuadre viejo miraba la cara B desde detrás de la vecina.
  assert.match(toma, /if \(fix\) tomaDeVenta\(fix, enfoque3D\.cara, "frente"\);/, "«Encuadrar esta cara» mira desde detrás de la góndola de enfrente");
  assert.match(toma, /const guardada = uf\.vista3D\?\.\[enfoque3D\.cara\];/, "la vista guardada dejó de mandar");
  // La toma se borra al salir de Presentar, con un número que nunca vuelve.
  assert.match(editorCodigo, /useEffect\(\(\) => \{ if \(!presentationMode\) setPedidoDeToma\(null\); \}, \[presentationMode\]\);/);
  assert.match(editorCodigo, /const n = \+\+tomasPedidas\.current;/, "un pedido nuevo puede repetir un número ya atendido");
  // El HUD no se pierde con un arrastre: cae al mueble de la última toma.
  assert.match(editorCodigo, /const muebleDelHud = caraVisible\(selectedFix\) \? selectedFix\s*: caraVisible\(muebleDeLaToma\) \? muebleDeLaToma : null;/,
    "un arrastre que elige otro mueble borra las tomas del HUD");
  assert.match(toma, /murosDeCaminata\(placedFixtures\.filter\(\(f\) => f\.id !== fix\.id\)\)/,
    "la cámara no mira los muebles de enfrente");
  assert.match(toma, /aplicarVista\(vistaDeVenta\(/);
  assert.match(toma, /tomaAtendida\.current = pedidoDeToma\.n/, "la misma toma se repite en cada render");
  assert.match(cuerpoEscena, /distanciaMinima=\{presentationMode \|\| privadoPara !== undefined \? 0\.5 : 1\.2\}/,
    "la órbita no deja acercarse a la toma «de cerca» (o empuja «Encuadrar esta cara» detrás de la góndola de enfrente)");
  const camara = cuerpoDe("function CameraControls({", "function ScreenshotCapture(");
  assert.match(camara, /ctrl\.minDistance = distanciaMinima;\s*ctrl\.update\(\);/,
    "la distancia mínima no se aplica a los controles ya armados");
});

prueba("el foco de la cámara de venta sale de la misma cuenta que el producto", () => {
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const toda = F.focoDeLaPrueba(v, 1.8, "todas", VASO);
  assert.equal(toda.yBajo, 0);
  assert.equal(toda.yAlto, 1.8);
  // Con la cara entera, el entrepaño con producto de centro más cerca de 1,3 m.
  const r = F.unidadesDePrueba({ venta: v, empaque: VASO, donde: "todas", semilla: "x" });
  const con = r.porFila.filter((f) => f.motivo === null);
  const esperado = con.reduce((a, b) =>
    Math.abs(b.apoyo + b.libre / 2 - 1.3) < Math.abs(a.apoyo + a.libre / 2 - 1.3) ? b : a);
  assert.equal(toda.yEntrepano, esperado.apoyo + esperado.libre / 2);
  assert.equal(toda.libreEntrepano, esperado.libre);
  // Por entrepaño: del apoyo más bajo al techo más alto, con 5 cm de aire.
  const dos = F.focoDeLaPrueba(v, 1.8, [0, 1], VASO);
  assert.equal(enMetros(dos.yBajo), enMetros(v.filas.alturas[0] - 0.05));
  assert.equal(enMetros(dos.yAlto), enMetros(v.filas.alturas[2] + 0.05));
  // En la nevera, la botella de 30,5 cm sólo entra arriba: «de cerca» va a
  // ese entrepaño aunque el de 1,2 m esté más a mano, porque ahí no hay nada.
  const n = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
  const alta = { ancho: 0.09, alto: 0.305, fondo: 0.09, forma: "caja" };
  const fn = F.focoDeLaPrueba(n, 1.8, "todas", alta);
  const ultima = n.filas.rows - 1;
  assert.equal(enMetros(fn.yEntrepano), enMetros(n.filas.alturas[ultima] + (n.sobreApoyo ?? 0)
    + (n.filas.alturas[ultima + 1] - n.filas.alturas[ultima]) / 2), "la toma de cerca mira un entrepaño vacío");
  // Elegidos [0, 1] con la botella de 30 cm: la fila 1 no la admite.
  const botella = { ancho: 0.09, alto: 0.30, fondo: 0.09, forma: "caja" };
  const f01 = F.focoDeLaPrueba(n, 1.8, [0, 1], botella);
  assert.equal(enMetros(f01.yEntrepano), enMetros(n.filas.alturas[0] + (n.sobreApoyo ?? 0) + 0.15));
  // Sin empaque (la foto todavía carga) se encuadra lo elegido igual.
  const sin = F.focoDeLaPrueba(v, 1.8, [2], null);
  assert.equal(enMetros(sin.yEntrepano), enMetros(v.filas.alturas[2] + (v.filas.alturas[3] - v.filas.alturas[2]) / 2));
});

// ── La foto que no carga (etiqueta.ts), CORRIDA ─────────────────────────────
//
// Render despertando da 502, un token vencido 401: la etiqueta quedaba en
// «error» para siempre y la cara de la punta, vacía hasta recargar la página.
// Se compila etiqueta.ts con un fetch falso (la API y @react-three/fiber, que
// no hacen falta para esto, se reemplazan) y se mira qué hace.
const compiladoET = await build({
  entryPoints: [join(raiz, muebles, "etiqueta.ts")],
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
  plugins: [{
    name: "sin-api",
    setup(b) {
      b.onResolve({ filter: /api\/catalogo$|^@react-three\/fiber$/ }, (a) => ({ path: a.path, namespace: "falso" }));
      b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
        contents: /catalogo/.test(a.path)
          ? "export const arteUrl = (id) => `/api/catalogo/${id}/imagen`;"
          : "export const useThree = () => ({});",
        loader: "js",
      }));
    },
  }],
});
const ET = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoET.outputFiles[0].text).toString("base64")
);
const fotoQueFalla = await (async () => {
  const r = {};
  const real = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, now: Date.now, cib: globalThis.createImageBitmap };
  const timers = [];
  let pedidos = 0, bitmaps = 0, avisos = 0, ahora = 1_000_000;
  const tick = () => new Promise((ok) => real.setTimeout(ok, 5));
  try {
    globalThis.fetch = async () => { pedidos++; return { ok: false, status: 502, blob: async () => ({}) }; };
    globalThis.createImageBitmap = async () => { bitmaps++; throw new Error("no es una imagen"); };
    globalThis.setTimeout = (f, ms) => { timers.push({ f, ms }); return 0; };
    Date.now = () => ahora;
    const avisar = () => { avisos++; };
    r.primera = ET.etiquetaDeArte("k", "/foto", "auto", avisar);
    r.cargando = ET.estadoDeEtiqueta("k");
    await tick();
    r.error = ET.estadoDeEtiqueta("k");
    r.avisosAlFallar = avisos;
    r.bitmaps = bitmaps;
    // Pedirla de nuevo enseguida no la vuelve a bajar.
    ET.etiquetaDeArte("k", "/foto", "auto", avisar);
    r.pedidosSinReintento = pedidos;
    // «Reintentar»: avisa a quien la esperaba, y al pedirla se vuelve a bajar.
    ET.reintentarEtiqueta("k");
    r.avisosAlReintentar = avisos;
    ET.etiquetaDeArte("k", "/foto", "auto", avisar);
    r.pedidosConReintento = pedidos;
    r.reintentando = ET.estadoDeEtiqueta("k");
    await tick();
    // Vuelve a fallar; al avisar, la escena la pide otra vez (y queda esperando).
    ET.etiquetaDeArte("k", "/foto", "auto", avisar);
    // Y sola: el temporizador avisa pasado el rato, y la próxima vez se baja.
    const t = timers.filter((x) => x.ms >= 5000).at(-1);
    r.temporizador = t?.ms ?? null;
    const antes = avisos;
    ahora += t?.ms ?? 0;
    t?.f();
    r.avisoDelTemporizador = avisos - antes;
    ET.etiquetaDeArte("k", "/foto", "auto", avisar);
    r.pedidosSolos = pedidos;
  } finally {
    globalThis.fetch = real.fetch; globalThis.setTimeout = real.setTimeout; Date.now = real.now;
    globalThis.createImageBitmap = real.cib;
  }
  return r;
})();

prueba("una foto que no carga se dice, se reintenta y no queda en el caché para siempre", () => {
  const r = fotoQueFalla;
  assert.equal(r.primera, null);
  assert.equal(r.cargando, "cargando");
  assert.equal(r.error, "error", "un 502 no queda como error: la cara no puede caer a la lámina");
  assert.equal(r.avisosAlFallar, 1, "quien la pidió no se entera de que falló");
  assert.equal(r.bitmaps, 0, "con un 502 se intentó leer el HTML del error como imagen (falta `res.ok`)");
  assert.equal(r.pedidosSinReintento, 1);
  assert.equal(r.avisosAlReintentar, 2, "«Reintentar» no avisa a quien la esperaba");
  assert.equal(r.pedidosConReintento, 2, "«Reintentar» no vuelve a bajar la foto");
  assert.equal(r.reintentando, "reintentando", "mientras se reintenta la cara parpadearía vacía");
  assert.ok(r.temporizador >= 5000 && r.temporizador <= 60000, `sin reintento solo (${r.temporizador})`);
  assert.equal(r.avisoDelTemporizador, 1, "pasado el rato no se avisa para volver a pedirla");
  assert.equal(r.pedidosSolos, 3, "pasado el rato la foto no se vuelve a bajar");
  // El panel lo dice y ofrece reintentar, y una recarga del catálogo que
  // falla no vacía las caras probadas.
  assert.match(editor, /onClick=\{\(\) => reintentarEtiqueta\(claveDeArte\(arte\.id, modo\)\)\}/, "el panel no ofrece «Reintentar»");
  assert.ok(!/\.catch\(\(\) => setCatalogo\(\[\]\)\)/.test(editor), "una recarga fallida del catálogo vacía todas las caras probadas");
});

console.log(`\n${hechas} pruebas del mobiliario 3D`);
