import { useEffect, useMemo, useState } from "react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { claseDe, concordancia, divisionDe } from "../utils/partes";
import {
  aplicarATodos, bahiasMaximas, cambioParaDividir, conPartes, divisionSinFijar, divisionesDe, partesConEstado,
  piezasDeLaFamilia, puertasDibujadas, revisarCambioDePartes, tramosDibujados, tramosQueEntran, type CambioDePartes,
} from "../utils/partesDelMueble";

/**
 * «Cómo se vende» un mueble que se puede vender por partes, en el panel del
 * plano 2D y en el del Editor 3D: el MISMO componente en los dos, como «Alto,
 * entrepaños y módulo».
 *
 * La nevera de puertas, entera o por puertas; el mural, la góndola, la nevera
 * abierta y la de vegetales, enteros o por tramos; la góndola y la punta,
 * enteras o por entrepaños. Elegir una forma le escribe al mueble
 * `partes.division` y su cuenta —la que se dibuja hoy—: desde ahí Vender
 * ofrece «Entera · TR1 · TR2…» y el mueble se vende entero o por partes, nunca
 * las dos en las mismas fechas. Una sola forma a la vez: elegir otra reemplaza
 * la anterior. Sin elegir nada, se vende entero, como siempre: lo ya colocado
 * no cambia solo.
 *
 * Escribe en el store (`conPartes`, sobre `partes` entera), no por la vuelta
 * de un editor. Antes revisa lo vendido con el mapa crudo de la base
 * (`estadoComercial`: la fusión no cambia el mueble cuando se vende una
 * parte): con una parte vendida no cambia la cantidad ni la forma
 * (`revisarCambioDePartes`). No nombra a nadie: dice qué parte está vendida,
 * no de quién ni hasta cuándo. Sólo un administrador lo cambia; los demás lo
 * leen.
 *
 * Y las PIEZAS de lo que nunca se vende entero (paso 3): la caja, «Bahías de
 * impulso que se venden» (0 a 4, de izquierda a derecha mirando la caja desde
 * la fila) con «Aplicar a todas las cajas de la sede»; la columna, «El forro
 * se vende». Sin piezas, la caja y la columna no ofrecen nada, como siempre.
 */
