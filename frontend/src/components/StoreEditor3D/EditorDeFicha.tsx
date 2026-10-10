import { useEffect, useMemo, useRef, useState } from "react";
import type { Recorte } from "./muebles/recorte";
import { prepararFotoDe } from "./muebles/prepararFoto";
import { empaqueDeArte } from "./muebles/producto";
import type { FichaDeArte, FormaDeFicha } from "./muebles/producto";

/**
 * La ficha del arte: forma del envase, medidas y qué hacer con el fondo de la
 * foto, con la vista previa del recorte.
 *
 * ## Por qué se pide
 *
 * El alto del envase es lo que decide la ESCALA del producto en el 3D y
 * cuántos frentes entran por entrepaño, que es la cuenta que se negocia. Por
 * rubro solo, un yogur cae en un tetra de 20 cm; el vaso mide 9. Y el fondo:
 * la vista previa muestra cómo quedó el recorte ANTES de llevarlo a la
 * reunión, con la salida a mano (Quitar / Dejar) cuando el automático no
 * acierta.
 *
 * La usan el formulario de alta y el botón «Medidas» de las artes ya cargadas.
 */

export const FICHA_VACIA: FichaDeArte = {
  forma: "auto", alto_mm: null, ancho_mm: null, fondo_mm: null,
  apilable: false, acostado: false, fondo_foto: "auto", precio_publico: null,
};

/** Los topes del precio (los mismos que valida el servidor). */
export const PRECIO_MINIMO = 50;
export const PRECIO_MAXIMO = 10_000_000;

/** Lo que se leyó de un campo: el valor (o null si está vacío) y, si no se
 *  pudo leer o se sale de los topes, por qué. */
export interface Lectura { valor: number | null; error: string | null }

/**
 * El precio que se teclea → pesos enteros.
 *
 * Acá el punto separa los miles, pero la coma también aparece así («4,900»,
 * como lo escribe un teclado en inglés): una coma o un punto seguidos de
 * grupos de EXACTAMENTE tres cifras son miles; con una o dos cifras al final,
 * centavos, que se descartan («4900,00»). Antes «4,900» y «5,200» no se leían,
 * pasaban como `null` sin aviso y «Guardar medidas» borraba el precio que ya
 * estaba cargado.
 */
export function leerPrecio(texto: string): Lectura {
  const t = texto.replace(/[$\s]/g, "");
  if (!t) return { valor: null, error: null };
  const m = t.match(/^(\d{1,3}(?:([.,])\d{3})(?:\2\d{3})*|\d+)(?:([.,])\d{1,2})?$/);
  // El separador de centavos no puede ser el mismo que el de los miles.
  if (!m || (m[2] && m[3] && m[2] === m[3])) {
    return { valor: null, error: "No se entiende el precio: escribilo en pesos, por ejemplo 4.900." };
  }
  const n = Number(m[1].replace(/[.,]/g, ""));
  if (n < PRECIO_MINIMO || n > PRECIO_MAXIMO) {
    return { valor: null, error: `El precio va en pesos, entre $ ${PRECIO_MINIMO} y $ ${PRECIO_MAXIMO.toLocaleString("es-CO")}.` };
  }
  return { valor: n, error: null };
}
/** El precio en pesos, o null (vacío o ilegible: ver `leerPrecio`). */
export function aPesos(texto: string): number | null {
  return leerPrecio(texto).valor;
}
const pesosATexto = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("es-CO"));

const FORMAS: [FormaDeFicha, string][] = [
  ["caja", "Caja"], ["botella", "Botella"], ["lata", "Lata"], ["vaso", "Vaso"],
  ["frasco", "Frasco"], ["bolsa", "Bolsa"], ["otro", "Otro"],
];

const FONDOS: [FichaDeArte["fondo_foto"], string][] = [
  ["auto", "Auto"], ["quitar", "Quitar"], ["conservar", "Dejar"],
];

/** Centímetros con coma, como se escriben acá: 7,4. */
export const enCm = (m: number) => (m * 100).toFixed(1).replace(".", ",").replace(",0", "");

