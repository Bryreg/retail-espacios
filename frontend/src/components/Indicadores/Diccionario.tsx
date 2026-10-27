import { BookOpen } from "lucide-react";
import { METRICAS } from "../../utils/indicadores";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Indicadores › Diccionario (rediseño UX 2026-10, etapa 5): la definición
 *  exacta de cada cifra —fórmula, periodo, comparación, umbral y de dónde sale
 *  el dato—. Es el mismo texto del «?» de cada tarjeta (`METRICAS`). Quien no
 *  administra no ve las de plata. */
export default function Diccionario({ esAdmin }: { esAdmin: boolean }) {
  const lista = METRICAS.filter((m) => esAdmin || !m.plata);
  return (
    <div className="ind-dicc" data-diccionario>
      {lista.map((m) => (
        <section key={m.id} className="ind-bloque" id={`metrica-${m.id}`}>
          <h3><BookOpen {...ICONO} /> {m.nombre}</h3>
          <dl>
            <dt>Fórmula</dt><dd>{m.formula}</dd>
            <dt>Periodo</dt><dd>{m.periodo}</dd>
            <dt>Comparación</dt><dd>{m.comparacion}</dd>
            <dt>Umbral</dt><dd>{m.umbral}</dd>
            <dt>Datos</dt><dd>{m.origen}</dd>
          </dl>
        </section>
      ))}
    </div>
  );
}
