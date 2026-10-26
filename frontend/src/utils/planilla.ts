import * as XLSX from "xlsx";
// Sólo los TIPOS: `import type` se borra al compilar, así que exceljs sigue
// entrando únicamente por el `import()` perezoso de más abajo.
import type { Cell, Row } from "exceljs";

/**
 * Leer la planilla de contratos que llega de una reunión comercial.
 *
 * El archivo se abre EN EL NAVEGADOR y al servidor sólo le llegan filas en JSON.
 * Así el backend no aprende a abrir hojas de cálculo —una dependencia más para
 * tres tiendas— y de paso un CSV entra por el mismo camino sin escribir nada.
 *
 * Todo acá está escrito para una planilla hecha a mano, no para un formato:
 * los encabezados se reconocen por sinónimos, la fila de títulos puede no ser la
 * primera, y las fechas y los montos vienen como cada quien los escribe.
 */

export interface FilaPlanilla {
  /** Número de fila en el Excel ORIGINAL, para que "fila 14" sea la 14 de verdad. */
  fila: number;
  espacio: string;
  sede?: string;
  proveedor: string;
  correo?: string;
  marca?: string;
  /** Lo de CADA MES (decisión del dueño, 2026-10-26): el servidor saca el
   *  total del contrato multiplicándolo por sus meses, como «Al mes» en Vender. */
  valor?: number;
  /** ISO `aaaa-mm-dd`. La ambigüedad de formatos se resuelve acá. */
  desde?: string;
  hasta?: string;
  nota?: string;
}

export interface LecturaPlanilla {
  filas: FilaPlanilla[];
  /** Qué columna de la planilla se usó para cada campo, para poder mostrarlo. */
  mapeo: Partial<Record<Campo, string>>;
  /** Encabezados que no se reconocieron. Se ignoran, pero se dicen. */
  ignoradas: string[];
  /** Campos obligatorios que no aparecieron en ninguna columna. */
  faltan: Campo[];
}

export type Campo =
  | "espacio" | "sede" | "proveedor" | "correo"
  | "marca" | "valor" | "desde" | "hasta" | "nota";

const OBLIGATORIOS: Campo[] = ["espacio", "proveedor", "valor", "desde", "hasta"];

/** Sinónimos por campo. Nadie va a escribir los encabezados exactos, y pedirlo
 *  convertiría una función que ahorra trabajo en una que lo genera. */
const SINONIMOS: Record<Campo, string[]> = {
  espacio: ["espacio", "codigo", "cod", "code", "mueble", "punta", "codigo espacio",
            "codigo del espacio", "espacio codigo"],
  sede: ["sede", "tienda", "almacen", "punto de venta", "pdv"],
  proveedor: ["proveedor", "cliente", "empresa", "compania", "razon social"],
  correo: ["correo", "email", "e mail", "mail", "correo proveedor",
           "correo del proveedor", "correo electronico"],
  marca: ["marca", "categoria", "rubro", "marca categoria", "producto", "linea"],
  // Todos son lo de CADA MES: la planilla va con el valor por mes. Una columna
  // que dice «total» no se lee (`ENCABEZADO_TOTAL`).
  valor: ["valor", "valor al mes", "valor por mes", "valor mensual", "valor mes", "precio", "renta",
          "canon", "monto", "tarifa", "valor cop", "valor mensual cop", "valor al mes cop"],
  desde: ["desde", "inicio", "fecha inicio", "fecha de inicio", "inicia",
          "fecha desde", "start", "from"],
  hasta: ["hasta", "fin", "fecha fin", "fecha de fin", "termina", "finaliza",
          "fecha hasta", "end", "to"],
  nota: ["nota", "notas", "observacion", "observaciones", "comentario",
         "comentarios", "detalle"],
};

/** Sin tildes, sin puntuación, en minúsculas: "Fecha de Inicio:" → "fecha de inicio". */
function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function campoDe(encabezado: string): Campo | null {
  const n = normalizar(encabezado);
  if (!n) return null;
  for (const [campo, nombres] of Object.entries(SINONIMOS) as [Campo, string[]][]) {
    if (nombres.includes(n)) return campo;
  }
  // Segunda pasada, más floja: "valor mensual (COP)" ya quedó como
  // "valor mensual cop" arriba, pero "valor negociado" no está en la lista.
  for (const [campo, nombres] of Object.entries(SINONIMOS) as [Campo, string[]][]) {
    if (nombres.some((x) => n.startsWith(x + " ") || n === x)) return campo;
  }
  return null;
}

