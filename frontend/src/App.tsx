import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Montaje from "./pages/Montaje";
import { usarToken } from "./api/montaje";
import { useAuthStore } from "./store/authStore";
import { startAutoSync, stopAutoSync } from "./store/fixtureStore";

/**
 * El enlace firmado del correo de montaje (`?t=…`), leído UNA vez al arrancar.
 *
 * Se lee acá arriba y no adentro de un componente porque decide qué aplicación
 * se monta: con este token no hay tablero, no hay sincronización del layout y
 * no hay login. El token se queda en la URL a propósito — es la credencial del
 * enlace, igual que en cualquier enlace mágico, y ahí sobrevive a una recarga.
 */
const TOKEN_MONTAJE = (() => {
  if (typeof window === "undefined") return null;
  const t = (new URLSearchParams(window.location.search).get("t") ?? "").trim();
  if (!t) return null;
  usarToken(t);
  return t;
})();

export default function App() {
  const token = useAuthStore((s) => s.token);

  // Server sync starts only once there is a session, and stops on logout.
  // Doing this at module load (as it used to) meant the very first pull ran
  // without a token, got a 401 and was never retried.
  useEffect(() => {
    // Por el enlace de montaje no hay layout que sincronizar: esa pantalla se
    // sirve entera del servidor en una llamada. Y si el enlace se abre en el
    // computador de alguien que además tiene sesión de admin, no hay por qué
    // arrancarle la sincronización de fondo para mirar un espacio.
    if (!token || TOKEN_MONTAJE) {
      stopAutoSync();
      return;
    }
    startAutoSync();
    return () => stopAutoSync();
  }, [token]);

  // El enlace del correo manda sobre todo lo demás, incluso sobre una sesión
  // abierta: quien lo toca quiere ver ESE espacio, no el tablero.
  if (TOKEN_MONTAJE) return <Montaje />;

  // Route guard: no session → login screen. A 401 anywhere clears the token
  // (see api/client.ts), which lands the user back here automatically.
  if (!token) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
