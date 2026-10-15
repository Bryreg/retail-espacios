import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signOutFirebase } from "../api/firebase";

export type Role = "admin" | "worker";

/** El rol de la persona EN ese supermercado. `Role` es el del token y junta al
 *  dueño con el administrador; para mostrar quién es quién hace falta éste. */
export type RolCliente = "owner" | "admin" | "worker";

/** Fase 2 clientes: lo que trae el login cuando el cliente NO está
 *  `activo`. `motivo` lo escribió el operador al mover el interruptor;
 *  `suspendido` sólo lo puede traer una sesión de owner (worker/admin
 *  reciben 402 al loguearse y nunca llegan a guardar sesión). No es un claim
 *  del JWT — campo de RESPUESTA nada más, ver contrato Fase 2 §2.2 F. */
export type EstadoCuentaAviso = "gracia" | "solo_lectura" | "suspendido";

export interface AvisoCuenta {
  estado: EstadoCuentaAviso;
  /** El motivo sólo le llega a la dueña: a su gente le llega `null` (el login
   *  y `GET /auth/estado-cuenta` lo sacan), y la pantalla pone un texto
   *  propio. Nunca lleva montos cuando lo escribe el sistema. */
  motivo: string | null;
}

interface AuthState {
  token: string | null;
  role: Role | null;
  /** De qué supermercado es esta sesión. Se guarda sólo para poder mostrarlo;
   *  quien manda es el que va firmado adentro del token. */
  cliente: string | null;
  clienteNombre: string | null;
  /** `null` en sesiones de antes del 2026-10-02 (o del login legado): la barra
   *  cae entonces a la palabra del rol del token. */
  rolCliente: RolCliente | null;
  /** Sólo presentes en sesiones nacidas de Google/correo (Fase 1 identidad):
   *  el login legado no manda ninguno de los dos, y quedan en `null`. */
  email: string | null;
  nombre: string | null;
  /** `null` cuando el cliente está `activo` (el caso normal). Se persiste
   *  junto con el resto de la sesión a propósito — a diferencia de la lista
   *  de clientes del panel de plataforma (que NUNCA toca localStorage), esto
   *  es sólo el estado de ESTA cuenta, tan sensible como el rol o el cliente
   *  que ya se guardan acá mismo. */
  avisoCuenta: AvisoCuenta | null;
  /** Fase 3 compliance: `true` cuando el login trajo `pedir_consentimiento`
   *  — una cuenta existente, con membresía, que nunca aceptó (o aceptó una
   *  versión vieja de) la Política de Tratamiento de Datos. Se persiste
   *  junto con el resto de la sesión a propósito: "una vez por sesión de
   *  login, no un muro" significa que cerrar el aviso lo apaga hasta el
   *  PRÓXIMO login (que vuelve a poner lo que diga el servidor en ese
   *  momento) — no hasta la próxima recarga de la pestaña. */
  pedirConsentimiento: boolean;
  /** Fase 4 plataforma: `true` sólo en la sesión de un operador SIN
   *  membresías — la que `/auth/oauth` devuelve con `plataforma: true` y
   *  `cliente: "plataforma"` en vez del 403 que antes ofrecía "fundá tu
   *  supermercado" (esa rama sigue existiendo para quien NO es operador).
   *  Se persiste junto con el resto de la sesión, igual que `avisoCuenta`:
   *  una recarga tiene que seguir sabiendo que esta sesión no tiene layout
   *  que sincronizar ni Dashboard que mostrar. `App.tsx` la lee para (a)
   *  no arrancar `startAutoSync` -- con este token cualquier fetch de
   *  layout/spaces daría 401 y el interceptor de `api/client.ts` borraría
   *  la sesión -- y (b) mandar "/" a "/plataforma" en vez de montar
   *  `Dashboard`. */
  plataforma: boolean;
  setAuth: (
    token: string,
    role: Role,
    cliente?: string,
    clienteNombre?: string,
    email?: string,
    nombre?: string,
    avisoCuenta?: AvisoCuenta | null,
    pedirConsentimiento?: boolean,
    plataforma?: boolean,
    rolCliente?: RolCliente
  ) => void;
  /** Deja el estado de cuenta que acaba de contestar el servidor, sin tocar
   *  el resto de la sesión.
   *
   *  Lo llama el interceptor de `api/client.ts` cuando un pedido vuelve 402.
   *  Hasta que existió, `avisoCuenta` se escribía UNA sola vez —en el login— y
   *  se persistía: si a un cliente lo suspendían mientras su gente ya estaba
   *  adentro, la pantalla no se enteraba hasta el próximo login. El corte del
   *  servidor sí funcionaba; lo que seguía andando era la app dibujada. */
  marcarEstadoCuenta: (estado: EstadoCuentaAviso, motivo: string) => void;
  /** Deja el estado de cuenta tal como lo dice el servidor AHORA, también
   *  cuando volvió a estar al día (`null`).
   *
   *  Lo llaman `BloqueoCuenta` y `AvisoCuentaBanner` con lo que contesta
   *  `GET /auth/estado-cuenta`, cada pocos minutos y con «Reintentar» (C2).
   *  Hasta que existió, nada limpiaba el aviso salvo el logout: después de un
   *  pago, la gente del supermercado seguía bloqueada o con la franja hasta
   *  volver a entrar. Mismas guardas que `marcarEstadoCuenta`: sin sesión no
   *  escribe nada, y si ya dice lo mismo no despierta a nadie. */
  actualizarAvisoCuenta: (aviso: AvisoCuenta | null) => void;
  /** Cierra el aviso de consentimiento sin más — el botón "Ahora no" y el
   *  que sigue a un `aceptar-politica` exitoso. No es un muro. */
  descartarConsentimiento: () => void;
  logout: () => void;
}

