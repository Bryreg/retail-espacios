/**
 * «Copiar zonas de otra cara» (fase 2 · frente A; pedido §17, D20 y Caso F del
 * diseño de participaciones): lleva las zonas de una capa de OTRA cara —la
 * otra cara del mueble, otro mueble de la sede u otra sede del mismo
 * supermercado— a las participaciones que la cara de DESTINO ya tiene, y dice
 * qué no se copia y por qué. Puro: sin store, sin DOM, sin React y sin reloj
 * (el `hoy` es el del servidor, que viene con la cara). De la API sólo toma
 * tipos.
 *
 *   · **Nunca crea nada comercial.** Cada zona va a una participación VIVA de
 *     esta cara (la del mismo proveedor y marca, o la que elija la persona):
 *     ningún término, reserva ni contrato se copia ni se prellena. Lo pegado
 *     llega como BORRADOR por el `PUT /distribucion/borrador` de siempre (con
 *     `origen`, sólo para el historial) y para que valga hay que confirmar, con
 *     el candado de siempre. «No conviertas una copia visual en una
 *     contratación nueva» (§17).
 *   · **Las coordenadas viajan tal cual en u,v** (normalizadas al rectángulo
 *     exterior de cada cara): la zona escala con la cara y conserva la
 *     PROPORCIÓN, que es lo que mide una participación. Copiar en metros
 *     dejaría la zona de 1,25 m de una góndola de 2,5 m saliéndose de una de
 *     0,9 m. En espejo, u → 1 − u (v no cambia).
 *   · **No se recorta ningún polígono** (D2): lo que cae en lo que no se vende
 *     lo recorta la medición, como siempre. Se DESCARTA con su motivo sólo lo
 *     que en el destino no sirve: la zona de una participación que ya no rige
 *     en el origen, la de un grupo sin destino y —medidas con la superficie
 *     del DESTINO— las que quedan de menos de 1 cm² o caen enteras sobre lo
 *     que no se vende.
 *   · El resultado completo (lo que queda + lo copiado) se mide y se juzga con
 *     las MISMAS funciones que la revisión en vivo y el servidor
 *     (`revisarZonas`): la vista previa es lo que se va a guardar.
 *
 * El servidor no recalcula la copia (por eso no hay gemela en Python): hace
 * cumplir lo de cualquier borrador —cada zona tiene que ser de una
 * participación de ESA cara (`espacio_ajeno`), dentro de los topes y bien
 * formada—, y confirmar es estricto. Ninguna frase nombra montos.
 */
import type { OrigenDeCopiaIn, ParticipacionOut, ResumenOut, SuperficieOut, ZonaOut } from "../api/participaciones";
import { revisarZonas, type ZonaEnEdicion, type ZonaPegada } from "./edicionDeZonas";
import { marcaNormal, pct, type EstadoDeDistribucion, type Juicio, type Termino } from "./participaciones";
import { MAX_ZONAS_POR_CARA, cuantizarNumero, dentroDeLosTopes, medir, type Medidas, type Poligono, type Punto } from "./zonasGeometria";

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

/** Una de las dos caras: su superficie (null si no se dibuja) y sus
 *  participaciones, como las manda `GET /cara`. */
export interface LadoDeCopia {
  superficie: SuperficieOut | null;
  participaciones: readonly ParticipacionOut[];
}

/** La cara de DESTINO, con lo que hace falta para juzgar el resultado como lo
 *  juzga la revisión en vivo del panel. */
export interface DestinoDeCopia extends LadoDeCopia {
  /** Los términos de cada participación como los leen las reglas
   *  (`terminosPorParticipacion`, o `datosDeLaCara(datos).terminosPorS`). */
  terminosPorS: ReadonlyMap<number, readonly Termino[]>;
  /** El `hoy` del servidor (fecha de Colombia). */
  hoy: string;
  /** La firma del mueble cambió desde la confirmación (como el panel). */
  firmaCambio?: boolean;
}

export interface OpcionesDeCopia {
  /** Lo de la izquierda pasa a la derecha. */
  espejo: boolean;
  /** Lo elegido a mano: spaceId de la participación del ORIGEN → spaceId de
   *  una participación viva del destino, o null («No copiar»). */
  elegidas: ReadonlyMap<number, number | null>;
  /** Quitar del destino las zonas de las participaciones vivas que no reciben nada. */
  quitarLasDemas: boolean;
}

