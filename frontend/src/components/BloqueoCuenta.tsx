import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import MiSuscripcion from "./suscripcion/MiSuscripcion";
import { useEstadoCuentaVivo } from "./suscripcion/useEstadoCuenta";

/**
 * Pantalla de bloqueo a pantalla completa — reemplaza TODA la app cuando el
 * cliente de la sesión está `suspendido`.
 *
 * La ve CUALQUIER rol, no sólo la dueña: el login deja afuera a su gente con
 * un 402, pero si la suspensión llega a mitad de sesión, el interceptor de
 * `api/client.ts` marca `suspendido` para quien esté adentro. Por eso acá no
 * hay un solo monto: la pantalla puede quedar abierta delante de un proveedor,
 * en medio de Vender. La plata está detrás de un clic, «Ver suscripción», y
 * ese botón existe sólo para la dueña (lo dice el servidor por la membresía,
 * no el rol del token).
 *
 * Tampoco el MOTIVO (revisión de C2): el que escribe la operadora es texto
 * libre y puede llevar la deuda. La pantalla dice un texto fijo; el motivo lo
 * lee la dueña en «Ver suscripción».
 *
 * Y se entera sola de que la cuenta volvió a estar al día (C2): consulta
 * `GET /auth/estado-cuenta` al montarse, cada pocos minutos y con «Reintentar».
 * Cuando el servidor dice «activo», el store limpia el aviso y `App.tsx` vuelve
 * a montar la app, sin cerrar sesión.
 */
export default function BloqueoCuenta() {
  const logout = useAuthStore((s) => s.logout);
  const { revisar, revisando, duena, error } = useEstadoCuentaVivo();
  const [verSuscripcion, setVerSuscripcion] = useState(false);

  if (verSuscripcion && duena) {
    return (
      <div style={{ height: "100dvh", background: "var(--bg)", padding: "20px 16px", overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 560, margin: "0 auto",
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
            padding: "18px 22px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h1 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>Suscripción</h1>
            <button type="button" onClick={() => setVerSuscripcion(false)} style={botonSecundario}>
              Volver
            </button>
          </div>
          <MiSuscripcion />
        </div>
      </div>
    );
  }

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
          {duena
            ? "El servicio de este supermercado está suspendido. El motivo y cómo ponerse al día están en la suscripción."
            : "El servicio de este supermercado está suspendido. El dueño ve el motivo y cómo ponerse al día."}
        </p>

        {duena && (
          <button
            type="button"
            onClick={() => setVerSuscripcion(true)}
            style={{ ...botonSecundario, width: "100%", height: 38, marginBottom: 8 }}
          >
            Ver suscripción
          </button>
        )}
        <button
          type="button"
          onClick={() => void revisar()}
          disabled={revisando}
          style={{ ...botonSecundario, width: "100%", height: 38, marginBottom: 8, opacity: revisando ? 0.6 : 1 }}
        >
          {revisando ? "Consultando…" : "Reintentar"}
        </button>
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
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
          {error ?? "Cuando RECABRA reactive la cuenta, esta pantalla se levanta sola: se vuelve a consultar cada pocos minutos."}
        </p>
      </div>
    </div>
  );
}

const botonSecundario = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: 30, padding: "0 12px",
  borderRadius: "var(--r-md)",
  background: "var(--surface)", color: "var(--ink-2)",
  border: "1px solid var(--line)", cursor: "pointer",
  fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
} as const;
