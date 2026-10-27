import { useEffect, useState } from "react";
import { leerResumen, ponerQuienPublica, type QuienPublica } from "../../api/planogramas";
import { describeError } from "../../api/client";

/**
 * Ajustes › Equipo › Permisos (rediseño UX 2026-10, etapa 8): quién planifica
 * y publica planogramas. Antes vivía sólo adentro de «Planificar la cara»; es
 * la misma llamada (`PUT /planogramas/ajustes`).
 */
export default function PermisosDePlanogramas({ sede }: { sede: string }) {
  const [quien, setQuien] = useState<QuienPublica | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    leerResumen(sede).then((r) => setQuien(r.quien_publica))
      .catch((e) => setMsg({ ok: false, text: describeError(e, "No se pudo leer quién publica.") }));
  }, [sede]);
  async function poner(q: QuienPublica) {
    setMsg(null);
    try { const r = await ponerQuienPublica(q); setQuien(r.quien_publica); setMsg({ ok: true, text: "Guardado." }); }
    catch (e) { setMsg({ ok: false, text: describeError(e, "No se pudo guardar.") }); }
  }
  return (
    <div data-permisos-planogramas>
      <div className="aj-opciones" role="radiogroup" aria-label="Quién planifica y publica planogramas">
        <label><input type="radio" name="quien-publica" checked={quien === "admin"} disabled={quien === null} onChange={() => poner("admin")} />
          <span><b>Sólo administración</b><small>Planifica y publica en todos los muebles.</small></span></label>
        <label><input type="radio" name="quien-publica" checked={quien === "equipo"} disabled={quien === null} onChange={() => poner("equipo")} />
          <span><b>También el equipo</b><small>El equipo planifica sólo los muebles que no se venden.</small></span></label>
      </div>
      {msg && <p className={msg.ok ? "aj-ok" : "aj-error"} role="status">{msg.text}</p>}
    </div>
  );
}
