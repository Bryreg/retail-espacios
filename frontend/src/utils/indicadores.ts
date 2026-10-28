/**
 * Las cuentas de Indicadores (rediseño UX 2026-10, etapa 5), sin React.
 * `probar-armazon` las corre sin navegador.
 *
 * Cada cifra de la pantalla sale de acá con su fórmula escrita al lado, y el
 * diccionario (`METRICAS`) dice esa misma fórmula con palabras: el «?» de cada
 * tarjeta y la pestaña «Diccionario» leen lo mismo.
 *
 * Las fechas van como `YYYY-MM-DD` y la plata, entera.
 */

export type EstadoContraMeta = "ok" | "bajo" | "muy_bajo";

/** Cómo está un porcentaje contra su meta: en la meta o arriba, ámbar por
 *  debajo, y rojo diez puntos por debajo (90 → 80; 95 → 85), como se propuso
 *  en el dibujo. Siempre se dice con texto, nunca sólo con el color. */
export function contraLaMeta(valor: number, meta: number): EstadoContraMeta {
  if (valor >= meta) return "ok";
  return valor >= meta - 10 ? "bajo" : "muy_bajo";
}

export function textoContraLaMeta(valor: number, meta: number): string {
  const e = contraLaMeta(valor, meta);
  return e === "ok" ? `En la meta de ${meta} %` : `Bajo la meta de ${meta} %`;
}

/** Canon ÷ tarifa: lo que se cobra al mes contra lo que diría la tarifa de
 *  referencia de esos mismos espacios. Sólo cuentan las filas con tarifa (sin
 *  tarifa no hay contra qué comparar), y se dice cuántas quedaron afuera. */
export function canonContraTarifa(filas: readonly { alMes: number; tarifa: number }[]): {
  pct: number | null; canon: number; tarifa: number; contadas: number; sinTarifa: number;
} {
  let canon = 0, tarifa = 0, contadas = 0, sinTarifa = 0;
  for (const f of filas) {
    if (!(f.tarifa > 0)) { sinTarifa++; continue; }
    canon += f.alMes;
    tarifa += f.tarifa;
    contadas++;
  }
  return { pct: tarifa > 0 ? Math.round((canon / tarifa) * 100) : null, canon, tarifa, contadas, sinTarifa };
}

