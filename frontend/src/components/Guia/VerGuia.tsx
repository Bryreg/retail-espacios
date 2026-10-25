import { useEffect, useState } from "react";
import { CircleCheck, Link2, Printer, Send, X } from "lucide-react";
import { describeError } from "../../api/client";
import { enlaceDeLaGuia, leerGuia, type Guia } from "../../api/guia";
import { useModalAbierto } from "../../tema";
import { BOTON } from "../Distribucion/LeyendaDeParticipaciones";
import EnviarGuia from "./EnviarGuia";
import HojaDeGuia from "./HojaDeGuia";
import { imprimirLaGuia } from "./imprimir";

/**
 * La guía de una versión, dentro de la app (fase 3): la hoja como se imprime y,
 * arriba, «Imprimir», «Mandarla a quien corresponde» y «Copiar el enlace».
 * Se abre al publicar (el aviso de «Listo») y desde «Versiones».
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** «24 oct 2026» de hoy (lo que dice el pie de la hoja). */
export function hoyLegible(iso: string): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export default function VerGuia({ versionId, puedeCompartir, mandar = false, onCerrar }: {
  versionId: number; puedeCompartir: boolean;
  /** Abrir directo en «Mandarla a quien corresponde». */
  mandar?: boolean;
  onCerrar: () => void;
}) {
  useModalAbierto();
  const [guia, setGuia] = useState<Guia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(mandar && puedeCompartir);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vale = true;
    leerGuia(versionId).then((g) => { if (vale) setGuia(g); })
      .catch((e) => { if (vale) setError(describeError(e, "No se pudo leer la guía.")); });
    return () => { vale = false; };
  }, [versionId]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) { e.stopPropagation(); onCerrar(); } };
    window.addEventListener("keydown", esc, { capture: true });
    return () => window.removeEventListener("keydown", esc, { capture: true });
  }, [enviando, onCerrar]);

  const titulo = guia ? `${guia.codigo} · cara ${guia.cara} · versión ${guia.version.numero}` : "la guía";
  async function copiar() {
    setAviso(null);
    try {
      const { url } = await enlaceDeLaGuia(versionId);
      try { await navigator.clipboard.writeText(url); setAviso("Enlace copiado: abre la guía sin contraseña. Es para quien monta."); }
      catch { window.prompt("Copiá el enlace de la guía:", url); }
    } catch (e) {
      setAviso(describeError(e, "No se pudo sacar el enlace."));
    }
  }

  return (
    <div data-guia-capa role="dialog" aria-modal="true" aria-label={`Guía de montaje de ${titulo}`}
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-bg text-ink-1">
      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[920px] flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs text-ink-3">Guía de montaje</p>
            <h2 className="break-words text-sm font-bold">{titulo}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BOTON} onClick={imprimirLaGuia} disabled={!guia} data-imprimir-guia><Printer {...ICONO} />Imprimir</button>
            {puedeCompartir && (
              <>
                <button type="button" className={BOTON} onClick={() => setEnviando(true)} disabled={!guia} data-mandar-guia><Send {...ICONO} />Mandarla a quien corresponde</button>
                <button type="button" className={BOTON} onClick={() => void copiar()} disabled={!guia} data-copiar-enlace><Link2 {...ICONO} />Copiar el enlace</button>
              </>
            )}
            <button type="button" className={BOTON} onClick={onCerrar}><X {...ICONO} />Cerrar</button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[920px] flex-col items-center gap-3 p-3 sm:p-5">
        {aviso && (
          <p role="status" className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-xs"
            style={{ background: "rgb(var(--libre-suave-rgb))", borderColor: "rgb(var(--libre-borde-rgb))" }}>
            <CircleCheck {...ICONO} style={{ color: "rgb(var(--libre-txt-rgb))" }} />{aviso}
          </p>
        )}
        {error && <p role="alert" className="w-full rounded-xl border px-3 py-2.5 text-xs" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{error}</p>}
        {!guia && !error && <p className="text-sm text-ink-2">Leyendo la guía…</p>}
        {guia && <HojaDeGuia guia={guia} generada={hoyLegible(guia.hoy)} />}
      </div>
      {enviando && guia && (
        <EnviarGuia versionId={versionId} titulo={titulo} onCerrar={() => setEnviando(false)}
          onEnviada={(a) => { setEnviando(false); setAviso(`Listo: la guía salió a ${a.join(", ")}.`); }} />
      )}
    </div>
  );
}
