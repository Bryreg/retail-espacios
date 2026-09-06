import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, CloudOff, RefreshCw, AlertTriangle, UploadCloud } from "lucide-react";
import { useFixtureStore, selectHasPendingWork } from "../../store/fixtureStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { fetchRevisions } from "../../api/layout";

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
  const fixturesBySede = useFixtureStore((s) => s.fixturesBySede);
  const hasPending = useFixtureStore(selectHasPendingWork);
  const isAdmin = useAuthStore(selectIsAdmin);

  const busy = syncState === "pulling" || syncState === "pushing";
  const conflictSedes = Object.keys(conflicts);
  const hayConflicto = conflictSedes.length > 0;

  // ── Dónde dibujar el panel ────────────────────────────────────────────────
  // El header lleva `overflow: hidden` para que la fila de pestañas no lo
  // desborde en pantallas angostas, y eso RECORTABA este panel: se veía la
  // tirita de arriba y los dos botones quedaban afuera, así que un conflicto
  // no se podía resolver desde la interfaz. Va por portal a `body`, anclado
  // al botón, para que ningún contenedor lo pueda cortar.
  const anclaRef = useRef<HTMLDivElement>(null);
  const [caja, setCaja] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!hayConflicto) { setCaja(null); return; }
    const medir = () => {
      const r = anclaRef.current?.getBoundingClientRect();
      if (r) {
        setCaja({
          top: r.bottom + 6,
          right: Math.max(8, window.innerWidth - r.right),
        });
      }
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [hayConflicto]);

  // ── Cuántos muebles hay de cada lado ──────────────────────────────────────
  // Elegir entre "la mía" y "la del servidor" a ciegas es lo que da miedo, y
  // el miedo es lo que deja una sede en conflicto para siempre. Con los dos
  // números al lado la decisión se toma en dos segundos.
  const [enServidor, setEnServidor] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!hayConflicto) return;
    let vivo = true;
    fetchRevisions()
      .then((revs) => {
        if (!vivo) return;
        setEnServidor(Object.fromEntries(revs.map((r) => [r.sede, r.count])));
      })
      .catch(() => { /* sin señal: el panel igual sirve, sin los números */ });
    return () => { vivo = false; };
  }, [hayConflicto, conflictSedes.join("|")]);

  async function handleSync() {
    if (busy) return;
    const store = useFixtureStore.getState();
    // Push first so local work is never lost, then pull everyone else's.
    if (isAdmin) await store.flushPending();
    await store.syncFromServer();
  }

  const { label, color, Icon } = (() => {
    if (hayConflicto)
      return { label: "Conflicto", color: "var(--warning)", Icon: AlertTriangle };
    if (syncState === "pulling") return { label: "Actualizando…", color: "var(--ink-3)", Icon: RefreshCw };
    if (syncState === "pushing") return { label: "Guardando…", color: "var(--ink-3)", Icon: UploadCloud };
    if (syncState === "error") return { label: "Sin conexión", color: "var(--danger)", Icon: CloudOff };
    if (hasPending) return { label: "Cambios sin subir", color: "var(--ink-2)", Icon: UploadCloud };
    return { label: "Sincronizado", color: "var(--success)", Icon: Cloud };
  })();

  const lastSyncLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div ref={anclaRef} style={{ position: "relative" }}>
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

      {hayConflicto && caja && createPortal(
        <div
          role="dialog"
          aria-label="Cambios en conflicto"
          style={{
            position: "fixed", top: caja.top, right: caja.right, zIndex: 200,
            width: 320, padding: 12,
            borderRadius: "var(--r-lg)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginBottom: 6 }}>
            Cambios en conflicto
          </p>
          {conflictSedes.map((sede) => {
            const mios = fixturesBySede[sede]?.length ?? 0;
            const suyos = enServidor[sede];
            return (
              <div key={sede} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45, marginBottom: 6 }}>
                  {conflicts[sede]}
                </p>
                <div
                  style={{
                    display: "flex", gap: 6, marginBottom: 7,
                    fontSize: 11, fontFamily: "var(--font-mono)",
                  }}
                >
                  <Cifra etiqueta="Esta computadora" valor={`${mios} muebles`} />
                  <Cifra
                    etiqueta="El servidor"
                    valor={suyos === undefined ? "—" : `${suyos} muebles`}
                  />
                </div>
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
            );
          })}
          <p style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 2 }}>
            «Conservar la mía» sube lo de esta computadora y pisa lo del servidor.
            No borra nada de acá.
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Un número con su etiqueta, para comparar los dos lados de un vistazo. */
function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div
      style={{
        flex: 1, padding: "5px 7px",
        borderRadius: "var(--r-sm)",
        background: "var(--surface-2)",
        border: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.03em",
        textTransform: "uppercase", fontFamily: "inherit" }}>
        {etiqueta}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>{valor}</div>
    </div>
  );
}

function conflictBtn(primary: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "6px 6px", borderRadius: "var(--r-sm)",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    border: primary ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "var(--accent-ink, #fff)" : "var(--ink-2)",
  };
}
