import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { daysTakenInRange, type UnifiedFixture } from "../../types/fixtures";
import type { SeasonOccurrence } from "../../types/seasons";
import {
  acomodarFechas, anchoMono, cifrasQueEntran, leyendaQueEntra, notaQueEntra,
} from "./acomodo";

/**
 * «Cuándo se libera cada espacio» — la forma A·4, con el tratamiento de D.
 *
 * Una escalera sobre un eje de fechas proporcional, a todo el ancho del panel.
 * Contesta la pregunta con la que se negocia una fecha de inicio: no cuántos
 * espacios hay libres, sino CUÁNDO deja de ser cierto ese número.
 *
 * Cuatro decisiones que conviene no deshacer —salieron de medir la maqueta, no
 * de opinar sobre ella—:
 *
 *   · **A todo el ancho.** Un chip de código mide 58 px. Si el panel se
 *     angosta hasta que dos fechas de entrega quedan a menos de eso, los
 *     códigos se pisan; por eso el componente los apila en columnas y suelta
 *     los que no entran, en vez de dibujarlos encimados.
 *   · **Sin eje vertical.** El rango típico va de 15 a 20: una escala completa
 *     sería adorno. Cada tramo lleva su cifra escrita en la punta.
 *   · **Peine de días.** Un diente por día bajo el eje. Sin él, el tramo plano
 *     se lee como espacio sobrante en vez de como tiempo que pasa —que es
 *     justamente el dato: «no se mueve nada durante 25 días»—.
 *   · **El cursor escribe la lectura.** Sigue al mouse Y a `←` `→` con el
 *     teclado, y dice «si arrancás el 26 de sep → 17 libres».
 *
 * DOS COSAS QUE TRAJO D:
 *
 *  1. **La lectura no vive adentro del SVG.** Sube al encabezado del panel, en
 *     mono y chica a la derecha del título (pedido del dueño, 2026-09-07). Se
 *     escribe por `onLectura`, que es una función imperativa: mover el cursor
 *     no puede volver a pintar la pantalla. Y con eso desaparece el problema
 *     que este archivo tenía escrito —la lectura y el rótulo del eje se pisaban
 *     cuando el cursor caía a la izquierda, y había que estimar el ancho del
 *     texto a ojo para esquivarlo— porque ya no comparten renglón.
 *  2. **El viewBox es exactamente la caja en pantalla.** El SVG se mide con un
 *     `ResizeObserver` y dibuja a escala 1, así que sus cuerpos caen sobre
 *     pasos de la escala (10,5 · 11,5 · 15) en vez de derivar a 10,3 · 11,3 ·
 *     14,7 según lo ancho que esté el panel. Los tamaños de acá SON los píxeles
 *     finales, y por eso se pueden contar.
 *
 * Los chips encienden su mueble en el plano (`onResaltar`): el mismo mecanismo
 * y el mismo código que las filas de la tarifa y las del contrato.
 *
 * La serie NO se asume monótona. Un contrato que ARRANCA en el medio del
 * periodo baja la disponibilidad, y dibujar eso como una subida sería mentir
 * sobre inventario que ya está vendido. Se cuenta día por día.
 */

const ALTO_BASE = 202;
const MARGEN_X = 12;
const CHIP_W = 58;
const CHIP_H = 19;

const MES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"];

const TITULO = "Espacios libres a lo largo del periodo";

/** Los cuerpos de `tema.css` en px, para las cuentas de choque de `acomodo.ts`.
 *  Se leen de los tokens al medir la caja; estos son sólo el valor con el que
 *  arranca el primer pintado, antes de que haya hoja de estilos que leer. */
const CUERPOS_INICIALES = { lbl: 10.5, t2xs: 11.5, base: 15 };

