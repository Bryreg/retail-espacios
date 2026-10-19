import { create } from "zustand";
import { describeError } from "../api/client";
import {
  confirmarDistribucion, descartarBorrador, espacioDeLaCara, guardarBorrador as escribirBorrador, leerCara, rechazoDe,
  type CaraOut, type DistribucionEscrita, type DistribucionOut, type OrigenDeCopiaIn, type ProblemaOut, type ZonaOut,
} from "../api/participaciones";
import {
  descartarEnCualquierModo, desdeElServidor, estadoInicial, fusionarZonas, reducir, zonaEnPunto, zonasParaEnviar,
  type Accion, type EstadoDeEdicion, type ZonaEnEdicion, type ZonaPegada,
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
 *     la página): lo de un supermercado no aparece en la sesión de otro. Lo
 *     no guardado de una sesión que se cierra (un 401) queda apartado EN
 *     MEMORIA y vuelve como «Recuperar lo que no se guardó» sólo si vuelve a
 *     entrar la misma persona en el mismo cliente (`reservaDeLaSesion`).
 *   · `entrar` guarda antes el plano pendiente (`flushPending`): si no, el
 *     servidor todavía ve la cara como se vendía antes y contesta 409.
 *   · Nada se pierde en silencio: cambiar de cara o salir con cambios guarda
 *     el borrador; si el guardado falla, la edición queda en memoria (mismo
 *     cliente) y al volver a esa cara se ofrece «Recuperar lo que no se
 *     guardó» (`recuperar`).
 *   · Otra sesión guardó en el medio (409 `version_vieja`): se deja de
 *     autoguardar y `traerLoNuevo` combina por participación
 *     (`fusionarZonas`), con «Usar lo mío» para los conflictos.
 *   · Una escritura de términos que vuelve con un 409 (otra sesión vendió en
 *     el medio): `releerTrasConflicto` vuelve a leer la cara y la ocupación
 *     sin cerrar el formulario, y su vista previa dice lo que queda de verdad.
 *   · «Copiar zonas de otra cara» (fase 2 · I1, `pegarCopia`): lo pegado es
 *     UN paso de deshacer y se guarda enseguida como la persona, con `origen`
 *     (sólo historial y bitácora). Si ese guardado no sale (red, 409), el
 *     origen viaja con el próximo guardado que lleve alguna zona pegada —el
 *     autoguardado después de «Traer lo nuevo», el de red al cambiar de cara o
 *     salir, el que hace `confirmar` antes de confirmar—; si la copia se
 *     deshizo antes (ninguna clave pegada sigue en lo que se guarda), no se
 *     declara nada. Confirmar y su candado no cambian.
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

/** fase 2 · I1 · «Copiar zonas de otra cara»: de dónde vinieron las zonas
 *  pegadas en una cara. */
export interface CopiaDeZonas {
  /** `claveDeCara` de la cara a la que se pegaron. */
  cara: string;
  /** Lo que el borrador declara (sólo historial y bitácora). */
  origen: OrigenDeCopiaIn;
  /** «NAVE · GON-01 · cara A», para la franja del panel. */
  rotulo: string;
  /** Las claves (`n<k>`) de las zonas pegadas. Si ninguna sigue en lo que se
   *  guarda (se deshizo la copia), el origen no se declara. */
  claves: string[];
  /** Un guardado ya la llevó al servidor (no se vuelve a declarar). */
  declarada: boolean;
}

/** Lo que no se pudo guardar al salir de una cara. */
export interface EdicionSinGuardar {
  zonas: ZonaEnEdicion[];
  base: ZonaEnEdicion[];
  /** fase 2 · I1: una copia pegada que todavía no llegó al servidor. */
  copia?: CopiaDeZonas;
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
  /** fase 2 · I1: la última copia pegada en la cara activa (declarada o no). */
  copia: CopiaDeZonas | null;

