import * as XLSX from "xlsx";

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
  valor: ["valor", "valor mensual", "valor mes", "precio", "renta", "canon",
          "monto", "tarifa", "valor cop", "valor mensual cop"],
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

/** Abre el archivo y devuelve las filas ya normalizadas. */
export async function leerPlanilla(archivo: File): Promise<LecturaPlanilla> {
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer, OPCIONES_DE_LECTURA);
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
     "El valor es por TODO el periodo · Borrá las dos filas de EJEMPLO."],
    [],
    // «Valor» y no «Valor mensual»: desde la fase 17 el valor NO es mensual —
    // es lo acordado por el periodo, tal como se teclea, sin prorratear.
    // Encabezarlo «mensual» invitaba a escribir una tarifa de mes para un
    // contrato de diez días. El lector sigue aceptando la grafía vieja, así que
    // las plantillas ya descargadas siguen entrando.
    ["Espacio", "Sede", "Proveedor", "Correo", "Marca o categoría",
     "Valor", "Desde", "Hasta", "Nota"],
    // Las fechas del ejemplo se escriben DÍA PRIMERO, igual que la instrucción.
    // Antes salían en ISO —`2026-09-15`— y eso contradecía el renglón de arriba
    // justo en el campo donde la ambigüedad no avisa: leer 3/4 al revés no
    // falla ruidoso, crea el contrato tres meses corrido y nadie se entera.
    ["EJEMPLO-01", tienda, "Nutresa", "comercial@nutresa.com.co", "Chocolatinas",
     2100000, diaPrimero(hoy), diaPrimero(luego),
     "Borrá esta fila: es un ejemplo del formato"],
    ["EJEMPLO-02", tienda, "Alpina", "", "Lácteos",
     1800000, diaPrimero(hoy), diaPrimero(luego), "Borrá esta fila también"],
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
    ["Sede", `Escrita igual que en el sistema: ${tienda}.`],
    ["", "Una misma planilla puede tener filas de tiendas distintas:"],
    ["", "cada fila va a la suya, no a la que tengas abierta."],
    ["Proveedor", "Si todavía no existe, se crea solo."],
    ["Correo", "Opcional. Con él se le manda la constancia del contrato."],
    ["Marca", "Opcional. La marca o el rubro que se va a exhibir."],
    ["Valor", "Lo acordado por TODO el periodo, no una tarifa mensual."],
    ["", "Sólo el número: 2100000. Sin puntos y sin signo de pesos."],
    ["Desde", "DÍA PRIMERO: 15/09/2026 es el 15 de septiembre."],
    ["Hasta", "Sirve con / - o . — y también 2026-09-15 (año-mes-día)."],
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

/** El libro entero. Aparte para poder PROBAR lo que de verdad se descarga:
 *  las pruebas leen esto con el mismo `leerPlanilla` que abre lo que manda la
 *  gente, en vez de una aproximación armada a mano. */
export function libroDePlantilla(sede: string): XLSX.WorkBook {
  const datos = XLSX.utils.aoa_to_sheet(filasDeContratosDePlantilla(sede));
  datos["!cols"] = [
    { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 26 }, { wch: 20 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 44 },
  ];
  // Los dos renglones de arriba se leen como un bloque y no como una fila de
  // datos cortada en la columna B.
  datos["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];
  datos["!rows"] = [{ hpt: 20 }, { hpt: 20 }];

  const ayuda = XLSX.utils.aoa_to_sheet(filasDeInstrucciones(sede));
  ayuda["!cols"] = [{ wch: 13 }, { wch: 78 }];

  const libro = XLSX.utils.book_new();
  // «Contratos» PRIMERO: `leerPlanilla` lee `SheetNames[0]`, así que el orden
  // de estas dos líneas es funcional, no estético.
  XLSX.utils.book_append_sheet(libro, datos, "Contratos");
  XLSX.utils.book_append_sheet(libro, ayuda, "Cómo llenarla");
  return libro;
}

export function descargarPlantilla(sede: string) {
  XLSX.writeFile(libroDePlantilla(sede), "plantilla-contratos-recabra.xlsx");
}
