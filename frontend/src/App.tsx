import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing/Landing";
import BloqueoCuenta from "./components/BloqueoCuenta";
import IngresoPortada from "./components/IngresoPortada";
import ModalConsentimiento from "./components/ModalConsentimiento";
import { usarToken } from "./api/montaje";
import { usarTokenDeGuia } from "./api/guia";
import { useAuthStore } from "./store/authStore";
import { startAutoSync, stopAutoSync, useFixtureStore } from "./store/fixtureStore";

/**
 * Fase 9 (landing): TODAS las pantallas de adentro entran por `import()`.
 *
 * Vite parte el bundle únicamente donde hay un import dinámico. Con estas
 * páginas importadas de la forma normal, el grafo estático de `main.tsx`
 * arrastraba `StoreEditor3D` —y con él `three`, `@react-three/fiber` y
 * `@react-three/drei`— hasta el chunk principal: el visitante anónimo de `/`
 * bajaba el motor 3D entero antes de leer el titular, y el `import()` perezoso
 * de la vista 3D de la landing no ahorraba un solo byte porque three ya había
 * llegado. Lo mismo con el SDK de Firebase, que cuelga de `Login`.
 *
 * La landing es lo ÚNICO que se importa de forma estática: es lo que ve quien
 * llega sin sesión, y su LCP es un `<h1>` que no puede esperar a un chunk.
 */
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const Montaje = lazy(() => import("./pages/Montaje"));
const GuiaDeMontaje = lazy(() => import("./pages/GuiaDeMontaje"));
const PoliticaDatos = lazy(() => import("./pages/PoliticaDatos"));
const Plataforma = lazy(() => import("./pages/Plataforma"));
const ReportePlataforma = lazy(() => import("./pages/ReportePlataforma"));
const DetalleCliente = lazy(() => import("./pages/DetalleCliente"));
const Renumerar = lazy(() => import("./pages/Renumerar"));
const TallerMuebles = lazy(() => import("./pages/TallerMuebles"));
const InformeCliente = lazy(() => import("./pages/InformeCliente"));

/** Mientras baja el chunk de la pantalla: fondo de la app y nada más, para no
 *  meter un parpadeo de texto en una espera que suele durar milisegundos. */
function Pantalla({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "var(--bg)" }} aria-busy="true">
          <span className="sr-only" style={{ position: "absolute", left: -9999 }}>Cargando…</span>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Dónde queda el enlace de montaje entre una recarga y la siguiente. */
const LLAVE_MONTAJE = "recabra-montaje";

/** Dónde queda el enlace de la guía entre una recarga y la siguiente. */
const LLAVE_GUIA = "recabra-guia";

/**
 * El enlace de la GUÍA de montaje de una versión (`?guia=<id>&t=…`, fase 3 de
 * la distribución), leído UNA vez al arrancar y ANTES que el de montaje (los
 * dos traen `t`): con `guia` en la URL, el token es de la guía. Mismo trato
 * que el de montaje: sale de la barra de direcciones apenas se lee, pasa a
 * `sessionStorage` (muere al cerrar la pestaña) y la URL queda en `?guia=1`.
 */
