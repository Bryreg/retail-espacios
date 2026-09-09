/* ============================================================================
   RECABRA · Plataforma — la cartera, calculada

   Capa 0 de la pieza 1 de A («El informe»): nada de esto dibuja, todo esto
   DECIDE. Acá viven las tres cuentas que el prototipo traía servidas en un
   bloque `_derivado_frontend` del JSON de ejemplo y que la API real **no
   devuelve**:

     1. `orden_por_necesidad_de_asesoria` — la cola de llamadas, con su señal,
        su razón en una línea y su plata.
     2. La corrección de composición del titular (el «agosto publicado» contra
        el «agosto sin el cliente que hoy no se deja leer»).
     3. Las anotaciones de la rejilla de doce meses (el escalón del
        denominador, el salto del ingreso).

   Las tres se calculan SÓLO con claves que la API publica
   (`MetricasPlataforma`, `Tendencia`, `Adopcion`). Ninguna función de este
   archivo inventa un campo, y todas devuelven `null` —que el render escribe
   «sin dato»— antes que rellenar una ausencia:

     · `ocupacion_pct: null` no es 0 %: es que no hay con qué calcularla.
     · `spread_pct: null` no es 0 de spread: o el cliente no cargó tarifa
       (`tarifa_configurada === false`) o ningún contrato tiene tarifa
       aplicable. Son dos ausencias distintas y se dicen distinto.
     · `canon_promedio_mensual: null` es cero contratos activos, y sin él no
       hay «precio» con el que valorar un espacio libre: se dice, no se pone
       un promedio de otro lado.

   Y la frontera dura del brief §4: **la tarifa de referencia de un cliente no
   entra en ninguna de estas cuentas**. Lo único que se usa es su relación
   (`spread_pct`) y si existe (`tarifa_configurada`). La plata «sin cobrar»
   del spread es, por eso, una APROXIMACIÓN despejada de la relación y del
   ingreso publicados, y se rotula como tal — nunca como una cifra exacta.
   ========================================================================== */

import type {
  Adopcion,
  ClienteAdopcion,
  ClienteMetricas,
  ConsolidadoMetricas,
  MetricasPlataforma,
  PuntoTendencia,
} from "../../api/plataforma";
import type { Anotacion } from "./graficos";
import { ocupadosDe } from "./graficos";
import { diasSinAcceso, mesCorto, num, pct, plata, plural, puntos, sig } from "./formato";

// ═══════════════════════════════════════════════════════════════════════════
// 1 · La cola de llamadas
// ═══════════════════════════════════════════════════════════════════════════

/** Las señales, en el orden de la regla del guion §1.3, que se escribe arriba
 *  de la lista porque si no es magia: **primero lo que no se puede ver,
 *  después la plata que se puede ir este mes, después la plata que no está
 *  entrando.** El número es el rango: es el orden por defecto de la cola y a
 *  la vez el criterio con el que un cliente que dispara varias señales se
 *  queda con UNA — la más urgente, no todas.
 *
 *  Ninguna señal lleva color. Van en tinta gris con la palabra escrita: el
 *  rojo, el ámbar y el verde codifican estado de ESPACIO y nada más (ajuste
 *  (a) de la comparativa). La jerarquía la llevan el peso y el borde. */
const SENALES = {
  sin_dato: { rango: 0, palabra: "sin dato", enfasis: "fuerte" },
  fantasma: { rango: 1, palabra: "fantasma", enfasis: "fuerte" },
  dormida: { rango: 2, palabra: "dormida", enfasis: "fuerte" },
  sin_cuentas: { rango: 3, palabra: "sin cuentas", enfasis: "medio" },
  cobra_debajo: { rango: 4, palabra: "cobra por debajo", enfasis: "medio" },
  ocupacion_baja: { rango: 5, palabra: "ocupación baja", enfasis: "medio" },
  sin_tarifa: { rango: 6, palabra: "sin tarifa", enfasis: "suave" },
  nueva: { rango: 7, palabra: "nueva", enfasis: "suave" },
  al_dia: { rango: 8, palabra: "al día", enfasis: "suave" },
} as const;

type ClaveSenal = keyof typeof SENALES;