/** Los topes de cada medida en mm: los MISMOS que valida el servidor
 *  (`FichaIn` en `routers/catalogo.py`). Repetidos acá para decirlo en cm y
 *  en castellano: el 422 del servidor llegaba en inglés, sin el campo y en mm
 *  («Input should be less than or equal to 1500» al escribir 160). */
export const TOPES_MM = { alto: [10, 1500], ancho: [10, 1500], fondo: [5, 1500] } as const;
const NOMBRE_DE_MEDIDA = { alto: "El alto", ancho: "El ancho", fondo: "El fondo" } as const;

/**
 * Lo que se teclea en un campo de medida → milímetros enteros.
 *
 * El campo es en cm, pero se escribe como se escribe: «9», «9,5», «9 cm»,
 * «9cm» o «90 mm». Antes «9 cm» no se leía, pasaba como `null` sin ningún
 * aviso y «Guardar medidas» borraba el alto que estaba bien: el yogur volvía a
 * estimarse como un tetra de 20 cm. Si no se entiende o se sale de los topes,
 * lo dice (y el guardado se bloquea: `onValidez`).
 */
export function leerMedida(texto: string, campo: "alto" | "ancho" | "fondo"): Lectura {
  const t = texto.trim().toLowerCase();
  if (!t) return { valor: null, error: null };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(cm|mm)?$/);
  const n = m ? Number(m[1].replace(",", ".")) : NaN;
  if (!m || !Number.isFinite(n) || n <= 0) {
    return { valor: null, error: `No se entiende «${texto.trim()}»: ${NOMBRE_DE_MEDIDA[campo].toLowerCase()} va en cm, por ejemplo 9,5.` };
  }
  const mm = Math.round(m[2] === "mm" ? n : n * 10);
  const [min, max] = TOPES_MM[campo];
  if (mm < min || mm > max) {
    const cm = (x: number) => String(x / 10).replace(".", ",");
    return { valor: null, error: `${NOMBRE_DE_MEDIDA[campo]} va entre ${cm(min)} y ${cm(max)} cm (escribiste ${cm(mm)} cm).` };
  }
  return { valor: mm, error: null };
}
/** Lo que se teclea en cm → milímetros enteros, o null (ver `leerMedida`). */
const aMm = (texto: string, campo: "alto" | "ancho" | "fondo" = "alto"): number | null => leerMedida(texto, campo).valor;
const mmACm = (mm: number | null) => (mm == null ? "" : String(mm / 10).replace(".", ","));

/** El estado del recorte dicho en palabras, para quien no sabe qué es un alfa. */
export function estadoEnPalabras(r: Pick<Recorte, "estado">, modo: FichaDeArte["fondo_foto"]): string {
  switch (r.estado) {
    case "fondo-quitado": return "Fondo quitado";
    case "ya-tenia-alfa": return "Ya traía transparencia";
    case "dudoso": return "Dudoso: se dejó como está, elegí Quitar o Dejar";
    default: return modo === "conservar" ? "Se dejó el fondo, como pediste" : "No se quitó: el fondo no es parejo";
  }
}

/**
 * ¿La foto de una CAJA está en perspectiva (se le ve el costado)?
 *
 * Una caja de frente, recortada, llena su rectángulo (relleno ≥ 0,97) y es
 * simétrica. La de tres cuartos deja dos esquinas vacías y carga un lado: en
 * el 3D se ve «doble lomo» —el costado de la foto pegado al frente de cada
 * caja—. Con la Müsli de prueba (relleno 0,90, asimetría 0,068) el umbral
 * viejo (relleno < 0,9) no avisaba.
 */
export function pareceEnPerspectiva(r: Pick<Recorte, "estado" | "relleno" | "simetria">): boolean {
  return r.estado === "fondo-quitado" && (r.relleno < 0.94 || r.simetria > 0.05);
}

