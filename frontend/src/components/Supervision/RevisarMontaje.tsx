import { useEffect, useMemo, useState } from "react";
import { Camera, Check, CircleAlert, CircleCheck, History, ImageOff, Plus, Send, X } from "lucide-react";
import { describeError } from "../../api/client";
import { urlDeFoto } from "../../api/guia";
import { rechazoDe } from "../../api/participaciones";
import { leerFichaDeMontaje, revisarMontaje, type FichaDeMontaje, type Revisada } from "../../api/supervision";
import { useMedios } from "../../api/medios";
import { destinosDeLaGuia } from "../../utils/guia";
import {
  cuandoPaso, ESTADO_DE_MONTAJE, faltaParaRevisar, queQuedoMal, textoDelAviso,
} from "../../utils/supervision";
import { BOTON, Dialogo } from "../Distribucion/LeyendaDeParticipaciones";
import { CaraDeLaGuia, PAPEL, repisasDeLaGuia } from "../Guia/HojaDeGuia";

/**
 * La ficha de la revisión (fase 4 de la distribución, dibujo aprobado
 * «Supervisar planogramas», paso 2): a la izquierda lo planificado —la cara
 * de la versión con sus números, la misma de la guía—; a la derecha lo que se
 * montó —las fotos—. Una pregunta, «¿Quedó como la guía?», y dos respuestas;
 * la amarilla es «Sí, coincide» (o «Lo vi en la tienda: coincide» sin foto
 * nueva, decisión del dueño). Si no coincide, se tocan los números que
 * quedaron mal, se escribe qué corregir y —marcado, se puede desmarcar— se le
 * vuelve a mandar la guía a quien monta con la nota.
 *
 * Nada se decide solo: el sistema junta las dos cosas y una persona mira.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:border-accent focus:outline-none";
const ROTULO = "text-[10px] font-medium uppercase tracking-widest text-ink-3";
const TONO: Record<string, string> = {
  libre: "rgb(var(--libre-txt-rgb))", entra: "rgb(var(--entra-txt-rgb))", ocupado: "rgb(var(--ocupado-txt-rgb))", neutro: "rgb(var(--ink-2-rgb))",
};

/** Lo que se le dice a quien revisó, después de guardar. */
export function textoDeLaRevision(r: Revisada, nombre: string, sede: string): string {
  if (r.revision.resultado === "coincide") return `Listo: ${nombre} quedó como la guía.`;
  switch (r.reenvio) {
    case "enviada": return `Guardado: no coincide. La guía salió a ${r.reenviada_a.join(", ")} con la nota.`;
    case "sin_contactos": return `Guardado: no coincide. No hay a quién mandarle la guía en ${sede} (Configuración → Contactos): avisale vos.`;
    case "sin_correo": return "Guardado: no coincide. El correo de RECABRA no está configurado: avisale vos (Copiar el enlace, en la guía).";
    default: return "Guardado: no coincide. Queda en «Para revisar» hasta que vuelvan a avisar.";
  }
}

