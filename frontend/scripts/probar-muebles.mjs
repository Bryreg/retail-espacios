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
  assert.match(cuerpoPuntaMesh, /<PuntaReal w=\{w\} d=\{d\} h=\{h\} ghost=\{ghost\} copete=\{copete\} cenefa=\{cenefa\} habladores=\{habladores\} \/>/);
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
  // Las automáticas salen de la MISMA cuenta que «A mano» (`repartirRejillas`):
  // el mismo resultado de siempre, al ras de ranura menos la primera.
  assert.deepEqual(dos, F.repartirRejillas(v.filas, dos.rows), "las automáticas y «A mano» reparten distinto");
  // La nevera dibuja ESAS rejillas, y el producto apoya en ellas.
  const nevera = cuerpoDe("function NeveraRefrescosMesh(", "function StandFrutasMesh(");
  assert.match(nevera, /niveles=\{enPrueba && facePaint\?\.pruebaA\?\.filas\s*\? facePaint\.pruebaA\.filas\.alturas\.slice\(0, -1\) : undefined\}/);
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /const ventaUsada = p\.filas \? \{ \.\.\.venta, filas: p\.filas \} : venta;/);
  assert.match(dp, /venta: ventaUsada, empaque: e, donde: p\.donde/);
  // Y lo que se dibuja sale de `rejillasDeLaPrueba`, con lo elegido en la
  // sesión: ya no hay una segunda copia de la cuenta en el editor.
  const fp = cuerpoDe("const facePaintById = useMemo(", "const handleOrbitReady");
  assert.match(fp, /fix\.type === "nevera_refrescos"\s*\? rejillasDeLaPrueba\(ventaDeNevera\(fix\.w, fix\.d, fix\.h\), empaque, como\?\.rejillas\)\.filas/,
    "el dibujo no usa `rejillasDeLaPrueba` con la elección de la sesión");
  assert.ok(!/rejillasParaProducto/.test(editorCodigo), "el editor volvió a llamar la cuenta vieja por su lado");
});

// ── Las rejillas: automáticas de entrada, de fábrica o a mano ──────────────
//
// Pedido de la dueña: «que se mejore sola, pero en caso de no hacerlo bien
// que exista la opción de hacerlo manual». Se EJECUTAN las cuentas: una
// guarda de texto seguía en verde con las automáticas devolviendo siempre las
// de fábrica.

const NEV = V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8);
const DOS_L = { ancho: 0.105, alto: 0.33, fondo: 0.105, forma: "botella", envase: "revolucion" };
const LITRO_Y_MEDIO = { ancho: 0.09, alto: 0.30, fondo: 0.09, forma: "botella", envase: "revolucion" };
const conFilas = (filas) => (filas ? { ...NEV, filas } : NEV);
const enTodas = (filas, e) => F.unidadesDePrueba({ venta: conFilas(filas), empaque: e, donde: "todas", semilla: "r" });

prueba("rejillas automáticas: la 2 L sale parada sin tocar nada, y la 1,5 L llena las cuatro", () => {
  // De fábrica la 2 L no entra en ninguna (33 cm en 31 libres).
  assert.equal(enTodas(null, DOS_L).frentesALaVista, 0, "la 2 L ya entraba de fábrica: la prueba no prueba nada");
  const dos = F.rejillasDeLaPrueba(NEV, DOS_L, undefined);
  assert.equal(dos.modo, "auto");
  assert.ok(dos.filas, "sin tocar nada, la 2 L queda en las de fábrica (vacía)");
  // Cuatro rejillas, como la de 1,5 L: con 35 a 37,5 cm libres le sobran 2 cm
  // arriba, el aire de la mano. Es el mismo resultado que daba «Acomodar».
  assert.equal(dos.filas.rows, 4, `rejillas para la 2 L: ${dos.filas.rows}`);
  assert.equal(dos.cuantas, 4);
  const r2 = enTodas(dos.filas, DOS_L);
  assert.ok(r2.porFila.every((f) => f.motivo === null && f.frentes > 0), "alguna rejilla queda sin la 2 L parada");
  assert.equal(r2.frentesALaVista, 40);
  // La de 1,5 L: 33 de fábrica (las dos del medio vacías) → 4 × 11 = 44.
  assert.equal(enTodas(null, LITRO_Y_MEDIO).frentesALaVista, 33);
  const litro = F.rejillasDeLaPrueba(NEV, LITRO_Y_MEDIO, undefined);
  assert.equal(litro.filas?.rows, 4);
  assert.equal(enTodas(litro.filas, LITRO_Y_MEDIO).frentesALaVista, 44);
  assert.ok(enTodas(litro.filas, LITRO_Y_MEDIO).porFila.every((f) => f.frentes === 11));
  // Un producto que ya entra en todas queda en las de fábrica.
  const lata = { ancho: 0.066, alto: 0.122, fondo: 0.066, forma: "lata", envase: "revolucion" };
  const l = F.rejillasDeLaPrueba(NEV, lata, undefined);
  assert.equal(l.filas, null, "acomodó las rejillas para una lata que ya entraba");
  assert.equal(l.cuantas, NEV.filas.rows);
  // Sin la foto (empaque null) no hay automáticas todavía: las de fábrica.
  assert.equal(F.rejillasDeLaPrueba(NEV, null, undefined).filas, null);
  // Y si acomodarlas NO suma frentes, se quedan las de fábrica: un producto
  // de 35 cm entra en una sola de fábrica (la de 30 + 5)… acomodadas, en 4
  // de 36,5: suma. Uno que entra en todas menos la de arriba y acomodado
  // pierde una rejilla, no.
  const casiTodas = { ancho: 0.08, alto: 0.29, fondo: 0.08, forma: "botella", envase: "revolucion" };
  const ct = F.rejillasDeLaPrueba(NEV, casiTodas, undefined);
  const deFab = enTodas(null, casiTodas).frentesALaVista;
  assert.ok(ct.filas === null || enTodas(ct.filas, casiTodas).frentesALaVista > deFab,
    "acomodó las rejillas para mostrar MENOS frentes que las de fábrica");
});

prueba("rejillas: «De fábrica» se respeta y la acostada ignora la elección", () => {
  const f = F.rejillasDeLaPrueba(NEV, DOS_L, "fabrica");
  assert.equal(f.filas, null, "«De fábrica» acomodó las rejillas igual");
  assert.equal(f.modo, "fabrica");
  // Y con las de fábrica la 2 L no entra en ninguna: el panel dice por qué.
  const r = enTodas(f.filas, DOS_L);
  assert.ok(r.porFila.every((x) => x.motivo === "no-entra-alto"));
  const maxLibre = Math.max(...r.porFila.map((x) => x.libre));
  assert.equal(Math.round(maxLibre * 100), 31, "el aviso no daría «33 cm en 31 cm libres»");
  // Acostada, siempre las de fábrica: elija lo que elija.
  const acostada = { ...DOS_L, acostado: true };
  for (const e of [undefined, "fabrica", { cuantas: 3 }, { cuantas: 4, alturas: [0.2, 0.6, 0.95, 1.3] }]) {
    assert.equal(F.rejillasDeLaPrueba(NEV, acostada, e).filas, null, `acostada con ${JSON.stringify(e)} cambió las rejillas`);
  }
});

prueba("rejillas a mano: cuántas (1 a las de fábrica) y dónde no entra", () => {
  // Con 4 la 2 L entra en todas (es lo que dan las automáticas).
  const m4 = F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 4 });
  assert.equal(m4.modo, "manual");
  assert.equal(m4.filas.rows, 4);
  assert.equal(m4.filas.alturas.length, 5);
  // Con 5 (las de fábrica, repartidas parejas) no entra en ninguna: «A mano»
  // dice dónde no entra en vez de no dejar elegir.
  const m5 = F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 5 });
  assert.equal(m5.filas.rows, 5);
  const r5 = enTodas(m5.filas, DOS_L);
  assert.ok(r5.porFila.every((x) => x.motivo === "no-entra-alto"), "con 5 rejillas la 2 L entra parada");
  // Con 4 y una movida dos ranuras, la de abajo de ella queda grande y la de
  // arriba no da: «no-entra-alto» SÓLO ahí.
  const movida = F.moverRejilla(m4.filas, 1, 2);
  const mm = F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 4, alturas: movida.alturas.slice(0, -1) });
  const rm = enTodas(mm.filas, DOS_L);
  assert.deepEqual(rm.porFila.map((x) => x.motivo), [null, "no-entra-alto", null, null],
    `con la rejilla 2 subida 5 cm: ${rm.porFila.map((x) => x.motivo)}`);
  // `cuantas` se acota a 1…las de fábrica: no se inventan rejillas.
  assert.equal(F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 9 }).filas.rows, NEV.filas.rows);
  assert.equal(F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 0 }).filas.rows, 1);
  assert.equal(F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: -3 }).filas.rows, 1);
  assert.equal(F.repartirRejillas(NEV.filas, 12).rows, NEV.filas.rows);
  // Alturas guardadas que no cierran (otra cantidad, desordenadas, fuera del
  // mueble) se reparten de nuevo, y no se dibujan rejillas imposibles.
  for (const alturas of [[0.2, 0.6, 0.95], [0.2, 0.95, 0.6, 1.3], [0.2, 0.6, 0.95, 1.9], [0.3, 0.6, 0.95, 1.3]]) {
    const x = F.rejillasDeLaPrueba(NEV, DOS_L, { cuantas: 4, alturas });
    assert.deepEqual(x.filas, F.repartirRejillas(NEV.filas, 4), `usó alturas incoherentes: ${alturas}`);
  }
  // Repartidas: la primera y el techo de fábrica, el resto al ras de ranura.
  for (let n = 1; n <= NEV.filas.rows; n++) {
    const fr = F.repartirRejillas(NEV.filas, n);
    assert.equal(fr.alturas[0], NEV.filas.alturas[0]);
    assert.equal(fr.alturas[n], NEV.filas.alturas[NEV.filas.rows]);
    for (let i = 1; i < n; i++) {
      const ranuras = fr.alturas[i] / 0.025;
      assert.ok(Math.abs(ranuras - Math.round(ranuras)) < 1e-6, `rejilla ${i} de ${n} fuera de ranura: ${fr.alturas[i]}`);
    }
    assert.equal(fr.fondos.length, n);
    assert.equal(fr.giros.length, n);
  }
});

prueba("mover una rejilla: de a una ranura, con tope de 5 cm, la de abajo y el techo fijos", () => {
  const f = F.repartirRejillas(NEV.filas, 4);
  // Dos ranuras = 5 cm, al ras.
  const arriba2 = F.moverRejilla(f, 2, 2);
  assert.ok(Math.abs(arriba2.alturas[2] - f.alturas[2] - 0.05) < 1e-9, "dos ranuras no son 5 cm");
  assert.deepEqual([arriba2.alturas[0], arriba2.alturas[1], arriba2.alturas[3], arriba2.alturas[4]],
    [f.alturas[0], f.alturas[1], f.alturas[3], f.alturas[4]], "mover una rejilla corrió otra");
  const abajo1 = F.moverRejilla(f, 2, -1);
  assert.ok(Math.abs(f.alturas[2] - abajo1.alturas[2] - 0.025) < 1e-9);
  // Tope: nunca a menos de 5 cm de las vecinas, se frena ahí.
  const tope = F.moverRejilla(f, 1, 100);
  assert.ok(f.alturas[2] - tope.alturas[1] >= 0.05 - 1e-9, `quedó a ${f.alturas[2] - tope.alturas[1]} de la de arriba`);
  assert.ok(f.alturas[2] - tope.alturas[1] < 0.075 + 1e-9, "se frenó antes de lo necesario");
  const piso = F.moverRejilla(f, 1, -100);
  assert.ok(piso.alturas[1] - f.alturas[0] >= 0.05 - 1e-9 && piso.alturas[1] - f.alturas[0] < 0.075 + 1e-9);
  for (const g of [tope, piso]) {
    const r = g.alturas[1] / 0.025;
    assert.ok(Math.abs(r - Math.round(r)) < 1e-6, `el tope quedó fuera de ranura: ${g.alturas[1]}`);
  }
  // La de abajo (0) y el techo (rows) no se mueven.
  assert.deepEqual(F.moverRejilla(f, 0, 3), f, "movió la rejilla de abajo");
  assert.deepEqual(F.moverRejilla(f, 4, -3), f, "movió el techo");
  // El producto sigue a la rejilla: apoya en la altura nueva.
  const r = enTodas(arriba2, LITRO_Y_MEDIO);
  assert.ok(Math.abs(r.porFila[2].apoyo - (arriba2.alturas[2] + NEV.sobreApoyo)) < 1e-9, "el producto no siguió a la rejilla");
});

