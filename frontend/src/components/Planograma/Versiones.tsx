import { useState } from "react";
import { Eye, FileText, ScanEye } from "lucide-react";
import { describeError } from "../../api/client";
import * as API from "../../api/planogramas";
import type { VersionOut } from "../../api/planogramas";
import { haceCuanto } from "../../utils/planograma";
import { cuandoPaso, ESTADO_DE_MONTAJE } from "../../utils/supervision";
import { BOTON, Dialogo, fechaLegible } from "../Distribucion/LeyendaDeParticipaciones";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

const ESTADO_DE_VERSION: Record<API.EstadoDeVersion, string> = { vigente: "vigente", programada: "programada", reemplazada: "reemplazada" };
const TONO = {
  libre: { background: "rgb(var(--libre-suave-rgb))", color: "rgb(var(--libre-txt-rgb))" },
  entra: { background: "rgb(var(--entra-suave-rgb))", color: "rgb(var(--entra-txt-rgb))" },
  ocupado: { background: "rgb(var(--ocupado-suave-rgb))", color: "rgb(var(--ocupado-txt-rgb))" },
  neutro: { background: "rgb(var(--surface-3-rgb))", color: "rgb(var(--ink-2-rgb))" },
} as const;

/** «Coincide · revisó ana@super.co, 3 oct»: el estado del montaje con quién y cuándo. */
function textoDelMontaje(m: API.MontajeDeVersion, hoy: string): string {
  const base = ESTADO_DE_MONTAJE[m.estado].texto;
  const r = m.revision;
  if ((m.estado === "coincide" || m.estado === "no_coincide") && r) {
    return `${base} · revisó ${r.por ?? "alguien"}, ${cuandoPaso(r.en, hoy)}${r.en_la_tienda ? " (en la tienda)" : ""}`;
  }
  if ((m.estado === "por_revisar" || m.estado === "no_se_pudo") && m.aviso) return `${base} · ${cuandoPaso(m.aviso.en, hoy)}`;
  return base;
}

/** Las versiones de la cara: la vigente, las programadas y las reemplazadas. */
export default function Versiones({ versiones, hoy, onCerrar, onVer, onGuia, onMontaje }: {
  versiones: VersionOut[]; hoy: string; onCerrar: () => void; onVer: (v: VersionOut) => void;
  /** La guía de montaje de esa versión (fase 3). */
  onGuia: (versionId: number) => void;
  /** La ficha del montaje (fase 4): sólo quien puede revisar esa cara. */
  onMontaje?: (versionId: number) => void;
}) {
  const [leyendo, setLeyendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ver = async (v: VersionOut) => {
    setLeyendo(v.id);
    setError(null);
    try { onVer(await API.leerVersion(v.id)); } catch (e) { setError(describeError(e, "No se pudo leer la versión.")); } finally { setLeyendo(null); }
  };
  return (
    <Dialogo titulo="Versiones de esta cara" onCerrar={onCerrar} ancho="max-w-lg">
      <div className="flex flex-col gap-2 text-xs" data-lista-de-versiones>
        {versiones.length === 0 && <p className="text-ink-2">Todavía no se publicó ninguna versión.</p>}
        {versiones.map((v) => (
          <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-xl border px-3 py-2"
            style={v.estado === "vigente" ? { borderColor: "rgb(var(--libre-borde-rgb))", background: "rgb(var(--libre-suave-rgb))" } : { borderColor: "rgb(var(--line-rgb))" }}>
            <b className="text-sm">Versión {v.numero} · {ESTADO_DE_VERSION[v.estado]}{v.vencida_hace_dias != null ? ` · venció ${haceCuanto(v.vencida_hace_dias)}` : ""}</b>
            <div className="row-span-2 flex flex-wrap justify-end gap-1.5">
              <button type="button" className={BOTON} onClick={() => void ver(v)} disabled={leyendo !== null}><Eye {...ICONO} />{leyendo === v.id ? "Leyendo…" : "Ver"}</button>
              <button type="button" className={BOTON} onClick={() => onGuia(v.id)} data-guia-de-la-version={v.numero}><FileText {...ICONO} />Guía</button>
            </div>
            <span className="text-ink-3">
              Publicada el {fechaLegible(v.publicada_en?.slice(0, 10), hoy)}{v.publicada_por ? ` por ${v.publicada_por}` : ""} · rige desde el {fechaLegible(v.rige_desde, hoy)}
              {v.hasta ? ` hasta el ${fechaLegible(v.hasta, hoy)}` : ""}
            </span>
            {v.montaje && v.montaje.estado !== "sin_registro" && (() => {
              const m = v.montaje;
              const estilo = TONO[ESTADO_DE_MONTAJE[m.estado].tono];
              const clase = "col-span-2 mt-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold";
              return onMontaje && m.estado !== "no_rige" ? (
                <button type="button" className={clase} style={estilo} onClick={() => onMontaje(v.id)} data-montaje-de-la-version={v.numero}>
                  <ScanEye size={13} strokeWidth={1.75} aria-hidden /><span className="truncate">{textoDelMontaje(m, hoy)}</span>
                </button>
              ) : (
                <span className={clase} style={estilo} data-montaje-de-la-version={v.numero}><span className="truncate">{textoDelMontaje(m, hoy)}</span></span>
              );
            })()}
          </div>
        ))}
        {error && <p role="alert" style={{ color: "rgb(var(--ocupado-txt-rgb))" }}>{error}</p>}
        <p className="text-ink-3">Una versión publicada no se borra ni se cambia: para cambiarla se publica la siguiente.</p>
      </div>
    </Dialogo>
  );
}
