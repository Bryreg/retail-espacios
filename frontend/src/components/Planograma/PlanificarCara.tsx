import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftToLine, ArrowRightToLine, BellRing, BoxSelect, CircleAlert, CircleCheck, Eraser, GripVertical, History, Lock, Maximize2,
  Minimize2, MoreHorizontal, PenLine, Plus, Redo2, RotateCcw, Send, Trash2, Undo2, Users, Wand2, X,
} from "lucide-react";
import { describeError } from "../../api/client";
import * as API from "../../api/planogramas";
import type { DestinoOut } from "../../api/planogramas";
import { haySinGuardar, usePlanograma } from "../../store/planogramaStore";
import { useAuthStore, selectIsAdmin } from "../../store/authStore";
import { useFixtureStore } from "../../store/fixtureStore";
import { pct } from "../../utils/participaciones";
import {
  AJUSTE_SOLO_PB, FORMAS, acomodarSolas, cajaDe, contadorAMano, dejarJustaAMano, encajar, estantes, franja, lineasDeLaCara,
  lineasDeOcupados, llevaAMano, poligonoDeRect, primeraQuePisa, ubicarSinArrastrar, type CaraDePiezas, type FormaDePieza, type Rect,
} from "../../utils/piezas";
import {
  colorLibre, destinosConocidos, guardadoSinUbicar, haceCuanto, libreParaPlanificar, ocupadosDelPlano, piezasDelPlano,
  textoDelEstadoDelPlano, textoDelTipo, vendidaEnteraDespues, vendidaEnteraHoy, type PiezaDelPlano, type PiezaEnEdicion,
} from "../../utils/planograma";
import { guiasDeCara } from "../../utils/superficie";
import { validarZona } from "../../utils/zonasGeometria";
import { BOTON, BOTON_PELIGRO, Dialogo, ESTILO_PELIGRO, fechaLegible, sumarDias } from "../Distribucion/LeyendaDeParticipaciones";
import CaraDelPlanograma, { dondeCaeEnElPlano, dondeQuedoEnElPlano, uvEnElPlano } from "./CaraDelPlanograma";
import FormularioDeDestino, { IconoDelTipo } from "./FormularioDeDestino";
import PublicarVersion from "./PublicarVersion";
import Versiones from "./Versiones";

/**
 * «Planificar la cara» (fase 2 de la distribución, 2026-10-24; dibujo aprobado
 * en `docs/ESTADO.md` → *Planogramas con destinos*). La misma pantalla de
 * piezas de «Distribuir esta cara», para repartir una cara entre DESTINOS —una
 * categoría, la marca propia, una promoción…— con el % que se quiera. Sirve
 * para los muebles que no se venden y para lo libre de los que sí (lo vendido
 * viene bloqueado y manda).
 *
 *   · El borrador se guarda solo; nunca es una instrucción de montaje.
 *   · «Publicar versión N» (el único amarillo) pide desde cuándo rige (y hasta
 *     cuándo, si es una promoción), dice qué cambia contra la vigente y la deja
 *     como la oficial. Cambiar una publicada es publicar la siguiente.
 *   · Al vencer su «hasta», la última sigue vigente y se dice hace cuánto venció.
 *
 * Se abre encima de todo (`fixed`): mientras está abierta, las teclas que el
 * plano usaría para borrar o girar el mueble se cortan acá (en captura).
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const DEL_PLANO = new Set(["Delete", "Backspace", "r", "R", "f", "F", "Escape"]);
const ITEM_MENU = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-ink-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const AVISO = { borderColor: "rgb(var(--entra-txt-rgb) / 0.5)", color: "rgb(var(--entra-txt-rgb))" } as const;

/** El bloque de un destino en la lista: su color, del ancho de su %. */
function Bloque({ tono, pb, chico = false, bloqueada = false }: { tono: string; pb: number; chico?: boolean; bloqueada?: boolean }) {
  const ancho = Math.max(14, Math.min(46, Math.round((pb / 10000) * 92)));
  return (
    <span aria-hidden className="inline-flex flex-shrink-0 items-center justify-center rounded-md border-2"
      style={{ width: chico ? Math.min(ancho, 24) : ancho, height: chico ? 22 : 34, borderColor: tono,
        background: `color-mix(in srgb, ${tono} ${bloqueada ? 14 : 22}%, rgb(var(--surface-rgb)))` }}>
      {bloqueada && !chico && <Lock size={12} strokeWidth={1.75} style={{ color: tono }} />}
    </span>
  );
}

/** «GON-12 · cara A · Góndola 12» (el rótulo sólo si dice otra cosa que el código). */
export function tituloDeLaCara(d: Pick<API.CaraDelPlanograma, "fixture" | "cara">): string {
  const code = d.fixture.code ?? "";
  const label = (d.fixture.label ?? "").trim();
  return `${code} · cara ${d.cara}${label && label.toUpperCase() !== code.toUpperCase() ? ` · ${label}` : ""}`;
}

/** Qué es la cara, en el renglón de arriba del título. */
export function queEsLaCara(d: Pick<API.CaraDelPlanograma, "comercializable" | "por_participacion">): string {
  return !d.comercializable ? "Mueble interno · no se vende" : d.por_participacion ? "Se vende por partes de la cara" : "Se vende entera";
}

type Pregunta = { tipo: "salir" } | { tipo: "cara"; cara: "A" | "B" } | { tipo: "descartar" } | null;

export default function PlanificarCara() {
  const abierta = usePlanograma((s) => s.abierta);
  if (!abierta) return null;
  return <Pantalla />;
}

