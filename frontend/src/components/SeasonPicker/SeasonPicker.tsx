import { useMemo, useState } from "react";
import { CalendarRange, SlidersHorizontal, X } from "lucide-react";
import { useFixtureStore } from "../../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import SeasonsModal from "./SeasonsModal";
import {
  toISODate,
  parseISODate,
  upcomingSeasons,
  inclusiveDays,
  dayNumber,
  type SeasonOccurrence,
} from "../../types/seasons";

/** The period the map is answering for. `null` means today. */
export interface DateRange {
  from: Date;
  to: Date;
  /** Season label when the range came from a season chip, for the caption. */
  label?: string;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const long = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export function describeRange(range: DateRange | null): string {
  if (!range) return "hoy";
  const days = inclusiveDays(range.from, range.to);
  if (days <= 1) return long(range.from);
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  return `${sameYear ? short(range.from) : long(range.from)} → ${long(range.to)}`;
}

/**
 * Season chips plus two date fields, sitting on the occupancy map.
 *
 * The chips are the fast path — a supplier asks for "el día del padre", not
 * for a date — and the fields are the escape hatch for anything that is not a
 * named season. Both produce the same thing: a period the map answers for.
 */
/** Cuántos días faltan para que arranque. Cero o negativo: ya arrancó. */
function diasHasta(d: Date): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const otro = new Date(d); otro.setHours(0, 0, 0, 0);
  return Math.round((otro.getTime() - hoy.getTime()) / 86_400_000);
}

/** Una temporada elegida se subraya; las demás son texto. Sin caja, sin
 *  fondo de color, sin borde. */
const estiloTemporada = (activa: boolean): React.CSSProperties => ({
  height: 25, padding: "0 7px",
  fontSize: 11.5, fontWeight: activa ? 600 : 450,
  fontFamily: "inherit", cursor: "pointer",
  border: "none",
  borderBottom: `2px solid ${activa ? "var(--ink-1)" : "transparent"}`,
  background: "transparent",
  color: activa ? "var(--ink-1)" : "var(--ink-3)",
  whiteSpace: "nowrap",
});

/** Hoy, como periodo de un día.
 *
 *  «Hoy» solía ser `null`, y ese null obligaba al mapa a contestar con otra
 *  escala: la de «qué pasa hoy», que tiene siete clases —libre, contratado,
 *  ocupado, vencido, reservado, mantenimiento, resto—. Siete clases es más de
 *  lo que el color solo puede sostener: ahí `free` contra `maintenance` daba
 *  ΔE 3.6 en deuteranopía, o sea el mismo color para dos estados opuestos.
 *
 *  Hoy es un periodo de un día, que es lo que de verdad es. Con eso el plano
 *  usa SIEMPRE la escala de tres —se puede, a medias, no— y el problema de las
 *  siete clases deja de existir sin tener que inventarle un color a nadie. */
export function hoyComoRango(): DateRange {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return { from: d, to: new Date(d) };
}

/** ¿Ese rango es «hoy»? Un solo día, y ese día es el de hoy. */
export function esHoy(r: DateRange | null): boolean {
  if (!r) return true;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return inclusiveDays(r.from, r.to) <= 1 && dayNumber(r.from) === dayNumber(d);
}

