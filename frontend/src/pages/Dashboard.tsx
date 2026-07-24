import { useEffect, useState } from "react";
import { Grid2x2, Box, BarChart2, Search, Settings, LogOut, X, Send } from "lucide-react";
import StoreEditor3D from "../components/StoreEditor3D/StoreEditor3D";
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView from "./DashboardView";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import {
  updatePasswords,
  getNotificationConfig,
  updateNotificationConfig,
  sendTestNotification,
} from "../api/auth";

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

// ─── Settings modal (admin) ──────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, padding: "0 10px",
  borderRadius: "var(--r-md)", border: "1px solid var(--line)",
  background: "var(--surface-2)", color: "var(--ink-1)",
  fontSize: 12.5, fontFamily: "inherit", outline: "none",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--ink-3)", marginBottom: 10,
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 500,
  color: "var(--ink-2)", marginBottom: 4,
};

function ActionButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 14px",
        borderRadius: "var(--r-md)",
        background: primary ? "var(--accent)" : "var(--surface)",
        color: primary ? "#fff" : "var(--ink-2)",
        border: primary ? "none" : "1px solid var(--line)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: 12, fontWeight: 600, fontFamily: "inherit",
        boxShadow: "var(--shadow-xs)",
        transition: "opacity .12s",
      }}
    >
      {children}
    </button>
  );
}

type Feedback = { ok: boolean; text: string } | null;