/** Baja una imagen a ≤ `lado` px y la recorta. Una vez por imagen y modo.
 *  Con el MISMO worker que la etiqueta del 3D (`prepararFotoDe`): el alta de
 *  un arte se hace con el proveedor mirando, y el recorte en el hilo
 *  principal trababa la pantalla cada vez que se cambiaba «Quitar / Dejar». */
async function recortarImagen(imagen: Blob | string, modo: FichaDeArte["fondo_foto"], lado = 512) {
  let blob: Blob;
  if (typeof imagen === "string") {
    const res = await fetch(imagen);
    if (!res.ok) throw new Error(`la foto respondió ${res.status}`);
    blob = await res.blob();
  } else blob = imagen;
  return (await prepararFotoDe(blob, modo, null, lado)).recorte;
}

export default function EditorDeFicha({
  imagen, ficha, nombre = "", categoria, onCambio, altoObligatorio = false, onValidez,
}: {
  /** El archivo recién elegido, o la URL de un arte ya cargado. */
  imagen: Blob | string;
  ficha: FichaDeArte;
  nombre?: string;
  categoria?: string | null;
  onCambio: (f: FichaDeArte) => void;
  /** En un arte NUEVO el alto es obligatorio: se marca el campo. */
  altoObligatorio?: boolean;
  /** Lo que no se puede guardar así (un campo que no se entiende o fuera de
   *  los topes), en palabras; vacío si la ficha está bien. Quien guarda lo
   *  usa para bloquear el botón: antes un campo ilegible viajaba como `null`
   *  y pisaba el valor que había. */
  onValidez?: (problemas: string[]) => void;
}) {
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const lienzo = useRef<HTMLCanvasElement>(null);
  // Lo que se está tecleando, para que «7,» no se borre a mitad de camino.
  const [textos, setTextos] = useState(() => ({
    alto: mmACm(ficha.alto_mm), ancho: mmACm(ficha.ancho_mm), fondo: mmACm(ficha.fondo_mm),
  }));
  const [textoPrecio, setTextoPrecio] = useState(() => pesosATexto(ficha.precio_publico));
  // Igual que las medidas: si la ficha cambia desde afuera, el campo la sigue.
  useEffect(() => {
    setTextoPrecio((t) => (aPesos(t) === (ficha.precio_publico ?? null) ? t : pesosATexto(ficha.precio_publico)));
  }, [ficha.precio_publico]);
  const lecturaDelPrecio = leerPrecio(textoPrecio);
  const precioInvalido = lecturaDelPrecio.error != null;
  // Si la ficha cambia DESDE AFUERA —otra foto en el alta, que la vacía, o
  // «Medidas» de otro producto sin cerrar el editor—, los campos la siguen.
  // Antes quedaba el «9» viejo escrito con la ficha ya vacía: el campo en
  // rojo y «Poné el alto» con el campo lleno. Lo tecleado a medias no se
  // pisa: «7,» ya vale 7 cm, igual que la ficha.
  useEffect(() => {
    setTextos((t) => {
      const sigue = (texto: string, mm: number | null, c: "alto" | "ancho" | "fondo") =>
        (aMm(texto, c) === mm ? texto : mmACm(mm));
      const nuevo = {
        alto: sigue(t.alto, ficha.alto_mm, "alto"), ancho: sigue(t.ancho, ficha.ancho_mm, "ancho"),
        fondo: sigue(t.fondo, ficha.fondo_mm, "fondo"),
      };
      return nuevo.alto === t.alto && nuevo.ancho === t.ancho && nuevo.fondo === t.fondo ? t : nuevo;
    });
  }, [ficha.alto_mm, ficha.ancho_mm, ficha.fondo_mm]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError("");
    recortarImagen(imagen, ficha.fondo_foto)
      .then((r) => { if (vivo) setRecorte(r); })
      .catch(() => { if (vivo) setError("No se pudo leer la imagen para la vista previa."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [imagen, ficha.fondo_foto]);

  useEffect(() => {
    const c = lienzo.current;
    if (!c || !recorte) return;
    c.width = recorte.ancho;
    c.height = recorte.alto;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(recorte.rgba), recorte.ancho, recorte.alto), 0, 0);
  }, [recorte]);

  // Lo que se estimaría con lo que hay: es el placeholder de ancho y fondo.
  const estimado = useMemo(
    () => (recorte ? empaqueDeArte({ nombre, categoria }, ficha, recorte) : null),
    [recorte, nombre, categoria, ficha],
  );

  const cambiar = (parcial: Partial<FichaDeArte>) => onCambio({ ...ficha, ...parcial });
  const medida = (campo: "alto" | "ancho" | "fondo", texto: string) => {
    setTextos((t) => ({ ...t, [campo]: texto }));
    cambiar({ [`${campo}_mm`]: aMm(texto, campo) } as Partial<FichaDeArte>);
  };
  // Lo que no se puede guardar, campo por campo. Se le avisa a quien guarda
  // sólo cuando cambia (el texto, no la referencia del arreglo).
  const errores = {
    alto: leerMedida(textos.alto, "alto").error,
    ancho: leerMedida(textos.ancho, "ancho").error,
    fondo: leerMedida(textos.fondo, "fondo").error,
  };
  const problemas = [errores.alto, errores.ancho, errores.fondo, lecturaDelPrecio.error].filter((e): e is string => !!e);
  const claveDeProblemas = problemas.join("|");
  const avisar = useRef(onValidez);
  avisar.current = onValidez;
  useEffect(() => {
    avisar.current?.(claveDeProblemas ? claveDeProblemas.split("|") : []);
  }, [claveDeProblemas]);

  const campo = "w-full rounded border border-dark-line-2 bg-dark-bg px-2 py-1 text-xs text-dark-ink-1 placeholder:text-dark-ink-3 focus:border-accent focus:outline-none";
  const chip = (activo: boolean) =>
    `rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
      activo ? "bg-accent text-accent-ink" : "border border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"
    }`;
  const enPerspectiva = ficha.forma === "caja" && !!recorte && pareceEnPerspectiva(recorte);
  const faltaAlto = altoObligatorio && !ficha.alto_mm && !errores.alto;
  // Con el fondo de la foto puesto, el ancho que sale de la foto puede traer
  // márgenes (`empaqueDeArte`, `anchoEstimado`): se pide.
  const pideAncho = !!estimado?.anchoEstimado;

  return (
    <div className="flex gap-3" data-editor-de-ficha>
      {/* La vista previa del recorte, sobre un damero: es como se ve qué quedó
          transparente y qué no. */}
      <div className="flex w-32 flex-shrink-0 flex-col gap-1">
        <div
          className="flex h-40 items-center justify-center overflow-hidden rounded border border-dark-line-2"
          style={{
            backgroundColor: "#fff",
            backgroundImage:
              "linear-gradient(45deg,#d6d6d6 25%,transparent 25%,transparent 75%,#d6d6d6 75%)," +
              "linear-gradient(45deg,#d6d6d6 25%,transparent 25%,transparent 75%,#d6d6d6 75%)",
            backgroundSize: "12px 12px",
            backgroundPosition: "0 0,6px 6px",
          }}
        >
          {cargando ? (
            <span className="text-[10px] text-dark-ink-3">Recortando…</span>
          ) : error ? (
            <span className="px-1 text-center text-[10px] text-danger">{error}</span>
          ) : (
            <canvas ref={lienzo} className="max-h-full max-w-full" style={{ objectFit: "contain" }} />
          )}
        </div>
        {recorte && !cargando && (
          <p className="text-[10px] leading-snug text-dark-ink-2" data-estado-recorte={recorte.estado}>
            {estadoEnPalabras(recorte, ficha.fondo_foto)}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-dark-ink-3">Forma del envase</p>
          <div className="flex flex-wrap gap-1">
            {FORMAS.map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => cambiar({ forma: ficha.forma === valor ? "auto" : valor })}
                className={chip(ficha.forma === valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-dark-ink-3">
            Alto (cm){altoObligatorio ? " *" : ""}
            <input
              value={textos.alto}
              inputMode="decimal"
              onChange={(e) => medida("alto", e.target.value)}
              placeholder={estimado ? `≈ ${enCm(estimado.alto)}` : "cm"}
              className={`${campo} ${faltaAlto || errores.alto ? "border-danger" : ""}`}
              aria-label="Alto del envase en centímetros"
            />
          </label>
          <label className="text-[10px] text-dark-ink-3">
            Ancho (cm)
            <input
              value={textos.ancho}
              inputMode="decimal"
              onChange={(e) => medida("ancho", e.target.value)}
              placeholder={estimado
                ? `≈ ${enCm(estimado.ancho)} ${estimado.anchoEstimado ? "(estimado)" : "(sale de la foto)"}`
                : "opcional"}
              className={`${campo} ${errores.ancho ? "border-danger" : pideAncho ? "border-warning" : ""}`}
              aria-label="Ancho del envase en centímetros"
            />
          </label>
          <label className="text-[10px] text-dark-ink-3">
            Fondo (cm)
            <input
              value={textos.fondo}
              inputMode="decimal"
              onChange={(e) => medida("fondo", e.target.value)}
              placeholder={estimado ? `≈ ${enCm(estimado.fondo)}` : "opcional"}
              className={`${campo} ${errores.fondo ? "border-danger" : ""}`}
              aria-label="Fondo del envase en centímetros"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-dark-ink-2">
            <input
              type="checkbox"
              checked={ficha.apilable}
              onChange={(e) => cambiar({ apilable: e.target.checked })}
            />
            se apila
          </label>
          {/* Se exhibe acostado (un vino, una botella que no entra parada): el
              3D arranca así, y «Volver a pararla» sigue a un clic. */}
          <label className="flex items-center gap-1.5 text-[11px] text-dark-ink-2">
            <input
              type="checkbox"
              checked={ficha.acostado}
              onChange={(e) => cambiar({ acostado: e.target.checked })}
            />
            va acostado
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-dark-ink-3">Fondo de la foto</span>
            {FONDOS.map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => cambiar({ fondo_foto: valor })}
                className={chip(ficha.fondo_foto === valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* El precio del hablador: opcional y vacío por defecto. Sin él, el
            hablador del porta-precios va sin cifra en la pantalla de venta;
            el sistema nunca pone un precio que nadie cargó. */}
        <label className="text-[10px] text-dark-ink-3">
          Precio en góndola (opcional)
          <input
            value={textoPrecio}
            inputMode="numeric"
            onChange={(e) => {
              setTextoPrecio(e.target.value);
              cambiar({ precio_publico: aPesos(e.target.value) });
            }}
            placeholder="sin precio: el hablador va sin cifra"
            className={`${campo} ${precioInvalido ? "border-danger" : ""}`}
            aria-label="Precio al público en pesos"
            data-precio-publico
          />
        </label>
        {/* Lo que no se entiende o se sale de los topes, en castellano y en
            cm, campo por campo (y el guardado queda bloqueado). */}
        {problemas.map((p) => (
          <p key={p} className="text-[11px] text-danger" data-problema-de-ficha>{p}</p>
        ))}

        {faltaAlto && (
          <p className="text-[11px] text-danger">
            Poné el alto del envase en cm: con eso se calcula cuántos entran.
          </p>
        )}
        {pideAncho && (
          <p className="text-[11px] text-warning" data-pide-ancho>
            La foto conserva su fondo y el ancho no se puede medir de ella: poné el ancho en cm.
          </p>
        )}
        {enPerspectiva && (
          <p className="text-[11px] text-warning">
            La foto parece en perspectiva: subí la del frente.
          </p>
        )}
        {recorte?.avisos.filter((a) => !/sombra/.test(a)).map((a) => (
          <p key={a} className="text-[10.5px] leading-snug text-dark-ink-3">{a}</p>
        ))}
      </div>
    </div>
  );
}
