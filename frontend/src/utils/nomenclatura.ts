/**
 * Cómo se llaman los muebles del plano.
 *
 * Toda la experiencia del sistema arranca en el plano: el código que se le pone
 * a un mueble acá es el que después viaja al contrato, al correo del
 * mercaderista y a la lámina del proveedor. Si se repite, dos espacios
 * distintos comparten historia.
 *
 * Había dos esquemas, uno por editor:
 *
 *   - El plano 2D generaba `GON-01`, buscando el número más alto y sumando uno.
 *   - El editor 3D generaba `NAVE-GON-001`, **contando** cuántos había. Borrar
 *     `GON-02` dejaba dos muebles con el mismo código, porque el conteo bajaba
 *     y el siguiente volvía a caer en un número usado.
 *
 * Acá vive uno solo, y devuelve el primer número LIBRE, no el siguiente al
 * conteo. Es geometría de nombres: se prueba sin navegador.
 */

/** Prefijo por tipo. Cubre los nombres del 3D y los del 2D, que difieren. */
export const PREFIJO_POR_TIPO: Record<string, string> = {
  // Nombres del modelo unificado / editor 3D
  gondola: "GON",
  punta: "PUN",
  robatope: "ROB",
  ristra: "RIS",
  cross: "CRS",
  metro: "MET",
  mueble: "MUE",
  isla: "EXP",
  impulsador: "IMP",
  batea: "BAT",
  isla_fria: "ISL",
  nevera_carnes: "CAR",
  nevera_refrescos: "BEB",
  stand_frutas: "FRU",
  checkout: "CAJ",
  servicio_cliente: "SAC",
  columna: "COL",
  exhibicion: "EXH",
  // Nombres que sólo usa el plano 2D: la góndola se parte en dos tipos
  gondola_doble: "GON",
  gondola_mural: "GON",
};

/** Prefijo de un mueble. Lo desconocido cae en SPC, como hacía el 2D. */
export function prefijoDe(tipo: string): string {
  return PREFIJO_POR_TIPO[tipo] ?? "SPC";
}

/** Número que lleva un código, o null si no sigue el esquema `PRE-NN`. */
export function numeroDe(codigo: string, prefijo: string): number | null {
  const c = (codigo ?? "").trim().toUpperCase();
  const p = prefijo.toUpperCase() + "-";
  if (!c.startsWith(p)) return null;
  const resto = c.slice(p.length);
  if (!/^\d+$/.test(resto)) return null;
  return parseInt(resto, 10);
}

/** Normaliza para comparar: los códigos no distinguen mayúsculas ni espacios. */
export function normalizar(codigo: string): string {
  return (codigo ?? "").trim().toUpperCase();
}

/**
 * El siguiente código libre para ese tipo.
 *
 * Toma el número más alto en uso y sigue subiendo hasta encontrar uno que no
 * esté tomado. Lo segundo importa: alguien puede haber escrito un código a
 * mano, y con sólo `max + 1` bastaba una edición manual para chocar.
 */
export function siguienteCodigo(
  tipo: string,
  existentes: { code: string }[],
): string {
  const prefijo = prefijoDe(tipo);
  const tomados = new Set(existentes.map((f) => normalizar(f.code)));
  const numeros = existentes
    .map((f) => numeroDe(f.code, prefijo))
    .filter((n): n is number => n !== null);

  let n = numeros.length ? Math.max(...numeros) + 1 : 1;
  // El tope es de cortesía: con 999 muebles del mismo tipo en una sede algo
  // más grave está pasando, pero un while sin techo no se pone en producción.
  for (let intentos = 0; intentos < 1000; intentos++, n++) {
    const candidato = `${prefijo}-${String(n).padStart(2, "0")}`;
    if (!tomados.has(candidato)) return candidato;
  }
  return `${prefijo}-${Date.now()}`;
}

/**
 * Qué OTRO mueble tiene ese código. El mueble, no un sí/no: quien avisa
 * necesita poder decir cuál, y quien lo lee necesita poder ir a mirarlo.
 *
 * Sirve para las dos preguntas, que son la misma comparación leída al derecho
 * y al revés: «este código, ¿ya es de otro?» y «este NOMBRE, ¿es el código de
 * otro?». La segunda es la que faltaba, y es por donde se metió el error.
 */
export function muebleConCodigo<T extends { id: string; code: string }>(
  texto: string,
  existentes: T[],
  exceptoId?: string,
): T | null {
  const c = normalizar(texto);
  if (!c) return null;
  return existentes.find((f) => f.id !== exceptoId && normalizar(f.code) === c) ?? null;
}

/** ¿Ese código ya lo usa OTRO mueble? */
export function codigoRepetido(
  codigo: string,
  existentes: { id: string; code: string }[],
  exceptoId?: string,
): boolean {
  return muebleConCodigo(codigo, existentes, exceptoId) !== null;
}