function FeedbackNote({ msg }: { msg: Feedback }) {
  if (!msg) return null;
  return (
    <div
      style={{
        marginTop: 8, fontSize: 11.5, fontWeight: 500,
        color: msg.ok ? "var(--success)" : "var(--danger)",
      }}
    >
      {msg.text}
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  // Passwords
  const [adminPw, setAdminPw] = useState("");
  const [workerPw, setWorkerPw] = useState("");
  const [pwMsg, setPwMsg] = useState<Feedback>(null);

  // Notifications
  const [emails, setEmails] = useState("");
  const [days, setDays] = useState("");
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgMsg, setCfgMsg] = useState<Feedback>(null);
  const [testMsg, setTestMsg] = useState<Feedback>(null);

  const [busy, setBusy] = useState<"pw" | "cfg" | "test" | null>(null);

  useEffect(() => {
    getNotificationConfig()
      .then((c) => {
        setEmails(c.notify_emails);
        setDays(c.reminder_days);
      })
      .catch(() =>
        setCfgMsg({ ok: false, text: "No se pudo cargar la configuración de notificaciones." })
      )
      .finally(() => setCfgLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savePasswords = async () => {
    const payload: { admin_password?: string; worker_password?: string } = {};
    if (adminPw.trim()) payload.admin_password = adminPw.trim();
    if (workerPw.trim()) payload.worker_password = workerPw.trim();
    if (!payload.admin_password && !payload.worker_password) {
      setPwMsg({ ok: false, text: "Ingresa al menos una clave nueva." });
      return;
    }
    setBusy("pw");
    setPwMsg(null);
    try {
      await updatePasswords(payload);
      setPwMsg({ ok: true, text: "Claves actualizadas correctamente." });
      setAdminPw("");
      setWorkerPw("");
    } catch {
      setPwMsg({ ok: false, text: "No se pudieron actualizar las claves." });
    } finally {
      setBusy(null);
    }
  };

  const saveConfig = async () => {
    setBusy("cfg");
    setCfgMsg(null);
    try {
      await updateNotificationConfig({ notify_emails: emails, reminder_days: days });
      setCfgMsg({ ok: true, text: "Configuración guardada." });
    } catch {
      setCfgMsg({ ok: false, text: "No se pudo guardar la configuración." });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setTestMsg(null);
    try {
      const res = await sendTestNotification();
      setTestMsg({ ok: res.ok, text: res.detail });
    } catch {
      setTestMsg({ ok: false, text: "No se pudo enviar el correo de prueba." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, maxHeight: "86vh", overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
            position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
          }}
        >
          <Settings size={15} style={{ color: "var(--accent)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Configuración
          </span>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-md)",
              background: "transparent", border: "none",
              color: "var(--ink-2)", cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Passwords */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={sectionLabelStyle}>Claves de acceso</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={fieldLabelStyle}>Clave administrador</label>
              <input
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="Sin cambio"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Clave trabajador</label>
              <input
                type="password"
                value={workerPw}
                onChange={(e) => setWorkerPw(e.target.value)}
                placeholder="Sin cambio"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <ActionButton onClick={savePasswords} disabled={busy !== null} primary>
              {busy === "pw" ? "Guardando…" : "Guardar claves"}
            </ActionButton>
          </div>
          <FeedbackNote msg={pwMsg} />
        </div>

        {/* Notifications */}
        <div style={{ padding: "16px 18px" }}>
          <div style={sectionLabelStyle}>Notificaciones por correo</div>
          {cfgLoading ? (
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Cargando configuración…</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={fieldLabelStyle}>Correos destinatarios (separados por coma)</label>
                <input
                  type="text"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="correo1@dominio.com, correo2@dominio.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={fieldLabelStyle}>Días de recordatorio antes del vencimiento</label>
                <input
                  type="text"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder="30,15,7,1"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ActionButton onClick={saveConfig} disabled={busy !== null} primary>
                  {busy === "cfg" ? "Guardando…" : "Guardar notificaciones"}
                </ActionButton>
                <ActionButton onClick={sendTest} disabled={busy !== null}>
                  <Send size={12} />
                  {busy === "test" ? "Enviando…" : "Enviar correo de prueba"}
                </ActionButton>
              </div>
              <FeedbackNote msg={cfgMsg} />
              <FeedbackNote msg={testMsg} />
            </>
          )}
        </div>
      </div>
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
  isAdmin: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}

function Topbar({ viewMode, setViewMode, isAdmin, onOpenSettings, onLogout }: TopbarProps) {
  // Workers only get the dashboard tab; admins see everything.
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id === "kpis");

  const iconButtonStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: "var(--r-md)",
    background: "transparent", border: "none",
    color: "var(--ink-2)", cursor: "pointer",
    transition: "background .12s",
  };

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
        {visibleTabs.map(({ id, label, Icon }) => {
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
          style={iconButtonStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Search size={14} />
        </button>

        {/* Settings (admin only) */}
        {isAdmin && (
          <button
            title="Configuración"
            onClick={onOpenSettings}
            style={iconButtonStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Settings size={14} />
          </button>
        )}

        {/* Logout */}
        <button
          title="Cerrar sesión"
          onClick={onLogout}
          style={iconButtonStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <LogOut size={14} />
        </button>

        {/* Avatar — role initial */}
        <div
          title={isAdmin ? "Administrador" : "Trabajador"}
          style={{
            width: 26, height: 26, borderRadius: 99,
            background: "var(--accent-100)", color: "var(--accent-700)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
          }}
        >
          {isAdmin ? "AD" : "TR"}
        </div>
      </div>
    </header>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = useAuthStore(selectIsAdmin);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  // Workers only see the dashboard — force it as the active view.
  useEffect(() => {
    if (role === "worker" && viewMode !== "kpis") setViewMode("kpis");
  }, [role, viewMode]);

  const effectiveMode: ViewMode = isAdmin ? viewMode : "kpis";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        height: "100dvh", overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <Topbar
        viewMode={effectiveMode}
        setViewMode={setViewMode}
        isAdmin={isAdmin}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={logout}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {effectiveMode === "store" ? (
          <StoreEditor3D />
        ) : effectiveMode === "kpis" ? (
          <DashboardView />
        ) : (
          <FloorPlan2D />
        )}
      </div>

      {settingsOpen && isAdmin && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
