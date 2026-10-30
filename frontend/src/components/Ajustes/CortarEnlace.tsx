import { useState } from "react";
import client, { describeError } from "../../api/client";

/**
 * Ajustes › Equipo › Cortar un enlace (auditoría pre-lanzamiento, P3-2). Los
 * enlaces de montaje y de guía abren sin contraseña y viven hasta 400 días: si
 * uno se reenvió a quien no correspondía, se pega acá y deja de abrir. Los
 * demás enlaces siguen andando. `POST /api/auth/revocar-enlace`, sólo admin.
 */
export default function CortarEnlace() {
  const [enlace, setEnlace] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function cortar() {
    if (!enlace.trim()) return;
    setHaciendo(true);
    setMsg(null);
    try {
      const r = await client.post<{ revocado: boolean; tipo: "montaje" | "guia" }>("/auth/revocar-enlace", { enlace: enlace.trim() });
      setMsg({ ok: true, text: r.data.tipo === "guia" ? "Listo: esa guía ya no abre con ese enlace." : "Listo: ese enlace de montaje ya no abre." });
      setEnlace("");
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, "No se pudo cortar el enlace.") });
    } finally {
      setHaciendo(false);
    }
  }

  return (
    <div data-cortar-enlace>
      <p className="aj-nota">Si un enlace de montaje o de guía llegó a quien no debía, pegalo acá y deja de abrir. Los demás siguen andando.</p>
      <div className="aj-agregar">
        <label style={{ flex: "1 1 260px", display: "flex" }}>
          <span className="sr-only">Enlace a cortar</span>
          <input className="aj-campo" style={{ flex: 1 }} value={enlace} onChange={(e) => setEnlace(e.target.value)}
            placeholder="Pegá el enlace (…?montar=… o …?guia=…)" />
        </label>
        <button type="button" className="aj-btn" onClick={() => void cortar()} disabled={haciendo || !enlace.trim()}>
          {haciendo ? "Cortando…" : "Cortar el enlace"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "aj-ok" : "aj-error"} role="status">{msg.text}</p>}
    </div>
  );
}
