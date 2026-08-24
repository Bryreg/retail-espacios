import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Point the dev server at a SHARED backend so two workstations see the same
// data: create frontend/.env.local with
//   VITE_API_TARGET=https://retail-espacios.onrender.com
// Without it each machine proxies to its own localhost backend (and, with no
// DATABASE_URL, its own private SQLite file) — so nothing can ever sync.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_TARGET || "http://localhost:8000";
  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ["@react-three/drei"],
      include: ["stats.js"],
    },
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          // No rewrite: backend/app/main.py mounts every router with
          // prefix="/api", so the prefix must survive the proxy — locally and
          // against a deployed instance alike. Stripping it (as this config
          // used to) made every dev-server call 404, or 405 once a built
          // frontend/dist existed and the SPA catch-all began swallowing them.
        },
      },
    },
  };
});
