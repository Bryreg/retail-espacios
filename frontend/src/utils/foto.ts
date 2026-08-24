/**
 * Preparar la foto del montaje antes de subirla.
 *
 * El mercaderista está adentro de una tienda, con datos móviles y señal
 * irregular. Una foto de un celular de 12 MP pesa entre 4 y 8 MB: subirla
 * entera convierte el reporte en el paso más frágil de todo el flujo, y ahora
 * que la foto es obligatoria, que falle la subida es que no se pueda reportar.
 *
 * Reducirla acá arregla tres cosas de una: pesa entre cinco y diez veces menos,
 * el rechazo por tamaño deja de existir, y el HEIC del iPhone sale del teléfono
 * ya convertido a JPEG — así nadie tiene que abrir después un archivo que un
 * Chrome de escritorio no sabe pintar.
 *
 * Todo el camino tiene red: ante cualquier duda se sube el archivo original.
 * Una foto perdida es un reporte perdido, y este archivo es la prueba de que
 * la exhibición se armó.
 */

/** Lado mayor de la imagen reducida. A 1600 px una góndola se ve con detalle
 *  suficiente para discutir si la exhibición quedó bien armada. */
const LADO_MAX = 1600;

/** Debajo de esto no vale la pena recomprimir: se pierde calidad sin ganar
 *  nada. El HEIC es la excepción — ese se convierte siempre. */
const YA_ES_CHICA = 900 * 1024;

/** Tope propio, por debajo del límite del servidor (10 MB). El sobre multipart
 *  suma unos cientos de bytes y nginx corta por su cuenta con un error que ni
 *  siquiera trae mensaje, así que el margen evita un rechazo mudo. */
export const MAX_SUBIDA = 9 * 1024 * 1024;

function esHeic(file: File): boolean {
  const nombre = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    nombre.endsWith(".heic") ||
    nombre.endsWith(".heif")
  );
}

/** ¿El lienzo quedó de un solo color?
 *
 *  Es la señal de que la decodificación falló en silencio. Pasa con HEIC en
 *  algunos Android: el navegador no tira error, simplemente no dibuja nada, y
 *  sale un JPEG válido de una foto negra. Eso es peor que no comprimir: la
 *  prueba queda guardada, parece correcta y no muestra nada. */
function saleEnBlanco(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const paso = Math.max(1, Math.floor(Math.min(w, h) / 8));
    const datos = ctx.getImageData(0, 0, w, h).data;
    const primero = [datos[0], datos[1], datos[2]];
    for (let y = 0; y < h; y += paso) {
      for (let x = 0; x < w; x += paso) {
        const i = (y * w + x) * 4;
        if (
          datos[i] !== primero[0] ||
          datos[i + 1] !== primero[1] ||
          datos[i + 2] !== primero[2]
        ) {
          return false;
        }
      }
    }
    return true;
  } catch {
    // Si no se puede leer el lienzo, no se puede afirmar que esté en blanco.
    return false;
  }
}

/**
 * Devuelve la foto lista para subir. Nunca falla: si algo sale mal, devuelve
 * el archivo tal como vino.
 */
async function reducir(file: File, lado: number, calidad: number): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    // createImageBitmap RECHAZA cuando no sabe decodificar el formato, que es
    // justo lo que se necesita: mejor un error acá que un JPEG en blanco.
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    if (saleEnBlanco(ctx, w, h)) return null;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", calidad),
    );
    // Solo se acepta el resultado si de verdad mejoró. Un blob vacío, o uno
    // más pesado que el original, significa que algo salió distinto de lo
    // esperado y no hay razón para arriesgar la prueba.
    if (!blob || blob.size === 0) return null;
    if (blob.size >= file.size && !esHeic(file)) return null;

    const base = file.name.replace(/\.[^.]+$/, "") || "montaje";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return null;
  }
}

/** Ni un intento puede colgarse para siempre.
 *
 *  `createImageBitmap` puede quedarse esperando —pasó con archivos corruptos y
 *  con celulares sin memoria—, y como el botón de confirmar queda bloqueado
 *  mientras tanto, un cuelgue acá deja al mercaderista sin poder reportar y sin
 *  entender por qué. Ocho segundos es mucho más de lo que tarda cualquier caso
 *  sano. */
const TOPE_MS = 8_000;

function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Devuelve la foto lista para subir. Nunca falla ni bloquea: si algo sale mal,
 * devuelve el archivo tal como vino.
 */
export async function prepararFoto(file: File): Promise<File> {
  if (file.size <= YA_ES_CHICA && !esHeic(file)) return file;

  const inicio = Date.now();
  const primero = await conTope(reducir(file, LADO_MAX, 0.82), TOPE_MS);
  if (primero && primero.size <= MAX_SUBIDA) return primero;

  // Segundo intento, más chico y más comprimido. Los celulares de 50 MP —lo
  // normal en gama media— disparan JPEG de 10 a 13 MB, y ahí un solo intento
  // no alcanza. A 1200 px todavía se ve si la exhibición quedó armada.
  const restante = TOPE_MS - (Date.now() - inicio);
  if (restante > 500) {
    const segundo = await conTope(reducir(file, 1200, 0.6), restante);
    if (segundo && segundo.size <= MAX_SUBIDA) return segundo;
    if (segundo && (!primero || segundo.size < primero.size)) return segundo;
  }
  // Lo mejor que se consiguió, aunque siga pesando: que decida el servidor.
  // Bloquear acá sería mandar al mercaderista a hacer algo que su teléfono no
  // hace, y quedarse sin reporte.
  return primero ?? file;
}