export interface Duplicado { codigo: string; ids: string[] }

/** Los códigos que aparecen más de una vez. Vacío es lo que se espera. */
export function duplicados(items: { id: string; code: string }[]): Duplicado[] {
  const porCodigo = new Map<string, string[]>();
  for (const f of items) {
    const c = normalizar(f.code);
    if (!c) continue;
    porCodigo.set(c, [...(porCodigo.get(c) ?? []), f.id]);
  }
  return [...porCodigo.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([codigo, ids]) => ({ codigo, ids }));
}

/** Muebles cuyo prefijo no corresponde a su tipo (renombrados a mano). */
export function prefijoDesalineado(
  items: { id: string; code: string; type: string }[],
): { id: string; code: string; esperado: string }[] {
  return items
    .filter((f) => {
      const esperado = PREFIJO_POR_TIPO[f.type];
      return esperado && !normalizar(f.code).startsWith(esperado + "-");
    })
    .map((f) => ({ id: f.id, code: f.code, esperado: prefijoDe(f.type) }));
}

// ─── El nombre del mueble ────────────────────────────────────────────────────

/**
 * Cómo se llama un mueble. Uno solo, no dos.
 *
 * Había dos campos en paralelo: el **código** que genera el sistema (`GON-800`,
 * dibujado dentro del mueble en el plano y usado para armar el código de
 * espacio que viaja al contrato) y una **nomenclatura** de texto libre,
 * opcional, que casi nadie llenaba. El panel del plano mostraba «—» mientras el
 * plano mostraba `GON-800`: dos nombres para la misma cosa, y ninguno de los
 * dos era «el» nombre.
 *
 * El nombre efectivo es el código que puso el sistema, y escribir una
 * nomenclatura lo REEMPLAZA. Así hay una sola respuesta a «¿cómo se llama este
 * mueble?», y es la que se ve en el plano, en el 3D, en la pantalla de montaje
 * y en la lámina del proveedor.
 *
 * El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es
 * cómo se lo nombra.
 */
export function nombreDeMueble(
  mueble: { code: string; nomenclatura?: string | null },
): string {
  return (mueble.nomenclatura ?? "").trim() || mueble.code;
}

/** ¿El nombre lo puso una persona, o se heredó del código del sistema? */
export function nombrePropio(
  mueble: { code: string; nomenclatura?: string | null },
): boolean {
  const puesto = (mueble.nomenclatura ?? "").trim();
  return puesto !== "" && puesto !== mueble.code;
}

/** Qué OTRO mueble se DIBUJA con ese nombre. El gemelo de `muebleConCodigo`,
 *  del lado de lo que se ve. */
export function muebleConNombre<T extends { id: string; code: string; nomenclatura?: string | null }>(
  nombre: string,
  existentes: T[],
  exceptoId?: string,
): T | null {
  const n = normalizar(nombre);
  if (!n) return null;
  return existentes.find(
    (f) => f.id !== exceptoId && normalizar(nombreDeMueble(f)) === n,
  ) ?? null;
}

/** ¿Dos muebles quedarían llamándose igual? Lo mismo que `codigoRepetido`, pero
 *  sobre el nombre que se VE, que es el que confunde a quien mira el plano. */
export function nombreRepetido(
  nombre: string,
  existentes: { id: string; code: string; nomenclatura?: string | null }[],
  exceptoId?: string,
): boolean {
  return muebleConNombre(nombre, existentes, exceptoId) !== null;
}

// ─── Un nombre que es el código de otro ──────────────────────────────────────

/**
 * Por qué un nombre no se puede usar.
 *
 * Son dos choques distintos y hay que decirlos distinto, porque el segundo es
 * el que se coló durante meses:
 *
 *   - `nombre` — otro mueble ya se DIBUJA así. Se ven dos cajas iguales en el
 *     plano y nadie sabe cuál es cuál. Esto ya se atrapaba.
 *   - `codigo` — el texto es el CÓDIGO de otro mueble. En el plano puede no
 *     verse ninguna repetición (el dueño de ese código puede estar renombrado
 *     y no dibujarlo), pero la llave sigue existiendo: quien escriba ese texto
 *     en la planilla va a firmar sobre el OTRO mueble, porque la planilla
 *     resuelve contra `code`. Es la doble venta del diagnóstico de la fase 12.
 *
 * `otro` es el mueble con el que se choca, para poder nombrarlo en el aviso.
 */
export type ChoqueDeNombre = {
  clase: "nombre" | "codigo";
  otro: { id: string; code: string; nomenclatura?: string | null };
};

