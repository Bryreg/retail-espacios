import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateFromLegacy, useFixtureStore } from "./store/fixtureStore";
import { useAuthStore } from "./store/authStore";

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

// Load all sede layouts from the server — replaces localStorage when server has data.
useFixtureStore.getState().syncFromServer();

// Flush any pending debounced save when the user closes the tab.
// Only admins can PUT /api/layout — fetch with keepalive survives page unload
// and (unlike sendBeacon) can send the Authorization header.
function flushPendingLayout() {
  try {
    const { token, role } = useAuthStore.getState();
    if (!token || role !== "admin") return;
    const state = useFixtureStore.getState();
    const sede = state.sede;
    const fixtures = state.fixturesBySede[sede] ?? [];
    if (fixtures.length === 0) return;
    void fetch(`/api/layout/${encodeURIComponent(sede)}`, {
      method: "PUT",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fixtures }),
    }).catch(() => {
      /* fire-and-forget */
    });
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
