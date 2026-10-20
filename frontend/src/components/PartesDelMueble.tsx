import { useEffect, useMemo, useState } from "react";
import { Columns3, Percent, Rows3, Square, type LucideIcon } from "lucide-react";
import { useFixtureStore, selectFixtures } from "../store/fixtureStore";
import { claseDe, concordancia, divisionDe, porParticipacion } from "../utils/partes";
import {
  aplicarATodos, aplicarLoDeLaFicha, bahiasMaximas, cambioParaDividir, colocadosConLaFicha, conPartes, divisionSinFijar,
  formasDeVenderDe, loDeLaFicha, partesConEstado, piezasDeLaFamilia, POR_PARTICIPACION, puertasDibujadas, revisarCambioDePartes,
  seCuentaEnElPlano, textoDeAplicarATodos, tramosDibujados, tramosQueEntran, type CambioDePartes, type DatosDeParticipacion,
} from "../utils/partesDelMueble";
import { useFichasPropias } from "../store/fichasPropias";
import { useAuthStore } from "../store/authStore";
import { claveDeSede, useOcupacionStore } from "../store/ocupacionStore";

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
 *
 * Y lo que dice SU FICHA (paso 4): un mueble colocado desde un modelo de
 * RECABRA o desde una ficha propia que dice cómo se vende («por puertas», «2
 * bahías de impulso») y que hoy se vende de otra forma —se colocó antes de
 * que la ficha lo dijera— muestra «Su ficha … dice: …» con «Usar lo de la
 * ficha», y «Aplicar a los N colocados con esta ficha en la sede», que salta
 * los que tienen algo vendido. Lo colocado no cambia solo: espera el clic, y
 * pasa por las mismas revisiones que cualquier cambio de este panel.
 *
 * Y «Por participación» (participaciones de cara): en las familias con
 * superficie comercializable, la cara se reparte entre proveedores por
 * porcentaje y se carga en el Editor 3D → Distribución. Las mismas guardas
 * que el servidor al guardar el plano, dichas antes: no pasa con espacios
 * internos vendidos vivos, y no deja de venderse así con participaciones
 * vivas (la ocupación anónima de la sede, que incluye las reservas
 * provisionales). El cambio se manda enseguida (`flushPending`): si no, Vender
 * y Distribución todavía ven la cara como se vendía antes.
 */
/** Las clases de cada papel: el cajón oscuro del Editor 3D (siempre oscuro) y
 *  el tema de la app (el panel del Plano, rediseño PR 3). Escritas enteras:
 *  Tailwind genera lo que lee. */
const CLASES = {
  oscuro: {
    etiqueta: "mb-0.5 block text-[10px] uppercase tracking-widest text-dark-ink-3 font-medium",
    input: "w-full border-0 border-b border-dark-line-2 bg-transparent rounded-none px-0 py-1 text-sm text-dark-ink-1 focus:border-accent focus:outline-none placeholder:text-dark-ink-3",
    texto: "text-xs text-dark-ink-2",
    nota: "text-[10px] leading-snug text-dark-ink-3",
    tinta: "text-dark-ink-1",
    leve: "text-[11px] leading-snug text-dark-ink-2",
    boton: "rounded border border-dark-line-2 px-2 py-1 text-[11px] text-dark-ink-2 hover:text-dark-ink-1 disabled:opacity-60",
    acento: "rounded border border-accent/60 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-dark-ink-1 hover:bg-accent/20 disabled:opacity-60",
    caja: "flex flex-col gap-1 rounded border border-dark-line-2 p-2",
    aviso: "rounded border border-warning/60 bg-warning/10 p-2 text-[11px] leading-snug text-dark-ink-1",
    si: "flex-1 rounded border border-warning/60 bg-warning/20 px-2 py-1 font-semibold text-dark-ink-1 hover:bg-warning/30",
    no: "flex-1 rounded border border-dark-line-2 px-2 py-1 text-dark-ink-2 hover:text-dark-ink-1",
  },
  tema: {
    etiqueta: "mb-1 block text-[11.5px] text-ink-3",
    input: "w-full h-8 rounded-lg border border-[color:var(--brd-control)] bg-surface px-2 text-[12.5px] font-mono tabular-nums text-ink-1 focus:border-ink-1 focus:outline-none placeholder:text-ink-4",
    texto: "text-[12.5px] text-ink-2",
    nota: "text-[11.5px] leading-snug text-ink-3",
    tinta: "text-ink-1",
    leve: "text-[12px] leading-snug text-ink-2",
    boton: "rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2 hover:text-ink-1 hover:border-line-strong disabled:opacity-60",
    acento: "rounded-lg border border-ink-1 bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-1 hover:bg-surface-2 disabled:opacity-60",
    caja: "flex flex-col gap-1.5 rounded-lg border border-line p-2.5",
    aviso: "rounded-lg border border-entra-100 bg-entra-50 p-2.5 text-[12px] leading-snug text-ink-1",
    si: "flex-1 rounded-lg border border-entra-100 bg-surface px-2 py-1.5 font-semibold text-ink-1 hover:border-ink-3",
    no: "flex-1 rounded-lg border border-line px-2 py-1.5 text-ink-2 hover:text-ink-1",
  },
} as const;