/** `2026-09-13` a partir de una fecha, en hora LOCAL.
 *
 *  `toISOString()` pasa a UTC, y en Colombia (UTC−5) una fecha a medianoche
 *  retrocede un día: el contrato empezaría el 12. */
function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Una celda de fecha, venga como venga.
 *
 *  Una celda con FORMATO de fecha —sólo las hay en un .xlsx— llega ya como
 *  `Date` y se toma tal cual: ahí quien decidió el día y el mes fue Excel, con
 *  el formato guardado en el archivo, y no hay nada que adivinar.
 *
 *  Todo lo demás es texto escrito a mano y **se lee día primero**: `03/04/2026`
 *  es el 3 de abril. Es la convención local, y leerlo al revés no falla ruidoso:
 *  crea un contrato de tres meses en el mes equivocado sin que nada avise. Por
 *  eso `leerPlanilla` le pide a la librería que NO interprete el texto de un CSV
 *  (ver `OPCIONES_DE_LECTURA`): esa interpretación era mes primero. */
export function leerFecha(valor: unknown): string | undefined {
  if (valor == null || valor === "") return undefined;
  if (valor instanceof Date && !isNaN(valor.getTime())) return iso(valor);

  const txt = String(valor).trim();

  const isoDirecto = txt.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoDirecto) {
    const [, a, m, d] = isoDirecto;
    return iso(new Date(+a, +m - 1, +d));
  }

  const diaPrimero = txt.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (diaPrimero) {
    const [, d, m, aRaw] = diaPrimero;
    const a = aRaw.length === 2 ? 2000 + +aRaw : +aRaw;
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return iso(new Date(a, +m - 1, +d));
  }

  // Un número suelto puede ser el serial de Excel (días desde 1900).
  const n = Number(txt);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const parsed = XLSX.SSF.parse_date_code(n);
    if (parsed) return iso(new Date(parsed.y, parsed.m - 1, parsed.d));
  }
  return undefined;
}

/** Un monto escrito como se escribe en Colombia: `$ 1.800.000`, `1800000`, `1,800,000`.
 *
 *  El punto es separador de miles acá y decimal en otras partes, así que no se
 *  puede borrar a ciegas: hay que mirar dónde cae el último separador. */
export function leerMonto(valor: unknown): number | undefined {
  if (valor == null || valor === "") return undefined;
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor) : undefined;

  const limpio = String(valor).replace(/[^\d.,-]/g, "");
  if (!limpio) return undefined;

  const puntos = (limpio.match(/\./g) || []).length;
  const comas = (limpio.match(/,/g) || []).length;
  let normal = limpio;

  if (puntos && comas) {
    // El que aparece último es el decimal; el otro es de miles.
    const decimal = limpio.lastIndexOf(".") > limpio.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    normal = limpio.split(miles).join("").replace(decimal, ".");
  } else if (puntos + comas === 1) {
    const sep = puntos ? "." : ",";
    const cola = limpio.slice(limpio.indexOf(sep) + 1);
    // Un único separador seguido de exactamente tres dígitos es de miles:
    // `1.800` son mil ochocientos pesos, no un peso con ochocientas milésimas.
    normal = cola.length === 3 ? limpio.replace(sep, "") : limpio.replace(sep, ".");
  } else if (puntos + comas > 1) {
    normal = limpio.replace(/[.,]/g, "");
  }

  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function texto(valor: unknown): string {
  if (valor == null) return "";
  if (valor instanceof Date) return iso(valor);
  return String(valor).trim();
}

