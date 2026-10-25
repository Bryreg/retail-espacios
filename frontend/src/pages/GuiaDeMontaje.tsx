import { useEffect, useRef, useState } from "react";
import { Camera, CircleCheck, Printer, RefreshCw } from "lucide-react";
import { describeError } from "../api/client";
import { leerGuiaDelEnlace, subirFoto, urlDeFoto, type Guia } from "../api/guia";
import HojaDeGuia from "../components/Guia/HojaDeGuia";
import { imprimirLaGuia } from "../components/Guia/imprimir";
import { hoyLegible } from "../components/Guia/VerGuia";
import { TemaToggle } from "../tema";

/**
 * Lo que abre el enlace de la guía de montaje (fase 3): una cara, una versión
 * y nada más, sin contraseña. La hoja para ir marcando los números a medida
 * que quedan, «Imprimir», y al final la foto de cómo quedó —que no es
 * obligatoria (decisión del dueño)— unida a esa versión. Sin precios.
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
      setAviso({ ok: true, texto: "Listo: la foto quedó guardada con esta versión." });
    } catch (e) {
      setAviso({ ok: false, texto: describeError(e, "No se pudo subir la foto. Probá de nuevo.") });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
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
            <HojaDeGuia guia={guia} marcable generada={hoyLegible(guia.hoy)} />
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <input ref={archivo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void subir(e.target.files?.[0])} />
              <button type="button" className="btn-principal inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm"
                onClick={() => archivo.current?.click()} disabled={subiendo} data-tomar-foto>
                <Camera {...ICONO} />{subiendo ? "Subiendo la foto…" : guia.fotos.length ? "Tomar otra foto" : "Tomar la foto de cómo quedó"}
              </button>
              <p className="text-center text-xs text-ink-3">No es obligatoria. Queda unida a la versión {guia.version.numero}. Sin precios.</p>
              {aviso && (
                <p role="status" className="flex items-center justify-center gap-1.5 text-center text-xs"
                  style={{ color: aviso.ok ? "rgb(var(--libre-txt-rgb))" : "rgb(var(--ocupado-txt-rgb))" }}>
                  {aviso.ok && <CircleCheck {...ICONO} />}{aviso.texto}
                </p>
              )}
              {guia.fotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-fotos-de-la-guia>
                  {guia.fotos.map((f) => (
                    <img key={f.id} src={urlDeFoto(f.id)} alt="Cómo quedó" className="aspect-square w-full rounded-lg border border-line object-cover" />
                  ))}
                </div>
              )}
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
