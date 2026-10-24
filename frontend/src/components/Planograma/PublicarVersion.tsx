import { useState } from "react";
import { Send } from "lucide-react";
import type { ProblemaDePlanograma, VersionOut } from "../../api/planogramas";
import { usePlanograma } from "../../store/planogramaStore";
import { pct } from "../../utils/participaciones";
import { queCambia, type PiezaEnEdicion } from "../../utils/planograma";
import { BOTON, Dialogo } from "../Distribucion/LeyendaDeParticipaciones";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** «Publicar la versión N»: desde cuándo rige, hasta cuándo (opcional) y qué cambia. */
export default function PublicarVersion({ numero, vigente, antes, despues, nombre, hoy, desdeSugerido, hastaSugerido, onCerrar, onPublicada }: {
  numero: number; vigente: VersionOut | null; antes: PiezaEnEdicion[]; despues: PiezaEnEdicion[]; nombre: (id: number) => string;
  hoy: string; desdeSugerido: string; hastaSugerido: string | null;
  onCerrar: () => void; onPublicada: (n: number, desde: string) => void;
}) {
  const [desde, setDesde] = useState(desdeSugerido);
  const [conFin, setConFin] = useState(!!hastaSugerido);
  const [hasta, setHasta] = useState(hastaSugerido ?? "");
  const [haciendo, setHaciendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<ProblemaDePlanograma[]>([]);
  const cambios = queCambia(antes, despues, nombre);
  const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink-1 focus:border-accent focus:outline-none";
  const ETIQUETA = "mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink-3";
  const problema = !desde ? "Elegí desde cuándo rige." : desde < hoy ? "«Rige desde» no puede ser antes de hoy."
    : conFin && !hasta ? "Elegí hasta cuándo, o sacá «Tiene fin»." : conFin && hasta < desde ? "«Hasta» no puede ser antes de «Rige desde»." : null;
  async function publicar() {
    if (problema || haciendo) return;
    setHaciendo(true);
    setMensaje(null);
    setErrores([]);
    const r = await usePlanograma.getState().publicar(desde, conFin ? hasta : null);
    setHaciendo(false);
    if (r.ok) { onPublicada(r.numero, desde); return; }
    setMensaje(r.mensaje);
    setErrores(r.errores);
  }
  return (
    <Dialogo titulo={`Publicar la versión ${numero}`} onCerrar={onCerrar} ancho="max-w-md" cerrarAfuera={false}>
      <div className="flex flex-col gap-3 text-sm" data-publicar-version>
        <p className="text-ink-2">Pasa a ser la instrucción oficial de montaje.{vigente ? ` La versión ${vigente.numero} queda guardada en el historial.` : ""}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ETIQUETA} htmlFor="pub-desde">Rige desde</label>
            <input id="pub-desde" type="date" className={CAMPO} min={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="pub-hasta">Hasta <span className="normal-case tracking-normal">· opcional</span></label>
            {conFin ? (
              <input id="pub-hasta" type="date" className={CAMPO} min={desde || hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            ) : (
              <button type="button" className={`${BOTON} w-full`} onClick={() => setConFin(true)}>Tiene fin (una promoción)</button>
            )}
          </div>
        </div>
        {conFin && (
          <p className="text-xs text-ink-3">Al vencer, esta versión sigue vigente con un recordatorio hasta que publiques otra.
            <button type="button" className="ml-1 underline underline-offset-2 hover:text-ink-1" onClick={() => { setConFin(false); setHasta(""); }}>Sin fin</button></p>
        )}
        <div className="rounded-xl border border-line px-3 py-2.5" data-que-cambia>
          <p className="text-xs font-semibold">{vigente ? `Qué cambia contra la versión ${vigente.numero}` : "Qué se publica"}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-2">
            {(vigente ? cambios : despues.map((p) => `${nombre(p.destinoId)} · ${pct(p.pb)}.`)).map((c) => <li key={c}>{c}</li>)}
            {vigente && cambios.length === 0 && <li>Nada cambia de lugar ni de %.</li>}
          </ul>
        </div>
        {(problema || mensaje) && (
          <div role="alert" className="text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>
            <p>{problema ?? mensaje}</p>
            {errores.length > 0 && <ul className="mt-0.5 list-disc pl-4">{errores.map((e) => <li key={e.frase}>{e.frase}</li>)}</ul>}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON} onClick={onCerrar}>Volver</button>
          <button type="button" className="btn-principal inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
            disabled={!!problema || haciendo} onClick={() => void publicar()} data-confirmar-publicar>
            <Send {...ICONO} />{haciendo ? "Publicando…" : `Publicar versión ${numero}`}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
