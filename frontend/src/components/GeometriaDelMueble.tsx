import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { useOcupacionStore } from "../store/ocupacionStore";
import { getFaceImages } from "../api/files";
import {
  TIPOS_CON_GEOMETRIA, confirmadasDelResumen, conGeometria, fichaSugerida, geometriaALaVista, limitesDe, loVendidoDe, metros,
  problemaDelCambio, queCambia, revisarCambioDeGeometria,
  type AvisoDeGeometria, type CambioDeGeometria, type DatosDeParticipacion,
} from "../utils/geometriaDelMueble";
import { porParticipacion } from "../utils/partes";

/** Lo que se sabe de las participaciones de la sede para revisar un cambio de
 *  geometría (paso 5, `loVendidoDe`): la ocupación anónima (contratos y
 *  reservas vivas) y las caras con distribución confirmada (del resumen, que
 *  es de administración, como estos campos). Los dos quedan en caché en el
 *  store de lectura; lo que no se pudo leer va `null` («no se sabe»: se avisa
 *  igual). */
async function datosDeParticipacionDeLaSede(sede: string): Promise<DatosDeParticipacion> {
  const st = useOcupacionStore.getState();
  const [o, r] = await Promise.all([
    st.cargarOcupacion(sede).catch(() => null),
    st.cargarResumen({ sede }).catch(() => null),
  ]);
  return { ocupacion: o?.caras ?? null, confirmadas: confirmadasDelResumen(r) };
}

/**
 * «Alto», «Entrepaños» y «Módulo» de una góndola o una punta, en el panel del
 * plano 2D y en el del Editor 3D. Es el MISMO componente en los dos: lo que
 * se pregunta antes de mover lo vendido no puede depender de en qué editor se
 * escribió.
 *
 * Lee el mueble del store (ya fusionado con la base: sabe qué cara tiene
 * contrato) y escribe en el store con `conGeometria`, no por la vuelta de cada
 * editor: la ficha no es de ninguno de los dos (`utils/convertirPlano.ts` la
 * conserva tal cual) y los dos se resincronizan solos cuando el store cambia
 * desde afuera, como con un deshacer.
 *
 * Antes de escribir, `revisarCambioDeGeometria` (ver `utils/geometriaDelMueble.ts`):
 * con espacios internos vendidos no se cambia la cantidad de entrepaños; con
 * una cara con contrato, arte pintado o espacios vendidos, se dice qué se
 * mueve y se escribe sólo con «Cambiar igual». El arte pintado se pregunta en
 * el momento (`GET /spaces/face-images`): si no se puede saber, se avisa igual.
 *
 * Los campos vacíos son «la cuenta de siempre»; la ficha del modelo, si la
 * tiene, aparece como sugerencia.
 */
/** Las clases de cada papel, en el cajón oscuro del Editor 3D (siempre oscuro)
 *  y en el tema de la app (el panel del Plano desde el rediseño, PR 3: sigue
 *  el tema claro u oscuro). Escritas enteras: Tailwind genera lo que lee. */
const CLASES = {
  oscuro: {
    input: "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3 transition-colors disabled:opacity-60",
    etiqueta: "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium",
    texto: "text-xs text-dark-ink-2",
    nota: "text-[10px] leading-snug text-dark-ink-3",
    aviso: "rounded border border-warning/60 bg-warning/10 p-2 text-[11px] leading-snug text-dark-ink-1",
    si: "flex-1 rounded border border-warning/60 bg-warning/20 px-2 py-1 font-semibold text-dark-ink-1 hover:bg-warning/30",
    no: "flex-1 rounded border border-dark-line-2 px-2 py-1 text-dark-ink-2 hover:text-dark-ink-1",
  },
  tema: {
    input: "w-full h-8 rounded-lg border border-[color:var(--brd-control)] bg-surface px-2 text-[12.5px] font-mono tabular-nums text-ink-1 focus:border-ink-1 focus:outline-none placeholder:text-ink-4 transition-colors disabled:opacity-60",
    etiqueta: "mb-1 block text-[11.5px] text-ink-3",
    texto: "text-[12.5px] text-ink-2",
    nota: "text-[11.5px] leading-snug text-ink-3",
    aviso: "rounded-lg border border-entra-100 bg-entra-50 p-2.5 text-[12px] leading-snug text-ink-1",
    si: "flex-1 rounded-lg border border-entra-100 bg-surface px-2 py-1.5 font-semibold text-ink-1 hover:border-ink-3",
    no: "flex-1 rounded-lg border border-line px-2 py-1.5 text-ink-2 hover:text-ink-1",
  },
} as const;

