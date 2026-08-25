import { useEffect, useState } from "react";
import { previewRecipients, type RecipientPreview } from "../api/auth";

/**
 * Who will be told, shown before the contract is saved.
 *
 * This exists because of a specific failure: hanging up the phone believing
 * the merchandiser was told, when the address book was empty or SMTP was never
 * configured, and the send failed silently in a background task. A tool you
 * cannot trust on that point stops being used.
 *
 * Vivía en los paneles oscuros del editor de plano. Al fusionar Negociar y
 * Resumen en una sola pantalla (commit 12695c2) el contrato se partió en un
 * hook más piezas de presentación y este aviso quedó sin montar: el componente
 * siguió existiendo, nadie lo importó, y la pantalla pasó a afirmar que los
 * avisos salían sin poder saberlo. Ahora vive en la ficha de Vender, con los
 * tokens claros de esa pantalla.
 */
export default function NotifyPreview({ sede }: { sede: string }) {
  const [data, setData] = useState<RecipientPreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    previewRecipients(sede)
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [sede]);

  if (failed) return null;
  if (!data) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "var(--ink-3)" }}>
        Consultando destinatarios…
      </p>
    );
  }

  const total = data.comercial.length + data.montaje.length;
  const warn = "var(--warning)";

  if (!data.smtp_listo) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.45, color: warn }}>
        El correo no está configurado en el servidor: se guarda el contrato pero
        no se avisa a nadie.
      </p>
    );
  }

  if (total === 0) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.45, color: warn }}>
        Nadie va a recibir aviso: no hay contactos cargados para {sede}. Se
        configuran en el ícono de ajustes del encabezado.
      </p>
    );
  }

  const line = (label: string, list: string[], note?: string) =>
    list.length > 0 && (
      <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
        <span style={{ color: "var(--ink-3)", flexShrink: 0 }}>{label}</span>
        <span style={{ color: "var(--ink-2)", wordBreak: "break-word" }}>
          {list.join(", ")}
          {note && <span style={{ color: "var(--ink-3)" }}> {note}</span>}
        </span>
      </div>
    );

  return (
    <div style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.45 }}>
      <span style={{ color: "var(--ink-3)" }}>Al guardar se avisa a:</span>
      {line("Comercial", data.comercial)}
      {line("Montaje", data.montaje, "· sin valores")}
    </div>
  );
}
