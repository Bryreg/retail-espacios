import { useEffect, useState } from "react";
import { login, getClientes, type ClienteBreve } from "../api/auth";
import { useAuthStore } from "../store/authStore";

// ─── Login page ──────────────────────────────────────────────────────────────
//
// Acá había un cuadrado redondeado con cuatro puntos adentro, del mismo color
// que el botón. No significaba nada: era un ícono de aplicación genérico, de
// los que se dibujan cuando todavía no hay marca. Ahora el nombre se sostiene
// solo, que es lo que hace una marca que no necesita presentarse.
//
// Y todo alineado a la izquierda. Un formulario centrado en medio de la
// pantalla es la plantilla de ingreso de cualquier producto; alineado, con la
// regla arriba, se lee como la portada de un instrumento.

const etiquetaStyle: React.CSSProperties = {
  display: "block", marginBottom: 5,
  fontSize: 12, fontWeight: 500,
  color: "var(--ink-3)",
};

export default function Login() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // La lista de supermercados. **El selector aparece sólo cuando hay más de
  // uno:** para las tiendas que ya usan esto, la pantalla de ingreso sigue
  // siendo exactamente la de ayer. Si la lista no carga —red caída, servidor
  // dormido— se entra igual, y el servidor resuelve el único cliente que haya.
  const [clientes, setClientes] = useState<ClienteBreve[]>([]);
  const [cliente, setCliente] = useState("");

  useEffect(() => {
    getClientes()
      .then((lista) => {
        setClientes(lista);
        if (lista.length === 1) setCliente(lista[0].slug);
      })
      .catch(() => setClientes([]));
  }, []);

  const varios = clientes.length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    if (varios && !cliente) {
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const r = await login(password, cliente || undefined);
      setAuth(r.token, r.role, r.cliente, r.cliente_nombre);
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
          width: "100%", maxWidth: 348,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          padding: "26px 28px 28px",
          display: "flex", flexDirection: "column", alignItems: "flex-start",
        }}
      >
        <div style={{ width: "100%", borderTop: "2px solid var(--ink-1)", marginBottom: 14 }} />

        <h1
          style={{
            margin: "0 0 2px", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.02em", color: "var(--ink-1)",
          }}
        >
          RECABRA
        </h1>
        <p style={{ margin: "0 0 26px", fontSize: 12.5, color: "var(--ink-3)" }}>
          Gestión de espacios comerciales
        </p>

        <form onSubmit={submit} style={{ width: "100%" }}>
          {varios && (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="login-cliente" style={etiquetaStyle}>
                Supermercado
              </label>
              <select
                id="login-cliente"
                value={cliente}
                onChange={(e) => {
                  setCliente(e.target.value);
                  setError(false);
                }}
                style={{
                  width: "100%", height: 38, padding: "0 10px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  color: cliente ? "var(--ink-1)" : "var(--ink-4)",
                  fontSize: 13, fontFamily: "inherit",
                  outline: "none",
                }}
              >
                <option value="">Elegí el supermercado…</option>
                {clientes.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <label htmlFor="login-password" style={etiquetaStyle}>
            Clave de acceso
          </label>
          <input
            id="login-password"
            type="password"
            autoFocus={!varios}
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
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--r-md)",
              background: "var(--accent)", color: "#fff",
              border: "none",
              cursor: loading || !password ? "default" : "pointer",
              opacity: loading || !password ? 0.6 : 1,
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                            transition: "opacity .12s, background .12s",
            }}
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