prueba("rejillas: cambiar de modo o de cantidad vuelve a «Toda la cara»; mover no", () => {
  const vig = F.repartirRejillas(NEV.filas, 4);
  for (const accion of [{ modo: "auto" }, { modo: "fabrica" }, { modo: "manual" }, { cuantas: 3 }, { cuantas: 5 }]) {
    const c = F.ajusteDeRejillas(accion, vig);
    assert.equal(c.donde, "todas", `${JSON.stringify(accion)} deja «Por entrepaño» apuntando a otra rejilla`);
  }
  assert.ok("rejillas" in F.ajusteDeRejillas({ modo: "auto" }, vig) && F.ajusteDeRejillas({ modo: "auto" }, vig).rejillas === undefined,
    "«Automáticas» no borra la elección");
  assert.equal(F.ajusteDeRejillas({ modo: "fabrica" }, vig).rejillas, "fabrica");
  // «A mano» arranca con las que se ven.
  const mano = F.ajusteDeRejillas({ modo: "manual" }, vig).rejillas;
  assert.deepEqual(F.rejillasDeLaPrueba(NEV, DOS_L, mano).filas, vig, "«A mano» cambió las rejillas al entrar");
  const mov = F.ajusteDeRejillas({ mover: 2, pasos: 1 }, vig);
  assert.ok(!("donde" in mov), "mover una rejilla vuelve a «Toda la cara»");
  assert.deepEqual(F.rejillasDeLaPrueba(NEV, DOS_L, mov.rejillas).filas, F.moverRejilla(vig, 2, 1));
  // El panel usa ESTAS cuentas y nada del bloque escribe el plano.
  const bloque = cuerpoDe("function BloqueDeRejillas(", "function PanelDePrueba(");
  for (const a of ['ajustar({ modo: "auto" })', 'ajustar({ modo: "fabrica" })', 'ajustar({ modo: "manual" })',
    "ajustar({ cuantas: rejillas.cuantas - 1 })", "ajustar({ cuantas: rejillas.cuantas + 1 })",
    "ajustar({ mover: i, pasos: 1 })", "ajustar({ mover: i, pasos: -1 })"]) {
    assert.ok(bloque.includes(a), `al bloque le falta ${a}`);
  }
  assert.match(bloque, /onAjustar\(ajusteDeRejillas\(accion, vigentes\)\)/);
  assert.ok(!/setPlacedFixtures|pushToStore|commit\(/.test(bloque), "el bloque de rejillas escribe el layout");
});

// ── El surtido: varios productos del MISMO proveedor en bloques verticales ──

const CAJA_MUSLI = { ancho: 0.19, alto: 0.27, fondo: 0.065, forma: "caja", envase: "caja" };
const CAJA_CHICA = { ancho: 0.15, alto: 0.25, fondo: 0.05, forma: "caja", envase: "caja" };

prueba("surtido: un bloque por vano, en el orden en que se ve desde el pasillo", () => {
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  assert.equal(v.vanos.length, 3);
  const enVanos = (t) => v.vanos.filter((x) => x.x - x.ancho / 2 >= t.x0 - 1e-9 && x.x + x.ancho / 2 <= t.x1 + 1e-9).length;
  // 3 vanos y 3 artes: uno por vano.
  const tres = F.bloquesDeSurtido(v.vanos, 3);
  assert.equal(tres.length, 3);
  assert.deepEqual(tres.map(enVanos), [1, 1, 1], "con 3 y 3 no es uno por vano");
  // El principal, a la IZQUIERDA de quien mira: del lado de +X.
  assert.ok(tres[0].x0 > tres[1].x0 && tres[1].x0 > tres[2].x0, "el principal no quedó a la izquierda desde el pasillo");
  // 3 vanos y 2 artes: 2 + 1 (el principal se lleva el de más).
  assert.deepEqual(F.bloquesDeSurtido(v.vanos, 2).map(enVanos), [2, 1]);
  // Un vano (la punta) y 2 artes: mitades.
  const p = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const mitades = F.bloquesDeSurtido(p.vanos, 2);
  const vano = p.vanos[0];
  assert.ok(Math.abs(mitades[0].x1 - (vano.x + vano.ancho / 2)) < 1e-9 && Math.abs(mitades[1].x0 - (vano.x - vano.ancho / 2)) < 1e-9);
  assert.ok(Math.abs((mitades[0].x1 - mitades[0].x0) - (mitades[1].x1 - mitades[1].x0)) < 1e-9, "la punta no se parte en mitades");
  assert.ok(Math.abs(mitades[0].x0 - mitades[1].x1) < 1e-9, "las mitades se pisan o dejan hueco");
  // Con un solo producto, la cara entera.
  assert.equal(F.bloquesDeSurtido(v.vanos, 1).length, 1);
});

prueba("surtido: cada producto llena SU bloque, en todos los entrepaños, y ningún frente cae sobre un parante", () => {
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  const tramos = F.bloquesDeSurtido(v.vanos, 3);
  const empaques = [CAJA_MUSLI, CAJA_CHICA, CAJA_MUSLI];
  const dentroDeVano = (x, a) => v.vanos.some((vn) => x - a / 2 >= vn.x - vn.ancho / 2 - 1e-6 && x + a / 2 <= vn.x + vn.ancho / 2 + 1e-6);
  tramos.forEach((t, k) => {
    const r = F.unidadesDePrueba({ venta: v, empaque: empaques[k], donde: "todas", semilla: `G|B|${k}`, tramo: t, surtido: true });
    const conProducto = r.porFila.filter((f) => f.motivo === null);
    assert.equal(conProducto.length, r.porFila.filter((f) => f.motivo !== "no-entra-alto").length, `el producto ${k} no está en todos los entrepaños donde entra`);
    for (const u of r.unidades) {
      assert.ok(u.x >= t.x0 - 0.003 && u.x <= t.x1 + 0.003, `el producto ${k} se sale de su bloque: ${u.x}`);
      assert.ok(dentroDeVano(u.x, empaques[k].ancho + 0.004), `el producto ${k} cae sobre un parante en x=${u.x}`);
    }
    // Con surtido no hay frente corrido: el frente de cada bloque, completo.
    for (const f of conProducto) {
      const frente = r.unidades.filter((u) => u.fila === f.fila && u.prof === 0 && u.piso === 0).length;
      assert.equal(frente, f.frentes, `al frente del bloque ${k}, entrepaño ${f.fila}, falta producto`);
    }
  });
  // Un arte de OTRO proveedor colado en el surtido no se dibuja: ni en la
  // pantalla de la dueña ni en la del proveedor.
  const cat = [
    { id: 1, supplier_id: 7, proveedor: "Kellogg's" }, { id: 2, supplier_id: 7, proveedor: "Kellogg's" },
    { id: 3, supplier_id: 7, proveedor: "Kellogg's" }, { id: 4, supplier_id: 9, proveedor: "Nestlé" },
    { id: 5, supplier_id: 7, proveedor: "Kellogg's" }, { id: 6, supplier_id: 7, proveedor: "Kellogg's" },
  ];
  assert.deepEqual(X.surtidoALaVista(1, [4, 2, 3], cat, undefined), [2, 3], "un arte de otro proveedor entró al surtido");
  assert.deepEqual(X.surtidoALaVista(1, [4, 2], cat, 7), [2]);
  assert.deepEqual(X.surtidoALaVista(1, [2, 3], cat, 9), [], "la pantalla de Nestlé dibuja el surtido de Kellogg's");
  assert.deepEqual(X.surtidoALaVista(1, [2, 2, 1, 3, 5, 6], cat, undefined), [2, 3, 5], "más de 4 en total, repetidos o el principal");
  assert.deepEqual(X.surtidoALaVista(null, [2], cat, undefined), []);
  // Quien arma la prueba usa ESA cuenta, y sólo en góndola y punta.
  const fp = cuerpoDe("const facePaintById = useMemo(", "const handleOrbitReady");
  assert.match(fp, /TIPOS_CON_SURTIDO\.has\(fix\.type\)\s*\? surtidoALaVista\(arteId, como\?\.surtido, catalogo, privadoPara\)/);
  assert.match(fp, /bloquesDeSurtido\(venta\.vanos, delSurtido\.length \+ 1\)/);
  assert.match(editorCodigo, /const TIPOS_CON_SURTIDO = new Set<string>\(\["gondola", "punta"\]\);/, "el surtido se ofrece en la nevera o el robatope");
});

prueba("surtido: el copete, el cabezote, la toma y /taller siguen con el principal", () => {
  // `prueba` (el arte por cara) no cambió de forma: el principal sigue ahí y
  // lo demás va en `ComoSePrueba.surtido` (sesión, no layout).
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /etiqueta: Etiqueta \| null;\s*empaque: EmpaqueDeArte \| null;/);
  assert.match(cuerpoPuntaMesh, /const copete = conMarca && pa\?\.etiqueta\s*\? materialDeCopete\(pa\.etiqueta,/, "el copete no usa el principal");
  assert.match(cuerpoNeveraMesh, /materialDeCopete\(pa\.etiqueta,/, "el cabezote no usa el principal");
  const toma = cuerpoDe("const tomaDeVenta = useCallback(", "const ponerCampoVisual");
  assert.match(toma, /enCara\?\.empaque \?\? null/, "la toma de venta encuadra otro producto");
  const taller = sinComentarios(leer(join("src", "pages", "TallerMuebles.tsx")));
  assert.ok(!/surtido/.test(taller), "/taller arma su prueba con surtido");
  // Y el surtido no se escribe en el plano.
  const ajustar = cuerpoDe("const ajustarPrueba = useCallback(", "const [proveedorDeReunion");
  assert.ok(!/setPlacedFixtures|pushToStore/.test(ajustar));
});

prueba("frío: el selector marca lo refrigerado y el panel avisa en un mueble seco, sin bloquear", () => {
  // La marca del selector y el aviso del panel salen de las mismas funciones
  // puras (probadas en probar-arte): si alguien las cambia por una lista a
  // mano, el aviso deja de seguir al catálogo.
  assert.match(editorCodigo, /\{vaRefrigerado\(a\.categoria, a\.nombre\) && \(\s*<span[^>]*data-frio>frío<\/span>/, "el selector no marca lo refrigerado");
  const panel = cuerpoDe("function PanelDePrueba(", "\nfunction ");
  assert.match(panel, /\{avisoDeFrio\(fix\.type, arte\.categoria, arte\.nombre\) && \(\s*<p[^>]*data-aviso-frio>/, "el panel no avisa del frío");
  // Avisa, no prohíbe: construir la prueba no mira el frío.
  const construir = cuerpoDe("const construirPrueba = (", "for (const fix of placedFixtures)");
  assert.ok(!/avisoDeFrio|vaRefrigerado/.test(construir), "el frío bloquea la prueba: decide la dueña");
});

prueba("con un solo arte en una góndola entera: frente corrido (uno por vano y entrepaño) y cajas que no se cruzan", () => {
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8, "double");
  const r = F.unidadesDePrueba({ venta: v, empaque: CAJA_MUSLI, donde: "todas", semilla: "GON-01|B|1" });
  // Misma semilla, mismo resultado (no cambia al mover la cámara).
  assert.deepEqual(F.unidadesDePrueba({ venta: v, empaque: CAJA_MUSLI, donde: "todas", semilla: "GON-01|B|1" }).unidades, r.unidades);
  let corridos = 0;
  for (const f of r.porFila.filter((x) => x.motivo === null)) {
    for (const vn of v.vanos) {
      const enVano = (u) => u.fila === f.fila && Math.abs(u.x - vn.x) <= vn.ancho / 2;
      const ac = P.acomodar(vn.ancho, v.filas.fondos[f.fila], f.libre, CAJA_MUSLI);
      const frente = r.unidades.filter((u) => enVano(u) && u.prof === 0 && u.piso === 0).length;
      assert.ok(ac.frentes - frente <= 1, `entrepaño ${f.fila}, vano ${vn.x}: faltan ${ac.frentes - frente} frentes`);
      if (frente < ac.frentes) {
        corridos++;
        // Detrás del que falta se ve el de atrás: nunca un hueco de punta a punta.
        const desdeX = vn.x - ac.ocupado / 2 + CAJA_MUSLI.ancho / 2;
        const col = (u) => Math.round((u.x - desdeX) / ac.pasoX);
        const delFrente = new Set(r.unidades.filter((u) => enVano(u) && u.prof === 0).map(col));
        const falta = [...Array(ac.frentes).keys()].filter((c) => !delFrente.has(c));
        assert.equal(falta.length, 1);
        assert.ok(r.unidades.some((u) => enVano(u) && u.prof === 1 && u.piso === 0 && col(u) === falta[0]),
          "un frente corrido sin la unidad de atrás: un hueco de punta a punta");
      }
    }
  }
  assert.ok(corridos > 0, "con un solo arte en 3,6 m no hay ningún frente corrido: sigue siendo papel de colgadura");
  // Nunca con una sola de fondo (sería un hueco al frente) ni con surtido.
  const unaDeFondo = F.unidadesDePrueba({ venta: v, empaque: CAJA_MUSLI, donde: "todas", semilla: "GON-01|B|1", profundidad: 1 });
  for (const f of unaDeFondo.porFila.filter((x) => x.motivo === null)) {
    assert.equal(unaDeFondo.unidades.filter((u) => u.fila === f.fila && u.prof === 0 && u.piso === 0).length, f.frentes, "frente corrido con una sola de fondo");
  }
  const conSurtido = F.unidadesDePrueba({ venta: v, empaque: CAJA_MUSLI, donde: "todas", semilla: "GON-01|B|1", surtido: true });
  for (const f of conSurtido.porFila.filter((x) => x.motivo === null)) {
    assert.equal(conSurtido.unidades.filter((u) => u.fila === f.fila && u.prof === 0 && u.piso === 0).length, f.frentes, "frente corrido con surtido");
  }
  // La punta (0,9 m) no se varía: su frente sigue completo.
  // Dos cajas vecinas giradas no se cruzan: rectángulos girados, misma fila.
  const giradas = r.unidades.filter((u) => u.prof === 0 && u.piso === 0);
  assert.ok(giradas.some((u) => Math.abs(u.giroY) > 1.0 * Math.PI / 180), "ninguna caja gira más de 1°: la de cada cuatro no está");
  assert.ok(giradas.every((u) => Math.abs(u.giroY) <= 1.5 * Math.PI / 180 + 1e-9), "una caja gira más de 1,5°");
  const media = (u) => (CAJA_MUSLI.ancho / 2) * Math.abs(Math.cos(u.giroY)) + (CAJA_MUSLI.fondo / 2) * Math.abs(Math.sin(u.giroY));
  for (const f of new Set(giradas.map((u) => u.fila))) {
    const fila = giradas.filter((u) => u.fila === f).sort((a, b) => a.x - b.x);
    for (let i = 1; i < fila.length; i++) {
      const a = fila[i - 1], b = fila[i];
      if (b.x - a.x > CAJA_MUSLI.ancho * 1.5) continue;   // de otro vano
      assert.ok(b.x - a.x >= media(a) + media(b) - 1e-9, `dos cajas vecinas se cruzan en el entrepaño ${f}: ${(b.x - a.x).toFixed(4)} < ${(media(a) + media(b)).toFixed(4)}`);
    }
  }
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
  // 32 lados (16 se veían facetados de cerca), con filas de más en el
  // hombro (`filasAdaptadas`): hasta 2.200 triángulos.
  assert.ok(g.index ? g.index.count / 3 <= 2200 : vs.length / 3 <= 2200, "la botella pesa demasiado para instanciarse");
  // Las tapas van de UN color (un solo punto de la foto): con la proyección
  // plana repetían la primera fila estirada y salían rayadas.
  const tapa = vs.filter((v) => Math.abs(v.y - 0.165) < 1e-6 && Math.hypot(v.x, v.z) < 0.4 * 0.0525 * 0.99);
  assert.ok(tapa.length > 0, "la botella no tiene tapa");
  for (const v of tapa) assert.ok(Math.abs(v.u - 0.5) < 1e-6 && Math.abs(v.v - 0.985) < 1e-6, `tapa rayada: ${v.u},${v.v}`);
  // El costado del FRENTE no llega al borde exacto de la silueta (contorno y
  // sangrado). La espalda va con su propia uv, de 0 a 1 rodeando por detrás.
  assert.equal(g.groups.length, 2, "la botella del frente no lleva su espalda aparte");
  const idxB = Array.from(g.index.array);
  const delGrupo = (gr) => [...new Set(idxB.slice(gr.start, gr.start + gr.count))].map((i) => vs[i]);
  const costado = delGrupo(g.groups[0]).filter((v) => Math.abs(v.y) < 0.16);
  assert.ok(costado.every((v) => v.u > 0.02 && v.u < 0.98), "el costado toma el contorno de la foto");
});

prueba("la bolsa se para en su fuelle: lomo curvo, ~5 mm en los costados, sello plano y más claro", () => {
  const W = 0.14, H = 0.23, D = 0.06;
  const g = G.geometriaDeEtiqueta("almohada", W, H, D);
  const vs = vertices(g);
  const color = g.attributes.color;
  assert.ok(color, "la bolsa no lleva color de vértice (el sello más claro)");
  const tris = (x) => (x.index ? x.index.count : x.attributes.position.count) / 3;
  // El frente (−Z) a lo alto, por la columna del centro.
  const centro = vs.filter((v) => Math.abs(v.x) < 1e-6 && v.z < 0);
  const maxZ = Math.max(...centro.map((v) => -v.z));
  assert.ok(Math.abs(maxZ - D / 2) < 1e-4, `la panza no llega al fondo de la ficha: ${maxZ}`);
  // La panza al 25-45 % del alto, donde se asienta el arroz.
  const panza = centro.reduce((a, b) => (-b.z > -a.z ? b : a));
  const fPanza = (panza.y + H / 2) / H;
  assert.ok(fPanza >= 0.25 && fPanza <= 0.45, `la panza está al ${(fPanza * 100).toFixed(0)} % del alto`);
  // La base guarda el 60 % o más: se para en el fuelle, no en un filo.
  const base = centro.filter((v) => Math.abs(v.y + H / 2) < 1e-6).map((v) => -v.z);
  assert.ok(base.length && Math.max(...base) >= 0.6 * maxZ, `la base tiene ${Math.max(...base)} de ${maxZ}`);
  // ~5 mm entre las dos caras en los costados (a la altura de la panza), y
  // el lomo de costado es una CURVA: a mitad de camino hacia el costado ya
  // perdió espesor.
  for (const lado of [-1, 1]) {
    const enX = (x) => vs.filter((v) => Math.abs(v.x - x) < 1e-6 && Math.abs(v.y - panza.y) < 1e-6);
    const borde = enX((lado * W) / 2);
    const total = Math.max(...borde.map((v) => v.z)) - Math.min(...borde.map((v) => v.z));
    assert.ok(total >= 0.0035 && total <= 0.0065, `el costado ${lado > 0 ? "+X" : "−X"} tiene ${(total * 1000).toFixed(1)} mm`);
    const medio = enX((lado * W) / 4).filter((v) => v.z < 0).map((v) => -v.z);
    assert.ok(Math.max(...medio) < maxZ * 0.97 && Math.max(...medio) > (total / 2) * 1.5, "el lomo no es una curva");
  }
  // El sello: una aleta PLANA de 1,2 cm y 3 mm, más clara (1,08).
  const sello = vs.map((v, i) => ({ ...v, i })).filter((v) => v.y >= H / 2 - 0.012 + 0.0011);
  assert.ok(sello.length > 0, "la bolsa no tiene sello");
  assert.ok(sello.every((v) => Math.abs(v.z) <= 0.0015 + 1e-6), "el sello no es plano");
  const anchoDelSello = Math.max(...sello.map((v) => v.z)) - Math.min(...sello.map((v) => v.z));
  assert.ok(anchoDelSello >= 0.0025 && anchoDelSello <= 0.0035, `el sello tiene ${(anchoDelSello * 1000).toFixed(1)} mm`);
  assert.ok(sello.every((v) => Math.abs(color.getX(v.i) - 1.08) < 1e-6), "el sello no es más claro");
  const cuerpo = vs.map((v, i) => i).filter((i) => vs[i].y < H / 2 - 0.014);
  assert.ok(cuerpo.every((i) => color.getX(i) === 1), "el cuerpo cambió de color");
  // Debajo del sello ya hay bolsa: la aleta mide 1,2 cm, no media bolsa.
  assert.ok(centro.some((v) => v.y < H / 2 - 0.013 && v.y > H / 2 - 0.03 && -v.z > 0.0015 * 1.5), "el sello mide más de 1,2 cm");
  // Las normales hacia afuera: cada triángulo mira lejos del centro.
  const p = g.attributes.position, ix = g.index.array;
  let malos = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map((k) => [p.getX(k), p.getY(k), p.getZ(k)]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.hypot(...n) < 1e-12) continue;
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] <= 0) malos++;
  }
  assert.equal(malos, 0, `${malos} triángulos de la bolsa miran hacia adentro`);
  // Tope: 2.000 triángulos el frente, menos de la mitad lo de atrás.
  const atras = G.geometriaDeEtiqueta("almohada", W, H, D, undefined, false, false, 0, "bajo");
  assert.notEqual(atras, g, "el caché confunde el detalle de la bolsa");
  assert.ok(tris(g) <= 2000, `la bolsa del frente pesa ${tris(g)}`);
  assert.ok(tris(atras) < tris(g) / 2, `la de atrás pesa ${tris(atras)} contra ${tris(g)}`);
  // Y el recorte plano mira al pasillo, sin espejar.
  const recorte = vertices(G.geometriaDeEtiqueta("recorte", 0.1, 0.2, 0.05));
  assert.ok(recorte.every((v) => v.nz < -0.99), "el recorte no mira al pasillo");
  for (const v of recorte) assert.ok(Math.abs(v.u - (0.5 - v.x / 0.1)) < 1e-6, "el recorte salió espejado");
  // El material de la bolsa prende los colores de vértice, sólo para el sello.
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(etiqueta, /\.\.\.\(envase === "almohada" \? \{ vertexColors: true \} : \{\}\)/);
});

prueba("el respaldo de la góndola es una cara sola: desde el eje no se ve de canto (las líneas del copete)", () => {
  // La bisección de la ronda 2: dos líneas verticales de 1 px cruzaban el
  // copete de PUN-01 por «finesse» —la punta pegada a la cabecera de GON-01—.
  // Sin el respaldo de la góndola no estaban; sin la espina, los parantes de
  // punta, el remate, el zócalo, las lamas, la grilla o las sombras, seguían.
  // Su cara de atrás (contra la espina), vista desde el eje de la góndola, es
  // un triángulo casi de canto que en swiftshader pasaba la profundidad a
  // través de la punta.
  const caraSola = G.geometriaRespaldo(1.15, 1.6, false);
  const n = caraSola.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    assert.ok(n.getZ(i) < -0.99, "el respaldo de la góndola tiene una cara que no mira al pasillo");
  }
  // En el mismo plano que la cara de adelante de la caja de antes: el panel
  // se ve igual desde el pasillo (y /taller queda idéntico píxel a píxel).
  const caja = G.geometriaRespaldo(1.15, 1.6);
  const pz = (g) => { const p = g.attributes.position; return Array.from({ length: p.count }, (_, i) => p.getZ(i)); };
  assert.ok(Math.abs(Math.min(...pz(caja)) - Math.min(...pz(caraSola))) < 1e-9, "el respaldo se movió de plano");
  assert.ok(pz(caraSola).every((z) => Math.abs(z - Math.min(...pz(caja))) < 1e-9));
  // La punta conserva la caja: su lomo ES el respaldo (de atrás no hay espina).
  assert.ok(caja.attributes.normal.array.some((v, i) => i % 3 === 2 && v > 0.99), "la punta perdió el lomo del respaldo");
  assert.notEqual(caja, caraSola, "el caché confunde la caja con la cara sola");
  const g = sinComentarios(leer(join(muebles, "GondolaReal.tsx")));
  assert.equal((g.match(/respaldoCerrado=\{false\}/g) ?? []).length, 2, "alguna cara de la góndola volvió al respaldo de caja");
  const pu = sinComentarios(leer(join(muebles, "PuntaReal.tsx")));
  assert.ok(!/respaldoCerrado=\{false\}/.test(pu), "la punta quedó sin lomo: de atrás se ve el interior");
  assert.match(piezasCodigo, /geometriaRespaldo\(ancho, alto, cerrado\)/);
  assert.match(piezasCodigo, /cerrado=\{respaldoCerrado\}/);
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

// ── La pantalla de venta: la luz, la sala, las uniones y el piso (tanda 2) ───
//
// Todo esto se ejecuta: las cuentas de `luzDeVenta.ts` (el gemelo en JS del
// shader), los parches contra los shaders reales de three, la geometría de la
// sala y la cara de estantería armada con un React mínimo.

const THREE_ = await import("three");
const compiladoPL = await build({
  entryPoints: [join(raiz, "src", "utils", "planta.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const PL = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoPL.outputFiles[0].text).toString("base64")
);
const compiladoSA = await build({
  entryPoints: [join(raiz, muebles, "sala.ts")],
  bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
});
const SA = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoSA.outputFiles[0].text).toString("base64")
);
/** Un .tsx compilado con un React mínimo (los componentes se llaman como
 *  funciones; `useMemo` calcula cada vez, `useEffect` no corre). */
async function conReactMinimo(contents) {
  const r = await build({
    stdin: { contents, resolveDir: join(raiz, muebles), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    plugins: [{
      name: "react-minimo",
      setup(b) {
        b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (a) => ({ path: a.path, namespace: "react-minimo" }));
        b.onResolve({ filter: /^@react-three\/fiber$/ }, (a) => ({ path: a.path, namespace: "react-minimo" }));
        b.onLoad({ filter: /.*/, namespace: "react-minimo" }, (a) => ({
          contents: a.path === "react"
            ? "export const memo = (f) => f; export const useMemo = (f) => f(); export const useEffect = (f) => { efectos.push(f); };" +
              "export const efectos = []; export const useCallback = (f) => f; export const createContext = (v) => ({ v }); export const useContext = (c) => c.v;" +
              "export const useState = (v) => [typeof v === \"function\" ? v() : v, () => {}]; export const useRef = (v) => ({ current: v });"
            : a.path === "@react-three/fiber"
              ? "export const useThree = () => ({ invalidate() {} }); export const useFrame = () => {};"
              : "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = 'frag';",
          loader: "js",
        }));
      },
    }],
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}
const PZ = await conReactMinimo(`export { CaraDeEstanteria, useMateriales } from "./piezas"; export { LuzDeVenta } from "./luzDeVenta";`);

/** Las piezas que dibujaría un árbol: mallas e instancias con su geometría y
 *  material. A cada `instancedMesh` le llama la referencia con un nodo falso
 *  que anota si se le puso color por instancia. */
function piezasDe(el, fuera = []) {
  if (el == null || typeof el !== "object") return fuera;
  if (Array.isArray(el)) { el.forEach((x) => piezasDe(x, fuera)); return fuera; }
  if (typeof el.type === "function") return piezasDe(el.type(el.props), fuera);
  if (el.type === "mesh") fuera.push({ tipo: "mesh", geometria: el.props.geometry, material: el.props.material });
  if (el.type === "instancedMesh") {
    const nodo = { colores: [], instanceMatrix: {}, instanceColor: null, setMatrixAt() {}, computeBoundingSphere() {},
      setColorAt(i, c) { this.colores.push(c.r); this.instanceColor = {}; } };
    el.props.ref?.(nodo);
    fuera.push({ tipo: "instancias", geometria: el.props.args[0], material: el.props.args[1], colores: nodo.colores });
  }
  piezasDe(el.props?.children, fuera);
  return fuera;
}
/** Un contexto 2D falso: anota cada texto que se escribe y cada rectángulo
 *  que se pinta. Sin DOM: el dibujo de los habladores es puro. */
function lienzoFalso() {
  const g = {
    textos: [], rects: [], fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "left", textBaseline: "alphabetic",
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, color: this.fillStyle }); },
    strokeRect() {}, measureText: (t) => ({ width: t.length * 7 }),
    fillText(t) { this.textos.push(String(t)); },
  };
  return g;
}
// Los materiales de venta arman la textura de los habladores genéricos en un
// lienzo: en node, uno falso.
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => lienzoFalso() }) };