export function PartesDelMueble({ id, puedeEditar }: { id: string; puedeEditar: boolean }) {
  const f = useFixtureStore((s) => selectFixtures(s).find((x) => x.id === id));
  const sede = useFixtureStore((s) => s.sede);
  const estado = useFixtureStore((s) => s.estadoComercial);
  const [problema, setProblema] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; cambio: CambioDePartes } | null>(null);
  const [cuenta, setCuenta] = useState("");

  const division = f ? divisionDe(f) : null;
  // La cantidad que se escribe en el campo: las puertas o los tramos (los
  // entrepaños se escriben en «Entrepaños», arriba: son geometría).
  const campo = division?.clase === "puertas" || division?.clase === "tramos" ? division.clase : null;
  const guardada = campo && f ? (f.partes?.[campo] ?? null) : null;
  useEffect(() => {
    setCuenta(typeof guardada === "number" ? String(guardada) : "");
    setProblema(null);
    setAviso(null);
  }, [id, guardada]);

  const partes = useMemo(() => (f ? partesConEstado(f, estado, sede) : []), [f, estado, sede]);
  const [bahias, setBahias] = useState("");
  const bahiasGuardadas = f?.partes?.bahias ?? null;
  useEffect(() => { setBahias(typeof bahiasGuardadas === "number" ? String(bahiasGuardadas) : ""); }, [id, bahiasGuardadas]);
  const [enTodas, setEnTodas] = useState<string | null>(null);
  useEffect(() => { setEnTodas(null); }, [id]);
  if (!f) return null;
  const formas = divisionesDe(f.type);
  const piezas = piezasDeLaFamilia(f.type);
  if (formas.length === 0 && piezas.length === 0) return null;
  const sinFijar = divisionSinFijar(f);
  const clase = division ? claseDe(division.clase)! : null;

  function escribir(cambio: CambioDePartes) {
    const st = useFixtureStore.getState();
    st.commit(conPartes(selectFixtures(st), id, cambio));
  }

  function proponer(cambio: CambioDePartes) {
    if (!f || !puedeEditar) return;
    setProblema(null);
    setEnTodas(null);
    const r = revisarCambioDePartes(f, cambio, estado, sede);
    if (r.bloqueo) {
      setProblema(r.bloqueo);
      setCuenta(typeof guardada === "number" ? String(guardada) : "");
      setBahias(typeof bahiasGuardadas === "number" ? String(bahiasGuardadas) : "");
      return;
    }
    if (r.aviso) { setAviso({ texto: r.aviso, cambio }); return; }
    escribir(cambio);
  }

  /** Las bahías de impulso de la caja: vacío o 0 es ninguna (`null`). */
  function cambiarBahias() {
    if (!f) return;
    const texto = bahias.trim();
    const n = texto === "" ? 0 : Number(texto);
    const volver = () => setBahias(typeof bahiasGuardadas === "number" ? String(bahiasGuardadas) : "");
    const tope = bahiasMaximas(f.type);
    if (!Number.isInteger(n) || n < 0 || n > tope) {
      setProblema(`Las bahías de impulso van de 1 a ${tope}; vacío o 0 es que la caja no vende ninguna.`);
      volver();
      return;
    }
    if ((n || null) === bahiasGuardadas) { volver(); return; }
    proponer({ bahias: n || null });
  }

  /** «Aplicar a todas las cajas de la sede»: lo de esta, en las demás, menos
   *  las que tienen una pieza vendida (se dice cuáles). */
  function aplicarEnTodas(cambio: CambioDePartes, plural: string) {
    if (!f || !puedeEditar) return;
    const st = useFixtureStore.getState();
    const r = aplicarATodos(selectFixtures(st), f.type, cambio, estado, sede);
    if (r.aplicados.length) st.commit(r.fixtures);
    setEnTodas(
      (r.aplicados.length ? `Quedó igual en ${r.aplicados.length} ${plural}.` : `Las demás ${plural} ya estaban así.`)
      + (r.saltados.length ? ` No se tocó ${r.saltados.join(", ")}: tiene${r.saltados.length > 1 ? "n" : ""} algo vendido que se movería.` : ""),
    );
  }

  /** Elegir una forma de vender (o «Entera», `null`). Queda escrito lo que se
   *  dibuja hoy: la cuenta pasa a ser del mueble y no cambia si mañana se
   *  estira. */
  function elegir(forma: string | null) {
    if (!f) return;
    if (forma === null) { if (division || sinFijar) proponer({ division: null }); return; }
    if (division?.clase === forma) return;
    const r = cambioParaDividir(f, forma);
    if ("problema" in r) { setProblema(r.problema); return; }
    proponer(r.cambio);
  }

  function cambiarCuenta() {
    if (!f || !campo || !clase) return;
    const n = Number(cuenta.trim());
    const volver = () => setCuenta(typeof guardada === "number" ? String(guardada) : "");
    if (cuenta.trim() === "" || !Number.isInteger(n)) { volver(); return; }
    if (n === guardada) return;
    const tope = campo === "tramos" ? tramosQueEntran(f) : 6;
    if (n < clase.minimo || n > tope) {
      setProblema(campo === "tramos"
        ? `Los tramos van de ${clase.minimo} a ${tope} en este ancho (uno cada 60 cm como mínimo). Para venderlo entero, elegí «Entera».`
        : `Por ${clase.plural}, de ${clase.minimo} a ${tope}. Para dejarla de una, elegí «Entera».`);
      volver();
      return;
    }
    proponer({ [campo]: n });
  }

  /** Lo que se dibuja de cada forma hoy, para el rótulo de su botón. */
  const cuantas = (forma: string): number | null => {
    if (division?.clase === forma) return division.n;
    if (forma === "puertas") return puertasDibujadas(f);
    if (forma === "tramos") return tramosDibujados(f);
    return null;
  };

  const etiquetaCls = "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium";
  const opcion = (activa: boolean) =>
    `rounded border px-2 py-1 text-[11px] ${activa
      ? "border-accent bg-accent/15 text-dark-ink-1 font-semibold"
      : "border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"} disabled:opacity-60`;
  const formaActiva = division?.clase ?? null;
  const textoDeForma = (forma: string) => {
    const c = claseDe(forma)!;
    const n = cuantas(forma);
    return `Entera o por ${c.plural}${formaActiva === forma && n ? ` (${n})` : ""}`;
  };

  const inputCls = "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3";
  const piezasConEstado = partes.filter((p) => p.pieza);
  const seccionDePiezas = piezas.length > 0 && (
    <div className="flex flex-col gap-1.5" data-piezas={f.id}>
      {piezas.includes("bahias") && (() => {
        const c = claseDe("bahias")!;
        return (
          <>
            {puedeEditar ? (
              <label>
                <span className={etiquetaCls}>Bahías de impulso que se venden</span>
                <input type="number" step={1} min={0} max={bahiasMaximas(f.type)} className={inputCls}
                  value={bahias} placeholder="ninguna" disabled={!!aviso}
                  onChange={(e) => setBahias(e.target.value)} onBlur={cambiarBahias}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </label>
            ) : (
              <p className="text-xs text-dark-ink-2">
                {typeof bahiasGuardadas === "number" ? `${bahiasGuardadas} ${bahiasGuardadas === 1 ? c.singular : c.plural}` : `Sin ${c.plural}`}
              </p>
            )}
            <p className="text-[10px] leading-snug text-dark-ink-3" data-piezas-lista>
              {piezasConEstado.length > 0 && <>{piezasConEstado.map((p) => `${p.sufijo} · ${p.vendida ? "vendida" : "libre"}`).join("  ·  ")}. </>}
              La caja no se vende entera: cada bahía de impulso, sí, una por una, contadas de izquierda a derecha
              mirando la caja desde la fila. Vacío o 0: no vende ninguna.
            </p>
            {puedeEditar && (
              <button type="button" disabled={!!aviso} data-piezas-en-todas
                className="rounded border border-dark-line-2 px-2 py-1 text-[11px] text-dark-ink-2 hover:text-dark-ink-1 disabled:opacity-60"
                onClick={() => aplicarEnTodas({ bahias: typeof bahiasGuardadas === "number" ? bahiasGuardadas : null }, "cajas")}>
                Aplicar a todas las cajas de la sede
              </button>
            )}
          </>
        );
      })()}
      {piezas.includes("forro") && (() => {
        const tiene = f.partes?.forro === true;
        const vendido = piezasConEstado.some((p) => p.vendida);
        return (
          <>
            <label className="flex items-center gap-2 text-xs text-dark-ink-1">
              <input type="checkbox" checked={tiene} disabled={!puedeEditar || !!aviso} data-piezas-forro
                onChange={(e) => proponer({ forro: e.target.checked ? true : null })} />
              El forro se vende
            </label>
            <p className="text-[10px] leading-snug text-dark-ink-3">
              {tiene ? `FO · ${vendido ? "vendido" : "libre"}. ` : ""}
              La columna no se vende: su forro (las cuatro caras, del zócalo a dos metros), sí, como un espacio más.
            </p>
          </>
        );
      })()}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5" data-partes={f.id}>
      <span className={etiquetaCls}>Cómo se vende</span>
      {seccionDePiezas}
      {formas.length > 0 && (<>
      {puedeEditar ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cómo se vende">
          <button type="button" role="radio" aria-checked={!formaActiva} className={`flex-1 ${opcion(!formaActiva)}`}
            disabled={!!aviso} onClick={() => elegir(null)}>
            Entera
          </button>
          {formas.map((forma) => (
            <button key={forma} type="button" role="radio" aria-checked={formaActiva === forma}
              data-forma={forma} className={`flex-1 ${opcion(formaActiva === forma)}`}
              disabled={!!aviso} onClick={() => elegir(forma)}>
              {textoDeForma(forma)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-dark-ink-2">
          {division && clase ? `Entera o por ${clase.plural} (${division.n})` : "Entera"}
        </p>
      )}
      {puedeEditar && campo && clase && (
        <label>
          <span className={etiquetaCls}>{clase.plural.charAt(0).toUpperCase() + clase.plural.slice(1)}</span>
          <input type="number" step={1} min={clase.minimo} max={campo === "tramos" ? tramosQueEntran(f) : 6}
            className="w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3"
            value={cuenta} disabled={!!aviso}
            onChange={(e) => setCuenta(e.target.value)} onBlur={cambiarCuenta}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
      )}
      {division && clase && (
        <p className="text-[10px] leading-snug text-dark-ink-3" data-partes-lista>
          {partes.filter((p) => !p.pieza).map((p) => `${p.sufijo} · ${p.vendida ? `vendid${concordancia(division.clase).o}` : "libre"}`).join("  ·  ")}
          {". "}
          {clase.eje === "alto"
            ? <>Se cuentan de abajo hacia arriba: el {clase.token}1 es la base. La cantidad es la de «Entrepaños» y la base.</>
            : <>Se cuentan de izquierda a derecha mirando el frente de cada cara.</>}
          {" "}La entera y sus {clase.plural} nunca en las mismas fechas; {clase.plural} distint{concordancia(division.clase).o}s, sí.
          {" "}Un mueble se divide de una sola forma.
        </p>
      )}
      {!division && sinFijar && (
        <p className="text-[11px] leading-snug text-warning" data-partes-sin-fijar>
          Su ficha dice que se vende por {claseDe(sinFijar)!.plural}, pero falta fijar cuánt{concordancia(sinFijar).o}s:
          {" "}hasta entonces se vende entera. Elegí «Entera o por {claseDe(sinFijar)!.plural}» para fijar l{concordancia(sinFijar).o}s que se dibujan.
        </p>
      )}
      {!division && !sinFijar && (
        <p className="text-[10px] leading-snug text-dark-ink-3">
          Se vende entera. Con «Entera o por …», Vender ofrece la cara entera o cada parte, nunca las dos en las
          mismas fechas.
        </p>
      )}
      </>)}
      {enTodas && <p className="text-[11px] leading-snug text-dark-ink-2" data-piezas-resultado>{enTodas}</p>}
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
            <button onClick={() => { setAviso(null); setCuenta(typeof guardada === "number" ? String(guardada) : ""); setBahias(typeof bahiasGuardadas === "number" ? String(bahiasGuardadas) : ""); }}
              className="flex-1 rounded border border-dark-line-2 px-2 py-1 text-dark-ink-2 hover:text-dark-ink-1">
              Dejarlo como estaba
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
