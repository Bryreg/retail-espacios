import { useEffect, useMemo, useState } from "react";
import { describeError } from "../../api/client";
import { leerCara, type CaraOut, type ResumenOut } from "../../api/participaciones";
import { useDistribucionStore } from "../../store/distribucionStore";
import { useFixtureStore } from "../../store/fixtureStore";
import { useOcupacionStore } from "../../store/ocupacionStore";
import {
  bloqueoDeLaCopia, copiarZonas, destinosEnOrden, encabezadoDeLaCopia, frasesDeLaCopia, nombreDeDestino, opcionDeEntrada, opcionesDeOrigen,
  origenDeLaCopia, rotuloDeCara, type Copia,
} from "../../utils/copiaDeZonas";
import { BOTON, Dialogo, MuestraDeEstampa, datosDeLaCara } from "./LeyendaDeParticipaciones";

/**
 * «Copiar zonas de otra cara» (fase 2 · I1; pedido §17, D20 y Caso F): el
 * diálogo que se abre desde el panel de Distribución de la cara de DESTINO.
 * Se elige la cara de origen (la otra cara del mueble viene elegida; también
 * otro mueble de la sede u otra sede del mismo supermercado), qué capa
 * copiar, el espejo y, por cada participación del origen, a qué participación
 * VIVA de esta cara van sus zonas. La cuenta la hace `copiarZonas`
 * (`utils/copiaDeZonas.ts`), con las MISMAS funciones que la revisión en vivo:
 * lo que se ve es lo que se guarda.
 *
 * «Copiar como borrador» pega las zonas en el lienzo (UN paso de deshacer) y
 * las guarda por el borrador de siempre, con `origen` sólo para el historial.
 * Ningún contrato ni reserva se copia y nunca se confirma solo: la
 * confirmación es la de siempre. Nunca muestra montos (la cara leída los trae
 * en sus términos y no se usan).
 *
 * Los colores salen de los tokens del tema escritos `rgb(var(--x-rgb))`: el
 * editor 3D es un cajón oscuro que redefine los canales.
 */

const ETIQUETA = "mb-0.5 block text-[10px] font-medium uppercase tracking-widest text-ink-3";
const CAMPO = "w-full border-0 border-b border-line-strong bg-surface px-0 py-1 text-xs text-ink-1 focus:outline-none disabled:opacity-60";
const ROJO = "rgb(var(--ocupado-txt-rgb))";
const AMBAR = "rgb(var(--entra-txt-rgb))";