/** Cómo se decidió a dónde van las zonas de una participación del origen. */
export type ComoSeMapea = "automatico" | "elegido" | "ambiguo" | "sin_destino" | "no_copiar";

/** Las zonas de UNA participación viva del origen y a dónde van. */
export interface GrupoDeCopia {
  /** spaceId de la participación en el origen. */
  origen: number;
  numeroOrigen: number;
  supplierId: number;
  proveedor: string | null;
  marca: string | null;
  /** Lo contratado en el origen (puntos básicos). */
  pb: number;
  /** Cuántas zonas trae del origen. */
  zonas: number;
  /** spaceId de la participación del destino, o null (no se copia). */
  destino: number | null;
  como: ComoSeMapea;
  /** Las vivas del destino con el mismo proveedor y la misma marca. */
  candidatos: number[];
  /** Había varias candidatas y se eligió sola la del mismo porcentaje. */
  desempate: boolean;
}

export type MotivoDeDescarte =
  | "no_rige" | "sin_destino" | "ambiguo" | "no_copiar" | "sin_area" | "sin_superficie_util" | "invalida";

/** Una zona del origen que no se copia: su lugar en el origen (por `orden`),
 *  su participación del origen (spaceId) y por qué. */
export interface Descartada { indice: number; origen: number; motivo: MotivoDeDescarte }

export interface CopiaCompatible {
  compatible: true;
  grupos: GrupoDeCopia[];
  /** Las zonas del destino que siguen (las MISMAS, con sus claves). */
  quedan: ZonaEnEdicion[];
  /** Las copiadas, ya llevadas a una participación del destino y limpias
   *  (cuantizadas, sin repetidos, antihorarias: como las guarda el servidor). */
  nuevas: ZonaPegada[];
  descartadas: Descartada[];
  /** Zonas del destino que se van porque su participación recibe zonas. */
  reemplazadas: number;
  /** Las mismas, por participación del destino (spaceId → cuántas). */
  reemplazadasPor: Map<number, number>;
  /** Zonas del destino que se van por «Quitar las zonas de las demás». */
  quitadas: number;
  /** El resultado completo entra en los topes del servidor (60 zonas, 240 puntos). */
  enLosTopes: boolean;
  /** (ancho destino / ancho origen) / (alto destino / alto origen). */
  estiramiento: number;
  /** El resultado completo, medido y juzgado con los términos del destino
   *  (las MISMAS funciones que la revisión en vivo). */
  revision: { medidas: Medidas; juicio: Juicio };
  /** Los SOLAPE del resultado que no estaban antes de copiar. */
  solapesNuevos: number;
}

export type Copia = { compatible: false; motivo: string } | CopiaCompatible;

/* ── Ayudas ────────────────────────────────────────────────────────────────── */

const proveedorDe = (p: ParticipacionOut) => p.terminos[0]?.proveedor ?? null;
const supplierDe = (p: ParticipacionOut) => proveedorDe(p)?.id ?? 0;
const marcaDe = (p: ParticipacionOut) => p.terminos[0]?.marca ?? null;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const EN_LETRAS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const cuantas = (n: number) => (n >= 0 && n < EN_LETRAS.length ? EN_LETRAS[n] : String(n));
/** «Postobón · Hit»; sin proveedor, «Sin proveedor». */
const quienEs = (proveedor: string | null, marca: string | null) => `${proveedor ?? "Sin proveedor"}${marca ? ` · ${marca}` : ""}`;
/** «2,8» (un decimal, con coma). */
const decimal = (x: number) => x.toFixed(1).replace(".", ",");
/** El código de la cara que se pide a `GET /cara` («GON-01» o «GON-01-B»). */
const espacioDe = (codigo: string, cara: "A" | "B") => (cara === "B" ? `${codigo}-B` : codigo);
const normal = (s: string) => s.trim().toUpperCase();

/** Lleva los vértices del origen al destino: tal cual en u,v o en espejo. */
function llevar(v: Poligono, espejo: boolean): Poligono {
  return v.map(([u, w]) => [espejo ? cuantizarNumero(1 - u) : u, w] as Punto);
}

/** A dónde van las zonas de la participación `p` del origen (§5 del diseño):
 *  lo elegido a mano manda; si no, la ÚNICA viva del destino con el mismo
 *  proveedor y la misma marca (`marcaNormal`); con varias, la única del mismo
 *  porcentaje contratado; si no, la persona elige. Una participación sin
 *  proveedor no se lleva sola a ninguna. */
