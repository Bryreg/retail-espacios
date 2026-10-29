import { useCallback, useEffect, useState } from "react";
import { ChevronRight, FileUp } from "lucide-react";
import { montajesPendientes, type MontajePendiente } from "../../api/montajesPendientes";
import { fechaEnCurso } from "../../utils/propuesta";
import { useCodigoVisible } from "./CobrosYReservas";
import { EncabezadoDeSeccion, Mira } from "./piezas";
import { DIAS_PARA_HOY } from "./paraRevisar";

/**
 * «Falta planometría» (decisión del dueño, Supervisar PR 2): los contratos con
 * montaje por delante cuyo correo de montaje espera la planometría —se carga
 * sólo en Supervisar, en la ficha del espacio, nunca en Vender—. Desde el
 * 2026-10-29 sólo la esperan las ventas enteras o por partes, y les sirve
 * también un planograma publicado de la cara; un porcentaje ya no sale acá:
 * su plano es la zona confirmada («Distribuir esta cara»). Sale de
 * `GET /api/montajes/pendientes?sede=` (las filas con `falta_planometria`).
 * Con 7 días o menos para empezar va en «Hoy»; con más margen, en «30 días».
 * «Cargar planometría» abre la ficha del espacio en su planometría.
 *
 * SÓLO ADMINISTRACIÓN y SÓLO SUPERVISAR: lleva el proveedor. Quien lo monta lo
 * pone adentro de `isAdmin &&`, el hook no pide nada si no está `activo`, y
 * Vender no llega a este módulo ni a `api/montajesPendientes` (`probar-vender`).
 * Si el servidor todavía no tiene la ruta, la lista queda vacía y no se dice
 * nada: es un aviso de más, no algo de lo que dependa la pantalla.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Los contratos de la sede a los que les falta la planometría. */
export function useFaltaPlanometria({ sede, activo }: { sede: string; activo: boolean }) {
  const [filas, setFilas] = useState<MontajePendiente[]>([]);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo || !sede) { setFilas([]); return; }
    let vivo = true;
    montajesPendientes(sede)
      .then((r) => { if (vivo) setFilas((Array.isArray(r) ? r : []).filter((x) => x.falta_planometria)); })
      .catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [sede, activo, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { filas, recargar };
}

/** «hoy», «6d», «corre»: cuánto falta para que empiece. */
function cuantoFalta(dias: number): string {
  if (dias < 0) return "corre";
  if (dias === 0) return "hoy";
  return `${dias}d`;
}

export function FaltaPlanometria({ sede, filas, titulo, onCargar }: {
  sede: string;
  filas: readonly MontajePendiente[];
  titulo: string;
  /** Abrir la ficha del espacio en su planometría: la fila (con el contrato
   *  que la espera, `lease_id`) y su código como se lee (`GON-01·A·PC1`). */
  onCargar: (fila: MontajePendiente, codigoVisible: string) => void;
}) {
  const visible = useCodigoVisible(sede);
  if (filas.length === 0) return null;
  return (
    <div data-falta-planometria>
      <EncabezadoDeSeccion titulo={titulo} valor={filas.length} />
      {filas.map((f) => (
        <div key={f.lease_id} className="fila-r" data-aviso={`pl:${f.lease_id}`}>
          <span className={`pill mono ${f.dias_para_empezar <= DIAS_PARA_HOY ? "ocupado" : "entra"}`}>
            {cuantoFalta(f.dias_para_empezar)}
          </span>
          <div className="dat">
            <b className="mono">{visible(f.espacio)}</b>
            <span>
              {f.proveedor ?? "—"}
              {f.dias_para_empezar > 0 ? ` · empieza el ${fechaEnCurso(f.desde)}` : " · ya corre"}
              {f.falta_distribucion ? " · y falta distribuir" : ""}
            </span>
          </div>
          <button type="button" className="btn-s" onClick={() => onCargar(f, visible(f.espacio))}
            title="Subí el archivo en la ficha, o publicá el planograma de la cara: con cualquiera de los dos sale el aviso de montaje.">
            <FileUp {...ICONO} /> Cargar planometría
          </button>
          <ChevronRight {...ICONO} className="ir" />
          <Mira />
        </div>
      ))}
    </div>
  );
}
