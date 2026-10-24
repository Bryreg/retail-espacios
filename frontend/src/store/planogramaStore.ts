import { create } from "zustand";
import { describeError } from "../api/client";
import * as API from "../api/planogramas";
import { rechazoDe } from "../api/participaciones";
import type { CaraDelPlanograma, DestinoOut, ProblemaDePlanograma, ResumenDePlanogramas } from "../api/planogramas";
import { useAuthStore } from "./authStore";
import { mismasPiezas, piezasDeEntrada, type PiezaEnEdicion } from "../utils/planograma";
import type { FormaDePieza } from "../utils/piezas";
import type { Poligono, Punto } from "../utils/zonasGeometria";

/**
 * La pantalla «Planificar la cara» (fase 2 de la distribución): qué cara está
 * abierta, lo que dijo el servidor y la copia que se edita, con deshacer y
 * rehacer. El borrador oficial vive en el servidor: se guarda solo a los 20 s
 * de quieto, al cambiar de cara y al salir (si se quiere). Nada se guarda en el
 * navegador.
 */

export interface CaraAbierta {
  sede: string;
  fixtureId: string;
  cara: "A" | "B";
}

export type Guardado =
  | { estado: "quieto"; ultimoAuto: number | null }
  | { estado: "guardando" }
  | { estado: "error"; mensaje: string }
  | { estado: "version_vieja"; mensaje: string };

interface Estado {
  abierta: CaraAbierta | null;
  datos: CaraDelPlanograma | null;
  cargando: boolean;
  error: string | null;
  piezas: PiezaEnEdicion[];
  atras: PiezaEnEdicion[][];
  adelante: PiezaEnEdicion[][];
  /** La forma elegida de cada destino (Franja, Estantes, A mano). */
  formas: Record<number, FormaDePieza>;
  /** Destinos recién creados que todavía no vienen en `datos`. */
  nuevos: DestinoOut[];
  guardado: Guardado;
  /** El trazo «A mano» de la pieza elegida (null: no se está dibujando). */
  trazo: Punto[] | null;
  elegida: number | null;
  /** Lo que acaba de pasar, en palabras (con las piezas de ese momento: si la
   *  cara cambia después, la pista vieja deja de verse). */
  pista: { texto: string; piezas: PiezaEnEdicion[] } | null;
  /** Mirando una versión publicada (solo lectura). */
  mirando: API.VersionOut | null;
  /** El estado de los planogramas de cada sede (para el plano). */
  resumenes: Record<string, ResumenDePlanogramas | undefined>;

  abrir: (c: CaraAbierta) => Promise<void>;
  cerrar: () => void;
  recargar: () => Promise<void>;
  poner: (destinoId: number, vertices: Poligono | null) => void;
  ponerVarias: (cambios: { destinoId: number; vertices: Poligono | null }[]) => void;
  agregar: (destino: DestinoOut, pb: number) => void;
  cambiarPb: (destinoId: number, pb: number) => void;
  quitar: (destinoId: number) => void;
  vaciar: () => void;
  deshacer: () => void;
  rehacer: () => void;
  descartarCambios: () => void;
  ponerForma: (destinoId: number, f: FormaDePieza) => void;
  elegir: (id: number | null) => void;
  ponerTrazo: (t: Punto[] | null) => void;
  decir: (texto: string | null) => void;
  anotarDestino: (d: DestinoOut) => void;
  guardarBorrador: (automatico: boolean) => Promise<boolean>;
  publicar: (rigeDesde: string, hasta: string | null) => Promise<{ ok: true; numero: number } | { ok: false; mensaje: string; errores: ProblemaDePlanograma[] }>;
  descartarBorrador: () => Promise<boolean>;
  mirar: (v: API.VersionOut | null) => void;
  leerResumen: (sede: string) => Promise<void>;
}

const QUIETO: Guardado = { estado: "quieto", ultimoAuto: null };
const AUTOGUARDADO_MS = 20_000;
let reloj: ReturnType<typeof setTimeout> | null = null;

/** ¿Hay cambios sin guardar? Contra el borrador del servidor (o, sin
 *  borrador, contra lo que arrancó la pantalla: la vigente o nada). */
export function haySinGuardar(s: Pick<Estado, "datos" | "piezas">): boolean {
  return !!s.datos && !mismasPiezas(s.piezas, piezasDeEntrada(s.datos));
}

