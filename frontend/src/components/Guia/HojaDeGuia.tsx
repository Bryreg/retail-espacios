import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, Check, Info, Minus, Plus, Printer, Ruler } from "lucide-react";
import type { Guia } from "../../api/guia";
import type { ColorDeDestino } from "../../api/planogramas";
import {
  avisoDeLaGuia, cambiosDeLaGuia, cm, destinosDeLaGuia, nivelesDesdeArriba, vaciosDeLaGuia, vigenciaDeLaGuia,
  type DestinoDeLaGuia,
} from "../../utils/guia";
import { pct } from "../../utils/participaciones";
import { textoDelTipo } from "../../utils/planograma";
import { bordesUtiles } from "../../utils/piezas";
import { guiasDeCara } from "../../utils/superficie";
import { trapecios, type Poligono, type Punto } from "../../utils/zonasGeometria";
import "./guia.css";

/**
 * La hoja de la guía de montaje (fase 3 de la distribución, dibujo aprobado
 * el 2026-10-24): una por cara y por versión, «para dummies». Tres pasos —qué
 * cambia, qué va dónde, al terminar— con la cara a escala, cada destino con
 * un número grande, su color Y su trama (se lee en una fotocopia en blanco y
 * negro), los estantes contados desde arriba y una regla en centímetros.
 *
 * Siempre en papel claro, en los dos temas: es lo que se imprime. Sin precios
 * ni nombres de proveedores; lo ya asignado (vendido) va en gris «no tocar».
 *
 * `marcable`: en el teléfono, los cuadros de «Listo» se tocan (no se guardan:
 * son la lista de quien está montando).
 */

/** Los colores de los destinos en papel (los del tema claro, fijos). */
export const PAPEL: Record<ColorDeDestino, { c: string; s: string }> = {
  d1: { c: "#1A67C2", s: "#DCE8F7" }, d2: { c: "#C2410C", s: "#F8E3D8" }, d3: { c: "#6D28D9", s: "#E8DFFA" },
  d4: { c: "#A4338F", s: "#F4DFEF" }, d5: { c: "#0E7490", s: "#D6EEF3" }, d6: { c: "#8A5A14", s: "#F1E6D3" },
};
const TRAMAS = ["puntos", "diagonal", "cuadros", "rayas", "contra", "verticales"] as const;
const ICONO = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

const camino = (pts: readonly Punto[], W: number, H: number) =>
  pts.map(([u, v], i) => `${i === 0 ? "M" : "L"}${u * W} ${(1 - v) * H}`).join(" ") + " Z";

function Trama({ id, tipo, c }: { id: string; tipo: (typeof TRAMAS)[number]; c: string }) {
  const s = 0.045;
  switch (tipo) {
    case "puntos": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse"><circle cx={s / 2} cy={s / 2} r={s * 0.17} fill={c} fillOpacity={0.6} /></pattern>;
    case "diagonal": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1={0} y1={0} x2={0} y2={s} stroke={c} strokeOpacity={0.5} strokeWidth={s * 0.24} /></pattern>;
    case "cuadros": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse"><path d={`M0 ${s / 2}h${s}M${s / 2} 0v${s}`} stroke={c} strokeOpacity={0.45} strokeWidth={s * 0.14} /></pattern>;
    case "rayas": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse"><line x1={0} y1={s / 2} x2={s} y2={s / 2} stroke={c} strokeOpacity={0.5} strokeWidth={s * 0.22} /></pattern>;
    case "contra": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={s} stroke={c} strokeOpacity={0.5} strokeWidth={s * 0.24} /></pattern>;
    case "verticales": return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse"><line x1={s / 2} y1={0} x2={s / 2} y2={s} stroke={c} strokeOpacity={0.5} strokeWidth={s * 0.2} /></pattern>;
  }
}

/** La cara a escala (metros), con sus destinos numerados, los estantes
 *  contados desde arriba y la regla en cm. */
