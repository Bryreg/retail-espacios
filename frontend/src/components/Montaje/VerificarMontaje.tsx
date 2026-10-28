import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import Cajon from "../Armazon/Cajon";
import { verificarMontaje, MOTIVO_LABEL, type MountConfirmation, type MountMotivo } from "../../api/mounts";
import { planometriaDelEspacio, planometriaUrl } from "../../api/planograms";
import { fileUrl } from "../../api/files";
import { queHacerSegunElMotivo } from "../../utils/montajes";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** «8 oct · 15:42», hora de Colombia. */
function cuando(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(t);
}

/** Lo que se mira: la planometría (lo pedido) o la foto (lo que quedó). */
function Lamina({ titulo, url, tipo, vacio }: { titulo: string; url: string | null; tipo: string | null; vacio: string }) {
  return (
    <figure className="vm-lamina">
      <figcaption>{titulo}</figcaption>
      {!url ? (
        <div className="vm-vacio">{vacio}</div>
      ) : tipo?.includes("pdf") ? (
        <iframe title={titulo} src={url} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={titulo} /></a>
      )}
    </figure>
  );
}

/**
 * «Verificar el montaje de un contrato» y «Ver registro» (rediseño UX 2026-10,
 * etapa 7): la planometría al lado de la foto, con cuándo, quién y su nota.
 * Quien administra dice «Coincide» o «No coincide» —con qué corregir y, si
 * quiere, el aviso de montaje otra vez—; queda quién y cuándo. Un «no se
 * pudo» no se verifica: se lee el motivo y qué hacer.
 */
