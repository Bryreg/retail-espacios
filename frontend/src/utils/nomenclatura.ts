/**
 * Cómo se llama un mueble del plano. UNO, no dos.
 *
 * Toda la experiencia del sistema arranca acá: el nombre que se le pone a un
 * mueble es el que después viaja al contrato, al correo del mercaderista y a la
 * lámina del proveedor. Si se repite, dos espacios distintos comparten historia.
 *
 * ── Lo que hubo antes, que explica por qué este archivo existe ──────────────
 *
 * **Primero hubo dos generadores**, uno por editor. El plano 2D generaba
 * `GON-01` buscando el número más alto y sumando uno; el editor 3D generaba
 * `NAVE-GON-001` **contando** cuántos había, así que borrar `GON-02` dejaba dos
 * muebles con el mismo código. Se unificaron acá, y `siguienteCodigo` devuelve
 * el primer número LIBRE, no el siguiente al conteo.
 *
 * **Después hubo dos NOMBRES**, que es peor. El `code` era la llave con la que
 * se guardaba todo y la `nomenclatura` era un texto libre que alguien escribía
 * a mano y que reemplazaba al código **sólo en la pantalla**. Nada obligaba a
 * que coincidieran ni impedía que el nombre de un mueble fuera el código de
 * otro — y renumerar una corrida corriendo los números dentro de un conjunto
 * cerrado garantiza justamente eso: cada nombre nuevo es el código viejo de
 * otro. En CIUDAD JARDIN pasó con seis de seis, y el resultado fue vender dos
 * veces el mismo espacio: quien leía el plano veía «IMP-08» y escribía
 * «IMP-08», y el contrato caía en el mueble cuyo CÓDIGO era IMP-08, que no era
 * el que estaba mirando. La fase 12 lo administró —avisos, pastillas rojas,
 * rechazo de la planilla ambigua— porque mover el `code` arrastraba
 * `spaces.code`, `spaces.svg_id`, las confirmaciones de montaje y el histórico.
 *
 * **Ahora hay uno solo, y es el `code`.** El dueño confirmó que los contratos
 * cargados son de prueba, así que ese arrastre dejó de ser una razón para no
 * hacerlo. Renombrar un mueble edita SU NOMBRE, que es su código. Como todas
 * las pantallas ya dibujaban uno de los dos, con un solo campo el nombre queda
 * igual en todas **por construcción**: la clase entera de error desaparece en
 * vez de quedar vigilada. `nomenclatura` no es un segundo nombre nunca más —
 * sobrevive en el JSON del layout como **nombre viejo**, de sólo lectura, para
 * poder reconciliar lo que ya se negoció con la cartelería de la tienda. Y
 * cuando la renumeración la borra —tiene que borrarla—, el recuerdo no se
 * pierde: el servidor lleva el registro de cada renumeración y agrega
 * `nombreAnterior` a cada mueble al entregar el plano (ver `nombreAnterior`).
 *
 * Es geometría de nombres: se prueba sin navegador (`npm run probar:nomenclatura`).
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
  nevera_vegetales: "VEG",
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

/** Número que lleva un nombre, o null si no sigue el esquema `PRE-NN`. */
export function numeroDe(codigo: string, prefijo: string): number | null {
  const c = (codigo ?? "").trim().toUpperCase();
  const p = prefijo.toUpperCase() + "-";
  if (!c.startsWith(p)) return null;
  const resto = c.slice(p.length);
  if (!/^\d+$/.test(resto)) return null;
  return parseInt(resto, 10);
}

/** Normaliza para comparar: los nombres no distinguen mayúsculas ni espacios. */
export function normalizar(codigo: string): string {
  return (codigo ?? "").trim().toUpperCase();
}

/**
 * El siguiente nombre libre para ese tipo.
 *
 * Toma el número más alto en uso y sigue subiendo hasta encontrar uno que no
 * esté tomado. Lo segundo importa: alguien puede haber escrito un nombre a
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

// ─── El nombre del mueble ────────────────────────────────────────────────────

/**
 * Cómo se llama un mueble. Es su código, y no hay otra respuesta.
 *
 * Sigue siendo una función y no `f.code` a secas a propósito: es el único lugar
 * donde está escrito qué significa «cómo se llama esto». Los seis lugares que
 * resolvían `nomenclatura || code` a mano la llaman, y con esto los seis dicen
 * lo mismo sin tener que acordarse.
 */
export function nombreDeMueble(mueble: { code: string }): string {
  return mueble.code;
}

