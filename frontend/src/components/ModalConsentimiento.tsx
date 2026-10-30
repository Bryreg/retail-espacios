import { useState } from "react";
import { aceptarPolitica } from "../api/auth";
import { describeError } from "../api/client";
import { aceptarTerminos } from "../api/legal";
import { useAuthStore } from "../store/authStore";
import { useModalAbierto } from "../tema";

/**
 * Aviso post-login de Fase 3 compliance — NO es un muro.
 *
 * Aparece cuando el login trajo `pedir_consentimiento: true` (cuenta con
 * membresía que nunca aceptó la versión vigente de la Política de
 * Tratamiento de Datos) o `pedir_terminos` (la dueña de un supermercado que
 * todavía no aceptó la versión vigente de los Términos del servicio; sólo
 * cuando el dueño de RECABRA los publicó, auditoría P0-2). Un solo aviso para
 * las dos cosas: dice lo que falta y «Aceptar» registra cada una.
 *
 * "Ahora no" lo cierra sin llamar al backend y la app sigue andando igual; se
 * vuelve a mostrar recién en el PRÓXIMO login, porque el store lo pone de
 * nuevo en cada uno (ver `store/authStore.ts`). "Aceptar" registra
 * (`POST /api/auth/aceptar-politica` y/o `/aceptar-terminos`) y cierra.
 *
 * Se dibuja como superposición, no a pantalla completa como
 * `BloqueoCuenta`: a diferencia de una cuenta suspendida, acá no hay nada
 * que bloquear.
 */
export default function ModalConsentimiento() {
  const pidePolitica = useAuthStore((s) => s.pedirConsentimiento);
  const versionTerminos = useAuthStore((s) => s.pedirTerminos);
  const descartarPolitica = useAuthStore((s) => s.descartarConsentimiento);
  const setPedirTerminos = useAuthStore((s) => s.setPedirTerminos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descartar = () => {
    descartarPolitica();
    setPedirTerminos(null);
  };

  const aceptar = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pidePolitica) {
        await aceptarPolitica();
        descartarPolitica();
      }
      if (versionTerminos) {
        await aceptarTerminos(versionTerminos);
        setPedirTerminos(null);
      }
    } catch (err) {
      setError(describeError(err, "No se pudo registrar la aceptación. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  };

  // Mientras este aviso está puesto, ÉL es la pantalla: se lleva el amarillo y
  // el botón principal del tablero de atrás pasa a tinta.
  useModalAbierto();

  const titulo = pidePolitica && versionTerminos
    ? "Actualizamos la política de datos y los términos del servicio"
    : versionTerminos
      ? "Publicamos los Términos del servicio"
      : "Actualizamos la Política de Tratamiento de Datos";
  const enlace = { fontSize: 12, fontWeight: 600, color: "var(--accent)", display: "block", marginTop: 6 } as const;

  return (
    <div
      data-capa-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-consentimiento"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)", padding: 20,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 420,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          padding: "24px 26px 22px",
        }}
      >
        <h2 id="titulo-consentimiento" style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>
          {titulo}
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {versionTerminos
            ? "Como dueña del supermercado, hace falta que los revises y los aceptes en su nombre."
            : "Para seguir usando RECABRA con tu cuenta hace falta que la revises y la aceptes."}{" "}
          Podés seguir trabajando ahora y hacerlo más tarde — te lo vamos a volver a pedir la
          próxima vez que entres.
        </p>
        {pidePolitica && (
          <a href="/politica-datos" target="_blank" rel="noreferrer" style={enlace}>
            Leer la Política de Tratamiento de Datos Personales →
          </a>
        )}
        {versionTerminos && (
          <a href="/terminos" target="_blank" rel="noreferrer" style={enlace}>
            Leer los Términos del servicio (versión {versionTerminos}) →
          </a>
        )}

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
            className="btn-principal"
            type="button"
            onClick={aceptar}
            disabled={busy}
            style={{
              flex: 1, height: 38,
              borderRadius: "var(--r-md)",
              fontSize: 13, fontFamily: "inherit",
            }}
          >
            {busy ? "Guardando…" : "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}
