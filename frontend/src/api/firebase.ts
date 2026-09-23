// ─── Firebase Auth (Google + correo) ──────────────────────────────────────
//
// El SDK de Firebase pesa, y esta pantalla tiene que verse EXACTAMENTE como
// hoy cuando el servidor no la configuró — no "casi igual", igual. Por eso
// nada de esto corre a nivel de módulo: ni `initializeApp`, ni el `import`
// del SDK. Todo queda atrás de funciones async con `import()` dinámico, así
// que sin las tres variables de entorno el bundle nunca baja `firebase/auth`
// ni ejecuta una sola línea suya. `firebaseDisponible` es la única cosa que
// se calcula al cargar el módulo, y es pura lectura de `import.meta.env`.
//
// Falta CUALQUIERA de las tres → `firebaseDisponible` es `false` → Login.tsx
// no dibuja ni un botón de la vía nueva. Degradación limpia, sin ramas a
// medio armar.

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

/** true solo si las TRES variables están presentes. Ninguna es opcional:
 *  un proyecto sin `authDomain` no puede abrir el popup de Google, y sin
 *  `apiKey` no inicializa nada. */
export const firebaseDisponible = Boolean(apiKey && authDomain && projectId);

type AuthInstancia = import("firebase/auth").Auth;

// Una sola instancia de `Auth`, creada la primera vez que hace falta y
// reusada después — abrir el popup de Google dos veces con dos apps
// distintas duplicaría la sesión del SDK sin ninguna ganancia.
let authPromise: Promise<AuthInstancia> | null = null;

function auth(): Promise<AuthInstancia> {
  if (!firebaseDisponible) {
    // No debería llamarse nunca desde la UI (que ya se guarda de dibujar la
    // vía nueva sin config), pero si algo la invoca igual, que falle con un
    // mensaje legible y no con un `initializeApp({})` roto.
    return Promise.reject(new Error("Firebase no está configurado en este servidor."));
  }
  if (!authPromise) {
    authPromise = (async () => {
      const { initializeApp } = await import("firebase/app");
      const { getAuth } = await import("firebase/auth");
      const app = initializeApp({ apiKey, authDomain, projectId });
      return getAuth(app);
    })();
  }
  return authPromise;
}

/** Lo que la pantalla necesita después de cualquier login/registro con el
 *  SDK: el ID token para `POST /api/auth/oauth` y si el correo está
 *  verificado — con eso la UI decide ANTES de llamar al backend si conviene
 *  mostrar de una vez el aviso de "revisá tu correo", en vez de esperar el
 *  401 (que igual va a llegar, porque el backend hace el mismo chequeo). */
export interface ResultadoFirebase {
  idToken: string;
  emailVerified: boolean;
  email: string | null;
}

/** Login con Google vía popup. Google ya entrega el correo verificado, así
 *  que `emailVerified` acá siempre da `true`. */
export async function loginConGoogle(): Promise<ResultadoFirebase> {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const instancia = await auth();
  const proveedor = new GoogleAuthProvider();
  // Que Google pregunte SIEMPRE con qué cuenta (2026-09-23). Sin esto, quien
  // tiene una sola sesión de Google abierta —la personal, casi siempre— entra
  // con ésa sin ver el selector, y la invitación, que llegó al correo del
  // trabajo, no la encuentra. «Ingresar con otra cuenta» no servía de nada.
  proveedor.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(instancia, proveedor);
  return {
    idToken: await cred.user.getIdToken(),
    emailVerified: cred.user.emailVerified,
    email: cred.user.email,
  };
}

/** Login con correo/contraseña ya existentes. */
export async function loginConCorreo(email: string, password: string): Promise<ResultadoFirebase> {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const instancia = await auth();
  const cred = await signInWithEmailAndPassword(instancia, email, password);
  return {
    idToken: await cred.user.getIdToken(),
    emailVerified: cred.user.emailVerified,
    email: cred.user.email,
  };
}