/**
 * El nombre VIEJO de un mueble: cómo se llamaba cuando se negoció lo que hoy
 * está encima.
 *
 * No es un nombre: es un recuerdo. Sirve para dos cosas y para ninguna más —
 * que buscar por lo que dice la cartelería de la tienda siga encontrando el
 * mueble, y que la reconciliación pueda listar los contratos que se negociaron
 * mirando ese texto (`contratosConNombreAjeno`, en `utils/revision.ts`).
 *
 * **Dos fuentes, y la primera manda.**
 *
 * 1. `nombreAnterior`, que es la que sobrevive a renumerar. NO es un campo del
 *    plano: el servidor lo deriva de su registro de renumeraciones
 *    (`renumeracion_nombres`, una fila por mueble y por renumeración) y lo
 *    agrega a cada mueble al leer el layout; al guardar lo saca. Por eso es de
 *    sólo lectura y por eso no hay dos nombres adentro del JSON: es una
 *    proyección, no un segundo campo. Trae el nombre que el plano **dibujaba**
 *    —la `nomenclatura` escrita a mano si la había, el código si no— y, de
 *    varias renumeraciones, la punta más vieja, que es la que dice el papel.
 * 2. `nomenclatura`, el segundo nombre que ya no existe. Es lo único que hay en
 *    un plano que TODAVÍA no se renumeró, que es como está producción hoy. La
 *    renumeración la borra —tiene que borrarla: mientras esté, el servidor la
 *    sigue leyendo como el nombre dibujado y una planilla escrita con el nombre
 *    nuevo saldría ambigua— y ahí toma el relevo la primera.
 *
 * `null` cuando no hay nada que recordar: no hay recuerdo, o dice exactamente
 * lo mismo que el nombre de hoy.
 */
export function nombreAnterior(
  mueble: { code: string; nombreAnterior?: string | null; nomenclatura?: string | null },
): string | null {
  const viejo = normalizar(mueble.nombreAnterior ?? "") || normalizar(mueble.nomenclatura ?? "");
  if (!viejo || viejo === normalizar(mueble.code)) return null;
  return viejo;
}

/**
 * Qué OTRO mueble se llama así. El mueble, no un sí/no: quien avisa necesita
 * poder decir cuál, y quien lo lee necesita poder ir a mirarlo — y, si es lo
 * que quería, intercambiar los dos nombres de una sola vez.
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

/** ¿Ese nombre ya lo usa OTRO mueble? */
export function codigoRepetido(
  codigo: string,
  existentes: { id: string; code: string }[],
  exceptoId?: string,
): boolean {
  return muebleConCodigo(codigo, existentes, exceptoId) !== null;
}

export interface Duplicado { codigo: string; ids: string[] }

/** Los nombres que aparecen más de una vez. Vacío es lo que se espera: la regla
 *  los impide de ahora en adelante, y lo que queda es lo que ya estaba así. */
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

// ─── LA REGLA: un nombre, un mueble ──────────────────────────────────────────

/** Lo mínimo que hace falta saber de un mueble para nombrarlo.
 *
 *  `label` es opcional y sólo se usa para decir QUIÉN tiene el nombre tomado:
 *  con un solo nombre, el código del otro es exactamente el texto que la
 *  persona acaba de teclear, así que repetírselo no distingue nada. */
export interface MuebleNombrable {
  id: string;
  code: string;
  label?: string;
}

/**
 * Por qué un nombre no se puede usar.
 *
 * Antes eran dos clases de choque —contra el nombre dibujado de otro y contra
 * el código de otro— porque eran dos campos. Con un solo nombre es una sola
 * pregunta: **¿ya lo tiene alguien?**. Y `ocupa` es ese alguien, porque un
 * aviso que dice «está mal» sin decir contra qué no se puede resolver.
 */
export type RechazoDeNombre<T> =
  | { razon: "vacio" }
  | { razon: "ocupado"; ocupa: T };

export type Renombre<T> =
  | { ok: true; muebles: T[]; nombre: string }
  | { ok: false; rechazo: RechazoDeNombre<T> };

/**
 * ¿Este mueble se puede llamar así? `null` es que sí.
 *
 * Es la comprobación única de TODOS los caminos de renombre: el doble clic
 * sobre la caja del plano, el campo del panel lateral y el panel del editor 3D.
 * Antes el panel escribía directo y sólo el doble clic comprobaba algo, y por
 * ahí se metieron los nombres que pisaban el código de otro mueble.
 *
 * Normalmente no se llama sola: se llama `renombrar`, que es la que además
 * escribe. Ésta existe para poder pintar el campo mientras se teclea, sin
 * escribir nada.
 */
