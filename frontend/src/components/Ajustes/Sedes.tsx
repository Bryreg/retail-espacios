import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useFixtureStore, normalizeSede } from "../../store/fixtureStore";
import { fetchDeleteImpact, fetchPapelera, restaurarSede, type DeleteImpact, type SedeEnPapelera } from "../../api/layout";
import { diaCorto } from "../../utils/supervision";
import { hoyEnColombia } from "../../utils/canon";
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
  /** La papelera (auditoría P2-18): las sedes borradas hace menos de 30 días. */
  const [papelera, setPapelera] = useState<SedeEnPapelera[]>([]);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [avisoPapelera, setAvisoPapelera] = useState<string | null>(null);
  const leerPapelera = useCallback(() => {
    fetchPapelera().then((r) => setPapelera(r.sedes)).catch(() => setPapelera([]));
  }, []);
  useEffect(() => { leerPapelera(); }, [leerPapelera, sedes.length]);
  async function restaurar(p: SedeEnPapelera) {
    setRestaurando(p.id);
    setAvisoPapelera(null);
    try {
      const r = await restaurarSede(p.id);
      await useFixtureStore.getState().syncFromServer();
      setAvisoPapelera(`«${r.sede}» volvió: ${r.espacios} ${r.espacios === 1 ? "espacio" : "espacios"} y ${r.contratos} `
        + `${r.contratos === 1 ? "contrato" : "contratos"} que siguen en fecha.`
        + (r.reservas_canceladas ? " Las reservas provisionales que se cancelaron al borrarla no vuelven." : ""));
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setAvisoPapelera(typeof d === "string" ? d : d?.message ?? `No se pudo restaurar «${p.sede}».`);
    } finally {
      setRestaurando(null);
      leerPapelera();
    }
  }

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

      {(papelera.length > 0 || avisoPapelera) && (
        <section className="aj-papelera" data-papelera-de-sedes aria-label="Papelera de sedes">
          <h4 className="aj-sub">Papelera</h4>
          <p className="aj-nota">Una sede borrada queda acá 30 días. Restaurarla devuelve su plano, sus códigos y los contratos que siguen en fecha.</p>
          {avisoPapelera && <p className="aj-nota" role="status">{avisoPapelera}</p>}
          <ul className="aj-lista">
            {papelera.map((p) => (
              <li key={p.id} data-papelera={p.sede}>
                <span className="aj-sede"><b className="mono">{p.sede}</b>
                  <small>Borrada el {diaCorto(hoyEnColombia(Date.parse(p.borrada_en)))} · se puede restaurar hasta el {diaCorto(hoyEnColombia(Date.parse(p.vence_en)))}</small>
                  <small>{p.muebles} {p.muebles === 1 ? "mueble" : "muebles"} · {p.contratos} {p.contratos === 1 ? "contrato cerrado" : "contratos cerrados"}</small></span>
                <span className="aj-fila-acc">
                  <button type="button" className="aj-btn" disabled={restaurando !== null} onClick={() => void restaurar(p)}>
                    <RotateCcw {...ICONO} /> {restaurando === p.id ? "Restaurando…" : "Restaurar"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
