import { useMemo } from "react";
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Building2,
  Clock,
  DoorOpen,
  Plus,
  Star,
} from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import type { UnifiedFixture } from "../types/fixtures";

// ─── Status computation ──────────────────────────────────────────────────────

type DisplayStatus =
  | "active"
  | "expiring"
  | "expired"
  | "no_contract"
  | "reserved"
  | "maintenance"
  | "free";

function displayStatus(f: UnifiedFixture): DisplayStatus {
  if (f.status === "free")        return "free";
  if (f.status === "reserved")    return "reserved";
  if (f.status === "maintenance") return "maintenance";
  if (f.status !== "occupied")    return "free";
  if (!f.endDate)                 return "no_contract";
  const days = daysUntil(f.endDate);
  if (days < 0)   return "expired";
  if (days <= 30) return "expiring";
  return "active";
}

function daysUntil(dateStr: string): number {
  // Parse both sides as local date components to avoid UTC-vs-local off-by-one.
  // new Date("YYYY-MM-DD") is UTC midnight; new Date(y, m-1, d) is local midnight.
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function daysUntilEnd(f: UnifiedFixture): number | null {
  if (!f.endDate) return null;
  return daysUntil(f.endDate);
}

function formatCOP(n: number): string {
  if (!n) return "—";
  return "$" + n.toLocaleString("es-CO");
}

// ─── STATUS_META (maps DisplayStatus → colors/labels) ────────────────────────

const STATUS_META: Record<
  DisplayStatus,
  { ring: string; fill: string; label: string }
> = {
  active:      { ring: "var(--success)", fill: "rgba(21,128,61,0.10)",       label: "Activo" },
  expiring:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.12)",        label: "Por vencer" },
  expired:     { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",       label: "Vencido" },
  no_contract: { ring: "var(--danger)",  fill: "rgba(185,28,28,0.10)",       label: "Sin contrato" },
  reserved:    { ring: "var(--warning)", fill: "rgba(180,83,9,0.08)",        label: "Reservado" },
  maintenance: { ring: "var(--muted-status)", fill: "rgba(148,145,127,0.10)", label: "Mantenim." },
  free:        { ring: "var(--ink-4)",   fill: "rgba(181,174,156,0.10)",     label: "Libre" },
};

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({
  children,
  style = {},
  className = "",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueColor,
  hint,
  icon,
  iconBg,
  iconColor,
  trend,
  bg,
  borderColor,
}: {
  label: string;
  value: string | number;
  valueColor: string;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: string;
  bg?: string;
  borderColor?: string;
}) {
  return (
    <Card
      style={{
        padding: 16,
        background: bg ?? "var(--surface)",
        borderColor: borderColor ?? "var(--line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: "var(--ink-3)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 26, height: 26, borderRadius: "var(--r-md)",
            background: iconBg, color: iconColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div
        style={{
          fontSize: 26, fontWeight: 700, color: valueColor,
          letterSpacing: "-0.02em", lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>{hint}</div>
      {trend && (
        <div style={{ fontSize: 10.5, color: "var(--success)", marginTop: 6, fontWeight: 500 }}>
          ↗ {trend}
        </div>
      )}
    </Card>
  );
}

// ─── Occupancy donut ──────────────────────────────────────────────────────────

function Donut({ pct }: { pct: number }) {
  const size = 96, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color =
    pct >= 80 ? "var(--success)"
    : pct >= 50 ? "var(--accent)"
    : pct >= 20 ? "var(--warning)"
    : "var(--danger)";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray .5s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {pct}<span style={{ fontSize: 12 }}>%</span>
        </span>
        <span
          style={{
            fontSize: 8.5, color: "var(--ink-3)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 600, marginTop: 2,
          }}
        >
          Ocupación
        </span>
      </div>
    </div>
  );
}

// ─── Stat dot ────────────────────────────────────────────────────────────────

function StatDot({ dot, v, l }: { dot: string; v: number; l: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: dot, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, color: "var(--ink-1)" }}>{v}</span>
      <span style={{ color: "var(--ink-3)", fontSize: 11 }}>{l}</span>
    </div>
  );
}

// ─── Action row ───────────────────────────────────────────────────────────────

function ActionRow({
  tone,
  active,
  title,
  detail,
  last = false,
}: {
  tone: "danger" | "warning" | "success";
  active: boolean;
  title: string;
  detail: string;
  last?: boolean;
}) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warning" ? Clock : DoorOpen;
  const bg = active
    ? tone === "danger" ? "var(--danger-50)"
    : tone === "warning" ? "var(--warning-50)"
    : "var(--success-50)"
    : "transparent";
  const color = active
    ? tone === "danger" ? "var(--danger)"
    : tone === "warning" ? "var(--warning)"
    : "var(--success)"
    : "var(--ink-4)";

  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex", alignItems: "flex-start", gap: 10,
        background: bg,
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <Icon size={14} style={{ color, marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

// ─── Supplier row ─────────────────────────────────────────────────────────────

function SupplierRow({
  name,
  revenue,
  count,
  rank,
  pct,
}: {
  name: string;
  revenue: number;
  count: number;
  rank: number;
  pct: number;
}) {
  const isFirst = rank === 0;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: "var(--r-md)",
        background: isFirst ? "rgba(180,83,9,0.06)" : "transparent",
      }}
    >
      <div
        style={{
          width: 24, height: 24, borderRadius: 99, flexShrink: 0,
          background: isFirst ? "#D97706" : "var(--surface-3)",
          color: isFirst ? "#fff" : "var(--ink-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700,
        }}
      >
        {isFirst ? <Star size={11} strokeWidth={2.5} /> : rank + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 12, fontWeight: 600,
              color: isFirst ? "#92400E" : "var(--ink-1)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
              color: "var(--success)", flexShrink: 0,
            }}
          >
            {formatCOP(revenue)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <div
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: "var(--surface-3)", overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`, height: "100%",
                background: isFirst ? "#D97706" : "var(--accent)",
                borderRadius: 2,
                transition: "width .4s ease",
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: "var(--ink-3)", flexShrink: 0 }}>
            {count} contrato{count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Quick action ─────────────────────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  hint,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: "var(--r-md)",
        background: warning ? "var(--warning-50)" : "var(--surface-2)",
        border: "1px solid var(--line-soft)",
        cursor: "default",
      }}
    >
      <span
        style={{
          width: 28, height: 28, borderRadius: "var(--r-md)",
          background: warning ? "var(--warning-100)" : "var(--accent-100)",
          color: warning ? "var(--warning)" : "var(--accent-700)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{hint}</div>
      </div>
    </div>
  );
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

function Minimap({ fixtures }: { fixtures: UnifiedFixture[] }) {
  if (fixtures.length === 0) return null;

  const W = 300, H = 180, PAD = 1.0;
  const xs = fixtures.flatMap((f) => [f.cx - f.w / 2, f.cx + f.w / 2]);
  const ys = fixtures.flatMap((f) => [f.cz - f.d / 2, f.cz + f.d / 2]);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;
  const sx = W / (maxX - minX);
  const sy = H / (maxY - minY);
  const s = Math.min(sx, sy);
  const offX = (W - (maxX - minX) * s) / 2;
  const offY = (H - (maxY - minY) * s) / 2;

  const colorOf = (f: UnifiedFixture): string => {
    const ds = displayStatus(f);
    if (ds === "active")   return "var(--success)";
    if (ds === "expiring") return "var(--warning)";
    if (ds === "expired" || ds === "no_contract") return "var(--danger)";
    if (ds === "maintenance") return "var(--muted-status)";
    return "var(--ink-4)";
  };

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{
        background: "var(--surface-2)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--line-soft)",
        display: "block",
      }}
    >
      {fixtures.map((f) => {
        const rx = (f.cx - f.w / 2 - minX) * s + offX;
        const ry = (f.cz - f.d / 2 - minY) * s + offY;
        const rw = Math.max(f.w * s, 3);
        const rh = Math.max(f.d * s, 3);
        return (
          <g key={f.id}>
            <rect
              x={rx} y={ry} width={rw} height={rh}
              fill={colorOf(f)} opacity={0.85}
              stroke="#fff" strokeWidth={0.8} rx={1.5}
            />
            {rw > 22 && (
              <text
                x={rx + rw / 2} y={ry + rh / 2 + 2.5}
                textAnchor="middle"
                fontSize={Math.min(7, rw / 4)}
                fill="#fff"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                style={{ pointerEvents: "none" }}
              >
                {f.code}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Spaces table ─────────────────────────────────────────────────────────────

function SpacesTable({ fixtures }: { fixtures: UnifiedFixture[] }) {
  const rows = useMemo(
    () =>
      [...fixtures].sort((a, b) => {
        const ad = daysUntilEnd(a) ?? 99999;
        const bd = daysUntilEnd(b) ?? 99999;
        return ad - bd;
      }),
    [fixtures],
  );

  const headers = ["Código", "Tipo", "Proveedor", "Estado", "Días", "Renta / mes"];

  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
          <tr style={{ background: "var(--surface-2)" }}>
            {headers.map((h, i) => (
              <th
                key={h}
                style={{
                  padding: "8px 14px",
                  textAlign: i >= 4 ? "right" : "left",
                  fontSize: 9.5, fontWeight: 700,
                  color: "var(--ink-3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  borderBottom: "1px solid var(--line)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const ds = displayStatus(f);
            const meta = STATUS_META[ds];
            const days = daysUntilEnd(f);
            const isDanger = ds === "expired" || ds === "no_contract";

            return (
              <tr
                key={f.id}
                style={{
                  borderBottom: "1px solid var(--line-soft)",
                  background: isDanger ? "rgba(185,28,28,0.04)" : "transparent",
                }}
              >
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {f.code}
                </td>
                <td style={{ padding: "10px 14px", color: "var(--ink-2)" }}>{f.label}</td>
                <td style={{ padding: "10px 14px" }}>
                  {f.supplierName ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 16, height: 16, borderRadius: 3,
                          background: "var(--accent-100)", color: "var(--accent-700)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, flexShrink: 0,
                        }}
                      >
                        {f.supplierName[0]?.toUpperCase()}
                      </span>
                      <span style={{ color: "var(--ink-1)", fontSize: 11.5 }}>{f.supplierName}</span>
                    </div>
                  ) : ds === "no_contract" ? (
                    <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: 11.5 }}>
                      ⚠ Sin contrato
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>—</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 10.5, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 999,
                      background: meta.fill, color: meta.ring,
                    }}
                  >
                    <span
                      style={{
                        width: 5, height: 5, borderRadius: 99,
                        background: meta.ring, flexShrink: 0,
                      }}
                    />
                    {meta.label}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 14px", textAlign: "right",
                    fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
                    color:
                      days === null ? "var(--ink-4)"
                      : days < 0 ? "var(--danger)"
                      : days <= 30 ? "var(--warning)"
                      : "var(--success)",
                  }}
                >
                  {days === null ? "—" : `${days}d`}
                </td>
                <td
                  style={{
                    padding: "10px 14px", textAlign: "right",
                    fontFamily: "var(--font-mono)", fontSize: 11.5,
                    color: "var(--success)", fontWeight: 600,
                  }}
                >
                  {f.negotiatedValue > 0 ? formatCOP(f.negotiatedValue) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard({ sede }: { sede: string }) {
  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, textAlign: "center",
      }}
    >
      <div
        style={{
          width: 88, height: 88, borderRadius: 22,
          background: "var(--surface)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 18, color: "var(--ink-3)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Building2 size={36} strokeWidth={1.3} />
      </div>
      <p
        style={{
          fontSize: 16, fontWeight: 700,
          color: "var(--ink-1)", marginBottom: 6, letterSpacing: "-0.02em",
        }}
      >
        Sin fixtures en{" "}
        <span style={{ fontFamily: "var(--font-mono)" }}>{sede}</span>
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 360, marginBottom: 18 }}>
        Diseñá el plano desde la pestaña Plano para ver KPIs, mapa de
        ocupación y el detalle por espacio.
      </p>
      <button
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 36, padding: "0 16px",
          borderRadius: "var(--r-md)",
          background: "var(--accent)", color: "#fff",
          border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 500, fontFamily: "inherit",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Plus size={14} /> Diseñar plano
      </button>
    </div>
  );
}

// ─── Card header divider ──────────────────────────────────────────────────────

function CardHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>{title}</span>
      {sub && (
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</span>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function DashboardView() {
  const fixtures = useFixtureStore(selectFixtures);
  const { sedes, sede, setSede, fixturesBySede } = useFixtureStore();

  // ── KPI computation ──
  const kpis = useMemo(() => {
    const total = fixtures.length;
    const occupied    = fixtures.filter((f) => f.status === "occupied").length;
    const free        = fixtures.filter((f) => f.status === "free").length;
    const reserved    = fixtures.filter((f) => f.status === "reserved").length;
    const maintenance = fixtures.filter((f) => f.status === "maintenance").length;
    const occPct      = total ? Math.round((occupied / total) * 100) : 0;
    const revenue     = fixtures.reduce((s, f) => s + (f.negotiatedValue ?? 0), 0);

    const expiringList = fixtures.filter((f) => {
      const d = daysUntilEnd(f);
      return d !== null && d >= 0 && d <= 30;
    });
    const expiredList = fixtures.filter((f) => {
      const d = daysUntilEnd(f);
      return d !== null && d < 0 && f.status === "occupied";
    });

    // Top suppliers
    const supplierMap: Record<string, { revenue: number; count: number }> = {};
    fixtures.forEach((f) => {
      if (!f.supplierName || !f.negotiatedValue) return;
      if (!supplierMap[f.supplierName]) {
        supplierMap[f.supplierName] = { revenue: 0, count: 0 };
      }
      supplierMap[f.supplierName].revenue += f.negotiatedValue;
      supplierMap[f.supplierName].count++;
    });
    const topSuppliers = Object.entries(supplierMap)
      .map(([name, { revenue, count }]) => ({ name, revenue, count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
    const topRevenue = topSuppliers[0]?.revenue || 1;

    const activeLeases = fixtures.filter((f) => f.supplierName && f.startDate).length;

    return {
      total, occupied, free, reserved, maintenance,
      occPct, revenue,
      expiring: expiringList.length,
      expired: expiredList.length,
      expiredCodes: expiredList.slice(0, 4).map((f) => f.code).join(", "),
      topSuppliers, topRevenue, activeLeases,
    };
  }, [fixtures]);

  const activeSedeCount = sedes.filter((s) => (fixturesBySede[s] ?? []).length > 0).length;

  // Empty state
  if (fixtures.length === 0) {
    return (
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: "var(--bg)", overflow: "hidden",
        }}
      >
        <EmptyDashboard sede={sede} />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1, overflowY: "auto", padding: 20,
        background: "var(--bg)",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 18, gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: "var(--r-lg)",
              background: "var(--accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "var(--shadow-md)",
              flexShrink: 0,
            }}
          >
            <Building2 size={18} />
          </div>
          <div>
            <h2
              style={{
                margin: 0, fontSize: 17, fontWeight: 700,
                letterSpacing: "-0.02em", color: "var(--ink-1)",
              }}
            >
              Resumen operativo
            </h2>
            <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
              {activeSedeCount} sede{activeSedeCount !== 1 ? "s" : ""} · {kpis.total} espacios · {kpis.activeLeases} contratos activos
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Sede selector */}
          <Card
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: "var(--r-lg)",
              boxShadow: "none",
            }}
          >
            <MapPin size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              style={{
                background: "transparent", border: "none", outline: "none",
                fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12,
                color: "var(--ink-1)", cursor: "pointer",
              }}
            >
              {sedes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span
              style={{
                display: "inline-flex", alignItems: "center",
                fontSize: 9.5, fontWeight: 600,
                padding: "2px 7px", borderRadius: 999,
                background: "var(--accent-100)", color: "var(--accent-700)",
              }}
            >
              {kpis.total} fixtures
            </span>
          </Card>

          <button
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 12px",
              borderRadius: "var(--r-lg)",
              background: "var(--surface)", color: "var(--ink-2)",
              border: "1px solid var(--line)",
              cursor: "pointer", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* ── Two-column grid ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
        }}
      >
        {/* ── LEFT ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* KPI 2x2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Revenue */}
            <KpiCard
              label="Ingresos del mes"
              value={formatCOP(kpis.revenue)}
              valueColor="var(--success)"
              hint="COP · contratos activos"
              icon={<TrendingUp size={14} />}
              iconBg="var(--success-100)"
              iconColor="var(--success)"
            />

            {/* Occupancy donut */}
            <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <Donut pct={kpis.occPct} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    color: "var(--ink-3)", marginBottom: 8,
                  }}
                >
                  Estado de espacios
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  <StatDot dot="var(--accent)"        v={kpis.occupied}    l="Ocupados" />
                  <StatDot dot="var(--success)"       v={kpis.free}        l="Libres" />
                  <StatDot dot="var(--warning)"       v={kpis.reserved}    l="Reservados" />
                  <StatDot dot="var(--muted-status)"  v={kpis.maintenance} l="Mantenim." />
                </div>
              </div>
            </Card>

            {/* Expiring */}
            <KpiCard
              label="Contratos por vencer"
              value={kpis.expiring}
              valueColor={kpis.expiring > 0 ? "var(--warning)" : "var(--ink-4)"}
              hint={
                kpis.expiring > 0
                  ? `${kpis.expiring} contrato${kpis.expiring !== 1 ? "s" : ""} vence${kpis.expiring !== 1 ? "n" : ""} en ≤30 días`
                  : "Sin vencimientos próximos ✓"
              }
              icon={<Clock size={14} />}
              iconBg={kpis.expiring > 0 ? "var(--warning-100)" : "var(--surface-3)"}
              iconColor={kpis.expiring > 0 ? "var(--warning)" : "var(--ink-4)"}
              bg={kpis.expiring > 0 ? "var(--warning-50)" : undefined}
              borderColor={kpis.expiring > 0 ? "rgba(180,83,9,0.2)" : undefined}
            />

            {/* Expired / no contract */}
            <KpiCard
              label="Sin contrato"
              value={kpis.expired > 0 ? `⚠ ${kpis.expired}` : "0"}
              valueColor={kpis.expired > 0 ? "var(--danger)" : "var(--ink-4)"}
              hint={
                kpis.expired > 0
                  ? "Espacios ocupados sin contrato vigente"
                  : "Todo en regla ✓"
              }
              icon={<AlertTriangle size={14} />}
              iconBg={kpis.expired > 0 ? "var(--danger-100)" : "var(--surface-3)"}
              iconColor={kpis.expired > 0 ? "var(--danger)" : "var(--ink-4)"}
              bg={kpis.expired > 0 ? "var(--danger-50)" : undefined}
              borderColor={kpis.expired > 0 ? "rgba(185,28,28,0.2)" : undefined}
            />
          </div>

          {/* Requiere atención */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader
              icon={<AlertTriangle size={13} style={{ color: "var(--warning)" }} />}
              title="Requiere atención"
            />
            <ActionRow
              tone="danger"
              active={kpis.expired > 0}
              title={
                kpis.expired > 0
                  ? `${kpis.expired} espacio${kpis.expired !== 1 ? "s" : ""} ocupado${kpis.expired !== 1 ? "s" : ""} con contrato vencido`
                  : "Sin espacios ocupados irregulares"
              }
              detail={
                kpis.expired > 0
                  ? kpis.expiredCodes + (kpis.expired > 4 ? "…" : "")
                  : "Todos los espacios ocupados tienen contrato ✓"
              }
            />
            <ActionRow
              tone="warning"
              active={kpis.expiring > 0}
              title={
                kpis.expiring > 0
                  ? `${kpis.expiring} contrato${kpis.expiring !== 1 ? "s" : ""} vence${kpis.expiring !== 1 ? "n" : ""} en ≤30 días`
                  : "Sin contratos por vencer"
              }
              detail={
                kpis.expiring > 0
                  ? "Revisá renovaciones antes del vencimiento"
                  : "Ningún contrato vence en los próximos 30 días ✓"
              }
            />
            <ActionRow
              tone="success"
              active={kpis.free > 0}
              title={
                kpis.free > 0
                  ? `${kpis.free} espacio${kpis.free !== 1 ? "s" : ""} disponible${kpis.free !== 1 ? "s" : ""} para arrendar`
                  : "Toda la planta asignada"
              }
              detail={
                kpis.free > 0
                  ? "Oportunidad de ingresos — asigná un proveedor"
                  : "Sin espacios libres"
              }
              last
            />
          </Card>

          {/* Top suppliers */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader
              icon={<TrendingUp size={13} style={{ color: "var(--accent)" }} />}
              title="Top proveedores"
              sub="· por ingreso mensual"
            />
            <div style={{ padding: 8 }}>
              {kpis.topSuppliers.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
                    Sin contratos activos
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, color: "var(--ink-3)" }}>
                    Asigná proveedores desde el Plano
                  </div>
                </div>
              ) : (
                kpis.topSuppliers.map((s, i) => (
                  <SupplierRow
                    key={s.name}
                    name={s.name}
                    revenue={s.revenue}
                    count={s.count}
                    rank={i}
                    pct={(s.revenue / kpis.topRevenue) * 100}
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Quick actions */}
          <Card style={{ padding: 14 }}>
            <div
              style={{
                fontSize: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--ink-3)", marginBottom: 10,
              }}
            >
              Acciones rápidas
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <QuickAction
                icon={<Plus size={13} />}
                label="Diseñar plano"
                hint="Pestaña Plano"
              />
              <QuickAction
                icon={<DoorOpen size={13} />}
                label={`${kpis.free} espacio${kpis.free !== 1 ? "s" : ""} libre${kpis.free !== 1 ? "s" : ""}`}
                hint="Listos para arrendar"
              />
              <QuickAction
                icon={<Clock size={13} />}
                label={`${kpis.expiring} por renovar`}
                hint="Próximos 30 días"
                warning={kpis.expiring > 0}
              />
            </div>
          </Card>

          {/* Minimap */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>
                Mapa de ocupación
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
                Distribución actual — {sede}
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <Minimap fixtures={fixtures} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {[
                  { c: "var(--success)", l: "Activo" },
                  { c: "var(--warning)", l: "Por vencer" },
                  { c: "var(--danger)",  l: "Vencido / sin contrato" },
                  { c: "var(--ink-4)",   l: "Libre / reservado" },
                ].map((o) => (
                  <div
                    key={o.l}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 10, color: "var(--ink-3)",
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: o.c, flexShrink: 0,
                      }}
                    />
                    {o.l}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Full-width spaces table ───────────────────────────────────────── */}
      <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        <CardHeader
          icon={null}
          title="Estado por espacio"
          sub={`— ${sede} · ${kpis.total} fixture${kpis.total !== 1 ? "s" : ""}`}
        />
        <SpacesTable fixtures={fixtures} />
      </Card>
    </div>
  );
}