const dm = (d: Date) => `${d.getDate()} ${MES[d.getMonth()]}`;
const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** Una cara que cambia de mano en una fecha: entra al inventario o sale. */
interface Cambio {
  code: string;
  /** `${fixtureId}-${cara}` — la llave con la que el plano la enciende. */
  clave: string;
  tipo: string;
  /** `entra` = se libera. `sale` = un contrato arranca y deja de estar libre. */
  sentido: "entra" | "sale";
}

export interface LiberaProps {
  fixtures: UnifiedFixture[];
  /** Las caras comercializables de un mueble, con su código y sus fechas. */
  facesOf: (f: UnifiedFixture) => {
    fixture: UnifiedFixture; face: "A" | "B"; code: string;
    status: UnifiedFixture["status"]; startDate: string; endDate: string;
    /** Vender por partes: los contratos de sus partes (las puertas vendidas).
     *  Un día con una puerta tomada la cara no está libre: se vende otra
     *  puerta, no la nevera (la misma cuenta que el plano, que la pinta
     *  «parcial»). Sin esto, la cara sola, como siempre. */
    tambien?: { status: UnifiedFixture["status"]; startDate: string; endDate: string }[];
  }[];
  /** Cómo se llama el TIPO de esa cara —«Punta de góndola»—, para el pie.
   *  El nombre propio del mueble («Punta 03») ya está en el chip del código. */
  tipoDe: (f: UnifiedFixture) => string;
  desde: Date;
  hasta: Date;
  /** Las temporadas comerciales que pisan el periodo, para el fondo. */
  temporadas?: SeasonOccurrence[];
  /** Dónde escribir la lectura del cursor: el encabezado del panel. */
  onLectura?: (dia: string, libres: number) => void;
  /** Apagar la sala y encender esos muebles, desde un chip de código. */
  onResaltar?: (claves: string[] | null) => void;
}

