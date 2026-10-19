import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/** Qué hacer para que el guardado pendiente entre.
 *
 *  Es la mitad que vuelve útil el aviso: decir que no se guardó, sin decir qué
 *  destraba, deja a alguien mirando un cartel rojo que no se va. Se arma con
 *  los códigos que mandó el servidor porque los dos rechazos se destraban de
 *  maneras distintas, y pueden coincidir en sedes distintas a la vez. */
function salidaDelRechazo(codes: string[]): string {
  const hay = new Set(codes);
  const salidas: string[] = [];
  if (hay.has("nombres_repetidos")) {
    salidas.push("Corregí el nombre en el plano");
  }
  if (hay.has("contratos_vivos")) {
    // No se cancela solo: es plata y un compromiso con un proveedor.
    salidas.push(
      "Cancelá el contrato desde el espacio, o volvé a poner el mueble en el plano",
    );
  }
  if (hay.has("partes_vendidas")) {
    // Una puerta vendida no cambia de lugar: lo que se firmó es esa puerta.
    salidas.push(
      "Dejá las puertas como estaban, o esperá a que termine o cancelá el contrato de la puerta desde el espacio",
    );
  }
  if (hay.has("nombre_reservado")) {
    salidas.push("Elegí otro nombre para el mueble: no puede terminar como el código de una parte");
  }
  if (salidas.length === 0) return "Revisá lo que dice el servidor.";
  return `${salidas.join(", o bien: ")} y se guarda solo.`;
}

export default function SyncStatus() {
  const syncState = useFixtureStore((s) => s.syncState);
  const syncMessage = useFixtureStore((s) => s.syncMessage);
  const lastSyncedAt = useFixtureStore((s) => s.lastSyncedAt);
  const conflicts = useFixtureStore((s) => s.conflicts);
  // Lo que el SERVIDOR rechazó por su regla. No es lo mismo que un conflicto
  // entre dos equipos ni que estar sin red, y por eso se lee aparte.
  const rechazos = useFixtureStore((s) => s.rechazos);
  const fixturesBySede = useFixtureStore((s) => s.fixturesBySede);
  const hasPending = useFixtureStore(selectHasPendingWork);
  const isAdmin = useAuthStore(selectIsAdmin);

  const busy = syncState === "pulling" || syncState === "pushing";
  const conflictSedes = Object.keys(conflicts);
  const hayConflicto = conflictSedes.length > 0;
  const rechazoSedes = Object.keys(rechazos);
  const hayRechazo = rechazoSedes.length > 0;
  const hayPanel = hayConflicto || hayRechazo;

  // ── Dónde dibujar el panel ────────────────────────────────────────────────
  // El header lleva `overflow: hidden` para que la fila de pestañas no lo
  // desborde en pantallas angostas, y eso RECORTABA este panel: se veía la
  // tirita de arriba y los dos botones quedaban afuera, así que un conflicto
  // no se podía resolver desde la interfaz. Va por portal a `body`, anclado
  // al botón, para que ningún contenedor lo pueda cortar.
  const anclaRef = useRef<HTMLDivElement>(null);
  const [caja, setCaja] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!hayPanel) { setCaja(null); return; }
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
  }, [hayPanel]);

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

  /* El estado se dice con un PUNTO y su PALABRA (hoja de piezas del rediseño,
     «Las dos barras de arriba»): el punto lleva el color y la palabra el
     dato, así que nunca depende sólo del color. Antes era una pastilla con
     borde y una nube; la nube no decía nada que la palabra no dijera.
     `alarma` pinta también la palabra: es lo único de la barra que pide que
     alguien haga algo. */
  const { label, color, alarma } = (() => {
    if (hayConflicto)
      return { label: "Conflicto", color: "var(--warning)", alarma: true };
    // El servidor contestó, no escribió nada y dijo por qué. Decir «Sin
    // conexión» acá —que es lo que pasaba, con la nube tachada— manda a
    // revisar el wifi por un nombre repetido que está explicado abajo, en el
    // panel. Es la misma clase de cosa que el conflicto: algo que hay que
    // resolver, no algo que se arregle solo.
    if (hayRechazo)
      return { label: "Rechazado por el servidor", color: "var(--danger)", alarma: true };
    if (syncState === "pulling") return { label: "Actualizando…", color: "var(--ink-4)", alarma: false };
    if (syncState === "pushing") return { label: "Guardando…", color: "var(--ink-4)", alarma: false };
    if (syncState === "error") return { label: "Sin conexión", color: "var(--danger)", alarma: true };
    if (hasPending) return { label: "Cambios sin subir", color: "var(--ink-3)", alarma: false };
    return { label: "Sincronizado", color: "var(--libre)", alarma: false };
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
        aria-label={`${label}. Sincronizar con el servidor`}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 6px",
          borderRadius: "var(--r-md)",
          border: "none",
          background: "transparent",
          color: alarma ? color : "var(--ink-2)",
          fontSize: "var(--t-xs)", fontWeight: 500, fontFamily: "inherit",
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: color,
            animation: busy ? "pulso-sync 1s ease-in-out infinite alternate" : undefined,
          }}
        />
        {label}
      </button>

      {hayPanel && caja && createPortal(
        <div
          role="dialog"
          aria-label={hayRechazo ? "El servidor rechazó el guardado" : "Cambios en conflicto"}
          style={{
            position: "fixed", top: caja.top, right: caja.right, zIndex: 200,
            width: 320, padding: 12,
            borderRadius: "var(--r-lg)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))",
          }}
        >
          {/* ── El servidor rechazó el guardado ─────────────────────────────
              Va ARRIBA y con el texto entero, no en un tooltip: el servidor
              contestó una cosa accionable —qué nombre y en qué muebles— y es lo
              único que hace falta para arreglarlo. No hay botón: forzar volvería
              a pasar por la misma comprobación y volvería a fallar, así que
              «Conservar la mía» sería un lazo. Lo que destraba esto es corregir
              el nombre en el plano, y entonces el reintento entra solo. */}
          {hayRechazo && (
            <div style={{ marginBottom: hayConflicto ? 14 : 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>
                El servidor no guardó el plano
              </p>
              {rechazoSedes.map((sede) => (
                <div key={sede} style={{ marginBottom: 8 }}>
                  {rechazoSedes.length > 1 && (
                    <p style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.03em",
                      textTransform: "uppercase", marginBottom: 2 }}>
                      {sede}
                    </p>
                  )}
                  <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
                    {rechazos[sede].message}
                  </p>
                  {rechazos[sede].choques.length > 0 && (
                    <ul style={{
                      margin: "5px 0 0", paddingLeft: "1.05em",
                      fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45,
                    }}>
                      {rechazos[sede].choques.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  )}
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 2 }}>
                No se escribió nada en el servidor y el cambio sigue en esta computadora, sin
                subir. {salidaDelRechazo(rechazoSedes.map((x) => rechazos[x].code))}
              </p>
            </div>
          )}

          {hayConflicto && (
            <>
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
            </>
          )}
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
