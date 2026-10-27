import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CornerDownLeft, MapPin, Search, Zap } from "lucide-react";
import { ACCIONES, buscarAcciones, buscarEnElGlosario, coincide, type Accion, type ContextoDeAccion } from "../../acciones";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";
import { contractPhase, isDoubleGondola, isRentable } from "../../types/fixtures";
import { nombreDeMueble } from "../../utils/nomenclatura";
import { useModalAbierto } from "../../tema";

const ICONO = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

function fechaLarga(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Un espacio por código, con su estado y lo que corresponde hacer. */
interface EspacioEncontrado { id: string; cara: "A" | "B"; codigo: string; estado: string; accion: string }

type Resultado =
  | { tipo: "accion"; a: Accion }
  | { tipo: "espacio"; e: EspacioEncontrado }
  | { tipo: "termino"; t: { termino: string; definicion: string } };

/**
 * El buscador de funciones (rediseño UX 2026-10, etapa 8): Ctrl K o la lupa.
 * Encuentra una función por su nombre o por cómo le dice la gente, un espacio
 * por su código —con su estado y la acción que corresponde— y un término del
 * glosario. ↑ ↓ para moverse, Enter para abrir, Esc para cerrar. Abajo, «Ver
 * el mapa de todas las funciones».
 */
export default function Buscador({ esAdmin, ctx, onCerrar }: { esAdmin: boolean; ctx: ContextoDeAccion; onCerrar: () => void }) {
  useModalAbierto();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [mapa, setMapa] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fixtures = useFixtureStore(selectFixtures);
  const pedirVender = useFixtureStore((s) => s.pedirVender);

  useEffect(() => { campo.current?.focus(); }, []);

  const espacios = useMemo<EspacioEncontrado[]>(() => {
    if (!esAdmin) return [];
    const out: EspacioEncontrado[] = [];
    for (const f of fixtures) {
      if (!isRentable(f)) continue;
      const caras: ["A" | "B", { status?: string; startDate?: string; endDate?: string }, string][] = [["A", f, f.code]];
      if (isDoubleGondola(f) && f.faceB) caras.push(["B", f.faceB, `${f.code}-B`]);
      for (const [cara, d, cod] of caras) {
        const fase = contractPhase({ status: (d.status ?? "free") as never, startDate: d.startDate ?? "", endDate: d.endDate ?? "" });
        const ocupado = fase === "vigente";
        out.push({
          id: f.id, cara, codigo: nombreDeMueble({ code: cod }),
          estado: ocupado ? `vence el ${fechaLarga(d.endDate ?? "")}` : fase === "pendiente" ? `contratado desde el ${fechaLarga(d.startDate ?? "")}` : d.status === "reserved" ? "reservado" : "disponible",
          accion: ocupado ? "Renovar contrato" : fase === "pendiente" ? "Ver el contrato" : "Nuevo contrato",
        });
      }
    }
    return out;
  }, [fixtures, esAdmin]);

  const resultados = useMemo<Resultado[]>(() => {
    const texto = q.trim();
    if (!texto && !mapa) return [];
    const acciones = (mapa && !texto ? ACCIONES.filter((a) => esAdmin || !a.admin) : buscarAcciones(texto, esAdmin)).map((a) => ({ tipo: "accion" as const, a }));
    if (!texto) return acciones;
    const es = espacios.filter((e) => coincide(texto, e.codigo)).slice(0, 8).map((e) => ({ tipo: "espacio" as const, e }));
    const ts = buscarEnElGlosario(texto).map((t) => ({ tipo: "termino" as const, t }));
    return [...acciones, ...es, ...ts];
  }, [q, mapa, espacios, esAdmin]);

  useEffect(() => { setI(0); }, [q, mapa]);

  function abrir(r: Resultado) {
    if (r.tipo === "termino") { setAbierto((x) => (x === r.t.termino ? null : r.t.termino)); return; }
    onCerrar();
    if (r.tipo === "accion") r.a.hacer(ctx);
    else { pedirVender(r.e.id, r.e.cara); ctx.ir("contratos"); }
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onCerrar(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(resultados.length - 1, x + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    if (e.key === "Enter" && resultados[i]) { e.preventDefault(); abrir(resultados[i]); }
  }

  const grupo = (t: Resultado["tipo"]) => (t === "accion" ? (mapa && !q.trim() ? "Todas las funciones" : "Acciones") : t === "espacio" ? "Espacios" : "Glosario");
  let anterior: string | null = null;

  return (
    <div className="buscador-capa" data-capa-modal onMouseDown={onCerrar}>
      <div className="buscador" role="dialog" aria-modal="true" aria-label="Buscar funciones, espacios y términos" onMouseDown={(e) => e.stopPropagation()} data-buscador>
        <label className="buscador-campo">
          <Search {...ICONO} />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={tecla}
            placeholder="Buscá una función, un espacio (PUN-07) o un término…" aria-label="Buscar"
            role="combobox" aria-expanded={resultados.length > 0} aria-controls="buscador-lista"
            aria-activedescendant={resultados[i] ? `buscador-${i}` : undefined} />
          <kbd>Esc</kbd>
        </label>
        <ul id="buscador-lista" role="listbox" className="buscador-lista">
          {resultados.map((r, n) => {
            const g = grupo(r.tipo);
            const titulo = g !== anterior ? <li className="buscador-grupo" role="presentation" key={`g-${g}`}>{g}</li> : null;
            anterior = g;
            const activo = n === i;
            return [
              titulo,
              <li key={`${r.tipo}-${n}`} id={`buscador-${n}`} role="option" aria-selected={activo} className="buscador-fila"
                onMouseEnter={() => setI(n)} onClick={() => abrir(r)} data-resultado={r.tipo}>
                {r.tipo === "accion" ? (
                  <><Zap {...ICONO} /><span className="t"><b>{r.a.texto}</b><small>{r.a.donde} · {r.a.detalle}</small></span></>
                ) : r.tipo === "espacio" ? (
                  <><MapPin {...ICONO} /><span className="t"><b className="mono">{r.e.codigo}</b><small>{r.e.estado} → {r.e.accion}</small></span></>
                ) : (
                  <><BookOpen {...ICONO} /><span className="t"><b>{r.t.termino}</b>{abierto === r.t.termino ? <small className="def">{r.t.definicion}</small> : <small>Enter para leer la definición</small>}</span></>
                )}
                {activo && <CornerDownLeft {...ICONO} className="enter" />}
              </li>,
            ];
          })}
          {q.trim() && resultados.length === 0 && <li className="buscador-nada">No encontré nada con «{q.trim()}».</li>}
        </ul>
        <footer className="buscador-pie">
          <span>↑ ↓ moverse · Enter abrir · Esc cerrar</span>
          <button type="button" className="buscador-mapa" onClick={() => { setMapa((v) => !v); setQ(""); campo.current?.focus(); }} aria-pressed={mapa}>
            {mapa ? "Ocultar el mapa" : "Ver el mapa de todas las funciones"}
          </button>
        </footer>
      </div>
    </div>
  );
}
