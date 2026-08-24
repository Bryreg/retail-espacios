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
          // The local dev backend serves the API at the root, while a deployed
          // instance already serves it under /api — keep the prefix for those.
          rewrite: (path) =>
            apiTarget.includes("localhost") ? path.replace(/^\/api/, "") : path,
        },
      },
    },
  };
});
