import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateFromLegacy, useFixtureStore } from "./store/fixtureStore";

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

// Load all sede layouts from the server — replaces localStorage when server has data.
useFixtureStore.getState().syncFromServer();

// Flush any pending debounced save when the user closes the tab
window.addEventListener("beforeunload", () => {
  const state = useFixtureStore.getState();
  const sede = state.sede;
  const fixtures = state.fixturesBySede[sede] ?? [];
  if (fixtures.length > 0) {
    // sendBeacon is fire-and-forget, works during page unload
    navigator.sendBeacon(
      `/api/layout/${encodeURIComponent(sede)}`,
      new Blob([JSON.stringify({ fixtures })], { type: "application/json" })
    );
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
