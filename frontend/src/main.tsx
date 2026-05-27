import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateFromLegacy } from "./store/fixtureStore";

// One-time migration from old per-editor localStorage keys to the unified store.
migrateFromLegacy();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