/**
 * ¿Este mueble se puede llamar así? `null` es que sí.
 *
 * Es la comprobación única de los dos lugares donde se escribe un nombre: el
 * doble clic sobre la caja del plano y el campo «Nomenclatura» del panel. Antes
 * el panel no comprobaba nada y el doble clic sólo comparaba nombre contra
 * nombre, que es justo la mitad que deja pasar el caso grave.
 */
export function choqueDeNombre(
  nombre: string,
  existentes: { id: string; code: string; nomenclatura?: string | null }[],
  exceptoId?: string,
): ChoqueDeNombre | null {
  const n = normalizar(nombre);
  if (!n) return null;
  const mismoNombre = muebleConNombre(n, existentes, exceptoId);
  if (mismoNombre) return { clase: "nombre", otro: mismoNombre };
  const duenoDelCodigo = muebleConCodigo(n, existentes, exceptoId);
  if (duenoDelCodigo) return { clase: "codigo", otro: duenoDelCodigo };
  return null;
}

/**
 * El aviso, en palabras, del choque que devuelve `choqueDeNombre`.
 *
 * Nombra siempre al otro mueble por su código, que es la llave: sin eso el
 * aviso dice que algo está mal y no dice contra qué, y la persona no tiene
 * cómo resolverlo.
 */
export function textoDelChoque(nombre: string, choque: ChoqueDeNombre): string {
  const n = normalizar(nombre);
  const otro = choque.otro;
  if (choque.clase === "nombre") {
    return nombrePropio(otro)
      ? `«${n}» ya es el nombre del mueble ${otro.code}. Dos cajas con el mismo rótulo no se distinguen en el plano.`
      : `«${n}» ya es el nombre del mueble ${otro.code}, que se dibuja con su código. Dos cajas con el mismo rótulo no se distinguen en el plano.`;
  }
  return (
    `«${n}» es el código de otro mueble` +
    (nombrePropio(otro) ? `, el que se dibuja «${nombreDeMueble(otro)}»` : "") +
    `. Un contrato cargado como «${n}» se firma sobre ése, no sobre éste.`
  );
}

export interface NombreRepetidoEnPlano { nombre: string; ids: string[] }

/** Los nombres DIBUJADOS que aparecen más de una vez. `duplicados`, pero sobre
 *  lo que se lee en el plano, que es lo único que ve quien vende. */
export function nombresRepetidos(
  items: { id: string; code: string; nomenclatura?: string | null }[],
): NombreRepetidoEnPlano[] {
  const porNombre = new Map<string, string[]>();
  for (const f of items) {
    const n = normalizar(nombreDeMueble(f));
    if (!n) continue;
    porNombre.set(n, [...(porNombre.get(n) ?? []), f.id]);
  }
  return [...porNombre.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([nombre, ids]) => ({ nombre, ids }));
}

export interface NombrePisaCodigo {
  /** El mueble renombrado a mano. */
  id: string;
  code: string;
  nombre: string;
  /** El mueble cuyo código quedó pisado por ese nombre. */
  otroId: string;
  otroCode: string;
}

/**
 * Los muebles cuyo nombre puesto a mano es el CÓDIGO de otro mueble.
 *
 * No se puede prohibir de entrada: los planos que ya están así se tienen que
 * poder abrir, mirar y guardar. Se listan para poder revisarlos uno por uno.
 */
export function nombresQuePisanCodigo(
  items: { id: string; code: string; nomenclatura?: string | null }[],
): NombrePisaCodigo[] {
  const out: NombrePisaCodigo[] = [];
  for (const f of items) {
    if (!nombrePropio(f)) continue;
    const nombre = nombreDeMueble(f);
    const otro = muebleConCodigo(nombre, items, f.id);
    if (!otro) continue;
    out.push({ id: f.id, code: f.code, nombre: normalizar(nombre), otroId: otro.id, otroCode: otro.code });
  }
  return out;
}

/**
 * Cuántos muebles de la sede dibujan cada nombre REPETIDO.
 *
 * `nombresRepetidos` contesta «cuáles están repetidos» para listarlos en la
 * revisión; esto contesta «este mueble que estoy por dibujar, ¿comparte su
 * nombre?», que es la pregunta que hace el plano una vez por caja. Por eso es
 * un mapa: se arma una vez por plano y se consulta N veces.
 *
 * La cuenta, no un sí/no: el aviso del plano tiene que poder decir CUÁNTOS
 * son, porque «×2» es lo que convierte dos cajas iguales en dos cajas que se
 * están señalando entre ellas.
 */
export function nombresChocados(
  items: { id: string; code: string; nomenclatura?: string | null }[],
): Map<string, number> {
  return new Map(nombresRepetidos(items).map((r) => [r.nombre, r.ids.length]));
}