/**
 * Cómo se abre el archivo, y por qué `raw`.
 *
 * `cellDates` es para el .xlsx: convierte a `Date` las celdas que el archivo
 * declara con formato de fecha. Eso está bien y no cambia.
 *
 * `raw` es para el CSV, y es un arreglo de un bicho que estuvo vivo en
 * producción. Un CSV no tiene formatos: son textos. La librería, en cuanto uno
 * de esos textos se le parece a una fecha, lo interpreta **mes primero**, que es
 * la convención del inglés y no la nuestra. Medido dos veces: un CSV que decía
 * `01/03/2026` —1 de marzo— entraba como `2026-01-03` y la pantalla mostraba
 * «3 ene». Y era peor que una lectura equivocada pareja: en la MISMA fila,
 * `30/06/2026` no se le parecía a ninguna fecha inglesa (no hay mes 30), así que
 * quedaba texto y `leerFecha` lo leía bien, día primero. Un contrato con el
 * inicio en un idioma y el fin en otro, sin un solo aviso, y sólo cuando el día
 * es 12 o menos.
 *
 * Con `raw` las celdas de un CSV llegan como el texto que son y las resuelve
 * `leerFecha`, que lee día primero como dice la convención del proyecto. Sobre
 * un .xlsx `raw` **no cambia nada** —medido: las celdas con formato de fecha
 * siguen llegando como `Date` y los números como números—, así que el camino de
 * Excel queda exactamente igual y no hacen falta dos ramas que se puedan
 * desfasar.
 */
const OPCIONES_DE_LECTURA = { cellDates: true, raw: true } as const;

/** La planilla va con el valor POR MES (decisión del dueño, 2026-10-26). Una
 *  columna de valor que dice «total» no se lee: tomarla como lo de cada mes
 *  multiplicaría el contrato por sus meses sin que nadie lo note. */
export const ENCABEZADO_TOTAL =
  "La planilla va con el valor por mes: cambiá la columna «{col}» por lo que se paga cada mes " +
  "(el total lo calcula el sistema con los meses del contrato).";

/** El texto de un CSV. Sin la marca BOM, la librería lo lee como Windows-1252,
 *  y un CSV en UTF-8 —el de Google Sheets, el «CSV UTF-8» de Excel sin BOM—
 *  llegaba con «LÃ¡cteos» en vez de «Lácteos»: un proveedor nuevo, duplicado,
 *  por un acento (medido, 2026-10-25). Se prueba UTF-8 estricto y, si no lo es,
 *  es el CSV de Excel en español: Windows-1252. */
export function textoDeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const esCsv = (archivo: File) => /\.csv$/i.test(archivo.name) || archivo.type === "text/csv";

/** Abre el archivo y devuelve las filas ya normalizadas. */
export async function leerPlanilla(archivo: File): Promise<LecturaPlanilla> {
  const buffer = await archivo.arrayBuffer();
  const libro = esCsv(archivo)
    ? XLSX.read(textoDeCsv(buffer), { ...OPCIONES_DE_LECTURA, type: "string" })
    : XLSX.read(buffer, OPCIONES_DE_LECTURA);
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1, blankrows: false, defval: "",
  });
  if (!matriz.length) throw new Error("El archivo está vacío.");

  // La fila de encabezados no siempre es la primera: las planillas suelen
  // arrancar con un título o con el logo pegado arriba. Se busca la primera que
  // reconozca al menos dos campos.
  let indiceEncabezado = -1;
  let mapeoColumnas: Map<number, Campo> = new Map();
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const candidato = new Map<number, Campo>();
    (matriz[i] || []).forEach((celda, col) => {
      const campo = campoDe(texto(celda));
      if (campo && ![...candidato.values()].includes(campo)) candidato.set(col, campo);
    });
    if (candidato.size >= 2) { indiceEncabezado = i; mapeoColumnas = candidato; break; }
  }
  if (indiceEncabezado === -1) {
    throw new Error(
      "No encontré la fila de encabezados. Tiene que haber una con al menos " +
      "«Espacio» y «Proveedor». Descargá la plantilla si querés el formato exacto.",
    );
  }

  const encabezados = (matriz[indiceEncabezado] || []).map(texto);
  const mapeo: Partial<Record<Campo, string>> = {};
  mapeoColumnas.forEach((campo, col) => { mapeo[campo] = encabezados[col] || `columna ${col + 1}`; });
  const ignoradas = encabezados.filter((h, col) => h && !mapeoColumnas.has(col));
  const faltan = OBLIGATORIOS.filter((c) => !(c in mapeo));
  if (mapeo.valor && /\btotal\b/.test(normalizar(mapeo.valor))) {
    throw new Error(ENCABEZADO_TOTAL.replace("{col}", mapeo.valor));
  }

  const filas: FilaPlanilla[] = [];
  for (let i = indiceEncabezado + 1; i < matriz.length; i++) {
    const cruda = matriz[i] || [];
    const valor = (campo: Campo): unknown => {
      for (const [col, c] of mapeoColumnas) if (c === campo) return cruda[col];
      return undefined;
    };
    const espacio = texto(valor("espacio"));
    const proveedor = texto(valor("proveedor"));
    // Una fila del todo vacía es el relleno de abajo de la planilla, no un error.
    if (!espacio && !proveedor && !texto(valor("valor"))) continue;

    filas.push({
      fila: i + 1,               // 1-based, como lo numera Excel
      espacio,
      sede: texto(valor("sede")) || undefined,
      proveedor,
      correo: texto(valor("correo")) || undefined,
      marca: texto(valor("marca")) || undefined,
      valor: leerMonto(valor("valor")),
      desde: leerFecha(valor("desde")),
      hasta: leerFecha(valor("hasta")),
      nota: texto(valor("nota")) || undefined,
    });
  }

  return { filas, mapeo, ignoradas, faltan };
}

