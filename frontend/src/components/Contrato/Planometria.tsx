import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, ImageUp, Trash2 } from "lucide-react";
import {
  borrarPlanometria, planometriaDelContrato, planometriaDelEspacio, planometriaUrl, subirPlanometria,
  type AvisoDeMontaje, type Planometria as PlanometriaFile,
} from "../../api/planograms";
import { getSpaceByCode } from "../../api/spaces";
import { describeError } from "../../api/client";

/**
 * La planometría del contrato que corre HOY sobre un espacio —o del firmado que
 * todavía no arranca—, o la de UN contrato si se sabe cuál (`leaseId`).
 *
 * Se busca por el código del espacio y no por el id del contrato porque el JSON
 * del layout —que es de donde salen todas las pantallas— no guarda ids de
 * contrato: guarda el estado comercial denormalizado. El backend hace el salto
 * espacio → contrato vigente → archivo.
 *
 * El admin puede cargarla o cambiarla desde acá. Es la vía de recuperación
 * cuando la subida falló al cerrar el trato, y la única para los contratos
 * anteriores a que esto existiera.
 */

export default function Planometria({
  spaceCode, leaseId: leaseIdPedido = null, isAdmin, compacta = false, onCargada,
}: {
  /** `SEDE-CODIGO`, el completo. El corto se repite entre sedes. */
  spaceCode: string;
  /** El contrato al que se le carga, si se sabe: «Cargar planometría» de
   *  «Para revisar» trae el que la espera (`lease_id` de la fila), que puede
   *  arrancar más adelante. Sin esto, el que corre hoy o, si no hay, el
   *  próximo (`active_lease ?? upcoming_lease`). */
  leaseId?: number | null;
  isAdmin: boolean;
  /** Sin encabezado ni acciones: sólo la miniatura. */
  compacta?: boolean;
  /** Se cargó una: quien la muestra puede volver a leer lo que la esperaba
   *  («Falta planometría» en Supervisar). */
  onCargada?: () => void;
}) {
  const [plano, setPlano] = useState<PlanometriaFile | null>(null);
  const [leaseId, setLeaseId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  /** Qué pasó con el aviso de montaje que esperaba esta planometría. */
  const [aviso, setAviso] = useState<AvisoDeMontaje | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buscar = useCallback(async () => {
    setCargando(true);
    if (leaseIdPedido && isAdmin) {
      // El contrato ya se sabe: su planometría, o el lugar para cargarla.
      setPlano(await planometriaDelContrato(leaseIdPedido));
      setLeaseId(leaseIdPedido);
      setCargando(false);
      return;
    }
    const p = await planometriaDelEspacio(spaceCode);
    setPlano(p);
    if (p) {
      setLeaseId(p.lease_id);
    } else if (isAdmin) {
      // Sin planometría todavía: hace falta el contrato para poder subirle
      // una — el que corre hoy o, si no hay, el firmado que todavía no
      // arranca (la planometría se carga ANTES del montaje). Sin contrato no
      // hay nada que adjuntar.
      const espacio = await getSpaceByCode(spaceCode);
      setLeaseId(espacio?.active_lease?.id ?? espacio?.upcoming_lease?.id ?? null);
    } else {
      setLeaseId(null);
    }
    setCargando(false);
  }, [spaceCode, isAdmin, leaseIdPedido]);

  useEffect(() => {
    let vivo = true;
    (async () => { await buscar(); if (!vivo) return; })();
    return () => { vivo = false; };
  }, [buscar]);

  async function elegir(archivo: File | null) {
    if (!archivo || !leaseId) return;
    setSubiendo(true);
    setError("");
    try {
      const r = await subirPlanometria(leaseId, archivo);
      setAviso(r.aviso_de_montaje ?? null);
      await buscar();
      onCargada?.();
    } catch (e) {
      setError(describeError(e, "No se pudo subir la planometría."));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function quitar() {
    if (!leaseId) return;
    setSubiendo(true);
    setError("");
    try {
      await borrarPlanometria(leaseId);
      await buscar();
    } catch (e) {
      setError(describeError(e, "No se pudo quitar la planometría."));
    } finally {
      setSubiendo(false);
    }
  }

  // Nada que decir: sin planometría y sin contrato al que colgarle una, la
  // tarjeta sólo sería ruido en un panel que ya está lleno.
  if (cargando || (!plano && !leaseId)) return null;

  const esPdf = plano?.content_type === "application/pdf";

  return (
    <div>
      {!compacta && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
            fontSize: "var(--t-3xs)", fontWeight: 700, color: "var(--ink-3)",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          <ImageIcon size={11} /> Planometría
        </div>
      )}

      {plano ? (
        <>
          <a
            href={planometriaUrl(plano.id)}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", textDecoration: "none" }}
          >
            {esPdf ? (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "11px 12px",
                  borderRadius: "var(--r-lg)", border: "1px solid var(--line)",
                  background: "var(--surface-2)", color: "var(--accent-700)",
                  fontSize: "var(--t-xs)", fontWeight: 600,
                }}
              >
                <FileText size={16} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {plano.filename}
                </span>
              </div>
            ) : (
              <img
                src={planometriaUrl(plano.id)}
                alt="Cómo debe quedar la exhibición"
                style={{
                  display: "block", width: "100%", maxHeight: 190, objectFit: "contain",
                  borderRadius: "var(--r-lg)", border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                }}
              />
            )}
          </a>
          <div style={{ marginTop: 6, fontSize: "var(--t-2xs)", color: "var(--ink-3)" }}>
            Así debe quedar la exhibición
            {plano.subido_por ? ` · la cargó ${plano.subido_por}` : ""}
          </div>
        </>
      ) : (
        <label
          style={{
            display: "flex", alignItems: "center", gap: 8,
            height: 36, padding: "0 11px", cursor: subiendo ? "wait" : "pointer",
            borderRadius: "var(--r-md)", border: "1px dashed var(--line-strong)",
            background: "var(--surface-2)", color: "var(--ink-3)", fontSize: "var(--t-xs)",
          }}
        >
          <ImageUp size={14} />
          {subiendo ? "Subiendo…" : "Adjuntar la planometría"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            style={{ display: "none" }}
            disabled={subiendo}
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      {isAdmin && plano && !compacta && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <label
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 30, borderRadius: "var(--r-md)", cursor: subiendo ? "wait" : "pointer",
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--ink-2)", fontSize: "var(--t-2xs)", fontWeight: 600,
            }}
          >
            <ImageUp size={12} />
            {subiendo ? "Subiendo…" : "Cambiar"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              style={{ display: "none" }}
              disabled={subiendo}
              onChange={(e) => elegir(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={quitar}
            disabled={subiendo}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 30, padding: "0 11px", borderRadius: "var(--r-md)",
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--danger)", fontSize: "var(--t-2xs)", fontWeight: 600,
              cursor: subiendo ? "wait" : "pointer", fontFamily: "inherit",
            }}
          >
            <Trash2 size={12} /> Quitar
          </button>
        </div>
      )}

      {aviso && (
        <div data-aviso-de-montaje style={{ marginTop: 6, fontSize: "var(--t-2xs)", color: "var(--ink-2)", lineHeight: 1.45 }}>
          {textoDelAvisoDeMontaje(aviso)}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 6, fontSize: "var(--t-2xs)", color: "var(--danger)" }}>{error}</div>
      )}
    </div>
  );
}

/** Una línea con lo que pasó con el aviso de montaje al cargar la
 *  planometría. Sin correo configurado, la frase de siempre de la app. */
export function textoDelAvisoDeMontaje(a: AvisoDeMontaje): string {
  if (a.estado === "espera_distribucion") return "El aviso de montaje sale cuando confirmes la distribución.";
  if (!a.smtp_listo) return "No se avisó a nadie: el correo no está configurado en el servidor.";
  if (a.montaje.length === 0) return "No se avisó a nadie: no hay mercaderista cargado para esta sede.";
  return `Salió el aviso de montaje a ${a.montaje.join(", ")}.`;
}