export const usePlanograma = create<Estado>()((set, get) => {
  /** Un cambio de la copia: va a deshacer, borra rehacer y arma el autoguardado. */
  const cambiar = (piezas: PiezaEnEdicion[]) => {
    const s = get();
    if (s.mirando || !s.datos?.permisos.planificar) return;
    set({ piezas, atras: [...s.atras.slice(-60), s.piezas], adelante: [], trazo: null });
    armarAutoguardado();
  };
  const armarAutoguardado = () => {
    if (reloj) clearTimeout(reloj);
    reloj = setTimeout(() => {
      const s = get();
      if (s.abierta && haySinGuardar(s) && s.guardado.estado === "quieto") void s.guardarBorrador(true);
    }, AUTOGUARDADO_MS);
  };
  const cuerpo = () => {
    const { abierta, datos } = get();
    return { sede: abierta!.sede, fixture_id: abierta!.fixtureId, cara: abierta!.cara, version: datos?.planograma.version ?? 0 };
  };
  const llegaron = (d: CaraDelPlanograma, conservar = false) => {
    set((s) => ({
      datos: d,
      piezas: conservar ? s.piezas : piezasDeEntrada(d),
      ...(conservar ? {} : { atras: [], adelante: [] }),
      nuevos: s.nuevos.filter((n) => !(String(n.id) in d.destinos)),
    }));
    if (d.sede) void get().leerResumen(d.sede);
  };

  return {
    abierta: null, datos: null, cargando: false, error: null, piezas: [], atras: [], adelante: [], formas: {}, nuevos: [],
    guardado: QUIETO, trazo: null, elegida: null, pista: null, mirando: null, resumenes: {},

    abrir: async (c) => {
      if (reloj) clearTimeout(reloj);
      set({ abierta: c, datos: null, cargando: true, error: null, piezas: [], atras: [], adelante: [], formas: {},
        guardado: QUIETO, trazo: null, elegida: null, pista: null, mirando: null });
      try {
        const d = await API.leerCara(c.sede, c.fixtureId, c.cara);
        if (get().abierta !== c) return;
        llegaron(d);
        set({ cargando: false });
      } catch (e) {
        if (get().abierta !== c) return;
        set({ cargando: false, error: describeError(e, "No se pudo leer la cara.") });
      }
    },
    cerrar: () => {
      if (reloj) clearTimeout(reloj);
      set({ abierta: null, datos: null, piezas: [], atras: [], adelante: [], trazo: null, elegida: null, pista: null, mirando: null,
        guardado: QUIETO, error: null });
    },
    recargar: async () => {
      const c = get().abierta;
      if (!c) return;
      try {
        const d = await API.leerCara(c.sede, c.fixtureId, c.cara);
        if (get().abierta !== c) return;
        llegaron(d);
        set({ guardado: QUIETO });
      } catch (e) {
        set({ guardado: { estado: "error", mensaje: describeError(e, "No se pudo leer la cara.") } });
      }
    },
    poner: (destinoId, vertices) => cambiar(get().piezas.map((p) => (p.destinoId === destinoId ? { ...p, vertices } : p))),
    ponerVarias: (cambios) => {
      const por = new Map(cambios.map((c) => [c.destinoId, c.vertices]));
      cambiar(get().piezas.map((p) => (por.has(p.destinoId) ? { ...p, vertices: por.get(p.destinoId)! } : p)));
    },
    agregar: (destino, pb) => {
      const s = get();
      if (s.piezas.some((p) => p.destinoId === destino.id)) return;
      get().anotarDestino(destino);
      cambiar([...s.piezas, { destinoId: destino.id, pb, vertices: null }]);
      set({ elegida: destino.id });
    },
    cambiarPb: (destinoId, pb) => cambiar(get().piezas.map((p) => (p.destinoId === destinoId ? { ...p, pb, vertices: p.pb === pb ? p.vertices : null } : p))),
    quitar: (destinoId) => {
      cambiar(get().piezas.filter((p) => p.destinoId !== destinoId));
      if (get().elegida === destinoId) set({ elegida: null });
    },
    vaciar: () => cambiar(get().piezas.map((p) => ({ ...p, vertices: null }))),
    deshacer: () => {
      const s = get();
      const antes = s.atras[s.atras.length - 1];
      if (!antes) return;
      set({ piezas: antes, atras: s.atras.slice(0, -1), adelante: [s.piezas, ...s.adelante], trazo: null });
      armarAutoguardado();
    },
    rehacer: () => {
      const s = get();
      const despues = s.adelante[0];
      if (!despues) return;
      set({ piezas: despues, adelante: s.adelante.slice(1), atras: [...s.atras, s.piezas], trazo: null });
      armarAutoguardado();
    },
    descartarCambios: () => {
      const d = get().datos;
      if (!d) return;
      cambiar(piezasDeEntrada(d));
    },
    ponerForma: (destinoId, f) => set((s) => ({ formas: { ...s.formas, [destinoId]: f } })),
    elegir: (elegida) => set({ elegida, trazo: null }),
    ponerTrazo: (trazo) => set({ trazo }),
    decir: (texto) => set({ pista: texto === null ? null : { texto, piezas: get().piezas } }),
    anotarDestino: (d) => set((s) => ({ nuevos: [...s.nuevos.filter((n) => n.id !== d.id), d] })),

    guardarBorrador: async (automatico) => {
      const s = get();
      if (!s.abierta || !s.datos || s.guardado.estado === "guardando") return false;
      const enviadas = s.piezas;
      set({ guardado: { estado: "guardando" } });
      try {
        const d = await API.guardarBorrador({
          ...cuerpo(), automatico,
          piezas: enviadas.map((p) => ({ destino_id: p.destinoId, pb: p.pb, vertices: p.vertices })),
        });
        // Lo que se siguió editando mientras viajaba queda en pantalla.
        const siguio = get().piezas !== enviadas;
        set({ datos: d, guardado: { estado: "quieto", ultimoAuto: automatico ? Date.now() : null } });
        // Si no, la copia pasa a ser lo guardado (los vértices como los dejó el
        // servidor: limpios y cuantizados), así «sin guardar» compara igual.
        if (!siguio) set({ piezas: piezasDeEntrada(d) });
        else armarAutoguardado();
        return true;
      } catch (e) {
        const r = rechazoDe(e);
        if (r?.code === "version_vieja") {
          set({ guardado: { estado: "version_vieja", mensaje: "Otra sesión cambió este planograma mientras lo editabas." } });
        } else {
          set({ guardado: { estado: "error", mensaje: describeError(e, "No se pudo guardar. Tu trabajo sigue acá.") } });
        }
        return false;
      }
    },

    publicar: async (rigeDesde, hasta) => {
      const s = get();
      if (!s.abierta || !s.datos) return { ok: false, mensaje: "La cara no está abierta.", errores: [] };
      if (haySinGuardar(s) && !(await get().guardarBorrador(false))) {
        const g = get().guardado;
        return { ok: false, mensaje: "mensaje" in g ? g.mensaje : "No se pudo guardar el borrador.", errores: [] };
      }
      try {
        const d = await API.publicar({ ...cuerpo(), rige_desde: rigeDesde, hasta });
        llegaron(d);
        set({ guardado: QUIETO, pista: null, trazo: null });
        return { ok: true, numero: d.publicada ?? d.planograma.vigente?.numero ?? 0 };
      } catch (e) {
        const r = rechazoDe(e);
        const errores = Array.isArray(r?.cuerpo.errores) ? (r!.cuerpo.errores as ProblemaDePlanograma[]) : [];
        if (r?.code === "version_vieja") set({ guardado: { estado: "version_vieja", mensaje: r.message } });
        return { ok: false, mensaje: r?.message || describeError(e, "No se pudo publicar."), errores };
      }
    },

    descartarBorrador: async () => {
      const s = get();
      if (!s.abierta || !s.datos) return false;
      try {
        const d = await API.descartar(cuerpo());
        llegaron(d);
        set({ guardado: QUIETO });
        return true;
      } catch (e) {
        set({ guardado: { estado: "error", mensaje: describeError(e, "No se pudo descartar el borrador.") } });
        return false;
      }
    },

    mirar: (mirando) => set({ mirando, trazo: null, elegida: null }),

    leerResumen: async (sede) => {
      try {
        const r = await API.leerResumen(sede);
        set((s) => ({ resumenes: { ...s.resumenes, [sede]: r } }));
      } catch {
        /* El plano sigue sin el estado del planograma: no es un error de la persona. */
      }
    },
  };
});

useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) {
    usePlanograma.getState().cerrar();
    usePlanograma.setState({ resumenes: {}, nuevos: [] });
  }
});