function grupoDe(p: ParticipacionOut, vivas: readonly ParticipacionOut[], elegidas: ReadonlyMap<number, number | null>): GrupoDeCopia {
  const s = supplierDe(p);
  const m = marcaNormal(marcaDe(p));
  const candidatas = s === 0 ? [] : vivas.filter((d) => supplierDe(d) === s && marcaNormal(marcaDe(d)) === m);
  const base = {
    origen: p.space_id, numeroOrigen: p.numero, supplierId: s, proveedor: proveedorDe(p)?.nombre ?? null, marca: marcaDe(p),
    pb: p.contratado_pb, zonas: 0, candidatos: candidatas.map((d) => d.space_id), desempate: false,
  };
  const elegida = elegidas.get(p.space_id);
  if (elegida === null) return { ...base, destino: null, como: "no_copiar" };
  if (elegida !== undefined && vivas.some((d) => d.space_id === elegida)) return { ...base, destino: elegida, como: "elegido" };
  if (candidatas.length === 1) return { ...base, destino: candidatas[0].space_id, como: "automatico" };
  if (candidatas.length > 1) {
    const mismoPorcentaje = candidatas.filter((d) => d.contratado_pb === p.contratado_pb);
    if (mismoPorcentaje.length === 1) return { ...base, destino: mismoPorcentaje[0].space_id, como: "automatico", desempate: true };
    return { ...base, destino: null, como: "ambiguo" };
  }
  return { ...base, destino: null, como: "sin_destino" };
}

const claveDeSolape = (participaciones: readonly number[]) => [...participaciones].sort((a, b) => a - b).join(",");

/* ── La copia ──────────────────────────────────────────────────────────────── */

/**
 * La copia de `zonasOrigen` (una capa de la cara de origen) sobre lo que se
 * edita en el destino (`zonasDestino`, las de `edicion.zonas`). Las dos caras
 * tienen que tener superficie y la misma orientación: un frente no va a la
 * tapa de una zona libre ni al revés; distinto tipo con la misma orientación
 * (góndola → punta → robatope) sí, y lo que cae en lo que no se vende se ve en
 * los números y en «Lo que no se copia».
 *
 * Una participación del destino que RECIBE zonas pierde las que tenía en lo
 * que se edita; las que no reciben nada quedan (salvo `quitarLasDemas`). Dos
 * del origen que van a la misma suman sus zonas (la unión no cuenta dos
 * veces, D9). La capa confirmada del destino no se toca hasta confirmar.
 */
