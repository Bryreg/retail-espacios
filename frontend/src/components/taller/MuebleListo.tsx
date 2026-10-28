import { useMemo } from "react";
import { Check } from "lucide-react";
import type { ModeloPropio } from "../../catalogo/propias";
import { familiaDe, formularioDe } from "../../utils/formularioDeFicha";
import { VistaDeLaFicha, useDibujoDe } from "./VistaDeLaFicha";
import { comoSeVendeDe, medidasDe, porDentroDe } from "./textos";

/**
 * Lo que sigue a guardar un mueble nuevo (2026-10-28): no se vuelve al
 * formulario vacío. Dice qué quedó y con qué nace al colocarlo, y lleva al
 * plano con el mueble ya elegido para soltar.
 */
export function MuebleListo({ ficha, sede, onColocar, onOtro, onVerTodos }: {
  ficha: ModeloPropio;
  sede: string;
  onColocar: () => void;
  onOtro: () => void;
  onVerTodos: () => void;
}) {
  const form = useMemo(() => formularioDe(ficha), [ficha]);
  const dibujo = useDibujoDe(form);
  const familia = familiaDe(form.entrada);
  const adentro = porDentroDe(ficha);
  const como = comoSeVendeDe(ficha, familia);
  const numeros = dibujo ? [...new Set(dibujo.numeradas.filter((p) => p.cara === "A").map((p) => p.etiqueta))] : [];
  return (
    <div className="mm" data-mueble-listo={ficha.clave}>
      <div className="mm-h">
        <nav className="mm-miga" aria-label="Dónde estás">
          <span>Plano</span><span aria-hidden>›</span>
          <button type="button" className="mm-link" onClick={onVerTodos}>Mis muebles</button><span aria-hidden>›</span>
          <b>{ficha.nombre}</b>
        </nav>
      </div>
      <div className="mm-listo">
        <div className="mm-listo-izq" role="status">
          <span className="mm-ok" aria-hidden><Check size={26} strokeWidth={2.5} /></span>
          <h2>«{ficha.nombre}» ya está en Mis muebles</h2>
          <p className="mm-sub">
            Aparece en el catálogo del plano. Al colocarlo nace con sus medidas ({medidasDe(ficha)}
            {adentro ? `, ${adentro}` : ""}).{" "}
            {como === "se vende entera" ? "Se vende entero." : como === "no vende piezas" ? "No vende piezas." : `Se vende ${como}.`}
          </p>
          <div className="mm-listo-acc">
            <button type="button" className="btn-principal mm-principal" onClick={onColocar} data-colocar-en-plano>
              Colocar en el plano de {sede || "la sede"}
            </button>
            <button type="button" className="mm-bt" onClick={onOtro} data-crear-otro>Crear otro mueble</button>
            <button type="button" className="mm-bt" onClick={onVerTodos}>Ver Mis muebles</button>
          </div>
        </div>
        <div className="mm-vista">
          <div className="mm-lienzo"><VistaDeLaFicha dibujo={dibujo} conNumeros={numeros.length > 0} /></div>
          <div className="mm-vista-pie"><span>{ficha.nombre}</span><b>{numeros.length ? numeros.join(" · ") : medidasDe(ficha)}</b></div>
        </div>
      </div>
    </div>
  );
}