/** Alta con correo/contraseña. Crea la cuenta en Firebase y dispara el
 *  correo de verificación; `emailVerified` da `false` siempre acá (recién
 *  creada), así que la pantalla puede mostrar el aviso de "revisá tu
 *  correo" sin esperar la vuelta del backend. */
export async function registrarConCorreo(email: string, password: string): Promise<ResultadoFirebase> {
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import("firebase/auth");
  const instancia = await auth();
  const cred = await createUserWithEmailAndPassword(instancia, email, password);
  await sendEmailVerification(cred.user);
  return {
    idToken: await cred.user.getIdToken(),
    emailVerified: cred.user.emailVerified,
    email: cred.user.email,
  };
}

/** ID token FRESCO de quien está logueado ACÁ AHORA en el SDK — `getIdToken`
 *  con `forceRefresh: true`, así que nunca devuelve el que Firebase tenía en
 *  caché. Lo usa el alta self-service (Fase 2 clientes): el `id_token` del
 *  intento de `/auth/oauth` que acaba de dar 403 puede estar por vencer para
 *  cuando la persona termina de escribir el nombre del supermercado, y el
 *  alta no reintenta sola. */
export async function obtenerIdTokenFresco(): Promise<string> {
  const instancia = await auth();
  const usuario = instancia.currentUser;
  if (!usuario) {
    throw new Error("Se cerró la sesión. Volvé a entrar con Google o tu correo.");
  }
  return usuario.getIdToken(true);
}

/** Reenvía el correo de verificación a quien está logueado ACÁ AHORA en el
 *  SDK de Firebase (el intento de login/registro que acaba de fallar por
 *  401 en el backend). Si no hay nadie logueado en el SDK, no hay a quién
 *  reenviarle nada. */
export async function reenviarVerificacion(): Promise<void> {
  const { sendEmailVerification } = await import("firebase/auth");
  const instancia = await auth();
  const usuario = instancia.currentUser;
  if (!usuario) {
    throw new Error("No hay una sesión de correo activa para reenviar la verificación.");
  }
  await sendEmailVerification(usuario);
}

/** Reset de contraseña por correo — Firebase manda el enlace, esta app no
 *  ve ni toca la contraseña nueva. */
export async function resetearClave(email: string): Promise<void> {
  const { sendPasswordResetEmail } = await import("firebase/auth");
  const instancia = await auth();
  await sendPasswordResetEmail(instancia, email);
}

/** Cierra la sesión de Firebase si el SDK llegó a inicializarse. Si nunca
 *  se usó la vía nueva (sin config, o sesión abierta por la vía legada) no
 *  hay `Auth` que cerrar, y forzar la inicialización solo para cerrarla
 *  sería el mismo costo que se evitó en todo lo de arriba. */
export async function signOutFirebase(): Promise<void> {
  if (!firebaseDisponible || !authPromise) return;
  const { signOut } = await import("firebase/auth");
  const instancia = await authPromise;
  await signOut(instancia);
}

/** Mensaje en español para un error de `firebase/auth`. Los códigos vienen
 *  como `error.code` (p. ej. `auth/wrong-password`); lo que no se reconoce
 *  cae a un mensaje genérico en vez de mostrar el código crudo en pantalla. */
export function describirErrorFirebase(err: unknown): string {
  const codigo = (err as { code?: string } | null)?.code ?? "";
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Correo o contraseña incorrectos.";
    case "auth/user-not-found":
      return "No existe una cuenta con ese correo.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese correo. Iniciá sesión en vez de registrarte.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/invalid-email":
      return "Ese correo no es válido.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Probá de nuevo en unos minutos.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Se cerró la ventana de Google antes de terminar.";
    case "auth/network-request-failed":
      return "No se pudo conectar con Google. Revisá tu conexión.";
    default:
      return "No se pudo completar la operación con Google/correo.";
  }
}
