import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useFixtureStore, normalizeSede } from "../../store/fixtureStore";
import { fetchDeleteImpact, type DeleteImpact } from "../../api/layout";
import { avisoDelRenombre } from "../../utils/impactoDeSede";
import { DeleteSedeDialog, RenombrarSedeDialog, RenombreRechazadoDialog } from "../FloorPlan2D/FloorPlan2D";
import { isRentable } from "../../types/fixtures";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/**
 * Ajustes › Sede y plano › Sedes (rediseño UX 2026-10, etapa 8): crear,
 * renombrar y eliminar, con los MISMOS diálogos y reglas que el «⋯» de la
 * sede en el Plano —el renombre es del servidor y avisa antes adónde van los
 * contratos y las reservas; eliminar pide escribir el nombre y no deja borrar
 * la última—.
 */
export default function SedesDeAjustes() {
  const sedes = useFixtureStore((s) => s.sedes);
  const activa = useFixtureStore((s) => s.sede);
  const porSede = useFixtureStore((s) => s.fixturesBySede);
  const { addSede, renameSede, removeSede, setSede } = useFixtureStore.getState();
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [nueva, setNueva] = useState("");
  const [enEspera, setEnEspera] = useState<{ de: string; a: string; aviso: string } | null>(null);
  const [fallido, setFallido] = useState<{ de: string; a: string; error: string; motivos: string[] } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const tras = (de: string, a: string, h: { ok: boolean; error?: string; motivos?: string[] }) => {
    if (h.ok) { if (activa === de) setSede(a); return; }
    setFallido({ de, a, error: h.error ?? `No se pudo renombrar «${de}».`, motivos: h.motivos ?? [] });
  };
  async function renombrar(de: string) {
    const a = normalizeSede(nombre);
    setEditando(null);
    if (!a || a === de) return;
    let impacto: DeleteImpact | null = null;
    try { impacto = await fetchDeleteImpact(de); } catch { impacto = null; }
    const aviso = avisoDelRenombre(de, a, impacto);
    if (aviso) { setEnEspera({ de, a, aviso }); return; }
    tras(de, a, await renameSede(de, a));
  }

  return (
    <div className="aj-sedes" data-sedes-ajustes>
      <ul className="aj-lista">
        {sedes.map((s) => {
          const fx = porSede[s] ?? [];
          const muebles = fx.length;
          const contratables = fx.filter((f) => isRentable(f)).length;
          return (
            <li key={s} data-sede={s}>
              {editando === s ? (
                <input className="aj-campo" autoFocus aria-label={`Nuevo nombre de ${s}`} value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void renombrar(s); if (e.key === "Escape") { e.stopPropagation(); setEditando(null); } }}
                  onBlur={() => void renombrar(s)} />
              ) : (
                <span className="aj-sede"><b className="mono">{s}</b>{s === activa && <small> · la de ahora</small>}
                  <small>{muebles} {muebles === 1 ? "mueble" : "muebles"} · {contratables} que se venden</small></span>
              )}
              <span className="aj-fila-acc">
                <button type="button" className="aj-icono" title="Renombrar" aria-label={`Renombrar ${s}`} onClick={() => { setEditando(s); setNombre(s); }}><Pencil {...ICONO} /></button>
                {sedes.length > 1 && (
                  <button type="button" className="aj-icono peligro" title="Eliminar" aria-label={`Eliminar ${s}`} onClick={() => setBorrando(s)}><Trash2 {...ICONO} /></button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <form className="aj-agregar" onSubmit={(e) => { e.preventDefault(); const n = normalizeSede(nueva); if (n) { addSede(n); setNueva(""); } }}>
        <input className="aj-campo" placeholder="Nombre de la sede nueva" aria-label="Nombre de la sede nueva" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button type="submit" className="aj-btn" disabled={!normalizeSede(nueva)}><Plus {...ICONO} /> Agregar sede</button>
      </form>
      <p className="aj-nota">El plano de una sede nueva se dibuja en Plano de la sede.</p>

      {enEspera && (
        <RenombrarSedeDialog {...enEspera} onCancel={() => setEnEspera(null)}
          onConfirm={async () => { const { de, a } = enEspera; setEnEspera(null); tras(de, a, await renameSede(de, a)); }} />
      )}
      {fallido && <RenombreRechazadoDialog {...fallido} onCerrar={() => setFallido(null)} />}
      {borrando && (
        <DeleteSedeDialog sede={borrando} fixtures={porSede[borrando] ?? []} onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            const siguiente = sedes.find((s) => s !== borrando);
            const r = await removeSede(borrando);
            if (!r.ok) return r.error ?? "No se pudo eliminar la sede.";
            if (activa === borrando && siguiente) setSede(siguiente);
            setBorrando(null);
            return null;
          }} />
      )}
    </div>
  );
}
