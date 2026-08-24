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
      <CalendarRange size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        Disponible para
      </span>

      <button
        onClick={() => onChange(null)}
        style={{
          height: 25, padding: "0 10px", borderRadius: 999,
          fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          border: `1px solid ${range === null ? "var(--accent)" : "var(--line)"}`,
          background: range === null ? "var(--accent-50)" : "var(--surface)",
          color: range === null ? "var(--accent-700)" : "var(--ink-2)",
        }}
      >
        Hoy
      </button>

      {seasons.map((s) => {
        const active = activeId === s.id;
        return (
          <button
            key={`${s.id}-${s.year}`}
            onClick={() => onChange({ from: s.from, to: s.to, label: s.label })}
            title={`${long(s.from)} → ${long(s.to)} · ${s.days} días`}
            style={{
              height: 25, padding: "0 10px", borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
              border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
              background: active ? "var(--accent-50)" : "var(--surface)",
              color: active ? "var(--accent-700)" : "var(--ink-2)",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
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
        {range && (
          <button
            onClick={() => onChange(null)}
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
