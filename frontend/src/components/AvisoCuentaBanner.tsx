import { useAuthStore } from "../store/authStore";
import { useEstadoCuentaVivo } from "./suscripcion/useEstadoCuenta";

/**
 * Banner persistente de `aviso_cuenta` — `gracia` y `solo_lectura`.
 *
 * No es modal, no bloquea nada: la sesión sigue andando exactamente igual,
 * esto sólo la acompaña arriba de todo. `suspendido` NO pasa por acá — ese
 * estado reemplaza la pantalla entera (ver `BloqueoCuenta`), así que si
 * llegó hasta este componente ya no hay nada más que dibujar debajo.
 *
 * Se ve en Vender, delante de los proveedores: **nunca un monto**. El motivo
 * que escribe el sistema no lleva plata, y a la dueña se le ofrece «Ver
 * suscripción», que abre Configuración → Suscripción: la plata, tras un clic.
 *
 * Está montado siempre en el tablero, aunque no dibuje nada, porque es el que
 * pregunta el estado de la cuenta en vivo (C2): así se entera de una cuenta que
 * pasó a gracia a mitad de sesión —eso no da 402— y de una que volvió a estar
 * al día, sin que nadie vuelva a entrar.
 */
export default function AvisoCuentaBanner({ onVerSuscripcion }: { onVerSuscripcion?: () => void }) {
  const aviso = useAuthStore((s) => s.avisoCuenta);
  const { revisar, revisando, duena } = useEstadoCuentaVivo();
  if (!aviso || aviso.estado === "suspendido") return null;

  const soloLectura = aviso.estado === "solo_lectura";
  const texto =
    aviso.motivo ?? (duena ? null : "El dueño del supermercado ve el detalle y cómo ponerse al día.");

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
        padding: "7px 16px",
        background: "var(--warning-50)",
        borderBottom: "1px solid var(--warning-100)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)", whiteSpace: "nowrap" }}>
        {soloLectura ? "Cuenta en solo lectura" : "Pago pendiente"}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
        {texto}
        {soloLectura && " — no se pueden guardar cambios hasta regularizar el pago."}
      </span>
      {duena && onVerSuscripcion && (
        <button type="button" onClick={onVerSuscripcion} style={botonDeFranja}>
          Ver suscripción
        </button>
      )}
      <button
        type="button"
        onClick={() => void revisar()}
        disabled={revisando}
        title="Volver a consultar el estado de la cuenta"
        style={{ ...botonDeFranja, opacity: revisando ? 0.6 : 1 }}
      >
        {revisando ? "Consultando…" : "Reintentar"}
      </button>
    </div>
  );
}

const botonDeFranja = {
  height: 24, padding: "0 10px",
  borderRadius: "var(--r-md)",
  background: "transparent", color: "var(--ink-2)",
  border: "1px solid var(--warning-100)", cursor: "pointer",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
} as const;