export function copiarZonas(origen: LadoDeCopia, zonasOrigen: readonly ZonaOut[], destino: DestinoDeCopia,
  zonasDestino: readonly ZonaEnEdicion[], o: OpcionesDeCopia): Copia {
  const so = origen.superficie, sd = destino.superficie;
  if (!so) return { compatible: false, motivo: "La cara de origen no tiene una cara para ubicar piezas: no hay qué copiar." };
  if (!sd) return { compatible: false, motivo: "Esta cara no tiene una cara para ubicar piezas." };
  if (so.orientacion !== sd.orientacion) {
    return {
      compatible: false,
      motivo: sd.orientacion === "arriba"
        ? "Esta cara es una zona libre (se mira desde arriba): no se le copian piezas de un frente."
        : "La cara de origen es una zona libre (se mira desde arriba): sus piezas no se copian a un frente.",
    };
  }
  const delOrigen = new Map(origen.participaciones.map((p) => [p.space_id, p]));
  const vivas = destino.participaciones.filter((p) => p.viva);
  const vivasDestino = new Set(vivas.map((p) => p.space_id));
  const grupos = new Map<number, GrupoDeCopia>();
  const descartadas: Descartada[] = [];
  const llevadas: { participacionSpaceId: number; vertices: Poligono; indice: number; origen: number }[] = [];
  const orden = [...zonasOrigen].sort((a, b) => (a.orden - b.orden) || (a.id - b.id));
  orden.forEach((z, indice) => {
    const p = delOrigen.get(z.participacion_space_id);
    if (!p || !p.viva) { descartadas.push({ indice, origen: z.participacion_space_id, motivo: "no_rige" }); return; }
    let g = grupos.get(p.space_id);
    if (!g) { g = grupoDe(p, vivas, o.elegidas); grupos.set(p.space_id, g); }
    g.zonas++;
    if (g.destino === null) {
      const motivo: MotivoDeDescarte = g.como === "no_copiar" ? "no_copiar" : g.como === "ambiguo" ? "ambiguo" : "sin_destino";
      descartadas.push({ indice, origen: p.space_id, motivo });
      return;
    }
    llevadas.push({ participacionSpaceId: g.destino, vertices: llevar(z.vertices, o.espejo), indice, origen: p.space_id });
  });

  // Lo que en el destino no sirve: se mide SÓLO lo llevado, con la superficie del destino.
  const sup = { exclusiones: sd.exclusiones, ancho: sd.ancho, alto: sd.alto };
  const m0 = medir(llevadas, sup);
  const sinLugar = new Set(m0.sinSuperficieUtil);
  const nuevas: ZonaPegada[] = [];
  llevadas.forEach((z, k) => {
    const v = m0.validaciones[k];
    // Una transformación afín no da `ZONA_FUERA` ni `ZONA_SE_CRUZA`: se valida igual (defensa).
    const motivo: MotivoDeDescarte | null = v.codigo === "ZONA_SIN_AREA" ? "sin_area"
      : v.codigo !== null || !v.vertices ? "invalida"
        : sinLugar.has(k) ? "sin_superficie_util" : null;
    if (motivo) { descartadas.push({ indice: z.indice, origen: z.origen, motivo }); return; }
    nuevas.push({ participacionSpaceId: z.participacionSpaceId, vertices: v.vertices!.map(([u, w]) => [u, w] as Punto) });
  });
  descartadas.sort((a, b) => a.indice - b.indice);

  // Lo que queda del destino: las participaciones que reciben pierden lo suyo.
  const reciben = new Set(nuevas.map((z) => z.participacionSpaceId));
  const reemplazadasPor = new Map<number, number>();
  let quitadas = 0;
  const quedan: ZonaEnEdicion[] = [];
  for (const z of zonasDestino) {
    if (reciben.has(z.participacionSpaceId)) {
      reemplazadasPor.set(z.participacionSpaceId, (reemplazadasPor.get(z.participacionSpaceId) ?? 0) + 1);
    } else if (o.quitarLasDemas && vivasDestino.has(z.participacionSpaceId)) {
      quitadas++;
    } else {
      quedan.push(z);
    }
  }
  let reemplazadas = 0;
  for (const n of reemplazadasPor.values()) reemplazadas += n;

  // El resultado completo, juzgado como lo juzga la revisión en vivo.
  const resultado: ZonaEnEdicion[] = [...quedan, ...nuevas.map((z, i) => ({ clave: `copia${i}`, ...z }))];
  const supJuicio = { ...sup, orientacion: sd.orientacion };
  const opciones = { firmaCambio: !!destino.firmaCambio };
  const revision = revisarZonas(resultado, supJuicio, destino.terminosPorS, destino.hoy, opciones);
  const antes = revisarZonas(zonasDestino, supJuicio, destino.terminosPorS, destino.hoy, opciones);
  const yaEstaban = new Set(antes.juicio.errores.filter((p) => p.codigo === "SOLAPE").map((p) => claveDeSolape(p.participaciones)));
  let solapesNuevos = 0;
  for (const p of revision.juicio.errores) if (p.codigo === "SOLAPE" && !yaEstaban.has(claveDeSolape(p.participaciones))) solapesNuevos++;

  return {
    compatible: true, grupos: [...grupos.values()], quedan, nuevas, descartadas, reemplazadas, reemplazadasPor, quitadas,
    enLosTopes: dentroDeLosTopes(resultado), estiramiento: (sd.ancho / so.ancho) / (sd.alto / so.alto), revision, solapesNuevos,
  };
}

/* ── Lo que se dice ────────────────────────────────────────────────────────── */

/** «Café A · Sello Rojo · 30 %»: una opción del selector (sin el número interno). */
export function nombreDeDestino(p: ParticipacionOut): string {
  return `${quienEs(proveedorDe(p)?.nombre ?? null, marcaDe(p))} · ${pct(p.contratado_pb)}`;
}

/** Las vivas del destino para el selector de una fila: primero las del mismo
 *  proveedor y marca, después las del mismo proveedor, después el resto (cada
 *  tanda por número). «No copiar» lo agrega la pantalla al final. */