export function choqueDeNombre<T extends MuebleNombrable>(
  nombre: string,
  existentes: T[],
  exceptoId?: string,
): RechazoDeNombre<T> | null {
  const n = normalizar(nombre);
  if (!n) return { razon: "vacio" };
  const ocupa = muebleConCodigo(n, existentes, exceptoId);
  return ocupa ? { razon: "ocupado", ocupa } : null;
}

/**
 * Renombrar un mueble. **El único camino.**
 *
 * Devuelve la lista nueva o el rechazo con el mueble que tiene el nombre; nunca
 * escribe a medias. Que la regla y la escritura vivan en la misma función es lo
 * que impide que vuelva a pasar lo de la fase 12: ahí la comprobación existía
 * en un lado y la escritura en otro, y bastó que un camino no llamara al otro.
 *
 * El nombre se guarda normalizado (mayúsculas, sin espacios al borde) porque es
 * la llave: `imp-08` y `IMP-08` son el mismo espacio en todas las comparaciones
 * del sistema, y guardarlo como se tecleó dejaría dos escrituras del mismo
 * nombre viajando al contrato.
 */
export function renombrar<T extends MuebleNombrable>(
  muebles: T[],
  id: string,
  nombre: string,
): Renombre<T> {
  const rechazo = choqueDeNombre(nombre, muebles, id);
  if (rechazo) return { ok: false, rechazo };
  const n = normalizar(nombre);
  return {
    ok: true,
    nombre: n,
    muebles: muebles.map((f) => (f.id === id ? { ...f, code: n } : f)),
  };
}

/**
 * Intercambiar los nombres de dos muebles, en UNA sola escritura.
 *
 * Es la operación real de renumerar una corrida a mano. Sin ella la regla
 * correcta —un nombre, un mueble— vuelve imposible el trabajo normal: para que
 * `IMP-12` pase a llamarse `IMP-08` hay que sacarle antes ese nombre al que lo
 * tiene, y en el medio de una corrida cerrada no hay ningún nombre libre.
 *
 * Los dos se escriben a la vez a propósito: en ningún momento intermedio la
 * lista tiene dos muebles con el mismo nombre, así que no hay estado inválido
 * que alguien pueda guardar. Aplicarlo dos veces devuelve el plano original.
 */
export function intercambiarNombres<T extends MuebleNombrable>(
  muebles: T[],
  idA: string,
  idB: string,
): T[] {
  if (idA === idB) return muebles;
  const a = muebles.find((f) => f.id === idA);
  const b = muebles.find((f) => f.id === idB);
  if (!a || !b) return muebles;
  const nombreA = normalizar(a.code);
  const nombreB = normalizar(b.code);
  return muebles.map((f) =>
    f.id === idA ? { ...f, code: nombreB } : f.id === idB ? { ...f, code: nombreA } : f,
  );
}

/**
 * El rechazo, en palabras. Dice QUIÉN tiene el nombre.
 *
 * No lo nombra por su código —con un solo nombre, el código del otro es el
 * texto que la persona acaba de teclear, y repetírselo no le dice nada nuevo—
 * sino por lo que es: «otro Impulsador Marca de la sede».
 */
export function textoDelChoque<T extends MuebleNombrable>(
  nombre: string,
  rechazo: RechazoDeNombre<T>,
): string {
  const n = normalizar(nombre);
  if (rechazo.razon === "vacio") {
    return (
      "El mueble tiene que llamarse de alguna manera: el nombre es la llave con " +
      "la que viaja al contrato, al correo de montaje y a la lámina."
    );
  }
  const quien = (rechazo.ocupa.label ?? "").trim();
  return (
    `«${n}» ya lo tiene otro mueble de esta sede` +
    (quien ? ` (${quien})` : "") +
    `. Dos muebles con el mismo nombre no se distinguen, y un contrato cargado ` +
    `como «${n}» no elige cuál.`
  );
}

/**
 * Qué va a pasar si se intercambian, dicho antes de apretar.
 *
 * Un intercambio toca DOS muebles y uno de los dos no está seleccionado: si no
 * se dice con todas las letras que el otro también se renombra, la acción es
 * una sorpresa sobre un mueble que la persona no estaba mirando.
 */
export function textoDelIntercambio(
  este: { code: string },
  otro: { code: string; label?: string },
): string {
  const quien = (otro.label ?? "").trim();
  return (
    `Este mueble pasa a llamarse «${normalizar(otro.code)}» y ` +
    (quien ? `el otro (${quien})` : "el otro") +
    ` pasa a llamarse «${normalizar(este.code)}».`
  );
}

// ─── Dos muebles que ya se llaman igual ──────────────────────────────────────

