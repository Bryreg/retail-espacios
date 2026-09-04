import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Montaje from "./pages/Montaje";
import PoliticaDatos from "./pages/PoliticaDatos";
import Plataforma from "./pages/Plataforma";
import BloqueoCuenta from "./components/BloqueoCuenta";
import ModalConsentimiento from "./components/ModalConsentimiento";
import { usarToken } from "./api/montaje";
import { useAuthStore } from "./store/authStore";
import { startAutoSync, stopAutoSync } from "./store/fixtureStore";

/** Dónde queda el enlace de montaje entre una recarga y la siguiente. */
const LLAVE_MONTAJE = "recabra-montaje";

/**
 * El enlace firmado del correo de montaje (`?t=…`), leído UNA vez al arrancar.
 *
 * Se lee acá arriba y no adentro de un componente porque decide qué aplicación
 * se monta: con este token no hay tablero, no hay sincronización del layout y
 * no hay login.
 *
 * **El token sale de la barra de direcciones apenas se lee.** Antes se quedaba
 * ahí a propósito, para sobrevivir a una recarga, y ese era el costo: la
 * credencial quedaba en el historial del navegador y en cualquier captura de
 * pantalla de la mercaderista. Ahora pasa a `sessionStorage` —que muere al
 * cerrar la pestaña, a diferencia del `localStorage` donde vive la sesión del
 * tablero— y la URL queda en `?montaje=1`.
 *
 * Esa marca hace falta y no es cosmética: sin ella, recargar y escribir la
 * dirección pelada serían indistinguibles, y el admin que abre el enlace en su
 * computador quedaría encerrado en la pantalla de montaje. Con la marca, ir a
 * `/` sale de ahí como siempre.
 */
const TOKEN_MONTAJE = (() => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);

  const t = (params.get("t") ?? "").trim();
  if (t) {
    try {
      window.sessionStorage.setItem(LLAVE_MONTAJE, t);
    } catch {
      // Navegación privada o almacenamiento bloqueado: sin guardarlo la
      // pantalla igual funciona, sólo que una recarga vuelve a pedir el correo.
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    url.searchParams.set("montaje", "1");
    window.history.replaceState(null, "", url.toString());
    usarToken(t);
    return t;
  }

  if (params.get("montaje") !== "1") return null;
  let guardado = "";
  try {
    guardado = (window.sessionStorage.getItem(LLAVE_MONTAJE) ?? "").trim();
  } catch {
    guardado = "";
  }
  if (!guardado) return null;
  usarToken(guardado);
  return guardado;
})();

export default function App() {
  const token = useAuthStore((s) => s.token);
  const avisoCuenta = useAuthStore((s) => s.avisoCuenta);
  const pedirConsentimiento = useAuthStore((s) => s.pedirConsentimiento);
  // Fase 4 plataforma: sesión de un operador SIN membresías. No tiene
  // cliente de negocio detrás -- CUALQUIER fetch de layout/spaces con este
  // token daría 401, y el interceptor de `api/client.ts` borraría la sesión
  // entera (deslogueando al operador en medio de su propia consola). Por
  // eso entra en la MISMA condición que ya frenaba el sync por el enlace de
  // montaje, no una aparte: es el mismo "esta sesión no tiene layout".
  const plataforma = useAuthStore((s) => s.plataforma);

  // Server sync starts only once there is a session, and stops on logout.
  // Doing this at module load (as it used to) meant the very first pull ran
  // without a token, got a 401 and was never retried.
  useEffect(() => {
    // Por el enlace de montaje no hay layout que sincronizar: esa pantalla se
    // sirve entera del servidor en una llamada. Y si el enlace se abre en el
    // computador de alguien que además tiene sesión de admin, no hay por qué
    // arrancarle la sincronización de fondo para mirar un espacio.
    //
    // La sesión de plataforma tampoco tiene layout: es un operador sin
    // membresías, mirando sólo `/api/plataforma/*`.
    if (!token || TOKEN_MONTAJE || plataforma) {
      stopAutoSync();
      return;
    }
    startAutoSync();
    return () => stopAutoSync();
  }, [token, plataforma]);

  // Fase 3 compliance: la Política de Tratamiento de Datos es pública — se
  // resuelve ACÁ, antes que cualquier otra cosa (el enlace de montaje
  // incluido), leyendo la URL igual que `TOKEN_MONTAJE` arriba, y no como una
  // `<Route>` de más abajo: esas viven adentro del `<BrowserRouter>` que sólo
  // se monta con sesión abierta, y esta página tiene que andar sin login.
  if (typeof window !== "undefined" && window.location.pathname === "/politica-datos") {
    return <PoliticaDatos />;
  }

  // El enlace del correo manda sobre todo lo demás, incluso sobre una sesión
  // abierta: quien lo toca quiere ver ESE espacio, no el tablero.
  if (TOKEN_MONTAJE) return <Montaje />;

  // Route guard: no session → login screen. A 401 anywhere clears the token
  // (see api/client.ts), which lands the user back here automatically.
  if (!token) return <Login />;

  // Fase 2 clientes: cliente `suspendido` — sólo un owner llega hasta acá con
  // este aviso puesto (worker/admin reciben 402 en el login y nunca guardan
  // sesión). Reemplaza TODA la app: nada de navegación de negocio hasta que
  // un operador reactive el cliente.
  if (avisoCuenta?.estado === "suspendido") {
    return <BloqueoCuenta motivo={avisoCuenta.motivo} />;
  }

  return (
    <BrowserRouter>
      {/* Fase 3 compliance: superposición, no reemplazo — a diferencia de
          `BloqueoCuenta`, acá no hay nada que cortar; el tablero de abajo
          sigue funcionando mientras el aviso está puesto. */}
      {pedirConsentimiento && <ModalConsentimiento />}
      <Routes>
        {/* Fase 4 plataforma: la sesión de un operador sin membresías nunca
            monta Dashboard -- "/" la manda derecho a "/plataforma". El
            aterrizaje inicial (justo después del login) ya llega con la URL
            puesta en "/plataforma" por `Login.tsx` (`history.replaceState`
            antes de `setAuth`), así que esta ruta es la red de seguridad
            para cualquier otra forma de volver a "/": atrás del navegador,
            un enlace guardado, escribir la barra a mano. */}
        <Route path="/" element={plataforma ? <Navigate to="/plataforma" replace /> : <Dashboard />} />
        <Route path="/plataforma" element={<Plataforma />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
