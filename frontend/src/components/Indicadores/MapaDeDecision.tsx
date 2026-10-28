import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { footprint2D, type UnifiedFixture } from "../../types/fixtures";
import { isDoubleGondola } from "../../types/espacio";
import { ejes, ladosVisibles, ordenDePintado, proyectar, VISTA_INICIAL, type Huella, type Lado } from "../../utils/camaraPlano";
import {
  anchoDeEtiqueta, colorDelVencimiento, empacarEtiquetas, enLaCapa, filasDeEtiquetas, mitadesDeLaGondola, tramoDeCaja, TEXTO_DEL_MONTAJE,
  type Caja, type CapaDelMapa, type EspacioDelMapa,
} from "../../utils/mapaDeDecision";
import { pesos } from "../../utils/indicadores";

/**
 * EL MAPA DE DECISIÓN (Indicadores › Mapa de oportunidades, versión B).
 *
 * La planta real de la sede, isométrica y en una base neutra —sin los colores
 * de libre/tomado del plano para contratar—, con UNA capa de datos por
 * indicador. Cada capa entra con un movimiento que dice algo del dato: lo
 * vendido se levanta, lo que vence late, lo vacío respira, el montaje corre
 * por el contorno, el cliente se une con arcos. Con «reducir movimiento», las
 * capas aparecen quietas.
 *
 * Las etiquetas van ARRIBA del mapa (abajo en la capa de cliente), en filas y
 * con una línea guía hasta su espacio: nunca una encima de otra
 * (`empacarEtiquetas`). En un lienzo angosto cada espacio lleva sólo su código;
 * el valor está en la lista de abajo.
 *
 * Es un SVG medido en píxeles reales (el `viewBox` es el tamaño del lienzo): un
 * rótulo de 11 px mide 11 px. No es un `<Canvas>`, así que el zoom de la app
 * no lo afecta.
 */

/** Alto (m) de la base, de lo vendido en la capa de venta parcial y del
 *  fantasma de lo vacío. Achatados como el isométrico de siempre. */
const HB = 0.9, HV = 2.1, HF = 1.6;
const E = ejes(VISTA_INICIAL);
const LADOS = ladosVisibles(E);

export interface AccionEnElMapa { clave: string; n: number; texto: string; prioridad: "alta" | "media" }

export interface MapaDeDecisionProps {
  fixtures: UnifiedFixture[];
  espacios: ReadonlyMap<string, EspacioDelMapa>;
  capa: CapaDelMapa;
  /** La capa de cliente: su nombre y lo que dice el nodo. */
  cliente: { nombre: string; detalle: string } | null;
  /** Las acciones prioritarias numeradas, en el orden de la lista. */
  acciones: readonly AccionEnElMapa[];
  verPlata: boolean;
  /** Tocar un espacio encendido. */
  onElegir?: (clave: string) => void;
  /** Lo que dice el mapa para un lector de pantalla. */
  descripcion: string;
}

interface CaraGeo { clave: string; caja: Caja; fixture: UnifiedFixture; cara: "A" | "B" }
interface Chip {
  x: number; y: number; l1: string; l2?: string | null; tono: "oscuro" | "alta" | "media" | "azul";
  d: number; pct?: number; res?: number;
}

function useTamano<T extends HTMLElement>(): [React.RefObject<T>, { w: number; h: number }] {
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
  return [ref, t];
}

