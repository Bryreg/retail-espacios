import { Cloud, CloudOff, RefreshCw, AlertTriangle, UploadCloud } from "lucide-react";
import { useFixtureStore, selectHasPendingWork } from "../../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";

/**
 * Honest, always-visible state of the connection with the server.
 *
 * The old control was a single "↑ Subir al servidor" button that pushed only
 * the active sede, never pulled, swallowed every failure and then reported
 * "✓ Sincronizado" regardless — so a workstation could look perfectly in sync
 * while showing data nobody else had.
 */
export default function SyncStatus() {
  const syncState = useFixtureStore((s) => s.syncState);
  const syncMessage = useFixtureStore((s) => s.syncMessage);
  const lastSyncedAt = useFixtureStore((s) => s.lastSyncedAt);
  const conflicts = useFixtureStore((s) => s.conflicts);
  const hasPending = useFixtureStore(selectHasPendingWork);
  const isAdmin = useAuthStore(selectIsAdmin);

  const busy = syncState === "pulling" || syncState === "pushing";
  const conflictSedes = Object.keys(conflicts);

  async function handleSync() {
    if (busy) return;
    const store = useFixtureStore.getState();
    // Push first so local work is never lost, then pull everyone else's.
    if (isAdmin) await store.flushPending();
    await store.syncFromServer();
  }

  const { label, color, Icon } = (() => {
    if (conflictSedes.length > 0)
      return { label: "Conflicto", color: "var(--warning, #B45309)", Icon: AlertTriangle };
    if (syncState === "pulling") return { label: "Actualizando…", color: "var(--ink-3)", Icon: RefreshCw };
    if (syncState === "pushing") return { label: "Guardando…", color: "var(--ink-3)", Icon: UploadCloud };
    if (syncState === "error") return { label: "Sin conexión", color: "#B91C1C", Icon: CloudOff };
    if (hasPending) return { label: "Cambios sin subir", color: "var(--ink-2)", Icon: UploadCloud };
    return { label: "Sincronizado", color: "var(--success, #15803D)", Icon: Cloud };
  })();

  const lastSyncLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleSync}
        disabled={busy}
        title={
          syncMessage ??
          (lastSyncLabel ? `Última sincronización ${lastSyncLabel}` : "Sincronizar con el servidor")
        }
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 26, padding: "0 9px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          background: "transparent",
          color,
          fontSize: 11.5, fontWeight: 500, fontFamily: "inherit",
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Icon
          size={13}
          style={busy ? { animation: "spin 1s linear infinite" } : undefined}
        />
        {label}
      </button>

      {conflictSedes.length > 0 && (
        <div
          style={{
            position: "absolute", top: 32, right: 0, zIndex: 60,
            width: 290, padding: 12,
            borderRadius: "var(--r-lg)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginBottom: 6 }}>
            Cambios en conflicto
          </p>
          {conflictSedes.map((sede) => (
            <div key={sede} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45, marginBottom: 6 }}>
                {conflicts[sede]}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => useFixtureStore.getState().resolveConflict(sede, "server")}
                  style={conflictBtn(false)}
                >
                  Usar la del servidor
                </button>
                <button
                  onClick={() => useFixtureStore.getState().resolveConflict(sede, "mine")}
                  style={conflictBtn(true)}
                >
                  Conservar la mía
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function conflictBtn(primary: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "5px 6px", borderRadius: "var(--r-sm)",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    border: primary ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "var(--accent-ink, #fff)" : "var(--ink-2)",
  };
}
