import { useEffect } from "react";
import { LayoutGrid, Shapes } from "lucide-react";
import { usePlanograma } from "../../store/planogramaStore";
import { fechaLegible } from "../Distribucion/LeyendaDeParticipaciones";
import { haceCuanto } from "../../utils/planograma";

/**
 * La entrada a «Planificar la cara» desde el panel del mueble del plano (fase 2
 * de la distribución): el estado del planograma de cada cara —«Sin
 * planograma», «Versión 3 vigente», «Borrador», «venció hace 10 días»— y un
 * botón por cara. Un mueble interno lo ve el equipo (lo que hay que montar) y
 * lo planifica quien administra (o el equipo, si la dueña lo habilitó); un
 * mueble que se vende, sólo administración: ahí se planifica lo libre.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** «Planificar la cara A», «Lo libre de la cara B», «Ver la cara A». */
export function rotuloDelBoton(puede: boolean, rentable: boolean, cara: "A" | "B" | null): string {
  const deLaCara = cara ? ` la cara ${cara}` : "";
  if (!puede) return `Ver${deLaCara || " el planograma"}`;
  if (rentable) return cara ? `Lo libre de${deLaCara}` : "Planificar lo libre";
  return `Planificar${deLaCara || " la cara"}`;
}

export default function EntradaDelPlanograma({ sede, fixtureId, caras, rentable, esAdmin }: {
  sede: string;
  fixtureId: string;
  caras: 1 | 2;
  rentable: boolean;
  esAdmin: boolean;
}) {
  const resumen = usePlanograma((s) => s.resumenes[sede]);
  useEffect(() => { void usePlanograma.getState().leerResumen(sede); }, [sede]);
  if (rentable && !esAdmin) return null;
  const puede = esAdmin || !!resumen?.puede_planificar;
  const deLaCara = (c: "A" | "B") => resumen?.caras.find((x) => x.fixture_id === fixtureId && x.cara === c) ?? null;
  const letras: ("A" | "B")[] = caras === 2 ? ["A", "B"] : ["A"];
  const estados = letras.map((c) => {
    const e = deLaCara(c);
    const pre = caras === 2 ? `Cara ${c}: ` : "";
    if (!e || (!e.vigente && !e.borrador && !e.programada)) return `${pre}sin planograma`;
    const partes: string[] = [];
    if (e.vigente) {
      partes.push(`versión ${e.vigente.numero} vigente`);
      if (e.vigente.vencida_hace_dias != null) partes.push(`venció ${haceCuanto(e.vigente.vencida_hace_dias)}`);
      if (e.vigente.para_revisar) partes.push("el mueble cambió: revisala");
    } else partes.push("sin versión publicada");
    if (e.programada) partes.push(`la ${e.programada.numero} rige desde el ${fechaLegible(e.programada.rige_desde)}`);
    if (e.borrador) partes.push("con un borrador");
    return pre + partes.join(" · ");
  });
  const hay = letras.some((c) => !!deLaCara(c)?.vigente);
  const abrir = (c: "A" | "B") => void usePlanograma.getState().abrir({ sede, fixtureId, cara: c });
  return (
    <div data-entrada-del-planograma>
      <p className="p2-v" style={{ display: "flex", alignItems: "center", gap: 6 }}><LayoutGrid {...ICONO} />{hay ? "Con planograma" : "Sin planograma"}</p>
      <p className="p2-msj">
        {estados.join(". ")}.{" "}
        {rentable ? "Lo libre se planifica sin venderlo; lo vendido manda." : "Repartí cada cara entre categorías, marca propia o promociones."}
      </p>
      {(puede || hay) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {letras.map((c) => (
            <button key={c} type="button" className="p2-btn" onClick={() => abrir(c)} data-planificar-cara={c}>
              <Shapes {...ICONO} />{rotuloDelBoton(puede, rentable, caras === 2 ? c : null)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