interface PlataCola {
  /** Para ordenar «por plata». `null` = no hay cifra que ordenar, va al final
   *  — nunca se le pone un 0 para que entre en la cuenta. */
  valor: number | null;
  /** La cifra escrita. */
  texto: string;
  /** Qué es esa cifra, en dos o tres palabras. */
  sub: string;
}

export interface FilaCola {
  slug: string;
  nombre: string;
  cliente: ClienteMetricas;
  adopcion: ClienteAdopcion | null;
  senal: ClaveSenal;
  palabra: string;
  enfasis: "fuerte" | "medio" | "suave";
  rango: number;
  /** La razón, en UNA línea. Con sus cifras, siempre contra algo. */
  razon: string;
  plata: PlataCola;
  /** `conexion` es el único que no abre una sesión: no hay sesión que abrir
   *  si la base no se dejó leer. */
  accion: "sesion" | "conexion";
}

/** Espacios ocupados del cliente — el numerador de su ocupación, redondeado
 *  igual que en la rejilla de doce meses. `null` si no hay ocupación. */
function ocupadosCliente(c: ClienteMetricas): number | null {
  const m = c.metricas;
  if (!m || m.ocupacion_pct === null) return null;
  return Math.round((m.espacios_comercializables * m.ocupacion_pct) / 100);
}

function libresCliente(c: ClienteMetricas): number | null {
  const oc = ocupadosCliente(c);
  if (oc === null || !c.metricas) return null;
  return c.metricas.espacios_comercializables - oc;
}

/** La señal de un cliente: la PRIMERA que dispara. Un cliente fantasma que
 *  además cobra por debajo se llama por fantasma — esa plata se puede ir este
 *  mes; la otra lleva ahí meses.
 *
 *  Ojo con el orden: las clases de adopción (que el backend calcula una vez y
 *  son excluyentes entre sí) se miran ANTES que las lecturas de negocio,
 *  `nueva` incluida. Un cliente dado de alta hace doce días tiene cero
 *  contratos y por lo tanto ocupación baja, y llamarlo «ocupación baja» es
 *  cierto y es inútil: lo que hay que hacer con él es arrancarlo. Su RANGO,
 *  en cambio, sigue siendo el último de la cola — es la llamada menos urgente
 *  de la semana, no la más. Clasificar y ordenar son dos cosas distintas y
 *  acá se hacen por separado. */
function senalDe(c: ClienteMetricas, a: ClienteAdopcion | null, cons: ConsolidadoMetricas): ClaveSenal {
  if (c.metricas === null) return "sin_dato";
  const m = c.metricas;
  if (a?.clasificacion === "fantasma") return "fantasma";
  if (a?.clasificacion === "dormida") return "dormida";
  if (a?.clasificacion === "sin_cuentas" && a.con_contratos_activos) return "sin_cuentas";
  if (a?.clasificacion === "nueva") return "nueva";
  if (m.spread_pct !== null && m.spread_pct < 0) return "cobra_debajo";
  if (m.ocupacion_pct !== null && cons.ocupacion_pct !== null && m.ocupacion_pct < cons.ocupacion_pct) {
    return "ocupacion_baja";
  }
  if (!m.tarifa_configurada) return "sin_tarifa";
  return "al_dia";
}