/**
 * Cuántos muebles de la sede llevan cada nombre REPETIDO.
 *
 * `duplicados` contesta «cuáles están repetidos» para listarlos en la revisión;
 * esto contesta «este mueble que estoy por dibujar, ¿comparte su nombre?», que
 * es la pregunta que hace el plano una vez por caja. Por eso es un mapa: se
 * arma una vez por plano y se consulta N veces.
 *
 * La cuenta, no un sí/no: el aviso del plano tiene que poder decir CUÁNTOS son,
 * porque «×2» es lo que convierte dos cajas iguales en dos cajas que se están
 * señalando entre ellas.
 *
 * De ahora en adelante esto da vacío en un plano editado con la regla puesta.
 * Lo que quede es lo que ya estaba así, y ésa es la regla que no se negocia: un
 * plano que hoy está mal se abre, se mira y se guarda.
 */
export function nombresChocados(
  items: { id: string; code: string }[],
): Map<string, number> {
  return new Map(duplicados(items).map((d) => [d.codigo, d.ids.length]));
}

/**
 * Que dos muebles se llamen igual EN EL PLANO, dicho para el que dibuja.
 *
 * Viene del hallazgo grave de la fase 12: el plano dibujaba UNA sola pastilla
 * «IMP-08» y el otro mueble que se leía igual no mostraba nada, así que quien
 * miraba veía un solo IMP-08, elegía, y el contrato caía en el que no era. Con
 * un solo nombre eso ya no se puede crear; lo que sigue pudiendo existir es un
 * plano guardado antes de la regla.
 *
 * Los dos muebles son FÍSICAMENTE DISTINTOS y contratar los dos es legítimo:
 * esto no prohíbe nada, avisa. Y avisa en los DOS, porque el que no sabe que
 * tiene un gemelo es justamente el que se vende por error.
 */
export interface ChoqueDeRotulo {
  /** Cuántos muebles de la sede se llaman así. Siempre ≥ 2. */
  veces: number;
  /** La marca corta que va pegada al rótulo: «×2». NO es un nombre —el nombre
   *  se dibuja una sola vez, ésa es la regla de `rotulosDelPlano`—: es la
   *  cuenta de cuántos lo llevan. */
  marca: string;
  /** El aviso en palabras, para el `title` del plano y para quien lo necesite
   *  en texto. Una sola frase, sin ramas: siempre es cierta. */
  texto: string;
}

/** ¿El nombre de este mueble lo lleva alguien más?
 *
 *  `chocados` es el mapa de `nombresChocados` del plano entero. Sin él no hay
 *  choque que reportar: un mueble solo nunca choca contra sí mismo. */
export function choqueDeRotulo(
  mueble: { code: string },
  chocados?: ReadonlyMap<string, number>,
): ChoqueDeRotulo | null {
  const nombre = normalizar(nombreDeMueble(mueble));
  const veces = chocados?.get(nombre) ?? 0;
  if (veces < 2) return null;
  return {
    veces,
    marca: `×${veces}`,
    texto:
      `«${nombre}» lo llevan ${veces} muebles de esta sede. Un nombre por mueble: ` +
      `renombrá uno de los dos para que un contrato pueda decir a cuál va.`,
  };
}

/**
 * Qué se dibuja sobre un mueble en el plano: adentro de la caja, o en la
 * pastilla que flota arriba.
 *
 * La regla es una sola: **el nombre aparece una vez**. Adentro cuando entra, y
 * si no entra —un mueble de 30 px no tiene lugar para texto— se dibuja el emoji
 * del tipo y nada más, porque una pastilla por cada cajita deja el plano
 * ilegible al alejarse.
 *
 * **La excepción son los que chocan**, y por eso se pasa `chocados`: si el
 * nombre lo lleva otro mueble de la sede, éste muestra su nombre y su marca
 * aunque sea chico —si no, de los dos gemelos el plano dibuja uno solo—. En un
 * plano sano eso es cero pastillas.
 *
 * `cabeAdentro` lo decide quien dibuja, que es el único que sabe cuántos
 * píxeles mide el mueble en pantalla con el zoom que hay. `choque` también es
 * para él: acá se decide QUÉ se dice, los píxeles los pone el plano.
 */
export function rotulosDelPlano(
  mueble: { code: string },
  cabeAdentro: boolean,
  chocados?: ReadonlyMap<string, number>,
): { adentro: string | null; pastilla: string | null; choque: ChoqueDeRotulo | null } {
  const nombre = nombreDeMueble(mueble);
  const choque = choqueDeRotulo(mueble, chocados);
  return cabeAdentro
    ? { adentro: nombre, pastilla: null, choque }
    : { adentro: null, pastilla: choque ? nombre : null, choque };
}
