/**
 * La referencia del «antes» del catálogo de muebles: qué hacía cada tipo.
 *   node scripts/capturar-catalogo.mjs --reescribir   # escribe la parte de TS
 *
 * ── Desde el catálogo único ──────────────────────────────────────────────────
 *
 * `scripts/casos/catalogo-antes.json` se capturó del código de ANTES del
 * catálogo único (el commit fafb301) y quedó fijo: es contra lo que se compara
 * el de ahora. La comparación la hacen `scripts/probar-catalogo.mjs` (que
 * importa de acá `capturarTS` y la corre sobre el código de hoy) y
 * `backend/tests/test_catalogo_muebles.py`, cada uno con la lista escrita de lo
 * que cambió a propósito.
 *
 * Por eso escribir pide `--reescribir`: corrido sobre el código de hoy, el
 * archivo pasaría a decir «después» y la comparación ya no compararía nada (la
 * lista de cambios intencionales deja de encontrar sus valores de antes y
 * `probar-catalogo` falla). Sólo tiene sentido sobre un checkout del código de
 * antes, para sumar a la referencia una consulta nueva.
 *
 * ── Para qué ─────────────────────────────────────────────────────────────────
 *
 * El tipo de mueble está enumerado a mano en unas veintidós tablas: el
 * catálogo del editor 3D, el del plano 2D, los altos y colores con que nace,
 * los prefijos, las tarifas, lo que no se alquila, los nombres de los informes,
 * los muebles de frío, las referencias del minimapa… y del lado del servidor
 * sus copias. El catálogo único las va a reemplazar por lecturas de un solo
 * archivo, y la promesa es que **un plano viejo dé exactamente lo mismo que
 * hoy**. Para poder comprobarlo hace falta haber anotado antes qué daba.
 *
 * Eso es `scripts/casos/catalogo-antes.json`. Lo escriben dos scripts, uno por
 * idioma, cada uno en su parte:
 *
 *  · éste, la parte `ts` —las tablas del frontend y lo que calculan— y además
 *    `tipos` y `plano`, el plano sintético sobre el que calculan los dos;
 *  · `backend/scripts/capturar_catalogo.py`, la parte `python`, sobre ese
 *    mismo plano. Por eso va SEGUNDO: lee el plano que escribió éste.
 *
 * Cada uno conserva la parte del otro, y los dos escriben el JSON con el mismo
 * formato (el de `JSON.stringify(…, null, 2)`), así que correrlos de nuevo sin
 * que el código haya cambiado deja el archivo idéntico, byte por byte.
 *
 * ── El plano sintético ───────────────────────────────────────────────────────
 *
 * Un mueble por cada entrada de `FIXTURE_DEFS` (los 19 que se pueden colocar
 * en el 3D, con las dos góndolas) tal como los crea el editor, y además lo que
 * sólo aparece en planos viejos: una góndola sin `gondolaType`, los tipos
 * `gondola_doble` y `gondola_mural` del 2D, la `exhibicion` legada, una zona
 * libre habilitada a mano y una caja con la bandera de alquilable puesta.
 *
 * Las tablas se corren, no se leen con expresiones regulares: las que vivían
 * adentro de los componentes están en `src/catalogo/` justamente para esto.
 * Sólo sale del texto lo que al correr no existe: los tipos (`FixType`,
 * `GondolaType`, `FixType2D`) y la paleta de la migración vieja de
 * localStorage, que es local a una función de `store/fixtureStore.ts`. Los
 * nombres de los informes (`formato.ts`) no se exportan como tabla: se anota lo
 * que contestan `tipoN` y `tipoP` para cada tipo.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const SALIDA = join(aqui, "casos", "catalogo-antes.json");
const reescribir = process.argv.includes("--reescribir");
const esElPrograma = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

/** Un módulo de `src`, compilado con esbuild y corrido acá mismo. */
const cargar = async (rel, extra = {}) => {
  const r = await build({
    entryPoints: [join(raiz, rel)],
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    ...extra,
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

const ARCHIVO = {
  fixtures: "src/types/fixtures.ts",
  nomenclatura: "src/utils/nomenclatura.ts",
  formato: "src/components/plataforma/formato.ts",
  producto: "src/components/StoreEditor3D/muebles/producto.ts",
  pasillos: "src/utils/pasillos.ts",
  medidas: "src/components/StoreEditor3D/muebles/medidas.ts",
  venta: "src/components/StoreEditor3D/muebles/venta.ts",
  convertir: "src/utils/convertirPlano.ts",
  editor3D: "src/catalogo/editor3D.ts",
  plano2D: "src/catalogo/plano2D.ts",
  minimapa: "src/catalogo/minimapa.ts",
  store: "src/store/fixtureStore.ts",
};
const de = (clave) => "frontend/" + ARCHIVO[clave];

const F = await cargar(ARCHIVO.fixtures);
const N = await cargar(ARCHIVO.nomenclatura);
const FMT = await cargar(ARCHIVO.formato);
const P = await cargar(ARCHIVO.producto);
const PAS = await cargar(ARCHIVO.pasillos);
const M = await cargar(ARCHIVO.medidas);
// `venta.ts` despacha a las cuentas de la góndola y la punta, que viven en
// componentes (React y three): se compila como lo hace `probar-muebles`.
const V = await cargar(ARCHIVO.venta, { platform: "node", jsx: "automatic" });
const CP = await cargar(ARCHIVO.convertir);
const C3 = await cargar(ARCHIVO.editor3D);
const C2 = await cargar(ARCHIVO.plano2D);
const CM = await cargar(ARCHIVO.minimapa);

// ─── Lo que sale del texto ────────────────────────────────────────────────────

/** Los miembros de un `export type X = "a" | "b" | …;`. */
function unionDe(clave, nombre) {
  const texto = readFileSync(join(raiz, ARCHIVO[clave]), "utf8");
  const m = new RegExp(`export type ${nombre} =([^;]*);`).exec(texto);
  assert.ok(m, `no se encontró \`${nombre}\` en ${ARCHIVO[clave]}`);
  const miembros = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(miembros.length > 0, `\`${nombre}\` quedó vacío`);
  return miembros;
}

/** La paleta de la migración vieja de localStorage: es local a una función. */
function coloresDeLaMigracion() {
  const texto = readFileSync(join(raiz, ARCHIVO.store), "utf8");
  const m = /const COLOR_DEFAULTS: Record<string, string> = (\{[^}]*\});/.exec(texto);
  assert.ok(m, `no se encontró \`COLOR_DEFAULTS\` en ${ARCHIVO.store}`);
  return Function(`"use strict"; return (${m[1]});`)();
}

const FIX_TYPE = unionDe("fixtures", "FixType");
const GONDOLA_TYPE = unionDe("fixtures", "GondolaType");
const FIX_TYPE_2D = unionDe("convertir", "FixType2D");

/** Todos los tipos que algún lado conoce, más uno que nadie conoce: las
 *  tablas se consultan con cada uno, para que quede anotado también qué
 *  hace cada una con lo que no tiene. */
const DESCONOCIDO = "desconocido";
export const TIPOS = [...FIX_TYPE, ...FIX_TYPE_2D.filter((t) => !FIX_TYPE.includes(t)), DESCONOCIDO];

// ─── El plano sintético ───────────────────────────────────────────────────────

export const SEDE = "NAVE";

/** El plano sintético, armado con el código de hoy.
 *
 *  Con `soloTipos`, los muebles del editor 3D se toman sólo de esos tipos: es
 *  como `probar-catalogo.mjs` vuelve a armar el plano de la referencia sin los
 *  tipos que se sumaron después de capturarla (la nevera de puertas, el puesto
 *  de impulso…). Sin eso, cada tipo nuevo corría la numeración y la grilla de
 *  todos los que venían detrás, y la comparación fallaba sin que ningún plano
 *  viejo hubiera cambiado. */
export function armarPlano({ soloTipos } = {}) {
  const muebles = [];
  const poner = (nombre, m) => {
    const i = muebles.length;
    muebles.push({
      id: `sint-${String(i + 1).padStart(2, "0")}-${nombre}`,
      // El mismo código que le daría el editor al colocarlo acá.
      code: N.siguienteCodigo(m.type, muebles),
      type: m.type,
      ...(m.gondolaType ? { gondolaType: m.gondolaType } : {}),
      label: m.label,
      // Una grilla de 5 columnas cada 4 m: ninguno toca a otro.
      cx: 2 + (i % 5) * 4,
      cz: 2 + Math.floor(i / 5) * 4,
      rotY: 0,
      w: m.w, d: m.d, h: m.h,
      color: m.color,
      sede: SEDE,
      ...(m.rentable !== undefined ? { rentable: m.rentable } : {}),
    });
  };

  // Los 19 del editor 3D, como los crea él (`onFloorClick` en StoreEditor3D):
  // la bandera sólo en los que nacen fuera de la venta.
  for (const d of C3.FIXTURE_DEFS) {
    if (soloTipos && !soloTipos.includes(d.type)) continue;
    poner(d.gondolaType ? `${d.type}-${d.gondolaType}` : d.type, {
      type: d.type, gondolaType: d.gondolaType, label: d.label,
      w: d.w, d: d.d, h: d.h, color: d.color,
      rentable: F.NON_RENTABLE_BY_DEFAULT.has(d.type) ? false : undefined,
    });
  }
  // Lo que sólo traen los planos viejos.
  const doble = C3.FIXTURE_DEFS.find((d) => d.gondolaType === "double");
  poner("gondola-sin-gondolaType", {
    type: "gondola", label: doble.label, w: doble.w, d: doble.d, h: doble.h, color: doble.color,
  });
  for (const t of ["gondola_doble", "gondola_mural"]) {
    const c = C2.CATALOG.find((x) => x.type === t);
    poner(`${t}-legado-2D`, {
      type: t, label: c.label, w: c.w, d: c.h, h: C2.H_DEFAULTS[t], color: C2.COLOR_DEFAULTS[t],
    });
  }
  poner("exhibicion-legado", {
    type: "exhibicion", label: "Exhibición", w: 1.0, d: 1.0,
    h: C2.H_DEFAULTS.exhibicion, color: C2.COLOR_DEFAULTS.exhibicion,
  });
  // La bandera: la zona libre se habilita a mano; la caja no, diga lo que diga.
  const metro = C3.FIXTURE_DEFS.find((d) => d.type === "metro");
  poner("metro-habilitado", {
    type: "metro", label: metro.label, w: metro.w, d: metro.d, h: metro.h, color: metro.color, rentable: true,
  });
  const caja = C3.FIXTURE_DEFS.find((d) => d.type === "checkout");
  poner("checkout-con-bandera", {
    type: "checkout", label: caja.label, w: caja.w, d: caja.d, h: caja.h, color: caja.color, rentable: true,
  });
  return muebles;
}

// ─── Las tablas ───────────────────────────────────────────────────────────────

const lista = (conjunto) => [...conjunto];
const tabla = (clave, valor, nota) => ({ de: de(clave) + (nota ? ` (${nota})` : ""), valor });

/**
 * La parte `ts` de la referencia, calculada con el código de HOY sobre el plano
 * que se le pase. La captura la corrió sobre su plano sintético;
 * `probar-catalogo.mjs` la corre sobre el plano guardado en la referencia y
 * compara.
 */
export function capturarTS(MUEBLES) {
  const tablas = {
    FixType: tabla("fixtures", FIX_TYPE, "leído del texto: es un tipo"),
    GondolaType: tabla("fixtures", GONDOLA_TYPE, "leído del texto: es un tipo"),
    FixType2D: tabla("convertir", FIX_TYPE_2D, "leído del texto: es un tipo"),
    NUNCA_ALQUILABLE: tabla("fixtures", lista(F.NUNCA_ALQUILABLE)),
    NON_RENTABLE_BY_DEFAULT: tabla("fixtures", lista(F.NON_RENTABLE_BY_DEFAULT)),
    RATE_TYPES: tabla("fixtures", F.RATE_TYPES),
    CATEGORIA_DE_TIPO: tabla("fixtures", F.CATEGORIA_DE_TIPO),
    PREFIJO_POR_TIPO: tabla("nomenclatura", N.PREFIJO_POR_TIPO),
    FIXTURE_DEFS: tabla("editor3D", C3.FIXTURE_DEFS),
    TIPOS_CON_PRODUCTO: tabla("editor3D", lista(C3.TIPOS_CON_PRODUCTO)),
    TIPOS_CON_PRUEBA_3D: tabla("editor3D", lista(C3.TIPOS_CON_PRUEBA_3D)),
    TIPOS_CON_SURTIDO: tabla("editor3D", lista(C3.TIPOS_CON_SURTIDO)),
    CATALOG_2D: tabla("plano2D", C2.CATALOG),
    H_DEFAULTS_2D: tabla("plano2D", C2.H_DEFAULTS),
    COLOR_DEFAULTS_2D: tabla("plano2D", C2.COLOR_DEFAULTS),
    COLOR_DEFAULTS_migracion: tabla("store", coloresDeLaMigracion(), "leído del texto: es local a la migración vieja de localStorage"),
    MUEBLES_FRIOS: tabla("producto", lista(P.MUEBLES_FRIOS)),
    FORMAN_CORRIDA: tabla("pasillos", lista(PAS.FORMAN_CORRIDA)),
    REFERENCIAS_minimapa: tabla("minimapa", CM.REFERENCIAS),
    nombres_de_informe: tabla("formato",
      Object.fromEntries([...TIPOS, "fuera_del_plano"].map((t) => [t, { singular: FMT.tipoN(t), plural: FMT.tipoP(t, 2) }])),
      "tipoN y tipoP: el diccionario no se exporta; lo que no está sale tal cual"),
  };

  // ─── Por tipo: lo que depende sólo del tipo ──────────────────────────────────

  const porTipo = Object.fromEntries(TIPOS.map((t) => {
    const tarifa = F.rateTypeOf({ type: t });
    return [t, {
      prefijoDe: N.prefijoDe(t),
      siguienteCodigo: N.siguienteCodigo(t, MUEBLES),
      isRentable: F.isRentable({ type: t }),
      naceNoComercializable: F.NON_RENTABLE_BY_DEFAULT.has(t),
      carasDe: F.carasDe({ type: t }),
      rateTypeOf: tarifa,
      rateTypeLabel: F.rateTypeLabel(tarifa),
      enRateTypes: F.RATE_TYPES.some((r) => r.type === tarifa),
      categoriaDeTipo: F.categoriaDeTipo(t),
      informe: { singular: FMT.tipoN(t), plural: FMT.tipoP(t, 2) },
      frio: P.MUEBLES_FRIOS.has(t),
      conProducto: C3.TIPOS_CON_PRODUCTO.has(t),
      prueba3D: C3.TIPOS_CON_PRUEBA_3D.has(t),
      surtido: C3.TIPOS_CON_SURTIDO.has(t),
      formaCorrida: PAS.FORMAN_CORRIDA.has(t),
      referenciaMinimapa: CM.REFERENCIAS[t] ?? null,
    }];
  }));

  // ─── Por mueble del plano: lo que depende del mueble entero ──────────────────

  // El MISMO objeto que usa el plano 2D (`CATALOGO_2D`). Antes de que existiera
  // —el código sobre el que se capturó la referencia— se armaba acá con las
  // mismas tres tablas.
  const CAT2D = C2.CATALOGO_2D ?? { tipos: C2.CATALOG, altos: C2.H_DEFAULTS, colores: C2.COLOR_DEFAULTS };
  // Los `slots` por defecto viven en el editor (`defaultSlots`); acá no se miran.
  const CAT3D = { defs: C3.FIXTURE_DEFS, slotsPorDefecto: () => [] };

  const porMueble = Object.fromEntries(MUEBLES.map((f) => {
    const en2D = CP.storeToItems([f], CAT2D)[0];
    // Sin rótulo ni color guardados: el 3D los busca en `FIXTURE_DEFS`.
    const en3D = CP.storeToFixtures([{ ...f, label: "", color: "" }], CAT3D)[0] ?? null;
    return [f.id, {
      isRentable: F.isRentable(f),
      carasDe: F.carasDe(f),
      isDoubleGondola: F.isDoubleGondola(f),
      rateTypeOf: F.rateTypeOf(f),
      fullSpaceCode: F.fullSpaceCode(f.sede, f.code),
      ventaDeTipo: V.ventaDeTipo(f.type, f.w, f.d, f.h, f.gondolaType),
      editor2D: { type: en2D.type, label: en2D.label, w: en2D.w, h: en2D.h },
      editor3D: en3D && { type: en3D.type, gondolaType: en3D.gondolaType ?? null, label: en3D.label, color: en3D.color },
    }];
  }));

  /** Un mueble NUEVO dibujado en el 2D, de cada tipo de su catálogo (y de la
   *  exhibición, que se dibuja sin catálogo): con qué alto, color y rótulo llega
   *  al store. Es donde pesan `H_DEFAULTS` y `COLOR_DEFAULTS`. */
  const naceEn2D = Object.fromEntries(FIX_TYPE_2D.map((t) => {
    const c = C2.CATALOG.find((x) => x.type === t);
    const item = {
      id: `nuevo-${t}`, type: t, code: N.siguienteCodigo(t, []), label: c?.label ?? t,
      x: 0, y: 0, w: c?.w ?? 1, h: c?.h ?? 1, rotY: 0, status: "free",
      supplierName: "", brandCategory: "", negotiatedValue: 0, startDate: "", endDate: "", observation: "",
      sede: SEDE,
    };
    const f = CP.itemsToStore([item], [], CAT2D)[0];
    return [t, { type: f.type, gondolaType: f.gondolaType ?? null, label: f.label, w: f.w, d: f.d, h: f.h, color: f.color }];
  }));

  // ─── Medidas típicas ──────────────────────────────────────────────────────────

  const medidas = {
    de: de("medidas"),
    nivelesDeEntrepano: [1.2, 1.35, 1.5, 1.6, 1.8, 1.9, 2.0, 2.2, 2.4, 2.6]
      .map((alto) => ({ alto, niveles: M.nivelesDeEntrepano(alto) })),
    vanosDeCorrido: [0.3, 0.6, 0.9, 1.0, 1.2, 1.25, 1.5, 1.8, 2.0, 2.5, 3.0, 3.6, 3.75, 5.0, 7.5]
      .map((ancho) => ({ ancho, vanos: M.vanosDeCorrido(ancho) })),
    puertasDeNevera: [0.6, 0.75, 0.9, 1.2, 1.445, 1.5, 1.8, 2.0, 2.07, 2.25, 2.5, 3.0]
      .map((ancho) => ({ ancho, puertas: M.puertasDeNevera(ancho) })),
    cotasDeCheckout: [[1.8, 0.7, 0.9], [1.2, 0.6, 0.85], [1.5, 0.6, 0.9], [2.0, 0.8, 0.95], [2.4, 0.9, 0.9], [3.0, 0.9, 1.0]]
      .map(([w, d, h]) => ({ w, d, h, cotas: M.cotasDeCheckout(w, d, h) })),
  };

  const ts = {
    fuente: "frontend/scripts/capturar-catalogo.mjs",
    tablas,
    por_tipo: porTipo,
    por_mueble: porMueble,
    nace_en_2D: tabla("convertir", naceEn2D, "itemsToStore con el catálogo del plano 2D"),
    prefijoDesalineado: tabla("nomenclatura", N.prefijoDesalineado(MUEBLES)),
    medidas,
  };
  return ts;
}

// ─── El archivo ───────────────────────────────────────────────────────────────

const LEEME = [
  "La referencia del ANTES del catálogo único de muebles: qué hace hoy cada tipo, en el frontend y en el servidor.",
  "La escriben frontend/scripts/capturar-catalogo.mjs (tipos, plano y la parte ts) y después backend/scripts/capturar_catalogo.py (la parte python, sobre el mismo plano).",
  "Cada tabla dice de qué archivo salió. Con el catálogo único, un plano viejo tiene que dar exactamente esto salvo los desfases que se arreglen a propósito.",
  "No se edita a mano: se vuelve a capturar.",
];

if (esElPrograma && !reescribir) {
  console.error("catalogo-antes.json es la referencia FIJA de antes del catálogo único: se compara con\n"
    + "`npm run probar:catalogo`. Para escribirla hace falta `--reescribir`, y sólo sobre el código de antes.");
  process.exitCode = 2;
} else if (esElPrograma) {
  const MUEBLES = armarPlano();
  const ts = capturarTS(MUEBLES);
  const anterior = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
  const nuevo = {
    leeme: LEEME,
    tipos: TIPOS,
    plano: { sede: SEDE, muebles: MUEBLES },
    ts,
    ...(anterior.python ? { python: anterior.python } : {}),
  };
  writeFileSync(SALIDA, JSON.stringify(nuevo, null, 2) + "\n");
  const n = Object.keys(ts.tablas).length;
  console.log(`catalogo-antes.json: ${n} tablas, ${TIPOS.length} tipos, ${MUEBLES.length} muebles en el plano`
    + (anterior.python ? " (la parte python se conservó)" : " — falta la parte python: correr backend/scripts/capturar_catalogo.py --reescribir"));
}