/**
 * La plantilla, para que nadie tenga que adivinar el formato.
 *
 * ── Las instrucciones van ARRIBA, y por qué no rompen la lectura ─────────────
 *
 * `leerPlanilla` no supone que los títulos están en la primera fila: recorre las
 * primeras quince buscando la primera que reconozca **dos** campos. Por eso las
 * instrucciones pueden ir encima — y por eso cada una va en UNA SOLA CELDA: con
 * una sola celda por fila no hay manera de que reconozca dos campos y confunda
 * una línea de ayuda con los títulos.
 *
 * Y cada línea arranca con «Columna» a propósito. El lector normaliza el texto
 * y compara por prefijo, así que una línea que empezara con «ESPACIO: el
 * código…» calzaría el campo `espacio`. Empezando con otra palabra no calza
 * ninguno, y el margen de error desaparece en vez de quedar en «no debería
 * pasar».
 *
 * ── El ejemplo no se puede subir por accidente ───────────────────────────────
 *
 * Las filas que no tienen error vienen MARCADAS en la pantalla de carga. Un
 * ejemplo con un código real —`PUN-04`, Nutresa— se subiría solo si alguien se
 * olvida de borrarlo, y eso es un contrato inventado en la base.
 *
 * Por eso el ejemplo usa `EJEMPLO-01`, que no existe en ningún plano: el
 * servidor lo rechaza, la fila no se puede marcar, y el formato se sigue viendo
 * entero. Falla cerrado en vez de depender de que alguien se acuerde.
 */
/**
 * La plantilla: DOS hojas, y el reparto no es cosmético.
 *
 * `leerPlanilla` lee `SheetNames[0]` — sólo la primera. Poner las instrucciones
 * en la segunda las saca por completo del camino del lector: pueden tener
 * títulos, dos columnas y el largo que haga falta sin ninguna chance de que una
 * línea de ayuda se haga pasar por la fila de títulos. Antes estaban encima de
 * los datos, y eso obligaba a escribirlas apretadas y en una sola celda.
 *
 * La hoja de datos conserva DOS renglones de orientación, porque quien abre el
 * archivo cae ahí y puede no mirar nunca la otra pestaña: lo mínimo que arruina
 * una carga si se ignora —cómo se leen las fechas, qué es el valor y que hay
 * que borrar los ejemplos—. Lo demás vive en «Cómo llenarla».
 */
