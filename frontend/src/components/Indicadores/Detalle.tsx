import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { aCsv, bajarCsv, contraLaMeta, pesos } from "../../utils/indicadores";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export interface DatosDelDetalle {
  esAdmin: boolean;
  sede: string;
  resultado: {
    canon: number | null; potencial: number | null;
    ocupacionPct: number; metaOcupacion: number;
    canonTarifa: number | null; metaCanonTarifa: number;
    sinFacturar: number | null;
  };
  /** Las próximas 13 semanas: lo que vence, renovado y sin renovar (al mes
   *  para administración; contado en contratos para el trabajador). */
  semanas: { desde: string; renovado: number; sinRenovar: number }[];
  /** Los próximos 90 días: cuántos espacios enteros quedan disponibles cada
   *  día (`null` mientras no se sabe). */
  disponiblesPorDia: number[] | null;
  porTipo: {
    tipo: string; espacios: number; contratados: number; ocupacionPct: number;
    diasEntre: number | null; canonTarifa: number | null; sinFacturar: number | null;
  }[];
  embudo: { empiezan: number; avisoEnviado: number; registrado: number; montado: number; verificado: number };
  pendientes: { hoy: number; dias30: number; corregir: number };
}

function corta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** Indicadores › Detalle (rediseño UX 2026-10, etapa 5): el tablero completo
 *  en cuatro bloques —resultado, lo que viene, por qué y operación—, cada uno
 *  con su lectura escrita al pie y su tabla para bajar. Arriba va la franja de
 *  siempre (las cinco cifras de Supervisar, `children`). */