/**
 * Que dos muebles se llamen igual EN EL PLANO, dicho para el que dibuja.
 *
 * Es el hallazgo grave que quedó abierto de la fase 12: en CIUDAD JARDIN el
 * mueble de código IMP-12 se dibuja «IMP-08» y existe otro cuyo código es de
 * verdad IMP-08. El plano dibujaba UNA sola pastilla «IMP-08» —la del
 * renombrado— y el IMP-08 verdadero, chico, mostraba nada más el emoji: quien
 * miraba el plano veía un solo IMP-08 y no tenía cómo sospechar que había otro.
 * Después elegía, y el contrato caía en el que no era.
 *
 * Los dos muebles son FÍSICAMENTE DISTINTOS y contratar los dos es legítimo:
 * esto no prohíbe nada, avisa. Y avisa en los DOS, porque el que no sabe que
 * tiene un gemelo es justamente el que se vende por error.
 */
export interface ChoqueDeRotulo {
  /** Cuántos muebles de la sede se dibujan con este mismo nombre. Siempre ≥ 2. */
  veces: number;
  /** La marca corta que va pegada al rótulo: «×2». NO es un nombre —el nombre
   *  se dibuja una sola vez, ésa es la regla de `rotulosDelPlano`—: es la
   *  cuenta de cuántos lo llevan. */
  marca: string;
  /** El código real de ESTE mueble, que es lo único que lo distingue del otro
   *  cuando los dos se leen igual. `null` cuando el nombre dibujado YA es su
   *  código: ahí no hay nada oculto que revelar. */
  codigo: string | null;
  /** El aviso en palabras, para el `title` del plano y para quien lo necesite
   *  en texto. Una sola frase, sin ramas: siempre es cierta. */
  texto: string;
}

/** ¿El nombre con el que se dibuja este mueble lo lleva alguien más?
 *
 *  `chocados` es el mapa de `nombresChocados` del plano entero. Sin él no hay
 *  choque que reportar: un mueble solo nunca choca contra sí mismo. */
export function choqueDeRotulo(
  mueble: { code: string; nomenclatura?: string | null },
  chocados?: ReadonlyMap<string, number>,
): ChoqueDeRotulo | null {
  const nombre = nombreDeMueble(mueble);
  const veces = chocados?.get(normalizar(nombre)) ?? 0;
  if (veces < 2) return null;
  return {
    veces,
    marca: `×${veces}`,
    codigo: nombrePropio(mueble) ? mueble.code : null,
    texto:
      `«${normalizar(nombre)}» lo dibujan ${veces} muebles de esta sede. ` +
      `Éste es el de código ${mueble.code}: el nombre no los distingue, el código sí.`,
  };
}

/**
 * Qué se dibuja sobre un mueble en el plano: adentro de la caja, o en la
 * pastilla que flota arriba.
 *
 * La regla es una sola y es la que se había roto: **el nombre aparece una vez**.
 *
 * Adentro iba `code` a secas, así que un mueble renombrado mostraba el nombre
 * puesto a mano en la pastilla y el de fábrica adentro de la caja — dos nombres
 * distintos para el mismo mueble, uno encima del otro. La pastilla no estaba de
 * más: existe para los muebles chicos, donde el texto de adentro no entra y se
 * dibuja un emoji. Lo que estaba mal era que las dos cosas se dibujaran juntas.
 *
 * Ahora adentro va el nombre efectivo, y la pastilla aparece sólo cuando adentro
 * no cabe. Se reserva para el nombre puesto a mano a propósito: en un mueble
 * chico sin nombre propio el plano ya dice bastante con el emoji, y una pastilla
 * por cada cajita deja el plano ilegible al alejarse.
 *
 * **La excepción son los que chocan**, y por eso se pasa `chocados`: si el
 * nombre lo lleva otro mueble de la sede, éste MUESTRA su nombre aunque no
 * tenga uno puesto a mano —si no, de los dos gemelos el plano dibuja uno solo—
 * y además sale marcado. Sigue sin haber una pastilla por cajita: se marcan los
 * que chocan, que en un plano sano son cero.
 *
 * `cabeAdentro` lo decide quien dibuja, que es el único que sabe cuántos píxeles
 * mide el mueble en pantalla con el zoom que hay. `choque` también es para él:
 * acá se decide QUÉ se dice, los píxeles los pone el plano.
 */
export function rotulosDelPlano(
  mueble: { code: string; nomenclatura?: string | null },
  cabeAdentro: boolean,
  chocados?: ReadonlyMap<string, number>,
): { adentro: string | null; pastilla: string | null; choque: ChoqueDeRotulo | null } {
  const nombre = nombreDeMueble(mueble);
  const choque = choqueDeRotulo(mueble, chocados);
  return cabeAdentro
    ? { adentro: nombre, pastilla: null, choque }
    : {
        adentro: null,
        pastilla: nombrePropio(mueble) || choque ? nombre : null,
        choque,
      };
}