export function CaraDeLaGuia({ guia, destinos, repisas }: { guia: Guia; destinos: DestinoDeLaGuia[]; repisas: number[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { ancho: W, alto: H, exclusiones: E } = guia.superficie;
  const b = bordesUtiles(E);
  const niveles = nivelesDesdeArriba(E, repisas);
  const k = Math.max(W, H);
  const fs = k * 0.032;
  const mI = k * 0.075, mB = k * 0.11, m = k * 0.02;
  const relleno = (P: readonly Poligono[]) => trapecios([...P], E).map((t) => camino(t, W, H)).join(" ");
  const marcas = [...new Set([0, ...destinos.flatMap((d) => (d.poligono ? [d.hastaCm] : [])), Math.round(W * 1000) / 10])].sort((a, z) => a - z);
  // Las rayas van todas; el número, sólo si no pisa al de al lado (el 0 y el
  // total, siempre).
  // El último lleva « cm» y se apoya hacia la izquierda: pide más aire.
  const total = marcas[marcas.length - 1], aire = total * 0.08;
  const conNumero = new Set<number>([0, total]);
  let ultimo = 0;
  for (const c of marcas.slice(1, -1)) if (c - ultimo >= aire && total - c >= aire * 1.75) { conNumero.add(c); ultimo = c; }
  return (
    <svg viewBox={`${-mI} ${-m} ${W + mI + m} ${H + m + mB}`} className="guia-cara" role="img"
      aria-label={`${guia.codigo} cara ${guia.cara}, versión ${guia.version.numero}, con sus destinos numerados`}>
      <defs>
        <pattern id={`${uid}-r`} width={k * 0.025} height={k * 0.025} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={k * 0.025} stroke="#9AA3A8" strokeWidth={k * 0.006} />
        </pattern>
        {destinos.map((d, i) => <Trama key={d.destino_id} id={`${uid}-t${d.destino_id}`} tipo={TRAMAS[i % TRAMAS.length]} c={PAPEL[d.color]?.c ?? "#555"} />)}
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-r)`} stroke="#0A1014" strokeWidth={k * 0.007} />
      <path d={trapecios([[[0, 0], [1, 0], [1, 1], [0, 1]]], E).map((t) => camino(t, W, H)).join(" ")} fill="#fff" />
      {guia.asignado.map((P, i) => (
        <g key={`a${i}`}>
          <path d={relleno([P])} fill="#E7EAEC" />
          <path d={relleno([P])} fill={`url(#${uid}-r)`} />
          <path d={camino(P, W, H)} fill="none" stroke="#6B7780" strokeWidth={k * 0.006} />
        </g>
      ))}
      {destinos.filter((d) => d.poligono).map((d) => {
        const col = PAPEL[d.color] ?? { c: "#555", s: "#eee" };
        const P = [d.poligono!];
        const xs = d.poligono!.map((p) => p[0]), ys = d.poligono!.map((p) => p[1]);
        const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * W, cy = (1 - (Math.min(...ys) + Math.max(...ys)) / 2) * H;
        const anchoPx = (Math.max(...xs) - Math.min(...xs)) * W;
        const nombre = d.nombre.length * fs * 0.6 > anchoPx * 0.94 ? `${d.nombre.slice(0, Math.max(2, Math.floor((anchoPx * 0.94) / (fs * 0.6)) - 1))}…` : d.nombre;
        return (
          <g key={d.destino_id} data-destino-en-la-guia={d.numero}>
            <path d={relleno(P)} fill={col.s} />
            <path d={relleno(P)} fill={`url(#${uid}-t${d.destino_id})`} />
            <path d={camino(d.poligono!, W, H)} fill="none" stroke={col.c} strokeWidth={k * 0.007} />
            <circle cx={cx} cy={cy - fs * 1.1} r={fs * 1.25} fill="#0A1014" />
            <text x={cx} y={cy - fs * 1.1} textAnchor="middle" dominantBaseline="central" className="guia-num" style={{ fontSize: fs * 1.45 }}>{d.numero}</text>
            <text x={cx} y={cy + fs * 1.05} textAnchor="middle" dominantBaseline="central" className="guia-nom" style={{ fontSize: fs, strokeWidth: fs * 0.3 }}>{nombre}</text>
          </g>
        );
      })}
      {repisas.filter((v) => v > b.v0 + 0.005 && v < b.v1 - 0.005).map((v, i) => (
        <rect key={i} x={b.u0 * W} y={(1 - v) * H - k * 0.004} width={(b.u1 - b.u0) * W} height={k * 0.008} fill="#0A1014" opacity={0.75} />
      ))}
      {niveles.map(([a, z], i) => (
        <g key={`n${i}`} data-estante={i + 1}>
          <circle cx={-mI * 0.5} cy={(1 - (a + z) / 2) * H} r={fs * 0.8} fill="#fff" stroke="#0A1014" strokeWidth={k * 0.003} />
          <text x={-mI * 0.5} y={(1 - (a + z) / 2) * H} textAnchor="middle" dominantBaseline="central" className="guia-est" style={{ fontSize: fs * 0.85 }}>{i + 1}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={H + mB * 0.35} y2={H + mB * 0.35} stroke="#0A1014" strokeWidth={k * 0.003} />
      {marcas.map((c, i) => (
        <g key={c}>
          <line x1={c / 100} x2={c / 100} y1={H + mB * 0.2} y2={H + mB * 0.5} stroke="#0A1014" strokeWidth={k * 0.003} />
          {conNumero.has(c) && <text x={c / 100} y={H + mB * 0.82} textAnchor={i === 0 ? "start" : i === marcas.length - 1 ? "end" : "middle"} className="guia-cm" style={{ fontSize: fs * 0.85 }}>
            {cm(c)}{i === marcas.length - 1 ? " cm" : ""}
          </text>}
        </g>
      ))}
    </svg>
  );
}

/** Las repisas de la cara (en v), del mueble de la guía. */
export function repisasDeLaGuia(guia: Pick<Guia, "fixture" | "cara">): number[] {
  const f = guia.fixture as Parameters<typeof guiasDeCara>[0];
  try { return guiasDeCara(f, guia.cara).entrepanos; } catch { return []; }
}

export default function HojaDeGuia({ guia, marcable = false, generada, onMarcados }: {
  guia: Guia; marcable?: boolean; generada: string;
  /** En el teléfono: cuántos números lleva marcados quien monta (fase 4, «Marcaste 2 de 3»). */
  onMarcados?: (marcados: number, total: number) => void;
}) {
  const repisas = useMemo(() => repisasDeLaGuia(guia), [guia]);
  const destinos = useMemo(() => destinosDeLaGuia(guia, repisas), [guia, repisas]);
  const vacios = useMemo(() => vaciosDeLaGuia(guia), [guia]);
  const cambios = useMemo(() => cambiosDeLaGuia(guia), [guia]);
  const aviso = avisoDeLaGuia(guia.version);
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const marcar = (k: string) => setHechos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  useEffect(() => {
    onMarcados?.(destinos.filter((d) => hechos.has(`d${d.destino_id}`)).length, destinos.length);
  }, [hechos, destinos, onMarcados]);
  const Caja = ({ k }: { k: string }) => marcable ? (
    <button type="button" className={`guia-check${hechos.has(k) ? " on" : ""}`} role="checkbox" aria-checked={hechos.has(k)} aria-label="Listo" onClick={() => marcar(k)}>
      {hechos.has(k) && <Check size={14} strokeWidth={2.5} aria-hidden />}
    </button>
  ) : <span className="guia-check" aria-hidden />;
  const nombreDelMueble = (guia.fixture.label ?? "").trim();
  return (
    <article className="guia-hoja" data-hoja-de-guia>
      <header className="guia-h">
        <div>
          <span className="guia-marca">Guía de montaje · {guia.sede}</span>
          <b className="guia-tit">{guia.codigo} · cara&nbsp;{guia.cara}</b>
          {nombreDelMueble && nombreDelMueble.toUpperCase() !== guia.codigo.toUpperCase() && <span>{nombreDelMueble}</span>}
        </div>
        <div className="guia-v"><b>Versión {guia.version.numero}</b><span>{vigenciaDeLaGuia(guia.version)}</span></div>
      </header>
      {aviso && <p className="guia-aviso" role="status">{aviso}</p>}

      <section className="guia-paso">
        <h3><span>1</span>{guia.anterior ? `Qué cambia contra la versión ${guia.anterior.numero}` : "Primera versión de esta cara"}</h3>
        {guia.anterior ? (
          <ul className="guia-cambia">
            {cambios.length === 0 && <li>Nada cambia de lugar ni de tamaño.</li>}
            {cambios.map((c) => (
              <li key={c}>{c.includes(" entra ") ? <Plus {...ICONO} /> : c.includes(" sale ") ? <Minus {...ICONO} /> : <ArrowRight {...ICONO} />}{c}</li>
            ))}
            <li><Minus {...ICONO} />Lo que no está en esta hoja, se saca.</li>
          </ul>
        ) : <p className="guia-nota">Todo lo de esta hoja es nuevo. Lo que no está acá, se saca.</p>}
      </section>

      <section className="guia-paso">
        <h3><span>2</span>Qué va dónde</h3>
        <div className="guia-dos">
          <div>
            <CaraDeLaGuia guia={guia} destinos={destinos} repisas={repisas} />
            <p className="guia-nota">Los estantes se cuentan <b>desde arriba</b>. Las medidas, en centímetros <b>desde el borde izquierdo</b> del mueble, mirándolo de frente.</p>
          </div>
          <div className="guia-fichas">
            {destinos.map((d) => {
              const col = PAPEL[d.color] ?? { c: "#555", s: "#eee" };
              return (
                <div key={d.destino_id} className="guia-ficha" style={{ ["--c" as string]: col.c, ["--s" as string]: col.s }} data-ficha={d.numero}>
                  <span className="guia-fn">{d.numero}</span>
                  <div className="guia-fc">
                    <b>{d.nombre}</b>
                    <span className="guia-ft">{textoDelTipo(d.tipo)} · {pct(d.pb)} de la cara{d.codigo_externo ? <> · <span className="guia-mono">{d.codigo_externo}</span></> : null}</span>
                    {d.poligono ? (
                      <span className="guia-donde"><Ruler {...ICONO} />De <b>{cm(d.desdeCm)}</b> a <b>{cm(d.hastaCm)} cm</b> desde la izquierda{d.textoEstantes ? <> · <b>{d.textoEstantes}</b></> : null}</span>
                    ) : <span className="guia-donde">Sin lugar en la cara.</span>}
                    {d.como_se_monta && <span className="guia-como"><Info {...ICONO} />{d.como_se_monta}</span>}
                  </div>
                  <Caja k={`d${d.destino_id}`} />
                </div>
              );
            })}
            {vacios.map((v) => (
              <div key={`v${v.desdeCm}`} className="guia-ficha vacio">
                <span className="guia-fn">·</span>
                <div className="guia-fc"><b>Vacío a propósito</b><span className="guia-donde"><Ruler {...ICONO} />De <b>{cm(v.desdeCm)}</b> a <b>{cm(v.hastaCm)} cm</b>: no se llena.</span></div>
              </div>
            ))}
            {guia.asignado.length > 0 && (
              <div className="guia-ficha asignado">
                <span className="guia-fn">·</span>
                <div className="guia-fc"><b>Ya asignado · no tocar</b><span className="guia-donde">Lo gris del dibujo es de otros: no se mueve ni se toca.</span></div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="guia-paso">
        <h3><span>3</span>Al terminar</h3>
        <ul className="guia-fin">
          <li><Caja k="f1" />Saqué lo que no está en esta hoja.</li>
          <li><Caja k="f2" />Cada número quedó en su lugar, de borde a borde de su franja.</li>
          <li><Caja k="f3" />Tomé una foto de frente de toda la cara (no es obligatoria, pero ayuda).</li>
        </ul>
        {!marcable && <div className="guia-firma"><span>Montó: ____________________</span><span>Fecha: ____ / ____</span><span>Hora: ____</span></div>}
      </section>

      <footer className="guia-p">
        <span><Printer {...ICONO} />Generada el {generada} · sin precios</span>
        <span>Si en el mueble hay otra versión impresa, vale ésta.</span>
      </footer>
    </article>
  );
}
