import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const token = useAuthStore((s) => s.token);

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