export function filasDeContratosDePlantilla(sede: string): unknown[][] {
  const hoy = new Date();
  const luego = new Date(hoy);
  luego.setDate(luego.getDate() + 30);
  const tienda = sede || "NAVE";
  return [
    ["CONTRATOS — escribí uno por fila, debajo de los títulos. " +
     "Las instrucciones completas están en la pestaña «Cómo llenarla»."],
    ["Las fechas van DÍA PRIMERO (15/09/2026 es el 15 de septiembre) · " +
     "El valor es POR MES · Sólo muebles que se venden ENTEROS (partes y porcentajes, en Vender) · " +
     "Borrá las dos filas de EJEMPLO."],
    [],
    // «Valor al mes» (decisión del dueño, 2026-10-26): así se negocia en las
    // tiendas, y el sistema saca el total con los meses del contrato, como
    // «Al mes» en Vender. Las plantillas viejas («Valor») se leen igual, al mes.
    ["Espacio", "Sede", "Proveedor", "Correo", "Marca o categoría",
     "Valor al mes", "Desde", "Hasta", "Nota"],
    // Las fechas del ejemplo se escriben DÍA PRIMERO, igual que la instrucción.
    // Antes salían en ISO —`2026-09-15`— y eso contradecía el renglón de arriba
    // justo en el campo donde la ambigüedad no avisa: leer 3/4 al revés no
    // falla ruidoso, crea el contrato tres meses corrido y nadie se entera.
    ["EJEMPLO-01", tienda, "Nutresa", "comercial@nutresa.com.co", "Chocolatinas",
     650000, diaPrimero(hoy), diaPrimero(luego),
     "Borrá esta fila: es un ejemplo del formato"],
    ["EJEMPLO-02", tienda, "Alpina", "", "Lácteos",
     400000, diaPrimero(hoy), diaPrimero(luego), "Borrá esta fila también"],
  ];
}

/** `15/09/2026`. La forma que una persona escribe, y la que la instrucción
 *  promete: el ejemplo tiene que poder copiarse tal cual. */
