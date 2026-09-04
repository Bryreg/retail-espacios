import { useState } from "react";
import { aceptarPolitica } from "../api/auth";
import { describeError } from "../api/client";
import { useAuthStore } from "../store/authStore";

/**
 * Aviso post-login de Fase 3 compliance — NO es un muro.
 *
 * Aparece cuando el login trajo `pedir_consentimiento: true` (cuenta con
 * membresía que nunca aceptó la versión vigente de la Política de
 * Tratamiento de Datos). "Ahora no" lo cierra sin llamar al backend y la
 * app sigue andando igual; se vuelve a mostrar recién en el PRÓXIMO login,
 * porque `pedirConsentimiento` en el store lo pone `setAuth` de nuevo en
 * cada uno (ver `store/authStore.ts`). "Aceptar" registra la fila
 * (`POST /api/auth/aceptar-politica`) y cierra el aviso igual.
 *
 * Se dibuja como superposición, no a pantalla completa como
 * `BloqueoCuenta`: a diferencia de una cuenta suspendida, acá no hay nada
 * que bloquear.
 */
export default function ModalConsentimiento() {
  const descartar = useAuthStore((s) => s.descartarConsentimiento);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aceptar = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await aceptarPolitica();
      descartar();
    } catch (err) {
      setError(describeError(err, "No se pudo registrar la aceptación. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)", padding: 20,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          padding: "24px 26px 22px",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>
          Actualizamos la Política de Tratamiento de Datos
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          Para seguir usando RECABRA con tu cuenta hace falta que la revises y la
          aceptes. Podés seguir trabajando ahora y hacerlo más tarde — te lo
          vamos a volver a pedir la próxima vez que entres.
        </p>
        <a
          href="/politica-datos"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
        >
          Leer la Política de Tratamiento de Datos Personales →
        </a>

        {error && (
          <div style={{ marginTop: 14, fontSize: 12, fontWeight: 500, color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={descartar}
            disabled={busy}
            style={{
              flex: 1, height: 38,
              borderRadius: "var(--r-md)",
              background: "var(--surface-2)", color: "var(--ink-2)",
              border: "1px solid var(--line)",
              cursor: busy ? "default" : "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={aceptar}
            disabled={busy}
            style={{
              flex: 1, height: 38,
              borderRadius: "var(--r-md)",
              background: "var(--accent)", color: "#fff",
              border: "none",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            {busy ? "Guardando…" : "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}
