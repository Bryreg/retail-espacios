import { useEffect } from "react";
import { LayoutGrid, Percent, Shapes } from "lucide-react";
import { usePlanograma } from "../../store/planogramaStore";
import { comoEstaLaCara, type ComoEstaLaCara } from "../../utils/planograma";

/**
 * «La cara» (dibujo aprobado por el dueño, 2026-10-29): el mismo bloque en el
 * panel del mueble del 2D y del 3D. Dice cómo está el reparto de cada cara y
 * tiene UN botón, «Distribuir la cara», que abre la herramienta que le toca al
 * mueble:
 *
 *  · se vende por porcentaje → Distribuir (ubicar a cada marca; `onPorcentaje`),
 *    y «Lo libre» al lado, para lo que no se vendió;
 *  · no se vende → el planograma (repartir entre categorías, marca propia…);
 *  · se vende entera o por partes → el planograma de lo libre (lo vendido manda).
 *
 * Antes eran dos herramientas con tres nombres («Distribuir esta cara»,
 * «Planificar la cara», «Lo libre»), y la del 3D abría el reparto por
 * porcentaje también en un mueble que no se vende. Un mueble que se vende no
 * se le muestra a quien no administra (lo comercial es de administración).
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

const TONO_CLARO: Record<ComoEstaLaCara["tono"], { fondo: string; borde: string; tinta: string }> = {
  falta: { fondo: "rgb(var(--entra-suave-rgb))", borde: "rgb(var(--entra-borde-rgb))", tinta: "rgb(var(--entra-txt-rgb))" },
  en_curso: { fondo: "rgb(var(--surface-2-rgb))", borde: "rgb(var(--line-strong-rgb))", tinta: "var(--signal-ink)" },
  lista: { fondo: "rgb(var(--libre-suave-rgb))", borde: "rgb(var(--libre-borde-rgb))", tinta: "rgb(var(--libre-txt-rgb))" },
};

export default function BloqueDeLaCara({
  sede, fixtureId, caras, comercializable, porParticipacion, esAdmin, caraMirada = "A", onPorcentaje, motivo = null,
  variante = "claro",
}: {
  sede: string;
  fixtureId: string;
  caras: 1 | 2;
  comercializable: boolean;
  porParticipacion: boolean;
  esAdmin: boolean;
  /** La cara que se mira en el panel: la que abre el reparto por porcentaje. */
  caraMirada?: "A" | "B";
  /** Abrir Distribuir en la cara (sólo por porcentaje). */
  onPorcentaje?: (cara: "A" | "B") => void;
  /** Por qué no se puede distribuir ahora (una reunión en el 3D), o null. */
  motivo?: string | null;
  /** «oscuro»: el panel del 3D, que siempre es oscuro. */
  variante?: "claro" | "oscuro";
}) {
  const resumen = usePlanograma((s) => s.resumenes[sede]);
  useEffect(() => { void usePlanograma.getState().leerResumen(sede); }, [sede]);
  if (comercializable && !esAdmin) return null;
  const puede = esAdmin || !!resumen?.puede_planificar;
  const letras: ("A" | "B")[] = caras === 2 ? ["A", "B"] : ["A"];
  const abrir = (c: "A" | "B") => void usePlanograma.getState().abrir({ sede, fixtureId, cara: c });
  const oscuro = variante === "oscuro";
  const boton = oscuro
    ? "inline-flex items-center gap-1.5 rounded border border-accent/60 bg-accent/10 px-2 py-1.5 text-[11px] font-semibold text-dark-ink-1 hover:bg-accent/20 disabled:opacity-50"
    : "p2-btn";
  const botonSec = oscuro
    ? "inline-flex items-center gap-1.5 rounded border border-dark-line-2 px-2 py-1.5 text-[11px] font-semibold text-dark-ink-2 hover:text-dark-ink-1"
    : "p2-btn";
  const texto = oscuro ? "text-[10px] leading-snug text-dark-ink-3" : "p2-msj";

  if (porParticipacion) {
    return (
      <div data-bloque-de-la-cara="porcentaje" className="flex flex-col gap-1.5">
        <p className={texto}>
          Se vende por porcentaje: cada marca compra su % en Contratos y acá se ubica dónde va.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" className={boton} onClick={() => onPorcentaje?.(caraMirada)} disabled={!onPorcentaje || !!motivo}
            title={motivo ?? `Ubicar a cada marca en la cara ${caraMirada}`} data-distribuir-la-cara>
            <Percent {...ICONO} />Distribuir la cara{caras === 2 ? ` ${caraMirada}` : ""}
          </button>
          {esAdmin && (
            <button type="button" className={botonSec} onClick={() => abrir(caraMirada)} data-lo-libre
              title="Repartir lo que no se vendió (marca propia, promociones). Lo vendido no se toca.">
              <Shapes {...ICONO} />Lo libre
            </button>
          )}
        </div>
        {motivo && <p className={texto}>{motivo}</p>}
      </div>
    );
  }

  return (
    <div data-bloque-de-la-cara={comercializable ? "lo_libre" : "interna"} className="flex flex-col gap-2">
      {comercializable && <p className={texto}>Lo vendido manda: acá se reparte lo que queda libre.</p>}
      {letras.map((c) => {
        const e = resumen?.caras.find((x) => x.fixture_id === fixtureId && x.cara === c);
        const como = comoEstaLaCara({ borrador: !!e?.borrador, vigente: e?.vigente ?? null, programada: e?.programada ?? null });
        const t = TONO_CLARO[como.tono];
        const sinNada = como.estado === "sin_repartir";
        return (
          <div key={c} data-cara-del-bloque={c} data-estado-de-la-cara={como.estado}
            className={oscuro ? "rounded-lg border border-dark-line-2 bg-dark-bg/60 p-2" : undefined}
            style={oscuro ? undefined : { border: `1px solid ${t.borde}`, background: t.fondo, borderRadius: 12, padding: 10, display: "grid", gap: 6 }}>
            <p className={oscuro ? "flex items-center gap-1.5 text-[11px] font-semibold text-dark-ink-1" : undefined}
              style={oscuro ? undefined : { margin: 0, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-xs)", fontWeight: 700, color: t.tinta }}>
              <LayoutGrid {...ICONO} />{caras === 2 ? `Cara ${c} · ` : ""}{como.titulo}
            </p>
            <p className={texto} style={oscuro ? undefined : { margin: 0 }}>{como.texto}</p>
            {(puede || !sinNada) && (
              <button type="button" className={sinNada || como.tono === "falta" ? boton : botonSec} onClick={() => abrir(c)}
                style={{ justifySelf: "start" }} data-distribuir-la-cara={c}>
                <Shapes {...ICONO} />{puede ? como.boton : "Ver la cara"}{caras === 2 && puede ? ` ${c}` : ""}
              </button>
            )}
            {!puede && sinNada && <p className={texto} style={oscuro ? undefined : { margin: 0 }}>La reparte quien administra.</p>}
          </div>
        );
      })}
    </div>
  );
}
