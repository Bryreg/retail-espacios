import { useEffect, useRef, useState } from "react";
import { useModalAbiertoSi } from "../tema";
import {
  loginOauth, esRequiereCliente, esConsentimientoRequerido,
  verInvitacion, esErrorDeInvitacion,
  type Membresia, type InvitacionVista, type ErrorDeInvitacion,
} from "../api/auth";
import {
  tokenDeInvitacion, clientePreseleccionado, etiquetaDeMembresia, CLAVE_ULTIMO_CLIENTE,
} from "../utils/ingreso";
import { altaCliente, sugerirSlug, SLUG_VALIDO } from "../api/clientes";
import { describeError } from "../api/client";
import {
  firebaseDisponible, loginConGoogle, loginConCorreo, registrarConCorreo,
  reenviarVerificacion, resetearClave, obtenerIdTokenFresco, signOutFirebase,
  describirErrorFirebase,
} from "../api/firebase";
import { useAuthStore } from "../store/authStore";

// ─── Login page ──────────────────────────────────────────────────────────────
//
// Acá había un cuadrado redondeado con cuatro puntos adentro, del mismo color
// que el botón. No significaba nada: era un ícono de aplicación genérico, de
// los que se dibujan cuando todavía no hay marca. Ahora el nombre se sostiene
// solo, que es lo que hace una marca que no necesita presentarse.
//
// Y todo alineado a la izquierda. Un formulario centrado en medio de la
// pantalla es la plantilla de ingreso de cualquier producto; alineado, con la
// regla arriba, se lee como la portada de un instrumento.
//
// ─── Fase 1 identidad, cerrada en Fase 15: una sola vía ────────────────────
//
// Google/correo (Firebase), individual. **La clave compartida por
// supermercado —el "Acceso anterior"— se quitó**: era una credencial de rol y
// no de persona, así que no distinguía quién hizo qué, no se podía revocar de
// a una y convivía con el ingreso individual en la misma tarjeta, ofreciendo
// la puerta más débil al lado de la más fuerte.
//
// El endpoint `POST /api/auth/login` sigue existiendo en el backend a
// propósito: lo usa toda la suite de pruebas para armar una sesión sin montar
// Firebase, y sacarlo era una fase aparte, no un renglón de ésta. Lo que ya no
// existe es la forma de llegar a él desde la pantalla.
//
// **Consecuencia de tener una sola vía:** sin las tres VITE_FIREBASE_* no hay
// por dónde entrar. Antes ese caso caía parado —quedaba el formulario viejo—;
// ahora la pantalla lo dice en lugar de quedarse vacía.
//
// Un 503 de `/api/auth/oauth` (backend sin `FIREBASE_PROJECT_ID`) es otra
// cosa: ahí SÍ hay configuración del lado del cliente, pero el servidor no
// la tiene. Sólo se entera al intentar, así que ese caso se resuelve en
// tiempo de uso — no hay endpoint para "preguntar antes".
//
// ─── Fase 2 clientes: alta self-service ────────────────────────────────────
//
// El 403 de `/oauth` ("esta cuenta no tiene ninguna membresía") ya NO se
// muestra como error seco: en su lugar se ofrece fundar el supermercado
// ahí mismo — nombre, slug sugerido en vivo y editable, y `POST
// /clientes/alta` con un `id_token` FRESCO (no el que ya usó y rechazó
// `/oauth`: para cuando la persona termina de escribir puede estar por
// vencer). El éxito se trata exactamente como un oauth exitoso: se guarda
// la sesión y entra como admin.
//
// ─── 2026-09-23: nadie funda un supermercado por error ─────────────────────
//
// Así nacieron clientes que nadie quería: una persona invitada entraba con
// OTRA cuenta que la del correo de la invitación, `/oauth` no le encontraba
// acceso y esta pantalla le ofrecía, en el mismo cuadro, fundar su
// supermercado. Tres cambios:
//
// · el enlace del correo (`?invitacion=…`) se lee: arriba se dice a qué
//   supermercado y con qué cuenta (enmascarada) entrar, y el token viaja a
//   `/oauth`, que lleva a ESE supermercado o explica por qué no (otra cuenta,
//   vencida, desactivada) — nunca a otro en silencio;
// · el 403 «sin acceso» ya no abre el formulario de fundar: explica qué
//   hacer si lo invitaron, y fundar queda detrás de un botón propio con su
//   advertencia. Con un enlace de invitación en la URL, ni eso;
// · con varios supermercados el selector arranca vacío (o en el último que se
//   usó en este navegador), no en el primero de la lista.

