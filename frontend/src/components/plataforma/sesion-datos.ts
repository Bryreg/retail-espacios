/* ============================================================================
   RECABRA · Plataforma — lo que se deriva del detalle de un cliente

   Capa 0 de la sesión de asesoría: nada de esto dibuja. Toma `DetalleCliente`
   tal como llega del backend y saca las cuentas que las dos pantallas
   (`pages/DetalleCliente.tsx` y `pages/InformeCliente.tsx`) necesitan, una
   sola vez y en un solo lugar, para que la sesión y el informe no puedan
   contar dos números distintos de la misma cosa.

   Tres reglas que atraviesan el archivo:

   1. **Todo sale de campos de primera clase.** `Recomendacion.datos` es de
      forma libre por tipo y el contrato de la Fase 8 dice que el frontend
      «nunca depende de una clave particular de `datos`». Así que acá no se
      lee `datos` NUNCA: la acción y la evidencia de cada recomendación se
      arman con la clave de su `id` (`"{tipo}:{clave}"`, que sí es contrato) y
      con `espacios[]`, `sedes[]`, `resumen_por_tipo[]`, `proveedores[]` y
      `oportunidades[]`. Si la clave no resuelve, se dice lo genérico; no se
      inventa.
   2. **`explicacion` no se imprime nunca.** Es literalmente el ejemplo que el
      dueño puso como lo que no puede pasar (113 códigos en un párrafo).
   3. **La tarifa de referencia no existe acá.** Ni su valor, ni su suma, ni
      su promedio. Sólo `tarifa_configurada` (sí/no) y el `spread_pct` que
      viene de `/metricas`, que es una relación y no un monto.

   El ingreso del mes y el conteo de contratos salen de `proveedores[]`
   (`Σ canon_total` y `Σ espacios`) y NO de `espacios[].contrato`: los
   contratos sobre códigos que no están en el plano (`contratos_fuera_del_plano`)
   son plata que entra y contrato que existe, pero no son una cara del plano.
   Sumando por espacio, el ingreso quedaría corto y nadie sabría por qué.
   ========================================================================== */

import type {
  ContratoEspacioDetalle,
  DetalleCliente,
  EspacioDetalle,
  Oportunidad,
  ProveedorDetalle,
  Recomendacion,
  ResumenTipoDetalle,
  TipoRecomendacion,
} from "../../api/plataforma";
import { ESTADO_TXT, fechaCorta, mesLargo, num, pct, plata, plural, puntos, tipoN, tipoP } from "./formato";

/** «batea, góndola y punta»: una enumeración con coma y una sola «y». Con
 *  `join(" y ")` sale «batea y góndola y punta», que se lee como un error de
 *  máquina. */
export function lista(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
}

/** El nombre del mes SIN el año, para prosa: «contra agosto». `mesCorto` da
 *  «ago», que en una frase se lee como una abreviatura rota; `mesLargo` mete
 *  un año que en una comparación mes contra mes sobra. */
export function mesNombre(periodo: string | null | undefined): string {
  return mesLargo(periodo).split(" de ")[0];
}

// ─── La clave de una recomendación ─────────────────────────────────────────

/** `id` es `"{tipo}:{clave}"` (contrato de la Fase 8). La clave puede llevar
 *  `:` adentro — un nombre de proveedor, por ejemplo —, así que se corta en el
 *  PRIMER separador y no se parte en pedazos. */
export function claveRec(r: Recomendacion): string {
  const i = r.id.indexOf(":");
  return i < 0 ? "" : r.id.slice(i + 1);
}

// ─── Agrupaciones ──────────────────────────────────────────────────────────

interface GrupoOportunidad {
  sede: string;
  tipo: string;
  /** Cuántos espacios en oferta hay en este grupo. */
  n: number;
  /** Cuántos de esos se liberan dentro del periodo (los otros ya están libres). */
  seLiberan: number;
  valor: number;
  precio: number | null;
  origen: "cliente" | "benchmark" | null;
  candidatos: string[];
  codigos: Array<{ codigo: string; estado: "libre" | "se_libera" }>;
}

/** Las oportunidades agrupadas por sede × tipo, de mayor a menor valor. La
 *  unidad que se muestra es el GRUPO, nunca el espacio: 166 filas son ~10
 *  grupos, y el operador llega a cualquiera de los 166 en dos clics. */
