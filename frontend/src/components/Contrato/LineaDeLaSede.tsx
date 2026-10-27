import { useEffect, useMemo, useState } from "react";
import { getLineaDeLaSede, type FilaDeLaLinea } from "../../api/spaces";
import { armarCarriles, diasEntre, huecoEn, libreEnLasFechas, type Carril, type MuebleDeLaLinea } from "../../utils/lineaDeLaSede";
import { sumarDias } from "../../utils/meses";
import "./linea-sede.css";

/**
 * La línea de tiempo de la sede en Contratos (rediseño UX 2026-10, etapa 4):
 * cada espacio en un carril y 12 meses a la vista, para ver cuánto dura cada
 * contrato y dónde hay huecos. Tocar un hueco dice de cuándo a cuándo está
 * disponible y lo contrata con esas fechas.
 *
 * Esta pantalla la mira el proveedor: las barras dicen «Contratado» o
 * «Reserva», nunca quién ni por cuánto (el servidor tampoco lo manda: `GET
 * /spaces/linea`). Quién tiene cada espacio está en su ficha, en Indicadores.
 */

function corta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LineaDeLaSede({ sede, muebles, desde, hasta, version, onContratar }: {
  sede: string;
  muebles: MuebleDeLaLinea[];
  /** Las fechas que se preguntaron («¿Para qué fechas?»): la banda. */
  desde: string;
  hasta: string;
  /** Cambia cuando cambia lo comercial: se vuelve a pedir la línea. */
  version: unknown;
  onContratar: (carril: Carril, desde: string, hasta: string) => void;
}) {
  const [filas, setFilas] = useState<FilaDeLaLinea[] | null>(null);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [error, setError] = useState(false);
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [hueco, setHueco] = useState<{ codigo: string; desde: string; hasta: string; dias: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    setError(false);
    getLineaDeLaSede(sede)
      .then((r) => { if (vivo) { setFilas(r.filas); setRango({ desde: r.desde, hasta: r.hasta }); } })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [sede, version]);

  const inicio = rango?.desde ?? hoyIso();
  const fin = rango?.hasta ?? sumarDias(inicio, 365);
  const total = diasEntre(inicio, fin);
  const x = (iso: string) => Math.max(0, Math.min(100, ((diasEntre(inicio, iso) - 1) / total) * 100));
  const carriles = useMemo(() => armarCarriles(muebles, filas ?? [], sede), [muebles, filas, sede]);
  const visibles = soloDisponibles ? carriles.filter((c) => libreEnLasFechas(c.barras, desde, hasta)) : carriles;
  const meses = useMemo(() => {
    const m: { x: number; texto: string }[] = [];
    const [y0, m0] = inicio.split("-").map(Number);
    for (let i = 1; i <= 12; i++) {
      const d = new Date(y0, m0 - 1 + i, 1);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      if (iso > fin) break;
      m.push({ x: x(iso), texto: d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "") + (d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : "") });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fin]);

  if (error) return <p className="lsede-nota">No se pudo leer la línea de tiempo de la sede.</p>;
  if (filas === null) return <p className="lsede-nota">Cargando la línea de tiempo…</p>;

  const banda = { izq: x(desde < inicio ? inicio : desde), der: x(hasta > fin ? fin : hasta) };
  const tocar = (c: Carril, e: React.MouseEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - caja.left) / caja.width;
    const dia = sumarDias(inicio, Math.max(0, Math.min(total - 1, Math.floor(frac * total))));
    const h = huecoEn(c.barras, dia, inicio, fin);
    setHueco(h ? { codigo: c.codigo, ...h } : null);
  };

  return (
    <div className="lsede" data-linea-de-la-sede>
      <div className="lsede-barra">
        <label className="lsede-solo">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} />
          Sólo los disponibles en tus fechas
        </label>
        <span className="lsede-clave">
          <i className="m contrato" /> Contratado <i className="m reserva" /> Reserva <i className="m banda" /> Tus fechas
        </span>
      </div>
      <div className="lsede-cab" aria-hidden>
        <span />
        <div className="escala">
          <span className="hoy" style={{ left: 0 }}>hoy</span>
          {meses.filter((m) => m.x > 4).map((m) => <span key={m.texto} style={{ left: `${m.x}%` }}>{m.texto}</span>)}
        </div>
      </div>
      <div className="lsede-filas">
        {visibles.length === 0 && <p className="lsede-nota">Ningún espacio está disponible entero en esas fechas.</p>}
        {visibles.map((c) => (
          <div key={c.codigo} className={"lsede-fila" + (c.sufijo ? " parte" : "")}>
            <span className="cod">{c.etiqueta}</span>
            <div
              className="pista"
              role="button"
              tabIndex={0}
              title="Tocá un hueco para ver de cuándo a cuándo está disponible"
              onClick={(e) => tocar(c, e)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                const h = huecoEn(c.barras, desde < inicio ? inicio : desde, inicio, fin);
                setHueco(h ? { codigo: c.codigo, ...h } : null);
              }}
            >
              <i className="banda" style={{ left: `${banda.izq}%`, width: `${Math.max(0.4, banda.der - banda.izq)}%` }} />
              {meses.map((m) => <i key={m.texto} className="raya" style={{ left: `${m.x}%` }} />)}
              {c.barras.map((b) => (
                <span
                  key={`${b.tipo}-${b.desde}`}
                  className={"b " + b.tipo}
                  style={{ left: `${x(b.desde)}%`, width: `${Math.max(0.6, x(sumarDias(b.hasta, 1)) - x(b.desde))}%` }}
                  title={`${b.tipo === "reserva" ? "Reserva" : "Contratado"} · del ${corta(b.desde)} al ${corta(b.hasta)}${b.caduca ? ` · la reserva caduca el ${corta(b.caduca)}` : ""}`}
                >
                  <span className="t">{b.tipo === "reserva" ? "Reserva" : "Contratado"}</span>
                </span>
              ))}
            </div>
            {hueco?.codigo === c.codigo && (
              <div className="lsede-hueco" role="status">
                <span>
                  <b>{c.etiqueta}</b> disponible del {corta(hueco.desde)} al {corta(hueco.hasta)} · {hueco.dias} día{hueco.dias === 1 ? "" : "s"}
                </span>
                <button type="button" className="lsede-btn" onClick={() => { setHueco(null); onContratar(c, hueco.desde, hueco.hasta); }}>
                  Contratar estas fechas
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
