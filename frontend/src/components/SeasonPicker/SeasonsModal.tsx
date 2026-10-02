import { useEffect, useMemo } from "react";
import { CalendarRange, RotateCcw, X } from "lucide-react";
import { useFixtureStore } from "../../store/fixtureStore";
import {
  SEASON_RULES,
  addDays,
  dayNumber,
  inclusiveDays,
  type SeasonRule,
} from "../../types/seasons";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** The next time this season happens — this year's if it has not passed yet,
 *  otherwise next year's. Editing a window that already went by helps nobody. */
function nextAnchor(rule: SeasonRule, today: Date): Date {
  const thisYear = rule.anchor(today.getFullYear());
  return dayNumber(thisYear) >= dayNumber(today)
    ? thisYear
    : rule.anchor(today.getFullYear() + 1);
}

/**
 * Season window editor (admin only).
 *
 * The anchor is a calendar fact and is shown read-only: nobody should be able
 * to declare that Father's Day is not the third Sunday of June. What is
 * editable is the part the system cannot know — how many days around it this
 * store actually sells. That split is the whole point: next January the
 * anchors move on their own and these windows stay.
 */
export default function SeasonsModal({ onClose }: { onClose: () => void }) {
  const seasonWindows = useFixtureStore((s) => s.seasonWindows);
  const setSeasonWindow = useFixtureStore((s) => s.setSeasonWindow);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(
    () =>
      SEASON_RULES.map((rule) => {
        const saved = seasonWindows[rule.id];
        const before = saved?.before ?? rule.defaultBefore;
        const after = saved?.after ?? rule.defaultAfter;
        const anchor = nextAnchor(rule, today);
        const from = addDays(anchor, -before);
        const to = addDays(anchor, after);
        return {
          rule, before, after, anchor, from, to,
          days: inclusiveDays(from, to),
          isDefault: before === rule.defaultBefore && after === rule.defaultAfter,
        };
      }).sort((a, b) => dayNumber(a.from) - dayNumber(b.from)),
    [seasonWindows, today],
  );

  const spin: React.CSSProperties = {
    width: 54, height: 26, padding: "0 5px", textAlign: "center",
    borderRadius: "var(--r-sm)", border: "1px solid var(--brd-control)",
    background: "var(--surface-2)", color: "var(--ink-1)",
    fontSize: 12, fontFamily: "var(--font-mono)", outline: "none",
  };
  const th: React.CSSProperties = {
    padding: "0 10px 7px", textAlign: "left", whiteSpace: "nowrap",
    fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)",
    textTransform: "uppercase", letterSpacing: "0.08em",
  };
  const td: React.CSSProperties = {
    padding: "6px 10px", borderTop: "1px solid var(--line-soft)",
    fontSize: 12.5, color: "var(--ink-1)", verticalAlign: "middle",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="seasons-modal"
        style={{
          width: "100%", maxWidth: 720, maxHeight: "86vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--brd-control)",
          borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 18px", borderBottom: "1px solid var(--line)",
          }}
        >
          <CalendarRange size={15} style={{ color: "var(--accent)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Temporadas comerciales
          </span>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-md)",
              background: "transparent", border: "none", color: "var(--ink-2)", cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid var(--line-soft)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
            La fecha del ancla la calcula el sistema y no se toca: el día del padre es el tercer
            domingo de junio, la semana santa se deriva de la pascua. Lo que sí depende de vos es
            cuántos días alrededor de esa fecha vendés el espacio. Se aplica a todas las sedes.
          </p>
        </div>

        <div style={{ overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: "var(--surface)" }}>
                <th style={{ ...th, paddingLeft: 18 }}>Temporada</th>
                <th style={th}>Ancla</th>
                <th style={{ ...th, textAlign: "center" }}>Días antes</th>
                <th style={{ ...th, textAlign: "center" }}>Días después</th>
                <th style={{ ...th, paddingRight: 18 }}>Se vende</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rule.id}>
                  <td style={{ ...td, paddingLeft: 18 }}>
                    <div style={{ fontWeight: 600 }}>{r.rule.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{r.rule.ruleLabel}</div>
                  </td>
                  <td
                    style={{
                      ...td, fontFamily: "var(--font-mono)", fontSize: 11.5,
                      color: "var(--ink-2)", whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(r.anchor)}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input
                      type="number" min={0} max={180} value={r.before}
                      aria-label={`Días antes — ${r.rule.label}`}
                      onChange={(e) =>
                        setSeasonWindow(r.rule.id, parseInt(e.target.value, 10) || 0, r.after)
                      }
                      style={spin}
                    />
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input
                      type="number" min={0} max={180} value={r.after}
                      aria-label={`Días después — ${r.rule.label}`}
                      onChange={(e) =>
                        setSeasonWindow(r.rule.id, r.before, parseInt(e.target.value, 10) || 0)
                      }
                      style={spin}
                    />
                  </td>
                  <td style={{ ...td, paddingRight: 18, whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)", fontSize: 11.5,
                        color: "var(--ink-2)", fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmt(r.from)} → {fmt(r.to)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, marginLeft: 6 }}>
                      {r.days} día{r.days === 1 ? "" : "s"}
                    </span>
                    {!r.isDefault && (
                      <button
                        onClick={() =>
                          setSeasonWindow(r.rule.id, r.rule.defaultBefore, r.rule.defaultAfter)
                        }
                        title="Volver al valor sugerido"
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 20, height: 20, marginLeft: 6, borderRadius: 99,
                          background: "transparent", border: "none",
                          color: "var(--ink-3)", cursor: "pointer", verticalAlign: "middle",
                        }}
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: "10px 18px", borderTop: "1px solid var(--line-soft)",
            fontSize: 10.5, color: "var(--ink-3)",
          }}
        >
          Se guarda solo y se comparte con las demás estaciones. El año entrante las anclas se
          mueven por su cuenta y estas ventanas siguen puestas.
        </div>
      </div>
    </div>
  );
}