function Pantalla() {
  const abierta = usePlanograma((s) => s.abierta)!;
  const datos = usePlanograma((s) => s.datos);
  const cargando = usePlanograma((s) => s.cargando);
  const error = usePlanograma((s) => s.error);
  const edicion = usePlanograma((s) => s.piezas);
  const atras = usePlanograma((s) => s.atras);
  const adelante = usePlanograma((s) => s.adelante);
  const formas = usePlanograma((s) => s.formas);
  const nuevos = usePlanograma((s) => s.nuevos);
  const guardado = usePlanograma((s) => s.guardado);
  const elegida = usePlanograma((s) => s.elegida);
  const trazo = usePlanograma((s) => s.trazo);
  const pistaGuardada = usePlanograma((s) => s.pista);
  const mirando = usePlanograma((s) => s.mirando);
  const esAdmin = useAuthStore(selectIsAdmin);
  const mueble = useFixtureStore((s) => {
    const k = Object.keys(s.fixturesBySede).find((x) => x.trim().toUpperCase() === abierta.sede.trim().toUpperCase()) ?? abierta.sede;
    return (s.fixturesBySede[k] ?? []).find((f) => f.id === abierta.fixtureId) ?? null;
  });
  const st = usePlanograma.getState;

  const [mas, setMas] = useState(false);
  const [menuDe, setMenuDe] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ cambiando: { destino: DestinoOut; pb: number } | null } | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [verVersiones, setVerVersiones] = useState(false);
  const [pregunta, setPregunta] = useState<Pregunta>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<{ id: number; x: number; y: number; rect: Rect | null; pisa: number | null; movida: boolean } | null>(null);
  const arrastrada = useRef(false);

  const sucio = usePlanograma(haySinGuardar);
  const pista = pistaGuardada && pistaGuardada.piezas === edicion ? pistaGuardada.texto : null;

  /* ── La cara como la leen las piezas ─────────────────────────────────────── */
  const cara: CaraDePiezas | null = useMemo(() => {
    const sup = datos?.superficie;
    if (!sup) return null;
    return { ancho: sup.ancho, alto: sup.alto, exclusiones: sup.exclusiones, estantes: mueble ? guiasDeCara(mueble, abierta.cara).entrepanos : [] };
  }, [datos?.superficie, mueble, abierta.cara]);

  const destinos = useMemo(() => {
    if (!datos) return new Map<number, DestinoOut>();
    const m = destinosConocidos(datos, nuevos);
    for (const p of mirando?.piezas ?? []) if (p.destino) m.set(p.destino_id, { ...p.destino, id: p.destino_id });
    return m;
  }, [datos, nuevos, mirando]);
  const lasQueSeVen: PiezaEnEdicion[] = useMemo(() => (mirando?.piezas
    ? mirando.piezas.map((p) => ({ destinoId: p.destino_id, pb: p.pb, vertices: p.vertices }))
    : edicion), [mirando, edicion]);
  const piezas = useMemo(() => (datos ? piezasDelPlano(datos, lasQueSeVen, destinos, formas) : []), [datos, lasQueSeVen, destinos, formas]);
  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const propias = piezas.filter((p) => !p.bloqueada);
  const vendidas = piezas.filter((p) => p.bloqueada);
  const guardadas = datos ? guardadoSinUbicar(datos) : [];
  const libre = datos ? libreParaPlanificar(datos, lasQueSeVen) : 0;
  const piezaElegida = elegida !== null ? porId.get(elegida) ?? null : null;
  const puedeEditar = !!datos?.permisos.planificar && !!cara && !mirando && !cargando;
  const vigente = datos?.planograma.vigente ?? null;
  const programada = datos?.planograma.programadas[0] ?? null;
  const proxima = (datos?.planograma.versiones[0]?.numero ?? 0) + 1;
  const hayBorrador = !!datos?.planograma.borrador;
  const enteraHoy = datos ? vendidaEnteraHoy(datos) : null;
  const enteraDespues = datos ? vendidaEnteraDespues(datos) : null;

  /* ── El teclado, en captura, mientras la pantalla está abierta ────────────── */
  useEffect(() => {
    const enCaptura = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (t?.closest?.('[role="dialog"]') || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const deshacer = ctrl && (e.key === "z" || e.key === "Z") && !e.shiftKey;
      const rehacer = ctrl && (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey));
      const s = st();
      if (deshacer || rehacer || DEL_PLANO.has(e.key) || e.key === "Enter") {
        if (deshacer) { e.preventDefault(); s.deshacer(); }
        else if (rehacer) { e.preventDefault(); s.rehacer(); }
        else if (e.key === "Escape") { if (s.trazo) s.ponerTrazo(null); else s.elegir(null); }
        else if (e.key === "Backspace" && s.trazo?.length) { e.preventDefault(); s.ponerTrazo(s.trazo.slice(0, -1)); }
        else if (e.key === "Enter" && s.trazo && s.trazo.length >= 3) { e.preventDefault(); cerrarAMano.current(); }
        else if ((e.key === "Delete" || e.key === "Backspace") && s.elegida !== null && s.elegida > 0 && !s.trazo) {
          e.preventDefault();
          s.poner(s.elegida, null);
        } else if (e.key !== "Enter") e.preventDefault();
        if (e.key !== "Enter" || s.trazo) e.stopPropagation();
      }
    };
    window.addEventListener("keydown", enCaptura, { capture: true });
    return () => window.removeEventListener("keydown", enCaptura, { capture: true });
  }, []);

  /* ── Cerrar la pestaña con cambios sin guardar ───────────────────────────── */
  useEffect(() => {
    if (!sucio) return;
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [sucio]);

  /* ── «Más» se cierra tocando afuera ──────────────────────────────────────── */
  const menuMas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mas) return;
    const afuera = (e: PointerEvent) => { if (menuMas.current && !menuMas.current.contains(e.target as Node)) setMas(false); };
    window.addEventListener("pointerdown", afuera, { capture: true });
    menuMas.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => window.removeEventListener("pointerdown", afuera, { capture: true });
  }, [mas]);

  /* ── Ubicar ──────────────────────────────────────────────────────────────── */
  const nombreDe = (id: number) => porId.get(id)?.corto ?? "otra pieza";
  const soltar = (id: number, rect: Rect | null, pisa: number | null) => {
    const p = porId.get(id);
    if (!p || !rect || !puedeEditar || p.bloqueada) return;
    if (pisa !== null) { st().decir(`Ahí ya está ${nombreDe(pisa)}: soltala en lo verde.`); return; }
    st().poner(id, poligonoDeRect(rect));
    st().elegir(id);
    st().decir(`${p.corto} quedó ubicada: ${pct(p.pb)} justo.`);
  };
  const caraRef = useRef<HTMLDivElement>(null);
  const mostrarLaCara = () => {
    const el = caraRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const ubicarSinArrastre = (p: PiezaDelPlano, como: "primero" | "izquierda" | "derecha") => {
    if (!cara || !puedeEditar || p.forma === "a_mano") return;
    const r = ubicarSinArrastrar(cara, p.pb, p.forma, ocupadosDelPlano(p.id, piezas), p.estado === "sin_ubicar" ? null : p.rect, como);
    if (!r) {
      st().decir(como === "primero" ? `${p.corto} no entra entera en ningún hueco libre: probá en Estantes o a mano.` : `${p.corto}: no hay más lugar libre a la ${como}.`);
      return;
    }
    mostrarLaCara();
    soltar(p.id, r, null);
    st().decir(`${p.corto} quedó ${dondeQuedoEnElPlano(r, cara.ancho)}: ${pct(p.pb)} justo.`);
  };
  const acomodar = () => {
    if (!cara || !puedeEditar) return;
    const sin = propias.filter((p) => p.estado === "sin_ubicar");
    if (sin.length === 0) return;
    const fijas = piezas.filter((p) => p.poligonos.length > 0).map((p) => ({ spaceId: p.id, poligonos: p.poligonos }));
    const puestas = acomodarSolas(cara, sin.map((p) => ({ spaceId: p.id, pb: p.pb })), fijas, () => true);
    if (puestas.size > 0) {
      mostrarLaCara();
      st().ponerVarias([...puestas].map(([id, r]) => ({ destinoId: id, vertices: poligonoDeRect(r) })));
      for (const id of puestas.keys()) st().ponerForma(id, "franja");
    }
    const faltan = sin.filter((p) => !puestas.has(p.id));
    st().decir(faltan.length > 0
      ? `${faltan.map((p) => p.corto).join(", ")} no ${faltan.length === 1 ? "entra" : "entran"} como franja: ubicala en Estantes o a mano.`
      : `${puestas.size === 1 ? "Quedó ubicado" : "Quedaron ubicados"} en franjas, uno al lado del otro.`);
  };

  /** Arrastrar un destino desde la lista: sigue al dedo y, sobre la cara,
   *  muestra dónde caería. */
  const piezasActuales = useRef(piezas);
  piezasActuales.current = piezas;
  const empezarArrastre = (p: PiezaDelPlano, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !puedeEditar || p.forma === "a_mano" || !cara || p.bloqueada) return;
    const desde = { x: e.clientX, y: e.clientY };
    const boton = e.currentTarget;
    boton.setPointerCapture(e.pointerId);
    let a = { id: p.id, x: e.clientX, y: e.clientY, rect: null as Rect | null, pisa: null as number | null, movida: false };
    setArrastre(a);
    const mover = (ev: PointerEvent) => {
      const movida = a.movida || Math.hypot(ev.clientX - desde.x, ev.clientY - desde.y) >= 4;
      const uv = movida ? uvEnElPlano(ev.clientX, ev.clientY, cara.ancho, cara.alto) : null;
      const donde = uv ? dondeCaeEnElPlano(cara, p, piezasActuales.current, uv[0], uv[1]) : { rect: null, pisa: null };
      a = { ...a, x: ev.clientX, y: ev.clientY, movida, rect: donde.rect, pisa: donde.pisa };
      setArrastre(a);
    };
    const quitar = () => {
      boton.removeEventListener("pointermove", mover);
      boton.removeEventListener("pointerup", fin);
      boton.removeEventListener("pointercancel", cancelar);
    };
    const fin = () => {
      quitar();
      setArrastre(null);
      arrastrada.current = true;
      if (!a.movida) { elegirPieza(p); return; }
      if (a.rect) soltar(p.id, a.rect, a.pisa);
      else st().decir(`Soltá «${p.corto}» sobre la cara (lo verde está libre).`);
    };
    const cancelar = () => { quitar(); setArrastre(null); };
    boton.addEventListener("pointermove", mover);
    boton.addEventListener("pointerup", fin);
    boton.addEventListener("pointercancel", cancelar);
  };

  const elegirPieza = (p: PiezaDelPlano) => {
    st().elegir(p.id);
    if (!p.bloqueada && p.forma === "a_mano" && p.poligonos.length === 0 && puedeEditar) empezarAMano(p);
  };
  const empezarAMano = (p: PiezaDelPlano) => {
    st().elegir(p.id);
    st().ponerTrazo([]);
    st().decir(p.poligonos.length > 0
      ? `Rehacé ${p.corto}: tocá un punto por cada esquina. Lo de antes queda hasta que cierres la forma nueva.`
      : "A mano: tocá un punto por cada esquina. Se pegan a los estantes y a los bordes; el círculo grande es el primero: tocalo (o Enter) para cerrar.");
  };
  /** Cerrar la forma «A mano». Si quedó a ±3 %, se deja JUSTA sola corriendo
   *  un lado suelto (el que se puso a ojo). */
  const cerrarAMano = useRef<() => void>(() => {});
  cerrarAMano.current = () => {
    const t = st().trazo;
    const p = piezaElegida;
    if (!cara || !t || t.length < 3 || !p) return;
    const v = validarZona(t, cara.ancho, cara.alto);
    if (v.codigo !== null || !v.vertices) { st().decir("Esa forma se cruza consigo misma: mové o sacá el último punto."); return; }
    const lleva = llevaAMano(t, cara);
    const otras = ocupadosDelPlano(p.id, piezas);
    const l = lineasDeLaCara(cara), o = lineasDeOcupados(otras);
    const justa = lleva !== null && lleva !== p.pb && Math.abs(lleva - p.pb) <= AJUSTE_SOLO_PB
      ? dejarJustaAMano(t, cara, p.pb, otras.flatMap((x) => [...x.poligonos]), { us: [...l.us, ...o.us], vs: [...l.vs, ...o.vs] })
      : null;
    st().poner(p.id, justa ?? v.vertices);
    st().ponerTrazo(null);
    if (justa) st().decir(`${p.corto}: le corrimos un lado para que quede en ${pct(p.pb)} justo.`);
  };

  const cambiarForma = (f: FormaDePieza) => {
    const p = piezaElegida;
    if (!p || !cara || !puedeEditar || p.bloqueada) return;
    mostrarLaCara();
    st().ponerForma(p.id, f);
    if (f === "a_mano") { empezarAMano(p); return; }
    st().ponerTrazo(null);
    const caja = cajaDe(p.poligonos);
    if (!caja) return;
    const ocupados = ocupadosDelPlano(p.id, piezas);
    const r = encajar(cara, p.pb, f, (caja.u0 + caja.u1) / 2, f === "estantes" ? caja.v0 + 0.02 : (caja.v0 + caja.v1) / 2, ocupados, { radio: 0.03 });
    const pisa = r ? primeraQuePisa([poligonoDeRect(r)], ocupados, cara) : null;
    if (r && pisa === null) {
      st().poner(p.id, poligonoDeRect(r));
      st().decir(f === "franja" ? `${p.corto}: de arriba a abajo, ${pct(p.pb)} justo.` : `${p.corto}: a lo ancho, apoyado en un estante. Estiralo y se acomoda solo.`);
    } else {
      st().decir(`Ahí no entra como ${f === "franja" ? "franja" : "estantes"}: arrastralo a lo verde.`);
    }
  };
  const dejarJusta = (p: PiezaDelPlano) => {
    if (!cara || !puedeEditar) return;
    if (p.rect && p.forma !== "a_mano") {
      const r = p.forma === "franja" ? (franja(cara, p.pb, p.rect.u0, "derecha") ?? franja(cara, p.pb, p.rect.u1, "izquierda"))
        : estantes(cara, p.pb, p.rect.u0, p.rect.u1, p.rect.v0);
      if (r) st().poner(p.id, poligonoDeRect(r));
      return;
    }
    if (p.poligonos[0]) {
      const otras = ocupadosDelPlano(p.id, piezas);
      const l = lineasDeLaCara(cara), o = lineasDeOcupados(otras);
      const justa = dejarJustaAMano(p.poligonos[0], cara, p.pb, otras.flatMap((x) => [...x.poligonos]), { us: [...l.us, ...o.us], vs: [...l.vs, ...o.vs] });
      if (justa) st().poner(p.id, justa);
      else st().decir(`${p.corto}: no se llega a ${pct(p.pb)} corriendo un lado. Rehacelo con más puntos o pasalo a Franja.`);
    }
  };

  /* ── Salir y cambiar de cara ─────────────────────────────────────────────── */
  const pedirSalir = () => { if (sucio && puedeEditar) setPregunta({ tipo: "salir" }); else st().cerrar(); };
  const pedirCara = (c: "A" | "B") => {
    if (c === abierta.cara) return;
    if (sucio && puedeEditar) setPregunta({ tipo: "cara", cara: c });
    else void st().abrir({ ...abierta, cara: c });
  };
  const [mensajeDePregunta, setMensajeDePregunta] = useState<string | null>(null);
  async function seguir(guardar: boolean) {
    const p = pregunta;
    if (!p || p.tipo === "descartar") return;
    if (guardar && !(await st().guardarBorrador(false))) { setMensajeDePregunta("No se pudo guardar: tu trabajo sigue acá. Probá de nuevo o salí sin guardar."); return; }
    setPregunta(null);
    setMensajeDePregunta(null);
    if (p.tipo === "salir") st().cerrar();
    else void st().abrir({ ...abierta, cara: p.cara });
  }

  /* ── Lo que se ve ─────────────────────────────────────────────────────────── */
  const sinUbicar = propias.filter((p) => p.estado === "sin_ubicar");
  const conProblema = propias.filter((p) => p.estado !== "sin_ubicar" && p.estado !== "ubicada");
  const ubicados = propias.filter((p) => p.estado === "ubicada").length;
  const publicadaSinCambios = !!vigente && !sucio && !hayBorrador;
  const motivo = !datos ? null
    : !datos.permisos.planificar ? (datos.comercializable ? "Un mueble que se vende lo planifica sólo quien administra." : "Sólo quien administra planifica y publica.")
    : propias.length === 0 ? "Agregá al menos un destino."
    : sinUbicar.length > 0 ? `Falta ubicar ${sinUbicar.map((p) => p.corto).join(", ")}.`
    : conProblema.length > 0 ? `Revisá ${conProblema[0].corto}: ${textoDelEstadoDelPlano(conProblema[0], conProblema[0].choca !== null ? nombreDe(conProblema[0].choca) : null).toLowerCase()}.`
    : guardado.estado === "version_vieja" ? "Otra sesión cambió este planograma: tocá «Traer lo nuevo»."
    : publicadaSinCambios ? "Publicada, sin cambios."
    : null;
  const bloqueado = motivo !== null || guardado.estado === "guardando";
  const aMano = !!piezaElegida && !piezaElegida.bloqueada && piezaElegida.forma === "a_mano";
  const lleva = aMano && cara ? (trazo ? llevaAMano(trazo, cara) : piezaElegida!.dibujado) : null;
  const contador = aMano && piezaElegida ? contadorAMano(lleva, piezaElegida.pb, !trazo && piezaElegida.poligonos.length > 0) : null;

  const pistaQueSeVe = mirando ? `Mirando la versión ${mirando.numero}: desde acá no se cambia.`
    : !datos?.permisos.planificar ? "Sólo quien administra planifica y publica: acá se ve lo que hay que montar."
    : pista
    ?? (trazo ? (trazo.length < 3 ? "Tocá un punto por cada esquina." : "Tocá el círculo grande (o Enter) para cerrar la forma.") : null)
    ?? (piezaElegida && !piezaElegida.bloqueada && piezaElegida.estado === "sin_ubicar" ? `Arrastrá «${piezaElegida.corto}» a lo verde, o tocá lo verde donde va.` : null)
    ?? (sinUbicar[0] ? `Arrastrá «${sinUbicar[0].corto}» a lo verde, o tocalo en la lista y después tocá lo verde.` : null)
    ?? (propias.length === 0 ? "Agregá un destino: una categoría, la marca propia, una promoción…" : null)
    ?? "Arrastrá una pieza para moverla; las manijas la estiran sin cambiar su %.";

  const piezaQueVuela = arrastre && arrastre.movida && !arrastre.rect ? porId.get(arrastre.id) ?? null : null;
  const piezasDeLaVigente = useMemo(() => (vigente?.piezas ?? []).map((p) => ({ destinoId: p.destino_id, pb: p.pb, vertices: p.vertices })), [vigente]);

  return (
    <div data-planificar-cara role="region" aria-label="Planificar la cara" className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-bg text-ink-1">
      <div className="mx-auto w-full max-w-[1240px] p-3 sm:p-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">

          {/* 1 · El encabezado */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-ink-3">{datos && !datos.permisos.planificar ? "Planograma de la cara" : "Planificar la cara"}{datos ? ` · ${queEsLaCara(datos)}` : ""}</p>
              <h2 className="text-balance break-words text-base font-bold leading-snug" data-titulo-del-planograma>
                {datos ? <span className="codigo">{tituloDeLaCara(datos)}</span> : "Leyendo la cara…"}
              </h2>
              {datos && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-estado-del-planograma>
                  {vigente && vigente.vencida_hace_dias != null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" data-chip-vencida
                      style={{ background: "rgb(var(--entra-suave-rgb))", color: "rgb(var(--entra-txt-rgb))" }}>
                      <BellRing size={13} strokeWidth={1.75} aria-hidden />Versión {vigente.numero} · sigue vigente, venció el {fechaLegible(vigente.hasta, datos.hoy)}
                    </span>
                  ) : vigente ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                      style={{ background: "rgb(var(--libre-suave-rgb))", color: "rgb(var(--libre-txt-rgb))" }}>
                      <CircleCheck size={13} strokeWidth={1.75} aria-hidden />Versión {vigente.numero} · vigente desde el {fechaLegible(vigente.rige_desde, datos.hoy)}
                      {vigente.hasta ? ` hasta el ${fechaLegible(vigente.hasta, datos.hoy)}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 font-semibold text-ink-2">Sin planograma publicado</span>
                  )}
                  {(hayBorrador || sucio) && !mirando && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 font-semibold text-ink-2">
                      <PenLine size={13} strokeWidth={1.75} aria-hidden />Borrador de la versión {proxima}{vigente ? ` · la ${vigente.numero} sigue vigente` : ""}
                    </span>
                  )}
                  {guardado.estado === "guardando" && <span className="text-ink-3">guardando…</span>}
                  {guardado.estado === "quieto" && sucio && puedeEditar && <span className="text-ink-3">el borrador se guarda solo</span>}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {datos && datos.fixture.caras === 2 && (
                <div role="radiogroup" aria-label="Cara" className="flex rounded-lg border border-line p-0.5">
                  {(["A", "B"] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={abierta.cara === c} onClick={() => pedirCara(c)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${abierta.cara === c ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>
                      Cara {c}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className={BOTON} onClick={() => setVerVersiones(true)} disabled={!datos} data-versiones>
                <History {...ICONO} />Versiones
              </button>
              {datos?.permisos.planificar && (
                <div className="relative" ref={menuMas}>
                  <button type="button" className={BOTON} aria-haspopup="menu" aria-expanded={mas} onClick={() => setMas(!mas)} data-mas>
                    <MoreHorizontal {...ICONO} />Más
                  </button>
                  {mas && (
                    <div role="menu" aria-label="Más" className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
                      <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || atras.length === 0}
                        onClick={() => { setMas(false); st().deshacer(); }}><Undo2 {...ICONO} />Deshacer</button>
                      <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || adelante.length === 0}
                        onClick={() => { setMas(false); st().rehacer(); }}><Redo2 {...ICONO} />Rehacer</button>
                      <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || !propias.some((p) => p.poligonos.length > 0)}
                        onClick={() => { setMas(false); st().vaciar(); st().decir("Sacaste todas las piezas: arrastralas de nuevo o tocá «Acomodar solos»."); }}>
                        <Eraser {...ICONO} />Sacar todas las piezas</button>
                      <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || !sucio}
                        onClick={() => { setMas(false); st().descartarCambios(); }}><RotateCcw {...ICONO} />Descartar mis cambios</button>
                      <button role="menuitem" type="button" className={ITEM_MENU} disabled={!puedeEditar || !hayBorrador}
                        onClick={() => { setMas(false); setPregunta({ tipo: "descartar" }); }}><Trash2 {...ICONO} />Descartar el borrador guardado</button>
                      {esAdmin && <QuienPublica onListo={() => setMas(false)} />}
                    </div>
                  )}
                </div>
              )}
              <button type="button" className={BOTON} onClick={pedirSalir} data-salir><X {...ICONO} />Salir</button>
            </div>
          </div>

          {/* 2 · Lo que hay que saber */}
          {exito && (
            <div role="status" data-exito className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
              style={{ background: "rgb(var(--libre-suave-rgb))", borderColor: "rgb(var(--libre-borde-rgb))" }}>
              <CircleCheck {...ICONO} className="mt-0.5" style={{ color: "rgb(var(--libre-txt-rgb))" }} />
              <p>{exito}</p>
              <button type="button" className="rounded p-1 text-ink-3 hover:text-ink-1" aria-label="Cerrar el aviso" onClick={() => setExito(null)}><X {...ICONO} /></button>
            </div>
          )}
          {cargando && !datos && <p className="text-sm text-ink-2">Leyendo la cara…</p>}
          {error && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs" style={ESTILO_PELIGRO}>
              <p>{error}</p>
              <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().abrir(abierta)}>Probar de nuevo</button>
            </div>
          )}
          {vigente?.vencida_hace_dias != null && !mirando && (
            <div role="status" className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs" style={AVISO} data-vencida>
              <BellRing {...ICONO} className="mt-px flex-shrink-0" />
              <p>La versión {vigente.numero} venció {haceCuanto(vigente.vencida_hace_dias)} (su «hasta» era el {fechaLegible(vigente.hasta, datos?.hoy)}).
                Sigue rigiendo hasta que publiques otra.</p>
            </div>
          )}
          {vigente?.para_revisar && !mirando && (
            <p role="status" className="rounded-xl border px-3 py-2.5 text-xs" style={AVISO} data-para-revisar>
              El mueble cambió desde que se publicó la versión {vigente.numero} (medidas, estantes o tipo): revisá las piezas y publicá la siguiente.
            </p>
          )}
          {!!vigente?.choca_con_lo_vendido?.length && !mirando && (
            <div role="status" className="rounded-xl border px-3 py-2.5 text-xs" style={AVISO} data-lo-vendido-cambio>
              <p className="font-semibold">Lo vendido cambió después de publicar la versión {vigente.numero}:</p>
              <ul className="mt-0.5 list-disc pl-4">{vigente.choca_con_lo_vendido.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="mt-0.5">Lo vendido manda: corregilo y publicá la siguiente.</p>
            </div>
          )}
          {programada && !mirando && (
            <p className="rounded-xl border border-line px-3 py-2.5 text-xs text-ink-2" data-programada>
              La versión {programada.numero} rige desde el {fechaLegible(programada.rige_desde, datos?.hoy)}{programada.hasta ? ` hasta el ${fechaLegible(programada.hasta, datos?.hoy)}` : ""}.
            </p>
          )}
          {enteraHoy && (
            <p className="rounded-xl border px-3 py-2.5 text-xs" style={AVISO}>
              La cara está vendida entera hasta el {fechaLegible(enteraHoy.hasta, datos?.hoy)}: no hay lugar para planificar hasta entonces.
            </p>
          )}
          {!enteraHoy && enteraDespues && (
            <p className="rounded-xl border px-3 py-2.5 text-xs" style={AVISO}>
              Desde el {fechaLegible(enteraDespues.desde, datos?.hoy)} la cara está vendida entera: al publicar, ponele «hasta» antes de esa fecha.
            </p>
          )}
          {mirando && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-ink-2">
              <p className="min-w-0 flex-1">Mirando la versión {mirando.numero} ({mirando.estado}) · publicada el {fechaLegible(mirando.publicada_en?.slice(0, 10), datos?.hoy)}.</p>
              <button type="button" className={BOTON} onClick={() => st().mirar(null)}>Volver a planificar</button>
            </div>
          )}
          {guardado.estado === "error" && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs" style={ESTILO_PELIGRO}>
              <p>{guardado.mensaje}</p>
              <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().guardarBorrador(false)}>Probar de nuevo</button>
            </div>
          )}
          {guardado.estado === "version_vieja" && (
            <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs" style={AVISO}>
              <p>{guardado.mensaje}</p>
              <p className="mt-0.5 text-ink-2">El guardado automático se frenó. «Traer lo nuevo» trae lo de la otra sesión (lo tuyo se pierde).</p>
              <button type="button" className={`${BOTON} mt-1.5`} onClick={() => void st().recargar()}>Traer lo nuevo</button>
            </div>
          )}

          {/* 3 · La cara y las piezas */}
          {datos && cara && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col items-center gap-2">
                <div ref={caraRef} className="w-full scroll-mt-4">
                  <CaraDelPlanograma cara={cara} piezas={piezas} puedeEditar={puedeEditar} libre={libre}
                    fantasmaDeLista={arrastre && arrastre.movida ? arrastre : null} onSoltar={soltar} onCerrarAMano={() => cerrarAMano.current()}
                    titulo={`La cara ${abierta.cara} de ${datos.fixture.code ?? ""} de frente: arrastrá cada destino a su lugar`} />
                </div>
                <p className="min-h-[1.4em] text-center text-xs text-ink-2" aria-live="polite" data-pista>{pistaQueSeVe}</p>
              </div>

              <div className="flex min-w-0 flex-col gap-3" aria-label="Los destinos de la cara" data-destinos>
                {propias.length > 0 && (
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-sm" data-progreso>
                    <b>{ubicados} de {propias.length}</b><span>{propias.length === 1 ? "destino ubicado" : "destinos ubicados"}</span>
                    <span className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${(100 * ubicados) / propias.length}%`, background: "rgb(var(--libre-rgb))" }} />
                    </span>
                  </div>
                )}

                <ul className="flex flex-col gap-2">
                  {vendidas.map((p) => (
                    <li key={p.id} data-vendida>
                      <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-line bg-surface-2 py-2 pl-2.5 pr-2">
                        <Bloque tono={p.tono} pb={p.pb} bloqueada />
                        <span className="block min-w-0 flex-1">
                          <span className="block break-words text-sm font-bold leading-snug">{p.nombre}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Lock size={13} strokeWidth={1.75} aria-hidden />Contrato · {pct(p.pb)} de la cara · su lugar no se toca</span>
                        </span>
                      </div>
                    </li>
                  ))}
                  {guardadas.map((g) => (
                    <li key={g.nombre} data-guardado>
                      <div className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 rounded-2xl border-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-xs text-ink-2">
                        <Lock size={14} strokeWidth={1.75} aria-hidden className="mt-px" />
                        <p><b className="text-ink-1">{g.nombre} · {pct(g.pb)}</b> — contratado y todavía sin ubicar. Ese lugar queda guardado: no se usa para otra cosa.</p>
                      </div>
                    </li>
                  ))}
                  {propias.map((p) => {
                    const esElegida = elegida === p.id;
                    const ok = p.estado === "ubicada";
                    const mal = p.estado !== "ubicada" && p.estado !== "sin_ubicar";
                    return (
                      <li key={p.id} data-destino-de-la-lista={p.id} data-estado={p.estado}>
                        <div className={`flex items-center gap-2 rounded-2xl border-[1.5px] py-2 pl-2.5 pr-1.5 ${ok ? "bg-surface-2" : "bg-surface"}`}
                          style={{ borderColor: esElegida ? p.tono : mal ? "rgb(var(--ocupado-rgb))" : "rgb(var(--line-rgb))",
                            boxShadow: esElegida ? `0 0 0 3px color-mix(in srgb, ${p.tono} 20%, transparent)` : undefined }}>
                          <button type="button" aria-pressed={esElegida} data-elegir-destino
                            onPointerDown={(e) => { arrastrada.current = false; empezarArrastre(p, e); }}
                            onClick={() => { if (arrastrada.current) { arrastrada.current = false; return; } elegirPieza(p); }}
                            className={`flex min-w-0 flex-1 touch-none items-center gap-2.5 text-left ${puedeEditar && p.forma !== "a_mano" ? "cursor-grab" : "cursor-pointer"}`}>
                            <Bloque tono={p.tono} pb={p.pb} />
                            <span className="block min-w-0 flex-1">
                              <span className="block break-words text-sm font-bold leading-snug">{p.nombre}</span>
                              <span className="flex flex-wrap items-center gap-x-1 text-xs text-ink-3">
                                {p.destino && <IconoDelTipo tipo={p.destino.tipo} size={13} />}
                                {p.destino ? textoDelTipo(p.destino.tipo) : "Destino"} · {pct(p.pb)} de la cara
                                {p.destino?.codigo_externo && <span className="whitespace-nowrap font-mono">· {p.destino.codigo_externo}</span>}
                              </span>
                              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold"
                                style={{ color: ok ? "rgb(var(--libre-txt-rgb))" : mal ? "rgb(var(--ocupado-txt-rgb))" : "rgb(var(--ink-2-rgb))" }}>
                                {ok && <CircleCheck {...ICONO} />}
                                {mal && <CircleAlert {...ICONO} />}
                                {textoDelEstadoDelPlano(p, p.choca !== null ? nombreDe(p.choca) : null)}
                              </span>
                              {p.destino?.como_se_monta && <span className="mt-0.5 block text-xs italic text-ink-2">{p.destino.como_se_monta}</span>}
                            </span>
                            {p.estado === "sin_ubicar" && puedeEditar && <GripVertical {...ICONO} className="flex-shrink-0 text-ink-3" />}
                          </button>
                          {puedeEditar && (
                            <button type="button" aria-label={`Más de ${p.nombre}`} aria-expanded={menuDe === p.id}
                              onClick={() => setMenuDe(menuDe === p.id ? null : p.id)}
                              className="flex-shrink-0 rounded-md p-1.5 text-ink-2 hover:bg-surface-3 hover:text-ink-1">
                              <MoreHorizontal {...ICONO} />
                            </button>
                          )}
                        </div>
                        {(p.estado === "falta" || p.estado === "sobra") && puedeEditar && !(esElegida && aMano) && (
                          <div className="mt-1.5 flex flex-wrap gap-2 pl-2">
                            <button type="button" className={BOTON} onClick={() => dejarJusta(p)}>
                              <Minimize2 {...ICONO} />{p.estado === "sobra" ? `Achicar a ${pct(p.pb)}` : `Dejarlo en ${pct(p.pb)}`}
                            </button>
                          </div>
                        )}
                        {menuDe === p.id && puedeEditar && (
                          <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-2.5 text-xs">
                            {p.forma !== "a_mano" && (
                              <div className="flex flex-wrap gap-1.5">
                                <button type="button" className={BOTON} onClick={() => { setMenuDe(null); ubicarSinArrastre(p, "primero"); }}><BoxSelect {...ICONO} />Ponerlo en el primer hueco libre</button>
                                <button type="button" className={BOTON} onClick={() => ubicarSinArrastre(p, "izquierda")}><ArrowLeftToLine {...ICONO} />A la izquierda</button>
                                <button type="button" className={BOTON} onClick={() => ubicarSinArrastre(p, "derecha")}><ArrowRightToLine {...ICONO} />A la derecha</button>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" className={BOTON} disabled={!p.destino}
                                onClick={() => { setMenuDe(null); if (p.destino) setFormulario({ cambiando: { destino: p.destino, pb: p.pb } }); }}>
                                <PenLine {...ICONO} />Cambiar nombre, % o color
                              </button>
                              {p.poligonos.length > 0 && (
                                <button type="button" className={BOTON} onClick={() => { setMenuDe(null); st().poner(p.id, null); st().decir(`${p.corto} salió de la cara: arrastralo de nuevo cuando quieras.`); }}>Sacar de la cara</button>
                              )}
                              <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
                                onClick={() => { setMenuDe(null); st().quitar(p.id); st().decir(`${p.corto} ya no está en esta cara.`); }}>Quitar de la cara</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {puedeEditar && (
                  <button type="button" onClick={() => setFormulario({ cambiando: null })} disabled={libre <= 0} data-agregar-destino
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-2 hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40">
                    <Plus {...ICONO} />{datos.comercializable ? "Usar lo libre con un destino" : "Agregar destino"}
                  </button>
                )}

                <p className="flex items-center gap-2.5 px-1 text-xs" style={{ color: libre > 0 ? "rgb(var(--libre-txt-rgb))" : "rgb(var(--ink-2-rgb))" }} data-libre>
                  <span aria-hidden className="inline-block h-[30px] w-[18px] rounded-md border-2 border-dashed"
                    style={{ borderColor: "rgb(var(--libre-borde-rgb))", background: "rgb(var(--libre-suave-rgb))" }} />
                  {libre > 0 ? `Libre · ${pct(libre)} sin planificar` : guardadas.length > 0 ? "Sin lugar libre: lo que queda está guardado para lo contratado" : "Sin lugar libre"}
                </p>

                {piezaElegida && !piezaElegida.bloqueada && puedeEditar && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-ink-3">Forma de {piezaElegida.corto}</span>
                    <div role="radiogroup" aria-label="Forma de la pieza" className="grid grid-cols-3 rounded-lg border border-line p-0.5">
                      {FORMAS.map((f) => (
                        <button key={f.forma} type="button" role="radio" aria-checked={piezaElegida.forma === f.forma}
                          onClick={() => cambiarForma(f.forma)} data-forma={f.forma}
                          className={`grid gap-px rounded-md px-1 py-1.5 text-center text-xs font-semibold ${piezaElegida.forma === f.forma ? "bg-surface-3 text-ink-1" : "text-ink-2 hover:text-ink-1"}`}>
                          {f.texto}<span className="text-[10.5px] font-normal opacity-75">{f.ayuda}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {contador && piezaElegida && puedeEditar && (
                  <div data-contador={contador.estado} className="grid gap-1.5 rounded-2xl border-[1.5px] px-3 py-2.5"
                    style={{
                      borderColor: contador.estado === "pasado" ? "rgb(var(--ocupado-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-rgb))" : piezaElegida.tono,
                      background: contador.estado === "pasado" ? "rgb(var(--ocupado-suave-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-suave-rgb))" : "rgb(var(--surface-rgb))",
                    }}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{contador.titulo}</span>
                      <b className="font-mono text-xl">{pct(lleva ?? 0)} <span className="text-xs font-medium text-ink-3">de {pct(piezaElegida.pb)}</span></b>
                    </div>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full" style={{
                        width: `${Math.min(100, (100 * (lleva ?? 0)) / Math.max(1, piezaElegida.pb))}%`,
                        background: contador.estado === "pasado" ? "rgb(var(--ocupado-rgb))" : contador.estado === "justo" ? "rgb(var(--libre-rgb))" : piezaElegida.tono,
                      }} />
                    </span>
                    <span className="text-xs text-ink-2">{contador.texto}</span>
                    <div className="flex flex-wrap gap-2">
                      {!trazo && piezaElegida.poligonos.length > 0 && contador.estado !== "justo" && (
                        <button type="button" className={BOTON} onClick={() => dejarJusta(piezaElegida)}>
                          {contador.estado === "pasado" ? <Minimize2 {...ICONO} /> : <Maximize2 {...ICONO} />}
                          {contador.estado === "pasado" ? `Achicar a ${pct(piezaElegida.pb)}` : `Llevar a ${pct(piezaElegida.pb)}`}
                        </button>
                      )}
                      {trazo && trazo.length > 0 && (
                        <button type="button" className={BOTON} onClick={() => st().ponerTrazo([])}><Eraser {...ICONO} />Borrar los puntos</button>
                      )}
                      {!trazo && piezaElegida.poligonos.length > 0 && (
                        <button type="button" className={BOTON} onClick={() => empezarAMano(piezaElegida)}><PenLine {...ICONO} />Rehacer a mano</button>
                      )}
                      {trazo && piezaElegida.poligonos.length > 0 && (
                        <button type="button" className={BOTON} onClick={() => { st().ponerTrazo(null); st().decir(null); }}><X {...ICONO} />Dejarlo como estaba</button>
                      )}
                    </div>
                  </div>
                )}

                {puedeEditar && (
                  <button type="button" className={BOTON} disabled={sinUbicar.length === 0} onClick={acomodar} data-acomodar>
                    <Wand2 {...ICONO} />Acomodar solos
                  </button>
                )}
                {datos.permisos.planificar && !mirando && (
                  <>
                    <button type="button" className="btn-principal inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm"
                      disabled={bloqueado} onClick={() => setPublicando(true)} data-publicar>
                      <Send {...ICONO} />{publicadaSinCambios ? "Publicada, sin cambios" : `Publicar versión ${proxima}`}
                    </button>
                    {motivo && !publicadaSinCambios && (
                      <p className="flex items-center gap-1.5 text-xs text-ink-3" data-motivo><CircleAlert {...ICONO} />{motivo}</p>
                    )}
                    <p className="text-xs text-ink-3">El borrador se guarda solo. Publicar lo deja como la instrucción oficial de montaje.</p>
                  </>
                )}
              </div>
            </div>
          )}
          {datos && !cara && (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-2">Este mueble no tiene una cara para planificar.</p>
          )}
        </section>
      </div>

      {piezaQueVuela && arrastre && (
        <div aria-hidden className="pointer-events-none fixed z-[900] flex items-center gap-2 rounded-xl border-2 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-lg"
          style={{ left: arrastre.x + 12, top: arrastre.y + 12, borderColor: piezaQueVuela.tono }}>
          <Bloque tono={piezaQueVuela.tono} pb={piezaQueVuela.pb} chico />{piezaQueVuela.corto} · {pct(piezaQueVuela.pb)}
        </div>
      )}

      {formulario && datos && (
        <FormularioDeDestino sede={abierta.sede} libre={libre} biblioteca={datos.biblioteca}
          colorSugerido={colorLibre(propias.map((p) => p.destino?.color).filter((c): c is DestinoOut["color"] => !!c))}
          enLaCara={new Set(propias.map((p) => p.id))} cambiando={formulario.cambiando}
          onCerrar={() => setFormulario(null)}
          onListo={(d, pb) => {
            const cambiando = formulario.cambiando;
            setFormulario(null);
            st().anotarDestino(d);
            if (cambiando) {
              if (cambiando.pb !== pb) { st().cambiarPb(d.id, pb); st().decir(`${d.nombre} ahora es de ${pct(pb)}: ubicalo de nuevo.`); }
              else st().decir(`${d.nombre}: listo.`);
            } else {
              st().agregar(d, pb);
              st().decir(`Arrastrá «${d.nombre}» a lo verde, o tocá «Acomodar solos».`);
            }
            if (d.en_la_sede) void API.leerDestinos(abierta.sede).then((b) => usePlanograma.setState((s) => (s.datos ? { datos: { ...s.datos, biblioteca: b } } : {}))).catch(() => {});
          }} />
      )}
      {publicando && datos && (
        <PublicarVersion numero={proxima} vigente={vigente} antes={piezasDeLaVigente} despues={edicion} nombre={(id) => destinos.get(id)?.nombre ?? "Un destino"}
          hoy={datos.hoy} desdeSugerido={enteraHoy ? sumarDias(enteraHoy.hasta, 1) : datos.hoy} hastaSugerido={enteraDespues ? sumarDias(enteraDespues.desde, -1) : null}
          onCerrar={() => setPublicando(false)}
          onPublicada={(n, desde) => { setPublicando(false); setExito(`Listo: la versión ${n} quedó publicada. Rige desde el ${fechaLegible(desde, datos.hoy)}.`); }} />
      )}
      {verVersiones && datos && (
        <Versiones versiones={datos.planograma.versiones} hoy={datos.hoy} onCerrar={() => setVerVersiones(false)}
          onVer={(v) => { setVerVersiones(false); st().mirar(v); }} />
      )}
      {pregunta && pregunta.tipo !== "descartar" && (
        <Dialogo titulo={pregunta.tipo === "salir" ? "¿Salir de esta cara?" : `¿Pasar a la cara ${pregunta.cara}?`} onCerrar={() => { setPregunta(null); setMensajeDePregunta(null); }}>
          <p className="text-sm leading-relaxed text-ink-2">
            Tenés cambios que todavía no se guardaron. Si los guardás, quedan como borrador para seguir después; para que valgan, publicá la versión.
          </p>
          {mensajeDePregunta && <p role="alert" className="mt-2 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{mensajeDePregunta}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={BOTON} onClick={() => { setPregunta(null); setMensajeDePregunta(null); }}>Seguir acá</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO} onClick={() => void seguir(false)}>
              {pregunta.tipo === "salir" ? "Salir sin guardar" : "Cambiar sin guardar"}
            </button>
            <button type="button" className={BOTON} onClick={() => void seguir(true)} disabled={guardado.estado === "guardando"}>
              {pregunta.tipo === "salir" ? "Guardar y salir" : "Guardar y cambiar"}
            </button>
          </div>
        </Dialogo>
      )}
      {pregunta?.tipo === "descartar" && (
        <Dialogo titulo="Descartar el borrador guardado" onCerrar={() => setPregunta(null)}>
          <p className="text-sm leading-relaxed text-ink-2">
            Se borra el borrador de la cara {abierta.cara}{vigente ? ` y vuelve a verse la versión ${vigente.numero}, que sigue vigente` : ""}.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BOTON} onClick={() => setPregunta(null)}>Dejarlo así</button>
            <button type="button" className={BOTON_PELIGRO} style={ESTILO_PELIGRO}
              onClick={async () => { if (await st().descartarBorrador()) setPregunta(null); }}>Sí, descartarlo</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/** «Quién publica» (sólo quien administra): sólo administración, o también el equipo. */
function QuienPublica({ onListo }: { onListo: () => void }) {
  const datos = usePlanograma((s) => s.datos);
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actual = datos?.permisos.quien_publica ?? "admin";
  const poner = async (q: API.QuienPublica) => {
    if (q === actual || haciendo) return;
    setHaciendo(true);
    setError(null);
    try {
      await API.ponerQuienPublica(q);
      await usePlanograma.getState().recargar();
      onListo();
    } catch (e) {
      setError(describeError(e, "No se pudo cambiar."));
    } finally {
      setHaciendo(false);
    }
  };
  return (
    <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2" data-quien-publica>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2"><Users size={14} strokeWidth={1.75} aria-hidden />Quién planifica y publica</p>
      <div role="radiogroup" aria-label="Quién planifica y publica" className="mt-1.5 grid grid-cols-2 rounded-lg border border-line p-0.5">
        {([["admin", "Sólo administración"], ["equipo", "También el equipo"]] as const).map(([q, t]) => (
          <button key={q} type="button" role="radio" aria-checked={actual === q} disabled={haciendo} onClick={() => void poner(q)}
            className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold ${actual === q ? "bg-surface-3 text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>{t}</button>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-ink-3">El equipo planifica sólo los muebles que no se venden.</p>
      {error && <p role="alert" className="mt-1 text-[11px]" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{error}</p>}
    </div>
  );
}