export default function CopiarZonas({ caras, onCerrar }: { caras: number; onCerrar: () => void }) {
  const activa = useDistribucionStore((s) => s.activa);
  const datos = useDistribucionStore((s) => s.datos);
  const zonas = useDistribucionStore((s) => s.edicion.zonas);
  const sucio = useDistribucionStore((s) => s.edicion.sucio);
  const sedes = useFixtureStore((s) => s.sedes);

  const [sede, setSede] = useState(activa?.sede ?? "");
  const [resumen, setResumen] = useState<ResumenOut | null>(null);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);
  const [elegida, setElegida] = useState("");
  const [origen, setOrigen] = useState<CaraOut | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorOrigen, setErrorOrigen] = useState<string | null>(null);
  const [capa, setCapa] = useState<"confirmada" | "borrador">("confirmada");
  const [espejo, setEspejo] = useState(false);
  const [quitarLasDemas, setQuitarLasDemas] = useState(false);
  const [elegidas, setElegidas] = useState<Map<number, number | null>>(() => new Map());
  const [pegando, setPegando] = useState(false);

  /* ── El resumen de la sede elegida (en caché: lo usa Supervisar) ─────────── */
  useEffect(() => {
    setResumen(null);
    setErrorResumen(null);
    if (!sede) return;
    let vale = true;
    useOcupacionStore.getState().cargarResumen({ sede })
      .then((r) => { if (vale) setResumen(r); })
      .catch((e) => { if (vale) setErrorResumen(describeError(e, "No se pudo leer la lista de caras de esa sede.")); });
    return () => { vale = false; };
  }, [sede]);

  const opciones = useMemo(() => (activa
    ? opcionesDeOrigen({ sede: activa.sede, codigo: activa.codigo, cara: activa.cara, caras }, sede, resumen)
    : []), [activa, caras, sede, resumen]);
  const opcion = opciones.find((o) => o.clave === elegida) ?? null;

  // Abre en la primera cara que tiene algo para copiar (en una doble, la otra
  // cara del mueble si tiene): abrir en una vacía mostraba un error de entrada.
  useEffect(() => {
    if (!opciones.some((o) => o.clave === elegida)) setElegida(opcionDeEntrada(opciones)?.clave ?? "");
  }, [opciones, elegida]);

  /* ── Leer la cara de origen (una foto: si después cambia, la copia es de ese momento) ── */
  useEffect(() => {
    setOrigen(null);
    setErrorOrigen(null);
    setElegidas(new Map());
    if (!opcion) return;
    let vale = true;
    setLeyendo(true);
    leerCara(opcion.sede, opcion.espacio)
      .then((c) => {
        if (!vale) return;
        setOrigen(c);
        setCapa(c.distribucion && c.distribucion.confirmada.length > 0 ? "confirmada" : "borrador");
      })
      .catch((e) => { if (vale) setErrorOrigen(describeError(e, "No se pudo leer esa cara.")); })
      .finally(() => { if (vale) setLeyendo(false); });
    return () => { vale = false; };
  }, [opcion?.clave]);

  const conConfirmada = (origen?.distribucion?.confirmada.length ?? 0) > 0;
  const conBorrador = (origen?.distribucion?.borrador?.length ?? 0) > 0;
  /** La cara elegida no tiene nada que copiar: se dice tranquilo, sin rojo. */
  const sinNada = !!origen && !conConfirmada && !conBorrador;
  const zonasOrigen = useMemo(() => (origen?.distribucion
    ? (capa === "confirmada" ? origen.distribucion.confirmada : origen.distribucion.borrador ?? [])
    : []), [origen, capa]);

  const copia: Copia | null = useMemo(() => {
    if (!origen || !datos) return null;
    return copiarZonas(
      { superficie: origen.superficie, participaciones: origen.participaciones }, zonasOrigen,
      { superficie: datos.superficie, participaciones: datos.participaciones, terminosPorS: datosDeLaCara(datos).terminosPorS,
        hoy: datos.hoy, firmaCambio: !!datos.distribucion?.para_revisar },
      zonas, { espejo, elegidas, quitarLasDemas },
    );
  }, [origen, datos, zonasOrigen, zonas, espejo, elegidas, quitarLasDemas]);
  const frases = copia?.compatible && origen && datos ? frasesDeLaCopia(copia, origen, datos, { sucio }) : null;
  const bloqueo = copia ? bloqueoDeLaCopia(copia) : "Elegí la cara de la que querés copiar.";

  if (!activa || !datos) return null;
  const estampasOrigen = origen ? datosDeLaCara(origen).estampas : null;

  const elegir = (origenSid: number, valor: string) => {
    const m = new Map(elegidas);
    if (valor === "") m.delete(origenSid);
    else m.set(origenSid, valor === "no" ? null : Number(valor));
    setElegidas(m);
  };

  async function copiarComoBorrador() {
    if (!copia || !copia.compatible || bloqueo || !opcion || !origen || !datos || !activa) return;
    setPegando(true);
    const declarado = origenDeLaCopia(copia, opcion, capa, origen.distribucion?.version ?? 0, espejo, datos);
    await useDistribucionStore.getState().pegarCopia(copia, declarado, rotuloDeCara(opcion.sede, opcion.codigo, opcion.cara));
    setPegando(false);
    // Lo pegado ya está en el lienzo: si el guardado no salió, el panel lo dice
    // («Reintentar», «Traer lo nuevo») y el origen viaja con el próximo guardado.
    onCerrar();
  }

  return (
    <Dialogo titulo="Copiar de otra cara" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="flex flex-col gap-3 text-xs text-ink-2" data-copiar-zonas>
        <p className="leading-relaxed">{encabezadoDeLaCopia({ sede: activa.sede, codigo: activa.codigo, cara: activa.cara })}</p>

        {/* De qué cara */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
          <label>
            <span className={ETIQUETA}>Sede</span>
            <select className={CAMPO} value={sede} onChange={(e) => setSede(e.target.value)} disabled={pegando}>
              {(sedes.includes(activa.sede) ? sedes : [activa.sede, ...sedes]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span className={ETIQUETA}>Cara</span>
            <select className={CAMPO} value={elegida} onChange={(e) => setElegida(e.target.value)} disabled={pegando || opciones.length === 0}>
              {opciones.length === 0 && <option value="">{resumen ? "No hay otra cara con piezas" : "Leyendo las caras…"}</option>}
              {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
            </select>
          </label>
        </div>
        {errorResumen && <p role="alert" style={{ color: ROJO }}>{errorResumen}</p>}
        {leyendo && <p>Leyendo la cara…</p>}
        {errorOrigen && <p role="alert" style={{ color: ROJO }}>{errorOrigen}</p>}
        {sinNada && <p data-sin-nada-para-copiar>Esa cara no tiene piezas ubicadas para copiar. Elegí otra.</p>}

        {/* Qué copiar (sólo si el origen tiene las dos capas) */}
        {origen && conConfirmada && conBorrador && (
          <div role="radiogroup" aria-label="Qué copiar" className="flex flex-col gap-1">
            <span className={ETIQUETA}>Qué copiar</span>
            {(["confirmada", "borrador"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="capa-de-origen" checked={capa === k} onChange={() => { setCapa(k); setElegidas(new Map()); }} disabled={pegando} />
                {k === "confirmada"
                  ? `Lo guardado como listo (${origen.distribucion!.confirmada.length} ${origen.distribucion!.confirmada.length === 1 ? "forma" : "formas"})`
                  : `El borrador (${origen.distribucion!.borrador!.length} ${origen.distribucion!.borrador!.length === 1 ? "forma" : "formas"})`}
              </label>
            ))}
          </div>
        )}
        {origen?.distribucion?.para_revisar && capa === "confirmada" && conConfirmada && (
          <p style={{ color: AMBAR }}>El mueble de origen cambió desde que se confirmó: revisá cómo queda.</p>
        )}

        {!sinNada && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={espejo} onChange={(e) => setEspejo(e.target.checked)} disabled={pegando} />
            En espejo (lo de la izquierda pasa a la derecha)
          </label>
        )}

        {copia && !copia.compatible && !sinNada && <p role="alert" style={{ color: ROJO }}>{copia.motivo}</p>}

        {/* A qué marca de esta cara va cada una */}
        {copia?.compatible && frases && copia.grupos.length > 0 && (
          <section aria-label="A qué marca va cada una" className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>A qué marca de esta cara va cada una</span>
            <ul className="flex flex-col gap-1.5" data-filas-de-copia>
              {copia.grupos.map((g, i) => {
                const f = frases.filas[i];
                const valor = g.destino !== null ? String(g.destino) : g.como === "no_copiar" ? "no" : "";
                return (
                  <li key={g.origen} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-start gap-2 rounded-md border border-line px-2.5 py-1.5">
                    <div className="flex items-start gap-1.5">
                      <MuestraDeEstampa estampa={estampasOrigen?.get(g.origen) ?? null} />
                      <span className="text-ink-1">{f.titulo}</span>
                    </div>
                    <div>
                      <select className={CAMPO} value={valor} onChange={(e) => elegir(g.origen, e.target.value)} disabled={pegando}
                        aria-label={`A qué marca de esta cara va ${f.titulo}`}>
                        {valor === "" && <option value="" disabled>Elegí a qué marca va…</option>}
                        {destinosEnOrden(g, datos).map((d) => <option key={d.space_id} value={String(d.space_id)}>{nombreDeDestino(d)}</option>)}
                        <option value="no">No copiar</option>
                      </select>
                      {f.nota && <p className="mt-0.5 text-[11px]" style={f.tono === "ambar" ? { color: AMBAR } : undefined}>{f.nota}</p>}
                    </div>
                    <div className="text-[11px]">
                      {f.comoQueda && <p className={f.sobra ? "" : "text-ink-1"} style={f.sobra ? { color: ROJO } : undefined}>{f.comoQueda}</p>}
                      {f.reemplaza && <p>{f.reemplaza}</p>}
                      {f.junta && <p>{f.junta}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Lo que no se copia */}
        {frases && frases.noSeCopia.length > 0 && (
          <section aria-label="Lo que no se copia">
            <span className={ETIQUETA}>Lo que no se copia</span>
            <ul className="flex flex-col gap-0.5" data-no-se-copia>
              {frases.noSeCopia.map((t, i) => <li key={i}>· {t}</li>)}
            </ul>
          </section>
        )}

        {/* Avisos */}
        {/* Sin nada para copiar, lo dice una sola frase neutra (arriba): ni
            rojo ni las opciones de una copia que no hay. */}
        {frases && frases.avisos.length > 0 && !sinNada && (
          <ul className="flex flex-col gap-0.5" data-avisos-de-copia>
            {frases.avisos.map((a, i) => (
              <li key={i} role={a.bloquea ? "alert" : undefined} style={{ color: a.bloquea ? ROJO : AMBAR }}>⚠ {a.texto}</li>
            ))}
          </ul>
        )}

        {!sinNada && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={quitarLasDemas} onChange={(e) => setQuitarLasDemas(e.target.checked)} disabled={pegando} />
            Sacar las piezas de las marcas que no reciben nada
          </label>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {bloqueo && copia && !sinNada && <p className="mr-auto text-[11px]" style={{ color: AMBAR }}>{bloqueo}</p>}
          <button type="button" className={BOTON} onClick={onCerrar} disabled={pegando}>Cancelar</button>
          <button type="button" className="btn-principal rounded-md px-3 py-1.5 text-xs" disabled={!!bloqueo || pegando}
            title={bloqueo ?? undefined} onClick={() => void copiarComoBorrador()}>
            {pegando ? "Copiando…" : "Copiar como borrador"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
