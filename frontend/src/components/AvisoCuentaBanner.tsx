import { useAuthStore } from "../store/authStore";

/**
 * Banner persistente de `aviso_cuenta` — `gracia` y `solo_lectura`.
 *
 * No es modal, no bloquea nada: la sesión sigue andando exactamente igual,
 * esto sólo la acompaña arriba de todo. `suspendido` NO pasa por acá — ese
 * estado reemplaza la pantalla entera (ver `BloqueoCuenta`), así que si
 * llegó hasta este componente ya no hay nada más que dibujar debajo.
 */
export default function AvisoCuentaBanner() {
  const aviso = useAuthStore((s) => s.avisoCuenta);
  if (!aviso || aviso.estado === "suspendido") return null;

  const soloLectura = aviso.estado === "solo_lectura";

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "baseline", gap: 8,
        padding: "7px 16px",
        background: "var(--warning-50)",
        borderBottom: "1px solid var(--warning-100)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)", whiteSpace: "nowrap" }}>
        {soloLectura ? "Cuenta en solo lectura" : "Pago pendiente"}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
        {aviso.motivo}
        {soloLectura && " — no se pueden guardar cambios hasta regularizar el pago."}
      </span>
    </div>
  );
}
