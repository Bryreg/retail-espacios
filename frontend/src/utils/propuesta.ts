/**
 * La lámina que se le manda al proveedor: la exhibición encuadrada, con un pie
 * que dice de qué espacio se está hablando.
 *
 * Antes el botón de imagen bajaba un volcado crudo del lienzo. Un PNG suelto
 * sin sede, sin código de espacio y sin período no se puede adjuntar a nada:
 * el que lo recibe no sabe si es su punta de góndola o la de al lado.
 *
 * La parte que se puede probar sin navegador —el texto del pie y las medidas
 * de la lámina— vive separada del dibujo.
 */

export interface DatosPropuesta {
  sede: string;
  /** Código completo del espacio, `SEDE-CODE`. */
  espacio: string;
  /** Nombre del mueble, para quien no lee códigos. */
  mueble: string;
  proveedor: string;
  categoria: string;
  /**
   * El producto que se está mostrando en la exhibición, cuando se está
   * probando uno del catálogo.
   *
   * No es lo mismo que la categoría, y la diferencia importa: la lámina de una
   * propuesta muestra el producto de quien todavía no firmó, sobre un espacio
   * que puede tener otro contrato encima. Sin este renglón, la lámina decía el
   * proveedor del contrato vigente al lado de la foto del producto de otro.
   */
  producto?: string;
  desde: string;
  hasta: string;
  /**
   * Valor mensual, o null si no se muestra.
   *
   * Lo decide quien llama, no este módulo: la redacción por rol es del
   * servidor y de la pantalla, y meterla acá sería un segundo lugar donde se
   * puede olvidar.
   */
  valorMensual: number | null;
}

export interface Renglon { etiqueta: string; valor: string }

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

/** `2026-09-13` → `13 sep 2026`. Devuelve el original si no es una fecha ISO. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return iso ?? "";
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return iso;
  return `${Number(m[3])} ${mes} ${m[1]}`;
}

/** Igual que `fechaCorta` pero sin el año cuando cae en el año en curso:
 *  «25 ago». En una tabla de contratos vigentes el año es la misma cifra
 *  repetida veintitrés veces, y son cinco caracteres por celda que se le
 *  restan al proveedor, que es lo que sí cambia de fila en fila. El año vuelve
 *  a aparecer solo cuando la fecha NO es de este año, que es justo cuando hace
 *  falta —un contrato que termina el año que viene tiene que decirlo—. */
export function fechaEnCurso(iso: string, hoy: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return iso ?? "";
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return iso;
  const año = `${hoy.getFullYear()}` === m[1] ? "" : ` ${m[1]}`;
  return `${Number(m[3])} ${mes}${año}`;
}

/** `1800000` → `$1.800.000`. */
export function montoCorto(v: number): string {
  return "$" + Math.round(v).toLocaleString("es-CO");
}

/**
 * Los renglones del pie. Se omite lo que está vacío: un pie con "Categoría —"
 * ocupa lugar y no dice nada.
 */
export function lineasDePie(d: DatosPropuesta): Renglon[] {
  const filas: Renglon[] = [];
  if (d.proveedor.trim()) filas.push({ etiqueta: "Proveedor", valor: d.proveedor.trim() });
  if ((d.producto ?? "").trim()) filas.push({ etiqueta: "Producto", valor: d.producto!.trim() });
  if (d.categoria.trim()) filas.push({ etiqueta: "Categoría", valor: d.categoria.trim() });
  if (d.desde && d.hasta) {
    filas.push({ etiqueta: "Período", valor: `${fechaCorta(d.desde)} → ${fechaCorta(d.hasta)}` });
  }
  if (d.valorMensual !== null && d.valorMensual > 0) {
    filas.push({ etiqueta: "Valor mensual", valor: montoCorto(d.valorMensual) });
  }
  if (d.mueble.trim()) filas.push({ etiqueta: "Mueble", valor: d.mueble.trim() });
  return filas;
}

/** Medidas de la lámina en px, para N imágenes lado a lado. */
export interface Medidas {
  ancho: number; alto: number;
  imgAncho: number; imgAlto: number;
  /** Esquina superior izquierda de cada imagen. */
  imgX: number[]; imgY: number;
  pieY: number;
}

export const MARGEN = 34;
export const HUECO = 20;
/** Alto de la franja con el rótulo de cada imagen ("Hoy" / "Con la marca"). */
export const ROTULO = 30;
/** Alto de cada renglón del pie. Tiene que dar para la etiqueta chica y el
 *  valor grande: con menos, "PERÍODO" queda pegado al proveedor de arriba. */
export const RENGLON = 44;