function razonDe(clave: ClaveSenal, c: ClienteMetricas, a: ClienteAdopcion | null, cons: ConsolidadoMetricas): string {
  const m = c.metricas;
  const oc = ocupadosCliente(c);
  const lb = libresCliente(c);
  const dias = a ? diasSinAcceso(a.dias_sin_acceso) : "sin dato de acceso";

  if (clave === "sin_dato") {
    return `${c.error ?? "No se pudo leer la base de este cliente."} Cuenta ${c.estado_cuenta.replace("_", " ")}: no hay cifra que mirar este periodo.`;
  }
  if (!m) return "Sin métricas este periodo.";

  const parteOcupados =
    oc === null
      ? `${plural(m.espacios_comercializables, "espacio comercializable", "espacios comercializables")} y ocupación sin dato`
      : `${plural(oc, "espacio ocupado", "espacios ocupados")}`;

  switch (clave) {
    case "fantasma":
      return `${parteOcupados} por ${plata(m.ingreso_contratado_mes)} al mes y ${dias}; cuenta ${c.estado_cuenta.replace("_", " ")}.`;
    case "dormida":
      return `Tiene ${plural(m.usuarios_con_cuenta, "cuenta de usuario", "cuentas de usuario")} y ${dias}, con ${parteOcupados}.`;
    case "sin_cuentas":
      return `Ningún usuario con cuenta y ${parteOcupados}: paga y nadie del supermercado lo abre.`;
    case "cobra_debajo": {
      const sp = m.spread_pct as number;
      const cola =
        m.contratos_sin_tarifa > 0
          ? ` (${plural(m.contratos_sin_tarifa, "contrato queda", "contratos quedan")} fuera del cálculo, sin tarifa aplicable)`
          : "";
      return `Spread ${sig(sp, (v) => pct(v))}: cobra ${pct(Math.abs(sp))} menos que su propia tarifa sobre ${plata(m.ingreso_contratado_mes)}${cola}.`;
    }
    case "ocupacion_baja": {
      const contra =
        cons.ocupacion_pct !== null
          ? `, ${puntos((m.ocupacion_pct as number) - cons.ocupacion_pct)} contra la cartera`
          : "";
      return `${pct(m.ocupacion_pct)} sobre ${num(m.espacios_comercializables)} espacios${contra}: ${lb === null ? "libres sin dato" : plural(lb, "espacio sin vender", "espacios sin vender")}.`;
    }
    case "sin_tarifa":
      return `${pct(m.ocupacion_pct)} de ocupación sobre ${num(m.espacios_comercializables)} espacios y sin tarifa de referencia cargada: de él no se puede decir si cobra bien.`;
    case "nueva":
      return `Alta ${a?.cohorte ?? "sin fecha"}, ${num(m.espacios_comercializables)} espacios cargados y ${m.ingreso_contratado_mes === 0 ? "cero contratos" : `${plata(m.ingreso_contratado_mes)} contratados`}.`;
    default: {
      const sp = m.spread_pct === null ? "sin spread medible" : `spread ${sig(m.spread_pct, (v) => pct(v))}`;
      return `${pct(m.ocupacion_pct)} sobre ${num(m.espacios_comercializables)} espacios y ${sp}: nada urgente esta semana.`;
    }
  }
}

function plataDe(clave: ClaveSenal, c: ClienteMetricas, cons: ConsolidadoMetricas): PlataCola {
  const m = c.metricas;
  if (!m) return { valor: null, texto: "—", sub: "no hay cifra que mirar" };

  const share =
    cons.ingreso_contratado_mes > 0
      ? ` · ${pct((m.ingreso_contratado_mes / cons.ingreso_contratado_mes) * 100)} de la cartera`
      : "";

  switch (clave) {
    case "fantasma":
    case "dormida":
    case "sin_cuentas":
      return {
        valor: m.ingreso_contratado_mes,
        texto: `${plata(m.ingreso_contratado_mes)}/mes`,
        sub: `en riesgo${share}`,
      };
    case "cobra_debajo": {
      /* Despejado de la RELACIÓN publicada, nunca de la tarifa: si el canon
         es un 17,4 % menos que la tarifa, la tarifa del mismo conjunto sería
         `ingreso / (1 + spread/100)`. Es aproximado dos veces —el spread se
         calcula sólo sobre los contratos con tarifa aplicable, y viene
         redondeado a un decimal— y por eso va con «≈» y con su aclaración. */
      const sp = m.spread_pct as number;
      const base = 1 + sp / 100;
      if (base <= 0) return { valor: null, texto: "sin referencia", sub: "spread fuera de rango" };
      const v = m.ingreso_contratado_mes / base - m.ingreso_contratado_mes;
      return {
        valor: v,
        texto: `≈ ${plata(Math.round(v / 1e5) * 1e5)}/mes`,
        sub:
          m.contratos_sin_tarifa > 0
            ? `sin cobrar · aprox., sin ${plural(m.contratos_sin_tarifa, "contrato", "contratos")}`
            : "sin cobrar · aprox.",
      };
    }
    case "ocupacion_baja": {
      /* Estimación, y por eso «≈»: es el canon PROMEDIO del propio cliente
         aplicado a sus espacios libres, no un precio por espacio. Se redondea
         a la centena de miles para que la cifra no finja una precisión que
         no tiene. */
      const lb = libresCliente(c);
      if (lb === null || m.canon_promedio_mensual === null) {
        return { valor: null, texto: "sin referencia", sub: "sin canon promedio con qué valorarlos" };
      }
      const v = lb * m.canon_promedio_mensual;
      return { valor: v, texto: `≈ ${plata(Math.round(v / 1e5) * 1e5)}/mes`, sub: "sin vender · al canon que él ya cobra" };
    }
    case "sin_tarifa":
      return { valor: null, texto: "sin referencia", sub: "no tiene tarifa cargada" };
    case "nueva": {
      if (cons.canon_promedio_mensual === null) {
        return { valor: null, texto: "sin referencia", sub: "la cartera no tiene canon promedio" };
      }
      const v = m.espacios_comercializables * cons.canon_promedio_mensual;
      return {
        valor: v,
        texto: `≈ ${plata(Math.round(v / 1e5) * 1e5)}/mes`,
        sub: "al canon promedio de la cartera, si arranca",
      };
    }
    default:
      return { valor: m.ingreso_contratado_mes, texto: `${plata(m.ingreso_contratado_mes)}/mes`, sub: `facturando${share}` };
  }
}

