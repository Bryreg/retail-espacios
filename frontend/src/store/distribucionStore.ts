import { create } from "zustand";
import { describeError } from "../api/client";
import {
  confirmarDistribucion, descartarBorrador, espacioDeLaCara, guardarBorrador as escribirBorrador, leerCara, rechazoDe,
  type CaraOut, type DistribucionEscrita, type DistribucionOut, type ProblemaOut, type ZonaOut,
} from "../api/participaciones";
import {
  desdeElServidor, estadoInicial, fusionarZonas, reducir, zonaEnPunto, zonasParaEnviar,
  type Accion, type EstadoDeEdicion, type ZonaEnEdicion,
} from "../utils/edicionDeZonas";
import { firmaDeCara, type MuebleParaSuperficie } from "../utils/superficie";
import { useAuthStore } from "./authStore";
import { useFixtureStore } from "./fixtureStore";
import { useOcupacionStore } from "./ocupacionStore";

/**
 * La EDICIÓN de la distribución de una cara (§9.2 y §9.8 del diseño de
 * participaciones). Lo importan SÓLO `StoreEditor3D` y
 * `components/Distribucion/*` (guarda estática en `probar-distribucion.mjs`):
 * el tablero no se lo baja.
 *
 *   · Sin `persist` y nada en `localStorage`/`sessionStorage`/IndexedDB: el
 *     borrador oficial vive en el servidor (autoguardado a los 20 s de
 *     quietud, sin historial ni bitácora), y una copia por pestaña chocaría con
 *     el reinicio por sesión y sería un segundo lugar con datos comerciales.
 *   · Se vacía entero al cambiar de sesión o de cliente (`logout` no recarga
 *     la página): lo de un supermercado no aparece en la sesión de otro.
 *   · `entrar` guarda antes el plano pendiente (`flushPending`): si no, el
 *     servidor todavía ve la cara como se vendía antes y contesta 409.
 *   · Nada se pierde en silencio: cambiar de cara o salir con cambios guarda
 *     el borrador; si el guardado falla, la edición queda en memoria (mismo
 *     cliente) y al volver a esa cara se ofrece «Recuperar lo que no se
 *     guardó» (`recuperar`).
 *   · Otra sesión guardó en el medio (409 `version_vieja`): se deja de
 *     autoguardar y `traerLoNuevo` combina por participación
 *     (`fusionarZonas`), con «Usar lo mío» para los conflictos.
 */

export interface DistribucionActiva {
  cliente: string;
  sede: string;
  fixtureId: string;
  /** El código del mueble en el plano (`GON-01`). */
  codigo: string;
  cara: "A" | "B";
}

export type FormularioDeParticipacion =
  | null
  | { modo: "alta" | "renovar" | "confirmar" | "editar" | "cargarDeNuevo"; terminoId?: number };

export interface EstadoDelGuardado {
  estado: "quieto" | "guardando" | "error" | "version_vieja";
  mensaje: string | null;
  /** Cuándo fue el último autoguardado bueno (ms desde 1970), o null. */
  ultimoAuto: number | null;
}

/** Lo que no se pudo guardar al salir de una cara. */
export interface EdicionSinGuardar {
  zonas: ZonaEnEdicion[];
  base: ZonaEnEdicion[];
}

interface DistribucionStore {
  activa: DistribucionActiva | null;
  datos: CaraOut | null;
  cargando: boolean;
  error: string | null;
  edicion: EstadoDeEdicion;
  guardado: EstadoDelGuardado;
  /** «Ver al día»: por defecto el `hoy` del servidor. */
  verAlDia: string;
  formulario: FormularioDeParticipacion;
  /** Después de traer lo nuevo: las participaciones que las dos sesiones
   *  cambiaron distinto (quedó lo del servidor) y lo que había acá. */
  fusion: { conflictos: number[]; mias: ZonaEnEdicion[] } | null;
  /** Un clic en la OTRA cara del 3D con cambios sin guardar: la pantalla
   *  pregunta antes de cambiar (§9.3). */
  pedidoDeCara: "A" | "B" | null;
  /** Por `claveDeCara`: lo que no se pudo guardar al salir. */
  sinGuardar: Record<string, EdicionSinGuardar>;