/** La cara de una punta de 0,9 m armada como la arma `PuntaReal`, en el
 *  editor o en venta. */
function caraDePunta(venta) {
  PZ.LuzDeVenta.v = venta;
  const materiales = PZ.useMateriales(false);
  PZ.LuzDeVenta.v = false;
  const niveles = M.nivelesDePunta(1.8 - M.COPETE.alto);
  return { materiales, piezas: piezasDe(PZ.CaraDeEstanteria({
    anchoTotal: 0.9, vanos: M.vanosDeCorrido(0.9), fondoMaximo: 0.396, alto: 1.8 - M.COPETE.alto,
    niveles, materiales, conRemate: false,
  })) };
}

/** La sede de las pruebas de `probar-planta` (la sembrada de las capturas). */
const SEDE_DE_VENTA = [
  { id: "GON-01", x: 6, z: 4, w: 3.6, d: 0.9, h: 1.8, rotY: 0 },
  { id: "GON-02", x: 6, z: 6.9, w: 3.6, d: 0.9, h: 1.8, rotY: 0 },
  { id: "PUN-01", x: 8, z: 4, w: 0.9, d: 0.4, h: 1.8, rotY: -Math.PI / 2 },
  { id: "PUN-02", x: 8, z: 6.9, w: 0.9, d: 0.4, h: 1.8, rotY: -Math.PI / 2 },
  { id: "PUN-03", x: 4, z: 4, w: 0.9, d: 0.4, h: 1.8, rotY: Math.PI / 2 },
  { id: "ROB-01", x: 8, z: 4.6, w: 0.3, d: 0.4, h: 1.6, rotY: -Math.PI / 2 },
  { id: "NEV-01", x: 11, z: 1.2, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI },
  { id: "NEV-02", x: 12.25, z: 1.2, w: 1.2, d: 0.75, h: 1.8, rotY: Math.PI },
];
const LIM_VENTA = PL.limitesDePlanta(SEDE_DE_VENTA, 2.5);
const GRILLA_VENTA = PL.luminariasDeTienda(LIM_VENTA, SEDE_DE_VENTA).grilla;
const tomaDeVenta = (id, toma) => {
  const f = SEDE_DE_VENTA.find((x) => x.id === id);
  return PL.vistaDeVenta({ cx: f.x, cz: f.z, w: f.w, d: f.d, h: f.h, rotY: f.rotY }, "A", toma,
    { yBajo: 0, yAlto: f.h }, PL.murosDeCaminata(SEDE_DE_VENTA.filter((x) => x.id !== id)), LIM_VENTA);
};
/** La pantalla: el tono de three (ACES filmic, exposición 1) y sRGB, para
 *  pasar una radiancia a niveles de 0 a 255. */
const alaPantalla = (x) => {
  const y = x / 0.6;
  const t = Math.min(1, Math.max(0, (y * (y + 0.0245786) - 0.000090537) / (y * (0.983729 * y + 0.4329510) + 0.238081)));
  return 255 * (t <= 0.0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - 0.055);
};
const deLaPantalla = (s) => { let a = 0, b = 20; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (alaPantalla(m) < s) a = m; else b = m; } return a; };