const etiquetaStyle: React.CSSProperties = {
  display: "block", marginBottom: 5,
  fontSize: 12, fontWeight: 500,
  color: "var(--ink-3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink-1)",
  fontSize: 13, fontFamily: "inherit",
  outline: "none",
};

const linkButtonStyle: React.CSSProperties = {
  background: "transparent", border: "none", padding: 0,
  color: "var(--accent)", cursor: "pointer",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
  textAlign: "left",
};

function rolLabel(rol: Membresia["rol"]): string {
  if (rol === "owner") return "dueño";
  if (rol === "admin") return "administrador";
  return "trabajador";
}

/** El último supermercado al que se entró desde este navegador. Almacenamiento
 *  bloqueado o en modo privado: sin recuerdo, y el selector arranca vacío. */
function leerUltimoCliente(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMO_CLIENTE);
  } catch {
    return null;
  }
}

function recordarUltimoCliente(slug: string): void {
  try {
    localStorage.setItem(CLAVE_ULTIMO_CLIENTE, slug);
  } catch {
    // Sin almacenamiento no pasa nada: la próxima vez se elige a mano.
  }
}

const cajaAvisoStyle: React.CSSProperties = {
  width: "100%", marginBottom: 18,
  padding: "10px 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55,
};

/** Lo que dice el enlace del correo, ANTES de entrar: a qué supermercado,
 *  con qué rol y con qué cuenta. La cuenta llega enmascarada del backend. */
function AvisoInvitacion({ vista }: { vista: InvitacionVista | "invalida" }) {
  if (vista === "invalida") {
    return (
      <div style={cajaAvisoStyle} role="status">
        Este enlace de invitación no es válido. Solicite uno nuevo a quien lo invitó.
      </div>
    );
  }
  if (vista.estado === "vencida") {
    const fecha = new Date(vista.expira_en).toLocaleDateString("es-CO", {
      day: "numeric", month: "short", year: "numeric",
    });
    return (
      <div style={cajaAvisoStyle} role="status">
        La invitación a <b style={{ color: "var(--ink-1)" }}>{vista.cliente_nombre}</b> venció
        el {fecha}. Solicite una nueva a quien lo invitó.
      </div>
    );
  }
  return (
    <div style={cajaAvisoStyle} role="status">
      <div style={{ fontWeight: 700, color: "var(--ink-1)", marginBottom: 2 }}>
        Invitación a {vista.cliente_nombre}
      </div>
      {vista.estado === "usada"
        ? "Esta invitación ya fue aceptada. "
        : `Rol: ${rolLabel(vista.rol)}. `}
      Ingrese con la cuenta{" "}
      <b style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{vista.correo}</b>: con
      Google, si es una cuenta de Google, o con correo y contraseña, si creó la cuenta con esa
      dirección.
    </div>
  );
}

/** `enHoja`: el formulario vive adentro de la hoja de ingreso que se abre
 *  sobre la landing (`components/HojaIngreso.tsx`): sin la pantalla completa
 *  ni la tarjeta con borde, y con el modo inicial que pidió el botón de la
 *  portada en vez del `#registro` de la URL. */