export default function Detalle({ datos, children }: { datos: DatosDelDetalle; children?: ReactNode }) {
  const { esAdmin, resultado: r } = datos;
  const maxSemana = Math.max(1, ...datos.semanas.map((s) => s.renovado + s.sinRenovar));
  const sinRenovarTotal = datos.semanas.reduce((t, s) => t + s.sinRenovar, 0);
  const semanaPeor = datos.semanas.reduce<{ desde: string; v: number } | null>((p, s) => (!p || s.sinRenovar > p.v ? { desde: s.desde, v: s.sinRenovar } : p), null);
  const maxDia = Math.max(1, ...(datos.disponiblesPorDia ?? [0]));
  const peorTipo = [...datos.porTipo].sort((a, b) => a.ocupacionPct - b.ocupacionPct)[0];
  const e = datos.embudo;
  const pasos: [string, number][] = [
    ["Empiezan este mes", e.empiezan], ["Aviso de montaje enviado", e.avisoEnviado],
    ["Registrado", e.registrado], ["Montado", e.montado], ["Verificado", e.verificado],
  ];
  const bajarTipos = () => bajarCsv(`indicadores-${datos.sede}-por-tipo.csv`, aCsv(
    ["Tipo", "Espacios", "Contratados", "Ocupación %", "Días disponibles entre contratos", ...(esAdmin ? ["Canon ÷ tarifa %", "Sin facturar al mes"] : [])],
    datos.porTipo.map((t) => [t.tipo, t.espacios, t.contratados, t.ocupacionPct, t.diasEntre ?? "",
      ...(esAdmin ? [t.canonTarifa ?? "", t.sinFacturar ?? ""] : [])]),
  ));
  const bajarSemanas = () => bajarCsv(`indicadores-${datos.sede}-vence-por-semana.csv`, aCsv(
    ["Semana desde", esAdmin ? "Renovado (al mes)" : "Renovados", esAdmin ? "Sin renovar (al mes)" : "Sin renovar"],
    datos.semanas.map((s) => [s.desde, Math.round(s.renovado), Math.round(s.sinRenovar)]),
  ));
  return (
    <div data-detalle>
      {children}
      <div className="ind-detalle">
        <section className="ind-bloque" data-bloque="resultado">
          <h3>Resultado</h3>
          <table className="ind-tabla">
            <tbody>
              {esAdmin && r.canon !== null && <tr><td>Canon al mes</td><td className="n">{pesos(r.canon)}</td></tr>}
              {esAdmin && r.potencial !== null && <tr><td>Potencial a tarifa</td><td className="n">{pesos(r.potencial)}</td></tr>}
              <tr><td>Ocupación</td><td className="n">{r.ocupacionPct} % (meta {r.metaOcupacion} %)</td></tr>
              {esAdmin && r.canonTarifa !== null && <tr><td>Canon ÷ tarifa</td><td className="n">{r.canonTarifa} % (meta {r.metaCanonTarifa} %)</td></tr>}
              {esAdmin && r.sinFacturar !== null && <tr><td>Sin facturar por disponibles</td><td className="n">{pesos(r.sinFacturar)} al mes</td></tr>}
            </tbody>
          </table>
          <p className="ind-lectura">
            {contraLaMeta(r.ocupacionPct, r.metaOcupacion) === "ok"
              ? `La ocupación está en la meta (${r.ocupacionPct} %).`
              : `La ocupación está ${r.metaOcupacion - r.ocupacionPct} puntos bajo la meta.`}
            {esAdmin && r.canon !== null && r.potencial ? ` Se cobra el ${Math.round((r.canon / r.potencial) * 100)} % del potencial a tarifa.` : ""}
          </p>
        </section>

        <section className="ind-bloque" data-bloque="lo-que-viene">
          <h3>Lo que viene</h3>
          <p className="ind-nota" style={{ margin: "0 0 6px" }}>Lo que vence por semana (13 semanas)</p>
          <div className="ind-cols" role="img" aria-label="Lo que vence por semana: renovado y sin renovar">
            {datos.semanas.map((s) => (
              <div key={s.desde} className="c" title={`Semana del ${corta(s.desde)}: ${esAdmin ? `${pesos(s.sinRenovar)} sin renovar · ${pesos(s.renovado)} renovado` : `${s.sinRenovar} sin renovar · ${s.renovado} renovados`}`}>
                {s.sinRenovar > 0 && <i className="s" style={{ height: `${(s.sinRenovar / maxSemana) * 86}px` }} />}
                {s.renovado > 0 && <i className="r" style={{ height: `${(s.renovado / maxSemana) * 86}px` }} />}
              </div>
            ))}
          </div>
          {datos.disponiblesPorDia && (
            <>
              <p className="ind-nota" style={{ margin: "10px 0 6px" }}>Espacios enteros disponibles por día (90 días)</p>
              <div className="ind-cols" style={{ height: 60, gap: 1 }} role="img" aria-label="Espacios disponibles por día en los próximos 90 días">
                {datos.disponiblesPorDia.map((n, i) => (
                  <div key={i} className="c"><i className="d" style={{ height: `${(n / maxDia) * 56}px` }} /></div>
                ))}
              </div>
            </>
          )}
          <p className="ind-lectura">
            {sinRenovarTotal > 0 && semanaPeor
              ? `${esAdmin ? pesos(sinRenovarTotal) + " al mes vence" : sinRenovarTotal + " contratos vencen"} sin renovar en 13 semanas; la semana más cargada empieza el ${corta(semanaPeor.desde)}.`
              : "Nada vence sin renovar en las próximas 13 semanas."}
          </p>
          <button type="button" className="ind-csv" onClick={bajarSemanas}><Download {...ICONO} /> Bajar la tabla (CSV)</button>
        </section>

        <section className="ind-bloque" data-bloque="por-que">
          <h3>Por qué</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="ind-tabla">
              <thead>
                <tr>
                  <th>Tipo</th><th className="n">Espacios</th><th className="n">Contratados</th><th className="n">Ocupación</th>
                  <th className="n">Días entre contratos</th>
                  {esAdmin && <><th className="n">Canon ÷ tarifa</th><th className="n">Sin facturar</th></>}
                </tr>
              </thead>
              <tbody>
                {datos.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td>{t.tipo}</td><td className="n">{t.espacios}</td><td className="n">{t.contratados}</td>
                    <td className="n">{t.ocupacionPct} %{contraLaMeta(t.ocupacionPct, r.metaOcupacion) === "ok" ? "" : " ·  bajo la meta"}</td>
                    <td className="n">{t.diasEntre ?? "—"}</td>
                    {esAdmin && <><td className="n">{t.canonTarifa === null ? "—" : `${t.canonTarifa} %`}</td><td className="n">{t.sinFacturar === null ? "—" : pesos(t.sinFacturar)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ind-lectura">
            {peorTipo ? `El tipo con menos ocupación es ${peorTipo.tipo} (${peorTipo.ocupacionPct} %, ${peorTipo.contratados} de ${peorTipo.espacios}).` : "Sin espacios que se vendan."}
          </p>
          <button type="button" className="ind-csv" onClick={bajarTipos}><Download {...ICONO} /> Bajar la tabla (CSV)</button>
        </section>

        <section className="ind-bloque" data-bloque="operacion">
          <h3>Operación</h3>
          <ul className="ind-embudo">
            {pasos.map(([t, n]) => (
              <li key={t}><span>{t}</span><span className="b" style={{ width: `${e.empiezan ? (n / e.empiezan) * 100 : 0}%` }} /><b>{n}</b></li>
            ))}
          </ul>
          <p className="ind-nota" style={{ margin: "10px 0 0" }}>
            Pendientes: <b>{datos.pendientes.hoy}</b> para hoy · <b>{datos.pendientes.dias30}</b> en 30 días · <b>{datos.pendientes.corregir}</b> para corregir
          </p>
          <p className="ind-lectura">
            {e.empiezan === 0 ? "Ningún contrato empieza este mes."
              : `De ${e.empiezan} contrato${e.empiezan === 1 ? "" : "s"} que empieza${e.empiezan === 1 ? "" : "n"} este mes, ${e.montado} está${e.montado === 1 ? "" : "n"} montado${e.montado === 1 ? "" : "s"} y ${e.verificado} verificado${e.verificado === 1 ? "" : "s"}.`}
          </p>
        </section>
      </div>
    </div>
  );
}