export function GeometriaDelMueble({ id, puedeEditar, enElTema = false, antesDelAlto }: {
  id: string; puedeEditar: boolean;
  /** Con los colores del tema de la app (el panel del Plano) y no los del
   *  cajón oscuro (el Editor 3D, que es oscuro siempre). Además: los
   *  entrepaños con − y +, y «Alto» en el renglón de las medidas. */
  enElTema?: boolean;
  /** Lo que va antes de «Alto» en ese renglón: el ancho y el fondo del Plano
   *  («Ancho × Prof. × Alto», en una fila). Sólo con `enElTema`. */
  antesDelAlto?: React.ReactNode;
}) {
  const f = useFixtureStore((s) => selectFixtures(s).find((x) => x.id === id));
  const sede = useFixtureStore((s) => s.sede);
  // El mapa CRUDO de la base: vender una parte (un entrepaño, un tramo) no
  // cambia el mueble fusionado, y con un entrepaño vendido la cantidad de
  // entrepaños no se toca.
  const estado = useFixtureStore((s) => s.estadoComercial);

  const [alto, setAlto] = useState("");
  const [entrepanos, setEntrepanos] = useState("");
  const [modulo, setModulo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ cambio: CambioDeGeometria; aviso: AvisoDeGeometria } | null>(null);
  const [revisando, setRevisando] = useState(false);

  // Lo guardado manda: al cambiar de mueble, o si cambió desde afuera
  // (deshacer, otro equipo), el borrador vuelve a lo que hay.
  const h0 = f?.h;
  const e0 = f?.entrepanos;
  const m0 = f?.modulo;
  const volver = () => {
    setAlto(h0 !== undefined ? String(Math.round(h0 * 100) / 100) : "");
    setEntrepanos(typeof e0 === "number" ? String(e0) : "");
    setModulo(typeof m0 === "number" ? String(m0) : "");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { volver(); setPendiente(null); setProblema(null); }, [id, h0, e0, m0]);

  const vista = useMemo(() => (f ? geometriaALaVista(f) : null), [f]);
  const ficha = useMemo(() => (f ? fichaSugerida(f) : {}), [f]);

  if (!f || !vista || !TIPOS_CON_GEOMETRIA.has(f.type)) return null;
  const lim = limitesDe(f.type);

  /** Escribe en el store, sobre el plano de AHORA (no el de cuando se abrió
   *  el aviso). Entra al historial: Ctrl+Z lo deshace, y el deshacer se
   *  guarda (lo que se va viaja `null`: `conFichaQuitada` en el store). */
  function escribir(cambio: CambioDeGeometria) {
    const st = useFixtureStore.getState();
    st.commit(conGeometria(selectFixtures(st), id, cambio));
  }

  /** Lo que se tecleó en un campo, como cambio; `undefined` si no se puede leer.
   *  `dado`: lo que puso un botón (− y + de los entrepaños) en el mismo clic,
   *  antes de que el borrador se entere. */
  function leer(campo: "h" | "entrepanos" | "modulo", dado?: string): CambioDeGeometria | undefined {
    const crudo = (dado ?? (campo === "h" ? alto : campo === "entrepanos" ? entrepanos : modulo)).trim().replace(",", ".");
    if (campo === "h") {
      const n = Number(crudo);
      return crudo && Number.isFinite(n) ? { h: n } : undefined;
    }
    if (crudo === "") return { [campo]: null };
    const n = Number(crudo);
    return Number.isFinite(n) ? { [campo]: n } : undefined;
  }

  async function proponer(campo: "h" | "entrepanos" | "modulo", dado?: string) {
    if (!f || !puedeEditar || revisando) return;
    setProblema(null);
    const cambio = leer(campo, dado);
    if (!cambio) { setProblema("Ese número no se entiende."); volver(); return; }
    const malo = problemaDelCambio(f, cambio);
    if (malo) { setProblema(malo); volver(); return; }
    // Sin cambio de verdad no se pregunta nada (ni al servidor).
    if (queCambia(f, cambio).length === 0) { volver(); return; }
    setRevisando(true);
    let conArte: ReadonlySet<string> | null;
    try {
      conArte = new Set((await getFaceImages()).map((r) => r.code.trim().toUpperCase()));
    } catch {
      conArte = null;
    } finally {
      setRevisando(false);
    }
    // Una cara por participación: con lo que se sabe de sus participaciones
    // (sin esto decía «No se pudo revisar si la cara A tiene participaciones…»
    // aunque se pudiera saber).
    let participaciones: DatosDeParticipacion | undefined;
    if (porParticipacion(f)) {
      setRevisando(true);
      try { participaciones = await datosDeParticipacionDeLaSede(sede); } finally { setRevisando(false); }
    }
    const r = revisarCambioDeGeometria(f, cambio, loVendidoDe(f, sede, conArte, estado, participaciones));
    if (r.bloqueo) { setProblema(r.bloqueo); volver(); return; }
    if (r.aviso) { setPendiente({ cambio, aviso: r.aviso }); return; }
    escribir(cambio);
  }

  const alSalir = (campo: "h" | "entrepanos" | "modulo") => () => { void proponer(campo); };
  // Enter confirma saliendo del campo (el `onBlur` propone); Esc vuelve a lo guardado.
  const conEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
    if (e.key === "Escape") { volver(); setProblema(null); }
  };

  const cl = enElTema ? CLASES.tema : CLASES.oscuro;
  const inputCls = cl.input;
  const etiquetaCls = cl.etiqueta;
  /** − y + de los entrepaños (el panel del Plano): desde lo guardado o la cuenta
   *  de siempre, dentro de los límites, por la MISMA revisión que el campo. */
  const pasoDeEntrepanos = (d: -1 | 1) => {
    const base = typeof e0 === "number" ? e0 : vista.entrepanos;
    const n = Math.min(lim.entrepanos[1], Math.max(lim.entrepanos[0], base + d));
    if (n === base) return;
    setEntrepanos(String(n));
    void proponer("entrepanos", String(n));
  };

  if (!puedeEditar) {
    return (
      <p className={cl.texto} data-geometria={f.id}>
        {metros(f.h)} m · la base y {vista.entrepanos} {vista.entrepanos === 1 ? "entrepaño" : "entrepaños"} con producto{vista.techo ? " (y el techo)" : ""} · {vista.modulos} {vista.modulos === 1 ? "módulo" : "módulos"} de {metros(vista.anchoDeModulo)} m
      </p>
    );
  }

  const campoAlto = (
    <label>
      <span className={etiquetaCls}>Alto (m)</span>
      <input type="number" step={0.05} min={lim.alto[0]} max={lim.alto[1]} className={inputCls}
        value={alto} disabled={!!pendiente || revisando}
        placeholder={ficha.h !== undefined ? String(ficha.h) : undefined}
        onChange={(e) => setAlto(e.target.value)} onBlur={alSalir("h")} onKeyDown={conEnter} />
    </label>
  );
  const campoEntrepanos = (
    <input type="number" step={1} min={lim.entrepanos[0]} max={lim.entrepanos[1]} className={inputCls}
      value={entrepanos} disabled={!!pendiente || revisando}
      placeholder={ficha.entrepanos !== undefined ? String(ficha.entrepanos) : `auto (${vista.entrepanos})`}
      onChange={(e) => setEntrepanos(e.target.value)} onBlur={alSalir("entrepanos")} onKeyDown={conEnter} />
  );
  const bloqueado = !!pendiente || revisando;

  return (
    <div className={enElTema ? "flex flex-col gap-2" : "flex flex-col gap-1.5"} data-geometria={f.id}>
      {enElTema && (
        // «Ancho × Prof. × Alto», en una fila (panel B, pestaña Medidas).
        <div className="p2-tri" data-medidas-en-fila>{antesDelAlto}{antesDelAlto && <span className="p2-x" aria-hidden>×</span>}{campoAlto}</div>
      )}
      <div className={enElTema ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
        {!enElTema && campoAlto}
        <label>
          <span className={etiquetaCls}>Entrepaños</span>
          {enElTema ? (
            <span className="p2-paso" data-entrepanos-paso>
              <button type="button" className="p2-icobtn" title="Un entrepaño menos" aria-label="Un entrepaño menos"
                disabled={bloqueado} onClick={() => pasoDeEntrepanos(-1)}><Minus size={16} strokeWidth={1.75} aria-hidden /></button>
              {campoEntrepanos}
              <button type="button" className="p2-icobtn" title="Un entrepaño más" aria-label="Un entrepaño más"
                disabled={bloqueado} onClick={() => pasoDeEntrepanos(1)}><Plus size={16} strokeWidth={1.75} aria-hidden /></button>
            </span>
          ) : campoEntrepanos}
        </label>
        <label>
          <span className={etiquetaCls}>Módulo (m)</span>
          {/* Vendida por tramos, el corrido se parte en ESOS tramos iguales:
              el módulo sale del ancho entre los tramos y no se escribe. */}
          <input type="number" step={0.05} min={lim.modulo[0]} max={lim.modulo[1]} className={inputCls}
            value={vista.porTramos ? vista.anchoDeModulo.toFixed(2) : modulo} disabled={!!pendiente || revisando || vista.porTramos}
            title={vista.porTramos ? "Se vende por tramos: el módulo sale del ancho y los tramos («Cómo se vende»)." : undefined}
            placeholder={ficha.modulo !== undefined ? String(ficha.modulo) : "auto"}
            onChange={(e) => setModulo(e.target.value)} onBlur={alSalir("modulo")} onKeyDown={conEnter} />
        </label>
      </div>
      <p className={cl.nota}>
        Se dibujan la base y {vista.entrepanos} {vista.entrepanos === 1 ? "entrepaño" : "entrepaños"} con producto
        {vista.techo ? ", más uno de techo sin producto" : ""}{vista.entrepanosGuardados ? "" : " (la cuenta de siempre)"},
        en {vista.modulos} {vista.modulos === 1 ? "módulo" : "módulos"} de {metros(vista.anchoDeModulo)} m
        {vista.porTramos ? " (los tramos en que se vende)" : vista.moduloGuardado ? "" : " (la cuenta de siempre)"}. Vacío: la cuenta de siempre.
        {(ficha.entrepanos !== undefined || ficha.modulo !== undefined) && (
          <> Su ficha dice {[
            ficha.entrepanos !== undefined ? `${ficha.entrepanos} entrepaños` : "",
            ficha.modulo !== undefined ? `módulo de ${metros(ficha.modulo)} m` : "",
          ].filter(Boolean).join(" y ")}.</>
        )}
      </p>
      {revisando && <p className={cl.nota}>Revisando lo vendido…</p>}
      {problema && (
        <p className="text-[11px] leading-snug text-danger" data-geometria-rechazo>{problema}</p>
      )}
      {pendiente && (
        <div role="alertdialog" aria-label="Esto mueve lo vendido" data-geometria-aviso
          className={cl.aviso}>
          <p className="font-semibold">{pendiente.aviso.titulo}</p>
          <ul className="mt-1 list-disc pl-4">
            {pendiente.aviso.lineas.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => { const c = pendiente.cambio; setPendiente(null); escribir(c); }}
              className={cl.si}
            >
              Cambiar igual
            </button>
            <button
              onClick={() => { setPendiente(null); volver(); }}
              className={cl.no}
            >
              Dejarlo como estaba
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
