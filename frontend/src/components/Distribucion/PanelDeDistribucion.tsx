import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Crosshair, Eye, LogOut, Pencil } from "lucide-react";
import { describeError } from "../../api/client";
import { espacioDeLaCara, historial, type HistorialOut, type ZonaOut } from "../../api/participaciones";
import { hayParaRecuperar, planoAlDia, useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import { carasDe } from "../../types/espacio";
import { accionDeTecla, type Accion } from "../../utils/edicionDeZonas";
import { cambioParaDividir, conPartes, revisarCambioDePartes, type CambioDePartes } from "../../utils/partesDelMueble";
import { pct, type EstadoDeDistribucion } from "../../utils/participaciones";
import type { Estampa } from "../../utils/coloresDeMarca";
import FormularioDeParticipacion from "./FormularioDeParticipacion";
import LeyendaDeParticipaciones, {
  BOTON, BOTON_PELIGRO, Dialogo, ESTILO_PELIGRO, capacidadDe, fechaLegible, fondoDeEstampa, irAlProblema, tonoCss,
  useRevisionEnVivo, useVistaDeDistribucion,
} from "./LeyendaDeParticipaciones";
import ResumenDeCambios, { ConflictosDeLaFusion } from "./ResumenDeCambios";

/**
 * El panel de Distribución (§9.3 del diseño de participaciones): reemplaza al
 * panel comercial del Editor 3D mientras el modo está visible. De arriba
 * abajo: el encabezado («Distribución · NAVE · GON-01 · cara A», Cara A |
 * Cara B, Mirar | Editar, el estado y «Salir»), cómo se vende la cara, la capacidad del día y
 * del período, «Ver al día», la leyenda, los botones (UN principal:
 * «Confirmar distribución…», que abre el resumen de diferencias), los errores
 * y avisos de la revisión y el historial.
 *
 * Todo lo lee de los stores (`distribucionStore`, `fixtureStore`): de afuera
 * recibe sólo qué mueble y cómo encuadrar una cara en el 3D. Nada se pierde
 * en silencio (§9.8): salir o cambiar de cara con cambios pregunta
 * «¿Guardarlos como borrador, descartarlos o seguir editando?», una falla de
 * red deja el trabajo acá con «Reintentar», otra sesión que guardó en el
 * medio ofrece «Traer lo nuevo» (fusión de tres vías) y lo que no se pudo
 * guardar al salir se ofrece al volver («Recuperar lo que no se guardó»).
 *
 * El teclado (§9.5): mientras el panel está montado, un oyente en CAPTURA de
 * `window` (`atajoDeDistribucion`) se queda con las teclas que el atajo global
 * del editor usaría para borrar, girar, cambiar o deshacer el MUEBLE (Supr,
 * Retroceso, R, F, Esc, Ctrl+Z/Y): Supr borra la zona elegida, nunca el
 * mueble; Ctrl+Z deshace la zona, nunca el plano; Esc nunca saca del modo.
 */

/** Las teclas que el atajo global del editor usaría (`StoreEditor3D`). */
const DEL_EDITOR = new Set(["Delete", "Backspace", "r", "R", "f", "F", "Escape"]);

/**
 * Lo que también se despacha con el foco en el PANEL: elegir herramienta
 * (V, R, P), el imán (G), deshacer, rehacer y lo de Esc (cancelar el trazo,
 * soltar la zona). Nada de eso borra ni mueve una zona. Es el camino que la
 * pantalla misma sugiere —«Elegí una participación en la lista para dibujar su
 * zona»: clic en la fila y R—, y sin esto la R se cortaba sin hacer nada (el
 * foco quedaba en la fila). Supr, Retroceso, las flechas y Enter siguen
 * siendo sólo del lienzo: en el panel son de sus botones y listas.
 */
const DESDE_EL_PANEL: ReadonlySet<Accion["tipo"]> = new Set<Accion["tipo"]>([
  "elegirHerramienta", "alternarIman", "deshacer", "rehacer", "cancelarTrazo", "seleccionar",
]);

/** Lo que el oyente necesita del evento (un `KeyboardEvent` lo cumple). */
export interface TeclaDeDistribucion {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  stopPropagation: () => void;
  preventDefault: () => void;
}

type Destino = { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;

/**
 * El oyente en captura del modo Distribución. Las acciones del editor
 * (`accionDeTecla`) se despachan con el foco en el lienzo —o en ninguna
 * parte (`body`), que es donde queda después de tocar el 3D—; desde el panel,
 * sólo las que no borran ni mueven nada (`DESDE_EL_PANEL`: herramienta, imán,
 * deshacer, rehacer y Esc). Las teclas que el atajo global
 * usaría NO le llegan nunca mientras dura el modo, tenga el foco quien lo
 * tenga: se cortan acá. Lo que se escribe (campos) y los diálogos mandan: un
 * diálogo se queda con su Esc y su Enter, aunque Supr, R, F y Ctrl+Z igual se
 * cortan (con el foco en un botón del diálogo, Supr borraba el mueble).
 * Nunca saca del modo: se sale con «Salir».
 */
export function atajoDeDistribucion(
  e: TeclaDeDistribucion,
  hayModalAbierto: () => boolean = () => typeof document !== "undefined" && !!document.querySelector('[role="dialog"][aria-modal="true"]'),
): void {
  const st = useDistribucionStore.getState();
  if (!st.activa) return;
  const t = e.target as Destino;
  const tag = (t?.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;   // se escribe
  const ctrl = e.ctrlKey || e.metaKey;
  const deshacer = ctrl && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y");
  const delEditor = deshacer || DEL_EDITOR.has(e.key);
  // Los diálogos mandan: su Esc y su Enter siguen. Lo que borraría, giraría
  // o deshaceria el mueble, no.
  if (t?.closest?.('[role="dialog"]') || hayModalAbierto()) {
    if (delEditor && e.key !== "Escape") e.stopPropagation();
    return;
  }
  const enLienzo = tag === "body" || !!t?.closest?.("[data-lienzo-de-zonas]");
  const enElModo = enLienzo || !!t?.closest?.("[data-distribucion]");
  const posible = enElModo ? accionDeTecla(st.edicion, { key: e.key, ctrl, shift: e.shiftKey }) : null;
  const a = posible && (enLienzo || DESDE_EL_PANEL.has(posible.tipo)) ? posible : null;
  if (a || delEditor) {
    e.stopPropagation();                          // el atajo global no ve la tecla
    if (a) { e.preventDefault(); st.despachar(a); }
    else if (delEditor && enLienzo) e.preventDefault();
  }
}

const ESTADOS: Record<EstadoDeDistribucion, string> = {
  confirmada: "Confirmada",
  borrador: "Borrador",
  para_revisar: "Para revisar",
  sin_distribuir: "Sin distribuir",
  sin_mueble: "Sin mueble",
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
/** Cuándo pasó una entrada REAL del historial: un instante con su zona, con
 *  día y hora. Una derivada con su día no pasa por acá (`lineasDelHistorial`). */
const cuandoFue = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** El título del encabezado: qué SEDE, qué mueble y qué cara se distribuyen
 *  (pedido §12: «qué sede tiene seleccionada el usuario»; con el modo
 *  encendido la paleta de la sede se oculta y con dos sedes de la misma
 *  nomenclatura nada en pantalla decía cuál era). */
export function tituloDelPanel(a: { sede: string; codigo: string; cara: "A" | "B" }): string {
  return `Distribución · ${a.sede} · ${a.codigo} · cara ${a.cara}`;
}

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
/** La medianoche de un día de Colombia (UTC−5, sin horario de verano), en ms. */
const medianocheDeColombia = (dia: string) =>
  Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), 5, 0, 0);

/** Una línea del historial, lista para mostrar. */
export interface LineaDelHistorial {
  clave: string;
  /** El instante, en ms desde 1970: con él se ordena (nunca con el texto). */
  instante: number;
  /** «18 oct 2026» en una derivada (sólo el día); día y hora en una real. */
  cuando: string;
  derivada: boolean;
  actor: string | null;
  detalle: string;
  en: string;
  /** Lo que «Ver cómo estaba» dibuja (sólo las confirmaciones). */
  zonas: ZonaOut[] | null;
}

/**
 * El historial de la cara, del más nuevo al más viejo (contrato del historial
 * con el servidor, revisión final). Las entradas DERIVADAS —el vencimiento de
 * un contrato, la caducidad de una reserva: no tienen fila, salen de las
 * fechas— traen `derivado: true`, `dia` (el día de Colombia en que pasó: el
 * siguiente al último día de vigencia) y `en`, la medianoche de ese día en
 * Colombia con su zona. Se muestran con el DÍA solo, leído como texto
 * (`fechaLegible`): con `new Date("2026-10-18")` el navegador en Colombia decía
 * «17 oct, 7:00 p. m.», un día antes de cuando dejó de valer. Se ordenan por el
 * instante (`Date.parse` del ISO con zona), no comparando textos: un
 * «…T00:00:00-05:00» contra un «…T03:00:00+00:00» se ordenaba al revés. Un
 * servidor viejo manda `en` como día solo: se lee igual, como día de Colombia.
 */
export function lineasDelHistorial(h: HistorialOut): LineaDelHistorial[] {
  const lineas: LineaDelHistorial[] = [];
  for (const e of h.entradas) {
    const zonas = e.accion === "distribucion.confirmada" && e.despues && Array.isArray((e.despues as { zonas?: unknown }).zonas)
      ? (e.despues as { zonas: ZonaOut[] }).zonas : null;
    const instante = SOLO_DIA.test(e.en) ? medianocheDeColombia(e.en) : Date.parse(e.en);
    lineas.push({ clave: `e${e.id}`, instante, cuando: cuandoFue(e.en), derivada: false, actor: e.actor, detalle: e.detalle, en: e.en, zonas });
  }
  h.derivados.forEach((d: HistorialOut["derivados"][number] & { dia?: unknown; derivado?: unknown }, i) => {
    const dia = typeof d.dia === "string" && SOLO_DIA.test(d.dia) ? d.dia : SOLO_DIA.test(d.en) ? d.en : null;
    const conZona = SOLO_DIA.test(d.en) ? NaN : Date.parse(d.en);
    const instante = Number.isNaN(conZona) ? (dia ? medianocheDeColombia(dia) : NaN) : conZona;
    lineas.push({
      clave: `d${i}`, instante, cuando: dia ? fechaLegible(dia) : cuandoFue(d.en), derivada: true,
      actor: null, detalle: d.detalle, en: d.en, zonas: null,
    });
  });
  // Del más nuevo al más viejo; lo que no se pudo leer, al final. Estable.
  const valor = (x: LineaDelHistorial) => (Number.isNaN(x.instante) ? -Infinity : x.instante);
  return lineas.map((l, i) => ({ l, i })).sort((a, b) => valor(b.l) - valor(a.l) || a.i - b.i).map((x) => x.l);
}

type Pregunta = { tipo: "cara"; cara: "A" | "B" } | { tipo: "salir" } | { tipo: "descartarBorrador" } | null;

/** Lo que dice «Descartar el borrador» antes de hacerlo. Descartar vuelve a
 *  leer la cara del servidor: lo que se cambió en pantalla y todavía no se
 *  guardó también se pierde, y hay que decirlo (verificación del paso 6b). */
export function textoDeDescartarBorrador(c: { cara: "A" | "B"; hayConfirmada: boolean; sucio: boolean }): string[] {
  const fuera = [
    `Se borra el borrador guardado de la cara ${c.cara}${c.hayConfirmada ? " y vuelve a verse la distribución confirmada" : ""}. Queda anotado en el historial.`,
  ];
  if (c.sucio) fuera.push("También se pierden los cambios que hiciste en pantalla y todavía no guardaste.");
  return fuera;
}

export default function PanelDeDistribucion({ fixtureId, sede, onEncuadrarCara }: { fixtureId: string; sede: string; onEncuadrarCara: (cara: "A" | "B") => void }) {
  const activa = useDistribucionStore((s) => s.activa);
  const datos = useDistribucionStore((s) => s.datos);
  const cargando = useDistribucionStore((s) => s.cargando);
  const error = useDistribucionStore((s) => s.error);
  const sucio = useDistribucionStore((s) => s.edicion.sucio);
  const modo = useDistribucionStore((s) => s.edicion.modo);
  const guardado = useDistribucionStore((s) => s.guardado);
  const verAlDia = useDistribucionStore((s) => s.verAlDia);
  const formulario = useDistribucionStore((s) => s.formulario);
  const pedidoDeCara = useDistribucionStore((s) => s.pedidoDeCara);
  const recuperable = useDistribucionStore(hayParaRecuperar);
  const mueble = useFixtureStore((s) => (s.fixturesBySede[sede] ?? selectFixtures(s)).find((f) => f.id === fixtureId) ?? null);
  const estadoComercial = useFixtureStore((s) => s.estadoComercial);
  const planoSinGuardar = useFixtureStore((s) => !!s.dirty[sede]);
  const ultimoGuardadoDelPlano = useFixtureStore((s) => s.lastSyncedAt);
  const periodo = useVistaDeDistribucion((s) => s.periodo);
  const rev = useRevisionEnVivo();

  const [pregunta, setPregunta] = useState<Pregunta>(null);
  const [mensajeDePregunta, setMensajeDePregunta] = useState<string | null>(null);
  const [resumen, setResumen] = useState(false);
  const [division, setDivision] = useState<{ problema?: string; aviso?: string; cambio?: CambioDePartes } | null>(null);
  const [dividiendo, setDividiendo] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [lineas, setLineas] = useState<HistorialOut | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  const st = useDistribucionStore.getState;

  /* ── El teclado: en captura, mientras el panel está montado ─────────────── */
  useEffect(() => {
    const enCaptura = (e: KeyboardEvent) => atajoDeDistribucion(e);
    window.addEventListener("keydown", enCaptura, { capture: true });
    return () => window.removeEventListener("keydown", enCaptura, { capture: true });
  }, []);

  /* ── Cerrar la pestaña con cambios sin guardar ───────────────────────────── */
  useEffect(() => {
    if (!sucio) return;
    const antesDeIrse = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", antesDeIrse);
    return () => window.removeEventListener("beforeunload", antesDeIrse);
  }, [sucio]);

  /* ── Encuadrar la cara en el 3D al entrar o cambiar de cara ──────────────── */
  // Después del redimensionado del lienzo partido: la toma depende del aspecto
  // (dos cuadros: el ResizeObserver del 3D corre antes de pintar).
  const encuadrar = useRef(onEncuadrarCara);
  encuadrar.current = onEncuadrarCara;
  useEffect(() => {
    if (!activa) return;
    const cara = activa.cara;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => encuadrar.current(cara)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [activa?.fixtureId, activa?.cara]);

  /* ── El plano tiene cambios sin guardar: la edición espera ───────────────── */
  const alDia = planoAlDia(datos, mueble);
  useEffect(() => {
    // Cuando el plano termina de guardarse (o ya no tiene nada pendiente), se
    // vuelve a leer la cara una vez: si las firmas coinciden, sigue la edición.
    if (!datos || alDia || planoSinGuardar || cargando) return;
    void st().traerLoNuevo();
  }, [alDia, planoSinGuardar, ultimoGuardadoDelPlano, datos?.firma]);
  const volverAEditar = useRef(false);
  useEffect(() => {
    if (!datos) return;
    const ed = st().edicion;
    if (!alDia && ed.modo === "editar") { volverAEditar.current = true; st().despachar({ tipo: "elegirModo", modo: "mirar" }); }
    else if (alDia && volverAEditar.current) {
      volverAEditar.current = false;
      if (ed.modo === "mirar") st().despachar({ tipo: "elegirModo", modo: "editar" });
    }
  }, [alDia, !!datos]);

  /* ── El historial (plegado: se pide al abrirlo) ──────────────────────────── */
  useEffect(() => {
    setLineas(null);
    setErrorHistorial(null);
    if (!verHistorial || !activa) return;
    let vale = true;
    historial({ sede: activa.sede, espacio: espacioDeLaCara(activa.codigo, activa.cara), limite: 50 })
      .then((h) => { if (vale) setLineas(h); })
      .catch((e) => { if (vale) setErrorHistorial(describeError(e, "No se pudo leer el historial.")); });
    return () => { vale = false; };
  }, [verHistorial, activa?.fixtureId, activa?.cara, datos?.distribucion?.version]);

  if (!activa) {
    return (
      <aside data-distribucion className="flex w-80 flex-shrink-0 items-center justify-center border-l border-dark-line bg-dark-surface p-4 text-xs text-dark-ink-2">
        Elegí una cara para distribuir.
      </aside>
    );
  }

  const caras = datos ? datos.fixture.caras : mueble ? carasDe(mueble) : 1;
  const estado: EstadoDeDistribucion = datos?.distribucion?.estado ?? "sin_distribuir";
  const editable = !!datos?.por_participacion && !!datos.superficie && alDia;
  const enMirar = modo === "mirar";
  const hoy = datos?.hoy ?? "";
  const dia = verAlDia || hoy;
  const cap = datos?.superficie && datos.por_participacion ? capacidadDe(datos, dia, periodo) : null;
  const errores = rev?.juicio.errores ?? [];
  const avisos = rev?.juicio.avisos ?? [];
  const hayBorrador = !!datos?.distribucion?.borrador;

  /* ── Acciones ─────────────────────────────────────────────────────────────── */

  const pedirCara = (c: "A" | "B") => {
    if (c === activa.cara) return;
    if (sucio) { setMensajeDePregunta(null); setPregunta({ tipo: "cara", cara: c }); return; }
    void st().cambiarCara(c);
  };
  const pedirSalir = () => {
    if (sucio) { setMensajeDePregunta(null); setPregunta({ tipo: "salir" }); return; }
    void st().salir();
  };
  // El 3D tocó la otra cara con cambios sin guardar: la misma pregunta.
  const preguntaVisible: Pregunta = pregunta ?? (pedidoDeCara ? { tipo: "cara", cara: pedidoDeCara } : null);
  const cerrarPregunta = () => { setPregunta(null); setMensajeDePregunta(null); if (pedidoDeCara) st().cancelarPedidoDeCara(); };

  async function guardarYSeguir() {
    const p = preguntaVisible;
    if (!p) return;
    // «Guardarlos como borrador» es una decisión de la persona, como el botón
    // «Guardar borrador»: va al historial y a la bitácora (`automatico: false`).
    // Si se dejaba a `cambiarCara`/`salir`, guardaban como AUTOGUARDADO (la red
    // de seguridad, §9.8) y el borrador quedaba sin rastro de quién ni cuándo.
    if (st().edicion.sucio && !(await st().guardarBorrador(false))) {
      setMensajeDePregunta(st().guardado.mensaje
        ?? "No se pudo guardar el borrador: tu trabajo sigue acá. Probá de nuevo o descartá los cambios.");
      return;
    }
    const ok = p.tipo === "cara" ? await st().cambiarCara(p.cara) : p.tipo === "salir" ? await st().salir() : false;
    if (ok) { setPregunta(null); setMensajeDePregunta(null); return; }
    setMensajeDePregunta(st().guardado.mensaje
      ?? "No se pudo guardar el borrador: tu trabajo sigue acá. Probá de nuevo o descartá los cambios.");
  }
  // «Descartarlos» descarta en el STORE, en cualquier modo: un
  // `despachar({ tipo: "descartarCambios" })` no hace nada en «Mirar» (el
  // reductor no edita ahí) y después salir o cambiar de cara guardaba como
  // borrador lo que se pidió tirar.
  async function descartarYSeguir() {
    const p = preguntaVisible;
    if (!p) return;
    setPregunta(null);
    setMensajeDePregunta(null);
    if (p.tipo === "cara") await st().cambiarCara(p.cara, { descartar: true });
    else if (p.tipo === "salir") await st().salir({ descartar: true });
  }

  /** «Vender esta cara por participación»: escribe la división en el plano,
   *  lo guarda ya (si no, el servidor todavía ve la cara entera) y vuelve a
   *  leer la cara. */
  async function venderPorParticipacion(confirmado = false) {
    if (!mueble || dividiendo) return;
    const r = cambioParaDividir(mueble, "participacion");
    if ("problema" in r) { setDivision({ problema: r.problema }); return; }
    const revision = revisarCambioDePartes(mueble, r.cambio, estadoComercial, sede);
    if (revision.bloqueo) { setDivision({ problema: revision.bloqueo }); return; }
    if (revision.aviso && !confirmado) { setDivision({ aviso: revision.aviso, cambio: r.cambio }); return; }
    setDividiendo(true);
    setDivision(null);
    try {
      const fs = useFixtureStore.getState();
      fs.commit(conPartes(selectFixtures(fs), fixtureId, r.cambio));
      await fs.flushPending();
      const rechazo = useFixtureStore.getState().rechazos[sede];
      if (rechazo) {
        setDivision({ problema: `El servidor no guardó el plano: ${rechazo.message}${rechazo.choques.length ? ` ${rechazo.choques.join(" ")}` : ""}` });
      }
      await st().traerLoNuevo();
    } catch (e) {
      setDivision({ problema: describeError(e, "No se pudo guardar el plano: probá de nuevo en un momento.") });
    } finally {
      setDividiendo(false);
    }
  }

  const verComoEstaba = (en: string, zonas: ZonaOut[]) =>
    useVistaDeDistribucion.getState().verComoEstaba({ titulo: `cómo quedó el ${cuandoFue(en)}`, zonas });

  /* ── Lo que se ve ─────────────────────────────────────────────────────────── */

  const segmentado = (opciones: { valor: string; texto: string; icono?: JSX.Element; deshabilitada?: boolean; titulo?: string }[], valor: string, alElegir: (v: string) => void, etiqueta: string) => (
    <div role="radiogroup" aria-label={etiqueta} className="flex rounded-md border border-dark-line-2 p-0.5">
      {opciones.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} disabled={o.deshabilitada} title={o.titulo}
          onClick={() => alElegir(o.valor)}
          className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${valor === o.valor ? "bg-dark-surface-2 text-dark-ink-1" : "text-dark-ink-3 hover:text-dark-ink-1"}`}>
          {o.icono}{o.texto}
        </button>
      ))}
    </div>
  );

  return (
    <aside data-distribucion aria-label="Distribución de la cara"
      className="flex w-80 flex-shrink-0 flex-col overflow-y-auto border-l border-dark-line bg-dark-surface text-dark-ink-1">

      {/* 1 · Encabezado */}
      <div className="flex flex-col gap-2 border-b border-dark-line p-3">
        {/* El título se PARTE en dos renglones, nunca se corta: con la sede
            adelante, en el panel de 320 px cortado decía «Distribución · NAVE
            · GON-…» y con una sede larga se comía la sede misma. Parejos
            (`text-balance`): sin eso el corte caía en el guion del código
            («GON-» / «01 · cara B»). */}
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-balance break-words text-sm font-bold leading-snug" title={tituloDelPanel(activa)} data-titulo-de-distribucion>{tituloDelPanel(activa)}</p>
          <button type="button" title="Encuadrar esta cara en el 3D" aria-label="Encuadrar en el 3D"
            onClick={() => onEncuadrarCara(activa.cara)}
            className="rounded border border-dark-line-2 p-1 text-dark-ink-2 hover:text-dark-ink-1"><Crosshair size={12} /></button>
          <button type="button" onClick={pedirSalir} className={`${BOTON} flex items-center gap-1`}>
            <LogOut size={11} />Salir
          </button>
        </div>
        {caras === 2 && segmentado(
          [{ valor: "A", texto: "Cara A" }, { valor: "B", texto: "Cara B" }],
          activa.cara, (v) => pedirCara(v as "A" | "B"), "Cara",
        )}
        {segmentado(
          [
            { valor: "mirar", texto: "Mirar", icono: <Eye size={11} /> },
            { valor: "editar", texto: "Editar", icono: <Pencil size={11} />, deshabilitada: !editable,
              titulo: !editable && datos?.por_participacion && !alDia ? "El plano tiene cambios sin guardar: esperá un momento." : undefined },
          ],
          modo, (v) => st().despachar({ tipo: "elegirModo", modo: v as "mirar" | "editar" }), "Modo",
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" data-estado-distribucion={estado}>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${estado === "confirmada" ? "border border-dark-line-2 bg-dark-surface-2" : "border border-dashed border-dark-ink-3"}`}>
            {estado === "confirmada" ? "✓ " : estado === "para_revisar" ? "⚠ " : ""}{ESTADOS[estado]}
          </span>
          {hayBorrador && estado !== "borrador" && <span className="text-dark-ink-2">· hay un borrador sin confirmar</span>}
          {sucio && <span className="text-dark-ink-1">· cambios sin guardar</span>}
          {guardado.estado === "guardando" && <span className="text-dark-ink-2">· guardando…</span>}
          {guardado.estado === "quieto" && !sucio && guardado.ultimoAuto && (
            <span className="text-dark-ink-3">· borrador guardado solo a las {hora(guardado.ultimoAuto)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Franjas: lo que pasa con lo guardado */}
        {cargando && !datos && <p className="text-xs text-dark-ink-2">Leyendo la cara…</p>}
        {error && (
          <div role="alert" className="rounded-md border px-2.5 py-2 text-xs" style={ESTILO_PELIGRO}>
            <p>No se pudo leer la cara: {error}</p>
            <button type="button" className={`${BOTON} mt-1.5`}
              onClick={() => void st().entrar({ sede: activa.sede, fixtureId: activa.fixtureId, codigo: activa.codigo, cara: activa.cara })}>
              Reintentar
            </button>
          </div>
        )}
        {recuperable && (
          <div role="status" className="rounded-md border border-dark-line-2 px-2.5 py-2 text-xs text-dark-ink-2">
            <p>La última vez quedaron cambios de esta cara sin guardar (el guardado falló al salir).</p>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" className={BOTON} onClick={() => st().recuperar()} disabled={!datos}>Recuperar lo que no se guardó</button>
              <button type="button" className={BOTON} onClick={() => st().olvidarSinGuardar()}>Olvidarlo</button>
            </div>
          </div>
        )}
        {datos && datos.por_participacion && !alDia && (
          <p role="status" className="rounded-md border px-2.5 py-2 text-xs"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
            El plano tiene cambios sin guardar: esperá un momento. La edición sigue sola cuando se guarde.
          </p>
        )}

        {/* 2 · Cómo se vende la cara */}
        {datos && !datos.comercializable && (
          <p className="rounded-md border border-dashed border-dark-line-2 px-2.5 py-2 text-xs text-dark-ink-2">
            Este mueble no se alquila: marcalo como alquilable en el panel para distribuirlo.
          </p>
        )}
        {datos && datos.comercializable && !datos.por_participacion && (
          <div className="flex flex-col gap-2 rounded-md border border-dark-line-2 px-2.5 py-2 text-xs text-dark-ink-2">
            <p><b className="text-dark-ink-1">Esta cara se vende entera.</b>{caras === 2 ? " Venderla por participación vale para las dos caras del mueble." : ""}</p>
            {datos.superficie ? (
              <button type="button" className={BOTON} disabled={dividiendo} onClick={() => void venderPorParticipacion()}>
                {dividiendo ? "Guardando el plano…" : "Vender esta cara por participación"}
              </button>
            ) : (
              <p>Este tipo de mueble no tiene una cara para dibujar zonas: no se vende por participación.</p>
            )}
            {division?.problema && <p role="alert" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{division.problema}</p>}
            {division?.aviso && (
              <div role="alert" style={{ color: "rgb(var(--entra-txt-rgb))" }}>
                <p>{division.aviso}</p>
                <div className="mt-1 flex gap-1.5">
                  <button type="button" className={BOTON} onClick={() => void venderPorParticipacion(true)}>Sí, venderla por participación</button>
                  <button type="button" className={BOTON} onClick={() => setDivision(null)}>Dejarla así</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3 · Capacidad */}
        {cap && (
          <section aria-label="Capacidad de la cara" className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-dark-ink-3">Capacidad · {fechaLegible(dia, hoy)}</p>
            <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded border border-dark-line-2 p-[2px]" role="img"
              aria-label={`Comprometido ${pct(Math.min(10000, cap.comprometido))}, queda ${pct(cap.queda)}`}>
              {cap.enteraElDia && (
                <div className="flex flex-1 items-center justify-center bg-dark-line text-[10px] font-semibold text-dark-ink-1">vendida entera</div>
              )}
              {!cap.enteraElDia && cap.segmentos.map((s) => (
                <div key={s.spaceId} className="relative h-full overflow-hidden rounded-sm" style={{ width: `${s.pb / 100}%` }}
                  title={`Participación ${s.numero} · ${pct(s.pb)}`}>
                  {s.estampa ? <FondoDeEstampa estampa={s.estampa} /> : <div className="absolute inset-0 bg-dark-line" />}
                  {s.pb >= 600 && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded bg-dark-surface px-1 text-[9px] font-bold leading-tight text-dark-ink-1">{s.numero}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs">
              Comprometido <b>{pct(Math.min(10000, cap.comprometido))}</b> · queda <b>{pct(cap.queda)}</b>
              {cap.comprometido > 10000 && <span style={{ color: "rgb(var(--ocupado-txt-rgb))" }}> · ⚠ pasa la cara entera</span>}
            </p>
            <p className="text-[11px] text-dark-ink-2">
              Del {fechaLegible(cap.periodo.desde)} al {fechaLegible(cap.periodo.hasta)}: pico {pct(cap.periodo.pico)}
              {cap.periodo.pico > 0 && <> el {fechaLegible(cap.periodo.diaPico, hoy)}</>} · queda <b className="text-dark-ink-1">{pct(cap.periodo.queda)}</b> para vender en todo el período.
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
              <label className="text-[10px] text-dark-ink-3">Período desde
                <input type="date" value={cap.periodo.desde}
                  onChange={(e) => e.target.value && useVistaDeDistribucion.getState().elegirPeriodo({ desde: e.target.value, hasta: cap.periodo.hasta })}
                  className="w-full border-0 border-b border-dark-line-2 bg-transparent py-0.5 text-[11px] text-dark-ink-1 focus:outline-none" />
              </label>
              <label className="text-[10px] text-dark-ink-3">hasta
                <input type="date" value={cap.periodo.hasta}
                  onChange={(e) => e.target.value && useVistaDeDistribucion.getState().elegirPeriodo({ desde: cap.periodo.desde, hasta: e.target.value })}
                  className="w-full border-0 border-b border-dark-line-2 bg-transparent py-0.5 text-[11px] text-dark-ink-1 focus:outline-none" />
              </label>
              <button type="button" className="text-[10px] text-dark-ink-3 underline underline-offset-2 hover:text-dark-ink-1"
                onClick={() => useVistaDeDistribucion.getState().elegirPeriodo(null)}>un año</button>
            </div>
          </section>
        )}

        {/* 4 · Ver al día */}
        {datos && datos.por_participacion && (
          <label className="flex items-center gap-2 text-[11px] text-dark-ink-2">
            Ver al día
            <input type="date" value={dia} onChange={(e) => e.target.value && st().elegirDia(e.target.value)}
              className="flex-1 border-0 border-b border-dark-line-2 bg-transparent py-0.5 text-[11px] text-dark-ink-1 focus:outline-none" />
            {dia !== hoy && (
              <button type="button" className="text-[10px] underline underline-offset-2 hover:text-dark-ink-1" onClick={() => st().elegirDia(hoy)}>hoy</button>
            )}
          </label>
        )}

        {/* 5 · Leyenda */}
        {datos && datos.por_participacion && <LeyendaDeParticipaciones />}

        {/* Lo que pasó con lo guardado: al lado de los botones que lo dispararon */}
        {guardado.estado === "error" && (
          <div role="alert" className="rounded-md border px-2.5 py-2 text-xs" style={ESTILO_PELIGRO}>
            <p>{guardado.mensaje ?? "No se pudo guardar. Tu trabajo sigue acá."}</p>
            <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().guardarBorrador(false)}>Reintentar</button>
          </div>
        )}
        {guardado.estado === "version_vieja" && (
          <div role="alert" className="rounded-md border px-2.5 py-2 text-xs"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
            <p>{guardado.mensaje ?? "Otra sesión cambió esta distribución mientras la editabas."}</p>
            <p className="mt-0.5 text-dark-ink-2">El autoguardado se frenó. «Traer lo nuevo» combina lo de la otra sesión con lo tuyo, participación por participación.</p>
            <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().traerLoNuevo()}>Traer lo nuevo</button>
          </div>
        )}
        {guardado.estado === "quieto" && guardado.mensaje && (
          <div role="status" className="rounded-md border px-2.5 py-2 text-xs"
            style={{ borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" }}>
            {guardado.mensaje} Corregí los errores de abajo y volvé a confirmar.
          </div>
        )}
        <ConflictosDeLaFusion />
        {/* 6 · Botones */}
        {datos && datos.por_participacion && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={BOTON} onClick={() => st().abrirFormulario({ modo: "alta" })}>Nueva participación</button>
              <button type="button" className={BOTON} disabled={enMirar || !editable || !sucio || guardado.estado === "guardando" || rev?.enLosTopes === false}
                onClick={() => void st().guardarBorrador(false)}>
                Guardar borrador
              </button>
            </div>
            <button type="button" className="btn-principal w-full rounded-md px-3 py-2 text-xs"
              disabled={enMirar || !editable || guardado.estado === "guardando" || guardado.estado === "version_vieja"}
              onClick={() => setResumen(true)}>
              Confirmar distribución…
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={BOTON} disabled={enMirar || !sucio} title="Volver a lo último que se cargó o se guardó (sólo en esta pantalla)"
                onClick={() => st().despachar({ tipo: "descartarCambios" })}>
                Descartar mis cambios
              </button>
              <button type="button" className={BOTON_PELIGRO} style={hayBorrador ? ESTILO_PELIGRO : undefined}
                disabled={enMirar || !hayBorrador || guardado.estado === "guardando"} title="Borrar el borrador guardado (la confirmada queda)"
                onClick={() => setPregunta({ tipo: "descartarBorrador" })}>
                Descartar borrador
              </button>
            </div>
            {enMirar && editable && <p className="text-[10px] text-dark-ink-3">En «Mirar» no se cambia nada: pasá a «Editar» para dibujar y guardar.</p>}
          </div>
        )}

        {/* 7 · Errores y avisos de la revisión */}
        {datos && datos.por_participacion && (errores.length > 0 || avisos.length > 0 || rev?.enLosTopes === false) && (
          <section aria-label="Revisión de la distribución" className="flex flex-col gap-1 text-[11px] leading-snug">
            {rev?.enLosTopes === false && (
              <p role="alert" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>
                ⚠ Hay demasiadas zonas o puntos: hasta 60 zonas y 240 puntos por cara. Uní o simplificá algunas para poder guardar.
              </p>
            )}
            {errores.map((p, i) => (
              <button key={`e${i}`} type="button" onClick={() => irAlProblema(p)} className="text-left hover:underline"
                style={{ color: "rgb(var(--ocupado-txt-rgb))" }} data-problema={p.codigo}>
                ⚠ {p.frase}
              </button>
            ))}
            {avisos.map((p, i) => (
              <button key={`a${i}`} type="button" onClick={() => irAlProblema(p)} className="text-left text-dark-ink-2 hover:underline" data-aviso={p.codigo}>
                · {p.frase}
              </button>
            ))}
          </section>
        )}

        {/* 8 · Historial */}
        {datos && (
          <section aria-label="Historial de la cara">
            <button type="button" onClick={() => setVerHistorial(!verHistorial)} aria-expanded={verHistorial}
              className="flex items-center gap-1 text-[11px] font-semibold text-dark-ink-3 hover:text-dark-ink-1">
              {verHistorial ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Historial
            </button>
            {verHistorial && (
              <div className="mt-1 flex flex-col gap-1 text-[11px] text-dark-ink-2">
                {errorHistorial && <p style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{errorHistorial}</p>}
                {!lineas && !errorHistorial && <p>Leyendo…</p>}
                {lineas && lineas.entradas.length === 0 && lineas.derivados.length === 0 && <p>Todavía no pasó nada en esta cara.</p>}
                {lineas && lineasDelHistorial(lineas).map((e) => (
                  <div key={e.clave} className="rounded border border-dark-line px-2 py-1" data-derivada={e.derivada || undefined}>
                    <p className="text-dark-ink-3">{e.cuando}{e.actor ? ` · ${e.actor}` : ""}</p>
                    <p className="text-dark-ink-1">{e.detalle}</p>
                    {e.zonas && (
                      <button type="button" className="mt-0.5 text-[10px] underline underline-offset-2 hover:text-dark-ink-1"
                        onClick={() => verComoEstaba(e.en, e.zonas!)}>
                        Ver cómo estaba
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Diálogos */}
      {preguntaVisible && preguntaVisible.tipo !== "descartarBorrador" && (
        <Dialogo titulo={preguntaVisible.tipo === "salir" ? "Salir de la distribución" : `Pasar a la cara ${preguntaVisible.cara}`} onCerrar={cerrarPregunta}>
          <p className="text-xs leading-relaxed text-dark-ink-2">
            Tenés cambios sin guardar en la cara {activa.cara}. ¿Guardarlos como borrador, descartarlos o seguir editando?
          </p>
          {mensajeDePregunta && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{mensajeDePregunta}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={BOTON} onClick={cerrarPregunta}>Seguir editando</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={() => void descartarYSeguir()}>Descartarlos</button>
            <button type="button" className={`${BOTON} border-dark-ink-2`} onClick={() => void guardarYSeguir()}
              disabled={guardado.estado === "guardando"}>
              Guardarlos como borrador
            </button>
          </div>
        </Dialogo>
      )}
      {preguntaVisible?.tipo === "descartarBorrador" && (
        <Dialogo titulo="Descartar el borrador" onCerrar={cerrarPregunta}>
          {textoDeDescartarBorrador({ cara: activa.cara, hayConfirmada: !!datos?.distribucion?.confirmada.length, sucio }).map((linea, i) => (
            <p key={i} className={`text-xs leading-relaxed ${i === 0 ? "text-dark-ink-2" : "mt-1.5 font-semibold"}`}
              style={i === 0 ? undefined : { color: "rgb(var(--entra-txt-rgb))" }} data-descartar-linea={i}>
              {linea}
            </p>
          ))}
          {guardado.estado === "error" && guardado.mensaje && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{guardado.mensaje}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BOTON} onClick={cerrarPregunta}>Dejarlo así</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
              onClick={async () => { await st().descartar(); if (st().guardado.estado !== "error") cerrarPregunta(); }}>
              Sí, descartarlo
            </button>
          </div>
        </Dialogo>
      )}
      {resumen && <ResumenDeCambios onCerrar={() => setResumen(false)} />}
      {formulario && <FormularioDeParticipacion />}
    </aside>
  );
}

/** El fondo de un segmento de la barra de capacidad: la misma estampa que la
 *  leyenda y el lienzo (velo y textura; el número va encima). */
function FondoDeEstampa({ estampa }: { estampa: Estampa }) {
  return (
    <>
      <span className="absolute inset-0" style={{ background: tonoCss(estampa), opacity: 0.3 }} />
      <span className="absolute inset-0" style={fondoDeEstampa(estampa)} />
    </>
  );
}