function diaPrimero(d: Date): string {
  const dd = `${d.getDate()}`.padStart(2, "0");
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${dd}/${m}/${d.getFullYear()}`;
}

/** La hoja de ayuda. Vive en la segunda pestaña, así que puede respirar. */
function filasDeInstrucciones(sede: string): unknown[][] {
  const tienda = sede || "NAVE";
  return [
    ["CÓMO LLENAR LA PLANILLA"],
    ["Un contrato por fila, en la pestaña «Contratos»."],
    [],
    ["COLUMNA", "QUÉ VA AHÍ"],
    ["Espacio", "El código tal como está en el plano: PUN-04, IMP-17."],
    ["", "La cara de atrás de una góndola doble lleva «-B»: GON-60-B."],
    // Sólo enteros (decisión del dueño, 2026-10-26): lo que se vende por
    // partes o por porcentaje se dibuja y se vende en Vender.
    ["", "Sólo muebles que se venden ENTEROS. Las partes (la puerta 2, NEV-03-PU2;"],
    ["", "el tramo 3, GON-05-TR3) y los porcentajes (GON-01-PC1) se venden en Vender."],
    ["Sede", `Escrita igual que en el sistema: ${tienda}.`],
    ["", "Una misma planilla puede tener filas de tiendas distintas:"],
    ["", "cada fila va a la suya, no a la que tengas abierta."],
    ["Proveedor", "Si todavía no existe, se crea solo."],
    ["Correo", "Opcional. Con él se le manda la constancia del contrato."],
    ["Marca", "Opcional. La marca o el rubro que se va a exhibir."],
    ["Valor al mes", "Lo que se paga CADA MES. El total del contrato es este valor"],
    ["", "× los meses entre Desde y Hasta (lo calcula el sistema)."],
    ["", "Sólo el número: 650000. Sin puntos y sin signo de pesos."],
    // Las dos fechas van bajo UNA etiqueta: partirlas dejaba «Hasta»
    // encabezando la línea de los separadores, como si eso fuera lo que
    // significa Hasta.
    ["Desde y Hasta", "DÍA PRIMERO: 15/09/2026 es el 15 de septiembre."],
    ["", "Sirve con / - o . — y también 2026-09-15 (año-mes-día)."],
    ["", "Los dos extremos cuentan: del 1 al 30 son treinta días."],
    ["Nota", "Opcional. Queda guardada en el contrato."],
    [],
    ["ANTES DE SUBIRLA"],
    ["1.", "Borrá las dos filas que dicen EJEMPLO."],
    ["2.", "No hace falta borrar estas instrucciones: el sistema lee sólo"],
    ["", "la pestaña «Contratos»."],
    [],
    ["AL SUBIRLA"],
    ["", "Vas a ver fila por fila qué se va a crear, con sus errores si los"],
    ["", "hay, y podés destildar las que no quieras. Nada se guarda hasta"],
    ["", "que confirmes."],
  ];
}

// ─── El archivo, con diseño ──────────────────────────────────────────────────
//
// Se arma con ExcelJS y no con la librería que LEE, y no es capricho: SheetJS
// en su versión community no escribe estilos —ni fondos, ni negritas, ni
// bordes—, así que todo lo de abajo sale en gris plano. ExcelJS sí, y no
// arrastra de vuelta el SheetJS 0.18, que es la versión con vulnerabilidades
// conocidas de la que este proyecto ya se había movido.
//
// Entra por `import()` perezoso: sólo se descarga cuando alguien pide la
// plantilla, que es una acción de admin y poco frecuente. El mismo trato que
// tiene three.js en la landing.
//
// La paleta es la de la aplicación (`tema.css`), no una inventada: papel
// #EFF1ED, tinta #0A1014, líneas #DDDEDE. Restringida a propósito — una
// planilla de colores se ve hecha por una plantilla de Office, no por el
// sistema que la va a leer.

const TINTA = "FF0A1014";      // --ink-1
const TINTA_2 = "FF4A5B65";    // --ink-2
const TINTA_3 = "FF54646E";    // --ink-3
const PAPEL = "FFF7F8F5";      // --surface-2
const LINEA = "FFDDDEDE";      // --line
const BLANCO = "FFFFFFFF";

/** Un borde fino, del color de las líneas de la aplicación. */
const borde = {
  top: { style: "thin" as const, color: { argb: LINEA } },
  left: { style: "thin" as const, color: { argb: LINEA } },
  bottom: { style: "thin" as const, color: { argb: LINEA } },
  right: { style: "thin" as const, color: { argb: LINEA } },
};

const relleno = (argb: string) =>
  ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

/**
 * El libro con diseño. Devuelve el workbook de ExcelJS, ya armado.
 *
 * Aparte de `descargarPlantilla` para poder PROBAR lo que de verdad se baja:
 * las pruebas lo escriben a un buffer y lo leen con el mismo `leerPlanilla` que
 * abre lo que manda la gente. Probar una aproximación armada a mano sería
 * probar otra cosa.
 */
export async function libroDePlantilla(sede: string) {
  // La interoperabilidad de exceljs cambia según quién lo cargue: Vite entrega
  // el CJS bajo `default`, y node lo expone plano. Se aceptan las dos formas en
  // vez de casarse con una y descubrir en producción que era la otra.
  const mod = (await import("exceljs")) as unknown as Record<string, any>;
  const Workbook = mod.Workbook ?? mod.default?.Workbook;
  const libro = new Workbook();
  libro.creator = "RECABRA";

  // ── Hoja 1 · Contratos ────────────────────────────────────────────────────
  // PRIMERA a propósito: `leerPlanilla` lee la hoja 0, así que el orden de
  // estas dos hojas es funcional, no estético.
  const datos = libro.addWorksheet("Contratos", {
    views: [{ state: "frozen", ySplit: 4 }],   // los títulos quedan fijos al bajar
  });
  datos.columns = [
    { width: 16 }, { width: 15 }, { width: 20 }, { width: 28 }, { width: 20 },
    { width: 14 }, { width: 13 }, { width: 13 }, { width: 44 },
  ];

  const filas = filasDeContratosDePlantilla(sede);
  filas.forEach((f) => datos.addRow(f));

  // Franja de título: tinta llena, letra blanca. Es lo primero que se ve.
  datos.mergeCells("A1:I1");
  const titulo = datos.getRow(1);
  titulo.height = 26;
  titulo.getCell(1).fill = relleno(TINTA);
  titulo.getCell(1).font = { bold: true, size: 12, color: { argb: BLANCO } };
  titulo.getCell(1).alignment = { vertical: "middle", indent: 1 };

  // Franja de lo imprescindible: papel, para que se lea como una nota y no
  // como un dato.
  datos.mergeCells("A2:I2");
  const aviso = datos.getRow(2);
  aviso.height = 22;
  aviso.getCell(1).fill = relleno(PAPEL);
  aviso.getCell(1).font = { size: 10, color: { argb: TINTA_2 } };
  aviso.getCell(1).alignment = { vertical: "middle", indent: 1 };

  // Los títulos de columna: la misma tinta del encabezado, para que el ojo los
  // lea como el borde de arriba de la tabla y no como una fila más.
  const cabecera = datos.getRow(4);
  cabecera.height = 20;
  cabecera.eachCell((celda: Cell) => {
    celda.fill = relleno(TINTA);
    celda.font = { bold: true, size: 10, color: { argb: BLANCO } };
    celda.alignment = { vertical: "middle", indent: 1 };
    celda.border = borde;
  });

  // Los ejemplos van en cursiva y apagados: tienen que LEERSE como ejemplo,
  // no como el primer contrato de la lista.
  for (const n of [5, 6]) {
    const fila = datos.getRow(n);
    fila.height = 18;
    fila.eachCell((celda: Cell) => {
      celda.fill = relleno(PAPEL);
      celda.font = { italic: true, size: 10, color: { argb: TINTA_3 } };
      celda.alignment = { vertical: "middle", indent: 1 };
      celda.border = borde;
    });
    // El valor como número, alineado a la derecha y con separador de miles:
    // es lo que hace obvio que va un número pelado y no «$2.100.000».
    const valor = fila.getCell(6);
    valor.numFmt = "#,##0";
    valor.alignment = { vertical: "middle", horizontal: "right" };
  }

  // ── Hoja 2 · Cómo llenarla ────────────────────────────────────────────────
  const ayuda = libro.addWorksheet("Cómo llenarla");
  ayuda.columns = [{ width: 16 }, { width: 82 }];
  filasDeInstrucciones(sede).forEach((f) => ayuda.addRow(f));

  ayuda.mergeCells("A1:B1");
  const t2 = ayuda.getRow(1);
  t2.height = 28;
  t2.getCell(1).fill = relleno(TINTA);
  t2.getCell(1).font = { bold: true, size: 13, color: { argb: BLANCO } };
  t2.getCell(1).alignment = { vertical: "middle", indent: 1 };

  ayuda.mergeCells("A2:B2");
  ayuda.getRow(2).getCell(1).font = { size: 10, color: { argb: TINTA_2 } };
  ayuda.getRow(2).getCell(1).alignment = { indent: 1 };

  ayuda.eachRow((fila: Row, n: number) => {
    if (n <= 2) return;
    const etiqueta = String(fila.getCell(1).value ?? "");
    const texto = String(fila.getCell(2).value ?? "");
    fila.height = 17;

    // Los tres rótulos de sección —COLUMNA, ANTES DE SUBIRLA, AL SUBIRLA— son
    // los que dan el ritmo de la hoja: van en franja.
    const esSeccion = etiqueta === etiqueta.toUpperCase() && etiqueta.length > 3;
    if (esSeccion) {
      fila.height = 20;
      for (const c of [1, 2]) {
        fila.getCell(c).fill = relleno(PAPEL);
        fila.getCell(c).font = { bold: true, size: 9.5, color: { argb: TINTA } };
        fila.getCell(c).alignment = { vertical: "middle", indent: 1 };
        fila.getCell(c).border = { bottom: borde.bottom };
      }
      return;
    }

    // La etiqueta de columna en negrita; su explicación, en tinta suave. Las
    // líneas de continuación llevan la etiqueta vacía y quedan sangradas solas.
    fila.getCell(1).font = { bold: true, size: 10, color: { argb: TINTA } };
    fila.getCell(1).alignment = { vertical: "middle", indent: 1 };
    fila.getCell(2).font = { size: 10, color: { argb: texto ? TINTA_2 : TINTA_3 } };
    fila.getCell(2).alignment = { vertical: "middle", indent: 1 };
  });

  return libro;
}

/** El archivo, listo para guardar o para leer en una prueba. */
export async function bufferDePlantilla(sede: string): Promise<ArrayBuffer> {
  const libro = await libroDePlantilla(sede);
  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function descargarPlantilla(sede: string) {
  const datos = await bufferDePlantilla(sede);
  const url = URL.createObjectURL(
    new Blob([datos], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-contratos-recabra.xlsx";
  a.click();
  // Sin esto el blob queda en memoria hasta que se cierre la pestaña.
  URL.revokeObjectURL(url);
}
