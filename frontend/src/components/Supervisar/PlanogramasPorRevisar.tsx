import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Eye, ScanEye, Send } from "lucide-react";
import { leerSupervision, type CaraPorSupervisar } from "../../api/supervision";
import { lineaParaRevisar, ORDEN_DE_SUPERVISION, pastillaParaRevisar } from "../../utils/supervision";
import { EncabezadoDeSeccion, Mira } from "./piezas";
import { tituloDeSeccion, type SeccionDeRevisar } from "./paraRevisar";

/**
 * Los planogramas en «Para revisar» → Hoy (fase 4 de la distribución,
 * 2026-10-25, dibujo aprobado «Supervisar planogramas»): cuatro secciones, en
 * el orden del dibujo —montado por revisar, no coincide, no se pudo, sin
 * montar—. Sale de `GET /api/planogramas/supervision?sede=`, que sólo trae las
 * caras que ese rol puede revisar (las mismas que puede publicar). Sin
 * proveedores ni plata: lo vendido no entra (eso es el montaje de los
 * contratos, que sigue como siempre).
 *
 * Si el servidor todavía no tiene la ruta, la lista queda vacía y no se dice
 * nada: es un aviso de más, no algo de lo que dependa la pantalla.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export const SECCION_DE_SUPERVISION: Record<CaraPorSupervisar["estado"], SeccionDeRevisar> = {
  por_revisar: "planograma_por_revisar",
  no_coincide: "planograma_no_coincide",
  no_se_pudo: "planograma_no_se_pudo",
  sin_montar: "planograma_sin_montar",
};

/** La clave de la fila (`data-aviso`): una por versión. */
export const claveDeSupervision = (c: Pick<CaraPorSupervisar, "version_id">): string => `pg:${c.version_id}`;

export function usePlanogramasPorRevisar({ sede, activo }: { sede: string; activo: boolean }) {
  const [filas, setFilas] = useState<CaraPorSupervisar[]>([]);
  const [hoy, setHoy] = useState("");
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo || !sede) { setFilas([]); return; }
    let vivo = true;
    leerSupervision(sede)
      .then((r) => { if (vivo) { setFilas(Array.isArray(r?.caras) ? r.caras : []); setHoy(r?.hoy ?? ""); } })
      .catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { filas, hoy, recargar };
}

export function PlanogramasPorRevisar({ filas, hoy, onAbrir, onMandar }: {
  filas: readonly CaraPorSupervisar[];
  hoy: string;
  /** La ficha de la revisión (lo planificado al lado de lo montado). */
  onAbrir: (c: CaraPorSupervisar) => void;
  /** «Mandar la guía» de una que rige sin que nadie avise. */
  onMandar: (c: CaraPorSupervisar) => void;
}) {
  if (filas.length === 0) return null;
  return (
    <div data-planogramas-por-revisar>
      {ORDEN_DE_SUPERVISION.map((estado) => {
        const deEsta = filas.filter((c) => c.estado === estado);
        if (deEsta.length === 0) return null;
        return (
          <div key={estado} data-seccion-planograma={estado}>
            <EncabezadoDeSeccion titulo={tituloDeSeccion(SECCION_DE_SUPERVISION[estado], "hoy")} valor={deEsta.length} />
            {deEsta.map((c) => (
              <div key={c.version_id} className="fila-r" data-aviso={claveDeSupervision(c)}>
                <span className={`pill mono ${estado === "por_revisar" ? "entra" : "ocupado"}`}>{pastillaParaRevisar(c)}</span>
                <div className="dat">
                  <b className="mono">{c.codigo} · {c.cara} · versión {c.numero}</b>
                  <span>{lineaParaRevisar(c, hoy)}</span>
                </div>
                {estado === "sin_montar" ? (
                  <button type="button" className="btn-s" onClick={() => onMandar(c)} data-mandar-guia-de={c.version_id}>
                    <Send {...ICONO} /> Mandar la guía
                  </button>
                ) : (
                  <button type="button" className="btn-s" onClick={() => onAbrir(c)} data-revisar-montaje={c.version_id}>
                    {estado === "por_revisar" ? <ScanEye {...ICONO} /> : <Eye {...ICONO} />}
                    {estado === "por_revisar" ? " Revisar" : " Ver"}
                  </button>
                )}
                <ChevronRight {...ICONO} className="ir" />
                <Mira />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
