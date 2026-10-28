import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Download, Table2 } from "lucide-react";
import { aCsv, bajarCsv, contraLaMeta, diasHasta, pesos } from "../../utils/indicadores";
import { porcentajesQueSuman, prioridadDe, type BrechaDelPotencial, type EspacioDelMapa } from "../../utils/mapaDeDecision";
import type { AccionDelTablero } from "./MapaDeOportunidades";
import "./mapaDeDecision.css";

/**
 * ANÁLISIS — la segunda pestaña de Indicadores (la versión A del rediseño,
 * aprobada por el dueño el 2026-10-28 como «Análisis» de la versión B).
 *
 * Un tablero ejecutivo: cinco cifras con su acción, las acciones prioritarias
 * y cinco capítulos numerados —Resultado, Riesgo de ingreso, Ejecución,
 * Capacidad por vender y Cartera—, cada uno con su lectura en una frase, su
 * fuente y su salida. Cada gráfico tiene su tabla gemela («Ver como tabla»).
 *
 * Quien no administra ve cuentas, nunca montos: el capítulo de Resultado (que
 * es plata) no aparece, y los demás cuentan contratos y caras.
 */

export interface DatosDelAnalisis {
  esAdmin: boolean;
  sede: string;
  /** Hoy, `YYYY-MM-DD`. */
  hoy: string;
  canon: number | null;
  /** El canon de los últimos 12 meses (administración), con sus meses `YYYY-MM`. */
  serie: { meses: string[]; canon: number[] } | null;
  potencial: number | null;
  ocupacion: { pct: number; ocupadas: number; total: number; meta: number };
  /** Los contratos que vencen en 90 días. */
  vencen: { clave: string | null; codigo: string; proveedor: string; hasta: string; alMes: number | null; renovado: boolean }[];
  montajesDelMes: { total: number; enLaTienda: number; verificados: number };
  acciones: AccionDelTablero[];
  pendientes: number;
  brecha: BrechaDelPotencial | null;
  /** Las tarifas de referencia de la sede, para la fuente del puente. */
  tarifas: { tipo: string; valor: number }[];
  embudo: { empiezan: number; avisoEnviado: number; registrado: number; montado: number; verificado: number };
  preparacion: { sinDistribuir: number | null; sinPlanometria: number | null; noCoinciden: number; noRealizados: number };
  /** Las caras con algo por vender: vacías y vendidas en parte. */
  capacidad: EspacioDelMapa[];
  /** Todas las caras, para la oportunidad de cada una (quién renueva al lado). */
  espacios: EspacioDelMapa[];
  /** Por tipo: vendidas enteras, en parte, sin contrato y apartadas (firmadas
   *  por empezar, reservadas o en mantenimiento). */
  porTipo: { tipo: string; vendidas: number; parciales: number; libres: number; otras: number }[];
  /** Caras enteras sin contrato hoy y el primer día de los próximos meses. */
  proyeccion: { etiqueta: string; caras: number }[];
  /** Administración: lo que paga cada cliente al mes; si no, sus espacios. */
  cartera: { nombre: string; alMes: number | null; espacios: number }[];
  precio: { pct: number; meta: number; contadas: number; sinTarifa: number } | null;
}

export interface ManejoDelAnalisis {
  onContratos: (filtro: "occupied" | "expiring") => void;
  onMontajes: () => void;
  onPendientes: () => void;
  onFicha: (clave: string) => void;
  onPropuesta: (clave: string) => void;
  onMapa: (capa: "vacias" | "parcial" | "vence") => void;
  onQuienPaga?: () => void;
  onTarifas?: () => void;
}

/** Cuántas filas muestran las listas largas antes de «Ver los N». */
const LIMITE_VENCEN = 6, LIMITE_CAPACIDAD = 10;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const ICONO = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function useAncho<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.floor(el.clientWidth));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** El ancho y el alto del lugar del gráfico. Los gráficos de las tarjetas de
 *  a dos crecen hasta el alto de la fila (la otra tarjeta puede ser una tabla
 *  larga): el lienzo va encima, sin empujar, así el alto lo pone la tarjeta y
 *  no el dibujo. `minimo` es el alto de siempre. */
