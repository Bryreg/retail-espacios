import { useId, useState, type ReactNode } from "react";
import {
  AlarmClock, Banknote, CircleDashed, CircleHelp, Gauge, Hammer, ListChecks, PieChart,
  TrendingDown, TrendingUp, TriangleAlert, CircleCheck,
} from "lucide-react";
import {
  contraLaMeta, metrica, pesos, textoContraLaMeta,
  type EstadoDeMontaje, type PuntoQueVence,
} from "../../utils/indicadores";
import type { FilaDeHoy } from "../Inicio/Inicio";
import "./indicadores.css";

/**
 * Indicadores › Resumen (rediseño UX 2026-10, etapa 5): cómo va la sede y qué
 * hacer hoy, en siete tarjetas, sin desplazarse. Cada una lleva su «?» con la
 * definición del diccionario y lleva a donde se resuelve.
 *
 * No calcula: todo le llega de la pantalla comercial (`DashboardView`), que es
 * la que ya cuenta para el resto. El estado contra la meta se dice con ícono y
 * texto, nunca sólo con color. La plata, entera. Quien no administra no ve
 * plata: su versión cuenta espacios.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export type PeriodoDelResumen = "hoy" | "mes" | "anio";

export interface DatosDelResumen {
  esAdmin: boolean;
  sede: string;
  meta: { ocupacion: number; canon_tarifa: number };
  metaPropuesta: boolean;
  /** Plata (sólo administración). */
  canon: {
    hoy: number;
    /** El devengado de cada mes, del más viejo al actual (24 meses). */
    serie: number[];
    meses: string[];
    potencial: number;
  } | null;
  ocupacion: { pct: number; ocupadas: number; total: number; cuadros: { clave: string; codigo: string; ocupada: boolean }[] };
  canonTarifa: { pct: number | null; contadas: number; sinTarifa: number } | null;
  hoy: { cuenta: number; filas: FilaDeHoy[] };
  vence: { puntos: PuntoQueVence[]; sinRenovar: number; total: number };
  montajes: { total: number; enLaTienda: number; porEstado: Record<EstadoDeMontaje, number> };
  disponibles: { codigos: { codigo: string; dias: number | null }[]; sinFacturar: number | null;
    /** Se sabe desde cuándo están libres (el historial; sólo administración). */
    conHistorial: boolean };
}

function Ayuda({ id }: { id: string }) {
  const m = metrica(id);
  const [abierta, setAbierta] = useState(false);
  const idDef = useId();
  if (!m) return null;
  return (
    <span className="ind-ayuda">
      <button type="button" aria-expanded={abierta} aria-controls={idDef} aria-label={`Qué es «${m.nombre}»`}
        onClick={() => setAbierta((v) => !v)} title="Qué cuenta esta cifra">
        <CircleHelp {...ICONO} />
      </button>
      {abierta && (
        <span className="ind-def" id={idDef} role="note">
          <b>{m.nombre}</b>
          <span>{m.formula}</span>
          <span><i>Periodo:</i> {m.periodo}</span>
          <span><i>Se compara:</i> {m.comparacion}</span>
        </span>
      )}
    </span>
  );
}

function Tarjeta({ id, icono, titulo, children, accion, ancha = false, alta = false }: {
  id: string; icono: ReactNode; titulo: string; children: ReactNode;
  accion?: { texto: string; onClick: () => void }; ancha?: boolean; alta?: boolean;
}) {
  return (
    <section className={"ind-tarjeta" + (ancha ? " ancha" : "") + (alta ? " alta" : "")} data-tarjeta={id}>
      <header>
        <h3>{icono}{titulo}</h3>
        <Ayuda id={id} />
      </header>
      <div className="cuerpo">{children}</div>
      {accion && <button type="button" className="ind-link" onClick={accion.onClick}>{accion.texto}</button>}
    </section>
  );
}

function ContraMeta({ valor, meta }: { valor: number; meta: number }) {
  const e = contraLaMeta(valor, meta);
  return (
    <span className={"ind-meta " + e} data-contra-meta={e}>
      {e === "ok" ? <CircleCheck {...ICONO} /> : <TriangleAlert {...ICONO} />}
      {textoContraLaMeta(valor, meta)}
    </span>
  );
}

/** La curva del canon: cada mes un punto; la línea punteada es el potencial
 *  a la tarifa de hoy. */