function agruparOportunidades(oportunidades: Oportunidad[]): GrupoOportunidad[] {
  const m = new Map<string, GrupoOportunidad>();
  for (const o of oportunidades) {
    const k = `${o.sede}|${o.tipo}`;
    let g = m.get(k);
    if (!g) {
      g = {
        sede: o.sede,
        tipo: o.tipo,
        n: 0,
        seLiberan: 0,
        valor: 0,
        precio: o.precio_sugerido,
        origen: o.origen_precio,
        candidatos: [],
        codigos: [],
      };
      m.set(k, g);
    }
    g.n += 1;
    g.valor += o.valor_estimado_mensual;
    if (o.estado === "se_libera") g.seLiberan += 1;
    g.codigos.push({ codigo: o.codigo, estado: o.estado });
    for (const c of o.candidatos) if (!g.candidatos.includes(c.proveedor)) g.candidatos.push(c.proveedor);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

interface RepartoSede {
  sede: string;
  libres: number;
  seLiberan: number;
  total: number;
}

/** «96 en TERRÓN · 12 en NAVE · 5 en VILLA»: dónde están los espacios en
 *  oferta de un tipo. De `espacios[]`, que es el único lugar con el estado. */
function repartoPorSede(espacios: EspacioDetalle[], tipo: string): RepartoSede[] {
  const m = new Map<string, RepartoSede>();
  for (const e of espacios) {
    if (e.tipo !== tipo || e.estado === "ocupado") continue;
    let g = m.get(e.sede);
    if (!g) {
      g = { sede: e.sede, libres: 0, seLiberan: 0, total: 0 };
      m.set(e.sede, g);
    }
    if (e.estado === "se_libera") g.seLiberan += 1;
    else g.libres += 1;
    g.total += 1;
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

// ─── El derivado del cliente, calculado una vez ────────────────────────────

interface ValorEnJuego {
  /** Σ del valor de las oportunidades: espacio que hoy no se está vendiendo. */
  espaciosLibres: number;
  /** Σ de las recomendaciones de canon por debajo del promedio del PROPIO
   *  cliente. Es dispersión interna, no posición de mercado. */
  canonBajoSuPromedio: number;
  /** La suma de los dos de arriba, y de nada más. */
  oportunidadNueva: number;
  /** Σ de los contratos que vencen dentro de la ventana de 60 días. */
  ingresoEnRiesgo: number;
  /** Σ del canon del proveedor (o los proveedores) que pasan el umbral de
   *  concentración. Plata que YA entra, de una sola mano. */
  ingresoExpuesto: number;
  /** Σ de las 25 recomendaciones, que es el número que no existe: cuenta dos
   *  veces los mismos espacios y suma como oportunidad plata que ya entra. Se
   *  muestra UNA vez, adentro del aviso que explica por qué no existe. */
  bruto: number;
  /** Cuántos proveedores pasan el umbral (para escribir la frase en singular
   *  o en plural sin adivinar). */
  proveedoresExpuestos: string[];
}

export interface Derivado {
  espacios: EspacioDetalle[];
  ocupados: number;
  seLiberan: number;
  libres: number;
  /** Lo que puede vender hoy: libres + los que se liberan dentro del periodo. */
  enOferta: number;
  /** `null` con cero espacios comercializables — no es 0 %, es que no hay con
   *  qué calcularla. */
  ocupacionPct: number | null;
  /** Contratos vigentes del periodo, incluidos los que no tienen cara en el
   *  plano. Σ `proveedores[].espacios`. */
  contratos: number;
  contratosEnPlano: number;
  /** Σ `proveedores[].canon_total` — el ingreso contratado exacto del mes. */
  ingresoMes: number;
  /** `null` con cero contratos: no existe el promedio de cero cosas. */
  canonPromedio: number | null;
  gruposOportunidad: GrupoOportunidad[];
  /** Los espacios con contrato que vencen dentro de la ventana, por fecha. */
  porVencer: Array<{ espacio: EspacioDetalle; dias: number }>;
  valor: ValorEnJuego;
  recomendaciones: { alta: Recomendacion[]; media: Recomendacion[]; baja: Recomendacion[] };
  tiposSinTarifa: ResumenTipoDetalle[];
  /** El proveedor más pesado, si hay alguno. */
  proveedorTop: ProveedorDetalle | null;
}

const VENTANA_VENCIMIENTO = 60;

/** Los contratos del periodo que están SOBRE EL PLANO, uno por espacio: las
 *  caras con contrato, sus partes vendidas (la puerta 2 de una nevera, con su
 *  código y el tipo de su cara) y las piezas (la bahía de impulso de una caja,
 *  el forro de una columna), que no cuelgan de ninguna cara porque la caja y
 *  la columna nunca son espacios. Es lo que cuenta «N sobre el plano», lo que
 *  lista la tabla de contratos y lo que vence: sin las piezas, el contrato de
 *  una bahía no estaba ni sobre el plano ni fuera, y la cuenta no cerraba. */
export function contratosSobreElPlano(
  d: DetalleCliente
): Array<EspacioDetalle & { contrato: ContratoEspacioDetalle }> {
  const deLasCaras: EspacioDetalle[] = d.espacios.flatMap((e) => [
    e,
    ...(e.partes ?? []).map((p) => ({
      ...e, codigo: p.codigo, codigo_corto: p.codigo_corto, contrato: p.contrato, partes: undefined,
    })),
  ]);
  const piezas: EspacioDetalle[] = (d.piezas ?? []).map((p) => ({
    codigo: p.codigo,
    sede: p.sede,
    codigo_corto: p.codigo_corto,
    cara: null,
    tipo: p.tipo,
    zona: null,
    area_m2: null,
    estado: p.contrato.fin <= d.hasta ? "se_libera" : "ocupado",
    contrato: p.contrato,
  }));
  return [...deLasCaras, ...piezas].filter(
    (e): e is EspacioDetalle & { contrato: ContratoEspacioDetalle } => e.contrato !== null
  );
}

export function derivar(d: DetalleCliente): Derivado {
  const espacios = d.espacios;
  const ocupados = espacios.filter((e) => e.estado === "ocupado").length;
  const seLiberan = espacios.filter((e) => e.estado === "se_libera").length;
  const libres = espacios.filter((e) => e.estado === "libre").length;
  const contratos = d.proveedores.reduce((s, p) => s + p.espacios, 0);
  const ingresoMes = d.proveedores.reduce((s, p) => s + p.canon_total, 0);
  const recsDe = (t: TipoRecomendacion) => d.recomendaciones.filter((r) => r.tipo === t);
  const conc = recsDe("concentracion_proveedor");

  const espaciosLibres = d.oportunidades.reduce((s, o) => s + o.valor_estimado_mensual, 0);
  const canonBajoSuPromedio = recsDe("precio_bajo_tarifa").reduce((s, r) => s + r.valor_estimado_mensual, 0);

  return {
    espacios,
    ocupados,
    seLiberan,
    libres,
    enOferta: libres + seLiberan,
    ocupacionPct: espacios.length === 0 ? null : ((ocupados + seLiberan) / espacios.length) * 100,
    contratos,
    // Las puertas vendidas son contratos sobre el plano, como las caras; y
    // las piezas (la bahía de una caja, el forro de una columna) también,
    // aunque no cuelguen de ninguna cara: sin ellas la cuenta no cerraba.
    contratosEnPlano: contratosSobreElPlano(d).length,
    ingresoMes,
    canonPromedio: contratos === 0 ? null : ingresoMes / contratos,
    gruposOportunidad: agruparOportunidades(d.oportunidades),
    // Con las puertas y las piezas vendidas: cada una vence por su lado, con su código.
    porVencer: contratosSobreElPlano(d)
      .filter((e) => e.contrato.dias_para_vencer <= VENTANA_VENCIMIENTO)
      .map((e) => ({ espacio: e, dias: e.contrato!.dias_para_vencer }))
      .sort((a, b) => a.dias - b.dias),
    valor: {
      espaciosLibres,
      canonBajoSuPromedio,
      oportunidadNueva: espaciosLibres + canonBajoSuPromedio,
      ingresoEnRiesgo: recsDe("contrato_por_vencer").reduce((s, r) => s + r.valor_estimado_mensual, 0),
      ingresoExpuesto: conc.reduce((s, r) => s + r.valor_estimado_mensual, 0),
      bruto: d.recomendaciones.reduce((s, r) => s + r.valor_estimado_mensual, 0),
      proveedoresExpuestos: conc.map(claveRec),
    },
    recomendaciones: {
      alta: d.recomendaciones.filter((r) => r.prioridad === "alta"),
      media: d.recomendaciones.filter((r) => r.prioridad === "media"),
      baja: d.recomendaciones.filter((r) => r.prioridad === "baja"),
    },
    tiposSinTarifa: d.resumen_por_tipo.filter((t) => !t.tarifa_configurada),
    proveedorTop: d.proveedores.length > 0 ? d.proveedores[0] : null,
  };
}

// ─── La acción y la evidencia de una recomendación ─────────────────────────
//
// Una recomendación es una ACCIÓN con un valor, no una descripción. La acción
// es lo que el operador dice en voz alta; la evidencia es una línea con el
// número que la sostiene. Las dos se arman acá, de campos de primera clase.

export type Voz = "operador" | "cliente";

export interface Contexto {
  detalle: DetalleCliente;
  der: Derivado;
}

const tipoDeGrupo = (ctx: Contexto, tipo: string): ResumenTipoDetalle | undefined =>
  ctx.detalle.resumen_por_tipo.find((t) => t.tipo === tipo);

/** El precio sugerido de un tipo y de dónde sale, tomado de las oportunidades
 *  de ese tipo (nunca de `datos`). */
function precioDe(ctx: Contexto, tipo: string): { precio: number | null; origen: "cliente" | "benchmark" | null } {
  const o = ctx.detalle.oportunidades.find((x) => x.tipo === tipo);
  return { precio: o?.precio_sugerido ?? null, origen: o?.origen_precio ?? null };
}

export function accionRec(r: Recomendacion, ctx: Contexto, voz: Voz = "operador"): string {
  const clave = claveRec(r);
  switch (r.tipo) {
    case "espacio_libre": {
      const reparto = repartoPorSede(ctx.der.espacios, clave);
      const n = reparto.reduce((s, x) => s + x.total, 0);
      const { precio } = precioDe(ctx, clave);
      const cuanto = precio === null ? "sin precio de referencia" : `a ${plata(precio)} c/u`;
      return `Ofrecer ${num(n)} ${tipoP(clave, n)} en oferta ${cuanto}`;
    }
    case "sede_subutilizada": {
      const s = ctx.detalle.sedes.find((x) => x.sede === clave);
      const libres = s ? s.libres : 0;
      return `Concentrar la venta en ${clave}: ${plural(libres, "espacio sin vender", "espacios sin vender")}`;
    }
    case "contrato_por_vencer": {
      const e = ctx.der.espacios.find((x) => x.codigo === clave);
      const fin = e?.contrato ? fechaCorta(e.contrato.fin) : null;
      return fin ? `Renovar o reasignar ${clave} antes del ${fin}` : `Renovar o reasignar ${clave}`;
    }
    case "concentracion_proveedor":
      return voz === "cliente" ? `Repartir el espacio: hoy depende de ${clave}` : `Diversificar frente a ${clave}`;
    case "precio_bajo_tarifa": {
      const t = tipoDeGrupo(ctx, clave);
      const bajos =
        t && t.canon_promedio !== null
          ? ctx.der.espacios.filter(
              (e) => e.tipo === clave && e.contrato !== null && e.contrato.canon_mensual < (t.canon_promedio as number)
            ).length
          : 0;
      return `Subir el canon de ${plural(bajos, "contrato", "contratos")} de ${tipoN(clave)} en la próxima renovación`;
    }
    case "sin_tarifa": {
      const tipos = ctx.der.tiposSinTarifa.map((t) => tipoN(t.tipo));
      return tipos.length === 0
        ? "Dejar la tarifa cargada en los tipos que no la tienen"
        : `Dejar la tarifa cargada en ${lista(tipos)}`;
    }
    case "arranque": {
      const total = ctx.detalle.resumen_por_tipo.reduce((s, t) => s + t.total, 0);
      return `Arrancar: cargar los primeros contratos sobre los ${num(total)} espacios del plano`;
    }
    default:
      return r.id;
  }
}

export function evidenciaRec(r: Recomendacion, ctx: Contexto, voz: Voz = "operador"): string {
  const clave = claveRec(r);
  switch (r.tipo) {
    case "espacio_libre": {
      const reparto = repartoPorSede(ctx.der.espacios, clave);
      const donde = reparto.map((x) => `${num(x.total)} en ${x.sede}`).join(" · ");
      const { origen } = precioDe(ctx, clave);
      const deDonde =
        origen === "cliente"
          ? voz === "cliente"
            ? "precio = el promedio que usted ya cobra por ese tipo"
            : "precio = el promedio que este cliente ya cobra por ese tipo"
          : origen === "benchmark"
            ? voz === "cliente"
              ? "precio = el promedio de la plataforma para ese tipo (no hay contratos suyos con que calcularlo)"
              : "precio = el promedio de la plataforma (este cliente no tiene contratos del tipo)"
            : "sin precio de referencia para ese tipo";
      return donde ? `${donde} — ${deDonde}` : deDonde;
    }
    case "sede_subutilizada": {
      const s = ctx.detalle.sedes.find((x) => x.sede === clave);
      if (!s || s.ocupacion_pct === null || ctx.der.ocupacionPct === null) {
        return `${clave}: sin ocupación calculable para compararla con el resto`;
      }
      const brecha = s.ocupacion_pct - ctx.der.ocupacionPct;
      const contra = voz === "cliente" ? "contra su propio promedio" : "contra el promedio del cliente";
      return `${pct(s.ocupacion_pct)} de ocupación, ${puntos(brecha)} ${contra} (${pct(ctx.der.ocupacionPct)})`;
    }
    case "contrato_por_vencer": {
      const e = ctx.der.espacios.find((x) => x.codigo === clave);
      if (!e || !e.contrato) return `${clave}: el contrato ya no está sobre una cara del plano`;
      const dentro =
        e.estado === "se_libera" ? ` — dentro del periodo: el espacio ya cambió a «${ESTADO_TXT.se_libera}»` : "";
      return `${e.contrato.proveedor} · ${tipoN(e.tipo)} · vence en ${plural(
        e.contrato.dias_para_vencer,
        "día",
        "días"
      )}${dentro}`;
    }
    case "concentracion_proveedor": {
      const p = ctx.detalle.proveedores.find((x) => x.nombre === clave);
      if (!p) return `${clave} concentra buena parte de los contratos del periodo`;
      const peso = ctx.der.ingresoMes > 0 ? ` — ${pct((p.canon_total / ctx.der.ingresoMes) * 100)} del ingreso` : "";
      const umbral = voz === "cliente" ? "" : " · el umbral del sistema es 40 %";
      return `${num(p.espacios)} de ${num(ctx.der.contratos)} contratos (${pct(
        p.participacion_pct
      )}) y ${plata(p.canon_total)}${peso}${umbral}`;
    }
    case "precio_bajo_tarifa": {
      const t = tipoDeGrupo(ctx, clave);
      if (!t || t.canon_promedio === null) return `${tipoN(clave)}: sin contratos vigentes con que calcular el promedio`;
      const bajos = ctx.der.espacios.filter(
        (e) => e.tipo === clave && e.contrato !== null && e.contrato.canon_mensual < (t.canon_promedio as number)
      ).length;
      const matiz =
        voz === "cliente"
          ? "es dispersión entre sus propios contratos, no su posición frente al mercado"
          : "dispersión interna, NO posición de mercado";
      const dueno = voz === "cliente" ? "de su propio promedio" : "del promedio del propio cliente";
      return `${plural(bajos, "contrato", "contratos")} por debajo ${dueno} (${plata(t.canon_promedio)}) — ${matiz}`;
    }
    case "sin_tarifa":
      return "sin tarifa cargada no hay con qué medir: de esos tipos no se puede decir si cobra bien";
    case "arranque": {
      const partes = ctx.detalle.resumen_por_tipo
        .slice()
        .sort((a, b) => b.total - a.total)
        .map((t) => `${num(t.total)} ${tipoP(t.tipo, t.total)}`);
      return partes.join(" · ");
    }
    default:
      return "";
  }
}

/** El título del hallazgo que corresponde a una recomendación, para el
 *  capítulo 2. Sale del tipo, no de un diccionario de textos del backend. */
export const TITULO_HALLAZGO: Record<TipoRecomendacion, string> = {
  espacio_libre: "Hay inventario entero sin vender",
  sede_subutilizada: "Todo lo vacío está en un solo lugar",
  contrato_por_vencer: "Hay contratos que se caen pronto",
  concentracion_proveedor: "Un proveedor es buena parte del negocio",
  precio_bajo_tarifa: "Hay contratos por debajo de su propio promedio",
  sin_tarifa: "Hay una medición que no se puede hacer",
  arranque: "El inventario está cargado y entero sin vender",
};