export type OrdenCola = "riesgo" | "plata";

/** La cola entera, ordenada. `riesgo` es el orden por defecto y es la regla
 *  del guion; `plata` está a un clic porque el número más grande casi nunca es
 *  la llamada más urgente, y el dueño tiene derecho a la otra lectura. */
export function armarCola(
  metricas: MetricasPlataforma,
  adopcion: Adopcion | null,
  orden: OrdenCola
): FilaCola[] {
  const porSlug = new Map<string, ClienteAdopcion>();
  (adopcion?.clientes ?? []).forEach((a) => porSlug.set(a.slug, a));

  const filas: FilaCola[] = metricas.clientes.map((c) => {
    const a = porSlug.get(c.slug) ?? null;
    const clave = senalDe(c, a, metricas.consolidado);
    const s = SENALES[clave];
    return {
      slug: c.slug,
      nombre: c.nombre,
      cliente: c,
      adopcion: a,
      senal: clave,
      palabra: s.palabra,
      enfasis: s.enfasis,
      rango: s.rango,
      razon: razonDe(clave, c, a, metricas.consolidado),
      plata: plataDe(clave, c, metricas.consolidado),
      accion: clave === "sin_dato" ? "conexion" : "sesion",
    };
  });

  if (orden === "plata") {
    /* Sin cifra va al final, con su nombre a la vista: un cliente sin plata
       que ordenar no desaparece de la cola. */
    return filas.sort((x, y) => {
      if (x.plata.valor === null && y.plata.valor === null) return x.rango - y.rango;
      if (x.plata.valor === null) return 1;
      if (y.plata.valor === null) return -1;
      return y.plata.valor - x.plata.valor;
    });
  }
  return filas.sort((x, y) => x.rango - y.rango || (y.plata.valor ?? -1) - (x.plata.valor ?? -1));
}

/** Cuántos clientes necesitan una llamada esta semana: los de rango ≤ 3
 *  (no se deja leer, o la plata se puede ir este mes) más los que cobran por
 *  debajo. Es la cifra de la frase-conclusión del capítulo. */
