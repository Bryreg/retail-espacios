import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { iniciarTema } from "./tema";
import { migrateFromLegacy, useFixtureStore } from "./store/fixtureStore";
import { useAuthStore } from "./store/authStore";
import { sinComercial } from "./utils/guardadoDelPlano";
import { bytesDe, repartirGuardadoDeSalida } from "./utils/guardadoAlCerrar";
import { LimiteDeError, instalarRecargaPorVersion } from "./components/ErrorDeApp";

// El tema del interior, ANTES del primer render: si el usuario dejó puesto el
// oscuro, tiene que estar puesto cuando pinta el primer frame. Hacerlo dentro de
// un `useEffect` daría un parpadeo de claro en cada carga. Claro por defecto,
// sin leer `prefers-color-scheme` (decisión del dueño, ver `src/tema.tsx`).
iniciarTema();

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

// NOTE: the server pull deliberately does NOT happen here. At module load there
// is usually no session yet, so the request 401'd, the interceptor cleared the
// token, and nothing ever re-pulled after the user logged in — which is why a
// second workstation kept showing its own stale localStorage copy.
// App.tsx starts the sync once the session is authenticated.

// El guardado de salida (auditoría P3-9, `utils/guardadoAlCerrar.ts`): lo que
// quedó sin subir al cerrar la pestaña. Sólo quien administra hace PUT del
// plano. `fetch` con keepalive sobrevive al cierre y, a diferencia de
// `sendBeacon`, lleva la cabecera Authorization; pero el navegador le deja a lo
// sumo 64 KiB en vuelo entre todos los pedidos. Lo que no entra queda «sin
// guardar» (`dirty`, en localStorage): con `beforeunload` se pide confirmar la
// salida y se larga el guardado normal; si no, sube al volver a abrir la app.
/** Lo que ya salió en este cierre, por sede: `beforeunload` y `pagehide`
 *  llegan los dos y el segundo no tiene que volver a mandar lo mismo. */
const enviadoAlCerrar = new Map<string, string>();
let bytesEnVuelo = 0;

function flushPendingLayout(evento: Event) {
  try {
    const { token, role } = useAuthStore.getState();
    if (!token || role !== "admin") return;
    const state = useFixtureStore.getState();
    // Every sede with unsaved edits, not just the active one.
    const pendientes = Object.keys(state.dirty)
      .filter((sede) => state.dirty[sede] && !state.conflicts[sede])
      .map((sede) => ({
        sede,
        cuerpo: JSON.stringify({
          // Geometría y nada más, como `pushSede`: lo comercial es de la base.
          fixtures: sinComercial(state.fixturesBySede[sede] ?? []),
          base_updated_at: state.serverRev[sede] ?? null,
        }),
      }))
      .filter((e) => enviadoAlCerrar.get(e.sede) !== e.cuerpo);
    if (!pendientes.length) return;
    const { mandar, quedan } = repartirGuardadoDeSalida(pendientes, bytesEnVuelo);
    for (const { sede, cuerpo } of mandar) {
      enviadoAlCerrar.set(sede, cuerpo);
      bytesEnVuelo += bytesDe(cuerpo);
      void fetch(`/api/layout/${encodeURIComponent(sede)}`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: cuerpo,
      }).catch(() => {
        /* queda `dirty`: sube al volver a abrir */
      });
    }
    if (quedan.length && evento.type === "beforeunload") {
      // No entra en el envío de salida: que el navegador pregunte antes de
      // irse y, mientras tanto, el guardado de siempre (sin tope de tamaño).
      void useFixtureStore.getState().flushPending();
      evento.preventDefault();
      (evento as BeforeUnloadEvent).returnValue = "";
    }
  } catch {
    /* fire-and-forget: lo no enviado sigue `dirty` */
  }
}

window.addEventListener("pagehide", flushPendingLayout);
window.addEventListener("beforeunload", flushPendingLayout);

// Una versión nueva publicada con la pestaña abierta (P1-19): recarga una vez.
instalarRecargaPorVersion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* La red de seguridad de toda la app (P1-19): un error de render ya no
        deja la pestaña en blanco, deja «Recargar». */}
    <LimiteDeError nivel="app">
      <App />
    </LimiteDeError>
  </StrictMode>
);
