import { useEffect, useState } from "react";
import type { UnifiedFixture } from "../../types/fixtures";
import { fetchDeleteImpact } from "../../api/layout";
import type { DeleteImpact } from "../../api/layout";
import { lineasDelImpacto } from "../../utils/impactoDeSede";

/**
 * Los diálogos de una sede (renombrar, el renombre rechazado y borrar). Viven
 * en su propio archivo y no adentro de `FloorPlan2D.tsx` porque Ajustes › Sedes
 * también los abre: importados de allá, el plano 2D entero (≈190 kB) entraba en
 * el pedazo de entrada del tablero (auditoría P2-20).
 */

// ─── Renombrar sede: el aviso ────────────────────────────────────────────────

/**
 * Renombrar una sede con contratos activos o reservas provisionales de
 * participación los pasa al nombre nuevo (fase 2 · I5: el renombre es del
 * servidor y no pierde nada). Este diálogo lo dice antes, con el texto de
 * `avisoDelRenombre`, y deja seguir o no.
 */
export function RenombrarSedeDialog({ de, a, aviso, onCancel, onConfirm }: {
  de: string; a: string; aviso: string; onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={`Renombrar la sede «${de}»`} data-renombrar-sede
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>
          Renombrar «{de}» a «{a}»
        </div>
        <p style={{ margin: 0, padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{aviso}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCancel} autoFocus
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "1px solid var(--line)",
              background: "var(--surface)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Dejar el nombre
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "none", background: "var(--accent)",
              color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Renombrar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * El renombre que el servidor no hizo (fase 2 · I5): ya hay una sede con ese
 * nombre, otro equipo guardó el plano en el medio, un código destino está
 * tomado… Se dice por qué, con sus motivos, y la sede queda como estaba.
 */
export function RenombreRechazadoDialog({ de, a, error, motivos, onCerrar }: {
  de: string; a: string; error: string; motivos: string[]; onCerrar: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);
  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        role="alertdialog" aria-modal="true" aria-label={`No se renombró «${de}»`} data-renombre-rechazado
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)", fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>
          «{de}» no se renombró a «{a}»
        </div>
        <p style={{ margin: 0, padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{error}</p>
        {motivos.length > 0 && (
          <ul style={{ margin: 0, padding: "6px 18px 4px 34px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
            {motivos.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCerrar} autoFocus
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "1px solid var(--line)",
              background: "var(--surface)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete sede confirmation ────────────────────────────────────────────────

/**
 * Deleting a sede drops its whole floor plan, for everyone, and cannot be
 * undone. It asks for the name to be typed back on purpose: this project has
 * already lost a sede's real data to an accidental wipe, and a one-click bin
 * next to the rename pencil is exactly how that happens again.
 */
export function DeleteSedeDialog({
  sede, fixtures, onCancel, onConfirm,
}: {
  sede: string;
  fixtures: UnifiedFixture[];
  /** Resolves to an error message when the deletion failed, or null on success. */
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Contracts saved with "Guardar contrato" live in the normalised tables, a
  // different set from the layout snapshot this dialog counts. Deleting the
  // sede closes them, so the number belongs here — and only the server has it.
  const [impact, setImpact] = useState<DeleteImpact | null>(null);

  useEffect(() => {
    let live = true;
    fetchDeleteImpact(sede)
      .then((r) => { if (live) setImpact(r); })
      .catch(() => { /* the counts below still stand on their own */ });
    return () => { live = false; };
  }, [sede]);

  // Contracts hide in three places: the fixture itself (face A), `faceB` on a
  // double gondola, and one per shelf in `slots` when the mueble is
  // commercialised shelf by shelf. Counting only the first two reported zero
  // for a sede whose every shelf was sold.
  const filled = (v?: string) => (v ?? "").trim().length > 0;
  const withContract = fixtures.filter(
    (f) => filled(f.supplierName) || filled(f.faceB?.supplierName),
  ).length;
  const slotsWithContract = fixtures.reduce(
    (n, f) => n + (f.slots ?? []).filter((sl) => filled(sl.supplierName)).length,
    0,
  );
  const armed = typed.trim().toUpperCase() === sede.trim().toUpperCase();

  const confirm = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    // On success the dialog is unmounted by the parent; only a failure returns.
    if (err) { setError(err); setBusy(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(26,24,20,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%", background: "var(--surface)",
          border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-1)", letterSpacing: "-0.01em" }}>
            Eliminar la sede «{sede}»
          </div>
        </div>

        <div style={{ padding: "14px 18px 4px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Se borra el plano completo de esta sede{" "}
            <strong style={{ color: "var(--ink-1)" }}>en todos los computadores</strong>. Queda 30 días en la
            papelera de Ajustes › Sedes, desde donde se restaura.
          </p>

          <div
            style={{
              margin: "12px 0", padding: "10px 12px", borderRadius: "var(--r-lg)",
              border: "1px solid var(--danger-100)", background: "var(--danger-50)",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--ink-1)", fontWeight: 600 }}>
              {fixtures.length} mueble{fixtures.length !== 1 ? "s" : ""} en el plano
            </div>
            {withContract > 0 && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {withContract} con proveedor asignado
              </div>
            )}
            {slotsWithContract > 0 && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {slotsWithContract} balda{slotsWithContract !== 1 ? "s" : ""} con proveedor asignado
              </div>
            )}
            {/* Lo que cuenta el servidor: los contratos que se cierran y las
                reservas provisionales de participación que se cancelan. */}
            {lineasDelImpacto(impact).map((linea) => (
              <div key={linea} data-impacto style={{ fontSize: 12, color: "var(--danger)", marginTop: 3 }}>
                {linea}
              </div>
            ))}
          </div>

          <p style={{ margin: "0 0 12px" }}>
            {impact !== null && impact.active_leases > 0
              ? "Los contratos se cierran y quedan archivados: siguen en la base de datos con su valor y sus fechas, pero dejan de avisar por vencimiento. "
              : ""}
            {impact !== null && (impact.reservas_vivas ?? 0) > 0
              ? "Las reservas provisionales pasan a canceladas y quedan en el historial de su cara. "
              : ""}
            El tablero pierde los ingresos, la ocupación y los vencimientos de esta sede.
          </p>

          <label style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>
            Escribí <strong style={{ fontFamily: "var(--font-mono)", color: "var(--ink-1)" }}>{sede}</strong> para confirmar:
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }}
            autoFocus
            disabled={busy}
            style={{
              width: "100%", height: 34, padding: "0 10px", boxSizing: "border-box",
              borderRadius: "var(--r-md)", border: `1px solid ${armed ? "var(--danger)" : "var(--line)"}`,
              background: "var(--surface-2)", color: "var(--ink-1)",
              fontSize: 12.5, fontFamily: "var(--font-mono)", outline: "none",
            }}
          />

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10, padding: "8px 10px", borderRadius: "var(--r-md)",
                border: "1px solid var(--danger-100)", background: "var(--danger-50)",
                fontSize: 12, color: "var(--danger)", lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px 16px" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)",
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--ink-2)", fontSize: 12.5, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void confirm()}
            disabled={!armed || busy}
            style={{
              height: 32, padding: "0 14px", borderRadius: "var(--r-md)", border: "none",
              background: armed && !busy ? "var(--danger)" : "var(--surface-3)",
              color: armed && !busy ? "#fff" : "var(--ink-4)",
              fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
              cursor: armed && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Eliminando…" : "Eliminar sede"}
          </button>
        </div>
      </div>
    </div>
  );
}