export function urgentes(filas: FilaCola[]): FilaCola[] {
  return filas.filter((f) => f.rango <= SENALES.cobra_debajo.rango);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · La corrección de composición del titular
// ═══════════════════════════════════════════════════════════════════════════

interface ColumnaComposicion {
  clientes: string;
  espacios: number | null;
  ocupacion: number | null;
  ingreso: number | null;
}

export interface Composicion {
  /** El mes anterior TAL COMO SE PUBLICÓ. Nunca se esconde: se muestra igual,
   *  tachado, con la palabra «composición distinta». */
  publicado: ColumnaComposicion | null;
  /** El mismo mes anterior sin los clientes que este periodo no se dejaron
   *  leer. `null` cuando no se puede recomponer con lo que la API publica —
   *  y entonces se escribe «sin dato», no se estima. */
  comparable: ColumnaComposicion | null;
  actual: ColumnaComposicion;
  /** Los clientes que salieron de la cuenta, con lo que aportaban el mes
   *  anterior. Vacío = la composición no cambió por una base ilegible. */
  quitados: Array<{ slug: string; nombre: string; espacios: number; ocupados: number; ingreso: number }>;
  /** Por qué no hay columna comparable, para escribirlo tal cual. */
  motivoSinComparable: string | null;
  /** `true` cuando el mes anterior y éste cuentan los mismos clientes: el
   *  delta grande se puede leer directo, sin corrección. */
  mismaComposicion: boolean;
  /** El delta contra la columna que corresponde (la comparable si existe). */
  deltaIngreso: number | null;
  deltaIngresoPct: number | null;
  deltaOcupacion: number | null;
  /** El delta CRUDO, contra el publicado. Se muestra tachado cuando la
   *  composición cambió. */
  deltaIngresoCrudo: number | null;
  mesAnterior: string | null;
}

function columnaDe(p: PuntoTendencia): ColumnaComposicion {
  return {
    clientes: p.clientes_incluidos === null ? "—" : String(p.clientes_incluidos),
    espacios: p.espacios_comercializables,
    ocupacion: p.ocupacion_pct,
    ingreso: p.ingreso_contratado_mes,
  };
}

/**
 * La cuenta más importante de la pantalla, y la trampa número 2 del guion:
 * «la cartera perdió $ 45,3 millones este mes». Casi nunca perdió nada — lo
 * que cambió fue **quién entra en la cuenta**.
 *
 * Se recompone con datos publicados y nada más: al total del mes anterior
 * (`/tendencia` del consolidado) se le RESTA lo que ese mismo mes aportaba
 * cada cliente que hoy devuelve `error` (`/tendencia?cliente=<slug>`, que lee
 * el snapshot persistido y por eso sigue contestando aunque la base esté
 * rota). Si después de restar los clientes de la cuenta no coinciden, la
 * corrección está incompleta —entró un cliente nuevo, por ejemplo— y
 * entonces NO se publica una columna comparable: se dice por qué.
 */
export function armarComposicion(
  metricas: MetricasPlataforma,
  serie: PuntoTendencia[],
  seriesDeLosIlegibles: Map<string, PuntoTendencia[]>
): Composicion {
  const cons = metricas.consolidado;
  const clientesActual = cons.clientes_total - cons.clientes_con_error;
  const actual: ColumnaComposicion = {
    clientes:
      cons.clientes_con_error > 0
        ? `${clientesActual} (+${cons.clientes_con_error} sin dato)`
        : String(clientesActual),
    espacios: cons.espacios_comercializables,
    ocupacion: cons.ocupacion_pct,
    ingreso: cons.ingreso_contratado_mes,
  };

  const i = serie.findIndex((p) => p.periodo === metricas.periodo.anio_mes);
  const previo = i > 0 ? serie[i - 1] : null;
  const vacio: Composicion = {
    publicado: null,
    comparable: null,
    actual,
    quitados: [],
    motivoSinComparable:
      i < 0
        ? "El periodo elegido queda fuera de la ventana de doce meses de la tendencia: no hay mes anterior publicado con qué compararlo."
        : "No hay mes anterior con snapshot en la serie: el primer mes de la ventana no tiene contra qué medirse.",
    mismaComposicion: false,
    deltaIngreso: null,
    deltaIngresoPct: null,
    deltaOcupacion: null,
    deltaIngresoCrudo: null,
    mesAnterior: null,
  };
  if (!previo) return vacio;
  if (previo.sin_dato) {
    return { ...vacio, mesAnterior: previo.periodo, motivoSinComparable: `${mesCorto(previo.periodo)} no tiene snapshot: no hay mes anterior con qué comparar.` };
  }

  const publicado = columnaDe(previo);
  const crudo =
    previo.ingreso_contratado_mes === null ? null : cons.ingreso_contratado_mes - previo.ingreso_contratado_mes;

  /* Lo que aportaba cada ilegible el mes anterior, leído de SU serie. */
  const quitados: Composicion["quitados"] = [];
  const faltan: string[] = [];
  metricas.clientes
    .filter((c) => c.metricas === null)
    .forEach((c) => {
      const s = seriesDeLosIlegibles.get(c.slug);
      const p = s?.find((x) => x.periodo === previo.periodo);
      const oc = p ? ocupadosDe(p) : null;
      if (!p || p.sin_dato || p.espacios_comercializables === null || p.ingreso_contratado_mes === null || oc === null) {
        faltan.push(c.nombre);
        return;
      }
      quitados.push({
        slug: c.slug,
        nombre: c.nombre,
        espacios: p.espacios_comercializables,
        ocupados: oc,
        ingreso: p.ingreso_contratado_mes,
      });
    });

  const mismaComposicion = previo.clientes_incluidos === clientesActual && quitados.length === 0 && faltan.length === 0;
  if (mismaComposicion) {
    return {
      publicado,
      comparable: publicado,
      actual,
      quitados: [],
      motivoSinComparable: null,
      mismaComposicion: true,
      deltaIngreso: crudo,
      deltaIngresoPct:
        previo.ingreso_contratado_mes && crudo !== null ? (crudo / previo.ingreso_contratado_mes) * 100 : null,
      deltaOcupacion:
        cons.ocupacion_pct !== null && previo.ocupacion_pct !== null ? cons.ocupacion_pct - previo.ocupacion_pct : null,
      deltaIngresoCrudo: crudo,
      mesAnterior: previo.periodo,
    };
  }

  const ocPrevio = ocupadosDe(previo);
  const puedeRecomponer =
    faltan.length === 0 &&
    quitados.length > 0 &&
    previo.espacios_comercializables !== null &&
    previo.ingreso_contratado_mes !== null &&
    ocPrevio !== null &&
    previo.clientes_incluidos !== null &&
    previo.clientes_incluidos - quitados.length === clientesActual;

  if (!puedeRecomponer) {
    const quedan = previo.clientes_incluidos === null ? null : previo.clientes_incluidos - quitados.length;
    const motivo =
      faltan.length > 0
        ? `No hay snapshot de ${mesCorto(previo.periodo)} para ${faltan.join(", ")}: sin esas cifras el mes anterior no se puede recomponer, y no se estima.`
        : quitados.length > 0
          ? `${mesCorto(previo.periodo)} contó ${previo.clientes_incluidos ?? "—"} clientes y, quitando ${quitados.map((q) => q.nombre).join(", ")}, quedan ${quedan ?? "—"} contra los ${clientesActual} de este mes: la diferencia no la explican sólo las bases ilegibles —entró o salió algún cliente más—, así que el mes anterior no se recompone.`
          : `${mesCorto(previo.periodo)} contó ${previo.clientes_incluidos ?? "—"} clientes y este mes son ${clientesActual}, y ninguna base quedó ilegible: la composición cambió por otra cosa, así que el mes anterior no se recompone.`;
    return {
      publicado,
      comparable: null,
      actual,
      quitados,
      motivoSinComparable: motivo,
      mismaComposicion: false,
      deltaIngreso: null,
      deltaIngresoPct: null,
      deltaOcupacion: null,
      deltaIngresoCrudo: crudo,
      mesAnterior: previo.periodo,
    };
  }

  const espComp = (previo.espacios_comercializables as number) - quitados.reduce((s, q) => s + q.espacios, 0);
  const ocComp = (ocPrevio as number) - quitados.reduce((s, q) => s + q.ocupados, 0);
  const ingComp = (previo.ingreso_contratado_mes as number) - quitados.reduce((s, q) => s + q.ingreso, 0);
  const comparable: ColumnaComposicion = {
    clientes: String((previo.clientes_incluidos as number) - quitados.length),
    espacios: espComp,
    ocupacion: espComp > 0 ? (ocComp / espComp) * 100 : null,
    ingreso: ingComp,
  };

  return {
    publicado,
    comparable,
    actual,
    quitados,
    motivoSinComparable: null,
    mismaComposicion: false,
    deltaIngreso: cons.ingreso_contratado_mes - ingComp,
    deltaIngresoPct: ingComp > 0 ? ((cons.ingreso_contratado_mes - ingComp) / ingComp) * 100 : null,
    deltaOcupacion:
      cons.ocupacion_pct !== null && comparable.ocupacion !== null ? cons.ocupacion_pct - comparable.ocupacion : null,
    deltaIngresoCrudo: crudo,
    mesAnterior: previo.periodo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Las anotaciones de la rejilla de doce meses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los escalones del DENOMINADOR, anotados sobre el dato y no en una leyenda.
 * Son la razón de que esta serie se dibuje en conteos: cuando entran caras
 * nuevas al plano, la ocupación en porcentaje cae sin que se pierda un solo
 * contrato, y ninguna anotación arregla un eje que miente.
 *
 * Se anotan los tres saltos más grandes que superen el umbral (5 espacios o
 * el 3 % del mes anterior, lo que sea mayor: por debajo de eso es ruido de
 * altas y bajas normales). Cuando además cambió el número de clientes de la
 * cuenta, se dice — porque es otra causa y no la misma.
 */
export function anotacionesDenominador(serie: PuntoTendencia[], maximo = 3): Anotacion[] {
  const saltos: Array<{ i: number; d: number; clientes: number | null }> = [];
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1];
    const b = serie[i];
    if (a.espacios_comercializables === null || b.espacios_comercializables === null) continue;
    const d = b.espacios_comercializables - a.espacios_comercializables;
    if (Math.abs(d) < Math.max(5, a.espacios_comercializables * 0.03)) continue;
    const dc =
      a.clientes_incluidos !== null && b.clientes_incluidos !== null ? b.clientes_incluidos - a.clientes_incluidos : null;
    saltos.push({ i, d, clientes: dc });
  }
  return saltos
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, maximo)
    .sort((x, y) => x.i - y.i)
    .map(({ i, d, clientes }) => {
      const causa =
        clientes === null || clientes === 0
          ? d > 0
            ? "entró plano nuevo"
            : "salieron caras del plano"
          : clientes > 0
            ? `${plural(clientes, "cliente entra", "clientes entran")} a la cuenta`
            : `${plural(Math.abs(clientes), "cliente sale", "clientes salen")} de la cuenta`;
      return {
        i,
        t: `${mesCorto(serie[i].periodo)} · ${sig(d, (v) => num(v))} caras: ${causa}`,
        lado: (i > serie.length / 2 ? "izq" : "der") as "izq" | "der",
      };
    });
}

