import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { getFaceImages } from "../api/files";
import {
  TIPOS_CON_GEOMETRIA, conGeometria, fichaSugerida, geometriaALaVista, limitesDe, loVendidoDe, metros,
  problemaDelCambio, queCambia, revisarCambioDeGeometria,
  type AvisoDeGeometria, type CambioDeGeometria,
} from "../utils/geometriaDelMueble";

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
export function GeometriaDelMueble({ id, puedeEditar }: { id: string; puedeEditar: boolean }) {
  const f = useFixtureStore((s) => selectFixtures(s).find((x) => x.id === id));
  const sede = useFixtureStore((s) => s.sede);

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
   *  el aviso). Entra al historial: Ctrl+Z lo deshace. */
  function escribir(cambio: CambioDeGeometria) {
    const st = useFixtureStore.getState();
    st.commit(conGeometria(selectFixtures(st), id, cambio));
  }

  /** Lo que se tecleó en un campo, como cambio; `undefined` si no se puede leer. */
  function leer(campo: "h" | "entrepanos" | "modulo"): CambioDeGeometria | undefined {
    const crudo = (campo === "h" ? alto : campo === "entrepanos" ? entrepanos : modulo).trim().replace(",", ".");
    if (campo === "h") {
      const n = Number(crudo);
      return crudo && Number.isFinite(n) ? { h: n } : undefined;
    }
    if (crudo === "") return { [campo]: null };
    const n = Number(crudo);
    return Number.isFinite(n) ? { [campo]: n } : undefined;
  }

  async function proponer(campo: "h" | "entrepanos" | "modulo") {
    if (!f || !puedeEditar || revisando) return;
    setProblema(null);
    const cambio = leer(campo);
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
    const r = revisarCambioDeGeometria(f, cambio, loVendidoDe(f, sede, conArte));
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

  const inputCls = "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3 transition-colors disabled:opacity-60";
  const etiquetaCls = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";

  if (!puedeEditar) {
    return (
      <p className="text-xs text-dark-ink-2" data-geometria={f.id}>
        {metros(f.h)} m · {vista.entrepanos} entrepaños y la base · {vista.modulos} {vista.modulos === 1 ? "módulo" : "módulos"} de {metros(vista.anchoDeModulo)} m
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-geometria={f.id}>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={etiquetaCls}>Alto (m)</span>
          <input type="number" step={0.05} min={lim.alto[0]} max={lim.alto[1]} className={inputCls}
            value={alto} disabled={!!pendiente || revisando}
            placeholder={ficha.h !== undefined ? String(ficha.h) : undefined}
            onChange={(e) => setAlto(e.target.value)} onBlur={alSalir("h")} onKeyDown={conEnter} />
        </label>
        <label>
          <span className={etiquetaCls}>Entrepaños</span>
          <input type="number" step={1} min={lim.entrepanos[0]} max={lim.entrepanos[1]} className={inputCls}
            value={entrepanos} disabled={!!pendiente || revisando}
            placeholder={ficha.entrepanos !== undefined ? String(ficha.entrepanos) : `auto (${vista.entrepanos})`}
            onChange={(e) => setEntrepanos(e.target.value)} onBlur={alSalir("entrepanos")} onKeyDown={conEnter} />
        </label>
        <label>
          <span className={etiquetaCls}>Módulo (m)</span>
          <input type="number" step={0.05} min={lim.modulo[0]} max={lim.modulo[1]} className={inputCls}
            value={modulo} disabled={!!pendiente || revisando}
            placeholder={ficha.modulo !== undefined ? String(ficha.modulo) : "auto"}
            onChange={(e) => setModulo(e.target.value)} onBlur={alSalir("modulo")} onKeyDown={conEnter} />
        </label>
      </div>
      <p className="text-[10px] leading-snug text-dark-ink-3">
        Se dibujan {vista.entrepanos} entrepaños y la base{vista.entrepanosGuardados ? "" : " (la cuenta de siempre)"},
        en {vista.modulos} {vista.modulos === 1 ? "módulo" : "módulos"} de {metros(vista.anchoDeModulo)} m
        {vista.moduloGuardado ? "" : " (la cuenta de siempre)"}. Vacío: la cuenta de siempre.
        {(ficha.entrepanos !== undefined || ficha.modulo !== undefined) && (
          <> Su ficha dice {[
            ficha.entrepanos !== undefined ? `${ficha.entrepanos} entrepaños` : "",
            ficha.modulo !== undefined ? `módulo de ${metros(ficha.modulo)} m` : "",
          ].filter(Boolean).join(" y ")}.</>
        )}
      </p>
      {revisando && <p className="text-[10px] text-dark-ink-3">Revisando lo vendido…</p>}
      {problema && (
        <p className="text-[11px] leading-snug text-danger" data-geometria-rechazo>{problema}</p>
      )}
      {pendiente && (
        <div role="alertdialog" aria-label="Esto mueve lo vendido" data-geometria-aviso
          className="rounded border border-warning/60 bg-warning/10 p-2 text-[11px] leading-snug text-dark-ink-1">
          <p className="font-semibold">{pendiente.aviso.titulo}</p>
          <ul className="mt-1 list-disc pl-4">
            {pendiente.aviso.lineas.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => { const c = pendiente.cambio; setPendiente(null); escribir(c); }}
              className="flex-1 rounded border border-warning/60 bg-warning/20 px-2 py-1 font-semibold text-dark-ink-1 hover:bg-warning/30"
            >
              Cambiar igual
            </button>
            <button
              onClick={() => { setPendiente(null); volver(); }}
              className="flex-1 rounded border border-dark-line-2 px-2 py-1 text-dark-ink-2 hover:text-dark-ink-1"
            >
              Dejarlo como estaba
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
