import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateFromLegacy, useFixtureStore } from "./store/fixtureStore";
import { useAuthStore } from "./store/authStore";

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

// NOTE: the server pull deliberately does NOT happen here. At module load there
// is usually no session yet, so the request 401'd, the interceptor cleared the
// token, and nothing ever re-pulled after the user logged in — which is why a
// second workstation kept showing its own stale localStorage copy.
// App.tsx starts the sync once the session is authenticated.

// Flush pending debounced saves when the user closes the tab.
// Only admins can PUT /api/layout — fetch with keepalive survives page unload
// and (unlike sendBeacon) can send the Authorization header.
function flushPendingLayout() {
  try {
    const { token, role } = useAuthStore.getState();
    if (!token || role !== "admin") return;
    const state = useFixtureStore.getState();
    // Every sede with unsaved edits, not just the active one.
    const pending = Object.keys(state.dirty).filter((sede) => state.dirty[sede]);
    for (const sede of pending) {
      const fixtures = state.fixturesBySede[sede] ?? [];
      void fetch(`/api/layout/${encodeURIComponent(sede)}`, {
        method: "PUT",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fixtures,
          base_updated_at: state.serverRev[sede] ?? null,
        }),
      }).catch(() => {
        /* fire-and-forget */
      });
    }
  } catch {
    /* fire-and-forget */
  }
}

window.addEventListener("pagehide", flushPendingLayout);
window.addEventListener("beforeunload", flushPendingLayout);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