  entrar: (a: { sede: string; fixtureId: string; codigo: string; cara: "A" | "B" }) => Promise<void>;
  /** `true` si salió. Sin forzar, con cambios que no se pudieron guardar, se
   *  queda; forzado (Presentar, reunión, desmontar), sale y los deja en
   *  memoria. Con `descartar` («Descartarlos»), los cambios de la pantalla se
   *  tiran antes —en cualquier modo— y no se guarda nada. */
  salir: (o?: { forzado?: boolean; descartar?: boolean }) => Promise<boolean>;
  cambiarCara: (c: "A" | "B", o?: { descartar?: boolean }) => Promise<boolean>;
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
  /** Una escritura de términos que volvió con un 409 (capacidad, términos,
   *  versión, reserva caducada…): otra sesión cambió la cara. La vuelve a leer
   *  en segundo plano —y la ocupación—, sin cerrar el formulario ni tocar lo
   *  dibujado. `true` si la puso al día; con cualquier otro rechazo, nada. */
  releerTrasConflicto: (e: unknown) => Promise<boolean>;
  elegirDia: (dia: string) => void;
  /** fase 2 · I1 · «Copiar como borrador»: pega lo que armó «Copiar zonas de
   *  otra cara» (`utils/copiaDeZonas.ts`) en UN paso de deshacer y lo guarda
   *  enseguida como la persona, con `origen`. `true` si quedó guardado; si el
   *  guardado falla, lo pegado sigue en el lienzo como cualquier cambio. */
  pegarCopia: (c: { quedan: readonly ZonaEnEdicion[]; nuevas: readonly ZonaPegada[] }, origen: OrigenDeCopiaIn, rotulo: string) => Promise<boolean>;
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

/** Los `spaceId` de las participaciones de la cara que ya no rigen (historia). */
function deHistoria(d: Pick<CaraOut, "participaciones"> | null): Set<number> {
  return new Set((d?.participaciones ?? []).filter((p) => !p.viva).map((p) => p.space_id));
}

/**
 * Lo que se EDITA (y se manda) de la capa: sus zonas menos las de las
 * participaciones que ya no rigen. El cliente sólo manda zonas de
 * participaciones vivas (§5.3-11): las de historia se dibujan aparte, en gris,
 * desde `datos`, y salen de la capa al confirmar (§3.8). Si se mandaran, el
 * servidor las marcaría `ZONA_DE_PARTICIPACION_TERMINADA` y la cara no se
 * podría confirmar sin borrarlas a mano. Una zona de una participación que la
 * cara no nombra se queda (que el servidor la marque, no se pierde callada).
 */
export function zonasEditables(d: Pick<CaraOut, "distribucion" | "participaciones"> | null): ZonaOut[] {
  const muertas = deHistoria(d);
  return capaQueSeMuestra(d).filter((z) => !muertas.has(z.participacion_space_id));
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
/**
 * La escritura en vuelo (borrador, confirmar o descartar: de a una). Cada una
 * empieza con `while (enCurso) await enCurso;`: con un solo `if … await`, dos
 * que esperaban a la misma salían juntas y la segunda iba con la versión que
 * la primera acababa de gastar —un 409 `version_vieja` de la propia sesión
 * («Otra sesión cambió…») que además frenaba el autoguardado—. Sin nada en
 * vuelo no se espera nada (ni un `await` de balde: dos llamadas seguidas,
 * en el mismo tic, se pisarían), y desde el bucle hasta anotar la escritura
 * nueva en `enCurso` no hay ningún `await`.
 */
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

  /** Deja la edición de la cara activa en memoria (no se pudo guardar), con
   *  la copia pegada que todavía no llegó al servidor (fase 2 · I1). */
  const guardarEnMemoria = () => {
    const { activa, edicion } = get();
    if (!activa || !edicion.sucio) return;
    const copia = copiaPorDeclarar(activa, edicion.zonas);
    set((s) => ({ sinGuardar: { ...s.sinGuardar, [claveDeCara(activa)]: { zonas: edicion.zonas, base: edicion.base, ...(copia ? { copia } : {}) } } }));
  };

  /** fase 2 · I1: la copia pegada en ESTA cara que todavía no se declaró y
   *  sigue en `zonas` (alguna de sus claves). null si no hay nada que declarar. */
  const copiaPorDeclarar = (a: DistribucionActiva, zonas: readonly ZonaEnEdicion[]): CopiaDeZonas | null => {
    const c = get().copia;
    return c && !c.declarada && c.cara === claveDeCara(a) && zonas.some((z) => c.claves.includes(z.clave)) ? c : null;
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

  /** «Descartarlos»: lo de la pantalla vuelve a lo último cargado o guardado,
   *  también en «Mirar» (`descartarEnCualquierModo`), y el autoguardado no
   *  salta después. Sin esto, salir o cambiar de cara veía `sucio` y guardaba
   *  como borrador justo lo que se pidió tirar. */
  const tirarLoDeLaPantalla = () => {
    cancelarAutoguardado();
    const ed = get().edicion;
    const limpia = descartarEnCualquierModo(ed);
    if (limpia !== ed) set({ edicion: limpia });
  };

  /** Sale de la cara activa sin mirar lo editado (eso ya se resolvió). */
  const soltar = () => {
    cancelarAutoguardado();
    generacion++;
    set((s) => ({
      activa: null, datos: null, cargando: false, error: null, edicion: edicionLimpia(s.edicion), guardado: QUIETO,
      formulario: null, fusion: null, pedidoDeCara: null, copia: null,
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
    copia: null,

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
        formulario: null, fusion: null, pedidoDeCara: null, copia: null,
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
          edicion: reducir(s.edicion, { tipo: "cargar", zonas: zonasEditables(datos), medidas: medidasDe(datos) }),
        }));
      } catch (e) {
        if (mismaCara(activa, gen)) set({ cargando: false, error: describeError(e, "No se pudo leer la cara.") });
      }
    },

    salir: async (o) => {
      const a = get().activa;
      if (!a) return true;
      if (o?.descartar) tirarLoDeLaPantalla();
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

    cambiarCara: async (c, o) => {
      const a = get().activa;
      if (!a) return false;
      if (a.cara === c) { set({ pedidoDeCara: null }); return true; }
      if (o?.descartar) tirarLoDeLaPantalla();
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
        const suyas = zonasEditables(datos);
        const muertas = deHistoria(datos);
        const ed = get().edicion;
        const f = fusionarZonas(ed.base, ed.zonas, suyas);
        const zonas = f.zonas.filter((z) => !muertas.has(z.participacionSpaceId));
        const edicion = { ...reducir(ed, { tipo: "fusionar", zonas, base: desdeElServidor(suyas) }), medidas: medidasDe(datos) };
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
      // En «Mirar» nada edita: el reductor no aplicaría lo mío y el conflicto
      // se iría de la lista sin resolverse (lo de acá, perdido en silencio).
      if (get().edicion.modo === "mirar") return;
      get().despachar({ tipo: "usarZonas", spaceId, zonas: f.mias.filter((z) => z.participacionSpaceId === spaceId) });
      const conflictos = f.conflictos.filter((s) => s !== spaceId);
      set({ fusion: conflictos.length > 0 ? { ...f, conflictos } : null });
    },

    recuperar: () => {
      const { activa, datos, sinGuardar, edicion } = get();
      if (!activa || !datos) return;
      const guardada = sinGuardar[claveDeCara(activa)];
      if (!guardada) return;
      const suyas = zonasEditables(datos);
      const muertas = deHistoria(datos);
      const f = fusionarZonas(guardada.base, guardada.zonas, suyas);
      const zonas = f.zonas.filter((z) => !muertas.has(z.participacionSpaceId));
      const ed = reducir(edicion, { tipo: "fusionar", zonas, base: desdeElServidor(suyas) });
      // fase 2 · I1: la copia que no llegó al servidor vuelve con lo suyo (la
      // regla de las claves decide si se declara después de la fusión).
      set({
        edicion: ed, fusion: f.conflictos.length > 0 ? { conflictos: f.conflictos, mias: guardada.zonas } : null,
        ...(guardada.copia ? { copia: guardada.copia } : {}),
      });
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
      while (enCurso) await enCurso;
      const a = get().activa, d = get().datos;
      if (!a || !d) return false;
      if (automatico && get().guardado.estado === "version_vieja") return false;   // hasta traer lo nuevo
      // Mientras esperaba su turno, otra escritura pudo dejarlo todo guardado (o
      // descartado): un autoguardado sin nada que guardar no escribe un borrador de balde.
      if (automatico && !get().edicion.sucio) return true;
      const gen = generacion;
      const foto = get().edicion.zonas;
      const version = d.distribucion?.version ?? 0;
      // fase 2 · I1: lo que se guarda lleva zonas pegadas que el servidor todavía
      // no sabe de dónde vinieron: va con su `origen` y como la persona (una
      // copia siempre queda en el historial), aunque sea el autoguardado.
      const copia = copiaPorDeclarar(a, foto);
      const auto = automatico && copia === null;
      cancelarAutoguardado();
      set((s) => ({ guardado: { ...s.guardado, estado: "guardando", mensaje: null } }));
      const pedido = (async () => {
        try {
          const r = await escribirBorrador({
            sede: a.sede, espacio: espacioDeLaCara(a.codigo, a.cara), version, automatico: auto, zonas: zonasParaEnviar(foto),
            ...(copia ? { origen: copia.origen } : {}),
          });
          if (!mismaCara(a, gen)) return false;
          set((s) => ({
            datos: s.datos ? conEscritura(s.datos, r) : s.datos,
            edicion: reducir(s.edicion, { tipo: "guardado", base: foto }),
            guardado: { estado: "quieto", mensaje: null, ultimoAuto: auto ? Date.now() : s.guardado.ultimoAuto },
            ...(copia && s.copia === copia ? { copia: { ...copia, declarada: true } } : {}),
          }));
          olvidarDeEstaCara(a);
          // El estado de la distribución (borrador) y su dibujado cambian en el resumen de Supervisar.
          useOcupacionStore.getState().invalidarResumen(a.sede);
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
      while (enCurso) await enCurso;
      // fase 2 · I1: una copia pegada que todavía no llegó al servidor se guarda
      // ANTES como borrador, con su `origen` (el historial dice «copiada» y
      // después «confirmada»). Si ese guardado no sale, no se confirma. El
      // cuerpo de confirmar y el candado del servidor no cambian.
      const a0 = get().activa;
      if (a0 && copiaPorDeclarar(a0, get().edicion.zonas)) {
        if (!(await get().guardarBorrador(false))) return;
        while (enCurso) await enCurso;
      }
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
            guardado: { ...s.guardado, estado: "quieto", mensaje: null }, fusion: null, copia: null,
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
      while (enCurso) await enCurso;
      const a = get().activa, d = get().datos;
      if (!a || !d?.distribucion) return;
      const gen = generacion;
      const version = d.distribucion.version;
      // Va en fila con los guardados (y sin autoguardado en el medio): si no,
      // uno de los dos salía con la versión que el otro acababa de gastar.
      cancelarAutoguardado();
      const pedido = (async () => {
        try {
          const r = await descartarBorrador({ sede: a.sede, espacio: espacioDeLaCara(a.codigo, a.cara), version });
          if (!mismaCara(a, gen)) return false;
          cancelarAutoguardado();
          set((s) => {
            const datos = s.datos ? conEscritura(s.datos, r) : s.datos;
            return {
              datos, guardado: QUIETO, fusion: null, copia: null,
              edicion: reducir(s.edicion, { tipo: "cargar", zonas: zonasEditables(datos), medidas: medidasDe(datos) }),
            };
          });
          olvidarDeEstaCara(a);
          useOcupacionStore.getState().invalidarResumen(a.sede);
          return true;
        } catch (e) {
          if (mismaCara(a, gen)) set((s) => ({ guardado: falla(e, s.guardado) }));
          return false;
        }
      })();
      enCurso = pedido;
      try { await pedido; } finally { if (enCurso === pedido) enCurso = null; }
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
      // Una participación que dejó de regir con esta escritura (se canceló
      // su reserva o su contrato) pasa a la historia: sus zonas salen de lo
      // que se edita —de lo dibujado y de la base por igual, así no queda
      // nada «sin guardar» de balde— y se dibujan en gris desde `datos`.
      const muertas = deHistoria(cara);
      set((s) => {
        const ed = s.edicion;
        const sigue = (z: ZonaEnEdicion) => !muertas.has(z.participacionSpaceId);
        const edicion = ed.zonas.every(sigue) && ed.base.every(sigue)
          ? ed : reducir(ed, { tipo: "fusionar", zonas: ed.zonas.filter(sigue), base: ed.base.filter(sigue) });
        return { datos: cara, edicion: { ...edicion, medidas: medidasDe(cara) } };
      });
      void useOcupacionStore.getState().recargarOcupacion(a.sede);
      useOcupacionStore.getState().invalidarResumen(a.sede);
    },

    releerTrasConflicto: async (e) => {
      // Recorrido final (caso H): dos sesiones piden 60 % de la misma cara; la
      // segunda frena con «queda 40 %», pero su vista previa seguía diciendo
      // «queda 100 %» y el panel «Comprometido 0 %» hasta volver a entrar.
      if ((e as { response?: { status?: unknown } } | null)?.response?.status !== 409) return false;
      const a = get().activa;
      if (!a) return false;
      const gen = generacion;
      let cara: CaraOut;
      try {
        cara = await leerCara(a.sede, espacioDeLaCara(a.codigo, a.cara));
      } catch { return false; }   // se queda con lo que tenía: el formulario ya muestra el rechazo
      if (!mismaCara(a, gen)) return false;
      // Lo de los términos se pone al día; la distribución, no, si otra sesión
      // la guardó en el medio: su versión es la que hace saltar el
      // `version_vieja` del próximo guardado («Traer lo nuevo» combina). Con
      // la versión nueva, ese guardado pisaría lo de la otra sesión en silencio.
      const antes = get().datos;
      const otraVersion = (antes?.distribucion?.version ?? 0) !== (cara.distribucion?.version ?? 0);
      get().aplicarCara(antes && otraVersion ? { ...cara, distribucion: antes.distribucion, revision: antes.revision } : cara);
      return true;
    },

    elegirDia: (dia) => set({ verAlDia: dia }),

    pegarCopia: async (c, origen, rotulo) => {
      const a = get().activa;
      if (!a || !get().datos) return false;
      const antes = get().edicion;
      // Las mismas claves que pone `pegarZonas`: `n<proxima>`, `n<proxima+1>`…
      const claves = c.nuevas.map((_, i) => `n${antes.proxima + i}`);
      get().despachar({ tipo: "pegarZonas", quedan: c.quedan, nuevas: c.nuevas });
      if (get().edicion === antes) return false;              // «Mirar», o nada que pegar
      set({ copia: { cara: claveDeCara(a), origen, rotulo, claves, declarada: false } });
      return get().guardarBorrador(false);
    },

    reiniciar: () => {
      cancelarAutoguardado();
      generacion++;
      enCurso = null;
      set({
        activa: null, datos: null, cargando: false, error: null, edicion: estadoInicial(), guardado: QUIETO,
        verAlDia: "", formulario: null, fusion: null, pedidoDeCara: null, sinGuardar: {}, copia: null,
      });
    },
  };
});

/** fase 2 · I1: la copia pegada en la cara activa que sigue a la vista (alguna
 *  de sus zonas está en lo que se edita): la franja del panel. Ctrl+Z la saca. */
export function copiaALaVista(s: Pick<DistribucionStore, "activa" | "copia" | "edicion">): CopiaDeZonas | null {
  const c = s.copia;
  if (!c || !s.activa || c.cara !== claveDeCara(s.activa)) return null;
  return s.edicion.zonas.some((z) => c.claves.includes(z.clave)) ? c : null;
}

/** ¿Hay algo sin guardar de esta cara, de una salida anterior? */
export function hayParaRecuperar(s: Pick<DistribucionStore, "activa" | "sinGuardar">): boolean {
  return s.activa !== null && claveDeCara(s.activa) in s.sinGuardar;
}

/**
 * Lo que no se guardó cuando se cerró la sesión, para el re-ingreso de LA
 * MISMA persona en EL MISMO cliente (revisión final, escena-uso: con el
 * autoguardado frenado por un 409 `version_vieja`, un 401 posterior —el token
 * de 12 h— borraba todo lo dibujado desde el 409, sin cota de tiempo). Vive en
 * una variable del módulo: en memoria de esta pestaña, nunca en el navegador
 * (ni `localStorage` ni nada: §9.8). El store se vacía igual al cerrar la
 * sesión; esto se devuelve a `sinGuardar` —y la pantalla ofrece «Recuperar lo
 * que no se guardó» al volver a esa cara, con la fusión de tres vías— sólo si
 * la sesión nueva es del mismo cliente, con el mismo correo y de
 * administrador. Cualquier otra sesión (otro cliente, otra persona, un
 * trabajador) la tira sin mirarla.
 */
let reservaDeLaSesion: { cliente: string; email: string | null; sinGuardar: Record<string, EdicionSinGuardar> } | null = null;

/** Lo no guardado de la sesión que se cierra: lo que ya estaba en
 *  `sinGuardar` y la edición en curso, si tiene cambios. */
function loNoGuardado(): Record<string, EdicionSinGuardar> {
  const { activa, edicion, sinGuardar, copia } = useDistribucionStore.getState();
  const fuera = { ...sinGuardar };
  if (activa && edicion.sucio) {
    // fase 2 · I1: con la copia pegada que todavía no llegó al servidor.
    const k = claveDeCara(activa);
    const pendiente = copia && !copia.declarada && copia.cara === k ? copia : null;
    fuera[k] = { zonas: edicion.zonas, base: edicion.base, ...(pendiente ? { copia: pendiente } : {}) };
  }
  return fuera;
}

// ANTES del reinicio (los suscriptores corren en el orden en que se anotan):
// al cerrarse la sesión se aparta lo no guardado; cualquier otro cambio de
// sesión o de cliente tira lo apartado.
useAuthStore.subscribe((s, antes) => {
  if (s.token === antes.token && s.cliente === antes.cliente) return;
  if (antes.token && !s.token) {
    const sinGuardar = antes.cliente ? loNoGuardado() : {};
    reservaDeLaSesion = antes.cliente && Object.keys(sinGuardar).length > 0
      ? { cliente: antes.cliente, email: antes.email, sinGuardar } : null;
  } else if (!(s.token && !antes.token)) {
    // Una sesión que cambia por otra (o de cliente) sin pasar por cerrarse:
    // nada que devolver. Un INGRESO lo resuelve el suscriptor de abajo.
    reservaDeLaSesion = null;
  }
});

// Al cambiar de sesión o de cliente se vacía, aunque no haya ninguna pantalla
// montada (un 401 cierra la sesión sin recargar la página).
useAuthStore.subscribe((s, antes) => {
  if (s.token !== antes.token || s.cliente !== antes.cliente) useDistribucionStore.getState().reiniciar();
});

// DESPUÉS del reinicio: el re-ingreso de la misma persona en el mismo cliente
// recupera lo apartado (como lo que no se pudo guardar al salir de una cara).
useAuthStore.subscribe((s, antes) => {
  if (!s.token || antes.token) return;   // sólo un ingreso: de sin sesión a con sesión
  const r = reservaDeLaSesion;
  reservaDeLaSesion = null;
  if (!r || s.cliente !== r.cliente || s.email !== r.email || s.role !== "admin") return;
  useDistribucionStore.setState({ sinGuardar: r.sinGuardar });
});