export default function VerificarMontaje({ reporte, titulo, puedeVerificar, onCerrar, onVerificado, onRegistrarDeNuevo, siguiente }: {
  reporte: MountConfirmation;
  titulo: string;
  puedeVerificar: boolean;
  onCerrar: () => void;
  onVerificado: (m: MountConfirmation) => void;
  /** Registrar el montaje de nuevo (quien monta lo corrige). */
  onRegistrarDeNuevo?: () => void;
  /** Después de verificar: el siguiente montaje sin verificar de la sede y
   *  cuántos quedan (2026-10-28), para seguir sin volver a la lista. */
  siguiente?: { codigo: string; detalle: string; quedan: number; sede: string; onAbrir: () => void } | null;
}) {
  const [plano, setPlano] = useState<{ url: string; tipo: string } | null | undefined>(undefined);
  const [resultado, setResultado] = useState<"coincide" | "no_coincide" | null>(null);
  const [nota, setNota] = useState("");
  const [reenviar, setReenviar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    planometriaDelEspacio(reporte.space_code).then((p) => {
      if (vivo) setPlano(p ? { url: planometriaUrl(p.id), tipo: p.content_type } : null);
    }).catch(() => { if (vivo) setPlano(null); });
    return () => { vivo = false; };
  }, [reporte.space_code]);

  const montado = reporte.estado === "montado";
  const v = reporte.verificacion;
  const puede = puedeVerificar && montado;
  const listo = resultado === "coincide" || (resultado === "no_coincide" && nota.trim().length > 0);

  async function guardar() {
    if (!resultado || !listo) return;
    setGuardando(true); setError(null);
    try {
      const m = await verificarMontaje(reporte.id, resultado, resultado === "no_coincide" ? nota.trim() : undefined, resultado === "no_coincide" && reenviar);
      const r = m.verificacion?.aviso_reenviado;
      setHecho(resultado === "coincide" ? "Quedó verificado: coincide."
        : r === true ? "Quedó verificado: no coincide. El aviso de montaje salió de nuevo con lo que hay que corregir."
        : r === false ? "Quedó verificado: no coincide. El aviso no salió (no hay correo configurado o el contrato ya no corre): avisale a quien monta."
        : "Quedó verificado: no coincide. Quien monta lo lee al abrir su enlace.");
      onVerificado(m);
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      setError(typeof d === "string" ? d : "No se pudo guardar la verificación. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Cajon titulo={titulo} sub={montado ? "Lo pedido al lado de lo que quedó" : "Montaje no realizado"} onCerrar={onCerrar} ancho={760} etiqueta="Verificar el montaje">
      <div className="vm" data-verificar-montaje>
        <div className="vm-laminas">
          <Lamina titulo="Lo pedido · planometría" url={plano?.url ?? null} tipo={plano?.tipo ?? null}
            vacio={plano === undefined ? "Buscando la planometría…" : "Este contrato no tiene planometría cargada."} />
          <Lamina titulo="Lo que quedó · foto del montaje" url={reporte.file_id ? fileUrl(reporte.file_id) : null} tipo={reporte.foto_tipo ?? "image/jpeg"}
            vacio={montado ? "El reporte no tiene foto (o ya no está guardada)." : "Sin foto: no se pudo montar."} />
        </div>

        <dl className="vm-datos">
          <dt>Registrado</dt><dd>{cuando(reporte.confirmado_en) || "—"}{reporte.reportado_por ? ` · ${reporte.reportado_por}` : ""}</dd>
          {!montado && <><dt>Motivo</dt><dd>{reporte.motivo ? MOTIVO_LABEL[reporte.motivo as MountMotivo] : "Sin motivo"}</dd></>}
          {reporte.nota && <><dt>Nota</dt><dd>{reporte.nota}</dd></>}
          {v && <><dt>Verificado</dt><dd>{v.resultado === "coincide" ? "Coincide" : "No coincide"} · {cuando(v.en)}{v.por ? ` · ${v.por}` : ""}{v.nota ? ` — ${v.nota}` : ""}</dd></>}
        </dl>

        {!montado && (
          <div className="vm-resolver" data-resolver-montaje>
            <p>{queHacerSegunElMotivo(reporte.motivo)}</p>
            {onRegistrarDeNuevo && <button type="button" className="vm-btn" onClick={onRegistrarDeNuevo}>Registrar el montaje de nuevo</button>}
          </div>
        )}

        {hecho ? (
          <>
            <p className="vm-hecho" role="status">{hecho}</p>
            {siguiente !== undefined && (
              <div className="vm-siguiente" data-siguiente-montaje>
                {siguiente ? (
                  <>
                    <span className="vm-sig-titulo">Siguiente · quedan {siguiente.quedan} sin verificar en {siguiente.sede}</span>
                    <div className="vm-sig-fila">
                      <span><b className="mono">{siguiente.codigo}</b><small>{siguiente.detalle}</small></span>
                      <button type="button" className="vm-btn vm-sig-btn" onClick={siguiente.onAbrir}>Verificar el siguiente</button>
                    </div>
                  </>
                ) : (
                  <span className="vm-sig-titulo">No quedan montajes sin verificar en la sede.</span>
                )}
                <button type="button" className="vm-btn" onClick={onCerrar}>Volver a la lista</button>
              </div>
            )}
          </>
        ) : puede ? (
          <div className="vm-decidir">
            <div className="vm-opciones" role="radiogroup" aria-label="¿Coincide con lo pedido?">
              <button type="button" role="radio" aria-checked={resultado === "coincide"} onClick={() => setResultado("coincide")}>
                <CircleCheck {...ICONO} /> Coincide
              </button>
              <button type="button" role="radio" aria-checked={resultado === "no_coincide"} onClick={() => setResultado("no_coincide")}>
                <CircleX {...ICONO} /> No coincide
              </button>
            </div>
            {resultado === "no_coincide" && (
              <>
                <label className="vm-nota">
                  Qué hay que corregir
                  <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={2000}
                    placeholder="Ej.: falta el cabezote; el producto va en el segundo entrepaño" />
                </label>
                <label className="vm-check">
                  <input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} />
                  Mandar el aviso de montaje de nuevo a quien monta
                </label>
              </>
            )}
            {error && <p className="vm-error" role="alert">{error}</p>}
            <div className="vm-pie">
              {onRegistrarDeNuevo && montado && <button type="button" className="vm-btn" onClick={onRegistrarDeNuevo}>Registrar de nuevo</button>}
              <button type="button" className="btn-principal" disabled={!listo || guardando} onClick={guardar}>
                {guardando ? "Guardando…" : "Guardar la verificación"}
              </button>
            </div>
          </div>
        ) : montado && onRegistrarDeNuevo ? (
          <div className="vm-pie"><button type="button" className="vm-btn" onClick={onRegistrarDeNuevo}>Registrar de nuevo</button></div>
        ) : null}
      </div>
    </Cajon>
  );
}