const TOKEN_GUIA = (() => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("guia")) return null;
  const t = (params.get("t") ?? "").trim();
  if (t) {
    try { window.sessionStorage.setItem(LLAVE_GUIA, t); } catch { /* sin guardarlo igual funciona */ }
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    url.searchParams.set("guia", "1");
    window.history.replaceState(null, "", url.toString());
    usarTokenDeGuia(t);
    return t;
  }
  let guardado = "";
  try { guardado = (window.sessionStorage.getItem(LLAVE_GUIA) ?? "").trim(); } catch { guardado = ""; }
  if (!guardado) return null;
  usarTokenDeGuia(guardado);
  return guardado;
})();

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
  // Fase 10: «Crear mi cuenta» / «Ya tengo cuenta» de la landing abren el
  // ingreso ADENTRO de la portada (en la tarjeta del hero, al lado del plano).
  // La landing sólo dispara el evento; el login (que sí conoce la API y la
  // sesión) lo arma App y se lo pasa, y entra perezoso.
  const [hoja, setHoja] = useState<"login" | "registro" | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => {
      const modo = (e as CustomEvent<string>).detail;
      setHoja(modo === "registro" ? "registro" : "login");
    };
    window.addEventListener("recabra:ingresar", abrir);
    return () => window.removeEventListener("recabra:ingresar", abrir);
  }, []);
  const token = useAuthStore((s) => s.token);
  const cliente = useAuthStore((s) => s.cliente);
  const avisoCuenta = useAuthStore((s) => s.avisoCuenta);
  const pedirConsentimiento = useAuthStore((s) => s.pedirConsentimiento);
  // Fase 4 plataforma: sesión de un operador SIN membresías. No tiene
  // cliente de negocio detrás -- CUALQUIER fetch de layout/spaces con este
  // token daría 401, y el interceptor de `api/client.ts` borraría la sesión
  // entera (deslogueando al operador en medio de su propia consola). Por
  // eso entra en la MISMA condición que ya frenaba el sync por el enlace de
  // montaje, no una aparte: es el mismo "esta sesión no tiene layout".
  const plataforma = useAuthStore((s) => s.plataforma);
  const esAdmin = useAuthStore((s) => s.role === "admin");

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
    if (!token || TOKEN_MONTAJE || TOKEN_GUIA || plataforma) {
      stopAutoSync();
      return;
    }
    // Antes de sincronizar: si esta sesión es de otro cliente que el que dejó
    // sus planos en localStorage, se descartan. Evita ver —y peor, subir— los
    // planos del inquilino anterior en una máquina compartida.
    useFixtureStore.getState().scopeToCliente(cliente);
    startAutoSync();
    return () => stopAutoSync();
  }, [token, cliente, plataforma]);

  // Fase 3 compliance: la Política de Tratamiento de Datos es pública — se
  // resuelve ACÁ, antes que cualquier otra cosa (el enlace de montaje
  // incluido), leyendo la URL igual que `TOKEN_MONTAJE` arriba, y no como una
  // `<Route>` de más abajo: esas viven adentro del `<BrowserRouter>` que sólo
  // se monta con sesión abierta, y esta página tiene que andar sin login.
  if (typeof window !== "undefined" && window.location.pathname === "/politica-datos") {
    return <Pantalla><PoliticaDatos /></Pantalla>;
  }

  // El enlace del correo manda sobre todo lo demás, incluso sobre una sesión
  // abierta: quien lo toca quiere ver ESE espacio, no el tablero.
  if (TOKEN_GUIA) return <Pantalla><GuiaDeMontaje /></Pantalla>;
  if (TOKEN_MONTAJE) return <Pantalla><Montaje /></Pantalla>;

  // Route guard: no session. A 401 anywhere clears the token (see
  // api/client.ts), which lands the user back acá automáticamente.
  //
  // Fase 9 (landing): sin sesión, "/" ya NO es el formulario de ingreso — es la
  // página pública que cuenta qué es RECABRA. El login se mudó a "/login", que
  // es adonde apuntan el correo de invitación (`/login?invitacion=…`, ver
  // `backend/app/routers/usuarios.py`) y los dos CTA de la landing.
  //
  // Todo lo que estaba antes que esto sigue mandando: la política de datos es
  // pública y el enlace de montaje (`/?montar=…&t=…`) se resuelve arriba, así
  // que la mercaderista nunca ve la landing aunque su enlace caiga en "/".
  //
  // Cualquier OTRA ruta sin sesión sigue mostrando el login, como siempre: es
  // lo que hace que un enlace guardado a `/reporte-plataforma` termine en esa
  // pantalla después de entrar, en vez de perderse en la portada.
  if (!token) {
    const ruta = typeof window !== "undefined" ? window.location.pathname : "/";
    const esPortada = ruta === "/" || ruta === "" || ruta === "/index.html";
    if (!esPortada) return <Pantalla><Login /></Pantalla>;
    return (
      <Landing ingreso={hoja ? <IngresoPortada modo={hoja} onCerrar={() => setHoja(null)} /> : undefined} />
    );
  }

  // Fase 2 clientes: cliente `suspendido`. Al LOGIN sólo llega la dueña con
  // este aviso (su gente recibe 402 y no guarda sesión), pero una suspensión a
  // mitad de sesión la marca el interceptor para cualquier rol. Reemplaza TODA
  // la app: nada de navegación de negocio hasta que un operador reactive el
  // cliente — y `BloqueoCuenta` se entera solo cuando pasa (C2: consulta el
  // estado en vivo), sin que nadie vuelva a entrar.
  if (avisoCuenta?.estado === "suspendido") {
    return <BloqueoCuenta />;
  }

  return (
    <Pantalla>
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
        {/* Fase 7 (transparencia): la contrapartida de haber quitado la
            supresión de celda chica en /plataforma -- vista imprimible del
            reporte de auditoría, fuera del layout de sede/consola. La del
            dueño ("/reporte-plataforma")
            está disponible para CUALQUIER sesión de cliente (el 403 de "no
            sos el owner" lo tira el backend, no una lista blanca acá); la
            del operador vive bajo "/plataforma/reporte/:slug", misma familia
            de rutas que "/plataforma". Las dos, antes del "*" catch-all;
            el guard de sesión de arriba (sin token → Login) ya las cubre
            porque ninguna se monta fuera del <BrowserRouter>. */}
        <Route path="/reporte-plataforma" element={<ReportePlataforma modo="dueno" />} />
        <Route path="/plataforma/reporte/:slug" element={<ReportePlataforma modo="operador" />} />
        {/* Fase 8 (asesoría): detalle por cliente -- espacios, contratos,
            proveedores y oportunidades, espacio por espacio, con las
            recomendaciones priorizadas de la sesión de asesoría. Misma
            familia de rutas que "/plataforma" y "/plataforma/reporte/:slug",
            antes del "*" catch-all. */}
        <Route path="/plataforma/clientes/:slug" element={<DetalleCliente />} />
        {/* Fase 13 (un solo nombre): renumerar el plano. Es la higiene del
            plano —se entra desde el botón «Renumerar» de la barra del plano 2D,
            al lado de «Revisar»— pero vive como ruta propia y no como panel
            porque la mitad de su valor está en el PAPEL: el dueño lo imprime y
            camina la tienda tachando contra la cartelería, y un panel fijo
            adentro de la rejilla del plano se imprime en una sola hoja,
            cortado. Una página entera pagina en A4 y repite la cabecera de la
            tabla. Es de administrador (la pantalla lo dice y el backend lo
            exige con 403); el guard de sesión de arriba ya la cubre. */}
        <Route path="/renumerar" element={<Renumerar />} />
        {/* El banco de pruebas del mobiliario 3D: un mueble solo, girable,
            con luz neutra y nada alrededor. No es una pantalla de negocio —
            es donde se le mira la FORMA a una pieza antes de meterla en el
            editor, que son cinco mil líneas donde cambiar geometría es
            cambiar a ciegas. Sólo admin (2026-10-02): abría para cualquiera con
            sesión, el mercaderista incluido, escribiendo la dirección a mano. */}
        <Route path="/taller" element={esAdmin ? <TallerMuebles /> : <Navigate to="/" replace />} />
        {/* Fase 11: el informe que se le deja al cliente -- la misma historia
            de la sesión (capítulos 1 a 3), sin la cartera y sin "los datos
            detrás", escrita para que un gerente de supermercado la lea solo y
            se imprima en tres páginas A4. Cuelga de la ruta del detalle
            porque es la misma consulta al mismo cliente, vista de otro lado;
            va ANTES del "*" catch-all, como sus hermanas. */}
        <Route path="/plataforma/clientes/:slug/informe" element={<InformeCliente />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </Pantalla>
  );
}