export function destinosEnOrden(g: Pick<GrupoDeCopia, "supplierId" | "marca">, destino: Pick<LadoDeCopia, "participaciones">): ParticipacionOut[] {
  const m = marcaNormal(g.marca);
  const rango = (d: ParticipacionOut) => (g.supplierId !== 0 && supplierDe(d) === g.supplierId
    ? (marcaNormal(marcaDe(d)) === m ? 0 : 1) : 2);
  return destino.participaciones.filter((d) => d.viva)
    .map((d) => ({ d, r: rango(d) }))
    .sort((a, b) => (a.r - b.r) || (a.d.numero - b.d.numero) || (a.d.space_id - b.d.space_id))
    .map((x) => x.d);
}

/** Una fila de «A qué participación va cada una». */
export interface FilaDeLaCopia {
  origen: number;
  /** «Participación 1 · Café A · Sello Rojo · 30 % · 2 zonas». */
  titulo: string;
  nota: string | null;
  /** `ambar`: hay que mirarla (ambigua, sin destino, otro proveedor). */
  tono: "neutro" | "ambar";
  /** «26 % dibujado de 30 % · falta 4 %» (con destino). */
  comoQueda: string | null;
  /** Lo dibujado pasa lo contratado: no se va a poder confirmar hasta ajustar. */
  sobra: boolean;
  /** «Ya tenía 1 zona acá: se reemplaza.» (en la primera fila que va ahí). */
  reemplaza: string | null;
  /** «Junta las zonas de las participaciones 1 y 2 del origen…» */
  junta: string | null;
}

export interface FrasesDeLaCopia {
  filas: FilaDeLaCopia[];
  /** «Lo que no se copia», un renglón por participación y motivo. */
  noSeCopia: string[];
  /** Los que `bloquean` frenan «Copiar como borrador». */
  avisos: { texto: string; bloquea: boolean }[];
}

/**
 * Las frases del diálogo, fijadas acá para que la prueba las vea (voseo;
 * «zona», «cara», «participación», «proveedor», «borrador»; ninguna dice
 * montos). `sucio`: la cara de destino tiene cambios sin guardar, que se
 * guardan junto con la copia.
 */