export default function SeasonPicker({
  range,
  onChange,
}: {
  range: DateRange | null;
  onChange: (r: DateRange | null) => void;
}) {
  const seasonWindows = useFixtureStore((s) => s.seasonWindows);
  const isAdmin = useAuthStore(selectIsAdmin);
  const [editing, setEditing] = useState(false);

  // Only what is still ahead: a season that already ended cannot be sold.
  const seasons = useMemo<SeasonOccurrence[]>(
    () => upcomingSeasons(new Date(), seasonWindows).slice(0, 6),
    [seasonWindows],
  );

  const activeId = useMemo(() => {
    if (!range?.label) return null;
    return seasons.find((s) => s.label === range.label)?.id ?? null;
  }, [range, seasons]);

  const fieldStyle: React.CSSProperties = {
    height: 26, padding: "0 6px",
    borderRadius: "var(--r-sm)", border: "1px solid var(--line)",
    background: "var(--surface-2)", color: "var(--ink-1)",
    fontSize: 11.5, fontFamily: "var(--font-mono)", outline: "none",
  };

  function setEnd(which: "from" | "to", value: string) {
    const parsed = parseISODate(value);
    if (!parsed) return;
    const base = range ?? { from: new Date(), to: new Date() };
    let from = which === "from" ? parsed : base.from;
    let to = which === "to" ? parsed : base.to;
    // Keep the range coherent instead of rejecting the edit: dragging the
    // start past the end should carry the end along, not throw an error.
    if (to < from) {
      if (which === "from") to = from;
      else from = to;
    }
    onChange({ from, to });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {/* Decía «Disponible para» delante de la fila. El parte que va debajo
          arranca con «Para Halloween —del 24 oct al 1 nov…», así que el rótulo
          era la misma palabra dicha dos veces a dos centímetros. Queda el
          ícono de calendario, que sí dice de qué se trata la fila sin gastar
          una palabra. */}
      <CalendarRange size={13} style={{ color: "var(--ink-4)", flexShrink: 0 }} />

      {/* Siete pastillas idénticas con borde, una al lado de la otra. Es de
          los patrones que más gritan "generado": cada opción metida en su
          cajita, todas con el mismo peso, y la elegida marcada pintándole el
          fondo de color.

          Una temporada no es una etiqueta, es **una fecha**: son las que un
          comercial nombra de memoria porque son los seis momentos del año en
          que se vende. Van como se nombran —palabras en fila, separadas por
          una línea fina— y la elegida se subraya. El mismo gesto que una
          pestaña, que es exactamente lo que son. */}
      <button
        onClick={() => onChange(hoyComoRango())}
        style={estiloTemporada(esHoy(range))}
      >
        Hoy
      </button>

      <span aria-hidden style={{ width: 1, height: 14, background: "var(--line)", margin: "0 3px" }} />

      {seasons.map((s) => {
        const active = activeId === s.id;
        return (
          <button
            key={`${s.id}-${s.year}`}
            onClick={() => onChange({ from: s.from, to: s.to, label: s.label })}
            title={`${long(s.from)} → ${long(s.to)} · ${s.days} días`}
            style={estiloTemporada(active)}
          >
            {s.label}
            {/* A cuántos días arranca, pegado al nombre. Siete nombres en fila
                no dicen cuál es la próxima ni cuál está a tres meses; con el
                número, la fila deja de ser una lista y pasa a ser el
                calendario por el que se vende. Cuesta cero píxeles de alto. */}
            <span style={{
              marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 500, color: "var(--ink-4)",
            }}>
              {diasHasta(s.from) > 0 ? diasHasta(s.from) : `va por ${1 - diasHasta(s.from)}/${s.days}`}
            </span>
          </button>
        );
      })}

      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          type="date"
          aria-label="Desde"
          value={range ? toISODate(range.from) : ""}
          onChange={(e) => setEnd("from", e.target.value)}
          style={fieldStyle}
        />
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>→</span>
        <input
          type="date"
          aria-label="Hasta"
          value={range ? toISODate(range.to) : ""}
          onChange={(e) => setEnd("to", e.target.value)}
          style={fieldStyle}
        />
        {!esHoy(range) && (
          <button
            onClick={() => onChange(hoyComoRango())}
            title="Volver a hoy"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: 99, marginLeft: 2,
              background: "var(--surface-3)", border: "none",
              color: "var(--ink-2)", cursor: "pointer",
            }}
          >
            <X size={11} />
          </button>
        )}
      </span>

      {/* Adjusting a window belongs right here, where you notice it is wrong —
          "navidad debería arrancar antes" is a thought you have while looking
          at the chip, not one you take to a settings screen. */}
      {isAdmin && (
        <button
          onClick={() => setEditing(true)}
          title="Ajustar los días de cada temporada"
          aria-label="Ajustar temporadas"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 25, height: 25, borderRadius: 99,
            background: "transparent", border: "1px solid var(--line)",
            color: "var(--ink-3)", cursor: "pointer",
          }}
        >
          <SlidersHorizontal size={12} />
        </button>
      )}

      {editing && isAdmin && <SeasonsModal onClose={() => setEditing(false)} />}
    </div>
  );
}