export function medidasDeLamina(
  n: number,
  anchoFuente: number,
  altoFuente: number,
  filasPie: number,
  anchoMax = 1600,
): Medidas {
  const cuantas = Math.max(1, n);
  // Cada imagen se achica para que el conjunto entre en el ancho máximo.
  const disponible = anchoMax - MARGEN * 2 - HUECO * (cuantas - 1);
  const imgAncho = Math.floor(Math.min(anchoFuente, disponible / cuantas));
  const imgAlto = Math.round((imgAncho * altoFuente) / anchoFuente);

  const encabezado = 62;
  const imgY = MARGEN + encabezado + ROTULO;
  const pieY = imgY + imgAlto + 26;
  // El pie se arma en dos columnas.
  const filasVisibles = Math.ceil(filasPie / 2);
  const alto = pieY + filasVisibles * RENGLON + MARGEN;

  const anchoContenido = imgAncho * cuantas + HUECO * (cuantas - 1);
  const ancho = anchoContenido + MARGEN * 2;
  const imgX = Array.from({ length: cuantas }, (_, i) => MARGEN + i * (imgAncho + HUECO));

  return { ancho, alto, imgAncho, imgAlto, imgX, imgY, pieY };
}

/** Nombre del archivo. Sin espacios ni acentos: viaja por correo. */
export function nombreDeArchivo(d: DatosPropuesta, conComparacion: boolean): string {
  const limpio = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "-")
     .replace(/-+/g, "-").replace(/^-|-$/g, "");
  const partes = [limpio(d.espacio) || "espacio"];
  if (d.proveedor.trim()) partes.push(limpio(d.proveedor));
  if (conComparacion) partes.push("antes-despues");
  return partes.join("_") + ".png";
}

// ─── El dibujo (sólo navegador) ──────────────────────────────────────────────

/* Estos cinco NO son tokens del tema y no deben serlo. La lámina se dibuja en
   un `<canvas>` y sale del navegador como un PNG que se adjunta a un correo: es
   PAPEL, y el papel es blanco siempre, con tema claro o con tema oscuro. Si
   siguieran al tema, el proveedor recibiría una lámina negra porque el
   vendedor tenía el modo oscuro puesto. Lo que sí se alinea con el sistema es
   la tipografía: la misma pila de texto que el resto (`--f-text`), escrita acá
   literal porque un canvas no lee variables de CSS. */
const TINTA_1 = "#111827";
const TINTA_2 = "#4b5563";
const TINTA_3 = "#9ca3af";
const FONDO   = "#ffffff";
const LINEA   = "#e5e7eb";
const TIPO    = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';

function cargar(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("no se pudo leer la captura"));
    img.src = dataUrl;
  });
}

/**
 * Arma la lámina y la devuelve como blob PNG.
 * `tomas` va en el orden en que se muestran: para el antes y después, primero
 * el espacio como está y después con la marca puesta.
 */
export async function componerPropuesta(
  tomas: { titulo: string; dataUrl: string }[],
  datos: DatosPropuesta,
): Promise<Blob> {
  if (tomas.length === 0) throw new Error("no hay ninguna captura para componer");
  const imgs = await Promise.all(tomas.map((t) => cargar(t.dataUrl)));
  const filas = lineasDePie(datos);
  const m = medidasDeLamina(imgs.length, imgs[0].width, imgs[0].height, filas.length);

  const lienzo = document.createElement("canvas");
  lienzo.width = m.ancho;
  lienzo.height = m.alto;
  const c = lienzo.getContext("2d");
  if (!c) throw new Error("el navegador no dio contexto 2D");

  c.fillStyle = FONDO;
  c.fillRect(0, 0, m.ancho, m.alto);

  // Encabezado: el código del espacio manda, la sede lo acompaña.
  c.fillStyle = TINTA_1;
  c.font = `700 26px ${TIPO}`;
  c.textBaseline = "alphabetic";
  c.fillText(datos.espacio, MARGEN, MARGEN + 26);
  c.fillStyle = TINTA_3;
  c.font = `500 13px ${TIPO}`;
  c.fillText(datos.sede.toUpperCase(), MARGEN, MARGEN + 48);

  // Las tomas, con su rótulo encima.
  imgs.forEach((img, i) => {
    c.fillStyle = TINTA_2;
    c.font = `600 13px ${TIPO}`;
    c.fillText(tomas[i].titulo, m.imgX[i], m.imgY - 10);
    c.drawImage(img, m.imgX[i], m.imgY, m.imgAncho, m.imgAlto);
    c.strokeStyle = LINEA;
    c.lineWidth = 1;
    c.strokeRect(m.imgX[i] + 0.5, m.imgY + 0.5, m.imgAncho - 1, m.imgAlto - 1);
  });

  // Pie en dos columnas.
  const anchoCol = (m.ancho - MARGEN * 2) / 2;
  filas.forEach((f, i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = MARGEN + col * anchoCol;
    const y = m.pieY + fila * RENGLON;
    c.fillStyle = TINTA_3;
    c.font = `600 10px ${TIPO}`;
    c.fillText(f.etiqueta.toUpperCase(), x, y);
    c.fillStyle = TINTA_1;
    c.font = `600 15px ${TIPO}`;
    c.fillText(f.valor, x, y + 19);
  });

  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("no se pudo generar el PNG"))), "image/png"),
  );
}

/** Baja un blob con el nombre dado. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  // Revocar en el próximo turno: hacerlo ya cancela la descarga en Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