prueba("en la pantalla de venta el mueble toma la luz del cuarto del producto, y sólo ahí", () => {
  // Medido en la segunda ronda: el blanco del envase en 232-240 sRGB contra
  // 97-112 del porta-precios. Con la luz del cuarto el mueble queda a la par.
  const luz = sinComentarios(leer(join(muebles, "luzDeVenta.ts")));
  assert.match(luz, /#include <emissivemap_fragment>/);
  // Ni entorno de escena ni luz global: la tienda del editor no cambia, y el
  // mapa de entorno en cada mueble hacía cada cuadro 25 veces más caro.
  for (const [n, t] of [["luzDeVenta.ts", luz], ["piezas.tsx", piezasCodigo], ["NeveraReal.tsx", neveraCodigo]]) {
    assert.ok(!/scene\.environment\s*=|hemisphereLight|envMap:\s*luz/.test(t), `${n} ilumina toda la escena o muestrea un mapa de entorno por mueble`);
  }
  assert.match(piezasCodigo, /\.\.\.conLuzDeVenta\(luz, K_ENTORNO_MUEBLE, brillo\),/, "el herraje de la góndola y la punta no recibe la luz de venta");
  assert.match(piezasCodigo, /\}, \[ghost, statusColor, luz\]\);/, "los materiales no se rearman al entrar o salir de la pantalla de venta");
  // La escena la prende sólo para quien mira (Presentar y la lámina).
  assert.match(cuerpoEscena, /<LuzDeVenta\.Provider value=\{privadoPara !== undefined\}>/);
  // Ejecutado: en el editor no agrega nada; en venta, el parche suma la luz
  // después de la emisión con la intensidad de SU uniforme, y sin el trozo
  // no rompe el shader.
  assert.deepEqual(LV.conLuzDeVenta(false), {}, "el editor recibe la luz de venta");
  const venta = LV.conLuzDeVenta(true, 0.9, 0.3);
  const conTrozo = { fragmentShader: "a\nvoid main() {\n#include <emissivemap_fragment>\nb", uniforms: {} };
  venta.onBeforeCompile(conTrozo);
  assert.match(conTrozo.fragmentShader, /#include <emissivemap_fragment>\n\{[\s\S]*totalEmissiveRadiance \+= uLuzVenta \* diffuseColor\.rgb \* mix\(/);
  assert.match(conTrozo.fragmentShader, /uniform float uLuzVenta;\s*uniform float uBrillo;[\s\S]*void main\(\) \{/);
  const sinTrozo = { fragmentShader: "a\nb", uniforms: {} };
  venta.onBeforeCompile(sinTrozo);
  assert.equal(sinTrozo.fragmentShader, "a\nb");
});

prueba("la luz de venta es UN programa: intensidad y brillo son uniformes de cada material", () => {
  const luz = sinComentarios(leer(join(muebles, "luzDeVenta.ts")));
  // Eran cuatro programas (1,15; 0,92; 0,69; 1,035), uno por intensidad.
  const claves = new Set([[1.15, 0.35], [0.92, 0.15], [0.69, 0.35], [1.035, 0.45], [0.5, 0]]
    .map(([i, b]) => LV.conLuzDeVenta(true, i, b).customProgramCacheKey()));
  assert.equal(claves.size, 1, "una clave de programa por intensidad: cada una recompila");
  // Cada material, SUS uniformes —three llama a onBeforeCompile por material
  // aunque reuse el programa—, enganchados en `shader.uniforms` y guardados
  // en `userData` para atenuarlos sin recompilar.
  const a = LV.conLuzDeVenta(true, 1.15, 0.35), b = LV.conLuzDeVenta(true, 0.92, 0.15);
  const sa = { fragmentShader: "void main() {\n#include <emissivemap_fragment>", uniforms: {} };
  const sb = { fragmentShader: "void main() {\n#include <emissivemap_fragment>", uniforms: {} };
  a.onBeforeCompile(sa); b.onBeforeCompile(sb);
  assert.equal(sa.uniforms.uLuzVenta, a.userData.luzDeVenta.uLuzVenta, "el uniforme del programa no es el del material");
  assert.equal(sa.uniforms.uBrillo, a.userData.luzDeVenta.uBrillo);
  assert.notEqual(sa.uniforms.uLuzVenta, sb.uniforms.uLuzVenta, "dos materiales comparten la intensidad");
  assert.equal(sa.uniforms.uLuzVenta.value, 1.15);
  assert.equal(sb.uniforms.uBrillo.value, 0.15);
  assert.deepEqual(a.userData.luzDeVenta.base, { luz: 1.15, brillo: 0.35 });
  // Los de la tienda son los MISMOS objetos en todos los materiales.
  for (const k of Object.keys(LV.UNIFORMES_DE_TIENDA)) {
    assert.equal(sa.uniforms[k], LV.UNIFORMES_DE_TIENDA[k], `${k} no es el uniforme compartido`);
    assert.equal(sb.uniforms[k], LV.UNIFORMES_DE_TIENDA[k]);
  }
  // Los materiales declarativos del robatope, con props ESTABLES: con
  // `conLuzDeVenta` en cada render los uniformes del programa quedaban
  // huérfanos.
  const cuerpoRobatope = cuerpoDe("function ChapaDeRobatope(", "function RistraMesh(");
  assert.ok(!/conLuzDeVenta\(/.test(cuerpoRobatope), "el robatope arma la luz de venta en cada render");
  assert.match(cuerpoRobatope, /usePropsDeLuzDeVenta\(luz, K_ENTORNO_MUEBLE, BRILLO\.robatope\)/);
  assert.match(luz, /export function usePropsDeLuzDeVenta[\s\S]{0,200}useMemo\(\(\) => conLuzDeVenta\(venta, intensidad, brillo\), \[venta, intensidad, brillo\]\)/);
  // Ninguno de los que arman materiales los rehace por una intensidad: el
  // brillo de cada pieza es una constante de `BRILLO`.
  assert.match(neveraCodigo, /const venta = \(base: number, brillo: number\) => conLuzDeVenta\(luz, K_ENTORNO_MUEBLE \* base, brillo\);/);
});

prueba("el parche encuentra en los shaders de three 0.184 lo que usa", () => {
  const { ShaderLib, ShaderChunk } = THREE_;
  // Con los trozos resueltos: en el Lambert, `vViewPosition` la declara
  // `lights_lambert_pars_fragment`, que se incluye antes de main.
  const resuelto = (t) => t.replace(/#include <(\w+)>/g, (m, n) => (ShaderChunk[n] !== undefined && !/_fragment$/.test(n.replace(/_pars_fragment$/, "")) ? ShaderChunk[n] : m));
  const programa = readFileSync(join(raiz, "node_modules", "three", "src", "renderers", "webgl", "WebGLProgram.js"), "utf8");
  // cameraPosition y viewMatrix los declara three en el prefijo del fragmento.
  const prefijo = programa.slice(programa.indexOf("prefixFragment = ["));
  assert.match(prefijo, /'uniform mat4 viewMatrix;'/);
  assert.match(prefijo, /'uniform vec3 cameraPosition;'/);
  for (const [nombre, f] of [["standard", resuelto(ShaderLib.standard.fragmentShader)], ["lambert", resuelto(ShaderLib.lambert.fragmentShader)]]) {
    assert.ok(f.includes("#include <emissivemap_fragment>") && f.includes("void main() {"), `${nombre}: sin el trozo`);
    assert.ok(f.indexOf("varying vec3 vViewPosition;") >= 0 && f.indexOf("varying vec3 vViewPosition;") < f.indexOf("void main() {"),
      `${nombre}: vViewPosition no está declarada antes de main`);
    assert.ok(f.indexOf("#include <normal_fragment_begin>") < f.indexOf("#include <emissivemap_fragment>"),
      `${nombre}: la emisión va antes de la normal`);
    assert.ok(f.indexOf("#include <color_fragment>") < f.indexOf("#include <emissivemap_fragment>"),
      `${nombre}: el color de vértice (la oclusión) llega tarde`);
  }
  const est = ShaderLib.standard.fragmentShader;
  assert.ok(est.indexOf("#include <roughnessmap_fragment>") < est.indexOf("#include <emissivemap_fragment>"), "roughnessFactor llega tarde");
  // Parcheado: las funciones de la tienda quedan antes de main y DESPUÉS de
  // la declaración de vViewPosition, y el bloque después de la emisión.
  const s = { fragmentShader: est, uniforms: {} };
  LV.conLuzDeVenta(true).onBeforeCompile(s);
  const f = s.fragmentShader;
  assert.ok(f.indexOf("varying vec3 vViewPosition;") < f.indexOf("vec3 tiendaPosicion()"));
  assert.ok(f.indexOf("vec3 tiendaPosicion()") < f.indexOf("void main() {"));
  assert.ok(f.indexOf("#include <emissivemap_fragment>") < f.indexOf("tiendaReflejo( pDeVenta"));
  assert.match(f, /#ifdef USE_COLOR\s*float aoDeVenta = vColor\.r;/, "el brillo no se apaga en las uniones");
  // El piso, sobre el Lambert de la baldosa.
  const p = { fragmentShader: ShaderLib.lambert.fragmentShader, uniforms: {} };
  LV.parcheDelPiso({ uSombraPiso: { value: null }, uSombraCaja: { value: new THREE_.Vector4() } }).onBeforeCompile ?? null;
  LV.parcheDelPiso({ uSombraPiso: { value: null }, uSombraCaja: { value: new THREE_.Vector4() } })(p);
  assert.ok(p.fragmentShader.indexOf("#include <map_fragment>") < p.fragmentShader.indexOf("sombraAlPie = texture2D"));
  assert.ok(p.fragmentShader.indexOf("#include <tonemapping_fragment>") < p.fragmentShader.indexOf("gl_FragColor.rgb = min( gl_FragColor.rgb + vec3( reflejoDelPiso )"));
});

prueba("el brillo de las luminarias en el acero, prototipado en JS con las cámaras de venta", () => {
  // La cuenta del borrador —pow(R·arriba, 8) entre el piso y el cielo— daba
  // 0,006 en las caras verticales con estas cámaras. Ésta corta el rayo con
  // el cielo raso y busca la tira en la grilla; tiene que dar un brillo
  // visible en el porta-precios o en el parante de PUN-01, que se mueva entre
  // la toma de frente y la de tres cuartos.
  const f = SEDE_DE_VENTA.find((x) => x.id === "PUN-01");
  const venta = V.ventaDeTipo("punta", f.w, f.d, f.h);
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
  const mundo = (lx, ly, lz) => ({ x: f.x + lx * c + lz * s, y: ly, z: f.z - lx * s + lz * c });
  const normal = (nx, ny, nz) => ({ x: nx * c + nz * s, y: ny, z: -nx * s + nz * c });
  // Las piezas como las monta `PuntaReal` (la cara cuelga en z = d/2 y crece
  // hacia −Z): el frente del porta-precios en cada fila, el frente y el
  // costado de los parantes de las puntas. Con la base medida en pantalla.
  const piezas = [
    { pieza: "porta-precios", base: 205, brillo: LV.BRILLO.precios, rug: 0.82, puntos: venta.filas.alturas.slice(0, -1).flatMap((y, i) =>
      Array.from({ length: 19 }, (_, k) => ({ p: mundo(-0.4 + k * 0.8 / 18, y - 0.015, f.d / 2 - venta.filas.fondos[i] - 0.006), n: normal(0, 0.066, -0.998) }))) },
    ...[-1, 1].map((lado) => ({ pieza: "parante", base: 154, brillo: LV.BRILLO.estructura, rug: 0.45, puntos: Array.from({ length: 16 }, (_, k) => [
      { p: mundo(lado * 0.425, 0.15 + k * 0.1, f.d / 2 - 0.032), n: normal(0, 0, -1) },
      { p: mundo(lado * 0.45, 0.15 + k * 0.1, f.d / 2 - 0.016), n: normal(lado, 0, 0) },
    ]).flat() })),
  ];
  const mejor = {};
  for (const toma of ["frente", "tres_cuartos"]) {
    const v = tomaDeVenta("PUN-01", toma);
    const camara = { x: v.posX, y: v.posY, z: v.posZ };
    let max = { sube: -1 }, mancha = { sobreMedia: -1 };
    for (const pz of piezas) {
      const subas = pz.puntos.map((q) => {
        const b = LV.brilloDeVenta(q.n, camara, q.p, GRILLA_VENTA, LIM_VENTA, pz.rug);
        return { q, b, sube: alaPantalla(deLaPantalla(pz.base) + pz.brillo * b.valor) - pz.base };
      });
      const media = subas.reduce((a, x) => a + x.sube, 0) / subas.length;
      for (const { q, b, sube } of subas) {
        if (sube > max.sube) max = { sube, pieza: pz.pieza, p: q.p };
        // La MANCHA de una luminaria: por encima del promedio de su pieza, no
        // sólo de la base —el canto de una cara vista de lado refleja el
        // techo liso y sube parejo—, y con una tira en el reflejo: la
        // radiancia del techo, el muro o el piso no pasa de 0,6, y la de una
        // luminaria vista a medias, de varias unidades.
        if (b.radiancia > 1.5 && sube - media > mancha.sobreMedia) mancha = { sobreMedia: sube - media, pieza: pz.pieza, p: q.p, radiancia: b.radiancia };
      }
    }
    assert.ok(max.sube >= 15, `${toma}: el brillo más fuerte sube ${max.sube.toFixed(1)} sRGB (${max.pieza})`);
    assert.ok(mancha.sobreMedia >= 15,
      `${toma}: la mancha de una luminaria queda ${mancha.sobreMedia.toFixed(1)} sRGB sobre el promedio de su pieza (${mancha.pieza ?? "ninguna"})`);
    mejor[toma] = mancha;
  }
  const d = Math.hypot(mejor.frente.p.x - mejor.tres_cuartos.p.x, mejor.frente.p.y - mejor.tres_cuartos.p.y, mejor.frente.p.z - mejor.tres_cuartos.p.z);
  assert.ok(d > 0.05, `el brillo no se corre entre la toma de frente y la de tres cuartos (${(d * 100).toFixed(1)} cm)`);
  // Con la cámara sobre el cielo raso (la vista superior) no hay reflejo.
  assert.equal(LV.brilloDeVenta({ x: 0, y: 1, z: 0 }, { x: 8, y: 20, z: 4 }, { x: 8, y: 0.9, z: 4 }, GRILLA_VENTA, LIM_VENTA).valor, 0);
});

prueba("el shader del brillo y su gemelo en JS usan las mismas constantes", () => {
  const glsl = LV.GLSL_DE_TIENDA;
  const s = { fragmentShader: "void main() {\n#include <emissivemap_fragment>", uniforms: {} };
  LV.conLuzDeVenta(true).onBeforeCompile(s);
  const R = LV.REFLEJO;
  for (const [n, x] of [["techo", R.techo], ["luminaria", R.luminaria], ["piso", R.piso], ["muro", R.muro], ["borroso", R.borroso], ["sobreElTecho", R.sobreElTecho]]) {
    assert.ok(glsl.includes(x.toFixed(4)), `el GLSL no usa REFLEJO.${n} (${x})`);
  }
  for (const [n, x] of [["F0", R.F0], ["sesgo", R.sesgo], ["lobulo", R.lobulo], ["1 − lobulo", 1 - R.lobulo]]) {
    assert.ok(s.fragmentShader.includes(x.toFixed(4)), `el parche no usa REFLEJO.${n} (${x})`);
  }
  // La máscara de la grilla: luz en el centro de cada tira, techo entre dos.
  const { instancias } = PL.luminariasDeTienda(LIM_VENTA, SEDE_DE_VENTA);
  for (const l of instancias) assert.ok(LV.mascaraDeLuminarias(l.x, l.z, GRILLA_VENTA, 0.01) > 0.99);
  const a = instancias[0], b = instancias[1];
  assert.ok(LV.mascaraDeLuminarias((a.x + b.x) / 2, (a.z + b.z) / 2, GRILLA_VENTA, 0.01) < 0.01);
  // El borde ensanchado no inventa luz: lo que cubre la tira se conserva.
  let suma = 0;
  for (let k = -200; k <= 200; k++) suma += LV.cobertura(k * 0.01, 0.2, 0.3) * 0.01;
  assert.ok(Math.abs(suma - 0.2) < 0.005, `el borde suavizado suma ${suma.toFixed(3)} m de tira y no 0,2`);
});

prueba("la sala de venta: muros, zócalo, cielo raso y luminarias sólo en venta, mirando hacia adentro", () => {
  // Ejecutado: cada cara de los muros mira hacia el centro, y el cielo raso
  // mira abajo y está a 3,2 m.
  const L = LIM_VENTA;
  const muros = SA.geometriaDeMurosDeVenta(L, PL.ALTO_CIELO_RASO);
  const pos = muros.getAttribute("position"), nor = muros.getAttribute("normal");
  assert.equal(pos.count, 16, "no son cuatro planos en una geometría");
  for (let i = 0; i < pos.count; i++) {
    const hacia = { x: L.cx - pos.getX(i), z: L.cz - pos.getZ(i) };
    assert.ok(nor.getX(i) * hacia.x + nor.getZ(i) * hacia.z > 0, "un muro mira hacia afuera");
    assert.ok(Math.abs(nor.getY(i)) < 1e-6);
  }
  const zocalo = SA.geometriaDeMurosDeVenta(L, 0.12, 0.012);
  const pz = zocalo.getAttribute("position"), nz = zocalo.getAttribute("normal");
  for (let i = 0; i < pz.count; i++) {
    // Cada vértice, 1,2 cm delante de SU muro (en la dirección de su normal).
    const x = pz.getX(i), z = pz.getZ(i), nx = nz.getX(i), nzz = nz.getZ(i);
    const muro = nx > 0.5 ? x - L.minX : nx < -0.5 ? L.maxX - x : nzz > 0.5 ? z - L.minZ : L.maxZ - z;
    // Las posiciones son Float32: 1e-9 no lo cumple nunca.
    assert.ok(Math.abs(muro - 0.012) < 1e-5, "el zócalo no queda delante del muro");
    assert.ok(pz.getY(i) >= -1e-6 && pz.getY(i) <= 0.12 + 1e-6);
  }
  const cielo = SA.geometriaDeCieloRaso(L);
  const nc = cielo.getAttribute("normal"), pc = cielo.getAttribute("position");
  for (let i = 0; i < nc.count; i++) {
    assert.ok(Math.abs(nc.getY(i) + 1) < 1e-6, "el cielo raso no mira abajo");
    assert.ok(Math.abs(pc.getY(i) - PL.ALTO_CIELO_RASO) < 1e-5);
  }
  // Una sola cara (FrontSide), sin sombras, sólo en venta, y con primera
  // persona los muros de siempre y NO los planos (se superponen y titilan).
  const sala = cuerpoDe("function StoreRoom(", "const ALTURA_PERSONA");
  assert.match(sala, /const planos = venta && !primeraPersona;/);
  assert.match(sala, /const geometrias = useMemo\(\(\) => planos \? \{/);
  for (const nombre of ["muros", "zocalos", "cielo"]) {
    assert.match(sala, new RegExp(`<mesh geometry=\\{geometrias\\.${nombre}\\} castShadow=\\{false\\} receiveShadow=\\{false\\}>\\s*<meshLambertMaterial[^>]*side=\\{THREE\\.FrontSide\\}`),
      `${nombre}: no es de una cara o arroja sombra`);
  }
  assert.match(sala, /args=\{\[geometrias\.tira, undefined, luminarias\.instancias\.length\]\}\s*castShadow=\{false\} receiveShadow=\{false\}/);
  assert.match(sala, /<meshBasicMaterial color="#ffffff" toneMapped=\{false\} side=\{THREE\.FrontSide\} \/>/);
  assert.match(sala, /\{primeraPersona && \(\[/, "los muros de la caminata ya no dependen de la primera persona");
  // La caja sale de los límites (con la rotación), no de `f.w / 2`.
  assert.ok(!/f\.w \/ 2|f\.d \/ 2/.test(sala), "StoreRoom vuelve a calcular la caja sin la rotación");
  assert.match(sala, /const \{ cx, cz, w: fw, d: fd \} = limites;/);
  assert.match(cuerpoEscena, /<StoreRoom limites=\{limites\} muebles=\{placedFixtures\}\s*venta=\{privadoPara !== undefined\} primeraPersona=\{firstPerson\} \/>/);
  // Los uniformes de la tienda se actualizan con la planta.
  assert.match(sala, /if \(ponerTienda\(luminarias\.grilla, limites\)\) invalidate\(\);/);
});

prueba("la grilla del piso es del editor: en la pantalla de venta no se dibuja", () => {
  assert.match(cuerpoEscena, /\{privadoPara === undefined && <primitive object=\{gridMinor\} \/>\}/);
  assert.match(cuerpoEscena, /\{privadoPara === undefined && <primitive object=\{gridMajor\} \/>\}/);
  assert.equal((cuerpoEscena.match(/<primitive object=\{grid(Minor|Major)\} \/>/g) ?? []).length, 2, "la grilla se dibuja en otro lado sin condición");
});

prueba("las uniones oscuras: sólo en venta, sin mallas nuevas y ninguna malla sin color con vertexColors", () => {
  const editor = caraDePunta(false), venta = caraDePunta(true);
  // Cero mallas nuevas: la misma cantidad de piezas.
  assert.equal(venta.piezas.length, editor.piezas.length, "la oclusión agregó mallas");
  // En el editor (y en /taller) nada cambia: ningún material con color de
  // vértice, ningún listón con color por instancia, los entrepaños con
  // `pintado` y la geometría de siempre (sin atributo `color`).
  assert.equal(editor.materiales.pintadoAO, null);
  for (const p of editor.piezas) {
    assert.ok(!p.material.vertexColors, "en el editor hay un material con vertexColors");
    assert.ok(!p.colores?.length, "en el editor los listones llevan color por instancia");
  }
  const entrepanosEditor = editor.piezas.filter((p) => p.material === editor.materiales.pintado && p.geometria?.getAttribute("color") === undefined);
  assert.ok(entrepanosEditor.length > 0);
  assert.equal(G.geometriaEntrepano(0.85, 0.37).getAttribute("color"), undefined, "la geometría del editor cambió");
  // En venta: toda malla con vertexColors trae el atributo (si no, sale
  // negra), y hay entrepaños y listones oscurecidos.
  let conAO = 0;
  for (const p of venta.piezas) {
    if (p.material.vertexColors) {
      assert.ok(p.geometria.getAttribute("color"), "una malla sin color de vértice recibe un material con vertexColors");
      conAO++;
    }
  }
  assert.ok(conAO > 0, "en venta ningún entrepaño lleva la sombra de las uniones");
  const listones = venta.piezas.filter((p) => p.tipo === "instancias" && p.material === venta.materiales.panel);
  assert.ok(listones.length > 0 && listones.every((p) => p.colores.length > 0), "los listones no llevan su sombra");
  assert.ok(listones.some((p) => p.colores.some((k) => k < 0.75)), "ningún listón queda en la sombra de un entrepaño");
});

prueba("la sombra de las uniones: cuánto y dónde", () => {
  const ancho = 0.85, fondo = 0.37, t = 0.002;
  const g = G.geometriaEntrepanoDeVenta(ancho, fondo);
  const p = g.getAttribute("position"), col = g.getAttribute("color");
  const a = G.UNION_DE_ENTREPANO;
  let fondoMin = 1, centro = 0, puntas = 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), k = col.getX(i);
    assert.ok(Math.abs(k - G.sombraDeUnion(x, z, ancho)) < 1e-6);
    // La estación de adentro (a 3 cm de la punta): ahí ya no pesa el parante.
    const adentro = Math.abs(Math.abs(x) - (ancho / 2 - a.alcanceParante)) < 1e-6;
    if (-z <= t + 1e-6 && adentro) fondoMin = Math.min(fondoMin, k);
    if (-z > 0.1 && adentro) centro = Math.max(centro, k);
    if (Math.abs(Math.abs(x) - ancho / 2) < 1e-6 && -z > 0.1) puntas = Math.min(puntas, k);
  }
  assert.ok(Math.abs(fondoMin - a.fondo) < 1e-6, `contra el fondo ${fondoMin}`);
  assert.equal(centro, 1);
  assert.ok(Math.abs(puntas - a.parante) < 1e-6, `contra el parante ${puntas}`);
  // La unión con el fondo, al menos un 10 % más oscura que el centro.
  assert.ok(1 - a.fondo >= 0.10);
  // Hay vértice a 5 cm del fondo: si no, el oscuro se estira hasta el labio.
  let a5 = false;
  for (let i = 0; i < p.count; i++) if (Math.abs(-p.getZ(i) - (t + a.alcanceFondo)) < 1e-6) a5 = true;
  assert.ok(a5, "la sección no tiene el punto a 5 cm del fondo");
  // Misma forma que la del editor.
  const e = G.geometriaEntrepano(ancho, fondo); e.computeBoundingBox(); g.computeBoundingBox();
  assert.ok(e.boundingBox.min.distanceTo(g.boundingBox.min) < 0.002 && e.boundingBox.max.distanceTo(g.boundingBox.max) < 0.002);
  // El listón del fondo: bajo el entrepaño en sombra, el siguiente a medias,
  // el de arriba en la unión, y lejos limpio. Al menos un 12 % más oscuro
  // que a media altura.
  const S = G.SOMBRA_DE_LISTON, alto = 0.093, paso = 0.1;
  assert.equal(G.sombraDeListon(1.0 - 0.06, alto, paso, [1.0]), S.debajo);
  assert.equal(G.sombraDeListon(1.0 - 0.16, alto, paso, [1.0]), S.siguiente);
  assert.equal(G.sombraDeListon(1.0 - 0.26, alto, paso, [1.0]), S.tercero);
  assert.equal(G.sombraDeListon(1.0 + 0.06, alto, paso, [1.0]), S.encima);
  assert.equal(G.sombraDeListon(1.0 - 0.4, alto, paso, [1.0]), 1);
  // Se aclara de a poco hacia abajo: nunca un listón más claro arriba que abajo.
  assert.ok(S.debajo < S.siguiente && S.siguiente < S.tercero && S.tercero < 1);
  // EN PANTALLA, no sólo en el albedo. Medido en las tomas desde 1,25 m: el
  // listón de justo debajo de un entrepaño bajo queda tapado por el labio y el
  // porta-precios, y el que se ve es el SEGUNDO. El tono de la escena (ACES,
  // el de three por omisión en R3F) achica la diferencia en los grises claros:
  // con 0,86 un panel a 170 sRGB salía un 7 % más oscuro. El segundo listón
  // tiene que salir al menos un 12 % más oscuro que el panel a media altura,
  // y la unión del entrepaño (contra un entrepaño a ~215) al menos un 10 %.
  const rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const aces = (x) => Math.min(1, Math.max(0, rrt(x / 0.6)));
  const srgb = (l) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
  const entrada = (t) => { let lo = 1e-4, hi = 20; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (srgb(aces(m)) < t) lo = m; else hi = m; } return lo; };
  const enPantalla = (k, base) => srgb(aces(entrada(base) * k)) / base;
  assert.ok(1 - enPantalla(S.siguiente, 170) >= 0.12, `el segundo listón sale ${(100 * (1 - enPantalla(S.siguiente, 170))).toFixed(1)} % más oscuro`);
  assert.ok(1 - enPantalla(S.debajo, 170) >= 0.18);
  // Y contra el panel a media altura DE VERDAD: entre dos entrepaños ningún
  // listón queda limpio y el del medio es el SEGUNDO. Cuando el de justo
  // debajo se ve (una cámara algo más alta, como Presentar en GON-02), la
  // franja bajo el entrepaño tiene que salir un 12 % más oscura que él
  // (medido con 0,62 / 0,74: 148 contra ~160, un 8 %).
  assert.ok(1 - enPantalla(S.debajo / S.siguiente, 160) >= 0.12,
    `bajo el entrepaño sale ${(100 * (1 - enPantalla(S.debajo / S.siguiente, 160))).toFixed(1)} % más oscuro que a media altura`);
  assert.ok(1 - enPantalla(a.fondo, 215) >= 0.10, `la unión sale ${(100 * (1 - enPantalla(a.fondo, 215))).toFixed(1)} % más oscura`);
});

prueba("el piso de venta: sombra al pie y reflejo con la grilla compartida, sólo en venta", () => {
  const sala = cuerpoDe("function StoreRoom(", "const ALTURA_PERSONA");
  assert.match(sala, /const pisoDeVenta = useMemo\(\(\) => \{\s*if \(!venta\) return null;/, "el parche del piso no es sólo de venta");
  assert.match(sala, /material\.onBeforeCompile = parcheDelPiso\(uniformes\);/);
  assert.match(sala, /<meshLambertMaterial map=\{piso\} \/>/, "el piso del editor dejó de ser el de siempre");
  // Los uniformes de la grilla son los COMPARTIDOS, nunca una lista.
  const p = { fragmentShader: THREE_.ShaderLib.lambert.fragmentShader, uniforms: {} };
  const propios = { uSombraPiso: { value: null }, uSombraCaja: { value: new THREE_.Vector4() } };
  LV.parcheDelPiso(propios)(p);
  for (const k of Object.keys(LV.UNIFORMES_DE_TIENDA)) assert.equal(p.uniforms[k], LV.UNIFORMES_DE_TIENDA[k]);
  assert.equal(p.uniforms.uSombraPiso, propios.uSombraPiso);
  assert.ok(!/uniform\s+\w+\s+\w+\s*\[/.test(p.fragmentShader), "el piso recibe una lista de luminarias");
  assert.ok(!/for\s*\(/.test(LV.GLSL_DE_TIENDA), "la tienda recorre algo por píxel");
  // El reflejo: hasta el 12 % del blanco, y en alguna parte del piso de la
  // toma en tres cuartos de la punta, una tira.
  const v = tomaDeVenta("PUN-01", "tres_cuartos");
  const cam = { x: v.posX, y: v.posY, z: v.posZ };
  let max = 0;
  for (let i = 0; i < 160; i++) for (let j = 0; j < 160; j++) {
    const x = LIM_VENTA.minX + (i + 0.5) * LIM_VENTA.w / 160, z = LIM_VENTA.minZ + (j + 0.5) * LIM_VENTA.d / 160;
    max = Math.max(max, LV.reflejoEnElPiso(cam, { x, y: 0, z }, GRILLA_VENTA, LIM_VENTA));
  }
  assert.ok(max <= LV.PISO_DE_VENTA.reflejo + 1e-9 && max > 0.06, `reflejo máximo ${max.toFixed(3)}`);
});

prueba("el vaso lleva su tapa aparte y el costado sin la franja de tapa de la foto", () => {
  const perfil = Array.from({ length: 24 }, (_, k) => 0.8 + 0.2 * (k / 23));
  const ancho = 0.075, alto = 0.09, franja = 0.08;
  const g = G.geometriaDeEtiqueta("revolucion", ancho, alto, ancho, perfil, false, false, franja);
  // El del frente: [0 el frente del costado, 1 la tapa, 2 la espalda].
  assert.equal(g.groups.length, 3, "el vaso no separa costado, tapa y espalda");
  const [lado, tapa, espalda] = g.groups;
  assert.equal(lado.materialIndex, 0);
  assert.equal(tapa.materialIndex, 1);
  assert.equal(espalda.materialIndex, 2);
  const vs = vertices(g);
  // Los grupos cuentan ÍNDICES: los vértices de cada uno, por el índice.
  const idx = g.index ? Array.from(g.index.array) : vs.map((_, i) => i);
  const deGrupo = (gr) => [...new Set(idx.slice(gr.start, gr.start + gr.count))].map((i) => vs[i]);
  const delLado = [...deGrupo(lado), ...deGrupo(espalda)];
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
  // La botella no lleva tapa aparte: su frente y su espalda, nada más (y la
  // de atrás, sin grupos).
  assert.deepEqual(G.geometriaDeEtiqueta("revolucion", 0.1, 0.3, 0.1, perfil, false, true).groups.map((x) => x.materialIndex), [0, 2]);
  assert.equal(G.geometriaDeEtiqueta("revolucion", 0.1, 0.3, 0.1, perfil, false, true, 0, "bajo").groups.length, 0);
  // Y quien dibuja le pasa la franja de la foto y los dos materiales.
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /vaso \? x\.etiqueta\.tapa\(\)\.franja : 0/);
  const etiqueta = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(etiqueta, /lista\.push\(transparente \? foto : materialConLuz\(envase, entorno, \{\s*map: et\.texturaDeTapa\(\)/,
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
  assert.match(dp, /<Unidades\s*unidades=\{pr\.atras\}\s*geometria=\{pr\.geometriaAtras\}/, "lo de atrás se dibuja con el detalle del frente");
  assert.match(dp, /const geometriaAtras = e\.envase === "revolucion" \|\| e\.envase === "almohada" \? geometriaCon\("bajo"\) : geometria;/);
  assert.match(dp, /atras: juntas \? \[\] : unidades\.filter\(\(u\) => u\.prof > 0\)/);
  // Juntas sólo si es LA MISMA geometría y el mismo material (la caja): una
  // llamada menos por fila, y lo de atrás de un torneado sigue en 12 lados.
  assert.match(dp, /const juntas = k\.geometriaAtras === k\.geometria && k\.materialAtras === k\.material;/);
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
  assert.match(dp, /fila\.delFrente\.push\(\.\.\.unidades\.filter\(\(u\) => u\.piso === 0 && u\.prof === 0\)\.map\(medida\)\)/);
  // Hija del grupo de la fila: entre su apertura y el cierre del mapa de
  // filas (los productos del surtido van en grupos propios adentro).
  const i = dp.indexOf("<group key={f.fila} position={[0, f.apoyo, 0]} rotation={[f.giro, 0, 0]}>");
  const j = dp.indexOf("))}", dp.indexOf("<Sombras", i));
  assert.ok(i > 0 && j > i && dp.slice(i, j).includes("<TiraDeFila"), "la sombra de la fila no es hija de la fila");
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

prueba("la toma re-encuadra las rejillas que llegan tarde, sin pisar un giro a mano; la lámina dice la exhibición", () => {
  // Las automáticas existen recién con la foto: pedida antes, la toma
  // encuadraba las rejillas de fábrica y la 2 L quedaba cortada.
  // Desde Presentar a pantalla completa (tanda 3) es UN efecto con la clave
  // del pedido, el tamaño y las filas: ver «la toma sigue al tamaño».
  const efecto = cuerpoDe("const claveDeLaToma = pedidoDeToma", "function handleSceneDoubleClick");
  assert.match(efecto, /const otrasFilas = !sinArte && filas !== hecha\.filas;/, "re-encuadra sin que cambien las filas (o con el «Hoy» de la lámina)");
  assert.match(efecto, /if \(!otroTamano && !otrasFilas\) return;/, "re-encuadra sin que cambie nada");
  assert.match(efecto, /camera\.position\.distanceTo\(hecha\.pos\) < 1e-3/, "re-encuadra aunque la cámara se haya movido a mano");
  assert.match(efecto, /if \(!quieta\) return;/);
  assert.match(efecto, /\}, \[claveDeLaToma, firstPerson, sinArte, placedFixtures\]\);/, "no se entera cuando llegan las filas");
  assert.match(efecto, /tomaDeVenta\(fix, pedidoDeToma\.cara, pedidoDeToma\.toma, pedidoDeToma\.holgura\);\s*recordarToma\(pedidoDeToma\);/,
    "la toma no recuerda qué filas encuadró");
  // La lámina: «Hoy» con las de fábrica, «Con …» con las acomodadas, y el pie
  // lo dice.
  const lamina = cuerpoDe("const exportarPropuesta = useCallback(", "const selectedSlot = selectedFix");
  assert.match(lamina, /estadoDeEscena\.current\.rejillasAcomodadas\.includes\(`\$\{fix\.id\}\|\$\{cara\}`\)/);
  assert.match(lamina, /exhibicion: conRejillas \? "rejillas acomodadas para este producto" : undefined/);
  assert.match(editorCodigo, /if \(p\.pruebaA\?\.filas\) acomodadas\.push\(`\$\{id\}\|A`\);/);
});

prueba("los grupos de cada envase cubren todos los índices y apuntan a un material que existe", () => {
  // Índices FIJOS en los torneados: 0 la foto, 1 la tapa, 2 la espalda. Antes
  // el orden cambiaba por envase, y un grupo con el índice 2 sobre una lista
  // de dos apuntaba a nada sin que tsc lo viera.
  const largoDeLista = (envase) => (envase === "caja" ? 2 : envase === "revolucion" ? 3 : 1);
  const perfiles = [
    Array.from({ length: 64 }, (_, k) => 0.8 + 0.2 * (k / 63)),
    Array.from({ length: 64 }, (_, k) => (k < 40 ? 1 : k < 48 ? 1 - (k - 39) * 0.08 : 0.35)),
  ];
  const casos = [];
  for (const detalle of ["alto", "bajo"]) {
    for (const perfil of perfiles) {
      casos.push([`vaso ${detalle}`, "revolucion", G.geometriaDeEtiqueta("revolucion", 0.075, 0.09, 0.075, perfil, false, false, 0.04, detalle)]);
      casos.push([`botella ${detalle}`, "revolucion", G.geometriaDeEtiqueta("revolucion", 0.105, 0.33, 0.105, perfil, false, true, 0, detalle)]);
      casos.push([`botella acostada ${detalle}`, "revolucion", G.geometriaDeEtiqueta("revolucion", 0.33, 0.105, 0.105, perfil, true, true, 0, detalle)]);
    }
  }
  casos.push(["caja", "caja", G.geometriaDeEtiqueta("caja", 0.19, 0.27, 0.065)]);
  casos.push(["bolsa", "almohada", G.geometriaDeEtiqueta("almohada", 0.14, 0.23, 0.06)]);
  for (const [nombre, envase, g] of casos) {
    const total = g.index ? g.index.count : g.attributes.position.count;
    if (g.groups.length === 0) continue;   // sin grupos: un material solo (ver abajo)
    const grupos = [...g.groups].sort((a, b) => a.start - b.start);
    let fin = 0;
    for (const gr of grupos) {
      assert.equal(gr.start, fin, `${nombre}: hueco o solape en los índices (${gr.start} después de ${fin})`);
      fin = gr.start + gr.count;
      assert.ok(gr.materialIndex < largoDeLista(envase), `${nombre}: el grupo apunta al material ${gr.materialIndex}`);
    }
    assert.equal(fin, total, `${nombre}: los grupos no cubren todos los índices`);
    // El frente es UN solo rango contiguo (una sola llamada por instancia).
    if (envase === "revolucion") {
      assert.equal(g.groups.filter((x) => x.materialIndex === 0).length, 1, `${nombre}: el frente va en dos rangos`);
    }
  }
  // Quien dibuja elige por geometría: la lista si tiene grupos, el primero si
  // no. Una InstancedMesh con lista y sin grupos no dibuja nada.
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /const materialPara = \(g: THREE\.BufferGeometry\) => \(g\.groups\.length > 0 \? materiales : materiales\[0\]\);/);
  assert.match(dp, /material: materialPara\(geometria\)/);
  assert.match(dp, /materialAtras: materialPara\(geometriaAtras\)/);
  assert.match(dp, /material=\{pr\.materialAtras\}/, "lo de atrás se dibuja con la lista del frente");
});

prueba("la espalda del torno: media vuelta por detrás, de +X a −X, con la v del frente", () => {
  const perfil = Array.from({ length: 64 }, () => 1);
  const g = G.geometriaDeEtiqueta("revolucion", 0.1, 0.3, 0.1, perfil, false, true);
  const vs = vertices(g);
  const idx = Array.from(g.index.array);
  const [frente, espalda] = g.groups;
  const de = (gr) => [...new Set(idx.slice(gr.start, gr.start + gr.count))].map((i) => vs[i]);
  // El frente está del lado del pasillo (−Z) y la espalda detrás (+Z).
  assert.ok(de(frente).every((v) => v.z <= 1e-6), "el frente tiene vértices detrás");
  assert.ok(de(espalda).every((v) => v.z >= -1e-6), "la espalda tiene vértices adelante");
  // La uv de la espalda: 0 en +X, 0,5 atrás, 1 en −X; la v como el frente.
  const lado = de(espalda).filter((v) => Math.abs(v.y) < 0.14 && Math.hypot(v.x, v.z) > 0.01);
  for (const v of lado) {
    const phi = Math.atan2(v.z, v.x);               // 0 en +X, π/2 en +Z, π en −X
    const esperado = Math.max(0, Math.min(1, (phi < -1e-6 ? phi + 2 * Math.PI : phi) / Math.PI));
    assert.ok(Math.abs(v.u - esperado) < 1e-3, `u=${v.u} en φ=${phi}`);
    assert.ok(Math.abs(v.v - (0.5 + v.y / 0.3)) < 1e-4, "la v de la espalda no es la del frente");
  }
  // Mismo número de triángulos que el torno entero (no suma llamadas de más
  // que la del grupo nuevo).
  const tris = idx.length / 3;
  assert.ok(tris <= 2200, `${tris}`);
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
  assert.match(etiqueta, /const conLiquido = \(\) => \(llena \?\?= llenarBotella\(erosionarYSangrar\(recorte, 4, 10\)\)\);/);
  assert.match(etiqueta, /texturaDeBotella: \(\) => una\("botella", \(\) => aplanar\(conLiquido\(\)\)\)/);
  // La espalda sale de la MISMA botella llena (con su alfa) o del borde.
  assert.match(etiqueta, /espaldaDeEtiqueta\(b, L \? filasDeEtiqueta\(b, L\) : undefined\)/);
  assert.match(etiqueta, /una\("espalda", \(\) => espaldaDeEtiqueta\(conBorde\(\)\)\)/);
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
  assert.match(dp, /const materialPara = \(g: THREE\.BufferGeometry\) => \(g\.groups\.length > 0 \? materiales : materiales\[0\]\);/);
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
      // La escena (para `invalidate`): sin lienzo, nada que redibujar.
      b.onResolve({ filter: /^@react-three\/fiber$/ }, (a) => ({ path: a.path, namespace: "react-minimo" }));
      b.onLoad({ filter: /.*/, namespace: "react-minimo" }, (a) => ({
        contents: a.path === "react"
          ? "export const memo = (f) => f; export const useMemo = (f) => f(); export const useEffect = () => {};" +
            "export const useCallback = (f) => f; export const createContext = (v) => ({ v }); export const useContext = (c) => c.v;"
          : a.path === "@react-three/fiber"
            ? "export const useThree = () => ({ invalidate() {} }); export const useFrame = () => {};"
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
  assert.match(editorCodigo, /privadoPara !== undefined \? prueba : pruebasDeLaReunion\(prueba, catalogo, supplierDeReunion, eligiendo\)/);
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
  // Y con el selector abierto sin proveedor tampoco se nombra (tanda 3).
  assert.match(vista, /const ajena = !!probando && \(deReunion != null \? probando\.supplier_id !== deReunion : eligiendo\);/);
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
  // Las rejillas: las MISMAS que dibuja la nevera (`rejillasDeLaPrueba`, con
  // lo elegido en la sesión), y el resumen se cuenta sobre ellas.
  assert.match(panel, /rejillasDeLaPrueba\(venta, empaque, como\.rejillas\)/, "el panel no cuenta con las rejillas que se dibujan");
  assert.match(panel, /venta && rejillas\?\.filas \? \{ \.\.\.venta, filas: rejillas\.filas \} : venta/);
  // «Volver a pararla» vuelve a las automáticas (y en la nevera a «Toda la cara»).
  assert.match(panel, /\{ acostado: false, rejillas: undefined, donde: "todas" \}/, "«Volver a pararla» deja las rejillas a mano o de fábrica");
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

// ── El cabezote de la nevera: un aviso luminoso, no una plancha de stickers ──

const compiladoPO = await build({
  entryPoints: [join(raiz, muebles, "pop.ts")],
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
const PO = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoPO.outputFiles[0].text).toString("base64")
);

/** Un contexto 2D falso que anota lo que se dibuja. */
function pincelFalso() {
  const r = { recortes: [], enteras: [], textos: 0, rellenos: 0 };
  const degrade = () => ({ addColorStop() {} });
  const g = {
    fillStyle: null,
    fillRect() { r.rellenos++; },
    drawImage(...a) { (a.length === 9 ? r.recortes : r.enteras).push(a); },
    createLinearGradient: degrade, createRadialGradient: degrade,
    fillText() { r.textos++; }, strokeText() { r.textos++; },
  };
  return { g, r };
}
const FUENTE = {
  lienzo: { width: 80, height: 300 },
  recorte: { colorDominante: "#c81e1e" },
  franja: () => ({ desde: 0.37, hasta: 0.6, x0: 0.125, x1: 0.875 }),
};

prueba("el cabezote de la nevera es un aviso: un recorte grande de la etiqueta, retroiluminado y sólo al frente", () => {
  // Apaisado (1,16 m × 8,7 cm → 1024 × 77): UN recorte de la franja, al 70 %
  // del alto o más, y a lo sumo dos unidades enteras; nada de texto.
  const W = 1024, H = 77;
  const { g, r } = pincelFalso();
  PO.dibujarCartel(g, W, H, FUENTE, true);
  assert.equal(r.recortes.length, 1, `el cabezote lleva ${r.recortes.length} recortes de la etiqueta: una fila de miniaturas`);
  assert.ok(r.enteras.length <= 2, `${r.enteras.length} unidades enteras`);
  assert.equal(r.textos, 0, "el cabezote escribe texto que el proveedor no puso");
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = r.recortes[0];
  assert.ok(dh >= 0.7 * H, `el recorte ocupa ${((dh / H) * 100).toFixed(0)} % del alto`);
  assert.ok(Math.abs(dx + dw / 2 - W / 2) < 1, "el recorte no va centrado");
  assert.ok(dy >= 0 && dy + dh <= H, "el recorte se sale del cartel");
  // La franja de la ETIQUETA y recortada a su silueta (sin el PET).
  assert.equal(sy, Math.round(0.37 * 300)); assert.equal(sh, Math.round(0.23 * 300));
  assert.equal(sx, 10); assert.equal(sw, 60);
  // Sin franja (un vaso): la del medio, como antes.
  const sinFranja = pincelFalso();
  PO.dibujarCartel(sinFranja.g, W, H, FUENTE, false);
  assert.equal(sinFranja.r.recortes[0][2], Math.round(0.34 * 300));
  // El copete de la punta (casi cuadrado) sigue con su héroe y sus dos chicos.
  const copete = pincelFalso();
  PO.dibujarCartel(copete.g, 1024, 400, FUENTE, false);
  assert.equal(copete.r.recortes.length, 0);
  assert.equal(copete.r.enteras.length, 3);
  // La clave del caché distingue el retroiluminado y la franja: el copete de
  // la punta y un cabezote de las mismas medidas no se pisan.
  const a = PO.claveDeCopete("catalogo:1:auto", 1.16, 0.0868);
  assert.notEqual(a, PO.claveDeCopete("catalogo:1:auto", 1.16, 0.0868, { retroiluminado: true }));
  assert.notEqual(a, PO.claveDeCopete("catalogo:1:auto", 1.16, 0.0868, { franja: true }));
  const pop = sinComentarios(leer(join(muebles, "pop.ts")));
  assert.match(pop, /const clave = claveDeCopete\(et\.clave, ancho, alto, opciones\);/, "el caché no usa la clave con el retroiluminado");
  assert.match(pop, /materialImpreso\(textura, entorno, !!opciones\.retroiluminado\)/);
  const et = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(et, /\.\.\.\(retroiluminado \? \{ emissiveIntensity: 2 \* K_EMISION \} : \{\}\)/, "el cabezote no se lee retroiluminado");
  // La nevera lo pide retroiluminado, con la franja de la etiqueta si es una
  // botella transparente.
  assert.match(cuerpoNeveraMesh, /retroiluminado: true, franja: !!pa\.empaque\?\.transparente,/);
  // La marca, sólo en la cara −Z (índice 5) de la chapa; los cantos, neutros.
  assert.match(neveraCodigo, /cabezote \? \[m\.interior, m\.interior, m\.interior, m\.interior, m\.interior, cabezote\] : m\.interior/,
    "la marca del cabezote sale en los seis lados de la chapa");
  assert.match(neveraCodigo, /material=\{chapaDelCabezote\}/);
});

// ── Los habladores, los vecinos y el mueble contratado entero (tanda 2) ─────
//
// Todo CORRIDO: el texto de los habladores con un contexto 2D falso, la tira
// real de cada mueble armada con el React mínimo (la z del hablador se mide
// contra su caja, no contra la cuenta que la copia), los uniformes de un
// vecino después de correr sus efectos.

const compiladoH = await build({
  entryPoints: [join(raiz, muebles, "habladores.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
});
const H = await import(
  "data:text/javascript;base64," + Buffer.from(compiladoH.outputFiles[0].text).toString("base64")
);
const MV = await conReactMinimo(`
  export { GondolaReal } from "./GondolaReal"; export { PuntaReal } from "./PuntaReal";
  export { NeveraReal, apagarElFrio, FRIO_APAGADO, EMISION_DE_FRIO } from "./NeveraReal";
  export { ProductoEnGondola } from "./ProductoEnGondola";
  export { useHabladoresDeRelleno } from "./ProductoEnMueble";
  export { LuzDeVenta, FocoDeVenta, ATENUACION, uniformesDe } from "./luzDeVenta";
  export { efectos } from "react";
`);

/** Las mallas de un árbol, cada una con su matriz en coordenadas del mueble
 *  (la composición de `position` y `rotation` de cada grupo hasta ella). */
function mallasDe(el, padre = new THREE_.Matrix4(), fuera = []) {
  if (el == null || typeof el !== "object") return fuera;
  if (Array.isArray(el)) { el.forEach((x) => mallasDe(x, padre, fuera)); return fuera; }
  if (typeof el.type === "function") return mallasDe(el.type(el.props), padre, fuera);
  let m = padre;
  if (el.type === "group" || el.type === "mesh" || el.type === "instancedMesh") {
    const p = el.props.position ?? [0, 0, 0], r = el.props.rotation ?? [0, 0, 0];
    const s = el.props.scale ?? 1;
    m = padre.clone().multiply(new THREE_.Matrix4().compose(
      new THREE_.Vector3(...p), new THREE_.Quaternion().setFromEuler(new THREE_.Euler(...r)),
      Array.isArray(s) ? new THREE_.Vector3(...s) : new THREE_.Vector3(s, s, s)));
  }
  if (el.type === "mesh") fuera.push({ geometria: el.props.geometry, material: el.props.material, matriz: m });
  if (el.type === "instancedMesh") fuera.push({ geometria: el.props.args?.[0], material: el.props.args?.[1], matriz: m, instancias: true });
  mallasDe(el.props?.children, m, fuera);
  return fuera;
}
/** La tira del porta-precios (`geometriaPortaPrecios`): 30 mm de alto y 8 de
 *  fondo. Su caja local va de y = 0 a `alto` y de z = 0 (la cara de adelante)
 *  a 8 mm hacia atrás. */
const esTira = (g) => {
  if (!g?.isBufferGeometry) return false;
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE_.Vector3());
  return Math.abs(s.y - M.PORTA_PRECIOS.alto) < 1e-6 && Math.abs(s.z - 0.008) < 1e-6;
};
/** Dónde cae un hablador del producto de prueba, en coordenadas del mueble:
 *  los mismos grupos que arma `ProductoDePrueba` (el giro del robatope, la
 *  cara en su montaje, la fila en su apoyo y con su giro). */
function dondeVaElHablador(venta, tipo, c, fila, x) {
  const f = F.unidadesDePrueba({ venta, empaque: VASO, donde: "todas", semilla: "h" }).porFila.find((p) => p.fila === fila);
  const labio = M.labioDeFila(tipo, venta, fila);
  const cara = venta.caras[c];
  const m = new THREE_.Matrix4();
  if (venta.grupoGiro) m.multiply(new THREE_.Matrix4().makeRotationX(venta.grupoGiro));
  m.multiply(new THREE_.Matrix4().makeTranslation(0, 0, cara.montaje));
  if (cara.hacia === 1) m.multiply(new THREE_.Matrix4().makeRotationY(Math.PI));
  m.multiply(new THREE_.Matrix4().makeTranslation(0, f.apoyo, 0)).multiply(new THREE_.Matrix4().makeRotationX(f.giro));
  return new THREE_.Vector3(x, labio.y, labio.z - H.HABLADOR.delante).applyMatrix4(m);
}
/** En venta, con el foco dado; deja el React mínimo como estaba. */
function enVenta(foco, fn) {
  MV.LuzDeVenta.v = true; MV.FocoDeVenta.v = foco; MV.efectos.length = 0;
  try { return fn(); } finally { MV.LuzDeVenta.v = false; MV.FocoDeVenta.v = true; MV.efectos.length = 0; }
}

prueba("el hablador: el nombre sin cifras y el precio SÓLO si alguien lo cargó", () => {
  const sin = H.contenidoDelHablador({ nombre: "Finesse yogurt fresa 150 g", ficha: { precio_publico: null } });
  assert.deepEqual(sin, { nombre: "Finesse yogurt fresa", precio: null });
  for (const nombre of ["Gaseosa Manzana 1,5 L", "Leche entera 1.000 ml x 6 un", "Arroz Diana 1kg", "Pack 2x1"]) {
    const c = H.contenidoDelHablador({ nombre, ficha: null });
    assert.ok(!/\d/.test(c.nombre), `«${c.nombre}» lleva cifras: desde el otro lado se leen como un precio`);
    assert.equal(c.precio, null);
  }
  for (const p of [undefined, null, 0, -4900, NaN, Infinity]) {
    assert.equal(H.contenidoDelHablador({ nombre: "X", ficha: { precio_publico: p } }).precio, null, `con ${p} se inventa un precio`);
  }
  assert.equal(H.contenidoDelHablador({ nombre: "X", ficha: { precio_publico: 4900 } }).precio, "$ 4.900");
  // El dibujo: sin precio, NINGUNA cifra escrita, y las dos barras grises.
  const g = lienzoFalso();
  H.pintarHablador(g, sin, H.HABLADOR.lienzo.ancho, H.HABLADOR.lienzo.alto);
  assert.ok(g.textos.length > 0, "el hablador sin precio no lleva ni el nombre");
  assert.ok(g.textos.every((t) => !/[\d$]/.test(t)), `el hablador sin precio escribe ${JSON.stringify(g.textos)}`);
  assert.equal(g.rects.filter((r) => r.color === "#c8c8c4").length, 2, "sin precio no van las dos barras grises");
  const con = lienzoFalso();
  H.pintarHablador(con, { nombre: "Producto de prueba", precio: "$ 1.234" }, 256, 112);
  assert.ok(con.textos.includes("$ 1.234"), "el precio cargado no se escribe");
  // El genérico —lo vendido a otros— no escribe NADA.
  const gen = lienzoFalso();
  let escritos = 0;
  gen.fillText = () => { escritos++; };
  H.pintarHabladoresGenericos(gen, 256, 64);
  assert.equal(escritos, 0, "el hablador genérico escribe: se leería lo de otro proveedor");
  assert.ok(gen.rects.length >= 4, "el hablador genérico no dibuja la etiqueta");
});

prueba("el hablador genérico va en lo que se VE de la tira, no detrás del labio", () => {
  // La ventana, medida sobre las geometrías puestas como las pone
  // `CaraDeEstanteria`: la tira centrada en el plano de apoyo, en
  // z = −(fondo + saliente); el entrepaño con su labio en z = −fondo.
  const fondo = 0.4, alto = M.PORTA_PRECIOS.alto;
  const ent = G.geometriaEntrepano(0.9, fondo).clone();
  const tira = G.geometriaPortaPrecios(0.9, alto).clone();
  tira.translate(0, -alto / 2, -(fondo + M.PORTA_PRECIOS.saliente));
  // La cara de la tira (la que sube inclinada): sus vértices quedan DETRÁS
  // del frente del labio, que la tapa de su borde de abajo para arriba.
  const pe = ent.getAttribute("position"), pt = tira.getAttribute("position");
  let frenteDelLabio = Infinity, bajoDelLabio = Infinity;
  for (let i = 0; i < pe.count; i++) frenteDelLabio = Math.min(frenteDelLabio, pe.getZ(i));
  for (let i = 0; i < pe.count; i++) if (pe.getZ(i) < frenteDelLabio + 0.003) bajoDelLabio = Math.min(bajoDelLabio, pe.getY(i));
  let caraMasAdelante = -Infinity;
  for (let i = 0; i < pt.count; i++) if (pt.getY(i) > bajoDelLabio + 1e-4) caraMasAdelante = Math.max(caraMasAdelante, -pt.getZ(i));
  assert.ok(caraMasAdelante <= -frenteDelLabio + 1e-6, "la tira asoma por delante del labio: la ventana ya no es ésa");
  const ventana = (bajoDelLabio + alto / 2) / alto;
  assert.ok(Math.abs(ventana - H.VENTANA_DE_LA_TIRA) < 0.03, `se ve ${ventana.toFixed(3)} de la tira y la etiqueta cuenta ${H.VENTANA_DE_LA_TIRA.toFixed(3)}`);
  // La etiqueta (todo lo que no es el fondo) cae entera en la ventana: en el
  // lienzo, de la fila H·(1 − ventana) al borde de abajo.
  for (const H_ of [32, 64]) {
    const g = lienzoFalso();
    H.pintarHabladoresGenericos(g, 256, H_);
    const etiqueta = g.rects.slice(1);
    assert.ok(etiqueta.some((r) => r.color === "#f2c230"), "el genérico sin franja amarilla");
    for (const r of etiqueta) {
      assert.ok(r.y >= H_ * (1 - ventana) - 0.5 && r.y + r.h <= H_ + 1e-9,
        `con ${H_} filas, ${r.color} cae en las filas ${r.y}–${r.y + r.h}, fuera de lo que se ve (${(H_ * (1 - ventana)).toFixed(1)}–${H_})`);
    }
  }
});

prueba("un hablador de un arte ajeno no sale en una pantalla privada", () => {
  const catalogo = [
    { id: 1, supplier_id: 10, proveedor: "Alpina", nombre: "Finesse yogurt fresa 150 g", ficha: { precio_publico: 4900 } },
    { id: 4, supplier_id: 70, proveedor: "Arroz Diana", nombre: "Arroz Diana 1 kg", ficha: null },
  ];
  assert.equal(X.habladorALaVista(catalogo[0], catalogo, 70), null, "en la pantalla de Diana sale el hablador de Alpina");
  assert.equal(X.habladorALaVista(catalogo[0], catalogo, null), null, "Presentar sin proveedor muestra un hablador");
  assert.deepEqual(X.habladorALaVista(catalogo[0], catalogo, 10), { nombre: "Finesse yogurt fresa", precio: "$ 4.900" });
  assert.deepEqual(X.habladorALaVista(catalogo[1], catalogo, 70), { nombre: "Arroz Diana", precio: null });
  assert.equal(X.habladorALaVista(null, catalogo, 10), null);
  // La escena lo arma con ese filtro, para el principal y para el surtido.
  const usos = editorCodigo.match(/hablador: habladorALaVista\((arte|otro), catalogo, privadoPara\)/g) ?? [];
  assert.equal(usos.length, 2, `la prueba arma ${usos.length} habladores con el filtro (principal y surtido)`);
  assert.ok(!/contenidoDelHablador\(/.test(editorCodigo), "la escena arma un hablador sin pasar por la privacidad");
});

prueba("los habladores de un producto: uno por bloque en su borde izquierdo y otro cada 60 cm", () => {
  // Unidades desde +X (la izquierda vista desde el pasillo: la cara mira a −Z).
  const tramo = (desde, n, a) => Array.from({ length: n }, (_, i) => ({ x: desde - a / 2 - i * a, ancho: a }));
  assert.deepEqual(H.posicionesDeHabladores(tramo(0.45, 4, 0.075)).map(enMetros), [enMetros(0.45 - H.HABLADOR.ancho / 2)]);
  // Un parante (5 cm) corta el bloque: otro hablador.
  assert.equal(H.posicionesDeHabladores([...tramo(0.45, 4, 0.075), ...tramo(0.1, 4, 0.075)]).length, 2);
  // 1,3 m seguidos: en 0, 60 y 120 cm.
  assert.equal(H.posicionesDeHabladores(tramo(0.65, 13, 0.1)).length, 3);
  // Más angosto que el hablador: centrado.
  assert.deepEqual(H.posicionesDeHabladores([{ x: 0.1, ancho: 0.04 }]), [0.1]);
  assert.deepEqual(H.posicionesDeHabladores([]), []);
});

prueba("los habladores genéricos van donde el relleno cubre el vano: lo libre y el medio vano, lisos", () => {
  const v = V.ventaDeTipo("punta", 0.9, 0.4, 1.8);
  const slot = (id, x, w, y, h, rubro) => ({ id, x, w, y, h, status: rubro ? "occupied" : "free", brandCategory: rubro ?? "" });
  const relleno = (slots, vendidoEntero) => F.rellenoPorRubro({
    anchoTotal: 0.9, filas: v.filas, vanos: v.vanos, caras: v.caras, franja: v.franja ?? 0, slots, vendidoEntero, cubiertas: [null],
  });
  const filasCon = (grupos) => new Set(grupos.flatMap((g) => g.posiciones.map((p) => p.fila)));
  // PUN-02 de la demo: abajo un vano entero vendido; arriba, medio vano.
  const slots = [slot("S1", 0, 1, 0, 0.5, "Galletas"), slot("S2", 0, 0.5, 0.5, 0.5, "Aseo"), slot("S3", 0.5, 0.5, 0.5, 0.5)];
  const grupos = relleno(slots);
  const conRelleno = filasCon(grupos);
  const tramos = H.tramosConRelleno(grupos, v.vanos, v.caras.length)[0];
  const abajo = F.entrepanosDelEspacio(slots[0], v.filas, v.franja).filter((f) => conRelleno.has(f));
  const medio = F.entrepanosDelEspacio(slots[1], v.filas, v.franja).filter((f) => conRelleno.has(f));
  assert.ok(abajo.length > 0 && medio.length > 0, "sin relleno en los dos slots la prueba no prueba nada");
  for (const f of abajo) assert.ok(tramos.has(`${f}|0`), `el entrepaño ${f}, vendido entero, no lleva hablador`);
  for (const f of medio) assert.ok(!tramos.has(`${f}|0`), `el entrepaño ${f}, con medio vano vendido, lleva hablador sobre la mitad libre`);
  // Ni con un poco más: un slot del 60 % deja libre un tercio de la tira, y
  // un vano lleno (93 % con el aire entre unidades) tiene que pasar.
  const sesenta = relleno([slots[0], slot("S2", 0, 0.6, 0.5, 0.5, "Aseo"), slot("S3", 0.6, 0.4, 0.5, 0.5)]);
  const t60 = H.tramosConRelleno(sesenta, v.vanos, 1)[0];
  for (const f of medio) assert.ok(!t60.has(`${f}|0`), `el entrepaño ${f}, con el 60 % vendido, lleva hablador sobre lo libre`);
  assert.ok(H.COBERTURA_PARA_HABLADOR > 0.6 && H.COBERTURA_PARA_HABLADOR <= 0.9, `cobertura ${H.COBERTURA_PARA_HABLADOR}`);
  // Todo libre: ni relleno ni hablador.
  const libres = slots.map((s) => ({ ...s, status: "free", brandCategory: "" }));
  assert.equal(H.tramosConRelleno(relleno(libres), v.vanos, 1)[0].size, 0, "lo libre lleva hablador");
  // Contratada entera: cada entrepaño con relleno lleva el suyo.
  const entera = relleno(libres, { rubro: "Panadería" });
  assert.ok(filasCon(entera).size >= 3, "la punta contratada entera no se rellena");
  assert.deepEqual([...H.tramosConRelleno(entera, v.vanos, 1)[0]].sort(), [...filasCon(entera)].map((f) => `${f}|0`).sort());
  // Y sólo en venta: en el editor la tira sigue con su color de estado.
  assert.equal(MV.useHabladoresDeRelleno(true, v, 0.9, slots, undefined, [null]), null, "el editor lleva habladores");
  const enLaVenta = enVenta(true, () => MV.useHabladoresDeRelleno(true, v, 0.9, slots, undefined, [null]));
  assert.deepEqual([...enLaVenta[0]].sort(), [...tramos].sort());
});

prueba("el hablador cuelga 1 mm delante de la tira REAL de su entrepaño, a su altura", () => {
  const casos = [
    ["gondola", (h) => MV.GondolaReal({ w: 3.6, d: 0.9, h: 1.8, gondolaType: "double", habladores: h }), V.ventaDeTipo("gondola", 3.6, 0.9, 1.8)],
    ["punta", (h) => MV.PuntaReal({ w: 0.9, d: 0.4, h: 1.8, habladores: h?.[0] }), V.ventaDeTipo("punta", 0.9, 0.4, 1.8)],
    ["nevera_refrescos", () => MV.NeveraReal({ w: 1.2, d: 0.75, h: 1.8 }), V.ventaDeTipo("nevera_refrescos", 1.2, 0.75, 1.8)],
  ];
  let medidos = 0;
  for (const [tipo, armar, venta] of casos) {
    const filas = F.unidadesDePrueba({ venta, empaque: VASO, donde: "todas", semilla: "h" }).porFila.filter((f) => f.frentes > 0);
    assert.ok(filas.length >= 3, `${tipo}: ${filas.length} filas con producto`);
    for (let c = 0; c < venta.caras.length; c++) for (const f of filas) for (const [vi, vano] of venta.vanos.entries()) {
      // La tira de ESTE (entrepaño, vano) es la que lleva los genéricos si se
      // le piden sólo a ella: así se prueba también que las claves coinciden.
      const pedido = venta.caras.map((_, k) => (k === c ? new Set([`${f.fila}|${vi}`]) : new Set()));
      const mallas = enVenta(true, () => mallasDe(armar(pedido)));
      const tiras = mallas.filter((m) => esTira(m.geometria));
      const p = dondeVaElHablador(venta, tipo, c, f.fila, vano.x);
      const debajo = tiras.map((t) => ({ t, q: p.clone().applyMatrix4(t.matriz.clone().invert()) }))
        .filter(({ t, q }) => q.x >= t.geometria.boundingBox.min.x && q.x <= t.geometria.boundingBox.max.x
          && q.y >= 0 && q.y <= M.PORTA_PRECIOS.alto && Math.abs(q.z) < 0.01);
      const donde = `${tipo} cara ${c} fila ${f.fila} vano ${vi}`;
      assert.equal(debajo.length, 1, `${donde}: el hablador cae sobre ${debajo.length} tiras`);
      const { t, q } = debajo[0];
      assert.ok(Math.abs(q.z + H.HABLADOR.delante) < 1e-5, `${donde}: a ${(-q.z * 1000).toFixed(2)} mm de la cara de la tira`);
      assert.ok(q.y - H.HABLADOR.alto / 2 >= -1e-6 && q.y + H.HABLADOR.alto / 2 <= M.PORTA_PRECIOS.alto + 1e-6,
        `${donde}: el hablador se sale de la tira (centro a ${(q.y * 1000).toFixed(1)} mm)`);
      if (tipo !== "nevera_refrescos") {
        assert.ok(t.material.map, `${donde}: la tira de ese entrepaño no lleva los genéricos (las claves no coinciden)`);
        assert.equal(tiras.filter((x) => x.material.map).length, 1, `${donde}: los genéricos salen en otra tira`);
      }
      medidos++;
    }
  }
  // El robatope vive en el editor (RobatopeMesh): su riel, por el código y
  // por la cuenta.
  const rob = cuerpoDe("function RobatopeMesh(", "function RistraMesh(");
  assert.match(rob, /<group key=\{i\} rotation=\{\[cotas\.giro, 0, 0\]\}>/);
  assert.match(rob, /<mesh position=\{\[0, sy \+ ROBATOPE\.rielSube, -\(d \/ 2 - ROBATOPE\.rielAdentro\)\]\}>\s*<boxGeometry args=\{\[w - ROBATOPE\.rielRetiro, ROBATOPE\.rielAlto, ROBATOPE\.rielEspesor\]\} \/>/,
    "el riel del robatope cambió: el hablador de la prueba ya no sabe dónde está");
  const [w, d, h] = [0.3, 0.4, 1.6];
  const cotas = M.cotasDeRobatope(w, d, h), venta = M.ventaDeRobatope(w, d, h);
  for (let i = 0; i < cotas.n; i++) {
    const riel = new THREE_.Matrix4().makeRotationX(cotas.giro)
      .multiply(new THREE_.Matrix4().makeTranslation(0, cotas.repisas[i] + M.ROBATOPE.rielSube, -(d / 2 - M.ROBATOPE.rielAdentro)));
    const q = dondeVaElHablador(venta, "robatope", 0, i, 0).applyMatrix4(riel.invert());
    assert.ok(Math.abs(q.z - (-M.ROBATOPE.rielEspesor / 2 - H.HABLADOR.delante)) < 1e-6, `robatope ${i}: z ${q.z}`);
    assert.ok(Math.abs(q.y) <= (M.ROBATOPE.rielAlto - H.HABLADOR.alto) / 2 + 1e-6, `robatope ${i}: se sale del riel`);
    medidos++;
  }
  assert.ok(medidos >= 20, `${medidos} habladores medidos`);
});

prueba("una llamada de dibujo más por (fila, producto), y sólo en venta", () => {
  const dp = sinComentarios(leer(join(muebles, "ProductoDePrueba.tsx")));
  assert.match(dp, /materialDelHablador: enVenta && x\.hablador \? materialDeHablador\(x\.etiqueta, x\.hablador\) : null,/,
    "el hablador sale en el editor o sin contenido");
  assert.match(dp, /\{f\.productos\.map\(\(pr, k\) => \([\s\S]{0,700}\{pr\.materialDelHablador && \(\s*<Habladores puntos=\{pr\.habladores\} material=\{pr\.materialDelHablador\} \/>\s*\)\}/,
    "los habladores no van uno por (fila, producto)");
  const hab = dp.slice(dp.indexOf("function Habladores("));
  assert.equal((hab.slice(0, hab.indexOf("\n}\n")).match(/<instancedMesh/g) ?? []).length, 1, "los habladores de una fila son más de una llamada");
  assert.match(hab, /args=\{\[planoDeHablador\(\), material, puntos\.length\]\}/);
  assert.match(dp, /\.map\(\(x\) => \(\{ x, y: labio\.y, z: labio\.z - HABLADOR\.delante \}\)\)/, "el hablador no cuelga del labio de su fila");
  // La geometría es UNA para todos y el material, uno por producto (caché).
  assert.equal(ET.planoDeHablador(), ET.planoDeHablador());
  const et = sinComentarios(leer(join(muebles, "etiqueta.ts")));
  assert.match(et, /const clave = `hablador:\$\{c\.nombre\}\|\$\{c\.precio \?\? "-"\}`;\s*const ya = e\?\.materiales\.get\(clave\)/,
    "el material del hablador no va por el caché de su etiqueta (uno por producto)");
});

prueba("un vecino se atenúa por uniformes; con foco nada cambia; la nevera vecina apaga su frío", () => {
  const u = LV.uniformesDe(LV.conLuzDeVenta(true, 1.15, LV.BRILLO.pintado));
  assert.equal(LV.atenuarUniformes([u, undefined], false), 1);
  assert.ok(Math.abs(u.uLuzVenta.value - u.base.luz * LV.ATENUACION.luz) < 1e-12);
  assert.ok(Math.abs(u.uBrillo.value - u.base.brillo * LV.ATENUACION.brillo) < 1e-12);
  LV.atenuarUniformes([u], true);
  assert.equal(u.uLuzVenta.value, u.base.luz);
  assert.equal(u.uBrillo.value, u.base.brillo);
  assert.ok(LV.ATENUACION.luz < 1 && LV.ATENUACION.luz >= 0.4, "un vecino a oscuras ya no es una tienda");
  // La nevera ARMADA: se corren sus efectos y se miran sus materiales.
  const materialesDe = (foco) => enVenta(foco, () => {
    const mallas = mallasDe(MV.NeveraReal({ w: 1.2, d: 0.75, h: 1.8 }));
    MV.efectos.splice(0).forEach((e) => e());
    return [...new Set(mallas.flatMap((m) => [].concat(m.material ?? [])))];
  });
  const forroDe = (mats) => mats.find((x) => x.emissive?.getHexString() === "dcebf3");
  const vecina = materialesDe(false), conFoco = materialesDe(true);
  const conLuz = (mats) => mats.map((x) => MV.uniformesDe(x)).filter(Boolean);
  // El cuerpo, el interior, el forro, el alambre, el marco y las botellas mudas.
  assert.ok(conLuz(vecina).length >= 6, `la nevera de venta perdió la luz de venta (${conLuz(vecina).length} materiales)`);
  for (const x of conLuz(vecina)) assert.ok(Math.abs(x.uLuzVenta.value - x.base.luz * MV.ATENUACION.luz) < 1e-12, "un material de la vecina no se atenuó");
  for (const x of conLuz(conFoco)) assert.equal(x.uLuzVenta.value, x.base.luz, "con foco, la nevera se atenuó");
  assert.equal(forroDe(vecina).emissiveIntensity, 0, "el forro de la vecina sigue encendido");
  assert.equal(forroDe(conFoco).emissiveIntensity, MV.EMISION_DE_FRIO.forro);
  // apagarElFrio va y vuelve sin acumular: dos veces apagada es una.
  const mat = (color) => new THREE_.MeshStandardMaterial({ color });
  const m = { forro: mat("#eef3f6"), interior: mat("#eef6fb"), rejilla: mat("#b9c2cb"), marco: mat("#cdd3d8"), relleno: mat("#8fa3b4"), luz: mat("#e8f7ff"), alambre: null };
  const antes = Object.fromEntries(Object.entries(m).filter(([, x]) => x).map(([k, x]) => [k, x.color.getHex()]));
  MV.apagarElFrio(m, true); MV.apagarElFrio(m, true);
  const r0 = new THREE_.Color("#8fa3b4").r;
  assert.ok(Math.abs(m.relleno.color.r - r0 * MV.FRIO_APAGADO.relleno) < 1e-9, "apagar dos veces oscurece dos veces");
  assert.ok(m.relleno.color.r > m.forro.color.r * 0.5, "las botellas mudas dejan de verse contra la cavidad");
  assert.ok(m.luz.emissiveIntensity < MV.EMISION_DE_FRIO.luz * 0.2);
  MV.apagarElFrio(m, false);
  for (const [k, hex] of Object.entries(antes)) assert.equal(m[k].color.getHex(), hex, `${k} no vuelve a su color`);
  assert.equal(m.interior.emissiveIntensity, MV.EMISION_DE_FRIO.interior);
});

prueba("el foco es un boolean aparte y ningún material se rehace por él; sin ningún foco, nadie se atenúa", () => {
  const lv = sinComentarios(leer(join(muebles, "luzDeVenta.ts")));
  assert.match(lv, /export const FocoDeVenta = createContext<boolean>\(true\);/);
  assert.equal(MV.FocoDeVenta.v, true, "sin proveedor de foco, un mueble se ve atenuado");
  // Lo lee UN solo lugar —`useAtenuacion`, con un efecto— y ningún useMemo
  // lo nombra: un objeto o un boolean en las dependencias de un material lo
  // rehace (y lo recompila) en los ~100 muebles con cada cambio de toma.
  const archivos = ["piezas.tsx", "NeveraReal.tsx", "ProductoEnMueble.tsx", "GondolaReal.tsx", "PuntaReal.tsx",
    "ProductoDePrueba.tsx", "atenuacion.ts", "luzDeVenta.ts"].map((a) => [a, sinComentarios(leer(join(muebles, a)))]);
  archivos.push(["StoreEditor3D.tsx", editorCodigo]);
  const lecturas = archivos.filter(([, t]) => /useContext\(FocoDeVenta\)/.test(t)).map(([a]) => a);
  assert.deepEqual(lecturas, ["atenuacion.ts"], `el foco se lee en ${lecturas.join(", ")}`);
  for (const [a, t] of archivos) {
    for (let i = t.indexOf("useMemo("); i >= 0; i = t.indexOf("useMemo(", i + 1)) {
      let prof = 0, j = i + "useMemo".length;
      for (; j < t.length; j++) { if (t[j] === "(") prof++; else if (t[j] === ")" && --prof === 0) break; }
      const llamada = t.slice(i, j + 1);
      assert.ok(!/\bfoco\b|FocoDeVenta/.test(llamada), `${a}: un useMemo depende del foco:\n${llamada.slice(0, 160)}`);
    }
  }
  assert.match(sinComentarios(leer(join(muebles, "atenuacion.ts"))), /useEffect\(\(\) => \{\s*if \(atenuarUniformes\(fuentes\.map\(uniformesDe\), foco\) > 0\) invalidate\(\);/);
  // Sin ningún foco (el editor, Presentar sin prueba ni toma): todos a full.
  assert.match(editorCodigo, /<FocoDeVenta\.Provider value=\{conFoco\.size === 0 \|\| conFoco\.has\(fix\.id\)\}>/);
  assert.match(editorCodigo, /const conFoco = useMemo\(\(\) => \{\s*const s = new Set<string>\(\);\s*if \(privadoPara === undefined\) return s;/,
    "en el editor un mueble se atenúa");
});

prueba("el mueble contratado entero lleva relleno sólo en venta y sólo sin slots vendidos", () => {
  const f = (status, slots) => ({ status, brandCategory: "Panadería", slots });
  assert.equal(F.rubroDeContratoEntero(f("occupied", [{ status: "free" }]), true), "Panadería");
  assert.equal(F.rubroDeContratoEntero(f("reserved", []), true), "Panadería");
  assert.equal(F.rubroDeContratoEntero(f("occupied", []), false), undefined, "en el editor el contratado entero se rellena");
  assert.equal(F.rubroDeContratoEntero(f("free", []), true), undefined, "lo libre se rellena: un mueble inventa producto");
  assert.equal(F.rubroDeContratoEntero(f("occupied", [{ status: "free" }, { status: "occupied" }]), true), undefined,
    "con un slot vendido, lo libre de al lado se rellena");
  assert.equal(F.rubroDeContratoEntero({ status: "occupied" }, true), "");
  assert.match(editorCodigo, /const rubroEntero = rubroDeContratoEntero\(fixture, neutro\);/);
  assert.match(editorCodigo, /neutro=\{privadoPara !== undefined\}/);
  assert.equal((editorCodigo.match(/rubroEntero=\{rubroEntero\}/g) ?? []).length, 2, "la góndola o la punta no reciben el contrato entero");
  // La góndola contratada entera, con las dos filas que se ven (como lo
  // vendido por slot); el robatope y los exhibidores, hondos como siempre.
  const v = V.ventaDeTipo("gondola", 3.6, 0.9, 1.8);
  const hondura = (vendidoEntero) => {
    const porLugar = new Map();
    for (const g of F.rellenoPorRubro({ anchoTotal: 3.6, filas: v.filas, vanos: v.vanos, caras: v.caras, franja: v.franja ?? 0, vendidoEntero, cubiertas: [null, null] })) {
      for (const p of g.posiciones) { const k = `${p.cara}|${p.fila}|${p.x.toFixed(4)}`; porLugar.set(k, (porLugar.get(k) ?? 0) + 1); }
    }
    return Math.max(...porLugar.values());
  };
  assert.equal(hondura({ rubro: "Panadería", hondo: false }), 2, "la góndola contratada entera se llena hasta el fondo");
  assert.ok(hondura({ rubro: "Panadería" }) > 2, "el mueble chico contratado entero dejó de llenarse en profundidad");
  assert.equal((editorCodigo.match(/\{ rubro: rubroEntero, hondo: false \}/g) ?? []).length, 2);
});

prueba("la banda del relleno: clara en el medio, el borde abajo y arriba, y barata", () => {
  const tris = (g) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
  const { clara, borde } = G.BANDA_DE_ETIQUETA;
  for (const forma of ["caja", "botella", "lata"]) {
    const lisa = G.geometriaDeEmpaque(forma, 0.1, 0.25, 0.07, false);
    const conBanda = G.geometriaDeEmpaque(forma, 0.1, 0.25, 0.07, false, true);
    assert.ok(!lisa.getAttribute("color"), `${forma}: la del editor cambió`);
    assert.notEqual(lisa, conBanda, `${forma}: el caché no distingue la banda`);
    const p = conBanda.getAttribute("position"), c = conBanda.getAttribute("color");
    assert.ok(c && c.count === p.count, `${forma}: sin color de vértice`);
    // Por altura relativa: la banda cae entre el 20 y el 70 % del envase.
    let medio = 0, abajo = Infinity, arriba = Infinity;
    for (let i = 0; i < p.count; i++) {
      const f = (p.getY(i) + 0.125) / 0.25, k = c.getX(i);
      if (f >= 0.2 - 1e-6 && f <= 0.7 + 1e-6) medio = Math.max(medio, k);
      if (f < 1e-6) abajo = Math.min(abajo, k);
      if (f > 1 - 1e-6) arriba = Math.min(arriba, k);
    }
    assert.ok(Math.abs(medio - clara) < 1e-6, `${forma}: el medio no es la banda clara (${medio})`);
    assert.ok(Math.abs(abajo - borde) < 1e-6 && Math.abs(arriba - borde) < 1e-6, `${forma}: la base o la tapa no llevan el borde`);
    // Es el envase más repetido de la tienda: la banda cuesta poco.
    assert.ok(tris(conBanda) <= tris(lisa) * (forma === "caja" ? 20 / 12 : 1.5), `${forma}: ${tris(lisa)} → ${tris(conBanda)} triángulos`);
  }
  // La caja, con la etiqueta de corte NETO en las dos caras grandes: en cada
  // borde de la etiqueta hay vértices con los dos tonos a la misma altura (un
  // degradé de la base al medio se leía como un bloque de un color).
  const caja = G.geometriaDeEmpaque("caja", 0.1, 0.25, 0.07, false, true);
  const p = caja.getAttribute("position"), c = caja.getAttribute("color"), n = caja.getAttribute("normal");
  for (const [b, nombre] of [[G.BANDA_DE_ETIQUETA.caja[0], "abajo"], [G.BANDA_DE_ETIQUETA.caja[1], "arriba"]]) {
    for (const sz of [1, -1]) {
      const tonos = new Set();
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getZ(i) - sz) > 1e-6 || Math.abs((p.getY(i) + 0.125) / 0.25 - b) > 1e-6) continue;
        tonos.add(c.getX(i).toFixed(3));
      }
      assert.deepEqual([...tonos].sort(), [clara, borde].map((k) => k.toFixed(3)).sort(),
        `caja, cara ${sz > 0 ? "+" : "−"}Z: el borde ${nombre} de la etiqueta no es neto (${[...tonos]})`);
    }
  }
  // Las normales salen hacia afuera (la caja es a mano, no un BoxGeometry).
  for (let i = 0; i < p.count; i++) {
    const d = p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i);
    assert.ok(d > 0, `caja: una normal mira hacia adentro en el vértice ${i}`);
  }
  for (let t = 0; t < p.count; t += 3) {
    const v = (k) => [p.getX(t + k), p.getY(t + k), p.getZ(t + k)];
    const [a, b, d] = [v(0), v(1), v(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    assert.ok(cr[0] * n.getX(t) + cr[1] * n.getY(t) + cr[2] * n.getZ(t) > 0, `caja: el triángulo ${t / 3} está al revés`);
  }
});

prueba("el relleno: un tono por unidad sembrado, sólo en venta; el editor, sin color por instancia", () => {
  const t1 = F.tonosDelRelleno("GON-02|a", 60);
  assert.deepEqual(t1, F.tonosDelRelleno("GON-02|a", 60), "el relleno cambia de tono de un cuadro a otro");
  assert.notDeepEqual(t1, F.tonosDelRelleno("GON-01|a", 60));
  for (const t of t1) for (const k of t) assert.ok(Math.abs(k - 1) <= F.VARIACION_DE_RELLENO * 1.5, `tono ${k}`);
  assert.ok(new Set(t1.map(([, g]) => g.toFixed(3))).size > 30, "el relleno es de un solo tono");
  const slots = [{ id: "S1", x: 0, w: 1 / 3, y: 0, h: 0.5, status: "occupied", brandCategory: "Galletas" }];
  const relleno = () => piezasDe(MV.ProductoEnGondola({ w: 3.6, d: 0.9, h: 1.8, slots, cubiertas: [null, null], semilla: "GON-02" }))
    .filter((p) => p.tipo === "instancias");
  const editor_ = relleno(), venta_ = enVenta(false, relleno);
  assert.ok(editor_.length > 0 && venta_.length === editor_.length);
  for (const p of editor_) {
    assert.equal(p.colores.length, 0, "el relleno del editor lleva color por instancia");
    assert.ok(!p.material.vertexColors && !p.geometria.getAttribute("color"), "el relleno del editor cambió de geometría");
  }
  for (const p of venta_) {
    assert.ok(p.colores.length > 0, "el relleno de venta va de un solo tono");
    assert.ok(p.material.vertexColors && p.geometria.getAttribute("color"), "vertexColors sin color de vértice: la malla sale negra");
  }
});

// ── Presentar a pantalla completa (tanda 3, paso 15) ────────────────────────

prueba("Presentar ocupa la pantalla: contenedor fijo sin marco, pantalla completa en el clic, salida en un efecto", () => {
  // Por videollamada se veía la barra de RECABRA y el lienzo con esquinas
  // redondeadas. En Presentar el contenedor es `fixed inset-0`, sin
  // `rounded` ni `border` (tapa la barra aunque el navegador niegue la
  // pantalla completa); fuera, el de siempre.
  const i = editorCodigo.indexOf("ref={contenedorRef}");
  assert.ok(i > 0, "el contenedor del editor perdió su ref");
  const contenedor = editorCodigo.slice(i, editorCodigo.indexOf(">", editorCodigo.indexOf("style={{minHeight:0}}", i)));
  const [enPresentar, fuera] = contenedor.split(/"\s*:\s*"/);
  assert.match(contenedor, /className=\{presentationMode\s*\?/, "el contenedor no cambia en Presentar");
  assert.match(enPresentar, /fixed inset-0 z-\[60\]/, "en Presentar el contenedor no tapa la barra");
  assert.ok(!/rounded|border/.test(enPresentar), "en Presentar el lienzo sigue con marco");
  assert.match(fuera, /rounded-xl border border-dark-line/, "fuera de Presentar el editor perdió su marco");
  // `requestFullscreen` sólo en el pedido, y el pedido DENTRO de los
  // manejadores del clic (un efecto o un await pierden el gesto).
  assert.equal((editorCodigo.match(/requestFullscreen\(/g) ?? []).length, 1, "requestFullscreen se llama desde otro lado");
  const pedir = cuerpoDe("const pedirPantallaCompleta = useCallback(", "useEffect(");
  assert.match(pedir, /el\.requestFullscreen\(\)\.catch\(/, "un rechazo de la pantalla completa queda sin atrapar");
  assert.match(pedir, /document\.fullscreenElement/, "pide pantalla completa estando ya en pantalla completa");
  const mostrar = cuerpoDe("const mostrarAlProveedor = useCallback(", "const alternarPresentar = useCallback(");
  assert.match(mostrar, /setPresentationMode\(true\);\s*pedirPantallaCompleta\(\);/, "«Mostrar al proveedor» no pide la pantalla completa");
  const presentar = cuerpoDe("const alternarPresentar = useCallback(", "const caraVisible = ");
  assert.match(presentar, /setPresentationMode\(true\);\s*pedirPantallaCompleta\(\);/, "«Presentar» no pide la pantalla completa");
  assert.ok(!/useEffect\([^]*?pedirPantallaCompleta\(\)/.test(cuerpoDe("const pedirPantallaCompleta = useCallback(", "const mostrarAlProveedor")),
    "la pantalla completa se pide en un efecto (el navegador la niega sin gesto)");
  // La salida: UN efecto sobre presentationMode (cubre «Salir», el botón,
  // Esc, el desmontaje), y en ningún botón.
  assert.equal((editorCodigo.match(/exitFullscreen\(/g) ?? []).length, 1, "exitFullscreen atado a un botón");
  assert.match(editorCodigo,
    /useEffect\(\(\) => \{\s*if \(!presentationMode\) return;\s*return \(\) => \{\s*if \(document\.fullscreenElement\) document\.exitFullscreen\(\)\.catch\(\(\) => \{\s*\}\);\s*\};\s*\}, \[presentationMode\]\);/,
    "la salida de pantalla completa no va en un efecto sobre presentationMode");
  // El Esc del navegador (fullscreenchange sin elemento) apaga Presentar.
  assert.match(editorCodigo,
    /const alCambiar = \(\) => \{ if \(!document\.fullscreenElement\) setPresentationMode\(false\); \};\s*document\.addEventListener\("fullscreenchange", alCambiar\);/,
    "salir de pantalla completa con Esc deja Presentar prendido");
});

prueba("Esc sale de Presentar, salvo en primera persona o con el mouse capturado", () => {
  const tecla = cuerpoDe('if(e.key==="Escape"){', 'if((e.key==="r"||e.key==="R")');
  assert.match(tecla, /if \(presentationMode\) \{\s*if \(!firstPerson && !document\.pointerLockElement\) setPresentationMode\(false\);\s*return;\s*\}/,
    "Esc no sale de Presentar, o sale en plena caminata");
  // Y antes de soltar la selección: en Presentar Esc no deselecciona.
  assert.ok(tecla.indexOf("if (presentationMode)") < tecla.indexOf("setSelectedId(null)"), "Esc en Presentar suelta el mueble elegido");
  assert.match(editorCodigo, /\},\[placingDef,selectedId,u,undo,redo,presentationMode,firstPerson\]\);/, "el manejador de teclas lee un presentationMode viejo");
});

prueba("el HUD de Presentar se esconde a los 2 s y vuelve con el mouse, sin redibujar la escena", () => {
  assert.match(editorCodigo, /const HUD_SE_ESCONDE_MS = 2000;/);
  const hud = cuerpoDe("function HudQueSeEsconde(", "interface CommercialPanelProps");
  assert.match(hud, /window\.setTimeout\(\(\) => setEscondido\(true\), HUD_SE_ESCONDE_MS\)/, "el HUD no se esconde solo");
  assert.match(hud, /addEventListener\("mousemove", despertar/, "el HUD no vuelve al mover el mouse");
  assert.match(hud, /addEventListener\("touchstart", despertar/, "el HUD no vuelve con un toque");
  assert.match(hud, /escondido \? "pointer-events-none opacity-0" : "opacity-100"/, "escondido, el HUD sigue recibiendo clics");
  assert.match(hud, /transition-opacity/);
  assert.match(hud, /el\.style\.cursor = escondido \? "none" : "";/, "el cursor no se esconde con el HUD");
  // El temporizador es estado de la píldora, no del editor: si no, cada vez
  // que aparece o se esconde se re-renderiza la escena.
  const editorFn = editorCodigo.slice(editorCodigo.indexOf("export default function StoreEditor3D("));
  assert.ok(editorFn.length > 1000 && editorFn.length < editorCodigo.length, "no se encontró el editor");
  assert.ok(!/HUD_SE_ESCONDE_MS|setEscondido/.test(editorFn), "el temporizador del HUD vive en el editor y re-renderiza la escena");
  assert.match(editorCodigo, /\{presentationMode && \(\s*<HudQueSeEsconde contenedor=\{contenedorRef\}/, "Presentar sin el HUD que se esconde");
});

prueba("con el selector abierto y sin proveedor no se dibuja ninguna prueba; «Mostrarla» sólo sin nadie identificado", () => {
  const catalogo = [
    { id: 1, supplier_id: 10, proveedor: "Alpina" },
    { id: 4, supplier_id: 70, proveedor: "Arroz Diana" },
  ];
  const pruebas = new Map([["PUN-01|A", 1], ["ROB-01|A", 4]]);
  // «Cambiar de proveedor»: la reunión queda sin proveedor con el selector
  // abierto, y el editor volvía a dibujar TODAS las pruebas.
  assert.equal(X.pruebasDeLaReunion(pruebas, catalogo, null, true).size, 0, "con el selector abierto sin proveedor se dibujan las pruebas de todos");
  assert.equal(X.pruebasDeLaReunion(pruebas, catalogo, null, true), X.pruebasDeLaReunion(new Map([["X|A", 4]]), catalogo, null, true),
    "el vacío es un Map nuevo en cada render (el memo de la escena se rehace)");
  assert.equal(X.pruebasDeLaReunion(pruebas, catalogo, null, false), pruebas, "sin selector ni reunión se pierden pruebas");
  assert.deepEqual([...X.pruebasDeLaReunion(pruebas, catalogo, 70, true).keys()], ["ROB-01|A"], "con proveedor fijado el selector abierto esconde lo suyo");
  // El editor: `eligiendo` sube del panel y llega a la cuenta.
  assert.match(editorCodigo, /const \[eligiendo, setEligiendo\] = useState\(false\);\s*useEffect\(\(\) => \{ setEligiendo\(false\); \}, \[selectedId, presentationMode\]\);/,
    "el selector abierto no llega a la escena, o queda abierto sin panel");
  const panel = cuerpoDe("function CommercialPanel(", "class CanvasErrorBoundary");
  assert.ok(!/useState\(false\);\s*const \[verContrato/.test(panel) && !/const \[eligiendo, setEligiendo\] = useState/.test(panel),
    "el panel volvió a tener su propio `eligiendo`");
  assert.match(editorCodigo, /eligiendo=\{eligiendo\}\s*setEligiendo=\{setEligiendo\}/, "el panel no recibe el selector del editor");
  // «Mostrarla» sólo con `privadoPara` null: con un proveedor fijado, la
  // prueba oculta es de OTRO y el botón le pasaba la pantalla.
  const hud = editorCodigo.slice(editorCodigo.indexOf("data-prueba-oculta"), editorCodigo.indexOf("Mostrarla", editorCodigo.indexOf("data-prueba-oculta")) + 20);
  assert.match(hud, /\{privadoPara === null && \(\s*<button\s*onClick=\{\(\) => mostrarAlProveedor\(pruebaOculta\.fixtureId, pruebaOculta\.cara\)\}/,
    "«Mostrarla» se ofrece con la prueba de otro proveedor");
});

console.log(`\n${hechas} pruebas del mobiliario 3D`);