export function frasesDeLaCopia(c: CopiaCompatible, origen: Pick<LadoDeCopia, "participaciones">,
  destino: Pick<LadoDeCopia, "participaciones">, o: { sucio?: boolean } = {}): FrasesDeLaCopia {
  const delOrigen = new Map(origen.participaciones.map((p) => [p.space_id, p]));
  const delDestino = new Map(destino.participaciones.map((p) => [p.space_id, p]));
  const porDestino = new Map<number, GrupoDeCopia[]>();
  for (const g of c.grupos) if (g.destino !== null) porDestino.set(g.destino, [...(porDestino.get(g.destino) ?? []), g]);
  const yaDicho = new Set<number>();

  const filas: FilaDeLaCopia[] = c.grupos.map((g) => {
    const quien = quienEs(g.proveedor, g.marca);
    let nota: string | null = null;
    let tono: FilaDeLaCopia["tono"] = "neutro";
    if (g.como === "automatico") {
      nota = g.desempate ? "Elegida sola: mismo proveedor, marca y porcentaje." : "Elegida sola: mismo proveedor y marca.";
    } else if (g.como === "elegido") {
      const d = g.destino !== null ? delDestino.get(g.destino) : undefined;
      if (d && supplierDe(d) !== g.supplierId) { nota = `Va a otro proveedor (${proveedorDe(d)?.nombre ?? "sin proveedor"}).`; tono = "ambar"; }
      else if (d && marcaNormal(marcaDe(d)) !== marcaNormal(g.marca)) nota = `Va a otra marca del mismo proveedor (${marcaDe(d) ?? "sin marca"}).`;
      else nota = "Elegida a mano.";
    } else if (g.como === "ambiguo") {
      nota = `Hay ${cuantas(g.candidatos.length)} piezas de ${quien} en esta cara: elegí a cuál va.`;
      tono = "ambar";
    } else if (g.como === "sin_destino") {
      nota = `${quien} no está en esta cara: elegí otra marca o no la copies.`;
      tono = "ambar";
    } else {
      nota = "No se copia.";
    }
    let comoQueda: string | null = null, sobra = false, reemplaza: string | null = null, junta: string | null = null;
    if (g.destino !== null) {
      const cu = c.revision.juicio.cuentas.get(g.destino);
      if (cu) {
        sobra = cu.exceso > 0;
        comoQueda = `${pct(cu.dibujado)} dibujado de ${pct(cu.contratado)}`
          + (sobra ? ` · sobra ${pct(cu.exceso)}` : cu.pendiente > 0 ? ` · falta ${pct(cu.pendiente)}` : "");
      }
      if (!yaDicho.has(g.destino)) {
        yaDicho.add(g.destino);
        const n = c.reemplazadasPor.get(g.destino) ?? 0;
        if (n > 0) reemplaza = `Ya tenía ${plural(n, "pieza", "piezas")} acá: ${n === 1 ? "se reemplaza" : "se reemplazan"}.`;
        const juntos = porDestino.get(g.destino) ?? [];
        if (juntos.length > 1) {
          const ns = juntos.slice().sort((a, b) => a.numeroOrigen - b.numeroOrigen).map((x) => quienEs(x.proveedor, x.marca));
          junta = `Junta las piezas de ${ns.slice(0, -1).join(", ")} y ${ns[ns.length - 1]} del origen: lo que se pisa cuenta una vez.`;
        }
      }
    }
    return {
      origen: g.origen, titulo: `${quien} · ${pct(g.pb)} · ${plural(g.zonas, "forma", "formas")}`,
      nota, tono, comoQueda, sobra, reemplaza, junta,
    };
  });

  // Lo que no se copia: un renglón por participación del origen y motivo, en el orden en que aparecen.
  const tandas = new Map<string, { origen: number; motivo: MotivoDeDescarte; n: number }>();
  for (const d of c.descartadas) {
    const k = `${d.origen}|${d.motivo}`;
    const t = tandas.get(k);
    if (t) t.n++; else tandas.set(k, { origen: d.origen, motivo: d.motivo, n: 1 });
  }
  const noSeCopia: string[] = [];
  for (const { origen: s, motivo, n } of tandas.values()) {
    const p = delOrigen.get(s);
    const zonas = plural(n, "forma", "formas");
    const uno = n === 1;
    const de = p ? quienEs(proveedorDe(p)?.nombre ?? null, marcaDe(p)) : null;
    switch (motivo) {
      case "no_rige":
        noSeCopia.push(p ? `${zonas} de ${de}: ya no está vigente en el origen.`
          : `${zonas} de una marca que el origen ya no tiene.`);
        break;
      case "ambiguo":
        noSeCopia.push(`${zonas} de ${de}: no elegiste a qué marca ${uno ? "va" : "van"}.`);
        break;
      case "sin_destino":
        noSeCopia.push(`${zonas} de ${de}: esa marca no está en esta cara.`);
        break;
      case "no_copiar":
        noSeCopia.push(`${zonas} de ${de}: elegiste no ${uno ? "copiarla" : "copiarlas"}.`);
        break;
      case "sin_area":
        noSeCopia.push(`${zonas} de ${de}: acá ${uno ? "queda" : "quedan"} de menos de 1 cm².`);
        break;
      case "sin_superficie_util":
        noSeCopia.push(`${zonas} de ${de}: ${uno ? "cae entera" : "caen enteras"} sobre lo que no se vende de esta cara (zócalo, parantes, copete).`);
        break;
      case "invalida":
        noSeCopia.push(`${zonas} de ${de}: no ${uno ? "queda bien formada" : "quedan bien formadas"} en esta cara.`);
        break;
    }
  }

  const avisos: FrasesDeLaCopia["avisos"] = [];
  if (c.estiramiento > 1.25) {
    avisos.push({ texto: `Esta cara es ${decimal(c.estiramiento)} veces más ancha en proporción: las piezas se estiran a lo ancho.`, bloquea: false });
  } else if (c.estiramiento < 0.8 && c.estiramiento > 0) {
    avisos.push({ texto: `Esta cara es ${decimal(1 / c.estiramiento)} veces más alta en proporción: las piezas se estiran a lo alto.`, bloquea: false });
  }
  if (c.solapesNuevos > 0) {
    const n = c.solapesNuevos;
    avisos.push({
      texto: `Con la copia ${n === 1 ? "una marca pisa a otra" : `quedan ${n} marcas pisando a otras`} en fechas que se cruzan: `
        + `${n === 1 ? "se ve en rojo y hay que moverla" : "se ven en rojo y hay que moverlas"} antes de guardar la cara.`,
      bloquea: false,
    });
  }
  if (filas.some((f) => f.sobra)) {
    avisos.push({
      texto: "Alguna marca queda más grande que su %: no se va a poder guardar la cara hasta achicarla "
        + "(«Achicar», en su pieza de la lista).",
      bloquea: false,
    });
  }
  if (o.sucio) avisos.push({ texto: "Tenés cambios sin guardar en esta cara: se guardan junto con la copia, en el mismo borrador.", bloquea: false });
  if (!c.enLosTopes) {
    const total = c.quedan.length + c.nuevas.length;
    avisos.push({
      texto: (total > MAX_ZONAS_POR_CARA
        ? `Con la copia la cara tendría ${total} formas: el tope es ${MAX_ZONAS_POR_CARA}.`
        : "Con la copia la cara pasaría de 240 puntos (o tendría una forma de más de 24).")
        + " Sacá algunas o marcá «Sacar las piezas de las marcas que no reciben nada».",
      bloquea: true,
    });
  }
  if (c.nuevas.length === 0) avisos.push({ texto: "No queda ninguna pieza para copiar.", bloquea: true });
  return { filas, noSeCopia, avisos };
}