/** El ícono de cada forma en «Cómo» (la hoja de íconos, «Línea del
 *  contrato»): la cara entera, partes de lado a lado, repisas, porcentaje. */
const ICONO_DE_FORMA: Record<string, LucideIcon> = {
  puertas: Columns3, tramos: Columns3, bahias: Columns3, entrepanos: Rows3, [POR_PARTICIPACION]: Percent,
};

export function PartesDelMueble({ id, puedeEditar, sinTitulo = false, enElTema = false }: {
  id: string; puedeEditar: boolean;
  /** Sin su «Cómo se vende» arriba: el panel del plano 2D ya lo pone en el
   *  rótulo de su campo, y salía dos veces seguidas. */
  sinTitulo?: boolean;
  /** Con los colores del tema de la app (el panel del Plano) y no los del
   *  cajón oscuro del Editor 3D; y «Cómo» como un control de tres opciones con
   *  su ícono, en el que la elegida dice su nombre. Las mismas revisiones. */
  enElTema?: boolean;
}) {
  const f = useFixtureStore((s) => selectFixtures(s).find((x) => x.id === id));
  const sede = useFixtureStore((s) => s.sede);
  const estado = useFixtureStore((s) => s.estadoComercial);
  // Lo anónimo de las participaciones de la sede (contratos y reservas que
  // siguen vivos): con eso se dice antes que una cara con participaciones
  // vivas no deja de venderse así. Se lee si el mueble se vende así.
  const cliente = useAuthStore((s) => s.cliente) ?? "";
  const ocupacion = useOcupacionStore((s) => s.ocupacion[claveDeSede(cliente, sede)]);
  const enParticipacion = !!f && porParticipacion(f);
  useEffect(() => {
    if (enParticipacion) void useOcupacionStore.getState().cargarOcupacion(sede);
  }, [enParticipacion, sede, cliente]);
  const datosDeParticipacion: DatosDeParticipacion = { ocupacion: ocupacion?.caras, hoy: ocupacion?.hoy };
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
  // Lo que dice su ficha: las propias llegan después del primer dibujo
  // (`useFichasPropias` vuelve a dibujar cuando llegan).
  const fichasPropias = useFichasPropias();
  const todos = useFixtureStore(selectFixtures);
  const ficha = useMemo(() => (f ? loDeLaFicha(f) : null), [f, fichasPropias]);
  const conLaFicha = useMemo(() => colocadosConLaFicha(todos, f?.modelo), [todos, f?.modelo, fichasPropias]);
  if (!f) return null;
  const formas = formasDeVenderDe(f.type);
  const piezas = piezasDeLaFamilia(f.type);
  if (formas.length === 0 && piezas.length === 0) return null;
  const sinFijar = divisionSinFijar(f);
  const clase = division ? claseDe(division.clase)! : null;

  function escribir(cambio: CambioDePartes) {
    const st = useFixtureStore.getState();
    const antes = !!f && porParticipacion(f);
    const nuevos = conPartes(selectFixtures(st), id, cambio);
    st.commit(nuevos);
    // Entrar o salir de «por participación» se manda ya: Distribución y
    // Vender le preguntan al servidor, que si no seguiría viendo la cara como
    // se vendía antes (409 «no se vende por participación»).
    const ahora = nuevos.find((x) => x.id === id);
    if (antes !== (!!ahora && porParticipacion(ahora))) void st.flushPending();
  }

  function proponer(cambio: CambioDePartes) {
    if (!f || !puedeEditar) return;
    setProblema(null);
    setEnTodas(null);
    const r = revisarCambioDePartes(f, cambio, estado, sede, datosDeParticipacion);
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
   *  las que tienen una pieza vendida (se dice cuáles; `textoDeAplicarATodos`). */
  function aplicarEnTodas(cambio: CambioDePartes, singular: string, plural: string) {
    if (!f || !puedeEditar) return;
    const st = useFixtureStore.getState();
    const r = aplicarATodos(selectFixtures(st), f.type, cambio, estado, sede);
    if (r.aplicados.length) st.commit(r.fixtures);
    setEnTodas(textoDeAplicarATodos(r, singular, plural));
  }

  /** «Aplicar a los colocados con esta ficha en la sede»: lo de su ficha en
   *  cada uno, menos los que tienen algo vendido (se dice cuáles). */
  function aplicarLaFichaEnTodos() {
    if (!f?.modelo || !puedeEditar) return;
    const st = useFixtureStore.getState();
    const r = aplicarLoDeLaFicha(selectFixtures(st), f.modelo, estado, sede);
    if (r.aplicados.length) st.commit(r.fixtures);
    setProblema(null);
    setEnTodas(
      (r.aplicados.length
        ? `Quedó como dice su ficha en ${r.aplicados.length === 1 ? "1 mueble" : `${r.aplicados.length} muebles`} (${r.aplicados.join(", ")}).`
        : "Ninguno cambió.")
      + (r.saltados.length ? ` No se tocó ${r.saltados.join(", ")}: tiene${r.saltados.length > 1 ? "n" : ""} algo vendido que se movería o cambiaría cómo se ve; se cambia${r.saltados.length > 1 ? "n" : ""} de a uno, desde su panel.` : "")
      + (r.sinPoder.length ? ` Todavía no se puede en ${r.sinPoder.join(", ")}: tiene${r.sinPoder.length > 1 ? "n" : ""} un solo módulo.` : ""),
    );
  }

  /** Elegir una forma de vender (o «Entera», `null`). Queda escrito lo que se
   *  dibuja hoy: la cuenta pasa a ser del mueble y no cambia si mañana se
   *  estira. */
  function elegir(forma: string | null) {
    if (!f) return;
    if (forma === null) { if (division || sinFijar || f.partes?.division === POR_PARTICIPACION) proponer({ division: null }); return; }
    if (division?.clase === forma) return;
    if (forma === POR_PARTICIPACION && enParticipacion) return;
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

  const cl = enElTema ? CLASES.tema : CLASES.oscuro;
  const etiquetaCls = cl.etiqueta;
  const opcion = (activa: boolean) =>
    `rounded border px-2 py-1 text-[11px] ${activa
      ? "border-accent bg-accent/15 text-dark-ink-1 font-semibold"
      : "border-dark-line-2 text-dark-ink-2 hover:text-dark-ink-1"} disabled:opacity-60`;
  const formaActiva = division?.clase ?? (enParticipacion ? POR_PARTICIPACION : null);
  const textoDeForma = (forma: string) => {
    if (forma === POR_PARTICIPACION) return "Por participación";
    const c = claseDe(forma)!;
    const n = cuantas(forma);
    return `Entera o por ${c.plural}${formaActiva === forma && n ? ` (${n})` : ""}`;
  };

  const inputCls = cl.input;
  /** El nombre corto de una forma, para «Cómo» del panel del Plano. */
  const nombreCorto = (forma: string) => {
    if (forma === POR_PARTICIPACION) return "Por participación";
    const n = cuantas(forma);
    return `Por ${claseDe(forma)!.plural}${formaActiva === forma && n ? ` (${n})` : ""}`;
  };
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
              <p className={cl.texto}>
                {typeof bahiasGuardadas === "number" ? `${bahiasGuardadas} ${bahiasGuardadas === 1 ? c.singular : c.plural}` : `Sin ${c.plural}`}
              </p>
            )}
            <p className={cl.nota} data-piezas-lista>
              {piezasConEstado.length > 0 && <>{piezasConEstado.map((p) => `${p.sufijo} · ${p.vendida ? "vendida" : "libre"}`).join("  ·  ")}. </>}
              La caja no se vende entera: cada bahía de impulso, sí, una por una, contadas de izquierda a derecha
              mirando la caja desde la fila. Vacío o 0: no vende ninguna.
            </p>
            {puedeEditar && (
              <button type="button" disabled={!!aviso} data-piezas-en-todas
                className={cl.boton}
                onClick={() => aplicarEnTodas({ bahias: typeof bahiasGuardadas === "number" ? bahiasGuardadas : null }, "caja", "cajas")}>
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
            <label className={`flex items-center gap-2 text-xs ${cl.tinta}`}>
              <input type="checkbox" checked={tiene} disabled={!puedeEditar || !!aviso} data-piezas-forro
                onChange={(e) => proponer({ forro: e.target.checked ? true : null })} />
              El forro se vende
            </label>
            <p className={cl.nota}>
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
      {!sinTitulo && <span className={etiquetaCls}>Cómo se vende</span>}
      {seccionDePiezas}
      {formas.length > 0 && (<>
      {puedeEditar && enElTema ? (
        // Panel B del Plano: «Cómo», tres botones con ícono; la elegida dice
        // su nombre (las otras lo dicen al pasar). Los mismos `elegir`.
        <div className="p2-seg p2-seg-como" role="radiogroup" aria-label="Cómo se vende">
          <button type="button" role="radio" aria-checked={!formaActiva} aria-pressed={!formaActiva}
            title="Entera" aria-label="Entera" disabled={!!aviso} onClick={() => elegir(null)}>
            <Square size={16} strokeWidth={1.75} aria-hidden />{!formaActiva && <span>Entera</span>}
          </button>
          {formas.map((forma) => {
            const Icono = ICONO_DE_FORMA[forma] ?? Columns3;
            const activa = formaActiva === forma;
            return (
              <button key={forma} type="button" role="radio" aria-checked={activa} aria-pressed={activa}
                data-forma={forma} title={textoDeForma(forma)} aria-label={nombreCorto(forma)}
                disabled={!!aviso} onClick={() => elegir(forma)}>
                <Icono size={16} strokeWidth={1.75} aria-hidden />{activa && <span>{nombreCorto(forma)}</span>}
              </button>
            );
          })}
        </div>
      ) : puedeEditar ? (
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
        <p className={cl.texto}>
          {division && clase ? `Entera o por ${clase.plural} (${division.n})` : enParticipacion ? "Por participación" : "Entera"}
        </p>
      )}
      {puedeEditar && campo && clase && (
        <label>
          <span className={etiquetaCls}>{clase.plural.charAt(0).toUpperCase() + clase.plural.slice(1)}</span>
          <input type="number" step={1} min={clase.minimo} max={campo === "tramos" ? tramosQueEntran(f) : 6}
            className={inputCls}
            value={cuenta} disabled={!!aviso}
            onChange={(e) => setCuenta(e.target.value)} onBlur={cambiarCuenta}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
      )}
      {division && clase && (
        <p className={cl.nota} data-partes-lista>
          {partes.filter((p) => !p.pieza).map((p) => `${p.sufijo} · ${p.vendida ? `vendid${concordancia(division.clase).o}` : "libre"}`).join("  ·  ")}
          {". "}
          {clase.eje === "alto"
            ? <>Se cuentan de abajo hacia arriba: el {clase.token}1 es la base. La cantidad es la de «Entrepaños» y la base.</>
            : <>Se cuentan de izquierda a derecha mirando el frente de cada cara.</>}
          {" "}La entera y sus {clase.plural} nunca en las mismas fechas; {clase.plural} distint{concordancia(division.clase).o}s, sí.
          {" "}Un mueble se divide de una sola forma.
        </p>
      )}
      {!division && sinFijar && (() => {
        // «Fijar 4 tramos, uno por módulo»: los que se dibujan hoy. Con un
        // solo módulo no hay tramos que vender: se dice que se estire.
        const fijar = cambioParaDividir(f, sinFijar);
        const c = claseDe(sinFijar)!;
        const g = concordancia(sinFijar);
        const n = "cambio" in fijar ? (fijar.cambio as Record<string, unknown>)[c.campo!] : null;
        return (
          <div className="flex flex-col gap-1" data-partes-sin-fijar>
            <p className="text-[11px] leading-snug text-warning">
              Su ficha dice que se vende por {c.plural}, pero falta fijar cuánt{g.o}s: hasta entonces se vende entera.
              {"problema" in fijar ? <> {fijar.problema}</> : null}
            </p>
            {puedeEditar && typeof n === "number" && (
              <button type="button" disabled={!!aviso} data-partes-fijar
                className={cl.acento}
                onClick={() => elegir(sinFijar)}>
                Fijar {n} {c.plural}{seCuentaEnElPlano(f.type, sinFijar) ? `, ${g.un === "un" ? "uno" : "una"} por módulo` : ""}
              </button>
            )}
          </div>
        );
      })()}
      {enParticipacion && (
        <p className={cl.nota} data-partes-participacion>
          Se vende por participación: el porcentaje de cada proveedor se carga en el Editor 3D → Distribución
          (podés darle el 100 %). Ni entera ni por partes, mientras se venda así.
        </p>
      )}
      {!enParticipacion && f.partes?.division === POR_PARTICIPACION && (
        <p className="text-[11px] leading-snug text-warning" data-partes-participacion-sin-alquilar>
          Está elegida «por participación», pero el mueble no se alquila: hasta que sea comercializable, no se vende.
        </p>
      )}
      {!division && !sinFijar && !enParticipacion && (
        <p className={cl.nota}>
          Se vende entera. Con «Entera o por …», Vender ofrece la cara entera o cada parte, nunca las dos en las
          mismas fechas.
        </p>
      )}
      </>)}
      {/* Lo que dice su ficha, si el mueble hoy se vende de otra forma. Lo
          colocado no cambia solo: espera «Usar lo de la ficha». Sólo si se
          puede usar: un mural de un solo módulo no tiene tramos que vender, y
          decirlo en cada góndola corta del plano es ruido. */}
      {ficha && !sinFijar && ficha.cambio && (
        <div className={cl.caja} data-partes-ficha>
          <p className={cl.leve}>
            Su ficha («{ficha.nombre}») dice: {ficha.texto}. Hoy se vende distinto: lo colocado no cambia solo.
          </p>
          {puedeEditar && (
            <button type="button" disabled={!!aviso} data-partes-usar-ficha
              className={cl.acento}
              onClick={() => { setEnTodas(null); proponer(ficha.cambio!); }}>
              Usar lo de la ficha
            </button>
          )}
        </div>
      )}
      {ficha && puedeEditar && conLaFicha.todos > 1 && conLaFicha.distintos > 0 && (
        <button type="button" disabled={!!aviso} data-partes-ficha-en-todos
          className={cl.boton}
          onClick={aplicarLaFichaEnTodos}>
          Aplicar lo de su ficha a los {conLaFicha.todos} colocados con ella en la sede ({conLaFicha.distintos} se venden distinto)
        </button>
      )}
      {enTodas && <p className={cl.leve} data-piezas-resultado>{enTodas}</p>}
      {problema && <p className="text-[11px] leading-snug text-danger" data-partes-rechazo>{problema}</p>}
      {aviso && (
        <div role="alertdialog" aria-label="Esto cambia lo vendido" data-partes-aviso
          className={cl.aviso}>
          <p>{aviso.texto}</p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => { const c = aviso.cambio; setAviso(null); escribir(c); }}
              className={cl.si}>
              Cambiar igual
            </button>
            <button onClick={() => { setAviso(null); setCuenta(typeof guardada === "number" ? String(guardada) : ""); setBahias(typeof bahiasGuardadas === "number" ? String(bahiasGuardadas) : ""); }}
              className={cl.no}>
              Dejarlo como estaba
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
