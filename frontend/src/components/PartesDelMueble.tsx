import { useEffect, useMemo, useState } from "react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { claseDe, divisionDe } from "../utils/partes";
import {
  conPartes, divisionesDe, partesConEstado, puertasDibujadas, revisarCambioDePartes,
  type CambioDePartes,
} from "../utils/partesDelMueble";

/**
 * «Cómo se vende» la nevera de puertas, en el panel del plano 2D y en el del
 * Editor 3D: el MISMO componente en los dos, como «Alto, entrepaños y módulo».
 *
 * Elegir «Entera o por puertas» le escribe al mueble `partes.division` y sus
 * puertas: desde ahí Vender ofrece «Entera · PU1 · PU2…» y la nevera se vende
 * entera o por puertas, nunca las dos en las mismas fechas. Sin elegirlo, la
 * nevera se vende entera, como siempre: lo ya colocado no cambia solo.
 *
 * Escribe en el store (`conPartes`, sobre `partes` entera), no por la vuelta
 * de un editor. Antes revisa lo vendido con el mapa crudo de la base
 * (`estadoComercial`: la fusión no cambia el mueble cuando se vende una
 * puerta): con una puerta vendida no cambia la cantidad de puertas ni deja de
 * venderse por puertas (`revisarCambioDePartes`). No nombra a nadie: dice qué
 * puerta está vendida, no de quién ni hasta cuándo. Sólo un administrador lo
 * cambia; los demás lo leen.
 */
export function PartesDelMueble({ id, puedeEditar }: { id: string; puedeEditar: boolean }) {
  const f = useFixtureStore((s) => selectFixtures(s).find((x) => x.id === id));
  const sede = useFixtureStore((s) => s.sede);
  const estado = useFixtureStore((s) => s.estadoComercial);
  const [problema, setProblema] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; cambio: CambioDePartes } | null>(null);
  const [puertas, setPuertas] = useState("");

  const p0 = f?.partes?.puertas;
  useEffect(() => {
    setPuertas(typeof p0 === "number" ? String(p0) : "");
    setProblema(null);
    setAviso(null);
  }, [id, p0]);

  const partes = useMemo(() => (f ? partesConEstado(f, estado, sede) : []), [f, estado, sede]);
  if (!f) return null;
  const formas = divisionesDe(f.type);
  if (formas.length === 0) return null;
  const division = divisionDe(f);
  const clase = claseDe(formas[0])!;
  const dibujadas = puertasDibujadas(f);

  function escribir(cambio: CambioDePartes) {
    const st = useFixtureStore.getState();
    st.commit(conPartes(selectFixtures(st), id, cambio));
  }

  function proponer(cambio: CambioDePartes) {
    if (!f || !puedeEditar) return;
    setProblema(null);
    const r = revisarCambioDePartes(f, cambio, estado, sede);
    if (r.bloqueo) { setProblema(r.bloqueo); setPuertas(typeof p0 === "number" ? String(p0) : ""); return; }
    if (r.aviso) { setAviso({ texto: r.aviso, cambio }); return; }
    escribir(cambio);
  }

  function porPartes(si: boolean) {
    if (si) {
      if (dibujadas < clase.minimo) {
        setProblema(`Una nevera de una ${clase.singular} se vende entera: para venderla por ${clase.plural}, que tenga ${clase.minimo} o más.`);
        return;
      }
      // Queda escrito lo que se dibuja: la cuenta de las puertas pasa a ser
      // de la nevera, y no cambia si mañana se estira.
      proponer({ division: formas[0], puertas: dibujadas });
    } else {
      proponer({ division: null });
    }
  }

  function cambiarPuertas() {
    const n = Number(puertas.trim());
    if (puertas.trim() === "" || !Number.isInteger(n)) { setPuertas(typeof p0 === "number" ? String(p0) : ""); return; }
    if (n === p0) return;
    if (n < 1 || n > 6) { setProblema("Las puertas van de 1 a 6."); return; }
    if (division && n < clase.minimo) {
      setProblema(`Por ${clase.plural}, la nevera tiene ${clase.minimo} o más: para dejarla de una, elegí «Entera».`);
      return;
    }
    proponer({ puertas: n });
  }

  const etiquetaCls = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";
  const opcion = (activa: boolean) =>
    `flex-1 rounded border px-2 py-1 text-[11px] ${activa
      ? "border-accent bg-accent/15 text-dark-ink-1 font-semibold"
      : "border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"} disabled:opacity-60`;

  return (
    <div className="flex flex-col gap-1.5" data-partes={f.id}>
      <span className={etiquetaCls}>Cómo se vende</span>
      {puedeEditar ? (
        <div className="flex gap-1.5" role="radiogroup" aria-label="Cómo se vende">
          <button type="button" role="radio" aria-checked={!division} className={opcion(!division)}
            disabled={!!aviso} onClick={() => division && porPartes(false)}>
            Entera
          </button>
          <button type="button" role="radio" aria-checked={!!division} className={opcion(!!division)}
            disabled={!!aviso} onClick={() => !division && porPartes(true)}>
            Entera o por {clase.plural}{division ? ` (${division.n})` : ""}
          </button>
        </div>
      ) : (
        <p className="text-xs text-dark-ink-2">
          {division ? `Entera o por ${clase.plural} (${division.n})` : "Entera"}
        </p>
      )}
      {puedeEditar && (
        <label>
          <span className={etiquetaCls}>Puertas</span>
          <input type="number" step={1} min={division ? clase.minimo : 1} max={6}
            className="w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3"
            value={puertas} disabled={!!aviso} placeholder={`auto (${dibujadas})`}
            onChange={(e) => setPuertas(e.target.value)} onBlur={cambiarPuertas}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
      )}
      {division && (
        <p className="text-[10px] leading-snug text-dark-ink-3" data-partes-lista>
          {partes.map((p) => `${p.sufijo} · ${p.vendida ? "vendida" : "libre"}`).join("  ·  ")}
          {". "}Se cuentan de izquierda a derecha mirando el frente. La entera y sus {clase.plural} nunca en
          las mismas fechas; {clase.plural} distintas, sí.
        </p>
      )}
      {!division && (
        <p className="text-[10px] leading-snug text-dark-ink-3">
          Se vende entera. Con «Entera o por {clase.plural}», Vender ofrece la nevera o cada {clase.singular}.
        </p>
      )}
      {problema && <p className="text-[11px] leading-snug text-danger" data-partes-rechazo>{problema}</p>}
      {aviso && (
        <div role="alertdialog" aria-label="Esto cambia lo vendido" data-partes-aviso
          className="rounded border border-warning/60 bg-warning/10 p-2 text-[11px] leading-snug text-dark-ink-1">
          <p>{aviso.texto}</p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => { const c = aviso.cambio; setAviso(null); escribir(c); }}
              className="flex-1 rounded border border-warning/60 bg-warning/20 px-2 py-1 font-semibold text-dark-ink-1 hover:bg-warning/30">
              Cambiar igual
            </button>
            <button onClick={() => { setAviso(null); setPuertas(typeof p0 === "number" ? String(p0) : ""); }}
              className="flex-1 rounded border border-dark-line-2 px-2 py-1 text-dark-ink-2 hover:text-dark-ink-1">
              Dejarlo como estaba
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