  entrar: (a: { sede: string; fixtureId: string; codigo: string; cara: "A" | "B" }) => Promise<void>;
  /** `true` si salió. Sin forzar, con cambios que no se pudieron guardar, se
   *  queda; forzado (Presentar, reunión, desmontar), sale y los deja en
   *  memoria. */
  salir: (o?: { forzado?: boolean }) => Promise<boolean>;
  cambiarCara: (c: "A" | "B") => Promise<boolean>;
  cancelarPedidoDeCara: () => void;
  traerLoNuevo: () => Promise<void>;
  usarLoMio: (spaceId: number) => void;
  recuperar: () => void;
  olvidarSinGuardar: () => void;
  despachar: (a: Accion) => void;
  /** `true` si quedó guardado. */
  guardarBorrador: (automatico?: boolean) => Promise<boolean>;
  confirmar: () => Promise<void>;
  descartar: () => Promise<void>;
  tocarEnElMueble: (cara: "A" | "B", u: number, v: number) => void;
  abrirFormulario: (f: FormularioDeParticipacion) => void;
  /** Lo que devolvió una escritura de términos (`{termino, cara}`): pone la
   *  cara al día sin tocar lo dibujado y vuelve a leer la ocupación. */
  aplicarCara: (cara: CaraOut) => void;
  elegirDia: (dia: string) => void;
  /** Vacía todo: activa, datos, edición, formulario y lo no guardado. */
  reiniciar: () => void;
}

/** El autoguardado: tantos milisegundos sin cambios con algo sin guardar. */
export const AUTOGUARDADO_MS = 20_000;

const QUIETO: EstadoDelGuardado = { estado: "quieto", mensaje: null, ultimoAuto: null };

export const claveDeCara = (a: Pick<DistribucionActiva, "cliente" | "sede" | "fixtureId" | "cara">) =>
  `${a.cliente}|${a.sede}|${a.fixtureId}|${a.cara}`;

/** La capa que se edita: el borrador si hay; si no, la confirmada. */
export function capaQueSeMuestra(d: Pick<CaraOut, "distribucion"> | null): ZonaOut[] {
  return d?.distribucion?.borrador ?? d?.distribucion?.confirmada ?? [];
}

/** ¿El plano local firma igual que la cara que leyó el servidor? Si no (el
 *  plano tiene cambios sin guardar o la lectura es vieja), la edición se
 *  bloquea hasta que coincidan (§9.2). */
export function planoAlDia(datos: Pick<CaraOut, "firma" | "cara"> | null, mueble: MuebleParaSuperficie | null | undefined): boolean {
  if (!datos || !mueble) return false;
  return firmaDeCara(mueble, datos.cara) === datos.firma;
}

function sesion(): { token: string | null; cliente: string } {
  const { token, cliente } = useAuthStore.getState();
  return { token, cliente: cliente ?? "" };
}

const medidasDe = (d: CaraOut | null) => (d?.superficie ? { ancho: d.superficie.ancho, alto: d.superficie.alto } : null);

/** Una edición vacía que conserva las preferencias de la pantalla (imán,
 *  guías, modo). */
function edicionLimpia(e: EstadoDeEdicion): EstadoDeEdicion {
  return { ...estadoInicial(), iman: e.iman, imanAGuias: e.imanAGuias, guias: e.guias, modo: e.modo };
}

/** La cara con lo que devolvió una escritura de la distribución. */
function conEscritura(d: CaraOut, r: DistribucionEscrita): CaraOut {
  const distribucion: DistribucionOut | null = r.distribucion
    ?? (d.distribucion ? { ...d.distribucion, version: r.version } : null);
  const { version: _v, ...resto } = r;
  return { ...d, ...resto, distribucion, participaciones: r.participaciones ?? d.participaciones, revision: r.revision ?? d.revision };
}

