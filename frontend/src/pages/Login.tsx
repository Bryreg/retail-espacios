import { useState } from "react";
import { LogIn } from "lucide-react";
import { login } from "../api/auth";
import { useAuthStore } from "../store/authStore";

// ─── Logo mark (same as Dashboard topbar, scaled up) ─────────────────────────

function LogoMark() {
  return (
    <div
      style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: "var(--accent)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="1.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.55" />
        <rect x="8.5" y="1.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.9" />
        <rect x="1.5" y="8.5" width="4" height="4" rx="0.8" fill="currentColor" />
        <rect x="8.5" y="8.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.7" />
      </svg>
    </div>
  );
}

// ─── Login page ──────────────────────────────────────────────────────────────

export default function Login() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(false);
    try {
      const { token, role } = await login(password);
      setAuth(token, role);
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 360,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "36px 32px 32px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        <LogoMark />

        <h1
          style={{
            margin: "16px 0 4px", fontSize: 20, fontWeight: 800,
            letterSpacing: "0.06em", color: "var(--ink-1)",
          }}
        >
          RECABRA
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 12, color: "var(--ink-3)" }}>
          Gestión de espacios comerciales
        </p>

        <form onSubmit={submit} style={{ width: "100%" }}>
          <label
            htmlFor="login-password"
            style={{
              display: "block", marginBottom: 6,
              fontSize: 10, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--ink-3)",
            }}
          >
            Clave de acceso
          </label>
          <input
            id="login-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="••••••••"
            style={{
              width: "100%", height: 38, padding: "0 12px",
              borderRadius: "var(--r-md)",
              border: `1px solid ${error ? "var(--danger)" : "var(--line)"}`,
              background: "var(--surface-2)",
              color: "var(--ink-1)",
              fontSize: 13, fontFamily: "inherit",
              outline: "none",
              transition: "border-color .12s, box-shadow .12s",
            }}
            onFocus={(e) => {
              if (!error) e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-50)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />

          {error && (
            <div
              style={{
                marginTop: 8, fontSize: 12, fontWeight: 500,
                color: "var(--danger)",
              }}
            >
              Clave incorrecta
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%", height: 38, marginTop: 16,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              borderRadius: "var(--r-md)",
              background: "var(--accent)", color: "#fff",
              border: "none",
              cursor: loading || !password ? "default" : "pointer",
              opacity: loading || !password ? 0.6 : 1,
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              boxShadow: "var(--shadow-sm)",
              transition: "opacity .12s, background .12s",
            }}
          >
            <LogIn size={14} />
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
