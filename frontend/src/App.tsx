import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import { useAuthStore } from "./store/authStore";
import { startAutoSync, stopAutoSync } from "./store/fixtureStore";

export default function App() {
  const token = useAuthStore((s) => s.token);

  // Server sync starts only once there is a session, and stops on logout.
  // Doing this at module load (as it used to) meant the very first pull ran
  // without a token, got a 401 and was never retried.
  useEffect(() => {
    if (!token) {
      stopAutoSync();
      return;
    }
    startAutoSync();
    return () => stopAutoSync();
  }, [token]);

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