/** El salto de plata más grande de la serie, anotado sobre la línea del
 *  ingreso. Uno solo: un número sobre cada punto es ruido (guion §3.5.5). */
export function anotacionIngreso(serie: PuntoTendencia[]): Anotacion[] {
  let peor: { i: number; d: number } | null = null;
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1].ingreso_contratado_mes;
    const b = serie[i].ingreso_contratado_mes;
    if (a === null || b === null || a === 0) continue;
    const d = b - a;
    if (Math.abs(d / a) < 0.03) continue;
    if (peor === null || Math.abs(d) > Math.abs(peor.d)) peor = { i, d };
  }
  if (!peor) return [];
  return [
    {
      i: peor.i,
      t: `${mesCorto(serie[peor.i].periodo)} · ${sig(peor.d, (v) => plata(v))}`,
      lado: (peor.i > serie.length / 2 ? "izq" : "der") as "izq" | "der",
    },
  ];
}

/** La frase del aviso «por qué conteos y no un porcentaje», con las cifras de
 *  ESTA serie. `null` si el denominador no se movió: entonces el aviso no
 *  tiene nada que avisar y no se escribe. */
export function avisoDenominador(serie: PuntoTendencia[]): string | null {
  const con = serie.filter((p) => p.espacios_comercializables !== null);
  if (con.length < 2) return null;
  const valores = con.map((p) => p.espacios_comercializables as number);
  /* Los tramos, no los doce meses: «174 → 306 → 346 → 258» dice lo mismo que
     repetir 174 seis veces, y se lee. */
  const tramos = valores.filter((v, k) => k === 0 || v !== valores[k - 1]);
  const cambios = tramos.length - 1;
  if (cambios === 0) return null;
  const ocs = con.map((p) => p.ocupacion_pct).filter((v): v is number => v !== null);
  if (ocs.length < 2) return null;
  const caida = Math.max(...ocs) - Math.min(...ocs);
  return (
    `El denominador se movió ${plural(cambios, "vez", "veces")} en la ventana: ` +
    `${tramos.map((v) => num(v)).join(" → ")} espacios comercializables. Una línea de porcentaje sobre eso ` +
    `dibuja un vaivén de ${puntos(caida).replace(/^[+−]/, "")} que no necesariamente ocurrió. Con dos líneas ` +
    `de conteo en una sola escala de espacios, el escalón está en el dato y no hace falta explicarlo.`
  );
}

