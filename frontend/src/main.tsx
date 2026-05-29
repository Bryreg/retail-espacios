import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateFromLegacy, useFixtureStore } from "./store/fixtureStore";

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

// Load all sede layouts from the server — replaces localStorage when server has data.
useFixtureStore.getState().syncFromServer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