function Curva({ valores, potencial, meses }: { valores: number[]; potencial: number; meses: string[] }) {
  const W = 320, H = 70, P = 4;
  const max = Math.max(potencial, ...valores, 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, valores.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="ind-curva" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Canon de ${meses[0] ?? ""} a ${meses[meses.length - 1] ?? ""}: ${valores.map((v) => pesos(v)).join(", ")}`}>
      {potencial > 0 && <line x1={P} x2={W - P} y1={y(potencial)} y2={y(potencial)} className="pot" />}
      <polyline points={puntos} className="lin" />
      {valores.map((v, i) => <circle key={meses[i] ?? i} cx={x(i)} cy={y(v)} r={i === valores.length - 1 ? 3.5 : 2} className="pun" />)}
    </svg>
  );
}

function nombreDelMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

export default function Resumen({ datos, periodo, onPeriodo, onTabla, onPendientes, onMontajes, onDisponibles, onPlano }: {
  datos: DatosDelResumen;
  periodo: PeriodoDelResumen;
  onPeriodo: (p: PeriodoDelResumen) => void;
  onTabla: () => void;
  onPendientes: () => void;
  onMontajes: () => void;
  onDisponibles: () => void;
  onPlano: () => void;
}) {
  const { esAdmin, meta } = datos;
  const c = datos.canon;
  const ult = c ? c.serie.length - 1 : -1;
  // El canon según el periodo: hoy (lo vigente al mes), el mes en curso (lo
  // devengado, contra el anterior) o los últimos 12 meses (contra los 12 de
  // antes).
  const canonDelPeriodo = !c ? null : periodo === "hoy"
    ? { valor: c.hoy, antes: null as number | null, nota: "al mes · lo vigente hoy" }
    : periodo === "mes"
    ? { valor: c.serie[ult] ?? 0, antes: ult > 0 ? c.serie[ult - 1] : null, nota: `devengado en ${nombreDelMes(c.meses[ult])}` }
    : { valor: c.serie.slice(-12).reduce((a, b) => a + b, 0),
      antes: c.serie.length >= 24 ? c.serie.slice(-24, -12).reduce((a, b) => a + b, 0) : null,
      nota: "devengado en los últimos 12 meses" };
  const delta = canonDelPeriodo && canonDelPeriodo.antes ? Math.round(((canonDelPeriodo.valor - canonDelPeriodo.antes) / canonDelPeriodo.antes) * 1000) / 10 : null;
  const pctPotencial = c && c.potencial > 0 ? Math.round((c.hoy / c.potencial) * 100) : null;
  const m = datos.montajes;
  const totalMontajes = Math.max(1, m.total);
  return (
    <div className="ind-resumen" data-resumen>
      <div className="ind-periodo" role="group" aria-label="Periodo">
        {([["hoy", "Hoy"], ["mes", "Mes"], ["anio", "Últimos 12 meses"]] as const).map(([p, t]) => (
          <button key={p} type="button" aria-pressed={periodo === p} onClick={() => onPeriodo(p)}>{t}</button>
        ))}
        {datos.metaPropuesta && esAdmin && <span className="ind-nota">Metas propuestas (90 % y 95 %): se cambian en Ajustes.</span>}
      </div>
      <div className="ind-grilla">
        {esAdmin && c && canonDelPeriodo && (
          <Tarjeta id="canon" icono={<Banknote {...ICONO} />} titulo="Canon mensual contratado" ancha
            accion={{ texto: "Ver la tabla de contratos", onClick: onTabla }}>
            <div className="valor" data-valor-canon>{pesos(canonDelPeriodo.valor)}</div>
            <p className="nota">
              {canonDelPeriodo.nota}
              {delta !== null && (
                <span className={"delta " + (delta >= 0 ? "sube" : "baja")}>
                  {delta >= 0 ? <TrendingUp {...ICONO} /> : <TrendingDown {...ICONO} />}
                  {delta >= 0 ? "+" : ""}{delta.toLocaleString("es-CO")} % {periodo === "anio" ? "contra los 12 meses anteriores" : "contra el mes anterior"}
                </span>
              )}
            </p>
            {pctPotencial !== null && <p className="nota">{pctPotencial} % del potencial a tarifa ({pesos(c.potencial)} al mes)</p>}
            <Curva valores={c.serie.slice(-12)} potencial={c.potencial} meses={c.meses.slice(-12)} />
            <p className="leyenda"><i className="l lin" /> canon de cada mes <i className="l pot" /> potencial a la tarifa de hoy</p>
          </Tarjeta>
        )}
        <Tarjeta id="ocupacion" icono={<PieChart {...ICONO} />} titulo="Ocupación"
          accion={{ texto: "Ver en el plano", onClick: onPlano }}>
          <div className="valor">{datos.ocupacion.pct} %</div>
          <p className="nota">{datos.ocupacion.ocupadas} de {datos.ocupacion.total} caras trabajan hoy</p>
          <ContraMeta valor={datos.ocupacion.pct} meta={meta.ocupacion} />
          <div className="ind-cuadros" aria-hidden>
            {datos.ocupacion.cuadros.map((q) => <i key={q.clave} className={q.ocupada ? "o" : "l"} title={`${q.codigo} · ${q.ocupada ? "trabaja" : "disponible"}`} />)}
          </div>
        </Tarjeta>
        {esAdmin && datos.canonTarifa && (
          <Tarjeta id="canon_tarifa" icono={<Gauge {...ICONO} />} titulo="Canon ÷ tarifa"
            accion={{ texto: "Ver la tabla de contratos", onClick: onTabla }}>
            <div className="valor">{datos.canonTarifa.pct === null ? "—" : `${datos.canonTarifa.pct} %`}</div>
            <p className="nota">{datos.canonTarifa.contadas} contrato{datos.canonTarifa.contadas === 1 ? "" : "s"} con tarifa{datos.canonTarifa.sinTarifa > 0 ? ` · ${datos.canonTarifa.sinTarifa} sin tarifa, afuera` : ""}</p>
            {datos.canonTarifa.pct !== null && (
              <>
                <ContraMeta valor={datos.canonTarifa.pct} meta={meta.canon_tarifa} />
                <div className="ind-barra" aria-hidden>
                  <i className="v" style={{ width: `${Math.min(100, datos.canonTarifa.pct / 1.2)}%` }} />
                  <i className="m" style={{ left: `${meta.canon_tarifa / 1.2}%` }} />
                </div>
              </>
            )}
          </Tarjeta>
        )}
        <Tarjeta id="pendientes" icono={<ListChecks {...ICONO} />} titulo="Para hacer hoy"
          accion={{ texto: "Ver los pendientes", onClick: onPendientes }}>
          <div className="valor">{datos.hoy.cuenta}</div>
          {datos.hoy.filas.length === 0 ? <p className="nota">Nada con fecha límite hoy.</p> : (
            <ul className="ind-hoy">
              {datos.hoy.filas.slice(0, 3).map((f) => (
                <li key={f.clave}>
                  <span><b>{f.titulo}</b>{f.codigo ? ` · ${f.codigo}` : ""}</span>
                  <button type="button" className="ind-btn" onClick={f.accion.onClick}>{f.accion.texto}</button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta id="vence_90" icono={<AlarmClock {...ICONO} />} titulo="Vence en 90 días"
          accion={{ texto: "Ver cuáles", onClick: onTabla }}>
          {/* Quien no administra no sabe qué se renovó (el próximo contrato
              es de administración): ve cuántos vencen, sin «sin renovar». */}
          <div className="valor">{esAdmin ? pesos(datos.vence.sinRenovar) : String(datos.vence.puntos.length)}</div>
          <p className="nota">
            {esAdmin
              ? `al mes, sin renovar · ${datos.vence.puntos.length} vence${datos.vence.puntos.length === 1 ? "" : "n"} en total`
              : `contrato${datos.vence.puntos.length === 1 ? "" : "s"} vence${datos.vence.puntos.length === 1 ? "" : "n"} en 90 días`}
          </p>
          <div className="ind-eje" role="img" aria-label={`${datos.vence.puntos.length} contratos vencen en 90 días`}>
            {datos.vence.puntos.map((p) => (
              <i key={`${p.codigo}-${p.dias}`} className={!esAdmin ? "r" : p.renovado ? "r" : "s"} style={{ left: `${(p.dias / 90) * 100}%` }}
                title={`${p.codigo} · vence en ${p.dias} día${p.dias === 1 ? "" : "s"}${!esAdmin ? "" : p.renovado ? " · renovado" : " · sin renovar"}`} />
            ))}
            <span className="e0">hoy</span><span className="e1">90 días</span>
          </div>
        </Tarjeta>
        <Tarjeta id="montajes" icono={<Hammer {...ICONO} />} titulo="Montajes del mes"
          accion={{ texto: "Ver montajes", onClick: onMontajes }}>
          <div className="valor">{m.enLaTienda} de {m.total}</div>
          <p className="nota">en la tienda, de los contratos que empiezan este mes</p>
          <div className="ind-estados" aria-hidden>
            {(["verificado", "sin_verificar", "sin_montar", "no_realizado"] as const).map((e) =>
              m.porEstado[e] > 0 ? <i key={e} className={e} style={{ width: `${(m.porEstado[e] / totalMontajes) * 100}%` }} /> : null)}
          </div>
          <p className="leyenda">
            {m.porEstado.verificado} verificado{m.porEstado.verificado === 1 ? "" : "s"} · {m.porEstado.sin_verificar} sin verificar · {m.porEstado.sin_montar} sin montar · {m.porEstado.no_realizado} no realizado{m.porEstado.no_realizado === 1 ? "" : "s"}
          </p>
        </Tarjeta>
        <Tarjeta id="sin_facturar" icono={<CircleDashed {...ICONO} />} titulo="Disponibles hoy"
          accion={{ texto: "Contratar estos espacios", onClick: onDisponibles }}>
          <div className="valor">{datos.disponibles.codigos.length}</div>
          {esAdmin && datos.disponibles.sinFacturar !== null && (
            <p className="nota">{pesos(datos.disponibles.sinFacturar)} al mes sin facturar, a tarifa</p>
          )}
          <ul className="ind-libres">
            {datos.disponibles.codigos.slice(0, 5).map((d) => (
              <li key={d.codigo}>
                <span className="mono">{d.codigo}</span>
                {datos.disponibles.conHistorial && (
                  <span>{d.dias === null ? "nunca tuvo contrato" : `${d.dias} día${d.dias === 1 ? "" : "s"} sin contrato`}</span>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