/** Session auth — token + role, persisted so a refresh keeps the session.
 *  The backend validates the token on every request; a 401 clears it. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      cliente: null,
      clienteNombre: null,
      rolCliente: null,
      email: null,
      nombre: null,
      avisoCuenta: null,
      pedirConsentimiento: false,
      plataforma: false,
      setAuth: (
        token, role, cliente, clienteNombre, email, nombre, avisoCuenta, pedirConsentimiento, plataforma,
        rolCliente,
      ) =>
        set({
          token,
          role,
          cliente: cliente ?? null,
          clienteNombre: clienteNombre ?? null,
          rolCliente: rolCliente ?? null,
          email: email ?? null,
          nombre: nombre ?? null,
          avisoCuenta: avisoCuenta ?? null,
          pedirConsentimiento: pedirConsentimiento ?? false,
          plataforma: plataforma ?? false,
        }),
      marcarEstadoCuenta: (estado, motivo) =>
        set((s) =>
          // Sin sesión no hay nada que marcar: un 402 del login mismo lo
          // muestra la pantalla de ingreso con su propio mensaje, y escribir
          // el aviso acá dejaría el estado de un cliente ajeno pegado en el
          // store de quien todavía no entró.
          //
          // Y si el aviso ya dice lo mismo, no se toca: `set` con un objeto
          // nuevo despierta a todos los suscriptores, y esto corre en CADA
          // respuesta 402 — en `solo_lectura` eso es una vez por intento de
          // guardar, con la app entera redibujándose al pedo.
          //
          // Basta con el MISMO estado, aunque el motivo difiera (C2): el que
          // ya está lo dijo el servidor —el login o `GET /auth/estado-cuenta`,
          // con el motivo de verdad para la dueña— y el de acá es el genérico
          // «en caliente». Pisarlo hacía titilar la pantalla de bloqueo entre
          // los dos textos, una vez por cada 402 de la sincronización.
          !s.token || s.avisoCuenta?.estado === estado
            ? s
            : { avisoCuenta: { estado, motivo } },
        ),
      descartarConsentimiento: () => set({ pedirConsentimiento: false }),
      actualizarAvisoCuenta: (aviso) =>
        set((s) => {
          if (!s.token) return s;
          const actual = s.avisoCuenta;
          if (aviso === null) return actual === null ? s : { avisoCuenta: null };
          return actual?.estado === aviso.estado && actual?.motivo === aviso.motivo
            ? s
            : { avisoCuenta: { estado: aviso.estado, motivo: aviso.motivo } };
        }),
      logout: () => {
        set({
          token: null, role: null, cliente: null, clienteNombre: null, rolCliente: null,
          email: null, nombre: null, avisoCuenta: null, pedirConsentimiento: false,
          plataforma: false,
        });
        // Cierra también la sesión de Firebase, si el SDK llegó a
        // inicializarse — si nunca se usó la vía nueva esto es un no-op
        // instantáneo (ver `signOutFirebase` en api/firebase.ts). No se
        // espera la promesa: salir de la app no debe quedar colgado de una
        // llamada de red al proveedor de identidad.
        void signOutFirebase();
      },
    }),
    { name: "retail-auth-v1" }
  )
);

/** Convenience selector: true when the current session is an admin. */
export const selectIsAdmin = (s: AuthState): boolean => s.role === "admin";