/** Por qué «Copiar como borrador» espera, o null si se puede copiar. */
export function bloqueoDeLaCopia(c: Copia): string | null {
  if (!c.compatible) return c.motivo;
  if (c.grupos.some((g) => g.como === "ambiguo")) return "Elegí a qué marca va cada fila marcada antes de copiar.";
  if (!c.enLosTopes) return `Con la copia la cara pasaría los topes (${MAX_ZONAS_POR_CARA} formas, 240 puntos).`;
  if (c.nuevas.length === 0) return "No queda ninguna pieza para copiar.";
  return null;
}

/** Por qué el botón «Copiar zonas de otra cara…» del panel está apagado, o
 *  null si se puede abrir el diálogo. */
export function motivoParaNoCopiar(e: {
  conSuperficie: boolean; alDia: boolean; enMirar: boolean; guardando: boolean; versionVieja: boolean; vivas: number;
}): string | null {
  if (!e.conSuperficie) return "Esta cara no tiene una cara para ubicar piezas.";
  if (!e.alDia) return "El plano tiene cambios sin guardar: esperá un momento.";
  if (e.enMirar) return "Esperá a que el plano termine de guardarse para copiar.";
  if (e.versionVieja) return "Traé lo nuevo antes de copiar.";
  if (e.guardando) return "Esperá a que termine de guardar.";
  if (e.vivas === 0) return "Esta cara no tiene marcas vendidas: vendelas en Vender y después copiá.";
  return null;
}

/** «NAVE · GON-01 · cara A». */
export function rotuloDeCara(sede: string, codigo: string, cara: "A" | "B"): string {
  return `${sede} · ${codigo} · cara ${cara}`;
}

/** Lo primero que dice el diálogo. */
export function encabezadoDeLaCopia(destino: { sede: string; codigo: string; cara: "A" | "B" }): string {
  return `Las piezas se copian como borrador a ${rotuloDeCara(destino.sede, destino.codigo, destino.cara)}. `
    + "No se copia ningún contrato ni reserva: cada pieza va a una marca que esta cara ya tiene, "
    + "y para que valga tenés que tocar «Listo, guardar la cara».";
}

/** La franja del panel después de copiar (mientras lo copiado siga a la vista). */
export function franjaDeLaCopia(rotulo: string, guardada: boolean): string {
  return guardada
    ? `Copiaste las piezas de ${rotulo}: quedaron como borrador. Revisalas y tocá «Listo» cuando estén bien. Ctrl+Z deshace la copia.`
    : `Pegaste las piezas de ${rotulo}, pero todavía no se guardaron: probá de nuevo (o traé lo nuevo). Ctrl+Z deshace la copia.`;
}

/* ── De qué cara ───────────────────────────────────────────────────────────── */

/** Una cara que se puede elegir como origen. */
export interface OpcionDeOrigen {
  /** `${SEDE}|${ESPACIO}`: única en la lista. */
  clave: string;
  sede: string;
  /** Lo que se pide a `GET /cara` y se declara en `origen.espacio`. */
  espacio: string;
  /** El código del mueble en el plano («GON-01»). */
  codigo: string;
  cara: "A" | "B";
  texto: string;
  /** La otra cara del mueble de destino (va primera). */
  otraCara: boolean;
  /** Tiene algo para copiar (confirmado o borrador). El diálogo abre en la
   *  primera que tiene: abrir en una vacía mostraba un error de entrada. */
  conZonas: boolean;
}

