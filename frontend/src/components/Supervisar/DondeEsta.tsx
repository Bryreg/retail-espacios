import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import type { UnifiedFixture } from "../../types/fixtures";

/**
 * «Dónde está» (2026-10-28, «Por vencer en el plano»): la ficha de un espacio
 * se abre también donde no hay plano —el Inicio, Pendientes, Buscar—, y decía
 * qué contrato vence pero no en qué lugar de la tienda está el mueble. Esto es
 * el plano de la sede visto desde arriba, chiquito, con ese mueble marcado, y
 * «Ver en el plano», que abre Indicadores › Plano con la ficha al lado.
 *
 * Vista desde arriba como el plano 2D (x a la derecha, z hacia abajo), cada
 * mueble con su huella girada (`rotY`). Es un dibujo de ubicación, no el
 * plano: sin rótulos ni estados, sólo el que se busca y su código.
 */
export function DondeEsta({ fixtures, fixtureId, codigo, onVerEnPlano }: {
  fixtures: readonly UnifiedFixture[];
  fixtureId: string;
  /** El código como se lee en la ficha («PUN-07·A»). */
  codigo: string;
  onVerEnPlano?: () => void;
}) {
  const dibujo = useMemo(() => {
    const huellas = fixtures.map((f) => {
      const a = -f.rotY;
      const c = Math.cos(a), s = Math.sin(a);
      const pts = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
        const x = (u * f.w) / 2, z = (v * f.d) / 2;
        return [f.cx + x * c - z * s, f.cz + x * s + z * c] as [number, number];
      });
      return { id: f.id, pts };
    });
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const h of huellas) for (const [x, z] of h.pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    if (!Number.isFinite(x0)) return null;
    const m = Math.max(0.6, Math.max(x1 - x0, z1 - z0) * 0.05);
    const propio = huellas.find((h) => h.id === fixtureId);
    const centro = propio
      ? propio.pts.reduce(([sx, sz], [x, z]) => [sx + x / 4, sz + z / 4], [0, 0] as [number, number])
      : null;
    return { huellas, propio, centro, vb: [x0 - m, z0 - m, x1 - x0 + 2 * m, z1 - z0 + 2 * m] as const };
  }, [fixtures, fixtureId]);

  if (!dibujo?.propio || !dibujo.centro) return null;
  const { huellas, propio, centro, vb } = dibujo;
  const r = Math.max(vb[2], vb[3]) * 0.06;
  const p = (pts: [number, number][]) => pts.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join(" ");
  return (
    <section className="donde-esta" data-donde-esta aria-label={`Dónde está ${codigo}`}>
      <div className="donde-esta-cab">
        <span className="rotulo">Dónde está</span>
        {onVerEnPlano && (
          <button type="button" className="link" onClick={onVerEnPlano} data-ver-en-el-plano>
            Ver en el plano <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <svg viewBox={vb.map((n) => n.toFixed(2)).join(" ")} role="img"
        aria-label={`${codigo}, marcado en el plano de la sede`} preserveAspectRatio="xMidYMid meet">
        {huellas.filter((h) => h.id !== propio.id).map((h) => (
          <polygon key={h.id} points={p(h.pts)} className="otro" />
        ))}
        <circle cx={centro[0]} cy={centro[1]} r={r} className="anillo" />
        <polygon points={p(propio.pts)} className="propio" />
      </svg>
    </section>
  );
}