function useLugar<T extends HTMLElement>(minimo: number): [React.RefObject<T>, number, number] {
  const ref = useRef<T>(null);
  const [t, setT] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setT({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, t.w, Math.max(minimo, Math.min(t.h, minimo * 1.8))];
}

/** Una columna con el extremo de datos redondeado (4 px) y la base recta. */
function columna(x: number, yBase: number, yTope: number, w: number): string {
  const top = Math.min(yBase, yTope), h = Math.abs(yBase - yTope), r = Math.min(4, h / 2, w / 2);
  return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
}
/** Una barra horizontal con el extremo de datos redondeado. */
function barra(x0: number, y: number, w: number, h: number): string {
  if (w <= 0) return "";
  const r = Math.min(4, w / 2, h / 2);
  return `M${x0},${y} H${x0 + w - r} Q${x0 + w},${y} ${x0 + w},${y + r} V${y + h - r} Q${x0 + w},${y + h} ${x0 + w - r},${y + h} H${x0} Z`;
}
/** Tres marcas de eje «redondas» hasta `max`. */
function marcas(max: number): number[] {
  if (max <= 0) return [0];
  const paso = Math.pow(10, Math.floor(Math.log10(max / 2)));
  const p = [1, 2, 2.5, 5, 10].map((k) => k * paso).find((k) => max / k <= 2.4) ?? paso * 10;
  return [0, p, p * 2].filter((v) => v <= max * 1.25);
}

function Estado({ tono, children }: { tono: "bien" | "aviso" | "critico"; children: ReactNode }) {
  return <span className={`mo-estado ${tono}`}><i aria-hidden />{children}</span>;
}

/** «Ver como tabla»: cada gráfico tiene su gemela legible sin color. */
function ConTabla({ tabla, children, pie }: { tabla: ReactNode; children: ReactNode; pie?: ReactNode }) {
  const [ver, setVer] = useState(false);
  return (
    <>
      {ver ? <div className="an-tabla-w">{tabla}</div> : children}
      <div className="an-cta">
        {pie}
        <button type="button" className="mo-link der" aria-pressed={ver} onClick={() => setVer((v) => !v)}>
          <Table2 {...ICONO} /> {ver ? "Ver el gráfico" : "Ver como tabla"}
        </button>
      </div>
    </>
  );
}

function Puente({ b }: { b: BrechaDelPotencial }) {
  const [ref, W, H] = useLugar<HTMLDivElement>(270);
  const L = W < 420 ? 6 : 96, B = 52, T = 22;
  const max = Math.max(b.potencial, b.cobrado, 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const pasos: { a: number; b: number; total: boolean; e: [string, string]; v: string }[] = [
    { a: 0, b: b.potencial, total: true, e: ["Potencial", "a tarifa"], v: pesos(b.potencial) },
    { a: b.potencial - b.vacias, b: b.potencial, total: false, e: ["Caras sin", "contrato"], v: `−${pesos(b.vacias)}` },
    { a: b.potencial - b.vacias - b.enParciales, b: b.potencial - b.vacias, total: false, e: ["Capacidad libre", "en parciales"], v: `−${pesos(b.enParciales)}` },
    { a: b.cobrado, b: b.cobrado + b.precioYCobro, total: false, e: ["Precio", "y cobro"], v: `−${pesos(b.precioYCobro)}` },
    { a: 0, b: b.cobrado, total: true, e: ["Ingreso", "contratado"], v: pesos(b.cobrado) },
  ];
  if (b.sobreTarifa > 0) pasos[3] = { a: b.potencial - b.vacias - b.enParciales, b: b.cobrado, total: false, e: ["Sobre", "la tarifa"], v: `+${pesos(b.sobreTarifa)}` };
  const ancho = (W - L - 8) / pasos.length, bw = 24, chico = W < 420;
  return (
    <div ref={ref} className="an-grafico crece" style={{ minHeight: 270 }}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Del potencial a tarifa al ingreso contratado">
          {!chico && marcas(max).map((v) => (
            <g key={v}><line className={v ? "grid" : "eje"} x1={L} x2={W} y1={y(v)} y2={y(v)} /><text className="tick" x={L - 8} y={y(v) + 4} textAnchor="end">{pesos(v)}</text></g>
          ))}
          {chico && <line className="eje" x1={L} x2={W} y1={y(0)} y2={y(0)} />}
          {pasos.map((p, i) => {
            const cx = L + ancho * i + ancho / 2, x = cx - bw / 2;
            const sube = p.total || p.b >= p.a;
            const nivel = p.total ? p.b : p.a;
            return (
              <g key={i}>
                <path className={p.total ? "s1" : "s2"} d={columna(x, y(Math.min(p.a, p.b)), y(Math.max(p.a, p.b)), bw)}><title>{`${p.e.join(" ")}: ${p.v}`}</title></path>
                {i < pasos.length - 1 && <line className="conector" x1={x + bw} x2={cx + ancho - bw / 2} y1={y(nivel)} y2={y(nivel)} />}
                <text className="valor" x={cx} y={p.total || !sube ? y(Math.max(p.a, p.b)) - 7 : y(Math.min(p.a, p.b)) + 15} textAnchor="middle">{p.v}</text>
                <text className="cat" x={cx} y={H - B + 18} textAnchor="middle">{p.e[0]}</text>
                <text className="cat" x={cx} y={H - B + 32} textAnchor="middle">{p.e[1]}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function ColumnasDelMes({ meses, canon }: { meses: string[]; canon: number[] }) {
  const [ref, W, H] = useLugar<HTMLDivElement>(220);
  const chico = W < 420, L = chico ? 6 : 92, B = 26, T = 22;
  const max = Math.max(1, ...canon) * 1.08;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const n = canon.length, paso = (W - L - 6) / Math.max(1, n), bw = Math.max(6, Math.min(24, paso - 8));
  return (
    <div ref={ref} className="an-grafico crece" style={{ minHeight: 220 }}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingreso contratado por mes">
          {!chico && marcas(max).map((v) => (
            <g key={v}><line className={v ? "grid" : "eje"} x1={L} x2={W} y1={y(v)} y2={y(v)} /><text className="tick" x={L - 8} y={y(v) + 4} textAnchor="end">{pesos(v)}</text></g>
          ))}
          {chico && <line className="eje" x1={L} x2={W} y1={y(0)} y2={y(0)} />}
          {canon.map((v, i) => {
            const cx = L + paso * i + paso / 2, ultimo = i === n - 1;
            const mes = meses[i] ?? "";
            return (
              <g key={i}>
                {v > 0 && <path className={ultimo ? "s1" : "gris"} d={columna(cx - bw / 2, y(0), y(v), bw)}><title>{`${MESES_LARGOS[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}: ${pesos(v)}`}</title></path>}
                <text className="tick" x={cx} y={H - 8} textAnchor="middle">{MESES[Number(mes.slice(5, 7)) - 1] ?? ""}</text>
                {ultimo && <text className="valor" x={cx} y={y(v) - 7} textAnchor="end">{pesos(v)}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function VencenPorMes({ grupos, plata }: { grupos: { etiqueta: string; sinRenovar: number; renovado: number; contratos: number }[]; plata: boolean }) {
  const [ref, W, H] = useLugar<HTMLDivElement>(200);
  const chico = W < 420, L = chico ? 6 : 92, B = 40, T = 30;
  const max = Math.max(1, ...grupos.map((g) => g.sinRenovar + g.renovado)) * 1.1;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const paso = (W - L - 6) / Math.max(1, grupos.length), bw = 24;
  const f = (v: number) => (plata ? pesos(v) : String(v));
  return (
    <div ref={ref} className="an-grafico crece" style={{ minHeight: 200 }}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={plata ? "Ingreso que vence por mes" : "Contratos que vencen por mes"}>
          {!chico && marcas(max).map((v) => (
            <g key={v}><line className={v ? "grid" : "eje"} x1={L} x2={W} y1={y(v)} y2={y(v)} /><text className="tick" x={L - 8} y={y(v) + 4} textAnchor="end">{f(v)}</text></g>
          ))}
          {chico && <line className="eje" x1={L} x2={W} y1={y(0)} y2={y(0)} />}
          {grupos.map((g, i) => {
            const cx = L + paso * i + paso / 2, tot = g.sinRenovar + g.renovado;
            const ySin = y(g.sinRenovar);
            return (
              <g key={g.etiqueta}>
                {g.sinRenovar > 0 && <path className="s2" d={g.renovado > 0 ? `M${cx - bw / 2},${y(0)} V${ySin} H${cx + bw / 2} V${y(0)} Z` : columna(cx - bw / 2, y(0), ySin, bw)}><title>{`${g.etiqueta} · sin renovar: ${f(g.sinRenovar)}`}</title></path>}
                {g.renovado > 0 && <path className="s1" d={columna(cx - bw / 2, ySin - (g.sinRenovar > 0 ? 2 : 0), y(tot), bw)}><title>{`${g.etiqueta} · renovado: ${f(g.renovado)}`}</title></path>}
                <text className="valor" x={cx} y={y(tot) - (tot ? 18 : 6)} textAnchor="middle">{tot ? f(tot) : "—"}</text>
                {tot > 0 && <text className="tick" x={cx} y={y(tot) - 5} textAnchor="middle">{g.contratos} contrato{g.contratos === 1 ? "" : "s"}</text>}
                <text className="cat" x={cx} y={H - 22} textAnchor="middle">{g.etiqueta}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Embudo({ pasos }: { pasos: { t: string; n: number }[] }) {
  const [ref, W] = useAncho<HTMLDivElement>();
  const chico = W < 420, L = chico ? 150 : 200, R = chico ? 40 : 150, alto = 34, bw = 18;
  const max = Math.max(1, pasos[0]?.n ?? 1);
  let peor = -1, peorPct = 101;
  pasos.forEach((p, i) => { if (i > 0 && pasos[i - 1].n > 0) { const c = Math.round((p.n / pasos[i - 1].n) * 100); if (c < peorPct) { peorPct = c; peor = i; } } });
  return (
    <div ref={ref} className="an-grafico">
      {W > 0 && (
        <svg width={W} height={pasos.length * alto} viewBox={`0 0 ${W} ${pasos.length * alto}`} role="img" aria-label="Del contrato a la exhibición verificada">
          {pasos.map((p, i) => {
            const yy = i * alto, w = ((W - L - R) * p.n) / max;
            const conv = i > 0 && pasos[i - 1].n > 0 ? Math.round((p.n / pasos[i - 1].n) * 100) : null;
            return (
              <g key={p.t}>
                <text className="cat izq" x={0} y={yy + 15}>{p.t}</text>
                <rect className="pista" x={L} y={yy + 2} width={Math.max(0, W - L - R)} height={bw} rx={4} />
                <path className="s1" d={barra(L, yy + 2, w, bw)}><title>{`${p.t}: ${p.n}`}</title></path>
                <text className="valor" x={L + w + 6} y={yy + 15}>{p.n}</text>
                {conv !== null && !chico && <text className={`tick${i === peor && peorPct < 100 ? " peor" : ""}`} x={W} y={yy + 15} textAnchor="end">{conv} % del paso anterior</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function CarasPorTipo({ filas }: { filas: { tipo: string; vendidas: number; parciales: number; libres: number; otras: number }[] }) {
  const [ref, W] = useAncho<HTMLDivElement>();
  const chico = W < 420, L = chico ? 112 : 160, R = 34, alto = 34, bw = 20;
  const total = filas.reduce((t, f) => ({ tipo: "Total sede", vendidas: t.vendidas + f.vendidas, parciales: t.parciales + f.parciales, libres: t.libres + f.libres, otras: t.otras + f.otras }),
    { tipo: "Total sede", vendidas: 0, parciales: 0, libres: 0, otras: 0 });
  const todas = [...filas, total];
  return (
    <div ref={ref} className="an-grafico">
      {W > 0 && (
        <svg width={W} height={todas.length * alto + 10} viewBox={`0 0 ${W} ${todas.length * alto + 10}`} role="img" aria-label="Caras por estado y tipo de mueble">
          {todas.map((f, i) => {
            const yy = i * alto + (i === todas.length - 1 ? 8 : 0), tot = f.vendidas + f.parciales + f.libres + f.otras, ancho = W - L - R;
            let x = L;
            return (
              <g key={f.tipo}>
                {i === todas.length - 1 && <line className="grid" x1={0} x2={W} y1={yy - 7} y2={yy - 7} />}
                <text className={`cat izq${i === todas.length - 1 ? " fuerte" : ""}`} x={0} y={yy + 15}>{f.tipo}</text>
                {([["o1", f.vendidas, "vendidas completas"], ["o2", f.parciales, "con venta parcial"], ["o3", f.libres, "sin contrato"], ["o4", f.otras, "apartadas"]] as const).map(([c, n, t]) => {
                  if (!n || !tot) return null;
                  const w = (ancho * n) / tot - 2, x0 = x;
                  x += w + 2;
                  return (
                    <g key={c}>
                      <rect className={c} x={x0} y={yy + 2} width={Math.max(0, w)} height={bw} rx={3}><title>{`${f.tipo}: ${n} ${t}`}</title></rect>
                      {w > 18 && <text className={`an-seg ${c}`} x={x0 + w / 2} y={yy + 16} textAnchor="middle">{n}</text>}
                    </g>
                  );
                })}
                <text className="valor" x={W} y={yy + 16} textAnchor="end">{tot}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Proyeccion({ puntos }: { puntos: { etiqueta: string; caras: number }[] }) {
  const [ref, W, H] = useLugar<HTMLDivElement>(190);
  const chico = W < 420, L = chico ? 6 : 40, B = 26, T = 22;
  const max = Math.max(4, ...puntos.map((p) => p.caras)) * 1.15;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const paso = (W - L - 6) / Math.max(1, puntos.length), bw = 24;
  return (
    <div ref={ref} className="an-grafico crece" style={{ minHeight: 190 }}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Caras completas sin contrato en los próximos meses">
          {!chico && marcas(max).map((v) => (
            <g key={v}><line className={v ? "grid" : "eje"} x1={L} x2={W} y1={y(v)} y2={y(v)} /><text className="tick" x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>
          ))}
          {chico && <line className="eje" x1={L} x2={W} y1={y(0)} y2={y(0)} />}
          {puntos.map((p, i) => {
            const cx = L + paso * i + paso / 2;
            return (
              <g key={p.etiqueta}>
                {p.caras > 0 && <path className={i === 0 ? "s1" : "gris"} d={columna(cx - bw / 2, y(0), y(p.caras), bw)}><title>{`${p.etiqueta}: ${p.caras} caras`}</title></path>}
                <text className="valor" x={cx} y={y(p.caras) - 7} textAnchor="middle">{p.caras}</text>
                <text className="cat" x={cx} y={H - 8} textAnchor="middle">{p.etiqueta}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Cartera({ filas, plata }: { filas: { nombre: string; alMes: number | null; espacios: number }[]; plata: boolean }) {
  const [ref, W] = useAncho<HTMLDivElement>();
  const chico = W < 420, L = chico ? 112 : 140, R = chico ? 96 : 214, alto = 26, bw = 14;
  const val = (f: { alMes: number | null; espacios: number }) => (plata ? f.alMes ?? 0 : f.espacios);
  const max = Math.max(1, ...filas.map(val));
  const total = filas.reduce((t, f) => t + val(f), 0) || 1;
  // La parte de cada uno, redondeada como en el resto de la pantalla (22 %), y
  // el acumulado redondeado sobre la suma, que siempre cierra en 100 %.
  let suma = 0;
  return (
    <div ref={ref} className="an-grafico">
      {W > 0 && (
        <svg width={W} height={filas.length * alto + 16} viewBox={`0 -16 ${W} ${filas.length * alto + 16}`} role="img" aria-label={plata ? "Ingreso mensual por cliente" : "Espacios por cliente"}>
          {!chico && <><text className="tick" x={W - 120} y={-4} textAnchor="end">{plata ? "Al mes" : "Espacios"}</text><text className="tick" x={W - 50} y={-4} textAnchor="end">Part.</text><text className="tick" x={W} y={-4} textAnchor="end">Acum.</text></>}
          {filas.map((f, i) => {
            const yy = i * alto, w = ((W - L - R) * val(f)) / max;
            suma += val(f);
            const parte = Math.round((val(f) / total) * 100), acum = Math.round((suma / total) * 100);
            return (
              <g key={f.nombre}>
                <text className="cat izq" x={0} y={yy + 12}>{f.nombre.length > 18 && chico ? `${f.nombre.slice(0, 17)}…` : f.nombre}</text>
                <path className="s1" d={barra(L, yy + 1, w, bw)}><title>{`${f.nombre}: ${plata ? pesos(val(f)) : `${val(f)} espacios`} · ${Math.round((val(f) / total) * 100)} %`}</title></path>
                <text className="valor" x={chico ? W : W - 120} y={yy + 12} textAnchor="end">{plata ? pesos(val(f)) : val(f)}</text>
                {!chico && <><text className="tick" x={W - 50} y={yy + 12} textAnchor="end">{parte} %</text><text className="tick" x={W} y={yy + 12} textAnchor="end">{acum} %</text></>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default function Analisis({ datos, manejo }: { datos: DatosDelAnalisis; manejo: ManejoDelAnalisis }) {
  const plata = datos.esAdmin;
  const ir = (id: string) => document.querySelector(`[data-capitulo="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const vencenSinRenovar = datos.vencen.filter((v) => !v.renovado);
  const sinRenovarAlMes = vencenSinRenovar.reduce((t, v) => t + (v.alMes ?? 0), 0);
  const realizacion = plata && datos.potencial ? Math.round(((datos.canon ?? 0) / datos.potencial) * 100) : null;
  const variacion = (() => {
    const s = datos.serie?.canon ?? [];
    if (s.length < 2 || !s[s.length - 2]) return null;
    return { pct: ((s[s.length - 1] - s[s.length - 2]) / s[s.length - 2]) * 100, mes: MESES_LARGOS[Number((datos.serie!.meses[s.length - 2] ?? "").slice(5, 7)) - 1] ?? "el mes anterior" };
  })();
  const pctVar = (p: number) => `${p >= 0 ? "+" : "−"}${Math.abs(p).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
  const faltan = Math.max(0, Math.ceil((datos.ocupacion.meta / 100) * datos.ocupacion.total) - datos.ocupacion.ocupadas);

  // Lo que vence, por mes (el mes de hoy y los tres que siguen).
  const gruposVence = (() => {
    const base = new Date(`${datos.hoy}T12:00:00`);
    return Array.from({ length: 4 }, (_, k) => {
      const d = new Date(base.getFullYear(), base.getMonth() + k, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const del = datos.vencen.filter((v) => v.hasta.slice(0, 7) === clave);
      const val = (v: { alMes: number | null }) => (plata ? v.alMes ?? 0 : 1);
      return {
        etiqueta: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
        sinRenovar: del.filter((v) => !v.renovado).reduce((t, v) => t + val(v), 0),
        renovado: del.filter((v) => v.renovado).reduce((t, v) => t + val(v), 0),
        contratos: del.length,
      };
    });
  })();

  // La oportunidad de cada espacio con capacidad: con quién y cuándo.
  const oportunidad = (e: EspacioDelMapa): string => {
    const renuevan = datos.espacios.filter((o) => o.vence && o.vence.proveedor && o.clave !== e.clave);
    const presente = e.clientes.find((c) => renuevan.some((o) => o.vence!.proveedor === c));
    if (presente) {
      const o = renuevan.find((x) => x.vence!.proveedor === presente)!;
      return `${presente} renueva ${o.vence!.codigo} el ${fechaCorta(o.vence!.fecha)}: incluir la ampliación en esa negociación.`;
    }
    if (e.estado === "parcial" && e.clientes.length === 1) return `Ofrecer ampliación a ${e.clientes[0]}.`;
    if (e.estado === "parcial" && e.clientes.length > 1) return `${e.clientes.length} clientes comparten la cara: ofrecer lo libre a uno de ellos.`;
    const vecina = datos.espacios.find((o) => o.fixtureId === e.fixtureId && o.clave !== e.clave && o.clientes.length);
    if (vecina) {
      const v = vecina.vence && vecina.vence.proveedor === vecina.clientes[0] ? ` y renueva el ${fechaCorta(vecina.vence.fecha)}` : "";
      return `${vecina.clientes[0]} ocupa ${vecina.codigo}${v}: ofrecer también esta cara.`;
    }
    if (e.nuncaContratada) return "Nunca contratada.";
    if (e.diasSinContrato !== null) return `Sin contrato desde hace ${e.diasSinContrato} días.`;
    return "Sin contrato hoy.";
  };
  // Las listas largas muestran lo primero y se abren: en TERRON eran 42
  // contratos por vencer y 34 caras vacías, y la tarjeta de al lado quedaba
  // con un hueco del alto de la lista (el dueño, 2026-10-28).
  const [todosVencen, setTodosVencen] = useState(false);
  const [todaLaCapacidad, setTodaLaCapacidad] = useState(false);
  const vencenEnOrden = [...datos.vencen].sort((a, b) =>
    Number(a.renovado) - Number(b.renovado) || a.hasta.localeCompare(b.hasta) || (b.alMes ?? 0) - (a.alMes ?? 0) || a.codigo.localeCompare(b.codigo));
  const capacidad = [...datos.capacidad].sort((a, b) => (b.libreAlMes ?? 0) - (a.libreAlMes ?? 0) || a.codigo.localeCompare(b.codigo));
  const capacidadAlMes = capacidad.reduce((t, e) => t + (e.libreAlMes ?? 0), 0);
  const vacias = capacidad.filter((e) => e.estado === "libre");
  const tuvoAccion = { primera: false };
  const boton = (texto: string, onClick: () => void) => {
    // Un solo botón principal en la pantalla: la primera acción prioritaria.
    const principal = !tuvoAccion.primera;
    tuvoAccion.primera = true;
    return <button type="button" className={principal ? "btn-principal mo-accion" : "mo-accion sec"} onClick={onClick}>{texto}</button>;
  };

  return (
    <div className="an" data-analisis>
      <div className="an-kpis">
        {plata && (
          <div className="an-kpi">
            <span className="l">Ingreso mensual contratado</span>
            <span className="v">{pesos(datos.canon ?? 0)}</span>
            <span className="d">{variacion ? <><b>{pctVar(variacion.pct)}</b> frente a {variacion.mes}</> : "lo vigente hoy, al mes"}</span>
            <button type="button" className="mo-link" onClick={() => manejo.onContratos("occupied")}>Ver contratos ›</button>
          </div>
        )}
        {plata && realizacion !== null && (
          <div className="an-kpi">
            <span className="l">Realización del potencial</span>
            <span className="v">{realizacion} %</span>
            <span className="d">de {pesos(datos.potencial ?? 0)} a tarifa de referencia</span>
            <div className="mo-medidor"><div style={{ width: `${Math.min(100, realizacion)}%` }} /></div>
            <button type="button" className="mo-link" onClick={() => ir("resultado")}>Ver la brecha ›</button>
          </div>
        )}
        <div className="an-kpi">
          <span className="l">Ocupación de caras</span>
          <span className="v">{datos.ocupacion.pct} %</span>
          <span className="d">{datos.ocupacion.ocupadas} de {datos.ocupacion.total} caras · meta {datos.ocupacion.meta} %</span>
          {contraLaMeta(datos.ocupacion.pct, datos.ocupacion.meta) === "ok"
            ? <Estado tono="bien">En la meta</Estado>
            : <Estado tono="aviso">{datos.ocupacion.meta - datos.ocupacion.pct} pp bajo la meta</Estado>}
          <button type="button" className="mo-link" onClick={() => ir("capacidad")}>Ver capacidad por vender ›</button>
        </div>
        <div className="an-kpi">
          <span className="l">{plata ? "Ingreso por vencer · 90 días" : "Contratos por vencer · 90 días"}</span>
          <span className="v">{plata ? pesos(sinRenovarAlMes) : vencenSinRenovar.length}</span>
          <span className="d">{plata && datos.canon ? `${Math.round((sinRenovarAlMes / datos.canon) * 100)} % del contratado · ` : ""}{vencenSinRenovar.length} contrato{vencenSinRenovar.length === 1 ? "" : "s"} sin renovar</span>
          {vencenSinRenovar.length > 0
            ? <Estado tono={datos.vencen.some((v) => v.renovado) ? "aviso" : "critico"}>{datos.vencen.some((v) => v.renovado) ? "Renovación incompleta" : "Ninguno renovado"}</Estado>
            : <Estado tono="bien">Todo renovado</Estado>}
          <button type="button" className="mo-link" onClick={() => ir("riesgo")}>Ver vencimientos ›</button>
        </div>
        <div className="an-kpi">
          <span className="l">Ejecución de montajes · {MESES_LARGOS[Number(datos.hoy.slice(5, 7)) - 1]}</span>
          <span className="v">{datos.montajesDelMes.enLaTienda} de {datos.montajesDelMes.total}</span>
          <span className="d">montados · {datos.montajesDelMes.verificados} verificado{datos.montajesDelMes.verificados === 1 ? "" : "s"}</span>
          {datos.montajesDelMes.total > 0 && datos.montajesDelMes.enLaTienda < datos.montajesDelMes.total
            ? <Estado tono="aviso">Bajo lo esperado</Estado> : <Estado tono="bien">Al día</Estado>}
          <button type="button" className="mo-link" onClick={manejo.onMontajes}>Ir a Montajes ›</button>
        </div>
      </div>

      <section className="an-card">
        <div className="an-cab">
          <div><h3>Acciones prioritarias</h3><p className="sub">Ordenadas por impacto en el ingreso y por plazo.</p></div>
          <button type="button" className="mo-link der" onClick={manejo.onPendientes}>Ver las {datos.pendientes} en Pendientes ›</button>
        </div>
        {datos.acciones.length === 0 ? <p className="an-vacio">Nada urgente: no hay renovaciones, ventas ni montajes pendientes.</p> : (
          <table className="an-tabla an-acc">
            <thead><tr><th>Prioridad</th><th>Asunto</th><th>Elemento</th>{plata && <th className="n">Impacto mensual</th>}<th>Plazo</th><th /></tr></thead>
            <tbody>
              {datos.acciones.slice(0, 8).map((a, k) => {
                const p = prioridadDe(a);
                return (
                  <tr key={`${a.tipo}-${a.clave}-${k}`}>
                    <td className="c-prio"><span className={`an-prio ${p}`}><i aria-hidden />{p === "alta" ? "Alta" : "Media"}</span></td>
                    <td className="c-asunto"><b>{a.asunto}</b></td>
                    <td className="c-det"><code>{a.codigo}</code> {a.detalle && <span className="dim">{a.detalle}</span>}</td>
                    {plata && <td className="n c-imp">{a.impacto ? pesos(a.impacto) : "—"}</td>}
                    <td className="c-plazo">{a.plazo}</td>
                    <td className="c-acc">{boton(a.boton, a.onClick)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {plata && datos.brecha && (
        <>
          <div className="an-sec" data-capitulo="resultado"><span className="n">01</span><h2>Resultado</h2><p>Ingreso contratado frente al potencial de la sede.</p></div>
          <div className="an-dos">
            <section className="an-card">
              <h3>Del potencial al ingreso contratado</h3>
              <p className="sub">Brecha mensual de {pesos(datos.brecha.falta)}, por causa.</p>
              <div className="an-ley"><span><i className="s1" />Total</span><span><i className="s2" />Brecha</span></div>
              <ConTabla
                tabla={(
                  <table className="an-tabla"><thead><tr><th>Concepto</th><th className="n">Al mes</th></tr></thead><tbody>
                    <tr><td>Potencial a tarifa</td><td className="n">{pesos(datos.brecha.potencial)}</td></tr>
                    <tr><td>Caras sin contrato</td><td className="n">−{pesos(datos.brecha.vacias)}</td></tr>
                    <tr><td>Capacidad libre en caras parciales</td><td className="n">−{pesos(datos.brecha.enParciales)}</td></tr>
                    <tr><td>{datos.brecha.sobreTarifa > 0 ? "Sobre la tarifa" : "Precio y cobro"}</td><td className="n">{datos.brecha.sobreTarifa > 0 ? `+${pesos(datos.brecha.sobreTarifa)}` : `−${pesos(datos.brecha.precioYCobro)}`}</td></tr>
                    <tr><td><b>Ingreso contratado</b></td><td className="n">{pesos(datos.brecha.cobrado)}</td></tr>
                  </tbody></table>
                )}
                pie={<button type="button" className="mo-accion sec" onClick={() => ir("capacidad")}>Ver la brecha por espacio</button>}
              >
                <Puente b={datos.brecha} />
                {datos.brecha.falta > 0 && (() => {
                  const [a, b2, c] = porcentajesQueSuman([datos.brecha.vacias, datos.brecha.enParciales, datos.brecha.precioYCobro]);
                  return <p className="an-lectura">El <b>{a} %</b> de la brecha corresponde a caras sin contrato y el <b>{b2} %</b> a capacidad libre en caras con venta parcial. Las diferencias de precio y cobro explican el <b>{c} %</b>.</p>;
                })()}
                {datos.tarifas.length > 0 && <p className="an-fuente">Fuente: contratos vigentes y tarifas de referencia de la sede ({datos.tarifas.map((t) => `${t.tipo.toLowerCase()} ${pesos(t.valor)}`).join(", ")}).</p>}
              </ConTabla>
            </section>
            <section className="an-card">
              <h3>Ingreso contratado por mes</h3>
              <p className="sub">Últimos {datos.serie?.canon.length ?? 0} meses · el mes en curso resaltado.</p>
              {datos.serie && datos.serie.canon.length > 0 ? (
                <ConTabla
                  tabla={(
                    <table className="an-tabla"><thead><tr><th>Mes</th><th className="n">Al mes</th></tr></thead><tbody>
                      {datos.serie.meses.map((m, i) => <tr key={m}><td>{MESES_LARGOS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</td><td className="n">{pesos(datos.serie!.canon[i] ?? 0)}</td></tr>)}
                    </tbody></table>
                  )}
                  pie={<button type="button" className="mo-accion sec" onClick={() => manejo.onContratos("occupied")}>Ver contratos vigentes</button>}
                >
                  <ColumnasDelMes meses={datos.serie.meses} canon={datos.serie.canon} />
                  {variacion && <p className="an-lectura">El ingreso {variacion.pct >= 0 ? "sube" : "baja"} <b>{pctVar(variacion.pct)}</b> frente a {variacion.mes}: <b>{pesos(datos.serie.canon[datos.serie.canon.length - 1])}</b> este mes.</p>}
                  <p className="an-fuente">Fuente: devengado de cada contrato por los días que corrió en el mes.</p>
                </ConTabla>
              ) : <p className="an-vacio">Leyendo la serie de meses…</p>}
            </section>
          </div>
        </>
      )}

      <div className="an-sec" data-capitulo="riesgo"><span className="n">{plata ? "02" : "01"}</span><h2>Riesgo de ingreso</h2><p>Contratos que terminan en los próximos 90 días.</p></div>
      <div className="an-dos a">
        <section className="an-card">
          <h3>{plata ? "Ingreso mensual que vence, por mes" : "Contratos que vencen, por mes"}</h3>
          <p className="sub">{plata && datos.canon !== null && sinRenovarAlMes > 0 ? `Si no se renueva, el ingreso baja de ${pesos(datos.canon)} a ${pesos(datos.canon - sinRenovarAlMes)} en 90 días.` : `${vencenSinRenovar.length} sin renovar de ${datos.vencen.length}.`}</p>
          <div className="an-ley"><span><i className="s2" />Sin renovar</span><span><i className="s1" />Renovado</span></div>
          <ConTabla
            tabla={(
              <table className="an-tabla"><thead><tr><th>Mes</th><th className="n">Sin renovar</th><th className="n">Renovado</th><th className="n">Contratos</th></tr></thead><tbody>
                {gruposVence.map((g) => <tr key={g.etiqueta}><td>{g.etiqueta}</td><td className="n">{plata ? pesos(g.sinRenovar) : g.sinRenovar}</td><td className="n">{plata ? pesos(g.renovado) : g.renovado}</td><td className="n">{g.contratos}</td></tr>)}
              </tbody></table>
            )}
            pie={<button type="button" className="mo-accion sec" onClick={() => manejo.onMapa("vence")}>Ver en el mapa</button>}
          >
            <VencenPorMes grupos={gruposVence} plata={plata} />
          </ConTabla>
        </section>
        <section className="an-card">
          <h3>Contratos por vencer</h3>
          <p className="sub">{datos.vencen.length} contrato{datos.vencen.length === 1 ? "" : "s"}{plata ? ` · ${pesos(datos.vencen.reduce((t, v) => t + (v.alMes ?? 0), 0))} al mes` : ""}.</p>
          {datos.vencen.length === 0 ? <p className="an-vacio">Nada vence en los próximos 90 días.</p> : (
            <div className={todosVencen ? "an-scroll" : undefined}>
            <table className="an-tabla">
              <thead><tr><th>Espacio</th><th>Vence</th>{plata && <th className="n">Al mes</th>}<th>Estado</th><th /></tr></thead>
              <tbody>
                {(todosVencen ? vencenEnOrden : vencenEnOrden.slice(0, LIMITE_VENCEN)).map((v) => (
                  <tr key={`${v.codigo}-${v.hasta}`}>
                    <td><code>{v.codigo}</code><div className="dim">{v.proveedor}</div></td>
                    <td>{fechaLarga(v.hasta)}</td>
                    {plata && <td className="n">{v.alMes !== null ? pesos(v.alMes) : "—"}</td>}
                    <td>{v.renovado ? <Estado tono="bien">Renovado</Estado> : <Estado tono={diasHasta(datos.hoy, v.hasta) <= 30 ? "critico" : "aviso"}>Sin renovar</Estado>}</td>
                    <td className="c-acc">{v.clave && !v.renovado && <button type="button" className="mo-link" onClick={() => manejo.onFicha(v.clave!)}>Renovar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <div className="an-cta">
            <button type="button" className="mo-accion sec" onClick={() => manejo.onContratos("expiring")}>Gestionar renovaciones</button>
            {datos.vencen.length > LIMITE_VENCEN && (
              <button type="button" className="mo-link der" aria-expanded={todosVencen} onClick={() => setTodosVencen((t) => !t)}>
                {todosVencen ? "Ver los más urgentes" : `Ver los ${datos.vencen.length} contratos`}
              </button>
            )}
          </div>
        </section>
      </div>

      <div className="an-sec" data-capitulo="ejecucion"><span className="n">{plata ? "03" : "02"}</span><h2>Ejecución operativa</h2><p>Del contrato firmado a la exhibición verificada.</p></div>
      <div className="an-dos">
        <section className="an-card">
          <h3>Montajes de los contratos que empiezan en {MESES_LARGOS[Number(datos.hoy.slice(5, 7)) - 1]}</h3>
          <p className="sub">Avance por etapa y conversión desde la etapa anterior.</p>
          {(() => {
            const pasos = [
              { t: "Contratos que empiezan", n: datos.embudo.empiezan },
              { t: "Aviso de montaje enviado", n: datos.embudo.avisoEnviado },
              { t: "Registrado por mercaderista", n: datos.embudo.registrado },
              { t: "Montado", n: datos.embudo.montado },
              { t: "Verificado con evidencia", n: datos.embudo.verificado },
            ];
            let peor: { de: typeof pasos[number]; a: typeof pasos[number] } | null = null;
            for (let i = 1; i < pasos.length; i++) {
              if (pasos[i - 1].n > 0 && (!peor || pasos[i].n / pasos[i - 1].n < peor.a.n / peor.de.n)) peor = { de: pasos[i - 1], a: pasos[i] };
            }
            return (
              <ConTabla
                tabla={(
                  <table className="an-tabla"><thead><tr><th>Etapa</th><th className="n">Contratos</th></tr></thead><tbody>
                    {pasos.map((p) => <tr key={p.t}><td>{p.t}</td><td className="n">{p.n}</td></tr>)}
                  </tbody></table>
                )}
                pie={<button type="button" className="mo-accion sec" onClick={manejo.onMontajes}>Ir a Montajes</button>}
              >
                {datos.embudo.empiezan === 0 ? <p className="an-vacio">Ningún contrato empieza este mes.</p> : <Embudo pasos={pasos} />}
                {peor && peor.a.n < peor.de.n && <p className="an-lectura">La mayor caída está entre «{peor.de.t.toLowerCase()}» y «{peor.a.t.toLowerCase()}»: de <b>{peor.de.n}</b> pasa{peor.a.n === 1 ? "" : "n"} <b>{peor.a.n}</b>.</p>}
              </ConTabla>
            );
          })()}
        </section>
        <section className="an-card">
          <h3>Preparación pendiente</h3>
          <p className="sub">Lo que tiene que estar antes del montaje.</p>
          <table className="an-tabla">
            <thead><tr><th>Concepto</th><th className="n">Cantidad</th><th>Estado</th></tr></thead>
            <tbody>
              {datos.preparacion.sinDistribuir !== null && <tr><td>Caras con participaciones sin distribuir</td><td className="n">{datos.preparacion.sinDistribuir}</td><td>{datos.preparacion.sinDistribuir ? <Estado tono="aviso">Por distribuir</Estado> : <Estado tono="bien">Al día</Estado>}</td></tr>}
              {datos.preparacion.sinPlanometria !== null && <tr><td>Contratos sin planometría</td><td className="n">{datos.preparacion.sinPlanometria}</td><td>{datos.preparacion.sinPlanometria ? <Estado tono="aviso">Por cargar</Estado> : <Estado tono="bien">Al día</Estado>}</td></tr>}
              <tr><td>Planogramas que no coinciden</td><td className="n">{datos.preparacion.noCoinciden}</td><td>{datos.preparacion.noCoinciden ? <Estado tono="aviso">Esperando corrección</Estado> : <Estado tono="bien">Al día</Estado>}</td></tr>
              <tr><td>Montajes no realizados</td><td className="n">{datos.preparacion.noRealizados}</td><td>{datos.preparacion.noRealizados ? <Estado tono="critico">Requieren gestión</Estado> : <Estado tono="bien">Al día</Estado>}</td></tr>
            </tbody>
          </table>
          <div className="an-cta"><button type="button" className="mo-accion sec" onClick={manejo.onPendientes}>Resolver en Pendientes</button></div>
        </section>
      </div>

      <div className="an-sec" data-capitulo="capacidad"><span className="n">{plata ? "04" : "03"}</span><h2>Capacidad por vender</h2><p>Espacios sin contrato o con venta parcial, y cómo negociarlos.</p></div>
      <section className="an-card">
        <div className="an-cab">
          <div>
            <h3>Espacios con capacidad disponible</h3>
            <p className="sub">{capacidad.length} de {datos.ocupacion.total} caras{plata ? ` · ${pesos(capacidadAlMes)} al mes a tarifa de referencia` : ""} · ordenados por {plata ? "valor disponible" : "código"}.</p>
          </div>
          <button type="button" className="mo-link der" onClick={() => manejo.onMapa("parcial")}>Ver en el mapa ›</button>
        </div>
        <div className="an-ley"><span><i className="o1" />Vendido</span><span><i className="o3" />Disponible</span></div>
        {capacidad.length === 0 ? <p className="an-vacio">Todas las caras están vendidas enteras.</p> : (
          <table className="an-tabla an-cap">
            <thead><tr><th>Espacio</th><th>Ocupación</th>{plata && <th className="n">Disponible al mes</th>}<th className="c-cli">Clientes en el espacio</th><th>Oportunidad</th><th /></tr></thead>
            <tbody>
              {(todaLaCapacidad ? capacidad : capacidad.slice(0, LIMITE_CAPACIDAD)).map((e) => {
                const v = e.estado === "libre" ? 0 : e.vendido;
                return (
                  <tr key={e.clave}>
                    <td><code>{e.codigo}</code><div className="dim">{e.tipo}</div></td>
                    <td>
                      <div className="an-mini" role="img" aria-label={v === null ? "Vendida en parte" : `${Math.round(v * 100)} % vendido`}>
                        {v === null ? <><div className="o1" style={{ flex: 1 }} /><div className="o3" style={{ flex: 1 }} /></>
                          : <>{v > 0 && <div className="o1" style={{ flex: v }} />}{v < 1 && <div className="o3" style={{ flex: 1 - v }} />}</>}
                      </div>
                      <div className="dim">{e.estado === "libre" ? "Sin contrato · 100 % libre" : e.detalleParcial ?? "Vendida en parte"}</div>
                    </td>
                    {plata && <td className="n">{e.libreAlMes !== null ? pesos(e.libreAlMes) : "—"}</td>}
                    <td className="c-cli dim">{e.clientes.join(", ") || "—"}</td>
                    <td className="c-arg">{oportunidad(e)}</td>
                    <td className="c-acc">{plata
                      ? <button type="button" className="mo-accion sec" onClick={() => manejo.onPropuesta(e.clave)}>Preparar propuesta</button>
                      : <button type="button" className="mo-accion sec" onClick={() => manejo.onFicha(e.clave)}>Ver ficha</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="an-cta">
          {capacidad.length > LIMITE_CAPACIDAD && (
            <button type="button" className="mo-accion sec" aria-expanded={todaLaCapacidad} onClick={() => setTodaLaCapacidad((t) => !t)}>
              {todaLaCapacidad ? `Ver los ${LIMITE_CAPACIDAD} de más valor` : `Ver los ${capacidad.length} espacios`}
            </button>
          )}
          {vacias.length > 0 && <button type="button" className="mo-accion sec" onClick={() => manejo.onMapa("vacias")}>Ver {vacias.length === 1 ? "el espacio vacío" : `los ${vacias.length} espacios vacíos`} en el mapa</button>}
          <button type="button" className="mo-link der" onClick={() => bajarCsv(`capacidad-${datos.sede}.csv`, aCsv(
            ["Espacio", "Tipo", "Estado", ...(plata ? ["Disponible al mes"] : []), "Clientes", "Oportunidad"],
            capacidad.map((e) => [e.codigo, e.tipo, e.estado === "libre" ? "Sin contrato" : e.detalleParcial ?? "En parte", ...(plata ? [e.libreAlMes ?? ""] : []), e.clientes.join(", "), oportunidad(e)]),
          ))}><Download {...ICONO} /> Bajar la lista (CSV)</button>
        </div>
      </section>
      <div className="an-dos">
        <section className="an-card">
          <h3>Caras por estado y tipo de mueble</h3>
          <p className="sub">{datos.ocupacion.total} caras que se venden.</p>
          <div className="an-ley"><span><i className="o1" />Vendida completa</span><span><i className="o2" />Venta parcial</span><span><i className="o3" />Sin contrato</span>{datos.porTipo.some((t) => t.otras) && <span><i className="o4" />Apartada (firmada, reservada)</span>}</div>
          <ConTabla
            tabla={(
              <table className="an-tabla"><thead><tr><th>Tipo</th><th className="n">Completas</th><th className="n">Parciales</th><th className="n">Sin contrato</th><th className="n">Apartadas</th></tr></thead><tbody>
                {datos.porTipo.map((t) => <tr key={t.tipo}><td>{t.tipo}</td><td className="n">{t.vendidas}</td><td className="n">{t.parciales}</td><td className="n">{t.libres}</td><td className="n">{t.otras}</td></tr>)}
              </tbody></table>
            )}
            pie={<button type="button" className="mo-accion sec" onClick={() => manejo.onMapa("vacias")}>Ver en el mapa</button>}
          >
            <CarasPorTipo filas={datos.porTipo} />
            {faltan > 0 && <p className="an-lectura">Para llegar a la meta de {datos.ocupacion.meta} % faltan <b>{faltan} cara{faltan === 1 ? "" : "s"}</b> con contrato.</p>}
          </ConTabla>
        </section>
        <section className="an-card">
          <h3>Caras completas sin contrato, próximos meses</h3>
          <p className="sub">Si no se renueva ni se vende nada más.</p>
          <ConTabla
            tabla={(
              <table className="an-tabla"><thead><tr><th>Fecha</th><th className="n">Caras sin contrato</th></tr></thead><tbody>
                {datos.proyeccion.map((p) => <tr key={p.etiqueta}><td>{p.etiqueta}</td><td className="n">{p.caras}</td></tr>)}
              </tbody></table>
            )}
            pie={<button type="button" className="mo-accion sec" onClick={() => manejo.onContratos("expiring")}>Gestionar renovaciones</button>}
          >
            <Proyeccion puntos={datos.proyeccion} />
            {datos.proyeccion.length > 1 && <p className="an-lectura">Sin renovaciones, las caras completas sin contrato pasan de <b>{datos.proyeccion[0].caras}</b> hoy a <b>{datos.proyeccion[datos.proyeccion.length - 1].caras}</b> el {datos.proyeccion[datos.proyeccion.length - 1].etiqueta}.</p>}
          </ConTabla>
        </section>
      </div>

      <div className="an-sec" data-capitulo="cartera"><span className="n">{plata ? "05" : "04"}</span><h2>Cartera de clientes</h2><p>{plata ? "Concentración del ingreso y precio frente a tarifa." : "Quiénes tienen espacios en la sede."}</p></div>
      <div className="an-dos a">
        <section className="an-card">
          <h3>{plata ? "Ingreso mensual por cliente" : "Espacios por cliente"}</h3>
          {(() => {
            const filas = datos.cartera.slice(0, 10);
            const val = (f: typeof filas[number]) => (plata ? f.alMes ?? 0 : f.espacios);
            const tot = datos.cartera.reduce((t, f) => t + val(f), 0) || 1;
            const top3 = Math.round((datos.cartera.slice(0, 3).reduce((t, f) => t + val(f), 0) / tot) * 100);
            const principal = datos.cartera[0];
            const venceDelPrincipal = principal ? datos.espacios.find((e) => e.vence && e.vence.proveedor === principal.nombre) : undefined;
            return (
              <>
                <p className="sub">{datos.cartera.length} cliente{datos.cartera.length === 1 ? "" : "s"}{datos.cartera.length > 3 ? ` · los 3 principales concentran el ${top3} %` : ""}{datos.cartera.length > 10 ? " · los 10 primeros" : ""}.</p>
                {filas.length === 0 ? <p className="an-vacio">Sin contratos vigentes.</p> : (
                  <ConTabla
                    tabla={(
                      <table className="an-tabla"><thead><tr><th>Cliente</th><th className="n">{plata ? "Al mes" : "Espacios"}</th></tr></thead><tbody>
                        {datos.cartera.map((f) => <tr key={f.nombre}><td>{f.nombre}</td><td className="n">{plata ? pesos(f.alMes ?? 0) : f.espacios}</td></tr>)}
                      </tbody></table>
                    )}
                    pie={plata && manejo.onQuienPaga ? <button type="button" className="mo-accion sec" onClick={manejo.onQuienPaga}>Ver Quién paga</button> : undefined}
                  >
                    <Cartera filas={filas} plata={plata} />
                    {principal && <p className="an-lectura"><b>{principal.nombre}</b>, el principal cliente ({Math.round((val(principal) / tot) * 100)} %){venceDelPrincipal ? `, tiene un contrato por vencer el ${fechaCorta(venceDelPrincipal.vence!.fecha)} (${venceDelPrincipal.vence!.codigo})` : ", no tiene contratos por vencer en 90 días"}.</p>}
                  </ConTabla>
                )}
              </>
            );
          })()}
        </section>
        {plata && (
          <section className="an-card">
            <h3>Precio frente a tarifa de referencia</h3>
            <p className="sub">Contratos de espacios con tarifa propia.</p>
            {datos.precio ? (
              <>
                <div className="an-precio">
                  <span>{datos.precio.pct} %</span>
                  {datos.precio.pct >= datos.precio.meta ? <Estado tono="bien">En meta ({datos.precio.meta} %)</Estado> : <Estado tono="aviso">Bajo la meta ({datos.precio.meta} %)</Estado>}
                </div>
                <div className="mo-medidor an-medidor" role="img" aria-label={`${datos.precio.pct} % de la tarifa, meta ${datos.precio.meta} %`}>
                  <div style={{ width: `${Math.min(100, (datos.precio.pct / 120) * 100)}%` }} /><span style={{ left: `${(datos.precio.meta / 120) * 100}%` }} />
                </div>
                <div className="an-escala"><span>0 %</span><span>meta {datos.precio.meta} %</span><span>120 %</span></div>
                <p className="an-lectura">Medido sobre <b>{datos.precio.contadas} de {datos.precio.contadas + datos.precio.sinTarifa}</b> contratos.{datos.precio.sinTarifa > 0 ? ` Los ${datos.precio.sinTarifa} restantes son por entrepaño o participación y no tienen tarifa de referencia propia.` : ""}</p>
              </>
            ) : <p className="an-vacio">Ningún contrato con tarifa de referencia.</p>}
            {manejo.onTarifas && <div className="an-cta"><button type="button" className="mo-accion sec" onClick={manejo.onTarifas}>Revisar las tarifas</button></div>}
          </section>
        )}
      </div>
    </div>
  );
}