/** Días de `a` a `b` (b − a): positivo si b es después. */
export function diasHasta(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export interface PuntoQueVence { codigo: string; dias: number; alMes: number; renovado: boolean }

/** Lo que vence en los próximos `dias` días (90): cada contrato como un punto
 *  sobre el eje de días, y el canon al mes que se cae sin renovar (sin un
 *  contrato siguiente firmado). */
export function venceEn(filas: readonly { codigo: string; hasta: string; alMes: number; renovado: boolean }[],
  hoy: string, dias = 90): { puntos: PuntoQueVence[]; sinRenovar: number; total: number } {
  const puntos = filas
    .map((f) => ({ codigo: f.codigo, dias: diasHasta(hoy, f.hasta), alMes: f.alMes, renovado: f.renovado }))
    .filter((p) => p.dias >= 0 && p.dias <= dias)
    .sort((a, b) => a.dias - b.dias || a.codigo.localeCompare(b.codigo));
  return {
    puntos,
    sinRenovar: puntos.filter((p) => !p.renovado).reduce((t, p) => t + p.alMes, 0),
    total: puntos.reduce((t, p) => t + p.alMes, 0),
  };
}

export type EstadoDeMontaje = "verificado" | "sin_verificar" | "sin_montar" | "no_realizado";

/** Montajes del mes: los contratos que empiezan en el mes de `hoy`, y cuántos
 *  están en la tienda (montados, verificados o no) por estado. */
export function montajesDelMes(contratos: readonly { desde: string; estado: EstadoDeMontaje }[], hoy: string) {
  const mes = hoy.slice(0, 7);
  const delMes = contratos.filter((c) => c.desde.slice(0, 7) === mes);
  const n: Record<EstadoDeMontaje, number> = { verificado: 0, sin_verificar: 0, sin_montar: 0, no_realizado: 0 };
  for (const c of delMes) n[c.estado]++;
  return { total: delMes.length, enLaTienda: n.verificado + n.sin_verificar, porEstado: n };
}

/** Los disponibles hoy con los días que llevan sin contrato (desde el día
 *  después del último que terminó); `null` si nunca tuvieron uno. */
export function diasSinContrato(codigos: readonly string[], ultimoFin: Record<string, string>, hoy: string) {
  return codigos
    .map((codigo) => {
      const fin = ultimoFin[codigo.toUpperCase()];
      return { codigo, dias: fin ? Math.max(0, diasHasta(fin, hoy)) : null };
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || a.codigo.localeCompare(b.codigo));
}

/** El último valor de una serie contra el anterior. */
export function variacion(serie: readonly number[]): { actual: number; anterior: number | null; pct: number | null } {
  const actual = serie[serie.length - 1] ?? 0;
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null;
  const pct = anterior && anterior > 0 ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null;
  return { actual, anterior, pct };
}

/** Plata entera, con puntos de mil: «$ 9.939.500». */
export function pesos(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

/** Una tabla a CSV para Excel en español: `;` entre columnas, comillas donde
 *  hace falta y BOM para que lea bien las tildes. */
export function aCsv(columnas: readonly string[], filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  const celda = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + [columnas, ...filas].map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

/** Bajar un CSV con ese nombre (en el navegador). */
export function bajarCsv(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface Metrica {
  id: string;
  nombre: string;
  formula: string;
  periodo: string;
  comparacion: string;
  umbral: string;
  origen: string;
  /** Lleva plata: el trabajador no la ve. */
  plata: boolean;
}

/** El diccionario de métricas: la definición exacta de cada cifra. */
export const METRICAS: readonly Metrica[] = [
  { id: "canon", nombre: "Canon mensual contratado", plata: true,
    formula: "Suma, sobre los contratos vigentes hoy, de su valor total repartido en sus meses (el «al mes»), más lo cargado en los cortes de este mes de los contratos que se cobran por % de las ventas.",
    periodo: "El mes en curso.", comparacion: "Contra el mes anterior (lo devengado ese mes: cada contrato por los días que corrió).",
    umbral: "Sin meta propia: se lee junto al potencial a tarifa.", origen: "Contratos de la base (space_leases) y cortes de ventas." },
  { id: "potencial", nombre: "Potencial a tarifa", plata: true,
    formula: "Suma de la tarifa de referencia al mes de cada cara que se vende en la sede, esté o no contratada.",
    periodo: "Un mes, con la tarifa de hoy.", comparacion: "El canon como porcentaje del potencial.",
    umbral: "—", origen: "Tarifas de referencia (Ajustes › Tarifas) y el plano de la sede." },
  { id: "ocupacion", nombre: "Ocupación", plata: false,
    formula: "Caras que trabajan hoy (contratadas, por partes o por participación) ÷ caras que se venden en la sede.",
    periodo: "Hoy (o el periodo elegido en Indicadores).", comparacion: "Contra la meta de la sede.",
    umbral: "Ámbar bajo la meta; rojo diez puntos debajo.", origen: "El plano de la sede y los contratos de la base." },
  { id: "canon_tarifa", nombre: "Canon ÷ tarifa", plata: true,
    formula: "Canon al mes de los contratos vigentes ÷ la tarifa de referencia al mes de esos mismos espacios. Sólo cuentan los espacios con tarifa.",
    periodo: "Hoy.", comparacion: "Contra la meta (95 % propuesto).",
    umbral: "Ámbar bajo la meta; rojo diez puntos debajo.", origen: "Contratos de la base y tarifas de referencia." },
  { id: "sin_facturar", nombre: "Sin facturar por espacios disponibles", plata: true,
    formula: "Tarifa de referencia al mes de las caras disponibles hoy: lo que la sede deja de cobrar por mes si siguen vacías.",
    periodo: "Un mes.", comparacion: "—", umbral: "—", origen: "Tarifas y el plano de la sede." },
  { id: "vence_90", nombre: "Canon que vence en 90 días", plata: true,
    formula: "Canon al mes de los contratos que terminan en los próximos 90 días; «sin renovar» es la parte que no tiene un contrato siguiente firmado.",
    periodo: "Los próximos 90 días.", comparacion: "Renovado contra sin renovar.",
    umbral: "Todo lo sin renovar pide acción.", origen: "Contratos de la base (el vigente y el próximo de cada espacio)." },
  { id: "disponibles_dia", nombre: "Espacios disponibles por día", plata: false,
    formula: "Para cada día de los próximos 90, cuántos espacios no tienen contrato ni reserva ese día.",
    periodo: "Los próximos 90 días.", comparacion: "—", umbral: "—", origen: "La línea de tiempo de la sede." },
  { id: "dias_entre", nombre: "Días disponibles entre contratos", plata: false,
    formula: "Para los espacios disponibles hoy, los días desde que terminó su último contrato.",
    periodo: "Hasta hoy.", comparacion: "—", umbral: "—", origen: "El historial de contratos de la base." },
  { id: "montajes", nombre: "Montajes del mes", plata: false,
    formula: "Contratos que empiezan este mes y cuántos están en la tienda (montados, verificados o no), por estado: verificado, sin verificar, sin montar, no realizado.",
    periodo: "El mes en curso.", comparacion: "En la tienda contra el total.",
    umbral: "—", origen: "Contratos y reportes de montaje (con su verificación)." },
  { id: "vence_30", nombre: "Ingreso por vencer en 30 días", plata: true,
    formula: "Canon al mes de los contratos vigentes que terminan en los próximos 30 días y no tienen un contrato siguiente firmado (para quien no administra, cuántos son).",
    periodo: "Los próximos 30 días (y, al lado, los 90).", comparacion: "—",
    umbral: "Todo lo sin renovar pide acción; hasta 7 días es prioridad alta.", origen: "Contratos de la base (el vigente y el próximo de cada espacio)." },
  { id: "montajes_pendientes", nombre: "Montajes pendientes", plata: false,
    formula: "Caras con algo por montar o revisar: contratos que ya corren sin reporte (de los últimos 30 días), montajes que no se pudieron hacer, planogramas sin montar, sin guía, que no coinciden o por verificar. Una cara cuenta una vez, con su estado más urgente.",
    periodo: "Hoy.", comparacion: "—", umbral: "«No realizado» pide gestión.", origen: "Reportes de montaje y planogramas." },
  { id: "caras_sin_contrato", nombre: "Caras sin contrato", plata: false,
    formula: "Caras que se venden y hoy no tienen contrato, partes vendidas ni participaciones que las ocupen. Para administración, su valor a tarifa al mes.",
    periodo: "Hoy.", comparacion: "Cuántas faltan para la meta de ocupación.", umbral: "—", origen: "El plano de la sede, los contratos y las tarifas." },
  { id: "venta_parcial", nombre: "Venta parcial", plata: false,
    formula: "Caras con algo vendido y lugar para vender más: partes libres (entrepaños, puertas) o lo que no está comprometido de una cara por participación. Para administración, lo libre a tarifa al mes.",
    periodo: "Hoy.", comparacion: "—", umbral: "—", origen: "Contratos de las partes, la ocupación por participación y las tarifas." },
  { id: "cliente_principal", nombre: "Cliente principal", plata: false,
    formula: "El proveedor que más paga al mes en la sede (administración) o el que tiene más espacios con contrato vigente (quien no administra), con su parte del ingreso.",
    periodo: "Hoy.", comparacion: "—", umbral: "Avisa si tiene un contrato por vencer en 90 días.", origen: "Contratos de la base y cortes de ventas." },
  { id: "brecha", nombre: "Brecha del potencial", plata: true,
    formula: "Potencial a tarifa − canon del mes, partido por causa: caras sin contrato (a tarifa), capacidad libre en caras vendidas en parte (a tarifa) y el resto, precio y cobro (precios distintos a la tarifa, ventas sin cargar, contratos por empezar).",
    periodo: "Un mes, con la tarifa de hoy.", comparacion: "Cada causa como parte de la brecha.", umbral: "—", origen: "Contratos, ocupación por participación y tarifas." },
  { id: "pendientes", nombre: "Pendientes por fecha límite", plata: false,
    formula: "Lo de la bandeja de Pendientes: hoy, los próximos 30 días y lo que no cuadra.",
    periodo: "Hoy.", comparacion: "—", umbral: "Lo de hoy pide acción hoy.", origen: "La bandeja de Pendientes." },
];

export function metrica(id: string): Metrica | undefined {
  return METRICAS.find((m) => m.id === id);
}
