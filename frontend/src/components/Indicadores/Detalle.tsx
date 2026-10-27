import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Download, Table2, TriangleAlert } from "lucide-react";
import { aCsv, bajarCsv, contraLaMeta, pesos } from "../../utils/indicadores";
import {
  cambiosDeDisponibles, loQueSigue, porciento, repartoDelPotencial, titularDelDetalle,
  type PartesDelPotencial, type PuntoQueVence,
} from "../../utils/historiaDelDetalle";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export interface DatosDelDetalle {
  esAdmin: boolean;
  sede: string;
  /** Hoy, `YYYY-MM-DD` (Colombia). */
  hoy: string;
  resultado: {
    canon: number | null; potencial: number | null;
    ocupacionPct: number; metaOcupacion: number;
    canonTarifa: number | null; metaCanonTarifa: number;
    sinFacturar: number | null;
    /** Contratos de muebles sin tarifa: su canon cuenta como cobrado, pero no
     *  tienen contra qué compararse. */
    contratosSinTarifa: number;
  };
  /** Las próximas 13 semanas: lo que vence, renovado y sin renovar (al mes
   *  para administración; contado en contratos para el trabajador). */
  semanas: { desde: string; renovado: number; sinRenovar: number }[];
  /** Cada contrato que vence en 90 días (al mes para administración; 1 para
   *  el trabajador) y desde dónde se cuenta lo que sigue. */
  vencen: PuntoQueVence[];
  baseQueSigue: number;
  /** Los próximos 90 días: cuántos espacios enteros quedan disponibles cada
   *  día (`null` mientras no se sabe). */
  disponiblesPorDia: number[] | null;
  porTipo: {
    tipo: string; espacios: number; contratados: number; ocupacionPct: number;
    diasEntre: number | null; canonTarifa: number | null; sinFacturar: number | null;
    /** Canon al mes de sus contratos y lo que valen a tarifa todos sus
     *  espacios (administración). */
    canon: number | null; potencial: number | null;
  }[];
  embudo: { empiezan: number; avisoEnviado: number; registrado: number; montado: number; verificado: number };
  pendientes: { hoy: number; dias30: number; corregir: number };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function corta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** El ancho real del contenedor: los gráficos se dibujan en píxeles, sin
 *  escalar el `viewBox` (un rótulo de 11 px mide 11 px). */
function useAncho<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.floor(el.clientWidth));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** «Ver como tabla»: cada gráfico tiene su gemela legible sin color. */
function ConTabla({ tabla, children, onBajar }: { tabla: ReactNode; children: ReactNode; onBajar?: () => void }) {
  const [ver, setVer] = useState(false);
  return (
    <>
      {ver ? <div className="det-tabla-w">{tabla}</div> : children}
      <div className="det-acciones">
        <button type="button" className="ind-csv" aria-pressed={ver} onClick={() => setVer((v) => !v)}>
          <Table2 {...ICONO} /> {ver ? "Ver el gráfico" : "Ver como tabla"}
        </button>
        {onBajar && <button type="button" className="ind-csv" onClick={onBajar}><Download {...ICONO} /> Bajar (CSV)</button>}
      </div>
    </>
  );
}

/** Una barra del potencial: cobrado · perdido en precio · vacío · otro, con
 *  2 px de aire entre partes. `escala` es el total contra el que se mide el
 *  largo (para comparar filas). */
function BarraDelPotencial({ r, escala, alto = 28, etiqueta }: { r: PartesDelPotencial; escala: number; alto?: number; etiqueta: string }) {
  const partes = [
    { k: "cobrado", v: r.cobrado, t: "Cobrado" },
    { k: "precio", v: r.precio, t: "Por debajo de la tarifa" },
    { k: "vacio", v: r.vacio, t: "Vacío" },
  ].filter((p) => p.v > 0);
  const largo = escala > 0 ? (r.potencial / escala) * 100 : 0;
  return (
    <div className="det-barra" role="img" aria-label={etiqueta} style={{ width: `${Math.max(largo, 0.5)}%`, height: alto }}>
      {partes.map((p) => (
        <i key={p.k} className={`det-seg ${p.k}`} style={{ flexGrow: p.v }} title={`${p.t}: ${pesos(p.v)} al mes · ${porciento(p.v, r.potencial)}`} />
      ))}
    </div>
  );
}

