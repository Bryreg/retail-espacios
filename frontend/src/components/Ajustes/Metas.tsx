import { useEffect, useState } from "react";
import { getMetas, guardarMetas, type Metas } from "../../api/indicadores";
import { describeError } from "../../api/client";

type Fila = { ocupacion: string; canon_tarifa: string };
const aTexto = (m?: { ocupacion: number; canon_tarifa: number }): Fila => ({ ocupacion: m ? String(m.ocupacion) : "", canon_tarifa: m ? String(m.canon_tarifa) : "" });

/** Un número entero entre 0 y el tope, o `null` (vacío o mal escrito). */
function entero(t: string, tope: number): number | null {
  if (!/^\d{1,3}$/.test(t.trim())) return null;
  const n = Number(t.trim());
  return n >= 0 && n <= tope ? n : null;
}

/**
 * Ajustes › Comercial › Metas por sede (rediseño UX 2026-10, etapa 8): la
 * ocupación y el canon ÷ tarifa que se esperan, en general y, si hace falta,
 * por sede (vacío: usa la general). Es lo que Indicadores pinta en ámbar o en
 * rojo. Se guarda en `PUT /layout/metas` (bitácora `ajustes.metas`).
 */
export default function MetasPorSede({ sedes }: { sedes: string[] }) {
  const [metas, setMetas] = useState<Metas | null>(null);
  const [general, setGeneral] = useState<Fila>({ ocupacion: "", canon_tarifa: "" });
  const [porSede, setPorSede] = useState<Record<string, Fila>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getMetas().then((m) => {
      setMetas(m);
      setGeneral(aTexto(m.general));
      setPorSede(Object.fromEntries(sedes.map((s) => [s, aTexto(m.sedes[s])])));
    }).catch((e) => setMsg({ ok: false, text: describeError(e, "No se pudieron leer las metas.") }));
  }, [sedes]);

  const g = { ocupacion: entero(general.ocupacion, 100), canon_tarifa: entero(general.canon_tarifa, 200) };
  const errores: string[] = [];
  if (g.ocupacion === null) errores.push("La ocupación general va de 0 a 100.");
  if (g.canon_tarifa === null) errores.push("El canon ÷ tarifa general va de 0 a 200.");
  const sedesOut: Record<string, { ocupacion: number; canon_tarifa: number }> = {};
  for (const s of sedes) {
    const f = porSede[s];
    if (!f || (!f.ocupacion.trim() && !f.canon_tarifa.trim())) continue;
    const o = f.ocupacion.trim() ? entero(f.ocupacion, 100) : g.ocupacion;
    const c = f.canon_tarifa.trim() ? entero(f.canon_tarifa, 200) : g.canon_tarifa;
    if (o === null || c === null) { errores.push(`Revisá las metas de ${s}.`); continue; }
    sedesOut[s] = { ocupacion: o, canon_tarifa: c };
  }

  async function guardar() {
    if (errores.length || g.ocupacion === null || g.canon_tarifa === null) return;
    setGuardando(true); setMsg(null);
    try {
      const m = await guardarMetas({ general: { ocupacion: g.ocupacion, canon_tarifa: g.canon_tarifa }, sedes: sedesOut });
      setMetas(m);
      setMsg({ ok: true, text: "Metas guardadas. Indicadores ya las usa." });
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, "No se pudieron guardar las metas.") });
    } finally { setGuardando(false); }
  }

  if (!metas) return <p className="aj-nota">{msg?.text ?? "Leyendo las metas…"}</p>;
  return (
    <div className="aj-metas" data-metas>
      <p className="aj-nota">
        Debajo de la meta, la cifra se ve en ámbar; muy por debajo (80 % de ocupación, 85 % de canon ÷ tarifa), en rojo.
        {metas.por_defecto && " Todavía rigen las de fábrica: 90 % y 95 %."}
      </p>
      <table className="aj-tabla">
        <thead><tr><th>Dónde</th><th className="n">Ocupación %</th><th className="n">Canon ÷ tarifa %</th></tr></thead>
        <tbody>
          <tr data-meta="general">
            <td><b>General</b></td>
            <td className="n"><input inputMode="numeric" aria-label="Meta general de ocupación" value={general.ocupacion} onChange={(e) => setGeneral({ ...general, ocupacion: e.target.value })} /></td>
            <td className="n"><input inputMode="numeric" aria-label="Meta general de canon ÷ tarifa" value={general.canon_tarifa} onChange={(e) => setGeneral({ ...general, canon_tarifa: e.target.value })} /></td>
          </tr>
          {sedes.map((s) => (
            <tr key={s} data-meta={s}>
              <td>{s}</td>
              <td className="n"><input inputMode="numeric" placeholder={general.ocupacion} aria-label={`Meta de ocupación de ${s}`} value={porSede[s]?.ocupacion ?? ""} onChange={(e) => setPorSede({ ...porSede, [s]: { ...(porSede[s] ?? { ocupacion: "", canon_tarifa: "" }), ocupacion: e.target.value } })} /></td>
              <td className="n"><input inputMode="numeric" placeholder={general.canon_tarifa} aria-label={`Meta de canon ÷ tarifa de ${s}`} value={porSede[s]?.canon_tarifa ?? ""} onChange={(e) => setPorSede({ ...porSede, [s]: { ...(porSede[s] ?? { ocupacion: "", canon_tarifa: "" }), canon_tarifa: e.target.value } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="aj-nota">Una sede vacía usa la general.</p>
      {errores.length > 0 && <p className="aj-error" role="alert">{errores[0]}</p>}
      <div className="aj-acciones">
        <button type="button" className="aj-btn principal" disabled={guardando || errores.length > 0} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar las metas"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "aj-ok" : "aj-error"} role="status">{msg.text}</p>}
    </div>
  );
}
