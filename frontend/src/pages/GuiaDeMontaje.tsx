import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CircleAlert, CircleCheck, ListChecks, Printer, RefreshCw, Send, X } from "lucide-react";
import { describeError } from "../api/client";
import { avisarMontaje, leerGuiaDelEnlace, subirFoto, urlDeFoto, type Guia, type MotivoDeNoMontaje } from "../api/guia";
import { rechazoDe } from "../api/participaciones";
import HojaDeGuia from "../components/Guia/HojaDeGuia";
import { imprimirLaGuia } from "../components/Guia/imprimir";
import { hoyLegible } from "../components/Guia/VerGuia";
import { TemaToggle } from "../tema";
import { cuandoPaso, MOTIVOS_DE_NO_MONTAJE, queQuedoMal } from "../utils/supervision";

/**
 * Lo que abre el enlace de la guía de montaje (fase 3): una cara, una versión
 * y nada más, sin contraseña. La hoja para ir marcando los números a medida
 * que quedan, «Imprimir», y al final la foto de cómo quedó —que no es
 * obligatoria (decisión del dueño)— unida a esa versión. Sin precios.
 *
 * Fase 4 (la supervisión): al final, «¿Cómo quedó?». «Quedó montada», con la
 * foto si quiere, o «No se pudo» con el motivo. Le llega a quien revisa. Si
 * quien revisó dijo que no coincide, arriba se lee qué hay que corregir.
 *
 * Como la pantalla de montaje: no monta el tablero ni sincroniza el plano; el
 * servidor manda todo en una llamada.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export default function GuiaDeMontaje() {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "vencido" | "error">("cargando");
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [como, setComo] = useState<"montada" | "no_se_pudo">("montada");
  const [motivo, setMotivo] = useState<MotivoDeNoMontaje | null>(null);
  const [nota, setNota] = useState("");
  const [avisando, setAvisando] = useState(false);
  const [marcados, setMarcados] = useState<[number, number]>([0, 0]);
  const alMarcar = useCallback((n: number, t: number) => setMarcados([n, t]), []);

  const leer = () => {
    setEstado("cargando");
    leerGuiaDelEnlace()
      .then((g) => { setGuia(g); setEstado("listo"); })
      .catch((e) => {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 401) setEstado("vencido");
        else { setError(describeError(e, "No se pudo abrir la guía.")); setEstado("error"); }
      });
  };
  useEffect(leer, []);

  async function subir(f: File | undefined) {
    if (!f || subiendo) return;
    setSubiendo(true);
    setAviso(null);
    try {
      const r = await subirFoto(f);
      setGuia((g) => (g ? { ...g, fotos: r.fotos } : g));
      setAviso({ ok: true, texto: "La foto quedó guardada. Cuando termines, avisá cómo quedó." });
    } catch (e) {
      setAviso({ ok: false, texto: describeError(e, "No se pudo subir la foto. Probá de nuevo.") });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function avisar() {
    if (avisando || !guia) return;
    if (como === "no_se_pudo" && !motivo) {
      setAviso({ ok: false, texto: "Elegí por qué no se pudo, así queda claro qué resolver." });
      return;
    }
    setAvisando(true);
    setAviso(null);
    try {
      const r = await avisarMontaje(como === "montada" ? { estado: "montada" } : { estado: "no_se_pudo", motivo, nota: nota.trim() || null });
      setGuia((g) => (g ? { ...g, aviso: r.aviso, correccion: null } : g));
      setAviso({ ok: true, texto: como === "montada" ? "Listo: avisaste que quedó montada. Gracias." : "Listo: avisaste que no se pudo. Gracias." });
    } catch (e) {
      setAviso({ ok: false, texto: rechazoDe(e)?.message || describeError(e, "No se pudo avisar. Probá de nuevo.") });
    } finally {
      setAvisando(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink-1" data-guia-de-montaje>
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-3 p-3 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">RECABRA · guía de montaje</p>
          <TemaToggle />
        </div>
        {estado === "cargando" && <p className="text-sm text-ink-2">Abriendo la guía…</p>}
        {estado === "vencido" && (
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">Este enlace ya no sirve.</p>
            <p className="mt-1 text-ink-2">Venció o no es de una guía. Pedile a quien administra que te la mande de nuevo.</p>
          </div>
        )}
        {estado === "error" && (
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <p>{error}</p>
            <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold" onClick={leer}>
              <RefreshCw {...ICONO} />Probar de nuevo
            </button>
          </div>
        )}
        {guia && (
          <>
            {guia.correccion && (
              <div role="status" className="flex gap-2 rounded-2xl border p-3 text-sm" data-correccion
                style={{ borderColor: "rgb(var(--ocupado-borde-rgb))", background: "rgb(var(--ocupado-suave-rgb))" }}>
                <CircleAlert {...ICONO} style={{ color: "rgb(var(--ocupado-txt-rgb))", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <b>Hay que corregir: {queQuedoMal(guia.correccion.numeros, guia.correccion.otra_cosa)}.</b>
                  {guia.correccion.nota && <p className="mt-0.5 text-ink-2">{guia.correccion.nota}</p>}
                  <p className="mt-0.5 text-xs text-ink-3">Cuando quede, avisá abajo de nuevo.</p>
                </div>
              </div>
            )}
            <HojaDeGuia guia={guia} marcable generada={hoyLegible(guia.hoy)} onMarcados={alMarcar} />
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3" data-como-quedo>
              {marcados[0] > 0 && (
                <p className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: "rgb(var(--libre-suave-rgb))" }}>
                  <ListChecks {...ICONO} style={{ color: "rgb(var(--libre-txt-rgb))" }} />Marcaste <b>{marcados[0]} de {marcados[1]}</b> números
                </p>
              )}
              {guia.aviso && !aviso && (
                <p className="text-xs text-ink-3" data-ya-avisaste>
                  Ya avisaste {guia.aviso.estado === "montada" ? "que quedó montada" : "que no se pudo"} · {cuandoPaso(guia.aviso.en, guia.hoy)}. Si cambió algo, avisá de nuevo.
                </p>
              )}
              <b className="text-base">¿Cómo quedó?</b>
              <div className="grid grid-cols-2 gap-0.5 rounded-xl border border-line bg-surface-2 p-[3px]" role="radiogroup" aria-label="Cómo quedó">
                {([["montada", "Quedó montada", Check], ["no_se_pudo", "No se pudo", X]] as const).map(([id, texto, Icono]) => (
                  <button key={id} type="button" role="radio" aria-checked={como === id} onClick={() => { setComo(id); setAviso(null); }} data-como={id}
                    className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm ${como === id ? "bg-ink-1 font-semibold text-surface" : "text-ink-2"}`}>
                    <Icono size={14} strokeWidth={2} aria-hidden />{texto}
                  </button>
                ))}
              </div>
              <input ref={archivo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void subir(e.target.files?.[0])} />
              {como === "montada" ? (
                <>
                  <button type="button" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line bg-surface p-3 text-left"
                    onClick={() => archivo.current?.click()} disabled={subiendo} data-tomar-foto>
                    <Camera {...ICONO} />
                    <span className="flex flex-col">
                      <b className="text-sm">{subiendo ? "Subiendo la foto…" : guia.fotos.length ? "Sumar otra foto" : "Sumar una foto"}</b>
                      <span className="text-xs text-ink-3">No es obligatoria{guia.fotos.length ? ` · ${guia.fotos.length} ${guia.fotos.length === 1 ? "tomada" : "tomadas"}` : ""}</span>
                    </span>
                  </button>
                  {guia.fotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-fotos-de-la-guia>
                      {guia.fotos.map((f) => (
                        <img key={f.id} src={urlDeFoto(f.id)} alt="Cómo quedó" className="aspect-square w-full rounded-lg border border-line object-cover" />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Por qué no se pudo">
                    {MOTIVOS_DE_NO_MONTAJE.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={motivo === m.id} onClick={() => { setMotivo(m.id); setAviso(null); }} data-motivo={m.id}
                        className={`min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm ${motivo === m.id ? "border-ink-1 font-semibold" : "border-line"}`}
                        style={motivo === m.id ? { boxShadow: "inset 0 0 0 1px rgb(var(--ink-1-rgb))" } : undefined}>
                        {m.texto}
                      </button>
                    ))}
                  </div>
                  <textarea className="min-h-[64px] w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    value={nota} maxLength={1000} placeholder="¿Qué pasó? (opcional)" onChange={(e) => setNota(e.target.value)} aria-label="Qué pasó" />
                </>
              )}
              <button type="button" className="btn-principal inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm"
                onClick={() => void avisar()} disabled={avisando} data-avisar>
                <Send {...ICONO} />{avisando ? "Avisando…" : como === "montada" ? "Avisar que quedó montada" : "Avisar que no se pudo"}
              </button>
              {aviso && (
                <p role="status" className="flex items-center justify-center gap-1.5 text-center text-xs"
                  style={{ color: aviso.ok ? "rgb(var(--libre-txt-rgb))" : "rgb(var(--ocupado-txt-rgb))" }}>
                  {aviso.ok && <CircleCheck {...ICONO} />}{aviso.texto}
                </p>
              )}
              <p className="text-center text-xs text-ink-3">Le llega a quien administra la sede. Sin precios.</p>
              <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold"
                onClick={imprimirLaGuia} data-imprimir-guia>
                <Printer {...ICONO} />Imprimir la hoja
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