/** Qué decir cuando un guardado no salió. */
function falla(e: unknown, antes: EstadoDelGuardado): EstadoDelGuardado {
  const r = rechazoDe(e);
  if (r?.code === "version_vieja") {
    return { ...antes, estado: "version_vieja", mensaje: r.message || "Otra sesión cambió esta distribución mientras la editabas." };
  }
  if (r?.code === "plano_cambio") {
    return { ...antes, estado: "version_vieja", mensaje: r.message || "El mueble cambió mientras confirmabas." };
  }
  if (r && r.status >= 400 && r.status < 500 && r.message) return { ...antes, estado: "error", mensaje: r.message };
  const por = describeError(e, "sin respuesta del servidor").replace(/\.\s*$/, "");
  return { ...antes, estado: "error", mensaje: `No se pudo guardar: ${por}. Tu trabajo sigue acá.` };
}

/** Sube con cada entrada, salida o reinicio: una respuesta de antes se tira. */
let generacion = 0;
/** El guardado en vuelo (se hacen de a uno). */
let enCurso: Promise<boolean> | null = null;
let relojAuto: ReturnType<typeof setTimeout> | null = null;

function cancelarAutoguardado(): void {
  if (relojAuto !== null) clearTimeout(relojAuto);
  relojAuto = null;
}