export default function RevisarMontaje({ versionId, onCerrar, onRevisada }: {
  versionId: number;
  onCerrar: () => void;
  /** Se guardó: el texto para quien revisó (y recargar «Para revisar»). */
  onRevisada: (texto: string) => void;
}) {
  const [f, setF] = useState<FichaDeMontaje | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"mirar" | "no">("mirar");
  const [foto, setFoto] = useState(0);
  const [numeros, setNumeros] = useState<Set<number>>(new Set());
  const [otraCosa, setOtraCosa] = useState(false);
  const [nota, setNota] = useState("");
  const [reenviar, setReenviar] = useState(true);
  const [intento, setIntento] = useState(false);
  const [haciendo, setHaciendo] = useState(false);
  const [historia, setHistoria] = useState(false);
  useMedios((s) => s.token); // la foto se vuelve a pedir con el token de medios al día

  useEffect(() => {
    let vale = true;
    leerFichaDeMontaje(versionId).then((x) => { if (vale) setF(x); })
      .catch((e) => { if (vale) setError(describeError(e, "No se pudo leer el montaje.")); });
    return () => { vale = false; };
  }, [versionId]);

  const repisas = useMemo(() => (f ? repisasDeLaGuia(f) : []), [f]);
  const destinos = useMemo(() => (f ? destinosDeLaGuia(f, repisas) : []), [f, repisas]);
  const fotosNuevas = f ? f.fotos.filter((x) => x.nueva) : [];
  const fotos = f ? (fotosNuevas.length ? fotosNuevas : f.fotos) : [];
  const nombre = f ? `${f.codigo} · cara ${f.cara}` : "";
  const titulo = f ? `Revisar el montaje · ${nombre} · versión ${f.version.numero}` : "Revisar el montaje";
  const reemplazada = f?.version.estado === "reemplazada";
  const problema = f ? faltaParaRevisar({
    resultado: modo === "no" ? "no_coincide" : "coincide", numeros: [...numeros], otraCosa, nota,
    enLaTienda: fotosNuevas.length === 0, hayFotoNueva: fotosNuevas.length > 0, total: destinos.length,
  }) : null;

  async function guardar(resultado: "coincide" | "no_coincide") {
    if (!f || haciendo) return;
    setIntento(true);
    if (resultado === "no_coincide" && problema) return;
    setHaciendo(true);
    setError(null);
    try {
      const r = await revisarMontaje({
        version_id: versionId, resultado,
        ...(resultado === "coincide"
          ? { en_la_tienda: fotosNuevas.length === 0 }
          : { numeros: [...numeros].sort((a, b) => a - b), otra_cosa: otraCosa, nota: nota.trim() || null, reenviar }),
      });
      onRevisada(textoDeLaRevision(r, nombre, f.sede));
    } catch (e) {
      setError(rechazoDe(e)?.message || describeError(e, "No se pudo guardar la revisión."));
    } finally {
      setHaciendo(false);
    }
  }

  const alternar = (n: number) => setNumeros((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const aviso = f?.montaje.aviso ?? null;
  const ultima = f?.montaje.revision ?? null;
  const estado = f ? ESTADO_DE_MONTAJE[f.montaje.estado] : null;

  return (
    <Dialogo titulo={titulo} onCerrar={onCerrar} ancho="max-w-4xl" cerrarAfuera={false}>
      <div className="flex flex-col gap-3" data-revisar-montaje-ficha={versionId}>
        {!f && !error && <p className="text-sm text-ink-2">Leyendo el montaje…</p>}
        {f && (
          <>
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2" data-quien-aviso>
              {aviso?.estado === "no_se_pudo" ? <CircleAlert {...ICONO} style={{ color: TONO.ocupado }} />
                : fotos.length ? <Camera {...ICONO} className="text-ink-3" /> : <CircleCheck {...ICONO} className="text-ink-3" />}
              {aviso ? (
                aviso.estado === "montada"
                  ? <span>Avisó que quedó montada · {cuandoPaso(aviso.en, f.hoy)} · {aviso.por_enlace ? "desde el enlace de la guía" : aviso.por}
                      {" · "}<b>{fotosNuevas.length === 0 ? "sin foto" : fotosNuevas.length === 1 ? "1 foto" : `${fotosNuevas.length} fotos`}</b></span>
                  : <span>No se pudo montar · {textoDelAviso(aviso, f.hoy)}</span>
              ) : <span>Nadie avisó todavía desde la guía.</span>}
              {estado && (
                <span className="ml-auto inline-flex items-center gap-1 font-semibold" style={{ color: TONO[estado.tono] }} data-estado-de-montaje={f.montaje.estado}>
                  {estado.texto}
                </span>
              )}
            </p>
            {ultima?.resultado === "no_coincide" && f.montaje.estado === "no_coincide" && (
              <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "rgb(var(--ocupado-borde-rgb))", background: "rgb(var(--ocupado-suave-rgb))" }}>
                <b>Se pidió corregir</b> {cuandoPaso(ultima.en, f.hoy)}: {queQuedoMal(ultima.numeros, ultima.otra_cosa)}{ultima.nota ? ` · ${ultima.nota}` : ""}
                {ultima.guia_reenviada ? " · la guía se reenvió." : "."}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <figure className="m-0 flex min-w-0 flex-col gap-1.5">
                <figcaption className={ROTULO}>Lo planificado · versión {f.version.numero}</figcaption>
                <div className="guia-papel border border-line"><CaraDeLaGuia guia={f} destinos={destinos} repisas={repisas} /></div>
              </figure>
              <figure className="m-0 flex min-w-0 flex-col gap-1.5">
                <figcaption className={ROTULO}>Lo que se montó{fotos.length > 1 ? ` · foto ${foto + 1} de ${fotos.length}` : ""}{fotosNuevas.length === 0 && fotos.length ? " · de antes" : ""}</figcaption>
                {fotos.length ? (
                  <>
                    <img src={urlDeFoto(fotos[Math.min(foto, fotos.length - 1)].id)} alt="Cómo quedó"
                      className="max-h-[336px] w-full rounded-xl border border-line bg-surface-2 object-contain" data-foto-del-montaje />
                    {fotos.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {fotos.map((x, i) => (
                          <button key={x.id} type="button" onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`} aria-pressed={i === foto}
                            className={`h-11 w-14 overflow-hidden rounded-md border-2 ${i === foto ? "border-ink-1" : "border-transparent"}`}>
                            <img src={urlDeFoto(x.id)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[200px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line p-5 text-center" data-sin-foto>
                    <ImageOff size={22} strokeWidth={1.75} aria-hidden className="text-ink-3" />
                    <b className="text-sm">No subieron foto</b>
                    <span className="max-w-[260px] text-xs text-ink-3">No es obligatoria. Si la viste en la tienda, se da por buena igual.</span>
                  </div>
                )}
              </figure>
            </div>

            {reemplazada ? (
              <p className="text-xs text-ink-3">Esta versión ya fue reemplazada: se revisa la que rige.</p>
            ) : modo === "mirar" ? (
              <div className="flex flex-col gap-2.5 border-t border-line pt-3">
                <b className="text-sm">¿Quedó como la guía?</b>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 border-t border-line pt-3" data-que-quedo-mal>
                <b className="text-sm">¿Qué no está como en la guía?</b>
                <span className="-mt-1.5 text-xs text-ink-3">Tocá los números que quedaron mal. Lo que no toques, quedó bien.</span>
                <div className="flex flex-wrap gap-2">
                  {destinos.map((d) => {
                    const mal = numeros.has(d.numero);
                    return (
                      <button key={d.numero} type="button" aria-pressed={mal} onClick={() => alternar(d.numero)} data-numero-mal={d.numero}
                        className="inline-flex h-10 max-w-full items-center gap-2 rounded-full border-[1.5px] py-0 pl-1 pr-3 text-xs font-semibold"
                        style={mal ? { borderColor: "rgb(var(--ocupado-rgb))", background: "rgb(var(--ocupado-suave-rgb))", color: "rgb(var(--ocupado-txt-rgb))" }
                          : { borderColor: "rgb(var(--line-rgb))" }}>
                        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full font-mono text-sm text-white"
                          style={{ background: mal ? "rgb(var(--ocupado-rgb))" : PAPEL[d.color]?.c ?? "#0A1014" }}>{d.numero}</span>
                        <span className="truncate">{d.nombre}</span>
                        {mal && <X size={14} strokeWidth={2} aria-hidden />}
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={otraCosa} onClick={() => setOtraCosa((x) => !x)} data-otra-cosa
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed px-3 text-xs font-semibold ${otraCosa ? "text-ink-1" : "text-ink-2"}`}
                    style={otraCosa ? { borderColor: "rgb(var(--ocupado-rgb))", background: "rgb(var(--ocupado-suave-rgb))" } : { borderColor: "rgb(var(--line-rgb))" }}>
                    <Plus size={14} strokeWidth={2} aria-hidden />Otra cosa
                  </button>
                </div>
                <div>
                  <label className={`mb-1 block ${ROTULO}`} htmlFor="revision-nota">Qué hay que corregir{otraCosa ? "" : " (opcional)"}</label>
                  <textarea id="revision-nota" className={`${CAMPO} min-h-[64px] resize-y`} value={nota} maxLength={1000}
                    placeholder="Halloween quedó a la izquierda de Marca propia: van al revés." onChange={(e) => setNota(e.target.value)} />
                </div>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--ink-1-rgb))]" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} data-reenviar />
                  Mandarle la guía de nuevo a quien monta, con esta nota
                </label>
                {intento && problema && <p role="alert" className="text-xs" style={{ color: TONO.ocupado }}>{problema}</p>}
              </div>
            )}
            {!reemplazada && (
              <div className="flex flex-wrap justify-end gap-2">
                {modo === "mirar"
                  ? <button type="button" className={BOTON} onClick={() => { setModo("no"); setIntento(false); }} data-no-coincide><X {...ICONO} />No coincide</button>
                  : <button type="button" className={BOTON} onClick={() => setModo("mirar")}>Volver</button>}
                {/* El único amarillo: «Sí, coincide» o, marcando lo que quedó mal, guardarlo. */}
                <button type="button" className="btn-principal inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
                  disabled={haciendo} onClick={() => void guardar(modo === "mirar" ? "coincide" : "no_coincide")}
                  {...(modo === "mirar" ? { "data-coincide": "" } : { "data-guardar-no-coincide": "" })}>
                  {modo === "mirar" ? <Check {...ICONO} /> : reenviar ? <Send {...ICONO} /> : <Check {...ICONO} />}
                  {haciendo ? "Guardando…"
                    : modo === "mirar" ? (fotosNuevas.length ? "Sí, coincide" : "Lo vi en la tienda: coincide")
                    : reenviar ? "Guardar y mandar la guía" : "Guardar: no coincide"}
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-xs" style={{ color: TONO.ocupado }}>{error}</p>}

            {(f.montaje.avisos.length > 0 || f.montaje.revisiones.length > 0) && (
              <div className="border-t border-line pt-2">
                <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2" aria-expanded={historia}
                  onClick={() => setHistoria((x) => !x)} data-historia-del-montaje>
                  <History {...ICONO} />Historia de esta versión ({f.montaje.avisos.length + f.montaje.revisiones.length})
                </button>
                {historia && (
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-2">
                    {[...f.montaje.avisos.map((a) => ({ en: a.en ?? "", t: a.estado === "montada"
                        ? `Avisaron que quedó montada${a.por_enlace ? " (desde el enlace)" : a.por ? ` (${a.por})` : ""}`
                        : `Avisaron que no se pudo: ${textoDelAviso(a, "")}` })),
                      ...f.montaje.revisiones.map((r) => ({ en: r.en ?? "", t: r.resultado === "coincide"
                        ? `${r.por ?? "Alguien"}: coincide${r.en_la_tienda ? " (la vio en la tienda)" : ""}`
                        : `${r.por ?? "Alguien"}: no coincide · ${queQuedoMal(r.numeros, r.otra_cosa)}${r.nota ? ` · ${r.nota}` : ""}${r.guia_reenviada ? " · guía reenviada" : ""}` }))]
                      .sort((a, b) => b.en.localeCompare(a.en))
                      .map((x, i) => <li key={i}><span className="font-mono text-ink-3">{cuandoPaso(x.en, f.hoy)}</span> · {x.t}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
