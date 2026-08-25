import { useEffect, useState } from "react";
import { Grid2x2, Box, Camera, Handshake, Search, Settings, LogOut, X, Send } from "lucide-react";
import StoreEditor3D from "../components/StoreEditor3D/StoreEditor3D";
import FloorPlan2D from "../components/FloorPlan2D/FloorPlan2D";
import DashboardView from "./DashboardView";
import MountView from "./MountView";
import SyncStatus from "../components/SyncStatus/SyncStatus";
import { useAuthStore, selectIsAdmin } from "../store/authStore";
import {
  updatePasswords,
  getNotificationConfig,
  updateNotificationConfig,
  sendTestNotification,
  getContacts,
  saveContacts,
  type ContactBook,
} from "../api/auth";
import { useFixtureStore } from "../store/fixtureStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "map" | "store" | "kpis" | "montaje";

/** Código que venía en el enlace del correo de montaje (`?montar=NAVE-PUN-01`).
 *
 *  Se lee AL CARGAR EL MÓDULO y no dentro de un componente. La primera versión
 *  lo hacía en un inicializador de `useState`, y bajo StrictMode React invoca
 *  ese inicializador dos veces: la primera leía el código y limpiaba la URL, la
 *  segunda ya no encontraba nada, y ese null era el valor que quedaba. El
 *  enlace del correo abría el resumen en vez del espacio.
 *
 *  Leerlo acá ocurre exactamente una vez, antes de que React renderice, y la
 *  URL queda limpia para que recargar no reabra siempre el mismo espacio. */
const MOUNT_DEEP_LINK: string | null = (() => {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("montar");
  if (!code) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("montar");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return code;
})();

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

/** Comma-separated text ⇄ address list. The book is typed by hand by one
 *  person, so a text field beats any chip widget for the amount of editing
 *  this actually gets — once a year, when someone changes job. */
const asText = (list?: string[]) => (list ?? []).join(", ");
const asList = (text: string) =>
  text.split(",").map((s) => s.trim()).filter(Boolean);

/** Who gets told when a contract is saved.
 *
 *  Split by role because the messages differ, not just the addresses: the
 *  merchandiser receives a work order with no money in it. Before this, one
 *  global list got a single email carrying the negotiated value — which handed
 *  prices to the person whose job is to mount the display. */
