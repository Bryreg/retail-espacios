import Cajon from "./Cajon";
import { AYUDA_DE_LA_PANTALLA, GLOSARIO } from "../../acciones";
import type { Modulo } from "../../modulos";

/**
 * La ayuda «?» de cada pantalla (rediseño UX 2026-10, etapa 8): qué hace, en
 * tres pasos, y la definición de cada término que aparece en ella. Las cifras
 * tienen su propio «?» con la fórmula (Indicadores › Diccionario).
 */
export default function Ayuda({ modulo, onCerrar, onDiccionario }: { modulo: Modulo; onCerrar: () => void; onDiccionario: () => void }) {
  const a = AYUDA_DE_LA_PANTALLA[modulo];
  const terminos = GLOSARIO.filter((g) => g.modulos.includes(modulo));
  return (
    <Cajon titulo={`Ayuda · ${a.titulo}`} sub="Qué hace esta pantalla y qué quiere decir cada término" onCerrar={onCerrar} etiqueta="Ayuda de la pantalla" ancho={440}>
      <div className="ayuda" data-ayuda={modulo}>
        <p className="ayuda-que">{a.que}</p>
        <ol className="ayuda-pasos">{a.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
        <h3>Términos de esta pantalla</h3>
        <dl className="ayuda-terminos">
          {terminos.map((t) => (<div key={t.termino}><dt>{t.termino}</dt><dd>{t.definicion}</dd></div>))}
        </dl>
        <p className="ayuda-pie">
          Cada cifra tiene su «?» con la fórmula, el periodo y la meta.{" "}
          <button type="button" className="ayuda-enlace" onClick={onDiccionario}>Abrir el diccionario de métricas</button>
          {" "}· Ctrl K busca cualquier función por su nombre.
        </p>
      </div>
    </Cajon>
  );
}
