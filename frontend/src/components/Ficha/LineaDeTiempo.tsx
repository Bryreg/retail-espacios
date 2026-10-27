import { useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { getHistorialDelEspacio, type ContratoDelHistorial } from "../../api/spaces";
import { aFecha, esDeLaCara, libreDesde } from "../../utils/lineaDeTiempo";
import "./linea.css";

/**
 * La línea de tiempo de la ficha del espacio (rediseño UX 2026-10, etapa 3):
 * los próximos 12 meses, hasta cuándo está ocupado, qué tiene comprometido a
 * futuro y desde cuándo queda disponible; debajo, los contratos que ya
 * terminaron. Sale de `GET /spaces/by-code/{code}/historial` (etapa 0): hasta
 * entonces lo terminado no tenía de dónde leerse.
 *
 * El historial de una cara A trae también la B (su código es el de la A más
 * `-B`): acá se separa. La plata (al mes) sólo le llega a administración.
 */

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const DIA = 86_400_000;

function corta(fecha: string | Date | null): string {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? aFecha(fecha) : fecha;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function pesos(n: number): string {
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

export default function LineaDeTiempo({ codigo, esAdmin }: {
  /** El código completo de la cara (`CENTRO-GON-01`, `CENTRO-GON-01-B`). */
  codigo: string;
  esAdmin: boolean;
}) {
  const [filas, setFilas] = useState<ContratoDelHistorial[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    setFilas(null);
    setError(false);
    getHistorialDelEspacio(codigo)
      .then((r) => { if (vivo) setFilas(r.filter((f) => esDeLaCara(f.espacio, codigo))); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [codigo]);

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const fin = useMemo(() => new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate()), [hoy]);
  const largo = fin.getTime() - hoy.getTime();
  /** Las marcas de los meses: el primero de cada mes dentro de los 12. */
  const meses = useMemo(() => {
    const m: { x: number; texto: string; rotulo: boolean }[] = [];
    let ultimo = 0;
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      if (d >= fin) break;
      const texto = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")
        + (d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : "");
      const x = ((d.getTime() - hoy.getTime()) / largo) * 100;
      // Una raya por mes; el nombre, sólo donde entra sin pisar «hoy» ni al
      // de al lado (en el cajón de la ficha un mes mide unos 35 px).
      const rotulo = x - ultimo >= 14;
      if (rotulo) ultimo = x;
      m.push({ x, texto, rotulo });
    }
    return m;
  }, [hoy, fin, largo]);

  if (error) return <p className="linea-nota">No se pudo leer la historia de este espacio.</p>;
  if (filas === null) return <p className="linea-nota">Cargando la línea de tiempo…</p>;

  const vivas = filas.filter((f) => (f.estado === "vigente" || f.estado === "proximo") && f.desde && f.hasta);
  /** Un carril por espacio: la cara entera primero y después cada parte. */
  const carriles = [...new Set([codigo.toUpperCase(), ...vivas.map((f) => f.espacio.toUpperCase())])]
    .filter((e) => e === codigo.toUpperCase() || vivas.some((f) => f.espacio.toUpperCase() === e));
  const desde = libreDesde(filas, codigo, hoy);
  const libreHoy = desde.getTime() === hoy.getTime();
  const partesVivas = vivas.filter((f) => f.espacio.toUpperCase() !== codigo.toUpperCase()).length;
  const anteriores = filas.filter((f) => f.estado === "terminado" || f.estado === "cancelado" || f.estado === "reemplazado").slice(0, 5);

  return (
    <section className="linea-ficha" data-linea-de-tiempo>
      <div className="linea-tit"><CalendarRange {...ICONO} /> Los próximos 12 meses</div>
      <p className="linea-libre" data-libre-desde={libreHoy ? "hoy" : iso(desde)}>
        {libreHoy && partesVivas > 0
          ? "La cara entera no tiene contrato"
          : libreHoy
          ? "Disponible hoy"
          : `Ocupado hasta el ${corta(new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - 1))} · disponible desde el ${corta(desde)}`}
        {partesVivas > 0 && ` · ${partesVivas} parte${partesVivas === 1 ? "" : "s"} contratada${partesVivas === 1 ? "" : "s"}`}
      </p>
      <div className="linea-escala" aria-hidden>
        <span className="hoy" style={{ left: 0 }}>hoy</span>
        {meses.filter((m) => m.rotulo).map((m) => <span key={m.texto} style={{ left: `${m.x}%` }}>{m.texto}</span>)}
      </div>
      {carriles.map((carril) => {
        const deEste = vivas.filter((f) => f.espacio.toUpperCase() === carril);
        const sufijo = carril === codigo.toUpperCase() ? "Entera" : carril.slice(codigo.length + 1);
        return (
          <div className="linea-carril" key={carril}>
            <span className="quien">{sufijo}</span>
            <div className="pista">
              {meses.map((m) => <i key={m.texto} className="raya" style={{ left: `${m.x}%` }} />)}
              {deEste.map((f) => {
                const a = Math.max(0, aFecha(f.desde!).getTime() - hoy.getTime());
                const b = Math.min(largo, aFecha(f.hasta!).getTime() + DIA - hoy.getTime());
                if (b <= 0 || a >= largo) return null;
                const quien = [f.proveedor, f.marca].filter(Boolean).join(" · ") || "Sin proveedor";
                return (
                  <span
                    key={f.lease_id}
                    className={"barra " + f.estado}
                    style={{ left: `${(a / largo) * 100}%`, width: `${((b - a) / largo) * 100}%` }}
                    title={`${quien} · del ${corta(f.desde)} al ${corta(f.hasta)}${f.estado === "proximo" ? " · próximo" : ""}`}
                  >
                    <span className="txt">{f.proveedor ?? "—"}</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      {anteriores.length > 0 && (
        <div className="linea-antes">
          <div className="linea-sub">Contratos anteriores</div>
          <ul>
            {anteriores.map((f) => (
              <li key={f.lease_id}>
                <span className="quien">{f.proveedor ?? "Sin proveedor"}{f.espacio.toUpperCase() !== codigo.toUpperCase() ? ` · ${f.espacio.slice(codigo.length + 1)}` : ""}</span>
                <span className="cuando">{corta(f.desde)} – {corta(f.hasta)}{f.estado === "cancelado" ? " · cancelado" : f.estado === "reemplazado" ? " · reemplazado al editarlo" : ""}</span>
                {esAdmin && typeof f.valor_al_mes === "number" && (
                  <span className="plata">{pesos(f.valor_al_mes)} al mes</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
