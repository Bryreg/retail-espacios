import { useFixtureStore } from "../store/fixtureStore";
import { referenceRateFor } from "../types/fixtures";

/** One-line reading under a negotiated-value input: the reference rate for
 *  this fixture type in this sede, and how the typed value compares.
 *
 *  Renders nothing when no reference is configured — and therefore never for
 *  a worker, whose session holds no rates at all. Styled for the dark editor
 *  panels (2D plan and 3D), the only places contracts are typed in. Delta
 *  colours follow the plan palette: amber = paying below, green = at/above. */
export default function ReferenceRateHint({
  sede,
  rateType,
  value,
}: {
  sede: string;
  rateType: string;
  value: number;
}) {
  const rates = useFixtureStore((s) => s.referenceRates);
  const ref = referenceRateFor(rates, sede, rateType);
  if (ref === null) return null;

  const pct = value > 0 ? Math.round((value / ref - 1) * 100) : null;
  let delta: { text: string; color: string } | null = null;
  if (pct !== null) {
    // Typographic minus (−), matching the dashboard chips.
    if (pct < -1) delta = { text: `−${Math.abs(pct)}% vs referencia`, color: "#F0B429" };
    else if (pct > 1) delta = { text: `+${pct}% vs referencia`, color: "#4CC38A" };
    else delta = { text: "en línea con la referencia", color: "#4CC38A" };
  }

  return (
    <p style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.4, color: "var(--dark-ink-3)" }}>
      Referencia ${ref.toLocaleString("es-CO")}
      {delta && (
        <>
          {" · "}
          <span style={{ color: delta.color, fontWeight: 600 }}>{delta.text}</span>
        </>
      )}
    </p>
  );
}
