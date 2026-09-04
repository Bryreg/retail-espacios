import { useAuthStore } from "../store/authStore";

/**
 * Pantalla de bloqueo a pantalla completa — reemplaza TODA la app cuando el
 * cliente de la sesión está `suspendido`.
 *
 * Sólo la ve el owner: es el único rol que llega tan lejos con la cuenta
 * suspendida — worker y admin (legado u oauth) reciben 402 en el login
 * mismo y nunca guardan sesión, así que `avisoCuenta.estado === "suspendido"`
 * en el store sólo puede venir de una sesión de owner. Sin navegación de
 * negocio: la única salida de acá es cerrar sesión.
 */
export default function BloqueoCuenta({ motivo }: { motivo: string }) {
  const logout = useAuthStore((s) => s.logout);

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
          width: "100%", maxWidth: 380,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          padding: "26px 28px 28px",
          display: "flex", flexDirection: "column", alignItems: "flex-start",
        }}
      >
        <div style={{ width: "100%", borderTop: "2px solid var(--danger)", marginBottom: 14 }} />

        <h1 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 700, color: "var(--ink-1)" }}>
          Cuenta suspendida
        </h1>
        <p style={{ margin: "10px 0 22px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {motivo}
        </p>

        <button
          onClick={logout}
          style={{
            width: "100%", height: 38,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "var(--r-md)",
            background: "var(--accent)", color: "#fff",
            border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