const pts = (a: [number, number][]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export default function MapaDeDecision({ fixtures, espacios, capa, cliente, acciones, verPlata, onElegir, descripcion }: MapaDeDecisionProps) {
  const [ref, { w: W, h: H }] = useTamano<HTMLDivElement>();
  const chico = W > 0 && W < 500;

  /** La planta: la caja de cada cara, relativa al centro de la sala. */
  const planta = useMemo(() => {
    if (fixtures.length === 0) return null;
    const cajas = fixtures.map((f) => {
      const fp = footprint2D(f);
      return { f, x0: f.cx - fp.w / 2, x1: f.cx + fp.w / 2, z0: f.cz - fp.d / 2, z1: f.cz + fp.d / 2 };
    });
    const gx0 = Math.min(...cajas.map((c) => c.x0)) - 1, gx1 = Math.max(...cajas.map((c) => c.x1)) + 1;
    const gz0 = Math.min(...cajas.map((c) => c.z0)) - 1, gz1 = Math.max(...cajas.map((c) => c.z1)) + 1;
    const mx = (gx0 + gx1) / 2, mz = (gz0 + gz1) / 2;
    const muebles = cajas.map(({ f, x0, x1, z0, z1 }) => {
      const caja: Caja = { x0: x0 - mx, x1: x1 - mx, z0: z0 - mz, z1: z1 - mz };
      // Las dos caras de una góndola doble, como las corta el plano; la B
      // queda del lado de la cámara (+x, +z), así que se pinta después.
      const caras: CaraGeo[] = isDoubleGondola(f)
        ? (() => { const m = mitadesDeLaGondola(caja); return [
          { clave: `${f.id}-A`, caja: m.A, fixture: f, cara: "A" as const },
          { clave: `${f.id}-B`, caja: m.B, fixture: f, cara: "B" as const }]; })()
        : [{ clave: `${f.id}-A`, caja, fixture: f, cara: "A" }];
      return { f, caja, caras };
    });
    return { muebles, piso: { x0: gx0 - mx, x1: gx1 - mx, z0: gz0 - mz, z1: gz1 - mz } };
  }, [fixtures]);

  const dibujo = useMemo(() => {
    if (!planta || W === 0 || H === 0) return null;
    const lit = (clave: string) => {
      const e = espacios.get(clave);
      if (!e) return false;
      if (capa === "acciones") return acciones.some((a) => a.clave === clave);
      return enLaCapa(e, capa, cliente?.nombre);
    };

    // ── Las etiquetas que va a haber: con eso se sabe cuántas filas ocupan
    //    arriba (o abajo, en la de cliente) y cuánto lugar le queda al mapa.
    const pedidas: { clave: string; l1: string; l2: string | null; tono: Chip["tono"]; pct?: number; res?: number }[] = [];
    const conPlata = (n: number | null | undefined) => (verPlata && n !== null && n !== undefined ? pesos(n) : null);
    for (const m of planta.muebles) for (const c of m.caras) {
      if (!lit(c.clave)) continue;
      const e = espacios.get(c.clave)!;
      switch (capa) {
        case "acciones": {
          const a = acciones.find((x) => x.clave === c.clave)!;
          pedidas.push({ clave: c.clave, l1: `${a.n} · ${e.codigo}`, l2: a.texto, tono: a.prioridad });
          break;
        }
        case "parcial": {
          const pct = e.vendido !== null ? Math.round(e.vendido * 100) : null;
          const libre = conPlata(e.libreAlMes);
          pedidas.push({
            clave: c.clave, l1: pct !== null ? `${e.codigo} · ${pct} %` : e.codigo,
            l2: libre ? `${libre} libre` : e.detalleParcial, tono: "oscuro",
            ...(e.vendido !== null ? { pct: e.vendido, res: e.partes && e.partes.total ? e.partes.reservadas / e.partes.total : 0 } : {}),
          });
          break;
        }
        case "vacias": {
          const dias = e.nuncaContratada ? "nunca vendida" : e.diasSinContrato !== null ? `${e.diasSinContrato} días sin contrato` : "sin contrato";
          const t = conPlata(e.tarifa);
          pedidas.push({ clave: c.clave, l1: e.codigo, l2: t ? `${t} · ${dias}` : dias, tono: "oscuro" });
          break;
        }
        case "ingreso":
          if (verPlata && (e.ingresoAlMes ?? 0) >= umbralDeRotulo(espacios)) pedidas.push({ clave: c.clave, l1: e.codigo, l2: pesos(e.ingresoAlMes!), tono: "oscuro" });
          else if (!verPlata) pedidas.push({ clave: c.clave, l1: e.codigo, l2: null, tono: "oscuro" });
          break;
        case "vence": {
          const v = e.vence!;
          const p = conPlata(v.alMes);
          pedidas.push({
            clave: c.clave, l1: v.codigo, l2: `vence en ${v.dias} día${v.dias === 1 ? "" : "s"}${p && v.dias <= 30 ? ` · ${p}` : ""}`,
            tono: v.dias <= 30 ? "alta" : "oscuro",
          });
          break;
        }
        case "montaje": {
          const est = e.montaje!;
          pedidas.push({ clave: c.clave, l1: e.codigo, l2: TEXTO_DEL_MONTAJE[est], tono: est === "no_realizado" ? "alta" : est === "sin_montar" || est === "no_coincide" ? "media" : "azul" });
          break;
        }
        case "cliente": {
          const k = e.contratos.filter((x) => x.proveedor === cliente?.nombre);
          const total = k.reduce((t, x) => t + (x.alMes ?? 0), 0);
          const vence = e.vence && e.vence.proveedor === cliente?.nombre ? ` · vence en ${e.vence.dias} días` : "";
          pedidas.push({ clave: c.clave, l1: e.codigo, l2: (verPlata && total > 0 ? pesos(total) : `${k.length} contrato${k.length === 1 ? "" : "s"}`) + vence, tono: vence ? "alta" : "oscuro" });
          break;
        }
      }
    }
    const altoChip = (p: { l2: string | null; pct?: number }) => (p.l2 ? 34 : 20) + (p.pct !== undefined ? 8 : 0);
    // Las filas, con la misma cuenta que el empaque (`filasDeEtiquetas`); la x
    // todavía no se sabe, pero el reparto sólo mira el orden.
    const filas = filasDeEtiquetas(pedidas.map((p, k) => ({ x: k, ancho: anchoDeEtiqueta(p.l1, p.l2) })), W, 8, 3);
    const filasChicas = chico ? filasDeEtiquetas(pedidas.map((p, k) => ({ x: k, ancho: p.l1.length * 5.8 + 10 })), W, 4, 3) : 0;
    const paso = Math.max(0, ...pedidas.map(altoChip)) + 8;
    const NODO = capa === "cliente" && cliente ? 52 : 0;
    const arriba = capa === "cliente" ? NODO + 8 : chico ? 12 + filasChicas * 18 : filas ? 8 + filas * paso : 16;
    const abajo = capa === "cliente" && filas && !chico ? 8 + filas * paso : capa === "cliente" && chico ? 12 + filasChicas * 18 : 10;
    const pad = 10;

    // ── El encuadre: el piso entero y las tapas de los muebles.
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    const mide = (x: number, y: number, z: number) => {
      const [a, b] = proyectar(E, x, y, z);
      mnx = Math.min(mnx, a); mxx = Math.max(mxx, a); mny = Math.min(mny, b); mxy = Math.max(mxy, b);
    };
    const { piso } = planta;
    for (const x of [piso.x0, piso.x1]) for (const z of [piso.z0, piso.z1]) mide(x, 0, z);
    for (const m of planta.muebles) for (const x of [m.caja.x0, m.caja.x1]) for (const z of [m.caja.z0, m.caja.z1]) mide(x, HB, z);
    const esc = Math.max(1, Math.min((W - 2 * pad) / (mxx - mnx), (H - arriba - abajo) / (mxy - mny)));
    const ox = pad - mnx * esc + ((W - 2 * pad) - (mxx - mnx) * esc) / 2;
    const oy = arriba - mny * esc + Math.max(0, (H - arriba - abajo) - (mxy - mny) * esc) / 2;
    const P = (x: number, y: number, z: number): [number, number] => {
      const [a, b] = proyectar(E, x, y, z);
      return [ox + a * esc, oy + b * esc];
    };

    const prisma = (key: string, c: Caja, y0: number, y1: number, tono: string, o: { clase?: string; estilo?: CSSProperties; clave?: string } = {}) => {
      const esq = (l: Lado): [number, number][] => {
        switch (l) {
          case "z+": return [P(c.x0, y1, c.z1), P(c.x1, y1, c.z1), P(c.x1, y0, c.z1), P(c.x0, y0, c.z1)];
          case "z-": return [P(c.x1, y1, c.z0), P(c.x0, y1, c.z0), P(c.x0, y0, c.z0), P(c.x1, y0, c.z0)];
          case "x+": return [P(c.x1, y1, c.z1), P(c.x1, y1, c.z0), P(c.x1, y0, c.z0), P(c.x1, y0, c.z1)];
          case "x-": return [P(c.x0, y1, c.z0), P(c.x0, y1, c.z1), P(c.x0, y0, c.z1), P(c.x0, y0, c.z0)];
        }
      };
      const tapa = [P(c.x0, y1, c.z0), P(c.x1, y1, c.z0), P(c.x1, y1, c.z1), P(c.x0, y1, c.z1)];
      return (
        <g key={key} className={`p ${tono}${o.clase ? ` ${o.clase}` : ""}`} style={o.estilo}>
          {LADOS.map((l) => <polygon key={l} className={l[0]} points={pts(esq(l))} />)}
          <polygon className="t" points={pts(tapa)} />
        </g>
      );
    };

    const maxIngreso = Math.max(1, ...[...espacios.values()].map((e) => e.ingresoAlMes ?? 0));
    const orden = ordenDePintado(planta.muebles.map((m): Huella => ({ ...m.caja, h: capa === "parcial" ? HV : HB })), E);
    const suelo: ReactNode[] = [], cuerpos: ReactNode[] = [], encima: ReactNode[] = [], rotulos: ReactNode[] = [];
    const anclas = new Map<string, [number, number]>();
    let i = 0;
    for (const k of orden) {
      const m = planta.muebles[k];
      for (const c of m.caras) {
        const e = espacios.get(c.clave);
        const on = lit(c.clave);
        const apagada = capa !== "acciones" && !on;
        const base = e?.comercial ? (apagada ? "off" : "base") : apagada ? "off resto" : "resto";
        const tocar = on && onElegir ? { onClick: () => onElegir(c.clave), style: { cursor: "pointer" } as CSSProperties } : {};
        const titulo = e ? <title>{e.codigo}</title> : null;
        const cx = (c.caja.x0 + c.caja.x1) / 2, cz = (c.caja.z0 + c.caja.z1) / 2;
        const ex = c.caja.x1 - c.caja.x0, ez = c.caja.z1 - c.caja.z0;
        const d = (n: number) => ({ "--d": `${n}ms` }) as CSSProperties;
        if (!on || !e) { cuerpos.push(prisma(c.clave, c.caja, 0, HB, base)); continue; }
        const grupo = (hijos: ReactNode) => <g key={c.clave} data-espacio={c.clave} {...tocar}>{titulo}{hijos}</g>;
        switch (capa) {
          case "acciones": {
            const a = acciones.find((x) => x.clave === c.clave)!;
            cuerpos.push(grupo(prisma("b", c.caja, 0, HB, `base marcada ${a.prioridad}`)));
            anclas.set(c.clave, P(cx, HB, cz));
            break;
          }
          case "parcial": {
            const piezas: ReactNode[] = [];
            if (e.partes && e.partes.total > 0) {
              // Por partes (las puntas por entrepaño): un bloque por parte.
              const alto = HV / e.partes.total;
              for (let p = 0; p < e.partes.total; p++) {
                const tipo = p < e.partes.vendidas ? "sol" : p < e.partes.vendidas + e.partes.reservadas ? "res" : "vac";
                piezas.push(prisma(`p${p}`, c.caja, p * alto + 0.03, (p + 1) * alto - 0.03, tipo,
                  { clase: tipo === "vac" ? "hormigas lento" : "llena", estilo: d(i * 110 + p * 70) }));
              }
            } else if (e.vendido !== null) {
              // Por participación: la cara se parte a lo largo. Lo vendido, del
              // lado de la cámara; lo libre, detrás, punteado y vacío.
              const largo = Math.max(ex, ez), gap = Math.min(0.12, largo * 0.04) / largo;
              const v = Math.min(1, Math.max(0, e.vendido));
              const vend = tramoDeCaja(c.caja, 1 - v, 1), libre = tramoDeCaja(c.caja, 0, Math.max(0, 1 - v - gap));
              if (v < 1) {
                piezas.push(prisma("lp", libre, 0, 0.12, "vac suelo"));
                piezas.push(prisma("lv", libre, 0, HV, "vac", { clase: "hormigas lento" }));
              }
              if (v > 0) piezas.push(prisma("sv", vend, 0, HV, "sol", { clase: "llena", estilo: d(i * 110) }));
            } else {
              // Sin el porcentaje (quien no administra): se sabe que hay algo
              // vendido y lugar para más, no cuánto.
              piezas.push(prisma("sb", c.caja, 0, HB, "sol", { clase: "llena", estilo: d(i * 110) }));
              piezas.push(prisma("sv", c.caja, HB, HV, "vac", { clase: "hormigas lento" }));
            }
            cuerpos.push(grupo(piezas));
            anclas.set(c.clave, P(cx, HV, cz));
            i++;
            break;
          }
          case "vacias": {
            const [hx, hy] = P(cx, 0, cz);
            const r = Math.min(Math.max(ex, ez), 3) * esc;
            suelo.push(<ellipse key={`h${c.clave}`} className="halo" cx={hx} cy={hy} rx={r * 0.75} ry={r * 0.42} style={d(i * 200)} />);
            cuerpos.push(grupo(prisma("f", c.caja, 0, HF, "fantasma", { clase: "hormigas lento" })));
            anclas.set(c.clave, P(cx, HF, cz));
            i++;
            break;
          }
          case "ingreso": {
            const ing = e.ingresoAlMes ?? 0;
            const alto = verPlata ? 0.4 + (ing / maxIngreso) * 6.5 : 2.4;
            const t = verPlata ? Math.round((ing / maxIngreso) * 100) : 70;
            const col: Caja = (() => {
              const lx = Math.min(ex, 1.1), lz = Math.min(ez, 1.1);
              return { x0: cx - lx / 2, x1: cx + lx / 2, z0: cz - lz / 2, z1: cz + lz / 2 };
            })();
            cuerpos.push(prisma(c.clave, c.caja, 0, HB, "base"));
            encima.push(<g key={c.clave} data-espacio={c.clave} {...tocar}>{titulo}
              {prisma("c", col, HB, HB + alto, "rampa", { clase: "llena", estilo: { ...d(Math.round((1 - ing / maxIngreso) * 500)), "--t": `${t}%` } as CSSProperties })}</g>);
            anclas.set(c.clave, P(cx, HB + alto, cz));
            break;
          }
          case "vence": {
            const v = e.vence!;
            const tono = colorDelVencimiento(v.dias);
            const [hx, hy] = P(cx, 0, cz);
            const r = Math.min(Math.max(ex, ez), 2.2) * esc * 0.7;
            for (let o = 0; o < (v.dias <= 30 ? 3 : 2); o++) {
              suelo.push(<ellipse key={`o${c.clave}${o}`} className={`onda ${tono}`} cx={hx} cy={hy} rx={r} ry={r * 0.55}
                style={{ "--d": `${o * 700}ms`, "--dur": `${v.dias <= 30 ? 2100 : 3200}ms` } as CSSProperties} />);
            }
            cuerpos.push(grupo(prisma("b", c.caja, 0, HB, tono)));
            anclas.set(c.clave, P(cx, HB, cz));
            break;
          }
          case "montaje": {
            const est = e.montaje!;
            const tono = est === "no_realizado" ? "m-alta" : est === "sin_montar" || est === "no_coincide" ? "m-media" : "m-azul";
            cuerpos.push(grupo(prisma("b", c.caja, 0, HB, `base ${tono}`, { clase: "hormigas" })));
            anclas.set(c.clave, P(cx, HB, cz));
            break;
          }
          case "cliente": {
            cuerpos.push(grupo(prisma("b", c.caja, 0, HB, "cli")));
            anclas.set(c.clave, P(cx, HB, cz));
            break;
          }
        }
      }
      // El código del mueble, discreto, sobre el piso.
      const [rx, ry] = P((m.caja.x0 + m.caja.x1) / 2, 0, (m.caja.z0 + m.caja.z1) / 2);
      if (!chico) rotulos.push(<text key={`r${m.f.id}`} className="rot" x={rx} y={ry + 14}>{m.f.code}</text>);
    }

    // ── El piso y su retícula de 2 m.
    const pisoPts = pts([P(piso.x0, 0, piso.z0), P(piso.x1, 0, piso.z0), P(piso.x1, 0, piso.z1), P(piso.x0, 0, piso.z1)]);
    const reticula: ReactNode[] = [];
    for (let x = Math.ceil(piso.x0 / 2) * 2; x <= piso.x1; x += 2) {
      const [a, b] = P(x, 0, piso.z0), [c2, d2] = P(x, 0, piso.z1);
      reticula.push(<line key={`x${x}`} x1={a} y1={b} x2={c2} y2={d2} />);
    }
    for (let z = Math.ceil(piso.z0 / 2) * 2; z <= piso.z1; z += 2) {
      const [a, b] = P(piso.x0, 0, z), [c2, d2] = P(piso.x1, 0, z);
      reticula.push(<line key={`z${z}`} x1={a} y1={b} x2={c2} y2={d2} />);
    }

    // ── Las etiquetas.
    const chips: Chip[] = pedidas.flatMap((p, k) => {
      const a = anclas.get(p.clave);
      return a ? [{ x: a[0], y: a[1], l1: p.l1, l2: p.l2, tono: p.tono, d: 300 + k * 90, pct: p.pct, res: p.res }] : [];
    });
    const etiquetas: ReactNode[] = [];
    if (chico && chips.length) {
      // En el teléfono, sólo el código (la lista de abajo dice el valor), en
      // filas arriba del mapa como en la pantalla grande: nunca encimados.
      const ancho = (c: Chip) => c.l1.length * 5.8 + 10;
      const ub = empacarEtiquetas(chips.map((c) => ({ x: c.x, ancho: ancho(c) })), W, 4, 3);
      chips.forEach((c, k) => {
        const w = ancho(c), { izq, fila } = ub[k], cxx = izq + w / 2;
        const yy = capa === "cliente" ? H - abajo + 6 + fila * 18 : 6 + fila * 18;
        const borde = capa === "cliente" ? yy : yy + 14, medio = (borde + c.y) / 2;
        etiquetas.push(
          <g key={k} className={`chip ${c.tono}`} style={{ "--d": `${k * 80}ms` } as CSSProperties}>
            <path className="guia" d={`M${cxx},${borde} C${cxx},${medio} ${c.x},${medio} ${c.x},${c.y}`} />
            <circle className="md-punto" cx={c.x} cy={c.y} r={2.5} />
            <rect x={izq} y={yy} width={w} height={14} rx={4} />
            <text className="l1 chica" x={cxx} y={yy + 10}>{c.l1}</text>
          </g>,
        );
      });
    } else if (chips.length) {
      const ub = empacarEtiquetas(chips.map((c) => ({ x: c.x, ancho: anchoDeEtiqueta(c.l1, c.l2) })), W, 8, 3);
      const y0Filas = capa === "cliente" ? H - abajo + 8 : 8;
      chips.forEach((c, k) => {
        const w = anchoDeEtiqueta(c.l1, c.l2), h = (c.l2 ? 34 : 20) + (c.pct !== undefined ? 8 : 0);
        const { izq, fila } = ub[k];
        const y0 = y0Filas + fila * paso, cxx = izq + w / 2;
        const borde = capa === "cliente" ? y0 : y0 + h;
        const medio = (borde + c.y) / 2;
        etiquetas.push(
          <g key={k} className={`chip ${c.tono}`} style={{ "--d": `${c.d}ms` } as CSSProperties}>
            <path className="guia" d={`M${cxx},${borde} C${cxx},${medio} ${c.x},${medio} ${c.x},${c.y}`} />
            <circle className="md-punto" cx={c.x} cy={c.y} r={3} />
            <rect x={izq} y={y0} width={w} height={h} rx={6} />
            <text className="l1" x={cxx} y={y0 + 13.5}>{c.l1}</text>
            {c.l2 && <text className="l2" x={cxx} y={y0 + 27}>{c.l2}</text>}
            {c.pct !== undefined && (
              <>
                <rect className="pista" x={izq + 8} y={y0 + 33} width={w - 16} height={4} rx={2} />
                <rect className="md-barrita" x={izq + 8} y={y0 + 33} width={(w - 16) * c.pct} height={4} rx={2} style={{ "--d": `${c.d + 200}ms` } as CSSProperties} />
                {c.res ? <rect className="reservado" x={izq + 8 + (w - 16) * c.pct} y={y0 + 33} width={(w - 16) * c.res} height={4} /> : null}
              </>
            )}
          </g>,
        );
      });
    }

    // ── El cliente: un nodo arriba y un arco a cada uno de sus espacios.
    if (capa === "cliente" && cliente) {
      const nx = W / 2, ny = 26;
      const anchoNodo = Math.max(cliente.nombre.length * 7.6, cliente.detalle.length * 5.9) + 28;
      [...anclas].forEach(([clave, [px, py]], k) => {
        encima.push(
          <g key={`a${clave}`}>
            <path className="arco" d={`M${nx},${ny + 17} Q${(nx + px) / 2},${Math.min(ny, py) - 10} ${px},${py}`} style={{ "--d": `${k * 220}ms` } as CSSProperties} />
            <circle className="arco-punto" cx={px} cy={py} r={4.5} />
          </g>,
        );
      });
      encima.push(
        <g key="nodo" className="chip nodo">
          <rect x={nx - anchoNodo / 2} y={ny - 17} width={anchoNodo} height={34} rx={17} />
          <text className="n1" x={nx} y={ny}>{cliente.nombre}</text>
          <text className="n2" x={nx} y={ny + 12}>{cliente.detalle}</text>
        </g>,
      );
    }

    return { pisoPts, reticula, suelo, cuerpos, encima, rotulos, etiquetas };
  }, [planta, W, H, espacios, capa, cliente, acciones, verPlata, onElegir, chico]);

  return (
    <div ref={ref} className="md-lienzo" data-capa={capa}>
      {dibujo && (
        <svg className={`md-svg capa-${capa}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={descripcion}>
          <defs>
            <filter id="md-sombra" x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
            </filter>
          </defs>
          <polygon className="piso" points={dibujo.pisoPts} />
          <g className="reticula">{dibujo.reticula}</g>
          {/* La capa entera se vuelve a montar al cambiar: así cada una entra
              con su propio movimiento. */}
          <g key={capa}>
            <g>{dibujo.suelo}</g>
            <g filter="url(#md-sombra)">{dibujo.cuerpos}</g>
            <g>{dibujo.rotulos}</g>
            <g filter="url(#md-sombra)">{dibujo.encima}</g>
            <g>{dibujo.etiquetas}</g>
          </g>
        </svg>
      )}
    </div>
  );
}

/** Desde cuánto se rotula una columna de ingreso: los que pagan al menos la
 *  mitad del que más paga (nunca todos: serían una etiqueta por espacio). */
function umbralDeRotulo(espacios: ReadonlyMap<string, EspacioDelMapa>): number {
  const max = Math.max(0, ...[...espacios.values()].map((e) => e.ingresoAlMes ?? 0));
  return max * 0.5;
}