function ContactsSection({ sedes }: { sedes: string[] }) {
  const [book, setBook] = useState<ContactBook | null>(null);
  const [msg, setMsg] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContacts()
      .then(setBook)
      .catch(() => setMsg({ ok: false, text: "No se pudo cargar la libreta de contactos." }));
  }, []);

  if (!book) {
    return (
      <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
        <div style={sectionLabelStyle}>Quién recibe los avisos</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Cargando…</div>
      </div>
    );
  }

  const setSedeRole = (sede: string, role: "admin" | "mercaderista", text: string) =>
    setBook({
      ...book,
      by_sede: {
        ...book.by_sede,
        [sede]: {
          admin: book.by_sede[sede]?.admin ?? [],
          mercaderista: book.by_sede[sede]?.mercaderista ?? [],
          [role]: asList(text),
        },
      },
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setBook(await saveContacts(book));
      setMsg({ ok: true, text: "Contactos guardados." });
    } catch {
      setMsg({ ok: false, text: "No se pudieron guardar los contactos." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "16px 18px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={sectionLabelStyle}>Quién recibe los avisos</div>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "-4px 0 12px", lineHeight: 1.5 }}>
        Al guardar un contrato sale un aviso por rol. El gerente y el administrador de la
        sede reciben el resumen comercial con el valor; el mercaderista recibe la orden de
        montaje <strong>sin valores</strong>. Varios correos separados por coma.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabelStyle}>Gerente operacional · recibe todas las sedes</label>
        <input
          type="text"
          value={asText(book.gerente)}
          onChange={(e) => setBook({ ...book, gerente: asList(e.target.value) })}
          placeholder="gerente@empresa.com"
          style={inputStyle}
        />
      </div>

      {sedes.map((sede) => (
        <div
          key={sede}
          style={{
            marginBottom: 10, padding: "10px 12px",
            border: "1px solid var(--line)", borderRadius: "var(--r-md)",
            background: "var(--surface-2)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600,
              color: "var(--ink-1)", marginBottom: 8,
            }}
          >
            {sede}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <label style={fieldLabelStyle}>Administrador de sede</label>
              <input
                type="text"
                value={asText(book.by_sede[sede]?.admin)}
                onChange={(e) => setSedeRole(sede, "admin", e.target.value)}
                placeholder="admin.sede@empresa.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Mercaderista · sin valores</label>
              <input
                type="text"
                value={asText(book.by_sede[sede]?.mercaderista)}
                onChange={(e) => setSedeRole(sede, "mercaderista", e.target.value)}
                placeholder="mercaderista@empresa.com"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12 }}>
        <ActionButton onClick={save} disabled={busy} primary>
          {busy ? "Guardando…" : "Guardar contactos"}
        </ActionButton>
      </div>
      <FeedbackNote msg={msg} />
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

  // The contact book is keyed by sede, so it needs the same list the rest of
  // the app uses rather than a second one that could drift out of step.
  const sedes = useFixtureStore((s) => s.sedes);

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

        <ContactsSection sedes={sedes} />
      </div>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

/** Las pestañas, con una frase que dice para qué sirve cada una.
 *
 *  Los nombres solos no alcanzaban: "Plano" y "Editor 3D" suenan a lo mismo, y
 *  desde ninguno de los dos se adivina que el contrato se llena ahí adentro.
 *  Quedan tres del trabajo diario —la sede, los montajes— separadas del diseño
 *  de la tienda, que es donde se entra una vez cada tanto y no todos los días.
 *
 *  Eran cuatro. Negociar y Resumen abrían las dos con el plano de la misma
 *  sede y se diferenciaban en poco más que el orden de las tarjetas, así que
 *  la pregunta "¿en cuál de las dos hago el contrato?" no tenía buena
 *  respuesta. Ahora hay una sola, y el contrato vive al lado del mapa. */
const TABS: {
  id: ViewMode; label: string; Icon: typeof Grid2x2; para: string; grupo: "operar" | "diseñar";
}[] = [
  // Negociar y Resumen eran dos pestañas que mostraban casi lo mismo: las dos
  // abrían con el plano de la sede. Ahora son una sola — el mapa es el mismo y
  // el contrato se llena en el riel de la derecha, sin cambiar de pantalla.
  { id: "kpis",     label: "Sede",      Icon: Handshake, grupo: "operar",
    para: "Cómo va la sede y dónde se vende: tocás un espacio en el mapa y llenás el contrato ahí mismo" },
  { id: "montaje",  label: "Montajes",  Icon: Camera,    grupo: "operar",
    para: "Confirmar con foto que la exhibición quedó armada" },
  { id: "map",      label: "Plano",     Icon: Grid2x2,   grupo: "diseñar",
    para: "Dibujar la tienda vista desde arriba y editar los muebles" },
  { id: "store",    label: "Editor 3D", Icon: Box,       grupo: "diseñar",
    para: "Ver la tienda en 3D y aplicar las artes del proveedor" },
];

interface TopbarProps {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  isAdmin: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}

function Topbar({ viewMode, setViewMode, isAdmin, onOpenSettings, onLogout }: TopbarProps) {
  // A worker gets the dashboard and the mount screen: confirming a mount is
  // literally their job, and it is the one thing they are allowed to write.
  const visibleTabs = isAdmin
    ? TABS
    : TABS.filter((t) => t.id === "kpis" || t.id === "montaje");

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
        {visibleTabs.map(({ id, label, Icon, para, grupo }, i) => {
          const active = viewMode === id;
          // Una línea fina separa "operar" de "diseñar la tienda": son dos
          // trabajos distintos y mezclarlos era parte de la confusión.
          const abreGrupo = i > 0 && visibleTabs[i - 1].grupo !== grupo;
          return (
            <span key={id} style={{ display: "flex", alignItems: "center" }}>
            {abreGrupo && (
              <span
                aria-hidden
                style={{
                  width: 1, height: 18, margin: "0 7px",
                  background: "var(--line)", flexShrink: 0,
                }}
              />
            )}
            <button
              onClick={() => setViewMode(id)}
              title={para}
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
            </span>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Server sync state — click to sync now */}
        <SyncStatus />

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
  // Arriving from the mount email opens that screen straight away, on the
  // space the email was about.
  const mountCode = MOUNT_DEEP_LINK;
  const [viewMode, setViewMode] = useState<ViewMode>(mountCode ? "montaje" : "kpis");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = useAuthStore(selectIsAdmin);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  // A worker may only be on the dashboard or the mount screen.
  useEffect(() => {
    if (role === "worker" && viewMode !== "kpis" && viewMode !== "montaje") {
      setViewMode("kpis");
    }
  }, [role, viewMode]);

  const effectiveMode: ViewMode =
    isAdmin || viewMode === "montaje" ? viewMode : "kpis";

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
        ) : effectiveMode === "montaje" ? (
          <MountView initialCode={mountCode} onDone={() => setViewMode("kpis")} />
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
