import { useState } from "react";
import { Grid2x2, Box, BarChart2, Search } from "lucide-react";
import StoreEditor3D from "../components/StoreEditor3D/StoreEditor3D";
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView from "./DashboardView";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "map" | "store" | "kpis";

// ─── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div
      style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: "var(--accent)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="1.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.55" />
        <rect x="8.5" y="1.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.9" />
        <rect x="1.5" y="8.5" width="4" height="4" rx="0.8" fill="currentColor" />
        <rect x="8.5" y="8.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.7" />
      </svg>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

const TABS: { id: ViewMode; label: string; Icon: typeof Grid2x2 }[] = [
  { id: "map",   label: "Plano",     Icon: Grid2x2  },
  { id: "store", label: "Editor 3D", Icon: Box       },
  { id: "kpis",  label: "Dashboard", Icon: BarChart2  },
];

interface TopbarProps {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}

function Topbar({ viewMode, setViewMode }: TopbarProps) {

  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 16px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* Logo + wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark />
        <span
          style={{
            fontSize: 14, fontWeight: 700, letterSpacing: "-0.015em",
            color: "var(--ink-1)",
          }}
        >
          Galerías
        </span>
        <span
          style={{
            fontSize: 9.5, fontWeight: 600,
            padding: "1px 6px", borderRadius: 999,
            background: "var(--surface-3)", color: "var(--ink-3)",
          }}
        >
          BETA
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: "var(--line)", flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = viewMode === id;
          return (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                height: 30, padding: "0 12px",
                borderRadius: "var(--r-md)",
                fontSize: 12, fontWeight: active ? 600 : 500,
                border: "1px solid transparent",
                background: active ? "var(--accent-50)" : "transparent",
                color: active ? "var(--accent-700)" : "var(--ink-2)",
                cursor: "pointer",
                transition: "background .12s, color .12s",
                fontFamily: "inherit",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <button
          title="Búsqueda"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: "var(--r-md)",
            background: "transparent", border: "none",
            color: "var(--ink-2)", cursor: "pointer",
            transition: "background .12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Search size={14} />
        </button>

        {/* Avatar */}
        <div
          style={{
            width: 26, height: 26, borderRadius: 99,
            background: "var(--accent-100)", color: "var(--accent-700)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
          }}
        >
          CG
        </div>
      </div>
    </header>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        height: "100dvh", overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <Topbar viewMode={viewMode} setViewMode={setViewMode} />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {viewMode === "store" ? (
          <StoreEditor3D />
        ) : viewMode === "kpis" ? (
          <DashboardView />
        ) : (
          <FloorPlan2D />
        )}
      </div>
    </div>
  );
}