export const useDistribucionStore = create<DistribucionStore>()((set, get) => {
  const mismaCara = (a: DistribucionActiva | null, gen: number) => a !== null && gen === generacion && get().activa === a;

  const programarAutoguardado = () => {
    cancelarAutoguardado();
    relojAuto = setTimeout(() => {
      relojAuto = null;
      const { edicion } = get();
      if (!edicion.sucio) return;
      if (edicion.arrastre !== null) { programarAutoguardado(); return; }   // a mitad de un arrastre, después
      void get().guardarBorrador(true);
    }, AUTOGUARDADO_MS);
  };

  /** Deja la edición de la cara activa en memoria (no se pudo guardar). */
  const guardarEnMemoria = () => {
    const { activa, edicion } = get();
    if (!activa || !edicion.sucio) return;
    set((s) => ({ sinGuardar: { ...s.sinGuardar, [claveDeCara(activa)]: { zonas: edicion.zonas, base: edicion.base } } }));
  };

  const olvidarDeEstaCara = (a: DistribucionActiva) => {
    const k = claveDeCara(a);
    if (!(k in get().sinGuardar)) return;
    set((s) => {
      const sinGuardar = { ...s.sinGuardar };
      delete sinGuardar[k];
      return { sinGuardar };
    });
  };

  /** Sale de la cara activa sin mirar lo editado (eso ya se resolvió). */
  const soltar = () => {
    cancelarAutoguardado();
    generacion++;
    set((s) => ({
      activa: null, datos: null, cargando: false, error: null, edicion: edicionLimpia(s.edicion), guardado: QUIETO,
      formulario: null, fusion: null, pedidoDeCara: null,
    }));
  };

  /** Vuelve a leer la cara y pone `datos` al día, sin tocar lo dibujado. */
  const refrescarDatos = async (a: DistribucionActiva, gen: number) => {
    try {
      const d = await leerCara(a.sede, espacioDeLaCara(a.codigo, a.cara));
      if (mismaCara(a, gen)) set({ datos: d, edicion: { ...get().edicion, medidas: medidasDe(d) } });
    } catch { /* se queda con lo que tenía: el próximo guardado lo corrige */ }
  };

  return {
    activa: null,
    datos: null,
    cargando: false,
    error: null,
    edicion: estadoInicial(),
    guardado: QUIETO,
    verAlDia: "",
    formulario: null,
    fusion: null,
    pedidoDeCara: null,
    sinGuardar: {},

    entrar: async ({ sede, fixtureId, codigo, cara }) => {
      const { token, cliente } = sesion();
      if (!token) return;
      const antes = get().activa;
      if (antes && antes.cliente === cliente && antes.sede === sede && antes.fixtureId === fixtureId && antes.cara === cara
        && (get().datos || get().cargando)) return;                     // ya está en esa cara
      if (antes && get().edicion.sucio) {
        // La pantalla pregunta antes (§9.3); esto es la red: guardar, y si
        // no se puede, dejarlo en memoria.
        const ok = await get().guardarBorrador(true);
        if (!ok) guardarEnMemoria();
      }
      cancelarAutoguardado();
      const gen = ++generacion;
      const activa: DistribucionActiva = { cliente, sede, fixtureId, codigo, cara };
      set((s) => ({
        activa, datos: null, cargando: true, error: null, edicion: edicionLimpia(s.edicion), guardado: QUIETO,
        formulario: null, fusion: null, pedidoDeCara: null,
      }));
      try {
        await useFixtureStore.getState().flushPending();
      } catch { /* el guardado del plano avisa por su lado; la firma lo delata */ }
      if (!mismaCara(activa, gen)) return;
      try {
        const datos = await leerCara(sede, espacioDeLaCara(codigo, cara));
        const ahora = sesion();
        if (!mismaCara(activa, gen) || ahora.token !== token || ahora.cliente !== cliente) return;
        set((s) => ({
          datos, cargando: false, verAlDia: datos.hoy,
          edicion: reducir(s.edicion, { tipo: "cargar", zonas: capaQueSeMuestra(datos), medidas: medidasDe(datos) }),
        }));
      } catch (e) {
        if (mismaCara(activa, gen)) set({ cargando: false, error: describeError(e, "No se pudo leer la cara.") });
      }
    },

    salir: async (o) => {
      const a = get().activa;
      if (!a) return true;
      if (get().edicion.sucio) {
        const ok = await get().guardarBorrador(true);
        if (!ok) {
          if (!o?.forzado) return false;
          guardarEnMemoria();
        }
      }
      if (get().activa !== a) return true;   // alguien ya cambió de cara mientras se guardaba
      soltar();
      return true;
    },

    cambiarCara: async (c) => {
      const a = get().activa;
      if (!a) return false;
      if (a.cara === c) { set({ pedidoDeCara: null }); return true; }
      if (get().edicion.sucio) {
        const ok = await get().guardarBorrador(true);
        if (!ok) return false;
      }
      if (get().activa !== a) return false;
      await get().entrar({ sede: a.sede, fixtureId: a.fixtureId, codigo: a.codigo, cara: c });
      return true;
    },

    cancelarPedidoDeCara: () => set({ pedidoDeCara: null }),

    traerLoNuevo: async () => {
      const a = get().activa;
      if (!a) return;
      const gen = generacion;
      set({ cargando: true });
      try {
        const datos = await leerCara(a.sede, espacioDeLaCara(a.codigo, a.cara));
        if (!mismaCara(a, gen)) return;
        const suyas = capaQueSeMuestra(datos);
        const ed = get().edicion;
        const f = fusionarZonas(ed.base, ed.zonas, suyas);
        const edicion = { ...reducir(ed, { tipo: "fusionar", zonas: f.zonas, base: desdeElServidor(suyas) }), medidas: medidasDe(datos) };
        set({
          datos, cargando: false, error: null, edicion, guardado: QUIETO,
          fusion: f.conflictos.length > 0 ? { conflictos: f.conflictos, mias: ed.zonas } : null,
        });
        if (edicion.sucio) programarAutoguardado();
      } catch (e) {
        if (mismaCara(a, gen)) set({ cargando: false, guardado: falla(e, get().guardado) });
      }
    },

    usarLoMio: (spaceId) => {
      const f = get().fusion;
      if (!f || !f.conflictos.includes(spaceId)) return;
      get().despachar({ tipo: "usarZonas", spaceId, zonas: f.mias.filter((z) => z.participacionSpaceId === spaceId) });
      const conflictos = f.conflictos.filter((s) => s !== spaceId);
      set({ fusion: conflictos.length > 0 ? { ...f, conflictos } : null });
    },

    recuperar: () => {
      const { activa, datos, sinGuardar, edicion } = get();
      if (!activa || !datos) return;
      const guardada = sinGuardar[claveDeCara(activa)];
      if (!guardada) return;
      const suyas = capaQueSeMuestra(datos);
      const f = fusionarZonas(guardada.base, guardada.zonas, suyas);
      const ed = reducir(edicion, { tipo: "fusionar", zonas: f.zonas, base: desdeElServidor(suyas) });
      set({ edicion: ed, fusion: f.conflictos.length > 0 ? { conflictos: f.conflictos, mias: guardada.zonas } : null });
      olvidarDeEstaCara(activa);
      if (ed.sucio) programarAutoguardado();
    },

    olvidarSinGuardar: () => {
      const a = get().activa;
      if (a) olvidarDeEstaCara(a);
    },

    despachar: (accion) => {
      const antes = get().edicion;
      const edicion = reducir(antes, accion);
      if (edicion === antes) return;
      set({ edicion });
      if (!edicion.sucio) cancelarAutoguardado();
      else if (edicion.zonas !== antes.zonas) programarAutoguardado();
    },

    guardarBorrador: async (automatico = false) => {
      if (enCurso) await enCurso;
      const a = get().activa, d = get().datos;
      if (!a || !d) return false;
      if (automatico && get().guardado.estado === "version_vieja") return false;   // hasta traer lo nuevo
      const gen = generacion;
      const foto = get().edicion.zonas;
      const version = d.distribucion?.version ?? 0;
      cancelarAutoguardado();
      set((s) => ({ guardado: { ...s.guardado, estado: "guardando", mensaje: null } }));
      const pedido = (async () => {
        try {
          const r = await escribirBorrador({
            sede: a.sede, espacio: espacioDeLaCara(a.codigo, a.cara), version, automatico, zonas: zonasParaEnviar(foto),
          });
          if (!mismaCara(a, gen)) return false;
          set((s) => ({
            datos: s.datos ? conEscritura(s.datos, r) : s.datos,
            edicion: reducir(s.edicion, { tipo: "guardado", base: foto }),
            guardado: { estado: "quieto", mensaje: null, ultimoAuto: automatico ? Date.now() : s.guardado.ultimoAuto },
          }));
          olvidarDeEstaCara(a);
          if (get().edicion.sucio) programarAutoguardado();   // se siguió dibujando mientras se guardaba
          return true;
        } catch (e) {
          if (mismaCara(a, gen)) set((s) => ({ guardado: falla(e, s.guardado) }));
          return false;
        }
      })();
      enCurso = pedido;
      try { return await pedido; } finally { if (enCurso === pedido) enCurso = null; }
    },

    confirmar: async () => {
      if (enCurso) await enCurso;
      const a = get().activa, d = get().datos;
      if (!a || !d) return;
      const gen = generacion;
      const foto = get().edicion.zonas;
      const version = d.distribucion?.version ?? 0;
      cancelarAutoguardado();
      set((s) => ({ guardado: { ...s.guardado, estado: "guardando", mensaje: null } }));
      const pedido = (async () => {
        try {
          const r = await confirmarDistribucion({ sede: a.sede, espacio: espacioDeLaCara(a.codigo, a.cara), version, zonas: zonasParaEnviar(foto) });
          if (!mismaCara(a, gen)) return false;
          set((s) => ({
            datos: s.datos ? conEscritura(s.datos, r) : s.datos,
            edicion: reducir(s.edicion, { tipo: "guardado", base: foto }),
            guardado: { ...s.guardado, estado: "quieto", mensaje: null }, fusion: null,
          }));
          olvidarDeEstaCara(a);
          useOcupacionStore.getState().invalidarResumen(a.sede);
          return true;
        } catch (e) {
          if (!mismaCara(a, gen)) return false;
          const r = rechazoDe(e);
          if (r?.code === "distribucion_invalida") {
            // Se guardó como BORRADOR (el 409 hizo commit): la base es lo
            // mandado, y la versión, la nueva. Los errores quedan a la vista.
            const v = typeof r.cuerpo.version === "number" ? r.cuerpo.version : version + 1;
            const errores = Array.isArray(r.cuerpo.errores) ? r.cuerpo.errores as ProblemaOut[] : [];
            const avisos = Array.isArray(r.cuerpo.avisos) ? r.cuerpo.avisos as ProblemaOut[] : [];
            set((s) => ({
              datos: s.datos ? {
                ...s.datos,
                distribucion: s.datos.distribucion
                  ? { ...s.datos.distribucion, version: v }
                  : { id: 0, version: v, estado: "borrador", confirmada_en: null, confirmada_por: null, para_revisar: false,
                      borrador_en: null, borrador_por: null, confirmada: [], borrador: [] },
                revision: { capa: "borrador", errores, avisos },
              } : s.datos,
              edicion: reducir(s.edicion, { tipo: "guardado", base: foto }),
              guardado: { ...s.guardado, estado: "quieto", mensaje: r.message || "La distribución tiene problemas: se guardó como borrador." },
            }));
            olvidarDeEstaCara(a);
            void refrescarDatos(a, gen);
            return false;
          }
          set((s) => ({ guardado: falla(e, s.guardado) }));
          return false;
        }
      })();
      enCurso = pedido;
      try { await pedido; } finally { if (enCurso === pedido) enCurso = null; }
    },

    descartar: async () => {
      if (enCurso) await enCurso;
      const a = get().activa, d = get().datos;
      if (!a || !d?.distribucion) return;
      const gen = generacion;
      try {
        const r = await descartarBorrador({ sede: a.sede, espacio: espacioDeLaCara(a.codigo, a.cara), version: d.distribucion.version });
        if (!mismaCara(a, gen)) return;
        cancelarAutoguardado();
        set((s) => {
          const datos = s.datos ? conEscritura(s.datos, r) : s.datos;
          return {
            datos, guardado: QUIETO, fusion: null,
            edicion: reducir(s.edicion, { tipo: "cargar", zonas: capaQueSeMuestra(datos), medidas: medidasDe(datos) }),
          };
        });
        olvidarDeEstaCara(a);
      } catch (e) {
        if (mismaCara(a, gen)) set((s) => ({ guardado: falla(e, s.guardado) }));
      }
    },

    tocarEnElMueble: (cara, u, v) => {
      const a = get().activa;
      if (!a) return;
      if (cara !== a.cara) {
        if (get().edicion.sucio) set({ pedidoDeCara: cara });
        else void get().cambiarCara(cara);
        return;
      }
      get().despachar({ tipo: "seleccionar", zona: zonaEnPunto(get().edicion.zonas, [u, v]) });
    },

    abrirFormulario: (f) => set({ formulario: f }),

    aplicarCara: (cara) => {
      const a = get().activa;
      if (!a || cara.fixture?.id !== a.fixtureId || cara.cara !== a.cara) return;
      set((s) => ({ datos: cara, edicion: { ...s.edicion, medidas: medidasDe(cara) } }));
      void useOcupacionStore.getState().recargarOcupacion(a.sede);
      useOcupacionStore.getState().invalidarResumen(a.sede);
    },

    elegirDia: (dia) => set({ verAlDia: dia }),

    reiniciar: () => {
      cancelarAutoguardado();
      generacion++;
      enCurso = null;
      set({
        activa: null, datos: null, cargando: false, error: null, edicion: estadoInicial(), guardado: QUIETO,
        verAlDia: "", formulario: null, fusion: null, pedidoDeCara: null, sinGuardar: {},
      });
    },
  };
});

/** ¿Hay algo sin guardar de esta cara, de una salida anterior? */
export function hayParaRecuperar(s: Pick<DistribucionStore, "activa" | "sinGuardar">): boolean {
  return s.activa !== null && claveDeCara(s.activa) in s.sinGuardar;
}

// Al cambiar de sesión o de cliente se vacía, aunque no haya ninguna pantalla
// montada (un 401 cierra la sesión sin recargar la página).
useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) useDistribucionStore.getState().reiniciar();
});