export default function Libera({
  fixtures, facesOf, tipoDe, desde, hasta, temporadas = [], onLectura, onResaltar,
}: LiberaProps) {
  const [cursor, setCursor] = useState<number | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  /** El SVG dibuja a escala 1: su viewBox es su caja. Sin esto los tamaños de
   *  este archivo no son los que se ven, y «diez cuerpos en pantalla» deja de
   *  poder comprobarse. */
  const [caja, setCaja] = useState({ w: 974, h: ALTO_BASE });
  const [cuerpos, setCuerpos] = useState(CUERPOS_INICIALES);

  useLayoutEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    // Los tamaños de letra con los que se cuentan los choques son los de los
    // tokens, no una copia: si la escala se mueve, las cuentas la siguen.
    const cs = getComputedStyle(el);
    const leer = (v: string, d: number) => {
      const n = parseFloat(cs.getPropertyValue(v));
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    const leidos = {
      lbl: leer("--lbl-px", CUERPOS_INICIALES.lbl),
      t2xs: leer("--t-2xs", CUERPOS_INICIALES.t2xs),
      base: leer("--t-base", CUERPOS_INICIALES.base),
    };
    setCuerpos((c) => (c.lbl === leidos.lbl && c.t2xs === leidos.t2xs && c.base === leidos.base
      ? c : leidos));
  }, []);

  useLayoutEffect(() => {
    const el = cajaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setCaja((c) => (Math.abs(c.w - r.width) < 1 && Math.abs(c.h - r.height) < 1
          ? c : { w: r.width, h: r.height }));
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Angosto: la caja mide más que el panel y el panel se desliza; el encuadre
     arranca por los escalones (el final), como en D, con la barra a la vista. */
  useLayoutEffect(() => {
    const p = cajaRef.current?.parentElement;
    if (!p) return;
    const s = p.scrollWidth - p.clientWidth;
    if (s > 0) p.scrollLeft = s;
  }, [caja]);

  const datos = useMemo(() => {
    const dia = 86400000;
    const d0 = new Date(desde); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(hasta); d1.setHours(0, 0, 0, 0);
    const dias = Math.max(0, Math.round((d1.getTime() - d0.getTime()) / dia));
    const fecha = (i: number) => new Date(d0.getTime() + i * dia);

    const caras = fixtures.flatMap(facesOf);
    // Libre día por día. Un rango de un solo día en `daysTakenInRange` contesta
    // exactamente «¿está tomada esa fecha?», que es la pregunta acá, y usa la
    // MISMA cuenta que pinta el plano: los dos números no pueden discrepar.
    const librePorDia: boolean[][] = caras.map((c) => {
      const fila: boolean[] = [];
      for (let i = 0; i <= dias; i++) {
        const d = fecha(i);
        fila.push(daysTakenInRange(c, d, d) === 0 && (c.tambien ?? []).every((t) => daysTakenInRange(t, d, d) === 0));
      }
      return fila;
    });

    const serie: number[] = [];
    for (let i = 0; i <= dias; i++) {
      let n = 0;
      for (const fila of librePorDia) if (fila[i]) n++;
      serie.push(n);
    }

    // Los días en que la cuenta cambia, y qué caras la movieron.
    const cambios = new Map<number, Cambio[]>();
    librePorDia.forEach((fila, k) => {
      for (let i = 1; i <= dias; i++) {
        if (fila[i] === fila[i - 1]) continue;
        const lista = cambios.get(i) ?? [];
        lista.push({
          code: caras[k].code,
          clave: `${caras[k].fixture.id}-${caras[k].face}`,
          tipo: tipoDe(caras[k].fixture),
          sentido: fila[i] ? "entra" : "sale",
        });
        cambios.set(i, lista);
      }
    });

    return { dias, fecha, serie, cambios: [...cambios].sort((a, b) => a[0] - b[0]) };
  }, [fixtures, facesOf, tipoDe, desde, hasta]);

  const { dias, fecha, serie, cambios } = datos;
  const iCursor = Math.max(0, Math.min(dias, cursor ?? (cambios[0]?.[0] ?? 0)));
  const libresEn = serie[iCursor] ?? 0;

  // La lectura sube al encabezado. En un efecto y no en el render: escribirla
  // durante el render sería cambiarle el estado a otro componente en mitad del
  // pintado.
  useEffect(() => {
    if (dias > 0 && serie.length > 0) onLectura?.(dm(fecha(iCursor)), libresEn);
  }, [onLectura, iCursor, libresEn, dias, serie.length, fecha]);

  if (dias <= 0 || serie.length === 0) return null;

  const ANCHO = Math.max(360, caja.w);
  const ALTO = Math.max(150, caja.h);
  const X0 = MARGEN_X;
  const X1 = ANCHO - MARGEN_X;
  // El eje deja abajo el peine, la fila de fechas y hasta dos filas de chips.
  const YE = Math.max(70, ALTO - 76);

  const x = (i: number) => X0 + (i * (X1 - X0)) / dias;
  const minN = Math.min(...serie);
  const maxN = Math.max(...serie);
  // La escala se achica sola cuando el rango de la serie es grande: sin esto,
  // una sede donde se liberan veinte caras se salía del panel por arriba.
  const escala = Math.min(12, (YE - 42) / Math.max(1, maxN - minN + 2));
  const y = (n: number) => YE - (n - minN + 2) * escala;

  // La escalera: horizontal hasta el cambio, vertical en el cambio.
  const pasos: [number, number][] = [];
  let previo = serie[0];
  pasos.push([x(0), y(previo)]);
  for (let i = 1; i <= dias; i++) {
    if (serie[i] === previo) continue;
    pasos.push([x(i), y(previo)]);
    pasos.push([x(i), y(serie[i])]);
    previo = serie[i];
  }
  pasos.push([x(dias), y(previo)]);
  const poli = (p: [number, number][]) => p.map(([a, b]) => `${f(a)},${f(b)}`).join(" ");

  // Qué fechas se ganan una columna: su fecha bajo el eje y sus chips debajo,
  // SIEMPRE juntos. Dos cambios más cerca de lo que miden sus fechas (o sus
  // chips) se quedan con una sola columna, la de más a la izquierda; y el
  // primero le gana el lugar a «hoy · 23 sep». La regla y el porqué, en
  // `acomodo.ts`.
  const porDia = new Map(cambios);
  const { hoy: rotuloHoy, columnas } = acomodarFechas({
    X0, X1, x,
    cambios: cambios.map(([i]) => ({ i, fecha: dm(fecha(i)) })),
    hoy: dm(fecha(0)),
    pxFecha: cuerpos.t2xs,
    chipW: CHIP_W,
  });

  // Las cifras de cada tramo. La del arranque siempre; las otras, si no tapan
  // a una ya puesta —dos escalones a un día de distancia las encimaban—.
  const cifras = [
    { x: X0 + 2, y: y(serie[0]) - 11, txt: String(serie[0]) },
    ...cambios.map(([i]) => ({ x: x(i) + 8, y: y(serie[i]) - 12, txt: String(serie[i]) })),
  ];
  const cifraVisible = cifrasQueEntran(cifras, cuerpos.base, -0.02);

  // El primer tramo plano: «sin cambios durante N días» es la mitad del valor
  // de este gráfico, y es lo único que no se ve mirando la escalera. Arranca
  // después de la cifra de partida —que puede tener tres o cuatro dígitos— y
  // sólo se escribe si termina antes del primer escalón.
  const primerCambio = cambios[0]?.[0] ?? null;
  const notaX = X0 + 2 + anchoMono(cifras[0].txt, cuerpos.base, -0.02) + 14;
  const notaTramo = primerCambio !== null && primerCambio > 1
    ? notaQueEntra(notaX, x(primerCambio), [
        `sin cambios durante ${primerCambio} días`,
        `${primerCambio} días sin cambios`,
      ], cuerpos.t2xs)
    : null;

  const tipos: [string, string][] = [];
  const vistos = new Set<string>();
  for (const [, lista] of cambios) {
    for (const c of lista) {
      const pre = c.code.split("-")[0];
      if (vistos.has(pre) || !c.tipo) continue;
      vistos.add(pre);
      tipos.push([pre, c.tipo]);
    }
  }
  // Qué quiere decir cada prefijo de los chips, en el renglón del título y a
  // la derecha. Vivía en el renglón de los chips, contra el borde izquierdo,
  // que es donde cae el chip de un contrato que arranca mañana: «PUN-13» se
  // escribía encima de «PUN · PUNTA DE GÓNDOLA».
  const leyenda = leyendaQueEntra(
    X0 + anchoMono(TITULO, cuerpos.lbl, 0.16),
    X1,
    tipos.map(([pre, tipo]) => `${pre} · ${tipo.toUpperCase()}`),
    cuerpos.lbl, 0.16, 22,
  );

  /** De píxeles de pantalla a unidades del viewBox, con la matriz del SVG.
   *
   *  Acá había una regla de tres contra el rectángulo del elemento, y esa
   *  cuenta supone que el viewBox llena la caja. `getScreenCTM()` es la
   *  transformación real que aplicó el navegador, con el encaje y el centrado
   *  adentro. */
  const desdeEvento = (e: React.PointerEvent<SVGSVGElement>) => {
    // Tocar el gráfico lo deja con el foco: un clic en un SVG no lo enfoca solo
    // en Chromium, y sin foco las flechas del teclado no llegan acá.
    if (e.type === "pointerdown") e.currentTarget.focus({ preventScroll: true });
    const m = e.currentTarget.getScreenCTM();
    if (!m) return;
    const px = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
    const i = Math.round(((px - X0) / (X1 - X0)) * dias);
    setCursor(Math.max(0, Math.min(dias, i)));
  };

  return (
    <div ref={cajaRef} className="libera-caja">
      <svg
        viewBox={`0 0 ${f(ANCHO)} ${f(ALTO)}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        tabIndex={0}
        role="img"
        aria-label={`Espacios libres a lo largo del periodo: de ${serie[0]} a ${serie[dias]} al cerrar. Flechas izquierda y derecha para mover el cursor.`}
        onPointerMove={desdeEvento}
        onPointerDown={desdeEvento}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { setCursor(Math.max(0, iCursor - 1)); e.preventDefault(); }
          if (e.key === "ArrowRight") { setCursor(Math.min(dias, iCursor + 1)); e.preventDefault(); }
        }}
      >
        <text x={f(X0)} y="13" style={rot}>{TITULO}</text>
        {leyenda.map((r) => (
          <text key={r.txt} x={f(r.x)} y="13" style={tipoT}>{r.txt}</text>
        ))}

        {/* La temporada, detrás: explica por qué varias entregas caen juntas. */}
        {temporadas.map((t) => {
          const a = Math.max(0, Math.round((t.from.getTime() - fecha(0).getTime()) / 86400000));
          const b = Math.min(dias, Math.round((t.to.getTime() - fecha(0).getTime()) / 86400000));
          if (b <= a) return null;
          return (
            <g key={t.label}>
              <rect x={f(x(a))} y="26" width={f(x(b) - x(a))} height={f(YE - 26)}
                    fill="var(--entra)" opacity={0.09} />
              <text x={f((x(a) + x(b)) / 2)} y="38" style={temp}>{t.label.toUpperCase()}</text>
            </g>
          );
        })}

        <polygon points={poli([[X0, YE], ...pasos, [X1, YE]])} fill="var(--libre)" opacity={0.1} />
        <line x1={f(X0)} y1={f(YE)} x2={f(X1)} y2={f(YE)} stroke="var(--line-strong)" strokeWidth="1" />

        {/* Peine: un diente por día, más largo cada cinco. */}
        {Array.from({ length: dias + 1 }, (_, i) => (
          <line
            key={i}
            x1={f(x(i))} y1={f(YE)} x2={f(x(i))} y2={f(YE + (i % 5 === 0 || i === dias ? 5 : 2.5))}
            stroke="var(--line-strong)" strokeWidth="1" opacity={0.65}
          />
        ))}

        <polyline
          points={poli(pasos)}
          fill="none" stroke="var(--libre)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
        />
        <circle cx={f(x(0))} cy={f(y(serie[0]))} r="3.6" fill="var(--libre)" stroke="var(--surface)" strokeWidth="2" />
        {cambios.map(([i]) => (
          <circle key={i} cx={f(x(i))} cy={f(y(serie[i]))} r="3.6"
                  fill="var(--libre)" stroke="var(--surface)" strokeWidth="2" />
        ))}

        {/* La cifra de cada tramo, en vez de un eje vertical. Arranca donde
            arranca su tramo —no en el medio de la meseta— para quedar pegada a
            su escalón y no chocar con el anillo del cursor. */}
        {cifras.map((c, k) => cifraVisible[k] && (
          <text key={k} x={f(c.x)} y={f(c.y)} style={num}>{c.txt}</text>
        ))}
        {notaTramo && (
          <text x={f(notaX)} y={f(y(serie[0]) - 11)} style={nota}>{notaTramo}</text>
        )}

        {/* El cursor: una línea punteada y un anillo sobre el escalón. La
            lectura la escribe el encabezado del panel. */}
        <line x1={f(x(iCursor))} y1="26" x2={f(x(iCursor))} y2={f(YE)}
              stroke="var(--ink-1)" strokeWidth="1" strokeDasharray="2 3" opacity={0.55} />
        <circle
          data-cursor cx={f(x(iCursor))} cy={f(y(libresEn))}
          r="6.5" fill="none" stroke="var(--ink-1)" strokeWidth="1.6"
        />

        {/* Las fechas y, debajo, los códigos que se mueven en cada una. Cada
            fecha va con su columna: la que no entra se va con sus chips. */}
        {rotuloHoy && <text x={f(X0)} y={f(YE + 20)} style={hoy}>{rotuloHoy}</text>}
        {columnas.map(({ i, cx }) => (
          <text key={i} x={f(cx)} y={f(YE + 20)} style={fechaT} textAnchor="middle">
            {dm(fecha(i))}
          </text>
        ))}
        {columnas.map(({ i, cx }) => {
          const lista = porDia.get(i) ?? [];
          // Hay lugar para DOS renglones. Con tres o más códigos el segundo
          // renglón dice cuántos faltan —y los enciende en el plano—: un
          // tercer renglón se salía por abajo de la caja y no se veía nunca.
          const visibles = lista.length > 2 ? lista.slice(0, 1) : lista;
          const resto = lista.slice(visibles.length);
          return (
            <g key={i}>
              {visibles.map((c, j) => (
                <g
                  key={c.code}
                  /* Un contrato que ARRANCA saca el espacio del inventario: su
                     chip va con el color de «Tomado» y no con el de «Se libera»,
                     que es el que tenía y decía lo contrario. */
                  className={`gChip${c.sentido === "sale" ? " sale" : ""}${iCursor >= i ? " paso" : ""}`}
                  data-cod={c.code}
                  onMouseEnter={() => onResaltar?.([c.clave])}
                  onMouseLeave={() => onResaltar?.(null)}
                >
                  <title>{c.sentido === "sale"
                    ? `${c.code}: se ocupa el ${dm(fecha(i))}`
                    : `${c.code}: se libera el ${dm(fecha(i))}`}</title>
                  <rect
                    x={f(cx - CHIP_W / 2)} y={f(YE + 28 + j * 23)}
                    width={CHIP_W} height={CHIP_H} rx="9.5"
                  />
                  <text x={f(cx)} y={f(YE + 41.5 + j * 23)}>{c.code}</text>
                </g>
              ))}
              {resto.length > 0 && (
                <text
                  x={f(cx)} y={f(YE + 41.5 + 23)} textAnchor="middle" style={masT}
                  onMouseEnter={() => onResaltar?.(resto.map((c) => c.clave))}
                  onMouseLeave={() => onResaltar?.(null)}
                >
                  <title>{resto.map((c) => c.code).join(" · ")}</title>
                  +{resto.length} más
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Los cuerpos, tal como se renderizan ─────────────────────────────────────
// El viewBox es la caja, así que el SVG dibuja a escala 1 y estos cuerpos SON
// los píxeles finales: `--lbl-px` (10,5 — el cuerpo del rótulo de un plano),
// `--t-2xs` (11,5) y `--t-base` (15). Ninguno escrito a mano.

const rot: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: "var(--lbl-px)",
  letterSpacing: "0.16em", textTransform: "uppercase", fill: "var(--ink-3)",
};
const num: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontWeight: 700, fontSize: "var(--t-base)",
  letterSpacing: "-0.02em", fill: "var(--libre-txt)",
};
const nota: React.CSSProperties = { fontFamily: "var(--f-mono)", fontSize: "var(--t-2xs)", fill: "var(--ink-3)" };
/** «+2 más»: los códigos de una columna que no entran, contados. */
const masT: React.CSSProperties = { ...nota, fontWeight: 600, cursor: "default" };
const hoy: React.CSSProperties = { fontFamily: "var(--f-mono)", fontSize: "var(--t-2xs)", fontWeight: 700, fill: "var(--ink-2)" };
const fechaT: React.CSSProperties = { fontFamily: "var(--f-mono)", fontSize: "var(--t-2xs)", fill: "var(--ink-2)" };
const temp: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: "var(--lbl-px)",
  letterSpacing: "0.16em", fill: "var(--entra-txt)", textAnchor: "middle",
};
const tipoT: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: "var(--lbl-px)",
  letterSpacing: "0.16em", fill: "var(--ink-4)",
};