/** El delta que es CERO se escribe cero, no «−0,0». Un signo delante de un
 *  redondeo a cero es una dirección que el dato no tiene. */
export function casiCero(v: number | null): number | null {
  if (v === null) return null;
  return Math.abs(v) < 0.05 ? 0 : v;
}

/** «subió 1,9 %» · «bajó 1,9 %» · «quedó plano». */
export function movimiento(pctVal: number | null): string {
  if (pctVal === null) return "no se puede medir";
  const v = casiCero(pctVal) as number;
  if (v === 0) return "quedó plano";
  return `${v > 0 ? "subió" : "bajó"} ${pct(Math.abs(v))}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · La frase del spread y la de la adopción
// ═══════════════════════════════════════════════════════════════════════════

export function fraseSpread(metricas: MetricasPlataforma): string {
  const total = metricas.clientes.length;
  const con = metricas.clientes.filter((c) => c.metricas && c.metricas.spread_pct !== null);
  const sinTarifa = metricas.clientes.filter((c) => c.metricas && !c.metricas.tarifa_configurada);
  const sinAplicable = metricas.clientes.filter(
    (c) => c.metricas && c.metricas.tarifa_configurada && c.metricas.spread_pct === null
  );
  const ilegibles = metricas.clientes.filter((c) => c.metricas === null);

  if (con.length === 0) {
    return (
      `De ${plural(total, "cliente", "clientes")} ninguno tiene el spread calculable este periodo: ` +
      `${plural(sinTarifa.length, "no cargó tarifa de referencia", "no cargaron tarifa de referencia")}, ` +
      `${plural(sinAplicable.length, "no tiene contratos con tarifa aplicable", "no tienen contratos con tarifa aplicable")} ` +
      `y ${plural(ilegibles.length, "base no se dejó leer", "bases no se dejaron leer")}. No se dibuja un cero en su lugar.`
    );
  }
  const peor = con
    .slice()
    .sort((a, b) => (a.metricas!.spread_pct as number) - (b.metricas!.spread_pct as number))[0];
  const sp = peor.metricas!.spread_pct as number;
  const lectura =
    sp < 0
      ? `${peor.nombre} cobra ${pct(Math.abs(sp))} por debajo de su propia tarifa sobre ${plata(peor.metricas!.ingreso_contratado_mes)}`
      : `el más bajo es ${peor.nombre}, y todavía cobra ${pct(sp)} por encima de su propia tarifa`;
  const resto = total - con.length;
  return (
    `De ${plural(total, "cliente", "clientes")} sólo ${con.length} ${con.length === 1 ? "tiene" : "tienen"} el spread medible: ` +
    `${lectura}. ` +
    (resto === 0
      ? "Todos tienen tarifa cargada y contratos a los que aplicarla."
      : `De ${resto === 1 ? "el otro" : `los otros ${resto}`} no se puede decir si ${resto === 1 ? "cobra" : "cobran"} bien: ` +
        `${sinTarifa.length} sin tarifa cargada, ${sinAplicable.length} sin contratos con tarifa aplicable y ${ilegibles.length} sin lectura.`)
  );
}

export function fraseAdopcion(adopcion: Adopcion): string {
  const total = adopcion.clientes.length;
  const fuera = adopcion.clientes.filter((c) => c.dias_sin_acceso === null || c.dias_sin_acceso > 30);
  const conCuentas = fuera.filter((c) => c.usuarios_con_cuenta > 0);
  const cohortes = adopcion.cohortes.filter((h) => h.clientes > 0 && h.retencion_30d_pct !== null);
  const peor = cohortes.slice().sort((a, b) => (a.retencion_30d_pct as number) - (b.retencion_30d_pct as number))[0];
  const cola = peor
    ? ` La cohorte ${peor.cohorte ?? "sin fecha de alta"} es la más baja: ${Math.round((peor.clientes * (peor.retencion_30d_pct as number)) / 100)} de ${peor.clientes} con acceso en 30 días.`
    : "";
  return (
    `${fuera.length} de ${total} clientes no entraron a la plataforma en el último mes` +
    (conCuentas.length !== fuera.length
      ? ` (${fuera.length - conCuentas.length} de ellos no tiene ni una cuenta de usuario, así que de ese no se puede saber)`
      : "") +
    `.${cola}`
  );
}