/** La opción con que abre el diálogo: la primera que tiene algo para copiar
 *  (en una doble, la otra cara si tiene), o la primera de la lista. */
export function opcionDeEntrada(opciones: readonly OpcionDeOrigen[]): OpcionDeOrigen | null {
  return opciones.find((o) => o.conZonas) ?? opciones[0] ?? null;
}

const ESTADO_DE_ORIGEN: Partial<Record<EstadoDeDistribucion, string>> = {
  confirmada: "Guardada", borrador: "Borrador", para_revisar: "Para revisar",
};

/**
 * Las caras de `sede` de las que se puede copiar a la de destino, salidas del
 * resumen de esa sede (`GET /resumen`, el de Supervisar): sólo las que tienen
 * algo dibujado, nunca la de destino. En la sede del destino, si el mueble
 * tiene dos caras (`caras`, que sale de `carasDe`/`caras_de`: la única
 * respuesta a «¿tiene cara B?»), la primera es «La otra cara de este mueble»,
 * aunque el resumen todavía no haya llegado: es el Caso F de siempre.
 */
export function opcionesDeOrigen(destino: { sede: string; codigo: string; cara: "A" | "B"; caras: number }, sede: string,
  resumen: Pick<ResumenOut, "caras"> | null): OpcionDeOrigen[] {
  const fuera: OpcionDeOrigen[] = [];
  const clave = (s: string, espacio: string) => `${normal(s)}|${normal(espacio)}`;
  const vistas = new Set<string>([clave(destino.sede, espacioDe(destino.codigo, destino.cara))]);
  const caras = resumen?.caras ?? [];
  const resumenDe = (codigo: string, cara: "A" | "B") => caras.find((c) => normal(c.fixture_code) === normal(codigo) && c.cara === cara);
  const detalle = (c: ResumenOut["caras"][number] | undefined) => {
    if (!c) return "";
    const estado = ESTADO_DE_ORIGEN[c.estado_distribucion];
    if (!estado) return " — sin piezas";
    return ` — ${estado} · ${plural(new Set(c.participaciones.map((p) => p.numero)).size, "marca", "marcas")}`;
  };
  if (normal(sede) === normal(destino.sede) && destino.caras === 2) {
    const otra: "A" | "B" = destino.cara === "A" ? "B" : "A";
    const espacio = espacioDe(destino.codigo, otra);
    vistas.add(clave(sede, espacio));
    const r = resumenDe(destino.codigo, otra);
    fuera.push({ clave: clave(sede, espacio), sede, espacio, codigo: destino.codigo, cara: otra, otraCara: true,
      texto: `La otra cara de este mueble (cara ${otra})${detalle(r)}`, conZonas: !!(r && ESTADO_DE_ORIGEN[r.estado_distribucion]) });
  }
  for (const c of caras) {
    if (!ESTADO_DE_ORIGEN[c.estado_distribucion]) continue;   // sin distribuir o sin mueble: no hay qué copiar
    const espacio = espacioDe(c.fixture_code, c.cara);
    const k = clave(sede, espacio);
    if (vistas.has(k)) continue;
    vistas.add(k);
    fuera.push({ clave: k, sede, espacio, codigo: c.fixture_code, cara: c.cara, otraCara: false,
      texto: `${c.fixture_code} · cara ${c.cara}${detalle(c)}`, conZonas: true });
  }
  return fuera;
}

/**
 * Lo que el borrador declara en `origen` (sólo historial y bitácora): la cara
 * de origen, la capa y la versión que se leyeron, el espejo, a qué
 * participación de esta cara fue cada una del origen (por NÚMERO) y cuántas
 * zonas quedaron afuera.
 */
export function origenDeLaCopia(c: CopiaCompatible, de: Pick<OpcionDeOrigen, "sede" | "espacio">, capa: "confirmada" | "borrador",
  version: number, espejo: boolean, destino: Pick<LadoDeCopia, "participaciones">): OrigenDeCopiaIn {
  const numero = new Map(destino.participaciones.map((p) => [p.space_id, p.numero]));
  return {
    sede: de.sede, espacio: de.espacio, capa, version, espejo,
    mapa: c.grupos.map((g) => ({ origen: g.numeroOrigen, destino: g.destino === null ? null : numero.get(g.destino) ?? null })),
    sin_copiar: Math.min(500, c.descartadas.length),
  };
}