export default function Login({ enHoja = false, modoInicial }: {
  enHoja?: boolean;
  modoInicial?: "login" | "registro";
} = {}) {
  const setAuth = useAuthStore((s) => s.setAuth);

  // ─── El enlace de la invitación ─────────────────────────────────────────
  // Se lee UNA vez, al montar. `vistaInvitacion` es lo que dice el backend
  // del token antes de entrar; `"invalida"` cuando el token no existe (un
  // error de red no se muestra: `/oauth` lo va a validar igual).
  const [invitacion] = useState<string | null>(() =>
    typeof window === "undefined" ? null : tokenDeInvitacion(window.location.search),
  );
  const [vistaInvitacion, setVistaInvitacion] = useState<InvitacionVista | "invalida" | null>(null);
  useEffect(() => {
    if (!invitacion) return;
    verInvitacion(invitacion)
      .then(setVistaInvitacion)
      .catch((err) => {
        if ((err as { response?: { status?: number } })?.response?.status === 404) setVistaInvitacion("invalida");
      });
  }, [invitacion]);
  // «Continuar sin la invitación»: una ref y no un estado, porque el
  // reintento sale en el mismo clic que la prende y el cierre de
  // `completarOauth` todavía vería el valor viejo.
  const sinEnlace = useRef(false);
  // El enlace no llevó a ninguna parte: otra cuenta, vencida, desactivada.
  // Guarda el id_token para poder seguir sin el enlace sin volver a Google.
  const [errorInvitacion, setErrorInvitacion] =
    useState<(ErrorDeInvitacion & { idToken: string }) | null>(null);
  // Con qué cuenta se intentó entrar, para decirla en el aviso de «sin acceso».
  const [correoDelIntento, setCorreoDelIntento] = useState<string | null>(null);

  // ─── Nuevo: Google / correo (Firebase) ─────────────────────────────────
  //
  // Fase 9 (landing): «Crear mi cuenta» de la página pública apunta a
  // `/login#registro`. El ancla no es decorativa — es lo que hace que quien
  // vino a registrarse aterrice en el formulario de registro y no en el de
  // ingreso. Se lee UNA sola vez, al montar: cualquier otra entrada a `/login`
  // (la invitación con `?invitacion=`, un enlace guardado, un 401) llega sin
  // `#` y ve exactamente la pantalla de siempre.
  const [fbMode, setFbMode] = useState<"login" | "registro">(
    modoInicial ?? (typeof window !== "undefined" && window.location.hash === "#registro" ? "registro" : "login"),
  );
  const [fbEmail, setFbEmail] = useState("");
  const [fbPassword, setFbPassword] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbInfo, setFbInfo] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  // Backend sin FIREBASE_PROJECT_ID: se entera recién al intentar. Una vez
  // visto, no tiene sentido dejar los botones puestos para que fallen de
  // nuevo — se cambia por el aviso y listo.
  const [backendSinConfig, setBackendSinConfig] = useState(false);
  // Varias membresías activas: hay que elegir antes de terminar.
  const [membresias, setMembresias] = useState<Membresia[] | null>(null);
  const [pendingIdToken, setPendingIdToken] = useState<string | null>(null);
  const [clienteElegido, setClienteElegido] = useState("");

  // ─── Fase 2: sin membresías → ofrecer fundar el supermercado ───────────
  const [sinCliente, setSinCliente] = useState(false);
  // El formulario de fundar se abre SÓLO con su botón (2026-09-23): antes
  // aparecía solo, en el mismo cuadro que decía «no tiene acceso».
  const [fundando, setFundando] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaSlug, setAltaSlug] = useState("");
  const [altaSlugTocado, setAltaSlugTocado] = useState(false);
  const [altaBusy, setAltaBusy] = useState(false);
  const [altaError, setAltaError] = useState<string | null>(null);
  // Fase 3 compliance: sin marcar, el botón de fundar ni se habilita — el
  // backend igual lo exige (422), pero pedirlo acá evita el viaje de más.
  const [altaAceptaPolitica, setAltaAceptaPolitica] = useState(false);

  // ─── Fase 3 compliance: 428 de /oauth al canjear una invitación ────────
  // Guarda el `id_token` (y el `cliente`, si ya se había elegido) con el que
  // reintentar apenas la persona acepte la política — el token no se
  // reemplaza por otro: es el mismo que ya se verificó, sólo faltaba el
  // consentimiento.
  // Mientras el aviso de política está puesto, ÉL es la pantalla: se lleva el
  // amarillo y el botón de entrar que quedó detrás pasa a tinta. Es la regla de
  // «un amarillo por pantalla» (ver `src/tema.tsx` y `.btn-principal`).
  const [consentimientoPendiente, setConsentimientoPendiente] =
    useState<{ idToken: string; cliente?: string } | null>(null);
  const [consentimientoBusy, setConsentimientoBusy] = useState(false);
  useModalAbiertoSi(!!consentimientoPendiente);

  const limpiarAvisos = () => {
    setFbError(null);
    setFbInfo(null);
    setNeedsVerification(false);
  };

  const manejarErrorOauth = (err: unknown, idToken?: string, cliente?: string) => {
    // Fase 3 compliance: el canje de una invitación iba a crear una
    // membresía nueva y esta cuenta todavía no aceptó la política — no es
    // un error, es el punto de partida del modal de aceptación.
    const requerido = esConsentimientoRequerido(err);
    if (requerido) {
      limpiarAvisos(); // no arrastrar un error viejo adentro del modal nuevo
      if (idToken) setConsentimientoPendiente({ idToken, cliente });
      return;
    }
    setConsentimientoPendiente(null);
    const deInvitacion = esErrorDeInvitacion(err);
    if (deInvitacion) {
      limpiarAvisos();
      setErrorInvitacion({ ...deInvitacion, idToken: idToken ?? "" });
      return;
    }
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 503) {
      // El servidor no tiene FIREBASE_PROJECT_ID: el resto de la app sigue
      // andando igual, acá sólo se retira la vía nueva de esta pantalla.
      setBackendSinConfig(true);
      return;
    }
    if (status === 403) {
      // Sin membresías. Ya no es el punto de partida del alta: es un aviso
      // que dice qué hacer si lo invitaron; fundar queda detrás de su botón.
      setSinCliente(true);
      return;
    }
    setFbError(describeError(err, "No se pudo verificar tu identidad."));
  };

  const cambiarAltaNombre = (v: string) => {
    setAltaNombre(v);
    // El slug sigue al nombre en vivo hasta que la persona lo toca a mano —
    // a partir de ahí manda lo que escribió, no se le pisa más.
    if (!altaSlugTocado) setAltaSlug(sugerirSlug(v));
  };

  const cambiarAltaSlug = (v: string) => {
    setAltaSlugTocado(true);
    setAltaSlug(v.toLowerCase());
  };

  const fundarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (altaBusy) return;
    if (!altaNombre.trim()) {
      setAltaError("Escribí el nombre del supermercado.");
      return;
    }
    if (!SLUG_VALIDO.test(altaSlug)) {
      setAltaError(
        "El código va en minúsculas, sin espacios ni tildes, y arranca con una letra."
      );
      return;
    }
    if (!altaAceptaPolitica) {
      // El backend contesta el mismo 422 si esto se saltea (deshabilitar el
      // botón es la primera barrera, no la única).
      setAltaError("Para fundar el cliente hay que aceptar la Política de Tratamiento de Datos Personales.");
      return;
    }
    setAltaBusy(true);
    setAltaError(null);
    try {
      // Fresco a propósito: no el token que ya usó `/oauth` y rechazó —
      // puede estar por vencer para cuando se llega hasta acá.
      const idToken = await obtenerIdTokenFresco();
      const r = await altaCliente({
        id_token: idToken, slug: altaSlug, nombre: altaNombre.trim(),
        acepta_politica: altaAceptaPolitica,
      });
      // Éxito == un oauth exitoso: se guarda la sesión y entra como admin.
      // Acá `cliente_nombre` viene directo del backend — no hace falta
      // buscarlo en ninguna lista, como sí pasa en `completarOauth`.
      setAuth(
        r.token, r.role, r.cliente, r.cliente_nombre, r.email, r.nombre,
        undefined, undefined, undefined, r.rol_cliente ?? "owner"
      );
    } catch (err) {
      // 409/403/422/429: el detail del backend se muestra tal cual.
      setAltaError(describeError(err, "No se pudo crear el supermercado."));
    } finally {
      setAltaBusy(false);
    }
  };

  /** Manda el ID token al backend propio. Si hace falta elegir cliente,
   *  guarda el token y muestra el selector; si no, entra directo.
   *  `aceptaPolitica` sólo lo manda el botón "Aceptar" del modal de
   *  consentimiento — el reintento del MISMO id_token, con el campo puesto. */
  const completarOauth = async (idToken: string, clienteElegido?: string, aceptaPolitica?: boolean) => {
    try {
      const conEnlace = invitacion && !sinEnlace.current ? invitacion : undefined;
      const r = await loginOauth(idToken, clienteElegido, aceptaPolitica, conEnlace);
      if (esRequiereCliente(r)) {
        setPendingIdToken(idToken);
        setMembresias(r.membresias);
        setClienteElegido(clientePreseleccionado(r.membresias, leerUltimoCliente()));
        return;
      }
      setConsentimientoPendiente(null);

      // ── Fase 4 plataforma: operador SIN membresías ──────────────────────
      // El backend ya NO contesta 403 acá para esta cuenta (esa rama sigue
      // intacta para quien NO es operador, más abajo en `manejarErrorOauth`)
      // -- contesta 200 con `plataforma: true` y `cliente: "plataforma"`, y
      // el aterrizaje es DIRECTO en `/plataforma`, sin pasar por Dashboard.
      //
      // La URL se reescribe ACÁ, antes de `setAuth`: `App.tsx` recién monta
      // el `<BrowserRouter>` cuando hay token, así que si la barra ya dice
      // "/plataforma" en el momento en que eso pasa, React Router arranca
      // resolviendo esa ruta directo -- no hace falta una redirección
      // posterior ni un estado de "adónde ir" aparte. (La alternativa que
      // se consideró -- una ruta inicial condicional leída de la marca del
      // store -- también funcionaría, pero dejaría un instante en el que
      // `BrowserRouter` monta en "/" antes de que el `Route` de "/" mismo
      // redirija; reescribir la URL antes evita ese salto.)
      if (r.plataforma) {
        try {
          window.history.replaceState(null, "", "/plataforma");
        } catch {
          // Navegación privada o `history` bloqueada: sin esto la sesión
          // igual entra bien -- el `Route` de "/" en App.tsx manda a
          // "/plataforma" apenas monta, sólo se pierde el salto directo.
        }
        setAuth(
          r.token, r.role, r.cliente, undefined, r.email, r.nombre,
          r.aviso_cuenta, r.pedir_consentimiento, true
        );
        return;
      }

      // El nombre del supermercado y el rol de la persona en él vienen en la
      // respuesta (2026-10-02). La lista de membresías queda de respaldo para
      // un backend de antes de ese cambio.
      const membresia = membresias?.find((m) => m.cliente === r.cliente);
      recordarUltimoCliente(r.cliente);
      setAuth(
        r.token, r.role, r.cliente, r.cliente_nombre ?? membresia?.nombre, r.email, r.nombre,
        r.aviso_cuenta, r.pedir_consentimiento, undefined, r.rol_cliente ?? membresia?.rol
      );
    } catch (err) {
      manejarErrorOauth(err, idToken, clienteElegido);
    }
  };

  const aceptarPoliticaYReintentar = async () => {
    if (!consentimientoPendiente || consentimientoBusy) return;
    setConsentimientoBusy(true);
    try {
      await completarOauth(consentimientoPendiente.idToken, consentimientoPendiente.cliente, true);
    } finally {
      setConsentimientoBusy(false);
    }
  };

  const conGoogle = async () => {
    if (fbBusy) return;
    limpiarAvisos();
    setFbBusy(true);
    try {
      const r = await loginConGoogle();
      setCorreoDelIntento(r.email);
      await completarOauth(r.idToken);
    } catch (err) {
      // signInWithPopup cancelado por la persona no es un error que valga
      // mostrar en rojo: intentó y se arrepintió.
      const codigo = (err as { code?: string })?.code;
      if (codigo !== "auth/popup-closed-by-user" && codigo !== "auth/cancelled-popup-request") {
        setFbError(describirErrorFirebase(err));
      }
    } finally {
      setFbBusy(false);
    }
  };

  const conCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbEmail || !fbPassword || fbBusy) return;
    limpiarAvisos();
    setFbBusy(true);
    try {
      const r = fbMode === "registro"
        ? await registrarConCorreo(fbEmail, fbPassword)
        : await loginConCorreo(fbEmail, fbPassword);
      if (!r.emailVerified) {
        // El backend hace el mismo chequeo y contestaría 401 igual — se
        // ahorra el viaje porque el SDK ya lo sabe acá.
        setNeedsVerification(true);
        setFbInfo(
          fbMode === "registro"
            ? "Te mandamos un correo para verificar tu cuenta. Confirmalo y volvé a entrar."
            : "Tu correo todavía no está verificado."
        );
        return;
      }
      setCorreoDelIntento(r.email);
      await completarOauth(r.idToken);
    } catch (err) {
      setFbError(describirErrorFirebase(err));
    } finally {
      setFbBusy(false);
    }
  };

  const reenviar = async () => {
    if (fbBusy) return;
    setFbBusy(true);
    setFbError(null);
    try {
      await reenviarVerificacion();
      setFbInfo("Te reenviamos el correo de verificación.");
    } catch (err) {
      setFbError(err instanceof Error ? err.message : "No se pudo reenviar la verificación.");
    } finally {
      setFbBusy(false);
    }
  };

  const [resetEnviado, setResetEnviado] = useState(false);
  const olvideClave = async () => {
    if (!fbEmail) {
      setFbError("Escribí tu correo arriba para poder mandarte el enlace.");
      return;
    }
    setFbBusy(true);
    setFbError(null);
    try {
      await resetearClave(fbEmail);
      setResetEnviado(true);
      setFbInfo("Te mandamos un enlace para elegir una contraseña nueva.");
    } catch (err) {
      setFbError(describirErrorFirebase(err));
    } finally {
      setFbBusy(false);
    }
  };

  const confirmarCliente = async () => {
    if (!pendingIdToken || !clienteElegido || fbBusy) return;
    setFbBusy(true);
    setFbError(null);
    try {
      await completarOauth(pendingIdToken, clienteElegido);
    } finally {
      setFbBusy(false);
    }
  };

  /** Vuelve al punto de partida de la vía nueva — para probar con otra
   *  cuenta de Google/correo sin recargar la página. */
  const empezarDeNuevo = () => {
    void signOutFirebase();
    setMembresias(null);
    setPendingIdToken(null);
    setClienteElegido("");
    setSinCliente(false);
    setAltaNombre("");
    setAltaSlug("");
    setAltaSlugTocado(false);
    setAltaError(null);
    setAltaAceptaPolitica(false);
    setConsentimientoPendiente(null);
    setFundando(false);
    setErrorInvitacion(null);
    setCorreoDelIntento(null);
    sinEnlace.current = false;
    limpiarAvisos();
  };

  /** La persona vino por un enlace que no la lleva a ninguna parte, pero
   *  tiene otros accesos con esta cuenta: entra como si no hubiera enlace —
   *  al suyo, o al selector si tiene varios —, porque lo eligió ella. */
  const seguirSinEnlace = async () => {
    if (!errorInvitacion || fbBusy) return;
    const idToken = errorInvitacion.idToken;
    sinEnlace.current = true;
    setErrorInvitacion(null);
    setFbBusy(true);
    try {
      await completarOauth(idToken);
    } finally {
      setFbBusy(false);
    }
  };

  return (
    <div
      style={enHoja ? { padding: 0 } : {
        height: "100dvh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: enHoja ? "none" : 348,
          background: enHoja ? "transparent" : "var(--surface)",
          border: enHoja ? 0 : "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          padding: enHoja ? 0 : "26px 28px 28px",
          display: "flex", flexDirection: "column", alignItems: "flex-start",
        }}
      >
        <div style={{ width: "100%", borderTop: "2px solid var(--ink-1)", marginBottom: 14 }} />

        <h1
          style={{
            margin: "0 0 2px", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.02em", color: "var(--ink-1)",
          }}
        >
          RECABRA
        </h1>
        <p style={{ margin: "0 0 26px", fontSize: 12.5, color: "var(--ink-3)" }}>
          Gestión de espacios comerciales
        </p>

        {firebaseDisponible && (
          <div style={{ width: "100%" }}>
            {vistaInvitacion && !errorInvitacion && !membresias && <AvisoInvitacion vista={vistaInvitacion} />}
            {backendSinConfig ? (
              <div
                style={{
                  width: "100%", marginBottom: 18,
                  padding: "10px 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5,
                }}
              >
                El ingreso con Google o correo no está disponible en este
                servidor todavía. Escríbanos para que lo revisemos.
              </div>
            ) : errorInvitacion ? (
              // ── El enlace no lleva a ninguna parte con esta cuenta ───────
              <div style={{ width: "100%", marginBottom: 18 }}>
                <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ink-1)", lineHeight: 1.55 }}>
                  {errorInvitacion.mensaje}
                </p>
                <button
                  className="btn-principal"
                  type="button"
                  onClick={empezarDeNuevo}
                  style={{
                    width: "100%", height: 38,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--r-md)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  {errorInvitacion.codigo === "invitacion_otro_correo" ? "Ingresar con otra cuenta" : "Volver"}
                </button>
                <div style={{ marginTop: 12 }}>
                  <button type="button" onClick={seguirSinEnlace} disabled={fbBusy} style={linkButtonStyle}>
                    Continuar sin la invitación
                  </button>
                </div>
              </div>
            ) : sinCliente && !fundando ? (
              // ── Sin acceso: qué hacer si lo invitaron; fundar, aparte ────
              <div style={{ width: "100%", marginBottom: 18 }}>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-1)", lineHeight: 1.55 }}>
                  {correoDelIntento ? (
                    <>
                      La cuenta{" "}
                      <b style={{ fontFamily: "var(--font-mono)" }}>{correoDelIntento}</b>{" "}
                      no tiene acceso a ningún supermercado.
                    </>
                  ) : (
                    "Su cuenta no tiene acceso a ningún supermercado."
                  )}
                </p>
                <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  Si lo invitaron, ingrese con la misma cuenta a la que llegó la invitación.
                  Si no la encuentra, solicite a quien lo invitó que la envíe de nuevo: la
                  invitación vence a los 7 días.
                </p>
                <button
                  className="btn-principal"
                  type="button"
                  onClick={empezarDeNuevo}
                  style={{
                    width: "100%", height: 38,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--r-md)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  Ingresar con otra cuenta
                </button>
                {/* Con un enlace de invitación en la URL, fundar no se ofrece:
                    quien llegó por ahí viene a entrar a un supermercado que ya
                    existe, no a crear otro. */}
                {!invitacion && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                      ¿Va a registrar su supermercado en RECABRA?
                    </p>
                    <button type="button" onClick={() => setFundando(true)} style={linkButtonStyle}>
                      Registrar un supermercado nuevo
                    </button>
                  </div>
                )}
              </div>
            ) : sinCliente ? (
              // ── Fase 2: fundar el supermercado, ahora a pedido ──────────
              <div style={{ width: "100%", marginBottom: 18 }}>
                <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  Esto crea un supermercado <b>nuevo y vacío</b>, con usted como dueño,
                  separado de cualquier otro. Si trabaja para un supermercado que ya usa
                  RECABRA, no lo cree: solicite a su dueño una invitación a su correo.
                </p>
                <form onSubmit={fundarCliente}>
                  <div style={{ marginBottom: 10 }}>
                    <label htmlFor="alta-nombre" style={etiquetaStyle}>
                      Nombre del supermercado
                    </label>
                    <input
                      id="alta-nombre"
                      type="text"
                      autoFocus
                      value={altaNombre}
                      onChange={(e) => cambiarAltaNombre(e.target.value)}
                      placeholder="Supermercado La Esquina"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label htmlFor="alta-slug" style={etiquetaStyle}>Código</label>
                    <input
                      id="alta-slug"
                      type="text"
                      value={altaSlug}
                      onChange={(e) => cambiarAltaSlug(e.target.value)}
                      placeholder="la_esquina"
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                    />
                    <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--ink-4)", lineHeight: 1.4 }}>
                      Minúsculas, sin espacios ni tildes, arranca con una letra. Así lo
                      identifica el sistema — no se puede cambiar después.
                    </div>
                  </div>

                  {/* Fase 3 compliance: sin marcar, ni se manda el pedido —
                      el backend igual lo exige (422), esto evita el viaje. */}
                  <label
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      marginBottom: 12, cursor: "pointer",
                      fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={altaAceptaPolitica}
                      onChange={(e) => setAltaAceptaPolitica(e.target.checked)}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      Leí y acepto la{" "}
                      <a
                        href="/politica-datos"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--accent)", fontWeight: 600 }}
                      >
                        Política de Tratamiento de Datos Personales
                      </a>
                      .
                    </span>
                  </label>

                  {altaError && (
                    <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 500, color: "var(--danger)" }}>
                      {altaError}
                    </div>
                  )}

                  <button
                    className="btn-principal"
                    type="submit"
                    disabled={altaBusy || !altaNombre.trim() || !altaSlug || !altaAceptaPolitica}
                    style={{
                      width: "100%", height: 38,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: "var(--r-md)",
                      cursor: altaBusy || !altaNombre.trim() || !altaSlug || !altaAceptaPolitica ? "default" : "pointer",
                      fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    {altaBusy ? "Creando…" : "Crear y entrar"}
                  </button>
                </form>
                <div style={{ marginTop: 12 }}>
                  {/* Vuelve al aviso de «sin acceso», no al principio: quien
                      abrió esto por error tiene que poder leer de nuevo qué
                      hacer si lo invitaron. */}
                  <button type="button" onClick={() => { setFundando(false); setAltaError(null); }} style={linkButtonStyle}>
                    Volver
                  </button>
                </div>
              </div>
            ) : membresias ? (
              // ── Selector de cliente: varias membresías activas ──────────
              <div style={{ width: "100%", marginBottom: 18 }}>
                <label htmlFor="login-cliente-fb" style={etiquetaStyle}>
                  Su cuenta entra a varios supermercados — elija uno
                </label>
                <select
                  id="login-cliente-fb"
                  value={clienteElegido}
                  onChange={(e) => setClienteElegido(e.target.value)}
                  style={{ ...inputStyle, height: 38, marginBottom: 10 }}
                >
                  {/* Vacío salvo que se recuerde el último: elegir el primero
                      de la lista por la persona era mandarla al que tocara. */}
                  {!clienteElegido && <option value="">Elija un supermercado…</option>}
                  {membresias.map((m) => (
                    <option key={m.cliente} value={m.cliente}>
                      {etiquetaDeMembresia(m, membresias, rolLabel)}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-principal"
                  type="button"
                  onClick={confirmarCliente}
                  disabled={fbBusy || !clienteElegido}
                  style={{
                    width: "100%", height: 38,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--r-md)",
                    cursor: fbBusy || !clienteElegido ? "default" : "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  {fbBusy ? "Entrando…" : "Continuar"}
                </button>
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={empezarDeNuevo} style={linkButtonStyle}>
                    Probar con otra cuenta
                  </button>
                </div>
              </div>
            ) : (
              // ── Google + correo/contraseña ───────────────────────────────
              <div style={{ width: "100%", marginBottom: 18 }}>
                <button
                  type="button"
                  onClick={conGoogle}
                  disabled={fbBusy}
                  style={{
                    width: "100%", height: 38, marginBottom: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface)", color: "var(--ink-1)",
                    border: "1px solid var(--line-strong)",
                    cursor: fbBusy ? "default" : "pointer",
                    opacity: fbBusy ? 0.6 : 1,
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  }}
                >
                  {fbBusy ? "Un momento…" : "Continuar con Google"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>o con correo</span>
                  <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>

                <form onSubmit={conCorreo}>
                  <div style={{ marginBottom: 10 }}>
                    <label htmlFor="fb-email" style={etiquetaStyle}>Correo</label>
                    <input
                      id="fb-email"
                      type="email"
                      autoComplete="email"
                      value={fbEmail}
                      onChange={(e) => { setFbEmail(e.target.value); setResetEnviado(false); }}
                      placeholder="nombre@empresa.com"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label htmlFor="fb-password" style={etiquetaStyle}>Contraseña</label>
                    <input
                      id="fb-password"
                      type="password"
                      autoComplete={fbMode === "registro" ? "new-password" : "current-password"}
                      value={fbPassword}
                      onChange={(e) => setFbPassword(e.target.value)}
                      placeholder="••••••••"
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => { setFbMode(fbMode === "login" ? "registro" : "login"); limpiarAvisos(); }}
                      style={linkButtonStyle}
                    >
                      {fbMode === "login" ? "Crear una cuenta" : "Ya tengo cuenta"}
                    </button>
                    {fbMode === "login" && !resetEnviado && (
                      <button type="button" onClick={olvideClave} style={linkButtonStyle}>
                        Olvidé mi contraseña
                      </button>
                    )}
                  </div>

                  <button
                    className="btn-principal"
                    type="submit"
                    disabled={fbBusy || !fbEmail || !fbPassword}
                    style={{
                      width: "100%", height: 38,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: "var(--r-md)",
                      cursor: fbBusy || !fbEmail || !fbPassword ? "default" : "pointer",
                      fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    {fbBusy
                      ? "Un momento…"
                      : fbMode === "registro" ? "Crear cuenta" : "Ingresar"}
                  </button>
                </form>
              </div>
            )}

            {fbError && (
              <div style={{ marginTop: -8, marginBottom: 14, fontSize: 12, fontWeight: 500, color: "var(--danger)" }}>
                {fbError}
              </div>
            )}
            {fbInfo && (
              <div style={{ marginTop: -8, marginBottom: 8, fontSize: 12, fontWeight: 500, color: "var(--success)" }}>
                {fbInfo}
              </div>
            )}
            {needsVerification && (
              <div style={{ marginTop: -4, marginBottom: 14 }}>
                <button type="button" onClick={reenviar} disabled={fbBusy} style={linkButtonStyle}>
                  Reenviar correo de verificación
                </button>
              </div>
            )}

          </div>
        )}

        {!firebaseDisponible && (
          // Sin las tres VITE_FIREBASE_* no hay por dónde entrar: el acceso por
          // clave compartida ya no existe. Antes este caso caía parado porque
          // quedaba el formulario viejo; ahora dejaría una tarjeta vacía sin
          // explicación, así que se dice qué falta y a quién avisarle.
          <div
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5,
            }}
          >
            El ingreso no está configurado en este servidor. Escríbanos para que
            lo revisemos.
          </div>
        )}

        {/* Fase 3 compliance: la política tiene que poder leerse desde acá
            aunque nadie esté fundando un cliente ni aceptando nada — es
            pública, y esta pantalla es donde vive el enlace de siempre. */}
        <div style={{ marginTop: 18 }}>
          <a
            href="/politica-datos"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 10.5, color: "var(--ink-4)", textDecoration: "none" }}
          >
            Política de Tratamiento de Datos Personales
          </a>
        </div>
      </div>

      {/* Fase 3 compliance: 428 de /oauth — el canje de una invitación
          pendiente iba a crear una membresía nueva y hace falta aceptar la
          política primero. No hay JWT todavía, así que "Aceptar" reintenta
          el MISMO /oauth con `acepta_politica: true`, no pega a
          `/auth/aceptar-politica` (eso es sólo para sesiones ya abiertas —
          ver `ModalConsentimiento`). */}
      {consentimientoPendiente && (
        <div
          data-capa-modal
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.45)", padding: 20,
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: 380,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-xl)",
              padding: "24px 26px 22px",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>
              Acepte la Política de Tratamiento de Datos
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              Para sumarse a este supermercado hace falta aceptar la política antes
              de terminar de entrar.
            </p>
            <a
              href="/politica-datos"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
            >
              Leer la Política de Tratamiento de Datos Personales →
            </a>

            {fbError && (
              <div style={{ marginTop: 14, fontSize: 12, fontWeight: 500, color: "var(--danger)" }}>
                {fbError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setConsentimientoPendiente(null)}
                disabled={consentimientoBusy}
                style={{
                  flex: 1, height: 38,
                  borderRadius: "var(--r-md)",
                  background: "var(--surface-2)", color: "var(--ink-2)",
                  border: "1px solid var(--line)",
                  cursor: consentimientoBusy ? "default" : "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-principal"
                type="button"
                onClick={aceptarPoliticaYReintentar}
                disabled={consentimientoBusy}
                style={{
                  flex: 1, height: 38,
                  borderRadius: "var(--r-md)",
                  cursor: consentimientoBusy ? "default" : "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                {consentimientoBusy ? "Un momento…" : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
