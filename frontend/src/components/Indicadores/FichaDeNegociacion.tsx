import { pesos } from "../../utils/indicadores";
import type { EspacioDelMapa } from "../../utils/mapaDeDecision";

/**
 * LA FICHA DE NEGOCIACIÓN: «Preparar propuesta» de un espacio con algo por
 * vender (Indicadores › Mapa de oportunidades y Análisis).
 *
 * Contesta las tres preguntas de la mesa —qué hay libre, cuánto vale y con
 * quién conviene hablar— con lo que la pantalla ya sabe: los contratos de la
 * cara, la tarifa de referencia y lo que vence en la sede. La propuesta se arma
 * en Contratos, con el espacio ya elegido: ahí se genera la lámina, se reserva
 * o se registra el contrato. Sólo administración: es todo plata.
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const corta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

export interface FichaDeNegociacionProps {
  espacio: EspacioDelMapa;
  espacios: EspacioDelMapa[];
  /** Lo que paga cada cliente al mes en la sede. */
  cartera: { nombre: string; alMes: number | null }[];
  canon: number | null;
  onContratar: () => void;
  onFicha: () => void;
}

export default function FichaDeNegociacion({ espacio: e, espacios, cartera, canon, onContratar, onFicha }: FichaDeNegociacionProps) {
  const vigentes = e.contratos;
  const vendido = e.estado === "libre" ? 0 : e.vendido;
  const libre = e.libreAlMes ?? 0;
  const pctLibre = vendido !== null ? Math.round((1 - vendido) * 100) : null;
  const renuevan = espacios.filter((o) => o.vence && o.vence.proveedor && o.clave !== e.clave);
  const presentes = e.clientes;
  const vecina = espacios.find((o) => o.fixtureId === e.fixtureId && o.clave !== e.clave && o.clientes.length);
  const recomendacion = (() => {
    for (const c of presentes) {
      const r = renuevan.find((o) => o.vence!.proveedor === c);
      if (r) return <><b>Recomendación:</b> negociar en conjunto con {c} la renovación de {r.vence!.codigo} y la ampliación en {e.codigo}: <b>{pesos((r.vence!.alMes ?? 0) + libre)} al mes</b>.</>;
    }
    if (presentes.length) return <><b>Recomendación:</b> ofrecer {pctLibre !== null ? `el ${pctLibre} % libre` : "lo libre"} a {presentes.length === 1 ? presentes[0] : `uno de los ${presentes.length} clientes presentes`}: <b>{pesos(libre)} al mes</b> a tarifa.</>;
    if (vecina) {
      const r = vecina.vence && vecina.vence.proveedor === vecina.clientes[0] ? `, que renueva el ${corta(vecina.vence.fecha)}` : "";
      return <><b>Recomendación:</b> ofrecer {e.codigo} a {vecina.clientes[0]}, que ya está en {vecina.codigo}{r}: <b>{pesos(libre)} al mes</b> a tarifa.</>;
    }
    if (renuevan.length) return <><b>Recomendación:</b> ofrecerla en las renovaciones de los próximos 90 días: <b>{pesos(libre)} al mes</b> a tarifa.</>;
    return <><b>Recomendación:</b> ofrecerla a tarifa: <b>{pesos(libre)} al mes</b>.</>;
  })();
  const otros = renuevan.filter((o) => !presentes.includes(o.vence!.proveedor!))
    .sort((a, b) => a.vence!.dias - b.vence!.dias).slice(0, 4);

  return (
    <div className="fn" data-ficha-de-negociacion={e.clave}>
      <header className="fn-cab">
        <h2>Propuesta comercial · <span className="mono">{e.codigo}</span></h2>
        <p>{e.tipo}{e.tarifa !== null ? ` · Tarifa de referencia ${pesos(e.tarifa)} al mes` : ""}</p>
      </header>
      <div className="fn-cuerpo">
        <section>
          <h3>Disponibilidad</h3>
          {e.partes && e.partes.total > 0 ? (
            <div className="fn-barra" role="img" aria-label={`${e.partes.vendidas} de ${e.partes.total} ${e.partes.nombre} vendidas`}>
              {Array.from({ length: e.partes.total }, (_, k) => {
                const t = k < e.partes!.vendidas ? "o1" : k < e.partes!.vendidas + e.partes!.reservadas ? "o2" : "o3";
                return <div key={k} className={t} style={{ flex: 1 }}>{t === "o3" ? "libre" : t === "o2" ? "reservado" : "vendido"}</div>;
              })}
            </div>
          ) : (
            <div className="fn-barra" role="img" aria-label={vendido !== null ? `${Math.round(vendido * 100)} % vendido` : "Vendida en parte"}>
              {vendido !== null && vendido > 0 && <div className="o1" style={{ flex: vendido }}>Vendido · {Math.round(vendido * 100)} %</div>}
              {(vendido === null || vendido < 1) && <div className="o3" style={{ flex: vendido === null ? 1 : 1 - vendido }}>Disponible{pctLibre !== null ? ` · ${pctLibre} %` : ""}</div>}
            </div>
          )}
          {vigentes.map((k) => (
            <div key={`${k.codigo}-${k.desde}`} className="fn-fila">
              <span>{k.proveedor || "Sin proveedor"} · <span className="mono">{k.codigo}</span> · {fecha(k.desde)} – {fecha(k.hasta)}{k.vigente ? "" : " (firmado, por empezar)"}</span>
              <b>{k.alMes !== null ? `${pesos(k.alMes)} al mes` : "—"}</b>
            </div>
          ))}
          <div className="fn-fila"><span>{e.detalleParcial ?? (e.estado === "libre" ? "La cara entera, desde hoy" : "Disponible")}</span><b>{e.estado === "libre" && e.nuncaContratada ? "nunca contratada" : e.estado === "libre" && e.diasSinContrato !== null ? `${e.diasSinContrato} días sin contrato` : ""}</b></div>
        </section>
        <section>
          <h3>Precio de referencia</h3>
          <div className="fn-fila"><span>{pctLibre !== null && pctLibre < 100 ? `${pctLibre} % de la cara a tarifa` : e.partes ? `Las ${e.partes.nombre} libres, a tarifa` : "La cara a tarifa"}</span><b>{pesos(libre)} al mes</b></div>
          <div className="fn-chips">
            {[3, 6, 12].map((m) => <div key={m} className="fn-chip">{m} meses<b>{pesos(libre * m)}</b></div>)}
          </div>
        </section>
        <section>
          <h3>Con quién negociar</h3>
          {presentes.map((c) => {
            const k = cartera.find((x) => x.nombre === c);
            const r = renuevan.find((o) => o.vence!.proveedor === c);
            return (
              <div key={c} className="fn-cli">
                <div className="t">{c} <span>Ya está en esta cara</span></div>
                <ul>
                  {k && k.alMes !== null && canon ? <li>{Math.round((k.alMes / canon) * 100)} % del ingreso de la sede ({pesos(k.alMes)} al mes).</li> : null}
                  {r && <li>Su contrato de {r.vence!.codigo}{r.vence!.alMes !== null ? ` (${pesos(r.vence!.alMes)} al mes)` : ""} vence el {corta(r.vence!.fecha)}, sin renovar.</li>}
                </ul>
              </div>
            );
          })}
          <div className="fn-reco">{recomendacion}</div>
          {otros.length > 0 && (
            <div className="fn-cli">
              <div className="t chica">Otros clientes con renovación en 90 días</div>
              <ul>{otros.map((o) => <li key={o.clave}>{o.vence!.proveedor} · <span className="mono">{o.vence!.codigo}</span> vence el {corta(o.vence!.fecha)}</li>)}</ul>
            </div>
          )}
        </section>
      </div>
      <footer className="fn-pie">
        <p>En Contratos, con {e.codigo} ya elegido, se genera la lámina de propuesta, se reserva o se registra el contrato.</p>
        <div className="fn-botones">
          <button type="button" className="mo-accion sec" onClick={onFicha}>Ver la ficha del espacio</button>
          <button type="button" className="btn-principal mo-accion" onClick={onContratar} data-armar-propuesta>Armar la propuesta en Contratos</button>
        </div>
      </footer>
    </div>
  );
}