/** Un gráfico de escalones (lo que sigue, los disponibles por día) con su
 *  eje de fechas, su eje de valores y la línea que sigue al mouse. */
function Escalones({ puntos, dias, hoy, formato, alto = 180, clase, marcas, etiqueta }: {
  puntos: { dia: number; valor: number }[]; dias: number; hoy: string;
  formato: (n: number) => string; alto?: number; clase: string;
  /** Los días que se marcan con un punto (las bajas). */
  marcas?: { dia: number; valor: number; texto: string }[];
  etiqueta: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [sobre, setSobre] = useState<number | null>(null);
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const izq = Math.min(112, Math.max(56, formato(max).length * 7 + 12));
  const W = Math.max(ancho, 240), H = alto, top = 12, bot = 26, der = 12;
  const x = (d: number) => izq + (d / dias) * (W - izq - der);
  const y = (v: number) => top + (1 - v / max) * (H - top - bot);
  let path = "";
  puntos.forEach((p, i) => {
    const sig = puntos[i + 1]?.dia ?? dias;
    path += `${i === 0 ? "M" : "L"}${x(p.dia)},${y(p.valor)} L${x(sig)},${y(p.valor)} `;
  });
  const area = `${path} L${x(dias)},${y(0)} L${x(0)},${y(0)} Z`;
  // Los rótulos de las fechas: hoy y el primero de cada mes, sin pisarse.
  const fechas: { dia: number; t: string }[] = [{ dia: 0, t: "hoy" }];
  for (let d = 1; d <= dias; d++) if (sumarDias(hoy, d).endsWith("-01")) fechas.push({ dia: d, t: `1 ${MESES[Number(sumarDias(hoy, d).slice(5, 7)) - 1]}` });
  const visibles = fechas.filter((f, i) => i === 0 || x(f.dia) - x(fechas[i - 1].dia) > 44);
  const valorEn = (d: number) => [...puntos].reverse().find((p) => p.dia <= d)?.valor ?? puntos[0].valor;
  return (
    <div ref={ref} className={`det-esc ${clase}`} style={{ height: H }}>
      {ancho > 0 && (
        <svg width={W} height={H} role="img" aria-label={etiqueta}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const d = Math.round(((px - izq) / (W - izq - der)) * dias);
            setSobre(d >= 0 && d <= dias ? d : null);
          }}
          onMouseLeave={() => setSobre(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={izq} x2={W - der} y1={y(max * f)} y2={y(max * f)} className="det-grid" />
              <text x={izq - 8} y={y(max * f)} className="det-eje" textAnchor="end" dominantBaseline="middle">{formato(max * f)}</text>
            </g>
          ))}
          {visibles.map((f) => (
            <text key={f.dia} x={Math.min(x(f.dia), W - der - 16)} y={H - 8} className="det-eje" textAnchor={f.dia === 0 ? "start" : "middle"}>{f.t}</text>
          ))}
          <path d={area} className="det-area" />
          <path d={path} className="det-linea" fill="none" />
          {(marcas ?? []).map((m, i) => (
            <circle key={i} cx={x(m.dia)} cy={y(m.valor)} r={5} className="det-marca"><title>{m.texto}</title></circle>
          ))}
          {sobre !== null && (() => {
            const v = valorEn(sobre);
            const tx = formato(v);
            const fx = `${sobre === 0 ? "hoy" : corta(sumarDias(hoy, sobre))} · ${tx}`;
            const bw = fx.length * 6.6 + 16;
            const bx = Math.min(Math.max(x(sobre) - bw / 2, izq), W - der - bw);
            return (
              <g pointerEvents="none">
                <line x1={x(sobre)} x2={x(sobre)} y1={top} y2={H - bot} className="det-cruz" />
                <circle cx={x(sobre)} cy={y(v)} r={4} className="det-punto" />
                <rect x={bx} y={2} width={bw} height={20} rx={6} className="det-globo" />
                <text x={bx + bw / 2} y={12} textAnchor="middle" dominantBaseline="middle" className="det-globo-t">{fx}</text>
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

/**
 * Indicadores › Detalle, contado como una historia (2026-10-27): un titular y
 * cuatro preguntas, cada una con el gráfico que la contesta, su lectura y su
 * tabla. «¿Dónde está la plata que no entra?» (todo lo que se podría cobrar a
 * tarifa, partido), «¿Qué tipo de mueble pesa más?» (la misma barra por tipo),
 * «¿Qué pasa en las próximas semanas?» (lo que sigue entrando si nadie
 * renueva, y los disponibles por día) y «¿Se monta lo que se vende?» (el
 * embudo). Arriba va la franja de siempre (`children`). El trabajador no ve
 * plata: sus capítulos cuentan espacios y contratos.
 */
export default function Detalle({ datos, children }: { datos: DatosDelDetalle; children?: ReactNode }) {
  const { esAdmin, resultado: r } = datos;

  const reparto = useMemo(() => (esAdmin && r.potencial !== null && r.canon !== null
    ? repartoDelPotencial({ potencial: r.potencial, cobrado: r.canon, vacio: r.sinFacturar ?? 0 })
    : null), [esAdmin, r.potencial, r.canon, r.sinFacturar]);

  const tipos = useMemo(() => datos.porTipo.map((t) => {
    const rep = esAdmin && t.canon !== null && t.potencial !== null
      ? repartoDelPotencial({ potencial: t.potencial, cobrado: t.canon, vacio: t.sinFacturar ?? 0 })
      : null;
    return { ...t, rep, perdido: rep ? rep.precio + rep.vacio : t.espacios - t.contratados };
  }).sort((a, b) => b.perdido - a.perdido || b.espacios - a.espacios), [datos.porTipo, esAdmin]);
  const escalaTipos = Math.max(1, ...tipos.map((t) => (t.rep ? t.rep.potencial : t.espacios)));

  const sinRenovar = datos.vencen.filter((p) => !p.renovado && p.dias <= 91);
  const renovados = datos.vencen.filter((p) => p.renovado && p.dias <= 91);
  const sigue = loQueSigue(datos.baseQueSigue, datos.vencen, 91);
  const alFinal = sigue[sigue.length - 1].valor;
  const fmt = (n: number) => (esAdmin ? pesos(n) : String(Math.round(n)));
  const marcas = sigue.slice(1).map((p) => ({
    dia: p.dia, valor: p.valor,
    texto: `${corta(sumarDias(datos.hoy, p.dia - 1))}: vence ${sinRenovar.filter((v) => v.dias + 1 === p.dia).map((v) => v.codigo).join(", ")}`,
  }));
  const cambios = datos.disponiblesPorDia ? cambiosDeDisponibles(datos.disponiblesPorDia) : [];
  const grandes = [...cambios].sort((a, b) => Math.abs(b.despues - b.antes) - Math.abs(a.despues - a.antes)).slice(0, 3).sort((a, b) => a.dia - b.dia);

  const titular = titularDelDetalle({
    sede: datos.sede, esAdmin, reparto, canonTotal: r.canon,
    ocupacionPct: r.ocupacionPct, metaOcupacion: r.metaOcupacion,
    sinRenovar13: sinRenovar.reduce((t, p) => t + p.alMes, 0), contratosQueVencen13: sinRenovar.length, pesos,
  });

  const e = datos.embudo;
  const pasos: [string, number][] = [
    ["Empiezan este mes", e.empiezan], ["Aviso de montaje enviado", e.avisoEnviado],
    ["Registrado", e.registrado], ["Montado", e.montado], ["Verificado", e.verificado],
  ];
  // El mayor freno: el paso donde más contratos se quedan (no el primero que baja).
  const caida = pasos.reduce((m, [, n], i) => (i > 0 && pasos[i - 1][1] - n > (m > 0 ? pasos[m - 1][1] - pasos[m][1] : 0) ? i : m), -1);

  const bajarTipos = () => bajarCsv(`indicadores-${datos.sede}-por-tipo.csv`, aCsv(
    ["Tipo", "Espacios", "Contratados", "Ocupación %", "Días disponibles entre contratos", ...(esAdmin ? ["Canon ÷ tarifa %", "Cobrado al mes", "Bajo la tarifa al mes", "Vacío a tarifa al mes"] : [])],
    tipos.map((t) => [t.tipo, t.espacios, t.contratados, t.ocupacionPct, t.diasEntre ?? "",
      ...(esAdmin ? [t.canonTarifa ?? "", Math.round(t.rep?.cobrado ?? 0), Math.round(t.rep?.precio ?? 0), Math.round(t.rep?.vacio ?? 0)] : [])]),
  ));
  const bajarSemanas = () => bajarCsv(`indicadores-${datos.sede}-vence-por-semana.csv`, aCsv(
    ["Semana desde", esAdmin ? "Renovado (al mes)" : "Renovados", esAdmin ? "Sin renovar (al mes)" : "Sin renovar"],
    datos.semanas.map((s) => [s.desde, Math.round(s.renovado), Math.round(s.sinRenovar)]),
  ));

  return (
    <div data-detalle>
      {children}

      <div className="det-titular" data-titular>
        {titular.map((f, i) => <p key={i} className={i === 0 ? "uno" : undefined}>{f}</p>)}
      </div>

      {reparto && (
        <section className="ind-bloque det-cap" data-bloque="donde-va">
          <h3>¿Dónde está la plata que no entra?</h3>
          <p className="det-sub">Todo lo que {datos.sede} podría cobrar al mes a tarifa: {pesos(reparto.potencial)}.</p>
          <ConTabla tabla={
            <table className="ind-tabla">
              <tbody>
                <tr><td>Se cobra (canon al mes)</td><td className="n">{pesos(reparto.cobrado)}</td><td className="n">{porciento(reparto.cobrado, reparto.potencial)}</td></tr>
                <tr><td>Se cobra por debajo de la tarifa</td><td className="n">{pesos(reparto.precio)}</td><td className="n">{porciento(reparto.precio, reparto.potencial)}</td></tr>
                <tr><td>Espacios vacíos, a tarifa</td><td className="n">{pesos(reparto.vacio)}</td><td className="n">{porciento(reparto.vacio, reparto.potencial)}</td></tr>
                <tr><td><b>Potencial a tarifa</b></td><td className="n"><b>{pesos(reparto.potencial)}</b></td><td className="n">100 %</td></tr>
              </tbody>
            </table>
          }>
            <BarraDelPotencial r={reparto} escala={reparto.potencial} alto={36} etiqueta={`De ${pesos(reparto.potencial)} posibles se cobran ${pesos(reparto.cobrado)}`} />
            <ul className="det-leyenda">
              {([["cobrado", "Se cobra", reparto.cobrado], ["precio", "Se cobra por debajo de la tarifa", reparto.precio], ["vacio", "Vale a tarifa lo vacío", reparto.vacio]] as const)
                .filter(([, , v]) => v > 0)
                .map(([k, t, v]) => (
                  <li key={k}><i className={`det-seg ${k}`} /><span><b>{pesos(v)}</b> · {porciento(v, reparto.potencial)}<small>{t}</small></span></li>
                ))}
            </ul>
          </ConTabla>
          <p className="ind-lectura">
            {reparto.precio >= reparto.vacio && reparto.precio > 0
              ? `El hueco más grande es el precio: lo alquilado se cobra ${pesos(reparto.precio)} al mes por debajo de lo que vale a tarifa. Revisá si las tarifas están al día o si se está regalando espacio.`
              : reparto.vacio > 0
                ? `El hueco más grande son los espacios vacíos: alquilarlos a tarifa suma ${pesos(reparto.vacio)} al mes.`
                : "Todo lo que se puede alquilar está alquilado a tarifa."}
            {reparto.sobreTarifa > 0 ? ` Algunos contratos se cobran ${pesos(reparto.sobreTarifa)} por encima de la tarifa.` : ""}
            {r.contratosSinTarifa > 0 ? ` Hay ${r.contratosSinTarifa} contrato${r.contratosSinTarifa === 1 ? "" : "s"} en muebles sin tarifa: su canon cuenta como cobrado; con tarifa, la cuenta sería más precisa.` : ""}
          </p>
        </section>
      )}

      <section className="ind-bloque det-cap" data-bloque="por-tipo">
        <h3>¿Qué tipo de mueble pesa más?</h3>
        <p className="det-sub">{esAdmin ? "La misma barra por tipo, del que más plata deja afuera al que menos." : "Cada tipo con lo contratado y lo disponible, del que más tiene libre al que menos."}</p>
        <ConTabla onBajar={bajarTipos} tabla={
          <table className="ind-tabla">
            <thead><tr><th>Tipo</th><th className="n">Espacios</th><th className="n">Contratados</th><th className="n">Ocupación</th><th className="n">Días entre contratos</th>
              {esAdmin && <><th className="n">Canon ÷ tarifa</th><th className="n">Bajo la tarifa</th><th className="n">Vacío a tarifa</th></>}</tr></thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.tipo}><td>{t.tipo}</td><td className="n">{t.espacios}</td><td className="n">{t.contratados}</td><td className="n">{t.ocupacionPct} %</td><td className="n">{t.diasEntre ?? "—"}</td>
                  {esAdmin && <><td className="n">{t.canonTarifa === null ? "—" : `${t.canonTarifa} %`}</td><td className="n">{pesos(t.rep?.precio ?? 0)}</td><td className="n">{pesos(t.rep?.vacio ?? 0)}</td></>}</tr>
              ))}
            </tbody>
          </table>
        }>
          <ul className="det-tipos">
            {tipos.map((t) => {
              const enMeta = contraLaMeta(t.ocupacionPct, r.metaOcupacion) === "ok";
              return (
                <li key={t.tipo} data-tipo={t.tipo}>
                  <div className="det-tipo-n">
                    <b>{t.tipo}</b>
                    <small className={enMeta ? "ok" : "bajo"}>
                      {enMeta ? <CircleCheck {...ICONO} /> : <TriangleAlert {...ICONO} />}
                      {t.contratados} de {t.espacios} contratados · {t.ocupacionPct} %
                    </small>
                  </div>
                  <div className="det-tipo-b">
                    {t.rep ? <BarraDelPotencial r={t.rep} escala={escalaTipos} alto={18} etiqueta={`${t.tipo}: deja afuera ${pesos(t.perdido)} al mes`} />
                      : (
                        <div className="det-barra" style={{ width: `${(t.espacios / escalaTipos) * 100}%`, height: 18 }} role="img" aria-label={`${t.tipo}: ${t.contratados} contratados de ${t.espacios}`}>
                          {t.contratados > 0 && <i className="det-seg cobrado" style={{ flexGrow: t.contratados }} title={`Contratados: ${t.contratados}`} />}
                          {t.espacios - t.contratados > 0 && <i className="det-seg vacio" style={{ flexGrow: t.espacios - t.contratados }} title={`Disponibles: ${t.espacios - t.contratados}`} />}
                        </div>
                      )}
                  </div>
                  <div className="det-tipo-v">{esAdmin ? <><b>{pesos(t.perdido)}</b><small>afuera al mes</small></> : <><b>{t.espacios - t.contratados}</b><small>disponibles</small></>}</div>
                </li>
              );
            })}
          </ul>
          <ul className="det-leyenda chica">
            <li><i className="det-seg cobrado" /><span>{esAdmin ? "Se cobra" : "Contratado"}</span></li>
            {esAdmin && <li><i className="det-seg precio" /><span>Bajo la tarifa</span></li>}
            <li><i className="det-seg vacio" /><span>{esAdmin ? "Vacío" : "Disponible"}</span></li>
          </ul>
        </ConTabla>
        <p className="ind-lectura">
          {tipos[0] && tipos[0].perdido > 0
            ? esAdmin
              ? `${tipos[0].tipo} es el que más deja afuera: ${pesos(tipos[0].perdido)} al mes${tipos[0].rep ? ` (${pesos(tipos[0].rep.precio)} por cobrar bajo la tarifa y ${pesos(tipos[0].rep.vacio)} en espacios vacíos)` : ""}.`
              : `${tipos[0].tipo} es el que más tiene libre: ${tipos[0].espacios - tipos[0].contratados} de ${tipos[0].espacios}.`
            : "Ningún tipo deja espacio ni plata afuera."}
        </p>
      </section>

      <div className="det-dos">
        <section className="ind-bloque det-cap" data-bloque="lo-que-viene">
          <h3>¿Qué pasa en las próximas semanas?</h3>
          <p className="det-sub">{esAdmin ? "El canon al mes que sigue entrando si no se renueva ni se vende nada." : "Los contratos que siguen corriendo si no se renueva nada."}</p>
          <ConTabla onBajar={bajarSemanas} tabla={
            <table className="ind-tabla">
              <thead><tr><th>Vence</th><th>Espacio</th><th className="n">{esAdmin ? "Al mes" : ""}</th><th>Estado</th></tr></thead>
              <tbody>
                {[...sinRenovar, ...renovados].sort((a, b) => a.dias - b.dias).map((p) => (
                  <tr key={`${p.codigo}-${p.dias}`}><td>{corta(sumarDias(datos.hoy, p.dias))}</td><td className="mono">{p.codigo}</td><td className="n">{esAdmin ? pesos(p.alMes) : ""}</td><td>{p.renovado ? "renovado" : "sin renovar"}</td></tr>
                ))}
              </tbody>
            </table>
          }>
            <Escalones puntos={sigue} dias={91} hoy={datos.hoy} formato={fmt} clase="sigue" marcas={marcas}
              etiqueta={`Hoy ${fmt(datos.baseQueSigue)}; en 13 semanas, sin renovar nada, ${fmt(alFinal)}`} />
            {sinRenovar.length > 0 && (
              <ul className="det-vencen">
                {sinRenovar.slice(0, 5).map((p) => (
                  <li key={`${p.codigo}-${p.dias}`}><span>{corta(sumarDias(datos.hoy, p.dias))}</span><b className="mono">{p.codigo}</b>{esAdmin && <span className="n">{pesos(p.alMes)}</span>}</li>
                ))}
                {sinRenovar.length > 5 && <li className="mas">y {sinRenovar.length - 5} más (en la tabla)</li>}
              </ul>
            )}
          </ConTabla>
          <p className="ind-lectura">
            {sinRenovar.length === 0
              ? "Nada vence sin renovar en las próximas 13 semanas."
              : `Si no se renueva nada, en 13 semanas ${esAdmin ? `el canon baja de ${pesos(datos.baseQueSigue)} a ${pesos(alFinal)} al mes` : `quedan ${alFinal} de ${datos.baseQueSigue} contratos`}.`}
            {renovados.length > 0 ? ` ${renovados.length} ya ${renovados.length === 1 ? "tiene" : "tienen"} el contrato siguiente.` : ""}
          </p>

          {datos.disponiblesPorDia && (
            <>
              <h4 className="det-h4">Espacios enteros disponibles, día a día (90 días)</h4>
              <Escalones puntos={datos.disponiblesPorDia.map((v, dia) => ({ dia, valor: v })).filter((p, i, a) => i === 0 || p.valor !== a[i - 1].valor)}
                dias={90} hoy={datos.hoy} formato={(n) => String(Math.round(n))} alto={130} clase="disp"
                etiqueta={`Hoy ${datos.disponiblesPorDia[0]} disponibles; en 90 días ${datos.disponiblesPorDia[datos.disponiblesPorDia.length - 1]}`} />
              <p className="ind-lectura">
                Hoy hay {datos.disponiblesPorDia[0]} disponibles.
                {grandes.length ? " " + grandes.map((c) => `El ${corta(sumarDias(datos.hoy, c.dia))} ${c.despues > c.antes ? `se liberan ${c.despues - c.antes}` : `se ocupan ${c.antes - c.despues}`} (quedan ${c.despues}).`).join(" ") : " No cambia en 90 días."}
              </p>
            </>
          )}
        </section>

        <section className="ind-bloque det-cap" data-bloque="operacion">
          <h3>¿Se monta lo que se vende?</h3>
          <p className="det-sub">Los contratos que empiezan este mes, paso a paso hasta verificar el montaje.</p>
          <ol className="det-embudo">
            {pasos.map(([t, n], i) => (
              <li key={t} data-cae={i === caida || undefined}>
                <span className="t">{t}</span>
                <span className="b"><i style={{ width: `${e.empiezan ? (n / e.empiezan) * 100 : 0}%` }} /></span>
                <b>{n}</b>
                <small>{i === 0 || !pasos[i - 1][1] ? "" : porciento(n, pasos[i - 1][1])}</small>
              </li>
            ))}
          </ol>
          <p className="ind-lectura">
            {e.empiezan === 0 ? "Ningún contrato empieza este mes."
              : caida > 0 ? `El mayor freno está en «${pasos[caida][0]}»: de ${pasos[caida - 1][1]}, ${pasos[caida - 1][1] - pasos[caida][1]} no ${pasos[caida - 1][1] - pasos[caida][1] === 1 ? "llegó" : "llegaron"} a ese paso.`
                : `Los ${e.empiezan} contratos del mes están montados y verificados.`}
            {" "}Pendientes: {datos.pendientes.hoy} para hoy · {datos.pendientes.dias30} en 30 días · {datos.pendientes.corregir} para corregir.
          </p>
        </section>
      </div>
    </div>
  );
}
