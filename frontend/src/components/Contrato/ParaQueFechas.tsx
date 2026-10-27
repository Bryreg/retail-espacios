import { CalendarRange, ChevronDown } from "lucide-react";
import type { DateRange } from "../SeasonPicker/SeasonPicker";
import { sumarDias, sumarMeses } from "../../utils/meses";
import { diasEntre } from "../../utils/lineaDeLaSede";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * «¿Para qué fechas?» (rediseño UX 2026-10, etapa 4): la primera línea de
 * Contratos. El proveedor pide fechas y el plano, la lista de tarifas y la
 * línea de tiempo contestan qué está disponible en ESAS fechas. Del / al con
 * los días que suman, y los atajos de 1, 3 y 6 meses; las temporadas
 * (Black Friday, Navidad…) siguen en su selector, que se abre al lado.
 *
 * Es el periodo de la pantalla: el contrato que se empieza a armar arranca con
 * estas fechas y después no las sigue (`Contrato.tsx`: «se congela al montar
 * a propósito»).
 */
export default function ParaQueFechas({ rango, onCambio, temporadasAbiertas, onTemporadas }: {
  rango: DateRange;
  onCambio: (r: DateRange) => void;
  temporadasAbiertas: boolean;
  onTemporadas: () => void;
}) {
  const desde = aIso(rango.from);
  const hasta = aIso(rango.to);
  const dias = diasEntre(desde, hasta);
  const poner = (d: string, h: string) => {
    const f = deIso(d), t = deIso(h);
    if (!f || !t) return;
    onCambio(t < f ? { from: f, to: f } : { from: f, to: t });
  };
  const atajo = (meses: number) => poner(desde, sumarDias(sumarMeses(desde, meses), -1));
  const es = (meses: number) => hasta === sumarDias(sumarMeses(desde, meses), -1);
  return (
    <div className="pieza fechas" data-para-que-fechas>
      <CalendarRange {...ICONO} className="ico" />
      <span className="preg">¿Para qué fechas?</span>
      <label className="campo">
        del <input type="date" value={desde} onChange={(e) => poner(e.target.value, hasta)} aria-label="Desde" />
      </label>
      <label className="campo">
        al <input type="date" value={hasta} min={desde} onChange={(e) => poner(desde, e.target.value)} aria-label="Hasta" />
      </label>
      <span className="dias">{dias} día{dias === 1 ? "" : "s"}</span>
      <span className="atajos" role="group" aria-label="Atajos de fechas">
        {[1, 3, 6].map((n) => (
          <button key={n} type="button" aria-pressed={es(n)} onClick={() => atajo(n)}>
            {n} {n === 1 ? "mes" : "meses"}
          </button>
        ))}
        <button type="button" aria-expanded={temporadasAbiertas} onClick={onTemporadas} title="Black Friday, Navidad y las demás temporadas de la sede">
          Temporadas <ChevronDown {...ICONO} />
        </button>
      </span>
    </div>
  );
}
